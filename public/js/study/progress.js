// What you know, kept on this device. Every activity reports evidence in one format, so a game, a card, the reader or
// a conversation your AI grades all move the same picture. One row per unit an activity tested or met:
//   { at, lang, concept, skill, outcome, test, help, marked, how, activity, item, p }
//   lang     the language the unit belongs to (nl w:in isn't de w:in): the language you're learning (learning.js)
//            unless the activity says otherwise; a row without one is Dutch (langOf), as every row from before
//            27 Oct 2026 is
//   concept  w:<lemma> · p:<pattern> · c:<phrase>
//   skill    read · hear · say (typing counts as saying) · sound (how a recognizer heard you say it: the pronunciation
//            track, kept apart from the memory schedule)
//   outcome  right · wrong · met (it was in front of you but not tested: exposure)
//   test     how strong a test it was: free (your own sentence) · recall · build (put it in order, place it) · pick
//            (from a few) · self (you graded yourself) · judged (an overall judgment, not one answer)
//   help     none · nudge (help that didn't give this unit away) · answer (help that showed this unit's answer)
//   marked   a free test graded wrong: whether the grader pointed at your exact words
//   p        a graded row's predicted recall (0–1) of its unit's strength just before it, as the scheduler had it (from
//            27 Oct 2026; absent for a strength's first test)
//   uid      the row's id on every device (16 hex; rows from one answer in the order they were recorded): rows from
//            before it have none, and their content stands in (evidenceKey)
// gradeOf(row) turns a row into a review grade (again · hard · good), or null for exposure and pronunciation: the one
// place that rule lives. Rows from before 27 Oct 2026 (skills reading · listening · writing · speaking, outcomes hint ·
// seen) read through normalize().
// Evidence lives in IndexedDB (lexicommons-study); a copy is held in memory in time order (rows of one moment by their
// key, so every device has them in the same order), indexed by unit.
// With your own storage connected it syncs (sync.js, kind "progress", a file per month): rows are only ever added, so
// the devices' rows come together. Clearing your progress there clears it everywhere: the clear goes to your account
// (/api/progress/clears: when, never what), every device using the storage applies the clears the account lists
// (store "clears"), covering every row recorded before it, and keeps the rows it took (store "kept") for 7 days, when
// Undo, made on any of them, brings them all back. A file in your storage can't clear anything.
//
// What you know comes from the scheduler (scheduler.js): FSRS per unit and strength, replayed from the graded evidence.
// unitState() is the whole picture of a unit; conceptState() is its summary in the shape the app has used since 26 Oct
// (a level 0–4, due, slipping, counts). Which strengths you train and the recall they're due at are Settings → Study →
// Remembering (settings.js memory).

import { KINDS, KNOWN_AT, SKILLS, calibration as calibrate, kindOf, knownUntil, levelOfMemory, recallAt, replay, strengthAt } from "./scheduler.js";
import { getStudySettings, onStudySettingsChange } from "./settings.js";
import { learning } from "./learning.js";
import { canonical, hashText, registerSync } from "../sync.js";
import { SAMPLE_DB_SUFFIX, sampleDb, sampleOn } from "./sample-mode.js";

// The sample learner's own while it's on (sample-mode.js): never yours.
const DB = sampleDb("lexicommons-study");
const STORE = "evidence";
const KEPT = "kept"; // rows a clear took, kept for Undo: { key, row, clear }
const CLEARS = "clears"; // clears: { id, before, at, undone }
const DAY = 86_400_000;
/** How long the rows a clear took are kept, so Undo can bring them back. */
export const UNDO_CLEAR_DAYS = 7;

let cache = [];
// Every row's id here (idOf), kept as the rows come and go, so a change finds what's already here without going over every row.
let ids = new Set();
let kept = new Map(); // key → { key, row, clear }
let clears = new Map(); // id → { id, before, at, undone }
let opening = null;
const changeListeners = new Set();

