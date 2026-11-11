#!/usr/bin/env node
// Moderation in Explore, end to end over HTTP, against a LOCAL server with COMMUNITY_SHARING "everyone" and its own
// state: everyone sharing; who sees which tools (a learner reports; a moderator works the queue over an admin-access
// token; an admin bans); the hide rules (three established reporters; a copyright notice, complete and from the app,
// at once; minors at once, and an admin's to settle); what hidden means (not listed, not served, out of followers'
// lists, still its owner's to see); the queue, a case, resolving, escalating, a counter-notice; three copyright strikes
// stopping an account sharing; bans; the daily limits; the zero-token pending check; the policy; the admin log.
//
//   node scripts/moderation-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
//
// The server: as for admin-check (app/AGENTS.md), on a fresh state, with --var COMMUNITY_SHARING:everyone. Sandbox off.
// Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Agent, fetch as undiciFetch } from "undici";
import { dirname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
// Absolute, so files written here are found by commands run from the app's folder (wrangler, below).
const OUT = outArg && resolve(outArg);
const PERSIST = argv.includes("--persist-to") ? argv[argv.indexOf("--persist-to") + 1] : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST) {
  console.error("Usage: moderation-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
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
const eq = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), `${message}\n  got:  ${JSON.stringify(a)?.slice(0, 400)}\n  want: ${JSON.stringify(b)?.slice(0, 400)}`);

const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const run = randomBytes(3).toString("hex");
function account(name, { role = null, ageDays = 30, tokenAdmin = false } = {}) {
  const id = `mc${run}${randomBytes(5).toString("hex")}`;
  const now = Date.now();
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  const plain = `lct_${randomBytes(24).toString("base64url")}`;
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now - ageDays * 86400_000})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'moderation-check')`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'check', ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now}, ${tokenAdmin ? 1 : 0})`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'plain', ${q(sha256(plain))}, ${q(plain.slice(0, 10))}, ${now}, 0)`,
      `INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${q(id)}, 1, ${now})`,
      ...(role ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, ${q(role)}, ${now}, 'd1', 'moderation-check')`] : []),
    ].join("; "),
  );
  return { id, name, cookie, token, plain };
}
async function rpc(token, method, params) {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const line = (await response.text()).split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status}`);
  return JSON.parse(line.slice(6));
}
const toolNames = async (token) => (await rpc(token, "tools/list", {})).result.tools.map((t) => t.name);
async function tool(who, name, args = {}, { token } = {}) {
  const { result, error } = await rpc(token ?? who.token, "tools/call", { name, arguments: args });
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
const NL = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
let n = 0;
/** A pack of its own content (so never a duplicate), shared by `who` from the app. */
async function share(who, title) {
  n++;
  const pack = structuredClone(NL);
  pack.id = `mod-${run}-${n}`;
  pack.name = title;
  pack.items = pack.items.map((item) => ({ ...item, means: `${item.means} (${n})` }));
  const shared = await app(who, "POST", "/api/community/share", { pack, level: "A1", topics: ["everyday"] });
  assert(shared.status === 200, `sharing ${title}: ${JSON.stringify(shared.body).slice(0, 300)}`);
  return { ...shared.body, pack };
}
const stateOf = (id) => sql(`SELECT state, state_reason FROM items WHERE id = ${q(id)}`)[0];
const NOTICE = { name: "A Rights Holder", contact: "rights@example.org", work: "My Dutch textbook, chapter 2", statement: true };

console.log(`moderation check: ${BASE}`);
const admin = account("Mod Admin", { role: "admin", tokenAdmin: true });
const moderator = account("Mod Moderator", { role: "moderator", tokenAdmin: true });
const owner = account("Mod Owner");
const reporters = [account("Mod Reporter A"), account("Mod Reporter B"), account("Mod Reporter C")];
const newcomer = account("Mod Newcomer", { ageDays: 0 });
const follower = account("Mod Follower");
const odd = account("Mod Odd Fields");
// A second owner, so the stages after the first ones stay inside one account's 10 shares a day.
const owner2 = account("Mod Owner Two");
const owner4 = account("Mod Owner Four");

await stage("everyone shares now: a learner's pack goes live at once", async () => {
  const shared = await share(owner, "An owner's pack");
  eq(stateOf(shared.id).state, "live", "live");
  assert((await app(follower, "GET", "/api/community/items?lang=nl")).body.items.some((i) => i.id === shared.id), "listed");
});

await stage("who sees which tools: report for everyone; the queue for a moderator's admin-access token; bans for an admin", async () => {
  const [learnerTools, modTools, modPlain, adminTools] = await Promise.all([toolNames(owner.token), toolNames(moderator.token), toolNames(moderator.plain), toolNames(admin.token)]);
  assert(learnerTools.includes("report") && !learnerTools.some((t) => t.startsWith("mod_")), "a learner: report only");
  for (const t of ["moderation_policy", "mod_queue", "mod_get", "mod_hide", "mod_restore", "mod_resolve", "mod_escalate"]) assert(modTools.includes(t) && adminTools.includes(t), `${t} for a moderator and an admin`);
  assert(!modTools.includes("mod_ban") && adminTools.includes("mod_ban") && adminTools.includes("mod_unban"), "bans: an admin's only");
  assert(!modPlain.some((t) => t.startsWith("mod_")), "a moderator's token without admin access: no moderation tools");
  assert(!modTools.includes("library_publish"), "a moderator doesn't get the library");
  const made = await app(moderator, "POST", "/api/tokens", { name: "the monitoring agent", admin: true });
  eq(made.status, 200, "a moderator can make an admin-access token (the agent's)");
});

let abuseItem;
await stage("abuse: hidden once three established accounts report it (a new account's report doesn't count); one each", async () => {
  abuseItem = (await share(owner, "A pack to report for abuse")).id;
  const one = await app(reporters[0], "POST", `/api/community/items/${abuseItem}/report`, { reason: "abuse", details: "insults in the sentences" });
  eq([one.status, one.body.hidden], [200, false], "one report: still up");
  eq((await app(reporters[0], "POST", `/api/community/items/${abuseItem}/report`, { reason: "abuse" })).status, 400, "the same reporter again");
  await app(newcomer, "POST", `/api/community/items/${abuseItem}/report`, { reason: "abuse" });
  await app(reporters[1], "POST", `/api/community/items/${abuseItem}/report`, { reason: "abuse" });
  eq(stateOf(abuseItem).state, "live", "two established plus a newcomer: still up");
  const third = await must(reporters[2], "report", { id: abuseItem, reason: "abuse", details: "through my AI" });
  assert(third.hidden, "the third established report hides it");
  eq(stateOf(abuseItem).state, "hidden", "hidden");
  eq((await app(owner, "POST", `/api/community/items/${abuseItem}/report`, { reason: "spam" })).status, 400, "an owner can't report their own");
});

await stage("hidden means: not listed, not served, out of its followers' list; its owner still sees it, and why", async () => {
  const item = (await share(owner, "A pack people follow")).id;
  const ref = (await app(follower, "POST", `/api/community/items/${item}/follow`)).body;
  eq((await fetch(`${BASE}${ref.url}`)).status, 200, "served while live");
  eq((await fetch(`${BASE}${ref.url}`)).headers.get("cache-control"), "private, max-age=86400", "and cached privately, for a day");
  const unreported = await tool(moderator, "mod_hide", { id: item, why: "checking it" });
  assert(unreported.error && /report it first/.test(unreported.error), `nothing reported, no hide: ${unreported.error}`);
  await app(reporters[0], "POST", `/api/community/items/${item}/report`, { reason: "other", details: "is this right?" });
  await must(moderator, "mod_hide", { id: item, why: "checking it" });
  assert(!(await app(follower, "GET", "/api/community/items?lang=nl")).body.items.some((i) => i.id === item), "not listed");
  eq((await fetch(`${BASE}${ref.url}`)).status, 404, "not served");
  assert(!(await app(follower, "GET", "/api/community/following")).body.some((r) => r.id === item), "out of the follower's list (devices drop it)");
  eq((await app(follower, "GET", "/api/community/following/down")).body.filter((r) => r.id === item).map((r) => r.state), ["hidden"], "and in their list of what's down, for Explore's home to say why");
  eq((await app(follower, "GET", `/api/community/items/${item}`)).status, 404, "others can't open it");
  const own = (await app(owner, "GET", `/api/community/items/${item}`)).body.item;
  assert(own.state === "hidden" && /Hidden by a moderator: checking it/.test(own.stateReason), `its owner sees it, and why: ${JSON.stringify(own)}`);
  await must(moderator, "mod_restore", { id: item, why: "fine" });
  eq((await fetch(`${BASE}${ref.url}`)).status, 200, "restored: served again");
  assert(!(await app(follower, "GET", "/api/community/following/down")).body.some((r) => r.id === item), "and no longer down");
});

let copyrightItem;
await stage("copyright: a notice only from the app, only complete; a complete one hides at once", async () => {
  copyrightItem = (await share(owner, "A pack with someone's sentences")).id;
  const viaAi = await tool(reporters[0], "report", { id: copyrightItem, reason: "copyright" });
  assert(viaAi.error, "report over MCP doesn't take copyright");
  const incomplete = await app(reporters[0], "POST", `/api/community/items/${copyrightItem}/report`, { reason: "copyright", notice: { name: "X" } });
  assert(incomplete.status === 400 && /how to reach you, the work it copies, the statement/.test(incomplete.body.error), `an incomplete notice: ${incomplete.body.error}`);
  const complete = await app(reporters[0], "POST", `/api/community/items/${copyrightItem}/report`, { reason: "copyright", notice: NOTICE });
  eq(complete.body.hidden, true, "a complete notice: hidden at once");
  eq(stateOf(copyrightItem).state_reason, "Hidden after a copyright notice.", "why");
});

let minorsItem;
await stage("minors: hidden at once and escalated; a moderator can't restore or dismiss it, an admin can", async () => {
  minorsItem = (await share(owner, "A pack reported as harmful")).id;
  const reported = await app(newcomer, "POST", `/api/community/items/${minorsItem}/report`, { reason: "minors", details: "test" });
  eq(reported.body.hidden, true, "hidden at once, even from a new account");
  const queue = await must(moderator, "mod_queue", {});
  assert(!queue.cases.some((c) => c.item === minorsItem), "escalated: not in a moderator's queue");
  assert((await must(admin, "mod_queue", {})).cases.some((c) => c.item === minorsItem && c.severity === 3), "an admin's, at the top");
  const restore = await tool(moderator, "mod_restore", { id: minorsItem, why: "looks fine" });
  assert(restore.error && /admin's to settle/.test(restore.error), `a moderator can't restore it: ${restore.error}`);
  const report = (await must(admin, "mod_get", { id: minorsItem })).reports[0];
  const resolved = await must(admin, "mod_resolve", { report: report.id, decision: "dismiss", why: "a test report" });
  eq(resolved.itemState, "live", "an admin dismissing it puts it back");
});

