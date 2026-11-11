// Translate: what Lexicommons already knows of a language, searched both ways, every result with its source. No model
// and no outside service: it finds what packs and books say, and says plainly when they don't. Pure, so the device
// (translate.js, over what it has) and the server (src/translate.ts, over the library and Explore's shared packs) build
// and search an index with the same code.
//
// A source, as buildIndex reads it:
//   { id, kind: "pack" | "book", name, credit, license?, language,
//     items?, words?, chunks?        a pack's sentences (pack-format.js items), its glossary { lemma: gloss } and phrases
//     sentences? }                   sentence pairs from a book's layer (bookSource makes them):
//                                    [{ text, translation, words: [[form, lemma, gloss]] }], text in the language,
//                                    translation in English, each gloss what that form means there (it may be null)
// search(index, text, { from, to }) returns
//   { query, from, to, whole, words, sentences, unknown, sources, found } or null for nothing typed:
//   whole      a whole sentence found: { text, translation, item, source } (item: a pack's sentence, or null for a book's)
//   words      word by word: [{ text, lemma, en, source }], text in the language (the dictionary form, the form a book
//              glossed, or the phrase), lemma its dictionary form (null for a phrase), en what it means. With a whole
//              sentence found, its own words with what each means there; otherwise in the order typed (a phrase, or an
//              English gloss of several words, counts as one), up to three meanings for one word typed and the first
//              for each of several. at and span: the typed words it covers (from at, span of them)
//   sentences  example sentences using what was found: [{ item, text, natural, source, own? }], a word's own sentences
//              first (own: a pack's sentence whose gap is that word, the one written for it), then a pack's, then a
//              book's; up to TRANSLATE_LIMITS.examples, or examplesOne when what was typed is one thing (a word, or a
//              phrase or gloss of several: "thank you")
//   unknown    typed words found nowhere (little words like "the" or "de" aren't listed)
//   sources    every source a result came from: [{ id, kind, name, credit, license? }]
//   found      how many of the typed words were found
//   tokens     the words typed, as they were matched (at and span count these)
//   alternatives  the next best guesses, best first, up to TRANSLATE_LIMITS.alternatives: a word's other readings
//              ({ text, lemma, en, source, at, span }, the form it was typed as: tokens[at]), and, after a whole sentence,
//              the other sentences it could be ({ sentence: true, text, translation, item, source })
//   reading    typed with no direction, one word spelled the same on both sides: "same" (it's one word in both: a Dutch
//              word that means itself), or "two" (different words: both readings, in `readings`, [the language's, English's])
//   led        typed with no direction, a word the language has too, but with a commoner word for it: English's reading leads
//   main       the main words, in the order typed, up to TRANSLATE_LIMITS.mainWords: { lemma, text, en, source, at, sentences:
//              [{ item, text, natural, source, own? }] }, a word's own sentence first. Little and very common words are
//              left out unless there's nothing else, or one thing was typed
// bestGuess(result) reads a result as what to show first: the whole sentence, the word, the word-by-word line (rough:
// true) or nothing.

import { LANGUAGES } from "../lang/index.js";
import { frameOf, joinWords, layerCredit } from "../read/book-format.js";
import { READINGS } from "./readings.js";

export const TRANSLATE_LIMITS = { query: 400, phrase: 6, meanings: 3, examples: 3, examplesOne: 6, perKey: 8, alternatives: 8, mainWords: 4 };

/** Whether a result is about one thing typed: no whole sentence, nothing missing, every word found at one place. */
const aboutOne = (words, unknown, whole) => !whole && !unknown.length && words.length > 0 && new Set(words.map((w) => w.at ?? 0)).size === 1;
/** A result's sentences in order: own sentences first, the rest as they came (sort is stable). */
const ownFirst = (sentences) => [...sentences].sort((a, b) => Number(Boolean(b.own)) - Number(Boolean(a.own)));

// English little words, not listed as unknown (the languages' own are their registry's `stray`).
const ENGLISH_LITTLE = new Set("a an the to of and or but is are am was were be been it its this that these those i you he she we they me him her us them my your his our their in on at for with by from as do does did not no yes so".split(" "));

// English's irregular forms of its commonest verbs, looked up by their dictionary form.
const ENGLISH_BASE = { is: "be", am: "be", are: "be", was: "be", were: "be", been: "be", has: "have", had: "have", does: "do", did: "do", done: "do", goes: "go", went: "go", gone: "go" };
// A gloss that says its word isn't the everyday one.
const ASIDE = /\((?:[^)]*\b)?(?:regional|in belgium|dialect|archaic|old-fashioned|playful|slang|informal|vulgar)\b[^)]*\)/i;

const EDGE = /^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu;
/** A text as it's matched: lower case, apostrophes alike, each word without the punctuation around it. */
export const keyOf = (text) =>
  String(text ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/\s+/)
    .map((word) => word.replace(EDGE, ""))
    .filter(Boolean)
    .join(" ");
/**
 * The same without accents: what's tried when the exact key finds nothing ("cafe" for "café"). Only the accents any
 * script shares go (the Inherited marks: Latin, Greek and Cyrillic accents); a script's own marks are its letters' vowels
 * and stay (Hindi का, के and की are three words).
 */
const looseOf = (key) => key.normalize("NFD").replace(/(?=\p{M})\p{Script=Inherited}|[\u200C\u200D]/gu, "");

