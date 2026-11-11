// What studying draws on: the packs for the language you're learning (learning.js) that are on, the built-in ones
// first, then yours (packs.js), merged by pack-format.js (buildView). The item format is the pack format's
// (pack-format.js); an item here also names its pack (item.pack), and its id is app-wide.
//
// ITEMS, PATTERNS, WORDS, CHUNKS, TOPICS, PACKS and itemById are live: when a pack arrives, changes or goes, is turned
// on or off, or you switch language, a whole new view takes their place at once (a new value for each, never one changed
// in place), and onContentChange() tells anything that keeps its own sums. So read them when you need them, rather than
// copying them at import. describe() names a unit from every pack of the language, on or off, so evidence from a pack
// that's off still reads as what it was.
// The view is worked out apart from the one in use, so nothing ever reads half of one. A sync's new packs (packs.js
// setContentPrepare) have theirs worked out a few ms at a time (know/slices.js) before the change is told, so taking it
// is quick; a pack that changes meanwhile drops that one, and the view is worked out at once, as any other change's is.

import { BUILT_IN } from "../packs/index.js";
import { LANGUAGES } from "../lang/index.js";
import { buildViewSteps, itemSentence, shownItem } from "./pack-format.js";
import { packWords, writtenForWords } from "./pack-words.js";
import { allPacks, isPackOn, onPacksChange, setContentPrepare } from "./packs.js";
import { inSlices, whole } from "../know/slices.js";
import { learning, onLearningChange } from "./learning.js";
import { readingHides, setUnitAliases } from "./progress.js";
import { setPackWriting, writingTally, writtenOf } from "./written.js";

/** The built-in starter pack (its recorded audio is under /audio/<id>/). */
export const PACK = { id: BUILT_IN[0].id, name: BUILT_IN[0].name, language: BUILT_IN[0].language, from: BUILT_IN[0].from };

/** Every pack of the language, on or off: [{ id, name, about, language, from, builtIn, on, items }] (items: how many). */
export let PACKS = [];
/**
 * The packs that are on and were written for their words, in PACKS' order: [{ id, name, builtIn, copies, own, words, sentences: [[word, words, topic]] }]. A pack without lessons of its own
 * whose sentences each have a gap was written for the gap's word (Dutch's word series; a category pack, through its copies of theirs), and
 * words lists those, each once, in the pack's order. path.js teaches them as that pack's lessons.
 */
export let WORD_PACKS = [];
export let ITEMS = [];
/** The packs' lessons (pack-format.js), in order: the written path, where a language has one. Their items are app-wide ids. */
export let LESSONS = [];
/** The language's shared grammar (lang/grammar.js), then any pack's own patterns: { id: { name, about, after } }. */
export let PATTERNS = {};
/**
 * The patterns some sentence of the language shows, in any of its packs (on or off). Where you choose what to learn
 * (the grammar map, Study's patterns, what Knowledge counts), a pattern is offered once a sentence shows it or you've
 * studied it: a catalog pattern no pack has a sentence for yet has nothing to study.
 */
export let PATTERNS_IN_USE = new Set();
/** { lemma: gloss } */
export let WORDS = {};
/** How each dictionary form with kanji or hanzi is said (Japanese, Chinese): { lemma: reading }. */
export let READINGS = {};
/** Fixed phrases you learn whole: { id: { text, en, about } }. */
export let CHUNKS = {};
export let TOPICS = {};
export let itemById = new Map();
// The items as their packs store them, by id: what goes to your AI is stored text, never the screens' typography.
let stored = new Map();

const listeners = new Set();
let language = null;
let glossary = { patterns: {}, words: {}, readings: {}, chunks: {}, topics: {} };

// The packs as the screens list them: the language's lessons first, as Explore lists them, then as the device has them (the
// catalog's order, what you follow, yours). Only the lists move: what's studied and Translate keep the catalog's order.
const lessonsFirst = (packs, lang) => {
  const at = packs.findIndex((pack) => pack.builtIn && pack.id === `path-${lang}`);
  return at > 0 ? [packs[at], ...packs.slice(0, at), ...packs.slice(at + 1)] : packs;
};

export { packWords, writtenForWords };

/**
 * The view of these packs in this language (isOn(id): which are on), worked out from nothing a piece at a time: a generator that yields
 * between pieces (know/slices.js). Run whole, it's the view at once. Returns what install() puts in place.
 */
