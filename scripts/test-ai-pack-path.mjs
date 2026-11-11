// A pack your AI makes comes next on your path (study/path.js chosen, content.js own, packs.js allPacks relayed), in plain Node on the real Dutch
// path and word series and the frequency list, each AI pack saved as the relay saves one (its change applied, through a relay seq):
//   - a new learner and one 40 lessons in: its lessons right after the unit they're in, under its own name, teaching its gap words and the other
//     new words its sentences need just before them, so every sentence of it can be played once its lessons are done; Study a topic plays it;
//   - three at once: each in the order it came, the written path going on after them, and how many lessons that is;
//   - a pack that grows after its lessons are done: the new words taught next, nothing it taught before taught again, none skipped;
//   - turned off or removed: the path exactly as it was; a pack of yours with no gaps (plain cards, as an imported deck) and one copied from a
//     public pack (not through the relay) never laid out this way.
// node scripts/test-ai-pack-path.mjs --list <frequency.nl.json>   (exit 0 = pass; 2 = no list given)
import "./fixtures/library-grammar.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearProgress, record, unitState } from "../public/js/study/progress.js";
import { lessonsSkippedBy, pathOverview, planSession } from "../public/js/study/plan.js";
import { WORD_PACKS, sentenceUnits } from "../public/js/study/content.js";
import { deletePack, savePack, setPackOn } from "../public/js/study/packs.js";
import { useFrequency } from "../public/js/study/frequency.js";
import { lemmasOf } from "../public/js/study/new-words.js";
import { pathLessons } from "../public/js/study/path.js";
import { clearPlaces } from "../public/js/study/path-place.js";
import { clearFinished, finishedLesson } from "../public/js/study/done.js";
import { resetStudySettings } from "../public/js/study/settings.js";
import { applyChange, storedItem } from "../public/js/study/pack-authoring.js";
import { PACK_FORMAT, PACK_VERSION } from "../public/js/study/pack-format.js";

const listAt = process.argv.indexOf("--list");
if (listAt < 0) {
  console.error("Usage: node scripts/test-ai-pack-path.mjs --list <frequency.nl.json>");
  process.exit(2);
}
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(readFileSync(join(APP, "packs", name), "utf8"));
for (const name of readdirSync(join(APP, "packs")).filter((n) => /^(path-nl|words-nl-\d+)\.json$/.test(n)).sort()) {
  const saved = await savePack(read(name));
  if (!saved.ok) throw new Error(`${name}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
useFrequency(JSON.parse(readFileSync(process.argv[listAt + 1], "utf8")));

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
async function test(name, fn) {
  await clearProgress();
  clearFinished();
  resetStudySettings();
  clearPlaces();
  for (const id of OURS) await deletePack(id).catch(() => {});
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(error?.stack ?? error).split("\n").slice(0, 6).join("\n      ")}`);
  }
}

// ---------- playing, as session.js records it (test-study.mjs's) ----------

