// Find your level: a short check that places someone who already knows some of a language on its path (a full course: the language's own
// written path, in units). One question at a time, tapping only: a word (Which word is it?) or a sentence, built in English (What does it say?)
// or put in order. It starts simple for everyone and climbs: the first questions are unit 1's, each right answer climbs (faster on a streak),
// a wrong one or I don't know steps back down and probes the easier units more finely, and the first run's answer only says where the first
// climb lands (makeSearch, SEARCH). About 20 questions; then a few more for the grammar ideas not asked yet, each in the unit that teaches it.
// Knowing the whole course is a real outcome, and needs proof across its last third. A sentence too tall for the screen is asked on a shorter
// one, then as a word (shortStep).
//
// What's kept: a right answer, as the game records any (session.js keeps only right rows in a placement: a word you were never taught isn't
// a memory that failed); and the placement, on the path (path-place.js placementOn): the lessons before the unit you're placed at count as done
// (plan.js), and what they teach is put down as known (placedSeeds, PLACED: known well from the start, counted, and back in your reviews over
// the weeks after, a few a day, so each is confirmed or taught again); the words you missed in it, and an idea missed in the unit that teaches
// it, are taught as new. Pure but for applyPlacement, so its rules run in Node.

import { WORDS, contentLanguage, itemById } from "./content.js";
import { pathLessons } from "./path.js";
import { alsoAnswer, englishTiles, shownThing, translateStep, wordStep } from "./lesson.js";
import { isHeavy } from "./new-words.js";
import { placementOn, placeSnapshot, restorePlace, setPlacement } from "./path-place.js";
import { scriptOf } from "./script.js";

export const PLACEMENT = {
  // A sentence asked as tiles: at most so long (a 375 × 667 phone fits every one; at 320 × 568 a long one is asked another way: shortStep).
  mostWords: 8,
  mostTiles: 7,
  leastWords: 3,
  // A sentence's stand-in on a screen too small for it: at least so many tiles, so it's still no guess (shortStep).
  leastShort: 4,
};

/**
 * What a placement puts down as known (placedSeeds; progress.js setPlaced, scheduler.js seededMemory): every word, phrase and idea the units
 * it placed you past teach, but the words you missed in it, each known from the day it's taken with a stability that's the day of its first
 * review: the unit next to where you're placed first, from day `firstDay`, then each unit before it, about `aDay` a day, so they come back
 * spread over weeks, the earliest (surest) last, and never all at once. At least 10 days: a word you know well (know/word-index.js
 * UNDERSTOOD_LEVEL) from the start.
 */
export const PLACED = { firstDay: 10, aDay: 6 };


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

/**
 * The search's rules. It asks one question at a time and keeps a belief about two things: the learner's level L (where they know half of a
 * unit's words) and their spread s (how gently their knowing falls off from unit to unit), on a grid. Knowing a unit's word: ceiling ·
 * σ((L − unit) / s); a word picked right on knowing it or a 1-in-3 guess; a sentence right on knowing to the power sentenceHarder (it holds
 * several words and its ideas) or a near-impossible guess. After each answer the belief is updated by that chance (Bayes), and the next
 * question goes to the unit where the belief expects `aim.normal` right, `aim.streak` after a streak of right answers (it climbs faster), and
 * `aim.missed` after a miss or I don't know (it steps down and probes the easier units finely: never a harder unit than the one missed). The first `opening` questions are unit 1's, for
 * everyone; both right, the next lands at the first run's answer (`landing`, the only say the self-rating has). Words and sentences in turn
 * (every `wordEvery`th a word), What does it say? and Put it in order in turn. It settles at `least` questions once the belief's middle and
 * hopeful readings of where they'd start are `narrow` units apart or less, or at `most`, then asks up to `ideaChecks` more: each a sentence
 * from the unit that teaches an idea not asked yet below where it would place them. Sure they start at the beginning (`beginning`), it stops
 * early: a newcomer isn't asked unit 1 again and again. The place: the belief's median start unit (`middle`), a
 * unit counting as known where `known` of its words are, never past the highest unit answered right but one; stopped partway, the lower
 * of its cautious `stopAt` reading and the unit after the highest with `stopEvidence` sentences answered right at it or above. Knowing the whole course needs proof at the top: `everything.sure` sure, and at least `everything.lastThird` questions
 * asked in the last third with `everything.rightShare` of them right (while it looks likely, each unit of the last third is asked in turn).
 * Measured on graded learners (knowing that fades by unit, ideas a little behind their words): scripts/test-placement.mjs.
 */