/** How an English gloss is looked up: "to go (by car, train or bike)" → ["go"]; "the book" → ["book"]. */
export function glossKeys(gloss) {
  const plain = String(gloss ?? "").replace(/\([^)]*\)/g, " ");
  return [...new Set(plain.split(/[,;/]|\bor\b/).map((part) => keyOf(part).replace(/^(?:to|the|a|an) /, "")).filter(Boolean))];
}

// A language written without spaces (Japanese, Chinese): its sentences join their words with nothing, and a text typed
// in it is split into the words the index knows.
const joined = (language) => LANGUAGES[language]?.separator === "";
const sentenceOf = (item, language) => item.words.map(([text]) => text).join(joined(language) ? "" : " ") + (item.punct ?? "");

/**
 * A text in a language written without spaces, as words: at each place the longest the index knows (a word as
 * written, or a phrase), else one character. The index's own words, so the split never depends on the device.
 */
function splitJoined(text, L) {
  const chars = [...text.replace(/\s+/g, "")];
  const known = (piece) => Boolean(L && (L.forms.has(piece) || L.phrases.has(piece)));
  const words = [];
  for (let i = 0; i < chars.length; ) {
    let n = Math.min(40, chars.length - i);
    while (n > 1 && !known(chars.slice(i, i + n).join(""))) n--;
    words.push(chars.slice(i, i + n).join(""));
    i += n;
  }
  return words;
}
/** A word or gloss without the punctuation a book's token carries ("deur." → "deur", "“Hello," → "Hello"). */
const bare = (token) => {
  const text = String(token ?? "").trim();
  const [lead, trail] = frameOf(text);
  return text.slice(lead.length, text.length - trail.length || undefined) || text;
};

/**
 * A book and one of its layers as a source (both checked with book-format.js first), when the layer joins a language
 * and English: a help layer (the book in the language, its English sentence by sentence and word by word) or a weave
 * from English (the book in English, the language's sentence and its words in their order). Credits the book's rights
 * and the layer's. Returns null for any other pair.
 */
export function bookSource(book, layer) {
  if (!book || !layer || !Array.isArray(book.sentences) || !Array.isArray(layer.sentences)) return null;
  const help = layer.kind === "help" && layer.to === "en" && book.lang !== "en";
  const woven = layer.kind === "weave" && book.lang === "en" && layer.to !== "en";
  if (!help && !woven) return null;
  const language = help ? book.lang : layer.to;
  if (!Object.hasOwn(LANGUAGES, language)) return null;
  const lower = LANGUAGES[language].lemmaCase === "lower";
  const asWritten = (form) => (lower ? bare(form).toLowerCase() : bare(form));
  const sentences = [];
  layer.sentences.forEach((sentence, x) => {
    const [s, e] = book.sentences[x] ?? [];
    if (sentence?.s !== s || sentence.e !== e || typeof sentence.text !== "string") return;
    const bookText = joinWords(book.words.slice(s, e), LANGUAGES[book.lang].separator ?? " ", book.lang);
    if (help) {
      // t: [gloss, lemma] per book word, in the book's order.
      const words = (sentence.t ?? []).map(([gloss, lemma], j) => [asWritten(book.words[s + j]), lemma, lemma ? bare(gloss) : null]);
      sentences.push({ text: bookText, translation: sentence.text, words });
    } else {
      // m: [target, cue, sources, lemma] per word of the woven sentence, in its order; cue is the English it carries.
      const words = (sentence.m ?? []).map(([target, cue, , lemma]) => [asWritten(target), lemma, lemma ? bare(cue) : null]);
      sentences.push({ text: sentence.text, translation: bookText, words });
    }
  });
  const rights = book.rights ?? {};
  const by = rights.attributionText || (book.authors ?? []).map((a) => a.name).join(", ");
  const license = rights.spdx ? rights.licence : rights.us && rights.eu ? "Public domain" : (rights.licence ?? null);
  const credit = layerCredit(layer);
  const translation = credit ? `${help ? "English" : LANGUAGES[language].name}: ${credit}${layer.licence ? ` (${layer.licence})` : ""}` : null;
  return {
    // One source per layer: an English book woven into two languages is two sources, each with its own credit.
    id: `book:${book.id}:${language}`,
    kind: "book",
    name: book.title,
    credit: [by, translation].filter(Boolean).join(" · "),
    ...(license ? { license } : {}),
    language,
    sentences,
  };
}

function emptyLanguage() {
  return {
    sentences: new Map(), // key of a sentence in the language → [entry]: { text, translation, item, source, words }
    english: new Map(), // key of its English → [entry]
    phrases: new Map(), // key of a phrase → [{ text, en, source }]
    phrasesEn: new Map(), // key of its English → [{ text, en, source }]
    glosses: new Map(), // lemma → [{ lemma, en, source, form? }] (form: the word as a book glossed it)
    byGloss: new Map(), // key of an English gloss → [{ lemma, en, source, form? }]
    forms: new Map(), // key of a word as written → Map(lemma → { source, uses }): uses, the sentences using it as that word
    uses: new Map(), // lemma → how many sentences use it
    rank: new Map(), // lemma → its place in the language's word series, which is in frequency order (buildIndex)
    count: 0, // sentences read
    examples: new Map(), // lemma → [entry]
  };
}

