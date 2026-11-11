// The refresh guard (src/refresh-once.ts) in Node, in front of the real workers-oauth-provider, with KV in memory and D1
// as SQLite on the real migrations, and the faults the HTTP check (refresh-check.mjs) can't make: an answer that can't
// be kept, a refresh that stalls while others wait (and past their wait), a made-up token while a real one refreshes,
// a client that stops being public or allowed to refresh, HTTP Basic and a header the library ignores, an empty extra
// client_id (which the library drops), the AAD binding on its own, the window running out, CORS on the guard's errors.
// `node scripts/test-refresh-once.mjs` (exit 0 = pass). Not modeled: KV read stale from another location, and a lock
// taken over after its lease from a refresh still running (both noted in src/refresh-once.ts).

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

// The library as the guard sees it; `stall` holds a refresh of the given token at the library for `ms`.
const stall = { text: null, ms: 0 };
const library = {
  fetch: async (request) => {
    if (stall.text && new URLSearchParams(await request.clone().text()).get("refresh_token") === stall.text) await sleep(stall.ms);
    return provider.fetch(request, env, ctx);
  },
  lookupClient: (clientId) => helpers.lookupClient(clientId),
};
const FORM = { "Content-Type": "application/x-www-form-urlencoded" };
const post = (fields, headers = {}) =>
  tokenEndpoint(new Request(`${ORIGIN}/token`, { method: "POST", headers: { ...FORM, ...headers }, body: new URLSearchParams(fields) }), env, ctx, library);
// A client authenticating with HTTP Basic sends its id there, not in the body too (clientId null).
async function refresh(token, clientId, { extra = {}, headers = {} } = {}) {
  const response = await post({ grant_type: "refresh_token", refresh_token: token, ...(clientId ? { client_id: clientId } : {}), resource: RESOURCE, ...extra }, headers);
  return { status: response.status, headers: Object.fromEntries(response.headers), ...(await response.json().catch(() => ({}))) };
}
// Who's asking, as src/refresh-once.ts hashes it: what decides the library's answer, and the origin.
const callerOf = (fields, origin = null) =>
  sha256(JSON.stringify({ client: fields.client_id, scope: fields.scope === undefined ? [] : [fields.scope], resource: fields.resource === undefined ? [] : [fields.resource], origin }));
const answerRow = (token) => sha256(`lexicommons refresh-once answer\n${token}`);
const grantOf = (token) => env.OAUTH_KV.get(`grant:${token.split(":").slice(0, 2).join(":")}`, { type: "json" });
const lockRows = () => rows("SELECT id FROM refresh_once WHERE kind = 'lock'");

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
let passed = 0;
async function test(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  } finally {
    reset();
    stall.text = null;
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};

await test("a repeat gets the first answer, and the next refresh works", async () => {
  const A = await connect();
  const first = await refresh(A.tokens.refresh_token, A.clientId);
  const again = await refresh(A.tokens.refresh_token, A.clientId);
  ok(first.status === 200 && again.refresh_token === first.refresh_token, `${first.status}, same: ${again.refresh_token === first.refresh_token}`);
  const next = await refresh(first.refresh_token, A.clientId);
  ok(next.status === 200, `next: ${next.status} ${next.error ?? ""}`);
  return "one answer; the next 200";
});

await test("an answer that can't be kept isn't handed out (503), and a retry gets a chain that works", async () => {
  const A = await connect();
  faults.failing = /INSERT OR REPLACE INTO refresh_once/;
  const lost = await refresh(A.tokens.refresh_token, A.clientId);
  ok(lost.status === 503 && lost.error === "temporarily_unavailable" && !lost.refresh_token && !lost.access_token, `lost: ${lost.status} ${lost.error}`);
  ok(lockRows().length === 0, "the lock was left held");
  reset();
  const retry = await refresh(A.tokens.refresh_token, A.clientId); // the token is still the grant's one before
  ok(retry.status === 200, `retry: ${retry.status} ${retry.error ?? ""}`);
  const next = await refresh(retry.refresh_token, A.clientId);
  ok(next.status === 200, `next: ${next.status}`);
  return "503 without tokens, the lock released; the retry 200, and its token refreshes";
});

