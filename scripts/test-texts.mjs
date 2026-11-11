// A text's files as the server checks them before your AI's text goes to your devices (src/text-files.ts): plain
// text made into a book under the relay's id, a lexicommons-book checked (and refused with a cover, in another
// language, or broken), an EPUB told apart from other zips, a cover cleaned, nothing coerced, and how long a big text
// takes. Runs in Node: `node scripts/test-texts.mjs` (exit 0 = pass).

import { EPUB_LIMITS, TextProblem, checkCoverFile, checkTextFile, epubProblems, isEpub } from "../src/text-files.ts";
import { validateBook } from "../public/js/read/book-format.js";
import { COVER_FILE } from "../public/js/read/cover-svg.js";
import { makeEpub, zip } from "./fixtures/make-epub.mjs";

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const refused = async (fn, pattern) => {
  try {
    await fn();
  } catch (error) {
    ok(error instanceof TextProblem, `not a refusal in words: ${error.constructor.name}: ${error.message}`);
    ok(pattern.test(error.message), `refused, but with "${error.message}"`);
    return;
  }
  throw new Error(`not refused (wanted ${pattern})`);
};
const utf8 = (text) => new TextEncoder().encode(text);
const ID = "ai-0123456789abcdef";
const options = { id: ID, title: "De rode jas", language: "nl", authors: ["Check Writer"], source: "Claude" };
const STORY = "De rode jas\n\nOma heeft een rode jas. De jas hangt aan de deur.\n\nMorgen gaan wij naar de markt.";

await test("plain text becomes a book under the relay's id, yours, from your AI, and passes the check", async () => {
  const out = await checkTextFile("text", utf8(STORY), options);
  ok(out.format === "book" && out.book.id === ID && out.book.title === "De rode jas", JSON.stringify({ id: out.book.id, title: out.book.title }));
  ok(JSON.stringify(out.book.source) === '{"kind":"ai","ref":"Claude"}' && out.book.rights === null && out.book.authors[0].name === "Check Writer", "source, rights, authors");
  ok((await validateBook(JSON.parse(new TextDecoder().decode(out.bytes)))).length === 0, "the file sent to devices passes the check");
  return `${out.words} words`;
});

