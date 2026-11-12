// Find your level: a short check that places someone who already knows some of a language on its path (a full course: the language's own
// written path, in units). A unit is tried with questions from its own lessons, tapping only: two of its words (Which word is it?), two of
// its sentences to build in English (What does it say?) and one to put in order. Four right shows the unit; three asks two more of it, and
// both right shows it. The search starts where the first run's answer says, goes up PLACEMENT.climb units at a time while units are shown,
// then halves the gap between the highest shown and the lowest not, until they're next to each other or PLACEMENT.mostTried units are
// tried. You're placed at the first unit not shown. A sentence too tall for the screen is asked on a shorter one, then as a word (shortStep).
// The rules' numbers, measured on every full course: scripts/test-placement.mjs.
//
// What's kept: a right answer, as the game records any (session.js keeps only right rows in a placement: a word you were never taught isn't
// a memory that failed); and the placement, on the path (path-place.js placementOn): the lessons before the unit you're placed at count as done
// (plan.js), their words that nothing has tested since are read as known where the plan decides what you can read and never counted
// (plan.js assumed), and the words you missed in them are taught as new. Pure but for applyPlacement, so its rules run in Node.

import { WORDS, contentLanguage, itemById } from "./content.js";
import { pathLessons } from "./path.js";
import { alsoAnswer, englishTiles, shownThing, translateStep, wordStep } from "./lesson.js";
import { isHeavy } from "./new-words.js";
import { placementOn, placeSnapshot, restorePlace, setPlacement } from "./path-place.js";

export const PLACEMENT = {
  // The questions a unit is tried with, in turn, and what shows it.
  block: ["word", "translate", "arrange", "translate", "word"],
  need: 4,
  // Exactly `close` right: `extra` more of the unit, and every one of them right shows it.
  close: 3,
  extra: ["word", "translate"],
  mostTried: 6,
  climb: 4,
  // A sentence asked as tiles: at most so long (a 375 × 667 phone fits every one; at 320 × 568 a long one is asked another way: shortStep).
  mostWords: 8,
  mostTiles: 7,
  leastWords: 3,
  // A sentence's stand-in on a screen too small for it: at least so many tiles, so it's still no guess (shortStep).
  leastShort: 4,
};

/** Where the first run's answers start the search: a few words, enough to get by, a conversation. */
export const STARTS = { few: 2, by: 5, talk: 9 };
const START_AGAIN = 5;

// ---------- seeded draws ----------