function db() {
  return (opening ??= openDb(DB).catch((error) => {
    opening = null;
    throw error;
  }));
}
function openDb(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      const evidence = database.objectStoreNames.contains(STORE) ? request.transaction.objectStore(STORE) : database.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      if (!evidence.indexNames.contains("concept")) evidence.createIndex("concept", "concept");
      // Rows by uid, so a row two tabs take from one sync is kept once.
      if (!evidence.indexNames.contains("uid")) evidence.createIndex("uid", "uid");
      if (!database.objectStoreNames.contains(KEPT)) database.createObjectStore(KEPT, { keyPath: "key" });
      if (!database.objectStoreNames.contains(CLEARS)) database.createObjectStore(CLEARS, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * The sample learner's evidence, written before its first start (study/sample-start.js): every row into the sample's own database, which is
 * emptied first. It names no other database, so it can never write yours.
 */
export async function seedSampleEvidence(rows) {
  const database = await openDb(`lexicommons-study${SAMPLE_DB_SUFFIX}`);
  try {
    await new Promise((resolve, reject) => {
      const tx = database.transaction([STORE, KEPT, CLEARS], "readwrite");
      const store = tx.objectStore(STORE);
      store.clear();
      tx.objectStore(KEPT).clear();
      tx.objectStore(CLEARS).clear();
      for (const row of rows) store.add(stripped(row));
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
  return rows.length;
}

/** One transaction over the stores named: action(...stores) returns a function giving the result once it's done. */
function inTx(mode, names, action) {
  return db().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(names, mode);
        const result = action(...names.map((name) => tx.objectStore(name)));
        tx.oncomplete = () => resolve(result?.());
        tx.onerror = tx.onabort = () => reject(tx.error);
      }),
  );
}

// ---------- keys, order and clears ----------

const monthOf = (at) => new Date(at).toISOString().slice(0, 7);
const keys = new WeakMap();
/** A row's key on every device: its month (UTC) and its uid, or for a row from before uids, a hash of its content. */
export function evidenceKey(row) {
  let key = keys.get(row);
  if (!key) {
    const { id: _id, ...content } = row;
    key = `${monthOf(row.at)}:${row.uid ?? `c${hashText(canonical(content))}`}`;
    keys.set(row, key);
  }
  return key;
}
/**
 * A row's one id among the rows here: its uid, or for a row from before uids, its key. Two rows are the same row when these are: a row with a
 * uid is keyed by its month and that uid, so the uid alone says it, and a key from content (c…) never meets a uid.
 */
const idOf = (row) => (row.uid ? `u:${row.uid}` : `k:${evidenceKey(row)}`);
/**
 * Time order, and within a moment the rows' keys. Two rows of one moment are in the same month, so with uids their keys order as the uids do:
 * no key made (a Date and its text for each of a year's rows, at every start).
 */
const inOrder = (a, b) => {
  if (a.at !== b.at) return a.at - b.at;
  const x = a.uid && b.uid ? a.uid : evidenceKey(a);
  const y = a.uid && b.uid ? b.uid : evidenceKey(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

// Rows from one answer share a moment: one random start, then their place, so they keep the order they were recorded in.
const hex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
function uids(n) {
  const start = hex(6);
  return Array.from({ length: n }, (_, i) => `${start}${i.toString(16).padStart(4, "0")}`);
}

/** What the clears in force cover: rows recorded before `before`, cleared by `clear` (the latest one); none: 0. */
function cutoffOf(markers) {
  let out = { before: 0, clear: null, at: 0 };
  for (const m of markers) {
    if (m.undone) continue;
    // The one covering the most, then the latest, then by id: the same on every device.
    if (m.before > out.before || (m.before === out.before && (m.at > out.at || (m.at === out.at && m.id > out.clear)))) out = { before: m.before, clear: m.id, at: m.at };
  }
  return out;
}
/** Whether a clear as the account says it is newer than the one here: later, or at the same time undone. */
const newerClear = (m, here) => !here || m.at > here.at || (m.at === here.at && m.undone && !here.undone);

/** A row as it travels: without this device's own id. */
const stripped = ({ id: _id, ...row }) => row;

// A start reads, checks and indexes a year of evidence a piece at a time, each in its own task, so the page goes on being drawn meanwhile.
const LOAD_PIECE = 15_000;
const breathe = () =>
  typeof MessageChannel === "function"
    ? new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          channel.port1.close();
          resolve();
        };
        channel.port2.postMessage(0);
      })
    : Promise.resolve();

/**
 * Loads every piece of evidence into memory. Call once at start. The rows come out of the database LOAD_PIECE at a time in one
 * transaction (each piece read in its own task), are checked one row per id as they come, are put in order only when they aren't already
 * (they're stored as they were recorded), and indexed a piece at a time.
 */
export async function loadProgress() {
  let rows = [];
  const seen = new Set();
  const twice = [];
  try {
    const database = await db();
    [rows, kept, clears] = await new Promise((resolve, reject) => {
      const tx = database.transaction([STORE, KEPT, CLEARS], "readonly");
      const evidence = tx.objectStore(STORE);
      const out = [];
      const piece = (after) => {
        const request = evidence.getAll(after === null ? null : IDBKeyRange.lowerBound(after, true), LOAD_PIECE);
        request.onsuccess = () => {
          const got = request.result;
          // One row per id: two tabs taking the same rows from a sync at once could each have added them.
          for (const row of got) {
            const id = idOf(row);
            if (seen.has(id)) twice.push(row.id);
            else {
              seen.add(id);
              out.push(row);
            }
          }
          if (got.length === LOAD_PIECE) piece(got[got.length - 1].id);
        };
      };
      piece(null);
      const b = tx.objectStore(KEPT).getAll();
      const c = tx.objectStore(CLEARS).getAll();
      tx.oncomplete = () => resolve([out, new Map((b.result ?? []).map((e) => [e.key, e])), new Map((c.result ?? []).map((m) => [m.id, m]))]);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } catch {
    // No IndexedDB (a private window): progress lasts for this visit only.
    rows = [];
    seen.clear();
    kept = new Map();
    clears = new Map();
  }
  if (twice.length) inTx("readwrite", [STORE], (store) => void twice.forEach((id) => store.delete(id))).catch(() => {});
  await breathe();
  let ordered = true;
  for (let i = 1; i < rows.length && ordered; i++) ordered = inOrder(rows[i - 1], rows[i]) <= 0;
  if (!ordered) {
    await breathe();
    rows.sort(inOrder);
  }
  // Indexed a piece at a time, then taken on at once.
  const unitsBy = new Map();
  const itemsBy = new Map();
  for (let i = 0; i < rows.length; i += LOAD_PIECE) {
    await breathe();
    for (const row of rows.slice(i, i + LOAD_PIECE)) indexInto(unitsBy, itemsBy, row);
  }
  cache = rows;
  ids = seen;
  byUnit = unitsBy;
  byItem = itemsBy;
  memories.clear();
  version++;
  // A clear covers rows another tab added after it. (Kept rows go only once the account confirms their clear's 7 days
  // are up: refreshClears.)
  const { before } = cutoffOf(clears.values());
  if (cache.some((row) => row.at < before) || [...kept.values()].some((e) => e.row.at >= before)) commit({ settle: true });
  return cache.length;
}

// ---------- changing it: memory at once, then IndexedDB, then the app's other tabs ----------

// The sample learner's tabs talk among themselves, never to yours (sample-mode.js).
const tabs = typeof BroadcastChannel === "function" ? new BroadcastChannel(sampleDb("lx-progress")) : null;
if (tabs) tabs.onmessage = (event) => change(event.data, { fromTab: true });
let saving = Promise.resolve();
let unsaved = 0;
if (typeof addEventListener === "function") addEventListener("beforeunload", (event) => {
  if (!unsaved) return;
  event.preventDefault();
  event.returnValue = "";
});

/**
 * A change in memory: wipe (everything on this device), put (rows; one already here by key or uid stays as it is),
 * markers (clears made, or undone), settle (apply the clears in force again), forget (kept rows whose Undo has ended).
 * The clears in force decide: a row recorded before the latest one is kept for Undo instead, and kept rows it no longer
 * covers (an Undo) come back. Returns whether rows moved either way.
 */
function change({ wipe = false, put = [], markers = [], settle = false, forget = [] }, { fromTab = false } = {}) {
  if (wipe) {
    cache = [];
    kept = new Map();
    clears = new Map();
  }
  for (const m of markers) if (newerClear(m, clears.get(m.id))) clears.set(m.id, m);
  for (const key of forget) kept.delete(key);
  const { before, clear } = cutoffOf(clears.values());
  // Kept rows belong to the clear that covers them now (a later clear renews their 7 days).
  for (const e of kept.values()) if (e.row.at < before && e.clear !== clear) e.clear = clear;
  // What's here already: the rows' ids (kept as they come and go) and the kept rows' (few, but for a week after a clear).
  const keptIds = new Set();
  if (put.length) for (const e of kept.values()) keptIds.add(idOf(e.row));
  const taken = new Set();
  const fresh = [];
  for (const row of put) {
    const id = idOf(row);
    if (ids.has(id) || keptIds.has(id) || taken.has(id)) continue;
    taken.add(id);
    if (row.at < before) kept.set(evidenceKey(row), { key: evidenceKey(row), row: stripped(row), clear });
    else fresh.push(row);
  }
  let moved = false;
  if (markers.length || settle || wipe) {
    const staying = [];
    for (const row of cache) {
      if (row.at < before) kept.set(evidenceKey(row), { key: evidenceKey(row), row: stripped(row), clear });
      else staying.push(row);
    }
    moved = staying.length !== cache.length;
    cache = staying;
    for (const e of [...kept.values()]) {
      if (e.row.at >= before) {
        kept.delete(e.key);
        cache.push({ ...e.row });
        moved = true;
      }
    }
  }
  // New rows at the end are indexed as they come; anything else is ordered and indexed again.
  const appended = !moved && !wipe && fresh.length > 0 && (cache.length === 0 || inOrder(cache[cache.length - 1], fresh[0]) <= 0) && fresh.every((row, i) => i === 0 || inOrder(fresh[i - 1], row) <= 0);
  // One by one: spread into push, a batch past the engine's limit on arguments (a year's answers from a sync; Safari's is lower) throws.
  for (const row of fresh) cache.push(row);
  if (moved || wipe) ids = new Set(cache.map(idOf));
  else for (const row of fresh) ids.add(idOf(row));
  // What the listeners are told changed: the units new rows are for (at the end, answers; or among the rest, a sync's from before), or (null)
  // anything at all (rows taken by a clear or brought back by an Undo, everything wiped).
  let units = [];
  if (appended) {
    units = [...new Set(fresh.map(addToIndex))];
    version++;
  } else if (moved || wipe || fresh.length) {
    cache.sort(inOrder);
    reindex();
    units = moved || wipe ? null : [...new Set(fresh.map((row) => unitKeyOf(langOf(normalize(row)), normalize(row).concept)))];
  }
  const changed = moved || wipe || fresh.length > 0 || markers.length > 0 || forget.length > 0;
  if (!changed) return false;
  const detail = { units };
  if (fromTab) {
    // Another tab has saved it and asked for a sync if one is needed.
    const was = applying;
    applying = true;
    try {
      changeListeners.forEach((fn) => fn(detail));
    } finally {
      applying = was;
    }
  } else changeListeners.forEach((fn) => fn(detail));
  return moved;
}

/**
 * Makes a change here (change) and saves it in one transaction that reads the clears saved there first, so it holds
 * whatever another tab did: a row a clear covers goes to the kept rows, one whose uid is already saved isn't added
 * twice, and (with markers, settle or wipe) every saved row is put on the right side of the clears in force. Then the
 * other tabs are told.
 */
async function commit(changes) {
  change(changes);
  const { wipe = false, put = [], markers = [], settle = false, forget = [] } = changes;
  const write = () => inTx("readwrite", [STORE, KEPT, CLEARS], (store, keptStore, clearStore) => {
    if (wipe) {
      store.clear();
      keptStore.clear();
      clearStore.clear();
    }
    for (const key of forget) keptStore.delete(key);
    // A clear only moves forward (a late answer can't undo an Undo): each read, then written if newer, in turn; then
    // the clears saved are read, these among them.
    const nextMarker = (i) => {
      if (i === markers.length) return settled();
      const there = clearStore.get(markers[i].id);
      there.onsuccess = () => {
        if (newerClear(markers[i], there.result)) clearStore.put(markers[i]);
        nextMarker(i + 1);
      };
    };
    const settled = () => {
      const saved = clearStore.getAll();
      saved.onsuccess = () => onSaved(saved);
    };
    nextMarker(0);
    const onSaved = (saved) => {
      const { before, clear } = cutoffOf(saved.result ?? []);
      const keep = (row) => keptStore.put({ key: evidenceKey(row), row: stripped(row), clear });
      const add = (row) => {
        if (row.at < before) return keep(row);
        if (row.uid === undefined) return void (store.add(stripped(row)).onsuccess = (e) => (row.id = e.target.result));
        const there = store.index("uid").getKey(row.uid);
        there.onsuccess = () => {
          if (there.result !== undefined) row.id = there.result;
          else store.add(stripped(row)).onsuccess = (e) => (row.id = e.target.result);
        };
      };
      if (!(markers.length || settle || wipe)) return void put.forEach(add);
      // Every saved row on the right side of the clears: covered rows kept, uncovered kept rows back; then the new ones.
      store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.at < before) {
            keep(cursor.value);
            cursor.delete();
          }
          return cursor.continue();
        }
        keptStore.openCursor().onsuccess = (e) => {
          const at = e.target.result;
          if (!at) return void put.forEach(add);
          if (at.value.row.at >= before) {
            add(at.value.row);
            at.delete();
          } else if (at.value.clear !== clear) at.update({ ...at.value, clear });
          at.continue();
        };
      };
    };
  });
  // A device with no database at all (a private window) keeps this visit's progress in memory, as before.
  if (typeof indexedDB === "undefined") {
    await write().catch(() => {});
    tabs?.postMessage({ wipe, put, markers, settle, forget });
    return;
  }
  // A save the database refuses (its storage full) is tried again, in order, so a later change never lands before it
  // and a retry can't undo a clear; leaving the page warns while one waits. Callers wait for this save's first try
  // only, and not at all behind a stuck one, so a full disk never holds up a session, an undo or a sync.
  const stuck = unsaved > 0;
  unsaved++;
  let tried;
  const firstTry = new Promise((resolve) => (tried = resolve));
  const save = async () => {
    for (let wait = 1000; ; wait = Math.min(wait * 2, 60_000)) {
      try {
        await write();
        break;
      } catch (error) {
        tried();
        console.warn("Lexicommons: progress couldn't be saved on this device; trying again:", error);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    tried();
    unsaved--;
    tabs?.postMessage({ wipe, put, markers, settle, forget });
  };
  saving = saving.then(save, save);
  return stuck ? undefined : firstTry;
}

/** How strong a test each kind of step is, and what it trains (session.js, practice cards). */
export const TESTS = {
  choose: { test: "pick", skill: "read" },
  arrange: { test: "build", skill: "read" },
  "arrange-english": { test: "recall", skill: "say" },
  place: { test: "build", skill: "read" },
  fill: { test: "pick", skill: "read" },
  meaning: { test: "pick", skill: "read" },
  type: { test: "recall", skill: "say" },
  write: { test: "recall", skill: "say" },
  "type-heard": { test: "recall", skill: "hear" },
  "listen-type": { test: "recall", skill: "hear" },
  // The typing twins: a word typed from its English, a sentence's gap typed from its English (both saying it), a heard sentence's gap typed (hearing it).
  "type-word": { test: "recall", skill: "say" },
  "type-gap": { test: "recall", skill: "say" },
  "hear-gap": { test: "recall", skill: "hear" },
  // The speaking twins: a word said from its English (saying it), a word heard and said back (how you sound, as Repeat after).
  "say-word": { test: "recall", skill: "say" },
  "repeat-word": { test: "recall", skill: "sound" },
  "listen-meaning": { test: "pick", skill: "hear" },
  // A script's letter (a pack that teaches one: kana), shown and how it's said typed: reading it.
  "type-sound": { test: "recall", skill: "read" },
  "listen-order": { test: "build", skill: "hear" },
  match: { test: "pick", skill: "read" },
  card: { test: "self", skill: "read" },
  meet: { test: "self", skill: "read" },
  see: { test: "pick", skill: "read" },
  // A lesson you jumped past and said you know: your word for it, as a card's "I knew it" is.
  marked: { test: "self", skill: "read" },
  word: { test: "pick", skill: "read" },
  translate: { test: "build", skill: "read" },
  say: { test: "recall", skill: "say" },
  "read-aloud": { test: "recall", skill: "sound" },
  repeat: { test: "recall", skill: "sound" },
};

const OLD_SKILL = { reading: "read", listening: "hear", writing: "say", speaking: "say" };

/** A row in the current format (rows from before 27 Oct 2026 are read in it). */
export function normalize(row) {
  if (row.v === 2) return row;
  const skill = OLD_SKILL[row.skill] ?? row.skill ?? "read";
  const test = row.test ?? "recall";
  if (row.outcome === "seen") return { ...row, v: 2, skill, outcome: "met", test, help: "none" };
  // The old "hint": in a game, the literal line (it shows the order, the patterns' answer); from your AI, a nudge.
  if (row.outcome === "hint") return { ...row, v: 2, skill, outcome: "right", test, help: row.source === "ai" ? "nudge" : "answer" };
  return { ...row, v: 2, skill, test, help: row.help ?? "none" };
}

/** A row's review grade: again · hard · good, or null when it isn't a review (exposure, pronunciation). */
export function gradeOf(input) {
  const row = normalize(input);
  if (row.outcome === "met" || row.skill === "sound") return null;
  if (row.outcome === "wrong") return row.test === "free" && row.marked === false ? "hard" : "again";
  if (row.help === "answer") return "again";
  if (row.help === "nudge" || row.test === "pick" || row.test === "self" || row.test === "judged") return "hard";
  return "good";
}

// ---------- the index: rows by unit and by item, and each unit's replayed memory ----------

// Units and items are keyed by language as well ("nl w:in" isn't "de w:in"); a row without one is Dutch, as every row
// from before languages were added is.
let version = 0;
let epoch = 0; // evidenceEpoch
let byUnit = new Map();
let byItem = new Map();
const memories = new Map();
/** A row's language: its own, or Dutch for a row from before rows had one. */
export const langOf = (row) => row.lang ?? "nl";
const keyOf = (lang, id) => `${lang} ${id}`;
// A pack's own pattern that's the same as one of the shared grammar's (pack-format.js `same`): its evidence is the
// shared one's, one unit. The rows keep what they were recorded as; only how they're counted follows the aliases, so
// an alias taken away splits them again. content.js sets them from the packs of the language.
const aliases = new Map(); // lang → { "p:<own id>": "p:<shared id>" }
/** The unit a unit's evidence counts for: the shared pattern a pack's own one is the same as, or itself. */
export const canonicalUnit = (unit, lang = learning()) => {
  const map = aliases.get(lang);
  return map && Object.hasOwn(map, unit) ? map[unit] : unit;
};
const unitKeyOf = (lang, unit) => keyOf(lang, canonicalUnit(unit, lang));
/**
 * A language's aliases ({ "p:<own id>": "p:<shared id>" }): the evidence is counted again when they change. Returns
 * whether they did.
 */
export function setUnitAliases(lang, map = {}) {
  const next = Object.fromEntries(Object.entries(map).filter(([own, shared]) => typeof own === "string" && typeof shared === "string" && own !== shared));
  if (JSON.stringify(next) === JSON.stringify(aliases.get(lang) ?? {})) return false;
  if (Object.keys(next).length) aliases.set(lang, next);
  else aliases.delete(lang);
  reindex();
  epoch++; // which units the evidence counts for changed, and no listener is told: what's kept per unit is worked out again
  return true;
}

/** Indexes one row into these maps; returns its unit's key ("<lang> <unit>"). */
function indexInto(units, items, row) {
  const r = normalize(row);
  const unitKey = unitKeyOf(langOf(r), r.concept);
  const list = units.get(unitKey);
  if (list) list.push(r);
  else units.set(unitKey, [r]);
  if (r.item) {
    const itemKey = keyOf(langOf(r), r.item);
    const rows = items.get(itemKey);
    if (rows) rows.push(r);
    else items.set(itemKey, [r]);
  }
  return unitKey;
}

/** Indexes one row; returns its unit's key ("<lang> <unit>"). */
function addToIndex(row) {
  const unitKey = indexInto(byUnit, byItem, row);
  memories.delete(unitKey);
  return unitKey;
}

function reindex() {
  byUnit = new Map();
  byItem = new Map();
  memories.clear();
  for (const row of cache) addToIndex(row);
  version++;
}

/** A number that changes whenever the evidence does (for anything that keeps its own sums). */
export const evidenceVersion = () => version;
/**
 * A number that changes when which units the evidence counts for changes (a pack's patterns made the same as the shared grammar's, or apart
 * again: setUnitAliases), which no change listener hears: what's kept per unit may all have changed.
 */
export const evidenceEpoch = () => epoch;

// Saying it counts as spoken when it was: your AI's rows say how; Study's Say it is always spoken.
const spokenRow = (row) => row.how === "spoken" || row.activity === "say";

function reviewsOf(rows, until) {
  const reviews = [];
  for (const row of rows) {
    if (row.at >= until) continue;
    const grade = gradeOf(row);
    if (grade) reviews.push({ at: row.at, skill: row.skill, grade, spoken: spokenRow(row) });
  }
  return reviews;
}

// A unit's memory from its evidence (before `until`): replayed once per change and kept.
function memoryOf(lang, unit, until = Infinity) {
  const key = unitKeyOf(lang, unit);
  const rows = byUnit.get(key) ?? [];
  if (until !== Infinity) return replay(unit, reviewsOf(rows, until));
  if (!memories.has(key)) memories.set(key, replay(unit, reviewsOf(rows, Infinity)));
  return memories.get(key);
}

// Which strengths you train and the recall they're due at (Settings → Study → Remembering).
let memorySettings = getStudySettings().memory;
onStudySettingsChange((settings) => (memorySettings = settings.memory));
const trained = () => SKILLS.filter((skill) => memorySettings.train[skill]);
/** The strengths you train and the recall they're due at (Settings → Study → Remembering), as unitState uses them: { train, target }. */
export const memoryNow = () => ({ train: trained(), target: memorySettings.target });

/** Records evidence (rows as above, without at). Kept in memory at once; saved in the background. */
export function record(events) {
  const at = Date.now();
  const ids = uids(events.length);
  const rows = events.map((event, i) => {
    const row = { at, v: 2, skill: "read", test: "recall", help: "none", ...event, lang: event.lang ?? learning(), uid: ids[i] };
    // What the scheduler predicted for this strength, before this answer counts.
    const memory = gradeOf(row) && kindOf(row.concept) ? memoryOf(langOf(row), row.concept).strengths[normalize(row).skill] : null;
    if (memory) row.p = Math.round(recallAt(kindOf(row.concept), memory.card, row.at) * 10000) / 10000;
    return row;
  });
  commit({ put: rows });
  return rows;
}

/** Every row, in the current format. */
export const allEvidence = () => cache.map(normalize);

/** The rows from `since` on, in the current format: the cache is kept in time order, so only those are read (a year's rows are 170,000). */
export function evidenceSince(since) {
  let lo = 0;
  let hi = cache.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cache[mid].at < since) lo = mid + 1;
    else hi = mid;
  }
  return cache.slice(lo).map(normalize);
}

