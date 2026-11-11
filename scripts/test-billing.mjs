// The paid plan's server side (src/billing.ts) on the real migrations in Node's SQLite, with Stripe played in memory: the webhook's
// signature (every way it can be wrong, with the control that a right one passes), Checkout with no trial (promotion codes, the card always taken), a trial
// once per card (a reused card's subscription canceled before any charge), events handled once, a subscription always read from
// Stripe so a late event takes nothing back, a failed payment, retries running out, the read-only month, a refund, a dispute
// held and released or lost, events about other accounts' customers refused, a live event on test keys refused, a Stripe failure
// handled again on the next delivery, deletion ending the plan first, the export. And what the 6 Nov review found: one customer per account
// before Checkout, a double tap one Checkout, another left open expired; an older read never replacing a newer; a refund before its
// subscription; disputes by id; a trial's own events again; once per account; unpaid then paid; deletion ending what Stripe has.
// `node scripts/test-billing.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env: base, row, rows } = workerEnv();
const billing = await import("../src/billing.ts");

const SECRET = "whsec_test_billing_check";
const env = { ...base, PUBLIC_ORIGIN: "http://localhost:8787", PLAN_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_FAKE", STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_MONTHLY: "price_month", STRIPE_PRICE_YEARLY: "price_year", STRIPE_API_BASE: "http://stripe.test" };

// ---------- Stripe, played ----------

const stripe = { subs: new Map(), charges: new Map(), disputes: new Map(), sessions: new Map(), customers: new Map(), idem: new Map(), holds: new Map(), calls: [], failNext: 0 };
const sub = (id, { customer, user, status = "active", fingerprint = "fp_a", interval = "month", periodEnd = 1_800_000_000 } = {}) => {
  const value = { id, object: "subscription", customer, status, metadata: user ? { user_id: user } : {}, cancel_at_period_end: false, trial_end: status === "trialing" ? 1_790_000_000 : null, items: { data: [{ current_period_end: periodEnd, price: { recurring: { interval } } }] }, default_payment_method: { id: "pm_1", card: { fingerprint } } };
  stripe.subs.set(id, value);
  return value;
};
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.origin !== "http://stripe.test") throw new Error(`unexpected fetch ${url}`);
  const method = init.method ?? "GET";
  const path = url.pathname.replace(/^\/v1\//, "");
  const params = Object.fromEntries(method === "GET" ? url.searchParams : new URLSearchParams(String(init.body ?? "")));
  const key = init.headers?.["Idempotency-Key"] ?? null;
  stripe.calls.push({ method, path, params, key, version: init.headers?.["Stripe-Version"] });
  if (stripe.failNext > 0) {
    stripe.failNext--;
    return new Response(JSON.stringify({ error: { message: "Stripe is having a moment" } }), { status: 500 });
  }
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  // An idempotency key Stripe has seen gets the same answer; one whose first request is still going through gets a 409, as Stripe's does.
  if (key && stripe.idem.has(key)) return stripe.idem.get(key) === "in progress" ? json({ error: { type: "idempotency_error", message: "another in-progress request" } }, 409) : json(stripe.idem.get(key));
  if (key) stripe.idem.set(key, "in progress");
  await new Promise((resolve) => setTimeout(resolve, 5)); // the first takes a moment, so a second at once finds it going through
  const remember = (value) => (key && stripe.idem.set(key, value), json(value));
  // A customer made for an account is cus_<the account id after "u_">, as the tests below name them.
  if (method === "POST" && path === "customers") {
    const id = `cus_${String(params["metadata[user_id]"]).replace(/^u_/, "")}`;
    stripe.customers.set(id, { id, email: params.email ?? null });
    return remember({ id, object: "customer" });
  }
  if (method === "POST" && path === "checkout/sessions") {
    const id = `cs_${stripe.sessions.size + 1}`;
    stripe.sessions.set(id, { id, customer: params.customer, status: "open", url: `https://checkout.stripe.com/c/pay/${id}` });
    return remember(stripe.sessions.get(id));
  }
  if (method === "GET" && path === "checkout/sessions") return json({ data: [...stripe.sessions.values()].filter((x) => x.customer === params.customer && (!params.status || x.status === params.status)) });
  let e = path.match(/^checkout\/sessions\/([^/]+)\/expire$/);
  if (e) {
    const session = stripe.sessions.get(decodeURIComponent(e[1]));
    if (!session || session.status !== "open") return json({ error: { message: "Only open sessions can be expired" } }, 400);
    session.status = "expired";
    return json(session);
  }
  if (method === "GET" && path === "subscriptions") return json({ data: [...stripe.subs.values()].filter((x) => x.customer === params.customer) });
  e = path.match(/^disputes\/([^/]+)$/);
  if (e) return stripe.disputes.has(e[1]) ? json(stripe.disputes.get(e[1])) : json({ error: { message: "No such dispute" } }, 404);
  if (method === "POST" && path === "billing_portal/sessions") return json({ id: "bps_1", url: "https://billing.stripe.com/p/session/test_1" });
  let m = path.match(/^subscriptions\/([^/]+)$/);
  if (m) {
    const s = stripe.subs.get(decodeURIComponent(m[1]));
    if (!s) return json({ error: { message: "No such subscription" } }, 404);
    if (method === "DELETE") Object.assign(s, { status: "canceled", ended_at: 1_795_000_000, canceled_at: 1_795_000_000 });
    // Read now, answered later: another request can run in between (the order tests below).
    const snapshot = structuredClone(s);
    if (method === "GET" && stripe.holds.has(s.id)) await stripe.holds.get(s.id);
    return json(snapshot);
  }
  m = path.match(/^charges\/([^/]+)$/);
  if (m) return json(stripe.charges.get(decodeURIComponent(m[1])) ?? { error: {} }, stripe.charges.has(m[1]) ? 200 : 404);
  return json({ error: { message: `not played: ${method} ${path}` } }, 404);
};

