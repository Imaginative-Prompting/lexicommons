// The open library's catalog (lexicommons-catalogue, /library/catalogue.json): what's on the shelf. Pure (no files,
// no storage), so the Worker's library publishing (src/library-admin.ts) and the tests build exactly the same entries
// the books pipeline's publish step does (pipelines/books/publish.ts), and keep the same rules:
//   - a book's files are named by its version, a layer's and a list's by the hash of their own bytes, so nothing is
//     ever overwritten;
//   - a layer is never replaced by one with fewer sentences for the same book version, and a list never by one with
//     fewer lemmas;
//   - a book published at a new version starts with only the layers given with it (a layer belongs to one version).
// Every change keeps every key it doesn't own as it found it (packs are lex-packs' study/pack-format.js withPackEntry).
//
// The catalog:
//   books   [{ id, version, title, authors, lang, rights, source, words, sentences, chapters, book, level?, cover?,
//             coverSize? ([width, height] of the cover's picture, so its box has its shape before the picture comes), pictures?, layers: { <lang>: { kind, url, licence, credit, sentences, made } }, publishedAt }], by title
//   lists   { frequency: { <lang>: { url, licence, attribution, corpus, lemmas, made, publishedAt } } }
//   packs   { <lang>: [...] }   the default packs (study/pack-format.js catalogueEntry)
//   grammar { <lang>: { revision, version, url, patterns } }   optional: each language's shared grammar after the app's
//           own revision 1 (lang/grammar.js grammarEntry); a restore never takes one back
//   notes   { <pack id>: { version, url, sentences } }   optional: a pack's notes beside it (study/pack-notes.js); they outlive its versions
//   forms   { <lang>: { version, url, lines } }   optional: a language's word forms, one line each (study/pack-notes.js)
//   shelf   [{ id, title, books: [<book id>…] }]   optional: the shelf's sections, in order (curated through MCP)
//   writeId a fresh random id on every write through the admin tools (src/library-admin.ts), so no two writes share
//           bytes; readers ignore it

import { coverPicture, picturePath } from "./book-format.js";

/** A picture's [width, height] in pixels, when it says both (a checked book's pictures always do); else undefined, and no size is kept. */
const sizeOf = (picture) => (Number.isInteger(picture?.w) && Number.isInteger(picture?.h) && picture.w > 0 && picture.h > 0 ? [picture.w, picture.h] : undefined);
import { grammarCatalogueProblems } from "../lang/grammar.js";
import { formsCatalogueProblems, notesCatalogueProblems } from "../study/pack-notes.js";

export const CATALOGUE_FORMAT = "lexicommons-catalogue";

/** The catalog of a library nothing has been published to yet (src/books.ts answers the same). */
export const emptyCatalogue = () => ({ format: CATALOGUE_FORMAT, v: 1, books: [], lists: {} });

export const SHELF_LIMITS = { sections: 20, title: 60, books: 200 };
const SECTION_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Where a book's files live in the library: books/<id>/<version>. */
export const bookPrefix = (book) => `books/${book.id}/${book.version}`;
/** A layer's key, named by the sha256 of the file's own bytes. */
export const layerKey = (book, layer, fileSha256) => `${bookPrefix(book)}/${layer.kind}.${layer.to}.${fileSha256.slice(0, 12)}.json`;
/** A frequency list's key, named by the sha256 of the file's own bytes. */
export const listKey = (list, fileSha256) => `lists/frequency.${list.lang}.${fileSha256.slice(0, 12)}.json`;

/** A layer's catalog entry. */
export function layerEntry(layer, key) {
  return {
    kind: layer.kind,
    url: `/library/${key}`,
    licence: layer.licence,
    credit: layer.credit,
    sentences: layer.sentences.length,
    made: { pipeline: layer.made?.pipeline, model: layer.made?.model, run: layer.made?.run, at: layer.made?.at },
  };
}

/** A frequency list's catalog entry. */
export function listEntry(list, key, publishedAt) {
  return {
    url: `/library/${key}`,
    licence: list.licence,
    attribution: list.attribution,
    corpus: list.corpus,
    lemmas: list.lemmas.length,
    made: { pipeline: list.made?.pipeline, at: list.made?.at },
    publishedAt,
  };
}