/**
 * When you last answered in a language before `until` (ms), or -Infinity: the cache is kept in time order, so it's read back from `until` only
 * as far as that row. (Coming back, plan.js, asks for the day before the recent ones.)
 */
export function latestBefore(until, lang) {
  let lo = 0;
  let hi = cache.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cache[mid].at < until) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo - 1; i >= 0; i--) if (langOf(cache[i]) === lang) return cache[i].at;
  return -Infinity;
}

/** The rows from before `until`, in the current format: the cache is kept in time order, so only those are read. */
export function evidenceBefore(until) {
  let lo = 0;
  let hi = cache.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cache[mid].at < until) lo = mid + 1;
    else hi = mid;
  }
  return cache.slice(0, lo).map(normalize);
}

/** The last n rows, in the current format, oldest first. */
export const recentEvidence = (n) => cache.slice(-n).map(normalize);

/** One unit's rows in a language, in the current format, oldest first. */
export const unitEvidence = (unit, lang = learning()) => [...(byUnit.get(unitKeyOf(lang, unit)) ?? [])];

/** One item's rows in a language (a sentence, a practice line), in the current format, oldest first. */
export const itemEvidence = (item, lang = learning()) => [...(byItem.get(keyOf(lang, item)) ?? [])];

/** Every unit with any evidence in a language. */
export const studiedUnits = (lang = learning()) => [...byUnit.keys()].filter((key) => key.startsWith(`${lang} `)).map((key) => key.slice(lang.length + 1));

