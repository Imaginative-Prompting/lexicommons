// A passkey ceremony's challenge, taken once (src/accounts.ts makes them; scripts/test-challenge-once.mjs). Apart from accounts.ts,
// which can't load outside the Worker, so its one rule is tested on its own.

import type { Env } from "./env";
import { readCookie } from "./util";

/** The short-lived cookie holding the browser's pending challenge's id. */
const CHALLENGE_COOKIE = "lc_chal";

/**
 * Takes the pending challenge for this browser, once: read and deleted in one statement, so two requests at once with the same
 * cookie can't both have it (6 Nov 2026, Codex C4: a read, then a delete, let one assertion sign in twice). Only the kind looked
 * for (the cookie's value is the browser's to choose), and an expired one is taken but answers null.
 */
export async function takeChallenge(env: Env, request: Request, kind: string, now = Date.now()) {
  const id = readCookie(request, CHALLENGE_COOKIE);
  if (!id) return null;
  const row = await env.DB.prepare("DELETE FROM challenges WHERE id = ? AND kind = ? RETURNING challenge, user_id, user_name, expires_at")
    .bind(id, kind)
    .first<{ challenge: string; user_id: string | null; user_name: string | null; expires_at: number }>();
  if (!row || row.expires_at <= now) return null;
  return { challenge: row.challenge, user_id: row.user_id, user_name: row.user_name };
}
