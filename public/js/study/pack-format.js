// Packs: study material as data. A pack is one language's sentences, with everything the games need to play them, and
// the words, phrases and patterns they teach. Lexicommons' own packs (the starter first) are public packs in the open
// library, with the starter also inside the app for a first start offline (public/js/packs/); your AI makes others.
// Pure (no DOM, no storage), so the app and the Worker check a pack with the same code (scripts/test-packs.mjs), as
// look-rules.js does for looks. A pack is only ever data: nothing in one runs, and the app shows all of it as text.
//
// A pack (format lexicommons-pack, version 2; upgradePack reads version 1):
//   id        lowercase letters, digits and dashes
//   name      what it's called; about: a line on what it's for (optional)
//   language  the language it teaches (public/js/lang/); from: the language of its English side
//   copiedFrom  { id, version }: the public pack this one is a copy of (optional; a copy keeps its attribution)
//   teaches   "script": a pack that teaches how a script is read (Japanese's kana), played as a deck whose games ask it that way (study/deck.js):
//             every item a card whose text is a letter or a few and whose means is how it's said, the spelling a keyboard uses for it in
//             brackets where that differs (を: "o (wo)"); no sentences, gaps or lessons (optional)
//   topics    { id: name }: what its sentences are about (Study → A topic). An item may also use a default pack's.
//   words     { lemma: gloss }: the words it teaches (w:<lemma>), glossed in `from`
//   readings  { lemma: reading }: in a language that shows readings (Japanese, Chinese: lang/readings.js), how each
//             dictionary form written with kanji or hanzi is said, for the word games and a word's page (optional;
//             kept only when it has some)
//   chunks    { id: { text, en, about } }: fixed phrases you learn whole (c:<id>)
//   patterns  { id: { name, about, after, same? } }: grammar the language's catalog doesn't have (p:<id>). The catalog
//             is the language's shared grammar (lang/grammar.js: the app's own, or the open library's newer revision),
//             so a catalog id here is left out. An id is "<pack id>.<id>" (the pack it was made in) or, from before
//             2 Nov 2026, bare. same: the shared grammar's id for the same grammar (once the shared one has it): the
//             view counts the pack's sentences for it, and the evidence for both is one unit (progress.js aliases).
//   items     what it teaches. Only id, text and means are required (a cloze may skip means); every other field is optional. An
//             item with words, means, literal, wrong, gap and a concept or phrase is a sentence: Study's games play it, and
//             everything that reads sentences reads it. Any other is a plain item, played by a session on its pack (pack-items.js):
//     id        unique in the pack, and kept from one version of the pack to the next (evidence points to it). In the
//               app a pack's item is "<pack>/<id>", except the starter's, which keep their own (evidence since 26 Oct
//               2026 uses them)
//     topic     one of its topics, or a default pack's
//     concepts  the grammar it's an example of (p:<id>); chunks: the fixed phrase it is (c:<id>)
//     text      what you're learning, as written. With words, it's those words joined as the language joins them, then punct
//     means     what it means, in natural `from`
//     reading, sentence, sentenceBack, cloze   what a plain item may carry: pack-items.js has them
//     words     the sentence's words in the pack's language, each [text, lemma?, reading?]: a word as written, with its
//               punctuation; its dictionary form if it's a word to learn (null when it has a reading but isn't one); and, in a
//               language that shows readings (Japanese, Chinese: lang/readings.js), how it's said, for a word written with
//               kanji or hanzi. In a language written without spaces (separator ""), the split is the pack's own, fixed here
//               and never redone
//     punct     what ends the sentence: . ? ! …, one of the language's own endings (lang/index.js sentenceEnds), or nothing
//     literal   the literal line: [text, moved?] chunks of `from` in the sentence's order, moved marking the ones the
//               sentence puts where `from` wouldn't; english: the chunks' indexes in `from`'s order, each once, or
//               null where `from` has no matching order
//     moved     the words (as written in words) that sit where `from` wouldn't put them
//     wrong     1 to 3 plausible wrong versions of the sentence (Choose)
//     otherGender  { text, gender, who }: the same sentence as the other gender says it, or says it to the other gender, where the
//               language makes them differ (Obrigado / Obrigada, ¿Estás listo? / ¿Estás lista?): text, that sentence with its end mark;
//               gender, whose it is ("f" or "m"); who, "speaker" (said by them) or "listener" (said to them). From the English, typed
//               or said, it's right too (study/subjects.js genderVariants), and the answer's drawer names it; nothing else shows it, and no
//               game makes tiles of it
//     gap       { index, options }: the word to fill or type (its index in words), and 2 to 5 choices with it among them,
//               each the word as written or, in a language that shows readings, { text, reading } (checked as words'
//               readings are). Choices with readings show them until the gap's word is known well, so once one has a
//               reading, every choice that wants one has it, the right one the sentence's own
//   lessons   a path through the pack, in order (optional): each { id, title, unit?, theme?, words: [{ lemma, forms, article?, picture?, means }], phrases: [chunk
//   units     the path's sections, in order (optional): each { id, title }. With units, every lesson names one, and a unit's lessons sit next to
//             each other. A lesson's theme is what it's about (food, people...): an id, which draws its stop on the path if there's a drawing for it
//             id], concept: { pattern, line } | null, items: [item id] }: what it teaches (the forms as written, what they mean
//             here), one concept at most, and the sentences it runs on
//
// checkPack(pack, { installed }) returns { pack, errors, warnings }: the pack as it would be kept (null when there are
// errors), every error (it's refused) and every warning (kept, but worth fixing), each { at, message }, all at once so
// whoever wrote it can fix everything in one go. installed: the other packs on the device, the default packs (the ones
// everyone has, marked builtIn: their phrases and topics may be used) first; only those in the same language are
// looked at.
//
// The open library holds public packs at packs/<id>/<version>/pack.json: the checked pack's JSON, its version the
// first 12 hex of that JSON's sha256, so a version is its content and is never overwritten. The catalog lists
// Lexicommons' own packs under packs.<language> (catalogueEntry): the default packs, which every device of the language
// has, and opt-in ones (optIn: true, Dutch's strong language), which a device has only once its learner adds it in
// Explore (a follow) though Translate online searches them all. A pack you follow comes by the same path. A version's
// recorded audio (study/pack-audio.js) is beside it, packs/<id>/<version>/audio.<h>.json, named by its own content, and
// the entry (and a ref) names it in audio. The helpers at the end are what every publisher uses (the Worker's library
// tools, local seeding), so they all write the same.

import { LANGUAGES, endMark, isOurLanguage, ourLanguages, ownLanguageDef, ownLanguageProblem, sameOwnLanguage, sentenceEnds, typeset, withOwnLanguage, withoutInvisible } from "../lang/index.js";
import { needsReading, readingProblem } from "../lang/readings.js";
import { ITEM_LIMITS, checkPlainFields, isSentence, orderedItem, sentencesOf, upgradeItem } from "./pack-items.js";
import { checkShapes, renameShapes, SHAPE_LIMITS } from "./shape-marks.js";

export const PACK_FORMAT = "lexicommons-pack";
export const PACK_VERSION = 2;

/**
 * A pack written in version 1, as version 2: an item's nl is its words, its natural its means, its patterns its concepts, and a card
 * is an item. It's mechanical, so what passed its check before still passes. Anything else comes back as it is. This, with
 * upgradeItem and upgradeChange, is the only place the old names live, for what was kept from before: a pack on a device, in an account's
 * copy, in a queued change or a shared version.
 */
export function upgradePack(pack) {
  if (!isObject(pack) || pack.version !== 1) return pack;
  const separator = separatorOf(pack.language);
  const items = Array.isArray(pack.items) ? pack.items.map((item) => upgradeItem(item, separator)) : [];
  // A card and a sentence could share an id then; an item's id is its own now, and the sentence's evidence is the one that's named by it.
  const taken = new Set(items.map((item) => item?.id));
  const cards = (Array.isArray(pack.cards) ? pack.cards : []).map((card) => upgradeItem(isObject(card) && taken.has(card.id) ? { ...card, id: `card-${card.id}` } : card, separator));
  const { cards: _cards, ...rest } = pack;
  return { ...rest, version: PACK_VERSION, items: [...items, ...cards] };
}

/** A change queued before version 2, as version 2 (see upgradePack). Its items' text is left for the check, as a change doesn't say its language. */
export function upgradeChange(change) {
  if (!isObject(change)) return change;
  if (change.kind === "create") return isObject(change.pack) ? { ...change, pack: upgradePack(change.pack) } : change;
  return Array.isArray(change.items) ? { ...change, items: change.items.map((item) => upgradeItem(item)) } : change;
}

/**
 * The version of checkPack's rules. A public pack fully checked when it arrived is used at the app's next start
 * without being checked again while its proof holds (proofHolds): these rules, its language's rules and its version,
 * and its content still hashing to that version (packs.js loadPacks). Bump it whenever the check changes:
 * scripts/test-packs.mjs fingerprints the check's code and fails until it's bumped and the fingerprint in
 * scripts/fixtures/pack-checks.json is updated. Every stored pack is then checked in full once more, at its next start.
 */
export const PACK_CHECKS = 16; // 16: a pack in a language of its own (languageDef, 12 Nov 2026); 15: a pack's teaches: "script" (8 Nov 2026); 14: a Russian word's stress mark as its reading (8 Nov 2026); 13: an item's otherGender (8 Nov 2026); 12: a copy into another learner language says its own means (6 Nov 2026); 2: a pack's own patterns as <pack id>.<id>, and same (2 Nov 2026); 3: lessons (4 Nov 2026); 4: a lesson word's article (4 Nov 2026); 5: plain cards (4 Nov 2026); 6: a lesson word's picture, and a phrase's readings (4 Nov 2026); 7: units, and a lesson's theme (4 Nov 2026); 8: version 2, one kind of item (5 Nov 2026); 9: extras and tags on a plain item (5 Nov 2026); 10: an item's shapes (5 Nov 2026); 11: an item's copyOf (5 Nov 2026)

