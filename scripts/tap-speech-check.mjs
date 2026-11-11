// A word you tap in a game is said as you tap it (Settings → Sound and speech → Say the words you tap; study/voice.js speakTapped, session.js sayTapped), in
// Chrome on a phone, muted: the check reads what the page ASKS to be said (speechSynthesis.speak's text, the recording an <audio> plays, a
// stop between them), never a sound. Put it in order: each tile said as it goes in, at once, a word with a recording as its clip and another
// by the device's voice, a second tap at once stopping the first, a tile sent back and English tiles saying nothing; Listening's order: a
// tile tapped while its sentence plays saying nothing and stopping nothing (a tapped word never cuts off a sentence), each said once it's over. A tap that answers (Fill the gap, Pick the word, Choose): with Answers on no word by itself, the answer's sentence or word after
// it; with Answers off the word you tapped. Match: its words in the language, not their English. A word tapped for its meaning. Off:
// the switch, a device that turned Match off before (Words you tap off too), Can't listen now; Settings → Sound and speech with one switch,
// Say the words you tap, and no Match, at 390 dark. The games' sound effects asked for (lx/sound.js's lx-sound events, played or not): a tile in and out, right or
// wrong at an answer (none on I don't know) before the word it says, Match's pairs a step each, the last its own, a miss. LOCAL only, path-nl seeded (seed-local.mjs --default).
// Recordings: a word that has one is said by its clip, either the app's own (public/audio/starter-word-order, <voice>/w-<word>.mp3) or the
// library's (/library/audio/<sha>.mp3, as npm run local seeds the starter's and the live library serves a published pack's), a library clip
// matched to its word through the audio manifest of a Dutch default pack in the server's catalog; the device's voice only for a word with none.
// Usage: node scripts/tap-speech-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { knowWords } from "./fixtures/know-words.mjs";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const ONLY = opt("only") && new RegExp(opt("only"));
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/tap-speech-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
const opened = []; // the phones a stage opened: photographed if it fails, then closed
async function stage(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    // What the screen showed when it failed, beside the log.
    const page = opened.at(-1)?.pages()[0];
    if (page && !page.isClosed()) {
      const n = results.length + 1;
      await page.screenshot({ path: join(OUT, `fail-${n}.png`) }).catch(() => {});
      const shown = await page.evaluate((S) => document.querySelector(S)?.innerText ?? document.body.innerText, '[data-part="session"]:not([data-ghost])').catch(() => "");
      writeFileSync(join(OUT, `fail-${n}.txt`), `${error.stack ?? error}\n\n${shown}`);
    }
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").slice(0, 12).join("\n        ")}`);
  } finally {
    for (const context of opened.splice(0)) await context.close().catch(() => {});
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
};
const run = randomBytes(3).toString("hex");
function account(name) {
  const id = `ts${run}${randomBytes(5).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const now = Date.now();
  sql([
    `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'tap-speech-check')`,
  ].join("; "));
  return { id, cookie };
}

// The words the app's own recordings say by themselves (the starter's manifest: every voice's), each a clip at <voice>/w-<word>.mp3.
const MANIFEST = JSON.parse(readFileSync(join(APP, "public/audio/starter-word-order/manifest.json"), "utf8"));
const OWN = new Set(Object.values(MANIFEST.voices).flatMap((voice) => Object.keys(voice.words ?? {})));
// And the library's: a pack's published recordings, each clip named by its bytes at /library/audio/<clip>, as the device plays them once its
// pack's catalog entry names them (study/pack-audio.js readAudio). The Dutch default packs' manifests, read from the server: a clip's path ->
// the words it says. A learner here has only the default packs, so an opt-in pack's recordings are left out.
async function libraryClips() {
  const clips = new Map();
  const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json();
  for (const entry of catalogue.packs?.nl ?? []) {
    if (entry.optIn || !entry.audio) continue;
    const manifest = await (await fetch(`${BASE}${entry.audio}`)).json();
    for (const voice of Object.values(manifest.voices ?? {})) {
      for (const [word, e] of Object.entries(voice.words ?? {})) {
        if (!e?.clip) continue;
        const path = `/library/audio/${e.clip}`;
        clips.set(path, new Set([...(clips.get(path) ?? []), word]));
      }
    }
  }
  return clips;
}
const LIBRARY = await libraryClips();
const CLIPPED = new Set([...OWN, ...[...LIBRARY.values()].flatMap((words) => [...words])]);
const clipFor = (word) => [word, word.toLocaleLowerCase("nl")].find((form) => CLIPPED.has(form)) ?? null;
// What a word's recording is, for a failure's words: the app's own file and the library's clip, where each has one.
const recordingOf = (clip) =>
  [OWN.has(clip) ? `w-${clip}.mp3` : null, ...[...LIBRARY].filter(([, words]) => words.has(clip)).map(([path]) => `the library's ${path.split("/").slice(-2).join("/")}`)]
    .filter(Boolean)
    .join(" or ");

