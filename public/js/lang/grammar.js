// A language's shared grammar as data: the patterns (p:<id>) every pack, weave and grade of the language shares, kept
// in the open library so a change to them is data an admin accepts, not a deploy. Pure (no DOM, no storage), so the
// app, the Worker and the tests check a grammar with the same code, as pack-format.js does packs.
//
// A grammar file (format lexicommons-grammar, version 1):
//   language   the language it's the grammar of (lang/index.js)
//   revision   counts up by one with each published change, so a newer one is always the larger number
//   patterns   { id: { name, about, after, source, retired? } }:
//     id       lowercase letters, digits and dashes; unique in the language, never renamed or removed once published
//              (evidence, packs and weaves point to it): a pattern no longer offered is retired, and still resolves
//     name     what it's called, in English; about: one or two plain sentences, with examples and their literal glosses
//     after    the patterns it builds on (ids in the same grammar; never in a loop)
//     source   who it's from: { by, drafted?, reviewed?, accepted?, at?, note? }, so anyone proposing a change, or a
//              native disagreeing, sees how much review stands behind the words shown after every answer
//     chip     its short name, for a small label (optional): "Present tense"
//     short    the rule in one sentence, for the moment after a question (optional)
//     retired  true: no longer offered to new packs (a pack using it gets a warning), but kept, since evidence and
//              packs point to it
//   readings   { form: reading } (optional): how the forms its patterns' words are written in are said, for a language that shows a
//              reading over its words (Japanese's kana over kanji): every form one its patterns' name, about, chip or short has, each
//              reading what lang/readings.js takes for a word of the language. The app draws them over those forms wherever it shows a
//              rule's words, never hidden (a word in a sentence loses its reading once Strong; in a rule's words it's always there). Russian
//              writes its stress marks into the words themselves and needs none. Added 9 Nov 2026: an app from before leaves the field out,
//              so its content no longer matches the catalog's version and it keeps the revision it has; ship the app before publishing one.
//
// Revision 1 of every language is the one inside the app (lang/<code>.js `patterns`, seedGrammar below): it needs no
// network, so a first start offline has it. The open library holds the revisions after it, at
// grammar/<lang>/<version>.json (the version the first 12 hex of the checked file's sha256, so a version is its content
// and is never overwritten), and the catalog names the current one under grammar.<lang> (grammarEntry). Each new
// revision keeps every id of the one before (checkGrammar's `previous`), so an id that resolved once always resolves.
// The device and the Worker install the newest revision they have into the registry (useGrammar), so every check and
// screen that reads LANGUAGES[lang].patterns reads it; installing only ever moves forward.
// A newer revision only adds ids (and retires some), so a pack that passed under an older one still passes: a pack's
// stored proof (pack-format.js checkedProof) needn't name the grammar it was checked under.
//
// What's longer about each pattern is a file of its own (format lexicommons-grammar-more), since the grammar above sits in one storage key read at every start:
//   language   the language it's about
//   concepts   { id: { explain, why?, picture?, examples: [{ text, means, literal, marks }], contrasts: [{ with, says }], mistakes: [{ wrong, right, why }], source } }
//     why      why the language does this and how to think about it, compared with English (2–4 plain sentences)
//     picture  how a sentence's marked words are drawn: frame (two words that close around the rest, a bracket), place (where a word
//              sits: its seat), order (either, as the roles say), ending (the end of a word), agreement (a word and what it agrees with) or
//              article (de/het, een/geen with its noun). A checker that doesn't know a field drops it and keeps the rest.
//     marks    the words of text (split at spaces) that show the rule, by position; with: "English", or a pattern of the grammar
//     source   who these words are from, on their own: a fix to a pattern's name or about changes its source, never this one
//   readings   { form: reading } (optional), as the grammar's: for the forms its own words (explain, why, examples, contrasts, mistakes) have
// It's at grammar/<lang>/more.<version>.json, and the catalog's entry names it in more: { version, url }. It follows the grammar's ids but isn't tied to a revision.

import { LANGUAGES, LANGUAGE_CODE } from "./index.js";
import { readingKind, readingProblem } from "./readings.js";
import { PACK_LIMITS, cleanText } from "../study/pack-format.js";

export const GRAMMAR_FORMAT = "lexicommons-grammar";
export const GRAMMAR_VERSION = 1;

export const GRAMMAR_LIMITS = {
  patterns: 500,
  name: PACK_LIMITS.name, // 80, as a pack's own pattern
  about: PACK_LIMITS.about, // 400
  after: 8,
  sourceField: 200,
  note: 400,
  bytes: 1_000_000,
  chip: 24,
  short: 200,
  readings: 400, // forms with a reading, in a grammar or its longer file
  readingForm: 24,
  more: { explain: 900, reason: 600, examples: 6, text: 200, contrasts: 4, says: 300, mistakes: 5, why: 200, bytes: 1_000_000 },
};