export const PACK_LIMITS = {
  items: ITEM_LIMITS.items, // items in one pack
  lessons: 500,
  lessonWords: 12, // new words in one lesson
  words: 16, // words in one sentence
  word: 40, // characters in one word as written
  lemma: 48,
  literal: 24, // chunks in a literal line
  chunkText: 60,
  sentence: ITEM_LIMITS.side, // characters in a text, a means or a wrong version
  wrong: 3,
  options: 5,
  moved: 8,
  unitsPerItem: 4, // patterns, and chunks, on one item
  shapeMarks: SHAPE_LIMITS.marks, // marks for one concept in an item's shapes (shape-marks.js)
  shapeTag: SHAPE_LIMITS.tag, // characters in a tag's label
  shapeNote: SHAPE_LIMITS.note, // characters in a mark's note
  topics: 40,
  glossary: 5000, // entries in words
  chunks: 500,
  patterns: 100,
  name: 80,
  about: 400,
  gloss: 80,
  phrase: 120,
  reading: 120, // characters in a word's reading
  bytes: 2_000_000, // the whole pack as JSON
};

/** A pack's id (also a sync shard's name: packs.js keeps a file per pack). */
export const PACK_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
/** Whether a value is a pack's id (2 to 48 lowercase letters, digits and dashes). */
export const isPackId = (id) => typeof id === "string" && PACK_ID.test(id);
const VERSION_HEX = /^[0-9a-f]{12}$/;
const ITEM_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const PATTERN_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
// A pack's own pattern: "<pack id>.<id>" (your AI's, since 2 Nov 2026: pack-authoring.js ownPatternIds), so it never
// collides with another pack's or with what the language's shared grammar adds later; or a bare id, as before then.
// The prefix is the pack it was made in: a copy of a pack keeps it, so the two share their evidence.
const PACK_ID_EXAMPLE = "travel.diminutive";
const OWN_PATTERN_ID = /^(?:[a-z0-9][a-z0-9-]{1,47}\.)?[a-z0-9][a-z0-9-]{0,39}$/;
/** Whether a value is a pattern id, the shared grammar's or a pack's own. */
export const isPatternId = (id) => typeof id === "string" && OWN_PATTERN_ID.test(id);
const CHUNK_ID = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]{0,47}$/u;
// Hawaiian's ʻokina and Uzbek's ʻ and ʼ (U+02BB, U+02BC) are letters with no case (ʻāina, oʻzbek, taʼlim), so a
// lowercase dictionary form may hold them.
const LEMMA = { lower: /^[\p{Ll}\u02BB\u02BC](?:[\p{Ll}\p{M}\u02BB\u02BC'’ -]|[\u200C\u200D](?=\p{Ll}))*$/u, any: /^\p{L}(?:[\p{L}\p{M}'’ -]|[\u200C\u200D](?=\p{L}))*$/u };
const HAS_ALNUM = /[\p{L}\p{N}]/u;
const PACK_FIELDS = new Set(["format", "version", "id", "name", "about", "language", "languageDef", "from", "copiedFrom", "teaches", "topics", "words", "readings", "chunks", "patterns", "items", "lessons", "units"]);
// An item's fields in the learner's language: what a copy into another learner language says in its own (copyOf).
const SIDE_FIELDS = new Set(["means", "literal", "english", "moved"]);
const ITEM_FIELDS = new Set(["id", "copyOf", "topic", "concepts", "chunks", "text", "means", "reading", "words", "punct", "literal", "english", "moved", "wrong", "otherGender", "gap", "shapes", "sentence", "sentenceBack", "cloze", "extras", "tags"]);

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
// A field as text, never coerced: JSON can carry an object whose toString is null, which String() throws on.
const plain = (value) => (typeof value === "string" ? value : "");

/**
 * Text as packs keep it: NFC, without invisible characters (soft hyphen, zero-width space and joiners, word joiner,
 * byte-order mark: gone, as in books), control characters as spaces, runs of space as one, trimmed.
 */
