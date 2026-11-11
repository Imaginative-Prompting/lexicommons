// A made-up learner for the sample learner (study/sample-mode.js): weeks or months of studying as a real learner leaves them, made from
// the path's real lessons and the packs' real sentences, so every word, idea and sentence a screen shows opens. Pure and seeded: the same
// preset on the same day gives the same learner. Nothing here reads the device: study/sample-start.js hands it the course (courseOf) and
// puts what it makes in the sample's own stores.
//
// How it studies, day by day up to yesterday (today is left to do):
//   - most days, with quiet weekends, a run of days to finish on, and (from four months) a week away;
//   - lessons in the path's order, as many new words a day as the preset's pace, now and then one of the worked-out lessons passed by;
//   - Practice on what's due, the most overdue first, in sessions of 8 to 30 answers, and on some days a quick round of games;
//   - answers in the games' own kinds: sentences built and filled, words picked and matched, some by ear, some said aloud or typed;
//   - from four months, reading pages in a book (patterns read with help, words met, now and then one looked up), and conversations;
//   - what it's asked and whether it gets it right come from the app's own scheduler (scheduler.js, FSRS): each strength of each word,
//     phrase and idea is a card, an answer is right about as often as the card predicts recall then, and Practice takes what the card says
//     is due. So a week away brings misses, and what's left due at the end is slipping;
//   - the done log the streak counts holds every lesson, practice, session, five minutes of reading and conversation, on its own day.

import { addDays, dayKey } from "../know/streak.js";
import { kindOf, nextMemory, recallAt, strengthAt } from "./scheduler.js";

const DAY = 86_400_000;
const MINUTE = 60_000;

/**
 * The presets: how long it's been, how many words it set out to learn (it knows somewhat fewer: some slip), how many days in a hundred
 * it studies on a weekday and at a weekend, its run up to yesterday, its breaks ({ ago, days, paused }), reading and conversations.
 */
export const SAMPLE_PRESETS = [
  { id: "weeks", name: "3 weeks in", about: "About 150 words", days: 21, introduce: 120, weekday: 0.9, weekend: 0.7, run: 6, breaks: [], reading: 0, talk: 0 },
  { id: "months", name: "4 months in", about: "About 900 words", days: 122, introduce: 825, weekday: 0.88, weekend: 0.66, run: 23, breaks: [{ ago: 61, days: 8, paused: false }], reading: 0.18, talk: 0.05 },
  { id: "year", name: "A year in", about: "About 2,500 words, and ideas met", days: 365, introduce: 2370, weekday: 0.86, weekend: 0.64, run: 41, breaks: [{ ago: 214, days: 9, paused: true }, { ago: 97, days: 5, paused: false }], reading: 0.3, talk: 0.07 },
];
export const presetById = (id) => SAMPLE_PRESETS.find((preset) => preset.id === id) ?? null;

/**
 * The course a learner is made from, as plain data, from the app's own (shared by the device and the tests):
 *   lessons   pathLessons() in order: [{ id, full, worked, idea, units, items }] (units: what it teaches, its words and phrases; idea: its pattern's unit)
 *   items     the sentences: [{ id, units (its patterns and phrase: sentenceUnits), words (its word units), target (the word it was written for) }]
 */
export function courseOf({ lang, lessons, items, sentenceUnits, conceptsOf, targetOf }) {
  return {
    lang,
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      full: Boolean(lesson.full),
      worked: Boolean(lesson.worked),
      idea: lesson.concept?.pattern ? `p:${lesson.concept.pattern}` : null,
      units: (lesson.things ?? []).filter((thing) => !thing.formOnly).map((thing) => thing.unit),
      items: [...(lesson.items ?? [])],
    })),
    items: items.map((item) => ({ id: item.id, units: sentenceUnits(item), words: conceptsOf(item).filter((unit) => unit.startsWith("w:")), target: targetOf(item) })),
  };
}

// ---------- chance, seeded ----------

function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** mulberry32: the same seed, the same numbers. */
function seeded(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (lo, hi) => lo + (hi - lo) * next();
  const whole = (lo, hi) => Math.floor(between(lo, hi + 1));
  const pick = (list) => list[Math.floor(next() * list.length)];
  const hex = (n) => Array.from({ length: n }, () => Math.floor(next() * 16).toString(16)).join("");
  const weighted = (table) => {
    let r = next() * table.reduce((sum, [, w]) => sum + w, 0);
    for (const [value, w] of table) if ((r -= w) < 0) return value;
    return table.at(-1)[0];
  };
  return { next, between, whole, pick, hex, weighted };
}