export const SEARCH = {
  opening: 2,
  landing: { few: 3, by: 6, talk: 10 },
  aim: { normal: 0.65, streak: 0.5, missed: 0.85 },
  streak: 3,
  wordEvery: 3,
  least: 18,
  most: 24,
  narrow: 2,
  middle: 0.5,
  hopeful: 0.75,
  stopAt: 0.1,
  stopEvidence: 2,
  everything: { sure: 0.9, lastThird: 6, rightShare: 0.8 },
  beginning: { sure: 0.95, least: 4 },
  ideaChecks: 6,
  ceiling: 0.97,
  known: 0.8,
  sentenceHarder: 2.3,
  guessWord: 1 / 3,
  guessSentence: 0.002,
};

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
/** How likely a learner at level L with spread s knows unit u's words (the search's model). */
export const knowing = (L, s, u) => SEARCH.ceiling * sigmoid((L - u) / s);
/** How likely they answer a question of unit u right: a word or a sentence ("sentence"), knowing it or guessing (guess: its own chance by guessing). */
export function chanceRight(L, s, u, kind, guess = kind === "word" ? SEARCH.guessWord : SEARCH.guessSentence) {
  const k = knowing(L, s, u);
  const known = kind === "word" ? k : k ** SEARCH.sentenceHarder;
  return known + (1 - known) * guess;
}

// Ordered picks of `answer.length` of `tiles` that read as `answer`, over every ordered pick of that many: a guesser who knows how many to place.
function orderChance(tiles, answer) {
  let all = 1;
  for (let i = 0; i < answer.length; i++) all *= tiles.length - i;
  const left = new Map();
  for (const tile of tiles) left.set(tile, (left.get(tile) ?? 0) + 1);
  let ways = 1;
  for (const word of answer) {
    const n = left.get(word) ?? 0;
    if (!n) return 0;
    ways *= n;
    left.set(word, n - 1);
  }
  return ways / all;
}
/**
 * A step's chance of being right by guessing alone, from its real choices and tiles: a word's 1 in its choices; What does it say?'s orders that
 * read right (its word-for-word reading's too) over every order; Put it in order's its own words and the one stray (session.js strayFor). The
 * search weighs a right answer by it, so a lucky short sentence counts for little.
 */
export function guessChance(step) {
  if (step.kind === "word") return 1 / Math.max(1, step.options?.length ?? 3);
  if (step.kind === "translate") return Math.min(1, orderChance(step.tiles, step.answer) + (step.also ? orderChance(step.tiles, step.also) : 0));
  const words = step.item.words.map(([text]) => text);
  return orderChance([...words, "\u0000stray"], words);
}
const LOGIT = () => Math.log(SEARCH.known / SEARCH.ceiling / (1 - SEARCH.known / SEARCH.ceiling));
/** Where such a learner starts: the first unit whose words they know under SEARCH.known (count + 1: the whole course). */
export const startUnit = (L, s, count) => Math.max(1, Math.min(count + 1, Math.floor(L - LOGIT() * s) + 1));

/**
 * A search over `count` units, pure (session.js plays it through makePlacement; the checks play it with simulated learners). landing: the unit
 * the first climb lands at. { next(previous) → { n, kind, idea? } (kind: word, translate or arrange; idea: an idea check's) or null when it's done,
 * answered(n, kind, right, guess), placed() → its place now (count + 1: the whole course), stopped() → the place were it stopped now, sure(t) → how sure it
 * is they'd start at t, asked: the answers so far ([{ n, kind, right }]), done }. ideaCheck(placed) → { n, idea } for the next idea check, or null.
 */
