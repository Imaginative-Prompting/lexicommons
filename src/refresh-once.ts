// One answer per refresh token, so a refresh token used twice can't split in two.
//
// workers-oauth-provider rotates the refresh token on every use and accepts the current one and the one before it. A
// second use of the one before mints a third token, and the second one quietly stops working. Claude Code's sessions
// share one stored token, and two of them can refresh with it at once (its MCP SDK refreshes after a 401 outside Claude
// Code's own lock): whichever saves last may keep the dead token, the next refresh is refused, and every session is
// asked to sign in again. That case is real (scripts/refresh-check.mjs --reproduce shows it) but hasn't been seen live:
// the sign-outs that led to this guard (27 Oct 2026) were Claude Code's /logout, which deletes every MCP sign-in it
// holds, and no refresh was refused. This guards against the case; it didn't cause or end those.
//
// So a public client's refresh with a token its grant still holds takes the grant's lock (a `refresh_once` row of kind
// 'lock'): one library refresh per grant at a time, whichever of its tokens is presented, and the others wait. A
// successful answer is kept for REUSE_WINDOW_MS (kind 'answer', keyed by the presented token's hash), sealed with a key
// only that token gives, and handed out only once it's kept. A repeat of the same request gets it again only while
// nothing has happened since: the grant still holds the presented token as the one before and the kept one as current,
// the kept access token is still live, and the library still knows the client as public and allowed to refresh.
// Anything else goes to the library under the lock, as before. A use that can't be put in order (the lock still held
// after WAIT_MS, D1 unavailable) is told to try again, never refreshed beside it.
//
// Left to the library: clients that authenticate (a secret, Basic, an assertion), and tokens its grant doesn't hold.
// Not covered: the grant lives in KV, which another location can read stale for up to a minute (the library alone has
// the same exposure), and a lock is taken over after LOCK_LEASE_MS, so a refresh stalled longer than that could still
// split the token.

import type { ClientInfo } from "@cloudflare/workers-oauth-provider";
import type { Env } from "./env";
import { base64UrlToBytes, bytesToBase64Url, readTextLimited, sha256Hex } from "./util";

const REUSE_WINDOW_MS = 10 * 60 * 1000;
// A lock whose Worker died before the library answered frees its grant after this. The library answers in well under a
// second, so a refresh still running is never overtaken in practice.
const LOCK_LEASE_MS = 60 * 1000;
// How long a later use waits for the lock before it's told to try again.
const WAIT_MS = 10 * 1000;
const POLL_MS = 100;
// Every /token body is read once, up to this, and handed on as those bytes.
const MAX_BODY_BYTES = 16 * 1024;
// An access token with less than this left isn't handed out again.
const MIN_LIFETIME_S = 60;
// The library's refresh tokens: `${userId}:${grantId}:${secret}`, each part base64url.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,256}:[A-Za-z0-9_-]{1,256}:[A-Za-z0-9_-]{1,256}$/;
// The library's client-authentication parameters (CLIENT_AUTHENTICATION_PARAMETERS): their empty values are dropped
// before anything else looks at them, so here too.
const CLIENT_PARAMETERS = new Set(["client_id", "client_secret", "client_assertion", "client_assertion_type"]);
const KEEP_ATTEMPTS = 3;
const LABEL = "lexicommons refresh-once";

/** What the guard needs from the library: its /token, and its view of a client. */
export type Library = { fetch: (request: Request) => Promise<Response>; lookupClient: (clientId: string) => Promise<ClientInfo | null> };

// A kept answer: who asked (a hash of the request), and the answer sealed.
type Kept = { caller: string; iv: string; sealed: string };
type Answer = { status: number; headers: [string, string][]; body: string; issuedAt: number };
type Use = { token: string; caller: string; answerId: string; lockId: string; userId: string; grantId: string; clientId: string };
type Grant = { clientId?: string; refreshTokenId?: string; previousRefreshTokenId?: string };
type Turn = { kind: "first"; lock: string } | { kind: "answer"; response: Response } | { kind: "busy" };