/** Builds the index of every source given (see the top). */
/** The index of these sources, made at once (buildIndexSteps run to its end). */
export function buildIndex(sources) {
  const steps = buildIndexSteps(sources);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * The index made a piece at a time (a generator: it yields every BUILD_PIECE sentences, glossary words or phrases, about 2 ms of work; its
 * return value is the index), so the worker that makes
 * it can take its other messages between pieces: a whole index took 0.3–0.5 s here and about 1 s on an older iPhone (7 Nov 2026). The same
 * sources give the same index as buildIndex.
 */
export const BUILD_PIECE = 50;
export function* buildIndexSteps(sources) {
  let made = 0;
  const index = { languages: new Map(), sources: new Map() };
  const language = (code) => {
    if (!index.languages.has(code)) index.languages.set(code, emptyLanguage());
    return index.languages.get(code);
  };
  const push = (map, key, value, same, limit = TRANSLATE_LIMITS.perKey) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (list.length < limit && !list.some((v) => same(v, value))) list.push(value);
    map.set(key, list);
    const loose = looseOf(key);
    if (loose !== key) {
      const looseList = map.get(`~${loose}`) ?? [];
      if (looseList.length < limit && !looseList.some((v) => same(v, value))) looseList.push(value);
      map.set(`~${loose}`, looseList);
    }
  };
  const sameEntry = (a, b) => a.text === b.text && a.translation === b.translation;
  const sameMeaning = (a, b) => a.lemma === b.lemma && (a.form ?? a.lemma) === (b.form ?? b.lemma) && keyOf(a.en) === keyOf(b.en);
  const samePhrase = (a, b) => a.text === b.text;
  // uses: 1 for a sentence's word, 0 for a word only listed in a glossary.
  const form = (L, written, lemma, source, uses = 1) => {
    for (const key of [keyOf(written), `~${looseOf(keyOf(written))}`]) {
      if (!key || key === "~") continue;
      const lemmas = L.forms.get(key) ?? new Map();
      const entry = lemmas.get(lemma) ?? { source, uses: 0 };
      entry.uses += uses;
      lemmas.set(lemma, entry);
      L.forms.set(key, lemmas);
    }
    if (uses) L.uses.set(lemma, (L.uses.get(lemma) ?? 0) + uses);
  };
  const meaning = (L, lemma, en, source, form) => {
    const entry = { lemma, en, source, ...(form && form !== lemma ? { form } : {}) };
    push(L.glosses, lemma, entry, sameMeaning, TRANSLATE_LIMITS.perKey);
    for (const key of glossKeys(en)) push(L.byGloss, key, entry, sameMeaning);
  };
  // A lemma's example sentences, at most examplesOne: its own sentences (own: true) before the others, so a word's own
  // sentence is always kept, however many sentences before it use the word.
  const example = (L, lemma, entry, own) => {
    const list = L.examples.get(lemma) ?? [];
    if (list.some((v) => sameEntry(v, entry))) return;
    if (own) {
      const at = list.findIndex((v) => !v.own);
      list.splice(at < 0 ? list.length : at, 0, { ...entry, own: true });
      if (list.length > TRANSLATE_LIMITS.examplesOne) {
        const last = list.findLastIndex((v) => !v.own);
        if (last >= 0) list.splice(last, 1);
        else list.pop();
      }
    } else if (list.length < TRANSLATE_LIMITS.examplesOne) list.push(entry);
    L.examples.set(lemma, list);
  };

  // How common a word is: its place in a word series, which goes by frequency, the series taken by name. Nothing else has a say where
  // a language has one: a lesson pack's order is about teaching and changes whenever lessons are rebuilt, and a shared pack could put
  // anything first. A language with no series goes by its other packs, lessons left out.
  const ranking = [...sources].filter((s) => s?.id && s.language && Object.hasOwn(LANGUAGES, s.language) && s.items).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const isSeries = (s) => /^pack:words-/.test(s.id) && s.credit === "Lexicommons";
  const withSeries = new Set(ranking.filter(isSeries).map((s) => s.language));
  for (const source of ranking) {
    if (withSeries.has(source.language) ? !isSeries(source) : /^pack:path-/.test(source.id)) continue;
    const L = language(source.language);
    for (const item of source.items) {
      const own = Number.isInteger(item.gap?.index) ? item.words?.[item.gap.index]?.[1] : null;
      if (own && !L.rank.has(own)) L.rank.set(own, L.rank.size + 1);
    }
  }
  for (const source of sources) {
    if (!source?.id || !source.language || !Object.hasOwn(LANGUAGES, source.language)) continue;
    index.sources.set(source.id, { id: source.id, kind: source.kind, name: source.name, credit: source.credit, ...(source.license ? { license: source.license } : {}) });
    const L = language(source.language);
    for (const item of source.items ?? []) {
      if (++made % BUILD_PIECE === 0) yield;
      // Translate reads what's said in words, with what it means. (A plain item from a deck may have anything on its text.)
      if (!item.words || !item.means) continue;
      const text = sentenceOf(item, source.language);
      // Its words with what each means: the pack's glossary (a pack has no gloss per form).
      const words = item.words.map(([written, lemma]) => [written, lemma, lemma ? (source.words?.[lemma] ?? null) : null]);
      const entry = { text, translation: item.means, item, source: source.id, words };
      push(L.sentences, keyOf(text), entry, sameEntry);
      push(L.english, keyOf(item.means), entry, sameEntry);
      // The word the sentence was written for: its gap's.
      const own = Number.isInteger(item.gap?.index) ? (item.words[item.gap.index]?.[1] ?? null) : null;
      L.count++;
      for (const [written, lemma] of item.words) {
        if (!lemma) continue;
        form(L, written, lemma, source.id);
        example(L, lemma, entry, lemma === own);
      }
    }
    for (const [lemma, gloss] of Object.entries(source.words ?? {})) {
      if (++made % BUILD_PIECE === 0) yield;
      form(L, lemma, lemma, source.id, 0);
      meaning(L, lemma, gloss, source.id);
    }
    for (const chunk of Object.values(source.chunks ?? {})) {
      if (++made % BUILD_PIECE === 0) yield;
      if (!chunk?.text || !chunk.en) continue;
      const entry = { text: chunk.text, en: chunk.en, source: source.id };
      push(L.phrases, keyOf(chunk.text), entry, samePhrase);
      push(L.phrasesEn, keyOf(chunk.en), entry, samePhrase);
    }
    for (const pair of source.sentences ?? []) {
      if (++made % BUILD_PIECE === 0) yield;
      if (!pair?.text || !pair.translation) continue;
      const entry = { text: pair.text, translation: pair.translation, item: null, source: source.id, words: pair.words ?? [] };
      L.count++;
      push(L.sentences, keyOf(pair.text), entry, sameEntry);
      push(L.english, keyOf(pair.translation), entry, sameEntry);
      for (const [written, lemma, gloss] of pair.words ?? []) {
        if (!lemma) continue;
        form(L, written, lemma, source.id);
        if (gloss) meaning(L, lemma, gloss, source.id, written);
        example(L, lemma, entry, false);
      }
    }
  }
  return index;
}

