// A study session: one step at a time over the whole screen, each step a game or a card built from lx/ui.js, every
// answer recorded as evidence (progress.js), and a summary of what moved at the end. Nothing waits on an animation:
// the next step is there the moment you press Continue (or Enter), and any press finishes what's still moving.
// The language you're learning is heard through voice.js: a card's speak button, every answer's sentence, Match's
// words (each can play by itself, per Settings → Study → Listening), and named on every prompt (learning.js).

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import * as motion from "../lx/motion.js";
import { prepareReactions, reactToAnswer } from "./reactions.js";
import { englishOrderTexts, orderDiffers } from "../lx/literal-case.js";
import { CHUNKS, ITEMS, READINGS, aboutOf, conceptsOf, contentLanguage, describe, itemById, nameLang, sentence, sentenceUnits, shownName } from "./content.js";
import { learningFrom, learningFromName, learningLocale, learningName } from "./learning.js";
import { LANGUAGES, withArticle } from "../lang/index.js";
import { allEvidence, conceptState, meaningOf, readingHides, record, studiedUnits, TESTS } from "./progress.js";
import { allWrong, orderOutcome, patternOutcomes, slipBetween, slipOfResult, typedRight, wordOutcomes } from "./attribute.js";
import { conceptKind } from "../lang/form-concepts.js";
import { formNow, formsReady, notesNow, notesReady } from "./notes.js";
import { MORE_LESSONS, GAMES, beforeFirstWords, planSession, setHearing, setRecorded, setWordHearing, setWordRecorded, slipInSteps, strayYouKnow, studyOverview } from "./plan.js";
import { pathThing, taughtForm } from "./path.js";
import { lessonsComing, onLessonsComing } from "./packs.js";
import { getStudySettings } from "./settings.js";
import { gamesSheet } from "./games-sheet.js";
import * as voice from "./voice.js";
import { play as playSound } from "../lx/sound.js";
import { chooseEngine, loadingText, readyWhisper, speechApi, wakeSpeech } from "./speaking.js";
import { typedResult, typedWord } from "./typed.js";
import { asWritten as subjectsAsWritten, genderVariants, sameEnglishVariants, subjectVariants } from "./subjects.js";
import { optionText, separatorOf } from "./pack-format.js";
import { fillChoices, heardChoices, readingOfForm, matchEnglish, meaningChoices, meaningOfWord, meaningsOfWord, shortMeaning, strayTile, targetOf } from "./new-words.js";
import { loadPictures, pictureNode } from "./pictures.js";
import { askMenu } from "../ai/ask.js";
import { finishedGame, finishedLesson, finishedPractice, finishedSession } from "./done.js";
import { beforeReminderStep, reminderStep } from "../shell/settings-reminders.js";
import { streakNow } from "./done.js";
import { momentOf } from "../know/celebrate.js";
import { edge } from "../lx/edge.js";
import { conceptRow, conceptSheet, conceptView, hasWayIn, practiceSaid } from "./after-answer.js";
import { cardPage, hasWordPage, learnButton, openLearn, roundPage, sentencePage, wordPage } from "./learn-more.js";
import { englishWords, rewordingOf } from "./reword.js";
import { symbol } from "../lx/symbols.js";
import { t } from "../lx/i18n.js";
import { celebration, wordsKnown } from "../know/celebration-ui.js";
import { deckStep } from "./deck-steps.js";
import { cardRows, saidNoun, setLetterHearing, setSpeechHearing } from "./deck.js";
import { keepNoteOnce, keepStorage } from "../shell/keep-here.js";
import { bareChoice, gapMarks } from "./gap-marks.js";

// The answer bar's quiet actions (Hint, I don't know, Can't speak now, Can't listen now): their words in a span of their own. They sit on
// one line wherever they fit, else wrap with their lines alike (layActions); only a Hint wider than the whole row gives way (`gives`):
// a long language name in it ends in an ellipsis ("Hint: Chinese (Trad…"), and the others stay whole (components.css).
const quiet = (text, { gives = false } = {}) => el("span", { "data-gives": gives ? "" : undefined }, text);

/** How long a picture question waits for its drawings before it's drawn with them held (a failure comes sooner: then it asks in words). */
const DRAWINGS_DECIDE = 250;


// Each step's instruction, naming the language you're learning.
// Japanese can be typed in romaji as well as kana (lang/romaji.js, through speech/match.js): its fields say so, for a learner whose phone has
// no Japanese keyboard.
const typedPlaceholder = (text) => (contentLanguage() === "ja" ? "Kana or romaji" : text);

const PROMPTS = {
  get card() {
    return `Read it in ${learningName()}`;
  },
  choose: "Which is right?",
  get arrange() {
    return `Put it in ${learningName()} order`;
  },
  get arrangeEnglish() {
    return `Put the ${learningFromName()} in ${learningName()} order`;
  },
  place: "Where does it go?",
  fill: "Fill the gap",
  meaning: "What does it mean?",
  get type() {
    return `Type it in ${learningName()}`;
  },
  typeHeard: "Type what you hear",
  get typeWord() {
    return `Type the ${learningName()} word`;
  },
  typeGap: "Type the missing word",
  hearGap: "Type the word you hear",
  match: "Match the pairs",
  listenMeaning: "What did you hear?",
  see: "Which one is it?",
  word: "Which word is it?",
  translate: "What does it say?",
  listenOrder: "Put the words in the order you heard",
  // An order step's instruction on one line, where the whole doesn't leave its tiles room (fit: data-order-fit).
  arrangeShort: "Put it in order",
  arrangeEnglishShort: "Order the English",
  listenOrderShort: "Order what you heard",
  read: "Read it aloud",
  get say() {
    return `Say it in ${learningName()}`;
  },
  repeat: "Repeat after",
  get sayWord() {
    return `Say the ${learningName()} word`;
  },
  repeatWord: "Repeat the word",
};

// A tile that belongs in no sentence, so Arrange can't be solved by elimination: a wrong form of the sentence's own
// verb where there is one (lezen for gelezen), else a little word the sentence doesn't use (the language's own,
// lang/<code>.js stray).
const strayWords = (lang) => LANGUAGES[lang]?.stray ?? [];
function strayFor(item, english) {
  if (english) {
    const used = item.literal.flatMap(([text]) => text.toLowerCase().split(/\s+/));
    return strayWords(learningFrom()).find((word) => !used.includes(word));
  }
  const used = item.words.map(([text]) => text.toLowerCase());
  return (item.gap?.options ?? []).map(optionText).find((option) => !used.includes(option.toLowerCase())) ?? strayWords(contentLanguage()).find((word) => !used.includes(word));
}

// The word Where does it go asks about: the moved word furthest along the sentence (a verb sent to the end has one
// right place, where an adverb can sometimes sit in two).
function placeFor(item) {
  const indexes = item.moved.map((word) => item.words.findIndex(([text]) => text === word)).filter((i) => i >= 0);
  return indexes.length ? Math.max(...indexes) : item.words.length - 1;
}

// How well an item is known: its weakest pattern's (or its phrase's) level (0–4).
const levelOf = (item) => Math.min(...sentenceUnits(item).map((id) => conceptState(id).level));

// What a spoken or typed answer is checked against: the sentence, or in a language written without spaces its words
// (the matcher lines its result up with them); and each word's reading.
const expectedWords = (item) => item.words.map(([text], i) => (i === item.words.length - 1 ? text + item.punct : text));
const expectedOf = (item) => (LANGUAGES[contentLanguage()]?.separator === "" ? expectedWords(item) : sentence(item));
const readingsOf = (item) => item.words.filter(([, , reading]) => reading).map(([text, , reading]) => [text, reading]);

// A word as the games show it: its text, with its reading in a language that shows them (Japanese, Chinese). The
// reading is over it while you don't know the word by reading, and kept but hidden once you do (a tap shows it again);
// a word with no lemma always shows its own.
const shownWord = ([text, lemma, reading]) => (reading ? { text, reading, hidden: Boolean(lemma) && readingHides(`w:${lemma}`) } : text);
const shownWords = (item) => item.words.map((word, i) => (i === item.words.length - 1 ? withText(shownWord(word), word[0] + item.punct) : shownWord(word)));
// A tile the sentence hasn't got, shown as its words are: with its reading while its word is new (new-words.js strayTile).
const shownStray = (tile) => (typeof tile === "string" ? shownWord(strayTile(tile)) : tile);
const withText = (word, text) => (typeof word === "string" ? text : { ...word, text });
// What you answered, as text: the words as the language joins them (none between them in Japanese), and the end mark.
const answerText = (words, punct) => sentence({ words: words.map((text) => [text]), punct });

const plainWord = (text) => text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "").toLocaleLowerCase();

// Where a fixed phrase stands in a sentence: the indexes of its words.
function phraseAt(item, phrase) {
  const parts = (CHUNKS[phrase]?.text ?? "").split(/\s+/).map(plainWord).filter(Boolean);
  const words = item.words.map(([text]) => plainWord(text));
  for (let i = 0; parts.length && i + parts.length <= words.length; i++) {
    if (parts.every((part, j) => words[i + j] === part)) return new Set(parts.map((_, j) => i + j));
  }
  return new Set();
}

// The card data lx/ui.js's studyCard expects. target: the one word it's about (its lemma): that word marked, the rest plain,
// "New word" on one you've never seen (first). Without it, each word marked new or slipping from your progress.
export function cardItem(item, { target, phrase, first = false } = {}) {
  const about = target ? item.words.findIndex(([, word]) => word === target) : -1;
  // A fixed phrase: all of its words, where the sentence has them in a row.
  const marked = phrase ? phraseAt(item, phrase) : about >= 0 ? new Set([about]) : null;
  return {
    tags: marked ? (first ? [["New word", "new"]] : []) : sentenceUnits(item).map((id) => [describe(id).name, meaningOf(id) ?? "moved", nameLang(id, contentLanguage())]),
    words: item.words.map(([text, word, reading], i) => ({
      text: i === item.words.length - 1 ? text + item.punct : text,
      word,
      ...(reading ? { reading, readingHidden: Boolean(word) && readingHides(`w:${word}`) } : {}),
      state: marked ? (marked.has(i) ? "target" : undefined) : word ? meaningOf(`w:${word}`) ?? undefined : undefined,
    })),
    literal: item.literal.map(([text, moved]) => ({ text, moved: Boolean(moved) })),
    punct: item.punct,
    english: item.english,
    natural: item.means,
  };
}

// Whether a sentence's English rewords it (study/reword.js): { line, changed, note }, or null. Its notes once they're read.
const rewordOf = (item) => (item?.literal && item.means ? rewordingOf(item, notesNow(item)) : null);

/**
 * What a wrong typed answer is told about (Type it): the sentence's first idea whose words you got wrong, by its pack's notes (marks: the words
 * each idea is about); none when what you typed shares nothing with the sentence, or none of the ideas' words went wrong (8 Nov 2026: "Fout"
 * for "Het boek is goed." was told about de and het; an article is explained only when the article was the mistake). Without notes (a word
 * pack's sentences have none), a sentence of one idea is told about it as before; of several, which one went wrong can't be told, so none is
 * named, and the chips under the sentence still open each (8 Nov 2026: "Het boek op tafel" for "Het boek ligt op tafel." was told about de and
 * het, though ligt was what was left out).
 */
function typedAbout(item, result) {
  const none = { name: null, about: null, line: null };
  const off = new Set(result.words.flatMap((word, i) => (word.result === "right" ? [] : [i])));
  if (!result.words.some((word) => word.result === "right" || word.result === "close" || word.result === "order")) return none;
  const marks = notesNow(item)?.marks;
  if (!marks) return (item.concepts?.length ?? 0) > 1 ? none : aboutOf(item);
  const id = item.concepts.find((concept) => (marks[concept] ?? []).some((at) => off.has(at)));
  if (!id) return none;
  const info = describe(`p:${id}`);
  const about = info.about ?? info.en ?? "";
  return { name: info.name, about, line: `${info.name}${/[.?!]$/.test(info.name) ? "" : "."} ${about}`.trim() };
}

// English words as text, the ones in `changed` marked (a word's own words, compared as reword.js compares them): the words that differ
// between the natural English and the word-for-word line, drawn so the pair reads, and not by color alone.
function markedEnglish(text, changed) {
  const set = new Set(changed);
  const out = [];
  for (const [i, word] of text.split(/(\s+)/).entries()) {
    if (i % 2) out.push(word);
    else if (word && englishWords(word).some((w) => set.has(w))) out.push(el("span", { class: "lx-reword-changed" }, word));
    else out.push(word);
  }
  return out;
}

/**
 * The answer's English and, when the English rewords the sentence, its word-for-word line and why: under the sentence on an answer. literal:
 * the game shows the literal line, which carries word for word itself (literalAnswer), so it isn't said twice.
 */
function answerEnglish(item, { english = true, literal = false } = {}) {
  const reworded = rewordOf(item);
  const natural = english && item.means ? el("p", { class: "lx-answer-english", lang: "en" }, reworded ? markedEnglish(item.means, reworded.changed.means) : item.means) : null;
  if (!reworded || literal) return natural ? [natural] : [];
  // In English order the capital goes with the chunk that leads, as the literal line itself has it (literal-case.js): "I read that gladly",
  // never "I read That gladly".
  const order = Array.isArray(item.english) && item.english.length === item.literal.length ? item.english : null;
  const texts = englishOrderTexts(item.literal.map(([text]) => ({ text })), order, item.means);
  const line = (order ?? texts.map((_, i) => i)).map((i) => texts[i]).join(" ");
  return [
    natural,
    el(
      "div",
      { class: "lx-answer-reword", "data-part": "reword" },
      el("p", { class: "lx-reword-line", lang: "en" }, el("span", { class: "lx-reword-label" }, t("study.reword.wordForWord")), " ", markedEnglish(line, reworded.changed.literal)),
      reworded.note ? el("p", { class: "lx-reword-note" }, reworded.note) : null,
    ),
  ].filter(Boolean);
}

// A tile's word, a plain one or one with its reading.
const wordOfTile = (tile) => (typeof tile === "string" ? tile : (tile?.text ?? ""));

// A game that needs the sound runs only on what this device can say (plan.js).
setHearing((item) => voice.hearsItem(item));
setWordHearing((text) => voice.hearsWord(text));
// A script's letter (a pack that teaches one: kana) heard in Listening only where this device can say it.
setLetterHearing((text, lang) => voice.hearsWord(text, { lang }));
setRecorded((item) => voice.recordedItem(item));
setWordRecorded((text) => Boolean(voice.wordRecording(text)));

