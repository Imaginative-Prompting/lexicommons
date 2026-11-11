// The paid plan, with Stripe: Checkout to start it, the Customer Portal to change or
// cancel it, and Stripe's webhook as the one source of who has it. Offered only where PLAN_ENABLED is "true" and Stripe's keys
// and prices are set (planOffered); a copy on someone's own computer has none of it.
//
// The webhook (POST /api/billing/stripe, outside the gate: it's signed) is checked before anything is read: HMAC-SHA256 of
// "<t>.<raw body>" with the endpoint's secret, any v1 signature matching (so a secret can be rolled), at most 300 s old. Each
// event is handled once (billing_events). A subscription is never taken from an event: it's read from Stripe again and written
// as Stripe says it is now, so events arriving late or out of order can't take anything back; and a write from an older read
// never replaces one from a newer (synced_at), so two events handled at once can't either. Disputes are read from Stripe too.
//
// Every account has one Stripe customer, made before its first Checkout, so whatever it buys is in its Portal and ends with it.
// Starting a Checkout expires any other still open, so two tabs can't start two subscriptions.
//
// A trial (set by hand in Stripe; none by default) is once per account and once per card: Stripe has no setting for the card, so
// a trialing subscription whose card (by Stripe's fingerprint) has had one, or on an account that had one, is canceled at once,
// before anything is charged. A claim is the subscription's own, so its later events are never taken for a second trial.
// A full refund ends the customer's live plan at once (read from Stripe, so one not written here yet ends too); a dispute holds
// the AI while any of the customer's is open, and a lost one ends the plan.

import type { Env } from "./env";
import { accountEmail } from "./account-email";
import { planOffered } from "./offered";

/** Stripe's API version the app is written for (the sandbox's on 5 Nov 2026). */
export const STRIPE_VERSION = "2026-10-28.endive";

export const PLAN = {
  // No free trial by default: the app itself is free, and the plan is storage and AI. A first month free comes only from a
  // promotion code entered at Checkout (scripts/billing-promo.mjs: a 100%-off-once coupon, each code with a redemption limit).
  // A trial can still be set on a subscription by hand in Stripe, and is handled as one (once per account and per card).
  /** The in-app AI's monthly allowance, in millionths of a dollar of the provider's reported cost: the plan's, and a trial's in all. */
  allowance: { plan: 2_000_000, trial: 500_000 },
  /** After the plan ends, Lexicommons Cloud stays readable this long, then goes. */
  readOnlyDays: 30,
  signatureTolerance: 300, // seconds
};

/** The tables with an account's rows here (deleted with the account; in its export). billing_trials has no account in it. */
export const BILLING_TABLES = ["billing_customers", "billing_subscriptions", "ai_meter", "ai_usage"];

// Whether this site offers the plan (offered.ts): switched on, and Stripe's keys and prices set.
export { planOffered };

export class BillingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// ---------- the signature ----------

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
/** Two strings compared in time that doesn't depend on where they differ. */
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Whether a Stripe-Signature header signs this raw body with this secret: "t=<seconds>,v1=<hex>[,v1=…]", the timestamp within the
 * tolerance of now (seconds). Anything malformed is false.
 */
export async function signedByStripe(raw: string, header: string | null, secret: string, now = Math.floor(Date.now() / 1000), tolerance = PLAN.signatureTolerance) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => part.split("=", 2) as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k, v]) => k === "v1" && /^[0-9a-f]{64}$/.test(v ?? "")).map(([, v]) => v);
  if (!t || !/^\d{1,12}$/.test(t) || !signatures.length) return false;
  if (Math.abs(now - Number(t)) > tolerance) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  return signatures.some((signature) => sameText(signature, expected));
}

// ---------- Stripe's API ----------

