// What does it say?'s stray English tiles (study/lesson.js strayEnglish, through translateStep) never offer a word of the language being
// learned: a lesson word's English is read only as its shown meaning has it, the side after " = " and nothing after a colon (French's
// "d'eau = water" once offered "d'eau" as an English tile; a note like "a lot: molto with an il word" would offer "molto"). On every path
// pack here, each lesson word alone in the picker's pool, its strays drawn under many seeds: none is a word of the pack's sentences that
// isn't also English (English being every path pack's sentences' English); a planted note after a colon caught first.
//   node scripts/test-stray-english.mjs [<app dir>]   another copy's dir to see it fail on one from before (exit 0 = pass)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.argv[2] ? resolve(process.argv[2]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);
await from("scripts/fixtures/library-grammar.mjs");
await from("public/js/study/plan.js");
const { translateStep, shownThing, englishTiles } = await from("public/js/study/lesson.js");

let failed = 0;
const test = (name, fn) => {
  try {
    const detail = fn();
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
};
const bare = (word) => String(word).toLocaleLowerCase().replace(/^[^\p{L}]+|[^\p{L}']+$/gu, "");
const packs = readdirSync(join(APP, "packs")).filter((name) => /^path-[a-z-]+\.json$/.test(name)).sort().map((name) => JSON.parse(readFileSync(join(APP, "packs", name), "utf8")));
// English: every word of every path pack's sentences' English, and of its lesson words' glosses' English side (after " = ", before any
// colon, brackets out: "the dollar" makes dollar English, "d'eau = water" only water).
const glossEnglish = (means) => String(means ?? "").replace(/\s*\([^)]*\)/g, "").split(";").map((sense) => sense.split(" = ").at(-1).split(":")[0]).join(" ");
const ENGLISH = new Set(packs.flatMap((pack) => [
  ...pack.items.flatMap((item) => englishTiles(item.translation ?? item.means ?? "").map(bare)),
  ...(pack.lessons ?? []).flatMap((lesson) => (lesson.words ?? []).flatMap((thing) => englishTiles(glossEnglish(thing.means)).map(bare))),
]));
// A lesson word's strays: the word alone in the pool, a sentence whose English shares none of its words, under 60 seeds.
const QUESTION = "ox fy gu hv.";
function straysOf(thing) {
  const entry = { key: thing.lemma ?? thing.phrase, thing, own: true, ...shownThing({ ...thing, text: thing.forms?.[0] ?? thing.text ?? thing.lemma }) };
  const out = new Set();
  for (let n = 0; n < 60; n++) {
    const step = translateStep({ id: `stray-check/${n}`, means: QUESTION, words: [], literal: [] }, [], [entry]);
    for (const tile of step.tiles) if (!englishTiles(QUESTION).includes(tile)) out.add(tile);
  }
  return out;
}

test("a planted lesson word whose meaning has a note after a colon: its note's words never offered", () => {
  const strays = straysOf({ lemma: "zqword", forms: ["zqword"], means: "zqword = water: zqform with an zqarticle word" });
  if ([...strays].some((tile) => /^zq/.test(tile))) throw new Error(`offered: ${[...strays].join(", ")}`);
  if (!strays.has("water")) throw new Error(`its English not offered: ${[...strays].join(", ")}`);
});

for (const pack of packs) {
  test(`${pack.id}: no lesson word's stray tile is a word of the pack's sentences that isn't English`, () => {
    const target = new Set(pack.items.flatMap((item) => item.words.map(([text]) => bare(text))));
    const leaks = [];
    let things = 0;
    for (const lesson of pack.lessons ?? []) {
      for (const thing of lesson.words ?? []) {
        things++;
        for (const tile of straysOf(thing)) if (target.has(bare(tile)) && !ENGLISH.has(bare(tile))) leaks.push(`${lesson.id} ${thing.lemma}: "${tile}"`);
      }
    }
    if (leaks.length) throw new Error(`${leaks.length} offered: ${leaks.slice(0, 6).join("; ")}`);
    return `${things} lesson words`;
  });
}

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
