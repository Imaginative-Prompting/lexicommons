// Your texts, kept on this device (IndexedDB "lexicommons-read") and, from 12 Nov 2026, on your other devices through your account's copy
// and your own storage (sync.js, kind "texts", below):
//   books      { id, title, authors, lang, source, version, addedAt, changedAt, openedAt, words, chapters, cover?, from? }: the list
//              (cover: { file }, a cover your AI drew, in pictures; source.kind "ai" for a text your AI added; from: "shelf" or
//              "explore" for a book from the open shelf or Explore, which another device lists and fetches again when it's opened)
//   texts      the text itself, a lexicommons-book (book-format.js), loaded only to read it
//   weaves     { id: "<book>:<to>", weave, definitions? }: a lexicommons-weave of it into another language, and the
//              definitions of the words it teaches ({ url, file }, a lexicommons-definitions); "<book>:#book" holds
//              the definitions of the book's own words
//   positions  { id, word, version, at }: where you are in it, as a word index into the book's words
//   pictures   { id: file, blob }: a picture book's pictures, by their file name (their content's hash), shared by
//              every book that shows them, so a picture book reads offline; and covers ("<16 hex>.svg", cover-svg.js),
//              shown only as <img>
//   gone       { id, at, kept?, until? }: a text (its id) or a weave of one ("<id>:<to>") taken out, so it stays out on every
//              device; kept: everything it was (snapshotBook) until `until`, for Settings → Your data to bring back
// Your highlights and notes are kept apart (highlights.js), and go with their text: removed, kept for Undo, cleared and
// exported with it.
// Where you are in each text goes to your other devices too (sync.js, kind "reading-place"). Your own texts (pasted, from a file, or
// added by your AI) go whole, with your AI's weaves and cover; a book from the shelf or Explore goes as its list entry alone.
// Without IndexedDB (a private window) everything lasts for the visit only.

import { BOOK_ID, coverPicture, picturePath, validateBook, validateWeave } from "./book-format.js";
import { cleanCover, coverFile, COVER_TYPE } from "./cover-svg.js";
import { hashText, notKeptWithAccount, registerSync } from "../sync.js";
import { allHighlights, clearHighlights, highlightsOf, removeHighlightsOf, restoreHighlights } from "./highlights.js";
import { sampleOn } from "../study/sample-mode.js";

const DB = "lexicommons-read";
const STORES = ["books", "texts", "weaves", "positions", "pictures", "gone"];

let opening = null;
let memory = null; // the visit-only fallback: { books: Map, texts: Map, positions: Map }

