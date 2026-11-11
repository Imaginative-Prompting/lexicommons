// Your texts, kept on this device and nowhere else (IndexedDB "lexicommons-read"):
//   books      { id, title, authors, lang, source, version, addedAt, openedAt, words, chapters, cover? }: the list
//              (cover: { file }, a cover your AI drew, in pictures; source.kind "ai" for a text your AI added)
//   texts      the text itself, a lexicommons-book (book-format.js), loaded only to read it
//   weaves     { id: "<book>:<to>", weave, definitions? }: a lexicommons-weave of it into another language, and the
//              definitions of the words it teaches ({ url, file }, a lexicommons-definitions); "<book>:#book" holds
//              the definitions of the book's own words
//   positions  { id, word, version, at }: where you are in it, as a word index into the book's words
//   pictures   { id: file, blob }: a picture book's pictures, by their file name (their content's hash), shared by
//              every book that shows them, so a picture book reads offline; and covers ("<16 hex>.svg", cover-svg.js),
//              shown only as <img>
// Your highlights and notes are kept apart (highlights.js), and go with their text: removed, kept for Undo, cleared and
// exported with it.
// Where you are in each text goes to your other devices through your own storage (sync.js, kind "reading-place"). The
// texts themselves stay on the device that has them.
// Without IndexedDB (a private window) everything lasts for the visit only.

import { BOOK_ID, coverPicture, picturePath } from "./book-format.js";
import { registerSync } from "../sync.js";
import { allHighlights, clearHighlights, highlightsOf, removeHighlightsOf, restoreHighlights } from "./highlights.js";
import { sampleOn } from "../study/sample-mode.js";

const DB = "lexicommons-read";
const STORES = ["books", "texts", "weaves", "positions", "pictures"];

let opening = null;
let memory = null; // the visit-only fallback: { books: Map, texts: Map, positions: Map }

function db() {
  return (opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      for (const name of STORES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    memory ??= Object.fromEntries(STORES.map((name) => [name, new Map()]));
    throw error;
  }));
}

// A request's result once its transaction is done (or a list of them); plain values pass through.
const unwrap = (out) => (out instanceof IDBRequest ? out.result : Array.isArray(out) ? out.map(unwrap) : out);

