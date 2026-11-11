-- An AI app's connection its person revoked (src/revoked.ts), so a refresh already under way can't bring it back: workers-oauth-provider
-- keeps grants in KV, where a refresh that read the grant before the revoke writes it back after. The revoke writes this first; /token's
-- answers and every MCP request check it. Only a hash of the account's and the grant's ids (so it names no one, and outlives an account
-- deleted) and when; kept for the refresh tokens' lifetime (90 days), then swept by the cron.
CREATE TABLE revoked_grants (
  grant_hash TEXT PRIMARY KEY,
  revoked_at INTEGER NOT NULL
);
CREATE INDEX revoked_grants_at ON revoked_grants (revoked_at);
