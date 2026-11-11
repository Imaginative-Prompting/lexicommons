// An item's shapes (public/js/study/shape-marks.js): the stored form checked mark by mark (a bad one dropped with a warning, never the item),
// character spans on grapheme edges (Arabic harakat, Devanagari matras stay with their letters), your AI's form placed by words as written
// and letters and given back the same way, respelled words losing the marks on their letters, aliased concepts. Through the pack format
// too (checkPack, storedItem, authoringItem, editItem). In Node: `node scripts/test-shape-marks.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { checkShapes, renameShapes, respelledShapes, shapesFromAuthoring, shapesToAuthoring } from "../public/js/study/shape-marks.js";

let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n").join("\n     ")}`);
  }
};
// pack-format.js's reporter, as checkShapes uses it.
const reporter = () => {
  const r = { errors: [], warnings: [] };
  r.warn = (at, message) => r.warnings.push({ at, message });
  r.error = (at, message) => r.errors.push({ at, message });
  r.text = (value, at, max, { required = false } = {}) => {
    if (value === undefined || value === null || value === "") return void (required && r.error(at, `${at} is missing.`));
    if (typeof value !== "string") return void r.error(at, `${at} must be text.`);
    const out = value.trim();
    if (out.length > max) return void r.error(at, `${at} is too long.`);
    return out;
  };
  return r;
};
const run = (shapes, words, concepts = ["present"]) => {
  const r = reporter();
  const out = checkShapes(shapes, { at: "items[0].shapes", name: "items[0]", words, concepts, r });
  return { out, warnings: r.warnings.map((w) => w.message), errors: r.errors };
};
const NL = ["Mijn", "moeder", "drinkt", "graag", "koffie"];

