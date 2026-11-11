// The words a pack is about (pure, no imports): content.js uses it for the path's lessons, pack-known.js for Explore's bar.

const sentencesIn = (pack) => (pack?.items ?? []).filter((item) => Array.isArray(item.words) && item.words.length);

/** Whether a pack was written for its words: no lessons of its own, and a gap in every sentence (the word series, the category packs). */
export const writtenForWords = (pack) => Boolean(pack) && !pack.lessons?.length && sentencesIn(pack).length > 0 && sentencesIn(pack).every((item) => item.gap);

/**
 * The words a pack is about, each once, in its order: for a pack written for its words, those its gaps name; for one with lessons, those its
 * lessons teach; else none. Any pack's JSON: one on this device or the library's.
 */
export function packWords(pack) {
  const words = new Set();
  if (writtenForWords(pack)) {
    for (const item of sentencesIn(pack)) {
      const lemma = item.words[item.gap.index]?.[1];
      if (lemma) words.add(lemma);
    }
  } else for (const lesson of pack?.lessons ?? []) for (const word of lesson.words ?? []) if (word?.lemma) words.add(word.lemma);
  return [...words];
}
