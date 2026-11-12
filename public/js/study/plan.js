// Which steps a session gets. A step is { kind, item, meaning, skill?, mode?, again? } (kind: card · choose · arrange ·
// place · fill · type · listen · say · repeat) or { kind: "match", words, meaning }. meaning (new · slipping · review)
// is what the quick session's preview shows; skill is the strength the step is for (read · hear · say), and mode the
// version of its game that tests that strength (arrange: english · dutch; listen: meaning · order · type), which
// session.js uses where that game's setting is "mix"; again marks a missed sentence's retry.
//
// A quick session follows Settings → Study → Quick session (its length, how many new words, which ways of studying it
// can use) and what the scheduler says you know (progress.js), in this order:
//   1. Sentences you missed in the last two days: the same sentence in the same game once more (three at most). After
//      two retries that missed as well, the sentence rests and its units move on to other sentences.
//   2. What's due, lowest predicted recall first: a due word in a sentence you haven't had if one will do (new-words.js),
//      a due pattern in a sentence you can read, in a game that tests the strength that's due.
//   3. New words, most common first, in the room what's due leaves (it gets at least half): each met on its own card,
//      one word highlighted in a sentence you can follow, then asked about in another sentence near the end. None while
//      twice a session's worth is due, and half as many while your recent answers are under 80% right. Beside them, in
//      what room's left, a sentence or two you can now read: that's how patterns come in, once you know their words.
//   4. The weakest of the rest: words you've only just met, sentences you've played, then other words.
// A match round after the new words' cards (else in the middle) covers words, the ones due for reading first.
//
// A step that asks about a whole sentence (Choose, Arrange, Where does it go, Type, Listening, Say, Repeat) runs only
// when at most one word in it is new to you, or on a sentence you've already played: otherwise you'd be quizzed on the
// order of words nobody has taught you. A step about one word (a card, What does it mean?) runs on any sentence, since
// every other word's meaning is a tap away and costs nothing; Fill the gap needs at most one other new word. A step
// about one word names it: target.
//
// What Study and Today start is Practice (mode "practice", practiceOf below): what you know, mixed, on the scheduler's evidence. Learning is a choice
// you make: a lesson (mode "lesson", lesson.js) teaches a few new things by asking about them, and from then on they're in what you practice.
//
// Coming back after 3 or more days away (comeback): what's due is spread over as many days as you were away (a week at
// most), so today asks only today's share. The session is its usual size and still takes what you're most likely to
// have lost first; the share is what Today and Study count as due, and what decides whether new sentences fit in.

import { CHUNKS, ITEMS, PATTERNS, TOPICS, WORDS, WORD_PACKS, conceptsOf, contentLanguage, describe, onContentChange, sentenceUnits, writtenName } from "./content.js";
import { PAST_FIRST, fillChoices, firstSentenceOf, isHeavy, isNotFirst, lemmasOf, matchEnglish, meaningChoices, oneEnglishEach, pairsWithItself, sentenceForWord, sentenceWords, shortMeaning, targetOf, thingEnglish, warmSentences, warmWords, wordsInOrder, wordsWarm } from "./new-words.js";
import { lessonForms, pathBuild, pathLessons, pathThing, pathWarm, taughtForm, warmPath } from "./path.js";
import { spelledAlike } from "../lang/index.js";
import { pictureOfWord } from "./pictures.js";
import { lessonSteps, poolOf, seeStep, shownThing, speakWordStep, translateStep, typeWordStep, wordStep } from "./lesson.js";
import { ideaLine, ideaName } from "./idea-parts.js";
import { conceptLabel, focusNow } from "./concept-focus.js";
import { lastLessonFinished, lessonsFinished, practicedToday, practicesDone, practicesSinceLesson } from "./done.js";
import { addMarked, markedOn, placeAt, placeOn, placementOn } from "./path-place.js";
import { TESTS, canonicalUnit, conceptState, evidenceSince, evidenceVersion, gradeOf, itemEvidence, langOf, latestBefore, memoryNow, recentEvidence, record, studiedUnits, unitEvidence, unitState } from "./progress.js";
import { SKILLS, dueAtOf, recallAt } from "./scheduler.js";
import { indexed, stateOf, wordEntries, wordEntry, wordIndexVersion } from "../know/word-index.js";
import { DAY_STARTS, dayKey, dayNumber } from "../know/streak.js";
import { LENGTHS, WAYS, getStudySettings } from "./settings.js";
import { rankOf } from "./frequency.js";
import { learningFromName, learningName } from "./learning.js";
import { canMatchCard, deckInstead, deckSession, plainOfDay, plainShare, plainSteps } from "./deck.js";

// How a game is answered, as Study groups the games: tapping (picking, ordering, pairing), typing, speaking. Each GAMES entry has one, and
// Study cards (not a GAMES entry) is tapping.
export const GAME_MODES = [
  { id: "tap", name: "Tapping" },
  { id: "type", name: "Typing" },
  { id: "speak", name: "Speaking" },
];
/** A game's mode (GAME_MODES id): a GAMES key, or "card" for Study cards. */
export const modeOf = (kind) => (kind === "card" ? "tap" : GAMES[kind]?.mode ?? null);

// Each game, as Study lists it; the names and lines that mention a language name the one you're learning. mode: how it's answered (GAME_MODES).
export const GAMES = {
  choose: {
    name: "Choose",
    get about() {
      return `Pick the right ${learningName()} order`;
    },
    icon: "check",
    mode: "tap",
  },
  arrange: {
    get name() {
      return `Put it in ${learningName()} order`;
    },
    about: "Tap or drag the words into place",
    icon: "moved",
    mode: "tap",
  },
  place: {
    name: "Where does it go?",
    get about() {
      return `Put one word where ${learningName()} puts it`;
    },
    icon: "target",
    mode: "tap",
  },
  fill: { name: "Fill the gap", about: "Choose the missing word", icon: "pencil", mode: "tap" },
  meaning: { name: "What does it mean?", about: "One word in a sentence: pick its meaning", icon: "tag", mode: "tap" },
  match: {
    name: "Match",
    get about() {
      return `Pair ${learningName()} words with ${learningFromName()}`;
    },
    icon: "cards",
    mode: "tap",
  },
  type: {
    name: "Type it",
    get about() {
      return `Type the whole sentence in ${learningName()}`;
    },
    icon: "pencil",
    mode: "type",
  },
  // The typing twins: Pick the word's, Fill the gap's, and a heard sentence's one missing word.
  "type-word": { name: "Type the word", about: "Read the English, then type its word", icon: "pencil", mode: "type" },
  "type-gap": { name: "Type in the gap", about: "Type the missing word", icon: "pencil", mode: "type" },
  "hear-gap": { name: "Type what it says", about: "Hear a sentence, then type its missing word", icon: "ear", mode: "type" },
  see: { name: "Tap the picture", about: "See and hear a word, then tap what it is", icon: "cards", mode: "tap" },
  word: { name: "Pick the word", about: "Read the English, then tap its word", icon: "tag", mode: "tap" },
  // The sentence is said and shown (session.js), so its answers are evidence of reading it (progress.js TESTS: read).
  translate: { name: "What does it say?", about: "Hear and read a sentence, then build its English", icon: "moved", mode: "tap" },
  listen: { name: "Listening", about: "Hear a sentence, then show you understood it", icon: "ear", mode: "tap" },
  say: { name: "Say it", about: "Say it aloud", icon: "mic", mode: "speak" },
  repeat: { name: "Repeat after", about: "Hear a sentence, then say it back", icon: "speaker", mode: "speak" },
  // The speaking twins of the games about one word: Pick the word's (its English and drawing, said) and Tap the picture's (heard, said back).
  "say-word": { name: "Say the word", about: "Read the English, then say its word", icon: "mic", mode: "speak" },
  "repeat-word": { name: "Repeat the word", about: "Hear a word, then say it back", icon: "speaker", mode: "speak" },
};

/** Each kind of step's icon (the quick session's preview, the session itself). */
export const STEP_ICON = { see: "cards", word: "tag", translate: "moved", card: "book", choose: "check", arrange: "moved", place: "target", fill: "pencil", meaning: "tag", type: "pencil", match: "cards", listen: "ear", say: "mic", repeat: "speaker", "type-word": "pencil", "type-gap": "pencil", "hear-gap": "ear", "say-word": "mic", "repeat-word": "speaker" };

const DAY = 86_400_000;
const RETRY_WITHIN = 2 * DAY;
const RETRIES = 3; // sentences retried in one session, at most
const RETRY_RUN = 2; // a sentence missed this many times in a row is retried; once more, and it rests
const RIGHT_TARGET = 0.8; // below this share right lately, half the new words
const AWAY_DAYS = 3; // days in a row without studying a language that make coming back a comeback
const SPREAD_MOST = 7; // the pile spreads over this many days at most
const RECENT = 50; // answers that make "lately"
/** Steps few enough to go in a leg rather than a stop for so little. */
// Roughly, in minutes, what each kind of step takes; not timed yet.
const STEP_MINUTES = { meet: 0.2, match: 0.6 };
const WHOLE_GAMES = ["meaning", "choose", "arrange", "place", "fill", "listen"]; // the order the day's sentences go through them
const CONCEPT_GAMES = ["choose", "arrange", "place"]; // what a lesson's concept is asked with

// The games that test each strength, gentlest first, as [kind, mode].
const TESTERS = {
  read: [["meaning"], ["choose"], ["place"], ["arrange", "dutch"], ["fill"], ["card"]],
  say: [["arrange", "english"], ["type-gap"], ["type"], ["say", "english"]],
  hear: [["listen", "meaning"], ["listen", "order"], ["hear-gap"], ["listen", "type"], ["type", "audio"]],
};

// A missed step's game, to retry the sentence the same way.
const RETRY_STEP = {
  card: ["card"],
  choose: ["choose"],
  arrange: ["arrange", "dutch"],
  "arrange-english": ["arrange", "english"],
  place: ["place"],
  fill: ["fill"],
  meaning: ["meaning"],
  type: ["type"],
  "type-heard": ["type", "audio"],
  "type-gap": ["type-gap"],
  "hear-gap": ["hear-gap"],
  "listen-type": ["listen", "type"],
  "listen-meaning": ["listen", "meaning"],
  "listen-order": ["listen", "order"],
  say: ["say", "english"],
};

const wayOf = (kind) => (kind === "card" ? "cards" : kind);

// Whether this device can say a sentence (voice.js hearsItem: its recording, or a voice for its language; session.js sets it).
// A game that's nothing without the sound doesn't run on one it can't: another that fits takes its place, and nothing's said about it.
let hears = () => true;
export const setHearing = (fn) => {
  hears = fn ?? (() => true);
};
// Whether this device can say a word by itself (voice.js hearsWord: its recording, or a voice for its language); session.js sets it. Repeat the
// word isn't asked about one it can't.
let hearsWordHere = () => true;
export const setWordHearing = (fn) => {
  hearsWordHere = fn ?? (() => true);
};
// Whether a sentence, or a word as a game shows it, has a recording here (voice.js recordedItem, wordRecording: session.js sets them): a game
// about listening takes recorded ones first, since an iPhone's silent switch silences this device's voice but never a recording (8 Nov 2026:
// a Listening question read by the device's voice was silence). Unset (Node), nothing is.
let recordedHere = () => false;
export const setRecorded = (fn) => {
  recordedHere = fn ?? (() => false);
};
let wordRecordedHere = () => false;
export const setWordRecorded = (fn) => {
  wordRecordedHere = fn ?? (() => false);
};
/** The games about listening: a session of one of them takes what's recorded first. */
export const LISTENING_GAMES = new Set(["listen", "translate", "repeat", "hear-gap", "repeat-word"]);
// The recorded first, in the order they came (a stable sort).
const recordedFirst = (list, recorded) => [...list.filter(recorded), ...list.filter((one) => !recorded(one))];

/** The games that are nothing without the sound (Type it from what you hear too, by its setting). */
export const needsSound = (kind, s = getStudySettings()) => kind === "listen" || kind === "repeat" || kind === "hear-gap" || kind === "repeat-word" || (kind === "type" && s.type.from === "audio");
const canPlay = ([kind], item, s) => !needsSound(kind, s) || hears(item);

// Whether a game, in a version, can be played under these settings and ways allowed.
function usable([kind, mode], allowed, s) {
  if (!allowed.includes(wayOf(kind))) return false;
  if (kind === "arrange") return s.arrange.tiles === "mix" || s.arrange.tiles === mode;
  if (kind === "listen") return s.listen.mode === "mix" || s.listen.mode === mode;
  if (kind === "type") return (mode === "audio") === (s.type.from === "audio");
  if (kind === "say") return s.say.prompt === mode;
  return true;
}

// A step that asks about one word, whatever else is in its sentence.
const ABOUT_ONE_WORD = new Set(["card", "meaning"]);
/** The games about a sentence's gap (its pack's gap word): Fill the gap picks it, Type in the gap types it from the English, Type what it says from what you hear. */
const GAP_GAMES = new Set(["fill", "type-gap", "hear-gap"]);
/** The strength each gap game tests. */
const GAP_SKILL = { fill: "read", "type-gap": "say", "hear-gap": "hear" };

// Whether a step tests a word (not just shows it): the one a card or What does it mean? asks about, the gap you fill,
// every word you type or say, every word you type from what you hear.
function testsWord([kind, mode], item, lemma) {
  if (ABOUT_ONE_WORD.has(kind)) return lemma === null || item.words.some(([, word]) => word === lemma);
  if (GAP_GAMES.has(kind)) return targetOf(item) === lemma;
  return kind === "type" || (kind === "say" && mode === "english") || (kind === "listen" && mode === "type");
}

// What a step tests in its sentence: every sentence-level unit on its strength, and the words it asks for. Saying it
// right counts for reading it too (and for hearing it, said aloud), so a step for saying covers those as well.
function tested(step, item) {
  const out = new Set();
  if (!step.skill) return out;
  if (ABOUT_ONE_WORD.has(step.kind)) {
    if (step.target) out.add(`w:${step.target}|${step.skill}`);
    return out;
  }
  const skills = step.skill === "say" ? ["say", "read", ...(step.kind === "say" ? ["hear"] : [])] : [step.skill];
  for (const unit of conceptsOf(item)) {
    if (unit.startsWith("w:") && !testsWord([step.kind, step.mode], item, unit.slice(2))) continue;
    for (const skill of skills) out.add(`${unit}|${skill}`);
  }
  return out;
}

// Which due strength of a unit to test: the least likely to be recalled; between two within 5 points, the one whose
// right answer counts for more (saying counts for reading too).
const COUNTS_FOR = { say: 2, hear: 1, read: 0 };
const dueSkill = (s) =>
  s.trained
    .filter((k) => s.strengths[k]?.due)
    .sort((a, b) => {
      const gap = s.strengths[a].recall - s.strengths[b].recall;
      return Math.abs(gap) > 0.05 ? gap : COUNTS_FOR[b] - COUNTS_FOR[a];
    })[0];

// The scheduler's view of every unit, once per plan. Reading what's due (Today and Study draw several times as they start, and each asks for it more than once) shares the part
// that costs while nothing it reads has changed: a second's work on a phone, in the app's first draw, each time. A plan itself works it out new, with the time to the millisecond.
let contentChanges = 0;
onContentChange(() => contentChanges++);
let shared = null;
const SHARED_FOR = 60_000;
const sharedKey = () => `${evidenceVersion()}|${contentChanges}|${contentLanguage()}`;
const sharedFresh = (now) => shared?.key === sharedKey() && shared.hears === hears && Math.abs(now - shared.now) <= SHARED_FOR;
function readingContext(now) {
  if (!sharedFresh(now)) shared = { key: sharedKey(), hears, now, view: viewOf(now) };
  return withPlanState(shared.view);
}

