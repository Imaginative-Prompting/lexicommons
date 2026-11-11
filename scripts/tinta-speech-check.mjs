// Tinta speaking (the speech drivers: docs/design-system.md, "Tinta speaks"), in headless Chrome on /design's demo,
// through study/voice.js as the app plays sentences:
// - a recording: the mouth opens on every word at the manifest's times, the loudness read from the file itself, and
//   rests after; the control, the same measure on a Tinta that doesn't speak, fails;
// - a press that stops the sound closes the mouth at once;
// - a device voice (a stand-in engine that reports a boundary for each word): the mouth's clock runs on the estimate
//   and jumps to each word as the voice reaches it;
// - with animations off: its still, the mouth never moving, while the sound still plays.
// Every browser comes from quiet-browser.mjs: the recording plays muted, and the device voice is a stand-in.
//
// Usage (headless Chrome, so through gpu.py's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta speech check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/tinta-speech-check.mjs <baseUrl> <outDir>      (exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { estimateWords } from "../public/js/character/rig/kit/speech.js";

const [BASE, outArg = "tinta-speech-check-out"] = process.argv.slice(2);
const OUT = resolve(outArg);
if (!BASE) {
  console.error("usage: node scripts/tinta-speech-check.mjs <baseUrl> <outDir>");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
const problems = [];
let failed = 0;
async function stage(name, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - t, detail });
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    results.push({ stage: name, ok: false, ms: Date.now() - t, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
// With "check.fake-voice" set for the tab: a device voice that only records, and reports a boundary at each word every
// 400 ms (the quiet browser's stand-in reports none), as lang-check's fake does.
await context.addInitScript(() => {
  if (!sessionStorage.getItem("check.fake-voice")) return;
  const voices = [{ name: "Fake Xander", lang: "nl-NL", voiceURI: "fake-xander", localService: true, default: false }];
  window.__boundaries = [];
  let timers = [];
  const fake = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => voices,
    speak(u) {
      fake.speaking = true;
      timers.push(setTimeout(() => {
        u.onstart?.({});
        const words = [...String(u.text).matchAll(/\S+/g)];
        words.forEach((m, i) =>
          timers.push(setTimeout(() => {
            window.__boundaries.push({ i, at: performance.now() });
            u.onboundary?.({ name: "word", charIndex: m.index });
          }, 50 + 400 * i)),
        );
        timers.push(setTimeout(() => {
          fake.speaking = false;
          u.onend?.({});
        }, 50 + 400 * words.length));
      }, 10));
    },
    cancel() {
      timers.forEach(clearTimeout);
      timers = [];
      fake.speaking = false;
    },
    pause() {},
    resume() {},
    addEventListener() {},
    removeEventListener() {},
  };
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      Object.assign(this, { text, lang: "", voice: null, rate: 1, pitch: 1, volume: 1 });
    }
  };
  Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
});
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));

const SPEAKER = ".ds-character-speaker";
async function openDesign({ fakeVoice = false, motionOff = false } = {}) {
  await page.goto(`${BASE}/design/`);
  await page.evaluate(({ fakeVoice, motionOff }) => {
    if (fakeVoice) sessionStorage.setItem("check.fake-voice", "1");
    else sessionStorage.removeItem("check.fake-voice");
    if (motionOff) localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, presets: { motion: "off" } }));
    else localStorage.removeItem("lx.appearance.v1");
  }, { fakeVoice, motionOff });
  await page.reload();
  await page.waitForSelector(`${SPEAKER} svg`);
  await page.locator(SPEAKER).scrollIntoViewIfNeeded();
}

/** Samples, every frame for up to `ms`, what a Tinta's mouth is doing and its drawing's length (until it's spoken and stopped). */
const sample = (selector, ms, { untilQuiet = true } = {}) =>
  page.evaluate(async ({ selector, ms, untilQuiet }) => {
    const node = document.querySelector(selector);
    const out = [];
    const t0 = performance.now();
    let spoke = false;
    while (performance.now() - t0 < ms) {
      await new Promise((r) => requestAnimationFrame(r));
      const s = node.speaking;
      out.push({ now: performance.now(), s: s && { ...s }, svg: node.querySelector("svg")?.innerHTML.length ?? 0, drawing: node.querySelector("svg")?.innerHTML ?? "" });
      if (s) spoke = true;
      if (untilQuiet && spoke && !s && out.length > 3) break;
    }
    return out.map(({ drawing, ...rest }, i) => ({ ...rest, changed: i > 0 && drawing !== out[i - 1].drawing }));
  }, { selector, ms, untilQuiet });