const PAGE = '[data-part="page"]';
const SESSION = '[data-part="session"]:not([data-ghost])';
const BANK = `${SESSION} [data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])`;
const PLACED = `${SESSION} [data-part="arrange-answer"] [data-part="tile"]:not([data-drop])`;
// How soon after the tap the word is asked for: it's asked in the tap's own task, so this is only room for a busy machine.
const AT_ONCE_MS = 100;

// In the page, after quiet-browser.mjs's silence: every ask to say something, with its time. Nothing here makes a sound: speak() is the
// silent stand-in's, and every <audio> is muted by it.
const CAPTURE = () => {
  const said = (window.lxSaid = []);
  const now = () => performance.now();
  const synth = window.speechSynthesis;
  if (!synth?.silent) {
    window.lxNotSilent = true;
    return;
  }
  const speak = synth.speak.bind(synth);
  const cancel = synth.cancel.bind(synth);
  // The first press anywhere unlocks sound for iPhone (voice.js unlockAudio: an empty utterance, a silent clip): not something said.
  synth.speak = (utterance) => {
    const text = String(utterance.text);
    said.push(text.trim() ? { t: now(), kind: "device", text } : { t: now(), kind: "unlock" });
    return speak(utterance);
  };
  synth.cancel = () => {
    said.push({ t: now(), kind: "stop" });
    return cancel();
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = Object.assign(
    function () {
      const src = String(this.src);
      said.push(src.endsWith("/audio/silence.mp3") ? { t: now(), kind: "unlock" } : { t: now(), kind: "clip", src });
      return play.call(this);
    },
    { silent: true },
  );
  const pause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function () {
    said.push({ t: now(), kind: "stop" });
    return pause.call(this);
  };
  addEventListener("lx-sound", (event) => said.push({ t: now(), kind: "effect", ...event.detail }));
};

const browser = await chromium.launch();
/** A phone of a new account that knows its words, its study settings as given (lx.study.v1, as a device saved them). */
async function phone({ study = {}, theme = "graphite", width = 390, height = 844 } = {}) {
  const who = account(`Tap speech ${run} ${theme}`);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true });
  opened.push(context);
  await context.addCookies([{ name: "lc_session", value: who.cookie, url: BASE, httpOnly: true, secure: false, sameSite: "Lax" }]);
  await context.addInitScript(
    ({ theme, study }) => {
      try {
        if (!localStorage.getItem("lx.appearance.v1")) localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme, presets: {} }));
        if (!localStorage.getItem("lx.study.v1")) localStorage.setItem("lx.study.v1", JSON.stringify(study));
      } catch {}
    },
    { theme, study },
  );
  await context.addInitScript(CAPTURE);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  assert(!(await page.evaluate(() => window.lxNotSilent)), "speech isn't quiet-browser.mjs's silent stand-in: refusing to tap anything");
  // The lessons' pack in, and its words known, so a game asks whole sentences.
  for (let i = 0; i < 120 && !(await page.evaluate(async () => (await import("/js/study/content.js")).LESSONS.length > 100)); i++) await page.waitForTimeout(500);
  await knowWords(page);
  return { context, page, errors };
}
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const now = (page) => page.evaluate(() => performance.now());
const saidSince = (page, t) => page.evaluate((t) => window.lxSaid.filter((entry) => entry.t >= t), t);
const asks = (entries) => entries.filter((entry) => entry.kind === "device" || entry.kind === "clip");
const describe = (entries) => entries.map((e) => (e.kind === "device" ? `say "${e.text}"` : e.kind === "clip" ? `clip ${e.src.split("/").slice(-2).join("/")}` : e.kind)).join(", ") || "nothing";
// Whether an ask says this word: its recording (either voice's) where there is one, else the device's voice reading it as written.
function saysWord(entry, word) {
  const clip = clipFor(word);
  if (clip) return entry.kind === "clip" && (entry.src.endsWith(`/w-${clip}.mp3`) || LIBRARY.get(new URL(entry.src, BASE).pathname)?.has(clip) === true);
  return entry.kind === "device" && entry.text === word;
}
/**
 * Taps a node (its click, as a tap ends: real touch is frame-check's, press) and returns what was asked from the tap on, after `wait` ms.
 * The tap's time is taken in the page, as the click goes.
 */