/**
 * What a unit's evidence says that stays the same until it changes (know/word-index.js keeps it): when it was first met (its first row of any
 * kind), first and last asked (graded; 0: never), and for each strength tested:
 *   level, until   now: its level and the moment it stops being known (scheduler.js knownUntil), so it's known at a moment t when t < until;
 *   stability, last  its card's stability and last review (ms), for when it's due (scheduler.js dueAtOf, at the target recall then);
 *   well           every stretch it was known at level `well` or more, as unitState would say at each moment t from the evidence before t:
 *                  [[from, to]] in whole ms, from inclusive, to exclusive, in order (the last one may still be going: to is when it'll end);
 *   recalled       every stretch it was known at all (any level), the same way (recalledOver's question, a stretch at a time).
 * And levels: its level (its strongest strength's, as unitState gives it) after each answer that changed it, [[at, level]] in order, so its level
 * from the evidence before t is the last one at before t (0 before any). One replay, which unitState then has too.
 * { metAt, firstAt, lastAt, levels, strengths: { read: { level, until, well } | null, hear, say } }
 */
export function unitLasting(unit, lang = learning(), { well = 3 } = {}) {
  const kind = kindOf(unit);
  const key = unitKeyOf(lang, unit);
  const rows = byUnit.get(key) ?? [];
  let firstAt = 0;
  let lastAt = 0;
  for (const row of rows) {
    if (!gradeOf(row)) continue;
    firstAt ||= row.at;
    lastAt = Math.max(lastAt, row.at);
  }
  const spans = Object.fromEntries(SKILLS.map((skill) => [skill, []]));
  const recalled = Object.fromEntries(SKILLS.map((skill) => [skill, []]));
  const strengths = Object.fromEntries(SKILLS.map((skill) => [skill, null]));
  const levels = [];
  if (kind) {
    // At a moment t the evidence before t counts: after an answer at m, its state holds from m + 1 to the next answer's moment, inclusive.
    let before = null; // { at, memories } after the moment before (each memory a new object when it changes, so these stay as they were)
    const add = (list, from, end) => {
      const last = list.at(-1);
      if (last && last[1] === from) last[1] = end;
      else list.push([from, end]);
    };
    const close = (to) => {
      for (const skill of SKILLS) {
        const memory = before.memories[skill];
        if (!memory) continue;
        const from = before.at + 1;
        const end = Math.min(knownUntil(kind, memory.card), to);
        if (end <= from) continue;
        add(recalled[skill], from, end);
        if (levelOfMemory(kind, memory) >= well) add(spans[skill], from, end);
      }
    };
    const memory = replay(unit, reviewsOf(rows, Infinity), {
      after: (at, now) => {
        if (before) close(at + 1);
        before = { at, memories: Object.fromEntries(SKILLS.map((skill) => [skill, now[skill]])) };
        const level = Math.max(0, ...SKILLS.map((skill) => (now[skill] ? levelOfMemory(kind, now[skill]) : 0)));
        if (level !== (levels.at(-1)?.[1] ?? 0)) levels.push([at, level]);
      },
    });
    if (before) close(Infinity);
    memories.set(key, memory);
    for (const skill of SKILLS) {
      const card = memory.strengths[skill]?.card;
      if (card) strengths[skill] = { level: levelOfMemory(kind, memory.strengths[skill]), until: knownUntil(kind, card), stability: card.stability, last: +card.last_review, well: spans[skill], recalled: recalled[skill] };
    }
  }
  return { metAt: rows[0]?.at ?? 0, firstAt, lastAt, levels, strengths };
}