/**
 * What Home's plan reads, worked out a piece at a time (a generator for know/slices.js inSlices), so after the study material changes no task
 * holds the page for long: the words' order (new-words.js), the path (path.js), then the scheduler's view of every unit at `now`. Then
 * studyOverview and comebackNow at about `now` have them at once. Each part left as it is when it's already worked out; one the study material
 * or the evidence changes under is left to be asked for again.
 */
export function* warmPlan(now = Date.now()) {
  yield* warmWords();
  yield;
  yield* warmPath();
  yield;
  if (!sharedFresh(now)) {
    const key = sharedKey();
    const view = yield* viewSteps(now);
    if (key !== sharedKey()) return;
    shared = { key, hears, now, view };
    yield;
  }
  // Practice's pool over that view, which Home's overview counts from.
  yield* poolSteps(withPlanState(shared.view));
}
// How many of the next new words warmGames works the pick's sentences out for: a game meets up to nine, a session's new words a few.
const WARM_NEXT = 12;
/**
 * What a session's first step reads of the study material, a piece at a time (study/warm-idle.js, while the page is idle): the words' pass
 * and order, each sentence's words, and the sentences of the next new words (the first in order the word index has nothing on) as the
 * pick reads them. Caches of the study material only: a plan is the same with or without them, only sooner (a brand-new learner's first
 * game took 0.4–0.5 s slowed 4× working them out after the tap, 7 Nov 2026).
 */
export function* warmGames() {
  yield* warmWords();
  yield;
  placesInOrder();
  yield;
  yield* warmPath();
  yield;
  yield* placesSteps();
  yield;
  const lang = contentLanguage();
  // What the content alone says of each word (contentKnows, as a plan's known() fills it): a new learner's plan asks it of thousands.
  const byContent = contentKnows(lang);
  let i = 0;
  for (const lemma of wordsInOrder()) {
    if (++i % KNOWS_PIECE === 0) {
      yield;
      if (contentKnows(lang) !== byContent) return;
    }
    if (byContent.has(lemma)) continue;
    if (!WORDS[lemma]) byContent.set(lemma, true);
    else if (wordEntry(`w:${lemma}`, { lang }) === null) byContent.set(lemma, false);
  }
  yield;
  // Each sentence's count of what's new to someone who has met nothing (freshIn), while nothing is in the word index.
  if (wordEntries({ lang }).length === 0) {
    const build = contentChanges;
    for (let i = 0; i < ITEMS.length; i++) {
      if (i && i % FRESH_PIECE === 0) {
        yield;
        if (build !== contentChanges) return;
      }
      freshIn(ITEMS[i]);
    }
    yield;
  }
  yield* warmSentences(function* () {
    for (const lemma of wordsInOrder()) if (wordEntry(`w:${lemma}`, { lang }) === null) yield lemma;
  }, WARM_NEXT);
}
// Words a piece of warmGames asks the word index about.
const KNOWS_PIECE = 1500;
// Sentences a piece of warmGames counts the new things of (freshIn).
const FRESH_PIECE = 400;
/**
 * Why Home's plan at `now` would be worked out again, or null (it's warm): "evidence" (answers since the view: what's next may have changed,
 * and a plan works the view out at once, test-plan-speed's re-plan), "content" (the study material changed: the words' order, the path, the
 * pool's things; the long part, warmPlan's), "time" (only time since the view, or the voices: what's next is very likely the same).
 */
export function planStale(now = Date.now()) {
  if (!wordsWarm() || !pathWarm()) return "content";
  if (!shared) return "content";
  if (shared.key !== sharedKey()) return shared.key.split("|")[0] !== String(evidenceVersion()) ? "evidence" : "content";
  if (poolsOf.get(shared.view.st)?.build !== pathBuild()) return "content";
  return sharedFresh(now) ? null : "time";
}
/** Whether Home's plan at `now` is worked out (warmPlan has nothing to do): its first draw is then short. */
export const planWarm = (now = Date.now()) => wordsWarm() && pathWarm() && sharedFresh(now) && poolsOf.get(shared.view.st)?.build === pathBuild();
function context(now, focus = null) {
  return withPlanState(viewOf(now, focus));
}
/**
 * A unit's state at `now` for a plan, as unitState gives it, read from the word index (know/word-index.js) with nothing replayed: a year's
 * learner has thousands of units, and replaying each was most of Home's first draw (2.8 s on a phone slowed 4×, 6 Nov 2026). Each strength's
 * recall comes from the curve the index keeps (its stability and last review); how many reviews it's had, which one step reads, is a replay
 * of that unit when it's asked. A unit the index doesn't keep (a pack's plain card) is unitState's.
 */
function planState(unit, lang, now, memory) {
  if (!indexed(unit)) return unitState(unit, { lang, now });
  const entry = wordEntry(unit, { lang });
  const s = entry ? stateOf(unit, { lang, now }) : null;
  const strengths = {};
  for (const skill of SKILLS) {
    const kept = entry?.[skill];
    strengths[skill] = kept && s.strengths[skill] ? { ...s.strengths[skill], recall: recallAt(unit[0], { stability: kept.stability, last_review: kept.last }, now) } : null;
  }
  const state = s
    ? { ...s, strengths }
    : { unit, kind: null, isNew: true, level: 0, trained: memory.train, strengths, due: false, dueAt: 0, slipping: false, firstAt: 0, lastAt: 0 };
  let reviews = null;
  Object.defineProperty(state, "reviews", { enumerable: true, get: () => (reviews ??= s ? unitState(unit, { lang, now }).reviews : 0) });
  return state;
}

/**
 * One sentence as a plan sees it: { item, order, units, rows, words, isNew, played (you've answered something on it: a card you only read leaves its
 * sentence unplayed), level, due, slipping, lastAt }, each field worked out when it's first read. A year's learner has 16,000 sentences, and Home's
 * plan reads a field or two of most of them.
 */
class ItemInfo {
  constructor(item, order, st, lang) {
    this.item = item;
    this.order = order;
    this.st = st;
    this.lang = lang;
  }
  get units() {
    return (this.units_ ??= conceptsOf(this.item));
  }
  get rows() {
    return (this.rows_ ??= itemEvidence(this.item.id, this.lang));
  }
  get words() {
    return (this.words_ ??= sentenceWords(this.item));
  }
  get isNew() {
    return this.rows.length === 0;
  }
  get played() {
    return (this.played_ ??= this.rows.some((row) => gradeOf(row)));
  }
  get whole() {
    return (this.whole_ ??= sentenceUnits(this.item).map(this.st));
  }
  get level() {
    return (this.level_ ??= Math.min(...this.whole.map((s) => s.level)));
  }
  get due() {
    return (this.due_ ??= this.units.some((unit) => this.st(unit).due));
  }
  get slipping() {
    return (this.slipping_ ??= this.whole.some((s) => s.slipping));
  }
  get lastAt() {
    return this.rows.length ? this.rows.at(-1).at : 0;
  }
}

