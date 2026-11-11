#!/usr/bin/env node
// COMMUNITY_SHARING, the one switch for everything a learner puts in front of other people in Explore (community.ts sharingOpenFor), on the
// real migrations with D1 as SQLite and the buckets in memory (scripts/fixtures/worker-env.mjs). Every call the app's routes and MCP's tools
// make that publishes, the same call three ways:
//   - at "admins", a learner's is refused in words (SharingRefused: a 403 in app.ts) with nothing written, D1 or the buckets;
//   - at "admins", an admin's goes through;
//   - at "everyone", that very call of the learner's goes through, as before (a "me too" still asks for no terms).
// Those calls: sharing a pack, a pack's update, sharing a book, a book's update, posting a request, answering one, opening yours again, "me
// too", suggesting a fix, flagging, suggesting to a grammar. What stays open to a learner at "admins", each done: likes on a pack and a book,
// adding a pack and a book, reporting, taking a "me too" back, withdrawing a correction, closing a request, withdrawing a pack and a book,
// accepting the terms. Then /api/me's mayShare (sharingOpenFor) and MCP's tool list (the four registrations on a stand-in server): the tools
// that publish are missing for a learner at "admins", there for an admin and for a learner at "everyone"; the reading ones always there.
// `node scripts/test-sharing-switch.mjs` (exit 0 = pass).

import assert from "node:assert/strict";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite, row } = workerEnv();
env.COMMUNITY_SHARING = "everyone";
env.PUBLIC_ORIGIN = "https://lexicommons.test";
const community = await import(join(APP, "src/community.ts"));
const books = await import(join(APP, "src/community-books.ts"));
const board = await import(join(APP, "src/board.ts"));
const corrections = await import(join(APP, "src/corrections.ts"));
const grammar = await import(join(APP, "src/grammar-suggestions.ts"));
const mod = await import(join(APP, "src/moderation.ts"));
const { bookFromText } = await import(join(APP, "public/js/read/import-text.js"));
const MCP = {
  community: (await import(join(APP, "src/mcp-community.ts"))).registerCommunityTools,
  corrections: (await import(join(APP, "src/mcp-corrections.ts"))).registerCorrectionTools,
  board: (await import(join(APP, "src/mcp-board.ts"))).registerBoardTools,
  grammar: (await import(join(APP, "src/mcp-grammar.ts"))).registerGrammarTools,
};

let failed = 0;
async function test(name, fn) {
  try {
    const detail = await fn();
    console.log(`  ok    ${name}${detail ? ` (${detail})` : ""}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 6).join("\n        ")}`);
  }
}

// ---------- accounts: learners, an admin ----------
const now = Date.now();
function account(id, { admin = false, moderator = false, terms = true } = {}) {
  sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, `Person ${id}`, now - 30 * 86_400_000);
  if (terms) sqlite.prepare("INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (?, 1, ?)").run(id, now);
  if (admin) sqlite.prepare("INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (?, 'admin', ?, 'd1', 'test')").run(id, now);
  if (moderator) sqlite.prepare("INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (?, 'moderator', ?, 'd1', 'test')").run(id, now);
  return id;
}
const lena = account("lena"); // a learner who has accepted the terms
const lu = account("lu", { terms: false }); // a learner who never has
const noa = account("noa", { terms: false });
const ada = account("ada", { admin: true });
const mo = account("mo", { moderator: true });
const as = (userId) => ({ userId, via: "device", adminAccess: false });

