#!/usr/bin/env node
// COMMUNITY_SHARING over HTTP and MCP, on a LOCAL server started with the value --sharing names (wrangler.jsonc's own, "admins", when
// started with no --var; or --var COMMUNITY_SHARING:everyone). The app's every route that puts a learner's words or work in front of others
// (sharing a pack or a book, their updates, posting a request, answering one, opening yours again, "me too", a fix, a flag, a grammar
// suggestion), each sent the way the app sends it:
//   - admins: a learner's is a 403 in words with nothing written (D1's rows read before and after), an admin's goes through;
//   - everyone: the learner's same request goes through.
// What stays open to a learner either way, each done: likes, adding a pack and a book, a report, taking a "me too" back, withdrawing a
// correction, a pack and a book, closing a request, accepting the terms. /api/me's mayShare for each, and MCP's tools/list for a learner's
// personal token and an admin's: the tools that publish only where the switch opens them, and a call to one that isn't listed refused.
//   node scripts/sharing-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir> --sharing admins|everyone
// LOCAL only: it writes its accounts into the server's D1. A fresh state. Sandbox off (wrangler). Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as undiciFetch } from "undici";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const SHARING = opt("sharing");
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST || !["admins", "everyone"].includes(SHARING)) {
  console.error("Usage: sharing-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> --sharing admins|everyone (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const OPEN = SHARING === "everyone";
const { bookFromText } = await import(join(APP, "public/js/read/import-text.js"));

const fresh = new Agent({ pipelining: 0 });
const fetch = async (url, init = {}) => {
  try {
    return await undiciFetch(url, { ...init, dispatcher: fresh });
  } catch (error) {
    throw new Error(`${init.method ?? "GET"} ${url}: ${error.message} (${error.cause?.code ?? error.cause?.message ?? "no cause given"})`);
  }
};
const results = [];
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? ` (${detail})` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => (value === null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const run = randomBytes(3).toString("hex");
const now = Date.now();
/** An account in D1, a month old: a session cookie, a personal token (with admin access for an admin), the terms unless said. */
function account(name, { admin = false, terms = true } = {}) {
  const id = `sw${run}${randomBytes(4).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now - 30 * 86_400_000})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86_400_000}, 'sharing-check')`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'check', ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now}, ${admin ? 1 : 0})`,
      ...(terms ? [`INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${q(id)}, 1, ${now})`] : []),
      ...(admin ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, 'admin', ${now}, 'd1', 'sharing-check')`] : []),
    ].join("; "),
  );
  return { id, name, cookie, token };
}
// Something a learner shared while it was open to them: an admin for those requests, then not (roles are read from D1 on every request).
const asAdminFor = async (who, fn) => {
  sql(`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(who.id)}, 'admin', ${now}, 'd1', 'sharing-check: shared while open')`);
  try {
    return await fn();
  } finally {
    sql(`DELETE FROM user_roles WHERE user_id = ${q(who.id)} AND note = 'sharing-check: shared while open'`);
  }
};