/** The languages an index has anything for. */
export const indexLanguages = (index) => [...index.languages.keys()];

const lookup = (map, key) => map.get(key) ?? map.get(`~${looseOf(key)}`) ?? [];

/** One direction's search: toEnglish (the text is in `language`) or from English. */
function searchOne(index, text, language, toEnglish) {
  const L = index.languages.get(language);
  const used = new Set();
  const out = { whole: null, words: [], sentences: [], unknown: [], used, found: 0, tokens: [], alternatives: [], firstGuesses: [], main: [] };
  const written = toEnglish && joined(language);
  const query = written ? keyOf(text).replace(/ /g, "") : keyOf(text);
  const tokens = written ? splitJoined(query, L) : query.split(" ").filter(Boolean);
  const glue = written ? "" : " ";
  out.tokens = tokens;
  const little = toEnglish ? new Set((LANGUAGES[language]?.stray ?? []).map((w) => keyOf(w))) : ENGLISH_LITTLE;
  // Nothing for this language here: every word typed is one it can't find.
  if (!L) {
    out.unknown = tokens.filter((token) => !little.has(token));
    return out;
  }
  const wholes = lookup(toEnglish ? L.sentences : L.english, query);
  const whole = wholes[0];
  const lemmas = [];
  if (whole) {
    out.whole = { text: whole.text, translation: whole.translation, item: whole.item, source: whole.source };
    used.add(whole.source);
    out.found = tokens.length;
    // The other sentences it could be: the next guesses.
    for (const other of wholes.slice(1)) {
      out.alternatives.push({ sentence: true, text: other.text, translation: other.translation, item: other.item, source: other.source });
      used.add(other.source);
    }
    // Its own words, each with what it means in this sentence (else the dictionary form's meaning, from wherever).
    for (const [j, [written, lemma, gloss]] of whole.words.entries()) {
      if (!lemma) continue;
      const fallback = gloss ? null : (L.glosses.get(lemma) ?? [])[0];
      out.words.push({ text: written.replace(EDGE, ""), lemma, en: gloss ?? fallback?.en ?? null, source: fallback ? fallback.source : whole.source, at: j, span: 1 });
      if (fallback) used.add(fallback.source);
      if (!lemmas.includes(lemma)) lemmas.push(lemma);
    }
  }
  const phrases = toEnglish ? L.phrases : L.phrasesEn;
  const asPhrase = (entry) => ({ text: entry.text, lemma: null, en: entry.en, source: entry.source });
  const asMeaning = (m) => ({ text: m.form ?? m.lemma, lemma: m.lemma, en: m.en, source: m.source, formSource: m.formSource });
  for (let i = whole ? tokens.length : 0; i < tokens.length; ) {
    const span = (n) => tokens.slice(i, i + n).join(glue);
    // The longest phrase first; from English, the longest gloss of more than one word too ("ice cream").
    let hit = null;
    for (let n = Math.min(TRANSLATE_LIMITS.phrase, tokens.length - i); n >= 2 && !hit; n--) {
      const phrase = lookup(phrases, span(n))[0];
      const glossed = !phrase && !toEnglish ? lookup(L.byGloss, span(n).replace(/^(?:to|the|a|an) /, ""))[0] : null;
      if (phrase) hit = { n, words: [asPhrase(phrase)] };
      else if (glossed) hit = { n, words: [asMeaning(glossed)] };
    }
    if (!hit) {
      const all = wordAt(tokens[i]);
      const shown = tokens.length > 1 ? 1 : TRANSLATE_LIMITS.meanings;
      hit = { n: 1, words: all.slice(0, shown) };
      // Its other readings: the next guesses (a lemma the words above don't show, or another meaning of one).
      for (const { formSource, ...word } of all.slice(shown)) {
        if (word.lemma && out.alternatives.some((a) => a.at === i && a.lemma === word.lemma && a.en === word.en)) continue;
        out.alternatives.push({ ...word, at: i, span: 1 });
        used.add(word.source);
      }
    }
    if (hit.words.length) {
      for (const { formSource, ...word } of hit.words) {
        out.words.push({ ...word, at: i, span: hit.n });
        used.add(word.source);
        if (formSource && formSource !== word.source) used.add(formSource);
        if (word.lemma && !lemmas.includes(word.lemma)) lemmas.push(word.lemma);
      }
      out.found += hit.n;
      i += hit.n;
      continue;
    }
    if (!little.has(tokens[i])) out.unknown.push(tokens[i]);
    i++;
  }

  /** One typed word's meanings (a phrase of one word when nothing else has it). */
  function wordAt(token) {
    let meanings = [];
    if (toEnglish) {
      const lemmasOf = L.forms.get(token) ?? L.forms.get(`~${looseOf(token)}`) ?? new Map();
      // The word the packs use this form as most, first (loopt: lopen, not aflopen); a tie goes to the word that is the
      // form itself (af: af, not afvragen), then to the first seen.
      // A word typed alone can't be a separated verb: in isn't inpakken.
      const particle = tokens.length === 1 && READINGS[language]?.particles?.includes(token);
      const ranked = [...lemmasOf].filter(([lemma]) => !(particle && keyOf(lemma) !== token && keyOf(lemma).startsWith(token))).sort(([a, x], [b, y]) => y.uses - x.uses || Number(keyOf(b) === token) - Number(keyOf(a) === token));
      for (const [lemma, { source: formSource }] of ranked) {
        const glosses = L.glosses.get(lemma) ?? [];
        for (const g of glosses) meanings.push({ ...g, formSource });
        if (!glosses.length && L.examples.has(lemma)) meanings.push({ lemma, en: null, source: formSource });
      }
      // What this very form means first (a book's gloss of it), then the dictionary form's; another form's gloss
      // ("leest: reads" for "gelezen") only when there's nothing better.
      const rank = (m) => (m.form ? (keyOf(m.form) === token ? 0 : 2) : 1);
      meanings.sort((a, b) => rank(a) - rank(b));
      if (meanings.length && rank(meanings[0]) < 2) meanings = meanings.filter((m) => rank(m) < 2);
    } else {
      // English's own forms of its few irregular verbs (is: be): their gloss is the dictionary form.
      const looked = lookup(L.byGloss, token);
      const gloss = looked.length ? token : (ENGLISH_BASE[token] ?? token);
      // The commonest word for it: by the word's frequency, a meaning further down its gloss counting against it, and a
      // regional or playful word most of all (hi: hoi, then hallo; map: kaart over plattegrond).
      const calls = READINGS[language];
      const called = calls?.same?.includes(gloss);
      const chosen = calls?.lead?.[gloss] ?? calls?.two?.[gloss]?.to;
      const score = (m) => {
        // The language's word spelled the same (bank) isn't marked down for where its gloss says so, and leads if it's a
        // loanword the language uses every day; a word the table chooses leads over all (readings.js).
        const self = keyOf(m.lemma) === gloss;
        if (m.lemma === chosen || (self && called)) return Infinity;
        const at = self ? 0 : glossKeys(m.en).indexOf(gloss);
        return -Math.log10(L.rank.get(m.lemma) ?? 50_000) - 0.5 * Math.max(at, 0) - (ASIDE.test(m.en) ? 1 : 0);
      };
      const pool = [...(looked.length ? looked : lookup(L.byGloss, gloss))];
      if (chosen && !pool.some((m) => m.lemma === chosen)) pool.push(...(L.glosses.get(chosen) ?? []).slice(0, 1));
      meanings = pool.sort((a, b) => score(b) - score(a));
    }
    meanings = meanings.slice(0, TRANSLATE_LIMITS.meanings + TRANSLATE_LIMITS.alternatives);
    if (meanings.length) return meanings.map(asMeaning);
    const phrase = lookup(phrases, token)[0];
    return phrase ? [asPhrase(phrase)] : [];
  }
  // Examples: sentences that use what was found, not the whole match: each word's own first, then a pack's (they have
  // the literal line), then a book's. More of them when what was typed is one thing.
  const seen = new Set(out.whole ? [out.whole.text] : []);
  const limit = aboutOne(out.words, out.unknown, out.whole) ? TRANSLATE_LIMITS.examplesOne : TRANSLATE_LIMITS.examples;
  // One thing typed: the next guesses' sentences too, so it shows as many as there are, up to the limit.
  const pool = limit === TRANSLATE_LIMITS.examplesOne ? [...lemmas, ...out.alternatives.flatMap((a) => (a.lemma && !lemmas.includes(a.lemma) ? [a.lemma] : []))] : lemmas;
  const examples = pool.flatMap((lemma) => L.examples.get(lemma) ?? []).sort((a, b) => Number(Boolean(b.own)) - Number(Boolean(a.own)) || Number(Boolean(b.item)) - Number(Boolean(a.item)));
  for (const entry of examples) {
    if (out.sentences.length >= limit || seen.has(entry.text)) continue;
    seen.add(entry.text);
    out.sentences.push({ item: entry.item, text: entry.text, natural: entry.translation, source: entry.source, ...(entry.own ? { own: true } : {}) });
    used.add(entry.source);
  }
  out.alternatives = out.alternatives.slice(0, TRANSLATE_LIMITS.alternatives);
  // What a language's table says comes first among the next guesses.
  out.firstGuesses = tokens.length !== 1 ? [] : (READINGS[language]?.firstGuess?.[tokens[0]] ?? []).flatMap((spec) => {
    const lemma = typeof spec === "string" ? spec : spec.lemma;
    const gloss = (L.glosses.get(lemma) ?? [])[0];
    const en = typeof spec === "string" ? gloss?.en : spec.en;
    return en ? [{ text: lemma, lemma, en, source: gloss?.source ?? null, at: 0, span: 1 }] : [];
  });
  out.main = mainWords(L, out, little, toEnglish);
  for (const word of out.main) for (const s of word.sentences) used.add(s.source);
  return out;
}

