// What Today and the Knowledge page show, from the scheduler (study/progress.js): what you know by kind and strength,
// what's slipping and what got stronger, what you knew on each day before, the grammar map, the most common words, the days you studied, where your
// evidence came from, the reviews coming, and one unit's history. Pure sums over the evidence on this device, in one
// language at a time: the one you're learning, unless a call says otherwise.

import { allEvidence, evidenceSince, evidenceVersion, gradeOf, memoryNow, studiedUnits, unitEvidence, unitState } from "../study/progress.js";
import { CHUNKS, ITEMS, PATTERNS, PATTERNS_IN_USE, WORDS, conceptsOf, contentLanguage, describe } from "../study/content.js";
import { learning } from "../study/learning.js";
import { SKILLS } from "../study/scheduler.js";
import { everyday, frequencyList } from "../study/frequency.js";
import { withoutAccents } from "../lang/index.js";
import { streakNow } from "../study/done.js";
import { bankWords } from "../read/bank.js";
import { UNDERSTOOD_LEVEL, bankAdded, indexed, isUnderstood, knownWords as understoodWords, levelOf, recalledOver as recalledFromIndex, stateOf, statesNow, wellOver, wordIndexVersion } from "./word-index.js";
import { dayKey } from "./streak.js";

const DAY = 86_400_000;

export { UNDERSTOOD_LEVEL };

/**
 * Whether you understand a unit well, not only that you've met it: Knowledge's one rule for a word or phrase being yours, wherever the app
 * counts or shows yours (Everyday's words and share, the pile, This week's new words, Explore's progress). You'd read it now and its read
 * strength has held 10 days or more (level 3), which takes being right again on a later day: a first right answer makes a word known for
 * about a week, and that alone isn't this. Or, for a word, you've said you know it (it's in your reading's word bank). unit: the scheduler's
 * id ("w:huis", "c:…"). A word or phrase is read from the word index (know/word-index.js isUnderstood); anything else from its unitState at
 * `now` (state, when the caller has it already).
 */
export function understood(unit, { lang = learning(), now = Date.now(), state = null } = {}) {
  if (typeof unit !== "string") return false;
  if (indexed(unit)) return isUnderstood(unit, { lang, now });
  const read = (state ?? unitState(unit, { lang, now })).strengths.read;
  return Boolean(read?.known && read.level >= UNDERSTOOD_LEVEL);
}
export const KIND_ORDER = ["word", "pattern", "phrase"];
const PREFIX = { word: "w:", pattern: "p:", phrase: "c:" };

// Every unit worth counting in a language: the ones you've met or been tested on, and the deck's own (a pattern only
// once a sentence shows it: content.js PATTERNS_IN_USE).
function unitsOf(lang) {
  const deck = lang === contentLanguage() ? [...Object.keys(PATTERNS).filter((id) => PATTERNS_IN_USE.has(id)).map((id) => `p:${id}`), ...Object.keys(CHUNKS).map((id) => `c:${id}`), ...Object.keys(WORDS).map((id) => `w:${id}`)] : [];
  return [...new Set([...deck, ...studiedUnits(lang)])].filter((unit) => /^[wpc]:/.test(unit));
}

// Sums keep for as long as the evidence and the minute don't change.
let memo = { key: "", value: null };
const memoised = (key, fn) => (memo.key === key ? memo.value : ((memo = { key, value: fn() }), memo.value));

/** The local day a moment falls on, as a number (days since 1970 in local time). */
export const dayOf = (at) => {
  const d = new Date(at);
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - 0) / DAY);
};

