// Whether a sentence's English rewords it (public/js/study/reword.js), on real path-nl sentences and made-up edge cases:
// a different word ("like" for "graag") is a rewording, shown with the word-for-word line in English order and the note
// that says why; order, the little words English adds and contractions aren't. Pure: `node scripts/test-reword.mjs`
// (exit 0 = pass). The games draw it (session.js, after-answer.js); this holds the rule.

// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { englishWords, rewordingOf, wordForWord } from "../public/js/study/reword.js";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = JSON.parse(readFileSync(join(APP, "packs/path-nl.json"), "utf8"));
const item = (id) => {
  const found = path.items.find((one) => one.id === id);
  if (!found) throw new Error(`path-nl has no ${id}`);
  return found;
};

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    const note = fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
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

test("a different word is a rewording: Ik drink graag koffie = I like drinking coffee, word for word I gladly drink coffee", () => {
  const graag = item("l002-1");
  const notes = { words: [null, { why: "With ik, drinken becomes drink." }, { why: "Graag says you enjoy it.", differs: "English puts like before drinking" }, null] };
  const said = rewordingOf(graag, notes);
  ok(said, "not seen as reworded");
  eq(said.line.map(([text]) => text).join(" "), "I gladly drink coffee", "the line, in English order");
  eq(said.changed, { means: ["like"], literal: ["gladly"] }, "what changed");
  eq(said.note, "English puts like before drinking.", "the note: the differs one, never the why");
  eq(said.line[1], ["gladly", true], "a moved chunk stays marked");
});

test("order alone isn't one (the Dutch order hint has that), nor the little words English adds, nor a contraction", () => {
  eq(rewordingOf(item("l002-4")), null, "Hallo, een koffie, graag. = Hello, a coffee, please.");
  eq(rewordingOf(item("l035-3")), null, "I'm not calling … = I am not calling …");
  eq(rewordingOf(item("l080-2")), null, "I'll send you … = I send you …");
  const live = { means: "Do you live here?", literal: [["Live"], ["you"], ["here"]], english: [1, 0, 2] };
  eq(rewordingOf(live), null, "Do you live here? from Live you here");
});

test("a verb's ending isn't one, a different verb is", () => {
  eq(rewordingOf({ means: "I like eating.", literal: [["I"], ["like"], ["eat"]], english: [0, 1, 2] }), null, "eating ~ eat");
  const had = rewordingOf(item("l071-8"));
  ok(had && had.changed.means.includes("had") && had.changed.literal.includes("drunk"), `had for drunk: ${JSON.stringify(had?.changed)}`);
});

test("no word-for-word line, or no English: nothing to say; English with no order of its own: the sentence's order", () => {
  eq(rewordingOf({ means: "Yes." }), null);
  eq(rewordingOf({ literal: [["yes"]] }), null);
  eq(wordForWord({ literal: [["a"], ["b"]], english: null }).map(([t]) => t), ["a", "b"]);
  eq(wordForWord({ literal: [["a"], ["b"]], english: [1, 0] }).map(([t]) => t), ["b", "a"]);
});

test("no notes, or none that say how English differs: no note, still reworded", () => {
  const graag = item("l002-1");
  eq(rewordingOf(graag)?.note, null);
  eq(rewordingOf(graag, { words: [{ why: "only a why" }] })?.note, null);
});

test("words are compared without case, curly quotes, punctuation or bracketed asides", () => {
  eq(englishWords("I’m (formal) here, “really”!"), ["i", "am", "here", "really"]);
});

test("on the whole path, a share, not every card: the reworded ones are a minority, and a control rewording one more is counted", () => {
  const reworded = path.items.filter((one) => rewordingOf(one)).length;
  const sentences = path.items.filter((one) => one.literal).length;
  ok(reworded > 0.2 * sentences && reworded < 0.6 * sentences, `${reworded} of ${sentences}`);
  // The control: a sentence that isn't reworded becomes one when its English uses another word.
  const plain = path.items.find((one) => one.literal && !rewordingOf(one));
  ok(rewordingOf({ ...plain, means: `${plain.means.replace(/[.!?]$/, "")} indeed.` }), "an added word isn't caught");
  return `${reworded} of ${sentences} sentences`;
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