const encoder = new TextEncoder();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** POST /token. A public client's refresh with a token its grant holds goes through the lock; the rest to the library. */
export async function tokenEndpoint(request: Request, env: Env, ctx: ExecutionContext, library: Library): Promise<Response> {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") return library.fetch(request); // the library refuses it unread
  const text = await readTextLimited(request, MAX_BODY_BYTES);
  if (text === null) return oauthError(request, 400, "invalid_request", "The request body is too large.");
  const headers = new Headers(request.headers);
  headers.delete("Content-Length");
  headers.delete("Transfer-Encoding");
  const forward = new Request(request.url, { method: "POST", headers, body: text });

  const use = await refreshUse(forward, request.headers);
  if (!use) return library.fetch(forward);
  let turn: Turn | null;
  try {
    turn = await takeTurn(env, library, use);
  } catch (error) {
    console.warn(JSON.stringify({ refresh_once: "lock_failed", error: String(error) }));
    turn = { kind: "busy" };
  }
  if (!turn) return library.fetch(forward);
  if (turn.kind === "answer") return turn.response;
  if (turn.kind === "busy") return busy(request);
  return firstUse(request, forward, env, ctx, library, use, turn.lock);
}

/**
 * A public client's refresh: the token and who's asking, or null. The body is read by the parser the library uses
 * (Request.formData, on the same bytes; the runtime's differs from URLSearchParams over a stray "?", "%" or byte order
 * mark) and normalized as its parseTokenEndpointRequest does, so nothing the library would take as a public refresh is
 * classed otherwise here: what this passes on is a confidential client's, or something the library refuses. Who's
 * asking is what decides the library's answer (the client, scope and resource) and the origin its CORS answer names;
 * anything else the library ignores, so it doesn't make a request a different one.
 */
async function refreshUse(forward: Request, headers: Headers): Promise<Use | null> {
  // HTTP Basic is client authentication (the library's parseBasicAuthorizationHeader); any other scheme it ignores.
  const authorization = headers.get("Authorization");
  if (authorization !== null && /^basic(?:[ \t]|$)/i.test(authorization)) return null;
  let form: FormData;
  try {
    form = await forward.clone().formData();
  } catch {
    return null; // the library refuses a body it can't read
  }
  const params: [string, string][] = [];
  for (const [name, value] of form) {
    if (typeof value !== "string") return null;
    if (!(CLIENT_PARAMETERS.has(name) && value === "")) params.push([name, value]);
  }
  const names = params.map(([name]) => name);
  // The library refuses a repeated parameter (resource apart): nothing to put in order.
  if (names.some((name, at) => name !== "resource" && names.indexOf(name) !== at)) return null;
  const all = (name: string) => params.filter(([key]) => key === name).map(([, value]) => value);
  if (all("client_secret").length || all("client_assertion").length || all("client_assertion_type").length) return null;
  const [grant, token, clientId] = [all("grant_type")[0], all("refresh_token")[0], all("client_id")[0]];
  if (grant !== "refresh_token" || !token || !TOKEN_SHAPE.test(token) || !clientId) return null;
  const [userId, grantId] = token.split(":") as [string, string, string];
  const caller = await sha256Hex(JSON.stringify({ client: clientId, scope: all("scope"), resource: all("resource"), origin: headers.get("Origin") }));
  const [answerId, lockId] = await Promise.all([sha256Hex(`${LABEL} answer\n${token}`), sha256Hex(`${LABEL} lock\n${userId}:${grantId}`)]);
  return { token, caller, answerId, lockId, userId, grantId, clientId };
}

/**
 * A kept answer that still holds, or the grant's lock for a library refresh (waiting while it's held), or null when the
 * grant doesn't hold the token for this client (the library refuses it; a token never becomes valid again, so nothing
 * needs locking). The check comes before the lock, so a made-up token can't hold a real grant's lock.
 */
