// Search in a text (readersound's, from the reader's Contents): every place a query comes in the book's own words,
// ignoring case and accents ("cafe" finds "café"), across the whole book. Pure, so it runs in Node too
// (scripts/test-search.mjs).

// How many places a search shows (readersound's); past that, it says to narrow it.
export const SEARCH_MAX = 80;
// Words of context either side of a place, for its snippet.
export const SNIPPET_BEFORE = 4;
export const SNIPPET_AFTER = 8;

/** A word as search compares it: no accents, lowercase in its language, inner spaces as one. */
export function foldText(text, lang = "en") {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase(lang)
    .replace(/\s+/g, " ");
}

/** A book's words as one folded string (words joined by a space) and where each word starts in it. */
export function searchIndex(words, lang = "en") {
  const starts = new Int32Array(words.length + 1);
  const parts = new Array(words.length);
  let at = 0;
  for (let i = 0; i < words.length; i++) {
    parts[i] = foldText(words[i], lang);
    starts[i] = at;
    at += parts[i].length + 1;
  }
  starts[words.length] = at;
  return { text: parts.join(" "), starts };
}

// The word a character of the folded string is in.
function wordAt({ starts }, char) {
  let lo = 0;
  let hi = starts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= char) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Where `query` comes in the book: [{ i, j }], the first and last word of each place, in order, at most `max`, and
 * whether there are more. Null for a query too short to search (under two characters once folded and trimmed).
 */
export function searchWords(index, query, { lang = "en", max = SEARCH_MAX } = {}) {
  const q = foldText(query, lang).trim();
  if (q.length < 2) return null;
  const places = [];
  let from = 0;
  for (;;) {
    const found = index.text.indexOf(q, from);
    if (found < 0) return { places, more: false };
    if (places.length === max) return { places, more: true };
    const i = wordAt(index, found);
    const j = wordAt(index, found + q.length - 1);
    places.push({ i, j });
    // On from the next word, so a place is one hit even when the query comes twice inside it ("ee" in "eeeen").
    from = index.starts[j + 1];
  }
}

/** A place's snippet: the words before it, the place's own words, and the words after (each a list of words). */
export function snippetOf(words, { i, j }) {
  return {
    before: words.slice(Math.max(0, i - SNIPPET_BEFORE), i),
    found: words.slice(i, j + 1),
    after: words.slice(j + 1, Math.min(words.length, j + 1 + SNIPPET_AFTER)),
    cutBefore: i - SNIPPET_BEFORE > 0,
    cutAfter: j + 1 + SNIPPET_AFTER < words.length,
  };
}