await test("text that isn't UTF-8, or has nothing to read, is refused in words", async () => {
  await refused(() => checkTextFile("text", new Uint8Array([0xff, 0xfe, 0x00, 0xd8, 0xc3]), options), /isn't UTF-8/);
  await refused(() => checkTextFile("text", utf8("   \n\n  "), options), /nothing to read/);
});

await test("a lexicommons-book: checked, kept under the relay's id; refused with a cover, in another language, broken or not JSON", async () => {
  const made = (await checkTextFile("text", utf8(STORY), options)).book;
  const book = { ...made, id: "text-from-elsewhere", title: "Elsewhere" };
  const out = await checkTextFile("book", utf8(JSON.stringify(book)), { ...options, title: undefined, authors: [] });
  ok(out.book.id === ID && out.book.title === "Elsewhere" && out.book.source.kind === "ai", JSON.stringify({ id: out.book.id, title: out.book.title }));
  await refused(() => checkTextFile("book", utf8(JSON.stringify({ ...book, cover: { file: "0123456789abcdef.svg" } })), options), /carries no cover/);
  await refused(() => checkTextFile("book", utf8(JSON.stringify(book)), { ...options, language: "de" }), /in nl, not de/);
  await refused(() => checkTextFile("book", utf8(JSON.stringify({ ...book, words: [] })), options), /doesn't pass the check/);
  await refused(() => checkTextFile("book", utf8("{ not json"), options), /isn't JSON/);
  await refused(() => checkTextFile("book", utf8("[1, 2]"), options), /lexicommons-book object/);
});

await test("Codex's review: a book's bytes must be UTF-8, and its title and authors are bounded however long it says they are", async () => {
  const made = (await checkTextFile("text", utf8(STORY), options)).book;
  const json = utf8(JSON.stringify({ ...made, title: "Titel" }));
  const at = json.indexOf(utf8("Titel")[0]);
  const broken = new Uint8Array(json);
  broken[at] = 0xff;
  await refused(() => checkTextFile("book", broken, { ...options, title: undefined }), /isn't UTF-8/);
  const long = await checkTextFile("book", utf8(JSON.stringify({ ...made, title: "x".repeat(1_000_000), authors: [{ name: "y".repeat(5000), role: "author" }, { name: 3 }] })), { ...options, title: undefined, authors: [] });
  ok(long.book.title.length === 200 && long.book.authors.length === 1 && long.book.authors[0].name.length === 80, JSON.stringify({ title: long.book.title.length, authors: long.book.authors.map((a) => a.name.length) }));
});

await test("Codex's review: an EPUB that says it holds more than any book needs is refused before any device inflates it", async () => {
  const fine = makeEpub({ title: "Klein", chapters: [{ title: "Een", paragraphs: ["Oma heeft een jas."] }] });
  ok(epubProblems(fine).length === 0, JSON.stringify(epubProblems(fine)));
  // The same zip with one entry's size in its central directory set past the limit.
  const big = new Uint8Array(fine);
  const view = new DataView(big.buffer);
  const end = big.length - 22;
  const directory = view.getUint32(end + 16, true);
  view.setUint32(directory + 24, EPUB_LIMITS.entry + 1, true);
  ok(/once unpacked/.test(epubProblems(big)[0] ?? ""), JSON.stringify(epubProblems(big)));
  await refused(() => checkTextFile("epub", big, options), /can't be used: one of its files is/);
  const many = zip(Object.fromEntries([["mimetype", "application/epub+zip"], ...Array.from({ length: EPUB_LIMITS.entries + 1 }, (_, i) => [`f${i}.txt`, "x"])]));
  await refused(() => checkTextFile("epub", many, options), /holds 3002 files; an EPUB here may hold 3000/);
});

await test("a book's sentences and version are worked out from its words and paragraphs: one sent without them, or with wrong ones, is the book the text makes", async () => {
  const made = (await checkTextFile("text", utf8(STORY), options)).book;
  const { sentences, version, ...bare } = made;
  for (const sent of [bare, { ...made, sentences: [[0, 1]], version: "0000000000000000" }]) {
    const book = (await checkTextFile("book", utf8(JSON.stringify(sent)), options)).book;
    ok(JSON.stringify(book.sentences) === JSON.stringify(sentences) && book.version === version, JSON.stringify([book.sentences?.length, book.version]));
  }
  // What can't be worked out is still the check's: words that aren't one token each.
  await refused(() => checkTextFile("book", utf8(JSON.stringify({ ...bare, words: ["two words", ...bare.words.slice(1)] })), options), /doesn't pass the check/);
});

await test("a field of the wrong type is refused, never coerced (an object whose toString is null)", async () => {
  const book = (await checkTextFile("text", utf8(STORY), options)).book;
  const trap = '{"toString": null}';
  for (const [field, value] of [["lang", trap], ["words", `[${trap}]`], ["format", trap], ["authors", trap], ["chapters", `[${trap}]`]]) {
    const raw = JSON.stringify({ ...book, [field]: "§§" }).replace('"§§"', value);
    await refused(() => checkTextFile("book", utf8(raw), options), /doesn't pass the check|in .* not|lexicommons-book/);
  }
  // The id is the relay's and the title add_text's (when it gives one): a book's own is replaced, never read.
  for (const field of ["id", "title"]) {
    const raw = JSON.stringify({ ...book, [field]: "§§" }).replace('"§§"', trap);
    const made = (await checkTextFile("book", utf8(raw), options)).book;
    ok(made.id === options.id && made.title === options.title, `${field}: ${JSON.stringify([made.id, made.title])}`);
  }
  // Without add_text's title, the book's own is read, and a trap there refused.
  const { title: _, ...untitled } = options;
  await refused(() => checkTextFile("book", utf8(JSON.stringify({ ...book, title: "§§" }).replace('"§§"', trap)), untitled), /doesn't pass the check/);
});

await test("an EPUB is told apart: its first entry a stored mimetype saying application/epub+zip", async () => {
  const epub = makeEpub({ title: "De rode jas", chapters: [{ title: "Een", paragraphs: ["Oma heeft een rode jas."] }] });
  ok(isEpub(epub), "a real EPUB");
  ok(!isEpub(zip({ "META-INF/container.xml": "<x/>", mimetype: "application/epub+zip" })), "mimetype not first");
  ok(!isEpub(zip({ mimetype: "application/epub+zip" }, { method: 8 })), "mimetype not stored");
  ok(!isEpub(zip({ mimetype: "application/zip" })), "another mimetype");
  ok(!isEpub(utf8("PK\u0003\u0004 but not a zip at all, just text dressed as one")) && !isEpub(new Uint8Array(10)), "not a zip");
  const out = await checkTextFile("epub", epub, options);
  ok(out.format === "epub" && out.bytes === epub, "kept as it came, for each device to read");
  await refused(() => checkTextFile("epub", utf8("not an epub"), options), /isn't an EPUB/);
});

await test("a cover is cleaned and named by its content; one that can't be a cover is refused in words", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect width="200" height="300" fill="#7a1f1f"/><text x="100" y="150" text-anchor="middle" fill="white">De rode jas</text><script>alert(1)</script></svg>';
  const out = await checkCoverFile(utf8(svg));
  ok(COVER_FILE.test(out.file) && !out.svg.includes("script") && out.dropped.length === 1, JSON.stringify(out.dropped));
  await refused(() => checkCoverFile(utf8('<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>')), /can't be used/);
  await refused(() => checkCoverFile(new Uint8Array([0xff, 0xfe, 0xfd])), /isn't UTF-8/);
});

await test("a big plain text is made into a book in reasonable time (the Worker has 30 s of CPU)", async () => {
  const paragraph = "Oma heeft een rode jas en de jas hangt aan de deur van het huis. Morgen gaan wij samen naar de markt in de stad.\n\n";
  const big = utf8(paragraph.repeat(Math.floor(2_000_000 / paragraph.length)));
  const started = performance.now();
  const out = await checkTextFile("text", big, options);
  const seconds = (performance.now() - started) / 1000;
  ok(seconds < 10, `took ${seconds.toFixed(1)} s`);
  return `${(big.length / 1e6).toFixed(1)} MB, ${out.words} words in ${seconds.toFixed(1)} s`;
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
