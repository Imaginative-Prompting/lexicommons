// The share of a pack that is yours, for Explore's bar (explore.js): { known, total } over the pack's own words (pack-words.js),
// known by the Knowledge page's rule for a word understood well (know/word-index.js isUnderstood). Loaded only when Explore asks for it.
import { isUnderstood } from "../know/word-index.js";
import { allPacks } from "./packs.js";
import { packWords } from "./pack-words.js";

/**
 * { known, total } for a pack: its JSON with its items (the library's, or the device's copy), or the id of one on this device. null when it
 * can't tell: no such pack, or no words of its own, so Explore draws no bar.
 */
export function packKnown(pack) {
  const value = typeof pack === "string" ? allPacks().find((one) => one.id === pack) : pack;
  const words = value ? packWords(value) : [];
  if (!words.length) return null;
  const lang = value.language;
  return { known: words.filter((lemma) => isUnderstood(`w:${lemma}`, lang ? { lang } : {})).length, total: words.length };
}
