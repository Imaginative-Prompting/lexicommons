// An EPUB as a lexicommons-book (the format book-format.js checks), from readersound's epub_to_src.py, in the browser:
// - container.xml names the package (OPF): its metadata (title, authors, language), the files (manifest), their
//   reading order (spine) and the table of contents (the EPUB 3 nav document, or EPUB 2's NCX).
// - DRM: a store's encryption (Adobe's rights.xml, Apple's sinf.xml, or an encryption.xml that encrypts more than
//   fonts) means only the store's app can read it, and the import says so plainly. Font obfuscation (IDPF's or
//   Adobe's) only scrambles embedded fonts and isn't DRM, so those books open.
// - Each spine file's body becomes paragraphs: headings (a <br> in one makes two lines, "CHAPTER I." over its title),
//   verse (a paragraph broken by <br>, or <pre>: a line each), scene breaks (<hr>, or a line of only ornaments) and
//   italics (<i>, <em>, <cite>). Pictures, footnote markers, notes and publisher boilerplate (imprint, colophon,
//   copyright, the table of contents, Project Gutenberg's header and license) are left out.
// - A chapter starts where the table of contents points: a file, or an element in one. Without a usable table of
//   contents, each file's first heading starts one. An entry with nothing but a heading under it (a title page's
//   "Contents") joins the chapter before it.

import { LANGUAGES, bookVersion, joinWords, normalizeText, segmentSentences, splitWords, validateBook } from "./book-format.js";
import { ZipError, openZip } from "./zip.js";

export const MAX_EPUB_BYTES = 200_000_000;

export class EpubError extends Error {}

const DRM_MESSAGE =
  "This book is locked to the store it came from (DRM), so only that store's own app can open it. Lexicommons opens DRM-free EPUBs: from Project Gutenberg, Standard Ebooks, a DRM-free store, or ones you made.";