/** Form-encodes params the way Stripe reads them (a[b][0]=…). */
function form(params: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    const name = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((item, i) => (item && typeof item === "object" ? form(item as Record<string, unknown>, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(item))));
    else if (typeof v === "object") form(v as Record<string, unknown>, name, out);
    else out.append(name, String(v));
  }
  return out;
}

type Json = Record<string, any>;
/** A call to Stripe's API. idempotencyKey: two calls with it get one result (a POST made twice at once makes one thing). */
async function stripe(env: Env, method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<Json> {
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.PUBLIC_ORIGIN);
  const url = new URL(`${local && env.STRIPE_API_BASE ? env.STRIPE_API_BASE : "https://api.stripe.com"}/v1/${path}`);
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Stripe-Version": STRIPE_VERSION, ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) } };
  if (params && method === "GET") for (const [k, v] of form(params)) url.searchParams.append(k, v);
  else if (params) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = form(params).toString();
  }
  // A second call with a key whose first is still going through gets a 409 from Stripe: it waits, then gets the first's answer.
  for (const wait of idempotencyKey ? IDEMPOTENT_WAITS : []) {
    const response = await fetch(url, init);
    if (response.status !== 409) return answerOf(response);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  return answerOf(await fetch(url, init));
}
const IDEMPOTENT_WAITS = [250, 500, 1000, 2000];
async function answerOf(response: Response): Promise<Json> {
  const body = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok) throw new BillingError(`Stripe: ${String(body?.error?.message ?? response.status).slice(0, 200)}`, 502);
  return body;
}

// ---------- the account's plan ----------

type SubscriptionRow = { id: string; user_id: string; customer: string; status: string; interval: string | null; current_period_end: number | null; cancel_at_period_end: number; trial_start: number | null; trial_end: number | null; held: number; ended_at: number | null; ended_reason: string | null; updated_at: number };
const LIVE = new Set(["active", "trialing", "past_due"]);

/**
 * What this account has, worked out from its subscriptions: { active, trial, status, interval, until (ms), cancels (ms or null),
 * held, ai: { allowance } , cloud: "writable" | "readonly" | "none", reason }. Null when the site doesn't offer the plan.
 */
export async function entitlement(env: Env, userId: string, now = Date.now()) {
  if (!planOffered(env)) return null;
  const rows = (await env.DB.prepare("SELECT * FROM billing_subscriptions WHERE user_id = ? ORDER BY updated_at DESC").bind(userId).all<SubscriptionRow>()).results;
  const live = rows.find((row) => LIVE.has(row.status));
  const customer = await env.DB.prepare("SELECT trial_used FROM billing_customers WHERE user_id = ?").bind(userId).first<{ trial_used: number }>();
  if (live) {
    const trial = live.status === "trialing";
    return {
      active: !live.held,
      trial,
      status: live.status,
      interval: live.interval,
      until: (trial ? live.trial_end : live.current_period_end) ?? null,
      // A trial's allowance is for the whole trial, across a month's end (ai-hosted.ts allowanceNow).
      trialStart: trial ? live.trial_start : null,
      cancels: live.cancel_at_period_end ? live.current_period_end : null,
      held: Boolean(live.held),
      ai: { allowance: live.held ? 0 : trial ? PLAN.allowance.trial : PLAN.allowance.plan },
      cloud: "writable" as const,
      trialUsed: true,
      reason: null,
    };
  }
  const last = rows[0];
  const endedAt = last?.ended_at ?? null;
  const readable = endedAt !== null && now - endedAt < PLAN.readOnlyDays * 86_400_000;
  return {
    active: false,
    trial: false,
    status: last?.status ?? null,
    interval: last?.interval ?? null,
    until: readable ? endedAt! + PLAN.readOnlyDays * 86_400_000 : null,
    trialStart: null,
    cancels: null,
    held: false,
    ai: { allowance: 0 },
    cloud: readable ? ("readonly" as const) : ("none" as const),
    trialUsed: Boolean(customer?.trial_used),
    reason: last?.ended_reason ?? null,
  };
}

