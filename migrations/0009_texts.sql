-- Texts your AI adds to your reading library (src/texts.ts). A text you add yourself stays on the device you added it
-- on; one your AI adds reaches every device of yours through this relay, as packs do (0004): each change waits here
-- for every device, which takes it, makes the book (checking it again) and reports back. A change's files (the text
-- as a lexicommons-book or an EPUB, its cover) are uploads (0001), kept until every device has them or the change
-- expires, so deleting an account takes their bytes with the rest of its uploads. Depends on nothing after 0007.

-- The changes, in the order they're applied (seq).
CREATE TABLE text_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,        -- txc_<random>: the same on every device, so taking one twice changes nothing
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_id TEXT NOT NULL,          -- the text's id on every device (its lexicommons-book id)
  kind TEXT NOT NULL,             -- add · remove · undo
  body TEXT,                      -- JSON, as src/texts.ts TextBody; dropped (with its files) once every device has it, or when it expires
  said TEXT NOT NULL,             -- what it does, in words ("added De rode jas")
  source TEXT NOT NULL,           -- who made it: oauth:<client>, pat:<token>, or device:<label> (in the app)
  undoes TEXT,                    -- an undo: the change it undoes
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX text_changes_user ON text_changes(user_id, seq);
CREATE INDEX text_changes_text ON text_changes(user_id, text_id, seq);

-- Each change and each device it goes to: waiting until that device reports.
CREATE TABLE text_deliveries (
  change_seq INTEGER NOT NULL REFERENCES text_changes(seq) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  state TEXT NOT NULL,            -- waiting · applied · failed (it couldn't make the book: why, in result) · missing · expired
  result TEXT,                    -- what the device said (JSON: { error?, words? })
  settled_at INTEGER,
  PRIMARY KEY (change_seq, device_id)
);
CREATE INDEX text_deliveries_waiting ON text_deliveries(user_id, device_id, state);

-- What texts each device has (JSON: each one's id, title, language, words, by, added), for list_texts.
ALTER TABLE pack_devices ADD COLUMN texts TEXT NOT NULL DEFAULT '[]';
