// The evidence rules, case by case: how a row becomes a review grade (progress.js gradeOf, normalize), which units a
// word-by-word answer is evidence for (attribute.js, with the real matcher), and that exposure and pronunciation never
// move a strength. Pure, so it runs in Node: `node scripts/test-evidence.mjs` (exit 0 = pass).

import { conceptState, gradeOf, normalize, record } from "../public/js/study/progress.js";
import { allWrong, orderOutcome, patternOutcomes, slipBetween, slipOfResult, typedRight, wordOutcomes } from "../public/js/study/attribute.js";
import { conceptKind } from "../public/js/lang/form-concepts.js";
import { match } from "../public/js/speech/match.js";

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const eq = (actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${a} ≠ ${e}`);
};

test("grades: a recall is good, a pick or a self-grade is hard, a hint that shows the answer is again", () => {
  eq(gradeOf({ outcome: "right", test: "recall" }), "good");
  eq(gradeOf({ outcome: "right", test: "build" }), "good");
  eq(gradeOf({ outcome: "right", test: "pick" }), "hard");
  eq(gradeOf({ outcome: "right", test: "self" }), "hard");
  eq(gradeOf({ outcome: "right", test: "judged" }), "hard");
  eq(gradeOf({ outcome: "right", test: "recall", help: "nudge" }), "hard");
  eq(gradeOf({ outcome: "right", test: "recall", help: "answer" }), "again");
  eq(gradeOf({ outcome: "wrong", test: "pick" }), "again");
});
test("grades: your AI's wrong counts fully only with a mark on your words", () => {
  eq(gradeOf({ outcome: "wrong", test: "free", marked: true }), "again");
  eq(gradeOf({ outcome: "wrong", test: "free", marked: false }), "hard");
  eq(gradeOf({ outcome: "right", test: "free" }), "good");
});
test("exposure and pronunciation are never reviews", () => {
  eq(gradeOf({ outcome: "met", test: "recall" }), null);
  eq(gradeOf({ outcome: "right", skill: "sound" }), null);
  eq(gradeOf({ outcome: "wrong", skill: "sound" }), null);
});
test("rows from before 27 Oct read in the new format", () => {
  eq(normalize({ outcome: "seen", skill: "reading" }).outcome, "met");
  eq(normalize({ outcome: "right", skill: "listening" }).skill, "hear");
  eq(normalize({ outcome: "right", skill: "writing" }).skill, "say");
  eq(normalize({ outcome: "right" }).skill, "read");
  eq(gradeOf({ outcome: "hint", skill: "reading" }), "again"); // a game's literal-line hint showed the order
  eq(gradeOf({ outcome: "hint", source: "ai", skill: "speaking" }), "hard"); // your AI's hint was a nudge
  eq(gradeOf({ outcome: "seen" }), null);
});
test("strength: met rows and sounds don't move it; tests do", () => {
  record([1, 2, 3, 4, 5].map((n) => ({ concept: "w:test-met", outcome: "met", activity: "test", item: `met#${n}` })));
  record([{ concept: "w:test-met", outcome: "right", skill: "sound", activity: "test", item: "sound#1" }]);
  const met = conceptState("w:test-met");
  eq([met.level, met.seen, met.met, met.isNew], [0, 0, 5, true]);
  record([{ concept: "w:test-met", outcome: "right", test: "recall", activity: "test", item: "recall#1" }]);
  const tested = conceptState("w:test-met");
  eq([tested.seen, tested.right, tested.isNew], [1, 1, false]);
});

