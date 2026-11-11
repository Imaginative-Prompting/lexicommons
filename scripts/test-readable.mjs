#!/usr/bin/env node
// Which open books a learner can read (public/js/read/readable.js), and that every place counting or searching them asks that one answer:
// Home's book card (read/shelf.js shelfStart, which know/today.js shows), Read's "Search N books" and its shelves' kinds (read/shelf.js),
// and Find a book's count and search (read/find.js). On a catalog where the whole count and the readable count differ, as they do for a
// learner of a language with fewer books than the catalog holds. Every fixture is made up for the test. Exit 0 = pass.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readableBooks, readableFor } from "../public/js/read/readable.js";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(join(APP, path), "utf8");

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

// Six books, three of them for a Dutch learner.
const catalog = {
  books: [
    { id: "nl-picture", lang: "nl", layers: { en: { kind: "help" } } }, // in Dutch, with English help
    { id: "en-woven-nl", lang: "en", layers: { nl: { kind: "weave" } } }, // English, woven into Dutch
    { id: "en-woven-ja", lang: "en", layers: { ja: { kind: "weave" } } }, // English, woven into Japanese
    { id: "de-help", lang: "de", layers: { en: { kind: "help" } } }, // in German, with English help
    { id: "nl-bare", lang: "nl" }, // in Dutch with no layer: a plain book, a Dutch learner's as it is
    { id: "es-bare", lang: "es" }, // in Spanish with no layer: a Spanish learner's, nobody else's
  ],
};
const ids = (books) => books.map((meta) => meta.id);

await test("a Dutch learner can read three of the six: its own language with help and plain, and one woven into it", () => {
  assert.deepEqual(ids(readableBooks(catalog, "nl")), ["nl-picture", "en-woven-nl", "nl-bare"]);
  assert.notEqual(readableBooks(catalog, "nl").length, catalog.books.length, "the fixture must have the two counts differ");
});

await test("each language its own: Japanese one, German one, Spanish its plain one, Swedish none", () => {
  assert.deepEqual(ids(readableBooks(catalog, "ja")), ["en-woven-ja"]);
  assert.deepEqual(ids(readableBooks(catalog, "de")), ["de-help"]);
  assert.deepEqual(ids(readableBooks(catalog, "es")), ["es-bare"]);
  assert.deepEqual(readableBooks(catalog, "sv"), []);
});

await test("the book's own language counts, plain or with layers; a weave counts for the language it's woven into; nothing else", () => {
  assert.equal(readableFor({ lang: "es" }, "es"), true, "a plain book in the learner's language");
  assert.equal(readableFor({ lang: "es", layers: {} }, "es"), true, "a plain book with an empty layers object");
  assert.equal(readableFor({ lang: "es" }, "nl"), false, "a plain book in another language");
  assert.equal(readableFor({ lang: "en", layers: { nl: { kind: "help" } } }, "nl"), false, "help into another language than the book's");
  assert.equal(readableFor({ lang: "en", layers: { nl: { kind: "help" } } }, "en"), true, "the book's own language, with help for someone else");
  assert.equal(readableFor({ lang: "nl", layers: { en: { kind: "weave" } } }, "nl"), true, "a book in Dutch woven out of it is still in Dutch");
  assert.equal(readableFor({ lang: "nl", layers: { en: { kind: "weave" } } }, "en"), true, "and woven into English, an English learner's too");
  assert.equal(readableFor({ lang: "nl", layers: { en: { kind: "weave" } } }, "de"), false, "neither its language nor woven into it");
  assert.equal(readableFor({ lang: "nl", layers: { en: null } }, "nl"), true, "a missing layer leaves it a plain book");
  assert.equal(readableFor(null, "nl"), false);
  assert.deepEqual(readableBooks(null, "nl"), []);
  assert.deepEqual(readableBooks({}, "nl"), []);
});

// The places that count or search the books, each asking readable.js (one answer, never a count of their own).
await test("Home's count, Read's search and kinds, and Find a book's count and search all ask readable.js", () => {
  const shelf = source("public/js/read/shelf.js");
  assert.match(shelf, /import \{[^}]*\breadableBooks\b[^}]*\breadableFor\b[^}]*\} from "\.\/readable\.js"/, "shelf.js imports it");
  assert.match(shelf, /const forLearning = \(meta\) => readableFor\(meta, learning\(\)\);/, "the shelves' kinds and sections ask it");
  assert.match(shelf, /export function startingBooks\(catalog\) \{\s*const readable = readableBooks\(catalog, learning\(\)\);/, "the books to start with are the ones it says you can read");
  assert.match(shelf, /const books = startingBooks\(catalog\);\s*return \{[^\n]*count: books\.length \};/, "Home's count (shelfStart) is their count");
  assert.match(shelf, /const readable = readableBooks\(shelf, learning\(\)\);[\s\S]{0,300}const offered = readable\.length \? readable : \(shelf\.books \?\? \[\]\);[\s\S]{0,200}Search \$\{offered\.length/, "Read's search says its count (with none for you, every book's: Find a book offers them)");
  assert.match(source("public/js/know/today.js"), /shelf = shelfStart\(catalog\)/, "Home's book card counts through shelfStart");
  const find = source("public/js/read/find.js");
  assert.match(find, /const readable = readableBooks\(catalog, learning\(\)\);/, "Find a book asks it");
  assert.match(find, /const offered = others \? all : readable;[\s\S]{0,400}Search \$\{offered\.length/, "Find a book's search says its count");
  assert.match(find, /const pool = kind === "other" \|\| others \? all : readable;/, "Find a book finds among them (the other languages' when asked for, or when none is for you)");
  assert.match(find, /const found = pool\s*\.filter/, "and finds in that pool");
});

await test("no other place works out for itself which books a learner can read", () => {
  const inline = /kind === "weave" && [a-z]+ === learning\(\)|kind === "help" && meta\.lang === learning\(\)/;
  for (const path of ["public/js/read/shelf.js", "public/js/read/find.js", "public/js/read/library.js", "public/js/know/today.js"]) assert.doesNotMatch(source(path), inline, path);
});

if (failures.length) {
  console.error(`readable: ${passed} passed, ${failures.length} failed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`readable: ${passed}/${passed} passed`);
