#!/usr/bin/env node
// A revoked connection stays revoked, over HTTP as an AI app and its person, against a LOCAL server and its own state (src/revoked.ts;
// 6 Nov 2026, the Codex review's C2): what the Node test (test-revoked-grants.mjs) can't reach, the wiring:
//   - Settings' disconnect (DELETE /api/connections/:id) marks the grant, and its tokens work no more, on MCP and at /token;
//   - a grant marked while KV still holds it (as a refresh that wrote it back, or another location's stale read, leaves it): MCP refuses its
//     access token (401) and /token its refresh (400), where the control, a connection not marked, goes on;
//   - deleting the account marks every connection it had, and the marker names no one.
//
//   node scripts/revoke-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
// The server: wrangler dev --local-upstream localhost:<port> --persist-to <dir>, GATE_ENABLED:false, PUBLIC_ORIGIN:http://localhost:<port>,
// RP_ID:localhost, after the migrations. It writes its accounts and a marker straight into that state's D1, so it refuses any non-local URL.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [BASE_ARG, OUT_ARG] = process.argv.slice(2);
const PERSIST = process.argv[process.argv.indexOf("--persist-to") + 1];
if (!BASE_ARG || !OUT_ARG || !process.argv.includes("--persist-to") || !PERSIST) {
  console.error("usage: revoke-check.mjs http://localhost:<port> <outDir> --persist-to <state dir>");
  process.exit(2);
}
const BASE = BASE_ARG.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  console.error("revoke-check writes into the server's D1: a LOCAL server only.");
  process.exit(2);
}
const OUT = resolve(OUT_ARG);
mkdirSync(OUT, { recursive: true });
const RESOURCE = `${BASE}/mcp`;
const LOOPBACK = "http://127.0.0.1:9/callback";

const results = [];
async function stage(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.message ?? error) });
    console.log(`FAIL  ${name}\n      ${String(error.message ?? error).split("\n").join("\n      ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

// ---------- the account, written into the local D1 ----------

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
function account(name) {
  const userId = `rvk${randomBytes(5).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const now = Date.now();
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(userId)}, ${q(name)}, ${now})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(userId)}, ${now}, ${now + 86400_000}, 'revoke-check')`,
    ].join("; "),
  );
  return { userId, cookie };
}

// ---------- an AI app connecting, as a browser and an app would ----------

// A browser's cookies: the session, and whatever the pages set (the consent page binds its handle to this browser with one).
let jar = new Map();
const browser = async (url, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  if (init.method && init.method !== "GET") headers.set("Origin", BASE);
  const response = await fetch(url, { ...init, headers, redirect: "manual" });
  for (const set of response.headers.getSetCookie()) {
    const [pair] = set.split(";");
    const at = pair.indexOf("=");
    const name = pair.slice(0, at).trim();
    const value = pair.slice(at + 1).trim();
    if (!value || /max-age=0/i.test(set)) jar.delete(name);
    else jar.set(name, value);
  }
  return response;
};
const form = (fields) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
const unescape = (text) => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Registers an app, asks for scope (null: none named), reads the consent page, approves, exchanges the code. */
async function connect(name, scope) {
  const registered = await (
    await fetch(`${BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: name, redirect_uris: [LOOPBACK], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
    })
  ).json();
  assert(registered.client_id, `register: ${JSON.stringify(registered)}`);
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(`${BASE}/authorize`);
  const params = { response_type: "code", client_id: registered.client_id, redirect_uri: LOOPBACK, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: `revoke-${name}`, resource: RESOURCE, ...(scope ? { scope } : {}) };
  for (const [k, v] of Object.entries(params)) authorize.searchParams.set(k, v);
  const page = await browser(authorize.toString());
  const html = await page.text();
  assert(page.status === 200, `consent page: ${page.status}`);
  writeFileSync(join(OUT, `consent-${name}.html`), html);
  const said = [...(html.match(/<ul class="lx-consent-scopes">([\s\S]*?)<\/ul>/)?.[1] ?? "").matchAll(/<span>([^<]*)<\/span>/g)].map((m) => unescape(m[1]));
  const handle = unescape(html.match(/name="handle" value="([^"]*)"/)?.[1] ?? "");
  // The form's other hidden field, as a browser posts it: which account the page was drawn for (app.ts consentMark).
  const account = unescape(html.match(/name="account" value="([^"]*)"/)?.[1] ?? "");
  assert(handle, "consent handle");
  const back = await browser(`${BASE}/authorize`, form({ handle, account, decision: "approve" }));
  const to = new URL(back.headers.get("Location") ?? "", BASE);
  assert(to.searchParams.get("code"), `approve: ${back.status} ${to}`);
  const tokens = await (await fetch(`${BASE}/token`, form({ grant_type: "authorization_code", code: to.searchParams.get("code"), redirect_uri: LOOPBACK, client_id: registered.client_id, code_verifier: verifier, resource: RESOURCE }))).json();
  assert(tokens.access_token, `code exchange: ${JSON.stringify(tokens)}`);
  return { said, scope: String(tokens.scope ?? "").split(" ").filter(Boolean).sort(), token: tokens.access_token, refresh: tokens.refresh_token, clientId: registered.client_id };
}