export function cleanText(value) {
  // An object (anything JSON can carry that isn't text) is no text at all: String() on one can throw.
  return withoutInvisible((value !== null && typeof value === "object" ? "" : String(value)).normalize("NFC"))
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * An item as the screens show it in a language: its typography on the end mark and on the wrong versions (French puts
 * a narrow space before ? and !: lang/index.js typeset), so the right answer and the wrong ones look alike. Everything
 * else (id, words, what evidence reads) is the pack's own, and a pack never stores it. An item that needs nothing comes
 * back as it is.
 */
export const shownItem = (item, lang) =>
  typeof lang === "string" && Object.hasOwn(LANGUAGES, lang) && LANGUAGES[lang].spaceBefore ? { ...item, punct: endMark(lang, item.punct ?? ""), wrong: (item.wrong ?? []).map((wrong) => typeset(lang, wrong)), ...(item.otherGender ? { otherGender: { ...item.otherGender, text: typeset(lang, item.otherGender.text) } } : {}) }
    : item;

/** A sentence as two sentences are compared: lower case, with its spacing and accents as written. */
export const sameText = (a, b) => cleanText(a).toLowerCase() === cleanText(b).toLowerCase();

/** What joins a language's words: a space, or nothing (Japanese, Chinese). A language Lexicommons doesn't know: a space. */
export const separatorOf = (language) => (typeof language === "string" && Object.hasOwn(LANGUAGES, language) ? LANGUAGES[language].separator : " ");

/**
 * An item's sentence as text, its words joined as its language joins them ("Ik heb gisteren een boek gelezen."). Pass
 * the pack's language: without one the words are joined with a space, and Japanese or Chinese would show spaced out.
 */
export const itemSentence = (item, language) => (item.words ? item.words.map(([text]) => text).join(separatorOf(language)) + (item.punct ?? "") : (item.text ?? ""));

/**
 * A language's rules the check reads, as one text: how its words join, its dictionary forms' case, its own sentence
 * ends and its readings (its patterns aside: a catalog only ever gains patterns). null for a language it doesn't know.
 */
export function checkRulesOf(language) {
  if (typeof language !== "string" || !Object.hasOwn(LANGUAGES, language)) return null;
  const l = LANGUAGES[language];
  return JSON.stringify([l.separator ?? " ", l.lemmaCase ?? "lower", l.ends ?? [], l.readings ?? null]);
}

// What rules 4 to 7 changed touches only a lesson's words and units, plain cards and the readings of a phrase's words, so nothing changed for a pack with none of those:
// its proof from before still holds, and a returning learner's word bands aren't all checked again on the phone's main thread at their next start. These
// can only ever be these numbers: a later change to the rules that touches a pack with neither has to let them be checked again.
// Rules 8 are version 2, and a pack from before is upgraded mechanically (upgradePack), so what passed the rules before them still passes.
// Rules 9 only add two fields a pack checked before can't have, so a proof under 8 still holds.
// Rules 10 only add an item's shapes, which a pack checked before can't have (the field was dropped), so a proof under 9 still holds.
// Rules 11 only add an item's copyOf, which a pack checked before can't have (the field was dropped), so a proof under 10 still holds.
// Rules 12 only take a copy they refused before (one into another learner language, with its own means), so a proof under 11 still holds.
// Rules 13 only add an item's otherGender, which a pack checked before can't have (the field was dropped), so a proof under 12 still holds.
// Rules 15 only add a pack's teaches, which a pack checked before can't have (the field was dropped), so a proof under 14 still holds.
// Rules 14 only let a Russian word carry its stress mark as a reading, which a Russian pack checked before can't have (a reading was refused),
// and change no other language's, so a proof under 13 still holds (a Russian pack's proof names Russian's rules, which changed: it's checked again).
// Rules 16 only add a pack's languageDef (a language Lexicommons doesn't list), which a pack checked before can't have (the field was dropped,
// and its language was refused), so a proof under 15 still holds.
const proofStillGood = (checks, pack) => checks === PACK_CHECKS || checks === 15 || checks === 14 || checks === 13 || checks === 12 || checks === 11 || checks === 10 || checks === 9 || checks === 8 || checks === 7 || ((checks === 5 || checks === 6) && pack?.lessons === undefined) || ((checks === 3 || checks === 4) && pack?.cards === undefined && pack?.lessons === undefined);

/** What a public pack fully checked at a version is kept with: the rules it passed under, and that version. */
export const checkedProof = (pack, version) => ({ checks: PACK_CHECKS, rules: checkRulesOf(pack?.language), version });

/**
 * Whether a stored proof still holds for a pack at a version: checked under these rules and its language's as they are
 * now, at that version. The caller still hashes the content against the version (packVersion) before trusting it.
 */
export const proofHolds = (proof, pack, version) =>
  Boolean(proof) && typeof proof === "object" && proofStillGood(proof.checks, pack) && proof.rules !== null && proof.rules === checkRulesOf(pack?.language) && typeof version === "string" && proof.version === version;

/** A gap choice as written: the choice itself, or a { text, reading } choice's text. */
export const optionText = (option) => (typeof option === "string" ? option : option.text);

/** Collects problems; text() and friends report to it and return the cleaned value (undefined when unusable). */
function reporter() {
  const errors = [];
  const warnings = [];
  const r = {
    errors,
    warnings,
    error: (at, message) => void errors.push({ at, message }),
    warn: (at, message) => void warnings.push({ at, message }),
    text(value, at, max, { required = false } = {}) {
      if (value === undefined || value === null || value === "") {
        if (required) r.error(at, `${at} is missing.`);
        return undefined;
      }
      if (typeof value !== "string") return void r.error(at, `${at} must be text.`);
      const out = cleanText(value);
      if (!out) {
        if (required) r.error(at, `${at} is empty.`);
        return undefined;
      }
      if (out.length > max) return void r.error(at, `${at} is ${out.length} characters; keep it to ${max}.`);
      return out;
    },
    list(value, at, max, { min = 0 } = {}) {
      if (value === undefined || value === null) {
        if (min) r.error(at, `${at} is missing.`);
        return [];
      }
      if (!Array.isArray(value)) return r.error(at, `${at} must be a list.`), [];
      if (value.length > max) return r.error(at, `${at} has ${value.length} entries; keep it to ${max}.`), [];
      if (value.length < min) return r.error(at, `${at} has ${value.length} ${value.length === 1 ? "entry" : "entries"}; it needs at least ${min}.`), [];
      return value;
    },
    map(value, at, max) {
      if (value === undefined || value === null) return [];
      if (!isObject(value)) return r.error(at, `${at} must be { id: … }.`), [];
      const entries = Object.entries(value);
      if (entries.length > max) return r.error(at, `${at} has ${entries.length} entries; keep it to ${max}.`), [];
      return entries;
    },
    ignoreOthers(value, fields, at) {
      for (const key of Object.keys(value)) if (!fields.has(key)) r.warn(`${at}.${key}`, `${at}.${key} isn't part of a pack; it was left out.`);
    },
  };
  return r;
}

/** A lemma as the language writes its dictionary forms (w:<lemma> must mean the same in every pack and book). */
function lemmaOf(value, at, language, r) {
  const lemma = r.text(value, at, PACK_LIMITS.lemma);
  if (lemma === undefined) return undefined;
  const rule = LANGUAGES[language].lemmaCase === "any" ? "any" : "lower";
  if (!LEMMA[rule].test(lemma)) {
    // A language of their own defined as "lower" (the default) whose word is a dictionary form as written: what to change is its definition
    // (12 Nov 2026, the worked cases: Burmese's letters have no small and capital forms, and Toki Pona writes a name with its capital).
    const fix = rule === "lower" && LANGUAGES[language].own && LEMMA.any.test(lemma) ? ` For a language whose letters have no small and capital forms (Burmese, Amharic) or that writes some words with a capital (Toki Pona's names, German's nouns): language_def "case": "any".` : "";
    return void r.error(at, `${at} "${lemma}" isn't a dictionary form: ${rule === "lower" ? "lowercase letters" : "letters"}, with apostrophes, spaces or dashes inside.${fix}`);
  }
  return lemma;
}

function checkTopics(value, r) {
  const topics = {};
  for (const [id, name] of r.map(value, "topics", PACK_LIMITS.topics)) {
    if (!ITEM_ID.test(id)) {
      r.error(`topics.${id}`, `topics: "${id.slice(0, 50)}" isn't a topic id (lowercase letters, digits and dashes).`);
      continue;
    }
    const text = r.text(name, `topics.${id}`, PACK_LIMITS.name, { required: true });
    if (text) topics[id] = text;
  }
  return topics;
}

function checkGlossary(value, language, r) {
  const words = {};
  for (const [lemma, gloss] of r.map(value, "words", PACK_LIMITS.glossary)) {
    const id = lemmaOf(lemma, `words["${lemma.slice(0, 50)}"]`, language, r);
    const text = r.text(gloss, `words["${lemma.slice(0, 50)}"]`, PACK_LIMITS.gloss, { required: true });
    if (id && text) words[id] = text;
  }
  return words;
}

/** How the pack's dictionary forms are said (a language that shows readings): each checked like a word's reading. */
function checkReadings(value, language, r) {
  const readings = {};
  for (const [lemma, reading] of r.map(value, "readings", PACK_LIMITS.glossary)) {
    const at = `readings["${lemma.slice(0, 50)}"]`;
    const id = lemmaOf(lemma, at, language, r);
    const text = r.text(reading, at, PACK_LIMITS.reading, { required: true });
    if (!id || !text) continue;
    const problem = readingProblem(language, id, text);
    if (problem) r.error(at, `${at}: ${problem}.`);
    else readings[id] = text;
  }
  return readings;
}

function checkChunks(value, r) {
  const chunks = {};
  for (const [id, chunk] of r.map(value, "chunks", PACK_LIMITS.chunks)) {
    const at = `chunks.${id.slice(0, 50)}`;
    if (!CHUNK_ID.test(id)) {
      r.error(at, `chunks: "${id.slice(0, 50)}" isn't a phrase id (lowercase words joined by dashes: hoe-gaat-het).`);
      continue;
    }
    if (!isObject(chunk)) {
      r.error(at, `${at} must be { text, en, about? }.`);
      continue;
    }
    r.ignoreOthers(chunk, new Set(["text", "en", "about"]), at);
    const text = r.text(chunk.text, `${at}.text`, PACK_LIMITS.phrase, { required: true });
    const en = r.text(chunk.en, `${at}.en`, PACK_LIMITS.phrase, { required: true });
    const about = r.text(chunk.about, `${at}.about`, PACK_LIMITS.about);
    if (text && en) chunks[id] = { text, en, ...(about ? { about } : {}) };
  }
  return chunks;
}

function checkPatterns(value, catalogue, r) {
  const patterns = {};
  const entries = r.map(value, "patterns", PACK_LIMITS.patterns);
  for (const [id, pattern] of entries) {
    const at = `patterns.${id.slice(0, 50)}`;
    if (!OWN_PATTERN_ID.test(id)) {
      r.error(at, `patterns: "${id.slice(0, 50)}" isn't a pattern id (lowercase letters, digits and dashes, after the pack's id and a dot: "${PACK_ID_EXAMPLE}").`);
      continue;
    }
    if (Object.hasOwn(catalogue, id)) {
      r.warn(at, `patterns: "${id}" is already in the language's catalog ("${catalogue[id].name}"); the catalog's is used.`);
      continue;
    }
    if (!isObject(pattern)) {
      r.error(at, `${at} must be { name, about, after? }.`);
      continue;
    }
    r.ignoreOthers(pattern, new Set(["name", "about", "after", "same"]), at);
    const name = r.text(pattern.name, `${at}.name`, PACK_LIMITS.name, { required: true });
    const about = r.text(pattern.about, `${at}.about`, PACK_LIMITS.about, { required: true });
    const after = r.list(pattern.after, `${at}.after`, 8).map(plain);
    for (const other of after) {
      if (!Object.hasOwn(catalogue, other) && !(isObject(value) && Object.hasOwn(value, other))) r.error(`${at}.after`, `${at}.after: "${other.slice(0, 50)}" isn't a pattern in the catalog or this pack.`);
    }
    // The same grammar as one of the shared grammar's: named there, so its evidence and the shared one's are one unit.
    let same;
    if (pattern.same !== undefined && pattern.same !== null) {
      same = plain(pattern.same);
      if (!Object.hasOwn(catalogue, same)) r.error(`${at}.same`, `${at}.same: "${same.slice(0, 50)}" isn't a pattern of the language's shared grammar.`);
    }
    if (name && about) patterns[id] = { name, about, after, ...(same && Object.hasOwn(catalogue, same) ? { same } : {}) };
  }
  return patterns;
}

/** One item. ctx: { language, catalogue, patterns, chunks, topics } (what it may refer to). */
function checkItem(value, i, ctx, r) {
  const at = `items[${i}]`;
  if (!isObject(value)) return void r.error(at, `${at} must be an object.`);
  const errorsBefore = r.errors.length;
  const id = typeof value.id === "string" ? value.id : "";
  const name = id ? `${at} (${id.slice(0, 50)})` : at;
  if (!ITEM_ID.test(id)) r.error(`${at}.id`, `${name}: id must be lowercase letters, digits and dashes (boek-gelezen).`);
  r.ignoreOthers(value, ITEM_FIELDS, at);
  const item = { id };

  // A copy of another pack's item, carried as it is (copyOf: that pack's id; 5 Nov 2026, Dutch's category packs copy the
  // word bands' sentences): the view keys it by its source's id, so what's learned on it in either pack is one (buildView).
  // checkPack holds it to its source where that pack is there.
  if (value.copyOf !== undefined) {
    const source = plain(value.copyOf);
    if (!PACK_ID.test(source)) r.error(`${at}.copyOf`, `${name}: copyOf must be the id of the pack it's a copy from.`);
    else if (source === ctx.id) r.error(`${at}.copyOf`, `${name}: copyOf names this pack itself; it's for an item copied from another pack.`);
    else item.copyOf = source;
  }

  if (value.topic !== undefined) {
    const topic = plain(value.topic);
    if (ctx.topics.has(topic)) item.topic = topic;
    else r.error(`${at}.topic`, `${name}: topic "${topic.slice(0, 50)}" isn't one of the pack's topics.`);
  }

  // What it's an example of: patterns from the catalog or this pack, phrases from this pack or a built-in one.
  const units = (field, known, what) => {
    const ids = r.list(value[field], `${at}.${field}`, PACK_LIMITS.unitsPerItem).map((unit) => plain(unit).replace(field === "concepts" ? /^p:/ : /^c:/, ""));
    for (const unit of ids) if (!known(unit)) r.error(`${at}.${field}`, `${name}: ${what} "${unit.slice(0, 50)}" isn't ${field === "concepts" ? "in the language's catalog or the pack's patterns" : "one of the pack's chunks"}.`);
    if (new Set(ids).size !== ids.length) r.error(`${at}.${field}`, `${name}: ${field} lists the same one twice.`);
    return ids;
  };
  const concepts = units("concepts", (unit) => Object.hasOwn(ctx.catalogue, unit) || ctx.patterns.has(unit), "pattern");
  if (concepts.length || value.words !== undefined) item.concepts = concepts;
  for (const unit of concepts) if (Object.hasOwn(ctx.catalogue, unit) && ctx.catalogue[unit].retired) ctx.retired.add(unit);
  const chunks = units("chunks", (unit) => ctx.chunks.has(unit), "phrase");
  if (chunks.length) item.chunks = chunks;

  // The sentence, when it's split into its words.
  const split = value.words !== undefined;
  const words = split ? r.list(value.words, `${at}.words`, PACK_LIMITS.words, { min: 1 }) : [];
  // A words list the check refused (too long, not a list, empty: said once, above) leaves nothing to hold the text and the gap to, so
  // neither is checked against it: a sentence of 17 words was refused with its text and its gap besides.
  const wordsRefused = split && words.length === 0;
  if (split) item.words = words.map((word, w) => {
    const wat = `${at}.words[${w}]`;
    if (!Array.isArray(word) || word.length < 1 || word.length > 3) return void r.error(wat, `${name}: words[${w}] must be ["word"], ["word", "lemma"] or ["word", "lemma" or null, "reading"].`);
    const text = r.text(word[0], wat, PACK_LIMITS.word, { required: true });
    if (text !== undefined && /\s/.test(text)) r.error(wat, `${name}: words[${w}] "${text}" is more than one word; give each word its own entry.`);
    else if (text !== undefined && !HAS_ALNUM.test(text)) r.error(wat, `${name}: words[${w}] "${text}" has no letters; punctuation goes with a word, or in punct at the end.`);
    const lemma = word.length === 1 || word[1] === null ? null : lemmaOf(word[1], `${wat}[1]`, ctx.language, r);
    // How it's said: checked by script (kana that fit the word; one pinyin syllable per character).
    let reading = null;
    if (word.length === 3 && word[2] !== null) {
      reading = r.text(word[2], `${wat}[2]`, PACK_LIMITS.reading, { required: true }) ?? null;
      const problem = reading && text !== undefined ? readingProblem(ctx.language, text, reading) : null;
      if (problem) {
        r.error(`${wat}[2]`, `${name}: words[${w}] "${text}": ${problem}.`);
        reading = null;
      }
    }
    if (text === undefined || lemma === undefined) return undefined;
    if (reading === null && text !== undefined && needsReading(ctx.language, text)) ctx.unread.add(text);
    // A word of a fixed phrase is learned as the phrase, and its reading stays (lessons: a first lesson of phrases).
    if ((reading !== null && lemma === null) && !(item.chunks ?? []).length) ctx.readingNoLemma.add(text);
    return reading !== null ? [text, lemma, reading] : lemma !== null ? [text, lemma] : [text];
  });
  const punct = value.punct === undefined ? "" : typeof value.punct === "string" ? value.punct.trim() : null;
  const own = LANGUAGES[ctx.language].ends ?? [];
  if (punct !== "" && !sentenceEnds(ctx.language).includes(punct)) r.error(`${at}.punct`, `${name}: punct must be one of . ? ! …${own.map((end) => ` ${end}`).join("")} or "" (got ${punct === null ? "something that isn't text" : `"${punct.slice(0, 10)}"`}).`);
  if (split) item.punct = punct;
  else if (value.punct !== undefined) r.error(`${at}.punct`, `${name}: punct ends a sentence's words; without words, it's part of text.`);
  const texts = (item.words ?? []).map((word) => word?.[0]);

  // What it says, and what it means. With words, what it says is those words: a text that says otherwise is a slip.
  const sentence = split && texts.every(Boolean) ? texts.join(separatorOf(ctx.language)) + punct : null;
  if (split && !wordsRefused && value.text !== undefined && sentence !== null && cleanText(value.text) !== cleanText(sentence)) r.error(`${at}.text`, `${name}: text says "${plain(value.text).slice(0, 80)}", but its words say "${sentence.slice(0, 80)}".`);
  item.text = split ? (sentence ?? undefined) : r.text(value.text, `${at}.text`, PACK_LIMITS.sentence, { required: true });
  item.means = r.text(value.means, `${at}.means`, PACK_LIMITS.sentence, { required: value.cloze === undefined });
  Object.assign(item, checkPlainFields(value, item.text, at, name, r));

  // The literal line.
  const literal = value.literal === undefined ? [] : r.list(value.literal, `${at}.literal`, PACK_LIMITS.literal, { min: 1 });
  if (value.literal !== undefined) item.literal = literal.map((chunk, c) => {
    const cat = `${at}.literal[${c}]`;
    if (!Array.isArray(chunk) || chunk.length < 1 || chunk.length > 2) return void r.error(cat, `${name}: literal[${c}] must be ["text"] or ["text", true] (moved).`);
    const text = r.text(chunk[0], cat, PACK_LIMITS.chunkText, { required: true });
    if (chunk.length === 2 && typeof chunk[1] !== "boolean") r.error(cat, `${name}: literal[${c}][1] must be true (moved) or false.`);
    return text === undefined ? undefined : chunk[1] === true ? [text, true] : [text];
  });
  if (value.english === null || value.english === undefined) {
    if (value.literal !== undefined) item.english = null;
  } else if (value.literal === undefined) r.error(`${at}.english`, `${name}: english orders the literal line, so it needs one.`);
  else if (!Array.isArray(value.english) || value.english.length !== literal.length || new Set(value.english).size !== literal.length || !value.english.every((n) => Number.isInteger(n) && n >= 0 && n < literal.length)) {
    r.error(`${at}.english`, `${name}: english must list each literal chunk's index once, in English order (${literal.length} indexes), or be null.`);
  } else item.english = value.english.slice();

  if (split || value.moved !== undefined) item.moved = [];
  for (const [m, word] of r.list(value.moved, `${at}.moved`, PACK_LIMITS.moved).entries()) {
    const text = r.text(word, `${at}.moved[${m}]`, PACK_LIMITS.word, { required: true });
    if (text === undefined) continue;
    if (!texts.includes(text)) r.error(`${at}.moved[${m}]`, `${name}: moved "${text}" isn't one of the sentence's words as written.`);
    else if (!item.moved.includes(text)) item.moved.push(text);
  }

  if (value.wrong !== undefined) {
    item.wrong = r.list(value.wrong, `${at}.wrong`, PACK_LIMITS.wrong, { min: 1 }).map((wrong, w) => r.text(wrong, `${at}.wrong[${w}]`, PACK_LIMITS.sentence, { required: true }));
    if (item.text && item.wrong.some((wrong) => wrong && sameText(wrong, item.text))) r.error(`${at}.wrong`, `${name}: a wrong version is the sentence itself.`);
    if (new Set(item.wrong.map((wrong) => wrong?.toLowerCase())).size !== item.wrong.length) r.error(`${at}.wrong`, `${name}: the wrong versions must all be different.`);
  }

  // The same sentence for the other gender (Obrigado / Obrigada): another sentence, whose gender and whose words they are, said.
  if (value.otherGender !== undefined) {
    const oat = `${at}.otherGender`;
    const other = value.otherGender;
    if (!isObject(other)) r.error(oat, `${name}: otherGender must be { text, gender, who }.`);
    else {
      const extra = Object.keys(other).filter((key) => !["text", "gender", "who"].includes(key));
      if (extra.length) r.warn(oat, `${name}: otherGender takes text, gender and who (${extra.map((key) => key.slice(0, 20)).join(", ")} left out).`);
      const text = r.text(other.text, `${oat}.text`, PACK_LIMITS.sentence, { required: true });
      if (other.gender !== "f" && other.gender !== "m") r.error(`${oat}.gender`, `${name}: otherGender.gender must be "f" or "m": whose sentence it is.`);
      if (other.who !== "speaker" && other.who !== "listener") r.error(`${oat}.who`, `${name}: otherGender.who must be "speaker" (it's how they say it) or "listener" (it's how it's said to them).`);
      if (text !== undefined && item.text && sameText(text, item.text)) r.error(`${oat}.text`, `${name}: otherGender.text is the sentence itself; give the other gender's.`);
      else if (text !== undefined && (item.wrong ?? []).some((wrong) => wrong && sameText(wrong, text))) r.error(`${oat}.text`, `${name}: otherGender.text is one of its wrong versions.`);
      else if (text !== undefined && (other.gender === "f" || other.gender === "m") && (other.who === "speaker" || other.who === "listener")) item.otherGender = { text, gender: other.gender, who: other.who };
    }
  }

  if (value.gap === undefined) {
    // Nothing to fill.
  } else if (!split) r.error(`${at}.gap`, `${name}: a gap names one of its words, so it needs words.`);
  else if (wordsRefused) {
    // Said with its words.
  } else if (!isObject(value.gap)) r.error(`${at}.gap`, `${name}: gap must be { index, options }.`);
  else {
    const index = value.gap.index;
    // Each choice as written, or { text, reading } in a language that shows readings (checked as words' are).
    const options = r.list(value.gap.options, `${at}.gap.options`, PACK_LIMITS.options, { min: 2 }).map((option, o) => {
      const oat = `${at}.gap.options[${o}]`;
      if (!isObject(option)) return r.text(option, oat, PACK_LIMITS.word, { required: true });
      const extra = Object.keys(option).filter((key) => key !== "text" && key !== "reading");
      if (extra.length) return void r.error(oat, `${name}: gap.options[${o}] is the word as written or { text, reading } (not ${extra.map((key) => key.slice(0, 20)).join(", ")}).`);
      const text = r.text(option.text, `${oat}.text`, PACK_LIMITS.word, { required: true });
      const reading = r.text(option.reading, `${oat}.reading`, PACK_LIMITS.reading, { required: true });
      if (text === undefined || reading === undefined) return undefined;
      const problem = readingProblem(ctx.language, text, reading);
      if (problem) return void r.error(`${oat}.reading`, `${name}: gap.options[${o}] "${text}": ${problem}.`);
      return { text, reading };
    });
    const written = options.map((option) => (option === undefined ? undefined : optionText(option)));
    if (!Number.isInteger(index) || index < 0 || index >= words.length) r.error(`${at}.gap.index`, `${name}: gap.index must be a word's position in words (0 to ${Math.max(0, words.length - 1)}).`);
    else if (texts[index] !== undefined && !written.includes(texts[index])) r.error(`${at}.gap.options`, `${name}: gap.options must include the word as written ("${texts[index]}").`);
    if (new Set(written).size !== written.length) r.error(`${at}.gap.options`, `${name}: gap.options must all be different.`);
    // Choices with readings show them together, so none may stand out: once one has a reading, every choice that
    // wants one has it, and the right one has the sentence's own.
    const read = options.filter((option) => isObject(option));
    if (read.length && Number.isInteger(index) && item.words[index]) {
      const right = options[written.indexOf(texts[index])];
      const own = item.words[index][2] ?? null;
      if (own === null && isObject(right)) r.error(`${at}.gap.options`, `${name}: the right choice "${texts[index]}" has a reading, but the sentence's word has none.`);
      else if (own !== null && (!isObject(right) || right.reading !== own)) r.error(`${at}.gap.options`, `${name}: the right choice "${texts[index]}" needs the sentence's reading (${own}), as the other choices have theirs.`);
      const bare = written.filter((text, o) => text !== undefined && typeof options[o] === "string" && needsReading(ctx.language, text));
      if (bare.length) r.error(`${at}.gap.options`, `${name}: ${bare.join(", ")} ${bare.length === 1 ? "has" : "have"} no reading while the other choices do; give every choice its reading, or none.`);
    } else if (!read.length && LANGUAGES[ctx.language].readings === "vowels" && Number.isInteger(index) && item.words[index]?.[2] && needsReading(ctx.language, texts[index])) {
      ctx.unmarkedGaps.add(`${texts[index]} (${name})`);
    }
    item.gap = { index, options };
  }

  // How its rule is drawn, per concept (shape-marks.js): checked against its words and concepts, a mark that doesn't fit dropped with
  // a warning, never the item.
  const shapes = checkShapes(value.shapes, { at: `${at}.shapes`, name, words: texts.map((text) => text ?? ""), concepts, r });
  if (shapes) item.shapes = shapes;

  return r.errors.length === errorsBefore ? orderedItem(item) : undefined;
}

/**
 * Checks a pack (see the top). Every error and warning comes back at once; the pack comes back as it would be kept,
 * or null when anything is wrong.
 */
// A pack's lessons (optional): what each teaches and the sentences it runs on, every id one this pack has.
function checkLessons(value, { items, chunks, patterns, units }, r) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return r.error("lessons", "lessons must be a list."), [];
  if (value.length > PACK_LIMITS.lessons) return r.error("lessons", `A pack holds at most ${PACK_LIMITS.lessons} lessons.`), [];
  const ids = new Set(items.map((item) => item.id));
  const seen = new Set();
  return value.flatMap((lesson, i) => {
    const at = `lessons[${i}]`;
    if (!isObject(lesson)) return r.error(at, `${at} must be an object.`), [];
    const id = plain(lesson.id);
    if (!PACK_ID.test(id) && !/^[a-z0-9-]{1,48}$/.test(id)) r.error(`${at}.id`, `${at}: id must be lowercase letters, digits and dashes.`);
    if (seen.has(id)) r.error(`${at}.id`, `${at}: another lesson has the id ${id}.`);
    seen.add(id);
    const title = r.text(lesson.title, `${at}.title`, PACK_LIMITS.name, { required: true });
    const words = Array.isArray(lesson.words) ? lesson.words.slice(0, PACK_LIMITS.lessonWords).flatMap((word, w) => {
      if (!isObject(word) || !plain(word.lemma) || !Array.isArray(word.forms) || word.forms.some((form) => !plain(form))) return r.error(`${at}.words[${w}]`, `${at}: a word is { lemma, forms, means }.`), [];
      const article = word.article === undefined ? null : r.text(word.article, `${at}.words[${w}].article`, 24);
      const picture = word.picture === undefined ? null : plain(word.picture);
      if (word.picture !== undefined && !/^[a-z0-9-]{1,48}$/.test(picture)) r.error(`${at}.words[${w}].picture`, `${at}: a picture is a concept id, lowercase words joined by dashes.`);
      return [{ lemma: plain(word.lemma), forms: word.forms.map(plain), ...(article ? { article } : {}), ...(picture ? { picture } : {}), means: r.text(word.means, `${at}.words[${w}].means`, PACK_LIMITS.sentence) }];
    }) : [];
    if (lesson.words !== undefined && !Array.isArray(lesson.words)) r.error(`${at}.words`, `${at}: words must be a list.`);
    const phrases = Array.isArray(lesson.phrases) ? lesson.phrases.map(plain) : [];
    for (const phrase of phrases) if (!chunks.has(phrase)) r.error(`${at}.phrases`, `${at}: the phrase "${phrase.slice(0, 40)}" isn't one of the pack's chunks.`);
    let concept = null;
    if (lesson.concept !== undefined && lesson.concept !== null) {
      if (!isObject(lesson.concept) || !patterns.has(plain(lesson.concept.pattern))) r.error(`${at}.concept`, `${at}: concept must name a pattern of the language or the pack.`);
      else concept = { pattern: plain(lesson.concept.pattern), line: r.text(lesson.concept.line, `${at}.concept.line`, PACK_LIMITS.sentence, { required: true }) };
    }
    const unit = lesson.unit === undefined ? null : plain(lesson.unit);
    if (units.size && !units.has(unit)) r.error(`${at}.unit`, `${at}: every lesson names one of the pack's units.`);
    else if (!units.size && unit) r.error(`${at}.unit`, `${at}: the pack has no units for it to be in.`);
    const theme = lesson.theme === undefined ? null : plain(lesson.theme);
    if (theme !== null && !/^[a-z0-9-]{1,32}$/.test(theme)) r.error(`${at}.theme`, `${at}: a theme is an id, lowercase words joined by dashes.`);
    const held = Array.isArray(lesson.items) ? lesson.items.map(plain) : [];
    for (const item of held) if (!ids.has(item)) r.error(`${at}.items`, `${at}: "${item.slice(0, 40)}" isn't one of the pack's items.`);
    if (!held.length) r.error(`${at}.items`, `${at}: a lesson runs on at least one sentence.`);
    return [{ id, title, ...(unit ? { unit } : {}), ...(theme ? { theme } : {}), words, phrases, concept, items: held }];
  });
}