await stage("the queue and a case: oldest and worst first, the reports with their ids, the owner's record", async () => {
  const queue = await must(moderator, "mod_queue", {});
  assert(queue.waiting.open >= 2, `waiting: ${JSON.stringify(queue.waiting)}`);
  const c = queue.cases.find((x) => x.item === copyrightItem);
  assert(c && c.reasons.includes("copyright") && c.severity === 2, "the copyright case");
  assert(queue.cases.findIndex((x) => x.item === copyrightItem) < queue.cases.findIndex((x) => x.item === abuseItem), "copyright before abuse");
  const detail = await must(moderator, "mod_get", { id: abuseItem });
  eq(detail.reports.length, 4, "four reports on it");
  assert(detail.owner.name === "Mod Owner" && detail.owner.accountDays >= 29 && !("id" in detail.owner), "the owner's record, without their id (an admin's)");
  assert(detail.item.sample.length === 3, "a sample to judge by");
  const notice = (await must(moderator, "mod_get", { id: copyrightItem })).reports[0].notice;
  eq(notice, { work: NOTICE.work, filed: "complete" }, "a moderator sees the work, not the rights holder's details");
  eq((await must(admin, "mod_get", { id: copyrightItem })).reports[0].notice.contact, NOTICE.contact, "an admin sees them");
});