async function takeTurn(env: Env, library: Library, use: Use): Promise<Turn | null> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const kept = await keptAnswer(env, library, use);
    if (kept) return { kind: "answer", response: kept };
    const grant = await readGrant(env, use);
    const presented = await sha256Hex(use.token);
    if (!grant || grant.clientId !== use.clientId || (grant.refreshTokenId !== presented && grant.previousRefreshTokenId !== presented)) return null;
    if (Date.now() > deadline) return { kind: "busy" };
    const now = Date.now();
    const lock = JSON.stringify({ caller: use.caller, lockedAt: now });
    if (await takeLock(env, use, lock, now)) {
      // An answer for this token may have been kept just before the lock came free.
      const landed = await keptAnswer(env, library, use);
      if (!landed) return { kind: "first", lock };
      await releaseLock(env, use, lock);
      return { kind: "answer", response: landed };
    }
    await sleep(POLL_MS);
  }
}

/** Takes the grant's lock: free, or held past its lease by a Worker that died. */
async function takeLock(env: Env, use: Use, lock: string, now: number): Promise<boolean> {
  const inserted = await env.DB.prepare(
    "INSERT INTO refresh_once (id, kind, user_id, body, expires_at) VALUES (?, 'lock', ?, ?, ?) ON CONFLICT (id) DO NOTHING",
  )
    .bind(use.lockId, use.userId, lock, now + LOCK_LEASE_MS)
    .run();
  if (inserted.meta.changes === 1) return true;
  const taken = await env.DB.prepare("UPDATE refresh_once SET body = ?, expires_at = ? WHERE id = ? AND kind = 'lock' AND expires_at <= ?")
    .bind(lock, now + LOCK_LEASE_MS, use.lockId, now)
    .run();
  return taken.meta.changes === 1;
}

async function releaseLock(env: Env, use: Use, lock: string): Promise<void> {
  try {
    await env.DB.prepare("DELETE FROM refresh_once WHERE id = ? AND kind = 'lock' AND body = ?").bind(use.lockId, lock).run();
  } catch (error) {
    // Left to its lease.
    console.warn(JSON.stringify({ refresh_once: "release_failed", error: String(error) }));
  }
}

/**
 * The library refreshes, under the grant's lock. A successful answer is kept, sealed, before it's handed out: one that
 * can't be kept isn't handed out at all (503), so no one holds tokens a later refresh of the same token would end. The
 * presented token stays the grant's one before, so a retry with it still works.
 */
async function firstUse(
  request: Request,
  forward: Request,
  env: Env,
  ctx: ExecutionContext,
  library: Library,
  use: Use,
  lock: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await library.fetch(forward);
  } catch (error) {
    await releaseLock(env, use, lock);
    throw error;
  }
  if (response.status !== 200) {
    // Nothing changed at the library: the next use may try.
    await releaseLock(env, use, lock);
    return response;
  }
  const body = await response.text();
  const headers = [...response.headers].filter(([name]) => !/^content-(length|encoding)$/i.test(name));
  const answer: Answer = { status: response.status, headers, body, issuedAt: Date.now() };
  const kept = JSON.stringify({ caller: use.caller, ...(await seal(use, answer)) } satisfies Kept);
  for (let attempt = 1; attempt <= KEEP_ATTEMPTS; attempt++) {
    try {
      await env.DB.prepare("INSERT OR REPLACE INTO refresh_once (id, kind, user_id, body, expires_at) VALUES (?, 'answer', ?, ?, ?)")
        .bind(use.answerId, use.userId, kept, answer.issuedAt + REUSE_WINDOW_MS)
        .run();
      await releaseLock(env, use, lock);
      ctx.waitUntil(
        env.DB.prepare("DELETE FROM refresh_once WHERE expires_at < ?")
          .bind(Date.now())
          .run()
          .catch(() => {}),
      );
      return new Response(body, { status: response.status, headers });
    } catch (error) {
      if (attempt === KEEP_ATTEMPTS) console.warn(JSON.stringify({ refresh_once: "keep_failed", error: String(error) }));
    }
  }
  await releaseLock(env, use, lock);
  return busy(request);
}

/** This request's kept answer, if it still holds (answerAgain). */
async function keptAnswer(env: Env, library: Library, use: Use): Promise<Response | null> {
  const row = await env.DB.prepare("SELECT body FROM refresh_once WHERE id = ? AND kind = 'answer' AND expires_at > ?")
    .bind(use.answerId, Date.now())
    .first<{ body: string }>();
  const kept = row && readKept(row.body);
  return kept && kept.caller === use.caller ? answerAgain(env, library, use, kept) : null;
}

