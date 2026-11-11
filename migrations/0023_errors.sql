-- Error reports (src/errors.ts): what broke in the app (sent by lx/error-report.js) and on the Worker (app.onError, MCP tools, the
-- cron), kept here rather than with anyone else. One row per kind of error, counted, cleaned before it's kept (lx/error-clean.js):
-- no account, no IP, nothing typed, no page's address. A group goes 30 days after it was last seen.
CREATE TABLE error_groups (
  fingerprint TEXT PRIMARY KEY,    -- the first 16 hex of sha256(groupKey); 'overflow:<source>' counts the kinds past the cap
  source TEXT NOT NULL CHECK (source IN ('client', 'server', 'mcp', 'cron')),
  kind TEXT NOT NULL,              -- error, rejection (client); exception (server); overflow
  name TEXT NOT NULL,              -- TypeError, …
  message TEXT NOT NULL,           -- cleaned
  stack TEXT NOT NULL,             -- our own frames only, "fn (path:line:col)" per line, as last seen
  place TEXT NOT NULL,             -- the app's screen by route names, or the Worker's route pattern ("GET /api/packs/:id")
  version TEXT NOT NULL,           -- the app's shell version (client) as last seen
  browser TEXT NOT NULL,           -- "Safari 26 · iOS", as last seen (client)
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX error_groups_seen ON error_groups (last_seen);

-- How many errors came in each hour, by source, for the spike alert (admin-alerts.ts) and the trend. Kept 14 days.
CREATE TABLE error_hours (
  hour INTEGER NOT NULL,           -- the hour's start, ms
  source TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (hour, source)
);
