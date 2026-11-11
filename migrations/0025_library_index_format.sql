-- How Explore's index of the library's packs was written (src/community.ts INDEX_FORMAT): a sync claims a catalog revision it already
-- finished when the index was written an older way, so a new field (format 1: each pack's commonness, badges.meanRank) reaches every row.
ALTER TABLE library_index ADD COLUMN format INTEGER NOT NULL DEFAULT 0;