const sign = (raw, { secret = SECRET, t = Math.floor(Date.now() / 1000) } = {}) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
let n = 0;
const send = async (type, object, { id = `evt_${++n}`, livemode = false, header } = {}) => {
  const raw = JSON.stringify({ id, object: "event", type, livemode, data: { object } });
  return billing.receiveEvent(env, raw, header ?? sign(raw));
};
const user = (id) => env.DB.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").bind(id, id, Date.now()).run();
const deletes = () => stripe.calls.filter((c) => c.method === "DELETE").map((c) => c.path);
const lastCall = (method, path) => stripe.calls.findLast((c) => c.method === method && c.path === path);

let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error?.message ?? error).split("\n").slice(0, 6).join("\n        ")}`);
  }
};

await user("u_a");
await user("u_b");
await user("u_c");
await user("u_d");

console.log("the webhook's signature");
await test("a right signature passes (the control); a wrong secret, a changed body, an old or future time, nothing, or rubbish don't", async () => {
  const raw = '{"id":"evt_x"}';
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await billing.signedByStripe(raw, sign(raw), SECRET), true);
  assert.equal(await billing.signedByStripe(raw, sign(raw, { secret: "whsec_other" }), SECRET), false);
  assert.equal(await billing.signedByStripe(`${raw} `, sign(raw), SECRET), false);
  assert.equal(await billing.signedByStripe(raw, sign(raw, { t: now - 301 }), SECRET), false);
  assert.equal(await billing.signedByStripe(raw, sign(raw, { t: now + 301 }), SECRET), false);
  for (const header of [null, "", "t=abc,v1=00", `v1=${"a".repeat(64)}`, `t=${now}`, `t=${now},v1=${"z".repeat(64)}`]) assert.equal(await billing.signedByStripe(raw, header, SECRET), false, String(header));
  // One right signature among others (a secret being rolled) passes.
  const right = sign(raw).split(",")[1];
  assert.equal(await billing.signedByStripe(raw, `t=${now},v1=${"0".repeat(64)},${right}`, SECRET), true);
});
await test("a forged event changes nothing, and Stripe is never asked", async () => {
  const before = stripe.calls.length;
  sub("sub_forged", { customer: "cus_forged", user: "u_a" });
  const answer = await send("customer.subscription.created", { id: "sub_forged" }, { header: sign("{}") });
  assert.equal(answer.status, 400);
  assert.equal(stripe.calls.length, before);
  assert.equal(row("SELECT COUNT(*) AS n FROM billing_subscriptions").n, 0);
  assert.equal(row("SELECT COUNT(*) AS n FROM billing_events").n, 0);
});
await test("a live event on test keys is refused; the plan not offered answers 404", async () => {
  assert.equal((await send("customer.subscription.created", { id: "x" }, { livemode: true })).status, 400);
  const off = await billing.receiveEvent({ ...env, PLAN_ENABLED: "false" }, "{}", sign("{}"));
  assert.equal(off.status, 404);
});

console.log("Checkout");
await test("a new account: monthly, no trial, promotion codes taken, the card always asked for, its id on the subscription, back to the plan's page", async () => {
  const { url } = await billing.startCheckout(env, "u_a", "monthly");
  assert.ok(url.startsWith("https://checkout.stripe.com/"));
  const call = lastCall("POST", "checkout/sessions");
  assert.equal(call.version, billing.STRIPE_VERSION);
  assert.equal(call.params.mode, "subscription");
  assert.equal(call.params["line_items[0][price]"], "price_month");
  assert.equal(call.params.client_reference_id, "u_a");
  assert.equal(call.params["subscription_data[metadata][user_id]"], "u_a");
  assert.equal(call.params["subscription_data[trial_period_days]"], undefined, "no trial by default");
  assert.ok(!Object.keys(call.params).some((k) => /trial/.test(k)), "nothing of a trial at all");
  assert.equal(call.params.allow_promotion_codes, "true");
  assert.equal(call.params.payment_method_collection, "always");
  assert.equal(call.params.success_url, "http://localhost:8787/app/#settings/plan?done=1");
  assert.equal(call.params["automatic_tax[enabled]"], "false");
});
await test("the account's customer is made before its first Checkout (with its confirmed email, where Stripe sends receipts; none without one), kept, and every Checkout is on it", async () => {
  assert.equal(row("SELECT customer FROM billing_customers WHERE user_id = 'u_a'").customer, "cus_a");
  assert.equal(lastCall("POST", "checkout/sessions").params.customer, "cus_a");
  await user("u_mail");
  await env.DB.prepare("INSERT INTO account_emails (user_id, email, verified_at, created_at) VALUES (?, ?, ?, ?)").bind("u_mail", "mail@example.com", Date.now(), Date.now()).run();
  await billing.startCheckout(env, "u_mail", "monthly");
  const made = lastCall("POST", "customers");
  assert.equal(made.params.email, "mail@example.com");
  assert.equal(made.params["metadata[user_id]"], "u_mail");
  assert.equal(made.key, "lexicommons-customer:u_mail");
  assert.equal(lastCall("POST", "checkout/sessions").params.customer, "cus_mail");
  assert.equal(lastCall("POST", "checkout/sessions").params.customer_email, undefined);
  await billing.startCheckout(env, "u_b", "monthly");
  assert.equal(lastCall("POST", "customers").params.email, undefined, "an account with no email has none filled in");
  const customers = stripe.calls.filter((c) => c.method === "POST" && c.path === "customers").length;
  await billing.startCheckout(env, "u_mail", "yearly");
  assert.equal(stripe.calls.filter((c) => c.method === "POST" && c.path === "customers").length, customers, "made once");
  assert.equal(lastCall("POST", "checkout/sessions").params.customer, "cus_mail");
});
await test("two Checkouts at once (a double tap) make one customer and one Checkout; a new Checkout expires the one left open, so only one can start a subscription", async () => {
  await user("u_two");
  const at = Date.now();
  const [one, two] = await Promise.all([billing.startCheckout(env, "u_two", "monthly", at), billing.startCheckout(env, "u_two", "monthly", at)]);
  assert.equal(one.url, two.url);
  assert.equal(new Set(stripe.calls.filter((c) => c.path === "customers" && c.params["metadata[user_id]"] === "u_two").map((c) => c.key)).size, 1);
  assert.equal(row("SELECT customer FROM billing_customers WHERE user_id = 'u_two'").customer, "cus_two");
  const open = () => [...stripe.sessions.values()].filter((x) => x.customer === "cus_two" && x.status === "open");
  assert.equal(open().length, 1);
  const first = open()[0].id;
  const yearly = await billing.startCheckout(env, "u_two", "yearly", at + 1000);
  assert.deepEqual(open().map((x) => x.id), [yearly.url.split("/").pop()]);
  assert.equal(stripe.sessions.get(first).status, "expired");
});
await test("yearly; a bad interval, and the plan not offered, refused", async () => {
  await billing.startCheckout(env, "u_b", "yearly");
  assert.equal(lastCall("POST", "checkout/sessions").params["line_items[0][price]"], "price_year");
  await assert.rejects(() => billing.startCheckout(env, "u_b", "weekly"), /monthly" or "yearly/);
  await assert.rejects(() => billing.startCheckout({ ...env, STRIPE_PRICE_YEARLY: "" }, "u_b", "monthly"), /isn't offered/);
});

console.log("events");
await test("a trial starts: the account has it, with the trial's allowance, the card noted, and the same event twice changes nothing", async () => {
  sub("sub_a", { customer: "cus_a", user: "u_a", status: "trialing", fingerprint: "fp_a" });
  const id = "evt_trial_a";
  assert.equal((await send("customer.subscription.created", { id: "sub_a" }, { id })).status, 200);
  const plan = await billing.entitlement(env, "u_a");
  assert.equal(plan.active && plan.trial, true);
  assert.equal(plan.ai.allowance, billing.PLAN.allowance.trial);
  assert.equal(row("SELECT trial_used FROM billing_customers WHERE user_id = 'u_a'").trial_used, 1);
  assert.equal(row("SELECT COUNT(*) AS n FROM billing_trials WHERE fingerprint = 'fp_a'").n, 1);
  const calls = stripe.calls.length;
  const again = await send("customer.subscription.created", { id: "sub_a" }, { id });
  assert.equal(again.body.already, true);
  assert.equal(stripe.calls.length, calls, "Stripe not asked again");
  // And the account that had its trial gets none at Checkout.
  await assert.rejects(() => billing.startCheckout(env, "u_a", "monthly"), /have the plan already/);
});
await test("another account's trial on the same card is canceled before any charge; a different card's isn't (control)", async () => {
  sub("sub_b", { customer: "cus_b", user: "u_b", status: "trialing", fingerprint: "fp_a" });
  await send("customer.subscription.created", { id: "sub_b" });
  assert.ok(deletes().includes("subscriptions/sub_b"));
  const b = await billing.entitlement(env, "u_b");
  assert.equal(b.active, false);
  assert.equal(b.reason, "card_had_trial");
  sub("sub_c", { customer: "cus_c", user: "u_c", status: "trialing", fingerprint: "fp_c" });
  await send("customer.subscription.created", { id: "sub_c" });
  assert.ok(!deletes().includes("subscriptions/sub_c"));
  assert.equal((await billing.entitlement(env, "u_c")).trial, true);
  // The same subscription's own later events don't cancel it for its own card.
  await send("customer.subscription.updated", { id: "sub_c" });
  assert.ok(!deletes().includes("subscriptions/sub_c"));
});
await test("the trial becomes paid; an event carrying an older state takes nothing back (Stripe is read again)", async () => {
  Object.assign(stripe.subs.get("sub_a"), { status: "active", trial_end: null });
  await send("invoice.paid", { id: "in_1", parent: { subscription_details: { subscription: "sub_a" } } });
  assert.equal((await billing.entitlement(env, "u_a")).ai.allowance, billing.PLAN.allowance.plan);
  await send("customer.subscription.updated", { id: "sub_a", status: "trialing" });
  const plan = await billing.entitlement(env, "u_a");
  assert.equal(plan.status, "active");
  assert.equal(plan.trial, false);
});
await test("a failed payment keeps the plan while Stripe retries; retries running out end it, readable 30 days, then nothing", async () => {
  Object.assign(stripe.subs.get("sub_a"), { status: "past_due" });
  await send("invoice.payment_failed", { id: "in_2", subscription: "sub_a" });
  assert.equal((await billing.entitlement(env, "u_a")).active, true);
  Object.assign(stripe.subs.get("sub_a"), { status: "canceled", ended_at: Math.floor(Date.now() / 1000), canceled_at: Math.floor(Date.now() / 1000) });
  await send("customer.subscription.deleted", { id: "sub_a" });
  const ended = await billing.entitlement(env, "u_a");
  assert.equal(ended.active, false);
  assert.equal(ended.cloud, "readonly");
  assert.equal((await billing.entitlement(env, "u_a", Date.now() + 31 * 86_400_000)).cloud, "none");
});
await test("a full refund ends the plan at once; a partial one changes nothing", async () => {
  sub("sub_d", { customer: "cus_d", user: "u_d", status: "active" });
  await send("customer.subscription.created", { id: "sub_d" });
  await send("charge.refunded", { id: "ch_p", customer: "cus_d", refunded: false });
  assert.equal((await billing.entitlement(env, "u_d")).active, true);
  await send("charge.refunded", { id: "ch_f", customer: "cus_d", refunded: true });
  const plan = await billing.entitlement(env, "u_d");
  assert.equal(plan.active, false);
  assert.equal(plan.reason, "refunded");
});
await test("a dispute holds the AI; won, it's back; lost, the plan ends", async () => {
  sub("sub_c2", { customer: "cus_c", user: "u_c", status: "active", fingerprint: "fp_c" });
  stripe.subs.delete("sub_c");
  env.DB.prepare("DELETE FROM billing_subscriptions WHERE id = 'sub_c'").bind().run();
  await send("customer.subscription.created", { id: "sub_c2" });
  stripe.charges.set("ch_c", { id: "ch_c", customer: "cus_c" });
  stripe.disputes.set("dp_1", { id: "dp_1", charge: "ch_c", status: "needs_response" });
  await send("charge.dispute.created", { id: "dp_1", charge: "ch_c" });
  const held = await billing.entitlement(env, "u_c");
  assert.equal(held.active, false);
  assert.equal(held.ai.allowance, 0);
  stripe.disputes.get("dp_1").status = "won";
  await send("charge.dispute.closed", { id: "dp_1", charge: "ch_c", status: "won" });
  assert.equal((await billing.entitlement(env, "u_c")).active, true);
  stripe.disputes.set("dp_2", { id: "dp_2", charge: "ch_c", status: "lost" });
  await send("charge.dispute.created", { id: "dp_2", charge: "ch_c" });
  await send("charge.dispute.closed", { id: "dp_2", charge: "ch_c", status: "lost" });
  const lost = await billing.entitlement(env, "u_c");
  assert.equal(lost.active, false);
  assert.equal(lost.reason, "dispute_lost");
});
await test("a subscription naming one account but on another's customer, or an account that doesn't exist, is refused", async () => {
  sub("sub_x", { customer: "cus_a", user: "u_b", status: "active" });
  const answer = await send("customer.subscription.created", { id: "sub_x" });
  assert.equal(answer.body.result.skipped, "no account");
  assert.ok(!deletes().includes("subscriptions/sub_x"), "another account's customer: refused, not canceled");
  sub("sub_y", { customer: "cus_y", user: "u_nobody", status: "active" });
  const gone = await send("customer.subscription.created", { id: "sub_y" });
  assert.equal(gone.body.result.skipped, "no account");
  assert.equal(gone.body.result.canceled, true, "an account that's gone can't manage it: canceled");
  assert.ok(deletes().includes("subscriptions/sub_y"));
  assert.equal(row("SELECT COUNT(*) AS n FROM billing_subscriptions WHERE id IN ('sub_x', 'sub_y')").n, 0);
});
await test("Stripe failing: the event isn't marked done, and its next delivery is handled", async () => {
  sub("sub_e", { customer: "cus_e", user: "u_b", status: "active" });
  env.DB.prepare("UPDATE billing_customers SET customer = 'cus_e' WHERE user_id = 'u_b'").bind().run();
  stripe.failNext = 1;
  const first = await send("customer.subscription.created", { id: "sub_e" }, { id: "evt_retry" });
  assert.equal(first.status, 500);
  assert.equal(row("SELECT done_at FROM billing_events WHERE id = 'evt_retry'").done_at, null);
  const second = await send("customer.subscription.created", { id: "sub_e" }, { id: "evt_retry" });
  assert.equal(second.status, 200);
  assert.equal((await billing.entitlement(env, "u_b")).active, true);
});

console.log("order, and what the 6 Nov review found");
await test("two of a subscription's events handled at once: the write from the older read never replaces the newer (synced_at)", async () => {
  await user("u_o");
  sub("sub_o", { customer: "cus_o", user: "u_o", status: "active" });
  await send("customer.subscription.created", { id: "sub_o" });
  let release;
  stripe.holds.set("sub_o", new Promise((resolve) => (release = resolve)));
  const older = billing.syncSubscription(env, "sub_o"); // reads "active", then waits
  await new Promise((resolve) => setTimeout(resolve, 20));
  stripe.holds.delete("sub_o");
  Object.assign(stripe.subs.get("sub_o"), { status: "canceled", ended_at: Math.floor(Date.now() / 1000), canceled_at: Math.floor(Date.now() / 1000) });
  await billing.syncSubscription(env, "sub_o"); // reads and writes "canceled"
  release();
  await older;
  assert.equal(row("SELECT status FROM billing_subscriptions WHERE id = 'sub_o'").status, "canceled");
  assert.equal((await billing.entitlement(env, "u_o")).active, false);
});
await test("a full refund that comes before its subscription's events ends it all the same (read from Stripe)", async () => {
  await user("u_r");
  sub("sub_r", { customer: "cus_r", user: "u_r", status: "active" });
  await send("charge.refunded", { id: "ch_r", customer: "cus_r", refunded: true });
  assert.ok(deletes().includes("subscriptions/sub_r"));
  await send("customer.subscription.created", { id: "sub_r" });
  const plan = await billing.entitlement(env, "u_r");
  assert.equal(plan.active, false);
  assert.equal(plan.reason, "refunded");
});
await test("disputes: held while any is open (one won, another still open); one closed before its creation's event is never held", async () => {
  await user("u_q");
  sub("sub_q", { customer: "cus_q", user: "u_q", status: "active" });
  await send("customer.subscription.created", { id: "sub_q" });
  stripe.charges.set("ch_q1", { id: "ch_q1", customer: "cus_q" });
  stripe.charges.set("ch_q2", { id: "ch_q2", customer: "cus_q" });
  stripe.disputes.set("dp_q1", { id: "dp_q1", charge: "ch_q1", status: "needs_response" });
  stripe.disputes.set("dp_q2", { id: "dp_q2", charge: "ch_q2", status: "under_review" });
  await send("charge.dispute.created", { id: "dp_q1" });
  await send("charge.dispute.created", { id: "dp_q2" });
  stripe.disputes.get("dp_q1").status = "won";
  await send("charge.dispute.closed", { id: "dp_q1" });
  assert.equal((await billing.entitlement(env, "u_q")).held, true, "dp_q2 is still open");
  stripe.disputes.get("dp_q2").status = "won";
  await send("charge.dispute.closed", { id: "dp_q2" });
  assert.equal((await billing.entitlement(env, "u_q")).held, false);
  // Closed (won) before its created event arrives: Stripe says won, so nothing is held.
  stripe.charges.set("ch_q3", { id: "ch_q3", customer: "cus_q" });
  stripe.disputes.set("dp_q3", { id: "dp_q3", charge: "ch_q3", status: "won" });
  await send("charge.dispute.closed", { id: "dp_q3" });
  await send("charge.dispute.created", { id: "dp_q3" });
  assert.equal((await billing.entitlement(env, "u_q")).held, false);
});
await test("a trial's own events again, even after its row was lost, never cancel it; a second trial on the same account (another card) is canceled", async () => {
  await user("u_t");
  sub("sub_t", { customer: "cus_t", user: "u_t", status: "trialing", fingerprint: "fp_t" });
  await send("customer.subscription.created", { id: "sub_t" });
  assert.equal((await billing.entitlement(env, "u_t")).trial, true);
  // The claim was written, then the row wasn't (a failure between): Stripe delivers again.
  await env.DB.prepare("DELETE FROM billing_subscriptions WHERE id = 'sub_t'").run();
  await send("customer.subscription.updated", { id: "sub_t" });
  assert.ok(!deletes().includes("subscriptions/sub_t"), "its own trial, not a second");
  assert.equal((await billing.entitlement(env, "u_t")).trial, true);
  Object.assign(stripe.subs.get("sub_t"), { status: "canceled", ended_at: Math.floor(Date.now() / 1000) });
  await send("customer.subscription.deleted", { id: "sub_t" });
  sub("sub_t2", { customer: "cus_t", user: "u_t", status: "trialing", fingerprint: "fp_t_other" });
  await send("customer.subscription.created", { id: "sub_t2" });
  assert.ok(deletes().includes("subscriptions/sub_t2"));
  assert.equal((await billing.entitlement(env, "u_t")).reason, "account_had_trial");
  assert.equal(row("SELECT COUNT(*) AS n FROM billing_trials WHERE fingerprint = 'fp_t_other'").n, 0, "a refused trial claims no card");
});
await test("unpaid, then paid again: its old end goes, so a later end gives its full read-only month", async () => {
  await user("u_p");
  const long = Math.floor(Date.now() / 1000) - 40 * 86_400;
  sub("sub_p", { customer: "cus_p", user: "u_p", status: "unpaid" });
  Object.assign(stripe.subs.get("sub_p"), { ended_at: long });
  await send("customer.subscription.updated", { id: "sub_p" });
  assert.ok(row("SELECT ended_at FROM billing_subscriptions WHERE id = 'sub_p'").ended_at);
  Object.assign(stripe.subs.get("sub_p"), { status: "active", ended_at: null });
  await send("customer.subscription.updated", { id: "sub_p" });
  assert.equal(row("SELECT ended_at FROM billing_subscriptions WHERE id = 'sub_p'").ended_at, null);
  const now = Math.floor(Date.now() / 1000);
  Object.assign(stripe.subs.get("sub_p"), { status: "canceled", ended_at: now, canceled_at: now });
  await send("customer.subscription.deleted", { id: "sub_p" });
  assert.equal((await billing.entitlement(env, "u_p")).cloud, "readonly");
});
await test("deleting an account that bought nothing lately asks Stripe nothing; one with a Checkout within the day does", async () => {
  await user("u_old");
  await env.DB.prepare("INSERT INTO billing_customers (user_id, customer, trial_used, created_at, checkout_at) VALUES ('u_old', 'cus_old', 0, 0, ?)").bind(Date.now() - 2 * 86_400_000).run();
  const calls = stripe.calls.length;
  assert.equal(await billing.endForDeletion(env, "u_old"), 0);
  assert.equal(stripe.calls.length, calls, "Stripe asked nothing");
  // Stripe unreachable makes no difference to it then (a local copy, an outage).
  stripe.failNext = 5;
  assert.equal(await billing.endForDeletion(env, "u_old"), 0);
  stripe.failNext = 0;
  await env.DB.prepare("UPDATE billing_customers SET checkout_at = ? WHERE user_id = 'u_old'").bind(Date.now() - 3_600_000).run();
  await billing.endForDeletion(env, "u_old");
  assert.ok(stripe.calls.length > calls, "a Checkout within the day: Stripe asked");
});
await test("deleting an account expires its open Checkout and ends a subscription Stripe has that isn't written here yet", async () => {
  await user("u_z");
  await billing.startCheckout(env, "u_z", "monthly");
  const open = [...stripe.sessions.values()].find((x) => x.customer === "cus_z" && x.status === "open");
  sub("sub_z", { customer: "cus_z", user: "u_z", status: "active" });
  const ended = await billing.endForDeletion(env, "u_z");
  assert.equal(ended, 1);
  assert.equal(stripe.sessions.get(open.id).status, "expired");
  assert.ok(deletes().includes("subscriptions/sub_z"));
});

console.log("the Portal, deleting, the export");
await test("the Portal for an account with a customer, none without", async () => {
  const { url } = await billing.openPortal(env, "u_b");
  assert.ok(url.startsWith("https://billing.stripe.com/"));
  await user("u_none");
  await assert.rejects(() => billing.openPortal(env, "u_none"), /no plan on this account/);
});
await test("deleting an account ends its live plan at Stripe first; the export carries its billing and no card", async () => {
  const exported = await billing.exportBilling(env, "u_b");
  assert.equal(exported.customer.customer, "cus_e");
  assert.ok(exported.subscriptions.length >= 1);
  assert.ok(!JSON.stringify(exported).includes("fp_"), "no card fingerprint in an export");
  const ended = await billing.endForDeletion(env, "u_b");
  assert.equal(ended, 1);
  assert.ok(deletes().includes("subscriptions/sub_e"));
  // Every table billing.ts says has an account's rows has a user_id; billing_trials has none (control: it's still there).
  for (const table of billing.BILLING_TABLES) assert.ok(rows(`PRAGMA table_info(${table})`).some((c) => c.name === "user_id"), table);
  assert.ok(!rows("PRAGMA table_info(billing_trials)").some((c) => c.name === "user_id"));
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
