// Corrections to a pack, as data: a fix replaces one piece of one version; a flag only says a piece is wrong, and why.
// Pure, like pack-format.js. The Worker applies a fix and checks the pack with it applied (it must still pass
// checkPack) before it's suggested, and again when it's accepted into a new version. A device that follows a pack with
// community corrections applies the most-liked open fix per piece the same way, and checks it again.
//
// A piece is named by its path in the pack:
//   items/<id>/means     what it means, in natural `from`: a string
//   items/<id>/wrong     its wrong versions (Choose): 1 to 3 strings
//   items/<id>/gap       { index, options }: the word to fill or type, and its choices (each as written, or { text, reading })
//   items/<id>/literal   { literal, english }: the literal line, and its chunks in `from`'s order (or null)
//   items/<id>/words     { words, punct?, moved?, gap? }: the sentence itself, with what depends on its words
//   words/<lemma>        a word's gloss: a string (the lemma URI-encoded in the path)
// An item keeps its id through a fix (evidence points to it); a fix never adds or removes an item or a word.

import { checkPack } from "./pack-format.js";

export const CORRECTION_FIELDS = ["means", "wrong", "gap", "literal", "words"];
// What two of them were called before a pack's version 2, on a path an older copy of the app sends.
const FIELDS_BEFORE = { natural: "means", nl: "words" };
export const CORRECTION_LIMITS = { path: 200, note: 1000 };

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const ITEM_PATH = /^items\/([^/]+)\/([a-z]+)$/;
const WORD_PATH = /^words\/([^/]+)$/;

/** A path as its parts: { kind: "item", id, field } or { kind: "word", lemma }, or null when it names no piece. */
export function parsePath(path) {
  if (typeof path !== "string" || path.length > CORRECTION_LIMITS.path) return null;
  const item = ITEM_PATH.exec(path);
  if (item) {
    const field = FIELDS_BEFORE[item[2]] ?? item[2];
    return CORRECTION_FIELDS.includes(field) ? { kind: "item", id: item[1], field } : null;
  }
  const word = WORD_PATH.exec(path);
  if (!word) return null;
  try {
    return { kind: "word", lemma: decodeURIComponent(word[1]) };
  } catch {
    return null;
  }
}

/** The path of an item's field, or of a word's gloss. */
export const itemPath = (id, field) => `items/${id}/${field}`;
export const wordPath = (lemma) => `words/${encodeURIComponent(lemma)}`;

/**
 * A path as it's stored and compared: one spelling per piece (words/%6Fma is words/oma), or null when it names no
 * piece. Every path is canonical before it's kept, matched or applied.
 */
export function canonicalPath(path) {
  const at = parsePath(path);
  if (!at) return null;
  return at.kind === "word" ? wordPath(at.lemma) : itemPath(at.id, at.field);
}

/** A piece's value in a pack (as a fix would replace it), or undefined when the pack has no such piece. */
export function pieceOf(pack, path) {
  const at = parsePath(path);
  if (!at || !pack) return undefined;
  if (at.kind === "word") return Object.hasOwn(pack.words ?? {}, at.lemma) ? pack.words[at.lemma] : undefined;
  const item = (pack.items ?? []).find((i) => i.id === at.id);
  if (!item) return undefined;
  if (at.field === "literal") return { literal: item.literal, english: item.english ?? null };
  if (at.field === "words") return { words: item.words, punct: item.punct ?? "", moved: item.moved ?? [], gap: item.gap };
  return item[at.field];
}

/**
 * The pack with one fix in it, or the reason it can't take one (a piece that isn't there, or a value of the wrong
 * shape; whether the result is a good pack is checkPack's to say). Never changes the pack it's given.
 */
export function withFix(pack, path, value) {
  const at = parsePath(path);
  if (!at) return { pack: null, error: `"${String(path).slice(0, 80)}" isn't a piece of a pack (items/<id>/<means|wrong|gap|literal|words> or words/<lemma>).` };
  const next = structuredClone(pack);
  if (at.kind === "word") {
    if (!Object.hasOwn(next.words ?? {}, at.lemma)) return { pack: null, error: `The pack has no word "${at.lemma}" to correct.` };
    if (typeof value !== "string") return { pack: null, error: "A word's fix is its gloss: a string." };
    next.words[at.lemma] = value;
    return { pack: next, error: null };
  }
  const item = next.items.find((i) => i.id === at.id);
  if (!item) return { pack: null, error: `The pack has no sentence "${at.id}".` };
  switch (at.field) {
    case "means":
      if (typeof value !== "string") return { pack: null, error: "A natural line's fix is a string." };
      item.means = value;
      break;
    case "wrong":
      if (!Array.isArray(value) || !value.every((w) => typeof w === "string")) return { pack: null, error: "The wrong versions' fix is a list of strings." };
      item.wrong = value.slice();
      break;
    case "gap":
      if (!isObject(value) || !Array.isArray(value.options) || !value.options.every((o) => typeof o === "string" || (isObject(o) && typeof o.text === "string"))) return { pack: null, error: "A gap's fix is { index, options } (each option the word as written, or { text, reading })." };
      item.gap = { index: value.index, options: structuredClone(value.options) };
      break;
    case "literal":
      if (!isObject(value) || !Array.isArray(value.literal) || !(value.english === null || Array.isArray(value.english))) return { pack: null, error: "A literal line's fix is { literal, english } (english a list of indexes, or null)." };
      if (!value.literal.every((c) => Array.isArray(c) && typeof c[0] === "string" && (c.length === 1 || typeof c[1] === "boolean"))) return { pack: null, error: "A literal line's chunks are each [text, moved?]." };
      item.literal = structuredClone(value.literal);
      item.english = value.english === null ? null : value.english.slice();
      break;
    case "words": {
      const said = value?.words ?? value?.nl; // nl: a fix suggested before version 2
      if (!isObject(value) || !Array.isArray(said)) return { pack: null, error: "A sentence's fix is { words, punct?, moved?, gap? }." };
      if (value.punct !== undefined && typeof value.punct !== "string") return { pack: null, error: "A sentence's punct is a string." };
      if (value.moved !== undefined && !(Array.isArray(value.moved) && value.moved.every((m) => typeof m === "string"))) return { pack: null, error: "A sentence's moved is a list of its words." };
      if (value.gap !== undefined && !(isObject(value.gap) && Array.isArray(value.gap.options))) return { pack: null, error: "A sentence's gap is { index, options }." };
      if (!said.every((w) => Array.isArray(w) && w.every((part) => typeof part === "string"))) return { pack: null, error: "A sentence's words are each [text, lemma?]." };
      item.words = structuredClone(said);
      for (const key of ["punct", "moved", "gap"]) if (value[key] !== undefined) item[key] = structuredClone(value[key]);
      // Its text is its words: the check says it again.
      delete item.text;
      break;
    }
  }
  return { pack: next, error: null };
}