function* viewSteps(packs, lang, isOn) {
  const view = yield* buildViewSteps(packs, lang, { isOn });
  const next = { language: view.language, aliases: view.aliases, glossary: view.glossary, lessons: view.lessons, patterns: view.patterns, words: view.words, readings: view.readings, chunks: view.chunks, topics: view.topics };
  next.packs = lessonsFirst(view.packs, view.language);
  // As the screens show them (pack-format.js shownItem: French's spacing before ? and !).
  next.items = [];
  for (const [n, item] of view.items.entries()) {
    if (n % 256 === 255) yield;
    next.items.push(shownItem(item, view.language));
  }
  const raw = new Map(packs.filter((pack) => pack.language === view.language).map((pack) => [pack.id, pack]));
  next.wordPacks = [];
  for (const shown of next.packs) {
    const pack = raw.get(shown.id);
    if (!shown.on || !writtenForWords(pack)) continue;
    const words = packWords(pack);
    yield;
    // Each sentence as the path plans with it: the word it was written for, the words it holds, its topic.
    const sentences = [];
    for (const [n, item] of (pack.items ?? []).entries()) {
      if (n % 256 === 255) yield;
      if (item.gap && Array.isArray(item.words)) sentences.push([item.words[item.gap.index]?.[1], [...new Set(item.words.map(([, lemma]) => lemma).filter(Boolean))], item.topic ?? null]);
    }
    // A pack of copies (a category pack, from Explore) is one you chose for its subject; the word series everyone has aren't. A pack of yours
    // your AI made (it came through the relay: packs.js allPacks) is one made for its subject. A copy of a public pack you keep as yours isn't.
    const copies = (pack.items ?? []).some((item) => item.copyOf);
    const own = shown.origin?.kind === "yours" && shown.origin.relayed === true;
    if (words.length) next.wordPacks.push({ id: shown.id, name: shown.name, builtIn: shown.builtIn, copies, own, words, sentences });
  }
  next.inUse = new Set();
  // And how the language writes each word, from where it stands mid-sentence in these packs (written.js: Engels, not engels).
  const writing = writingTally(view.language);
  for (const pack of packs) {
    if (pack.language !== view.language) continue;
    for (const [n, item] of (pack.items ?? []).entries()) {
      if (n % 512 === 511) yield;
      for (const id of item.concepts ?? []) next.inUse.add(id);
      if (Array.isArray(item.words)) writing.add(item.words);
    }
  }
  next.written = writing.done();
  next.stored = new Map();
  for (const [n, item] of view.items.entries()) {
    if (n % 1024 === 1023) yield;
    next.stored.set(item.id, item);
  }
  next.itemById = new Map();
  for (const [n, item] of next.items.entries()) {
    if (n % 1024 === 1023) yield;
    next.itemById.set(item.id, item);
  }
  return next;
}

/** Puts a view in place, all of it in this moment, and tells whoever keeps sums of it. */
function install(next) {
  language = next.language;
  // A pack's own pattern that's the same as a shared one: its evidence counts for the shared one (pack-format.js same).
  setUnitAliases(next.language, Object.fromEntries(Object.entries(next.aliases).map(([own, shared]) => [`p:${own}`, `p:${shared}`])));
  setPackWriting(next.language, next.written);
  glossary = next.glossary;
  PACKS = next.packs;
  ITEMS = next.items;
  LESSONS = next.lessons;
  WORD_PACKS = next.wordPacks;
  PATTERNS = next.patterns;
  PATTERNS_IN_USE = next.inUse;
  WORDS = next.words;
  READINGS = next.readings;
  CHUNKS = next.chunks;
  TOPICS = next.topics;
  stored = next.stored;
  itemById = next.itemById;
  for (const listener of listeners) listener();
}

// What a view is worked out from: the packs as packs.js has them now, the language, and which are on (read once, at its start).
function inputs() {
  const packs = allPacks();
  return { packs, language: learning(), on: packs.map((pack) => isPackOn(pack.id)) };
}
// The same packs: each the same fields, holding the same things (a pack's copy from packs.js is new each time, what it holds isn't).
const samePack = (a, b) => {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => (key === "origin" ? JSON.stringify(a.origin) === JSON.stringify(b.origin) : Object.hasOwn(b, key) && a[key] === b[key]));
};
const sameInputs = (a, b) => a.language === b.language && a.packs.length === b.packs.length && a.packs.every((pack, i) => a.on[i] === b.on[i] && samePack(pack, b.packs[i]));
const isOnOf = ({ packs, on }) => {
  const ids = new Set(packs.filter((_, i) => on[i]).map((pack) => pack.id));
  return (id) => ids.has(id);
};

let prepared = null; // { from, next }: a view worked out in slices (prepare), for the packs as they were then
let preparing = 0; // the newest; one before it stops where it is
const builds = { prepared: 0, whole: 0, dropped: 0, working: false };
/**
 * How the views so far were put in place: worked out in slices first (prepared), at once (whole), or one in slices dropped for a newer change;
 * working: one is being worked out in slices now. For the checks.
 */
export const contentBuilds = () => ({ ...builds });

/** A sync's packs, about to be told (packs.js): their view worked out a few ms at a time, so taking it is quick. Resolves once it's ready. */
async function prepare() {
  const mine = ++preparing;
  const from = inputs();
  builds.working = true;
  const next = await inSlices(viewSteps(from.packs, from.language, isOnOf(from)), { alive: () => mine === preparing }).finally(() => mine === preparing && (builds.working = false));
  if (next && mine === preparing) prepared = { from, next };
  else builds.dropped++;
}

