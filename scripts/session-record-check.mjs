// What a session records, at the places it went wrong before (study/session.js), on a phone, each stage on a new account that knows its words:
//   - closing Choose the games on a finished session's summary doesn't count that session again;
//   - a word missed in Match is recorded wrong, even when its tile shows another form of it than its own (ga for gaan);
//   - pairs answered in a Match round that's left before its end are kept;
//   - a microphone still being set up when the session closes never starts, and nothing is recorded;
//   - Escape and Enter while Choose the games is open belong to the sheet, not to the session under it.
// Every stage fails on the session.js from before these were fixed. LOCAL only: it signs up real accounts (a virtual passkey) and deletes them; the
// local library must have path-nl (scripts/packs/seed-local.mjs --default), else exit 2.
// Usage: node scripts/session-record-check.mjs http://localhost:<port> <outDir> [--only <regex>]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { knowWords, untilSaved } from "./fixtures/know-words.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const ONLY = argv.includes("--only") ? new RegExp(argv[argv.indexOf("--only") + 1]) : null;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/session-record-check.mjs http://localhost:<port> <outDir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}));
if (!(catalogue.packs?.nl ?? []).some((pack) => pack.id === "path-nl")) {
  console.error("session-record-check: the local library doesn't list path-nl; seed it first.");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const results = {};
const errors = [];
const assert = (cond, what) => {
  if (!cond) throw new Error(what);
};
let shots = 0;
async function stage(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  let page = null;
  try {
    const note = await fn((p) => (page = p));
    results[name] = { ok: true, note };
    console.log(`PASS ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    results[name] = { ok: false, note: String(error.stack ?? error) };
    console.log(`FAIL ${name}: ${error.message}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${++shots}.png` }).catch(() => {});
  }
}
const SESSION = '[data-part="session"]:not([data-ghost])';
const settle = (page, ms = 300) => page.waitForTimeout(ms);
const attr = (text) => String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * A phone of a new account that knows its words, with a recognizer that only counts: each start of it, or of the microphone, is counted and
 * refused, so nothing listens. holdSpeech: the speech module (study/speaking.js speechApi) is held 4 s each time it's asked for, and counted.
 */
async function phone(name, { holdSpeech = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true });
  await context.addInitScript(() => {
    globalThis.__checkStarts = 0;
    class Counting extends EventTarget {
      start() {
        globalThis.__checkStarts++;
        setTimeout(() => this.onerror?.({ error: "not-allowed" }), 0);
      }
      stop() {}
      abort() {}
    }
    Object.defineProperty(globalThis, "SpeechRecognition", { value: Counting, configurable: true, writable: true });
    Object.defineProperty(globalThis, "webkitSpeechRecognition", { value: Counting, configurable: true, writable: true });
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = () => {
        globalThis.__checkStarts++;
        return Promise.reject(new DOMException("a check", "NotAllowedError"));
      };
    }
  });
  const held = { count: 0 };
  if (holdSpeech) {
    await context.route("**/js/speech/speech.js*", async (route) => {
      held.count++;
      await new Promise((done) => setTimeout(done, 4000));
      await route.continue().catch(() => {});
    });
  }
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', name);
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  await knowWords(page);
  const close = async () => {
    await page.evaluate(async () => {
      await fetch("/account/delete", { method: "POST" }).catch(() => {});
    }).catch(() => {});
    await context.close();
  };
  return { page, held, close };
}

/** A game's few rounds, started from Home: the session's first step on screen. */
async function startGame(page, game) {
  await page.evaluate((to) => (location.hash = to), `#study/session/game/${game}`);
  await page.waitForSelector(SESSION, { timeout: 15_000 });
  await page.waitForFunction((S) => document.querySelector(S)?.lxStep, SESSION, { timeout: 15_000 });
  await settle(page, 400);
}
/** The step on screen, and each of a Match round's tiles with the unit it stands for (a word's tile shows the form it was taught in). */
const stepNow = (page) =>
  page.evaluate(async (S) => {
    const step = document.querySelector(S)?.lxStep;
    if (!step) return null;
    const { pathThing, taughtForm } = await import("/js/study/path.js");
    const { CHUNKS } = await import("/js/study/content.js");
    const units = {};
    for (const word of step.words ?? []) {
      const thing = pathThing(`w:${word}`);
      units[thing ? taughtForm(thing) : word] = `w:${word}`;
    }
    for (const id of step.phrases ?? []) units[CHUNKS[id].text] = `c:${id}`;
    for (const item of step.items ?? []) units[item.text] = item.unit;
    return { kind: step.kind, words: step.words ?? [], answers: step.answers ?? {}, units };
  }, SESSION);
const tile = (page, side, text) => page.locator(`${SESSION} [data-part="match-item"][data-side="${side}"][data-word="${attr(text)}"]`);
/** Pairs every tile still open, rightly. */
async function pairAll(page, answers) {
  for (const [nl, en] of Object.entries(answers)) {
    if ((await tile(page, "nl", nl).getAttribute("data-state")) === "matched") continue;
    await tile(page, "nl", nl).click();
    await page.locator(`${SESSION} [data-part="match-item"][data-side="en"][data-word="${attr(en)}"]:not([data-state="matched"])`).first().click();
    await settle(page, 150);
  }
}
const continueButton = (page) => page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`);
const summary = (page) => page.locator(`${SESSION} [data-part="session-summary"]`);
const gamesButton = (page) => page.locator(`${SESSION} [aria-label="Choose the games"]`);
const sheetOpen = (page) => page.evaluate(() => [...document.querySelectorAll(".lx-sheet-layer")].some((layer) => !layer.hidden && layer.getAttribute("data-state") !== "closing"));
async function openGames(page) {
  await gamesButton(page).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".lx-sheet-layer")].some((layer) => !layer.hidden), null, { timeout: 5_000 });
  await settle(page, 800);
}
async function closeGamesByShade(page) {
  await page.locator('[data-part="sheet-scrim"]').click({ position: { x: 30, y: 30 } });
  await page.waitForFunction(() => ![...document.querySelectorAll(".lx-sheet-layer")].some((layer) => !layer.hidden), null, { timeout: 5_000 });
  await settle(page, 400);
}
const finishedCount = (page) => page.evaluate(async () => Object.keys((await import("/js/study/done.js")).streakExport().things).length);
const matchRows = (page, since) =>
  page.evaluate(async (since) => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.at >= since && row.activity === "match").map((row) => ({ concept: row.concept, outcome: row.outcome })), since);
const sessionGone = (page) => page.waitForFunction((S) => !document.querySelector(S), SESSION, { timeout: 10_000 });

await stage("closing Choose the games on a finished session's summary counts that session once", async (own) => {
  const { page, close } = await phone("Session Record Summary");
  own(page);
  try {
    await startGame(page, "match");
    for (let i = 0; i < 8 && !(await summary(page).count()); i++) {
      const step = await stepNow(page);
      assert(step?.kind === "match", `a step that isn't Match: ${step?.kind}`);
      await pairAll(page, step.answers);
      await continueButton(page).click();
      await settle(page, 500);
    }
    await summary(page).waitFor({ timeout: 10_000 });
    await settle(page, 1200);
    const once = await finishedCount(page);
    assert(once === 1, `the finished session counted ${once} times at its summary`);
    assert(await gamesButton(page).count(), "the summary has no Choose the games");
    for (let i = 0; i < 2; i++) {
      await openGames(page);
      await closeGamesByShade(page);
    }
    const after = await finishedCount(page);
    assert(after === once, `one finished session, counted ${after} times after Choose the games was opened and closed twice`);
    assert(await summary(page).count(), "the summary went");
    return `counted once at the summary, still ${after} after the sheet twice`;
  } finally {
    await close();
  }
});

