// Match never pairs a word with itself, and never shows two tiles with the same English (8 Nov 2026) (the director, 7 Nov 2026, from a newcomer's film: "water" beside "water" tests nothing and confuses
// which side is which): a word spelled the same in both languages, case and accents aside (lesson 1's water), is left out of every round
// (study/new-words.js spelledAlike: lesson.js's round, Practice's and the word games' in plan.js, a deck's in deck.js) and is asked by another
// game instead. On path-nl's lesson 1 and a week of Practice after it, in Node. Usage:
//   node scripts/test-match-pairs.mjs --list <frequency.nl.json> [<app dir>]   (exit 0 = pass; 2 = no list given)
// <app dir>: another copy's modules on these packs, to see it fail on one from before.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const listAt = process.argv.indexOf("--list");
if (listAt < 0) {
  console.error("Usage: node scripts/test-match-pairs.mjs --list <frequency.nl.json> [<app dir>]");
  process.exit(2);
}
const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const other = process.argv.slice(2).filter((arg, i, all) => arg !== "--list" && all[i - 1] !== "--list");
const APP = other[0] ? resolve(other[0]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);

await from("scripts/fixtures/library-grammar.mjs");
const { record } = await from("public/js/study/progress.js");
const { planSession } = await from("public/js/study/plan.js");
// The module itself, for what it reassigns as packs come in (CHUNKS, WORDS): a name taken out of it at import keeps the empty first value.
const content = await from("public/js/study/content.js");
const { sentenceUnits, WORDS } = content;
const { savePack } = await from("public/js/study/packs.js");
const { useFrequency } = await from("public/js/study/frequency.js");
const { lemmasOf, shortMeaning } = await from("public/js/study/new-words.js");
const { pathLessons, taughtForm } = await from("public/js/study/path.js");
const { finishedLesson, finishedPractice } = await from("public/js/study/done.js");

const read = (name) => JSON.parse(readFileSync(join(HERE, "packs", name), "utf8"));
for (const name of ["path-nl.json", "words-nl-01.json", "words-nl-02.json"]) {
  const saved = await savePack(read(name));
  if (!saved.ok) throw new Error(`${name}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
useFrequency(JSON.parse(readFileSync(process.argv[listAt + 1], "utf8")));

let failed = 0;
let passed = 0;
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
async function test(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
// The test's own rule, not the app's (so a copy from before is judged by it too): the two tiles' words, case and accents aside, nothing else
// (drink beside "to drink" is no pair with itself).
const bare = (text) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .trim();
const lessons = pathLessons();
const thingOf = (lesson, lemma) => lesson.things.find((thing) => thing.lemma === lemma);
// Both sides a round can show for a word: the form it was taught in and its dictionary form, against its short meaning and its gloss.
const alike = (lesson, lemma) => {
  const thing = thingOf(lesson, lemma);
  const dutch = [lemma, thing ? taughtForm(thing) : null].filter(Boolean).map(bare);
  const english = [shortMeaning(lemma), WORDS[lemma]?.split(";")[0]].filter(Boolean).map(bare);
  return dutch.some((nl) => english.includes(nl));
};
const play = (step, at) => {
  if (step.kind === "see" || step.kind === "word") return record([{ concept: step.unit, at, outcome: "right", test: "pick", skill: "read", activity: step.kind }]);
  if (step.kind === "match") return record(step.words.map((word) => ({ concept: `w:${word}`, at, outcome: "right", test: "pick", skill: "read", activity: "match" })));
  if (!step.item) return;
  record([...sentenceUnits(step.item).map((concept) => ({ concept, at, outcome: "right", test: "pick", skill: "read", activity: step.kind, item: step.item.id })), ...lemmasOf(step.item).map((w) => ({ concept: `w:${w}`, at, outcome: "met", test: "pick", skill: "read", activity: step.kind, item: step.item.id }))]);
};

const first = lessons[0];
const same = first.things.filter((thing) => thing.lemma && alike(first, thing.lemma)).map((thing) => thing.lemma);
let at = new Date(2026, 9, 1, 9).getTime();
let lessonPlan;

await test("path-nl's lesson 1 has a word spelled the same both ways (the case this is about)", () => {
  ok(same.length > 0, `none in ${first.id}: ${first.things.map((thing) => thing.lemma).join(", ")}`);
  return `${first.id}: ${same.join(", ")}`;
});

await test("lesson 1's Match never pairs it with itself, and it's still asked another way in the lesson", () => {
  lessonPlan = planSession("lesson", first.id, at);
  const rounds = lessonPlan.steps.filter((step) => step.kind === "match");
  const paired = rounds.flatMap((step) => step.words.filter((word) => same.includes(word)));
  ok(!paired.length, `Match pairs ${paired.join(", ")} with itself (${rounds.map((step) => step.words.join("/")).join(" | ")})`);
  for (const word of same) ok(lessonPlan.steps.some((step) => step.kind !== "match" && (step.unit === `w:${word}` || step.target === word || step.item?.words?.some(([, lemma]) => lemma === word))), `${word} isn't asked anywhere else in the lesson`);
  return `${rounds.length} round(s): ${rounds.map((step) => step.words.join("/")).join(" | ") || "none"}`;
});

