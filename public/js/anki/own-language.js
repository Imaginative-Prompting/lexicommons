// A deck in a language Lexicommons doesn't list (12 Nov 2026, packs in any language, part 4): how its cards suggest the language is written
// (guessDefinition), shown and changeable before it's added, and a code made from the name the person gives it (suggestCode). Pure:
// test-anki.mjs holds each. The definition's rules are lang/index.js's (ownLanguageProblem); a pack in it carries the definition.

// Scripts written right to left.
const RTL = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]/u;
// Scripts written without spaces between words.
const UNSPACED = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Tibetan}\p{Script=Tai_Tham}\p{Script=New_Tai_Lue}\p{Script=Javanese}\p{Script=Balinese}]/u;
const LETTER = /\p{L}/u;
const CASED = /[\p{Lu}\p{Ll}\p{Lt}]/u;
const UPPER = /^[\p{Lu}\p{Lt}]/u;
// What ends a sentence in every language (lang/index.js sentenceEnds), and what a card ends with that ends nothing ("…" and quotes aside).
const STANDARD_ENDS = new Set([".", "?", "!", "…", ",", ";", ":", "\"", "'", "”", "’", "»", ")", "]"]);

/**
 * How a deck's cards (the side in the language: its fronts) suggest the language is written: { direction: "ltr" | "rtl", written: "spaces" |
 * "unspaced", case: "lower" | "any", ends: [marks] }, each a guess the page shows and the person can change.
 * - direction: right to left when most of its letters are in a script written so (Hebrew, Arabic, Thaana…);
 * - written: without spaces when most of its letters are in a script written so (Thai, Burmese, Chinese, Japanese…), or when most of its
 *   longer cards (16 characters or more) have no space at all;
 * - case: "any" when its letters have no small and capital forms, or when words past a card's first are often capitalized (names, nouns as
 *   German writes them); else "lower" (dictionary forms in small letters);
 * - ends: the marks besides . ? ! … its cards end with, twice or more (Burmese's ။, Amharic's ።), up to four: a pack in it gives the same
 *   definition as every other pack of theirs in it, so they're found here rather than left for a later pack to disagree with.
 */
export function guessDefinition(texts) {
  const cards = (Array.isArray(texts) ? texts : []).filter((text) => typeof text === "string" && text.trim()).slice(0, 500).map((text) => text.trim());
  const letters = [...cards.join(" ")].filter((c) => LETTER.test(c));
  const share = (test) => (letters.length ? letters.filter((c) => test.test(c)).length / letters.length : 0);
  const direction = share(RTL) > 0.5 ? "rtl" : "ltr";
  const long = cards.filter((text) => text.length >= 16);
  const spaceless = long.filter((text) => !/\s/u.test(text)).length;
  const written = share(UNSPACED) > 0.5 || (long.length >= 3 && spaceless / long.length >= 0.6) ? "unspaced" : "spaces";
  let caseRule = "lower";
  // (With no letters to go on, the default: lower.)
  if (letters.length && share(CASED) < 0.5) caseRule = "any";
  else {
    const later = cards.flatMap((text) => text.split(/\s+/u).slice(1)).filter((word) => LETTER.test(word[0] ?? ""));
    if (later.length >= 5 && later.filter((word) => UPPER.test(word)).length / later.length > 0.25) caseRule = "any";
  }
  const endings = new Map();
  for (const text of cards) {
    const last = [...text].at(-1);
    if (last && /\p{P}/u.test(last) && !STANDARD_ENDS.has(last)) endings.set(last, (endings.get(last) ?? 0) + 1);
  }
  const ends = [...endings].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([mark]) => mark);
  return { direction, written, case: caseRule, ends };
}

/** A code for a language with none of its own, made from its name: und-x- and up to three of its words, 8 letters each ("und-x-toki-pona"); "" when its name has no letters a code can carry (the person types one). */
export function suggestCode(name) {
  const parts = String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 8))
    .slice(0, 3);
  return parts.length ? `und-x-${parts.join("-")}` : "";
}
