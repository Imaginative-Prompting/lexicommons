// Recorded and device voices in one path, on a phone: a pack's recordings play from the library where it has them, and this device's voice says the rest, in one
// lesson's words and sentences; with no device voice, only recorded sentences are heard, and the rest have no speak button and no listening question. Nothing is heard: quiet-browser mutes all of it,
// and a press's sound is counted, not played. LOCAL only: path-nl seeded with its recordings (scripts/packs/seed-local.mjs packs/path-nl.json --default --audio <manifest> --clips <dir>).
// Usage: node scripts/voice-mix-check.mjs http://localhost:<port> <outDir>   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/voice-mix-check.mjs http://localhost:<port> <outDir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
let failed = 0;
const results = {};
const assert = (cond, what) => {
  if (!cond) throw new Error(what);
};
async function stage(name, fn) {
  try {
    const note = await fn();
    results[name] = { ok: true, note };
    console.log(`PASS ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    results[name] = { ok: false, note: String(error.stack ?? error) };
    console.log(`FAIL ${name}: ${error.message}`);
  }
}
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Voice Mix");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
await page.waitForSelector("html[data-app-ready]");
await page.evaluate(async () => {
  await (await import("/js/study/packs.js")).syncLibraryPacks();
});
// What plays: a recording's element, or the device's voice: counted, never heard.
const counting = () =>
  page.evaluate(() => {
    window.played = { clips: [], device: [] };
    if (!window.counted) {
      window.counted = true;
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        window.played.clips.push(this.currentSrc || this.src);
        return play.call(this);
      };
      const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (utterance) => {
        if (utterance.text) window.played.device.push(utterance.text);
        return speak(utterance);
      };
    }
  });
const sayOne = (id) =>
  page.evaluate(async (id) => {
    const voice = await import("/js/study/voice.js");
    const { itemById } = await import("/js/study/content.js");
    window.played.clips.length = 0;
    window.played.device.length = 0;
    const item = itemById.get(id);
    const hears = voice.hearsItem(item);
    const sound = voice.speakItem(item);
    await new Promise((r) => setTimeout(r, 300));
    sound?.stop?.();
    return { hears, clips: window.played.clips.filter((src) => !/silence/.test(src)).length, device: window.played.device.length };
  }, id);

let ids = null;
await stage("the path has its recordings for lessons up to 20, and only those", async () => {
  ids = await page.evaluate(async () => {
    const { pathLessons } = await import("/js/study/path.js");
    const { recordedVoiceFor } = await import("/js/study/voice.js");
    const lessons = pathLessons();
    const at = lessons.findIndex((lesson) => lesson.id.endsWith("/l020"));
    const has = (id) => Boolean(recordedVoiceFor(id, "nl", "path-nl")?.voice.items[id.replace("path-nl/", "")]);
    return { recorded: lessons[0].items[0], device: lessons[at + 1].items[0], last: lessons[at].id, nextLesson: lessons[at + 1].id, voices: recordedVoiceFor(lessons[0].items[0], "nl", "path-nl") ? ["a voice"] : [], allRecorded: lessons.slice(0, at + 1).every((lesson) => lesson.items.every(has)), hasNext: lessons[at + 1].items.some(has) };
  });
  assert(ids.allRecorded, "a sentence up to lesson 20 has no recording");
  assert(ids.voices.length >= 1, "no recordings on the device");
  assert(!ids.hasNext, "a sentence past lesson 20 has a recording");
  return JSON.stringify(ids);
});

await stage("with a device voice: a recorded sentence plays its recording, the next lesson's says itself with the device's voice", async () => {
  await counting();
  const recorded = await sayOne(ids.recorded);
  assert(recorded.hears && recorded.clips >= 1 && recorded.device === 0, `the recorded sentence: ${JSON.stringify(recorded)}`);
  const hasVoice = await page.evaluate(() => window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("nl")).length);
  if (!hasVoice) return `no Dutch voice in this browser: recorded ${JSON.stringify(recorded)}`;
  const device = await sayOne(ids.device);
  assert(device.hears && device.clips === 0 && device.device >= 1, `the unrecorded sentence: ${JSON.stringify(device)}`);
  return `recorded ${JSON.stringify(recorded)}; device ${JSON.stringify(device)}`;
});

await stage("with no device voice: recorded sentences are heard, the rest have no listening question and no speak button", async () => {
  await page.addInitScript(() => {
    window.speechSynthesis.getVoices = () => [];
  });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const plans = await page.evaluate(async ({ next }) => {
    await (await import("/js/study/session.js"));
    const { planSession } = await import("/js/study/plan.js");
    const voice = await import("/js/study/voice.js");
    const { pathLessons } = await import("/js/study/path.js");
    const heard = (plan) => plan.steps.filter((step) => step.kind === "listen" || step.kind === "repeat");
    const first = planSession("lesson", pathLessons()[0].id);
    const after = planSession("lesson", next);
    return { first: heard(first).length, firstHeard: heard(first).every((step) => voice.hearsItem(step.item)), after: heard(after).length, questions: [first.steps.length, after.steps.length] };
  }, { next: ids.nextLesson });
  assert(plans.first >= 1 && plans.firstHeard, `lesson 1, recorded, has no listening: ${JSON.stringify(plans)}`);
  assert(plans.after === 0, `an unrecorded lesson asks by ear: ${JSON.stringify(plans)}`);
  await page.evaluate((id) => (location.hash = `#study/session/lesson/${encodeURIComponent(id)}`), ids.nextLesson);
  await page.waitForSelector('[data-part="session"]');
  await page.waitForFunction(() => document.querySelector('[data-part="session"]')?.lxStep);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/no-voice-unrecorded.png` });
  assert(!(await page.locator('[data-part="activity"] [data-part="speak-button"]').count()), "a speak button that can't speak");
  return JSON.stringify(plans);
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.slice(0, 3).join(" | "));
});
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
await page.evaluate(async () => {
  await fetch("/account/delete", { method: "POST" }).catch(() => {});
}).catch(() => {});
await browser.close();
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} passed`);
process.exit(failed ? 1 : 0);
