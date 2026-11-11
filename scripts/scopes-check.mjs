#!/usr/bin/env node
// What an AI app's token may do is what the consent page said, over HTTP as an AI app, against a LOCAL server and its own state:
//   - a token granted only learn:read: the consent page says only that; MCP lists only tools marked read-only and refuses every other
//     (save_note changes nothing in D1); a read-only tool works;
//   - a request naming no scope: the consent page lists reading AND writing, which is what the token gets, and writing works;
//   - both scopes asked for, and a personal token: every tool, writing works;
//   - each with its control (the write that must work, does), so the check can fail;
//   - a consent page opened as one account and approved after switching to another grants neither (C3), where the same page approved by
//     the account it was opened for connects (the control).
// workers-oauth-provider only advertises requiredScopes; src/mcp.ts enforces them (6 Nov 2026, Codex review S1/S2).
//
//   node scripts/scopes-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
// The server: wrangler dev --local-upstream localhost:<port> --persist-to <dir>, GATE_ENABLED:false, PUBLIC_ORIGIN:http://localhost:<port>,
// RP_ID:localhost, after the migrations. It writes its account straight into that state's D1, so it refuses any non-local URL.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [BASE_ARG, OUT_ARG] = process.argv.slice(2);
const PERSIST = process.argv[process.argv.indexOf("--persist-to") + 1];
if (!BASE_ARG || !OUT_ARG || !process.argv.includes("--persist-to") || !PERSIST) {
  console.error("usage: scopes-check.mjs http://localhost:<port> <outDir> --persist-to <state dir>");
  process.exit(2);
}
const BASE = BASE_ARG.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  console.error("scopes-check writes into the server's D1: a LOCAL server only.");
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
const userId = `scp${randomBytes(5).toString("hex")}`;
const cookie = randomBytes(24).toString("base64url");
const pat = `lct_${randomBytes(24).toString("base64url")}`;
const now = Date.now();
sql(
  [
    `INSERT INTO users (id, name, created_at) VALUES (${q(userId)}, 'Scopes check', ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(userId)}, ${now}, ${now + 86400_000}, 'scopes-check')`,
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(userId)}, 'scopes-check', ${q(sha256(pat))}, ${q(pat.slice(0, 10))}, ${now}, 0)`,
  ].join("; "),
);
const notes = () => sql(`SELECT COUNT(*) AS n FROM notes WHERE user_id = ${q(userId)}`)[0].n;

// ---------- an AI app connecting, as a browser and an app would ----------

// A browser's cookies: the session, and whatever the pages set (the consent page binds its handle to this browser with one).
const jar = new Map([["lc_session", cookie]]);
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
  const params = { response_type: "code", client_id: registered.client_id, redirect_uri: LOOPBACK, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: `scopes-${name}`, resource: RESOURCE, ...(scope ? { scope } : {}) };
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
  return { said, scope: String(tokens.scope ?? "").split(" ").filter(Boolean).sort(), token: tokens.access_token };
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
const tools = async (token) => (await rpc(token, "tools/list", {})).result?.tools ?? [];
async function call(token, name, args) {
  const answer = await rpc(token, "tools/call", { name, arguments: args });
  return { ok: Boolean(answer.result && !answer.result.isError), error: answer.error?.message ?? (answer.result?.isError ? answer.result.content?.[0]?.text : undefined) ?? answer.raw };
}
const READ_WORDS = "See your study progress and what you've made";
const WRITE_WORDS = "Add notes, lessons and audio to your library";

// ---------- the stages ----------

/** Registers an app and opens its consent page in the browser as it is now: the handle, the account mark, the client. */
async function openConsent(name) {
  const registered = await (
    await fetch(`${BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: name, redirect_uris: [LOOPBACK], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
    })
  ).json();
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(`${BASE}/authorize`);
  const params = { response_type: "code", client_id: registered.client_id, redirect_uri: LOOPBACK, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: `scopes-${name}`, resource: RESOURCE, scope: "learn:read learn:write" };
  for (const [k, v] of Object.entries(params)) authorize.searchParams.set(k, v);
  const page = await browser(authorize.toString());
  const html = await page.text();
  assert(page.status === 200, `consent page: ${page.status}`);
  const field = (n) => unescape(html.match(new RegExp(`name="${n}" value="([^"]*)"`))?.[1] ?? "");
  return { handle: field("handle"), account: field("account"), clientId: registered.client_id };
}
const accountExists = (who) => sql(`SELECT COUNT(*) AS n FROM users WHERE id = ${q(who)}`)[0].n === 1;