// Kept for the minute, until the evidence, the word bank or the frequency list (it arrives after the first draw) changes.
const knowledgeKey = (lang, now, said) => `k ${lang} ${evidenceVersion()} ${wordIndexVersion()} ${Math.floor(now / 60_000)} ${[...said].join(",")} ${frequencyList(lang) ? 1 : 0}`;
// Units a piece of knowledgeSteps works through: a few ms on a phone slowed 4× (all of them at once was 57 ms there).
const KNOW_PIECE = 2000;
// Each unit's state from the word index (know/word-index.js stateOf): nothing replayed. A generator, yielding between pieces.
function* knowledgeSteps(lang, now, said) {
  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  const kinds = Object.fromEntries(KIND_ORDER.map((kind) => [kind, { known: 0, started: 0, by: { read: 0, hear: 0, say: 0 }, slipping: 0, stronger: 0 }]));
  const slipping = [];
  const stronger = [];
  const knownWords = new Set();
  const units = unitsOf(lang);
  const trained = units.length ? memoryNow().train : SKILLS;
  for (let i = 0; i < units.length; i++) {
    if (i && i % KNOW_PIECE === 0) yield;
    const unit = units[i];
    const s = stateOf(unit, { lang, now });
    const k = s && kinds[s.kind];
    if (!k || s.isNew) continue;
    k.started++;
    let any = false;
    for (const skill of SKILLS) {
      if (!s.strengths[skill]?.known) continue;
      k.by[skill]++;
      if (s.trained.includes(skill)) any = true;
    }
    if (any) k.known++;
    if (s.kind === "word" && s.strengths.read?.known) knownWords.add(unit.slice(2));
    if (s.slipping) {
      k.slipping++;
      slipping.push(unit);
    }
    if (s.lastAt >= startOfDay && s.level > levelOf(unit, { lang, before: startOfDay })) {
      k.stronger++;
      stronger.push(unit);
    }
  }
  yield;
  // Words from your word bank that your studying doesn't count yet: the share includes them, and says so.
  const fromBank = [...said].filter((lemma) => !knownWords.has(lemma)).length;
  return { kinds, slipping, stronger, trained, everyday: everyday(new Set([...knownWords, ...said]), lang), fromBank };
}
const runWhole = (steps) => {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
};
/**
 * What you know: for each kind (word · pattern · phrase), how many units you know at all (by any strength you train)
 * and by each strength, how many you've started, what's slipping, and what got stronger since the start of today.
 * { kinds: { word: { known, started, by: { read, hear, say }, slipping, stronger } }, slipping: [unit], stronger:
 * [unit], trained, everyday: { share, known, counted } | null, fromBank }. said: the lemmas in your reading's word bank
 * (the words you've said you know), which count for the share of everyday language too; fromBank: how many of them your
 * studying doesn't already count.
 */
export function knowledge({ lang = learning(), now = Date.now(), said = new Set() } = {}) {
  return memoised(knowledgeKey(lang, now, said), () => runWhole(knowledgeSteps(lang, now, said)));
}

/**
 * How many words you know at `now`: knowledge()'s kinds.word.known (with no word bank), without the rest. What a session keeps from its start
 * for the words milestone (know/celebration-ui.js wordsKnown): knowledge() asks every unit there is, and a new learner's session waited 30 ms
 * slowed 4× for it. Only a word the word index has an entry for can be known, so this counts those entries, each as knowledge() counts it,
 * among the units knowledge() asks (the content's words in the language it's in, and every unit studied); knowledge()'s own when it's kept.
 */
export function wordsKnownNow({ lang = learning(), now = Date.now() } = {}) {
  const said = new Set();
  if (memo.key === knowledgeKey(lang, now, said)) return memo.value.kinds.word.known;
  const deck = lang === contentLanguage();
  let studied = null;
  let known = 0;
  for (const s of statesNow({ lang, now })) {
    if (s.kind !== "word" || s.isNew) continue;
    if (!(deck && Object.hasOwn(WORDS, s.unit.slice(2))) && !(studied ??= new Set(studiedUnits(lang))).has(s.unit)) continue;
    if (SKILLS.some((skill) => s.strengths[skill]?.known && s.trained.includes(skill))) known++;
  }
  return known;
}

/**
 * knowledge() worked out a piece at a time (a generator for know/slices.js inSlices) and kept as knowledge() keeps it, so a knowledge() for
 * the same minute after it has it at once: Home's return a minute on, before Your progress draws. Left as it is when it's kept already; not
 * kept when the evidence or the word index changes meanwhile (knowledge() then works it out again).
 */
export function* warmKnowledge({ lang = learning(), now = Date.now(), said = new Set() } = {}) {
  const key = knowledgeKey(lang, now, said);
  if (memo.key === key) return;
  const value = yield* knowledgeSteps(lang, now, said);
  if (knowledgeKey(lang, now, said) === key) memo = { key, value };
}

/**
 * The most common words, in order, as a strip: { cells: [{ lemma, rank, state, yours }], counts } for the frequency list's
 * first `size`, or null without a list. state: known (you'd read it now) · slipping · said (in your word bank: you said
 * you know it) · learning (tested, not known yet) · new. yours: you understand it well (understood), as Everyday's card and
 * page ink it; counts.yours is how many are. said: the word bank's lemmas.
 */