/** Runs `action(stores)` in one transaction over `names`; resolves to what it returned once the transaction is done. */
async function run(names, mode, action) {
  let database;
  try {
    database = await db();
  } catch {
    return unwrap(action(Object.fromEntries(names.map((name) => [name, memoryStore(memory[name])]))));
  }
  return new Promise((resolve, reject) => {
    const tx = database.transaction(names, mode);
    const out = action(Object.fromEntries(names.map((name) => [name, tx.objectStore(name)])));
    tx.oncomplete = () => resolve(unwrap(out));
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

// The same calls as an object store, over a Map (results are plain values rather than requests).
const memoryStore = (map) => ({
  get: (id) => map.get(id),
  getAll: () => [...map.values()],
  getAllKeys: () => [...map.keys()],
  put: (value) => map.set(value.id, value),
  delete: (id) => map.delete(id),
  clear: () => map.clear(),
});

// The account signed in (read/text-inbox.js sets it): a text your AI added for another account on this device isn't
// listed. Your own texts belong to the device and are listed for everyone on it, as always.
let account = null;
// Read's own page follows what's kept here (library.js): a text added, opened, put back, woven or taken out, a place moved. On this device
// and at once, so the page under a book that's open is already as it'll be when the book closes (the sync hears of places once a minute).
const readingListeners = new Set();
const readingChanged = () => {
  for (const fn of readingListeners) fn();
};
/** Calls fn after each change to what Read shows from this device. Returns a stop. */
export function onReadingChange(fn) {
  readingListeners.add(fn);
  return () => readingListeners.delete(fn);
}

export function setReadAccount(id) {
  account = id;
}
const visible = (book) => !(book.source?.kind === "ai" && book.source.account && book.source.account !== account);

// Every entry on the device, every account's: what pictures are still needed is counted over these.
const everyBook = async () => (await run(["books"], "readonly", (s) => s.books.getAll()).catch(() => [])) ?? [];

/** Every text on this device, most recently opened (or added) first. */
export async function listBooks() {
  return (await everyBook()).filter(visible).sort((a, b) => (b.openedAt ?? b.addedAt) - (a.openedAt ?? a.addedAt));
}

/** A text's list entry and the text itself, or null (as for one your AI added for another account on this device). */
export async function getBook(id) {
  const [book, text] = await run(["books", "texts"], "readonly", (s) => [s.books.get(id), s.texts.get(id)]).catch(() => []);
  return book && text && visible(book) ? { book, text } : null;
}

/**
 * Saves a text (a lexicommons-book) and any weaves of it ({ nl: weave }), replacing what was there; returns its entry.
 * cover: { file, blob }, a cover already cleaned (cover-svg.js), kept with the pictures.
 */
export async function addBook(text, weaves = {}, { cover, definitions = {} } = {}) {
  const entry = {
    id: text.id,
    title: text.title,
    authors: text.authors ?? [],
    lang: text.lang,
    source: text.source,
    version: text.version,
    addedAt: Date.now(),
    openedAt: null,
    words: text.words.length,
    chapters: text.chapters.length,
    // The pictures it shows (their files, its cover's too), so removing it can tell which pictures nothing else needs.
    pictures: [...(text.pictures ?? []).map((picture) => picture.file), ...(cover ? [cover.file] : [])],
    // Its cover picture's file (its `cover`, else its first page's picture), for the library's covers.
    coverFile: coverPicture(text)?.file ?? null,
    ...(cover ? { cover: { file: cover.file } } : {}),
  };
  await run(["books", "texts", "weaves", "pictures"], "readwrite", (s) => {
    s.books.put(entry);
    s.texts.put(text);
    for (const [to, weave] of Object.entries(weaves)) s.weaves.put({ id: `${text.id}:${to}`, weave, ...(definitions[to] ? { definitions: definitions[to] } : {}) });
    if (definitions.book) s.weaves.put({ id: `${text.id}:#book`, definitions: definitions.book });
    if (cover) s.pictures.put({ id: cover.file, blob: cover.blob });
  });
  persist();
  readingChanged();
  return entry;
}

/**
 * Everything kept for a text: its entry, the text, its weaves, where you are in it, the pictures it shows (its cover
 * too) and your highlights in it, to put back as it was (restoreBook). Null when it isn't here.
 */
export async function snapshotBook(id) {
  const [book, text, position] = await run(["books", "texts", "positions"], "readonly", (s) => [s.books.get(id), s.texts.get(id), s.positions.get(id)]);
  if (!book || !text) return null;
  const range = typeof IDBKeyRange === "undefined" ? undefined : IDBKeyRange.bound(`${id}:`, `${id}:\uffff`);
  const weaves = ((await run(["weaves"], "readonly", (s) => s.weaves.getAll(range))) ?? []).filter((w) => w.id.startsWith(`${id}:`));
  const pictures = [];
  for (const file of book.pictures ?? []) {
    const blob = await getPicture(file);
    if (blob) pictures.push({ file, blob });
  }
  return { book, text, position: position ?? null, weaves, pictures, highlights: await highlightsOf(id) };
}

/** Puts a text back from snapshotBook, as it was: in one transaction. */
export async function restoreBook(snapshot) {
  await run(STORES, "readwrite", (s) => {
    s.books.put(snapshot.book);
    s.texts.put(snapshot.text);
    for (const weave of snapshot.weaves) s.weaves.put(weave);
    if (snapshot.position) s.positions.put(snapshot.position);
    for (const picture of snapshot.pictures) s.pictures.put({ id: picture.file, blob: picture.blob });
  });
  await restoreHighlights(snapshot.highlights);
  persist();
  readingChanged();
}

/** The languages each text on the device is woven into: Map of id → ["nl", …], from the weaves' keys ("<id>:<to>"). */
export async function weaveLanguages() {
  const keys = (await run(["weaves"], "readonly", (s) => s.weaves.getAllKeys()).catch(() => [])) ?? [];
  const out = new Map();
  for (const key of keys.map(String)) {
    const at = key.lastIndexOf(":");
    // "#book" is the book's own definitions, not a language.
    if (at > 0 && key[at + 1] !== "#") out.set(key.slice(0, at), [...(out.get(key.slice(0, at)) ?? []), key.slice(at + 1)]);
  }
  return out;
}

const definitionsKey = (id, to) => (to === "book" ? `${id}:#book` : `${id}:${to}`);

/** A text's definitions ({ url, file }): of the words its layer into `to` teaches, or ("book") of its own words; or null. */
export async function getDefinitions(id, to) {
  return (await run(["weaves"], "readonly", (s) => s.weaves.get(definitionsKey(id, to))).catch(() => null))?.definitions ?? null;
}

/** Keeps definitions that came after the text did (the catalog has them now), beside its layer or as its own. */
export async function keepDefinitions(id, to, definitions) {
  await run(["weaves"], "readwrite", (s) => {
    const key = definitionsKey(id, to);
    const keep = (row) => s.weaves.put({ ...(row ?? { id: key }), definitions });
    const got = s.weaves.get(key);
    if (got instanceof IDBRequest) got.onsuccess = () => keep(got.result);
    else keep(got);
  });
}

/** Keeps a layer into `to` that came after the text did (your AI wove it: read/text-inbox.js), beside whatever definitions are kept there. */
export async function keepWeave(id, to, weave) {
  await run(["weaves"], "readwrite", (s) => {
    const key = `${id}:${to}`;
    const keep = (row) => s.weaves.put({ ...(row ?? { id: key }), weave });
    const got = s.weaves.get(key);
    if (got instanceof IDBRequest) got.onsuccess = () => keep(got.result);
    else keep(got);
  });
  readingChanged();
}

/** A text's weave into `to` ("nl"), or null. */
export async function getWeave(id, to) {
  return (await run(["weaves"], "readonly", (s) => s.weaves.get(`${id}:${to}`)).catch(() => null))?.weave ?? null;
}

export async function removeBook(id) {
  const books = await everyBook();
  const book = books.find((b) => b.id === id);
  if (book && !visible(book)) return;
  const gone = book?.pictures ?? [];
  const needed = new Set(books.filter((b) => b.id !== id).flatMap((b) => b.pictures ?? []));
  await run(STORES, "readwrite", (s) => {
    for (const name of ["books", "texts", "positions"]) s[name].delete(id);
    // A text's weaves are keyed "<id>:<to>".
    if (s.weaves instanceof IDBObjectStore) s.weaves.delete(IDBKeyRange.bound(`${id}:`, `${id}:\uffff`));
    else for (const key of [...memory.weaves.keys()]) if (key.startsWith(`${id}:`)) memory.weaves.delete(key);
    // Its pictures, unless another book shows them too.
    for (const file of gone) if (!needed.has(file)) s.pictures.delete(file);
  });
  await removeHighlightsOf(id);
  readingChanged();
}

/**
 * Keeps a picture book's pictures on the device (fetched from the open library, each once, by its file), so it reads
 * offline. Resolves once they're all here (a picture that can't be fetched now is left for the next time).
 */
export async function keepPictures(text) {
  for (const picture of text.pictures ?? []) {
    if (await getPicture(picture.file)) continue;
    try {
      const response = await fetch(`/library/${picturePath(picture.file)}`, { credentials: "same-origin" });
      if (!response.ok) continue;
      const blob = await response.blob();
      await run(["pictures"], "readwrite", (s) => s.pictures.put({ id: picture.file, blob }));
    } catch {
      // Offline: kept next time the book opens online.
    }
  }
}

/** A picture kept on the device (a Blob), or null. */
export async function getPicture(file) {
  return (await run(["pictures"], "readonly", (s) => s.pictures.get(file)).catch(() => null))?.blob ?? null;
}

/** Marks a text as just opened (it moves to the top of the list). */
export async function touchBook(id) {
  // Your books keep their order while the sample learner is on (study/sample-mode.js).
  if (sampleOn()) return;
  await run(["books"], "readwrite", (s) => {
    const update = (book) => book && s.books.put({ ...book, openedAt: Date.now() });
    const got = s.books.get(id);
    if (got instanceof IDBRequest) got.onsuccess = () => update(got.result);
    else update(got);
  }).catch(() => {});
  readingChanged();
}

export async function getPosition(id) {
  return (await run(["positions"], "readonly", (s) => s.positions.get(id)).catch(() => null)) ?? null;
}

export async function getPositions() {
  const rows = (await run(["positions"], "readonly", (s) => s.positions.getAll()).catch(() => [])) ?? [];
  return new Map(rows.map((row) => [row.id, row]));
}

export function setPosition(id, word, version) {
  // Your place in a text stays where you left it while the sample learner is on (study/sample-mode.js).
  if (sampleOn()) return Promise.resolve();
  return run(["positions"], "readwrite", (s) => s.positions.put({ id, word, version, at: Date.now() }))
    .then(() => {
      readingChanged();
      placeMoved();
    })
    .catch(() => {});
}

/**
 * A picture book's page as its reader counts them on this device (its laid-out pages, About's too): { n, of, a, b }, a and b the page's
 * first and last word, kept on your place's row so Home and Read's card say the same "Page n of m" the reader does. Written after your
 * place (setPosition writes the row afresh); never synced (a place from another device comes without it: this screen's count isn't
 * that one's). Tells Read's page only when it changed.
 */
export function setShownPage(id, shown) {
  if (sampleOn()) return Promise.resolve();
  let changed = false;
  return run(["positions"], "readwrite", (s) => {
    const keep = (row) => {
      if (!row || JSON.stringify(row.shown) === JSON.stringify(shown)) return;
      changed = true;
      s.positions.put({ ...row, shown });
    };
    const got = s.positions.get(id);
    // An IndexedDB request, or the visit-only store's row itself.
    if (got && typeof got === "object" && "onsuccess" in got) got.onsuccess = () => keep(got.result);
    else keep(got);
  })
    .then(() => changed && readingChanged())
    .catch(() => {});
}

// ---------- where you are, on your other devices (sync.js) ----------

// A text's id → { word, version }, dated when you got there. A place is never deleted: one for a text a device doesn't
// have waits there for it (a book from the library, added later, opens where you were).
const placeListeners = new Set();
// Reading tells the sync at most once a minute: every page turn moves your place.
const PLACE_EVERY = 60_000;
let placeTold = 0;
let placeTimer = null;
function placeMoved() {
  const wait = placeTold + PLACE_EVERY - Date.now();
  if (wait > 0) {
    placeTimer ??= setTimeout(() => {
      placeTimer = null;
      placeMoved();
    }, wait);
    return;
  }
  placeTold = Date.now();
  for (const fn of placeListeners) fn();
}
const isWord = (n) => Number.isInteger(n) && n >= 0 && n <= 10_000_000;
const isVersion = (v) => v === null || (typeof v === "string" && /^[0-9a-f]{16}$/.test(v));

export const placeSync = {
  id: "reading-place",
  label: "Where you are in each text",
  icon: "book",
  counted: (n) => `${n.toLocaleString()} ${n === 1 ? "text" : "texts"}`,
  async records() {
    const out = {};
    for (const row of (await run(["positions"], "readonly", (s) => s.positions.getAll()).catch(() => [])) ?? []) {
      if (BOOK_ID.test(row.id) && Number.isFinite(row.at) && isWord(row.word)) out[row.id] = { at: row.at, value: { word: row.word, version: row.version ?? null } };
    }
    return out;
  },
  check(record, key) {
    const value = record.value;
    if (record.gone || !BOOK_ID.test(key) || !value || typeof value !== "object" || Array.isArray(value)) return false;
    return Object.keys(value).sort().join() === "version,word" && isWord(value.word) && isVersion(value.version);
  },
  async apply(newer) {
    await run(["positions"], "readwrite", (s) => {
      for (const [id, record] of Object.entries(newer)) s.positions.put({ id, word: record.value.word, version: record.value.version, at: record.at });
    });
    return [];
  },
  onChange: (fn) => placeListeners.add(fn),
};
registerSync(placeSync);

/** Deletes every text in Read on this device, and where you were in each. */
export async function clearReading() {
  // Texts your AI added for another account signed in on this device aren't in this Read, so they stay.
  if ((await everyBook()).some((book) => !visible(book))) {
    for (const book of await listBooks()) await removeBook(book.id).catch(() => {});
    return;
  }
  await run(STORES, "readwrite", (s) => {
    for (const name of STORES) s[name].clear();
  }).catch(() => {});
  await clearHighlights();
}

/**
 * The list, where you are in each and your highlights and notes (not the texts themselves), for Settings → Your data →
 * Download everything.
 */
export async function readingExport() {
  const [books, positions, highlights] = await Promise.all([listBooks(), getPositions(), allHighlights()]);
  const marks = ({ version, start, end, quote, note, at, updatedAt }) => ({ version, start, end, quote, note, at, updatedAt });
  return books.map((book) => ({ ...book, position: positions.get(book.id)?.word ?? 0, highlights: highlights.filter((row) => row.book === book.id).map(marks) }));
}

// Asks the browser to keep this site's storage when space runs low (iPhone can otherwise clear it). Asked once a
// text is added, which is when there's something to lose.
let persisted = null;
export async function persist() {
  if (persisted !== null) return persisted;
  try {
    persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
  } catch {
    persisted = false;
  }
  return persisted;
}

/** Whether texts are being kept: "kept" (persistent), "may-clear" (the browser may clear them), "visit" (private). */
export async function keepState() {
  try {
    await db();
  } catch {
    return "visit";
  }
  try {
    return (await navigator.storage?.persisted?.()) ? "kept" : "may-clear";
  } catch {
    return "may-clear";
  }
}