const PATTERN_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VERSION_HEX = /^[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = new Set(["format", "version", "language", "revision", "patterns", "readings"]);
const PATTERN_FIELDS = new Set(["name", "about", "after", "source", "retired", "chip", "short"]);
const SOURCE_FIELDS = ["by", "drafted", "reviewed", "accepted", "at", "note"];

/** Where the patterns inside the app come from, when a module doesn't say: they're revision 1 of every language. */
export const SEED_SOURCE = Object.freeze({ by: "Lexicommons", note: "First drafted by Lexicommons, open to correction." });

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const plain = (value) => (typeof value === "string" ? value : "");

// Each language's patterns as the app ships them, taken before anything is installed over them.
const BUNDLED = new Map(Object.entries(LANGUAGES).map(([code, lang]) => [code, lang.patterns ?? {}]));
// What's installed per language: { revision, version } (version: the library file's, null for the bundled one).
const installed = new Map();

/** A pattern as the registry and a grammar file keep it: its fields in one order. */
function patternOf(p, source) {
  return { name: p.name, about: p.about, after: [...(p.after ?? [])], source: { ...(p.source ?? source) }, ...(p.retired ? { retired: true } : {}), ...(p.chip ? { chip: p.chip } : {}), ...(p.short ? { short: p.short } : {}) };
}

/**
 * Revision 1 of a language's grammar: the patterns inside the app (lang/<code>.js), each with its own source or, where
 * the module gives none, SEED_SOURCE. null for a language Lexicommons doesn't know.
 */
export function seedGrammar(lang) {
  if (typeof lang !== "string" || !BUNDLED.has(lang)) return null;
  const patterns = Object.fromEntries(Object.entries(BUNDLED.get(lang)).map(([id, p]) => [id, patternOf(p, SEED_SOURCE)]));
  return { format: GRAMMAR_FORMAT, version: GRAMMAR_VERSION, language: lang, revision: 1, patterns };
}

/** The grammar installed for a language now (the bundled revision 1 until a newer one is): { …file, libraryVersion }. */
export function grammarNow(lang) {
  if (typeof lang !== "string" || !Object.hasOwn(LANGUAGES, lang)) return null;
  const at = installed.get(lang) ?? { revision: 1, version: null };
  const patterns = Object.fromEntries(Object.entries(LANGUAGES[lang].patterns ?? {}).map(([id, p]) => [id, patternOf(p, SEED_SOURCE)]));
  return { format: GRAMMAR_FORMAT, version: GRAMMAR_VERSION, language: lang, revision: at.revision, patterns, libraryVersion: at.version };
}

/**
 * Installs a checked grammar into the registry (LANGUAGES[lang].patterns), when it's a newer revision than the one
 * installed: every check and screen then reads it. Returns whether it was installed. Never moves back, so a grammar
 * fetched late, or a catalog restored to an older state, can't take an id away from what's checked.
 */
export function useGrammar(grammar, version = null) {
  if (!isObject(grammar) || !Object.hasOwn(LANGUAGES, grammar.language)) return false;
  const now = installed.get(grammar.language)?.revision ?? 1;
  if (!(grammar.revision > now)) return false;
  LANGUAGES[grammar.language].patterns = Object.fromEntries(Object.entries(grammar.patterns).map(([id, p]) => [id, patternOf(p, SEED_SOURCE)]));
  installed.set(grammar.language, { revision: grammar.revision, version, readings: isObject(grammar.readings) ? grammar.readings : {} });
  return true;
}

/** The installed grammar's readings ({ form: reading }) for its rules' words; none for revision 1, which has none. */
export const grammarReadings = (lang) => installed.get(lang)?.readings ?? {};

/** For tests only: puts a language's bundled grammar back, as if nothing had been installed. */
export function resetGrammar(lang) {
  if (!BUNDLED.has(lang)) return;
  LANGUAGES[lang].patterns = BUNDLED.get(lang);
  installed.delete(lang);
}

/** The patterns that aren't retired: what's offered for new packs and to choose from. */
export const offeredPatterns = (patterns) => Object.fromEntries(Object.entries(patterns ?? {}).filter(([, p]) => !p?.retired));

// ---------- the check ----------

/**
 * Checks a grammar file. previous: the grammar it follows (the catalog's, or the app's revision 1), whose every id it
 * must keep, at the next revision. Returns { grammar, errors, warnings }: the grammar as it would be kept (null when
 * there are errors), every problem at once ({ at, message }).
 */
export function checkGrammar(value, { previous } = {}) {
  const errors = [];
  const warnings = [];
  const error = (at, message) => errors.push({ at, message });
  const done = (grammar) => ({ grammar: errors.length ? null : grammar, errors, warnings });
  if (!isObject(value)) return error("grammar", "A grammar is an object: { format, version, language, revision, patterns }."), done(null);
  if (value.format !== GRAMMAR_FORMAT) error("format", `format must be "${GRAMMAR_FORMAT}".`);
  if (value.version !== GRAMMAR_VERSION) error("version", `version must be ${GRAMMAR_VERSION} (the format's version; a revision is counted in revision).`);
  for (const key of Object.keys(value)) if (!FIELDS.has(key)) warnings.push({ at: key, message: `${key.slice(0, 40)} isn't part of a grammar; it's left out.` });
  const language = plain(value.language);
  if (!LANGUAGE_CODE.test(language) || !Object.hasOwn(LANGUAGES, language)) return error("language", `language "${language.slice(0, 20)}" isn't one Lexicommons knows.`), done(null);
  const revision = value.revision;
  if (!Number.isInteger(revision) || revision < 1) error("revision", "revision must be a whole number, 1 or more.");
  if (!isObject(value.patterns)) return error("patterns", "patterns must be { id: { name, about, after, source } }."), done(null);
  const entries = Object.entries(value.patterns);
  if (entries.length > GRAMMAR_LIMITS.patterns) error("patterns", `patterns has ${entries.length} entries; keep it to ${GRAMMAR_LIMITS.patterns}.`);

  const patterns = {};
  for (const [id, p] of entries.slice(0, GRAMMAR_LIMITS.patterns)) {
    const at = `patterns.${id.slice(0, 50)}`;
    if (!PATTERN_ID.test(id)) {
      error(at, `"${id.slice(0, 50)}" isn't a pattern id (lowercase letters, digits and dashes, up to 40).`);
      continue;
    }
    if (!isObject(p)) {
      error(at, `${at} must be { name, about, after, source }.`);
      continue;
    }
    for (const key of Object.keys(p)) if (!PATTERN_FIELDS.has(key)) warnings.push({ at: `${at}.${key.slice(0, 40)}`, message: `${key.slice(0, 40)} isn't part of a pattern; it's left out.` });
    const name = cleanText(plain(p.name));
    const about = cleanText(plain(p.about));
    if (!name) error(`${at}.name`, `${at}.name is missing.`);
    else if (name.length > GRAMMAR_LIMITS.name) error(`${at}.name`, `${at}.name is ${name.length} characters; keep it to ${GRAMMAR_LIMITS.name}.`);
    if (!about) error(`${at}.about`, `${at}.about is missing.`);
    else if (about.length > GRAMMAR_LIMITS.about) error(`${at}.about`, `${at}.about is ${about.length} characters; keep it to ${GRAMMAR_LIMITS.about}.`);
    let after = [];
    if (p.after !== undefined && !Array.isArray(p.after)) error(`${at}.after`, `${at}.after must be a list of the patterns it builds on.`);
    else {
      after = (p.after ?? []).map(plain);
      if (after.length > GRAMMAR_LIMITS.after) error(`${at}.after`, `${at}.after names ${after.length}; keep it to ${GRAMMAR_LIMITS.after}.`);
      if (new Set(after).size !== after.length) error(`${at}.after`, `${at}.after names one pattern twice.`);
      for (const other of after) {
        if (other === id) error(`${at}.after`, `${at} can't build on itself.`);
        else if (!Object.hasOwn(value.patterns, other)) error(`${at}.after`, `${at}.after: "${other.slice(0, 50)}" isn't a pattern in this grammar.`);
      }
    }
    const source = checkSource(p.source, at, error);
    if (p.retired !== undefined && p.retired !== true) error(`${at}.retired`, `${at}.retired is true, or left out.`);
    const chip = cleanText(plain(p.chip));
    const short = cleanText(plain(p.short));
    if (p.chip !== undefined && !chip) error(`${at}.chip`, `${at}.chip is its short name, or left out.`);
    else if (chip.length > GRAMMAR_LIMITS.chip) error(`${at}.chip`, `${at}.chip is ${chip.length} characters; keep it to ${GRAMMAR_LIMITS.chip}.`);
    if (p.short !== undefined && !short) error(`${at}.short`, `${at}.short is the rule in one sentence, or left out.`);
    else if (short.length > GRAMMAR_LIMITS.short) error(`${at}.short`, `${at}.short is ${short.length} characters; keep it to ${GRAMMAR_LIMITS.short}.`);
    if (name && about && source) patterns[id] = { name, about, after, source, ...(p.retired === true ? { retired: true } : {}), ...(chip ? { chip } : {}), ...(short ? { short } : {}) };
  }
  // after never loops (the grammar map hangs each pattern under what it builds on).
  const loop = findLoop(patterns);
  if (loop) error(`patterns.${loop[0]}.after`, `after goes round in a loop: ${loop.join(" → ")}.`);

  if (previous) {
    if (previous.language !== language) error("language", `This is ${language}'s grammar; the one it follows is ${previous.language}'s.`);
    else if (Number.isInteger(revision) && revision !== previous.revision + 1) error("revision", `revision must be ${previous.revision + 1}: the one after ${previous.revision}, the grammar it follows.`);
    const gone = Object.keys(previous.patterns ?? {}).filter((id) => !Object.hasOwn(value.patterns, id));
    if (gone.length) error("patterns", `It leaves out ${gone.slice(0, 12).join(", ")}${gone.length > 12 ? ` and ${gone.length - 12} more` : ""}: a pattern is never removed once published (evidence, packs and weaves point to it). Retire it instead (retired: true).`);
  }
  const words = Object.values(patterns).map((p) => [p.name, p.about, p.chip ?? "", p.short ?? ""].join("\n")).join("\n");
  const readings = checkReadings(value.readings, language, words, error, warnings);
  const grammar = { format: GRAMMAR_FORMAT, version: GRAMMAR_VERSION, language, revision, patterns, ...(readings ? { readings } : {}) };
  if (!errors.length && grammarText(grammar).length > GRAMMAR_LIMITS.bytes) error("grammar", `It's over ${GRAMMAR_LIMITS.bytes} bytes as JSON.`);
  return done(grammar);
}

/**
 * A file's readings ({ form: reading }) against its own words: each form one the words have, each reading what readings.js takes for a word of
 * the language. Returns the readings kept, in their order; a form its words haven't got is left out with a warning (it would never be drawn).
 */
function checkReadings(raw, language, words, error, warnings) {
  if (raw === undefined) return null;
  if (!isObject(raw)) return error("readings", "readings must be { form: reading }."), null;
  if (!readingKind(language)) return error("readings", `${LANGUAGES[language]?.name ?? language} words don't carry a reading.`), null;
  const entries = Object.entries(raw);
  if (entries.length > GRAMMAR_LIMITS.readings) error("readings", `readings has ${entries.length} forms; keep it to ${GRAMMAR_LIMITS.readings}.`);
  const kept = {};
  for (const [rawForm, reading] of entries.slice(0, GRAMMAR_LIMITS.readings)) {
    const form = cleanText(plain(rawForm));
    const at = `readings.${form.slice(0, 30) || "?"}`;
    if (!form || form.length > GRAMMAR_LIMITS.readingForm) {
      error(at, `${at}: a form is 1 to ${GRAMMAR_LIMITS.readingForm} characters.`);
      continue;
    }
    const problem = typeof reading === "string" ? readingProblem(language, form, reading) : "a reading must be text";
    if (problem) {
      error(at, `${at}: ${problem}.`);
      continue;
    }
    if (!words.includes(form)) {
      warnings.push({ at, message: `${at}: "${form}" isn't in this file's words; it's left out.` });
      continue;
    }
    kept[form] = reading;
  }
  return Object.keys(kept).length ? kept : null;
}

function checkSource(value, at, error) {
  if (!isObject(value)) return error(`${at}.source`, `${at}.source must be { by, drafted?, reviewed?, accepted?, at?, note? }: who it's from.`), null;
  const out = {};
  for (const key of SOURCE_FIELDS) {
    if (value[key] === undefined) continue;
    const text = cleanText(plain(value[key]));
    const limit = key === "note" ? GRAMMAR_LIMITS.note : GRAMMAR_LIMITS.sourceField;
    if (!text) error(`${at}.source.${key}`, `${at}.source.${key} must be text.`);
    else if (text.length > limit) error(`${at}.source.${key}`, `${at}.source.${key} is ${text.length} characters; keep it to ${limit}.`);
    else if (key === "at" && !DATE.test(text)) error(`${at}.source.at`, `${at}.source.at is a date: YYYY-MM-DD.`);
    else out[key] = text;
  }
  if (!out.by) return error(`${at}.source.by`, `${at}.source.by is missing: who it's from.`), null;
  return out;
}

function findLoop(patterns) {
  const state = new Map();
  const path = [];
  const visit = (id) => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "open") return [...path.slice(path.indexOf(id)), id];
    state.set(id, "open");
    path.push(id);
    for (const other of patterns[id]?.after ?? []) {
      if (!patterns[other]) continue;
      const loop = visit(other);
      if (loop) return loop;
    }
    path.pop();
    state.set(id, "done");
    return null;
  };
  for (const id of Object.keys(patterns)) {
    const loop = visit(id);
    if (loop) return loop;
  }
  return null;
}

