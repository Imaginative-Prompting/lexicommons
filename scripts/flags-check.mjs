#!/usr/bin/env node
// The site's flags over HTTP and MCP (src/flags.ts), on a LOCAL server started with wrangler.jsonc's own values (no --var for them:
// sharing "admins", the plan and a key of your own off, no Stripe, no Apple):
//   - a learner can't read the flags or preview one, and a preview cookie of their own is ignored; their AI has no flag tools;
//   - the app has no way to change what everyone has: its old site-wide PUT and DELETE answer 404, nothing stored, nothing logged;
//   - an admin's Feature flags page: the list in plain words (no secrets' names, no docs), previews on this device alone (sharing, the plan's
//     pages with Checkout still refused, a key of your own), each changing that admin's requests and nobody else's, Apple refused while its
//     ids and key aren't set, all of them off at once;
//   - the director's site-wide switches, over MCP (feature_flags, set_feature_flag) and REST, reaching a learner at once here (one isolate, which
//     the write cleared; every isolate within FLAG_TTL, a minute), the plan
//     refused without Stripe's keys, and every change in the admin log with who, old → new and why.
//   node scripts/flags-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
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
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: flags-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

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
function account(name, { admin = false } = {}) {
  const id = `fl${run}${randomBytes(4).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now - 30 * 86_400_000})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86_400_000}, 'flags-check')`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'check', ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now}, ${admin ? 1 : 0})`,
      `INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${q(id)}, 1, ${now})`,
      ...(admin ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, 'admin', ${now}, 'd1', 'flags-check')`] : []),
    ].join("; "),
  );
  return { id, name, cookie, token };
}
/** A request as the device sends it: its session, and the preview cookie the server set on it (who.preview), if any. */
async function app(who, method, path, body, headers = {}) {
  const cookie = `lc_session=${who.cookie}${who.preview ? `; lc_preview=${who.preview}` : ""}`;
  const response = await fetch(`${BASE}${path}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // A page, not JSON.
  }
  return { status: response.status, body: json, text, setCookie: response.headers.get("set-cookie") };
}
/** Keeps what a Set-Cookie for lc_preview said, as a browser would. */
function keep(who, setCookie) {
  const m = /lc_preview=([^;]*);[^]*?Max-Age=(\d+)/.exec(setCookie ?? "");
  assert(m, `no lc_preview cookie set: ${setCookie}`);
  assert(/HttpOnly/i.test(setCookie), `the preview cookie isn't HttpOnly: ${setCookie}`);
  who.preview = m[2] === "0" ? null : decodeURIComponent(m[1]);
}
async function rest(who, method, path, body) {
  const response = await fetch(`${BASE}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function rpc(who, method, params) {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(line.slice(6));
}
const toolNames = async (who) => new Set((await rpc(who, "tools/list", {})).result.tools.map((t) => t.name));
async function tool(who, name, args) {
  const { result, error } = await rpc(who, "tools/call", { name, arguments: args });
  if (error) return { error: error.message };
  if (result.isError) return { error: result.content[0].text };
  return JSON.parse(result.content[0].text);
}
const storedRows = () => sql("SELECT name, value FROM feature_flags ORDER BY name");
const flagLog = () => sql(`SELECT actor_id, via, action, target, before, after, note FROM admin_log WHERE action LIKE 'flag.%' ORDER BY created_at, rowid`);
/** Polls until fn() holds (a change reaching this server's one isolate, which the write cleared, at once), or fails after `within` ms. */
async function soon(fn, what, within = 8000) {
  const until = Date.now() + within;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last === true) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${what}: still ${JSON.stringify(last)} after ${within} ms`);
}

console.log(`flags check: ${BASE}`);
const lena = account("Lena (a learner)");
const ada = account("Ada (an admin)", { admin: true });
const bo = account("Bo (another admin)", { admin: true });
const me = async (who) => (await app(who, "GET", "/api/me")).body;
const ALL = "COMMUNITY_SHARING,PLAN_ENABLED,OWN_KEY_ENABLED,APPLE_SIGNIN";
const view = (m) => ({ sharing: m.features.sharing, plan: m.features.plan, ownKey: m.features.ownKey, mayShare: m.mayShare });
const EVERYONE = { sharing: "admins", plan: false, ownKey: false, mayShare: false };

await stage("a learner can't read the flags or preview one, their own preview cookie is ignored, and their AI has no flag tools", async () => {
  for (const [method, path, body] of [["GET", "/api/admin/flags"], ["PUT", "/api/admin/flags/COMMUNITY_SHARING/preview", { on: true }], ["DELETE", "/api/admin/previews"]]) {
    const r = await app(lena, method, path, body);
    assert(r.status === 403 && /Only an admin/.test(r.body?.error ?? ""), `${method} ${path}: ${r.status} ${r.text.slice(0, 200)}`);
  }
  for (const [method, path, body] of [["GET", "/admin/flags"], ["PUT", "/admin/flags/PLAN_ENABLED", { value: true }]]) {
    const r = await rest(lena, method, path, body);
    assert(r.status === 403, `REST ${method} ${path}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  // The cookie an admin's device has, on a learner's: nothing changes.
  lena.preview = ALL;
  const m = await me(lena);
  assert(JSON.stringify(view(m)) === JSON.stringify(EVERYONE), `a learner with a preview cookie: ${JSON.stringify(view(m))}`);
  const posted = await app(lena, "POST", "/api/community/requests", { kind: "pack", language: "nl", title: `Words for the market ${run}` });
  assert(posted.status === 403, `a learner's request with a preview cookie: ${posted.status}`);
  const pricing = await app(lena, "GET", "/pricing");
  assert(pricing.status === 404, `/pricing for a learner with a preview cookie: ${pricing.status}`);
  lena.preview = null;
  const tools = await toolNames(lena);
  assert(!tools.has("feature_flags") && !tools.has("set_feature_flag"), "a learner's AI has the flag tools");
  assert(storedRows().length === 0 && flagLog().length === 0, `written: ${JSON.stringify(storedRows())}`);
});

await stage("the app can't change what everyone has: its site-wide PUT and DELETE are gone (404), nothing stored or logged", async () => {
  for (const [method, path, body] of [["PUT", "/api/admin/flags/COMMUNITY_SHARING", { value: "everyone" }], ["DELETE", "/api/admin/flags/COMMUNITY_SHARING"]]) {
    const r = await app(ada, method, path, body);
    assert(r.status === 404, `${method} ${path}: ${r.status} ${r.text.slice(0, 200)}`);
  }
  assert(storedRows().length === 0 && flagLog().length === 0, `written: ${JSON.stringify(storedRows())}`);
  assert((await me(lena)).mayShare === false, "sharing opened");
});

await stage("an admin's Feature flags page: every flag with what everyone has, previews off, Apple's reason in plain words, no secrets' names or docs", async () => {
  const r = await app(ada, "GET", "/api/admin/flags");
  assert(r.status === 200, `${r.status} ${r.text.slice(0, 200)}`);
  const by = Object.fromEntries(r.body.flags.map((f) => [f.name, f]));
  assert(JSON.stringify(Object.keys(by)) === JSON.stringify(["COMMUNITY_SHARING", "PLAN_ENABLED", "OWN_KEY_ENABLED", "APPLE_SIGNIN", "SIGNUPS"]), Object.keys(by).join(", "));
  // New accounts paused (signups.ts): open as wrangler.jsonc has it, and not previewable (only someone signed out sees it), said in words.
  assert(by.SIGNUPS.value === "open" && /signed out/.test(by.SIGNUPS.preview.can?.missing ?? ""), JSON.stringify(by.SIGNUPS));
  assert(by.COMMUNITY_SHARING.value === "admins" && by.PLAN_ENABLED.value === false && by.OWN_KEY_ENABLED.value === false, JSON.stringify(r.body.flags.map((f) => f.value)));
  assert(r.body.flags.every((f) => f.preview.on === false), "a preview on with no cookie");
  assert(JSON.stringify(by.APPLE_SIGNIN.preview.can) === JSON.stringify({ missing: "Apple's ids and key aren't set" }), JSON.stringify(by.APPLE_SIGNIN.preview));
  assert(by.PLAN_ENABLED.preview.can === true, "the plan can't be previewed without Stripe");
  const words = JSON.stringify(r.body.flags.map(({ name, ...rest }) => rest));
  assert(!/STRIPE_|APPLE_SERVICES_ID|APPLE_PRIVATE_KEY|\.md|docs\//.test(words), `a secret's name or a doc reaches the page: ${words.match(/STRIPE_\w+|APPLE_\w+|[\w/.-]+\.md/)?.[0]}`);
});

await stage("an admin previews sharing on their device: their requests see it open; a learner and another admin, the same moment, don't", async () => {
  const set = await app(ada, "PUT", "/api/admin/flags/COMMUNITY_SHARING/preview", { on: true });
  assert(set.status === 200 && set.body.flag.preview.on === true, `${set.status} ${set.text.slice(0, 200)}`);
  keep(ada, set.setCookie);
  assert(ada.preview === "COMMUNITY_SHARING", `the cookie: ${ada.preview}`);
  const mine = view(await me(ada));
  assert(mine.sharing === "everyone", `the admin's own view: ${JSON.stringify(mine)}`);
  for (const [who, name] of [[lena, "the learner"], [bo, "another admin"]]) {
    const theirs = view(await me(who));
    assert(theirs.sharing === "admins", `${name}'s view: ${JSON.stringify(theirs)}`);
  }
  const refused = await app(lena, "POST", "/api/community/requests", { kind: "pack", language: "nl", title: `Words for the station ${run}` });
  assert(refused.status === 403, `a learner's request: ${refused.status}`);
  const listed = await app(ada, "GET", "/api/admin/flags");
  assert(listed.body.flags.find((f) => f.name === "COMMUNITY_SHARING").preview.on === true && listed.body.flags.find((f) => f.name === "COMMUNITY_SHARING").value === "admins", "the list with the cookie");
  assert(storedRows().length === 0 && flagLog().length === 0, `a preview written: ${JSON.stringify(storedRows())}`);
});

await stage("the plan previewed: its pages and features.plan for this admin, Checkout still refused without Stripe's keys; nothing for the learner", async () => {
  const set = await app(ada, "PUT", "/api/admin/flags/PLAN_ENABLED/preview", { on: true });
  assert(set.status === 200, `${set.status} ${set.text.slice(0, 200)}`);
  keep(ada, set.setCookie);
  assert(ada.preview === "COMMUNITY_SHARING,PLAN_ENABLED", `the cookie: ${ada.preview}`);
  assert((await me(ada)).features.plan === true, "features.plan for the admin previewing it");
  const pricing = await app(ada, "GET", "/pricing");
  assert(pricing.status === 200 && pricing.text.includes("<title>Pricing · Lexicommons</title>"), `/pricing for the admin: ${pricing.status}`);
  const privacy = await app(ada, "GET", "/privacy");
  assert(privacy.text.includes("If you buy the plan"), "the privacy policy's plan part isn't shown to the admin");
  const checkout = await app(ada, "POST", "/api/billing/checkout", { interval: "month" });
  assert(checkout.status === 404 && /isn't offered/.test(checkout.body?.error ?? ""), `Checkout: ${checkout.status} ${checkout.text.slice(0, 200)}`);
  assert((await me(lena)).features.plan === false, "features.plan for the learner");
  assert((await app(lena, "GET", "/pricing")).status === 404, "/pricing for the learner");
  assert(!(await app(lena, "GET", "/privacy")).text.includes("If you buy the plan"), "the plan's part shown to the learner");
});

await stage("a key of your own previewed for this admin alone; Apple refused in plain words while its ids and key aren't set", async () => {
  const set = await app(ada, "PUT", "/api/admin/flags/OWN_KEY_ENABLED/preview", { on: true });
  assert(set.status === 200, `${set.status} ${set.text.slice(0, 200)}`);
  keep(ada, set.setCookie);
  assert((await me(ada)).features.ownKey === true, "features.ownKey for the admin");
  assert((await me(lena)).features.ownKey === false, "features.ownKey for the learner");
  const apple = await app(ada, "PUT", "/api/admin/flags/APPLE_SIGNIN/preview", { on: true });
  assert(apple.status === 400 && apple.body?.error === "Sign in with Apple can't be previewed here: Apple's ids and key aren't set.", `${apple.status} ${apple.text.slice(0, 200)}`);
  assert(storedRows().length === 0 && flagLog().length === 0, "a preview written");
});

await stage("every preview off at once: the cookie cleared and the admin back to what everyone has", async () => {
  const off = await app(ada, "DELETE", "/api/admin/previews");
  assert(off.status === 200 && off.body.flags.every((f) => f.preview.on === false), `${off.status} ${off.text.slice(0, 200)}`);
  keep(ada, off.setCookie);
  assert(ada.preview === null, `the cookie still: ${ada.preview}`);
  const mine = view(await me(ada));
  assert(mine.sharing === "admins" && mine.plan === false && mine.ownKey === false, JSON.stringify(mine));
});

await stage("the director's switches, for everyone, over MCP and REST: a learner follows at once on this isolate; the plan refused without Stripe's keys", async () => {
  const tools = await toolNames(ada);
  assert(tools.has("feature_flags") && tools.has("set_feature_flag"), "an admin's AI hasn't the flag tools");
  const listed = await tool(ada, "feature_flags", {});
  assert(listed.flags?.length === 5 && /STRIPE_SECRET_KEY/.test(listed.flags.find((f) => f.name === "PLAN_ENABLED").ready?.how ?? ""), JSON.stringify(listed).slice(0, 300));
  const set = await tool(ada, "set_feature_flag", { name: "COMMUNITY_SHARING", value: "everyone", why: "flags-check over MCP" });
  assert(set.flag?.value === "everyone", JSON.stringify(set));
  await soon(async () => ((await me(lena)).mayShare === true ? true : "mayShare false"), "the learner's /api/me");
  const posted = await app(lena, "POST", "/api/community/requests", { kind: "pack", language: "nl", title: `Words for the market ${run}` });
  assert(posted.status === 200, `a learner's request: ${posted.status} ${posted.text.slice(0, 200)}`);
  const back = await tool(ada, "set_feature_flag", { name: "COMMUNITY_SHARING", to_default: true, why: "flags-check over MCP: done" });
  assert(back.flag?.value === "admins" && back.flag.set === null, JSON.stringify(back));
  await soon(async () => ((await me(lena)).mayShare === false ? true : "mayShare true"), "the learner's /api/me");
  const refused = await tool(ada, "set_feature_flag", { name: "PLAN_ENABLED", value: true, why: "flags-check over MCP" });
  assert(/The paid plan can't turn on: Stripe's keys and prices aren't set\./.test(refused.error ?? ""), JSON.stringify(refused));
  const viaRest = await rest(ada, "PUT", "/admin/flags/OWN_KEY_ENABLED", { value: true, why: "flags-check over REST" });
  assert(viaRest.status === 200 && viaRest.body.flag.value === true, `REST: ${viaRest.status} ${JSON.stringify(viaRest.body)}`);
  await soon(async () => ((await me(lena)).features.ownKey === true ? true : "ownKey false"), "the learner's features.ownKey");
  const restBack = await rest(ada, "DELETE", "/admin/flags/OWN_KEY_ENABLED");
  assert(restBack.status === 200 && restBack.body.flag.set === null, `REST reset: ${restBack.status}`);
});

await stage("the admin log has the director's changes and nothing of the previews: who, through what, old → new and why", async () => {
  const lines = flagLog().map((e) => `${e.actor_id === ada.id ? "ada" : e.actor_id} ${e.via === "pat:check" ? "ai" : e.via.startsWith("rest") ? "rest" : e.via} ${e.action} ${e.target}: ${e.note}`);
  const want = [
    "ada ai flag.set flag:COMMUNITY_SHARING: admins → everyone: flags-check over MCP",
    "ada ai flag.reset flag:COMMUNITY_SHARING: everyone → admins (the site's default): flags-check over MCP: done",
    "ada rest flag.set flag:OWN_KEY_ENABLED: false → true: flags-check over REST",
    "ada rest flag.reset flag:OWN_KEY_ENABLED: true → false (the site's default)",
  ];
  assert(JSON.stringify(lines) === JSON.stringify(want), `the log:\n${lines.join("\n")}\nwanted:\n${want.join("\n")}`);
  assert(storedRows().length === 0, `stored: ${JSON.stringify(storedRows())}`);
  return `${lines.length} entries`;
});

writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} of ${results.length} stages FAILED` : `all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
