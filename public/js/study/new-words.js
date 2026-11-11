// How a new word is met: one word at a time, most common first, in a sentence you can follow. Which words a sentence
// holds, what's known of them, which sentence to meet a word in (or come back to it in), what a tapped word means, and
// the choices for "What does it mean?". Used by plan.js and session.js; pure, so it runs in Node.
//
// A word's rank comes from the language's frequency list (frequency.js). Without one, or until it's loaded, the deck's
// order stands in: a word comes where the deck first teaches it, so every language works with what it has.
//
// Some sentences aren't where a learner starts (lang/not-first.<code>.js: judged sentence by sentence, per pack, by
// pipelines/words/not-first.ts, a person's calls included). They stay in their packs, and one may start a word once you
// know PAST_FIRST words: by then you aren't starting. A language with no list has no such sentences, so far: its starter
// packs are all the content there is. Your own packs and packs you add aren't on it.

import { CHUNKS, ITEMS, LESSONS, WORDS, contentLanguage, onContentChange } from "./content.js";
import { frequencyList, onFrequency, rankOf } from "./frequency.js";
import { keepPart, keptPart, planKey } from "./plan-kept.js";
import nl from "../lang/not-first.nl.js";
import nlForms from "../lang/form-senses.nl.js";
import nlNotChoices from "../lang/not-a-choice.nl.js";
import { spelledAlike } from "../lang/index.js";

const LISTS = { nl };
const FORM_SENSES = { nl: nlForms };
const NOT_CHOICES = { nl: nlNotChoices };

// What's worked out once per change in the study material, each part when it's first asked for (state(): Home's first draw needs the words
// in order and little else, and a year's 16,000 sentences made every part cost). The frequency list arriving changes only the order.
let cached = null;
onContentChange(() => (cached = null));
onFrequency(() => cached?.reorder());

const bare = (text) => text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "").toLocaleLowerCase();

/** How many words you know before a flagged sentence may start a word. */
export const PAST_FIRST = 2000;

/** The words a sentence holds, each once, as dictionary forms. */
export const lemmasOf = (item) => [...new Set(item.words.map(([, lemma]) => lemma).filter(Boolean))];

/** The word a sentence was written for: its gap's. */
export const targetOf = (item) => (item.gap ? (item.words[item.gap.index]?.[1] ?? null) : null);

// The pack whose lists name a sentence: its own, or for a copy (copyOf, pack-format.js) the pack it's a copy from.
const listedIn = (item) => item.copyOf ?? item.pack;
// A sentence's id as that pack has it (the view's is <pack>/<id>).
const ownId = (item) => {
  const pack = listedIn(item);
  return pack && item.id.startsWith(`${pack}/`) ? item.id.slice(pack.length + 1) : item.id;
};

/** Whether a sentence is one Study never starts a learner on (worked out once a sentence for this content). */
export const isNotFirst = (item) => state().notFirstOf(item);

/** A sentence's words, each once, as dictionary forms: lemmasOf, kept for this content. Read only. */
export const sentenceWords = (item) => state().wordsOf(item);

