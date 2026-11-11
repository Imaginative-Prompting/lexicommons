// What a pack gives the index for finding a pack from what you typed (src/find.ts): pure, so it's tested on its own. An entry is one thing to show: a sentence, a plain item or a
// glossed word. A term leads to an entry. A sentence is filed under the word it was written for and its rarest words on each side, so a common word doesn't fill a term with
// thousands of rows and a whole sentence typed still finds itself. A word is filed under its dictionary form and the words of its gloss.
// A term is taught where its entry was written for it: a sentence's own word (its form, its dictionary form and what it means), and every word
// of a plain item, which is itself what's learned. Elsewhere a term is only said, so a search puts the packs that teach a word first.
import { keyOf as keyOfJs } from "../public/js/translate/engine.js";

const keyOf = keyOfJs as unknown as (text: unknown) => string;

const RAREST = 2;
const GLOSS_TERMS = 6;

const wordsOf = (text: unknown): string[] => keyOf(text).split(" ").filter(Boolean);

/** What a gloss says the word means, as words to search by: its first sense, without a verb's "to" ("to want; to wish" is want; "my, mine; mine (…)" is my, mine). */
export const meaningOf = (gloss: unknown): string[] =>
  wordsOf(String(gloss ?? "").split(/[;(]/)[0]?.replace(/^\s*to\s+/i, "")).filter((word) => word.length > 1).slice(0, GLOSS_TERMS);

/** The words of a text as a search has them: in a language written without spaces, what the language's own segmenter makes of it. */
export function termsOf(text: unknown, language: string, separator = " "): string[] {
  if (separator !== "" || typeof Intl?.Segmenter !== "function") return wordsOf(text);
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  const found = [...segmenter.segment(String(text ?? ""))].filter((part) => part.isWordLike).map((part) => keyOf(part.segment)).filter(Boolean);
  return [...new Set([...found, ...wordsOf(text)])];
}

type FindItem = { text?: string; means?: string; words?: [string, (string | null)?, (string | null)?][]; literal?: [string, boolean?][]; gap?: { index?: number } };
type FindPack = { language: string; items?: FindItem[]; words?: Record<string, string> };

/** A pack as { entries: [{ n, body }], terms: [[term, n, taught]] }: taught is 1 where the entry was written for the term, else 0. */
export function findRows(pack: FindPack, separator = " ") {
  const count = new Map<string, number>();
  const seen = (term: string) => count.set(term, (count.get(term) ?? 0) + 1);
  const sides = (pack.items ?? []).map((item) => {
    const here = item.words ? item.words.map(([written]) => keyOf(written)).filter(Boolean) : termsOf(item.text, pack.language, separator);
    const english = wordsOf(item.means);
    for (const term of new Set([...here, ...english])) seen(term);
    return { here: [...new Set(here)], english: [...new Set(english)] };
  });
  const rarest = (terms: string[]) => [...terms].sort((a, b) => (count.get(a) ?? 0) - (count.get(b) ?? 0) || a.localeCompare(b)).slice(0, RAREST);
  const entries: { n: number; body: unknown }[] = [];
  const terms: [string, number, 0 | 1][] = [];
  (pack.items ?? []).forEach((item, i) => {
    const n = entries.length;
    const { here, english } = sides[i] as { here: string[]; english: string[] };
    entries.push({ n, body: { t: item.text, ...(item.means ? { m: item.means } : {}), ...(item.literal ? { l: item.literal.map(([text]) => text) } : {}) } });
    const own = Number.isInteger(item.gap?.index) ? item.words?.[item.gap?.index as number] : null;
    const lemmas = (item.words ?? []).filter(([written]) => rarest(here).includes(keyOf(written))).map(([, lemma]) => (lemma ? keyOf(lemma) : "")).filter(Boolean);
    // What the sentence was written for: its own word, that word's dictionary form, and what its gloss says it means.
    const glossed = (key: unknown) => (typeof key === "string" && pack.words && Object.hasOwn(pack.words, key) ? pack.words[key] : undefined);
    const gloss = own ? (glossed(own[1]) ?? glossed(own[0]) ?? glossed(keyOf(own[0]))) : undefined;
    const taught = new Set(own ? [keyOf(own[0]), keyOf(own[1] ?? ""), ...meaningOf(gloss)] : []);
    // A plain item is short: every word of it leads to it, and is what it teaches.
    const filed = item.words ? [...rarest(here), ...rarest(english), ...lemmas, ...taught] : [...here, ...english];
    for (const term of new Set(filed.filter(Boolean))) terms.push([term, n, !item.words || taught.has(term) ? 1 : 0]);
  });
  for (const [lemma, gloss] of Object.entries(pack.words ?? {})) {
    const n = entries.length;
    entries.push({ n, body: { w: lemma, g: gloss } });
    // A pack's word list glosses every word its sentences say: being in it isn't being taught.
    for (const term of new Set([keyOf(lemma), ...wordsOf(gloss).filter((word) => word.length > 1).slice(0, GLOSS_TERMS)].filter(Boolean))) terms.push([term, n, 0]);
  }
  return { entries, terms };
}