/** Whether `next` keeps every id of `before` (the rule between any two revisions, however far apart). */
export const keepsEveryId = (before, next) => Object.keys(before?.patterns ?? {}).every((id) => Object.hasOwn(next?.patterns ?? {}, id));

/** What a new revision changes from the one before: { added, changed, retired, restored } (pattern ids). */
export function grammarChanges(before, next) {
  const out = { added: [], changed: [], retired: [], restored: [] };
  for (const [id, p] of Object.entries(next.patterns)) {
    const was = before.patterns[id];
    if (!was) out.added.push(id);
    else {
      if (p.retired && !was.retired) out.retired.push(id);
      if (!p.retired && was.retired) out.restored.push(id);
      const same = (q) => JSON.stringify([q.name, q.about, q.after, q.source, q.chip, q.short]);
      if (same(p) !== same(patternOf(was, SEED_SOURCE))) out.changed.push(id);
    }
  }
  // Its readings for its words' forms changed, with no pattern changed (a reading put right): still a change worth a revision.
  if (JSON.stringify(before.readings ?? {}) !== JSON.stringify(next.readings ?? {})) out.readings = true;
  return out;
}

// ---------- the open library ----------

/** The text a grammar is stored as, and versioned by: the checked grammar's JSON. */
export const grammarText = (grammar) => JSON.stringify(grammar);

