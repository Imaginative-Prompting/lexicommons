// An item's shapes: how its sentence's rule is drawn on a concept's sheet, given exactly by the pack (study/concept-picture.js draws them,
// docs/design-bible.md "A rule's picture"). Optional, per concept the item is an example of. Pure (no DOM, no storage): pack-format.js
// checks the stored form with checkShapes, pack-authoring.js turns your AI's form into it and back.
//
// A pack's marks for a concept replace the ones derived from Dutch's notes (concept-shape.js marksOf) for that concept; the derived ones
// fill in only where the pack gives none.
//
// Stored (item.shapes): { <concept id>: [mark, …] }, up to SHAPE_LIMITS.marks marks per concept. Two kinds of span:
//   a word span is inclusive, [first, last] word indices into item.words: frame { from: 1, to: 5 } runs from words[1] to words[5];
//   a character span is half-open, [start, end) in the word as written, like String.slice: in "drinkt", [5, 6] is "t".
// Every character edge falls on a grapheme boundary (Intl.Segmenter), so a mark never splits a letter from its vowel sign.
//   { shape: "lit", words: [2, 4] }                        the words lit
//   { shape: "frame", from: 1, to: 5 }                     a bracket under words from…to (from < to)
//   { shape: "link", from: 0, to: 1, fromChars?, toChars? }   an arc, either way (from ≠ to), an end on the word's characters
//   { shape: "affix", word: 1, chars: [[0, 1], [4, 6]] }  the letters that change, anywhere: 1 to 3 spans, sorted, not overlapping
//   { shape: "box", from: 0, to: 1 }                       words that go together (from < to, at most 4 words)
//   { shape: "places", parts: [[0, 2], [3, 3]], mark: 1, place?: "first" | "second" | "last" }
//                                                          a clause's parts in order, not overlapping; mark: the ringed one
//   { shape: "tag", word: 1, text: "topic" }              a short label over a word, in the pack's from language
// and on any mark, note: a line under the picture, in the pack's from language (like means).
//
// Checking: a mark that doesn't fit (an unknown shape, an index or span out of range, too many) is dropped with a warning, never the item
// or the pack; an unknown key inside a mark is dropped with a warning and the mark kept; an unknown place value drops just place. Note that
// a device whose checker doesn't know shapes (or a newer kind) drops them, so its copy hashes differently: a pack in the open library may
// carry shapes, or a new kind, only once the deploy whose checker knows them is live (pack guide, "Shapes").
//
// Your AI's form (get_pack_guide): marks name words as written, the way gap names its word: "hablo" (its punctuation optional), or
// { word: "de", at: 3 } when the sentence has it more than once. An affix gives letters: ["ي", "ون"], each found in the word after the one
// before it (one that's there more than once in what's left needs chars instead); places' parts are lists of words.

export const SHAPE_KINDS = ["lit", "frame", "link", "affix", "box", "places", "tag"];
export const SHAPE_PLACES = ["first", "second", "last"];
export const SHAPE_LIMITS = { marks: 8, spans: 3, boxWords: 4, tag: 16, note: 80 };
const KEYS = {
  lit: ["words"],
  frame: ["from", "to"],
  link: ["from", "to", "fromChars", "toChars"],
  affix: ["word", "chars"],
  box: ["from", "to"],
  places: ["parts", "mark", "place"],
  tag: ["word", "text"],
};

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isIndex = (value, length) => Number.isInteger(value) && value >= 0 && value < length;
const bare = (word) => String(word ?? "").toLocaleLowerCase().replace(/^[¿¡"“‘(«]+|[.,!?;:…"”’)»。、！？」』،؟؛]+$/g, "");

/** Where a word's characters may be cut: 0, its length, and every grapheme's edge between. */
function edges(text) {
  const out = new Set([0, text.length]);
  for (const { index, segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) out.add(index + segment.length);
  return out;
}

/** A character span in a word, checked: [start, end), not empty, inside the word, on grapheme edges. → the span, or a reason it isn't one. */
function charSpan(value, word) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isInteger)) return { why: "must be [start, end]" };
  const [start, end] = value;
  if (start < 0 || end > word.length || start >= end) return { why: `[${start}, ${end}] isn't inside "${word}" (0 to ${word.length}, start before end)` };
  const cuts = edges(word);
  if (!cuts.has(start) || !cuts.has(end)) return { why: `[${start}, ${end}] cuts a letter of "${word}" apart (a mark or vowel sign stays with its letter)` };
  return { span: [start, end] };
}

/**
 * Checks an item's shapes, stored form. value: item.shapes as given; words: the item's checked words as written ([text]); concepts: its
 * concept ids; r: pack-format.js's reporter (warn, text); limits: { tag, note } lengths. → the shapes that fit, or undefined for none.
 */
