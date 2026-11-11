// Whether a sentence's English rewords it: says it naturally with other words than the word-for-word line ("Ik drink graag
// koffie" is "I like drinking coffee", word for word "I gladly drink coffee"). A game shows that line and says so, so a
// learner never has to guess why "like" has no word in the sentence (lex-design-3 draws it: session.js, after-answer.js).
// Pure (no DOM): Node's tests and the screens read the same answer.
//
// Only what changes the words counts. Order is the "Dutch order" hint's (literal line, moved chunks); the little words
// English adds or drops (a, the, do, to, is…) and contractions (I'm, don't) aren't a rewording either, so the line isn't
// shown for "Woon je hier?" = "Do you live here?". A word's ending isn't one (drink, drinking).

// English words that come and go between a word-for-word line and natural English without changing what's said.
const LITTLE = new Set(
  "a an the do does did to of am is are was were be been being have has will would shall should it its there that this these those at in on for with by from up out off as so just very not".split(" "),
);
const CONTRACTIONS = [
  [/n't\b/g, " not"],
  [/'re\b/g, " are"],
  [/'ve\b/g, " have"],
  [/'ll\b/g, " will"],
  [/'m\b/g, " am"],
  [/'d\b/g, " would"],
  [/'s\b/g, " is"],
  [/\bcan not\b/g, "can"],
  [/\bwo not\b/g, "will not"],
  [/\bca not\b/g, "can not"],
];

/** The words of an English line, as compared: small letters, contractions undone, no punctuation or (bracketed asides). */
export function englishWords(text) {
  let s = String(text ?? "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\([^)]*\)/g, " ");
  for (const [from, to] of CONTRACTIONS) s = s.replace(from, to);
  return s
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

// A word's stem, roughly: drinking, drinks, drinked → drink; a short word stays as it is.
const stem = (word) => (word.length > 4 ? word.replace(/(?:ing|ed|es|s)$/, "") : word);
const content = (words) => words.filter((word) => !LITTLE.has(word)).map(stem);

/** The word-for-word line in English order ([[text, moved?]]), or in the sentence's order when English has none. */
export function wordForWord(item) {
  const literal = Array.isArray(item?.literal) ? item.literal : null;
  if (!literal?.length) return null;
  const order = Array.isArray(item.english) && item.english.length === literal.length ? item.english : literal.map((_, i) => i);
  return order.map((i) => literal[i]).filter(Boolean);
}

/**
 * Whether item's English rewords it, and how: null when the English says it with the word-for-word line's own words (in any
 * order, give or take the little words and endings), else { line, changed, note }:
 *   line: the word-for-word line in English order, [[text, moved?]] (as item.literal);
 *   changed: { means: [words only the English has], literal: [words only the line has] }, as written in each;
 *   note: why, in words, from the sentence's notes (pack-notes.js: a word's `differs`, else its `why`, joined), or null.
 * notes: the sentence's notes as notes.js gives them ({ words: [{ differs?, why? }] }), or nothing.
 */
export function rewordingOf(item, notes = null) {
  const line = wordForWord(item);
  if (!line || typeof item?.means !== "string") return null;
  const literalText = line.map(([text]) => text).join(" ");
  const fromMeans = englishWords(item.means);
  const fromLine = englishWords(literalText);
  const inLine = new Set(content(fromLine));
  const inMeans = new Set(content(fromMeans));
  const onlyMeans = fromMeans.filter((word) => !LITTLE.has(word) && !inLine.has(stem(word)));
  const onlyLine = fromLine.filter((word) => !LITTLE.has(word) && !inMeans.has(stem(word)));
  if (!onlyMeans.length && !onlyLine.length) return null;
  // Why, from the notes: what each word's note says English does differently (`differs`), the ones about a changed word
  // first. A word's `why` explains the language, not the English, so it isn't used.
  const changed = [...new Set([...onlyMeans, ...onlyLine])];
  const said = [...new Set((notes?.words ?? []).map((word) => word?.differs).filter((text) => typeof text === "string" && text.trim()).map((text) => text.trim()))];
  const about = (text) => englishWords(text).some((word) => changed.includes(word) || changed.some((c) => stem(c) === stem(word)));
  const why = [...said.filter(about), ...said.filter((text) => !about(text))].slice(0, 2).map((text) => (/[.!?]$/.test(text) ? text : `${text}.`));
  return {
    line: line.map(([text, moved]) => (moved ? [text, true] : [text])),
    changed: { means: [...new Set(onlyMeans)], literal: [...new Set(onlyLine)] },
    note: why.length ? why.join(" ") : null,
  };
}