/** A checked grammar's version: the first 12 hex of its JSON's sha256. The same content always gets the same version. */
export async function grammarVersion(grammar) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(grammarText(grammar)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

/** Where a grammar version lives in the library (its key), and its URL. */
export const grammarKey = (lang, version) => `grammar/${lang}/${version}.json`;
export const grammarUrl = (lang, version) => `/library/${grammarKey(lang, version)}`;

/** A grammar's catalog entry (catalogue.grammar.<lang>): { revision, version, url, patterns, more? } (patterns: how many; more: its longer file). */
export function grammarEntry(grammar, version, more) {
  return { revision: grammar.revision, version, url: grammarUrl(grammar.language, version), patterns: Object.keys(grammar.patterns).length, ...(more ? { more } : {}) };
}

// ---------- what's longer about each pattern ----------

export const MORE_FORMAT = "lexicommons-grammar-more";

/** Checks a language's longer file against its grammar. Returns { more, errors, warnings }, every problem at once. */
/** The pictures a concept's marked words can be drawn as (the longer file's picture). */
export const MORE_PICTURES = ["frame", "place", "order", "ending", "agreement", "article"];

export function checkGrammarMore(value, grammar) {
  const errors = [];
  const warnings = [];
  const error = (at, message) => errors.push({ at, message });
  const L = GRAMMAR_LIMITS.more;
  const done = (more) => ({ more: errors.length ? null : more, errors, warnings });
  if (!isObject(value)) return error("more", "It's an object: { format, version, language, concepts }."), done(null);
  if (value.format !== MORE_FORMAT) error("format", `format must be "${MORE_FORMAT}".`);
  if (value.version !== GRAMMAR_VERSION) error("version", `version must be ${GRAMMAR_VERSION}.`);
  if (value.language !== grammar?.language) error("language", `It's about ${plain(value.language).slice(0, 20)}, and the grammar is ${grammar?.language}'s.`);
  if (!isObject(value.concepts)) return error("concepts", "concepts must be { id: { explain, examples, contrasts, mistakes, source } }."), done(null);
  const has = (id) => Object.hasOwn(grammar?.patterns ?? {}, id);
  const text = (raw, at, max) => {
    const out = cleanText(plain(raw));
    if (!out) error(at, `${at} is missing.`);
    else if (out.length > max) error(at, `${at} is ${out.length} characters; keep it to ${max}.`);
    return out;
  };
  const listOf = (raw, at, max) => {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) return error(at, `${at} must be a list.`), [];
    if (raw.length > max) error(at, `${at} has ${raw.length}; keep it to ${max}.`);
    return raw.slice(0, max);
  };
  const concepts = {};
  for (const [id, c] of Object.entries(value.concepts)) {
    const at = `concepts.${id.slice(0, 50)}`;
    if (!has(id)) {
      error(at, `"${id.slice(0, 50)}" isn't a pattern of the grammar.`);
      continue;
    }
    if (!isObject(c)) {
      error(at, `${at} must be an object.`);
      continue;
    }
    const examples = listOf(c.examples, `${at}.examples`, L.examples).map((e, n) => {
      const eat = `${at}.examples[${n}]`;
      const said = text(e?.text, `${eat}.text`, L.text);
      const count = said.split(" ").length;
      const marks = Array.isArray(e?.marks) ? e.marks : [];
      if (marks.some((m) => !Number.isInteger(m) || m < 0 || m >= count)) error(`${eat}.marks`, `${eat}.marks must be positions of its ${count} words.`);
      return { text: said, means: text(e?.means, `${eat}.means`, L.text), literal: text(e?.literal, `${eat}.literal`, L.text), marks: [...new Set(marks)] };
    });
    const contrasts = listOf(c.contrasts, `${at}.contrasts`, L.contrasts).map((x, n) => {
      const cat = `${at}.contrasts[${n}]`;
      const against = plain(x?.with);
      if (against !== "English" && !has(against)) error(`${cat}.with`, `${cat}.with is "English" or a pattern of the grammar, not "${against.slice(0, 40)}".`);
      return { with: against, says: text(x?.says, `${cat}.says`, L.says) };
    });
    const mistakes = listOf(c.mistakes, `${at}.mistakes`, L.mistakes).map((m, n) => {
      const mat = `${at}.mistakes[${n}]`;
      const wrong = text(m?.wrong, `${mat}.wrong`, L.text);
      const right = text(m?.right, `${mat}.right`, L.text);
      if (wrong && wrong === right) error(mat, `${mat}: wrong and right are the same.`);
      return { wrong, right, why: text(m?.why, `${mat}.why`, L.why) };
    });
    const source = checkSource(c.source, at, error);
    const explain = text(c.explain, `${at}.explain`, L.explain);
    const why = c.why === undefined ? null : text(c.why, `${at}.why`, L.reason);
    // A kind of picture this checker doesn't know (a newer one) is dropped, with a warning, never refused: the file's explanations stay.
    let picture = c.picture === undefined ? null : plain(c.picture);
    if (picture !== null && !MORE_PICTURES.includes(picture)) {
      warnings.push({ at: `${at}.picture`, message: `${at}.picture "${picture.slice(0, 20)}" isn't one this app draws (${MORE_PICTURES.join(", ")}); it's left out.` });
      picture = null;
    }
    if (source) concepts[id] = { explain, ...(why ? { why } : {}), ...(picture ? { picture } : {}), examples, contrasts, mistakes, source };
  }
  const words = Object.values(concepts)
    .flatMap((c) => [c.explain, c.why ?? "", ...c.examples.flatMap((e) => [e.text, e.means, e.literal]), ...c.contrasts.map((x) => x.says), ...c.mistakes.flatMap((m) => [m.wrong, m.right, m.why])])
    .join("\n");
  const readings = checkReadings(value.readings, value.language, words, error, warnings);
  const more = { format: MORE_FORMAT, version: GRAMMAR_VERSION, language: value.language, concepts, ...(readings ? { readings } : {}) };
  if (!errors.length && JSON.stringify(more).length > L.bytes) error("more", `It's over ${L.bytes} bytes as JSON.`);
  return done(more);
}

