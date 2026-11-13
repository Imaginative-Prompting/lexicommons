// The scheduler: how well you know each unit, and when it's next worth testing. FSRS (the scheduler Anki uses, through
// ts-fsrs) keeps one memory per unit and strength (read · hear · say), replayed from that unit's graded evidence in time
// order. The evidence stays the truth and this is derived from it, so the model can change without losing anything.
// Pure: progress.js hands it each unit's reviews and keeps the results.
//
// The rules (docs/design/learning-strategy.md §2 and §4, in the planning folder):
//   - A review is a row gradeOf() grades (progress.js); exposure and pronunciation never get here.
//   - Reviews of one unit and strength at the same moment (one answer) count once, at the worst grade.
//   - Saying it right also counts for reading it, and for hearing it when it was spoken; a miss at reading it is also a
//     miss at saying it, once saying it has started. Nothing else carries over.
//   - Several tests in one day use FSRS's short-term mode: a success later the same day adds no strength, a miss takes
//     some away. Sessions plan their own same-day retries, so there are no learning steps and a strength is next due a
//     whole number of days after its last review.
//   - An idea (a pattern) is scheduled on its rate, not on each answer: the answers between its reviews are pooled, and
//     the first once it's due counts one review, graded by the pool's share right (nextMemory, below).
//   - Each kind of unit (words, patterns, phrases) has its own forgetting curve (FSRS parameters): the defaults until
//     there are enough of your reviews to fit them.

import { computeDecayFactor, createEmptyCard, fsrs, Rating } from "../../vendor/ts-fsrs/index.mjs";

export const SKILLS = ["read", "hear", "say"];
export const KINDS = { w: "word", p: "pattern", c: "phrase", k: "card" };
/** A strength is known when its predicted recall is at least this and it would last a day (stability ≥ 1 day). */
export const KNOWN_AT = 0.8;
/** Misses on different days, after it was learned, that make a strength a leech. */
export const LEECH_LAPSES = 8;
/** Strength levels (0–4, the meters) by stability in days: 1 under 2, 2 under 10, 3 under 40, 4 from 40. */
export const LEVEL_DAYS = [2, 10, 40];

const DAY = 86_400_000;
const RATING = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good };
const WORST = { again: 0, hard: 1, good: 2 };

/** A unit's kind: "w" · "p" · "c" · "k" (a pack's plain card, study/deck.js), or null for anything else. */
export const kindOf = (unit) => (/^[wpck]:/.test(unit) ? unit[0] : null);

// Fitted parameters per kind (null: FSRS's defaults). Only the weights change; everything else is the rules above.
const weights = { w: null, p: null, c: null, k: null };
const engines = new Map();

function engine(kind, target = 0.9) {
  const key = `${kind}:${target}`;
  if (!engines.has(key)) {
    const params = { request_retention: target, maximum_interval: 36500, enable_fuzz: false, enable_short_term: true, learning_steps: [], relearning_steps: [] };
    if (weights[kind]) params.w = weights[kind];
    engines.set(key, fsrs(params));
  }
  return engines.get(key);
}

/** Uses fitted weights for one kind of unit (null: back to the defaults). */
export function setWeights(kind, w) {
  if (!(kind in weights)) throw new Error(`No unit kind "${kind}".`);
  weights[kind] = w ? [...w] : null;
  for (const key of [...engines.keys()]) if (key.startsWith(`${kind}:`)) engines.delete(key);
}

/**
 * The forgetting curves in use, and how an idea's answers are pooled, as text: what anything kept from them (know/word-index.js) was worked
 * out by. Changing either changes it, so what was kept is worked out again.
 */
export const modelStamp = () =>
  `${KNOWN_AT} ${LEVEL_DAYS.join(",")} ${JSON.stringify(weights)} pooled ${POOLED_KINDS.join(",")} ${POOL_GOOD} ${POOL_HARD} ${SLIP_MISSES}/${SLIP_RUN} firm ${IDEA_FIRM.answers}/${IDEA_FIRM.days}`;

