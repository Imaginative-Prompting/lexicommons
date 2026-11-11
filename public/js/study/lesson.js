// A lesson as questions. Nothing teaches before it asks: a new thing's first appearance is already a question you can answer,
// shown and heard, its meaning a free tap away. One new thing at a time, the earlier ones coming back mixed in, short
// sentences from the fourth or fifth question. The numbers come from the lessons we measured
// (../docs/design/lessons/duolingo-reference.md): 15 questions, 5 to 7 new things, each back about 5 times.
// Every other choice on the screen is something you know or something in this lesson, never anything further on, and
// never a word on the not-a-choice list. Pure, so it runs in Node.

import { contentLanguage, WORDS } from "./content.js";
import { glossOfForm, isHeavy, isNotFirst, lemmasOf, oneEnglishEach, pairsWithItself, sentencesWith, shortMeaning, targetOf, thingEnglish } from "./new-words.js";
import { taughtForm } from "./path.js";
import { wordForWord } from "./reword.js";
import { ideaLine, ideaName, partsBrought } from "./idea-parts.js";
import { englishOrderTexts } from "../lx/literal-case.js";
import literalOkNl from "../lang/literal-ok.nl.js";
import literalOkEs from "../lang/literal-ok.es.js";
import literalOkFr from "../lang/literal-ok.fr.js";
import literalOkDe from "../lang/literal-ok.de.js";
import literalOkPt from "../lang/literal-ok.pt.js";
import literalOkIt from "../lang/literal-ok.it.js";
import literalOkRu from "../lang/literal-ok.ru.js";
import literalOkJa from "../lang/literal-ok.ja.js";

/** Questions in a lesson. */
export const LESSON_QUESTIONS = 15;
/** Questions in a unit's full lesson: a bit longer, and asking across all of it. */
export const FULL_UNIT_QUESTIONS = 25;
/** Questions in a lesson of one idea: nothing new to learn by heart, so fewer. */
export const IDEA_QUESTIONS = 10;
/** Sentences a lesson of one idea asks on: its own, then others that show the idea. */
const IDEA_SENTENCES = 8;
/** Pictures a picture question needs on the screen, the right one included; with fewer, its words stand alone. */
export const MIN_PICTURES = 3;
const MOST_OPTIONS = 4;
/** Words from lessons you skipped that one sentence of a lesson may hold. */
const MOST_BORROWED = 4;
const bare = (text) => text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "").toLocaleLowerCase();
const seeded = (text) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const mixed = (list, seed) => [...list].sort((a, b) => seeded(`${seed}:${a}`) - seeded(`${seed}:${b}`));

// Whether this device has a drawing for a concept (pictures.js; Node has none unless a test says so).
let hasPicture = () => false;
export const setPictures = (fn) => {
  hasPicture = fn ?? (() => false);
};
// Whether a drawing has a story it plays when it's tapped (reactions.js, which says so as it loads; Node has none unless a test says so).
let hasStory = () => false;
export const setStories = (fn) => {
  hasStory = fn ?? (() => false);
};

/** A word with its article: an article that runs into its word stays against it (l'eau). */
export const articled = (article, text) => `${article}${/['’]$/.test(article) ? "" : " "}${text}`;

/** How a thing is shown on its first question: { text, means }: a noun with its article, a word in the form its lesson teaches, a phrase whole. */
export function shownThing(thing) {
  // What it means, plainly: the first sense, with no working notes (want (ik, hij)).
  const means = thing.means.replace(/\s*\([^)]*\)/g, "").split(";")[0].trim();
  if (thing.phrase) return { text: thing.text, means };
  if (thing.article) return { text: articled(thing.article, thing.text), means };
  const pair = means.split(" = ");
  if (pair.length === 2) return { text: pair[0].trim(), means: pair[1].trim() };
  return { text: taughtForm(thing), means };
}

/** A thing's meaning on a lesson's page, where it's named by its dictionary form: to make, not "maak = make; maken = make". */
export const meaningOfThing = (thing) => (thing.lemma ? shortMeaning(thing.lemma) : "") || shownThing(thing).means;

