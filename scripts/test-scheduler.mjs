// The scheduler, case by case: FSRS per unit and strength replayed from the evidence (study/scheduler.js through
// progress.js), its carry-over and same-moment rules, what's due, leeches, languages, the predictions kept on rows, and
// the quick session's plan on top of it (plan.js): retries, due units through a game that tests the due strength, new
// sentences, and the frequency list's order. Pure, so it runs in Node: `node scripts/test-scheduler.mjs` (exit 0 = pass).

import { readFileSync, existsSync } from "node:fs";
import { allEvidence, calibration, clearProgress, conceptState, knows, recallOf, record, unitLasting, unitState } from "../public/js/study/progress.js";
import { IDEA_FIRM, POOL_GOOD, POOL_HARD, SLIP_MISSES, SLIP_RUN, levelOf, replay, strengthAt } from "../public/js/study/scheduler.js";
import { GAMES, GAME_MODES, comebackOf, modeOf, overview, planSession } from "../public/js/study/plan.js";
import { dayKey, dayNumber } from "../public/js/know/streak.js";
import { setStudySetting, resetStudySettings } from "../public/js/study/settings.js";
import { ITEMS, conceptsOf } from "../public/js/study/content.js";

const DAY = 86_400_000;
const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 1, 9); // 1 Oct 2026, 09:00 UTC

let failed = 0;
let passed = 0;
async function test(name, fn) {
  await clearProgress();
  resetStudySettings();
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const eq = (actual, expected, what = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? `${what}: ` : ""}${a} ≠ ${e}`);
};
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
const days = (ms) => Math.round(ms / DAY);
const row = (concept, at, extra = {}) => ({ concept, at, outcome: "right", test: "recall", skill: "read", activity: "test", item: "t", ...extra });

// Answers it at each due date with one grade, and returns the intervals (days) it was given.
function ladder(concept, extra) {
  const gaps = [];
  let at = T0;
  for (let i = 0; i < 5; i++) {
    record([row(concept, at, extra)]);
    const due = unitState(concept, { now: at }).strengths.read.dueAt;
    gaps.push(days(due - at));
    at = due;
  }
  return gaps;
}

await test("ladder: five recalls in a row space it out to over a year", () => {
  eq(ladder("w:ladder-good", { test: "recall" }), [2, 11, 46, 163, 497]);
});
await test("ladder: five right answers picked from three stay within weeks (Hard)", () => {
  eq(ladder("w:ladder-hard", { test: "pick" }), [1, 3, 7, 12, 18]);
});

await test("a burst of play isn't knowing: one miss, then four right in two minutes", () => {
  const at = T0;
  record([row("w:morgen", at, { outcome: "wrong" })]);
  for (let i = 1; i <= 4; i++) record([row("w:morgen", at + i * 30_000)]);
  const s = unitState("w:morgen", { now: at + 2 * MIN });
  ok(s.level === 1, `level ${s.level}, wanted 1`);
  ok(!s.strengths.read.known, "known after a miss and a burst");
  eq(days(s.strengths.read.dueAt - at), 1, "due in days");
  ok(!s.due, "due before tomorrow");
  ok(unitState("w:morgen", { now: at + DAY + 3 * MIN }).due, "due a day after its last review");
  // The old running average had it at level 3, not due for three days.
});
await test("the inventory's case: missed 3 times of 7 in two minutes is weak and due tomorrow", () => {
  const outcomes = ["right", "wrong", "right", "wrong", "right", "wrong", "right"];
  outcomes.forEach((outcome, i) => record([row("p:perfect", T0 + i * 20_000, { outcome, test: "build" })]));
  const s = conceptState("p:perfect", { now: T0 + 3 * MIN });
  eq([s.level, s.seen, s.right, s.wrong], [1, 7, 4, 3]);
  ok(conceptState("p:perfect", { now: T0 + DAY + 3 * MIN }).due, "due a day later");
});

// ---------- ideas: scheduled on their rate (scheduler.js nextMemory) ----------

// A year of answers on one strength, `perDay` a day ten minutes apart, right at `rate` (half of them picks, Hard), from a seeded draw.
function year(perDay, rate, { days: n = 365, seed = 7 } = {}) {
  let x = seed;
  const draw = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const out = [];
  for (let d = 0; d < n; d++) for (let k = 0; k < perDay; k++) out.push({ at: T0 + d * DAY + k * 10 * MIN, skill: "read", grade: draw() < rate ? (draw() < 0.5 ? "hard" : "good") : "again" });
  return out;
}
const readAt = (unit, reviews, at) => strengthAt(unit[0], replay(unit, reviews).strengths.read, at);

await test("an idea in nearly every sentence, 17 answers a day for a year at 95% right, is Solid; counted answer by answer, as a word is, it held days", () => {
  const answers = year(17, 0.95);
  const end = T0 + 365 * DAY;
  const idea = readAt("p:v2", answers, end);
  ok(idea.level === 4 && idea.lapses <= 1, `the idea: level ${idea.level}, ${idea.stability.toFixed(1)} days, ${idea.lapses} lapses`);
  // The control: the same answers on a word, every one moving its card (the rule ideas had before 6 Nov 2026).
  const before = readAt("w:v2", answers, end);
  ok(before.level <= 2 && before.lapses > 100, `answer by answer: level ${before.level}, ${before.stability.toFixed(1)} days, ${before.lapses} lapses`);
  return `level ${idea.level} (${idea.stability.toFixed(0)} days, ${idea.lapses} lapse) against level ${before.level} (${before.stability.toFixed(1)} days, ${before.lapses} lapses)`;
});

await test("an idea mostly missed stays weak: a year at 60% right is Just started and lapsing", () => {
  const idea = readAt("p:v2", year(17, 0.6), T0 + 365 * DAY);
  ok(idea.level === 1 && idea.lapses > 100 && idea.leech, `level ${idea.level}, ${idea.lapses} lapses`);
  return `${idea.lapses} lapses`;
});

await test("an idea's pool grades its review once it's due: its share right since the last (good, hard, again), three right picks good, one Hard", () => {
  // Learned on day 0 (one answer: good, due in 2 days), then answers on day 1 held in the pool, then the first answer on day 3 closes it.
  const closed = (pooled, last = "good") => {
    const r = replay("p:pool", [{ at: T0, skill: "read", grade: "good" }, ...pooled.map((grade, i) => ({ at: T0 + DAY + i * MIN, skill: "read", grade })), { at: T0 + 3 * DAY, skill: "read", grade: last }]).reviews;
    ok(r.slice(1, -1).every((review) => review.counted === null), `an answer before it was due counted: ${JSON.stringify(r.slice(1, -1).map((x) => x.counted))}`);
    return r.at(-1).counted;
  };
  // right and wrong spread through the pool (never a run of misses, which counts at once: the next test).
  const of = (right, wrong, grade = "good") => Array.from({ length: right + wrong }, (_, i) => (Math.floor(((i + 1) * wrong) / (right + wrong)) > Math.floor((i * wrong) / (right + wrong)) ? "again" : grade));
  eq(closed(of(18, 1)), "good", `${POOL_GOOD * 100}% or more right`);
  // The pool's share counts the answer that closes it: 16 right and 3 wrong, then a right one, is 17 of 20.
  eq(closed(of(16, 3)), "good", "85% right, the closing answer with them, is good");
  eq(closed(of(15, 4)), "hard", `${POOL_HARD * 100}% or more`);
  eq(closed(of(12, 7)), "again", `under ${POOL_HARD * 100}%`);
  eq(closed(of(2, 0, "hard"), "hard"), "good", "three right picks");
  eq(closed([], "hard"), "hard", "one pick alone");
  eq(closed([], "again"), "again", "one miss alone");
});

await test(`an idea you've stopped getting comes back at once: ${SLIP_MISSES} misses of its last ${SLIP_RUN} count a miss that moment, due in days, not weeks`, () => {
  const known = year(17, 0.95, { days: 200 });
  const at = T0 + 200 * DAY;
  const before = readAt("p:v2", known, at);
  ok(before.level === 4 && !before.due, `before: level ${before.level}`);
  const slip = ["good", "again", "good", "again", "again", "good", "again", "again", "good", "again"].map((grade, i) => ({ at: at + i * MIN, skill: "read", grade }));
  const r = replay("p:v2", [...known, ...slip]);
  eq(r.reviews.slice(-SLIP_RUN).map((x) => x.counted), [null, null, null, null, null, null, null, null, null, "again"], "what counted");
  const after = strengthAt("p", r.strengths.read, at + 10 * MIN);
  ok(after.lapses === before.lapses + 1 && after.level < 4 && days(after.dueAt - at) <= 5 && days(before.dueAt - at) >= 20, `after: level ${after.level}, due in ${days(after.dueAt - at)} days (before: ${days(before.dueAt - at)}), lapses ${after.lapses}`);
  // Five misses of ten is chance at its rate, and counts nothing.
  const five = replay("p:v2", [...known, ...slip.slice(0, 9)]);
  ok(five.reviews.slice(-9).every((x) => x.counted === null), "five misses counted");
  return `due in ${days(after.dueAt - at)} days, from ${days(before.dueAt - at)}`;
});

