-- Feature flags (src/flags.ts): a launch switch's value as an admin set it in the app, over wrangler.jsonc's default. No account on a row:
-- who changed it, when, and from what, is in the admin log (action flag.set / flag.reset).
CREATE TABLE feature_flags (
  name TEXT PRIMARY KEY,
  -- JSON: true or false for a switch, a choice's string ("admins", "everyone")
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