// ---------- what they share ----------
const sentence = (id, text, lemmas, means) => {
  const words = text.replace(/[.?!]$/, "").split(" ").map((word) => [word, lemmas[word] ?? word.toLowerCase()]);
  return { id, concepts: ["v2"], text, means, words, punct: ".", literal: text.split(" ").map((w) => [w]), english: null, moved: [], wrong: [`${text} nee`], gap: { index: words.length - 1, options: [words.at(-1)[0], "iets"] } };
};
/** A Dutch pack of its own: its id in its meanings, so no two are the same content. */
const pack = (id) => ({
  format: "lexicommons-pack", version: 2, id, name: `Café ${id}`, about: `A café pack (${id}).`, language: "nl", from: "en", topics: {}, chunks: {}, patterns: {},
  words: { ik: "I", drinken: "to drink", thee: "tea", koffie: "coffee" },
  items: [sentence("thee", "Ik drink thee.", { Ik: "ik", drink: "drinken", thee: "thee" }, `I drink tea (${id}).`), sentence("koffie", "Ik drink koffie.", { Ik: "ik", drink: "drinken", koffie: "koffie" }, `I drink coffee (${id}).`)],
});
let made = 0;
/** A public-domain text from Project Gutenberg (a known source: it goes live at once). */
async function textBook() {
  made++;
  const book = await bookFromText(`Book number ${made}. The cat sleeps on the mat.\n\nThe dog barks. It is late.`, { title: `Book ${made}`, lang: "en" });
  book.id = `switch-book-${made}`;
  book.rights = { us: true, eu: true, basis: "made for the test" };
  book.source = { kind: "gutenberg", url: `https://www.gutenberg.org/ebooks/${91000 + made}` };
  return book;
}
const sharePack = async (who, id) => {
  const shared = await community.sharePack(env, as(who), { pack: pack(id), title: `Café ${id}`, topics: [] });
  assert.equal(shared.shared, true, JSON.stringify(shared).slice(0, 300));
  return shared.id;
};
const shareBook = async (who) => {
  const shared = await books.shareBook(env, as(who), { book: await textBook() });
  assert.equal(shared.shared, true, JSON.stringify(shared).slice(0, 300));
  return shared.id;
};
const post = async (who, title) => {
  const posted = await board.postRequest(env, as(who), { kind: "pack", language: "nl", title });
  return posted.id ?? posted.request;
};
const ZELF = "Put zelf after a word to stress it: ik doe het zelf (I do it self).";

// Everything shared while it was open to everyone (live now, before the switch).
const adaPack = await sharePack(ada, "ada-cafe");
const lenaPack = await sharePack(lena, "lena-cafe");
const lenaPackToWithdraw = await sharePack(lena, "lena-old");
const adaBook = await shareBook(ada);
const lenaBook = await shareBook(lena);
const lenaBookToWithdraw = await shareBook(lena);
const adaRequest = await post(ada, "Words for the kitchen");
const lenaRequest = await post(lena, "Words for the station");
const lenaRequestToClose = await post(lena, "Words for the beach");
const lenaClosed = await post(lena, "Words for the garden");
await board.closeRequest(env, as(lena), lenaClosed, { state: "closed" });
const adaClosed = await post(ada, "Words for the office");
await board.closeRequest(env, as(ada), adaClosed, { state: "closed" });
await board.likeRequest(env, lena, adaRequest, true);
const lenaFlag = (await corrections.suggestCorrection(env, as(lena), adaPack, { path: "items/koffie/means", kind: "flag", note: "This meaning reads oddly." })).id;
const [bookL, bookA] = [await textBook(), await textBook()];

// ---------- nothing written: every row of what Explore keeps, and both buckets ----------
const TABLES = ["items", "item_versions", "follows", "likes", "requests", "request_answers", "corrections", "grammar_suggestions", "shared_books", "shared_book_versions", "book_follows", "reports", "sharing_terms", "admin_log"];
const snapshot = () =>
  JSON.stringify({
    rows: TABLES.map((t) => sqlite.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()),
    library: [...env.LIBRARY.objects.keys()].sort(),
    uploads: [...env.UPLOADS.objects.keys()].sort(),
  });
const CLOSED = /^Sharing in Explore opens to everyone soon; for now only the library's admins can share, ask or suggest there\.$/;

