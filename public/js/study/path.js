// The path through a language: the packs' written lessons (pack-format.js), then lessons worked out from the packs, the
// next few words by rank, so a language with no written path, or a learner past the end of one, has the same day. A pack
// written for its words (content.js WORD_PACKS: the word series, a category pack) teaches its own words, under its own name;
// a word another pack's sentence only needs comes along in that sentence, never as a lesson's new word.
// What a lesson teaches: { unit, lemma?, phrase?, text, article?, means, forms, formOnly? } per thing (a noun's article: Meet shows "de telefoon"). What you've learned of it comes from the
// evidence (plan.js); the one stored thing is where you've put yourself (path-place.js).

import { CHUNKS, ITEMS, LESSONS, PACKS, PATTERNS, TOPICS, WORDS, WORD_PACKS, contentLanguage, onContentChange } from "./content.js";
import { addSeen, anchorOf, markedOn, placeOn, seenOn, setAnchor, setAnchors } from "./path-place.js";
import { lessonsFinished } from "./done.js";
import { loadWordPictures, pictureOfWord } from "./pictures.js";
import { onFrequency } from "./frequency.js";
import { lemmasOf, wordsInOrder } from "./new-words.js";
import { keepPart, keptPart, planKey } from "./plan-kept.js";

/** Words in a lesson worked out from the packs. */
export const WORKED_OUT_WORDS = 4;

let cached = null;
let things = null;
let workedWords = null;
let builds = 0; // a path being laid out a piece at a time (pathSteps) is for this build of the study material, or for none
const reset = () => {
  cached = null;
  things = null;
  workedWords = null;
  builds++;
};
onContentChange(reset);
/**
 * A word's drawing, for a word a lesson doesn't name one for: its language's map (pictures.js), once it's in. The path is laid out again when
 * it arrives, so its words have their pictures. Resolves to whether there's a map.
 */
export function refreshPictures(language = contentLanguage()) {
  return loadWordPictures(language).then((ok) => {
    if (ok) reset();
    return ok;
  });
}
onContentChange(() => refreshPictures());
onFrequency(reset);

// lessonPicture: its drawing is the lesson's own (its word's picture field), drawn for the sense the lesson teaches (its means), with the ids of
// that lesson's sentences, whose sense it is; else the word's drawing from its language's words (pictureOfWord), if it has one.
const wordThing = (word, lesson = null) => ({ unit: `w:${word.lemma}`, lemma: word.lemma, text: word.lemma, ...(word.article ? { article: word.article } : {}), ...((word.picture ?? pictureOfWord(word.lemma)) ? { picture: word.picture ?? pictureOfWord(word.lemma) } : {}), ...(typeof word.picture === "string" ? { lessonPicture: lesson?.items ?? [] } : {}), means: word.means || WORDS[word.lemma] || "", forms: word.forms ?? [] });
const thingsOf = (lesson) => [
  ...(lesson.phrases ?? []).filter((id) => CHUNKS[id]).map((id) => ({ unit: `c:${id}`, phrase: id, text: CHUNKS[id].text, means: CHUNKS[id].en, forms: [] })),
  ...(lesson.words ?? []).map((word) => wordThing(word, lesson)),
];

// The worked-out lessons from what was kept (planKey's record, as pathLessons keeps them): each unit one object, as asLessons makes them.
function workedFromKept(rows) {
  const units = new Map();
  return rows.map(([unitId, unitTitle, id, title, pack, packName, ...words]) => {
    if (!units.has(unitId)) units.set(unitId, { id: unitId, title: unitTitle });
    const lesson = { unit: units.get(unitId), id, title, words: words.map((lemma) => ({ lemma, forms: [], means: WORDS[lemma] })), phrases: [], concept: null, items: [], worked: true, ...(pack ? { pack, packName } : {}) };
    return new WorkedLesson(lesson);
  });
}

// A lesson worked out from a pack's words after the written path (pathLessons, lazy): what it teaches as things, and how it's said, when first read.
class WorkedLesson {
  constructor(lesson) {
    Object.assign(this, lesson);
  }
  get things() {
    return (this.things_ ??= thingsOf(this));
  }
  get kind() {
    return (this.teaching_ ??= teachingOf(this)).kind;
  }
  get teaches() {
    return (this.teaching_ ??= teachingOf(this)).teaches;
  }
}

