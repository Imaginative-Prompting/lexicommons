// The word index: every word, phrase and idea you've met in a language, kept so any screen can ask about them in a moment. Whether you
// understand a word or phrase well (Knowledge's one rule: read known at level 3 or more, or a word in your word bank), which you've started,
// when you first met each, its level then and now, each strength's state as unitState gives it (known, due, slipping), and every stretch it was
// known well by each strength (Over time's chart). The pile, Your words, Home's number, This week, Everyday, Over time, the ideas and Explore's
// progress all read it, so they always agree, and none of them replays the evidence.
//
// How it's kept:
//   - Each unit's entry is worked out from its own evidence once (progress.js unitLasting: one replay), including the moment each strength
//     stops being known, so whether it's known at any later moment is a comparison: nothing is worked out again as time passes.
//   - An answer works out again only the units it touched (progress.js tells its listeners which); anything else that changes the evidence (a
//     sync's rows from before, a clear, an Undo, another tab, the units a pack's patterns count as) works the language out again on its next
//     read (progress.js evidenceEpoch).
//   - It's kept on the device (IndexedDB, through sampleDb so the sample learner has its own), so a start uses it instead of replaying the
//     whole evidence log: a kept snapshot is used while the evidence's fingerprint (progress.js evidenceStamp) and the scheduler's model
//     (scheduler.js modelStamp) are what they were when it was kept.
//   - Its listeners hear an answer, a rebuild, a word bank change, and the day's turn (a word you understood may have lapsed overnight).
// Reads are synchronous and cheap; shell/main.js loads the kept snapshots (loadWordIndex) with the evidence at start.

import { canonicalUnit, evidenceEpoch, evidenceStamp, memoryNow, onProgressChange, studiedUnits, unitLasting } from "../study/progress.js";
import { KINDS, SKILLS, dueAtOf, modelStamp } from "../study/scheduler.js";
import { learning } from "../study/learning.js";
import { bankEntry, bankWords, inBank, onBankChange } from "../read/bank.js";
import { sampleDb } from "../study/sample-mode.js";

/** The read strength's level a unit must reach to be one you understand well: 3, holding 10 days or more (scheduler.js LEVEL_DAYS). */
export const UNDERSTOOD_LEVEL = 3;

// Kept snapshots of another shape are worked out again.
const SCHEMA = 5; // 5: an entry's placedAt (a placement's seed, progress.js placedSeedOf)
const DB = sampleDb("lexicommons-word-index");
const STORE = "languages";
const KEPT = /^[wcp]:/; // the units it keeps: words, phrases and ideas (patterns)
const WORDISH = /^[wc]:/; // the ones that are words you know: words and phrases
const SAVE_AFTER = 2000; // ms after the last change: one write for a session's answers

// lang → { entries: Map<unit, entry>, dirty: Set<unit>, epoch, order: the entries the first met first (kept until they change) }
// entry: { unit, metAt, firstAt, lastAt, placedAt, levels: [[at, level]], read, hear, say }; each strength { level, until, stability, last,
// well, recalled } or null. placedAt: when a placement put it down as known (Find your level), where nothing was answered before; else 0.
const langs = new Map();
let stored = new Map(); // lang → a kept snapshot not yet used
let version = 0;
const listeners = new Set();
const stats = { built: 0, adopted: 0, updated: 0, saved: 0 };

/** Whether a unit is one the index keeps: a word ("w:…"), a phrase ("c:…") or an idea ("p:…"). */
export const indexed = (unit) => typeof unit === "string" && KEPT.test(unit);
// An idea a pack names as its own counts as the shared one it's the same as (progress.js canonicalUnit).
const keyOf = (unit, lang) => (unit.startsWith("p:") ? canonicalUnit(unit, lang) : unit);

function entryOf(unit, lang) {
  const { metAt, firstAt, lastAt, placedAt, levels, strengths } = unitLasting(unit, lang, { well: UNDERSTOOD_LEVEL });
  return { unit, metAt, firstAt, lastAt, placedAt, levels, read: strengths.read, hear: strengths.hear, say: strengths.say };
}

