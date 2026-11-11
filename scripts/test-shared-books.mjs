#!/usr/bin/env node
// Books in Explore (src/community-books.ts, migration 0028) on the real migrations with D1 as SQLite and the library's bucket in memory
// (scripts/fixtures/worker-env.mjs), with the open library's real books and layers (library/books/):
//   - every refusal, each writing nothing: rights (an NC license, none), no source, pictures, a layer that fails its check or is another
//     book's, too big (a book, a layer), the same text in Explore or on the shelf, shared twice, the terms, a ban, sharing not open, the
//     day's limit;
//   - shared: live from a known open source, its files as read/shelf.js fetchOpenBook reads them (the book and its layers checked as a
//     device checks them, carrying the public id), a suffix where the shelf has its id; pending from anywhere else (unseen, unserved, an
//     admin's: opened or declined);
//   - versions: a layer added, dropped and added again (its bytes counted once), nothing changed, a new text (its layers off), the language
//     and the source kept;
//   - adding one to a reading library (a follow) and likes, counted;
//   - moderation: a copyright notice hiding it at once and its files stopping, the case with each layer's lines, a counter-notice,
//     upheld (a strike) and an admin's restore, a moderator's hide and restore, three established accounts' reports, a pending book and
//     your own unreportable, the queue;
//   - withdrawn (files stop, shared again as a new book), and an account going (its books stay, from a former member; its follows and
//     likes go, the counts put right).
// `node scripts/test-shared-books.mjs` (exit 0 = pass).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite, row, rows } = workerEnv();
env.COMMUNITY_SHARING = "everyone";
env.PUBLIC_ORIGIN = "https://lexicommons.test";
const books = await import(join(APP, "src/community-books.ts"));
const mod = await import(join(APP, "src/moderation.ts"));
const { bookFromText } = await import(join(APP, "public/js/read/import-text.js"));
const { bookVersion, validateBook, validateWeave } = await import(join(APP, "public/js/read/book-format.js"));

// ---------- accounts ----------
const now = Date.now();
const WEEK = 8 * 86_400_000;
function account(id, { admin = false, moderator = false, terms = true, since = now - WEEK } = {}) {
  sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, `Person ${id}`, since);
  if (terms) sqlite.prepare("INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (?, 1, ?)").run(id, now);
  if (admin) sqlite.prepare("INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (?, 'admin', ?, 'd1', 'test')").run(id, now);
  if (moderator) sqlite.prepare("INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (?, 'moderator', ?, 'd1', 'test')").run(id, now);
  return id;
}
const ann = account("ann");
const bo = account("bo");
const [cy, dee, eve, fay] = ["cy", "dee", "eve", "fay"].map((id) => account(id));
const admin = account("admin-1", { admin: true });
const moderator = account("mod-1", { moderator: true });
const actor = (userId) => ({ userId, via: "device" });
const asMod = (userId) => ({ userId, via: "mcp" });

