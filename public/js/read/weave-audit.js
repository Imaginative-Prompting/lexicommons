// The weave audit: deterministic, no model, the whole weave. It renders the weave the way the reader does
// (weaveSentence and helpSentence, from book-format.js) for several sets of known words, and counts what a learner
// would hit. Three invariants must be zero; everything else is reported for a person to look at, because each of those
// checks can also flag right answers (that's why they're here and not in the validator).
//
// Pure (no files, no DOM), so the CLI (scripts/books/weave-audit.mjs), the books pipeline's publish step and the
// Worker's library publishing all run the same audit.
//
// Banks: nothing known, the 100, 400 and 1,200 most frequent lemmas of this weave, and everything. Defects hide in
// the middle: with nothing known nothing substitutes, and with everything known every word does.
//
// auditWeave(book, weave, { keep, lexicon, samples }) returns { report, problems }: report.ok is true when the weave
// validates and its invariants are zero (its findings can still list things to read); problems are validateWeave's.
//   keep     the names the weave keeps in the book's language (a glossary's `keep`)
//   lexicon  { headwords, forms } for the language whose lemmas the layer banks (pipelines/books/lexicon.ts), or null
//   samples  how many examples each finding keeps (6)

import { frameOf, helpSentence, validateWeave, weaveSentence } from "./book-format.js";

// English do-support has no word in these languages; a "did" glossed as their "do" verb teaches a pattern they don't
// have. A heuristic (the main verb "did it" is right), so it's reported, not refused.
const DO_LEMMA = { nl: "doen", de: "tun", es: "hacer", fr: "faire" };
// "it" for a thing right after a preposition: Dutch says er (erover, ernaar), so a gloss of het or hem there is worth a
// look (it can be right for a person, so it's reported, not refused).
const AFTER_PREPOSITION = { nl: new Set(["het", "hij"]) };
const PREPOSITIONS = new Set(["about", "after", "against", "at", "behind", "by", "for", "from", "in", "into", "of", "off", "on", "onto", "out", "over", "through", "to", "towards", "under", "upon", "with", "without"]);
const SUBJECT = new Set(["i", "you", "he", "she", "it", "we", "they", "there"]);

const plain = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").replace(/’/g, "'").toLowerCase();
// An English contraction: its gloss is both words, but its lemma is one word's (the verb's), never the two joined.
const CONTRACTION = /(['’](ll|re|m|ve|d|s)|n['’]t)$/iu;
// A word's letters and digits alone, lowercase: what two words are compared by when one may carry punctuation (ir. and ir).
const bareWord = (text) => String(text ?? "").normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, "").toLowerCase();
const core = (word) => {
  const [lead, trail] = frameOf(word);
  return word.slice(lead.length, word.length - trail.length || undefined);
};