async function tapAndHear(page, locator, wait = 300) {
  // The word read off the very node tapped, in the same turn (the first tile now may not be the first tile a moment later).
  const { t, word } = await locator.evaluate((node) => {
    const at = performance.now();
    const word = node.dataset.word ?? node.textContent.trim();
    node.click();
    return { t: at, word };
  });
  await settle(page, wait);
  return { t, word, entries: await saidSince(page, t) };
}
// The games' sound-effect requests (lx/sound.js "lx-sound" events), and their roles as asked (match:<step>).
const effects = (entries) => entries.filter((e) => e.kind === "effect");
const roles = (entries) => effects(entries).map((e) => (e.step ? `${e.role}:${e.step}` : e.role));
// How long a word may wait after its tap: at once, or, on a tap that answers, once the answer's effect has passed (its own clearAfter).
const allowance = (heard) => {
  const fx = effects(heard.entries).find((e) => /^(right|wrong)$/.test(e.role) && e.played);
  return AT_ONCE_MS + (fx ? fx.clearAfter * 1000 : 0);
};
function expectWord(heard, word = heard.word, what = "a tap") {
  const first = asks(heard.entries)[0];
  assert(first, `${what}: "${word}" was tapped and nothing was asked to be said`);
  assert(saysWord(first, word), `${what}: "${word}" was tapped, and the first thing asked was ${describe([first])}${clipFor(word) ? ` (it has a recording: ${recordingOf(clipFor(word))})` : ""}`);
  assert(first.t - heard.t <= allowance(heard), `${what}: "${word}" asked ${Math.round(first.t - heard.t)} ms after the tap (at once is under ${allowance(heard)} ms)`);
  return first.kind;
}
const expectNothing = (heard, what) => assert(!asks(heard.entries).length, `${what}: asked ${describe(asks(heard.entries))}`);
const step = (page) => page.evaluate((S) => {
  const s = document.querySelector(S)?.lxStep;
  return s ? { kind: s.kind, game: s.game, item: s.item ? { id: s.item.id, words: s.item.words.map(([text]) => text), punct: s.item.punct ?? "" } : null, options: s.options ?? null, correct: s.correct ?? null } : null;
}, SESSION);
// A new session of one game, its settings read afresh: a reload (going to the same address changes only its hash, and nothing starts again).
async function open(page, game) {
  await page.goto(`${BASE}/app/#study/session/game/${game}`);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.waitForSelector(SESSION, { timeout: 20_000 });
  await settle(page, 500);
}
// Answer what's on the screen any way at all, then Continue: the next question, or false at the end.
async function next(page) {
  await page.evaluate((S) => (window.lxStepBefore = document.querySelector(S)?.lxStep ?? null), SESSION);
  const check = page.locator(`${SESSION} button`, { hasText: /^Check$/ }).first();
  if (await check.isVisible().catch(() => false)) await check.click();
  const skip = page.locator(`${SESSION} button`, { hasText: "I don't know" }).first();
  if (!(await page.locator(`${SESSION} button`, { hasText: /^(Continue|See how it went)$/ }).first().isVisible().catch(() => false)) && (await skip.isVisible().catch(() => false))) await skip.click();
  const go = page.locator(`${SESSION} button`, { hasText: /^(Continue|See how it went)$/ }).first();
  await go.waitFor({ state: "visible", timeout: 5000 });
  const last = /See how it went/.test(await go.innerText());
  await go.click();
  if (last) return false;
  await page.waitForFunction((S) => {
    const s = document.querySelector(S)?.lxStep;
    return s && s !== window.lxStepBefore;
  }, SESSION, { timeout: 8000 });
  await settle(page, 400);
  return true;
}
// Until nothing plays (a sentence over, a word over), up to 12 s.
async function untilQuiet(page) {
  for (let i = 0; i < 120; i++) {
    const state = await page.evaluate(async () => (await import("/js/study/voice.js")).playbackState());
    if ((state.paused || !state.src) && !state.device) return;
    await page.waitForTimeout(100);
  }
  throw new Error("something still playing after 12 s");
}
const sentenceOf = (s) => (s.item ? s.item.words.join(" ") + s.item.punct : null);

