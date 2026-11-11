-- A shared pack's cover (src/community.ts): one of the drawings for its topics (pack-format.js coverChoices), picked when it's shared.
-- NULL: none picked, so Explore draws one by its id (coverByIdOf), or a drawn book for a pack with no topic.
ALTER TABLE items ADD COLUMN cover TEXT;
