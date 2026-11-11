-- Each account's look: its built-in theme, colors (tokens), custom CSS and images. The app keeps it on the device and
-- sends every change here, so the person's own AI can read and change it over MCP and all their devices follow it.
-- Personal settings (text size, density, animations) stay on each device and never come here.

CREATE TABLE looks (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rev INTEGER NOT NULL,           -- goes up by one with every change, from a device or an AI
  look TEXT NOT NULL,             -- JSON { name, base, tokens, css, images: { slot: { hash, type, size, name } } }
  source TEXT NOT NULL,           -- who made this revision: device | oauth:<client> | pat:<token> | rest:<token>
  updated_at INTEGER NOT NULL,
  applied TEXT                    -- JSON: a device's newest report { rev, at, device, undone?, notes }
);

-- The last 20 revisions (the current one included), so an AI can undo its own changes.
CREATE TABLE look_history (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rev INTEGER NOT NULL,
  look TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, rev)
);

-- The look's images, stored once each by the SHA-256 of their bytes (R2: users/<id>/look/<hash>). Kept while the
-- current look or a kept revision uses them; up to 24 MB per account.
CREATE TABLE look_images (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, hash)
);

-- What an upload is for: NULL for a file, 'look:<slot>' for an image an AI is putting into the look.
ALTER TABLE uploads ADD COLUMN purpose TEXT;