// The matcher's controls, before any phone: a word's own clip and its library clip say it; another word's clip, a library clip that isn't
// this word's, and the device's voice where the word has a recording don't. Each would let a wrong word through if the matcher were looser.
await stage("which clip says a word: the app's own or the library's (by its pack's audio manifest); another word's clip, or the device's voice where a recording exists, never", async () => {
  const clip = (path) => ({ kind: "clip", src: `${BASE}${path}` });
  const own = [...OWN].slice(0, 2);
  assert(own.length === 2, "the starter's manifest has under two words with recordings");
  assert(saysWord(clip(`/audio/starter-word-order/v/w-${own[0]}.mp3`), own[0]), `PLANT: "${own[0]}"'s own clip not taken`);
  assert(!saysWord(clip(`/audio/starter-word-order/v/w-${own[1]}.mp3`), own[0]), `PLANT: "${own[1]}"'s clip taken for "${own[0]}"`);
  assert(!saysWord({ kind: "device", text: own[0] }, own[0]), `PLANT: the device's voice taken for "${own[0]}", which has a recording`);
  if (!LIBRARY.size) return { library: "no Dutch default pack in this catalog has recordings: the app's own clips only" };
  const [path, words] = [...LIBRARY][0];
  const word = [...words][0];
  const other = [...LIBRARY].find(([, w]) => !w.has(word));
  assert(other, "every library clip says the same word");
  assert(saysWord(clip(path), word), `PLANT: "${word}"'s library clip ${path} not taken`);
  assert(!saysWord(clip(other[0]), word), `PLANT: ${other[0]} (${[...other[1]].join(", ")}) taken for "${word}"`);
  assert(!saysWord(clip(`/library/audio/0000000000000000.mp3`), word), `PLANT: a clip in no manifest taken for "${word}"`);
  assert(!saysWord({ kind: "device", text: word }, word), `PLANT: the device's voice taken for "${word}", which has a recording`);
  return { library: `${LIBRARY.size} clips in the Dutch default packs' manifests`, own: OWN.size };
});

await stage("Put it in order: each tile said as it goes in, at once (a recorded word as its clip, another by the device's voice); a second tap at once stops the first; a tile sent back, and English tiles, say nothing", async () => {
  const { context, page, errors } = await phone({ study: { arrange: { tiles: "dutch" } } });
  {
    const kinds = { clip: [], device: [] };
    let quick = null;
    let back = null;
    for (let session = 0; session < 4 && (!kinds.clip.length || kinds.device.length < 2 || !quick || !back); session++) {
      await open(page, "arrange");
      for (let question = 0; question < 6; question++) {
        await page.waitForSelector(BANK, { timeout: 8000 });
        assert((await page.locator(BANK).first().getAttribute("lang")) === "nl", "the tiles should be Dutch's");
        // Two tiles back to back: the first is asked, then stopped, then the second; nothing of the first after.
        if (!quick && (await page.locator(BANK).count()) >= 2) {
          const [a, b] = await page.locator(BANK).evaluateAll((nodes) => nodes.slice(0, 2).map((n) => n.dataset.word));
          const t = await now(page);
          await page.evaluate((B) => {
            const [first, second] = [...document.querySelectorAll(B)];
            first.click();
            setTimeout(() => second.click(), 40);
          }, BANK);
          await settle(page, 400);
          const heard = await saidSince(page, t);
          const said = asks(heard);
          const ia = heard.indexOf(said.find((e) => saysWord(e, a)));
          const ib = heard.indexOf(said.find((e) => saysWord(e, b)));
          assert(ia >= 0 && ib > ia, `two quick taps, "${a}" then "${b}": asked ${describe(heard)}`);
          assert(heard.slice(ia + 1, ib).some((e) => e.kind === "stop"), `"${a}" should be stopped before "${b}" starts: ${describe(heard)}`);
          assert(asks(heard.slice(ib + 1)).length === 0, `nothing after "${b}": ${describe(heard)}`);
          quick = `${a} → stopped → ${b}`;
        }
        // Every other tile, one at a time.
        while ((await page.locator(BANK).count()) > 0) {
          const heard = await tapAndHear(page, page.locator(BANK).first());
          kinds[expectWord(heard, heard.word, "a tile going in")].push(heard.word);
        }
        // A placed tile tapped goes back to the bank, saying nothing.
        if (!back) {
          const sent = await tapAndHear(page, page.locator(PLACED).last());
          expectNothing(sent, `"${sent.word}" sent back`);
          assert(await page.locator(`${BANK}[data-word="${sent.word.replace(/"/g, '\\"')}"]`).count(), `"${sent.word}" should be back in the bank`);
          back = sent.word;
          expectWord(await tapAndHear(page, page.locator(BANK).first()), undefined, "a tile going in again");
        }
        if (!(await next(page))) break;
        if ((await step(page))?.kind !== "arrange") break;
      }
    }
    assert(kinds.clip.length >= 1, `no tile with a recording came up to tap (said by the device: ${kinds.device.join(", ")})`);
    assert(kinds.device.length >= 2, `too few tiles without a recording came up: ${kinds.device.join(", ")}`);
    assert(quick && back, `no quick pair (${quick}) or tile sent back (${back})`);
    // English tiles (the English, put into Dutch order) say nothing.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("lx.study.v1") ?? "{}");
      localStorage.setItem("lx.study.v1", JSON.stringify({ ...s, arrange: { ...(s.arrange ?? {}), tiles: "english" } }));
    });
    await open(page, "arrange");
    await page.waitForSelector(BANK, { timeout: 8000 });
    const english = page.locator(BANK).first();
    assert((await english.getAttribute("lang")) !== "nl", "English tiles expected");
    expectNothing(await tapAndHear(page, english), "an English tile");
    assert(!errors.length, `page errors: ${errors.slice(0, 3)}`);
    return { recorded: kinds.clip, device: kinds.device.slice(0, 6), quick, back };
  }
});

