#!/usr/bin/env node
// A revoked connection stays revoked (src/revoked.ts; 6 Nov 2026, the Codex review's C2), in Node in front of the real workers-oauth-provider,
// KV in memory and D1 as SQLite on the real migrations:
//   - the race, with no guard (the control, so this can fail): a revoke landing while a refresh is under way, between the provider's read
//     of the grant and its write, and the connection comes back with working tokens;
//   - the same race through /token as src/index.ts answers it, with the revoke as the app makes it (revokeConnection): the refresh is
//     refused, the grant and every token of it are gone, and the marker is kept;
//   - a revoke before a refresh; a kept answer asked for again after a revoke; an unrevoked connection refreshing as before (a control);
//   - what MCP reads (grantOfToken, grantRevoked): the access token of a revoked grant is revoked, another's isn't, a made-up one is none;
//   - the marker names no one (a hash), is written once, and goes with the cron's sweep after the refresh tokens' lifetime.
// `node scripts/test-revoked-grants.mjs` (exit 0 = pass). The wiring over HTTP (the route, MCP, account deletion) is revoke-check.mjs.

import { registerHooks } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

// The library imports WorkerEntrypoint from cloudflare:workers, which Node doesn't have.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export class WorkerEntrypoint {}", shortCircuit: true };
    return next(specifier, context);
  },
});

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** KV in memory, as the library uses it: get (text or json), put with a lifetime, delete, list by prefix. */
function memoryKv() {
  const store = new Map();
  const live = (key) => {
    const item = store.get(key);
    if (item && item.expiresAt && item.expiresAt <= Date.now()) store.delete(key);
    return store.get(key);
  };
  return {
    store,
    async get(key, options) {
      const item = live(key);
      if (!item) return null;
      return (typeof options === "string" ? options : options?.type) === "json" ? JSON.parse(item.value) : item.value;
    },
    async put(key, value, { expirationTtl, expiration, metadata } = {}) {
      const expiresAt = expirationTtl ? Date.now() + expirationTtl * 1000 : expiration ? expiration * 1000 : null;
      store.set(key, { value: typeof value === "string" ? value : String(value), expiresAt, metadata });
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix = "", limit = 1000, cursor } = {}) {
      const names = [...store.keys()].filter((key) => key.startsWith(prefix) && live(key)).sort();
      const start = cursor ? Number(cursor) : 0;
      const done = start + limit >= names.length;
      return { keys: names.slice(start, start + limit).map((name) => ({ name, metadata: store.get(name).metadata })), list_complete: done, cursor: done ? undefined : String(start + limit) };
    },
  };
}

const { env: d1Env, faults, rows, reset } = workerEnv();
const env = { ...d1Env, OAUTH_KV: memoryKv() };
const waits = [];
const ctx = { waitUntil: (promise) => waits.push(promise), passThroughOnException() {} };

const { OAuthProvider, getOAuthApi } = await import("@cloudflare/workers-oauth-provider");
const { tokenEndpoint } = await import(join(APP, "src/refresh-once.ts"));
const revoked = await import(join(APP, "src/revoked.ts"));

// The app's provider, as far as refreshing goes (src/index.ts): its lifetimes and scopes, one resource.
const ORIGIN = "https://lexicommons.test";
const RESOURCE = `${ORIGIN}/mcp`;
const options = {
  apiRoute: "/mcp",
  apiHandler: { fetch: async () => new Response("mcp") },
  defaultHandler: { fetch: async () => new Response("app") },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  accessTokenTTL: 60 * 60,
  refreshTokenTTL: 60 * 60 * 24 * 90,
  refreshTokenIdleTTL: 60 * 60 * 24 * 90,
  scopesSupported: ["learn:read", "learn:write"],
  requiredScopes: ["learn:read", "learn:write"],
  resourceMetadata: { resource: RESOURCE, resource_name: "Lexicommons" },
};
const provider = new OAuthProvider(options);
const helpers = getOAuthApi(options, env);

