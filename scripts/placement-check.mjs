// Find your level (study/placement.js, session.js's placement) in the real app on a phone, by real presses, at 390 × 844 and 320 × 568, in dark
// (Graphite) and light (Paper), on a full course (Dutch, or --lang's): the first run's second question (No, I'm new to it opening nothing; an
// answer starting the check: unit 1's two questions first, then where the answer lands it); a learner who knows units 1 to 7 placed at unit 8
// (each answer's result shown as a lesson's, a wrong one with the right answer, I don't know's the same, waiting for Continue: a step that goes
// on by itself fails it; each step its unit's, its count "Finding your level", no Hint, Words or Can't listen now, no meaning on a tapped word
// before it's answered, nothing scrolling; its bar never going back and full at its result; only right answers kept; nothing asked of the
// server but the account's own copy, the library and error reports); its result (Start at unit 8, the units behind with a check and 8 next)
// and Start unit 8 opening unit 8's first lesson, then Practice; stopping partway (Stop here?, Keep going, then Start at the unit it says, no
// further than the highest unit answered right but one); knowing nothing (a few questions only, Start from the beginning, no box, Start lesson 1
// opening lesson 1, then Practice); knowing it all (proof across the last third, You know this course with Tinta's heart and the words you'll
// know, Start practice opening Practice from the late units too, Home then saying that number); Study's row offered to a new learner and gone
// once it's taken; Settings → Study's place on the path, Start from the beginning and its Undo; placed at 8, Home's and Knowledge's words known
// well counting what it placed, and a word's History with its placement, a miss after it above it. Pictures of each screen.
// node scripts/placement-check.mjs http://localhost:<port> <outDir> [--only <regex>] [--sizes 390x844,320x568] [--schemes dark,light] [--lang nl]
//   LOCAL only (it signs up accounts); a copy with the course's lessons (npm run local); through gpu.py's parallel lane (exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { SESSION, answerStep, nextStep } from "./fixtures/play-session.mjs";
import { KNOW_SOME, WELCOME, pastKnowSome } from "./fixtures/first-run.mjs";

