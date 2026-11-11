#!/usr/bin/env node
// Explore (the community section) over HTTP, end to end, against a LOCAL server and its own state: the sharing terms,
// who may share (admins until COMMUNITY_SHARING is "everyone"), sharing from the app and through MCP, the duplicate
// check, browsing, search and filters, an item's page, follow and unfollow (the refs a device loads), likes (the app
// only), a new version and what it changed, removing followed sentences, metadata-only updates, withdrawing, Explore's
// sections and topics (admins), and what an account leaves behind when it's deleted.
//
//   node scripts/community-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
//
// The server: as for admin-check (app/AGENTS.md), on a fresh state. Accounts are written straight into its D1 and
// deleted through the API. Sandbox off (wrangler). Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { Agent, fetch as undiciFetch } from "undici";
import { dirname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
// Absolute, so files written here are found by commands run from the app's folder (wrangler, below).
const OUT = outArg && resolve(outArg);
// Resolved where it was typed: wrangler runs from the app's folder, where a relative path would make a state inside app/.
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST) {
  console.error("Usage: community-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
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
const log = [];
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
const eq = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), `${message}\n  got:  ${JSON.stringify(a)?.slice(0, 500)}\n  want: ${JSON.stringify(b)?.slice(0, 500)}`);

const wrangler = (args) => execFileSync("npx", ["wrangler", ...args], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
const sql = (command) => {
  const out = wrangler(["d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command]).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => (value === null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const run = randomBytes(3).toString("hex");
/** An account in D1: a session cookie and a personal token (with admin access for an admin); age in days. */
function account(name, { admin = false, ageDays = 0 } = {}) {
  const id = `cc${run}${randomBytes(5).toString("hex")}`;
  const now = Date.now();
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now - ageDays * 86400_000})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'community-check')`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'check', ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now}, ${admin ? 1 : 0})`,
      ...(admin ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, 'admin', ${now}, 'd1', 'community-check')`] : []),
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
async function app(who, method, path, body) {
  const response = await fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${who.cookie}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => null);
  log.push({ who: who.name, http: `${method} ${path}`, status: response.status });
  return { status: response.status, body: json };
}
/** Sends a pack through share_upload and its script, as an AI would; its sha256. */
async function stagePack(who, pack, name = "pack.json") {
  const text = JSON.stringify(pack);
  const sha = sha256(text);
  const staged = await must(who, "share_upload", { name, size: Buffer.byteLength(text), sha256: sha });
  if (staged.script) {
    const dir = mkdtempSync(join(tmpdir(), "community-check-"));
    writeFileSync(join(dir, name), text);
    writeFileSync(join(dir, "send.sh"), staged.script);
    execFileSync("sh", ["send.sh"], { cwd: dir });
    rmSync(dir, { recursive: true, force: true });
  }
  return sha;
}

const NL = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
const DE = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-de.json"), "utf8"));
const clone = (x) => structuredClone(x);
const SHARE_TOOLS = ["share_upload", "share_pack", "update_shared", "withdraw_shared", "my_shared"];

console.log(`community check: ${BASE}`);
const admin = account("Check Marlow", { admin: true, ageDays: 30 });
const learner = account("Check Learner", { ageDays: 30 });
const newcomer = account("Check Newcomer", { ageDays: 0 });
const second = account("Check Kestrel", { admin: true, ageDays: 30 });

// This server's COMMUNITY_SHARING, as a learner's tools show it ("everyone" unless started with --var COMMUNITY_SHARING:admins).
let openToEveryone = false;
await stage("who sees what: everyone finds and follows; sharing tools for everyone, or only for an admin while sharing is admins-only", async () => {
  const [a, l] = await Promise.all([toolNames(admin), toolNames(learner)]);
  for (const name of ["explore_search", "explore_get", "follow", "unfollow"]) assert(a.includes(name) && l.includes(name), `${name} for everyone`);
  openToEveryone = SHARE_TOOLS.every((name) => l.includes(name));
  for (const name of SHARE_TOOLS) assert(a.includes(name) && (openToEveryone || !l.includes(name)), `${name}: all of them, or an admin's only`);
  for (const name of ["explore_sections", "explore_topics"]) assert(a.includes(name) && !l.includes(name), `${name}: an admin's only`);
  assert(!a.some((n) => /like/.test(n)), "no tool likes anything");
});

