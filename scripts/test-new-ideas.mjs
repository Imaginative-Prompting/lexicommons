// A lesson of one idea put into the path after a learner has gone past where it goes (study/path.js withNewIdeas, path-place.js seenOn and the
// "lesson:<id>" anchors), on the real path and word packs in Node: the path as it was before Dutch's seven new idea lessons (packs/path-nl.json
// without them) laid out first, as a device that had it did, then the path with them. A learner past where one goes has it come up next, ahead of
// them, and their place stays where it was; past several, they come one at a time, a lesson of words between, in their written order; one not past
// it has it where it's written; where you put yourself counts as how far you've got; once placed it stays put; another device's record of the path
// it laid out counts as this one's. And the one gap there is (a device that never laid out the path before the new one came): the lesson where
// it's written, open behind you, never skipped. Usage:
//   node scripts/test-new-ideas.mjs --list <frequency.nl.json> [<app dir>]   (exit 0 = pass; 2 = no list given)
// <app dir>: another copy's modules on these packs (its own grammar), to see it fail on one from before.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const listAt = process.argv.indexOf("--list");
if (listAt < 0) {
  console.error("Usage: node scripts/test-new-ideas.mjs --list <frequency.nl.json> [<app dir>]");
  process.exit(2);
}
const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const other = process.argv.slice(2).filter((arg, i, all) => arg !== "--list" && all[i - 1] !== "--list");
const APP = other[0] ? resolve(other[0]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);

// Dutch's grammar as the library has it first: the path uses its later patterns.
await from("scripts/fixtures/library-grammar.mjs");
const { clearProgress, record } = await from("public/js/study/progress.js");
const { markLessonsDone, pathOverview, planSession, setHearing, studyOverview } = await from("public/js/study/plan.js");
const { resetStudySettings } = await from("public/js/study/settings.js");
const { sentenceUnits } = await from("public/js/study/content.js");
const { savePack } = await from("public/js/study/packs.js");
const { useFrequency } = await from("public/js/study/frequency.js");
const { lemmasOf } = await from("public/js/study/new-words.js");
const { pathBuild, pathLessons } = await from("public/js/study/path.js");
const place = await from("public/js/study/path-place.js");
const { clearFinished, finishedLesson } = await from("public/js/study/done.js");

const read = (name) => JSON.parse(readFileSync(join(HERE, "packs", name), "utf8"));
for (const name of ["words-nl-01.json", "words-nl-02.json"]) {
  const saved = await savePack(read(name));
  if (!saved.ok) throw new Error(`${name}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
useFrequency(JSON.parse(readFileSync(process.argv[listAt + 1], "utf8")));

// The seven, in their written order, and the path as it was without them.
const NEW = ["idea-question-word", "idea-verb-preposition", "idea-indirect-question", "idea-particles", "idea-te-infinitive", "idea-modal-perfect", "idea-er-preposition"];
const NOW = read("path-nl.json");
for (const id of NEW) if (!NOW.lessons.some((lesson) => lesson.id === id)) throw new Error(`packs/path-nl.json has no ${id}`);
const BEFORE = { ...NOW, lessons: NOW.lessons.filter((lesson) => !NEW.includes(lesson.id)) };
// Where each is written: right after this lesson of the pack.
const WRITTEN_AFTER_OF = (id) => NOW.lessons[NOW.lessons.findIndex((lesson) => lesson.id === id) - 1].id;
const WRITTEN_AFTER = Object.fromEntries(NEW.map((id) => [id, NOW.lessons[NOW.lessons.findIndex((lesson) => lesson.id === id) - 1].id]));

const LANG = "nl";
const ID = (id) => `path-nl/${id}`;
const T0 = new Date(2026, 9, 1, 9).getTime();
let failed = 0;
let passed = 0;
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
const eq = (actual, expected, what = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? `${what}: ` : ""}${a} ≠ ${e}`);
};

// The path with this pack, laid out afresh (it always follows the other one, so the study material has changed).
async function layOut(pack) {
  const build = pathBuild();
  const saved = await savePack(pack);
  ok(saved.ok, JSON.stringify(saved.errors?.slice(0, 2)));
  const lessons = pathLessons();
  ok(pathBuild() !== build, "the path wasn't laid out again");
  return lessons;
}
await layOut(NOW);