/** Where a longer file lives, and its catalog field: { version, url }. */
export const moreKey = (lang, version) => `grammar/${lang}/more.${version}.json`;
export const moreRef = (lang, version) => ({ version, url: `/library/${moreKey(lang, version)}` });

/** The catalog with grammar.<lang> set to an entry; every other key as found. */
export function withGrammarEntry(catalogue, lang, entry) {
  return { ...catalogue, grammar: { ...(isObject(catalogue.grammar) ? catalogue.grammar : {}), [lang]: entry } };
}

/**
 * A language's grammar as the catalog names it: { revision, version, url } when the entry is well formed (its url the
 * one its version gives), else null: the app's own revision 1 is the grammar then.
 */
export function grammarRef(catalogue, lang) {
  if (!isObject(catalogue) || !isObject(catalogue.grammar) || typeof lang !== "string" || !LANGUAGE_CODE.test(lang) || !Object.hasOwn(catalogue.grammar, lang)) return null;
  const entry = catalogue.grammar[lang];
  if (!isObject(entry) || !Number.isInteger(entry.revision) || entry.revision < 2 || !VERSION_HEX.test(plain(entry.version)) || entry.url !== grammarUrl(lang, entry.version)) return null;
  const more = isObject(entry.more) && VERSION_HEX.test(plain(entry.more.version)) && entry.more.url === moreRef(lang, entry.more.version).url ? { more: entry.more } : {};
  return { revision: entry.revision, version: entry.version, url: entry.url, ...more };
}

