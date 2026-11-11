// The way in after a question: what the sentence shows, under the result. Nothing opens by itself: a press opens a sheet over the question, with the session waiting and nothing
// graded. It reads what a language's concepts have: always a name and a line (grammar.js), and the longer part (patternMore: explain, examples, contrasts, mistakes) when this device has it. A pack's own pattern, or a device that hasn't had it yet, shows the name and the line.
import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { t } from "../lx/i18n.js";
import { icon } from "../lx/icons.js";
import { conceptState, readingHides } from "./progress.js";
import { readingsInText, readingsOfRuleText, readingsOfText, ruleQuotes } from "./new-words.js";
import { split } from "./concept-shape.js";
import { ITEMS, PATTERNS, contentLanguage, describe, sentence as itemSentence, sentenceUnits, writtenName } from "./content.js";
import { moreReadings, patternMore } from "./grammar.js";
import { grammarReadings } from "../lang/grammar.js";
import { notesNow } from "./notes.js";
import { itemEvidence } from "./progress.js";
import { rulePicture } from "./concept-picture.js";
import { examplesBeside } from "./rule-examples.js";
import { separatorOf } from "./pack-format.js";
import { directionOf } from "../lang/index.js";
import * as motion from "../lx/motion.js";
import * as voice from "./voice.js";

const LEVEL_WORDS = ["Not seen yet", "Just started", "Getting there", "Strong", "Solid"];

/** A unit's short name, for a chip: the one a concept gives, else its name. */
function chipName(unit) {
  const info = describe(unit);
  const pattern = unit.startsWith("p:") ? PATTERNS[unit.slice(2)] : null;
  if (pattern?.chip) return pattern.chip;
  // Before a concept has its short name: what comes before the colon, when that's a name in itself ("Present tense: ik werk…", not "dat: verb to the end").
  const [head] = info.name.split(":");
  return unit.startsWith("p:") && head !== info.name && head.includes(" ") ? head : writtenName(unit);
}

/** The row itself. chips: [[unit, name]]. */
export const chipRow = (chips, { onOpen, right }) =>
  el(
    "div",
    { part: "concept-row", "data-outcome": right ? "right" : "wrong" },
    chips.map(([unit, name]) => el("button", { part: "concept-chip", type: "button", "data-concept": unit, onclick: () => onOpen(unit) }, el("span", {}, name), icon("chevron"))),
  );

/** The row under a result: a sentence's concepts and phrases. Nothing for an item with none, so a plain card shows nothing. */
export function conceptRow(item, { onOpen, right }) {
  const units = sentenceUnits(item).filter((unit) => unit.startsWith("p:") || unit.startsWith("c:"));
  return units.length ? chipRow(units.map((unit) => [unit, chipName(unit)]), { onOpen, right }) : null;
}

/** Whether a sentence has anything to open, so a right answer can leave its paragraph to the sheet. */
export const hasWayIn = (item) => sentenceUnits(item).some((unit) => unit.startsWith("p:") || unit.startsWith("c:"));