// These scramble embedded fonts so they can't be lifted out of the book. They aren't DRM.
const FONT_OBFUSCATION = new Set(["http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"]);
// Publisher boilerplate and navigation, by the EPUB's structural types.
const SKIP_TYPES = /\b(toc|landmarks|loi|lot|copyright-page|imprint|colophon|titlepage|halftitlepage|endnotes|footnotes|rearnotes|index|cover|page-list)\b/;
const NOTE_TYPES = /\b(noteref|footnote|endnote|rearnote|annoref)\b/;
const BLOCK = new Set(["address", "article", "aside", "blockquote", "body", "caption", "center", "dd", "details", "div", "dl", "dt", "figcaption", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "main", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"]);
const NEVER = new Set(["script", "style", "nav", "figure", "img", "svg", "math", "head", "title", "object", "video", "audio", "iframe", "template", "picture", "map"]);
const ITALIC = new Set(["i", "em", "cite", "dfn", "var"]);
const HEADING = /^h[1-6]$/;
// A paragraph of nothing but these is a printed scene break.
const ORNAMENT = /^[\s*•·◊⁂○●◇◆＊※☆★♦・~—–_=-]+$/u;

const tagOf = (node) => node.localName?.toLowerCase() ?? "";
// Prose wrapped by hand: most lines but the last run long, and most stop mid-sentence on a bare word ("de jonge").
// Verse lines can be long too, but they mostly end on punctuation.
const wrappedProse = (lines) => {
  const body = lines.slice(0, -1);
  const long = body.filter((line) => line.text.length >= 50).length / body.length;
  const open = body.filter((line) => /[\p{L}\p{N}]$/u.test(line.text)).length / body.length;
  return long >= 0.7 && open >= 0.6;
};
const typesOf = (node) => `${node.getAttribute?.("epub:type") ?? ""} ${node.getAttribute?.("role") ?? ""}`.toLowerCase();
const clean = (text) => text.replace(/\s+/g, " ").trim();

function parseXml(text, type = "application/xml") {
  // Nothing to read (a file the EPUB names but doesn't hold) isn't parsed: a failed parse makes an error document whose
  // inline styles the app's CSP reports.
  if (!text.trim()) return null;
  const doc = new DOMParser().parseFromString(text, type);
  return doc.getElementsByTagName("parsererror").length ? null : doc;
}

/**
 * A content document: strictly as XHTML when it is, forgivingly as HTML when it isn't quite. Its styles come out
 * first: the reader has its own, and the app's CSP refuses inline styles even in a parsed document.
 */
function parseContent(text) {
  const plain = text.replace(/<style\b[\s\S]*?<\/style\s*>/gi, "").replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "");
  return parseXml(plain, "application/xhtml+xml") ?? new DOMParser().parseFromString(plain, "text/html");
}

const byLocalName = (root, name) => [...root.getElementsByTagName("*")].filter((el) => tagOf(el) === name.toLowerCase());

/** Resolves an href relative to the file it's in, as a path inside the zip ("OEBPS/text/ch1.xhtml"). */
function resolve(from, href) {
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const parts = [];
  for (const part of decodeURIComponent((base + href).split("#")[0]).split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}
const fragmentOf = (href) => (href.includes("#") ? decodeURIComponent(href.slice(href.indexOf("#") + 1)) : null);

// ---------- DRM ----------

async function refuseDrm(zip) {
  if (zip.has("META-INF/rights.xml") || zip.has("META-INF/sinf.xml")) throw new EpubError(DRM_MESSAGE);
  const encryption = await zip.text("META-INF/encryption.xml");
  if (!encryption) return;
  const doc = parseXml(encryption);
  if (!doc) throw new EpubError(DRM_MESSAGE);
  for (const method of byLocalName(doc, "EncryptionMethod")) {
    if (!FONT_OBFUSCATION.has(method.getAttribute("Algorithm"))) throw new EpubError(DRM_MESSAGE);
  }
}

// ---------- the package ----------

async function readPackage(zip) {
  const container = parseXml((await zip.text("META-INF/container.xml")) ?? "");
  const opfPath = container && byLocalName(container, "rootfile")[0]?.getAttribute("full-path");
  const opf = opfPath && parseXml((await zip.text(opfPath)) ?? "");
  if (!opf) throw new EpubError("That EPUB is damaged: its contents list (the OPF) can't be read.");
  const first = (name) => clean(byLocalName(opf, name)[0]?.textContent ?? "");
  const manifest = new Map();
  for (const item of byLocalName(opf, "item")) {
    manifest.set(item.getAttribute("id"), {
      path: resolve(opfPath, item.getAttribute("href") ?? ""),
      type: item.getAttribute("media-type") ?? "",
      props: item.getAttribute("properties") ?? "",
    });
  }
  const spineEl = byLocalName(opf, "spine")[0];
  // Each file is read once, however often the spine names it (a spine naming one file over and over would otherwise
  // make a book many times the EPUB's own size).
  const read = new Set();
  const spine = byLocalName(opf, "itemref")
    .map((ref) => manifest.get(ref.getAttribute("idref")))
    .filter((item) => item && /x?html/.test(item.type) && !/\bnav\b/.test(item.props) && !read.has(item.path) && read.add(item.path));
  return {
    title: first("title"),
    authors: byLocalName(opf, "creator").map((c) => clean(c.textContent)).filter(Boolean),
    language: first("language").toLowerCase().split(/[-_]/)[0],
    manifest,
    spine,
    nav: [...manifest.values()].find((item) => /\bnav\b/.test(item.props)) ?? null,
    ncx: manifest.get(spineEl?.getAttribute("toc") ?? "") ?? [...manifest.values()].find((item) => item.type === "application/x-dtbncx+xml") ?? null,
  };
}

/** The table of contents: Map(file → [{ fragment, title }]), in reading order. */
async function readToc(zip, pkg) {
  const entries = [];
  if (pkg.nav) {
    const doc = parseContent((await zip.text(pkg.nav.path)) ?? "");
    const toc = byLocalName(doc, "nav").find((nav) => /\btoc\b/.test(typesOf(nav))) ?? byLocalName(doc, "nav")[0];
    for (const a of toc ? byLocalName(toc, "a") : []) {
      const href = a.getAttribute("href");
      if (href) entries.push({ path: resolve(pkg.nav.path, href), fragment: fragmentOf(href), title: clean(a.textContent) });
    }
  }
  if (!entries.length && pkg.ncx) {
    const doc = parseXml((await zip.text(pkg.ncx.path)) ?? "");
    for (const point of doc ? byLocalName(doc, "navPoint") : []) {
      const src = [...point.children].find((c) => tagOf(c) === "content")?.getAttribute("src");
      const label = [...point.children].find((c) => tagOf(c) === "navlabel");
      if (src) entries.push({ path: resolve(pkg.ncx.path, src), fragment: fragmentOf(src), title: clean(label?.textContent ?? "") });
    }
  }
  const toc = new Map();
  for (const entry of entries) {
    // A footnote marker in a heading comes along into its entry ("EERSTE HOOFDSTUK[1]").
    entry.title = entry.title.replace(/\s*\[(\d+|\*)\]$/, "");
    if (!entry.title) continue;
    if (!toc.has(entry.path)) toc.set(entry.path, []);
    toc.get(entry.path).push(entry);
  }
  return toc;
}

// ---------- a content document's blocks ----------

/**
 * The blocks of a body, in order: { k: "p" | "h" | "v" | "scene", text, italic (a flag per character), ids (the
 * element ids met since the last block) }.
 */
function blocksOf(body) {
  const blocks = [];
  let ids = [];
  const skip = (el) =>
    NEVER.has(tagOf(el)) ||
    NOTE_TYPES.test(typesOf(el)) ||
    /\b(pg-boilerplate|caption)\b/.test(el.getAttribute?.("class") ?? "") ||
    /^pg-(header|footer)$/.test(el.id ?? "") ||
    // A table of links is a table of contents.
    (tagOf(el) === "table" && byLocalName(el, "a").length > 0);

  // Inline content as characters with italic flags, "\n" where a line breaks: at a <br>, or (in <pre>) a newline.
  // Anywhere else a newline in the source is only a space.
  const charsOf = (data, italic, pre) => [...normalizeText(data)].map((c) => [c === "\n" && !pre ? " " : c, italic]);
  function inline(node, italic, out, pre = false) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out.push(...charsOf(child.data, italic, pre));
      else if (child.nodeType === 1) {
        if (child.id) ids.push(child.id);
        // A drop cap drawn as a picture: its letter is the text's first.
        const alt = tagOf(child) === "img" ? child.getAttribute("alt") ?? "" : "";
        if (/^\p{L}{1,2}$/u.test(alt)) out.push(...charsOf(alt, italic, pre));
        if (skip(child)) continue;
        if (tagOf(child) === "br") out.push(["\n", false]);
        else inline(child, italic || ITALIC.has(tagOf(child)), out, pre);
      }
    }
    return out;
  }
  // Characters → lines (on "\n" when `lines`, else one), whitespace collapsed, each { text, italic }.
  function linesOf(chars, lines) {
    const out = [];
    let text = "";
    let flags = [];
    const flush = () => {
      const start = text.length - text.trimStart().length;
      const trimmed = text.trim();
      if (trimmed) out.push({ text: trimmed, italic: flags.slice(start, start + trimmed.length) });
      text = "";
      flags = [];
    };
    for (const [c, italic] of chars) {
      if (c === "\n" && lines) {
        flush();
        continue;
      }
      if (/\s/.test(c)) {
        if (text && !text.endsWith(" ")) {
          text += " ";
          flags.push(false);
        }
        continue;
      }
      text += c;
      flags.push(italic);
    }
    flush();
    return out;
  }
  function emit(k, line) {
    if (k !== "h" && ORNAMENT.test(line.text) && line.text.length <= 20) blocks.push({ k: "scene", ids });
    else blocks.push({ k, text: line.text, italic: line.italic, ids });
    ids = [];
  }
  const hasBlockChild = (el) => [...el.children].some((c) => BLOCK.has(tagOf(c)) && !skip(c));

  function walk(el, heading) {
    if (el.id) ids.push(el.id);
    if (skip(el)) {
      // A table of contents' own heading ("Contents") goes with it.
      if (tagOf(el) === "table" && blocks.at(-1)?.k === "h") blocks.pop();
      return;
    }
    const tag = tagOf(el);
    if (tag === "hr") {
      blocks.push({ k: "scene", ids });
      ids = [];
      return;
    }
    if (tag === "pre") {
      for (const line of linesOf(inline(el, false, [], true), true)) emit("v", line);
      return;
    }
    const isHeading = heading || HEADING.test(tag) || tag === "hgroup";
    if (!hasBlockChild(el)) {
      const chars = inline(el, ITALIC.has(tag), []);
      // A heading broken by <br> is two headings; a paragraph broken by <br> is verse, a line each, unless its lines
      // are the long ones of prose wrapped by hand (a book converted from a text file), which join back up.
      const broken = chars.some(([c]) => c === "\n");
      let lines = linesOf(chars, broken);
      if (broken && !isHeading && lines.length > 1 && wrappedProse(lines)) lines = linesOf(chars, false);
      for (const line of lines) emit(isHeading ? "h" : lines.length > 1 ? "v" : "p", line);
      return;
    }
    // A container: its blocks in turn, with any loose text between them as paragraphs of their own.
    let loose = [];
    const flushLoose = () => {
      for (const line of linesOf(loose, false)) emit(isHeading ? "h" : "p", line);
      loose = [];
    };
    for (const child of el.childNodes) {
      if (child.nodeType === 1 && BLOCK.has(tagOf(child))) {
        flushLoose();
        walk(child, isHeading);
      } else if (child.nodeType === 3) {
        loose.push(...charsOf(child.data, false, false));
      } else if (child.nodeType === 1) {
        if (child.id) ids.push(child.id);
        if (skip(child)) continue;
        if (tagOf(child) === "br") loose.push(["\n", false]);
        else inline(child, ITALIC.has(tagOf(child)), loose);
      }
    }
    flushLoose();
  }
  walk(body, false);
  return blocks;
}

