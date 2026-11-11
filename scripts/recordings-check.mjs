#!/usr/bin/env node
// A library pack's recordings when a new version goes out before them (library_publish takes a pack and its audio one at
// a time, so the catalog lists the new version without recordings for a while), on a phone, muted: what "Ja, graag."
// plays (path-nl l002-n1: a clip, or the device's voice) at each step. The catalog and the new version's files are
// routes in the browser over the local library, which has path-nl and its recordings seeded; nothing else changes.
//   1. A phone that started in that while has no recordings: when the app comes back into view, the recordings that
//      came meanwhile arrive, without a restart (study/packs.js syncRecordings).
//   2. A phone that had the version before keeps the recordings of every sentence the new version says word for word
//      (ensure, syncAudio), and the one it changed is read by the device's voice; its own recordings, when they come,
//      have that one too.
// Through quiet-browser.mjs: media muted, speechSynthesis replaced, nothing heard.
//   node scripts/recordings-check.mjs http://localhost:<port> <outDir> [chromium|webkit]
// The server: path-nl seeded with its recordings (scripts/packs/seed-local.mjs packs/path-nl.json --audio <manifest>
// --clips <dir> --default). LOCAL only. Exit 0 = every stage passed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "./quiet-browser.mjs";
import { checkPack, packVersion } from "../public/js/study/pack-format.js";