// The library as /token sees it (src/index.ts).
const library = {
  fetch: (request) => provider.fetch(request, env, ctx),
  lookupClient: (clientId) => helpers.lookupClient(clientId),
};
// The race: when the provider first writes anything of this grant during a refresh (it has read the grant by then), `hold.run` runs
// first, as a revoke landing between the refresh's read and its write.
let hold = null;
const kvPut = env.OAUTH_KV.put.bind(env.OAUTH_KV);
env.OAUTH_KV.put = async (key, value, options) => {
  if (hold && (key === `grant:${hold.of}` || key.startsWith(`token:${hold.of}:`))) {
    const run = hold.run;
    hold = null;
    await run();
  }
  return kvPut(key, value, options);
};
const FORM = { "Content-Type": "application/x-www-form-urlencoded" };
// /token as src/index.ts answers it: the refresh guard, then the revoked-grant guard on its answer.
async function post(fields, headers = {}) {
  const request = new Request(`${ORIGIN}/token`, { method: "POST", headers: { ...FORM, ...headers }, body: new URLSearchParams(fields) });
  return revoked.tokenAnswerGuard(env, helpers, request, await tokenEndpoint(request, env, ctx, library));
}
// The same refresh straight to the library, with no guard at all: the code before.
const bare = (fields) => provider.fetch(new Request(`${ORIGIN}/token`, { method: "POST", headers: FORM, body: new URLSearchParams(fields) }), env, ctx);
// A client authenticating with HTTP Basic sends its id there, not in the body too (clientId null).
async function refresh(token, clientId, { extra = {}, headers = {}, send = post } = {}) {
  const response = await send({ grant_type: "refresh_token", refresh_token: token, ...(clientId ? { client_id: clientId } : {}), resource: RESOURCE, ...extra }, headers);
  return { status: response.status, headers: Object.fromEntries(response.headers), ...(await response.json().catch(() => ({}))) };
}

/** A client and a grant for it, through the library's own calls: its first tokens. */
const USER = "usercheck1";
async function connect(tokenEndpointAuthMethod = "none") {
  const client = await helpers.createClient({ redirectUris: ["https://app.test/callback"], tokenEndpointAuthMethod, clientName: "Check", grantTypes: ["authorization_code", "refresh_token"], responseTypes: ["code"] });
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(`${ORIGIN}/authorize`);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: "https://app.test/callback",
    scope: "learn:read learn:write",
    state: "s",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource: RESOURCE,
  }))
    authorize.searchParams.set(k, v);
  const request = await helpers.parseAuthRequest(new Request(authorize));
  const { redirectTo } = await helpers.completeAuthorization({ request, userId: USER, metadata: {}, scope: request.scope, props: { userId: USER } });
  const exchange = { grant_type: "authorization_code", code: new URL(redirectTo).searchParams.get("code"), redirect_uri: "https://app.test/callback", client_id: client.clientId, code_verifier: verifier, resource: RESOURCE };
  const headers = { ...FORM };
  if (tokenEndpointAuthMethod === "client_secret_basic") {
    headers.Authorization = `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`;
    delete exchange.client_id;
  }
  if (tokenEndpointAuthMethod === "client_secret_post") exchange.client_secret = client.clientSecret;
  const tokens = await (await provider.fetch(new Request(`${ORIGIN}/token`, { method: "POST", headers, body: new URLSearchParams(exchange) }), env, ctx)).json();
  if (!tokens.refresh_token) throw new Error(`no tokens: ${JSON.stringify(tokens)}`);
  return { clientId: client.clientId, clientSecret: client.clientSecret, tokens };
}


// ---------- the tests ----------