/**
 * A short fingerprint of a language's evidence on this device (its rows: how many, the latest, and their ids folded together), which changes
 * when any row of it comes or goes: what's kept from the evidence (know/word-index.js) is still its own while this is the same.
 */
export function evidenceStamp(lang = learning()) {
  let n = 0;
  let latest = 0;
  let sum = 0;
  let mix = 0;
  for (const row of cache) {
    if (langOf(row) !== lang) continue;
    n++;
    latest = Math.max(latest, row.at);
    sum = (sum + (row.at % 2147483647)) % 2147483647;
    const id = row.uid ?? evidenceKey(row);
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
    mix ^= h;
  }
  return `${n} ${latest} ${sum} ${mix >>> 0}`;
}

/**
 * Everything about a unit at a moment (optionally from its evidence before `until` only):
 *   strengths  { read, hear, say }: each strength's state (scheduler.js strengthAt) or null when never tested
 *   trained    the strengths you train (a strength you don't is never due)
 *   level      0–4: its strongest strength's level (0: never tested)
 *   due        a trained strength is due; dueAt: the soonest a trained strength is due (0: none)
 *   slipping   due, and that strength had been learned (level 2 or more)
 *   leech      a strength missed on 8 different days after it was learned
 *   reviews, right, wrong   its graded rows (right: good or hard); met: its exposure rows; firstAt, lastAt: graded
 */