/** The form a thing was taught in, wherever it's a choice on a screen: 飲みます, not 飲む, a word you've never seen. */
export function taughtForm(thing) {
  // Its line's first sense with its working notes taken out first, as lesson.js shownThing does: a note may hold an example with its own
  // " = " ("like to (after the verb: trinke gern = like to drink)"), which isn't the word's form.
  const pair = thing.means?.replace(/\s*\([^)]*\)/g, "").split(";")[0].split(" = ") ?? [];
  if (pair.length === 2) return pair[0].trim();
  return thing.forms?.includes(thing.text) ? thing.text : (thing.forms?.[0] ?? thing.text);
}

const bareForm = (text) => text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "").toLocaleLowerCase();
/** The forms a lesson teaches its words in, bare and lowercase. */
export const lessonForms = (lesson) =>
  new Set(lesson.things.filter((thing) => thing.lemma).flatMap((thing) => [taughtForm(thing), ...(thing.forms ?? [])].map(bareForm)));

const UNIT_LESSONS = 11;

// A lesson's pack: its id is <pack id>/<lesson id>.
const packOf = (lesson) => lesson.id.slice(0, lesson.id.indexOf("/"));
/**
 * The written lessons in path order: the language's own path (the library's packs), with each pack you added that has lessons right after the
 * unit you were in when it came (the one your place is in, or the first), so its lessons come next. Where is kept (path-place.js anchorOf) and
 * never moves as you go on; a unit that's gone puts it after the path.
 */
function inOrder(lessons) {
  const own = new Set(PACKS.filter((pack) => pack.builtIn).map((pack) => pack.id));
  const out = lessons.filter((lesson) => own.has(packOf(lesson)));
  const added = lessons.filter((lesson) => !own.has(packOf(lesson)));
  if (!added.length) return lessons;
  const lang = contentLanguage();
  for (const pack of [...new Set(added.map(packOf))]) {
    let anchor = anchorOf(lang, pack);
    if (anchor === undefined) {
      const place = placeOn(lang);
      anchor = out.find((lesson) => lesson.id === place)?.unit?.id ?? out[0]?.unit?.id ?? null;
      setAnchor(lang, pack, anchor);
    }
    let at = -1;
    for (let i = out.length - 1; i >= 0 && anchor !== null; i--) if (out[i].unit?.id === anchor) {
      at = i;
      break;
    }
    out.splice(at < 0 ? out.length : at + 1, 0, ...added.filter((lesson) => packOf(lesson) === pack));
  }
  return out;
}
// A lesson of one idea alone: nothing new to learn by heart (teachingOf's "idea").
const ideaOnly = (lesson) => Boolean(lesson.concept) && !lesson.words?.length && !lesson.phrases?.length;
/**
 * A lesson that teaches an idea (alone, or with the words it needs: zou and zouden for would) put into the path after you'd gone past where
 * it goes (Dutch's new ideas, 7 Nov 2026) comes up ahead of you as a new idea, your place unchanged: the first right after the furthest you've got to (a lesson finished, marked done, or where you put yourself), each next
 * one a lesson further on (one idea at a time, between lessons of words), in their written order. Where is set once, the first time this device
 * lays out a path with the lesson (path-place.js anchorOf "lesson:<id>"), and kept as you go on; one you hadn't gone past stays where it's written
 * (null). A path laid out here for the first time has nothing new: every lesson where it's written (a lesson of one idea you've passed is open
 * behind you, as ever: plan.js nextLesson). Anchors are set together, in one save.
 */
