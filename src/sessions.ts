// The cookie session (an account's sign-in on a browser): looked up, slid forward while it's in use, and started. Apart from accounts.ts,
// which can't load outside the Worker, so its rules are tested on their own (scripts/test-sessions.mjs).

import type { Env, SessionUser } from "./env";
import { cookieHeader, randomId, readCookie, sha256Hex } from "./util";

export const SESSION_COOKIE = "lc_session";

/** A connection past SESSION_LIMITER: answered 429 with Retry-After (app.ts onError), before its cookie costs D1 a read. */
export class SessionsLimited extends Error {
  constructor() {
    super("sessions_limited");
  }
}
// Each request is counted once, however many times its session is looked up (the preview overlay, the /api/* middleware, a page).
const counted = new WeakMap<Request, boolean>();
/** Whether this request may look a session cookie up: SESSION_LIMITER per connection (wrangler.jsonc), counted once a request. */
async function mayLookUp(request: Request, env: Env): Promise<boolean> {
  if (!env.SESSION_LIMITER) return true;
  const seen = counted.get(request);
  if (seen !== undefined) return seen;
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.SESSION_LIMITER.limit({ key: `session:${ip}` });
  counted.set(request, success);
  return success;
}
export const SESSION_DAYS = 90;
const DAY = 86_400_000;

/**
 * Sessions a D1 lookup found, kept in this isolate for a moment, for the few routes that may answer from it (app.ts CACHED_SESSION_ROUTES:
 * Translate's, which read only public packs and never the person's data). A newcomer's device asks Translate up to ~3 times a second while
 * it has no index of its own (7 Nov 2026, lex-translate), so a launch's cold typers would otherwise be hundreds of session reads a second
 * on D1. Keyed by the cookie's sha256, never the cookie. An entry is used only while it's younger than SESSION_CACHE_MS and its session
 * hasn't ended; nothing is kept for a cookie that found no session (a new sign-in counts at once; made-up cookies are SESSION_LIMITER's).
 * Sign-out and account deletion drop theirs in this isolate (forgetSession, forgetUser); another isolate may still answer those routes for
 * a signed-out cookie until its entry is SESSION_CACHE_MS old, and only with public packs. Every other route reads D1 every time.
 */
export const SESSION_CACHE_MS = 30_000;
export const SESSION_CACHE_MAX = 10_000;
const recent = new Map<string, { user: SessionUser; expiresAt: number; at: number }>();
function remember(hash: string, user: SessionUser, expiresAt: number, now: number) {
  recent.delete(hash);
  recent.set(hash, { user, expiresAt, at: now });
  // The oldest out first (a Map keeps the order things went in).
  while (recent.size > SESSION_CACHE_MAX) recent.delete(recent.keys().next().value!);
}
/** Signing out: the session's entry, by its cookie, in this isolate. */
export async function forgetSession(token: string) {
  recent.delete(await sha256Hex(token));
}
/** An account deleted: every entry of its sessions in this isolate. */
export function forgetUser(userId: string) {
  for (const [hash, entry] of recent) if (entry.user.id === userId) recent.delete(hash);
}
/** For tests: how many sessions this isolate holds. */
export function sessionCacheSize() {
  return recent.size;
}

/** The signed-in person, or null. Never changes the session: only sessionOf with extend slides it forward, with its cookie. */
export async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  return (await sessionOf(request, env))?.user ?? null;
}

/**
 * The signed-in person, and with extend, the session slid forward while it's in use: past half its 90 days, its end moves to 90 days
 * from now, and renew is the Set-Cookie that carries the cookie as long (6 Nov 2026, Codex C1: the end moved but the cookie didn't, so
 * the browser dropped it at day 90 and signed out someone who used the app every day). Only a caller that sends renew back passes extend.
 */
export async function sessionOf(
  request: Request,
  env: Env,
  { extend = false, now = Date.now(), cached = false } = {},
): Promise<{ user: SessionUser; renew: string | null } | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const hash = await sha256Hex(token);
  // A route that may answer from what this isolate found a moment ago (cached: app.ts CACHED_SESSION_ROUTES): no D1, no count, no slide.
  if (cached) {
    const kept = recent.get(hash);
    if (kept && now - kept.at < SESSION_CACHE_MS && kept.expiresAt > now) return { user: kept.user, renew: null };
  }
  if (!(await mayLookUp(request, env))) throw new SessionsLimited();
  const row = await env.DB.prepare("SELECT u.id, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .bind(hash, now)
    .first<{ id: string; name: string; expires_at: number }>();
  if (!row) {
    recent.delete(hash);
    return null;
  }
  const user = { id: row.id, name: row.name };
  if (!extend || row.expires_at - now >= (SESSION_DAYS / 2) * DAY) {
    remember(hash, user, row.expires_at, now);
    return { user, renew: null };
  }
  await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").bind(now + SESSION_DAYS * DAY, hash).run();
  remember(hash, user, now + SESSION_DAYS * DAY, now);
  return { user, renew: cookieHeader(SESSION_COOKIE, token, SESSION_DAYS * 86400) };
}

/** Starts a session for a user and returns its Set-Cookie value. */
export async function startSession(env: Env, userId: string, userAgent: string | null): Promise<string> {
  const token = randomId(32);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now, now + SESSION_DAYS * DAY, userAgent?.slice(0, 200) ?? null)
    .run();
  return cookieHeader(SESSION_COOKIE, token, SESSION_DAYS * 86400);
}
