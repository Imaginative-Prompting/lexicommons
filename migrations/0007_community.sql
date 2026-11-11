-- The community section (Explore): what people share, and the library's default packs indexed beside it, with follows,
-- likes, the sharing terms, reports and moderation. A shared item's files live in the open library's bucket (packs at
-- packs/<id>/<version>/pack.json, as the library's own); these tables are the index, the counts and the moderation.

-- Everything in Explore. id is the item's public id (for a pack, the id its file carries, unique across everyone).
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('pack')),          -- texts, layers, themes and games join later
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,-- NULL: the library's (curated), or a member who left
  curated INTEGER NOT NULL DEFAULT 0,                   -- 1: one of the library's default packs (catalogue.packs)
  source_id TEXT,                                       -- the owner's own pack it was shared from (their device's id)
  title TEXT NOT NULL,
  about TEXT,
  language TEXT NOT NULL,
  from_lang TEXT,
  level TEXT CHECK (level IS NULL OR level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  topics TEXT NOT NULL DEFAULT '[]',                    -- JSON: ids from explore_topics
  badges TEXT NOT NULL DEFAULT '{}',                    -- JSON: { sentences, words, patterns, literal, audio }
  licence TEXT NOT NULL,
  copied_from TEXT,                                     -- JSON { id, version }: the item it was copied from
  head_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,                           -- of its content without its id and names: the duplicate check
  state TEXT NOT NULL DEFAULT 'live' CHECK (state IN ('live', 'hidden', 'withdrawn', 'removed')),
  state_reason TEXT,
  state_at INTEGER,
  likes INTEGER NOT NULL DEFAULT 0,
  follows INTEGER NOT NULL DEFAULT 0,
  popular INTEGER NOT NULL DEFAULT 0,                   -- likes and follows from accounts at least 7 days old
  search TEXT NOT NULL,                                 -- lowercase, accents gone: title, about, topics, who shared it
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX items_popular ON items(kind, language, state, popular DESC);
CREATE INDEX items_new ON items(kind, language, state, created_at DESC);
CREATE INDEX items_owner ON items(owner_id);
CREATE INDEX items_content ON items(content_hash);

-- Every version of an item, kept: a follower's device has one of them.
CREATE TABLE item_versions (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  seq INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  summary TEXT NOT NULL,          -- JSON: its counts, and what changed from the version before (added, changed, removed)
  note TEXT,
  licence TEXT NOT NULL,
  terms_version INTEGER,          -- the sharing terms it went out under (NULL for the library's)
  made_by TEXT NOT NULL,          -- device | oauth:<client> | pat:<token> | rest:<token> | library
  created_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, version)
);
CREATE UNIQUE INDEX item_versions_seq ON item_versions(item_id, seq);

-- What an account follows: its devices load each one's current version (study/packs.js syncLibraryPacks).
CREATE TABLE follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  corrections TEXT NOT NULL DEFAULT 'published' CHECK (corrections IN ('published', 'community')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX follows_item ON follows(item_id);

-- One like per account per thing (items now; corrections and requests later).
CREATE TABLE likes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('item')),
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_kind, target_id)
);
CREATE INDEX likes_target ON likes(target_kind, target_id);

-- Explore's curated sections ("Start here") and the shared topic list discovery uses: data an admin changes over MCP.
CREATE TABLE explore_sections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  rank INTEGER NOT NULL,
  items TEXT NOT NULL,            -- JSON: item ids, in order
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE explore_topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rank INTEGER NOT NULL
);
INSERT INTO explore_topics (id, name, rank) VALUES
  ('everyday', 'Everyday life', 1), ('travel', 'Travel', 2), ('food', 'Food and drink', 3), ('family', 'Family and friends', 4),
  ('home', 'Home', 5), ('shopping', 'Shopping', 6), ('work', 'Work', 7), ('school', 'School', 8), ('health', 'Health', 9),
  ('time', 'Time and dates', 10), ('numbers', 'Numbers', 11), ('weather', 'Weather and nature', 12), ('feelings', 'Feelings', 13),
  ('culture', 'Culture', 14), ('grammar', 'Grammar', 15);

-- The sharing terms an account accepted in the app (CC BY-SA 4.0, and that it shares only what it may): needed
-- before its first share. An AI can't accept them for anyone.
CREATE TABLE sharing_terms (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  terms_version INTEGER NOT NULL,
  accepted_at INTEGER NOT NULL
);

-- Reports on what's shared. A complete copyright notice hides an item at once; the worst reasons at one report; the
-- rest at three from established accounts, or a moderator's call (docs: the community plan).
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('item')),
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
CREATE INDEX reports_open ON reports(state, created_at);
CREATE INDEX reports_target ON reports(target_kind, target_id);
CREATE UNIQUE INDEX reports_once ON reports(reporter_id, target_kind, target_id) WHERE state = 'open';

-- An owner's answer to a report that hid their item.
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
CREATE INDEX counter_notices_open ON counter_notices(state, created_at);

-- Bans: no sharing (share), or no part in the community at all (community), for a while or for good.
CREATE TABLE user_bans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('share', 'community')),
  reason TEXT NOT NULL,
  by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  until INTEGER,                  -- NULL: for good
  lifted_at INTEGER
);
CREATE INDEX user_bans_user ON user_bans(user_id);

-- The moderation policy the monitoring agent follows, as text an admin changes over MCP. The newest row is in force.
CREATE TABLE moderation_policy (
  rev INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