/**
 * The catalog's grammar entries that are newer than another catalog's (for a restore of an older catalog: the
 * grammar never goes back, since packs published since may use what it added). Returns the entries to keep.
 */
export function newerGrammar(current, restored) {
  const keep = {};
  for (const lang of Object.keys(isObject(current?.grammar) ? current.grammar : {})) {
    const now = grammarRef(current, lang);
    const then = grammarRef(restored, lang);
    if (now && (!then || then.revision < now.revision)) keep[lang] = current.grammar[lang];
  }
  return keep;
}

/** The catalog's grammar problems (catalogue.js asks only that grammar is an object): every entry well formed. */
export function grammarCatalogueProblems(catalogue) {
  if (catalogue?.grammar === undefined) return [];
  if (!isObject(catalogue.grammar)) return ["grammar must be an object: { <lang>: { revision, version, url, patterns } }."];
  return Object.keys(catalogue.grammar)
    .filter((lang) => !grammarRef(catalogue, lang) || !Object.hasOwn(LANGUAGES, lang))
    .map((lang) => `grammar.${lang.slice(0, 20)} must be { revision (2 or more), version, url: ${grammarUrl("<lang>", "<version>")}, patterns } for a language Lexicommons knows.`);
}

// ---------- suggestions (Explore, and your AI's suggest_pattern) ----------
//
// Anyone may suggest a change to a language's shared grammar: a new pattern, a fix to one (its name, its explanation,
// what it builds on), or retiring one. An admin accepts suggestions into the next revision (src/grammar-suggestions.ts).
// The published file never names a person: a pattern's source says how its suggester knows the language ("a native
// speaker, in Explore"), and who it was stays with the suggestion on the server, for as long as their account does.

