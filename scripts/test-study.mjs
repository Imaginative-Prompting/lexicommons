// Practice and lessons (plan.js practiceOf, study/lesson.js), on the real Dutch path and word packs, in Node. Practice is the one thing to do once there's anything to
// practice, only ever on what you've been taught, and it's never the same two questions on repeat; a lesson asks from its first question, one new thing at a time,
// and every other choice on the screen is something you know or this lesson's, never a heavy word; a language with only a starter has the same.
// Usage: node scripts/test-study.mjs --list <frequency.nl.json>   (exit 0 = pass; 2 = no list given)
// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TESTS, allEvidence, clearProgress, conceptState, record, studiedUnits, unitState } from "../public/js/study/progress.js";
import { GAMES, lessonsSkippedBy, markLessonsDone, needsSound, pathOverview, planSession, setHearing, setWordHearing, slipInSteps, strayYouKnow, studyOverview } from "../public/js/study/plan.js";
import * as planModule from "../public/js/study/plan.js";
import { WAYS, getStudySettings, resetStudySettings, setStudySetting } from "../public/js/study/settings.js";
import { ITEMS, LESSONS, PACKS as SHOWN_PACKS, PATTERNS, WORDS, packWords, sentenceUnits } from "../public/js/study/content.js";
import { packKnown } from "../public/js/study/pack-known.js";
import { deletePack, savePack, setPackOn } from "../public/js/study/packs.js";
import { useFrequency } from "../public/js/study/frequency.js";
import { fillChoices, heardChoices, isNotFirst, lemmasOf, shortMeaning, targetOf, wordsInOrder } from "../public/js/study/new-words.js";
import { typedResult, typedWord } from "../public/js/study/typed.js";
import { typedRight } from "../public/js/study/attribute.js";
import { sourceOf } from "../public/js/know/summary.js";
import { pathLessons, refreshPictures, taughtForm } from "../public/js/study/path.js";
import { anchorOf, clearPlaces, markedOn, pathSync, setAnchor, setPlace } from "../public/js/study/path-place.js";
import { LESSON_QUESTIONS, englishTiles, meaningOfThing, seeStep, setPictures, setStories, shownThing, translateStep, wordStep } from "../public/js/study/lesson.js";
import { rewordingOf, wordForWord } from "../public/js/study/reword.js";
import { literalOkText } from "./literal-ok.mjs";
import { clearFinished, finishedLesson, finishedPractice, lessonsFinished, practicedToday, practicesSinceLesson } from "../public/js/study/done.js";
import { checkPack } from "../public/js/study/pack-format.js";
import { knowledge } from "../public/js/know/summary.js";
import { setLearning } from "../public/js/study/learning.js";
import notChoices from "../public/js/lang/not-a-choice.nl.js";

const listAt = process.argv.indexOf("--list");
if (listAt < 0) {
  console.error("Usage: node scripts/test-study.mjs --list <frequency.nl.json>");
  process.exit(2);
}
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(readFileSync(join(APP, "packs", name), "utf8"));
const PACKS = readdirSync(join(APP, "packs")).filter((name) => /^(path-nl|words-nl-\d+)\.json$/.test(name)).sort();
if (!PACKS.includes("path-nl.json")) throw new Error("packs/path-nl.json is missing");
for (const name of PACKS) {
  const saved = await savePack(read(name));
  if (!saved.ok) throw new Error(`${name}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
useFrequency(JSON.parse(readFileSync(process.argv[listAt + 1], "utf8")));

const DAY = 86_400_000;
const T0 = new Date(2026, 9, 1, 9).getTime();
let failed = 0;
let passed = 0;
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
async function test(name, fn) {
  if (only && !name.includes(only)) return;
  await clearProgress();
  clearFinished();
  resetStudySettings();
  clearPlaces();
  setHearing(null);
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
const eq = (actual, expected, what = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? `${what}: ` : ""}${a} ≠ ${e}`);
};
const asked = (steps) => steps.filter((step) => step.kind !== "meet");

// One step, recorded as session.js records it: right unless told. At `at`.
function play(step, at, right = true) {
  const outcome = right ? "right" : "wrong";
  if (step.kind === "meet") return record([{ concept: `p:${step.concept.pattern}`, at, outcome: "met", test: "self", skill: "read", activity: "meet", item: step.item?.id }]);
  if (step.kind === "see" || step.kind === "word") return record([{ concept: step.unit, at, outcome, test: "pick", skill: "read", activity: step.kind }]);
  if (step.kind === "type-word" || step.kind === "say-word") return record([{ concept: step.unit, at, outcome, test: "recall", skill: "say", activity: step.kind }]);
  if (step.kind === "repeat-word") return record([{ concept: step.unit, at, outcome, test: "recall", skill: "sound", activity: step.kind }]);
  if (step.kind === "match") {
    return record([
      ...step.words.map((word) => ({ concept: `w:${word}`, at, outcome, test: "pick", skill: "read", activity: "match" })),
      ...(step.phrases ?? []).map((id) => ({ concept: `c:${id}`, at, outcome, test: "pick", skill: "read", activity: "match" })),
    ]);
  }
  const { item } = step;
  const test = ["type", "say", "type-gap", "hear-gap"].includes(step.kind) ? "recall" : "pick";
  const skill = step.skill ?? "read";
  const answerWords = step.kind === "translate" ? outcome : step.target ? null : "met";
  return record([
    ...sentenceUnits(item).map((concept) => ({ concept, at, outcome, test, skill, activity: step.kind, item: item.id })),
    ...lemmasOf(item).map((word) => ({ concept: `w:${word}`, at, outcome: answerWords ?? (word === step.target ? outcome : "met"), test, skill, activity: step.kind, item: item.id })),
  ]);
}
function playAll(plan, at, right = () => true) {
  plan.steps.forEach((step, i) => play(step, at + i * 30_000, right(step, i)));
  return at + plan.steps.length * 30_000;
}
function doLesson(at, arg) {
  const plan = planSession("lesson", arg, at);
  const end = playAll(plan, at);
  if (plan.lesson) finishedLesson(plan.lesson.id, end);
  return end;
}
function doPractice(at) {
  const plan = planSession("practice", undefined, at);
  const end = playAll(plan, at);
  finishedPractice(end);
  return { end, plan };
}
const sentence = (step) => step.item?.words.map(([text]) => text).join(" ");

// What a lesson's steps can have put on the screen beside the right thing, each checked against what's allowed: that lesson's, or taught before.
function outsiders(plan, lesson, known) {
  const keys = new Set(lesson.things.map((thing) => thing.lemma ?? thing.phrase));
  const shown = new Set(lesson.things.filter((thing) => !thing.formOnly).map((thing) => shownThing(thing).text));
  const out = [];
  for (const step of plan.steps) {
    if (step.kind === "see") for (const option of step.options) if (!keys.has(option.key) && !known(option.key)) out.push(`see ${step.text}: ${option.key}`);
    if (step.kind === "word") for (const text of step.options) if (!shown.has(text) && !known(text)) out.push(`word ${step.means}: ${text}`);
  }
  return out;
}

await test("a brand-new learner: the first lesson is the one thing to do, with nothing to practice yet", () => {
  const study = studyOverview(T0);
  ok(study.firstTime, "not firstTime");
  eq(study.practice, null);
  eq(study.lesson.n, 1);
  eq(study.lesson.title, LESSONS[0].title);
  eq(planSession("practice", undefined, T0).steps, []);
  return `${study.lesson.title}, ${study.lesson.newThings} new`;
});

await test("lesson 1, as measured: no teaching screen, a question first, 15 questions, a sentence by the fifth, each new thing back at least 3 times", () => {
  const plan = planSession("lesson", undefined, T0);
  const steps = plan.steps;
  eq(steps.filter((step) => step.kind === "meet").length, 0, "teaching screens");
  eq(steps[0].kind, "see", "the first question");
  ok(steps[0].isNew, "the first question isn't marked new");
  eq(asked(steps).length, LESSON_QUESTIONS, "questions");
  const firstSentence = steps.findIndex((step) => step.item);
  ok(firstSentence >= 0 && firstSentence < 5, `the first sentence is question ${firstSentence + 1}`);
  const lesson = pathLessons()[0];
  ok(lesson.things.length >= 5 && lesson.things.length <= 7, `${lesson.things.length} new things`);
  for (const thing of lesson.things) {
    const uses = steps.filter((step) => step.unit === thing.unit || (step.item && thing.lemma && lemmasOf(step.item).includes(thing.lemma)) || step.words?.includes(thing.lemma)).length;
    ok(uses >= 3, `${thing.text} comes up ${uses} times`);
  }
  const kinds = new Set(steps.map((step) => step.kind));
  for (const kind of ["see", "word", "translate"]) ok(kinds.has(kind), `no ${kind}: ${[...kinds]}`);
  return steps.map((step) => step.kind).join(" ");
});

await test("nothing's asked before it's been introduced: each new thing's first question marks it new, at most 2 at once, and a sentence's other words are known", () => {
  for (const [at, lesson] of pathLessons().filter((one) => !one.worked && !one.full).slice(0, 40).entries()) {
    if (at) markLessonsDone([pathLessons()[at - 1]]);
    const plan = planSession("lesson", lesson.id, T0);
    const seen = new Set();
    const inLesson = new Set(lesson.things.filter((thing) => thing.lemma && !thing.formOnly).map((thing) => thing.lemma));
    for (const step of plan.steps) {
      if (step.kind === "see" && step.isNew) seen.add(step.target ?? step.phrase);
      if (step.kind === "translate" && step.isNew) {
        ok(step.news.length <= 2, `${lesson.id} ${sentence(step)}: ${step.news.length} new at once`);
        for (const news of step.news) seen.add(news);
      }
      if (step.kind === "word" && (step.target ?? step.phrase)) ok(seen.has(step.target ?? step.phrase), `${lesson.id}: asked "${step.target ?? step.phrase}" before it's been introduced`);
      if (step.item && step.kind !== "meet" && !step.isNew) {
        const unseen = lemmasOf(step.item).filter((word) => inLesson.has(word) && !seen.has(word));
        eq(unseen, [], `${lesson.id} ${step.kind} "${sentence(step)}" before`);
      }
    }
  }
});

