-- Books in Explore (src/community-books.ts): a book someone made, or their AI wove, shared with its weave layers, the way
-- packs are. Its own tables, not items: items.kind is CHECK (kind IN ('pack')), and four tables reference items ON DELETE
-- CASCADE, so rebuilding items would fire those cascades (SQLite's DROP TABLE deletes every row first).
--   shared_books          one row per shared book: what Explore lists, its state (moderation reads the same columns as items')
--   shared_book_versions  each version: the book's file and its layers' files, by key, and the bytes it newly stored
--   book_follows          who added it to their reading library (their devices load its current version)
-- Reports, likes and counter-notices take books too: likes and reports are rebuilt with target_kind 'book', every row kept,
-- and counter_notices (which dropping reports would cascade into) is set aside and filled again with a target_kind of its
-- own, as 0014 and 0016 did.

PRAGMA defer_foreign_keys = true;

CREATE TABLE shared_books (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,   -- NULL: a member who left (it stays, as its license allows)
  curated INTEGER NOT NULL DEFAULT 0 CHECK (curated = 0),  -- never the library's own: there so moderation's SQL reads alike
  source_id TEXT NOT NULL,                                  -- the book's own id (book.id)
  title TEXT NOT NULL,
  authors TEXT NOT NULL DEFAULT '[]',                       -- JSON, as the book lists them
  about TEXT,
  language TEXT NOT NULL,                                   -- the book's language
  layers TEXT NOT NULL DEFAULT '[]',                        -- JSON: the languages its current version's layers are in
  level TEXT CHECK (level IS NULL OR level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  topics TEXT NOT NULL DEFAULT '[]',                        -- JSON: ids from explore_topics
  rights TEXT NOT NULL,                                     -- JSON: the book's rights, as it states them
  source TEXT NOT NULL,                                     -- JSON: the book's source, as it states it
  source_url TEXT NOT NULL,                                 -- where the text came from, shown on its page
  licence TEXT NOT NULL,                                    -- its layers' license (CC BY-SA 4.0); the text's is in rights
  head_seq INTEGER NOT NULL,
  head_version TEXT NOT NULL,                               -- the book's own version (book-format.js bookVersion) at head
  content_hash TEXT NOT NULL,                               -- the same: the duplicate check
  state TEXT NOT NULL DEFAULT 'live' CHECK (state IN ('live', 'pending', 'declined', 'hidden', 'withdrawn', 'removed')),
  state_reason TEXT,
  state_at INTEGER,
  likes INTEGER NOT NULL DEFAULT 0,
  follows INTEGER NOT NULL DEFAULT 0,
  popular INTEGER NOT NULL DEFAULT 0,                       -- likes and follows from accounts at least 7 days old
  search TEXT NOT NULL,                                     -- lowercase, accents gone: title, authors, about, topics, who shared it
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX shared_books_popular ON shared_books(language, state, popular DESC);
CREATE INDEX shared_books_new ON shared_books(language, state, created_at DESC);
CREATE INDEX shared_books_owner ON shared_books(owner_id, created_at);
CREATE INDEX shared_books_content ON shared_books(content_hash);
-- One shared copy of a book per account while it's in Explore, waiting for an admin, or hidden (a new version or layer goes on it); once
-- it's withdrawn, taken down or declined, it can be shared again as a new book.
CREATE UNIQUE INDEX shared_books_once ON shared_books(owner_id, source_id) WHERE state IN ('live', 'pending', 'hidden');

CREATE TABLE shared_book_versions (
  book_id TEXT NOT NULL REFERENCES shared_books(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  book_version TEXT NOT NULL,     -- the book's own version
  book_key TEXT NOT NULL,         -- shared/books/<id>/<book version>/book.json
  layers TEXT NOT NULL,           -- JSON { <to>: { kind, key, sha256, bytes, sentences } }
  bytes INTEGER NOT NULL,         -- what this version newly stored (a file already there from a version before counts once)
  summary TEXT NOT NULL,          -- JSON { words, sentences, chapters, sample, changes }
  note TEXT,
  licence TEXT NOT NULL,
  terms_version INTEGER NOT NULL, -- the sharing terms it went out under
  made_by TEXT NOT NULL,          -- device | oauth:<client> | pat:<token> | rest:<token>
  write_token TEXT,               -- the write that made it: what else that write does happens only with it
  created_at INTEGER NOT NULL,
  PRIMARY KEY (book_id, seq)
);

CREATE TABLE book_follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES shared_books(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_id)
);
CREATE INDEX book_follows_book ON book_follows(book_id);

-- likes: items, corrections, requests, grammar suggestions, and now books.
CREATE TABLE likes_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('item', 'correction', 'request', 'grammar', 'book')),
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_kind, target_id)
);
INSERT INTO likes_new (user_id, target_kind, target_id, created_at) SELECT user_id, target_kind, target_id, created_at FROM likes;
DROP TABLE likes;
ALTER TABLE likes_new RENAME TO likes;
CREATE INDEX likes_target ON likes(target_kind, target_id);

-- reports: and now books. counter_notices aside first (see the top).
CREATE TABLE counter_notices_kept AS SELECT * FROM counter_notices;
DROP TABLE counter_notices;

CREATE TABLE reports_new (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('item', 'correction', 'request', 'grammar', 'book')),
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

-- An owner's answer to a report that took their pack or book down: item_id is the pack's or the book's id, and
-- target_kind says which (every row from before is a pack's).
CREATE TABLE counter_notices (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL DEFAULT 'item' CHECK (target_kind IN ('item', 'book')),
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
INSERT INTO counter_notices (id, report_id, target_kind, item_id, owner_id, statement, contact, state, handled_by, handled_at, handled_note, created_at)
  SELECT id, report_id, 'item', item_id, owner_id, statement, contact, state, handled_by, handled_at, handled_note, created_at FROM counter_notices_kept;
DROP TABLE counter_notices_kept;
CREATE INDEX counter_notices_open ON counter_notices(state, created_at);
CREATE INDEX counter_notices_target ON counter_notices(target_kind, item_id);
