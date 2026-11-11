-- Suggestions to a language's shared grammar (public/js/lang/grammar.js, src/grammar-suggestions.ts): anyone signed in
-- suggests a new pattern, a fix to one (its name, its explanation, what it builds on) or retiring one, in Explore or
-- through their AI; an admin accepts suggestions into the grammar's next revision, published to the open library, or
-- declines them. They're liked and reported like corrections and requests (moderation.ts, on their own `shown`), so
-- likes and reports are rebuilt to take them too, every row kept, counter_notices set aside and filled again as 0014
-- did (dropping reports would cascade into it).

PRAGMA defer_foreign_keys = true;

CREATE TABLE grammar_suggestions (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('new', 'fix', 'retire')),
  pattern TEXT NOT NULL,          -- the pattern it adds, fixes or retires (its id)
  change TEXT NOT NULL,           -- JSON { name?, about?, after? }: what it proposes (a new one: all three)
  note TEXT,                      -- why, in its suggester's words
  knows TEXT NOT NULL CHECK (knows IN ('native', 'fluent', 'learning')),   -- how its suggester knows the language
  via TEXT NOT NULL CHECK (via IN ('app', 'ai')),
  source TEXT,                    -- the connection it came through (an AI app's name), for the admin log
  author_id TEXT REFERENCES users(id) ON DELETE CASCADE,    -- an account going takes its suggestions
  against INTEGER NOT NULL,       -- the grammar's revision it was made against
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'accepting', 'accepted', 'declined', 'withdrawn', 'superseded')),
  claim TEXT,                     -- an accept in flight (state accepting): its token, named in the publish's note
  claimed_at INTEGER,
  revision INTEGER,               -- accepting: the revision it's going into; accepted: the one it went into
  decided_by TEXT,
  decided_at INTEGER,
  decision_note TEXT,             -- why it was declined, or what superseded it
  shown TEXT NOT NULL DEFAULT 'visible' CHECK (shown IN ('visible', 'hidden', 'removed')),  -- moderation, apart from its state
  shown_reason TEXT,
  shown_at INTEGER,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX grammar_suggestions_open ON grammar_suggestions(language, state, pattern);
CREATE INDEX grammar_suggestions_author ON grammar_suggestions(author_id, created_at);
-- One open suggestion of a new pattern per id in a language: the second is told to like the first.
CREATE UNIQUE INDEX grammar_suggestions_new_once ON grammar_suggestions(language, pattern) WHERE kind = 'new' AND state IN ('open', 'accepting');

-- likes: items, corrections, requests, and now grammar suggestions.
CREATE TABLE likes_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('item', 'correction', 'request', 'grammar')),
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_kind, target_id)
);
INSERT INTO likes_new (user_id, target_kind, target_id, created_at) SELECT user_id, target_kind, target_id, created_at FROM likes;
DROP TABLE likes;
ALTER TABLE likes_new RENAME TO likes;
CREATE INDEX likes_target ON likes(target_kind, target_id);

-- reports: items, corrections, requests, and now grammar suggestions. counter_notices aside first (see the top).
CREATE TABLE counter_notices_kept AS SELECT * FROM counter_notices;
DROP TABLE counter_notices;

CREATE TABLE reports_new (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('item', 'correction', 'request', 'grammar')),
  target_id TEXT NOT NULL,
  version TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('copyright', 'minors', 'illegal', 'abuse', 'spam', 'personal', 'other')),
  details TEXT,
  notice TEXT,                    -- JSON, for a copyright notice: { name, contact, work, statement }
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'upheld', 'dismissed', 'escalated')),
  action TEXT,                    -- what was done: hidden, restored, nothing
  handled_by TEXT,
  handled_at INTEGER,
  handled_note TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO reports_new (id, target_kind, target_id, version, reason, details, notice, reporter_id, state, action, handled_by, handled_at, handled_note, created_at)
  SELECT id, target_kind, target_id, version, reason, details, notice, reporter_id, state, action, handled_by, handled_at, handled_note, created_at FROM reports;
DROP TABLE reports;
ALTER TABLE reports_new RENAME TO reports;
CREATE INDEX reports_open ON reports(state, created_at);
CREATE INDEX reports_target ON reports(target_kind, target_id);
CREATE UNIQUE INDEX reports_once ON reports(reporter_id, target_kind, target_id) WHERE state = 'open';

-- An owner's answer to a report that hid their item (as 0014 made it), filled again.
CREATE TABLE counter_notices (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  statement TEXT NOT NULL,
  contact TEXT NOT NULL,          -- JSON { name, email }
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'upheld', 'dismissed', 'escalated')),
  handled_by TEXT,
  handled_at INTEGER,
  handled_note TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO counter_notices (id, report_id, item_id, owner_id, statement, contact, state, handled_by, handled_at, handled_note, created_at)
  SELECT id, report_id, item_id, owner_id, statement, contact, state, handled_by, handled_at, handled_note, created_at FROM counter_notices_kept;
DROP TABLE counter_notices_kept;
CREATE INDEX counter_notices_open ON counter_notices(state, created_at);