/**
 * The account's Stripe customer, made once before its first Checkout (with the account's confirmed email, where Stripe sends
 * receipts: account-email.ts), so every Checkout and subscription it starts is on one customer: in its Portal, ended with it.
 * Two requests at once make the same one (an idempotency key per account), and the first kept here is the account's.
 */
async function customerFor(env: Env, userId: string): Promise<string> {
  const held = await env.DB.prepare("SELECT customer FROM billing_customers WHERE user_id = ?").bind(userId).first<{ customer: string }>();
  if (held) return held.customer;
  const email = (await accountEmail(env, userId))?.email ?? null;
  const made = await stripe(env, "POST", "customers", { ...(email ? { email } : {}), metadata: { user_id: userId } }, `lexicommons-customer:${userId}`);
  if (typeof made.id !== "string" || !made.id) throw new BillingError("Stripe didn't make a customer.", 502);
  await env.DB.prepare("INSERT INTO billing_customers (user_id, customer, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING").bind(userId, made.id, Date.now()).run();
  const kept = await env.DB.prepare("SELECT customer FROM billing_customers WHERE user_id = ?").bind(userId).first<{ customer: string }>();
  if (!kept) throw new BillingError("The account's customer wasn't kept.", 500);
  return kept.customer;
}

/** A customer's Checkouts still open, but keep: expired, so none of them can start a subscription. Returns how many. */
async function expireOpenCheckouts(env: Env, customer: string, keep: string | null = null) {
  const open = await stripe(env, "GET", "checkout/sessions", { customer, status: "open", limit: 100 });
  let expired = 0;
  for (const session of (open.data ?? []) as Json[]) {
    if (typeof session.id !== "string" || session.id === keep) continue;
    // One completed meanwhile can't be expired; its subscription is then the customer's, and is handled as one.
    await stripe(env, "POST", `checkout/sessions/${encodeURIComponent(session.id)}/expire`).then(() => expired++, () => {});
  }
  return expired;
}

/**
 * Starts Checkout for the plan, monthly or yearly: { url }. No trial; a promotion code can be entered there, and the card is taken
 * even when the first month costs nothing. Any other Checkout of the account's still open is expired: one at a time. The same ask
 * twice within a minute (a double tap) gets the same Checkout.
 */
export async function startCheckout(env: Env, userId: string, interval: unknown, now = Date.now()) {
  if (!planOffered(env)) throw new BillingError("The plan isn't offered here.", 404);
  const price = interval === "yearly" ? env.STRIPE_PRICE_YEARLY : interval === "monthly" ? env.STRIPE_PRICE_MONTHLY : null;
  if (!price) throw new BillingError('interval must be "monthly" or "yearly".');
  const plan = await entitlement(env, userId);
  if (plan?.status && LIVE.has(plan.status)) throw new BillingError("You have the plan already. Change it from Manage your plan.", 409);
  const customer = await customerFor(env, userId);
  const origin = env.PUBLIC_ORIGIN;
  const session = await stripe(env, "POST", "checkout/sessions", {
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: userId,
    customer,
    success_url: `${origin}/app/#settings/plan?done=1`,
    cancel_url: `${origin}/app/#settings/plan`,
    allow_promotion_codes: "true",
    payment_method_collection: "always",
    automatic_tax: { enabled: env.STRIPE_AUTOMATIC_TAX === "true" ? "true" : "false" },
    subscription_data: { metadata: { user_id: userId } },
  }, `lexicommons-checkout:${userId}:${interval}:${Math.floor(now / 60_000)}`);
  if (typeof session.url !== "string" || !session.url.startsWith("https://checkout.stripe.com/")) throw new BillingError("Stripe didn't give a Checkout page.", 502);
  await env.DB.prepare("UPDATE billing_customers SET checkout_at = ? WHERE user_id = ?").bind(now, userId).run();
  await expireOpenCheckouts(env, customer, typeof session.id === "string" ? session.id : null);
  return { url: session.url };
}

