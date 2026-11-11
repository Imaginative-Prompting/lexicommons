#!/usr/bin/env node
// The open library's catalog rules (public/js/read/catalogue.js), case by case: the entries publishing builds, what
// a change refuses, what it keeps as it found it, the shelf's sections, and the shape checked before every write.
// Every fixture is made up for the test. Exit 0 = pass.

import assert from "node:assert/strict";
import { bookPrefix, catalogueProblems, definitionsKey, emptyCatalogue, layerEntry, layerKey, listEntry, listKey, without, withBook, withDefinitions, withList, withShelf } from "../public/js/read/catalogue.js";

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (error) {
    failures.push(`${name}\n    ${error.message.split("\n").join("\n    ")}`);
  }
}

const AT = "2026-10-27T10:00:00.000Z";
const SHA = "ab".repeat(32);
const book = (id, version, extra = {}) => ({
  id,
  version,
  title: extra.title ?? id,
  authors: [{ name: "A Writer", role: "author" }],
  lang: "en",
  rights: { us: true, eu: true },
  source: { kind: "paste" },
  words: ["One", "two."],
  sentences: [[0, 2]],
  chapters: [{ title: "One", para: 0 }],
  ...extra,
});
const layer = (to, sentences, kind = "weave") => ({ kind, to, licence: "CC BY-SA 4.0", credit: "Translated for Lexicommons", made: { pipeline: "1", model: "m", run: "r", at: AT }, sentences: Array.from({ length: sentences }, () => ({})) });
const entryFor = (b, l) => layerEntry(l, layerKey(b, l, SHA));

await test("keys: a book by its version, a layer and a list by their own bytes' hash", () => {
  const b = book("alice", "0123456789abcdef");
  assert.equal(bookPrefix(b), "books/alice/0123456789abcdef");
  assert.equal(layerKey(b, layer("nl", 1), SHA), `books/alice/0123456789abcdef/weave.nl.${SHA.slice(0, 12)}.json`);
  assert.equal(listKey({ lang: "nl" }, SHA), `lists/frequency.nl.${SHA.slice(0, 12)}.json`);
});

await test("a book's entry: the fields the shelf reads, with no level or cover when it has none", () => {
  const b = book("alice", "0123456789abcdef");
  const { catalogue, problems } = withBook(emptyCatalogue(), b, { nl: entryFor(b, layer("nl", 1)) }, AT);
  assert.deepEqual(problems, []);
  const entry = catalogue.books[0];
  assert.deepEqual(Object.keys(entry), ["id", "version", "title", "authors", "lang", "rights", "source", "words", "sentences", "chapters", "book", "pictures", "layers", "publishedAt"].filter((k) => k !== "pictures"));
  assert.equal(entry.book, "/library/books/alice/0123456789abcdef/book.json");
  assert.deepEqual([entry.words, entry.sentences, entry.chapters], [2, 1, 1]);
  assert.equal(entry.layers.nl.sentences, 1);
});

await test("a picture book's entry has its cover (the first page's picture) and its pictures' count", () => {
  const b = book("rode", "0123456789abcdef", { pictures: [{ file: "aaaaaaaaaaaaaaaa.jpg" }, { file: "bbbbbbbbbbbbbbbb.jpg" }], pages: [{ picture: 1 }], source: { kind: "storyweaver", level: 1 } });
  const entry = withBook(emptyCatalogue(), b, {}, AT).catalogue.books[0];
  assert.equal(entry.cover, "/library/pictures/bbbbbbbbbbbbbbbb.jpg");
  assert.equal(entry.pictures, 2);
  assert.equal(entry.level, 1);
  assert.equal(entry.coverSize, undefined, "a size its picture doesn't say");
});

await test("a picture book's entry says its cover's size, so the cover's box has its shape before the picture comes", () => {
  const b = book("rode", "0123456789abcdef", { pictures: [{ file: "aaaaaaaaaaaaaaaa.jpg", w: 1073, h: 513 }, { file: "bbbbbbbbbbbbbbbb.jpg", w: 800, h: 600 }], pages: [{ picture: 1 }] });
  const entry = withBook(emptyCatalogue(), b, {}, AT).catalogue.books[0];
  assert.deepEqual(entry.coverSize, [800, 600]);
  assert.deepEqual(Object.keys(entry).slice(Object.keys(entry).indexOf("cover"), Object.keys(entry).indexOf("cover") + 2), ["cover", "coverSize"]);
});