export function wordStrip({ lang = learning(), now = Date.now(), size = 1000, said = new Set() } = {}) {
  const list = frequencyList(lang);
  if (!list) return null;
  const studied = new Set(studiedUnits(lang));
  const counts = { known: 0, slipping: 0, said: 0, learning: 0, new: 0, yours: 0 };
  const cells = list.lemmas.slice(0, size).map(([lemma], i) => {
    let state = said.has(lemma) ? "said" : "new";
    let yours = said.has(lemma);
    if (studied.has(`w:${lemma}`)) {
      const s = stateOf(`w:${lemma}`, { lang, now });
      yours ||= isUnderstood(`w:${lemma}`, { lang, now });
      if (s.strengths.read?.known) state = "known";
      else if (s.slipping) state = "slipping";
      else if (!s.isNew && state !== "said") state = "learning";
    }
    counts[state]++;
    if (yours) counts.yours++;
    return { lemma, rank: i + 1, state, yours };
  });
  return { cells, counts, size: cells.length };
}

/**
 * How much of everyday speech you'd follow, from the words you understand well (understood, with your word bank): what Everyday's card and
 * page say, so the number and the words in ink always agree. { share, known, counted } (frequency.js everyday), or null without a list.
 */
export function everydayShare({ lang = learning(), now = Date.now() } = {}) {
  if (!frequencyList(lang)) return null;
  return everyday(understoodWords({ lang, now }), lang);
}

/**
 * Over time's page: at each of `ats` (ascending), the words and phrases you understood well then (understood, as it stood at that time, with
 * your word bank's words from when you added them), how many of them you knew well by each strength, and how many ideas you'd met.
 * [{ at, n, read, hear, say, ideas }]. Counted from the word index's stretches (know/word-index.js wellOver): nothing replayed. Kept until the
 * evidence, the index, the bank or the times change.
 */
export function overTime({ lang = learning(), ats }) {
  const key = `o ${lang} ${evidenceVersion()} ${wordIndexVersion()} ${bankWords(lang).length} ${ats.join(",")}`;
  if (overTimeMemo.key === key) return overTimeMemo.value;
  const units = studiedUnits(lang);
  const well = wellOver(ats, { lang });
  // The bank's words, from the day you added each.
  const added = bankAdded(lang);
  // An idea is met at its first graded answer.
  const firsts = units.filter((unit) => unit.startsWith("p:")).map((unit) => unitEvidence(unit, lang).find((row) => gradeOf(row))?.at).filter(Boolean);
  const out = ats.map((at, i) => {
    const yours = new Set(well.read[i]);
    for (const [unit, when] of added) if (when <= at) yours.add(unit);
    return { at, n: yours.size, read: well.read[i].size, hear: well.hear[i], say: well.say[i], ideas: firsts.filter((first) => first < at).length };
  });
  overTimeMemo = { key, value: out };
  return out;
}
let overTimeMemo = { key: "", value: null };

/**
 * The grammar map: every pattern of the catalog that a sentence shows or you've studied, hung under the first such
 * pattern it builds on (PATTERNS[id].after), in the order to read them: [{ unit, name, depth, also: [names], state, level }]. state: strong (level 3 or more) ·
 * learning · slipping · new (never tested).
 */
export function grammarMap({ lang = learning(), now = Date.now() } = {}) {
  // The patterns there's something to study for, or that you've studied (content.js PATTERNS_IN_USE).
  const studied = new Set(studiedUnits(lang));
  const ids = Object.keys(PATTERNS).filter((id) => PATTERNS_IN_USE.has(id) || studied.has(`p:${id}`));
  const listed = new Set(ids);
  const afterOf = (id) => (PATTERNS[id]?.after ?? []).filter((other) => other !== id && listed.has(other));
  const children = new Map(ids.map((id) => [id, []]));
  const roots = [];
  for (const id of ids) {
    const [parent] = afterOf(id);
    if (parent) children.get(parent).push(id);
    else roots.push(id);
  }
  const rows = [];
  const placed = new Set();
  const visit = (id, depth) => {
    if (placed.has(id)) return;
    placed.add(id);
    const unit = `p:${id}`;
    const s = stateOf(unit, { lang, now });
    const state = !s || s.isNew ? "new" : s.slipping ? "slipping" : s.level >= 3 ? "strong" : "learning";
    rows.push({ unit, name: PATTERNS[id].name, depth, also: afterOf(id).slice(1).map((other) => PATTERNS[other].name), state, level: s?.level ?? 0 });
    for (const child of children.get(id)) visit(child, depth + 1);
  };
  for (const id of roots) visit(id, 0);
  // Anything in a loop of prerequisites still shows, at the top level.
  for (const id of ids) visit(id, 0);
  return rows;
}

/** The words you can read, as lemmas (for the frequency list and the strip). */
export function knownWords({ lang = learning(), now = Date.now() } = {}) {
  return new Set(
    unitsOf(lang)
      .filter((unit) => unit.startsWith("w:") && stateOf(unit, { lang, now })?.strengths.read?.known)
      .map((unit) => unit.slice(2)),
  );
}