/**
 * A result's main words (see the top): one per lemma, in the order typed. A word used in over 2% of the sentences (at
 * least 20) is taken for a very common one, as are the language's and English's little words; when that leaves nothing,
 * or one thing was typed, they're what there is. Over the limit, the rarest stay.
 */
function mainWords(L, out, little, toEnglish) {
  const sentencesOf = (lemma) =>
    (L.examples.get(lemma) ?? [])
      .filter((entry) => entry.text !== out.whole?.text)
      .map((entry) => ({ item: entry.item, text: entry.text, natural: entry.translation, source: entry.source, ...(entry.own ? { own: true } : {}) }));
  const seen = new Set();
  const words = [];
  for (const word of out.words) {
    if (!word.lemma || seen.has(word.lemma)) continue;
    seen.add(word.lemma);
    words.push(word);
  }
  const uses = (word) => L.uses.get(word.lemma) ?? 0;
  const common = Math.max(20, L.count * 0.02);
  // With a whole sentence its words are the language's, whichever way it was typed; else what was typed tells.
  const isLittle = (word) => (out.whole ? toEnglish && little.has(keyOf(word.text)) : little.has(out.tokens[word.at ?? 0]));
  let main = words.filter((word) => !isLittle(word) && uses(word) <= common);
  if (!main.length) main = words;
  const keep = new Set([...main].sort((a, b) => uses(a) - uses(b)).slice(0, TRANSLATE_LIMITS.mainWords));
  return main
    .filter((word) => keep.has(word))
    .map((word) => ({ lemma: word.lemma, text: word.text, en: word.en, source: word.source, at: word.at ?? 0, sentences: sentencesOf(word.lemma) }));
}
/** A gloss's first sense, as a word-by-word line says it: "to want" → "want", "a, an; one" → "a", "beer (a glass)" → "beer". */
export function firstSense(gloss) {
  if (gloss == null) return null;
  const plain = String(gloss).replace(/\([^)]*\)/g, " ");
  const first = plain.split(/[,;/]|\bor\b/).map((part) => part.trim()).find(Boolean);
  return first ? first.replace(/^to\s+/i, "") : null;
}