function play(step, at) {
  if (step.kind === "meet") return record([{ concept: `p:${step.concept.pattern}`, at, outcome: "met", test: "self", skill: "read", activity: "meet", item: step.item?.id }]);
  if (step.kind === "see" || step.kind === "word") return record([{ concept: step.unit, at, outcome: "right", test: "pick", skill: "read", activity: step.kind }]);
  if (step.kind === "type-word" || step.kind === "say-word") return record([{ concept: step.unit, at, outcome: "right", test: "recall", skill: "say", activity: step.kind }]);
  if (step.kind === "repeat-word") return record([{ concept: step.unit, at, outcome: "right", test: "recall", skill: "sound", activity: step.kind }]);
  if (step.kind === "match") {
    return record([...step.words.map((word) => ({ concept: `w:${word}`, at, outcome: "right", test: "pick", skill: "read", activity: "match" })), ...(step.phrases ?? []).map((id) => ({ concept: `c:${id}`, at, outcome: "right", test: "pick", skill: "read", activity: "match" }))]);
  }
  const { item } = step;
  const test = ["type", "say", "type-gap", "hear-gap"].includes(step.kind) ? "recall" : "pick";
  const answerWords = step.kind === "translate" ? "right" : step.target ? null : "met";
  return record([
    ...sentenceUnits(item).map((concept) => ({ concept, at, outcome: "right", test, skill: step.skill ?? "read", activity: step.kind, item: item.id })),
    ...lemmasOf(item).map((word) => ({ concept: `w:${word}`, at, outcome: answerWords ?? (word === step.target ? "right" : "met"), test, skill: step.skill ?? "read", activity: step.kind, item: item.id })),
  ]);
}
/** A session played to its end, every answer right; a lesson finished. When it ended. */
function playSession(plan, at) {
  plan.steps.forEach((step, i) => play(step, at + i * 30_000));
  const end = at + plan.steps.length * 30_000;
  if (plan.lesson) finishedLesson(plan.lesson.id, end);
  return end;
}
/** The next lesson ("Learn something new"), played: its id. */
let clock = new Date(2026, 9, 1, 9).getTime();
function nextLessonPlayed() {
  const plan = planSession("lesson", undefined, clock);
  ok(plan.lesson, `no next lesson: ${plan.empty}`);
  clock = playSession(plan, clock) + 60_000;
  return plan.lesson.id;
}
const nextLessonId = () => planSession("lesson", undefined, clock).lesson?.id ?? null;

// ---------- your AI's packs, as the relay saves them ----------

const OURS = ["trip-utrecht", "ai-kitchen", "ai-office", "ai-copy", "ai-deck"];
let seq = 0;
const s = (sentence, lemmas, literal, natural, wrong, word, options, patterns = ["present"]) => ({ sentence, lemmas, literal, natural, wrong, gap: { word, options }, patterns });
const UTRECHT = [
  s("De trein heeft vertraging.", { De: "de", trein: "trein", heeft: "hebben", vertraging: "vertraging" }, ["The train", "has", "delay"], "The train is delayed.", ["De trein vertraging heeft."], "vertraging", ["vertraging", "vertragen", "vertraagd"]),
  s("Waar is het perron?", { Waar: "waar", is: "zijn", het: "het", perron: "perron" }, ["Where", "is", "the platform"], "Where is the platform?", ["Waar het perron is?"], "perron", ["perron", "station", "loket"], ["question"]),
  s("Ik koop een kaartje.", { Ik: "ik", koop: "kopen", een: "een", kaartje: "kaartje" }, ["I", "buy", "a ticket"], "I'm buying a ticket.", ["Ik koopt een kaartje."], "kaartje", ["kaartje", "brood", "boek"]),
  s("Mijn bagage is te zwaar.", { Mijn: "mijn", bagage: "bagage", is: "zijn", te: "te", zwaar: "zwaar" }, ["My luggage", "is", "too heavy"], "My luggage is too heavy.", ["Mijn bagage zijn te zwaar."], "bagage", ["bagage", "tas", "koffer"]),
  s("Het loket is gesloten.", { Het: "het", loket: "loket", is: "zijn", gesloten: "gesloten" }, ["The ticket window", "is", "closed"], "The ticket window is closed.", ["De loket is gesloten."], "loket", ["loket", "station", "kantoor"]),
  s("Een retour naar Utrecht, graag.", { Een: "een", retour: "retour", naar: "naar", graag: "graag" }, ["A return", "to Utrecht", "please"], "A return to Utrecht, please.", ["Een retour Utrecht naar, graag."], "retour", ["retour", "kaartje", "trein"]),
  s("De conducteur controleert de kaartjes.", { De: "de", conducteur: "conducteur", controleert: "controleren", kaartjes: "kaartje" }, ["The conductor", "checks", "the tickets"], "The conductor checks the tickets.", ["De conducteur de kaartjes controleert."], "conducteur", ["conducteur", "chauffeur", "piloot"]),
  s("Ik heb mijn hotel gereserveerd.", { Ik: "ik", heb: "hebben", mijn: "mijn", hotel: "hotel", gereserveerd: "reserveren" }, ["I have", "my hotel", "*booked*"], "I've booked my hotel.", ["Ik heb gereserveerd mijn hotel."], "hotel", ["hotel", "huis", "kamer"], ["perfect"]),
];
const KITCHEN = [
  s("De pan staat op het fornuis.", { De: "de", pan: "pan", staat: "staan", op: "op", het: "het", fornuis: "fornuis" }, ["The pan", "stands", "on the stove"], "The pan is on the stove.", ["De pan staan op het fornuis."], "fornuis", ["fornuis", "tafel", "bed"]),
  s("Ik snijd de ui.", { Ik: "ik", snijd: "snijden", de: "de", ui: "ui" }, ["I", "cut", "the onion"], "I'm cutting the onion.", ["Ik snijdt de ui."], "ui", ["ui", "appel", "brood"]),
  s("Waar is de vergiet?", { Waar: "waar", is: "zijn", de: "de", vergiet: "vergiet" }, ["Where", "is", "the colander"], "Where's the colander?", ["Waar de vergiet is?"], "vergiet", ["vergiet", "pan", "lepel"], ["question"]),
];
const OFFICE = [
  s("De printer is kapot.", { De: "de", printer: "printer", is: "zijn", kapot: "kapot" }, ["The printer", "is", "broken"], "The printer is broken.", ["De printer zijn kapot."], "printer", ["printer", "fiets", "deur"]),
  s("Ik heb een vergadering.", { Ik: "ik", heb: "hebben", een: "een", vergadering: "vergadering" }, ["I", "have", "a meeting"], "I have a meeting.", ["Ik hebt een vergadering."], "vergadering", ["vergadering", "fiets", "boek"]),
  s("Mijn collega belt.", { Mijn: "mijn", collega: "collega", belt: "bellen" }, ["My colleague", "calls"], "My colleague is calling.", ["Mijn collega bellen."], "collega", ["collega", "moeder", "buurman"]),
];
const WORDS = { trein: "train", vertraging: "delay", perron: "platform", kaartje: "ticket", bagage: "luggage", loket: "ticket window", retour: "return ticket", conducteur: "conductor", controleren: "to check", hotel: "hotel", reserveren: "to book", zwaar: "heavy", kopen: "to buy", gesloten: "closed", pan: "pan", fornuis: "stove", snijden: "to cut", ui: "onion", vergiet: "colander", printer: "printer", kapot: "broken", vergadering: "meeting", collega: "colleague", bellen: "to call", tunnel: "tunnel", spoor: "track", staan: "to stand" };

