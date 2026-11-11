// New accounts, open or paused (the SIGNUPS switch, flags.ts; launch day's SHED step 1, docs/launch-day-site.md). Paused, an account is made
// nowhere: a passkey's sign-up is refused at its first step, before the device is asked for a passkey, and a Google, GitHub or Apple sign-in
// nobody uses yet gets these words instead of the create step. Everyone with an account signs in and studies as before. Nothing a refusal
// writes, sets or asks of the visitor. A passkey sign-up whose options came before the pause still finishes: its passkey is already on the
// person's device, and refusing it would leave them one for an account that doesn't exist (its challenge lasts 5 minutes).

import type { Context } from "hono";
import type { AppContext, Env } from "./env";

/** Whether an account can be made now. */
export const signupsOpen = (env: Env): boolean => env.SIGNUPS !== "paused";

/** The words a visitor gets while new accounts are paused, and the line under them. */
export const SIGNUPS_PAUSED = "We're very busy right now. Try again in a few minutes.";
export const SIGNUPS_PAUSED_HAVE = "If you already have an account, sign in as usual.";

/**
 * One line in the Worker's log that launch day's watch counts (scratch/lex-selfhost/launch/tail-watch.py): an account made, or a sign-up
 * turned away while paused. A tail event carries a response's status but not its body, so these are what make its two counts exact.
 */
export const watchLine = (what: "signup" | "signups_paused"): void => console.log(`lx-watch ${what}`);

/** A refused sign-up over the API: 503 in words with Retry-After, code "signups_paused" (never "overloaded": the app's retry leaves it). */
export function signupsPausedAnswer(c: Context<AppContext>): Response {
  watchLine("signups_paused");
  return c.json({ error: SIGNUPS_PAUSED, code: "signups_paused" }, 503, { "Retry-After": "300", "Cache-Control": "no-store" });
}
