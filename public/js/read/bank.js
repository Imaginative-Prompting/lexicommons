// Which words show in the language you're learning, as you read: readersound's word bank (the words you've said you
// know, per language, on this device) together with what your studying says you know (progress.js). Looking a word
// up never takes it out of the bank; only you do that.
//
// The learning strategy's rules (docs/design/learning-strategy.md, "Known words drive the weave"):
//   known        a word shows without being in the bank when you know it by reading (progress.js knows: its predicted
//                recall is at least 80% and would last a day, after at least one real test)
//   FLIP_AT      the share of a sentence's words you must know (%) for the whole sentence to show in the language:
//                the strategy's 90% (its value is woven-text.js's, so the try-out reads the same way; 95 until 10 Nov 2026)

import { knows, studiedUnits } from "../study/progress.js";
import { LANGUAGES } from "../lang/index.js";
import { BOOK_ID } from "./book-format.js";
import { registerSync } from "../sync.js";
import { sampleKey } from "../study/sample-mode.js";
// The flip threshold lives with the woven text (woven-text.js) so the try-out and the reader share it.
export { FLIP_AT, FLIP_CHOICES, flipAtOf } from "./woven-text.js";


// The sample learner's own while it's on (study/sample-mode.js), and the two below.
const KEY = sampleKey("lx.reader.bank.v1");
const listeners = new Set();

// One bank per language: { nl: { <lemma>: { added, gone?, at?, book? } } }. A removed word stays as a mark, so a later
// sync can tell "removed" from "never added". `at` and `book`: the word in a book where you added it (or last peeked
// at it), where its fade-in gloss starts.
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
let banks = load();
// Another tab's change (in a browser; Node's tests load this through know/summary.js, with no window).
globalThis.addEventListener?.("storage", (event) => {
  if (event.key !== KEY) return;
  banks = load();
  for (const fn of listeners) fn();
});

function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(banks));
  } catch {
    // Private browsing: the bank lasts for this visit.
  }
}
function save() {
  store();
  announce();
}

/** Tells everyone the bank changed (after quiet adds). */
export function announce() {
  for (const fn of listeners) fn();
}

/** Lemmas are bare dictionary forms with a straight apostrophe (book-format.js), so one word is one key. */
export const lemmaKey = (lemma) => String(lemma).replace(/’/g, "'").toLowerCase();

export const inBank = (lang, lemma) => Boolean(banks[lang]?.[lemmaKey(lemma)] && !banks[lang][lemmaKey(lemma)].gone);

/** Your studying says you know it by reading, in that language. */
export const studied = (lemma, lang = "nl") => knows(`w:${lemmaKey(lemma)}`, { skill: "read", lang });

/**
 * A function lemma → known, for book-format.js's weaveSentence: your bank as it is at each call, and what your
 * studying knows as of this one. A reader takes it once a sitting, so a word you peek at (a miss) keeps showing for
 * the rest of it, and the miss shows from the next.
 */
export function knownIn(lang) {
  const fromStudy = new Set(studiedWords(lang).map(lemmaKey));
  return (lemma) => Boolean(lemma) && (inBank(lang, lemma) || fromStudy.has(lemmaKey(lemma)));
}

/** The words your studying knows in a language, by reading. */
export function studiedWords(lang) {
  return studiedUnits(lang)
    .filter((unit) => unit.startsWith("w:"))
    .map((unit) => unit.slice(2))
    .filter((lemma) => studied(lemma, lang));
}

/**
 * Adds a word; `at` and `book` say where you added it, so its English can fade in over its next few times. quiet: saved
 * without telling anyone yet (several words at once; announce() when they're in).
 */
export function addWord(lang, lemma, { at = null, book = null, quiet = false } = {}) {
  (banks[lang] ??= {})[lemmaKey(lemma)] = { added: Date.now(), at, book };
  if (quiet) store();
  else save();
}

