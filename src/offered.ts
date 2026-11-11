// Whether this site offers the paid plan, from its vars alone. Apart from billing.ts so any module can ask (account-email.ts says
// "receipts" only where there can be any) without importing what the plan needs. And what an admin's own device previews (src/flags.ts
// withPreviews marks a request with PREVIEWS): the plan shown to that admin alone, with nothing to buy until it's really offered.
import type { Env } from "./env";

/** Whether this site offers the plan: switched on (PLAN_ENABLED "true"), and Stripe's keys and prices set. Money only moves where it does. */
export const planOffered = (env: Env) => env.PLAN_ENABLED === "true" && Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_MONTHLY && env.STRIPE_PRICE_YEARLY);

/** The flags this request previews: an admin's, on their own device, set by flags.ts withPreviews and nothing else (a symbol no var can be). */
export const PREVIEWS = Symbol("an admin's previews on this device");
const NONE: ReadonlySet<string> = new Set();
export const previewing = (env: Env): ReadonlySet<string> => (env as Env & { [PREVIEWS]?: ReadonlySet<string> })[PREVIEWS] ?? NONE;

/** Whether this request is shown the plan (its pages, /api/me's features.plan): offered, or an admin previewing it on this device. */
export const planShown = (env: Env) => planOffered(env) || previewing(env).has("PLAN_ENABLED");
