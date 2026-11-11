// A pack's notes: why each word of a sentence is there, in a file beside the pack (format lexicommons-notes), so a pack's own file stays small and a start never reads them. Pure, shared with the
// Worker. Each note carries the sentence it was written for, so a new version of the pack keeps its notes and a sentence that changed just has none until it's written again.
//
//   format, version
//   pack       the pack's id; language
//   source     who it's from: { by, drafted?, reviewed?, at? }
//   items      { <item id>: { text, words: [{ role?, form?, why?, concept?, differs? }] } }, a note per word, by position
//     role     what it does here, in a few plain words
//     form     which form, if it isn't the dictionary form
//     why      why it's there or in this place, only when that isn't obvious
//     concept  the concept of the sentence this word is what shows
//     differs  where English does something else
//
// The catalog names a pack's file in notes.<pack id>: { version, url, sentences } (read/catalogue.js). The file is at notes/<pack id>/<version>.json, its version the first 12 hex of its JSON's sha256.

import { cleanText } from "./pack-format.js";

export const NOTES_FORMAT = "lexicommons-notes";
export const NOTES_VERSION = 1;
export const NOTES_LIMITS = { items: 5000, words: 60, text: 600, role: 60, form: 90, why: 240, differs: 200, concept: 90, source: 200, bytes: 6_000_000 };

const PACK_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
const CONCEPT_ID = /^(?:[a-z0-9][a-z0-9-]{1,47}\.)?[a-z0-9][a-z0-9-]{0,39}$/;
const VERSION_HEX = /^[0-9a-f]{12}$/;
const FIELDS = ["role", "form", "why", "concept", "differs"];
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const plain = (value) => (typeof value === "string" ? value : "");

/**
 * Checks a pack's notes, every problem at once: { notes, errors, warnings }. notes is the file as it's kept: same input, same bytes. With the pack, each note is checked against its sentence: as many words,
 * a concept the sentence has. One for a sentence the pack no longer has, or that has changed, is only a warning: it stays in the file, and shows nowhere (notesFor).
 */
export function checkNotes(value, pack = null) {
  const errors = [];
  const warnings = [];
  const error = (at, message) => errors.push({ at, message });
  const done = (notes) => ({ notes: errors.length ? null : notes, errors, warnings });
  if (!isObject(value)) return error("notes", "A pack's notes are an object: { format, version, pack, language, source, items }."), done(null);
  if (value.format !== NOTES_FORMAT) error("format", `format must be "${NOTES_FORMAT}".`);
  if (value.version !== NOTES_VERSION) error("version", `version must be ${NOTES_VERSION}.`);
  const id = plain(value.pack);
  if (!PACK_ID.test(id)) error("pack", "pack is the pack's id.");
  const language = plain(value.language);
  if (!language) error("language", "language is the pack's language.");
  if (pack && id !== pack.id) error("pack", `These are ${id.slice(0, 48)}'s notes, not ${pack.id}'s.`);
  if (pack && language !== pack.language) error("language", `${pack.id} is in ${pack.language}, not ${language.slice(0, 20)}.`);
  const source = {};
  if (!isObject(value.source) || !plain(value.source.by)) error("source", "source says who they're from: { by, drafted?, reviewed?, at? }.");
  else {
    for (const key of ["by", "drafted", "reviewed", "at"]) {
      if (value.source[key] === undefined) continue;
      const said = cleanText(plain(value.source[key]));
      if (!said || said.length > NOTES_LIMITS.source) error(`source.${key}`, `source.${key} is text, up to ${NOTES_LIMITS.source} characters.`);
      else source[key] = said;
    }
  }
  if (!isObject(value.items)) return error("items", "items must be { <item id>: { text, words } }."), done(null);
  const entries = Object.entries(value.items);
  if (entries.length > NOTES_LIMITS.items) error("items", `There are ${entries.length} sentences; keep it to ${NOTES_LIMITS.items}.`);
  const byId = new Map((pack?.items ?? []).map((item) => [item.id, item]));
  const items = {};
  let gone = 0;
  let changed = 0;
  for (const [itemId, entry] of entries.slice(0, NOTES_LIMITS.items)) {
    const at = `items.${itemId.slice(0, 60)}`;
    if (!isObject(entry) || !Array.isArray(entry.words)) {
      error(at, `${at} must be { text, words }.`);
      continue;
    }
    const text = cleanText(plain(entry.text));
    if (!text || text.length > NOTES_LIMITS.text) error(`${at}.text`, `${at}.text is the sentence it was written for, up to ${NOTES_LIMITS.text} characters.`);
    if (entry.words.length > NOTES_LIMITS.words) error(`${at}.words`, `${at} has notes on ${entry.words.length} words; keep it to ${NOTES_LIMITS.words}.`);
    const item = pack ? byId.get(itemId) : null;
    const same = Boolean(item) && item.text === text;
    if (pack && !item) gone++;
    else if (pack && !same) changed++;
    if (same && entry.words.length !== (item.words?.length ?? 0)) error(`${at}.words`, `${at} has notes on ${entry.words.length} words, and the sentence has ${item.words?.length ?? 0}.`);
    const words = entry.words.slice(0, NOTES_LIMITS.words).map((note, n) => {
      const wat = `${at}.words[${n}]`;
      if (!isObject(note)) {
        error(wat, `${wat} must be an object.`);
        return {};
      }
      const kept = {};
      for (const field of FIELDS) {
        if (note[field] === undefined || note[field] === null) continue;
        const said = cleanText(plain(note[field]));
        if (!said) {
          error(`${wat}.${field}`, `${wat}.${field} is text, or left out.`);
          continue;
        }
        if (said.length > NOTES_LIMITS[field]) error(`${wat}.${field}`, `${wat}.${field} is ${said.length} characters; keep it to ${NOTES_LIMITS[field]}.`);
        kept[field] = said;
      }
      if (kept.concept) {
        if (!CONCEPT_ID.test(kept.concept)) error(`${wat}.concept`, `${wat}.concept isn't a concept's id.`);
        else if (same && !(item.concepts ?? []).includes(kept.concept)) error(`${wat}.concept`, `${wat}.concept is ${kept.concept}, which the sentence doesn't name.`);
      }
      return kept;
    });
    items[itemId] = { text, words };
  }
  if (gone) warnings.push({ at: "items", message: `${gone} of these sentences aren't in ${pack.id} now: their notes show nowhere.` });
  if (changed) warnings.push({ at: "items", message: `${changed} of these sentences have changed in ${pack.id}: their notes show nowhere until they're written again.` });
  const notes = { format: NOTES_FORMAT, version: NOTES_VERSION, pack: id, language, source, items };
  if (!errors.length && notesText(notes).length > NOTES_LIMITS.bytes) error("notes", `They're over ${NOTES_LIMITS.bytes} bytes as JSON.`);
  return done(notes);
}