const [BASE, outArg, engine = "chromium"] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE ?? "") || !OUT || !["chromium", "webkit"].includes(engine)) {
  console.error("Usage: node scripts/recordings-check.mjs http://localhost:<port> <outDir> [chromium|webkit] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}));
const seeded = (catalogue.packs?.nl ?? []).find((pack) => pack.id === "path-nl");
if (!seeded?.audio) {
  console.error("recordings-check: the local library doesn't list path-nl with recordings; seed it with --audio first.");
  process.exit(2);
}

// The next version: "Ja, graag." becomes "Ja, graag hoor.", and nothing else changes. Its own recordings: the first
// version's, with that sentence recorded for its three words.
const raw = JSON.parse(readFileSync(join(APP, "packs/path-nl.json"), "utf8"));
if ((await packVersion(checkPack(raw).pack)) !== seeded.version) {
  console.error(`recordings-check: packs/path-nl.json isn't the seeded version (${seeded.version}); seed this copy's.`);
  process.exit(2);
}
const next = structuredClone(raw);
const changed = next.items.find((item) => item.id === "l002-n1");
changed.words = [...changed.words, ["hoor"]];
delete changed.text;
const checkedNext = checkPack(next);
if (!checkedNext.pack) throw new Error(`the next version doesn't pass: ${JSON.stringify(checkedNext.errors.slice(0, 2))}`);
const V2 = await packVersion(checkedNext.pack);
const AUDIO_V2 = seeded.audio.replace(`/packs/path-nl/${seeded.version}/`, `/packs/path-nl/${V2}/`);
const manifestV1 = await (await fetch(`${BASE}${seeded.audio}`)).json();
const manifestV2 = structuredClone(manifestV1);
for (const voice of Object.values(manifestV2.voices)) {
  const was = voice.items["l002-n1"];
  voice.items["l002-n1"] = { ...was, words: [...was.words, [Math.max(was.words.at(-1)[0], was.seconds - 0.1), was.seconds]] };
}

const results = [];
let failed = 0;
async function stage(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`PASS ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    results.push({ name, ok: false, note: String(error.stack ?? error) });
    console.log(`FAIL ${name}: ${error.message}`);
  }
}
const assert = (cond, what) => {
  if (!cond) throw new Error(what);
};

async function signUp() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Recordings Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  const cookies = await context.cookies(BASE);
  await browser.close();
  return cookies;
}

// In the page: every play() and every speak, what they were for.
const LOG = () => {
  const log = (window.__heard = []);
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    log.push({ what: "clip", src: this.currentSrc || this.src });
    return play.call(this);
  };
  const synth = window.speechSynthesis;
  const speak = synth.speak.bind(synth);
  synth.speak = (utterance) => {
    if (utterance.text) log.push({ what: "device", text: utterance.text });
    return speak(utterance);
  };
};
// What a line plays now: "clip" (with its file) or "device" (with what it said), and the recordings held.
const PLAY = async (id) => {
  const { itemById } = await import("/js/study/content.js");
  const voice = await import("/js/study/voice.js");
  const { packAudio } = await import("/js/study/packs.js");
  window.__heard.length = 0;
  const ctl = voice.speakItem(itemById.get(`path-nl/${id}`));
  if (ctl) await Promise.race([ctl.done, new Promise((r) => setTimeout(r, 4000))]);
  ctl?.stop?.();
  const audio = packAudio("path-nl");
  const heard = window.__heard.splice(0);
  return { heard: heard[0]?.what ?? "nothing", detail: heard[0]?.src ?? heard[0]?.text ?? null, recorded: audio ? Object.keys(Object.values(audio.voices)[0]?.items ?? {}).length : 0 };
};

const cookies = await signUp();
const browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: true });
/** A phone, with the catalog as `state.now` says: "v1" (as seeded), "v2-bare" (the next version, no recordings) or "v2" (with them). */
async function phone() {
  const state = { now: "v1" };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", hasTouch: true, isMobile: engine === "chromium" });
  await context.addCookies(cookies);
  await context.addInitScript(LOG);
  await context.route("**/library/catalogue.json", async (route) => {
    const response = await route.fetch();
    const now = await response.json();
    const entry = now.packs.nl.find((one) => one.id === "path-nl");
    if (state.now !== "v1") {
      entry.version = V2;
      entry.url = `/library/packs/path-nl/${V2}/pack.json`;
      if (state.now === "v2") entry.audio = AUDIO_V2;
      else delete entry.audio;
    }
    await route.fulfill({ response, json: now });
  });
  await context.route(`**/library/packs/path-nl/${V2}/pack.json`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(next) }));
  await context.route(`**/library/packs/path-nl/${V2}/audio.*.json`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifestV2) }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const start = async () => {
    await page.goto(`${BASE}/app/`);
    await page.waitForSelector("html[data-app-ready]");
    await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  };
  // Back into view: what a phone does when the app is opened again from the background.
  const foreground = () =>
    page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  return { state, context, page, errors, start, foreground, play: (id) => page.evaluate(PLAY, id) };
}

await stage("a phone that started while the new version had no recordings hears them once the app comes back into view (no restart)", async () => {
  const p = await phone();
  p.state.now = "v2-bare";
  await p.start();
  const before = await p.play("l002-n2");
  assert(before.heard === "device" && before.recorded === 0, `before: ${JSON.stringify(before)} (the setup: no recordings yet)`);
  p.state.now = "v2";
  await p.page.waitForTimeout(500);
  await p.foreground();
  let after = null;
  for (let i = 0; i < 20; i++) {
    await p.page.waitForTimeout(250);
    after = await p.play("l002-n2");
    if (after.heard === "clip") break;
  }
  assert(after.heard === "clip" && /\/library\/audio\/[0-9a-f]{16}\.mp3$/.test(after.detail), `after coming back into view: ${JSON.stringify(after)}`);
  const changedNow = await p.play("l002-n1");
  assert(changedNow.heard === "clip", `the changed sentence, with its own recording: ${JSON.stringify(changedNow)}`);
  assert(!p.errors.length, `page errors: ${p.errors}`);
  await p.context.close();
  return `before ${before.heard}, after ${after.heard} (${after.recorded} recorded)`;
});

await stage("a phone with the version before keeps the recordings of every sentence the new one says word for word; the changed one is the device's until its own come", async () => {
  const p = await phone();
  await p.start();
  const v1 = await p.play("l002-n2");
  assert(v1.heard === "clip", `the first version: ${JSON.stringify(v1)}`);
  p.state.now = "v2-bare";
  await p.start();
  const kept = await p.play("l002-n2");
  assert(kept.heard === "clip", `"Nee, dank je." after the new version arrived without recordings: ${JSON.stringify(kept)}`);
  const lost = await p.play("l002-n1");
  assert(lost.heard === "device" && /hoor/.test(lost.detail ?? ""), `"Ja, graag hoor." (changed): ${JSON.stringify(lost)}`);
  assert(kept.recorded === v1.recorded - 1, `recorded: ${v1.recorded} → ${kept.recorded}`);
  p.state.now = "v2";
  await p.start();
  const own = await p.play("l002-n1");
  assert(own.heard === "clip", `with its own recordings: ${JSON.stringify(own)}`);
  assert(!p.errors.length, `page errors: ${p.errors}`);
  await p.context.close();
  return `${v1.recorded} recorded → ${kept.recorded} kept → ${own.recorded}`;
});

await browser.close();
writeFileSync(join(OUT, `results-${engine}.json`), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