async function test(name, fn) {
  await clearProgress();
  clearFinished();
  resetStudySettings();
  place.clearPlaces();
  setHearing(null);
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  } finally {
    // Every test starts from the path with them, so its own first layOut(BEFORE) is a change.
    if (!pathLessons().some((lesson) => lesson.id === ID(NEW[0]))) await layOut(NOW);
  }
}

// One step, recorded as session.js records it (test-study.mjs play), right.
function play(step, at) {
  if (step.kind === "meet") return record([{ concept: `p:${step.concept.pattern}`, at, outcome: "met", test: "self", skill: "read", activity: "meet", item: step.item?.id }]);
  if (step.kind === "see" || step.kind === "word") return record([{ concept: step.unit, at, outcome: "right", test: "pick", skill: "read", activity: step.kind }]);
  if (step.kind === "type-word" || step.kind === "say-word") return record([{ concept: step.unit, at, outcome: "right", test: "recall", skill: "say", activity: step.kind }]);
  if (step.kind === "repeat-word") return record([{ concept: step.unit, at, outcome: "right", test: "recall", skill: "sound", activity: step.kind }]);
  if (step.kind === "match") {
    return record([
      ...step.words.map((word) => ({ concept: `w:${word}`, at, outcome: "right", test: "pick", skill: "read", activity: "match" })),
      ...(step.phrases ?? []).map((id) => ({ concept: `c:${id}`, at, outcome: "right", test: "pick", skill: "read", activity: "match" })),
    ]);
  }
  const { item } = step;
  const test = ["type", "say", "type-gap", "hear-gap"].includes(step.kind) ? "recall" : "pick";
  const answerWords = step.kind === "translate" ? "right" : step.target ? null : "met";
  return record([
    ...sentenceUnits(item).map((concept) => ({ concept, at, outcome: "right", test, skill: step.skill ?? "read", activity: step.kind, item: item.id })),
    ...lemmasOf(item).map((word) => ({ concept: `w:${word}`, at, outcome: answerWords ?? (word === step.target ? "right" : "met"), test, skill: step.skill ?? "read", activity: step.kind, item: item.id })),
  ]);
}
// A lesson played through and finished, as a session does; the time after it.
function doLesson(at, id) {
  const plan = planSession("lesson", id, at);
  eq(plan.lesson?.id, id, "the lesson planned");
  plan.steps.forEach((step, i) => play(step, at + i * 30_000));
  const end = at + plan.steps.length * 30_000;
  finishedLesson(id, end);
  return end + 60_000;
}
// Every lesson of the path in order up to and including lessons[last] (a unit's whole lesson too, as a learner meets it); the time after.
function playThrough(lessons, last, at = T0) {
  for (let i = 0; i <= last; i++) at = doLesson(at, lessons[i].id);
  return at;
}
// The first lesson at or after `from` that's a lesson of words, with the next lesson not a whole unit's: a learner stopped there is mid-unit.
function midUnit(lessons, from) {
  let i = from;
  while (lessons[i].full || lessons[i + 1]?.full) i++;
  return i;
}
const at = (lessons, id) => lessons.findIndex((lesson) => lesson.id === ID(id));
const stateOf = (now, id) => pathOverview(400, now).lessons.find((lesson) => lesson.id === ID(id))?.state;
const states = (now) => pathOverview(400, now).lessons.reduce((all, lesson) => ({ ...all, [lesson.state]: (all[lesson.state] ?? 0) + 1 }), {});
// Each of these sits right after the lesson it's written after.
function asWritten(lessons, ids) {
  for (const id of ids) eq(lessons[at(lessons, id) - 1]?.id, ID(WRITTEN_AFTER[id]), `${id} isn't where it's written`);
}