// The first run is this check's to see (quiet-browser.mjs skips it for every other check).
process.env.LX_FIRST_RUN = "1";
const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
if (!/^http:\/\/localhost:\d+$/.test(BASE ?? "") || !outArg) {
  console.error("Usage: node scripts/placement-check.mjs http://localhost:<port> <outDir> [--only <regex>] [--sizes 390x844,320x568] [--schemes dark,light] (LOCAL only)");
  process.exit(2);
}
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const ONLY = argv.includes("--only") ? new RegExp(opt("only"), "i") : null;
const SIZES = opt("sizes", "390x844,320x568").split(",").map((s) => s.split("x").map(Number));
const SCHEMES = opt("schemes", "dark,light").split(",");
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
const KNOWS = 7; // the scripted learner knows units 1 to 7
const LANG = opt("lang", "nl");
const NAME = { nl: "Dutch", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", it: "Italian", ru: "Russian", ja: "Japanese" }[LANG];
if (!NAME) {
  console.error(`--lang: a full course's code (nl, es, fr, de, pt, it, ru, ja), not ${LANG}`);
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
let failed = 0;
let passed = 0;
const report = [];
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};

async function phone([width, height], scheme) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce", colorScheme: scheme, locale: "en-US" });
  // Paper for the light pictures from the very first frame (the first run comes before any setting): the look's own key, as Settings → Appearance keeps it.
  if (scheme === "light") await context.addInitScript(() => {
    try {
      if (!localStorage.getItem("lx.appearance.v1")) localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme: "paper" }));
    } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const asked = [];
  page.on("request", (r) => asked.push(`${r.method()} ${new URL(r.url()).pathname}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return { context, page, errors, asked };
}
const ready = (page) => page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
async function signUp(page) {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Placement Check");
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await ready(page);
}
// The first run's two questions: Dutch, then the answer given.
// The first run as far as its second question: Dutch pressed, the question whether you know some up. Its answer goes through
// fixtures/first-run.mjs pastKnowSome, as every check's does.
async function firstRun(page) {
  const language = page.locator(`${WELCOME} [data-language="${LANG}"]`);
  await language.waitFor({ timeout: 30_000 });
  await language.click();
  await page.locator(KNOW_SOME).first().waitFor({ timeout: 10_000 });
}
// Dutch's lessons on the device (a placement waits for them; a check reads the units from them).
const lessonsIn = (page) =>
  page.evaluate(async () => {
    const { placementUnits } = await import("/js/study/placement.js");
    for (let waited = 0; waited < 120_000; waited += 500) {
      const units = placementUnits();
      if (units.length >= 16) return units.map((unit) => ({ n: unit.n, title: unit.title, first: unit.first.id }));
      await new Promise((r) => setTimeout(r, 500));
    }
    return [];
  });
const shot = (page, dir, name) => page.screenshot({ path: join(dir, `${name}.png`) });
// What the session shows now: its step's unit, its count's words, its bar, what's in its bar of actions, and whether anything scrolls.
const look = (page) =>
  page.evaluate((S) => {
    const root = document.querySelector(S);
    if (!root) return null;
    const bar = root.querySelector('[data-part="session-progress"]');
    const activity = root.querySelector('[data-part="activity"]');
    return {
      unit: root.lxStep?.placement?.unit ?? null,
      kind: root.lxStep?.kind ?? null,
      // The right answer as a result says it: a word's, a sentence's English.
      answer: root.lxStep?.kind === "word" ? (root.lxStep.options?.[root.lxStep.correct] ?? null) : root.lxStep?.kind === "translate" ? (root.lxStep.item?.means ?? null) : null,
      count: root.querySelector(".lx-session-count")?.textContent ?? "",
      filled: Number(bar?.getAttribute("aria-valuenow") ?? 0),
      of: Number(bar?.getAttribute("aria-valuemax") ?? 0),
      actions: [...root.querySelectorAll('[data-part="answer-bar"] [data-part="button"]')].map((b) => b.textContent.trim()),
      scrolls: activity ? activity.scrollHeight > activity.clientHeight + 1 : false,
      fit: activity ? `${activity.scrollHeight} in ${activity.clientHeight}, data-fit ${root.getAttribute("data-fit") ?? "none"}, order-fit ${root.hasAttribute("data-order-fit")}, step ${root.getAttribute("data-step")}` : "",
      summary: Boolean(root.querySelector('[data-part="session-summary"][data-kind="placement"]')),
    };
  }, SESSION);

async function stage(name, run) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const note = await run();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
    report.push({ name, ok: true, note });
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${String(error.message ?? error).split("\n").slice(0, 2).join(" | ")}`);
    report.push({ name, ok: false, note: String(error.message ?? error) });
  }
}

