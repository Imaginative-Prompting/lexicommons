-- Requests in Explore: someone asks for a pack (a language, a level, a topic, a few lines) or for a book woven into a
-- language, and others answer: a pack with a shared pack of theirs, a book by its layer going on the shelf. A book
-- not on the shelf yet waits for an admin first (pending), since only a book public domain in the US and the EU, or
-- openly licensed, can go there. Requests are liked ("me too", one per account) and reported like corrections. Likes
-- and reports took items and corrections until now: both tables are rebuilt to take requests too, every row kept.
--
-- Rebuilding reports: counter_notices points at it with ON DELETE CASCADE, and dropping a table deletes its rows
-- first, which would take every counter-notice with it (deferring foreign keys defers their checks, not their
-- actions). So counter_notices is set aside in a plain copy, rebuilt after reports, and filled again, row for row, as
-- 0008 did.

PRAGMA defer_foreign_keys = true;

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('pack', 'book')),     -- texts join with piece 5, when a shared text can answer one
  language TEXT NOT NULL,         -- the language wanted: a pack's, or the layer a book is woven with
  from_lang TEXT NOT NULL DEFAULT 'en',
  level TEXT,                     -- A1…C2, or NULL for any
  topic TEXT,                     -- one of Explore's topics, or NULL
  book_id TEXT,                   -- a book request: the shelf's book (the catalog's id), once it's on the shelf
  book TEXT,                      -- JSON { title, author, source }: a book not on the shelf, as the person named it
  title TEXT NOT NULL,
  details TEXT,
  author_id TEXT REFERENCES users(id) ON DELETE CASCADE,    -- an account going takes its requests (board.ts)
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('pending', 'open', 'done', 'closed', 'declined')),
  state_note TEXT,                -- why it was declined, or closed by an admin
  decided_by TEXT,
  decided_at INTEGER,
  shown TEXT NOT NULL DEFAULT 'visible' CHECK (shown IN ('visible', 'hidden', 'removed')),  -- moderation, apart from its state
  shown_reason TEXT,
  shown_at INTEGER,
  likes INTEGER NOT NULL DEFAULT 0,
  answers INTEGER NOT NULL DEFAULT 0,
  seen_at INTEGER,                -- when its author last opened it: answers after that are new to them
  approved_at INTEGER,            -- when it could go on the board: at once, or when an admin opened it (NULL: waiting)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX requests_board ON requests(language, state, shown, likes);
CREATE INDEX requests_author ON requests(author_id, created_at);
CREATE INDEX requests_pending ON requests(state, created_at) WHERE state = 'pending';
-- One open or waiting request per shelf book and language: posting looks first, and this holds when two arrive at
-- once, or when one is named or opened again (board.ts answers each in words).
CREATE UNIQUE INDEX requests_book_once ON requests(book_id, language) WHERE kind = 'book' AND book_id IS NOT NULL AND state IN ('open', 'pending');

-- A request's answers: a pack shared in Explore, linked by whoever made it (or by an admin, any live pack).
CREATE TABLE request_answers (
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  by_id TEXT REFERENCES users(id) ON DELETE SET NULL,       -- its answers stay when an account goes, as its packs do
  created_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, item_id)
);
CREATE INDEX request_answers_by ON request_answers(by_id, created_at);
CREATE INDEX request_answers_item ON request_answers(item_id);

-- likes: items, corrections, and now requests.
CREATE TABLE likes_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('item', 'correction', 'request')),
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_kind, target_id)
);
INSERT INTO likes_new (user_id, target_kind, target_id, created_at) SELECT user_id, target_kind, target_id, created_at FROM likes;
DROP TABLE likes;
ALTER TABLE likes_new RENAME TO likes;
CREATE INDEX likes_target ON likes(target_kind, target_id);

-- reports: items, corrections, and now requests. counter_notices aside first (see the top).
CREATE TABLE counter_notices_kept AS SELECT * FROM counter_notices;
DROP TABLE counter_notices;

CREATE TABLE reports_new (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('item', 'correction', 'request')),
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

-- An owner's answer to a report that hid their item (as 0008 made it), filled again.
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