check("a whole set of good marks is kept as given (spans sorted, lit words in order)", () => {
  const shapes = { present: [
    { shape: "lit", words: [2, 1] },
    { shape: "affix", word: 2, chars: [[5, 6]] },
    { shape: "link", from: 1, to: 2, toChars: [5, 6], note: "The -t is for her." },
    { shape: "frame", from: 0, to: 2 },
    { shape: "box", from: 0, to: 1 },
    { shape: "places", parts: [[0, 1], [2, 2], [3, 4]], mark: 1, place: "second" },
    { shape: "tag", word: 3, text: "how" },
  ] };
  const { out, warnings, errors } = run(shapes, NL);
  assert.deepEqual(warnings, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(out.present[0], { shape: "lit", words: [1, 2] });
  assert.equal(out.present.length, 7);
});
check("each bad mark is dropped with a warning, the item never: shapes, spans, words, sizes", () => {
  const bad = [
    { shape: "circle", words: [0] },
    { shape: "lit", words: [9] },
    { shape: "frame", from: 2, to: 2 },
    { shape: "link", from: 1, to: 1 },
    { shape: "affix", word: 2, chars: [[6, 5]] },
    { shape: "affix", word: 2, chars: [[0, 3], [2, 4]] },
    { shape: "affix", word: 2, chars: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    { shape: "box", from: 0, to: 4 },
    { shape: "places", parts: [[0, 2], [1, 3]], mark: 0 },
    { shape: "places", parts: [[0, 1], [2, 4]], mark: 2 },
    { shape: "tag", word: 1, text: "a label far too long to fit" },
  ];
  // Eight at a time (only a concept's first 8 marks are read).
  for (const part of [bad.slice(0, 8), bad.slice(8)]) {
    const { out, warnings, errors } = run({ present: part }, NL);
    assert.deepEqual(errors, [], "never an error: a mark is the mark's problem");
    assert.equal(warnings.length, part.length, warnings.join("\n"));
    assert.equal(out, undefined);
  }
  const many = run({ present: [...Array(9)].map(() => ({ shape: "lit", words: [2] })) }, NL);
  assert.equal(many.out.present.length, 8);
  assert.match(many.warnings[0], /first 8 are kept/);
  const some = run({ present: [{ shape: "frame", from: 2, to: 2 }, { shape: "lit", words: [2] }] }, NL);
  assert.deepEqual(some.out, { present: [{ shape: "lit", words: [2] }] });
});
check("an unknown key inside a mark is dropped and the mark kept; an unknown place drops just place; a long note drops just the note", () => {
  const { out, warnings } = run({ present: [{ shape: "lit", words: [2], colour: "red" }, { shape: "places", parts: [[0, 1], [2, 2]], mark: 1, place: "third" }, { shape: "lit", words: [1], note: "x".repeat(81) }] }, NL);
  assert.deepEqual(out.present, [{ shape: "lit", words: [2] }, { shape: "places", parts: [[0, 1], [2, 2]], mark: 1 }, { shape: "lit", words: [1] }]);
  assert.equal(warnings.length, 3);
});
check("keys: the item's own concepts only, p: taken off; none without the sentence's words", () => {
  assert.deepEqual(run({ "p:present": [{ shape: "lit", words: [2] }] }, NL).out, { present: [{ shape: "lit", words: [2] }] });
  const other = run({ perfect: [{ shape: "lit", words: [2] }] }, NL);
  assert.equal(other.out, undefined);
  assert.match(other.warnings[0], /isn't one of the item's concepts/);
  assert.equal(run({ present: [{ shape: "lit", words: [0] }] }, []).out, undefined);
});
check("character edges on grapheme boundaries: an Arabic haraka and a Devanagari matra stay with their letters", () => {
  // كَتَبَ: ك + fatha (2 code units), a span ending between them cuts the letter from its vowel.
  const ar = ["كَتَبَ"];
  assert.equal(run({ present: [{ shape: "affix", word: 0, chars: [[0, 1]] }] }, ar).out, undefined);
  assert.deepEqual(run({ present: [{ shape: "affix", word: 0, chars: [[0, 2]] }] }, ar).out, { present: [{ shape: "affix", word: 0, chars: [[0, 2]] }] });
  // किताब: कि is क + ि.
  const hi = ["किताब"];
  assert.equal(run({ present: [{ shape: "affix", word: 0, chars: [[0, 1]] }] }, hi).out, undefined);
  assert.ok(run({ present: [{ shape: "affix", word: 0, chars: [[0, 2]] }] }, hi).out);
});
check("aliases: a pack's own pattern renamed to the catalog's, as the view renames concepts", () => {
  assert.deepEqual(renameShapes({ "mine.present": [{ shape: "lit", words: [1] }] }, { "mine.present": "present" }), { present: [{ shape: "lit", words: [1] }] });
});

// Your AI's form.
const ES = ["Yo", "hablo", "español."];
check("your AI's form: words named as written (punctuation optional), letters found in the word", () => {
  const { shapes, problems } = shapesFromAuthoring({ present: [{ shape: "affix", word: "hablo", letters: ["o"] }, { shape: "link", from: "yo", to: "hablo", toLetters: "o" }, { shape: "lit", words: ["español"] }] }, ES);
  assert.deepEqual(problems, []);
  assert.deepEqual(shapes.present, [{ shape: "affix", word: 1, chars: [[4, 5]] }, { shape: "link", from: 0, to: 1, toChars: [4, 5] }, { shape: "lit", words: [2] }]);
});
check("letters in order: ي then ون in يكتبون; one that's there twice in what's left asks for chars (staat's t)", () => {
  assert.deepEqual(shapesFromAuthoring({ present: [{ shape: "affix", word: "يكتبون", letters: ["ي", "ون"] }] }, ["هم", "يكتبون"]).shapes.present, [{ shape: "affix", word: 1, chars: [[0, 1], [4, 6]] }]);
  const { problems } = shapesFromAuthoring({ present: [{ shape: "affix", word: "staat", letters: ["t"] }] }, ["Hij", "staat"]);
  assert.match(problems[0].message, /more than once.*chars/);
  assert.deepEqual(shapesFromAuthoring({ present: [{ shape: "affix", word: "staat", chars: [[4, 5]] }] }, ["Hij", "staat"]).shapes.present, [{ shape: "affix", word: 1, chars: [[4, 5]] }]);
});
check("a word written twice needs { word, at }; at must name it", () => {
  const words = ["De", "kat", "en", "de", "hond"];
  assert.match(shapesFromAuthoring({ "de-het": [{ shape: "box", from: "de", to: "hond" }] }, words).problems[0].message, /2 times/);
  assert.deepEqual(shapesFromAuthoring({ "de-het": [{ shape: "box", from: { word: "de", at: 3 }, to: "hond" }] }, words).shapes["de-het"], [{ shape: "box", from: 3, to: 4 }]);
  assert.match(shapesFromAuthoring({ "de-het": [{ shape: "box", from: { word: "de", at: 2 }, to: "hond" }] }, words).problems[0].message, /isn't word 2/);
});
check("and back: words as written, { word, at } for a repeat, letters where they'd come back the same, chars where not", () => {
  const words = ["De", "kat", "staat", "en", "de", "hond", "staat"];
  const stored = { present: [{ shape: "affix", word: 2, chars: [[4, 5]] }, { shape: "box", from: 4, to: 5 }, { shape: "affix", word: 1, chars: [[0, 1]] }] };
  const authored = shapesToAuthoring(stored, words);
  assert.deepEqual(authored.present, [
    { shape: "affix", word: { word: "staat", at: 2 }, chars: [[4, 5]] },
    { shape: "box", from: { word: "de", at: 4 }, to: "hond" },
    { shape: "affix", word: "kat", letters: ["k"] },
  ]);
  assert.deepEqual(shapesFromAuthoring(authored, words).shapes, stored, "the round trip comes back the same");
});
check("a respelling drops the marks on a respelled word's letters, and keeps the rest", () => {
  const shapes = { present: [{ shape: "affix", word: 2, chars: [[5, 6]] }, { shape: "link", from: 1, to: 2, toChars: [5, 6] }, { shape: "lit", words: [2] }] };
  const after = respelledShapes(shapes, NL, ["Mijn", "moeder", "drinkd", "graag", "koffie"]);
  assert.deepEqual(after.present, [{ shape: "link", from: 1, to: 2 }, { shape: "lit", words: [2] }]);
});

// Through the pack format: your AI's item in, the stored item out and back, edits.
const { storedItem, authoringItem, editItem } = await import("../public/js/study/pack-authoring.js");
const AUTHORED = {
  sentence: "Ik heb gisteren een boek gelezen.",
  lemmas: { gisteren: "gisteren", boek: "boek", gelezen: "lezen" },
  literal: ["I have", "*yesterday*", "a book", "*read*"],
  english: [0, 3, 2, 1],
  moved: ["gisteren", "gelezen"],
  natural: "I read a book yesterday.",
  wrong: ["Ik heb gelezen gisteren een boek."],
  gap: { word: "gelezen", options: ["gelezen", "lezen", "leest"] },
  patterns: ["perfect"],
  shapes: { perfect: [{ shape: "frame", from: "heb", to: "gelezen" }, { shape: "affix", word: "gelezen", letters: ["ge", "en"] }] },
};
check("your AI's item: shapes placed into the stored item, and given back in words the same way (a round trip changes nothing)", () => {
  const { item, problems, warnings } = storedItem(AUTHORED, { language: "nl" });
  assert.deepEqual([problems, warnings], [[], []]);
  assert.deepEqual(item.shapes, { perfect: [{ shape: "frame", from: 1, to: 5 }, { shape: "affix", word: 5, chars: [[0, 2], [5, 7]] }] });
  const back = authoringItem(item, "nl");
  assert.deepEqual(back.shapes, AUTHORED.shapes);
  assert.deepEqual(storedItem(back, { language: "nl" }).item.shapes, item.shapes);
});
check("a shape your AI's item can't place is a warning, never a problem: the sentence is kept", () => {
  const { item, problems, warnings } = storedItem({ ...AUTHORED, shapes: { perfect: [{ shape: "frame", from: "heb", to: "gelopen" }] } }, { language: "nl" });
  assert.deepEqual(problems, []);
  assert.ok(item);
  assert.match(warnings[0].message, /gelopen.*isn't one of the sentence's words/);
  assert.equal(item.shapes, undefined);
});
check("an edit: a rewrite drops the shapes; a respelling drops only the marks on the respelled word's letters", () => {
  const { item } = storedItem(AUTHORED, { language: "nl" });
  const rewritten = editItem(item, { text: "Wij gaan morgen naar de markt." }, "nl");
  assert.equal(rewritten.item.shapes, undefined);
  const respelled = editItem(item, { text: "Ik heb gisteren een boek gelesen." }, "nl");
  assert.deepEqual(respelled.item.shapes, { perfect: [{ shape: "frame", from: 1, to: 5 }] });
});

{
  const { readFileSync } = await import("node:fs");
  const guide = readFileSync(new URL("../src/pack-guide.ts", import.meta.url), "utf8");
  const section = guide.slice(guide.indexOf("## Shapes"), guide.indexOf("## ", guide.indexOf("## Shapes") + 3));
  // Each { "shape": … } in the section, its braces balanced (a mark holds lists and strings, never a brace in a string here).
  const examples = [];
  for (let at = section.indexOf('{ "shape"'); at >= 0; at = section.indexOf('{ "shape"', at + 1)) {
    let depth = 0;
    for (let i = at; i < section.length; i++) {
      if (section[i] === "{") depth++;
      else if (section[i] === "}" && --depth === 0) {
        examples.push(section.slice(at, i + 1));
        break;
      }
    }
  }
  const SENTENCES = [
    ["Yo", "hablo", "español"],
    ["Ik", "heb", "gisteren", "een", "boek", "gelezen"],
    ["هم", "يكتبون"],
    ["La", "casa", "es", "grande"],
    ["Op", "de", "bank", "ligt", "een", "boek"],
    ["私", "は", "学生", "です"],
  ];
  check(`the pack guide's ${examples.length} mark examples each place without a problem`, () => {
    assert.ok(examples.length >= 7, `found only ${examples.length} examples in the guide's Shapes section`);
    for (const text of examples) {
      const mark = JSON.parse(text);
      const placed = SENTENCES.some((words) => {
        const { shapes, problems } = shapesFromAuthoring({ x: [mark] }, words);
        return !problems.length && shapes?.x?.length === 1;
      });
      assert.ok(placed, `no example sentence takes ${text}`);
    }
  });
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