// ---------- the games an answer comes from ----------

// What each kind of answer is (progress.js TESTS): its test and the strength it trains, how much easier or harder it is to get right, and
// what it grades: the sentence's patterns and phrase, the word it's about, or both.
const GAMES = {
  arrange: { test: "build", skill: "read", ease: 0.02, grades: "sentence" },
  fill: { test: "pick", skill: "read", ease: 0.06, grades: "both" },
  translate: { test: "build", skill: "read", ease: 0, grades: "both" },
  meaning: { test: "pick", skill: "read", ease: 0.05, grades: "word" },
  choose: { test: "pick", skill: "read", ease: 0.05, grades: "sentence" },
  "listen-meaning": { test: "pick", skill: "hear", ease: -0.02, grades: "sentence" },
  "listen-order": { test: "build", skill: "hear", ease: -0.05, grades: "sentence" },
  "type-heard": { test: "recall", skill: "hear", ease: -0.08, grades: "both" },
  type: { test: "recall", skill: "say", ease: -0.07, grades: "both" },
  say: { test: "recall", skill: "say", ease: -0.06, grades: "both", how: "spoken" },
};
// Which game a sentence is played in: mostly read, some by ear, some said or typed.
// A word known this solidly (a read card lasting this many days) isn't written down as met in a sentence.
const SOLID = 21;
// A word picked alone (Match, by its picture or meaning).
const PICKED = { test: "pick", skill: "read", ease: 0.05 };
const SENTENCE_GAMES = [["arrange", 26], ["fill", 24], ["translate", 13], ["meaning", 11], ["choose", 9], ["listen-meaning", 5], ["listen-order", 4], ["type-heard", 2], ["type", 3], ["say", 3]];

// ---------- the learner ----------

/**
 * Makes a learner: { preset, lang, now, evidence (progress.js rows, oldest first), done ({ things, pauses }: done.js's log), since (when its
 * log began), counts }. now: the moment it's made for (its last day studied is the day before).
 */