/** Plays a placement to its result as a learner who knows units 1..knows (right there, wrong past it), every step looked at. */
async function playAs(page, dir, knows, { pictures = false } = {}) {
  const seen = [];
  let last = 0;
  let wordShot = false;
  let sentenceShot = false;
  const shots = { right: false, wrongWord: false, wrongSentence: false, dontKnow: false };
  for (let i = 0; i < 50; i++) {
    const step = await nextStep(page);
    if (!step || step.kind === "summary") break;
    const now = await look(page);
    ok(now.unit, `step ${i + 1} (${now.kind}) carries no unit`);
    ok(now.count === "Finding your level", `its count says "${now.count}"`);
    ok(!now.actions.some((a) => /Hint|Words|Can't listen/.test(a)), `its actions: ${now.actions.join(", ")}`);
    if (now.scrolls) {
      await shot(page, dir, `scrolls-step-${i + 1}`);
      ok(false, `step ${i + 1} (${now.kind}, unit ${now.unit}) scrolls: ${now.fit}`);
    }
    const share = now.of ? now.filled / now.of : 0;
    ok(share + 1e-9 >= last, `its bar went back: ${last.toFixed(2)} → ${share.toFixed(2)}`);
    ok(share < 1, "its bar full before the result");
    last = share;
    if (pictures && !wordShot && now.kind === "word") {
      await shot(page, dir, "2-word-question");
      wordShot = true;
    }
    if (pictures && !sentenceShot && now.kind === "translate") {
      // A word tapped in the sentence: no meaning comes up.
      const word = page.locator(`${SESSION} [data-part="spoken-word"]`).first();
      if (await word.count()) {
        await word.click();
        await page.waitForTimeout(300);
        ok(!(await page.locator('[data-part="word-popover"]').count()), "a tapped word's meaning came up");
      }
      await shot(page, dir, "3-sentence-question");
      sentenceShot = true;
    }
    seen.push(`${now.unit}${now.kind[0]}`);
    const wrong = now.unit > knows;
    // Once a wrong word's result is pictured, the next step past what's known is answered I don't know.
    const dontKnow = pictures && shots.wrongWord && !shots.dontKnow && wrong;
    await page.evaluate((S) => (globalThis.__lxAnswered = document.querySelector(S)?.lxStep ?? null), SESSION);
    if (dontKnow) await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "I don't know" }).click();
    else await answerStep(page, { wrong, next: false });
    // Its result, as a lesson's (right or wrong, a wrong one with the right answer), and nothing goes on by itself: a moment on, the same
    // step is still up, its Continue waiting for a press.
    const go = page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first();
    await go.waitFor({ timeout: 5_000 });
    await page.waitForTimeout(i === 0 ? 2500 : 600);
    const still = await page.evaluate((S) => document.querySelector(S)?.lxStep === globalThis.__lxAnswered && !document.querySelector(`${S} [data-part="session-summary"]`), SESSION);
    ok(still, `step ${i + 1} (${now.kind}) went on without a press`);
    const result = (await page.locator(`${SESSION} [data-part="answer-bar"]`).innerText()).replace(/\s+/g, " ");
    if ((wrong || dontKnow) && now.answer) ok(result.includes(now.answer.replace(/\s+/g, " ")), `step ${i + 1}'s result doesn't give its answer "${now.answer}": ${result.slice(0, 160)}`);
    if (pictures) {
      const take = async (key, name) => {
        if (shots[key]) return;
        shots[key] = true;
        await page.waitForTimeout(400);
        await shot(page, dir, name);
      };
      if (dontKnow) await take("dontKnow", "3d-dont-know");
      else if (!wrong) await take("right", "2b-right-result");
      else if (now.kind === "word") await take("wrongWord", "2c-wrong-word");
      else await take("wrongSentence", "3c-wrong-sentence");
    }
    await go.click();
  }
  if (pictures) ok(Object.values(shots).every(Boolean), `results not pictured: ${Object.entries(shots).filter(([, v]) => !v).map(([k]) => k)}`);
  await page.locator(`${SESSION} [data-part="session-summary"][data-kind="placement"]`).waitFor({ timeout: 10_000 });
  const end = await look(page);
  ok(end.filled === end.of && end.of > 0, `its bar at the result: ${end.filled} of ${end.of}`);
  return { seen, questions: seen.length };
}

/**
 * Practice right after (opened: already opening, from the result's Start practice; else the session up is closed and Practice opened): its
 * first step pictured; how many steps it has (its count), and the unit each of its first eight is taught in (its sentence's latest word's, or
 * its word's), each answered right to reach the next; or what it says when it has none.
 */
async function practiceAfter(page, dir, name, { opened = false } = {}) {
  if (!opened) {
    // The session up (a lesson) closed first, so nothing of it is read as Practice's.
    await page.evaluate(() => (location.hash = "#study"));
    await page.waitForSelector(SESSION, { state: "detached", timeout: 20_000 });
    await page.evaluate(() => (location.hash = "#study/session/practice"));
  }
  await page.waitForSelector(`${SESSION}:not([data-placement])`, { timeout: 30_000 });
  // A step, or (nothing to practice yet) its empty state.
  const what = await page.waitForFunction(
    (S) => {
      const root = document.querySelector(S);
      if (!root) return null;
      if (root.querySelector('[data-part="empty-state"]')) return "empty";
      return root.lxStep || root.querySelector('[data-part="session-summary"]') ? "step" : null;
    },
    SESSION,
    { timeout: 30_000 },
  );
  const empty = (await what.jsonValue()) === "empty";
  await page.waitForTimeout(800);
  await shot(page, dir, name);
  if (empty) return { steps: 0, units: [], empty: (await page.locator(SESSION).innerText()).replace(/\s+/g, " ").slice(0, 120) };
  const first = await nextStep(page);
  if (!first || first.kind === "summary") return { steps: 0, units: [], empty: "a summary" };
  const steps = Number((await page.locator(`${SESSION} .lx-session-count`).innerText()).split("/")[1] ?? 0);
  const units = [];
  for (let i = 0; i < 8; i++) {
    const step = i ? await nextStep(page) : first;
    if (!step || step.kind === "summary") break;
    units.push(
      await page.evaluate(async (S) => {
        const { placementUnits } = await import("/js/study/placement.js");
        const taughtIn = new Map();
        for (const unit of placementUnits()) for (const lesson of unit.lessons) for (const thing of lesson.things ?? []) if (thing.lemma && !taughtIn.has(thing.lemma)) taughtIn.set(thing.lemma, unit.n);
        const step = document.querySelector(S)?.lxStep ?? {};
        return Math.max(0, ...(step.item?.words ?? []).map(([, lemma]) => taughtIn.get(lemma) ?? 0), taughtIn.get(step.target) ?? 0);
      }, SESSION),
    );
    await answerStep(page);
  }
  return { steps, units };
}