function build(lang) {
  const entries = new Map();
  for (const unit of studiedUnits(lang)) if (KEPT.test(unit)) entries.set(unit, entryOf(unit, lang));
  stats.built++;
  return entries;
}

// ---------- kept on the device ----------

const packStrength = (s) => (s ? [s.level, s.until, s.stability, s.last, s.well.flat(), s.recalled.flat()] : 0);
const pairs = (flat) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
};
const unpackStrength = (s) => (s ? { level: s[0], until: s[1], stability: s[2], last: s[3], well: pairs(s[4]), recalled: pairs(s[5]) } : null);

/** A language's index as it's kept: plain data, the same for the same evidence (entries in unit order). */
export function wordIndexSnapshot(lang = learning()) {
  const state = ensure(lang);
  const entries = [...state.entries.values()]
    .sort((a, b) => (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0))
    .map((e) => [e.unit, e.metAt, e.firstAt, e.lastAt, e.levels.flat(), packStrength(e.read), packStrength(e.hear), packStrength(e.say), e.placedAt]);
  return { lang, schema: SCHEMA, model: modelStamp(), stamp: evidenceStamp(lang), entries };
}

/** Kept snapshots to use on each language's first read (loadWordIndex hands them here; a test can too). Each is checked when it's used. */
export function useStoredIndex(records) {
  stored = new Map();
  for (const record of records ?? []) if (record && typeof record.lang === "string" && Array.isArray(record.entries)) stored.set(record.lang, record);
}

function adopt(lang) {
  const record = stored.get(lang);
  if (!record) return null;
  stored.delete(lang);
  if (record.schema !== SCHEMA || record.model !== modelStamp() || record.stamp !== evidenceStamp(lang)) return null;
  const entries = new Map();
  for (const [unit, metAt, firstAt, lastAt, levels, read, hear, say, placedAt] of record.entries) {
    entries.set(unit, { unit, metAt, firstAt, lastAt, placedAt: placedAt ?? 0, levels: pairs(levels), read: unpackStrength(read), hear: unpackStrength(hear), say: unpackStrength(say) });
  }
  stats.adopted++;
  return entries;
}

let opening = null;
function db() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no IndexedDB"));
  return (opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "lang" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    opening = null;
    throw error;
  }));
}

/** Reads the kept snapshots (at start, beside the evidence: shell/main.js). Never fails: without them, each language is worked out. */
export async function loadWordIndex() {
  try {
    const database = await db();
    const records = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
    useStoredIndex(records);
  } catch {
    // A private window, or no database: worked out as it's needed.
  }
}

