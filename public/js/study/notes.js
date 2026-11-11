// A pack's notes on this device (pack-notes.js): kept in Cache Storage with what names them in localStorage, read when a sentence's notes are first asked for, so a start never pays for them.
// Synced with the packs, for the packs here in the language you're learning; each file checked by its content before it's kept. Offline, or refused, the one here stays; nothing here ever stands in the way of studying.
// Taking a file and reading it back (fetch, JSON, the check, the version, Cache Storage) is the notes' own worker's (notes-worker.js): a file is checked word by word, and on the page
// path-nl's held a phone's main thread 64–86 ms at 4× while Translate was typed (8 Nov 2026). The page keeps what names the files and the checked file it's handed. No worker, or one
// that fails or doesn't answer: the page does the same work itself (notes-worker.js take, read), as before. A file is kept here packed (notes-worker.js packed): each entry its
// own JSON, read the first time its sentence or word is asked for, so no task reads a whole file.

import { formLine, formsRef, notesFor, notesRef } from "./pack-notes.js";
import { packed, read, take } from "./notes-worker.js";

const KEY = "lx.notes.v1";
const here = new Map(); // pack id → { version, notes: a held file }

/** A packed file as it's held: { file, read: Map(key → its entry, once read) }. */
const held = (file) => (file ? { file, read: new Map() } : null);
/** One entry of a held file (field: "items" or "forms"), read from its JSON the first time it's asked for; null when there's none. */
function entryOf(holder, field, key) {
  const entries = holder?.file?.[field];
  if (!entries || typeof key !== "string" || !Object.hasOwn(entries, key) || typeof entries[key] !== "string") return null;
  if (!holder.read.has(key)) holder.read.set(key, JSON.parse(entries[key]));
  return holder.read.get(key);
}
/** A sentence's notes from a held file, as pack-notes.js notesFor gives them. */
function notesIn(holder, item) {
  const itemId = String(item?.id ?? "").split("/").pop();
  const entry = entryOf(holder, "items", itemId);
  return entry ? notesFor({ items: { [itemId]: entry } }, item) : null;
}
/** A word's line from a held forms file, as pack-notes.js formLine gives it. */
function formIn(holder, lemma, text) {
  const written = entryOf(holder, "forms", lemma);
  return written ? formLine({ forms: { [lemma]: written } }, lemma, text) : null;
}

function readKept() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {}
  return {};
}
function writeKept(kept) {
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {}
}

// The worker, while work is out: each message answered by its own number with { value } or { error }; null when there's no worker, it fails, or it
// doesn't answer in time (a take fetches, so it's given longer). It's let go once nothing is waiting.
const WAIT = { take: 120_000, read: 20_000 };
let helper = null; // { worker, waiting: Map(seq → { resolve, timer }), settle }
let asked = 0;
function inWorker(message) {
  if (typeof Worker !== "function") return Promise.resolve(null);
  if (!helper) {
    let worker;
    try {
      worker = new Worker(new URL("./notes-worker.js", import.meta.url), { type: "module", name: "lexicommons-notes" });
    } catch {
      return Promise.resolve(null);
    }
    const waiting = new Map();
    const settle = (seq, answer) => {
      const one = waiting.get(seq);
      if (!one) return;
      clearTimeout(one.timer);
      waiting.delete(seq);
      one.resolve(answer && typeof answer === "object" && ("value" in answer || typeof answer.error === "string") ? answer : null);
      if (!waiting.size && helper?.worker === worker) {
        worker.terminate();
        helper = null;
      }
    };
    worker.onmessage = ({ data }) => settle(data?.seq, data);
    worker.onerror = () => {
      for (const seq of [...waiting.keys()]) settle(seq, null);
    };
    helper = { worker, waiting, settle };
  }
  const { worker, waiting, settle } = helper;
  const seq = ++asked;
  return new Promise((resolve) => {
    waiting.set(seq, { resolve, timer: setTimeout(() => settle(seq, null), WAIT[message.op]) });
    try {
      worker.postMessage({ ...message, seq });
    } catch {
      settle(seq, null);
    }
  });
}

/** A file taken and kept, by the worker or else here: the checked file held, or it throws in words (and nothing is kept). */
async function takeFile(message) {
  const answer = await inWorker({ op: "take", ...message });
  if (answer?.error) throw new Error(answer.error);
  if (answer) return held(answer.value);
  return held(packed(message.kind, (await take(message)).value));
}
/** A kept file read back and checked again, by the worker or else here: the checked file held, or null. */
async function readFile(message) {
  const answer = await inWorker({ op: "read", ...message });
  if (answer) return held(answer.value ?? null);
  return held(packed(message.kind, (await read(message)).value));
}

