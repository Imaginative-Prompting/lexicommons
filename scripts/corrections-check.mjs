#!/usr/bin/env node
// Corrections in Explore, end to end over HTTP and MCP, against a LOCAL server with COMMUNITY_SHARING "everyone" and
// its own state:
// - suggesting a fix (checked as a version is) or a flag, and every refusal;
// - listing them, likes, withdrawing;
// - the author accepting several into one new version (its followers' refs move, its note names who suggested them)
//   and declining with a reason;
// - an admin on someone else's pack, and on one of the library's own (a new default version on the catalog);
// - a new version superseding what it changed;
// - the open fixes a device plays;
// - the AI's tools, an account going, and the export.
//
//   node scripts/corrections-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
//
// The server: as for admin-check (app/AGENTS.md), on a fresh state, with --var COMMUNITY_SHARING:everyone. Sandbox off.
// Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { Agent, fetch as undiciFetch } from "undici";
import { dirname, join, resolve } from "node:path";
import { BUILT_IN } from "../public/js/packs/index.js";
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
  console.error("Usage: corrections-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
// Every request on a fresh connection (keep-alive off): a kept-alive socket the local server closed while it was busy
// (under load, or while the check ran wrangler) would fail the next request on it with ECONNRESET, and a POST in a race
// can't simply be sent again. Anything that fails says why.
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
function account(name, { role = null, ageDays = 30 } = {}) {
  const id = `cc${run}${randomBytes(5).toString("hex")}`;
  const now = Date.now();
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  const plain = `lct_${randomBytes(24).toString("base64url")}`;
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now - ageDays * 86400_000})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'corrections-check')`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'check', ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now}, ${role ? 1 : 0})`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'plain', ${q(sha256(plain))}, ${q(plain.slice(0, 10))}, ${now}, 0)`,
      `INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${q(id)}, 1, ${now})`,
      ...(role ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, ${q(role)}, ${now}, 'd1', 'corrections-check')`] : []),
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
async function app(who, method, path, body) {
  const response = await fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${who.cookie}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const NL = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
/** Stages files through library_upload and runs the script it gives (as admin-check does), from a folder holding them. */
async function stageAll(who, files) {
  const staged = await must(who, "library_upload", { files: files.map(({ name, bytes }) => ({ name, type: "application/json", size: bytes.length, sha256: sha256(bytes) })) });
  if (staged.script) {
    const dir = mkdtempSync(join(tmpdir(), "corrections-check-"));
    for (const f of files) writeFileSync(join(dir, f.name), f.bytes);
    writeFileSync(join(dir, "send.sh"), staged.script);
    const output = execFileSync("sh", ["send.sh"], { cwd: dir }).toString();
    rmSync(dir, { recursive: true, force: true });
    const answers = output.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line.replace(/^[^{]*/, "")));
    assert(answers.length === staged.toSend && answers.every((a) => a.ok), `the upload script's answers: ${output.slice(0, 400)}`);
  }
  return files.map((f) => sha256(f.bytes));
}
const stateOf = (id) => sql(`SELECT state, accepted_in, answer_note, likes FROM corrections WHERE id = ${q(id)}`)[0];
const headOf = (id) => sql(`SELECT head_version FROM items WHERE id = ${q(id)}`)[0].head_version;

console.log(`corrections check: ${BASE}`);
const admin = account("Corr Admin", { role: "admin" });
const owner = account("Corr Owner");
const fixer = account("Corr Fixer");
const second = account("Corr Second");
const follower = account("Corr Follower");
const outsider = account("Corr Outsider");
const moderator = account("Corr Moderator", { role: "moderator" });
const reporters = [account("Corr Reporter A"), account("Corr Reporter B"), account("Corr Reporter C")];

let packId;
let packV1;
await stage("a shared pack to correct; who sees the tools: list for everyone, suggesting and answering where sharing is open", async () => {
  const shared = await app(owner, "POST", "/api/community/share", { pack: { ...NL, id: `corr-${run}` }, level: "A1", topics: ["food"] });
  assert(shared.status === 200, JSON.stringify(shared.body));
  packId = shared.body.id;
  packV1 = shared.body.version;
  eq((await app(follower, "POST", `/api/community/items/${packId}/follow`, { corrections: "community" })).status, 200, "a follower, with community corrections");
  const tools = await toolNames(fixer.token);
  for (const t of ["list_corrections", "suggest_correction", "withdraw_correction", "review_corrections"]) assert(tools.includes(t), `${t} listed`);
  assert(!tools.includes("like_correction"), "no tool likes anything");
});

