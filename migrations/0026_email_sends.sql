-- Every code sent to an address, for its hourly limits only (src/account-email.ts addCode): 5 an hour per address, and 5 an hour per
-- account adding one. Apart from email_codes, which removing an address, confirming one or using a code empties: counted there, adding
-- and removing an address again and again sent codes to any inbox without end. The address only as a hash; a row goes after an hour,
-- and when its account is deleted it loses the account and stays its hour, so a new account can't send to that inbox again at once.
CREATE TABLE email_sends (
  address_hash TEXT NOT NULL,      -- sha256 of "email-send:" and the address as kept (small letters)
  user_id TEXT,                    -- the account adding an address; NULL for a way back in, or once the account is gone
  sent_at INTEGER NOT NULL
);
CREATE INDEX email_sends_address ON email_sends (address_hash, sent_at);
CREATE INDEX email_sends_user ON email_sends (user_id, sent_at);
