// A pasted text or a plain-text file (.txt, such as a Project Gutenberg book) as a lexicommons-book, the format every
// text in the reader has. book-format.js is its contract: the words are what its tokenize() makes, the sentences what
// its segmentSentences() makes, the version its bookVersion(), so a text made here splits exactly as one made by the
// library's pipeline, and your AI can weave it later. Every book is checked with its validateBook() before it's kept.
//
// What it recognizes in plain text:
// - a Project Gutenberg file's header and license (kept out; its Title and Author lines are used);
// - hard-wrapped lines (joined into paragraphs) versus one paragraph per line;
// - chapter headings ("Chapter 3", "CHAPTER III.", "Hoofdstuk 2", "Part One", "Prologue", a bare "XII"), with the
//   short title line under one; a table of contents (headings with nothing between them) stays plain text;
// - scene breaks (a line of * or # or similar); _underscored_ words as italic.

import { LANGUAGES, bookVersion, joinWords, segmentSentences, splitWords, validateBook } from "./book-format.js";

// A Gutenberg header's "Language: Dutch", as a language code (the ones the book format knows).
const LANGUAGE_NAMES = Object.fromEntries(Object.entries(LANGUAGES).map(([code, { name }]) => [name.toLowerCase(), code]));

export const MAX_TEXT_BYTES = 8_000_000;
const NUMBER_WORDS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf|dertien|veertien|vijftien|zestien|zeventien|achttien|negentien|twintig";
// "Chapter 3", "CHAPTER III.", "Part Two: The Return", "Hoofdstuk 4 — Thuis", "Book the First".
const NUMBERED = new RegExp(`^(chapter|chap\\.|part|book|volume|vol\\.|hoofdstuk|deel|boek)\\s+(\\d{1,3}|[ivxlcdm]{1,7}|(?:the\\s+)?(?:${NUMBER_WORDS})(?:[- ](?:${NUMBER_WORDS}))?)\\b[.:]?(\\s.*)?$`, "i");
// "Prologue", "Epilogue: Ten Years Later", "VOORWOORD." (a title only after a mark: "Introduction to the …" is prose).
const NAMED = /^(prologue|epilogue|preface|introduction|afterword|appendix|proloog|epiloog|voorwoord|inleiding|nawoord|bijlage)(?:[.:]|\s*[.:—–-]\s+(.+))?$/i;
// "XII", "12.", alone on a line.
const BARE = /^(\d{1,3}|[IVXLCDM]{1,7})\.?$/;
const SCENE = /^[*#~•·◊⁂—–_=\-\s]+$/;

const wordCount = (text) => (text.match(/\S+/g) ?? []).length;

/** True when a paragraph is a chapter heading's first line. */
function isMarker(text) {
  if (wordCount(text) > 12 || !/^\p{Lu}|^\d/u.test(text)) return false;
  if (BARE.test(text)) return true;
  const numbered = NUMBERED.exec(text);
  const named = numbered ? null : NAMED.exec(text);
  if (!numbered && !named) return false;
  // What follows is the chapter's title, which never ends like a sentence ("Prologue to the trip was dull." is prose).
  // After a number it can be a question ("Chapter XI. Who Stole the Tarts?").
  const rest = ((numbered ? numbered[3] : named[2]) ?? "").trim();
  return !rest || !(numbered ? /\p{Ll}\.$/u : /[!?]$|\p{Ll}\.$/u).test(rest);
}

/** A chapter's title line under its heading: short, not a sentence, not a line of dialogue or a [note]. */
const isTitleLine = (text) =>
  wordCount(text) <= 10 && /\p{L}/u.test(text) && !/^["“‘'(\[—–-]/.test(text) && !/[.…:;,]["”’')\]]*$/.test(text) && !SCENE.test(text);
// A Project Gutenberg placeholder for a picture the text file doesn't have.
const PLACEHOLDER = /^\[Illustration\]$/i;

// The Project Gutenberg wrapper: its header (with Title and Author lines) and its license at the end.
function unwrapGutenberg(text) {
  const start = /^\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^\n]*$/im.exec(text);
  if (!start) return { text, meta: {} };
  const head = text.slice(0, start.index);
  const end = /^\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^\n]*$/im.exec(text);
  const body = text.slice(start.index + start[0].length, end && end.index > start.index ? end.index : undefined);
  const field = (name) => new RegExp(`^${name}:\\s*(.+)$`, "im").exec(head)?.[1].trim() || null;
  return { text: body, meta: { title: field("Title"), author: field("Author"), lang: LANGUAGE_NAMES[field("Language")?.toLowerCase() ?? ""] ?? null } };
}

// A block of lines between blank lines: one hard-wrapped paragraph, or one paragraph per line.
function blockParagraphs(block) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return lines;
  const body = lines.slice(0, -1);
  const wrapped = body.filter((line) => line.length >= 40 && line.length <= 90).length / body.length >= 0.7;
  return wrapped && !isMarker(lines[0]) ? [lines.join(" ")] : lines;
}

/**
 * Makes a lexicommons-book from plain text. `title` (optional) wins over anything found; `fileName` says it came from
 * a file. Throws a message meant for people when there's nothing to read.
 */
