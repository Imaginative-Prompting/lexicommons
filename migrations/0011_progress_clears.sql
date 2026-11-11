-- Clears of study progress everywhere (public/js/study/progress.js; Settings → Your data, with your own storage
-- connected). The account confirms each one, so a file in your storage can't clear anything. When, never what: no
-- answers are kept here.
CREATE TABLE progress_clears (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,              -- 16 hex, made by the device
  before_at INTEGER NOT NULL,    -- it covers answers recorded before this (ms)
  at INTEGER NOT NULL,           -- when it was made, or undone (ms)
  undone INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
