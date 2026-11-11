#!/usr/bin/env node
// Books in Explore over HTTP and MCP, end to end, against a LOCAL server and its own state (src/community-books.ts):
//   - who gets which tools: sharing books for whoever may share, decide_shared_book for an admin, mod_* taking a book;
//   - an AI shares a book with its woven layer, as an AI would (share_upload and its script, then share_book), and the staged files go;
//   - refused over MCP in plain words (a book with pictures); a book from an unknown source waits, unseen, until an admin opens it;
//   - found in Explore (explore_search, explore_get, the app's list); a second account's AI adds it to their reading library (follow
//     { book }), and its files arrive over HTTP with that account's session as read/shelf.js fetchOpenBook reads them (the book and its
//     layer checked as a device checks them), and refuse anyone signed out;
//   - a layer dropped and added again over MCP, reaching the follower;
//   - crafted bodies on the app's routes answered in words (400 or 422), never a 500;
//   - reported in the app with a copyright notice: hidden at once, its files 404 for the follower, the case in the queue with each layer's
//     lines, upheld by an admin over MCP, gone from Explore; and an account deleted: its book stays, from a former member.
//
//   node scripts/books-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
//
// The server: as for community-check (app/AGENTS.md), on a fresh state, with --var COMMUNITY_SHARING:everyone. Accounts are written
// straight into its D1 and deleted through the API. Sandbox off (wrangler). Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Agent, fetch as undiciFetch } from "undici";
import { bookFromText } from "../public/js/read/import-text.js";
import { validateBook, validateWeave } from "../public/js/read/book-format.js";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST) {
  console.error("Usage: books-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
// Every request on a fresh connection (keep-alive off), as community-check: a socket the local server closed would fail a POST.
const fresh = new Agent({ pipelining: 0 });
const fetch = async (url, init = {}) => {
  try {
    return await undiciFetch(url, { ...init, dispatcher: fresh });
  } catch (error) {
    throw new Error(`${init.method ?? "GET"} ${url}: ${error.message} (${error.cause?.code ?? error.cause?.message ?? "no cause given"})`);
  }
};
const results = [];
const log = [];
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

const wrangler = (args) => execFileSync("npx", ["wrangler", ...args], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
const sql = (command) => {
  const out = wrangler(["d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command]).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => (value === null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const run = randomBytes(3).toString("hex");
/** An account in D1, a week old: a session cookie and a personal token (with admin access for an admin or a moderator), the terms accepted. */
function account(name, { role = null } = {}) {
  const id = `bk${run}${randomBytes(5).toString("hex")}`;
  const now = Date.now();
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now - 8 * 86400_000})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'books-check')`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'check', ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now}, ${role ? 1 : 0})`,
      `INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${q(id)}, 1, ${now})`,
      ...(role ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, ${q(role)}, ${now}, 'd1', 'books-check')`] : []),
    ].join("; "),
  );
  return { id, name, cookie, token };
}

async function rpc(token, method, params) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(line.slice(6));
}
const toolNames = async (who) => (await rpc(who.token, "tools/list", {})).result.tools.map((t) => t.name);
async function tool(who, name, args = {}) {
  const { result, error } = await rpc(who.token, "tools/call", { name, arguments: args });
  log.push({ who: who.name, tool: name, args, ...(error || result?.isError ? { error: error?.message ?? result.content[0].text } : {}) });
  if (error) return { error: error.message };
  if (result.isError) return { error: result.content[0].text };
  return JSON.parse(result.content[0].text);
}
async function must(who, name, args) {
  const value = await tool(who, name, args);
  if (value?.error) throw new Error(`${name}: ${value.error}`);
  return value;
}
async function app(who, method, path, body, { raw = false } = {}) {
  const headers = { ...(who ? { Cookie: `lc_session=${who.cookie}` } : {}), "Content-Type": "application/json" };
  const response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  log.push({ who: who?.name ?? "nobody", http: `${method} ${path}`, status: response.status });
  return { status: response.status, body: json, text, headers: response.headers };
}
/** Sends a file through share_upload and its script, as an AI would; its sha256. */
async function stage_file(who, value, name) {
  const text = JSON.stringify(value);
  const sha = sha256(text);
  const staged = await must(who, "share_upload", { name, size: Buffer.byteLength(text), sha256: sha });
  if (staged.script) {
    const dir = mkdtempSync(join(tmpdir(), "books-check-"));
    writeFileSync(join(dir, name), text);
    writeFileSync(join(dir, "send.sh"), staged.script);
    execFileSync("sh", ["send.sh"], { cwd: dir });
    rmSync(dir, { recursive: true, force: true });
  }
  return sha;
}

// The open library's own books and layers (library/books/), as an AI that wove them would hold them.
const LIB = join(APP, "library/books");
const read = (path) => JSON.parse(readFileSync(join(LIB, path), "utf8"));
const ALICE = read("carroll-alice-wonderland-opening/d6dba2b5a24f054f/book.json");
const ALICE_NL = read("carroll-alice-wonderland-opening/d6dba2b5a24f054f/weave.nl.eadf6e578bf6.json");
const RAIN_PICTURES = read("storyweaver-137265-de-rode-regenjas/345514991ccfc29a/book.json");
async function textBook(title, url) {
  const book = await bookFromText(`${title}. The cat sleeps on the mat.\n\nThe dog barks. It is late.`, { title, lang: "en" });
  return Object.assign(book, { id: `bc-${run}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, rights: { us: true, eu: true, basis: "written for the check" }, source: { kind: "web", url } });
}
const notice = { name: "A Writer", contact: "writer@example.org", work: `The opening of a book, ${run}`, statement: true };

const sharer = account(`Sharer ${run}`);
const reader = account(`Reader ${run}`);
const reporter = account(`Reporter ${run}`);
const moderator = account(`Moderator ${run}`, { role: "moderator" });
const admin = account(`Admin ${run}`, { role: "admin" });
const ids = {};

await stage("who gets which tools: books' sharing for whoever may share, decide_shared_book for an admin", async () => {
  const learner = await toolNames(sharer);
  for (const name of ["share_upload", "share_book", "update_shared_book", "withdraw_shared_book", "my_shared_books", "explore_search", "explore_get", "follow", "unfollow", "report"]) assert(learner.includes(name), `a learner's AI lacks ${name}`);
  assert(!learner.includes("decide_shared_book") && !learner.includes("mod_get"), "a learner's AI has an admin's or a moderator's tool");
  const mod = await toolNames(moderator);
  assert(mod.includes("mod_get") && !mod.includes("decide_shared_book"), "a moderator's tools are wrong");
  assert((await toolNames(admin)).includes("decide_shared_book"), "an admin's AI lacks decide_shared_book");
  const get = (await rpc(moderator.token, "tools/list", {})).result.tools.find((t) => t.name === "mod_get");
  assert(get.inputSchema.properties.book, "mod_get doesn't take a book");
});

await stage("an AI shares a book with its woven layer over MCP: live, and the staged files go", async () => {
  const book = await stage_file(sharer, ALICE, "alice-book.json");
  const layer = await stage_file(sharer, ALICE_NL, "alice-weave.nl.json");
  const shared = await must(sharer, "share_book", { book, layers: [layer], about: "The first pages, woven into Dutch.", level: "A2" });
  assert(shared.shared === true && shared.state === "live", `share_book: ${JSON.stringify(shared).slice(0, 400)}`);
  assert(JSON.stringify(shared.layers) === '["nl"]', `its layers: ${JSON.stringify(shared.layers)}`);
  ids.alice = shared.id;
  const staged = sql(`SELECT COUNT(*) AS n FROM staged_files WHERE user_id = ${q(sharer.id)}`)[0].n;
  assert(staged === 0, `${staged} staged files left`);
  const mine = await must(sharer, "my_shared_books", {});
  assert(mine.some((b) => b.id === ids.alice && b.state === "live"), "my_shared_books doesn't list it");
  return shared.id;
});

await stage("refused over MCP in plain words: a book with pictures; and one from an unknown source waits for an admin", async () => {
  const pictures = await stage_file(sharer, RAIN_PICTURES, "rain-book.json");
  const refused = await must(sharer, "share_book", { book: pictures });
  assert(refused.shared === false && refused.errors.some((e) => e.at === "book.pictures" && /with pictures can't be shared/.test(e.message)), `pictures: ${JSON.stringify(refused).slice(0, 400)}`);
  const elsewhere = await stage_file(sharer, await textBook("Elsewhere", "https://example.org/a-story"), "elsewhere-book.json");
  const waiting = await must(sharer, "share_book", { book: elsewhere });
  assert(waiting.shared === true && waiting.state === "pending" && /waiting for an admin/.test(waiting.notes.join(" ")), `pending: ${JSON.stringify(waiting).slice(0, 400)}`);
  ids.pending = waiting.id;
  const searched = await must(reader, "explore_search", { kind: "book", q: "elsewhere" });
  assert(!searched.books.some((b) => b.id === ids.pending), "a pending book is found");
  assert((await app(reader, "GET", `/api/community/books/${ids.pending}`)).status === 404, "a pending book's page answers someone else");
  const queue = await must(admin, "mod_queue", {});
  assert(queue.sharedBooks?.some((b) => b.book === ids.pending), "it isn't in the admin's queue");
  assert(!(await must(moderator, "mod_queue", {})).sharedBooks, "a moderator's queue lists it");
  const opened = await must(admin, "decide_shared_book", { id: ids.pending, decision: "open", why: "Checked at the source: the author's own site, dedicated to the public domain." });
  assert(opened.state === "live", JSON.stringify(opened));
  assert((await must(reader, "explore_search", { kind: "book", q: "elsewhere" })).books.some((b) => b.id === ids.pending), "not found once opened");
});

await stage("found in Explore: explore_search beside packs, explore_get, the app's list", async () => {
  const found = await must(reader, "explore_search", { language: "nl" });
  assert(Array.isArray(found.items), "packs aren't there beside books");
  const book = found.books?.find((b) => b.id === ids.alice);
  assert(book && book.kind === "book" && JSON.stringify(book.layers) === '["nl"]', `explore_search: ${JSON.stringify(found.books).slice(0, 300)}`);
  const page = await must(reader, "explore_get", { book: ids.alice });
  assert(page.book.source.name === "Standard Ebooks" && page.book.rights.publicDomain === true && page.sample[0].layers.nl !== undefined, `explore_get: ${JSON.stringify(page).slice(0, 300)}`);
  const listed = await app(reader, "GET", "/api/community/books?learning=nl");
  assert(listed.status === 200 && listed.body.books.some((b) => b.id === ids.alice), `the app's list: ${listed.status}`);
  assert(!(await app(reader, "GET", "/api/community/books?learning=fr")).body.books.some((b) => b.id === ids.alice), "found for French");
});

/** Each of a meta's files, fetched with a session (or none), and checked as read/shelf.js fetchOpenBook checks them. */
async function arrives(meta, who) {
  const book = await app(who, "GET", meta.book);
  assert(book.status === 200, `the book's file: ${book.status} ${book.text.slice(0, 200)}`);
  assert((book.headers.get("cache-control") ?? "").includes("no-cache"), `the book's file is cached: ${book.headers.get("cache-control")}`);
  const problems = await validateBook(book.body);
  assert(!problems.length && book.body.id === meta.id && book.body.version === meta.version, `the book didn't arrive intact: ${problems.slice(0, 2)}`);
  for (const [to, entry] of Object.entries(meta.layers)) {
    const layer = await app(who, "GET", entry.url);
    assert(layer.status === 200, `the ${to} layer: ${layer.status}`);
    const wrong = await validateWeave(layer.body, book.body);
    assert(!wrong.length, `the ${to} layer didn't arrive intact: ${wrong.slice(0, 2)}`);
  }
  return Object.keys(meta.layers).length;
}

await stage("a second account's AI adds it to their reading library; its files arrive as a device reads them, and refuse anyone signed out", async () => {
  const meta = await must(reader, "follow", { book: ids.alice });
  assert(meta.id === ids.alice && meta.layers.nl && meta.book.startsWith(`/api/community/books/${ids.alice}/`), `follow: ${JSON.stringify(meta).slice(0, 300)}`);
  const following = await app(reader, "GET", "/api/community/books/following");
  const theirs = following.body.books.find((b) => b.id === ids.alice);
  assert(theirs, "it isn't in their reading library's list");
  ids.meta = theirs;
  const layers = await arrives(theirs, reader);
  const out = await app(null, "GET", theirs.book);
  assert(out.status === 401, `signed out, its file answers ${out.status}`);
  return `the book and ${layers} layer`;
});

await stage("a layer dropped and added again over MCP, reaching the follower", async () => {
  const dropped = await must(sharer, "update_shared_book", { id: ids.alice, drop_layers: ["nl"] });
  assert(dropped.updated === true && dropped.layers.length === 0, JSON.stringify(dropped).slice(0, 300));
  const without = (await app(reader, "GET", "/api/community/books/following")).body.books.find((b) => b.id === ids.alice);
  assert(Object.keys(without.layers).length === 0, "the follower still gets the dropped layer");
  const layer = await stage_file(sharer, ALICE_NL, "alice-weave.nl.json");
  const back = await must(sharer, "update_shared_book", { id: ids.alice, layers: [layer] });
  assert(back.updated === true && JSON.stringify(back.layers) === '["nl"]', JSON.stringify(back).slice(0, 300));
  const again = (await app(reader, "GET", "/api/community/books/following")).body.books.find((b) => b.id === ids.alice);
  await arrives(again, reader);
  ids.meta = again;
});

await stage("crafted bodies on the app's book routes: answered in words, never a 500", async () => {
  const bad = [];
  for (const [method, path] of [["POST", "/api/community/books/share"], ["POST", `/api/community/books/${ids.alice}/update`], ["POST", `/api/community/books/${ids.alice}/report`], ["POST", `/api/community/books/${ids.alice}/counter-notice`]]) {
    for (const body of ["not json", "[]", '{"book":{"toString":null}}', '{"book":"x","layers":"y","topics":7}']) {
      const r = await app(sharer, method, path, body, { raw: true });
      if (r.status >= 500 || !(r.body?.error || r.body?.errors)) bad.push(`${method} ${path} ${body}: ${r.status} ${r.text.slice(0, 120)}`);
    }
  }
  assert(!bad.length, bad.join("\n"));
});

await stage("reported with a copyright notice in the app: hidden at once, its files stop, the case in the queue, upheld by an admin over MCP", async () => {
  const filed = await app(reporter, "POST", `/api/community/books/${ids.alice}/report`, { reason: "copyright", details: "My translation.", notice });
  assert(filed.status === 200 && filed.body.hidden === true, `report: ${filed.status} ${filed.text.slice(0, 200)}`);
  const gone = await app(reader, "GET", ids.meta.book);
  assert(gone.status === 404, `the follower still gets its file: ${gone.status}`);
  for (const entry of Object.values(ids.meta.layers)) assert((await app(reader, "GET", entry.url)).status === 404, "a layer is still served");
  const down = (await app(reader, "GET", "/api/community/books/following")).body;
  assert(!down.books.some((b) => b.id === ids.alice) && down.down.some((b) => b.id === ids.alice && b.state === "hidden"), `the follower isn't told: ${JSON.stringify(down).slice(0, 300)}`);
  const queue = await must(moderator, "mod_queue", {});
  const theCase = queue.cases.find((c) => c.book === ids.alice);
  assert(theCase && theCase.reasons.includes("copyright"), `the queue: ${JSON.stringify(queue.cases).slice(0, 300)}`);
  const full = await must(moderator, "mod_get", { book: ids.alice });
  assert(full.book.sentences[0].layers?.nl !== undefined && full.book.source.includes("standardebooks"), `mod_get: ${JSON.stringify(full.book).slice(0, 300)}`);
  assert(!JSON.stringify(full).includes(notice.contact), "a moderator sees the notice's contact");
  const owner = await app(sharer, "GET", `/api/community/books/${ids.alice}`);
  assert(owner.status === 200 && owner.body.book.work === notice.work, `its owner isn't told the work named: ${owner.status}`);
  const report = full.reports.find((r) => r.reason === "copyright");
  const upheld = await must(admin, "mod_resolve", { report: report.id, decision: "uphold", why: "The notice names this book's layer." });
  assert(upheld.book === ids.alice && upheld.itemState === "removed", JSON.stringify(upheld));
  assert(!(await must(reader, "explore_search", { kind: "book", language: "nl" })).books.some((b) => b.id === ids.alice), "it's still found");
  assert((await app(reader, "GET", ids.meta.book)).status === 404, "its file came back");
});

await stage("an account deleted: its book stays in Explore, from a former member, its name out of it", async () => {
  const deleted = await app(sharer, "DELETE", "/api/me", { confirm: "delete my account" });
  assert(deleted.status === 200, `delete: ${deleted.status} ${deleted.text.slice(0, 200)}`);
  const page = await app(reader, "GET", `/api/community/books/${ids.pending}`);
  assert(page.status === 200 && page.body.book.by === "a former member" && !page.text.includes(sharer.name), `its book's page: ${page.status} ${page.text.slice(0, 200)}`);
  const found = await must(reader, "explore_search", { kind: "book", q: sharer.name });
  assert(!found.books.some((b) => b.id === ids.pending), "its name still finds its book");
  await arrives(page.body.meta, reader);
});

for (const who of [reader, reporter, moderator, admin]) await app(who, "DELETE", "/api/me", { confirm: "delete my account" });
writeFileSync(join(OUT, "results.json"), JSON.stringify({ results, log }, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} of ${results.length} FAILED` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