async function rpc(token, method, params) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) return { status: response.status, raw: text.slice(0, 300) };
  return { status: response.status, ...JSON.parse(line.slice(6)) };
}

const sameSite = { Origin: BASE, "Content-Type": "application/json" };
const markerHash = (token) => {
  const [user, grant] = token.split(":");
  return sha256(`lexicommons revoked grant\n${user}:${grant}`);
};
const marked = (token) => sql(`SELECT COUNT(*) AS n FROM revoked_grants WHERE grant_hash = ${q(markerHash(token))}`)[0].n;
const mcpStatus = async (token) => (await rpc(token, "tools/list", {})).status;
async function refresh(app) {
  const response = await fetch(`${BASE}/token`, form({ grant_type: "refresh_token", refresh_token: app.refresh, client_id: app.clientId, resource: RESOURCE }));
  return { status: response.status, ...(await response.json().catch(() => ({}))) };
}
const as = (person) => {
  jar = new Map([["lc_session", person.cookie]]);
};

const person = account("Revoke check");

await stage("Settings' disconnect marks the grant; its tokens work no more on MCP or at /token", async () => {
  as(person);
  const app = await connect("disconnected", "learn:read learn:write");
  assert((await mcpStatus(app.token)) === 200, "MCP refused the connection before it was disconnected");
  const grant = app.token.split(":")[1];
  const listed = await (await browser(`${BASE}/api/connections`)).json();
  assert(listed.some((c) => c.id === grant), `the connection isn't listed: ${JSON.stringify(listed)}`);
  const gone = await browser(`${BASE}/api/connections/${grant}`, { method: "DELETE", headers: sameSite });
  assert(gone.status === 200, `disconnect: ${gone.status}`);
  assert(marked(app.token) === 1, "the grant wasn't marked");
  const mcp = await mcpStatus(app.token);
  const again = await refresh(app);
  assert(mcp === 401 && again.status === 400 && !again.access_token, `after: MCP ${mcp}, refresh ${again.status}`);
  return `marked; MCP ${mcp}, refresh ${again.status} ${again.error}`;
});

await stage("a grant marked while KV still holds it: MCP 401 and /token 400; one not marked goes on (the control)", async () => {
  as(person);
  const kept = await connect("kept", "learn:read learn:write");
  const stale = await connect("stale", "learn:read learn:write");
  // The marker alone, the grant left in KV: what a refresh that wrote it back, or a stale read elsewhere, leaves.
  sql(`INSERT INTO revoked_grants (grant_hash, revoked_at) VALUES (${q(markerHash(stale.token))}, ${Date.now()})`);
  const listed = await (await browser(`${BASE}/api/connections`)).json();
  assert(listed.some((c) => c.id === stale.token.split(":")[1]), "the marked grant isn't in KV any more: this stage proves nothing");
  const mcp = await mcpStatus(stale.token);
  assert(mcp === 401, `MCP answered the marked grant's token ${mcp}`);
  const turned = await refresh(stale);
  assert(turned.status === 400 && turned.error === "invalid_grant" && !turned.access_token, `/token answered ${turned.status} ${JSON.stringify(turned).slice(0, 160)}`);
  const after = await (await browser(`${BASE}/api/connections`)).json();
  assert(!after.some((c) => c.id === stale.token.split(":")[1]), "the marked grant a refresh met is still in KV");
  assert((await mcpStatus(kept.token)) === 200, "the control: MCP refused a connection not marked");
  const fresh = await refresh(kept);
  assert(fresh.status === 200 && fresh.access_token, `the control: its refresh ${fresh.status}`);
  return `MCP ${mcp}, refresh ${turned.status} (the grant deleted again); the control 200 and 200`;
});

await stage("deleting the account marks every connection it had, and the marker names no one", async () => {
  const leaving = account("Revoke check, leaving");
  as(leaving);
  const one = await connect("one", "learn:read learn:write");
  const two = await connect("two", "learn:read");
  const deleted = await browser(`${BASE}/api/me`, { method: "DELETE", headers: sameSite, body: JSON.stringify({ confirm: "delete my account" }) });
  assert(deleted.status === 200, `delete: ${deleted.status}`);
  assert(marked(one.token) === 1 && marked(two.token) === 1, `marked: ${marked(one.token)}, ${marked(two.token)}`);
  const columns = sql("SELECT name FROM pragma_table_info('revoked_grants')").map((c) => c.name).sort().join(",");
  assert(columns === "grant_hash,revoked_at", `the marker's columns: ${columns}`);
  const naming = sql(`SELECT COUNT(*) AS n FROM revoked_grants WHERE grant_hash LIKE ${q(`%${leaving.userId}%`)}`)[0].n;
  assert(!naming, "a marker names the account");
  const statuses = [await mcpStatus(one.token), await mcpStatus(two.token)];
  assert(statuses.every((s) => s === 401), `MCP after the delete: ${statuses}`);
  return `2 marked; MCP ${statuses.join(", ")}`;
});

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `revoke check: ${failed} of ${results.length} stages FAILED` : `revoke check: all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