const toSave = new Set();
let saveTimer = 0;
function saveSoon(lang) {
  if (typeof indexedDB === "undefined") return;
  toSave.add(lang);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_AFTER);
}
async function save() {
  const langsNow = [...toSave];
  toSave.clear();
  try {
    const records = langsNow.map((lang) => wordIndexSnapshot(lang));
    const database = await db();
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      for (const record of records) tx.objectStore(STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    stats.saved++;
  } catch {
    // Kept next time, or worked out again at the next start.
  }
}

/**
 * Forgets what's kept on the device, every language's: the store emptied and nothing waiting to be written. For deleting the account and
 * clearing this device's progress, where a kept index would be the person's study left behind in another form (a save still waiting when
 * the page left never ran, so the last one stayed). The index itself is worked out again from the evidence when it's next read.
 */
export async function forgetWordIndex() {
  clearTimeout(saveTimer);
  toSave.clear();
  stored = new Map();
  try {
    const database = await db();
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } catch {
    // No database: nothing was kept.
  }
}

// ---------- kept up to date ----------

function ensure(lang) {
  let state = langs.get(lang);
  if (state && state.epoch !== evidenceEpoch()) state = null; // indexed again from the start, unheard: worked out again
  if (!state) {
    const kept = adopt(lang);
    state = { entries: kept ?? build(lang), dirty: new Set(), epoch: evidenceEpoch(), order: null };
    langs.set(lang, state);
    if (!kept) saveSoon(lang);
  }
  if (state.dirty.size) {
    // (One with no evidence left, a placement's seed taken back with nothing answered, goes: a fresh build wouldn't have it.)
    for (const unit of state.dirty) {
      const entry = entryOf(unit, lang);
      if (entry.metAt) state.entries.set(unit, entry);
      else state.entries.delete(unit);
    }
    stats.updated += state.dirty.size;
    state.dirty.clear();
    state.order = null;
    saveSoon(lang);
  }
  return state;
}

function changed() {
  version++;
  for (const fn of listeners) {
    try {
      fn();
    } catch (error) {
      console.error(error);
    }
  }
}

onProgressChange(({ units } = {}) => {
  if (units == null) {
    // Anything may have changed: each language is worked out again on its next read (a kept snapshot no longer matches the evidence).
    langs.clear();
    stored.clear();
  } else {
    for (const key of units) {
      const space = key.indexOf(" ");
      const lang = key.slice(0, space);
      const unit = key.slice(space + 1);
      if (KEPT.test(unit)) langs.get(lang)?.dirty.add(unit);
    }
  }
  changed();
});
onBankChange(() => changed());

// The day's turn: a word understood yesterday may have lapsed overnight. Listeners hear it once a day (a comparison per unit, nothing replayed).
function nextDay() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5).getTime() - now.getTime();
  const timer = setTimeout(() => {
    changed();
    nextDay();
  }, next);
  timer?.unref?.();
}
if (typeof window !== "undefined") nextDay();

// ---------- reading it ----------

/** A number that changes whenever what the index says may have (for anything that keeps its own sums). */
export const wordIndexVersion = () => version;

/** Calls fn when what the index says may have changed (an answer, a rebuild, the word bank, the day's turn). Returns a function to stop. */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const wellNow = (entry, now) => Boolean(entry?.read && entry.read.level >= UNDERSTOOD_LEVEL && now < entry.read.until);
const saidWord = (entry, lang) => entry.unit.startsWith("w:") && inBank(lang, entry.unit.slice(2));

/** A unit's entry: { unit, metAt, firstAt, lastAt, levels, read, hear, say } (each strength { level, until, stability, last, well } or null), or null. */
export const wordEntry = (unit, { lang = learning() } = {}) => (indexed(unit) ? (ensure(lang).entries.get(keyOf(unit, lang)) ?? null) : null);

/**
 * Whether you understand a word or phrase well at `now`: read known at level 3 or more (a first right answer makes a word known for about a
 * week, and that alone isn't this: it takes being right again on a later day), or, for a word, it's in your word bank (you said you know it).
 */
export function isUnderstood(unit, { lang = learning(), now = Date.now() } = {}) {
  if (!indexed(unit)) return false;
  if (unit.startsWith("w:") && inBank(lang, unit.slice(2))) return true;
  return wellNow(wordEntry(unit, { lang }), now);
}

/**
 * A unit's state at `now`, as unitState gives it (what the Knowledge page reads of it), from its entry: { unit, kind, isNew, level, trained,
 * strengths: { read: { known, level, due, dueAt } | null, hear, say }, due, dueAt (the soonest a strength you train is due; 0: none), slipping,
 * firstAt, lastAt }, or null for a unit with no evidence.
 */