await test("the day an idea is met, every answer counts (its lesson); answered only when it's due, it's scheduled as a word is", () => {
  const lesson = ["good", "again", "good", "good", "again", "good"].map((grade, i) => ({ at: T0 + i * MIN, skill: "read", grade }));
  eq(replay("p:met", lesson).reviews.map((x) => x.counted), lesson.map((x) => x.grade), "its first day");
  eq(ladder("p:ladder-good", { test: "recall" }), [2, 11, 46, 163, 497], "an idea's ladder");
});

// Answers a unit perDay[d] times (ten minutes apart) on day d, each day the one it's next due (a day on at least), right but where miss(d, k).
function onDueDays(unit, perDay, miss = () => false) {
  let at = T0;
  let n = 0;
  let right = 0;
  let s = null;
  perDay.forEach((per, d) => {
    for (let k = 0; k < per; k++) {
      const wrong = miss(d, k);
      n++;
      right += wrong ? 0 : 1;
      record([row(unit, at + k * 10 * MIN, { outcome: wrong ? "wrong" : "right" })]);
    }
    s = unitState(unit, { now: at + per * 10 * MIN });
    at = Math.max(s.strengths.read.dueAt, at + DAY);
  });
  const { stability } = s.strengths.read;
  return { unit, level: s.level, stability, byStability: levelOf(stability), lasting: unitLasting(unit), said: `${unit} ${right} of ${n} right on ${perDay.length} days: level ${s.level} at ${stability.toFixed(1)} days` };
}

await test(`an idea is never Strong or Solid on a handful of answers: under ${IDEA_FIRM.answers}, or on under ${IDEA_FIRM.days} days, it stays Getting there however right, its stability past Strong's; ${IDEA_FIRM.answers} on ${IDEA_FIRM.days} days lets it go; a word's the same answers are Solid`, () => {
  ok(IDEA_FIRM.answers >= 15 && IDEA_FIRM.days >= 5, `the bar: ${JSON.stringify(IDEA_FIRM)}`);
  // Lucky answers at 85–100% right, each idea answered when it's due, so its stability climbs as a word's would.
  const held = [
    onDueDays("p:two", [1, 1]), // Strong by its stability on two answers
    onDueDays("p:three", [1, 1, 1]), // Solid on three
    onDueDays("p:five", [1, 1, 1, 1, 1]),
    onDueDays("p:twelve", [3, 3, 3, 3], (d, k) => d === 0 && k === 1), // 92%, 4 days
    onDueDays("p:fourteen", [4, 2, 2, 2, 2, 2], (d, k) => d === 0 && k > 0 && k < 3), // 86%, 6 days
  ];
  for (const idea of held) {
    ok(idea.byStability >= 3, `${idea.said}: its stability alone isn't past Getting there, so this case shows nothing`);
    ok(idea.level === 2, `${idea.said}`);
    // The Knowledge page's own record (the word index's): never past Getting there, and not known well.
    ok(idea.lasting.levels.every(([, level]) => level <= 2) && idea.lasting.strengths.read.level === 2 && !idea.lasting.strengths.read.well.length, `${idea.unit}'s lasting record: ${JSON.stringify(idea.lasting.levels)}`);
  }
  // Fifteen answers on one day are a lesson and its practice, not a learned idea.
  const oneDay = onDueDays("p:one-day", [15]);
  ok(oneDay.level <= 2, oneDay.said);
  // The bar met, it goes as its stability says: fifteen right on five days.
  const firm = [onDueDays("p:firm", [3, 3, 3, 3, 3]), onDueDays("p:firm-late", [11, 1, 1, 1, 1])];
  for (const idea of firm) ok(idea.level === idea.byStability && idea.level >= 3, `the bar met: ${idea.said}`);
  // The control: a word with the same five answers is Solid (the rule is ideas' alone).
  const word = onDueDays("w:five", [1, 1, 1, 1, 1]);
  ok(word.level === 4, `a word: ${word.said}`);
  return `${held.map((idea) => idea.said).join("; ")}; ${firm[0].said}; ${word.said}`;
});