await stage("a token granted only learn:read: the page says only reading; MCP lists only read-only tools and refuses a write", async () => {
  const app = await connect("readonly", "learn:read");
  assert(JSON.stringify(app.said) === JSON.stringify([READ_WORDS]), `the page said ${JSON.stringify(app.said)}`);
  assert(JSON.stringify(app.scope) === JSON.stringify(["learn:read"]), `granted ${app.scope}`);
  const listed = await tools(app.token);
  assert(listed.length > 5, `listed ${listed.length}`);
  const writes = listed.filter((t) => t.annotations?.readOnlyHint !== true).map((t) => t.name);
  assert(!writes.length, `write tools listed: ${writes.join(", ")}`);
  const before = notes();
  const saved = await call(app.token, "save_note", { text: "a read-only token wrote this" });
  assert(!saved.ok && notes() === before, `save_note: ${JSON.stringify(saved)}, notes ${before} → ${notes()}`);
  const read = await call(app.token, "list_notes", {});
  assert(read.ok, `a read-only tool: ${JSON.stringify(read)}`);
  return `${listed.length} tools, all read-only; save_note refused (${String(saved.error).slice(0, 60)})`;
});

await stage("a request naming no scope: the page lists reading AND writing, the token gets both, and writing works", async () => {
  const app = await connect("noscope", null);
  assert(JSON.stringify(app.said) === JSON.stringify([READ_WORDS, WRITE_WORDS]), `the page said ${JSON.stringify(app.said)}`);
  assert(JSON.stringify(app.scope) === JSON.stringify(["learn:read", "learn:write"]), `granted ${app.scope}`);
  const before = notes();
  const saved = await call(app.token, "save_note", { text: "a token with both scopes wrote this" });
  assert(saved.ok && notes() === before + 1, `save_note: ${JSON.stringify(saved)}`);
  return `said and granted: ${app.scope.join(" ")}`;
});

await stage("both scopes asked for: every tool listed, and writing works (the control)", async () => {
  const app = await connect("both", "learn:read learn:write");
  const listed = await tools(app.token);
  assert(listed.some((t) => t.name === "save_note") && listed.some((t) => t.annotations?.readOnlyHint !== true), "no write tools listed");
  const before = notes();
  assert((await call(app.token, "save_note", { text: "both scopes" })).ok && notes() === before + 1, "save_note didn't write");
  return `${listed.length} tools`;
});

await stage("a personal token: every tool, and writing works", async () => {
  const listed = await tools(pat);
  assert(listed.some((t) => t.name === "save_note"), "save_note not listed for a personal token");
  const before = notes();
  assert((await call(pat, "save_note", { text: "a personal token" })).ok && notes() === before + 1, "save_note didn't write");
  return `${listed.length} tools`;
});

await stage("a consent page opened as one account and approved as another grants neither; approved by its own account, it connects", async () => {
  // A second account in the same browser: its own session.
  const otherId = `scp${randomBytes(5).toString("hex")}`;
  const otherCookie = randomBytes(24).toString("base64url");
  const at = Date.now();
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(otherId)}, 'Scopes check other', ${at})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(otherCookie))}, ${q(otherId)}, ${at}, ${at + 86400_000}, 'scopes-check')`,
    ].join("; "),
  );
  assert(accountExists(otherId), "the second account wasn't made");
  const opened = await openConsent("switched");
  assert(opened.handle, `the page's form has no handle: ${JSON.stringify(opened)}`);
  // Signed out and in as the other account elsewhere, then the first page's Connect.
  jar.set("lc_session", otherCookie);
  const crossed = await browser(`${BASE}/authorize`, form({ handle: opened.handle, account: opened.account, decision: "approve" }));
  const crossedText = await crossed.text();
  const crossedTo = crossed.headers.get("Location") ?? "";
  assert(!/[?&]code=/.test(crossedTo), `approved as the other account: ${crossed.status} ${crossedTo}`);
  assert(crossed.status === 409 && /opened for another account/.test(crossedText), `the other account's answer: ${crossed.status} ${crossedText.slice(0, 200)}`);
  assert(opened.account, "the page's form carries no account mark");
  // Nor with the mark left out, or another page's mark.
  const bare = await browser(`${BASE}/authorize`, form({ handle: opened.handle, decision: "approve" }));
  assert(bare.status === 409 && !/[?&]code=/.test(bare.headers.get("Location") ?? ""), `no mark: ${bare.status}`);
  // The control: back as the account the page was opened for, the same page connects.
  jar.set("lc_session", cookie);
  const own = await browser(`${BASE}/authorize`, form({ handle: opened.handle, account: opened.account, decision: "approve" }));
  const ownTo = new URL(own.headers.get("Location") ?? "", BASE);
  assert(own.status === 302 && ownTo.searchParams.get("code"), `the page's own account: ${own.status} ${ownTo}`);
  return "409 for the other account (and with no mark); its own account connects";
});

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `scopes check: ${failed} of ${results.length} stages FAILED` : `scopes check: all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
