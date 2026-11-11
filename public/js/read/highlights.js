// Your highlights and notes in the reader, kept on this device (IndexedDB "lexicommons-highlights", a database of its
// own, so adding it never had to upgrade the texts' one under a tab still holding it):
//   highlights  { id, book, version, start, end, quote, note, at, updatedAt }, or a highlight taken out:
//               { id, gone: true, at, book, kept?, until? } (kept: the highlight a deletion from your storage took,
//               to restore until `until`)
// Each is anchored by word index (start..end, inclusive) to the version of the text it was made on, and keeps the words
// it covered then (quote), so a highlight from an earlier version can still be listed. store.js removes a text's
// highlights with it, keeps them in its snapshot, clears them with the texts and puts them in the export.
// They reach your other devices through your own storage (sync.js, kind "highlights"), each dated by its last change.
// One you take out leaves its deletion, kept for good, so no device brings it back; one a deletion from your storage
// takes is kept here for RESTORE_DAYS, to restore (the reader's highlights list). Taking a text off a device takes
// its highlights off that device only.
// Without IndexedDB (a private window) they last for the visit only.

import { BOOK_ID } from "./book-format.js";
import { registerSync } from "../sync.js";
import { sampleDb } from "../study/sample-mode.js";

// The sample learner's own while it's on (study/sample-mode.js).
const DB = sampleDb("lexicommons-highlights");
// The words a highlight keeps of what it covers (the list shows them; a long one ends in "…").
export const QUOTE_MAX = 200;

let opening = null;
let memory = null;

function db() {
  return (opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("highlights", { keyPath: "id" });
    request.onsuccess = () => {
      // Another tab opening a newer version: let it.
      request.result.onversionchange = () => {
        request.result.close();
        opening = null;
      };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    memory ??= new Map();
    throw error;
  }));
}