/**
 * The kept answer again, only while nothing has happened since it was given: the grant still holds the presented token
 * as the one before and the kept refresh token as current, the kept access token is still live, and the library still
 * knows the client as public. Its access token's lifetime is counted from when it was issued.
 */
async function answerAgain(env: Env, library: Library, use: Use, saved: Kept): Promise<Response | null> {
  let answer: Answer;
  let data: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  try {
    answer = await unseal(use, saved);
    data = JSON.parse(answer.body);
  } catch {
    return null;
  }
  if (!data || typeof data.access_token !== "string" || typeof data.refresh_token !== "string" || typeof data.expires_in !== "number") return null;
  const left = data.expires_in - Math.floor((Date.now() - answer.issuedAt) / 1000);
  if (left < MIN_LIFETIME_S) return null;

  const grant = await readGrant(env, use);
  if (!grant || grant.clientId !== use.clientId) return null;
  const [presented, kept, access] = await Promise.all([sha256Hex(use.token), sha256Hex(data.refresh_token), sha256Hex(data.access_token)]);
  if (grant.previousRefreshTokenId !== presented || grant.refreshTokenId !== kept) return null;
  if (!(await env.OAUTH_KV.get(`token:${use.userId}:${use.grantId}:${access}`))) return null;
  try {
    // Still public, and still allowed to refresh (the library's handleTokenRequest: refresh_token or authorization_code).
    const client = await library.lookupClient(use.clientId);
    if (client?.tokenEndpointAuthMethod !== "none") return null;
    if (Array.isArray(client.grantTypes) && !client.grantTypes.includes("refresh_token") && !client.grantTypes.includes("authorization_code")) return null;
  } catch {
    return null;
  }
  return new Response(JSON.stringify({ ...data, expires_in: left }), { status: answer.status, headers: answer.headers });
}

function readGrant(env: Env, use: Use): Promise<Grant | null> {
  return env.OAUTH_KV.get<Grant>(`grant:${use.userId}:${use.grantId}`, { type: "json" });
}

const busy = (request: Request) => oauthError(request, 503, "temporarily_unavailable", "Another refresh of this connection is in progress. Try again.");

/** An OAuth error with the same CORS answer the library gives its own (withCorsHeaders). */
function oauthError(request: Request, status: number, error: string, description: string): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache" });
  if (status === 503) headers.set("Retry-After", "1");
  const origin = request.headers.get("Origin");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "*");
    headers.set("Access-Control-Allow-Headers", "Authorization, *");
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, Retry-After");
  }
  return new Response(JSON.stringify({ error, error_description: description }), { status, headers });
}

function readKept(text: string): Kept | null {
  try {
    const kept = JSON.parse(text) as Partial<Kept>;
    if (typeof kept.caller !== "string" || typeof kept.iv !== "string" || typeof kept.sealed !== "string") return null;
    return { caller: kept.caller, iv: kept.iv, sealed: kept.sealed };
  } catch {
    return null;
  }
}

/** A key only the refresh token itself gives (the row is found by a different hash of it). */
async function answerKey(token: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(token), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode(LABEL), info: encoder.encode("answer") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal(use: Use, answer: Answer): Promise<{ iv: string; sealed: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(`${use.answerId}\n${use.caller}`) },
    await answerKey(use.token),
    encoder.encode(JSON.stringify(answer)),
  );
  return { iv: bytesToBase64Url(iv), sealed: bytesToBase64Url(sealed) };
}

async function unseal(use: Use, saved: Kept): Promise<Answer> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(saved.iv), additionalData: encoder.encode(`${use.answerId}\n${saved.caller}`) },
    await answerKey(use.token),
    base64UrlToBytes(saved.sealed),
  );
  const answer = JSON.parse(new TextDecoder().decode(plain)) as Answer;
  if (typeof answer.status !== "number" || !Array.isArray(answer.headers) || typeof answer.body !== "string" || typeof answer.issuedAt !== "number") {
    throw new Error("malformed answer");
  }
  return answer;
}