export function unitState(unit, { lang = learning(), now = Date.now(), until = Infinity } = {}) {
  const kind = kindOf(unit);
  const memory = kind ? memoryOf(lang, unit, until) : { strengths: {} };
  const train = trained();
  const strengths = {};
  for (const skill of SKILLS) strengths[skill] = memory.strengths[skill] ? strengthAt(kind, memory.strengths[skill], now, memorySettings.target) : null;
  let reviews = 0;
  let right = 0;
  let wrong = 0;
  let met = 0;
  let firstAt = 0;
  let lastAt = 0;
  for (const row of byUnit.get(unitKeyOf(lang, unit)) ?? []) {
    if (row.at >= until) continue;
    const grade = gradeOf(row);
    if (!grade) {
      if (row.outcome === "met") met++;
      continue;
    }
    reviews++;
    if (grade === "again") wrong++;
    else right++;
    firstAt ||= row.at;
    lastAt = Math.max(lastAt, row.at);
  }
  const started = SKILLS.filter((skill) => strengths[skill]);
  const dueNow = started.filter((skill) => train.includes(skill) && strengths[skill].due);
  const dueAts = started.filter((skill) => train.includes(skill)).map((skill) => strengths[skill].dueAt);
  return {
    unit,
    lang,
    kind: KINDS[kind] ?? null,
    strengths,
    trained: train,
    level: Math.max(0, ...started.map((skill) => strengths[skill].level)),
    isNew: reviews === 0,
    due: dueNow.length > 0,
    dueAt: dueAts.length ? Math.min(...dueAts) : 0,
    slipping: dueNow.some((skill) => strengths[skill].level >= 2),
    leech: started.some((skill) => strengths[skill].leech),
    reviews,
    right,
    wrong,
    met,
    firstAt,
    lastAt,
  };
}

/**
 * How many of `units` you'd recall at each of `ats` (times, ascending), as unitState counts it there: a strength you train known, from the
 * evidence before that time. For a chart over time: each unit is replayed once per stretch of its evidence that a time sees, not once per time
 * (a word with three answers is replayed at most three times however many days the chart has).
 */
export function recalledOver(units, ats, { lang = learning() } = {}) {
  const train = trained();
  const counts = ats.map(() => 0);
  for (const unit of units) {
    const kind = kindOf(unit);
    if (!kind) continue;
    const rows = byUnit.get(unitKeyOf(lang, unit)) ?? [];
    let seen = -1;
    let memory = null;
    ats.forEach((at, i) => {
      let before = 0;
      for (const row of rows) if (row.at < at && gradeOf(row)) before++;
      if (!before) return;
      if (before !== seen) {
        memory = replay(unit, reviewsOf(rows, at));
        seen = before;
      }
      if (train.some((skill) => memory.strengths[skill] && strengthAt(kind, memory.strengths[skill], at, memorySettings.target).known)) counts[i]++;
    });
  }
  return counts;
}

/**
 * At each of `ats` (times, ascending), which of `units` you'd know well by each strength: known there, at `level` or more (know/summary.js
 * understood's bar), from the evidence before that time; each unit replayed once per stretch of its evidence, as recalledOver does. For
 * Over time's page. { read: [Set], hear: [Set], say: [Set] }, a set of units per time.
 */