const hear = (text) => ui.speakButton((options) => voice.speakCard({ text, lang: contentLanguage() }, options), { label: `Play: ${text}` });
const plain = (text) => String(text ?? "").toLocaleLowerCase().replace(/[.!?,;:’'“”"\s]+/g, " ").trim();
// A word's punctuation after it (kept outside its mark).
const tail = (word) => /[.,!?;:…"”’)]*$/u.exec(word)[0];
// A word's reading as a sentence's words show it: while the word is new (readingHides), else kept hidden for a tap to bring back.
const readingOfWord = ({ reading, lemma }) => (reading ? { reading, hidden: Boolean(lemma) && readingHides(`w:${lemma}`) } : null);
// A line's words as a sentence's words are shown, each with its reading (Russian's stress mark, kana over kanji) while its word is new and a
// tap bringing a hidden one back (ui.showReading), its punctuation after it, the words it's about marked. words: [{ text, reading, lemma,
// gap }], gap what goes before it (the language's space, or none).
const withReadings = (words, marks = []) =>
  words.flatMap((word, i) => {
    const [core, end] = split(word.text);
    const reading = readingOfWord(word);
    const shown = reading ? el("span", { class: "lx-concept-reading", onclick: (event) => ui.showReading(event.currentTarget) }, ui.wordLabel({ text: core, ...reading }, contentLanguage())) : core;
    return [word.gap, marks.includes(i) ? el("span", { class: "lx-concept-mark" }, shown) : shown, end].filter(Boolean);
  });
// A rule's own example, written out of any pack, with the readings the packs give its forms (new-words.js readingsOfText). Its marks are
// places among its words split at spaces: written without spaces (Japanese), the line is one such word, so a mark lights all of it.
const exampleWords = (text, marks = []) => {
  const joined = separatorOf(contentLanguage()) === "";
  const words = readingsOfText(text, joined);
  return { words, marks: joined ? (marks.includes(0) ? words.map((_, i) => i) : []) : marks };
};
const exampleRow = ({ text, means, literal, marks, words }) =>
  el(
    "div",
    { class: "lx-concept-example" },
    hear(text),
    el(
      "div",
      {},
      el("p", { class: "lx-concept-line", lang: contentLanguage() }, ...(words ? withReadings(words, marks) : (({ words: all, marks: lit }) => withReadings(all, lit))(exampleWords(text, marks)))),
      means ? el("p", { class: "lx-concept-means" }, means) : null,
      // Word for word, when that says something the meaning doesn't: it's the order a concept is usually about.
      literal && plain(literal) !== plain(means) ? el("p", { class: "lx-concept-literal" }, literal) : null,
    ),
  );
// What a word in this sentence is doing, for the concept in hand: why it's that way, and how English does it. Only what's written for that
// word. Its chip, and the sentence's own words in its lines, shown as the sentence shows them: with their readings while they're new.
const noteLine = (text, words) => withReadings(readingsInText(text, words));
const wordNote = ({ word, why, differs, reading = null, lemma = null, words = [] }) =>
  el(
    "div",
    { class: "lx-concept-word" },
    el("span", { class: "lx-concept-mark", lang: contentLanguage() }, ...withReadings([{ text: word.slice(0, word.length - tail(word).length) || word, reading, lemma, gap: "" }])),
    el("div", {}, why ? el("p", {}, ...noteLine(why, words)) : null, differs ? el("p", { class: "lx-concept-means" }, ...noteLine(differs, words)) : null),
  );
// A rule's own words (its name, short line, why, explanation, contrasts and mistakes) with the readings its forms have, over them and never
// hidden: the grammar's and its longer file's readings (lang/grammar.js), never a pack's. A rule's words are read, not learned. With no
// readings in its files, the text as it is. Each form with a reading is drawn with the language's own text touching it as one quote (new-words.js
// ruleQuotes, ui.quotedText), so its reading hangs over the kana beside it as a sentence's does; the English stays text.
export const ruleText = (text, lang = contentLanguage()) =>
  ruleQuotes(readingsOfRuleText(text, { ...grammarReadings(lang), ...moreReadings(lang) })).map((piece) => (typeof piece === "string" ? piece : ui.quotedText(piece.quote, lang)));
// The why, in plain words; the language's own words in it, marked [[like this]], set in its face and lit.
const whyText = (text) =>
  String(text)
    .split(/\n\s*\n/)
    .map((para) => el("p", {}, ...para.split(/(\[\[[^\]]+\]\])/).flatMap((part) => (/^\[\[.+\]\]$/.test(part) ? [el("span", { class: "lx-concept-mark", lang: contentLanguage() }, ...ruleText(part.slice(2, -2)))] : ruleText(part)))));
const section = (title, ...children) => el("section", { part: "concept-section" }, el("h3", {}, title), ...children);
const said = (kind, text) => el("p", { class: "lx-concept-said", "data-said": kind, lang: contentLanguage() }, icon(kind === "wrong" ? "cross" : "check"), el("span", {}, ...ruleText(text)));
const mistakeRow = ({ wrong, right, why }) => el("div", { class: "lx-concept-mistake" }, said("wrong", wrong), said("right", right), why ? el("p", { class: "lx-concept-means" }, ...ruleText(why)) : null);
const contrastRow = ({ with: other, says }) => el("p", {}, other === "English" ? null : el("strong", {}, ...ruleText(`${PATTERNS[other]?.chip ?? PATTERNS[other]?.name ?? other}: `)), ...ruleText(says));

/**
 * The sheet's content. about: { name, en, short, about } and, when this device has them, { explain, examples, contrasts, mistakes, why,
 * picture }; sentence: the one you just answered (or yours from elsewhere), with marks, roles, lemmas, means, literal for its picture; wordNotes:
 * what's written for its marked words; more: more of your own sentences ({ text, means, marks }); level, right, wrong: how you're doing.
 * Any of these can be missing or empty, and then it's left out. Returns the node, with lxPlay(after) to draw its picture in once, starting `after` ms from now.
 */
// Practice this, in so many words: what came of a press.
export const practiceSaid = (n) => (n ? `${n} more on this, coming up` : "Nothing to practice on this yet");

// first: the idea met for the first time (a lesson's "One idea" step): its picture, its words and why, and nothing about how you're doing yet.
export function conceptBody(about, { sentence, words, readings = [], shapes, means, literal, marks = [], roles = [], lemmas = [], wordNotes = [], more: yourMore = [], answer, level = 0, right = 0, wrong = 0, practice = null, first = false, lessonLine = false } = {}) {
  const mistakes = about.mistakes ?? [];
  const examples = about.examples ?? [];
  const contrasts = about.contrasts ?? [];
  const yours = answer ? mistakes.find((one) => plain(one.wrong) === plain(answer)) : null;
  const english = contrasts.filter((one) => one.with === "English");
  const others = contrasts.filter((one) => one.with !== "English");
  const left = mistakes.filter((one) => one !== yours);
  // The picture: your sentence, or with none the rule's own first example, its words lit and the rule's shape drawn on them.
  // In the language's own writing: its words joined as it joins them, in its direction; the item's own shapes for this concept when it has them.
  const lang = contentLanguage();
  // Each word with its reading while it's new, as everywhere else: the sentence's own, or what the packs give the example's forms.
  const example = !sentence && examples[0] ? exampleWords(examples[0].text, examples[0].marks) : null;
  const shown = sentence
    ? { text: sentence, words, readings, shapes, means, literal, marks, roles, lemmas }
    : example
      ? { ...examples[0], words: example.words.map(({ text }) => text), readings: example.words.map(readingOfWord), marks: example.marks, roles: [], lemmas: [] }
      : null;
  const picture = shown ? rulePicture({ kind: about.picture, ...shown, separator: shown.words ? separatorOf(lang) : " ", dir: directionOf(lang), lang }) : null;
  // More like it: two more of your own sentences; with none, two of the rule's own examples (not the one in the picture, and never the
  // card's own sentence again: rule-examples.js). The examples neither shows wait in all of it.
  const unshown = examplesBeside(examples, sentence);
  const likeIt = yourMore.length ? yourMore.slice(0, 2) : unshown.slice(0, 2);
  const laterExamples = yourMore.length ? unshown : unshown.slice(2);
  const more = [
    about.explain ? section("All of it", el("p", {}, ...ruleText(about.explain))) : null,
    english.length ? section("How English differs", ...english.map(contrastRow)) : null,
    others.length ? section("Not the same as", ...others.map(contrastRow)) : null,
    laterExamples.length ? section(yourMore.length ? "Examples" : "More examples", ...laterExamples.map(exampleRow)) : null,
    left.length ? section("Common mistakes", ...left.map(mistakeRow)) : null,
  ].filter(Boolean);
  const rest = more.length ? el("div", { class: "lx-concept-more", hidden: true }, more) : null;
  // It opens here, not on the concept's page: leaving would end the session under it.
  const seeAll = rest
    ? ui.button("See all of it", {
        variant: "fade",
        onclick: () => {
          rest.hidden = false;
          seeAll.remove();
          requestAnimationFrame(() => rest.scrollIntoView({ block: "start" }));
        },
      })
    : null;
  const tries = right + wrong;
  const body = el(
    "div",
    { part: "concept-sheet" },
    el(
      "div",
      { class: "lx-concept-top" },
      el("h2", { class: "lx-concept-name" }, ...ruleText(about.name)),
      about.en ? el("p", { class: "lx-concept-means" }, about.en) : null,
      // The picture first (the bible's "A rule's picture"), then what says it in words: on the idea's first meeting its short line (a lesson's
      // own, naming only what's been met); in the sheet the why, which says it at length, so the short line would say it twice. A lesson's own
      // line (lessonLine) is the sheet's words too: the why may name parts and words the lesson hasn't met yet.
      picture ? el("div", { class: "lx-concept-this" }, picture.node, ...wordNotes.map(wordNote)) : null,
      (about.short || about.about) && (first || lessonLine || !about.why) ? el("p", { class: "lx-concept-short" }, ...ruleText(about.short ?? about.about)) : null,
    ),
    yours ? section("Your answer", mistakeRow(yours)) : null,
    about.why && !first && !lessonLine ? el("section", { part: "concept-section", class: "lx-concept-why" }, el("h3", {}, "Why"), ...whyText(about.why)) : null,
    likeIt.length ? section(first ? t("study.idea.moreLikeIt") : yourMore.length ? "More of your sentences" : "Examples", ...likeIt.map(exampleRow)) : null,
    first
      ? null
      : section(
          "How you're doing",
          el("div", { class: "lx-concept-level" }, ui.strengthMeter(level), el("span", {}, LEVEL_WORDS[level] ?? ""), tries ? el("span", { class: "lx-concept-means" }, `${right} of ${tries} right`) : null),
        ),
    first ? null : rest,
    first ? null : seeAll,
    practice ? practiceRow(practice) : null,
  );
  body.lxPlay = (after) => picture?.play(after);
  return body;
}

/**
 * The sheet's one action, at its foot. In a session (onPractice): a few questions on this concept go in right after the current one and the
 * sheet closes (the session says how many); with nothing to ask it stays open and says so. Outside one: a short session on just it.
 */
function practiceRow({ unit, onPractice, close }) {
  const status = el("p", { class: "lx-small lx-muted", role: "status" });
  const button = ui.button("Practice this", {
    variant: "gray",
    size: "lg",
    block: true,
    onclick: () => {
      if (!onPractice) {
        close?.();
        location.hash = `#study/session/concept/${encodeURIComponent(unit)}`;
        return;
      }
      const n = onPractice();
      if (n) close?.();
      else status.textContent = practiceSaid(0);
    },
  });
  return el("div", { part: "concept-practice" }, button, status);
}

// A sentence as an example row: its text, what it means, and the words the concept's marks light.
// One of your sentences as an example: its own words (a language without spaces split by the pack, never by us) with their readings, its
// marks by those words.
const exampleOf = (other, id) => {
  const text = itemSentence(other);
  const gap = separatorOf(contentLanguage());
  const last = other.words.length - 1;
  const words = other.words.map(([word, lemma, reading], i) => ({ text: i === last ? word + (other.punct ?? "") : word, reading: reading ?? null, lemma: lemma ?? null, gap: i ? gap : "" }));
  const marks = (notesNow(other)?.marks?.[id] ?? []).filter((at) => at < words.length);
  return { text, means: other.means, marks, words };
};

/** More of your own sentences with this concept, other than `item`: ones you've played, each with its marked words. */
function moreOfYours(unit, item, n = 2) {
  const withIt = ITEMS.filter((other) => other !== item && other.id !== item?.id && sentenceUnits(other).includes(unit));
  const played = withIt.filter((other) => itemEvidence(other.id).length);
  return played.slice(0, n).map((other) => exampleOf(other, unit.slice(2)));
}

/**
 * For a first meeting: more sentences that show it, from the same pack as the one it's met on, and only ones you've played, so the card
 * never shows a word you haven't met (the shortest first).
 */
function moreLikeIt(unit, item, n = 2) {
  const played = ITEMS.filter((other) => other.id !== item?.id && sentenceUnits(other).includes(unit) && (!item?.pack || other.pack === item.pack) && itemEvidence(other.id).length);
  return played.sort((a, b) => a.words.length - b.words.length).slice(0, n).map((other) => exampleOf(other, unit.slice(2)));
}

/**
 * What a unit shows on a sentence: the concept sheet's body (conceptBody) with the sentence's own words, marks and notes. item: the
 * sentence; answer: what you answered, when it was wrong; practice: the sheet's action; first: a lesson meeting it ("One idea"), where
 * name and line (the lesson's own words for it) stand in for the catalog's.
 */
export function conceptView(unit, { item, sentence, answer, practice = null, first = false, name, line } = {}) {
  const info = describe(unit);
  const concept = unit.startsWith("p:") ? PATTERNS[unit.slice(2)] : null;
  const state = conceptState(unit);
  const more = concept ? patternMore(contentLanguage(), unit.slice(2)) : null;
  // This sentence's words, as the pack's notes have them: nothing until they're here, or for a sentence or concept they don't mark. (A word that's only its role isn't marked.)
  const notes = item ? notesNow(item) : null;
  // The item's own words when it has them (a language without spaces is split by the pack, never by us), the sentence's end on the last.
  const own = sentence && item?.words?.length ? item.words.map(([text], i) => (i === item.words.length - 1 ? text + (item.punct ?? "") : text)) : null;
  const words = own ?? (sentence ? sentence.split(" ") : []);
  const marks = (notes?.marks?.[unit.slice(2)] ?? []).filter((at) => at < words.length);
  // The sentence's own words with their readings, for each note's chip and lines.
  const said = item?.words?.length === words.length ? item.words.map(([text, lemma, reading]) => ({ text, reading: reading ?? null, lemma: lemma ?? null })) : [];
  const wordNotes = marks
    .map((at) => ({ word: words[at], reading: said[at]?.reading ?? null, lemma: said[at]?.lemma ?? null, words: said, why: notes.words[at].why ?? notes.words[at].form, differs: notes.words[at].differs }))
    .filter((one) => one.why || one.differs);
  const roles = notes ? words.map((_, at) => notes.words[at]?.role ?? "") : [];
  const lemmas = item?.words?.length === words.length ? item.words.map(([, lemma]) => lemma ?? "") : [];
  const about = { ...concept, ...info, short: info.short ?? concept?.short, ...more, ...(name ? { name } : {}), ...(line ? { short: line } : {}) };
  return conceptBody(about, {
    marks,
    roles,
    lemmas,
    wordNotes,
    sentence,
    words: own ?? undefined,
    readings: own && item?.words?.length === own.length ? item.words.map(([, lemma, reading]) => readingOfWord({ reading, lemma })) : [],
    shapes: item?.shapes?.[unit.slice(2)],
    means: item?.means,
    literal: item?.literal,
    more: first ? moreLikeIt(unit, item) : moreOfYours(unit, item),
    answer,
    level: state.level,
    right: state.right,
    wrong: state.wrong,
    practice,
    first,
    // A lesson's own words for it (step.idea): the sheet says them, not the catalog's why.
    lessonLine: Boolean(line),
  });
}

/**
 * A unit's sheet over the question. answer: what you answered, when it was wrong. name, line: a lesson's own words for it (step.idea), the
 * parts met so far, in place of the catalog's, which may name words not met yet.
 */
export function conceptSheet(unit, { item, sentence, answer, onClose, onPractice, name, line, extra }) {
  const info = describe(unit);
  const layer = ui.sheetLayer({
    label: name ?? writtenName(unit),
    onClose: () => {
      layer.remove();
      onClose?.();
    },
  });
  const body = conceptView(unit, { item, sentence, answer, name, line, practice: { unit, onPractice, close: () => layer.lxClose() } });
  // A caller's own row at the sheet's foot, given the way to close it (Knowledge's ideas: suggesting a better explanation, explore/suggest-way.js).
  const more = extra?.({ close: () => layer.lxClose() }) ?? null;
  layer.lxBody.replaceChildren(...[body, more].filter(Boolean));
  document.body.append(layer);
  layer.lxOpen();
  // Its picture draws in as the sheet comes up, starting once it's there (decoration: nothing waits for it, a press finishes it).
  body.lxPlay(motion.duration("--dur-sheet", 500));
  return layer;
}