await test("every written lesson: 13 to 17 questions (8 to 12 for one idea), a real one first, no blank question, every option from this lesson or what's taught, never heavy", () => {
  const heavy = new Set(notChoices);
  const lessons = pathLessons().filter((one) => !one.worked && !one.full);
  const sizes = new Map();
  for (const [at, lesson] of lessons.entries()) {
    if (at) markLessonsDone([lessons[at - 1]]);
    const before = new Set(lessons.slice(0, at).flatMap((one) => one.things.flatMap((thing) => [thing.lemma ?? thing.phrase, shownThing(thing).text])));
    const plan = planSession("lesson", lesson.id, T0);
    const count = asked(plan.steps).length;
    sizes.set(count, (sizes.get(count) ?? 0) + 1);
    const [least, most] = lesson.kind === "idea" ? [8, 12] : [13, 17];
    ok(count >= least && count <= most, `${lesson.id} has ${count} questions: ${plan.steps.map((step) => step.kind)}`);
    ok(plan.steps[0].kind !== "meet", `${lesson.id} opens on a screen with no question`);
    eq(outsiders(plan, lesson, (key) => before.has(key)), [], lesson.id);
    for (const step of plan.steps) {
      if (step.kind === "see") {
        ok(step.options.length >= 2 && step.options[step.correct], `${lesson.id}: a see with ${step.options.length} options`);
        for (const option of step.options) ok(!heavy.has(option.key) || option.key === (step.target ?? step.phrase), `${lesson.id}: "${option.key}" is on the not-a-choice list`);
      }
      if (step.kind === "word") ok(step.options.length >= 2, `${lesson.id}: a word question with ${step.options.length} options`);
      if (step.kind === "translate") {
        ok(step.answer.every((word) => step.tiles.includes(word)), `${lesson.id}: a tile missing from "${sentence(step)}"`);
        ok(step.tiles.length > step.answer.length, `${lesson.id}: no other tile for "${sentence(step)}"`);
      }
      if (step.kind === "fill") ok(step.options?.length >= 3, `${lesson.id}: fill with ${step.options?.length} options`);
    }
  }
  return [...sizes].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}: ${c}`).join(", ");
});

// A question's choices, each a different thing saying a different thing (Which one is it?, Which word is it?): the same choice twice is
// a fault (lesson.js wrongFor once had this lesson's own things twice past 80 known: "the male friend" twice, from about lesson 20).
const twice = (step) => {
  const keys = step.options.map((one) => one.key ?? one);
  const shown = step.options.map((one) => one.label ?? one.text ?? one);
  return new Set(keys).size !== keys.length || new Set(shown).size !== shown.length;
};
await test("a question never offers the same choice twice: every written lesson's Which one is it? and Which word is it?, with everything before it known; and on a pool past 80 things (a planted pair caught first)", () => {
  ok(twice({ options: [{ key: "a", label: "x" }, { key: "a", label: "x" }, { key: "b", label: "y" }] }), "the check misses a planted pair");
  ok(!twice({ options: [{ key: "a", label: "x" }, { key: "b", label: "y" }] }), "the check flags two different choices");
  const lessons = pathLessons().filter((one) => !one.worked && !one.full);
  let steps = 0;
  for (const [at, lesson] of lessons.entries()) {
    if (at) markLessonsDone([lessons[at - 1]]);
    for (const step of planSession("lesson", lesson.id, T0).steps) {
      if (step.kind !== "see" && step.kind !== "word") continue;
      steps++;
      ok(!twice(step), `${lesson.id} (${at + 1}): ${step.kind} on ${step.target ?? step.phrase} offers ${JSON.stringify(step.options.map((one) => one.label ?? one.text ?? one))}`);
    }
  }
  // A pool as poolOf makes it, this lesson's own first: at 60 the whole pool is looked at; past 80 a run of it, which can reach the own again.
  const poolOf = (size) => Array.from({ length: size }, (_, k) => ({ key: `w${k}`, own: k < 5, text: `w${k}`, means: `meaning ${k}`, thing: { lemma: `w${k}`, unit: `w:w${k}` } }));
  const made = {};
  for (const size of [60, 81, 100, 150]) {
    const pool = poolOf(size);
    let bad = 0;
    for (let seed = 0; seed < 200; seed++) {
      const entry = { ...pool[seed % 5], key: `w${seed % 5}` };
      const see = seeStep(entry, pool);
      const word = wordStep(entry, pool);
      if ((see && twice(see)) || (word && twice(word))) bad++;
    }
    made[size] = bad;
  }
  eq(made, { 60: 0, 81: 0, 100: 0, 150: 0 }, "questions with a choice twice, of 200 seeds, by pool size");
  // A small pool whose other things mostly say the same: fewer wrong choices, each once, and a question all the same while one is possible.
  const thing = (k, means) => ({ key: `s${k}`, own: true, text: `s${k}`, means, thing: { lemma: `s${k}`, unit: `w:s${k}` } });
  const small = [thing(0, "the door"), thing(1, "your"), thing(2, "your"), thing(3, "your")];
  const see = seeStep(small[0], small);
  const word = wordStep(small[0], small);
  eq(see?.options.map((one) => one.label).sort(), ["the door", "your"], "Which one is it? on a pool with one other meaning");
  ok(word?.options.length === 2 && word.options.includes("s0") && ["s1", "s2", "s3"].some((one) => word.options.includes(one)), `Which word is it? on a pool with one other meaning: ${JSON.stringify(word?.options)}`);
  const none = [thing(0, "the door"), thing(1, "the door")];
  eq([seeStep(none[0], none), wordStep(none[0], none)], [null, null], "no other meaning: no question");
  return `${steps} questions across ${lessons.length} lessons`;
});

await test("the idea of a lesson comes after its first sentence, never before", () => {
  let lessons = 0;
  for (const lesson of pathLessons().filter((one) => !one.worked && one.concept).slice(0, 30)) {
    const steps = planSession("lesson", lesson.id, T0).steps;
    const at = steps.findIndex((step) => step.kind === "meet");
    if (at < 0) continue;
    lessons++;
    ok(at > 0 && steps.slice(0, at).some((step) => step.item?.concepts?.includes(lesson.concept.pattern)), `${lesson.id}: the idea at ${at}, before a sentence that shows it`);
  }
  ok(lessons >= 5, `${lessons} lessons showed an idea`);
  return `${lessons} lessons`;
});

await test("a noun is shown with its article and its meaning with the; a verb in the form it teaches", () => {
  const things = pathLessons().flatMap((lesson) => lesson.things);
  const thing = (lemma) => things.find((one) => one.lemma === lemma);
  eq(shownThing(thing("koffie")), { text: "de koffie", means: "the coffee" });
  eq(shownThing(thing("water")), { text: "het water", means: "the water" });
  eq(shownThing({ text: "eau", article: "l'", means: "the water" }).text, "l'eau");
  eq(shownThing({ text: "eau", article: "l’", means: "the water" }).text, "l’eau");
  eq(shownThing(thing("drinken")).text, "drink");
  eq(shownThing(thing("eten")), { text: "eet", means: "eat" });
  ok(!things.some((one) => one.formOnly && one.article), "a lesson's new forms with an article");
  ok(things.filter((one) => one.article).every((one) => ["de", "het"].includes(one.article)), "an article that isn't de or het");
  eq(shortMeaning("koffie"), "coffee");
  eq(shortMeaning("liggen"), "to lie");
  return `${things.filter((one) => one.article).length} nouns`;
});

await test("tiles: a sentence's plain English, with I and its contractions kept", () => {
  eq(englishTiles("I'm having a coffee."), ["I'm", "having", "a", "coffee"]);
  eq(englishTiles("Hello, a tea and a water, please."), ["hello", "a", "tea", "and", "a", "water", "please"]);
  eq(englishTiles("Yes, I drink coffee."), ["yes", "I", "drink", "coffee"]);
});

await test("a picture question needs 3 drawings on the screen: fewer, and it's asked in words, never a blank", () => {
  try {
    setPictures((concept) => ["coffee", "tea", "water", "milk"].includes(concept));
    const first = planSession("lesson", undefined, T0).steps[0];
    ok(first.options.every((option) => option.picture), "lesson 1's first question has a card without a picture");
    setPictures((concept) => concept === "coffee" || concept === "tea");
    const two = planSession("lesson", undefined, T0).steps[0];
    ok(two.options.every((option) => !option.picture), "two drawings shouldn't make a picture question");
    setPictures(() => false);
    const none = planSession("lesson", undefined, T0).steps[0];
    ok(none.kind === "see" && none.options.every((option) => !option.picture && option.label), "with no drawings, it's its words");
    return `${first.options.length} pictures, else words`;
  } finally {
    setPictures(null);
  }
});

await test("after a lesson, what it taught is what you know: the next is lesson 2, Practice is the card, and its count is the lesson's", () => {
  const end = doLesson(T0);
  const study = studyOverview(end);
  ok(!study.firstTime && study.practice, "no practice after a lesson");
  eq(study.lesson.n, 2);
  ok(lessonsFinished().has(LESSONS[0].id), "not marked finished");
  const { kinds } = knowledge({ now: end });
  eq(kinds.word.known + kinds.phrase.known, pathLessons()[0].things.length, `words ${kinds.word.known}, phrases ${kinds.phrase.known}`);
  eq(studyOverview(end).practicedToday, false, "a lesson isn't a practice");
  return `${kinds.word.known} words, ${kinds.phrase.known} phrases; practice ${study.practice.questions} questions`;
});

await test("the first practice after one lesson: only what it taught, no sentence or word twice, an honest length, and not the same two questions", () => {
  const end = doLesson(T0);
  const taught = new Set(pathLessons()[0].things.map((thing) => thing.lemma));
  const plan = planSession("practice", undefined, end);
  ok(plan.practice && plan.steps.length >= 5 && plan.steps.length <= 15, `${plan.steps.length} questions`);
  const kinds = new Set(plan.steps.map((step) => step.kind));
  ok(kinds.size >= 4, `only ${[...kinds]}`);
  const sentences = plan.steps.filter((step) => step.item).map((step) => step.item.id);
  eq(new Set(sentences).size, sentences.length, "a sentence twice");
  const units = plan.steps.filter((step) => ["see", "word", "type-word", "say-word", "repeat-word"].includes(step.kind)).map((step) => step.unit);
  eq(new Set(units).size, units.length, "a word twice");
  for (const step of plan.steps) {
    if (step.item) for (const word of lemmasOf(step.item)) ok(taught.has(word) || !WORDS[word], `"${word}" hasn't been taught: ${sentence(step)}`);
    if (step.kind === "see") for (const option of step.options) ok(taught.has(option.key), `"${option.key}" hasn't been taught`);
  }
  return `${plan.steps.length}: ${plan.steps.map((step) => step.kind).join(" ")}`;
});

await test("three practices in a row aren't the same practice", () => {
  let at = doLesson(T0);
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const { end, plan } = doPractice(at);
    seen.push(plan.steps.map((step) => `${step.kind}:${step.item?.id ?? step.unit ?? ""}`).join(" "));
    at = end + 3_600_000;
  }
  eq(new Set(seen).size, 3, "the same practice twice");
  ok(practicedToday(at), "not counted as practiced");
});

await test("every 3 practices it suggests the next lesson, once each, and a lesson starts the count again; a setting changes it", () => {
  let at = doLesson(T0);
  for (let i = 0; i < 2; i++) at = doPractice(at).end;
  eq(practicesSinceLesson(), 2);
  ok(!studyOverview(at).suggest, "suggested after 2");
  at = doPractice(at).end;
  ok(studyOverview(at).suggest, "not suggested after 3");
  at = doPractice(at).end;
  ok(!studyOverview(at).suggest, "said again on the very next practice");
  at = doPractice(at).end;
  at = doPractice(at).end;
  ok(studyOverview(at).suggest, "not suggested after 6");
  at = doLesson(at + 1000);
  eq(practicesSinceLesson(), 0);
  ok(!studyOverview(at).suggest, "still suggested after the lesson");
  setStudySetting("practice.suggestEvery", 2);
  at = doPractice(at).end;
  at = doPractice(at).end;
  ok(studyOverview(at).suggest, "the setting");
});

await test("40 lessons in: practice draws on the word packs too, and only sentences whose every word has been taught", () => {
  let at = T0;
  for (let i = 0; i < 40; i++) at = doLesson(at, pathLessons()[i].id) + DAY / 4;
  eq(studyOverview(at).lesson.id, pathLessons()[40].id);
  const taught = new Set(studiedUnits("nl"));
  const packs = new Map();
  for (let i = 0; i < 6; i++) {
    const { end, plan } = doPractice(at);
    ok(plan.steps.length >= 12, `${plan.steps.length} questions`);
    for (const step of plan.steps) {
      if (!step.item) continue;
      packs.set(step.item.pack, (packs.get(step.item.pack) ?? 0) + 1);
      for (const word of lemmasOf(step.item)) ok(taught.has(`w:${word}`) || !WORDS[word], `"${word}" hasn't been taught: ${sentence(step)}`);
      for (const id of step.item.chunks ?? []) ok(taught.has(`c:${id}`), `the phrase ${id} hasn't been taught: ${sentence(step)}`);
    }
    at = end + DAY / 4;
  }
  ok([...packs.keys()].some((pack) => /^words-nl/.test(pack)), `only ${[...packs.keys()]}`);
  return [...packs].map(([pack, n]) => `${pack}: ${n}`).join(", ");
});

await test("an account with old progress: it lands past what it knows, on a lesson with something new, with Practice as the card, and a lesson it knows most of counts as behind it", () => {
  const old = wordsInOrder().slice(0, 1800);
  record(old.map((word, i) => ({ concept: `w:${word}`, at: T0 - 30 * DAY + i * 60_000, outcome: "right", test: "pick", skill: "read", activity: "meaning", item: "old" })));
  const study = studyOverview(T0);
  ok(!study.firstTime && study.practice, "no practice for someone who knows 1,800 words");
  ok(study.practice.questions >= 12, `${study.practice.questions} questions`);
  const next = pathLessons().find((lesson) => lesson.id === study.lesson.id);
  ok(next.things.some((thing) => !thing.formOnly && unitState(thing.unit, { now: T0 }).isNew), `${next.id} has nothing new`);
  ok(study.lesson.n > 1, `sent back to lesson ${study.lesson.n}`);
  return `lesson ${study.lesson.n}, ${study.practice.questions} questions`;
});

await test("a lesson you've started stays yours to finish, though you know most of it", () => {
  const lesson = pathLessons()[0];
  const own = lesson.things.filter((thing) => !thing.formOnly);
  record(own.slice(0, own.length - 1).map((thing, i) => ({ concept: thing.unit, at: T0 + i, outcome: "right", test: "pick", skill: "read", activity: "see" })));
  eq(studyOverview(T0 + 60_000).lesson.id, lesson.id);
  const steps = planSession("lesson", undefined, T0 + 60_000).steps;
  ok(asked(steps).length >= 5, `${asked(steps).length} questions`);
});

await test("clearing your progress brings the path back to its start, whatever you've finished", async () => {
  const at = doLesson(T0);
  eq(studyOverview(at).lesson.n, 2);
  await clearProgress();
  eq(studyOverview(at).lesson.n, 1);
});

await test("jumping ahead, saying no: only what you do is added; the lesson you jumped to is next, its sentences' other words only met, and Practice stays on what you've done", () => {
  const lessons = pathLessons();
  const end = doLesson(T0);
  eq(lessonsSkippedBy(lessons[1].id, end).length, 0, "the next lesson skips nothing");
  eq(lessonsSkippedBy(lessons[0].id, end).length, 0, "one behind you skips nothing");
  // A lesson of one idea is never skipped: it stays open.
  eq(lessonsSkippedBy(lessons[13].id, end).map((one) => one.id), lessons.slice(1, 13).filter((one) => one.kind !== "idea").map((one) => one.id));
  const before = allEvidence().length;
  setPlace("nl", lessons[13].id);
  eq(allEvidence().length, before, "jumping recorded something");
  eq(studyOverview(end).lesson.id, lessons[13].id);
  const practice = planSession("practice", undefined, end);
  ok(practice.steps.length, "no practice");
  const taught = new Set(lessons[0].things.map((thing) => thing.lemma).filter(Boolean));
  for (const step of practice.steps) if (step.item) for (const word of lemmasOf(step.item)) ok(taught.has(word) || !WORDS[word], `Practice asks "${word}", from a lesson you skipped`);
  const jumped = planSession("lesson", undefined, end);
  ok(asked(jumped.steps).length >= 13, `${asked(jumped.steps).length} questions`);
  const carrying = jumped.steps.filter((step) => step.borrowed?.length);
  ok(carrying.length, "none of its sentences needed a word you skipped");
  for (const step of carrying) ok(step.kind === "translate" || step.kind === "fill", `${step.kind} asks about words you haven't met`);
  for (const step of carrying) ok(step.borrowed.length <= 4, `${step.borrowed.length} words you haven't met in one sentence`);
  const later = new Set(lessons.slice(14).flatMap((one) => one.things.map((thing) => thing.lemma)));
  for (const lesson of [lessons[13]]) for (const step of jumped.steps) if (step.item) for (const word of lemmasOf(step.item)) ok(!later.has(word) || lesson.things.some((thing) => thing.lemma === word) || taught.has(word) || lessons.slice(0, 13).some((one) => one.things.some((thing) => thing.lemma === word)), `"${word}" comes from further on`);
});

await test("jumping from nothing: every written lesson still asks, with choices only from itself, and nothing from further on", () => {
  const lessons = pathLessons().filter((one) => !one.worked && !one.full);
  const sizes = [];
  for (const lesson of lessons) {
    const plan = planSession("lesson", lesson.id, T0);
    const count = asked(plan.steps).length;
    sizes.push(count);
    ok(count >= 4, `${lesson.id} has ${count} questions: ${plan.steps.map((step) => step.kind)}`);
    eq(outsiders(plan, lesson, () => false), [], lesson.id);
  }
  return `${Math.min(...sizes)} to ${Math.max(...sizes)} questions`;
});