export function makeSearch({ count, landing, ideaCheck = () => null }) {
  const grid = [];
  for (let L = -1; L <= count + 6.0001; L += 0.25) for (const s of [0.8, 1.3, 2.0]) grid.push({ L, s, w: 1, start: startUnit(L, s, count) });
  const answers = [];
  let sentenceTurn = 0;
  let settledAt = 0;
  let done = false;
  const normalize = () => {
    const sum = grid.reduce((a, g) => a + g.w, 0);
    for (const g of grid) g.w /= sum;
  };
  normalize();
  const starts = () => {
    const p = new Array(count + 2).fill(0);
    for (const g of grid) p[g.start] += g.w;
    return p;
  };
  const quantile = (q) => {
    const p = starts();
    let c = 0;
    for (let t = 1; t <= count + 1; t++) {
      c += p[t];
      if (c >= q - 1e-12) return t;
    }
    return count + 1;
  };
  const top = Math.ceil((count * 2) / 3) + 1;
  const lastThird = () => answers.filter((a) => a.n >= top);
  // Never placed past the highest unit answered right but one: nothing it hasn't seen you know.
  const highestRight = () => Math.max(0, ...answers.filter((a) => a.right).map((a) => a.n));
  const sentenceKind = () => (sentenceTurn++ % 2 === 0 ? "translate" : "arrange");
  function unitFor(kind) {
    const i = answers.length;
    if (i < SEARCH.opening) return 1;
    if (i === SEARCH.opening && answers.every((a) => a.right)) return Math.max(1, Math.min(count, landing));
    const recent = answers.slice(-SEARCH.streak);
    const last = answers.at(-1);
    const missed = last?.right === false;
    const p = starts();
    // Past the course, likely: the proof is across its last third, each of its units in turn (the least asked first, the later of two); after
    // a miss there, none harder than the one missed.
    if (p[count + 1] > 0.5 && !(missed && last.n < top)) {
      const times = (n) => answers.filter((a) => a.n === n).length;
      const highest = missed ? last.n : count;
      let pick = highest;
      for (let n = highest; n >= top; n--) if (times(n) < times(pick)) pick = n;
      return pick;
    }
    const onStreak = recent.length === SEARCH.streak && recent.every((a) => a.right);
    const aim = missed ? SEARCH.aim.missed : onStreak ? SEARCH.aim.streak : SEARCH.aim.normal;
    const as = kind === "word" ? "word" : "sentence";
    let best = 1;
    let bestGap = Infinity;
    for (let n = 1; n <= count; n++) {
      const chance = grid.reduce((a, g) => a + g.w * chanceRight(g.L, g.s, n, as), 0);
      const gap = Math.abs(chance - aim);
      if (gap < bestGap - 1e-9 || (Math.abs(gap - bestGap) < 1e-9 && n > best)) {
        best = n;
        bestGap = gap;
      }
    }
    // After a miss it steps back down: never a harder unit than the one missed (a word is easier than a sentence of its unit, so aiming alone
    // could ask a word of a later one).
    return missed ? Math.min(best, last.n) : best;
  }
  const placedNow = (q) => Math.max(1, Math.min(count, quantile(q), highestRight() + 1));
  // The highest unit with real evidence under it: at least `stopEvidence` sentences answered right at it or above (a word is a 1-in-3 guess).
  const evidenced = () => {
    const right = answers.filter((a) => a.right && a.kind !== "word").map((a) => a.n).sort((a, b) => b - a);
    return right[SEARCH.stopEvidence - 1] ?? 0;
  };
  function placed() {
    const p = starts();
    const topAsked = lastThird();
    const everything =
      p[count + 1] >= SEARCH.everything.sure && topAsked.length >= SEARCH.everything.lastThird && topAsked.filter((a) => a.right).length >= SEARCH.everything.rightShare * topAsked.length;
    return everything ? count + 1 : placedNow(SEARCH.middle);
  }
  return {
    get asked() {
      return answers;
    },
    get done() {
      return done;
    },
    next() {
      if (done) return null;
      if (settledAt) {
        const check = answers.length - settledAt < SEARCH.ideaChecks ? ideaCheck(placedNow(SEARCH.middle)) : null;
        if (!check) {
          done = true;
          return null;
        }
        return { n: check.n, kind: sentenceKind(), idea: check.idea };
      }
      const kind = answers.length % SEARCH.wordEvery === 0 ? "word" : sentenceKind();
      return { n: unitFor(kind), kind };
    },
    answered(n, kind, right, guess) {
      if (done) return;
      answers.push({ n, kind, right: Boolean(right) });
      const as = kind === "word" ? "word" : "sentence";
      for (const g of grid) {
        const p = chanceRight(g.L, g.s, n, as, guess);
        g.w *= right ? p : 1 - p;
      }
      normalize();
      const i = answers.length;
      // Settled; or sure they start at the beginning, so a newcomer isn't asked unit 1 again and again.
      const beginning = i >= SEARCH.beginning.least && starts()[1] >= SEARCH.beginning.sure;
      if (!settledAt && (i >= SEARCH.most || beginning || (i >= SEARCH.least && quantile(SEARCH.hopeful) - quantile(SEARCH.middle) <= SEARCH.narrow))) {
        settledAt = i;
        if (!SEARCH.ideaChecks) done = true;
      }
    },
    placed,
    // Stopped partway: the lower of its cautious reading and the unit after the highest with real evidence, so a few answers never skip
    // many units.
    stopped: () => (answers.length ? Math.max(1, Math.min(placedNow(SEARCH.stopAt), SEARCH.stopEvidence ? evidenced() + 1 : Infinity)) : 1),
    sure: (t) => starts()[t] ?? 0,
    // The most questions it could take: what its bar fills toward.
    most: () => (done ? answers.length : SEARCH.most + SEARCH.ideaChecks),
    // Done now (a question it wanted couldn't be asked: the course has none left).
    end() {
      done = true;
    },
  };
}