function withNewIdeas(lessons, lang) {
  const seen = seenOn(lang);
  if (seen !== undefined) {
    const known = new Set(seen);
    const fresh = lessons.filter((lesson) => !known.has(lesson.id) && lesson.concept && anchorOf(lang, `lesson:${lesson.id}`) === undefined);
    if (fresh.length) {
      const finished = lessonsFinished();
      const marked = new Set(markedOn(lang));
      const place = placeOn(lang);
      const reached = (lesson) => finished.has(lesson.id) || marked.has(lesson.id) || lesson.id === place;
      let furthest = -1;
      for (let i = lessons.length - 1; i >= 0 && furthest < 0; i--) if (reached(lessons[i])) furthest = i;
      // The furthest lesson, then each lesson of words after it: where the 1st, 2nd, … new idea behind you goes.
      const ahead = lessons.slice(Math.max(furthest, 0)).filter((lesson, i) => i === 0 || (!ideaOnly(lesson) && !fresh.includes(lesson)));
      let k = 0;
      setAnchors(
        lang,
        fresh.map((lesson) => [`lesson:${lesson.id}`, furthest > lessons.indexOf(lesson) && !reached(lesson) ? ahead[Math.min(k++, ahead.length - 1)].id : null]),
      );
    }
  }
  addSeen(
    lang,
    lessons.map((lesson) => lesson.id),
  );
  let out = lessons;
  // Two put after the same lesson (the path running out) keep their written order.
  const lastAfter = new Map();
  for (const lesson of lessons) {
    const after = anchorOf(lang, `lesson:${lesson.id}`);
    if (!after) continue;
    const anchor = lastAfter.get(after) ?? out.find((one) => one.id === after);
    if (!anchor) continue;
    out = out.filter((one) => one !== lesson);
    const at = out.indexOf(anchor) + 1;
    // In the unit of the lesson it comes before, so it's past the unit's whole lesson when it goes after a unit's last; the anchor's at the end.
    const next = out[at];
    const moved = { ...lesson, unit: next && packOf(next) === packOf(anchor) ? next.unit : anchor.unit };
    out.splice(at, 0, moved);
    lastAfter.set(after, moved);
  }
  return out;
}

/** Lessons a topic pack opens with: its own words alone, as cards, before any of its sentences can be asked. */
const OPENING = 2;

/**
 * A pack you chose for its subject (a category pack), planned for someone who wants its words: its own words first, the commonest first, as
 * cards (OPENING lessons); then, turn about, the words its next sentences need that nothing has taught (the fewest first, taught in the
 * lesson that first asks them) and its next own words. A word taught already (claimed) is never taught again. Returns the lessons' words.
 */
function topicPlan(pack, claimed, rankOf) {
  const lists = [];
  const teach = (words) => {
    for (const word of words) claimed.add(word);
    lists.push(words);
  };
  const queue = pack.words.filter((lemma) => Number.isFinite(rankOf(lemma)) && !claimed.has(lemma)).sort((a, b) => rankOf(a) - rankOf(b));
  const nextOwn = () => {
    const words = [];
    while (queue.length && words.length < WORKED_OUT_WORDS) {
      const word = queue.shift();
      if (!claimed.has(word)) words.push(word);
    }
    return words;
  };
  const sentences = pack.sentences.filter(([target]) => target).map(([target, lemmas]) => ({ target, need: lemmas.filter((lemma) => Number.isFinite(rankOf(lemma))) }));
  const missing = (sentence) => sentence.need.filter((lemma) => !claimed.has(lemma));
  for (let i = 0; i < OPENING; i++) {
    const words = nextOwn();
    if (!words.length) break;
    teach(words);
  }
  let sentencesTurn = true;
  for (let guard = 0; guard < 5000; guard++) {
    const open = sentencesTurn || !queue.length ? sentences.filter((sentence) => claimed.has(sentence.target) && missing(sentence).length) : [];
    if (open.length) {
      open.sort((a, b) => missing(a).length - missing(b).length || rankOf(a.target) - rankOf(b.target));
      const words = [];
      for (const sentence of open) {
        const more = missing(sentence).filter((lemma) => !words.includes(lemma));
        if (words.length + more.length <= WORKED_OUT_WORDS) words.push(...more);
        if (words.length >= WORKED_OUT_WORDS) break;
      }
      if (!words.length) words.push(...missing(open[0]).slice(0, WORKED_OUT_WORDS));
      teach(words);
      sentencesTurn = false;
      continue;
    }
    const words = nextOwn();
    if (words.length) {
      teach(words);
      sentencesTurn = true;
      continue;
    }
    break;
  }
  return lists;
}

