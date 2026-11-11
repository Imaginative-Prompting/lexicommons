// A text's files as the server checks them before they're queued (src/texts.ts): a leaf (no imports of the Worker's
// own modules), so scripts/test-texts.mjs runs it in Node. Plain text is made into a book (import-text.js), a book is
// checked (book-format.js validateBook), an EPUB is checked as one (its zip signature and mimetype entry; each device
// makes it into a book), a cover is cleaned (cover-svg.js). A problem is a TextProblem, said for whoever sent it.

import { bookVersion as bookVersionJs, segmentSentences as segmentSentencesJs, validateBook as validateBookJs } from "../public/js/read/book-format.js";
import { bookFromText as bookFromTextJs } from "../public/js/read/import-text.js";
import { cleanCover, coverFile, CoverError } from "../public/js/read/cover-svg.js";

export class TextProblem extends Error {}

/** What an EPUB may hold, by its own central directory (each device holds its inflating to the same: read/zip.js). */
export const EPUB_LIMITS = { entries: 3000, entry: 32 * 1024 * 1024, total: 128 * 1024 * 1024 };
const TITLE_MAX = 200;

// book-format.js and import-text.js, typed as they're called here (they're plain JS).
type Book = { id: string; title: string; authors: { name: string; role?: string }[]; lang: string; source?: unknown; rights?: unknown; words: string[]; cover?: unknown };
const validateBook = validateBookJs as unknown as (book: unknown) => Promise<string[]>;
const segmentSentences = segmentSentencesJs as unknown as (words: unknown, paras: unknown, lang: unknown) => unknown;
const bookVersion = bookVersionJs as unknown as (book: unknown) => Promise<string>;
const bookFromText = bookFromTextJs as unknown as (raw: string, options: { title?: string; lang?: string }) => Promise<Book>;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Whether bytes are an EPUB: a zip whose first entry is "mimetype", stored, holding application/epub+zip. */
export function isEpub(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 58 || view.getUint32(0, true) !== 0x04034b50) return false;
  const method = view.getUint16(8, true);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLength));
  const start = 30 + nameLength + extraLength;
  const content = new TextDecoder().decode(bytes.subarray(start, start + 20));
  return method === 0 && name === "mimetype" && content === "application/epub+zip";
}

/**
 * Problems with an EPUB's central directory (what it says it holds): more entries, or more bytes once inflated, than
 * EPUB_LIMITS allow. Empty when it's within them. A directory can lie, so each device also stops inflating past them.
 */