// Where each unit first comes in the sentences, in conceptsOf's order (a sentence's ideas and phrases, then its words): { at(unit) (a number to
// sort by, or undefined for a unit no sentence has), item(unit) (the index of the first sentence with it), others (the ideas and phrases) }.
// The words' first sentences are new-words.js's (worked out once each time the study material changes); within its sentence, a word's place is
// read when it's asked for, so a start reads the sentences once.
const SLOTS = 4096;
let unitPlaces = null;
onContentChange(() => (unitPlaces = null));
function placesOfUnits() {
  if (unitPlaces) return unitPlaces;
  const steps = placesSteps();
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
// The same a piece at a time (a yield every VIEW_PIECE sentences), for warmPlan.
function* placesSteps() {
  if (unitPlaces) return unitPlaces;
  const build = contentChanges; // kept only if the study material is still what it was made from
  const others = new Map(); // "p:…" / "c:…" → place
  for (let i = 0; i < ITEMS.length; i++) {
    if (i && i % VIEW_PIECE === 0) {
      yield;
      if (unitPlaces) return unitPlaces;
    }
    const item = ITEMS[i];
    let k = 0;
    for (const id of item.concepts) {
      if (!others.has(`p:${id}`)) others.set(`p:${id}`, i * SLOTS + k);
      k++;
    }
    for (const id of item.chunks ?? []) {
      if (!others.has(`c:${id}`)) others.set(`c:${id}`, i * SLOTS + k);
      k++;
    }
  }
  const words = new Map();
  const wordAt = (lemma) => {
    if (words.has(lemma)) return words.get(lemma);
    const i = firstSentenceOf(lemma);
    let place;
    if (i !== undefined) {
      const item = ITEMS[i];
      // A word's place within its sentence counts every word before it, not only the different ones: the order comes out the same.
      place = i * SLOTS + item.concepts.length + (item.chunks?.length ?? 0) + item.words.findIndex((word) => word[1] === lemma);
    }
    words.set(lemma, place);
    return place;
  };
  const at = (unit) => (unit.startsWith("w:") ? wordAt(unit.slice(2)) : others.get(unit));
  const places = { at, item: (unit) => Math.floor(at(unit) / SLOTS), others };
  if (build === contentChanges) unitPlaces = places;
  return places;
}
const hasUnit = (item, unit) => (unit.startsWith("w:") ? item.words.some(([, lemma]) => lemma === unit.slice(2)) : sentenceUnits(item).includes(unit));
// Whether something this device can say has a unit (and, kept to some concepts, is one of theirs): from the first sentence that has it on.
function heardIn(unit, places, kept) {
  for (let i = places.item(unit); i < ITEMS.length; i++) {
    const item = ITEMS[i];
    if (hasUnit(item, unit) && (!kept || conceptsOf(item).some((one) => kept.has(one))) && hears(item)) return true;
  }
  return false;
}

/** focus: the concepts a session keeps to (concept-focus.js), or null: then only sentences with one of them, and only their words for the word games. */
function viewOf(now, focus = null) {
  const steps = viewSteps(now, focus);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
// Sentences a piece of the view takes before it yields (warmPlan): a few ms on a phone slowed 4×.
const VIEW_PIECE = 2000;
function* viewSteps(now, focus = null) {
  const states = new Map();
  const memory = memoryNow();
  const lang = contentLanguage();
  const st = (unit) => {
    if (!states.has(unit)) states.set(unit, planState(unit, lang, now, memory));
    return states.get(unit);
  };
  const kept = focus?.length ? new Set(focus.map((id) => `p:${id}`)) : null;
  const infos = [];
  const byId = new Map(); // made as they come, so no piece makes it whole
  for (let order = 0; order < ITEMS.length; order++) {
    if (order && order % VIEW_PIECE === 0) yield;
    const info = new ItemInfo(ITEMS[order], order, st, lang);
    if (kept && !info.units.some((unit) => kept.has(unit))) continue;
    infos.push(info);
    byId.set(info.item.id, info);
  }
  yield;
  // Units the deck can practice that are due, each with the strength that's due (the lowest recall, if two are), in the order the sentences first have
  // them. Only a unit with evidence can be due: one the word index has met (a pack's own idea by the shared one it's the same as).
  const places = unitPlaces ?? (yield* placesSteps());
  yield;
  const met = wordEntries({ lang, kinds: /^[wcp]:/ }).map((entry) => entry.unit);
  const metSet = new Set(met);
  const inView = kept ? new Set(infos.flatMap((info) => info.units)) : null;
  // Whether it's due, read from the index's entry as stateOf reads it (a strength you train due by its kept curve), so only what's due gets a
  // state worked out and a place looked up: a year's learner has met 20,000 units, and a few hundred are due.
  const dueNow = (unit) => {
    const entry = wordEntry(unit, { lang });
    if (!entry) return false;
    for (const skill of memory.train) {
      const s = entry[skill];
      if (s && dueAtOf(unit[0], s.stability, s.last, memory.target) <= now) return true;
    }
    return false;
  };
  // (Every met unit's curve read, a piece at a time.)
  const dueWords = [];
  for (let i = 0; i < met.length; i++) {
    if (i && i % (VIEW_PIECE * 2) === 0) yield;
    const unit = met[i];
    if (unit.startsWith("w:") && dueNow(unit) && places.at(unit) !== undefined) dueWords.push(unit);
  }
  yield;
  const order = [...dueWords, ...[...places.others.keys()].filter((unit) => metSet.has(unit.startsWith("p:") ? canonicalUnit(unit, lang) : unit) && dueNow(unit))]
    .filter((unit) => !inView || inView.has(unit))
    .sort((a, b) => places.at(a) - places.at(b));
  yield;
  const due = [];
  for (let i = 0; i < order.length; i++) {
    if (i && i % 200 === 0) yield;
    const unit = order[i];
    const s = st(unit);
    if (!s.due) continue;
    let skill = dueSkill(s);
    // Hearing it can't come due where nothing could say it: the next strength due, or nothing today.
    if (skill === "hear" && !heardIn(unit, places, kept)) {
      skill = ["read", "say"].filter((other) => s.strengths[other]?.due).sort((a, b) => s.strengths[a].recall - s.strengths[b].recall)[0];
      if (!skill) continue;
    }
    due.push({ unit, skill, recall: s.strengths[skill].recall, level: s.strengths[skill].level, slipping: s.slipping });
  }
  due.sort((a, b) => a.recall - b.recall || rankOfUnit(a.unit) - rankOfUnit(b.unit));
  yield;
  // Kept to some concepts: the words and phrases of their sentences are what the word games may ask.
  const focused = kept ? { ids: focus, units: new Set(infos.flatMap((info) => [...info.words.map((word) => `w:${word}`), ...(info.item.chunks ?? []).map((id) => `c:${id}`)])) } : null;
  return { st, infos, due, now, byId, focus: focused };
}
/** What a plan reads at `now` (its unit states, the sentences, what's due): for scripts/test-plan-speed.mjs, which holds it to unitState. */
export const planView = (now = Date.now()) => viewOf(now);

// What the content alone says of a word with no entry in the word index (known only if it has no meaning to teach), kept across plans
// until the content, the word index or the language changes: a new learner's plan asks about thousands of words.
let contentKnown = null;
function contentKnows(lang) {
  const key = `${contentChanges}|${wordIndexVersion()}|${lang}`;
  if (contentKnown?.key !== key) contentKnown = { key, map: new Map() };
  return contentKnown.map;
}

// What the content alone says is new in a sentence: its words with a meaning and its phrases, counted as newInAtMost counts them, for a plan
// with nothing in the word index and nothing met yet (a brand-new learner's first steps). Once a sentence for the content (warmGames ahead).
let freshCounts = null;
function freshIn(item) {
  if (freshCounts?.build !== contentChanges) freshCounts = { build: contentChanges, map: new WeakMap() };
  let n = freshCounts.map.get(item);
  if (n === undefined) {
    n = 0;
    for (const lemma of sentenceWords(item)) if (WORDS[lemma]) n++;
    for (const unit of conceptsOf(item)) if (unit.startsWith("c:")) n++;
    freshCounts.map.set(item, n);
  }
  return n;
}

// Each word's place in wordsInOrder(), kept while the order is the same array.
let orderPlaces = null;
function placesInOrder() {
  const words = wordsInOrder();
  if (orderPlaces?.words !== words) orderPlaces = { words, at: new Map(words.map((lemma, i) => [lemma, i])) };
  return orderPlaces.at;
}

/** What one plan keeps as it goes, over the view. */
// A placement's assumed words (study/placement.js): the words and phrases of the lessons it put you past that nothing has graded since and that
// you didn't miss in it. Read as known where the plan decides what you can read (known, phraseNew, a sentence's words: so the unit it placed you
// at plays whole), never counted (Knowledge reads evidence alone), never due. Worked out once a view (its st), placement and laying out of the path.
const NONE = new Set();
const assumedFor = new WeakMap(); // st → { at, build, set }
function assumedOf(st) {
  const placed = placementOn(contentLanguage())?.placed;
  if (!placed?.lessons?.length) return NONE;
  const kept = assumedFor.get(st);
  if (kept && kept.at === placed.at && kept.build === pathBuild()) return kept.set;
  const ids = new Set(placed.lessons);
  const missed = new Set(placed.missed ?? []);
  const set = new Set();
  for (const lesson of pathLessons()) {
    if (!ids.has(lesson.id)) continue;
    for (const thing of lesson.things ?? []) if (!thing.formOnly && !missed.has(thing.lemma ?? thing.phrase) && st(thing.unit).isNew) set.add(thing.unit);
  }
  assumedFor.set(st, { at: placed.at, build: pathBuild(), set });
  return set;
}
// The lessons a placement counts as done (its record's: the units before the one it placed you at). None without one.
function placedLessonsNow() {
  const ids = placementOn(contentLanguage())?.placed?.lessons;
  return ids?.length ? new Set(ids) : NONE;
}

function withPlanState({ st, infos, due, now, byId, focus }) {
  // The words met in this plan count as known for the steps after them.
  const meeting = new Set();
  // A placement's words nothing has tested since: known for what you can read, never counted.
  const assumed = assumedOf(st);
  const placed = placedLessonsNow();
  // A word with no meaning in any pack can't be taught, so it never stands in a sentence's way. What the view says of a word is read once
  // a plan (the view's states don't change under it; the words met in this plan are asked first, each time).
  // A word the word index has no entry for is new (planState), so its state isn't worked out just to say so: a new learner's plan asks
  // about thousands of words, and each state was an object made for nothing.
  const viewKnows = new Map();
  const lang = contentLanguage();
  const byContent = contentKnows(lang);
  const known = (lemma) => {
    if (meeting.has(lemma)) return true;
    if (assumed.size && assumed.has(`w:${lemma}`)) return true;
    let k = byContent.get(lemma);
    if (k !== undefined) return k;
    k = viewKnows.get(lemma);
    if (k === undefined) {
      const unit = `w:${lemma}`;
      if (!WORDS[lemma]) byContent.set(lemma, (k = true));
      else if (wordEntry(unit, { lang }) === null) byContent.set(lemma, (k = false));
      else viewKnows.set(lemma, (k = !st(unit).isNew));
    }
    return k;
  };
  // The same for a phrase: one with no entry is new.
  const phraseNew = (unit) => !assumed.has(unit) && (wordEntry(unit, { lang }) === null || st(unit).isNew);
  // Whether you know enough for a flagged sentence to start a word (new-words.js).
  let past = null;
  const pastFirst = () => {
    // Every word that isn't new has an entry in the word index (planState): with fewer entries than PAST_FIRST, no need to ask each word.
    if (past === null && wordEntries({ lang: contentLanguage(), kinds: /^w:/ }).length < PAST_FIRST) past = false;
    if (past === null) {
      let count = 0;
      for (const lemma of wordsInOrder()) if (!st(`w:${lemma}`).isNew && ++count >= PAST_FIRST) break;
      past = count >= PAST_FIRST;
    }
    return past;
  };
  // Nothing in the word index (no word or phrase met) and nothing met in this plan yet: every word with a meaning and every phrase is new, so
  // a sentence's count is the content's alone (freshIn), less `except` where it's one of them.
  let indexEmpty = null;
  const blank = () => meeting.size === 0 && !assumed.size && (indexEmpty ??= wordEntries({ lang }).length === 0);
  const freshBut = (info, except) => freshIn(info.item) - (except !== null && WORDS[except] && info.words.includes(except) ? 1 : 0);
  // How many of a sentence's words are new to you, other than `except`.
  const newIn = (info, except = null) => {
    if (blank()) return freshBut(info, except);
    const words = info.words.reduce((n, lemma) => n + (lemma !== except && !known(lemma) ? 1 : 0), 0);
    // A fixed phrase you haven't met is one new thing: it's learned whole.
    return words + info.units.filter((unit) => unit.startsWith("c:") && phraseNew(unit) && !meeting.has(unit)).length;
  };
  // Whether newIn(info, except) <= cap, counting no further than past it: most sentences have several new words for a new learner, and the
  // games ask this of every sentence there is.
  const newInAtMost = (info, cap, except = null) => {
    if (blank()) return freshBut(info, except) <= cap;
    let n = 0;
    for (const lemma of info.words) if (lemma !== except && !known(lemma) && ++n > cap) return false;
    for (const unit of info.units) if (unit.startsWith("c:") && phraseNew(unit) && !meeting.has(unit) && ++n > cap) return false;
    return true;
  };
  // The words in rank order that are known, for "What does it mean?"'s wrong choices (meaningChoices): once a plan, again after a word is met.
  let rankedKnown = null;
  let rankedAt = -1;
  const knownRanked = () => {
    if (rankedAt !== meeting.size) {
      // Nothing in the word index: every word in the order has a meaning, so the known ones are those met in this plan, in the order's order.
      if (indexEmpty ?? (indexEmpty = wordEntries({ lang }).length === 0)) {
        const order = placesInOrder();
        rankedKnown = [...meeting].filter((lemma) => order.has(lemma)).sort((a, b) => order.get(a) - order.get(b));
      } else rankedKnown = wordsInOrder().filter(known);
      rankedAt = meeting.size;
    }
    return rankedKnown;
  };
  // Nothing studied in this language: no sentence has been had, so none is resting (resting reads a sentence's own history).
  let noHistory = null;
  const unstudied = () => (noHistory ??= studiedUnits(contentLanguage()).length === 0);
  return { st, infos, due, now, byId, focus, meeting, known, knownRanked, unstudied, newIn, newInAtMost, pastFirst, assumed, placed, canHear: (item) => hears(item), patternName: (id) => PATTERNS[id]?.name };
}

// Patterns and phrases in the order the deck first teaches them (until patterns name what they build on, the deck's
// order is the best guide to which comes first). Worked out once each time the study material changes (content.js
// tells its listeners after every change): it's read inside sorts, so working it out on each read made a plan over
// 2,000 sentences take most of a second, and over 20,000 most of a minute.
let taught = null;
onContentChange(() => (taught = null));
function taughtOrder() {
  if (taught) return taught;
  const order = new Map();
  for (const item of ITEMS) for (const unit of sentenceUnits(item)) if (!order.has(unit)) order.set(unit, order.size);
  return (taught = order);
}

// How deep a pattern sits in what builds on what (PATTERNS[id].after): 0 for one that needs nothing first.
function depthOf(unit, seen = new Set()) {
  if (!unit.startsWith("p:") || seen.has(unit)) return 0;
  seen.add(unit);
  const after = (PATTERNS[unit.slice(2)]?.after ?? []).filter((id) => PATTERNS[id]);
  return after.length ? 1 + Math.max(...after.map((id) => depthOf(`p:${id}`, seen))) : 0;
}

// A unit's place in line among equals: patterns after what they build on (then as the deck teaches them), phrases as
// the deck teaches them, words by how common they are.
const rankOfUnit = (unit) => (unit.startsWith("w:") ? rankOf(unit.slice(2), contentLanguage()) : depthOf(unit) * 1000 + (taughtOrder().get(unit) ?? 999));

// The sentence's past steps, oldest first (rows recorded together are one step).
function historyOf(info) {
  const steps = [];
  for (const row of info.rows) {
    if (steps.at(-1)?.at === row.at) steps.at(-1).rows.push(row);
    else steps.push({ at: row.at, rows: [row] });
  }
  return steps;
}
const missed = (step) => step.rows.some((row) => gradeOf(row) === "again");

// A sentence to retry: its last step missed, in the last two days, and not yet missed too many times in a row.
function retryOf(info, now) {
  const steps = historyOf(info);
  let run = 0;
  for (let i = steps.length - 1; i >= 0 && now - steps[i].at <= RETRY_WITHIN && missed(steps[i]); i--) run++;
  if (!run || run > RETRY_RUN) return null;
  const last = steps.at(-1);
  const word = last.rows.find((row) => gradeOf(row) === "again" && row.concept.startsWith("w:"))?.concept.slice(2) ?? null;
  return { at: last.at, game: RETRY_STEP[last.rows[0].activity] ?? null, word };
}

// Resting: missed three times in a row in the last two days. Its units are served by other sentences for now.
function resting(info, now) {
  const steps = historyOf(info);
  let run = 0;
  for (let i = steps.length - 1; i >= 0 && now - steps[i].at <= RETRY_WITHIN && missed(steps[i]); i--) run++;
  return run > RETRY_RUN;
}

// The share right lately (null with too few answers to tell).
function recentRight() {
  const graded = recentEvidence(RECENT * 4)
    .map(gradeOf)
    .filter(Boolean)
    .slice(-RECENT);
  return graded.length >= 10 ? graded.filter((grade) => grade !== "again").length / graded.length : null;
}

// The weakest trained strength of a sentence's own units (a focus for a step with nothing due).
function weakestFocus(info, ctx) {
  let best = null;
  for (const unit of sentenceUnits(info.item)) {
    const s = ctx.st(unit);
    for (const skill of s.trained) {
      const strength = s.strengths[skill];
      const recall = strength ? strength.recall : -1;
      if (!best || recall < best.recall) best = { unit, skill, recall, level: strength?.level ?? 0 };
    }
  }
  return best;
}

// What a whole-sentence game needs of the sentence itself, wherever it's planned (a lesson's, Practice's, a game alone): Where does it go?
// a word that moved from where English has it (8 Nov 2026: alone, it asked "Het boek is goed." where goed goes, nothing moved), Which one
// is it? wrong sentences to choose from, Put it in order two words or more.
export function sentenceCanPlay(kind, item) {
  if (kind === "place") return Boolean(item.moved?.length);
  if (kind === "choose") return Boolean(item.wrong?.length);
  if (kind === "arrange") return item.words.length > 1;
  return true;
}

// Whether a step can be asked on this sentence (the rule at the top of this file). What does it mean? needs choices.
function fits([kind], info, ctx, target) {
  if (kind === "card") return true;
  if (!sentenceCanPlay(kind, info.item)) return false;
  if (kind === "meaning") return Boolean(target) && Boolean(meaningChoices(target, info.item, { known: ctx.known, knownRanked: ctx.knownRanked() }));
  if (kind === "fill") return Boolean(info.item.gap) && ctx.known(targetOf(info.item)) && ctx.newInAtMost(info, 1, targetOf(info.item)) && Boolean(fillChoices(info.item, { known: ctx.known }));
  // Typing the gap's word asks for a word you know, in a sentence you can read around it.
  if (kind === "type-gap" || kind === "hear-gap") return Boolean(info.item.gap) && Boolean(targetOf(info.item)) && ctx.known(targetOf(info.item)) && ctx.newInAtMost(info, 1, targetOf(info.item));
  // (Nothing studied in this language: no sentence has been played.)
  return ctx.newInAtMost(info, 1) || (!ctx.unstudied() && info.played);
}

// The word a step about one word asks about: the focus's, else a new word of the sentence (its own first), else its own.
function targetFor(info, focus, ctx) {
  if (focus?.unit.startsWith("w:")) return focus.unit.slice(2);
  const own = targetOf(info.item);
  if (own && !ctx.known(own)) return own;
  return info.words.find((lemma) => !ctx.known(lemma) && WORDS[lemma]) ?? own ?? info.words[0] ?? null;
}

// A game for an item: one that tests the focus strength (gentle while it's weak, the strongest once it's known), else
// one that suits how well the sentence is known. Varied, so the same game doesn't come twice in a row.
function gameFor(info, focus, previous, allowed, s, ctx) {
  const target = targetFor(info, focus, ctx);
  const about = (kind) => (ABOUT_ONE_WORD.has(kind) || GAP_GAMES.has(kind) ? { target: GAP_GAMES.has(kind) ? targetOf(info.item) : target } : {});
  if (focus) {
    const word = focus.unit.startsWith("w:") ? focus.unit.slice(2) : null;
    // A word: the games that test it. A pattern or a phrase: the whole-sentence games, a card only when nothing else is left.
    let list = TESTERS[focus.skill].filter((tester) => (word ? testsWord(tester, info.item, word) : tester[0] !== "meaning"));
    if (focus.level >= 3) list = [...list].reverse();
    else if (focus.level === 2) list = [...list.slice(1), list[0]].filter(Boolean);
    const ok = list.filter((tester) => usable(tester, allowed, s) && fits(tester, info, ctx, target) && canPlay(tester, info.item, s));
    const pick = ok.find(([kind]) => kind !== previous) ?? ok[0];
    if (pick) return { kind: pick[0], ...(pick[1] && pick[0] !== "type" ? { mode: pick[1] } : {}), skill: focus.skill, ...about(pick[0]) };
    if (word) return null;
  }
  const ladder =
    info.level <= 1
      ? ["choose", "place", "arrange", "listen", "fill", "say", "repeat", "type-gap", "hear-gap", "type"]
      : info.level === 2
        ? ["arrange", "place", "listen", "hear-gap", "say", "fill", "type-gap", "repeat", "type", "choose"]
        : ["type", "type-gap", "repeat", "listen", "hear-gap", "say", "arrange", "place", "fill", "choose"];
  const games = ladder.filter((kind) => allowed.includes(kind) && fits([kind], info, ctx, target) && canPlay([kind], info.item, s));
  const kind = games.find((k) => k !== previous) ?? games[0];
  if (kind) return { kind, ...(GAP_SKILL[kind] ? { skill: GAP_SKILL[kind] } : {}), ...about(kind) };
  return allowed.includes("cards") && target ? { kind: "card", target, skill: "read" } : null;
}

const meaningOf = (info) => (info.isNew ? "new" : info.slipping ? "slipping" : info.due ? "review" : null);

// A match round on words you've been taught: the ones named first (what this session is about), then the others these
// items hold, the ones due for reading first, then the weakest. Fewer pairs rather than a word nobody has met; none
// under 3.
function matchStep(items, pairs, ctx, named = []) {
  // Never a word beside itself (water and water), as its tile shows it: another game asks it.
  const alike = (lemma) => {
    const thing = pathThing(`w:${lemma}`);
    return pairsWithItself(lemma, thing ? taughtForm(thing) : lemma);
  };
  const words = named.filter((lemma) => !alike(lemma));
  for (const item of items) {
    for (const lemma of lemmasOf(item)) if (!words.includes(lemma) && ctx.known(lemma) && WORDS[lemma] && !alike(lemma)) words.push(lemma);
  }
  const readRecall = (word) => {
    const read = ctx.st(`w:${word}`).strengths.read;
    return ctx.st(`w:${word}`).due && read?.due ? read.recall - 1 : (read?.recall ?? -0.5);
  };
  const first = new Set(named);
  // In that order, and never two with the same English on their tiles (je and jouw, "your"): the later waits for another round.
  const ranked = oneEnglishEach(
    words.sort((a, b) => Number(first.has(b)) - Number(first.has(a)) || readRecall(a) - readRecall(b) || ctx.st(`w:${a}`).level - ctx.st(`w:${b}`).level),
    matchEnglish,
  );
  if (ranked.length < Math.min(3, pairs)) return null;
  const chosen = ranked.slice(0, pairs);
  const fresh = chosen.some((word) => ctx.st(`w:${word}`).isNew);
  return { kind: "match", words: chosen, meaning: fresh ? "new" : null, skill: "read" };
}

// New sentences in the order they're best met: the fewest new words first, then the deck's order. What a session of
// one game, a topic or a concept draws on; new words have their own order (wordsInOrder). Never one that Study doesn't
// start on.
// Each sentence's count is worked out once, before the sort: counted inside the comparison it was worked out twice a comparison, about
// 2 × n log n times over the ten word bands' 20,000 new sentences, and a game's first frame waited about 250 ms for it (7 Nov 2026).
function freshOrder(infos, ctx) {
  const safe = infos.filter((info) => !isNotFirst(info.item));
  const counts = new Map(safe.map((info) => [info, ctx.newIn(info)]));
  return safe.sort((a, b) => counts.get(a) - counts.get(b) || a.order - b.order);
}

// The first `need` of freshOrder(infos, ctx).filter(pass): only the sentences with the fewest new things are counted and sorted. Those with at
// most `cap` (a cap raised until enough are found) come before all the rest in that order, so the first `need` of them are the first of all.
// A `pass` is asked only of the sentences still in the running, in that order, each once: a band of them at a time (the next cap's), and the
// first `need` that pass are the first of all, since every sentence of a later band has more new things. A game's own test can be dear (Fill's
// choices), and asked of every sentence first it froze Fill's first frame for 12 s for a learner who knows the ten word bands' 20,000
// sentences (lex-character, 7 Nov 2026).
function firstFresh(infos, ctx, need, pass = null) {
  const safe = infos.filter((info) => !isNotFirst(info.item));
  if (need <= 0) return [];
  if (!pass) {
    if (need >= safe.length) return freshOrder(safe, ctx);
    for (let cap = 1; ; cap *= 2) {
      const within = cap >= 64 ? safe : safe.filter((info) => ctx.newInAtMost(info, cap));
      if (within.length >= need || within === safe) return freshOrder(within, ctx).slice(0, need);
    }
  }
  const out = [];
  let rest = safe;
  for (let cap = 1; ; cap *= 2) {
    const last = cap >= 64;
    const band = last ? rest : rest.filter((info) => ctx.newInAtMost(info, cap));
    for (const info of freshOrder(band, ctx)) if (pass(info) && out.push(info) >= need) return out;
    if (last) return out;
    const had = new Set(band);
    rest = rest.filter((info) => !had.has(info));
  }
}

// Sentences you can now read and haven't had, in the order to meet them: the fewest new patterns or phrases first (one
// new thing at a time), patterns after what they build on (the deck's order among equals), the fewest new words, the
// commonest words. This is how grammar comes in: once you can read the words it moves.
function readableSentences(ctx, used, count) {
  const out = [];
  if (count <= 0) return out;
  // (A phrase nobody has met isn't something you can read yet.)
  const readable = ctx.infos.filter((info) => info.isNew && !used.has(info.item.id) && !isNotFirst(info.item) && ctx.newIn(info) <= 1 && !info.units.some((unit) => unit.startsWith("c:") && ctx.st(unit).isNew && !ctx.meeting.has(unit)));
  const keys = new Map(
    readable.map((info) => {
      const whole = sentenceUnits(info.item).filter((unit) => ctx.st(unit).isNew);
      const ranks = info.words.map((lemma) => rankOf(lemma, contentLanguage())).filter(Number.isFinite);
      return [info, [Math.min(whole.length, 2), whole.length ? Math.min(...whole.map(rankOfUnit)) : -1, ctx.newIn(info), ranks.length ? ranks.reduce((a, b) => a + b) / ranks.length : Infinity, info.order]];
    }),
  );
  readable.sort((a, b) => {
    const [x, y] = [keys.get(a), keys.get(b)];
    const i = x.findIndex((value, n) => value !== y[n]);
    return i < 0 ? 0 : x[i] - y[i];
  });
  return readable.slice(0, count);
}

// A sentence to meet a word in, or come back to it in: one not used yet in this session if one will do.
function sentenceInfo(lemma, ctx, used) {
  // Only the plan's own sentences: while a session keeps to some concepts (concept-focus.js), the others aren't in it.
  // Nothing studied yet and no concepts chosen: every sentence is in the plan and none has been had or is resting, so nothing asks.
  const fresh = !ctx.focus && ctx.unstudied();
  const pick = (leaveOut) =>
    sentenceForWord(lemma, {
      known: ctx.known,
      used: leaveOut,
      pastFirst: ctx.pastFirst(),
      seen: fresh ? null : (item) => ctx.byId.get(item.id)?.rows.length > 0,
      skip: fresh ? null : (item) => !ctx.byId.has(item.id) || resting(ctx.byId.get(item.id), ctx.now),
    });
  const item = pick(used);
  return item ? ctx.byId.get(item.id) : null;
}

// The next new words, most common first, each with the sentence you meet it in and the one it's asked about in (another,
// if there is one). A word every sentence of is one Study doesn't start on isn't offered.
function nextNewWords(ctx, count, used) {
  const out = [];
  if (count <= 0) return out;
  let flaggedStart = false; // one a session, so words held back till now don't all arrive together
  for (const lemma of wordsInOrder()) {
    if (out.length >= count) break;
    if (ctx.known(lemma)) continue;
    const meet = sentenceInfo(lemma, ctx, used);
    if (!meet) continue;
    if (meet.isNew && isNotFirst(meet.item)) {
      if (flaggedStart) continue;
      flaggedStart = true;
    }
    used.add(meet.item.id);
    ctx.meeting.add(lemma);
    const ask = sentenceInfo(lemma, ctx, used) ?? meet;
    used.add(ask.item.id);
    out.push({ word: lemma, meet, ask });
  }
  return out;
}

// Words you've started, the weakest first: { unit, skill, level, recall }.
function weakWords(ctx, { upTo = Infinity } = {}) {
  const out = [];
  for (const lemma of wordsInOrder()) {
    const s = ctx.st(`w:${lemma}`);
    if (s.isNew || s.level > upTo) continue;
    const read = s.strengths.read;
    if (!s.trained.includes("read") || !read) continue;
    out.push({ unit: `w:${lemma}`, skill: "read", level: read.level, recall: read.recall, lastAt: s.lastAt });
  }
  return out.sort((a, b) => a.level - b.level || a.lastAt - b.lastAt);
}

/**
 * The parts of a session, in order: retries, due, new words, then the weakest. Each part is a list of { info, step };
 * a new word is { word, meet, ask } (meet: the sentence of its card, ask: of the step that asks about it). room: how many
 * steps (a new word takes two with cards).
 */
function choose(ctx, { allowed, room, newCount, settings, withNew = true, withFill = true, withRetries = true, reserved = [] }) {
  const used = new Set(reserved);
  const covered = new Set();
  const out = { retries: [], due: [], reading: [], fresh: [], fill: [] };
  let left = room;
  let previous = null;
  const take = (part, info, step) => {
    used.add(info.item.id);
    for (const key of tested(step, info.item)) covered.add(key);
    previous = step.kind;
    out[part].push({ info, step });
    left--;
  };

  // 1. Missed sentences, the most recent first, the same way again.
  const retries = (withRetries ? ctx.infos : [])
    .map((info) => ({ info, retry: retryOf(info, ctx.now) }))
    .filter(({ retry }) => retry)
    .sort((a, b) => b.retry.at - a.retry.at)
    .slice(0, RETRIES);
  for (const { info, retry } of retries) {
    if (left <= 0) break;
    const again = retry.game && usable(retry.game, allowed, settings) && canPlay(retry.game, info.item, settings) ? retry.game : null;
    const focus = retry.word ? { unit: `w:${retry.word}`, skill: "read", level: 0 } : weakestFocus(info, ctx);
    const step = again ? { kind: again[0], ...(again[1] && again[0] !== "type" ? { mode: again[1] } : {}), ...(ABOUT_ONE_WORD.has(again[0]) ? { target: targetFor(info, focus, ctx), skill: "read" } : {}), ...(again[0] === "type-gap" || again[0] === "hear-gap" ? { target: targetOf(info.item), skill: GAP_SKILL[again[0]] } : {}) } : gameFor(info, focus, previous, allowed, settings, ctx);
    if (!step) continue;
    take("retries", info, { ...step, meaning: "review", again: true });
  }

  // Room for 3 is kept before 2. New words: up to the session's number, in the room what's due leaves them. What's due
  // gets at least half the room left after the retries.
  const cards = allowed.includes("cards");
  const asks = allowed.includes("meaning") || allowed.includes("fill") || cards;
  const perNew = cards ? 2 : 1;
  const forDue = Math.min(ctx.due.length, Math.ceil(Math.max(0, left) / 2));
  const newRoom = Math.max(0, left - forDue);
  // A sentence or two you can now read and haven't had get a place too, once there are any: a quarter of what's left for
  // new things, at least one. That's how whole sentences and patterns come in.
  const anyWhole = allowed.some((way) => way !== "cards" && way !== "match" && way !== "meaning");
  const reading = withNew && newCount > 0 && anyWhole ? readableSentences(ctx, used, Math.max(1, Math.floor(newRoom / 4))) : [];
  const readingRoom = Math.min(reading.length, newRoom);
  const newSlots = withNew && asks ? Math.min(newCount, Math.floor((newRoom - readingRoom) / perNew)) : 0;
  left -= newSlots * perNew + readingRoom;

  // 2. What's due. A word in a sentence you haven't had if one will do; a pattern or a phrase in one you can read, or one
  // you've already played it on. These steps come before the new words' cards, so those words don't count as known here.
  for (const info of reading) used.add(info.item.id);
  for (const due of ctx.due) {
    if (left <= 0) break;
    if (covered.has(`${due.unit}|${due.skill}`)) continue;
    let info;
    if (due.unit.startsWith("w:")) {
      info = sentenceInfo(due.unit.slice(2), ctx, used);
    } else {
      // Nothing but cards and matching can't test a pattern: it waits for a game.
      if (!anyWhole) continue;
      info = ctx.infos
        .filter((other) => other.units.includes(due.unit) && !used.has(other.item.id) && !resting(other, ctx.now) && !(other.isNew && isNotFirst(other.item)) && (other.played || ctx.newIn(other) <= 1))
        .map((other) => ({ other, others: other.units.filter((u) => u !== due.unit && (ctx.st(u).isNew || ctx.st(u).due)).length }))
        .sort((a, b) => a.others - b.others || Number(a.other.played) - Number(b.other.played) || a.other.lastAt - b.other.lastAt)[0]?.other;
    }
    if (!info) continue;
    const step = gameFor(info, due, previous, allowed, settings, ctx);
    if (step) take("due", info, { ...step, meaning: due.slipping ? "slipping" : "review" });
  }

  for (const info of reading.slice(0, readingRoom)) {
    const unit = sentenceUnits(info.item)[0];
    const step = unit ? gameFor(info, { unit, skill: "read", level: 0 }, previous, allowed, settings, ctx) : null;
    if (step) {
      left++; // its room was kept above
      take("reading", info, { ...step, meaning: "new" });
    } else used.delete(info.item.id);
  }

  // 3. The new words, in sentences not used above; any room they don't need goes on.
  const fresh = nextNewWords(ctx, newSlots, used);
  out.fresh.push(...fresh);
  left += (newSlots - fresh.length) * perNew;

  // 4. The weakest of the rest.
  if (withFill) {
    const practice = (list) => {
      for (const weak of list) {
        if (left <= 0) break;
        if (covered.has(`${weak.unit}|read`)) continue;
        const info = sentenceInfo(weak.unit.slice(2), ctx, used);
        if (!info) continue;
        const step = gameFor(info, weak, previous, allowed, settings, ctx);
        if (step) take("fill", info, { ...step, meaning: meaningOf(info) });
      }
    };
    // Words you've only just met come back first, in another sentence: that's how a new word sticks.
    practice(weakWords(ctx, { upTo: 1 }));
    const rest = ctx.infos.filter((info) => info.played && !used.has(info.item.id) && !resting(info, ctx.now)).sort((a, b) => a.level - b.level || a.lastAt - b.lastAt);
    for (const info of rest) {
      if (left <= 0) break;
      const step = gameFor(info, weakestFocus(info, ctx), previous, allowed, settings, ctx);
      if (step) take("fill", info, { ...step, meaning: meaningOf(info) });
    }
    practice(weakWords(ctx));
    // Room left over (nothing else to practice yet): more new words, up to the session's number.
    if (withNew && asks && out.fresh.length < newCount) {
      const more = nextNewWords(ctx, Math.min(newCount - out.fresh.length, Math.floor(left / perNew)), used);
      out.fresh.push(...more);
      left -= more.length * perNew;
    }
    // Nothing else can run under these settings (only whole-sentence games allowed, nothing known yet): the sentences
    // with the fewest new words, so there's always something to do.
    // Each a whole step, as every other part builds one: Translate with its tiles, or a game the sentence can play. Which one is it? and
    // Which word is it? ask about a word you've been taught, and there's none yet: alone, they leave the session empty, and it says why.
    if (!out.retries.length && !out.due.length && !out.reading.length && !out.fresh.length && !out.fill.length) {
      const games = allowed.filter((way) => !["cards", "match", "meaning", ...WORD_GAMES].includes(way));
      const pool = practicePool(ctx);
      // The sentence as it is, in the first of these games it can play (what otherGame builds; Fill needs choices you know, so not here).
      const whole = (kind, item) => {
        if (!canPlay([kind], item, settings)) return null;
        if (kind === "translate") return translateStep(item, [], pool);
        if (!sentenceCanPlay(kind, item)) return null;
        if (kind === "arrange") return { kind, mode: "dutch", skill: "read" };
        if (kind === "choose" || kind === "place") return { kind, skill: "read" };
        if (kind === "listen") return { kind, mode: "order", skill: "hear" };
        return kind === "say" || kind === "repeat" || kind === "type" ? { kind, skill: "say" } : null;
      };
      for (const info of freshOrder(ctx.infos.filter((i) => i.isNew), ctx).slice(0, Math.max(1, room))) {
        const step = games.map((kind) => whole(kind, info.item)).find(Boolean);
        if (step) out.fill.push({ info, step: { ...step, meaning: "new" } });
      }
    }
  }
  return out;
}

// A new word's steps: its card now (first: you've never seen it, so it isn't graded), and a step that asks about it near
// the end: What does it mean?, Fill the gap on its own sentence, or a card you grade yourself.
function newWordSteps({ word, meet, ask }, ctx, { allowed, settings, previous }) {
  const out = { now: null, later: null };
  const cards = allowed.includes("cards");
  if (cards) out.now = { kind: "card", item: meet.item, target: word, first: true, meaning: "new", skill: "read" };
  const focus = { unit: `w:${word}`, skill: "read", level: 0 };
  const game = gameFor(ask, focus, previous, allowed.filter((way) => way === "meaning" || way === "fill"), settings, ctx);
  // Fill grades its sentence too: not before you've any evidence at all.
  if (game?.kind === "fill" && (targetOf(ask.item) !== word || !studiedUnits(contentLanguage()).length)) out.later = null;
  else if (game && game.kind !== "card") out.later = { ...game, item: ask.item, target: word, meaning: "new" };
  if (!out.later && cards && allowed.every((way) => way === "cards")) out.later = { kind: "card", item: ask.item, target: word, meaning: "new", skill: "read" };
  return out;
}

// Turns the chosen parts into steps: a new word as a card now and a step that asks about it near the end, the rest one
// game each, with a match round after the new words' cards (else in the middle).
function toSteps(parts, ctx, { allowed, settings, match = true }) {
  const steps = [];
  const later = [];
  for (const { info, step } of [...parts.retries, ...parts.due, ...(parts.reading ?? [])]) steps.push({ ...step, item: info.item });
  for (const fresh of parts.fresh) {
    const { now, later: ask } = newWordSteps(fresh, ctx, { allowed, settings, previous: later.at(-1)?.kind });
    if (now) steps.push(now);
    if (ask) later.push(ask);
  }
  const afterCards = steps.length;
  for (const { info, step } of parts.fill) steps.push({ ...step, item: info.item });
  const named = parts.fresh.map(({ word }) => word);
  const round = match && allowed.includes("match") ? matchStep([...steps, ...later].map((s) => s.item).filter(Boolean), settings.match.pairs, ctx, named) : null;
  if (round) steps.splice(parts.fresh.length ? afterCards : Math.ceil(steps.length / 2), 0, round);
  return [...steps, ...later];
}

/**
 * The days you studied the language you're learning, latest first, as far back as coming back can look: every day with an answer in the last
 * SPREAD_MOST + AWAY_DAYS + 2 days, and the latest one before them (what the gap before them is counted from). Every way through comebackDays
 * past those ends in no comeback, so older days change nothing. The evidence is kept in time order (progress.js), so only those rows are read:
 * making every row a day (a Date each) was most of Home's draw for a learner a year in (100 ms and more, 7 Nov 2026).
 */
function studyDays(lang, now) {
  const from = now - (SPREAD_MOST + AWAY_DAYS + 2) * DAY;
  const near = [];
  for (const row of evidenceSince(from)) if (row.at <= now && langOf(row) === lang) near.push(row.at);
  const before = latestBefore(from, lang);
  const days = new Set();
  // In time order, one Date for each day: a row before the day it's on has ended (the next 4 am, DAY_STARTS) is on that day.
  let ends = -Infinity;
  for (const at of near.sort((x, y) => x - y)) {
    if (at < ends) continue;
    const key = dayKey(at);
    days.add(dayNumber(key));
    const [y, m, d] = key.split("-").map(Number);
    ends = new Date(y, m - 1, d + 1, DAY_STARTS).getTime();
  }
  if (before > -Infinity) days.add(dayNumber(dayKey(before)));
  return [...days].sort((x, y) => y - x);
}

/** Coming back, by the days studied: { away, day, days } (as comebackOf says them, without today's share), or null. Only the days, never the
 * scheduler's view: what asks only which day back it is (Tinta's wave) asks this, a few ms, where comebackNow's share works out what's due. */
export function comebackDays(now = Date.now()) {
  const studied = studyDays(contentLanguage(), now);
  if (!studied.length) return null;
  const today = dayNumber(dayKey(now));
  // The days you came back on, latest first: today when you haven't studied yet (you're coming back now), then each day
  // you studied. The latest one after a long enough gap decides; one older than its spread leaves no comeback.
  const starts = studied[0] === today ? studied : [today, ...studied];
  for (let i = 0; i < starts.length - 1; i++) {
    const back = starts[i];
    const away = back - starts[i + 1] - 1;
    if (away < AWAY_DAYS) continue;
    const days = Math.min(away, SPREAD_MOST);
    const day = today - back;
    if (day >= days) return null;
    return { away, day, days };
  }
  return null;
}

/**
 * Coming back after AWAY_DAYS or more days without studying the language you're learning: { away (days missed), day
 * (0 on the first day back), days (how many the pile spreads over: as many as you were away, SPREAD_MOST at most),
 * share (today's part of what's due now: what's left over the days left) }, or null. Days start at 4 am (know/streak.js).
 */
export function comebackOf(ctx, plainDue = 0) {
  const found = comebackDays(ctx.now);
  return found && { ...found, share: Math.ceil((ctx.due.length + plainDue) / (found.days - found.day)) };
}

/** Coming back (comebackOf) on its own, for what Home puts first: overview's counts (what's slipping, what's new) are a long moment's work on a phone, and Home
 * needs none of them there. What's due (the reading context, a long moment of its own) only once there's a comeback to share it over. */
export const comebackNow = (now = Date.now()) => {
  const found = comebackDays(now);
  return found && { ...found, share: Math.ceil((readingContext(now).due.length + plainOfDay(now).due.length) / (found.days - found.day)) };
};

// ---------- the day ----------

const stepMinutes = (steps) => steps.reduce((sum, step) => sum + (STEP_MINUTES[step.kind] ?? 0.3), 0);

/** Counts for Study and Today: units due (that the deck can practice; coming back, today's share), sentences not had yet, slipping units (ids). */
export function overview(now = Date.now()) {
  const ctx = readingContext(now);
  const slipping = [...new Set(ctx.infos.flatMap((info) => info.units))].filter((unit) => ctx.st(unit).slipping);
  // What's due counts the plain items too (deck.js): they're in Practice and Reviews.
  const plainDue = plainOfDay(now).due.length;
  const dueAll = ctx.due.length + plainDue;
  const comeback = comebackOf(ctx, plainDue);
  return {
    due: comeback ? Math.min(comeback.share, dueAll) : dueAll,
    dueAll,
    comeback,
    dueUnits: ctx.due.map((due) => due.unit),
    fresh: ctx.infos.filter((i) => i.isNew).length,
    seen: ctx.infos.filter((i) => !i.isNew).length,
    slipping,
  };
}

// The units a "gap" session is for: the kind's units you can read but not hear or say yet (trained, and practiced by
// the deck), or, for reading, the ones you've started and don't know yet. Least likely to be recalled first.
function gapUnits(ctx, kind, skill) {
  const prefix = { word: "w:", pattern: "p:", phrase: "c:" }[kind];
  const out = [];
  for (const unit of new Set(ctx.infos.flatMap((info) => info.units))) {
    if (!prefix || !unit.startsWith(prefix)) continue;
    const s = ctx.st(unit);
    if (!s.trained.includes(skill)) continue;
    const gap = skill === "read" ? !s.isNew && !s.strengths.read?.known : Boolean(s.strengths.read?.known) && !s.strengths[skill]?.known;
    if (gap) out.push({ unit, skill, recall: s.strengths[skill]?.recall ?? -1, level: s.strengths[skill]?.level ?? 0, slipping: false });
  }
  return out.sort((a, b) => a.recall - b.recall || rankOfUnit(a.unit) - rankOfUnit(b.unit));
}

export const GAP_TITLE = { read: "Reading what you're learning", hear: "Hearing what you can read", say: "Saying what you can read" };

// ---------- Practice and lessons ----------

const SECONDS_A_QUESTION = 20;
const seededRandom = (text) => {
  let h = [...text].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
};

const placeIndex = (lessons) => {
  const place = placeOn(contentLanguage());
  return place ? Math.max(0, lessons.findIndex((lesson) => lesson.id === place)) : 0;
};
// A lesson's behind you once you've finished it (and haven't cleared what it taught), or know all it teaches. Most of it, learned elsewhere (the word packs, an
// older path), counts too, unless you've started it as a lesson: then the rest of it is what's next.
const LEARNED_ELSEWHERE = 0.3;
const doneMarks = () => new Set([...lessonsFinished(), ...markedOn(contentLanguage())]);
const lessonDone = (lesson, ctx, finished) => {
  // A lesson a placement put you past is behind you: you showed its unit, or one further on (study/placement.js).
  if (ctx.placed?.has(lesson.id)) return true;
  const own = lesson.things.filter((thing) => !thing.formOnly);
  const fresh = own.filter((thing) => ctx.st(thing.unit).isNew).length;
  // A chosen pack's lesson (path.js: one you chose or made for its subject) is its words, whatever was done under its id: the pack can grow,
  // and its lessons are laid out again around the new words, so an id you finished may now hold one you haven't met. Never skipped for that.
  if (lesson.chosen) return !fresh;
  if (finished.has(lesson.id)) return !own.length || fresh < own.length;
  // A worked-out lesson is its words: behind you once none of them is new, so whatever you don't know yet of a pack is still taught.
  if (lesson.worked) return !fresh;
  // A unit's full lesson is done when it's done: knowing all its words isn't having done it.
  if (lesson.full) return false;
  if (!own.length) return false;
  if (!fresh) return true;
  if (fresh / own.length > LEARNED_ELSEWHERE) return false;
  return !own.some((thing) => unitEvidence(thing.unit, contentLanguage()).some((row) => ["see", "word", "type-word", "say-word", "repeat-word", "translate"].includes(row.activity)));
};
/** The next lesson from where you are: what "Learn something new" opens. null when you've reached the end. */
function nextLesson(ctx, lessons) {
  const finished = doneMarks();
  let place = placeIndex(lessons);
  // A place on a worked-out lesson (a pack's own words: where you jumped to with only that pack on) never carries you past written lessons
  // you haven't done: you're where the written lessons you've done leave you (a pack added back puts its path from its own start).
  if (lessons[place]?.worked) {
    let start = 0;
    for (let i = 0; i < place; i++) if (!lessons[i].worked && !lessons[i].full && lessonDone(lessons[i], ctx, finished)) start = i + 1;
    place = start;
  }
  // A lesson of one idea with a lesson done after it is behind you: it's open, not what comes next (it may be new, put in behind
  // where you'd got to). Only the written path is looked at: past it, everything in it is behind you anyway.
  const behind = (i) => {
    for (let j = i + 1; j < lessons.length && !lessons[j].worked; j++) if (!lessons[j].full && lessons[j].kind !== "idea" && lessonDone(lessons[j], ctx, finished)) return true;
    return false;
  };
  // A unit's full lesson comes up once you've done the unit: a jump past most of it doesn't lead there. Its lessons of one idea don't hold it back.
  // (Its unit's own lessons first: the rest of the path's are thousands, each its kind worked out when it's read.)
  const isNext = (lesson) => !lessonDone(lesson, ctx, finished) && (!lesson.full || lessons.every((one) => one.full || one.unit?.id !== lesson.unit.id || one.kind === "idea" || lessonDone(one, ctx, finished)));
  for (let i = place; i < lessons.length; i++) if (isNext(lessons[i]) && !(lessons[i].kind === "idea" && behind(i))) return lessons[i];
  // Nothing left past where you are: any you jumped over.
  for (let i = 0; i < place; i++) if (isNext(lessons[i])) return lessons[i];
  return null;
}

/** The games about one word or phrase by itself, in the turn Practice takes them: Tap the picture, Pick the word, Type the word, Say the word, Repeat the word. */
const WORD_GAMES = ["see", "word", "type-word", "say-word", "repeat-word"];

/**
 * The games that are only whole sentences: all but the one-word games, Match and What does it mean?. For a newcomer, with nothing studied in
 * this language, every sentence holds words they haven't met, so such a game has nothing it can ask yet (8 Nov 2026: each met three words on
 * cards, asked What does it mean?, and never asked itself). Study shows its tile quieter, "After your first words", and a press starts the
 * first lesson (quick-play.js). The one-word games and Match meet the path's first words themselves (newThingsFor); What does it mean? starts
 * with words.
 */
export const SENTENCE_GAMES = new Set(Object.keys(GAMES).filter((kind) => !WORD_GAMES.includes(kind) && kind !== "match" && kind !== "meaning"));
/** Whether nothing is studied in this language yet (the planner's own newcomer: ctx.unstudied): a whole-sentence game waits for your first words. */
export const beforeFirstWords = (lang = contentLanguage()) => studiedUnits(lang).length === 0;

/**
 * A word game for someone who knows too few words to play it: the path's next new things, met as a lesson meets them (Tap the picture's own
 * question, shown and heard, a New word), each then asked by the game that was picked (for Tap the picture the meeting is the game). Things
 * with a drawing or an article first, in the path's order, as a lesson opens; the wrong choices from that lesson's things and what you know
 * (lesson.js poolOf). Before, such a game met its words on cards and asked "What does it mean?", and never once asked itself (8 Nov 2026: a
 * newcomer's Tap the picture had no picture in it). [{ meet, ask, thing }], at most `count`.
 */
function newThingsFor(kind, ctx, count, taken = new Set()) {
  const out = [];
  const lessons = pathLessons();
  for (const lesson of lessons) {
    if (out.length >= count) break;
    const fresh = lesson.things.filter((thing) => !thing.formOnly && !taken.has(thing.unit) && ctx.st(thing.unit).isNew && !ctx.assumed.has(thing.unit));
    if (!fresh.length) continue;
    const pool = poolOf(lesson, lessons, ctx);
    const concrete = (thing) => Boolean(thing.picture || thing.article || thing.phrase);
    for (const thing of [...fresh.filter(concrete), ...fresh.filter((thing) => !concrete(thing))]) {
      if (out.length >= count) break;
      const entry = pool.find((one) => one.thing.unit === thing.unit);
      const meet = entry && seeStep(entry, pool, { isNew: true });
      if (!meet) continue;
      const ask = kind === "see" ? null : wordGameStep(kind, entry, pool);
      if (kind !== "see" && !ask) continue;
      taken.add(thing.unit);
      out.push({ meet, ask, thing });
    }
  }
  return out;
}
/** A word game's step on a thing you've been taught (lesson.js builds each); null when it can't be asked (Repeat the word with nothing here to say it, or a word with no drawing). */
function wordGameStep(kind, entry, pool) {
  if (kind === "see") return seeStep(entry, pool);
  if (kind === "word") return wordStep(entry, pool);
  if (kind === "type-word") return typeWordStep(entry);
  if (kind === "say-word") return speakWordStep(entry, "say-word");
  if (kind === "repeat-word") return hearsWordHere(entry.text) ? speakWordStep(entry, "repeat-word") : null;
  return null;
}

// What you've been taught, as things to ask about: a lesson's own, or a word from the packs by its short meaning.
// One view's pool (by its st): every plan over the same view shares it (a session's questions and what takes their place; Home's draws, which
// share one view), while the path its things come from is the same laying out (pictures or the word list arriving lay it out again).
const poolsOf = new WeakMap(); // st → { build, pool }
function practicePool(ctx) {
  const was = poolsOf.get(ctx.st);
  if (was && was.build === pathBuild()) return was.pool;
  const steps = poolSteps(ctx);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
// The same a piece at a time (a yield every POOL_PIECE units: each one's state, thing and shown form), for warmPlan.
const POOL_PIECE = 400;
function* poolSteps(ctx) {
  const was = poolsOf.get(ctx.st);
  if (was && was.build === pathBuild()) return was.pool;
  const build = pathBuild();
  const pool = [];
  const language = contentLanguage();
  let n = 0;
  for (const unit of new Set(studiedUnits(language))) {
    if (++n % POOL_PIECE === 0) yield;
    if (!/^[wc]:/.test(unit) || ctx.st(unit).isNew) continue;
    if (ctx.focus && !ctx.focus.units.has(unit)) continue;
    const key = unit.slice(2);
    if (unit.startsWith("w:") && (!WORDS[key] || isHeavy(key))) continue;
    if (unit.startsWith("c:") && !CHUNKS[key]) continue;
    const thing = pathThing(unit) ?? (unit.startsWith("w:") ? { unit, lemma: key, text: key, means: shortMeaning(key), forms: [key], ...(pictureOfWord(key) ? { picture: pictureOfWord(key) } : {}) } : { unit, phrase: key, text: CHUNKS[key].text, means: CHUNKS[key].en, forms: [] });
    pool.push({ key, thing, own: false, ...shownThing(thing) });
  }
  // (Worked out whole meanwhile: that one. The path laid out again meanwhile: this one's things are old, kept for nobody.)
  const now = poolsOf.get(ctx.st);
  if (now && now.build === pathBuild()) return now.pool;
  if (build === pathBuild()) poolsOf.set(ctx.st, { build, pool });
  return pool;
}

// Practice: what you know, mixed, about 5 minutes of it, or less while there's less to ask about. What's due and what you find hard come up most, but
// nothing says so: it comes in no order. Only sentences whose every word and phrase you've been taught. No sentence or word twice, each game in its turn.
// A pack's plain items are in it too (deck.js plainOfDay): what's due, and a new one or two from a pack you made, once there's something else to practice or no lesson to start with.
function practiceOf(ctx, settings, { countOnly = false } = {}) {
  const allowed = Object.keys(WAYS).filter((way) => settings.quick.include[way]);
  const pool = practicePool(ctx);
  // A pack's plain items have no concepts, so none of them while a session keeps to some.
  const plain = ctx.focus ? { due: [], fresh: [] } : plainOfDay(ctx.now);
  if (!pool.length && !plain.due.length && ITEMS.length) plain.fresh = [];
  // A placement's words nothing has tested since: a few asked each time (assumedChecks), so what it placed you past is checked bit by bit.
  const checkCount = ctx.focus ? 0 : Math.min(ASSUMED_CHECKS, assumedWords(ctx).length);
  if (!pool.length && !plain.due.length && !plain.fresh.length && !checkCount) return countOnly ? 0 : [];
  const random = seededRandom(`${dayKey(ctx.now)}:${practicesDone()}:${pool.length}`);
  const goal = Math.round((settings.practice.minutes * 60) / SECONDS_A_QUESTION);
  const canRead = (info) => {
    if (!info.words.length && !(info.item.chunks ?? []).length) return false;
    if (!info.words.every((word) => ctx.known(word))) return false;
    if (!(info.item.chunks ?? []).every((id) => !ctx.st(`c:${id}`).isNew || ctx.assumed.has(`c:${id}`))) return false;
    if (isNotFirst(info.item) && !info.played && !ctx.pastFirst()) return false;
    return !resting(info, ctx.now);
  };
  // Counting (Home and Study's card): what it comes to is at most the goal, and the plain items' share asks only whether there's anything
  // else, so the sentences are read until there are a goal's worth (a year's learner reads 16,000 otherwise, on the app's first draw).
  const readable = [];
  for (const info of ctx.infos) if (canRead(info) && readable.push(info) >= goal && countOnly) break;
  const wordGames = WORD_GAMES.filter((kind) => allowed.includes(kind));
  const wordQuestions = wordGames.length ? Math.min(Math.ceil(pool.length / 2), Math.max(2, Math.round(goal * 0.3))) : 0;
  const share = plainShare(plain, { goal, others: readable.length + wordQuestions, dueElsewhere: ctx.due.length });
  const plainQuestions = share.due + share.fresh * 2;
  // Match can take a due item that wasn't asked by itself: any of your items, as a round picks them.
  const inMatch = plain.due.slice(share.due).filter((one) => canMatchCard(one.card)).slice(0, pool.length >= 3 ? 2 : 5 - pool.length);
  const canMatch = allowed.includes("match") && pool.length + inMatch.length >= 4;
  const total = Math.min(goal, readable.length + wordQuestions + plainQuestions + checkCount + (canMatch ? 1 : 0));
  if (countOnly) return total;
  const sentenceQuestions = Math.min(readable.length, Math.max(0, total - wordQuestions - plainQuestions - checkCount - (canMatch ? 1 : 0)));
  // The harder it's been, the likelier it comes up.
  const weigh = (level, due, slipping) => 1 + (due ? 3 : 0) + (slipping ? 2 : 0) + Math.max(0, 3 - level);
  const sample = (list, weight, count) =>
    list
      .map((one) => ({ one, key: random() ** (1 / weight(one)) }))
      .sort((a, b) => b.key - a.key)
      .slice(0, count)
      .map(({ one }) => one);
  const weight = (info) => weigh(info.level, info.due, info.slipping);
  // Right after a lesson that taught an idea (of one idea, or with its words), a practice opens on that idea: its first questions are on sentences
  // that show it, each carrying it (See the idea again).
  const lead = ideaLead(ctx);
  const leadRoom = lead ? Math.min(IDEA_LEAD, sentenceQuestions) : 0;
  const showing = lead ? sample(readable.filter((info) => info.item.concepts?.includes(lead.pattern)), weight, leadRoom + 3) : [];
  const leading = new Set(showing.map((info) => info.item.id));
  const sentences = [...showing, ...sample(readable.filter((info) => !leading.has(info.item.id)), weight, sentenceQuestions - Math.min(leadRoom, showing.length))];
  const steps = [];
  const leadSteps = [];
  const used = new Map();
  const dueOf = (info) => ctx.due.find((due) => info.units.includes(due.unit));
  for (const info of sentences) {
    const leads = leading.has(info.item.id);
    if (leads && leadSteps.length >= leadRoom) continue;
    const into = leads ? leadSteps : steps;
    const idea = leads ? { idea: lead } : {};
    const due = dueOf(info);
    const gentle = info.level >= 1 && ctx.st(info.units[0] ?? "").reviews >= 3;
    const kinds = ["translate", "listen", "choose", "arrange", "place", "fill", "type-gap", "hear-gap", ...(gentle ? ["type", "say"] : [])].filter((kind) => {
      if (!allowed.includes(kind) || !canPlay([kind], info.item, settings)) return false;
      if (!sentenceCanPlay(kind, info.item)) return false;
      if (kind === "fill" && !fillChoices(info.item, { known: ctx.known, also: pool, seen: formsSeen(ctx) })) return false;
      return fits([kind], info, ctx, null);
    });
    // With only the harder games on, they're asked sooner than they'd be otherwise.
    if (!kinds.length) kinds.push(...["type", "say", "repeat", "meaning"].filter((kind) => allowed.includes(kind) && canPlay([kind], info.item, settings) && (kind !== "meaning" || fits([kind], info, ctx, targetOf(info.item)))));
    if (!kinds.length && allowed.includes("cards")) kinds.push("card");
    if (!kinds.length) continue;
    const wanted = due?.skill === "hear" ? ["listen", "hear-gap"] : due?.skill === "say" ? ["type", "say", "type-gap"] : [];
    const kind = [...kinds].sort((a, b) => Number(wanted.includes(b)) - Number(wanted.includes(a)) || (used.get(a) ?? 0) - (used.get(b) ?? 0) || random() - 0.5)[0];
    used.set(kind, (used.get(kind) ?? 0) + 1);
    if (kind === "translate") into.push({ ...translateStep(info.item, sentences.map((one) => one.item), pool), meaning: meaningOf(info), ...idea });
    else {
      const version = kind === "arrange" ? { mode: "dutch" } : kind === "meaning" || kind === "card" ? { target: targetOf(info.item) } : kind === "listen" ? { mode: settings.listen.mode === "mix" ? (info.level >= 2 ? "order" : "meaning") : settings.listen.mode } : kind === "say" ? { mode: settings.say.prompt } : {};
      into.push({ kind, ...version, skill: kind === "listen" ? "hear" : kind === "type" || kind === "say" ? "say" : (GAP_SKILL[kind] ?? "read"), item: info.item, meaning: meaningOf(info), ...(kind === "fill" ? { target: targetOf(info.item), options: fillChoices(info.item, { known: ctx.known, also: pool, seen: formsSeen(ctx) }) } : {}), ...(kind === "type-gap" || kind === "hear-gap" ? { target: targetOf(info.item) } : {}), ...idea });
    }
  }
  // Words and phrases by themselves, the weakest likeliest.
  const chosen = sample(pool, (one) => {
    const state = ctx.st(one.thing.unit);
    return weigh(state.level, state.due, state.slipping);
  }, wordQuestions);
  // Each in its turn of the games that are on; a word that can't be asked its turn's way (Repeat the word without a drawing) is asked the next way.
  chosen.forEach((one, i) => {
    for (let k = 0; k < wordGames.length; k++) {
      const step = wordGameStep(wordGames[(i + k) % wordGames.length], one, pool);
      if (step) return void steps.push(step);
    }
  });
  steps.push(...assumedChecks(ctx, pool, checkCount, allowed));
  const planned = plainSteps(plain.due.slice(0, share.due), plain.fresh.slice(0, share.fresh), { allowed, now: ctx.now });
  steps.push(...planned.asked);
  if (canMatch) {
    // Never a pair spelled the same both ways (water and water): its own game asks it.
    // Drawn in full (the same draws as taking the first few), then never two with the same English on their tiles, then as many as fit.
    const can = pool.filter((one) => !(one.thing.lemma && pairsWithItself(one.thing.lemma, taughtForm(one.thing))));
    const paired = oneEnglishEach(sample(can, () => 1, can.length), (one) => thingEnglish(one.thing)).slice(0, 5 - inMatch.length);
    const taken = new Set(paired.flatMap((one) => [one.thing.text, thingEnglish(one.thing)]).filter(Boolean).map((side) => side.toLocaleLowerCase()));
    const items = inMatch.filter(({ card }) => {
      if (spelledAlike(card.text, card.means)) return false;
      const sides = [card.text.toLocaleLowerCase(), card.means.toLocaleLowerCase()];
      if (sides.some((side) => taken.has(side))) return false;
      sides.forEach((side) => taken.add(side));
      return true;
    }).map(({ card, unit }) => ({ unit, text: card.text, means: card.means }));
    steps.push({ kind: "match", items, words: paired.filter((one) => one.thing.lemma).map((one) => one.thing.lemma), phrases: paired.filter((one) => one.thing.phrase).map((one) => one.thing.phrase), skill: "read" });
  }
  // In no order, and never the same game three times running where it can be helped.
  const mixed = steps.map((step) => ({ step, key: random() })).sort((a, b) => a.key - b.key).map(({ step }) => step);
  notThreeRunning(mixed);
  // Something new is met first, then asked further on.
  for (const { meet, ask } of planned.coming) {
    const at = meet ? Math.floor(random() * (mixed.length + 1)) : 0;
    if (meet) mixed.splice(at, 0, meet);
    const later = meet ? at + 1 : 0;
    mixed.splice(later + Math.floor(random() * (mixed.length - later + 1)), 0, ask);
  }
  // The idea's questions first, as they came; the rest after them, where they meet changed as little as it takes.
  return notThreeRunning([...leadSteps, ...mixed], leadSteps.length);
}

/** Never the same game three times running where it can be helped: a step from `from` on swaps with a later one of another game. Changes the list in place and returns it. */
function notThreeRunning(list, from = 0) {
  for (let i = Math.max(2, from); i < list.length; i++) {
    if (list[i].kind === list[i - 1].kind && list[i].kind === list[i - 2].kind) {
      const swap = list.findIndex((other, at) => at > i && other.kind !== list[i].kind);
      if (swap > 0) [list[i], list[swap]] = [list[swap], list[i]];
    }
  }
  return list;
}

/** A placement's assumed words a practice asks each time (assumedChecks): few, so the rest of it is still what you know. */
export const ASSUMED_CHECKS = 3;
// The assumed words (study/placement.js) a check can ask by themselves, commonest first: each its path thing, as a lesson shows it.
function assumedWords(ctx) {
  if (!ctx.assumed.size) return [];
  const lang = contentLanguage();
  return [...ctx.assumed]
    .filter((unit) => unit.startsWith("w:"))
    .map((unit) => pathThing(unit))
    .filter((thing) => thing?.lemma && thing.means && !isHeavy(thing.lemma))
    .sort((a, b) => rankOf(a.lemma, lang) - rankOf(b.lemma, lang) || a.lemma.localeCompare(b.lemma));
}
/**
 * Up to `count` of a placement's assumed words, each asked by itself (Which word is it?, else Which one is it?, as the games on allow): never a
 * card, since a placement put you past it. Right, it's yours from then (its own evidence); wrong, its answer shows as any miss's does, and it's
 * a word you're learning. The wrong choices from what you know and the other assumed words.
 */
function assumedChecks(ctx, pool, count, allowed) {
  if (count <= 0) return [];
  const kinds = ["word", "see"].filter((kind) => allowed.includes(kind));
  if (!kinds.length) return [];
  const entries = assumedWords(ctx).map((thing) => ({ key: thing.lemma, thing, own: false, ...shownThing(thing) }));
  const choices = [...pool, ...entries];
  const out = [];
  for (const entry of entries) {
    if (out.length >= count) break;
    const step = kinds.map((kind) => wordGameStep(kind, entry, choices)).find(Boolean);
    if (step) out.push(step);
  }
  return out;
}

/** Questions a practice opens with on the idea a lesson just taught (a lesson of one idea, or one that brings an idea with its words). */
const IDEA_LEAD = 5;

/**
 * The idea a practice opens on: the one the last lesson finished taught (a lesson of one idea, or one that brings an idea beside its new
 * words), when nothing has been finished since it (no practice since it).
 * { pattern, name, item, line }, item the lesson's own sentence it shows the idea with (its shortest), name and line what its card is
 * called and says for what you know (idea-parts.js, else the grammar's name and the lesson's line); null otherwise.
 */
function ideaLead(ctx) {
  if (practicesSinceLesson() !== 0) return null;
  const id = lastLessonFinished();
  const lesson = id ? pathLessons().find((one) => one.id === id) : null;
  if (!lesson?.concept) return null;
  const { pattern } = lesson.concept;
  const item = (lesson.items ?? [])
    .map((one) => ctx.byId.get(one)?.item)
    .filter((one) => one?.concepts?.includes(pattern))
    .sort((a, b) => a.words.length - b.words.length)[0];
  const known = (word) => ctx.known(word);
  const line = ideaLine(contentLanguage(), pattern, known) ?? lesson.concept.line;
  const name = ideaName(contentLanguage(), pattern, known) ?? ctx.patternName?.(pattern) ?? lesson.title;
  return item ? { pattern, name, item: item.id, ...(line ? { line } : {}) } : null;
}

// What takes a game's place when it can't be played for now (Can't listen now, Can't speak now, one turned off in a session): another on the same
// sentence or word, the least used so far among those you have on; with none of those, one you don't, since the question still has to be asked. Null: nothing can (Match goes).
function otherGame(step, without, ctx, pool, settings, steps) {
  if (step.kind === "deck") return deckInstead(step, without);
  if (WORD_GAMES.includes(step.kind)) {
    const entry = pool.find((one) => one.thing.unit === step.unit);
    if (!entry) return null;
    // Another word game on the same word: one you have on first, the tapping ones before typing.
    const others = WORD_GAMES.filter((kind) => kind !== step.kind && !without.has(kind));
    for (const kind of [...others.filter((kind) => settings.quick.include[kind]), ...others.filter((kind) => !settings.quick.include[kind])]) {
      const asked = wordGameStep(kind, entry, pool);
      if (asked) return asked;
    }
    return null;
  }
  const item = step.item;
  if (!item) return null;
  const base = { item, meaning: step.meaning };
  const make = {
    translate: () => translateStep(item, [], pool),
    arrange: () => (sentenceCanPlay("arrange", item) ? { kind: "arrange", mode: "dutch", skill: "read", ...base } : null),
    choose: () => (sentenceCanPlay("choose", item) ? { kind: "choose", skill: "read", ...base } : null),
    fill: () => {
      const options = item.gap ? fillChoices(item, { known: ctx.known, also: pool, seen: formsSeen(ctx) }) : null;
      return options ? { kind: "fill", options, target: targetOf(item), skill: "read", ...base } : null;
    },
    place: () => (sentenceCanPlay("place", item) ? { kind: "place", skill: "read", ...base } : null),
    say: () => ({ kind: "say", skill: "say", ...base }),
    listen: () => (hears(item) ? { kind: "listen", mode: "order", skill: "hear", ...base } : null),
    type: () => ({ kind: "type", skill: "say", ...base }),
    "type-gap": () => (item.gap && targetOf(item) ? { kind: "type-gap", target: targetOf(item), skill: "say", ...base } : null),
    "hear-gap": () => (item.gap && targetOf(item) && hears(item) ? { kind: "hear-gap", target: targetOf(item), skill: "hear", ...base } : null),
  };
  const usedSoFar = (kind) => steps.filter((other) => other.kind === kind).length;
  const pick = (kinds) => {
    for (const kind of [...kinds].sort((a, b) => usedSoFar(a) - usedSoFar(b))) {
      const made = make[kind]();
      if (made) return made;
    }
    return null;
  };
  const on = (kind) => settings.quick.include[kind] && !without.has(kind);
  // Repeat after is hearing and saying: with one of them gone, the other's game, on the same sentence.
  if (step.kind === "repeat") {
    const half = without.has("say") ? "listen" : "say";
    if (on(half) && make[half]()) return make[half]();
  }
  // A gap typed with the sound gone (or typing gone): the gap another way, on the same sentence.
  if (step.kind === "hear-gap" || step.kind === "type-gap") {
    const gap = pick(["type-gap", "fill"].filter((kind) => kind !== step.kind && on(kind)));
    if (gap) return gap;
  }
  // A sentence holding words you haven't met can only be asked by the games that show their meaning.
  if (step.borrowed?.length) return pick(["translate", "fill"].filter((kind) => !without.has(kind))) ?? make.translate();
  const quiet = ["translate", "arrange", "choose", "fill", "place", "type"];
  return pick(quiet.filter(on)) ?? pick(quiet.filter((kind) => !without.has(kind))) ?? make.translate();
}

/**
 * The lessons before one you haven't done, when it's further on than where you've got to: what jumping to it skips. [] when nothing's skipped
 * (it's the next one, or it's one you went past).
 */
export function lessonsSkippedBy(id, now = Date.now()) {
  const ctx = readingContext(now);
  const lessons = pathLessons();
  const at = lessons.findIndex((lesson) => lesson.id === id);
  const next = nextLesson(ctx, lessons);
  // A chosen pack's lesson is studied by itself (as Study a topic does): going to it skips none of the course.
  if (at < 0 || !next || at <= lessons.indexOf(next) || lessons[at].chosen) return [];
  const finished = doneMarks();
  // A lesson of one idea is never skipped: it's open, whenever you like (a new one put in behind you, or one you went past).
  const skipped = lessons.slice(0, at).filter((lesson) => lesson.kind !== "idea" && !lessonDone(lesson, ctx, finished));
  // Going past only a unit's full lesson teaches nothing you'd be missing: nothing to ask.
  return skipped.some((lesson) => !lesson.full) ? skipped : [];
}

// The forms you've met: what the lessons you've done teach, and the lesson you're on. What can stand as a choice.
const formsDoneOf = new WeakMap();
function formsSeen(ctx, lesson = null) {
  if (!formsDoneOf.has(ctx)) {
    const finished = doneMarks();
    formsDoneOf.set(ctx, new Set(pathLessons().filter((one) => lessonDone(one, ctx, finished)).flatMap((one) => [...lessonForms(one)])));
  }
  const done = formsDoneOf.get(ctx);
  const own = lesson ? lessonForms(lesson) : null;
  return (form) => done.has(form) || Boolean(own?.has(form));
}

/** A tile that isn't in a sentence, for Put it in order: a word you know, in the form you know it. */
export function strayYouKnow(item) {
  const inSentence = new Set(item.words.map(([text]) => text.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+$/u, "")));
  const known = [...new Set(pathLessons().flatMap((lesson) => lesson.things).filter((thing) => thing.lemma && !thing.formOnly).filter((thing) => !conceptState(thing.unit).isNew).map((thing) => taughtForm(thing)))].filter((form) => !inSentence.has(form.toLocaleLowerCase()));
  return known.length ? known[[...item.id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) % known.length] : null;
}

/** Whether a lesson's behind you. */
export const lessonFinished = (lesson, now = Date.now()) => lessonDone(lesson, readingContext(now), doneMarks());

/**
 * What a topic pack studied by itself has to play (Study's Study a topic, planSession's "pack"): its lessons on the path and how many
 * are done, and how many of its words you know already, { total, done, known }. One reading context for them all.
 */
export function packLessons(id, now = Date.now()) {
  const pack = WORD_PACKS.find((one) => one.id === id);
  if (!pack) return { total: 0, done: 0, known: 0 };
  const lessons = pathLessons().filter((lesson) => lesson.pack === id);
  const ctx = readingContext(now);
  const finished = doneMarks();
  const words = new Set(pack.words);
  const known = new Set(ctx.infos.filter((info) => !info.isNew && words.has(targetOf(info.item))).map((info) => targetOf(info.item))).size;
  return { total: lessons.length, done: lessons.filter((lesson) => lessonDone(lesson, ctx, finished)).length, known };
}

/** Marks lessons as done, on your word: what they teach goes in what you know, Practice asks about it, and the path inks them. */
export function markLessonsDone(lessons) {
  const lang = contentLanguage();
  const units = [...new Set(lessons.flatMap((lesson) => lesson.things.filter((thing) => !thing.formOnly && conceptState(thing.unit).isNew).map((thing) => thing.unit)))];
  if (units.length) record(units.map((concept) => ({ concept, outcome: "right", activity: "marked", ...TESTS.marked })));
  addMarked(lang, lessons.map((lesson) => lesson.id));
}

/** The path as the page draws it, as far as upTo lessons past where you are: { lessons: [{ id, title, unit, theme, words, learned, concept, state, doing }], at, more }. */
export function pathOverview(upTo = 40, now = Date.now()) {
  const ctx = readingContext(now);
  const lessons = pathLessons();
  const finished = doneMarks();
  const next = nextLesson(ctx, lessons);
  const at = next ? lessons.indexOf(next) : lessons.length;
  // Everything you've done is shown, however far on it is. A chosen pack's lesson (one you studied by itself, from Study a topic) isn't how far
  // you've got on the path: the course's lessons before it aren't skipped for it (10 Nov 2026: a trip pack's first lesson marked the rest of
  // unit 1 "Skipped").
  let lastDone = -1;
  const done = lessons.map((lesson, i) => {
    const yes = lessonDone(lesson, ctx, finished);
    if (yes && !lesson.chosen) lastDone = i;
    return yes;
  });
  const written = lessons.filter((lesson) => !lesson.worked).length;
  const end = Math.min(lessons.length, Math.max(upTo, written, Math.max(at, lastDone) + upTo));
  const shown = lessons.slice(0, end).map((lesson, i) => {
    // open: a lesson of one idea behind you, there to do whenever you like: never skipped, never a gap.
    const state = i === at ? "here" : done[i] ? "done" : i < Math.max(at, lastDone) ? (lesson.kind === "idea" ? "open" : "skipped") : "ahead";
    const own = lesson.things.filter((thing) => !thing.formOnly);
    const states = own.map((thing) => ctx.st(thing.unit));
    const doing = !done[i] ? null : ctx.placed.has(lesson.id) && states.every((one) => one.isNew) ? "placed" : states.some((one) => one.slipping) ? "slipping" : states.every((one) => one.level >= 3) ? "strong" : "learning";
    return {
      id: lesson.id,
      // A worked-out lesson is called by its words; its unit has the name (the pack you chose, or the topic most of its words are about).
      title: lesson.worked ? lesson.words.map((word) => word.lemma).join(", ") : lesson.title,
      n: lesson.n ?? null,
      full: Boolean(lesson.full),
      unit: lesson.unit ?? { id: "lessons", title: "Lessons" },
      theme: lesson.theme ?? null,
      words: lesson.full ? [] : lesson.things.map((thing) => thing.text),
      learned: lesson.full ? 0 : states.filter((one) => !one.isNew).length,
      concept: lesson.concept ? { name: PATTERNS[lesson.concept.pattern]?.name ?? lesson.title } : null,
      kind: lesson.kind,
      teaches: lesson.teaches,
      state,
      doing,
    };
  });
  return { lessons: shown, at, more: end < lessons.length };
}

/** Where a language's lessons run out, and what comes next: asking for more, what's shared, sharing yours (shell/study.js). */
export const MORE_LESSONS = "#study/more-lessons";

/** The next lesson from where you are, { id, title }, or null: for what only needs that. */
export function lessonNow(now = Date.now()) {
  if (!ITEMS.length) return null;
  const lesson = nextLesson(readingContext(now), pathLessons());
  return lesson ? { id: lesson.id, title: lesson.title } : null;
}

/**
 * What Study and Today show: { nothing, firstTime, practice: { questions, minutes } | null, lesson: { id, title, n, newThings, minutes, kind, teaches } | null, suggest, atEnd }.
 * firstTime: nothing's been taught yet, so a first lesson is the only sensible thing. suggest: it's been a few practices, so the next lesson is worth mentioning.
 */
export function studyOverview(now = Date.now()) {
  const plainThere = () => {
    const plain = plainOfDay(now);
    return plain.due.length + plain.fresh.length > 0;
  };
  // No sentences in this language, and nothing of your own to practice.
  if (!ITEMS.length && !plainThere()) return { nothing: true, firstTime: false, practice: null, lesson: null, suggest: false, atEnd: false, writtenEnd: false };
  const settings = getStudySettings();
  const ctx = readingContext(now);
  const lessons = pathLessons();
  const lesson = nextLesson(ctx, lessons);
  const questions = practiceOf(ctx, settings, { countOnly: true });
  const firstTime = !questions;
  const asked = lesson ? lesson.things.filter((thing) => !thing.formOnly && ctx.st(thing.unit).isNew).length : 0;
  const since = practicesSinceLesson();
  return {
    nothing: false,
    practicedToday: practicedToday(now),
    firstTime,
    practice: questions ? { questions, minutes: Math.max(1, Math.round((questions * SECONDS_A_QUESTION) / 60)) } : null,
    lesson: lesson ? { id: lesson.id, title: lesson.title, n: lesson.n ?? null, full: Boolean(lesson.full), name: lesson.full ? lesson.title : `Lesson ${(lesson.inUnit ?? lesson.n).toLocaleString()}: ${lesson.title}`, place: lesson.full ? "Whole unit" : lesson.chosen && lesson.inUnit ? `${lesson.unit.title} · Lesson ${lesson.inUnit.toLocaleString()}` : lesson.inUnit ? `Unit ${lesson.unitN.toLocaleString()} · Lesson ${lesson.inUnit.toLocaleString()}` : `Lesson ${lesson.n.toLocaleString()}`, newThings: asked, minutes: lesson.full ? 7 : lesson.kind === "idea" ? 3 : 4, worked: Boolean(lesson.worked), ...(lesson.packName ? { wordsFrom: lesson.packName } : {}), kind: lesson.kind, teaches: lesson.teaches } : null,
    // Every few practices, and not on every one after that: said and let go.
    suggest: !firstTime && since > 0 && since % settings.practice.suggestEvery === 0,
    atEnd: !lesson,
    // The written lessons are behind you: what's next is words worked out from the list, or nothing. It's the moment to say what comes next.
    // The written lessons are behind you once the next lesson is a worked-out one with no written lesson after it (a pack you chose sits among them).
    writtenEnd: Boolean(ITEMS.length) && (!lesson || (Boolean(lesson.worked) && lessons.some((one) => !one.worked) && !lessons.slice(lessons.indexOf(lesson) + 1).some((one) => !one.worked && !one.full))),
  };
}

/**
 * Plans a session. mode: quick · reviews · cards · game (arg: a GAMES key) · concept (arg: a concept id) · topic
 * (arg: a TOPICS key) · slipping (what's due that you'd learned) · gap (arg: <kind>/<skill>, as gapUnits) · frequent
 * (new sentences with the most common words you haven't studied, by the frequency list). Returns
 * { title, steps } or { title, steps: [], empty: "why", pose } (pose: Tinta's, as the words call for: lounge, off or shrug).
 */
export function planSession(mode, arg, now = Date.now()) {
  const plan = plannedSession(mode, arg, now);
  // Kept to some concepts and nothing to ask: say that's why, and how to widen it.
  if (lastContext?.focus && !plan.steps.length) {
    plan.empty = `Nothing with ${lastContext.focus.ids.map(conceptLabel).join(", ")} to ask right now. Choose more concepts on Study, or clear them.`;
    plan.pose = "shrug";
  }
  if (lastContext?.focus) plan.focus = lastContext.focus.ids;
  if (lastContext && mode !== "deck") {
    const ctx = lastContext;
    const settings = getStudySettings();
    // Ready for a press: what it needs is in hand already, so it's instant.
    // A game asked another way keeps the idea it carried.
    plan.instead = (step, without) => {
      const other = otherGame(step, without, ctx, plan.lessonPool?.() ?? practicePool(ctx), settings, plan.steps);
      return other && step.idea ? { ...other, idea: step.idea } : other;
    };
  }
  return plan;
}

let lastContext = null;
const FOCUSED = new Set(["practice", "quick", "reviews", "topic", "game", "slipping", "gap"]);
function plannedSession(mode, arg, now) {
  lastContext = null;
  if (mode === "deck") return deckSession(arg, now);
  const settings = getStudySettings();
  const allWays = Object.keys(WAYS);
  const onlyPlain = !ITEMS.length && mode === "practice" && (({ due, fresh }) => due.length + fresh.length > 0)(plainOfDay(now));
  if (!ITEMS.length && !onlyPlain) return { title: "Study", steps: [], empty: `There's nothing to study yet: no ${learningName()} pack is turned on. Turn one on in Settings → Study → Packs.`, pose: "off" };
  // Practice, the quick session, reviews, a topic, the games and what's slipping keep to the concepts you chose (concept-focus.js); a lesson and a deck never.
  const ctx = context(now, FOCUSED.has(mode) ? focusNow() : null);
  lastContext = ctx;
  // An old link to the day (a reminder, a bookmark): what you do now.
  if (mode === "day") return plannedSession(practiceOf(ctx, settings, { countOnly: true }) ? "practice" : "lesson", undefined, now);

  if (mode === "quick") {
    const allowed = allWays.filter((way) => settings.quick.include[way]);
    if (!allowed.length) return { title: "Quick session", steps: [], empty: "Your quick session has nothing it's allowed to use. Turn on at least one way to study in its settings.", pose: "off" };
    const target = LENGTHS[settings.quick.length]?.steps ?? 8;
    const room = Math.max(1, target - (allowed.includes("match") ? 1 : 0));
    let newCount = settings.quick.newPerSession;
    const right = recentRight();
    if (right !== null && right < RIGHT_TARGET) newCount = Math.floor(newCount / 2);
    // Coming back, only today's share of the pile counts here, so new words aren't held off for days.
    const comeback = comebackOf(ctx);
    if ((comeback ? comeback.share : ctx.due.length) >= 2 * room) newCount = 0;
    const parts = choose(ctx, { allowed, room, newCount, settings });
    const steps = toSteps(parts, ctx, { allowed, settings });
    // Only games that ask about words you've been taught, and none yet: say so, and what would give it something.
    if (!steps.length) return { title: "Quick session", steps: [], empty: "Nothing to ask with only these games on yet: they ask about words you've learned. A lesson gives you some, or turn on another way to study in the quick session's settings.", pose: "off" };
    return { title: "Quick session", steps };
  }
  if (mode === "practice") {
    let steps = practiceOf(ctx, settings);
    // None of the games on can ask about what you know (only Listening, on a device with no voice): it still asks, the plainest way.
    if (!steps.length && practicePool(ctx).length) {
      for (const way of ["translate", "word", "see"]) settings.quick.include[way] = true;
      steps = practiceOf(ctx, settings);
    }
    if (!steps.length) return { title: "Practice", steps: [], empty: "There's nothing to practice yet. Your first lesson gives you something to work with.", pose: "lounge" };
    return { title: "Practice", steps, practice: true, retries: true };
  }
  if (mode === "lesson") {
    const lessons = pathLessons();
    const lesson = arg ? lessons.find((one) => one.id === arg) : nextLesson(ctx, lessons);
    if (!lesson) return { title: "Lessons", steps: [], empty: `You've done every ${learningName()} lesson here.`, pose: "lounge", next: { label: "See what's next", href: MORE_LESSONS } };
    const allowed = allWays.filter((way) => settings.quick.include[way]);
    const steps = lessonSteps(lesson, lessons, ctx, { allowed, fill: (item, options) => fillChoices(item, { known: ctx.known, seen: formsSeen(ctx, lesson), ...options }) });
    let pool = null;
    return { title: lesson.title, steps, lessonPool: () => (pool ??= poolOf(lesson, lessons, ctx)), lesson: { id: lesson.id, title: lesson.title, n: lesson.n ?? null, full: Boolean(lesson.full), worked: Boolean(lesson.worked), units: lesson.things.map((thing) => thing.unit), idea: lesson.teaches?.idea ?? null }, retries: true };
  }
  if (mode === "frequent") {
    // The most common words you haven't studied yet.
    const title = "The next common words";
    const fresh = nextNewWords(ctx, 3, new Set());
    if (!fresh.length) return { title, steps: [], empty: "Your study material has no new common words right now.", pose: "lounge" };
    const parts = { retries: [], due: [], fresh, fill: [] };
    return { title, steps: toSteps(parts, ctx, { allowed: allWays, settings }) };
  }
  if (mode === "slipping" || mode === "gap") {
    const [kind, skill] = String(arg ?? "").split("/");
    const due = mode === "slipping" ? ctx.due.filter((d) => ctx.st(d.unit).slipping) : GAP_TITLE[skill] ? gapUnits(ctx, kind, skill) : [];
    const title = mode === "slipping" ? "What's slipping" : (GAP_TITLE[skill] ?? "Study");
    if (!due.length) return { title, steps: [], empty: mode === "slipping" ? "Nothing's slipping right now." : "Nothing in that gap: well done.", pose: "lounge" };
    const allowed = allWays.filter((w) => w !== "cards" && w !== "match");
    const parts = choose({ ...ctx, due }, { allowed, room: 8, newCount: 0, settings, withNew: false, withFill: false, withRetries: false });
    return { title, steps: toSteps(parts, ctx, { allowed, settings, match: false }) };
  }
  if (mode === "reviews") {
    const allowed = allWays.filter((w) => w !== "cards" && w !== "match");
    const parts = choose(ctx, { allowed, room: 8, newCount: 0, settings, withNew: false, withFill: false });
    // What's due of a pack's plain items, its share of the 8 (none while it keeps to some concepts: they have none).
    const plain = ctx.focus ? { due: [], fresh: [] } : plainOfDay(now);
    const asked = plainSteps(plain.due.slice(0, plainShare({ ...plain, fresh: [] }, { goal: 8, others: parts.retries.length + parts.due.length, dueElsewhere: ctx.due.length }).due), [], { allowed, now }).asked;
    if (!parts.retries.length && !parts.due.length && !asked.length) return { title: "Reviews", steps: [], empty: "Nothing is due yet. Come back later, or start a quick session.", pose: "lounge" };
    return { title: "Reviews", steps: [...toSteps(parts, ctx, { allowed, settings, match: false }), ...asked] };
  }
  if (mode === "cards") {
    // Words only: what's due, in a sentence you haven't had if one will do, then new words (met, then graded), then the
    // weakest.
    const used = new Set();
    const steps = [];
    const later = [];
    for (const due of ctx.due.filter((d) => d.unit.startsWith("w:") && d.skill === "read").slice(0, 3)) {
      const info = sentenceInfo(due.unit.slice(2), ctx, used);
      if (!info) continue;
      used.add(info.item.id);
      steps.push({ kind: "card", item: info.item, target: due.unit.slice(2), meaning: due.slipping ? "slipping" : "review", skill: "read" });
    }
    for (const fresh of nextNewWords(ctx, Math.max(1, Math.floor((6 - steps.length) / 2)), used)) {
      steps.push({ kind: "card", item: fresh.meet.item, target: fresh.word, first: true, meaning: "new", skill: "read" });
      later.push({ kind: "card", item: fresh.ask.item, target: fresh.word, meaning: "new", skill: "read" });
    }
    for (const weak of weakWords(ctx)) {
      if (steps.length + later.length >= 6) break;
      const lemma = weak.unit.slice(2);
      if ([...steps, ...later].some((step) => step.target === lemma)) continue;
      const info = sentenceInfo(lemma, ctx, used);
      if (!info) continue;
      used.add(info.item.id);
      steps.push({ kind: "card", item: info.item, target: lemma, meaning: meaningOf(info), skill: "read" });
    }
    if (!steps.length) return { title: "Study cards", steps: [], empty: "There are no words to study right now.", pose: "lounge" };
    return { title: "Study cards", steps: [...steps, ...later] };
  }
  if (mode === "game" && GAMES[arg]) {
    // First, what's due and what you've played; then sentences you haven't had, with the fewest new words first. Worked out only by the
    // games that read it (the word games draw on their own pool).
    // What's due and what you've played, worked out once: each due unit's sentences you've had in the sentences' own order (indexed once,
    // where every sentence was looked through for each due unit, about 0.8 s on a learner a year in, 7 Nov 2026), then the rest you've had.
    // The fresh ones after them come from firstFresh, only as many as a game takes.
    let had = null;
    const hadFirst = () => {
      if (had) return had;
      if (ctx.unstudied()) return (had = []);
      const hadByUnit = new Map();
      for (const info of ctx.infos) {
        if (info.isNew) continue;
        for (const unit of new Set(info.units)) {
          const list = hadByUnit.get(unit);
          if (list) list.push(info);
          else hadByUnit.set(unit, [info]);
        }
      }
      const dueFirst = ctx.due.flatMap((due) => hadByUnit.get(due.unit) ?? []);
      const weak = ctx.infos.filter((i) => !i.isNew && !i.due).sort((a, b) => a.level - b.level || a.lastAt - b.lastAt);
      return (had = [...new Set([...dueFirst, ...weak])]);
    };
    // The first `need` of the whole order (what's due, what you've played, then fresh by fewest new words) that pass.
    const firstInOrder = (need, pass = null) => {
      const out = [];
      for (const info of hadFirst()) {
        if (out.length >= need) return out;
        if (!pass || pass(info)) out.push(info);
      }
      return out.length >= need ? out : [...out, ...firstFresh(ctx.unstudied() ? ctx.infos : ctx.infos.filter((i) => i.isNew), ctx, need - out.length, pass)];
    };
    // Too few words known for this game yet: a few new ones first, and it opens up as you learn them.
    const startWithWords = (have, title) => {
      const fresh = nextNewWords(ctx, Math.max(2, 3 - have.length), new Set(have.map((step) => step.item?.id)));
      const ways = allWays.filter((way) => way === "cards" || way === "meaning");
      const parts = { retries: [], due: [], fresh, fill: [] };
      return { title, note: "First, a few words this game needs.", steps: [...toSteps(parts, ctx, { allowed: ways, settings, match: false }), ...have] };
    };
    if (WORD_GAMES.includes(arg) || arg === "translate") {
      const pool = practicePool(ctx);
      const steps = [];
      if (arg === "translate") {
        // A wider pick, the recorded first, then six.
        const readable = recordedFirst(firstInOrder(18, (info) => ctx.newInAtMost(info, 0)), (info) => recordedHere(info.item)).slice(0, 6);
        for (const info of readable) steps.push(translateStep(info.item, readable.map((one) => one.item), pool));
      } else {
        const byLevel = [...pool].sort((a, b) => ctx.st(a.thing.unit).level - ctx.st(b.thing.unit).level);
        for (const one of arg === "repeat-word" ? recordedFirst(byLevel, (entry) => wordRecordedHere(entry.text)) : byLevel) {
          if (steps.length >= 6) break;
          const step = wordGameStep(arg, one, pool);
          if (step) steps.push(step);
        }
      }
      if (steps.length >= 3) return { title: GAMES[arg].name, steps };
      // Too few known to play it: the path's next new things, met as a lesson meets them, and asked by this game (newThingsFor). Tap the picture's
      // meeting is the game, so it meets as many as make its six; another word game meets three, then asks the three.
      if (WORD_GAMES.includes(arg)) {
        const taken = new Set(steps.map((step) => step.unit));
        const fresh = newThingsFor(arg, ctx, arg === "see" ? 6 - steps.length : 3, taken);
        if (fresh.length) {
          const met = fresh.map((one) => one.meet);
          const asked = fresh.map((one) => one.ask).filter(Boolean);
          return { title: GAMES[arg].name, ...(arg === "see" ? {} : { note: "First, a few words this game needs." }), steps: [...met, ...asked, ...steps] };
        }
      }
      return startWithWords(steps, GAMES[arg].name);
    }
    if (arg === "match") {
      const pool = firstInOrder(9).map((i) => i.item);
      const rounds = [0, 1, 2].map((r) => matchStep(pool.slice(r * 3, r * 3 + 3), settings.match.pairs, ctx)).filter(Boolean);
      if (rounds.length) return { title: GAMES.match.name, steps: rounds };
      // Too few words known for a round: the path's next words met as a lesson meets them, then a round of Match on them.
      const fresh = newThingsFor("see", ctx, Math.max(3, settings.match.pairs)).filter((one) => one.thing.lemma);
      const round = fresh.length >= 3 ? matchStep([], settings.match.pairs, ctx, fresh.map((one) => one.thing.lemma)) : null;
      return round ? { title: GAMES.match.name, note: "First, a few words this game needs.", steps: [...fresh.map((one) => one.meet), round] } : startWithWords([], GAMES.match.name);
    }
    if (arg === "meaning") {
      const used = new Set();
      const steps = [];
      for (const weak of weakWords(ctx)) {
        if (steps.length >= 6) break;
        const lemma = weak.unit.slice(2);
        const info = sentenceInfo(lemma, ctx, used);
        if (!info || !meaningChoices(lemma, info.item)) continue;
        used.add(info.item.id);
        steps.push({ kind: "meaning", item: info.item, target: lemma, skill: "read", meaning: meaningOf(info) });
      }
      return steps.length >= 3 ? { title: GAMES.meaning.name, steps } : startWithWords(steps, GAMES.meaning.name);
    }
    // Only this game: its version that tests the strength due, where the game has versions, on sentences it can run on.
    const steps = [];
    const fitting = (one) => fits([arg], one, ctx, null) && canPlay([arg], one.item, settings);
    const picked = LISTENING_GAMES.has(arg) ? recordedFirst(firstInOrder(18, fitting), (info) => recordedHere(info.item)).slice(0, 6) : firstInOrder(6, fitting);
    for (const info of picked) {
      const due = ctx.due.find((d) => info.units.includes(d.unit));
      const step = gameFor(info, due ?? weakestFocus(info, ctx), null, [arg], settings, ctx);
      steps.push({ ...(step?.kind === arg ? step : { kind: arg, ...(GAP_GAMES.has(arg) ? { target: targetOf(info.item), skill: GAP_SKILL[arg] } : {}) }), item: info.item, meaning: meaningOf(info) });
    }
    return steps.length >= 3 ? { title: GAMES[arg].name, steps } : startWithWords(steps, GAMES[arg].name);
  }
  // A session on one thing: its sentences you can read as games, the others as a card on their new word.
  const onOneThing = (matching, focus) => {
    const parts = [];
    let previous = null;
    for (const info of matching) {
      const step = gameFor(info, focus ?? weakestFocus(info, ctx), previous, allWays, settings, ctx);
      if (!step) continue;
      previous = step.kind;
      const target = step.target;
      const first = step.kind === "card" && target && !ctx.known(target);
      if (target && !ctx.known(target)) ctx.meeting.add(target);
      parts.push({ ...step, item: info.item, meaning: meaningOf(info), ...(first ? { first: true } : {}) });
    }
    return parts;
  };
  if (mode === "concept" && arg) {
    const matching = ctx.infos.filter((info) => info.units.includes(arg) && !(info.isNew && isNotFirst(info.item)));
    if (!matching.length) return { title: "One concept", steps: [], empty: "Nothing practices that yet.", pose: "shrug" };
    const s = ctx.st(arg);
    const skill = dueSkill(s) ?? s.trained.slice().sort((a, b) => (s.strengths[a]?.recall ?? -1) - (s.strengths[b]?.recall ?? -1))[0];
    const focus = skill ? { unit: arg, skill, level: s.strengths[skill]?.level ?? 0 } : null;
    // A word comes in sentences with it; a pattern in the ones you've played, then the ones with the fewest new words.
    const ordered = [...matching].sort((a, b) => Number(a.isNew) - Number(b.isNew) || ctx.newIn(a, arg.slice(2)) - ctx.newIn(b, arg.slice(2)) || a.lastAt - b.lastAt).slice(0, 6);
    return { title: writtenName(arg) ?? "One concept", steps: onOneThing(ordered, focus) };
  }
  // A topic pack, studied by itself (Study's "study a topic"): its next lesson you haven't done, words you don't know first; once its lessons
  // are behind you, a session on its own words you've learned.
  if (mode === "pack" && arg) {
    const pack = WORD_PACKS.find((one) => one.id === arg);
    if (!pack) return { title: "Study", steps: [], empty: "That pack isn't on. Turn it on in Your packs to study it.", pose: "off" };
    const finished = doneMarks();
    const next = pathLessons().find((lesson) => lesson.pack === arg && !lessonDone(lesson, ctx, finished));
    if (next) return plannedSession("lesson", next.id, now);
    const words = new Set(pack.words);
    const matching = ctx.infos
      .filter((info) => words.has(targetOf(info.item)) && !info.isNew)
      .sort((a, b) => a.level - b.level || a.lastAt - b.lastAt)
      .slice(0, 8);
    return matching.length ? { title: pack.name, steps: onOneThing(matching, null) } : { title: pack.name, steps: [], empty: `Nothing from ${pack.name} to study yet.`, pose: "lounge" };
  }
  if (mode === "topic" && TOPICS[arg]) {
    const matching = ctx.infos
      .filter((info) => info.item.topic === arg && !(info.isNew && isNotFirst(info.item)))
      .sort((a, b) => Number(a.isNew) - Number(b.isNew) || ctx.newIn(a) - ctx.newIn(b) || a.order - b.order)
      .slice(0, 6);
    return { title: TOPICS[arg], steps: onOneThing(matching, null) };
  }
  return { title: "Study", steps: [], empty: "That way of studying isn't available.", pose: "shrug" };
}

/**
 * Practice this, from a concept's sheet in a session: up to `count` questions on that concept, from its own short session, leaving out
 * sentences the session still has coming (have: their ids), each marked slipped. [] when there's nothing to ask.
 */
export function slipInSteps(unit, { have = new Set(), count = 3, now = Date.now() } = {}) {
  return planSession("concept", unit, now)
    .steps.filter((step) => step.kind !== "meet" && !(step.item && have.has(step.item.id)))
    .slice(0, count)
    .map((step) => ({ ...step, slipped: unit }));
}

/** English for a word concept's lemma (for the match game). */
export const english = (word) => WORDS[word] ?? word;
