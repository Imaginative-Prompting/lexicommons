// A weave in the form the weave guide's rules describe, made into the stored lexicommons-weave (book-format.js). The rules (get_weave_guide,
// the books pipeline's own prompt) name each sentence's parts as objects, and each sentence by its number x:
//   { sentences: [{ x, t: [{ w, target, lemma, reading? }], text, m: [{ target, cue, sources, lemma, reading? }], u: [{ k, len, target }], c }] }
// The stored form is arrays, with each sentence's span in the book (s, e) and the hash of its words (h): what an AI over MCP can't be
// asked to work out. This is the books pipeline's conversion (pipelines/books/lib/check.ts makeChecker), so a weave your AI writes from the
// guide is the same as one the pipeline makes: each t entry's w is the book's word [k], punctuation in the literal line is itself, a
// lemma's curly apostrophe is straight, a reading (a language that shows them) goes last. What the stored form must then pass is
// validateWeave's, as always. Pure: the Worker (add_weave) and the tests run it; the server's alone, so it lives here, not in public/.

import { FORMAT_VERSION, frameOf as frameOfJs, LANGUAGES, sentenceHash as sentenceHashJs, WEAVE_FORMAT } from "../public/js/read/book-format.js";

// book-format.js, typed as it's called here (it's plain JS). A weave in the guide's form is whatever an AI sent: read field by field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const frameOf = frameOfJs as unknown as (word: string) => [string, string];
const sentenceHash = sentenceHashJs as unknown as (words: string[], s: number, e: number) => Promise<string>;
type Book = { id: string; version: string; lang: string; words: string[]; sentences: [number, number][] };

/** Whether a weave is in the rules' form (sentences with x, no format) rather than the stored one. */
export const isAnswerForm = (value: Any): boolean => Boolean(value) && typeof value === "object" && value.format === undefined && Array.isArray(value.sentences);

const list = (value: Any): Any[] => (Array.isArray(value) ? value : []);
const straight = (lemma: Any) => (typeof lemma === "string" ? lemma.replace(/’/g, "'") : lemma);
const HAS_ALNUM = /[\p{L}\p{N}]/u;

/** A sentence's words as the rules number them ([k]), for the weaver: [{ x, words }] in the book's order. */
export const numberedSentences = (book: Book) => book.sentences.map(([s, e], x) => ({ x, words: book.words.slice(s, e) }));

const isText = (value: Any): boolean => typeof value === "string";
const isLemma = (value: Any): boolean => value === null || typeof value === "string";
const isObj = (value: Any): boolean => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const indexes = (value: Any): boolean => Array.isArray(value) && value.every((k: Any) => Number.isInteger(k));

/** What's wrong with one sentence's entry in the guide's form, before it's made into the stored form. */
function shapeProblems(o: Any, x: number, book: Book): string[] {
  const problems: string[] = [];
  const at = `Sentence ${x}`;
  const [first, end] = book.sentences[x]!;
  const n = end - first;
  for (const key of Object.keys(o)) if (!["x", "t", "text", "m", "u", "c"].includes(key)) problems.push(`${at}: there's no ${key}; a sentence's entry has x, t, text, m, and u and c when it needs them.`);
  if (!Array.isArray(o.t) || o.t.length !== n) problems.push(`${at}: t must hold one { w, target, lemma } for each of its ${n} words ([0] to [${n - 1}]); it has ${Array.isArray(o.t) ? o.t.length : "none"}.`);
  else o.t.forEach((entry: Any, k: number) => {
    if (!isObj(entry) || !isText(entry.w) || !isText(entry.target) || !isLemma(entry.lemma) || (entry.reading !== undefined && !isLemma(entry.reading))) problems.push(`${at}: t[${k}] must be { w, target, lemma }: w and target text, lemma text or null.`);
  });
  if (!isText(o.text)) problems.push(`${at}: text must be the natural sentence, as text.`);
  if (!Array.isArray(o.m) || !o.m.length) problems.push(`${at}: m must hold the literal line: one { target, cue, sources, lemma } for each word of text, in text's order.`);
  else o.m.forEach((entry: Any, k: number) => {
    if (!isObj(entry) || !isText(entry.target) || !isText(entry.cue) || !indexes(entry.sources) || !isLemma(entry.lemma) || (entry.reading !== undefined && !isLemma(entry.reading))) problems.push(`${at}: m[${k}] must be { target, cue, sources, lemma }: target and cue text, sources a list of word numbers [k], lemma text or null.`);
  });
  if (o.u !== undefined && (!Array.isArray(o.u) || !o.u.every((u: Any) => isObj(u) && Number.isInteger(u.k) && Number.isInteger(u.len) && isText(u.target)))) problems.push(`${at}: u must be a list of { k, len, target } (leave it empty, or out, when there's no idiom upgrade).`);
  if (o.c !== undefined && (!Array.isArray(o.c) || !o.c.every(isText))) problems.push(`${at}: c must be a list of pattern ids (leave it empty, or out, when none fits).`);
  return problems;
}