await test("jumping ahead, saying yes: what they teach goes in what you know, Practice asks about it, the path inks them, and a lesson isn't finished or a day counted", () => {
  const lessons = pathLessons();
  const skipped = lessonsSkippedBy(lessons[13].id, T0);
  const words = (from, to) => lessons.slice(from, to).filter((one) => one.kind !== "idea").length;
  eq(skipped.length, words(0, 13));
  const finishedBefore = lessonsFinished().size;
  markLessonsDone(skipped);
  setPlace("nl", lessons[13].id);
  eq(lessonsFinished().size, finishedBefore, "marking finished a lesson");
  eq(markedOn("nl").length, words(0, 13));
  ok(!unitState(`w:${lessons[3].things.find((thing) => thing.lemma).lemma}`).isNew, "still new");
  eq(lessonsSkippedBy(lessons[20].id, T0).length, words(13, 20), "only the ones since");
  const path = pathOverview(30, T0);
  eq(path.lessons.slice(0, 13).map((one) => one.state), lessons.slice(0, 13).map((one) => (one.kind === "idea" ? "open" : "done")));
  eq(path.lessons[13].state, "here");
  const practice = planSession("practice", undefined, T0);
  ok(practice.steps.some((step) => step.item), "Practice doesn't have the sentences");
  ok(!planSession("lesson", undefined, T0).steps.some((step) => step.borrowed?.length), "words you marked as known are still marked as unmet");
});

await test("a gap stays a gap: the path says skipped, the line can break there, and when you reach the end, what's next is what you jumped over", () => {
  const lessons = pathLessons().filter((one) => !one.worked && !one.full);
  const end = doLesson(T0);
  setPlace("nl", lessons[5].id);
  const after = doLesson(end + 1000);
  const path = pathOverview(30, after);
  eq(path.lessons.slice(0, 7).map((one) => one.state), ["done", "skipped", "skipped", "skipped", "skipped", "done", "here"]);
  ok(path.lessons[5].doing, "a finished lesson says how you're doing");
  ok(!path.lessons[1].doing && !path.lessons[8].doing, "an unfinished one says how you're doing");
  eq(path.lessons[20].state, "ahead");
  setPlace("nl", lessons.at(-1).id);
  const last = doLesson(after + 1000);
  eq(studyOverview(last).atEnd, false);
  const next = pathLessons()[lessons.length];
  if (!next) eq(studyOverview(last).lesson.id, lessons[1].id);
  ok(studyOverview(last).lesson, "the end of the path with lessons undone");
  setPlace("nl", null);
  eq(studyOverview(last).lesson.id, lessons[1].id, "back to where your learning has got to");
});

await test("no voice for the language: no question needs one, in a lesson or a practice, the same number of questions; recorded sentences alone are heard (with a control)", () => {
  const hearing = (plan) => plan.steps.filter((step) => step.kind === "listen" || step.kind === "repeat");
  const withVoice = planSession("lesson", undefined, T0);
  ok(hearing(withVoice).length, "the control: a lesson with a voice has a listening question");
  setHearing(() => false);
  const none = planSession("lesson", undefined, T0);
  eq(hearing(none).length, 0, "listening with no voice");
  ok(Math.abs(asked(none.steps).length - asked(withVoice.steps).length) <= 1, `${asked(none.steps).length} against ${asked(withVoice.steps).length}`);
  let at = doLesson(T0);
  const practice = planSession("practice", undefined, at);
  eq(hearing(practice).length, 0, "listening in a practice with no voice");
  ok(practice.steps.length >= 5, `${practice.steps.length} questions`);
  setHearing(null);
  const heard = withVoice.steps.find((step) => step.kind === "listen").item.id;
  setHearing((item) => item.id === heard);
  const some = planSession("lesson", LESSONS[0].id, T0);
  ok(hearing(some).every((step) => step.item.id === heard), "a sentence with no recording, heard");
});

await test("wrong answers of What did you hear? and Fill are what you've met or this lesson's, never a heavy word (with a control)", () => {
  const byId = new Map(ITEMS.map((item) => [item.id, item]));
  const lesson1 = LESSONS[0].items.map((id) => byId.get(id).means);
  const fresh = { units: new Set(), played: new Set() };
  const first = heardChoices(byId.get(LESSONS[0].items[0]), fresh);
  eq(first.length, 2, "two wrong answers");
  ok(first.every((text) => lesson1.includes(text)), `from elsewhere: ${first}`);
  const bare = ITEMS.find((item) => item.pack !== "path-nl" && !LESSONS.some((lesson) => lesson.items.includes(item.id)));
  eq(heardChoices(bare, fresh), [], "with nothing met");
  const heavy = new Set(notChoices);
  const planted = ITEMS.find((item) => !isNotFirst(item) && lemmasOf(item).some((word) => heavy.has(word)) && lemmasOf(item).length >= 2);
  const plain = ITEMS.find((item) => item !== planted && !isNotFirst(item) && item.means !== planted.means && !lemmasOf(item).some((word) => heavy.has(word)) && lemmasOf(item).length >= 2);
  const askedAbout = ITEMS.find((item) => item !== planted && item !== plain && item.means !== planted.means && item.means !== plain.means && lemmasOf(item).length >= 2);
  const units = new Set([...planted.chunks ?? [], ...plain.chunks ?? []].map((chunk) => `c:${chunk}`));
  for (const item of [planted, plain]) for (const word of lemmasOf(item)) units.add(`w:${word}`);
  const choices = heardChoices(askedAbout, { units, played: new Set([planted.id, plain.id]), count: 2000 });
  ok(choices.includes(plain.means), "the control");
  ok(!choices.includes(planted.means), `"${planted.means}" is offered`);
  // Fill: with only a few words known, nothing from outside them.
  const known = new Set(["ik", "drinken", "koffie", "water", "thee", "melk"]);
  const item = byId.get(LESSONS[0].items[0]);
  const options = fillChoices(item, { known: (lemma) => known.has(lemma) });
  ok(!options || options.every((option) => [...known, "drink"].includes(option) || known.has((typeof option === "string" ? option : option.text).toLocaleLowerCase()) || item.words[item.gap.index][0] === option), `from outside: ${options}`);
});

await test("a lesson's plan and a practice's are quick enough on every Dutch pack", () => {
  const started = performance.now();
  planSession("lesson", undefined, T0);
  const lesson = performance.now() - started;
  const at = doLesson(T0);
  const second = performance.now();
  studyOverview(at);
  const overview = performance.now() - second;
  ok(lesson < 1500 && overview < 1500, `lesson ${Math.round(lesson)} ms, overview ${Math.round(overview)} ms`);
  return `lesson ${Math.round(lesson)} ms, overview ${Math.round(overview)} ms, ${ITEMS.length} sentences`;
});

