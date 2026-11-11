// The streak page's year and a day of it (public/js/know/streak-days.js), in Node: the months from the first day the streak knows to today's,
// newest first and a year at most, each day's state as Home's week row has it (a mended day a rest day, a missed day plain, never "missed"),
// Monday first; when a day begins and ends (4 am); what you did on a day: only the words and ideas you came to know well that day (known at
// its end, not at its start, with evidence that day, in the language you're learning), the lessons by title, sessions, minutes read and
// conversations; the parts the page works the words out from in slices (dayUnits, crossings: one question a step, the start first, the
// end only for a unit not known then; units with no right answer that day never asked), adding up to the same. Each with a control that a wrong rule would fail. `node scripts/test-streak-days.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { crossings, dayBounds, dayDoings, dayThings, dayUnits, MONTHS_SHOWN, streakMonths, wordsAndIdeas } from "../public/js/know/streak-days.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(error.stack ?? error).split("\n").slice(0, 4).join("\n      ")}`);
  }
}

test("the months: from the first day known to today's, newest first; each day's state; Monday first; days after today future", () => {
  const statuses = { "2026-09-30": "studied", "2026-10-01": "rested", "2026-10-02": "mended", "2026-10-03": "paused", "2026-10-04": "missed", "2026-11-04": "studied" };
  const months = streakMonths(statuses, "2026-11-06");
  assert.deepEqual(months.map((m) => `${m.year}-${m.month + 1}`), ["2026-11", "2026-10", "2026-9"]);
  // November 2026 starts on a Sunday: six blanks before it, Monday first.
  assert.equal(months[0].lead, 6);
  assert.equal(months[0].days.length, 30);
  const state = (key) => months.flatMap((m) => m.days).find((d) => d.key === key).state;
  assert.equal(state("2026-10-01"), "rested");
  assert.equal(state("2026-10-02"), "rested", "a mended day is drawn as a rest day, as Home's week row does");
  assert.equal(state("2026-10-03"), "paused");
  assert.equal(state("2026-10-04"), "plain", "a missed day is a plain day");
  assert.equal(state("2026-11-04"), "studied");
  assert.equal(state("2026-11-07"), "future");
  assert.ok(!JSON.stringify(months).includes("missed"), "no day is ever called missed");
});

test("a year at most; a new streak its own month only", () => {
  const long = streakMonths({ "2024-01-15": "studied" }, "2026-11-06");
  assert.equal(long.length, MONTHS_SHOWN);
  assert.equal(`${long.at(-1).year}-${long.at(-1).month + 1}`, "2025-12");
  assert.equal(streakMonths({}, "2026-11-06").length, 1);
  assert.equal(streakMonths({ "2026-11-06": "studied" }, "2026-11-06").length, 1);
});

test("a day runs from 4 am to 4 am, as the streak counts it", () => {
  const { start, end } = dayBounds("2026-11-04");
  assert.equal(new Date(start).getHours(), 4);
  assert.equal(new Date(start).getDate(), 4);
  assert.equal(new Date(end).getDate(), 5);
  assert.equal(new Date(end).getHours(), 4);
});

// A learner's evidence and what they knew when: known well from a moment on, per unit.
const { start, end } = dayBounds("2026-11-04");
const evidence = [
  { at: start + 3_600_000, concept: "w:huis", lang: "nl" }, // known well that day
  { at: start + 3_700_000, concept: "w:fiets", lang: "nl" }, // known well before the day: not new
  { at: start + 3_800_000, concept: "w:morgen", lang: "nl" }, // practiced, not yet known well
  { at: start + 3_900_000, concept: "p:v2", lang: "nl" }, // an idea known well that day
  { at: start + 4_000_000, concept: "c:goede-morgen", lang: "nl" }, // a phrase known well that day
  { at: start + 4_100_000, concept: "w:casa", lang: "es" }, // another language
  { at: start - 3_600_000, concept: "w:koud", lang: "nl" }, // the day before (known well by its end, but no evidence on the day)
];
const knownFrom = { "w:huis": start + 3_600_000, "w:fiets": start - 86_400_000, "p:v2": start + 3_900_000, "c:goede-morgen": start + 4_000_000, "w:casa": start + 4_100_000, "w:koud": start - 1000 };
const knewAt = (unit, at) => unit in knownFrom && knownFrom[unit] <= at;
const things = [
  { kind: "lesson", id: "nl-u1-l1", at: start + 1 },
  { kind: "lesson", id: "gone-lesson", at: start + 2 },
  { kind: "session", id: "a".repeat(16), at: start + 3 },
  { kind: "practice", id: "b".repeat(16), at: start + 4 },
  { kind: "read", id: "2026-11-04#1", at: start + 5 },
  { kind: "read", id: "2026-11-04#2", at: start + 6 },
  { kind: "talk", id: "talk-1", at: start + 7 },
];
const titles = { "nl-u1-l1": "Something to drink" };
const names = { "c:goede-morgen": "goede morgen", "p:v2": "The verb comes second" };
const nameOf = (unit) => names[unit] ?? unit.slice(2);

