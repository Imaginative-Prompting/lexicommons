-- Bug reports (src/bug-reports.ts): what someone wrote about something that went wrong, from Settings → Report a bug, or from the
-- sign-in pages' Report a bug when they can't get in, with what came along, shown to them before it went: the screen they were on, the
-- app's version, their browser and kind of device, and the languages. Admins read them over MCP (bug_reports). An account's are in its
-- export and go with it; one sent signed out names no one (no account, no IP). Each goes 90 days after it was sent, its screenshot too.
CREATE TABLE bug_reports (
  id TEXT PRIMARY KEY,                 -- random
  user_id TEXT,                        -- the account it came from, or NULL: sent signed out
  text TEXT NOT NULL,                  -- what happened, as they wrote it (BUG_LIMITS.text characters at most)
  screen TEXT NOT NULL,                -- the screen before Settings by its route names ("/app/#study/session"), or the sign-in page's path
  version TEXT NOT NULL,               -- the app's version on that page
  browser TEXT NOT NULL,               -- "Safari 26 · iOS", from the request (error-clean.js coarseBrowser)
  device TEXT NOT NULL CHECK (device IN ('phone', 'tablet', 'computer', '')),
  installed INTEGER NOT NULL DEFAULT 0, -- 1: the app from the Home Screen (installed), 0: a browser's tab
  learning TEXT NOT NULL,              -- the language being learned ("nl"), as the device had it, or ''
  speaks TEXT NOT NULL,                -- the one it's learned from ("en"), or ''
  screenshot_key TEXT,                 -- its screenshot in UPLOADS (bug-reports/<id>), or NULL
  screenshot_type TEXT,
  screenshot_size INTEGER,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  closed_note TEXT,                    -- an admin's, closing it (who closed it is in admin_log)
  closed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX bug_reports_user ON bug_reports (user_id, created_at);
CREATE INDEX bug_reports_state ON bug_reports (state, created_at);
CREATE INDEX bug_reports_created ON bug_reports (created_at);