await stage("resolving: upheld takes it down for good; a dismissed report puts a hidden item back once the rest no longer hold it", async () => {
  // Hidden by three established accounts, with a newcomer's report beside them.
  const open = (await must(moderator, "mod_get", { id: abuseItem })).reports.filter((r) => r.state === "open");
  const newcomers = open.filter((r) => r.reporterAccountDays === 0);
  const established = open.filter((r) => r.reporterAccountDays >= 7);
  eq([newcomers.length, established.length], [1, 3], "a newcomer's report and three established ones");
  await must(moderator, "mod_resolve", { report: newcomers[0].id, decision: "dismiss", why: "not abuse" });
  eq(stateOf(abuseItem).state, "hidden", "the newcomer's dismissed: the three established still hold it");
  await must(moderator, "mod_resolve", { report: established[0].id, decision: "dismiss", why: "not abuse" });
  eq(stateOf(abuseItem).state, "live", "two established left: back up");
  await must(moderator, "mod_resolve", { report: established[1].id, decision: "dismiss", why: "not abuse" });
  const last = await must(moderator, "mod_resolve", { report: established[2].id, decision: "uphold", why: "it is abuse after all" });
  eq([last.itemState, stateOf(abuseItem).state], ["removed", "removed"], "upheld: taken down");
  eq((await must(moderator, "mod_get", { id: abuseItem })).item.stateReason, "Taken down: it is abuse after all", "with why");
});

await stage("taken down for good: a moderator can't put it back; its owner can answer once; an admin can restore it", async () => {
  const restore = await tool(moderator, "mod_restore", { id: abuseItem, why: "changed my mind" });
  assert(restore.error && /only an admin puts it back/.test(restore.error), `a moderator can't: ${restore.error}`);
  const filed = await app(owner, "POST", `/api/community/items/${abuseItem}/counter-notice`, { statement: "These sentences are not insults: they are ordinary Dutch.", name: "Mod Owner", email: "owner@example.org" });
  eq(filed.status, 200, `the owner answers the upheld report: ${JSON.stringify(filed.body)}`);
  const counter = (await must(admin, "mod_get", { id: abuseItem })).counterNotices.at(-1);
  await must(admin, "mod_resolve", { counter_notice: counter.id, decision: "dismiss", why: "the sentences are insults" });
  eq(stateOf(abuseItem).state, "removed", "dismissed: still down");
  const again = await app(owner, "POST", `/api/community/items/${abuseItem}/counter-notice`, { statement: "Please look again, these are ordinary sentences.", name: "Mod Owner", email: "owner@example.org" });
  assert(again.status === 400 && /filed already, and settled/.test(again.body.error), `once per report: ${JSON.stringify(again.body)}`);
  await must(admin, "mod_restore", { id: abuseItem, why: "an admin's override, for the check" });
  eq(stateOf(abuseItem).state, "live", "an admin puts it back");
});

await stage("the library's own packs: a report never hides one; it goes to an admin, who takes it off with library_unpublish", async () => {
  // A default pack's row as syncLibraryIndex writes it (admin-check publishes one through the tools).
  const id = `lib-${run}`;
  const now = Date.now();
  sql(`INSERT INTO items (id, kind, owner_id, curated, title, language, from_lang, licence, head_version, content_hash, search, created_at, updated_at) VALUES (${q(id)}, 'pack', NULL, 1, 'A library pack', 'nl', 'en', 'CC BY-SA 4.0', 'v1', ${q(`library-${run}`)}, 'a library pack lexicommons', ${now}, ${now})`);
  const minors = await app(newcomer, "POST", `/api/community/items/${id}/report`, { reason: "minors", details: "test" });
  assert(minors.status === 200 && minors.body.hidden === false && /with an admin/.test(minors.body.note), `minors: not hidden, with an admin: ${JSON.stringify(minors.body)}`);
  const copyright = await app(reporters[0], "POST", `/api/community/items/${id}/report`, { reason: "copyright", notice: NOTICE });
  eq(copyright.body.hidden, false, "a complete copyright notice doesn't hide it either");
  for (const r of [reporters[1], reporters[2], follower]) await app(r, "POST", `/api/community/items/${id}/report`, { reason: "abuse" });
  eq(stateOf(id).state, "live", "three established abuse reports: still live");
  assert(!(await must(moderator, "mod_queue", {})).cases.some((c) => c.item === id), "not in a moderator's queue");
  assert((await must(admin, "mod_queue", {})).cases.some((c) => c.item === id), "in an admin's");
  for (const who of [moderator, admin]) {
    const hide = await tool(who, "mod_hide", { id, why: "test" });
    assert(hide.error && /library_unpublish/.test(hide.error), `${who.name} can't hide it: ${hide.error}`);
  }
  const reports = (await must(admin, "mod_get", { id })).reports;
  assert(reports.length === 5 && reports.every((r) => r.state === "escalated"), `every report escalated: ${JSON.stringify(reports.map((r) => r.state))}`);
  const moderatorResolve = await tool(moderator, "mod_resolve", { report: reports[0].id, decision: "dismiss", why: "test" });
  assert(moderatorResolve.error, "a moderator can't settle them");
  const upheld = await must(admin, "mod_resolve", { report: reports[1].id, decision: "uphold", why: "the notice holds" });
  assert(upheld.itemState === "live" && /library_unpublish/.test(upheld.next), `upheld: still listed, and the way to take it off: ${JSON.stringify(upheld)}`);
  for (const r of [reports[0], ...reports.slice(2)]) await must(admin, "mod_resolve", { report: r.id, decision: "dismiss", why: "check over" });
  eq(stateOf(id).state, "live", "still live");
  sql(`DELETE FROM reports WHERE target_id = ${q(id)}; DELETE FROM items WHERE id = ${q(id)}`);
});