await stage("Listening's order: a tile tapped while its sentence plays says nothing and stops nothing, the sentence playing on; once it has ended, each tile said as it goes in", async () => {
  const { page, errors } = await phone({ study: { listen: { mode: "order" } } });
  await open(page, "listen");
  await page.waitForSelector(BANK, { timeout: 8000 });
  // While the sentence plays (it starts by itself): a tile goes in, and nothing is asked or stopped.
  await page.waitForFunction(() => window.lxSaid.some((e) => e.kind === "device" || e.kind === "clip"), null, { timeout: 5000 });
  const during = await page.locator(BANK).first().evaluate(async (node) => {
    const voice = await import("/js/study/voice.js");
    const playing = (state) => (!state.paused && Boolean(state.src)) || state.device;
    const before = voice.playbackState();
    const t = performance.now();
    const word = node.dataset.word;
    node.click();
    await new Promise((r) => setTimeout(r, 60));
    return { t, word, playingBefore: playing(before), playingAfter: playing(voice.playbackState()), state: voice.playbackState() };
  });
  assert(during.playingBefore, `the sentence wasn't playing when the tile was tapped: ${JSON.stringify(during.state)}`);
  const duringSaid = await saidSince(page, during.t);
  assert(!duringSaid.some((e) => e.kind === "device" || e.kind === "clip" || e.kind === "stop"), `"${during.word}" tapped while the sentence plays: asked ${describe(duringSaid)}`);
  assert(during.playingAfter, `the sentence stopped when "${during.word}" was tapped: ${JSON.stringify(during.state)}`);
  // Once it has ended, every tile is said as it goes in.
  await untilQuiet(page);
  const said = [];
  for (let i = 0; i < 3 && (await page.locator(BANK).count()) > 0; i++) {
    const heard = await tapAndHear(page, page.locator(BANK).first());
    expectWord(heard, heard.word, "Listening's tile, the sentence over");
    said.push(heard.word);
  }
  assert(!errors.length, `page errors: ${errors.slice(0, 3)}`);
  return { quiet: during.word, said };
});

// A tap that answers: with Answers on, the sentence (its recording or the device reading it) and no word of the tap's alone; off, the tap's word.
async function answeringTap(page, game, chooser) {
  await open(page, game);
  for (let tries = 0; tries < 6; tries++) {
    const s = await step(page);
    const choices = page.locator(chooser);
    if (s?.kind === game && (await choices.count()) > 0) return { s, choices };
    if (!(await next(page))) await open(page, game);
  }
  throw new Error(`no ${game} question came up`);
}

await stage("Fill the gap: with Answers on no word by itself, the sentence after the tap; with Answers off the word you tapped; a word in the sentence, tapped for its meaning, said", async () => {
  const on = await phone({ study: { listening: { answers: true } } });
  const off = await phone({ study: { listening: { answers: false } } });
  {
    const CHOICE = `${SESSION} .lx-game .lx-row button[data-word]`;
    // Answers on.
    {
      const { s, choices } = await answeringTap(on.page, "fill", CHOICE);
      const heard = await tapAndHear(on.page, choices.first(), 700);
      const word = heard.word;
      const said = asks(heard.entries);
      assert(!said.some((e) => e.kind === "device" && e.text === word && word !== sentenceOf(s)), `Answers on: "${word}" said by itself: ${describe(said)}`);
      assert(said.some((e) => (e.kind === "device" && e.text.replace(/\s+/g, " ").includes(s.item.words.join(" "))) || (e.kind === "clip" && !/\/w-[^/]+\.mp3$/.test(e.src))), `Answers on: the sentence should play after the tap: ${describe(said)}`);
    }
    // Answers off: the word tapped, at once.
    let tapped;
    {
      const { choices } = await answeringTap(off.page, "fill", CHOICE);
      const heard = await tapAndHear(off.page, choices.first(), 700);
      tapped = heard.word;
      expectWord(heard, heard.word, "Answers off, a choice");
    }
    // A word in the next sentence, tapped for its meaning.
    await answeringTap(off.page, "fill", CHOICE);
    const heardMeaning = await tapAndHear(off.page, off.page.locator(`${SESSION} [data-part="fill-sentence"] [data-word]`).first());
    const meaning = heardMeaning.word;
    expectWord(heardMeaning, meaning, "a word tapped for its meaning");
    assert(await off.page.locator('[data-part="word-popover"]').first().isVisible(), "its meaning should show");
    return { answersOff: tapped, meaning };
  }
});