function itemsOf(inputs, taken = new Set()) {
  return inputs.map((input) => {
    const { item, problems } = storedItem(input, { language: "nl", taken });
    if (!item) throw new Error(JSON.stringify(problems));
    taken.add(item.id);
    return item;
  });
}
/** A pack as your AI's create_pack makes it, saved as the relay applies a change (through its seq). */
async function aiPack(id, name, inputs) {
  const pack = { format: PACK_FORMAT, version: PACK_VERSION, id, name, language: "nl", from: "en", topics: {}, words: WORDS, items: itemsOf(inputs) };
  seq++;
  const saved = await savePack(pack, { by: "oauth:Claude", through: seq, change: `pc_${seq}`, applied: `pc_${seq}` });
  ok(saved.ok, JSON.stringify(saved.errors?.slice(0, 3)));
  return pack;
}
const ofPack = (id) => pathLessons().filter((lesson) => lesson.pack === id);
const ids = () => pathLessons().map((lesson) => lesson.id);
const known = (lemma) => !unitState(`w:${lemma}`).isNew;
const unplayable = (pack) => pack.items.filter((item) => !lemmasOf(item).every(known)).map((item) => `${item.id}: ${lemmasOf(item).filter((l) => !known(l)).join(", ")}`);
/** Each lesson's words its pack's own, or ones its sentences need. */
const outside = (pack, lessons) => {
  const own = new Set(pack.items.flatMap((item) => lemmasOf(item)));
  return lessons.flatMap((lesson) => lesson.things.filter((thing) => thing.lemma && !own.has(thing.lemma)).map((thing) => `${lesson.id}: ${thing.lemma}`));
};
/** Plays "Learn something new" until a lesson of this pack is next (at most `most` lessons). How many it played. */
function playUntil(pred, most) {
  for (let n = 0; n <= most; n++) {
    if (pred(nextLessonId())) return n;
    nextLessonPlayed();
  }
  throw new Error(`not reached within ${most} lessons; next is ${nextLessonId()}`);
}

