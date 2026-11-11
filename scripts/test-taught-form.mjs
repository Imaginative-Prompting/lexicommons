// The form a lesson teaches a word in (study/path.js taughtForm): what Which word is it?, Match's tile, a lesson's Right line and
// Explore's lesson list show for the word. It's the word's line's "x = y" x, with the line's working notes taken out first, as
// lesson.js shownThing takes them out: a note may hold an example with its own " = " ("like to (after the verb: trinke gern = like to
// drink)"), and that once showed "like to (after the verb: trinke gern" as a German tile and "regret (ik heb spijt" in Dutch.
// Then every path pack here: each lesson word's taught form made of its own forms, never a gloss.
//   node scripts/test-taught-form.mjs [<app dir>]   another copy's dir to see it fail on one from before (exit 0 = pass)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.argv[2] ? resolve(process.argv[2]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);
await from("scripts/fixtures/library-grammar.mjs");
const { taughtForm } = await from("public/js/study/path.js");

let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
};
const eq = (got, want, what) => {
  if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

test("a note's own example never makes the form: gern, zu and spijt show as themselves", () => {
  eq(taughtForm({ text: "gern", forms: ["gern"], means: "like to (after the verb: trinke gern = like to drink)" }), "gern", "gern");
  eq(taughtForm({ text: "zu", forms: ["zu"], means: "too (zu viel = too much)" }), "zu", "zu");
  eq(taughtForm({ text: "spijt", forms: ["spijt"], means: "regret (ik heb spijt = I'm sorry I did it)" }), "spijt", "spijt");
});

test("the line's own x = y is still the form, a note after it or not (the controls)", () => {
  eq(taughtForm({ text: "trinken", forms: ["trinke"], means: "trinke = drink (with ich)" }), "trinke", "trinke");
  eq(taughtForm({ text: "der", forms: ["das"], means: "das = the (with a das word); that" }), "das", "das");
  eq(taughtForm({ text: "willen", forms: ["wil", "wilt", "willen"], means: "wil = want (ik, hij); wilt = want (je, after the verb it's wil je); willen = want (we, they)" }), "wil", "wil");
  eq(taughtForm({ text: "jij", forms: ["je", "jij"], means: "you (je is the everyday one; jij when it matters who)" }), "jij", "jij");
  eq(taughtForm({ text: "pas", forms: ["ne", "pas"], means: "ne … pas = not" }), "ne … pas", "ne … pas");
});

// Every path pack here: a lesson word's taught form has no note in it (no bracket, no colon: "of: le livre de ma mère" was French's de)
// and holds the word itself, alone or in its set phrase (tener que, in orde, mooi/mooie, du, de l').
const bare = (text) => text.normalize("NFC").replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, "").toLocaleLowerCase();
const packs = readdirSync(join(APP, "packs")).filter((name) => /^path-[a-z]+\.json$/.test(name));
test(`every lesson word of ${packs.join(", ")} taught as its own form`, () => {
  if (!packs.length) throw new Error("no path packs");
  const wrong = [];
  let words = 0;
  for (const name of packs) {
    const pack = JSON.parse(readFileSync(join(APP, "packs", name), "utf8"));
    for (const lesson of pack.lessons ?? [])
      for (const word of lesson.words ?? []) {
        words++;
        const form = taughtForm({ text: word.lemma, forms: word.forms, means: word.means });
        const own = new Set([word.lemma, ...(word.forms ?? [])].map(bare));
        const parts = form.split(/[\s/,]+/).map(bare).filter(Boolean);
        if (/[():]/.test(form) || !parts.some((part) => own.has(part))) wrong.push(`${name} ${lesson.id} ${word.lemma}: "${form}"`);
      }
  }
  if (wrong.length) throw new Error(`${wrong.length} of ${words}: ${wrong.slice(0, 6).join("; ")}`);
});

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
