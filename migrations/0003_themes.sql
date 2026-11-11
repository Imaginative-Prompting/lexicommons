-- Saved themes. A look that changes anything is a theme of the person's own, kept on the account with a name, so
-- switching to a built-in theme or to another of theirs never loses one. The account's look (looks.look) is the theme
-- in use: its JSON gains "theme", the id of the saved theme it is, or null for a built-in theme as it comes. Every
-- change to the look in use is written to its theme in the same batch (src/looks.ts).

CREATE TABLE themes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,               -- made on a device or here: lowercase letters and digits
  rev INTEGER NOT NULL,           -- goes up by one with every change to this theme
  look TEXT NOT NULL,             -- JSON { name, base, tokens, css, images: { slot: { hash, type, size, name } } }
  created_by TEXT NOT NULL,       -- device | oauth:<client> | pat:<token> | rest:<token>
  source TEXT NOT NULL,           -- who changed it last, the same way
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,             -- a deleted theme is kept for a while, so the delete can be undone
  PRIMARY KEY (user_id, id)
);

-- Goes up by one with every change to any of the account's themes, so a device's poll can tell in one read.
CREATE TABLE theme_library (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rev INTEGER NOT NULL
);

-- Each account's look so far becomes its first saved theme (if it changes anything), and stays in use. It's named
-- after the look, made by whoever made its first kept revision.
INSERT INTO themes (user_id, id, rev, look, created_by, source, created_at, updated_at)
SELECT
  l.user_id,
  lower(hex(randomblob(8))),
  1,
  json_remove(json_set(l.look, '$.name', CASE WHEN trim(coalesce(json_extract(l.look, '$.name'), '')) = '' THEN 'My theme' ELSE json_extract(l.look, '$.name') END), '$.theme'),
  coalesce((SELECT h.source FROM look_history h WHERE h.user_id = l.user_id ORDER BY h.rev LIMIT 1), l.source),
  l.source,
  coalesce((SELECT h.created_at FROM look_history h WHERE h.user_id = l.user_id ORDER BY h.rev LIMIT 1), l.updated_at),
  l.updated_at
FROM looks l
WHERE (SELECT count(*) FROM json_each(l.look, '$.tokens')) > 0
   OR coalesce(json_extract(l.look, '$.css'), '') <> ''
   OR (SELECT count(*) FROM json_each(l.look, '$.images')) > 0;

UPDATE looks
SET look = json_set(json_set(look, '$.name', (SELECT json_extract(t.look, '$.name') FROM themes t WHERE t.user_id = looks.user_id)), '$.theme', (SELECT t.id FROM themes t WHERE t.user_id = looks.user_id))
WHERE EXISTS (SELECT 1 FROM themes t WHERE t.user_id = looks.user_id);

-- Before themes, an account had one look, so every kept revision that changes anything was that theme.
UPDATE look_history
SET look = json_set(look, '$.theme', (SELECT t.id FROM themes t WHERE t.user_id = look_history.user_id))
WHERE EXISTS (SELECT 1 FROM themes t WHERE t.user_id = look_history.user_id)
  AND ((SELECT count(*) FROM json_each(look_history.look, '$.tokens')) > 0
    OR coalesce(json_extract(look_history.look, '$.css'), '') <> ''
    OR (SELECT count(*) FROM json_each(look_history.look, '$.images')) > 0);

INSERT INTO theme_library (user_id, rev) SELECT user_id, 1 FROM themes;