export function sampleLearner(presetId, course, { now = Date.now() } = {}) {
  const preset = presetById(presetId);
  if (!preset) throw new Error(`No sample learner "${presetId}".`);
  const lang = course.lang;
  const rng = seeded(hash32(`lexicommons-sample:${preset.id}`));
  const items = new Map(course.items.map((item) => [item.id, item]));
  // The sentences written for each word (the word packs'), then the lessons' sentences each word is in.
  const forWord = new Map();
  const withUnit = new Map();
  for (const item of course.items) {
    if (item.target) (forWord.get(`w:${item.target}`) ?? forWord.set(`w:${item.target}`, []).get(`w:${item.target}`)).push(item);
    for (const unit of [...item.units, ...item.words]) (withUnit.get(unit) ?? withUnit.set(unit, []).get(unit)).push(item);
  }

  const evidence = [];
  const things = {};
  const pauses = {};
  const memory = new Map(); // unit → { k (how easily it sticks), cards: { read, hear, say }, due: { read, hear, say } (when each is due), graded }
  const introduced = new Set(); // units taught so far
  const played = new Set(); // sentences answered so far

  // ----- the days -----
  const today = dayKey(now);
  const dayStart = (ago) => {
    const [y, m, d] = addDays(today, -ago).split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  const away = new Set();
  for (const b of preset.breaks) for (let i = 0; i < b.days; i++) away.add(b.ago - i);
  const studied = [];
  for (let ago = preset.days; ago >= 1; ago--) {
    const weekend = [0, 6].includes(new Date(dayStart(ago)).getDay());
    const on = ago === preset.days || ago <= preset.run || (!away.has(ago) && rng.next() < (weekend ? preset.weekend : preset.weekday));
    if (on && !away.has(ago)) studied.push(ago);
  }
  for (const b of preset.breaks) {
    if (!b.paused) continue;
    const id = rng.hex(16);
    const from = addDays(today, -b.ago);
    pauses[id] = { at: dayStart(b.ago + 2) + 20 * 3_600_000, from, to: addDays(from, b.days - 1) };
  }

  // ----- what it remembers: a memory per strength, as the scheduler keeps them (an idea's pool too), and its card -----
  const stateOf = (unit) => {
    let m = memory.get(unit);
    if (!m) memory.set(unit, (m = { k: rng.between(-0.08, 0.06), memories: {}, cards: {}, due: {}, asked: {}, graded: 0 }));
    return m;
  };
  // A grade as progress.js gradeOf gives it.
  const gradeOf = (outcome, test, help, marked) =>
    outcome === "wrong" ? (test === "free" && marked === false ? "hard" : "again") : help === "answer" ? "again" : help === "nudge" || ["pick", "self", "judged"].includes(test) ? "hard" : "good";
  const review = (unit, skill, at, grade) => {
    const m = stateOf(unit);
    const kind = kindOf(unit);
    m.memories[skill] = nextMemory(kind, m.memories[skill] ?? null, at, grade);
    m.cards[skill] = m.memories[skill].card;
    m.due[skill] = strengthAt(kind, m.memories[skill], at).dueAt;
  };
  /**
   * An answer on `unit` at `at` in a game ({ test, skill, ease, how }): right about as often as its card predicts recall now (a first test,
   * just after meeting it, mostly right), then its card moves as the scheduler's would, with what an answer carries to the other strengths.
   */
  const answer = (unit, at, { test, skill, ease = 0, how, help = "none" }, marked) => {
    const m = stateOf(unit);
    const card = m.cards[skill];
    const recall = card ? recallAt(kindOf(unit), card, at) : 0.86;
    const outcome = rng.next() < Math.min(0.985, Math.max(0.05, recall + ease + m.k)) ? "right" : "wrong";
    const grade = gradeOf(outcome, test, help, marked);
    review(unit, skill, at, grade);
    // Saying it right counts for reading it, and spoken, for hearing it; reading it wrong is a miss for saying it (scheduler.js replay).
    if (skill === "say" && grade !== "again") {
      review(unit, "read", at, grade);
      if (how === "spoken") review(unit, "hear", at, grade);
    }
    if (skill === "read" && grade === "again" && m.cards.say) review(unit, "say", at, "again");
    m.graded++;
    m.asked[skill] = at;
    return outcome;
  };

  // ----- writing it down -----
  let clock = 0;
  const rows = (at, list) => {
    const start = rng.hex(12);
    list.forEach((row, i) => evidence.push({ at, v: 2, help: "none", lang, ...row, uid: `${start}${i.toString(16).padStart(4, "0")}` }));
  };
  const finished = (kind, id, at) => {
    const key = `${kind}:${id}`;
    if (!things[key]) things[key] = { at, day: dayKey(at) };
  };
  const tick = (lo, hi) => (clock += Math.round(rng.between(lo, hi) * 1000));

  /** One answer on a sentence: its patterns and phrase graded (or met), the word it's about graded, its other words met. */
  function playSentence(item, { focus = null, game = rng.weighted(SENTENCE_GAMES), activity = null } = {}) {
    // A game that grades only a word is played for a word.
    if (GAMES[game].grades === "word" && !focus?.startsWith("w:")) game = "arrange";
    const g = GAMES[game];
    const at = tick(7, 24);
    const out = [];
    const base = { test: g.test, skill: g.skill, activity: activity ?? game, item: item.id, ...(g.how ? { how: g.how } : {}) };
    const wordGraded = (g.grades === "word" || g.grades === "both") && focus?.startsWith("w:") ? focus : g.grades === "both" && item.target ? `w:${item.target}` : null;
    if (g.grades !== "word") for (const unit of item.units) out.push({ ...base, concept: unit, outcome: answer(unit, at, g) });
    else for (const unit of item.units) out.push({ ...base, concept: unit, outcome: "met" });
    for (const unit of item.words) {
      if (unit === wordGraded) out.push({ ...base, concept: unit, outcome: answer(unit, at, g) });
      // The sentence's other words met. (Not a word it has known for weeks: that row moves nothing, and leaving it out keeps a year's
      // learner to a size a phone writes in seconds.)
      else if (!(memory.get(unit)?.cards.read?.stability >= SOLID)) out.push({ ...base, concept: unit, outcome: "met" });
    }
    // A wrong answer blaming no unit is still a wrong answer (session.js marks it a slip).
    rows(at, out);
    played.add(item.id);
    for (const unit of item.units) introduced.add(unit);
    return out;
  }
  /** A round of Match: five words and their meanings. */
  function playMatch(units) {
    const at = tick(20, 45);
    rows(at, units.map((unit) => ({ concept: unit, outcome: answer(unit, at, PICKED), test: "pick", skill: "read", activity: "match" })));
  }
  /** A word picked by its picture or meaning, alone. */
  function playWord(unit, activity = rng.next() < 0.5 ? "see" : "word") {
    const at = tick(5, 14);
    rows(at, [{ concept: unit, outcome: answer(unit, at, PICKED), test: "pick", skill: "read", activity }]);
  }
  /** Meeting something new: Meet's card (exposure, not a test). */
  function meet(unit, item = null) {
    const at = tick(6, 16);
    rows(at, [{ concept: unit, outcome: "met", test: "self", skill: "read", activity: "meet", ...(item ? { item: item.id } : {}) }]);
    introduced.add(unit);
  }

  /** A sentence to practice a unit on: the one written for it, or one of the lessons' it's in that it has played, the most familiar first. */
  function sentenceFor(unit) {
    const own = forWord.get(unit) ?? [];
    const pool = own.length ? own : (withUnit.get(unit) ?? []).filter((item) => played.has(item.id) || unit.startsWith("p:"));
    if (!pool.length) return null;
    // Of a few, the one whose words it knows best (new-words.js reads a sentence the same way).
    let best = null;
    let bestScore = -1;
    for (let n = 0; n < Math.min(4, pool.length); n++) {
      const item = pool[Math.floor(rng.next() * pool.length)];
      const score = item.words.filter((w) => introduced.has(w)).length / Math.max(1, item.words.length) + (played.has(item.id) ? 0 : 0.15);
      if (score > bestScore) [best, bestScore] = [item, score];
    }
    return best;
  }

  // ----- a lesson -----
  let next = 0; // the next lesson on the path
  const lessonsDone = [];
  function doLesson(lesson) {
    const news = lesson.units.filter((unit) => !introduced.has(unit));
    for (const unit of news) meet(unit);
    if (lesson.idea && !introduced.has(lesson.idea)) meet(lesson.idea, items.get(lesson.items[0]) ?? null);
    // Its words picked once each, then its sentences, or for a lesson worked out from the packs, a sentence written for each word.
    for (const unit of news) if (unit.startsWith("w:") && rng.next() < 0.7) playWord(unit);
    const sentences = lesson.items.length ? lesson.items.map((id) => items.get(id)).filter(Boolean) : news.map((unit) => sentenceFor(unit)).filter(Boolean);
    const asked = lesson.full ? sentences.filter(() => rng.next() < 0.6).slice(0, 14) : sentences.slice(0, 12);
    for (const item of asked) {
      const focus = item.target && news.includes(`w:${item.target}`) ? `w:${item.target}` : news.find((unit) => item.words.includes(unit)) ?? null;
      playSentence(item, { focus });
      // A miss comes back at the end, as a lesson asks it again.
      if (evidence.at(-1)?.outcome === "wrong" && rng.next() < 0.8) playSentence(item, { focus, game: "arrange" });
    }
    // Every new word has been asked once by the lesson's end.
    for (const unit of news) if (unit.startsWith("w:") && !memory.get(unit)?.graded) playWord(unit);
    for (const unit of news) introduced.add(unit);
    tick(20, 60);
    finished("lesson", encodeURIComponent(lesson.id), clock);
    lessonsDone.push(lesson.id);
  }

  // ----- practice -----
  // What's due now, each strength of each unit, the most overdue first: [unit, skill, due at].
  const due = (at) => {
    const out = [];
    for (const [unit, m] of memory) for (const [skill, when] of Object.entries(m.due)) if (when <= at) out.push([unit, skill, when]);
    return out.sort((a, b) => a[2] - b[2]);
  };
  // A game for a strength that's due: by ear for hearing, said or typed for saying, else read; for a word, one that grades the word (in
  // Arrange or Choose a sentence's words are only met).
  const gameFor = (unit, skill) => {
    const word = unit.startsWith("w:");
    if (skill === "hear") return word ? "type-heard" : rng.weighted([["listen-meaning", 4], ["listen-order", 4], ["type-heard", 1]]);
    if (skill === "say") return rng.weighted([["say", 5], ["type", 4]]);
    // A word: mostly put into English and back, else filled in or picked by its meaning.
    return word ? rng.weighted([["translate", 5], ["fill", 3], ["meaning", 2]]) : rng.weighted(SENTENCE_GAMES.filter(([game]) => GAMES[game].skill === "read"));
  };
  function doPractice(size, kind) {
    const began = clock;
    const queue = due(clock).slice(0, size).map(([unit, skill]) => ({ unit, skill }));
    // A practice with little due yet goes over what was learned last.
    if (queue.length < size / 2) for (const unit of [...memory.keys()].slice(-size)) if (queue.length < size && !queue.some((q) => q.unit === unit)) queue.push({ unit, skill: "read" });
    while (queue.length) {
      const { unit, skill } = queue.shift();
      // A strength answered already in this practice (a sentence asks several things at once) isn't asked again.
      if (memory.get(unit)?.asked[skill] > began) continue;
      if (unit.startsWith("w:") && skill === "read" && rng.next() < 0.14) {
        const more = queue.filter((q) => q.unit.startsWith("w:") && q.skill === "read").slice(0, 4);
        if (more.length === 4) {
          for (const q of more) queue.splice(queue.indexOf(q), 1);
          playMatch([unit, ...more.map((q) => q.unit)]);
          continue;
        }
      }
      if (unit.startsWith("w:") && skill === "read" && rng.next() < 0.08) {
        playWord(unit);
        continue;
      }
      const item = sentenceFor(unit);
      if (item) playSentence(item, { focus: unit, game: gameFor(unit, skill) });
      else if (unit.startsWith("w:")) playWord(unit);
    }
    tick(15, 40);
    finished(kind, rng.hex(16), clock);
  }

  // ----- reading and talking -----
  const book = `sample-${rng.hex(6)}`;
  const readMoments = new Map(); // a day → its pages' moments, every reading that day
  const version = rng.hex(16);
  let sentenceAt = 0;
  function doReading(minutes, ago) {
    const start = clock;
    const end = start + minutes * MINUTE;
    const known = [...introduced].filter((unit) => unit.startsWith("p:"));
    const vocabulary = [...introduced].filter((unit) => unit.startsWith("w:"));
    if (!known.length || vocabulary.length < 30) return;
    const moments = [];
    while (clock < end) {
      const at = tick(40, 95);
      moments.push(at);
      const page = [];
      for (let s = 0; s < rng.whole(3, 6); s++) {
        sentenceAt++;
        const item = `${book}@${version}#${sentenceAt}`;
        for (let n = 0; n < rng.whole(1, 2); n++) {
          // A sentence read with its patterns' help: right, with a nudge (a hard grade).
          const unit = rng.pick(known);
          review(unit, "read", clock, "hard");
          page.push({ concept: unit, outcome: "right", help: "nudge", test: "recall", skill: "read", activity: "reader", item });
        }
        for (let n = 0; n < rng.whole(3, 7); n++) {
          const unit = rng.pick(vocabulary);
          if (!(memory.get(unit)?.cards.read?.stability >= SOLID)) page.push({ concept: unit, outcome: "met", test: "recall", skill: "read", activity: "reader", item });
        }
        // A word looked up: you didn't know it there.
        if (rng.next() < 0.18) {
          const unit = rng.pick(vocabulary);
          review(unit, "read", clock, "again");
          page.push({ concept: unit, outcome: "wrong", test: "recall", skill: "read", activity: "reader", item });
        }
      }
      rows(at, page);
    }
    // Five minutes of reading is a finished thing, by the gaps between the day's pages, each up to 3 minutes (done.js counts them the same
    // way, over all of a day's reading).
    const day = dayKey(dayStart(ago) + 12 * 3_600_000);
    const all = [...(readMoments.get(day) ?? []), ...moments];
    readMoments.set(day, all);
    let ms = 0;
    for (let i = 1; i < all.length; i++) ms += Math.min(3 * MINUTE, all[i] - all[i - 1]);
    for (let n = 1; n <= Math.floor(ms / (5 * MINUTE)); n++) finished("read", `${day}#${n}`, all.at(-1));
  }
  function doTalk() {
    const known = [...introduced].filter((unit) => memory.get(unit)?.graded);
    if (known.length < 40) return;
    const practice = rng.hex(16);
    const turns = rng.whole(4, 9);
    const at = [];
    for (let t = 0; t < turns; t++) {
      const when = tick(35, 110);
      at.push(when);
      const how = rng.next() < 0.7 ? "spoken" : "typed";
      const graded = [];
      for (let n = 0; n < rng.whole(1, 3); n++) {
        const unit = rng.pick(known);
        const marked = rng.next() < 0.6;
        const outcome = answer(unit, when, { test: "free", skill: "say", ease: -0.03, how }, marked);
        graded.push({ concept: unit, outcome, test: "free", skill: "say", how, activity: "practice:conversation", source: "ai", practice, item: `practice:${practice}:${t * 2 + 1}`, ...(outcome === "wrong" ? { marked } : {}) });
      }
      rows(when, graded);
    }
    if (at.length >= 3) finished("talk", practice, at[2]);
  }

  // ----- every day -----
  const studyDays = studied.length;
  let introducedWords = 0;
  studied.forEach((ago, n) => {
    const start = dayStart(ago);
    // A day's practice has an end (about 160 answers at most, an hour and more): a backlog clears over days.
    let practiced = 0;
    const weekend = [0, 6].includes(new Date(start).getDay());
    // When: a morning, a lunch or an evening; now and then two.
    const slots = rng.weighted([[["evening"], 46], [["morning"], 24], [["lunch"], 14], [["morning", "evening"], 10], [["lunch", "evening"], 6]]);
    // How many new words today: what's left of the preset's over the days left, more or less.
    const left = preset.introduce - introducedWords;
    const daysLeft = studyDays - n;
    let quota = daysLeft > 0 ? Math.max(0, Math.round((left / daysLeft) * rng.between(0.4, 1.7))) : 0;
    if (n > 0 && rng.next() < (weekend ? 0.3 : 0.16)) quota = 0; // a day for going over what's there
    slots.forEach((slot, s) => {
      const [h0, h1] = { morning: [7, 9], lunch: [12, 13.5], evening: [19, 22.5] }[slot];
      clock = start + Math.round(rng.between(h0, h1) * 3_600_000);
      if (s === 0) {
        // The day's new words: the path's next lessons until the quota's met.
        let taught = 0;
        while (taught < quota && next < course.lessons.length) {
          const lesson = course.lessons[next++];
          if (lesson.worked && rng.next() < 0.04) continue; // passed by, for now
          const fresh = lesson.units.filter((unit) => unit.startsWith("w:") && !introduced.has(unit)).length;
          doLesson(lesson);
          taught += fresh;
          introducedWords += fresh;
        }
      }
      // Practice on what's due; some days a quick round of games as well, or instead.
      const quick = rng.next() < 0.18;
      // Practice as big as what's due, more or less (8 at least, 80 at most): a learner who keeps up, with days that fall behind; a day
      // with a lot due most often has a second one.
      // Over its closing run of days it keeps up: everything due, in as many practices as it takes.
      const keepingUp = ago <= preset.run;
      if (!quick || rng.next() < 0.5 || keepingUp) {
        const first = Math.round(Math.min(80, 160 - practiced, Math.max(8, due(clock).length * (keepingUp ? 1.2 : rng.between(0.8, 1.1)))));
        doPractice(first, "practice");
        practiced += first;
        for (let more = 0; more < (keepingUp ? 3 : 1); more++) {
          const left = due(clock).length;
          if (left <= (keepingUp ? 3 : 20) || practiced >= 150 || (!keepingUp && rng.next() > 0.8)) break;
          tick(600, 5400);
          const size = Math.round(Math.min(80, 160 - practiced, Math.max(12, left * (keepingUp ? 1.2 : rng.between(0.75, 1.05)))));
          doPractice(size, "practice");
          practiced += size;
        }
      }
      if (quick) doPractice(6, "session");
      if (preset.reading && rng.next() < preset.reading) doReading(rng.whole(6, 26), ago);
      if (preset.talk && rng.next() < preset.talk) doTalk();
    });
  });

  evidence.sort((a, b) => a.at - b.at);
  const first = evidence[0]?.at ?? now;
  return {
    preset: preset.id,
    lang,
    now,
    evidence,
    done: { things, pauses },
    since: first,
    counts: { days: preset.days, studied: studyDays, words: introducedWords, lessons: lessonsDone.length, answers: new Set(evidence.map((row) => row.uid.slice(0, 12))).size, rows: evidence.length },
  };
}
