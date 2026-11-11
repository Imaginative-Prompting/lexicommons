// Russian's stress marks (lang/ru.js readings "vowels", lang/readings.js): a word of two syllables or more may carry itself with an acute
// after its stressed vowel (молоко́), shown in its place until the word is known, as Latin's long vowels are. The check takes one mark after
// a vowel and refuses every other way (none, two, on a consonant, on a word with ё or of one syllable, other letters, another mark); the
// pack's check keeps a sentence's word readings and its own { lemma: reading }; the word shows its marks in place, never over it; typing
// and what's said never need them (ё typed as е is right, forgiving). Latin's and Arabic's readings unchanged, as controls.
//   node scripts/test-russian-stress.mjs [<app dir>]   another copy's dir to see it fail on one from before (exit 0 = pass)
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.argv[2] ? resolve(process.argv[2]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);
await from("scripts/fixtures/library-grammar.mjs");
const readings = await from("public/js/lang/readings.js");
const { checkPack } = await from("public/js/study/pack-format.js");
const { savePack } = await from("public/js/study/packs.js");
const { setLearning } = await from("public/js/study/learning.js");
const content = await from("public/js/study/content.js");
const { typedResult } = await from("public/js/study/typed.js");
const { typedRight } = await from("public/js/study/attribute.js");