/**
 * The measure: every word's frames open the mouth (it leads the sound by 35 ms). A busy machine can drop every frame of
 * a short word (a 0.26 s gap once swallowed "naar"), so a word no frame landed on is reported, and at most one may be.
 */
function opensOnEveryWord(samples, spans) {
  const speaking = samples.filter((x) => x.s);
  const perWord = spans.map(([start, end]) => {
    const frames = speaking.filter((x) => x.s.t >= start - 0.035 && x.s.t <= end);
    return frames.length ? Math.max(...frames.map((x) => x.s.open)) : null;
  });
  const seen = perWord.filter((o) => o !== null);
  return { perWord, unseen: perWord.length - seen.length, ok: speaking.length > 10 && seen.length >= spans.length - 1 && seen.every((o) => o > 0.1) };
}
const shown = (perWord) => perWord.map((o) => (o === null ? "unseen" : o.toFixed(2))).join(" ");

await stage("a recording: the mouth opens on every word at the manifest's times, the loudness read from the file; the control fails", async () => {
  await openDesign();
  const button = page.locator('[data-say="recording"] button');
  await button.waitFor();
  const label = await page.locator('[data-say="recording"] .lx-small').textContent();
  const name = label.match(/\(([^)]+)\)/)?.[1];
  const manifest = await page.evaluate(() => fetch("/audio/starter-word-order/manifest.json").then((r) => r.json()));
  const recorded = Object.values(manifest.voices).find((v) => v.name === name);
  assert(recorded, `the demo's recording (${label}) should be one of the starter's voices`);
  const spans = recorded.items["morgen-oma"].words;
  await button.click();
  // A picture mid-sentence, to look at (the mouth on a word).
  const shot = (async () => {
    await page.waitForTimeout(500);
    await page.locator(SPEAKER).screenshot({ path: join(OUT, "speaking.png") });
  })();
  const [samples, control] = await Promise.all([sample(SPEAKER, 9000), sample(".ds-character-stage lx-tinta:not([data-speaks])", 3000, { untilQuiet: false })]);
  await shot;
  writeFileSync(join(OUT, "recording-samples.json"), JSON.stringify(samples.filter((x) => x.s), null, 1));
  const speaking = samples.filter((x) => x.s);
  const measure = opensOnEveryWord(samples, spans);
  const ctl = opensOnEveryWord(control, spans);
  assert(speaking.length > 10 && speaking.every((x) => x.s.kind === "recording" && x.s.words === spans.length), `it should say the recording's ${spans.length} words: ${JSON.stringify(speaking[0]?.s)}`);
  assert(speaking.some((x) => x.s.loudness), "its loudness should arrive, read from the file");
  assert(measure.ok, `every word should open the mouth: ${shown(measure.perWord)}`);
  assert(speaking.filter((x) => x.changed).length > speaking.length * 0.5, "its drawing should change as it speaks");
  assert(!samples.at(-1).s, "it should rest once the recording is over");
  assert(!ctl.ok, "control: the same measure on a Tinta that doesn't speak must fail");
  return `${speaking.length} frames on ${spans.length} words, each opening it (${shown(measure.perWord)}); loudness from the file; at rest after; the control fails`;
});