/**
 * What you know over time: for each of the last `days` days (oldest first, today last), how many words you'd have
 * recalled by the end of that day (today: now), counted as knowledge() counts them: known by a strength you train,
 * from the evidence before that moment only. [{ at, n }].
 */
export function growth({ lang = learning(), now = Date.now(), days = 28, phrases = false, step = 1 } = {}) {
  // step: days between points (a long history in the same number of points).
  const memoKey = `g ${lang} ${evidenceVersion()} ${days} ${step} ${Math.floor(now / 60_000)} ${phrases}`;
  if (growthMemo.key === memoKey) return growthMemo.value;
  const ats = [];
  for (let i = days - 1; i >= 0; i--) ats.push(i === 0 ? now : new Date(now - i * step * DAY).setHours(23, 59, 59, 999));
  const counts = recalledFromIndex(ats, { lang, phrases }); // the word index's stretches: nothing replayed
  const out = ats.map((at, i) => ({ at, n: counts[i] }));
  growthMemo = { key: memoKey, value: out };
  return out;
}
let growthMemo = { key: "", value: null };

/** What you can read but can't say yet, by kind ({ word: [unit], pattern, phrase }): saying them is the next step. */
export function readNotSaid({ lang = learning(), now = Date.now() } = {}) {
  const out = Object.fromEntries(KIND_ORDER.map((kind) => [kind, []]));
  for (const unit of unitsOf(lang)) {
    const s = stateOf(unit, { lang, now });
    if (s && out[s.kind] && s.strengths.read?.known && !s.strengths.say?.known) out[s.kind].push(unit);
  }
  return out;
}

/** The units of one kind you know by a strength (or started: tested at all), for a cell of the table. */
export function unitsBy({ lang = learning(), now = Date.now(), kind, skill, started = false }) {
  return unitsOf(lang).filter((unit) => {
    if (!unit.startsWith(PREFIX[kind])) return false;
    const s = stateOf(unit, { lang, now });
    return started ? Boolean(s && !s.isNew && !s.strengths[skill]?.known) : Boolean(s?.strengths[skill]?.known);
  });
}

/**
 * The days you studied, in the week that holds `now` (Monday first): [{ day, date, studied, rested, paused, today,
 * future }], how many, and the streak (study/done.js streakNow). A day counts as the streak counts it: one finished
 * thing (a session, 5 minutes of reading, a conversation with your AI), the day starting at 4 am. rested: a missed day
 * a rest day or the next day's studying covered; paused: a day of a pause.
 */
export function week({ now = Date.now() } = {}) {
  const streak = streakNow({ now });
  const todayKey = dayKey(now);
  const today = new Date(now);
  // Before 4 am it's still the day before: its week.
  if (today.getHours() < 4) today.setDate(today.getDate() - 1);
  const monday = new Date(today);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const out = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const key = dayKey(+date);
    const status = streak.statuses[key];
    out.push({ day: dayOf(+date), key, date: +date, studied: status === "studied", rested: status === "rested" || status === "mended", paused: status === "paused", today: key === todayKey, future: key > todayKey });
  }
  return { days: out, studied: out.filter((d) => d.studied).length, streak };
}

/** Every day you studied, as local day numbers (for a calendar). */
export const studyDays = () => [...new Set(allEvidence().map((row) => dayOf(row.at)))].sort((a, b) => a - b);

/** Where an activity's evidence comes from: games, reading, talk (with your AI), or listening. */
export function sourceOf(activity = "") {
  if (activity === "reader") return "reading";
  if (activity.startsWith("practice")) return "talk";
  if (activity.startsWith("listen") || activity === "type-heard" || activity === "hear-gap" || activity === "repeat" || activity === "repeat-word") return "listening";
  return "games";
}

/**
 * What you did this week (since `since`), by where it came from: { games, reading, talk, listening }. A thing done is
 * one answer, one page or one turn: the rows recorded together count once, so a page that met forty words is one.
 */
export function sources({ since = Date.now() - 7 * DAY } = {}) {
  const moments = { games: new Set(), reading: new Set(), talk: new Set(), listening: new Set() };
  for (const row of evidenceSince(since)) moments[sourceOf(row.activity)].add(row.at);
  return Object.fromEntries(Object.entries(moments).map(([source, set]) => [source, set.size]));
}

/**
 * Reviews coming in the next `days` days, today first (with everything already due): [{ day, date, count, units }]. A unit
 * counts once, on the day its first trained strength comes due, and only units your study material can practice (a
 * word you've only met in a book comes back through reading, not a session).
 */