/** Opens the Customer Portal for this account: { url }. */
export async function openPortal(env: Env, userId: string) {
  if (!planOffered(env)) throw new BillingError("The plan isn't offered here.", 404);
  const customer = await env.DB.prepare("SELECT customer FROM billing_customers WHERE user_id = ?").bind(userId).first<{ customer: string }>();
  if (!customer) throw new BillingError("There's no plan on this account yet.", 404);
  const session = await stripe(env, "POST", "billing_portal/sessions", {
    customer: customer.customer,
    return_url: `${env.PUBLIC_ORIGIN}/app/#settings/plan`,
    ...(env.STRIPE_PORTAL_CONFIGURATION ? { configuration: env.STRIPE_PORTAL_CONFIGURATION } : {}),
  });
  if (typeof session.url !== "string" || !/^https:\/\/billing\.stripe\.com\//.test(session.url)) throw new BillingError("Stripe didn't give a Portal page.", 502);
  return { url: session.url };
}

// ---------- the webhook ----------

/**
 * Which account a subscription is for: the user its Checkout named, if that account holds its customer (or none does yet).
 * { userId: null, gone: true } when the account it names no longer exists and nobody holds its customer: deleted while its
 * Checkout was open.
 */
async function ownerOf(env: Env, sub: Json): Promise<{ userId: string | null; gone?: boolean }> {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const named = typeof sub.metadata?.user_id === "string" ? sub.metadata.user_id : null;
  const held = await env.DB.prepare("SELECT user_id FROM billing_customers WHERE customer = ?").bind(customer).first<{ user_id: string }>();
  if (held) return { userId: !named || named === held.user_id ? held.user_id : null };
  if (!named) return { userId: null };
  const user = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(named).first();
  if (!user) return { userId: null, gone: true };
  // The account's first customer: kept, unless the account already has another (then this one isn't its).
  const result = await env.DB.prepare("INSERT INTO billing_customers (user_id, customer, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING").bind(named, customer, Date.now()).run();
  if (!result.meta.changes) {
    const mine = await env.DB.prepare("SELECT customer FROM billing_customers WHERE user_id = ?").bind(named).first<{ customer: string }>();
    return { userId: mine?.customer === customer ? named : null };
  }
  return { userId: named };
}

/**
 * Whether a trialing subscription may have its trial: once per account (its first trial subscription is the only one) and once
 * per card (the first subscription to claim the card's fingerprint). A claim is the subscription's own, so a repeat of its events,
 * or a write that failed after the claim, never counts it as a second. Returns null, or why it's refused.
 */
async function trialRefusal(env: Env, userId: string, id: string, fingerprint: unknown): Promise<string | null> {
  const account = () => env.DB.prepare("SELECT trial_subscription FROM billing_customers WHERE user_id = ?").bind(userId).first<{ trial_subscription: string | null }>();
  const before = await account();
  if (before?.trial_subscription && before.trial_subscription !== id) return "account_had_trial";
  if (typeof fingerprint === "string" && fingerprint) {
    await env.DB.prepare("INSERT INTO billing_trials (fingerprint, at, subscription) VALUES (?, ?, ?) ON CONFLICT(fingerprint) DO NOTHING").bind(fingerprint, Date.now(), id).run();
    const claim = await env.DB.prepare("SELECT subscription FROM billing_trials WHERE fingerprint = ?").bind(fingerprint).first<{ subscription: string | null }>();
    // A claim from before claims were named (0024): it's this subscription's if this subscription is already kept as trialing.
    if (claim && claim.subscription === null) {
      const mine = await env.DB.prepare("SELECT 1 FROM billing_subscriptions WHERE id = ? AND status = 'trialing'").bind(id).first();
      if (!mine) return "card_had_trial";
      await env.DB.prepare("UPDATE billing_trials SET subscription = ? WHERE fingerprint = ? AND subscription IS NULL").bind(id, fingerprint).run();
    } else if (claim && claim.subscription !== id) return "card_had_trial";
  }
  await env.DB.prepare("UPDATE billing_customers SET trial_used = 1, trial_subscription = COALESCE(trial_subscription, ?) WHERE user_id = ?").bind(id, userId).run();
  // Two of the account's trials at once: the one that claimed it first has it.
  const after = await account();
  return after && after.trial_subscription !== id ? "account_had_trial" : null;
}

/**
 * Reads a subscription from Stripe and writes it as it is now; a trialing one refused its trial (trialRefusal) is canceled first.
 * The row keeps when Stripe was read (synced_at): a write from an older read never replaces a newer one, so two of its events
 * handled at once can't put back what Stripe had already changed. A subscription whose account is gone is canceled: nothing here
 * could manage it.
 */
export async function syncSubscription(env: Env, id: string) {
  let readAt = Date.now();
  let sub = await stripe(env, "GET", `subscriptions/${encodeURIComponent(id)}`, { expand: ["default_payment_method"] });
  const { userId, gone } = await ownerOf(env, sub);
  if (!userId) {
    if (gone && (LIVE.has(sub.status) || sub.status === "incomplete" || sub.status === "unpaid")) {
      await stripe(env, "DELETE", `subscriptions/${encodeURIComponent(id)}`);
      return { id, skipped: "no account", canceled: true };
    }
    return { id, skipped: "no account" };
  }
  let reason: string | null = null;
  if (sub.status === "trialing") {
    reason = await trialRefusal(env, userId, id, sub.default_payment_method?.card?.fingerprint);
    if (reason) {
      // Canceled now, before anything is charged.
      readAt = Date.now();
      sub = await stripe(env, "DELETE", `subscriptions/${encodeURIComponent(id)}`);
    }
  }
  const item = sub.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? sub.current_period_end ?? null;
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired" || sub.status === "unpaid";
  // Back to live (paid after being unpaid): its old end goes, so a later end is counted from then.
  await env.DB.prepare(
    `INSERT INTO billing_subscriptions (id, user_id, customer, status, interval, current_period_end, cancel_at_period_end, trial_start, trial_end, ended_at, ended_reason, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, interval = excluded.interval, current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end, trial_start = excluded.trial_start, trial_end = excluded.trial_end,
       ended_at = CASE WHEN excluded.ended_at IS NULL THEN NULL ELSE COALESCE(billing_subscriptions.ended_at, excluded.ended_at) END,
       ended_reason = CASE WHEN excluded.ended_at IS NULL THEN NULL ELSE COALESCE(excluded.ended_reason, billing_subscriptions.ended_reason) END,
       updated_at = excluded.updated_at, synced_at = excluded.synced_at
     WHERE billing_subscriptions.synced_at IS NULL OR excluded.synced_at >= billing_subscriptions.synced_at`,
  )
    .bind(
      id,
      userId,
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
      sub.status,
      item?.price?.recurring?.interval ?? null,
      periodEnd ? periodEnd * 1000 : null,
      sub.cancel_at_period_end ? 1 : 0,
      sub.trial_start ? sub.trial_start * 1000 : null,
      sub.trial_end ? sub.trial_end * 1000 : null,
      ended ? (sub.ended_at ?? sub.canceled_at ?? Math.floor(Date.now() / 1000)) * 1000 : null,
      reason,
      Date.now(),
      readAt,
    )
    .run();
  return { id, userId, status: sub.status, reason };
}

/** A customer's subscriptions that can still charge, as Stripe has them now (one not written here yet included). */
async function liveAtStripe(env: Env, customer: string) {
  const list = await stripe(env, "GET", "subscriptions", { customer, status: "all", limit: 100 });
  return ((list.data ?? []) as Json[]).filter((s) => typeof s.id === "string" && (LIVE.has(s.status) || s.status === "incomplete" || s.status === "unpaid")).map((s) => s.id as string);
}

/** Ends a customer's live subscriptions at once (a refund, a lost dispute), saying why. */
async function endForCustomer(env: Env, customer: string, reason: string) {
  const live = await liveAtStripe(env, customer);
  for (const id of live) {
    await stripe(env, "DELETE", `subscriptions/${encodeURIComponent(id)}`);
    await syncSubscription(env, id);
    await env.DB.prepare("UPDATE billing_subscriptions SET ended_reason = ? WHERE id = ?").bind(reason, id).run();
  }
  return live.length;
}

// A dispute still to be settled (an inquiry's too): the AI is held while any of the customer's is.
const OPEN_DISPUTE = ["warning_needs_response", "warning_under_review", "needs_response", "under_review"];

const customerOf = (object: Json) => (typeof object?.customer === "string" ? object.customer : (object?.customer?.id ?? null));

/** One verified event: what it changes. */
async function handle(env: Env, event: Json) {
  const object = event.data?.object ?? {};
  switch (event.type) {
    case "checkout.session.completed":
      return object.subscription ? syncSubscription(env, String(object.subscription)) : { skipped: "no subscription" };
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return syncSubscription(env, String(object.id));
    case "invoice.paid":
    case "invoice.payment_failed": {
      const sub = object.parent?.subscription_details?.subscription ?? object.subscription;
      return sub ? syncSubscription(env, String(sub)) : { skipped: "not a subscription's invoice" };
    }
    case "charge.refunded": {
      // A full refund ends the plan at once; a partial one changes nothing.
      if (!object.refunded) return { skipped: "partial refund" };
      const customer = customerOf(object);
      return customer ? { ended: await endForCustomer(env, customer, "refunded") } : { skipped: "no customer" };
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      // The dispute as Stripe has it now, whatever order its events came in.
      if (typeof object.id !== "string") return { skipped: "no dispute" };
      const dispute = await stripe(env, "GET", `disputes/${encodeURIComponent(object.id)}`);
      const charge = typeof dispute.charge === "string" ? await stripe(env, "GET", `charges/${encodeURIComponent(dispute.charge)}`) : dispute.charge;
      const customer = customerOf(charge);
      if (!customer || typeof dispute.status !== "string") return { skipped: "no customer" };
      await env.DB.prepare("INSERT INTO billing_disputes (id, customer, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at")
        .bind(dispute.id ?? object.id, customer, dispute.status, Date.now())
        .run();
      if (dispute.status === "lost") return { ended: await endForCustomer(env, customer, "dispute_lost") };
      const open = await env.DB.prepare(`SELECT COUNT(*) AS n FROM billing_disputes WHERE customer = ? AND status IN (${OPEN_DISPUTE.map(() => "?").join(", ")})`)
        .bind(customer, ...OPEN_DISPUTE)
        .first<{ n: number }>();
      const held = (open?.n ?? 0) > 0 ? 1 : 0;
      await env.DB.prepare("UPDATE billing_subscriptions SET held = ?, updated_at = ? WHERE customer = ?").bind(held, Date.now(), customer).run();
      return held ? { held: customer } : { released: customer };
    }
    default:
      return { skipped: "not one this site listens for" };
  }
}

/** POST /api/billing/stripe: checked, then each event once. Returns { status, body } for the route. */
export async function receiveEvent(env: Env, raw: string, signature: string | null, now = Math.floor(Date.now() / 1000)) {
  if (!planOffered(env)) return { status: 404, body: { error: "not_offered" } };
  if (!(await signedByStripe(raw, signature, env.STRIPE_WEBHOOK_SECRET!, now))) return { status: 400, body: { error: "bad_signature" } };
  let event: Json;
  try {
    event = JSON.parse(raw);
  } catch {
    return { status: 400, body: { error: "not_json" } };
  }
  if (typeof event?.id !== "string" || typeof event?.type !== "string") return { status: 400, body: { error: "not_an_event" } };
  if (event.livemode === true && String(env.STRIPE_SECRET_KEY).startsWith("sk_test_")) return { status: 400, body: { error: "live_event_on_test_keys" } };
  const seen = await env.DB.prepare("INSERT INTO billing_events (id, type, received_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(event.id, event.type, Date.now()).run();
  if (!seen.meta.changes) {
    const done = await env.DB.prepare("SELECT done_at FROM billing_events WHERE id = ?").bind(event.id).first<{ done_at: number | null }>();
    if (done?.done_at) return { status: 200, body: { ok: true, already: true } };
  }
  try {
    const result = await handle(env, event);
    await env.DB.prepare("UPDATE billing_events SET done_at = ? WHERE id = ?").bind(Date.now(), event.id).run();
    return { status: 200, body: { ok: true, result } };
  } catch (error) {
    // Not marked done: Stripe sends it again, and it's handled then.
    return { status: 500, body: { error: error instanceof Error ? error.message : "failed" } };
  }
}

/** How long after starting a Checkout one may still be open, or its subscription not written here yet (a Session lasts 24 h at most). */
const CHECKOUT_OPEN_MS = 24 * 60 * 60 * 1000;

/**
 * Before an account is deleted: its Checkouts still open are expired and its live subscriptions end at Stripe (as Stripe has them,
 * so one whose events haven't come yet ends too), so nothing is charged after. Stripe is asked only when something there could still
 * charge: a live subscription kept here, or a Checkout started within the day. Throws if Stripe can't be reached then.
 */
export async function endForDeletion(env: Env, userId: string, now = Date.now()) {
  if (!env.STRIPE_SECRET_KEY) return 0;
  const customer = await env.DB.prepare("SELECT customer, checkout_at FROM billing_customers WHERE user_id = ?").bind(userId).first<{ customer: string; checkout_at: number | null }>();
  if (!customer) return 0;
  const keptLive = await env.DB.prepare("SELECT 1 FROM billing_subscriptions WHERE user_id = ? AND status IN ('active', 'trialing', 'past_due', 'incomplete', 'unpaid') LIMIT 1").bind(userId).first();
  const checkoutLately = customer.checkout_at !== null && now - customer.checkout_at < CHECKOUT_OPEN_MS;
  if (!keptLive && !checkoutLately) return 0;
  if (checkoutLately) await expireOpenCheckouts(env, customer.customer);
  const live = await liveAtStripe(env, customer.customer);
  for (const id of live) await stripe(env, "DELETE", `subscriptions/${encodeURIComponent(id)}`);
  return live.length;
}

/** What the export carries of billing: the customer's id, the subscriptions as kept here, the AI's months and use (no content). */
export async function exportBilling(env: Env, userId: string) {
  const [customer, subscriptions, meter, usage] = await Promise.all([
    env.DB.prepare("SELECT customer, trial_used, created_at FROM billing_customers WHERE user_id = ?").bind(userId).first(),
    env.DB.prepare("SELECT id, status, interval, current_period_end, cancel_at_period_end, trial_end, held, ended_at, ended_reason, updated_at FROM billing_subscriptions WHERE user_id = ? ORDER BY updated_at").bind(userId).all(),
    env.DB.prepare("SELECT month, allowance, spent, reserved FROM ai_meter WHERE user_id = ? ORDER BY month").bind(userId).all(),
    env.DB.prepare("SELECT at, feature, model, prompt_tokens, cached_tokens, completion_tokens, cost_micro FROM ai_usage WHERE user_id = ? ORDER BY at").bind(userId).all(),
  ]);
  return { customer, subscriptions: subscriptions.results, aiMonths: meter.results, aiUse: usage.results };
}