const nl = (sentence) => sentence.replace(/[.?!]$/, "").split(" ").map((word) => [word, word.toLowerCase()]);
test("typing: a wrong verb form is wrong, not close", () => {
  const expected = "Morgen gaan we naar oma.";
  for (const typed of ["Morgen gaat we naar oma.", "Morgen ga we naar oma."]) {
    const result = match(expected, typed, { lang: "nl" });
    eq(typedRight(result), false);
    eq(wordOutcomes(nl(expected), result).gaan, "wrong");
    eq(orderOutcome(result), "right"); // the verb is still second: the order was right
  }
  eq(typedRight(match("Vandaag werkt mijn vader thuis.", "Vandaag werk mijn vader thuis.", { lang: "nl" })), false);
  eq(typedRight(match(expected, "Morgen gaan we naar oma", { lang: "nl" })), true);
});
test("an order slip is the pattern's, not the word's", () => {
  const expected = "Ik heb gisteren een boek gelezen.";
  const result = match(expected, "Ik heb gelezen gisteren een boek.", { lang: "nl" });
  eq(orderOutcome(result), "wrong");
  const words = wordOutcomes(nl(expected), result);
  eq([words.gelezen, words.gisteren], ["right", "right"]);
});
test("spoken: a recognizer's near miss counts as said; typed, it doesn't", () => {
  const expected = "Ik heb gisteren een boek gelezen.";
  const result = match(expected, "Ik heb gisteren een boek gelese.", { lang: "nl" });
  eq(result.words.at(-1).result, "close");
  eq(wordOutcomes(nl(expected), result, { spoken: true }).gelezen, "right");
  eq(wordOutcomes(nl(expected), result).gelezen, "wrong");
});
test("a word that appears twice is wrong if either is (bel … op)", () => {
  const words = [["Ik", "ik"], ["bel", "opbellen"], ["je", "je"], ["morgen", "morgen"], ["op", "opbellen"]];
  const result = match("Ik bel je morgen op.", "Ik bel je morgen.", { lang: "nl" });
  eq(wordOutcomes(words, result).opbellen, "wrong");
  eq(orderOutcome(result), "met"); // a word missing, nothing out of place: says nothing about the order
});
test("giving up: every word wrong", () => {
  eq(allWrong([["Ik", "ik"], ["heb", "hebben"], [".", null]]), { ik: "wrong", hebben: "wrong" });
  eq(orderOutcome(null), "wrong");
});

