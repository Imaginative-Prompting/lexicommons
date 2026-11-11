-- Accounts (passkeys + sessions), personal access tokens, and the two test tables the piping proof uses
-- (notes written by an AI over MCP, files uploaded through signed URLs). No language-learning data yet.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,            -- credential ID, base64url
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,       -- COSE public key, base64url
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,                -- JSON array
  device_type TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX passkeys_user ON passkeys(user_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,    -- sha256 of the cookie value; the value itself is never stored
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,            -- the value of the short-lived lc_chal cookie
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL,             -- 'register' | 'login' | 'add-passkey'
  user_id TEXT,                   -- the pending user for 'register', the signed-in user for 'add-passkey'
  user_name TEXT,
  expires_at INTEGER NOT NULL
);

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,           -- the first characters, shown so the user can tell tokens apart
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX api_tokens_user ON api_tokens(user_id);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source TEXT NOT NULL,           -- which door it came through: oauth:<client> | pat:<token name> | rest
  created_at INTEGER NOT NULL
);
CREATE INDEX notes_user ON notes(user_id, created_at);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  status TEXT NOT NULL,           -- 'pending' | 'stored'
  size INTEGER,
  sha256 TEXT,
  r2_key TEXT,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,    -- when the signed URL stops working
  stored_at INTEGER
);
CREATE INDEX uploads_user ON uploads(user_id, created_at);