let failed = 0;
async function test(name, fn) {
  try {
    const detail = await fn();
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  } finally {
    reset();
    hold = null;
    env.OAUTH_KV.store.clear();
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const parts = (token) => token.split(":");
const grantKeys = (token) => {
  const [user, grant] = parts(token);
  return [...env.OAUTH_KV.store.keys()].filter((key) => key === `grant:${user}:${grant}` || key.startsWith(`token:${user}:${grant}:`));
};
// This grant's own marker, by the hash src/revoked.ts keeps (the database is shared by every test here).
const markerOf = (token) => {
  const [user, grant] = parts(token);
  return rows("SELECT grant_hash, revoked_at FROM revoked_grants WHERE grant_hash = ?", sha256(`lexicommons revoked grant\n${user}:${grant}`));
};
const revoke = (token) => {
  const [user, grant] = parts(token);
  return revoked.revokeConnection(env, helpers, user, grant);
};

await test("the race with no guard (the control): a revoke under way of a refresh, and the connection comes back", async () => {
  const A = await connect();
  const [user, grant] = parts(A.tokens.refresh_token);
  hold = { of: `${user}:${grant}`, run: () => helpers.revokeGrant(grant, user) };
  const answer = await refresh(A.tokens.refresh_token, A.clientId, { send: bare });
  ok(hold === null, "the revoke never ran inside the refresh");
  ok(answer.status === 200 && answer.access_token, `the refresh answered ${answer.status} ${answer.error ?? ""}`);
  const back = await env.OAUTH_KV.get(`grant:${user}:${grant}`, { type: "json" });
  ok(back, "the grant didn't come back: the harness doesn't reproduce the race");
  ok(await helpers.unwrapToken(answer.access_token).catch(() => null), "its new access token doesn't work");
  return "the revoked grant was written back, and its new access token works";
});

await test("the same race through /token with the app's revoke: refused, nothing of the grant left, the marker kept", async () => {
  const A = await connect();
  const [user, grant] = parts(A.tokens.refresh_token);
  hold = { of: `${user}:${grant}`, run: () => revoked.revokeConnection(env, helpers, user, grant) };
  const answer = await refresh(A.tokens.refresh_token, A.clientId);
  ok(hold === null, "the revoke never ran inside the refresh");
  ok(answer.status === 400 && answer.error === "invalid_grant" && !answer.access_token, `answered ${answer.status} ${JSON.stringify(answer).slice(0, 160)}`);
  ok(!grantKeys(A.tokens.refresh_token).length, `left in KV: ${grantKeys(A.tokens.refresh_token).join(", ")}`);
  ok(markerOf(A.tokens.refresh_token).length === 1, `its markers: ${markerOf(A.tokens.refresh_token).length}`);
  ok(await revoked.grantRevoked(env, user, grant), "the grant isn't marked");
  return "400 invalid_grant; grant and tokens gone";
});

await test("a revoke before the refresh: refused, and the marker names no one", async () => {
  const A = await connect();
  await revoke(A.tokens.refresh_token);
  const answer = await refresh(A.tokens.refresh_token, A.clientId);
  ok(answer.status === 400 && !answer.access_token, `answered ${answer.status}`);
  const kept = markerOf(A.tokens.refresh_token);
  ok(kept.length === 1, `its markers: ${kept.length}`);
  const columns = rows("SELECT name FROM pragma_table_info('revoked_grants')").map((c) => c.name).sort().join(",");
  ok(columns === "grant_hash,revoked_at", `the marker's columns: ${columns}`);
  await revoke(A.tokens.refresh_token);
  ok(markerOf(A.tokens.refresh_token).length === 1 && markerOf(A.tokens.refresh_token)[0].revoked_at === kept[0].revoked_at, "revoked twice: marked twice, or its time moved");
  return "400; one marker, a hash";
});

await test("a kept answer asked for again after a revoke isn't handed out", async () => {
  const A = await connect();
  const first = await refresh(A.tokens.refresh_token, A.clientId);
  ok(first.status === 200, `first: ${first.status}`);
  await revoke(A.tokens.refresh_token);
  const again = await refresh(A.tokens.refresh_token, A.clientId);
  ok(again.status !== 200 && !again.access_token, `again: ${again.status} ${again.access_token ? "with tokens" : ""}`);
  return `again: ${again.status} ${again.error ?? ""}`;
});

await test("an unrevoked connection refreshes as before (the control), and another's revoke changes nothing for it", async () => {
  const A = await connect();
  const B = await connect();
  await revoke(B.tokens.refresh_token);
  const answer = await refresh(A.tokens.refresh_token, A.clientId);
  ok(answer.status === 200 && answer.access_token, `answered ${answer.status} ${answer.error ?? ""}`);
  const next = await refresh(answer.refresh_token, A.clientId);
  ok(next.status === 200, `the next: ${next.status}`);
  return "200, then 200";
});

await test("what MCP reads: a revoked grant's access token is revoked; another's isn't; a made-up one is no grant", async () => {
  const A = await connect();
  const B = await connect();
  const a = revoked.grantOfToken(A.tokens.access_token);
  const b = revoked.grantOfToken(B.tokens.access_token);
  ok(a && b && a.userId === USER && a.grantId === parts(A.tokens.refresh_token)[1], `parsed: ${JSON.stringify(a)}`);
  ok(!(await revoked.grantRevoked(env, a.userId, a.grantId)), "marked before any revoke");
  await revoke(A.tokens.refresh_token);
  ok(await revoked.grantRevoked(env, a.userId, a.grantId), "not marked after the revoke");
  ok(!(await revoked.grantRevoked(env, b.userId, b.grantId)), "another connection marked");
  for (const made of ["", "abc", "a:b", "a:b:c:d", "lct_personal", "a:b:c d", null, 42]) ok(revoked.grantOfToken(made) === null, `made-up ${JSON.stringify(made)} read as a grant`);
  return "revoked, not revoked, none";
});

await test("a marker that can't be read refuses the answer (503), never hands out tokens", async () => {
  const A = await connect();
  faults.failing = /revoked_grants/;
  const answer = await refresh(A.tokens.refresh_token, A.clientId);
  faults.failing = null;
  ok(answer.status === 503 && !answer.access_token, `answered ${answer.status}`);
  return "503";
});

await test("the cron's sweep: markers past the refresh tokens' lifetime go, newer ones stay", async () => {
  const now = Date.now();
  await revoked.revokeConnection(env, { revokeGrant: async () => {} }, "olduser", "oldgrant", now - revoked.REVOKED_KEEP_MS - 1000);
  await revoked.revokeConnection(env, { revokeGrant: async () => {} }, "newuser", "newgrant", now - revoked.REVOKED_KEEP_MS + 60_000);
  ok((await revoked.sweepRevoked(env, now)) === 1, "swept other than one");
  ok(!(await revoked.grantRevoked(env, "olduser", "oldgrant")) && (await revoked.grantRevoked(env, "newuser", "newgrant")), "the wrong one went");
  return "1 swept";
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
