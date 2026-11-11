-- A pack of yours's recordings, as the latest copy a device sent of it had them (src/packs.ts putCopy): only the
-- manifest (which voice reads what, each clip by its name), up to the relay change it goes up to (through), so set_pack_audio
-- merges into it and get_pack can say what's there. The clips themselves stay on the server only while a change
-- carrying them is on its way to your devices (uploads marked pack-audio-in:<change>); their home is your devices and
-- your own storage.
CREATE TABLE pack_audio (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  manifest TEXT NOT NULL,
  through INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, pack_id)
);