class Parts {
  constructor(lang) {
    this.lang = lang;
  }
  get notFirst() {
    return (this.notFirst_ ??= new Map(Object.entries(LISTS[this.lang] ?? {}).map(([pack, entry]) => [pack, new Set(entry.ids)])));
  }
  // One pass: where each word first comes (by sentence), each word's place in the deck (where it's first taught, else first used, after every
  // word that's taught), and the words never offered as a wrong choice (a meaning judged not to turn up unprompted, lang/not-a-choice.<code>.js,
  // or a word whose own sentence is one Study never starts on). Plain loops and two maps: Home's first draw reads it for 16,000 sentences.
  get pass() {
    return this.pass_ ?? runWhole(this.passSteps());
  }
  // The pass a piece at a time (a yield every PASS_PIECE sentences), for warmWords; run whole, the pass.
  *passSteps() {
    if (this.pass_) return this.pass_;
    const kept = keptPart(this.lang, planKey(this.lang, { anchors: false }), "words");
    if (kept) return (this.pass_ = passOf(new Map(zip(kept.first)), new Map(zip(kept.taughtAt)), new Set(kept.heavy)));
    const notFirst = this.notFirst;
    const first = new Map(); // lemma → the first sentence with it, in the order words first come
    const taughtAt = new Map(); // a sentence's own word → the first sentence written for it
    const heavy = new Set(NOT_CHOICES[this.lang] ?? []);
    for (let i = 0; i < ITEMS.length; i++) {
      if (i && i % PASS_PIECE === 0) {
        yield;
        // Worked out whole meanwhile (something asked for it): that's the one. The study material changed meanwhile: these parts are old.
        if (this.pass_) return this.pass_;
        if (this !== cached) return null;
      }
      const item = ITEMS[i];
      const words = item.words;
      for (let k = 0; k < words.length; k++) {
        const lemma = words[k][1];
        if (lemma && !first.has(lemma)) first.set(lemma, i);
      }
      const target = targetOf(item);
      if (target && !taughtAt.has(target)) taughtAt.set(target, i);
      if (target && notFirst.get(listedIn(item))?.has(ownId(item))) heavy.add(target);
    }
    this.pass_ = passOf(first, taughtAt, heavy);
    this.keep();
    return this.pass_;
  }
  // The sentences each word is in, in order: what a session looks a word's sentence up in.
  get byWord() {
    if (this.byWord_) return this.byWord_;
    const byWord = new Map();
    for (const item of ITEMS) addSentence(byWord, item);
    return (this.byWord_ = byWord);
  }
  // The same, with each sentence's words as the pick reads them (wordIdsOf, notFirstOf), a piece at a time (a yield every WORDS_PIECE
  // sentences), for warmSentences. Asked for whole meanwhile, byWord is that one (the same); the study material changed, these parts are old.
  *sentenceSteps() {
    const byWord = this.byWord_ ? null : new Map();
    for (let i = 0; i < ITEMS.length; i++) {
      if (i && i % WORDS_PIECE === 0) {
        yield;
        if (this !== cached) return;
      }
      const item = ITEMS[i];
      this.wordIdsOf(item);
      this.notFirstOf(item);
      if (byWord) addSentence(byWord, item);
    }
    if (byWord) this.byWord_ ??= byWord;
  }
  get order() {
    return this.pass.order;
  }
  get heavy() {
    return this.pass.heavy;
  }
  get forms() {
    if (this.forms_) return this.forms_;
    const forms = new Map();
    for (const item of ITEMS) for (const [text, lemma] of item.words) if (lemma && !forms.has(bare(text))) forms.set(bare(text), lemma);
    return (this.forms_ = forms);
  }
  // The forms a gap's wrong choice can be, as [form, lemma]: every form but a heavy word's (fillChoices walks it). Read only.
  get choiceForms() {
    if (this.choiceForms_) return this.choiceForms_;
    const { heavy } = this;
    return (this.choiceForms_ = [...this.forms].filter(([, lemma]) => !heavy.has(lemma)));
  }
  get readingOf() {
    if (this.readingOf_) return this.readingOf_;
    const readingOf = new Map();
    for (const item of ITEMS) for (const [text, , reading] of item.words) if (reading && !readingOf.has(bare(text))) readingOf.set(bare(text), reading);
    return (this.readingOf_ = readingOf);
  }
  // The forms with kanji that have a reading, longest first: how a line written without spaces is read (readingsOfText). Read only.
  get readingForms() {
    if (this.readingForms_) return this.readingForms_;
    return (this.readingForms_ = [...this.readingOf.keys()].filter((form) => HAN.test(form)).sort((a, b) => b.length - a.length));
  }
  // Which lesson each sentence belongs to, and what a word was first taught as.
  get lessons() {
    if (this.lessons_) return this.lessons_;
    const lessonOf = new Map();
    const taught = new Map();
    for (const lesson of LESSONS) {
      for (const id of lesson.items) if (!lessonOf.has(id)) lessonOf.set(id, lesson.id);
      for (const word of lesson.words ?? []) if (!taught.has(word.lemma)) taught.set(word.lemma, word.means ?? "");
    }
    return (this.lessons_ = { lessonOf, taught });
  }
  get lessonOf() {
    return this.lessons.lessonOf;
  }
  get taught() {
    return this.lessons.taught;
  }
  // A word's rank on the frequency list (Infinity until it's here), and every word with a meaning in that order (then the deck's).
  get rank() {
    if (this.rank_) return this.rank_;
    const lang = this.lang;
    const hasList = Boolean(frequencyList(lang));
    // Each word's rank read once while this list holds (reorder() drops it with the list): a plan asks for the same few hundred words'
    // ranks hundreds of thousands of times.
    const ranks = new Map();
    return (this.rank_ = (lemma) => {
      if (!hasList) return Infinity;
      let r = ranks.get(lemma);
      if (r === undefined) ranks.set(lemma, (r = rankOf(lemma, lang)));
      return r;
    });
  }
  // A sentence's words (lemmasOf) and whether Study never starts on it (isNotFirst), worked out once a sentence for this content: the pick
  // below reads them for every sentence a common word has, thousands, at each word a plan meets (7 Nov 2026).
  wordsOf(item) {
    const kept = (this.words_ ??= new WeakMap());
    let words = kept.get(item);
    if (!words) kept.set(item, (words = lemmasOf(item)));
    return words;
  }
  // Each word a number of its own (given as the pick first meets it), and a sentence's words as those numbers, so the pick's inner loop
  // reads arrays rather than looking words up by name.
  idOf(lemma) {
    const ids = (this.ids_ ??= new Map());
    let id = ids.get(lemma);
    if (id === undefined) {
      id = ids.size;
      ids.set(lemma, id);
      (this.names_ ??= []).push(lemma);
    }
    return id;
  }
  nameOf(id) {
    return this.names_[id];
  }
  wordIdsOf(item) {
    const kept = (this.wordIds_ ??= new WeakMap());
    let ids = kept.get(item);
    if (!ids) kept.set(item, (ids = Int32Array.from(this.wordsOf(item), (lemma) => this.idOf(lemma))));
    return ids;
  }
  // A word's sentences as the pick reads them, worked out once for this content: each sentence's word numbers (ids, from start[i] to
  // start[i + 1]), whether Study never starts on it, whether it's the word's own (its gap's), and its length in words.
  candidatesOf(lemma) {
    return this.candidates_?.get(lemma) ?? runWhole(this.candidateSteps(lemma));
  }
  // The same a piece at a time (a yield every CANDIDATES_PIECE sentences), for warmSentences; run whole, candidatesOf's.
  *candidateSteps(lemma) {
    const kept = (this.candidates_ ??= new Map());
    if (kept.has(lemma)) return kept.get(lemma);
    const items = sentencesWith(lemma);
    const n = items.length;
    const lists = new Array(n);
    const start = new Int32Array(n + 1);
    const flagged = new Uint8Array(n);
    const own = new Uint8Array(n);
    const length = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      if (i && i % CANDIDATES_PIECE === 0) {
        yield;
        if (kept.has(lemma)) return kept.get(lemma);
        if (this !== cached) return null;
      }
      const item = items[i];
      const list = (lists[i] = this.wordIdsOf(item));
      start[i + 1] = start[i] + list.length;
      flagged[i] = this.notFirstOf(item) ? 1 : 0;
      own[i] = targetOf(item) === lemma ? 1 : 0;
      length[i] = item.words.length;
    }
    const ids = new Int32Array(start[n]);
    for (let i = 0; i < n; i++) ids.set(lists[i], start[i]);
    const c = { items, start, ids, flagged, own, length };
    kept.set(lemma, c);
    return c;
  }
  // How common a word is for the pick's ceiling and tie-break: its rank, or with none its place in the deck (else after them all).
  topOf(id) {
    const kept = (this.tops_ ??= []);
    let top = kept[id];
    if (top === undefined) {
      const lemma = this.names_[id];
      const r = this.rank(lemma);
      kept[id] = top = Number.isFinite(r) ? r : (this.order.get(lemma) ?? ITEMS.length * 2);
    }
    return top;
  }
  notFirstOf(item) {
    const kept = (this.notFirsts_ ??= new WeakMap());
    let flagged = kept.get(item);
    if (flagged === undefined) kept.set(item, (flagged = Boolean(this.notFirst.get(listedIn(item))?.has(ownId(item)))));
    return flagged;
  }
  get ranked() {
    return this.ranked_ ?? runWhole(this.rankedSteps());
  }
  // The order a piece at a time (each word's rank, a yield every RANK_PIECE words), for warmWords; run whole, the order.
  *rankedSteps() {
    if (this.ranked_) return this.ranked_;
    const kept = keptPart(this.lang, planKey(this.lang, { anchors: false }), "words");
    if (kept?.ranked) return (this.ranked_ = kept.ranked);
    const { rank, order } = this;
    // By rank, then place, then as they came (a stable sort's tie): each word's three folded into one number and sorted natively, so no
    // comparison calls back (two lookups at each of 300,000 comparisons took a long task on a phone). A word with no rank sorts after every
    // ranked one; a rank, a place (< 2 × the sentences) and a position each fit their factor, and the whole stays an exact integer.
    // Worked out whole meanwhile: that's the one (left). The study material or the list changed meanwhile: these ranks are old (stale).
    const left = () => this.ranked_ ?? (this !== cached || this.rank_ !== rank ? null : undefined);
    const words = [];
    let seen = 0;
    for (const lemma of this.pass.first.keys()) {
      if (++seen % RANK_PIECE === 0) {
        yield;
        const was = left();
        if (was !== undefined) return was;
      }
      if (WORDS[lemma]) words.push(lemma);
    }
    const span = 2 * ITEMS.length + 1;
    const n = words.length;
    const ranks = new Array(n);
    for (let i = 0; i < n; i++) {
      if (i && i % RANK_PIECE === 0) {
        yield;
        const was = left();
        if (was !== undefined) return was;
      }
      ranks[i] = rank(words[i]);
    }
    // (Past what a number holds exactly, a deck far bigger than any now: the comparisons, each word's rank and place looked up once.)
    if ((UNRANKED + 1) * span * (n + 1) > Number.MAX_SAFE_INTEGER || ranks.some((r) => r !== Infinity && r >= UNRANKED)) {
      const at = new Map(words.map((lemma, i) => [lemma, i]));
      this.ranked_ = words.sort((a, b) => ranks[at.get(a)] - ranks[at.get(b)] || order.get(a) - order.get(b));
    } else {
      const keys = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        if (i && i % RANK_PIECE === 0) {
          yield;
          const was = left();
          if (was !== undefined) return was;
        }
        keys[i] = ((ranks[i] === Infinity ? UNRANKED : ranks[i]) * span + order.get(words[i])) * n + i;
      }
      yield;
      const was0 = left();
      if (was0 !== undefined) return was0;
      keys.sort();
      yield;
      const was = left();
      if (was !== undefined) return was;
      const ranked = [];
      for (let i = 0; i < n; i++) {
        if (i && i % RANK_PIECE === 0) {
          yield;
          const was = left();
          if (was !== undefined) return was;
        }
        ranked.push(words[keys[i] % n]);
      }
      this.ranked_ = ranked;
    }
    this.keep();
    return this.ranked_;
  }
  // What's kept on the device of these (study/plan-kept.js): the one pass and the order, as they are now.
  keep() {
    const { first, taughtAt, heavy } = this.pass_;
    keepPart(this.lang, planKey(this.lang, { anchors: false }), "words", { first: [[...first.keys()], [...first.values()]], taughtAt: [[...taughtAt.keys()], [...taughtAt.values()]], heavy: [...heavy], ranked: this.ranked_ ?? null });
  }
  reorder() {
    this.rank_ = null;
    this.ranked_ = null;
    this.tops_ = null;
  }
}
function state() {
  return (cached ??= new Parts(contentLanguage()));
}
// A sentence into byWord: under each of its words, once.
function addSentence(byWord, item) {
  for (const [, lemma] of item.words) {
    if (!lemma) continue;
    const list = byWord.get(lemma);
    if (!list) byWord.set(lemma, [item]);
    else if (list.at(-1) !== item) list.push(item);
  }
}
// Sentences a piece of warmSentences takes before it yields: about a millisecond on a phone slowed 4× (each gets its words' numbers).
const WORDS_PIECE = 200;
// Words whose ceiling and tie-break (topOf) a piece of warmSentences works out.
const TOPS_PIECE = 500;
// A word's sentences a piece of warmSentences sets out as the pick reads them (candidateSteps).
const CANDIDATES_PIECE = 1000;
// Words a piece of the order ranks (rankedSteps).
const RANK_PIECE = 3000;
// Sentences a piece of the pass takes before it yields: a few ms on a phone slowed 4×.
const PASS_PIECE = 1500;
// Where a word with no rank sorts in the order: after every rank a frequency list has.
const UNRANKED = 1e6;
// A generator to its end at once (know/slices.js whole, which the plan's modules can't import: it opens a channel that keeps Node running).
function runWhole(steps) {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * The words' pass and their order, a piece at a time (a generator for know/slices.js inSlices: Home's after the study material changes), so
 * no task holds the page for long. What wordsInOrder and the rest then read at once; nothing when they're already worked out. A change in
 * the study material meanwhile leaves these parts behind: what's worked out is for the new ones, asked for again.
 */