/** The text notes are stored as, and versioned by: the checked notes' JSON. */
export const notesText = (notes) => JSON.stringify(notes);
/** The first 12 hex of their JSON's sha256. */
export async function notesVersion(notes) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(notesText(notes)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12);
}
export const notesKey = (packId, version) => `notes/${packId}/${version}.json`;
export const notesUrl = (packId, version) => `/library/${notesKey(packId, version)}`;

/** A sentence's notes: { words, marks: { <concept>: [positions] } }, or null when there are none, or they were written for other words. item: as the pack or the view has it. */
export function notesFor(notes, item) {
  const itemId = String(item?.id ?? "").split("/").pop();
  const entry = notes?.items && Object.hasOwn(notes.items, itemId) ? notes.items[itemId] : null;
  if (!entry || entry.text !== item.text || entry.words.length !== (item.words?.length ?? 0)) return null;
  const marks = {};
  entry.words.forEach((note, at) => {
    if (note.concept) (marks[note.concept] ??= []).push(at);
  });
  return { words: entry.words, marks };
}

// ---------- the catalog ----------

/** A pack's notes as the catalog names them: { version, url, sentences }, when the entry is well formed (its url the one its version gives), else null. */
export function notesRef(catalogue, packId) {
  const entry = isObject(catalogue?.notes) && Object.hasOwn(catalogue.notes, packId) ? catalogue.notes[packId] : null;
  if (!isObject(entry) || !VERSION_HEX.test(plain(entry.version)) || entry.url !== notesUrl(packId, entry.version)) return null;
  return { version: entry.version, url: entry.url, sentences: entry.sentences };
}
/** The catalog with notes.<pack id> set; every other key as found. */
export const withNotesEntry = (catalogue, packId, entry) => ({ ...catalogue, notes: { ...(isObject(catalogue.notes) ? catalogue.notes : {}), [packId]: entry } });
/** The catalog with a pack's notes gone: a pack taken off takes them with it. */
export function withoutNotes(catalogue, packId) {
  if (!isObject(catalogue.notes) || !Object.hasOwn(catalogue.notes, packId)) return catalogue;
  const { [packId]: gone, ...notes } = catalogue.notes;
  return { ...catalogue, notes };
}
/** The catalog's problems with its notes: every entry well formed. */
export function notesCatalogueProblems(catalogue) {
  if (catalogue?.notes === undefined) return [];
  if (!isObject(catalogue.notes)) return ["notes must be an object: { <pack id>: { version, url, sentences } }."];
  return Object.keys(catalogue.notes).filter((id) => !PACK_ID.test(id) || !notesRef(catalogue, id)).map((id) => `notes.${id.slice(0, 48)} must be { version, url: ${notesUrl("<id>", "<version>")}, sentences }.`);
}

// ---------- a language's word forms ----------
//
// One line per written form that isn't its dictionary form, for every sentence a pack has no note on (format lexicommons-forms): { format, version, language, source, forms: { <dictionary word>: { <form>: line } } }.
// At forms/<lang>/<version>.json, named in the catalog's forms.<lang>: { version, url, lines }. The line is the same wherever the form appears, so it says only what's true everywhere.