// ---------- the tests ----------

await test("a new learner: your AI's pack comes right after the unit they're in, under its name, teaching its words and its sentences' other new words; Study a topic plays it; every sentence playable after", async () => {
  const pack = await aiPack("trip-utrecht", "Trip to Utrecht", UTRECHT);
  const all = pathLessons();
  const lessons = ofPack(pack.id);
  ok(lessons.length > 0, "no lessons");
  const first = all.indexOf(lessons[0]);
  const before = all[first - 1];
  eq(before.unit?.id, all[0].unit.id, "what comes just before it: the first unit");
  ok(all.slice(first, first + lessons.length).every((lesson) => lesson.pack === pack.id), "its lessons apart");
  ok(lessons.every((lesson) => lesson.unit.title.startsWith("Trip to Utrecht") && lesson.title.startsWith("Trip to Utrecht: ")), `named: ${lessons[0].unit.title} / ${lessons[0].title}`);
  eq(outside(pack, lessons), [], "a word that's neither its own nor one its sentences need");
  // Through Study a topic, its lessons by themselves, from the very start: each played to its end.
  let played = 0;
  for (; played < 20; played++) {
    const plan = planSession("pack", pack.id, clock);
    if (!plan.lesson || plan.lesson.id.indexOf(`words/${pack.id}/`) !== 0) break;
    clock = playSession(plan, clock) + 60_000;
  }
  eq(played, lessons.length, "Study a topic played its lessons");
  // Its sentences need words the path's first unit teaches (de, het, ik, is…): the pack's lessons come after it, so once the unit's done too, all play.
  const missing = new Set(UTRECHT.length ? unplayable(pack).flatMap((line) => line.split(": ")[1].split(", ")) : []);
  const unit1 = new Set(all.filter((lesson) => lesson.unit?.id === all[0].unit.id).flatMap((lesson) => lesson.things.map((thing) => thing.lemma)));
  eq([...missing].filter((lemma) => !unit1.has(lemma)), [], "a word no lesson before its end teaches");
  return `${lessons.length} lessons after ${before.id}: ${lessons.map((lesson) => lesson.things.map((thing) => thing.lemma).join(" ")).join(" | ")}`;
});

await test("40 lessons in: your AI's pack is next, its words they know already behind them, and once its lessons are done every sentence plays and the path goes on where it was", async () => {
  for (let n = 0; n < 40; n++) nextLessonPlayed();
  const wasNext = nextLessonId();
  const pack = await aiPack("trip-utrecht", "Trip to Utrecht", UTRECHT);
  const lessons = ofPack(pack.id);
  ok(nextLessonId()?.startsWith(`words/${pack.id}/`), `next is ${nextLessonId()}`);
  const n = playUntil((id) => !id?.startsWith(`words/${pack.id}/`), lessons.length);
  eq(unplayable(pack), [], "sentences with a word not taught");
  eq(nextLessonId(), wasNext, "the path where it was");
  return `${n} lessons of it, then ${wasNext}`;
});

await test("three at once: each in the order it came, right after the unit they're in, the written path going on after them; how far that puts it", async () => {
  for (let n = 0; n < 40; n++) nextLessonPlayed();
  const wasNext = nextLessonId();
  const packs = [await aiPack("trip-utrecht", "Trip to Utrecht", UTRECHT), await aiPack("ai-kitchen", "In the kitchen", KITCHEN), await aiPack("ai-office", "At the office", OFFICE)];
  const all = pathLessons();
  const starts = packs.map((pack) => all.findIndex((lesson) => lesson.pack === pack.id));
  ok(starts.every((at, i) => at > 0 && (i === 0 || at > starts[i - 1])), `the order they came: ${starts}`);
  const total = packs.reduce((sum, pack) => sum + ofPack(pack.id).length, 0);
  const n = playUntil((id) => id === wasNext, total);
  ok(packs.every((pack) => unplayable(pack).length === 0), "a sentence not playable");
  return `${packs.map((pack) => `${pack.id} ${ofPack(pack.id).length}`).join(", ")} lessons; the path's next lesson after ${n} (at most their ${total})`;
});