await test("a pack's lessons are checked: an item, a phrase or a pattern it doesn't have, a bad article or picture; a pack with none is as it was", () => {
  const pack = read("path-nl.json");
  eq(checkPack(pack).errors, []);
  const broken = (change) => {
    const copy = structuredClone(pack);
    change(copy);
    return checkPack(copy).errors.map((error) => error.message).join(" ");
  };
  ok(/isn't one of the pack's items/.test(broken((p) => p.lessons[0].items.push("nope"))), "an item");
  ok(/isn't one of the pack's chunks/.test(broken((p) => p.lessons[1].phrases.push("nope"))), "a phrase");
  ok(/concept must name a pattern/.test(broken((p) => (p.lessons[0].concept = { pattern: "nope", line: "x" }))), "a pattern");
  ok(/another lesson has the id/.test(broken((p) => (p.lessons[1].id = p.lessons[0].id))), "two ids");
  ok(/at least one sentence/.test(broken((p) => (p.lessons[0].items = []))), "no sentences");
  const withWord = pack.lessons.findIndex((lesson) => lesson.words.length);
  ok(/article/.test(broken((p) => (p.lessons[withWord].words[0].article = 3))), "an article that isn't text");
  ok(/picture/.test(broken((p) => (p.lessons[withWord].words[0].picture = "../x"))), "a picture that isn't a concept id");
  ok(/names one of the pack's units/.test(broken((p) => (p.lessons[3].unit = "nope"))), "a unit that isn't there");
  ok(/names one of the pack's units/.test(broken((p) => delete p.lessons[3].unit)), "a lesson in no unit");
  ok(/no units for it to be in/.test(broken((p) => delete p.units)), "a unit with no units");
  ok(/next to each other/.test(broken((p) => (p.lessons[20].unit = p.lessons[0].unit))), "a unit split in two");
  ok(/next to each other/.test(broken((p) => p.units.reverse())), "units out of order");
  ok(/No lesson is in/.test(broken((p) => p.units.push({ id: "empty", title: "Empty" }))), "a unit with no lessons");
  ok(/another unit has the id/.test(broken((p) => (p.units[1].id = p.units[0].id))), "two units with one id");
  ok(/a theme is an id/.test(broken((p) => (p.lessons[3].theme = "../x"))), "a theme that isn't an id");
  ok(/units must be a list/.test(broken((p) => (p.units = "x"))), "units that aren't a list");
  const kept = structuredClone(pack);
  kept.lessons[withWord].words[0].article = "le";
  kept.lessons[withWord].words[0].picture = "coffee";
  eq(checkPack(kept).pack.lessons[withWord].words[0].article, "le", "any language's article is kept");
  eq(checkPack(kept).pack.lessons[withWord].words[0].picture, "coffee");
  const none = structuredClone(pack);
  delete none.lessons;
  delete none.units;
  const plain = checkPack(none).pack;
  ok(!("lessons" in plain) && !("units" in plain), "no lessons or units field added");
});

// Last: it changes the language this process is on.
await test("every lesson on the path is in a unit, written or worked out, in order and whole", () => {
  const lessons = pathLessons();
  ok(lessons.every((lesson) => lesson.unit?.id && lesson.unit?.title), "a lesson with no unit");
  eq(lessons[0].unit.title, "Coffee and keys");
  eq(lessons[0].theme, "food");
  const runs = lessons.map((lesson) => lesson.unit.id).filter((id, i, all) => id !== all[i - 1]);
  eq(new Set(runs).size, runs.length, "a unit in two places");
  const written = lessons.filter((lesson) => !lesson.worked);
  for (const id of new Set(written.map((lesson) => lesson.unit.id))) {
    // Its lessons of words; a few lessons of one idea sit among them.
    const size = written.filter((lesson) => lesson.unit.id === id && lesson.kind !== "idea").length;
    ok(size >= 8 && size <= 14, `${id} has ${size} lessons of words`);
    const ideas = written.filter((lesson) => lesson.unit.id === id && lesson.kind === "idea").length;
    ok(ideas <= 4, `${id} has ${ideas} lessons of one idea`);
  }
  const more = lessons.find((lesson) => lesson.worked);
  // A worked-out lesson from a pack written for its words is under that pack's name; any other under More words.
  // A worked-out unit is named for what's in it (a topic), never More words.
  if (more) ok(more.unit.title && !/^More words/.test(more.unit.title), more.unit.title);
});

// Nature and weather, a topic pack, saved here as one of yours (it can't lean on the library's topics as a library pack does: it carries the
// bands'). only: every other pack off, the built-in starter too, as a learner who wants just this pack has it.
async function withWeather(fn, { only = true } = {}) {
  const weather = JSON.parse(readFileSync(join(APP, "packs", "nl-weather-1.json"), "utf8"));
  const topics = Object.assign({}, ...PACKS.map((name) => read(name).topics ?? {}), weather.topics);
  const saved = await savePack({ ...weather, topics });
  ok(saved.ok !== false, JSON.stringify(saved.errors?.slice(0, 2)));
  const ids = SHOWN_PACKS.map((pack) => pack.id).filter((id) => id !== "nl-weather-1");
  const own = new Set(weather.items.filter((item) => item.gap).map((item) => item.words[item.gap.index][1]));
  try {
    if (only) for (const id of ids) setPackOn(id, false);
    return await fn({ weather, own, ids });
  } finally {
    for (const id of ids) setPackOn(id, true);
    await deletePack("nl-weather-1");
  }
}

await test("a topic pack teaches what it's for: alone, it opens on its own words as cards, commonest first, then teaches each little word its sentences need just in time, where a sentence first asks it; under its own name", () =>
  withWeather(({ weather, own }) => {
    const worked = pathLessons().filter((lesson) => lesson.worked);
    ok(worked.length >= 20, `${worked.length} worked-out lessons`);
    const order = wordsInOrder();
    const commonest = [...own].filter((lemma) => order.includes(lemma)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    eq(worked[0].things.map((thing) => thing.lemma), commonest.slice(0, 4), "the first lesson");
    eq(worked[1].things.map((thing) => thing.lemma), commonest.slice(4, 8), "the second");
    // Every word it teaches is one of its own or one its sentences need; ik, je, zijn never come before a sentence needs them.
    const needed = new Set(weather.items.flatMap((item) => item.words.map(([, lemma]) => lemma)));
    ok(worked.every((lesson) => lesson.things.every((thing) => own.has(thing.lemma) || needed.has(thing.lemma))), "a word neither its own nor needed");
    ok(worked.every((lesson) => lesson.unit.title.startsWith(weather.name) && lesson.title.startsWith(weather.name)), `titled: ${worked[0].unit.title} / ${worked[0].title}`);
    ok(worked.slice(2, 6).some((lesson) => lesson.things.some((thing) => !own.has(thing.lemma))), "no little word taught just in time in its first lessons");
    // Played in order: its first two ask no sentence (cards); the first lesson with a little word asks a sentence with it, every word met.
    let at = T0;
    const notes = [];
    for (const lesson of worked.slice(0, 6)) {
      const plan = planSession("lesson", lesson.id, at);
      const sentences = plan.steps.filter((step) => step.item);
      const little = lesson.things.filter((thing) => !own.has(thing.lemma));
      if (worked.indexOf(lesson) < 2) eq(sentences.map((step) => step.item.id), [], `${lesson.id} asks a sentence`);
      if (little.length) {
        ok(sentences.length, `${lesson.id} teaches ${little.map((thing) => thing.lemma)} and asks no sentence`);
        ok(sentences.some((step) => little.some((thing) => lemmasOf(step.item).includes(thing.lemma)) && !step.borrowed?.length), `${lesson.id}: no sentence with its little words and nothing borrowed`);
      }
      const times = sentences.filter((step) => step.kind === "translate").reduce((map, step) => map.set(step.item.id, (map.get(step.item.id) ?? 0) + 1), new Map());
      ok([...times.values()].every((n) => n <= 3), `${lesson.id}: a sentence asked ${Math.max(...times.values())} times`);
      notes.push(`${lesson.things.map((thing) => thing.lemma).join(" ")}${sentences.length ? ` (${sentences.length} on sentences)` : ""}`);
      at = doLesson(at, lesson.id) + 60_000;
    }
    const shown = pathOverview(20, T0).lessons.find((lesson) => lesson.id === worked[0].id);
    eq(shown?.title, worked[0].things.map((thing) => thing.lemma).join(", "), "the path's stop");
    eq(shown?.unit?.title ?? worked[0].unit.title, `${weather.name} 1`);
    eq(packWords(weather).length, own.size, "packWords");
    return `${worked.length} lessons: ${notes.join(" | ")}`;
  }));

await test("a topic pack you add comes next: right after the unit you're in when it comes, the written path going on after it", () =>
  withWeather(
    () => {
      const all = pathLessons();
      const firstAt = all.findIndex((lesson) => lesson.pack === "nl-weather-1");
      ok(firstAt > 0, "its lessons aren't on the path");
      const lastAt = all.findLastIndex((lesson) => lesson.pack === "nl-weather-1");
      const before = all[firstAt - 1];
      const after = all[lastAt + 1];
      // You're at the first lesson: it comes after the first unit (and that unit's whole lesson), and the second unit follows it.
      eq(before.unit.id, all[0].unit.id, "what comes before it");
      ok(after && !after.worked && after.unit.id !== all[0].unit.id, `what comes after it: ${after?.id}`);
      ok(all.slice(firstAt, lastAt + 1).every((lesson) => lesson.pack === "nl-weather-1"), "its lessons aren't together");
      // Its words that the written path teaches before it aren't taught again.
      const earlier = new Set(all.slice(0, firstAt).flatMap((lesson) => lesson.things.map((thing) => thing.lemma)));
      ok(all.slice(firstAt, lastAt + 1).every((lesson) => lesson.things.every((thing) => !earlier.has(thing.lemma))), "a word the first unit taught, taught again");
      return `after ${before.id}, before ${after.id}: ${lastAt - firstAt + 1} lessons`;
    },
    { only: false },
  ));

await test("a topic pack teaches only what you don't have: 90% of its words known, the lessons of known words are behind you and the other 10% are taught", () =>
  withWeather(({ own }) => {
    const words = [...own].filter((lemma) => WORDS[lemma]);
    const knownWords = words.slice(0, Math.round(words.length * 0.9));
    const unknown = words.filter((lemma) => !knownWords.includes(lemma));
    record(knownWords.map((lemma) => ({ concept: `w:${lemma}`, at: T0 - DAY, outcome: "right", test: "pick", skill: "read", activity: "see" })));
    const worked = pathLessons().filter((lesson) => lesson.worked);
    const shown = new Map(pathOverview(worked.length + 400, T0).lessons.map((lesson) => [lesson.id, lesson]));
    const open = worked.filter((lesson) => shown.get(lesson.id)?.state !== "done");
    const fresh = new Set(open.flatMap((lesson) => lesson.things.filter((thing) => own.has(thing.lemma) && !knownWords.includes(thing.lemma)).map((thing) => thing.lemma)));
    eq([...fresh].sort(), [...unknown].sort(), "the pack's own words left to teach");
    ok(worked.filter((lesson) => lesson.things.every((thing) => knownWords.includes(thing.lemma))).every((lesson) => shown.get(lesson.id)?.state === "done"), "a lesson of known words not behind you");
    const next = studyOverview(T0).lesson;
    const nextLesson = worked.find((lesson) => lesson.id === next?.id);
    ok(nextLesson && nextLesson.things.some((thing) => !knownWords.includes(thing.lemma)), `the next lesson: ${next?.id}`);
    // Each of them, planned, teaches only what's new: nothing you know as a new word.
    const plan = planSession("lesson", nextLesson.id, T0);
    const shownNew = plan.steps.filter((step) => step.isNew || step.meaning === "new").flatMap((step) => [step.unit, ...(step.news ?? []).map((key) => `w:${key}`)]).filter(Boolean);
    ok(shownNew.every((unit) => !knownWords.includes(unit.slice(2))), `a known word shown as new: ${shownNew.filter((unit) => knownWords.includes(unit.slice(2)))}`);
    return `${knownWords.length} known; ${open.length} of ${worked.length} lessons left; next ${nextLesson.title}`;
  }));

await test("where you are comes from what each path has taught: jumping to a topic pack's tenth lesson with only it on, then the lessons coming back, the next lesson is the lessons' first, not one past them", () =>
  withWeather(({ ids }) => {
    const worked = pathLessons().filter((lesson) => lesson.worked);
    // The jump: "No, just this lesson" puts your place there, and you play it.
    setPlace("nl", worked[9].id);
    doLesson(T0, worked[9].id);
    for (const id of ids) setPackOn(id, true);
    const lessons = pathLessons();
    const first = lessons.find((lesson) => !lesson.worked && !lesson.full);
    const next = studyOverview(T0 + DAY).lesson;
    eq(next?.id, first.id, `the next lesson (${next?.place})`);
    const here = pathOverview(20, T0 + DAY).lessons.find((lesson) => lesson.state === "here");
    eq(here?.id, first.id, "the path's here");
    return `${next.place}: ${next.title}`;
  }));

await test("worked-out units are named for what's in them: the word series' by the topic most of their words are about, never More words, no name twice", () => {
  const worked = pathLessons().filter((lesson) => lesson.worked);
  ok(worked.length, "no worked-out lessons");
  const units = [...new Map(worked.map((lesson) => [lesson.unit.id, lesson.unit.title])).values()];
  ok(units.every((title) => !/^(More words|The next words)/.test(title)), `named: ${units.filter((title) => /^More words/.test(title)).slice(0, 3)}`);
  eq(new Set(units).size, units.length, "a unit's name twice");
  const topicNames = new Set(PACKS.flatMap((name) => Object.values(read(name).topics ?? {})));
  ok(topicNames.has(units[0].replace(/ \d+$/, "")), `the first: ${units[0]}`);
  const stops = pathOverview(worked.length + 300, T0).lessons.filter((lesson) => worked.some((one) => one.id === lesson.id));
  ok(stops.length && stops.every((lesson) => lesson.title !== "The next words"), "a stop called The next words");
  return `${units.length} units: ${units.slice(0, 4).join(", ")} …`;
});

await test("when the written lessons are behind you, Study says so, and you can carry on with the worked-out ones", () => {
  const lessons = pathLessons().filter((one) => !one.worked);
  markLessonsDone(lessons.slice(0, -1));
  ok(!studyOverview(T0).writtenEnd, "said one lesson early");
  markLessonsDone(lessons.slice(-1));
  const study = studyOverview(T0);
  ok(study.writtenEnd, "not said");
  ok(!study.atEnd && study.lesson?.id.startsWith("words/"), `next: ${study.lesson?.id}`);
  ok(planSession("lesson", undefined, T0).lesson.worked, "the next lesson isn't a worked-out one");
});

await test("every choice is a form you've met: Fill the gap and a stray tile show a word as a lesson taught it, in every written lesson and the practice after it", () => {
  const lessons = pathLessons().filter((one) => !one.worked && !one.full);
  const bare = (text) => (typeof text === "string" ? text : text.text).replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "").toLocaleLowerCase();
  const taught = new Set();
  let fills = 0;
  let strays = 0;
  const check = (step, where) => {
    if (step.kind !== "fill" || !step.options) return;
    fills++;
    const right = bare(step.item.words[step.item.gap.index][0]);
    for (const option of step.options) if (bare(option) !== right) ok(taught.has(bare(option)), `${where} fill offers "${bare(option)}", a form not yet taught`);
  };
  for (const [at, lesson] of lessons.entries()) {
    if (at) markLessonsDone([lessons[at - 1]]);
    for (const thing of lesson.things) if (thing.lemma) for (const form of [taughtForm(thing), ...(thing.forms ?? [])]) taught.add(bare(form));
    for (const step of planSession("lesson", lesson.id, T0).steps) check(step, lesson.id);
    if (at % 10 === 9) {
      for (const step of planSession("practice", undefined, T0).steps) {
        check(step, `practice after ${lesson.id}`);
        if (step.item) {
          const stray = strayYouKnow(step.item);
          if (stray) {
            strays++;
            ok(taught.has(bare(stray)), `practice after ${lesson.id}: the stray tile "${stray}"`);
            ok(!step.item.words.some(([text]) => bare(text) === bare(stray)), `the stray tile "${stray}" is in the sentence`);
          }
        }
      }
    }
  }
  ok(fills >= 50, `only ${fills} fills`);
  return `${fills} fills, ${strays} stray tiles`;
});

await test("no working notes reach a screen: every word on every lesson's page, and every choice's words, read plainly", () => {
  const lessons = pathLessons().filter((one) => !one.worked && !one.full);
  let seen = 0;
  for (const lesson of lessons) {
    for (const thing of lesson.things) {
      seen++;
      for (const [where, text] of [["the page", meaningOfThing(thing)], ["a question", shownThing(thing).means]]) {
        ok(text, `${lesson.id} ${thing.text}: nothing on ${where}`);
        ok(!/[=;()]/.test(text), `${lesson.id} ${thing.text} on ${where}: "${text}"`);
      }
    }
  }
  eq(meaningOfThing(lessons.flatMap((lesson) => lesson.things).find((thing) => thing.lemma === "maken")), "to make");
  return `${seen} things`;
});

await test("a unit's full lesson: at its end, 25 questions across all of it in the harder games, choices only from it or what you know, and it's only done when it's done", () => {
  const lessons = pathLessons();
  const unit = lessons.filter((one) => one.unit?.id === lessons[0].unit.id);
  const full = unit.at(-1);
  ok(full.full && full.title === "Whole unit: Coffee and keys", full.title);
  eq(lessons[lessons.indexOf(full) + 1].n, unit.length, "a full lesson takes a number");
  const own = unit.filter((one) => !one.full);
  let at = T0;
  for (const lesson of own) at = doLesson(at, lesson.id) + DAY / 8;
  const next = studyOverview(at);
  eq(next.lesson.id, full.id, "not next");
  eq(next.lesson.name, full.title);
  const plan = planSession("lesson", undefined, at);
  const count = asked(plan.steps).length;
  ok(count >= 23 && count <= 27, `${count} questions: ${plan.steps.map((step) => step.kind)}`);
  const kinds = new Set(plan.steps.map((step) => step.kind));
  for (const hard of ["translate", "type", "arrange", "fill"]) ok(kinds.has(hard), `no ${hard}: ${[...kinds]}`);
  ok(!plan.steps.some((step) => step.isNew), "something new in a full lesson of what you've done");
  ok(plan.steps.filter((step) => step.kind === "match").length <= 2, "more than 2 Matches");
  const covered = new Set(plan.steps.flatMap((step) => (step.item ? lemmasOf(step.item) : [step.target, ...(step.words ?? [])])).filter(Boolean));
  const lemmas = full.things.map((thing) => thing.lemma).filter(Boolean);
  const share = lemmas.filter((word) => covered.has(word)).length / lemmas.length;
  ok(share >= 0.7, `only ${Math.round(share * 100)}% of the unit's words`);
  const ownWords = new Set(full.things.flatMap((thing) => [thing.lemma ?? thing.phrase, shownThing(thing).text]));
  eq(outsiders(plan, full, (key) => ownWords.has(key)), [], full.id);
  eq(lessonsSkippedBy(lessons[lessons.indexOf(full) + 1].id, at), [], "going past only a full lesson asks something");
  ok(pathOverview(30, at).lessons[own.length].state === "here", "it isn't where you are");
  finishedLesson(full.id, at + 1000);
  eq(pathOverview(30, at + 2000).lessons[own.length].state, "done");
  eq(studyOverview(at + 2000).lesson.n, own.length + 1);
  return `${count} questions, ${Math.round(share * 100)}% of its words: ${[...kinds]}`;
});

await test("jumping to a full lesson from nothing asks to mark what's skipped; saying no, it shows what it can, and the lessons stay skipped", () => {
  const lessons = pathLessons();
  const full = lessons.find((one) => one.full);
  const at = lessons.indexOf(full);
  eq(lessonsSkippedBy(full.id, T0).length, lessons.slice(0, at).filter((one) => one.kind !== "idea").length);
  const plan = planSession("lesson", full.id, T0);
  ok(asked(plan.steps).length >= 15, `${asked(plan.steps).length} questions`);
  ok(plan.steps.some((step) => step.isNew), "nothing first shown");
  ok(plan.steps.find((step) => step.item || step.options)?.isNew, "it asks before it's shown");
  setPlace("nl", full.id);
  ok(pathOverview(30, T0).lessons.slice(0, at).every((one) => one.state === (one.kind === "idea" ? "open" : "skipped")), "they aren't skipped");
  // A jump to the unit's last lesson, done: what's next is the next unit, not the whole of one you skipped most of.
  setPlace("nl", lessons[at - 1].id);
  const end = doLesson(T0, lessons[at - 1].id);
  eq(studyOverview(end).lesson.id, lessons[at + 1].id);
});

await test("a quick session with nothing studied and one game alone on plans only steps its screens can draw (Which one is it?, Which word is it?, Translate)", () => {
  const ways = Object.keys(WAYS);
  const notes = [];
  try {
    for (const only of ways) {
      for (const way of ways) setStudySetting(`quick.include.${way}`, way === only);
      const plan = planSession("quick", undefined, T0);
      for (const step of plan.steps) {
        const what = `${only} alone: ${step.kind} ${JSON.stringify({ ...step, item: step.item?.id }).slice(0, 160)}`;
        if (step.kind === "see" || step.kind === "word") ok(step.unit && Array.isArray(step.options) && step.options.length >= 2, what);
        else if (step.kind === "translate") ok(step.item && Array.isArray(step.tiles) && step.tiles.length && Array.isArray(step.answer), what);
        else if (step.kind !== "match") ok(step.item || step.unit, what);
      }
      ok(plan.steps.length || plan.empty, `${only} alone: no steps, and nothing says why`);
      notes.push(`${only} ${plan.steps.length}`);
    }
  } finally {
    for (const way of ways) setStudySetting(`quick.include.${way}`, true);
  }
  return notes.join(", ");
});

await test("Choose the games reaches a lesson: each game alone on, it asks that game, and every new thing still gets its first showing", () => {
  const ways = Object.keys(WAYS);
  try {
    for (const only of ways) {
      for (const way of ways) setStudySetting(`quick.include.${way}`, way === only);
      const lesson = planSession("lesson", undefined, T0);
      const shown = new Set(lesson.steps.flatMap((step) => [step.unit, ...(step.news ?? []).flatMap((key) => [`w:${key}`, `c:${key}`])]));
      for (const unit of lesson.lesson.units) if (conceptState(unit).isNew) ok(shown.has(unit) || lesson.steps.some((step) => step.item && sentenceUnits(step.item).includes(unit)), `${only} alone: ${unit} isn't shown: ${lesson.steps.map((step) => step.kind)}`);
      for (const step of lesson.steps) ok(step.kind === (only === "cards" ? "card" : only) || step.kind === "meet" || (step.kind === "see" && step.isNew), `${only} alone, the lesson asks ${step.kind}${step.isNew ? " (new)" : ""}`);
      ok(lesson.steps.length >= lesson.lesson.units.filter((unit) => conceptState(unit).isNew).length, `${only} alone: ${lesson.steps.length} questions`);
    }
    // With a game off and the rest on, its turns go to the others, the lesson as long as before.
    for (const way of ways) setStudySetting(`quick.include.${way}`, true);
    setStudySetting("quick.include.translate", false);
    const without = planSession("lesson", undefined, T0);
    ok(!without.steps.some((step) => step.kind === "translate"), "translate is off");
    ok(without.steps.filter((step) => step.kind !== "meet").length >= 12, `${without.steps.length} questions`);
    ok(without.steps.some((step) => step.kind === "arrange"), `its turns went to: ${without.steps.map((step) => step.kind)}`);
    // Practice, each alone, after a lesson: never empty.
    for (const way of ways) setStudySetting(`quick.include.${way}`, true);
    const at = doLesson(T0);
    for (const only of ways) {
      for (const way of ways) setStudySetting(`quick.include.${way}`, way === only);
      ok(planSession("practice", undefined, at).steps.length >= 1, `${only} alone: an empty practice`);
    }
  } finally {
    for (const way of ways) setStudySetting(`quick.include.${way}`, true);
  }
});

await test("a game that can't be played becomes another on the same sentence or word; Repeat after keeps the half that's left; with nothing else on, it's still asked", () => {
  const at = doLesson(T0);
  const plan = planSession("practice", undefined, at);
  const item = plan.steps.find((step) => step.item)?.item;
  ok(item, "no sentence in the practice");
  const listening = plan.instead({ kind: "listen", item }, new Set(["listen", "repeat"]));
  ok(listening.item === item && !["listen", "repeat"].includes(listening.kind), `Listening became ${listening?.kind}`);
  const saying = plan.instead({ kind: "say", item }, new Set(["say", "repeat"]));
  ok(saying.item === item && !["say", "repeat"].includes(saying.kind), `Say it became ${saying?.kind}`);
  eq(plan.instead({ kind: "repeat", item }, new Set(["listen", "repeat"])).kind, "say");
  eq(plan.instead({ kind: "repeat", item }, new Set(["say", "repeat"])).kind, "listen");
  ok(!["listen", "repeat", "say"].includes(plan.instead({ kind: "repeat", item }, new Set(["say", "listen", "repeat"])).kind), "both gone, still a sound game");
  eq(plan.instead({ kind: "match", words: [], phrases: [] }, new Set(["match"])), null);
  const word = plan.steps.find((step) => step.kind === "see" || step.kind === "word");
  if (word) ok(plan.instead(word, new Set([word.kind]))?.unit === word.unit, "a word's question lost its word");
  const ways = Object.keys(WAYS);
  try {
    for (const way of ways) setStudySetting(`quick.include.${way}`, way === "listen");
    const fewer = planSession("practice", undefined, at);
    const floor = fewer.instead({ kind: "listen", item }, new Set(["listen", "repeat"]));
    ok(floor?.item === item && floor.kind !== "listen", `with nothing else on: ${floor?.kind}`);
  } finally {
    for (const way of ways) setStudySetting(`quick.include.${way}`, true);
  }
});

await test("a drawn word a sentence taught gets its picture question too, in a turn something was coming back anyway, and the lesson's no longer for it", () => {
  const drawn = ["coffee", "tea", "water", "milk"];
  const questions = (steps) => steps.filter((step) => step.kind !== "meet").length;
  const pictured = (steps) => steps.filter((step) => step.kind === "see" && step.options.every((option) => option.picture));
  try {
    setPictures(() => false);
    const words = planSession("lesson", undefined, T0).steps;
    eq(pictured(words).length, 0, "no drawings, no picture questions");
    setPictures((concept) => drawn.includes(concept));
    const steps = planSession("lesson", undefined, T0).steps;
    const answers = pictured(steps).map((step) => step.options[step.correct].key);
    eq(answers.filter((key) => key === "melk").length, 1, `picture answers: ${answers}`);
    for (const key of ["koffie", "thee", "water"]) eq(answers.filter((one) => one === key).length, 1, `${key} in ${answers}`);
    eq(steps.slice(0, 3).map((step) => step.options[step.correct].key), ["koffie", "thee", "water"], "the opening stays as it was");
    const sentence = steps.findIndex((step) => step.news?.includes("melk"));
    const picture = steps.findIndex((step) => step.kind === "see" && step.target === "melk");
    ok(sentence >= 0 && sentence < picture, `its sentence teaches it first: ${sentence}, then its picture: ${picture}`);
    ok(!steps[picture].isNew, "by then it's not new");
    eq(questions(steps), questions(words), "the same length with drawings or without");
    // Every written lesson: as long as it was, and each word asked in pictures once at most.
    setPictures(() => true);
    const withDrawings = pathLessons().filter((one) => !one.worked && !one.full).map((lesson) => {
      const planned = planSession("lesson", lesson.id, T0).steps;
      const units = pictured(planned).map((step) => step.unit);
      eq(new Set(units).size, units.length, `${lesson.id} asks a word in pictures twice: ${units}`);
      return [lesson.id, questions(planned)];
    });
    setPictures(() => false);
    for (const [id, count] of withDrawings) eq(count, questions(planSession("lesson", id, T0).steps), `${id}'s length changed with drawings`);
    return `lesson 1 asks ${answers.join(", ")} in pictures, ${questions(steps)} questions`;
  } finally {
    setPictures(null);
  }
});

await test("every lesson says what it teaches: its new words as taught, its idea, or both, on the path and the path's overview", () => {
  const lessons = pathLessons();
  const first = lessons[0];
  eq(first.kind, "words");
  eq(first.teaches.words.slice(0, 4), ["koffie", "thee", "water", "melk"]);
  eq(first.teaches.idea, null);
  ok(first.teaches.line.startsWith("New words: koffie, thee, water, melk"), first.teaches.line);
  const both = lessons.find((lesson) => lesson.concept && !lesson.full);
  eq(both.kind, "both");
  ok(both.teaches.idea?.name && both.teaches.line.includes(`A new idea: ${both.teaches.idea.name}`), both.teaches.line);
  // A word taught in a new form is taught as that form (ligt, not liggen).
  const formed = lessons.find((lesson) => lesson.things.some((thing) => thing.lemma && taughtForm(thing) !== thing.lemma));
  const thing = formed.things.find((one) => one.lemma && taughtForm(one) !== one.lemma);
  ok(formed.teaches.words.includes(taughtForm(thing)), `${formed.id}: ${formed.teaches.words} lacks ${taughtForm(thing)}`);
  const shown = pathOverview(10, T0).lessons;
  ok(shown.every((lesson) => lesson.kind && lesson.teaches?.line), "the overview carries kind and teaches");
  ok(lessons.filter((lesson) => !lesson.full).every((lesson) => lesson.teaches.line), "a lesson with nothing to say it teaches");
  return `${first.teaches.line} | ${both.id}: ${both.teaches.line}`;
});

// A lesson of one idea, on sentences you've met: the path with one put in after its fourth lesson, as Dutch's will have.
async function withIdeaLesson(fn) {
  const own = pathLessons().find((lesson) => lesson.kind === "idea" && lesson.concept.pattern === "present");
  if (own) return fn(own);
  const pack = read("path-nl.json");
  const items = pack.lessons.slice(0, 4).flatMap((lesson) => lesson.items).filter((id) => pack.items.find((item) => item.id === id)?.concepts?.includes("present"));
  const idea = { id: "idea-present", title: "I drink, you drink", unit: pack.lessons[0].unit, words: [], phrases: [], concept: { pattern: "present", line: "A verb's ending changes with who does it." }, items: items.slice(0, 6) };
  const saved = await savePack({ ...pack, lessons: [...pack.lessons.slice(0, 4), idea, ...pack.lessons.slice(4)] });
  ok(saved.ok, JSON.stringify(saved.errors?.slice(0, 2)));
  try {
    return await fn(pathLessons().find((lesson) => lesson.id.endsWith("/idea-present")));
  } finally {
    await savePack(pack);
  }
}

await test("a lesson of one idea: its sentence, then the idea, then questions on it, about ten, and it says what it teaches", () =>
  withIdeaLesson((idea) => {
    ok(idea, "the idea lesson isn't on the path");
    eq([idea.kind, idea.teaches.words.length, idea.teaches.idea?.name], ["idea", 0, PATTERNS.present?.name]);
    ok(idea.teaches.line.startsWith("A new idea: "), idea.teaches.line);
    markLessonsDone(pathLessons().slice(0, pathLessons().indexOf(idea)).filter((lesson) => !lesson.full));
    const plan = planSession("lesson", idea.id, T0);
    eq(plan.lesson.id, idea.id);
    const steps = plan.steps;
    const meet = steps.findIndex((step) => step.kind === "meet");
    ok(meet >= 1 && meet <= 2, `the idea comes after its first sentence: ${steps.map((step) => step.kind)}`);
    ok(steps[meet - 1].item?.concepts.includes("present"), "the sentence before it shows it");
    const questions = steps.filter((step) => step.kind !== "meet");
    ok(questions.length >= 8 && questions.length <= 12, `${questions.length} questions`);
    const onIt = questions.filter((step) => step.item?.concepts?.includes("present")).length;
    ok(onIt >= questions.length - 1, `questions on its idea: ${onIt} of ${questions.length}`);
    return steps.map((step) => step.kind).join(", ");
  }));

// The path's lesson of one idea on whose words are whose (4 sentences of its own), reached the way a learner reaches it: every lesson before it played.
function reachIdea(pattern) {
  const idea = pathLessons().find((lesson) => lesson.kind === "idea" && lesson.concept.pattern === pattern);
  if (!idea) throw new Error(`no lesson of one idea on ${pattern}`);
  return { idea, at: reach(idea) };
}
// Every lesson before this one played, in order, from T0; the time after them.
function reach(lesson, from = 0, at = T0) {
  const lessons = pathLessons();
  for (const one of lessons.slice(from, lessons.indexOf(lesson))) if (!one.full) at = doLesson(at, one.id) + 60_000;
  return at;
}

await test("a lesson of one idea asks in several games, on its own sentences and, with few of those, on more that show the idea in words you've been taught; every step after the idea carries it (for See the idea again)", () => {
  const notes = [];
  // Possessives come before "ons" and the rest are taught: its own 4 are all there is. "geen" comes late enough to have more.
  for (const pattern of ["possessive", "geen"]) {
    const { idea, at } = reachIdea(pattern);
    const lessons = pathLessons();
    const taught = new Set(lessons.slice(0, lessons.indexOf(idea)).flatMap((lesson) => lesson.things.map((thing) => thing.lemma).filter(Boolean)));
    const readable = (item) => lemmasOf(item).every((word) => taught.has(word) || !WORDS[word]) && !isNotFirst(item);
    const more = ITEMS.filter((item) => item.concepts?.includes(pattern) && !idea.items.includes(item.id) && item.words.length > 1 && readable(item)).length;
    const steps = planSession("lesson", idea.id, at).steps;
    const meet = steps.findIndex((step) => step.kind === "meet");
    ok(meet >= 1, `${pattern}: no idea shown: ${steps.map((step) => step.kind)}`);
    const questions = steps.slice(meet + 1);
    const sentences = new Set(steps.map((step) => step.item?.id).filter(Boolean));
    ok(idea.items.every((id) => sentences.has(id)), `${pattern}: its own sentences not all asked: ${[...sentences]}`);
    eq(sentences.size, Math.min(8, idea.items.length + more), `${pattern}: sentences asked about (its own ${idea.items.length}, ${more} more readable)`);
    ok(steps.every((step) => !step.item || (step.item.concepts.includes(pattern) && (idea.items.includes(step.item.id) || readable(step.item)))), `${pattern}: a sentence that doesn't show the idea, or holds a word from further on`);
    const games = new Set(questions.map((step) => step.kind));
    ok(games.size >= 3, `${pattern}: games: ${[...games]}`);
    const { name, line } = steps[meet].concept;
    for (const step of questions) eq(step.idea, { pattern, name, item: steps[meet].item.id, ...(line ? { line } : {}) }, `${pattern}: step ${step.kind}`);
    ok(idea.items.includes(steps[meet].item.id), `${pattern}: shown with a sentence not its own`);
    ok(steps.slice(0, meet).every((step) => !step.idea), `${pattern}: the idea before it's shown`);
    notes.push(`${pattern} ${sentences.size} sentences (${idea.items.length} its own), ${questions.length} questions: ${[...games].join(", ")}`);
  }
  return notes.join("; ");
});

await test("the practice right after a lesson of one idea opens on that idea, its steps carrying it; one practice later it doesn't", () => {
  const { idea, at } = reachIdea("possessive");
  const end = doLesson(at, idea.id) + 60_000;
  const plan = planSession("practice", undefined, end);
  const lead = plan.steps.slice(0, 4);
  ok(lead.every((step) => step.item?.concepts?.includes("possessive") && step.idea?.pattern === "possessive"), `the first steps: ${lead.map((step) => `${step.kind} ${step.item?.id} ${step.idea?.pattern ?? "-"}`)}`);
  ok(plan.steps.slice(4).every((step) => !step.idea || step.item?.concepts?.includes("possessive")), "the idea on a step that doesn't show it");
  finishedPractice(end + 600_000);
  const next = planSession("practice", undefined, end + 700_000);
  ok(!next.steps.some((step) => step.idea), `the next practice still leads with it: ${next.steps.filter((step) => step.idea).length}`);
  return `${lead.map((step) => step.kind).join(", ")}`;
});

await test("the practice right after a lesson that brings an idea with its new words opens on that idea too, its steps carrying it; one practice later it doesn't", async () => {
  // The path's first lessons that bring an idea beside their words, each reached as a learner reaches it: every lesson before it played.
  const lessons = pathLessons();
  const bringing = lessons.filter((lesson) => lesson.kind !== "idea" && !lesson.full && lesson.concept).slice(0, 4);
  ok(bringing.length === 4, `lessons that bring an idea with their words: ${bringing.map((lesson) => lesson.id)}`);
  const notes = [];
  for (const lesson of bringing) {
    await clearProgress();
    clearFinished();
    const { pattern } = lesson.concept;
    let at = T0;
    for (const one of lessons.slice(0, lessons.indexOf(lesson))) if (!one.full) at = doLesson(at, one.id) + 60_000;
    const end = doLesson(at, lesson.id) + 60_000;
    const plan = planSession("practice", undefined, end);
    const leading = plan.steps.findIndex((step) => step.idea?.pattern !== pattern);
    const lead = plan.steps.slice(0, leading < 0 ? plan.steps.length : leading);
    ok(lead.length >= 2, `${lesson.id} (${pattern}): the practice after it opens with ${lead.length} on its idea: ${plan.steps.slice(0, 4).map((step) => `${step.kind} ${step.item?.id ?? step.unit} ${step.idea?.pattern ?? "-"}`)}`);
    ok(lead.every((step) => step.item?.concepts?.includes(pattern)), `${lesson.id}: a step carrying ${pattern} on a sentence that doesn't show it`);
    ok(lead.every((step) => lesson.items.includes(step.idea.item)), `${lesson.id}: the idea carried with a sentence not the lesson's own`);
    finishedPractice(end + 600_000);
    const next = planSession("practice", undefined, end + 700_000);
    ok(!next.steps.some((step) => step.idea), `${lesson.id}: the next practice still leads with it`);
    notes.push(`${lesson.id} ${pattern} ${lead.length}`);
  }
  return notes.join("; ");
});

// Whether tiles hold every word of a line, as many times as it has it.
function holds(tiles, words) {
  const left = [...tiles];
  return words.every((word) => {
    const at = left.indexOf(word);
    if (at >= 0) left.splice(at, 1);
    return at >= 0;
  });
}

await test("a reworded sentence's game takes its word-for-word English too wherever that's acceptable English (every line judged: scripts/fixtures/literal-judged.nl.json), its words among the tiles; one that isn't, only the English; a line not judged fails", () => {
  const fixture = JSON.parse(readFileSync(join(APP, "scripts/fixtures/literal-judged.nl.json"), "utf8"));
  // The game's file is what the judged lines give (scripts/literal-ok.mjs writes it).
  eq(readFileSync(join(APP, "public/js/lang/literal-ok.nl.js"), "utf8") === literalOkText(fixture), true, "literal-ok.nl.js isn't what the fixture gives: run node scripts/literal-ok.mjs");
  const judged = fixture["path-nl"];
  const own = (item) => item.id.slice(item.pack.length + 1);
  const lower = (words) => words.map((word) => (word === "I" ? word : word.toLowerCase())).join(" ");
  const reworded = ITEMS.filter((item) => item.pack === "path-nl" && rewordingOf(item));
  ok(reworded.length >= 100, `only ${reworded.length} reworded sentences`);
  const unjudged = [];
  const wrong = [];
  let takes = 0;
  for (const item of reworded) {
    const line = wordForWord(item).map(([text]) => text).join(" ");
    const verdict = judged[own(item)]?.[line];
    if (typeof verdict !== "boolean") {
      unjudged.push(`${own(item)} "${line}"`);
      continue;
    }
    const step = translateStep(item, reworded, []);
    if (!holds(step.tiles, step.answer)) wrong.push(`${own(item)}: the English's words aren't all tiles`);
    if (!verdict) {
      if (step.also) wrong.push(`${own(item)}: takes "${step.also.join(" ")}", judged not English`);
      continue;
    }
    if (lower(englishTiles(line)) === lower(step.answer)) continue;
    takes++;
    if (!step.also) wrong.push(`${own(item)}: "${line}" judged English, not taken`);
    else if (lower(step.also) !== lower(englishTiles(line))) wrong.push(`${own(item)}: takes "${step.also.join(" ")}" for "${line}"`);
    else if (!holds(step.tiles, step.also)) wrong.push(`${own(item)}: "${line}" can't be built from ${step.tiles.join(" ")}`);
  }
  ok(!unjudged.length, `${unjudged.length} reworded lines not judged: ${unjudged.slice(0, 6).join("; ")}`);
  ok(!wrong.length, `${wrong.length} wrong: ${wrong.slice(0, 6).join("; ")}`);
  ok(takes >= 100, `only ${takes} take their word-for-word line`);
  // The one that started it: "Ik drink een koffie." is "I'm having a coffee", and "I drink a coffee" is right too.
  const coffee = ITEMS.find((item) => item.id === "path-nl/l002-3");
  eq(translateStep(coffee, [], []).also, ["I", "drink", "a", "coffee"], "l002-3");
  // And a lesson's own translate steps carry it.
  const lessons = pathLessons();
  let at = T0;
  const carried = [];
  for (const lesson of lessons.slice(0, 4)) {
    const steps = planSession("lesson", lesson.id, at).steps;
    for (const step of steps.filter((one) => one.kind === "translate")) {
      const yes = judged[own(step.item)]?.[wordForWord(step.item).map(([text]) => text).join(" ")] === true && rewordingOf(step.item);
      if (yes) ok(step.also && holds(step.tiles, step.also), `${lesson.id}: ${own(step.item)} without its word-for-word answer`);
      else ok(!step.also, `${lesson.id}: ${own(step.item)} takes ${step.also}`);
      if (yes) carried.push(own(step.item));
    }
    at = doLesson(at, lesson.id) + 60_000;
  }
  ok(carried.length, "no lesson of the first four asked a sentence that takes its word-for-word line");
  return `${reworded.length} reworded, ${takes} take their word-for-word line too; in lessons 1–4: ${[...new Set(carried)].join(", ")}`;
});

await test("an idea told in parts (lang/idea-parts.nl.js) never names a word you haven't met: its lesson's card is called and says its first part; the lesson that brings a later part's words shows that part after a sentence with them, the card's name and words every part you know, and the steps after carry it", async () => {
  const notes = [];
  const lessons = pathLessons();
  const named = (id) => {
    const found = lessons.find((lesson) => lesson.id.endsWith(`/${id}`));
    if (!found) throw new Error(`no lesson ${id}`);
    return found;
  };
  const cases = [
    {
      pattern: "possessive",
      first: ["mijn: words for belonging", "mijn: my"],
      later: [
        ["l015", ["je"], "mijn, je: words for belonging", "mijn: my; je: your"],
        ["l054", ["ons"], "mijn, je, ons: words for belonging", "mijn: my; je: your; ons: our"],
      ],
    },
    {
      pattern: "demonstrative",
      first: ["dit, dat: this and that", "dit and dat: this and that with het-words"],
      later: [["l031", ["deze", "die"], "dit, dat, deze, die: this and that", "dit and dat: this and that with het-words; deze and die: with de-words"]],
    },
  ];
  for (const { pattern, first: [firstName, first], later } of cases) {
    await clearProgress();
    clearFinished();
    const { idea, at } = reachIdea(pattern);
    const steps = planSession("lesson", idea.id, at).steps;
    const meet = steps.findIndex((step) => step.kind === "meet");
    eq([steps[meet]?.concept.name, steps[meet]?.concept.line], [firstName, first], `${pattern}'s own lesson`);
    ok(steps.slice(meet + 1).every((step) => step.idea?.name === firstName && step.idea.line === first), `${pattern}'s own lesson: a step without its card`);
    let end = doLesson(at, idea.id) + 60_000;
    let from = lessons.indexOf(idea) + 1;
    for (const [id, words, name, line] of later) {
      const lesson = named(id);
      end = reach(lesson, from, end);
      from = lessons.indexOf(lesson);
      const plan = planSession("lesson", lesson.id, end).steps;
      const shown = plan.filter((step) => step.kind === "meet" && step.concept.pattern === pattern);
      eq(shown.length, 1, `${id}: ${pattern}'s part shown`);
      const i = plan.indexOf(shown[0]);
      eq([shown[0].concept.name, shown[0].concept.line], [name, line], id);
      const before = plan[i - 1];
      ok(before?.item?.id === shown[0].item.id && before.item.concepts.includes(pattern) && lemmasOf(before.item).some((word) => words.includes(word)), `${id}: shown after ${before?.kind} ${before?.item?.id}`);
      const after = plan.slice(i + 1);
      const next = after.findIndex((step) => step.kind === "meet");
      ok((next < 0 ? after : after.slice(0, next)).every((step) => step.idea?.pattern === pattern && step.idea.name === name && step.idea.line === line), `${id}: a step after it without its card`);
      notes.push(`${id} shows ${pattern}'s next part at step ${i + 1} of ${plan.length}`);
    }
  }
  return notes.join("; ");
});

await test("an idea lesson behind where you are is open, never skipped: no gap, nothing to mark, and the unit's whole lesson doesn't wait on it", () =>
  withIdeaLesson((idea) => {
    const lessons = pathLessons();
    const at = lessons.indexOf(idea);
    // Someone who'd done the lessons around it before it came: the new one sits behind them.
    markLessonsDone(lessons.slice(0, at + 5).filter((lesson) => lesson !== idea && !lesson.full));
    const shown = pathOverview(20, T0).lessons;
    eq(shown[at].state, "open");
    ok(!shown.some((lesson) => lesson.state === "skipped"), `skipped: ${shown.filter((lesson) => lesson.state === "skipped").map((lesson) => lesson.id)}`);
    const later = lessons.find((lesson, i) => i > at + 6 && !lesson.full && lesson.kind !== "idea");
    ok(!lessonsSkippedBy(later.id).includes(idea), "jumping on counts it as skipped");
    // It can still be started from where it is, and done.
    eq(planSession("lesson", idea.id, T0).lesson.id, idea.id);
    // The unit's whole lesson comes once its lessons of words are done, the idea or not.
    const unit = lessons.filter((lesson) => lesson.unit?.id === idea.unit.id);
    markLessonsDone(unit.filter((lesson) => !lesson.full && lesson !== idea));
    const full = unit.find((lesson) => lesson.full);
    ok(pathOverview(40, T0).lessons.find((lesson) => lesson.id === full.id).state !== "skipped", "the whole lesson is skipped");
    return `${idea.id} at ${at + 1}: open`;
  }));

await test("a pack you add with its own units comes right after the unit you're in, and stays there as you go on; its units and whole lessons are its own", async () => {
  const fixture = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
  const pack = {
    ...fixture,
    id: "check-units",
    name: "A pack with units",
    units: [{ id: "park", title: "At the park" }, { id: "family", title: "Family" }],
    lessons: [
      { id: "ball", title: "Playing ball", unit: "park", words: [{ lemma: "bal", forms: ["balletje"], means: "the ball" }, { lemma: "spelen", forms: ["speelt"], means: "to play" }], phrases: [], concept: null, items: ["balletje"] },
      { id: "grandma", title: "Calling grandma", unit: "family", words: [{ lemma: "oma", forms: ["oma"], means: "grandma" }], phrases: [], concept: null, items: ["oma-gebeld", "eet-smakelijk"] },
    ],
  };
  const before = pathLessons();
  const second = before.find((lesson) => lesson.unit.id !== before[0].unit.id);
  setPlace("nl", second.id);
  const saved = await savePack(pack);
  ok(saved.ok !== false, JSON.stringify(saved.errors?.slice(0, 2)));
  try {
    const lessons = pathLessons();
    const units = lessons.map((lesson) => lesson.unit.id).filter((id, i, all) => id !== all[i - 1]);
    const at = units.indexOf(second.unit.id);
    eq(units.slice(at, at + 3), [second.unit.id, "check-units/park", "check-units/family"], "its units, right after yours");
    ok(lessons.some((lesson) => lesson.full && lesson.unit.id === "check-units/park"), "its unit has no whole lesson");
    eq(lessons.find((lesson) => lesson.id === "check-units/ball").teaches.words, ["balletje", "speelt"]);
    // Going on doesn't move it: it stays after the unit you were in when it came.
    const later = lessons.find((lesson) => lesson.unit.id === units[at + 4]);
    setPlace("nl", later.id);
    await savePack({ ...pack, name: "A pack with units, again" });
    const again = pathLessons().map((lesson) => lesson.unit.id).filter((id, i, all) => id !== all[i - 1]);
    eq(again.slice(at, at + 3), [second.unit.id, "check-units/park", "check-units/family"], "it moved when you went on");
    // Its lessons count in the path's numbering and its own units'.
    const ball = pathLessons().find((lesson) => lesson.id === "check-units/ball");
    eq([ball.inUnit, typeof ball.n], [1, "number"]);
    return `after ${second.unit.title}: ${units.slice(at + 1, at + 3).join(", ")}`;
  } finally {
    await deletePack("check-units");
  }
});

await test("where a pack you added goes syncs, and a place set on this device stays when another device's newer record comes", () => {
  setAnchor("nl", "pack-a", "path-nl/where-you-live");
  const sent = pathSync.records().nl;
  eq(sent.value.anchors, { "pack-a": "path-nl/where-you-live" });
  // Another device, later: its place, and a pack it placed; this device's own place for pack-a stays.
  pathSync.apply({ nl: { at: sent.at + 1000, value: { lesson: "path-nl/l010", anchors: { "pack-a": "path-nl/a-day-off", "pack-b": null } } } });
  eq([anchorOf("nl", "pack-a"), anchorOf("nl", "pack-b"), anchorOf("nl", "pack-c")], ["path-nl/where-you-live", null, undefined]);
  ok(pathSync.check(pathSync.records().nl, "nl"), "its own record doesn't pass its check");
});

await test("a word with no picture in its lesson gets its language's map's (pictures.js), on the path and in Practice, once the map is in", async () => {
  const worked = pathLessons().find((lesson) => lesson.worked && lesson.things.some((thing) => thing.lemma));
  const lemma = worked.things.find((thing) => thing.lemma).lemma;
  ok(!worked.things.find((thing) => thing.lemma === lemma).picture, `${lemma} has a picture before any map`);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).endsWith("/pictures/words.nl.json") ? new Response(JSON.stringify({ language: "nl", words: { [lemma]: "bicycle", koffie: "tea" } }), { status: 200, headers: { "content-type": "application/json" } }) : realFetch(url));
  try {
    eq(await refreshPictures("nl"), true);
    const again = pathLessons().find((lesson) => lesson.id === worked.id).things.find((thing) => thing.lemma === lemma);
    eq(again.picture, "bicycle", "the path's word");
    // A lesson's own picture stays: the map only fills in.
    eq(pathLessons()[0].things.find((thing) => thing.lemma === "koffie").picture, "coffee");
    return `${lemma} → ${again.picture}`;
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test("a drawing a lesson's own picture names is kept for offline with no words line naming it (pictures.js keepPicturesForOffline reads the lessons studying draws on)", async () => {
  // path-nl's lessons as the content view has them, an empty words map, and one drawing no lesson names: every lesson's drawing kept, that one not.
  const drawn = [...new Set(LESSONS.flatMap((lesson) => (lesson.words ?? []).map((word) => word.picture)).filter((id) => typeof id === "string"))];
  ok(drawn.length >= 20, `only ${drawn.length} lesson drawings in path-nl`);
  const ids = [...drawn, "no-lesson-draws-this"];
  const names = ["fetch", "caches", "requestIdleCallback"];
  const saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const stored = new Map();
  const asked = [];
  try {
    globalThis.caches = { open: async () => ({ match: async (url) => stored.get(url), put: async (url, response) => stored.set(url, response), keys: async () => [], delete: async () => false }) };
    globalThis.requestIdleCallback = (fn) => setImmediate(() => fn({ timeRemaining: () => 50 }));
    globalThis.fetch = async (url) => {
      if (url === "/pictures/manifest.json") return Response.json({ pictures: Object.fromEntries(ids.map((id) => [id, { file: `${id}.svg`, h: "t" }])) });
      if (url === "/pictures/words.nl.json") return Response.json({ language: "nl", words: {} });
      asked.push(String(url));
      return new Response("<svg/>");
    };
    // Its own copy of pictures.js (a fresh list and words), on the content view this test has.
    const { keepPicturesForOffline } = await import("../public/js/study/pictures.js?lesson-drawings");
    const result = await keepPicturesForOffline("nl");
    eq(drawn.filter((id) => !asked.includes(`/pictures/${id}.svg?h=t`)), [], "lesson drawings not kept");
    ok(!asked.includes("/pictures/no-lesson-draws-this.svg?h=t"), "a drawing no lesson and no words line names was kept");
    return `${drawn.length} lesson drawings kept with an empty words map (${result.kept} kept)`;
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    // That copy said which drawings exist (setPictures) for its stand-in list: back to the default.
    setPictures(null);
  }
});

await test("Practice this slips in up to 3 questions on its concept, none on a sentence the session still has coming, and nothing when there's nothing to ask", () => {
  const end = doLesson(T0);
  const unit = "p:present";
  const steps = slipInSteps(unit, { now: end });
  ok(steps.length >= 1 && steps.length <= 3, `${steps.length} questions`);
  ok(steps.every((step) => step.slipped === unit && step.kind !== "meet" && step.item?.concepts.includes("present")), JSON.stringify(steps.map((step) => [step.kind, step.item?.id])));
  const have = new Set(steps.map((step) => step.item.id));
  ok(slipInSteps(unit, { have, now: end }).every((step) => !have.has(step.item.id)), "it asks again what the session has coming");
  const every = new Set(planSession("concept", unit, end).steps.map((step) => step.item?.id).filter(Boolean));
  eq(slipInSteps(unit, { have: every, now: end }).length, 0, "with every sentence already coming");
  eq(slipInSteps("p:no-such-thing", { now: end }).length, 0);
  return steps.map((step) => step.kind).join(", ");
});

await test("a picture question's wrong choices are ones with a story first, when they're as fair as the rest: never over this lesson's own, never another kind", () => {
  setPictures(() => true);
  try {
    const thing = (lemma, picture, article = "de") => ({ unit: `w:${lemma}`, lemma, text: lemma, means: `the ${lemma}`, ...(article ? { article } : {}), picture, forms: [lemma] });
    const entry = (one, own = false) => ({ key: one.lemma, thing: one, own, ...shownThing(one) });
    const answer = entry(thing("bed", "bed"), true);
    const known = ["stoel", "tafel", "lamp", "deur", "bank", "kast", "raam", "fiets"].map((lemma) => entry(thing(lemma, lemma)));
    const pool = [answer, ...known];
    const without = seeStep(answer, pool).options.map((option) => option.key);
    setStories((id) => id === "deur" || id === "bank");
    const withStories = seeStep(answer, pool).options.map((option) => option.key);
    ok(withStories.includes("deur") && withStories.includes("bank"), `the storied ones aren't offered: ${withStories}`);
    // This lesson's own still come first: a story never beats them.
    const own = entry(thing("kast", "kast"), true);
    const fairer = seeStep(answer, [answer, own, ...known.filter((one) => one.key !== "kast")]).options.map((option) => option.key);
    ok(fairer.includes("kast"), `this lesson's own word left out for a story: ${fairer}`);
    // A word of another kind isn't made fairer by its story.
    setStories((id) => id === "lopen");
    const verb = { ...entry(thing("lopen", "lopen", null)) };
    const kinds = seeStep(answer, [answer, verb, ...known]).options.map((option) => option.key);
    ok(!kinds.includes("lopen"), `a verb with a story offered against a noun: ${kinds}`);
    return `${without.join(", ")} → ${withStories.join(", ")}`;
  } finally {
    setPictures(null);
    setStories(null);
  }
});

await test("two words sharing a drawing never share a screen, and a wrong choice is never the answer's drawing", () => {
  setPictures(() => true);
  try {
    const thing = (lemma, picture) => ({ unit: `w:${lemma}`, lemma, text: lemma, means: `the ${lemma}`, article: "de", picture, forms: [lemma] });
    const entry = (one) => ({ key: one.lemma, thing: one, own: true, ...shownThing(one) });
    const mother = entry(thing("moeder", "mother"));
    const pool = [mother, entry(thing("mama", "mother")), entry(thing("mam", "mother")), entry(thing("vader", "father")), entry(thing("papa", "father")), entry(thing("koffie", "coffee")), entry(thing("thee", "tea"))];
    const step = seeStep(mother, pool, { isNew: true });
    const drawings = step.options.map((option) => option.picture);
    eq(new Set(drawings).size, drawings.length, `the same drawing twice: ${drawings}`);
    eq(drawings.filter((one) => one === "mother").length, 1);
    ok(drawings.length >= 3, `${drawings}`);
  } finally {
    setPictures(null);
  }
});

// ---------- the typing games: Type the word, Type in the gap, Type what it says ----------

// Six lessons in: words and sentences enough for every game.
function sixLessonsIn() {
  let at = T0;
  for (let i = 0; i < 6; i++) at = doLesson(at) + 3600_000;
  return at;
}
const kindsOf = (plan) => plan.steps.map((step) => step.kind).join(" ");

await test("Type the word, a session of its own: the English, the word to type as it's taught (a noun with its article), its drawing where it has one, the say strength", () => {
  const at = sixLessonsIn();
  try {
    setPictures(() => true);
    const plan = planSession("game", "type-word", at);
    ok(plan.steps.length >= 3 && plan.steps.every((step) => step.kind === "type-word"), `${plan.steps.length}: ${kindsOf(plan)}`);
    eq(plan.title, GAMES["type-word"].name);
    const units = plan.steps.map((step) => step.unit);
    eq(new Set(units).size, units.length, "a word twice");
    for (const step of plan.steps) {
      ok(step.unit && step.text && step.means, `a step without its word or English: ${JSON.stringify(step)}`);
      eq(step.skill, "say", step.text);
      ok(!conceptState(step.unit).isNew, `${step.text}: never taught`);
      if (step.article) ok(step.text.startsWith(`${step.article} `), `${step.text}: a noun without its article ${step.article}`);
    }
    const drawn = plan.steps.filter((step) => step.picture);
    ok(drawn.length, "no word with its drawing");
    // Its drawing is its own: the thing it's about is drawn by that picture (pathThing's), never another word's.
    setPictures(() => false);
    const bare = planSession("game", "type-word", at);
    ok(bare.steps.every((step) => !step.picture), "a drawing that isn't there");
    return `${plan.steps.length} words, ${drawn.length} drawn: ${plan.steps.map((step) => step.text).join(", ")}`;
  } finally {
    setPictures(null);
  }
});

await test("Pick the word shows the word's drawing beside its English, where it has one; none when it isn't drawn", () => {
  const at = sixLessonsIn();
  try {
    setPictures(() => true);
    const plan = planSession("game", "word", at);
    ok(plan.steps.length >= 3 && plan.steps.every((step) => step.kind === "word"), kindsOf(plan));
    ok(plan.steps.some((step) => step.picture), "no Pick the word with its drawing");
    setPictures(() => false);
    ok(planSession("game", "word", at).steps.every((step) => !step.picture), "a drawing that isn't there");
  } finally {
    setPictures(null);
  }
});

await test("a newcomer's one-word game and Match ask themselves: the path's first new things met as a lesson meets them (a picture question, a New word), then asked by that game; Tap the picture's meeting is the game", () => {
  // Before 8 Nov 2026 every game a newcomer opened was word cards and What does it mean?, and never once the game.
  try {
    setPictures(() => true);
    const firstThings = pathLessons()[0].things.filter((thing) => !thing.formOnly).map((thing) => thing.unit);
    const said = [];
    for (const game of ["see", "word", "type-word", "say-word", "repeat-word"]) {
      const plan = planSession("game", game);
      const own = plan.steps.filter((step) => step.kind === game);
      ok(own.length >= 3, `${game}: ${own.length} of its own: ${kindsOf(plan)}`);
      ok(plan.steps.every((step) => step.kind === game || (step.kind === "see" && step.isNew)), `${game}: a step that's neither the game nor a new word's meeting: ${kindsOf(plan)}`);
      const met = plan.steps.filter((step) => step.kind === "see" && step.isNew).map((step) => step.unit);
      ok(met.length >= 3 && met.every((unit) => firstThings.includes(unit)), `${game}: met ${met.join(", ")}, not lesson 1's first things`);
      if (game !== "see") for (const step of own) ok(met.indexOf(step.unit) >= 0 && plan.steps.findIndex((one) => one.unit === step.unit) < plan.steps.indexOf(step), `${game}: ${step.unit} asked before it was met`);
      said.push(`${game} ${own.length}/${plan.steps.length}`);
    }
    const match = planSession("game", "match");
    const round = match.steps.at(-1);
    eq(round?.kind, "match", kindsOf(match));
    const metForMatch = match.steps.filter((step) => step.kind === "see" && step.isNew).map((step) => step.target);
    ok(round.words.length >= 3 && round.words.every((word) => metForMatch.includes(word)), `Match pairs ${round.words.join(", ")}, met ${metForMatch.join(", ")}`);
    return `${said.join(", ")}; match ${kindsOf(match)}`;
  } finally {
    setPictures(null);
  }
});

await test("a listening game on its own (Listening, What does it say?, Repeat after, Type what it says, Repeat the word) takes recorded sentences and words first: an iPhone's silent switch silences the device's voice, never a recording", () => {
  const at = sixLessonsIn();
  ok(typeof planModule.setRecorded === "function" && typeof planModule.setWordRecorded === "function", "plan.js can't be told what's recorded (setRecorded, setWordRecorded)");
  const said = [];
  try {
    setPictures(() => true);
    for (const game of ["listen", "translate", "repeat", "hear-gap"]) {
      planModule.setRecorded(null);
      const plain = planSession("game", game, at);
      const taken = new Set(plain.steps.map((step) => step.item?.id));
      // Recorded: exactly what the plan didn't take; it now takes those first.
      planModule.setRecorded((item) => !taken.has(item.id));
      const plan = planSession("game", game, at);
      const recorded = plan.steps.map((step) => !taken.has(step.item?.id));
      ok(recorded.some(Boolean), `${game}: none of the recorded taken: ${plan.steps.map((step) => step.item?.id).join(", ")}`);
      ok(recorded.indexOf(false) < 0 || recorded.lastIndexOf(true) < recorded.indexOf(false), `${game}: a recorded one after one that isn't: ${recorded.join(" ")}`);
      ok(plan.steps.every((step) => step.kind === game), `${game}: ${kindsOf(plan)}`);
      said.push(`${game} ${recorded.filter(Boolean).length}/${plan.steps.length}`);
    }
    planModule.setWordRecorded(null);
    const plainWords = planSession("game", "repeat-word", at);
    const heardWords = new Set(plainWords.steps.map((step) => step.text));
    planModule.setWordRecorded((text) => !heardWords.has(text));
    const words = planSession("game", "repeat-word", at);
    const wordRecorded = words.steps.map((step) => !heardWords.has(step.text));
    ok(wordRecorded.some(Boolean), `repeat-word: none of the recorded words taken: ${words.steps.map((step) => step.text).join(", ")}`);
    ok(wordRecorded.indexOf(false) < 0 || wordRecorded.lastIndexOf(true) < wordRecorded.indexOf(false), `repeat-word: a recorded word after one that isn't: ${wordRecorded.join(" ")}`);
    ok(words.steps.every((step) => step.kind === "repeat-word"), `repeat-word: ${kindsOf(words)}`);
    said.push(`repeat-word ${wordRecorded.filter(Boolean).length}/${words.steps.length}`);
    return said.join(", ");
  } finally {
    planModule.setRecorded?.(null);
    planModule.setWordRecorded?.(null);
    setPictures(null);
  }
});

await test("Where does it go? asks only where a word moved from English's order, Which one is it? only with wrong sentences to choose from, Put it in order only two words or more: alone, in Practice with only it on, and in a week of Practice (one rule: plan.js sentenceCanPlay, in fits)", () => {
  // The rule as the screens need it, written here apart from plan.js so the test can't agree with a wrong rule.
  const can = { place: (item) => item.moved?.length > 0, choose: (item) => item.wrong?.length > 0, arrange: (item) => item.words.length > 1 };
  const ways = Object.keys(WAYS);
  const bad = [];
  const asked = {};
  const look = (where, plan) => {
    for (const step of plan.steps) {
      if (!can[step.kind] || !step.item) continue;
      asked[step.kind] = (asked[step.kind] ?? 0) + 1;
      if (!can[step.kind](step.item)) bad.push(`${where}: ${step.kind} on "${sentence(step)}"`);
    }
  };
  let at = sixLessonsIn();
  try {
    for (const game of Object.keys(can)) {
      const alone = planSession("game", game, at);
      look(`${game} alone`, alone);
      ok(alone.steps.filter((step) => step.kind === game).length >= 3, `${game} alone asks itself ${alone.steps.filter((step) => step.kind === game).length} times: ${kindsOf(alone)}`);
    }
    for (const game of Object.keys(can)) {
      for (const way of ways) setStudySetting(`quick.include.${way}`, way === game);
      look(`Practice with only ${game}`, planSession("practice", undefined, at));
    }
    for (const way of ways) setStudySetting(`quick.include.${way}`, true);
    for (let day = 1; day <= 7; day++) {
      const { end, plan } = doPractice(at);
      look(`Practice, day ${day}`, plan);
      at = end + 86_400_000;
    }
  } finally {
    for (const way of ways) setStudySetting(`quick.include.${way}`, true);
  }
  ok(!bad.length, `${bad.length} asked where the game can't be: ${bad.slice(0, 6).join("; ")}`);
  return Object.entries(asked).map(([kind, n]) => `${kind} ${n}`).join(", ");
});

await test("before your first words a whole-sentence game waits (plan.js SENTENCE_GAMES, beforeFirstWords: Study's tile quieter, a press the first lesson): the listed games are exactly those a newcomer's plan can't ask, and after lesson 1 each asks itself", () => {
  ok(planModule.SENTENCE_GAMES instanceof Set && typeof planModule.beforeFirstWords === "function", "plan.js can't say which games wait for the first words (SENTENCE_GAMES, beforeFirstWords)");
  const { SENTENCE_GAMES, beforeFirstWords } = planModule;
  // With drawings, as the app has them (the speaking twins play only words with one).
  setPictures(() => true);
  try {
    ok(beforeFirstWords(), "a brand-new learner counts as having studied");
    const wrong = [];
    for (const kind of Object.keys(GAMES)) {
      const own = planSession("game", kind, T0).steps.filter((step) => step.kind === kind).length;
      if (SENTENCE_GAMES.has(kind) !== (own === 0)) wrong.push(`${kind}: asks itself ${own} times, ${SENTENCE_GAMES.has(kind) ? "listed" : "not listed"}`);
    }
    ok(!wrong.length, `the list and the planner disagree: ${wrong.join("; ")}`);
    const at = doLesson(T0);
    ok(!beforeFirstWords(), "after lesson 1, still before the first words");
    for (const kind of SENTENCE_GAMES) {
      const own = planSession("game", kind, at).steps.filter((step) => step.kind === kind).length;
      ok(own >= 3, `${kind} after lesson 1 asks itself ${own} times`);
    }
    return [...SENTENCE_GAMES].join(" ");
  } finally {
    setPictures(null);
  }
});

await test("Type in the gap and Type what it says, each a session of its own: the sentence's gap word, one you know, in a sentence you can read; no voice, no Type what it says", () => {
  const at = sixLessonsIn();
  const out = [];
  for (const [kind, skill] of [["type-gap", "say"], ["hear-gap", "hear"]]) {
    const plan = planSession("game", kind, at);
    ok(plan.steps.length >= 3 && plan.steps.every((step) => step.kind === kind), `${kind}: ${kindsOf(plan)}`);
    eq(plan.title, GAMES[kind].name);
    for (const step of plan.steps) {
      ok(step.item?.gap, `${kind}: a sentence with no gap`);
      eq(step.target, targetOf(step.item), `${kind}: ${sentence(step)}`);
      ok(!conceptState(`w:${step.target}`).isNew, `${kind}: ${step.target} never taught (${sentence(step)})`);
      eq(step.skill, skill, `${kind}: ${sentence(step)}`);
      for (const word of lemmasOf(step.item)) ok(!WORDS[word] || !conceptState(`w:${word}`).isNew || word === step.target, `${kind}: "${word}" unknown in ${sentence(step)}`);
    }
    out.push(`${kind} ${plan.steps.length}`);
  }
  ok(needsSound("hear-gap") && !needsSound("type-gap") && !needsSound("type-word"), "only Type what it says needs the sound");
  setHearing(() => false);
  const deaf = planSession("game", "hear-gap", at);
  ok(!deaf.steps.some((step) => step.kind === "hear-gap"), `no voice, yet ${kindsOf(deaf)}`);
  return out.join(", ");
});

await test("the typing games in Practice: Type the word among the word questions, the gap games among the sentences; with only typing on, only typing; their evidence the say and hear strengths", () => {
  let at = sixLessonsIn();
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const { end, plan } = doPractice(at);
    for (const step of plan.steps) seen.add(step.kind);
    at = end + 3600_000;
  }
  for (const kind of ["type-word", "type-gap", "hear-gap"]) ok(seen.has(kind), `four practices without ${kind}: ${[...seen]}`);
  for (const way of Object.keys(WAYS)) setStudySetting(`quick.include.${way}`, ["type-word", "type-gap", "hear-gap"].includes(way));
  const typing = planSession("practice", undefined, at);
  ok(typing.steps.length >= 5, `${typing.steps.length} questions with only typing on`);
  ok(typing.steps.every((step) => ["type-word", "type-gap", "hear-gap"].includes(step.kind)), `only typing on: ${kindsOf(typing)}`);
  const quick = planSession("quick", undefined, at);
  ok(quick.steps.every((step) => ["type-word", "type-gap", "hear-gap", "card", "meet"].includes(step.kind)), `a quick session with only typing on: ${kindsOf(quick)}`);
  eq(TESTS["type-word"], { test: "recall", skill: "say" }, "Type the word");
  eq(TESTS["type-gap"], { test: "recall", skill: "say" }, "Type in the gap");
  eq(TESTS["hear-gap"], { test: "recall", skill: "hear" }, "Type what it says");
  eq(sourceOf("hear-gap"), "listening");
  eq(sourceOf("type-gap"), "games");
  return `${[...seen].length} kinds in four practices; only typing: ${kindsOf(typing)}`;
});

await test("Say the word and Repeat the word, each a session of its own: one word you've been taught, as it's taught, its drawing where it has one (Repeat the word only words with one); no voice for it, no Repeat the word; their evidence saying it and how you sound", () => {
  const at = sixLessonsIn();
  const out = [];
  try {
    setPictures(() => true);
    for (const [kind, skill] of [["say-word", "say"], ["repeat-word", "sound"]]) {
      const plan = planSession("game", kind, at);
      ok(plan.steps.length >= 3 && plan.steps.every((step) => step.kind === kind), `${kind}: ${kindsOf(plan)}`);
      eq(plan.title, GAMES[kind].name);
      eq(GAMES[kind].mode, "speak", kind);
      const units = plan.steps.map((step) => step.unit);
      eq(new Set(units).size, units.length, `${kind}: a word twice`);
      for (const step of plan.steps) {
        ok(step.unit && step.text && step.means, `${kind}: a step without its word or English: ${JSON.stringify(step)}`);
        eq(step.skill, skill, `${kind}: ${step.text}`);
        ok(!conceptState(step.unit).isNew, `${kind}: ${step.text} never taught`);
        if (step.article) ok(step.text.startsWith(`${step.article} `), `${kind}: ${step.text} without its article`);
      }
      ok(plan.steps.some((step) => step.picture), `${kind}: no word with its drawing`);
      // Repeat the word is Tap the picture's twin: every word it asks has its drawing.
      if (kind === "repeat-word") ok(plan.steps.every((step) => step.picture), `repeat-word: a word with no drawing: ${plan.steps.filter((step) => !step.picture).map((step) => step.text)}`);
      out.push(`${kind} ${plan.steps.length}`);
    }
    // Only some words drawn (those whose drawing's name sorts before "m"): Repeat the word asks only those; Say the word asks the rest too.
    setPictures((name) => name < "m");
    const drawnOnly = planSession("game", "repeat-word", at).steps.filter((step) => step.kind === "repeat-word");
    ok(drawnOnly.length && drawnOnly.every((step) => step.picture && step.picture < "m"), `repeat-word with some words drawn: ${drawnOnly.map((step) => `${step.text}:${step.picture}`)}`);
    ok(planSession("game", "say-word", at).steps.some((step) => !step.picture), "say-word asked only drawn words");
    // With only the speaking games on, a word Repeat the word can't ask is asked by Say the word in its place, never dropped.
    for (const way of Object.keys(WAYS)) setStudySetting(`quick.include.${way}`, ["say-word", "repeat-word"].includes(way));
    const mixed = planSession("practice", undefined, at).steps.filter((step) => step.unit && !step.item);
    ok(mixed.length && mixed.every((step) => step.kind === "say-word" || (step.kind === "repeat-word" && step.picture)), `Practice's words with some drawn: ${mixed.map((step) => `${step.kind}:${step.text}`)}`);
    ok(mixed.some((step) => step.kind === "say-word" && !step.picture), `no undrawn word asked by Say the word: ${mixed.map((step) => `${step.kind}:${step.text}`)}`);
    setPictures(() => true);
    for (const way of Object.keys(WAYS)) setStudySetting(`quick.include.${way}`, true);
    // Nothing here can say a word: Repeat the word asks none (Say the word needs no sound).
    setWordHearing(() => false);
    ok(!planSession("game", "repeat-word", at).steps.some((step) => step.kind === "repeat-word"), "Repeat the word with nothing to say the word");
    ok(planSession("game", "say-word", at).steps.every((step) => step.kind === "say-word"), "Say the word needs no sound");
  } finally {
    setPictures(null);
    setWordHearing(null);
  }
  ok(needsSound("repeat-word") && !needsSound("say-word"), "only Repeat the word needs the sound");
  eq(TESTS["say-word"], { test: "recall", skill: "say" }, "Say the word");
  eq(TESTS["repeat-word"], { test: "recall", skill: "sound" }, "Repeat the word");
  eq(sourceOf("repeat-word"), "listening");
  eq(sourceOf("say-word"), "games");
  // With only the speaking games on, Practice's words by themselves are said.
  for (const way of Object.keys(WAYS)) setStudySetting(`quick.include.${way}`, ["say", "repeat", "say-word", "repeat-word"].includes(way));
  const speaking = planSession("practice", undefined, at);
  const words = speaking.steps.filter((step) => step.unit && !step.item);
  ok(words.length && words.every((step) => step.kind === "say-word" || step.kind === "repeat-word"), `only speaking on, its word questions: ${kindsOf(speaking)}`);
  return `${out.join(", ")}; only speaking on: ${kindsOf(speaking)}`;
});

await test("a typed word is graded as a typed sentence is: case and spaces aside, accents forgiving unless strict, a noun's article needed, a near miss wrong", () => {
  const right = (text, typed, options) => ok(typedWord(text, typed, options).correct, `"${typed}" for "${text}" should be right`);
  const wrong = (text, typed, options) => ok(!typedWord(text, typed, options).correct, `"${typed}" for "${text}" should be wrong`);
  right("de fiets", "de fiets", { lemma: "fiets" });
  right("de fiets", "  De Fiets ", { lemma: "fiets" });
  wrong("de fiets", "fiets", { lemma: "fiets" });
  wrong("de fiets", "het fiets", { lemma: "fiets" });
  wrong("de fiets", "de fietz", { lemma: "fiets" });
  right("drinken", "drinken", { lemma: "drinken" });
  wrong("drinken", "drink", { lemma: "drinken" });
  right("één", "een", { lemma: "een" });
  wrong("één", "een", { lemma: "een", forgiving: false });
  right("één", "één", { lemma: "een", forgiving: false });
  right("café", "cafe");
  wrong("koffie", "");
  // Type it's whole sentence the same way: with accents strict, een for één is a near miss (the matcher alone heard past it).
  const item = { words: [["Ik"], ["drink"], ["één"], ["koffie"]], punct: "." };
  ok(typedRight(typedResult(item, "ik drink een koffie", true)), "a sentence typed without its accents, forgiving");
  ok(!typedRight(typedResult(item, "ik drink een koffie", false)), "a sentence typed without its accents, strict");
  ok(typedRight(typedResult(item, "Ik drink één koffie.", false)), "a sentence typed with its accents, strict");
});

await test("a language with only its starter: lessons worked out from it, a first lesson that asks, practice after, and the end of the lessons says so", async () => {
  const saved = await savePack(read("starter-fr.json"));
  ok(saved.ok, "starter-fr");
  setLearning("fr");
  await new Promise((resolve) => setTimeout(resolve, 20));
  await clearProgress();
  const first = planSession("lesson", undefined, T0);
  ok(asked(first.steps).length >= 5, `${asked(first.steps).length} questions: ${first.steps.map((step) => step.kind)}`);
  ok(first.steps[0].kind !== "meet", "a screen with no question");
  for (const step of first.steps) if (step.item) ok(ITEMS.includes(step.item), "a sentence from another language");
  let at = T0;
  let lessons = 0;
  while (studyOverview(at).lesson && lessons < 60) {
    at = doLesson(at) + 3600_000;
    lessons++;
  }
  ok(lessons < 60, "the lessons never end");
  const end = studyOverview(at);
  ok(end.atEnd && end.practice, "the end of the lessons has no practice");
  const plan = planSession("lesson", undefined, at);
  eq(plan.steps, [], "a lesson past the end");
  ok(/every .* lesson/.test(plan.empty) && plan.next?.href === "#study/more-lessons", `the end says: ${plan.empty}, ${JSON.stringify(plan.next)}`);
  const practice = planSession("practice", undefined, at);
  ok(practice.steps.length >= 10, `${practice.steps.length} questions`);
  void getStudySettings;
  return `${lessons} lessons, then practice of ${practice.steps.length}`;
});

console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