for (const scheme of SCHEMES) {
  for (const size of SIZES) {
    const tag = `${size[0]}x${size[1]} ${scheme}`;
    const dir = join(OUT, `${scheme}-${size[0]}`);
    mkdirSync(dir, { recursive: true });

    await stage(`${tag}: the first run asks a full course's learner whether they know some already; an answer starts the check at its unit; a learner of units 1–7 is placed at unit 8, by real presses, only right answers kept`, async () => {
      const { context, page, errors, asked } = await phone(size, scheme);
      await signUp(page);
      await firstRun(page);
      const words = await page.locator(WELCOME).innerText();
      ok(new RegExp(`Do you know some ${NAME} already\\?`).test(words) && /about 20 questions/.test(words) && /No, I'm new to it/.test(words), `the question: ${words.replace(/\s+/g, " ").slice(0, 200)}`);
      await page.waitForTimeout(600);
      await shot(page, dir, "1-first-run");
      const startedAt = Date.now();
      const from = asked.length;
      await pastKnowSome(page, { start: "few" });
      const units = await lessonsIn(page);
      ok(units.length === 16, `Dutch's units: ${units.length}`);
      await page.waitForSelector(`${SESSION}[data-placement]`, { timeout: 60_000 });
      const first = await look(page);
      ok(first.unit === 1, `its first question from unit ${first.unit}`);
      const played = await playAs(page, dir, KNOWS, { pictures: true });
      // Unit 1's two first, then (both right) where A few words lands it.
      ok(/^1/.test(played.seen[0]) && /^1/.test(played.seen[1]) && /^3/.test(played.seen[2]), `its first three questions' units: ${played.seen.slice(0, 3)}`);
      // Its result.
      const result = (await page.locator(`${SESSION} [data-part="session-summary"]`).innerText()).replace(/\s+/g, " ");
      ok(/Start at unit 8/.test(result) && result.includes(`Unit 8 · ${units[7].title} is next`) && /Units 1 to 7 are behind you/.test(result), `its result: ${result.slice(0, 220)}`);
      const checks = await page.locator(`${SESSION} .lx-placement-row[data-done] .lx-placement-done`).count();
      ok(checks === 7, `units behind with a check: ${checks}`);
      // Its tally's labels each on one line, as a summary's are (two words, units tried, broke at 320 out of line with the rest).
      const lines = await page.locator(`${SESSION} [data-part="session-summary"] .lx-stat > span`).evaluateAll((spans) =>
        spans.map((span) => {
          const range = document.createRange();
          range.selectNodeContents(span);
          return [span.textContent, new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size];
        }),
      );
      ok(lines.length === 3 && lines.every(([, n]) => n === 1), `its tally's labels: ${JSON.stringify(lines)}`);
      await page.waitForTimeout(500);
      await shot(page, dir, "4-placed");
      // Only right answers kept.
      const rows = await page.evaluate(async (t0) => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.at >= t0).map((row) => row.outcome), startedAt);
      ok(rows.length > 0 && rows.every((o) => o === "right"), `kept: ${[...new Set(rows)].join(", ")} (${rows.length})`);
      // Nothing asked of the server meanwhile but what the app syncs anyway (the account's copy, your packs' relay), error reports and the library:
      // a placement sends nothing of its own.
      // (The progress sync's own read of the account's clears, GET /api/progress/clears, any time it syncs; making a clear is a POST, and fails.)
      const outside = asked.slice(from).filter((one) => one.includes(" /api/") && !/^[A-Z]+ \/api\/(account\/sync|packs\/(device|inbox)|errors|me)\b/.test(one) && one !== "GET /api/progress/clears");
      ok(!outside.length, `asked: ${[...new Set(outside)].join(", ")}`);
      // Start unit 8: its first lesson, the path placed.
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Start unit 8" }).click();
      await page.waitForSelector(`${SESSION}[data-lesson="${units[7].first}"]`, { timeout: 30_000 });
      const placed = await page.evaluate(async (lang) => (await import("/js/study/path-place.js")).placementOn(lang)?.placed, LANG);
      ok(placed?.n === 8 && placed.lessons.length > 60, `the placement kept: ${JSON.stringify(placed && { n: placed.n, lessons: placed.lessons.length })}`);
      const practice = await practiceAfter(page, dir, "4b-practice-after-placed");
      ok(practice.steps >= 5, `Practice after it: ${JSON.stringify(practice)}`);
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
      return `${played.questions} questions (${played.seen.join(" ")}), ${rows.length} right answers kept; Practice after it ${practice.steps} steps, from units ${practice.units.join(" ")}`;
    });

    await stage(`${tag}: No, I'm new to it opens nothing and takes nothing; Study offers Find your level to a new learner`, async () => {
      const { context, page, errors } = await phone(size, scheme);
      await signUp(page);
      await firstRun(page);
      ok(await pastKnowSome(page), "not asked whether they know some");
      await page.waitForTimeout(800);
      ok(!(await page.locator(SESSION).count()), "a session opened");
      const taken = await page.evaluate(async (lang) => (await import("/js/study/path-place.js")).placementOn(lang), LANG);
      ok(!taken, `noted: ${JSON.stringify(taken)}`);
      await lessonsIn(page);
      await page.evaluate(() => (location.hash = "#study"));
      const offer = page.locator('[data-part="page"]:not([data-ghost]) [data-part="list-row"]', { hasText: `Know some ${NAME} already?` });
      await offer.waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      await shot(page, dir, "7-study-row");
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
    });

    await stage(`${tag}: stopping partway asks Stop here?; Keep going goes on; Start at the unit it says (no further than the highest unit answered right but one, nor the unit after the highest with two sentences right) opens that unit's first lesson; and Study's row is gone once it's been taken`, async () => {
      const { context, page, errors } = await phone(size, scheme);
      await signUp(page);
      await firstRun(page);
      await pastKnowSome(page, { start: "by" });
      const units = await lessonsIn(page);
      await page.waitForSelector(`${SESSION}[data-placement]`, { timeout: 60_000 });
      let highest = 0;
      const sentences = [];
      for (let i = 0; i < 5; i++) {
        await nextStep(page);
        const now = await look(page);
        highest = Math.max(highest, now.unit);
        if (now.kind !== "word") sentences.push(now.unit);
        await answerStep(page);
      }
      // No further than the unit after the highest with two sentences right at it or above (every answer here is right).
      sentences.sort((a, b) => b - a);
      const evidence = (sentences[1] ?? 0) + 1;
      await nextStep(page);
      await page.locator(`${SESSION} [data-part="session-bar"] [data-part="icon-button"]`).first().click();
      const sheet = page.locator("[data-placement-stop]");
      await sheet.waitFor({ timeout: 10_000 });
      const words = (await sheet.innerText()).replace(/\s+/g, " ");
      const at = Number(words.match(/Start at unit (\d+)/)?.[1] ?? 0);
      ok(/Stop here\?/.test(words) && at >= 2 && at <= Math.min(highest + 1, evidence) && words.includes(`shown ${at === 2 ? "unit 1" : `units 1 to ${at - 1}`}`) && /Keep going/.test(words), `the sheet (five right, the highest unit ${highest}, sentences right at ${sentences}): ${words}`);
      await page.waitForTimeout(500);
      await shot(page, dir, "5-stop");
      const before = (await look(page)).unit;
      await sheet.getByRole("button", { name: "Keep going" }).click();
      await page.waitForTimeout(500);
      ok((await look(page))?.unit === before, "Keep going didn't leave the check where it was");
      await page.locator(`${SESSION} [data-part="session-bar"] [data-part="icon-button"]`).first().click();
      await page.locator("[data-placement-stop]").getByRole("button", { name: `Start at unit ${at}` }).click();
      await page.waitForSelector(`${SESSION}[data-lesson="${units[at - 1].first}"]`, { timeout: 30_000 });
      await page.keyboard.press("Escape");
      await page.evaluate(() => (location.hash = "#study"));
      await page.waitForTimeout(1500);
      const offered = await page.locator('[data-part="page"]:not([data-ghost]) [data-part="list-row"]', { hasText: `Know some ${NAME} already?` }).count();
      ok(offered === 0, "Study still offers it once it's been taken");
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
      return `five right (the highest unit ${highest}, sentences right at ${sentences.join(" ")}), stopped: unit ${at}`;
    });

    await stage(`${tag}: knowing nothing: Start from the beginning (Tinta, no box), Start lesson 1 opening lesson 1, nothing placed`, async () => {
      const { context, page, errors } = await phone(size, scheme);
      await signUp(page);
      await firstRun(page);
      await pastKnowSome(page, { start: "few" });
      const units = await lessonsIn(page);
      await page.waitForSelector(`${SESSION}[data-placement]`, { timeout: 60_000 });
      const played = await playAs(page, dir, 0);
      ok(played.questions <= 8, `a newcomer asked ${played.questions} questions: ${played.seen.join(" ")}`);
      const result = (await page.locator(`${SESSION} [data-part="session-summary"]`).innerText()).replace(/\s+/g, " ");
      ok(/Start from the beginning/.test(result) && /Lesson 1 is the place to start/.test(result), `its result: ${result}`);
      ok(!(await page.locator(`${SESSION} [data-part="session-summary"] [data-part="empty-state"]`).count()), "an empty state's box on it");
      ok(await page.locator(`${SESSION} .lx-placement-tinta lx-tinta, ${SESSION} .lx-placement-tinta [data-part="character"]`).count(), "no Tinta on it");
      await page.waitForTimeout(800);
      await shot(page, dir, "6-beginning");
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Start lesson 1" }).click();
      await page.waitForSelector(`${SESSION}[data-lesson="${units[0].first}"]`, { timeout: 30_000 });
      const placement = await page.evaluate(async (lang) => (await import("/js/study/path-place.js")).placementOn(lang), LANG);
      ok(placement && !placement.placed && placement.taken > 0, `noted: ${JSON.stringify(placement)}`);
      const practice = await practiceAfter(page, dir, "6b-practice-after-beginning");
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
      return `${played.questions} questions (${played.seen.join(" ")}); Practice after it: ${practice.steps} steps${practice.empty ? ` (${practice.empty})` : ""}`;
    });

    await stage(`${tag}: knowing it all: proof across the last third; You know this course with Tinta's heart, the words you'll know and the ideas, its tally; Start practice opens Practice, drawing on the late units too; Home then says the number it said, and Home, Study and the path offer nothing of the course as new`, async () => {
      const { context, page, errors } = await phone(size, scheme);
      await signUp(page);
      await firstRun(page);
      await pastKnowSome(page, { start: "talk" });
      const units = await lessonsIn(page);
      await page.waitForSelector(`${SESSION}[data-placement]`, { timeout: 60_000 });
      const played = await playAs(page, dir, 16);
      const top = played.seen.filter((one) => Number(one.match(/^\d+/)[0]) >= 12).length;
      ok(top >= 6, `asked in the last third: ${top} (${played.seen.join(" ")})`);
      const summary = page.locator(`${SESSION} [data-part="session-summary"][data-kind="placement"][data-whole]`);
      await summary.waitFor({ timeout: 10_000 });
      const result = (await summary.innerText()).replace(/\s+/g, " ");
      const said = Number((await summary.locator(".lx-placement-known strong").innerText()).replace(/\D/g, ""));
      ok(/You know this course/.test(result) && said > 300 && new RegExp(`All ${units.length} units, and the \\d+ ideas they teach, count as yours`).test(result), `its result: ${result.slice(0, 260)}`);
      ok(await summary.locator(".lx-placement-tinta lx-tinta, .lx-placement-tinta [data-part='character']").count(), "no Tinta on it");
      const actions = await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`).allInnerTexts();
      ok(actions[0] === "Start practice" && actions[1] === "See what's next" && actions.length === 3, `its ways on: ${actions.join(", ")}`);
      const reach = await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`).evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().bottom <= innerHeight));
      ok(reach.every(Boolean), `a way on below the screen: ${reach}`);
      await page.waitForTimeout(1500);
      await shot(page, dir, "13-knows-everything");
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Start practice" }).click();
      const placed = await page.evaluate(async (lang) => {
        for (let i = 0; i < 40; i++) {
          const p = (await import("/js/study/path-place.js")).placementOn(lang)?.placed;
          if (p) return { n: p.n, seeds: p.seeds.length };
          await new Promise((r) => setTimeout(r, 250));
        }
        return null;
      }, LANG);
      ok(placed?.n === units.length + 1 && placed.seeds > 500, `the placement kept: ${JSON.stringify(placed)}`);
      const practice = await practiceAfter(page, dir, "14-practice-after-everything", { opened: true });
      ok(practice.steps >= 5 && practice.units.some((n) => n >= 9), `Practice after it: ${JSON.stringify(practice)}`);
      await page.keyboard.press("Escape");
      await page.evaluate(() => (location.hash = "#today"));
      await page.waitForTimeout(2000);
      const homeText = (await page.locator('[data-part="page"]:not([data-ghost])').innerText()).replace(/,/g, "");
      const home = Number((homeText.match(/(\d+)\s*words you know well/) ?? [])[1] ?? -1);
      await shot(page, dir, "15-home-everything");
      ok(home === said, `Home says ${home}, the result said ${said}`);
      // What's next is past the course, on Home, on Study and on the path: no lesson of it, a unit's whole-unit lesson included, offered as new.
      const course = units.map((unit) => unit.title);
      const nextNow = await page.evaluate(async () => {
        const plan = await import("/js/study/plan.js");
        const next = plan.lessonNow();
        return { id: next?.id ?? null, title: next?.title ?? null, full: Boolean(next?.full), left: plan.pathOverview(600).lessons.filter((one) => (one.id.startsWith(`path-`) || one.full) && one.state !== "done").map((one) => one.id) };
      });
      ok(!nextNow.id || !(nextNow.id.startsWith(`path-${LANG}/`) || nextNow.full), `Learn something new: ${JSON.stringify(nextNow)}`);
      ok(!nextNow.left.length, `course lessons not done: ${nextNow.left.slice(0, 3)}`);
      ok(!/Whole unit/.test(homeText) && !course.some((title) => homeText.includes(`Unit 1 · ${title}`)), `Home offers a course lesson: ${homeText.slice(0, 300)}`);
      await page.evaluate(() => (location.hash = "#study"));
      await page.waitForTimeout(2000);
      const studyText = await page.locator('[data-part="page"]:not([data-ghost])').innerText();
      ok(!/Whole unit/.test(studyText) && !/Know some \w+ already\?/.test(studyText), `Study offers a course lesson or the test again: ${studyText.replace(/\s+/g, " ").slice(0, 300)}`);
      await shot(page, dir, "16-study-everything");
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
      return `${played.questions} questions, ${top} in the last third; ${said} words you know; Practice after it ${practice.steps} steps, from units ${practice.units.join(" ")}; Learn something new: ${nextNow.title ?? "none"}`;
    });

    await stage(`${tag}: Settings → Study: Find your level (last placed at unit 8), Start from the beginning and its Undo`, async () => {
      const { context, page, errors } = await phone(size, scheme);
      await signUp(page);
      await firstRun(page);
      await pastKnowSome(page, { start: "few" });
      await lessonsIn(page);
      await page.waitForSelector(`${SESSION}[data-placement]`, { timeout: 60_000 });
      await playAs(page, dir, KNOWS);
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Start unit 8" }).click();
      await page.waitForTimeout(1500);
      await page.evaluate(() => (location.hash = "#settings/study"));
      const find = page.locator('[data-part="page"]:not([data-ghost]) [data-part="list-row"]', { hasText: "Find your level" });
      await find.waitFor({ timeout: 20_000 });
      ok(/Last placed at unit 8/.test(await find.innerText()), `its row: ${await find.innerText()}`);
      await page.waitForTimeout(600);
      await shot(page, dir, "8-settings");
      await page.locator('[data-part="page"]:not([data-ghost]) [data-part="list-row"]', { hasText: "Start from the beginning" }).click();
      await page.waitForTimeout(500);
      const cleared = await page.evaluate(async (lang) => (await import("/js/study/path-place.js")).placementOn(lang)?.placed ?? null, LANG);
      ok(cleared === null, "still placed after Start from the beginning");
      await shot(page, dir, "9-settings-undo");
      // Its Undo where it can be pressed as it shows, nothing scrolled: in view, and nothing over it (at the page's end, a 320 × 568 phone's
      // tab bar was).
      const undo = page.locator(".lx-settings-message").getByRole("button", { name: "Undo" });
      const reach = await undo.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return { top: Math.round(box.top), bottom: Math.round(box.bottom), height: innerHeight, pressable: Boolean(at && button.contains(at)) };
      });
      ok(reach.pressable && reach.top >= 0 && reach.bottom <= reach.height, `its Undo can't be pressed where it shows: ${JSON.stringify(reach)}`);
      await undo.click();
      await page.waitForTimeout(500);
      const back = await page.evaluate(async (lang) => (await import("/js/study/path-place.js")).placementOn(lang)?.placed?.n ?? null, LANG);
      ok(back === 8, `after Undo: placed at ${back}`);
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
    });
  }
}


