-- Admin, and the open library managed through MCP. A role is a row here, set only with SQL on the database itself:
-- nothing in the app, the REST API or the MCP can grant one. Every admin and moderator action is logged. Files on
-- their way into the library are staged first (signed uploads, checked by their hash), and every change to the
-- library's catalog is kept as a revision, so any one can be restored.

-- Roles: 'admin' (the library, curation, moderation, bans) and 'moderator' (the report queue). src/roles.ts reads
-- them on every call that needs one.
CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
  granted_at INTEGER NOT NULL,
  granted_by TEXT NOT NULL,       -- who set it ('d1' when set by hand on the database)
  note TEXT,
  PRIMARY KEY (user_id, role)
);

-- What every admin and moderator did: who, through which connection, what, to what, and the state before and after
-- (JSON, so an action can be undone by hand if its own tool can't). Kept when the account is deleted.
CREATE TABLE admin_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  via TEXT NOT NULL,              -- oauth:<client> | pat:<token> | rest:<token>
  action TEXT NOT NULL,           -- library.publish, library.unpublish, library.restore, library.shelf, …
  target TEXT,
  before TEXT,
  after TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX admin_log_time ON admin_log(created_at);

-- A personal token only reaches the admin tools when it was made with admin access (and its owner is an admin), so a
-- token made for some other script can't publish to the library if it leaks.
ALTER TABLE api_tokens ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;

-- Files on their way into the library: declared first (name, type, size, sha256), then sent through a signed link,
-- kept in the private uploads bucket under staging/<user>/<id> until they're published or expire (a day).
CREATE TABLE staged_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,          -- as declared; the upload must match it exactly
  sha256 TEXT NOT NULL,           -- as declared; the upload must match it exactly
  status TEXT NOT NULL,           -- 'pending' | 'stored'
  r2_key TEXT,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  link_expires_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL     -- when the staged file itself is dropped
);
CREATE INDEX staged_files_user ON staged_files(user_id, sha256);

-- The files the library holds, by the sha256 of their bytes, so a file it already has is never staged or sent again.
CREATE TABLE library_files (
  sha256 TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- The catalog's revisions, newest last. A write through the admin tools is a compare-and-set on the stored
-- catalog's etag; a catalog changed by another writer (the books or packs command line) is recorded as a revision
-- of its own before the next change, so the history never skips one. The last 100 are kept.
CREATE TABLE library_revisions (
  rev INTEGER PRIMARY KEY,
  etag TEXT NOT NULL,
  catalogue TEXT NOT NULL,
  actor_id TEXT,                  -- NULL for a change made outside the admin tools
  action TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
