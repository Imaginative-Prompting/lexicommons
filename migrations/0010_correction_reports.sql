-- Reports on corrections (moderation.ts): a correction hidden or taken down says why, to its author, as a shared pack
-- does (items.state_reason). The reports themselves already take target_kind 'correction' (0008).

ALTER TABLE corrections ADD COLUMN shown_reason TEXT;
ALTER TABLE corrections ADD COLUMN shown_at INTEGER;
