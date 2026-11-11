-- The plan's records, put in order (src/billing.ts, after the 6 Nov review):
-- synced_at: when Stripe was read for a subscription's row; a write from an older read never replaces a newer one.
-- trial_start: when a trial began (Stripe's), so a trial's allowance is counted across a month's end (ai-hosted.ts).
ALTER TABLE billing_subscriptions ADD COLUMN synced_at INTEGER;
ALTER TABLE billing_subscriptions ADD COLUMN trial_start INTEGER;
-- Which subscription claimed a card's trial, and an account's: a repeat of that same subscription's event is never taken for a second trial.
ALTER TABLE billing_trials ADD COLUMN subscription TEXT;
ALTER TABLE billing_customers ADD COLUMN trial_subscription TEXT;
-- When the account last started a Checkout: deleting it asks Stripe about Checkouts still open only within a day of one (a Checkout
-- Session lasts 24 hours at most), so an account that bought nothing lately is deleted without Stripe.
ALTER TABLE billing_customers ADD COLUMN checkout_at INTEGER;

-- Each dispute as Stripe says it is now, so the AI is held while any of a customer's is open, and only then. No account in it: a
-- Stripe customer id, which leaves billing_customers (and so any account) when the account is deleted.
CREATE TABLE billing_disputes (
  id TEXT PRIMARY KEY,
  customer TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX billing_disputes_customer ON billing_disputes (customer, status);
