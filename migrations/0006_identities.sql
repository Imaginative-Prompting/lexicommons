-- Sign in with Google and GitHub (src/signin.ts). An identity is a provider's stable id for a person: Google's `sub`,
-- GitHub's numeric user id. Never an email or a username, which can change or pass to someone else. An account can
-- have any number of identities beside its passkeys; signing in with any one of them signs in to the account.
-- No email is stored. Nothing is ever linked by email.

CREATE TABLE identities (
  provider TEXT NOT NULL,         -- 'google' | 'github'
  subject TEXT NOT NULL,          -- the provider's id for this person
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,                     -- shown in Settings so two can be told apart: GitHub's @username, Google's account name
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user ON identities(user_id);
