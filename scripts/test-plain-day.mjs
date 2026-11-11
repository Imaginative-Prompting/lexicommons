// A pack's plain items in daily study (study/deck.js plainOfDay, plan.js), on the real Dutch path and a word band, in Node. What's due of any pack that's on joins Practice and
// Reviews; what's new joins only from a pack you made or copied, met first and then asked, a couple at a time, never ahead of a first lesson; an imported deck's new ones stay until
// you open it. A big deck never crowds out the rest, and costs a start little. A language with nothing but your own items has Practice too.
// Usage: node scripts/test-plain-day.mjs   (exit 0 = pass)
// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearProgress, record, unitState } from "../public/js/study/progress.js";
import { overview, planSession, studyOverview } from "../public/js/study/plan.js";
import { getStudySettings, resetStudySettings, setStudySetting } from "../public/js/study/settings.js";
import { sentenceUnits } from "../public/js/study/content.js";
import { allPacks, savePack, setPackOn } from "../public/js/study/packs.js";
import { lemmasOf } from "../public/js/study/new-words.js";
import { canMatchCard, cardRows, deckInstead, deckSession, deckUnit, entersTheDayNew, isImportedDeck, plainOfDay, plainShare, wordOfCard } from "../public/js/study/deck.js";
import { clearFinished, finishedLesson } from "../public/js/study/done.js";
import { setLearning } from "../public/js/study/learning.js";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of ["path-nl", "words-nl-01"]) {
  const saved = await savePack(JSON.parse(readFileSync(join(APP, "packs", `${name}.json`), "utf8")));
  if (!saved.ok) throw new Error(`${name}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
const DAY = 86_400_000;
const T0 = new Date(2026, 9, 1, 9).getTime();
let failed = 0;
let passed = 0;
const PLAIN_IDS = new Set();
async function test(name, fn) {
  await clearProgress();
  clearFinished();
  resetStudySettings();
  setLearning("nl");
  for (const id of PLAIN_IDS) setPackOn(id, false);
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

async function plainPack(id, count, { language = "nl", ...more } = {}) {
  const items = Array.from({ length: count }, (_, i) => ({ id: `c${i}`, text: `kaart${id.length}x${i}`, means: `card ${id} ${i}` }));
  const saved = await savePack({ format: "lexicommons-pack", version: 2, id, name: id, language, from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items, ...more });
  if (!saved.ok) throw new Error(`${id}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
  PLAIN_IDS.add(id);
  setPackOn(id, true);
  return id;
}
const on = (id) => setPackOn(id, true);
const answered = (unit, at, outcome = "right") => ({ concept: unit, at, outcome, test: "pick", skill: "read", activity: "choose", item: unit.slice(2) });

// A lesson played, right: enough that there's something else to practice.
function doLesson(at) {
  const plan = planSession("lesson", undefined, at);
  plan.steps.forEach((step, i) => {
    const when = at + i * 30_000;
    if (step.kind === "meet") return record([{ concept: `p:${step.concept.pattern}`, at: when, outcome: "met", test: "self", skill: "read", activity: "meet", item: step.item?.id }]);
    if (step.kind === "see" || step.kind === "word") return record([{ concept: step.unit, at: when, outcome: "right", test: "pick", skill: "read", activity: step.kind }]);
    if (step.kind === "match") return record(step.words.map((word) => ({ concept: `w:${word}`, at: when, outcome: "right", test: "pick", skill: "read", activity: "match" })));
    const { item } = step;
    return record([...sentenceUnits(item).map((concept) => ({ concept, at: when, outcome: "right", test: "pick", skill: "read", activity: step.kind, item: item.id })), ...lemmasOf(item).map((word) => ({ concept: `w:${word}`, at: when, outcome: "right", test: "pick", skill: "read", activity: step.kind, item: item.id }))]);
  });
  const end = at + plan.steps.length * 30_000;
  if (plan.lesson) finishedLesson(plan.lesson.id, end);
  return end;
}
const plainStepsIn = (plan) => plan.steps.filter((step) => step.kind === "deck");

await plainPack("my-words", 8);
await plainPack("anki-some-deck-abc", 8);
await plainPack("anki-some-deck-abc-12ab", 8, { copiedFrom: { id: "anki-some-deck-abc", version: "0123456789ab" } });
await plainPack("anki-big-deck-big", 5000);
await plainPack("my-finnish", 6, { language: "fi" });

await test("which packs take new ones into the day: yours and your copies; an imported deck, and a pack you follow, don't", () => {
  const pack = (id) => allPacks().find((one) => one.id === id);
  eq(isImportedDeck(pack("anki-some-deck-abc")), true);
  eq(isImportedDeck(pack("anki-some-deck-abc-12ab")), false, "a copy of one");
  eq(isImportedDeck(pack("my-words")), false);
  eq(entersTheDayNew(pack("my-words")), true);
  eq(entersTheDayNew(pack("anki-some-deck-abc-12ab")), true, "a copy");
  eq(entersTheDayNew(pack("anki-some-deck-abc")), false, "imported");
  eq(entersTheDayNew({ id: "someones-pack", origin: { kind: "follow" } }), false, "followed");
  eq(entersTheDayNew({ id: "lessons", origin: { kind: "default" } }), false, "the library's");
});

await test("a brand-new learner with a pack of their own: the first lesson is still the one thing, and Practice waits for it", () => {
  on("my-words");
  const study = studyOverview(T0);
  eq(study.firstTime, true);
  eq(study.practice, null);
  ok(study.lesson, "no lesson");
  eq(planSession("practice", undefined, T0).steps, []);
});

await test("after a lesson, a pack of your own: two new items in Practice, each met first and asked further on, and the count says so", () => {
  on("my-words");
  const end = doLesson(T0);
  const study = studyOverview(end);
  const plan = planSession("practice", undefined, end);
  const plain = plainStepsIn(plan);
  eq(plain.length, 4, "2 items, 2 steps each");
  const units = [...new Set(plain.map((step) => step.unit))].sort();
  eq(units, [deckUnit("my-words", "c0"), deckUnit("my-words", "c1")], "the pack's first two");
  for (const unit of units) {
    const at = plan.steps.map((step, i) => (step.unit === unit ? i : -1)).filter((i) => i >= 0);
    eq(at.length, 2, "met and asked");
    const [meet, ask] = at.map((i) => plan.steps[i]);
    ok(meet.game === "card" && meet.first === true, `first ${meet.game}`);
    ok(ask.game !== "card" || !ask.first, "asked isn't a first card");
    ok(at[0] < at[1], "asked before it's met");
  }
  ok(plan.steps.length <= study.practice.questions + 1, `${plan.steps.length} steps for ${study.practice.questions} questions`);
  // The control: the same lesson with the pack off has none.
  setPackOn("my-words", false);
  eq(plainStepsIn(planSession("practice", undefined, end)).length, 0, "with the pack off");
  return `${plain.length} of ${plan.steps.length} steps`;
});

await test("met but never asked: it comes back as new without the first card's tag, and it's not two new ones more", () => {
  on("my-words");
  const end = doLesson(T0);
  record([{ concept: deckUnit("my-words", "c0"), at: end, outcome: "met", test: "self", skill: "read", activity: "card", item: "my-words/c0" }]);
  const plan = planSession("practice", undefined, end + 60_000);
  const c0 = plan.steps.filter((step) => step.unit === deckUnit("my-words", "c0"));
  eq(c0.length, 2);
  eq(c0.find((step) => step.game === "card")?.first, false, "not a first card now");
});

await test("an imported deck: none of its new cards enter the day, though the rest is there; open it and they do what they always did", () => {
  on("anki-some-deck-abc");
  const end = doLesson(T0);
  eq(plainStepsIn(planSession("practice", undefined, end)).length, 0);
  eq(plainOfDay(end).fresh, []);
  ok(deckSession("anki-some-deck-abc", end).steps.length > 0, "its own session has them");
});

await test("an imported deck's card you've played: when it's due it joins Practice, Reviews and the count, and goes when it isn't", () => {
  on("anki-some-deck-abc");
  const unit = deckUnit("anki-some-deck-abc", "c3");
  const end = doLesson(T0);
  const before = overview(end + 60_000).dueAll;
  record([answered(unit, end)]);
  eq(unitState(unit, { now: end + 60_000 }).due, false, "not due at once");
  eq(plainStepsIn(planSession("practice", undefined, end + 60_000)).length, 0, "not due yet");
  const later = end + 40 * DAY;
  ok(unitState(unit, { now: later }).due, "due in 40 days");
  const plan = planSession("practice", undefined, later);
  eq(plainStepsIn(plan).map((step) => step.unit), [unit]);
  eq(plainStepsIn(plan)[0].meaning !== "new", true);
  const info = overview(later);
  ok(info.dueAll >= before + 1 && plainOfDay(later).due.length === 1, `${info.dueAll}`);
  eq(plainStepsIn(planSession("reviews", undefined, later)).map((step) => step.unit), [unit], "Reviews");
  // Off: gone from all of it.
  const was = overview(later).dueAll;
  setPackOn("anki-some-deck-abc", false);
  eq(plainStepsIn(planSession("practice", undefined, later)).length, 0, "off");
  eq(overview(later).dueAll, was - 1, "off, the count");
});

await test("Reviews with nothing due anywhere but one plain card still has it; with nothing due, it says so", () => {
  on("anki-some-deck-abc");
  eq(planSession("reviews", undefined, T0).steps, [], "nothing");
  const unit = deckUnit("anki-some-deck-abc", "c1");
  record([answered(unit, T0)]);
  const plan = planSession("reviews", undefined, T0 + 40 * DAY);
  eq(plan.steps.map((step) => step.unit), [unit]);
});

await test("a copy you made takes its new ones into the day, the deck it's from doesn't", () => {
  on("anki-some-deck-abc");
  on("anki-some-deck-abc-12ab");
  const end = doLesson(T0);
  eq([...new Set(plainStepsIn(planSession("practice", undefined, end)).map((step) => step.pack))], ["anki-some-deck-abc-12ab"]);
});

await test("a big deck with everything due: it gets at most half of a practice, the lesson's sentences and words still come, and it's quick", () => {
  const id = on("anki-big-deck-big") ?? "anki-big-deck-big";
  let end = doLesson(T0);
  const start0 = performance.now();
  overview(end);
  studyOverview(end);
  const quiet = performance.now() - start0;
  record(Array.from({ length: 5000 }, (_, i) => answered(deckUnit(id, `c${i}`), end)));
  end += 60 * DAY;
  eq(plainOfDay(end).due.length, 5000);
  const start = performance.now();
  const info = overview(end);
  const study = studyOverview(end);
  const took = performance.now() - start;
  const plan = planSession("practice", undefined, end);
  const plain = plainStepsIn(plan);
  const goal = Math.round((getStudySettings().practice.minutes * 60) / 20);
  ok(plain.length <= Math.ceil(goal / 2), `${plain.length} of ${goal}`);
  ok(plan.steps.length - plain.length >= 3, `only ${plan.steps.length - plain.length} other steps`);
  eq(new Set(plain.map((step) => step.unit)).size, plain.length, "a card twice");
  ok(info.dueAll >= 5000 && study.practice.questions <= goal, JSON.stringify([info.dueAll, study.practice]));
  ok(took < 1500, `overview and studyOverview took ${Math.round(took)} ms`);
  return `${plain.length} of ${plan.steps.length} steps; ${Math.round(quiet)} ms quiet, ${Math.round(took)} ms with 5,000 due`;
});

await test("plainShare: its share of what's due, at least 2, at most half, new only with room; everything when nothing else can be asked", () => {
  const list = (n) => Array.from({ length: n }, (_, i) => i);
  eq(plainShare({ due: list(1), fresh: [] }, { goal: 15, others: 10, dueElsewhere: 100 }), { due: 1, fresh: 0 });
  eq(plainShare({ due: list(5), fresh: [] }, { goal: 15, others: 10, dueElsewhere: 100 }), { due: 2, fresh: 0 }, "at least 2");
  eq(plainShare({ due: list(50), fresh: [] }, { goal: 16, others: 10, dueElsewhere: 50 }), { due: 8, fresh: 0 }, "half by share");
  eq(plainShare({ due: list(500), fresh: list(5) }, { goal: 15, others: 10, dueElsewhere: 0 }), { due: 8, fresh: 0 }, "no room for new");
  eq(plainShare({ due: [], fresh: list(5) }, { goal: 15, others: 10, dueElsewhere: 3 }), { due: 0, fresh: 2 }, "new");
  eq(plainShare({ due: list(40), fresh: list(5) }, { goal: 15, others: 0, dueElsewhere: 0 }), { due: 11, fresh: 2 }, "nothing else");
  eq(plainShare({ due: [], fresh: [] }, { goal: 15, others: 10, dueElsewhere: 3 }), { due: 0, fresh: 0 });
});

await test("Match takes a due item not asked by itself, none whose sides are already in the round", () => {
  on("anki-big-deck-big");
  const end = doLesson(T0);
  record(Array.from({ length: 30 }, (_, i) => answered(deckUnit("anki-big-deck-big", `c${i}`), end)));
  const later = end + 40 * DAY;
  const plan = planSession("practice", undefined, later);
  const round = plan.steps.find((step) => step.kind === "match");
  ok(round, `no Match in ${plan.steps.map((step) => step.kind)}`);
  ok(round.items.length >= 1 && round.items.length <= 2, `${round.items.length} plain items`);
  const asked = new Set(plainStepsIn(plan).map((step) => step.unit));
  ok(round.items.every((item) => !asked.has(item.unit)), "asked by itself too");
  eq(round.words.length + (round.phrases?.length ?? 0) + round.items.length <= 5, true, "more than 5 pairs");
  const sides = round.items.flatMap((item) => [item.text, item.means]);
  eq(new Set(sides).size, sides.length);
  // A long card can't be in one.
  ok(!canMatchCard({ id: "x", text: "x".repeat(400), means: "y" }), "a long card in Match");
  return `${round.items.length} plain of ${round.words.length + round.items.length} pairs`;
});

await test("a game that can't be played for now: another the card has, never Match; none left, the question goes", () => {
  const entry = { games: ["card", "type", "listen", "match"] };
  const step = { kind: "deck", game: "listen", skill: "hear", entry };
  eq(deckInstead(step, new Set(["listen"])).game, "card");
  eq(deckInstead(step, new Set(["listen", "card"])).game, "type");
  eq(deckInstead(step, new Set(["listen", "card"])).skill, "say");
  eq(deckInstead(step, new Set(["listen", "card", "type"])), null);
});

await test("Choose the games off: Practice doesn't ask a plain card by a game you've turned off", () => {
  on("anki-some-deck-abc");
  const end = doLesson(T0);
  const unit = deckUnit("anki-some-deck-abc", "c0");
  record([answered(unit, end), answered(unit, end + 1000), answered(unit, end + 2000)]);
  setStudySetting("quick.include.type", false);
  setStudySetting("quick.include.choose", false);
  const plan = planSession("practice", undefined, end + 90 * DAY);
  const steps = plainStepsIn(plan);
  ok(steps.length === 1 && !["type", "choose"].includes(steps[0].game), JSON.stringify(steps.map((step) => step.game)));
  return steps[0].game;
});

await test("coming back after a long time: today's share counts the plain items too", () => {
  on("anki-some-deck-abc");
  const end = doLesson(T0);
  record(Array.from({ length: 8 }, (_, i) => answered(deckUnit("anki-some-deck-abc", `c${i}`), end)));
  const later = end + 60 * DAY;
  const info = overview(later);
  ok(info.comeback, "a comeback");
  ok(info.dueAll >= 8, `${info.dueAll}`);
  eq(info.comeback.share, Math.ceil(info.dueAll / (info.comeback.days - info.comeback.day)));
  eq(info.due, Math.min(info.comeback.share, info.dueAll));
});

await test("a language with nothing but your own items: Practice from the start, no lesson to offer; off, nothing to study", () => {
  setLearning("fi");
  on("my-finnish");
  const study = studyOverview(T0);
  eq(study.nothing, false);
  eq(study.firstTime, false);
  eq(study.lesson, null);
  eq(study.writtenEnd, false, "it isn't the end of any lessons");
  ok(study.practice?.questions >= 4, JSON.stringify(study.practice));
  const plan = planSession("practice", undefined, T0);
  eq(plan.practice, true);
  eq(plainStepsIn(plan).length, 4, "2 items, met and asked");
  // Everything played and due: Practice is all of them it has room for, with a round of Match.
  record(Array.from({ length: 6 }, (_, i) => answered(deckUnit("my-finnish", `c${i}`), T0)));
  const later = planSession("practice", undefined, T0 + 40 * DAY);
  eq(later.steps.filter((step) => step.kind === "deck").length, 6);
  setPackOn("my-finnish", false);
  eq(studyOverview(T0).nothing, true);
  eq(planSession("practice", undefined, T0).steps, []);
});

await test("an exact match is the same word: the word and its own meaning, with the word for the, every part of the meaning; anything else is its own item", () => {
  const is = (text, means) => wordOfCard({ id: "x", text, means });
  // The word, and a sense it really has.
  eq(is("huis", "house"), "huis");
  eq(is("huis", "home"), "huis");
  eq(is("huis", "a house"), "huis");
  eq(is("huis", "the house"), "huis");
  eq(is("huis", "house, home"), "huis");
  eq(is("huis", "House."), "huis");
  eq(is("Huis", "house"), "huis", "its capital");
  eq(is("het huis", "the house"), "huis", "as a deck writes a noun");
  eq(is("de koffie", "coffee"), "koffie");
  eq(is("lopen", "to walk"), "lopen");
  eq(is("lopen", "walk"), "lopen");
  // Not the word, or not its meaning.
  eq(is("huis", "castle"), null, "another meaning");
  eq(is("huis", "house, castle"), null, "one part of it isn't");
  eq(is("huizen", "houses"), null, "a form isn't the word");
  eq(is("een huis", "a house"), null, "een isn't a word for the");
  eq(is("ik drink koffie", "I drink coffee"), null, "a sentence");
  eq(is("niet-een-woord", "house"), null, "no such word");
  eq(is("huis", ""), null);
  eq(wordOfCard({ id: "x", text: "huis", means: "house", cloze: { answer: "huis" } }), null, "a cloze");
  eq(wordOfCard(null), null);
  eq(is("__proto__", "house"), null);
  eq(is("constructor", "house"), null);
  // A note in brackets on the sense doesn't count against it.
  eq(is("bank", "bank"), "bank");
});

await test("what it records: a card that's a word counts for both, a card that isn't only for itself, and the word isn't new after it", () => {
  const unit = deckUnit("my-words", "c0");
  const row = answered(unit, T0);
  eq(cardRows({ text: "huis", means: "house" }, row).map((one) => one.concept), [unit, "w:huis"]);
  eq(cardRows({ text: "huis", means: "castle" }, row).map((one) => one.concept), [unit]);
  ok(unitState("w:huis", { now: T0 }).isNew, "new before");
  record(cardRows({ text: "huis", means: "house" }, row));
  ok(!unitState("w:huis", { now: T0 + 60_000 }).isNew, "not new after");
  eq(unitState("w:huis", { now: T0 + 60_000 }).reviews, 1);
  eq(unitState(unit, { now: T0 + 60_000 }).reviews, 1);
});

await test("a bare card that exactly is a word reaches the rest of the games: with nothing written for it, Practice asks about that word itself, and in a sentence that uses it, within 35 days", async () => {
  // zien isn't taught until later, and "Zie je mijn telefoon?" otherwise uses what the first lessons teach.
  const word = "zien";
  await plainPack("anki-een-woord-abc", 1);
  const saved = await savePack({ format: "lexicommons-pack", version: 2, id: "anki-een-woord-abc", name: "Een woord", language: "nl", from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items: [{ id: "c0", text: word, means: "to see" }] });
  ok(saved.ok, JSON.stringify(saved.errors));
  let at = T0;
  for (let i = 0; i < 24; i++) at = doLesson(at) + 60_000;
  // The first Practice day, of DAYS from `from`, that asks on the word itself (a game on the word: no sentence) and the first that asks it in a
  // sentence. Which day follows the planner's choices over the whole item list (7 Nov: days 5 and 9 on today's path-nl, 24 and 28 once 65
  // sentences more came), so the test asks that it comes within DAYS, not on a day. keep: the planner's steps as taken (the control's filter).
  const DAYS = 35;
  const onIt = (step) => step.unit === `w:${word}` || step.words?.includes(word) || step.item?.words?.some(([, lemma]) => lemma === word);
  const reaches = (from, keep = () => true) => {
    let wordDay = null;
    let sentenceDay = null;
    const kinds = new Set();
    for (let day = 0; day < DAYS && (wordDay === null || sentenceDay === null); day++) {
      for (const step of planSession("practice", undefined, from + day * DAY).steps.filter(keep)) {
        if (step.kind === "deck" || !onIt(step)) continue;
        kinds.add(step.item ? `sentence:${step.kind}` : step.kind);
        if (step.item) sentenceDay ??= day;
        else wordDay ??= day;
      }
    }
    return { wordDay, sentenceDay, kinds: [...kinds].sort() };
  };
  const unit = deckUnit("anki-een-woord-abc", "c0");
  record(cardRows({ text: word, means: "to see" }, answered(unit, at)));
  const from = at + 3_600_000;
  const got = reaches(from);
  ok(got.sentenceDay !== null, `no sentence with it in ${DAYS} days: ${got.kinds}`);
  ok(got.wordDay !== null, `no question on the word itself in ${DAYS} days (a sentence with it isn't one): ${got.kinds}`);
  // The control: a planner that never asks the card's word by itself (those steps dropped) fails it.
  ok(reaches(from, (step) => Boolean(step.item) || !onIt(step)).wordDay === null, "the control: with the word's own questions dropped, one still counted");
  return `the word itself by day ${got.wordDay}, in a sentence by day ${got.sentenceDay}: ${got.kinds.join(", ")}`;
});

await test("another language's pack is no part of this one's day", () => {
  on("my-finnish");
  on("my-words");
  const end = doLesson(T0);
  ok(plainStepsIn(planSession("practice", undefined, end)).every((step) => step.pack === "my-words"), "Finnish in Dutch");
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