export function stateOf(unit, { lang = learning(), now = Date.now() } = {}) {
  const entry = wordEntry(unit, { lang });
  return entry ? stateOfEntry(entry, now) : null;
}
function stateOfEntry(entry, now, memory = memoryNow()) {
  const kind = entry.unit[0];
  const strengths = {};
  let level = 0;
  let due = false;
  let slipping = false;
  let soonest = 0;
  for (const skill of SKILLS) {
    const s = entry[skill];
    if (!s) {
      strengths[skill] = null;
      continue;
    }
    const dueAt = dueAtOf(kind, s.stability, s.last, memory.target);
    strengths[skill] = { known: now < s.until, level: s.level, due: dueAt <= now, dueAt };
    level = Math.max(level, s.level);
    if (!memory.train.includes(skill)) continue;
    soonest = soonest ? Math.min(soonest, dueAt) : dueAt;
    if (dueAt <= now) {
      due = true;
      if (s.level >= 2) slipping = true;
    }
  }
  return { unit: entry.unit, kind: KINDS[kind] ?? null, isNew: !entry.firstAt && !entry.placedAt, level, trained: memory.train, strengths, due, dueAt: soonest, slipping, firstAt: entry.firstAt, lastAt: entry.lastAt, placedAt: entry.placedAt ?? 0 };
}

// Every entry, the first met first (then by unit): sorted once until the entries change.
function inOrder(lang) {
  const state = ensure(lang);
  return (state.order ??= [...state.entries.values()].sort((a, b) => a.metAt - b.metAt || (a.unit < b.unit ? -1 : 1)));
}

/** Every unit you've met in a language (started or not), as entries (wordEntry), the first you met first; `kinds` a pattern of prefixes. */
export function wordEntries({ lang = learning(), kinds = WORDISH } = {}) {
  return inOrder(lang).filter((e) => kinds.test(e.unit));
}

/** Every unit you've met, with its state at `now` (stateOf), in no particular order: for sums over all of them (summary.js knowledge). */
export function statesNow({ lang = learning(), now = Date.now() } = {}) {
  const memory = memoryNow();
  return [...ensure(lang).entries.values()].map((entry) => stateOfEntry(entry, now, memory));
}

/**
 * Every word and phrase you've started (asked at least once), the first you met first: [{ unit, first, known }], first when you first met it
 * (its first evidence of any kind), known whether you understand it well (isUnderstood). What the pile is made of.
 */
export function startedWords({ lang = learning(), now = Date.now() } = {}) {
  const rows = [];
  for (const entry of inOrder(lang)) {
    if ((!entry.firstAt && !entry.placedAt) || !WORDISH.test(entry.unit)) continue;
    rows.push({ unit: entry.unit, first: entry.metAt, known: saidWord(entry, lang) || wellNow(entry, now) });
  }
  return rows;
}

/** The words and phrases you understand well, of those you've started, the first you met first: the number Home and Knowledge show. */
export const understoodUnits = (opts = {}) => startedWords(opts).filter((row) => row.known);

/**
 * The words you understand well, as their lemmas: those your studying says (isUnderstood) and every word in your word bank, whether or not
 * you've studied it. Everyday's share and its words in ink.
 */
export function knownWords({ lang = learning(), now = Date.now() } = {}) {
  const out = new Set(bankWords(lang));
  for (const entry of ensure(lang).entries.values()) if (entry.unit.startsWith("w:") && wellNow(entry, now)) out.add(entry.unit.slice(2));
  return out;
}

/**
 * Home's number (counts' understood) once `units` are put down as known well too: a placement's seeds (study/placement.js placedSeeds), for
 * its result to say what Home will before it's taken. Its ideas and anything not a word or phrase don't count, as in counts.
 */
export function understoodWith(units, { lang = learning(), now = Date.now() } = {}) {
  const more = new Set(units.filter((unit) => WORDISH.test(unit)));
  let understood = 0;
  for (const entry of ensure(lang).entries.values()) {
    if ((!entry.firstAt && !entry.placedAt) || !WORDISH.test(entry.unit)) continue;
    if (saidWord(entry, lang) || wellNow(entry, now)) {
      understood++;
      more.delete(entry.unit);
    }
  }
  return understood + more.size;
}

/**
 * How many: understood (words and phrases you've started and understand well: Home's number), started, words (the lemmas knownWords gives),
 * said (the words in your word bank).
 */