// A path's sections, in order: { id, title }.
function checkUnits(value, r) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return r.error("units", "units must be a list."), [];
  if (value.length > PACK_LIMITS.lessons) return r.error("units", `A pack holds at most ${PACK_LIMITS.lessons} units.`), [];
  const seen = new Set();
  return value.flatMap((unit, i) => {
    const at = `units[${i}]`;
    if (!isObject(unit)) return r.error(at, `${at} must be an object.`), [];
    const id = plain(unit.id);
    if (!/^[a-z0-9-]{1,48}$/.test(id)) r.error(`${at}.id`, `${at}: id must be lowercase letters, digits and dashes.`);
    if (seen.has(id)) r.error(`${at}.id`, `${at}: another unit has the id ${id}.`);
    seen.add(id);
    return [{ id, title: r.text(unit.title, `${at}.title`, PACK_LIMITS.name, { required: true }) }];
  });
}

// A unit's lessons sit next to each other, the units in their order.
function checkUnitOrder(units, lessons, r) {
  const order = lessons.map((lesson) => lesson.unit).filter((unit, i, all) => unit && unit !== all[i - 1]);
  const named = units.map((unit) => unit.id).filter((id) => order.includes(id));
  if (new Set(order).size !== order.length || order.some((id, i) => id !== named[i])) r.error("lessons", "A unit's lessons must sit next to each other, with the units in their order.");
  const empty = units.filter((unit) => !order.includes(unit.id));
  if (empty.length) r.error("units", `No lesson is in ${empty[0].id}.`);
}