await test("one answer, one review: same-moment rows of a unit and strength count once, at the worst grade", () => {
  record([row("w:twice", T0), row("w:twice", T0, { outcome: "wrong" })]);
  const r = replay("w:twice", [
    { at: T0, skill: "read", grade: "good" },
    { at: T0, skill: "read", grade: "again" },
  ]);
  eq(r.reviews.length, 1);
  eq(r.reviews[0].grade, "again");
  eq(unitState("w:twice", { now: T0 }).strengths.read.reviews, 1);
});

await test("carry-over: saying it right counts for reading it; spoken, for hearing it too", () => {
  record([row("w:typed", T0, { skill: "say", activity: "type" })]);
  const typed = unitState("w:typed", { now: T0 + MIN });
  ok(typed.strengths.say && typed.strengths.read, "say and read");
  ok(!typed.strengths.hear, "typed counts for hearing");
  record([row("w:spoken", T0, { skill: "say", activity: "say" })]);
  const spoken = unitState("w:spoken", { now: T0 + MIN });
  ok(spoken.strengths.say && spoken.strengths.read && spoken.strengths.hear, "spoken: all three");
  record([row("w:ai-spoken", T0, { skill: "say", activity: "practice:conversation", how: "spoken", test: "free" })]);
  ok(unitState("w:ai-spoken", { now: T0 + MIN }).strengths.hear, "your AI's spoken turn: hearing too");
});
await test("carry-over: never the other way; a miss at reading counts for saying only once saying has started", () => {
  record([row("w:read-only", T0)]);
  const s = unitState("w:read-only", { now: T0 + MIN });
  ok(s.strengths.read && !s.strengths.say && !s.strengths.hear, "reading right moved only reading");
  record([row("w:read-only", T0 + 2 * DAY, { outcome: "wrong" })]);
  ok(!unitState("w:read-only", { now: T0 + 2 * DAY }).strengths.say, "a reading miss opened saying");
  record([row("w:both", T0, { skill: "say" })]);
  const before = unitState("w:both", { now: T0 + 3 * DAY }).strengths.say.stability;
  record([row("w:both", T0 + 3 * DAY, { outcome: "wrong" })]);
  const after = unitState("w:both", { now: T0 + 3 * DAY + MIN }).strengths.say;
  ok(after.stability < before, `saying didn't lose strength (${before} → ${after.stability})`);
  eq(after.reviews, 2, "say reviews");
  ok(unitState("w:both", { now: T0 + 3 * DAY + MIN }).strengths.say.reviews === 2, "carried miss on say");
  // A saying miss never counts against reading.
  record([row("w:say-miss", T0), row("w:say-miss", T0 + DAY, { skill: "say", outcome: "wrong" })]);
  eq(unitState("w:say-miss", { now: T0 + DAY }).strengths.read.reviews, 1, "read reviews after a say miss");
});

await test("exposure and pronunciation never make a memory", () => {
  record([row("w:met", T0, { outcome: "met" }), row("w:met", T0 + MIN, { skill: "sound" })]);
  const s = unitState("w:met", { now: T0 + 2 * MIN });
  eq([s.isNew, s.level, s.met, s.strengths.read, s.strengths.say], [true, 0, 1, null, null]);
});

await test("due: only strengths you train; not training hearing means hearing is never due", () => {
  record([row("w:hear", T0, { skill: "hear", activity: "listen-type" })]);
  ok(unitState("w:hear", { now: T0 + 30 * DAY }).due, "hearing due a month later");
  setStudySetting("memory.train.hear", false);
  const s = unitState("w:hear", { now: T0 + 30 * DAY });
  ok(!s.due && !s.trained.includes("hear"), "due though hearing isn't trained");
  ok(s.strengths.hear, "the strength is still known about");
});
await test("due: a higher target recall brings reviews sooner", () => {
  record([row("w:target", T0)]);
  const at90 = unitState("w:target", { now: T0 }).strengths.read.dueAt;
  setStudySetting("memory.target", 0.95);
  const at95 = unitState("w:target", { now: T0 }).strengths.read.dueAt;
  ok(at95 < at90, `95% not sooner (${days(at95 - T0)} vs ${days(at90 - T0)} days)`);
});

await test("slipping: due after it had been learned (stability of 2 days or more)", () => {
  record([row("w:slip", T0), row("w:slip", T0 + 2 * DAY)]);
  const s = conceptState("w:slip", { now: T0 + 60 * DAY });
  eq([s.due, s.slipping, s.level >= 2], [true, true, true]);
  record([row("w:new-ish", T0, { test: "pick" })]);
  const weak = conceptState("w:new-ish", { now: T0 + 5 * DAY });
  eq([weak.due, weak.slipping], [true, false]);
});

await test("known (for the weave and the counts): recall of 80% or more that lasts a day, after a real test", () => {
  record([row("w:known", T0)]);
  ok(knows("w:known", { now: T0 + MIN }), "known after a recall");
  ok(!knows("w:known", { now: T0 + 40 * DAY }), "still known after 40 days");
  record([row("w:tapped", T0, { outcome: "wrong", activity: "reader" })]);
  ok(!knows("w:tapped", { now: T0 + MIN }), "known right after a tapped miss");
  ok(recallOf("w:tapped", { now: T0 + MIN }) > 0.8, "recall right after a miss is high (FSRS: you just saw it)");
  ok(recallOf("w:never") === null, "recall of a word never tested");
});

await test("leech: missed on 8 different days after it was recalled", () => {
  let at = T0;
  record([row("w:leech", at)]);
  for (let i = 0; i < 8; i++) {
    at += 2 * DAY;
    record([row("w:leech", at, { outcome: "wrong" }), row("w:leech", at + MIN, { outcome: "wrong" })]);
  }
  const s = unitState("w:leech", { now: at });
  eq([s.strengths.read.lapses, s.leech], [8, true]);
  record([row("w:not-leech", T0, { outcome: "wrong" }), row("w:not-leech", T0 + DAY, { outcome: "wrong" })]);
  eq(unitState("w:not-leech", { now: T0 + DAY }).strengths.read.lapses, 0, "misses before it was ever recalled");
});