await test("a learner past where a new idea goes: it comes up next, ahead of them, their place as it was, then the lesson that was next; it stays put", async () => {
  let lessons = await layOut(BEFORE);
  const last = midUnit(lessons, at(lessons, "l022") + 2);
  let now = playThrough(lessons, last);
  const reached = lessons[last].id;
  const next = studyOverview(now).lesson.id;
  ok(!("open" in states(now)) && !("skipped" in states(now)), `before: ${JSON.stringify(states(now))}`);
  lessons = await layOut(NOW);
  const idea = at(lessons, NEW[0]);
  eq(lessons[idea - 1]?.id, reached, "the new idea isn't right after the furthest lesson done");
  eq(lessons[idea].unit?.id, lessons[idea + 1].unit?.id, "its unit is the one it's in");
  eq(studyOverview(now).lesson.id, ID(NEW[0]), "what's next");
  eq(stateOf(now, NEW[0]), "here");
  ok(!("open" in states(now)) && !("skipped" in states(now)), `nothing behind: ${JSON.stringify(states(now))}`);
  eq(place.placeOn(LANG), null, "the place");
  asWritten(lessons, NEW.slice(1));
  now = doLesson(now, ID(NEW[0]));
  eq(studyOverview(now).lesson.id, next, "after the idea");
  now = doLesson(now, next);
  // Laid out again (the material changing back and forth): where it was put.
  await layOut(BEFORE);
  lessons = await layOut(NOW);
  eq(lessons[at(lessons, NEW[0]) - 1]?.id, reached, "laid out again");
  eq(stateOf(now, NEW[0]), "done");
  return `${NEW[0]} after ${reached.slice(8)}, then ${next.slice(8)}`;
});

await test("a learner not yet there: the new ideas are where they're written, placed once (null)", async () => {
  let lessons = await layOut(BEFORE);
  const now = playThrough(lessons, midUnit(lessons, 8));
  const next = studyOverview(now).lesson.id;
  lessons = await layOut(NOW);
  asWritten(lessons, NEW);
  eq(studyOverview(now).lesson.id, next, "what's next");
  for (const id of NEW) eq(place.anchorOf(LANG, `lesson:${ID(id)}`), null, id);
  return `next ${next.slice(8)}`;
});

await test("where you put yourself counts as how far you've got: the new idea right after it, the lessons you jumped as they were", async () => {
  let lessons = await layOut(BEFORE);
  const now = playThrough(lessons, midUnit(lessons, 2));
  const target = lessons[midUnit(lessons, at(lessons, "l030"))].id;
  place.setPlace(LANG, target);
  const skipped = pathOverview(400, now).lessons.filter((lesson) => lesson.state === "skipped").map((lesson) => lesson.id);
  ok(skipped.length, "nothing skipped by the jump");
  lessons = await layOut(NOW);
  eq(lessons[at(lessons, NEW[0]) - 1]?.id, target, "the new idea isn't right after where you put yourself");
  eq(studyOverview(now).lesson.id, target, "what's next");
  eq(stateOf(now, NEW[0]), "ahead");
  eq(
    pathOverview(400, now).lessons.filter((lesson) => lesson.state === "skipped").map((lesson) => lesson.id),
    skipped,
    "the lessons jumped",
  );
  eq(place.placeOn(LANG), target, "the place");
  return `${skipped.length} jumped, the idea after ${target.slice(8)}`;
});

await test("far along: all seven come up ahead, one at a time with a lesson of words between, in their written order", async () => {
  let lessons = await layOut(BEFORE);
  const last = midUnit(lessons, at(lessons, "l139"));
  const reached = lessons[last].id;
  markLessonsDone(lessons.slice(0, last + 1));
  const now = Date.now() + 60_000;
  lessons = await layOut(NOW);
  const spots = NEW.map((id) => at(lessons, id));
  eq(lessons[spots[0] - 1]?.id, reached, "the first isn't right after the furthest lesson done");
  ok(
    spots.every((spot, k) => k === 0 || spot > spots[k - 1]),
    `not in their written order: ${spots}`,
  );
  for (let k = 1; k < spots.length; k++) {
    const between = lessons.slice(spots[k - 1] + 1, spots[k]).filter((lesson) => !lesson.full);
    eq(between.length, 1, `between ${NEW[k - 1]} and ${NEW[k]}`);
    ok(between[0].kind !== "idea", `between ${NEW[k - 1]} and ${NEW[k]}: ${between[0].id}`);
  }
  eq(studyOverview(now).lesson.id, ID(NEW[0]), "what's next");
  for (const id of NEW) ok(["here", "ahead"].includes(stateOf(now, id)), `${id}: ${stateOf(now, id)}`);
  ok(!("open" in states(now)) && !("skipped" in states(now)), `nothing behind: ${JSON.stringify(states(now))}`);
  let t = doLesson(now, ID(NEW[0]));
  const words = studyOverview(t).lesson.id;
  ok(!NEW.map(ID).includes(words), `two ideas in a row: ${words}`);
  t = doLesson(t, words);
  eq(studyOverview(t).lesson.id, ID(NEW[1]), "the second");
  return `after ${lessons[spots[0] - 1].id.slice(8)}: ${spots.join(", ")}`;
});

