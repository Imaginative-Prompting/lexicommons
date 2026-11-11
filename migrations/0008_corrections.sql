-- Corrections to what's shared in Explore: a fix (a new value for one piece of one version, checked like a version)
-- or a flag (that piece is wrong, and why). The pack's author, or an admin, accepts them into a new version or declines
-- them. They can be liked (one per account), and reported like a pack. Likes and reports took only items until now:
-- both tables are rebuilt to take corrections too, every row kept.
--
-- Rebuilding reports: counter_notices points at it with ON DELETE CASCADE, and dropping a table deletes its rows
-- first, which would take every counter-notice with it (deferring foreign keys defers their checks, not their
-- actions). So counter_notices is set aside in a plain copy, rebuilt after reports, and filled again, row for row.

PRAGMA defer_foreign_keys = true;

CREATE TABLE corrections (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  version TEXT NOT NULL,          -- the version it was made on
  path TEXT NOT NULL,             -- the piece (study/pack-corrections.js): items/<id>/<field> or words/<lemma>
  kind TEXT NOT NULL CHECK (kind IN ('fix', 'flag')),
  value TEXT,                     -- JSON: a fix's new value (NULL for a flag)
  note TEXT,                      -- why
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- accepting: claimed by an accept that's making its version (corrections.ts), so nothing else takes it meanwhile.
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'accepting', 'accepted', 'declined', 'superseded', 'withdrawn')),
  accepted_in TEXT,               -- the version it went into (while accepting: the accept's claim)
  answered_by TEXT,
  answered_at INTEGER,
  answer_note TEXT,
  shown TEXT NOT NULL DEFAULT 'visible' CHECK (shown IN ('visible', 'hidden', 'removed')),  -- moderation, apart from its state
  likes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX corrections_item ON corrections(item_id, state);
CREATE INDEX corrections_author ON corrections(author_id, created_at);
-- One open correction per account per piece (one being accepted still holds its place).
CREATE UNIQUE INDEX corrections_once ON corrections(author_id, item_id, path) WHERE state IN ('open', 'accepting');
-- Whether a version of one of the library's packs was published (an accept on it settles by its log entry).
CREATE INDEX admin_log_target ON admin_log(action, target);

-- Explore's index of the library's own packs is written by one sync at a time (community.ts syncLibraryIndex): the
-- newest catalog revision's, or one for the same revision taking over a sync that never finished (done). Every write
-- checks the owner's token, so an older or overtaken sync changes nothing. index_token: the write that indexed a row,
-- so the rest of its batch happens only with it.
CREATE TABLE library_index (id INTEGER PRIMARY KEY CHECK (id = 1), rev INTEGER NOT NULL, token TEXT, done INTEGER NOT NULL DEFAULT 1);
INSERT INTO library_index (id, rev, token, done) VALUES (1, 0, NULL, 1);
ALTER TABLE items ADD COLUMN index_token TEXT;
-- Which write of the catalog a revision is: R2's version of the object, new on every upload. Its etag is a hash of
-- its bytes, so a catalog written again byte for byte (the command line restoring an earlier one) has an earlier
-- revision's etag; the etag stays for compare-and-set. Revisions from before this have none (library-admin.ts
-- currentCatalogue gives the newest one its version when it's still the catalog).
ALTER TABLE library_revisions ADD COLUMN r2_version TEXT;
CREATE INDEX library_revisions_version ON library_revisions(r2_version);
-- The write that made a shared version (community.ts updateShared), so the rest of its batch happens only with it.
ALTER TABLE item_versions ADD COLUMN write_token TEXT;

-- likes: items, and now corrections.
CREATE TABLE likes_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('item', 'correction')),
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_kind, target_id)
);
INSERT INTO likes_new (user_id, target_kind, target_id, created_at) SELECT user_id, target_kind, target_id, created_at FROM likes;
DROP TABLE likes;
ALTER TABLE likes_new RENAME TO likes;
CREATE INDEX likes_target ON likes(target_kind, target_id);

-- reports: items, and now corrections. counter_notices aside first (see the top).
CREATE TABLE counter_notices_kept AS SELECT * FROM counter_notices;
DROP TABLE counter_notices;

CREATE TABLE reports_new (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('item', 'correction')),
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

-- An owner's answer to a report that hid their item (as 0007 made it), filled again.
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