/** A result's next best guesses in order: what the language's table puts first, then the rest, none that the best guess shows. */
export function nextGuesses(result) {
  const best = bestGuess(result);
  const one = best.kind === "word" || best.kind === "same" || best.kind === "two";
  const shown = best.kind === "two" ? best.readings : best.kind === "word" || best.kind === "same" ? [result.words[0]] : [];
  const same = (a, b) => (a.sentence ? a.text === b.text : !b.sentence && a.lemma === b.lemma && a.text === b.text);
  const first = result.firstGuesses ?? [];
  const list = [...first, ...(one ? result.words : []), ...(result.alternatives ?? [])];
  return list.filter((guess, i) => {
    if (first.includes(guess)) return true;
    if (shown.some((word) => word && same(word, guess) && !first.some((f) => same(f, word)))) return false;
    return list.findIndex((other) => same(other, guess)) === i;
  });
}

/**
 * What a result says first:
 *   { kind: "sentence", rough: false, text, said, whole }   a whole sentence found: text its translation, said the side
 *                                                           that's in the language (what a voice reads in it)
 *   { kind: "word", rough: false, word }                    one thing typed: its best reading (result.words[0])
 *   { kind: "same", rough: false, word, text }              one word in both languages (text: as typed)
 *   { kind: "two", rough: false, readings: [nl, en] }       spelled the same, different words: both
 *   { kind: "line", rough: true, parts: [{ text, found }] } several: word by word, in the order typed, what wasn't found
 *                                                           as it was typed (found: false)
 *   { kind: "none", rough: false }                          nothing found
 */
export function bestGuess(result) {
  if (result.whole) {
    const fromEnglish = result.from === "en";
    return { kind: "sentence", rough: false, text: fromEnglish ? result.whole.text : result.whole.translation, said: result.whole.text, whole: result.whole };
  }
  if (!result.words.length) return { kind: "none", rough: false };
  if (result.reading === "same") return { kind: "same", rough: false, word: result.words[0], text: result.query };
  if (result.reading === "two") return { kind: "two", rough: false, readings: result.readings };
  if (aboutOne(result.words, result.unknown, null)) return { kind: "word", rough: false, word: result.words[0] };
  const glue = result.to === "en" ? " " : (LANGUAGES[result.to]?.separator ?? " ");
  const toEnglish = result.from !== "en";
  const parts = [];
  const tokens = result.tokens ?? [];
  for (let i = 0; i < tokens.length; ) {
    const word = result.words.find((w) => (w.at ?? 0) === i);
    if (word) {
      parts.push({ text: toEnglish ? (word.lemma ? firstSense(word.en) : word.en) ?? word.text : word.text, found: true, at: i, lemma: word.lemma ?? null });
      i += word.span ?? 1;
    } else {
      // A little word nothing has ("to") isn't missed; anything else is shown as typed and marked.
      if (result.unknown.includes(tokens[i])) parts.push({ text: tokens[i], found: false, at: i, lemma: null });
      i++;
    }
  }
  return { kind: "line", rough: true, parts, glue };
}

/**
 * Searches an index (see the top). from and to: "en" and a language code; either left out, the direction is the one
 * that finds more of what was typed (language: the one to try when nothing says).
 */