await test("a refresh that stalls holds another, which then gets its answer", async () => {
  const A = await connect();
  stall.text = A.tokens.refresh_token;
  stall.ms = 1_500;
  const first = refresh(A.tokens.refresh_token, A.clientId);
  await sleep(100);
  const started = Date.now();
  const second = await refresh(A.tokens.refresh_token, A.clientId);
  const took = Date.now() - started;
  const one = await first;
  ok(one.status === 200 && second.status === 200 && one.refresh_token === second.refresh_token, `${one.status} ${second.status}, same: ${one.refresh_token === second.refresh_token}`);
  ok(took >= 1_200, `the second didn't wait (${took} ms)`);
  return `the second waited ${took} ms, then got the same answer`;
});

await test("past its wait, another is told to try again (503, with CORS), the grant moves once, and a retry gets the answer", async () => {
  const A = await connect();
  stall.text = A.tokens.refresh_token;
  stall.ms = 11_500;
  const first = refresh(A.tokens.refresh_token, A.clientId);
  await sleep(100);
  const second = await refresh(A.tokens.refresh_token, A.clientId, { headers: { Origin: "https://app.example" } });
  ok(second.status === 503 && second.error === "temporarily_unavailable" && second.headers["retry-after"] === "1", `second: ${second.status} ${second.error}`);
  ok(second.headers["access-control-allow-origin"] === "https://app.example" && /retry-after/i.test(second.headers["access-control-expose-headers"] ?? ""), `CORS: ${JSON.stringify(second.headers)}`);
  const one = await first;
  ok(one.status === 200, `first: ${one.status}`);
  const grant = await grantOf(A.tokens.refresh_token);
  ok(grant.refreshTokenId === sha256(one.refresh_token) && grant.previousRefreshTokenId === sha256(A.tokens.refresh_token), "the grant moved more than once");
  stall.text = null;
  const retry = await refresh(A.tokens.refresh_token, A.clientId);
  ok(retry.status === 200 && retry.refresh_token === one.refresh_token, `retry: ${retry.status}, same: ${retry.refresh_token === one.refresh_token}`);
  return "503 + Retry-After + CORS; the grant moved once; the retry got the first answer";
});

await test("a made-up token for a real grant never takes its lock: a real refresh beside it doesn't wait", async () => {
  const A = await connect();
  const [user, grant] = A.tokens.refresh_token.split(":");
  const forged = `${user}:${grant}:${randomBytes(24).toString("base64url")}`;
  stall.text = forged;
  stall.ms = 3_000;
  const fake = refresh(forged, A.clientId);
  await sleep(100);
  ok(lockRows().length === 0, "the made-up token holds the lock");
  const started = Date.now();
  const real = await refresh(A.tokens.refresh_token, A.clientId);
  const took = Date.now() - started;
  ok(real.status === 200 && took < 1_000, `real: ${real.status} in ${took} ms`);
  const made = await fake;
  ok(made.status === 400 && made.error === "invalid_grant", `made up: ${made.status} ${made.error}`);
  return `the real one 200 in ${took} ms; the made-up one 400`;
});

await test("a client that stops being public isn't given the kept answer", async () => {
  const A = await connect();
  const first = await refresh(A.tokens.refresh_token, A.clientId);
  ok(first.status === 200, `first: ${first.status}`);
  await helpers.updateClient(A.clientId, { tokenEndpointAuthMethod: "client_secret_post" });
  const again = await refresh(A.tokens.refresh_token, A.clientId);
  ok(again.status === 401 && again.error === "invalid_client" && !again.access_token, `again: ${again.status} ${again.error}`);
  return `the library's answer: ${again.status} ${again.error}`;
});

await test("HTTP Basic goes straight to the library; a Bearer header (which it ignores) goes through the lock", async () => {
  const B = await connect("client_secret_basic");
  const header = { Authorization: `Basic ${btoa(`${B.clientId}:${B.clientSecret}`)}` };
  const one = await refresh(B.tokens.refresh_token, null, { headers: header });
  const two = await refresh(B.tokens.refresh_token, null, { headers: header });
  ok(one.status === 200 && two.status === 200 && one.refresh_token !== two.refresh_token, `Basic: ${one.status} ${two.status}, same: ${one.refresh_token === two.refresh_token}`);
  ok(rows("SELECT id FROM refresh_once WHERE user_id = ? AND id = ?", USER, sha256(`lexicommons refresh-once answer\n${B.tokens.refresh_token}`)).length === 0, "a kept answer for Basic");
  const A = await connect();
  const bearer = { Authorization: "Bearer not-a-client-credential" };
  const [x, y] = await Promise.all([refresh(A.tokens.refresh_token, A.clientId, { headers: bearer }), refresh(A.tokens.refresh_token, A.clientId, { headers: bearer })]);
  ok(x.status === 200 && y.status === 200 && x.refresh_token === y.refresh_token, `Bearer: ${x.status} ${y.status}, same: ${x.refresh_token === y.refresh_token}`);
  return "Basic: the library's two answers, nothing kept; Bearer: one answer";
});