// "Not yet": words passed over in "Words you already know", per language. They stop being offered there, and still
// come up as suggestions as you read.
const NOT_YET_KEY = sampleKey("lx.reader.notyet.v1");
function notYetAll() {
  try {
    return JSON.parse(localStorage.getItem(NOT_YET_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
export const notYet = (lang) => notYetAll()[lang] ?? [];
export function addNotYet(lang, lemmas) {
  const all = notYetAll();
  all[lang] = [...new Set([...(all[lang] ?? []), ...lemmas.map(lemmaKey)])];
  try {
    localStorage.setItem(NOT_YET_KEY, JSON.stringify(all));
  } catch {}
}

export function removeWord(lang, lemma) {
  (banks[lang] ??= {})[lemmaKey(lemma)] = { added: Date.now(), gone: true };
  save();
}

/** A word's entry in the bank (or null). */
export const bankEntry = (lang, lemma) => {
  const entry = banks[lang]?.[lemmaKey(lemma)];
  return entry && !entry.gone ? entry : null;
};

/**
 * Peeking at a word you know restarts its fade-in gloss from here. Saved quietly: the reader lays the page out
 * again when the peek is over, never under your finger.
 */
export function restartFade(lang, lemma, at, book) {
  const entry = bankEntry(lang, lemma);
  if (!entry) return;
  Object.assign(entry, { at, book });
  try {
    localStorage.setItem(KEY, JSON.stringify(banks));
  } catch {}
}

/** The lemmas in a language's bank, newest first. */
export const bankWords = (lang) =>
  Object.entries(banks[lang] ?? {})
    .filter(([, e]) => !e.gone)
    .sort(([, a], [, b]) => b.added - a.added)
    .map(([lemma]) => lemma);

/** Every word you know in a language, your bank and your studying, as a set (the shelf's coverage). */
export const knownSet = (lang) => new Set([...bankWords(lang), ...studiedWords(lang)]);

/** Calls fn when a bank changes (here or in another tab). Returns a function to stop. */
export function onBankChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- on your other devices (sync.js) ----------

// "<lang>:<lemma>" → where you added it ({ at, book }), dated when you added it or took it out (a removed word's mark is
// its deletion). Where a peek last restarted its English (restartFade) stays on the device.
const lemmaOk = (lemma) => typeof lemma === "string" && lemma.length > 0 && lemma.length <= 100 && lemma !== "__proto__" && lemma === lemmaKey(lemma) && !/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(lemma);
/** A key's language and lemma, or null when it isn't a word of a known language. */
function keyParts(key) {
  const colon = key.indexOf(":");
  const lang = key.slice(0, colon);
  const lemma = key.slice(colon + 1);
  return colon > 0 && Object.hasOwn(LANGUAGES, lang) && lemmaOk(lemma) ? { lang, lemma } : null;
}
let applying = false;

export const bankSync = {
  id: "word-bank",
  label: "Your words",
  icon: "list",
  counted: (n) => `${n.toLocaleString()} ${n === 1 ? "word" : "words"}`,
  records() {
    const out = {};
    for (const [lang, bank] of Object.entries(banks)) {
      if (!Object.hasOwn(LANGUAGES, lang) || !bank || typeof bank !== "object") continue;
      for (const [lemma, entry] of Object.entries(bank)) {
        if (!lemmaOk(lemma) || !Number.isFinite(entry?.added)) continue;
        out[`${lang}:${lemma}`] = entry.gone ? { at: entry.added, gone: true } : { at: entry.added, value: { at: entry.at ?? null, book: entry.book ?? null } };
      }
    }
    return out;
  },
  check(record, key) {
    if (!keyParts(key)) return false;
    if (record.gone) return record.about === undefined;
    const value = record.value;
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "at,book") return false;
    return (value.at === null || (Number.isInteger(value.at) && value.at >= 0 && value.at <= 10_000_000)) && (value.book === null || (typeof value.book === "string" && BOOK_ID.test(value.book)));
  },
  apply(newer) {
    for (const [key, record] of Object.entries(newer)) {
      const { lang, lemma } = keyParts(key);
      (banks[lang] ??= {})[lemma] = record.gone ? { added: record.at, gone: true } : { added: record.at, at: record.value.at, book: record.value.book };
    }
    // Everyone hears of it (the reader weaves again); the sync doesn't (it brought it).
    applying = true;
    try {
      save();
    } finally {
      applying = false;
    }
    return [];
  },
  onChange: (fn) => onBankChange(() => applying || fn()),
};
registerSync(bankSync);

/** Every bank, for Settings → Your data. */
export const bankExport = () => structuredClone(banks);

/** Empties every bank on this device, with the words passed over and where the suggestions' count stands. */
export function clearBanks() {
  banks = {};
  try {
    localStorage.removeItem(NOT_YET_KEY);
    localStorage.removeItem(SUGGEST_KEY);
  } catch {}
  save();
}

// The suggestions' count, per book: { pages: new pages read since you last added a word, hw: the furthest word read }.
const SUGGEST_KEY = sampleKey("lx.reader.suggest.v1");
export function suggestClock(book) {
  try {
    return { pages: 0, hw: -1, ...JSON.parse(localStorage.getItem(SUGGEST_KEY) ?? "{}")?.[book] };
  } catch {
    return { pages: 0, hw: -1 };
  }
}
export function setSuggestClock(book, clock) {
  try {
    const all = JSON.parse(localStorage.getItem(SUGGEST_KEY) ?? "{}") ?? {};
    all[book] = clock;
    localStorage.setItem(SUGGEST_KEY, JSON.stringify(all));
  } catch {}
}