await test("a book's own kind on its entry (Read's Non-fiction shelf), only as the book says one the format knows, never a guess", () => {
  const entryOf = (fields) => withBook(emptyCatalogue(), book("weer", "0123456789abcdef", fields), {}, AT).catalogue.books[0];
  assert.equal(entryOf({ kind: "nonfiction" }).kind, "nonfiction");
  for (const kind of ["novel", "stories", "children"]) assert.equal(entryOf({ kind }).kind, kind);
  assert.equal(entryOf({ kind: "cookbook" }).kind, undefined, "a kind the format doesn't know");
  assert.equal(entryOf({}).kind, undefined, "none said");
  assert.equal(entryOf({ subjects: ["Science"] }).kind, undefined, "not guessed from its subjects (book-format.js kindOfBook does that for covers)");
});

await test("a book's own cover: a novel's (no pages), or a picture book's named one over its first page's", () => {
  const novel = book("alice", "0123456789abcdef", { pictures: [{ file: "cccccccccccccccc.png" }], cover: 0 });
  const entry = withBook(emptyCatalogue(), novel, {}, AT).catalogue.books[0];
  assert.equal(entry.cover, "/library/pictures/cccccccccccccccc.png");
  assert.equal(entry.pictures, 1);
  const named = book("rode", "0123456789abcdef", { pictures: [{ file: "aaaaaaaaaaaaaaaa.jpg" }, { file: "bbbbbbbbbbbbbbbb.jpg" }], pages: [{ picture: 1 }], cover: 0 });
  assert.equal(withBook(emptyCatalogue(), named, {}, AT).catalogue.books[0].cover, "/library/pictures/aaaaaaaaaaaaaaaa.jpg");
});

await test("definitions: on the layer whose file they're for, or on the book; never replaced by fewer", () => {
  const b = book("kat", "0123456789abcdef");
  const l = layer("en", 3, "help");
  const key = layerKey(b, l, "cd".repeat(32));
  const withLayer = withBook(emptyCatalogue(), b, { en: layerEntry(l, key) }, AT).catalogue;
  const defs = { lang: "nl", of: "cdcdcdcdcdcd", licence: "CC-BY-SA-4.0", credit: "Definitions written for Lexicommons", entries: { kat: {}, hond: {} } };
  const dkey = definitionsKey(b, defs, "ef".repeat(32));
  assert.equal(dkey, "books/kat/0123456789abcdef/defs.nl.efefefefefef.json");
  const on = withDefinitions(withLayer, b, defs, dkey);
  assert.deepEqual(on.problems, []);
  assert.deepEqual(on.catalogue.books[0].layers.en.definitions, { url: `/library/${dkey}`, of: "cdcdcdcdcdcd", lemmas: 2, licence: "CC-BY-SA-4.0", credit: "Definitions written for Lexicommons" });
  assert.match(withDefinitions(on.catalogue, b, { ...defs, entries: { kat: {} } }, dkey).problems[0], /never replaced by fewer/);
  assert.match(withDefinitions(withLayer, b, { ...defs, of: "000000000000" }, dkey).problems[0], /publish the layer first/);
  assert.match(withDefinitions(emptyCatalogue(), b, defs, dkey).problems[0], /publish the book first/);
  const own = withDefinitions(withLayer, b, { ...defs, of: "book", lang: "en" }, dkey);
  assert.equal(own.catalogue.books[0].definitions.of, "book");
});

await test("a book's own definitions stay when the same version is published again (to add a layer), and go with a new version", () => {
  const b = book("kat", "0123456789abcdef");
  const l = layer("en", 3, "help");
  const withLayer = withBook(emptyCatalogue(), b, { en: layerEntry(l, layerKey(b, l, "cd".repeat(32))) }, AT).catalogue;
  const defs = { lang: "en", of: "book", licence: "CC-BY-SA-4.0", credit: "Definitions written for Lexicommons", entries: { kat: {}, hond: {} } };
  const own = withDefinitions(withLayer, b, defs, definitionsKey(b, defs, "ef".repeat(32))).catalogue;
  const nl = layer("nl", 3);
  const again = withBook(own, b, { nl: layerEntry(nl, layerKey(b, nl, "aa".repeat(32))) }, AT);
  assert.deepEqual(again.problems, []);
  assert.deepEqual(again.catalogue.books[0].definitions, own.books[0].definitions, "the book's definitions after adding a layer");
  assert.ok(again.catalogue.books[0].layers.en && again.catalogue.books[0].layers.nl);
  const next = withBook(own, book("kat", "fedcba9876543210"), {}, AT).catalogue.books[0];
  assert.equal(next.definitions, undefined, "a new version's are its own, published again");
});

