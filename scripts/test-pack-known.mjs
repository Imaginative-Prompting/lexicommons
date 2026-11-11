// How much of a pack you know, for Explore's bar (study/pack-known.js, study/pack-words.js), in Node: a pack's own words (a category pack's gap
// words; a pack with lessons, its lessons' words; none for one with neither), counted known by know/summary.js understood (a word in your word
// bank here), and null where there's nothing to count. Each with a control. (exit 0 = pass)
// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { packKnown } from "../public/js/study/pack-known.js";
import { packWords, writtenForWords } from "../public/js/study/pack-words.js";
import { addWord } from "../public/js/read/bank.js";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(readFileSync(join(APP, "packs", name), "utf8"));
let failed = 0;
let passed = 0;
const test = (name, fn) => {
  try {
    const note = fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
};
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
const weather = read("nl-weather-1.json");
const gaps = [...new Set(weather.items.filter((item) => item.gap).map((item) => item.words[item.gap.index][1]))];

test("a category pack's own words are the words its gaps name, each once, in its order", () => {
  ok(writtenForWords(weather), "not written for its words");
  ok(JSON.stringify(packWords(weather)) === JSON.stringify(gaps), `${packWords(weather).length} words, not its ${gaps.length} gap words`);
  return `${gaps.length} words, from ${gaps.slice(0, 3).join(", ")}`;
});
test("a pack with lessons counts the words its lessons teach; one with neither has none", () => {
  const path = read("path-nl.json");
  ok(!writtenForWords(path), "the lessons are taken for a word pack");
  const taught = new Set(path.lessons.flatMap((lesson) => (lesson.words ?? []).map((word) => word.lemma)));
  ok(packWords(path).length === taught.size, `${packWords(path).length} of ${taught.size}`);
  const bare = { ...weather, items: weather.items.map(({ gap, ...item }) => item) };
  ok(packWords(bare).length === 0 && packKnown(bare) === null, "a pack with no gaps and no lessons counted");
  return `path-nl ${taught.size}`;
});
test("known: none on a fresh device, then the ones you understand (a word in your word bank), never more than the pack's own", () => {
  const fresh = packKnown(weather);
  ok(fresh && fresh.known === 0 && fresh.total === gaps.length, `fresh: ${JSON.stringify(fresh)}`);
  for (const lemma of gaps.slice(0, 5)) addWord("nl", lemma, { quiet: true });
  addWord("nl", "fietsen-not-in-the-pack", { quiet: true });
  const after = packKnown(weather);
  ok(after.known === 5 && after.total === gaps.length, `after 5 of its words and one other: ${JSON.stringify(after)}`);
  ok(packKnown("no-such-pack") === null, "an id not on the device");
  return `${after.known} of ${after.total}`;
});
console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
