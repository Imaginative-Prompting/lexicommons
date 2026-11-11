// A word as the language writes it. Every word is keyed by its dictionary form, lowercase in most languages (pack-format.js lemmaOf,
// read/bank.js lemmaKey): right for studying, and wrong to show for a word the language always capitalizes (Dutch's Engels and
// Nederland, a name). A word shows capitalized when every place it stands mid-sentence in this device's packs and books is
// capitalized, and there's at least one such place; otherwise it shows as its key. Where a sentence starts doesn't count: every word
// is capitalized there. Only what's shown changes: keys, evidence and sync stay as they are.
//
// Packs: content.js tallies the sentences of every pack of the language (on or off) while it builds its view, a slice at a time, and
// hands the tally here (setPackWriting). Books: the reader tallies a book's sentences when it opens it (noteBook), kept on this device
// per language and book and never synced, so a word you met only in a book shows as written in Knowledge too.

import { sentenceEnds } from "../lang/index.js";

/** The first letter of a word as written, or null (digits, marks, a script with no case). */
function firstLetter(text, lang) {
  const letter = String(text).match(/\p{L}/u)?.[0];
  if (!letter) return null;
  const upper = letter !== letter.toLocaleLowerCase(lang);
  const lower = letter !== letter.toLocaleUpperCase(lang);
  return upper || lower ? { upper } : null;
}