// Each: the learner's call and the admin's, both made the same way the routes make them.
const GATED = [
  ["sharing a pack", () => community.sharePack(env, as(lena), { pack: pack("lena-new"), topics: [] }), () => community.sharePack(env, as(ada), { pack: pack("ada-new"), topics: [] }), (r) => r.shared === true],
  ["a shared pack's update", () => community.updateShared(env, as(lena), lenaPack, { level: "A2" }), () => community.updateShared(env, as(ada), adaPack, { level: "A2" }), (r) => r.updated === true],
  ["sharing a book", () => books.shareBook(env, as(lena), { book: bookL }), () => books.shareBook(env, as(ada), { book: bookA }), (r) => r.shared === true],
  ["a shared book's update", () => books.updateSharedBook(env, as(lena), lenaBook, { title: "Lena's book, again" }), () => books.updateSharedBook(env, as(ada), adaBook, { title: "Ada's book, again" }), (r) => r.updated === true],
  ["posting a request", () => board.postRequest(env, as(lena), { kind: "pack", language: "nl", title: "Words for the market" }), () => board.postRequest(env, as(ada), { kind: "pack", language: "nl", title: "Words for the harbor" }), (r) => Boolean(r.id ?? r.request)],
  ["answering a request", () => board.answerRequest(env, as(lena), adaRequest, { item: lenaPack }), () => board.answerRequest(env, as(ada), lenaRequest, { item: adaPack }), (r) => r.answered === true],
  ["opening your closed request again", () => board.closeRequest(env, as(lena), lenaClosed, { state: "open" }), () => board.closeRequest(env, as(ada), adaClosed, { state: "open" }), (r) => r.state === "open"],
  ["\"me too\" on a request (no terms asked)", () => board.likeRequest(env, lu, adaRequest, true), () => board.likeRequest(env, ada, lenaRequest, true), (r) => r.liked === true],
  ["suggesting a fix", () => corrections.suggestCorrection(env, as(lena), adaPack, { path: "items/thee/means", kind: "fix", value: "I always drink tea." }), () => corrections.suggestCorrection(env, as(ada), lenaPack, { path: "items/thee/means", kind: "fix", value: "I always drink tea." }), (r) => r.suggested === true],
  ["flagging", () => corrections.suggestCorrection(env, as(lena), adaPack, { path: "words/thee", kind: "flag", note: "Tea is thee, but also a drink." }), () => corrections.suggestCorrection(env, as(ada), lenaPack, { path: "words/thee", kind: "flag", note: "Tea is thee, but also a drink." }), (r) => r.suggested === true],
  ["suggesting to a grammar", () => grammar.suggestPattern(env, { userId: lena, via: "device", ai: false }, { language: "nl", kind: "new", name: "zelf", about: ZELF, knows: "native" }), () => grammar.suggestPattern(env, { userId: ada, via: "device", ai: false }, { language: "nl", kind: "new", pattern: "zelf-stress", name: "zelf, stressed", about: ZELF, knows: "native" }), (r) => r.suggested === true],
];

env.COMMUNITY_SHARING = "admins";
for (const [what, learner, admin, done] of GATED) {
  await test(`at "admins": a learner's ${what} is refused in words, nothing written; an admin's goes through`, async () => {
    const before = snapshot();
    await assert.rejects(learner, (error) => error instanceof community.SharingRefused && CLOSED.test(error.message));
    assert.equal(snapshot(), before, "the refused call wrote something");
    const answer = await admin();
    assert.ok(done(answer), `the admin's: ${JSON.stringify(answer).slice(0, 300)}`);
    assert.notEqual(snapshot(), before, "the admin's call wrote nothing");
  });
}

// What stays open to a learner at "admins": none of it puts their words or work in front of anyone.
const OPEN = [
  ["liking a pack", () => community.like(env, lena, adaPack, true), (r) => r.liked === true],
  ["adding a pack", () => community.follow(env, lu, adaPack), (r) => r.id === adaPack],
  ["liking a book", () => books.likeBook(env, lu, adaBook, true), (r) => r.liked === true],
  ["adding a book to a reading library", () => books.followBook(env, lu, adaBook), (r) => r.id === adaBook],
  ["taking a \"me too\" back", () => board.likeRequest(env, lena, adaRequest, false), (r) => r.liked === false],
  ["withdrawing a correction", () => corrections.withdrawCorrection(env, lena, lenaFlag), (r) => Boolean(r)],
  ["closing your request", () => board.closeRequest(env, as(lena), lenaRequestToClose, { state: "done" }), (r) => r.state === "done"],
  ["withdrawing a shared pack", () => community.withdrawShared(env, { userId: lena }, lenaPackToWithdraw), (r) => Boolean(r)],
  ["withdrawing a shared book", () => books.withdrawSharedBook(env, { userId: lena }, lenaBookToWithdraw), (r) => r.state === "withdrawn"],
  ["accepting the terms", () => community.acceptTerms(env, noa, community.SHARING_TERMS_VERSION), (r) => r.accepted === true],
  ["reporting a pack", () => mod.report(env, lu, adaPack, { reason: "spam", details: "Checking that reports stay open." }, { via: "app" }), (r) => r.reported === true],
];
for (const [what, call, done] of OPEN) {
  await test(`at "admins": a learner's ${what} still goes through`, async () => {
    const before = snapshot();
    const answer = await call();
    assert.ok(done(answer), JSON.stringify(answer).slice(0, 300));
    assert.notEqual(snapshot(), before, "it wrote nothing");
  });
}