await test("an extra empty client_id (which the library drops) is the same request: it goes through the lock and gets the answer", async () => {
  const A = await connect();
  const raw = new URLSearchParams({ grant_type: "refresh_token", refresh_token: A.tokens.refresh_token, client_id: A.clientId, resource: RESOURCE });
  raw.append("client_id", "");
  const send = () => tokenEndpoint(new Request(`${ORIGIN}/token`, { method: "POST", headers: FORM, body: raw }), env, ctx, library).then((r) => r.json());
  const [plain, padded] = await Promise.all([refresh(A.tokens.refresh_token, A.clientId), send()]);
  ok(plain.refresh_token && padded.refresh_token === plain.refresh_token, `same answer: ${padded.refresh_token === plain.refresh_token} (${padded.error ?? ""})`);
  const again = await send();
  ok(again.refresh_token === plain.refresh_token, "its repeat got another answer");
  const next = await refresh(plain.refresh_token, A.clientId);
  ok(next.status === 200, `next: ${next.status}`);
  return "at once and again, one answer; the next refresh 200";
});

await test("a client no longer allowed to refresh isn't given the kept answer", async () => {
  const A = await connect();
  const first = await refresh(A.tokens.refresh_token, A.clientId);
  ok(first.status === 200, `first: ${first.status}`);
  await helpers.updateClient(A.clientId, { grantTypes: [], responseTypes: [] });
  const again = await refresh(A.tokens.refresh_token, A.clientId);
  ok(again.status === 400 && again.error === "unauthorized_client" && !again.access_token, `again: ${again.status} ${again.error}`);
  return `the library's answer: ${again.status} ${again.error}`;
});

await test("a kept answer opens only for the request it was sealed for (the AAD alone: same token, same row)", async () => {
  const A = await connect();
  const first = await refresh(A.tokens.refresh_token, A.clientId);
  // Another request with the same token: the row is relabeled as its, so only the AAD (which names the first) differs.
  const other = { grant_type: "refresh_token", refresh_token: A.tokens.refresh_token, client_id: A.clientId, resource: RESOURCE, scope: "learn:read learn:write" };
  const row = rows("SELECT body FROM refresh_once WHERE id = ?", answerRow(A.tokens.refresh_token))[0];
  const kept = JSON.parse(row.body);
  d1Env.DB.prepare("UPDATE refresh_once SET body = ? WHERE id = ?").bind(JSON.stringify({ ...kept, caller: callerOf(other) }), answerRow(A.tokens.refresh_token)).run();
  const relabeled = await refresh(A.tokens.refresh_token, A.clientId, { extra: { scope: "learn:read learn:write" } });
  ok(relabeled.status === 200 && relabeled.refresh_token !== first.refresh_token, `relabeled: ${relabeled.status}, ${relabeled.refresh_token === first.refresh_token ? "opened" : "not opened"}`);
  return "not opened: the library answered instead";
});

await test("after the window, a repeat goes to the library, as without the guard", async () => {
  const A = await connect();
  const first = await refresh(A.tokens.refresh_token, A.clientId);
  const now = Date.now;
  Date.now = () => now() + 11 * 60 * 1000;
  try {
    const late = await refresh(A.tokens.refresh_token, A.clientId);
    ok(late.status === 200 && late.refresh_token !== first.refresh_token, `late: ${late.status}, ${late.refresh_token === first.refresh_token ? "the kept answer" : "a new one"}`);
  } finally {
    Date.now = now;
  }
  return "11 minutes on: a new answer from the library";
});

await test("a body past the limit is refused with CORS, before anything else", async () => {
  const response = await post({ grant_type: "refresh_token", refresh_token: "a:b:c", client_id: "x", padding: "x".repeat(20_000) }, { Origin: "https://app.example" });
  const body = await response.json();
  ok(response.status === 400 && body.error === "invalid_request" && response.headers.get("access-control-allow-origin") === "https://app.example", `${response.status} ${body.error} ${response.headers.get("access-control-allow-origin")}`);
  return "400 invalid_request, with CORS";
});

await Promise.allSettled(waits);
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