// ---------- the book ----------

/** Words of a line, and which of them are italic (a word is, when its first letter is). */
function wordsOf(line, lang) {
  const words = splitWords(line.text, lang);
  const italic = [];
  let at = 0;
  for (const word of words) {
    const i = line.text.indexOf(word, at);
    const offset = i < 0 ? at : i;
    const letter = word.search(/[\p{L}\p{N}]/u);
    italic.push(Boolean(line.italic?.[offset + Math.max(0, letter)]));
    at = offset + word.length;
  }
  return { words, italic };
}

/**
 * Makes a lexicommons-book from an EPUB File. Throws an EpubError (or ZipError) meant for people: DRM, damage, a
 * language it can't read yet, or no text.
 */
export async function bookFromEpub(file, { fileName = file.name ?? "book.epub" } = {}) {
  if (file.size > MAX_EPUB_BYTES) throw new EpubError(`That EPUB is ${Math.round(file.size / 1e6)} MB; it can be up to ${MAX_EPUB_BYTES / 1e6} MB.`);
  let zip;
  try {
    zip = await openZip(file);
  } catch (error) {
    throw error instanceof ZipError ? new EpubError(error.message) : error;
  }
  await refuseDrm(zip);
  const pkg = await readPackage(zip);
  const lang = pkg.language || "en";
  if (!LANGUAGES[lang]) throw new EpubError(`This book is in a language Lexicommons can't read in yet (${lang}).`);
  const toc = await readToc(zip, pkg);

  const words = [];
  const italicSpans = [];
  const paras = [];
  const chapters = [];
  let pendingChapter = null;
  const startChapter = (title) => {
    pendingChapter = title;
  };
  const addWords = (k, line) => {
    const { words: w, italic } = wordsOf(line, lang);
    if (!w.length) return;
    if (pendingChapter !== null) {
      chapters.push({ title: pendingChapter, para: paras.length });
      pendingChapter = null;
    }
    const s = words.length;
    w.forEach((word, j) => {
      words.push(word);
      if (!italic[j]) return;
      const last = italicSpans[italicSpans.length - 1];
      if (last && last[1] === s + j) last[1] = s + j + 1;
      else italicSpans.push([s + j, s + j + 1]);
    });
    paras.push({ k, s, e: words.length });
  };

  const bookTitle = (pkg.title || fileName.replace(/\.epub$/i, "")).slice(0, 200);
  for (const item of pkg.spine) {
    const text = await zip.text(item.path);
    if (text === null) continue;
    const doc = parseContent(text);
    const body = doc.body ?? byLocalName(doc, "body")[0];
    if (!body) continue;
    const firstSection = [...body.children].find((c) => !NEVER.has(tagOf(c)));
    if (SKIP_TYPES.test(typesOf(body)) || (firstSection && SKIP_TYPES.test(typesOf(firstSection)) && body.children.length === 1)) continue;
    const blocks = blocksOf(body);
    // A picture's own page (a cover's wrapper, with a "back" link) has no text worth reading.
    const wordsHere = blocks.reduce((n, b) => n + (b.text?.split(" ").length ?? 0), 0);
    if (wordsHere < 4 && byLocalName(body, "img").length) continue;
    const entries = toc.get(item.path) ?? [];
    const fileEntry = entries.filter((e) => !e.fragment).at(-1);
    const byFragment = new Map(entries.filter((e) => e.fragment).map((e) => [e.fragment, e.title]));
    // Without a table of contents, a file's first heading starts a chapter.
    if (!toc.size) {
      const heading = blocks.find((b) => b.k === "h");
      if (heading && blocks.some((b) => b.k === "p")) startChapter(heading.text);
    } else if (fileEntry) startChapter(fileEntry.title);
    blocks.forEach((block) => {
      // An entry pointing into the file (at this block or an element just before it) starts a chapter here.
      const hits = block.ids.filter((id) => byFragment.has(id));
      if (hits.length) startChapter(byFragment.get(hits.at(-1)));
      if (block.k === "scene") {
        // Never at a chapter's start or twice in a row.
        const last = paras[paras.length - 1];
        if (pendingChapter === null && last && last.k !== "scene" && !(chapters.length && chapters.at(-1).para === paras.length)) {
          paras.push({ k: "scene", s: words.length, e: words.length });
        }
        return;
      }
      addWords(block.k, block);
    });
  }
  // No scene break at the end of a chapter.
  for (let ci = chapters.length - 1; ci >= -1; ci--) {
    const end = ci + 1 < chapters.length ? chapters[ci + 1].para : paras.length;
    if (end > 0 && paras[end - 1]?.k === "scene") {
      paras.splice(end - 1, 1);
      for (const c of chapters) if (c.para >= end) c.para--;
    }
  }
  if (!words.length) throw new EpubError("There's no text in that EPUB to read.");

  // A chapter with nothing but headings (and breaks) in it, like a title page's "Contents", joins the one before it.
  for (let ci = chapters.length - 1; ci > 0; ci--) {
    const end = ci + 1 < chapters.length ? chapters[ci + 1].para : paras.length;
    if (paras.slice(chapters[ci].para, end).every((p) => p.k === "h" || p.k === "scene")) chapters.splice(ci, 1);
  }
  // An entry that runs a picture's caption into the chapter's heading ("He rode a black horse. CHAPTER III.") is
  // called by its heading.
  for (const chapter of chapters) {
    const head = paras[chapter.para];
    if (head?.k !== "h") continue;
    const heading = joinWords(words.slice(head.s, head.e), LANGUAGES[lang]?.separator ?? " ");
    const label = chapter.title.toLowerCase();
    if (label.length > heading.length && label.endsWith(heading.toLowerCase())) chapter.title = heading;
  }
  // Chapters in order, each with a paragraph of its own; text before the first opens the book.
  const kept = [];
  for (const chapter of chapters) if (chapter.para < paras.length && (!kept.length || chapter.para > kept.at(-1).para)) kept.push(chapter);
  if (!kept.length || kept[0].para > 0) kept.unshift({ title: bookTitle, para: 0 });

  const book = {
    format: "lexicommons-book",
    v: 1,
    id: `text-${crypto.randomUUID()}`,
    version: "",
    title: bookTitle,
    authors: pkg.authors.map((name) => ({ name, role: "author" })),
    lang,
    source: { kind: "upload", ref: fileName },
    rights: null,
    words,
    italic: italicSpans,
    paras,
    chapters: kept,
    sentences: segmentSentences(words, paras, lang),
  };
  book.version = await bookVersion(book);
  const problems = await validateBook(book);
  if (problems.length) {
    console.error("[lexicommons] an imported EPUB failed the book check:", problems);
    throw new EpubError(`That EPUB couldn't be read in: ${problems[0]}`);
  }
  return book;
}