await test("leech: replaying the same evidence in another time zone keeps lapses and leech status", async () => {
  const evidence = [row("w:leech-zone", T0)];
  for (let i = 0; i < 4; i++) {
    const at = Date.UTC(2026, 9, 3 + i * 2, 23, 59);
    evidence.push(row("w:leech-zone", at, { outcome: "wrong" }), row("w:leech-zone", at + 2 * MIN, { outcome: "wrong" }));
  }
  const zone = process.env.TZ;
  const states = [];
  try {
    for (const tz of ["UTC", "America/New_York"]) {
      process.env.TZ = tz;
      await clearProgress();
      record(evidence);
      const s = unitState("w:leech-zone", { now: evidence.at(-1).at });
      states.push([s.strengths.read.lapses, s.leech]);
    }
  } finally {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
  eq(states, [[8, true], [8, true]], "UTC and New York");
});

await test("languages: the same id in two languages is two units; a row without one is Dutch", () => {
  record([row("w:in", T0), row("w:in", T0, { lang: "de", outcome: "wrong" })]);
  eq(unitState("w:in", { now: T0 + MIN }).strengths.read.reviews, 1);
  ok(knows("w:in", { now: T0 + MIN }), "nl w:in");
  ok(!knows("w:in", { lang: "de", now: T0 + MIN }), "de w:in");
});

await test("predictions: a graded row keeps what was predicted for it, from the strength's second test on", () => {
  const [first] = record([row("w:p", T0)]);
  const [second] = record([row("w:p", T0 + 3 * DAY, { outcome: "wrong" })]);
  const [met] = record([row("w:p", T0 + 4 * DAY, { outcome: "met" })]);
  ok(first.p === undefined, "the first test has a prediction");
  ok(second.p > 0.8 && second.p < 0.95, `predicted ${second.p}`);
  ok(met.p === undefined, "exposure got a prediction");
  const c = calibration();
  eq([c.n, c.actual], [1, 0]);
  ok(c.logLoss > 1, `log loss ${c.logLoss}`);
  eq(calibration({ stored: false }).n, 1, "replayed");
});

await test("until: the state from evidence before a moment (a session's 'before')", () => {
  record([row("w:until", T0), row("w:until", T0 + 3 * DAY)]);
  const before = conceptState("w:until", { until: T0 + DAY, now: T0 + 3 * DAY + MIN });
  const after = conceptState("w:until", { now: T0 + 3 * DAY + MIN });
  eq([before.seen, after.seen], [1, 2]);
  ok(after.level > before.level, "the second recall raised it");
});

// ---------- the plan ----------

const item = (id) => ITEMS.find((i) => i.id === id);
// One answered step of a sentence: every unit the game records, the way session.js records it.
function answer(id, at, { activity = "choose", test = "pick", skill = "read", wrong = false, words = false } = {}) {
  const it = item(id);
  const outcome = wrong ? "wrong" : "right";
  record(conceptsOf(it).map((concept) => ({ concept, at, outcome: concept.startsWith("w:") && !words ? "met" : outcome, test, skill, activity, item: id })));
}
const kinds = (plan) => plan.steps.map((s) => `${s.kind}${s.mode ? `/${s.mode}` : ""}:${s.item?.id ?? "words"}`);

await test("plan: nothing studied yet: new words, each met on a card and then asked about in another sentence", () => {
  const plan = planSession("quick", undefined, T0);
  const cards = plan.steps.filter((s) => s.kind === "card");
  eq(cards.length, 3, "three new words");
  ok(cards.every((s) => s.first && s.target && s.meaning === "new"), `first sight: ${JSON.stringify(cards.map((c) => [c.target, c.first]))}`);
  const asks = plan.steps.filter((s) => s.kind === "meaning");
  eq(asks.map((s) => s.target), cards.map((s) => s.target), "each word asked about");
  // In another sentence, where the deck has one (the starter's 13 sentences don't always).
  for (const ask of asks) {
    const others = ITEMS.filter((it) => it.words.some(([, lemma]) => lemma === ask.target) && !plan.steps.some((s) => s.first && s.item?.id === it.id));
    if (others.length) ok(ask.item.id !== cards.find((c) => c.target === ask.target).item.id, `${ask.target}: asked about in the sentence it was met in`);
  }
  const round = plan.steps.find((s) => s.kind === "match");
  ok(round, "a match round");
  eq(round.words, cards.map((s) => s.target), "Match holds only the words it taught");
  eq(plan.steps.findIndex((s) => s.kind === "match"), 3, "after the cards");
  ok(plan.steps.every((s) => s.meaning === "new"), "all new");
  // A game that asks about whole sentences has to wait: a few words first, and it says so.
  const game = planSession("game", "say", T0);
  ok(game.note && game.steps[0].kind === "card", `a game with nothing to run on: ${kinds(game)}`);
  ok(game.steps.every((s) => s.kind === "card" || s.kind === "meaning"), `whole sentences on unknown words: ${kinds(game)}`);
});

await test("every game says how it's answered (Study's Tapping, Typing and Speaking): typing Type it and its three twins, speaking Say it, Repeat after and their two word twins, Study cards tapping", () => {
  eq(GAME_MODES.map((m) => m.id), ["tap", "type", "speak"], "the modes, in Study's order");
  const ids = new Set(GAME_MODES.map((m) => m.id));
  for (const [kind, game] of Object.entries(GAMES)) ok(ids.has(game.mode), `${kind}: mode ${game.mode}`);
  const by = (mode) => Object.keys(GAMES).filter((kind) => modeOf(kind) === mode).sort();
  eq(by("type"), ["hear-gap", "type", "type-gap", "type-word"], "typing");
  eq(by("speak"), ["repeat", "repeat-word", "say", "say-word"], "speaking");
  eq(by("tap"), ["arrange", "choose", "fill", "listen", "match", "meaning", "place", "see", "translate", "word"], "tapping");
  eq(modeOf("card"), "tap", "Study cards");
  eq(modeOf("nothing"), null, "not a game");
});

await test("plan: a sentence missed yesterday comes back first, in the same game; after three misses in a row it rests", () => {
  const retries = (plan) => plan.steps.filter((s) => s.again).map((s) => `${s.kind}:${s.item.id}`);
  answer("morgen-oma", T0, { activity: "place", test: "build", wrong: true });
  eq(retries(planSession("quick", undefined, T0 + DAY)), ["place:morgen-oma"]);
  eq(kinds(planSession("quick", undefined, T0 + DAY))[0], "place:morgen-oma", "first");
  answer("morgen-oma", T0 + DAY, { activity: "place", test: "build", wrong: true });
  eq(retries(planSession("quick", undefined, T0 + DAY + MIN)), ["place:morgen-oma"], "a second retry");
  answer("morgen-oma", T0 + DAY + 2 * MIN, { activity: "place", test: "build", wrong: true });
  const resting = planSession("quick", undefined, T0 + DAY + 3 * MIN);
  ok(!resting.steps.some((s) => s.item?.id === "morgen-oma"), `a third retry: ${kinds(resting)}`);
  // Right on the retry: no more retries.
  answer("weet-komt", T0, { wrong: true });
  answer("weet-komt", T0 + MIN);
  ok(!retries(planSession("quick", undefined, T0 + DAY)).some((s) => s.endsWith("weet-komt")), "retried after a right answer");
  // Missed over two days ago: it's due instead, not a retry.
  answer("bel-op", T0, { wrong: true });
  ok(!retries(planSession("quick", undefined, T0 + 3 * DAY)).some((s) => s.endsWith("bel-op")), "retried after two days");
  // Three at most.
  for (const id of ["wil-lezen", "zie-niet", "winkel-brood", "denk-regent"]) answer(id, T0 + 2 * DAY, { wrong: true });
  eq(retries(planSession("quick", undefined, T0 + 2 * DAY + MIN)).length, 3, "retries in one session");
});

await test("plan: a due strength is served by a game that tests it", () => {
  // Saying v2: typed right two weeks ago, so it's due on saying (and reading, carried).
  answer("morgen-oma", T0, { activity: "type", test: "recall", skill: "say" });
  answer("vader-thuis", T0, { activity: "type", test: "recall", skill: "say" });
  const plan = planSession("reviews", undefined, T0 + 14 * DAY);
  const first = plan.steps[0];
  ok(["morgen-oma", "vader-thuis"].includes(first.item.id), `first: ${kinds(plan)}`);
  ok(first.skill === "say" || first.skill === "read", `skill ${first.skill}`);
  // Hearing due: Listening, with a version that tests hearing.
  setStudySetting("memory.train.say", false);
  setStudySetting("memory.train.read", false);
  answer("wil-lezen", T0, { activity: "listen-type", test: "recall", skill: "hear" });
  const hear = planSession("reviews", undefined, T0 + 14 * DAY);
  eq([hear.steps[0].kind, hear.steps[0].skill, hear.steps[0].item.id], ["listen", "hear", "wil-lezen"]);
  ok(["meaning", "order", "type"].includes(hear.steps[0].mode), `mode ${hear.steps[0].mode}`);
});

await test("plan: what's due gets at least half the session; new words the rest", () => {
  for (const it of ITEMS.slice(0, 4)) answer(it.id, T0, { activity: "type", test: "recall", skill: "say" });
  const plan = planSession("quick", undefined, T0 + 20 * DAY);
  const due = plan.steps.filter((s) => s.meaning === "review" || s.meaning === "slipping");
  const cards = plan.steps.filter((s) => s.kind === "card");
  ok(due.length >= 4, `due steps: ${kinds(plan)}`);
  ok(cards.length >= 1, `no new words: ${kinds(plan)}`);
  ok(plan.steps.length <= 9, `too long: ${plan.steps.length}`);
});

await test("plan: an explicit setting wins: tiles always in Dutch never serve saying", () => {
  answer("morgen-oma", T0, { activity: "arrange-english", test: "recall", skill: "say" });
  setStudySetting("memory.train.read", false);
  setStudySetting("arrange.tiles", "dutch");
  for (const way of ["type", "say", "listen", "choose", "place", "fill", "meaning", "repeat", "cards", "match"]) setStudySetting(`quick.include.${way}`, false);
  const plan = planSession("quick", undefined, T0 + 30 * DAY);
  ok(plan.steps.length > 0, "nothing planned");
  ok(plan.steps.every((s) => s.kind === "arrange" && s.skill !== "say"), `steps ${JSON.stringify(plan.steps.map((s) => [s.kind, s.mode, s.skill]))}`);
});

await test("plan: no new words while twice a session's worth is due; half as many while under 80% right", async () => {
  for (const it of ITEMS.slice(0, 10)) answer(it.id, T0, { activity: "type", test: "recall", skill: "say", words: true });
  // Studied every other day since (one other sentence), so day 60 is a heavy day, not a comeback.
  for (let d = 2; d < 60; d += 2) answer(ITEMS[12].id, T0 + d * DAY);
  ok(!overview(T0 + 60 * DAY).comeback, "not a comeback");
  const heavy = planSession("quick", undefined, T0 + 60 * DAY);
  ok(overview(T0 + 60 * DAY).due >= 14, `due ${overview(T0 + 60 * DAY).due}`);
  ok(!heavy.steps.some((s) => s.meaning === "new" && s.kind === "card"), `new on a heavy day: ${kinds(heavy)}`);
  await clearProgress();
  for (let i = 0; i < 20; i++) answer(ITEMS[i % 3].id, T0 + i * MIN, { wrong: i % 2 === 0 });
  const struggling = planSession("quick", undefined, T0 + 20 * MIN);
  eq(struggling.steps.filter((s) => s.kind === "card" && s.meaning === "new").length, 1, "new while under 80%");
});

await test("coming back after 3+ days away: today's share of the pile, a session of its usual size, new sentences again", async () => {
  for (const it of ITEMS.slice(0, 10)) answer(it.id, T0, { activity: "type", test: "recall", skill: "say", words: true });
  const back = T0 + 60 * DAY; // 59 days away
  const o = overview(back);
  ok(o.comeback && o.comeback.away === 59 && o.comeback.day === 0 && o.comeback.days === 7, `comeback: ${JSON.stringify(o.comeback)}`);
  eq(o.due, Math.ceil(o.dueAll / 7), "today's share");
  ok(o.dueAll >= 14 && o.due < o.dueAll, `due ${o.due} of ${o.dueAll}`);
  const plan = planSession("quick", undefined, back);
  ok(plan.steps.length >= 6 && plan.steps.length <= 9, `a usual session: ${plan.steps.length}`);
  ok(plan.steps.some((s) => s.meaning === "new" && s.kind === "card"), `new sentences again: ${kinds(plan)}`);
  // The session still takes what you're most likely to have lost: its first review is the lowest recall due.
  ok(plan.steps.filter((s) => s.meaning !== "new").length >= 3, `reviews: ${kinds(plan)}`);
  // Studying on the day back (and the next): the pile's rest spreads over the days left.
  answer(ITEMS[0].id, back + 60 * MIN);
  const day2 = overview(back + DAY);
  ok(day2.comeback && day2.comeback.day === 1 && day2.due === Math.ceil(day2.dueAll / 6), `day 2: ${JSON.stringify({ c: day2.comeback, due: day2.due, all: day2.dueAll })}`);
  // A week on, studying every other day, the spread is over: what's due counts whole again.
  answer(ITEMS[1].id, back + 3 * DAY);
  answer(ITEMS[2].id, back + 5 * DAY);
  const after = overview(back + 7 * DAY);
  ok(!after.comeback && after.due === after.dueAll, `after the week: ${JSON.stringify({ c: after.comeback, due: after.due, all: after.dueAll })}`);
  // Two days away isn't a comeback; three is (spread over three days).
  await clearProgress();
  answer(ITEMS[0].id, T0);
  ok(!overview(T0 + 3 * DAY).comeback, "two days away");
  const three = overview(T0 + 4 * DAY).comeback;
  ok(three && three.away === 3 && three.days === 3, `three days away: ${JSON.stringify(three)}`);
  // Nothing studied yet: no comeback.
  await clearProgress();
  ok(!overview(T0).comeback, "a first day");
});

// Coming back as it was worked out before 7 Nov 2026, from every day studied (every row made into a day): what plan.js comebackOf, which reads
// only the recent days, must always agree with.
function comebackByEveryDay(now) {
  const studied = [...new Set(allEvidence().filter((row) => (row.lang ?? "nl") === "nl" && row.at <= now).map((row) => dayNumber(dayKey(row.at))))].sort((a, b) => b - a);
  if (!studied.length) return null;
  const today = dayNumber(dayKey(now));
  const starts = studied[0] === today ? studied : [today, ...studied];
  for (let i = 0; i < starts.length - 1; i++) {
    const away = starts[i] - starts[i + 1] - 1;
    if (away < 3) continue;
    const days = Math.min(away, 7);
    const day = today - starts[i];
    return day >= days ? null : { away, day, days, share: 0 };
  }
  return null;
}

await test("coming back is worked out from the recent days alone, the same as from every day: 400 histories, answers either side of 4 am and across the clocks changing", async () => {
  let x = 11;
  const draw = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  // From 20 Oct 2026 local midnight: the clocks go back on 25 Oct (Europe) and 1 Nov (US), so both are inside.
  const start = new Date(2026, 9, 20).getTime();
  let compared = 0;
  let comebacks = 0;
  for (let h = 0; h < 400; h++) {
    await clearProgress();
    const rows = [];
    let day = Math.floor(draw() * 5);
    while (day < 40) {
      // A few answers on a day, one of them a minute either side of 4 am now and then.
      for (let k = 1 + Math.floor(draw() * 3); k > 0; k--) {
        const minute = draw() < 0.3 ? 4 * 60 + (draw() < 0.5 ? -1 : 1) : Math.floor(draw() * 1440);
        const at = new Date(start).setDate(new Date(start).getDate() + day) + minute * MIN;
        rows.push(row("w:huis", at));
      }
      // Gaps of a day to two weeks, so some histories come back after 3+ days away and some don't.
      day += 1 + Math.floor(draw() < 0.6 ? draw() * 3 : draw() * 14);
    }
    record(rows);
    for (let t = 0; t < 4; t++) {
      const now = start + Math.floor(draw() * 45 * 24 * 60) * MIN;
      const fast = comebackOf({ now, due: [] });
      const slow = comebackByEveryDay(now);
      eq(fast, slow, `history ${h} at ${new Date(now).toString().slice(0, 24)}`);
      compared++;
      if (fast) comebacks++;
    }
  }
  ok(comebacks > 50 && compared - comebacks > 50, `the histories don't test both ways: ${comebacks} comebacks of ${compared}`);
  return `${compared} moments, ${comebacks} of them comebacks`;
});

await test("plan: what's slipping, and the gap between reading and saying, each get a session of their own", () => {
  answer("boek-gelezen", T0, { activity: "type", test: "recall", skill: "say", words: true });
  answer("morgen-oma", T0, { activity: "choose", test: "build", skill: "read", words: true });
  const slipping = planSession("slipping", undefined, T0 + 30 * DAY);
  ok(slipping.steps.length > 0 && slipping.steps.every((s) => s.meaning === "slipping"), `slipping: ${kinds(slipping)}`);
  ok(planSession("slipping", undefined, T0 + 2 * MIN).empty, "slipping right after studying");
  // Words read (morgen-oma's, by Choose with the words right) but never said: the gap for saying is through games that say.
  const gap = planSession("gap", "word/say", T0 + DAY);
  ok(gap.steps.length > 0 && gap.steps.every((s) => s.skill === "say"), `gap: ${JSON.stringify(gap.steps.map((s) => [s.kind, s.skill, s.item?.id]))}`);
  ok(planSession("gap", "word/nonsense", T0).empty, "a gap that isn't one");
});

await test("summaries: what you know by kind and strength, slipping, stronger today, the week, the forecast", async () => {
  const { knowledge, week, forecast, history } = await import("../public/js/know/summary.js");
  const now = Date.UTC(2026, 9, 28, 12); // a Wednesday
  answer("boek-gelezen", now - 20 * DAY, { activity: "type", test: "recall", skill: "say", words: true });
  answer("morgen-oma", now - 60 * 60_000, { activity: "type", test: "recall", skill: "say", words: true });
  record([row("c:hoe-gaat-het", now - DAY, { skill: "say", test: "free", activity: "practice:conversation", how: "spoken" })]);
  const k = knowledge({ now });
  eq([k.kinds.pattern.started, k.kinds.phrase.started, k.kinds.phrase.by.hear], [2, 1, 1]);
  ok(k.kinds.word.by.say >= 3 && k.kinds.word.by.read >= 3, `words: ${JSON.stringify(k.kinds.word)}`);
  ok(k.slipping.includes("p:perfect"), `slipping: ${k.slipping}`);
  ok(k.stronger.includes("p:v2"), `stronger today: ${k.stronger}`);
  const w = week({ now });
  eq([w.days.length, w.days.findIndex((d) => d.today), w.studied], [7, 2, 2]);
  eq(w.days.map((d) => (d.studied ? "x" : d.future ? "." : "-")).join(""), "-xx....");
  const f = forecast({ now });
  eq(f.length, 7);
  ok(f[0].count >= 4, `due today: ${f.map((d) => d.count)}`); // perfect and its three words, typed 20 days ago
  ok(f.slice(1).every((d) => Number.isInteger(d.count)), "a count a day");
  eq(history("p:perfect").tests.length, 1);
  // Each day's reviews are the units themselves, as many as its count.
  ok(f.every((d) => d.units.length === d.count) && f[0].units.includes("p:perfect"), `units due: ${JSON.stringify(f.map((d) => d.units))}`);
});

await test("what you knew over time, and what you can read but can't say", async () => {
  const { knowledge, growth, readNotSaid } = await import("../public/js/know/summary.js");
  const now = Date.UTC(2026, 9, 28, 12);
  eq(growth({ now }).map((p) => p.n).join(""), "0".repeat(28), "nothing studied, nothing known");
  answer("boek-gelezen", now - 20 * DAY, { activity: "type", test: "recall", skill: "say", words: true });
  answer("morgen-oma", now - 3 * DAY, { words: true }); // Choose: read, never said
  const points = growth({ now });
  eq(points.length, 28);
  eq(points.at(-1).at, now);
  ok(points.every((p, i) => i === 0 || p.at > points[i - 1].at), "oldest first");
  // Before the first answer nothing; on its day something; today what knowledge() counts now.
  ok(points.filter((p) => p.at < now - 20 * DAY).every((p) => p.n === 0), `before: ${points.map((p) => p.n)}`);
  ok(points.find((p) => p.at >= now - 20 * DAY).n > 0, `on the day: ${points.map((p) => p.n)}`);
  eq(points.at(-1).n, knowledge({ now }).kinds.word.known);
  // The day before Choose counts only what came before it.
  const before = points.find((p) => p.at >= now - 4 * DAY);
  ok(before.n < points.find((p) => p.at >= now - 3 * DAY).n, `Choose adds words: ${points.map((p) => p.n)}`);
  const gap = readNotSaid({ now });
  ok(gap.word.length > 0, "Choose's words are read, not said");
  for (const kind of ["word", "pattern", "phrase"]) {
    ok(gap[kind].every((u) => { const st = unitState(u, { now }); return st.strengths.read?.known && !st.strengths.say?.known; }), `${kind}: ${gap[kind]}`);
  }
});

await test("where it came from, every day you studied, and search", async () => {
  const { sources, calendar, searchUnits } = await import("../public/js/know/summary.js");
  const now = Date.UTC(2026, 9, 28, 12);
  // One answer (a step's rows together), one page read (forty words met at once), two turns with your AI.
  answer("morgen-oma", now - 2 * DAY, { activity: "type", test: "recall", skill: "say", words: true });
  record(Array.from({ length: 40 }, (_, i) => row(`w:woord${i}`, now - DAY, { outcome: "met", activity: "reader" })));
  record([row("w:gaan", now - 3 * 60_000, { skill: "say", test: "free", activity: "practice:conversation" })]);
  record([row("w:oma", now - 60_000, { skill: "say", test: "free", activity: "practice:conversation" })]);
  eq(sources({ since: now - 7 * DAY }), { games: 1, reading: 1, talk: 2, listening: 0 });
  const cal = calendar({ now, weeks: 4 });
  eq([cal.weeks.length, cal.weeks[3].length, cal.studied], [4, 7, 3]);
  const days = cal.weeks.flat();
  eq(days.filter((d) => d.today).length, 1);
  eq(days.find((d) => d.today).level, 1);
  ok(days.filter((d) => d.future).length === 4, "Thursday to Sunday still to come"); // 28 Oct 2026 is a Wednesday
  // Search: a word by its Dutch or its English, a pattern and a phrase by their names.
  eq(searchUnits("gaan")[0].unit, "w:gaan");
  ok(searchUnits("grandma").some((hit) => hit.unit === "w:oma"), "by its English");
  eq(searchUnits("verb second")[0].unit, "p:v2");
  ok(searchUnits("hoe gaat").some((hit) => hit.unit === "c:hoe-gaat-het"), "a phrase");
  eq(searchUnits("   "), []);
  ok(searchUnits("zz-nothing").length === 0, "nothing for nonsense");
});

await test(`the grammar map: every pattern under the first one it builds on, lit by how well you know it (strong only past ${IDEA_FIRM.answers} answers on ${IDEA_FIRM.days} days)`, async () => {
  const { grammarMap } = await import("../public/js/know/summary.js");
  const typed = { activity: "type", test: "recall", skill: "say" };
  answer("morgen-oma", T0, typed);
  answer("vader-thuis", T0 + 3 * DAY, typed);
  answer("vader-thuis", T0 + 14 * DAY, typed);
  const rows = grammarMap({ now: T0 + 14 * DAY + MIN });
  // Only the patterns a sentence here shows (the starter's eight), though the catalog has more.
  eq(rows.map((r) => `${"  ".repeat(r.depth)}${r.unit.slice(2)}`), ["v2", "  perfect", "  separable", "  modal", "    dat", "    omte", "  niet", "  question"]);
  eq(rows.find((r) => r.unit === "p:dat").also, ["Perfect tense: verb last"]);
  // Verb second on three answers is still learning (scheduler.js IDEA_FIRM), however well they went.
  eq([rows[0].state, rows[1].state], ["learning", "new"], "on three answers");
  // Twelve more on two more days: strong.
  for (const day of [30, 60]) for (let k = 0; k < 6; k++) answer("vader-thuis", T0 + day * DAY + k * 10 * MIN, typed);
  eq(grammarMap({ now: T0 + 60 * DAY + 2 * 60 * MIN })[0].state, "strong", "on fifteen answers on five days");
});

await test("a catalog pattern no sentence shows yet isn't offered; once it's studied, it's on the map under what it builds on", async () => {
  const { grammarMap, knowledge } = await import("../public/js/know/summary.js");
  const { PATTERNS, PATTERNS_IN_USE } = await import("../public/js/study/content.js");
  const unused = Object.keys(PATTERNS).filter((id) => !PATTERNS_IN_USE.has(id));
  ok(unused.includes("omdat") && unused.includes("de-het"), `the catalog's patterns no starter sentence shows: ${unused.join(", ")}`);
  const before = grammarMap({ now: T0 });
  ok(!before.some((r) => unused.includes(r.unit.slice(2))), "an unused pattern is on the map");
  const patternsCounted = (k) => k.kinds.pattern.started;
  eq(patternsCounted(knowledge({ now: T0 })), 0);
  // Evidence for one (a sentence from a pack since turned off, say): it's on the map, under dat (what omdat builds on).
  record([row("p:omdat", T0, { activity: "type", test: "recall", skill: "read" })]);
  const after = grammarMap({ now: T0 + MIN });
  const omdat = after.findIndex((r) => r.unit === "p:omdat");
  ok(omdat > 0 && after[omdat].depth === after.find((r) => r.unit === "p:dat").depth + 1 && after[omdat - 1].unit === "p:dat", JSON.stringify(after.map((r) => [r.unit, r.depth])));
  eq(patternsCounted(knowledge({ now: T0 + MIN })), 1);
});

// The Dutch frequency list, when given (it's published to the open library, not kept in this repo):
//   node scripts/test-scheduler.mjs --list <frequency.nl.json>
const listAt = process.argv.indexOf("--list");
if (listAt > 0 && existsSync(process.argv[listAt + 1])) {
  const { useFrequency, everyday } = await import("../public/js/study/frequency.js");
  await test("frequency: words come in by how common they are; the everyday share counts the words you know", async () => {
    // What you know, worked out before the list arrives, is worked out again once it's here.
    const { knowledge } = await import("../public/js/know/summary.js");
    eq(knowledge({ now: T0 }).everyday, null);
    useFrequency(JSON.parse(readFileSync(process.argv[listAt + 1], "utf8")));
    ok(knowledge({ now: T0 }).everyday, "the share is still missing once the list is here");
    record([row("w:ik", T0), row("w:zijn", T0), row("w:jij", T0)]);
    const known = new Set(["ik", "zijn", "jij"].filter((w) => knows(`w:${w}`, { now: T0 + MIN })));
    const share = everyday(known);
    ok(share.share > 0.13 && share.share < 0.14, `share ${share.share}`);
    // New words come most common first: of the ones the deck has, those three are known, so het (4th) and de (5th) lead
    // (without the list, the deck's order).
    const { rankOf } = await import("../public/js/study/frequency.js");
    const cards = planSession("quick", undefined, T0).steps.filter((s) => s.kind === "card").map((s) => s.target);
    eq(cards, [...cards].sort((a, b) => rankOf(a) - rankOf(b)), "most common first");
    ok(!cards.some((word) => ["ik", "zijn", "jij"].includes(word)), `a known word as new: ${cards}`);
    // The next common words: the same order, on their own.
    const frequent = planSession("frequent", undefined, T0);
    eq(frequent.steps.filter((s) => s.first).map((s) => s.target), cards, "frequent");
    // The strip: the list's first words in order, the ones you know filled, your word bank's as said.
    const { wordStrip } = await import("../public/js/know/summary.js");
    const strip = wordStrip({ now: T0 + MIN, size: 100, said: new Set(["het"]) });
    eq([strip.cells.length, strip.cells[0].lemma, strip.cells[0].state, strip.cells[2].state], [100, "ik", "known", "known"]);
    eq(strip.cells.find((c) => c.lemma === "het").state, "said");
    eq(strip.counts.known + strip.counts.said + strip.counts.learning + strip.counts.slipping + strip.counts.new, 100);
  });
} else console.log("skip  frequency: give --list <frequency.nl.json> to test it");

// Last, as it adds a pack: a deck the size of a word series (10,000 sentences) plans a quick session in well under a
// second on this Mac. The deck's teaching order is worked out once per change, never inside the plan's sorts: that
// made 2,000 sentences take most of a second and 20,000 most of a minute (2 Nov 2026).
await test("a quick session over 10,000 sentences is planned in under 2 s", async () => {
  const { savePack, deletePack } = await import("../public/js/study/packs.js");
  const { BUILT_IN } = await import("../public/js/packs/index.js");
  const base = BUILT_IN[0];
  const items = [];
  // Each copy its own sentence: one word more at the end (a word with no lemma), and its own English.
  for (let n = 0; items.length < 10_000; n++) for (const item of base.items) items.push({ ...item, id: `${item.id}-${n}`, text: undefined, words: [...item.words, [`x${n}`]], means: `${item.means.replace(/[.?!]$/, "")} (${n}).` });
  // Five packs of 2,000 (a pack's limit). The starter's phrase is the built-in pack's, which a pack of yours may use.
  const ids = [0, 1, 2, 3, 4].map((k) => `big-deck-check-${k}`);
  for (const [k, id] of ids.entries()) {
    const saved = await savePack({ ...base, id, name: `A big deck ${k + 1} (check)`, items: items.slice(k * 2000, (k + 1) * 2000), chunks: {}, topics: base.topics });
    ok(saved.ok, JSON.stringify(saved.errors?.slice(0, 2)));
  }
  try {
    ok(ITEMS.length >= 10_000, `${ITEMS.length} sentences`);
    planSession("quick");
    const t = performance.now();
    const plan = planSession("quick");
    const ms = performance.now() - t;
    ok(plan && ms < 2000, `${Math.round(ms)} ms`);
  } finally {
    for (const id of ids) await deletePack(id);
  }
});

await test("understood: a word you understand well, not one you've only met (know/summary.js)", async () => {
  const { understood, UNDERSTOOD_LEVEL } = await import("../public/js/know/summary.js");
  const { addWord, removeWord } = await import("../public/js/read/bank.js");
  // Met and answered right once: known for about a week, and not understood. The same twice that day: still not.
  record([row("w:een-keer", T0)]);
  ok(unitState("w:een-keer", { now: T0 + DAY }).strengths.read.known, "one right answer is known");
  ok(!understood("w:een-keer", { lang: "nl", now: T0 + DAY }), "one right answer is not understood");
  record([row("w:zelfde-dag", T0), row("w:zelfde-dag", T0 + 10 * MIN)]);
  ok(!understood("w:zelfde-dag", { lang: "nl", now: T0 + DAY }), "twice the same day is not understood");
  // Right again two days later, when it came due: understood, and the state handed in says the same.
  record([row("w:twee-dagen", T0), row("w:twee-dagen", T0 + 2 * DAY)]);
  const now = T0 + 3 * DAY;
  ok(understood("w:twee-dagen", { lang: "nl", now }), `right again on a later day: level ${unitState("w:twee-dagen", { now }).strengths.read.level}`);
  ok(understood("w:twee-dagen", { lang: "nl", now, state: unitState("w:twee-dagen", { now }) }), "with its state handed in");
  // Long after, its recall gone under the line: not now.
  ok(!understood("w:twee-dagen", { lang: "nl", now: T0 + 400 * DAY }), "a year untouched is not understood now");
  // A phrase by the same rule. Read is the strength it asks about: a word only heard isn't (saying it right counts for reading it too,
  // scheduler.js).
  record([row("c:goed-zo", T0), row("c:goed-zo", T0 + 2 * DAY)]);
  ok(understood("c:goed-zo", { lang: "nl", now }), "a phrase right again on a later day");
  record([row("w:alleen-gehoord", T0, { skill: "hear" }), row("w:alleen-gehoord", T0 + 2 * DAY, { skill: "hear" })]);
  ok(!understood("w:alleen-gehoord", { lang: "nl", now }), `only heard, never read: ${JSON.stringify(unitState("w:alleen-gehoord", { now }).strengths.read)}`);
  // A word you've said you know (your word bank), never studied: understood, until it leaves the bank.
  ok(!understood("w:fiets", { lang: "nl", now }), "a word never met");
  addWord("nl", "fiets", { quiet: true });
  try {
    ok(understood("w:fiets", { lang: "nl", now }), "a word in the word bank");
    ok(!understood("w:fiets", { lang: "de", now }), "in another language's bank it isn't");
  } finally {
    removeWord("nl", "fiets");
  }
  ok(!understood("w:fiets", { lang: "nl", now }), "taken out of the bank");
  ok(!understood(null) && !understood(undefined), "no unit");
  eq(UNDERSTOOD_LEVEL, 3);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