/** Runs `action(store)` in one transaction; resolves to its result once the transaction is done. */
async function run(mode, action) {
  let database;
  try {
    database = await db();
  } catch {
    return action({
      get: (id) => memory.get(id),
      getAll: () => [...memory.values()],
      put: (row) => memory.set(row.id, row),
      delete: (id) => memory.delete(id),
      clear: () => memory.clear(),
    });
  }
  return new Promise((resolve, reject) => {
    const tx = database.transaction("highlights", mode);
    const out = action(tx.objectStore("highlights"));
    tx.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

const byPlace = (a, b) => a.start - b.start || a.end - b.end || a.at - b.at;
/** Every row, deletions too. */
const allRows = async () => (await run("readonly", (s) => s.getAll()).catch(() => [])) ?? [];

const listeners = new Set();
/** Calls fn({ synced }) when highlights change: here (synced false), or from your other devices (true). Returns a
 * function to stop. */
export function onHighlightsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = (synced = false) => {
  for (const fn of listeners) fn({ synced });
};

/** A new highlight over words start..end of a text's version, with the words it covers (quote). */
export function newHighlight({ book, version, start, end, quote, note = "" }) {
  const at = Date.now();
  const id = globalThis.crypto?.randomUUID?.() ?? `${at.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { id, book, version, start, end, quote: quoteOf(quote), note, at, updatedAt: at };
}

/** Text as a highlight keeps it: up to QUOTE_MAX characters, a longer one cut at a word and ended with "…". */
export function quoteOf(text) {
  const plain = String(text ?? "").replace(/\s+/g, " ").trim();
  if (plain.length <= QUOTE_MAX) return plain;
  const cut = plain.slice(0, QUOTE_MAX);
  return `${cut.slice(0, cut.lastIndexOf(" ") > QUOTE_MAX / 2 ? cut.lastIndexOf(" ") : QUOTE_MAX).trimEnd()}…`;
}

/** Every highlight on this device. */
export async function allHighlights() {
  return (await allRows()).filter((row) => !row.gone).sort(byPlace);
}

/** A text's highlights, in the order they come in it. */
export async function highlightsOf(book) {
  return (await allHighlights()).filter((row) => row.book === book);
}

/** Saves a highlight (new, or its note changed). */
export async function saveHighlight(row) {
  await run("readwrite", (s) => s.put({ ...row, updatedAt: Date.now() }));
  changed();
}

/** Puts highlights back as they were (Undo of a text's removal): their own times kept. */
export async function restoreHighlights(rows) {
  if (!rows?.length) return;
  await run("readwrite", (s) => {
    for (const row of rows) s.put(row);
  });
  changed();
}

/** Takes a highlight out: its deletion stays, so your other devices take it out too. One transaction, opened as you
 * take it out, so anything that reads after that reads it gone. */
export async function removeHighlight(id) {
  const at = Date.now();
  await run("readwrite", (s) => {
    const got = s.get(id);
    const put = (row) => s.put({ id, gone: true, at, book: row?.book ?? null });
    // IndexedDB answers in a callback (still inside the transaction); the visit-only Map at once.
    if (got instanceof IDBRequest) got.onsuccess = () => put(got.result);
    else put(got);
  });
  changed();
}

/** Removes a text's highlights (the text is gone). */
export async function removeHighlightsOf(book) {
  const ids = (await highlightsOf(book)).map((row) => row.id);
  if (!ids.length) return;
  await run("readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
}

/** Removes every highlight on this device (and the copies kept to restore; the deletions stay, so a sync can't bring
 * back what was taken out). */
export async function clearHighlights() {
  const rows = await allRows();
  await run("readwrite", (s) => {
    for (const row of rows) {
      if (!row.gone) s.delete(row.id);
      else if (row.kept) s.put({ id: row.id, gone: true, at: row.at, book: row.book ?? null });
    }
  }).catch(() => {});
}

// ---------- taken out on another device, kept to restore ----------

/** How long a highlight a deletion from your storage took is kept here, to restore. */
export const RESTORE_DAYS = 30;
const DAY = 86_400_000;

/** A text's highlights a deletion from your storage took, still restorable: [{ id, row, at, until }], newest first. */
export async function removedHighlightsOf(book) {
  const now = Date.now();
  return (await allRows())
    .filter((row) => row.gone && row.kept && row.book === book && row.until > now)
    .map((row) => ({ id: row.id, row: row.kept, at: row.at, until: row.until }))
    .sort((a, b) => b.at - a.at);
}

/** Puts back a highlight a deletion from your storage took, dated after that deletion, so it comes back on your other
 * devices too. Resolves to the highlight, or null. */
export async function restoreRemoved(id) {
  const tomb = await run("readonly", (s) => s.get(id)).catch(() => null);
  if (!tomb?.gone || !tomb.kept) return null;
  const row = { ...tomb.kept, updatedAt: Math.max(Date.now(), tomb.at + 1) };
  await run("readwrite", (s) => s.put(row));
  changed();
  return row;
}

// ---------- on your other devices (sync.js) ----------

// A highlight's id: crypto.randomUUID's, or newHighlight's fallback (a time and a random part, base 36).
const ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-z]{6,12}-[0-9a-z]{1,10})$/;
const NOTE_MAX = 20_000;
const isCount = (n) => Number.isInteger(n) && n >= 0 && n <= 10_000_000;
/** A highlight from another device as this one keeps it, or null: exactly its fields, each the type it must be. */
function syncedRow(value, id, at) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "at,book,end,note,quote,start,version") return null;
  const { book, version, start, end, quote, note } = value;
  if (typeof book !== "string" || !BOOK_ID.test(book) || !(version === null || (typeof version === "string" && /^[0-9a-f]{16}$/.test(version)))) return null;
  if (!isCount(start) || !isCount(end) || end < start) return null;
  if (typeof quote !== "string" || quote.length > QUOTE_MAX + 1 || typeof note !== "string" || note.length > NOTE_MAX) return null;
  if (!Number.isFinite(value.at) || value.at < 0 || value.at > at) return null;
  return { id, book, version, start, end, quote, note, at: value.at, updatedAt: at };
}

export const highlightSync = {
  id: "highlights",
  label: "Highlights and notes",
  icon: "pencil",
  counted: (n) => `${n.toLocaleString()} ${n === 1 ? "highlight" : "highlights"}`,
  // A copy kept to restore goes once its time is up (the deletion stays).
  async prepare() {
    const now = Date.now();
    const old = (await allRows()).filter((row) => row.gone && row.kept && !(row.until > now));
    if (!old.length) return;
    await run("readwrite", (s) => {
      for (const row of old) s.put({ id: row.id, gone: true, at: row.at, book: row.book ?? null });
    });
  },
  async records() {
    const out = {};
    for (const row of await allRows()) {
      if (!ID.test(row.id) || !Number.isFinite(row.at)) continue;
      out[row.id] = row.gone
        ? { at: row.at, gone: true }
        : { at: row.updatedAt ?? row.at, value: { book: row.book, version: row.version ?? null, start: row.start, end: row.end, quote: row.quote, note: row.note ?? "", at: row.at } };
    }
    return out;
  },
  check(record, key) {
    if (!ID.test(key)) return false;
    return record.gone ? record.about === undefined : Boolean(syncedRow(record.value, key, record.at));
  },
  async apply(newer) {
    const here = new Map((await allRows()).map((row) => [row.id, row]));
    const until = Date.now() + RESTORE_DAYS * DAY;
    const puts = [];
    for (const [id, record] of Object.entries(newer)) {
      const mine = here.get(id);
      if (!record.gone) {
        puts.push(syncedRow(record.value, id, record.at));
        continue;
      }
      // A deletion: the highlight it takes here is kept, to restore (a copy kept before stays until its own time).
      const live = mine && !mine.gone ? mine : null;
      const kept = live ? { kept: live, until } : mine?.kept ? { kept: mine.kept, until: mine.until } : {};
      puts.push({ id, gone: true, at: record.at, book: live?.book ?? mine?.book ?? null, ...kept });
    }
    await run("readwrite", (s) => {
      for (const row of puts) if (row) s.put(row);
    });
    changed(true);
    return [];
  },
  // What a sync brought in doesn't ask for another sync.
  onChange: (fn) => onHighlightsChange(({ synced }) => synced || fn()),
};
registerSync(highlightSync);