await stage("Pick the word and Choose: with Answers on, the right word (Pick the word) after the tap; with Answers off, what you tapped", async () => {
  const on = await phone({ study: { listening: { answers: true } } });
  const off = await phone({ study: { listening: { answers: false } } });
  {
    const CHOICE = `${SESSION} [data-part="choice"]`;
    const out = {};
    {
      const { s, choices } = await answeringTap(on.page, "word", CHOICE);
      const wrong = s.options.findIndex((_, i) => i !== s.correct);
      const heard = await tapAndHear(on.page, choices.nth(wrong), 700);
      const said = asks(heard.entries);
      assert(said.length && saysWord(said[0], s.options[s.correct]), `Answers on, a wrong pick: the right word "${s.options[s.correct]}" should be said: ${describe(said)}`);
      assert(!said.some((e) => saysWord(e, s.options[wrong])), `Answers on: the wrong word "${s.options[wrong]}" said: ${describe(said)}`);
      out.on = s.options[s.correct];
    }
    {
      const { s, choices } = await answeringTap(off.page, "word", CHOICE);
      const wrong = s.options.findIndex((_, i) => i !== s.correct);
      expectWord(await tapAndHear(off.page, choices.nth(wrong), 700), s.options[wrong], "Answers off, Pick the word");
      out.off = s.options[wrong];
    }
    {
      const { s, choices } = await answeringTap(off.page, "choose", CHOICE);
      const heard = await tapAndHear(off.page, choices.first(), 700);
      const text = heard.word.trim();
      const first = asks(heard.entries)[0];
      const isSentence = text === sentenceOf(s);
      const ok = first && (first.kind === "device" ? first.text.replace(/\s+/g, " ").trim() === text || (isSentence && first.text.includes(s.item.words.join(" "))) : isSentence && !/\/w-[^/]+\.mp3$/.test(first.src));
      assert(ok, `Answers off, Choose: "${text}" tapped, asked ${describe(asks(heard.entries))}`);
      assert(first.t - heard.t <= allowance(heard), `Choose: ${Math.round(first.t - heard.t)} ms after the tap (allowed ${allowance(heard)} ms)`);
      out.choose = text;
    }
    return out;
  }
});

await stage("Match: a word in the language said as you tap it, its English not", async () => {
  const { context, page } = await phone();
  {
    await open(page, "match");
    const nl = page.locator(`${SESSION} [data-part="match-item"][data-side="nl"]:not([disabled])`).first();
    await nl.waitFor({ timeout: 8000 });
    const heardNl = await tapAndHear(page, nl);
    const word = heardNl.word;
    expectWord(heardNl, word, "Match's word");
    const en = page.locator(`${SESSION} [data-part="match-item"][data-side="en"]:not([disabled])`).first();
    expectNothing(await tapAndHear(page, en), "Match's English");
    return word;
  }
});

