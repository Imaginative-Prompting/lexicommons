-- The account's own copy of a learner's progress (src/account-sync.ts): the sync files its devices write, as they'd write them to a
-- storage of the learner's own (public/js/sync.js), kept with the account so signing in on any device brings progress back. One row a
-- file; its bytes are in R2 (UPLOADS) at a key made of the account, the name and this row's version. Progress only: answers, the done
-- log and streak, the place on the path, the word bank, reading places, highlights, settings. Never packs' recordings or books.
CREATE TABLE account_sync (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,            -- the file's name as sync names it: lexicommons-<kind>[.<shard>].<account tag>.<device>.json
  size INTEGER NOT NULL,         -- its bytes
  version TEXT NOT NULL,         -- a fresh one every write: what a device says it last saw, to write over it
  updated_at INTEGER NOT NULL,   -- ms
  PRIMARY KEY (user_id, name)
);
