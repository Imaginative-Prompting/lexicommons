-- Finding a pack (src/find.ts): which words a pack teaches, so a search puts the packs that teach a word before those that only say it in a sentence.
-- taught: 1 where the term's entry was written for it (a sentence's own word, its dictionary form and what it means; a plain item's words), 0 where
-- it's only said. NULL on rows written before this: not known yet. Those packs are written again by the same pass as anything missing (an entry's
-- format below its FIND.format), and their rows serve searches until then.
ALTER TABLE find_terms ADD COLUMN taught INTEGER;
ALTER TABLE find_entries ADD COLUMN format INTEGER NOT NULL DEFAULT 1;
