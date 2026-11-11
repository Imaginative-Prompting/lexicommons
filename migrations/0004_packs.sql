-- Your AI's packs (src/packs.ts). A change your AI makes to your packs is checked on the server, then waits here for
-- every device of yours: each one takes it, applies it to its own copy (checking it again) and reports back. A change's
-- content goes once every device has it, or after 7 days. Deleting a pack, or Undo, in the app goes the same way to
-- your other devices. The account also keeps the latest copy of each pack of yours, as a device last sent it, for your
-- AI to read and for the server's check; it's never served back to a device.

-- The devices changes go to: each makes its own random id, and says what's on it.
CREATE TABLE pack_devices (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  label TEXT NOT NULL,            -- "Mac, browser"
  packs TEXT NOT NULL,            -- what's on it (JSON: each pack's id, name, language, kind, on, items), for list_packs
  added_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id)
);

-- The changes, in the order they're applied (seq).
CREATE TABLE pack_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,        -- chg_<random>: the same on every device, so applying one twice changes nothing
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  kind TEXT NOT NULL,             -- create · add · update · remove · edit · undo · delete
  body TEXT,                      -- the change as checked (JSON); dropped once every device has it, or when it expires
  said TEXT NOT NULL,             -- what it does, in words ("added 12 sentences to Travel")
  source TEXT NOT NULL,           -- who made it: oauth:<client>, pat:<token>, or device:<label> (in the app)
  undoes TEXT,                    -- an undo: the change it undoes
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX pack_changes_user ON pack_changes(user_id, seq);

-- Each change and each device it goes to: waiting until that device reports.
CREATE TABLE pack_deliveries (
  change_seq INTEGER NOT NULL REFERENCES pack_changes(seq) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  state TEXT NOT NULL,            -- waiting · applied · refused · missing (that device doesn't have the pack) · expired
  result TEXT,                    -- what the device said (JSON: errors and warnings)
  settled_at INTEGER,
  PRIMARY KEY (change_seq, device_id)
);
CREATE INDEX pack_deliveries_waiting ON pack_deliveries(user_id, device_id, state);

-- The latest copy of each pack of yours, as a device last sent it. A deleted pack keeps its row with no pack, at the
-- change that deleted it, so an older copy arriving late can't bring it back.
CREATE TABLE pack_copies (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  language TEXT NOT NULL,
  pack TEXT,                      -- the checked pack (JSON); NULL once it's deleted
  through INTEGER NOT NULL,       -- the last change (seq) it includes
  device_id TEXT NOT NULL,        -- the device that sent it
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, pack_id)
);
