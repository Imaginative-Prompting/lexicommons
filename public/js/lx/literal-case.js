// A literal line's capitals in English order. The line is written in the learned language's order, so its first chunk
// carries the sentence's capital ("To me / pleases / the coffee"). Slid into English order, the chunk that leads now
// takes the capital and the old first one gives it up ("Pleases / to me" reads as it should; "pleases / To me" doesn't),
// unless it's "I" or a name: a word the natural English capitalizes away from its own start. Anything else keeps its
// case. Pure, so the tests run it (scripts/test-literal-line.mjs).

const LETTERS = /[^\p{L}'’]/gu;
const firstWord = (text) => (text.trim().split(/\s+/)[0] ?? "").replace(LETTERS, "");
const upperFirst = (text) => text.replace(/^(\s*)(\p{Ll})/u, (_, space, c) => space + c.toLocaleUpperCase());
const lowerFirst = (text) => text.replace(/^(\s*)(\p{Lu})/u, (_, space, c) => space + c.toLocaleLowerCase());

/** Whether a chunk's first word keeps its capital wherever it stands: "I" (I'm, I'd…), or a name the natural English capitalizes mid-sentence. */
export function keepsCapital(text, natural = "") {
  const word = firstWord(text);
  if (!word) return false;
  if (/^I(['’]\p{L}+)?$/u.test(word)) return true;
  return String(natural)
    .split(/\s+/)
    .slice(1)
    .some((w) => w.replace(LETTERS, "") === word);
}

/**
 * The chunks' texts (by chunk index) for English order, english the chunks' indices in that order: the chunk that
 * leads capitalized, the first chunk lowercased unless it keeps its capital, the rest as written.
 */
export function englishOrderTexts(chunks, english, natural = "") {
  const texts = chunks.map((chunk) => chunk.text);
  const lead = english?.[0];
  if (!Number.isInteger(lead) || lead === 0) return texts;
  texts[lead] = upperFirst(texts[lead]);
  if (!keepsCapital(texts[0], natural)) texts[0] = lowerFirst(texts[0]);
  return texts;
}

/** Whether a line's chunks really change places in English order: `english` lists them in another order than they're written. */
export const flipsOrder = (english) => Array.isArray(english) && english.some((at, i) => at !== i);

const lineWords = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}'’]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

/**
 * Whether a sentence's word-for-word line comes in another order than its natural English, so there's something for an order
 * hint or toggle to show: its chunks change places (`english`), the pack marks a word the language puts elsewhere (`moved`, a
 * chunk's own mark), or the words the two lines share, each once in both, come in a different order. "Here | is | my key" and
 * "My key is here." do, though its `english` says it can't be flipped; "I | drink | a coffee" and "I'm having a coffee." don't.
 * literal: [text, moved] pairs (a pack's) or { text, moved } (a card's).
 */
export function orderDiffers({ literal, english, moved, means } = {}) {
  if (flipsOrder(english)) return true;
  if (moved?.length) return true;
  const chunks = (literal ?? []).map((chunk) => (Array.isArray(chunk) ? { text: chunk[0], moved: chunk[1] } : chunk));
  if (chunks.some((chunk) => chunk.moved)) return true;
  const said = lineWords(chunks.map((chunk) => chunk.text).join(" "));
  const meant = lineWords(means);
  const times = (words) => words.reduce((seen, word) => seen.set(word, (seen.get(word) ?? 0) + 1), new Map());
  const inSaid = times(said);
  const inMeant = times(meant);
  const shared = (word) => inSaid.get(word) === 1 && inMeant.get(word) === 1;
  return said.filter(shared).join(" ") !== meant.filter(shared).join(" ");
}