export function search(index, text, { from, to, language } = {}) {
  const query = String(text ?? "").trim().slice(0, TRANSLATE_LIMITS.query);
  if (!query) return null;
  const other = (from && from !== "en" ? from : to && to !== "en" ? to : language) ?? indexLanguages(index)[0];
  let toEnglish;
  if (from) toEnglish = from !== "en";
  else if (to) toEnglish = to === "en";
  let result;
  let both = false;
  let reading = null;
  let readings = null;
  let led = false;
  if (toEnglish === undefined) {
    const there = searchOne(index, query, other, true);
    const back = searchOne(index, query, other, false);
    // One thing typed that's a word both ways, each found whole (hi: Dutch says hi too, and English hi is hoi, hallo …):
    // both readings, the language's first, every word's own sentence before the rest.
    both = there.found > 0 && there.found === back.found && aboutOne(there.words, there.unknown, there.whole) && aboutOne(back.words, back.unknown, back.whole);
    toEnglish = there.found >= back.found;
    result = both ? bothWays(there, back) : toEnglish ? there : back;
    if (both) {
      const sides = readSides(query, there, back, other);
      if (sides === "led") {
        // The language has this word, but a commoner one says it: from English, with the word itself among the next guesses.
        both = false;
        led = true;
        toEnglish = false;
        result = back;
      } else {
        reading = sides;
        if (sides === "two") {
          const means = READINGS[other]?.two?.[keyOf(query)]?.means;
          readings = [means ? { ...there.words[0], en: means } : there.words[0], [...back.words, ...back.alternatives].find((w) => !w.sentence)];
        }
      }
    }
  } else result = searchOne(index, query, other, toEnglish);
  return {
    query,
    ...(both ? { both: true } : {}),
    ...(reading ? { reading } : {}),
    ...(readings ? { readings } : {}),
    ...(led ? { led: true } : {}),
    from: toEnglish ? other : "en",
    to: toEnglish ? "en" : other,
    whole: result.whole,
    words: result.words,
    sentences: result.sentences,
    unknown: result.unknown,
    sources: [...result.used].map((id) => index.sources.get(id)).filter(Boolean),
    found: result.found,
    tokens: result.tokens,
    alternatives: result.alternatives,
    firstGuesses: result.firstGuesses ?? [],
    main: result.main,
  };
}

/**
 * This device's look at what was typed, the index's side of translate.js: { result } with a direction given or one that
 * finds more, or one word that's a word both ways; { tied: true, there, back } when the two ways find the same (nothing
 * found, most often), for the server, knowing more, to say which way.
 */
export function lookBothWays(index, text, { from, to, language } = {}) {
  const other = from && from !== "en" ? from : to && to !== "en" ? to : language;
  if (from || to) return { result: search(index, text, (from ?? (to === "en" ? other : "en")) === "en" ? { from: "en", to: other } : { from: other, to: "en" }) };
  const there = search(index, text, { from: other, to: "en" });
  const back = search(index, text, { from: "en", to: other });
  if (!there || !back) return { result: null };
  if (there.found !== back.found) return { result: there.found > back.found ? there : back };
  const either = there.found ? search(index, text, { language: other }) : null;
  if (either?.both || either?.led) return { result: either };
  return { tied: true, there, back };
}

/**
 * One word found both ways: is it one word in both, or two? The language's word that means what was typed is the same word
 * ("same") unless English has a commoner one for it ("led": hi). If it means something else, they're two words ("two": die).
 */
function readSides(query, there, back, language) {
  const token = keyOf(query);
  const calls = READINGS[language];
  if (calls?.two?.[token]) return "two";
  if (calls?.lead?.[token]) return "led";
  if (calls?.same?.includes(token)) return "same";
  const word = there.words[0];
  // Its gloss says it, on its own or as a word of a meaning (student: "college student").
  const says = (key) => glossKeys(word.en).some((gloss) => gloss === key || gloss.split(" ").includes(key));
  const meansIt = says(token) || (ENGLISH_BASE[token] && says(ENGLISH_BASE[token]));
  if (!meansIt) return "two";
  const lead = [...back.words, ...back.alternatives].find((w) => !w.sentence);
  return !lead || lead.lemma === word.lemma || keyOf(lead.text) === token ? "same" : "led";
}

/** One word's two readings as one result (search, when no direction is given): the language's words, then English's
 * not already there, and the sentences of both, own sentences first, up to examplesOne. */
function bothWays(there, back) {
  const words = [...there.words];
  for (const w of back.words) if (!words.some((v) => v.text === w.text && keyOf(v.en) === keyOf(w.en))) words.push(w);
  const sentences = [];
  for (const s of ownFirst([...there.sentences, ...back.sentences])) if (sentences.length < TRANSLATE_LIMITS.examplesOne && !sentences.some((v) => v.text === s.text)) sentences.push(s);
  const alternatives = [...there.alternatives, ...back.alternatives].slice(0, TRANSLATE_LIMITS.alternatives);
  const main = [...there.main, ...back.main.filter((m) => !there.main.some((v) => v.lemma === m.lemma))].slice(0, TRANSLATE_LIMITS.mainWords);
  return { whole: null, words, sentences, unknown: [], used: new Set([...there.used, ...back.used]), found: there.found, tokens: there.tokens, alternatives, firstGuesses: there.firstGuesses.length ? there.firstGuesses : back.firstGuesses, main };
}

