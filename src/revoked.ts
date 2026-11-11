// An AI app's connection, once its person revokes it, stays revoked (6 Nov 2026, the Codex review's C2).
//
// workers-oauth-provider keeps a grant and its tokens in KV, and revoking deletes them there. A refresh already under way has read the
// grant before that delete, and writes it back after with new tokens: the connection comes back, and its new access token works. KV can't
// stop a writer that overlaps, and another location can read a deleted grant for up to a minute after. So a revoke writes a marker
// here first, in D1, then deletes the grant, and the marker is what's checked:
//   - every answer of /token that hands out tokens (tokenAnswerGuard, src/index.ts): a token of a marked grant is never handed out, and the
//     grant a refresh wrote back is deleted again. The marker went in before the revoke's delete, so either this sees it, or the revoke's
//     delete comes after the refresh's write and takes what it wrote;
//   - every MCP request on an OAuth token (src/mcp.ts): a marked grant's token is refused, whatever KV says.
// A marker is a hash of the account's id and the grant's, and when: it names no one, so it stays when the account is deleted (that
// revokes every connection too). It's kept for the refresh tokens' lifetime (src/index.ts refreshTokenTTL): a grant written back can't
// outlive it, since its first refresh or MCP call meets the marker.

import type { Env } from "./env";
import { sha256Hex } from "./util";

export const REVOKED_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

// The library's tokens, access and refresh: `${userId}:${grantId}:${secret}`, each part base64url (src/refresh-once.ts reads them so too).
const TOKEN_SHAPE = /^([A-Za-z0-9_-]{1,256}):([A-Za-z0-9_-]{1,256}):[A-Za-z0-9_-]{1,256}$/;

/** The account and grant a library token belongs to, or null for anything else. */
export function grantOfToken(token: unknown): { userId: string; grantId: string } | null {
  if (typeof token !== "string") return null;
  const match = TOKEN_SHAPE.exec(token);
  return match ? { userId: match[1]!, grantId: match[2]! } : null;
}

const grantHash = (userId: string, grantId: string) => sha256Hex(`lexicommons revoked grant\n${userId}:${grantId}`);

/** Whether this grant of this account was revoked. */
export async function grantRevoked(env: Env, userId: string, grantId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 AS y FROM revoked_grants WHERE grant_hash = ?").bind(await grantHash(userId, grantId)).first();
  return row !== null;
}

/** What revoking needs from the library: its revokeGrant (env.OAUTH_PROVIDER in the app, getOAuthApi(...) beside /token). */
export type Revoker = { revokeGrant: (grantId: string, userId: string) => Promise<void> };

/** Revokes one of this account's connections: the marker first, then the library's delete. */
export async function revokeConnection(env: Env, revoker: Revoker, userId: string, grantId: string, now = Date.now()) {
  await env.DB.prepare("INSERT INTO revoked_grants (grant_hash, revoked_at) VALUES (?, ?) ON CONFLICT (grant_hash) DO NOTHING")
    .bind(await grantHash(userId, grantId), now)
    .run();
  await revoker.revokeGrant(grantId, userId);
}

/**
 * An answer of /token as it may go out: one that hands out an access token of a revoked grant becomes invalid_grant, and the grant a
 * refresh wrote back is deleted again. Anything else goes out as it came. A marker that can't be read refuses the answer (503), so a
 * revoked connection is never handed tokens while D1 can't say.
 */
export async function tokenAnswerGuard(env: Env, revoker: Revoker, request: Request, response: Response): Promise<Response> {
  if (response.status !== 200) return response;
  const body = await response.text();
  const out = () => new Response(body, { status: response.status, headers: response.headers });
  let issued: unknown;
  try {
    issued = (JSON.parse(body) as { access_token?: unknown }).access_token;
  } catch {
    return out();
  }
  const grant = grantOfToken(issued);
  if (!grant) return out();
  let revoked: boolean;
  try {
    revoked = await grantRevoked(env, grant.userId, grant.grantId);
  } catch (error) {
    console.warn(JSON.stringify({ revoked_grants: "read_failed", error: String(error) }));
    return refusal(request, 503, "temporarily_unavailable", "Try again in a moment.");
  }
  if (!revoked) return out();
  await revoker.revokeGrant(grant.grantId, grant.userId).catch((error) => console.warn(JSON.stringify({ revoked_grants: "revoke_again_failed", error: String(error) })));
  return refusal(request, 400, "invalid_grant", "This connection was removed from Lexicommons. Connect the app again.");
}

/** The cron's sweep: markers past the refresh tokens' lifetime. */
export async function sweepRevoked(env: Env, now = Date.now()) {
  const result = await env.DB.prepare("DELETE FROM revoked_grants WHERE revoked_at < ?").bind(now - REVOKED_KEEP_MS).run();
  return result.meta.changes ?? 0;
}

function refusal(request: Request, status: number, error: string, description: string): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  // The library answers /token with CORS for any origin; its refusals here keep that, so a browser app reads them.
  const origin = request.headers.get("Origin");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  if (status === 503) headers.set("Retry-After", "1");
  return new Response(JSON.stringify({ error, error_description: description }), { status, headers });
}