// ---------- ideas: scheduled on their rate ----------
// An idea (a pattern, kind p) is in most sentences, so it's answered many times between the days it's due. FSRS models a review when a unit
// comes due: every one of those answers moving the card held each idea at a few days however well it was known, and any stray miss reset it
// (6 Nov 2026: a sample learner a year in had verb second "Just started" at 5,787 of 6,102 right; 17 answers a day at 95% right held 2.4
// days, with 211 lapses). So an idea's answers between its reviews are pooled, and the first answer once it's due closes the pool as one
// review, graded by the pool's share right: POOL_GOOD or more good (Hard when it's one or two answers that were all Hard, a pick that may be
// a guess; three right of different sentences aren't), POOL_HARD or more hard, else again. A run of misses meanwhile (SLIP_MISSES of its
// last SLIP_RUN answers: at 85% right that's chance about once in 40 days of 17 answers, at half right within a few) counts a miss at once,
// so an idea you've stopped getting comes back without waiting. The day an idea is first answered (a UTC day, as lapses are counted) is
// its learning: every answer counts, as any unit's do, so a new idea missed 3 times of 7 in its lesson is weak and due tomorrow. A pool of
// one answer is that answer's grade, so an idea answered only when it's due is scheduled as any unit is. Due here is at FSRS's own target
// (0.9), whatever recall Settings → Remembering asks for.
export const POOLED_KINDS = ["p"];
// 85%: an idea is in most sentences, and a slip in one of them is often another thing's (a word, a form). At 90% an idea answered 127 times
// at 86% right over three weeks was graded hard at every review and stayed Getting there (7 Nov 2026, the sample learner's 3 weeks).
export const POOL_GOOD = 0.85;
export const POOL_HARD = 0.7;
export const SLIP_RUN = 10;
export const SLIP_MISSES = 6;
// An idea is never Strong or Solid on a handful of answers (7 Nov 2026). Answered only when it's due, a pool of one answer is that answer's
// grade, so two right answers two days apart gave an idea 11 days' stability: Strong on two answers, Solid on three. So an idea's level stays
// at Getting there (2) until it has IDEA_FIRM.answers graded answers on IDEA_FIRM.days different days (UTC days, as lapses are counted).
// Only its level waits: when it's due, and whether it's known, are FSRS's as before.
export const IDEA_FIRM = { answers: 15, days: 5 };

const poolGrade = ({ n, right, hard }) => {
  const rate = right / n;
  if (rate >= POOL_GOOD) return n < 3 && hard === right ? "hard" : "good";
  return rate >= POOL_HARD ? "hard" : "again";
};

// One review that moves the card: grade is what it counts as, answer the grade of the answer that brought it.
function counted(kind, memory, at, grade, answer) {
  const when = new Date(at);
  const card = engine(kind).next(memory?.card ?? createEmptyCard(when), when, RATING[grade]).card;
  // A lapse: a miss after it had been recalled at least once; one a day at most, as Anki counts them.
  // Use UTC days so replaying the same evidence in another time zone keeps the same lapse count.
  const day = Math.floor(at / DAY);
  const lapsed = grade === "again" && Boolean(memory?.recalled) && day !== memory.lastLapse;
  return {
    card,
    firstAt: memory?.firstAt ?? at,
    lastAt: at,
    lastGrade: answer,
    recalled: Boolean(memory?.recalled) || answer !== "again",
    lapseDays: (memory?.lapseDays ?? 0) + (lapsed ? 1 : 0),
    lastLapse: lapsed ? day : memory?.lastLapse,
    reviews: (memory?.reviews ?? 0) + 1,
    days: (memory?.days ?? 0) + (memory && memory.lastDay === day ? 0 : 1),
    lastDay: day,
    // Put down as known by a placement once: kept through the answers after it (a word's History shows it).
    ...(memory?.placed ? { placed: memory.placed } : {}),
  };
}

// One answer on a strength's memory: { memory, counted } (counted: the grade the card moved by, or null while an idea's pool holds it).
function step(kind, memory, at, grade) {
  const learning = !memory || Math.floor(at / DAY) === Math.floor(memory.firstAt / DAY);
  if (learning || !POOLED_KINDS.includes(kind)) return { memory: counted(kind, memory, at, grade, grade), counted: grade };
  const right = grade !== "again";
  const before = memory.pool ?? { n: 0, right: 0, hard: 0, run: [] };
  const pool = { n: before.n + 1, right: before.right + (right ? 1 : 0), hard: before.hard + (grade === "hard" ? 1 : 0), run: [...before.run, right].slice(-SLIP_RUN) };
  const slipping = pool.run.filter((r) => !r).length >= SLIP_MISSES;
  const due = at >= +memory.card.last_review + engine(kind).next_interval(memory.card.stability, 0) * DAY;
  if (slipping || due) {
    const as = slipping ? "again" : poolGrade(pool);
    return { memory: counted(kind, memory, at, as, grade), counted: as };
  }
  const day = Math.floor(at / DAY);
  const days = memory.days + (memory.lastDay === day ? 0 : 1);
  return { memory: { ...memory, lastAt: at, lastGrade: grade, recalled: memory.recalled || right, reviews: memory.reviews + 1, days, lastDay: day, pool }, counted: null };
}

/**
 * One answer on a strength's memory (none yet: its first), by the rules replay() uses: the memory after it. The sample learner
 * (study/sample-learner.js) studies by it, so what it's asked and gets right is what this scheduler would have asked.
 */