export function* warmWords() {
  const parts = state();
  yield* parts.passSteps();
  if (parts !== cached) return;
  yield;
  if (parts !== cached) return;
  yield* parts.rankedSteps();
  if (parts === cached) parts.ranked;
}
/**
 * What the pick reads of the study material, a piece at a time (plan.js warmGames, while the page is idle): each sentence's words and the
 * sentences each word is in, then for the first `count` words `lemmas()` gives, their sentences as the pick reads them, and how common every
 * word met so far is. Caches of this content only: sentenceForWord picks the same with or without them, only sooner.
 */
export function* warmSentences(lemmas, count) {
  const parts = state();
  yield* parts.sentenceSteps();
  let n = 0;
  for (const lemma of lemmas()) {
    if (parts !== cached || n++ >= count) break;
    yield;
    if (parts === cached) yield* parts.candidateSteps(lemma);
  }
  for (let id = 0; parts === cached && id < (parts.names_?.length ?? 0); id++) {
    if (id && id % TOPS_PIECE === 0) yield;
    if (parts === cached) parts.topOf(id);
  }
}
/** Whether the words' pass and order are worked out (warmWords has nothing to do). */
export const wordsWarm = () => Boolean(cached?.pass_ && cached.ranked_);
// A pass's parts as Parts.pass gives them (worked out, or read back from what was kept).
const zip = ([keys, values]) => keys.map((key, i) => [key, values[i]]);
function passOf(first, taughtAt, heavy) {
  const count = ITEMS.length;
  const order = { get: (lemma) => taughtAt.get(lemma) ?? (first.has(lemma) ? count + first.get(lemma) : undefined), has: (lemma) => first.has(lemma) || taughtAt.has(lemma) };
  return { first, taughtAt, order, heavy };
}