const hash = (text) => [...String(text)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
/** mulberry32 on a text's hash: the same seed, the same numbers. */
export function seededRandom(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = (list, random) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// ---------- the units and what each can ask ----------

const lemmasIn = (item) => [...new Set(item.words.map(([, lemma]) => lemma).filter(Boolean))];

/**
 * The language's own written path in units, in order: [{ n, id, title, lessons, first (its first lesson to start), words (entries, as lesson.js
 * pools them), sentences: [{ item, reach }] }], each sentence readable by the unit's end (every word it has taught by then) and short enough to
 * ask as tiles; reach is how many earlier units its words come from (the sentences that reach most are asked first). [] for a language with
 * no written path. lessons: pathLessons() (a test passes its own).
 */
export function placementUnits(lessons = pathLessons(), lang = contentLanguage()) {
  const own = lessons.filter((lesson) => lesson.pack === `path-${lang}` && !lesson.worked && lesson.unit);
  const units = [];
  const byId = new Map();
  for (const lesson of own) {
    if (!byId.has(lesson.unit.id)) {
      const unit = { n: units.length + 1, id: lesson.unit.id, title: lesson.unit.title, lessons: [] };
      byId.set(lesson.unit.id, unit);
      units.push(unit);
    }
    byId.get(lesson.unit.id).lessons.push(lesson);
  }
  // Where each word is first taught.
  const taughtIn = new Map();
  for (const unit of units) for (const lesson of unit.lessons) for (const thing of lesson.things ?? []) if (thing.lemma && !taughtIn.has(thing.lemma)) taughtIn.set(thing.lemma, unit.n);
  for (const unit of units) {
    unit.first = unit.lessons.find((lesson) => !lesson.full) ?? unit.lessons[0];
    const seen = new Set();
    unit.words = [];
    for (const lesson of unit.lessons) {
      for (const thing of lesson.things ?? []) {
        if (thing.formOnly || !thing.lemma || seen.has(thing.lemma) || isHeavy(thing.lemma) || !(thing.means || WORDS[thing.lemma])) continue;
        const shown = shownThing({ ...thing, means: thing.means || WORDS[thing.lemma] });
        if (!shown.text || !shown.means) continue;
        seen.add(thing.lemma);
        unit.words.push({ key: thing.lemma, thing, own: true, ...shown });
      }
    }
    const ids = new Set();
    unit.sentences = [];
    for (const lesson of unit.lessons) {
      for (const id of lesson.items ?? []) {
        const item = itemById.get(id);
        if (!item || ids.has(id) || !item.means) continue;
        const lemmas = lemmasIn(item);
        if (!lemmas.length || lemmas.some((lemma) => !(taughtIn.get(lemma) <= unit.n))) continue;
        const tiles = englishTiles(item.means).length;
        if (item.words.length < PLACEMENT.leastWords || item.words.length > PLACEMENT.mostWords || tiles < PLACEMENT.leastWords || tiles > PLACEMENT.mostTiles) continue;
        ids.add(id);
        unit.sentences.push({ item, reach: new Set(lemmas.map((lemma) => taughtIn.get(lemma)).filter((n) => n < unit.n)).size });
      }
    }
  }
  return units;
}

/** Whether the language you're learning has a course to find your level in: its own written path, in units. Cheap (the units only), for a row. */
export function courseHere(lessons = pathLessons(), lang = contentLanguage()) {
  const units = new Set();
  for (const lesson of lessons) if (lesson.pack === `path-${lang}` && !lesson.worked && lesson.unit) units.add(lesson.unit.id);
  return units.size >= 2;
}

/** Whether a language has a course this check can place you on: a written path in units, each with enough to ask. */
export function canPlace(units = placementUnits()) {
  return units.length >= 2 && units.every((unit) => unit.words.length >= 4 && unit.sentences.length >= 4);
}

/**
 * The questions a unit is tried with: `kinds` in turn (word, translate, arrange), none asked before (`avoid`: sentence ids and words),
 * sentences that reach most of the units under it first, words in a seeded order. Each step carries placement: { unit }.
 */
export function unitSteps(unit, kinds, random, avoid = new Set()) {
  const words = shuffled(unit.words.filter((one) => !avoid.has(one.key)), random);
  const sentences = shuffled(unit.sentences.filter((one) => !avoid.has(one.item.id)), random).sort((a, b) => b.reach - a.reach);
  const steps = [];
  for (const kind of kinds) {
    if (kind === "word") {
      // From English, its word among the unit's own (wordStep: three to pick from).
      for (let entry = words.shift(); entry; entry = words.shift()) {
        const step = wordStep(entry, unit.words);
        if (!step) continue;
        avoid.add(entry.key);
        steps.push({ ...step, placement: { unit: unit.n } });
        break;
      }
      continue;
    }
    // A sentence: built in English (What does it say?), or put in order in the language (Put it in order).
    const one = sentences.find((sentence) => !avoid.has(sentence.item.id) && (kind !== "arrange" || sentence.item.words.length > 1));
    if (!one) continue;
    avoid.add(one.item.id);
    sentences.splice(sentences.indexOf(one), 1);
    const step = kind === "translate" ? translateStep(one.item, unit.sentences.map((sentence) => sentence.item), unit.words) : { kind: "arrange", mode: "dutch", skill: "read", item: one.item };
    steps.push({ ...step, placement: { unit: unit.n } });
  }
  return steps;
}

/** A sentence's English as What does it say?'s tiles (for the checks). */
export const englishTilesOf = (item) => englishTiles(item.means);

/**
 * A sentence's first stand-in where it's too tall for the screen (session.js askAnotherWay; 320 × 568 asks it of most past unit 2): the same
 * kind of question on one of the unit's smallest sentences of at least PLACEMENT.leastShort tiles, so still nowhere near a guess (1 in 24 or
 * less, where a word is 1 in 3). Smallest as measured at 320 × 568: the sentence in the language past about 26 letters takes What does it say?'s
 * card to a second line, and 9 tiles or more (the word-for-word reading's own among them) its bank to a third row; Put it in order's tiles go to
 * a third row past about 35 letters. null when the unit has none left.
 */
export function shortStep(unit, kind, random, avoid = new Set()) {
  const letters = (item) => item.words.map(([text]) => text).join(" ").length;
  const choices = [];
  for (const sentence of shuffled(unit.sentences.filter((one) => !avoid.has(one.item.id)), random)) {
    const { item } = sentence;
    if (kind === "arrange") {
      if (item.words.length >= PLACEMENT.leastShort) choices.push({ item, size: letters(item) / 35 });
      continue;
    }
    const answer = englishTiles(item.means);
    if (answer.length < PLACEMENT.leastShort) continue;
    // Its bank as translateStep makes it, counted without making it (a block's stand-ins weigh every sentence of the unit): the English's
    // tiles, the word-for-word reading's beyond them, and its strays.
    const tiles = answer.length + beyondCount(alsoAnswer(item), answer) + (answer.length <= 3 ? 1 : 2);
    choices.push({ item, size: Math.max(letters(item) / 26, tiles / 8) });
  }
  const [one] = choices.sort((a, b) => a.size - b.size);
  if (!one) return null;
  avoid.add(one.item.id);
  const step = kind === "translate" ? translateStep(one.item, unit.sentences.map((sentence) => sentence.item), unit.words) : { kind: "arrange", mode: "dutch", skill: "read", item: one.item };
  return { ...step, placement: { unit: unit.n } };
}
// How many of `also`'s words `answer` hasn't (lesson.js beyond's count).
function beyondCount(also, answer) {
  if (!also) return 0;
  const left = [...answer];
  let more = 0;
  for (const word of also) {
    const at = left.indexOf(word);
    if (at < 0) more++;
    else left.splice(at, 1);
  }
  return more;
}

// ---------- the search ----------

/** A search's start: nothing shown, nothing not shown, the first unit to try. count: the units there are. */
export function searchStart(count, start) {
  return { count, passed: 0, failed: count + 1, tried: [], at: Math.max(1, Math.min(count, Math.round(start) || 1)), done: false };
}

/** A unit settled, shown or not: the search after it (the next unit to try in `at`, or done). Pure. */
export function settle(state, n, shown) {
  const tried = [...state.tried, n];
  let passed = shown ? Math.max(state.passed, n) : state.passed;
  const failed = shown ? state.failed : Math.min(state.failed, n);
  // A unit not shown below one shown: the one not shown decides (placed lower, never higher).
  if (failed <= passed) passed = failed - 1;
  const next = { ...state, tried, passed, failed };
  if (failed - passed <= 1 || tried.length >= PLACEMENT.mostTried) return { ...next, done: true, at: null };
  const at = failed === state.count + 1 ? Math.min(state.count, passed + PLACEMENT.climb) : Math.floor((passed + failed) / 2);
  if (at === passed || tried.includes(at)) return { ...next, done: true, at: null };
  return { ...next, at };
}

/** The most units a search could still try, whatever it finds: what its progress fills toward. */
export function mostLeft(state) {
  if (state.done) return 0;
  return 1 + Math.max(mostLeft(settle(state, state.at, true)), mostLeft(settle(state, state.at, false)));
}

/** Where a search places you: the first unit not shown (1: from the beginning; count + 1: past the whole course). */
export const placedAt = (state) => state.passed + 1;

/** A unit's answers so far (in order) as a verdict: "shown", "not", "more" (exactly PLACEMENT.close of the first: its extra questions next) or null (not all in). */
export function verdictOf(answers) {
  const first = answers.slice(0, PLACEMENT.block.length);
  if (first.length < PLACEMENT.block.length) return null;
  const right = first.filter(Boolean).length;
  if (right >= PLACEMENT.need) return "shown";
  if (right !== PLACEMENT.close) return "not";
  const extra = answers.slice(PLACEMENT.block.length);
  if (extra.length < PLACEMENT.extra.length) return extra.some((one) => !one) ? "not" : "more";
  return extra.every(Boolean) ? "shown" : "not";
}

// ---------- a placement as a session plays it ----------

/**
 * A placement for session.js: start (STARTS' keys, or "again": from where you're placed, else unit START_AGAIN); seed and avoid (the last
 * placement's questions) make each one its own. { units, steps (the first unit's), answered(step, right) → the steps to add (none: done or the
 * unit's not in yet), progress() → { settled, most }, result(), stopNow() (the result if it stopped here), done }.
 */
export function makePlacement({ start = "few", seed = String(Date.now()), units = placementUnits(), avoid = [] } = {}) {
  const random = seededRandom(`placement:${seed}`);
  const placed = placementOn(contentLanguage())?.placed;
  const from = start === "again" ? (placed?.n ?? START_AGAIN) : (STARTS[start] ?? STARTS.few);
  let state = searchStart(units.length, from);
  const asked = new Set(avoid);
  const askedNow = [];
  const answers = new Map(); // unit n → [right…]
  const missedWords = []; // [unit n, lemma]
  let right = 0;
  let questions = 0;
  const stepsFor = (n, kinds) => {
    const steps = unitSteps(units[n - 1], kinds, random, asked);
    for (const step of steps) askedNow.push(step.item?.id ?? step.target);
    // Each sentence's stand-ins (instead, below), drawn with its block: a shorter sentence asked the same way (shortStep), and under that, a
    // word of the same unit by itself, its drawing fetched with the block's (a step waiting for its drawing leaves the one before it showing).
    for (const step of steps) {
      if (step.kind === "word") continue;
      const short = shortStep(units[n - 1], step.kind, random, asked);
      const word = unitSteps(units[n - 1], ["word"], random, asked)[0] ?? null;
      if (short) short.spare = word;
      step.spare = short ?? word;
    }
    return steps;
  };
  const self = {
    units,
    from,
    steps: units.length ? stepsFor(state.at, PLACEMENT.block) : [],
    get done() {
      return state.done;
    },
    get state() {
      return state;
    },
    answered(step, wasRight) {
      const n = step.placement?.unit;
      if (!n || state.done) return [];
      questions++;
      if (wasRight) right++;
      else if (step.kind === "word" && step.target) missedWords.push([n, step.target]);
      const list = [...(answers.get(n) ?? []), Boolean(wasRight)];
      answers.set(n, list);
      const verdict = verdictOf(list);
      if (verdict === null) return [];
      if (verdict === "more") return list.length === PLACEMENT.block.length ? stepsFor(n, PLACEMENT.extra) : [];
      state = settle(state, n, verdict === "shown");
      return state.done ? [] : stepsFor(state.at, PLACEMENT.block);
    },
    progress() {
      const settled = state.tried.length;
      return { settled, most: settled + mostLeft(state) };
    },
    result() {
      return resultOf(state);
    },
    stopNow() {
      // Stopped partway: placed by the units shown so far (the unit being tried counts for nothing).
      return resultOf({ ...state, done: true });
    },
    // A question of tiles too tall for this screen at its tightest (session.js askAnotherWay): its stand-in instead, a shorter sentence asked
    // the same way, or (that too tall as well) a word of the same unit by itself, which always fits. null when the unit had none left.
    instead(step) {
      const other = step.spare ?? null;
      if (other) askedNow.push(other.item?.id ?? other.target);
      return other;
    },
  };
  function resultOf(at) {
    const n = placedAt(at);
    return {
      placed: n,
      count: units.length,
      units,
      unit: units[n - 1] ?? null,
      shown: at.tried.filter((one) => one < n),
      tried: at.tried.length,
      right,
      questions,
      missed: missedWords.filter(([unit]) => unit < n).map(([, lemma]) => lemma),
      asked: askedNow,
    };
  }
  return self;
}

/** The lessons a placement at unit n counts as done: every lesson of the units before it. */
export const lessonsBefore = (units, n) => units.filter((unit) => unit.n < n).flatMap((unit) => unit.lessons.map((lesson) => lesson.id));

/**
 * Puts a placement's result on the path (path-place.js): placed past a unit or more, its record and your place at the placed unit's first
 * lesson (past the whole course: after it); from the beginning, as keepPlacement leaves it (nothing changed: a placement already there stays).
 * Either way it's noted as taken, with what it asked (the next one draws others). Returns what was there before, for an Undo (undoPlacement).
 */
export function applyPlacement(result, lang = contentLanguage()) {
  const before = placeSnapshot(lang);
  const asked = result.asked.slice(-200);
  const taken = Date.now();
  if (result.placed <= 1) {
    keepPlacement(result, lang);
    return before;
  }
  const whole = result.placed > result.count;
  const placed = {
    unit: whole ? null : result.unit.id,
    n: result.placed,
    at: taken,
    lessons: lessonsBefore(result.units, result.placed),
    missed: [...new Set(result.missed)].slice(0, 400),
  };
  setPlacement(lang, { placed, taken, asked }, { lesson: whole ? null : result.unit.first.id });
  return before;
}

/** A placement's result left as it was: noted as taken, with what it asked; the placement you had (if any) and your place unchanged. */
export function keepPlacement(result, lang = contentLanguage()) {
  const was = placementOn(lang);
  setPlacement(lang, { placed: was?.placed ?? null, taken: Date.now(), asked: result.asked.slice(-200) });
}

/** Back to how the path was before a placement (or before Start from the beginning): what applyPlacement or clearPlacement returned. */
export const undoPlacement = (before, lang = contentLanguage()) => restorePlace(lang, before);

/** Start from the beginning: no placement, your place back where your learning has got to. Returns what was there, for an Undo. */
export function clearPlacement(lang = contentLanguage()) {
  const before = placeSnapshot(lang);
  const was = placementOn(lang);
  setPlacement(lang, { placed: null, taken: was?.taken ?? 0, asked: was?.asked ?? [] }, { lesson: null });
  return before;
}

/** The sentence ids and words the last placement asked, so the next one draws others. */
export const askedBefore = (lang = contentLanguage()) => new Set(placementOn(lang)?.asked ?? []);

/** A placement as session.js plays it: its plan ({ title, steps, placement }), or an empty one where the language has no course to place you on. */
export function placementPlan(start) {
  const units = placementUnits();
  if (!canPlace(units)) return { title: "Finding your level", steps: [], empty: "There's no course here to find your level in yet.", pose: "page" };
  const placement = makePlacement({ start, units, avoid: [...askedBefore()] });
  return { title: "Finding your level", steps: placement.steps, placement, instead: (step) => placement.instead(step) };
}