export const nextMemory = (kind, memory, at, grade) => step(kind, memory, at, grade).memory;

/** Predicted recall (0–1) of a memory at a moment (ms): FSRS's forgetting curve over the time since its last review. */
export function recallAt(kind, card, at) {
  const days = Math.max(0, (at - +card.last_review) / DAY);
  return engine(kind).forgetting_curve(days, card.stability);
}

/** When a strength is next due (ms), as strengthAt says it: its last review and the interval its stability gives at that target recall. */
export const dueAtOf = (kind, stability, lastReview, target = 0.9) => lastReview + engine(kind, target).next_interval(stability, 0) * DAY;

/**
 * The moment (ms) a strength stops being known, as strengthAt says it (recall at least KNOWN_AT, stability at least a day): known at every
 * whole millisecond before it, and at none from it on (recall only falls until the next review). 0: never known. Worked out once per review,
 * so whether it's known at any later moment is a comparison (know/word-index.js).
 */
export function knownUntil(kind, card) {
  if (!(card.stability >= 1)) return 0;
  const last = +card.last_review;
  const known = (at) => recallAt(kind, card, at) >= KNOWN_AT;
  if (!known(last)) return 0;
  // The curve turned around gives the moment within a hair (it rounds to 8 places); the curve itself then finds the millisecond.
  const { decay, factor } = computeDecayFactor(engine(kind).param.w);
  const guess = last + Math.round(((card.stability * (Math.pow(KNOWN_AT, 1 / decay) - 1)) / factor) * DAY);
  let lo = Math.max(last, guess - 2000); // known
  let hi = guess + 2000; // not
  if (!known(lo) || known(hi)) {
    lo = last;
    hi = last + DAY;
    while (known(hi)) {
      lo = hi;
      hi = last + (hi - last) * 2;
    }
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (known(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * A strength a placement put down as known (Find your level, study/placement.js): known at `stability` days from `at`, as if last
 * reviewed then, so its first review falls `stability` days on at FSRS's own target recall. It isn't an answer: it counts no review,
 * no day and no lapse (an idea's level still waits for its own answers: firmEnough), and `placed` says when, for the screens that tell it
 * apart (a word's History). A miss after it is a lapse, as a miss of anything you knew is.
 */
export function seededMemory(kind, at, stability, memory = null) {
  const when = new Date(at);
  const first = memory?.card ?? engine(kind).next(createEmptyCard(when), when, Rating.Good).card;
  const card = { ...first, stability, scheduled_days: Math.round(stability), due: new Date(at + Math.round(stability) * DAY), last_review: when };
  // Over answers before it (the placement's own right ones, a lesson's): their counts stay; it's known from the placement on.
  if (memory) return { ...memory, card, lastAt: at, placed: at };
  return { card, firstAt: at, lastAt: at, lastGrade: "placed", recalled: true, lapseDays: 0, reviews: 0, days: 0, lastDay: Math.floor(at / DAY), placed: at };
}

/**
 * Whether a placement's seed of `stability` takes on a strength as it stands: one never answered, or one whose last answer was right and
 * holds less (the placement's own right answers, or a lesson's, before it). One last missed keeps its miss: the placement doesn't hide it.
 */
export const seedTakes = (memory, stability) => !memory || (memory.lastGrade !== "again" && memory.card.stability < stability);

/**
 * One unit's memory, replayed from its reviews: [{ at, skill, grade, spoken }] in any order (skill read · hear · say,
 * grade again · hard · good; or "placed" with its stability: a placement's seed, applied where seedTakes says, never counted as a
 * review). Returns { kind, strengths, reviews }: strengths has a memory for each strength that has
 * been tested, { card, firstAt, lastAt, lastGrade, recalled, lapseDays, reviews, days, lastDay, pool } (days: how
 * many different UTC days it was answered on, the last of them lastDay); reviews is every review applied, in order, with p
 * (the predicted recall just before it, null for the first), carried (it came from another strength's answer) and counted (the grade the
 * card moved by: an idea's answer held in its pool has null).
 * after(at, strengths): called after each moment's answers are applied, with the strengths as they stand then (each a new object when it
 * changes, so one kept stays as it was).
 */
export function replay(unit, reviews, { after = null } = {}) {
  const kind = kindOf(unit) ?? "w";
  const strengths = {};
  const applied = [];
  const sorted = [...reviews].sort((a, b) => a.at - b.at);
  for (let i = 0; i < sorted.length; ) {
    const at = sorted[i].at;
    // One moment's answers: the worst grade per strength, and whether saying it was spoken.
    const direct = {};
    let spoken = false;
    for (; i < sorted.length && sorted[i].at === at; i++) {
      const { skill, grade } = sorted[i];
      // A placement's seed: the strength as placed, where nothing was answered before it (an answer is truer than a placement).
      if (grade === "placed" && SKILLS.includes(skill) && seedTakes(strengths[skill], sorted[i].stability)) strengths[skill] = seededMemory(kind, at, sorted[i].stability, strengths[skill]);
      if (!RATING[grade] || !SKILLS.includes(skill)) continue;
      if (!direct[skill] || WORST[grade] < WORST[direct[skill]]) direct[skill] = grade;
      if (skill === "say" && sorted[i].spoken) spoken = true;
    }
    const carried = {};
    if (direct.say && direct.say !== "again") {
      if (!direct.read) carried.read = direct.say;
      if (spoken && !direct.hear) carried.hear = direct.say;
    }
    if (direct.read === "again" && !direct.say && strengths.say) carried.say = "again";
    for (const [skill, grade, isCarried] of [...Object.entries(direct).map(([s, g]) => [s, g, false]), ...Object.entries(carried).map(([s, g]) => [s, g, true])]) {
      const memory = strengths[skill];
      const p = memory ? recallAt(kind, memory.card, at) : null;
      const next = step(kind, memory, at, grade);
      strengths[skill] = next.memory;
      applied.push({ at, skill, grade, p, carried: isCarried, counted: next.counted });
    }
    after?.(at, strengths);
  }
  return { kind, strengths, reviews: applied };
}

/** A strength's level (1–4) by its stability in days (LEVEL_DAYS) alone. What's shown is levelOfMemory's. */
export const levelOf = (stability) => (stability < LEVEL_DAYS[0] ? 1 : stability < LEVEL_DAYS[1] ? 2 : stability < LEVEL_DAYS[2] ? 3 : 4);

/** Whether a strength has had the answers its level needs: an idea's IDEA_FIRM (answers on different days), any other kind's always. */
export const firmEnough = (kind, memory) => !POOLED_KINDS.includes(kind) || (memory.reviews >= IDEA_FIRM.answers && memory.days >= IDEA_FIRM.days);

/** A strength's level (1–4), as every screen shows it: its stability's (levelOf), an idea's held at Getting there (2) until firmEnough. */
export const levelOfMemory = (kind, memory) => {
  const level = levelOf(memory.card.stability);
  return level > 2 && !firmEnough(kind, memory) ? 2 : level;
};

/**
 * A strength at a moment: { recall, stability, difficulty, level 1–4, known, due, dueAt, firstAt, lastAt, reviews,
 * lapses, leech }. target: the predicted recall it's due at (its interval rounds to whole days, at least one).
 */
export function strengthAt(kind, memory, now, target = 0.9) {
  const { card } = memory;
  const recall = recallAt(kind, card, now);
  const days = engine(kind, target).next_interval(card.stability, 0);
  const dueAt = +card.last_review + days * DAY;
  return {
    recall,
    stability: card.stability,
    difficulty: card.difficulty,
    level: levelOfMemory(kind, memory),
    known: recall >= KNOWN_AT && card.stability >= 1,
    due: dueAt <= now,
    dueAt,
    firstAt: memory.firstAt,
    lastAt: memory.lastAt,
    reviews: memory.reviews,
    lapses: memory.lapseDays,
    leech: memory.lapseDays >= LEECH_LAPSES,
  };
}

/**
 * How well the predictions held: every review that had one and came from your own answer (carried ones aside).
 * { n, logLoss, brier, predicted, actual, bins: [{ from, to, n, predicted, actual }] } (bins of 10 points of recall).
 */
export function calibration(reviews) {
  const scored = reviews.filter((r) => r.p != null && !r.carried);
  const bins = Array.from({ length: 10 }, (_, i) => ({ from: i / 10, to: (i + 1) / 10, n: 0, predicted: 0, actual: 0 }));
  let logLoss = 0;
  let brier = 0;
  let predicted = 0;
  let actual = 0;
  for (const { p, grade } of scored) {
    const y = grade === "again" ? 0 : 1;
    const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
    logLoss -= y * Math.log(q) + (1 - y) * Math.log(1 - q);
    brier += (p - y) ** 2;
    predicted += p;
    actual += y;
    const bin = bins[Math.min(9, Math.floor(p * 10))];
    bin.n++;
    bin.predicted += p;
    bin.actual += y;
  }
  const n = scored.length;
  for (const bin of bins) if (bin.n) (bin.predicted /= bin.n), (bin.actual /= bin.n);
  return { n, logLoss: n ? logLoss / n : null, brier: n ? brier / n : null, predicted: n ? predicted / n : null, actual: n ? actual / n : null, bins };
}
