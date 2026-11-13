// Say the word and Repeat the word in the real app on a phone, a learner six lessons in. The speech module (/js/speech/speech.js) is a stand-in
// served in its place: the browser's recognizer "on the device", hearing what this check says it heard (globalThis.__heard), graded by the app's
// own matcher (speech/match.js), so the step, its tries, its answer and its evidence are the app's own and no microphone or sound is used.
// Say the word: its English and its drawing, the word not shown; said right, Right and recorded (say-word, recall, say); a noun said without its
// article still right; said wrong, two more tries, then the answer, the first try recorded wrong with what was heard. Repeat the word: Play again,
// the word not shown until it's said; recorded as repeat-word, recall, sound. Can't speak now and Can't listen now each ask the same word another
// way, there and then. Every frame of a try recorded (frame-watch.mjs, a planted jump caught first): a wrong try moves nothing and the microphone
// stays put; the answer moves nothing in one frame. No page errors. LOCAL only (it signs up an account), path-nl seeded.
//   node scripts/speaking-words-check.mjs http://localhost:<port> <outDir> [--only <regex>]   (exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { routeStillPlan } from "./fixtures/still-plan.mjs";
import * as fw from "./frame-watch.mjs";

const [BASE, outArg] = process.argv.slice(2);
const ONLY = process.argv.includes("--only") ? new RegExp(process.argv[process.argv.indexOf("--only") + 1], "i") : null;
if (!BASE || !outArg || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("usage: speaking-words-check.mjs http://localhost:<port> <outDir> [--only <regex>] (LOCAL only: it signs up an account)");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.log("FAIL  timed out"), process.exit(3)), 10 * 60_000).unref();

// The stand-in speech module: every name the real one exports, the browser's recognizer local, Whisper none.
const SPEECH = `
import { match } from "/js/speech/match.js";
export { match };
export const MODELS = [];
export class SpeechError extends Error { constructor(code, message) { super(message ?? code); this.code = code; } }
export const releaseMic = () => {};
export const installLanguage = async () => ({ state: "local" });
export const megabytes = (bytes) => Math.round(bytes / 1e6);
export const languageCode = (lang) => String(lang).split("-")[0];
export const WHISPER_LANGUAGES = new Set();
export const whisperKnows = () => false;
export async function support() { return { browser: { state: "local" }, whisper: { state: "none", f16: false, why: "a check's stand-in" } }; }
export const recommendedModel = () => null;
export async function modelState() { return { state: "none" }; }
export async function downloadModel() {}
export async function deleteModel() {}
export async function prepare() {}
export function wake() {}
export function unload() {}
export function listen({ expected, accept = [], readings = [], lang = "nl-NL", onState } = {}) {
  const heard = String(globalThis.__heard ?? "");
  (globalThis.__listens ??= []).push({ expected, heard });
  onState?.("listening");
  let fail = () => {};
  const done = new Promise((resolve, reject) => {
    fail = reject;
    setTimeout(() => {
      onState?.("thinking");
      resolve({ heard, alternatives: [heard], match: match(expected, heard, { lang: languageCode(lang), accept, readings }) });
    }, 250);
  });
  return { done, stop() {}, cancel() { fail(new SpeechError("aborted")); } };
}
`;