/** The English of a sentence as tiles: its plain words, in order, capitals only where English keeps them. */
export function englishTiles(natural) {
  return natural
    .replace(/[.,!?;:…"“”]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => (i === 0 && !/^(I|I'm|I'd|I'll|I've)$/.test(word) ? word.toLocaleLowerCase() : word));
}

// What's on offer for the wrong choices: this lesson's things (those to come too), then what you know, nearest first.
export function poolOf(lesson, lessons, ctx) {
  const pool = [];
  const add = (thing, own) => {
    const key = thing.lemma ?? thing.phrase;
    if (pool.some((one) => one.key === key) || (thing.lemma && isHeavy(thing.lemma))) return;
    pool.push({ key, thing, own, ...shownThing(thing) });
  };
  for (const thing of lesson.things) if (!thing.formOnly) add(thing, true);
  const at = lessons.indexOf(lesson);
  for (let i = at - 1; i >= 0; i--) {
    for (const thing of lessons[i].things) {
      if (thing.formOnly) continue;
      const known = thing.lemma ? ctx.known(thing.lemma) && !ctx.st(thing.unit).isNew : !ctx.st(thing.unit).isNew;
      if (known) add(thing, false);
    }
  }
  return pool;
}

// Each of a list's things once, in their order (the first kept).
const once = (list) => {
  const seen = new Set();
  return list.filter((one) => !seen.has(one.key) && seen.add(one.key));
};

// Up to 3 wrong choices for a thing, of its own kind first (a noun among nouns), none saying what it says.
function wrongFor(entry, pool, seed, { pictured = false } = {}) {
  const fold = (text) => text.toLocaleLowerCase().replace(/^(the|to|a|an) /, "");
  // A long list of what you know needn't all be looked at: this lesson's, and a run of the rest from a place the seed picks.
  const start = pool.length > 80 ? seeded(seed) % pool.length : 0;
  // This lesson's own come first, and the run can reach them again (from its start, or wrapping round): each thing once, so no question
  // offers the same choice twice (it did past 80 things known, from about lesson 20: "the male friend" twice).
  const near = once(pool.length > 80 ? [...pool.filter((one) => one.own), ...pool.slice(start, start + 80), ...pool.slice(0, Math.max(0, start + 80 - pool.length))] : pool);
  const usable = near.filter((one) => one.key !== entry.key && fold(one.means) !== fold(entry.means) && one.text !== entry.text && (!pictured || (one.thing.picture && hasPicture(one.thing.picture))));
  const kind = (one) => (one.thing.article ? "noun" : one.thing.phrase ? "phrase" : "word");
  // A picture with a story comes first among those as fair as it (the same kind, from the same place), so every story gets its turn to be seen.
  const told = (one) => pictured && kind(one) === kind(entry) && hasStory(one.thing.picture);
  const rank = (one) => (kind(one) === kind(entry) ? 0 : 2) + (one.own ? 0 : 1) - (told(one) ? 0.5 : 0);
  // Two choices saying the same (je and jouw are both "your") or written the same would be one choice twice on the screen: the first only.
  const said = new Set();
  const written = new Set();
  const sorted = [...usable]
    .sort((a, b) => rank(a) - rank(b) || seeded(`${seed}:${a.key}`) - seeded(`${seed}:${b.key}`))
    .filter((one) => !said.has(fold(one.means)) && !written.has(one.text) && said.add(fold(one.means)) && written.add(one.text));
  if (!pictured) return sorted.slice(0, MOST_OPTIONS - 1);
  // Several words can share a drawing (mother, mama): never two of the same on a screen, nor one that's the answer's.
  const drawings = new Set([entry.thing.picture]);
  const wrong = [];
  for (const one of sorted) {
    if (wrong.length >= MOST_OPTIONS - 1) break;
    if (drawings.has(one.thing.picture)) continue;
    drawings.add(one.thing.picture);
    wrong.push(one);
  }
  return wrong;
}

/** A question on one thing: shown and heard, which of these is it? With pictures where there are enough, else their words. */
export function seeStep(entry, pool, { isNew = false, again = false } = {}) {
  const seed = `see:${entry.key}`;
  const drawn = entry.thing.picture && hasPicture(entry.thing.picture) ? wrongFor(entry, pool, seed, { pictured: true }) : [];
  const usePictures = drawn.length >= MIN_PICTURES - 1;
  const wrong = usePictures ? drawn : wrongFor(entry, pool, seed);
  if (wrong.length < 1) return null;
  const options = [entry, ...wrong].map((one) => ({ key: one.key, label: one.means, picture: usePictures ? one.thing.picture : null }));
  const shuffled = mixed(options.map((one) => one.key), seed).map((key) => options.find((one) => one.key === key));
  return { kind: "see", unit: entry.thing.unit, target: entry.thing.lemma ?? null, phrase: entry.thing.phrase ?? null, text: entry.text, options: shuffled, correct: shuffled.findIndex((one) => one.key === entry.key), skill: "read", ...(isNew ? { isNew: true, meaning: "new" } : {}), ...(again ? { again: true } : {}) };
}

/** A thing's drawing, where it has one that's drawn: what a question about it by itself shows beside its English. */
const pictureOf = (entry) => (entry.thing.picture && hasPicture(entry.thing.picture) ? { picture: entry.thing.picture } : {});

/** A question from English: which of these says it? Words you know or this lesson's. Its drawing beside the English, where it has one. */
export function wordStep(entry, pool) {
  const seed = `word:${entry.key}`;
  const wrong = wrongFor(entry, pool, seed).slice(0, 2);
  if (wrong.length < 1) return null;
  const texts = mixed([entry.text, ...wrong.map((one) => one.text)], seed);
  return { kind: "word", unit: entry.thing.unit, target: entry.thing.lemma ?? null, phrase: entry.thing.phrase ?? null, means: entry.means, ...pictureOf(entry), options: texts, correct: texts.indexOf(entry.text), skill: "read" };
}

/**
 * The speaking twins, Say the word (Pick the word's: its English and its drawing, and you say what says it) and Repeat the word (Tap the picture's:
 * you hear it, with its drawing, and say it back). Saying a word from its meaning is the say strength; saying back what you heard, how you sound.
 */
export function speakWordStep(entry, kind) {
  if (!entry.text || (kind !== "say-word" && kind !== "repeat-word")) return null;
  const picture = pictureOf(entry);
  // Repeat the word is Tap the picture's twin: the word you hear, and its drawing. A word with none isn't asked this way.
  if (kind === "repeat-word" && !picture.picture) return null;
  return { kind, unit: entry.thing.unit, target: entry.thing.lemma ?? null, phrase: entry.thing.phrase ?? null, means: entry.means, ...picture, text: entry.text, ...(entry.thing.article ? { article: entry.thing.article } : {}), skill: kind === "say-word" ? "say" : "sound" };
}

/**
 * Pick the word's typing twin: the English (and its drawing), and you type what says it, as it's taught (a noun with its article). Saying a
 * word from its meaning is the say strength, as typing a sentence is.
 */
export function typeWordStep(entry) {
  if (!entry.text) return null;
  return { kind: "type-word", unit: entry.thing.unit, target: entry.thing.lemma ?? null, phrase: entry.thing.phrase ?? null, means: entry.means, ...pictureOf(entry), text: entry.text, ...(entry.thing.article ? { article: entry.thing.article } : {}), skill: "say" };
}

// A word's English for the stray tiles: only the English of its shown meaning (shownThing has taken out its notes and kept its first sense),
// the side after an " = " and nothing after a colon, which is a note in the language itself ("a lot: molto with an il word", "d'eau = water").
const strayMeaning = (means) => String(means ?? "").split(" = ").at(-1).split(":")[0];

// English words a sentence's tiles may be mixed with: from what this lesson says, and never one of its own.
function strayEnglish(answer, sentences, pool, seed, count) {
  const lower = answer.map((word) => word.toLocaleLowerCase());
  // Not one that's nearly one of its own, which only looks like a trick: Sunday beside Sundays.
  const near = (word) => lower.some((own) => own.startsWith(word.toLocaleLowerCase()) || word.toLocaleLowerCase().startsWith(own));
  const others = new Set();
  for (const item of sentences) for (const word of englishTiles(item.means)) if (!near(word)) others.add(word);
  for (const one of pool) for (const word of englishTiles(strayMeaning(one.means))) if (!near(word) && !/^(the|a|an|to)$/i.test(word)) others.add(word);
  return mixed([...others], seed).slice(0, count);
}

function strayLanguage(item, pool, seed) {
  const used = new Set(item.words.map(([text]) => bare(text)));
  return mixed(pool.filter((one) => !one.thing.phrase).map((one) => (one.thing.forms?.[0] ?? one.thing.text)).filter((form) => !used.has(bare(form))), seed).slice(0, 1);
}

/** A sentence to translate: it's said and shown, you build its English from tiles. news: the words in it that are new here. */
// The reworded sentences whose word-for-word line is acceptable English too, by language, pack and sentence (lang/literal-ok.<code>.js).
const LITERAL_OK = { nl: literalOkNl, es: literalOkEs, fr: literalOkFr, de: literalOkDe, pt: literalOkPt, it: literalOkIt, ru: literalOkRu, ja: literalOkJa };
const ownId = (item) => (item.pack && item.id.startsWith(`${item.pack}/`) ? item.id.slice(item.pack.length + 1) : item.id);

/**
 * The other answer a sentence's English game takes, as tiles: its word-for-word line in English order ("I drink a coffee" beside "I'm
 * having a coffee"), when that line, exactly as it is now, is judged acceptable English for the Dutch; null otherwise, or when it's
 * the same words as the English.
 */
export function alsoAnswer(item) {
  const lines = LITERAL_OK[contentLanguage()]?.[item?.pack]?.[ownId(item)];
  const line = lines && wordForWord(item);
  if (!line || !lines.includes(line.map(([text]) => text).join(" "))) return null;
  const english = Array.isArray(item.english) && item.english.length === item.literal.length ? item.english : null;
  const texts = englishOrderTexts(item.literal.map(([text]) => ({ text })), english, item.means);
  const tiles = englishTiles((english ?? texts.map((_, i) => i)).map((i) => texts[i]).join(" "));
  const answer = englishTiles(item.means);
  return tiles.length === answer.length && tiles.every((word, i) => word === answer[i]) ? null : tiles;
}

/** The words of `also` beyond those `answer` already has (as many times as also has them), for its tiles. */
function beyond(also, answer) {
  const left = [...answer];
  return also.filter((word) => {
    const at = left.indexOf(word);
    if (at < 0) return true;
    left.splice(at, 1);
    return false;
  });
}

export function translateStep(item, sentences, pool, { news = [] } = {}) {
  const answer = englishTiles(item.means);
  // Read word for word, the sentence's English can be right too: its words go in the bank, and strays never repeat them.
  const also = alsoAnswer(item);
  const extra = also ? beyond(also, answer) : [];
  const stray = strayEnglish([...answer, ...extra], sentences, pool, item.id, answer.length <= 3 ? 1 : 2);
  return { kind: "translate", item, answer, ...(also ? { also } : {}), tiles: mixed([...answer.map((word, i) => `${i}|${word}`), ...extra.map((word, i) => `a${i}|${word}`), ...stray.map((word, i) => `s${i}|${word}`)], item.id).map((key) => key.slice(key.indexOf("|") + 1)), skill: "read", ...(news.length ? { news, isNew: true, meaning: "new" } : {}) };
}

// Every word some lesson on the path teaches, per path (pathLessons keeps one array until the content changes).
const onPaths = new WeakMap();
function taughtOn(lessons) {
  if (!onPaths.has(lessons)) onPaths.set(lessons, new Set(lessons.flatMap((one) => (one.things ?? []).map((thing) => thing.lemma).filter(Boolean))));
  return onPaths.get(lessons);
}

/**
 * A lesson's questions, for what's left of it. ctx: the plan's context (known, st, byId, hears, canHear); allowed: the games on.
 * Returns the steps, or [] when there's nothing left to teach in it.
 */
export function lessonSteps(lesson, lessons, ctx, { allowed = null, count = lesson.full ? FULL_UNIT_QUESTIONS : lesson.kind === "idea" ? IDEA_QUESTIONS : LESSON_QUESTIONS, fill = null } = {}) {
  const can = (kind) => !allowed || allowed.includes(kind);
  const pool = poolOf(lesson, lessons, ctx);
  const entry = (thing) => pool.find((one) => one.key === (thing.lemma ?? thing.phrase)) ?? { key: thing.lemma ?? thing.phrase, thing, own: true, ...shownThing(thing) };
  const fresh = (thing) => ctx.st(thing.unit).isNew;
  const todo = lesson.things.filter((thing) => (thing.formOnly ? !ctx.formMet?.(thing) : fresh(thing)));
  // Its sentences: a written lesson's, or for one worked out from the packs, a few that hold its words and otherwise what you know.
  const inLesson = new Set(lesson.things.filter((thing) => thing.lemma).map((thing) => thing.lemma));
  // What an idea's card says here, and what it's called: an idea told in parts says the parts whose words you know once this lesson's are in
  // (idea-parts.js), so it never names a word you haven't met; any other keeps its lesson's line and the grammar's name.
  const knowsHere = (word) => ctx.known(word) || inLesson.has(word);
  const lineOf = (pattern, fallback) => ideaLine(contentLanguage(), pattern, knowsHere) ?? fallback;
  const nameOf = (pattern, fallback) => ideaName(contentLanguage(), pattern, knowsHere) ?? fallback;
  // A lesson you jumped to: its sentences hold words from lessons you haven't done. They stay, with those words marked and their meaning a free tap, up to the most anyone
  // can read that way, and they don't count as learned: you meet them, and Practice doesn't ask about them till you've learned them. Never words from further on.
  // A word no lesson on the path teaches (with only a pack written for its words on, the little words its sentences need: het, is, de) comes
  // along the same way: marked, its meaning a free tap, never counted as learned. Never a word a later lesson teaches.
  const earlier = new Set(lessons.slice(0, Math.max(0, lessons.indexOf(lesson))).flatMap((one) => one.things.map((thing) => thing.lemma).filter(Boolean)));
  const onPath = taughtOn(lessons);
  const along = (word) => earlier.has(word) || !onPath.has(word);
  const ownPhrases = new Set(lesson.things.map((thing) => thing.phrase).filter(Boolean));
  const borrowedIn = (item) => [
    ...new Set(lemmasOf(item).filter((word) => WORDS[word] && !inLesson.has(word) && !ctx.known(word) && along(word)).map((word) => `w:${word}`)),
    ...(item.chunks ?? []).filter((id) => !ownPhrases.has(id) && ctx.st(`c:${id}`).isNew).map((id) => `c:${id}`),
  ];
  const fits = (item) => lemmasOf(item).every((word) => inLesson.has(word) || ctx.known(word) || !WORDS[word] || along(word));
  let sentences = (lesson.items ?? []).map((id) => ctx.byId.get(id)?.item).filter(Boolean);
  if (!sentences.length) {
    const seen = new Set();
    for (const thing of lesson.things) {
      for (const item of [...sentencesWith(thing.lemma ?? "")].filter((one) => fits(one) && !isNotFirst(one)).sort((a, b) => a.words.length - b.words.length).slice(0, 4)) {
        if (!seen.has(item.id)) sentences.push(item), seen.add(item.id);
      }
    }
  }
  sentences = sentences.filter(fits);
  // Too many words you haven't met in one sentence is no question at all: those go, as long as there are a few left to ask about.
  const readable = sentences.filter((item) => borrowedIn(item).length <= MOST_BORROWED);
  sentences = readable.length >= 3 ? readable : [...sentences].sort((a, b) => borrowedIn(a).length - borrowedIn(b).length).slice(0, 3);
  // A lesson of one idea has only a few sentences of its own: it asks on more that show the idea, every word in them one you know, its own pack's first and the shortest first.
  const own = new Set(sentences.map((item) => item.id));
  if (lesson.kind === "idea" && lesson.concept) {
    const pack = `${lesson.id.split("/")[0]}/`;
    const more = (ctx.infos ?? [])
      .map((info) => info.item)
      .filter((item) => !own.has(item.id) && item.concepts?.includes(lesson.concept.pattern) && item.words.length > 1 && fits(item) && !borrowedIn(item).length && !isNotFirst(item))
      .sort((a, b) => Number(!b.id.startsWith(pack)) - Number(!a.id.startsWith(pack)) || a.words.length - b.words.length);
    sentences = [...sentences, ...more.slice(0, Math.max(0, IDEA_SENTENCES - sentences.length))];
  }

  const seen = new Set(lesson.things.filter((thing) => !todo.includes(thing)).map((thing) => thing.unit));
  const unseenIn = (item) =>
    todo.filter((thing) => {
      if (seen.has(thing.unit)) return false;
      if (thing.phrase) return (item.chunks ?? []).includes(thing.phrase);
      if (thing.formOnly) return item.words.some(([text]) => thing.forms.some((form) => bare(form) === bare(text)));
      return lemmasOf(item).includes(thing.lemma);
    });
  const uses = new Map(lesson.things.map((thing) => [thing.unit, 0]));
  const usedIn = (item) => {
    for (const thing of lesson.things) if ((thing.phrase && (item.chunks ?? []).includes(thing.phrase)) || (thing.lemma && lemmasOf(item).includes(thing.lemma))) uses.set(thing.unit, uses.get(thing.unit) + 1);
  };
  const steps = [];
  const asked = new Map(); // how many times a sentence has been a question
  const askedWord = new Set();
  const askedInPictures = new Set();
  const push = (step, item) => {
    steps.push(step);
    if (step.kind === "see") askedInPictures.add(step.unit);
    if (item) {
      asked.set(item.id, (asked.get(item.id) ?? 0) + 1);
      usedIn(item);
    } else if (step.unit) uses.set(step.unit, (uses.get(step.unit) ?? 0) + 1);
  };
  const ready = () => sentences.filter((item) => !unseenIn(item).length);
  // Fewest words you haven't met first. Only What does it say? and Fill the gap ask about a sentence with such words in it: the others need you to know them.
  const plain = () => ready().filter((item) => !borrowedIn(item).length);
  // A full lesson looks for the sentence that covers most of what it hasn't asked yet.
  const unasked = (item) => (lesson.full ? -lemmasOf(item).filter((word) => (uses.get(`w:${word}`) ?? 1) === 0).length : 0);
  // A sentence asked twice already gives way to any asked less, so a lesson with few sentences doesn't ask one over and over.
  const twice = (item) => Number((asked.get(item.id) ?? 0) >= 2);
  const leastAsked = (list) => [...list].sort((a, b) => twice(a) - twice(b) || borrowedIn(a).length - borrowedIn(b).length || (asked.get(a.id) ?? 0) - (asked.get(b.id) ?? 0) || unasked(a) - unasked(b) || a.words.length - b.words.length)[0];
  const withBorrowed = (step, item, news = []) => {
    const borrowed = borrowedIn(item);
    return borrowed.length ? { ...step, borrowed, news: [...news, ...borrowed.map((unit) => unit.slice(2))] } : step;
  };

  // The questions that bring something back.
  const review = {
    // A word with a drawing that a sentence taught (only so many open a lesson) gets its picture question too. It's a turn something was coming back in anyway, so the lesson's no longer.
    picture() {
      if (!can("see") || lesson.full) return false;
      for (const thing of todo) {
        if (thing.formOnly || !thing.picture || !hasPicture(thing.picture) || !seen.has(thing.unit) || askedInPictures.has(thing.unit)) continue;
        const step = seeStep(entry(thing), pool);
        if (!step?.options.every((option) => option.picture)) continue;
        push(step);
        return true;
      }
      return false;
    },
    translate() {
      const item = can("translate") ? leastAsked(ready()) : null;
      // Three times is enough for one sentence: past that the turn goes to another game, or the lesson ends sooner.
      if (!item || (asked.get(item.id) ?? 0) >= 3) return false;
      push(withBorrowed(translateStep(item, sentences, pool), item), item);
      return true;
    },
    listen() {
      const heard = plain().filter((item) => ctx.canHear(item));
      const item = can("listen") ? leastAsked(heard) : null;
      if (!item) return false;
      push({ kind: "listen", mode: "order", item, stray: strayLanguage(item, pool, item.id), skill: "hear" }, item);
      return true;
    },
    word() {
      if (!can("word")) return false;
      const met = lesson.things.filter((thing) => !thing.formOnly && seen.has(thing.unit) && !askedWord.has(thing.unit)).sort((a, b) => uses.get(a.unit) - uses.get(b.unit));
      for (const thing of met) {
        const step = wordStep(entry(thing), pool);
        if (!step) continue;
        askedWord.add(thing.unit);
        push(step);
        return true;
      }
      return false;
    },
    fill() {
      if (!can("fill") || !fill) return false;
      for (const item of [...ready()].sort((a, b) => (asked.get(a.id) ?? 0) - (asked.get(b.id) ?? 0))) {
        if (!item.gap) continue;
        const options = fill(item, { also: pool });
        if (!options) continue;
        push(withBorrowed({ kind: "fill", item, target: targetOf(item), options, skill: "read" }, item), item);
        return true;
      }
      return false;
    },
    match() {
      if (!can("match") || steps.filter((step) => step.kind === "match").length >= (lesson.full ? 2 : 1)) return false;
      // Never a word beside itself (water and water): the lesson's other games ask it.
      const things = lesson.things.filter((thing) => !thing.formOnly && seen.has(thing.unit) && !(thing.lemma && pairsWithItself(thing.lemma, taughtForm(thing))));
      // Never two with the same English on their tiles (lesson 15's je and jouw, "your"): the later waits for the lesson's next round or game.
      const distinct = oneEnglishEach(lesson.full ? [...things].sort((a, b) => uses.get(a.unit) - uses.get(b.unit)) : things, thingEnglish);
      if (distinct.length < 4) return false;
      const chosen = distinct.slice(0, 5);
      push({ kind: "match", words: chosen.filter((thing) => thing.lemma).map((thing) => thing.lemma), phrases: chosen.filter((thing) => thing.phrase).map((thing) => thing.phrase), meaning: "new", skill: "read" });
      for (const thing of chosen) uses.set(thing.unit, uses.get(thing.unit) + 1);
      return true;
    },
    choose() {
      const item = can("choose") ? leastAsked(plain().filter((one) => one.wrong?.length)) : null;
      if (!item) return false;
      push({ kind: "choose", item, skill: "read" }, item);
      return true;
    },
    idea() {
      // The lesson's idea, once you've met it in a sentence: asked by the games that ask about it.
      if (!lesson.concept) return false;
      const shows = plain().filter((item) => item.concepts.includes(lesson.concept.pattern));
      const item = leastAsked(shows.filter((one) => one.wrong?.length));
      if (!item || (asked.get(item.id) ?? 0) > 1) return false;
      const kind = can("choose") && !steps.some((step) => step.kind === "choose" && step.item.id === item.id) ? "choose" : can("place") ? "place" : "arrange";
      if (!can(kind)) return false;
      push({ kind, ...(kind === "arrange" ? { mode: "dutch" } : {}), item, skill: "read" }, item);
      return true;
    },
    // Games a lesson doesn't lean on, for the turns of those you've turned off.
    arrange() {
      const item = can("arrange") ? leastAsked(plain().filter((one) => one.words.length > 1)) : null;
      if (!item) return false;
      push({ kind: "arrange", mode: "dutch", item, skill: "read" }, item);
      return true;
    },
    place() {
      const item = can("place") ? leastAsked(plain().filter((one) => one.moved?.length)) : null;
      if (!item) return false;
      push({ kind: "place", item, skill: "read" }, item);
      return true;
    },
    meaning() {
      const item = can("meaning") ? leastAsked(plain().filter((one) => targetOf(one))) : null;
      if (!item) return false;
      push({ kind: "meaning", item, target: targetOf(item), skill: "read" }, item);
      return true;
    },
    type() {
      const item = can("type") ? leastAsked(plain()) : null;
      if (!item) return false;
      push({ kind: "type", item, skill: "say" }, item);
      return true;
    },
    say() {
      const item = can("say") ? leastAsked(plain()) : null;
      if (!item) return false;
      push({ kind: "say", item, skill: "say" }, item);
      return true;
    },
    repeat() {
      const item = can("repeat") ? leastAsked(plain().filter((one) => ctx.canHear(one))) : null;
      if (!item) return false;
      push({ kind: "repeat", item, skill: "say" }, item);
      return true;
    },
  };
  // A full lesson leans on the games that ask you to bring a thing back yourself.
  const FULL_ROTATION = ["translate", "type", "word", "fill", "arrange", "listen", "choose", "word", "translate", "match", "say", "fill", "arrange", "word"];
  // A lesson of one idea asks about it most of the time, on its sentences, in the games that show it.
  const IDEA_ROTATION = ["idea", "translate", "idea", "fill", "idea", "listen", "idea", "choose", "arrange", "place"];
  const ROTATION = lesson.full ? FULL_ROTATION : lesson.kind === "idea" ? IDEA_ROTATION : lesson.concept ? ["idea", "word", "translate", "listen", "idea", "translate", "fill", "match", "translate", "choose"] : ["word", "translate", "listen", "word", "translate", "fill", "match", "translate", "choose"];
  let turn = 0;
  // A game that's off gives its turn to another that's on; the ones that ask most of you only when nothing else can.
  const INSTEAD = ["arrange", "place", "meaning"];
  let insteadTurn = 0;
  const bringBack = () => {
    if (review.picture()) return true;
    for (let tries = 0; tries < ROTATION.length; tries++) {
      const slot = ROTATION[turn++ % ROTATION.length];
      if (review[slot]()) return true;
      if (slot !== "idea" && !can(slot)) {
        for (let more = 0; more < INSTEAD.length; more++) if (review[INSTEAD[insteadTurn++ % INSTEAD.length]]()) return true;
      }
    }
    return review.type() || review.say() || review.repeat();
  };

  // The first things: up to 3 shown alone, things you can see first.
  const concrete = todo.filter((thing) => !thing.formOnly && (thing.article || thing.picture || thing.phrase));
  let opened = 0;
  for (const thing of concrete) {
    if (opened >= 3) break;
    const step = can("see") ? seeStep(entry(thing), pool, { isNew: true }) : null;
    if (!step) continue;
    push(step);
    seen.add(thing.unit);
    opened++;
  }
  // Then one at a time: a sentence that's otherwise known (up to two new things at once, as "Ik drink" comes), else the thing alone.
  let conceptShown = !lesson.concept;
  for (let guard = 0; guard < 24 && todo.some((thing) => !seen.has(thing.unit)) && steps.length < count + 3; guard++) {
    const opening = sentences.map((item) => ({ item, news: unseenIn(item) })).filter((one) => one.news.length >= 1 && one.news.length <= 2).sort((a, b) => a.news.length - b.news.length || a.item.words.length - b.item.words.length)[0];
    if (opening && can("translate")) {
      for (const thing of opening.news) seen.add(thing.unit);
      const news = opening.news.map((thing) => thing.lemma ?? thing.phrase);
      push(withBorrowed(translateStep(opening.item, sentences, pool, { news }), opening.item, news), opening.item);
    } else {
      const thing = todo.find((one) => !seen.has(one.unit) && !one.formOnly) ?? todo.find((one) => !seen.has(one.unit));
      seen.add(thing.unit);
      // However few games are on, a new word gets its first showing, and this is the plainest: Choose the games says so.
      const step = thing.formOnly ? null : (seeStep(entry(thing), pool, { isNew: true }) ?? wordStep(entry(thing), pool));
      if (step) push(step);
    }
    // The lesson's idea comes once you've seen it: after its first sentence, never before.
    if (!conceptShown) {
      const showing = steps.filter((step) => step.item?.concepts?.includes(lesson.concept.pattern)).length;
      if (showing >= 1) {
        const item = steps.findLast((step) => step.item?.concepts?.includes(lesson.concept.pattern)).item;
        steps.push({ kind: "meet", item, concept: { pattern: lesson.concept.pattern, line: lineOf(lesson.concept.pattern, lesson.concept.line), name: nameOf(lesson.concept.pattern, ctx.patternName?.(lesson.concept.pattern) ?? lesson.title) }, meaning: "new" });
        conceptShown = true;
      }
    }
    if (steps.filter((step) => step.kind !== "meet").length >= 3) bringBack();
  }
  // Nothing new to show first (a lesson of one idea, or you knew its words): its idea still comes, after a sentence that shows it.
  if (!conceptShown) {
    const showsIt = (one) => one.concepts.includes(lesson.concept.pattern);
    const item = leastAsked(plain().filter((one) => showsIt(one) && own.has(one.id))) ?? leastAsked(plain().filter(showsIt)) ?? leastAsked(ready().filter(showsIt));
    if (item && can("translate")) {
      push(withBorrowed(translateStep(item, sentences, pool), item), item);
      steps.push({ kind: "meet", item, concept: { pattern: lesson.concept.pattern, line: lineOf(lesson.concept.pattern, lesson.concept.line), name: nameOf(lesson.concept.pattern, ctx.patternName?.(lesson.concept.pattern) ?? lesson.title) }, meaning: "new" });
      conceptShown = true;
    }
  }
  // The rest of the lesson's questions: what it taught coming back, the least seen first.
  const questions = () => steps.filter((step) => step.kind !== "meet").length;
  for (let guard = 0; guard < 40 && questions() < count; guard++) if (!bringBack()) break;
  // Anything that hasn't come back enough gets one more turn, in the room there is.
  for (const thing of lesson.full ? [] : lesson.things) {
    if (thing.formOnly || questions() >= count + 2 || uses.get(thing.unit) >= 3) continue;
    const step = wordStep(entry(thing), pool);
    if (step && can("word")) push(step);
  }
  // A lesson that brings the last words of an idea's later part (je for belonging, deze and die for this and that) shows that part, after its
  // first question on a sentence that has the idea and one of those words: the idea's card, saying every part you know from now on.
  for (const { pattern, part, words } of partsBrought(contentLanguage(), (word) => ctx.known(word), (word) => inLesson.has(word))) {
    if (pattern === lesson.concept?.pattern) continue;
    const at = steps.findIndex((step) => step.kind !== "meet" && step.item?.concepts?.includes(pattern) && lemmasOf(step.item).some((word) => words.includes(word)));
    if (at < 0) continue;
    steps.splice(at + 1, 0, { kind: "meet", item: steps[at].item, concept: { pattern, line: lineOf(pattern, null), name: nameOf(pattern, ctx.patternName?.(pattern) ?? pattern), part }, meaning: "new" });
  }
  // Every question after an idea is shown carries it, so it can be seen again: { pattern, name, item, line } (the sentence it was shown with,
  // what its card said); after a second idea, that one.
  let idea = null;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].kind === "meet") {
      const { pattern, name, line } = steps[i].concept;
      idea = { pattern, name, item: steps[i].item.id, ...(line ? { line } : {}) };
    } else if (idea) steps[i] = { ...steps[i], idea };
  }
  void contentLanguage;
  void glossOfForm;
  void shortMeaning;
  return steps;
}