/** Words placed by `from`'s tokens, put on `tokens` by the characters they cover: the same text split two ways. The same
 * list when the tokens are the same, or aren't the same text (results for different queries keep their places). */
function placedOn(tokens, from, words) {
  if (!tokens || !from || (tokens.length === from.length && tokens.every((t, i) => t === from[i])) || tokens.join("") !== from.join("")) return words;
  const startsOf = (list) => list.reduce((out, t, i) => [...out, i ? out[i - 1] + list[i - 1].length : 0], []);
  const starts = startsOf(tokens);
  const fromStarts = startsOf(from);
  const out = [];
  for (const w of words) {
    const at = w.at ?? 0;
    const last = at + (w.span ?? 1) - 1;
    if (fromStarts[at] === undefined || from[last] === undefined) continue;
    const start = fromStarts[at];
    const end = fromStarts[last] + from[last].length;
    const i = starts.indexOf(start);
    let j = i;
    while (j >= 0 && j < tokens.length - 1 && starts[j] + tokens[j].length < end) j++;
    if (i < 0 || starts[j] + tokens[j].length !== end) continue;
    out.push({ ...w, at: i, span: j - i + 1 });
  }
  return out;
}

/**
 * Two results for the same query and direction merged (the device's and the server's). A whole sentence found wins
 * with its own words (the first's if both found one). Otherwise the words go in the order typed: where the first found
 * a word the second's isn't added (for one word typed, its other meanings are, up to three), and the second fills the
 * places the first didn't find. Sentences: every own sentence first, then the first's, then the second's, up to the
 * limit (examplesOne when what was typed is one thing).
 */
export function mergeResults(first, second) {
  if (!first) return second;
  if (!second) return first;
  // A word's place is a token's, and two indexes can split a language written without spaces differently (the device
  // knowing 猫 alone splits 食べる猫 one way, the server knowing 食べる too, another): the second's words are put on the
  // first's tokens by the characters they cover first, and one that can't be is left out of the words.
  const placed = placedOn(first.tokens, second.tokens, second.words);
  if (placed !== second.words) second = { ...second, words: placed };
  const whole = first.whole ?? second.whole;
  let words;
  if (first.whole) words = first.words;
  else if (second.whole) words = second.words;
  else {
    const covers = (w) => Array.from({ length: w.span ?? 1 }, (_, k) => (w.at ?? 0) + k);
    const taken = new Set(first.words.flatMap(covers));
    const one = keyOf(first.query).split(" ").length === 1;
    words = [...first.words];
    for (const w of second.words) {
      const same = words.some((v) => v.at === w.at && v.text === w.text && keyOf(v.en) === keyOf(w.en));
      const free = covers(w).every((at) => !taken.has(at));
      if (!same && (free || (one && words.length < TRANSLATE_LIMITS.meanings))) words.push(w);
    }
    words = words.map((w, k) => [w, k]).sort(([a, ka], [b, kb]) => (a.at ?? 0) - (b.at ?? 0) || ka - kb).map(([w]) => w);
  }
  const covered = new Set(words.flatMap((w) => Array.from({ length: w.span ?? 1 }, (_, k) => (w.at ?? 0) + k)));
  const unknown = whole ? [] : first.unknown.filter((u) => second.unknown.includes(u));
  // Every own sentence first (the device may not have the pack that has a word's own), then the first's, then the second's.
  const limit = aboutOne(words, unknown, whole) ? TRANSLATE_LIMITS.examplesOne : TRANSLATE_LIMITS.examples;
  const sentences = [];
  for (const s of ownFirst([...first.sentences, ...second.sentences])) if (sentences.length < limit && !sentences.some((v) => v.text === s.text)) sentences.push(s);
  const found = whole ? Math.max(first.found ?? 0, second.found ?? 0) : covered.size;
  // Every source either one credits (one that only found a word's dictionary form included).
  const sources = [...first.sources, ...second.sources].filter((s, i, all) => all.findIndex((t) => t.id === s.id) === i);
  // The next guesses: the first's, then the second's, none that's already shown or listed. What the first found first
  // (the device's), with the server's main words filling in what it hasn't and each word's sentences kept to the device's
  // when it has any.
  const sameAlternative = (a, b) => (a.sentence ? Boolean(b.sentence) && a.text === b.text : !b.sentence && a.lemma === b.lemma && a.text === b.text && keyOf(a.en) === keyOf(b.en));
  const alternatives = [];
  const secondWords = whole ? [] : second.words;
  for (const a of [...(first.alternatives ?? []), ...secondWords, ...(second.alternatives ?? [])]) {
    if (alternatives.length >= TRANSLATE_LIMITS.alternatives) break;
    if (alternatives.some((v) => sameAlternative(v, a))) continue;
    if (!a.sentence && words.some((w) => w.lemma === a.lemma && w.text === a.text && keyOf(w.en) === keyOf(a.en))) continue;
    alternatives.push(a);
  }
  const main = (first.main ?? []).map((m) => (m.sentences.length ? m : { ...m, sentences: second.main?.find((v) => v.lemma === m.lemma)?.sentences ?? [] }));
  for (const m of second.main ?? []) if (main.length < TRANSLATE_LIMITS.mainWords && !main.some((v) => v.lemma === m.lemma) && words.some((w) => w.lemma === m.lemma)) main.push(m);
  main.sort((a, b) => a.at - b.at);
  return { ...first, whole, words, sentences, unknown, sources, found, alternatives, firstGuesses: first.firstGuesses?.length ? first.firstGuesses : (second.firstGuesses ?? []), main };
}