const SESSION = '[data-part="session"]';
let failed = 0;
let passed = 0;
const results = [];
let first = true;
async function stage(name, fn) {
  const setup = first;
  first = false;
  if (ONLY && !setup && !ONLY.test(name)) return;
  try {
    const note = await fn();
    passed++;
    console.log(`PASS ${name}${note ? `: ${note}` : ""}`);
    results.push({ name, ok: true, note });
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${error.message}`);
    results.push({ name, ok: false, error: error.message });
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark" });
let stoodIn = 0;
await context.route(/\/js\/speech\/speech\.js(\?|$)/, (route) => {
  stoodIn++;
  return route.fulfill({ status: 200, contentType: "text/javascript", body: SPEECH });
});
// A set plan for the drawings (mode "still" plays globalThis.__stillPlan: fixtures/still-plan.mjs); every other session is the app's own.
await routeStillPlan(context);
const page = await context.newPage();
await fw.install(page);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });

const stepNow = () =>
  page.evaluate((S) => {
    const step = document.querySelector(S)?.lxStep;
    return step ? { kind: step.kind, unit: step.unit ?? null, text: step.text ?? null, means: step.means ?? null, article: step.article ?? null, picture: step.picture ?? null } : null;
  }, SESSION);
const rowsSince = (from) => page.evaluate(async (n) => (await import("/js/study/progress.js")).allEvidence().slice(n).map(({ concept, outcome, test, skill, activity, said }) => ({ concept, outcome, test, skill, activity, said })), from);
const rowCount = () => page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().length);
const hear = (text) => page.evaluate((said) => (globalThis.__heard = said), text);
const openGame = async (kind) => {
  await page.evaluate((k) => (location.hash = `#study/session/game/${k}`), kind);
  await page.waitForFunction(([S, k]) => document.querySelector(S)?.getAttribute("data-step") === k, [SESSION, kind], { timeout: 20_000 });
  await page.waitForTimeout(600);
};
const openPlan = async (steps) => {
  await page.evaluate((list) => {
    globalThis.__stillPlan = { title: "Check", steps: list };
    location.hash = "#study/session/still/check";
  }, steps);
  await page.waitForFunction(([S, k]) => document.querySelector(S)?.getAttribute("data-step") === k, [SESSION, steps[0].kind], { timeout: 20_000 });
  await page.waitForTimeout(600);
};
const leave = async () => {
  await page.evaluate(() => (location.hash = "#study"));
  await page.waitForFunction(() => !document.querySelector('[data-part="session"]'), null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(400);
};
const mic = () => page.locator(`${SESSION} [data-part="mic-button"]`).first();
// Says `text` into the step: the stand-in hears it once the microphone is pressed. Then the status line, once it's checked.
async function say(text) {
  await hear(text);
  const before = await page.evaluate(() => (globalThis.__listens ?? []).length);
  await mic().click();
  await page.waitForFunction((n) => (globalThis.__listens ?? []).length > n, before, { timeout: 10_000 });
  await page.waitForTimeout(900);
}
const feedback = () => page.locator(`${SESSION} [data-part="feedback"]`).first().innerText().catch(() => "");
const status = () => page.locator(`${SESSION} .lx-say-status`).first().innerText().catch(() => "");
const stimulusText = () => page.locator(`${SESSION} .lx-stimulus`).first().innerText().catch(() => "");
const next = () => page.locator(SESSION).getByRole("button", { name: "Continue" }).click();
const bare = (text) => text.split(/\s+/).at(-1);

await stage("a learner six lessons in: a new account, the path's first six lessons answered right a day ago", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Speaking check");
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const titles = await page.evaluate(async () => {
    const { pathLessons } = await import("/js/study/path.js");
    for (let i = 0; i < 300 && !pathLessons().length; i++) await new Promise((done) => setTimeout(done, 100));
    const { markLessonsDone } = await import("/js/study/plan.js");
    const { finishedLesson } = await import("/js/study/done.js");
    const { record } = await import("/js/study/progress.js");
    const { itemById, sentenceUnits } = await import("/js/study/content.js");
    const lessons = pathLessons().slice(0, 6);
    const at = Date.now() - 86_400_000;
    for (const lesson of lessons) {
      record(lesson.things.filter((thing) => !thing.formOnly).map((thing) => ({ concept: thing.unit, at, outcome: "right", test: "pick", skill: "read", activity: "see" })));
      for (const id of lesson.items ?? []) {
        const item = itemById.get(id);
        if (item) record([...sentenceUnits(item), ...item.words.filter(([, lemma]) => lemma).map(([, lemma]) => `w:${lemma}`)].map((concept) => ({ concept, at, outcome: "right", test: "pick", skill: "read", activity: "choose", item: id })));
      }
      finishedLesson(lesson.id, at);
    }
    markLessonsDone(lessons);
    return lessons.map((lesson) => lesson.title);
  });
  assert(titles.length === 6, `the path's lessons: ${titles}`);
  return titles.join(", ");
});

await stage("Say the word: its English, the word not shown; said right, Right and recorded as say-word, recall, say", async () => {
  await openGame("say-word");
  const step = await stepNow();
  assert(step?.kind === "say-word" && step.text && step.means, `the first step: ${JSON.stringify(step)}`);
  const prompt = await page.locator(`${SESSION} [data-part="activity-prompt"]`).first().innerText();
  assert(prompt.includes(step.means), `the English "${step.means}" isn't on the screen: ${prompt}`);
  const shown = await page.locator(SESSION).innerText();
  assert(!new RegExp(`(^|\\s)${bare(step.text)}(\\s|$)`, "i").test(shown.replace(prompt, "")), `the word "${step.text}" is on the screen before it's said`);
  assert((await mic().count()) === 1, "no microphone");
  await shot("say-word-1-question");
  const from = await rowCount();
  await say(step.text);
  const said = await feedback();
  assert(/^Right/.test(said), `"${step.text}" said: ${said || (await status())}`);
  await shot("say-word-2-right");
  const rows = (await rowsSince(from)).filter((row) => row.activity === "say-word");
  assert(rows.length === 1 && rows[0].concept === step.unit && rows[0].outcome === "right" && rows[0].test === "recall" && rows[0].skill === "say", `what it recorded: ${JSON.stringify(rows)}`);
  await leave();
  return `"${step.text}" for "${step.means}"`;
});

await stage("Say the word, a noun said without its article: still right (a recognizer drops little words; the word is what's asked)", async () => {
  const noun = await page.evaluate(async () => {
    const { planSession } = await import("/js/study/plan.js");
    return planSession("game", "say-word").steps.find((step) => step.article) ?? null;
  });
  assert(noun, "no noun among Say the word's steps six lessons in");
  await openPlan([noun]);
  await say(bare(noun.text));
  const said = await feedback();
  assert(/^Right/.test(said), `"${bare(noun.text)}" for "${noun.text}": ${said || (await status())}`);
  await leave();
  return `"${bare(noun.text)}" for "${noun.text}"`;
});

for (const kind of ["say-word", "repeat-word"]) {
  await stage(`${kind} said wrong: the word never written out before the answer (only what was heard), two more tries, then the answer; only the first try recorded, wrong, with what was heard`, async () => {
    await openGame(kind);
    const step = await stepNow();
    const from = await rowCount();
    const shownWord = async () => new RegExp(`(^|\\s)${bare(step.text)}(\\s|$)`, "i").test((await page.locator(SESSION).innerText()).replace(step.means, ""));
    await say("zzz");
    const first = await status();
    assert((kind === "say-word" ? /^Not quite\. Try again\./ : /^Not quite\. Listen, then try again\./).test(first) && !(await feedback()), `after one wrong try: ${first}`);
    assert(/Heard: “zzz”/.test(await page.locator(`${SESSION} .lx-said`).innerText()), "what was heard isn't said");
    assert(!(await shownWord()), `"${step.text}" written out after one wrong try`);
    await say("zzz");
    assert(/One more try/.test(await status()) && !(await shownWord()), `after two: ${await status()}`);
    await say("zzz");
    const answer = await feedback();
    assert(/Here's how it sounds/.test(answer) && answer.includes(step.text), `after three: ${answer}`);
    await shot(`${kind}-3-wrong`);
    const rows = (await rowsSince(from)).filter((row) => row.activity === kind);
    assert(rows.length === 1 && rows[0].outcome === "wrong" && rows[0].said === "zzz" && rows[0].concept === step.unit, `what it recorded: ${JSON.stringify(rows)}`);
    await leave();
    return `"${step.text}": three tries, one row, the word hidden until the answer`;
  });
}

await stage("Repeat the word: Play again, the word not shown; said back, Right and recorded as repeat-word, recall, sound", async () => {
  await openGame("repeat-word");
  const step = await stepNow();
  assert(step?.kind === "repeat-word" && step.text, `the first step: ${JSON.stringify(step)}`);
  assert((await page.locator(`${SESSION} .lx-listen-row`).count()) === 1, "no Play again");
  assert(!new RegExp(`(^|\\s)${bare(step.text)}(\\s|$)`, "i").test(await stimulusText()), `the word "${step.text}" is shown before it's said`);
  await shot("repeat-word-1-question");
  const from = await rowCount();
  await say(step.text);
  assert(/^Right/.test(await feedback()), `"${step.text}" said back: ${(await feedback()) || (await status())}`);
  await shot("repeat-word-2-right");
  const rows = (await rowsSince(from)).filter((row) => row.activity === "repeat-word");
  assert(rows.length === 1 && rows[0].concept === step.unit && rows[0].outcome === "right" && rows[0].test === "recall" && rows[0].skill === "sound", `what it recorded: ${JSON.stringify(rows)}`);
  await leave();
  return `"${step.text}"`;
});

// Which words a plan asks is the planner's (test-study: each game's plan has its drawings); this asks the screen. Six lessons in, the words
// Say the word asks first may have none, so a taught word with one (Type the word's, the same entry's step) is asked through the set plan.
await stage("Say the word and Repeat the word show the word's drawing under the step when it has one", async () => {
  const steps = await page.evaluate(async () => {
    const { planSession } = await import("/js/study/plan.js");
    const own = Object.fromEntries(["say-word", "repeat-word"].map((kind) => [kind, planSession("game", kind).steps.find((step) => step.picture) ?? null]));
    const typed = planSession("game", "type-word").steps.find((step) => step.picture);
    const as = (kind) => typed && { kind, unit: typed.unit, target: typed.target, phrase: typed.phrase, means: typed.means, picture: typed.picture, text: typed.text, ...(typed.article ? { article: typed.article } : {}), skill: kind === "say-word" ? "say" : "sound" };
    return { "say-word": own["say-word"] ?? as("say-word"), "repeat-word": own["repeat-word"] ?? as("repeat-word") };
  });
  const notes = [];
  for (const kind of ["say-word", "repeat-word"]) {
    assert(steps[kind], `${kind}: no step with a drawing six lessons in`);
    await openPlan([steps[kind]]);
    const picture = page.locator(`${SESSION} [data-part="word-picture"] svg`);
    await picture.first().waitFor({ timeout: 5_000 }).catch(() => {});
    assert((await picture.count()) === 1, `${kind}: "${steps[kind].means}" has no drawing on screen`);
    await shot(`${kind}-picture`);
    notes.push(`${kind} "${steps[kind].means}" drawn as ${steps[kind].picture}`);
    await leave();
  }
  return notes.join("; ");
});

for (const [kind, button] of [["say-word", "Can't speak now"], ["repeat-word", "Can't listen now"]]) {
  await stage(`${kind} with ${button}: the same word asked another way that needs neither, there and then`, async () => {
    await openGame(kind);
    const before = await stepNow();
    await page.locator(SESSION).getByRole("button", { name: button }).click();
    await page.waitForFunction(([S, k]) => document.querySelector(S)?.getAttribute("data-step") !== k, [SESSION, kind], { timeout: 5_000 }).catch(() => {});
    const after = await stepNow();
    assert(after && after.kind !== kind && after.unit === before.unit, `after ${button}: ${JSON.stringify(after)} (was ${JSON.stringify(before)})`);
    if (button === "Can't speak now") assert(!["say", "repeat", "say-word", "repeat-word"].includes(after.kind), `still a speaking game: ${after.kind}`);
    await leave();
    return `${before.text}: ${kind} became ${after.kind}`;
  });
}

// ---------- nothing jumps: every frame of a try ----------
// A word with its drawing (the tallest step): the game's own first, else Type the word's (the same entry's step, as this game makes it).
const drawnStep = (kind) =>
  page.evaluate(async (k) => {
    const { planSession } = await import("/js/study/plan.js");
    const own = planSession("game", k).steps.find((step) => step.picture);
    if (own) return own;
    const typed = ["type-word", "word", "see"].map((other) => planSession("game", other).steps.find((step) => step.picture && step.text)).find(Boolean);
    return typed && { kind: k, unit: typed.unit, target: typed.target, phrase: typed.phrase, means: typed.means, picture: typed.picture, text: typed.text, ...(typed.article ? { article: typed.article } : {}), skill: k === "say-word" ? "say" : "sound" };
  }, kind);
const JUMPS = new Set(["teleport", "left-behind", "reflow"]);
// One try (or a planted change), every frame recorded: what frame-watch finds that jumped, and how far the microphone moved in all.
async function tryFrames(step, heard, { plant = null, tries = 1 } = {}) {
  await openPlan([step]);
  await fw.quiet(page, 300, 4000).catch(() => {});
  const before = await mic().boundingBox();
  const partsBefore = await partBoxes();
  await fw.start(page);
  // Still frames first: a jump is a move with stillness either side of it.
  await page.waitForTimeout(300);
  if (plant) await page.evaluate(plant, SESSION);
  else
    for (let i = 0; i < tries; i++) {
      await hear(heard);
      const n = await page.evaluate(() => (globalThis.__listens ?? []).length);
      await mic().click();
      await page.waitForFunction((m) => (globalThis.__listens ?? []).length > m, n, { timeout: 10_000 });
      await page.waitForTimeout(900);
    }
  await page.waitForTimeout(1200);
  const run = await fw.stop(page);
  const after = await mic().boundingBox();
  const partsAfter = await partBoxes();
  const shifted = Object.keys(partsAfter).filter((name) => partsBefore[name] && (Math.abs(partsAfter[name].y - partsBefore[name].y) >= 1 || Math.abs(partsAfter[name].h - partsBefore[name].h) >= 1)).map((name) => `${name} ${partsBefore[name].y}+${partsBefore[name].h} → ${partsAfter[name].y}+${partsAfter[name].h}`);
  const found = fw.analyze(run, { label: step.kind }).filter((row) => JUMPS.has(row.kind));
  const state = { status: await status(), feedback: await feedback() };
  await leave();
  return { found, frames: run.frames.length, moved: before && after ? Math.round(after.y - before.y) : null, state, shifted };
}
// Where the step's parts are (y and height): what moved, when something did.
const partBoxes = () =>
  page.evaluate((S) => {
    const out = {};
    const parts = { prompt: '[data-part="activity-prompt"]', stimulus: ".lx-stimulus", picture: '[data-part="word-picture"]', reach: ".lx-step > .lx-reach", status: ".lx-say-status", mic: '[data-part="mic-button"]', said: ".lx-said", step: ".lx-step" };
    for (const [name, selector] of Object.entries(parts)) {
      const node = document.querySelector(`${S} ${selector}`);
      if (node) {
        const box = node.getBoundingClientRect();
        out[name] = { y: Math.round(box.top), h: Math.round(box.height) };
      }
    }
    out.fit = { y: Number(document.querySelector(S)?.getAttribute("data-fit") ?? 0), h: 0 };
    return out;
  }, SESSION);
const jumps = (found) => found.map((row) => `${row.kind} at ${row.at} ms: ${row.what}`).slice(0, 3).join(" | ");

await stage("PLANT: a block put above the microphone in one frame is caught as a jump (frame-watch sees this page's moves)", async () => {
  const step = await drawnStep("say-word");
  assert(step, "no word with a drawing six lessons in");
  const { found, frames } = await tryFrames(step, "", {
    plant: (S) => document.querySelector(`${S} .lx-game`).prepend(Object.assign(document.createElement("div"), { style: "height: 70px" })),
  });
  assert(found.some((row) => row.kind === "teleport"), `nothing caught in ${frames} frames`);
  return found.map((row) => row.what).slice(0, 2).join("; ");
});

for (const kind of ["say-word", "repeat-word"]) {
  await stage(`${kind}, a word with its drawing: a wrong try moves nothing, the microphone where it was (what was heard in the room held for it)`, async () => {
    const step = await drawnStep(kind);
    assert(step?.picture, `${kind}: no word with a drawing six lessons in`);
    const result = await tryFrames(step, "zzz");
    assert(/^Not quite/.test(result.state.status) && !result.state.feedback, `${kind}: not a first wrong try: ${JSON.stringify(result.state)}`);
    assert(!result.found.length, jumps(result.found));
    assert(result.moved !== null && Math.abs(result.moved) <= 1, `the microphone moved ${result.moved} px: ${result.shifted.join("; ")}`);
    return `"${step.text}" (${step.picture}): ${result.frames} frames, nothing moved`;
  });
  await stage(`${kind}, a word with its drawing: said right, and wrong three times, nothing moves in one frame (the result comes up on its own curve)`, async () => {
    const step = await drawnStep(kind);
    const notes = [];
    for (const [heard, tries, title] of [[step.text, 1, /^Right/], ["zzz", 3, /Here's how it sounds/]]) {
      const result = await tryFrames(step, heard, { tries });
      assert(title.test(result.state.feedback), `${kind} after ${tries} ${heard === "zzz" ? "wrong tries" : "right"}: ${JSON.stringify(result.state)}`);
      assert(!result.found.length, jumps(result.found));
      notes.push(`${tries === 1 ? "right" : "three wrong"}: ${result.frames} frames, the microphone ${result.moved ? `moved ${result.moved} px on the result's curve` : "stayed where it was"}`);
    }
    return `"${step.text}": ${notes.join("; ")}`;
  });
}

// ---------- a pack's plain card said aloud (deck.js saidAloud; session.js drawSay through deck-steps.js) ----------
// A small deck of its own, saved as the app saves a pack: a noun with its article, plain words, and a card whose sides are the other way round.
const DECK = "say-check-deck";
const deckSteps = () =>
  page.evaluate(async (id) => {
    const { savePack, setPackOn, allPacks } = await import("/js/study/packs.js");
    const deck = await import("/js/study/deck.js");
    if (!allPacks().some((pack) => pack.id === id)) {
      const items = [
        { id: "huis", text: "het huis", means: "the house" },
        { id: "fiets", text: "fiets", means: "bicycle" },
        { id: "boom", text: "boom", means: "tree" },
        { id: "stoel", text: "stoel", means: "chair" },
        { id: "raam", text: "raam", means: "window" },
        { id: "rev", text: "the dog", means: "de hond" },
      ];
      const saved = await savePack({ format: "lexicommons-pack", version: 2, id, name: "Say check", language: "nl", from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items });
      if (!saved.ok) throw new Error(JSON.stringify(saved.errors?.slice(0, 2)));
      setPackOn(id, true);
    }
    deck.setSpeechHearing(true);
    const pack = allPacks().find((one) => one.id === id);
    const entries = deck.cardsOf(pack);
    const step = (entry) => ({ kind: "deck", game: "say", skill: "say", pack: id, card: entry.card, sound: entry.sound, unit: entry.unit, entry, meaning: "review" });
    return { games: Object.fromEntries(entries.map((entry) => [entry.card.id, entry.games])), steps: Object.fromEntries(entries.filter((entry) => entry.games.includes("say")).map((entry) => [entry.card.id, step(entry)])), noun: deck.saidNoun(entries[0].card) };
  }, DECK);
const cardRowsSince = async (from, unit) => (await rowsSince(from)).filter((row) => row.concept === unit);

await stage("a deck's card, Say it: offered on the cards in the pack's language, never the one whose sides are the other way round", async () => {
  const { games, noun } = await deckSteps();
  assert(games.huis.includes("say") && games.fiets.includes("say"), `the Dutch cards' games: ${JSON.stringify(games)}`);
  assert(!games.rev.includes("say"), `"the dog" / "de hond" is asked aloud: ${games.rev}`);
  assert(noun === "huis", `het huis's own word: ${noun}`);
  return `het huis: ${games.huis.join(", ")}; the dog: ${games.rev.join(", ")}`;
});

await stage("a deck's card, Say it: its meaning asked, its text not shown; said right, Right and recorded on the card's own unit as say, recall, say", async () => {
  const { steps } = await deckSteps();
  const step = steps.fiets;
  await openPlan([step]);
  const prompt = await page.locator(`${SESSION} [data-part="activity-prompt"]`).first().innerText();
  assert(prompt.includes(step.card.means), `its meaning "${step.card.means}" isn't asked: ${prompt}`);
  assert(!/(^|\s)fiets(\s|$)/i.test(await page.locator(SESSION).innerText()), "the card's text is on the screen before it's said");
  assert((await mic().count()) === 1, "no microphone");
  for (const name of ["I don't know", "Can't speak now"]) assert((await page.locator(SESSION).getByRole("button", { name }).count()) === 1, `no ${name}`);
  await shot("card-say-1-question");
  const from = await rowCount();
  await say("fiets");
  const said = await feedback();
  assert(/^Right/.test(said) && said.includes("fiets: bicycle"), `"fiets" said: ${said || (await status())}`);
  await shot("card-say-2-right");
  const rows = await cardRowsSince(from, step.unit);
  assert(rows.length === 1 && rows[0].activity === "say" && rows[0].outcome === "right" && rows[0].test === "recall" && rows[0].skill === "say", `what it recorded: ${JSON.stringify(rows)}`);
  assert(step.unit === `k:${DECK}/fiets`, `its unit: ${step.unit}`);
  const state = await page.evaluate(async (unit) => { const s = (await import("/js/study/progress.js")).unitState(unit, { lang: "nl" }); return { say: Boolean(s.strengths.say), due: s.strengths.say?.due ?? null }; }, step.unit);
  assert(state.say && state.due === false, `its saying isn't scheduled: ${JSON.stringify(state)}`);
  await leave();
  return `"fiets" for "bicycle": ${JSON.stringify(rows[0])}`;
});

await stage("a deck's card, a noun said without its article: still right", async () => {
  const { steps } = await deckSteps();
  await openPlan([steps.huis]);
  await say("huis");
  const said = await feedback();
  assert(/^Right/.test(said), `"huis" for "het huis": ${said || (await status())}`);
  await leave();
  return '"huis" for "het huis"';
});

await stage("a deck's card said wrong: only what was heard until the answer, two more tries, then the answer; one row, the first try's, wrong, with what was heard", async () => {
  const { steps } = await deckSteps();
  const step = steps.boom;
  await openPlan([step]);
  const from = await rowCount();
  const shownText = async () => /(^|\s)boom(\s|$)/i.test(await page.locator(SESSION).innerText());
  await say("zzz");
  const first = await status();
  assert(/^Not quite\. Try again\./.test(first) && !(await feedback()), `after one wrong try: ${first}`);
  assert(/Heard: “zzz”/.test(await page.locator(`${SESSION} .lx-said`).innerText()), "what was heard isn't said");
  assert(!(await shownText()), "the card's text written out after one wrong try");
  await shot("card-say-3-wrong-try");
  await say("zzz");
  assert(/One more try/.test(await status()) && !(await shownText()), `after two: ${await status()}`);
  await say("zzz");
  const answer = await feedback();
  assert(/Here's how it sounds/.test(answer) && answer.includes("boom: tree"), `after three: ${answer}`);
  await shot("card-say-4-answer");
  const rows = await cardRowsSince(from, step.unit);
  assert(rows.length === 1 && rows[0].outcome === "wrong" && rows[0].said === "zzz" && rows[0].activity === "say", `what it recorded: ${JSON.stringify(rows)}`);
  // Its "?" opens the card, as its other games' results do.
  assert((await page.locator(`${SESSION} [data-part="learn-more"], ${SESSION} button[aria-label*="Learn"], ${SESSION} button[aria-label*="learn"]`).count()) >= 1, 'no "?" on the result');
  await leave();
  return "three tries, one row, the text hidden until the answer";
});

await stage("a deck's card with Can't speak now: the same card asked by another of its games, there and then, never a speaking one", async () => {
  const { steps } = await deckSteps();
  const step = steps.stoel;
  await page.evaluate(async (one) => {
    const { deckInstead } = await import("/js/study/deck.js");
    globalThis.__stillPlan = { title: "Check", steps: [one], instead: (asked, without) => deckInstead(asked, without) };
    location.hash = "#study/session/still/check";
  }, step);
  await page.waitForFunction((S) => document.querySelector(S)?.getAttribute("data-game") === "say", SESSION, { timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.locator(SESSION).getByRole("button", { name: "Can't speak now" }).click();
  await page.waitForFunction((S) => document.querySelector(S)?.getAttribute("data-game") !== "say", SESSION, { timeout: 5_000 }).catch(() => {});
  const after = await page.evaluate((S) => { const s = document.querySelector(S)?.lxStep; return s ? { kind: s.kind, game: s.game, unit: s.unit } : null; }, SESSION);
  assert(after?.kind === "deck" && after.game !== "say" && after.unit === step.unit, `after Can't speak now: ${JSON.stringify(after)}`);
  // Once the swap has settled: the other game's own screen, no microphone left on it.
  await page.waitForTimeout(1200);
  assert((await mic().count()) === 0, "the microphone is still on the screen after the swap");
  await shot("card-say-5-cant-speak");
  await leave();
  return `stoel: Say it became ${after.game}`;
});

await stage("a deck's card: a wrong try moves nothing, the microphone where it was; said right, and wrong three times, nothing moves in one frame", async () => {
  const { steps } = await deckSteps();
  const step = steps.raam;
  const wrong = await tryFrames(step, "zzz");
  assert(/^Not quite/.test(wrong.state.status) && !wrong.state.feedback, `not a first wrong try: ${JSON.stringify(wrong.state)}`);
  assert(!wrong.found.length, jumps(wrong.found));
  assert(wrong.moved !== null && Math.abs(wrong.moved) <= 1, `the microphone moved ${wrong.moved} px: ${wrong.shifted.join("; ")}`);
  const notes = [`a wrong try: ${wrong.frames} frames, nothing moved`];
  for (const [heard, tries, title] of [["raam", 1, /^Right/], ["zzz", 3, /Here's how it sounds/]]) {
    const result = await tryFrames(step, heard, { tries });
    assert(title.test(result.state.feedback), `after ${tries} ${heard === "zzz" ? "wrong tries" : "right"}: ${JSON.stringify(result.state)}`);
    assert(!result.found.length, jumps(result.found));
    notes.push(`${tries === 1 ? "right" : "three wrong"}: ${result.frames} frames, the microphone ${result.moved ? `moved ${result.moved} px on the result's curve` : "stayed where it was"}`);
  }
  return notes.join("; ");
});

await stage("where nothing can listen, no card is offered Say it", async () => {
  const games = await page.evaluate(async (id) => {
    const deck = await import("/js/study/deck.js");
    const { allPacks } = await import("/js/study/packs.js");
    deck.setSpeechHearing(false);
    const out = deck.cardsOf(allPacks().find((one) => one.id === id)).map((entry) => entry.games.includes("say"));
    deck.setSpeechHearing(true);
    return out;
  }, DECK);
  assert(games.length === 6 && games.every((has) => !has), `still offered: ${games}`);
});

await stage("no page errors, and the speech module the stand-in", async () => {
  assert(stoodIn > 0, "the app never asked for /js/speech/speech.js, so nothing here listened");
  assert(!errors.length, errors.slice(0, 3).join(" | "));
});

await page.evaluate(async () => { await fetch("/account/delete", { method: "POST" }).catch(() => {}); }).catch(() => {});
await context.close();
await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