function db() {
  return (opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 3);
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
  getKey: (id) => (map.has(id) ? id : undefined),
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
export async function addBook(text, weaves = {}, { cover, definitions = {}, from } = {}) {
  // An entry another device listed here, waiting for its text (read/fetch-again.js), keeps when it was added and opened; a text added
  // again over one that's here starts as it always has (added now, not yet opened).
  const [was, hadText] = (await run(["books", "texts"], "readonly", (s) => [s.books.get(text.id), s.texts.getKey(text.id)]).catch(() => null)) ?? [];
  const listed = was && hadText === undefined ? was : null;
  const now = Date.now();
  const entry = {
    id: text.id,
    title: text.title,
    authors: text.authors ?? [],
    lang: text.lang,
    source: text.source,
    version: text.version,
    addedAt: listed?.addedAt ?? now,
    openedAt: listed?.openedAt ?? null,
    words: text.words.length,
    chapters: text.chapters.length,
    // The pictures it shows (their files, its cover's too), so removing it can tell which pictures nothing else needs.
    pictures: [...(text.pictures ?? []).map((picture) => picture.file), ...(cover ? [cover.file] : [])],
    // Its cover picture's file (its `cover`, else its first page's picture), for the library's covers.
    coverFile: coverPicture(text)?.file ?? null,
    ...(cover ? { cover: { file: cover.file } } : {}),
    ...((from ?? was?.from) ? { from: from ?? was.from } : {}),
  };
  // Changed for your other devices only when what they're given of it changed (fetching a book's text again here changes nothing there).
  entry.changedAt = was && sameForOthers(was, entry) ? (was.changedAt ?? was.addedAt) : now;
  await run(["books", "texts", "weaves", "pictures", "gone"], "readwrite", (s) => {
    s.books.put(entry);
    s.texts.put(text);
    s.gone.delete(text.id);
    for (const [to, weave] of Object.entries(weaves)) {
      s.weaves.put({ id: `${text.id}:${to}`, weave, at: now, ...(definitions[to] ? { definitions: definitions[to] } : {}) });
      s.gone.delete(`${text.id}:${to}`);
    }
    if (definitions.book) s.weaves.put({ id: `${text.id}:#book`, definitions: definitions.book });
    if (cover) s.pictures.put({ id: cover.file, blob: cover.blob });
  });
  persist();
  readingChanged();
  textsChanged([text.id, ...Object.keys(weaves).map((to) => `${text.id}:${to}`)]);
  return entry;
}

/** A text's list entry alone, or null (one another device listed is here before its text is fetched). */
export async function getEntry(id) {
  const book = await run(["books"], "readonly", (s) => s.books.get(id)).catch(() => null);
  return book && visible(book) ? book : null;
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
  const now = Date.now();
  await run(STORES, "readwrite", (s) => {
    // Back on every device: newer than the deletion it undoes.
    s.books.put({ ...snapshot.book, changedAt: now });
    s.texts.put(snapshot.text);
    s.gone.delete(snapshot.book.id);
    for (const weave of snapshot.weaves) {
      s.weaves.put(weave.weave ? { ...weave, at: now } : weave);
      s.gone.delete(weave.id);
    }
    if (snapshot.position) s.positions.put(snapshot.position);
    for (const picture of snapshot.pictures) s.pictures.put({ id: picture.file, blob: picture.blob });
  });
  await restoreHighlights(snapshot.highlights);
  persist();
  readingChanged();
  textsChanged([snapshot.book.id, ...snapshot.weaves.filter((w) => w.weave).map((w) => w.id)]);
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
  const key = `${id}:${to}`;
  await run(["weaves", "gone"], "readwrite", (s) => {
    const keep = (row) => s.weaves.put({ ...(row ?? { id: key }), weave, at: Date.now() });
    const got = s.weaves.get(key);
    if (got instanceof IDBRequest) got.onsuccess = () => keep(got.result);
    else keep(got);
    s.gone.delete(key);
  });
  readingChanged();
  textsChanged([key]);
}

/** A text's weave into `to` ("nl"), or null. */
export async function getWeave(id, to) {
  return (await run(["weaves"], "readonly", (s) => s.weaves.get(`${id}:${to}`)).catch(() => null))?.weave ?? null;
}

/**
 * Takes a text out: everywhere (its deletion goes to your other devices, and stays; keep: what to bring back until `until`), or with
 * everywhere false on this device alone (clearing a device's own copy, and taking another device's deletion: at is that one's time).
 */
export async function removeBook(id, { everywhere = true, keep = null, at = Date.now() } = {}) {
  const books = await everyBook();
  const book = books.find((b) => b.id === id);
  if (book && !visible(book)) return;
  const gone = book?.pictures ?? [];
  const needed = new Set(books.filter((b) => b.id !== id).flatMap((b) => b.pictures ?? []));
  const woven = (((await run(["weaves"], "readonly", (s) => s.weaves.getAllKeys()).catch(() => [])) ?? []).map(String)).filter((key) => key.startsWith(`${id}:`) && !key.includes(":#"));
  await run(STORES, "readwrite", (s) => {
    for (const name of ["books", "texts", "positions"]) s[name].delete(id);
    // A text's weaves are keyed "<id>:<to>".
    if (s.weaves instanceof IDBObjectStore) s.weaves.delete(IDBKeyRange.bound(`${id}:`, `${id}:\uffff`));
    else for (const key of [...memory.weaves.keys()]) if (key.startsWith(`${id}:`)) memory.weaves.delete(key);
    // Its pictures, unless another book shows them too.
    for (const file of gone) if (!needed.has(file)) s.pictures.delete(file);
    if (everywhere || at) {
      s.gone.put({ id, at, ...(keep ? { kept: keep.snapshot, until: keep.until } : {}) });
      for (const key of woven) s.gone.put({ id: key, at });
    }
  });
  await removeHighlightsOf(id);
  readingChanged();
  if (everywhere) textsChanged([id, ...woven]);
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

// ---------- your texts, on your other devices (sync.js) ----------
//
// Your own texts (pasted, from a file, or added by your AI for this account) go whole: the list entry, the text, your AI's cover and
// its weaves. A book from the open shelf or Explore goes as its list entry alone (another device lists it, with your place, and fetches
// it again when it's opened: read/fetch-again.js). A text taken out goes as its deletion, and stays out. A record per text and per weave,
// each in a file of its own (a text and a weave can each be 8 MB), named by a short hash of its key (a book's id runs to 80 characters).
// Everything from a storage is checked here as a text added any other way is (book-format.js, cover-svg.js); one that doesn't pass is
// turned down, tried again at the next sync, and listed in Read (textsTurnedDown).

const OWN_SOURCES = new Set(["upload", "paste", "ai"]);
/** Whether a text is your own (it goes whole to your other devices), not a book from the shelf or Explore (its entry alone). */
export const ownText = (entry) => OWN_SOURCES.has(entry?.source?.kind);
const TO = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;
const TEXT_MOST = 8_000_000; // characters of a text or a weave as JSON (a text's upload limit)
const isPlain = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
/** A key's text id and weave language ("<id>" or "<id>:<to>"), or null. */
function keyParts(key) {
  if (typeof key !== "string") return null;
  const [id, to, more] = key.split(":");
  if (more !== undefined || !BOOK_ID.test(id) || (to !== undefined && !TO.test(to))) return null;
  return { id, to: to ?? null };
}
const textShard = (key) => `t${hashText(key)}`;
/** What another device is given of a text's entry. */
const forOthers = (entry) => ({
  id: entry.id,
  title: entry.title,
  authors: entry.authors ?? [],
  lang: entry.lang,
  source: entry.source ?? null,
  version: entry.version,
  addedAt: entry.addedAt,
  words: entry.words,
  chapters: entry.chapters,
  ...(entry.from ? { from: entry.from } : {}),
});
function sameForOthers(a, b) {
  return JSON.stringify(forOthers(a)) === JSON.stringify(forOthers(b));
}
const text$ = (v, most) => typeof v === "string" && v.length <= most;
const count$ = (n) => Number.isInteger(n) && n >= 0 && n <= 10_000_000;
/** An entry from another device as this one keeps it, or null: exactly its fields, each what it must be. */
function entryFrom(value, id) {
  if (!isPlain(value)) return null;
  const fields = Object.keys(value);
  if (!fields.every((f) => ["id", "title", "authors", "lang", "source", "version", "addedAt", "words", "chapters", "from"].includes(f))) return null;
  const { title, authors, lang, source, version, addedAt, words, chapters, from } = value;
  if (value.id !== id || !text$(title, 500) || !Array.isArray(authors) || authors.length > 50 || !authors.every((a) => isPlain(a) && text$(a.name, 300))) return null;
  if (!text$(lang, 35) || !(source === null || (isPlain(source) && JSON.stringify(source).length <= 4000))) return null;
  if (!/^[0-9a-f]{16}$/.test(version ?? "") || !Number.isFinite(addedAt) || addedAt < 0 || !count$(words) || !count$(chapters)) return null;
  if (from !== undefined && from !== "shelf" && from !== "explore") return null;
  return { id, title, authors, lang, source, version, addedAt, words, chapters, ...(from ? { from } : {}) };
}

const textListeners = new Set();
let applyingTexts = false;
/** Tells the sync which texts and weaves changed here ("<id>", "<id>:<to>"); not what a sync brought. */
function textsChanged(keys) {
  if (applyingTexts || sampleOn()) return;
  for (const fn of textListeners) fn(keys);
}
// Texts a sync brought that didn't pass here: { key, title }, listed in Read (in plain words: why goes in an error report, without the text's
// own words) until one passes, it's hidden, or the page goes.
const turnedDown = new Map();
const hiddenDown = new Set();
export const textsTurnedDown = () => [...turnedDown.values()].filter((t) => !hiddenDown.has(t.key));
/** Takes a turned-down text off Read's list for this visit (it's still tried at each sync, and taken once it passes). */
export function hideTurnedDown(key) {
  hiddenDown.add(key);
  readingChanged();
}
function reportTurnedDown(why) {
  // What a check said, less anything it quotes (a text may be someone's own writing).
  const said = String(why).replace(/"[^"]*"|“[^”]*”|\([^)]*\)/g, "…").slice(0, 300);
  import("../lx/error-report.js").then((m) => m.reportCaught?.(new Error(`A text from another device didn't pass the checks here: ${said}`))).catch(() => {});
}
/**
 * Texts here that your account's copy doesn't hold (sync.js notKeptWithAccount): [{ id, title, why: "big" | "full" }]. A text too big for
 * it (12 MB a file) stays on this device; with your account's copy full, it does until there's room.
 */
export async function textsOnlyHere() {
  const missing = notKeptWithAccount("texts");
  if (!missing.size) return [];
  const books = await listBooks();
  const out = [];
  for (const book of books) {
    const why = missing.get(book.id) ?? [...missing].find(([key]) => key.startsWith(`${book.id}:`))?.[1];
    if (why) out.push({ id: book.id, title: book.title, why });
  }
  return out;
}

export const textSync = {
  id: "texts",
  label: "Your texts",
  icon: "book",
  counted: (n) => `${n.toLocaleString()} ${n === 1 ? "text" : "texts"}`,
  // A weave goes with its text: it isn't counted as one.
  counts: (key) => !key.includes(":"),
  shard: textShard,
  shards: /^t[0-9a-f]{14}$/,
  // What's kept to bring back goes once its time is up (the deletion stays).
  async prepare() {
    const now = Date.now();
    const old = ((await run(["gone"], "readonly", (s) => s.gone.getAll()).catch(() => [])) ?? []).filter((row) => row.kept && !(row.until > now));
    if (old.length) await run(["gone"], "readwrite", (s) => old.forEach((row) => s.gone.put({ id: row.id, at: row.at }))).catch(() => {});
  },
  async records(shards) {
    const out = {};
    const wanted = (key) => !shards || shards.has(textShard(key));
    const [books, gone, weaveKeys] = (await run(["books", "gone", "weaves"], "readonly", (s) => [s.books.getAll(), s.gone.getAll(), s.weaves.getAllKeys()]).catch(() => null)) ?? [[], [], []];
    for (const row of gone ?? []) if (keyParts(row.id) && Number.isFinite(row.at) && row.at > 0 && wanted(row.id)) out[row.id] = { at: row.at, gone: true };
    const woven = new Map();
    for (const key of (weaveKeys ?? []).map(String)) {
      const parts = keyParts(key);
      if (parts?.to) woven.set(parts.id, [...(woven.get(parts.id) ?? []), key]);
    }
    for (const entry of books ?? []) {
      if (!visible(entry) || !BOOK_ID.test(entry.id) || out[entry.id]) continue;
      const at = entry.changedAt ?? entry.addedAt;
      if (!ownText(entry)) {
        if (wanted(entry.id)) out[entry.id] = { at, value: { entry: forOthers(entry) } };
        continue;
      }
      if (wanted(entry.id)) {
        const [text, cover] = (await run(["texts", "pictures"], "readonly", (s) => [s.texts.get(entry.id), entry.cover?.file ? s.pictures.get(entry.cover.file) : null]).catch(() => null)) ?? [];
        if (text) out[entry.id] = { at, value: { entry: forOthers(entry), text, ...(cover?.blob ? { cover: await cover.blob.text() } : {}) } };
      }
      for (const key of woven.get(entry.id) ?? []) {
        if (!wanted(key) || out[key]) continue;
        const row = await run(["weaves"], "readonly", (s) => s.weaves.get(key)).catch(() => null);
        if (row?.weave) out[key] = { at: row.at ?? at, value: { weave: row.weave } };
      }
    }
    return out;
  },
  check(record, key) {
    const parts = keyParts(key);
    if (!parts) return false;
    if (record.gone) return record.about === undefined;
    const value = record.value;
    if (!isPlain(value)) return false;
    if (parts.to) return Object.keys(value).join() === "weave" && isPlain(value.weave);
    const entry = entryFrom(value.entry, parts.id);
    if (!entry) return false;
    if (!ownText(entry)) return Object.keys(value).join() === "entry";
    return Object.keys(value).every((f) => ["entry", "text", "cover"].includes(f)) && isPlain(value.text) && value.text.id === parts.id && (value.cover === undefined || text$(value.cover, 70_000));
  },
  async apply(newer) {
    const turned = [];
    const refuse = (key, title, why) => {
      turned.push(key);
      if (!turnedDown.has(key)) reportTurnedDown(why);
      turnedDown.set(key, { key, title });
    };
    // Deletions and texts before weaves: a weave is checked against its text.
    const keys = Object.keys(newer).sort((a, b) => Number(a.includes(":")) - Number(b.includes(":")));
    applyingTexts = true;
    try {
      for (const key of keys) {
        const record = newer[key];
        const { id, to } = keyParts(key);
        if (record.gone) {
          if (to) await run(["weaves", "gone"], "readwrite", (s) => (s.weaves.delete(key), s.gone.put({ id: key, at: record.at }))).catch(() => {});
          else await removeBook(id, { everywhere: false, at: record.at });
          turnedDown.delete(key);
          continue;
        }
        const was = await run(["books"], "readonly", (s) => s.books.get(id)).catch(() => null);
        if (was && !visible(was)) {
          turned.push(key);
          continue;
        }
        if (to) {
          const text = await run(["texts"], "readonly", (s) => s.texts.get(id)).catch(() => null);
          const weave = record.value.weave;
          if (!text) {
            turned.push(key);
            continue;
          }
          const problems = JSON.stringify(weave).length > TEXT_MOST ? ["it's too big"] : await validateWeave(weave, text);
          if (problems.length) {
            refuse(key, was?.title ?? id, `Its ${to} layer: ${problems[0]}`);
            continue;
          }
          await run(["weaves", "gone"], "readwrite", (s) => {
            const keep = (row) => s.weaves.put({ ...(row ?? { id: key }), weave, at: record.at });
            const got = s.weaves.get(key);
            if (got instanceof IDBRequest) got.onsuccess = () => keep(got.result);
            else keep(got);
            s.gone.delete(key);
          });
          turnedDown.delete(key);
          continue;
        }
        const entry = entryFrom(record.value.entry, id);
        if (!ownText(entry)) {
          // A book from the shelf or Explore: its entry, its text fetched again here when it's opened (one already here stays).
          await run(["books", "gone"], "readwrite", (s) => {
            s.books.put({ ...(was ?? { pictures: [], coverFile: null, openedAt: null }), ...entry, changedAt: record.at });
            s.gone.delete(id);
          });
          turnedDown.delete(key);
          continue;
        }
        const text = record.value.text;
        const problems = JSON.stringify(text).length > TEXT_MOST ? ["it's too big"] : text.version !== entry.version ? ["its version isn't its entry's"] : await validateBook(text);
        if (problems.length) {
          refuse(key, entry.title, problems[0]);
          continue;
        }
        // A cover this device won't show is left out; the text still comes (as text-inbox.js takes one).
        let cover = null;
        try {
          if (record.value.cover) {
            const { svg } = cleanCover(record.value.cover);
            cover = { file: await coverFile(svg), blob: new Blob([svg], { type: COVER_TYPE }) };
          }
        } catch {
          cover = null;
        }
        const full = {
          ...entry,
          changedAt: record.at,
          openedAt: was?.openedAt ?? null,
          pictures: [...(text.pictures ?? []).map((picture) => picture.file), ...(cover ? [cover.file] : [])],
          coverFile: coverPicture(text)?.file ?? null,
          ...(cover ? { cover: { file: cover.file } } : {}),
        };
        await run(["books", "texts", "pictures", "gone"], "readwrite", (s) => {
          s.books.put(full);
          s.texts.put(text);
          if (cover) s.pictures.put({ id: cover.file, blob: cover.blob });
          s.gone.delete(id);
        });
        turnedDown.delete(key);
      }
    } finally {
      applyingTexts = false;
    }
    readingChanged();
    return turned;
  },
  onChange: (fn) => textListeners.add((keys) => fn(keys.map(textShard))),
};
registerSync(textSync);

/**
 * Deletes every text in Read on this device, and where you were in each: this device's copy alone (after the account is deleted, or
 * another account takes the device for its own: settings.js clearThisDevice). Your other devices keep theirs.
 */
export async function clearReading() {
  // Texts your AI added for another account signed in on this device aren't in this Read, so they stay.
  if ((await everyBook()).some((book) => !visible(book))) {
    for (const book of await listBooks()) await removeBook(book.id, { everywhere: false, at: 0 }).catch(() => {});
    return;
  }
  await run(STORES, "readwrite", (s) => {
    for (const name of STORES) s[name].clear();
  }).catch(() => {});
  await clearHighlights();
}

// Settings → Your data → Delete your texts everywhere: each kept here for this long, to bring back.
export const TEXTS_BACK_DAYS = 7;
/** Takes every text in Read out on every device, keeping all of each here for TEXTS_BACK_DAYS to bring back. Resolves to how many. */
export async function deleteTextsEverywhere() {
  const until = Date.now() + TEXTS_BACK_DAYS * 86_400_000;
  const books = await listBooks();
  for (const book of books) {
    const snapshot = await snapshotBook(book.id).catch(() => null);
    await removeBook(book.id, { keep: snapshot ? { snapshot, until } : null }).catch(() => {});
  }
  return books.length;
}
/** The texts deleted everywhere that can still be brought back here: [{ id, title, until }]. */
export async function textsToBringBack() {
  const now = Date.now();
  const rows = ((await run(["gone"], "readonly", (s) => s.gone.getAll()).catch(() => [])) ?? []).filter((row) => row.kept && row.until > now);
  return rows.map((row) => ({ id: row.id, title: row.kept.book?.title ?? row.id, until: row.until }));
}
/** Brings back every text textsToBringBack lists, on every device. Resolves to how many. */
export async function bringBackTexts() {
  const now = Date.now();
  const rows = ((await run(["gone"], "readonly", (s) => s.gone.getAll()).catch(() => [])) ?? []).filter((row) => row.kept && row.until > now);
  for (const row of rows) await restoreBook(row.kept);
  return rows.length;
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