await test("another device's record of the path it laid out counts as this one's: the new idea ahead here too; and the records join", async () => {
  let lessons = await layOut(BEFORE);
  const last = midUnit(lessons, at(lessons, "l022") + 2);
  const now = playThrough(lessons, last);
  const reached = lessons[last].id;
  const theirs = place.pathSync.records()[LANG];
  ok(Array.isArray(theirs?.value?.seen) && theirs.value.seen.length === BEFORE.lessons.length, `the record's lessons: ${theirs?.value?.seen?.length}`);
  place.clearPlaces();
  eq(place.seenOn(LANG), undefined, "this device laid nothing out");
  place.pathSync.apply({ [LANG]: { at: Date.now() + 1000, value: theirs.value } });
  lessons = await layOut(NOW);
  eq(lessons[at(lessons, NEW[0]) - 1]?.id, reached, "the new idea isn't right after the furthest lesson done");
  eq(studyOverview(now).lesson.id, ID(NEW[0]), "what's next");
  const mine = place.pathSync.records()[LANG].value;
  ok(mine.anchors?.[`lesson:${ID(NEW[0])}`], "its place goes with the record");
  place.pathSync.apply({ [LANG]: { at: Date.now() + 2000, value: { lesson: null, seen: ["path-nl/elsewhere"] } } });
  ok(place.seenOn(LANG).includes("path-nl/elsewhere") && place.seenOn(LANG).includes(ID(NEW[0])), "the lessons laid out on both");
  eq(place.anchorOf(LANG, `lesson:${ID(NEW[0])}`), mine.anchors[`lesson:${ID(NEW[0])}`], "a place set here stays");
  return `${place.seenOn(LANG).length} lessons laid out`;
});

// A lesson that teaches an idea with the words it needs (zou and zouden: idea-conditional, B's second batch) comes ahead the same way.
const WITH_WORDS = "idea-conditional";
await test("a new lesson that teaches an idea with its words, behind a learner: it comes up next, ahead of them, never skipped", async () => {
  const lesson = NOW.lessons.find((one) => one.id === WITH_WORDS);
  ok(lesson?.concept && lesson.words.length, `packs/path-nl.json has no ${WITH_WORDS} with words`);
  const without = { ...NOW, lessons: NOW.lessons.filter((one) => one.id !== WITH_WORDS) };
  let lessons = await layOut(without);
  const last = midUnit(lessons, at(lessons, WRITTEN_AFTER_OF(WITH_WORDS)) + 2);
  markLessonsDone(lessons.slice(0, last + 1));
  const reached = lessons[last].id;
  const now = Date.now() + 60_000;
  lessons = await layOut(NOW);
  eq(lessons[at(lessons, WITH_WORDS) - 1]?.id, reached, "it isn't right after the furthest lesson done");
  eq(studyOverview(now).lesson.id, ID(WITH_WORDS), "what's next");
  eq(stateOf(now, WITH_WORDS), "here");
  ok(!("skipped" in states(now)), `skipped: ${JSON.stringify(states(now))}`);
  return `${WITH_WORDS} after ${reached.slice(8)}`;
});

await test("the gap there is: a device that never laid out the path before the new one came has it where it's written, open behind you, never skipped", async () => {
  let lessons = await layOut(BEFORE);
  const now = playThrough(lessons, midUnit(lessons, at(lessons, "l022") + 2));
  const next = studyOverview(now).lesson.id;
  place.clearPlaces();
  lessons = await layOut(NOW);
  asWritten(lessons, NEW);
  eq(stateOf(now, NEW[0]), "open");
  ok(!("skipped" in states(now)), `skipped: ${JSON.stringify(states(now))}`);
  eq(studyOverview(now).lesson.id, next, "what's next");
  return `next ${next.slice(8)}`;
});

console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