await stage("a word missed in Match is recorded wrong, even when its tile shows another form of it than its own", async (own) => {
  const { page, close } = await phone("Session Record Forms");
  own(page);
  try {
    // The words taught in another form, made the weakest by a miss each, so a round takes them first.
    const forms = await page.evaluate(async () => {
      const { pathThing, taughtForm } = await import("/js/study/path.js");
      const { WORDS } = await import("/js/study/content.js");
      const out = {};
      for (const word of Object.keys(WORDS)) {
        const thing = pathThing(`w:${word}`);
        if (thing && taughtForm(thing) !== word) out[word] = taughtForm(thing);
      }
      return out;
    });
    assert(Object.keys(forms).length, "no word is taught in another form than its own");
    const last = await page.evaluate(
      async (words) => (await import("/js/study/progress.js")).record(words.map((word) => ({ concept: `w:${word}`, outcome: "wrong", test: "recall", skill: "read", activity: "meaning", item: "check" }))).at(-1).uid,
      Object.keys(forms),
    );
    await untilSaved(page, last);
    const since = Date.now();
    await startGame(page, "match");
    let found = null;
    for (let i = 0; i < 3 && !found; i++) {
      const step = await stepNow(page);
      assert(step?.kind === "match", `a step that isn't Match: ${step?.kind}`);
      const word = step.words.find((one) => forms[one] && step.answers[forms[one]] !== undefined);
      if (word) found = { word, form: forms[word], step };
      else {
        await pairAll(page, step.answers);
        await continueButton(page).click();
        await settle(page, 500);
      }
    }
    assert(found, `no Match round held a word shown in another form (${Object.entries(forms).slice(0, 6).map(([w, f]) => `${f} for ${w}`).join(", ")}…)`);
    const { word, form, step } = found;
    // Its tile, with an English that's another word's.
    const wrongEnglish = Object.entries(step.answers).find(([nl]) => nl !== form)[1];
    await tile(page, "nl", form).click();
    await tile(page, "en", wrongEnglish).first().click();
    await settle(page, 800);
    await pairAll(page, step.answers);
    await continueButton(page).waitFor({ timeout: 5_000 });
    const rows = (await matchRows(page, since)).filter((row) => row.concept === `w:${word}`);
    assert(rows.length, `nothing recorded for ${word}`);
    assert(rows.at(-1).outcome === "wrong", `${form} (${word}) was matched wrongly, and recorded ${rows.at(-1).outcome}`);
    return `${form} for ${word}, missed: recorded wrong`;
  } finally {
    await close();
  }
});

