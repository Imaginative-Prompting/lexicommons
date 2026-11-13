// The typing games in the real app on a phone, by the keyboard, as a learner six lessons in: Type the word (Pick the word's twin), Type in the
// gap (Fill the gap's twin) and Type what it says (a heard sentence's one missing word). Each opens on its own game, takes a right answer and
// a wrong one through the field and the bar's Check (Enter checks too), says so, shows your typing against the word when it's wrong, and
// records the answer as the game's own evidence (study/progress.js TESTS: the word or the gap's word, recall, said or heard). Pick the word and
// Type the word show the word's drawing under its English when it has one, and none when it hasn't. With Settings → Type it's accents strict,
// a word typed without its accents is wrong; forgiving, it's right. A wrong answer in a gap game (and Fill's, the tapped one) moves nothing in one
// frame, every frame recorded (frame-watch.mjs: a planted jump caught first), the gap where it was unless the result needs its room, and then on
// the result's curve; both ways on sentences found at run time (one whose result leaves the room clear: it stays; one whose result needs it: it
// moves until it's clear). Type it's marked line in view under a result with an explanation at 320 × 568 and on an SE's screen once the keys go,
// the field folding instead of it where the result leaves no room. No page errors. LOCAL only (it signs up an account), path-nl seeded.
//   node scripts/typing-games-check.mjs http://localhost:<port> <outDir> [--only <regex>]   (exit 0 = pass; --only: those stages, after the first)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { routeStillPlan } from "./fixtures/still-plan.mjs";
import * as fw from "./frame-watch.mjs";

const [BASE, outArg] = process.argv.slice(2);
const ONLY = process.argv.includes("--only") ? new RegExp(process.argv[process.argv.indexOf("--only") + 1], "i") : null;
if (!BASE || !outArg || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("usage: typing-games-check.mjs http://localhost:<port> <outDir> (LOCAL only: it signs up an account)");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.log("FAIL  timed out"), process.exit(3)), 10 * 60_000).unref();

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
// A set plan for the pictures and the accents (mode "still" plays globalThis.__stillPlan: fixtures/still-plan.mjs); every other session is the app's own.
const stillPlan = await routeStillPlan(context);
const page = await context.newPage();
await fw.install(page);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });

// The step on screen, as the session holds it.
const stepNow = () =>
  page.evaluate((S) => {
    const step = document.querySelector(S)?.lxStep;
    if (!step) return null;
    const gap = step.item?.gap ? step.item.words[step.item.gap.index] : null;
    return { kind: step.kind, unit: step.unit ?? null, text: step.text ?? (gap ? gap[0].replace(/[.,;:!?…»”"')\]]+$/u, "") : null), lemma: gap?.[1] ?? step.target ?? null, picture: step.picture ?? null, item: step.item?.id ?? null };
  }, SESSION);
// The evidence rows written since `from` (rows are in order).
const rowsSince = (from) => page.evaluate(async (n) => (await import("/js/study/progress.js")).allEvidence().slice(n).map(({ concept, outcome, test, skill, activity, said }) => ({ concept, outcome, test, skill, activity, said })), from);
const rowCount = () => page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().length);
const openGame = async (kind) => {
  await page.evaluate((k) => (location.hash = `#study/session/game/${k}`), kind);
  await page.waitForFunction(([S, k]) => document.querySelector(S)?.getAttribute("data-step") === k, [SESSION, kind], { timeout: 20_000 });
  await page.waitForTimeout(500);
};
const openPlan = async (steps) => {
  await page.evaluate((list) => {
    globalThis.__stillPlan = { title: "Check", steps: list };
    location.hash = "#study/session/still/check";
  }, steps);
  await page.waitForFunction(([S, k]) => document.querySelector(S)?.getAttribute("data-step") === k, [SESSION, steps[0].kind], { timeout: 20_000 });
  await page.waitForTimeout(500);
};
const leave = async () => {
  await page.evaluate(() => (location.hash = "#study"));
  await page.waitForFunction(() => !document.querySelector('[data-part="session"]'), null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(400);
};
const field = () => page.locator(`${SESSION} [data-part="gap-field"], ${SESSION} [data-part="type-answer"] [data-part="text-field"]`).first();
// Types into the field by the keyboard and presses the bar's Check (or Enter); then the feedback's title.
async function typeAndCheck(text, { enter = false } = {}) {
  await field().click();
  await page.keyboard.type(text, { delay: 20 });
  if (enter) await page.keyboard.press("Enter");
  else await page.locator(SESSION).getByRole("button", { name: "Check", exact: true }).click();
  await page.locator(`${SESSION} [data-part="feedback"]`).first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  return page.locator(`${SESSION} [data-part="feedback"]`).first().innerText();
}
const next = () => page.locator(SESSION).getByRole("button", { name: "Continue" }).click();
const wrongly = (text) => `${text.slice(0, -1)}${text.at(-1) === "x" ? "q" : "x"}`;

await stage("a learner six lessons in: a new account, the path's first six lessons answered right a day ago", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Typing check");
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

for (const [kind, name, skill] of [["type-word", "Type the word", "say"], ["type-gap", "Type in the gap", "say"], ["hear-gap", "Type what it says", "hear"]]) {
  await stage(`${name} (${kind}): its own session, a right answer and a wrong one by the keyboard, each said and recorded as ${kind}, recall, ${skill}`, async () => {
    await openGame(kind);
    const first = await stepNow();
    assert(first?.kind === kind && first.text, `the first step: ${JSON.stringify(first)}`);
    assert((await field().count()) === 1, "no field to type in");
    const gap = kind !== "type-word";
    assert(gap === ((await page.locator(`${SESSION} [data-part="gap-field"]`).count()) === 1), gap ? "the field isn't in the sentence's gap" : "a gap where the word is typed on its own");
    if (kind === "hear-gap") assert((await page.locator(`${SESSION} .lx-listen-row`).count()) === 1, "no Play again for what it says");
    await shot(`${kind}-1-question`);
    let from = await rowCount();
    const right = await typeAndCheck(first.text);
    assert(/^Right/.test(right), `"${first.text}" typed: ${right}`);
    await shot(`${kind}-2-right`);
    const rightRows = (await rowsSince(from)).filter((row) => row.activity === kind);
    const unit = gap ? `w:${first.lemma}` : first.unit;
    const rightRow = rightRows.find((row) => row.concept === unit);
    assert(rightRow?.outcome === "right" && rightRow.test === "recall" && rightRow.skill === skill, `what it recorded: ${JSON.stringify(rightRows)}`);
    await next();
    await page.waitForTimeout(500);
    const second = await stepNow();
    assert(second?.kind === kind, `the second step: ${JSON.stringify(second)}`);
    from = await rowCount();
    const typed = wrongly(second.text);
    const wrong = await typeAndCheck(typed, { enter: true });
    assert(/^(Not quite|Here's the answer)/.test(wrong), `"${typed}" for "${second.text}": ${wrong}`);
    const diff = page.locator(`${SESSION} [data-part="type-diff"]`);
    assert((await diff.count()) === 1 && (await diff.isVisible()), "no typing against the word on a wrong answer");
    assert((await page.locator(`${SESSION} [data-state="wrong"]:is([data-part="gap-field"], [data-part="type-answer"])`).count()) === 1, "the field isn't marked wrong");
    await shot(`${kind}-3-wrong`);
    const wrongRows = (await rowsSince(from)).filter((row) => row.activity === kind);
    const wrongUnit = gap ? `w:${second.lemma}` : second.unit;
    const wrongRow = wrongRows.find((row) => row.concept === wrongUnit);
    assert(wrongRow?.outcome === "wrong" && wrongRow.test === "recall" && wrongRow.skill === skill, `what it recorded: ${JSON.stringify(wrongRows)}`);
    assert(wrongRows.some((row) => typeof row.said === "string" && row.said.includes(typed)), `what you typed isn't kept for your AI: ${JSON.stringify(wrongRows)}`);
    await leave();
    return `"${first.text}" right, "${typed}" for "${second.text}" wrong`;
  });
}

await stage("Type what it says with Can't listen now: the same sentence asked another way that needs no sound, there and then", async () => {
  await openGame("hear-gap");
  const before = await stepNow();
  await page.locator(SESSION).getByRole("button", { name: "Can't listen now" }).click();
  await page.waitForFunction(([S]) => document.querySelector(S)?.getAttribute("data-step") !== "hear-gap", [SESSION], { timeout: 5_000 }).catch(() => {});
  const after = await stepNow();
  assert(after && after.kind !== "hear-gap" && after.item === before.item, `after Can't listen now: ${JSON.stringify(after)} (was ${JSON.stringify(before)})`);
  assert((await page.locator(`${SESSION} .lx-listen-row`).count()) === 0, "Play again still there");
  await leave();
  return `${before.item}: hear-gap became ${after.kind}`;
});

let typeWordDrawn = null;
await stage("Pick the word and Type the word show the word's drawing under its English when it has one, and none when it hasn't", async () => {
  // The game's own drawn step when its plan has one. Which six words a game's plan takes varies with the account (each run is a new one), and
  // some take no word with a drawing: then the step is made for a drawn word from the word games' other plans, with the fields lesson.js gives
  // every word step (wordStep, typeWordStep, speakWordStep), Pick the word's other choices from its own plan's bare step.
  const steps = await page.evaluate(async () => {
    const { planSession } = await import("/js/study/plan.js");
    const plans = Object.fromEntries(["word", "type-word", "say-word", "repeat-word"].map((kind) => [kind, planSession("game", kind).steps]));
    const elsewhere = Object.values(plans).flat().find((step) => step.picture && step.text);
    const out = {};
    for (const kind of ["word", "type-word"]) {
      const bare = plans[kind].find((step) => !step.picture) ?? null;
      let drawn = plans[kind].find((step) => step.picture) ?? null;
      let from = "its own plan";
      if (!drawn && elsewhere) {
        const { unit, target, phrase, means, picture, text, article } = elsewhere;
        if (kind === "type-word") drawn = { kind, unit, target, phrase, means, picture, text, ...(article ? { article } : {}), skill: "say" };
        else if (bare?.options) {
          const options = [text, ...bare.options.filter((option, i) => i !== bare.correct && option !== text)].slice(0, 3);
          drawn = { kind, unit, target, phrase, means, picture, options, correct: 0, skill: "read" };
        }
        from = `made for ${elsewhere.kind}'s drawn word`;
      }
      out[kind] = { drawn, bare, from };
    }
    return out;
  });
  typeWordDrawn = steps["type-word"].drawn;
  const notes = [];
  for (const kind of ["word", "type-word"]) {
    const { drawn, bare, from } = steps[kind];
    assert(drawn, `${kind}: no word with a drawing in any word game's plan six lessons in`);
    await openPlan([drawn, ...(bare ? [bare] : [])]);
    const picture = page.locator(`${SESSION} [data-part="word-picture"] svg`);
    await picture.first().waitFor({ timeout: 5_000 }).catch(() => {});
    assert((await picture.count()) === 1, `${kind}: "${drawn.means}" has no drawing on screen`);
    const box = await page.locator(`${SESSION} [data-part="word-picture"]`).boundingBox();
    assert(box && box.width >= 80 && box.width <= 180, `${kind}: the drawing is ${box?.width} px wide`);
    await shot(`${kind}-picture`);
    if (bare) {
      if (kind === "word") await page.locator(`${SESSION} [data-part="choice"]`).first().click();
      else await typeAndCheck(bare.text ?? "x");
      await next();
      await page.waitForTimeout(500);
      assert((await page.locator(`${SESSION} [data-part="word-picture"]`).count()) === 0, `${kind}: a drawing on "${bare.means}", which has none`);
    }
    notes.push(`${kind} "${drawn.means}" drawn as ${drawn.picture} (${from})${bare ? `, "${bare.means}" without` : ""}`);
    await leave();
  }
  return notes.join("; ");
});

await stage("accents: strict (Settings → Type it) takes een for één as wrong; forgiving, the default, as right", async () => {
  const step = { kind: "type-word", unit: "w:een", target: "een", phrase: null, means: "one", text: "één", skill: "say" };
  const said = [];
  for (const accents of ["strict", "forgiving"]) {
    await page.evaluate(async (value) => (await import("/js/study/settings.js")).setStudySetting("type.accents", value), accents);
    await openPlan([step]);
    const title = await typeAndCheck("een");
    said.push(`${accents}: ${title.split("\n")[0]}`);
    assert(accents === "strict" ? /^Not quite/.test(title) : /^Right/.test(title), `${accents}: een for één: ${title}`);
    await leave();
  }
  return said.join(", ");
});

await stage("Type it's correction against what was typed (ui.typedLine): Fout for Het boek is goed. shows Fout, wrong, none of the sentence's words struck and no idea named; a word left out shows at its place, never struck; de typed for het names de and het", async () => {
  const said = () =>
    page.evaluate((S) => [...document.querySelectorAll(`${S} [data-part="said-line"] [data-part="said-word"]`)].map((span) => [span.textContent, span.dataset.state]), SESSION);
  const openType = async () => {
    await page.evaluate(async () => {
      const { itemById } = await import("/js/study/content.js");
      globalThis.__stillPlan = { title: "Check", steps: [{ kind: "type", item: itemById.get("path-nl/l004-7"), skill: "say" }] };
      location.hash = "#study/session/still/check";
    });
    await page.waitForFunction((S) => document.querySelector(S)?.getAttribute("data-step") === "type", SESSION, { timeout: 20_000 });
    await page.waitForTimeout(500);
  };
  const seen = [];
  // Nothing shared: the typed text alone, wrong.
  await openType();
  let feedback = await typeAndCheck("Fout");
  let line = await said();
  await shot("type-correction-fout");
  seen.push(`Fout: ${JSON.stringify(line)}`);
  assert(/^Not quite/.test(feedback), `Fout: ${feedback}`);
  assert(line.length === 1 && line[0][0] === "Fout" && line[0][1] === "wrong", `Fout's line: ${JSON.stringify(line)}`);
  assert(!/de or het/i.test(feedback), `Fout is told about de and het: ${feedback.replace(/\s+/g, " ")}`);
  await leave();
  // A word left out: shown at its place, never struck.
  await openType();
  feedback = await typeAndCheck("Het boek goed");
  line = await said();
  await shot("type-correction-left-out");
  seen.push(`Het boek goed: ${JSON.stringify(line)}`);
  assert(!line.some(([, state]) => state === "missing"), `a word struck through: ${JSON.stringify(line)}`);
  assert(line.some(([text, state]) => text.toLowerCase() === "is" && state === "left-out"), `"is" isn't shown left out at its place: ${JSON.stringify(line)}`);
  assert(line.map(([text]) => text.toLowerCase()).join(" ") === "het boek is goed", `the line's order: ${JSON.stringify(line)}`);
  await leave();
  // The article was the mistake: de and het explained.
  await openType();
  feedback = await typeAndCheck("De boek is goed");
  line = await said();
  await shot("type-correction-article");
  seen.push(`De boek is goed: ${JSON.stringify(line)} · ${feedback.split("\n").slice(0, 2).join(" ")}`);
  assert(line[0]?.[0] === "De" && line[0]?.[1] !== "right", `the article's mark: ${JSON.stringify(line)}`);
  assert(/de or het/i.test(feedback), `de for het isn't told about de and het: ${feedback.replace(/\s+/g, " ")}`);
  await leave();
  return seen.join(" | ");
});

// A sentence with several ideas and no notes to mark which words each is about (a word pack's): which idea a wrong answer went wrong on can't be
// told, so none is named, and each idea stays a chip under the sentence (8 Nov 2026: "Het boek op tafel" for "Het boek ligt op tafel." was told
// about de and het, though ligt was what was left out; session.js typedAbout).
await stage("Type it on a sentence with several ideas and no marks (a word pack's Het boek ligt op tafel.): ligt left out names no idea, and each idea stays a chip under the sentence", async () => {
  const found = await page.evaluate(async () => {
    const [{ itemById }, { notesNow }] = await Promise.all([import("/js/study/content.js"), import("/js/study/notes.js")]);
    for (const item of itemById.values()) if (item.text === "Het boek ligt op tafel." && (item.concepts?.length ?? 0) > 1 && !notesNow(item)?.marks) return { id: item.id, concepts: item.concepts };
    return null;
  });
  assert(found, "Het boek ligt op tafel. with several ideas and no marks isn't on the device (the Dutch word packs seeded?)");
  await page.evaluate(async (id) => {
    const { itemById } = await import("/js/study/content.js");
    globalThis.__stillPlan = { title: "Check", steps: [{ kind: "type", item: itemById.get(id), skill: "say" }] };
    location.hash = "#study/session/still/check";
  }, found.id);
  await page.waitForFunction((S) => document.querySelector(S)?.getAttribute("data-step") === "type", SESSION, { timeout: 20_000 });
  await page.waitForTimeout(500);
  const feedback = await typeAndCheck("Het boek op tafel");
  const seen = await page.evaluate(
    (S) => ({
      why: document.querySelector(`${S} [data-part="feedback-text"]`)?.textContent.trim() ?? "",
      chips: [...document.querySelectorAll(`${S} [data-part="concept-chip"]`)].map((chip) => chip.dataset.concept),
      line: [...document.querySelectorAll(`${S} [data-part="said-line"] [data-part="said-word"]`)].map((span) => [span.textContent, span.dataset.state]),
    }),
    SESSION,
  );
  await shot("type-several-ideas-no-marks");
  assert(/^Not quite/.test(feedback), `the result: ${feedback.replace(/\s+/g, " ")}`);
  assert(!seen.why, `an idea is named: "${seen.why}"`);
  const missing = found.concepts.filter((concept) => !seen.chips.includes(`p:${concept}`));
  assert(!missing.length, `no chip for ${missing.join(", ")} (chips: ${seen.chips.join(", ")})`);
  assert(seen.line.some(([text, state]) => text === "ligt" && state === "left-out"), `ligt isn't shown left out: ${JSON.stringify(seen.line)}`);
  await leave();
  return `${found.id} (${found.concepts.join(", ")}): no idea named, chips ${seen.chips.join(", ")}, ligt left out`;
});

// A wrong answer, every frame recorded: what frame-watch finds that jumped, how far the gap moved in all (where it ended against where it was),
// and at rest where the step's lowest part ends (the correction's held room, under the sentence) and where the result's bar begins. open: a set step instead of
// the game's own first.
const JUMPS = new Set(["teleport", "left-behind", "reflow"]);
async function wrongFrames(kind, answerWrong, { plant = null, open = null } = {}) {
  if (open) await open();
  else await openGame(kind);
  await fw.quiet(page, 300, 4000).catch(() => {});
  const where = () => page.locator(`${SESSION} :is([data-part="gap-field"], [data-part="blank"])`).first().boundingBox();
  const item = (await stepNow())?.item ?? null;
  const before = await where();
  await fw.start(page);
  // Still frames first: a jump is a move with stillness either side of it.
  await page.waitForTimeout(300);
  if (plant) await page.evaluate(plant, SESSION);
  else await answerWrong();
  await page.waitForTimeout(1200);
  const run = await fw.stop(page);
  const after = await where();
  // The step's lowest part as session.js measures it before the result may lie over the step (liesOver: its stepParts, those drawn).
  const rest = await page.evaluate((S) => {
    const activity = document.querySelector(`${S} [data-part="activity"]`);
    const parts = activity ? [...activity.querySelectorAll('.lx-step > :not(.lx-reach, [data-part="activity-prompt"]), [data-part="activity-prompt"] > :not([data-part="character"]), .lx-reach > :not(.lx-game), .lx-game > *')] : [];
    const drawn = parts.filter((part) => part.getClientRects().length);
    return {
      room: drawn.length ? Math.max(...drawn.map((part) => part.getBoundingClientRect().bottom)) : null,
      bar: document.querySelector(`${S} [data-part="answer-bar"]`)?.getBoundingClientRect().top ?? null,
      // (Empty once the step made room; a negative margin while the bar lies over the step: session.js liesOver.)
      marginTop: document.querySelector(`${S} [data-part="answer-bar"]`)?.style.marginTop ?? null,
    };
  }, SESSION);
  const found = fw.analyze(run, { label: kind }).filter((row) => JUMPS.has(row.kind));
  await leave();
  // (moved rounded for saying; shift unrounded, for comparing with the room as session.js does, in fractions of a pixel.)
  return { found, frames: run.frames.length, moved: before && after ? Math.round(after.y - before.y) : null, shift: before && after ? after.y - before.y : null, room: rest.room, bar: rest.bar, marginTop: rest.marginTop, item };
}
// A typed gap's sentence stays where it was (the correction's room is held under it from the start) unless the result coming up needs that room:
// had it stayed, the room would end under the result's bar or within the 8 px session.js keeps clear (liesOver). Then the step makes room on the
// result's curve, which frame-watch has already found no jump in. What it says, or why it fails.
const ROOM_CLEAR = 8;
function stayedUnlessNeeded({ moved, shift, room, bar, item }) {
  if (moved !== null && Math.abs(moved) <= 1) return `stayed where it was (${item})`;
  assert(moved !== null && room !== null && bar !== null, `${item}: the sentence moved ${moved} px, and the correction's room (${room}) or the result's bar (${bar}) wasn't found`);
  const stayedRoom = room - shift;
  const said = `${item}: the room would end at ${stayedRoom.toFixed(1)} px, the result begins at ${bar.toFixed(1)} px`;
  assert(stayedRoom + ROOM_CLEAR > bar, `the sentence moved ${moved} px though the result left its room clear (${said})`);
  return `moved ${moved} px on the result's curve, the result needing its room (${said})`;
}
let gapStepFrom = null;
// A type-gap or hear-gap step on one sentence, as a set plan: the game's own step for it when the game's plan has it (with what the planner
// marks on it, which the result shows), else one made as the planner makes them.
const openGapStep = (kind, id) => async () => {
  const found = await page.evaluate(
    async ([k, itemId]) => {
      const { ITEMS } = await import("/js/study/content.js");
      const { targetOf } = await import("/js/study/new-words.js");
      const { planSession } = await import("/js/study/plan.js");
      const item = ITEMS.find((one) => one.id === itemId);
      if (!item) return false;
      const own = planSession("game", k).steps.find((step) => step.kind === k && step.item?.id === itemId);
      globalThis.__stillPlan = { title: "Check", steps: [own ?? { kind: k, item, skill: k === "type-gap" ? "say" : "hear", target: targetOf(item) }] };
      location.hash = "#study/session/still/check";
      return own ? "the game's own" : "made";
    },
    [kind, id],
  );
  assert(found, `${id} isn't in the packs any more: name another sentence for this stage`);
  gapStepFrom = found;
  await page.waitForFunction(([S, k]) => document.querySelector(S)?.getAttribute("data-step") === k, [SESSION, kind], { timeout: 20_000 });
  await page.waitForTimeout(500);
};
const typeWrong = async () => {
  const step = await stepNow();
  await field().click();
  await page.keyboard.type(wrongly(step.text), { delay: 20 });
  await page.locator(SESSION).getByRole("button", { name: "Check", exact: true }).click();
};

await stage("PLANT: a block put above a gap's sentence in one frame is caught as a jump (frame-watch sees this page's moves)", async () => {
  const { found, frames } = await wrongFrames("type-gap", null, {
    plant: (S) => {
      const game = document.querySelector(`${S} .lx-game`);
      game.prepend(Object.assign(document.createElement("div"), { style: "height: 70px" }));
    },
  });
  assert(found.some((row) => row.kind === "teleport"), `nothing caught in ${frames} frames`);
  return found.map((row) => row.what).slice(0, 2).join("; ");
});

for (const [kind, name] of [["type-gap", "Type in the gap"], ["hear-gap", "Type what it says"], ["fill", "Fill the gap"]]) {
  await stage(`${name}: a wrong answer moves nothing in one frame, the correction under the sentence${kind === "fill" ? "" : " in the room held for it"}`, async () => {
    const result = await wrongFrames(kind, async () => {
      if (kind === "fill") {
        const right = await page.evaluate((S) => {
          const step = document.querySelector(S).lxStep;
          return step.item.words[step.item.gap.index][0].replace(/[.,;:!?…»”"')\]]+$/u, "");
        }, SESSION);
        const choices = page.locator(`${SESSION} [data-part="fill-sentence"] + .lx-row > [data-part="button"]`);
        const texts = await choices.allTextContents();
        await choices.nth(texts.findIndex((text) => text.trim() !== right)).click();
      } else await typeWrong();
    });
    assert(!result.found.length, result.found.map((row) => `${row.kind} at ${row.at} ms: ${row.what}`).slice(0, 3).join(" | "));
    if (kind === "fill") return `${result.frames} frames, nothing jumped; the gap ${result.moved ? `moved ${result.moved} px, on the result's curve` : "stayed where it was"}`;
    return `${result.frames} frames, nothing jumped; the sentence ${stayedUnlessNeeded(result)}`;
  });
}

// Both ways, on sentences found at run time (the layout decides whose result needs the room, and it changes: l004-6, named here once, stopped
// needing it): the learner's gap sentences tried in turn, reworded ones and plain ones by turns (a reworded sentence's result carries its
// word-for-word line and why, the tallest a result gets), each a wrong answer measured, until one result leaves the sentence's room clear and
// one needs it (had it stayed, the room would end under the result's bar or within the 8 px session.js keeps clear). The clear one must stay
// where it was; the one that needs the room must move, on the result's curve, until the room ends clear of the bar. A sentence counts either
// way only by MARGIN px or more (a result needing 1 px moves 1 px, rounded up, and is no test of either); twelve tried at most.
const MARGIN = 3;
// How far the room, had the sentence stayed, would reach past the 8 px clear of the result's bar: over 0, the result needs that much room.
const overBy = ({ room, shift, bar }) => (room !== null && bar !== null && shift !== null ? room - shift + ROOM_CLEAR - bar : null);
const gapCandidates = (kind) =>
  page.evaluate(async (k) => {
    const { planSession } = await import("/js/study/plan.js");
    const { ITEMS } = await import("/js/study/content.js");
    const { rewordingOf } = await import("/js/study/reword.js");
    const { pathLessons } = await import("/js/study/path.js");
    const byId = new Map(ITEMS.map((item) => [item.id, item]));
    const own = planSession("game", k).steps.filter((step) => step.kind === k && step.item).map((step) => step.item.id);
    const learnt = pathLessons().slice(0, 6).flatMap((lesson) => lesson.items ?? []);
    const items = [...new Set([...own, ...learnt])].map((id) => byId.get(id)).filter(Boolean);
    const reworded = items.filter((item) => rewordingOf(item));
    const plain = items.filter((item) => !rewordingOf(item));
    const ids = [];
    for (let i = 0; i < Math.max(reworded.length, plain.length); i++) ids.push(reworded[i]?.id, plain[i]?.id);
    return ids.filter(Boolean);
  }, kind);
for (const [kind, name] of [["type-gap", "Type in the gap"], ["hear-gap", "Type what it says"]]) {
  await stage(`${name}: on sentences found at run time, a result that leaves the room clear leaves the sentence where it was; one that needs the room moves it on the result's curve until it's clear`, async () => {
    const candidates = await gapCandidates(kind);
    const tried = [];
    let clear = null;
    let needs = null;
    for (const id of candidates.slice(0, 12)) {
      if (clear && needs) break;
      const result = await wrongFrames(kind, typeWrong, { open: openGapStep(kind, id) });
      assert(!result.found.length, `${id}: ${result.found.map((row) => `${row.kind} at ${row.at} ms: ${row.what}`).slice(0, 3).join(" | ")}`);
      const over = overBy(result);
      const what = over === null ? "unmeasured" : over >= MARGIN ? "needs the room" : over <= -MARGIN ? "clear" : "marginal";
      tried.push(`${id.replace("path-nl/", "")} ${what} (${over === null ? "?" : `${over.toFixed(1)} px`}, moved ${result.moved} px)`);
      if (what === "needs the room") needs ??= { id, from: gapStepFrom, ...result };
      if (what === "clear") clear ??= { id, from: gapStepFrom, ...result };
    }
    assert(clear, `none of the ${tried.length} sentences tried left the room clear: ${tried.join("; ")}`);
    assert(needs, `none of the ${tried.length} sentences tried needed the room: ${tried.join("; ")}`);
    assert(Math.abs(clear.moved) <= 1, `${clear.id}'s result left the room clear, yet the sentence moved ${clear.moved} px (its room ends at ${clear.room} px, the result begins at ${clear.bar} px)`);
    assert(needs.shift < -1, `${needs.id}'s result needed the room (it would end at ${(needs.room - needs.shift).toFixed(1)} px, the result begins at ${needs.bar.toFixed(1)} px), yet the sentence moved ${needs.moved} px`);
    assert(needs.room + ROOM_CLEAR <= needs.bar + 1, `${needs.id} moved ${needs.moved} px, but its room still ends at ${needs.room.toFixed(1)} px, under or within ${ROOM_CLEAR} px of the result at ${needs.bar.toFixed(1)} px`);
    return `clear: ${stayedUnlessNeeded(clear)}; needs (${needs.from} step): ${stayedUnlessNeeded(needs)}, ending ${(needs.bar - needs.room).toFixed(1)} px over the result; tried ${tried.join("; ")}`;
  });
}

// Last, as they reload the page on a smaller phone with a stand-in keyboard (keyboard-check.mjs's: a visualViewport the keys shorten; window.lxKeyboard(px)
// puts keys of that height up, 0 takes them away). Put in once, for every page load after it.
let keysStoodIn = false;
async function standInKeys() {
  if (keysStoodIn) return;
  keysStoodIn = true;
  await context.addInitScript(() => {
    const vv = new EventTarget();
    let kb = 0;
    Object.defineProperties(vv, {
      height: { get: () => innerHeight - kb },
      width: { get: () => innerWidth },
      offsetTop: { get: () => 0 },
      offsetLeft: { get: () => 0 },
      pageTop: { get: () => 0 },
      pageLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    window.lxKeyboard = (px) => {
      kb = px;
      vv.dispatchEvent(new Event("resize"));
    };
  });
}
await stage("an iPhone SE's screen (375 × 667) with the keys up in Type the word: the word's drawing smaller or gone, never under the session's bar, the field and Check above the keys; back when the keys go", async () => {
  assert(typeWordDrawn, "no drawn word for Type the word (the drawing stage didn't find one)");
  await standInKeys();
  await page.setViewportSize({ width: 375, height: 667 });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-part="page"]'), null, { timeout: 30_000 });
  await openPlan([typeWordDrawn]);
  await field().click();
  // An iPhone SE's keys with Safari's bar over them (lex-sound's walk, 7 Nov): 300 px of 667.
  await page.evaluate(() => window.lxKeyboard(300));
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-keyboard"), null, { timeout: 5_000 });
  await page.waitForTimeout(700);
  const up = await page.evaluate((S) => {
    const box = (el) => (el && getComputedStyle(el).display !== "none" ? el.getBoundingClientRect().toJSON() : null);
    const session = document.querySelector(S);
    const check = [...session.querySelectorAll("button")].find((b) => b.textContent.trim() === "Check");
    const activity = session.querySelector('[data-part="activity"]');
    return { bar: box(session.querySelector('[data-part="session-bar"]')), picture: box(session.querySelector('[data-part="word-picture"]')), field: box(session.querySelector('[data-part="type-answer"] [data-part="text-field"]')), check: box(check), keysAt: visualViewport.height, keysFit: session.getAttribute("data-keys-fit"), scrolls: activity.scrollHeight - activity.clientHeight };
  }, SESSION);
  await shot("se-keys-up");
  assert(up.bar, "no session bar");
  assert(!up.picture || up.picture.top >= up.bar.bottom - 1, `the drawing's top (${Math.round(up.picture?.top)}) is under the bar's foot (${Math.round(up.bar.bottom)})`);
  assert(up.field && up.field.bottom <= up.keysAt + 1, `the field (foot ${Math.round(up.field?.bottom)}) is under the keys (${up.keysAt})`);
  assert(up.check && up.check.bottom <= up.keysAt + 1, `Check (foot ${Math.round(up.check?.bottom)}) is under the keys (${up.keysAt})`);
  assert(up.scrolls <= 1, `the step still scrolls ${up.scrolls} px with the keys up`);
  await page.evaluate(() => window.lxKeyboard(0));
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-keyboard"), null, { timeout: 5_000 }).catch(() => {});
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(700);
  const down = await page.evaluate((S) => {
    const session = document.querySelector(S);
    const picture = session.querySelector('[data-part="word-picture"]');
    return { keysFit: session.getAttribute("data-keys-fit"), picture: picture && getComputedStyle(picture).display !== "none" ? Math.round(picture.getBoundingClientRect().width) : 0 };
  }, SESSION);
  await shot("se-keys-down");
  assert(!down.keysFit && down.picture > 72, `with the keys gone the drawing is ${down.picture} px (keys-fit ${down.keysFit})`);
  await leave();
  return `keys up: the drawing ${up.picture ? `${Math.round(up.picture.width)} px, its top ${Math.round(up.picture.top)} under a bar ending at ${Math.round(up.bar.bottom)}` : "not drawn"} (keys-fit ${up.keysFit ?? "none"}), the field's foot ${Math.round(up.field.bottom)} and Check's ${Math.round(up.check.bottom)} above the keys at ${up.keysAt}; keys gone: ${down.picture} px`;
});

// Type it's marked line (ui.typedLine) under a result that carries an explanation, on the small phones (8 Nov 2026: at 320 × 568 the bar grown by its
// More was fitted again with the game still held near its place at the press, the hold read as the step's own height, and the step taken to its
// tightest level and the line folded away with the room it needed standing empty; session.js unhold). Where the result really leaves no room (the
// path's longest sentence at 320 × 568), the fold takes the field, which says nothing the line doesn't, and the line stays (study-screens.css).
await stage("Type it's marked line in view under a result with an explanation on small phones: at 320 × 568 shown and clear of the result and the session's bar; on the path's longest sentence the field folding, never the line; at 375 × 667 the same once the keys go after Check", async () => {
  await standInKeys();
  const seen = [];
  // A path-nl sentence by its words, or the path's longest (by words, then letters) whose wrong answer still explains an idea (session.js
  // typedAbout): one whose notes mark an idea's words, with the first such word left out, or else one of a single idea, with its second word left
  // out. (A sentence of several ideas and no marks names none: its result is short, and this stage's fold would test nothing.)
  const pick = (text) =>
    page.evaluate(async (want) => {
      const [{ itemById }, { notesNow }] = await Promise.all([import("/js/study/content.js"), import("/js/study/notes.js")]);
      const path = [...itemById.values()].filter((item) => item.id.startsWith("path-nl/") && item.words?.length);
      if (want) return path.find((item) => item.text === want)?.id ?? null;
      const explained = path
        .filter((item) => item.concepts?.length)
        .map((item) => {
          const marks = notesNow(item)?.marks;
          const marked = marks && item.concepts.map((concept) => marks[concept]?.[0]).find((at) => at !== undefined);
          return { item, leave: marks ? marked : item.concepts.length === 1 ? 1 : undefined };
        })
        .filter(({ item, leave }) => leave !== undefined && leave < item.words.length);
      explained.sort((a, b) => b.item.words.length - a.item.words.length || b.item.text.length - a.item.text.length);
      return explained[0] ? `${explained[0].item.id}#${explained[0].leave}` : null;
    }, text);
  // The sentence's words with the one at `leave` left out (pick's "<id>#<place>").
  const leftOut = (picked) =>
    page.evaluate(async ([at, leave]) => (await import("/js/study/content.js")).itemById.get(at).words.filter((_, i) => i !== leave).map(([word]) => word).join(" "), [picked.split("#")[0], Number(picked.split("#")[1])]);
  // After a reload the content view comes in a moment later: the item asked for until it's there (an evaluate per look; a waitForFunction can't await).
  const openType = async (id) => {
    for (let tries = 0; !(await page.evaluate(async (at) => Boolean((await import("/js/study/content.js")).itemById.get(at)), id)); tries++) {
      assert(tries < 100, `${id} isn't on the device 20 s after the page loaded`);
      await page.waitForTimeout(200);
    }
    await page.evaluate(async (at) => {
      const { itemById } = await import("/js/study/content.js");
      globalThis.__stillPlan = { title: "Check", steps: [{ kind: "type", item: itemById.get(at), skill: "say" }] };
      location.hash = "#study/session/still/check";
    }, id);
    await page.waitForFunction((S) => document.querySelector(S)?.getAttribute("data-step") === "type", SESSION, { timeout: 20_000 });
    await page.waitForTimeout(500);
  };
  const look = () =>
    page.evaluate((S) => {
      const session = document.querySelector(S);
      const box = (el) => (el && el.getClientRects().length ? el.getBoundingClientRect().toJSON() : null);
      const said = session.querySelector(".lx-said");
      const words = [...session.querySelectorAll('[data-part="said-line"] [data-part="said-word"]')].filter((word) => word.getClientRects().length);
      return {
        shown: Boolean(said && getComputedStyle(said).display !== "none" && words.length),
        top: Math.min(...words.map((word) => word.getBoundingClientRect().top)),
        foot: Math.max(...words.map((word) => word.getBoundingClientRect().bottom)),
        bar: box(session.querySelector('[data-part="answer-bar"]')),
        head: box(session.querySelector('[data-part="session-bar"]')),
        field: box(session.querySelector('[data-part="type-answer"]')),
        fold: session.hasAttribute("data-fold"),
        fit: session.getAttribute("data-fit"),
        why: session.querySelector('[data-part="feedback-text"]')?.textContent.trim() ?? "",
      };
    }, SESSION);
  const judge = (name, at) => {
    assert(at.why, `${name}: the result carries no explanation, so it tests nothing here`);
    assert(at.shown, `${name}: the marked line isn't shown (fit ${at.fit ?? 0}${at.fold ? ", folded" : ""})`);
    assert(at.bar && at.foot <= at.bar.top + 0.5, `${name}: the marked line's foot ${Math.round(at.foot)} is under the result's top ${Math.round(at.bar?.top)}`);
    assert(at.head && at.top >= at.head.bottom - 0.5, `${name}: the marked line's top ${Math.round(at.top)} is under the session's bar (${Math.round(at.head?.bottom)})`);
    if (at.fold) assert(!at.field, `${name}: folded with the field still shown`);
    seen.push(`${name}: the line ${Math.round(at.top)}–${Math.round(at.foot)}, the result from ${Math.round(at.bar.top)}, fit ${at.fit ?? 0}${at.fold ? ", the field folded" : ""}`);
  };
  const drink = await pick("Ja, ik drink koffie.");
  const book = await pick("Het boek is goed.");
  const longest = await pick(null);
  assert(drink && book && longest, `path-nl's sentences aren't on the device (${drink}, ${book}, ${longest})`);
  const longTyped = await leftOut(longest);
  const longId = longest.split("#")[0];
  await page.setViewportSize({ width: 320, height: 568 });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-part="page"]'), null, { timeout: 30_000 });
  for (const [name, id, typed] of [["320 × 568, a verb left out", drink, "Ja ik koffie"], ["320 × 568, the article", book, "De boek is goed"], ["320 × 568, the longest sentence", longId, longTyped]]) {
    await openType(id);
    await typeAndCheck(typed);
    await page.waitForTimeout(700);
    await shot(`type-line-${name.replace(/\W+/g, "-")}`);
    judge(name, await look());
    await leave();
  }
  // An iPhone SE's screen with its keys: up while typing, gone after Check (on an iPhone the field leaves the keys as the game goes inert).
  await page.setViewportSize({ width: 375, height: 667 });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-part="page"]'), null, { timeout: 30_000 });
  await openType(drink);
  await field().click();
  await page.evaluate(() => window.lxKeyboard(300));
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-keyboard"), null, { timeout: 5_000 });
  await page.keyboard.type("Ja ik koffie", { delay: 20 });
  await page.locator(SESSION).getByRole("button", { name: "Check", exact: true }).click();
  await page.locator(`${SESSION} [data-part="feedback"]`).first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.lxKeyboard(0));
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-keyboard"), null, { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(700);
  await shot("type-line-375-keys-gone");
  judge("375 × 667, the keys gone after Check", await look());
  await leave();
  return seen.join(" | ");
});

await stage("no page errors, and the session's plan was the app's own wherever it wasn't set", async () => {
  assert(stillPlan.routed() > 0, "plan.js wasn't wrapped (its planSession export moved: fixtures/still-plan.mjs), so no set plan could be played");
  assert(!errors.length, errors.slice(0, 3).join(" | "));
});

await page.evaluate(async () => { await fetch("/account/delete", { method: "POST" }).catch(() => {}); }).catch(() => {});
await context.close();
await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