// A generator run to its end at once (know/slices.js whole; this module is the Worker's too, so it has its own).
function whole(steps) {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * A pack in a language Lexicommons doesn't list carries that language's rules (languageDef). Checked whole, the language is in the registry
 * for that check alone (lang/index.js withOwnLanguage), so a server, which serves every account, never keeps one; a device adds a learner's
 * own languages for good (useLanguage) before it checks their packs a piece at a time.
 */
export function checkPack(given, options) {
  const value = isObject(given) ? given : null;
  return value && typeof value.language === "string" && !isOurLanguage(value.language)
    ? withOwnLanguage(value.language, value.languageDef, () => whole(checkPackSteps(given, options)))
    : whole(checkPackSteps(given, options));
}

/**
 * checkPack a piece at a time: a generator that yields between pieces, so a sync can check a big pack between frames (know/slices.js
 * inSlices; study/packs.js ensure). Run whole, it's checkPack: the same code, the same answer.
 */
export function* checkPackSteps(given, { installed: others_ = [] } = {}) {
  const value = upgradePack(given);
  const installed = others_.map(upgradePack);
  const r = reporter();
  const done = (pack) => ({ pack: r.errors.length ? null : pack, errors: r.errors, warnings: r.warnings });
  if (!isObject(value)) return r.error("pack", "A pack must be an object."), done(null);
  if (value.format !== PACK_FORMAT) r.error("format", `format must be "${PACK_FORMAT}".`);
  if (value.version !== PACK_VERSION) r.error("version", `version must be ${PACK_VERSION}.`);
  // Covers are personal (read/cover-svg.js): they stay on your devices, so a pack, which can be shared, never carries one.
  if (value.cover !== undefined) r.error("cover", "A pack carries no cover: covers stay on the person's own devices, and nothing shared ever carries one.");
  r.ignoreOthers(value, PACK_FIELDS, "pack");
  let size = 0;
  try {
    // JSON.stringify(value).length, a piece at a time (jsonLength): whole, a big pack's text was a fifth of a frame's budget at 4×.
    size = yield* jsonLength(value);
  } catch {
    r.error("pack", "The pack can't be written as JSON.");
  }
  if (size > PACK_LIMITS.bytes) return r.error("pack", `The pack is ${size} bytes; keep it under ${PACK_LIMITS.bytes}.`), done(null);
  yield;

  const id = typeof value.id === "string" ? value.id : "";
  if (!PACK_ID.test(id)) r.error("id", "id must be 2 to 48 lowercase letters, digits and dashes.");
  const name = r.text(value.name, "name", PACK_LIMITS.name, { required: true });
  const about = r.text(value.about, "about", PACK_LIMITS.about);
  const language = plain(value.language);
  const from = plain(value.from);
  // One of ours takes no languageDef; any other language comes with its own (lang/index.js ownLanguageProblem), and on a device it's the
  // definition the device holds for it (a device keeps one: its other packs in the language were made with it).
  let languageDef;
  if (isOurLanguage(language)) {
    if (value.languageDef !== undefined) r.error("languageDef", `${LANGUAGES[language].name} is one Lexicommons knows: its pack takes no languageDef.`);
  } else {
    const problem = ownLanguageProblem(language, value.languageDef);
    if (problem) {
      r.error(problem.at, problem.at === "language" ? `${problem.message} (Lexicommons' own: ${ourLanguages().join(", ")}.)` : problem.message);
      return done(null);
    }
    if (!sameOwnLanguage(language, value.languageDef)) {
      r.error("languageDef", Object.hasOwn(LANGUAGES, language)
        ? `${LANGUAGES[language].name} is on this device as ${JSON.stringify(LANGUAGES[language].def)}: a pack in it says the same (it says ${JSON.stringify(ownLanguageDef(value.languageDef))}).`
        : "A pack in a language of its own is checked whole (checkPack), or after its language is added on this device (lang/index.js useLanguage).");
      return done(null);
    }
    languageDef = ownLanguageDef(value.languageDef);
  }
  if (!isOurLanguage(from)) r.error("from", `from "${from.slice(0, 20)}" isn't a language Lexicommons knows (${ourLanguages().join(", ")}).`);
  else if (from === language) r.error("from", "from must be a different language from language.");
  let copiedFrom;
  if (value.copiedFrom !== undefined) {
    const c = value.copiedFrom;
    if (!isObject(c) || !PACK_ID.test(plain(c.id)) || !VERSION_HEX.test(plain(c.version))) r.error("copiedFrom", "copiedFrom must be { id, version }: the public pack's id and its 12-character version.");
    else copiedFrom = { id: c.id, version: c.version };
  }
  let teaches;
  if (value.teaches !== undefined) {
    if (value.teaches !== "script") r.error("teaches", 'teaches is "script" (a pack that teaches how a script is read), or left out.');
    else teaches = "script";
  }

  // What the items may refer to: this pack's own, the catalog, and (for phrases and topics) the default packs'.
  const others = installed.filter((pack) => pack && pack.language === language && pack.id !== id);
  const catalogue = LANGUAGES[language].patterns ?? {};
  const topics = checkTopics(value.topics, r);
  const words = checkGlossary(value.words, language, r);
  yield;
  const readings = checkReadings(value.readings, language, r);
  yield;
  const chunks = checkChunks(value.chunks, r);
  const patterns = checkPatterns(value.patterns, catalogue, r);
  const builtIn = others.filter((pack) => pack.builtIn);
  const ctx = {
    id,
    language,
    catalogue,
    patterns: new Set(Object.keys(patterns)),
    chunks: new Set([...Object.keys(chunks), ...builtIn.flatMap((pack) => Object.keys(pack.chunks ?? {}))]),
    topics: new Set([...Object.keys(topics), ...builtIn.flatMap((pack) => Object.keys(pack.topics ?? {}))]),
    // Words that want a reading and have none; words with a reading but no lemma (it could never fade).
    unread: new Set(),
    readingNoLemma: new Set(),
    // Gaps whose word shows its vowel marks, with choices that have none.
    unmarkedGaps: new Set(),
    // The language's patterns that are retired (lang/grammar.js), still used here.
    retired: new Set(),
  };

  const items = [];
  const ids = new Set();
  const sentences = new Map();
  // Each sentence of the other packs, with which item it is: a copy (copyOf) is its source's item, so a band and the
  // packs that copy from it hold one item, not the same sentence twice.
  const elsewhere = new Map();
  let made = 0;
  for (const pack of others) {
    for (const item of sentencesOf(pack)) {
      elsewhere.set(itemSentence(item, language).toLowerCase(), { name: `${pack.name} (${item.id})`, same: `${item.copyOf ?? pack.id}/${item.id}` });
      if (++made % 64 === 0) yield;
    }
  }
  const glossed = new Set(Object.keys(words));
  for (const pack of others) {
    for (const lemma of Object.keys(pack.words ?? {})) glossed.add(lemma);
    yield;
  }
  const unglossed = new Set();
  for (const [i, raw] of r.list(value.items, "items", PACK_LIMITS.items).entries()) {
    if (i % 16 === 15) yield;
    const item = checkItem(raw, i, ctx, r);
    if (!item) continue;
    const at = `items[${i}] (${item.id})`;
    if (ids.has(item.id)) r.error(`items[${i}].id`, `${at}: another item in the pack has this id.`);
    ids.add(item.id);
    // A copy is its source's item exactly, where the source is here: a band's new version that changed the sentence
    // would otherwise split one item into two texts under one id. Where the source isn't here, it's taken as it says.
    // A copy into another learner language (its pack's from isn't the source's: the English starter's copies, one per
    // language a learner speaks, 6 Nov 2026) carries the sentence as it is and says it in its own language: its means,
    // literal line, natural-order line and moved words are its own, and everything else is the source's.
    if (item.copyOf) {
      const source = others.find((pack) => pack.id === item.copyOf);
      const original = source ? (source.items ?? []).find((one) => one?.id === item.id) : undefined;
      const { copyOf, ...copied } = item;
      const across = Boolean(source) && plain(source.from) !== from;
      const carried = (one) => JSON.stringify(across ? Object.fromEntries(Object.entries(one).filter(([key]) => !SIDE_FIELDS.has(key))) : one);
      if (source && !original) r.error(`items[${i}].copyOf`, `${at}: it's a copy from ${copyOf}, which has no item ${item.id}.`);
      else if (original && carried(orderedItem(original)) !== carried(copied)) r.error(`items[${i}].copyOf`, `${at}: it isn't ${copyOf}'s item ${item.id} as it is now; a copy is carried unchanged${across ? ", but for what it says in its own learner language (means, literal, english, moved)" : ""} (or leave out copyOf, and it's an item of its own).`);
    }
    // Two sentences the same is a slip. Two plain items may share a text and mean different things (bank, bank).
    if (item.words) {
      const key = itemSentence(item, language).toLowerCase();
      if (sentences.has(key)) r.error(`items[${i}]`, `${at}: the same sentence as ${sentences.get(key)}.`);
      // (The same item in another pack, its source or another copy of it, is no second sentence.)
      else if (elsewhere.has(key) && elsewhere.get(key).same !== `${item.copyOf ?? id}/${item.id}`) r.warn(`items[${i}]`, `${at}: you already have this sentence, in ${elsewhere.get(key).name}.`);
      sentences.set(key, `items[${i}] (${item.id})`);
      for (const [, lemma] of item.words) if (lemma && !glossed.has(lemma)) unglossed.add(lemma);
    }
    items.push(item);
  }
  yield;
  const some = (set) => `${[...set].slice(0, 20).join(", ")}${set.size > 20 ? ` and ${set.size - 20} more` : ""}`;
  // A dictionary form the pack uses that wants a reading and has none (here or in another pack of the language).
  const said = new Set([...Object.keys(readings), ...others.flatMap((pack) => Object.keys(pack.readings ?? {}))]);
  const unsaid = new Set(items.flatMap((item) => (item.words ?? []).map(([, lemma]) => lemma)).filter((lemma) => lemma && needsReading(language, lemma) && !said.has(lemma)));
  if (unsaid.size) r.warn("readings", `No reading for the dictionary forms ${some(unsaid)}: add them to readings, so Match and a word's page can show how each is said.`);
  if (ctx.unread.size) r.warn("words", `No reading for ${some(ctx.unread)}: add each word's reading (${{ kana: "in hiragana", pinyin: "in pinyin with tone marks, a syllable per character", jyutping: "in Jyutping with tone numbers, a syllable per character (nei5 hou2)", paiboon: "in Paiboon+, its syllables joined by hyphens, each tone marked on its first vowel", vowels: "the word with its vowel marks" }[LANGUAGES[language].readings] ?? "as it's said"}), so a learner can say it.`);
  if (ctx.unmarkedGaps.size) r.warn("items", `Fill shows the choices for ${some(ctx.unmarkedGaps)} without vowel marks, though the word has them in its sentence: give each choice its reading ({ text, reading }).`);
  if (ctx.readingNoLemma.size) r.warn("words", `${some(ctx.readingNoLemma)} ${ctx.readingNoLemma.size === 1 ? "has" : "have"} a reading but no dictionary form: a reading fades as you learn the word, so give it its lemma.`);
  if (ctx.retired.size) r.warn("patterns", `${some(ctx.retired)} ${ctx.retired.size === 1 ? "is" : "are"} retired from the language's shared grammar: no longer offered, though what uses ${ctx.retired.size === 1 ? "it" : "them"} still works. Move these sentences to another pattern.`);
  if (unglossed.size) r.warn("words", `No gloss for ${[...unglossed].slice(0, 20).join(", ")}${unglossed.size > 20 ? ` and ${unglossed.size - 20} more` : ""}: add them to words, so the word games and the word's page can show its meaning.`);

  yield;
  const units = checkUnits(value.units, r);
  const lessons = checkLessons(value.lessons, { items, chunks: ctx.chunks, patterns: new Set([...Object.keys(catalogue), ...Object.keys(patterns)]), units: new Set(units.map((unit) => unit.id)) }, r);
  checkUnitOrder(units, lessons, r);
  // A script's cards are a letter and how it's said, played as a deck: nothing else the games of a script would ask wrongly.
  if (teaches) {
    const others = items.filter((item) => isSentence(item) || item.cloze || !item.means).map((item) => item.id);
    if (others.length) r.error("items", `A pack that teaches a script has only cards of a letter and how it's said: ${others.slice(0, 5).join(", ")}${others.length > 5 ? ` and ${others.length - 5} more` : ""} ${others.length === 1 ? "isn't one" : "aren't"}.`);
    if (lessons.length || units.length) r.error("lessons", "A pack that teaches a script has no lessons or units: its cards are played as a deck.");
  }
  return done({
    format: PACK_FORMAT,
    version: PACK_VERSION,
    id,
    name,
    ...(about ? { about } : {}),
    language,
    ...(languageDef ? { languageDef } : {}),
    from,
    ...(copiedFrom ? { copiedFrom } : {}),
    ...(teaches ? { teaches } : {}),
    topics,
    words,
    ...(Object.keys(readings).length ? { readings } : {}),
    chunks,
    patterns,
    items,
    ...(lessons.length ? { lessons } : {}),
    ...(units.length ? { units } : {}),
  });
}

/**
 * What studying a language draws on: the packs of that language that are on (isOn(id); all of them by default), in
 * the order given (built-in packs first). Items keep their order and get their pack and an app-wide id.
 * What a word, phrase, topic or pattern means never depends on which packs are on: it's the language's glossary (the
 * catalog's patterns, then the first pack, on or off, to name each). The view picks which of them are in play: the
 * whole catalog, what the packs that are on name, and whatever their items use (an item may use a built-in pack's
 * phrase or topic, or a word another pack glosses).
 * A pack's own pattern that's the same as a shared one (same) is the shared one here: its items name the shared id, and
 * aliases says which own ids are which shared ones (for the evidence: progress.js setUnitAliases).
 * Returns { language, packs, items, lessons, patterns, words, chunks, topics, glossary, aliases }:
 *   packs     every pack of the language, on or off: [{ id, name, about, language, from, builtIn, on, items, cards?, origin? }] (items: how many
 *             are sentences; cards: how many are plain items, which only a session on the pack plays)
 *             (builtIn: a default pack, one everyone has; origin: where a public pack came from, { kind, version })
 *   glossary  { patterns, words, readings, chunks, topics }: everything every pack of the language names (for naming
 *             evidence)
 */
// The packs whose items keep their own ids in the app: the starter, whose evidence since 26 Oct 2026 uses them.
const BARE_ITEM_IDS = new Set(["starter-word-order"]);

export function buildView(packs, language, options) {
  return whole(buildViewSteps(packs, language, options));
}

/** buildView a piece at a time (as checkPackSteps): content.js works out a view this way while a sync's packs arrive. Run whole, it's buildView. */
export function* buildViewSteps(packs, language, { isOn = () => true } = {}) {
  const catalogue = LANGUAGES[language]?.patterns ?? {};
  const ofLanguage = packs.filter((pack) => pack.language === language);
  const glossary = { patterns: { ...catalogue }, words: {}, readings: {}, chunks: {}, topics: {} };
  for (const pack of ofLanguage) {
    for (const key of Object.keys(glossary)) {
      for (const [id, value] of Object.entries(pack[key] ?? {})) if (!Object.hasOwn(glossary[key], id)) glossary[key][id] = value;
      yield;
    }
  }

  // A pack's own pattern that's the same as one of the shared grammar's (same): its sentences count for the shared one,
  // and its evidence and the shared one's are one unit (content.js hands these to progress.js).
  const aliases = {};
  for (const [id, pattern] of Object.entries(glossary.patterns)) if (!Object.hasOwn(catalogue, id) && typeof pattern?.same === "string" && Object.hasOwn(catalogue, pattern.same)) aliases[id] = pattern.same;
  const view = { language, packs: [], items: [], lessons: [], patterns: { ...catalogue }, words: {}, readings: {}, chunks: {}, topics: {}, glossary, aliases };
  const use = (key, id) => {
    if (key === "patterns" && Object.hasOwn(aliases, id)) return;
    if (id && !Object.hasOwn(view[key], id) && Object.hasOwn(glossary[key], id)) view[key][id] = glossary[key][id];
  };
  // An item's app-wide id: <pack>/<id>, a copy's its source's (copyOf), a starter's its own. The same item brought by two
  // packs that are on is in the view once, from the first of them (the packs' order: built-in first, the catalog's).
  const appId = (pack, item) => {
    const source = item.copyOf ?? pack.id;
    return BARE_ITEM_IDS.has(source) ? item.id : `${source}/${item.id}`;
  };
  const shown = new Set();
  for (const pack of ofLanguage) {
    const on = Boolean(isOn(pack.id));
    const sentences = sentencesOf(pack);
    view.packs.push({ id: pack.id, name: pack.name, ...(pack.about ? { about: pack.about } : {}), language: pack.language, from: pack.from, builtIn: Boolean(pack.builtIn), on, items: sentences.length, ...(sentences.length < pack.items.length ? { cards: pack.items.length - sentences.length } : {}), ...(pack.origin ? { origin: pack.origin } : {}) });
    if (!on) continue;
    let made = 0;
    for (const item of sentences) {
      if (++made % 64 === 0) yield;
      const aliased = item.concepts.some((id) => Object.hasOwn(aliases, id));
      const concepts = aliased ? [...new Set(item.concepts.map((id) => aliases[id] ?? id))] : item.concepts;
      // Its shapes under the same names as its concepts, so a sheet looking up the catalog's id finds them.
      const shapes = aliased && item.shapes ? { shapes: renameShapes(item.shapes, aliases) } : {};
      const id = appId(pack, item);
      if (shown.has(id)) continue;
      shown.add(id);
      view.items.push({ ...item, concepts, ...shapes, id, pack: pack.id });
    }
    yield;
    const ownIds = new Map(pack.items.map((item) => [item.id, appId(pack, item)]));
    for (const [n, lesson] of (pack.lessons ?? []).entries()) {
      if (n % 64 === 63) yield;
      view.lessons.push({ ...lesson, ...(lesson.unit ? { unit: { id: `${pack.id}/${lesson.unit}`, title: pack.units.find((one) => one.id === lesson.unit).title } } : {}), id: `${pack.id}/${lesson.id}`, pack: pack.id, items: lesson.items.map((id) => ownIds.get(id) ?? (BARE_ITEM_IDS.has(pack.id) ? id : `${pack.id}/${id}`)) });
    }
    yield;
    for (const key of ["patterns", "words", "readings", "chunks", "topics"]) {
      for (const id of Object.keys(pack[key] ?? {})) use(key, id);
      yield;
    }
  }
  let used = 0;
  for (const item of view.items) {
    if (++used % 64 === 0) yield;
    for (const id of item.chunks ?? []) use("chunks", id);
    for (const [, lemma] of item.words) {
      use("words", lemma);
      use("readings", lemma);
    }
    use("topics", item.topic);
  }
  return view;
}

// ---------- public packs in the open library ----------

/** The text a public pack is stored as, and versioned by: the checked pack's JSON. */
export const packText = (pack) => JSON.stringify(pack);

/** A checked pack's version: the first 12 hex of its JSON's sha256. The same content always gets the same version. */
export async function packVersion(pack) {
  return versionOfBytes(new TextEncoder().encode(packText(pack)));
}

/** A version from a pack's text as UTF-8 bytes (packText's, or packBytesSteps'): the first 12 hex of their sha256. */
export async function versionOfBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

/**
 * packText as UTF-8 bytes, a piece at a time (a generator, as checkPackSteps): the pack's fields stringified one by one and its items a few
 * at a time, joined. That's JSON.stringify's own text (an object's is its own enumerable fields' in order, those it can write; an array's its
 * elements', null for one it can't), so the bytes are packText's exactly. A pack, or items, with a toJSON of their own are stringified whole.
 * A sync hashes a big pack this way (study/packs.js ensure): whole, path-nl's text held a slowed phone's page for a quarter of a frame's budget.
 */
export function* packBytesSteps(pack) {
  const encoder = new TextEncoder();
  const parts = [];
  let length = 0;
  for (const text of yield* jsonPieces(pack)) {
    const bytes = encoder.encode(text);
    parts.push(bytes);
    length += bytes.length;
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

/** JSON.stringify(value).length, a piece at a time (checkPackSteps' size). */
function* jsonLength(value) {
  let length = 0;
  for (const text of yield* jsonPieces(value)) length += text.length;
  return length;
}

// JSON.stringify(value) as pieces whose joining is it, worked out a few items at a time. Whole where its parts could write differently from
// within (a toJSON, which is asked with its key), or where there's no object to take apart. Throws what JSON.stringify throws.
function* jsonPieces(value) {
  const plainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && typeof v.toJSON !== "function";
  if (!plainObject(value)) return [JSON.stringify(value)];
  const pieces = ["{"];
  let first = true;
  for (const key of Object.keys(value)) {
    const field = value[key];
    if (Array.isArray(field) && typeof field.toJSON !== "function" && !field.some((one) => one !== null && typeof one === "object" && typeof one.toJSON === "function")) {
      pieces.push(`${first ? "" : ","}${JSON.stringify(key)}:[`);
      for (let i = 0; i < field.length; i++) {
        if (i % 64 === 63) yield;
        pieces.push(`${i ? "," : ""}${JSON.stringify(field[i]) ?? "null"}`);
      }
      pieces.push("]");
      first = false;
      continue;
    }
    // As one field of an object, so a toJSON is asked with its key; undefined, a function, a symbol left out, as JSON.stringify leaves them.
    const text = JSON.stringify({ [key]: field }).slice(1, -1);
    if (!text) continue;
    pieces.push(`${first ? "" : ","}${text}`);
    first = false;
    yield;
  }
  pieces.push("}");
  return pieces;
}

/** Where a pack version lives in the library (its key), and its URL. */
export const packKey = (id, version) => `packs/${id}/${version}/pack.json`;
export const packUrl = (id, version) => `/library/${packKey(id, version)}`;

/**
 * One of Lexicommons' own packs as the catalog lists it: { id, version, url, name, about?, sentences, lessons?, audio?, optIn?, suggest? }.
 * lessons: how many lessons it carries, when it has a path (a device fetches that pack first, and holds a newcomer's first lesson until it's
 * here: packs.js lessonsComing). audio: the url of that version's recorded audio (pack-audio.js audioUrl), when it has some; optIn: true for a pack no
 * device has until its learner adds it (otherwise it's a default pack); suggest: true for an opt-in pack Explore may put in
 * front of people (its topics, its shelves: a pack about one topic). An opt-in pack without it is never suggested (strong
 * language), so leaving it out hides a pack rather than pushing one.
 */
export function catalogueEntry(pack, version, { audio, optIn, suggest } = {}) {
  return { id: pack.id, version, url: packUrl(pack.id, version), name: pack.name, ...(pack.about ? { about: pack.about } : {}), sentences: sentencesOf(pack).length, ...(pack.lessons?.length ? { lessons: pack.lessons.length } : {}), ...(pack.teaches === "script" ? { teaches: "script" } : {}), ...(audio ? { audio } : {}), ...(optIn === true ? { optIn: true } : {}), ...(optIn === true && suggest === true ? { suggest: true } : {}) };
}

/** The catalog with an entry in packs[language] (replacing the same id in place, or added); every other key as found. */
export function withPackEntry(catalogue, language, entry) {
  const list = Array.isArray(catalogue.packs?.[language]) ? catalogue.packs[language] : [];
  const at = list.findIndex((p) => p?.id === entry.id);
  const next = at >= 0 ? list.map((p, i) => (i === at ? entry : p)) : [...list, entry];
  return { ...catalogue, packs: { ...(catalogue.packs ?? {}), [language]: next } };
}

/** The catalog without a default pack; every other key as found. */
export function withoutPack(catalogue, language, id) {
  const list = Array.isArray(catalogue.packs?.[language]) ? catalogue.packs[language] : [];
  return { ...catalogue, packs: { ...(catalogue.packs ?? {}), [language]: list.filter((p) => p?.id !== id) } };
}

/** Whether an audio url is where a pack version's audio lives (packs/<id>/<version>/audio.<12 hex>.json). */
export const isAudioUrl = (url, id, version) => typeof url === "string" && url.startsWith(`/library/packs/${id}/${version}/audio.`) && /\/audio\.[0-9a-f]{12}\.json$/.test(url) && url.length === `/library/packs/${id}/${version}/audio.000000000000.json`.length;

/**
 * Whether a ref to a public pack is well formed: { id, version, url, audio? } with url exactly where that version lives,
 * and audio, when there is one, beside it.
 */
export const isPackRef = (ref) =>
  Boolean(ref) && PACK_ID.test(plain(ref.id)) && VERSION_HEX.test(plain(ref.version)) && ref.url === packUrl(ref.id, ref.version) && (ref.audio === undefined || isAudioUrl(ref.audio, ref.id, ref.version));

/**
 * Lexicommons' own packs a catalog lists for a language, as refs { id, version, url, lessons?, audio?, optIn?, suggest? }: the default
 * packs and the opt-in ones (optIn: true; a device's defaults leave those out; suggest: true for one Explore may suggest); lessons: how
 * many lessons it carries, as the catalog says (0 on an entry that says none: one written before it said is left without it); anything
 * malformed is left out.
 */
export function packRefs(catalogue, language) {
  const list = Array.isArray(catalogue?.packs?.[language]) ? catalogue.packs[language] : [];
  const lessonsOf = (entry) => (Object.hasOwn(entry, "lessons") ? { lessons: Number.isInteger(entry.lessons) && entry.lessons > 0 ? entry.lessons : 0 } : {});
  return list.filter(isPackRef).map((entry) => {
    const { id, version, url, audio, optIn, suggest } = entry;
    // teaches: "script", a pack of a script's letters (kana), so Home can hold their link before the pack is here (know/today.js).
    return { id, version, url, ...lessonsOf(entry), ...(entry.teaches === "script" ? { teaches: "script" } : {}), ...(audio ? { audio } : {}), ...(optIn === true ? { optIn: true } : {}), ...(optIn === true && suggest === true ? { suggest: true } : {}) };
  });
}

/**
 * The installed list for checking a default pack before it's published: the language's other default packs, each
 * fetched (fetchPack(ref) → the pack, or null) and marked builtIn. exceptId: the pack being published.
 */
export async function defaultInstalled(catalogue, language, fetchPack, exceptId) {
  const refs = packRefs(catalogue, language).filter((ref) => ref.id !== exceptId);
  const packs = await Promise.all(refs.map((ref) => fetchPack(ref)));
  return packs.filter(Boolean).map((pack) => ({ ...pack, builtIn: true }));
}

/**
 * How a new version of a pack differs from the one before, item by item (both checked packs): { added, removed,
 * changed, kept }, lists of item ids. An item keeps its id across versions, so its evidence carries on; a removed one
 * keeps its history but is no longer studied.
 */
export function compareVersions(previous, next) {
  const before = new Map(previous.items.map((item) => [item.id, JSON.stringify(item)]));
  const after = new Map(next.items.map((item) => [item.id, JSON.stringify(item)]));
  const out = { added: [], removed: [], changed: [], kept: [] };
  for (const [id, text] of after) out[!before.has(id) ? "added" : before.get(id) === text ? "kept" : "changed"].push(id);
  for (const id of before.keys()) if (!after.has(id)) out.removed.push(id);
  return out;
}

/** Each topic's picture in Explore (its tile, and the head of its page): one of our word drawings, the same in every language. */
export const TOPIC_ART = { everyday: "coffee", travel: "airplane", food: "pizza", family: "party", home: "house", shopping: "bag", work: "office", school: "school", health: "bed", time: "watch", numbers: "five", weather: "day", feelings: "heart", culture: "music", grammar: "pack-grammar" };
/**
 * A topic's packs of Lexicommons' own (<language>-<topic>-1 and -2, "Food and drink" and "More food and drink"): two more of our
 * drawings, never the topic's own, so a topic's page and a shelf never show the same picture twice (scripts/test-art.mjs holds it).
 */
export const TOPIC_PACK_ART = {
  everyday: ["newspaper", "key"], travel: ["place", "train"], food: ["egg", "cake"], family: ["marry", "gift"], home: ["window", "sofa"],
  shopping: ["pay", "price"], work: ["work", "phone"], school: ["long", "book"], health: ["medicine", "water"], time: ["month", "evening"],
  numbers: ["chance", "ten"], weather: ["safe", "night"], feelings: ["calm", "luck"], culture: ["story", "film"],
};
/**
 * A topic's other drawings: the covers a learner's pack can have (picked when it's shared, else one by its id). Never the topic's own
 * (TOPIC_ART) or its packs' (TOPIC_PACK_ART), so a shelf of a topic never shows one picture twice (scripts/test-art.mjs holds it).
 */
export const TOPIC_DRAWINGS = {
  everyday: ["cup", "chair", "table", "light", "letter", "open"], travel: ["boat", "bus", "car", "far", "city", "world"],
  food: ["tea", "milk", "bottle", "ready", "piece", "part", "full"], family: ["pair", "photo", "ball"], home: ["room", "inside", "door", "chair", "table"],
  shopping: ["buy", "money", "dollar", "pocket", "pair"], work: ["plan", "write", "answer", "question", "camera"], school: ["write", "question", "answer", "find", "exactly"],
  health: ["help", "wait", "outside"], time: ["hour", "today", "tomorrow", "week", "year", "late", "time"], numbers: ["two", "three", "four", "six"],
  weather: ["coat", "hat", "outside", "light"], feelings: ["beautiful", "win", "lose", "free", "secret"], culture: ["camera", "photo", "world", "city", "treasure"],
  grammar: ["between", "behind", "under", "next", "exactly"],
};
/** The drawings a pack about these topics may have as its cover, in its topics' order, each once. */
export const coverChoices = (topics = []) => [...new Set(topics.flatMap((id) => TOPIC_DRAWINGS[id] ?? []))];
// FNV-1a: ids a letter apart land far apart.
const fnv = (text) => [...String(text)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
/**
 * A learner's pack's cover when it chose none: one of its first topic's drawings by its id, the next along when that one's already on the
 * shelf (`used`, which it adds to), so a shelf repeats one only past the set's size; null with no topic (a drawn book stands in).
 */
export function coverByIdOf(id, topics = [], used = null) {
  const set = TOPIC_DRAWINGS[topics[0]];
  if (!set?.length) return null;
  const start = fnv(id) % set.length;
  for (let k = 0; k < set.length; k++) {
    const drawing = set[(start + k) % set.length];
    if (!used?.has(drawing)) return used?.add(drawing), drawing;
  }
  return set[start];
}
/** Which of the art's three paints a learner's pack wears, by its id, never `not` (its drawing's own ground). */
export function paintOf(id, not = null) {
  const choices = ["teal", "sun", "violet"].filter((paint) => paint !== not);
  return choices[fnv(`${id}:paint`) % choices.length];
}

const TOPIC_PACK = new RegExp(`^[a-z]{2,3}(?:-[a-z]+)?-(${Object.keys(TOPIC_PACK_ART).join("|")})-([12])$`);

/**
 * A ready-made pack's cover: the id of a drawing in public/pictures/ (loadPictures, then pictureNode, as a word picture), or null
 * for any other pack, which gets a designed cover. "grammar" is a language's grammar. A starter's field follows its language,
 * so a shelf of them isn't one color. A topic's packs have its TOPIC_PACK_ART.
 */
export function coverOfPack(id) {
  if (typeof id !== "string") return null;
  if (id === "grammar") return "pack-grammar";
  const topical = TOPIC_PACK.exec(id);
  if (topical) return TOPIC_PACK_ART[topical[1]][Number(topical[2]) - 1];
  if (id === "starter-word-order") return "pack-starter"; // Dutch's starter, from before starters were named by their language
  if (id === "path-nl" || id === "words-nl-strong" || /^words-nl-(0[1-9]|10)$/.test(id)) return `pack-${id}`;
  // Spanish's, French's, German's, Portuguese's, Italian's, Russian's and Japanese's lessons: the same drawing as Dutch's, a path
  // winding to a flag (a learner sees only their own language's path, so no shelf shows it twice). Each language's path is named here as it lands.
  if (id === "path-es" || id === "path-fr" || id === "path-de" || id === "path-pt" || id === "path-it" || id === "path-ru" || id === "path-ja") return "pack-path-nl";
  // Japanese's letters (a pack that teaches a script): a card with あ brushed on it, and the brush.
  if (id === "kana-ja") return "pack-kana";
  // English's starters, one for each language its learners speak: starter-en (from Spanish) and starter-en-from-<code> (starter-en-from-ja,
  // starter-en-from-zh-hant). Their field follows the learners' language, as another language's starter's follows its own, so a shelf of
  // English starters isn't one color.
  const english = /^starter-en(?:-from-([a-z]{2,3}(?:-[a-z]+)?))?$/.exec(id);
  // Any other starter-en-… isn't a language's starter ("en-from" is no language).
  const starter = english || id.startsWith("starter-en-") ? null : /^starter-([a-z]{2,3}(?:-[a-z]+)?)$/.exec(id);
  const key = english ? english[1] ?? "es" : starter?.[1];
  if (!key) return null;
  const sum = [...key].reduce((n, c) => n + c.charCodeAt(0), 0);
  return ["pack-starter", "pack-starter-sun", "pack-starter-violet"][sum % 3];
}
