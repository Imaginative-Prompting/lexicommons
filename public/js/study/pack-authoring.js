// Your AI's side of packs: the form it writes them in (the MCP pack tools, src/mcp-packs.ts), and the changes it asks
// for, applied to a pack. Pure, like pack-format.js, so the Worker (checking a change before it's queued) and the
// device (applying it, then checking it again as savePack does) apply a change with the same code.
//
// The form your AI writes an item in names things for what they are, in any language:
//   { id?, sentence, words?, lemmas?, readings?, literal, english?, moved?, natural, wrong, gap: { word, options, at? },
//     topic?, patterns?, chunks? }
//   sentence  the sentence as written, its end punctuation included ("Ich habe gestern ein Buch gelesen.")
//   words     in a language written without spaces (Japanese, Chinese), the sentence's words in order: joined, they're
//             the sentence without its end punctuation (["私", "は", "学生", "です"]). The split is the writer's, kept
//             as given. Elsewhere the words are the sentence split at its spaces, and words is left out
//   lemmas    { "word as written": "dictionary form" } for the words worth learning ({ "gelesen": "lesen" }); where one
//             written word is two words in the sentence, a list, one per time it's written ({ "je": ["jij", "je"] }), null
//             for a time it's no word to learn ({ "zu": [null, "zu"] }: zu Hause's, then the infinitive's; { "A": [null, "o"] }:
//             a gente's, then the article)
//   readings  { "word as written": "reading" } in a language that shows readings: hiragana for a Japanese word with
//             kanji ({ "学生": "がくせい" }), pinyin with tone marks for a Chinese word, a syllable per character
//             ({ "我们": "wǒ men" }); where one written word is said two ways in the sentence, a list as lemmas', null for a
//             time with none ({ "方": ["かた", "ほう"] }: あの方の方が; { "дома": ["до́ма", "дома́"] }: at home, then houses)
//   literal   the English, chunk by chunk, in the sentence's order; a chunk the sentence moves between asterisks
//             ("*yesterday*")
//   gap       the word to fill in or type, as written, with 2 to 5 choices it's among (each as written, or
//             { text, reading } in a language that shows readings); at: its position (0 = the first word) when it's in
//             the sentence more than once
//   id        optional: made from the sentence when left out
// The rest are pack-format.js's own. Stored, the sentence becomes text, words ([word, lemma?, reading?] each) and punct, natural
// becomes means, patterns concepts, and gap an index.
//
// A change (what the Worker queues and the device applies):
//   { kind: "create", pack }                       a new pack, checked whole
//   { kind: "add", items, dictionaries? }          sentences added at the end (ids not in the pack yet)
//   { kind: "update", items, dictionaries? }       sentences replaced whole, by id
//   { kind: "remove", ids }                        sentences taken out, by id
//   { kind: "edit", name?, about?, dictionaries? } the pack's name, its line, its topics, words, phrases and patterns
//   { kind: "undo", change }                       puts the pack back as it was before an earlier change
//   { kind: "delete" }                             the pack goes (deleted in the app on one of your devices)
// dictionaries: { topics, words, readings, chunks, patterns }, each merged into the pack's (an id set to null is taken
// out).
// Items in a queued change are already in the stored form. An undo and a delete are the device's alone: only it has
// the pack as it was.

import { LANGUAGES, sentenceEnds } from "../lang/index.js";
import { cleanText, itemSentence, PACK_FORMAT, PACK_VERSION, separatorOf } from "./pack-format.js";
import { isSentence, orderedItem } from "./pack-items.js";
import { respelledShapes, shapesFromAuthoring, shapesToAuthoring } from "./shape-marks.js";

export const CHANGE_KINDS = ["create", "add", "update", "remove", "edit", "undo", "delete"];
export const DICTIONARIES = ["topics", "words", "readings", "chunks", "patterns"];

// A value in a message, never coerced (JSON can carry an object whose toString is null, which String() throws on).
const shown = (value, max) => (typeof value === "string" ? value : (JSON.stringify(value) ?? String(typeof value))).slice(0, max);
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// A word without the punctuation around it; bare: as two words are compared (lower case).
const trimWord = (word) =>
  cleanText(word)
    .replace(/[’‘]/g, "'")
    .replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, "");