export function forecast({ lang = learning(), now = Date.now(), days = 7 } = {}) {
  const today = dayOf(now);
  const out = Array.from({ length: days }, (_, i) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + i);
    return { day: today + i, date: +date, count: 0, units: [] };
  });
  const practised = new Set(lang === contentLanguage() ? ITEMS.flatMap(conceptsOf) : []);
  for (const unit of practised) {
    const s = indexed(unit) ? stateOf(unit, { lang, now }) : unitState(unit, { lang, now });
    if (!s || s.isNew || !s.dueAt) continue;
    const i = Math.max(0, dayOf(s.dueAt) - today);
    if (i < days) {
      out[i].count++;
      out[i].units.push(unit);
    }
  }
  return out;
}

/**
 * Every day you studied, as a calendar of the last `weeks` weeks up to this one, Monday first: { weeks: [[{ day,
 * date, moments, level, today, future }] × 7], studied }. level 0–4 by how much you did that day (things done, as
 * sources counts them): 1 up to 3, 2 up to 9, 3 up to 19, 4 from 20.
 */
export function calendar({ now = Date.now(), weeks = 12 } = {}) {
  const perDay = new Map();
  for (const row of allEvidence()) {
    const day = dayOf(row.at);
    if (!perDay.has(day)) perDay.set(day, new Set());
    perDay.get(day).add(row.at);
  }
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - (weeks - 1) * 7);
  const today = dayOf(now);
  const out = [];
  let studied = 0;
  for (let w = 0; w < weeks; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + w * 7 + d);
      const day = dayOf(+date);
      const moments = perDay.get(day)?.size ?? 0;
      if (moments) studied++;
      days.push({ day, date: +date, moments, level: !moments ? 0 : moments <= 3 ? 1 : moments <= 9 ? 2 : moments <= 19 ? 3 : 4, today: day === today, future: day > today });
    }
    out.push(days);
  }
  return { weeks: out, studied };
}

// Lowercase without accents (and the letters a keyboard may lack: đ, ø, ß), for matching what you type.
const fold = (text) => withoutAccents(text ?? "").toLowerCase();

/**
 * Finds words, patterns and phrases by what you type: a word by its Dutch or its English, a pattern or a phrase by its
 * name. Searches what you've studied, the study material, and the most common words. [{ unit, name, en, kind, rank,
 * studied }], the closest first (whole word, then start of a word, then anywhere; studied ones first among equals).
 */
export function searchUnits(query, { lang = learning(), limit = 30 } = {}) {
  const q = fold(query).trim();
  if (!q) return [];
  const list = frequencyList(lang);
  const ranks = new Map((list?.lemmas ?? []).slice(0, 5000).map(([lemma], i) => [`w:${lemma}`, i + 1]));
  const studied = new Set(studiedUnits(lang));
  const candidates = new Set([...unitsOf(lang), ...ranks.keys()]);
  const found = [];
  for (const unit of candidates) {
    const info = describe(unit);
    const texts = [info.name, info.en].filter(Boolean).map(fold);
    let score = Infinity;
    for (const text of texts) {
      if (text === q) score = Math.min(score, 0);
      else if (text.startsWith(q) || text.split(/[\s:·…-]+/).some((word) => word.startsWith(q))) score = Math.min(score, 1);
      else if (text.includes(q)) score = Math.min(score, 2);
    }
    if (score === Infinity) continue;
    found.push({ unit, name: info.name, en: info.en, kind: info.kind, rank: ranks.get(unit) ?? null, studied: studied.has(unit), score });
  }
  found.sort((a, b) => a.score - b.score || Number(b.studied) - Number(a.studied) || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
  return found.slice(0, limit).map(({ score: _score, ...hit }) => hit);
}

/** Sentences in the deck that practice a unit. */
export const itemsWith = (unit) => ITEMS.filter((item) => conceptsOf(item).includes(unit));

/**
 * A unit's history, newest first: every test ({ at, activity, skill, grade, outcome, said, note, help }) and how many
 * times you met it, by source.
 */
export function history(unit, { lang = learning() } = {}) {
  const tests = [];
  const met = { games: 0, reading: 0, talk: 0, listening: 0 };
  for (const row of unitEvidence(unit, lang)) {
    const grade = gradeOf(row);
    if (grade) tests.push({ at: row.at, activity: row.activity, skill: row.skill, grade, outcome: row.outcome, help: row.help, said: row.said, note: row.note });
    else if (row.outcome === "met") met[sourceOf(row.activity)]++;
  }
  return { tests: tests.reverse(), met };
}