/** Every lesson of the language you're learning, in order: { id, title, unit?: { id, title }, theme?, words, phrases, concept, items, things, worked? }. */
export function pathLessons() {
  if (cached) return cached;
  const steps = pathSteps();
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * The path a piece at a time (a generator for know/slices.js inSlices: Home's after the study material changes), so no task holds the page
 * for long; what pathLessons then has at once. Nothing when it's laid out already. Laid out whole meanwhile (something asked for it), that one;
 * the study material changing meanwhile, nothing (null): it's for the new material, asked for again.
 */
export function* warmPath() {
  if (!cached) yield* pathSteps();
}
/** Whether the path is laid out (warmPath has nothing to do). */
export const pathWarm = () => Boolean(cached);
/** Which laying out of the path this is: it changes whenever the path is laid out again (the study material, the pictures, the word list). */
export const pathBuild = () => builds;

// Lessons laid out between yields: a few ms on a phone slowed 4×.
const PATH_PIECE = 60;
function* pathSteps() {
  const build = builds;
  // After each yield: one laid out whole meanwhile is the path; the material changed, and this one is for nothing.
  const stale = () => cached || build !== builds;
  const lang = contentLanguage();
  const ranked = wordsInOrder();
  const place = new Map(ranked.map((lemma, i) => [lemma, i]));
  const rankOf = (lemma) => place.get(lemma) ?? Infinity;
  const byRank = (a, b) => rankOf(a) - rankOf(b);
  // Every word some lesson on the path teaches, as the path is laid out: a word is taught once, by the first that has it.
  const claimed = new Set();
  // A word that's been taught, here with new forms (gegeten): it's met again as those forms, and isn't a new word.
  const before = new Set();
  const writtenOf = (lesson) => {
    const things = thingsOf(lesson).map((thing) => (thing.lemma && before.has(thing.lemma) ? { ...thing, formOnly: true, text: thing.forms.join(" · ") || thing.text } : thing));
    for (const thing of things) if (thing.lemma) before.add(thing.lemma);
    for (const word of lesson.words ?? []) claimed.add(word.lemma);
    return { ...lesson, things };
  };
  // What a run of worked-out lessons is called: a unit by the topic most of its words' own sentences are about ("Food & drink", then "Food &
  // drink 2"), else by its first words; a lesson by its words.
  const topicOf = new Map();
  for (const pack of WORD_PACKS) for (const [target, , topic] of pack.sentences) if (target && topic && !topicOf.has(target)) topicOf.set(target, topic);
  yield;
  if (stale()) return build === builds ? cached : null;
  const named = new Map();
  const topicTitle = (words) => {
    const counts = new Map();
    for (const word of words) if (topicOf.has(word)) counts.set(topicOf.get(word), (counts.get(topicOf.get(word)) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const name = top ? (typeof TOPICS[top] === "string" ? TOPICS[top] : (TOPICS[top]?.name ?? top)) : `${words.slice(0, 3).join(", ")}…`;
    named.set(name, (named.get(name) ?? 0) + 1);
    return named.get(name) > 1 ? `${name} ${named.get(name)}` : name;
  };
  // Lessons from lists of words, UNIT_LESSONS to a unit. lazy: nothing after them reads what they teach as they're laid out (the word series and
  // the list's own words, after the written path), so each one's things and teaching are worked out when they're first read: a year's path has
  // 2,000 of them, and a start reads a few.
  const asLessons = (lists, { unitId, unitTitle, lessonId, title, pack = null, lazy = false, chosen = false }) => {
    const out = [];
    for (let n = 0; n < lists.length; n++) {
      const u = Math.floor(n / UNIT_LESSONS);
      const unit = n % UNIT_LESSONS === 0 ? { id: unitId(u + 1), title: unitTitle(u + 1, lists.slice(u * UNIT_LESSONS, (u + 1) * UNIT_LESSONS).flat()) } : out.at(-1).unit;
      const words = lists[n];
      const lesson = { unit, id: lessonId(n + 1), title: title(words, unit.title), words: words.map((lemma) => ({ lemma, forms: [], means: WORDS[lemma] })), phrases: [], concept: null, items: [], worked: true, ...(pack ? { pack: pack.id, packName: pack.name } : {}), ...(chosen ? { chosen: true } : {}) };
      if (lazy) {
        out.push(new WorkedLesson(lesson));
        continue;
      }
      const things = thingsOf(lesson);
      for (const thing of things) if (thing.lemma) before.add(thing.lemma);
      out.push({ ...lesson, things });
    }
    return out;
  };
  const chunks = (words) => Array.from({ length: Math.ceil(words.length / WORKED_OUT_WORDS) }, (_, i) => words.slice(i * WORKED_OUT_WORDS, (i + 1) * WORKED_OUT_WORDS));
  // A pack you chose for its subject (a category pack from Explore) or your AI made for it (content.js own) comes next on the path: right after
  // the unit you were in when it came, as a pack with lessons does (inOrder), planned for its purpose (topicPlan), its units and lessons under its
  // own name. A pack followed from Explore that isn't a category pack (a word series you added, someone's shared pack) waits with the series.
  const ordered = withNewIdeas(inOrder(LESSONS), lang);
  const chosen = WORD_PACKS.filter((pack) => !pack.builtIn && (pack.copies || pack.own));
  const after = new Map();
  for (const pack of chosen) {
    let anchor = anchorOf(lang, pack.id);
    if (anchor === undefined) {
      const at = placeOn(lang);
      anchor = ordered.find((lesson) => lesson.id === at)?.unit?.id ?? ordered[0]?.unit?.id ?? null;
      setAnchor(lang, pack.id, anchor);
    }
    let index = ordered.length - 1;
    for (let i = ordered.length - 1; i >= 0 && anchor !== null; i--) {
      if (ordered[i].unit?.id === anchor) {
        index = i;
        break;
      }
    }
    after.set(index, [...(after.get(index) ?? []), pack]);
  }
  const chosenLessons = (pack) => {
    const name = (n) => (/\d$/.test(pack.name) ? `${pack.name} · ${n}` : `${pack.name} ${n}`);
    return asLessons(topicPlan(pack, claimed, rankOf), { unitId: (n) => `words/${pack.id}/unit-${n}`, unitTitle: name, lessonId: (n) => `words/${pack.id}/${n}`, title: (words) => `${pack.name}: ${words.join(", ")}`, pack, chosen: true });
  };
  const sequence = [];
  for (const pack of after.get(-1) ?? []) sequence.push(...chosenLessons(pack));
  for (let i = 0; i < ordered.length; i++) {
    if (i && i % PATH_PIECE === 0) {
      yield;
      if (stale()) return build === builds ? cached : null;
    }
    sequence.push(writtenOf(ordered[i]));
    for (const pack of after.get(i) ?? []) sequence.push(...chosenLessons(pack));
  }
  yield;
  if (stale()) return build === builds ? cached : null;
  // Then the word series everyone has, each word by how common it is, and every other pack's words that nothing teaches yet; their units by topic.
  // Kept on the device (study/plan-kept.js) when nothing they're made from has changed: a start reads them back.
  const keyNow = planKey(lang);
  const keptWorked = keptPart(lang, keyNow, "path");
  const worked = keptWorked ? workedFromKept(keptWorked) : [];
  if (!keptWorked) for (const pack of WORD_PACKS.filter((one) => !chosen.includes(one))) {
    yield;
    if (stale()) return build === builds ? cached : null;
    const own = pack.words.filter((lemma) => place.has(lemma) && !claimed.has(lemma)).sort(byRank);
    for (const lemma of own) claimed.add(lemma);
    worked.push(...asLessons(chunks(own), { unitId: (n) => `words/${pack.id}/unit-${n}`, unitTitle: (n, words) => topicTitle(words), lessonId: (n) => `words/${pack.id}/${n}`, title: (words, unitTitle) => `${unitTitle}: ${words.join(", ")}`, pack, lazy: true }));
  }
  if (!keptWorked) {
    yield;
    if (stale()) return build === builds ? cached : null;
    const wordPacks = new Set(WORD_PACKS.map((pack) => pack.id));
    const others = new Set(ITEMS.filter((item) => !wordPacks.has(item.pack)).flatMap(lemmasOf));
    const rest = ranked.filter((lemma) => others.has(lemma) && !claimed.has(lemma));
    worked.push(...asLessons(chunks(rest), { unitId: (n) => `words/${n}`, unitTitle: (n, words) => topicTitle(words), lessonId: (n) => `words/${n}`, title: (words, unitTitle) => `${unitTitle}: ${words.join(", ")}`, lazy: true }));
    keepPart(lang, keyNow, "path", worked.map((lesson) => [lesson.unit.id, lesson.unit.title, lesson.id, lesson.title, lesson.pack ?? null, lesson.packName ?? null, ...lesson.words.map((word) => word.lemma)]));
  }
  // A written unit ends with its full lesson: the whole of it, made here from its lessons. Lessons keep their numbers, without it.
  yield;
  if (stale()) return build === builds ? cached : null;
  const path = [];
  for (let i = 0; i < sequence.length; i++) {
    const lesson = sequence[i];
    path.push(lesson);
    if (lesson.worked || !lesson.unit || sequence[i + 1]?.unit?.id === lesson.unit.id) continue;
    const own = sequence.filter((one) => !one.worked && one.unit?.id === lesson.unit.id);
    const things = [...new Map(own.flatMap((one) => one.things).filter((thing) => !thing.formOnly).map((thing) => [thing.unit, thing])).values()];
    path.push({ id: `${lesson.unit.id}/full`, title: `Whole unit: ${lesson.unit.title}`, unit: lesson.unit, full: true, words: [], phrases: [], concept: null, items: [...new Set(own.flatMap((one) => one.items))], things });
  }
  // Laid out whole before it's the path: nothing asking for it meanwhile ever reads one without its teaching or its numbers.
  const out = [...path, ...worked];
  for (let i = 0; i < out.length; i++) {
    if (i && i % (PATH_PIECE * 4) === 0) {
      yield;
      if (stale()) return build === builds ? cached : null;
    }
    if (!(out[i] instanceof WorkedLesson)) Object.assign(out[i], teachingOf(out[i]));
  }
  let n = 0;
  // n counts every lesson, for your AI and anything that asks by number. What a learner reads is counted within its unit, as the path's stops are.
  const units = new Map();
  for (const lesson of out) {
    if (lesson.full) continue;
    lesson.n = ++n;
    if (!lesson.unit?.id) continue;
    const unit = units.get(lesson.unit.id) ?? { n: units.size + 1, lessons: 0 };
    units.set(lesson.unit.id, unit);
    lesson.unitN = unit.n;
    lesson.inUnit = ++unit.lessons;
  }
  cached = out;
  return cached;
}

// How many of a lesson's new words its line names; the rest are "+n".
export const WORDS_NAMED = 4;
/**
 * What a lesson teaches, said plainly: { kind, teaches: { words, idea, line } }. kind: "words", "idea" (one idea on sentences you've met,
 * nothing new to learn by heart) or "both". words: what's new, as the lesson teaches it (ligt, not liggen); idea: { pattern, name } or null;
 * line: the two in one line, for a lesson's start. A unit's whole lesson teaches nothing new: it says so.
 */
function teachingOf(lesson) {
  if (lesson.full) return { kind: "words", teaches: { words: [], idea: null, line: `All of ${lesson.unit?.title ?? "this unit"} again` } };
  const words = [...new Set(lesson.things.map((thing) => (thing.phrase ? thing.text : taughtForm(thing))).filter(Boolean))];
  const idea = lesson.concept ? { pattern: lesson.concept.pattern, name: PATTERNS[lesson.concept.pattern]?.name ?? lesson.title } : null;
  return { kind: words.length ? (idea ? "both" : "words") : idea ? "idea" : "words", teaches: { words, idea, line: teachesLine(words, idea) } };
}

/** What a lesson teaches, in a line: "New words: koffie, thee, water, melk +3 · A new idea: …". Also for a pack's lessons in Explore. */
export function teachesLine(words, idea) {
  const named = words.slice(0, WORDS_NAMED).join(", ") + (words.length > WORDS_NAMED ? ` +${words.length - WORDS_NAMED}` : "");
  return [words.length ? `New words: ${named}` : null, idea ? `A new idea: ${idea.name}` : null].filter(Boolean).join(" · ");
}

/** What a unit was taught as in the path, the first time, or null. */
export function pathThing(unit) {
  // unit → the thing, from the written path (and packs you chose, which sit in it); a word a worked-out lesson teaches by its lemma, its thing made
  // when it's first asked for, as the lesson makes it (they come after the written path, so the written path's comes first).
  if (!things) {
    things = new Map();
    workedWords = new Map();
    for (const lesson of pathLessons()) {
      if (lesson instanceof WorkedLesson) {
        for (const word of lesson.words) if (!workedWords.has(word.lemma)) workedWords.set(word.lemma, word);
      } else for (const thing of lesson.things) if (!thing.formOnly && !things.has(thing.unit)) things.set(thing.unit, thing);
    }
  }
  const found = things.get(unit);
  if (found !== undefined) return found;
  const word = unit.startsWith("w:") ? workedWords.get(unit.slice(2)) : undefined;
  const thing = word ? wordThing(word) : null;
  things.set(unit, thing);
  return thing;
}