async function app(who, method, path, body) {
  const response = await fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${who.cookie}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const must = async (who, method, path, body) => {
  const answer = await app(who, method, path, body);
  assert(answer.status === 200, `${who.name} ${method} ${path}: ${answer.status} ${JSON.stringify(answer.body).slice(0, 300)}`);
  return answer.body;
};
async function rpc(who, method, params) {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(line.slice(6));
}

// ---------- what they share ----------
const sentence = (id, text, lemmas, means) => {
  const words = text.replace(/[.?!]$/, "").split(" ").map((word) => [word, lemmas[word] ?? word.toLowerCase()]);
  return { id, concepts: ["v2"], text, means, words, punct: ".", literal: text.split(" ").map((w) => [w]), english: null, moved: [], wrong: [`${text} nee`], gap: { index: words.length - 1, options: [words.at(-1)[0], "iets"] } };
};
const pack = (id) => ({
  format: "lexicommons-pack", version: 2, id, name: `Café ${id}`, about: `A café pack (${id}).`, language: "nl", from: "en", topics: {}, chunks: {}, patterns: {},
  words: { ik: "I", drinken: "to drink", thee: "tea", koffie: "coffee" },
  items: [sentence("thee", "Ik drink thee.", { Ik: "ik", drink: "drinken", thee: "thee" }, `I drink tea (${id}, ${run}).`), sentence("koffie", "Ik drink koffie.", { Ik: "ik", drink: "drinken", koffie: "koffie" }, `I drink coffee (${id}, ${run}).`)],
});
let made = 0;
async function textBook() {
  made++;
  const book = await bookFromText(`Book number ${made} of run ${run}. The cat sleeps on the mat.\n\nThe dog barks. It is late.`, { title: `Book ${made}`, lang: "en" });
  book.id = `sw-${run}-book-${made}`;
  book.rights = { us: true, eu: true, basis: "made for the check" };
  book.source = { kind: "gutenberg", url: `https://www.gutenberg.org/ebooks/${92000 + made}` };
  return book;
}
const ZELF = "Put zelf after a word to stress it: ik doe het zelf (I do it self).";

console.log(`sharing check (COMMUNITY_SHARING ${SHARING}): ${BASE}`);
const lena = account("Lena (a learner)");
const lu = account("Lu (a learner, no terms)", { terms: false });
const noa = account("Noa (a learner, no terms)", { terms: false });
const ada = account("Ada (an admin)", { admin: true });

const share = async (who, id) => (await must(who, "POST", "/api/community/share", { pack: pack(id), topics: [] })).id;
const shareBook = async (who) => (await must(who, "POST", "/api/community/books/share", { book: await textBook() })).id;
const post = async (who, title) => {
  const posted = await must(who, "POST", "/api/community/requests", { kind: "pack", language: "nl", title });
  return posted.id ?? posted.request;
};
let S = {};
await stage("what was there before the switch: packs, books, requests, a \"me too\" and a flag, the learner's shared while it was open to them", async () => {
  S.adaPack = await share(ada, "ada-cafe");
  S.adaBook = await shareBook(ada);
  S.adaRequest = await post(ada, "Words for the kitchen");
  S.adaClosed = await post(ada, "Words for the office");
  await must(ada, "POST", `/api/community/requests/${S.adaClosed}/close`, { state: "closed" });
  await asAdminFor(lena, async () => {
    S.lenaPack = await share(lena, "lena-cafe");
    S.lenaPackToWithdraw = await share(lena, "lena-old");
    S.lenaBook = await shareBook(lena);
    S.lenaBookToWithdraw = await shareBook(lena);
    S.lenaRequest = await post(lena, "Words for the station");
    S.lenaRequestToClose = await post(lena, "Words for the beach");
    S.lenaClosed = await post(lena, "Words for the garden");
    await must(lena, "POST", `/api/community/requests/${S.lenaClosed}/close`, { state: "closed" });
    await must(lena, "POST", `/api/community/requests/${S.adaRequest}/like`);
    S.lenaFlag = (await must(lena, "POST", `/api/community/items/${S.adaPack}/corrections`, { path: "items/koffie/means", kind: "flag", note: "This meaning reads oddly." })).id;
  });
  S.bookL = await textBook();
  S.bookA = await textBook();
  return `packs ${S.adaPack}, ${S.lenaPack}; books ${S.adaBook}, ${S.lenaBook}`;
});

// Every row Explore keeps, read in one query: a refused request must leave it as it was.
const TABLES = ["items", "item_versions", "follows", "likes", "requests", "request_answers", "corrections", "grammar_suggestions", "shared_books", "shared_book_versions", "book_follows", "reports", "sharing_terms"];
const snapshot = () =>
  JSON.stringify(
    sql(
      `SELECT ${TABLES.map((t) => `(SELECT COUNT(*) || ':' || COALESCE(MAX(rowid), 0) FROM ${t}) AS ${t}`).join(", ")}, (SELECT group_concat(id || state || COALESCE(level, '') || title, ',') FROM items) AS item_rows, (SELECT group_concat(id || state || title, ',') FROM shared_books) AS book_rows, (SELECT group_concat(id || state, ',') FROM requests) AS request_rows, (SELECT group_concat(id || state, ',') FROM corrections) AS correction_rows`,
    ),
  );

await stage(`/api/me's mayShare: the learner's ${OPEN}, the admin's true, and the learner with no terms ${OPEN}`, async () => {
  const [l, n, a] = [await must(lena, "GET", "/api/me"), await must(lu, "GET", "/api/me"), await must(ada, "GET", "/api/me")];
  assert(l.mayShare === OPEN && n.mayShare === OPEN && a.mayShare === true, `mayShare: learner ${l.mayShare}, no terms ${n.mayShare}, admin ${a.mayShare}`);
});

const PUBLISHING = ["share_upload", "share_pack", "update_shared", "share_book", "update_shared_book", "post_explore_request", "answer_explore_request", "suggest_correction", "suggest_pattern"];
const READING = ["explore_search", "explore_get", "follow", "unfollow", "explore_requests", "explore_request", "grammar_suggestions"];
await stage(`MCP: the tools that publish ${OPEN ? "listed" : "missing"} for a learner's AI, listed for an admin's; the reading ones for both`, async () => {
  const names = async (who) => new Set((await rpc(who, "tools/list", {})).result.tools.map((t) => t.name));
  const [l, a] = [await names(lena), await names(ada)];
  const learnerHas = PUBLISHING.filter((t) => l.has(t));
  assert(OPEN ? learnerHas.length === PUBLISHING.length : learnerHas.length === 0, `a learner's AI is listed: ${learnerHas.join(", ") || "none of them"}`);
  assert(PUBLISHING.every((t) => a.has(t)), `an admin's AI is missing: ${PUBLISHING.filter((t) => !a.has(t)).join(", ")}`);
  assert(READING.every((t) => l.has(t) && a.has(t)), `a reading tool missing: ${READING.filter((t) => !l.has(t) || !a.has(t)).join(", ")}`);
  if (!OPEN) {
    const before = snapshot();
    const called = await rpc(lena, "tools/call", { name: "post_explore_request", arguments: { kind: "pack", language: "nl", title: "Words through my AI" } });
    assert(called.error || called.result?.isError, `a learner's AI calling post_explore_request: ${JSON.stringify(called).slice(0, 300)}`);
    assert(snapshot() === before, "the call wrote something");
  }
  return `a learner's AI has ${l.size} tools, an admin's ${a.size}`;
});

// The learner's request and the admin's, each as the app sends it.
const GATED = [
  ["shares a pack", ["POST", "/api/community/share", { pack: pack("lena-new"), topics: [] }], () => ["POST", "/api/community/share", { pack: pack("ada-new"), topics: [] }]],
  ["updates a shared pack", () => ["POST", `/api/community/items/${S.lenaPack}/update`, { level: "A2" }], () => ["POST", `/api/community/items/${S.adaPack}/update`, { level: "A2" }]],
  ["shares a book", () => ["POST", "/api/community/books/share", { book: S.bookL }], () => ["POST", "/api/community/books/share", { book: S.bookA }]],
  ["updates a shared book", () => ["POST", `/api/community/books/${S.lenaBook}/update`, { title: "Lena's book, again" }], () => ["POST", `/api/community/books/${S.adaBook}/update`, { title: "Ada's book, again" }]],
  ["posts a request", ["POST", "/api/community/requests", { kind: "pack", language: "nl", title: "Words for the market" }], () => ["POST", "/api/community/requests", { kind: "pack", language: "nl", title: "Words for the harbor" }]],
  ["answers a request", () => ["POST", `/api/community/requests/${S.adaRequest}/answers`, { item: S.lenaPack }], () => ["POST", `/api/community/requests/${S.lenaRequest}/answers`, { item: S.adaPack }]],
  ["opens a closed request of theirs again", () => ["POST", `/api/community/requests/${S.lenaClosed}/close`, { state: "open" }], () => ["POST", `/api/community/requests/${S.adaClosed}/close`, { state: "open" }]],
  ["says \"me too\" (with no terms)", () => ["POST", `/api/community/requests/${S.adaRequest}/like`], () => ["POST", `/api/community/requests/${S.lenaRequest}/like`], lu],
  ["suggests a fix", () => ["POST", `/api/community/items/${S.adaPack}/corrections`, { path: "items/thee/means", kind: "fix", value: "I always drink tea." }], () => ["POST", `/api/community/items/${S.lenaPack}/corrections`, { path: "items/thee/means", kind: "fix", value: "I always drink tea." }]],
  ["flags a piece", () => ["POST", `/api/community/items/${S.adaPack}/corrections`, { path: "words/thee", kind: "flag", note: "Tea is thee, but also a drink." }], () => ["POST", `/api/community/items/${S.lenaPack}/corrections`, { path: "words/thee", kind: "flag", note: "Tea is thee, but also a drink." }]],
  ["suggests to a grammar", ["POST", "/api/community/grammar/nl/suggestions", { kind: "new", name: "zelf", about: ZELF, knows: "native" }], () => ["POST", "/api/community/grammar/nl/suggestions", { kind: "new", pattern: "zelf-stress", name: "zelf, stressed", about: ZELF, knows: "native" }]],
];
const call = (spec) => (typeof spec === "function" ? spec() : spec);
for (const [what, learnerSpec, adminSpec, learnerWho = lena] of GATED) {
  await stage(
    OPEN ? `a learner ${what}: it goes through, as before` : `a learner ${what}: 403 in words, nothing written; an admin's goes through`,
    async () => {
      const [method, path, body] = call(learnerSpec);
      const before = snapshot();
      const tried = await app(learnerWho, method, path, body);
      if (OPEN) {
        assert(tried.status === 200, `${method} ${path}: ${tried.status} ${JSON.stringify(tried.body).slice(0, 300)}`);
        assert(snapshot() !== before, "it wrote nothing");
        return `${tried.status}`;
      }
      assert(tried.status === 403, `${method} ${path}: ${tried.status} ${JSON.stringify(tried.body).slice(0, 300)}`);
      assert(tried.body?.error === "Sharing in Explore opens to everyone soon; for now only the library's admins can share, ask or suggest there.", `its words: ${JSON.stringify(tried.body)}`);
      assert(snapshot() === before, "the refused request wrote something");
      const [aMethod, aPath, aBody] = call(adminSpec);
      const allowed = await app(ada, aMethod, aPath, aBody);
      assert(allowed.status === 200, `the admin's ${aMethod} ${aPath}: ${allowed.status} ${JSON.stringify(allowed.body).slice(0, 300)}`);
      return `403, then the admin's ${allowed.status}`;
    },
  );
}

const STAYS = [
  ["likes a pack", () => ["POST", `/api/community/items/${S.adaPack}/like`], lena],
  ["adds a pack", () => ["POST", `/api/community/items/${S.adaPack}/follow`], lu],
  ["likes a book", () => ["POST", `/api/community/books/${S.adaBook}/like`], lu],
  ["adds a book to their reading library", () => ["POST", `/api/community/books/${S.adaBook}/follow`], lu],
  ["takes a \"me too\" back", () => ["DELETE", `/api/community/requests/${S.adaRequest}/like`], lena],
  ["withdraws a correction", () => ["POST", `/api/community/corrections/${S.lenaFlag}/withdraw`], lena],
  ["closes a request of theirs", () => ["POST", `/api/community/requests/${S.lenaRequestToClose}/close`, { state: "done" }], lena],
  ["withdraws a shared pack", () => ["POST", `/api/community/items/${S.lenaPackToWithdraw}/withdraw`, {}], lena],
  ["withdraws a shared book", () => ["POST", `/api/community/books/${S.lenaBookToWithdraw}/withdraw`, {}], lena],
  ["accepts the terms", () => ["POST", "/api/community/terms", { version: 1 }], noa],
  ["reports a pack", () => ["POST", `/api/community/items/${S.adaPack}/report`, { reason: "spam", details: "Checking that reports stay open." }], lu],
];
for (const [what, spec, who] of STAYS) {
  await stage(`a learner ${what}: it goes through`, async () => {
    const [method, path, body] = spec();
    const before = snapshot();
    const done = await app(who, method, path, body);
    assert(done.status === 200, `${method} ${path}: ${done.status} ${JSON.stringify(done.body).slice(0, 300)}`);
    assert(snapshot() !== before, "it wrote nothing");
  });
}

writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, sharing: SHARING, results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} of ${results.length} stages FAILED` : `all ${results.length} stages passed (COMMUNITY_SHARING ${SHARING})`);
process.exit(failed ? 1 : 0);
