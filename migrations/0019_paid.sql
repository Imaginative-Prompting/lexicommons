-- The paid plan (src/billing.ts): who has it, as Stripe says, and the in-app AI's monthly
-- allowance and its use (src/inapp-ai.ts). Nothing here is filled until the site offers the plan (PLAN_ENABLED and Stripe's keys).

-- An account's Stripe customer, made at its first Checkout. trial_used: this account has had its free trial.
CREATE TABLE billing_customers (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer TEXT NOT NULL UNIQUE,
  trial_used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- A subscription as Stripe last said it was, read from Stripe on every event about it (never from the event alone).
-- held: a charge on it is disputed (the AI stops until it's settled). ended_reason: why it ended here (card_had_trial, refunded, dispute_lost).
CREATE TABLE billing_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer TEXT NOT NULL,
  status TEXT NOT NULL,
  interval TEXT,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  trial_end INTEGER,
  held INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER,
  ended_reason TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX billing_subscriptions_user ON billing_subscriptions(user_id);
CREATE INDEX billing_subscriptions_customer ON billing_subscriptions(customer);

-- Stripe's events, each handled once.
CREATE TABLE billing_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  done_at INTEGER
);

-- Cards that have had a free trial: Stripe's fingerprint of the card (never the card), with no account, so one card gets one
-- trial even after an account is deleted.
CREATE TABLE billing_trials (
  fingerprint TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);

-- The in-app AI on Lexicommons' key: a month's allowance and what's spent and reserved, in millionths of a dollar of the
-- provider's reported cost; busy_until holds one request at a time.
CREATE TABLE ai_meter (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  allowance INTEGER NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  busy_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

-- Each request's use, with no content: what it was for, the model, the tokens and the cost.
CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  cached_tokens INTEGER,
  completion_tokens INTEGER,
  cost_micro INTEGER NOT NULL,
  generation_id TEXT
);
CREATE INDEX ai_usage_user ON ai_usage(user_id, at);
