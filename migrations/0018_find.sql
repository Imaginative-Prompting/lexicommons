-- Finding a pack from what you typed (src/find.ts): each live pack's sentences and glossed words, and the words that lead to them. Rows name a pack's version, and a
-- search joins them to items, so a pack that's withdrawn, hidden, taken down or moved on to a new version drops out of results at once. Written outside the request that
-- publishes a pack; rows no live version needs are cleared by the same pass.
CREATE TABLE find_entries (
  item_id TEXT NOT NULL,
  version TEXT NOT NULL,
  n INTEGER NOT NULL,
  body TEXT NOT NULL,             -- { t, m, l? }: a sentence or a plain item; or { w, g }: a word and its gloss
  PRIMARY KEY (item_id, version, n)
) WITHOUT ROWID;
CREATE TABLE find_terms (
  language TEXT NOT NULL,
  term TEXT NOT NULL,             -- one word as engine.js keyOf has it, in the pack's language or in English
  item_id TEXT NOT NULL,
  version TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (language, term, item_id, version, n)
) WITHOUT ROWID;
CREATE INDEX find_terms_item ON find_terms(item_id, version);