// /api/me's mayShare and MCP's list read the same rule.
const roles = (...names) => new Set(names);
await test("/api/me's mayShare (sharingOpenFor): at \"admins\" an admin's only (not a moderator's, not a learner's); at \"everyone\" anyone's; anything else is \"admins\"", () => {
  env.COMMUNITY_SHARING = "admins";
  assert.deepEqual([community.sharingOpenFor(env, roles()), community.sharingOpenFor(env, roles("moderator")), community.sharingOpenFor(env, roles("admin"))], [false, false, true]);
  for (const value of [undefined, "", "Everyone", "true", "all"]) {
    env.COMMUNITY_SHARING = value;
    assert.equal(community.sharingOpenFor(env, roles()), false, `COMMUNITY_SHARING ${JSON.stringify(value)} opened it to a learner`);
  }
  env.COMMUNITY_SHARING = "everyone";
  assert.deepEqual([community.sharingOpenFor(env, roles()), community.sharingOpenFor(env, roles("admin"))], [true, true]);
});

/** The tools and prompts the four registrations list for a connection with these roles. */
function listed(rolesOf) {
  const names = new Set();
  const server = { registerTool: (name) => names.add(name), registerPrompt: (name) => names.add(`prompt:${name}`), tool: (name) => names.add(name), prompt: (name) => names.add(`prompt:${name}`) };
  const helpers = { caller: () => ({ userId: "x" }), sourceLabel: () => "test", ok: (v) => v, guarded: (f) => f() };
  for (const register of Object.values(MCP)) register(server, env, rolesOf, helpers);
  return names;
}
const PUBLISHING = ["share_upload", "share_pack", "update_shared", "share_book", "update_shared_book", "post_explore_request", "answer_explore_request", "suggest_correction", "suggest_pattern"];
const READING = ["explore_search", "explore_get", "follow", "unfollow", "explore_requests", "explore_request", "grammar_suggestions"];
await test("MCP's list: at \"admins\" none of the tools that publish for a learner (nor the contribute prompt), all of them for an admin; at \"everyone\" all for a learner; reading always", () => {
  env.COMMUNITY_SHARING = "admins";
  const learner = listed(roles());
  const admin = listed(roles("admin"));
  env.COMMUNITY_SHARING = "everyone";
  const everyone = listed(roles());
  assert.deepEqual(PUBLISHING.filter((t) => learner.has(t)), [], "listed for a learner at admins");
  assert.ok(![...learner].some((t) => t.startsWith("prompt:contribute")), "the contribute prompt listed for a learner at admins");
  assert.deepEqual(PUBLISHING.filter((t) => !admin.has(t)), [], "missing for an admin at admins");
  assert.deepEqual(PUBLISHING.filter((t) => !everyone.has(t)), [], "missing for a learner at everyone");
  for (const set of [learner, admin, everyone]) assert.deepEqual(READING.filter((t) => !set.has(t)), [], "a reading tool missing");
  return `a learner at admins: ${learner.size} listed, at everyone: ${everyone.size}`;
});

// At "everyone", the learner's very calls refused above go through, as before.
env.COMMUNITY_SHARING = "everyone";
for (const [what, learner, , done] of GATED) {
  await test(`at "everyone": the same ${what} of the learner's goes through`, async () => {
    const before = snapshot();
    const answer = await learner();
    assert.ok(done(answer), JSON.stringify(answer).slice(0, 300));
    assert.notEqual(snapshot(), before, "it wrote nothing");
  });
}
void row;
void mo;

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