await stage("a press that stops the sound closes the mouth at once", async () => {
  const button = page.locator('[data-say="recording"] button');
  await button.click();
  const speakingBefore = await page.evaluate(async () => {
    const node = document.querySelector(".ds-character-speaker");
    const t0 = performance.now();
    while (!(node.speaking?.t > 0.4) && performance.now() - t0 < 5000) await new Promise((r) => requestAnimationFrame(r));
    return node.speaking?.t > 0.4;
  });
  assert(speakingBefore, "it should be speaking (0.4 s in) before the press");
  // The press's own moment, in the page (the click event), and the first frame the mouth is shut after it.
  await page.evaluate(() => document.querySelector('[data-say="recording"] button').addEventListener("click", () => (window.__pressAt = performance.now()), { capture: true, once: true }));
  await button.click();
  const { pressAt, closedAt } = await page.evaluate(async () => {
    const node = document.querySelector(".ds-character-speaker");
    const t0 = performance.now();
    while (node.speaking && performance.now() - t0 < 2000) await new Promise((r) => requestAnimationFrame(r));
    return { pressAt: window.__pressAt, closedAt: node.speaking ? null : performance.now() };
  });
  assert(pressAt != null, "the press should reach the button");
  assert(closedAt != null && closedAt - pressAt < 80, `the mouth should close at once (${closedAt == null ? "never" : `${Math.round(closedAt - pressAt)} ms`} after the press)`);
  return `closed ${Math.round(closedAt - pressAt)} ms after the press`;
});

await stage("a device voice: its words estimated, the mouth's clock put right as the voice reaches each word", async () => {
  await openDesign({ fakeVoice: true });
  const button = page.locator('[data-say="device"] button');
  await button.waitFor();
  await button.click();
  const samples = await sample(SPEAKER, 6000);
  const boundaries = await page.evaluate(() => window.__boundaries);
  writeFileSync(join(OUT, "device-samples.json"), JSON.stringify({ samples: samples.filter((x) => x.s), boundaries }, null, 1));
  const words = estimateWords(["Morgen", "gaan", "we", "naar", "oma"]);
  const speaking = samples.filter((x) => x.s);
  assert(speaking.length > 10 && speaking.every((x) => x.s.kind === "device" && x.s.words === 5), `it should say the device voice's 5 words: ${JSON.stringify(speaking[0]?.s)}`);
  assert(boundaries.length === 5, `the voice should report 5 boundaries: ${boundaries.length}`);
  // After the voice reaches word i (and before the next), the clock runs from that word's estimated start, held at its end.
  const off = [];
  for (const [k, b] of boundaries.entries()) {
    const next = boundaries[k + 1]?.at ?? Infinity;
    const after = speaking.filter((x) => x.s.at > b.at && x.s.at < Math.min(next, b.at + 300));
    assert(after.length, `no frames after the boundary at word ${b.i}`);
    for (const x of after) {
      const want = Math.min(words[b.i].start + (x.s.at - b.at) / 1000, words[b.i].end);
      off.push(Math.abs(x.s.t - want));
    }
  }
  const worst = Math.max(...off);
  assert(worst < 0.02, `the clock should follow each boundary: off by up to ${worst.toFixed(3)} s`);
  assert(speaking.some((x) => x.s.open > 0.3), "the mouth should open");
  assert(!samples.at(-1).s, "it should rest once the voice is done");
  return `${speaking.length} frames; at each of 5 boundaries the clock jumped to its word (off by ${(worst * 1000).toFixed(1)} ms at most)`;
});

await stage("with animations off: its still, the mouth never moving, while the sound plays", async () => {
  await openDesign({ motionOff: true });
  const button = page.locator('[data-say="recording"] button');
  await button.waitFor();
  await button.click();
  const playing = await page.evaluate(async () => {
    // voice.js's own state (its audio element isn't in the document): the same module design.js imported.
    const voice = await import("/js/study/voice.js");
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) {
      const state = voice.playbackState();
      if (!state.paused && state.time > 0.2) return true;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return false;
  });
  const samples = await sample(SPEAKER, 1500, { untilQuiet: false });
  await button.click();
  await openDesign();
  assert(playing, "the recording should still play for the learner");
  assert(samples.every((x) => !x.s), "the mouth should never speak");
  assert(samples.every((x) => !x.changed), `its drawing should hold still: ${samples.filter((x) => x.changed).length} changes`);
  return `the recording played; ${samples.length} frames, the still unchanged`;
});

await stage("no console errors", async () => {
  assert(problems.length === 0, problems.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "tinta-speech-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
console.log(`${results.filter((r) => r.ok).length}/${results.length} stages passed`);
process.exit(failed ? 1 : 0);