export async function bookFromText(raw, options = {}) {
  const book = parseText(raw, options);
  book.version = await bookVersion(book);
  const problems = await validateBook(book);
  if (problems.length) {
    console.error("[lexicommons] an imported text failed the book check:", problems);
    throw new Error(`That text couldn't be read in: ${problems[0]}`);
  }
  return book;
}

/** bookFromText without the version hash (which needs a moment): for a text that's only shown, never kept. */
export function parseText(raw, { title = "", fileName = null, lang: chosen = null } = {}) {
  let text = String(raw).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const gutenberg = unwrapGutenberg(text);
  // The text's language (yours, else a Gutenberg header's, else English) decides how its words and sentences split.
  const lang = chosen && LANGUAGES[chosen] ? chosen : gutenberg.meta.lang ?? "en";
  text = gutenberg.text.replace(/[\t ]/g, " ");

  // Paragraph texts, each with its kind. A typewriter dash ("said Alice--and then") is an em dash.
  const raws = text
    .split(/\n[ \t]*\n+/)
    .flatMap(blockParagraphs)
    .filter((p) => !PLACEHOLDER.test(p))
    .map((p) => p.replace(/(?<!-)--(?!-)/g, "—"))
    // A heading caught at the end of a picture's caption ("Chapter I.]") is still a heading.
    .map((p) => (/^[^[]*\]$/.test(p) && isMarker(p.slice(0, -1).trim()) ? p.slice(0, -1).trim() : p));
  const kinds = raws.map((p) => (SCENE.test(p) && p.length <= 20 && /\S/.test(p) ? "scene" : isMarker(p) ? "marker" : "p"));
  // A heading followed by another heading with nothing to read between is a table of contents entry, not a chapter.
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] !== "marker") continue;
    let next = i + 1;
    if (next < raws.length && kinds[next] === "p" && isTitleLine(raws[next]) && kinds[next + 1] !== "marker") next++;
    if (next >= raws.length || kinds[next] === "marker" || (kinds[next] === "p" && isTitleLine(raws[next]) && kinds[next + 1] === "marker")) kinds[i] = "p";
  }

  const words = [];
  const italic = [];
  const paras = [];
  const chapters = [];
  for (let i = 0; i < raws.length; i++) {
    const kind = kinds[i];
    if (kind === "scene") {
      paras.push({ k: "scene", s: words.length, e: words.length });
      continue;
    }
    const heading = kind === "marker" || (kinds[i - 1] === "marker" && isTitleLine(raws[i]));
    if (kind === "marker") chapters.push({ title: raws[i], para: paras.length });
    else if (heading) chapters[chapters.length - 1].title = raws[i];
    const s = words.length;
    // Italic: _underscored_ words, when the paragraph's underscores pair up. The marks come off, and each word must
    // still be one token as it stands.
    const underscores = (raws[i].match(/_/g) ?? []).length;
    const marksItalic = underscores >= 2 && underscores % 2 === 0;
    let inItalic = false;
    let italicStart = 0;
    for (let token of splitWords(raws[i], lang)) {
      if (marksItalic) {
        const opens = /^["“‘'(]*_/.test(token);
        const closes = /_["”’')\].,;:!?—–-]*$/.test(token);
        const clean = token.replace(/^(["“‘'(]*)_/, "$1").replace(/_(["”’')\].,;:!?—–-]*)$/, "$1");
        const pieces = splitWords(clean, lang);
        if (pieces.length !== 1) {
          words.push(...pieces);
          continue;
        }
        token = pieces[0];
        if (opens && !inItalic) {
          inItalic = true;
          italicStart = words.length;
        }
        words.push(token);
        if (closes && inItalic) {
          inItalic = false;
          if (words.length > italicStart) italic.push([italicStart, words.length]);
        }
      } else words.push(token);
    }
    if (words.length > s) paras.push({ k: heading ? "h" : "p", s, e: words.length });
  }
  if (!words.length) throw new Error("There's nothing to read in that text.");

  // Text before the first heading (a title page, front matter, or a text with no chapters at all) opens the book.
  const bookTitle = (title.trim() || gutenberg.meta.title || fileName?.replace(/\.[^.]+$/, "") || firstWords(words, paras, lang)).slice(0, 200);
  if (!chapters.length || chapters[0].para > 0) chapters.unshift({ title: bookTitle, para: 0 });

  const sentences = segmentSentences(words, paras, lang);

  const book = {
    format: "lexicommons-book",
    v: 1,
    id: `text-${crypto.randomUUID()}`,
    version: "",
    title: bookTitle,
    authors: gutenberg.meta.author ? [{ name: gutenberg.meta.author, role: "author" }] : [],
    lang,
    source: fileName ? { kind: "upload", ref: fileName } : { kind: "paste" },
    rights: null,
    words,
    italic,
    paras,
    chapters,
    sentences,
  };
  return book;
}

function firstWords(words, paras, lang) {
  const first = paras.find((p) => p.e > p.s);
  // Joined as the language writes its words: with none between them where it's written without spaces.
  const run = joinWords(words.slice(first.s, Math.min(first.e, first.s + 8)), LANGUAGES[lang]?.separator ?? " ");
  return first.e - first.s > 8 ? `${run}…` : run;
}