// The games' sound effects (lx/sound.js; their files may not be there yet: every request is told as an "lx-sound" event all the same,
// played or not, and that's what this reads).
await stage("sound effects: a tile in and out; right or wrong at an answer, none on I don't know, before the word it says; Match's pairs a step each, the last its own, a miss its own, and no right or wrong at its end", async () => {
  const out = {};
  // Put it in order: tile-in as a tile goes in (after its word is asked), tile-out as one goes back; right or wrong at Check.
  {
    const { page } = await phone({ study: { arrange: { tiles: "dutch" } } });
    await open(page, "arrange");
    await page.waitForSelector(BANK, { timeout: 8000 });
    const placed = await tapAndHear(page, page.locator(BANK).first());
    const kinds = placed.entries.filter((e) => e.kind !== "unlock").map((e) => (e.kind === "effect" ? `fx:${e.role}` : e.kind));
    assert(roles(placed.entries).join() === "tile-in", `a tile going in should ask for tile-in once: ${kinds}`);
    assert(effects(placed.entries)[0].duck === true, `a tile whose word is said should ask to start ducked: ${JSON.stringify(effects(placed.entries)[0])}`);
    assert(kinds.indexOf("fx:tile-in") > kinds.findIndex((k) => k === "device" || k === "clip"), `tile-in should come after its word is asked (so it starts ducked): ${kinds}`);
    const back = await tapAndHear(page, page.locator(PLACED).last());
    assert(roles(back.entries).join() === "tile-out", `a tile going back should ask for tile-out: ${roles(back.entries)}`);
    while ((await page.locator(BANK).count()) > 0) await page.locator(BANK).first().evaluate((n) => n.click());
    const t = await now(page);
    await page.locator(`${SESSION} button`, { hasText: /^Check$/ }).first().click();
    await settle(page, 300);
    const checked = roles(await saidSince(page, t));
    assert(checked.length === 1 && /^(right|wrong)$/.test(checked[0]), `Check should ask for right or wrong once: ${checked}`);
    out.arrange = `tile-in, tile-out, ${checked[0]}`;
    // I don't know: nothing.
    await next(page);
    const t2 = await now(page);
    await page.locator(`${SESSION} button`, { hasText: "I don't know" }).first().click();
    await settle(page, 300);
    assert(!roles(await saidSince(page, t2)).some((r) => /^(right|wrong)$/.test(r)), `I don't know asked for ${roles(await saidSince(page, t2))}`);
    out.skip = "nothing";
  }
  // An English tile: tile-in, not ducked (no word is said).
  {
    const { page } = await phone({ study: { arrange: { tiles: "english" } } });
    await open(page, "arrange");
    await page.waitForSelector(BANK, { timeout: 8000 });
    const english = await tapAndHear(page, page.locator(BANK).first());
    const fx = effects(english.entries);
    assert(fx.length === 1 && fx[0].role === "tile-in" && fx[0].duck === false, `an English tile should ask for tile-in, not ducked: ${JSON.stringify(fx)}`);
    out.english = "tile-in, not ducked";
  }
  // A tap that answers, Answers off: the effect first, then the word tapped.
  {
    const { page } = await phone({ study: { listening: { answers: false } } });
    const { choices } = await answeringTap(page, "fill", `${SESSION} .lx-game .lx-row button[data-word]`);
    const heard = await tapAndHear(page, choices.first(), 500);
    const order = heard.entries.filter((e) => e.kind === "effect" || e.kind === "device" || e.kind === "clip");
    const fx = order.findIndex((e) => e.kind === "effect" && /^(right|wrong)$/.test(e.role));
    const word = order.findIndex((e) => saysWord(e, heard.word));
    assert(fx >= 0 && word > fx, `Fill, Answers off: the effect should be asked before "${heard.word}": ${order.map((e) => (e.kind === "effect" ? `fx:${e.role}` : describe([e]))).join(", ")}`);
    out.fill = `${order[fx].role}, then "${heard.word}"`;
  }
  // Match: a miss, then every pair, climbing; the last its own; nothing at the end.
  {
    const { page } = await phone();
    await open(page, "match");
    await page.waitForSelector(`${SESSION} [data-part="match-item"]`, { timeout: 8000 });
    const answers = await page.evaluate((S) => document.querySelector(S)?.lxStep?.answers ?? null, SESSION);
    assert(answers && Object.keys(answers).length >= 2, `Match's pairs: ${JSON.stringify(answers)}`);
    const nlWords = Object.keys(answers);
    const pick = (side, word) => page.locator(`${SESSION} [data-part="match-item"][data-side="${side}"][data-word="${word.replace(/"/g, '\\"')}"]`).first();
    const pair = async (nl, en) => {
      await pick("nl", nl).evaluate((n) => n.click());
      const t = await now(page);
      await pick("en", en).evaluate((n) => n.click());
      await settle(page, 250);
      return saidSince(page, t);
    };
    const miss = await pair(nlWords[0], answers[nlWords[1]]);
    assert(roles(miss).includes("match-miss"), `a pair that doesn't join should ask for match-miss: ${roles(miss)}`);
    await settle(page, 600);
    const asked = [];
    let end = [];
    for (const [i, nl] of nlWords.entries()) {
      const heard = await pair(nl, answers[nl]);
      asked.push(...roles(heard).filter((r) => r.startsWith("match")));
      if (i === nlWords.length - 1) end = heard;
    }
    const want = [...nlWords.slice(0, -1).map((_, i) => `match:${i + 1}`), `match-last:${nlWords.length}`];
    assert(JSON.stringify(asked) === JSON.stringify(want), `Match's pairs should climb: asked ${asked}, want ${want}`);
    await settle(page, 300);
    const tail = roles(await saidSince(page, end[0]?.t ?? 0));
    assert(!tail.some((r) => /^(right|wrong)$/.test(r)), `no right or wrong at Match's end: ${tail}`);
    out.match = asked.join(" ");
  }
  return out;
});