/**
 * The stored weave for book, into `to`, from an answer in the rules' form: { weave, problems }. problems says what keeps it from being
 * made (a sentence missing or twice, a t entry for another word); weave is null only when a sentence can't be placed. The stored weave
 * still goes through validateWeave, which says everything else.
 */
export async function weaveFromAnswer(book: Book, to: string, answer: Any): Promise<{ weave: Any; problems: string[] }> {
  const problems: string[] = [];
  const n = book.sentences.length;
  const byX = new Map<number, Any>();
  list(answer?.sentences).forEach((o: Any, i: number) => {
    if (!o || typeof o !== "object" || !Number.isInteger(o.x) || o.x < 0 || o.x >= n) return problems.push(`sentences[${i}]: x must be the sentence's number, 0 to ${n - 1} (get_text lists them).`);
    if (byX.has(o.x)) return problems.push(`Sentence ${o.x} is given twice: one entry per sentence.`);
    byX.set(o.x, o);
  });
  const missing = [...Array(n).keys()].filter((x) => !byX.has(x));
  if (missing.length) problems.push(`Every sentence needs its entry: ${missing.length} of ${n} missing (x = ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? ", …" : ""}).`);
  // Each part's shape, said in the guide's own terms (the stored form's checks would say it in arrays).
  for (const [x, o] of byX) problems.push(...shapeProblems(o, x, book));
  if (problems.length) return { weave: null, problems };
  const readings = Boolean((LANGUAGES as Any)[to]?.readings);
  // A reading is the word alone: punctuation copied onto its edges is dropped (unless that leaves nothing), as the pipeline does.
  const readingOf = (value: string) => {
    const chars = [...value];
    const [lead, trail] = frameOf(value);
    return chars.slice([...lead].length, chars.length - [...trail].length).join("") || value;
  };
  const withReading = (entry: Any, base: Any[]) => (readings && typeof entry?.reading === "string" && entry.reading ? [...base, readingOf(entry.reading)] : base);
  const sentences: Any[] = [];
  for (let x = 0; x < n; x++) {
    const o = byX.get(x);
    const [s, e] = book.sentences[x]!;
    const words = book.words.slice(s, e);
    list(o.t).forEach((entry: Any, j: number) => {
      if (j < words.length && entry?.w !== words[j]) problems.push(`Sentence ${x}: t entry ${j} is for ${JSON.stringify(entry?.w ?? null)}, but word [${j}] is ${JSON.stringify(words[j])}; one entry per word, in order.`);
    });
    const m = list(o.m).map((entry: Any) => {
      const target = entry?.target;
      // Punctuation in the literal line is itself, cue and all, with no lemma (as the pipeline settles it).
      if (typeof target === "string" && !HAS_ALNUM.test(target)) return [target, target, list(entry?.sources), null];
      return withReading(entry, [target, entry?.cue, entry?.sources, straight(entry?.lemma ?? null)]);
    });
    const sentence: Any = { s, e, h: await sentenceHash(book.words, s, e), t: list(o.t).map((entry: Any) => withReading(entry, [entry?.target, straight(entry?.lemma ?? null)])), text: o.text, m };
    if (list(o.u).length) sentence.u = o.u.map((u: Any) => [u?.k, u?.len, u?.target]);
    if (list(o.c).length) sentence.c = o.c;
    sentences.push(sentence);
  }
  return { weave: { format: WEAVE_FORMAT, v: FORMAT_VERSION, kind: "weave", book: book.id, bookVersion: book.version, from: book.lang, to, sentences }, problems };
}

/** The stored weave back in the rules' form (for the tests' round trip, and to show an AI its weave as it wrote it). */
export function answerFromWeave(book: Book, weave: Any) {
  return {
    sentences: weave.sentences.map((sentence: Any, x: number) => {
      const words = book.words.slice(sentence.s, sentence.e);
      const reading = (entry: Any[], at: number) => (entry.length > at ? { reading: entry[at] } : {});
      return {
        x,
        t: sentence.t.map((entry: Any, j: number) => ({ w: words[j], target: entry[0], lemma: entry[1], ...reading(entry, 2) })),
        text: sentence.text,
        m: sentence.m.map((entry: Any) => ({ target: entry[0], cue: entry[1], sources: entry[2], lemma: entry[3], ...reading(entry, 4) })),
        u: (sentence.u ?? []).map(([k, len, target]: Any) => ({ k, len, target })),
        c: sentence.c ?? [],
      };
    }),
  };
}