await test("a week of Practice after it: no Match round pairs a word with itself", () => {
  lessonPlan.steps.forEach((step, i) => play(step, at + i * 30_000));
  at += lessonPlan.steps.length * 30_000;
  finishedLesson(first.id, at);
  let rounds = 0;
  for (let day = 0; day < 7; day++) {
    const plan = planSession("practice", undefined, at + day * 86_400_000);
    for (const step of plan.steps.filter((one) => one.kind === "match")) {
      rounds++;
      const paired = step.words.filter((word) => alike(lessons.find((lesson) => thingOf(lesson, word)) ?? first, word));
      ok(!paired.length, `day ${day}: Match pairs ${paired.join(", ")} with itself`);
    }
    plan.steps.forEach((step, i) => play(step, at + day * 86_400_000 + i * 30_000));
    finishedPractice(at + day * 86_400_000 + plan.steps.length * 30_000);
  }
  return `${rounds} round(s)`;
});

// What a round's English tiles show, by the test's own rule: a word's short sense (the one it was taught in), else its dictionary line; a
// phrase's own English; a plain item's meaning. Two the same, case, accents and the marks at their ends aside, can't be told apart.
const shown = (text) => bare(String(text ?? "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
const tilesOf = (step) => [
  ...step.words.map((word) => [word, shortMeaning(word) || content.WORDS[word] || word]),
  ...(step.phrases ?? []).map((id) => [id, content.CHUNKS[id]?.en ?? id]),
  ...(step.items ?? []).map((item) => [item.text, item.means]),
];
const twice = (step) => {
  const by = new Map();
  for (const [what, english] of tilesOf(step)) by.set(shown(english), [...(by.get(shown(english)) ?? []), what]);
  return [...by].filter(([, all]) => all.length > 1).map(([english, all]) => `${all.join(" and ")} both "${english}"`);
};

await test("no Match round shows two tiles with the same English (lesson 15's je and jouw, \"your\"; de and het, \"the\"): every path lesson's rounds", () => {
  const bad = [];
  let rounds = 0;
  for (const lesson of lessons) {
    for (const step of planSession("lesson", lesson.id, at).steps.filter((one) => one.kind === "match")) {
      rounds++;
      for (const pair of twice(step)) bad.push(`${lesson.id}: ${pair}`);
    }
  }
  ok(!bad.length, `${bad.length} round(s): ${bad.slice(0, 6).join("; ")}`);
  return `${rounds} round(s) in ${lessons.length} lessons`;
});

await test("…nor a week of Practice, nor Match on its own, for a learner 20 lessons in", () => {
  // Every unit of the first 20 lessons known, a day apart.
  let when = at + 86_400_000;
  for (const lesson of lessons.slice(0, 20)) {
    record(lesson.things.map((thing) => ({ concept: thing.unit, at: when, outcome: "right", test: "pick", skill: "read", activity: "meaning" })));
    finishedLesson(lesson.id, when);
    when += 3_600_000;
  }
  const bad = [];
  let rounds = 0;
  for (let day = 0; day < 7; day++) {
    const now = when + day * 86_400_000;
    for (const [what, plan] of [["Practice", planSession("practice", undefined, now)], ["Match alone", planSession("game", "match", now)]]) {
      for (const step of plan.steps.filter((one) => one.kind === "match")) {
        rounds++;
        for (const pair of twice(step)) bad.push(`day ${day + 1}, ${what}: ${pair}`);
      }
      if (what === "Practice") {
        plan.steps.forEach((step, i) => play(step, now + i * 30_000));
        finishedPractice(now + plan.steps.length * 30_000);
      }
    }
  }
  ok(rounds >= 7, `only ${rounds} round(s) of Match`);
  ok(!bad.length, `${bad.length}: ${bad.slice(0, 6).join("; ")}`);
  return `${rounds} round(s)`;
});

console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