export async function auditWeave(book, weave, { keep: keepList = [], lexicon = null, samples = 6 } = {}) {
  const keep = new Set(keepList);
  const headwords = new Set(lexicon?.headwords ?? []);
  const formsOf = (form) => lexicon?.forms[form] ?? [];
  const report = { book: `${book.id}@${book.version}`, weave: `${weave.to} ${weave.made?.run ?? ""}`, invariants: {}, banks: {}, findings: {} };
  const find = (kind, item) => {
    const list = (report.findings[kind] ??= { count: 0, samples: [] });
    list.count++;
    if (list.samples.length < samples) list.samples.push(item);
  };

  const problems = await validateWeave(weave, book, { keep: [...keep] });
  report.valid = problems.length === 0;
  if (problems.length) report.validation = problems.slice(0, 20);

  // Banks, by how often each lemma appears in this weave.
  const frequency = new Map();
  for (const s of weave.sentences) for (const [, lemma] of s.t) if (lemma) frequency.set(lemma, (frequency.get(lemma) ?? 0) + 1);
  const ranked = [...frequency.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([lemma]) => lemma);
  const banks = { none: new Set(), top100: new Set(ranked.slice(0, 100)), top400: new Set(ranked.slice(0, 400)), top1200: new Set(ranked.slice(0, 1200)), all: new Set(ranked) };

  // A help layer (a book in the language being learned, glossed into the reader's) is read the other way round: a word
  // whose lemma you know shows as the book's own word, one you don't shows its gloss (weave mode). Same two invariants.
  const help = weave.kind === "help";

  // The invariants: a known word always shows in the language being learned, and an unknown one never does.
  let silent = 0;
  let leaked = 0;
  // And no target word shows twice in a row for two different book words ("tried encontrar encontrar"): two book words that share
  // one target word (to find, out of, put him) show it once only through the upgrade over them (a group's u); before it fires
  // they show it twice. Read in every bank, and at each such pair's own bank: just its two lemmas, the earliest a learner
  // knows both (a longer upgrade over the pair waits for every word in it). Two words the book repeats itself (lippity—
  // lippity) are no double, nor two with punctuation between them, two clauses (near him, he heard: cerca de él, él oyó).
  let doubled = 0;
  const shownTwice = new Set();
  const same = (a, b) => Boolean(bareWord(a)) && bareWord(a) === bareWord(b);
  const doublesIn = (view, x, bank) => {
    const shown = view.words.filter((piece) => piece.show !== "hidden");
    for (let k = 0; k + 1 < shown.length; k++) {
      const [a, b] = [shown[k], shown[k + 1]];
      if (a.show !== "target" || b.show !== "target" || !same(a.text, b.text)) continue;
      const [first, second] = [book.words[a.i], book.words[b.i]];
      if (same(first, second) || frameOf(first)[1]) continue;
      if (shownTwice.has(`${x}:${a.i}`)) continue;
      shownTwice.add(`${x}:${a.i}`);
      doubled++;
      find("doubled", { x, words: `${first} ${second}`, shown: `${a.text} ${b.text}`, bank });
    }
  };
  for (const [name, bank] of Object.entries(banks)) {
    let shown = 0;
    let learnable = 0;
    let flipped = 0;
    weave.sentences.forEach((sentence, x) => {
      const view = help ? helpSentence(sentence, book.words, bank, { mode: "weave" }) : weaveSentence(sentence, book.words, bank, { lang: weave.to, from: weave.from });
      if (!help) doublesIn(view, x, name);
      if (help ? view.known === view.total && view.total > 0 : weaveSentence(sentence, book.words, bank, { flipAt: 100 }).flipped) flipped++;
      view.words.forEach((piece, j) => {
        const lemma = sentence.t[j][1];
        if (!lemma) return;
        learnable++;
        const insideIdiom = view.idioms.some(({ k, len }) => j >= k && j < k + len);
        const learned = help ? "book" : "target";
        if (bank.has(lemma)) {
          if (piece.show === learned) shown++;
          else if (!insideIdiom) {
            silent++;
            find("known-but-silent", { x, word: book.words[sentence.s + j], lemma, bank: name });
          }
        } else if (help ? piece.show !== "help" && !insideIdiom : piece.show !== "en") {
          leaked++;
          find("unknown-shown", { x, word: book.words[sentence.s + j], lemma, bank: name });
        }
      });
    });
    report.banks[name] = { lemmas: bank.size, shownInTarget: learnable ? Math.round((shown / learnable) * 1000) / 10 : 0, sentencesFullyKnown: flipped };
    // (For a help layer, "in the target" means in the book's own language: the words you'd read without help.)
  }
  if (!help)
    weave.sentences.forEach((sentence, x) =>
      sentence.t.forEach(([target, lemma], j) => {
        const next = sentence.t[j + 1];
        if (!next || !lemma || !next[1] || !same(target, next[0])) return;
        doublesIn(weaveSentence(sentence, book.words, new Set([lemma, next[1]]), { lang: weave.to, from: weave.from }), x, `just ${lemma}, ${next[1]}`);
      }),
    );
  report.invariants = { "known-but-silent": silent, "unknown-shown": leaked, doubled };

  // Things to read.
  weave.sentences.forEach((sentence, x) => {
    const words = book.words.slice(sentence.s, sentence.e);
    const sourced = new Set(sentence.m.flatMap(([, , sources]) => sources));
    sentence.t.forEach(([target, lemma], j) => {
      const word = words[j];
      const w = core(word);
      const tc = core(target);
      if (!/\p{L}/u.test(w)) return;
      if (help) {
        // The lemma is the book word's own: is it a dictionary word, and is the book word one of its forms?
        if (lemma === null && !keep.has(w)) find("no-lemma", { x, word, target });
        if (lemma && !sourced.has(j)) find("not-in-natural-sentence", { x, word, target, lemma });
        if (lexicon && lemma) {
          const lower = plain(lemma);
          if (!headwords.has(lemma.toLowerCase()) && !headwords.has(lower)) find("lemma-not-in-lexicon", { x, word, target, lemma });
          const form = plain(w);
          if (form !== lower && !formsOf(form).some((l) => plain(l) === lower) && !lower.split(" ").includes(form)) find("word-not-a-form-of-lemma", { x, word, lemma });
        }
        return;
      }
      // A word left in English: fine for a name or English do-support, worth a look otherwise.
      if (lemma === null && !keep.has(w)) find("no-lemma", { x, word, target });
      // The literal line drops a word the per-word layer glosses.
      if (lemma && !sourced.has(j)) find("not-in-literal-line", { x, word, target, lemma });
      // A gloss spelled exactly like its English word: a cognate, or a word left untranslated.
      if (lemma && tc.toLowerCase() === w.toLowerCase() && !keep.has(w)) {
        const attested = lexicon ? formsOf(tc.toLowerCase()).length > 0 || headwords.has(tc.toLowerCase()) : null;
        if (lexicon ? !attested : true) find(lexicon ? "english-left-in" : "same-as-english", { x, word, target, lemma });
      }
      // A capital the English word doesn't have, mid-sentence.
      if (j > 0 && /^\p{Lu}/u.test(tc) && /^\p{Ll}/u.test(w) && !/[.!?…:]["”’)]*$/u.test(words[j - 1])) find("capital-added", { x, word, target });
      // "it" after a preposition glossed as a plain pronoun.
      const before = core(words[j - 1] ?? "").toLowerCase();
      if (w.toLowerCase() === "it" && PREPOSITIONS.has(before) && AFTER_PREPOSITION[weave.to]?.has(lemma)) find("it-after-preposition", { x, words: `${words[j - 1]} ${word}`, target, lemma });
      // English do-support glossed as the target's "do".
      const next = core(words[j + 1] ?? "").toLowerCase();
      if (/^(do|does|did)(n['’]t)?$/i.test(w) && SUBJECT.has(next) && lemma === DO_LEMMA[weave.to]) find("do-support-as-do", { x, words: `${word} ${words[j + 1]}`, target, lemma });
      // A contraction banked as two words joined ("they’ll" under "zij zullen").
      if (lemma && CONTRACTION.test(w) && /\s/u.test(lemma)) find("contraction-lemma-joins-words", { x, word, target, lemma });
      // Against the lexicon: is the lemma a dictionary word, and is the target one of its forms? Accents count as the
      // same letter (óf is of, stressed), and a multi-word lemma is fine when the target is those words.
      if (lexicon && lemma) {
        const lower = plain(lemma);
        if (!headwords.has(lemma.toLowerCase()) && !headwords.has(lower)) find("lemma-not-in-lexicon", { x, word, target, lemma });
        const whole = plain(tc);
        const parts = whole.split(" ");
        const formOk = whole === lower || parts.some((p) => p === lower || formsOf(p).some((l) => plain(l) === lower)) || lower.split(" ").every((l) => parts.includes(l));
        if (!formOk) find("target-not-a-form-of-lemma", { x, word, target, lemma });
      }
    });
    // The literal line's lemmas are bank keys too (target-order mode shows them): are they dictionary words? (Comparing
    // them with the per-word layer's lemmas was dropped: a natural sentence often uses other words, so it counted
    // differences, not defects.)
    if (lexicon && !help) {
      for (const [target, cue, , lemma] of sentence.m) {
        if (lemma && !headwords.has(lemma.toLowerCase()) && !headwords.has(plain(lemma))) find("literal-lemma-not-in-lexicon", { x, target, cue, lemma });
      }
    }
    if (sentence.m.every(([, , sources]) => sources.length === 0)) find("literal-line-unsourced", { x, text: sentence.text });
  });

  report.ok = report.valid && silent === 0 && leaked === 0 && doubled === 0;
  return { report, problems };
}