let fixA;
let fixB;
let flag;
await stage("suggesting: a fix checked as a version is (every problem at once), a flag with its note, and each refusal", async () => {
  const good = await app(fixer, "POST", `/api/community/items/${packId}/corrections`, { path: "items/eet-smakelijk/means", kind: "fix", value: "Bon appetit!", note: "More natural." });
  assert(good.status === 200 && good.body.suggested, JSON.stringify(good.body));
  fixA = good.body.id;
  const broken = await app(fixer, "POST", `/api/community/items/${packId}/corrections`, { path: "items/eet-smakelijk/wrong", kind: "fix", value: ["Eet smakelijk!"] });
  assert(broken.status === 422 && broken.body.errors.some((e) => /the sentence itself/.test(e.message)), `a fix that breaks the pack: ${JSON.stringify(broken.body)}`);
  const again = await app(fixer, "POST", `/api/community/items/${packId}/corrections`, { path: "items/eet-smakelijk/means", kind: "fix", value: "Enjoy!" });
  assert(again.status === 400 && /open correction on that piece already/.test(again.body.error), `one open per piece: ${JSON.stringify(again.body)}`);
  const same = await app(second, "POST", `/api/community/items/${packId}/corrections`, { path: "items/eet-smakelijk/means", kind: "fix", value: "Enjoy your meal!" });
  assert(same.status === 400 && /says already/.test(same.body.error), `the same value: ${JSON.stringify(same.body)}`);
  const own = await app(owner, "POST", `/api/community/items/${packId}/corrections`, { path: "items/eet-smakelijk/means", kind: "fix", value: "Yum!" });
  assert(own.status === 400 && /yours/.test(own.body.error), `on your own pack: ${JSON.stringify(own.body)}`);
  const nowhere = await app(second, "POST", `/api/community/items/${packId}/corrections`, { path: "items/nope/means", kind: "fix", value: "x" });
  assert(nowhere.status === 400 && /no items\/nope\/means/.test(nowhere.body.error), `a piece that isn't there: ${JSON.stringify(nowhere.body)}`);
  const older = await app(second, "POST", `/api/community/items/${packId}/corrections`, { path: "items/eet-smakelijk/means", kind: "fix", value: "x", version: "000000000000" });
  assert(older.status === 400 && /older version/.test(older.body.error), `an older version: ${JSON.stringify(older.body)}`);
  const silent = await app(second, "POST", `/api/community/items/${packId}/corrections`, { path: "items/balletje/means", kind: "flag" });
  assert(silent.status === 400 && /says what's wrong/.test(silent.body.error), `a flag without a note: ${JSON.stringify(silent.body)}`);
  const odd = await app(second, "POST", `/api/community/items/${packId}/corrections`, { path: { toString: null }, kind: "fix" });
  eq(odd.status, 400, "a path of the wrong kind: refused, not a 500");
  const b = await app(second, "POST", `/api/community/items/${packId}/corrections`, { path: "words/oma", kind: "fix", value: "grandma" });
  assert(b.status === 200, JSON.stringify(b.body));
  fixB = b.body.id;
  const f = await app(second, "POST", `/api/community/items/${packId}/corrections`, { path: "items/balletje/literal", kind: "flag", note: "The literal line misses the diminutive." });
  assert(f.status === 200, JSON.stringify(f.body));
  flag = f.body.id;
});

await stage("listing and likes: open ones, the most liked first, each with the piece as it is now; one like per account, not your own", async () => {
  eq((await app(follower, "POST", `/api/community/corrections/${fixB}/like`)).body.likes, 1, "liked");
  eq((await app(outsider, "POST", `/api/community/corrections/${fixB}/like`)).body.likes, 2, "liked by another");
  eq((await app(follower, "POST", `/api/community/corrections/${fixB}/like`)).body.likes, 2, "once per account");
  eq((await app(second, "POST", `/api/community/corrections/${fixB}/like`)).status, 400, "not your own");
  const list = (await app(follower, "GET", `/api/community/items/${packId}/corrections`)).body;
  eq(list.map((c) => c.id), [fixB, fixA, flag], "the most liked first");
  const b = list[0];
  assert(b.liked && b.by === "Corr Second" && b.current === NL.words.oma && b.value === "grandma", `a correction's view: ${JSON.stringify(b)}`);
  eq(list[1].current, "Enjoy your meal!", "the piece as it is now");
  eq((await app(outsider, "DELETE", `/api/community/corrections/${fixB}/like`)).body.likes, 1, "a like taken back");
});

await stage("the open fixes a device with community corrections plays, on the current version", async () => {
  const fixes = (await app(follower, "GET", `/api/community/items/${packId}/fixes`)).body;
  eq([fixes.version, fixes.fixes.map((f) => f.id).sort()], [packV1, [fixA, fixB].sort()], "both fixes (not the flag), on the version they're for");
});

let packV2;
await stage("the author accepts two into one new version (its note naming who suggested them; followers move to it) and declines the flag", async () => {
  const notMine = await app(outsider, "POST", `/api/community/items/${packId}/corrections/review`, { accept: [fixA] });
  assert(notMine.status === 400 && /author/.test(notMine.body.error), `not the author: ${JSON.stringify(notMine.body)}`);
  const flagAccepted = await app(owner, "POST", `/api/community/items/${packId}/corrections/review`, { accept: [flag] });
  assert(flagAccepted.status === 400 && /is a flag/.test(flagAccepted.body.error), `a flag can't be accepted: ${JSON.stringify(flagAccepted.body)}`);
  const answered = await app(owner, "POST", `/api/community/items/${packId}/corrections/review`, { accept: [fixA, fixB], decline: [{ id: flag, why: "The literal line is right as it is." }] });
  assert(answered.status === 200 && answered.body.accepted === 2 && answered.body.declined === 1, JSON.stringify(answered.body));
  packV2 = answered.body.version;
  assert(packV2 && packV2 !== packV1 && headOf(packId) === packV2, "one new version, at the head");
  eq([stateOf(fixA).state, stateOf(fixA).accepted_in, stateOf(fixB).state], ["accepted", packV2, "accepted"], "both accepted into it");
  eq([stateOf(flag).state, stateOf(flag).answer_note], ["declined", "The literal line is right as it is."], "the flag declined, with why");
  const page = (await app(follower, "GET", `/api/community/items/${packId}`)).body;
  assert(/Corrections by Corr Fixer, Corr Second\./.test(page.versions[0].note ?? ""), `the version's note: ${JSON.stringify(page.versions[0])}`);
  const pack = await (await fetch(`${BASE}/library/packs/${packId}/${packV2}/pack.json`)).json();
  assert(pack.items.find((i) => i.id === "eet-smakelijk").means === "Bon appetit!" && pack.words.oma === "grandma", "both fixes in the new version");
  eq(pack.items.map((i) => i.id), NL.items.map((i) => i.id), "every sentence keeps its id");
  eq((await app(follower, "GET", "/api/community/following")).body.find((r) => r.id === packId).version, packV2, "the follower's ref is the new version");
});

await stage("a new version supersedes the open corrections on what it changed, not the others", async () => {
  const onNatural = (await app(fixer, "POST", `/api/community/items/${packId}/corrections`, { path: "items/oma-gebeld/means", kind: "fix", value: "I phoned grandma." })).body.id;
  const onGloss = (await app(fixer, "POST", `/api/community/items/${packId}/corrections`, { path: "words/bellen", kind: "fix", value: "to ring" })).body.id;
  const pack = await (await fetch(`${BASE}/library/packs/${packId}/${packV2}/pack.json`)).json();
  pack.items.find((i) => i.id === "oma-gebeld").means = "I called my grandmother.";
  const updated = await app(owner, "POST", `/api/community/items/${packId}/update`, { pack });
  assert(updated.status === 200 && updated.body.newVersion, JSON.stringify(updated.body));
  eq([stateOf(onNatural).state, stateOf(onGloss).state], ["superseded", "open"], "superseded only where it changed");
});

await stage("an admin answers on someone else's pack (and the admin log says so); withdrawing your own open one", async () => {
  const open = sql(`SELECT id FROM corrections WHERE item_id = ${q(packId)} AND state = 'open'`)[0].id;
  const byAdmin = await must(admin, "review_corrections", { id: packId, accept: [open] });
  assert(byAdmin.reviewed && byAdmin.version, JSON.stringify(byAdmin));
  assert(sql(`SELECT COUNT(*) AS n FROM admin_log WHERE action = 'corrections.review' AND target = ${q(`item:${packId}`)}`)[0].n === 1, "in the admin log");
  const mine = (await app(fixer, "POST", `/api/community/items/${packId}/corrections`, { path: "items/balletje/means", kind: "fix", value: "The girl plays with a small ball." })).body.id;
  eq((await app(second, "POST", `/api/community/corrections/${mine}/withdraw`)).status, 400, "not someone else's");
  eq((await app(fixer, "POST", `/api/community/corrections/${mine}/withdraw`)).body.state, "withdrawn", "withdrawn by its author");
});

await stage("the AI's tools: suggest, list (mine, to answer), review", async () => {
  const s = await must(fixer, "suggest_correction", { id: packId, path: "items/balletje/means", kind: "fix", value: "The girl is playing with a ball.", note: "Through my AI." });
  assert(s.suggested, JSON.stringify(s));
  assert((await must(fixer, "list_corrections", { mine: true })).some((c) => c.id === s.id && c.title), "mine");
  assert((await must(owner, "list_corrections", { to_answer: true })).some((c) => c.id === s.id), "to answer, for the author");
  const declined = await must(owner, "review_corrections", { id: packId, decline: [{ id: s.id, why: "I prefer the progressive." }] });
  eq(declined.declined, 1, "declined through the AI");
  assert((await tool(fixer, "list_corrections", { waiting: true })).error, "the month-old list is an admin's");
});

let pack2;
await stage("an admin's token made without admin access answers as nobody special", async () => {
  const shared = await app(owner, "POST", "/api/community/share", { pack: { ...NL, id: `corr2-${run}`, items: NL.items.map((i) => ({ ...i, means: `${i.means} (2)` })) }, level: "A1", topics: ["food"] });
  assert(shared.status === 200, JSON.stringify(shared.body));
  pack2 = shared.body.id;
  const c = (await app(fixer, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/balletje/means", kind: "fix", value: "A girl plays with a little ball." })).body.id;
  const asPlain = await tool({ token: admin.plain }, "review_corrections", { id: pack2, accept: [c] });
  assert(asPlain.error && /author \(or an admin\)/.test(asPlain.error), `refused over a plain token: ${JSON.stringify(asPlain)}`);
  assert((await tool({ token: admin.plain }, "list_corrections", { waiting: true })).error, "the month-old list too");
  eq(stateOf(c).state, "open", "nothing changed");
  await must(fixer, "withdraw_correction", { correction: c });
});

await stage("one spelling per piece; fixes accepted together must each come through as they would alone", async () => {
  const a = (await app(fixer, "POST", `/api/community/items/${pack2}/corrections`, { path: "words/oma", kind: "fix", value: "grandma" })).body.id;
  const alias = await app(fixer, "POST", `/api/community/items/${pack2}/corrections`, { path: "words/%6Fma", kind: "fix", value: "granny" });
  assert(alias.status === 400 && /open correction on that piece already/.test(alias.body.error), `an encoded spelling is the same piece: ${JSON.stringify(alias.body)}`);
  const b = (await app(second, "POST", `/api/community/items/${pack2}/corrections`, { path: "words/%6Fma", kind: "fix", value: "granny" })).body.id;
  eq(sql(`SELECT DISTINCT path FROM corrections WHERE id IN (${q(a)}, ${q(b)})`).map((r) => r.path), ["words/oma"], "kept under one spelling");
  const both = await app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { accept: [a, b] });
  assert(both.status === 422 && /Two fixes for words\/oma/.test(JSON.stringify(both.body.errors)), `two fixes for one piece: ${JSON.stringify(both.body)}`);
  const item = NL.items.find((i) => i.id === "eet-smakelijk");
  const nl = (await app(fixer, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/eet-smakelijk/words", kind: "fix", value: { words: item.words, punct: item.punct, gap: { index: 0, options: ["Eet", "Drink"] } } })).body.id;
  const gap = (await app(second, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/eet-smakelijk/gap", kind: "fix", value: { index: 1, options: ["smakelijk", "lekker"] } })).body.id;
  const overlap = await app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { accept: [nl, gap] });
  assert(overlap.status === 422 && /doesn't come through alongside/.test(JSON.stringify(overlap.body.errors)), `overlapping fixes: ${JSON.stringify(overlap.body)}`);
  for (const id of [a, b, nl, gap]) eq(stateOf(id).state, "open", "all still open");
  await app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { decline: [a, b, nl, gap].map((id) => ({ id, why: "check over" })) });
});

await stage("accepting is all or nothing against what's there: racing a withdrawal, racing a new version, more than 50", async () => {
  const noClaims = () => eq(sql("SELECT COUNT(*) AS n FROM corrections WHERE state = 'accepting' OR accepted_in LIKE 'claim:%'")[0].n, 0, "no claim left behind");
  // A withdrawal and an accept at once: one or the other.
  const w = (await app(fixer, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/oma-gebeld/means", kind: "fix", value: "I phoned grandma (2)." })).body.id;
  const headBefore = headOf(pack2);
  const [withdrawn, accepted] = await Promise.all([app(fixer, "POST", `/api/community/corrections/${w}/withdraw`), app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { accept: [w] })]);
  const st = stateOf(w);
  if (st.state === "withdrawn") assert(withdrawn.status === 200 && accepted.status !== 200 && headOf(pack2) === headBefore, `withdrawn: no new version (${JSON.stringify([withdrawn.body, accepted.body])})`);
  else assert(st.state === "accepted" && st.accepted_in === headOf(pack2) && withdrawn.status === 400, `accepted into the head: ${JSON.stringify([st, withdrawn.body])}`);
  noClaims();
  // An accept and the author's own new version at once. Overlapping, exactly one lands and the other changes nothing.
  // One after the other, both can: the update first (the accept then builds on it, so the head has both), never the
  // accept first (the update, made from the copy before it, would undo it, so it asks first: confirm_reverts).
  const c = (await app(second, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/balletje/means", kind: "fix", value: "The girl plays with a small ball." })).body.id;
  const pack = await (await fetch(`${BASE}/library/packs/${pack2}/${headOf(pack2)}/pack.json`)).json();
  pack.items.find((i) => i.id === "oma-gebeld").wrong = ["Ik heb oma gebelt.", "Oma heb ik gebeld niet."];
  const head = headOf(pack2);
  const [review, update] = await Promise.all([app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { accept: [c] }), app(owner, "POST", `/api/community/items/${pack2}/update`, { pack })]);
  const accepted2 = review.status === 200 && review.body.reviewed;
  const updated2 = update.status === 200 && update.body.updated;
  const both = JSON.stringify([review.body, update.body]).slice(0, 500);
  assert(accepted2 || updated2, `at least one new version: ${both}`);
  const now = stateOf(c);
  if (accepted2 && updated2) {
    // Both: the update first, the accept on top of it (its version is the head, and the head has both changes).
    const after = await (await fetch(`${BASE}/library/packs/${pack2}/${headOf(pack2)}/pack.json`)).json();
    assert(review.body.version === headOf(pack2), `both landed: the accept's version is the head (${both})`);
    eq([after.items.find((i) => i.id === "balletje").means, after.items.find((i) => i.id === "oma-gebeld").wrong], ["The girl plays with a small ball.", ["Ik heb oma gebelt.", "Oma heb ik gebeld niet."]], "both landed: the head has both changes");
  } else if (!accepted2) assert(update.status === 200, `only the update landed: ${both}`);
  else assert(update.status === 422 || update.status === 400, `only the accept landed: the update changed nothing (${both})`);
  if (accepted2) eq([now.state, now.accepted_in], ["accepted", review.body.version], "the accept landed, into its version");
  else eq(now.state, "open", "the accept didn't land: the correction is open again");
  assert(headOf(pack2) !== head, "the head moved");
  noClaims();
  const many = await app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { accept: Array.from({ length: 51 }, (_, i) => `id${i}xxxx`) });
  assert(many.status === 400 && /At most 50/.test(many.body.error), `more than 50: ${JSON.stringify(many.body)}`);
});

await stage("an update that undoes an accepted correction says so first (the author's own copy doesn't have it); confirm_reverts shares it anyway", async () => {
  const fix = (await app(fixer, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/eet-smakelijk/means", kind: "fix", value: "Enjoy your food! (2)" })).body.id;
  const before = await (await fetch(`${BASE}/library/packs/${pack2}/${headOf(pack2)}/pack.json`)).json();
  eq((await app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { accept: [fix] })).status, 200, "accepted");
  before.items.find((i) => i.id === "oma-gebeld").means = "I rang my grandma (2).";
  const undoing = await app(owner, "POST", `/api/community/items/${pack2}/update`, { pack: before });
  // (It may name a second: the race above can leave a correction to oma-gebeld's natural line accepted, which this undoes too.)
  assert(undoing.status === 422 && /undoes [12] accepted corrections? \(.*items\/eet-smakelijk\/means by Corr Fixer/.test(JSON.stringify(undoing.body.errors)) && /confirm_reverts/.test(JSON.stringify(undoing.body.errors)), `refused, naming it: ${JSON.stringify(undoing.body)}`);
  const anyway = await app(owner, "POST", `/api/community/items/${pack2}/update`, { pack: before, confirmReverts: true });
  assert(anyway.status === 200 && anyway.body.updated, `with confirm_reverts: ${JSON.stringify(anyway.body)}`);
  eq(stateOf(fix).state, "accepted", "the correction stays accepted, in the version it went into");
});

// An accept in flight, as reviewCorrections leaves it between its claim and its version (claim:<token>:<version>).
const claimed = (id, version, at = Date.now()) =>
  sql(`UPDATE corrections SET state = 'accepting', accepted_in = ${q(`claim:check${run}:${version}`)}, answered_by = ${q(owner.id)}, answered_at = ${at}, answer_note = 'in flight', updated_at = ${at} WHERE id = ${q(id)}`);
const settled = (id) => sql(`SELECT state, accepted_in, answered_by, answered_at, answer_note FROM corrections WHERE id = ${q(id)}`)[0];
const headPackOf = async (id) => (await fetch(`${BASE}/library/packs/${id}/${headOf(id)}/pack.json`)).json();

await stage("an accept in flight keeps its correction's place; a version that changes its piece supersedes it; one that never finished is settled by whoever comes next", async () => {
  const value = (n) => `The girl is playing with her ball (${n}).`;
  const held = (await app(fixer, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/balletje/means", kind: "fix", value: value(1) })).body.id;
  assert(held, "a fix to claim");
  claimed(held, "a1a1a1a1a1a1");
  const again = await app(fixer, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/balletje/means", kind: "fix", value: value(2) });
  assert(again.status === 400 && /open correction on that piece already/.test(again.body.error), `the same author on that piece meanwhile: ${JSON.stringify(again.body)}`);
  // Half an hour on, its accept is taken to have died: the next suggestion settles it first (open again, nothing of the
  // answer kept), and is then the second open one on that piece.
  claimed(held, "a1a1a1a1a1a1", Date.now() - 31 * 60_000);
  const later = await app(fixer, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/balletje/means", kind: "fix", value: value(3) });
  assert(later.status === 400 && /open correction on that piece already/.test(later.body.error), `after it's settled, still one per piece: ${JSON.stringify(later.body)}`);
  eq(settled(held), { state: "open", accepted_in: null, answered_by: null, answered_at: null, answer_note: null }, "a claim that never finished: open again");
  // Claimed for one version while the author makes another that changes its piece: that version supersedes it.
  claimed(held, "a1a1a1a1a1a1");
  const pack = await headPackOf(pack2);
  pack.items.find((i) => i.id === "balletje").means = "The girl plays with a ball (the author's).";
  // (confirm_reverts: the race above may have left a correction to this piece accepted, which this undoes.)
  const update = await app(owner, "POST", `/api/community/items/${pack2}/update`, { pack, confirmReverts: true });
  assert(update.status === 200 && update.body.updated, `the author's version: ${JSON.stringify(update.body)}`);
  eq(settled(held), { state: "superseded", accepted_in: null, answered_by: null, answered_at: null, answer_note: null }, "superseded, with nothing of the claim left");
  eq(sql("SELECT COUNT(*) AS n FROM corrections WHERE state = 'accepting' OR accepted_in LIKE 'claim:%'")[0].n, 0, "no claim left behind");
});

await stage("an update that leaves an accepted correction's own fields as they are doesn't ask (a sentence's punctuation fixed, then its gap changed); one that undoes them does", async () => {
  const current = (await headPackOf(pack2)).items.find((i) => i.id === "eet-smakelijk");
  const fix = await app(fixer, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/eet-smakelijk/words", kind: "fix", value: { words: current.words, punct: "." }, note: "A wish, not a shout." });
  assert(fix.status === 200, `the punctuation fix: ${JSON.stringify(fix.body)}`);
  const accepted = await app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { accept: [fix.body.id] });
  assert(accepted.status === 200 && accepted.body.reviewed, `accepted: ${JSON.stringify(accepted.body)}`);
  eq([stateOf(fix.body.id).state, stateOf(fix.body.id).accepted_in], ["accepted", headOf(pack2)], "accepted, into the head");
  const gapped = await headPackOf(pack2);
  gapped.items.find((i) => i.id === "eet-smakelijk").gap = { index: 1, options: ["smakelijk", "lekker", "heerlijk"] };
  const gap = await app(owner, "POST", `/api/community/items/${pack2}/update`, { pack: gapped });
  assert(gap.status === 200 && gap.body.updated, `only its gap changed: no question (${JSON.stringify(gap.body)})`);
  const undone = await headPackOf(pack2);
  Object.assign(undone.items.find((i) => i.id === "eet-smakelijk"), { punct: "!", text: undefined });
  const back = await app(owner, "POST", `/api/community/items/${pack2}/update`, { pack: undone });
  assert(back.status === 422 && /undoes 1 accepted correction \(items\/eet-smakelijk\/words by Corr Fixer\)/.test(JSON.stringify(back.body.errors)), `its punctuation put back: asked first (${JSON.stringify(back.body)})`);
});

await stage("an update identical to an earlier version of the pack is refused in words (each version is kept once), never a 500", async () => {
  const again = await app(owner, "POST", `/api/community/items/${packId}/update`, { pack: { ...NL, id: packId } });
  assert(again.status === 422 && /same as version 1 of this pack/.test(JSON.stringify(again.body.errors)), `the first version again: ${again.status} ${JSON.stringify(again.body)}`);
});

await stage("a fix of the wrong kind answers with its problem, never a 500", async () => {
  const item = NL.items.find((i) => i.id === "eet-smakelijk");
  const odd = await app(second, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/eet-smakelijk/words", kind: "fix", value: { words: item.words, punct: { toString: null } } });
  assert(odd.status === 422 && /punct is a string/.test(JSON.stringify(odd.body.errors)), `punct that's an object: ${odd.status} ${JSON.stringify(odd.body)}`);
});

await stage("on one of the library's own packs: only an admin answers, and the accept is a new default version on the catalog", async () => {
  const starter = BUILT_IN[0];
  execFileSync("node", [join(APP, "scripts/packs/seed-local.mjs"), join(APP, "public/js/packs/starter-word-order.js"), "--persist-to", PERSIST], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
  await must(admin, "library_shelf", { sections: [] }); // a catalog write through the tools indexes it in Explore
  // Indexed with the grammar its sentences use (the catalog's: it defines none of its own) and its own topics where
  // they're plainly Explore's (people → Family and friends, home → Home; plans and out stay unmapped).
  const used = new Set(starter.items.flatMap((i) => i.concepts ?? [])).size;
  const indexedItem = async () => (await app(follower, "GET", `/api/community/items/${starter.id}`)).body.item;
  let shown = await indexedItem();
  eq([shown.badges.patterns, shown.topics.map((t) => t.id)], [used, ["family", "home"]], "the starter's patterns and topics in Explore");
  // A row indexed before (the old count, no topics) is brought up to date by the next catalog write.
  sql(`UPDATE items SET badges = json_set(badges, '$.patterns', 0), topics = '[]' WHERE id = ${q(starter.id)}`);
  await must(admin, "library_shelf", { sections: [] });
  shown = await indexedItem();
  eq([shown.badges.patterns, shown.topics.map((t) => t.id)], [used, ["family", "home"]], "an out-of-date row, brought up to date");
  const counted = () => sql(`SELECT json_extract(summary, '$.counts.patterns') AS n FROM item_versions WHERE item_id = ${q(starter.id)} AND version = ${q(headOf(starter.id))}`)[0].n;
  eq(counted(), used, "its version's counts too");
  // A sync that claimed the index and never finished (its request ended): an admin reading the catalog finishes it,
  // without a new revision.
  sql(`UPDATE items SET badges = json_set(badges, '$.patterns', 0), topics = '[]' WHERE id = ${q(starter.id)}`);
  sql("UPDATE library_index SET done = 0, token = 'a-sync-that-died' WHERE id = 1");
  await must(admin, "library_get", {});
  shown = await indexedItem();
  eq([shown.badges.patterns, shown.topics.map((t) => t.id), sql("SELECT done FROM library_index WHERE id = 1")[0].done], [used, ["family", "home"], 1], "an unfinished index, finished by library_get");
  const before = (await (await fetch(`${BASE}/library/catalogue.json`)).json()).packs.nl.find((p) => p.id === starter.id).version;
  const item = starter.items[0];
  const fix = await app(fixer, "POST", `/api/community/items/${starter.id}/corrections`, { path: `items/${item.id}/means`, kind: "fix", value: `${item.means} (fixed)` });
  assert(fix.status === 200, JSON.stringify(fix.body));
  const byOwner = await app(owner, "POST", `/api/community/items/${starter.id}/corrections/review`, { accept: [fix.body.id] });
  assert(byOwner.status === 400 && /admin's/.test(byOwner.body.error), `not an admin: ${JSON.stringify(byOwner.body)}`);
  const accepted = await must(admin, "review_corrections", { id: starter.id, accept: [fix.body.id] });
  const after = (await (await fetch(`${BASE}/library/catalogue.json`)).json()).packs.nl.find((p) => p.id === starter.id).version;
  assert(accepted.reviewed && after !== before && accepted.version === after, `a new default version: ${JSON.stringify(accepted)} (${before} → ${after})`);
  const pack = await (await fetch(`${BASE}/library/packs/${starter.id}/${after}/pack.json`)).json();
  eq([pack.items[0].means, pack.items.map((i) => i.id).join()], [`${item.means} (fixed)`, starter.items.map((i) => i.id).join()], "the fix in it; every item keeps its id");
  eq(stateOf(fix.body.id).state, "accepted", "accepted");
  assert((await must(admin, "library_history", {})).some((r) => /Corrections by Corr Fixer/.test(r.note ?? "")), "a library revision, its note naming who suggested it");
  // The admin's AI publishing from a copy made before it (the starter as it was): it undoes the fix, so it asks first.
  const [stale] = await stageAll(admin, [{ name: "starter-stale.json", bytes: Buffer.from(JSON.stringify(starter)) }]);
  const asked = await tool(admin, "library_publish", { pack: stale });
  const problems = JSON.stringify(asked);
  assert(asked.published === false && new RegExp(`undoes 1 accepted correction \\(items/${item.id}/means by Corr Fixer\\)`).test(problems) && /confirm_reverts/.test(problems), `a stale copy: asked first (${problems.slice(0, 400)})`);
  const anyway = await must(admin, "library_publish", { pack: stale, confirm_reverts: true });
  assert(anyway.published, `with confirm_reverts: ${JSON.stringify(anyway).slice(0, 300)}`);
  eq((await (await fetch(`${BASE}/library/catalogue.json`)).json()).packs.nl.find((p) => p.id === starter.id).version, before, "the starter as it was, back on the catalog");
  eq(stateOf(fix.body.id).state, "accepted", "the correction stays accepted, in the version it went into");
});

await stage("on one of the library's own packs, an accept that never finished: its claim is accepted if its version is on the catalog, and open again if not", async () => {
  const starter = BUILT_IN[0];
  const head = (await (await fetch(`${BASE}/library/catalogue.json`)).json()).packs.nl.find((p) => p.id === starter.id).version;
  const made = (await app(fixer, "POST", `/api/community/items/${starter.id}/corrections`, { path: `items/${starter.items[1].id}/means`, kind: "fix", value: `${starter.items[1].means} (made)` })).body.id;
  const lost = (await app(fixer, "POST", `/api/community/items/${starter.id}/corrections`, { path: `items/${starter.items[2].id}/means`, kind: "fix", value: `${starter.items[2].means} (lost)` })).body.id;
  assert(made && lost, "two fixes to claim");
  // The catalog written with its version, Explore's index not yet (the bookkeeping after it never ran); and one whose
  // version never got there.
  claimed(made, head, Date.now() - 31 * 60_000);
  claimed(lost, "b2b2b2b2b2b2", Date.now() - 31 * 60_000);
  const next = await app(follower, "POST", `/api/community/items/${starter.id}/corrections`, { path: `items/${starter.items[3].id}/means`, kind: "fix", value: `${starter.items[3].means} (next)` });
  assert(next.status === 200, `whoever comes next: ${JSON.stringify(next.body)}`);
  eq(settled(made), { state: "accepted", accepted_in: head, answered_by: owner.id, answered_at: settled(made).answered_at, answer_note: "in flight" }, "its version is on the catalog: accepted into it, its answer kept");
  eq(settled(lost), { state: "open", accepted_in: null, answered_by: null, answered_at: null, answer_note: null }, "its version isn't: open again");
});

await stage("the library's index never goes back: while a newer catalog's sync owns it, an older one's changes nothing, an accept still lands, and the next write catches it up", async () => {
  const starter = BUILT_IN[0];
  const indexed = headOf(starter.id);
  // As if a sync for a newer catalog than any to come had begun.
  const syncing = sql("SELECT rev FROM library_index WHERE id = 1")[0].rev;
  sql("UPDATE library_index SET rev = 1000000 WHERE id = 1");
  const item = starter.items[5];
  const fix = (await app(fixer, "POST", `/api/community/items/${starter.id}/corrections`, { path: `items/${item.id}/means`, kind: "fix", value: `${item.means} (indexed later)` })).body.id;
  assert(fix, "a fix");
  const accepted = await must(admin, "review_corrections", { id: starter.id, accept: [fix] });
  const onCatalog = (await (await fetch(`${BASE}/library/catalogue.json`)).json()).packs.nl.find((p) => p.id === starter.id).version;
  assert(accepted.reviewed && accepted.version === onCatalog, `the accept's version is on the catalog: ${JSON.stringify(accepted)}`);
  eq(headOf(starter.id), indexed, "Explore's index didn't move for an older catalog");
  eq([stateOf(fix).state, stateOf(fix).accepted_in], ["accepted", onCatalog], "accepted, settled by the catalog");
  sql(`UPDATE library_index SET rev = ${syncing} WHERE id = 1`);
  await must(admin, "library_shelf", { sections: [] }); // the next catalog write
  eq(headOf(starter.id), onCatalog, "the next write catches the index up to the catalog");
});

await stage("the catalog written again byte for byte from outside (the command line putting an earlier one back) is a new revision, and Explore follows it", async () => {
  const starter = BUILT_IN[0];
  const a = Buffer.from(await (await fetch(`${BASE}/library/catalogue.json`)).arrayBuffer());
  const etagOf = () => sql("SELECT etag FROM library_revisions ORDER BY rev DESC LIMIT 1")[0].etag;
  const etagA = etagOf();
  await must(admin, "library_unpublish", { pack: starter.id, lang: "nl", note: "Off for a moment (corrections-check)." });
  eq(sql(`SELECT state FROM items WHERE id = ${q(starter.id)}`)[0].state, "withdrawn", "off the catalog, out of Explore");
  // A again, its very bytes, as the command line would put it: the same etag as before.
  await r2.put("lexicommons-library", "catalogue.json", a, "application/json");
  await must(admin, "library_get", {});
  const newest = sql("SELECT rev, etag, action FROM library_revisions ORDER BY rev DESC LIMIT 1")[0];
  eq([newest.etag === etagA, newest.action], [true, "outside"], "a new revision of its own, though its etag is an earlier one's");
  eq(sql("SELECT rev, done FROM library_index WHERE id = 1")[0], { rev: newest.rev, done: 1 }, "Explore's index follows it");
  eq(sql(`SELECT state FROM items WHERE id = ${q(starter.id)}`)[0].state, "live", "the starter back in Explore");
});

await stage("reports on corrections: hidden at three established reports (and for minors at once, an admin's), seen only by its author with why, in the moderator's queue, upheld down for good, a moderator's hide and restore", async () => {
  const suggest = async (who, path, value, note) => {
    const made = await app(who, "POST", `/api/community/items/${pack2}/corrections`, { path, kind: "fix", value, note });
    assert(made.status === 200, `a fix to report: ${JSON.stringify(made.body)}`);
    return made.body.id;
  };
  const shownOf = (id) => sql(`SELECT shown, shown_reason FROM corrections WHERE id = ${q(id)}`)[0];
  const head = await headPackOf(pack2);
  // Spam in a correction's note: reported by three established accounts (over MCP and the app), hidden at the third.
  const spam = await suggest(second, "items/oma-gebeld/wrong", ["Ik heb oma gebelt.", "Oma ik heb gebeld."], "Cheap watches at watches.example, buy now");
  const first = await tool(reporters[0], "report", { correction: spam, reason: "spam", details: "An ad in the note." });
  assert(first.reported && !first.hidden, `one report: in the queue (${JSON.stringify(first)})`);
  eq((await app(reporters[1], "POST", `/api/community/corrections/${spam}/report`, { reason: "spam" })).body.hidden, false, "two: still shown");
  const third = await app(reporters[2], "POST", `/api/community/corrections/${spam}/report`, { reason: "spam", details: "Spam." });
  assert(third.status === 200 && third.body.hidden, `three established accounts: hidden (${JSON.stringify(third.body)})`);
  eq(shownOf(spam), { shown: "hidden", shown_reason: "Hidden after reports, while they're looked at." }, "hidden, saying why");
  // Hidden: listed for its author only, with why; nobody else sees it, likes it, or accepts it.
  assert(!(await app(follower, "GET", `/api/community/items/${pack2}/corrections`)).body.some((c) => c.id === spam), "not listed for anyone else");
  const mine = (await app(second, "GET", "/api/community/corrections/mine")).body.find((c) => c.id === spam);
  eq([mine?.shown, mine?.shownReason], ["hidden", "Hidden after reports, while they're looked at."], "its author sees it, and why");
  assert((await app(follower, "POST", `/api/community/corrections/${spam}/like`)).status === 400, "can't be liked");
  const accept = await app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { accept: [spam] });
  assert(accept.status === 400 && /hidden after a report/.test(accept.body.error), `can't be accepted: ${JSON.stringify(accept.body)}`);
  // The refusals.
  assert(/A copyright notice is about a shared pack/.test((await app(follower, "POST", `/api/community/corrections/${spam}/report`, { reason: "copyright" })).body.error), "copyright: about a pack, refused");
  assert(/yours/.test((await app(second, "POST", `/api/community/corrections/${spam}/report`, { reason: "spam" })).body.error), "your own: refused");
  assert(/already/.test((await app(reporters[1], "POST", `/api/community/corrections/${spam}/report`, { reason: "spam" })).body.error), "twice: refused");
  // The queue: a correction's case beside the packs', its case in full, and upheld: down for good.
  const queued = await must(moderator, "mod_queue", {});
  const kase = queued.cases.find((c) => c.correction === spam);
  eq([kase?.kind, kase?.count, kase?.reasons], ["correction", 3, ["spam"]], "the moderator's queue has it");
  const full = await must(moderator, "mod_get", { correction: spam });
  eq([full.correction.note, full.correction.pack.id, full.reports.length, full.author.name], ["Cheap watches at watches.example, buy now", pack2, 3, "Corr Second"], "its case: what it says, on which pack, its reports, its author");
  const upheld = await must(moderator, "mod_resolve", { report: full.reports[0].id, decision: "uphold", why: "An ad, not a correction." });
  eq([upheld.correction, upheld.shown], [spam, "removed"], "upheld: down for good");
  eq((await app(second, "GET", "/api/community/corrections/mine")).body.find((c) => c.id === spam)?.shownReason, "Taken down: An ad, not a correction.", "its author sees why");
  assert((await tool(moderator, "mod_restore", { correction: spam, why: "Changed my mind." })).error?.includes("only an admin"), "a moderator can't put back what's down for good");
  // Minors: hidden at once, an admin's; a moderator neither sees it in the queue nor dismisses it; an admin does.
  const severe = await suggest(reporters[0], "items/balletje/wrong", ["Het meisje speelt met een balletjes.", "Het meisje speel met een balletje."], "(a note a report says involves a minor)");
  const minors = await tool(reporters[1], "report", { correction: severe, reason: "minors", details: "Names a child." });
  assert(minors.hidden, `minors: hidden at once (${JSON.stringify(minors)})`);
  assert(!(await must(moderator, "mod_queue", {})).cases.some((c) => c.correction === severe), "escalated: not in a moderator's queue");
  const reportId = sql(`SELECT id FROM reports WHERE target_kind = 'correction' AND target_id = ${q(severe)}`)[0].id;
  assert((await tool(moderator, "mod_resolve", { report: reportId, decision: "dismiss", why: "Looks fine." })).error?.includes("escalated"), "a moderator can't dismiss it");
  const dismissed = await must(admin, "mod_resolve", { report: reportId, decision: "dismiss", why: "No child is named." });
  eq(dismissed.shown, "visible", "an admin dismisses it: shown again");
  // A moderator's own hide while a report is open, and the restore that dismisses it.
  const rude = await suggest(reporters[2], "items/eet-smakelijk/wrong", ["Smakelijk eet!", "Eet smakelijke!"], "This pack's author is an idiot");
  assert(/report it first/.test((await tool(moderator, "mod_hide", { correction: rude, why: "Insults." })).error ?? ""), "nothing reported: no hide");
  await must(reporters[0], "report", { correction: rude, reason: "abuse" });
  eq((await must(moderator, "mod_hide", { correction: rude, why: "Insults the author." })).shown, "hidden", "a moderator hides a reported one");
  eq(shownOf(rude), { shown: "hidden", shown_reason: "Hidden by a moderator: Insults the author." }, "saying so");
  eq((await must(moderator, "mod_restore", { correction: rude, why: "On reflection, it's about the pack." })).shown, "visible", "and restores it");
  eq(sql(`SELECT state FROM reports WHERE target_kind = 'correction' AND target_id = ${q(rude)}`)[0].state, "dismissed", "its report dismissed with it");
  // Hidden while an accept holds it: the claim is let go, so that accept makes no version with it.
  const inFlight = await suggest(follower, "items/balletje/means", "The girl is playing with a ball (in flight).", "A smoother line.");
  claimed(inFlight, "c3c3c3c3c3c3");
  assert((await tool(reporters[2], "report", { correction: inFlight, reason: "illegal", details: "(a report while it's being accepted)" })).hidden, "hidden at once");
  eq(settled(inFlight), { state: "open", accepted_in: null, answered_by: null, answered_at: null, answer_note: null }, "its accept's claim let go");
  // One pack or one correction, never both.
  assert(/one of them/.test((await tool(reporters[0], "report", { id: pack2, correction: rude, reason: "spam" })).error ?? ""), "id and correction together: refused");
  eq(head.items.length > 0, true, "the pack itself untouched by any of it");
});

await stage("a newer fix accepted over an earlier accepted one on the same piece: an accept never asks confirm_reverts (it's made on the head)", async () => {
  const one = (await app(second, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/oma-gebeld/means", kind: "fix", value: "I called my grandma yesterday (first)." })).body.id;
  eq((await app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { accept: [one] })).status, 200, "the first, accepted");
  const two = (await app(reporters[1], "POST", `/api/community/items/${pack2}/corrections`, { path: "items/oma-gebeld/means", kind: "fix", value: "I called my grandma yesterday (second)." })).body.id;
  const over = await app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { accept: [two] });
  assert(over.status === 200 && over.body.reviewed, `the second over it, no question asked: ${JSON.stringify(over.body)}`);
  const head = await headPackOf(pack2);
  eq([head.items.find((i) => i.id === "oma-gebeld").means, stateOf(one).state, stateOf(two).state], ["I called my grandma yesterday (second).", "accepted", "accepted"], "the head has the second; both accepted, each into its version");
});

await stage("an accept reaches the author's own pack on their devices (through the relay: only the sentence it fixes, their own edits kept); with no copy on the server, it says so", async () => {
  // A third pack, and its author's own copy of it on a device of theirs, with an edit of their own since sharing.
  const source = { ...NL, id: `corr3-${run}`, name: "Corrections relay check", items: NL.items.map((i, n) => (n === 2 ? { ...i, means: `${i.means} (shared)` } : i)) };
  const shared = await app(owner, "POST", "/api/community/share", { pack: source, level: "A1", topics: ["food"] });
  assert(shared.status === 200, `the third pack: ${JSON.stringify(shared.body)}`);
  const pack3 = shared.body.id;
  const device = `corrcheck${run}`;
  const mine = structuredClone(source);
  mine.items[1] = { ...mine.items[1], means: `${mine.items[1].means} (my own edit)` };
  eq((await app(owner, "PUT", "/api/packs/device", { device, label: "Corr phone", packs: [{ id: source.id, name: source.name, language: "nl", kind: "yours", on: true, items: source.items.length }] })).status, 200, "the author's device");
  eq((await app(owner, "PUT", `/api/packs/copies/${source.id}`, { device, pack: mine, through: 0 })).status, 200, "its copy of their pack");
  const target = source.items[0];
  const fix = (await app(fixer, "POST", `/api/community/items/${pack3}/corrections`, { path: `items/${target.id}/means`, kind: "fix", value: `${target.means} (relayed)` })).body.id;
  const accepted = await app(owner, "POST", `/api/community/items/${pack3}/corrections/review`, { accept: [fix] });
  assert(accepted.status === 200 && accepted.body.ownerCopy?.updated === true && accepted.body.ownerCopy.devices === 1, `the author's own pack: ${JSON.stringify(accepted.body)}`);
  const inbox = await app(owner, "GET", `/api/packs/inbox?device=${device}`);
  const change = inbox.body?.changes?.find((c) => c.id === accepted.body.ownerCopy.change);
  assert(change && change.source === "explore:corrections" && change.said.includes("brought in 1 accepted correction to Corrections relay check"), `on their device, from Explore: ${JSON.stringify(inbox.body).slice(0, 500)}`);
  const body = JSON.stringify(change.change);
  assert(body.includes(`${target.means} (relayed)`) && !body.includes("(my own edit)") && !body.includes(`"${mine.items[1].id}"`), `only the sentence it fixes: ${body.slice(0, 400)}`);
  // The second pack's author has no copy of it on the server: the accept is made all the same, and says so.
  const lone = (await app(follower, "POST", `/api/community/items/${pack2}/corrections`, { path: "items/eet-smakelijk/means", kind: "fix", value: "Enjoy your meal, everyone!" })).body.id;
  const noCopy = await app(owner, "POST", `/api/community/items/${pack2}/corrections/review`, { accept: [lone] });
  assert(noCopy.status === 200 && noCopy.body.reviewed && noCopy.body.ownerCopy?.updated === false && noCopy.body.ownerCopy.reason === "no_copy" && /None of your devices has sent this pack yet/.test(noCopy.body.ownerCopy.why), `no copy: ${JSON.stringify(noCopy.body)}`);
  eq(stateOf(lone).state, "accepted", "accepted all the same");
});

await stage("crafted bodies on Explore's and the library's routes: an object whose toString is null where text goes, not JSON, not an object, past the limit: answered in words, never a 500", async () => {
  const NASTY = { toString: null };
  const routes = [
    [fixer, "POST", `/api/community/items/${pack2}/follow`, ["corrections"]],
    [fixer, "POST", "/api/community/terms", ["version"]],
    [fixer, "POST", "/api/community/share", ["pack", "title", "about", "note", "level", "topics"]],
    [owner, "POST", `/api/community/items/${pack2}/update`, ["pack", "title", "about", "note", "level", "topics"]],
    [fixer, "POST", `/api/community/items/${pack2}/corrections`, ["path", "kind", "value", "note", "version"]],
    [owner, "POST", `/api/community/items/${pack2}/corrections/review`, ["accept", "decline", "note"]],
    [fixer, "POST", `/api/community/items/${pack2}/report`, ["reason", "details", "version", "notice"]],
    [owner, "POST", `/api/community/items/${pack2}/counter-notice`, ["statement", "name", "email", "report"]],
    [fixer, "POST", `/api/community/corrections/${sql("SELECT id FROM corrections ORDER BY created_at DESC LIMIT 1")[0].id}/report`, ["reason", "details"]],
    [admin, "POST", "/api/v1/admin/library/upload", ["files"]],
    [admin, "POST", "/api/v1/admin/library/check", ["book", "layers", "list", "pack", "audio"]],
    [admin, "POST", "/api/v1/admin/library/publish", ["book", "layers", "list", "pack", "audio", "note", "expectedRev"]],
    [admin, "POST", "/api/v1/admin/library/unpublish", ["book", "layer", "list", "pack", "audio", "lang", "note"]],
    [admin, "POST", "/api/v1/admin/library/restore", ["rev", "expectedRev"]],
    [admin, "PUT", "/api/v1/admin/library/shelf", ["sections", "expectedRev"]],
  ];
  const send = async (who, method, path, body) => {
    const headers = { "Content-Type": "application/json", ...(path.startsWith("/api/v1/") ? { Authorization: `Bearer ${who.token}` } : { Cookie: `lc_session=${who.cookie}` }) };
    const response = await fetch(`${BASE}${path}`, { method, headers, body });
    return { status: response.status, text: await response.text() };
  };
  const big = JSON.stringify({ note: "x".repeat(2_200_000) });
  const seen = [];
  for (const [who, method, path, fields] of routes) {
    const tries = {
      fields: JSON.stringify(Object.fromEntries(fields.map((f) => [f, NASTY]))),
      "fields in a list": JSON.stringify(Object.fromEntries(fields.map((f) => [f, [NASTY]]))),
      "not JSON": "{ not json",
      "not an object": JSON.stringify([NASTY]),
      "past the limit": big,
    };
    for (const [kind, body] of Object.entries(tries)) {
      const answer = await send(who, method, path, body);
      // Following has one field, and it's optional: unreadable, or a body that isn't an object (read as {}), it follows
      // as published. That's the field left out, not an error.
      // library/check is a check: it always answers 200, with ok and every problem.
      const fine =
        path.endsWith("/follow") && /^fields|not an object/.test(kind)
          ? answer.status === 200 && /"corrections":"published"/.test(answer.text)
          : path.endsWith("/library/check") && answer.status === 200
            ? /"ok":false/.test(answer.text) && /"problems":\[\{/.test(answer.text)
            : answer.status >= 400 && answer.status < 500 && /"(error|errors|problems)":/.test(answer.text);
      assert(fine, `${method} ${path}, ${kind}: ${answer.status} ${answer.text.slice(0, 200)}`);
      if (kind === "not JSON" || kind === "past the limit") assert(answer.status === 400 && (kind === "not JSON" ? /Send JSON/ : /more than/).test(answer.text), `${method} ${path}, ${kind}: refused by its reading (${answer.status} ${answer.text.slice(0, 120)})`);
      seen.push(answer.status);
    }
  }
  return `${routes.length} routes, ${seen.length} bodies: ${[...new Set(seen)].sort().join(", ")}`;
});

await stage("an account going: its likes leave the counts; its corrections stay, by a former member; the export has them", async () => {
  const id = (await app(second, "POST", `/api/community/items/${packId}/corrections`, { path: "words/meisje", kind: "fix", value: "girl, young woman" })).body.id;
  await app(outsider, "POST", `/api/community/corrections/${id}/like`);
  eq(stateOf(id).likes, 1, "liked");
  const exported = (await app(second, "GET", "/api/me/export")).body;
  assert(exported.corrections.some((c) => c.id === id), "in the author's export");
  eq((await app(outsider, "DELETE", "/api/me", { confirm: "delete my account" })).status, 200, "the liker goes");
  eq(stateOf(id).likes, 0, "the like left the count");
  eq((await app(second, "DELETE", "/api/me", { confirm: "delete my account" })).status, 200, "the author goes");
  const list = (await app(follower, "GET", `/api/community/items/${packId}/corrections`)).body;
  eq(list.find((c) => c.id === id)?.by, "a former member", "the correction stays, by a former member");
});

const passed = results.filter((r) => r.ok).length;
writeFileSync(join(OUT, "corrections-check.json"), `${JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2)}\n`);
console.log(`corrections check: ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