// A word without what's around it: quotes, brackets and punctuation before or after (inside, a dash or apostrophe stays).
const core = (text) => String(text).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Whether a word ends its sentence (its end mark, before any closing quote or bracket). */
function endsSentence(text, ends) {
  const bare = String(text).replace(/["'”’»›)\]]+$/u, "");
  return ends.some((end) => bare.endsWith(end));
}

// A word all in capitals (two letters or more: WANNEER on a sign, a shout) says nothing about how it's written either.
const allCaps = (text, lang) => {
  const letters = String(text).match(/\p{L}/gu) ?? [];
  return letters.length > 1 && letters.every((letter) => letter !== letter.toLocaleLowerCase(lang));
};

/**
 * Counts, for each lemma, the places it stands mid-sentence and how many of them are capitalized, with its form as written: a word
 * spelled as the lemma is (IJsland, T-shirt), else null (only its forms were seen: Amerikaanse). add() takes one sentence's words in
 * order, [[text, lemma], …] as a pack's item has them: the first starts the sentence, and so does one after a word that ends one.
 * A word in capitals throughout doesn't count. vetoOnly: only its lowercase places count, its capitalized ones not at all (a woven
 * book's words stand in another language's sentences, which capitalize for themselves: its names, its titles, its O).
 * done() hands back Map(lemma → [mid, capitalized, form]).
 */
// The lemmas a tally has seen capitalized at least once: the only ones a decision has to look at (a language's packs hold some 20,000
// lemmas, a couple of hundred of them capitalized somewhere).
const capsOf = new WeakMap();
export function writingTally(lang, { vetoOnly = false } = {}) {
  const ends = sentenceEnds(lang);
  const counts = new Map();
  const caps = new Set();
  capsOf.set(counts, caps);
  const lowerOf = (text) => text.toLocaleLowerCase(lang);
  return {
    add(words) {
      let starts = true;
      for (const word of words ?? []) {
        const text = word?.[0];
        const lemma = word?.[1];
        if (typeof text !== "string") continue;
        if (!starts && typeof lemma === "string" && lemma) {
          const letter = firstLetter(text, lang);
          if (letter && !allCaps(text, lang) && !(vetoOnly && letter.upper)) {
            const row = counts.get(lemma) ?? [0, 0, null];
            row[0]++;
            if (letter.upper) {
              row[1]++;
              caps.add(lemma);
              const bare = core(text);
              if (row[2] === null && lowerOf(bare) === lowerOf(lemma)) row[2] = bare;
            }
            counts.set(lemma, row);
          }
        }
        starts = endsSentence(text, ends);
      }
    },
    done: () => counts,
  };
}

/** A lemma with its first letter capitalized as the language does it (Dutch's ij is one letter: IJsland). */
export function capitalized(lemma, lang) {
  if (lang === "nl" && /^ij/u.test(lemma)) return `IJ${lemma.slice(2)}`;
  const [first = "", ...rest] = Array.from(lemma);
  return first.toLocaleUpperCase(lang) + rest.join("");
}

/**
 * From tallies (each a Map as writingTally's done(), or a book's kept rows), the words to show capitalized: Map(lemma → form), for each
 * lemma that stands mid-sentence somewhere and is capitalized in every such place. Its form is a tally's own (the first that has one),
 * else the lemma capitalized. Only lemmas some tally has capitalized are looked at, each summed across the tallies.
 */
export function writtenForms(tallies, lang) {
  const candidates = new Set();
  for (const tally of tallies) {
    const caps = capsOf.get(tally);
    if (caps) for (const lemma of caps) candidates.add(lemma);
    else for (const [lemma, row] of tally) if (row[1] > 0) candidates.add(lemma);
  }
  const forms = new Map();
  for (const lemma of candidates) {
    let mid = 0;
    let cap = 0;
    let form = null;
    for (const tally of tallies) {
      const row = tally.get(lemma);
      if (!row) continue;
      mid += row[0];
      cap += row[1];
      form ??= row[2];
    }
    if (mid > 0 && cap === mid) forms.set(lemma, form ?? capitalized(lemma, lang));
  }
  return forms;
}

// ---------- what's in use: the packs' tally (content.js) and the books' (kept on this device) ----------

const BOOKS_KEY = "lx.written.books.v1";
let packs = { lang: null, tally: new Map() };
// The decision for the packs' language, made as soon as its packs or books change (never on a draw); another language's, when asked.
let decided = { lang: null, forms: new Map() };
let others = new Map();
const listeners = new Set();
const storage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};
function loadBooks() {
  try {
    return JSON.parse(storage()?.getItem(BOOKS_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
let books = loadBooks();
const bookTallies = (lang) => Object.values(books[lang] ?? {}).map((rows) => new Map(Object.entries(rows)));
const sameForms = (a, b) => a.size === b.size && [...a].every(([lemma, form]) => b.get(lemma) === form);
/** Decides again for the packs' language; tells whoever listens (onWritten) after this task's own work, and only when a form changed. */
function decide() {
  others = new Map();
  if (!packs.lang) return;
  const forms = writtenForms([packs.tally, ...bookTallies(packs.lang)], packs.lang);
  const changed = decided.lang !== packs.lang || !sameForms(decided.forms, forms);
  decided = { lang: packs.lang, forms };
  if (changed && listeners.size) queueMicrotask(() => listeners.forEach((fn) => fn()));
}
globalThis.addEventListener?.("storage", (event) => {
  if (event.key !== BOOKS_KEY) return;
  books = loadBooks();
  decide();
});

/** Calls fn() once a word's shown form changes (a new view's packs, a book noted or gone). Returns a function that stops it. */
export function onWritten(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The packs' tally for the view content.js has just put in place (its language's): decided at once, so no draw pays for it. */
export function setPackWriting(lang, tally) {
  packs = { lang, tally: tally ?? new Map() };
  decide();
}

/**
 * Keeps a book's tally on this device (its sentences as [[text, lemma], …], each in order; woven: a woven book's, which only veto).
 * Only what can change what's shown is kept:
 * every lemma it has capitalized mid-sentence, and the lowercase ones that are capitalized somewhere else this device knows of now
 * (the packs, another book), which veto that. A lowercase place in this book for a lemma that something added later capitalizes counts
 * from the next time the book is opened.
 */
export function noteBook(lang, bookId, sentences, { woven = false } = {}) {
  if (!lang || !bookId) return;
  const tally = writingTally(lang, { vetoOnly: woven });
  for (const words of sentences) tally.add(words);
  const own = tally.done();
  const elsewhere = writtenForms([...(packs.lang === lang ? [packs.tally] : []), ...Object.entries(books[lang] ?? {}).filter(([id]) => id !== bookId).map(([, rows]) => new Map(Object.entries(rows)))], lang);
  const rows = {};
  for (const [lemma, row] of own) if (row[1] > 0 || elsewhere.has(lemma)) rows[lemma] = row;
  const before = JSON.stringify(books[lang]?.[bookId] ?? null);
  if (before === JSON.stringify(rows)) return;
  books = { ...books, [lang]: { ...(books[lang] ?? {}), [bookId]: rows } };
  decide();
  try {
    storage()?.setItem(BOOKS_KEY, JSON.stringify(books));
  } catch {
    // Full or private: it holds for this visit.
  }
}

/** A book that's gone from the device: its places no longer count. */
export function forgetBook(lang, bookId) {
  if (!books[lang]?.[bookId]) return;
  const { [bookId]: _gone, ...rest } = books[lang];
  books = { ...books, [lang]: rest };
  decide();
  try {
    storage()?.setItem(BOOKS_KEY, JSON.stringify(books));
  } catch {}
}

/** How a lemma of this language is shown: as the language writes it where that's decided (above), else the lemma itself. */
export function writtenOf(lang, lemma) {
  if (typeof lemma !== "string" || !lemma) return lemma;
  if (decided.lang === lang) return decided.forms.get(lemma) ?? lemma;
  if (!others.has(lang)) others.set(lang, writtenForms(bookTallies(lang), lang));
  return others.get(lang).get(lemma) ?? lemma;
}
