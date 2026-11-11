// The packs that come with the app, in the order studying draws on them (before any pack of yours). Each is data in
// the pack format (study/pack-format.js). A built-in pack's item ids are app-wide, so two built-in packs of one language
// never share one (scripts/test-packs.mjs).

import starter from "./starter-word-order.js";

export const BUILT_IN = [starter];