export const FORMS_FORMAT = "lexicommons-forms";
export const FORMS_LIMITS = { line: 140, forms: 60_000, bytes: 8_000_000 };

/** Checks a language's forms, every problem at once: { forms, errors, warnings }. forms is the file as it's kept: same input, same bytes. */
export function checkForms(value) {
  const errors = [];
  const error = (at, message) => errors.push({ at, message });
  const done = (forms) => ({ forms: errors.length ? null : forms, errors, warnings: [] });
  if (!isObject(value)) return error("forms", "A language's forms are an object: { format, version, language, source, forms }."), done(null);
  if (value.format !== FORMS_FORMAT) error("format", `format must be "${FORMS_FORMAT}".`);
  if (value.version !== NOTES_VERSION) error("version", `version must be ${NOTES_VERSION}.`);
  const language = plain(value.language);
  if (!LANGUAGE.test(language)) error("language", "language is a language's code.");
  const source = {};
  if (!isObject(value.source) || !plain(value.source.by)) error("source", "source says who they're from: { by, drafted?, reviewed?, at? }.");
  else {
    for (const key of ["by", "drafted", "reviewed", "at"]) {
      if (value.source[key] === undefined) continue;
      const said = cleanText(plain(value.source[key]));
      if (!said || said.length > NOTES_LIMITS.source) error(`source.${key}`, `source.${key} is text, up to ${NOTES_LIMITS.source} characters.`);
      else source[key] = said;
    }
  }
  if (!isObject(value.forms)) return error("forms", "forms must be { <dictionary word>: { <form>: line } }."), done(null);
  const forms = {};
  let count = 0;
  for (const [word, written] of Object.entries(value.forms)) {
    const at = `forms.${word.slice(0, 40)}`;
    if (!isObject(written)) {
      error(at, `${at} must be { <form>: line }.`);
      continue;
    }
    const kept = {};
    for (const [form, raw] of Object.entries(written)) {
      const line = cleanText(plain(raw));
      if (!line) error(`${at}.${form.slice(0, 40)}`, `${at}.${form.slice(0, 40)} is a line of text.`);
      else if (line.length > FORMS_LIMITS.line) error(`${at}.${form.slice(0, 40)}`, `${at}.${form.slice(0, 40)} is ${line.length} characters; keep it to ${FORMS_LIMITS.line}.`);
      else kept[form] = line;
      count++;
    }
    forms[word] = kept;
  }
  if (count > FORMS_LIMITS.forms) error("forms", `There are ${count} lines; keep it to ${FORMS_LIMITS.forms}.`);
  const out = { format: FORMS_FORMAT, version: NOTES_VERSION, language, source, forms };
  if (!errors.length && notesText(out).length > FORMS_LIMITS.bytes) error("forms", `They're over ${FORMS_LIMITS.bytes} bytes as JSON.`);
  return done(out);
}

const LANGUAGE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?$/;
export const formsKey = (lang, version) => `forms/${lang}/${version}.json`;
export const formsUrl = (lang, version) => `/library/${formsKey(lang, version)}`;
/** How many lines a language's forms hold. */
export const formLines = (forms) => Object.values(forms?.forms ?? {}).reduce((sum, written) => sum + Object.keys(written).length, 0);
const bareForm = (text) => String(text ?? "").replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "").toLocaleLowerCase();

/** The line for a word as written: lemma, the dictionary word; text, as the sentence has it. null when there's none (the dictionary form says nothing). */
export function formLine(forms, lemma, text) {
  const written = forms?.forms && Object.hasOwn(forms.forms, lemma) ? forms.forms[lemma] : null;
  const form = bareForm(text);
  return written && Object.hasOwn(written, form) ? written[form] : null;
}

/** A language's forms as the catalog names them: { version, url, lines }, when well formed, else null. */
export function formsRef(catalogue, lang) {
  const entry = isObject(catalogue?.forms) && Object.hasOwn(catalogue.forms, lang) ? catalogue.forms[lang] : null;
  if (!isObject(entry) || !VERSION_HEX.test(plain(entry.version)) || entry.url !== formsUrl(lang, entry.version)) return null;
  return { version: entry.version, url: entry.url, lines: entry.lines };
}
export const withFormsEntry = (catalogue, lang, entry) => ({ ...catalogue, forms: { ...(isObject(catalogue.forms) ? catalogue.forms : {}), [lang]: entry } });
export function formsCatalogueProblems(catalogue) {
  if (catalogue?.forms === undefined) return [];
  if (!isObject(catalogue.forms)) return ["forms must be an object: { <lang>: { version, url, lines } }."];
  return Object.keys(catalogue.forms).filter((lang) => !LANGUAGE.test(lang) || !formsRef(catalogue, lang)).map((lang) => `forms.${lang.slice(0, 20)} must be { version, url: ${formsUrl("<lang>", "<version>")}, lines }.`);
}