export function checkShapes(value, { at, name, words, concepts, r }) {
  if (value === undefined) return undefined;
  const warn = (where, message) => r.warn(where, `${name}: ${message}`);
  if (!isObject(value)) return void warn(at, "shapes must be { concept: [mark, …] }; they were left out.");
  if (!words.length) return void warn(at, "shapes need the sentence's words; they were left out.");
  const out = {};
  for (const [given, list] of Object.entries(value)) {
    const id = String(given).replace(/^p:/, "");
    const cat = `${at}.${given}`;
    if (!concepts.includes(id)) {
      warn(cat, `shapes for "${id.slice(0, 50)}", which isn't one of the item's concepts, were left out.`);
      continue;
    }
    if (!Array.isArray(list)) {
      warn(cat, `shapes for "${id}" must be a list of marks; they were left out.`);
      continue;
    }
    if (list.length > SHAPE_LIMITS.marks) warn(cat, `shapes for "${id}" has ${list.length} marks; the first ${SHAPE_LIMITS.marks} are kept.`);
    const kept = list.slice(0, SHAPE_LIMITS.marks).map((mark, m) => checkMark(mark, `${cat}[${m}]`, words, r, warn)).filter(Boolean);
    if (kept.length) out[id] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

function checkMark(mark, at, words, r, warn) {
  if (!isObject(mark) || !SHAPE_KINDS.includes(mark.shape)) return void warn(at, `a mark must be { shape: ${SHAPE_KINDS.join(" | ")}, … }; it was left out.`);
  const { shape } = mark;
  for (const key of Object.keys(mark)) if (key !== "shape" && key !== "note" && !KEYS[shape].includes(key)) warn(`${at}.${key}`, `${shape}'s ${key} isn't part of a mark; it was left out.`);
  const n = words.length;
  const drop = (why) => void warn(at, `${shape}: ${why}; it was left out.`);
  const span = (value, word) => charSpan(value, words[word]);
  let out;
  if (shape === "lit") {
    if (!Array.isArray(mark.words) || !mark.words.length || !mark.words.every((i) => isIndex(i, n))) return drop(`needs words: indices of the sentence's ${n} words`);
    out = { shape, words: [...new Set(mark.words)].sort((a, b) => a - b) };
  } else if (shape === "frame" || shape === "box") {
    if (!isIndex(mark.from, n) || !isIndex(mark.to, n) || mark.from >= mark.to) return drop(`needs from < to, indices of the sentence's ${n} words`);
    if (shape === "box" && mark.to - mark.from + 1 > SHAPE_LIMITS.boxWords) return drop(`holds ${mark.to - mark.from + 1} words; a box holds at most ${SHAPE_LIMITS.boxWords}`);
    out = { shape, from: mark.from, to: mark.to };
  } else if (shape === "link") {
    if (!isIndex(mark.from, n) || !isIndex(mark.to, n) || mark.from === mark.to) return drop(`needs from and to, two different words of the sentence's ${n}`);
    out = { shape, from: mark.from, to: mark.to };
    for (const [key, word] of [["fromChars", mark.from], ["toChars", mark.to]]) {
      if (mark[key] === undefined) continue;
      const checked = span(mark[key], word);
      if (checked.why) warn(`${at}.${key}`, `the link's ${key} ${checked.why}; it was left out, the link kept.`);
      else out[key] = checked.span;
    }
  } else if (shape === "affix") {
    if (!isIndex(mark.word, n)) return drop(`needs word, an index of the sentence's ${n} words`);
    if (!Array.isArray(mark.chars) || !mark.chars.length || mark.chars.length > SHAPE_LIMITS.spans) return drop(`needs chars: 1 to ${SHAPE_LIMITS.spans} spans [start, end]`);
    const spans = [];
    for (const one of mark.chars) {
      const checked = span(one, mark.word);
      if (checked.why) return drop(`chars ${checked.why}`);
      spans.push(checked.span);
    }
    spans.sort((a, b) => a[0] - b[0]);
    if (spans.some((one, i) => i && one[0] < spans[i - 1][1])) return drop("its chars overlap");
    out = { shape, word: mark.word, chars: spans };
  } else if (shape === "places") {
    const parts = Array.isArray(mark.parts) ? mark.parts : [];
    const fits = parts.length >= 2 && parts.every((part, i) => Array.isArray(part) && part.length === 2 && isIndex(part[0], n) && isIndex(part[1], n) && part[0] <= part[1] && (!i || part[0] > parts[i - 1][1]));
    if (!fits) return drop("needs parts: 2 or more [first, last] word spans, in order, not overlapping");
    if (!isIndex(mark.mark, parts.length)) return drop(`needs mark, the ringed part's index (0 to ${parts.length - 1})`);
    out = { shape, parts: parts.map((part) => [part[0], part[1]]), mark: mark.mark };
    if (mark.place !== undefined) {
      if (SHAPE_PLACES.includes(mark.place)) out.place = mark.place;
      else warn(`${at}.place`, `place "${String(mark.place).slice(0, 20)}" isn't one of ${SHAPE_PLACES.join(", ")}; it was left out, the mark kept.`);
    }
  } else if (shape === "tag") {
    if (!isIndex(mark.word, n)) return drop(`needs word, an index of the sentence's ${n} words`);
    const errors = r.errors.length;
    const text = r.text(mark.text, `${at}.text`, SHAPE_LIMITS.tag, { required: true });
    if (r.errors.length > errors) {
      r.errors.length = errors; // a tag that doesn't fit is the mark's problem, never the item's
      return drop(`needs text, a label of at most ${SHAPE_LIMITS.tag} characters`);
    }
    out = { shape, word: mark.word, text };
  }
  if (mark.note !== undefined) {
    const errors = r.errors.length;
    const note = r.text(mark.note, `${at}.note`, SHAPE_LIMITS.note);
    if (r.errors.length > errors) {
      r.errors.length = errors;
      warn(`${at}.note`, `a note is at most ${SHAPE_LIMITS.note} characters of text; it was left out, the mark kept.`);
    } else if (note) out.note = note;
  }
  return out;
}

/** Renames shapes' concept keys the way the view renames an item's concepts (a pack's own pattern that's the same as the catalog's). */
export function renameShapes(shapes, aliases) {
  if (!shapes) return shapes;
  const out = {};
  for (const [id, marks] of Object.entries(shapes)) {
    const to = Object.hasOwn(aliases, id) ? aliases[id] : id;
    if (!out[to]) out[to] = marks;
  }
  return out;
}

// ---------- your AI's form ----------

/** Which word a reference names: "hablo", "hablo." or { word: "de", at: 3 }. → { index } or { why }. */
function wordIndex(ref, words) {
  if (Number.isInteger(ref)) return isIndex(ref, words.length) ? { index: ref } : { why: `word ${ref} isn't in the sentence` };
  const text = typeof ref === "string" ? ref : isObject(ref) && typeof ref.word === "string" ? ref.word : null;
  if (text === null) return { why: 'a word is named as written ("hablo"), or { word, at } when the sentence has it twice' };
  const found = words.flatMap((w, i) => (bare(w) === bare(text) ? [i] : []));
  if (!found.length) return { why: `"${text.slice(0, 40)}" isn't one of the sentence's words` };
  if (isObject(ref) && ref.at !== undefined) return found.includes(ref.at) ? { index: ref.at } : { why: `"${text.slice(0, 40)}" isn't word ${ref.at} (0 = the first word)` };
  if (found.length > 1) return { why: `"${text.slice(0, 40)}" is in the sentence ${found.length} times: say which with { word, at }` };
  return { index: found[0] };
}

/** An affix's letters in a word: each found after the one before it. → { chars } or { why } (letters there more than once need chars). */
function lettersIn(letters, word) {
  const list = typeof letters === "string" ? [letters] : letters;
  if (!Array.isArray(list) || !list.length || list.some((one) => typeof one !== "string" || !one)) return { why: 'letters is a list of the letters that change, as written: ["t"]' };
  const chars = [];
  let from = 0;
  for (const one of list) {
    const at = word.indexOf(one, from);
    if (at < 0) return { why: `"${one}" isn't in "${word}"${from ? " after the letters before it" : ""}` };
    if (word.indexOf(one, at + 1) >= 0) return { why: `"${one}" is in "${word}" more than once after the letters before it: give chars ([start, end]) instead` };
    chars.push([at, at + one.length]);
    from = at + one.length;
  }
  return { chars };
}

/**
 * Your AI's shapes as stored: words named as written become indices, letters become character spans. words: the item's words as written.
 * → { shapes, problems }: each mark that can't be placed is a problem ({ at, message }) and left out; checkShapes checks the rest.
 */
export function shapesFromAuthoring(value, words) {
  const problems = [];
  if (value === undefined || value === null) return { shapes: undefined, problems };
  if (!isObject(value)) return { shapes: undefined, problems: [{ at: "shapes", message: "shapes must be { pattern: [mark, …] }." }] };
  const out = {};
  for (const [id, list] of Object.entries(value)) {
    if (!Array.isArray(list)) {
      problems.push({ at: `shapes.${id}`, message: `shapes.${id} must be a list of marks.` });
      continue;
    }
    out[id] = list.flatMap((mark, m) => {
      const at = `shapes.${id}[${m}]`;
      if (!isObject(mark)) return problems.push({ at, message: `${at} must be a mark: { shape, … }.` }), [];
      const fail = (why) => (problems.push({ at, message: `${at} (${mark.shape}): ${why}; it was left out.` }), []);
      const one = { ...mark };
      for (const key of ["from", "to", "word"]) {
        if (mark[key] === undefined) continue;
        const found = wordIndex(mark[key], words);
        if (found.why) return fail(found.why);
        one[key] = found.index;
      }
      if (mark.shape === "lit" && mark.words !== undefined) {
        const found = (Array.isArray(mark.words) ? mark.words : [mark.words]).map((ref) => wordIndex(ref, words));
        const bad = found.find((f) => f.why);
        if (bad) return fail(bad.why);
        one.words = found.map((f) => f.index);
      }
      if (mark.shape === "places" && Array.isArray(mark.parts)) {
        const parts = [];
        for (const part of mark.parts) {
          const found = (Array.isArray(part) ? part : [part]).map((ref) => wordIndex(ref, words));
          const bad = found.find((f) => f.why);
          if (bad) return fail(bad.why);
          const list = found.map((f) => f.index);
          parts.push([Math.min(...list), Math.max(...list)]);
        }
        one.parts = parts;
      }
      // An affix's (or a link end's) letters as character spans, unless chars are given exactly.
      for (const [letters, chars, word] of [["letters", "chars", one.word], ["fromLetters", "fromChars", one.from], ["toLetters", "toChars", one.to]]) {
        if (mark[letters] === undefined) continue;
        delete one[letters];
        if (mark[chars] !== undefined || word === undefined) continue;
        const found = lettersIn(mark[letters], words[word]);
        if (found.why) return fail(found.why);
        one[chars] = letters === "letters" ? found.chars : found.chars[0];
      }
      return [one];
    });
    if (!out[id].length) delete out[id];
  }
  return { shapes: Object.keys(out).length ? out : undefined, problems };
}

/** Stored shapes in your AI's form: indices back to words as written ({ word, at } where it's there twice), spans to letters when those
 * would come back to the same spans, else chars. */
export function shapesToAuthoring(shapes, words) {
  if (!shapes) return undefined;
  const ref = (i) => {
    const word = words[i];
    return words.filter((w) => bare(w) === bare(word)).length > 1 ? { word, at: i } : word;
  };
  const letters = (spans, word) => {
    const list = spans.map(([start, end]) => word.slice(start, end));
    const back = lettersIn(list, word);
    return !back.why && JSON.stringify(back.chars) === JSON.stringify(spans) ? list : null;
  };
  const out = {};
  for (const [id, marks] of Object.entries(shapes)) {
    out[id] = marks.map((mark) => {
      const one = { ...mark };
      for (const key of ["from", "to", "word"]) if (mark[key] !== undefined) one[key] = ref(mark[key]);
      if (mark.shape === "lit") one.words = mark.words.map(ref);
      if (mark.shape === "places") one.parts = mark.parts.map(([a, b]) => Array.from({ length: b - a + 1 }, (_, n) => ref(a + n)));
      for (const [chars, lettersKey, word] of [["chars", "letters", mark.word], ["fromChars", "fromLetters", mark.from], ["toChars", "toLetters", mark.to]]) {
        if (mark[chars] === undefined) continue;
        const spans = chars === "chars" ? mark[chars] : [mark[chars]];
        const found = letters(spans, words[word]);
        if (found) {
          delete one[chars];
          one[lettersKey] = chars === "chars" ? found : found[0];
        }
      }
      return one;
    });
  }
  return out;
}

/** After a respelling (the same words, some spelled anew): marks that point into a respelled word's letters are dropped (an affix, a
 * link's end on characters); the rest stay, to be checked again. before, after: the words as written. */
export function respelledShapes(shapes, before, after) {
  if (!shapes) return shapes;
  const changed = new Set(after.flatMap((word, i) => (word !== before[i] ? [i] : [])));
  if (!changed.size) return shapes;
  const out = {};
  for (const [id, marks] of Object.entries(shapes)) {
    const kept = marks.flatMap((mark) => {
      if (mark.shape === "affix" && changed.has(mark.word)) return [];
      if (mark.shape !== "link") return [mark];
      const one = { ...mark };
      if (one.fromChars && changed.has(one.from)) delete one.fromChars;
      if (one.toChars && changed.has(one.to)) delete one.toChars;
      return [one];
    });
    if (kept.length) out[id] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}