export function strengthsOver(units, ats, { lang = learning(), level = 0 } = {}) {
  const out = Object.fromEntries(SKILLS.map((skill) => [skill, ats.map(() => new Set())]));
  for (const unit of units) {
    const kind = kindOf(unit);
    if (!kind) continue;
    const rows = byUnit.get(unitKeyOf(lang, unit)) ?? [];
    // Its graded answers' times, in order: how many came before each time is a pointer that only moves on (ats ascend).
    const graded = rows.filter((row) => gradeOf(row)).map((row) => row.at).sort((a, b) => a - b);
    let before = 0;
    let seen = -1;
    let memory = null;
    // Strengths that won't be known again this stretch: recall only falls between answers, and level only moves with one.
    let gone = new Set();
    ats.forEach((at, i) => {
      while (before < graded.length && graded[before] < at) before++;
      if (!before) return;
      if (before !== seen) {
        memory = replay(unit, reviewsOf(rows, at));
        seen = before;
        gone = new Set();
      }
      for (const skill of SKILLS) {
        const strength = memory.strengths[skill];
        if (!strength || gone.has(skill)) continue;
        const { card } = strength;
        // Known, as strengthAt says: recall at least KNOWN_AT and stability at least a day; at `level` or more.
        if (card.stability < 1 || levelOfMemory(kind, strength) < level || recallAt(kind, card, at) < KNOWN_AT) gone.add(skill);
        else out[skill][i].add(unit);
      }
    });
  }
  return out;
}

/**
 * A concept's summary (optionally only evidence before `until`, or one strength's view with `skill`): level 0–4,
 * due, slipping, isNew, dueAt, lastAt, and its counts: seen (graded rows), met (exposure rows), right (graded good or
 * hard) and wrong (graded again).
 */
export function conceptState(concept, { lang = learning(), now = Date.now(), until = Infinity, skill } = {}) {
  const state = unitState(concept, { lang, now, until });
  const one = skill ? state.strengths[skill] : null;
  const view = skill
    ? { level: one?.level ?? 0, due: Boolean(one?.due) && state.trained.includes(skill), dueAt: one?.dueAt ?? 0, slipping: Boolean(one?.due) && state.trained.includes(skill) && one.level >= 2 }
    : { level: state.level, due: state.due, dueAt: state.dueAt, slipping: state.slipping };
  return {
    concept,
    ...view,
    seen: state.reviews,
    met: state.met,
    right: state.right,
    wrong: state.wrong,
    lastAt: state.lastAt,
    isNew: state.isNew,
  };
}

/** A strength's predicted recall right now (0–1), or null when it has never been tested. */
export const recallOf = (unit, { skill = "read", lang = learning(), now = Date.now() } = {}) => unitState(unit, { lang, now }).strengths[skill]?.recall ?? null;

/** You know a unit by a strength: its recall is at least 80% and would last a day, after at least one real test. */
export const knows = (unit, { skill = "read", lang = learning(), now = Date.now() } = {}) => Boolean(unitState(unit, { lang, now }).strengths[skill]?.known);

/** The level a word's read strength reaches before its reading goes (Strong: levelOfMemory, stability of LEVEL_DAYS[1] days or more). */
export const READING_HIDES_AT = 3;

/**
 * Whether a word's reading (kana or pinyin over it, Arabic's and Hebrew's vowel marks, Latin's long vowels, Russian's stress, a
 * romanization) stays hidden: once you know the word well, its read strength Strong (READING_HIDES_AT), never on `known`, which one
 * right answer gives a new word (FSRS puts its first stability past a day). A tap still shows it. The one rule for every screen that
 * shows readings: Study's steps and choices, a word named anywhere (content.js shownName), Explore's previews and the reader.
 */
export const readingHides = (unit, { lang = learning(), now = Date.now() } = {}) => (unitState(unit, { lang, now }).strengths.read?.level ?? 0) >= READING_HIDES_AT;

/** The meaning to show for a concept right now: new, slipping, or none. */
export function meaningOf(concept, lang = learning()) {
  const state = conceptState(concept, { lang });
  return state.isNew ? "new" : state.slipping ? "slipping" : null;
}

/**
 * How well the scheduler's predictions have held, over every review from your own answers. stored: the predictions
 * kept on the rows when they were recorded (what it really predicted); otherwise replayed with today's model.
 */
export function calibration({ stored = true } = {}) {
  if (stored) {
    const reviews = [];
    for (const row of cache) {
      const grade = row.p == null ? null : gradeOf(row);
      if (grade) reviews.push({ p: row.p, grade });
    }
    return calibrate(reviews);
  }
  return calibrate(
    [...byUnit.keys()].flatMap((key) => {
      const [lang, unit] = [key.slice(0, key.indexOf(" ")), key.slice(key.indexOf(" ") + 1)];
      return kindOf(unit) ? memoryOf(lang, unit).reviews : [];
    }),
  );
}

