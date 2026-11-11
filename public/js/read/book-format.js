// The book and weave formats, and the rules every book and weave follows wherever it comes from: the shared library's
// pipeline, a text imported on the device, or your AI. Pure (no DOM), so the app, the Worker, the pipeline and the
// tests all run the same code: the same tokenizer, the same sentence breaks, the same checks and the same render.
//
// A book (lexicommons-book) is a flat stream of words, the address space everything points into: positions, the weave,
// lookups and evidence ("<book>@<version>#<i>"). A word is a whitespace token with its punctuation attached. Spans are
// half-open [s, e). The version is a hash of the content, so it never shifts under anything that points into it.
// A picture book (StoryWeaver's) also has, all optional:
//   pages     [{ s, e, picture }] tiling the words in order, each starting and ending at a paragraph boundary, and
//             every chapter starting on a page (a page may hold no words); picture is an index into pictures, or null
//   pictures  [{ file, w, h, alt, credit }]: file is "<16 hex of the image's sha256>.<jpg|png|webp>", served from the
//             library's shared pictures/ (picturePath), so a new version of a book reuses them; w and h are pixels; alt
//             says what it shows, in the learner's language; credit says who made it
//   breaks    word indexes where a line breaks inside a paragraph (a picture book's phrase lines); sentences cross them
// Any book may have a cover:
//   cover     an index into pictures: the book's cover picture. A book without pages may have pictures only for it
//             (a novel's cover, from its original illustrations); without cover, a picture book's cover is its first
//             page's picture (coverPicture)
//
// A weave (lexicommons-weave) is one book version in one other language, of one of three kinds:
//   "weave"     the book is in a language you know (from), and you're learning `to`: words you know come in as `to`.
//   "help"      the book is in the language you're learning (from), with `to` (say English) as help where you need it.
//   "parallel"  a person's translation of a picture book into `to`, beside it: one string a page (pages), and a sentence's
//               own string where its page's sentences line up (sentences, else null), with the translation's own license,
//               credit, source and what wrote it; no glosses, lemmas or literal line (parallelProblems has its rules).
// Per sentence of a weave or help layer:
//   t     one [target, lemma] per word, in order (t[j] is word s + j): the word in `to`, as used here, and the lemma
//         of the language being learned, which is the word-bank key (a "weave": the target's lemma; "help": the book
//         word's own). It's the bare dictionary form; null means no word to learn (names, punctuation, words the
//         target language doesn't express, like English do-support).
//   text  the natural sentence in `to`: the only place `to`'s word order happens.
//   m     one [target, cue, sources, lemma] per word of `text`, in `to`'s order, tiling it exactly: the words of the
//         book it carries (cue), and their sentence-relative indices (sources), so moved words and the switch between
//         the two orders come out mechanically. In a weave, m is the literal line; its lemma is the target's (null
//         in a help layer, whose literal line is t's glosses in the book's order).
//   u     optional idiom upgrades [k, len, target], shown only once every learnable word in the run (every word with
//         a lemma; at least one) is known, so an idiom can never hold back a word you know or show one you don't.
//   c     optional pattern ids from the target language's catalog.
//
// The checks here are hard: a book or weave that fails them is refused. They're structural on purpose. A check with
// any false positives would make the pipeline's repair loop force wrong output, so judgment calls (does this English
// word really mean that?) belong to the audit (scripts/books/weave-audit.mjs) and the judge, never here.

import { LANGUAGES, sentenceEnds, spaceBeforeNext, typeset, withoutInvisible } from "../lang/index.js";
import { readingProblem } from "../lang/readings.js";

// What the format needs to know about each language (segmenter, separator, lemma case, abbreviations, the pattern
// catalog a weave's `c` may use) is the language registry's, public/js/lang/; it's exported here as well, so
// everything that reads it from the format still does.
export { LANGUAGES };

export const BOOK_FORMAT = "lexicommons-book";
export const WEAVE_FORMAT = "lexicommons-weave";
export const FORMAT_VERSION = 1;

/**
 * A layer's kinds: a weave (the book in its language, words of another woven in), help (the book in the language being
 * learned, your language's English over its words), and parallel (a person's translation beside a picture book, page by
 * page, and sentence by sentence where they line up: parallelProblems).
 */
export const WEAVE_KINDS = ["weave", "help", "parallel"];

/** What the app says made a layer the books pipeline made (its file names the pipeline and the model), in plain words. */
export const MADE_WITH_AI = "Made for Lexicommons with an AI model and checked sentence by sentence";
/**
 * A layer's credit as the app shows it: the books pipeline's layers say they were made with an AI model (each file names it, and its
 * judge's pass), whatever their own credit field says; any other layer (someone's own) keeps its own credit.
 */
export function layerCredit(layer) {
  const made = layer?.made;
  return made && /^lexicommons-books\b/.test(String(made.pipeline ?? "")) && made.model ? MADE_WITH_AI : (layer?.credit ?? null);
}