await stage("pairs answered in a Match round left before its end are kept", async (own) => {
  const { page, close } = await phone("Session Record Left");
  own(page);
  try {
    const since = Date.now();
    await startGame(page, "match");
    const step = await stepNow(page);
    assert(step?.kind === "match", `a step that isn't Match: ${step?.kind}`);
    const two = Object.entries(step.answers).slice(0, 2);
    assert(Object.keys(step.answers).length > 2, "a round of two pairs: nothing would be left to leave");
    for (const [nl, en] of two) {
      await tile(page, "nl", nl).click();
      await tile(page, "en", en).first().click();
      await settle(page, 200);
    }
    await page.locator(`${SESSION} [aria-label="End session"]`).click();
    await sessionGone(page);
    await settle(page, 400);
    const rows = await matchRows(page, since);
    const want = two.map(([nl]) => step.units[nl]).sort();
    const got = rows.map((row) => row.concept).sort();
    assert(JSON.stringify(got) === JSON.stringify(want), `two pairs answered, then the session closed; recorded ${JSON.stringify(rows)}, want ${JSON.stringify(want)} right`);
    assert(rows.every((row) => row.outcome === "right"), `recorded ${JSON.stringify(rows)}`);
    return `${got.join(", ")}: right, kept`;
  } finally {
    await close();
  }
});

await stage("a microphone still being set up when the session closes never starts, and nothing is recorded", async (own) => {
  const { page, held, close } = await phone("Session Record Microphone", { holdSpeech: true });
  own(page);
  try {
    const since = Date.now();
    await startGame(page, "say");
    const step = await stepNow(page);
    assert(step?.kind === "say" || step?.kind === "repeat", `a step that isn't Say it: ${step?.kind}`);
    await page.locator(`${SESSION} [data-part="mic-button"]`).click();
    await settle(page, 200);
    await page.locator(`${SESSION} [aria-label="End session"]`).click();
    await sessionGone(page);
    // The speech module comes in 4 s after it was asked for: anything waiting on it goes on then.
    await settle(page, 6000);
    // Without the hold the setup would be done before the close, and this couldn't fail.
    assert(held.count >= 1, "the speech module was never asked for while the session was up, so nothing was held");
    const starts = await page.evaluate(() => globalThis.__checkStarts);
    const rows = await page.evaluate(async (since) => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.at >= since).length, since);
    assert(starts === 0, `the session was closed while its microphone was being set up, and the microphone was started ${starts} times after`);
    assert(rows === 0, `${rows} rows recorded after the session closed`);
    return `held ${held.count} time${held.count === 1 ? "" : "s"}; nothing started or recorded`;
  } finally {
    await close();
  }
});

await stage("Escape while Choose the games is open closes the sheet, not the session under it", async (own) => {
  const { page, close } = await phone("Session Record Escape");
  own(page);
  try {
    await startGame(page, "match");
    await openGames(page);
    await page.keyboard.press("Escape");
    await settle(page, 900);
    assert(await page.locator(SESSION).count(), "Escape in Choose the games ended the session under it");
    assert(!(await sheetOpen(page)), "Escape didn't close Choose the games");
    return "the sheet closed; the session stayed";
  } finally {
    await close();
  }
});

await stage("Enter while Choose the games is open leaves the answered step under it where it is", async (own) => {
  const { page, close } = await phone("Session Record Enter");
  own(page);
  try {
    await startGame(page, "match");
    // An answered round: Enter would go on to the next one.
    const step = await stepNow(page);
    await pairAll(page, step.answers);
    await continueButton(page).waitFor({ timeout: 5_000 });
    await page.evaluate((S) => (document.querySelector(S).lxStep.checkMark = true), SESSION);
    await openGames(page);
    await page.keyboard.press("Enter");
    await settle(page, 900);
    const same = await page.evaluate((S) => document.querySelector(S)?.lxStep?.checkMark === true, SESSION);
    assert(same, "Enter in Choose the games moved the session under it on to its next step");
    assert(await sheetOpen(page), "Enter closed Choose the games");
    await closeGamesByShade(page);
    assert(await page.evaluate((S) => document.querySelector(S)?.lxStep?.checkMark === true, SESSION), "closing the sheet moved the step on");
    return "the answered round stayed under the sheet";
  } finally {
    await close();
  }
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.slice(0, 3).join(" | "));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
const failed = Object.values(results).filter((result) => !result.ok).length;
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} passed`);
process.exit(failed ? 1 : 0);
