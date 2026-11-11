-- One answer per refresh token (src/refresh-once.ts): a grant's lock while the library refreshes it, and a refresh's
-- answer, sealed with a key only its refresh token gives, kept for ten minutes so a repeat gets the same one. Its own
-- table, so nothing else that deletes short-lived rows can touch a lock.
CREATE TABLE refresh_once (
  id TEXT PRIMARY KEY,            -- a hash: of the grant (a lock) or of the presented refresh token (an answer)
  kind TEXT NOT NULL CHECK (kind IN ('lock', 'answer')),
  user_id TEXT NOT NULL,          -- the grant's account, so deleting the account takes its rows
  body TEXT NOT NULL,             -- a lock: who holds it; an answer: who asked (a hash) and the answer sealed
  expires_at INTEGER NOT NULL     -- ms; a lock past it may be taken over, an answer past it is never served
);
CREATE INDEX refresh_once_user ON refresh_once(user_id);
CREATE INDEX refresh_once_expires ON refresh_once(expires_at);