export const SUGGESTION_KINDS = ["new", "fix", "retire"];
export const KNOWS = { native: "a native speaker", fluent: "a fluent speaker", learning: "a learner" };
export const SUGGESTION_LIMITS = { note: 500, sentences: 3 };

/**
 * Whether an explanation can be shown after every answer: within the limit, one to three plain sentences, with at least
 * one example in the language and its literal gloss in brackets ("ik werk (I work)"). Returns the problems ([] when
 * it can).
 */
export function aboutProblems(about) {
  const text = cleanText(plain(about));
  if (!text) return ["The explanation is missing."];
  const problems = [];
  if (text.length > GRAMMAR_LIMITS.about) problems.push(`The explanation is ${text.length} characters; keep it to ${GRAMMAR_LIMITS.about}.`);
  // Sentences, outside the examples' brackets: an end mark followed by a capital letter starts another.
  const outside = text.replace(/\([^()]*\)/g, "()");
  const sentences = 1 + (outside.match(/[.!?]\s+(?=\p{Lu})/gu) ?? []).length;
  if (sentences > SUGGESTION_LIMITS.sentences) problems.push(`The explanation has ${sentences} sentences; keep it to ${SUGGESTION_LIMITS.sentences} (it's shown after every answer).`);
  if (!/[\p{L}\p{N}][^()]*\(\s*[^()\s][^()]*\)/u.test(text)) problems.push("Give at least one example in the language with its literal gloss in brackets after it: ik werk (I work).");
  return problems;
}

/** A pattern id made from a name: "Verbs with zich" → "verbs-with-zich" (letters and digits, at most 40). */
export function idFromName(name) {
  const base = cleanText(plain(name))
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return PATTERN_ID.test(base) ? base : "";
}

/**
 * A suggestion, checked against the grammar it's for (the newest revision): { suggestion, problems }. suggestion is
 * { kind, pattern, change } (change: { name?, about?, after? }, what it proposes; a new pattern's has all three), or
 * null when there are problems. input: { kind, pattern?, name?, about?, after? }.
 */