await test("a pack that grows after its lessons are done: the new words come next, nothing it taught taught again, none skipped", async () => {
  for (let n = 0; n < 40; n++) nextLessonPlayed();
  const pack = await aiPack("trip-utrecht", "Trip to Utrecht", UTRECHT);
  playUntil((id) => !id?.startsWith(`words/${pack.id}/`), 20);
  const knownBefore = new Set(pack.items.flatMap((item) => lemmasOf(item)).filter(known));
  // Your AI adds two sentences, each for a new word: the relay's add, applied (pack-authoring.js applyChange) and saved through the next seq.
  const added = itemsOf(
    [
      s("De trein rijdt door de tunnel.", { De: "de", trein: "trein", rijdt: "rijden", door: "door", de: "de", tunnel: "tunnel" }, ["The train", "drives", "through the tunnel"], "The train goes through the tunnel.", ["De trein rijden door de tunnel."], "tunnel", ["tunnel", "brug", "straat"]),
      s("Het spoor is dicht.", { Het: "het", spoor: "spoor", is: "zijn", dicht: "dicht" }, ["The track", "is", "closed"], "The track is closed.", ["De spoor is dicht."], "spoor", ["spoor", "perron", "station"]),
    ],
    new Set(pack.items.map((item) => item.id)),
  );
  const grown = applyChange(pack, { kind: "add", items: added });
  ok(grown.pack, JSON.stringify(grown.problems ?? grown));
  seq++;
  ok((await savePack(grown.pack, { by: "oauth:Claude", through: seq, change: `pc_${seq}`, applied: `pc_${seq}` })).ok, "the grown pack wasn't kept");
  const next = planSession("lesson", undefined, clock);
  ok(next.lesson?.id.startsWith(`words/${pack.id}/`), `next is ${next.lesson?.id}`);
  // What it teaches: the steps that meet a word for the first time (isNew). A word it taught before may be asked again, as any lesson asks
  // what you know, never taught again.
  const taught = next.steps.filter((step) => step.isNew).map((step) => step.unit?.slice(2));
  const lesson = pathLessons().find((one) => one.id === next.lesson.id);
  const fresh = lesson.things.filter((thing) => thing.lemma && !known(thing.lemma)).map((thing) => thing.lemma);
  ok(fresh.includes("tunnel") || fresh.includes("spoor"), `its new words: ${fresh}`);
  eq(fresh.filter((lemma) => knownBefore.has(lemma)), [], "a word it taught before, taught again");
  ok(taught.length && taught.every((lemma) => !knownBefore.has(lemma)), `taught again: ${taught}`);
  playUntil((id) => !id?.startsWith(`words/${pack.id}/`), 10);
  eq(unplayable(grown.pack), [], "a sentence with a word skipped");
  return `next: ${lesson.id}, teaching ${taught.join(" ")}`;
});

await test("turned off or removed, the path is exactly as it was; a pack of yours with no gaps, and one not from your AI, never laid out so", async () => {
  const before = ids();
  const pack = await aiPack("trip-utrecht", "Trip to Utrecht", UTRECHT);
  ok(ids().length > before.length, "it didn't come");
  setPackOn(pack.id, false);
  eq(ids(), before, "turned off");
  setPackOn(pack.id, true);
  ok(ids().length > before.length, "back on");
  await deletePack(pack.id);
  eq(ids(), before, "removed");
  // The same sentences as a pack of yours that didn't come through your AI (a copy kept as yours: no relay): the series' way, not next.
  const copy = { format: PACK_FORMAT, version: PACK_VERSION, id: "ai-copy", name: "A copy", language: "nl", from: "en", topics: {}, words: WORDS, items: itemsOf(UTRECHT) };
  ok((await savePack(copy)).ok, "the copy wasn't kept");
  ok(!WORD_PACKS.find((one) => one.id === "ai-copy")?.own, "a copy counted as your AI's");
  ok(!pathLessons().some((lesson) => lesson.pack === "ai-copy" && lesson.chosen), "a copy laid out next");
  await deletePack("ai-copy");
  // Plain cards (an imported deck's kind), from your AI: no gaps, so no words to teach this way.
  seq++;
  const deck = { format: PACK_FORMAT, version: PACK_VERSION, id: "ai-deck", name: "A deck", language: "nl", from: "en", items: [{ id: "c1", text: "de trein", means: "the train" }, { id: "c2", text: "het perron", means: "the platform" }] };
  ok((await savePack(deck, { by: "oauth:Claude", through: seq, change: `pc_${seq}`, applied: `pc_${seq}` })).ok, "the deck wasn't kept");
  ok(!WORD_PACKS.some((one) => one.id === "ai-deck"), "plain cards taken for a pack written for its words");
  eq(ids(), before, "the path with the deck");
  return `${before.length} lessons, the same each time`;
});

