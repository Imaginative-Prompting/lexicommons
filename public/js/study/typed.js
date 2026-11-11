// Typed answers, graded: a whole sentence (Type it), or a word or a few (Type the word; a gap's word in Type in the gap and Type what it
// says) against what's right, word by word through the speech matcher (speech/match.js), with accents optional when forgiving (and the
// letters a keyboard may lack: đ, ø, ß; lang/index.js withoutAccents). Right only word for word (attribute.js typedRight): a near miss
// is a wrong form. Pure, so Node's tests read it (scripts/test-study.mjs).

import { LANGUAGES, withoutAccents } from "../lang/index.js";
import { ITEMS, contentLanguage, sentence } from "./content.js";
import { match as matchWords } from "../speech/match.js";
import { typedRight } from "./attribute.js";
import { asWritten, genderVariants, sameEnglishVariants, subjectVariants } from "./subjects.js";

// A sentence's words as the matcher takes them where the language is written without spaces, the end mark on the last; and each word's reading.
const expectedWords = (item) => item.words.map(([text], i) => (i === item.words.length - 1 ? text + item.punct : text));
const readingsOf = (item) => item.words.filter(([, , reading]) => reading).map(([text, , reading]) => [text, reading]);

// A word as typed and as written, to compare their accents: one form, one case. And the same without its accents.
const oneCase = (text) => String(text ?? "").normalize("NFC").toLocaleLowerCase();
const unmarked = (text) => oneCase(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Typed words against an item (its words as [text, lemma, reading], its punct), word by word: the matcher's result. The matcher hears past
 * accents (a recognizer writes none), so with accents strict (Settings → Type it), a word right but for its accents is a near miss.
 * fromEnglish: typed from the sentence's English, so its subject said or left out is right too, as the language allows (study/subjects.js),
 * the result shown on the sentence as written; another of your sentences with the same English, and the same sentence for the other gender
 * (shown as you typed it), typed exactly; typed from what's heard, word for word.
 */
export function typedResult(item, typed, forgiving, { fromEnglish = false } = {}) {
  const lang = contentLanguage();
  // Written without spaces (Japanese, Chinese): the words as the pack splits them, compared character by character,
  // a word with kanji also right in its reading; accents don't apply (folding them would drop kana's voicing marks).
  if (LANGUAGES[lang]?.separator === "") {
    const result = matchWords(expectedWords(item), typed, { lang, readings: readingsOf(item) });
    if (!fromEnglish || typedRight(result)) return result;
    // From the English: another of your sentences with the same English, or the other gender's (ผม…ครับ, ฉัน…ค่ะ), typed exactly, whole.
    for (const variant of [...sameEnglishVariants(item, { items: ITEMS, textOf: sentence }), ...genderVariants(item)]) {
      const other = matchWords(variant.text, typed, { lang });
      if (typedRight(other)) return asWritten({ ...other, expected: variant.text }, [variant], item);
    }
    return result;
  }
  const grade = (target) => {
    if (forgiving) return matchWords(withoutAccents(target), withoutAccents(typed), { lang });
    const result = matchWords(target, typed, { lang });
    for (const word of result.words) {
      if (word.result !== "right" || typeof word.heard !== "string") continue;
      if (oneCase(word.heard) !== oneCase(word.text) && unmarked(word.heard) === unmarked(word.text)) word.result = "close";
    }
    return result;
  };
  const result = grade(sentence(item));
  if (!fromEnglish || typedRight(result)) return result;
  // Its subject said or left out is right too, and so is another of your sentences with the same English, but only typed exactly so:
  // anything else is graded, and shown, against the sentence as written (a slip in the pronoun itself is a slip, never dropped with it).
  for (const variant of [...subjectVariants(item, { lang, items: ITEMS }), ...sameEnglishVariants(item, { items: ITEMS, textOf: sentence }), ...genderVariants(item)]) {
    const other = grade(variant.text);
    if (typedRight(other)) return asWritten({ ...other, expected: variant.text }, [variant], item);
  }
  return result;
}

/**
 * A word typed against how it's written: one word, or a few (a noun with its article, a phrase), every one of them needed. lemma: the
 * word it is (the last one's, past an article); reading: its reading, where its language writes one (typed in it, it's right).
 * { correct, result }.
 */
export function typedWord(text, typed, { forgiving = true, lemma = null, reading = null } = {}) {
  const parts = String(text).trim().split(/\s+/);
  const words = parts.map((part, i) => (i === parts.length - 1 ? [part, lemma, reading || undefined] : [part, null]));
  const result = typedResult({ words, punct: "" }, typed, forgiving);
  return { correct: typedRight(result), result };
}