// The account's side of clears (src/progress-clears.ts): [{ id, before, at, undone }].
async function account(path, body) {
  const response = await fetch(path, { method: body ? "POST" : "GET", credentials: "same-origin", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `Your account didn't answer (${response.status}).`);
  return data;
}
const CLEAR_ID = /^[0-9a-f]{16}$/;
const clearOf = (value) =>
  value && typeof value === "object" && CLEAR_ID.test(value.id ?? "") && time(value.before) && time(value.at) && value.before <= value.at && typeof value.undone === "boolean"
    ? { id: value.id, before: value.before, at: value.at, undone: value.undone }
    : null;
// Which clears the account says are final (in force and past Undo): the rows they took can go.
const finalIds = (listed) => new Set((Array.isArray(listed) ? listed : []).filter((v) => v?.final === true && v.undone === false).map((v) => v.id));

/**
 * Takes the account's clears (made or undone on any device), then lets go of kept rows whose clear the account says is
 * final (in force, and past Undo by enough that none can still be on its way). Resolves to how many clears changed here.
 */
export async function refreshClears() {
  // The sample learner asks your account nothing (sample-mode.js).
  if (sampleOn()) return 0;
  const answer = await account("/api/progress/clears");
  const listed = (Array.isArray(answer) ? answer : []).map(clearOf).filter(Boolean);
  const markers = listed.filter((m) => newerClear(m, clears.get(m.id)));
  // The clears first, so each kept row belongs to the clear that covers it now; then what's final goes.
  if (markers.length) await commit({ markers });
  const final = finalIds(answer);
  const confirmed = [...kept.values()].filter((e) => final.has(e.clear) && !clears.get(e.clear)?.undone);
  if (confirmed.length) await commit({ forget: confirmed.map((e) => e.key), settle: true });
  return markers.length;
}

/**
 * Deletes all evidence on this device. everywhere (with your own storage connected): a clear your account records,
 * covering every answer recorded before now on every device using the storage (by each device's clock), each device
 * keeping the rows it took for Undo (undoClear) for 7 days; answers recorded after it stay. It needs a connection.
 */
export async function clearProgress({ everywhere = false } = {}) {
  if (!everywhere) return commit({ wipe: true });
  if (sampleOn()) throw new Error("Turn the sample learner off first: clearing everywhere is your own progress.");
  // Later than every row here (one from a device whose clock ran ahead too), so it covers them all.
  let before = Date.now();
  for (const row of cache) before = Math.max(before, row.at + 1);
  const made = clearOf(await account("/api/progress/clears", { id: hex(8), before }));
  if (!made) throw new Error("Your account's answer didn't make sense; nothing was cleared.");
  await commit({ markers: [made] });
}

/** The clears Undo can still bring back, newest first: [{ id, at, rows (kept here), until }]. */
export function clearedProgress(now = Date.now()) {
  const rows = new Map();
  for (const e of kept.values()) rows.set(e.clear, (rows.get(e.clear) ?? 0) + 1);
  return [...clears.values()]
    .filter((m) => !m.undone && rows.get(m.id) && now - m.at <= UNDO_CLEAR_DAYS * DAY)
    .sort((a, b) => b.at - a.at)
    .map((m) => ({ id: m.id, at: m.at, rows: rows.get(m.id), until: m.at + UNDO_CLEAR_DAYS * DAY }));
}

/**
 * Undoes a clear (clearedProgress's id) on every device using your storage: the rows it took come back, here now and on
 * each of them as it syncs. Resolves to how many came back here.
 */
export async function undoClear(id) {
  if (sampleOn()) throw new Error("Turn the sample learner off first: that clear was your own progress.");
  const m = clears.get(id);
  if (!m || m.undone) return 0;
  const before = cache.length;
  const undone = clearOf(await account(`/api/progress/clears/${id}/undo`, {}));
  if (!undone?.undone) throw new Error("Your account's answer didn't make sense; nothing came back.");
  await commit({ markers: [undone] });
  return cache.length - before;
}

/**
 * Calls fn when this device's evidence changes (an answer recorded, a clear, an Undo, a sync), with { units }: the units whose rows changed, as
 * "<lang> <unit>" (new rows: answers, a sync's or another tab's), or null when anything may have (a clear, an Undo, everything wiped).
 * Returns a function to stop.
 */
export function onProgressChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

// ---------- syncing (sync.js) ----------

const MAX_TIME = 8.64e15;
const time = (v) => Number.isFinite(v) && v > 0 && v < MAX_TIME;
const text = (max) => (v) => typeof v === "string" && v.length <= max;
const oneOf = (...values) => (v) => values.includes(v);
/** Each field a row may carry and what it may be (normalize() reads the old ones). */
const ROW_FIELDS = {
  at: time,
  v: oneOf(1, 2),
  lang: (v) => typeof v === "string" && /^[a-z]{2,3}(?:-[A-Za-z0-9]{1,8}){0,2}$/.test(v),
  concept: (v) => typeof v === "string" && v.length > 0 && v.length <= 300,
  skill: oneOf("read", "hear", "say", "sound", "reading", "listening", "writing", "speaking"),
  outcome: oneOf("right", "wrong", "met", "seen", "hint"),
  test: oneOf("free", "recall", "build", "pick", "self", "judged"),
  help: oneOf("none", "nudge", "answer"),
  marked: (v) => typeof v === "boolean",
  how: oneOf("typed", "spoken"),
  p: (v) => Number.isFinite(v) && v >= 0 && v <= 1,
  uid: (v) => typeof v === "string" && /^[0-9a-f]{16}$/.test(v),
  activity: text(80),
  item: text(300),
  source: text(40),
  client: text(80),
  practice: text(80),
  note: text(1200),
  said: text(1200),
  slip: (v) => v === true,
};
/**
 * A row from another device as it may be kept here, or null: a time and a concept, every field it shares with
 * ROW_FIELDS as that says, and any other (a row from an older or newer app) plain and short: at most 40 fields.
 */
export function cleanRow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value).filter(([key]) => key !== "id");
  if (entries.length > 40 || value.at === undefined || value.concept === undefined) return null;
  for (const [key, field] of entries) {
    const rule = Object.hasOwn(ROW_FIELDS, key) ? ROW_FIELDS[key] : (v) => key.length <= 40 && (v === null || typeof v === "boolean" || Number.isFinite(v) || text(300)(v));
    if (!rule(field)) return null;
  }
  return Object.fromEntries(entries);
}

let applying = false; // a sync's (or another tab's) changes being applied

async function applyNewer(newer) {
  const put = [];
  const refused = [];
  const uidsHere = new Map();
  for (const row of cache) if (row.uid) uidsHere.set(row.uid, evidenceKey(row));
  for (const e of kept.values()) if (e.row.uid) uidsHere.set(e.row.uid, e.key);
  for (const [key, record] of Object.entries(newer)) {
    const row = !record.gone && cleanRow(record.value);
    // A row is under its own key, and its uid isn't another row's (here, or earlier in this batch).
    if (!row || evidenceKey(row) !== key || (row.uid && uidsHere.has(row.uid) && uidsHere.get(row.uid) !== key)) refused.push(key);
    else {
      put.push(row);
      if (row.uid) uidsHere.set(row.uid, key);
    }
  }
  if (put.length) await commit({ put });
  return refused;
}

registerSync({
  id: "progress",
  label: "Study progress",
  icon: "chart",
  counted: (n) => `${n.toLocaleString()} ${n === 1 ? "answer" : "answers"}`,
  shard: (key) => key.slice(0, 7),
  shards: /^\d{4}-\d{2}$/,
  // The account's clears first, so what they cover is taken here before this device's files are written.
  prepare: () => refreshClears(),
  records() {
    const out = {};
    for (const row of cache) out[evidenceKey(row)] = { at: row.at, value: stripped(row) };
    return out;
  },
  check(record, key) {
    if (record.gone) return false;
    const row = cleanRow(record.value);
    return Boolean(row) && record.at === row.at && evidenceKey(row) === key;
  },
  // What a clear in force covers isn't in this device's files (it's taken here first, into the rows kept for Undo).
  settle(held) {
    const { before } = cutoffOf(clears.values());
    if (before) for (const key of Object.keys(held)) if (held[key].value?.at < before) delete held[key];
    return held;
  },
  async apply(newer) {
    const was = applying;
    applying = true;
    try {
      return await applyNewer(newer);
    } finally {
      applying = was;
    }
  },
  // What a sync (or another tab) brought in doesn't ask for another sync.
  onChange: (fn) => onProgressChange(() => applying || fn()),
});