export function counts({ lang = learning(), now = Date.now() } = {}) {
  let understood = 0;
  let started = 0;
  const words = new Set(bankWords(lang));
  for (const entry of ensure(lang).entries.values()) {
    if (entry.unit.startsWith("w:") && wellNow(entry, now)) words.add(entry.unit.slice(2));
    if ((!entry.firstAt && !entry.placedAt) || !WORDISH.test(entry.unit)) continue;
    started++;
    if (saidWord(entry, lang) || wellNow(entry, now)) understood++;
  }
  return { understood, started, words: words.size, said: bankWords(lang).length };
}

/** When you first met a unit (its first evidence of any kind), or 0. */
export const firstMet = (unit, opts = {}) => wordEntry(unit, opts)?.metAt ?? 0;

/**
 * A unit's level (its strongest strength's, 1–4; 0: never asked), as unitState gives it: from all its evidence, or with `before`, from its
 * evidence before that moment.
 */
export function levelOf(unit, { lang = learning(), before = Infinity } = {}) {
  let level = 0;
  for (const [at, l] of wordEntry(unit, { lang })?.levels ?? []) {
    if (at >= before) break;
    level = l;
  }
  return level;
}

/**
 * Which words and phrases were known well at each of `ats` (times, ascending), by each strength, as unitState would have said then from the
 * evidence before it: { read: [Set of units], hear: [count], say: [count] }, one per time. Over time's chart, counted from the kept stretches.
 */
export function wellOver(ats, { lang = learning() } = {}) {
  const read = ats.map(() => new Set());
  const hear = ats.map(() => 0);
  const say = ats.map(() => 0);
  // The first time at or after a moment.
  const firstAt = (t) => {
    let lo = 0;
    let hi = ats.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ats[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  for (const entry of ensure(lang).entries.values()) {
    if (!WORDISH.test(entry.unit)) continue;
    for (const [from, to] of entry.read?.well ?? []) for (let i = firstAt(from); i < ats.length && ats[i] < to; i++) read[i].add(entry.unit);
    for (const [from, to] of entry.hear?.well ?? []) for (let i = firstAt(from); i < ats.length && ats[i] < to; i++) hear[i]++;
    for (const [from, to] of entry.say?.well ?? []) for (let i = firstAt(from); i < ats.length && ats[i] < to; i++) say[i]++;
  }
  return { read, hear, say };
}

/**
 * How many words (and phrases, with phrases) you'd have recalled at each of `ats` (times, ascending), as recalledOver counts them: a strength
 * you train known there, from the evidence before it. Home's chart, counted from the kept stretches. [count], one per time.
 */
export function recalledOver(ats, { lang = learning(), phrases = false } = {}) {
  const counts = ats.map(() => 0);
  const seen = new Int32Array(ats.length).fill(-1); // the last unit counted at each time, so a unit counts once however many strengths it has
  const train = memoryNow().train;
  const kinds = phrases ? WORDISH : /^w:/;
  let n = 0;
  for (const entry of ensure(lang).entries.values()) {
    if (!kinds.test(entry.unit)) continue;
    n++;
    for (const skill of train) {
      for (const [from, to] of entry[skill]?.recalled ?? []) {
        let lo = 0;
        let hi = ats.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (ats[mid] < from) lo = mid + 1;
          else hi = mid;
        }
        for (let i = lo; i < ats.length && ats[i] < to; i++) {
          if (seen[i] === n) continue;
          seen[i] = n;
          counts[i]++;
        }
      }
    }
  }
  return counts;
}

/** The word bank's words with when each was added: [[unit, at]] (Over time counts each from then). */
export const bankAdded = (lang = learning()) => bankWords(lang).map((lemma) => [`w:${lemma}`, bankEntry(lang, lemma)?.added ?? 0]);

/** What the index has done (for its tests and checks): languages worked out, snapshots used, units worked out again, writes. */
export const wordIndexStats = () => ({ ...stats });

/** Forgets every language (as a fresh start would), keeping the snapshots handed to useStoredIndex: for the tests. */
export function resetWordIndex() {
  langs.clear();
}
