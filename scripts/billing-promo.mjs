#!/usr/bin/env node
// Promotion codes for the plan's first month free (src/billing.ts: Checkout takes codes, and there's no trial by default). Every code
// points at one coupon, "First month free" (100% off, once), made here the first time it's needed and found again after by its
// metadata. A code has a redemption limit, may expire, and only a customer who has never paid can use it. The card is still taken at
// Checkout, so the second month is charged unless the plan is canceled first.
//
// Stripe's key comes from the environment (STRIPE_SECRET_KEY), never an argument or a file, and is never printed. A live key needs
// --live; a test key is refused with --live, so the two can't be mixed up.
//   STRIPE_SECRET_KEY=… node scripts/billing-promo.mjs create <CODE> --max <n> [--expires YYYY-MM-DD] [--live]
//   STRIPE_SECRET_KEY=… node scripts/billing-promo.mjs list [--live]
//   STRIPE_SECRET_KEY=… node scripts/billing-promo.mjs stop <CODE> [--live]
// Prints JSON: the code, its limit, how many times it's been used, whether it's active.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const [command, code] = args.filter((a, i) => !a.startsWith("--") && !["--max", "--expires"].includes(args[i - 1]));
const LIVE = flag("live");
const stop = (message) => {
  console.error(message);
  process.exit(2);
};

const KEY = process.env.STRIPE_SECRET_KEY ?? "";
if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(KEY)) stop("Set STRIPE_SECRET_KEY in the environment (never as an argument).");
const keyIsLive = /^(sk|rk)_live_/.test(KEY);
if (keyIsLive !== LIVE) stop(keyIsLive ? "That's a live key: add --live if you mean the live account." : "--live with a test key: leave --live off for the sandbox.");
// The same API version the Worker uses (src/billing.ts), read from there so the two stay in step.
const VERSION = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/billing.ts"), "utf8").match(/STRIPE_VERSION = "([^"]+)"/)?.[1];
if (!VERSION) stop("Couldn't read STRIPE_VERSION from src/billing.ts.");

const COUPON = { name: "First month free", percent_off: "100", duration: "once", "metadata[lexicommons]": "first-month-free" };

async function stripe(method, path, params = {}) {
  const body = new URLSearchParams(params);
  const url = method === "GET" ? `https://api.stripe.com/v1/${path}?${body}` : `https://api.stripe.com/v1/${path}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Stripe-Version": VERSION, ...(method === "GET" ? {} : { "Content-Type": "application/x-www-form-urlencoded" }) },
    ...(method === "GET" ? {} : { body }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Stripe: ${json?.error?.message ?? response.status}`);
  if (json.livemode !== undefined && json.livemode !== LIVE) throw new Error("Stripe answered in the other mode: stopped.");
  return json;
}

/** The first-month-free coupon: found by its metadata, or made. */
async function coupon() {
  for (let after = null; ; ) {
    const page = await stripe("GET", "coupons", { limit: "100", ...(after ? { starting_after: after } : {}) });
    const found = page.data.find((c) => c.metadata?.lexicommons === "first-month-free" && c.valid);
    if (found) return found;
    if (!page.has_more) break;
    after = page.data.at(-1).id;
  }
  return stripe("POST", "coupons", COUPON);
}

const shown = (p) => ({ code: p.code, id: p.id, active: p.active, used: p.times_redeemed, max: p.max_redemptions, expires: p.expires_at ? new Date(p.expires_at * 1000).toISOString().slice(0, 10) : null, newCustomersOnly: p.restrictions?.first_time_transaction ?? false });

async function ours() {
  const out = [];
  for (let after = null; ; ) {
    const page = await stripe("GET", "promotion_codes", { limit: "100", ...(after ? { starting_after: after } : {}) });
    out.push(...page.data.filter((p) => p.metadata?.lexicommons === "first-month-free"));
    if (!page.has_more) break;
    after = page.data.at(-1).id;
  }
  return out;
}

async function main() {
  if (command === "create") {
    if (!code || !/^[A-Za-z0-9-]{3,40}$/.test(code)) stop("create <CODE>: 3 to 40 letters, digits or dashes.");
    const max = Number(option("max"));
    if (!Number.isInteger(max) || max < 1 || max > 100_000) stop("--max <n>: how many times the code can be used, at least 1.");
    const expires = option("expires");
    let expiresAt;
    if (expires !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) stop("--expires YYYY-MM-DD");
      expiresAt = Math.floor(Date.parse(`${expires}T23:59:59Z`) / 1000);
      if (!(expiresAt > Date.now() / 1000)) stop("--expires must be a day still to come.");
    }
    const c = await coupon();
    const made = await stripe("POST", "promotion_codes", {
      "promotion[type]": "coupon",
      "promotion[coupon]": c.id,
      code,
      max_redemptions: String(max),
      "restrictions[first_time_transaction]": "true",
      "metadata[lexicommons]": "first-month-free",
      ...(expiresAt ? { expires_at: String(expiresAt) } : {}),
    });
    console.log(JSON.stringify({ made: shown(made), coupon: { id: c.id, name: c.name, percent_off: c.percent_off, duration: c.duration } }, null, 2));
  } else if (command === "list") {
    console.log(JSON.stringify((await ours()).map(shown), null, 2));
  } else if (command === "stop") {
    if (!code) stop("stop <CODE>");
    const found = (await ours()).filter((p) => p.code.toLowerCase() === code.toLowerCase() && p.active);
    if (!found.length) stop(`No active code ${code} of ours.`);
    const stopped = [];
    for (const p of found) stopped.push(shown(await stripe("POST", `promotion_codes/${p.id}`, { active: "false" })));
    console.log(JSON.stringify({ stopped }, null, 2));
  } else {
    stop("billing-promo.mjs create <CODE> --max <n> [--expires YYYY-MM-DD] | list | stop <CODE>   [--live]");
  }
}

// Stripe's refusal (a code that exists, a bad date) in its own words, never a stack.
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