for (const scheme of SCHEMES) {
  for (const size of SIZES) {
    const tag = `${size[0]}x${size[1]} ${scheme}`;
    const dir = join(OUT, `${scheme}-${size[0]}`);
    await stage(`${tag}: placed at 8, Home and Knowledge count what it placed as words you know well; a word's History has its placement, and a miss after it above it`, async () => {
      const { context, page, errors } = await phone(size, scheme);
      await signUp(page);
      await firstRun(page);
      await pastKnowSome(page, { start: "few" });
      await lessonsIn(page);
      await page.waitForSelector(`${SESSION}[data-placement]`, { timeout: 60_000 });
      await playAs(page, dir, KNOWS);
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Start unit 8" }).click();
      await page.waitForTimeout(1500);
      const facts = await page.evaluate(async (lang) => {
        const seeds = (await import("/js/study/path-place.js")).placementOn(lang)?.placed?.seeds ?? [];
        const { counts } = await import("/js/know/word-index.js");
        const { unitEvidence } = await import("/js/study/progress.js");
        const { placementUnits } = await import("/js/study/placement.js");
        const third = new Set(placementUnits()[2].words.map((word) => `w:${word.key}`));
        // A unit-3 word the test itself never asked: its History is the placement alone.
        const word = seeds.map(([unit]) => unit).find((unit) => third.has(unit) && !unitEvidence(unit, lang).length);
        return { wordish: seeds.filter(([unit]) => /^[wc]:/.test(unit)).length, understood: counts({ lang }).understood, word };
      }, LANG);
      ok(facts.wordish > 250 && facts.understood === facts.wordish, `known well ${facts.understood}, placed ${facts.wordish}`);
      const countOn = async (hash) => {
        await page.evaluate((h) => (location.hash = h), hash);
        await page.waitForTimeout(1800);
        const text = await page.locator('[data-part="page"]:not([data-ghost])').innerText();
        return Number(text.replace(/,/g, "").match(/(\d+)\s*words you know well/)?.[1] ?? -1);
      };
      const home = await countOn("#today");
      await shot(page, dir, "10-home-placed");
      const knowledge = await countOn("#know");
      await shot(page, dir, "11-knowledge-placed");
      ok(home === facts.wordish && knowledge === facts.wordish, `Home says ${home}, Knowledge ${knowledge}, placed ${facts.wordish}`);
      // A miss on it now, as a game records one (progress.js record): its History the miss, then the placement under it.
      await page.evaluate(async (unit) => (await import("/js/study/progress.js")).record([{ concept: unit, outcome: "wrong", activity: "word", test: "recall", skill: "read" }]), facts.word);
      await page.evaluate((u) => (location.hash = `#know/${u}`), facts.word);
      const history = page.locator('[data-part="page"]:not([data-ghost]) .lx-shelf-row', { hasText: "History" });
      await history.waitFor({ timeout: 10_000 });
      await history.click();
      await page.waitForTimeout(500);
      const rows = await page.locator('[data-part="page"]:not([data-ghost]) .lx-concept-history [data-part="list-row"]').evaluateAll((nodes) => nodes.map((n) => n.innerText.replace(/\s+/g, " ").trim()));
      ok(rows.length === 2 && /Missed/.test(rows[0]) && /Placed by Find your level/.test(rows[1]) && /Known/.test(rows[1]), `its History: ${JSON.stringify(rows)}`);
      await history.evaluate((n) => n.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(400);
      await shot(page, dir, "12-history-placed");
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
      return `${facts.wordish} known well on Home and Knowledge; ${facts.word}'s History: ${rows.map((r) => r.split(" ")[0]).join(", ")}`;
    });
  }
}

writeFileSync(join(OUT, "results.json"), JSON.stringify(report, null, 1));
await browser.close();
console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
process.exit(failed ? 1 : 0);