export function epubProblems(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return ["its file list (the zip's central directory) can't be found"];
  const count = view.getUint16(end + 10, true);
  const offset = view.getUint32(end + 16, true);
  if (count > EPUB_LIMITS.entries) return [`it holds ${count} files; an EPUB here may hold ${EPUB_LIMITS.entries}`];
  let total = 0;
  let p = offset;
  for (let k = 0; k < count; k++) {
    if (p + 46 > bytes.byteLength || view.getUint32(p, true) !== 0x02014b50) return ["its file list doesn't read"];
    const unpacked = view.getUint32(p + 24, true);
    if (unpacked > EPUB_LIMITS.entry) return [`one of its files is ${Math.round(unpacked / 1e6)} MB once unpacked; each may be ${EPUB_LIMITS.entry / 1024 / 1024} MB`];
    total += unpacked;
    p += 46 + view.getUint16(p + 28, true) + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  if (total > EPUB_LIMITS.total) return [`it's ${Math.round(total / 1e6)} MB once unpacked; an EPUB here may be ${EPUB_LIMITS.total / 1024 / 1024} MB`];
  return [];
}

/**
 * A text's file as the server checks it, before it's queued. format text: made into a book (import-text.js); book: a
 * lexicommons-book, checked; epub: checked as one. Returns { format, bytes, words?, book? } or throws TextProblem with
 * every problem.
 */
export async function checkTextFile(format: string, bytes: Uint8Array, { id, title, language, authors, source }: { id: string; title?: string; language: string; authors: string[]; source: string }) {
  if (format === "epub") {
    if (!isEpub(bytes)) throw new TextProblem("That isn't an EPUB: its first entry must be an uncompressed mimetype file saying application/epub+zip.");
    const problems = epubProblems(bytes);
    if (problems.length) throw new TextProblem(`That EPUB can't be used: ${problems[0]}.`);
    return { format: "epub" as const, bytes };
  }
  let book: Book;
  if (format === "text") {
    let raw: string;
    try {
      raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    } catch {
      throw new TextProblem("The text isn't UTF-8.");
    }
    try {
      book = await bookFromText(raw, { title, lang: language });
    } catch (error) {
      throw new TextProblem((error as Error).message);
    }
  } else {
    let parsed: unknown;
    let raw: string;
    try {
      raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    } catch {
      throw new TextProblem("The book isn't UTF-8.");
    }
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new TextProblem("The book isn't JSON.");
    }
    if (!isObject(parsed)) throw new TextProblem("The book must be a lexicommons-book object.");
    if ("cover" in parsed) throw new TextProblem("A book carries no cover: send its cover as its own upload (format cover). Covers stay on the person's devices.");
    // What follows from the rest is worked out here, never asked of whoever sends a book: its id (the relay's), its title when add_text
    // gives one, the lists that may be empty, its sentences (segmentSentences, as every book's are) and its version (the content hash).
    // So a book is its words and paragraphs, and a text in a language written without spaces (Japanese, Chinese, Thai), which plain text
    // can't be split into words here, comes as one with its words split by the sender. What's wrong with the rest, the check still says.
    parsed.id = id;
    if (title !== undefined) parsed.title = title;
    for (const key of ["authors", "italic", "chapters"]) parsed[key] ??= [];
    try {
      parsed.sentences = segmentSentences(parsed.words, parsed.paras, parsed.lang);
      parsed.version = await bookVersion(parsed);
    } catch {
      // Words or paragraphs the check refuses: it says what.
    }
    const problems = await validateBook(parsed);
    if (problems.length) throw new TextProblem(`The book doesn't pass the check: ${problems.slice(0, 5).join(" ")}`);
    book = parsed as unknown as Book;
    if (book.lang !== language) throw new TextProblem(`The book is in ${book.lang}, not ${language}.`);
  }
  // Yours, from your AI: under the relay's id on every device, its title and authors as your AI gave them, no rights
  // (it's only on your devices).
  book.id = id;
  // Its title and authors bounded, as everything shown for a text is (a book can say anything in its own).
  book.title = (title ?? book.title).replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  book.authors = authors.length
    ? authors.map((name) => ({ name, role: "author" }))
    : (Array.isArray(book.authors) ? book.authors : []).slice(0, 10).flatMap((a) => (isObject(a) && typeof a.name === "string" && a.name.trim() ? [{ name: a.name.replace(/\s+/g, " ").trim().slice(0, 80), ...(typeof a.role === "string" ? { role: a.role.slice(0, 40) } : {}) }] : []));
  book.source = { kind: "ai", ref: source };
  book.rights = null;
  const problems = await validateBook(book);
  if (problems.length) throw new TextProblem(`The book doesn't pass the check: ${problems.slice(0, 5).join(" ")}`);
  return { format: "book" as const, book, words: book.words.length, bytes: new TextEncoder().encode(JSON.stringify(book)) };
}

/** A cover's SVG, cleaned. Returns { svg, file, dropped }. */
export async function checkCoverFile(bytes: Uint8Array) {
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new TextProblem("The cover isn't UTF-8.");
  }
  try {
    const { svg, dropped } = cleanCover(raw);
    return { svg, file: await coverFile(svg), dropped };
  } catch (error) {
    if (error instanceof CoverError) throw new TextProblem(`The cover can't be used: ${error.message}`);
    throw error;
  }
}