function refresh() {
  // Whatever is being worked out in slices was for the packs before this change.
  preparing++;
  const now = inputs();
  const ready = prepared && sameInputs(prepared.from, now) ? prepared.next : null;
  if (prepared && !ready) builds.dropped++;
  prepared = null;
  builds[ready ? "prepared" : "whole"]++;
  install(ready ?? whole(viewSteps(now.packs, now.language, isOnOf(now))));
}

refresh();
onPacksChange(refresh);
onLearningChange(refresh);
setContentPrepare(prepare);

/** The language the content is in ("nl"). */
export const contentLanguage = () => language;

/** The languages there's a pack for on this device (on or off), in the registry's order: what you can learn here. */
export const packLanguages = () => [...new Set(allPacks().map((pack) => pack.language))].sort((a, b) => Object.keys(LANGUAGES).indexOf(a) - Object.keys(LANGUAGES).indexOf(b));

/** Calls fn() whenever the content changes (a pack arrived or went, or you switched language). Returns a function that stops it. */
export function onContentChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The sentence as text, its words joined as its language joins them, as the screens show it. */
export const sentence = (item) => itemSentence(item, language);

/** The sentence as its pack stores it (what your AI is sent: get_learner), whatever the screens show. */
export const storedSentence = (item) => itemSentence(stored.get(item.id) ?? item, language);

/** The language a unit's name is in: a word's and a phrase's are the language's own; a pattern's is English (undefined). */
export const nameLang = (unit, lang) => (/^[wck]:/.test(unit) ? lang : undefined);

/** The units a whole sentence tests: its patterns, then the fixed phrase it is (if it is one). */
export const sentenceUnits = (item) => [...item.concepts.map((id) => `p:${id}`), ...(item.chunks ?? []).map((id) => `c:${id}`)];

/** Every concept an item practices: its patterns and phrase, then its words. */
export function conceptsOf(item) {
  return [...sentenceUnits(item), ...new Set(item.words.filter(([, word]) => word).map(([, word]) => `w:${word}`))];
}

const cardsOfPack = new WeakMap();
/** A pack's item by its app-wide id ("<pack>/<id>"), sentence or plain: what a deck's evidence names. A copy (copyOf) is named by its source, which may not be here. */
export function cardById(id) {
  const at = String(id).indexOf("/");
  if (at <= 0) return null;
  const source = id.slice(0, at);
  const own = id.slice(at + 1);
  const cardsOf = (pack) => {
    if (!cardsOfPack.has(pack)) cardsOfPack.set(pack, new Map((pack.items ?? []).map((item) => [item.id, item])));
    return cardsOfPack.get(pack);
  };
  const pack = allPacks().find((one) => one.id === source);
  const found = pack ? cardsOf(pack).get(own) : undefined;
  if (found) return found;
  for (const other of allPacks()) {
    const copy = cardsOf(other).get(own);
    if (copy?.copyOf === source) return copy;
  }
  return null;
}

/** A concept's display name and kind (pattern · phrase · word). */
export function describe(conceptId) {
  const [kind, id] = conceptId.split(":");
  const { patterns, chunks, words } = glossary;
  if (kind === "k") {
    const found = cardById(id);
    return { kind: "card", name: found?.text ?? id, en: found?.means };
  }
  if (kind === "p") return { kind: "pattern", name: patterns[id]?.name ?? id, about: patterns[id]?.about, ...(patterns[id]?.chip ? { chip: patterns[id].chip } : {}), ...(patterns[id]?.short ? { short: patterns[id].short } : {}) };
  if (kind === "c") return { kind: "phrase", name: chunks[id]?.text ?? id, en: chunks[id]?.en, about: chunks[id]?.about };
  return { kind: "word", name: id, en: words[id] };
}

/**
 * A unit's name as a chip, a list's row or a heading shows it. A word you don't know yet, in a language that shows
 * readings, comes with its reading ({ text, reading, lang }: kana or pinyin over it; Arabic's, Hebrew's, Persian's and
 * Urdu's vowel marks); once you know it, as written, as a study card's word drops its reading. Anything else: its name.
 * ui.conceptTag and ui.wordLabel draw either.
 */
export function shownName(unit) {
  const info = describe(unit);
  if (info.kind !== "word") return info.name;
  // As the language writes it (written.js: Engels), its reading looked up by its key.
  const text = writtenOf(language, info.name);
  const reading = READINGS[info.name];
  return reading && !readingHides(unit) ? { text, reading, lang: learning() } : text;
}

/** A unit's name as text, a word as the language writes it (written.js): for the screens that show describe()'s name, which is a word's key. */
export const writtenName = (unit) => (unit.startsWith("w:") ? writtenOf(language, describe(unit).name) : describe(unit).name);

/**
 * What a sentence is about, for the feedback after it: its first pattern, or the phrase it is. { name, about, line }:
 * line is both, as one sentence ("Verb second. In a main clause …").
 */
export function aboutOf(item) {
  const info = describe(sentenceUnits(item)[0]);
  const about = info.about ?? info.en ?? "";
  return { name: info.name, about, line: `${info.name}${/[.?!]$/.test(info.name) ? "" : "."} ${about}`.trim() };
}