await test("books stay sorted by title, and a book replaces its own entry", () => {
  let c = withBook(emptyCatalogue(), book("b", "1111111111111111", { title: "Beta" }), {}, AT).catalogue;
  c = withBook(c, book("a", "2222222222222222", { title: "Alpha" }), {}, AT).catalogue;
  c = withBook(c, book("b", "1111111111111111", { title: "Beta" }), {}, AT).catalogue;
  assert.deepEqual(c.books.map((x) => x.id), ["a", "b"]);
});

await test("a layer for the same version joins the ones there; a smaller one is refused", () => {
  const b = book("alice", "0123456789abcdef");
  let c = withBook(emptyCatalogue(), b, { nl: entryFor(b, layer("nl", 5)) }, AT).catalogue;
  c = withBook(c, b, { de: entryFor(b, layer("de", 5)) }, AT).catalogue;
  assert.deepEqual(Object.keys(c.books[0].layers).sort(), ["de", "nl"]);
  const smaller = withBook(c, b, { nl: entryFor(b, layer("nl", 4)) }, AT);
  assert.equal(smaller.catalogue, null);
  assert.match(smaller.problems[0], /live nl layer has 5 sentences; this one has 4/);
  const same = withBook(c, b, { nl: entryFor(b, layer("nl", 5)) }, AT);
  assert.deepEqual(same.problems, []);
});

await test("a new version of a book starts with only its own layers, and says which it left behind", () => {
  const v1 = book("alice", "0123456789abcdef");
  const c = withBook(emptyCatalogue(), v1, { nl: entryFor(v1, layer("nl", 5)), de: entryFor(v1, layer("de", 5)) }, AT).catalogue;
  const v2 = book("alice", "fedcba9876543210");
  const next = withBook(c, v2, { nl: entryFor(v2, layer("nl", 1)) }, AT);
  assert.deepEqual(Object.keys(next.catalogue.books[0].layers), ["nl"]);
  assert.match(next.notes[0], /its de layer belongs to that version/);
});

await test("a list: added, replaced by a bigger one, never by a smaller one", () => {
  const list = (n) => ({ lang: "nl", licence: "CC-BY-SA-4.0", attribution: [], corpus: { tokens: 1 }, made: { pipeline: "1", at: AT }, lemmas: Array.from({ length: n }, (_, i) => [`w${i}`, 1]) });
  let c = withList(emptyCatalogue(), list(10), listEntry(list(10), listKey(list(10), SHA), AT)).catalogue;
  assert.equal(c.lists.frequency.nl.lemmas, 10);
  c = withList(c, list(20), listEntry(list(20), listKey(list(20), SHA), AT)).catalogue;
  assert.equal(c.lists.frequency.nl.lemmas, 20);
  const smaller = withList(c, list(5), listEntry(list(5), listKey(list(5), SHA), AT));
  assert.equal(smaller.catalogue, null);
  assert.match(smaller.problems[0], /20 lemmas; this one has 5/);
});

await test("every change keeps the keys it doesn't own (packs, and whatever comes later) as found", () => {
  const base = { ...emptyCatalogue(), packs: { nl: [{ id: "starter", version: "abcdefabcdef" }] }, future: { x: 1 } };
  const b = book("alice", "0123456789abcdef");
  for (const next of [withBook(base, b, {}, AT).catalogue, withShelf(withBook(base, b, {}, AT).catalogue, [{ title: "One", books: ["alice"] }]).catalogue]) {
    assert.deepEqual(next.packs, base.packs);
    assert.deepEqual(next.future, base.future);
  }
});

await test("without: a layer, a book (and its place on the shelf), a list; and what isn't there", () => {
  const b = book("alice", "0123456789abcdef");
  let c = withBook(emptyCatalogue(), b, { nl: entryFor(b, layer("nl", 1)) }, AT).catalogue;
  c = withShelf(c, [{ title: "One", books: ["alice"] }]).catalogue;
  const offLayer = without(c, { book: "alice", layer: "nl" });
  assert.deepEqual(offLayer.catalogue.books[0].layers, {});
  const offBook = without(c, { book: "alice" });
  assert.deepEqual(offBook.catalogue.books, []);
  assert.deepEqual(offBook.catalogue.shelf, [{ id: "one", title: "One", books: [] }]);
  assert.match(without(c, { book: "nope" }).problems[0], /no book "nope"/);
  assert.match(without(c, { book: "alice", layer: "de" }).problems[0], /has no de layer. It has: nl/);
  assert.match(without(c, { list: "frequency", lang: "nl" }).problems[0], /no nl frequency list/);
  assert.equal(c.books[0].layers.nl.sentences, 1, "the catalog it was given is unchanged");
});

