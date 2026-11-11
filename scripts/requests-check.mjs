#!/usr/bin/env node
// Requests in Explore (the board), end to end over HTTP and MCP, against a LOCAL server with COMMUNITY_SHARING
// "everyone" and its own state:
// - who sees which tools (the board for everyone; posting, answering and closing where sharing is open; deciding a book
//   request an admin's), and the contribute prompt;
// - posting a pack request (every refusal), the board (by language, popular and new), "me too";
// - answering with a pack of yours (and each refusal), an admin's answer with anyone's, new answers to the requester;
// - done, closed and open again;
// - book requests: a book on the shelf (answered once its layer is there), one that isn't (pending, an admin's to open
//   or decline, naming the shelf's book later);
// - reports (the hide rules, the queue and a request's case, upheld and dismissed, minors as an admin's);
// - the day's limits (also sent at once), crafted bodies on every route, the export, an account going.
//
//   node scripts/requests-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
//
// The server: as for admin-check (app/AGENTS.md), on a fresh state, with --var COMMUNITY_SHARING:everyone. Sandbox off.
// It writes its own catalog into the local library (a book on the shelf), so give it a state of its own.
// Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { Agent, fetch as undiciFetch } from "undici";
import { dirname, join, resolve } from "node:path";
import { localR2 } from "./fixtures/local-r2.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
// Absolute, so files written here are found by commands run from the app's folder (wrangler, below).
const OUT = outArg && resolve(outArg);
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
// The library's bucket through one local R2 in this process (scripts/fixtures/local-r2.mjs), not a wrangler launch per object.
const r2 = PERSIST ? localR2(APP, PERSIST) : null;
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST) {
  console.error("Usage: requests-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
// Every request on a fresh connection (keep-alive off): a kept-alive socket the local server closed while it was busy
// (under load, or while the check ran wrangler) would fail the next request on it with a bare "fetch failed", and a
// POST in a race can't simply be sent again. Anything that fails says why.
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
    console.log(`  ok    ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const eq = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), `${message}\n  got:  ${JSON.stringify(a)?.slice(0, 400)}\n  want: ${JSON.stringify(b)?.slice(0, 400)}`);

const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const run = randomBytes(3).toString("hex");
function account(name, { role = null, ageDays = 30, terms = true } = {}) {
  const id = `rq${run}${randomBytes(5).toString("hex")}`;
  const now = Date.now();
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now - ageDays * 86400_000})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'requests-check')`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'check', ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now}, ${role ? 1 : 0})`,
      ...(terms ? [`INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${q(id)}, 1, ${now})`] : []),
      ...(role ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, ${q(role)}, ${now}, 'd1', 'requests-check')`] : []),
    ].join("; "),
  );
  return { id, name, cookie, token };
}
async function rpc(token, method, params) {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const line = (await response.text()).split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status}`);
  return JSON.parse(line.slice(6));
}
const toolNames = async (who) => (await rpc(who.token, "tools/list", {})).result.tools.map((t) => t.name);
async function tool(who, name, args = {}) {
  const { result, error } = await rpc(who.token, "tools/call", { name, arguments: args });
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
  const response = await fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${who.cookie}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const okay = async (who, method, path, body) => {
  const r = await app(who, method, path, body);
  if (r.status !== 200) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const refused = async (who, method, path, body, status, re) => {
  const r = await app(who, method, path, body);
  assert(r.status === status && (!re || re.test(r.body?.error ?? "")), `${method} ${path} ${JSON.stringify(body)?.slice(0, 120)}: wanted ${status}${re ? ` ${re}` : ""}, got ${r.status} ${JSON.stringify(r.body)}`);
};
const NL = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
const DE = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-de.json"), "utf8"));
/** A pack of its own (Explore refuses the same content twice): the fixture with its natural lines marked. */
const variant = (pack, tag) => ({ ...pack, id: `rq-${run}-${tag}`, items: pack.items.map((item) => ({ ...item, means: `${item.means} (${tag})` })) });
const rowOf = (id) => sql(`SELECT state, state_note, shown, shown_reason, likes, answers, book_id FROM requests WHERE id = ${q(id)}`)[0];
/** The local library's catalog: a book on the shelf with the layers given (written as a publish would leave it). */
async function shelve(books) {
  await r2.put("lexicommons-library", "catalogue.json", JSON.stringify({ format: "lexicommons-catalogue", v: 1, books: books.map((b) => ({ id: b.id, version: "v1", title: b.title, authors: ["A. Writer"], lang: "en", layers: Object.fromEntries(b.layers.map((l) => [l, { kind: "weave", url: `/library/weaves/${b.id}.${l}.json` }])) })), lists: {}, packs: {} }), "application/json");
}

console.log(`requests check: ${BASE}`);
const admin = account("Req Admin", { role: "admin" });
const moderator = account("Req Moderator", { role: "moderator" });
const asker = account("Req Asker");
const maker = account("Req Maker");
const other = account("Req Other");
const fan = account("Req Fan");
const noTerms = account("Req No Terms", { terms: false });
const newcomer = account("Req Newcomer", { ageDays: 1 });
const reporters = [account("Req Reporter A"), account("Req Reporter B"), account("Req Reporter C")];

let packRequest;
let makersPack;
let othersPack;
let esPack;
await stage("who sees which tools: the board for everyone, posting, answering and closing where sharing is open, deciding a book request an admin's; contribute; no tool likes", async () => {
  const learner = await toolNames(asker);
  for (const t of ["explore_requests", "explore_request", "post_explore_request", "answer_explore_request", "close_explore_request", "list_requests"]) assert(learner.includes(t), `${t} listed`);
  assert(!learner.includes("decide_book_request"), "deciding a book request isn't a learner's");
  assert(!learner.some((t) => /like/.test(t)), "no tool likes anything");
  assert((await toolNames(admin)).includes("decide_book_request"), "an admin's");
  assert(!(await toolNames(moderator)).includes("decide_book_request"), "not a moderator's");
  const prompts = (await rpc(asker.token, "prompts/list", {})).result.prompts.map((p) => p.name);
  assert(prompts.includes("contribute"), `contribute listed: ${prompts}`);
  const got = await rpc(asker.token, "prompts/get", { name: "contribute", arguments: { language: "Dutch" } });
  assert(/explore_requests/.test(got.result.messages[0].content.text) && /answer_explore_request/.test(got.result.messages[0].content.text) && /in Dutch/.test(got.result.messages[0].content.text), "the prompt names the tools and the language");
});

await stage("posting a pack request from the app: the board has it; each refusal says why", async () => {
  const posted = await okay(asker, "POST", "/api/community/requests", { kind: "pack", language: "nl", level: "A1", topic: "travel", title: "Dutch for my trip", details: "Trains, hotels, asking the way." });
  assert(posted.posted && posted.state === "open" && posted.id, JSON.stringify(posted));
  packRequest = posted.id;
  const board = await okay(fan, "GET", "/api/community/requests?lang=nl");
  const seen = board.find((r) => r.id === packRequest);
  assert(seen && seen.kind === "pack" && seen.level === "A1" && seen.topic?.id === "travel" && seen.topic?.name === "Travel" && seen.by === "Req Asker" && !seen.mine && seen.state === "open", `on the board: ${JSON.stringify(seen)}`);
  assert(!(await okay(fan, "GET", "/api/community/requests?lang=de")).some((r) => r.id === packRequest), "not on German's board");
  await refused(noTerms, "POST", "/api/community/requests", { kind: "pack", language: "nl", title: "Dutch please" }, 403, /sharing terms/);
  for (const [body, re] of [
    [{ kind: "text", language: "nl", title: "A short story" }, /kind is "pack"/],
    [{ kind: "pack", language: "en", title: "English please" }, /language/],
    [{ kind: "pack", language: "xx", title: "Martian please" }, /language/],
    [{ kind: "pack", language: "nl", level: "Z9", title: "Dutch please" }, /level/],
    [{ kind: "pack", language: "nl", topic: "unicorns", title: "Dutch please" }, /topic/],
    [{ kind: "pack", language: "nl", title: "no" }, /title/],
    [{ kind: "pack", language: "nl", title: "x".repeat(121) }, /title/],
    [{ kind: "pack", language: "nl", title: "Dutch please", details: 42 }, /details is text/],
    [{ kind: "pack", language: "nl", title: "Dutch please", book: "check-book" }, /book is for a book request/],
  ])
    await refused(other, "POST", "/api/community/requests", body, 400, re);
});

await stage("posting over MCP; the board most \"me too\" first or newest first; \"me too\" from the app (one each, not your own, undone)", async () => {
  const second = await must(other, "post_explore_request", { kind: "pack", language: "nl", level: "A2", title: "Dutch at the market", details: "Numbers, prices, haggling." });
  eq(second.state, "open", "posted over MCP");
  await okay(fan, "POST", `/api/community/requests/${packRequest}/like`);
  await okay(maker, "POST", `/api/community/requests/${packRequest}/like`);
  await okay(maker, "POST", `/api/community/requests/${packRequest}/like`); // twice: still one
  await refused(asker, "POST", `/api/community/requests/${packRequest}/like`, undefined, 400, /yours/);
  eq(rowOf(packRequest).likes, 2, "two \"me too\"s");
  const popular = (await okay(fan, "GET", "/api/community/requests?lang=nl")).map((r) => r.id);
  assert(popular.indexOf(packRequest) < popular.indexOf(second.id), `the most liked first: ${popular}`);
  const newest = (await okay(fan, "GET", "/api/community/requests?lang=nl&sort=new")).map((r) => r.id);
  assert(newest.indexOf(second.id) < newest.indexOf(packRequest), `the newest first: ${newest}`);
  const mine = await okay(fan, "GET", `/api/community/requests/${packRequest}`);
  assert(mine.liked && mine.likes === 2, `fan's like shows: ${JSON.stringify(mine)}`);
  eq((await okay(maker, "DELETE", `/api/community/requests/${packRequest}/like`)).likes, 1, "undone");
  await okay(maker, "POST", `/api/community/requests/${packRequest}/like`);
  const viaMcp = await must(fan, "explore_requests", { lang: "nl" });
  assert(viaMcp.some((r) => r.id === packRequest), "the board over MCP");
});