export function checkSuggestion(input, grammar) {
  const problems = [];
  const value = isObject(input) ? input : {};
  const kind = SUGGESTION_KINDS.includes(value.kind) ? value.kind : null;
  if (!kind) return { suggestion: null, problems: ['kind is "new" (a pattern the grammar doesn\'t have), "fix" (a change to one) or "retire" (one no longer to offer).'] };
  const patterns = grammar?.patterns ?? {};
  const has = (id) => typeof id === "string" && Object.hasOwn(patterns, id);
  const change = {};
  const name = value.name === undefined || value.name === null ? undefined : cleanText(plain(value.name));
  const about = value.about === undefined || value.about === null ? undefined : cleanText(plain(value.about));
  if (name !== undefined) {
    if (!name) problems.push("name is the pattern's name, in English.");
    else if (name.length > GRAMMAR_LIMITS.name) problems.push(`name is ${name.length} characters; keep it to ${GRAMMAR_LIMITS.name}.`);
    else change.name = name;
  }
  if (about !== undefined) {
    problems.push(...aboutProblems(about));
    change.about = about;
  }
  for (const [key, words, max] of [["chip", "its short name, for a small label", GRAMMAR_LIMITS.chip], ["short", "the rule in one sentence", GRAMMAR_LIMITS.short]]) {
    if (value[key] === undefined || value[key] === null) continue;
    const said = cleanText(plain(value[key]));
    if (!said) problems.push(`${key} is ${words}.`);
    else if (said.length > max) problems.push(`${key} is ${said.length} characters; keep it to ${max}.`);
    else change[key] = said;
  }
  if (value.after !== undefined && value.after !== null) {
    if (!Array.isArray(value.after) || value.after.some((id) => typeof id !== "string")) problems.push("after is a list of the patterns it builds on (their ids).");
    else {
      const after = [...new Set(value.after)];
      if (after.length > GRAMMAR_LIMITS.after) problems.push(`after names ${after.length}; keep it to ${GRAMMAR_LIMITS.after}.`);
      for (const id of after) if (!has(id)) problems.push(`after: "${id.slice(0, 40)}" isn't a pattern of this grammar.`);
      change.after = after;
    }
  }
  let pattern = typeof value.pattern === "string" ? value.pattern : "";
  if (kind === "new") {
    if (!pattern) pattern = idFromName(name ?? "");
    if (!PATTERN_ID.test(pattern)) problems.push("pattern is the new pattern's id: lowercase letters, digits and dashes (made from its name when left out).");
    else if (has(pattern)) problems.push(`The grammar has "${pattern}" already (${patterns[pattern].name}): suggest a fix to it, or give the new one another id.`);
    if (!change.name) problems.push("A new pattern needs its name.");
    if (about === undefined) problems.push(...aboutProblems(""));
    if (change.after?.includes(pattern)) problems.push("A pattern can't build on itself.");
    change.after ??= [];
  } else {
    if (!has(pattern)) return { suggestion: null, problems: [`pattern "${pattern.slice(0, 40)}" isn't a pattern of this grammar.`, ...problems] };
    const now = patterns[pattern];
    if (kind === "retire") {
      if (Object.keys(change).length) problems.push("Retiring a pattern changes nothing else: suggest a fix for its words.");
      if (now.retired) problems.push(`"${pattern}" is retired already.`);
    } else {
      if (change.after?.includes(pattern)) problems.push("A pattern can't build on itself.");
      const same = (key) => change[key] === undefined || JSON.stringify(change[key]) === JSON.stringify(now[key]);
      const FIXABLE = ["name", "about", "after", "chip", "short"];
      if (FIXABLE.every(same)) problems.push("A fix changes its name, its explanation or what it builds on: this one changes none of them.");
      for (const key of FIXABLE) if (same(key)) delete change[key];
    }
  }
  return { suggestion: problems.length ? null : { kind, pattern, change }, problems };
}

/** A pattern's source for an accepted suggestion: how its suggester knows the language, never who they are. */
export function suggestedSource({ knows, via, kind, before, at }) {
  const who = KNOWS[knows] ?? "someone";
  return {
    by: `${who[0].toUpperCase()}${who.slice(1)}, in Explore`,
    ...(via === "ai" ? { drafted: "with their AI" } : {}),
    accepted: "an admin of Lexicommons",
    at,
    ...(kind === "fix" && before?.source?.by ? { note: `A fix to what ${before.source.by} wrote.` } : {}),
  };
}

/**
 * The next revision with accepted suggestions in it: [{ id, kind, pattern, change, knows, via }], each at most one per
 * pattern (they're applied together). at: the day (YYYY-MM-DD). Returns { grammar, problems }: the grammar to check and
 * publish (checkGrammar against the one before), or the problems that stop it.
 */
export function withSuggestions(grammar, accepted, { at }) {
  const problems = [];
  const next = { format: GRAMMAR_FORMAT, version: GRAMMAR_VERSION, language: grammar.language, revision: grammar.revision + 1, patterns: Object.fromEntries(Object.entries(grammar.patterns).map(([id, p]) => [id, patternOf(p, SEED_SOURCE)])) };
  const seen = new Map();
  for (const s of accepted) {
    if (seen.has(s.pattern)) {
      problems.push(`${s.id} and ${seen.get(s.pattern)} both change "${s.pattern}": accept one now, the other once it's in.`);
      continue;
    }
    seen.set(s.pattern, s.id);
    const before = next.patterns[s.pattern];
    if (s.kind === "new") {
      if (before) problems.push(`${s.id}: the grammar has "${s.pattern}" already.`);
      else next.patterns[s.pattern] = { name: s.change.name, about: s.change.about, after: s.change.after ?? [], source: suggestedSource({ ...s, at }), ...(s.change.chip ? { chip: s.change.chip } : {}), ...(s.change.short ? { short: s.change.short } : {}) };
    } else if (!before) problems.push(`${s.id}: "${s.pattern}" isn't in the grammar.`);
    else if (s.kind === "retire") {
      if (before.retired) problems.push(`${s.id}: "${s.pattern}" is retired already.`);
      else next.patterns[s.pattern] = { ...before, retired: true };
    } else next.patterns[s.pattern] = { ...before, ...s.change, source: suggestedSource({ ...s, before, at }) };
  }
  return { grammar: problems.length ? null : next, problems };
}