await stage("sharing needs the terms, accepted in the app; then an admin shares from the app", async () => {
  const before = await app(admin, "POST", "/api/community/share", { pack: NL, level: "A1", topics: ["food"] });
  eq(before.status, 403, "before the terms");
  assert(/sharing terms/.test(before.body.error) && /#explore\/terms/.test(before.body.error), `it says where to accept them: ${before.body.error}`);
  const terms = await app(admin, "GET", "/api/community/terms");
  eq([terms.body.accepted, terms.body.licence], [false, "CC BY-SA 4.0"], "the terms, unaccepted");
  eq((await app(admin, "POST", "/api/community/terms", { version: 99 })).status, 400, "an old version of the terms");
  eq((await app(admin, "POST", "/api/community/terms", { version: terms.body.version })).body.accepted, true, "accepted");
  // Its cover: one of the drawings its topics offer (pack-format.js coverChoices), never any picture, never one of Lexicommons' own packs'.
  for (const [cover, topics, why] of [["pizza", ["food"], "the topic's own picture"], ["egg", ["food"], "a pack of Lexicommons' own's"], ["milk", [], "with no topic"], ["../x", ["food"], "not a drawing"]]) {
    const refused = await app(admin, "POST", "/api/community/share", { pack: NL, level: "A1", topics, cover });
    assert(refused.status === 422 && refused.body.errors?.some((e) => e.at === "cover"), `a cover ${why} (${cover}) refused: ${refused.status} ${JSON.stringify(refused.body).slice(0, 200)}`);
  }
  const shared = await app(admin, "POST", "/api/community/share", { pack: NL, level: "A1", topics: ["food"], cover: "milk", note: "the first share" });
  eq(shared.status, 200, `shared: ${JSON.stringify(shared.body).slice(0, 300)}`);
  eq(shared.body.id, NL.id, "under its own id");
  eq((await app(admin, "GET", `/api/community/items/${NL.id}`)).body.item.cover, "milk", "its cover, kept");
  assert(/^[0-9a-f]{12}$/.test(shared.body.version), "a version named by its content");
  return { id: shared.body.id, version: shared.body.version };
});

await stage("a learner: with the terms accepted, shares when sharing is open to everyone, and is told so when it's admins-only", async () => {
  await app(learner, "POST", "/api/community/terms", { version: 1 });
  // Its own words (the same pack twice is refused), and withdrawn again, so what follows is as it would be.
  const own = clone(DE);
  own.items[0].means = `${own.items[0].means} (a learner's)`;
  const tried = await app(learner, "POST", "/api/community/share", { pack: { ...own, id: "learner-de" } });
  if (openToEveryone) {
    eq(tried.status, 200, `a learner's share: ${JSON.stringify(tried.body).slice(0, 300)}`);
    eq((await app(learner, "POST", `/api/community/items/${tried.body.item?.id ?? tried.body.id ?? "learner-de"}/withdraw`, {})).status, 200, "withdrawing it");
    return "open to everyone: shared";
  }
  eq(tried.status, 403, "a learner's share");
  assert(/opens to everyone soon/.test(tried.body.error), tried.body.error);
  return "admins only: refused";
});

await stage("the same pack again is refused: as an update of yours, and as a duplicate of another's", async () => {
  const again = await app(admin, "POST", "/api/community/share", { pack: NL });
  eq(again.status, 422, "the same source pack");
  assert(/shared this pack already/.test(again.body.errors[0].message), again.body.errors[0].message);
  const copy = await app(admin, "POST", "/api/community/share", { pack: { ...clone(NL), id: "renamed-copy", name: "A renamed copy" } });
  eq(copy.status, 422, "the same content under another id and name");
  assert(/same pack as "A check pack \(Dutch\)"/.test(copy.body.errors[0].message), copy.body.errors[0].message);
});

await stage("a broken pack comes back with every problem at once", async () => {
  const broken = clone(DE);
  broken.id = "broken-de";
  broken.items[0].words = [];
  broken.items[1].means = "";
  delete broken.from;
  const result = await app(admin, "POST", "/api/community/share", { pack: broken, level: "Z9", topics: ["nope"] });
  eq(result.status, 422, "refused");
  const at = result.body.errors.map((e) => e.at);
  for (const where of ["level", "topics", "from"]) assert(at.includes(where), `a problem at ${where}: ${at.join(", ")}`);
  assert(at.some((a) => a.startsWith("items[0]")), "and at the first item");
  return { errors: result.body.errors.length };
});

let deSha;
await stage("an admin's AI shares through MCP: share_upload, its script, share_pack", async () => {
  deSha = await stagePack(admin, DE, "check-de.json");
  const shared = await must(admin, "share_pack", { file: deSha, level: "A1", topics: ["everyday", "grammar"] });
  assert(shared.shared === true && shared.id === DE.id, `share_pack: ${JSON.stringify(shared).slice(0, 300)}`);
  const again = await tool(admin, "share_pack", { file: deSha });
  assert(again.error && /No staged pack/.test(again.error), "the staged copy is used up once shared");
});

await stage("a pack whose id someone else already has is shared under a suffixed id", async () => {
  await app(second, "POST", "/api/community/terms", { version: 1 });
  const pack = clone(DE);
  pack.id = NL.id; // taken
  pack.name = "Another German check";
  pack.items = pack.items.map((item) => ({ ...item, means: `${item.means} (again)` }));
  const result = await app(second, "POST", "/api/community/share", { pack });
  eq(result.status, 200, `shared: ${JSON.stringify(result.body).slice(0, 300)}`);
  assert(new RegExp(`^${NL.id}-[0-9a-f]{6}$`).test(result.body.id), `a suffixed id: ${result.body.id}`);
  assert(/was taken in Explore/.test(result.body.notes[0]), "and says so");
  return { id: result.body.id };
});

await stage("browsing: by language, level, topic, search and sort; withdrawn and other languages left out", async () => {
  const nl = (await app(learner, "GET", "/api/community/items?lang=nl")).body.items.map((i) => i.id);
  eq(nl, [NL.id], "Dutch packs");
  const de = (await app(learner, "GET", "/api/community/items?lang=de&sort=new")).body.items;
  eq(de.length, 2, "German packs");
  assert(de[0].sharedAt >= de[1].sharedAt, "newest first");
  eq((await app(learner, "GET", "/api/community/items?lang=de&topic=grammar")).body.items.map((i) => i.id), [DE.id], "by topic");
  eq((await app(learner, "GET", "/api/community/items?level=A1&lang=nl")).body.items.length, 1, "by level");
  eq((await app(learner, "GET", "/api/community/items?q=MARLOW german")).body.items.map((i) => i.id), [DE.id], "search by who shared it and words, any case");
  eq((await app(learner, "GET", "/api/community/items?q=kestrel")).body.items.map((i) => i.title), ["Another German check"], "by another's name");
  eq((await app(learner, "GET", "/api/community/items?q=d%C3%BAtch")).body.items.map((i) => i.id), [NL.id], "search ignores accents");
  eq((await app(learner, "GET", "/api/community/items?q=nothing-like-this")).body.items.length, 0, "no match");
  const viaMcp = await must(learner, "explore_search", { language: "nl" });
  eq(viaMcp.items.map((i) => i.id), [NL.id], "explore_search finds the same");
  // A code with a script (zh-Hant: lang/index.js LANGUAGE_CODE) is a language to search: nothing shared in it here.
  eq((await must(learner, "explore_search", { language: "zh-Hant" })).items, [], "explore_search takes zh-Hant");
  // Packs per language, for the language picker: what browsing each language finds, the most first.
  const languages = (await app(learner, "GET", "/api/community/languages")).body;
  eq(languages, [{ lang: "de", packs: 2 }, { lang: "nl", packs: 1 }], "packs per language");
  eq((await fetch(`${BASE}/api/community/languages`)).status, 401, "signed in only");
  assert((await must(learner, "explore_search", {})).topics.length >= 10, "with no filters it lists the topics");
});

await stage("an item's page: who, level, topics, counts, a sample with the literal line, its versions", async () => {
  const page = (await app(learner, "GET", `/api/community/items/${NL.id}`)).body;
  eq([page.item.by, page.item.level, page.item.topics.map((t) => t.id), page.item.licence], ["Check Marlow", "A1", ["food"], "CC BY-SA 4.0"], "the item");
  eq(page.sample.length, NL.items.length, "a sample of its sentences");
  // The grammar it teaches: every pattern its sentences use, its own and the catalog's (it defines one, uses two).
  const used = new Set(NL.items.flatMap((i) => (i.concepts ?? []).map((p) => p.replace(/^p:/, "")))).size;
  eq(page.item.badges.patterns, used, "patterns: the ones its sentences use");
  assert(page.sample[0].sentence.startsWith("Het meisje speelt") && page.sample[0].literal && page.sample[0].natural, "each with its literal line and natural line");
  eq(page.versions.map((v) => v.seq), [1], "one version");
  eq((await app(learner, "GET", "/api/community/items/no-such-pack")).status, 404, "a pack that isn't there");
});

let version1;
await stage("follow: the ref a device loads, the following list, the counts (popular counts established accounts)", async () => {
  const followed = await app(learner, "POST", `/api/community/items/${NL.id}/follow`);
  eq(followed.status, 200, "followed");
  version1 = followed.body.version;
  const ref = { id: NL.id, version: version1, url: `/library/packs/${NL.id}/${version1}/pack.json`, corrections: "published" };
  eq(followed.body, ref, "the ref (what study/packs.js followPack takes: id, version, and the url that version lives at)");
  eq((await app(learner, "GET", "/api/community/following")).body, [ref], "the following list");
  eq((await fetch(`${BASE}${ref.url}`)).status, 200, "the url serves that version");
  await must(newcomer, "follow", { id: NL.id });
  const item = (await app(learner, "GET", `/api/community/items/${NL.id}`)).body.item;
  eq([item.follows, item.following], [2, true], "two followers, and the learner is one");
  eq(sql(`SELECT popular FROM items WHERE id = ${q(NL.id)}`)[0].popular, 1, "popular counts the 30-day-old account, not the new one");
  const twice = await app(learner, "POST", `/api/community/items/${NL.id}/follow`);
  eq(twice.status, 200, "following twice is fine");
  eq((await app(learner, "GET", `/api/community/items/${NL.id}`)).body.item.follows, 2, "and counts once");
});

await stage("likes, from the app: one per account, and undone", async () => {
  eq((await app(learner, "POST", `/api/community/items/${NL.id}/like`)).body, { id: NL.id, liked: true, likes: 1 }, "liked");
  eq((await app(learner, "POST", `/api/community/items/${NL.id}/like`)).body.likes, 1, "twice counts once");
  eq((await app(newcomer, "POST", `/api/community/items/${NL.id}/like`)).body.likes, 2, "a second account");
  eq((await app(newcomer, "DELETE", `/api/community/items/${NL.id}/like`)).body.likes, 1, "undone");
  eq(sql(`SELECT popular FROM items WHERE id = ${q(NL.id)}`)[0].popular, 2, "popular: the established follower and like");
});

await stage("a new version: what it changed, the followers' refs move to it; removing followed sentences needs confirming", async () => {
  const changed = clone(NL);
  changed.items[1].means = `${changed.items[1].means} (fixed)`;
  const updated = await app(admin, "POST", `/api/community/items/${NL.id}/update`, { pack: changed, note: "a fix" });
  eq(updated.status, 200, `updated: ${JSON.stringify(updated.body).slice(0, 300)}`);
  eq(updated.body.changes.changed, [NL.items[1].id], "one sentence changed");
  eq(updated.body.changes.removed, [], "none removed");
  assert(updated.body.version !== version1, "a new version");
  eq((await app(learner, "GET", "/api/community/following")).body[0].version, updated.body.version, "the follower's ref moved on");
  const fewer = clone(changed);
  fewer.items.pop();
  const refused = await app(admin, "POST", `/api/community/items/${NL.id}/update`, { pack: fewer });
  eq(refused.status, 422, "removing a followed sentence");
  assert(/confirm_removed/.test(refused.body.errors[0].message), refused.body.errors[0].message);
  const confirmed = await app(admin, "POST", `/api/community/items/${NL.id}/update`, { pack: fewer, confirmRemoved: true });
  eq(confirmed.body.changes.removed, [NL.items[2].id], "confirmed");
  const same = await app(admin, "POST", `/api/community/items/${NL.id}/update`, { pack: fewer });
  assert(same.status === 422 && /nothing changed/.test(same.body.errors[0].message), "the same version again");
  const page = (await app(learner, "GET", `/api/community/items/${NL.id}`)).body;
  eq(page.versions.map((v) => v.seq), [3, 2, 1], "three versions, newest first");
  eq(page.versions[1].note, "a fix", "with their notes");
});

await stage("metadata alone: level and topics change with no new version; a learner can't change another's", async () => {
  const before = (await app(learner, "GET", `/api/community/items/${NL.id}`)).body.item.version;
  const meta = await app(admin, "POST", `/api/community/items/${NL.id}/update`, { level: "A2", topics: ["food", "everyday"] });
  eq([meta.status, meta.body.newVersion], [200, false], "metadata updated");
  const item = (await app(learner, "GET", `/api/community/items/${NL.id}`)).body.item;
  eq([item.level, item.topics.map((t) => t.id), item.version], ["A2", ["food", "everyday"], before], "level and topics, same version");
  const theirs = await app(learner, "POST", `/api/community/items/${NL.id}/update`, { level: "C2" });
  assert(theirs.status === 403 || theirs.status === 400, `a learner changing another's pack: ${theirs.status}`);
});

await stage("Explore's sections and topics, curated by an admin over MCP", async () => {
  const refused = await tool(learner, "explore_sections", { sections: [] });
  assert(refused.error, "a learner can't");
  const unknown = await tool(admin, "explore_sections", { sections: [{ title: "Start here", items: ["no-such-item"] }] });
  assert(unknown.error && /isn't an item/.test(unknown.error), unknown.error);
  const set = await must(admin, "explore_sections", { sections: [{ title: "Start here", items: [NL.id, DE.id] }] });
  eq(set.sections[0].id, "start-here", "a section id from its title");
  const home = (await app(learner, "GET", "/api/community/explore?lang=nl")).body;
  eq(home.sections.map((s) => [s.title, s.items.map((i) => i.id)]), [["Start here", [NL.id]]], "the section, for the language browsed");
  eq(home.popular[0].id, NL.id, "then popular");
  const topics = (await must(admin, "explore_topics", {})).topics;
  const renamed = await must(admin, "explore_topics", { topics: topics.map((t) => (t.id === "food" ? { ...t, name: "Eating and drinking" } : t)) });
  eq(renamed.topics.find((t) => t.id === "food").name, "Eating and drinking", "a topic renamed");
  const removed = await tool(admin, "explore_topics", { topics: renamed.topics.filter((t) => t.id !== "food") });
  assert(removed.error && /"food" is used by 1 item/.test(removed.error), `a topic in use can't go: ${removed.error}`);
});

await stage("withdrawn: gone from Explore, still in its followers' list (they keep it)", async () => {
  await app(learner, "POST", `/api/community/items/${DE.id}/follow`);
  const withdrawn = await must(admin, "withdraw_shared", { id: DE.id });
  eq(withdrawn.state, "withdrawn", "withdrawn");
  const listed = (await app(learner, "GET", "/api/community/items?lang=de")).body.items;
  assert(!listed.some((i) => i.id === DE.id), "not listed");
  eq((await app(learner, "GET", "/api/community/languages")).body.find((l) => l.lang === "de")?.packs ?? 0, listed.length, "not counted");
  assert((await app(learner, "GET", "/api/community/following")).body.some((r) => r.id === DE.id), "its follower keeps its ref");
  const follow = await app(newcomer, "POST", `/api/community/items/${DE.id}/follow`);
  eq(follow.status, 400, "nobody new can follow it");
  eq((await must(admin, "my_shared", {})).find((i) => i.id === DE.id).state, "withdrawn", "my_shared shows it as withdrawn");
});

await stage("an account deleted: its follows and likes leave the counts; what it shared stays, by a former member", async () => {
  eq((await app(newcomer, "GET", "/api/community/items?q=marlow")).body.items.length, 1, "before: found by its sharer's name");
  eq((await app(learner, "DELETE", "/api/me", { confirm: "delete my account" })).status, 200, "the learner deleted");
  const item = (await app(newcomer, "GET", `/api/community/items/${NL.id}`)).body.item;
  eq([item.follows, item.likes], [1, 0], "the learner's follow and like are gone from the counts");
  eq((await app(admin, "DELETE", "/api/me", { confirm: "delete my account" })).status, 200, "the curator deleted");
  const after = (await app(newcomer, "GET", `/api/community/items/${NL.id}`)).body.item;
  eq(after.by, "a former member", "what they shared stays, by a former member");
  eq((await app(newcomer, "GET", "/api/community/items?q=marlow")).body.items.length, 0, "their name has left the search");
  eq((await app(newcomer, "GET", "/api/community/items?q=dutch")).body.items.map((i) => i.id), [NL.id], "the pack itself is still found");
});

for (const who of [newcomer, second]) await app(who, "DELETE", "/api/me", { confirm: "delete my account" });
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "community-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.length - failed.length, total: results.length, results, calls: log }, null, 2) + "\n");
console.log(`community check: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