await stage("a counter-notice: filed by the owner, an admin's to settle (a moderator escalates it); upheld puts it back", async () => {
  const short = await app(owner, "POST", `/api/community/items/${copyrightItem}/counter-notice`, { statement: "mine", name: "Mod Owner", email: "owner@example.org" });
  eq(short.status, 400, "a statement too short");
  const filed = await app(owner, "POST", `/api/community/items/${copyrightItem}/counter-notice`, { statement: "These are my own sentences, written for this pack.", name: "Mod Owner", email: "owner@example.org" });
  eq(filed.status, 200, "filed");
  eq((await app(reporters[0], "POST", `/api/community/items/${copyrightItem}/counter-notice`, { statement: "x".repeat(30), name: "x", email: "x@y" })).status, 400, "only the owner can");
  const cases = (await app(owner, "GET", "/api/community/mine/cases")).body;
  assert(cases.some((c) => c.id === copyrightItem && c.counterNotice === "open"), "the owner sees it pending");
  const counter = (await must(moderator, "mod_get", { id: copyrightItem })).counterNotices[0];
  const notMine = await tool(moderator, "mod_resolve", { counter_notice: counter.id, decision: "uphold", why: "fine" });
  assert(notMine.error && /admin's/.test(notMine.error), "a moderator can't settle it");
  await must(moderator, "mod_escalate", { counter_notice: counter.id, why: "the owner says the sentences are theirs; the notice names a textbook" });
  const restore = await tool(moderator, "mod_restore", { id: copyrightItem, why: "looks like their own work" });
  assert(restore.error && /counter-notice/.test(restore.error), `a moderator can't answer it by restoring: ${restore.error}`);
  await must(admin, "mod_resolve", { counter_notice: counter.id, decision: "uphold", why: "own work" });
  eq(stateOf(copyrightItem).state, "live", "upheld: back up");
});

await stage("four established reports: dismissing the one that hid it leaves three, so it stays hidden", async () => {
  const item = (await share(owner2, "A pack four accounts report")).id;
  for (const r of [...reporters, follower]) await app(r, "POST", `/api/community/items/${item}/report`, { reason: "abuse" });
  eq(stateOf(item).state, "hidden", "hidden at the third");
  const reports = (await must(moderator, "mod_get", { id: item })).reports;
  eq(reports.length, 4, "four reports");
  // The third (oldest first) is the one that made three.
  const hid = reports[2];
  await must(moderator, "mod_resolve", { report: hid.id, decision: "dismiss", why: "this one was mistaken" });
  eq(stateOf(item).state, "hidden", "three established reports still open: still hidden");
  await must(moderator, "mod_resolve", { report: reports.find((r) => r.id !== hid.id).id, decision: "dismiss", why: "mistaken too" });
  eq(stateOf(item).state, "live", "two left: back up");
});

await stage("an escalated report: a moderator can't restore past it; an admin can, settling it", async () => {
  const item = (await share(owner2, "A pack with an escalated report")).id;
  await app(reporters[0], "POST", `/api/community/items/${item}/report`, { reason: "abuse", details: "not sure about this one" });
  await must(moderator, "mod_hide", { id: item, why: "while an admin looks" });
  const r = (await must(moderator, "mod_get", { id: item })).reports[0];
  await must(moderator, "mod_escalate", { report: r.id, why: "not sure: an admin's call" });
  const refused = await tool(moderator, "mod_restore", { id: item, why: "fine" });
  assert(refused.error && /admin's to settle/.test(refused.error), `refused: ${refused.error}`);
  eq(stateOf(item).state, "hidden", "still hidden");
  await must(admin, "mod_restore", { id: item, why: "an admin's call: fine" });
  eq([stateOf(item).state, sql(`SELECT state FROM reports WHERE id = ${q(r.id)}`)[0].state], ["live", "dismissed"], "back up, its report settled with it");
});

await stage("decisions at once: two on one report, one lands; a restore and an uphold at once, one or the other", async () => {
  const item = (await share(owner2, "A pack two moderators decide on")).id;
  await app(reporters[1], "POST", `/api/community/items/${item}/report`, { reason: "spam" });
  const r = (await must(moderator, "mod_get", { id: item })).reports[0];
  const [a, b] = await Promise.all([tool(moderator, "mod_resolve", { report: r.id, decision: "uphold", why: "spam" }), tool(admin, "mod_resolve", { report: r.id, decision: "dismiss", why: "not spam" })]);
  const landed = [a, b].filter((x) => !x.error);
  eq(landed.length, 1, `exactly one decision lands: ${JSON.stringify([a, b])}`);
  eq([sql(`SELECT state FROM reports WHERE id = ${q(r.id)}`)[0].state, stateOf(item).state], landed[0] === a ? ["upheld", "removed"] : ["dismissed", "live"], "as the decision that landed left it");
  const item2 = (await share(owner2, "A pack restored and upheld at once")).id;
  await app(reporters[1], "POST", `/api/community/items/${item2}/report`, { reason: "spam" });
  await must(moderator, "mod_hide", { id: item2, why: "looking" });
  const r2 = (await must(moderator, "mod_get", { id: item2 })).reports[0];
  const both = await Promise.all([tool(moderator, "mod_restore", { id: item2, why: "fine" }), tool(admin, "mod_resolve", { report: r2.id, decision: "uphold", why: "spam" })]);
  const pair = [stateOf(item2).state, sql(`SELECT state FROM reports WHERE id = ${q(r2.id)}`)[0].state];
  assert((pair[0] === "live" && pair[1] === "dismissed") || (pair[0] === "removed" && pair[1] === "upheld"), `consistent: ${JSON.stringify(pair)} after ${JSON.stringify(both)}`);
  return { first: landed[0] === a ? "the uphold landed" : "the dismissal landed", second: pair.join("/") };
});

await stage("a counter-notice upheld while another report holds the item: it stays down; once that's settled, nothing reported is left to hide it by", async () => {
  const item = (await share(owner2, "A pack with two holds")).id;
  await app(reporters[2], "POST", `/api/community/items/${item}/report`, { reason: "copyright", notice: NOTICE });
  const filed = await app(owner2, "POST", `/api/community/items/${item}/counter-notice`, { statement: "These are my own sentences, written for this pack.", name: "Mod Owner", email: "owner@example.org" });
  eq(filed.status, 200, "the counter-notice");
  await app(follower, "POST", `/api/community/items/${item}/report`, { reason: "minors", details: "test" });
  const counter = (await must(admin, "mod_get", { id: item })).counterNotices[0];
  const upheld = await must(admin, "mod_resolve", { counter_notice: counter.id, decision: "uphold", why: "own work" });
  assert(upheld.itemState === "hidden" && /other reports still hold it/.test(upheld.note), `stays down: ${JSON.stringify(upheld)}`);
  const minors = (await must(admin, "mod_get", { id: item })).reports.find((r) => r.reason === "minors");
  await must(admin, "mod_resolve", { report: minors.id, decision: "dismiss", why: "a test report" });
  eq(stateOf(item).state, "live", "the last hold settled: back up");
  const hide = await tool(moderator, "mod_hide", { id: item, why: "looking again" });
  assert(hide.error && /report it first/.test(hide.error), `nothing reported, no hide: ${hide.error}`);
});

await stage("fields of the wrong kind are left out or refused, never a 500", async () => {
  const item = (await share(admin, "A pack for odd requests")).id;
  const raw = (body) => fetch(`${BASE}/api/community/items/${item}/report`, { method: "POST", headers: { Cookie: `lc_session=${odd.cookie}`, "Content-Type": "application/json" }, body });
  eq((await raw("null")).status, 400, "a body of null");
  eq((await raw("[1]")).status, 400, "a list");
  eq((await raw(JSON.stringify({ reason: 5 }))).status, 400, "a reason that's a number");
  eq((await raw(JSON.stringify({ reason: { toString: null } }))).status, 400, "a reason that's an object");
  eq((await raw(JSON.stringify({ reason: "copyright", notice: "x" }))).status, 400, "a notice that's text");
  const ok = await raw(JSON.stringify({ reason: "spam", details: { a: 1 } }));
  eq(ok.status, 200, "details that aren't text: left out");
  eq(sql(`SELECT details FROM reports WHERE reporter_id = ${q(odd.id)}`)[0].details, null, "stored without them");
  await app(reporters[0], "POST", `/api/community/items/${item}/report`, { reason: "copyright", notice: NOTICE });
  const counter = await app(admin, "POST", `/api/community/items/${item}/counter-notice`, { statement: { a: 1 }, name: 1, email: [] });
  eq(counter.status, 400, `a counter-notice of odd fields: ${JSON.stringify(counter.body)}`);
  await must(admin, "mod_restore", { id: item, why: "check over" });
});

await stage("a sender whose notices were dismissed three times loses the fast path: the next waits in the queue, the pack still up", async () => {
  const claimant = account("Mod Claimant");
  for (let i = 0; i < 3; i++) {
    const id = (await share(admin, `A pack a claimant reports ${i}`)).id;
    eq((await app(claimant, "POST", `/api/community/items/${id}/report`, { reason: "copyright", notice: NOTICE })).body.hidden, true, `notice ${i + 1}: hidden at once`);
    const report = (await must(admin, "mod_get", { id })).reports.at(-1);
    await must(admin, "mod_resolve", { report: report.id, decision: "dismiss", why: "not their work" });
  }
  const id = (await share(admin, "A pack a claimant reports again")).id;
  const fourth = await app(claimant, "POST", `/api/community/items/${id}/report`, { reason: "copyright", notice: NOTICE });
  eq([fourth.status, fourth.body.hidden, stateOf(id).state], [200, false, "live"], "the fourth: in the queue, the pack still up");
  eq((await must(moderator, "mod_get", { id })).reports.at(-1).state, "open", "open, for a moderator to judge");
});

await stage("room: what an account has shared is capped (50 MB in its first week); a share past it is refused, nothing written", async () => {
  const filler = account("Mod Filler", { ageDays: 0 });
  const first = await share(filler, "A pack before the room runs out");
  sql(`UPDATE item_versions SET bytes = ${50 * 1024 * 1024 - 100} WHERE item_id = ${q(first.id)}`);
  const pack = structuredClone(NL);
  pack.id = `room-${run}`;
  pack.items = pack.items.map((item) => ({ ...item, means: `${item.means} (room)` }));
  const refused = await app(filler, "POST", "/api/community/share", { pack });
  assert(refused.status === 429 && /past 50 MB/.test(refused.body.error), `refused: ${JSON.stringify(refused.body)}`);
  eq(sql(`SELECT COUNT(*) AS n FROM items WHERE owner_id = ${q(filler.id)}`)[0].n, 1, "nothing written");
  await app(filler, "DELETE", "/api/me", { confirm: "delete my account" });
});

await stage("withdrawn and then reported: a notice takes its file down for followers too; dismissed, it's back; withdrawing a hidden pack is refused", async () => {
  const shared = await share(owner2, "A pack withdrawn, then reported");
  const ref = (await app(follower, "POST", `/api/community/items/${shared.id}/follow`)).body;
  eq((await app(owner2, "POST", `/api/community/items/${shared.id}/withdraw`)).status, 200, "withdrawn");
  eq((await fetch(`${BASE}${ref.url}`)).status, 200, "withdrawn: still served to whoever has it");
  assert((await app(follower, "GET", "/api/community/following")).body.some((r) => r.id === shared.id), "still in the follower's list");
  eq((await app(reporters[0], "POST", `/api/community/items/${shared.id}/report`, { reason: "copyright", notice: NOTICE })).status, 200, "a notice against it");
  eq((await fetch(`${BASE}${ref.url}`)).status, 404, "its file isn't served");
  assert(!(await app(follower, "GET", "/api/community/following")).body.some((r) => r.id === shared.id), "out of the follower's list");
  eq((await app(follower, "GET", "/api/community/following/down")).body.filter((r) => r.id === shared.id).map((r) => r.state), ["hidden"], "down, for Explore's home to say");
  eq((await app(follower, "GET", `/api/community/items/${shared.id}`)).status, 404, "others can't open it");
  assert((await app(owner2, "GET", `/api/community/items/${shared.id}`)).body.item.down === true, "its owner sees it taken down");
  assert((await app(owner2, "GET", "/api/community/mine")).body.find((i) => i.id === shared.id)?.down === true, "and so does Yours");
  const answered = await app(owner2, "POST", `/api/community/items/${shared.id}/counter-notice`, { statement: "I wrote these sentences myself; the notice is about another book.", name: "Mod Owner Two", email: "owner2@example.org" });
  eq(answered.status, 200, `its owner answers it: ${JSON.stringify(answered.body)}`);
  const r = (await must(admin, "mod_get", { id: shared.id })).reports.at(-1);
  await must(admin, "mod_resolve", { report: r.id, decision: "dismiss", why: "not theirs to claim" });
  eq(sql(`SELECT state FROM counter_notices WHERE report_id = ${q(r.id)}`)[0].state, "upheld", "the counter-notice answered with the dismissal");
  eq([stateOf(shared.id).state, (await fetch(`${BASE}${ref.url}`)).status], ["withdrawn", 200], "dismissed: withdrawn as it was, served again");
  const other = await share(owner2, "A pack hidden, then withdrawn");
  await app(reporters[1], "POST", `/api/community/items/${other.id}/report`, { reason: "spam" });
  await must(moderator, "mod_hide", { id: other.id, why: "looking" });
  const withdraw = await app(owner2, "POST", `/api/community/items/${other.id}/withdraw`);
  eq([withdraw.status, stateOf(other.id).state], [400, "hidden"], "a hidden pack isn't withdrawn out of its hide");
  await must(moderator, "mod_restore", { id: other.id, why: "done" });
});

await stage("taken down while a second report holds it: that one can be answered too; once the last hold is gone it's back", async () => {
  const item = (await share(owner2, "A pack taken down with a second hold")).id;
  await app(reporters[1], "POST", `/api/community/items/${item}/report`, { reason: "copyright", notice: NOTICE });
  await app(follower, "POST", `/api/community/items/${item}/report`, { reason: "minors", details: "test" });
  const reports = (await must(admin, "mod_get", { id: item })).reports;
  const notice = reports.find((r) => r.reason === "copyright");
  const minors = reports.find((r) => r.reason === "minors");
  eq((await must(admin, "mod_resolve", { report: notice.id, decision: "uphold", why: "copied" })).itemState, "removed", "the notice upheld: taken down");
  const statement = { statement: "These are my own sentences, written for this pack.", name: "Mod Owner Two", email: "owner2@example.org" };
  eq((await app(owner2, "POST", `/api/community/items/${item}/counter-notice`, statement)).status, 200, "a counter-notice to the upheld notice");
  const first = (await must(admin, "mod_get", { id: item })).counterNotices.at(-1);
  eq(first.answers, notice.id, "it answers the notice that took it down, not the later report");
  const upheld = await must(admin, "mod_resolve", { counter_notice: first.id, decision: "uphold", why: "own work" });
  assert(upheld.itemState === "removed" && /other reports still hold it/.test(upheld.note), `still down, the minors report holding it: ${JSON.stringify(upheld)}`);
  const second = await app(owner2, "POST", `/api/community/items/${item}/counter-notice`, { ...statement, statement: "Nothing in this pack involves children; it's about food." });
  eq(second.status, 200, `the second hold answered: ${JSON.stringify(second.body)}`);
  await must(admin, "mod_resolve", { report: minors.id, decision: "dismiss", why: "a test report" });
  eq(stateOf(item).state, "live", "the last hold dismissed: back up from taken down");
  eq(sql(`SELECT state FROM counter_notices WHERE report_id = ${q(minors.id)}`)[0].state, "upheld", "its counter-notice answered with it");
});

await stage("a strike that lands after its counter-notice was filed: upholding the counter-notice still lifts the ban", async () => {
  const third = account("Mod Owner Three");
  const items = [];
  for (let i = 0; i < 3; i++) items.push((await share(third, `A third owner's pack ${i}`)).id);
  for (const id of items) await app(reporters[2], "POST", `/api/community/items/${id}/report`, { reason: "copyright", notice: NOTICE });
  for (const id of items.slice(0, 2)) await must(moderator, "mod_resolve", { report: (await must(admin, "mod_get", { id })).reports.at(-1).id, decision: "uphold", why: "copied" });
  eq((await app(third, "POST", `/api/community/items/${items[2]}/counter-notice`, { statement: "I wrote these three sentences myself last week.", name: "Mod Owner Three", email: "third@example.org" })).status, 200, "the counter-notice, filed while the notice is open");
  // A report a counter-notice answers is an admin's to settle, so an admin lands the strike.
  const strike = await must(admin, "mod_resolve", { report: (await must(admin, "mod_get", { id: items[2] })).reports.at(-1).id, decision: "uphold", why: "copied" });
  eq(strike.ownerBanned, "from sharing (repeat copyright notices)", "then upheld: the third strike, a ban");
  const counter = (await must(admin, "mod_get", { id: items[2] })).counterNotices.at(-1);
  const upheld = await must(admin, "mod_resolve", { counter_notice: counter.id, decision: "uphold", why: "own work" });
  assert(/lifted/.test(upheld.ownerBan ?? ""), `the ban lifted: ${JSON.stringify(upheld)}`);
  eq((await app(third, "GET", "/api/community/terms")).status, 200, "still here");
  await share(third, "A third owner's pack after the ban lifted");
});

await stage("withdrawn, then three accounts' reports: its file comes down, escalating one keeps it down, and the same pack can't be shared again", async () => {
  const shared = await share(owner4, "A pack withdrawn, then reported by three");
  eq((await app(owner4, "POST", `/api/community/items/${shared.id}/withdraw`)).status, 200, "withdrawn");
  eq((await fetch(`${BASE}${shared.url}`)).status, 200, "served to whoever has it");
  for (const r of reporters) await app(r, "POST", `/api/community/items/${shared.id}/report`, { reason: "abuse" });
  eq((await fetch(`${BASE}${shared.url}`)).status, 404, "three established accounts' reports: its file comes down");
  const first = (await must(moderator, "mod_get", { id: shared.id })).reports[0];
  await must(moderator, "mod_escalate", { report: first.id, why: "an admin's call" });
  eq((await fetch(`${BASE}${shared.url}`)).status, 404, "one of them escalated: still down");
  const again = await app(odd, "POST", "/api/community/share", { pack: { ...shared.pack, id: `again-${shared.pack.id}` } });
  assert(again.status === 422 && /taken down from Explore/.test(JSON.stringify(again.body.errors)), `the same pack shared again: ${JSON.stringify(again.body)}`);
  // Nor can its owner change it (a withdrawn pack gets no more updates) to free its content for sharing again.
  const changed = structuredClone(shared.pack);
  changed.items[0].means = `${changed.items[0].means} (changed)`;
  const update = await app(owner4, "POST", `/api/community/items/${shared.id}/update`, { pack: changed });
  assert(update.status === 400 && /withdrawn from Explore/.test(update.body.error), `a withdrawn pack isn't updated: ${JSON.stringify(update.body)}`);
});

await stage("a report a counter-notice answers is an admin's: a moderator can't settle it; the pending count shows the escalation", async () => {
  const item = (await share(owner4, "A pack whose notice is answered")).id;
  // A rights holder with no dismissed notices (reporters[0] has three by now, so its notices wait in the queue).
  const holder = account("Mod Rights Holder");
  eq((await app(holder, "POST", `/api/community/items/${item}/report`, { reason: "copyright", notice: NOTICE })).body.hidden, true, "the notice hides it");
  eq((await app(owner4, "POST", `/api/community/items/${item}/counter-notice`, { statement: "These are my own sentences, written for this pack.", name: "Mod Owner Four", email: "owner4@example.org" })).status, 200, "answered");
  const c = await must(moderator, "mod_get", { id: item });
  for (const decision of ["dismiss", "uphold"]) {
    const refused = await tool(moderator, "mod_resolve", { report: c.reports.at(-1).id, decision, why: "test" });
    assert(refused.error && /counter-notice answers this report/.test(refused.error), `a moderator can't ${decision} it: ${refused.error}`);
  }
  const pending = async () => (await (await fetch(`${BASE}/api/v1/mod/pending`, { headers: { Authorization: `Bearer ${moderator.token}` } })).json()).escalated;
  const before = await pending();
  await must(moderator, "mod_escalate", { counter_notice: c.counterNotices.at(-1).id, why: "the owner says the sentences are theirs" });
  eq(await pending(), before + 1, "the escalated counter-notice counts as an admin's");
  await must(admin, "mod_resolve", { report: c.reports.at(-1).id, decision: "dismiss", why: "not the claimant's work" });
  eq(stateOf(item).state, "live", "an admin settles it: back up");
});

await stage("a moderator's hide lasts while a report on it is open: in the queue all along, and back up once the report's dismissed", async () => {
  const item = (await share(owner4, "A pack a moderator looks into")).id;
  await app(reporters[1], "POST", `/api/community/items/${item}/report`, { reason: "abuse", details: "maybe insulting" });
  await must(moderator, "mod_hide", { id: item, why: "looking into the report" });
  assert((await must(moderator, "mod_queue", {})).cases.some((x) => x.item === item), "in the queue");
  const counter = await app(owner4, "POST", `/api/community/items/${item}/counter-notice`, { statement: "Nothing in this pack insults anyone, please look again.", name: "Mod Owner Four", email: "owner4@example.org" });
  assert(counter.status === 400 && /It's in the queue/.test(counter.body.error), `a moderator's hide, answered by the decision: ${JSON.stringify(counter.body)}`);
  const r = (await must(moderator, "mod_get", { id: item })).reports.at(-1);
  await must(moderator, "mod_resolve", { report: r.id, decision: "dismiss", why: "not insulting" });
  eq(stateOf(item).state, "live", "the case closed: the hide with it");
});

await stage("a community pack's file is served only with its version on record", async () => {
  const shared = await share(owner4, "A pack whose version record goes");
  eq((await fetch(`${BASE}${shared.url}`)).status, 200, "served");
  sql(`DELETE FROM item_versions WHERE item_id = ${q(shared.id)}`);
  eq((await fetch(`${BASE}${shared.url}`)).status, 404, "its record gone: not served, though the file's still there");
});

let strikes = [];
await stage("three upheld copyright notices stop an account sharing", async () => {
  for (let i = 0; i < 3; i++) {
    const shared = await share(owner, `A pack to take down ${i}`);
    strikes.push(shared);
    const id = shared.id;
    await app(reporters[1], "POST", `/api/community/items/${id}/report`, { reason: "copyright", notice: NOTICE });
    const report = (await must(admin, "mod_get", { id })).reports.at(-1);
    const resolved = await must(moderator, "mod_resolve", { report: report.id, decision: "uphold", why: "copied from the textbook" });
    if (i === 2) eq(resolved.ownerBanned, "from sharing (repeat copyright notices)", "the third strike");
  }
  const refused = await app(owner, "POST", "/api/community/share", { pack: { ...structuredClone(NL), id: "after-strikes" } });
  eq(refused.status, 403, "sharing refused");
  assert(/can't share in Explore/.test(refused.body.error), refused.body.error);
  eq((await app(owner, "POST", `/api/community/items/${copyrightItem}/follow`)).status, 200, "a sharing ban doesn't stop them following");
});

await stage("a strike overturned: Yours lists what's taken down; the same pack again is refused; a counter-notice upheld lifts the ban", async () => {
  const yours = (await app(owner, "GET", "/api/community/mine")).body;
  assert(strikes.every((s) => yours.some((i) => i.id === s.id && i.state === "removed")), `taken down, in Yours: ${JSON.stringify(yours.map((i) => [i.id, i.state]))}`);
  const again = await app(reporters[0], "POST", "/api/community/share", { pack: { ...strikes[1].pack, id: `copy-of-${strikes[1].pack.id}` } });
  assert(again.status === 422 && /taken down from Explore/.test(JSON.stringify(again.body.errors)), `a taken-down pack shared again: ${JSON.stringify(again.body)}`);
  const filed = await app(owner, "POST", `/api/community/items/${strikes[0].id}/counter-notice`, { statement: "I wrote these myself; the textbook has different sentences.", name: "Mod Owner", email: "owner@example.org" });
  eq(filed.status, 200, `a counter-notice against the upheld notice: ${JSON.stringify(filed.body)}`);
  const counter = (await must(admin, "mod_get", { id: strikes[0].id })).counterNotices.at(-1);
  const upheld = await must(admin, "mod_resolve", { counter_notice: counter.id, decision: "uphold", why: "the notice was wrong" });
  assert(upheld.itemState === "live" && /lifted/.test(upheld.ownerBan ?? ""), `back up, ban lifted: ${JSON.stringify(upheld)}`);
  const fresh = await share(owner, "A pack after the ban lifted");
  eq(stateOf(fresh.id).state, "live", "sharing again");
});

await stage("bans: an admin's, community-wide stops following and liking; lifted, it works again", async () => {
  const refused = await tool(moderator, "mod_ban", { user: follower.id, scope: "community", why: "test" });
  assert(refused.error, "a moderator can't ban");
  await must(admin, "mod_ban", { user: follower.id, scope: "community", why: "spamming reports", days: 7 });
  eq((await app(follower, "POST", `/api/community/items/${copyrightItem}/follow`)).status, 403, "following refused");
  eq((await app(follower, "POST", `/api/community/items/${copyrightItem}/like`)).status, 403, "liking refused");
  eq((await app(follower, "POST", `/api/community/items/${copyrightItem}/report`, { reason: "spam" })).status, 403, "reporting refused");
  await must(admin, "mod_unban", { user: follower.id, why: "test over" });
  eq((await app(follower, "POST", `/api/community/items/${copyrightItem}/like`)).status, 200, "lifted");
});

await stage("limits: a new account reports at most 5 a day", async () => {
  const fresh = account("Mod Fresh", { ageDays: 0 });
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push((await share(admin, `A pack for limits ${i}`)).id);
  for (let i = 0; i < 5; i++) eq((await app(fresh, "POST", `/api/community/items/${ids[i]}/report`, { reason: "other", details: "limits" })).status, 200, `report ${i + 1}`);
  const sixth = await app(fresh, "POST", `/api/community/items/${ids[5]}/report`, { reason: "other" });
  eq(sixth.status, 429, "the sixth");
  assert(/5 reports in a day, this account's limit in its first week/.test(sixth.body.error), sixth.body.error);
  await app(fresh, "DELETE", "/api/me", { confirm: "delete my account" });
});

await stage("limits hold for requests sent at once: a new account's 8 reports at once, 5 land; its 6 shares at once, 3 land", async () => {
  const burst = account("Mod Burst", { ageDays: 0 });
  const ids = [];
  for (let i = 0; i < 8; i++) ids.push((await share(admin, `A pack for the burst ${i}`)).id);
  const reports = await Promise.all(ids.map((id) => app(burst, "POST", `/api/community/items/${id}/report`, { reason: "other", details: "burst" })));
  eq(reports.map((r) => r.status).sort().join(), "200,200,200,200,200,429,429,429", "five land, three refused");
  const packs = Array.from({ length: 6 }, (_, i) => {
    const pack = structuredClone(NL);
    pack.id = `burst-${run}-${i}`;
    pack.name = `Burst ${i}`;
    pack.items = pack.items.map((item) => ({ ...item, means: `${item.means} (burst ${i})` }));
    return pack;
  });
  const shares = await Promise.all(packs.map((pack) => app(burst, "POST", "/api/community/share", { pack })));
  eq(shares.map((r) => r.status).sort().join(), "200,200,200,429,429,429", `three land, three refused: ${JSON.stringify(shares.map((r) => r.body?.error ?? r.body?.errors ?? r.status))}`);
  eq(sql(`SELECT COUNT(*) AS n FROM items WHERE owner_id = ${q(burst.id)}`)[0].n, 3, "three in D1");
  // The refused ones left no file: each pack's version computed as the server does (checked against the ones that landed).
  const format = await import(join(APP, "public/js/study/pack-format.js"));
  const { BUILT_IN } = await import(join(APP, "public/js/packs/index.js"));
  const installed = BUILT_IN.filter((p) => p.language === NL.language).map((p) => ({ ...p, builtIn: true }));
  const versions = await Promise.all(packs.map(async (pack) => format.packVersion(format.checkPack(pack, { installed }).pack)));
  shares.forEach((r, i) => r.status === 200 && eq(versions[i], r.body.version, `the version of ${packs[i].id}, as the server made it`));
  const served = await Promise.all(packs.map((pack, i) => fetch(`${BASE}/library/packs/${pack.id}/${versions[i]}/pack.json`).then((r) => r.status)));
  eq(served.map((status, i) => [shares[i].status, status]).sort().join(" "), "200,200 200,200 200,200 429,404 429,404 429,404", "the refused ones: nothing to download");
  await app(burst, "DELETE", "/api/me", { confirm: "delete my account" });
});

await stage("the zero-token check: what's waiting, for a moderator's admin-access token only", async () => {
  const get = (token) => fetch(`${BASE}/api/v1/mod/pending`, { headers: { Authorization: `Bearer ${token}` } });
  const ok = await get(moderator.token);
  eq(ok.status, 200, "a moderator's admin-access token");
  const body = await ok.json();
  assert(typeof body.open === "number" && "oldest" in body && "escalated" in body, JSON.stringify(body));
  eq((await get(moderator.plain)).status, 403, "the moderator's ordinary token");
  eq((await get(owner.token)).status, 403, "a learner's");
  return body;
});

await stage("the policy: the default until an admin changes it; a moderator reads it", async () => {
  const first = await must(moderator, "moderation_policy", {});
  assert(first.rev === 0 && /Copyright: a complete notice hides the item at once/.test(first.text), "the default policy");
  assert((await tool(moderator, "moderation_policy", { text: "x".repeat(50) })).error, "a moderator can't change it");
  await must(admin, "moderation_policy", { text: `${first.text}\n- Test: one more rule.` });
  const after = await must(moderator, "moderation_policy", {});
  assert(after.rev === 1 && after.text.endsWith("one more rule."), "the new one");
});

await stage("the admin log has every moderation action, with the connection", async () => {
  const entries = await must(admin, "admin_log", { action: "mod" });
  const actions = new Set(entries.map((e) => e.action));
  for (const a of ["mod.hide", "mod.restore", "mod.report.dismiss", "mod.report.uphold", "mod.escalate", "mod.counter.uphold", "mod.ban", "mod.unban", "mod.policy"]) assert(actions.has(a), `the log has ${a}`);
  assert(entries.some((e) => e.actorName === "Mod Moderator" && e.via === "pat:check"), "with who and how");
});

await stage("a moderator whose role is taken away: the tools go at once", async () => {
  sql(`DELETE FROM user_roles WHERE user_id = ${q(moderator.id)}`);
  assert(!(await toolNames(moderator.token)).some((t) => t.startsWith("mod_")), "gone");
  eq((await fetch(`${BASE}/api/v1/mod/pending`, { headers: { Authorization: `Bearer ${moderator.token}` } })).status, 403, "the check too");
});

for (const who of [admin, moderator, owner, ...reporters, newcomer, follower]) await app(who, "DELETE", "/api/me", { confirm: "delete my account" });
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "moderation-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.length - failed.length, total: results.length, results, calls: log }, null, 2) + "\n");
console.log(`moderation check: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