let failed = 0;
async function test(name, fn) {
  try {
    const said = await fn();
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(error.message ?? error).split("\n").join("\n      ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

await test("the check: the word exactly with one stress mark after its stressed vowel is right (й kept); none, two, on a consonant, on a word with ё or of one syllable, other letters or other marks refused", () => {
  const ok = (word, reading) => assert(readings.readingProblem("ru", word, reading) === null, `${word} / ${reading}: ${readings.readingProblem("ru", word, reading)}`);
  const no = (word, reading, why) => {
    const problem = readings.readingProblem("ru", word, reading);
    assert(problem && why.test(problem), `${word} / ${reading} should be refused (${why}): ${problem}`);
  };
  ok("молоко", "молоко́");
  ok("Москва", "Москва́");
  ok("хорошо,", "хорошо́");
  ok("Где", undefined);
  no("молоко", "молоко", /no stress mark/);
  no("молоко", "мо́локо́", /2 stress marks/);
  no("молоко", "молоќо", /isn't after a vowel/);
  no("ещё", "ещё́", /ё, which is always stressed/);
  no("дом", "до́м", /one syllable/);
  no("молоко", "малоко́", /isn't "молоко" with a stress mark/);
  no("молоко", "молоко̀", /other marks differ/);
  // й is и with a breve once decomposed: kept as the word has it, never taken for a reading's mark, never dropped.
  ok("мойка", "мо́йка");
  ok("Чайка", "Ча́йка");
  no("мойка", "мойка", /no stress mark/);
  no("мойка", "мо́ика", /other marks differ/);
  no("мойка", "мой́ка", /isn't after a vowel/);
  // Latin letters that look like Cyrillic ones (a Latin o in молоко) named as such.
  no("молоко", "мoлоко́", /letters that look alike|isn't "молоко" with a stress mark/);
  assert(readings.readingKind("ru") === "vowels" && !readings.needsReading("ru", "молоко") && readings.mayRead("ru", "молоко"), "Russian's readings aren't optional vowels");
});

await test("controls: Latin's long vowels and Arabic's vowel marks checked as before", () => {
  assert(readings.readingProblem("la", "bibo", "bibō") === null, "bibō refused");
  assert(/no macron/.test(readings.readingProblem("la", "puella", "puella") ?? ""), "puella's reading without a macron taken");
  assert(readings.readingProblem("ar", "كتب", "كَتَبَ") === null, "كَتَبَ refused");
  assert(readings.readingProblem("ar", "كتب", "كتب") !== null, "an Arabic reading without marks taken");
});

await test("shown on the word itself, never over it: the marked form in the word's place, its punctuation kept", () => {
  assert(readings.vowelled("ru", "молоко,", "молоко́") === "молоко́,", readings.vowelled("ru", "молоко,", "молоко́"));
  assert(JSON.stringify(readings.rubyOf("ru", "молоко", "молоко́")) === JSON.stringify([["молоко", null]]), "a ruby over a Russian word");
  assert(!readings.readingOver("ru"), "Russian's readings sit over the word");
});

// A small Russian pack: a sentence whose words carry their stress, and the pack's own { lemma: reading }.
const PACK = {
  format: "lexicommons-pack",
  version: 2,
  id: "check-ru-stress",
  name: "Stress check",
  language: "ru",
  from: "en",
  topics: { food: "Food" },
  words: { молоко: "milk", пить: "to drink", я: "I" },
  readings: { молоко: "молоко́" },
  chunks: {},
  patterns: {},
  items: [
    {
      id: "ya-pyu-moloko",
      topic: "food",
      concepts: ["present"],
      text: "Я пью молоко.",
      means: "I drink milk.",
      words: [["Я", "я"], ["пью", "пить"], ["молоко", "молоко", "молоко́"]],
      punct: ".",
      literal: [["I"], ["drink"], ["milk"]],
      english: [0, 1, 2],
      moved: [],
      wrong: ["Я пьёт молоко."],
      gap: { index: 2, options: ["молоко", "вода"] },
    },
    {
      id: "eshche-moloko",
      topic: "food",
      concepts: ["present"],
      text: "Ещё молоко.",
      means: "More milk.",
      words: [["Ещё", "ещё"], ["молоко", "молоко", "молоко́"]],
      punct: ".",
      literal: [["More"], ["milk"]],
      english: [0, 1],
      moved: [],
      wrong: ["Ещё молока."],
      gap: { index: 1, options: ["молоко", "молока"] },
    },
  ],
};

await test("the pack's check keeps a Russian word's stress and the pack's own { lemma: reading }, and refuses a wrong one", () => {
  const kept = checkPack(structuredClone(PACK), { installed: [] });
  assert(kept.pack, `refused: ${JSON.stringify(kept.errors.slice(0, 2))}`);
  assert(kept.pack.items[0].words[2][2] === "молоко́", `the word's reading: ${JSON.stringify(kept.pack.items[0].words[2])}`);
  assert(kept.pack.readings?.молоко === "молоко́", `the pack's readings: ${JSON.stringify(kept.pack.readings)}`);
  const wrong = structuredClone(PACK);
  wrong.items[0].words[2][2] = "мо́локо́";
  const refused = checkPack(wrong, { installed: [] });
  assert(!refused.pack && refused.errors.some((e) => /stress/.test(e.message)), `two marks taken: ${JSON.stringify(refused.errors.slice(0, 1))}`);
  const plain = checkPack(JSON.parse(readFileSync(join(APP, "packs/starter-ru.json"), "utf8")), { installed: [] });
  assert(plain.pack && !plain.warnings.some((w) => /reading/i.test(w.message)), `the starter, which has no stress marks, warned: ${JSON.stringify(plain.warnings.slice(0, 2))}`);
});

await test("typing and saying never need the stress: typed without it right, ё typed as е right (forgiving)", async () => {
  const saved = await savePack(structuredClone(PACK));
  assert(saved.ok, `not saved: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
  setLearning("ru");
  await new Promise((done) => setTimeout(done, 20));
  const one = content.ITEMS.find((it) => it.id.endsWith("/ya-pyu-moloko"));
  const two = content.ITEMS.find((it) => it.id.endsWith("/eshche-moloko"));
  assert(one && two, "the sentences aren't on the device");
  assert(typedRight(typedResult(one, "Я пью молоко.", true)), "typed without the stress, wrong");
  assert(typedRight(typedResult(one, "Я пью молоко.", false)), "typed without the stress, strict, wrong");
  assert(typedRight(typedResult(two, "Еще молоко.", true)), "ё typed as е, forgiving, wrong");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