const bare = (word) => trimWord(word).toLowerCase();

/** "Ich habe gestern ein Buch gelesen." → { words: ["Ich", …, "gelesen"], punct: "." }. language: whose own endings count too. */
export function splitSentence(sentence, language) {
  const text = cleanText(sentence);
  const punct = sentenceEnds(language).find((end) => text.endsWith(end)) ?? "";
  const words = text.slice(0, text.length - punct.length).split(" ").filter(Boolean);
  return { words, punct };
}

/** An id made from a sentence's first words ("ich-habe-gestern-ein"), not one of `taken`. */
export function idFor(words, taken = new Set()) {
  const slug = words
    .map((word) => bare(word).normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .reduce((out, part) => (out.length + part.length + 1 > 36 && out ? out : out ? `${out}-${part}` : part), "")
    .slice(0, 36);
  const base = slug || "item";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * One item as your AI wrote it → the stored form, ready for pack-format.js's check (which judges everything else).
 * language: the pack's (its dictionary forms' case); taken: ids already used, for an id made from the sentence.
 * Returns { item, problems }: problems are what can't be turned into an item at all, each { at, message }, `at`
 * relative to the item ("gap.word").
 */
export function storedItem(input, { language, taken = new Set() } = {}) {
  const problems = [];
  const problem = (at, message) => problems.push({ at, message });
  if (!isObject(input)) return { item: null, problems: [{ at: "", message: "must be an object: { sentence, literal, natural, wrong, gap, … }." }] };
  if (input.nl !== undefined) problem("nl", "write the sentence as sentence (with lemmas for its words), not nl.");
  if (typeof input.sentence !== "string" || !cleanText(input.sentence)) {
    problem("sentence", "sentence is missing: the sentence as written, its end punctuation included.");
    return { item: null, problems };
  }
  const split = splitSentence(input.sentence, language);
  const { punct } = split;
  let words = split.words;
  // Written without spaces: the words come as given, and joined they must be the sentence.
  if (separatorOf(language) === "") {
    const given = Array.isArray(input.words) ? input.words.map((word) => (typeof word === "string" ? cleanText(word) : "")) : null;
    const text = cleanText(input.sentence).slice(0, cleanText(input.sentence).length - punct.length);
    if (!given) problem("words", `words is missing: ${LANGUAGES[language].name} is written without spaces, so give the sentence's words in order (joined, they're the sentence without its end punctuation).`);
    else if (given.some((word) => !word || /\s/.test(word))) problem("words", "words must each be one word as written, with no spaces.");
    else if (given.join("") !== text) problem("words", `words, joined, give "${shown(given.join(""), 80)}"; the sentence without its end punctuation is "${shown(text, 80)}".`);
    else words = given;
  } else if (input.words !== undefined) problem("words", `words is only for a language written without spaces; ${LANGUAGES[language]?.name ?? language}'s words are the sentence split at its spaces.`);

  // The words to learn and how they're said, each by the word as written (compared without case or the punctuation around it): one value
  // for every time it's written, or a list, one entry per time in order, null where that time has none (a phrase's word with no dictionary
  // form; a time said without a reading).
  const perWord = (field, what, none, shape) => {
    const out = new Map();
    const value = input[field];
    if (value === undefined || value === null) return out;
    if (!isObject(value)) {
      problem(field, `${field} must be { "word as written": "${what}" }.`);
      return out;
    }
    for (const [word, given] of Object.entries(value)) {
      const key = bare(word);
      const at = `${field}.${word.slice(0, 40)}`;
      if (!words.some((w) => bare(w) === key)) problem(at, `${field}: "${word.slice(0, 40)}" isn't one of the sentence's words.`);
      else if (Array.isArray(given)) {
        const times = words.filter((w) => bare(w) === key).length;
        if (given.length !== times || given.some((one) => one !== null && (typeof one !== "string" || !cleanText(one)))) problem(at, `${field}: "${word.slice(0, 40)}" is written ${times} times, so its list needs ${times} entries, in order: each time's ${what}, or null where ${none}.`);
        else out.set(key, given.map((one) => (one === null ? null : shape(one))));
      } else if (typeof given !== "string" || !cleanText(given)) problem(at, `${field}: "${word.slice(0, 40)}" needs its ${what} as text.`);
      else out.set(key, shape(given));
    }
    return out;
  };
  const lemmas = perWord("lemmas", "dictionary form", "that time is no word to learn", (lemma) => (LANGUAGES[language]?.lemmaCase === "any" ? trimWord(lemma) : trimWord(lemma).toLowerCase()));
  // How each word with kanji or hanzi is said (pack-format.js checks each one).
  const readings = perWord("readings", "reading", "that time has none", (reading) => cleanText(reading));
  const times = new Map();
  const nl = words.map((word) => {
    const key = bare(word);
    const nth = times.get(key) ?? 0;
    times.set(key, nth + 1);
    const nthOf = (given) => (Array.isArray(given) ? (given[nth] ?? null) : (given ?? null));
    const lemma = nthOf(lemmas.get(key));
    const reading = nthOf(readings.get(key));
    return reading !== null ? [word, lemma, reading] : lemma !== null ? [word, lemma] : [word];
  });

  // The literal line: "I have", "*yesterday*" (moved), or [text, moved] / { text, moved }.
  const literal = Array.isArray(input.literal)
    ? input.literal.map((chunk) => {
        if (typeof chunk === "string") {
          const text = cleanText(chunk);
          const moved = text.length > 2 && text.startsWith("*") && text.endsWith("*");
          return moved ? [cleanText(text.slice(1, -1)), true] : [text];
        }
        if (Array.isArray(chunk)) return chunk[1] === true ? [chunk[0], true] : [chunk[0]];
        if (isObject(chunk)) return chunk.moved === true ? [chunk.text, true] : [chunk.text];
        return [chunk];
      })
    : input.literal;

  const item = { id: typeof input.id === "string" && input.id ? input.id : idFor(words, taken) };
  for (const field of ["topic", "chunks"]) if (input[field] !== undefined) item[field] = input[field];
  if (input.patterns !== undefined) item.concepts = input.patterns;
  item.text = `${words.join(separatorOf(language))}${punct}`;
  item.words = nl;
  item.punct = punct;
  item.literal = literal;
  item.english = input.english ?? null;
  item.moved = input.moved ?? [];
  item.means = input.natural;
  item.wrong = input.wrong;
  // The same sentence for the other gender, as given: pack-format.js checkPack holds it to { text, gender, who }.
  if (input.otherGender !== undefined) item.otherGender = input.otherGender;

  if (isObject(input.gap)) {
    const at = input.gap.at;
    let index;
    if (at !== undefined) {
      if (!Number.isInteger(at) || at < 0 || at >= words.length) problem("gap.at", `gap.at must be a word's position in the sentence (0 to ${words.length - 1}).`);
      else if (input.gap.word !== undefined && bare(words[at]) !== bare(input.gap.word)) problem("gap.at", `gap.at is "${words[at]}", not "${shown(input.gap.word, 40)}".`);
      else index = at;
    } else {
      index = words.findIndex((w) => bare(w) === bare(input.gap.word ?? ""));
      if (index < 0) {
        problem("gap.word", `gap.word "${shown(input.gap.word, 40)}" isn't one of the sentence's words.`);
        index = undefined;
      }
    }
    if (index !== undefined) item.gap = { index, options: input.gap.options };
  } else item.gap = input.gap;

  // How its rule is drawn (shape-marks.js): words named as written become their places, letters their character spans. A mark that
  // can't be placed is a warning and left out, never a problem: the sentence is kept (checkPack checks the rest the same way).
  const warnings = [];
  if (input.shapes !== undefined) {
    const placed = shapesFromAuthoring(input.shapes, words);
    for (const { at, message } of placed.problems) warnings.push({ at, message });
    if (placed.shapes && Object.keys(placed.shapes).length) item.shapes = placed.shapes;
  }

  // A copy of another pack's item (copyOf) keeps saying so through the form; checkPack holds it to its source.
  if (typeof input.copyOf === "string") item.copyOf = input.copyOf;

  return { item: problems.length ? null : orderedItem(item), problems, warnings };
}

/**
 * What the check no longer asks of an item, but Study's games ask of a sentence, and a sentence is what your AI's form writes: each
 * { at, message }, as storedItem gives its own.
 */
export function sentenceProblems(input) {
  if (!isObject(input)) return [];
  const problems = [];
  const problem = (at, message) => problems.push({ at, message });
  if (!Array.isArray(input.literal)) problem("literal", "literal is missing: the English, chunk by chunk, in the sentence's order.");
  if (input.natural === undefined) problem("natural", "natural is missing: the sentence in natural English.");
  if (!Array.isArray(input.wrong)) problem("wrong", "wrong is missing: 1 to 3 plausible wrong versions of the sentence.");
  if (!isObject(input.gap)) problem("gap", "gap must be { word, options }.");
  if (!input.patterns?.length && !input.chunks?.length) problem("patterns", "needs at least one pattern or chunk (what the sentence is an example of).");
  return problems;
}

/**
 * A stored item in the form your AI writes (get_pack shows items this way, and an update takes them back). language:
 * the pack's, which says how its words join (a space, or nothing: then the words come apart too).
 */
export function authoringItem(item, language) {
  const words = item.words.map(([text]) => text);
  // Each word's dictionary form and reading by the word as written: one value where every time it's written has the same, else a list, one
  // entry per time, null where that time has none (a phrase's word: zu Hause's zu beside the infinitive's; 方 said かた, then ほう). As one
  // value, every time it's written would take it.
  const perWord = (part) => {
    const all = new Map();
    for (const word of item.words) {
      if (!all.has(bare(word[0]))) all.set(bare(word[0]), []);
      all.get(bare(word[0])).push(word[part] ?? null);
    }
    const out = {};
    for (const word of item.words) {
      const list = all.get(bare(word[0]));
      if (new Set(list).size > 1) {
        if (!Object.keys(out).some((key) => bare(key) === bare(word[0]))) out[trimWord(word[0])] = list;
      } else if (word[part]) out[trimWord(word[0])] = word[part];
    }
    return out;
  };
  const lemmas = perWord(1);
  const readings = perWord(2);
  const separator = separatorOf(language);
  const gapWord = item.gap ? words[item.gap.index] : undefined;
  const repeated = gapWord !== undefined && words.filter((w) => bare(w) === bare(gapWord)).length > 1;
  return {
    id: item.id,
    sentence: words.join(separator) + (item.punct ?? ""),
    ...(separator === "" ? { words } : {}),
    ...(Object.keys(lemmas).length ? { lemmas } : {}),
    ...(Object.keys(readings).length ? { readings } : {}),
    literal: item.literal.map(([text, moved]) => (moved ? `*${text}*` : text)),
    english: item.english ?? null,
    ...(item.moved?.length ? { moved: item.moved } : {}),
    natural: item.means,
    wrong: item.wrong,
    ...(item.gap ? { gap: { word: gapWord, options: item.gap.options, ...(repeated ? { at: item.gap.index } : {}) } } : {}),
    ...(item.topic ? { topic: item.topic } : {}),
    patterns: item.concepts,
    ...(item.chunks?.length ? { chunks: item.chunks } : {}),
    ...(item.shapes ? { shapes: shapesToAuthoring(item.shapes, words) } : {}),
    ...(item.copyOf ? { copyOf: item.copyOf } : {}),
    ...(item.otherGender ? { otherGender: { ...item.otherGender } } : {}),
  };
}

/**
 * Applies a change to a pack (null when there's none yet). Returns { pack, problems }: the pack as it would be after
 * the change (not yet checked: pack-format.js's checkPack does that, on the server and again on the device), or
 * problems, each { at, message }, when the change doesn't fit the pack at all (an id that's already there, one that
 * isn't). An undo or a delete is the device's (see the top), so neither is applied here.
 */
export function applyChange(pack, change) {
  const problems = [];
  const problem = (at, message) => problems.push({ at, message });
  const done = (result) => ({ pack: problems.length ? null : result, problems });
  if (!isObject(change) || !CHANGE_KINDS.includes(change.kind)) return problem("kind", `A change's kind is one of ${CHANGE_KINDS.join(", ")}.`), done(null);
  if (change.kind === "undo" || change.kind === "delete") return problem("kind", `An ${change.kind} is applied by the device that has the pack.`), done(null);
  if (change.kind === "create") {
    if (pack) problem("id", `There's already a pack with the id "${pack.id}".`);
    return done(change.pack);
  }
  if (!pack) return problem("id", "There's no pack with that id."), done(null);
  const next = { ...pack, items: [...pack.items] };
  const merge = (dictionaries) => {
    if (dictionaries === undefined || dictionaries === null) return;
    if (!isObject(dictionaries)) return problem("dictionaries", "dictionaries must be { topics?, words?, chunks?, patterns? }.");
    for (const key of DICTIONARIES) {
      const entries = dictionaries[key];
      if (entries === undefined || entries === null) continue;
      if (!isObject(entries)) {
        problem(key, `${key} must be { id: … }.`);
        continue;
      }
      const merged = { ...(pack[key] ?? {}) };
      for (const [id, value] of Object.entries(entries)) {
        if (value === null) delete merged[id];
        else merged[id] = value;
      }
      next[key] = merged;
    }
  };
  const ids = new Set(pack.items.map((item) => item.id));
  if (change.kind === "add") {
    for (const [i, item] of (change.items ?? []).entries()) {
      if (ids.has(item?.id)) problem(`items[${i}].id`, `items[${i}]: the pack already has an item "${item.id}"; update_items replaces one.`);
      ids.add(item?.id);
      next.items.push(item);
    }
    merge(change.dictionaries);
  } else if (change.kind === "update") {
    for (const [i, item] of (change.items ?? []).entries()) {
      const at = next.items.findIndex((old) => old.id === item?.id);
      if (at < 0) problem(`items[${i}].id`, `items[${i}]: the pack has no item "${shown(item?.id, 50)}"; add_items adds one.`);
      else next.items[at] = item;
    }
    merge(change.dictionaries);
  } else if (change.kind === "remove") {
    const gone = new Set();
    for (const [i, id] of (change.ids ?? []).entries()) {
      if (!ids.has(id)) problem(`ids[${i}]`, `ids[${i}]: the pack has no item "${shown(id, 50)}".`);
      gone.add(id);
    }
    next.items = next.items.filter((item) => !gone.has(item.id));
  } else if (change.kind === "edit") {
    if (change.name !== undefined) next.name = change.name;
    if (change.about !== undefined) {
      if (change.about === null || change.about === "") delete next.about;
      else next.about = change.about;
    }
    merge(change.dictionaries);
  }
  return done(next);
}

// ---------- a person's edits (shell/settings-pack-edit.js) ----------

// How far a word can change and still be the same word with its spelling fixed, and how many of a sentence's words can.
const CLOSE_WORD = (length) => Math.max(1, Math.floor(length / 3));
const CLOSE_WORDS = (count) => Math.max(1, Math.floor(count / 3));
const RUN_TOGETHER_CHARS = (length) => Math.max(1, Math.floor(length / 5));

function spellingDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

const noMarks = (word) => bare(word).normalize("NFD").replace(/\p{M}/gu, "");
const sameWordRespelled = (a, b) => {
  const [x, y] = [noMarks(a), noMarks(b)];
  return x === y || spellingDistance(x, y) <= CLOSE_WORD(Math.max(x.length, y.length));
};

/**
 * The words of a sentence after a spelling fix to its text: the same words, each [text, lemma?, reading?], with the fixed ones
 * respelled, and [old, new] for each fixed one. null when the text says something else: other words, or more of them than a fix.
 */
function respelled(item, text, language) {
  const old = item.words.map(([word]) => word);
  const { words, punct } = splitSentence(text, language);
  if (separatorOf(language) === "") {
    // Written without spaces: one run of changed characters, inside one word.
    const was = old.join("");
    const now = cleanText(text).slice(0, cleanText(text).length - punct.length);
    let start = 0;
    while (start < was.length && start < now.length && was[start] === now[start]) start++;
    let end = 0;
    while (end < was.length - start && end < now.length - start && was[was.length - 1 - end] === now[now.length - 1 - end]) end++;
    if (was === now) return { words: item.words, punct, fixes: [] };
    if (Math.max(was.length - start - end, now.length - start - end) > RUN_TOGETHER_CHARS(was.length)) return null;
    let at = 0;
    for (let w = 0; w < old.length; w++) {
      const from = at;
      at += old[w].length;
      if (start < from || was.length - end > at) continue;
      const word = now.slice(from, at + now.length - was.length);
      if (!word) return null;
      return { words: item.words.map((entry, i) => (i === w ? [word, ...entry.slice(1)] : entry)), punct, fixes: [[old[w], word]] };
    }
    return null;
  }
  if (words.length !== old.length) return null;
  const fixes = [];
  for (const [i, word] of words.entries()) {
    if (word === old[i]) continue;
    if (!sameWordRespelled(old[i], word)) return null;
    fixes.push([old[i], word]);
  }
  if (fixes.length > CLOSE_WORDS(old.length)) return null;
  return { words: item.words.map((entry, i) => [words[i], ...entry.slice(1)]), punct, fixes };
}

// A word respelled in a sentence of the same language: as a whole word, whatever's around it.
const respell = (sentence, fixes, language) => {
  let out = sentence;
  for (const [was, now] of fixes) {
    if (separatorOf(language) === "") out = out.replaceAll(was, now);
    else {
      const [core, fixed] = [trimWord(was), trimWord(now)];
      out = out.split(" ").map((token) => (core && trimWord(token) === core ? token.replace(core, fixed) : token)).join(" ");
    }
  }
  return out;
};

/**
 * An item with what a person changed: its text and what it means, and how it's said where it has that. Everything else on it stays,
 * including fields added after this was written. A spelling fix to a sentence carries into its words, wrong versions and gap. Anything more
 * can't: its word-by-word help describes the old sentence, so rewrite is true, that help goes, and it's a simple item.
 * → { item, rewrite, problems: [{ at, message }] } (the pack's check judges the rest).
 */
export function editItem(item, { text, means, reading } = {}, language) {
  const problems = [];
  // A copy of another pack's item (copyOf) changed is an item of its own: it would otherwise carry what was learned on a
  // different sentence. An edit that changes nothing keeps it; Undo puts the item back as it was, copyOf too.
  const { copyOf, ...rest } = item;
  const next = { ...rest };
  if (means !== undefined) {
    const value = cleanText(means);
    if (value) next.means = value;
    else if (item.cloze) delete next.means;
    else problems.push({ at: "means", message: "Say what it means." });
  }
  if (reading !== undefined) {
    const value = cleanText(reading);
    if (value) next.reading = value;
    else delete next.reading;
  }
  let rewrite = false;
  const wanted = text === undefined ? null : cleanText(text);
  if (wanted === "") problems.push({ at: "text", message: "Write the word or sentence." });
  else if (wanted !== null && wanted !== (item.words ? itemSentence(item, language) : item.text)) {
    if (item.words) {
      const fix = respelled(item, wanted, language);
      if (fix) {
        next.words = fix.words;
        next.punct = fix.punct;
        if (!next.punct) delete next.punct;
        next.text = itemSentence(next, language);
        if (item.wrong) next.wrong = item.wrong.map((sentence) => respell(sentence, fix.fixes, language));
        if (item.moved) next.moved = item.moved.map((word) => fix.fixes.find(([was]) => was === word)?.[1] ?? word);
        // A mark on a respelled word's letters can't be trusted any more; the rest stay, and are checked again with the pack.
        if (item.shapes) {
          next.shapes = respelledShapes(item.shapes, item.words.map(([word]) => word), fix.words.map(([word]) => word));
          if (!next.shapes) delete next.shapes;
        }
        if (item.gap) next.gap = { ...item.gap, options: item.gap.options.map((option) => {
          const word = typeof option === "string" ? option : option?.text;
          const now = fix.fixes.find(([was]) => was === word)?.[1];
          return now === undefined ? option : typeof option === "string" ? now : { ...option, text: now };
        }) };
      } else {
        rewrite = true;
        for (const key of ["words", "punct", "literal", "english", "moved", "wrong", "gap", "notes", "shapes"]) delete next[key];
        next.text = wanted;
      }
    } else {
      next.text = wanted;
      if (item.cloze) {
        // What it hides, wherever it is now: the same one, where the text says it more than once.
        const places = (within) => {
          const found = [];
          for (let at = within.indexOf(item.cloze.answer); at >= 0; at = within.indexOf(item.cloze.answer, at + 1)) found.push(at);
          return found;
        };
        const now = places(wanted);
        if (!now.length) problems.push({ at: "text", message: `This card hides “${item.cloze.answer}”, which isn't in the text any more. Keep it in the text.` });
        else next.cloze = { ...item.cloze, at: now[Math.min(Math.max(places(item.text).indexOf(item.cloze.at), 0), now.length - 1)] };
      }
    }
  }
  if (copyOf !== undefined && JSON.stringify(orderedItem(next)) === JSON.stringify(orderedItem(rest))) next.copyOf = copyOf;
  return { item: orderedItem(next), rewrite, sentenceBefore: isSentence(item), problems };
}

/** A new item as small as a person writes it: a word or sentence, and what it means. taken: the pack's item ids. → { item, problems } */
export function simpleItem({ text, means } = {}, { language, taken = new Set() } = {}) {
  const problems = [];
  const [written, meaning] = [cleanText(text ?? ""), cleanText(means ?? "")];
  if (!written) problems.push({ at: "text", message: "Write the word or sentence." });
  if (!meaning) problems.push({ at: "means", message: "Say what it means." });
  if (problems.length) return { item: null, problems };
  return { item: orderedItem({ id: idFor(splitSentence(written, language).words, taken), text: written, means: meaning }), problems };
}

/**
 * What puts a pack's items back after a change to them, holding only the items it touched: [{ id, at?, item }] (item null: it wasn't
 * there). null for a change of anything else, which has to keep the pack as it was.
 */
export function inverseOf(pack, change) {
  if (!pack || change?.dictionaries) return null;
  const at = new Map(pack.items.map((item, i) => [item.id, i]));
  if (change.kind === "add") return change.items.map((item) => ({ id: item.id, item: null }));
  if (change.kind === "update") return change.items.map((item) => ({ id: item.id, item: pack.items[at.get(item.id)] ?? null }));
  if (change.kind === "remove") return change.ids.filter((id) => at.has(id)).sort((a, b) => at.get(a) - at.get(b)).map((id) => ({ id, at: at.get(id), item: pack.items[at.get(id)] }));
  return null;
}

/** A pack with an inverse (inverseOf) applied: as it was before that change. */
export function withInverse(pack, inverse) {
  const items = [...pack.items];
  for (const { id, at, item } of inverse) {
    const here = items.findIndex((one) => one.id === id);
    if (!item) {
      if (here >= 0) items.splice(here, 1);
    } else if (here >= 0) items[here] = item;
    else items.splice(Math.min(at ?? items.length, items.length), 0, item);
  }
  return { ...pack, items };
}

/** A new pack's shell, before its items: what create_pack starts from. */
export const newPack = ({ id, name, about, language, from = "en" }) => ({
  format: PACK_FORMAT,
  version: PACK_VERSION,
  id,
  name,
  ...(about ? { about } : {}),
  language,
  from,
  topics: {},
  words: {},
  chunks: {},
  patterns: {},
  items: [],
});

/** A pack id made from its name ("Travel in Germany" → "travel-in-germany"), not one of `taken`. */
export function packIdFor(name, taken = new Set()) {
  const slug = cleanText(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  const base = slug.length >= 2 ? slug : "my-pack";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** What a change does, in a few words, for the person and their AI ("added 12 sentences"). was: the pack's name before. */
export function describeChange(change, { name, was } = {}) {
  const n = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  const to = name ? ` to ${name}` : "";
  if (change.kind === "create") return `made ${change.pack?.name ?? "a pack"} (${n(change.pack?.items?.length ?? 0, "sentence")})`;
  if (change.kind === "add") return `added ${n(change.items?.length ?? 0, "sentence")}${to}`;
  if (change.kind === "update") return `changed ${n(change.items?.length ?? 0, "sentence")}${name ? ` in ${name}` : ""}`;
  if (change.kind === "remove") return `took ${n(change.ids?.length ?? 0, "sentence")} out${name ? ` of ${name}` : ""}`;
  if (change.kind === "edit") return change.name && was && change.name !== was ? `renamed ${was} to ${change.name}` : `changed the details of ${name ?? "a pack"}`;
  if (change.kind === "delete") return `deleted ${name ?? "a pack"}`;
  return `undid a change${name ? ` to ${name}` : ""}`;
}

/**
 * A pack's own patterns as your AI names them, made the pack's (since 2 Nov 2026): a new one (not in the language's
 * shared grammar, and not a bare id the pack already has from before) is kept as "<pack id>.<id>", so it never
 * collides with another pack's or with what the shared grammar adds later. An item, or another pattern's after, naming
 * it by its bare id names the pack's; a bare id set to null takes the pack's out. catalogue: the language's shared
 * grammar (LANGUAGES[lang].patterns, as installed). Returns the change with its patterns and items rewritten (a
 * change of another kind as it came).
 */
export function ownPatternIds(change, pack, catalogue = {}) {
  if (!isObject(change) || !["create", "add", "update", "edit"].includes(change.kind)) return change;
  const packId = change.kind === "create" ? change.pack?.id : pack?.id;
  if (typeof packId !== "string" || !packId) return change;
  const before = change.kind === "create" ? {} : (pack?.patterns ?? {});
  const incoming = change.kind === "create" ? change.pack?.patterns : change.dictionaries?.patterns;
  const BARE = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const renamed = new Map();
  if (isObject(incoming)) {
    for (const [id, value] of Object.entries(incoming)) {
      if (!BARE.test(id) || Object.hasOwn(catalogue, id) || Object.hasOwn(before, id)) continue;
      const own = `${packId}.${id}`;
      // A new one, or (set to null) the pack's own by its bare name.
      if (value !== null || Object.hasOwn(before, own)) renamed.set(id, own);
    }
  }
  // A bare id an item names: the one this change makes, else the pack's own already, else as it is.
  const resolve = (id) => (typeof id !== "string" ? id : renamed.get(id) ?? (BARE.test(id) && !Object.hasOwn(catalogue, id) && !Object.hasOwn(before, id) && Object.hasOwn(before, `${packId}.${id}`) ? `${packId}.${id}` : id));
  const rewritePatterns = (patterns) =>
    isObject(patterns)
      ? Object.fromEntries(
          Object.entries(patterns).map(([id, value]) => [renamed.get(id) ?? id, isObject(value) && Array.isArray(value.after) ? { ...value, after: value.after.map(resolve) } : value]),
        )
      : patterns;
  const rewriteItems = (items) => (Array.isArray(items) ? items.map((item) => (isObject(item) && Array.isArray(item.concepts) ? { ...item, concepts: item.concepts.map(resolve) } : item)) : items);
  if (change.kind === "create") return { ...change, pack: { ...change.pack, patterns: rewritePatterns(change.pack.patterns), items: rewriteItems(change.pack.items) } };
  const next = { ...change };
  if (isObject(change.dictionaries) && isObject(change.dictionaries.patterns)) next.dictionaries = { ...change.dictionaries, patterns: rewritePatterns(change.dictionaries.patterns) };
  if (change.items) next.items = rewriteItems(change.items);
  return next;
}