// ---------- a placement as a session plays it ----------

/** Where each idea a course teaches is taught: its first unit, by pattern id. */
export function ideasTaught(units) {
  const at = new Map();
  for (const unit of units) for (const lesson of unit.lessons) if (lesson.concept?.pattern && !at.has(lesson.concept.pattern)) at.set(lesson.concept.pattern, unit.n);
  return at;
}

/**
 * A placement for session.js: start (SEARCH.landing's keys, or "again": landing where you're placed, else at "by"); seed and avoid (the last
 * placement's questions) make each one its own. { units, steps (its first question), answered(step, right) → the next question (none: done),
 * progress() → { settled, most }, result(), stopNow() (the result were it stopped here), done, instead(step) }. A sentence asks the ideas not
 * asked yet first, the unit's own first (each idea asked in the unit that teaches it).
 */
export function makePlacement({ start = "few", seed = String(Date.now()), units = placementUnits(), avoid = [] } = {}) {
  const random = seededRandom(`placement:${seed}`);
  const placed = placementOn(contentLanguage())?.placed;
  const landing = start === "again" ? (placed?.n ?? SEARCH.landing.by) : (SEARCH.landing[start] ?? SEARCH.landing.few);
  const count = units.length;
  const taught = ideasTaught(units);
  const covered = new Set(); // ideas asked
  const asked = new Set(avoid);
  const askedNow = [];
  const missedWords = []; // [unit n, lemma]
  const missedIdeas = []; // [unit n, "p:<pattern>"]: a sentence missed in the unit that teaches its idea
  let right = 0;
  let questions = 0;
  // The next idea check: the earliest idea below `below` not asked yet whose unit still has a sentence with it to ask.
  const ideaCheck = (below) => {
    const left = [...taught].filter(([id, n]) => n < below && !covered.has(id) && units[n - 1].sentences.some((one) => !asked.has(one.item.id) && (one.item.concepts ?? []).includes(id)));
    left.sort((a, b) => a[1] - b[1]);
    return left.length ? { n: left[0][1], idea: left[0][0] } : null;
  };
  const search = makeSearch({ count, landing, ideaCheck });
  // A sentence of unit n to ask this way: an idea check's own idea first, then the most ideas not asked yet (the unit's own count three).
  const sentenceStep = (n, kind, idea) => {
    const unit = units[n - 1];
    const left = shuffled(unit.sentences.filter((one) => !asked.has(one.item.id) && (kind !== "arrange" || one.item.words.length > 1)), random);
    if (!left.length) return null;
    const gain = (one) =>
      (one.item.concepts ?? []).reduce((a, id) => a + (id === idea ? 100 : !taught.has(id) || covered.has(id) ? 0 : taught.get(id) === n ? 3 : taught.get(id) < n ? 1 : 0), 0);
    let best = left[0];
    for (const one of left) if (gain(one) > gain(best)) best = one;
    asked.add(best.item.id);
    const step = kind === "translate" ? translateStep(best.item, unit.sentences.map((one) => one.item), unit.words) : { kind: "arrange", mode: "dutch", skill: "read", item: best.item };
    return { ...step, placement: { unit: n } };
  };
  // The question the search wants, as a step: in its unit, or (that unit asked out) the nearest unit that has one, its stand-ins drawn with it.
  const stepFor = ({ n, kind, idea }) => {
    for (let d = 0; d < count; d++) {
      for (const at of d ? [n - d, n + d] : [n]) {
        if (at < 1 || at > count) continue;
        const step = kind === "word" ? (unitSteps(units[at - 1], ["word"], random, asked)[0] ?? null) : (sentenceStep(at, kind, idea) ?? unitSteps(units[at - 1], ["word"], random, asked)[0] ?? null);
        if (!step) continue;
        askedNow.push(step.item?.id ?? step.target);
        for (const id of step.item?.concepts ?? []) covered.add(id);
        // A sentence's stand-ins (instead, below), drawn with it: a shorter sentence asked the same way (shortStep), and under that, a word of the
        // same unit by itself, its drawing fetched with the step's (a step waiting for its drawing leaves the one before it showing).
        if (step.kind !== "word") {
          const short = shortStep(units[at - 1], step.kind, random, asked);
          const word = unitSteps(units[at - 1], ["word"], random, asked)[0] ?? null;
          if (short) short.spare = word;
          step.spare = short ?? word;
        }
        return step;
      }
    }
    return null;
  };
  const nextSteps = () => {
    const want = search.next();
    if (!want) return [];
    const step = stepFor(want);
    if (step) return [step];
    search.end();
    return [];
  };
  const self = {
    units,
    landing,
    search,
    steps: count ? nextSteps() : [],
    get done() {
      return search.done;
    },
    answered(step, wasRight) {
      const n = step.placement?.unit;
      if (!n || search.done) return [];
      questions++;
      if (wasRight) right++;
      else if (step.kind === "word" && step.target) missedWords.push([n, step.target]);
      else for (const id of step.item?.concepts ?? []) if (taught.get(id) === n) missedIdeas.push([n, `p:${id}`]);
      search.answered(n, step.kind === "word" ? "word" : step.kind, wasRight, guessChance(step));
      return nextSteps();
    },
    progress() {
      return { settled: search.asked.length, most: search.most() };
    },
    result() {
      return resultOf(search.placed());
    },
    stopNow() {
      // Stopped partway: placed only as far as its answers so far are sure of.
      return resultOf(search.stopped());
    },
    // A question of tiles too tall for this screen at its tightest (session.js askAnotherWay): its stand-in instead, a shorter sentence asked
    // the same way, or (that too tall as well) a word of the same unit by itself, which always fits. null when the unit had none left.
    instead(step) {
      const other = step.spare ?? null;
      if (other) askedNow.push(other.item?.id ?? other.target);
      return other;
    },
  };
  function resultOf(n) {
    const tried = [...new Set(search.asked.map((a) => a.n))].sort((a, b) => a - b);
    return {
      placed: n,
      count,
      units,
      unit: units[n - 1] ?? null,
      everything: n > count,
      shown: tried.filter((one) => one < n),
      tried: tried.length,
      right,
      questions,
      missed: [...missedWords, ...missedIdeas].filter(([unit]) => unit < n).map(([, what]) => what),
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
/**
 * A placement's seeds: [[unit, stability in days]] for what the units before `placed` teach (words and phrases, and each lesson's idea), but
 * what's in `missed` (words, and ideas as "p:<pattern>"), the unit next to `placed` first (PLACED). The same units and order for the same path.
 */
export function placedSeeds(units, placed, missed = []) {
  const skip = new Set(missed);
  const order = [];
  const have = new Set();
  const add = (unit) => {
    if (!unit || have.has(unit)) return;
    have.add(unit);
    order.push(unit);
  };
  for (let n = Math.min(placed, units.length + 1) - 1; n >= 1; n--) {
    for (const lesson of units[n - 1].lessons) {
      if (lesson.full) continue;
      for (const thing of lesson.things ?? []) if (!thing.formOnly && !skip.has(thing.lemma ?? thing.phrase)) add(thing.unit);
      if (lesson.concept?.pattern && !skip.has(`p:${lesson.concept.pattern}`)) add(`p:${lesson.concept.pattern}`);
    }
  }
  return order.map((unit, k) => [unit, PLACED.firstDay + Math.floor(k / PLACED.aDay)]);
}

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
    seeds: placedSeeds(result.units, result.placed, result.missed),
    // Read in this script (study/script.js): its seeds are read strengths there alone, as answers read in it are.
    script: scriptOf(lang),
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