await stage("off: the switch off, a device that turned Match off before, and Can't listen now say nothing; Settings → Sound and speech has one switch, Say the words you tap, and no Match (390, dark)", async () => {
  const out = {};
  // The switch, on by default, alone where Match was.
  {
    const { context, page } = await phone();
    {
      await page.goto(`${BASE}/app/#settings/voice`);
      await page.waitForSelector('label.lx-row-control:has-text("Sound effects")', { timeout: 15_000 });
      const row = page.locator("label.lx-row-control", { hasText: "Say the words you tap" });
      assert(await row.count(), "no Say the words you tap switch");
      assert(await row.locator("input").isChecked(), "Say the words you tap should be on by default");
      const titles = await page.locator("label.lx-row-control .lx-row-title").allTextContents();
      assert(!titles.some((t) => t.trim() === "Match"), `a Match switch is still there: ${titles}`);
      await row.scrollIntoViewIfNeeded();
      await settle(page, 700);
      await page.screenshot({ path: join(OUT, "sound-and-speech-graphite-390.png") });
      // Off here: a tile says nothing.
      await row.locator("input").click();
      await settle(page, 300);
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("lx.study.v1") ?? "{}");
        localStorage.setItem("lx.study.v1", JSON.stringify({ ...s, arrange: { ...(s.arrange ?? {}), tiles: "dutch" } }));
      });
      await open(page, "arrange");
      await page.waitForSelector(BANK, { timeout: 8000 });
      expectNothing(await tapAndHear(page, page.locator(BANK).first()), "Words you tap off, a tile");
      out.switch = "on by default, off says nothing";
    }
  }
  // A device that turned Match off before Words you tap: off for every game.
  {
    const { context, page } = await phone({ study: { listening: { matchWords: false }, arrange: { tiles: "dutch" } } });
    {
      assert((await page.evaluate(async () => (await import("/js/study/settings.js")).getStudySettings().listening.tapWords)) === false, "Match off from before should leave Words you tap off");
      await open(page, "arrange");
      await page.waitForSelector(BANK, { timeout: 8000 });
      expectNothing(await tapAndHear(page, page.locator(BANK).first()), "Match off from before, a tile");
      out.before = "Match off → Words you tap off";
    }
  }
  // Can't listen now: a tile said before it, nothing said after.
  {
    const { context, page } = await phone({ study: { listen: { mode: "order" } } });
    {
      await open(page, "listen");
      await page.waitForSelector(BANK, { timeout: 8000 });
      await untilQuiet(page);
      expectWord(await tapAndHear(page, page.locator(BANK).first()), undefined, "before Can't listen now");
      await page.locator(`${SESSION} button`, { hasText: "Can't listen now" }).first().click();
      await settle(page, 600);
      // Words of the language on the screen: the swapped question's, else its answer's line once it's skipped (a question may have none: Type it).
      const words = page.locator(`${SESSION} [data-part="tile"][lang="nl"]:not([data-state="used"]), ${SESSION} [data-part="spoken-word"], ${SESSION} [data-part="fill-sentence"] [data-word], ${SESSION} [data-part="match-item"][data-side="nl"]`);
      for (let tries = 0; tries < 6 && !(await words.count()); tries++) {
        const skip = page.locator(`${SESSION} button`, { hasText: "I don't know" }).first();
        if (await skip.isVisible().catch(() => false)) await skip.click();
        else if (!(await next(page))) break;
        await settle(page, 500);
      }
      const n = Math.min(3, await words.count());
      assert(n > 0, "nothing to tap after Can't listen now");
      for (let i = 0; i < n; i++) {
        const heard = await tapAndHear(page, words.nth(i));
        expectNothing(heard, `after Can't listen now, "${heard.word}"`);
      }
      out.cantListen = `${n} taps after, nothing said`;
    }
  }
  return out;
});

await browser.close().catch(() => {});
writeFileSync(join(OUT, "tap-speech-check.json"), JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(`tap speech check: ${failed ? `${failed} of ${results.length} stages FAILED` : `all ${results.length} stages passed`}`);
process.exit(failed ? 1 : 0);
