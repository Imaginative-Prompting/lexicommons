// The tokens a theme colors Tinta's ink with (character/ink.js reads them into a palette), apart so the first-frame keeper
// (firsts.js), which loads before the rig, can name a theme's ink without loading it.

/** Each ink field a theme may set, and its token. */
export const TOKENS = {
  body: "--tinta-ink",
  shade: "--tinta-ink-shade",
  light: "--tinta-ink-light",
  deep: "--tinta-ink-deep",
  brow: "--tinta-ink-brow",
  gloss: "--tinta-ink-gloss",
};