/** checkPack, turning a throw (a value of a kind it didn't expect) into an error. */
function checked(pack, installed) {
  try {
    return checkPack(pack, { installed });
  } catch (error) {
    return { pack: null, errors: [{ at: "fix", message: `The pack with it can't be checked: ${error?.message ?? error}` }], warnings: [] };
  }
}

/** A fix checked as a version would be: the pack with it must pass checkPack. Returns { pack, errors, warnings }. */
export function checkFix(pack, path, value, { installed = [] } = {}) {
  const fixed = withFix(pack, path, value);
  if (!fixed.pack) return { pack: null, errors: [{ at: "fix", message: fixed.error }], warnings: [] };
  return checked(fixed.pack, installed);
}

/**
 * Several fixes at once (one new version): each piece at most once, the pack checked, and every fix still there in
 * the result as it would be alone (a sentence's fix carries its gap, so a separate gap fix would undo part of it).
 * Returns { pack, errors, warnings }.
 */
export function withFixes(pack, fixes, { installed = [] } = {}) {
  const seen = new Set();
  let next = pack;
  for (const fix of fixes) {
    const path = canonicalPath(fix.path);
    if (!path) return { pack: null, errors: [{ at: String(fix.path), message: `"${String(fix.path).slice(0, 80)}" isn't a piece of a pack.` }], warnings: [] };
    if (seen.has(path)) return { pack: null, errors: [{ at: path, message: `Two fixes for ${path}: accept one of them.` }], warnings: [] };
    seen.add(path);
    const fixed = withFix(next, path, fix.value);
    if (!fixed.pack) return { pack: null, errors: [{ at: path, message: fixed.error }], warnings: [] };
    next = fixed.pack;
  }
  const result = checked(next, installed);
  if (!result.pack) return result;
  for (const fix of fixes) {
    const alone = checkFix(pack, fix.path, fix.value, { installed });
    if (alone.pack && JSON.stringify(pieceOf(alone.pack, fix.path)) !== JSON.stringify(pieceOf(result.pack, fix.path))) {
      return { pack: null, errors: [{ at: canonicalPath(fix.path), message: `${canonicalPath(fix.path)} doesn't come through alongside the others (another fix changes part of it): accept them separately.` }], warnings: result.warnings };
    }
  }
  return result;
}

/** Every piece two versions of a pack hold differently (or that one of them doesn't have): the paths a newer version supersedes. */
export function changedPieces(previous, next) {
  const changed = new Set();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const item of previous.items ?? []) {
    for (const field of CORRECTION_FIELDS) {
      const path = itemPath(item.id, field);
      if (!same(pieceOf(previous, path), pieceOf(next, path))) changed.add(path);
    }
  }
  for (const lemma of Object.keys(previous.words ?? {})) {
    const path = wordPath(lemma);
    if (!same(pieceOf(previous, path), pieceOf(next, path))) changed.add(path);
  }
  return changed;
}

/**
 * A follower's pack with community corrections: for each piece, its most-liked open fix (the oldest of equals), each
 * kept only while the pack with it still passes checkPack. fixes: [{ id, path, value, likes, at }] on this version.
 * Returns { pack, applied: [the ids it used] }.
 */
export function communityOverlay(pack, fixes, { installed = [] } = {}) {
  const best = new Map();
  for (const fix of fixes) {
    const held = best.get(fix.path);
    if (!held || fix.likes > held.likes || (fix.likes === held.likes && fix.at < held.at)) best.set(fix.path, fix);
  }
  let next = pack;
  const applied = [];
  for (const fix of [...best.values()].sort((a, b) => b.likes - a.likes || (a.at < b.at ? -1 : 1))) {
    const checked = checkFix(next, fix.path, fix.value, { installed });
    if (!checked.pack) continue;
    next = checked.pack;
    applied.push(fix.id);
  }
  return { pack: next, applied };
}
