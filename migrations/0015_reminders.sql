-- Reminders (src/reminders.ts): Web Push subscriptions, one per device; each account's settings and the little the
-- devices report (study days, pauses, due counts, a time zone), and when the cron should look next; notes waiting to go
-- (your AI finished something, community). Turning reminders off on the last device deletes all of it.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER NOT NULL,
  ok_at INTEGER,
  failed_at INTEGER,
  fails INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX push_subscriptions_device ON push_subscriptions (user_id, device);

CREATE TABLE reminders (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings TEXT NOT NULL,
  state TEXT NOT NULL,
  next_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX reminders_next ON reminders (next_at);

CREATE TABLE push_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX push_queue_user ON push_queue (user_id, at);