const HEX16 = /^[0-9a-f]{16}$/;
const HEX12 = /^[0-9a-f]{12}$/;
/** A text's id: 2–80 lowercase letters, digits and dashes (a book's, your own text's "text-<uuid>", a relayed one's). */
export const BOOK_ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
const PARA_KINDS = new Set(["p", "h", "v", "scene"]);
const PICTURE_FILE = /^[0-9a-f]{16}\.(?:jpg|png|webp)$/;
const PICTURE_MAX_SIDE = 10000;
const HAS_LETTER = /\p{L}/u;
const HAS_ALNUM = /[\p{L}\p{N}]/u;
// A word's edges (frameOf): a combining mark is part of the letter before it, so a word that ends in one keeps it
// (5 Nov: Hindi चलना, मैं and Thai ที่ end in a vowel sign or tone mark, which was cut off as punctuation).
const ALNUM = /[\p{L}\p{M}\p{N}]/u;
const APOSTROPHE = /['’]/u;
// Quotation marks (apostrophes aren't: they're part of a word's frame only as elision).
const QUOTES = /[“”"«»„‚‹›]/u;
// Hawaiian's ʻokina and Uzbek's ʻ and ʼ (U+02BB, U+02BC) are letters with no case (ʻāina, oʻzbek, taʼlim), so a
// lowercase dictionary form may hold them.
const LEMMA_LOWER = /^[\p{Ll}\u02BB\u02BC](?:[\p{Ll}\p{M}\u02BB\u02BC'’ -]|[\u200C\u200D](?=\p{Ll}))*$/u;
const LEMMA_ANY = /^\p{L}(?:[\p{L}\p{M}'’ -]|[\u200C\u200D](?=\p{L}))*$/u;
const LEMMA_MAX = 60;

// ---------- tokenizing and sentence breaks ----------

/** Text as books store it: NFC, without invisible characters. */
export function normalizeText(text) {
  return withoutInvisible(String(text).normalize("NFC"));
}

// Inside a whitespace token, a dash or ellipsis joining two words ends the first word: "it—but" is "it—" and "but",
// so each half can be learned on its own. An en dash splits only between letters, so "1832–1898" stays one token. A
// straight quote after it opens the next word when a letter follows (McGregor—"I is "McGregor—" and "I); before a
// space or the token's end it closes ("three—" stays whole).
const JOIN_MARK = String.raw`[—―…]+|(?<=\p{L})–+`;
const JOIN_NEXT = String.raw`[\p{L}\p{N}“‘(\[«¿¡]|["'][\p{L}\p{N}]`;
const JOIN = new RegExp(`(${JOIN_MARK})(?=${JOIN_NEXT})`, "gu");
const JOIN_END = new RegExp(`(?:${JOIN_MARK})$`, "u");
const JOIN_START = new RegExp(`^(?:${JOIN_NEXT})`, "u");

/**
 * Whether two words were written together, split only by tokenize() at a dash or an ellipsis ("it—" and "but"): then
 * they're shown together, with no space between. A dash that's a word of its own (" — ") keeps its spaces.
 */
export function joinsNext(word, next) {
  const end = typeof word === "string" ? JOIN_END.exec(word) : null;
  return Boolean(end && end.index > 0 && typeof next === "string" && JOIN_START.test(next));
}

/**
 * The space shown between two words: none where they were written together (joinsNext); the language's own before a
 * mark it spaces (French: a narrow no-break space before "?"; lang/index.js spaceBeforeNext, the rule typeset uses
 * too); otherwise the separator (a space, or none for a language written without).
 */
export function gapBetween(word, next, lang, separator = LANGUAGES[lang]?.separator ?? " ") {
  if (joinsNext(word, next)) return "";
  return (separator ? spaceBeforeNext(lang, next) : null) ?? separator;
}

/**
 * Words as text, as the page shows them: the gap between each two (gapBetween), and, given their language, typeset
 * inside them too ("viens?" is "viens ?" in French). Without a language, plain spaces.
 */
export function joinWords(words, separator = " ", lang = null) {
  let out = "";
  words.forEach((word, i) => {
    out += (i > 0 ? gapBetween(words[i - 1], word, lang, separator) : "") + word;
  });
  return lang ? typeset(lang, out) : out;
}

/**
 * Splits text into words: whitespace tokens with their punctuation attached, split where a dash joins two words.
 * lang picks the language's segmenter. A language written without spaces (segmenter "fixed": Japanese, Chinese) is
 * never tokenized: its texts come with their words split once, by whoever wrote the file, and kept as they are.
 */
export function tokenize(text, lang = "en") {
  const segmenter = LANGUAGES[lang]?.segmenter ?? "spaces";
  if (segmenter === "fixed") throw new Error(`${LANGUAGES[lang].name} is written without spaces: its words come split in the file and are never tokenized.`);
  if (segmenter !== "spaces") throw new Error(`No segmenter for ${lang} yet.`);
  const words = [];
  for (const token of normalizeText(text).split(/\s+/u)) {
    if (!token) continue;
    let start = 0;
    for (const match of token.matchAll(JOIN)) {
      const end = match.index + match[0].length;
      if (match.index > 0 && end > start) {
        words.push(token.slice(start, end));
        start = end;
      }
    }
    words.push(token.slice(start));
  }
  return words.filter(Boolean);
}

// What opens a quote or a bracket in a language written without spaces: it goes with the word after it.
const OPENS_NEXT = /^[「『（【〈《〔［｛“‘(\[{]+$/u;

/**
 * A text's words, for a text someone brings in themselves (pasted, a .txt, an EPUB): tokenize() for a language written with spaces. One
 * written without (segmenter "fixed": Japanese, Chinese) is split here, once, by the engine's own word breaker (Intl.Segmenter), and
 * the split is kept in the book as any writer's is: each word with the marks after it, an opening quote or bracket with the word it
 * opens, the spaces left out. Engines differ in where they break, so two devices may split one text differently; each keeps its own.
 * Throws a message meant for people where the engine has no word breaker.
 */
export function splitWords(text, lang = "en") {
  if ((LANGUAGES[lang]?.segmenter ?? "spaces") !== "fixed") return tokenize(text, lang);
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    throw new Error(`${LANGUAGES[lang].name} is written without spaces, and this browser can't split it into words. An up-to-date Safari, Chrome or Firefox can.`);
  }
  const words = [];
  let opening = "";
  for (const { segment, isWordLike } of new Intl.Segmenter(LANGUAGES[lang].locale ?? lang, { granularity: "word" }).segment(normalizeText(text))) {
    const piece = withoutInvisible(segment).replace(/\s+/gu, "");
    if (!piece) continue;
    if (isWordLike) {
      words.push(opening + piece);
      opening = "";
    } else if (OPENS_NEXT.test(piece)) opening += piece;
    else if (opening || !words.length) {
      // A mark with nothing before it to close (a line of dashes, a mark right after an opening bracket): a word of its own.
      words.push(opening + piece);
      opening = "";
    } else words[words.length - 1] += piece;
  }
  if (opening) words.length ? (words[words.length - 1] += opening) : words.push(opening);
  return words;
}

// Japanese and Chinese brackets too, so 「…。」 breaks after the bracket.
const OPENERS = /^[“‘"'(\[«¿¡—–―…「『（【〈《]*/u;
const CLOSERS = /[”’"')\]»」』）】〉》]*$/u;
const INITIAL = /^\p{Lu}\.$/u;
// One initial or several run together (J., J.R.), for the joins' look-back.
const INITIALS = /^(?:\p{Lu}\.)+$/u;
// What a new sentence starts with, in any language: a capital, a digit, or a letter of a script with no capitals (kana,
// Devanagari; Georgian's Mkhedruli, which Unicode files as lowercase beside its all-caps Mtavruli), after Hawaiian's
// ʻokina if it leads (ʻO).
const STARTS_SENTENCE = /^[\u02BB\u02BC]?[\p{Lu}\p{Lo}\p{N}\u10D0-\u10FF]/u;

function breaksAfter(word, next, abbreviations, ends) {
  const core = word.replace(CLOSERS, "");
  if (!ends.some((end) => core.endsWith(end))) return false;
  const bare = core.replace(OPENERS, "");
  if (INITIAL.test(bare) || abbreviations.has(bare.toLowerCase())) return false;
  const start = next.replace(OPENERS, "");
  return STARTS_SENTENCE.test(start);
}

/**
 * Sentence spans for a book's words. A sentence never crosses a paragraph; a heading or a verse line is broken only
 * where a sentence ends inside it. A break needs a sentence-ending mark (. ! ? …, or one of the language's own, such as
 * Greek's ;, before any closing quotes), a next word that starts with a capital, a digit or a letter with no case (in
 * any language), and the word not to be an abbreviation or an initial. So dialogue attribution stays with its quote ("…conversations?"
 * thought Alice).
 */
export function segmentSentences(words, paras, lang) {
  const abbreviations = new Set(LANGUAGES[lang]?.abbreviations ?? []);
  const ends = sentenceEnds(lang);
  const sentences = [];
  for (const para of paras) {
    if (para.k === "scene" || para.e <= para.s) continue;
    let start = para.s;
    for (let i = para.s; i < para.e - 1; i++) {
      if (breaksAfter(words[i], words[i + 1], abbreviations, ends)) {
        sentences.push([start, i + 1]);
        start = i + 1;
      }
    }
    sentences.push([start, para.e]);
  }
  return sentences;
}

// ---------- hashes ----------

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A book version: 16 hex of the SHA-256 of its content (not its title, rights or source). */
export async function bookVersion(book) {
  const parts = [book.lang, book.words, book.italic, book.paras, book.chapters, book.sentences];
  // A picture book's pages, pictures and line breaks are content too, and so is a cover; a book without them hashes as
  // it always has.
  if (book.pages || book.pictures || book.breaks) parts.push(book.pages ?? null, book.pictures ?? null, book.breaks ?? null);
  if (book.cover !== undefined) parts.push({ cover: book.cover });
  return (await sha256Hex(JSON.stringify(parts))).slice(0, 16);
}

/** Where a picture lives in the open library (prefix with /library/ to fetch it): named by its hash, shared by books. */
export function picturePath(file) {
  return `pictures/${file}`;
}

/** A book's cover picture ({ file, w, h, alt, credit }): its cover, else its first page's picture; null when it has none. */
export function coverPicture(book) {
  const i = book?.cover ?? book?.pages?.[0]?.picture;
  return Number.isInteger(i) ? (book.pictures?.[i] ?? null) : null;
}

// A book's kind, from what it says about itself. Non-fiction first (it holds "fiction"), and history etc. after fiction, so science fiction is fiction.
function kindOfBook(book) {
  if (["novel", "stories", "children", "nonfiction"].includes(book?.kind)) return book.kind;
  const about = [book?.subjects, book?.topics].flat().filter((s) => typeof s === "string").join(" ").toLowerCase();
  if (/non-?fiction/.test(about)) return "nonfiction";
  if (/child|kids|fairy|nursery|picture book/.test(about)) return "children";
  if (/short stor|stories|tales/.test(about)) return "stories";
  if (/fiction|novel/.test(about)) return "novel";
  if (/history|science|biograph|essay|memoir|travel|nature/.test(about)) return "nonfiction";
  return null;
}

/** The shelf's books with no cover of their own that have a drawing of their own (book-<id>), of what the book is about. */
const DRAWN_BOOKS = new Set(["carroll-alice-wonderland-opening"]);

/**
 * A drawn cover for a book with none of its own: a drawing's id in public/pictures/ (loadPictures, then pictureNode, cropped to the
 * cover from the square's middle). A shelf book's own drawing first; for any other book, its kind (novel, stories, children, nonfiction) comes from its kind, subjects or topics; a book
 * that says none gets one from its id, so a shelf isn't one drawing. Its color follows its id, so the same book always looks the same.
 */
/** A book's own drawing (DRAWN_BOOKS), or null: the shelf never gives a book a drawing of its kind, which would repeat across books. */
export const ownDrawingOf = (book) => (typeof book?.id === "string" && DRAWN_BOOKS.has(book.id) ? `book-${book.id}` : null);

export function coverOfBook(book) {
  if (typeof book?.id === "string" && DRAWN_BOOKS.has(book.id)) return `book-${book.id}`;
  const hash = [...String(book?.id ?? book?.title ?? "")].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const kind = kindOfBook(book) ?? ["novel", "stories", "children", "nonfiction"][hash % 4];
  return `book-${kind}${(hash >>> 2) & 1 ? "-2" : ""}`;
}

/** A sentence's hash: 12 hex of the SHA-256 of its words joined by spaces. A re-weave redoes what changed. */
export async function sentenceHash(words, s, e) {
  return (await sha256Hex(words.slice(s, e).join(" "))).slice(0, 12);
}

// ---------- small helpers ----------

/**
 * The frame a gloss of a word keeps: its punctuation frame, except that an abbreviation's full stop (the book
 * language's abbreviations) is part of the word, not punctuation: Mr. glosses as meneer, Mr., as meneer,. On a
 * sentence's last word (last) the full stop ends the sentence too, so it's kept, unless another of its language's end
 * marks ends it (Elm St.? in English, χλμ.; in Greek), there or in the punctuation after it (after: etc. ? in French).
 */
export function glossFrame(word, abbreviations, last = false, lang = "en", after = "") {
  const [lead, trail] = frameOf(word);
  const core = word.slice(lead.length, word.length - trail.length || undefined);
  if (!trail.startsWith(".") || !abbreviations.has(`${core}.`.toLowerCase())) return [lead, trail];
  const rest = trail.slice(1);
  return !last || sentenceEnds(lang).some((end) => end !== "." && `${rest}${after}`.includes(end)) ? [lead, rest] : [lead, trail];
}

/** A word's punctuation frame: [lead, trail]. */
export function frameOf(word) {
  // What comes before the first and after the last letter or digit. An apostrophe touching a letter is part of the
  // word (elision: ’tis, runnin’, zo’n), so a gloss is never forced to copy one; after other punctuation it's a
  // closing quote ("Rome—’") and part of the frame.
  const chars = [...word];
  const first = chars.findIndex((c) => ALNUM.test(c));
  if (first < 0) return [word, ""];
  let start = first;
  while (start > 0 && APOSTROPHE.test(chars[start - 1])) start--;
  let end = chars.findLastIndex((c) => ALNUM.test(c)) + 1;
  while (end < chars.length && APOSTROPHE.test(chars[end])) end++;
  return [chars.slice(0, start).join(""), chars.slice(end).join("")];
}

const isInt = (n) => Number.isInteger(n);
const isSpan = (span) => Array.isArray(span) && span.length === 2 && isInt(span[0]) && isInt(span[1]) && span[0] <= span[1];
const cleanString = (s) => typeof s === "string" && s.length > 0 && s === s.trim() && s === withoutInvisible(s) && !/\s{2,}|[\n\r\t]/.test(s);

function lemmaProblem(lemma, lang) {
  if (lemma === null) return null;
  if (typeof lemma !== "string") return "must be a string or null";
  // One word, one bank key: a lemma's apostrophe is always the straight one (zo'n, never zo’n).
  if (lemma.includes("’")) return `must use the straight apostrophe (${lemma.replace(/’/g, "'")}), so one word is always one bank key`;
  const pattern = LANGUAGES[lang]?.lemmaCase === "any" ? LEMMA_ANY : LEMMA_LOWER;
  // It ends in a letter or a mark on one (Hindi चलना, Thai ที่), or, where the language writes headwords so (Maltese
  // ta', seta'), in an apostrophe after one.
  const last = lemma.slice(-1);
  const ends = /[\p{L}\p{M}]/u.test(last) || (last === "'" && LANGUAGES[lang]?.lemmaFinalApostrophe === true && /\p{L}/u.test(lemma.slice(-2, -1)));
  if (lemma.length > LEMMA_MAX || !pattern.test(lemma) || !ends) {
    const casing = LANGUAGES[lang]?.lemmaCase === "any" ? "" : "lowercase ";
    return `must be a ${casing}dictionary form: letters, with spaces, hyphens or apostrophes only between them, never punctuation, digits or a dash joining two words`;
  }
  return null;
}

// ---------- whether a book may be shared ----------

/**
 * The open licenses a shared book may be under: each allows sharing and adapting (a weave or help layer is an
 * adaptation), given attribution. Version 3.0 allows the same as 4.0 (African Storybook's stories are CC BY 3.0), and
 * BY-SA 3.0 lets an adaptation go under a later version, so a BY-SA 4.0 layer over one is fine. NC and ND aren't here,
 * in any version: ND forbids the layers, and NC is unclear for a shared library.
 */
export const OPEN_LICENCES = new Set(["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-3.0", "CC-BY-SA-3.0"]);

/**
 * Whether a book may go on the open library's shelf: public domain in both the US and the EU (rights.us and rights.eu,
 * from the books pipeline's rights stage), or under an open license (rights.spdx in OPEN_LICENCES) with its attribution
 * recorded in rights.attribution. Returns a list of problems; empty means it may. The books pipeline's publish step and
 * the Worker's library publishing both ask this.
 */
export function rightsProblems(book) {
  const rights = book?.rights;
  const publicDomain = Boolean(rights?.us && rights?.eu);
  const openLicence = OPEN_LICENCES.has(rights?.spdx) && Array.isArray(rights?.attribution) && rights.attribution.length > 0;
  if (publicDomain || openLicence) return [];
  return ["the book is neither public domain in both the US and the EU (rights.ts) nor under an open license (CC0, CC BY, CC BY-SA) with its attribution recorded."];
}

// ---------- checking a book ----------

/**
 * Checks a book. Returns a list of problems; empty means valid. Async because it checks the version hash.
 * Every word must be what tokenize() makes of it, so a book made on the device and one made by the pipeline split
 * the same way (in a language written with spaces: one written without keeps its writer's split).
 */
export async function validateBook(book) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (!book || typeof book !== "object") return ["The book must be an object."];
  if (book.format !== BOOK_FORMAT || book.v !== FORMAT_VERSION) fail(`format must be "${BOOK_FORMAT}" and v ${FORMAT_VERSION}.`);
  if (typeof book.id !== "string" || !BOOK_ID.test(book.id)) fail("id must be 2–80 lowercase letters, digits and dashes.");
  if (typeof book.title !== "string" || !book.title.trim()) fail("title is required.");
  if (!Array.isArray(book.authors)) fail("authors must be a list (it may be empty).");
  // A language is one of the registry's own (never "__proto__", or an object a lookup would turn into a key).
  const known = typeof book.lang === "string" && Object.hasOwn(LANGUAGES, book.lang);
  if (!known) fail(`lang must be a supported language (${Object.keys(LANGUAGES).join(", ")}).`);
  if (!Array.isArray(book.words) || book.words.length === 0) return [...errors, "words must be a non-empty list."];
  const n = book.words.length;
  book.words.forEach((word, i) => {
    if (typeof word !== "string" || !word || /\s/u.test(word) || word !== withoutInvisible(word)) fail(`word ${i} must be text with no spaces or invisible characters.`);
    // A language written without spaces has no tokenize(): its words are whoever wrote the file's own split, kept as they are.
    else if (known && LANGUAGES[book.lang].segmenter !== "fixed" && (tokenize(word, book.lang).length !== 1 || tokenize(word, book.lang)[0] !== word)) {
      fail(`word ${i} (${JSON.stringify(word)}) isn't one token: tokenize() splits it into ${JSON.stringify(tokenize(word, book.lang))}.`);
    }
  });

  const italic = book.italic ?? [];
  if (!Array.isArray(italic)) fail("italic must be a list of [s, e] spans.");
  else {
    let last = 0;
    italic.forEach((span, i) => {
      if (!isSpan(span) || span[0] < last || span[1] > n || span[0] === span[1]) fail(`italic span ${i} must be a non-empty [s, e] within the book, in order, not overlapping.`);
      else last = span[1];
    });
  }

  if (!Array.isArray(book.paras) || book.paras.length === 0) fail("paras must be a non-empty list.");
  else {
    let at = 0;
    book.paras.forEach((para, i) => {
      if (!para || !PARA_KINDS.has(para.k) || !isInt(para.s) || !isInt(para.e)) return fail(`paragraph ${i} must be { k: p|h|v|scene, s, e }.`);
      if (para.s !== at) fail(`paragraph ${i} starts at ${para.s}; the paragraphs must tile the words, so it should start at ${at}.`);
      if (para.k === "scene" ? para.e !== para.s : para.e <= para.s) fail(`paragraph ${i}: a scene break holds no words, and any other paragraph holds at least one.`);
      at = para.e;
    });
    if (at !== n) fail(`The paragraphs end at word ${at}, but the book has ${n} words.`);
  }

  if (!Array.isArray(book.chapters)) fail("chapters must be a list (it may be empty).");
  else {
    let last = -1;
    book.chapters.forEach((chapter, i) => {
      if (!chapter || typeof chapter.title !== "string" || !isInt(chapter.para) || chapter.para <= last || chapter.para >= (book.paras?.length ?? 0)) fail(`chapter ${i} must have a title and the index of its first paragraph, in order.`);
      else last = chapter.para;
    });
  }

  errors.push(...pictureBookProblems(book, n));

  if (!Array.isArray(book.sentences) || book.sentences.length === 0) fail("sentences must be a non-empty list of [s, e] spans.");
  else if (Array.isArray(book.paras) && errors.length === 0) {
    const expected = segmentSentences(book.words, book.paras, book.lang);
    if (JSON.stringify(expected) !== JSON.stringify(book.sentences)) {
      const at = book.sentences.findIndex((span, i) => JSON.stringify(span) !== JSON.stringify(expected[i]));
      fail(`sentences must be exactly what segmentSentences() makes of these words and paragraphs; the first difference is at sentence ${at}.`);
    }
  }

  if (errors.length === 0) {
    const version = await bookVersion(book);
    if (book.version !== version) fail(`version must be the content hash ${version} (it's ${JSON.stringify(book.version)}).`);
  } else if (typeof book.version !== "string" || !HEX16.test(book.version)) fail("version must be 16 hex characters (bookVersion()).");
  return errors;
}

/** The problems with a picture book's pages, pictures and line breaks (all optional). */
function pictureBookProblems(book, n) {
  const errors = [];
  const fail = (message) => errors.push(message);
  const paras = Array.isArray(book.paras) ? book.paras : [];
  if (book.breaks !== undefined) {
    if (!Array.isArray(book.breaks)) fail("breaks must be a list of word indexes.");
    else {
      book.breaks.forEach((i, k) => {
        if (!isInt(i) || (k > 0 && i <= book.breaks[k - 1])) return fail(`breaks[${k}] must be a word index, in order, each once.`);
        // A line breaks between two words of one paragraph: never at its start, where the paragraph itself breaks.
        if (!paras.some((p) => p.k !== "scene" && p.s < i && i < p.e)) fail(`breaks[${k}] (${i}) must fall between two words of one paragraph.`);
      });
    }
  }
  const pictures = book.pictures;
  if (pictures !== undefined) {
    if (!Array.isArray(pictures)) fail("pictures must be a list.");
    else {
      const files = new Set();
      pictures.forEach((picture, i) => {
        if (!picture || typeof picture !== "object") return fail(`pictures[${i}] must be { file, w, h, alt, credit }.`);
        if (typeof picture.file !== "string" || !PICTURE_FILE.test(picture.file)) fail(`pictures[${i}].file must be 16 hex of the image's sha256 and .jpg, .png or .webp.`);
        else if (files.has(picture.file)) fail(`pictures[${i}] repeats ${picture.file}; a picture shown twice is listed once.`);
        files.add(picture.file);
        if (![picture.w, picture.h].every((x) => isInt(x) && x >= 1 && x <= PICTURE_MAX_SIDE)) fail(`pictures[${i}] needs its width and height in pixels.`);
        if (typeof picture.alt !== "string" || (picture.alt !== "" && !cleanString(picture.alt))) fail(`pictures[${i}].alt must say what it shows (or be "" for a decoration), on one line.`);
        if (!cleanString(picture.credit)) fail(`pictures[${i}].credit must name who made it.`);
      });
    }
  }
  // Every picture is shown: on a page, or as the cover.
  const used = new Set();
  if (book.cover !== undefined) {
    if (!isInt(book.cover) || !Array.isArray(pictures) || book.cover < 0 || book.cover >= pictures.length) fail("cover must be an index into pictures.");
    else used.add(book.cover);
  }
  if (book.pages !== undefined) {
    if (!Array.isArray(book.pages) || !book.pages.length) return [...errors, "pages must be a non-empty list of { s, e, picture }."];
    const starts = new Set(paras.map((p) => p.s));
    let at = 0;
    book.pages.forEach((page, i) => {
      if (!page || !isInt(page.s) || !isInt(page.e) || page.e < page.s) return fail(`pages[${i}] must be { s, e, picture } with s <= e.`);
      if (page.s !== at) fail(`pages[${i}] starts at ${page.s}; the pages must tile the words, so it should start at ${at}.`);
      for (const edge of [page.s, page.e]) if (edge !== n && !starts.has(edge)) fail(`pages[${i}] must start and end where a paragraph does (word ${edge} is inside one).`);
      if (page.picture !== null && (!isInt(page.picture) || !Array.isArray(pictures) || page.picture < 0 || page.picture >= pictures.length)) fail(`pages[${i}].picture must be an index into pictures, or null.`);
      else if (page.picture !== null) used.add(page.picture);
      at = page.e;
    });
    if (at !== n) fail(`The pages end at word ${at}, but the book has ${n} words.`);
    // The reader shows a chapter at a time, so a chapter always starts a page.
    const pageStarts = new Set(book.pages.map((page) => page?.s));
    (Array.isArray(book.chapters) ? book.chapters : []).forEach((chapter, i) => {
      const start = paras[chapter?.para]?.s;
      if (isInt(start) && !pageStarts.has(start)) fail(`chapter ${i} must start where a page does (word ${start} is inside one).`);
    });
  }
  if (Array.isArray(pictures)) pictures.forEach((_, i) => used.has(i) || fail(`pictures[${i}] isn't on any page${book.pages === undefined ? " (a book without pages shows a picture only as its cover)" : ""}.`));
  return errors;
}

// ---------- checking a weave ----------

/**
 * Checks a weave against its book. Returns a list of problems, each naming the sentence and word, and saying what's
 * wrong and what would be right. Empty means valid.
 * options.keep: words (without punctuation) that must stay exactly as they are, such as names.
 */
export async function validateWeave(weave, book, { keep = [] } = {}) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (!weave || typeof weave !== "object") return ["The weave must be an object."];
  if (weave.format !== WEAVE_FORMAT || weave.v !== FORMAT_VERSION) fail(`format must be "${WEAVE_FORMAT}" and v ${FORMAT_VERSION}.`);
  if (weave.book !== book.id || weave.bookVersion !== book.version) fail(`This weave is for ${weave.book}@${weave.bookVersion}, not ${book.id}@${book.version}.`);
  if (!WEAVE_KINDS.includes(weave.kind)) fail(`kind must be one of ${WEAVE_KINDS.join(", ")}.`);
  if (weave.from !== book.lang) fail(`from must be the book's language, ${book.lang}.`);
  if (typeof weave.to !== "string" || !Object.hasOwn(LANGUAGES, weave.to) || weave.to === book.lang) return [...errors, `to must be a supported language other than ${book.lang} (${Object.keys(LANGUAGES).join(", ")}).`];
  if (!Array.isArray(weave.sentences) || weave.sentences.length !== book.sentences.length) {
    return [...errors, `sentences must hold one entry for each of the book's ${book.sentences.length} sentences.`];
  }
  if (weave.kind === "parallel") return [...errors, ...parallelProblems(weave, book)];
  const keepSet = new Set(keep);
  for (let x = 0; x < weave.sentences.length; x++) {
    errors.push(...(await sentenceProblems(weave.sentences[x], x, book, weave, keepSet)));
  }
  return errors;
}

// ---------- checking a parallel layer ----------

const PARALLEL_FIELDS = ["format", "v", "kind", "book", "bookVersion", "from", "to", "licence", "spdx", "credit", "source", "made", "pages", "sentences"];
const SHA256 = /^[0-9a-f]{64}$/;
const PAGE_MAX = 4000;
const SENTENCE_MAX = 2000;
const httpsAddress = (s) => {
  try {
    return cleanString(s) && new URL(s).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * A parallel layer's own rules, once validateWeave has checked its envelope: a person's translation of a picture book,
 * one string a page, and a sentence's own where the page's sentences line up. On each page, either every sentence wholly
 * inside it is a string and, joined as the translation's language joins sentences, they are exactly the page's string,
 * or every one is null; a sentence running across a page's edge is null. Nothing in it was made by a model: no glosses,
 * lemmas or literal line, and made names no model. Its license and credit are its own, shown in About this book.
 */
function parallelProblems(layer, book) {
  const errors = [];
  const fail = (message) => errors.push(message);
  for (const key of Object.keys(layer)) if (!PARALLEL_FIELDS.includes(key)) fail(`A parallel layer has no ${key}: its fields are ${PARALLEL_FIELDS.join(", ")}.`);
  if (!cleanString(layer.licence)) fail('licence must be the translation\'s license by name, as shown ("CC BY 3.0").');
  if (!OPEN_LICENCES.has(layer.spdx)) fail(`spdx must be the same license's SPDX id, an open one: ${[...OPEN_LICENCES].join(", ")}.`);
  if (!cleanString(layer.credit) || layer.credit.length > 500) fail("credit must say who made the translation, as About this book shows it: one line, at most 500 characters.");
  const { source, made } = layer;
  const only = (object, keys) => Boolean(object) && typeof object === "object" && !Array.isArray(object) && Object.keys(object).every((key) => keys.includes(key));
  if (!only(source, ["ref", "title"]) || !httpsAddress(source.ref) || !cleanString(source.title)) fail("source must be { ref, title }: where the translation is (an https address) and its own title.");
  if (!only(made, ["pipeline", "sha256", "at"]) || !cleanString(made.pipeline) || !SHA256.test(String(made.sha256)) || !cleanString(made.at) || Number.isNaN(Date.parse(made.at))) {
    fail("made must be { pipeline, sha256, at }: what wrote it, its source page's sha256 and when. A person translated it, so it names no model.");
  }
  if (!Array.isArray(book.pages)) return [...errors, "A parallel layer goes with a picture book, page by page: this book has no pages."];
  if (!Array.isArray(layer.pages) || layer.pages.length !== book.pages.length) return [...errors, `pages must hold one entry for each of the book's ${book.pages.length} pages.`];
  layer.sentences.forEach((sentence, x) => {
    if (sentence !== null && (!cleanString(sentence) || sentence.length > SENTENCE_MAX)) fail(`sentences[${x}] must be its translation (one clean line, at most ${SENTENCE_MAX.toLocaleString("en")} characters) or null.`);
  });
  // A sentence on no one page (it runs across an edge) has no translation of its own: its pages show theirs whole.
  book.sentences.forEach(([s, e], x) => {
    if (layer.sentences[x] !== null && !book.pages.some((page) => s >= page.s && e <= page.e)) fail(`sentences[${x}] runs across a page's edge, so it must be null.`);
  });
  const separator = LANGUAGES[layer.to]?.separator ?? " ";
  book.pages.forEach((page, p) => {
    const text = layer.pages[p];
    const words = page.e > page.s;
    if (typeof text !== "string" || (text !== "" && !cleanString(text)) || text.length > PAGE_MAX) {
      fail(`pages[${p}] must be its translation: one clean line, at most ${PAGE_MAX.toLocaleString("en")} characters.`);
      return;
    }
    if (words !== (text !== "")) {
      fail(words ? `pages[${p}] is empty, but the page has words.` : `pages[${p}] must be "": the page has no words.`);
      return;
    }
    const inside = book.sentences.flatMap(([s, e], x) => (s >= page.s && e <= page.e ? [x] : []));
    const given = inside.filter((x) => layer.sentences[x] !== null);
    if (!given.length) return;
    if (given.length !== inside.length) fail(`Page ${p}: give every sentence on it, or none (${given.length} of its ${inside.length} given).`);
    else if (given.map((x) => layer.sentences[x]).join(separator) !== text) fail(`Page ${p}: its sentences, joined, must be its page's translation exactly.`);
  });
  return errors;
}

/**
 * The problems with one sentence of a weave (x = its index in the book). Used by validateWeave and the pipeline.
 * layer: { kind, to } of the weave it belongs to.
 */
export async function sentenceProblems(sentence, x, book, { kind, to }, keep = new Set()) {
  const errors = [];
  const at = `Sentence ${x}`;
  const fail = (message) => errors.push(`${at}: ${message}`);
  const language = LANGUAGES[to];
  // The lemmas are the language being learned: the target's in a weave, the book's own in a help layer.
  const learn = kind === "help" ? book.lang : to;
  const [s, e] = book.sentences[x];
  const words = book.words.slice(s, e);
  const abbreviations = new Set(LANGUAGES[book.lang]?.abbreviations ?? []);
  // The sentence's last word, for an abbreviation's full stop: the last with a letter or digit (a spaced » after it is
  // punctuation of its own).
  const lastWord = words.findLastIndex((w) => HAS_ALNUM.test(w));
  const afterLast = words.slice(lastWord + 1).join("");
  const n = words.length;
  if (!sentence || sentence.s !== s || sentence.e !== e) return [`${at}: s and e must be the book's span for it, ${s} and ${e}.`];
  if (sentence.h !== (await sentenceHash(book.words, s, e))) fail("h must be sentenceHash() of its words.");

  // t: one gloss per word.
  if (!Array.isArray(sentence.t) || sentence.t.length !== n) fail(`t must hold exactly one [target, lemma] per word: this sentence has ${n} words, t has ${Array.isArray(sentence.t) ? sentence.t.length : "none"}. Every word gets its own entry, in order; never merge or skip one.`);
  else {
    sentence.t.forEach((entry, j) => {
      const source = words[j];
      const where = `word ${j} (${JSON.stringify(source)})`;
      if (!Array.isArray(entry) || entry.length < 2 || entry.length > 3 || typeof entry[0] !== "string" || !(entry[1] === null || typeof entry[1] === "string")) return fail(`${where}: t entry must be [target, lemma or null] or [target, lemma or null, reading].`);
      const [target, lemma, reading] = entry;
      // How it's said (Japanese kana, Chinese pinyin): the target's in a weave, the book word's own in a help layer.
      if (entry.length === 3) {
        const problem = typeof reading !== "string" ? "a reading must be text" : kind === "help" ? readingProblem(book.lang, source, reading) : readingProblem(to, target, reading);
        if (problem) fail(`${where}: ${problem}.`);
      }
      if (!cleanString(target)) return fail(`${where}: the target must be non-empty, with no leading, trailing or double spaces and no invisible characters.`);
      if (!HAS_ALNUM.test(source)) {
        if (target !== source || lemma !== null) fail(`${where} is only punctuation: it keeps its text exactly and its lemma is null.`);
        return;
      }
      if (!HAS_LETTER.test(source) && lemma !== null) fail(`${where} has no letters, so it isn't a word to learn: its lemma must be null.`);
      const problem = lemmaProblem(lemma, learn);
      if (problem) fail(`${where}: lemma ${JSON.stringify(lemma)} ${problem}.`);
      const [lead, trail] = glossFrame(source, abbreviations, j === lastWord, book.lang, afterLast);
      const inner = target.slice(lead.length, target.length - trail.length || undefined);
      if (!target.startsWith(lead) || !target.endsWith(trail) || !HAS_ALNUM.test(inner)) {
        fail(`${where}: the target ${JSON.stringify(target)} must keep the word's punctuation, ${JSON.stringify(lead)} before and ${JSON.stringify(trail)} after, around the translated word.`);
      } else if (QUOTES.test(frameOf(inner).join(""))) {
        fail(`${where}: the target ${JSON.stringify(target)} adds quotation marks the word doesn't have; keep exactly ${JSON.stringify(lead)} before and ${JSON.stringify(trail)} after.`);
      }
      // A name that stays is matched without its punctuation, an abbreviation's full stop included (St).
      const [nameLead, nameTrail] = frameOf(source);
      const core = source.slice(nameLead.length, source.length - nameTrail.length || undefined);
      if (keep.has(core) && (lemma !== null || target !== source)) fail(`${where} is a name that stays as it is: target exactly ${JSON.stringify(source)}, lemma null.`);
    });
  }

  // text: the natural sentence.
  if (!cleanString(sentence.text)) fail("text must be the natural sentence: non-empty, single spaces, no invisible characters.");

  // m: the literal line, tiling text.
  if (!Array.isArray(sentence.m) || sentence.m.length === 0) fail("m must hold the literal line: one [target, english, sources, lemma] per word of text.");
  else {
    const seen = new Set();
    sentence.m.forEach((entry, k) => {
      const where = `literal line entry ${k}`;
      if (!Array.isArray(entry) || entry.length < 4 || entry.length > 5) return fail(`${where} must be [target, english, sources, lemma] or [target, english, sources, lemma, reading].`);
      const [target, english, sources, lemma, reading] = entry;
      if (entry.length === 5) {
        const problem = kind === "help" ? "a help layer's literal line is English, so it carries no reading" : typeof reading !== "string" ? "a reading must be text" : readingProblem(to, target, reading);
        if (problem) fail(`${where} (${JSON.stringify(target)}): ${problem}.`);
      }
      if (!cleanString(target) || (language.separator && target.includes(language.separator))) return fail(`${where}: target ${JSON.stringify(target)} must be exactly one word of text.`);
      if (!cleanString(english)) fail(`${where} (${JSON.stringify(target)}): the cue must be the words of the book it carries, non-empty.`);
      if (!HAS_ALNUM.test(target) && english !== target) fail(`${where} (${JSON.stringify(target)}) is only punctuation: its cue is the same punctuation.`);
      if (!Array.isArray(sources) || !sources.every((j) => isInt(j) && j >= 0 && j < n) || new Set(sources).size !== sources.length) {
        fail(`${where} (${JSON.stringify(target)}): sources must list distinct word indices of this sentence, 0 to ${n - 1}.`);
      }
      for (const j of Array.isArray(sources) ? sources : []) seen.add(j);
      if (kind === "help" && lemma !== null) fail(`${where} (${JSON.stringify(target)}): in a help layer the lemma here is null (the words to learn are the book's, in t).`);
      if (!HAS_LETTER.test(target) && lemma !== null) fail(`${where} (${JSON.stringify(target)}) has no letters: its lemma must be null.`);
      const problem = lemmaProblem(lemma, to);
      if (problem) fail(`${where} (${JSON.stringify(target)}): lemma ${JSON.stringify(lemma)} ${problem}.`);
      const [lead, trail] = frameOf(target);
      const core = target.slice(lead.length, target.length - trail.length || undefined);
      if (keep.has(core) && lemma !== null) fail(`${where} (${JSON.stringify(target)}) is a name: its lemma must be null.`);
    });
    if (typeof sentence.text === "string" && sentence.m.every((entry) => Array.isArray(entry) && typeof entry[0] === "string")) {
      const tiled = sentence.m.map((entry) => entry[0]).join(language.separator);
      if (tiled !== sentence.text) fail(`m's targets, joined by ${JSON.stringify(language.separator)}, must be exactly text. They give ${JSON.stringify(tiled)}; text is ${JSON.stringify(sentence.text)}.`);
    }
  }

  // u: idiom upgrades over words that all substitute.
  if (sentence.u !== undefined) {
    if (!Array.isArray(sentence.u)) fail("u must be a list of [k, len, target].");
    else {
      let end = 0;
      [...sentence.u].sort((a, b) => (a?.[0] ?? 0) - (b?.[0] ?? 0)).forEach((unit) => {
        if (!Array.isArray(unit) || unit.length !== 3 || !isInt(unit[0]) || !isInt(unit[1])) return fail("each idiom upgrade must be [k, len, target].");
        const [k, len, target] = unit;
        const where = `idiom upgrade at word ${k}`;
        if (len < 2 || k < 0 || k + len > n) return fail(`${where}: it covers at least two words of the sentence (len ${len}).`);
        if (k < end) fail(`${where} overlaps another one.`);
        end = Math.max(end, k + len);
        if (!cleanString(target)) fail(`${where}: target must be non-empty, single spaces.`);
        if (Array.isArray(sentence.t) && sentence.t.length === n && !sentence.t.slice(k, k + len).some((entry) => entry?.[1])) {
          fail(`${where}: it must cover at least one word with a lemma, because it shows once those are all known.`);
        }
        const lead = frameOf(words[k])[0];
        const trail = glossFrame(words[k + len - 1], abbreviations, k + len - 1 === lastWord, book.lang, afterLast)[1];
        if (typeof target === "string" && (!target.startsWith(lead) || !target.endsWith(trail))) fail(`${where}: keep ${JSON.stringify(lead)} before and ${JSON.stringify(trail)} after it.`);
      });
    }
  }

  // c: pattern ids from the catalog of the language being learned.
  if (sentence.c !== undefined) {
    const known = Object.keys(LANGUAGES[learn]?.patterns ?? {});
    if (!Array.isArray(sentence.c) || new Set(sentence.c).size !== sentence.c.length || !sentence.c.every((id) => known.includes(id))) {
      fail(`c must list distinct pattern ids from the catalog: ${known.join(", ") || "(none for this language)"}.`);
    }
  }
  return errors;
}

// ---------- the literal line ----------

/** The position in English order of each literal-line entry: its first source word, or the entry before it's. */
function englishPositions(m) {
  let previous = -1;
  return m.map((entry) => {
    const sources = entry[2];
    if (sources.length) previous = Math.min(...sources);
    return previous;
  });
}

/**
 * Which literal-line entries moved: those outside the longest run that's already in English order. Entries carrying
 * the same English word ("Ik" and "ben" for I'm) don't count as moving against each other.
 */
export function movedOf(m) {
  const positions = englishPositions(m);
  // Longest non-decreasing subsequence, keeping the earliest choice at each length (deterministic).
  const tails = [];
  const tailAt = [];
  const parent = new Array(positions.length).fill(-1);
  positions.forEach((p, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] <= p) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = p;
    tailAt[lo] = i;
    parent[i] = lo > 0 ? tailAt[lo - 1] : -1;
  });
  const keep = new Set();
  for (let i = tailAt[tails.length - 1] ?? -1; i >= 0; i = parent[i]) keep.add(i);
  return positions.map((_, i) => !keep.has(i));
}

/** Literal-line entries in English order (indexes into m), for switching the line between the two orders. */
export function englishOrderOf(m) {
  const positions = englishPositions(m);
  return positions.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, i]) => i);
}

/** English cue with the target word's punctuation: "tired" under "moe," shows as "tired,". */
function cueText(target, english) {
  const [lead, trail] = frameOf(target);
  if (!HAS_ALNUM.test(target)) return english;
  return (english.startsWith(lead) ? "" : lead) + english + (english.endsWith(trail) ? "" : trail);
}

/**
 * The literal line's chunks: neighboring entries that carry exactly the same English words are one chunk ("naar
 * beneden" carrying "down" reads "down" once, not "down down"). Each chunk is [target, cue, sources, lemma] like an
 * entry, with the indexes of the entries it holds as a fifth element.
 */
export function literalChunksOf(m) {
  const chunks = [];
  m.forEach(([target, cue, sources, lemma], k) => {
    const last = chunks[chunks.length - 1];
    const same = last && sources.length > 0 && last[2].length === sources.length && last[2].every((j, i) => j === sources[i]);
    if (!same) {
      chunks.push([target, cue, sources, lemma, [k]]);
      return;
    }
    last[0] = `${last[0]} ${target}`;
    // The cue shows once; different cues for the same words (rare) are kept in order.
    const bare = (text) => text.slice(frameOf(text)[0].length, text.length - frameOf(text)[1].length || undefined);
    if (bare(cue) !== bare(last[1])) last[1] = `${last[1]} ${cue}`;
    last[4].push(k);
  });
  return chunks;
}

/**
 * The literal line in the shape ui.literalLine takes: { literal: [{ text, moved }], punct, english }, one piece per
 * chunk (literalChunksOf). The sentence's closing punctuation is its own piece, so it stays at the end in either order.
 */
export function literalLineOf(m) {
  const chunks = literalChunksOf(m);
  const moved = movedOf(chunks);
  const literal = chunks.map(([target, english], k) => ({ text: cueText(target, english), moved: moved[k] }));
  let punct = "";
  const last = literal[literal.length - 1];
  if (last) {
    const trail = last.text.match(/[.!?…:;]+[”’"')\]»]*$/u)?.[0] ?? "";
    if (trail && trail.length < last.text.length) {
      punct = trail;
      last.text = last.text.slice(0, -trail.length);
    }
  }
  return { literal, punct, english: englishOrderOf(chunks) };
}

// ---------- what the reader shows ----------

/**
 * What one sentence of a weave shows for a set of known lemmas. An idiom upgrade shows once every word in it with a
 * lemma is known: it takes its first word's place and hides the rest.
 *   known   a Set of lemmas (or a function lemma → boolean)
 *   flipAt  the share of the sentence's learnable words (0–100) at which the whole sentence shows in the target
 *           language; over 100 never flips
 *   order   show the sentence in target order (the literal line), with known words in the target language
 *   lang    the language being learned: two words shown side by side join as it writes them (its `joins`: French de
 *           le is du, que elle is qu'elle; Spanish a el is al), the second hidden as in an idiom upgrade, and the
 *           pair listed in idioms with joined: true
 *   from    the book's language, for the joins that read its words (an English question's Am I: suis je)
 * Returns { flipped, ordered, known, total, words, idioms }. `words` is the display sequence of { i, show, text,
 * lemma }: i is the book word it's anchored to (for taps and evidence), show is "en", "target" or "hidden".
 *   - Usually one piece per word, in book order; an idiom upgrade shows on its first word and hides the rest.
 *   - Flipped or ordered: one piece per literal-line entry, in target order, anchored to its first source word.
 */
export function weaveSentence(sentence, words, known, { flipAt = 101, order = false, lang = null, from = null } = {}) {
  const has = typeof known === "function" ? known : (lemma) => known.has(lemma);
  const { s, t, m } = sentence;
  let total = 0;
  let knownCount = 0;
  for (const [, lemma] of t) {
    if (!lemma) continue;
    total++;
    if (has(lemma)) knownCount++;
  }
  const flipped = total > 0 && flipAt <= 100 && (knownCount / total) * 100 >= flipAt;
  const ordered = !flipped && order && m.length > 0;
  if (flipped || ordered) {
    const positions = englishPositions(m);
    return {
      flipped,
      ordered,
      known: knownCount,
      total,
      idioms: [],
      words: m.map(([target, english, , lemma], k) => {
        const i = s + Math.max(positions[k], 0);
        if (flipped || (lemma && has(lemma)) || !HAS_ALNUM.test(target)) return { i, show: "target", text: target, lemma };
        return { i, show: "en", text: cueText(target, english), lemma };
      }),
    };
  }
  const pieces = t.map(([target, lemma], j) => (lemma && has(lemma) ? { i: s + j, show: "target", text: target, lemma } : { i: s + j, show: "en", text: words[s + j], lemma }));
  const idioms = [];
  for (const [k, len, target] of sentence.u ?? []) {
    const learnable = t.slice(k, k + len).filter(([, lemma]) => lemma);
    if (!learnable.length || !learnable.every(([, lemma]) => has(lemma))) continue;
    idioms.push({ k, len, text: target });
    pieces[k] = { ...pieces[k], show: "target", text: target };
    for (let j = k + 1; j < k + len; j++) pieces[j] = { ...pieces[j], show: "hidden", text: "" };
  }
  const joins = typeof lang === "string" && Object.hasOwn(LANGUAGES, lang) ? LANGUAGES[lang].joins : null;
  if (joins) joinShown(pieces, sentence, words, idioms, joins, from);
  return { flipped: false, ordered: false, known: knownCount, total, idioms, words: pieces };
}

// A vowel a word can start with, for elision (French l'arbre, l'été, l'œuf), and a y said as one (Yves).
const VOWEL = /^[aeiouàâäæéèêëîïôöœùûü]/u;
const Y_VOWEL = /^y[^\P{L}aeiouyàâäæéèêëîïôöœùûü]/u;

/**
 * Joins the words a woven line shows side by side the way the language writes them (weaveSentence's lang; a
 * language's `joins`, lang/index.js), in two passes over the line: contractions first (à le is au), then elisions over
 * the result (jusque au is jusqu'au). A pair joins only when both show in the language, or the second is a name that
 * stays (de Alice is d'Alice; before a name only a vowel elides, so de Harry stays); never across punctuation, never
 * inside an idiom upgrade, and a contraction never before a capitalized word (a name: de El Salvador). A contraction
 * whose second word would elide before the word after it doesn't contract (de le arbre is de l'arbre). The elided form
 * takes the apostrophe the sentence's own text uses. The joined text goes on the run's first word, the rest of the run
 * is hidden, and the run is listed in idioms (joined: true).
 */
function joinShown(pieces, sentence, words, idioms, joins, from) {
  const { s, t } = sentence;
  const apostrophe = typeof sentence.text === "string" && sentence.text.includes("’") ? "’" : "'";
  const upgrades = idioms.slice();
  const inUpgrade = (j) => upgrades.some(({ k, len }) => j >= k && j < k + len);
  const shown = (j) => pieces[j]?.show === "target" && !inUpgrade(j);
  const name = (j) => pieces[j]?.show === "en" && !inUpgrade(j) && t[j][1] === null && t[j][0] === words[s + j] && /^\p{Lu}/u.test(words[s + j]);
  // Each join's run: its first word → how many words it covers.
  const runs = new Map();
  // The piece shown after j: past the words a join hid.
  const nextOf = (j) => j + (runs.get(j) ?? 1);
  // A gloss's text in parts: its frame; its words before the last (head) and the last (word), which joins the next gloss
  // (parce que + il is parce qu'il); and its first word (first) and the rest (tail), which the gloss before joins
  // (de + le mien is du mien).
  const coreOf = (text) => {
    const [lead, trail] = frameOf(text);
    const core = text.slice(lead.length, text.length - trail.length || undefined);
    const cut = core.lastIndexOf(" ") + 1;
    const space = core.indexOf(" ");
    return { lead, trail, core, head: core.slice(0, cut), word: core.slice(cut), first: space < 0 ? core : core.slice(0, space), tail: space < 0 ? "" : core.slice(space) };
  };
  const cased = (text, like) => (like[0] !== like[0].toLowerCase() ? text[0].toUpperCase() + text.slice(1) : text);
  const starts = (word, list) => (list ?? []).some((w) => word.startsWith(w));
  // Whether word j's last word (first, its gloss a) elides before word n's gloss (b).
  const elision = (j, first, n, b) => {
    const form = joins.elide?.[first];
    if (!form) return null;
    const beforeName = name(n);
    // The next gloss's first word (a gloss can be two: he's → il est).
    const low = b.core.toLowerCase().split(" ")[0];
    const only = joins.elideOnlyBefore?.[first];
    // (Not when that word only opens a phrase the gloss is a whole of: en fait, in fact, isn't en.)
    const phrase = typeof t[n][1] === "string" && t[n][1].startsWith(`${low} `);
    if (only) return only.includes(low) && !phrase ? form : null;
    // A woven line keeps English order, where a pronoun comes after its verb: le and la elide only as articles (fais le
    // entrer stays), and je only before an inflected verb, a form of a lemma with a verb's ending (j'ai; je aussi, puis
    // je entrer stay), and never after an English auxiliary in its clause (Am I: suis je étrangère).
    // (A le ending a gloss of several words is its article: a pronoun glosses an English word of its own.)
    const article = coreOf(pieces[j].text).head !== "" || (joins.articles ?? []).includes(t[j][1]);
    if ((joins.articleOnly ?? []).includes(first) && !article) return null;
    const lemma = t[n][1];
    // (One word, glossing one, with a verb's lemma: avec plaisir or en particulier isn't one, and ai eu only costs a
    // missed elision.)
    const inflected = shown(n) && !b.tail && typeof lemma === "string" && !lemma.includes(" ") && low !== lemma && (joins.verbEndings ?? []).some((end) => lemma.endsWith(end));
    if ((joins.beforeInflected ?? []).includes(first)) {
      // Only from a book language whose questions it knows (invertedAfter[from]); from any other, never.
      const inverted = typeof from === "string" ? joins.invertedAfter?.[from] : undefined;
      if (!Array.isArray(inverted)) return null;
      // An inverted I comes after its auxiliary, somewhere in its own clause (Am I, Have even I, “Am I” in a quote): any
      // of them between I and its clause's start (a word ending in ; : . ! ? or a dash, or a mark of its own; a comma
      // can be a list's, Have Tom, Mary and I, and a numeral is a word) means it asks.
      // In any case and place, so a word like the month May only costs a missed elision. (An abbreviation's or an
      // initial's full stop ends nothing: Mr. Brown, J. Brown.)
      const abbreviations = new Set(LANGUAGES[from]?.abbreviations ?? []);
      let asks = false;
      for (let k = j - 1; k >= 0 && !asks; k--) {
        const word = words[s + k];
        const trail = INITIALS.test(word) ? "" : glossFrame(word, abbreviations)[1];
        if (!HAS_ALNUM.test(word) || /[;:.!?…—–]/u.test(trail)) break;
        asks = inverted.includes(word.replace(/[^\p{L}]/gu, "").toLowerCase());
      }
      if (asks || !inflected) return null;
    }
    if ((joins.noElision ?? []).includes(low)) return null;
    // A y before a consonant is said as a vowel (d'Yves, l'ypérite); before a vowel it isn't (le yaourt), but for a few.
    if (VOWEL.test(low) || Y_VOWEL.test(low) || (joins.elideBeforeY ?? []).includes(low)) return form;
    // A mute h elides (l'homme), an aspirated one doesn't (le hibou), and before a name an h never does.
    const aspirated = ((joins.aspiratedWords ?? []).includes(low) || starts(low, joins.aspirated)) && !starts(low, joins.muteH);
    return !beforeName && low.startsWith("h") && !aspirated ? form : null;
  };
  const join = (j, n, text) => {
    const len = n - j + (runs.get(n) ?? 1);
    for (let h = j + 1; h < j + len; h++) pieces[h] = { ...pieces[h], show: "hidden", text: "" };
    pieces[j] = { ...pieces[j], text };
    runs.delete(n);
    runs.set(j, len);
  };
  // Contractions, the first word's last word with the next's first. The second must be an article: as shown (a
  // capitalized one, a name's El, never matches the table's lowercase), and with an article's lemma (a pronoun spelled
  // the same, le for him with lemma il, never contracts), or opening a gloss of several words (le mien: a pronoun
  // glosses an English word of its own). After one, the joined gloss's own last word may contract in turn (à + le côté
  // de + le is au côté du), so the same word is looked at again.
  const contraction = (j) => {
    const n = nextOf(j);
    if (!shown(j) || !shown(n)) return null;
    const a = coreOf(pieces[j].text);
    const b = coreOf(pieces[n].text);
    if (a.trail || b.lead || !a.core || !b.core) return null;
    const one = joins.contract?.[`${a.word.toLowerCase()} ${b.first}`];
    if (!one || !(b.tail || (joins.articles ?? []).includes(t[n][1]))) return null;
    const m = nextOf(n);
    const after = !b.tail && (shown(m) || name(m)) ? coreOf(pieces[m].text) : null;
    if (after && !b.trail && !after.lead && elision(n, b.word.toLowerCase(), m, after)) return null;
    return { n, text: `${a.lead}${a.head}${cased(one, a.word)}${b.tail}${b.trail}` };
  };
  for (let j = 0; j < pieces.length; ) {
    const joined = contraction(j);
    if (joined) join(j, joined.n, joined.text);
    else j = nextOf(j);
  }
  // Elisions, over what the contractions made. After one, the joined gloss's own last word may elide in turn (que +
  // assez de + eau is qu'assez d'eau), so the same word is looked at again.
  for (let j = 0; j < pieces.length; ) {
    const n = nextOf(j);
    const a = shown(j) && (shown(n) || name(n)) ? coreOf(pieces[j].text) : null;
    const b = a ? coreOf(pieces[n].text) : null;
    const form = a && !a.trail && !b.lead && a.core && b.core ? elision(j, a.word.toLowerCase(), n, b) : null;
    if (form) join(j, n, `${a.lead}${a.head}${cased(`${form}${apostrophe}${b.core}`, a.word)}${b.trail}`);
    else j = nextOf(j);
  }
  for (const [k, len] of [...runs].sort((x, y) => x[0] - y[0])) idioms.push({ k, len, text: pieces[k].text, joined: true });
}

// ---------- a help layer: a book in the language you're learning, with your language as help ----------

/**
 * What one sentence of a help layer shows for a set of known lemmas (the book's own language). Two ways to read:
 *   mode "gloss"  every book word shows as itself; a word whose lemma you don't know carries its gloss as `help` (for
 *                 a tap, or ruby above it)
 *   mode "weave"  a word you don't know shows its gloss in its place, in the book's word order, so a beginner reads the
 *                 literal line (their own words in the book's order) with the words they know in the book's language.
 *                 An idiom upgrade shows its natural rendering over its run while none of its learnable words is known
 * Returns { known, total, words: [{ i, show: "book" | "help" | "hidden", text, lemma, help }], idioms }.
 */
export function helpSentence(sentence, words, known, { mode = "gloss" } = {}) {
  const has = typeof known === "function" ? known : (lemma) => known.has(lemma);
  const { s, t } = sentence;
  let total = 0;
  let knownCount = 0;
  const pieces = t.map(([gloss, lemma], j) => {
    const book = words[s + j];
    if (!lemma) return { i: s + j, show: "book", text: book, lemma, help: null };
    total++;
    if (has(lemma)) {
      knownCount++;
      return { i: s + j, show: "book", text: book, lemma, help: null };
    }
    return mode === "weave" ? { i: s + j, show: "help", text: gloss, lemma, help: gloss } : { i: s + j, show: "book", text: book, lemma, help: gloss };
  });
  const idioms = [];
  if (mode === "weave") {
    for (const [k, len, target] of sentence.u ?? []) {
      const learnable = t.slice(k, k + len).filter(([, lemma]) => lemma);
      if (!learnable.length || learnable.some(([, lemma]) => has(lemma))) continue;
      idioms.push({ k, len, text: target });
      pieces[k] = { ...pieces[k], show: "help", text: target, help: target };
      for (let j = k + 1; j < k + len; j++) pieces[j] = { ...pieces[j], show: "hidden", text: "" };
    }
  }
  return { known: knownCount, total, idioms, words: pieces };
}

/**
 * A help layer's literal line: each book word's gloss, in the book's order, with the words that move marked and the
 * order of the natural sentence (m) for switching between the two. The shape ui.literalLine takes.
 */
export function helpLiteralLineOf(sentence) {
  // Each book word's place in the natural sentence: the first entry of m that carries it.
  const place = sentence.t.map((_, j) => sentence.m.findIndex(([, , sources]) => sources.includes(j)));
  const entries = sentence.t.map(([gloss, lemma], j) => [gloss, gloss, place[j] >= 0 ? [place[j]] : [], lemma]);
  return literalLineOf(entries);
}

/** Every sentence of a weave, for a set of known lemmas (see weaveSentence). */
export function weaveAt(book, weave, known, options = {}) {
  return weave.sentences.map((sentence) => weaveSentence(sentence, book.words, known, { lang: weave.to, from: weave.from, ...options }));
}

/** How much of a weave shows in the target language for a set of known lemmas: { known, total, share }. */
export function coverageOf(weave, known) {
  const has = typeof known === "function" ? known : (lemma) => known.has(lemma);
  let total = 0;
  let knownCount = 0;
  for (const sentence of weave.sentences) {
    for (const [, lemma] of sentence.t) {
      if (!lemma) continue;
      total++;
      if (has(lemma)) knownCount++;
    }
  }
  return { known: knownCount, total, share: total ? knownCount / total : 0 };
}

// ---------- the word-frequency list ----------
//
// A frequency list (lexicommons-frequency) is one language's lemmas in order of use, with their counts in a corpus:
// what "you'd know N% of the words in everyday Dutch" and the reader's suggestions both count from. Its lemmas are the
// word-bank keys a weave uses (the concept w:<lemma>). The books pipeline makes it, and the file carries the license
// and the attribution its sources ask for, which go wherever its numbers are shown.
//   corpus       { name, tokens, counted, dropped }: counted is the running words that are words of the language
//                (names, other languages and broken tokens are dropped); a share of everyday words is out of counted
//   lemmas       [lemma, count], most used first, each lemma once (the list may stop before the rarest)
//   licence      an open license's SPDX id; attribution: [{ what, name, url, … }], at least one

export const FREQUENCY_FORMAT = "lexicommons-frequency";
const OPEN_DATA_LICENCES = new Set(["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0"]);
const isCount = (n) => Number.isInteger(n) && n >= 0;

/** Checks a frequency list. Returns a list of problems (at most 20 about its lemmas); empty means valid. */
export function validateFrequency(list) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (!list || typeof list !== "object") return ["The frequency list must be an object."];
  if (list.format !== FREQUENCY_FORMAT || list.v !== FORMAT_VERSION) fail(`format must be "${FREQUENCY_FORMAT}" and v ${FORMAT_VERSION}.`);
  const L = typeof list.lang === "string" && Object.hasOwn(LANGUAGES, list.lang) ? LANGUAGES[list.lang] : null;
  if (!L) return [...errors, `lang must be a supported language (${Object.keys(LANGUAGES).join(", ")}).`];
  if (list.unit !== "lemma") fail('unit must be "lemma": counts are of word-bank keys, not of word forms.');
  const corpus = list.corpus ?? {};
  if (typeof corpus.name !== "string" || !corpus.name) fail("corpus.name must name the corpus counted.");
  if (![corpus.tokens, corpus.counted, corpus.dropped].every(isCount) || corpus.counted < 1 || corpus.counted + corpus.dropped !== corpus.tokens) {
    fail("corpus must have whole-number tokens, counted (at least 1) and dropped, with counted + dropped = tokens.");
  }
  if (!OPEN_DATA_LICENCES.has(list.licence)) fail(`licence must be one of ${[...OPEN_DATA_LICENCES].join(", ")}.`);
  const credits = Array.isArray(list.attribution) ? list.attribution : [];
  if (!credits.length || credits.some((a) => !a || typeof a.what !== "string" || typeof a.name !== "string" || !/^https?:\/\/\S+$/.test(String(a.url)))) {
    fail("attribution must list each source, each with what it gave, its name and a link.");
  }
  if (!Array.isArray(list.lemmas) || !list.lemmas.length) return [...errors, "lemmas must be a non-empty list of [lemma, count]."];
  const shape = L.lemmaCase === "lower" ? LEMMA_LOWER : LEMMA_ANY;
  const seen = new Set();
  let sum = 0;
  let lemmaErrors = 0;
  const lemmaFail = (message) => {
    if (++lemmaErrors <= 20) fail(message);
  };
  list.lemmas.forEach((entry, i) => {
    const [lemma, count] = Array.isArray(entry) ? entry : [];
    if (!Array.isArray(entry) || entry.length !== 2 || typeof lemma !== "string" || !Number.isInteger(count) || count < 1) return lemmaFail(`lemmas[${i}] must be [lemma, count] with a count of at least 1.`);
    if (!shape.test(lemma) || lemma.length > LEMMA_MAX) lemmaFail(`lemmas[${i}] ${JSON.stringify(lemma)} isn't a ${L.lemmaCase === "lower" ? "lowercase " : ""}dictionary form.`);
    if (lemma.includes("’")) lemmaFail(`lemmas[${i}] ${JSON.stringify(lemma)} must use the straight apostrophe, as word-bank keys do.`);
    if (seen.has(lemma)) lemmaFail(`lemmas[${i}] ${JSON.stringify(lemma)} is listed twice.`);
    if (i > 0 && count > list.lemmas[i - 1][1]) lemmaFail(`lemmas[${i}] ${JSON.stringify(lemma)} is counted more than the lemma before it: most used first.`);
    seen.add(lemma);
    sum += count;
  });
  if (lemmaErrors > 20) fail(`… and ${lemmaErrors - 20} more problems with lemmas.`);
  if (isCount(corpus.counted) && sum > corpus.counted) fail(`The lemmas add up to ${sum}, more than the ${corpus.counted} words counted.`);
  return errors;
}

/**
 * How much of everyday language a set of known lemmas covers: the share of the corpus's counted running words that
 * are lemmas you know. known: a Set of lemmas or a function lemma → boolean (bank.js's). { known, counted, share }.
 */
export function everydayShare(list, known) {
  const has = typeof known === "function" ? known : (lemma) => known.has(lemma);
  let knownCount = 0;
  for (const [lemma, count] of list.lemmas) if (has(lemma)) knownCount += count;
  return { known: knownCount, counted: list.corpus.counted, share: list.corpus.counted ? knownCount / list.corpus.counted : 0 };
}

/** Each listed lemma's rank, 1 for the most used: a Map lemma → rank. */
export function frequencyRanks(list) {
  return new Map(list.lemmas.map(([lemma], i) => [lemma, i + 1]));
}

// ---------- definitions ----------

// A definitions file (lexicommons-definitions): short definitions of the words a layer teaches, or of a book's own
// words, kept beside them in the library (books/<id>/<version>/defs.<lang>.<12 hex>.json):
//   format, v      "lexicommons-definitions", 1
//   book, bookVersion   the book it's for
//   of             the 12 hex of the layer file it belongs to (its lemmas are that layer's), or "book" (the book's own
//                  words, as a dictionary would list them)
//   lang           the language of the words defined: a weave's to, a help layer's book, or the book's for "book"
//   in             the language the definitions are written in
//   licence        an open license's SPDX id; credit: who made them
//   made           { pipeline, model, run, at } (optional)
//   forms          { form: lemma } (optional): for words the book doesn't lemmatize; a contraction's value is what it
//                  stands for ("didn't" → "did not")
//   entries        { lemma: { senses: [{ pos, def, example? }] } }: one to three senses, the book's own use first; pos
//                  from DEFINITION_POS; def one line; example a made-up sentence in lang and its translation in `in`
export const DEFINITIONS_FORMAT = "lexicommons-definitions";
export const DEFINITION_POS = ["noun", "verb", "adjective", "adverb", "pronoun", "determiner", "preposition", "conjunction", "numeral", "interjection", "particle", "phrase", "contraction"];
export const DEFINITION_LIMITS = { senses: 3, def: 120, example: 160 };
const DEFINITION_FIELDS = new Set(["format", "v", "book", "bookVersion", "of", "lang", "in", "licence", "credit", "made", "forms", "entries"]);

/**
 * Checks a definitions file against its book, and its layer when it's for one (layerSha: the 12 hex of that layer
 * file's bytes). Every lemma it defines must be one the layer uses (or, for "book", a word of the book or a form's
 * lemma). Returns a list of problems, at most 30.
 */
export function validateDefinitions(defs, book, { layer = null, layerSha = null } = {}) {
  const errors = [];
  const fail = (message) => errors.length < 30 && errors.push(message);
  if (!defs || typeof defs !== "object" || Array.isArray(defs)) return ["A definitions file is an object."];
  if (defs.format !== DEFINITIONS_FORMAT || defs.v !== 1) fail(`format must be "${DEFINITIONS_FORMAT}", v 1.`);
  for (const key of Object.keys(defs)) if (!DEFINITION_FIELDS.has(key)) fail(`${key} isn't a field of a definitions file.`);
  if (defs.book !== book?.id || defs.bookVersion !== book?.version) fail(`book and bookVersion must be ${book?.id}@${book?.version}.`);
  if (!LANGUAGES[defs.in]) fail(`in must be a language code (${Object.keys(LANGUAGES).join(", ")}).`);
  if (!OPEN_DATA_LICENCES.has(defs.licence)) fail(`licence must be one of ${[...OPEN_DATA_LICENCES].join(", ")}.`);
  if (!cleanString(defs.credit)) fail("credit must say who made them, on one line.");
  // Whose words: a layer's lemmas, or the book's own.
  let lemmas = null;
  if (defs.of === "book") {
    if (defs.lang !== book?.lang) fail(`lang must be the book's language (${book?.lang}) for its own words.`);
  } else if (typeof defs.of === "string" && /^[0-9a-f]{12}$/.test(defs.of)) {
    if (!layer || layerSha !== defs.of) fail("of names a layer: check it against that layer (its file's 12 hex must be of).");
    else {
      const learn = layer.kind === "help" ? book?.lang : layer.to;
      if (defs.lang !== learn) fail(`lang must be the layer's language being learned (${learn}).`);
      lemmas = new Set(layer.sentences.flatMap((s) => (s.t ?? []).map((entry) => entry?.[1]).filter((l) => typeof l === "string")));
    }
  } else fail('of must be the 12 hex of a layer file, or "book".');
  const language = LANGUAGES[defs.lang];
  if (!language) return [...errors, `lang must be a language code.`];
  const shape = language.lemmaCase === "any" ? LEMMA_ANY : LEMMA_LOWER;
  // A book's own words, for "book": each word's letters, lowercased.
  const bookWords = defs.of === "book" ? new Set((book?.words ?? []).map((w) => w.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "").toLowerCase()).filter(Boolean)) : null;
  const entries = defs.entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries) || !Object.keys(entries).length) return [...errors, "entries must define at least one word."];
  const formLemmas = new Set();
  if (defs.forms !== undefined) {
    if (!defs.forms || typeof defs.forms !== "object" || Array.isArray(defs.forms)) fail("forms must be { form: lemma }.");
    else
      for (const [form, lemma] of Object.entries(defs.forms)) {
        if (!cleanString(form) || form.length > LEMMA_MAX) fail(`forms: ${JSON.stringify(form)} must be a word as written.`);
        // A contraction stands for words ("did not"); any other form points at a lemma it defines.
        if (typeof lemma !== "string" || !cleanString(lemma) || (!lemma.includes(" ") && !Object.hasOwn(entries, lemma))) fail(`forms: ${JSON.stringify(form)} must point at a lemma defined here, or spell out what it stands for.`);
        else formLemmas.add(lemma);
      }
  }
  for (const [lemma, entry] of Object.entries(entries)) {
    const where = `entries[${JSON.stringify(lemma)}]`;
    if (!shape.test(lemma) || lemma.length > LEMMA_MAX) fail(`${where}: a lemma as ${language.name} writes one (${language.lemmaCase === "any" ? "letters" : "lowercase letters"}, at most ${LEMMA_MAX}).`);
    if (lemmas && !lemmas.has(lemma)) fail(`${where} isn't a lemma the layer uses.`);
    if (bookWords && !bookWords.has(lemma.toLowerCase()) && !formLemmas.has(lemma)) fail(`${where} isn't a word of the book, or a form's lemma.`);
    const senses = entry?.senses;
    if (!entry || typeof entry !== "object" || Object.keys(entry).some((k) => k !== "senses") || !Array.isArray(senses) || senses.length < 1 || senses.length > DEFINITION_LIMITS.senses) {
      fail(`${where} must be { senses: [1 to ${DEFINITION_LIMITS.senses} senses] }.`);
      continue;
    }
    senses.forEach((sense, k) => {
      const at = `${where}.senses[${k}]`;
      if (!sense || typeof sense !== "object" || Object.keys(sense).some((key) => !["pos", "def", "example"].includes(key))) return fail(`${at} must be { pos, def, example? }.`);
      if (!DEFINITION_POS.includes(sense.pos)) fail(`${at}.pos must be one of ${DEFINITION_POS.join(", ")}.`);
      if (!cleanString(sense.def) || sense.def.length > DEFINITION_LIMITS.def) fail(`${at}.def must be one line of at most ${DEFINITION_LIMITS.def} characters.`);
      else if (sense.def.toLowerCase() === lemma.toLowerCase()) fail(`${at}.def must say what it means, not repeat the word.`);
      if (sense.example !== undefined && (!Array.isArray(sense.example) || sense.example.length !== 2 || !sense.example.every((x) => cleanString(x) && x.length <= DEFINITION_LIMITS.example))) fail(`${at}.example must be [a sentence in ${defs.lang}, its translation], each one line of at most ${DEFINITION_LIMITS.example} characters.`);
    });
  }
  return errors;
}