await stage("answering with a pack of yours: the requester sees it as new until they open it; each refusal says why", async () => {
  makersPack = (await okay(maker, "POST", "/api/community/share", { pack: variant(NL, "trip"), level: "A1", topics: ["travel"] })).id;
  othersPack = (await okay(other, "POST", "/api/community/share", { pack: variant(NL, "other"), level: "A1" })).id;
  const germanPack = (await okay(maker, "POST", "/api/community/share", { pack: variant(DE, "de") })).id;
  const answered = await okay(maker, "POST", `/api/community/requests/${packRequest}/answers`, { item: makersPack });
  assert(answered.answered, JSON.stringify(answered));
  await refused(maker, "POST", `/api/community/requests/${packRequest}/answers`, { item: makersPack }, 400, /answers it already/);
  await refused(maker, "POST", `/api/community/requests/${packRequest}/answers`, { item: othersPack }, 400, /you've shared yourself/);
  await refused(asker, "POST", `/api/community/requests/${packRequest}/answers`, { item: makersPack }, 400, /your own request/);
  await refused(maker, "POST", `/api/community/requests/${packRequest}/answers`, { item: "no-such-pack" }, 400, /no live pack/);
  await refused(maker, "POST", `/api/community/requests/${packRequest}/answers`, {}, 400, /item is the pack/);
  await refused(maker, "POST", `/api/community/requests/${packRequest}/answers`, { item: germanPack }, 400, /That pack is German; the request asks for Dutch/);
  const mine = await okay(asker, "GET", "/api/community/requests?mine=1");
  const listed = mine.find((r) => r.id === packRequest);
  assert(listed?.mine && listed.answers === 1 && listed.newAnswers === 1, `new to its author: ${JSON.stringify(listed)}`);
  const opened = await okay(asker, "GET", `/api/community/requests/${packRequest}`);
  assert(opened.answeredBy.length === 1 && opened.answeredBy[0].item === makersPack && opened.answeredBy[0].by === "Req Maker" && opened.answeredBy[0].new, `its answer: ${JSON.stringify(opened.answeredBy)}`);
  const after = (await okay(asker, "GET", "/api/community/requests?mine=1")).find((r) => r.id === packRequest);
  assert(after && !after.newAnswers, `seen once opened: ${JSON.stringify(after)}`);
  const othersView = await okay(fan, "GET", `/api/community/requests/${packRequest}`);
  assert(!othersView.answeredBy[0].new && othersView.newAnswers === undefined, "nothing new for anyone else");
});

await stage("an admin answers with anyone's live pack (logged); a hidden pack's answer isn't shown; over MCP the same", async () => {
  const viaMcp = await must(admin, "answer_explore_request", { id: packRequest, item: othersPack });
  assert(viaMcp.answered, JSON.stringify(viaMcp));
  assert(sql(`SELECT COUNT(*) AS n FROM admin_log WHERE action = 'request.answer' AND target = ${q(`request:${packRequest}`)}`)[0].n === 1, "an admin's answer with someone else's pack is logged");
  eq(rowOf(packRequest).answers, 2, "two answers");
  // The other pack reported and hidden by a moderator: its answer drops out of the list.
  await okay(fan, "POST", `/api/community/items/${othersPack}/report`, { reason: "spam", details: "test" });
  await must(moderator, "mod_hide", { id: othersPack, why: "Looking into it." });
  const shown = (await okay(fan, "GET", `/api/community/requests/${packRequest}`)).answeredBy.map((a) => a.item);
  eq(shown, [makersPack], "only the live pack answers it now");
  const one = await must(fan, "explore_request", { id: packRequest });
  eq(one.answeredBy.map((a) => a.item), [makersPack], "the same over MCP");
});

await stage("done, closed and open again: by its author, or an admin saying why; a done request takes no answers or \"me too\"s", async () => {
  esPack = (await okay(maker, "POST", "/api/community/share", { pack: variant(NL, "later"), level: "A2" })).id;
  eq((await okay(asker, "POST", `/api/community/requests/${packRequest}/close`, { state: "done" })).state, "done", "done");
  await refused(maker, "POST", `/api/community/requests/${packRequest}/answers`, { item: esPack }, 400, /is done/);
  await refused(other, "POST", `/api/community/requests/${packRequest}/like`, undefined, 400, /is done/);
  assert(!(await okay(fan, "GET", "/api/community/requests?lang=nl")).some((r) => r.id === packRequest), "off the open board");
  assert((await okay(fan, "GET", "/api/community/requests?lang=nl&state=done")).some((r) => r.id === packRequest), "on the done board");
  await refused(asker, "POST", `/api/community/requests/${packRequest}/close`, { state: "done" }, 400, /done already/);
  eq((await okay(asker, "POST", `/api/community/requests/${packRequest}/close`, { state: "open" })).state, "open", "open again");
  await refused(fan, "POST", `/api/community/requests/${packRequest}/close`, { state: "closed" }, 400, /No request of yours/);
  await refused(admin, "POST", `/api/community/requests/${packRequest}/close`, { state: "closed" }, 400, /Say why/);
  eq((await must(admin, "close_explore_request", { id: packRequest, state: "closed", note: "Answered elsewhere." })).state, "closed", "an admin closes it, saying why");
  eq(rowOf(packRequest).state_note, "Answered elsewhere.", "why, for its author");
  eq((await must(asker, "close_explore_request", { id: packRequest, state: "open" })).state, "open", "its author opens it again over MCP");
  await refused(asker, "POST", `/api/community/requests/${packRequest}/close`, { state: "gone" }, 400, /state is/);
});

let shelfRequest;
let pendingRequest;
let declinedRequest;
await stage("a book on the shelf: asked into a language, answered once that layer is on the shelf; already there, or asked already, is refused", async () => {
  await shelve([{ id: "check-book", title: "The Check Book", layers: ["nl"] }]);
  await refused(asker, "POST", "/api/community/requests", { kind: "book", language: "nl", book: "check-book", title: "The Check Book in Dutch" }, 400, /on the shelf in Dutch already/);
  await refused(asker, "POST", "/api/community/requests", { kind: "book", language: "es", book: "no-such-book", title: "A missing book" }, 400, /no book "no-such-book" on the shelf/);
  const posted = await okay(asker, "POST", "/api/community/requests", { kind: "book", language: "es", book: "check-book", title: "The Check Book in Spanish" });
  eq(posted.state, "open", "open at once: the book is on the shelf");
  shelfRequest = posted.id;
  await refused(other, "POST", "/api/community/requests", { kind: "book", language: "es", book: "check-book", title: "Check Book, Spanish" }, 400, /asked for The Check Book in Spanish already/);
  const seen = (await okay(fan, "GET", "/api/community/requests?lang=es&kind=book")).find((r) => r.id === shelfRequest);
  assert(seen?.book?.id === "check-book" && seen.book.onShelf && !seen.book.layer && seen.book.title === "The Check Book", `its book: ${JSON.stringify(seen)}`);
  await refused(maker, "POST", `/api/community/requests/${shelfRequest}/answers`, { item: esPack }, 400, /layer going on the shelf/);
  await shelve([{ id: "check-book", title: "The Check Book", layers: ["nl", "es"] }]);
  const now = await okay(asker, "GET", `/api/community/requests/${shelfRequest}`);
  assert(now.state === "done" && /Spanish layer is on the shelf/.test(now.stateNote ?? "") && now.book.layer, `done once the layer's there: ${JSON.stringify(now)}`);
  eq(rowOf(shelfRequest).state, "done", "written as done");
});

await stage("a book not on the shelf: pending, its author's only; an admin's queue lists it; opened (naming the shelf's book later) or declined, with why", async () => {
  const posted = await must(asker, "post_explore_request", { kind: "book", language: "nl", book: { title: "A Missing Classic", author: "Old Writer", source: "Project Gutenberg #1" }, title: "A Missing Classic in Dutch" });
  eq(posted.state, "pending", "waits for an admin");
  pendingRequest = posted.id;
  assert((await okay(asker, "GET", `/api/community/requests/${pendingRequest}`)).state === "pending", "its author sees it");
  await refused(fan, "GET", `/api/community/requests/${pendingRequest}`, undefined, 400, /no such request/);
  assert(!(await okay(fan, "GET", "/api/community/requests?lang=nl&kind=book")).some((r) => r.id === pendingRequest), "not on the board");
  await refused(fan, "POST", `/api/community/requests/${pendingRequest}/report`, { reason: "spam" }, 400, /no such request/);
  await refused(fan, "POST", `/api/community/requests/${pendingRequest}/like`, undefined, 400, /no such request/);
  const adminQueue = await must(admin, "mod_queue", {});
  assert(adminQueue.bookRequests?.some((b) => b.request === pendingRequest && b.book?.title === "A Missing Classic") && /decide_book_request/.test(adminQueue.next), `an admin's queue: ${JSON.stringify(adminQueue.bookRequests)}`);
  assert(adminQueue.waiting.bookRequests >= 1, "counted apart");
  assert(!(await must(moderator, "mod_queue", {})).bookRequests, "not in a moderator's");
  const decline = await must(asker, "post_explore_request", { kind: "book", language: "de", book: { title: "A Modern Bestseller", author: "Living Author" }, title: "A bestseller in German" });
  declinedRequest = decline.id;
  eq((await must(admin, "decide_book_request", { request: declinedRequest, decision: "decline", why: "Still under copyright: it can't go on the shelf." })).state, "declined", "declined");
  const declined = await okay(asker, "GET", `/api/community/requests/${declinedRequest}`);
  assert(declined.state === "declined" && /under copyright/.test(declined.stateNote), `its author sees why: ${JSON.stringify(declined)}`);
  await refused(asker, "POST", `/api/community/requests/${declinedRequest}/close`, { state: "open" }, 400, /stays declined/);
  // Not on the board, so nobody else can report it (a report would open it to a moderator).
  await refused(moderator, "POST", `/api/community/requests/${declinedRequest}/report`, { reason: "spam" }, 400, /no such request/);
  eq((await must(admin, "decide_book_request", { request: pendingRequest, decision: "open", why: "Public domain in the US and the EU." })).state, "open", "opened");
  assert((await okay(fan, "GET", "/api/community/requests?lang=nl&kind=book")).some((r) => r.id === pendingRequest && !r.book.onShelf && r.book.title === "A Missing Classic"), "on the board, its book not on the shelf yet");
  const early = await tool(admin, "decide_book_request", { request: pendingRequest, decision: "open", why: "On the shelf now.", book: "missing-classic" });
  assert(/no book "missing-classic" on the shelf yet/.test(early.error ?? ""), `naming a book that isn't there: ${JSON.stringify(early)}`);
  await shelve([{ id: "check-book", title: "The Check Book", layers: ["nl", "es"] }, { id: "missing-classic", title: "A Missing Classic", layers: [] }]);
  eq((await must(admin, "decide_book_request", { request: pendingRequest, decision: "open", why: "On the shelf now.", book: "missing-classic" })).book, "missing-classic", "its book named once it's there");
  const named = await okay(fan, "GET", `/api/community/requests/${pendingRequest}`);
  assert(named.state === "open" && named.book.id === "missing-classic" && named.book.onShelf && !named.book.layer, `named: ${JSON.stringify(named.book)}`);
  const notMod = await tool(moderator, "decide_book_request", { request: pendingRequest, decision: "decline", why: "no" });
  assert(notMod.error, "a moderator can't decide one");
  // Closed while waiting, then opened again by its author: it waits for an admin again, never straight onto the board.
  const waiting = (await okay(fan, "POST", "/api/community/requests", { kind: "book", language: "nl", book: { title: "Another Old Book" }, title: "Another Old Book in Dutch" })).id;
  eq((await okay(fan, "POST", `/api/community/requests/${waiting}/close`, { state: "closed" })).state, "closed", "closed while waiting");
  await refused(maker, "GET", `/api/community/requests/${waiting}`, undefined, 400, /no such request/);
  await refused(moderator, "POST", `/api/community/requests/${waiting}/report`, { reason: "spam" }, 400, /no such request/);
  assert(/no such case/.test((await tool(moderator, "mod_get", { request: waiting })).error ?? ""), "still no case for a moderator");
  const back = await okay(fan, "POST", `/api/community/requests/${waiting}/close`, { state: "open" });
  assert(back.state === "pending" && /waits for an admin again/.test(back.note ?? ""), `opened again: ${JSON.stringify(back)}`);
  assert(!(await okay(maker, "GET", "/api/community/requests?lang=nl&kind=book")).some((r) => r.id === waiting), "not on the board");
  // A moderator doesn't get an unreported request's case (a waiting one is an admin's); an admin does.
  assert(/no such case/.test((await tool(moderator, "mod_get", { request: waiting })).error ?? ""), "a moderator: no case without a report");
  eq((await must(admin, "mod_get", { request: waiting })).request.state, "pending", "an admin sees it");
  // Two decisions at once (each writes only on the state it read): one lands, the other is told why. (An open, then a
  // decline after it, may both land by design: an admin can decline an open request.)
  const both = await Promise.all([1, 2].map(() => tool(admin, "decide_book_request", { request: waiting, decision: "open", why: "Public domain." })));
  eq(both.filter((d) => !d.error).length, 1, `one decision lands: ${JSON.stringify(both)}`);
  assert(both.some((d) => /look at it again|open already/.test(d.error ?? "")), `the other told why: ${JSON.stringify(both)}`);
  // Two posts for one shelf book in one language at once: one lands.
  const pair = await Promise.all([fan, other].map((who) => app(who, "POST", "/api/community/requests", { kind: "book", language: "fr", book: "check-book", title: "The Check Book in French" })));
  eq(pair.filter((r) => r.status === 200).length, 1, `one lands: ${JSON.stringify(pair.map((r) => [r.status, r.body?.error]))}`);
  assert(pair.some((r) => r.status === 400 && /asked for (that book|The Check Book)/.test(r.body?.error ?? "")), "the other told to say me too");
  eq(sql("SELECT COUNT(*) AS n FROM requests WHERE kind = 'book' AND book_id = 'check-book' AND language = 'fr'")[0].n, 1, "one written");
  eq(sql(`SELECT COUNT(*) AS n FROM admin_log WHERE action LIKE 'request.book.%' AND target IN (${q(`request:${pendingRequest}`)}, ${q(`request:${declinedRequest}`)})`)[0].n, 3, "each decision logged");
});

let spam;
await stage("reports: three established accounts' hide it (its author sees why; nobody else sees, likes or answers it); the queue and its case; dismissed, it's back", async () => {
  spam = (await okay(other, "POST", "/api/community/requests", { kind: "pack", language: "nl", title: "Buy cheap watches here", details: "Visit my shop." })).id;
  await refused(other, "POST", `/api/community/requests/${spam}/report`, { reason: "spam" }, 400, /yours/);
  await refused(fan, "POST", `/api/community/requests/${spam}/report`, { reason: "copyright" }, 400, /copyright notice is about a shared pack/);
  for (const r of reporters) await okay(r, "POST", `/api/community/requests/${spam}/report`, { reason: "spam", details: "An ad." });
  const row = rowOf(spam);
  assert(row.shown === "hidden" && /Hidden after reports/.test(row.shown_reason), `hidden: ${JSON.stringify(row)}`);
  assert(!(await okay(fan, "GET", "/api/community/requests?lang=nl")).some((r) => r.id === spam), "off the board");
  await refused(fan, "GET", `/api/community/requests/${spam}`, undefined, 400, /no such request/);
  await refused(fan, "POST", `/api/community/requests/${spam}/like`, undefined, 400, /no such request/);
  await refused(maker, "POST", `/api/community/requests/${spam}/answers`, { item: makersPack }, 400, /no such request/);
  const theirs = await okay(other, "GET", `/api/community/requests/${spam}`);
  assert(theirs.shown === "hidden" && theirs.shownReason, `its author sees it, and why: ${JSON.stringify(theirs)}`);
  const cases = (await must(moderator, "mod_queue", {})).cases;
  assert(cases.some((c) => c.request === spam && c.kind === "request" && c.count === 3), `in the queue: ${JSON.stringify(cases)}`);
  const caseOf = await must(moderator, "mod_get", { request: spam });
  assert(caseOf.request.title === "Buy cheap watches here" && caseOf.reports.length === 3 && caseOf.author.requests >= 1, `its case: ${JSON.stringify(caseOf).slice(0, 300)}`);
  for (const r of caseOf.reports) await must(moderator, "mod_resolve", { report: r.id, decision: "dismiss", why: "Testing a dismissal." });
  eq(rowOf(spam).shown, "visible", "dismissed: back");
});

await stage("upheld, it's down for good; minors, hidden at once and an admin's; a moderator's hide lasts while a report is open, and restore", async () => {
  const report = await okay(fan, "POST", `/api/community/requests/${spam}/report`, { reason: "spam", details: "Still an ad." });
  assert(!report.hidden, "one report doesn't hide it");
  const hidden = await must(moderator, "mod_hide", { request: spam, why: "An ad, looking into it." });
  eq(hidden.shown, "hidden", "a moderator's hide");
  eq((await must(moderator, "mod_restore", { request: spam, why: "Restoring to test it." })).shown, "visible", "restored, its report dismissed");
  const again = await okay(maker, "POST", `/api/community/requests/${spam}/report`, { reason: "spam", details: "An ad." });
  await must(moderator, "mod_resolve", { report: again.id, decision: "uphold", why: "An ad." });
  const down = rowOf(spam);
  assert(down.shown === "removed" && /Taken down: An ad\./.test(down.shown_reason), `down for good: ${JSON.stringify(down)}`);
  assert((await tool(moderator, "mod_restore", { request: spam, why: "no" })).error, "a moderator can't put it back");
  const bad = (await okay(other, "POST", "/api/community/requests", { kind: "pack", language: "nl", title: "Something worse" })).id;
  const severe = await okay(fan, "POST", `/api/community/requests/${bad}/report`, { reason: "minors", details: "test" });
  assert(severe.hidden && rowOf(bad).shown === "hidden", "minors: hidden at once");
  const r = sql(`SELECT id, state FROM reports WHERE target_kind = 'request' AND target_id = ${q(bad)}`)[0];
  eq(r.state, "escalated", "escalated, an admin's");
  assert((await tool(moderator, "mod_resolve", { report: r.id, decision: "dismiss", why: "no" })).error, "a moderator can't settle it");
  await must(admin, "mod_resolve", { report: r.id, decision: "uphold", why: "Taken down." });
  eq(rowOf(bad).shown, "removed", "an admin upholds it");
});

await stage("the day's limits: a new account's 2 requests, then refused; 6 sent at once, 2 land; a new account's 10 answers a day", async () => {
  for (let i = 0; i < 2; i++) await okay(newcomer, "POST", "/api/community/requests", { kind: "pack", language: "nl", title: `Newcomer request ${i}` });
  await refused(newcomer, "POST", "/api/community/requests", { kind: "pack", language: "nl", title: "Newcomer request 3" }, 429, /2 requests in a day/);
  const burst = account("Req Burst", { ageDays: 1 });
  const all = await Promise.all(Array.from({ length: 6 }, (_, i) => app(burst, "POST", "/api/community/requests", { kind: "pack", language: "nl", title: `Burst request ${i}` })));
  eq(all.filter((r) => r.status === 200).length, 2, "2 land");
  assert(all.filter((r) => r.status !== 200).every((r) => r.status === 429), `the rest refused at the limit: ${all.map((r) => r.status)}`);
  eq(sql(`SELECT COUNT(*) AS n FROM requests WHERE author_id = ${q(burst.id)}`)[0].n, 2, "2 written");
  // Answers: a new account that answered 10 requests today (written here) is refused an 11th, and nothing is written.
  const answerer = account("Req New Answerer", { ageDays: 1 });
  const pack = (await okay(answerer, "POST", "/api/community/share", { pack: variant(NL, "newcomer") })).id;
  const now = Date.now();
  const asked = Array.from({ length: 11 }, (_, i) => `rqlim${run}${i}`);
  sql(
    [
      ...asked.map((id) => `INSERT INTO requests (id, kind, language, title, author_id, state, created_at, updated_at) VALUES (${q(id)}, 'pack', 'nl', 'Limit request', ${q(fan.id)}, 'open', ${now}, ${now})`),
      ...asked.slice(0, 10).map((id) => `INSERT INTO request_answers (request_id, item_id, by_id, created_at) VALUES (${q(id)}, ${q(pack)}, ${q(answerer.id)}, ${now})`),
    ].join("; "),
  );
  await refused(answerer, "POST", `/api/community/requests/${asked[10]}/answers`, { item: pack }, 429, /10 answers to requests in a day/);
  eq(sql(`SELECT COUNT(*) AS n FROM request_answers WHERE request_id = ${q(asked[10])}`)[0].n, 0, "no answer written");
  eq(sql(`SELECT answers, updated_at FROM requests WHERE id = ${q(asked[10])}`)[0], { answers: 0, updated_at: now }, "and the request as it was");
  // A pack request never waits for an admin: closed and opened again (one written without approved_at, as these were), it's open.
  eq((await okay(fan, "POST", `/api/community/requests/${asked[0]}/close`, { state: "closed" })).state, "closed", "closed");
  eq((await okay(fan, "POST", `/api/community/requests/${asked[0]}/close`, { state: "open" })).state, "open", "open again, not waiting");
});

await stage("crafted bodies on every route: a 400 in words, never a 500", async () => {
  const crafted = [
    ["POST", "/api/community/requests", '{"kind":{"toString":null},"language":"nl","title":"x"}'],
    ["POST", "/api/community/requests", '{"kind":"pack","language":["nl"],"title":"Dutch please"}'],
    ["POST", "/api/community/requests", '{"kind":"pack","language":"nl","title":{"toString":null}}'],
    ["POST", "/api/community/requests", '{"kind":"book","language":"es","title":"A book","book":{"title":{"toString":null}}}'],
    ["POST", "/api/community/requests", '{"kind":"book","language":"es","title":"A book","book":["check-book"]}'],
    ["POST", "/api/community/requests", '{"kind":"book","language":"es","title":"A book","book":{"title":"Real","author":7}}'],
    ["POST", "/api/community/requests", "not json"],
    ["POST", "/api/community/requests", "[1,2]"],
    ["POST", `/api/community/requests/${packRequest}/answers`, '{"item":{"toString":null}}'],
    ["POST", `/api/community/requests/${packRequest}/answers`, "null"],
    ["POST", `/api/community/requests/${packRequest}/close`, '{"state":{"toString":null}}'],
    ["POST", `/api/community/requests/${packRequest}/close`, '{"state":"closed","note":["x"]}'],
    ["POST", `/api/community/requests/${packRequest}/report`, '{"reason":{"toString":null}}'],
    ["POST", `/api/community/requests/${packRequest}/report`, `{"reason":"spam","details":"${"x".repeat(40000)}"}`],
  ];
  for (const [method, path, body] of crafted) {
    const r = await app(fan, method, path, body, { raw: true });
    assert(r.status === 400 && typeof r.body?.error === "string", `${method} ${path} ${body.slice(0, 60)}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  const big = await app(fan, "POST", "/api/community/requests", JSON.stringify({ kind: "pack", language: "nl", title: "Big", details: "x".repeat(200_000) }), { raw: true });
  eq(big.status, 400, "a body past its limit");
  for (const path of ["/api/community/requests?lang=en", "/api/community/requests?kind=text", "/api/community/requests?state=closed", "/api/community/requests/nope"]) {
    const r = await app(fan, "GET", path);
    assert(r.status === 400 && r.body?.error, `${path}: ${r.status}`);
  }
});

await stage("the export holds your requests; an account going takes its requests, their \"me too\"s and open reports; its own \"me too\"s leave others' counts; its answers stay", async () => {
  const exported = await okay(asker, "GET", "/api/me/export");
  assert(exported.requests.some((r) => r.id === packRequest && r.title === "Dutch for my trip"), "in the export");
  const leaving = account("Req Leaving");
  const theirs = (await okay(leaving, "POST", "/api/community/requests", { kind: "pack", language: "nl", title: "Leaving soon" })).id;
  await okay(fan, "POST", `/api/community/requests/${theirs}/like`);
  const open = await okay(maker, "POST", `/api/community/requests/${theirs}/report`, { reason: "other", details: "test" });
  await okay(leaving, "POST", `/api/community/requests/${packRequest}/like`);
  const before = rowOf(packRequest).likes;
  eq((await app(leaving, "DELETE", "/api/me", { confirm: "delete my account" })).status, 200, "it goes");
  eq(sql(`SELECT COUNT(*) AS n FROM requests WHERE id = ${q(theirs)}`)[0].n, 0, "its request went");
  eq(sql(`SELECT COUNT(*) AS n FROM likes WHERE target_kind = 'request' AND target_id = ${q(theirs)}`)[0].n, 0, "with its \"me too\"s");
  const settled = sql(`SELECT state, handled_note FROM reports WHERE id = ${q(open.id)}`)[0];
  assert(settled.state === "dismissed" && /account was deleted/.test(settled.handled_note), `its open report settled: ${JSON.stringify(settled)}`);
  eq(rowOf(packRequest).likes, before - 1, "its own \"me too\" left the count");
  eq((await app(maker, "DELETE", "/api/me", { confirm: "delete my account" })).status, 200, "the answerer goes");
  const still = await okay(fan, "GET", `/api/community/requests/${packRequest}`);
  assert(still.answeredBy.some((a) => a.item === makersPack && a.by === "a former member"), `its answer stays, by a former member: ${JSON.stringify(still.answeredBy)}`);
});

const passed = results.filter((r) => r.ok).length;
writeFileSync(join(OUT, "requests-check.json"), `${JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2)}\n`);
console.log(`requests check: ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