// ---------- books ----------
const LIB = join(APP, "library/books");
const read = (path) => JSON.parse(readFileSync(join(LIB, path), "utf8"));
const ALICE = read("carroll-alice-wonderland-opening/d6dba2b5a24f054f/book.json"); // public domain, from Standard Ebooks (known)
const ALICE_NL = read("carroll-alice-wonderland-opening/d6dba2b5a24f054f/weave.nl.eadf6e578bf6.json");
const RAIN_PICTURES = read("storyweaver-137265-de-rode-regenjas/345514991ccfc29a/book.json"); // CC BY 4.0, from StoryWeaver, with pictures
const RAIN_EN = read("storyweaver-137265-de-rode-regenjas/345514991ccfc29a/help.en.99e6ebb76f75.json");
// The same story as text alone: its pictures, pages and cover off (its version is its content's), and its help layer said to be for it.
const RAIN = structuredClone(RAIN_PICTURES);
for (const key of ["pictures", "pages", "cover", "breaks"]) delete RAIN[key];
RAIN.version = await bookVersion(RAIN);
const RAIN_HELP = { ...structuredClone(RAIN_EN), bookVersion: RAIN.version };
assert.deepEqual(await validateBook(RAIN), [], "the story without its pictures should be a valid book");
assert.deepEqual(await validateWeave(RAIN_HELP, RAIN), [], "its help layer should still fit it");
const PD = { us: true, eu: true, basis: "made for the test" };
let made = 0;
/** A new book made from plain text: public domain from Project Gutenberg unless said otherwise. */
async function textBook({ lang = "en", rights = PD, source = { kind: "gutenberg", url: `https://www.gutenberg.org/ebooks/${90000 + made}` }, words = 0 } = {}) {
  made++;
  const extra = words ? ` ${Array.from({ length: words }, (_, i) => `word${i}`).join(" ")}.` : "";
  const text = lang === "nl" ? `Het boek nummer ${made}. De kat slaapt op de mat.${extra}\n\nDe hond blaft. Het is laat.` : `Book number ${made}. The cat sleeps on the mat.${extra}\n\nThe dog barks. It is late.`;
  const book = await bookFromText(text, { title: `Book ${made}`, lang });
  book.id = `test-book-${made}`;
  book.rights = rights;
  book.source = source;
  return book;
}

// ---------- helpers ----------
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error?.stack ?? error).split("\n").slice(0, 6).join("\n        ")}`);
  }
}
const sharedKeys = () => [...env.LIBRARY.objects.keys()].filter((k) => k.startsWith("shared/"));
const countBooks = () => row("SELECT COUNT(*) AS n FROM shared_books").n;
/** A share that must be refused, writing nothing (no row, no file). */
async function refused(by, input, at, pattern) {
  const [rowsBefore, keysBefore] = [countBooks(), sharedKeys().length];
  const result = await books.shareBook(env, actor(by), input);
  assert.equal(result.shared, false, `it was shared: ${JSON.stringify(result).slice(0, 200)}`);
  const found = result.errors.find((e) => e.at === at);
  assert.ok(found, `no problem at ${at}: ${JSON.stringify(result.errors).slice(0, 400)}`);
  if (pattern) assert.match(found.message, pattern);
  assert.equal(countBooks(), rowsBefore, "a row was written");
  assert.equal(sharedKeys().length, keysBefore, "a file was written");
  return found.message;
}
const throwsLike = async (fn, pattern) => {
  let error = null;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  assert.ok(error, "it went through");
  assert.match(String(error.message), pattern);
  return error;
};
/** What a device gets for each of a meta's files, through the route (signed in), checked as read/shelf.js fetchOpenBook checks them. */
async function fetchAsDevice(meta) {
  const get = async (url) => {
    const [, id, version, file] = /^\/api\/community\/books\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(url) ?? [];
    assert.ok(id, `not a book file's url: ${url}`);
    const answer = await books.serveBookFile(env, new Request(`https://lexicommons.test${url}`), id, version, file);
    return { status: answer.status, json: answer.status === 200 ? JSON.parse(await answer.text()) : null, cache: answer.headers.get("Cache-Control") };
  };
  const book = await get(meta.book);
  const layers = {};
  for (const [to, layer] of Object.entries(meta.layers)) layers[to] = await get(layer.url);
  return { book, layers };
}
async function arrivesIntact(meta) {
  const got = await fetchAsDevice(meta);
  assert.equal(got.book.status, 200, `the book's file answered ${got.book.status}`);
  assert.equal(got.book.cache, "private, no-cache");
  assert.deepEqual(await validateBook(got.book.json), [], "the served book fails the book check");
  assert.equal(got.book.json.id, meta.id, "the served book doesn't carry its id");
  assert.equal(got.book.json.version, meta.version);
  for (const [to, layer] of Object.entries(got.layers)) {
    assert.equal(layer.status, 200, `the ${to} layer answered ${layer.status}`);
    assert.deepEqual(await validateWeave(layer.json, got.book.json), [], `the served ${to} layer fails against the served book`);
  }
  return got;
}
const unserved = async (meta) => {
  const got = await fetchAsDevice(meta);
  assert.equal(got.book.status, 404, "its book file is still served");
  for (const layer of Object.values(got.layers)) assert.equal(layer.status, 404, "a layer is still served");
};
const listed = async (viewer, id, query = {}) => (await books.listBooks(env, viewer, query)).books.some((b) => b.id === id);
const notice = { name: "A Writer", contact: "writer@example.org", work: "My own story, published 2020", statement: true };