const byTitle = (a, b) => (a.title < b.title ? -1 : 1);

/**
 * The catalog with a book (and the layers given with it) on it. layers: { <lang>: layerEntry }. Returns
 * { catalog, problems, notes }: problems refuse the change (catalogue is null), notes are for whoever published it.
 */
export function withBook(catalogue, book, layers, publishedAt) {
  const problems = [];
  const notes = [];
  const previous = catalogue.books.find((b) => b.id === book.id);
  if (previous && previous.version === book.version) {
    for (const [lang, layer] of Object.entries(layers)) {
      const live = previous.layers?.[lang];
      if (live && live.sentences > layer.sentences) problems.push(`the live ${lang} layer has ${live.sentences} sentences; this one has ${layer.sentences}. A layer is never replaced by a smaller one.`);
      // A book has one layer a language: a help or weave layer replaces a translation beside it (a help sentence carries its own
      // English), never the other way.
      if (live && live.kind !== "parallel" && layer.kind === "parallel") problems.push(`the live ${lang} layer is a ${live.kind} layer, and a translation beside the book never replaces one: unpublish that layer first to put this one in its place.`);
    }
  } else if (previous) {
    const dropped = Object.keys(previous.layers ?? {}).filter((lang) => !layers[lang]);
    if (dropped.length) notes.push(`${book.id} was at version ${previous.version}; its ${dropped.join(", ")} ${dropped.length === 1 ? "layer belongs" : "layers belong"} to that version, so ${dropped.length === 1 ? "it isn't" : "they aren't"} on the new one. Weave the new version to bring ${dropped.length === 1 ? "it" : "them"} back.`);
  }
  if (problems.length) return { catalogue: null, problems, notes };
  const entry = {
    id: book.id,
    version: book.version,
    title: book.title,
    authors: book.authors,
    lang: book.lang,
    rights: book.rights,
    source: book.source,
    words: book.words.length,
    sentences: book.sentences.length,
    chapters: book.chapters.length,
    book: `/library/${bookPrefix(book)}/book.json`,
    level: book.source?.level,
    // The book's own kind, as it says it (book-format.js: novel, stories, children, nonfiction), never a guess: Read's shelf has a kind of its
    // own for non-fiction (shelf.js bookKinds).
    kind: ["novel", "stories", "children", "nonfiction"].includes(book.kind) ? book.kind : undefined,
    cover: coverPicture(book) ? `/library/${picturePath(coverPicture(book).file)}` : undefined,
    coverSize: sizeOf(coverPicture(book)),
    pictures: book.pictures?.length,
    layers: { ...(previous?.version === book.version ? previous.layers : {}), ...layers },
    // The book's own definitions (withDefinitions, of: "book") belong to this version of it: kept when the same version is published
    // again (to add a layer), gone with a new one (6 Nov 2026, Codex C6: they were dropped, and the reader lost them).
    definitions: previous?.version === book.version ? previous.definitions : undefined,
    publishedAt,
  };
  // Through JSON, as the catalog is stored: an undefined field (no level, no cover) isn't kept.
  const books = [...catalogue.books.filter((b) => b.id !== book.id), JSON.parse(JSON.stringify(entry))].sort(byTitle);
  return { catalogue: { ...catalogue, books }, problems, notes };
}

/** A definitions file's key, named by the sha256 of its own bytes, beside its book's files. */
export const definitionsKey = (book, defs, fileSha256) => `${bookPrefix(book)}/defs.${defs.lang}.${fileSha256.slice(0, 12)}.json`;

/**
 * The catalog with a definitions file on it: on the layer it's for (the layer entry whose file is `of`), or on the
 * book's entry for its own words ("book"), at the book's version as published. Returns { catalogue, problems }.
 */
