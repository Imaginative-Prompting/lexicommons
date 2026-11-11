-- An email on the account, for getting back in when a passkey is lost and for receipts, and nothing else (src/account-email.ts): never a
-- way to sign in by itself, never a link between accounts, never shown to anyone. One per account, and an address on one account only, so
-- getting back in by it can only ever reach one.
CREATE TABLE account_emails (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,      -- as typed, trimmed and in small letters
  verified_at INTEGER NOT NULL,    -- only a confirmed address is kept
  created_at INTEGER NOT NULL
);

-- A 6-digit code sent to an address: to confirm it for an account (purpose "confirm"), or to get back into the account it's on ("recover").
-- Only its hash is kept, it lasts 15 minutes, takes 5 tries, and is gone once used. A code asked for by an address on no account keeps a
-- row too (user_id NULL), so asking never tells anyone whether an address is known.
CREATE TABLE email_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT,                    -- the account it's for: the one confirming, or the one the address is on; NULL when on none
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('confirm', 'recover')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX email_codes_email ON email_codes (email, created_at);
CREATE INDEX email_codes_user ON email_codes (user_id, created_at);
