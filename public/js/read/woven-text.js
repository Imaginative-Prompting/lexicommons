// A woven text as it shows and as it's read aloud, for a set of words you know: pure (no DOM), so the checks run it
// in Node. Built on book-format.js's weaveSentence, the same render the library's audit uses.

import { LANGUAGES, coverageOf, gapBetween, weaveSentence } from "./book-format.js";
import { rankOf } from "../study/frequency.js";

/**
 * The share of a sentence's learnable words you must know for it to show all in the language: the learning strategy's 90%
 * (readersound's was 70). The reader's default too (bank.js), and a setting there, one of FLIP_CHOICES. 95 until 10 Nov 2026:
 * a sentence of fewer than 20 such words then needed every one, so in practice the whole sentence; at 90 one word in ten
 * can be new in a sentence of 10 or more, and a shorter one still needs every word.
 */
export const FLIP_AT = 90;

/** The setting's choices: a share, all of the words (100), or never (over 100). */
export const FLIP_CHOICES = [50, 70, FLIP_AT, 100, 101];

/**
 * A share kept on this device (the reader's settings, never synced): one the setting no longer offers reads as the default.
 * That's 95, the old default, kept by every device whose weave settings were changed before 10 Nov 2026 (a change keeps them all).
 */
export const flipAtOf = (kept) => (FLIP_CHOICES.includes(kept) ? kept : FLIP_AT);

/** A text's lemmas, its most common first (equals by where they first appear). */
function byCount(weave) {
  const counts = new Map();
  for (const sentence of weave.sentences) for (const [, lemma] of sentence.t) if (lemma) counts.set(lemma, (counts.get(lemma) ?? 0) + 1);
  // Map keeps first appearance as the order of equals, and the sort is stable.
  return [...counts].sort((a, b) => b[1] - a[1]).map(([lemma]) => lemma);
}

/**
 * The order to learn a text's words in, most useful first: the reader's suggestions and its "words you already know"
 * read it. Its words by how much they're used in the language (study/frequency.js, once the list is loaded); the
 * ones the list doesn't have come after, the text's most common first.
 */
export function learningOrder(weave, lang = weave.to ?? "nl") {
  const ranked = byCount(weave);
  const place = new Map(ranked.map((lemma, k) => [lemma, k]));
  return ranked.sort((a, b) => {
    const ra = rankOf(a, lang);
    const rb = rankOf(b, lang);
    return ra !== rb ? ra - rb : place.get(a) - place.get(b);
  });
}

/** The lemmas to count as known for about `share` of the text's learnable words: the most frequent first. */
export function knownForShare(weave, share) {
  const ranked = byCount(weave);
  const known = new Set();
  for (const lemma of ranked) {
    if (coverageOf(weave, known).share >= share) break;
    known.add(lemma);
  }
  return known;
}

/** The text as it shows at a level: paragraphs of sentences, each a list of pieces { i, show, text }. */
export function wovenParagraphs(book, weave, known) {
  const bySentence = new Map(weave.sentences.map((sentence) => [sentence.s, sentence]));
  const paragraphs = [];
  for (const para of book.paras) {
    if (para.e <= para.s) continue;
    const sentences = [];
    for (const [s, e] of book.sentences) {
      if (s < para.s || s >= para.e) continue;
      const sentence = bySentence.get(s);
      const shown = sentence ? weaveSentence(sentence, book.words, known, { flipAt: FLIP_AT, lang: weave.to, from: weave.from }) : null;
      const pieces = shown
        ? shown.words.filter((piece) => piece.show !== "hidden")
        : book.words.slice(s, e).map((text, j) => ({ i: s + j, show: "en", text }));
      sentences.push({ s, flipped: Boolean(shown?.flipped), pieces });
    }
    paragraphs.push({ k: para.k, sentences });
  }
  return paragraphs;
}

/** Whether a piece shows in the language you're learning (the rest is English). */
export const isTarget = (piece) => piece.show === "target";

/**
 * What's between two pieces of a sentence woven into `to`: in a sentence shown whole in a language written without
 * spaces (Japanese, Chinese: flipped), nothing; else a space, as each word stands in an English word's place, or
 * nothing where the two were written together ("it—but").
 */
export function pieceGap(before, after, to, flipped) {
  if (flipped && LANGUAGES[to]?.separator === "") return "";
  return gapBetween(before.text, after.text, null, " ");
}
// Punctuation alone ("—", "…") goes with whatever it's next to.
const hasWord = (text) => /[\p{L}\p{N}]/u.test(text);

/**
 * What a way of reading says, in order: [{ text, lang: `to` | "en", pieces: [the pieces it reads], starts: [where each
 * piece starts in text] }]. to is the
 * language the text is woven into ("nl"). The ways: "split" (each run in its own language), "target" or "en" (all in
 * one), "sentence" (a sentence that's mostly in the language in it, the rest in English).
 */
export function utterancesFor(paragraphs, way, to = "nl") {
  const out = [];
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences) {
      const { pieces } = sentence;
      if (way === "split") {
        let run = null;
        for (const piece of pieces) {
          const lang = isTarget(piece) ? to : "en";
          if (run && (run.lang === lang || !hasWord(piece.text))) run.pieces.push(piece);
          else {
            run = { lang, pieces: [piece], flipped: sentence.flipped };
            out.push(run);
          }
        }
      } else {
        const target = pieces.filter(isTarget).length;
        const lang = way === "target" ? to : way === "en" ? "en" : sentence.flipped || target * 2 >= pieces.length ? to : "en";
        out.push({ lang, pieces: [...pieces], flipped: sentence.flipped });
      }
    }
  }
  // Read as the page shows them (pieceGap): two words written together ("it—but") together.
  for (const u of out) {
    u.text = "";
    u.starts = u.pieces.map((piece, k) => {
      if (k) u.text += pieceGap(u.pieces[k - 1], piece, to, u.flipped);
      const at = u.text.length;
      u.text += piece.text;
      return at;
    });
    delete u.flipped;
  }
  return out;
}