test("a day: the words and ideas known well that day only, in its language; lessons by title; sessions, minutes read, conversations", () => {
  const d = dayDoings("2026-11-04", { things, evidence, lang: "nl", knewAt, lessonTitle: (id) => titles[id] ?? null, nameOf });
  assert.deepEqual(d.words, ["huis", "goede morgen"]);
  assert.deepEqual(d.ideas, ["The verb comes second"]);
  assert.deepEqual(d.lessons, ["Something to drink"]);
  assert.equal(d.untitled, 1, "a lesson with no title found still counts");
  assert.equal(d.sessions, 2, "a session and a practice");
  assert.equal(d.minutes, 10);
  assert.equal(d.talks, 1);
});

test("control: counting a word known at the day's end, without asking about its start, counts one known before (fiets)", () => {
  const wrong = dayDoings("2026-11-04", { things, evidence, lang: "nl", knewAt: (unit, at) => (at === end ? knewAt(unit, at) : false), nameOf });
  assert.ok(wrong.words.includes("fiets"), "the control didn't change the answer: the test couldn't tell");
});

test("in parts, as the page works it out in slices: the day's units in its language, one question a step, the start first, the same answer", () => {
  const units = dayUnits("2026-11-04", { evidence, lang: "nl" });
  assert.deepEqual(units, ["w:huis", "w:fiets", "w:morgen", "p:v2", "c:goede-morgen"], "the day's units, first seen first, Spanish and the day before left out");
  const asked = [];
  const counting = (unit, at) => (asked.push(`${unit}@${at === start ? "start" : "end"}`), knewAt(unit, at));
  const asking = crossings(units, { start, end });
  let steps = 0;
  while (!asking.done) {
    const before = asked.length;
    asking.step(counting);
    assert.equal(asked.length - before, 1, "a step asked more than one question");
    steps++;
  }
  // fiets, known at the start, is asked once; every other twice, the start first.
  assert.deepEqual(asked.filter((a) => a.startsWith("w:fiets")), ["w:fiets@start"], "a unit known at the start was asked about its end too");
  assert.deepEqual(asked.filter((a) => a.startsWith("w:huis")), ["w:huis@start", "w:huis@end"]);
  assert.equal(steps, 9, "five units, four of them not known at the start");
  const whole = dayDoings("2026-11-04", { things, evidence, lang: "nl", knewAt, lessonTitle: (id) => titles[id] ?? null, nameOf });
  assert.deepEqual({ ...wordsAndIdeas(asking.crossed, nameOf), ...dayThings(things, (id) => titles[id] ?? null) }, whole);
});

test("control: asking the end first asks about every unit's end, fiets's too (the old order's cost)", () => {
  const asked = [];
  const counting = (unit, at) => (asked.push(`${unit}@${at === start ? "start" : "end"}`), knewAt(unit, at));
  for (const unit of dayUnits("2026-11-04", { evidence, lang: "nl" })) if (counting(unit, end)) counting(unit, start);
  assert.ok(asked.includes("w:fiets@end"), "the control asked what the rule asks: the test couldn't tell");
});

test("a unit with no right answer that day isn't asked about, and the answer is the same; a rule that let it in would name it", () => {
  // morgen was only missed that day; huis answered right. Both known at the end, as a control: let in, morgen would count.
  const rows = [
    { at: start + 100, concept: "w:huis", lang: "nl", right: true },
    { at: start + 200, concept: "w:morgen", lang: "nl", right: false },
  ];
  const rose = (row) => row.right;
  const known = { "w:huis": start + 100, "w:morgen": start + 200 };
  const ask = (unit, at) => unit in known && known[unit] <= at;
  assert.deepEqual(dayUnits("2026-11-04", { evidence: rows, lang: "nl", rose }), ["w:huis"]);
  assert.deepEqual(dayDoings("2026-11-04", { evidence: rows, lang: "nl", knewAt: ask, rose }).words, ["huis"]);
  assert.deepEqual(dayDoings("2026-11-04", { evidence: rows, lang: "nl", knewAt: ask }).words, ["huis", "morgen"], "the control: without rose, morgen is asked about");
});

test("a day with nothing: all empty", () => {
  const d = dayDoings("2026-11-01", { things: [], evidence, lang: "nl", knewAt, nameOf });
  assert.deepEqual([d.words, d.ideas, d.lessons, d.untitled, d.sessions, d.minutes, d.talks], [[], [], [], 0, 0, 0, 0]);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