// ---------- refusals ----------
await test("refused, writing nothing: an NC license, no rights, no source, pictures", async () => {
  await refused(ann, { book: await textBook({ rights: { us: false, eu: false, spdx: "CC-BY-NC-4.0", attribution: [{ role: "author", name: "X" }] } }) }, "book.rights", /public domain in both the US and the EU/);
  await refused(ann, { book: await textBook({ rights: null }) }, "book.rights");
  await refused(ann, { book: await textBook({ rights: { us: false, eu: false, spdx: "CC-BY-4.0" } }) }, "book.rights"); // no credit recorded
  await refused(ann, { book: await textBook({ source: { kind: "paste" } }) }, "book.source", /source\.url/);
  await refused(ann, { book: await textBook({ source: { url: "javascript:alert(1)" } }) }, "book.source");
  await refused(ann, { book: RAIN_PICTURES, layers: [RAIN_EN] }, "book.pictures", /pictures/);
  await refused(ann, { book: { format: "lexicommons-book" } }, "book");
});

await test("refused, writing nothing: a layer that fails its check, one for another book, a layer or a book too big", async () => {
  const broken = structuredClone(ALICE_NL);
  broken.sentences[3].t[0][0] = "";
  await refused(ann, { book: ALICE, layers: [broken] }, "layers[0]", /Sentence 3/);
  await refused(ann, { book: ALICE, layers: [RAIN_HELP] }, "layers[0]", /This weave is for/);
  await refused(ann, { book: ALICE, layers: [ALICE_NL, ALICE_NL] }, "layers[1]", /Two layers into nl/);
  // A translation beside a book (a parallel layer) is the open library's alone, whatever else is right about it.
  await refused(ann, { book: ALICE, layers: [{ ...ALICE_NL, kind: "parallel" }] }, "layers[0]", /comes only with the open library's own books/);
  const limit = books.BOOK_LIMITS.layerBytes;
  books.BOOK_LIMITS.layerBytes = 10_000;
  try {
    await refused(ann, { book: ALICE, layers: [ALICE_NL] }, "layers[0]", /at most/);
  } finally {
    books.BOOK_LIMITS.layerBytes = limit;
  }
  const big = await textBook({ words: 200_000 });
  assert.ok(new TextEncoder().encode(JSON.stringify(big)).byteLength > books.BOOK_LIMITS.bookBytes, "the big book isn't big enough to test");
  await refused(ann, { book: big }, "book", /at most 2 MB/);
});

await test("refused: the terms not accepted, a ban, sharing not open, the day's limit (5 books)", async () => {
  const noTerms = account("no-terms", { terms: false });
  await throwsLike(() => books.shareBook(env, actor(noTerms), { book: ALICE }), /Accept the sharing terms/);
  const banned = account("banned");
  sqlite.prepare("INSERT INTO user_bans (id, user_id, scope, reason, by, created_at) VALUES ('ban-1', ?, 'share', 'Copying.', 'admin-1', ?)").run(banned, now);
  await throwsLike(() => books.shareBook(env, actor(banned), { book: ALICE }), /can't share in Explore/);
  env.COMMUNITY_SHARING = "admins";
  try {
    await throwsLike(() => books.shareBook(env, actor(bo), { book: ALICE }), /only the library's admins/);
  } finally {
    env.COMMUNITY_SHARING = "everyone";
  }
  const busy = account("busy");
  for (let n = 0; n < 5; n++) assert.equal((await books.shareBook(env, actor(busy), { book: await textBook() })).shared, true, `share ${n + 1} of 5 was refused`);
  const before = sharedKeys().length;
  await throwsLike(async () => books.shareBook(env, actor(busy), { book: await textBook() }), /5 books shared in a day/);
  assert.equal(sharedKeys().length, before, "the refused share wrote a file");
});

// ---------- shared ----------
let alice; // ann's, live with its Dutch weave
await test("shared from a known open source: live, its files as a device reads them, carrying its id", async () => {
  const result = await books.shareBook(env, actor(ann), { book: ALICE, layers: [ALICE_NL], about: "The first pages, woven into Dutch.", level: "A2", note: "first" });
  assert.equal(result.shared, true, JSON.stringify(result).slice(0, 400));
  assert.equal(result.state, "live");
  assert.equal(result.id, ALICE.id);
  assert.deepEqual(result.layers, ["nl"]);
  alice = result.id;
  assert.ok(await listed(bo, alice, { learning: "nl" }), "not found by someone learning Dutch");
  assert.ok(await listed(bo, alice, { q: "carroll wonderland" }), "not found by its author and title");
  assert.ok(!(await listed(bo, alice, { learning: "fr" })), "found for French");
  const page = await books.getBook(env, alice, bo);
  assert.equal(page.book.kind, "book");
  assert.equal(page.book.by, "Person ann");
  assert.equal(page.book.source.name, "Standard Ebooks");
  assert.equal(page.book.rights.publicDomain, true);
  assert.equal(page.book.licence, "CC BY-SA 4.0");
  assert.ok(page.sample.length > 0 && page.sample[0].layers.nl !== undefined, "the sample has no Dutch lines");
  assert.equal(page.meta.layers.nl.licence, "CC BY-SA 4.0");
  assert.equal(page.meta.layers.nl.credit, "Person ann");
  await arrivesIntact(page.meta);
  const version = row("SELECT bytes FROM shared_book_versions WHERE book_id = ? AND seq = 1", alice);
  assert.equal(version.bytes, sharedKeys().filter((k) => k.startsWith(`shared/books/${alice}/`)).reduce((sum, k) => sum + env.LIBRARY.objects.get(k).bytes.byteLength, 0), "its bytes aren't its files'");
});

await test("refused: the same text in Explore, shared twice by its sharer, on the shelf", async () => {
  await refused(bo, { book: ALICE }, "book", /already in Explore/);
  await refused(ann, { book: ALICE }, "book", /You've shared this book already/);
  await env.LIBRARY.put("catalogue.json", JSON.stringify({ format: "lexicommons-catalogue", v: 1, books: [{ id: "elsewhere", version: RAIN.version, title: "De rode regenjas" }], lists: {} }));
  try {
    await refused(bo, { book: RAIN, layers: [RAIN_HELP] }, "book", /on Lexicommons' shelf already/);
  } finally {
    await env.LIBRARY.delete("catalogue.json");
  }
});

let rain; // bo's, under a suffixed id
await test("an id the shelf has: shared under a suffix, its files (the help layer too) carrying it", async () => {
  await env.LIBRARY.put("catalogue.json", JSON.stringify({ format: "lexicommons-catalogue", v: 1, books: [{ id: RAIN.id, version: "0000000000000000", title: "Another" }], lists: {} }));
  try {
    const result = await books.shareBook(env, actor(bo), { book: RAIN, layers: [RAIN_HELP], topics: [] });
    assert.equal(result.shared, true, JSON.stringify(result).slice(0, 400));
    assert.notEqual(result.id, RAIN.id);
    assert.ok(result.id.startsWith(`${RAIN.id}-`));
    assert.match(result.notes.join(" "), /was taken/);
    rain = result.id;
    const got = await arrivesIntact((await books.getBook(env, rain, ann)).meta);
    assert.equal(got.layers.en.json.book, rain);
  } finally {
    await env.LIBRARY.delete("catalogue.json");
  }
});

await test("from a source that isn't a known open one: pending, unseen and unserved until an admin opens it; declined", async () => {
  const book = await textBook({ source: { kind: "web", url: "https://example.org/my-story" } });
  const result = await books.shareBook(env, actor(cy), { book });
  assert.equal(result.state, "pending");
  assert.match(result.notes.join(" "), /waiting for an admin/);
  assert.ok(!(await listed(bo, result.id)), "listed while pending");
  assert.equal(await books.getBook(env, result.id, bo), null, "someone else sees it");
  const own = await books.getBook(env, result.id, cy);
  assert.equal(own.book.state, "pending");
  assert.equal(own.meta, undefined, "its files are offered while pending");
  const files = { id: result.id, book: `/api/community/books/${result.id}/${book.version}/book.json`, layers: {} };
  await unserved(files);
  await throwsLike(() => mod.report(env, bo, result.id, { reason: "spam" }, { via: "mcp", work: "book" }), /There's no book/);
  assert.equal((await mod.queue(env, { userId: moderator })).sharedBooks, undefined, "a moderator is shown it");
  assert.ok((await mod.queue(env, { userId: admin })).sharedBooks.some((b) => b.book === result.id), "not in the admin's queue");
  assert.equal((await mod.pending(env)).sharedBooks >= 1, true);
  await throwsLike(() => books.decideSharedBook(env, asMod(moderator), result.id, { decision: "open", why: "fine" }), /an admin's/);
  assert.equal((await books.decideSharedBook(env, asMod(admin), result.id, { decision: "open", why: "Checked: the author's own site, CC0." })).state, "live");
  assert.ok(await listed(bo, result.id), "not listed once opened");
  await arrivesIntact((await books.getBook(env, result.id, bo)).meta);
  const other = await books.shareBook(env, actor(cy), { book: await textBook({ source: { url: "https://example.org/other" } }) });
  await books.decideSharedBook(env, asMod(admin), other.id, { decision: "decline", why: "No license at the source." });
  const declined = await books.getBook(env, other.id, cy);
  assert.equal(declined.book.state, "declined");
  assert.match(declined.book.stateReason, /No license at the source/);
});

// ---------- versions ----------
await test("versions: a layer added, dropped and added again (its bytes once), nothing changed refused", async () => {
  // Alice's copy, shared by ann with its Dutch weave: the only layers that fit a text are the shelf's own, so the tests use them.
  const id = alice;
  const before = row("SELECT head_seq FROM shared_books WHERE id = ?", id).head_seq;
  const dropped = await books.updateSharedBook(env, actor(ann), id, { dropLayers: ["nl"] });
  assert.equal(dropped.updated, true, JSON.stringify(dropped).slice(0, 300));
  assert.deepEqual(dropped.layers, []);
  assert.deepEqual(dropped.changes.layersDropped, ["nl"]);
  assert.equal(row("SELECT bytes FROM shared_book_versions WHERE book_id = ? AND seq = ?", id, before + 1).bytes, 0, "dropping a layer counted bytes");
  const again = await books.updateSharedBook(env, actor(ann), id, { layers: [ALICE_NL] });
  assert.equal(again.updated, true, JSON.stringify(again).slice(0, 300));
  assert.deepEqual(again.changes.layersAdded, ["nl"]);
  assert.equal(row("SELECT bytes FROM shared_book_versions WHERE book_id = ? AND seq = ?", id, before + 2).bytes, 0, "a layer a version before stored counted again");
  const same = await books.updateSharedBook(env, actor(ann), id, { layers: [ALICE_NL] });
  assert.equal(same.updated, false);
  assert.match(same.errors[0].message, /nothing changed/);
  const missing = await books.updateSharedBook(env, actor(ann), id, { dropLayers: ["fr"] });
  assert.equal(missing.updated, false);
  assert.match(missing.errors[0].message, /no fr layer/);
  await throwsLike(() => books.updateSharedBook(env, actor(bo), id, { about: "mine now" }), /isn't yours/);
  const meta = await books.updateSharedBook(env, actor(ann), id, { about: "The opening, woven into Dutch.", topics: [] });
  assert.equal(meta.newVersion, false);
  assert.equal(row("SELECT about FROM shared_books WHERE id = ?", id).about, "The opening, woven into Dutch.");
});

await test("versions: a new text (its layers off, said so; followers get it), its language and its source kept", async () => {
  const theirs = await books.shareBook(env, actor(eve), { book: await textBook() });
  await books.followBook(env, fay, theirs.id);
  const next = await textBook();
  const updated = await books.updateSharedBook(env, actor(eve), theirs.id, { book: next });
  assert.equal(updated.updated, true, JSON.stringify(updated).slice(0, 300));
  assert.equal(updated.version, next.version);
  const following = await books.followedBooks(env, fay);
  const meta = following.books.find((b) => b.id === theirs.id);
  assert.equal(meta.version, next.version, "the follower doesn't get the new version");
  await arrivesIntact(meta);
  const dutch = await books.updateSharedBook(env, actor(eve), theirs.id, { book: await textBook({ lang: "nl" }) });
  assert.equal(dutch.updated, false);
  assert.match(dutch.errors[0].message, /keeps the book's language/);
  const moved = await books.updateSharedBook(env, actor(eve), theirs.id, { book: await textBook({ source: { url: "https://example.org/elsewhere" } }) });
  assert.equal(moved.updated, false);
  assert.match(moved.errors[0].message, /keeps where its text came from/);
  // Alice with a new text drops its Dutch layer, and says so.
  const aliceNext = await textBook({ source: { url: "https://github.com/standardebooks/lewis-carroll_alices-adventures-in-wonderland" } });
  const newText = await books.updateSharedBook(env, actor(ann), alice, { book: aliceNext });
  assert.equal(newText.updated, true, JSON.stringify(newText).slice(0, 300));
  assert.deepEqual(newText.layers, []);
  assert.match(newText.notes.join(" "), /nl layer belongs to the text before/);
  // And back to the text with its weave.
  const back = await books.updateSharedBook(env, actor(ann), alice, { book: ALICE, layers: [ALICE_NL] });
  assert.equal(back.updated, true, JSON.stringify(back).slice(0, 300));
  assert.deepEqual(back.layers, ["nl"]);
  await arrivesIntact((await books.getBook(env, alice, bo)).meta);
});

// ---------- follows and likes ----------
await test("added to a reading library and liked, counted; unfollowed; a pending book can't be added", async () => {
  const meta = await books.followBook(env, bo, alice);
  assert.equal(meta.id, alice);
  assert.ok(meta.layers.nl);
  assert.equal(row("SELECT follows FROM shared_books WHERE id = ?", alice).follows, 1);
  assert.equal((await books.likeBook(env, cy, alice, true)).likes, 1);
  assert.equal((await books.getBook(env, alice, cy)).book.liked, true);
  assert.equal((await books.followedBooks(env, bo)).books.some((b) => b.id === alice), true);
  await books.unfollowBook(env, bo, alice);
  assert.equal(row("SELECT follows FROM shared_books WHERE id = ?", alice).follows, 0);
  await books.followBook(env, bo, alice);
  const pending = await books.shareBook(env, actor(fay), { book: await textBook({ source: { url: "https://example.net/a" } }) });
  await throwsLike(() => books.followBook(env, bo, pending.id), /no book/);
});

// ---------- moderation ----------
await test("a copyright notice hides it at once and its files stop; the case shows each layer's lines; a counter-notice; upheld is a strike", async () => {
  const meta = (await books.getBook(env, rain, cy)).meta;
  await books.followBook(env, cy, rain);
  await throwsLike(() => mod.report(env, bo, rain, { reason: "spam" }, { via: "mcp", work: "book" }), /withdraw_shared_book/);
  await throwsLike(() => mod.report(env, cy, rain, { reason: "copyright", notice }, { via: "mcp", work: "book" }), /filed in the app/);
  const filed = await mod.report(env, cy, rain, { reason: "copyright", notice }, { via: "app", work: "book" });
  assert.equal(filed.hidden, true);
  assert.equal(row("SELECT target_kind FROM reports WHERE id = ?", filed.id).target_kind, "book");
  await unserved(meta);
  assert.ok(!(await listed(ann, rain)), "listed while hidden");
  assert.equal(await books.getBook(env, rain, ann), null, "someone else sees it hidden");
  assert.deepEqual((await books.followedBooks(env, cy)).down.find((b) => b.id === rain)?.state, "hidden");
  const own = await books.getBook(env, rain, bo);
  assert.equal(own.book.work, notice.work, "its owner isn't told the work named");
  const cases = await mod.ownerCases(env, bo);
  assert.ok(cases.some((c) => c.kind === "book" && c.id === rain && c.work === notice.work));
  const counter = await mod.counterNotice(env, bo, rain, { statement: "This translation is my own, and StoryWeaver publishes it under CC BY.", name: "Bo", email: "bo@example.org" }, "book");
  assert.equal(counter.filed, true);
  assert.equal(row("SELECT target_kind FROM counter_notices WHERE id = ?", counter.id).target_kind, "book");
  const q = await mod.queue(env, { userId: admin });
  assert.ok(q.cases.some((c) => c.book === rain && c.kind === "reports"), "the report isn't a book case in the queue");
  assert.ok(q.cases.some((c) => c.book === rain && c.kind === "counter-notice"), "the counter-notice isn't a book case in the queue");
  const theCase = await mod.caseOf(env, { userId: moderator }, rain, "book");
  assert.equal(theCase.book.state, "hidden");
  assert.equal(theCase.book.source, "https://storyweaver.org.in/en/stories/137265-de-rode-regenjas");
  assert.equal(theCase.book.sentenceCount, RAIN.sentences.length);
  assert.equal(theCase.book.sentences[0].layers.en, RAIN_HELP.sentences[0].text, "the case doesn't show the layer's line");
  assert.equal(theCase.counterNotices.length, 1);
  assert.equal(theCase.reports[0].notice.filed, "complete", "a moderator sees the notice's contact");
  await throwsLike(() => mod.modResolve(env, asMod(moderator), { counterNotice: counter.id, decision: "uphold", why: "x" }), /an admin's/);
  const upheld = await mod.modResolve(env, asMod(admin), { report: filed.id, decision: "uphold", why: "The notice names this book; its owner's counter-notice is for an admin." });
  assert.equal(upheld.book, rain);
  assert.equal(upheld.itemState, "removed");
  assert.equal((await mod.caseOf(env, { userId: admin }, rain, "book")).owner.copyrightStrikes, 1, "no strike for the owner");
  const answered = await mod.modResolve(env, asMod(admin), { counterNotice: counter.id, decision: "uphold", why: "The license at the source allows it." });
  assert.equal(answered.book, rain);
  assert.equal(answered.itemState, "live", "the counter-notice upheld didn't bring it back");
  assert.equal((await mod.caseOf(env, { userId: admin }, rain, "book")).owner.copyrightStrikes, 0, "the strike stayed");
  await arrivesIntact((await books.getBook(env, rain, cy)).meta);
  assert.equal(rows("SELECT action FROM admin_log WHERE target = ?", `book:${rain}`).length >= 2, true, "the admin log doesn't name the book");
});

await test("a moderator's hide and restore, and three established accounts' reports hiding it", async () => {
  const report = await mod.report(env, dee, alice, { reason: "spam", details: "an ad in a layer" }, { via: "mcp", work: "book" });
  assert.equal(report.hidden, false);
  const hidden = await mod.modHide(env, asMod(moderator), alice, "Looking at the ad.", "book");
  assert.deepEqual(hidden, { book: alice, state: "hidden" });
  assert.ok(!(await listed(bo, alice)));
  const restored = await mod.modRestore(env, asMod(moderator), alice, "No ad found.", "book");
  assert.equal(restored.state, "live");
  assert.equal(row("SELECT state FROM reports WHERE id = ?", report.id).state, "dismissed");
  for (const by of [cy, dee, eve]) await mod.report(env, by, alice, { reason: "abuse" }, { via: "mcp", work: "book" });
  assert.equal(row("SELECT state FROM shared_books WHERE id = ?", alice).state, "hidden", "three established reports didn't hide it");
  await unserved((await books.getBook(env, alice, ann)).meta ?? { id: alice, book: `/api/community/books/${alice}/${ALICE.version}/book.json`, layers: {} });
  for (const r of rows("SELECT id FROM reports WHERE target_kind = 'book' AND target_id = ? AND state = 'open'", alice)) await mod.modResolve(env, asMod(moderator), { report: r.id, decision: "dismiss", why: "Not abuse." });
  assert.equal(row("SELECT state FROM shared_books WHERE id = ?", alice).state, "live", "dismissing them didn't bring it back");
});

// ---------- withdrawn ----------
await test("withdrawn: its files stop, it leaves Explore, its followers are told; shared again as a new book", async () => {
  const theirs = await books.shareBook(env, actor(fay), { book: await textBook() });
  await books.followBook(env, bo, theirs.id);
  const meta = (await books.getBook(env, theirs.id, bo)).meta;
  await throwsLike(() => books.withdrawSharedBook(env, { userId: bo }, theirs.id), /isn't yours/);
  assert.equal((await books.withdrawSharedBook(env, { userId: fay }, theirs.id)).state, "withdrawn");
  await unserved(meta);
  assert.ok(!(await listed(bo, theirs.id)));
  assert.equal((await books.followedBooks(env, bo)).down.find((b) => b.id === theirs.id)?.state, "withdrawn");
  const book = JSON.parse(env.LIBRARY.objects.has(`shared/books/${theirs.id}/${meta.version}/book.json`) ? new TextDecoder().decode(env.LIBRARY.objects.get(`shared/books/${theirs.id}/${meta.version}/book.json`).bytes) : "null");
  const again = await books.shareBook(env, actor(fay), { book: { ...book, id: book.id } });
  assert.equal(again.shared, true, JSON.stringify(again).slice(0, 300));
  assert.notEqual(again.id, theirs.id);
});

// ---------- an account going ----------
await test("an account going: its books stay, from a former member, out of their search; its follows and likes go, the counts put right", async () => {
  const leaving = account("leaving");
  const theirs = await books.shareBook(env, actor(leaving), { book: await textBook() });
  await books.followBook(env, leaving, alice);
  await books.likeBook(env, leaving, alice, true);
  const [follows, likes] = [row("SELECT follows FROM shared_books WHERE id = ?", alice).follows, row("SELECT likes FROM shared_books WHERE id = ?", alice).likes];
  const touched = await books.booksTouchedBy(env, leaving);
  assert.ok(touched.includes(alice));
  // As accounts.ts deleteAccount does: these statements in its batch (with the likes going by community.ts's), then the recount.
  await env.DB.batch([...(await books.forgetBookStatements(env, leaving)), env.DB.prepare("DELETE FROM likes WHERE user_id = ?").bind(leaving), env.DB.prepare("DELETE FROM users WHERE id = ?").bind(leaving)]);
  await env.DB.batch(books.recountBookStatements(env, touched));
  assert.equal(row("SELECT follows FROM shared_books WHERE id = ?", alice).follows, follows - 1);
  assert.equal(row("SELECT likes FROM shared_books WHERE id = ?", alice).likes, likes - 1);
  const page = await books.getBook(env, theirs.id, bo);
  assert.equal(page.book.by, "a former member");
  assert.ok(!row("SELECT search FROM shared_books WHERE id = ?", theirs.id).search.includes("leaving"), "its name is still in the search text");
  await arrivesIntact(page.meta);
});

await test("the export holds an account's books, their versions and what it added", async () => {
  const out = await mod.exportCommunity(env, ann);
  assert.ok(out.sharedBooks.some((b) => b.id === alice));
  assert.ok(out.bookVersions.filter((v) => v.book_id === alice).length >= 4);
  assert.ok((await mod.exportCommunity(env, bo)).bookFollows.some((f) => f.book_id === alice));
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