export function withDefinitions(catalogue, book, defs, key) {
  const entry = catalogue.books.find((b) => b.id === book.id);
  if (!entry || entry.version !== book.version) return { catalogue: null, problems: [`${book.id}@${book.version} isn't on the catalog: publish the book first.`] };
  const lemmas = Object.keys(defs.entries ?? {}).length;
  const definitions = { url: `/library/${key}`, of: defs.of, lemmas, licence: defs.licence, credit: defs.credit };
  let next;
  if (defs.of === "book") next = { ...entry, definitions };
  else {
    const lang = Object.keys(entry.layers ?? {}).find((l) => entry.layers[l].url?.endsWith(`.${defs.of}.json`));
    if (!lang) return { catalogue: null, problems: [`no layer of ${book.id}@${book.version} on the catalog is the file ${defs.of}: publish the layer first.`] };
    const live = entry.layers[lang].definitions;
    if (live && live.lemmas > lemmas) return { catalogue: null, problems: [`the live definitions for the ${lang} layer cover ${live.lemmas} lemmas; these cover ${lemmas}. Definitions are never replaced by fewer.`] };
    next = { ...entry, layers: { ...entry.layers, [lang]: { ...entry.layers[lang], definitions } } };
  }
  return { catalogue: { ...catalogue, books: catalogue.books.map((b) => (b.id === book.id ? next : b)) }, problems: [] };
}

/** The catalog with a frequency list on it. Returns { catalogue, problems }. */
export function withList(catalogue, list, entry) {
  const live = catalogue.lists?.frequency?.[list.lang];
  if (live && live.lemmas > entry.lemmas) {
    return { catalogue: null, problems: [`the live ${list.lang} frequency list has ${live.lemmas} lemmas; this one has ${entry.lemmas}. A list is never replaced by a smaller one.`] };
  }
  const lists = { ...(catalogue.lists ?? {}), frequency: { ...(catalogue.lists?.frequency ?? {}), [list.lang]: JSON.parse(JSON.stringify(entry)) } };
  return { catalogue: { ...catalogue, lists }, problems: [] };
}

/**
 * Takes something off the catalog: a whole book ({ book }), one of its layers ({ book, layer: <lang> }) or a
 * frequency list ({ list: "frequency", lang }). Its files stay in the library, so a device that has it keeps working,
 * and a restore brings it back. Returns { catalogue, problems, removed }.
 */
export function without(catalogue, target) {
  if (target.list !== undefined) {
    if (target.list !== "frequency") return { catalogue: null, problems: [`There are only frequency lists; "${target.list}" isn't one.`], removed: null };
    const live = catalogue.lists?.frequency?.[target.lang];
    if (!live) return { catalogue: null, problems: [`There's no ${target.lang} frequency list on the catalog.`], removed: null };
    const frequency = { ...catalogue.lists.frequency };
    delete frequency[target.lang];
    return { catalogue: { ...catalogue, lists: { ...catalogue.lists, frequency } }, problems: [], removed: live };
  }
  const book = catalogue.books.find((b) => b.id === target.book);
  if (!book) return { catalogue: null, problems: [`There's no book "${target.book}" on the catalog.`], removed: null };
  if (target.layer !== undefined) {
    const live = book.layers?.[target.layer];
    if (!live) return { catalogue: null, problems: [`${target.book} has no ${target.layer} layer. It has: ${Object.keys(book.layers ?? {}).join(", ") || "none"}.`], removed: null };
    const layers = { ...book.layers };
    delete layers[target.layer];
    return { catalogue: { ...catalogue, books: catalogue.books.map((b) => (b === book ? { ...b, layers } : b)) }, problems: [], removed: live };
  }
  const next = { ...catalogue, books: catalogue.books.filter((b) => b !== book) };
  // A book that's gone leaves the shelf's sections too; an empty section stays (its title is curation).
  if (Array.isArray(catalogue.shelf)) next.shelf = catalogue.shelf.map((section) => ({ ...section, books: section.books.filter((id) => id !== book.id) }));
  return { catalogue: next, problems: [], removed: book };
}

/**
 * The catalog with the shelf's sections set: [{ id, title, books: [<book id>…] }], in order; [] takes them off (the
 * shelf goes back to every book by title). Every book must be on the catalog; a book may sit in more than one
 * section. Returns { catalogue, problems, sections } (sections as kept).
 */