/** The index (in ITEMS) of the first sentence a word is in, or undefined. */
export const firstSentenceOf = (lemma) => state().pass.first.get(lemma);

/** Every word with a meaning, most common first. */
export const wordsInOrder = () => state().ranked;

/**
 * A word's meaning in a few words, for a list: what its lesson taught it as, where that's one plain meaning (without its
 * "the": the name beside it may not have its article); else the first sense of its gloss.
 */
export function shortMeaning(lemma) {
  const taught = state().taught.get(lemma);
  const meaning = taught && !/[=;]/.test(taught) ? taught.replace(/^the /i, "") : (WORDS[lemma] ?? "").split(";")[0];
  const plain = meaning.replace(/\s*\([^)]*\)/g, "").trim();
  return plain.length > 24 && plain.includes(",") ? plain.split(",")[0].trim() : plain;
}

/** The English a round of Match shows for a word: the sense it was taught in, short (shortMeaning), else its whole dictionary line. */
export const matchEnglish = (lemma) => shortMeaning(lemma) || WORDS[lemma] || lemma;
/** A path thing's English on a Match tile: a word's matchEnglish, a phrase's own. */
export const thingEnglish = (thing) => (thing.lemma ? matchEnglish(thing.lemma) : (CHUNKS[thing.phrase]?.en ?? thing.means ?? ""));
/**
 * The first of each English, in the order given (case, accents and marks at its ends aside): two tiles of one round showing the same English
 * can't be told apart, and a round's answers go by its English (8 Nov 2026: lesson 15's je and jouw both "your", de and het both "the"). What
 * every Match round is picked through (plan.js, lesson.js); a word left out comes in another round or game.
 */