await test("the shelf: ids from titles, every book on the catalog, no duplicates, limits; [] takes it off", () => {
  let c = withBook(emptyCatalogue(), book("a", "1111111111111111"), {}, AT).catalogue;
  c = withBook(c, book("b", "2222222222222222"), {}, AT).catalogue;
  const set = withShelf(c, [{ title: "Start  here", books: ["b", "a"] }, { title: "Één boek", books: ["a"] }]);
  assert.deepEqual(set.sections, [{ id: "start-here", title: "Start here", books: ["b", "a"] }, { id: "een-boek", title: "Één boek", books: ["a"] }]);
  assert.match(withShelf(c, [{ title: "X", books: ["zzz"] }]).problems[0], /"zzz" isn't a book/);
  assert.match(withShelf(c, [{ title: "X", books: ["a", "a"] }]).problems[0], /lists a book twice/);
  assert.match(withShelf(c, [{ title: "X", books: [] }, { title: "X", books: [] }]).problems[0], /used twice/);
  assert.match(withShelf(c, [{ title: "", books: [] }]).problems[0], /title is missing/);
  assert.match(withShelf(c, Array.from({ length: 21 }, (_, i) => ({ title: `S${i}`, books: [] }))).problems[0], /room for 20 sections/);
  assert.equal("shelf" in withShelf(set.catalogue, []).catalogue, false);
  assert.match(withShelf(c, "nope").problems[0], /must be a list/);
});

await test("the shape: what a write or a restore refuses", () => {
  assert.deepEqual(catalogueProblems(emptyCatalogue()), []);
  assert.match(catalogueProblems({ format: "x", v: 1, books: [] })[0], /format must be/);
  assert.match(catalogueProblems({ ...emptyCatalogue(), books: "no" }).join(), /books must be a list/);
  const b = withBook(emptyCatalogue(), book("a", "1111111111111111"), {}, AT).catalogue;
  assert.match(catalogueProblems({ ...b, books: [...b.books, b.books[0]] }).join(), /on the catalog twice/);
  assert.match(catalogueProblems({ ...b, books: [{ ...b.books[0], book: "/elsewhere/book.json" }] }).join(), /must point into/);
  assert.match(catalogueProblems({ ...b, books: [{ ...b.books[0], layers: { nl: { url: "/library/books/other/x/weave.json" } } }] }).join(), /layers.nl must point into its book's version/);
  assert.match(catalogueProblems({ ...b, shelf: [{ books: ["ghost"] }] }).join(), /"ghost", which isn't on the catalog/);
  assert.match(catalogueProblems({ ...b, lists: { frequency: { nl: { url: "/library/lists/frequency.de.x.json" } } } }).join(), /lists.frequency.nl must point/);
  assert.match(catalogueProblems({ ...b, packs: [] }).join(), /packs must be an object/);
});

await test("one layer a language: a help or weave layer replaces a translation beside the book, never the other way", () => {
  const b = book("rode", "0123456789abcdef");
  const beside = layer("en", 1, "parallel");
  const help = layer("en", 1, "help");
  const first = withBook(emptyCatalogue(), b, { en: entryFor(b, beside) }, AT);
  assert.deepEqual(first.problems, []);
  assert.equal(first.catalogue.books[0].layers.en.kind, "parallel");
  // A newer translation replaces the one live.
  assert.deepEqual(withBook(first.catalogue, b, { en: layerEntry(beside, layerKey(b, beside, "cd".repeat(32))) }, AT).problems, []);
  const helped = withBook(first.catalogue, b, { en: layerEntry(help, layerKey(b, help, "ab".repeat(32))) }, AT);
  assert.deepEqual(helped.problems, []);
  assert.equal(helped.catalogue.books[0].layers.en.kind, "help");
  const back = withBook(helped.catalogue, b, { en: entryFor(b, beside) }, AT);
  assert.equal(back.catalogue, null);
  assert.match(back.problems.join(" "), /the live en layer is a help layer, and a translation beside the book never replaces one/);
});

if (failures.length) {
  console.error(`catalogue: ${passed} passed, ${failures.length} failed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`catalogue: ${passed}/${passed} passed`);