/** Brings the notes of these packs in line with the catalog. packIds: the packs on this device, in the language you're learning. Resolves to the problems, in words; never rejects. */
export async function syncNotes(catalogue, packIds) {
  const problems = [];
  // Saving data: they wait. A sentence simply has no notes yet.
  if (typeof navigator !== "undefined" && navigator.connection?.saveData) return problems;
  const kept = readKept();
  for (const id of packIds) {
    const ref = notesRef(catalogue, id);
    if (!ref || kept[id]?.version === ref.version) continue;
    try {
      const notes = await takeFile({ kind: "notes", url: ref.url, owner: id, version: ref.version, old: kept[id]?.url });
      kept[id] = { version: ref.version, url: ref.url };
      writeKept(kept);
      here.set(id, { version: ref.version, notes });
    } catch (error) {
      problems.push({ at: `notes.${id}`, message: `"${id}"'s notes couldn't be taken (${error.message}); it's used without them for now.` });
    }
  }
  return problems;
}

// The pack's notes from the cache, once.
const reading = new Map();
function loadNotes(id) {
  const ref = readKept()[id];
  if (!ref) return Promise.resolve(null);
  if (here.get(id)?.version === ref.version) return Promise.resolve(here.get(id).notes);
  if (reading.has(id)) return reading.get(id);
  const going = (async () => {
    try {
      const notes = await readFile({ kind: "notes", url: ref.url, owner: id });
      if (!notes) return null;
      here.set(id, { version: ref.version, notes });
      return notes;
    } catch {
      return null;
    } finally {
      reading.delete(id);
    }
  })();
  reading.set(id, going);
  return going;
}

// A language's word forms, kept the same way: under forms:<lang> in what names them.
const formsHere = new Map(); // language → { version, forms }

/** Brings a language's word forms in line with the catalog. Resolves to the problems, in words; never rejects. */
export async function syncForms(catalogue, lang) {
  if (typeof navigator !== "undefined" && navigator.connection?.saveData) return [];
  const ref = formsRef(catalogue, lang);
  const kept = readKept();
  const key = `forms:${lang}`;
  if (!ref || kept[key]?.version === ref.version) return [];
  try {
    const forms = await takeFile({ kind: "forms", url: ref.url, owner: lang, version: ref.version, old: kept[key]?.url });
    kept[key] = { version: ref.version, url: ref.url };
    writeKept(kept);
    formsHere.set(lang, { version: ref.version, forms });
    return [];
  } catch (error) {
    return [{ at: `forms.${lang}`, message: `${lang}'s word forms couldn't be taken (${error.message}); it's used without them for now.` }];
  }
}

const readingForms = new Map();
function loadForms(lang) {
  const ref = readKept()[`forms:${lang}`];
  if (!ref) return Promise.resolve(null);
  if (formsHere.get(lang)?.version === ref.version) return Promise.resolve(formsHere.get(lang).forms);
  if (readingForms.has(lang)) return readingForms.get(lang);
  const going = (async () => {
    try {
      const forms = await readFile({ kind: "forms", url: ref.url, owner: lang });
      if (!forms) return null;
      formsHere.set(lang, { version: ref.version, forms });
      return forms;
    } catch {
      return null;
    } finally {
      readingForms.delete(lang);
    }
  })();
  readingForms.set(lang, going);
  return going;
}

/** Which form a word is, as a line, or null (the dictionary form, or none written). lemma: its dictionary word; text: as the sentence has it. */
export async function formOfWord(lang, lemma, text) {
  return formIn(await loadForms(lang), lemma, text);
}
/** The same at once, if they've been read: null otherwise (notesReady reads them when it's given a language). */
export const formNow = (lang, lemma, text) => formIn(formsHere.get(lang)?.forms ?? null, lemma, text);
/** Reads a language's forms, for a screen that wants them at once later. */
export const formsReady = (lang) => loadForms(lang).then(() => {});

/** A sentence's notes: { words, marks } or null. item: from the view, with its pack. A copy's (copyOf) are its source pack's, where that one has them. */
export async function notesOfItem(item) {
  if (!item?.pack) return null;
  if (item.copyOf) {
    const own = notesIn(await loadNotes(item.copyOf), item);
    if (own) return own;
  }
  return notesIn(await loadNotes(item.pack), item);
}

/** The same at once, if they've been read: null otherwise (notesReady reads them). */
export const notesNow = (item) => (item?.copyOf ? notesIn(here.get(item.copyOf)?.notes ?? null, item) : null) ?? notesIn(here.get(item?.pack)?.notes ?? null, item);

/** Reads these packs' notes, for a screen that wants them at once later (a session, as it starts). */
export const notesReady = (packIds) => Promise.all(packIds.map(loadNotes)).then(() => {});