export function oneEnglishEach(list, englishOf) {
  const seen = new Set();
  return list.filter((one) => {
    const key = bare(String(englishOf(one) ?? "")).normalize("NFD").replace(/\p{M}/gu, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A word Match can't ask (the director, 7 Nov 2026: water beside water tests nothing and confuses which side is which): its tile (the form it
 * was taught in, or the word) and its English spelled the same, case and accents aside. Another game asks it instead.
 */
export const pairsWithItself = (lemma, form = lemma) =>
  [shortMeaning(lemma), (WORDS[lemma] ?? "").split(";")[0].trim()].some((english) => spelledAlike(form, english) || spelledAlike(lemma, english));

/** How a written word is said, where any sentence shows it (kana, pinyin, an Arabic word's vowels), or null. */
export const readingOfForm = (text) => state().readingOf.get(bare(text)) ?? null;
/**
 * A stray tile (Put it in order's, Listening's: a word the sentence hasn't got) as a sentence's word, [form, lemma, reading]: the reading
 * a sentence gives that form (Russian's stress mark, kana over kanji) with its first letter in the form's own case, so the tile is shown as
 * the sentence's words are (session.js shownWord), its reading there while its word is new; [form] when no sentence gives it one. Drawn
 * from its text alone, it was the one tile with no stress mark, which gave it away (path-ru, 9 Nov).
 */
const HAN = /\p{Script=Han}/u;
/**
 * A line written out of its pack (a rule's own example on an idea's card) with the readings the packs give its forms, so it's shown as a
 * sentence's words are: [{ text, reading, lemma, gap }], gap what goes before it. A language with spaces word by word (молоко́, its
 * case kept); one written without them (joined: Japanese) as runs, each known form with kanji a run of its own (the longest first: お水
 * before 水), the rest as written. reading null where the packs give none.
 */
export function readingsOfText(text, joined = false) {
  const line = String(text ?? "");
  if (!joined) {
    return line.split(" ").map((word, i) => {
      const [, lemma = null, reading = null] = strayTile(word);
      return { text: word, reading, lemma, gap: i ? " " : "" };
    });
  }
  const { forms, readingOf, readingForms } = state();
  const runs = [];
  let plain = "";
  for (let i = 0; i < line.length; ) {
    const form = readingForms.find((one) => line.startsWith(one, i));
    if (!form) {
      plain += line[i++];
      continue;
    }
    if (plain) runs.push({ text: plain, reading: null, lemma: null, gap: "" });
    plain = "";
    runs.push({ text: form, reading: readingOf.get(form), lemma: forms.get(form) ?? null, gap: "" });
    i += form.length;
  }
  if (plain) runs.push({ text: plain, reading: null, lemma: null, gap: "" });
  return runs;
}
/**
 * A rule's own words (a grammar's short line, its why and explanation, a mistake: lang/grammar.js readings) as runs with readings: only the
 * forms the rule's own files give (own: { form: reading }, the grammar's and its longer file's), the longest first, as readingsOfText reads a
 * line written without spaces. A form with kanji is found anywhere; any other only as a whole word (never inside a longer one). Never a pack's
 * reading: right in its sentence, it can be wrong in a rule's words (a pack's 上 is うえ, 上手 is じょうず; 行 is xíng, 银行 yín háng), and a
 * rule's readings are never hidden, so each is one the rule's authors gave for these words. The caller draws them: read, not learned.
 */
export function readingsOfRuleText(text, own = {}) {
  const line = String(text ?? "");
  const mine = Object.entries(own ?? {}).filter(([form, reading]) => form && typeof reading === "string" && reading);
  if (!mine.length) return [{ text: line, reading: null, lemma: null, gap: "" }];
  const readingFor = new Map(mine);
  const all = [...readingFor.keys()].sort((a, b) => b.length - a.length);
  const letter = /[\p{L}\p{M}]/u;
  const whole = (form, i) => HAN.test(form) || ((i === 0 || !letter.test(line[i - 1])) && (i + form.length >= line.length || !letter.test(line[i + form.length])));
  const runs = [];
  let plain = "";
  for (let i = 0; i < line.length; ) {
    const form = all.find((one) => line.startsWith(one, i) && whole(one, i));
    if (!form) {
      plain += line[i++];
      continue;
    }
    if (plain) runs.push({ text: plain, reading: null, lemma: null, gap: "" });
    plain = "";
    runs.push({ text: form, reading: readingFor.get(form), lemma: null, gap: "" });
    i += form.length;
  }
  if (plain) runs.push({ text: plain, reading: null, lemma: null, gap: "" });
  return runs;
}
// The language's own text inside a rule's English words: letters of a script other than Latin (kana, kanji, Thai, Gurmukhi, Hebrew) with
// their marks (a combining one, ゙ or Russian's stress, goes with the letter it's on), and the CJK punctuation and long-vowel mark (。、「」ー)
// that run with them. A space, Latin or English punctuation ends it.
const QUOTED = /((?:[^\s\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]|[\u3000-\u303f\u30fc\uff01-\uff60])(?:[^\s\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]|[\u3000-\u303f\u30fc\uff01-\uff60]|\p{M})*)/u;
/**
 * A rule's words' runs (readingsOfRuleText) as they're drawn: English as text, and each form with a reading together with the language's
 * own text touching it (the kana either side, its 。) as one quote, { quote: [{ text, reading }] }, so the reading hangs over that kana as
 * a sentence's does (ui.quotedText). The language's text with no reading in it stays text. [text | { quote }] in order, joined the text.
 */
export function ruleQuotes(runs) {
  const pieces = runs.flatMap((run) =>
    run.reading ? [{ text: run.text, reading: run.reading }] : String(run.text).split(QUOTED).flatMap((part, i) => (part ? [{ text: part, quoted: i % 2 === 1 }] : [])),
  );
  const out = [];
  for (let i = 0; i < pieces.length; ) {
    let end = i;
    while (end < pieces.length && (pieces[end].reading || pieces[end].quoted)) end++;
    if (end === i) out.push(pieces[i++].text);
    else {
      const quote = pieces.slice(i, end);
      out.push(quote.some((piece) => piece.reading) ? { quote: quote.map(({ text, reading }) => (reading ? { text, reading } : { text })) } : quote.map((piece) => piece.text).join(""));
      i = end;
    }
  }
  return out;
}
/**
 * A line of notes about a sentence (an idea's part chip, its note line) with the sentence's own words in it given their readings, as the
 * sentence shows them: [{ text, reading, lemma, gap }] in order, gap "" (the line's spaces and punctuation are runs of their own). words:
 * the sentence's [{ text, reading, lemma }]; a word of the line matches one by its letters, case aside, and takes the line's own case.
 */
export function readingsInText(text, words = []) {
  const known = new Map();
  for (const word of words) {
    const core = bare(String(word?.text ?? ""));
    if (word?.reading && core && !known.has(core)) known.set(core, word);
  }
  const runs = [];
  for (const piece of String(text ?? "").split(/(\s+)/)) {
    if (!piece) continue;
    const [, lead, core, trail] = /^([^\p{L}\p{M}\p{N}]*)(.*?)([^\p{L}\p{M}\p{N}]*)$/su.exec(piece);
    const word = core && known.get(bare(core));
    if (!word) {
      runs.push({ text: piece, reading: null, lemma: null, gap: "" });
      continue;
    }
    const reading = core[0] !== word.reading[0] && core[0].toLocaleLowerCase() === word.reading[0].toLocaleLowerCase() ? core[0] + word.reading.slice(1) : word.reading;
    if (lead) runs.push({ text: lead, reading: null, lemma: null, gap: "" });
    runs.push({ text: core, reading, lemma: word.lemma ?? null, gap: "" });
    if (trail) runs.push({ text: trail, reading: null, lemma: null, gap: "" });
  }
  return runs;
}
export function strayTile(text) {
  const { forms, readingOf } = state();
  const reading = readingOf.get(bare(text));
  if (!reading) return [text];
  const [first, head] = [text[0], reading[0]];
  const cased = first && head && first !== head && first.toLocaleLowerCase() === head.toLocaleLowerCase() ? first + reading.slice(1) : reading;
  return [text, forms.get(bare(text)) ?? null, cased];
}

/** Whether a word stays out of every wrong choice (lang/not-a-choice.<code>.js, or its own sentence is flagged). */
export const isHeavy = (lemma) => state().heavy.has(lemma);

/**
 * The choices for a sentence's gap, the right one with them: the pack's own that you know, then forms of words you know, or
 * also's (a lesson's). known(lemma): whether you know a word. null when there aren't 2 others, and the game gives way to another.
 */
export function fillChoices(item, { known, also = [], seen = null } = {}) {
  if (!item.gap) return null;
  const { forms, heavy, readingOf } = state();
  const right = item.words[item.gap.index];
  const rightText = right[0];
  const end = rightText.match(/[^\p{L}\p{M}\p{N}]+$/u)?.[0] ?? "";
  const inSentence = new Set(item.words.map(([text]) => bare(text)));
  const asOption = (text) => {
    const reading = readingOf.get(bare(text));
    return reading ? { text, reading } : text;
  };
  const others = [];
  const add = (text) => {
    const shown = bare(text);
    if (!shown || inSentence.has(shown) || others.some((other) => bare(typeof other === "string" ? other : other.text) === shown)) return;
    others.push(asOption(text));
  };
  for (const option of item.gap.options) {
    const text = typeof option === "string" ? option : option.text;
    if (bare(text) === bare(rightText)) continue;
    const lemma = forms.get(bare(text));
    if (lemma && !heavy.has(lemma) && known?.(lemma) && (!seen || seen(bare(text)))) add(text);
  }
  const fromLesson = also.filter((one) => one.thing?.forms?.length && !heavy.has(one.thing.lemma ?? "")).flatMap((one) => one.thing.forms);
  for (const form of shuffle(fromLesson, `${item.id}:lesson`)) if (others.length < 2) add(form + end);
  // Then forms of words you know: up to 40 of them in an order seeded by the sentence, until 2 will do. Walked, not gathered: a learner who
  // knows the ten word bands had every form gathered and shuffled at each sentence a game was tried on (lex-character, 7 Nov 2026: Fill's
  // first frame waited 12 s).
  if (others.length < 2 && known) {
    const list = state().choiceForms;
    const n = list.length;
    let h = [...`${item.id}:known`].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
    const start = h % Math.max(n, 1);
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    let step = n > 1 ? 1 + (h % (n - 1)) : 1;
    while (gcd(step, n) !== 1 && n > 1) step = (step % (n - 1)) + 1;
    for (let i = 0, tried = 0, at = start; i < n && tried < 40 && others.length < 2; i++, at = (at + step) % n) {
      const [form, lemma] = list[at];
      if (lemma === right[1] || !known(lemma) || (seen && !seen(form))) continue;
      tried++;
      add(form + end);
    }
  }
  if (others.length < 2) return null;
  const rightOption = right[2] ? { text: rightText, reading: right[2] } : rightText;
  return [rightOption, ...others.slice(0, 2)];
}

/** The sentences a word is in. */
export const sentencesWith = (lemma) => state().byWord.get(lemma) ?? [];

/** The dictionary form of a form some sentence shows (ben → zijn), or undefined. */
export const lemmaOfForm = (text) => state().forms.get(bare(text));

// A sentence's other words may be new to you, within reason: no rarer than this for a word of this rank, so a common
// word doesn't arrive with a rare one beside it (chosen by the count of unknown words alone, a first lesson teaches
// "bailiff": measurements in docs/design/lessons).
const ceilingFor = (rank) => (Number.isFinite(rank) ? Math.max(1000, rank + 500) : Infinity);

const compare = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

const plainEnglish = (text) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const seededOrder = (text) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/**
 * The wrong answers for "What did you hear?" (their English): sentences of the same lesson, or ones you've met (played,
 * or every word and phrase in them met: units, the units with any evidence; played, the sentences'
 * ids). Never one with a word on the not-a-choice list, one Study doesn't start on, or one that says the same thing in
 * English. Closest first: sharing the most words with the sentence, the same lesson, the nearest length, so it takes
 * hearing it to tell them apart, and the English alone doesn't give it away. Fewer than count when there are fewer; none
 * means this question can't be asked yet. Fixed for a sentence and what you've met, so a redraw doesn't change them.
 */
export function heardChoices(item, { units = new Set(), played = new Set(), count = 2 } = {}) {
  const { heavy, lessonOf } = state();
  const lesson = lessonOf.get(item.id);
  const heard = new Set(item.words.map(([text]) => bare(text)));
  const right = plainEnglish(item.means);
  const found = [];
  for (const other of ITEMS) {
    if (other.id === item.id) continue;
    const same = lesson !== undefined && lessonOf.get(other.id) === lesson;
    if (!same && !played.has(other.id)) {
      const lemmas = lemmasOf(other);
      const chunks = other.chunks ?? [];
      if (!lemmas.length && !chunks.length) continue;
      if (!lemmas.every((lemma) => units.has(`w:${lemma}`)) || !chunks.every((chunk) => units.has(`c:${chunk}`))) continue;
    }
    if (plainEnglish(other.means) === right || isNotFirst(other) || lemmasOf(other).some((lemma) => heavy.has(lemma))) continue;
    const shared = other.words.filter(([text]) => heard.has(bare(text))).length;
    found.push({ other, key: [-shared, same ? 0 : 1, Math.abs(other.words.length - item.words.length), seededOrder(`${item.id}:${other.id}`)] });
  }
  found.sort((a, b) => compare(a.key, b.key));
  const out = [];
  for (const { other } of found) {
    if (out.length >= count) break;
    if (!out.some((text) => plainEnglish(text) === plainEnglish(other.means))) out.push(other.means);
  }
  return out;
}

/**
 * The sentence to meet a word in, or come back to it in. known(lemma): whether a word is known. used: ids to leave out.
 * seen(item): whether you've had this sentence: with it, sentences you haven't come first among those with as few
 * unknown words, and only a sentence you've had (or pastFirst: you know PAST_FIRST words) can be flagged. skip(item): leave it out. Fewest
 * other unknown words first, then within the ceiling, the word's own sentence, the commonest words, the shortest.
 * Returns the item, or null when no sentence will do.
 */
export function sentenceForWord(lemma, { known, used = new Set(), seen = null, skip = null, pastFirst = false } = {}) {
  const parts = state();
  const ceiling = ceilingFor(parts.rank(lemma));
  const self = parts.idOf(lemma);
  const c = parts.candidatesOf(lemma);
  const { items, start, ids, flagged: flags, own, length } = c;
  // Whether each other word is known, asked once in this pick (1 known, 2 not): the same few hundred words come up in thousands of sentences.
  const knows = [];
  let best = null;
  // A sentence's place among those looked at (each sentence is in a word's list once), the last tie-break.
  let position = 0;
  // The best key so far: [not first and flagged, past the ceiling, others past one, had, others, not its own, top, length, position], lowest first.
  const b = new Float64Array(9);
  const anyUsed = used.size > 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if ((anyUsed && used.has(item.id)) || skip?.(item)) continue;
    const had = Boolean(seen?.(item));
    const flagged = flags[i] === 1;
    if (!had && !pastFirst && flagged) continue;
    // A sentence you haven't had beats one you have, at up to one other new word: the word should come back somewhere new.
    const k0 = !had && flagged ? 1 : 0;
    const k3 = had ? 1 : 0;
    const k5 = own[i] === 1 ? 0 : 1;
    const k7 = length[i];
    const k8 = position++;
    // Its other unknown words and the least common of them, counted only while it can still beat the best so far: each part of its key only
    // grows as they're counted, and a tie goes to the best (it came first), so the rest of its words can't make it the pick.
    if (best && !before(k0, 0, 0, k3, 0, k5, 0, k7, b)) continue;
    let others = 0;
    let top = 0;
    let beaten = false;
    for (let j = start[i], end = start[i + 1]; j < end; j++) {
      const id = ids[j];
      if (id === self) continue;
      let k = knows[id];
      if (k === undefined) knows[id] = k = known(parts.nameOf(id)) ? 1 : 2;
      if (k === 2) {
        others++;
        const t = parts.topOf(id);
        if (t > top) top = t;
        if (best && !before(k0, top > ceiling ? 1 : 0, others > 1 ? others : 0, k3, others, k5, top, k7, b)) {
          beaten = true;
          break;
        }
      }
    }
    if (beaten) continue;
    const k1 = top > ceiling ? 1 : 0;
    const k2 = others > 1 ? others : 0;
    if (!best || before(k0, k1, k2, k3, others, k5, top, k7, b)) {
      best = item;
      b[0] = k0; b[1] = k1; b[2] = k2; b[3] = k3; b[4] = others; b[5] = k5; b[6] = top; b[7] = k7; b[8] = k8;
    }
  }
  return best;
}

// Whether the key a0…a7 comes before the best's (b), lowest first. Equal keys don't: the best was looked at first (its position, the last
// part, is lower).
const before = (a0, a1, a2, a3, a4, a5, a6, a7, b) =>
  a0 !== b[0] ? a0 < b[0] : a1 !== b[1] ? a1 < b[1] : a2 !== b[2] ? a2 < b[2] : a3 !== b[3] ? a3 < b[3] : a4 !== b[4] ? a4 < b[4] : a5 !== b[5] ? a5 < b[5] : a6 !== b[6] ? a6 < b[6] : a7 < b[7];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// A little seeded shuffle: the same sentence and word always shuffle the same.
function shuffle(list, seed) {
  let h = [...seed].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// A gloss's words worth comparing, worked out once a gloss (meaningChoices asks for ~1,200 of them at every question it makes). Read only.
const glossWords = new Map();
const contentWords = (gloss) => {
  let words = glossWords.get(gloss);
  if (!words) glossWords.set(gloss, (words = new Set(gloss.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2 && !["the", "and", "any", "for", "with", "one"].includes(word)))));
  return words;
};
const POOL = 400;

/** What a word means as this form shows it: the senses the form can carry where it can't carry them all (lang/form-senses.<code>.js), else its whole gloss. */
export const glossOfForm = (lemma, text) => FORM_SENSES[contentLanguage()]?.[lemma]?.[bare(text)] ?? WORDS[lemma];

/**
 * "What does it mean?": { options, correct } for a word in a sentence: its meaning and three others, shuffled the same
 * way each time. The others are common words of the same kind (a verb with verbs), not in this sentence, sharing no
 * word with its meaning, and never a word whose own sentence Study doesn't start on. null when there aren't two others.
 */
export function meaningChoices(lemma, item, { known = null, knownRanked = null } = {}) {
  const { ranked, heavy } = state();
  if (!WORDS[lemma]) return null;
  const correct = glossOfForm(lemma, item.words.find(([, word]) => word === lemma)?.[0] ?? lemma);
  const inSentence = new Set(lemmasOf(item));
  const mine = contentWords(correct);
  const verb = correct.startsWith("to ");
  const fits = (other) => {
    if (inSentence.has(other) || heavy.has(other) || (known && !known(other))) return false;
    const gloss = WORDS[other];
    if (!gloss || gloss === correct || gloss.length > 48) return false;
    return ![...contentWords(gloss)].some((word) => mine.has(word));
  };
  // knownRanked: wordsInOrder() filtered by known, in that order (a plan asks this for many questions and works it out once); the same pool.
  const pool = (known ? (knownRanked ?? ranked) : ranked.slice(0, POOL * 3)).filter(fits);
  const alike = pool.filter((other) => WORDS[other].startsWith("to ") === verb).slice(0, POOL);
  const others = [];
  for (const other of shuffle(alike.length >= 3 ? alike : pool, `${item.id}:${lemma}`)) {
    const gloss = WORDS[other];
    if (!others.includes(gloss)) others.push(gloss);
    if (others.length === 3) break;
  }
  // Among only what you know, one other will do while you know so little; no one ever has none.
  if (others.length < (known ? 1 : 2)) return null;
  const options = shuffle([correct, ...others], `${lemma}:${item.id}:choices`);
  return { options, correct: options.indexOf(correct) };
}

/**
 * What a word on the screen means: { said, lemma, gloss, reading } for the text shown (punctuation and capitals don't
 * matter), looked up in the sentence, or among every sentence's forms. lemma only when it's not what's shown (ben →
 * zijn), so a form's meaning always says which word it is. null when nothing knows it. at: where in the sentence it was
 * pressed, since one written word can be two words there ("Woon je hier met je moeder?": you, your).
 */
export function meaningOfWord(text, item, at = null) {
  const said = text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
  const pressed = at === null ? null : item?.words[at];
  const word = pressed && bare(pressed[0]) === bare(text) ? pressed : item?.words.find(([form]) => bare(form) === bare(text));
  // A word learned inside a fixed phrase means the phrase.
  if (word && !word[1]) {
    const phrase = (item.chunks ?? []).map((id) => CHUNKS[id]).find((chunk) => chunk?.text.split(/\s+/).some((part) => bare(part) === bare(text)));
    if (phrase) return { said: phrase.text, lemma: null, gloss: phrase.en };
  }
  const lemma = word?.[1] ?? lemmaOfForm(text);
  if (!lemma || !WORDS[lemma]) return null;
  return { said, lemma: bare(said) === bare(lemma) ? null : lemma, gloss: glossOfForm(lemma, said), reading: word?.[2] };
}

/** Every meaning a written word has in this sentence, one a word: one, unless it's two words there (je: you, your). */
export function meaningsOfWord(text, item) {
  const seen = new Set();
  const out = [];
  (item?.words ?? []).forEach(([form], at) => {
    if (bare(form) !== bare(text)) return;
    const meaning = meaningOfWord(text, item, at);
    if (meaning && !seen.has(meaning.gloss)) {
      seen.add(meaning.gloss);
      out.push(meaning);
    }
  });
  if (out.length) return out;
  const anywhere = meaningOfWord(text, item);
  return anywhere ? [anywhere] : [];
}
