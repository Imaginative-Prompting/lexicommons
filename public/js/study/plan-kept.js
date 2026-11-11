// What a start's first plan works out from the study material, kept on the device: new-words.js's word places and order, and path.js's
// worked-out lessons. A year's learner has 16,000 sentences, and working these out was most of Home's first draw (6 Nov 2026); a start
// with nothing changed reads them back instead. Each language's record is used only while its key is what it was when it was kept: this
// app's version, the language's packs (each one's version or, for yours, when it changed, and whether it's on, in their order), the
// frequency list, the shared grammar's revision and where your packs sit on the path (path-place.js anchors). Anything else, and it's worked
// out again and kept again. Kept through sampleDb, so the sample learner has its own (sample-mode.js SAMPLE_DBS).
// shell/main.js reads the kept records at start (loadPlanKept), beside the evidence and the word index.

import { allPacks, isPackOn, yourPacks } from "./packs.js";
import { frequencyVersion } from "./frequency.js";
import { grammarNow } from "../lang/grammar.js";
import { anchorsOn } from "./path-place.js";
import { sampleDb } from "./sample-mode.js";

// Kept records of another shape are worked out again.
const SCHEMA = 1;
const DB = sampleDb("lexicommons-plan");
const STORE = "languages";
const SAVE_AFTER = 2000; // ms after the last part kept: one write for a start's parts

let kept = new Map(); // lang → { lang, schema, parts: { <part>: { key, value } } }: each part under the key it was worked out for
const waiting = new Set(); // langs with a part kept and not yet written
let saveTimer = null;

/** The app's version: what the page's own script was asked for (?v=), else this copy's. */
const appVersion = () => {
  const main = globalThis.document?.querySelector?.('script[src*="/js/shell/main.js"]');
  return (main && new URL(main.src).searchParams.get("v")) || "copy";
};

/** The key a language's kept parts are good for, as it stands now (see the top). anchors: false for a part they don't touch (the words). */
export function planKey(lang, { anchors = true } = {}) {
  const changed = new Map(yourPacks().map((record) => [record.id, record.changedAt ?? 0]));
  const packs = allPacks()
    .filter((pack) => pack.language === lang)
    .map((pack) => [pack.id, pack.origin?.kind === "yours" ? changed.get(pack.id) ?? 0 : JSON.stringify(pack.origin ?? null), isPackOn(pack.id) ? 1 : 0]);
  const grammar = grammarNow(lang);
  return JSON.stringify([SCHEMA, appVersion(), lang, packs, frequencyVersion(lang), grammar?.revision ?? 1, grammar?.libraryVersion ?? null, anchors ? anchorsOn(lang) : null]);
}

const stats = { read: 0, missed: 0, kept: 0 };
/** How often a part was read back, missed and kept, since the page started (for a test). */
export const planKeptStats = () => ({ ...stats });

/** A part kept for `lang` under `key` (the one planKey gives now), or null. */
export function keptPart(lang, key, part) {
  const record = kept.get(lang);
  const one = record?.schema === SCHEMA ? record.parts?.[part] : null;
  const value = one && one.key === key ? one.value : null;
  stats[value ? "read" : "missed"]++;
  return value;
}

/** Keeps a part for `lang` under `key`, in place of what was kept of it. Written a moment later (never during a draw). */
export function keepPart(lang, key, part, value) {
  let record = kept.get(lang);
  if (!record || record.schema !== SCHEMA || typeof record.parts !== "object") record = { lang, schema: SCHEMA, parts: {} };
  record.parts[part] = { key, value };
  kept.set(lang, record);
  stats.kept++;
  waiting.add(lang);
  if (typeof indexedDB === "undefined") return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_AFTER);
}

/** Every kept record, as it would be written (for a test). */
export const planKeptSnapshot = () => [...kept.values()].map((record) => structuredClone(record));

/** Records to use as kept (loadPlanKept hands them here; a test can too). Each is checked when it's read. */
export function usePlanKept(records) {
  kept = new Map();
  for (const record of records ?? []) if (record && typeof record.lang === "string" && record.parts && typeof record.parts === "object") kept.set(record.lang, record);
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

/** Reads the kept records (at start). Never fails: without them, each part is worked out. */
export async function loadPlanKept() {
  try {
    const database = await db();
    const records = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
    // A part kept while this was reading stays as it is.
    for (const record of records) if (!kept.has(record.lang)) kept.set(record.lang, record);
  } catch {
    // Private browsing or no storage: worked out each start.
  }
}

/**
 * Forgets every kept part, here and on the device: the store emptied and nothing waiting to be written. For deleting the account and
 * clearing this device's progress: a kept plan says which packs were on and where its learner had put themselves on the path. Each part is
 * worked out again when it's next read.
 */
export async function forgetPlanKept() {
  clearTimeout(saveTimer);
  waiting.clear();
  kept = new Map();
  try {
    const database = await db();
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } catch {
    // No database: nothing was kept.
  }
}

async function save() {
  const langs = [...waiting];
  waiting.clear();
  try {
    const database = await db();
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const lang of langs) if (kept.has(lang)) store.put(kept.get(lang));
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } catch {
    // Not kept this time: worked out again next start.
  }
}