// What a wrong answer says about each pattern. Ga je vandaag naar kantoor? carries question and present.
const GA = ["question", "present"];
const GA_WORDS = ["Ga", "je", "vandaag", "naar", "kantoor?"];
const kindOf = (id) => conceptKind("nl", id);
test("what kind of mistake counts against a concept: Dutch's lists; another language, and a concept nobody listed, count as they always have", () => {
  eq(["present", "plural", "de-het", "object", "imperative"].map(kindOf), ["form", "form", "form", "form", "form"]);
  eq(["v2", "question", "niet", "dat", "omdat", "want", "time-place", "separable"].map(kindOf), Array(8).fill("order"));
  eq(["perfect", "relative", "omte", "modal", "future", "aan-het"].map(kindOf), Array(6).fill("both"));
  eq(conceptKind("de", "present"), "order");
  eq(kindOf("some-pack.own"), "order");
});
test("a concept that's really both: either kind of mistake can count against it", () => {
  const concepts = ["perfect", "present", "v2"];
  eq(patternOutcomes(concepts, "wrong", { kind: "order", at: null }, { kindOf }), { perfect: "wrong", present: "met", v2: "wrong" }, "Ik heb gewerkt gisteren");
  eq(patternOutcomes(concepts, "wrong", { kind: "form", at: null }, { kindOf }), { perfect: "wrong", present: "wrong", v2: "met" }, "Ik heb gisteren werken");
  eq(patternOutcomes(concepts, "right", { kind: "form", at: [3] }, { kindOf, marks: { perfect: [3] } }), { perfect: "wrong", present: "right", v2: "right" }, "typed, on the word its note is on");
});
test("what kind of slip: the same words in another order; other words in the same places; neither", () => {
  eq(slipBetween(GA_WORDS, ["je", "Ga", "vandaag", "naar", "kantoor?"]), { kind: "order", at: [0, 1] });
  eq(slipBetween(GA_WORDS, ["Gaat", "je", "vandaag", "naar", "kantoor?"]), { kind: "form", at: [0] });
  eq(slipBetween(GA_WORDS, GA_WORDS), null, "the same");
  eq(slipBetween(GA_WORDS, ["Ga", "je", "vandaag"]), null, "another length");
  eq(slipBetween(GA_WORDS, ["je", "Gaat", "vandaag", "naar", "kantoor?"]), null, "both at once: as it always was");
  eq(slipBetween(["Ik", "drink", "koffie."], ["ik", "koffie", "drink."]).kind, "order", "its capitals and end mark aside");
  eq(slipBetween([], []), null);
});
test("a word-order slip no longer marks present wrong: what's about the order is wrong, what's about a form says nothing", () => {
  const slip = slipBetween(GA_WORDS, ["je", "Ga", "vandaag", "naar", "kantoor?"]);
  eq(patternOutcomes(GA, "wrong", slip, { kindOf }), { question: "wrong", present: "met" }, "no notes");
  eq(patternOutcomes(GA, "wrong", slip, { kindOf, marks: { question: [0, 1], present: [0] } }), { question: "wrong", present: "met" }, "with notes, even with present on a word that moved");
});
test("a real form error still marks present wrong, and says nothing about the order", () => {
  const slip = slipBetween(["Ik", "drink", "koffie."], ["Ik", "drinkt", "koffie."]);
  eq(patternOutcomes(["v2", "present"], "wrong", slip, { kindOf }), { v2: "met", present: "wrong" }, "no notes");
  eq(patternOutcomes(["v2", "present"], "wrong", slip, { kindOf, marks: { present: [1], v2: [1] } }), { v2: "met", present: "wrong" }, "with notes on that word");
  eq(patternOutcomes(["v2", "present"], "wrong", { kind: "form", at: [2] }, { kindOf, marks: { present: [1] } }), { v2: "met", present: "met" }, "with notes on another word: a slip on koffie isn't present's");
});
test("with notes, a slip counts only against a concept on the words it touched; if that blames nothing about the order, all of them", () => {
  const concepts = ["v2", "niet", "present"];
  const marks = { v2: [1], niet: [3], present: [1] };
  eq(patternOutcomes(concepts, "wrong", { kind: "order", at: [3, 4] }, { kindOf, marks }), { v2: "met", niet: "wrong", present: "met" });
  eq(patternOutcomes(concepts, "wrong", { kind: "order", at: [0, 2] }, { kindOf, marks }), { v2: "wrong", niet: "wrong", present: "met" }, "nothing of theirs moved: something about the order was still wrong");
  eq(patternOutcomes(concepts, "wrong", { kind: "order", at: null }, { kindOf, marks }), { v2: "wrong", niet: "wrong", present: "met" }, "no positions to go on");
  eq(patternOutcomes(["present"], "wrong", { kind: "order", at: [0, 1] }, { kindOf }), { present: "met" }, "only form: nothing to blame");
});
test("nothing to go on: as it always was. Gave up, no slip, another language, a right answer", () => {
  eq(patternOutcomes(GA, "wrong", null, { kindOf }), { question: "wrong", present: "wrong" }, "I don't know");
  const german = (id) => conceptKind("de", id);
  eq(patternOutcomes(GA, "wrong", { kind: "order", at: [0] }, { kindOf: german }), { question: "wrong", present: "wrong" }, "no list for the language");
  eq(patternOutcomes(GA, "right", null, { kindOf }), { question: "right", present: "right" });
  eq(patternOutcomes(GA, "met", { kind: "order", at: [0] }, { kindOf }), { question: "met", present: "met" });
  eq(patternOutcomes([], "wrong", { kind: "order", at: [0] }, { kindOf }), {});
});
test("typed, with the real matcher: a word out of place is the order's; a wrong form with everything in place is right on the order, and with notes wrong on the form it missed", () => {
  const expected = "Ik drink koffie.";
  const moved = match(expected, "drink ik koffie");
  const movedSlip = slipOfResult(moved);
  eq(movedSlip.kind, "order");
  eq(patternOutcomes(["v2", "present"], orderOutcome(moved), movedSlip, { kindOf }), { v2: "wrong", present: "met" });
  const form = match(expected, "ik drinkt koffie");
  const formSlip = slipOfResult(form);
  eq(formSlip, { kind: "form", at: [1] });
  eq(orderOutcome(form), "right");
  eq(patternOutcomes(["v2", "present"], orderOutcome(form), formSlip, { kindOf, marks: { present: [1] } }), { v2: "right", present: "wrong" }, "with notes");
  eq(patternOutcomes(["v2", "present"], orderOutcome(form), formSlip, { kindOf }), { v2: "right", present: "right" }, "without notes it could be a misspelling: as it always was");
  // Said, a near miss counts as said: no form slip.
  eq(slipOfResult(form, { spoken: true }), null);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