await test("a pack's lesson studied by itself (Study a topic, or pressed on the path) marks no course lesson skipped; a jump ahead in the course still does", async () => {
  const pack = await aiPack("trip-utrecht", "Trip to Utrecht", UTRECHT);
  // Its lesson pressed on the path page asks to mark nothing done (lessonsSkippedBy: the jump bubble's question).
  eq(lessonsSkippedBy(ofPack(pack.id)[0].id, clock), [], "pressing the pack's lesson on the path counts course lessons as skipped");
  const plan = planSession("pack", pack.id, clock);
  ok(plan.lesson?.id.startsWith(`words/${pack.id}/`), `Study a topic opened ${plan.lesson?.id}`);
  clock = playSession(plan, clock) + 60_000;
  const states = () => pathOverview(40, clock).lessons;
  const skipped = (list) => list.filter((lesson) => lesson.state === "skipped").map((lesson) => lesson.id);
  eq(skipped(states()), [], "course lessons called skipped after a pack's lesson");
  eq(states().find((lesson) => lesson.id === plan.lesson.id)?.state, "done", "the pack's lesson itself");
  // The control: a lesson of the second unit played (a jump), and the first unit's lessons not done are skipped, as before.
  const all = pathLessons();
  const ahead = all.find((lesson) => !lesson.worked && !lesson.full && lesson.unit?.id !== all[0].unit.id);
  ok(lessonsSkippedBy(ahead.id, clock).length > 0, "a jump to the second unit skipping nothing");
  clock = playSession(planSession("lesson", ahead.id, clock), clock) + 60_000;
  ok(skipped(states()).some((id) => all.find((lesson) => lesson.id === id)?.unit?.id === all[0].unit.id), `a jump to ${ahead.id} left nothing skipped`);
  return `after ${plan.lesson.id} none skipped; after a jump to ${ahead.id}, ${skipped(states()).length} skipped`;
});

await test("five packs from your AI: the path laid out again in little more time than without them", async () => {
  // A layout from scratch, timed: the path module drops its layout whenever the packs change; turning one off and on is a change.
  const build = () => {
    setPackOn("path-nl", false);
    setPackOn("path-nl", true);
    const t0 = performance.now();
    pathLessons();
    return performance.now() - t0;
  };
  const median = (fn) => [fn(), fn(), fn()].sort((a, b) => a - b)[1];
  const without = median(build);
  const sets = [["trip-utrecht", "Trip to Utrecht", UTRECHT], ["ai-kitchen", "In the kitchen", KITCHEN], ["ai-office", "At the office", OFFICE]];
  for (const [id, name, inputs] of sets) await aiPack(id, name, inputs);
  // Two more, of the same sentences under other ids (their words then taught by the first: a pack that teaches nothing new).
  OURS.push("ai-copy-2", "ai-copy-3");
  await aiPack("ai-copy-2", "Trip again", UTRECHT);
  await aiPack("ai-copy-3", "Kitchen again", KITCHEN);
  const withFive = median(build);
  ok(withFive < without + 60, `${withFive.toFixed(0)} ms with five, ${without.toFixed(0)} ms without`);
  return `${without.toFixed(0)} ms without, ${withFive.toFixed(0)} ms with five`;
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