export function withShelf(catalogue, sections) {
  const problems = [];
  if (!Array.isArray(sections)) return { catalogue: null, problems: ["sections must be a list."], sections: null };
  if (sections.length > SHELF_LIMITS.sections) problems.push(`The shelf has room for ${SHELF_LIMITS.sections} sections; this has ${sections.length}.`);
  const known = new Set(catalogue.books.map((b) => b.id));
  const ids = new Set();
  const kept = sections.map((section, n) => {
    const at = `sections[${n}]`;
    const title = typeof section?.title === "string" ? section.title.replace(/\s+/g, " ").trim() : "";
    if (!title) problems.push(`${at}.title is missing.`);
    else if (title.length > SHELF_LIMITS.title) problems.push(`${at}.title is ${title.length} characters; keep it to ${SHELF_LIMITS.title}.`);
    const id = section?.id ?? title.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    if (!SECTION_ID.test(id)) problems.push(`${at}.id must be lowercase letters, digits and dashes.`);
    else if (ids.has(id)) problems.push(`${at}.id "${id}" is used twice.`);
    ids.add(id);
    const books = Array.isArray(section?.books) ? section.books : null;
    if (!books) problems.push(`${at}.books must be a list of book ids.`);
    else {
      if (books.length > SHELF_LIMITS.books) problems.push(`${at} has ${books.length} books; keep it to ${SHELF_LIMITS.books}.`);
      const unknown = books.filter((b) => !known.has(b));
      if (unknown.length) problems.push(`${at}: ${unknown.map((b) => `"${b}"`).join(", ")} ${unknown.length === 1 ? "isn't a book" : "aren't books"} on the catalog.`);
      if (new Set(books).size !== books.length) problems.push(`${at} lists a book twice.`);
    }
    return { id, title, books: books ?? [] };
  });
  if (problems.length) return { catalogue: null, problems, sections: null };
  const next = { ...catalogue };
  if (kept.length) next.shelf = kept;
  else delete next.shelf;
  return { catalogue: next, problems, sections: kept };
}

/**
 * A catalog's shape, checked before every write and every restore. Returns a list of problems; empty means it can
 * be stored. Keys this module doesn't know (packs, and whatever comes later) only have to be objects.
 */
export function catalogueProblems(catalogue) {
  const problems = [];
  if (!catalogue || typeof catalogue !== "object" || Array.isArray(catalogue)) return ["The catalog must be an object."];
  if (catalogue.format !== CATALOGUE_FORMAT || catalogue.v !== 1) problems.push(`format must be "${CATALOGUE_FORMAT}" and v 1.`);
  if (!Array.isArray(catalogue.books)) return [...problems, "books must be a list."];
  const ids = new Set();
  for (const [n, book] of catalogue.books.entries()) {
    if (!book || typeof book.id !== "string" || typeof book.version !== "string") {
      problems.push(`books[${n}] needs an id and a version.`);
      continue;
    }
    if (ids.has(book.id)) problems.push(`books[${n}]: "${book.id}" is on the catalog twice.`);
    ids.add(book.id);
    if (typeof book.book !== "string" || !book.book.startsWith(`/library/books/${book.id}/${book.version}/`)) problems.push(`books[${n}].book must point into /library/books/${book.id}/${book.version}/.`);
    for (const [lang, layer] of Object.entries(book.layers ?? {})) {
      if (typeof layer?.url !== "string" || !layer.url.startsWith(`/library/books/${book.id}/${book.version}/`)) problems.push(`books[${n}].layers.${lang} must point into its book's version.`);
    }
  }
  if (catalogue.lists !== undefined && (typeof catalogue.lists !== "object" || Array.isArray(catalogue.lists))) problems.push("lists must be an object.");
  for (const [lang, list] of Object.entries(catalogue.lists?.frequency ?? {})) {
    if (typeof list?.url !== "string" || !list.url.startsWith(`/library/lists/frequency.${lang}.`)) problems.push(`lists.frequency.${lang} must point at a ${lang} frequency list.`);
  }
  if (catalogue.packs !== undefined && (typeof catalogue.packs !== "object" || Array.isArray(catalogue.packs))) problems.push("packs must be an object.");
  problems.push(...grammarCatalogueProblems(catalogue));
  problems.push(...notesCatalogueProblems(catalogue));
  problems.push(...formsCatalogueProblems(catalogue));
  if (catalogue.shelf !== undefined) {
    if (!Array.isArray(catalogue.shelf)) problems.push("shelf must be a list.");
    else for (const [n, section] of catalogue.shelf.entries()) for (const id of section?.books ?? []) if (!ids.has(id)) problems.push(`shelf[${n}] lists "${id}", which isn't on the catalog.`);
  }
  return problems;
}