const shuffled = (items, seed) => {
  // Stable per item, so a reload doesn't reshuffle what you were looking at.
  let h = [...seed].reduce((a, c) => (Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Runs a session in `host`. mode/arg as planSession. onExit() when it ends (closed or done); onRestart() for
 * "Study again". Returns { element, end } so the router can tear it down.
 */
// A session is a cover over the app (the director's pick, 6 Nov 2026): it slides up from the bottom and back down when it ends; the next one
// after it (Practice again, a new lesson from the summary) pushes in from the right over it, the one before going a third to the left beneath.
// One move each, the first step drawn before it starts, nothing fading out on top after.
const COVER_MS = 350;
const FIRST_STEP_WAIT = 400; // ms: the longest a session's cover waits for its first step to be drawn before it moves (a page's own wait)
const DIM = 0.2;
/**
 * A light dim on the page beneath a cover as it moves (you've entered something): a shade just under the session, from `from` to `to` opacity on
 * the cover's own curve, gone when the move ends (once the cover is up it hides the page anyway). None with animations off.
 */
function dimBeneath(root, from, to, ease) {
  if (!motion.motionOn() || !root.isConnected) return;
  const shade = el("div", { class: "lx-session-shade", "aria-hidden": "true" });
  Object.assign(shade.style, { position: "fixed", inset: "0", background: "#000", pointerEvents: "none", opacity: String(from), zIndex: String((parseInt(getComputedStyle(root).zIndex, 10) || 50) - 1) });
  root.before(shade);
  motion.slide(shade, [{ opacity: from }, { opacity: to }], { duration: COVER_MS, fill: "forwards", ease, onEnd: () => shade.remove() });
}
export function runSession(host, mode, arg, options = {}) {
  // The next lesson asked for (not one by its id) while the language's lessons are on their way (a newcomer's first minutes, packs.js
  // lessonsComing): started once they're in, or given up (LESSONS_WAIT at most), so it's the path's lesson 1, never the starter's that a Start
  // tapped a second after picking Dutch opened (7 Nov 2026). Nothing is drawn meanwhile: Home's and Study's cards and the path hold their
  // places then, so only a link asks for one. Once they're here this is the session as ever.
  // A newcomer's game (nothing studied yet) waits the same way: its first words are the path's, never a word band's that came first (8 Nov
  // 2026: Tap the picture opened a second after picking Dutch met werken, niet and gaan, with no drawings). A tile pressed meanwhile opens it then.
  const waits = (mode === "lesson" && !arg) || (mode === "game" && beforeFirstWords());
  if (waits && lessonsComing()) return afterLessons(() => startSession(host, mode, arg, options));
  return startSession(host, mode, arg, options);
}

// A session started once lessonsComing turns false (in a task of its own, after studying has taken what came); its end before then: never started.
function afterLessons(start) {
  let session = null;
  let over = false;
  const go = () =>
    setTimeout(() => {
      if (over || session || lessonsComing()) return;
      off();
      session = start();
    }, 0);
  const off = onLessonsComing(go);
  return {
    get element() {
      return session?.element ?? null;
    },
    get plan() {
      return session?.plan ?? null;
    },
    end: (how) => {
      over = true;
      off();
      session?.end(how);
    },
  };
}

function startSession(host, mode, arg, { onExit, onRestart, entrance = "up" } = {}) {
  const plan = planSession(mode, arg);
  // The session's drawings, got ready as it starts, so a picture question draws at once. Any that can't be had: that question's in words.
  const drawingsReady = new Set();
  const getDrawings = (ids) =>
    loadPictures(ids).then((ready) => {
      if (ready) ids.forEach((id) => drawingsReady.add(id));
      return ready;
    });
  getDrawings([...new Set(plan.steps.flatMap((step) => (step.kind === "see" ? step.options.map((option) => option.picture).filter(Boolean) : step.picture ? [step.picture] : [])))]);
  let questions = plan.steps.length;
  const settings = getStudySettings();
  const startedAt = Date.now();
  // What the summary celebrates against (know/celebrate.js): the streak and the words you'd recall as it starts.
  const atStart = { streak: streakNow({ now: startedAt }), words: wordsKnown() };
  const results = []; // per step: "right" | "wrong" | "upcoming"
  const touched = new Set();
  let index = 0;
  let current = null; // { answered, continue(), pick(n), reveal(), check() }
  // While the session's own entrance moves (it slides up, or in from the right): its first step and its bar come with it, nothing of them moving
  // on its own (the step's rise and the bar's fade were a second move inside the first).
  let arriving = true;
  // The cover moves only once its first step is drawn (show() below): a first session after the app starts waits for its step's pictures, and the
  // cover rose with nothing on it, its step popping in near the top (7 Nov 2026). Held off the screen till then, FIRST_STEP_WAIT at most.
  let firstDrawn = null;
  const drawnFirst = new Promise((resolve) => (firstDrawn = resolve));
  let held = false; // the cover off the screen, waiting for its first step

  // A sentence's notes say which concept each word shows: read now, so an answer can use them at once. Without them an answer counts as it always has.
  notesReady([...new Set(plan.steps.flatMap((step) => [step.item?.copyOf, step.item?.pack]).filter(Boolean))]).catch(() => {});
  // And the language's word forms, for a tapped form a sentence's notes don't explain (showMeaning).
  formsReady(contentLanguage()).catch(() => {});

  const sessionBar = ui.sessionBar({ onClose: () => end(), states: plan.steps.map(() => "upcoming"), step: "", onGames: plan.instead ? () => gamesSheet({ current: wayOfStep(plan.steps[index]), onClose: gamesChanged }) : null });
  // See the idea again: in a lesson, once its idea has been met, every step after it (the planner marks them, step.idea) has the idea's
  // card a press away, the same sheet an answer opens. Nothing is graded and the step waits under it.
  const ideaButton = el("button", { type: "button", part: "session-idea", hidden: true, onclick: () => openIdea() }, symbol("theme-idea", { size: 22 }), el("span", {}, t("study.idea.again")));
  sessionBar.insertBefore(ideaButton, sessionBar.lxCount.nextSibling);
  const activity = el("main", { part: "activity", "aria-live": "polite" });
  const bar = ui.answerBar();
  // (data-lesson: which lesson it is, for automated checks, as data-item says which sentence.)
  const root = el("div", { part: "session", role: "dialog", "aria-label": plan.title, ...(plan.lesson ? { "data-lesson": plan.lesson.id } : {}) }, sessionBar, activity, bar);
  host.append(root);
  // Tinta on every question (places: studying), beside its instruction: it says each sentence as it plays, its eyes go
  // to what you touch, it reacts to your answer, and points at a hint's clues. One for the whole session, moved into
  // each step's prompt before the last step leaves (so the step's leaving picture never carries a copy).
  const tinta = ui.character({ size: 64, hidden: true, speaks: true });
  tinta.setAttribute("data-place", "question");
  const prompt = (label, text) => {
    const node = ui.activityPrompt(label, text);
    node.append(tinta);
    customElements.whenDefined("lx-tinta").then(() => tinta.isConnected && tinta.watch(root));
    return node;
  };
  // The page under the session doesn't scroll while it's open; only the step in the middle does.
  document.documentElement.setAttribute("data-scroll-lock", "");

  const updateProgress = () => {
    const states = plan.steps.map((_, i) => results[i] ?? (i === index ? "current" : "upcoming"));
    ui.setProgress(sessionBar.lxProgress, states);
    sessionBar.lxCount.textContent = `${Math.min(index + 1, questions)}/${questions}`;
  };

  // A step fits the screen with nothing in it to scroll: on a small phone, or with a long sentence, it's drawn tighter a
  // level at a time (data-fit 1–4 on the session, and 5–7 once it's answered; components.css) until it fits. A new step starts loose; within a step
  // it only tightens, so nothing changes back and forth under you. Parts that hold places for what's coming (Arrange's
  // order, data-reserves) set them first, at each level.
  const FIT_LEVELS = 4;
  // The bar's quiet actions (Hint, Words, I don't know, Can't speak now, Can't listen now) on one line wherever they fit, else wrapped with
  // its lines alike (7 Nov): a row of two or more takes the first layout that's one line with every word showing (components.css data-lay),
  // else wraps narrowed to the least width that keeps its lines. Laid out again at every fit level.
  const LAYS = ["loose", "close", "tight", "bare"];
  const layActions = () => {
    for (const row of bar.querySelectorAll(".lx-answer-actions")) {
      const kids = [...row.children];
      if (kids.length < 2 || !kids.every((kid) => kid.getAttribute("data-variant") === "fade")) continue;
      row.style.removeProperty("width");
      const shown = () => kids.filter((kid) => kid.getClientRects().length);
      const lines = () => new Set(shown().map((kid) => Math.round(kid.getBoundingClientRect().top))).size;
      const whole = () => shown().every((kid) => {
        const words = kid.querySelector(":scope > span") ?? kid;
        return words.scrollWidth <= words.clientWidth + 1;
      });
      if (LAYS.some((lay) => (row.setAttribute("data-lay", lay), lines() === 1 && whole() && row.scrollWidth <= row.clientWidth + 1))) continue;
      // Wrapped: from the room the bar has (a width of its own, centered, so it never sizes itself to its widest action: a Hint
      // longer than the row gives way inside it), narrowed to the least width that keeps its lines.
      row.setAttribute("data-lay", "wrap");
      const box = getComputedStyle(row.parentElement);
      const room = row.parentElement.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight);
      const widthOf = (width) => row.style.setProperty("width", `${width}px`);
      widthOf(room);
      const n = lines();
      let least = Math.min(room, Math.max(...shown().map((kid) => kid.getBoundingClientRect().width)));
      let most = room;
      while (most - least > 1) {
        const width = (least + most) / 2;
        widthOf(width);
        if (lines() <= n) most = width;
        else least = width;
      }
      widthOf(Math.ceil(most));
    }
  };
  // An order step's last squeeze on (or off, as a fit starts afresh): data-order-fit, and its instruction's and Hint's words short (or whole
  // again). Only the instruction's own words change: a tag on the title stays.
  const orderFit = (on) => {
    if (on) root.setAttribute("data-order-fit", "");
    else root.removeAttribute("data-order-fit");
    const ordering = current?.ordering;
    if (!ordering) return;
    const words = [...(activity.querySelector('[data-part="activity-prompt"] > span')?.childNodes ?? [])].find((node) => node.nodeType === Node.TEXT_NODE);
    if (words) words.data = on ? ordering.short : ordering.long;
    if (ordering.hint?.words) ordering.hint.words.textContent = on ? ordering.hint.short : ordering.hint.long;
  };
  const ANSWER_CAP_LEAST = 96; // px: a result's body held to the room left shows at least its title and a line or two
  // Held to its room (fit, below), a result puts the right sentence first: its explanation goes after the sentence and the sentence's English,
  // in the column it had (the title's: --hang), still cut to its lines with More under it, so the sentence is whole over the body's fade and
  // only what explains it scrolls. 9 Nov 2026: Which is right?, asked in place of path-ja's longest Put it in order at 320 × 568, had its
  // I don't know's sentence cut at the fade ("かばんはどこです"), path-nl's under it altogether.
  const answerFirst = (on) => {
    const parts = current?.answerParts;
    if (!parts) return;
    const moving = [parts.why, parts.more].filter(Boolean);
    if (on && !parts.holder.isConnected) {
      const body = parts.after.parentElement;
      parts.holder.style.setProperty("--hang", `${Math.max(0, Math.round(parts.why.getBoundingClientRect().left - body.getBoundingClientRect().left))}px`);
      parts.holder.append(...moving);
      parts.after.after(parts.holder);
    } else if (!on && parts.holder.isConnected) {
      parts.feedback.append(...moving);
      parts.holder.remove();
    }
  };
  // A tablet or a computer (components.css's stage: 700 px wide and 640 tall at least, never a phone): the step and its bar are one block,
  // placed in the screen's middle as the step is first fitted (--stage-top, the room over it) and held there for the step, so a result
  // filling the bar never moves the step; the room under the block takes it (docs/design-system.md, "Tablets and computers").
  const stage = globalThis.matchMedia?.("(min-width: 700px) and (min-height: 640px)");
  let fitFresh = true;
  const fit = () => {
    // A summary scrolls: its words and the bar above it keep their size.
    if (activity.querySelector('[data-part="session-summary"]')) {
      root.removeAttribute("data-fit");
      root.removeAttribute("data-keys-fit");
      root.style.removeProperty("--stage-top");
      return;
    }
    const fresh = fitFresh;
    if (fresh) root.style.removeProperty("--stage-top");
    // A fresh fit starts loose, unfolded too: measured with an old fold in place (one made while the keys were up), the levels read the step
    // as shorter than it is, and the fold came straight back at a looser level than the step needed (8 Nov: an SE in Safari at 326 × 477).
    if (fresh) root.removeAttribute("data-fold");
    // (Measured with the result's body whole, in its own order: a cap is set again below, from what's left now.)
    bar.removeAttribute("data-capped");
    bar.style.removeProperty("--answer-cap");
    answerFirst(false);
    let level = fresh ? 0 : Number(root.getAttribute("data-fit") ?? 0);
    fitFresh = false;
    const apply = () => {
      if (level) root.setAttribute("data-fit", String(level));
      else root.removeAttribute("data-fit");
      layActions();
      for (const part of activity.querySelectorAll("[data-reserves]")) part.lxReserve?.();
    };
    if (fresh) orderFit(false);
    apply();
    while (activity.scrollHeight > activity.clientHeight + 1 && level < FIT_LEVELS + (current?.answered ? 3 : 0)) {
      level++;
      apply();
    }
    // An order step (Put it in order, Listening's order, What does it say?) still too tall at the last level, before it's answered: its own squeeze
    // (data-order-fit: its instruction's short words on one line, Hint as "Hint" so the quiet actions share a row, its tiles a step smaller:
    // components.css). Still too tall with nothing placed, it isn't asked this way: the sentence goes the next way (askAnotherWay), before
    // the frame that would show it, so nothing scrolls and nothing moves under a finger.
    const ordering = current?.ordering && !current.answered;
    const tall = () => activity.scrollHeight > activity.clientHeight + 1;
    if (ordering && level >= FIT_LEVELS && tall() && !root.hasAttribute("data-order-fit")) {
      orderFit(true);
      apply();
    }
    if (ordering && root.hasAttribute("data-order-fit") && tall() && !activity.querySelector('[data-part="arrange-answer"] [data-part="tile"]')) queueMicrotask(askAnotherWay);
    // The keys up on a short screen (an iPhone SE in a typing game, 7 Nov 2026): a step still too tall at its last level would scroll its
    // word's drawing under the bar, so the drawing is drawn smaller (data-keys-fit 1), then not at all (2), rather than pass under it. Only
    // while the keys are up: they going refits from loose, the drawing back as it was.
    const keys = document.documentElement.hasAttribute("data-keyboard");
    let squeeze = keys && !fresh ? Number(root.getAttribute("data-keys-fit") ?? 0) : 0;
    const press = () => {
      if (squeeze) root.setAttribute("data-keys-fit", String(squeeze));
      else root.removeAttribute("data-keys-fit");
    };
    press();
    while (keys && squeeze < 2 && activity.scrollHeight > activity.clientHeight + 1) {
      squeeze++;
      press();
    }
    // Fitted, the block (the step at its own height, the bar under it) goes to the screen's middle: half the room left over it.
    if (fresh && stage?.matches && activity.scrollHeight <= activity.clientHeight + 1) {
      const room = root.clientHeight - sessionBar.offsetHeight - activity.offsetHeight - bar.offsetHeight;
      if (room > 1) root.style.setProperty("--stage-top", `${Math.floor(room / 2)}px`);
    }
    // An answered step its result still leaves no room at the last level (a reworded sentence's wrong answer on a 320 × 568 phone):
    // first what the result says again folds away (data-fold: Fill's choices, Which is right?'s choices, What does it say?'s sentence card,
    // the typed line, the listening controls; study-screens.css); still too tall, What does it say?'s explanation goes, its lines and More
    // (data-fold="2"), where the idea's row opens it whole, and its tiles stay (9 Nov 2026: a miss at 320 × 568, the marked tiles what shows what
    // went wrong); then the result's body, the right sentence first (answerFirst), is held to the room left and scrolls, a fade at its foot,
    // its Continue under it (data-capped). Never held shorter than its sentence whole over the fade: the sentence is the answer, and only what
    // explains it may scroll. Within a step a fold only deepens, as the levels only tighten.
    const body = bar.querySelector(".lx-answer-body");
    if (!current?.answered || !barHoldsResult || !body || activity.scrollHeight <= activity.clientHeight + 1) return;
    if (root.getAttribute("data-fold") !== "2") root.setAttribute("data-fold", "");
    if (activity.scrollHeight - activity.clientHeight <= 1) return;
    root.setAttribute("data-fold", "2");
    if (activity.scrollHeight - activity.clientHeight <= 1) return;
    answerFirst(true);
    // (Measured capped with no height yet: its room under its last line, as deep as the fade, counted in.)
    bar.setAttribute("data-capped", "");
    const over = activity.scrollHeight - activity.clientHeight;
    const box = body.getBoundingClientRect();
    const fade = parseFloat(getComputedStyle(body).paddingBottom) || 0;
    const kept = (current.answerParts?.keep ?? []).filter((part) => part.isConnected && part.getClientRects().length);
    const whole = kept.length ? Math.ceil(Math.max(...kept.map((part) => part.getBoundingClientRect().bottom)) - box.top + fade) : 0;
    const cap = Math.max(ANSWER_CAP_LEAST, whole, Math.floor(box.height - over));
    bar.style.setProperty("--answer-cap", `${cap}px`);
  };
  // The game held near its place at the press (holdNear, and liesOver while the bar lies over the step) gives way before any refit with a
  // result up, and is held again after: fitted with the hold in place, fit() reads it as the step's own height. 8 Nov 2026: at 320 × 568 a
  // result's More (a line more of bar) refitted Type it with 108 px of hold over its field, took the step to its tightest level and folded the
  // marked line away, the room it needed standing empty over the field.
  const unhold = () => {
    const reach = activity.querySelector(".lx-step > .lx-reach");
    reach?.style.removeProperty("justify-content");
    reach?.style.removeProperty("padding-top");
  };
  const refit = () => {
    fitFresh = true;
    fit();
  };
  // The screen changing (turned, the keys coming or going): the step fits what there is now, moving as one to get there.
  const onScreen = () => {
    bar.style.marginTop = "";
    unhold();
    refit();
    if (barHoldsResult) holdNear();
    if (stepBefore?.step === current) motion.glideFrom(stepBefore.parts, { size: true, looks: stepBefore.looks, easing: motion.easingOf("--ease-out"), ...barPace() });
    stepBefore = null;
    motion.syncGhosts();
  };
  addEventListener("resize", onScreen);
  globalThis.visualViewport?.addEventListener("resize", onScreen);
  const keysChange = new MutationObserver(onScreen);
  keysChange.observe(document.documentElement, { attributes: true, attributeFilter: ["data-keyboard"] });
  // (Where things are, just before focus leaving takes the keys away; a press has already said so.) Only while the keys are up: focus
  // leaving a tile (Arrange's last one tapped, blurred as the answer's taken) takes nothing away, and measuring then, after Check had
  // already folded the bank, lost the press's own measure: the answer jumped onto the fading bank with nothing to glide it (7 Nov).
  const beforeKeysGo = () => {
    if (document.documentElement.hasAttribute("data-keyboard")) rememberStep();
  };
  root.addEventListener("focusout", beforeKeysGo, true);
  // A face that arrives after the step is drawn changes how long its words are: on a slow start the instruction's
  // (Onest) can land after fit() measured it in the face before it (Instrument Sans), a line shorter, leaving the
  // step scrolling. The step fits again as each face arrives, only tighter, as within a step it always does (with a result up, as the
  // bar growing does: roomForBar).
  const facesIn = () => (barHoldsResult ? roomForBar() : fit());
  document.fonts?.addEventListener("loadingdone", facesIn);

  // The bar under a step, the one thing that slides: a result (it has a meaning) comes up from the screen's edge over what's
  // there, and goes back down when you move on. Anything else that changes its height glides to it. Its contents are in their
  // place and pressable from the first frame; the move is drawn by ghosts (motion.js). The step stays where it is while it can:
  // the bar lies over the step's empty space (a negative margin keeps the step's box), and only when it would cover
  // something does the step make room, moving on the bar's curve.
  // Tinta beside the instruction is one of them: where a tighter fit takes the instruction out, he leaves with it, in its own rise and fade
  // (motion.js glideFrom, his look kept at the press as a still: a copy of him is inert, never a second live Tinta).
  const stepParts = () => activity.querySelectorAll('.lx-step > :not(.lx-reach, [data-part="activity-prompt"]), [data-part="activity-prompt"] > *, .lx-reach > :not(.lx-game), .lx-game > *');
  let stepBefore = null; // where the step's parts were when the press now being handled began, and on which step
  // (The instruction's and the sentence's look too: at a tighter fit their words wrap differently, and they crossfade on their way. And
  // Tinta's beside them: his as he was, for his way out.)
  const WRAPS = '[data-part="activity-prompt"] > p, [data-part="activity-prompt"] > span, [data-part="activity-prompt"] > [data-part="character"]';
  const rememberStep = () => {
    stepBefore = { step: current, parts: motion.measure(stepParts()), looks: motion.keepLooks(activity.querySelectorAll(WRAPS)) };
  };
  root.addEventListener("pointerdown", rememberStep, true);
  document.addEventListener("keydown", rememberStep, true);
  // Where and when the last press in the session went down (finish: the reminder step's double-tap guard).
  let lastPress = null;
  const notePress = (event) => (lastPress = { x: event.clientX, y: event.clientY, at: performance.now() });
  root.addEventListener("pointerdown", notePress, true);
  const barPace = () => ({ duration: motion.duration("--dur-320", 320) });
  let barHoldsResult = false;
  let barMove = null; // what the bar was before this press: settled once the press's handlers have all run
  // Whether the bar can lie over the step: its box as it was, and everything in it clear of the bar. What's in the game stays where
  // it was too, though it may have got shorter (Arrange's tray folding away): it isn't centered again for an answer. A result tall enough
  // to reach into it (a reworded sentence's word-for-word line, how English differs) moves it up only as far as that needs.
  const lowestNow = () => Math.max(0, ...[...stepParts()].filter((part) => part.getClientRects().length).map((part) => part.getBoundingClientRect().bottom));
  const liesOver = (stepBottom) => {
    const barTop = bar.getBoundingClientRect().top;
    if (stepBottom <= barTop) return false;
    bar.style.marginTop = `${barTop - stepBottom}px`;
    const reach = activity.querySelector(".lx-step > .lx-reach");
    const held = reach?.querySelector(".lx-game > *") ?? reach?.firstElementChild;
    const was = held && stepBefore?.step === current ? stepBefore.parts.get(held) : null;
    if (was && Math.abs(was.top - held.getBoundingClientRect().top) >= 1) {
      reach.style.justifyContent = "flex-start";
      reach.style.paddingTop = "0";
      reach.style.paddingTop = `${Math.max(0, was.top - held.getBoundingClientRect().top)}px`;
    }
    const top = bar.getBoundingClientRect().top;
    let lowest = lowestNow();
    // Into the step: the game up by just what clears the bar, 8 px over it, never past where its space begins (centered again below
    // when even that isn't room enough). The move itself is settleBar's, on the bar's curve. Never on the stage (a tablet, a computer):
    // there the game stays right under its question and the whole block moves up instead (fitStage); taking the game's own room moved
    // Fill's 9 px toward its question on an iPad, under a result taller than the room under the block.
    if (lowest + 8 > top && reach && held && !stage?.matches) {
      const at = held.getBoundingClientRect().top;
      reach.style.justifyContent = "flex-start";
      reach.style.paddingTop = "0";
      const highest = held.getBoundingClientRect().top;
      reach.style.paddingTop = `${Math.max(0, at - Math.ceil(lowest + 8 - top) - highest)}px`;
      lowest = lowestNow();
    }
    if (lowest + 8 <= top && activity.scrollHeight <= activity.clientHeight + 1) return true;
    bar.style.marginTop = "";
    if (reach) {
      reach.style.removeProperty("justify-content");
      reach.style.removeProperty("padding-top");
    }
    return false;
  };
  // A result that took the step's room (it couldn't lie over it, so fit() made room): the game as near the place it had at the press as
  // the bar leaves room for (8 px over it), not centered in what's left, so the step moves only as far as the result needs.
  let holdTop = null;
  const holdNear = () => {
    // (On the stage the game is never held lower than its own place: fitStage moves the whole block instead.)
    if (stage?.matches) return;
    const reach = activity.querySelector(".lx-step > .lx-reach");
    const held = reach?.querySelector(".lx-game > *") ?? reach?.firstElementChild;
    if (!reach || !held) return;
    const was = stepBefore?.step === current ? stepBefore.parts.get(held) : null;
    if (was) holdTop = was.top;
    if (holdTop === null) return;
    const at = held.getBoundingClientRect().top;
    if (holdTop <= at + 0.5) return;
    // (To the step's own foot, inside its padding: past it the step would scroll, and it's centered again.)
    const foot = activity.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(activity).paddingBottom) || 0);
    const room = Math.floor(Math.min(bar.getBoundingClientRect().top - 8, foot) - lowestNow());
    if (room < 1) return;
    reach.style.justifyContent = "flex-start";
    reach.style.paddingTop = "0";
    const highest = held.getBoundingClientRect().top;
    reach.style.paddingTop = `${Math.max(0, at - highest + Math.min(holdTop - at, room))}px`;
    if (activity.scrollHeight > activity.clientHeight + 1) {
      reach.style.removeProperty("justify-content");
      reach.style.removeProperty("padding-top");
    }
  };
  // The bar grown after it was set (More under a clamped explanation, the way into the idea wrapping its chips, larger text): its room is
  // judged again on the bar as it's drawn now. A result judged on the bar before them once left the step's foot under it.
  let barLiesFrom = null; // the step's foot the bar lies over (liesOver held), while it does
  // On the stage (a tablet, a computer), the block keeps its place for the step; a result taller than the room under it moves the whole
  // block up by just what it needs, the step and the game as one, before any fit draws the step tighter (8 Nov: Which is right? at
  // 1180 × 820, its result taking the room over the block whole moved the question up 121 px).
  const fitStage = () => {
    if (!stage?.matches) return;
    const top = parseFloat(root.style.getPropertyValue("--stage-top")) || 0;
    const over = sessionBar.offsetHeight + activity.scrollHeight + bar.offsetHeight - root.clientHeight;
    if (top && over > 0) root.style.setProperty("--stage-top", `${Math.max(0, Math.floor(top - over))}px`);
  };
  const roomForBar = () => {
    if (barLiesFrom !== null) {
      bar.style.marginTop = "";
      if (liesOver(barLiesFrom)) return;
      barLiesFrom = null;
    }
    unhold();
    fitStage();
    fit();
    if (barHoldsResult) holdNear();
  };
  const setBar = (meaning, ...children) => {
    const inner = bar.firstElementChild;
    const had = inner.children.length > 0;
    const result = Boolean(meaning);
    const stepBottom = activity.getBoundingClientRect().bottom;
    barMove ??= { rect: bar.getBoundingClientRect(), had, wasResult: barHoldsResult };
    // A result goes back down as it came; anything else fades where it is, under the result coming up over it.
    if (had && barHoldsResult) motion.leave(bar, { dx: 0, dy: bar.getBoundingClientRect().height, fade: false, ...barPace() });
    else if (had && result) motion.leave(bar, { dx: 0, dy: 0, ...barPace() });
    if (meaning) bar.setAttribute("data-meaning", meaning);
    else bar.removeAttribute("data-meaning");
    // A result's body apart from its actions, so a step with no room left can hold the body alone and keep Continue in reach (fit).
    const parts = children.filter(Boolean);
    const actions = result ? parts.filter((part) => part.classList?.contains("lx-answer-actions")) : [];
    if (actions.length) inner.replaceChildren(el("div", { class: "lx-answer-body" }, ...parts.filter((part) => !actions.includes(part))), ...actions);
    else inner.replaceChildren(...parts);
    barHoldsResult = result;
    bar.style.marginTop = "";
    barLiesFrom = null;
    if (!result) {
      holdTop = null;
      fit();
    } else if (liesOver(stepBottom)) barLiesFrom = stepBottom;
    else {
      fitStage();
      fit();
      holdNear();
    }
    if (barMove.settling) return;
    barMove.settling = true;
    // Once the press's handlers are done (More, the literal line, the game going inert), so what's drawn is what's there.
    queueMicrotask(settleBar);
  };
  // A change within a step (the hint coming up): everything it moves, the bar's edge and what's in the bar too, moves together.
  const stepChange = (change) => {
    const parts = motion.measure(stepParts());
    const actions = motion.measure(bar.firstElementChild.querySelectorAll(".lx-answer-actions > *"));
    const was = bar.getBoundingClientRect();
    change();
    fit();
    const pace = { easing: motion.easingOf("--ease-out"), ...barPace() };
    motion.glideFrom(parts, { size: true, ...pace });
    if (Math.abs(bar.getBoundingClientRect().top - was.top) >= 1) motion.fly(bar, was, { clip: true, ...pace });
    else motion.glideFrom(actions, pace);
  };
  function settleBar() {
    const { rect, had, wasResult } = barMove;
    barMove = null;
    const before = stepBefore;
    stepBefore = null;
    if (!root.isConnected) return;
    const now = bar.getBoundingClientRect();
    let flight = null;
    if (barHoldsResult) flight = motion.fly(bar, new DOMRect(now.left, now.bottom, now.width, now.height), { easing: motion.easingOf("--ease-out"), ...barPace() });
    else if (had && !wasResult && Math.abs(now.top - rect.top) >= 1) flight = motion.fly(bar, rect, { clip: true, easing: motion.easingOf("--ease-out"), ...barPace() });
    if (!flight && !arriving) for (const child of bar.firstElementChild.children) motion.appear(child);
    // The result's icon is drawn on the panel coming up.
    const shown = flight?.lxGhost?.querySelector('[data-part="feedback"]') ?? bar.querySelector('[data-part="feedback"]');
    if (shown) motion.draw(shown.querySelector(".lx-icon"), { duration: motion.duration("--dur-320", 320) * 0.9 });
    // Whatever the press moved in the step, it moves on the bar's curve.
    if (before?.step === current) {
      motion.glideFrom(before.parts, { size: true, looks: before.looks, easing: motion.easingOf("--ease-out"), ...barPace() });
      // The step's box has already got shorter: what's still on its way there isn't cut off at its foot.
      if (!activity.scrollTop && motion.motionOn()) {
        activity.style.overflow = "visible";
        setTimeout(() => activity.style.removeProperty("overflow"), barPace().duration);
      }
    }
    motion.syncGhosts();
  }

  const show = (...children) => {
    // The old step slides away as a ghost; the new one is there, pressable, at once.
    const old = activity.firstElementChild;
    if (old) {
      motion.leave(old, { duration: motion.duration("--dur-150", 150) });
      old.remove();
    }
    // A question's tag (New word, Once more) takes no room of its own: it sits on the top edge of the question's card, so the question and its
    // answers stand exactly where they do without it; with no card, beside the title.
    const tag = children.find((child) => child?.getAttribute?.("data-part") === "step-tags") ?? null;
    const content = el("div", { class: "lx-stack lx-step" }, ...children.filter((child) => child !== tag));
    activity.append(content);
    // What's being asked about, on a flash card, so a line with no voice still reads as the sentence in question.
    const CARDS = '[data-part="activity-prompt"] > p, [data-part="see-word"], [data-part="translate-line"], .lx-stimulus > [data-part="spoken-line"]';
    for (const line of content.querySelectorAll(CARDS)) {
      edge(line, "cut", { drop: 3, fit: (node) => ({ rtl: getComputedStyle(node).direction === "rtl" }) });
    }
    if (tag) {
      // (A study card takes its tag on its edge too, though it isn't drawn with a cut edge as the cards above are.)
      const card = content.querySelector(CARDS) ?? content.querySelector('[data-part="study-card"]');
      const title = content.querySelector('[data-part="activity-prompt"] > span');
      tag.dataset.on = card ? "card" : "title";
      (card ?? title ?? content).append(tag);
    }
    activity.scrollTop = 0;
    firstDrawn?.();
    firstDrawn = null;
    // Just after the old one has mostly gone, so the two don't read as one on top of the other.
    if (!arriving) motion.appear(content, old ? { delay: motion.duration("--dur-150", 150) * 0.4, duration: motion.duration("--dur-200", 200) } : {});
    // A new step starts loose: its bar (set next) fits it.
    fitFresh = true;
    fit();
    fitFresh = true;
    return content;
  };

  // item: the sentence the answer was about, shown (and heard) under the feedback; literal: its Dutch-order line too.
  // answer: what you answered, as text (a question to your AI carries it); skipped: you said you didn't know.
  function finishStep(outcome, { feedbackMeaning, title, text, item, literal = false, answer, skipped = false, also = [], sound = true, learn = null } = {}) {
    current.answered = true;
    // Right or wrong, at once: none for I don't know (as Tinta does nothing then), nor where the game has just sounded (Match's last pair).
    // What's said after the answer waits for it to pass (afterAnswerSound).
    current.answerClear = sound && !skipped ? playSound(outcome === "wrong" ? "wrong" : "right").clear : null;
    results[index] = outcome === "wrong" ? "wrong" : "right";
    // A lesson or a practice: what you missed comes back before the end, once more than it was missed, up to twice.
    const asked = plan.steps[index];
    if (outcome === "wrong" && plan.retries && (asked.tries ?? 0) < 2) plan.steps.push(stillPlayable({ ...asked, tries: (asked.tries ?? 0) + 1, again: true, isNew: false, news: undefined }));
    updateProgress();
    // Answered: nothing more to type, and the keys go, so the result has the screen and Continue is where it always is. The app
    // has the screen back now, in this frame, for the result to be laid out on; the keys slide away over it.
    if (activity.contains(document.activeElement)) document.activeElement.blur();
    document.documentElement.removeAttribute("data-keyboard");
    // Tinta answers your answer: a hop when it's right, curious (never sad) when it isn't; nothing when you skipped.
    if (!skipped) ui.playCharacter(tinta, outcome === "wrong" ? "wrong" : "right");
    const fb = ui.feedback(feedbackMeaning, title, text);
    const ask = item ? askAboutAnswer(item, { right: outcome !== "wrong", answer, skipped }) : null;
    // Something to learn on every result, right or wrong: the "?" at the end of its line opens the drawer (learn-more.js), the session waiting.
    const learnMore = learnOf(asked, { item, answer: outcome === "wrong" ? answer : undefined, learn });
    const extras = [...also];
    let spoken = null;
    if (item) {
      spoken = ui.spokenLine(shownWords(item), voice.hearsItem(item) ? (options) => voice.speakItem(item, options) : null);
      extras.push(spoken);
      // The word-for-word line in the language's order, where the game's switch has it: after a miss always; after a right answer (Settings →
      // Games → Word for word on right answers, its caller's literal) only where it says something the English doesn't: its words change
      // places (lxCanFlip), or the English rewords the sentence. A line the same as the English adds nothing (9 Nov 2026).
      const line = literal ? ui.literalLine(cardItem(item)) : null;
      const reworded = line ? rewordOf(item) : null;
      const showLiteral = Boolean(line) && (feedbackMeaning === "wrong" || line.lxCanFlip || Boolean(reworded));
      // What it says in English, unless the feedback just said it; and when the English rewords it, word for word and why: what the
      // sentence shows comes before any idea's row. (With the word-for-word line here, that line is the word for word: none twice.)
      const english = answerEnglish(item, { english: text !== item.means && !current.englishShown, literal: showLiteral });
      extras.push(...english);
      current.englishParts = english.length;
      if (showLiteral) {
        // A sentence its English rewords: this line is its word for word, said once, here: the label at its head, the words that differ
        // marked, and why under it; it comes before any idea's row, as word for word does.
        if (reworded) {
          const changed = new Set(reworded.changed.literal);
          for (const chunk of line.querySelectorAll('[data-part="literal-chunk"]')) if (englishWords(chunk.textContent).some((w) => changed.has(w))) chunk.classList.add("lx-reword-changed");
          line.prepend(el("span", { class: "lx-reword-label" }, t("study.reword.wordForWord")), " ");
        }
        // The line, then why it isn't word for word in English, then the switch between the two orders.
        const block = el("div", { class: "lx-answer-literal", "data-part": reworded ? "reword" : undefined }, line, reworded?.note ? el("p", { class: "lx-reword-note" }, reworded.note) : null, line.lxCanFlip ? ui.orderSwitch(line) : null);
        if (reworded) {
          extras.push(block);
          current.englishParts += 1;
        } else extras.push(block);
        // The literal line slides from English order into Dutch order under the answer, once the bar has come up: in English
        // order from the start, so the panel coming up shows what's there when it lands.
        line.lxSetOrder("english", { animate: false });
        requestAnimationFrame(() => line.lxMorph());
      }
    }
    const next = ui.button(index + 1 < plan.steps.length ? "Continue" : "See how it went", { variant: "white", size: "lg", block: true, onclick: () => advance() });
    // The way in to what the sentence shows: quiet, and nothing opens by itself. The session waits under the sheet, and nothing is graded. A lesson stays quiet on a right answer.
    const openConcept = (unit) => showConcept(unit, item, outcome === "wrong" ? answer : undefined);
    const wayIn = item && !(plan.lesson && outcome !== "wrong") ? conceptRow(item, { onOpen: openConcept, right: outcome !== "wrong" }) : null;
    if (wayIn && spoken) extras.splice(extras.indexOf(spoken) + 1 + (current.englishParts ?? 0), 0, wayIn);
    // What a result held to its room puts first (fit, answerFirst): the sentence, then its English, then the explanation; the sentence kept whole
    // over the fade, and its English with it where the English is the answer (What does it say?, What did you hear?'s meaning).
    const why = fb.querySelector('[data-part="feedback-text"]');
    const englishLine = extras.find((part) => part?.classList?.contains("lx-answer-english")) ?? null;
    const parts = spoken && why ? { feedback: fb, why, more: null, holder: el("div", { class: "lx-answer-why" }), after: englishLine ?? spoken, keep: current.answersInEnglish && englishLine ? [spoken, englishLine] : [spoken] } : null;
    current.answerParts = parts;
    setBar(feedbackMeaning, ask || learnMore ? el("div", { class: "lx-answer-head" }, fb, learnMore, ask?.button) : fb, ask?.status, ...extras, el("div", { class: "lx-answer-actions" }, next));
    // It hangs off the sentence: its first word's edge.
    const firstWord = spoken?.querySelector('[data-part="spoken-word"]');
    if (wayIn && firstWord) wayIn.style.setProperty("--hang", `${Math.max(0, firstWord.getBoundingClientRect().left - spoken.getBoundingClientRect().left)}px`);
    // (Hanging it can wrap its chips, and the bar is then taller than the step was fitted to.)
    if (wayIn && firstWord) roomForBar();
    // Fitted tight, the explanation shows three lines (components.css): More opens the rest, when there is more. With large text (the
    // explanation over its default 14 px: the l and xl text sizes, or text made larger on the device) it's never cut: whole, with no More,
    // the bar growing (past a height it scrolls inside, components.css). Text made larger after it's drawn is caught as it grows.
    if (why) {
      let more = null;
      const large = () => parseFloat(getComputedStyle(why).fontSize) > 14.5;
      const whole = () => {
        why.setAttribute("data-state", "open");
        more?.remove();
        more = null;
        if (parts) parts.more = null;
      };
      if (large()) {
        whole();
        roomForBar();
      } else if (why.scrollHeight > why.clientHeight + 1) {
        more = ui.button("More", { variant: "fade", size: "sm", onclick: whole });
        why.after(more);
        if (parts) parts.more = more;
        // More is a line of the bar: the step makes room for it again.
        roomForBar();
      }
      const grown = new ResizeObserver(() => {
        if (!why.isConnected) return grown.disconnect();
        if (why.getAttribute("data-state") !== "open" && large()) {
          whole();
          roomForBar();
        }
      });
      grown.observe(why);
    }
    if (spoken && settings.listening.answers) afterAnswerSound(() => spoken.lxPlay());
    current.continue = advance;
    // Finished games stay as they are, but can't be answered again.
    activity.querySelector(".lx-game")?.setAttribute("inert", "");
  }

  // The "…" on a result: ask your AI about the sentence, with the game and what you answered.
  function askAboutAnswer(item, { right, answer, skipped }) {
    const game = GAMES[plan.steps[index].kind]?.name;
    const shown = sentence(item);
    const unit = sentenceUnits(item)[0];
    return askMenu({
      about: {
        language: contentLanguage(),
        where: "study",
        sentence: { id: item.id, text: shown, literal: item.literal.map(([text]) => text).join(" "), natural: item.means },
        ...(game ? { game } : {}),
        right,
        ...(answer ? { answer } : {}),
        ...(unit ? { unit } : {}),
      },
      thing: "this sentence",
      subject: "this sentence and why it goes this way",
      explain: right || skipped ? "Explain this sentence: why its words go in this order, and the grammar in it." : "Explain this sentence, and why my answer was wrong: why its words go in this order, and the grammar in it.",
      card: { text: shown, lang: contentLanguage(), meta: [game, skipped ? "you didn't know it" : right ? "your answer was right" : "your answer was wrong"].filter(Boolean).join(" · ") },
      label: "More about this sentence",
    });
  }

  // One row per unit the step tested or met (progress.js has the format). activity picks how strong a test it is and
  // what it trains (TESTS); patterns: the outcome for the whole sentence's units, its patterns or the phrase it is
  // (right · wrong · met); words: an outcome per word lemma, the sentence's other words met; help: "answer" when the
  // hint was used (it shows the Dutch order, the patterns' answer). noWords: the step never showed a Dutch word
  // (English tiles).
  function recordItem(step, { activity: kind, patterns, words = {}, help = "none", noWords = false, said, slip = null }) {
    const item = step.item;
    const { test, skill } = TESTS[kind];
    const rows = [];
    // Each pattern by what this mistake says about it: word order says nothing about a form (attribute.js).
    const lang = contentLanguage();
    const byPattern = patternOutcomes(item.concepts, patterns, slip, { kindOf: (id) => conceptKind(lang, id), marks: notesNow(item)?.marks ?? null });
    const outcomeOf = (unit) => (unit.startsWith("p:") ? byPattern[unit.slice(2)] ?? patterns : patterns);
    // Words from a lesson you skipped, in a sentence of this one: you've met them, nothing more.
    const metOnly = new Set(step.borrowed ?? []);
    for (const id of sentenceUnits(item).filter((unit) => !metOnly.has(unit))) rows.push({ concept: id, outcome: outcomeOf(id), test, skill, help: outcomeOf(id) === "right" ? help : "none", activity: kind, item: item.id });
    for (const concept of conceptsOf(item)) {
      if (!concept.startsWith("w:") || noWords) continue;
      rows.push({ concept, outcome: metOnly.has(concept) ? "met" : (words[concept.slice(2)] ?? "met"), test, skill, activity: kind, item: item.id });
    }
    // What you put, on the first row a wrong answer wrote: your AI can talk about it, if one's connected (ai/study-record.js).
    const wrongRow = rows.find((row) => row.outcome === "wrong");
    // Wrong, and blaming no unit (a slip in a sentence whose patterns are all about form): still a wrong answer to your AI, which reads this; the scheduler doesn't.
    const missedRow = wrongRow ?? (patterns === "wrong" ? rows[0] : null);
    if (missedRow && !wrongRow) missedRow.slip = true;
    if (said && missedRow) missedRow.said = said.slice(0, 300);
    // What moved: on a step about one word, that word; a word that was only in its sentence didn't move.
    for (const row of rows) if (!step.target || row.outcome !== "met" || row.concept === `w:${step.target}`) touched.add(row.concept);
    record(rows);
  }

  // ---------- a word's meaning, a tap away ----------

  // A press on a word shows what it means, by the word: never a miss, never a grade, on every step. (A word that is
  // itself the answer, a tile or a choice, keeps its press: the Words action below lists those.)
  const closeMeaning = () => ui.closeWordPopover();
  // Says something once the answer's sound (finishStep: right or wrong, lx/sound.js) has passed, while the step is still the one on the
  // screen and you can listen. Its clear is read a turn later, so a tap's word asked for just before its answer finishes still waits for it.
  function afterAnswerSound(say) {
    const step = current;
    Promise.resolve()
      .then(() => step.answerClear)
      .then(() => {
        if (current === step && !soundOff) say();
      });
  }
  // A word you tap in a game is said as you tap it (Settings → Voices → Words you tap): a tile going into your order, Match's, a word tapped
  // for its meaning, a choice in the language. A tap that answers says its choice only when Answers won't say the sentence anyway, and after
  // the answer's sound. item: the sentence a choice may be, whose own recording then plays; say: how to say it instead (a deck card's own sound).
  function sayTapped(text, { answers = false, item = null, say = null } = {}) {
    if (soundOff || !settings.listening.tapWords || !text) return;
    const speak = say ?? (() => (item && text === sentence(item) && voice.hearsItem(item) ? voice.speakItem(item) : voice.speakTapped(text)));
    if (!answers) return speak();
    if (settings.listening.answers) return null;
    afterAnswerSound(speak);
    return null;
  }
  // A tile going into your order or back to the bank (every word-order game): its sound, and, when the tiles are in the language, its word
  // said (Words you tap); a tile placed under its word starts at the ducked level. Returns ui.arrange's hooks.
  const tileSounds = (sayWords) => ({
    onPlace: (word) => playSound("tile-in", { duck: Boolean(sayWords && sayTapped(word)) }),
    onReturn: () => playSound("tile-out"),
  });
  function showMeaning(node) {
    const info = meaningOfWord(node.dataset.word ?? node.textContent, plan.steps[index]?.item, node.dataset.at === undefined ? null : Number(node.dataset.at));
    if (!info) return;
    // In a lesson, the sense it teaches.
    if (plan.lesson && !info.lemma) info.gloss = shortMeaning(info.said.toLocaleLowerCase()) || info.gloss;
    else if (plan.lesson) info.gloss = shortMeaning(info.lemma) || info.gloss;
    // A form (heeft, liep, kinderen) says which form it is under its meaning: the sentence's own note on that word, else the language's line for it.
    const item = plan.steps[index]?.item;
    const at = node.dataset.at === undefined ? -1 : Number(node.dataset.at);
    const form = info.lemma ? (notesNow(item)?.words?.[at]?.form ?? formNow(contentLanguage(), info.lemma, info.said)) : null;
    const meaning = ui.wordMeaning(info, { lang: contentLanguage() });
    ui.wordPopover(root, node, form ? [meaning, el("p", { class: "lx-word-form" }, form)] : meaning);
    sayTapped(info.said);
  }
  // The words of a sentence's lines that aren't controls (a press on a card's word comes through onWord).
  root.addEventListener("click", (event) => {
    const node = event.target.closest?.('[data-part="spoken-word"], [data-part="fill-sentence"] [data-word]');
    if (node && root.contains(node)) showMeaning(node);
  });

  // The Words action, where the words on the screen are themselves what you answer with: every word shown, with its
  // meaning, in alphabetical order so it never gives away an order. Free, like a tap.
  function wordsAction(item, shown) {
    const rows = [...new Set(shown)]
      .flatMap((text) => meaningsOfWord(text, item))
      .sort((a, b) => a.said.localeCompare(b.said, contentLanguage()));
    const seen = new Set();
    const key = (row) => `${row.said.toLowerCase()}|${row.gloss}`;
    const unique = rows.filter((row) => (seen.has(key(row)) ? false : seen.add(key(row))));
    if (!unique.length) return null;
    return ui.button(quiet("Words"), {
      variant: "fade",
      icon: "book",
      onclick: () => {
        // Keys belong to the sheet while it's up: Escape closes it and doesn't end the session.
        const onKeys = (event) => {
          event.stopPropagation();
          if (event.key !== "Escape") return;
          event.preventDefault();
          layer.lxClose();
        };
        const layer = ui.sheetLayer({ label: "The words here", onClose: () => removeEventListener("keydown", onKeys, true) });
        layer.lxBody.append(el("div", { class: "lx-stack lx-words-sheet" }, el("h2", { class: "lx-sheet-title" }, "The words here"), unique.map((row) => ui.wordMeaning(row, { lang: contentLanguage() }))));
        addEventListener("keydown", onKeys, true);
        layer.lxOpen();
      },
    });
  }

  // ---------- each kind of step ----------

  function gameStep(step) {
    const item = step.item;
    const kind = step.kind;
    const s = settings[kind] ?? {};
    const level = levelOf(item);
    let hintUsed = false;
    const hintLine = ui.literalLine(cardItem(item), { hidden: true });
    const words = item.words.map(([text]) => text);
    // What each game records (set as the game is built): record(correct, result) → recordItem's options.
    // A word-order game's slip, against the words as written; a choice's, against the sentence it should have been.
    const placedSlip = (correct, report) => (correct || !report?.placed ? null : slipBetween(item.words.map(([text]) => text), report.placed));
    let record = (correct) => ({ activity: kind, patterns: correct ? "right" : "wrong" });
    let detail = null; // a word-by-word result to show under the game (typing)
    // What you answered, as text, from what the game reports (set as the game is built).
    let answerOf = () => undefined;
    const answered = (report) => {
      const { correct, result } = report;
      if (current.answered) return;
      const outcome = correct ? (hintUsed ? "hint" : "right") : "wrong";
      const answer = answerOf(report);
      recordItem(step, { ...record(correct, result, report), help: hintUsed ? "answer" : "none", said: typeof answer === "string" ? answer : undefined });
      // Typed: against what you typed (ui.typedLine), never the sentence's words struck through. That line says all the field does, word by
      // word, so it's the field a result with no room left folds away, never the line (study-screens.css, data-fold; lx-said-typed).
      if (result) detail?.replaceChildren(report.typed !== undefined ? ui.typedLine(result, report.typed, { lang: contentLanguage() }) : ui.saidLine(result.words));
      if (result && report.typed !== undefined) detail?.classList.add("lx-said-typed");
      // A right answer leaves the grammar to the way in, when there's one under it. A typed answer that's wrong explains an idea only where it
      // went wrong on that idea's words (typedAbout).
      const about = !correct && result && report.typed !== undefined ? typedAbout(item, result) : hasWayIn(item) && !plan.lesson ? { ...aboutOf(item), line: null } : aboutOf(item);
      // What does it mean? answers with the word itself: "ben (zijn): to be; his, its".
      const line = current.aboutWord ? `${current.aboutWord.said}${current.aboutWord.lemma ? ` (${current.aboutWord.lemma})` : ""}: ${current.aboutWord.gloss}` : null;
      // In a lesson or a practice, what it says, and no grammar: an idea has its own place.
      const plainly = plan.retries ? item.means : null;
      if (correct) finishStep(outcome, { feedbackMeaning: hintUsed ? "hint" : "right", title: hintUsed ? "Right, with a hint" : "Right", text: line ?? plainly ?? about.line, item, literal: s.literal && settings.right.literal, answer });
      else finishStep("wrong", { feedbackMeaning: "wrong", title: "Not quite", text: line ?? plainly ?? about.about, item, literal: s.literal, answer });
    };

    let label = PROMPTS[kind];
    let shortLabel = null; // an order step's instruction on one line (fit's data-order-fit)
    let english = item.means;
    let game;
    let listening = null; // Listening's play controls
    let question = null; // What does it mean?: the sentence with its word marked
    let wordsShown = null; // The words on the screen that are answers themselves, for the Words action
    if (kind === "meaning") {
      // One word in a sentence: what does it mean? Every other word's meaning is a tap away; this one's is the question.
      const lemma = step.target;
      const about = item.words.findIndex(([, word]) => word === lemma);
      const data = cardItem(item, { target: lemma });
      question = ui.targetLine(data.words, { lang: contentLanguage(), onWord: (word, node) => { if (word.state !== "target" || current.answered) showMeaning(node); } });
      const { options, correct } = meaningChoices(lemma, item, { known: knownNow }) ?? meaningChoices(lemma, item);
      game = ui.choiceList(options, correct, { onAnswer: answered, lang: learningFrom() });
      answerOf = ({ picked }) => options[picked];
      record = (right) => ({ activity: "meaning", patterns: "met", words: { [lemma]: right ? "right" : "wrong" } });
      english = null;
      current.pick = (n) => game.lxPick(n);
      current.aboutWord = about >= 0 ? meaningOfWord(item.words[about][0], item) : null;
    } else if (kind === "translate") {
      // An order step too (its English built from tiles): the same last squeeze and, still too tall, the same next way (fit). Its title is short already.
      shortLabel = PROMPTS.translate;
      // The sentence said and shown, its new words marked, every word's meaning a free tap; its English built from tiles.
      const data = cardItem(item);
      const news = new Set(step.news ?? []);
      for (const word of data.words) word.state = word.word && news.has(word.word) ? "target" : undefined;
      if (step.news?.length) for (const id of item.chunks ?? []) if (news.has(id)) for (const at of phraseAt(item, id) ?? []) data.words[at].state = "target";
      const line = ui.targetLine(data.words, { lang: contentLanguage(), onWord: (word, node) => showMeaning(node) });
      const speak = voice.hearsItem(item) ? ui.speakButton((options) => voice.speakItem(item, options), { label: "Play the sentence" }) : null;
      question = el("div", { part: "translate-line" }, speak, line);
      current.playFirst = speak && settings.listening.cards ? () => speak.lxPlay?.() : null;
      // The word-for-word English is right too where the planner judged it so (step.also, its words among the tiles).
      game = ui.arrange(shuffled(step.tiles, item.id), step.answer, { onCheck: answered, ...tileSounds(false), also: step.also?.length ? [step.also] : [], lang: learningFrom(), checkButton: false });
      game.lxOnChange = () => fit();
      answerOf = ({ placed }) => placed && placed.join(" ");
      english = null;
      record = (correct) => ({ activity: "translate", patterns: correct ? "right" : "wrong", words: Object.fromEntries(item.words.map(([, word]) => word).filter(Boolean).map((word) => [word, correct ? "right" : news.has(word) ? "wrong" : "met"])) });
      current.check = () => game.lxCheck();
    } else if (kind === "choose") {
      const options = shuffled([sentence(item), ...item.wrong], item.id);
      game = ui.choiceList(options, options.indexOf(sentence(item)), { onAnswer: (report) => (sayTapped(options[report.picked], { answers: true, item }), answered(report)) });
      answerOf = ({ picked }) => options[picked];
      record = (correct, _, report) => ({ activity: kind, patterns: correct ? "right" : "wrong", slip: correct || !report ? null : slipBetween(item.words.map(([text]) => text), String(options[report.picked] ?? "").trim().split(/\s+/)) });
      current.pick = (n) => game.lxPick(n);
      wordsShown = [...item.words.map(([text]) => text), ...item.wrong.flatMap((other) => other.split(/\s+/))];
    } else if (kind === "arrange") {
      // English chunks for a sentence you're new to (the Dutch order before the Dutch words), Dutch words after. On
      // mix, the session's plan can ask for one (step.mode: english tests saying it, dutch tests reading it).
      const inEnglish = s.tiles === "english" || (s.tiles === "mix" && (step.mode ? step.mode === "english" : level <= 1));
      const answer = inEnglish ? item.literal.map(([text]) => text) : item.words.map(shownWord);
      // A word you've never seen is no choice, in a lesson or Practice: one you know, in the form you know it.
      const strayText = s.stray ? (plan.retries && !inEnglish ? strayYouKnow(item) : strayFor(item, inEnglish)) : null;
      const stray = strayText && !inEnglish ? shownStray(strayText) : strayText;
      const moved = inEnglish ? item.literal.filter(([, m]) => m).map(([text]) => text) : item.moved;
      game = ui.arrange(shuffled(stray ? [...answer, stray] : answer, item.id), answer, { onCheck: answered, ...tileSounds(!inEnglish), moved, lang: inEnglish ? learningFrom() : contentLanguage(), checkButton: false });
      // Your order growing a row as tiles go in: the step fits again (only ever tighter).
      game.lxOnChange = () => fit();
      answerOf = ({ placed }) => placed && (inEnglish ? placed.join(" ") : answerText(placed, item.punct));
      if (!inEnglish) wordsShown = [...words, ...(stray ? [typeof stray === "string" ? stray : wordOfTile(stray)] : [])];
      shortLabel = inEnglish ? PROMPTS.arrangeEnglishShort : PROMPTS.arrangeShort;
      if (inEnglish) {
        label = PROMPTS.arrangeEnglish;
        record = (correct) => ({ activity: "arrange-english", patterns: correct ? "right" : "wrong", noWords: true });
      } else record = (correct, _, report) => ({ activity: kind, patterns: correct ? "right" : "wrong", slip: placedSlip(correct, report) });
      current.check = () => game.lxCheck();
    } else if (kind === "place") {
      const at = placeFor(item);
      const shown = item.words.map(shownWord);
      const rest = shown.filter((_, i) => i !== at);
      game = ui.placeWord(rest, shown[at], at, { onAnswer: answered, punct: item.punct });
      answerOf = ({ picked }) => {
        const others = words.filter((_, i) => i !== at);
        return answerText([...others.slice(0, picked), words[at], ...others.slice(picked)], item.punct);
      };
      // The word is given: placing it tests the order (the patterns); the word itself was only met.
      record = (correct, _, report) => ({ activity: kind, patterns: correct ? "right" : "wrong", slip: correct || !report ? null : { kind: "order", at: [at] } });
      current.pick = (n) => game.lxPick(n);
      wordsShown = words;
    } else if (kind === "fill") {
      // The words around the gap, as the language joins them (with their readings).
      const shown = item.words.map(shownWord);
      const before = shown.slice(0, item.gap.index);
      const rest = shown.slice(item.gap.index + 1);
      const textOfShown = (word) => (typeof word === "string" ? word : word.text);
      // The gap's word as written can carry punctuation ("koffie," in "Hallo, een koffie, graag."; "¿Tenemos" in "¿Tenemos que hacer
      // esto?"): the choices are words (study/gap-marks.js), so it stays out of them. A closing mark is drawn right after the gap, at the
      // start of the word after it (whose place in the sentence, for a tap's meaning, doesn't move), an opening one just before the gap,
      // and the answer is compared and said without them.
      const { head, tail } = gapMarks(words[item.gap.index]);
      const bareOf = (text) => bareChoice(text, { head, tail });
      const joined = [...rest.slice(0, -1), ...rest.slice(-1).map((word) => withText(word, textOfShown(word) + item.punct))];
      const after = rest.length ? (tail ? [withText(joined[0], `${tail}${separatorOf(contentLanguage())}${textOfShown(joined[0])}`), ...joined.slice(1)] : joined) : [`${tail}${item.punct}`].filter(Boolean);
      // Choices with readings show them while the gap's word is new, as the sentence's words do, and as written once it's
      // known: all together, so none stands out.
      const gapWord = item.words[item.gap.index][1];
      const known = Boolean(gapWord) && readingHides(`w:${gapWord}`);
      const offered = step.options ?? fillChoices(item, { known: knownNow }) ?? item.gap.options;
      const choices = offered.map((option) => (typeof option === "string" ? bareOf(option) : { ...option, text: bareOf(option.text), hidden: known }));
      game = ui.fillSentence(before, after, shuffled(choices, item.id), bareOf(words[item.gap.index]), { head, onAnswer: (report) => (sayTapped(report.picked, { answers: true }), answered(report)) });
      answerOf = ({ picked }) => answerText(words.map((word, i) => (i === item.gap.index ? head + picked + tail : word)), item.punct);
      record = (correct, _, report) => ({ activity: "fill", patterns: correct ? "right" : "wrong", words: gapWord ? { [gapWord]: correct ? "right" : "wrong" } : {}, slip: correct || !report ? null : { kind: "form", at: [item.gap.index] } });
      current.pick = (n) => game.lxPick(n);
      wordsShown = offered.map(optionText).map(bareOf);
    } else if (kind === "type-gap" || kind === "hear-gap") {
      // The gap's word, typed: from the English (Type in the gap), or as you hear the sentence (Type what it says). The rest of the sentence
      // is there around it, as Fill's is; the word is graded as typing a sentence is (lang/index.js withoutAccents unless Settings → Type it
      // asks for accents), on its own.
      const heard = kind === "hear-gap";
      const at = item.gap.index;
      const shown = item.words.map(shownWord);
      const { head, tail, bare } = gapMarks(words[at]);
      const textOfShown = (word) => (typeof word === "string" ? word : word.text);
      const rest = shown.slice(at + 1);
      const joined = [...rest.slice(0, -1), ...rest.slice(-1).map((word) => withText(word, textOfShown(word) + item.punct))];
      const after = rest.length ? (tail ? [withText(joined[0], `${tail}${separatorOf(contentLanguage())}${textOfShown(joined[0])}`), ...joined.slice(1)] : joined) : [`${tail}${item.punct}`].filter(Boolean);
      const gapWord = item.words[at][1];
      const [, , gapReading] = item.words[at];
      label = heard ? PROMPTS.hearGap : PROMPTS.typeGap;
      if (heard) {
        english = null;
        listening = listenControls(item);
      }
      // Its room held from the start (components.css), so the correction a wrong answer puts there moves nothing above it.
      detail = el("div", { class: "lx-said", "data-holds": "type-diff" });
      const gapGame = ui.typeInGap(shown.slice(0, at), after, bare, {
        lang: contentLanguage(),
        head,
        onCheck: (typed) => {
          const { correct } = typedWord(bare, typed, { forgiving: settings.type.accents !== "strict", lemma: gapWord, reading: gapReading });
          gapGame.lxShow(correct ? "right" : "wrong");
          // Wrong: your typing against the word, letter by letter, under the sentence.
          if (!correct) detail.replaceChildren(ui.typeDiff(typed, bare, { lang: contentLanguage() }));
          answered({ correct, typed });
        },
      });
      game = el("div", { class: "lx-stack" }, gapGame, detail);
      answerOf = ({ typed }) => answerText(words.map((word, i) => (i === at ? head + typed.trim() + tail : word)), item.punct);
      // Typed from the English, the word's form is yours: the sentence's patterns are tested as Fill tests them, a wrong word a slip of form
      // there. Heard, the form was given: only the word.
      record = (correct) => ({ activity: kind, patterns: heard ? "met" : correct ? "right" : "wrong", words: gapWord ? { [gapWord]: correct ? "right" : "wrong" } : {}, slip: correct || heard ? null : { kind: "form", at: [at] } });
      current.check = () => gapGame.lxCheck();
      wordsShown = words.filter((_, i) => i !== at);
      if (!heard) requestAnimationFrame(() => gapGame.lxInput.focus({ preventScroll: true }));
    } else if (kind === "type" || kind === "listen") {
      // Typing the whole sentence: from the English, or from what you hear.
      // Listening on mix: the plan's choice (step.mode), else by how well you know the sentence.
      const mixed = step.mode ?? (level <= 1 ? "meaning" : level === 2 ? "order" : "type");
      let mode = kind === "listen" ? (s.mode === "mix" ? mixed : s.mode) : s.from === "audio" ? "type" : null;
      // What did you hear? chooses among sentences you've met. With none yet, it's put in the order you heard.
      const wrongHeard = kind === "listen" && mode === "meaning" ? heardChoices(item, { units: new Set(studiedUnits()), played: new Set(allEvidence().map((row) => row.item)) }) : [];
      if (mode === "meaning" && !wrongHeard.length) mode = "order";
      const heard = kind === "listen" || s.from === "audio";
      if (heard) {
        english = null;
        listening = listenControls(item);
      }
      if (kind === "type" || mode === "type") {
        label = heard ? PROMPTS.typeHeard : PROMPTS.type;
        detail = el("div", { class: "lx-said" });
        const field = ui.writeSentence(typedPlaceholder(heard ? PROMPTS.typeHeard : PROMPTS.type), {
          checkButton: false,
          onCheck: (text) => {
            // From the English, its subject said or left out is right too (study/subjects.js); from what's heard, word for word.
            const result = typedResult(item, text, settings.type.accents !== "strict", { fromEnglish: !heard });
            answered({ correct: typedRight(result), result, typed: text });
          },
        });
        game = el("div", { class: "lx-stack" }, field, detail);
        answerOf = ({ typed }) => typed;
        // Gave up (no result): every word and the order were missed.
        record = (correct, result) => ({
          activity: kind === "listen" ? "listen-type" : heard ? "type-heard" : "type",
          patterns: result ? orderOutcome(result) : "wrong",
          words: result ? wordOutcomes(item.words, result) : allWrong(item.words),
          slip: result ? slipOfResult(result) : null,
        });
        current.check = () => field.lxCheck();
        if (!heard) requestAnimationFrame(() => field.lxInput.focus({ preventScroll: true }));
      } else if (mode === "meaning") {
        label = PROMPTS.listenMeaning;
        const options = shuffled([item.means, ...wrongHeard], `${item.id}:meaning`);
        game = ui.choiceList(options, options.indexOf(item.means), { onAnswer: answered, lang: "en" });
        answerOf = ({ picked }) => options[picked];
        record = (correct) => ({ activity: "listen-meaning", patterns: correct ? "right" : "wrong" });
        current.pick = (n) => game.lxPick(n);
      } else {
        label = PROMPTS.listenOrder;
        shortLabel = PROMPTS.listenOrderShort;
        game = ui.arrange(shuffled([...item.words.map(shownWord), ...(step.stray ?? []).map(shownStray)], item.id), item.words.map(shownWord), { onCheck: answered, ...tileSounds(true), moved: item.moved, checkButton: false });
        // Your order growing a row as tiles go in: the step fits again (only ever tighter).
        game.lxOnChange = () => fit();
        answerOf = ({ placed }) => placed && answerText(placed, item.punct);
        record = (correct, _, report) => ({ activity: "listen-order", patterns: correct ? "right" : "wrong", slip: placedSlip(correct, report) });
        current.check = () => game.lxCheck();
        wordsShown = words;
      }
    }
    game.classList.add("lx-game");
    // The sentence's English on the screen or asked for (shown above, built from tiles, or chosen from what you heard): when it rewords
    // the sentence, the card says so.
    const englishInPlay = english !== null || kind === "translate" || label === PROMPTS.listenMeaning;
    // (Shown above already: the answer needn't say it again.)
    current.englishShown = english !== null;
    // (Its English the answer: a result held to its room keeps it whole with the sentence, answerFirst.)
    current.answersInEnglish = english === null && englishInPlay;
    // The instruction, then what the step is about (the English, or the audio, and the hint once asked for), then what
    // you do, centered in the space left, within reach.
    const stimulus = el("div", { class: "lx-stimulus" }, listening?.row, question ?? (kind === "listen" ? null : hintLine));
    // An order step: its instruction's words and its short ones, for fit's last squeeze (data-order-fit).
    current.ordering = shortLabel ? { long: label, short: shortLabel } : null;
    show(stepTag(step, { reworded: englishInPlay && Boolean(rewordOf(item)) }), prompt(label, english), stimulus, el("div", { class: "lx-stack lx-reach" }, game));
    listening?.play();
    current.playFirst?.();

    const hintWords = `Hint: ${learningName()} order`;
    const hint = ui.button(quiet(hintWords, { gives: true }), {
      variant: "fade",
      icon: "bulb",
      onclick: () => {
        if (current.answered || hintUsed) return;
        hintUsed = true;
        stepChange(() => {
          hintLine.removeAttribute("data-state");
          hint.remove();
        });
        hintLine.lxMorph();
        // Tinta points at the words the hint marks (the ones Dutch moves), in turn: the clue, never an answer.
        ui.pointCharacter(tinta, hintLine.querySelectorAll('[data-part="literal-chunk"][data-state="moved"]'));
      },
    });
    const skip = ui.button(quiet("I don't know"), {
      variant: "fade",
      icon: "skip",
      onclick: () => {
        if (current.answered) return;
        recordItem(step, record(false, null));
        const word = current.aboutWord;
        finishStep("wrong", { feedbackMeaning: "wrong", title: "Here's the answer", text: word ? `${word.said}${word.lemma ? ` (${word.lemma})` : ""}: ${word.gloss}` : aboutOf(item).about, item, literal: s.literal, skipped: true });
      },
    });
    // Check (for the games that have one) is the bar's big button; the hint is a setting of each game (Settings →
    // Study), and Listening has none (it would show the words).
    const checkNow = current.check ? ui.button("Check", { variant: "white", size: "lg", block: true, onclick: () => current.check?.() }) : null;
    // (Its name whole, though an order step squeezed shows it as "Hint": fit's data-order-fit.)
    hint.setAttribute("aria-label", hintWords);
    if (current.ordering) current.ordering.hint = { words: hint.querySelector("span[data-gives]"), long: hintWords, short: "Hint" };
    // The hint shows the language's order, so it's offered only where that's another order than the English.
    setBar(null, checkNow, el("div", { class: "lx-answer-actions" }, s.hint && kind !== "listen" && orderDiffers(item) ? hint : null, wordsShown ? wordsAction(item, wordsShown) : null, skip, listening || current.playFirst ? cantListen() : null));
  }

  // Listening's controls: the sentence plays as the step appears; Play again, and Slower.
  function listenControls(item) {
    const again = ui.speakButton((options) => voice.speakItem(item, options), { label: "Play it again", text: "Play again" });
    const slower = ui.speakButton((options) => voice.speakItem(item, { ...options, rate: 0.7 }), { label: "Play it slower", text: "Slower" });
    return { row: el("div", { class: "lx-listen-row" }, again, slower), play: () => again.lxPlay() };
  }

  // One word in a sentence: try to work out what it means, then see. Any other word's meaning is a tap away and costs
  // nothing. A word you've never seen (first) isn't graded: there's nothing yet to remember. After that, you say whether
  // you knew it, for that word alone; the sentence's other words were only met.
  // Over a question: it's new, or it's come back.
  // The step's tags on its card: Once more or New word, and Not word for word when the English it shows or asks for rewords the sentence.
  const stepTag = (step, { reworded = false } = {}) => {
    const tags = [
      step.again ? el("span", { part: "step-tag" }, "Once more") : step.isNew ? el("span", { part: "step-tag" }, step.phrase ? "New phrase" : "New word") : null,
      reworded ? el("span", { part: "step-tag", variant: "reword", title: t("study.reword.tagAbout") }, t("study.reword.tag")) : null,
    ].filter(Boolean);
    return tags.length ? el("span", { part: "step-tags" }, tags) : null;
  };
  const knownNow = (lemma) => !conceptState(`w:${lemma}`).isNew;

  // A drawing not in yet is held as its tile (art.css: an empty picture is its square in --art-tile), so its step is drawn whole at once and
  // the drawing fades into it as it comes. (A first run on a slow line drew only the step's bar while it waited, and a session's cover rose
  // with nothing on it, its question fading in half a second later: 7 Nov, WebKit at 320.)
  const heldPicture = (id) => {
    const node = pictureNode(id);
    if (!node.firstElementChild) node.dataset.held = id;
    return node;
  };
  // Every held drawing in the step that's here now, filled and faded in.
  const fillHeld = () => {
    for (const node of activity.querySelectorAll('[data-part="picture"][data-held]')) {
      const svg = pictureNode(node.dataset.held).firstElementChild;
      if (svg) {
        delete node.dataset.held;
        node.append(svg);
        // A fade alone: the drawing comes into the tile that held its place, never moving in it.
        motion.appear(svg, { rise: 0, blur: 0 });
      }
    }
  };
  // A step whose drawings aren't in yet. A drawing that can't be had fails at once, and one on its way is a while: so a moment first
  // (DRAWINGS_DECIDE, inside the cover's FIRST_STEP_WAIT). In by then: drawn with them; failed: asked in words. Still coming: drawn with them
  // held, each filled as it comes however long it takes (the step is answered by its words meanwhile, and keeps its shape: asked again in words
  // once a wait ran out, its tiles had turned into a list in one frame); only if they then fail, and it's still unanswered, in words.
  const drawHeld = (wanted, draw) => {
    const mine = current;
    let decided = false;
    const got = getDrawings(wanted).then((ready) => {
      if (!decided || current !== mine) return ready;
      fillHeld();
      if (!ready && !mine.answered) draw(false);
      return ready;
    });
    Promise.race([got, new Promise((done) => setTimeout(() => done(null), DRAWINGS_DECIDE))]).then((ready) => {
      decided = true;
      if (current !== mine) return;
      draw(ready === null ? true : ready);
    });
  };

  // Which one is it? A thing shown and heard, and what it is, in pictures where there are enough, else in words. Its meaning is a tap away, free, as any word's is.
  function seeStep(step) {
    const wanted = step.options.map((option) => option.picture).filter(Boolean);
    if (wanted.every((id) => drawingsReady.has(id))) return drawSee(step, Boolean(wanted.length));
    drawHeld(wanted, (pictured) => drawSee(step, pictured));
  }

  function drawSee(step, pictured) {
    const lang = contentLanguage();
    // In a language that shows readings, a word with its reading while it's new.
    const reading = (step.target && READINGS[step.target]) || readingOfForm(step.text);
    const known = Boolean(step.target) && readingHides(`w:${step.target}`);
    const text = el("span", { lang, "data-word": step.text, class: "lx-see-text" }, reading ? ui.wordLabel({ text: step.text, reading, hidden: known }, lang) : step.text);
    const speak = voice.hearsWord(step.text) ? ui.speakButton(() => voice.speakWord(step.text), { label: "Say it" }) : null;
    // The words are beside each drawing, so the drawing says nothing more to a screen reader.
    // A picture reacts to the answer (reactions.js): decoration on a game that's already answered.
    const pictureIds = step.options.map((option) => (pictured ? (option.picture ?? null) : null));
    prepareReactions(pictureIds);
    const game = ui.pictureChoices(step.options.map((option) => ({ label: option.label, picture: pictured && option.picture ? heldPicture(option.picture) : null })), step.correct, {
      onAnswer: ({ correct, picked }) => {
        if (current.answered) return;
        record([{ concept: step.unit, outcome: correct ? "right" : "wrong", activity: "see", ...TESTS.see, ...(correct ? {} : { said: step.options[picked].label.slice(0, 300) }) }]);
        touched.add(step.unit);
        finishStep(correct ? "right" : "wrong", { feedbackMeaning: correct ? "right" : "wrong", title: correct ? "Right" : "Not quite", text: `${step.text}: ${step.options[step.correct].label}` });
        reactToAnswer(game, pictureIds, step.correct, picked);
      },
    });
    game.classList.add("lx-game");
    current.pick = (n) => game.lxPick(n);
    show(stepTag(step), prompt(PROMPTS.see, null), el("div", { part: "see-word" }, speak, text), el("div", { class: "lx-stack lx-reach" }, game));
    const plays = Boolean(speak) && settings.listening.cards;
    if (plays) speak.lxPlay?.();
    setBar(null, el("div", { class: "lx-answer-actions" }, idontknow(step), plays ? cantListen() : null));
  }

  // A question about one thing by itself (Pick the word, Type the word, the speaking twins) shows its drawing under the English, where it has
  // one: held as its tile while it comes (drawHeld), and asked without it if it doesn't.
  function withDrawing(step, draw) {
    if (!step.picture || drawingsReady.has(step.picture)) return draw(Boolean(step.picture));
    drawHeld([step.picture], draw);
  }
  // The drawing, as a tile of the art with its hard edge (a picture choice's, alone); what it shows is the English beside it, so a
  // screen reader is told nothing more.
  const wordPicture = (step, pictured) => (pictured ? el("div", { part: "word-picture", "aria-hidden": "true" }, heldPicture(step.picture)) : null);

  // Which word is it? The English (with its drawing), and the word among others you know or this lesson's.
  function wordStep(step) {
    withDrawing(step, (pictured) => drawWord(step, pictured));
  }

  function drawWord(step, pictured) {
    const withReading = (text) => {
      const reading = readingOfForm(text);
      return reading ? { text, reading } : text;
    };
    const game = ui.choiceList(step.options.map(withReading), step.correct, {
      lang: contentLanguage(),
      onAnswer: ({ correct, picked }) => {
        if (current.answered) return;
        // Its answer's sound is the right word (Answers); with Answers off, the word you tapped (Words you tap).
        if (settings.listening.answers) afterAnswerSound(() => voice.speakWord(step.options[step.correct]));
        else sayTapped(step.options[picked], { answers: true });
        record([{ concept: step.unit, outcome: correct ? "right" : "wrong", activity: "word", ...TESTS.word, ...(correct ? {} : { said: step.options[picked].slice(0, 300) }) }]);
        touched.add(step.unit);
        finishStep(correct ? "right" : "wrong", { feedbackMeaning: correct ? "right" : "wrong", title: correct ? "Right" : "Not quite", text: `${step.options[step.correct]}: ${step.means}` });
      },
    });
    game.classList.add("lx-game");
    current.pick = (n) => game.lxPick(n);
    show(stepTag(step), prompt(PROMPTS.word, step.means), wordPicture(step, pictured), el("div", { class: "lx-stack lx-reach" }, game));
    setBar(null, el("div", { class: "lx-answer-actions" }, idontknow(step)));
  }

  // Type the word: Pick the word's typing twin. The English (with its drawing), and you type what says it, as it's taught: a noun with its
  // article. Graded as typing a sentence is (accents forgiving unless Settings → Type it asks for them); wrong, your typing against it.
  function typeWordStep(step) {
    withDrawing(step, (pictured) => drawTypeWord(step, pictured));
  }

  function drawTypeWord(step, pictured) {
    const lang = contentLanguage();
    const detail = el("div", { class: "lx-said" });
    const field = ui.writeSentence(typedPlaceholder(step.article ? "With its article" : "The word"), {
      lang,
      checkButton: false,
      onCheck: (typed) => {
        if (current.answered) return;
        const reading = step.text.includes(" ") ? null : readingOfForm(step.text);
        const { correct } = typedWord(step.text, typed, { forgiving: settings.type.accents !== "strict", lemma: step.target, reading });
        field.setAttribute("data-state", correct ? "right" : "wrong");
        if (correct) motion.pop(field.lxInput);
        else {
          motion.shake(field.lxInput);
          detail.replaceChildren(ui.typeDiff(typed, step.text, { lang }));
        }
        if (settings.listening.answers) afterAnswerSound(() => voice.speakWord(step.text));
        record([{ concept: step.unit, outcome: correct ? "right" : "wrong", activity: "type-word", ...TESTS["type-word"], ...(correct ? {} : { said: typed.slice(0, 300) }) }]);
        touched.add(step.unit);
        finishStep(correct ? "right" : "wrong", { feedbackMeaning: correct ? "right" : "wrong", title: correct ? "Right" : "Not quite", text: `${step.text}: ${step.means}` });
      },
    });
    field.lxInput.setAttribute("autocapitalize", "off");
    field.lxInput.setAttribute("enterkeyhint", "done");
    const game = el("div", { class: "lx-stack" }, field, detail);
    game.classList.add("lx-game");
    current.check = () => field.lxCheck();
    show(stepTag(step), prompt(PROMPTS.typeWord, step.means), wordPicture(step, pictured), el("div", { class: "lx-stack lx-reach" }, game));
    requestAnimationFrame(() => field.lxInput.focus({ preventScroll: true }));
    const checkNow = ui.button("Check", { variant: "white", size: "lg", block: true, onclick: () => current.check?.() });
    setBar(null, checkNow, el("div", { class: "lx-answer-actions" }, idontknow(step)));
  }

  const idontknow = (step) =>
    ui.button(quiet("I don't know"), {
      variant: "fade",
      icon: "skip",
      onclick: () => {
        if (current.answered) return;
        record([{ concept: step.unit, outcome: "wrong", activity: step.kind, ...TESTS[step.kind] }]);
        touched.add(step.unit);
        const answer = step.kind === "see" ? `${step.text}: ${step.options[step.correct].label}` : step.kind === "type-word" ? `${step.text}: ${step.means}` : `${step.options[step.correct]}: ${step.means}`;
        finishStep("wrong", { feedbackMeaning: "wrong", title: "Here's the answer", text: answer, skipped: true });
      },
    });

  // Meet: a new word or phrase (or a lesson's one idea), said and shown with what it means, in a short sentence. Nothing's
  // asked, so nothing's graded; only the thing you met is recorded.
  // A lesson's idea, met: the card its button brings back later (after-answer.js conceptView), on the sentence it's met on: the
  // lesson's words for it, its picture drawn on that sentence, and why. Continue records it met.
  function ideaStep(step) {
    const item = step.item ?? null;
    const unit = `p:${step.concept.pattern}`;
    const view = conceptView(unit, { item, sentence: item ? sentence(item) : undefined, first: true, name: step.concept.name, line: step.concept.line });
    view.classList.add("lx-idea-card");
    const met = () => {
      if (current.answered) return;
      current.answered = true;
      record([{ concept: unit, outcome: "met", activity: "meet", item: item?.id, ...TESTS.meet }]);
      touched.add(unit);
      results[index] = "right";
      advance();
    };
    current.continue = met;
    current.revealed = true;
    show(prompt("One idea", null), view);
    view.lxPlay(motion.duration("--dur-320", 320));
    setBar(null, el("div", { class: "lx-answer-actions" }, ui.button("Continue", { variant: "white", size: "lg", block: true, onclick: met })));
  }

  function cardStep(step) {
    const item = step.item;
    const lemma = step.target ?? targetOf(item) ?? item.words.find(([, word]) => word)?.[1];
    const first = Boolean(step.first);
    const data = cardItem(item, { target: lemma, first });
    const about = item.words.find(([, word]) => word === lemma);
    const info = about ? meaningOfWord(about[0], item) : null;
    data.meaning = info ? ui.wordMeaning(info, { lang: contentLanguage(), state: "hidden" }) : null;
    const c = settings.cards;
    const card = ui.studyCard(data, {
      reveal: "external",
      audio: voice.hearsItem(item) ? (options) => voice.speakItem(item, options) : null,
      literal: { show: c.literal, start: c.reveal, flip: c.flip, position: c.position, natural: c.natural },
      // The word it's about is the question: pressing it shows the answer, as Show meaning does.
      onWord: (word, node) => (word.state === "target" && !current.revealed ? reveal() : showMeaning(node)),
    });
    const grade = (knew) => {
      if (current.answered) return;
      current.answered = true;
      recordItem(step, { activity: "card", patterns: "met", words: lemma ? { [lemma]: knew ? "right" : "wrong" } : {} });
      results[index] = knew ? "right" : "wrong";
      advance();
    };
    const met = () => {
      if (current.answered) return;
      current.answered = true;
      recordItem(step, { activity: "card", patterns: "met" });
      results[index] = "right";
      advance();
    };
    // Once it's shown, the card has its "?" too, on the word it's about (with this sentence first), else the sentence.
    const learnCard = () => learnOf(step, { item, learn: lemma && hasWordPage(`w:${lemma}`) ? wordPage(`w:${lemma}`, { item, practice: drawerPractice, lessonIdea: step.idea ?? null }) : null });
    const afterReveal = () =>
      first
        ? setBar(null, el("div", { class: "lx-answer-actions" }, learnCard(), ui.button("Continue", { variant: "white", size: "lg", block: true, onclick: met })))
        : setBar(
            null,
            el(
              "div",
              { class: "lx-answer-actions" },
              learnCard(),
              ui.button("Not yet", { variant: "gray", size: "lg", icon: "cross", onclick: () => grade(false) }),
              ui.button("I knew it", { variant: "white", size: "lg", icon: "check", onclick: () => grade(true) }),
            ),
          );
    const reveal = () => {
      if (current.revealed) return;
      card.lxReveal();
      current.revealed = true;
      if (first) current.continue = met;
      afterReveal();
    };
    current.reveal = reveal;
    if (!first) current.grade = grade;
    // Its English rewording the sentence, said on the card as every other game says it (only that tag: a card has no New word), when the card
    // can show its English (Settings → Study cards' natural line).
    const reworded = c.natural !== false && Boolean(rewordOf(item));
    show(stepTag({}, { reworded }), prompt(PROMPTS.card, null), el("p", { part: "attribution-prompt" }, icon("tag"), index === 0 && plan.note ? `${plan.note} Tap any word for its meaning.` : "Tap any word for its meaning."), card);
    const plays = settings.listening.cards && voice.hearsItem(item);
    if (plays) card.lxPlay();
    setBar(null, el("div", { class: "lx-answer-actions" }, ui.button("Show meaning", { variant: "white", size: "lg", block: true, icon: "eye", onclick: reveal }), plays ? cantListen() : null));
  }

  // Say it: read the sentence aloud (or say it from the English), checked word by word. Up to three tries; the first
  // is what's recorded.
  const SAY_STATUS = {
    asking: "Waiting for the microphone…",
    loading: "Getting the speech model ready. Start speaking whenever you like.",
    listening: "Listening. Say it now.",
    hearing: "Listening…",
    thinking: "Checking what you said…",
  };
  // Repeat after is the same step, listening first: the sentence plays, and its text shows only once you've said it
  // (unless Settings → Study → Repeat after shows it while you listen). Say the word and Repeat the word are it on one word (a noun with its
  // article, a phrase): from its English with its drawing, or heard, with its drawing, and said back.
  function sayStep(step) {
    if (step.kind === "say-word" || step.kind === "repeat-word") return withDrawing(step, (pictured) => drawSay(step, pictured));
    drawSay(step, false);
  }
  // A word said by itself, as the step reads a sentence: its words (an article, then the word), the word's lemma and reading on the last, no end mark.
  const wordItem = (step) => {
    const parts = String(step.text).trim().split(/\s+/);
    const reading = parts.length === 1 ? (step.reading ?? readingOfForm(step.text)) : null;
    return { id: null, means: step.means, punct: "", words: parts.map((text, i) => (i === parts.length - 1 ? [text, step.target ?? null, ...(reading ? [reading] : [])] : [text, null])) };
  };
  // Play again for a word (a recording of it, else the device's voice).
  const wordListen = (step) => {
    const again = ui.speakButton(() => voice.speakWord(step.text), { label: "Play it again", text: "Play again" });
    return { row: el("div", { class: "lx-listen-row" }, again), play: () => again.lxPlay() };
  };

  // A pack's plain card said aloud (deck.js: a card whose text is in the pack's language, where something can listen) is Say the word on the
  // card's text: asked from its meaning, the same tries and rows, right with a noun's article left off (deck.js saidNoun), matched by its reading
  // where it has one. Its evidence is the card's own unit's (cardRows), as its other games record it, and its sound the card's own.
  const cardAsked = (step) => ({ kind: "say", card: step.card, text: step.card.text, means: step.card.means, target: saidNoun(step.card), unit: step.unit, reading: step.card.reading ?? null, sound: step.sound ?? null });

  function drawSay(shown, pictured) {
    const card = shown.kind === "deck" ? shown.card : null;
    // What's asked: the step itself, or a card's as a word step reads it. `shown` stays the session's own step (what current.step is held to).
    const step = card ? cardAsked(shown) : shown;
    const word = step.kind === "say-word" || step.kind === "repeat-word" || Boolean(card);
    const item = word ? wordItem(step) : step.item;
    const repeat = step.kind === "repeat" || step.kind === "repeat-word";
    const s = repeat ? settings.repeat : settings.say;
    const fromEnglish = word ? !repeat : !repeat && s.prompt === "english";
    // A word is right when the word itself was said (an article a recognizer drops isn't held against it), as a sentence's words are counted.
    const lemma = word ? item.words.at(-1)[1] : null;
    const saidRight = (match) => Boolean(match) && (word && lemma ? wordOutcomes(item.words, match, { spoken: true })[lemma] === "right" : match.ok);
    const aboutWord = word ? `${step.text}${card?.reading ? ` (${card.reading})` : ""}: ${step.means}` : null;
    // The answer aloud: a card's own sound on this device, else the device's voice; a word's recording.
    const sayAnswer = card ? (options) => voice.speakCard({ text: card.text, clip: step.sound, lang: contentLanguage() }, options) : () => voice.speakWord(step.text);
    const cardLearn = card ? () => ({ learn: cardPage(card, { say: sayAnswer, unit: step.unit }) }) : () => ({});
    const expected = expectedOf(item);
    // Said from its English, a sentence is right with its subject said or left out too, as the language allows, and so is another of
    // your sentences with the same English, and the same sentence for the other gender, shown as you said it (study/subjects.js);
    // read aloud or repeated, it's the very sentence.
    const variants = !word && fromEnglish ? [...subjectVariants(item, { lang: contentLanguage(), items: ITEMS }), ...sameEnglishVariants(item, { items: ITEMS, textOf: sentence }), ...genderVariants(item)] : [];
    let hintUsed = false;
    let tries = 0;
    let recorded = false;
    let listener = null;
    current.step = shown;
    const ready = repeat ? "Listen, then press the microphone and say it back." : card ? "Press the microphone and say it." : word ? "Press the microphone and say the word." : "Press the microphone and say the sentence.";
    const showText = repeat ? s.show === "always" : !fromEnglish;
    const hearsIt = word ? voice.hearsWord(step.text) : voice.hearsItem(item);
    const speakIt = word ? () => voice.speakWord(step.text) : (options) => voice.speakItem(item, options);
    const model = showText ? ui.spokenLine(shownWords(item), hearsIt ? speakIt : null, { label: "Hear it first" }) : null;
    const listening = repeat ? (word ? wordListen(step) : listenControls(item)) : null;
    const hintLine = fromEnglish && !word ? ui.literalLine(cardItem(item), { hidden: true }) : null;
    // A word's said lines (the word once it's settled, what was heard) keep their room from the first frame, so no try moves the microphone.
    const said = el("div", { class: "lx-said", "aria-live": "polite", ...(word ? { "data-holds": "said-lines" } : {}) });
    const status = el("p", { class: "lx-say-status lx-muted" }, ready);
    const mic = ui.micButton({
      onclick: () => {
        if (listener) return listener.stop();
        wakeSpeech();
        listen();
      },
    });
    // Load the speech module now, so the first press can wake the microphone inside the press; and get Whisper into
    // memory while you read the sentence, so the press doesn't wait (a slow load says so, after a second).
    let preparing = false;
    speechApi();
    chooseEngine().then((choice) => {
      if (choice.engine !== "whisper" || current.step !== shown) return;
      let shown = false;
      readyWhisper(choice, (seconds) => {
        if (listener || preparing || current.answered || current.step !== shown || seconds < 1) return;
        status.textContent = loadingText(seconds);
        shown = true;
      })
        .then(() => {
          if (shown && !listener && !preparing && !current.answered && current.step === step) status.textContent = ready;
        })
        .catch(() => {});
    });
    // The middle of the step: what's happening, the wide speak button, and what you said.
    const game = el("div", { class: "lx-stack lx-reach lx-say-zone lx-game" }, status, mic, said);
    const label = card ? PROMPTS.say : word ? (repeat ? PROMPTS.repeatWord : PROMPTS.sayWord) : repeat ? PROMPTS.repeat : fromEnglish ? PROMPTS.say : PROMPTS.read;
    show(word && !card ? stepTag(step) : null, prompt(label, fromEnglish ? item.means : null), el("div", { class: "lx-stimulus" }, listening?.row, fromEnglish ? hintLine : model), word && !card ? wordPicture(step, pictured) : null, game);
    listening?.play();

    // The first try is what's recorded. A word: its unit, said or not (what you said kept for your AI when it wasn't).
    const recordSay = (match, heard = "") => {
      if (recorded) return;
      recorded = true;
      if (word) {
        const right = saidRight(match);
        const row = { concept: step.unit, outcome: right ? "right" : "wrong", activity: step.kind, ...TESTS[step.kind], ...(!right && heard ? { said: heard.slice(0, 300) } : {}) };
        // A card's row is its own unit's, and the word's too when the card is exactly a word (deck.js cardRows), as its other games record it.
        record(card ? cardRows(card, { ...row, help: "none", item: step.unit.slice(2) }) : [row]);
        touched.add(step.unit);
        return;
      }
      // The matcher's words are the sentence's words, in order: each one's result is evidence for its word. Said
      // from the English, it's recall (the order is the patterns'); read aloud or repeated, it's how you sound (the
      // pronunciation track), which says nothing about the grammar.
      const words = match ? wordOutcomes(item.words, match, { spoken: true }) : allWrong(item.words);
      if (fromEnglish) recordItem(step, { activity: "say", patterns: match ? orderOutcome(match) : "wrong", words, help: hintUsed ? "answer" : "none", slip: match ? slipOfResult(match, { spoken: true }) : null });
      else recordItem(step, { activity: repeat ? "repeat" : "read-aloud", patterns: "met", words });
    };
    const showSetup = (reason, why) =>
      said.replaceChildren(
        ui.feedback(
          "hint",
          reason === "setup" ? "Set up speaking first" : "Speaking isn't available here",
          reason === "setup"
            ? "This browser has no recognizer of its own. Whisper can listen on this device once its model is downloaded: Settings, Study, Speaking."
            : `${why ?? "This browser can't recognize speech and can't run Whisper."} Try another browser, or press Can't speak now.`,
        ),
      );

    async function listen() {
      if (current.answered || listener || preparing) return;
      voice.stopSpeaking();
      mic.lxState("asking");
      status.textContent = SAY_STATUS.asking;
      const choice = await chooseEngine();
      if (current.step !== shown || current.answered) return;
      if (!choice.engine) {
        // Nothing can listen here: no later plan offers a card Say it (deck.js), as Study's tile stops offering the game.
        if (choice.reason !== "setup") setSpeechHearing(false);
        mic.lxState(null);
        status.textContent = ready;
        return showSetup(choice.reason, choice.why);
      }
      if (choice.engine === "whisper") {
        // Whisper goes into memory first; only then is the microphone asked for.
        preparing = true;
        mic.lxState("loading");
        status.textContent = loadingText(0);
        try {
          await readyWhisper(choice, (seconds) => current.step === step && (status.textContent = loadingText(seconds)));
        } catch (error) {
          preparing = false;
          mic.lxState(null);
          if (current.step !== shown) return;
          status.textContent = error?.message ?? "Whisper couldn't start. Try again, or use the browser's recognizer.";
          if (error?.code === "model-missing") showSetup("setup");
          return;
        }
        preparing = false;
        if (current.step !== shown || current.answered) return;
      }
      try {
        listener = choice.api.listen({
          engine: choice.engine,
          model: choice.model,
          expected,
          accept: variants.map((one) => one.text),
          readings: readingsOf(item),
          lang: learningLocale(),
          onState: (state) => {
            mic.lxState(state);
            if (SAY_STATUS[state]) status.textContent = SAY_STATUS[state];
          },
          onLevel: (level) => mic.lxLevel(level),
        });
        current.stopListening = () => listener?.cancel();
        const result = await listener.done;
        listener = null;
        mic.lxState(null);
        if (current.step !== shown) return;
        // Right on the sentence with its subject said or left out: shown on the sentence as written. Not right on it: heard again
        // against the sentence itself, so what's shown and recorded is never a variant's half-match.
        const heardAs =
          subjectsAsWritten(result.match, variants, item) ??
          choice.api.match(expected, result.alternatives?.length ? result.alternatives : [result.heard ?? ""], { lang: choice.api.languageCode(learningLocale()), readings: readingsOf(item) });
        judged(heardAs, result.heard, choice);
      } catch (error) {
        listener = null;
        mic.lxState(null);
        if (current.step !== shown) return;
        status.textContent = error?.code === "aborted" ? ready : error?.message ?? "Something went wrong while listening. Try again.";
        if (error?.code === "model-missing") showSetup("setup");
      }
    }

    function judged(match, heard, choice) {
      tries++;
      const ok = word ? saidRight(match) : match.ok;
      const settled = ok || tries >= 3;
      // A word game's word is its answer: until it's settled, only what was heard, never the word written out (a sentence shows its words).
      const heardLine = el("p", { class: "lx-small lx-muted" }, heard ? `Heard: “${heard}”` : "Heard nothing clear.");
      said.replaceChildren(...(word && !settled ? [heardLine] : [ui.saidLine(match.words), heardLine]));
      recordSay(match, heard);
      const via = choice.fellBack ? ` (with ${choice.engine === "browser" ? "the browser's recognizer" : "Whisper"}: the one you chose can't listen here)` : "";
      const about = word ? { line: aboutWord, about: aboutWord } : aboutOf(item);
      if (settled) status.textContent = "";
      // A word has no sentence under its answer to play: the word itself, as Pick the word's answer does.
      if (word && (ok || tries >= 3) && settings.listening.answers) afterAnswerSound(() => sayAnswer());
      if (ok) {
        const first = tries === 1;
        finishStep(first ? (hintUsed ? "hint" : "right") : "wrong", {
          feedbackMeaning: first && hintUsed ? "hint" : "right",
          title: first ? (hintUsed ? "Right, with a hint" : "Right") : `Right, on try ${tries}`,
          text: `${about.line}${via}`,
          item: word ? undefined : item,
          literal: !word && s.literal && settings.right.literal,
          answer: heard || undefined,
          ...cardLearn(),
        });
      } else if (tries < 3) {
        // Say the word has nothing to listen to (its English is the question); every other plays it again.
        const again = word && !repeat ? "Not quite. Try again." : "Not quite. Listen, then try again.";
        status.textContent = `${tries === 1 ? again : "Not quite. One more try."}${via}`;
        if (settings.listening.answers) (model ?? listening)?.[model ? "lxPlay" : "play"]();
      } else {
        finishStep("wrong", { feedbackMeaning: "wrong", title: "Here's how it sounds", text: word ? `${aboutWord}${via}` : `Listen, then say it along with the recording.${via}`, item: word ? undefined : item, literal: word ? false : s.literal, answer: heard || undefined, ...cardLearn() });
      }
    }

    const hint = ui.button(quiet(`Hint: ${learningName()} order`, { gives: true }), {
      variant: "fade",
      icon: "bulb",
      onclick: () => {
        if (current.answered || hintUsed || !hintLine) return;
        hintUsed = true;
        stepChange(() => {
          hintLine.removeAttribute("data-state");
          hint.remove();
        });
        hintLine.lxMorph();
        // Tinta points at the words the hint marks (the ones Dutch moves), in turn: the clue, never an answer.
        ui.pointCharacter(tinta, hintLine.querySelectorAll('[data-part="literal-chunk"][data-state="moved"]'));
      },
    });
    const skip = ui.button(quiet("I don't know"), {
      variant: "fade",
      icon: "skip",
      onclick: () => {
        if (current.answered) return;
        listener?.cancel();
        recordSay(null);
        if (word && settings.listening.answers) afterAnswerSound(() => sayAnswer());
        finishStep("wrong", { feedbackMeaning: "wrong", title: "Here's how it sounds", text: word ? aboutWord : aboutOf(item).about, item: word ? undefined : item, literal: word ? false : s.literal, skipped: true, ...cardLearn() });
      },
    });
    const cantSpeak = ui.button(quiet("Can't speak now"), {
      variant: "fade",
      icon: "mic-off",
      onclick: () => {
        if (current.answered) return;
        listener?.cancel();
        speechOff = true;
        putAside();
        renderStep();
      },
    });
    setBar(null, el("div", { class: "lx-answer-actions" }, fromEnglish && !word && s.hint && orderDiffers(item) ? hint : null, skip, cantSpeak, listening ? cantListen() : null));
  }

  function matchRound(step) {
    // Each word with its reading (a dictionary form with kanji or hanzi), shown by the same rule as a sentence's words.
    const phrases = step.phrases ?? [];
    // A pack's plain items (deck.js): any of your items can stand in a round.
    const items = step.items ?? [];
    // The sense it was taught in, short, never the whole dictionary line ("on; at; up; used up, finished, gone; …" for op): in every round, a
    // lesson's, a practice's and Match on its own (new-words.js matchEnglish; the round never holds two with the same: oneEnglishEach).
    const meant = (word) => matchEnglish(word);
    // The form it was taught in, not the dictionary's: a tile doesn't show a word you've never seen.
    const tileOf = (word) => {
      const thing = pathThing(`w:${word}`);
      return thing ? taughtForm(thing) : word;
    };
    const tileReading = (word, form) => (form === word ? READINGS[word] : readingOfForm(form));
    const pairs = [
      ...step.words.map((word) => {
        const form = tileOf(word);
        const reading = tileReading(word, form);
        return [reading ? { text: form, reading, hidden: readingHides(`w:${word}`) } : form, meant(word)];
      }),
      ...phrases.map((id) => [CHUNKS[id].text, CHUNKS[id].en]),
      ...items.map((item) => [item.text, item.means]),
    ];
    // Every tile stands for a unit: a word by its dictionary form (its tile may show the form it was taught in: ga for gaan), a phrase, a pack's
    // item. What's missed and what's recorded go by the unit, never by the text a tile shows.
    const row = (concept, outcome) => [{ concept, outcome, activity: "match", ...TESTS.match }];
    const units = [
      ...step.words.map((word) => ({ unit: `w:${word}`, nl: tileOf(word), en: meant(word), rows: (outcome) => row(`w:${word}`, outcome) })),
      ...phrases.map((id) => ({ unit: `c:${id}`, nl: CHUNKS[id].text, en: CHUNKS[id].en, rows: (outcome) => row(`c:${id}`, outcome) })),
      ...items.map((item) => ({ unit: item.unit, nl: item.text, en: item.means, rows: (outcome) => cardRows(item, { concept: item.unit, outcome, activity: "match", ...TESTS.match, item: item.unit.slice(2) }) })),
    ];
    const byTile = new Map(units.map((one) => [one.nl, one]));
    const byEnglish = new Map(units.map((one) => [one.en, one]));
    const missed = new Set();
    const recorded = new Set();
    // Each pair is recorded as it's answered, so a round left before its end (the session closed, the step swapped, the app gone) keeps what was
    // done. A unit once: wrong if it was in a miss, which is always before its own pair is joined.
    const answered = (one, outcome) => {
      if (!one || recorded.has(one.unit)) return;
      recorded.add(one.unit);
      const rows = one.rows(outcome);
      for (const each of rows) touched.add(each.concept);
      record(rows);
    };
    step.answers = Object.fromEntries(pairs.map(([nl, en]) => [typeof nl === "string" ? nl : nl.text, en]));
    const game = ui.matchGrid(pairs, {
      onTap: (text, side) => {
        if (side === "nl") sayTapped(text);
      },
      onPair: ({ ok, nl, en, matched, total }) => {
        // A pair joined climbs the key a step (match, step 1 on); the last its own; one that doesn't, match-miss.
        playSound(!ok ? "match-miss" : matched === total ? "match-last" : "match", ok ? { step: matched } : {});
        if (current.answered) return;
        if (ok) answered(byTile.get(nl), "right");
        else {
          // Both sides of a miss: the tile tapped, and the word whose English it was given.
          for (const one of [byTile.get(nl), byEnglish.get(en)]) {
            if (!one) continue;
            missed.add(one.unit);
            answered(one, "wrong");
          }
        }
      },
      onDone: ({ misses }) => {
        if (current.answered) return;
        // Every pair has been recorded as it was joined; nothing is left but to end the round.
        for (const one of units) answered(one, missed.has(one.unit) ? "wrong" : "right");
        finishStep(misses ? "wrong" : "right", {
          // Its words, the missed first; a pack's card among them opens as the card it is.
          learn: roundPage(
            units.map((one) => ({ ...one, page: one.unit.startsWith("k:") ? cardPage(items.find((item) => item.unit === one.unit) ?? { text: one.nl, means: one.en }, { unit: one.unit }) : null })),
            missed,
            { practice: drawerPractice },
          ),
          sound: false, // the last pair has just sounded
          feedbackMeaning: misses ? "wrong" : "right",
          title: misses ? `Matched, with ${misses} ${misses === 1 ? "miss" : "misses"}` : "All matched",
          // Each missed pair as the round showed it.
          text: misses ? `Missed: ${units.filter((one) => missed.has(one.unit)).map((one) => `${one.nl} (${one.en})`).join(", ")}` : null,
        });
      },
    });
    game.classList.add("lx-game");
    show(prompt(PROMPTS.match, null), el("div", { class: "lx-stack lx-reach" }, game));
    setBar(null, el("p", { class: "lx-small lx-muted" }, `Tap ${withArticle(learningName())} word, then its ${learningFromName()}.`));
  }

  // The way to study a step is, as Settings name them: a card is "cards", and a deck's step is its game.
  function wayOfStep(step) {
    const kind = step?.kind === "deck" ? step.game : step?.kind;
    return kind === "card" ? "cards" : kind;
  }

  // What a deck's steps need from the screen (deck-steps.js).
  const deckScreen = { show, setBar, prompt, finishStep, fit, settings, touched, results, sayTapped, afterAnswerSound, tileSounds, sayCard: (step) => drawSay(step, false), advance: () => advance(), current: () => current, index: () => index };

  // ---------- games that can't be played for now ----------

  // Can't listen now, Can't speak now, a game turned off here: this question and those after it become others on the same sentence or word. Nothing's counted
  // for the swap, and that sense isn't asked again in this session; what you've set for next time is Choose the games'. A new thing's first showing stays.
  let soundOff = false;
  let speechOff = false;
  const asideNow = () => {
    const include = getStudySettings().quick.include;
    const aside = new Set(Object.keys(include).filter((way) => !include[way]).map((way) => (way === "cards" ? "card" : way)));
    // Can't listen now: the games that are nothing without the sound (Type what it says too).
    if (soundOff) ["listen", "repeat", "hear-gap", "repeat-word"].forEach((kind) => aside.add(kind));
    if (speechOff) ["say", "repeat", "say-word", "repeat-word"].forEach((kind) => aside.add(kind));
    return aside;
  };
  // Practice this, from a concept's sheet: a few questions on it right after this one, then the session carries
  // on where it was. It doesn't end the session or start another. Returns how many went in; it says so in a toast that takes no presses.
  // New ones first (sentences the session hasn't got coming); then, to make up the few, this session's own questions on it, brought forward.
  // A concept's sheet over the session, on a sentence: the session waits under it, and nothing is graded.
  function showConcept(unit, item, answer, { name, line } = {}) {
    ui.closeWordPopover();
    // Keys belong to the sheet while it's up: Escape closes it and doesn't end the session.
    const onKeys = (event) => {
      event.stopPropagation();
      if (event.key !== "Escape") return;
      event.preventDefault();
      sheet.lxClose();
    };
    addEventListener("keydown", onKeys, true);
    const sheet = conceptSheet(unit, { item, sentence: item ? sentence(item) : undefined, answer, name, line, onClose: () => removeEventListener("keydown", onKeys, true), onPractice: () => practiceConcept(unit) });
    return sheet;
  }
  // ---------- something to learn after every answer (learn-more.js) ----------

  // The session's Practice this, for the drawer: a few questions on a unit right after this one; how many went in.
  const drawerPractice = { onPractice: (unit) => practiceConcept(unit) };
  // The drawer over the session: it waits under it, and nothing is graded.
  const showLearn = (page) => openLearn(page);
  /**
   * The "?" for a step's result: what its drawer opens on. learn: the game's own page (Match's round, a deck's card); else a question about one
   * word or phrase by itself (or What does it mean?, about one word of its sentence) opens that word, with the sentence it was in; else the
   * sentence. null when there's nothing the packs know to show.
   */
  function learnOf(step, { item, answer, learn }) {
    const lessonIdea = step?.idea ?? null;
    const page =
      learn ??
      (step?.kind === "meaning" && step.target && hasWordPage(`w:${step.target}`)
        ? wordPage(`w:${step.target}`, { item, practice: drawerPractice, lessonIdea })
        : !item && hasWordPage(step?.unit)
          ? wordPage(step.unit, { shown: step.text ?? null, practice: drawerPractice, lessonIdea })
          : item
            ? sentencePage(item, { answer, practice: drawerPractice, lessonIdea })
            : null);
    return page ? learnButton(() => showLearn(page), { page }) : null;
  }

  // The lesson's idea again (the session bar's Idea): on this step's sentence when it shows the idea, else the one it was met on.
  function openIdea() {
    const idea = plan.steps[index]?.idea;
    if (!idea) return;
    const here = plan.steps[index].item;
    const item = here?.concepts?.includes(idea.pattern) ? here : (itemById.get(idea.item) ?? here ?? null);
    // The lesson's own words for it: the parts met so far (the planner's idea.line), never a word not met yet.
    showConcept(`p:${idea.pattern}`, item, undefined, { name: idea.name, line: idea.line });
  }

  function practiceConcept(unit, few = 3) {
    const ahead = new Set(plan.steps.slice(index).map((step) => step.item?.id).filter(Boolean));
    const fresh = slipInSteps(unit, { have: ahead, count: few }).map((step) => stillPlayable(step)).filter(Boolean);
    const onIt = (step) => !step.slipped && step.item && sentenceUnits(step.item).includes(unit);
    const later = [];
    for (let i = index + 1; i < plan.steps.length && fresh.length + later.length < few; i++) if (onIt(plan.steps[i])) later.push(i);
    const brought = later.reverse().map((i) => plan.steps.splice(i, 1)[0]).reverse().map((step) => ({ ...step, slipped: unit }));
    const extra = [...fresh, ...brought];
    if (!extra.length) return 0;
    plan.steps.splice(index + 1, 0, ...extra);
    questions += fresh.length;
    notesReady([...new Set(extra.flatMap((step) => [step.item?.copyOf, step.item?.pack]).filter(Boolean))]).catch(() => {});
    updateProgress();
    const toasts = root.querySelector(".lx-session-toasts") ?? root.appendChild(el("div", { class: "lx-toasts lx-session-toasts", "aria-live": "polite" }));
    const said = ui.toast("new", practiceSaid(extra.length));
    toasts.replaceChildren(said);
    setTimeout(() => said.remove(), 2600);
    return extra.length;
  }
  function stillPlayable(step) {
    const aside = asideNow();
    if (!aside.has(step.kind === "deck" ? step.game : step.kind) || step.isNew || step.first || !plan.instead) return step;
    const other = plan.instead(step, aside);
    return other && { ...other, ...(step.again ? { again: true, tries: step.tries } : {}), ...(step.borrowed ? { borrowed: step.borrowed } : {}) };
  }
  function putAside() {
    for (let i = plan.steps.length - 1; i >= (current.answered ? index + 1 : index); i--) {
      const next = stillPlayable(plan.steps[i]);
      if (next) plan.steps[i] = next;
      else {
        if (!plan.steps[i].again) questions--;
        plan.steps.splice(i, 1);
      }
    }
  }
  function gamesChanged() {
    // On the summary the session is over and counted: there's nothing to swap, and nothing to count again.
    if (index >= plan.steps.length) return;
    const before = plan.steps[index];
    putAside();
    if (index >= plan.steps.length) return summary();
    if (plan.steps[index] !== before) renderStep();
    else updateProgress();
  }
  // An order step too tall for this screen at its tightest (fit): the sentence is asked the next way instead, the planner's own (plan.instead, as
  // Can't listen now has it), every game of tiles set aside (Put it in order, Listening's order, What does it say?: one of them in its place was
  // as tall, path-ja's longest at 320 × 568 as What does it say? 155 px over, 9 Nov 2026), so the next way has none (Type it, Which is right?,
  // Fill). Nothing of it has been placed, and it was never drawn. Its evidence is that game's. Once a step; with no other way (a deck's card, a
  // plan without one), it stays as it is.
  function askAnotherWay() {
    const step = plan.steps[index];
    if (!current?.ordering || current.answered || current.askedAnother || !plan.instead || !step) return;
    current.askedAnother = true;
    const other = plan.instead(step, new Set(["arrange", "listen", "translate"]));
    if (!other) return;
    plan.steps[index] = { ...other, ...(step.again ? { again: true, tries: step.tries } : {}), ...(step.borrowed ? { borrowed: step.borrowed } : {}) };
    renderStep();
  }

  // Nothing plays by itself from here on, though a speak button still does if you press it.
  function cantListen() {
    const button = ui.button(quiet("Can't listen now"), {
      variant: "fade",
      icon: "speaker-off",
      onclick: () => {
        if (current.answered) return;
        voice.stopSpeaking();
        soundOff = true;
        settings.listening.cards = false;
        settings.listening.answers = false;
        settings.listening.tapWords = false;
        settings.type.from = "english";
        const before = plan.steps[index];
        const heard = before.kind === "type" && root.querySelector(".lx-listen-row");
        putAside();
        if (plan.steps[index] !== before || heard) renderStep();
        else stepChange(() => button.remove());
      },
    });
    return button;
  }

  // ---------- flow ----------

  function renderStep() {
    const step = plan.steps[index];
    current?.stopListening?.();
    current = { answered: false };
    closeMeaning();
    // The last step's sentence stops when you move on.
    voice.stopSpeaking();
    // Which sentence is up (for automated checks; a step that hides the text, like Listening, can still be answered).
    if (step.item) root.setAttribute("data-item", step.item.id);
    else if (step.card) root.setAttribute("data-item", step.card.id);
    else root.removeAttribute("data-item");
    if (step.game) root.setAttribute("data-game", step.game);
    else root.removeAttribute("data-game");
    root.setAttribute("data-step", step.kind);
    root.lxStep = step; // what a check reads to answer it
    ideaButton.hidden = !step.idea;
    if (step.idea) ideaButton.setAttribute("aria-label", t("study.idea.againLabel", { name: step.idea.name }));
    if (step.target) root.setAttribute("data-target", step.target);
    else root.removeAttribute("data-target");
    updateProgress();
    if (step.kind === "deck") deckStep(step, deckScreen);
    // A Meet step is a lesson's idea (lesson.js makes none without one), on its card. A word or phrase met on a card of its own (ui.meetCard) is
    // gone: no plan made one (7 Nov 2026).
    else if (step.kind === "meet") ideaStep(step);
    else if (step.kind === "see") seeStep(step);
    else if (step.kind === "word") wordStep(step);
    else if (step.kind === "type-word") typeWordStep(step);
    else if (step.kind === "card") cardStep(step);
    else if (step.kind === "match") matchRound(step);
    else if (["say", "repeat", "say-word", "repeat-word"].includes(step.kind)) sayStep(step);
    else gameStep(step);
  }

  function advance() {
    if (index >= plan.steps.length) return;
    index++;
    if (index < plan.steps.length) renderStep();
    else summary();
  }

  let counted = false;
  function summary() {
    current = { answered: true, continue: () => finish() };
    // A finished session: the streak counts its day (done.js), once however often its summary is drawn, and the summary says what that made
    // (celebrate.js).
    if (!counted) {
      counted = true;
      if (plan.lesson) finishedLesson(plan.lesson.id);
      else if (plan.practice) finishedPractice();
      else if (mode === "game") finishedGame();
      else finishedSession();
      // Something worth keeping is on this device now: ask the browser to keep it (keep-here.js).
      keepStorage();
    }
    const moment = momentOf({ before: atStart.streak, after: streakNow(), wordsBefore: atStart.words, wordsAfter: wordsKnown() });
    // Whether the server can send reminders, asked while the summary's up, so the ask after its Done knows (finish).
    beforeReminderStep();
    updateProgress();
    const graded = results.filter((r) => r === "right" || r === "wrong");
    const right = graded.filter((r) => r === "right").length;
    const accuracy = graded.length ? Math.round((right / graded.length) * 100) : 0;
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const stat = (value, label, format) => {
      const strong = el("strong", {}, format(value));
      motion.countUp(strong, value, { format });
      return el("div", { class: "lx-stat" }, strong, el("span", {}, label));
    };
    // Patterns, then phrases, then words.
    const order = plan.lesson || plan.practice ? { c: 0, w: 1, p: 2, k: 3 } : { p: 0, c: 1, w: 2, k: 3 };
    // A lesson: what it taught. A practice: words and phrases; grammar's names mean little here, and Know has them.
    const concepts = [...touched].filter((unit) => (plan.lesson ? plan.lesson.units.includes(unit) : !plan.practice || !unit.startsWith("p:"))).sort((a, b) => (a[0] === b[0] ? a.localeCompare(b) : (order[a[0]] ?? 3) - (order[b[0]] ?? 3))).slice(0, 10);
    const rows = concepts.map((concept, i) => {
      const before = conceptState(concept, { until: startedAt });
      const after = conceptState(concept);
      const info = describe(concept);
      const short = info.kind === "word" ? shortMeaning(info.name) : "";
      const meaning = before.isNew ? "new" : after.level > before.level ? "right" : after.level < before.level ? "wrong" : undefined;
      const meter = ui.strengthMeter(before.level);
      ui.animateStrength(meter, before.level, after.level, { delay: 300 + i * 80 });
      const sessionRows = after.right + after.wrong - (before.right + before.wrong);
      const missed = after.wrong - before.wrong;
      return el(
        "div",
        { class: "lx-moved-row" },
        // A word with its gloss: the word as a card shows it (its reading while it's new).
        el("div", {}, ui.conceptTag(info.kind === "word" ? [shownName(concept), short ? ` · ${short}` : ""] : info.name, meaning)),
        el("span", { class: "lx-tally" }, sessionRows ? `${sessionRows - missed}/${sessionRows}` : "met"),
        meter,
      );
    });
    const again = plan.lesson
      ? ui.button("Practice", { variant: "gray", size: "lg", icon: "play", onclick: () => (location.hash = "#study/session/practice") })
      : plan.practice
        ? ui.button("Practice again", { variant: "gray", size: "lg", icon: "refresh", onclick: () => restart() })
        : ui.button("Study again", { variant: "gray", size: "lg", icon: "refresh", onclick: () => restart() });
    // Every few practices, one quiet row: the next lesson. Nothing more, and nothing waits on it.
    const study = plan.practice ? studyOverview() : null;
    const nextRow = (opts) => el("ul", { part: "list", class: "lx-next-lesson" }, ui.listRow(opts));
    const nudge = study?.suggest
      ? study.lesson && !study.writtenEnd
        ? nextRow({ icon: "play", title: "Ready for something new?", sub: study.lesson.name, href: "#study/session/lesson" })
        : nextRow({ icon: "compass", title: "Ready for something new?", sub: "See what's next", href: MORE_LESSONS })
      : // The last written lesson there is: a good moment, and what comes next.
        plan.lesson && !plan.lesson.worked && studyOverview().writtenEnd
        ? nextRow({ icon: "compass", title: `That was the last ${learningName()} lesson here`, sub: "See what's next", href: MORE_LESSONS })
        : null;
    const taught = plan.lesson ? plan.lesson.units.filter((unit) => touched.has(unit) && conceptState(unit, { until: startedAt }).isNew).length : 0;
    const done = ui.button("Done", { variant: "white", size: "lg", onclick: () => finish() });
    // The tally on a till receipt: a list of what you did, torn off at the foot.
    const tallied = [
      plan.lesson ? null : el("div", { class: "lx-stats" }, stat(accuracy, "right", (n) => `${Math.round(n)}%`), stat(plan.steps.length, "steps", (n) => String(Math.round(n))), stat(minutes, minutes === 1 ? "minute" : "minutes", (n) => String(Math.round(n)))),
      rows.length ? el("div", { class: "lx-stack" }, el("h3", { class: "lx-h3" }, plan.lesson && !plan.lesson.full ? "What you learned" : "What moved"), el("div", {}, rows)) : null,
    ].filter(Boolean);
    const tally = tallied.length ? el("div", { part: "session-tally" }, tallied) : null;
    if (tally) edge(tally, "receipt");
    // What a lesson taught, in a line. A lesson of one idea taught no words: it says what it taught.
    const taughtLine =
      plan.lesson && taught
        ? el("p", { class: "lx-muted" }, `${taught} new. They're yours now: they'll come up when you practice.`)
        : plan.lesson && !taught && plan.lesson.idea && !plan.lesson.units.length
          ? el("p", { class: "lx-muted" }, `New: ${plan.lesson.idea.name}. It'll come up when you practice.`)
          : null;
    // The summary is what the session gave you, and only that: the reminder ask comes after its Done, as a step of its own (finish).
    show(
      el(
        "section",
        { part: "session-summary", ...(plan.lesson ? { "data-kind": "lesson" } : plan.practice ? { "data-kind": "practice" } : {}) },
        el("h2", {}, plan.lesson?.full ? "Unit done" : plan.lesson ? "Lesson done" : plan.practice ? "Practice done" : accuracy >= 80 ? "Nicely done" : "Session done"),
        taughtLine,
        nudge,
        celebration(moment, { unit: Boolean(plan.lesson?.full) }),
        tally,
        // Once, on the first summary, where this browser's progress is about to be left behind (keep-here.js): an iPhone's browser before
        // the Home Screen app, another app's browser.
        ...[keepNoteOnce()].filter(Boolean),
      ),
    );
    setBar(null, el("div", { class: "lx-answer-actions" }, again, done));
  }

  // A summary's Done (and Enter there). The first time, "Want a reminder?" comes as a step of its own (shell/settings-reminders.js
  // reminderStep), shown once, in the session's own step change with its buttons in the bar, then out as Done goes. Every other time,
  // straight out. (Not a sheet over the page it goes back to: that page has its own moment after a session, Study's Tinta hopping onto the
  // new place, Home's throwing his drip into today's square.)
  function finish() {
    const bar = (...buttons) => setBar(null, el("div", { class: "lx-answer-actions" }, ...buttons));
    // Done's own press, when a finger or a pointer pressed it just now (not Enter): its second tap, in a double tap, is Done's too.
    const from = lastPress && performance.now() - lastPress.at < 1000 ? lastPress : null;
    const ask = reminderStep({ bar, done: () => end(), from });
    if (!ask) return end();
    // Enter goes on as Not now does: Turn on asks the system, so it waits for a press of its own.
    current = { answered: true, continue: ask.notNow };
    show(ask.node);
    bar(...ask.buttons);
  }

  function emptyPlan() {
    current = { answered: true, continue: () => end() };
    sessionBar.lxCount.textContent = "";
    show(ui.emptyState(plan.empty, { pose: plan.pose ?? "lounge" }));
    setBar(
      null,
      el(
        "div",
        { class: "lx-answer-actions" },
        plan.next ? ui.button(plan.next.label, { variant: "gray", size: "lg", block: true, onclick: () => (location.hash = plan.next.href) }) : null,
        ui.button("Back to Study", { variant: "white", size: "lg", block: true, onclick: () => end() }),
      ),
    );
  }

  // ---------- keys: Enter continues, numbers pick, Escape ends ----------

  const onKey = (event) => {
    // A sheet over the session (Choose the games, a word's meaning) makes the app under it inert: its keys are the sheet's, and this
    // document handler hears them before the sheet's own on the window.
    if (!root.isConnected || root.closest("[inert]") || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const typing = event.target instanceof HTMLElement && event.target.matches("input, textarea");
    if (event.key === "Escape" && !typing) {
      event.preventDefault();
      end();
    } else if (event.key === "Enter" && !typing) {
      if ((current?.answered || (current?.revealed && current?.continue)) && current.continue) {
        event.preventDefault();
        current.continue();
      } else if (current?.reveal && !current.revealed) {
        event.preventDefault();
        current.reveal();
      } else if (current?.check) {
        event.preventDefault();
        current.check();
      }
    } else if (!typing && /^[1-9]$/.test(event.key) && current && !current.answered) {
      if (current.pick) current.pick(Number(event.key) - 1);
      else if (current.grade && current.revealed && (event.key === "1" || event.key === "2")) current.grade(event.key === "2");
    }
  };
  document.addEventListener("keydown", onKey);

  let ended = false;
  function teardown(exit = "down") {
    if (ended) return false;
    ended = true;
    closeMeaning();
    document.removeEventListener("keydown", onKey);
    removeEventListener("resize", onScreen);
    globalThis.visualViewport?.removeEventListener("resize", onScreen);
    keysChange.disconnect();
    root.removeEventListener("focusout", beforeKeysGo, true);
    root.removeEventListener("pointerdown", rememberStep, true);
    document.removeEventListener("keydown", rememberStep, true);
    root.removeEventListener("pointerdown", notePress, true);
    document.fonts?.removeEventListener("loadingdone", facesIn);
    document.documentElement.removeAttribute("data-scroll-lock");
    voice.stopSpeaking();
    current?.stopListening?.();
    // Whatever was still on its way (a recognizer being chosen, Whisper loading) finds its step gone, and starts and records nothing.
    current = { answered: true };
    // Gone before it came (still waiting for its first step): nothing to move.
    if (held) {
      held = false;
      root.remove();
      return true;
    }
    // "now": the phone's own back already showed the page beneath (an iPhone's swipe from the edge), so the session goes in this frame. Sliding
    // it back down would bring the game back over the page the phone just showed, for as long as the slide lasts.
    if (exit !== "now" && motion.motionOn() && root.isConnected) {
      // The session itself moves (a copy of it would show what it keeps hidden, its answers): back down, the whole cover, as it came; or, beneath
      // the next session coming in from the right, a third to the left. Then gone. Nothing of it is read or takes a press meanwhile.
      root.setAttribute("data-ghost", "");
      root.inert = true;
      // Going back down it starts from rest (--ease-sheet-away), the page beneath brightening from the cover's dim in step. Beneath the next
      // session it keeps the sheet's curve, moving with the one coming in.
      const ease = exit === "push" ? undefined : motion.easingOf("--ease-sheet-away");
      if (exit !== "push") dimBeneath(root, DIM, 0, ease);
      motion.slide(root, [{ transform: "none" }, { transform: exit === "push" ? "translateX(-33%)" : "translateY(100%)" }], { duration: COVER_MS, fill: "forwards", ease, onEnd: () => root.remove() });
    } else root.remove();
    return true;
  }
  /**
   * push: another session comes in its place (from the right), so it goes beneath it instead of back down. now: gone in this frame, with no
   * move of its own (a back the phone has already animated).
   */
  function end({ push = false, now = false } = {}) {
    if (teardown(now ? "now" : push ? "push" : "down")) onExit?.();
  }
  function restart(next) {
    if (teardown("push")) onRestart?.(next);
  }

  if (plan.steps.length) renderStep();
  else emptyPlan();
  // Its one move, the first step drawn: up from the bottom (the page beneath dimming as it comes), or in from the right after the session before
  // it, or none ("now": the phone moved to it). A step drawn in this task moves at once; one still on its way (its pictures) is waited for, the
  // cover off the screen meanwhile.
  const away = entrance === "push" ? "translateX(100%)" : "translateY(100%)";
  // (Not if it went meanwhile: teardown takes a cover still held away with it.)
  const rise = () => {
    if (!held) return;
    held = false;
    root.style.removeProperty("transform");
    move();
  };
  const move = () => {
    if (!root.isConnected || root.hasAttribute("data-ghost")) return;
    // "now": the phone has already animated its own move to this session (an iPhone's swipe forward), so the session is simply there, with no
    // rise of its own after the phone's.
    if (entrance === "now") return void (arriving = false);
    if (entrance !== "push") dimBeneath(root, 0, DIM);
    motion.slide(root, [{ transform: away }, { transform: "none" }], { duration: COVER_MS, onEnd: () => (arriving = false) });
  };
  if (firstDrawn === null) move();
  else {
    held = true;
    root.style.transform = away;
    Promise.race([drawnFirst, new Promise((resolve) => setTimeout(resolve, FIRST_STEP_WAIT))]).then(rise);
  }
  return { element: root, end, plan };
}

