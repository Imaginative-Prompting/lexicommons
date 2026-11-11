// The reading screen: readersound's reader, on the design system. It opens over the Read tab the way a study session
// opens over Study (#read/book/<id>), and closing it lands back on your texts.
//
// What it keeps from readersound (its docs/design.md is the checklist):
// - Only one chapter is in the page at a time (its "chapter-windowed DOM"): every word is a span carrying its index
//   into the book's words, the address positions, lookups and the weave all use.
// - Zen is the resting state and the bars are visitors. A tap with the bars up puts them away; with them away, a tap
//   in the top or bottom sixth brings them back. The chevron top right does both and stays, dim, in zen.
// - Settings rise from behind the settings button with no shade; a tap anywhere else only closes them.
// - The text size is a slider (14–26 px), and resizing keeps the word you were reading where it was on the screen.
//   It's kept per language: the one a book is read in (its weave's or help's), else the book's own, each starting at
//   that language's default (reader.css: 24px where readings sit over the words).
// - Where you are is a word (the one 40% of the way down the screen, or the first on the page), saved as you read
//   and restored on open.
// - Pages (the default) or scroll: the Reader preset. In pages, the chapter is cut into whole-line pages (pages.js)
//   and a page turns with the Play Books curl: drag it, flick it, or tap the left third of the page to go back and
//   the rest to go on (with the bars away). The arrow keys and a sideways swipe on a trackpad turn too. The first page
//   you turn by hand puts the bars away. On a landscape or wide screen the pages come two side by side (a spread),
//   and the curl turns the whole spread.
// - The weave (a book with a woven layer): each word you know shows in the language you're learning, in English
//   order (book-format.js weaveSentence); a sentence you know most of shows whole, with its Dutch-order line under
//   it; "Dutch word order" shows the English in Dutch order first. Tap a Dutch word for its meaning: that's a miss
//   on it in your progress (once per word per sitting). Which words you know: bank.js.
// - Hold a word (hold.js): it's selected (a sentence shown whole is held whole, an idiom with its words), with
//   handles to widen it, and a toolbar with its other language and "→
//   Dutch" / "↩ English" to add it to your words or take it out, "Sentence", and Copy. A word you add shows its
//   English, small, over its next few times in the book (FADE_N); peeking at it again starts that over.
// - Translate (readersound's): with the weave (or a help book's help) off, the text is as written and holding words
//   still answers with their other language, from the book's layer; it counts nothing (nothing was shown to test).
// - A word's card and a sentence's card (readersound's): tap the held words' preview in the toolbar, More on a word's
//   meaning, or a word in Your words. A word's card: the word, its base form, hear it, its English here, how often
//   it's in this text, its sentence in both languages (and its word-order line), Your words, Ask your AI. A sentence's
//   card: the sentence in both languages, its word-order line, hear it, Copy.
// - Definitions (lex-books' lexicommons-definitions, kept with the layer): a word's meaning shows its first sense, its
//   card every sense with an example, and Define in the toolbar opens it; a book's own words, when it has definitions
//   of them, the same way (readersound's Define). Credited in About this book.
// - Full screen (readersound's), on a computer: a faint button bottom right while the bars are away.
// - Highlights and notes (readersound's): hold words, then Highlight or Note in the toolbar. A highlight is a wash over
//   its words with a ✦ in the margin by its last one, which opens its note (or takes it out); "Highlights and notes" in
//   the bar lists them by chapter. Kept on the device (highlights.js), anchored to the text's words.
// - Pinch zoom (readersound's): two fingers zoom the page itself, 1–4× about them, and it stays zoomed when they let
//   go; one finger moves it about, pinching back to 1× ends it. While it's zoomed nothing turns the page or starts a
//   hold, and a tap does only a word's meaning. The app never lets the browser zoom (theme-boot.js); this is the way
//   to look closer, at a picture too.
// - Search (readersound's, in Contents): every place a few words come in the whole text, case and accents aside
//   (search.js), each with its words around it and its chapter; a tap opens the text there and lights them up.
// - Suggested words: after a few new pages with nothing added, the next words to learn (woven-text.js learningOrder)
//   light up where they're still English; a tap says what one would become, and only "Add to Dutch" adds it.
// - Words you already know: a grid of the next words in that order, to tap the ones you know (or pass them over).
// - A book in the language you're learning, with your language as help (a "help" layer): every word as written, and a
//   word you don't know with its English small over it, or in its place ("in place": your words in the book's
//   language, the rest in English in its order). A tap on a word you know is a miss; on one you don't, just its
//   meaning.
// - A picture book (StoryWeaver's): each of its pages starts a page here, its picture over its text (two to a spread),
//   its line breaks kept, the pictures kept on the device; and at the end, "About this book" with every credit. Its
//   text is a size up (where the page is tall), its lines keep the book's breaks where they fit whole (from one that
//   doesn't, the paragraph flows on), and in pages its pages start below the top bar, each picture at the top as large
//   as fits with its text under it (a picture its text leaves too little room has a page to itself; on a spread then
//   every picture faces its text).
// Motion follows lx/motion.js: the bars and sheets change state at once and their slides are drawn by ghosts, so
// nothing ever moves under a press. A turn's sheet is a layer the pointer passes through, the page under it is
// already the one it reveals, and any press finishes a turn that's settling.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { dirFor, setLang } from "../lx/bidi.js";
import { icon } from "../lx/icons.js";
import * as motion from "../lx/motion.js";
import * as theme from "../lx/theme.js";
import { curlLayers, pageOf, paginate, paginateSpread, spreadFits, spreadPin, turnSession } from "./pages.js";
import * as store from "./store.js";
import { removeText } from "./text-inbox.js";
import { englishEnd, typeset, withArticle } from "../lang/index.js";
import { LANGUAGES, frameOf, gapBetween, helpSentence, layerCredit, literalLineOf, picturePath, weaveSentence, joinWords } from "./book-format.js";
import { FLIP_AT, FLIP_CHOICES, addNotYet, addWord, announce, bankEntry, bankWords, flipAtOf, inBank, knownIn, lemmaKey, notYet, onBankChange, removeWord, restartFade, setSuggestClock, studiedWords, suggestClock } from "./bank.js";
import { learningOrder } from "./woven-text.js";
import { WEAVE_LANGUAGES } from "./weave-languages.generated.js";
import { loadFrequency } from "../study/frequency.js";
import { createHold } from "./hold.js";
import { highlightsOf, newHighlight, onHighlightsChange, removedHighlightsOf, removeHighlight, RESTORE_DAYS, restoreRemoved, saveHighlight } from "./highlights.js";
import { fetchDefinitions, loadCatalog } from "./shelf.js";
import { SEARCH_MAX, searchIndex, searchWords, snippetOf } from "./search.js";
import { conceptState, readingHides, record } from "../study/progress.js";
import { mayRead, readingKind, readingOver, readingProblem, rubyOf, rubyText, vowelled } from "../lang/readings.js";
import { READINGS, contentLanguage } from "../study/content.js";
import { noteBook, writtenOf } from "../study/written.js";
import { speakWord } from "../study/voice.js";
import { learning } from "../study/learning.js";
import { askMenu } from "../ai/ask.js";
import { holdTranslateIndex, translate } from "../translate/translate.js";

const PREFS_KEY = "lx.reader.v1";
// The language help comes in (learningFrom() once help comes in other languages). The one you're learning is a setting
// (study/learning.js learning()), read as a book opens: the reader covers the app, so it can't change while you read.
const HELP_IN = "en";
// How many times a word you've just added shows its English over it (readersound's, from Burling).
const FADE_N = 6;
export const TEXT_SIZE = { min: 14, max: 26, step: 0.5 };
// How far down the screen the word you're reading is taken to be (readersound's anchor).
const ANCHOR = 0.4;

// The weave's own settings, per language you're learning.
// literal: a whole sentence's Dutch-order line, shown under it or on tap (opening it is evidence on its patterns).
// suggest: new pages with nothing added before words to learn light up (0: never); peekResets: looking a word up
// starts that count again (readersound's 5, and on).
// helpOn, help: a book in the language with your language's help: shown or not, and over the words or in place.
const WEAVE_DEFAULTS = { on: true, flipAt: FLIP_AT, order: false, tint: true, underline: true, literal: "shown", suggest: 5, peekResets: true, helpOn: true, help: "over" };
// How far the page zooms in (readersound's).
const ZOOM_MAX = 4;
// How long the words a search found stay lit up on the page.
const FOUND_MS = 1600;
// How many words light up at once, and how many "words you already know" are offered at a time (readersound's).
const SUGGEST_N = 12;
const KNOWN_SLOTS = 12;

export function readerPrefs() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") ?? {};
  } catch {
    // Private browsing: the defaults.
  }
  return { size: null, ...saved, sizes: { ...saved.sizes }, weave: { ...saved.weave } };
}
// A share this device kept that the setting no longer offers (95, the default before 10 Nov 2026) reads as today's default.
const weavePrefs = (prefs, lang) => {
  const kept = { ...WEAVE_DEFAULTS, ...prefs.weave[lang] };
  return { ...kept, flipAt: flipAtOf(kept.flipAt) };
};

/**
 * A size kept from before sizes were per language (prefs.size, one for every book): kept for every language you'd read
 * with it (each book you've opened, as it opens now), so nobody's size jumps; a language you hadn't read starts at its
 * own default. Once.
 */
async function migrateSize(prefs, learningNow) {
  if (!Number.isFinite(prefs.size)) return;
  const [books, places] = await Promise.all([store.listBooks().catch(() => []), store.getPositions().catch(() => new Map())]);
  let kept = 0;
  for (const book of books) {
    if (!places.has(book.id)) continue;
    const layer = await store.getWeave(book.id, book.lang === learningNow ? HELP_IN : learningNow).catch(() => null);
    const woven = (layer?.kind === "weave" || layer?.kind === "help") && layer.bookVersion === book.version;
    prefs.sizes[woven ? learningNow : (book.lang ?? "en")] ??= prefs.size;
    kept++;
  }
  // No book opened yet: the language you're learning, the one you'd have read in.
  if (!kept) prefs.sizes[learningNow] ??= prefs.size;
  delete prefs.size;
  saveReaderPrefs(prefs);
}

function saveReaderPrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private browsing: the size lasts for this visit.
  }
}

/**
 * One word of "Words you already know" (part known-word): the word, to tap if you know it, and × to pass it over.
 * onKnow(cell, lemma) and onNotYet(cell, lemma); state "known" is drawn on its way out.
 * Always the word as written, never with its reading (unlike Your words' rows): a tap marks it known, and a known word
 * shows as written in the reader, so the grid asks in that form (静か without しず, a word without its points).
 */
export function knownWordCell(lemma, { lang, onKnow, onNotYet, state } = {}) {
  const cell = el("div", { part: "known-word", state, "data-lemma": lemma });
  cell.append(
    el("button", { type: "button", class: "lx-known-yes", lang, "aria-label": `I know ${lemma}`, onclick: () => onKnow?.(cell, lemma) }, lemma, icon("check")),
    el("button", { type: "button", class: "lx-known-no", "aria-label": `Not yet: ${lemma}`, onclick: () => onNotYet?.(cell, lemma) }, icon("cross")),
  );
  return cell;
}

/** Whether a book has credits to show: its license asks for them, or a picture of it (its cover) carries one. */
const hasCredits = (book) => Boolean(book.rights?.attributionText || book.pictures?.some((picture) => picture.credit));

/** A book's chapters as paragraph and word ranges, and which words are italic. */
export function bookModel(book) {
  const { words, paras } = book;
  const chapters = book.chapters.map((chapter, ci) => {
    const p0 = chapter.para;
    const p1 = ci + 1 < book.chapters.length ? book.chapters[ci + 1].para : paras.length;
    return { title: chapter.title, p0, p1, word: paras[p0]?.s ?? words.length, end: p1 < paras.length ? paras[p1].s : words.length };
  });
  // A book without chapters (a picture book's story) reads as one, named after the book.
  if (!chapters.length) chapters.push({ title: book.title, p0: 0, p1: paras.length, word: 0, end: words.length });
  // Text before the first chapter (a book's opening, before its first heading) is a part of its own, named after the book, so it can be read.
  else if (chapters[0].p0 > 0 && (paras[chapters[0].p0]?.s ?? words.length) > 0) chapters.unshift({ title: book.title, p0: 0, p1: chapters[0].p0, word: 0, end: chapters[0].word });
  const italic = new Uint8Array(words.length);
  for (const [s, e] of book.italic ?? []) italic.fill(1, s, e);
  // A picture book's pages, by the word each starts at (a page of only a picture starts at the same word as the page after
  // it: both kept, in order), and where its lines break inside a paragraph.
  const pageAt = new Map();
  for (const page of book.pages ?? []) pageAt.set(page.s, [...(pageAt.get(page.s) ?? []), page]);
  const breaks = new Set(book.breaks ?? []);
  return { book, words, paras, chapters, italic, pageAt, breaks };
}

/** The chapter a word is in. */
export function chapterOfWord(model, i) {
  let lo = 0;
  let hi = model.chapters.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (model.chapters[mid].word <= i) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Opens the reader in `host`. Give it `bookId` (a text on this device) or, for a demo, `book` (a lexicommons-book,
 * nothing saved, opened at `word`, in `mode`, with `weave`, the lemmas you `know`, `highlights` ([{ start, end,
 * note }]) and `definitions` ({ layer?, book? }: lexicommons-definitions files)). onClose() when you leave it.
 * Returns { element, end(), setZen(on), showSheet(name) }.
 */
export function openReader(host, { bookId = null, book: given = null, word: givenWord = 0, mode: givenMode = null, weave: givenWeave = null, know = null, highlights: givenHighlights = null, definitions: givenDefinitions = null, onClose } = {}) {
  const demo = Boolean(given);
  // A book open holds Translate's index for its word lookups (its worker stays for its idle while you read); closing it leaves it, and
  // a minute on it goes (translate.js holdTranslateIndex). /design's demos never close, so they hold nothing.
  const leaveIndex = demo ? null : holdTranslateIndex();
  const prefs = readerPrefs();
  let model = null;
  let mounted = -1;
  let mountA = 0;
  let wordEls = [];
  let zen = false;
  let openSheet = null;
  let lastWord = 0;
  let saveTimer = 0;
  let ended = false;
  // Page mode: the chapter's pages, the one showing, a turn in progress, and the two covers hiding its neighbors.
  let mode = givenMode ?? (document.documentElement.getAttribute("data-reader") === "scroll" ? "scroll" : "pages");
  let pages = [];
  let disp = -1;
  // The pictures' heights the pages were cut for (pictureLanded).
  let cutHeights = "";
  let turn = null;
  let covers = [];
  // A drag's own click comes after it: that one isn't a tap.
  let swallow = false;
  // The weave: the book's woven layer (if it has one), the language it teaches, and the words looked up this sitting.
  let weave = null;
  // A person's translation beside the book (a parallel layer: never a weave, so the book reads as written), and where each of its
  // lines goes in: a word's index → the translation that follows the word before it (its sentence's last, else its page's).
  let parallel = null;
  let besideAt = new Map();
  // About this book is there for the book's own credits, and for a help, weave or translation it's read with that says who made it (a
  // classic woven in has no others; a learner's own text has none, and its weave a credit only if its maker gave one).
  const aboutShown = () => hasCredits(model.book) || Boolean(weave && layerCredit(weave)) || Boolean(parallel && layerCredit(parallel));
  let lang = learning();
  let sentenceAt = new Map();
  const lookedUp = new Set();
  let popover = null;
  // Each lemma's places in the book, in order (for the fade-in gloss), and a peek waiting to be laid out.
  let occurrences = new Map();
  let fadePending = false;

  // ---------- the screen ----------

  const titleNode = el("span", { part: "reader-title" });
  // What each opens, in its words (no marks to guess at); the way back, a pill naming where it goes (closing always lands on Read); the book's
  // title whole, on a line of its own under them.
  const contentsButton = el("button", { class: "lx-reader-action", type: "button", "aria-label": "Contents", "aria-expanded": "false", onclick: () => toggleSheet(contents) }, "Contents");
  const marksButton = el("button", { class: "lx-reader-action", type: "button", "aria-label": "Highlights and notes", "aria-expanded": "false", onclick: () => toggleSheet(marksSheet) }, "Notes");
  const topBar = el(
    "header",
    { part: "reader-bar", variant: "top" },
    ui.backButton({ aria: "Back to your texts", label: "Read", onclick: () => onClose?.() }),
    el("div", { class: "lx-reader-bar-end" }, marksButton, contentsButton),
    titleNode,
  );
  const flow = el("div", { class: "lx-reader-flow" });
  const text = el("main", { part: "reader-text", lang: "en", tabindex: "-1" }, flow);
  const collapse = el("button", { part: "reader-collapse", type: "button", "aria-label": "Hide the controls", "aria-pressed": "false", onclick: () => setZen(!zen) }, icon("chevron"));
  const gear = el("button", { part: "reader-settings-button", type: "button", "aria-label": "Reading settings", "aria-expanded": "false", onclick: () => toggleSheet(settings) }, icon("sliders"));
  // Full screen, on a computer (a fine pointer, and a browser that can): faint, bottom right, while the bars are away.
  const fullscreen =
    document.fullscreenEnabled && matchMedia("(hover: hover) and (pointer: fine)").matches
      ? el("button", { part: "reader-fullscreen", type: "button", "aria-label": "Full screen", "aria-pressed": "false", onclick: () => toggleFullscreen() }, icon("expand"), icon("contract"))
      : null;
  const settings = ui.sheet({ label: "Reading settings", onClose: (options) => closeSheet(options) });
  const contents = ui.sheet({ label: "Contents", onClose: (options) => closeSheet(options) });
  const marksSheet = ui.sheet({ label: "Highlights and notes", onClose: (options) => closeSheet(options) });
  const noteSheet = ui.sheet({ label: "Note", onClose: (options) => closeSheet(options) });
  const cardSheet = ui.sheet({ label: "Word", onClose: (options) => closeSheet(options) });
  const status = el("div", { part: "reader-status", "aria-live": "polite" });
  const turnLayer = el("div", { part: "reader-turn", "aria-hidden": "true", hidden: true });
  const root = el("div", { part: "reader", role: "dialog", "aria-label": "Reader", "data-mode": mode }, text, turnLayer, status, topBar, collapse, gear, fullscreen, settings, contents, marksSheet, noteSheet, cardSheet);
  host.append(root);
  if (!demo) document.documentElement.setAttribute("data-scroll-lock", "");
  flow.append(el("p", { class: "lx-reader-note" }, "Opening…"));

  // ---------- full screen ----------

  // Whether this reader put the page in full screen (leaving the reader takes it out again then).
  let wentFullscreen = false;
  function toggleFullscreen() {
    // The change event follows; the button says so as soon as the browser has done it.
    if (document.fullscreenElement) document.exitFullscreen().then(() => onFullscreen(), () => {});
    else {
      wentFullscreen = true;
      document.documentElement.requestFullscreen().then(() => onFullscreen(), () => (wentFullscreen = false));
    }
  }
  const onFullscreen = () => {
    const on = Boolean(document.fullscreenElement);
    if (!on) wentFullscreen = false;
    root.toggleAttribute("data-fullscreen", on);
    fullscreen?.setAttribute("aria-pressed", String(on));
    fullscreen?.setAttribute("aria-label", on ? "Leave full screen" : "Full screen");
  };
  if (fullscreen) document.addEventListener("fullscreenchange", onFullscreen);

  // ---------- the bars: zen is the resting state ----------

  const shifted = (rect, dy) => new DOMRect(rect.left, rect.top + dy, rect.width, rect.height);
  function setZen(on, { animate = true } = {}) {
    if (on === zen) return;
    if (on) {
      // Ghosts slide the bars away; the real ones are gone at once.
      if (animate) {
        motion.leave(topBar, { dx: 0, dy: -topBar.offsetHeight });
        motion.leave(gear, { dx: 0, dy: gear.offsetHeight + 32 });
      }
      closeSheet({ animate });
      root.setAttribute("data-state", "zen");
    } else {
      // The real bars are back and pressable at once; ghosts slide in over them.
      root.removeAttribute("data-state");
      if (animate) {
        const top = topBar.getBoundingClientRect();
        motion.fly(topBar, shifted(top, -top.height));
        const button = gear.getBoundingClientRect();
        motion.fly(gear, shifted(button, button.height + 32));
      }
    }
    zen = on;
    collapse.setAttribute("aria-pressed", String(on));
    collapse.setAttribute("aria-label", on ? "Show the controls" : "Hide the controls");
  }

  // The tap grammar, for taps that land on the page rather than on a control.
  function pageTap(event) {
    // Zoomed in, a tap on the page does nothing (a word's meaning is still a tap away).
    if (zoomed()) return;
    const r = root.getBoundingClientRect();
    const y = event.clientY - r.top;
    if (!zen) return setZen(true);
    if (y < r.height / 6 || y > (r.height * 5) / 6) return setZen(false);
    // The middle of the page: in pages, the left third goes back and the rest goes on (mirrored right to left).
    const x = rtl() ? r.right - event.clientX : event.clientX - r.left;
    if (mode === "pages") turnBy(x < r.width * 0.35 ? -1 : 1);
  }
  root.addEventListener("click", (event) => {
    if (swallow) {
      swallow = false;
      return;
    }
    if (event.target.closest("button, a, input, label, [data-part='sheet'], [data-part='word-popover']")) return;
    const woven = event.target.closest('[data-part="woven-word"], [data-part="reader-word"], [data-part="reader-help"]');
    if (woven && flow.contains(woven)) return lookUp(woven);
    const own = looksUpOwn() ? event.target.closest(".lx-w") : null;
    if (own && flow.contains(own) && plainWord(own.textContent)) return lookUpOwn(own);
    const suggestion = event.target.closest('[data-part="reader-suggestion"]');
    if (suggestion && flow.contains(suggestion)) return offer(suggestion);
    pageTap(event);
  });
  // A new press starts a new gesture: a drag's leftover flag must never eat it (iPhone sends no click after a drag).
  // And a turn that's still settling finishes at once, so the press lands on the page it's revealing.
  root.addEventListener(
    "pointerdown",
    () => {
      swallow = false;
      if (turn?.ending) turn.finish();
    },
    true,
  );

  // ---------- sheets ----------

  // A tap outside a word's meaning only closes it (capture phase, so it does nothing else), like a sheet.
  root.addEventListener(
    "click",
    (event) => {
      if (!popover || popover.contains(event.target)) return;
      event.stopPropagation();
      event.preventDefault();
      closePopover();
    },
    true,
  );
  // A tap outside an open sheet only closes it (capture phase, so it does nothing else). Its own button toggles it.
  root.addEventListener(
    "click",
    (event) => {
      if (!openSheet || openSheet.contains(event.target)) return;
      if ([gear, contentsButton, marksButton].includes(event.target.closest("button"))) return;
      event.stopPropagation();
      event.preventDefault();
      closeSheet();
    },
    true,
  );
  // Each sheet's button (a note has none: its ✦ or the toolbar opens it).
  const buttonFor = (sheet) => new Map([[settings, gear], [contents, contentsButton], [marksSheet, marksButton]]).get(sheet) ?? null;
  /** A sheet's button: it opens its sheet, and with any sheet open it closes that one (the others' buttons too). */
  function toggleSheet(sheet) {
    if (openSheet) return closeSheet();
    closeSheet({ animate: false });
    // A drawer coming up ends what's held and a word's meaning (they'd sit over it otherwise).
    hold.cancel();
    closePopover();
    if (sheet === contents) buildContents();
    else if (sheet === marksSheet) {
      buildMarks();
      loadRemoved();
    }
    else buildSettings();
    openSheet = sheet;
    buttonFor(sheet)?.setAttribute("aria-expanded", "true");
    sheet.lxShow();
  }
  // options: as a sheet's onClose gives them (where a drag let go of it), so its slide carries on from the finger.
  function closeSheet({ animate = true, ...slide } = {}) {
    if (!openSheet) return;
    knownDone();
    // A note being written is kept however its sheet closes.
    if (openSheet === noteSheet) keepNote();
    openSheet.lxHide({ animate, ...slide });
    buttonFor(openSheet)?.setAttribute("aria-expanded", "false");
    openSheet = null;
  }

  // ---------- the text ----------

  function navRow(ci, direction) {
    const title = model.chapters[ci].title;
    return el(
      "button",
      { part: "reader-chapter-nav", variant: direction, type: "button", onclick: () => goToChapter(ci) },
      direction === "prev" ? [icon("back") /* not a way back: the chapter before */, title] : [title, icon("chevron")],
    );
  }

  /** Puts one chapter in the page (the only one there). */
  function mountChapter(ci) {
    ci = Math.max(0, Math.min(model.chapters.length - 1, ci));
    if (ci === mounted) return;
    hold?.cancel();
    dropTurn();
    pages = [];
    disp = -1;
    const chapter = model.chapters[ci];
    const { words, paras, italic } = model;
    mounted = ci;
    mountA = chapter.word;
    wordEls = new Array(chapter.end - chapter.word);
    const frag = document.createDocumentFragment();
    if (ci > 0) frag.append(navRow(ci - 1, "prev"));
    for (let pi = chapter.p0; pi < chapter.p1; pi++) {
      const para = paras[pi];
      if (para.k === "scene") {
        frag.append(el("div", { part: "reader-scene", role: "separator" }, "* * *"));
        continue;
      }
      if (para.e <= para.s) continue;
      const heading = para.k === "h";
      const node = document.createElement(heading ? "h2" : "p");
      // A line of verse (or a sign): one per paragraph, set close together.
      if (para.k === "v") node.setAttribute("data-part", "reader-verse");
      if (heading) {
        node.setAttribute("data-part", "reader-heading");
        // A heading's second line (the chapter's title under "Chapter 3").
        if (paras[pi - 1]?.k === "h" && pi > chapter.p0) node.setAttribute("data-variant", "title");
        // A chapter's number alone over its title ("I", "12"): set as a number (reader.css), or a lone "I" reads as a stray bar.
        else if (paras[pi + 1]?.k === "h" && /^(?:[IVXLCDM]+|\d+)\.?$/i.test(words.slice(para.s, para.e).join(" ").trim())) node.setAttribute("data-variant", "number");
      }
      // A picture book's page starts here: its picture over it (or, with none, this paragraph starts the page). A page
      // of only a picture comes first, and the page after it starts with this paragraph.
      for (const bookPage of model.pageAt.get(para.s) ?? []) {
        const picture = bookPage.picture != null ? model.book.pictures?.[bookPage.picture] : null;
        if (picture) frag.append(pictureFigure(picture));
        else node.setAttribute("data-page-start", "");
      }
      if (besideShown()) frag.append(...besideParts(node, para));
      else {
        renderWords(node, para);
        frag.append(node);
      }
    }
    if (ci + 1 < model.chapters.length) frag.append(navRow(ci + 1, "next"));
    else if (aboutShown()) frag.append(credits({ inFlow: true }));
    // In pages, these hide the lines above and below the page showing.
    covers = [el("div", { class: "lx-reader-cover" }), el("div", { class: "lx-reader-cover" })];
    frag.append(...covers);
    // A chapter's first page starts clear of the top bar, which is up when a text opens (reader.css). A block, so it's
    // measured with the page (pages.js); a picture book's pages leave that room anyway.
    // Room for the top bar over a first line that's plain text: a heading has its own (and starts a page, so this would be a page
    // by itself), and so does a book's page.
    if (!model.book.pages?.length && !frag.querySelector(".lx-w")?.closest('[data-part="reader-heading"]')) {
      frag.prepend(el("div", { class: "lx-reader-top-room", "data-atom": "", "aria-hidden": "true" }));
    }
    flow.replaceChildren(frag);
    reflowBreaks();
    paintSuggestions();
    paintHighlights();
  }

  // ---------- the words, woven ----------

  // The book's language, and the space after word g as the book has it: none where tokenize() split two words written
  // together ("it—but"), the language's own before a mark it spaces (French "viens ?"), else its separator.
  const bookLang = () => model?.book?.lang ?? "en";
  // A book in a right-to-left language reads, and turns, right to left: its page is dir="rtl" (open), a spread's
  // first page is on the right, and every left and right of a turn (taps, keys, the wheel, a drag, the curl) mirrors.
  const rtl = () => dirFor(bookLang()) === "rtl";
  const gapAfter = (g) => gapBetween(model.words[g], model.words[g + 1], bookLang());
  // A run of the book's words as text, as the page shows them (copy, previews, headings).
  const bookText = (list) => joinWords(list, LANGUAGES[bookLang()]?.separator ?? " ", bookLang());
  const wordSpan = (g, text) => {
    const span = document.createElement("span");
    span.className = model.italic[g] ? "lx-w lx-it" : "lx-w";
    span.dataset.i = g;
    span.textContent = `${typeset(bookLang(), text)}${gapAfter(g)}`;
    wordEls[g - mountA] = span;
    return span;
  };
  const wovenSpan = (piece, attrs = {}) => {
    // A word running the other way from the page is its own isolate (an element with dir), so a number or mark after
    // it stays in the page's run. el() gives a right-to-left word its dir; a left-to-right one in a right-to-left book
    // says "ltr".
    const dir = dirFor(lang) !== dirFor(bookLang()) ? dirFor(lang) ?? "ltr" : undefined;
    const span = el("span", { part: "woven-word", lang, dir, "data-i": piece.i, "data-lemma": piece.lemma ?? undefined, "data-nl": piece.text, ...attrs }, typeset(lang, piece.text));
    if (piece.lemma && lookedUp.has(lemmaKey(piece.lemma))) span.setAttribute("data-state", "looked-up");
    return span;
  };

  // ---------- a language written in characters (Japanese, Chinese) ----------
  // A word's reading (lang/readings.js) sits over its kanji or characters until you know the word well (Study's own rule,
  // progress.js readingHides: its read strength Strong), and a tap shows it again; a word with no lemma (a name) always shows it. Japanese-order lines
  // run their words together, a line breaking only between two words; an English word among them takes English
  // punctuation and a narrow gap (reader.css). Only readings over a word (kana, pinyin) take room over the line; vowel
  // marks (Arabic, Hebrew, Latin's macrons) sit on the word itself.
  const readingsHere = () => readingOver(lang);
  // Vowel marks (Arabic, Hebrew, Latin's macrons) are on the word itself: the word as it's said, in its place.
  const vowelsHere = () => readingKind(lang) === "vowels";
  // The reading a tap's popover shows under the word (data-reading): vowel marks only when they change the word (one
  // that adds none, or doesn't fit, would repeat it); other kinds as they are.
  const popReading = (text, reading) => (reading && vowelsHere() && vowelled(lang, text, reading) === text ? null : reading);
  const joinedHere = () => LANGUAGES[lang]?.separator === "";
  const readingKnown = (lemma) => Boolean(lemma) && readingHides(`w:${lemmaKey(lemma)}`, { lang });
  /** A word's text with its reading over each run of kanji or characters (hidden, in place, once the word is known well: readingHides). */
  function readingNodes(text, reading, lemma) {
    // The word with its vowel marks until you know it well, then as written, a tap bringing them back (ui.showReading); a
    // reading that doesn't fit the word leaves it as written (vowelled).
    if (vowelsHere()) {
      const marked = reading ? vowelled(lang, text, reading) : text;
      if (marked === text) return [typeset(lang, text)];
      return [el("span", { part: "reading", variant: "vowels", state: readingKnown(lemma) ? "hidden" : undefined }, typeset(lang, marked)), el("span", { class: "lx-bare" }, typeset(lang, text))];
    }
    // A reading the word may carry (mayRead): kanji or hanzi, or a Yiddish word's romanization.
    if (!reading || !mayRead(lang, text)) return [typeset(lang, text)];
    const hidden = readingKnown(lemma);
    return rubyOf(lang, text, reading).map(([piece, rt]) => (rt ? el("ruby", {}, piece, el("rt", { part: "reading", state: hidden ? "hidden" : undefined }, rubyText(rt))) : piece));
  }
  /** A word you've just added: its English under it, since the reading has the space over it (no underline then). */
  const englishUnder = (nodes, english) => el("ruby", {}, ...nodes, el("rt", { part: "reader-gloss", state: "under" }, english));
  // An English word in a Japanese-order line, or the line under one, takes English punctuation.
  const ENGLISH_MARKS = { "、": ",", "，": ",", "。": ".", "？": "?", "！": "!", "：": ":", "；": ";", "「": "“", "」": "”", "『": "‘", "』": "’", "（": "(", "）": ")" };
  /** A word's English as it's drawn under the word, in a book written in characters: without that writing's marks at its edges. The layer's
   * file keeps the word's own 。、！？ on its English (the format asks a gloss to), and the word over it shows them already. */
  const bareGloss = (text) => text.replace(/^[、，。？！：；「」『』（）…]+|[、，。？！：；「」『』（）…]+$/gu, "") || text;
  const englishMarks = (text) => text.replace(/[、，。？！：；「」『』（）]/gu, (mark) => ENGLISH_MARKS[mark]);
  /** A sentence's literal line as the reader shows it: for a language written without spaces, English marks and no
   * moved words (nearly every word moves there, so the order switch shows it instead). */
  /** The language's own end mark (not English's) at the end of a chunk, with any closing quotes after it. */
  function ownEnd(text) {
    const marks = (LANGUAGES[lang]?.ends ?? []).filter((mark) => !/^[.!?…:;]+$/u.test(mark));
    if (!marks.length) return null;
    const ends = marks.map((mark) => mark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    return text.match(new RegExp(`(${ends})([”’"')\\]»]*)$`, "u"));
  }
  function literalOf(sentence) {
    // The sentence as said, for its end: ui.literalLine writes it as English (lang/index.js englishEnd: an Armenian
    // question, its ՞ inside a word, ends with ?). A help layer's is the book's own words.
    const said = weave?.kind === "help" ? model.words.slice(sentence.s, sentence.e).join(" ") : sentence.text;
    const line = { ...literalLineOf(sentence.m), text: said };
    if (!joinedHere()) {
      // An end in the language's own mark (Armenian's ։, Hindi's ।, Arabic's ؟) is still on the last English chunk
      // (book-format lifts English's marks only: "going։", «Go։»), or is a chunk of its own (Hindi's "चल ।"): it comes
      // off as the line's end, in English, a closing quote after it kept and any English mark before it gone.
      const k = line.literal.length - 1;
      const found = !line.punct && k >= 0 ? ownEnd(line.literal[k].text) : null;
      if (!found) return line;
      const before = line.literal[k].text.slice(0, found.index).trimEnd().replace(/[.!?…:;]+$/u, "").trimEnd();
      // A chunk that was only the mark goes, and an English mark on the chunk before it with it ("Go." then "।").
      const kept = line.literal.slice(0, -1);
      const prev = kept[kept.length - 1];
      const literal = before ? [...kept, { ...line.literal[k], text: before }] : prev ? [...kept.slice(0, -1), { ...prev, text: prev.text.replace(/[.!?…:;]+$/u, "") }] : kept;
      const english = before || !Array.isArray(line.english) ? line.english : line.english.filter((i) => i !== k);
      return { ...line, literal, english, punct: englishEnd(lang, found[1], said) + found[2] };
    }
    return { ...line, literal: line.literal.map((chunk) => ({ ...chunk, text: englishMarks(chunk.text), moved: false })), punct: englishMarks(line.punct) };
  }
  const weaveOn = () => Boolean(weave) && (weave.kind === "help" ? weavePrefs(prefs, lang).helpOn : weavePrefs(prefs, lang).on);
  // A help layer's English for each word of the book.
  let glossAt = new Map();
  // What counts as known this sitting: taken once (bank.js knownIn), so a word you peek at keeps showing.
  let knownNow = null;
  let knownLang = null;
  const known = (lemma) => {
    if (know) return know.has(lemma);
    if (knownLang !== lang) {
      knownNow = knownIn(lang);
      knownLang = lang;
    }
    return knownNow(lemma);
  };

  /** The English to show over a word you've just added, at word i (or null once it's faded). */
  function fadeGloss(lemma, i) {
    const entry = bankEntry(lang, lemma);
    if (!entry || entry.book !== model.book.id || entry.at == null || i < entry.at) return null;
    const places = occurrences.get(lemmaKey(lemma)) ?? [];
    const since = places.filter((p) => p >= entry.at && p <= i).length;
    return since <= FADE_N ? model.words[i] : null;
  }

  /** A picture book's line break before word g (never at a paragraph's start). */
  const lineBreak = (node, g, para) => {
    if (g !== para.s && model.breaks.has(g)) node.append(el("br"));
  };

  // ---------- a picture book's pictures ----------

  // Each picture's URL, once: the copy kept on the device (a blob: URL), else the library's.
  const pictureUrls = new Map();
  const pictureUrl = (file) => {
    if (!pictureUrls.has(file)) {
      pictureUrls.set(
        file,
        (demo ? Promise.resolve(null) : store.getPicture(file).catch(() => null)).then((blob) => (blob ? URL.createObjectURL(blob) : `/library/${picturePath(file)}`)),
      );
    }
    return pictureUrls.get(file);
  };
  /** A page's picture, sized before it arrives (its width and height), so a page is laid out the same either way. */
  function pictureFigure(picture) {
    const img = el("img", { alt: picture.alt, width: picture.w, height: picture.h, decoding: "async", draggable: "false" });
    // The attributes alone don't size it everywhere: Safari leaves an image with no source yet at its alt text's
    // height, so pages cut before it arrived were wrong once it did (a picture half off the top of its page).
    if (picture.w > 0 && picture.h > 0) img.style.aspectRatio = `${picture.w} / ${picture.h}`;
    img.addEventListener("load", pictureLanded);
    img.addEventListener("error", pictureLanded);
    pictureUrl(picture.file).then((url) => {
      if (!ended) img.src = url;
    });
    return el("figure", { part: "reader-picture", "data-atom": "", "data-page-start": "" }, img);
  }
  const pictureHeights = () => [...flow.querySelectorAll('[data-part="reader-picture"]')].map((figure) => figure.offsetHeight).join();
  // A picture that lands at another height than the pages were cut for (a broken one, a browser that sizes it some
  // other way) cuts them again, keeping your page; never under a turning page.
  let landedFrame = 0;
  function pictureLanded() {
    if (landedFrame || ended) return;
    landedFrame = requestAnimationFrame(() => {
      landedFrame = 0;
      if (ended || mode !== "pages" || !pages.length || pictureHeights() === cutHeights) return;
      if (turn) return void setTimeout(pictureLanded, 300);
      relayout(lastWord);
    });
  }

  // In pages, the pictures are sized for the page: each at its top, as large as fits with its text under it. On a short screen
  // (an iPhone SE in Safari, its glossed lines tall) a picture shrinks to share its page with its words, down to its least: 40%
  // of the room it has alone, and never under 72 px. Words that don't all fit even then keep as many whole paragraphs as
  // do under it, the rest starting the next page: a picture has a page of its own only when not even its first paragraph
  // fits (7 Nov: "De rode regenjas" ran to 16 pages on Safari's SE, four of them a picture alone).
  // On a spread a text that would leave its picture less than half the room it has alone makes the whole book face
  // (each picture on the left, its text on the right), so a picture is never parted from its text by a turn. In
  // scroll, the CSS sizes them.
  const FIT_SHARE = 0.4;
  const PICTURE_LEAST = 72; // px
  const SPREAD_SHARE = 0.5;
  /** A picture book's lines as the book breaks them, where each fits the page whole. From a line that wraps, its
   * paragraph flows on as one (its breaks put away), so no line ends on a word a break left behind. */
  function reflowBreaks() {
    for (const br of flow.querySelectorAll("br[data-flow]")) br.removeAttribute("data-flow");
    if (!model?.breaks?.size) return;
    for (const p of flow.querySelectorAll("p")) {
      if (!p.querySelector(":scope > br")) continue;
      // A wrap moves a word down a whole line; a gloss over a word moves it less than half of one.
      const half = (parseFloat(getComputedStyle(p).lineHeight) || 30) / 2;
      let top = null;
      let wrapped = false;
      for (const node of p.children) {
        if (node.tagName === "BR") {
          if (wrapped) node.setAttribute("data-flow", "");
          else top = null;
        } else if (!wrapped && node.offsetHeight && node.matches('.lx-w, [data-part="woven-word"]')) {
          if (top == null) top = node.offsetTop;
          else if (Math.abs(node.offsetTop - top) > half) wrapped = true;
        }
      }
    }
  }
  /** The blocks of a picture's text: up to the next book page (or the credits). */
  function textUnder(figure) {
    const blocks = [];
    for (let node = figure.nextElementSibling; node; node = node.nextElementSibling) {
      if (node.getAttribute("data-part") === "reader-note-mark") continue;
      if (node.hasAttribute("data-page-start") || !node.matches('p, h2, [data-part="reader-scene"]')) break;
      blocks.push(node);
    }
    return blocks;
  }
  /** Sizes the pictures for pages pageH tall (0 in scroll), on a spread a column each. Returns whether they face
   * their text (a spread's pairs are then fixed: picture left, text right). */
  function fitPictures(pageH, spread) {
    for (const node of flow.querySelectorAll(".lx-reader-blank")) node.remove();
    for (const node of flow.querySelectorAll("[data-fit-break]")) {
      node.removeAttribute("data-fit-break");
      node.removeAttribute("data-page-start");
    }
    const figures = [...flow.querySelectorAll('[data-part="reader-picture"]')];
    for (const figure of figures) {
      figure.removeAttribute("data-fit");
      for (const name of ["--fit-w", "--fit-h"]) figure.style.removeProperty(name);
    }
    if (!pageH || !figures.length) return false;
    // Each one's text, measured with the pictures out of the way (so on a spread it starts its own column): from the
    // picture's foot (the margin between them) to its last line, or null when it runs on past a column. (The empty
    // figure's margin collapses through it, so the text is measured from its own top.)
    for (const figure of figures) figure.setAttribute("data-fit", "measure");
    const sizes = figures.map((figure) => {
      const blocks = textUnder(figure);
      const last = blocks[blocks.length - 1];
      // The margin between the picture and its text.
      const lead = last ? Math.max(parseFloat(getComputedStyle(figure).marginBottom) || 0, parseFloat(getComputedStyle(blocks[0]).marginTop) || 0) : 0;
      let text = 0;
      if (last) {
        text = last.offsetTop + last.offsetHeight - blocks[0].offsetTop + lead;
        if (spread) {
          const range = document.createRange();
          range.selectNodeContents(last);
          // Its text running on into the next column (to the right, or to the left in a right-to-left book).
          const box = figure.getBoundingClientRect();
          if ([...range.getClientRects()].some((r) => (rtl() ? r.right <= box.left : r.left >= box.right))) text = null;
        }
      }
      const img = figure.querySelector("img");
      const w = Number(img.getAttribute("width")) || 4;
      const h = Number(img.getAttribute("height")) || 3;
      // The page's room: a page is cut 8px above its first block, and its last line needs a margin's worth below it.
      const gap = parseFloat(getComputedStyle(figure).marginBottom) || 0;
      const room = pageH - 12 - Math.max(4, gap - 8);
      // Alone: as large as fits, never past the picture's own pixels.
      const alone = Math.max(0, Math.min((figure.clientWidth * h) / w, h, room));
      const shared = text == null ? 0 : Math.min(alone, room - text);
      const least = Math.min(alone, Math.max(PICTURE_LEAST, FIT_SHARE * alone));
      // Pages: words that don't all fit with the picture at its least keep the most whole blocks that do.
      let keeps = 0;
      let kept = 0;
      if (!spread && text != null && shared < least) {
        // A break only between whole pieces: with the English beside the book (reader-parallel, after the piece it translates), only
        // after an English block, so a sentence and its English are never parted by a turn.
        const beside = blocks.some((block) => block.getAttribute("data-part") === "reader-parallel");
        for (let k = blocks.length - 1; k >= 1; k--) {
          if (beside && blocks[k - 1].getAttribute("data-part") !== "reader-parallel") continue;
          const upTo = blocks[k - 1].offsetTop + blocks[k - 1].offsetHeight - blocks[0].offsetTop + lead;
          if (room - upTo >= least) {
            keeps = k;
            kept = Math.min(alone, room - upTo);
            break;
          }
        }
      }
      const fits = text != null && shared >= (spread ? SPREAD_SHARE * alone : least);
      return { blocks, w, h, alone, shared: keeps ? kept : shared, keeps, fits: fits || keeps > 0 };
    });
    const facing = spread && sizes.some((size) => !size.fits);
    figures.forEach((figure, n) => {
      const { blocks, w, h, alone, shared, keeps } = sizes[n];
      const together = sizes[n].fits && !facing;
      const height = Math.floor(together ? shared : alone);
      figure.setAttribute("data-fit", together ? "with-text" : "alone");
      figure.style.setProperty("--fit-w", `${Math.floor((height * w) / h)}px`);
      figure.style.setProperty("--fit-h", `${height}px`);
      // Where the next page starts: its text (alone), or the first block it doesn't keep.
      const next = !together ? blocks[0] : keeps ? blocks[keeps] : null;
      if (next) {
        next.setAttribute("data-page-start", "");
        next.setAttribute("data-fit-break", "");
      }
    });
    if (facing) {
      // Each picture on a spread's first page (the left, or the right in a right-to-left book): one that would land on
      // the other (after a text that ran on) has a blank page before it.
      const stride = (flow.clientWidth + (parseFloat(getComputedStyle(flow).columnGap) || 0)) / 2;
      for (const figure of figures) {
        const along = rtl() ? flow.clientWidth - figure.offsetLeft - figure.offsetWidth : figure.offsetLeft;
        if (Math.round(along / stride) % 2) {
          const blank = el("div", { class: "lx-reader-blank", "data-atom": "", "data-page-start": "", "aria-hidden": "true" });
          blank.style.height = `${Math.floor(pageH) - 1}px`;
          figure.before(blank);
        }
      }
    }
    return facing;
  }

  // ---------- About this book ----------

  /**
   * The credits a book's license asks for (a picture book from StoryWeaver: CC BY 4.0): its attribution as given, who
   * did what, each picture's maker, and the license. inFlow: at the end of the book, a page of its own (each block a
   * block of the pages); else for a page of the settings sheet.
   */
  function credits({ inFlow = false } = {}) {
    // A learner's own text has its rights and pictures null (import-text.js, import-epub.js); a default covers only undefined.
    const rights = model.book.rights ?? {};
    const pictures = model.book.pictures ?? [];
    // Its layer's line only when the layer says who made it, never a credit made up for it.
    const layerBy = weave ? layerCredit(weave) : null;
    const layerLine = (what) => block("p", { class: "lx-muted" }, `Its ${what}: ${layerBy}${weave.licence ? `, ${weave.licence}` : ""}.`);
    const block = (tag, attrs, ...children) => el(tag, { ...attrs, ...(inFlow ? { "data-atom": "" } : {}) }, ...children);
    const ROLE = { author: "Story", translator: "Translation", illustrator: "Pictures", publisher: "Published by", platform: "From" };
    const roles = (rights.attribution ?? []).map((person) => {
      const extra = [person.of && `(${person.of})`, person.rights].filter(Boolean).join(" ");
      const name = person.url ? el("a", { href: person.url, target: "_blank", rel: "noopener" }, person.name) : person.name;
      return block("p", { class: "lx-credit-role" }, el("span", { class: "lx-muted" }, `${ROLE[person.role] ?? person.role}: `), name, extra ? ` ${extra}` : "");
    });
    const makers = [...new Set(pictures.map((picture) => picture.credit).filter(Boolean))];
    // A book whose only picture is its cover (a classic with its old illustration) says so.
    const coverOnly = Number.isInteger(model.book.cover) && !(model.book.pages ?? []).some((page) => Number.isInteger(page.picture));
    const licence = rights.licenceUrl ? el("a", { href: rights.licenceUrl, target: "_blank", rel: "noopener" }, rights.licence ?? rights.licenceUrl) : rights.licence;
    return el(
      "section",
      { part: "reader-credits", "aria-label": "About this book" },
      block("h2", inFlow ? { "data-page-start": "" } : {}, "About this book"),
      rights.attributionText ? block("p", {}, rights.attributionText) : null,
      ...roles,
      makers.length ? block("p", {}, el("span", { class: "lx-muted" }, `${coverOnly ? "The cover" : makers.length > 1 ? "Pictures" : pictures.length > 1 ? "Every picture" : "The picture"}: `), makers.join("; ")) : null,
      licence ? block("p", {}, el("span", { class: "lx-muted" }, "License: "), licence) : null,
      layerBy && weave.kind === "help" ? layerLine(`${LANGUAGES[weave.to]?.name ?? weave.to} help`) : null,
      layerBy && weave.kind === "weave" ? layerLine(`${LANGUAGES[weave.to]?.name ?? weave.to}, woven in`) : null,
      parallel && layerCredit(parallel)
        ? block("p", { class: "lx-muted" }, `Its ${LANGUAGES[parallel.to]?.name ?? parallel.to} translation: ${layerCredit(parallel)}${parallel.licence ? `, ${parallel.licence}` : ""}.`)
        : null,
      ...[defs.layer, defs.book].filter(Boolean).map(({ file }) =>
        block("p", { class: "lx-muted" }, `Definitions of ${file === defs.book?.file ? "its words" : `its ${LANGUAGES[file.lang]?.name ?? file.lang} words`}: ${file.credit}, `, licenseLink(file.licence), "."),
      ),
    );
  }

  /** A paragraph's words into `node`: as written, or (with the weave on) a sentence at a time through the weave. */
  function renderWords(node, para) {
    const { words } = model;
    if (!weaveOn()) {
      for (let g = para.s; g < para.e; g++) {
        lineBreak(node, g, para);
        node.append(wordSpan(g, words[g]));
      }
      return;
    }
    if (weave.kind === "help") return renderHelp(node, para);
    const { flipAt, order, literal: literalPref } = weavePrefs(prefs, lang);
    let g = para.s;
    while (g < para.e) {
      const sentence = sentenceAt.get(g);
      if (!sentence) {
        node.append(wordSpan(g, words[g]));
        g++;
        continue;
      }
      const shown = weaveSentence(sentence, words, known, { flipAt, order, lang, from: weave.from });
      if (!shown.flipped && !shown.ordered) {
        // An idiom stands for its whole run of English words.
        const runs = new Map(shown.idioms.map(({ k, len }) => [sentence.s + k, len]));
        for (const piece of shown.words) {
          if (piece.show === "hidden") {
            const span = wordSpan(piece.i, "");
            span.hidden = true;
            node.append(span);
          } else if (piece.show === "target") {
            const last = piece.i + (runs.get(piece.i) ?? 1) - 1;
            const english = joinWords(words.slice(piece.i, last + 1));
            // An idiom's target carries no reading of its own.
            const reading = runs.has(piece.i) ? null : sentence.t[piece.i - sentence.s]?.[2] ?? null;
            const span = wovenSpan(piece, { class: model.italic[piece.i] ? "lx-w lx-it" : "lx-w", "data-en": english, "data-reading": popReading(piece.text, reading) ?? undefined });
            // A word running the other way from the page (Arabic in an English book) is its own isolate (wovenSpan), so
            // the space after it goes outside it: inside, it would sit at the isolate's far edge.
            const gap = gapAfter(last);
            const outside = dirFor(lang) !== dirFor(bookLang()) && gap !== "";
            // A word you've just added: its English, small, over it, for its first few times (under it, where a reading
            // has the space over it).
            const gloss = piece.lemma && !know ? fadeGloss(piece.lemma, piece.i) : null;
            if (readingsHere()) {
              const nodes = readingNodes(piece.text, reading, piece.lemma);
              span.replaceChildren(gloss ? englishUnder(nodes, gloss) : el("span", { class: "lx-word" }, nodes), outside ? "" : gap);
              if (gloss && span.getAttribute("data-state") !== "looked-up") span.setAttribute("data-state", "new");
            } else if (vowelsHere()) {
              // Its English, when just added, over it, as any language's.
              const nodes = readingNodes(piece.text, reading, piece.lemma);
              span.replaceChildren(gloss ? el("ruby", {}, ...nodes, el("rt", { part: "reader-gloss" }, gloss)) : el("span", { class: "lx-word" }, nodes), outside ? "" : gap);
              if (gloss && span.getAttribute("data-state") !== "looked-up") span.setAttribute("data-state", "new");
            } else if (gloss) {
              span.replaceChildren(el("ruby", {}, typeset(lang, piece.text), el("rt", { part: "reader-gloss" }, gloss)), outside ? "" : gap);
              if (span.getAttribute("data-state") !== "looked-up") span.setAttribute("data-state", "new");
            } else span.textContent = `${typeset(lang, piece.text)}${outside ? "" : gap}`;
            wordEls[piece.i - mountA] = span;
            if (outside) node.append(span, gap);
            else node.append(span);
          } else node.append(wordSpan(piece.i, piece.text));
        }
      } else {
        // The whole sentence is one piece of the page (it never splits across two): its words in Dutch order, and
        // under a flipped one, its Dutch-order line. It stands for the sentence's first word; the rest are kept,
        // hidden, so every word keeps its place.
        const carrier = el("span", { part: "reader-sentence", class: "lx-w", state: shown.flipped ? "flipped" : "ordered", "data-i": sentence.s, lang: shown.flipped ? lang : undefined });
        // In the language's order, so in its direction (right to left for Arabic, whatever the page's).
        const line = el("span", { class: "lx-sentence-line", dir: dirFor(lang) ?? undefined });
        const joined = joinedHere();
        // One piece per word of the literal line (m), in Dutch order: a Dutch word with a lemma can be tapped for the
        // English it carries; names, punctuation and English stay plain. A word with a reading carries it (m[k][4]).
        // Written without spaces, a word carrying the same English words as the one before it goes with it (前 | に,
        // both "before"): in the language where that one is (a particle as itself), else left out, so the English
        // shows once (its closing marks, like a sentence's full stop, go onto that English).
        const pieces = [];
        let before = null;
        shown.words.forEach((piece, k) => {
          const sources = sentence.m[k]?.[2] ?? [];
          const same = joined && before && sources.length > 0 && before.sources.length === sources.length && before.sources.every((j, x) => j === sources[x]);
          if (same && piece.show !== "target") {
            if (!before.target) {
              const last = pieces[pieces.length - 1];
              const trail = frameOf(piece.text)[1];
              if (trail && !last[0].text.endsWith(trail)) last[0] = { ...last[0], text: last[0].text + trail };
              return;
            }
            if (!piece.lemma) piece = { ...piece, show: "target", text: sentence.m[k][0] };
          }
          before = { target: piece.show === "target", sources };
          pieces.push([piece, k]);
        });
        pieces.forEach(([piece, k], x) => {
          const reading = piece.show === "target" && (readingsHere() || vowelsHere()) ? sentence.m[k]?.[4] ?? null : null;
          let word;
          if (piece.show === "target" && piece.lemma) {
            word = wovenSpan(piece, { "data-en": sentence.m[k]?.[1] ?? "", "data-reading": popReading(piece.text, reading) ?? undefined });
            if (reading) word.replaceChildren(el("span", { class: "lx-word" }, readingNodes(piece.text, reading, piece.lemma)));
          } else if (piece.show === "target") word = el("span", { "data-i": piece.i, lang }, reading ? readingNodes(piece.text, reading, null) : typeset(lang, piece.text));
          // English in a line written without spaces: English marks, and a narrow gap either side (reader.css).
          else word = el("span", { "data-i": piece.i, lang: joined ? "en" : undefined, class: joined ? "lx-in-line" : undefined }, joined ? englishMarks(piece.text) : piece.text);
          // In this order the book's joints don't apply: two shown words written together still join, and the
          // language spaces its marks. Written without spaces, the words run together, a line breaking between two.
          const next = pieces[x + 1]?.[0];
          line.append(word, next ? (joined ? el("wbr") : gapBetween(piece.text, next.text, lang)) : joined ? "" : " ");
        });
        // The line sits in its own box (a flipped sentence's column of line and literal line), and stays inline
        // inside it, so a held sentence is painted as its text, line by line. With the line on tap, a small button
        // at the sentence's end opens it.
        const onTap = shown.flipped && literalPref === "tap";
        if (onTap) {
          const name = LANGUAGES[lang]?.name ?? lang;
          line.append(el("button", { part: "reader-literal-toggle", type: "button", "aria-label": `Show the ${name}-order line`, "aria-expanded": "false", onclick: (event) => openLiteral(sentence, event.currentTarget) }, icon("moved")));
        }
        carrier.append(el("span", {}, line));
        if (shown.flipped && !onTap) carrier.append(ui.literalLine(literalOf(sentence), { part: "reader-literal", lang }));
        wordEls[sentence.s - mountA] = carrier;
        // Two sentences in a language written without spaces, side by side in its order, run together too.
        const after = joined && sentence.e < para.e ? sentenceAt.get(sentence.e) : null;
        const together = after ? (({ flipped, ordered }) => flipped || ordered)(weaveSentence(after, words, known, { flipAt, order })) : false;
        node.append(carrier, together ? "" : gapAfter(sentence.e - 1));
        for (let h = sentence.s + 1; h < sentence.e; h++) {
          const span = wordSpan(h, "");
          span.hidden = true;
          node.append(span);
        }
      }
      g = sentence.e;
    }
  }

  /**
   * A paragraph of a book in the language you're learning, with your language's help (helpSentence): each word as
   * written, a word you don't know with its English small over it; or, in place, that English instead, in the book's
   * order (an idiom you know none of as its natural English over its run).
   */
  function renderHelp(node, para) {
    const { words } = model;
    const inPlace = weavePrefs(prefs, lang).help === "place";
    const helpLang = weave.to;
    // A book written without spaces: a line may break between two words (each is kept whole), as in a Japanese line.
    const add = (span) => (joinedHere() ? node.append(span, el("wbr")) : node.append(span));
    let g = para.s;
    while (g < para.e) {
      const sentence = sentenceAt.get(g);
      if (!sentence) {
        lineBreak(node, g, para);
        node.append(wordSpan(g, words[g]));
        g++;
        continue;
      }
      const shown = helpSentence(sentence, words, known, { mode: inPlace ? "weave" : "gloss" });
      const runs = new Map(shown.idioms.map(({ k, len }) => [sentence.s + k, len]));
      for (const piece of shown.words) {
        lineBreak(node, piece.i, para);
        const gap = gapAfter(piece.i + (runs.get(piece.i) ?? 1) - 1);
        const span = wordSpan(piece.i, "");
        if (piece.show === "hidden") {
          span.hidden = true;
          node.append(span);
          continue;
        }
        if (!piece.lemma) {
          span.textContent = `${typeset(lang, piece.text)}${gap}`;
          add(span);
          continue;
        }
        span.setAttribute("data-lemma", piece.lemma);
        span.setAttribute("data-en", runs.has(piece.i) ? piece.text : sentence.t[piece.i - sentence.s][0]);
        if (piece.lemma && lookedUp.has(lemmaKey(piece.lemma)) && !piece.help) span.setAttribute("data-state", "looked-up");
        if (piece.show === "help") {
          // In place: its English, in the book's order (in a book written without spaces, with English marks and a
          // narrow gap either side).
          span.setAttribute("data-part", "reader-help");
          span.setAttribute("lang", helpLang);
          if (joinedHere()) span.classList.add("lx-in-line");
          span.textContent = joinedHere() ? englishMarks(piece.text) : `${piece.text}${gap}`;
        } else {
          span.setAttribute("data-part", "reader-word");
          // A book written in characters: the word's reading over it (t[j][2]), and its English under it.
          const reading = readingsHere() || vowelsHere() ? sentence.t[piece.i - sentence.s]?.[2] ?? null : null;
          if (readingsHere()) {
            if (reading) span.setAttribute("data-reading", reading);
            const nodes = readingNodes(piece.text, reading, piece.lemma);
            span.replaceChildren(piece.help ? el("ruby", {}, ...nodes, el("rt", { part: "reader-gloss", state: "under", lang: helpLang }, bareGloss(piece.help))) : el("span", { class: "lx-word" }, nodes), gap);
          } else if (vowelsHere()) {
            // A book with vowel marks: they're on its words; its English over them, as any language's.
            if (popReading(piece.text, reading)) span.setAttribute("data-reading", reading);
            const nodes = readingNodes(piece.text, reading, piece.lemma);
            span.replaceChildren(piece.help ? el("ruby", {}, ...nodes, el("rt", { part: "reader-gloss", lang: helpLang }, piece.help)) : el("span", { class: "lx-word" }, nodes), gap);
          } else if (piece.help) span.replaceChildren(el("ruby", {}, typeset(lang, piece.text), el("rt", { part: "reader-gloss", lang: helpLang }, piece.help)), gap);
          else span.textContent = `${typeset(lang, piece.text)}${gap}`;
        }
        add(span);
      }
      g = sentence.e;
    }
  }

  function setWeave(woven) {
    weave = woven;
    // The language being learned: a weave's target, or a help layer's book.
    lang = woven ? (woven.kind === "help" ? woven.from : woven.to) : learning();
    glossAt = new Map();
    if (woven?.kind === "help") for (const sentence of woven.sentences) sentence.t.forEach(([gloss], j) => glossAt.set(sentence.s + j, gloss));
    sentenceAt = new Map((woven?.sentences ?? []).map((sentence) => [sentence.s, sentence]));
    occurrences = new Map();
    for (const sentence of woven?.sentences ?? []) {
      sentence.t.forEach(([, lemma], j) => {
        if (!lemma) return;
        const key = lemmaKey(lemma);
        if (!occurrences.has(key)) occurrences.set(key, []);
        occurrences.get(key).push(sentence.s + j);
      });
    }
    // How this text writes its words, for every list that shows them (study/written.js: Nederland, not nederland), after the page is
    // drawn: its sentences' words in the language being learned, each with its key.
    if (woven && !demo && model?.book?.id) {
      const book = model.book.id;
      const help = woven.kind === "help";
      const sentences = woven.sentences.map((sentence) => sentence.t.map(([target, l], j) => [help ? model.words[sentence.s + j] : target, l ? lemmaKey(l) : null]));
      requestAnimationFrame(() => setTimeout(() => noteBook(lang, book, sentences, { woven: !help }), 0));
    }
    root.toggleAttribute("data-woven", weaveOn());
    root.toggleAttribute("data-tint", weaveOn() && weavePrefs(prefs, lang).tint);
    // A language with readings over its words: lines leave room for them (reader.css).
    // A help layer's words carry their English under them too, unless it's in their place.
    if (weaveOn() && readingsHere()) root.setAttribute("data-readings", woven.kind === "help" && weavePrefs(prefs, lang).help !== "place" ? "help" : "");
    else root.removeAttribute("data-readings");
    // Its text starts at 24px (reader.css), on or off: turning the weave or help off never changes the page's size.
    root.toggleAttribute("data-lang-readings", Boolean(woven) && readingsHere());
    root.toggleAttribute("data-underline", weaveOn() && weavePrefs(prefs, lang).underline);
  }

  /** Whether the translation beside the book shows: a parallel layer, the book read as written (no weave or help), and its switch on. */
  const besideShown = () => !weave && Boolean(parallel) && weavePrefs(prefs, model.book.lang).helpOn;

  /** The book's parallel layer (or none), and where each of its lines goes in: after its sentence's last word, else its page's. */
  function setParallel(layer) {
    parallel = layer;
    besideAt = new Map();
    if (!layer) return;
    const { sentences = [], pages = [] } = model.book;
    sentences.forEach(([, e], x) => {
      if (typeof layer.sentences[x] === "string") besideAt.set(e, layer.sentences[x]);
    });
    // A page whose sentences don't line up (book-format.js: then none is given) has its translation whole, under its last line.
    pages.forEach((page, p) => {
      const paired = sentences.some(([s, e], x) => s >= page.s && e <= page.e && typeof layer.sentences[x] === "string");
      if (!paired && layer.pages[p]) besideAt.set(page.e, layer.pages[p]);
    });
  }

  /**
   * A paragraph with its translation beside it: its words as written; after a sentence's last word (or a page's), that translation as a
   * line of its own, and the paragraph going on after it in a piece of the same kind. [node, line, piece, line, …]
   */
  function besideParts(node, para) {
    const { words } = model;
    const parts = [node];
    let piece = node;
    let from = para.s;
    for (let g = para.s; g < para.e; g++) {
      // A line break in the book's paragraph, but never at a piece's first word (the translation above is its break).
      if (g !== from) lineBreak(piece, g, para);
      piece.append(wordSpan(g, words[g]));
      const beside = besideAt.get(g + 1);
      if (beside == null) continue;
      // In its own direction, said either way: under a right-to-left book a left-to-right translation with no dir took the page's, and
      // its English ran from the right with its full stop first.
      parts.push(el("p", { part: "reader-parallel", lang: parallel.to, dir: dirFor(parallel.to) !== dirFor(bookLang()) ? dirFor(parallel.to) ?? "ltr" : dirFor(parallel.to) }, typeset(parallel.to, beside)));
      if (g + 1 < para.e) {
        piece = node.cloneNode(false);
        piece.removeAttribute("data-page-start");
        parts.push(piece);
        from = g + 1;
      }
    }
    return parts;
  }

  // In pages, the word a change of layout keeps on the page, taken once and kept while it's still on the page you see (as the size
  // slider's is, once a drag): a setting switched off and on again comes back to the page you were on, never creeping back to the start
  // of the bigger page the first change made. A page you turn to that doesn't hold it takes its own first word again.
  let layoutAnchor = null;
  /** Lays the chapter out again (the words you know changed, or a weave or translation setting), keeping your place. */
  function rewave() {
    if (!model) return;
    const here = mode === "pages" && disp >= 0 && pages[disp] ? [mountA + pages[disp].a, mountA + pages[disp].b] : null;
    const anchor = here && layoutAnchor != null && layoutAnchor >= here[0] && layoutAnchor <= here[1] ? layoutAnchor : anchorWord();
    const keep = mode === "pages" ? spreadPin(pages[disp], anchor - mountA) : null;
    closePopover();
    hold?.cancel();
    setWeave(weave);
    mounted = -1;
    showWord(anchor, keep);
    layoutAnchor = mode === "pages" ? anchor : null;
  }
  const stopBank = onBankChange(() => !know && rewave());

  // ---------- a Dutch word's meaning ----------

  function closePopover() {
    popover?.lxToggle?.setAttribute("aria-expanded", "false");
    popover?.lxResize?.disconnect();
    popover?.remove();
    popover = null;
  }
  // Under a line's box, its words' marks: a woven word's dotted underline (reader.css: 5px below the line, 1.5px) and a looked-up word's wave.
  const MARKS_BELOW = 5;
  /** The text's lines on the screen whose words (and the marks under them) cross the height `y`: each line's own box, by a Range. */
  function linesAcross(y) {
    const found = [];
    for (const block of flow.children) {
      const b = block.getBoundingClientRect();
      if (b.bottom + MARKS_BELOW < y || b.top > y || block.matches('[data-part="reader-picture"]')) continue;
      const range = document.createRange();
      range.selectNodeContents(block);
      for (const line of range.getClientRects()) if (line.height && line.top < y && line.bottom + MARKS_BELOW > y) found.push(line);
    }
    return found;
  }
  /**
   * Places `node` above `anchor`, or under it when there's no room; never off the screen's sides (the text's 16px gutters). Both its edges
   * land between two lines, never through one (nor through the marks under a line's words): the edge by the word moves closer to it, the edge
   * away from it takes in the line it would cut, the popover taller by it (a line at most). Sizes by layout (offsetHeight), not the box on the
   * screen, which its own entrance scales.
   */
  function placePopover(node, anchor) {
    const r = root.getBoundingClientRect();
    const w = anchor.getBoundingClientRect();
    node.style.minHeight = "";
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const pitch = parseFloat(getComputedStyle(text).lineHeight);
    const most = height + (Number.isFinite(pitch) ? pitch : 32) * 1.5;
    let top;
    let bottom;
    if (w.top - r.top - height - 10 > 60) {
      bottom = w.top - 10;
      const near = linesAcross(bottom).filter((line) => line.bottom <= w.top);
      if (near.length) bottom = Math.min(w.top - 3, Math.max(...near.map((line) => line.bottom)) + MARKS_BELOW + 1);
      top = bottom - height;
      const far = linesAcross(top);
      const to = far.length ? Math.min(...far.map((line) => line.top)) - 4 : top;
      if (to - r.top > 8 && bottom - to <= most) top = to;
    } else {
      top = w.bottom + MARKS_BELOW + 5;
      const near = linesAcross(top).filter((line) => line.top >= w.bottom);
      if (near.length) top = Math.max(w.bottom + MARKS_BELOW + 1, Math.min(...near.map((line) => line.top)) - 4);
      bottom = top + height;
      const far = linesAcross(bottom);
      const to = far.length ? Math.max(...far.map((line) => line.bottom)) + MARKS_BELOW + 2 : bottom;
      if (r.bottom - to > 8 && to - top <= most) bottom = to;
    }
    if (bottom - top !== height) node.style.minHeight = `${bottom - top}px`;
    node.style.top = `${top - r.top}px`;
    node.style.left = `${Math.max(16, Math.min(r.width - width - 16, w.left - r.left + w.width / 2 - width / 2))}px`;
  }
  /** Shows `node` as the popover, by `anchor`. It can grow while open (a line saying a question went to your AI), so
   * it's placed again then, and never covers its word. */
  function showPopover(node, anchor) {
    popover = node;
    popover.lxScrollTop = text.scrollTop;
    root.append(popover);
    placePopover(node, anchor);
    popover.lxResize = new ResizeObserver(() => node.isConnected && placePopover(node, anchor));
    popover.lxResize.observe(node);
    motion.appear(popover);
  }
  // Opening a whole sentence's Dutch-order line is help with its word order: its patterns (the weave's c) count as
  // right with a nudge (hard, not again), once per sentence per sitting.
  const openedLines = new Set();
  function literalOpened(sentence) {
    if (demo || openedLines.has(sentence.s)) return;
    openedLines.add(sentence.s);
    if (!sentence.c?.length) return;
    record(sentence.c.map((id) => ({ concept: `p:${id}`, skill: "read", outcome: "right", help: "nudge", test: "recall", activity: "reader", item: `${model.book.id}@${model.book.version}#${sentence.s}` })));
  }
  /** The Dutch-order line of a whole sentence, on tap: by the sentence, like a word's meaning. */
  function openLiteral(sentence, toggle) {
    const again = popover?.lxToggle === toggle;
    closePopover();
    if (again) return;
    const name = LANGUAGES[lang]?.name ?? lang;
    const node = el("div", { part: "word-popover", role: "dialog", "aria-label": `The English in ${name} order` }, el("span", { class: "lx-small lx-muted" }, `The English in ${name} order`), ui.literalLine(literalOf(sentence), { part: "reader-literal", lang }));
    node.lxToggle = toggle;
    toggle.setAttribute("aria-expanded", "true");
    literalOpened(sentence);
    showPopover(node, toggle.closest(".lx-sentence-line") ?? toggle);
  }
  /** A tap on a woven word: its meaning, by the word. A miss on it in your progress, once per sitting. */
  // A text in a language that isn't yours, with no help of its own (one you pasted, say): a tap looks the word up in what
  // Lexicommons has, as Translate does (your packs and books, and online the library's and shared packs). It isn't a recall,
  // so it counts for nothing, and when there's nothing to find, or no way to ask, it says which.
  const looksUpOwn = () => !demo && !weaveOn() && (model.book.lang ?? HELP_IN) !== HELP_IN;
  function lookUpOwn(span) {
    closePopover();
    const from = model.book.lang;
    const word = plainWord(span.textContent);
    const said = el("span", { role: "status" }, "Looking it up…");
    const more = el("span", { class: "lx-small lx-muted lx-popover-sense" });
    const node = el(
      "div",
      { part: "word-popover", role: "dialog", "aria-label": word },
      el("strong", { lang: from }, word),
      said,
      more,
      el("div", { class: "lx-row" }, ui.speakButton(() => speakWord(word), { label: `Hear ${word}` })),
    );
    showPopover(node, span);
    let shownMeaning = false;
    const show = (result) => {
      if (!node.isConnected) return;
      const found = (result?.words ?? []).filter((w) => w.en);
      if (found.length) {
        shownMeaning = true;
        said.replaceChildren(el("span", { lang: "en" }, [...new Set(found.flatMap((w) => w.en.split(/,\s*/)))].slice(0, 3).join(", ")));
        const { lemma, source } = found[0];
        const credit = (result.sources ?? []).find((s) => s.id === source)?.name;
        more.replaceChildren(...[lemma && lemma.toLowerCase() !== word.toLowerCase() ? el("span", { lang: from }, `${lemma} · `) : null, credit ? `From ${credit}` : null].filter(Boolean));
        return;
      }
      if (shownMeaning || result?.pending) return;
      // Nothing found is only "not in Lexicommons" once Lexicommons has answered (Translate's page says the same).
      said.replaceChildren(result?.online ? "Not in Lexicommons yet." : result?.onlineFailed ? "Not on this device, and Lexicommons didn't answer." : "Not in your packs yet. You're offline, so nothing else was searched.");
    };
    translate(word, { from, to: "en" }, { onLocal: show })
      .then(show)
      .catch(() => show({ onlineFailed: true }));
  }
  function lookUp(word) {
    closePopover();
    const lemma = word.getAttribute("data-lemma");
    const english = word.getAttribute("data-en") || "";
    const i = Number(word.getAttribute("data-i"));
    const dutch = word.getAttribute("data-nl") ?? (weave?.kind === "help" ? model.words[i] : word.textContent.trim());
    // A miss is a word you showed as known: in a woven book every word in the language; in a book in the language, one
    // with no help on it. Looking up one you don't know yet isn't a recall.
    if (weave?.kind !== "help" || known(lemma)) {
      word.setAttribute("data-state", "looked-up");
      missOn(lemma, i);
      peeked();
    }
    // A tap shows a word's reading again, over it and here, even once you know the word.
    ui.showReading(word);
    const reading = word.getAttribute("data-reading");
    const plain = (text) => text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
    const back = lemma && inBank(lang, lemma)
      ? ui.button(weave?.kind === "help" ? `Show its ${LANGUAGES[weave.to]?.name ?? weave.to} again` : "Show it in English again", { variant: "fade", size: "sm", onclick: () => {
          closePopover();
          removeWord(lang, lemma);
        } })
      : null;
    const ask = demo ? null : askAboutWord(plain(dutch), lemma, i, () => node);
    const node = el(
      "div",
      { part: "word-popover", role: "dialog", "aria-label": `${plain(dutch)}: ${plain(english)}` },
      el("strong", { lang }, plain(dutch)),
      reading ? el("span", { class: "lx-small", lang }, reading) : null,
      el("span", {}, plain(english)),
      ...(() => {
        const first = sensesOf(lemma)[0];
        return first ? [el("span", { class: "lx-small lx-muted lx-popover-sense" }, `${first.pos} · ${first.def}`)] : [];
      })(),
      lemma && lemma !== plain(dutch).toLowerCase() ? el("span", { class: "lx-small lx-muted", lang }, lemma) : null,
      el(
        "div",
        { class: "lx-row" },
        ui.speakButton(() => speakWord(plain(dutch)), { label: `Hear ${plain(dutch)}` }),
        back,
        // The word tapped, as it shows (in a flipped sentence two words can carry one English word: each its own).
        ui.button("More", { variant: "fade", size: "sm", onclick: () => openWordCard(i, { learned: plain(dutch), lemma: lemma ?? null }) }),
        ask?.button,
      ),
      ask?.status,
    );
    showPopover(node, word);
  }
  /**
   * The "…" on a word's meaning: ask your AI about the word, with its sentence and the book. A woven book is in a
   * language you know, so its sentence in the one you're learning is the weave's; a book in the language you're
   * learning has its own sentence, and the help language's beside it.
   */
  function askAboutWord(word, lemma, i, under) {
    const sentence = sentenceOf(i);
    const own = sentence ? bookText(model.words.slice(sentence.s, sentence.e)) : null;
    const line = sentence ? (weave.kind === "help" ? { text: own, natural: sentence.text } : { text: sentence.text, natural: own }) : null;
    return askMenu({
      about: { language: lang, where: "reader", word: { text: word, ...(lemma ? { lemma } : {}) }, ...(line ? { sentence: line } : {}), book: { id: model.book.id, title: model.book.title, at: i } },
      thing: "this word",
      subject: "this word in its sentence",
      explain: `Explain “${word}” here: what it means in this sentence, and why it has this form.`,
      card: { text: word, lang, meta: line ? `In “${line.text}”` : `In ${model.book.title}` },
      label: `More about ${word}`,
      under,
    });
  }

  // ---------- holding a word ----------

  /** The sentence of the weave that word i is in (or null). */
  function sentenceOf(i) {
    if (!weave) return null;
    let lo = 0;
    let hi = weave.sentences.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (weave.sentences[mid].s <= i) lo = mid;
      else hi = mid - 1;
    }
    const sentence = weave.sentences[lo];
    return sentence && i >= sentence.s && i < sentence.e ? sentence : null;
  }
  const missOn = (lemma, i) => {
    if (demo || !lemma || lookedUp.has(lemmaKey(lemma))) return;
    lookedUp.add(lemmaKey(lemma));
    record([{ concept: `w:${lemmaKey(lemma)}`, skill: "read", outcome: "wrong", test: "recall", activity: "reader", item: `${model.book.id}@${model.book.version}#${i}` }]);
  };
  // Reading past a woven word: met, exposure that never counts as a review (a word skipped isn't proof of knowing it).
  // Once per word per sitting, and not for a word you've looked up (that was a miss). Only reading on through a
  // chapter counts: a page turned forward, or the text scrolled on past the reading line; never a jump.
  const metThisSitting = new Set();
  /** The woven words of the mounted chapter from word a to b (book indices, inclusive) not yet met this sitting. */
  function unmet(a, b) {
    if (demo || know || !weaveOn()) return [];
    const out = [];
    for (const word of flow.querySelectorAll(':is([data-part="woven-word"], [data-part="reader-word"], [data-part="reader-help"])[data-lemma]')) {
      const i = Number(word.getAttribute("data-i"));
      const key = lemmaKey(word.getAttribute("data-lemma"));
      if (i < a || i > b || metThisSitting.has(key) || lookedUp.has(key) || out.some((row) => row.key === key)) continue;
      out.push({ key, i });
    }
    return out;
  }
  function readPast(words) {
    const rows = words.filter(({ key }) => !metThisSitting.has(key) && !lookedUp.has(key));
    if (!rows.length) return;
    for (const { key } of rows) metThisSitting.add(key);
    record(rows.map(({ key, i }) => ({ concept: `w:${key}`, skill: "read", outcome: "met", activity: "reader", item: `${model.book.id}@${model.book.version}#${i}` })));
  }
  const plainWord = (text) => text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");

  /** What the toolbar shows for words lo..hi: a preview in the other language, and what can be done. */
  function holdContent(lo, hi) {
    const name = LANGUAGES[lang]?.name ?? lang;
    const preview = (label, body, langAttr) => el("div", { part: "reader-preview" }, el("span", { class: "lx-preview-label" }, label), el("span", { lang: langAttr }, body));
    const action = (label, onclick) => el("button", { type: "button", onclick }, label);
    const copy = action("Copy", () => {
      navigator.clipboard?.writeText(bookText(model.words.slice(lo, hi + 1))).catch(() => {});
      hold.cancel();
    });
    const close = el("button", { type: "button", "aria-label": "Close", onclick: () => hold.cancel() }, icon("cross"));
    // The weave (or the help) off: the text as written, and the held words in their other language.
    if (!weaveOn()) return translateContent(lo, hi, { preview, action, copy, close });
    const sentence = sentenceOf(lo);
    if (!sentence) return { preview: null, actions: [copy, close] };
    if (weave.kind === "help") return helpHoldContent(sentence, lo, hi, { preview, action, copy, close });
    const { flipAt, order } = weavePrefs(prefs, lang);
    const shown = weaveSentence(sentence, model.words, known, { flipAt, order, lang, from: weave.from });
    const widen = hi < sentence.e - 1 || lo > sentence.s ? action("Sentence", () => hold.select(sentence.s, sentence.e - 1)) : null;
    // A sentence shown whole: what the page doesn't show. With its literal line drawn (the English in Dutch order),
    // the book's own English; with that line off, the English in Dutch order (reading it back is studying too).
    if (shown.flipped) {
      const literal = wordEl(sentence.s)?.querySelector('[data-part="reader-literal"]');
      if (literal?.getClientRects().length) return { preview: preview("English", bookText(model.words.slice(sentence.s, sentence.e))), actions: [copy, close] };
      // The line isn't drawn (on tap): this is it, so it counts as opening it.
      literalOpened(sentence);
      return { preview: preview(`English, in ${name} order`, joinWords(sentence.m.map((entry) => entry[1]))), actions: [copy, close] };
    }
    // In Dutch word order already: the natural English.
    if (shown.ordered) return { preview: preview("English", bookText(model.words.slice(sentence.s, sentence.e))), actions: [copy, close] };
    // More than one word (an idiom's run is one): the sentence in Dutch.
    if (hi > holdUnit(lo)[1]) return { preview: preview(name, sentence.text, lang), actions: [widen, copy, close].filter(Boolean) };
    const [target, lemma] = sentence.t[lo - sentence.s];
    const showing = Boolean(lemma) && known(lemma);
    if (showing) {
      // Peeking at a Dutch word: a miss on it, and its gloss fades in again from here.
      missOn(lemma, lo);
      peeked();
      if (!know && inBank(lang, lemma)) {
        restartFade(lang, lemma, lo, model.book.id);
        fadePending = true;
      }
    }
    const toggle = lemma && !know
      ? showing
        ? inBank(lang, lemma) ? action("↩ English", () => {
            hold.cancel();
            removeWord(lang, lemma);
          }) : null
        : action(`→ ${name}`, () => {
            hold.cancel();
            learn(lemma, lo);
          })
      : null;
    const body = showing ? bookText(model.words.slice(lo, hi + 1)) : target;
    const card = preview(showing ? "English" : name, plainWord(body) || body, showing ? undefined : lang);
    if (lemma && lemma !== plainWord(showing ? target : body).toLowerCase()) card.append(el("span", { class: "lx-preview-lemma", lang }, lemma));
    return { preview: card, actions: [toggle, widen, copy, close].filter(Boolean) };
  }

  /**
   * The toolbar with the weave or the help off (readersound's Translate): the held word in the layer's other language
   * (with its base form, when that's different), more than one word the sentence in it; Sentence and Copy. Nothing is
   * shown in the other language, so holding one tests nothing and counts nothing.
   */
  function translateContent(lo, hi, { preview, action, copy, close }) {
    const sentence = weave ? sentenceOf(lo) : null;
    if (!sentence) return { preview: null, actions: [copy, close] };
    const other = weave.to;
    const otherName = LANGUAGES[other]?.name ?? other;
    const widen = hi < sentence.e - 1 || lo > sentence.s ? action("Sentence", () => hold.select(sentence.s, sentence.e - 1)) : null;
    const [word, lemma] = sentence.t[lo - sentence.s] ?? [];
    if (hi > lo || !plainWord(word ?? "")) return { preview: preview(otherName, sentence.text, other), actions: [widen, copy, close].filter(Boolean) };
    const card = preview(otherName, plainWord(word), other);
    // The base form, in the language being learned (a weave's other language; a help book's own).
    const learned = weave.kind === "help" ? model.words[lo] : word;
    if (lemma && lemma.toLowerCase() !== plainWord(learned).toLowerCase()) card.append(el("span", { class: "lx-preview-lemma", lang }, lemma));
    return { preview: card, actions: [widen, copy, close].filter(Boolean) };
  }

  /** The toolbar in a help book: a word's English, with "I know it" (into your words) or "Show its English"; more
   * than one word, the sentence's natural English. */
  function helpHoldContent(sentence, lo, hi, { preview, action, copy, close }) {
    const helpName = LANGUAGES[weave.to]?.name ?? weave.to;
    const widen = hi < sentence.e - 1 || lo > sentence.s ? action("Sentence", () => hold.select(sentence.s, sentence.e - 1)) : null;
    if (hi > holdUnit(lo)[1]) return { preview: preview(helpName, sentence.text, weave.to), actions: [widen, copy, close].filter(Boolean) };
    const [gloss, lemma] = sentence.t[lo - sentence.s];
    const english = wordEl(lo)?.getAttribute("data-en") || gloss;
    const knew = Boolean(lemma) && known(lemma);
    // Checking a word you know is a peek, as in a woven book.
    if (knew) {
      missOn(lemma, lo);
      peeked();
    }
    const toggle = lemma && !know
      ? inBank(lang, lemma)
        ? action(`Show its ${helpName}`, () => {
            hold.cancel();
            removeWord(lang, lemma);
          })
        : knew
          ? null
          : action("I know it", () => {
              hold.cancel();
              addWord(lang, lemma);
            })
      : null;
    const card = preview(helpName, plainWord(english) || english, weave.to);
    if (lemma) card.append(el("span", { class: "lx-preview-lemma", lang }, lemma));
    return { preview: card, actions: [toggle, widen, copy, close].filter(Boolean) };
  }

  /**
   * The words held together with word i: a sentence shown whole is held whole, and an idiom shown in Dutch stands for
   * its run of English words (they're kept, hidden, after it).
   */
  function holdUnit(i) {
    const sentence = weaveOn() ? sentenceOf(i) : null;
    if (!sentence) return [i, i];
    if (wordEl(sentence.s)?.getAttribute("data-part") === "reader-sentence") return [sentence.s, sentence.e - 1];
    let end = i;
    while (end + 1 < sentence.e && wordEl(end + 1)?.hidden) end++;
    return [i, end];
  }
  // What a held word paints: a sentence shown whole paints its own line, never the literal line under it.
  const heldEl = (i) => {
    const node = wordEl(i);
    return node?.getAttribute("data-part") === "reader-sentence" ? node.querySelector(".lx-sentence-line") : node;
  };
  // What shows word i: its own element, or for a hidden one (inside a flipped sentence, or an idiom's run) the one that
  // stands for it, the nearest shown word before it.
  const shownEl = (i) => {
    for (let j = i; j >= mountA; j--) {
      const node = heldEl(j);
      if (node && !node.hidden) return node;
    }
    return null;
  };

  const hold = createHold({
    text,
    flow,
    wordEl: heldEl,
    unit: holdUnit,
    swallow: () => (swallow = true),
    allow: () => !zoomed() && !pinch,
    content: (lo, hi) => {
      const shown = holdContent(lo, hi);
      cardFromPreview(shown.preview, lo, hi);
      const define = defineAction(lo, hi);
      return { ...shown, actions: [...(define ? [define] : []), ...markActions(lo, hi), ...shown.actions] };
    },
    onEnd: () => {
      // A peek's restarted gloss shows once the selection is gone, never under your finger.
      if (fadePending) {
        fadePending = false;
        rewave();
      }
    },
  });

  function goToChapter(ci) {
    resetZoom();
    scrollFrom = null;
    closeSheet({ animate: false });
    mountChapter(ci);
    if (mode === "pages") {
      repaginate();
      return setPage(0);
    }
    text.scrollTop = 0;
    lastWord = model.chapters[mounted].word;
    savePosition();
  }

  // ---------- pages ----------

  function pageHeight() {
    const style = getComputedStyle(text);
    return text.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  }
  /** Cuts the chapter into pages, or on a landscape or wide screen into spreads (two pages side by side); pin keeps a
   * word on its side of a spread (spreadPin). */
  function repaginate(pin = null) {
    const spread = mode === "pages" && spreadFits(root.clientWidth, root.clientHeight);
    if (spread) root.setAttribute("data-variant", "spread");
    else {
      root.removeAttribute("data-variant");
      flow.style.height = "";
    }
    reflowBreaks();
    const pageH = pageHeight();
    // A spread's columns are the page's height before its pictures are measured in them.
    if (spread && pageH >= 60) flow.style.height = `${pageH}px`;
    // Pictures facing their text keep their side (left), whatever side your word was on.
    const facing = fitPictures(mode === "pages" ? pageH : 0, spread);
    pages = mode !== "pages" ? [] : spread ? paginateSpread(flow, wordEls, pageH, facing ? null : pin) : paginate(flow, wordEls, pageH);
    cutHeights = pages.length ? pictureHeights() : "";
    disp = -1;
    placeMarks();
  }
  const pageOfWord = (i) => pageOf(pages, Math.max(0, i - mountA));
  /** Shows page n of the chapter: the flow moves up to it, and the covers hide the lines either side. A spread: the
   * flow moves left to it, its other columns outside the text's box, which clips them. */
  function setPage(n) {
    closePopover();
    hold?.cancel();
    if (!pages.length) return;
    disp = Math.max(0, Math.min(pages.length - 1, n));
    const page = pages[disp];
    if (page.x != null) {
      // Something scrolled into view (a focused word) would shift the columns while the move stays right.
      text.scrollLeft = 0;
      text.scrollTop = 0;
      flow.style.transform = `translateX(${rtl() ? page.x : -page.x}px)`;
    } else {
      flow.style.transform = `translateY(${-page.top}px)`;
      covers[0].style.top = `${page.top - 4000}px`;
      covers[0].style.height = "4000px";
      covers[1].style.top = `${page.top + page.h}px`;
      covers[1].style.height = "4000px";
    }
    status.textContent = `${disp + 1}/${pages.length}`;
    // Where you are is the page's first word.
    lastWord = mountA + page.a;
    savePosition();
    // A picture book's page as counted here (store.setShownPage), so Home and Read's card say the same number.
    if (!demo && model.book.pages?.length) store.setShownPage(model.book.id, { n: disp + 1, of: pages.length, a: mountA + page.a, b: mountA + page.b });
  }
  /** Keeps word i in view across a change of layout: in pages, the page holding it (on its side of a spread); in
   * scroll, the reading line. */
  function relayout(i) {
    resetZoom();
    if (mode === "pages") {
      const keep = spreadPin(pages[disp], i - mountA);
      // Pages that start at one word (a picture's own page and its text's; a sentence taller than a page): which of them
      // was showing, kept (pageOf gives the first).
      const at = disp >= 0 ? pages[disp]?.a : null;
      let nth = 0;
      while (at != null && disp - nth - 1 >= 0 && pages[disp - nth - 1].a === at) nth++;
      dropTurn();
      repaginate(keep);
      let n = pageOfWord(i);
      for (let k = 0; k < nth && pages[n + 1]?.a === pages[n].a; k++) n++;
      setPage(n);
    } else {
      reflowBreaks();
      pin(i);
    }
  }

  // ---------- turning a page ----------

  function dropTurn() {
    if (!turn) return;
    turn.drop();
    turn = null;
    turnLayer.hidden = true;
    turnLayer.replaceChildren();
  }

  /**
   * Starts turning a page (dir 1 forward, −1 back): `user` when a finger holds it, grabbed at height y0. The curl
   * goes across a chapter's edge too, the next chapter put under the sheet. Null at the book's first or last page.
   */
  function startTurn(dir, user, y0 = null) {
    if (turn || !pages.length) return null;
    const oldPage = disp;
    // Forward, the page you're leaving was read (taken now: across a chapter, its words leave the page).
    const leaving = dir === 1 ? unmet(mountA + pages[oldPage].a, mountA + pages[oldPage].b) : null;
    const newPage = disp + dir;
    const oldChapter = mounted;
    const cross = newPage < 0 || newPage >= pages.length;
    if (cross && (dir === 1 ? oldChapter + 1 >= model.chapters.length : oldChapter === 0)) return null;
    const sheetFor = (n) => curlLayers(turnLayer, { page: pages[n], flow, text, root });
    let sheet;
    if (!cross) {
      sheet = sheetFor(dir === 1 ? oldPage : newPage);
      // Forward, the next page is already under the sheet.
      if (dir === 1) setPage(newPage);
    } else if (dir === 1) {
      sheet = sheetFor(oldPage);
      mountChapter(oldChapter + 1);
      repaginate();
      setPage(0);
    } else {
      // Back across a chapter: the page you're leaving stays as the backdrop the previous chapter's last page
      // unfolds over.
      const backdrop = sheetFor(oldPage).front;
      backdrop.remove();
      mountChapter(oldChapter - 1);
      repaginate();
      setPage(pages.length - 1);
      sheet = sheetFor(disp);
      turnLayer.prepend(backdrop);
    }
    turnLayer.hidden = false;
    const r = root.getBoundingClientRect();
    // A right-to-left book's page turns from its left edge: the session works as if left to right, and the fold it
    // draws is mirrored (pointer x comes in mirrored too: the drag below).
    const flip = (p) => ({ x: r.width - p.x, y: p.y });
    turn = turnSession({
      W: r.width,
      H: r.height,
      y0,
      dir,
      setFold: rtl() ? (C0, F) => sheet.setFold(flip(C0), flip(F)) : sheet.setFold,
      animate: motion.motionOn(),
      onDone: (commit) => {
        if (commit && leaving) readPast(leaving);
        // A new page read (once the turn has landed, so nothing lights up under the sheet).
        if (commit && dir === 1 && disp >= 0) readOn(mountA + pages[disp].a, 1);
        if (cross) {
          if (!commit) {
            mountChapter(oldChapter);
            repaginate();
            setPage(dir === 1 ? pages.length - 1 : 0);
          }
        } else {
          if (dir === 1 && !commit) setPage(oldPage);
          if (dir === -1 && commit) setPage(newPage);
        }
        turnLayer.hidden = true;
        turnLayer.replaceChildren();
        turn = null;
        // Reading means no bars: the first page turned by hand puts them away.
        if (commit && user && !zen) setZen(true);
      },
    });
    return turn;
  }

  /** Turns a page by itself (a tap, a key): the curl plays through, or with animations off it just turns. */
  function turnBy(dir) {
    if (zoomed()) return;
    if (turn) {
      if (!turn.ending) return;
      turn.finish();
    }
    const session = startTurn(dir, false);
    session?.auto();
  }

  // A press's listeners on the window (a drag held while the reader closes, by a key or the browser's Back): each one's
  // off, so the reader's end takes them away with it.
  const gestures = new Set();
  // A drag across the page turns it: sideways only (vertical does nothing), the sheet under the finger.
  text.addEventListener("pointerdown", (event) => {
    if (mode !== "pages" || !pages.length || openSheet || event.button > 0 || turn || zoomed() || pinch) return;
    const r = root.getBoundingClientRect();
    const sx = event.clientX;
    const sy = event.clientY;
    let session = null;
    let lastX = sx;
    let lastT = performance.now();
    let vx = 0;
    let moved = false;
    let travel = 0;
    let edge = false;
    const off = () => {
      gestures.delete(off);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
    };
    const move = (ev) => {
      // A second finger: it's a pinch, not a turn.
      if (pinch) return off();
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      travel = Math.max(travel, Math.abs(dx));
      if (!moved && Math.hypot(dx, dy) > 10) {
        moved = true;
        swallow = true;
      }
      if (!session) {
        if (edge || Math.abs(dx) < 9 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        session = startTurn((rtl() ? -dx : dx) < 0 ? 1 : -1, true, sy - r.top);
        if (!session) return void (edge = true);
      }
      const t = performance.now();
      // The flick's speed, smoothed (readersound: 0.4 of the old, 0.6 of the new).
      if (t > lastT) vx = vx * 0.4 + ((ev.clientX - lastX) / (t - lastT)) * 0.6;
      lastX = ev.clientX;
      lastT = t;
      session.move(rtl() ? r.right - ev.clientX : ev.clientX - r.left, ev.clientY - r.top);
    };
    const up = () => {
      off();
      if (session) {
        swallow = true;
        session.end(rtl() ? -vx : vx, travel);
      }
    };
    gestures.add(off);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  });

  // ---------- pinch zoom (readersound's): the page itself, 1–4× about the fingers ----------

  // The text's box scales about its top left (zoom.s) and moves (zoom.x, zoom.y), so what was under the fingers stays
  // under them. It never shows past its own edges; in scroll, moving it past its top or bottom scrolls the text.
  let zoom = { s: 1, x: 0, y: 0 };
  // A pinch under way: the scale it started at and the point of the text (unzoomed) under the fingers.
  let pinch = null;
  const zoomed = () => zoom.s > 1;
  function applyZoom() {
    const on = zoom.s !== 1 || zoom.x !== 0 || zoom.y !== 0;
    text.style.transform = on ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})` : "";
    root.toggleAttribute("data-zoomed", zoomed());
  }
  /** Where the text's box would be on the screen unzoomed (its top left). */
  function textOrigin() {
    const r = root.getBoundingClientRect();
    return { x: r.left + text.offsetLeft, y: r.top + text.offsetTop };
  }
  /** Keeps the box over the screen; in scroll, the part of a move past its top or bottom scrolls the text (scroll). */
  function clampZoom(scroll = false) {
    const w = text.offsetWidth;
    const h = text.offsetHeight;
    zoom.x = Math.min(0, Math.max(w * (1 - zoom.s), zoom.x));
    const y = Math.min(0, Math.max(h * (1 - zoom.s), zoom.y));
    if (scroll && mode === "scroll" && y !== zoom.y) text.scrollTop -= (zoom.y - y) / zoom.s;
    zoom.y = y;
  }
  function pinchStart(fx, fy) {
    // Never in the middle of a turn: a finger dragging a page keeps it.
    if (turn && !turn.ending) return;
    turn?.finish();
    hold.cancel();
    closePopover();
    const o = textOrigin();
    pinch = { s0: zoom.s, px: (fx - o.x - zoom.x) / zoom.s, py: (fy - o.y - zoom.y) / zoom.s };
    swallow = true;
  }
  function pinchMove(fx, fy, ratio) {
    if (!pinch) return;
    const o = textOrigin();
    zoom.s = Math.min(ZOOM_MAX, Math.max(1, pinch.s0 * ratio));
    zoom.x = fx - o.x - pinch.px * zoom.s;
    zoom.y = fy - o.y - pinch.py * zoom.s;
    clampZoom();
    applyZoom();
  }
  function pinchEnd() {
    if (!pinch) return;
    pinch = null;
    // The lift isn't a tap.
    swallow = true;
    if (zoom.s <= 1.02) resetZoom();
  }
  /** Back to the page as it is (a pinch out, or a change of layout). */
  function resetZoom() {
    pinch = null;
    if (zoom.s === 1 && zoom.x === 0 && zoom.y === 0) return;
    zoom = { s: 1, x: 0, y: 0 };
    applyZoom();
  }
  if ("GestureEvent" in window) {
    // iPhone and iPad: their own gesture events, with the scale (the app refuses them to the browser).
    text.addEventListener("gesturestart", (event) => {
      event.preventDefault();
      pinchStart(event.clientX, event.clientY);
    }, { passive: false });
    text.addEventListener("gesturechange", (event) => {
      event.preventDefault();
      pinchMove(event.clientX, event.clientY, event.scale);
    }, { passive: false });
    text.addEventListener("gestureend", (event) => {
      event.preventDefault();
      pinchEnd();
    }, { passive: false });
  } else {
    // Elsewhere: two touches, the scale from how far apart they are.
    const fingers = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2, Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)];
    let apart = 0;
    text.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 2) return;
      const [x, y, d] = fingers(event.touches);
      apart = d || 1;
      pinchStart(x, y);
    }, { passive: true });
    text.addEventListener("touchmove", (event) => {
      if (event.touches.length !== 2 || !pinch) return;
      event.preventDefault();
      const [x, y, d] = fingers(event.touches);
      pinchMove(x, y, d / apart);
    }, { passive: false });
    const lifted = (event) => pinch && event.touches.length < 2 && pinchEnd();
    text.addEventListener("touchend", lifted);
    text.addEventListener("touchcancel", lifted);
  }
  // Zoomed in, one finger moves the page about (a move isn't a tap).
  text.addEventListener("pointerdown", (event) => {
    if (!zoomed() || pinch || event.button > 0 || event.target.closest('[data-part="reader-hold"], [data-part="reader-handle"]')) return;
    const sx = event.clientX;
    const sy = event.clientY;
    let last = { x: sx, y: sy };
    let moved = false;
    const off = () => {
      gestures.delete(off);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
    };
    const move = (ev) => {
      if (pinch || !zoomed()) return off();
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) moved = true;
      if (!moved) return;
      zoom.x += ev.clientX - last.x;
      zoom.y += ev.clientY - last.y;
      last = { x: ev.clientX, y: ev.clientY };
      clampZoom(true);
      applyZoom();
    };
    const up = () => {
      off();
      if (moved) swallow = true;
    };
    gestures.add(off);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  });

  // A trackpad's sideways swipe (or shift and the wheel) turns one page per swipe; the wheel up and down does nothing.
  let wheelSum = 0;
  let wheelAt = 0;
  let wheelArmed = true;
  text.addEventListener(
    "wheel",
    (event) => {
      if (mode !== "pages" || event.ctrlKey || zoomed()) return;
      const k = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      const dx = (event.shiftKey ? event.deltaX || event.deltaY : Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.2 ? event.deltaX : 0) * k;
      if (!dx) return;
      event.preventDefault();
      const now = performance.now();
      if (now - wheelAt > 350) {
        wheelSum = 0;
        wheelArmed = true;
      }
      wheelAt = now;
      wheelSum += dx;
      if (!wheelArmed || Math.abs(wheelSum) < 40) return;
      wheelArmed = false;
      if (!openSheet) turnBy((rtl() ? -wheelSum : wheelSum) > 0 ? 1 : -1);
    },
    { passive: false },
  );

  /** Scroll or pages, keeping your place. */
  function applyMode(next) {
    if (next === mode) return;
    resetZoom();
    // Where you are, measured before the switch (changing how the text overflows resets its scroll on iPhone).
    const anchor = model ? anchorWord() : 0;
    dropTurn();
    mode = next;
    root.setAttribute("data-mode", next);
    if (!model) return;
    if (next === "pages") text.scrollTop = 0;
    else {
      flow.style.transform = "";
      flow.style.height = "";
      root.removeAttribute("data-variant");
      pages = [];
      disp = -1;
    }
    showWord(anchor);
    placeMarks();
  }

  const wordEl = (i) => (i >= mountA && i < mountA + wordEls.length ? wordEls[i - mountA] : null);

  /** The word at the reading line (40% down), or the nearest one to it; in pages, the page's first word. */
  function anchorWord() {
    if (mode === "pages" && disp >= 0) return mountA + pages[disp].a;
    if (!wordEls.length) return model ? model.chapters[mounted]?.word ?? 0 : 0;
    const r = text.getBoundingClientRect();
    const y = r.top + text.clientHeight * ANCHOR;
    const hit = document.elementFromPoint(r.left + text.clientWidth / 2, y)?.closest?.("[data-i]");
    if (hit && flow.contains(hit)) return Number(hit.getAttribute("data-i"));
    // Nearest by line: the first word whose line reaches below the reading line.
    const top = flow.getBoundingClientRect().top;
    let lo = 0;
    let hi = wordEls.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const w = wordEls[mid];
      if (top + w.offsetTop + w.offsetHeight < y) lo = mid + 1;
      else hi = mid;
    }
    return mountA + lo;
  }

  /** Scrolls so word i sits at `frac` of the way down the screen. */
  function pin(i, frac = ANCHOR) {
    const node = shownEl(i);
    if (!node) return;
    const r = text.getBoundingClientRect();
    text.scrollTop += node.getBoundingClientRect().top - (r.top + text.clientHeight * frac);
  }

  /** Shows word i: its chapter, with it on the reading line (or the chapter's top, for its first word); in pages, the
   * page holding it (keep: from spreadPin, the side of a spread it stays on). */
  function showWord(i, keep = null) {
    resetZoom();
    scrollFrom = null;
    mountChapter(model.chapters.length ? chapterOfWord(model, i) : 0);
    if (mode === "pages") {
      repaginate(keep);
      return setPage(pageOfWord(i));
    }
    if (i <= model.chapters[mounted].word) text.scrollTop = 0;
    else pin(i);
    lastWord = i;
  }

  // ---------- where you are ----------

  // In scroll, where reading last moved on from (null after a jump: the next scroll only notes where you are).
  let scrollFrom = null;
  // Your place is saved again only when you've moved: opening, a layout, leaving or hiding never dates it anew, so a
  // place that's older than where you got to on another device doesn't win over it (sync.js: the later one wins).
  let savedWord = null;
  const onPageShown = (i) => mode === "pages" && disp >= 0 && disp < pages.length && i >= mountA && i - mountA >= pages[disp].a && i - mountA <= pages[disp].b;
  function savePosition() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (demo || !model) return;
    if (savedWord != null && (savedWord === lastWord || onPageShown(savedWord))) return;
    savedWord = lastWord;
    store.setPosition(model.book.id, lastWord, model.book.version);
  }
  text.addEventListener(
    "scroll",
    () => {
      if (!model || mode === "pages") return;
      // A word's meaning goes once the text has really moved away from it (a scroll's last event can land just
      // after the tap that opened it).
      if (popover && Math.abs(text.scrollTop - popover.lxScrollTop) > 24) closePopover();
      lastWord = anchorWord();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        savePosition();
        // The text scrolled on: the words that went past the reading line were read.
        if (scrollFrom != null && lastWord > scrollFrom) {
          readPast(unmet(scrollFrom, lastWord - 1));
          // In scroll, a page is a screen: the words a screen holds, on average in this chapter.
          const perScreen = (wordEls.length * text.clientHeight) / Math.max(1, flow.scrollHeight);
          const from = Math.max(scrollFrom, suggestClock(model.book.id).hw);
          if (lastWord > from) readOn(lastWord, (lastWord - from) / Math.max(1, perScreen));
        }
        scrollFrom = lastWord;
      }, 400);
    },
    { passive: true },
  );
  const onVisibility = () => document.visibilityState === "hidden" && savePosition();
  document.addEventListener("visibilitychange", onVisibility);
  // A rotation, a resized window or a reader that's only now on the page reflows the text (and can change one page for
  // two): keep the word you were reading where it was. It's the reader's own box that counts, and the top bar's height
  // (its title takes a line or two): a chapter's first page and a picture book's page start below it (--reader-bar-h).
  let boxSize = "";
  const resized = new ResizeObserver(() => {
    const barH = Math.round(topBar.getBoundingClientRect().height);
    if (barH) root.style.setProperty("--reader-bar-h", `${barH}px`);
    const size = `${root.clientWidth}x${root.clientHeight}x${barH}`;
    if (size === boxSize) return;
    boxSize = size;
    if (!model) return;
    relayout(lastWord);
    placeMarks();
  });
  resized.observe(root);
  resized.observe(topBar);
  // The reading font may arrive after the first layout; pages measured before it would be wrong (and in scroll, the
  // highlights' ✦ placed by it).
  document.fonts?.ready.then(() => {
    if (ended || !model) return;
    if (mode === "pages") relayout(lastWord);
    else placeMarks();
  });

  // ---------- text size: live, keeping your word in place ----------

  // Your size, as set (a picture book shows it a size up: --reader-scale).
  const readSize = () => parseFloat(getComputedStyle(text).fontSize) / (parseFloat(getComputedStyle(root).getPropertyValue("--reader-scale")) || 1) || 19;
  const setSize = (px) => root.style.setProperty("--reader-size", `${px}px`);
  // The language a size is kept for: the one this book is read in (its weave's or help's), else its own.
  const sizeLang = () => (weave ? lang : bookLang());
  /** This book's language's size, as you set it, or its default (reader.css) until you do. */
  function useSize() {
    const own = prefs.sizes[sizeLang()];
    if (Number.isFinite(own)) setSize(own);
    else root.style.removeProperty("--reader-size");
  }
  let sizeAnchor = null;
  let sizeFrame = 0;
  function captureSizeAnchor() {
    // In pages: the page's first word, taken once per drag so it can't creep back a page at a time.
    if (mode === "pages") return void (sizeAnchor = { word: anchorWord() });
    const i = anchorWord();
    const node = wordEl(i);
    const r = text.getBoundingClientRect();
    const y = r.top + text.clientHeight * ANCHOR;
    const rect = node?.getBoundingClientRect();
    sizeAnchor = node ? { node, y, frac: (y - rect.top) / (rect.height || 1) } : null;
  }
  function applySize(px) {
    if (!sizeAnchor) captureSizeAnchor();
    setSize(px);
    if (mode === "pages") return relayout(sizeAnchor.word);
    reflowBreaks();
    if (sizeAnchor?.node.isConnected) {
      const rect = sizeAnchor.node.getBoundingClientRect();
      text.scrollTop = Math.max(0, text.scrollTop + rect.top + sizeAnchor.frac * rect.height - sizeAnchor.y);
    }
    placeMarks();
  }

  function sizeControl() {
    const input = el("input", { type: "range", min: TEXT_SIZE.min, max: TEXT_SIZE.max, step: TEXT_SIZE.step, value: prefs.sizes[sizeLang()] ?? readSize(), "aria-label": "Text size" });
    input.addEventListener("pointerdown", captureSizeAnchor);
    input.addEventListener("input", () => {
      sizeFrame ||= requestAnimationFrame(() => {
        sizeFrame = 0;
        applySize(Number(input.value));
      });
    });
    input.addEventListener("change", () => {
      // The last step lands now, so where you are is measured on the new layout.
      if (sizeFrame) {
        cancelAnimationFrame(sizeFrame);
        sizeFrame = 0;
        applySize(Number(input.value));
      }
      sizeAnchor = null;
      prefs.sizes = { ...prefs.sizes, [sizeLang()]: Number(input.value) };
      saveReaderPrefs(prefs);
      lastWord = anchorWord();
      savePosition();
    });
    return el(
      "div",
      { part: "reader-size" },
      el("span", { class: "lx-reader-a", "data-size": "sm", "aria-hidden": "true" }, "A"),
      input,
      el("span", { class: "lx-reader-a", "data-size": "lg", "aria-hidden": "true" }, "A"),
    );
  }

  // ---------- suggested words (readersound's syllabus) ----------

  // The words lit up now (lemma keys). They're English where they show; a tap offers one.
  const suggested = new Set();
  // The learning order, taken once a sitting (the language's frequency list may arrive part way through one).
  let orderNow = null;
  let orderOf = null;
  const order = () => {
    if (orderOf !== weave) {
      orderNow = learningOrder(weave, lang);
      orderOf = weave;
    }
    return orderNow;
  };
  // A help book has nothing to light up (its words are all in the language already).
  const suggesting = () => !demo && !know && weaveOn() && weave.kind !== "help";
  /** Word `to` read for the first time, `count` pages of new text: the count goes on, and at the setting's number the
   * suggestions come. Back and forth over pages read before counts nothing. */
  function readOn(to, count) {
    if (!suggesting()) return;
    const clock = suggestClock(model.book.id);
    if (to <= clock.hw) return;
    setSuggestClock(model.book.id, { pages: clock.pages + count, hw: to });
    suggest();
  }
  /** Lights up the next words to learn, if the count has reached the setting (and none are up). */
  function suggest() {
    const after = weavePrefs(prefs, lang).suggest;
    if (!suggesting() || !after) {
      clearSuggestions();
      return;
    }
    if (suggested.size || suggestClock(model.book.id).pages < after) return;
    for (const lemma of order()) {
      if (suggested.size >= SUGGEST_N) break;
      if (!known(lemma)) suggested.add(lemmaKey(lemma));
    }
    paintSuggestions();
  }
  // Lit up in place: a wash behind words already on the page, so nothing moves.
  function paintSuggestions() {
    for (const key of suggested) {
      for (const i of occurrences.get(key) ?? []) {
        const node = wordEl(i);
        if (node && !node.hidden && !node.hasAttribute("data-part")) node.setAttribute("data-part", "reader-suggestion");
      }
    }
  }
  function clearSuggestions() {
    suggested.clear();
    for (const node of flow.querySelectorAll('[data-part="reader-suggestion"]')) node.removeAttribute("data-part");
  }
  /** The count starts again from where you are, and the words lit up go. */
  function restartCount() {
    if (!suggesting()) return;
    setSuggestClock(model.book.id, { pages: 0, hw: mode === "pages" && disp >= 0 ? mountA + pages[disp].a : lastWord });
    clearSuggestions();
  }
  /** Looking a word up: you're still working on the words you have (unless that's turned off). */
  const peeked = () => weavePrefs(prefs, lang).peekResets && restartCount();
  /** Adds a word where you are (its English fades in from here), and the count starts again. */
  function learn(lemma, i) {
    restartCount();
    addWord(lang, lemma, { at: i, book: model.book.id });
  }
  /** A suggested word, tapped: what it would become, and a deliberate "Add" (a stray tap adds nothing). */
  function offer(span) {
    closePopover();
    const i = Number(span.getAttribute("data-i"));
    const sentence = sentenceOf(i);
    const [target, lemma] = sentence?.t[i - sentence.s] ?? [];
    if (!lemma) return;
    const name = LANGUAGES[lang]?.name ?? lang;
    const dutch = plainWord(target) || target;
    const english = plainWord(model.words[i]) || model.words[i];
    const node = el(
      "div",
      { part: "word-popover", role: "dialog", "aria-label": `A word to learn: ${dutch}, ${english}` },
      el("span", { class: "lx-small lx-muted" }, "A word to learn next"),
      el("strong", { lang }, dutch),
      el("span", {}, english),
      el(
        "div",
        { class: "lx-row" },
        ui.speakButton(() => speakWord(dutch), { label: `Hear ${dutch}` }),
        ui.button("Not now", { variant: "fade", size: "sm", onclick: () => closePopover() }),
        ui.button(`Add to ${name}`, {
          variant: "go",
          size: "sm",
          onclick: () => {
            closePopover();
            learn(lemma, i);
          },
        }),
      ),
    );
    showPopover(node, span);
  }

  // ---------- words you already know (readersound's onboarding) ----------

  // Words added from the grid are saved quietly; the text is laid out once, when you leave it.
  let knownAdded = 0;
  function knownDone() {
    if (!knownAdded) return;
    knownAdded = 0;
    announce();
  }
  /** The next words in the learning order you might know: tap the ones you do, pass over the rest. */
  function showKnownGrid() {
    const name = LANGUAGES[lang]?.name ?? lang;
    const passed = new Set(notYet(lang));
    const queue = order().map(lemmaKey).filter((lemma) => !known(lemma) && !passed.has(lemma));
    let next = 0;
    const take = () => {
      while (next < queue.length) {
        const lemma = queue[next++];
        if (!inBank(lang, lemma)) return lemma;
      }
      return null;
    };
    const grid = el("div", { part: "known-grid" });
    const count = el("span", { class: "lx-muted" });
    const done = el("div", { part: "empty-state", hidden: true }, `That's every word in this text's list. The ones you passed over still come up as you read.`);
    let added = 0;
    const settle = () => {
      done.hidden = grid.children.length > 0;
      others.hidden = !grid.children.length;
      count.textContent = added ? `${added} added.` : "";
    };
    // A cell's place keeps its order: the next word takes the place of the one you answered.
    const refill = (cell) => {
      const lemma = take();
      if (!lemma) return void cell?.remove();
      const fresh = knownWordCell(lemma, { lang, onKnow, onNotYet });
      if (cell) cell.replaceWith(fresh);
      else grid.append(fresh);
      motion.appear(fresh);
    };
    function onKnow(cell, lemma) {
      addWord(lang, lemma, { quiet: true });
      knownAdded++;
      added++;
      cell.setAttribute("data-state", "known");
      motion.leave(cell, { dx: 0, dy: -12 });
      refill(cell);
      settle();
    }
    function onNotYet(cell, lemma) {
      addNotYet(lang, [lemma]);
      motion.leave(cell, { dx: 0, dy: 12 });
      refill(cell);
      settle();
    }
    const others = ui.button("Show others", {
      variant: "fade",
      size: "sm",
      icon: "refresh",
      onclick: () => {
        const cells = [...grid.children];
        addNotYet(lang, cells.map((cell) => cell.getAttribute("data-lemma")));
        for (const cell of cells) {
          motion.leave(cell, { dx: 0, dy: 12 });
          refill(cell);
        }
        settle();
      },
    });
    for (let k = 0; k < KNOWN_SLOTS; k++) refill(null);
    settings.lxBody.replaceChildren(
      el("div", { class: "lx-reader-sheet-back" }, ui.backButton({ label: "Reading settings", onclick: () => buildSettings() })),
      ui.group(
        "Words you already know",
        [el("li", { class: "lx-known-row" }, el("p", { class: "lx-muted" }, weave.kind === "help" ? `This text's most used words you don't have yet. Tap the ones you know and their ${LANGUAGES[weave.to]?.name ?? weave.to} goes; × passes one over.` : `This text's most common words you don't have yet. Tap the ones you know and they show in ${name}; × passes one over.`, " ", count), grid, done, el("div", { class: "lx-row" }, others))],
      ),
    );
    settle();
  }

  // ---------- definitions ----------

  // This text's definitions: of the words its layer teaches (keyed by their lemma) and of its own words.
  let defs = { layer: null, book: null };
  /** A lemma's senses from the layer's definitions ([] when it has none). */
  const sensesOf = (lemma) => (lemma && defs.layer?.file.entries[lemma]?.senses) || [];
  /** A word of the book in its own definitions: { lemma, senses } or { lemma, expands } (a contraction), or null. */
  function ownSenses(i) {
    const file = defs.book?.file;
    if (!file) return null;
    const word = plainWord(model.words[i] ?? "");
    for (const form of [word, word.toLowerCase()]) {
      const lemma = file.forms?.[form] ?? form;
      if (lemma.includes(" ")) return { lemma: form, expands: lemma };
      if (file.entries[lemma]) return { lemma, senses: file.entries[lemma].senses };
    }
    return null;
  }
  /** Whether word i is shown in the language being learned (then its layer's definitions are its), or as the book has it. */
  const shownLearned = (i) => weave?.kind === "help" || Boolean(wordEl(i)?.closest?.('[data-part="woven-word"], [data-part="reader-sentence"]'));

  /** A word's meanings (part word-senses): each its part of speech, its definition and an example with its translation. */
  function meaningsBlock(senses, { learnedLang = lang, inLang = "en" } = {}) {
    if (!senses?.length) return null;
    return el(
      "div",
      { class: "lx-card-meanings" },
      el("p", { class: "lx-small lx-muted lx-card-literal-label" }, senses.length === 1 ? "Meaning" : "Meanings"),
      el(
        "ol",
        { part: "word-senses" },
        ...senses.map((sense) =>
          el(
            "li",
            {},
            el("span", { class: "lx-sense-pos" }, sense.pos),
            el("span", { class: "lx-sense-def", lang: inLang }, sense.def),
            sense.example ? el("span", { class: "lx-sense-example" }, el("span", { lang: learnedLang }, sense.example[0]), el("span", { class: "lx-muted", lang: inLang }, sense.example[1])) : null,
          ),
        ),
      ),
    );
  }

  /** Define in the toolbar over one word, when there are definitions for it as it's shown. */
  function defineAction(lo, hi) {
    if (hi > holdUnit(lo)[1] || wordEl(lo)?.getAttribute("data-part") === "reader-sentence") return null;
    const open = shownLearned(lo) ? (sensesOf(aboutWord(lo).lemma).length ? () => openWordCard(lo) : null) : ownSenses(lo) ? () => openDefineCard(lo) : null;
    if (!open) return null;
    return el("button", { type: "button", onclick: () => (hold.cancel(), open()) }, "Define");
  }

  /** A word of the book's own, defined (readersound's Define): the word, its base form, its senses (or what it stands for). */
  function openDefineCard(i) {
    const found = ownSenses(i);
    if (!found) return;
    const word = plainWord(model.words[i]);
    const bookLang = model.book.lang ?? "en";
    const body = el(
      "div",
      { part: "word-card" },
      el("div", { class: "lx-card-head" }, el("strong", { lang: bookLang }, word)),
      found.lemma.toLowerCase() !== word.toLowerCase() ? el("p", { class: "lx-card-lemma", lang: bookLang }, found.lemma) : null,
      found.expands ? el("dl", { class: "lx-card-facts" }, el("dt", {}, "Short for"), el("dd", { lang: bookLang }, found.expands)) : meaningsBlock(found.senses, { learnedLang: bookLang, inLang: defs.book.file.in }),
    );
    showCard(body, "Word");
  }

  /** A license, linked when it's a Creative Commons one (SPDX: CC-BY-SA-4.0 → its deed). */
  function licenseLink(spdx) {
    const name = String(spdx ?? "").replace(/^CC-/, "CC ").replace(/-(\d)/, " $1").replace(/-/g, " ");
    const cc = /^CC-(BY(?:-SA|-ND|-NC|-NC-SA|-NC-ND)?)-(\d\.\d)$/.exec(spdx ?? "");
    const zero = /^CC0-1\.0$/.test(spdx ?? "");
    const url = cc ? `https://creativecommons.org/licenses/${cc[1].toLowerCase()}/${cc[2]}/` : zero ? "https://creativecommons.org/publicdomain/zero/1.0/" : null;
    const label = cc ? `CC ${cc[1].replace(/-/g, "-")} ${cc[2]}` : zero ? "CC0 1.0" : name;
    return url ? el("a", { href: url, target: "_blank", rel: "noopener" }, label) : label;
  }

  /** Definitions the library has for this text that this device doesn't (or older ones): fetched, checked, kept, used. */
  async function newerDefinitions(text, layerTo, layer) {
    const catalog = await loadCatalog();
    const meta = catalog?.books?.find((b) => b.id === text.id && b.version === text.version);
    if (!meta || ended) return;
    const entry = meta.layers?.[layerTo];
    if (layer && entry?.definitions?.url && entry.definitions.url !== defs.layer?.url) {
      const found = await fetchDefinitions(text, entry.definitions, { layer, layerUrl: entry.url });
      if (found && !ended) {
        await store.keepDefinitions(text.id, layerTo, found);
        defs = { ...defs, layer: found };
      }
    }
    if (meta.definitions?.url && meta.definitions.url !== defs.book?.url) {
      const found = await fetchDefinitions(text, meta.definitions);
      if (found && !ended) {
        await store.keepDefinitions(text.id, "book", found);
        defs = { ...defs, book: found };
      }
    }
  }

  // ---------- a word's card and a sentence's card ----------

  // The language you read the book in beside the one you're learning (a weave's from, a help book's to).
  const readIn = () => (weave?.kind === "help" ? weave.to : weave?.from) ?? HELP_IN;
  /** Word i as the layer has it: the word in the language being learned, its base form, its English here, its sentence. */
  function aboutWord(i) {
    const sentence = sentenceOf(i);
    const [t0, lemma] = sentence?.t[i - sentence.s] ?? [];
    const help = weave?.kind === "help";
    return {
      sentence,
      lemma: lemma ?? null,
      learned: plainWord((help ? model.words[i] : t0) ?? ""),
      english: plainWord(wordEl(i)?.getAttribute("data-en") || ((help ? t0 : model.words[i]) ?? "")),
    };
  }
  /** A sentence in both languages, and its word-order line (the English in the learned language's order), if it has one. */
  function bothOf(sentence) {
    const own = bookText(model.words.slice(sentence.s, sentence.e));
    const help = weave.kind === "help";
    return { learned: help ? own : sentence.text, yours: help ? sentence.text : own, literal: !help && sentence.m?.length ? literalOf(sentence) : null };
  }
  function sentenceBlock(sentence, { speak = false } = {}) {
    const both = bothOf(sentence);
    const name = LANGUAGES[lang]?.name ?? lang;
    const yourName = LANGUAGES[readIn()]?.name ?? readIn();
    return el(
      "div",
      { class: "lx-card-sentence" },
      ui.sentenceRow({ text: both.learned, natural: both.yours, lang, more: speak ? ui.speakButton(() => speakWord(both.learned, { lang }), { label: "Hear the sentence" }) : undefined }),
      both.literal ? el("p", { class: "lx-small lx-muted lx-card-literal-label" }, `The ${yourName} in ${name} order`) : null,
      both.literal ? ui.literalLine(both.literal, { part: "reader-literal", lang }) : null,
    );
  }
  function showCard(body, label) {
    closePopover();
    closeSheet({ animate: false });
    cardSheet.setAttribute("aria-label", label);
    cardSheet.lxBody.replaceChildren(body);
    cardSheet.hidden = false;
    openSheet = cardSheet;
    motion.appear(cardSheet);
  }

  /**
   * Word i's card (part word-card): the word and its base form, hear it, its English here, how often it's in this text
   * (and as what), its sentence in both languages, adding it to your words or taking it out, and Ask your AI.
   */
  // tapped: the word as tapped ({ learned, lemma }), where it isn't the word at i's own (a flipped sentence's).
  function openWordCard(i, tapped = null) {
    if (!weave) return;
    const { sentence, lemma, learned, english } = { ...aboutWord(i), ...(tapped ?? {}) };
    if (!learned) return;
    const name = LANGUAGES[lang]?.name ?? lang;
    const yourName = LANGUAGES[readIn()]?.name ?? readIn();
    const help = weave.kind === "help";
    const { count, english: as } = lemma ? inThisBook(lemma) : { count: 0, english: [] };
    const mine = lemma && !know ? inBank(lang, lemma) : false;
    const toggle =
      lemma && !know
        ? ui.button(mine ? (help ? `Show its ${yourName}` : `↩ ${yourName}`) : help ? "I know it" : `→ ${name}`, {
            variant: "gray",
            size: "sm",
            onclick: () => {
              if (mine) removeWord(lang, lemma);
              else if (help) addWord(lang, lemma);
              else learn(lemma, i);
              openWordCard(i, tapped);
            },
          })
        : null;
    const ask = demo ? null : askAboutWord(learned, lemma, i, () => body);
    const facts = [el("dt", {}, `${yourName} here`), el("dd", {}, english || "—")];
    if (count) facts.push(el("dt", {}, "In this text"), el("dd", {}, `${count === 1 ? "Once" : `${count} times`}${as.length > 1 ? `, as ${as.join(", ")}` : ""}`));
    const body = el(
      "div",
      { part: "word-card" },
      el("div", { class: "lx-card-head" }, el("strong", { lang }, learned), ui.speakButton(() => speakWord(learned, { lang }), { label: `Hear ${learned}` })),
      lemma && lemma.toLowerCase() !== learned.toLowerCase() ? el("p", { class: "lx-card-lemma", lang }, lemma) : null,
      el("dl", { class: "lx-card-facts" }, ...facts),
      meaningsBlock(sensesOf(lemma), { inLang: defs.layer?.file.in }),
      sentence ? sentenceBlock(sentence) : null,
      toggle || ask ? el("div", { class: "lx-card-actions" }, toggle, ask?.button) : null,
      ask?.status ?? null,
    );
    showCard(body, "Word");
  }

  /** A sentence's card (part sentence-card): the sentence in both languages, its word-order line, hear it, Copy. */
  function openSentenceCard(sentence) {
    if (!weave || !sentence) return;
    const both = bothOf(sentence);
    const copy = ui.button("Copy", { variant: "gray", size: "sm", onclick: () => navigator.clipboard?.writeText(both.learned).catch(() => {}) });
    showCard(el("div", { part: "sentence-card" }, sentenceBlock(sentence, { speak: true }), el("div", { class: "lx-card-actions" }, copy)), "Sentence");
  }

  /** The held words' preview opens their card: one word (or an idiom) its word's, more (or a whole sentence) the sentence's. */
  function cardFromPreview(preview, lo, hi) {
    if (!preview || !weave || !sentenceOf(lo)) return;
    const whole = hi > holdUnit(lo)[1] || wordEl(lo)?.getAttribute("data-part") === "reader-sentence";
    const open = () => {
      hold.cancel();
      if (whole) openSentenceCard(sentenceOf(lo));
      else openWordCard(lo);
    };
    preview.setAttribute("role", "button");
    preview.setAttribute("tabindex", "0");
    preview.setAttribute("aria-label", whole ? "The sentence's card" : "The word's card");
    preview.append(el("span", { class: "lx-preview-more", "aria-hidden": "true" }, icon("chevron")));
    preview.addEventListener("click", open);
    preview.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    });
  }

  // ---------- highlights and notes ----------

  // Your highlights in this text (highlights.js): the ones made on this version of it are drawn; any from an earlier
  // version are only listed (its words may have moved since).
  let highlights = [];
  const drawn = () => highlights.filter((h) => h.version === model.book.version);
  const marksOn = () => prefs.marks !== false;
  const keepHighlight = (row) => (demo ? Promise.resolve() : saveHighlight(row)).catch((error) => console.error("[lexicommons] a highlight wasn't saved:", error));

  /**
   * Highlight and Note for the toolbar over words lo..hi; on words highlighted just so, that highlight's note and a
   * way to take it out.
   */
  function markActions(lo, hi) {
    if (!marksOn() || !model) return [];
    const action = (label, onclick) => el("button", { type: "button", onclick }, label);
    const same = drawn().find((h) => h.start === lo && h.end === hi);
    if (same) {
      return [
        action("Note", () => {
          hold.cancel();
          openNote(same.id, { focus: !same.note });
        }),
        action("Remove highlight", () => {
          hold.cancel();
          unmark(same.id);
        }),
      ];
    }
    return [action("Highlight", () => mark(lo, hi)), action("Note", () => mark(lo, hi, { note: true }))];
  }
  function mark(lo, hi, { note = false } = {}) {
    hold.cancel();
    const row = newHighlight({ book: model.book.id, version: model.book.version, start: lo, end: hi, quote: bookText(model.words.slice(lo, hi + 1)) });
    highlights = [...highlights, row].sort((a, b) => a.start - b.start || a.end - b.end);
    keepHighlight(row);
    paintHighlights();
    if (note) openNote(row.id, { focus: true });
  }
  function unmark(id) {
    highlights = highlights.filter((h) => h.id !== id);
    if (!demo) removeHighlight(id).catch((error) => console.error("[lexicommons] a highlight wasn't taken out:", error));
    paintHighlights();
  }

  // Highlights from your other devices (a sync): this text's, as they are now, and the ones a deletion from your
  // storage took here, kept to restore (the highlights list shows them).
  let removedMarks = [];
  async function loadRemoved() {
    if (demo || !model) return;
    const removed = await removedHighlightsOf(model.book.id).catch(() => []);
    if (ended || !model) return;
    const before = removedMarks.map((r) => r.id).join();
    removedMarks = removed;
    if (openSheet === marksSheet && removed.map((r) => r.id).join() !== before) buildMarks();
  }
  async function refreshMarks() {
    if (demo || !model) return;
    const now = await highlightsOf(model.book.id).catch(() => null);
    if (ended || !model || !now) return;
    highlights = now;
    paintHighlights();
    if (openSheet === marksSheet) buildMarks();
    loadRemoved();
  }
  const stopMarks = demo ? null : onHighlightsChange(({ synced }) => synced && refreshMarks());
  /** Puts back a highlight another device took out. */
  async function restoreMark(id) {
    const row = await restoreRemoved(id).catch(() => null);
    if (!row || ended) return;
    removedMarks = removedMarks.filter((r) => r.id !== id);
    if (row.book === model?.book.id) highlights = [...highlights.filter((h) => h.id !== row.id), row].sort((a, b) => a.start - b.start || a.end - b.end);
    paintHighlights();
    buildMarks();
  }

  // A highlight's last word that's shown (a hidden word's place is held by its whole sentence or its idiom).
  function endOf(h) {
    const i = Math.min(h.end, mountA + wordEls.length - 1);
    return i >= Math.max(h.start, mountA) ? shownEl(i) : null;
  }

  /**
   * Paints the chapter's highlights (data-highlight on their words, "noted" with a note), and puts each one's ✦ after
   * the block holding its last word, so it rides the page and the curl's copy of it; placeMarks sets it in the margin.
   */
  function paintHighlights() {
    for (const node of flow.querySelectorAll("[data-highlight]")) node.removeAttribute("data-highlight");
    for (const node of flow.querySelectorAll('[data-part="reader-note-mark"]')) node.remove();
    if (!model || mounted < 0) return;
    const last = mountA + wordEls.length - 1;
    for (const h of drawn()) {
      if (h.end < mountA || h.start > last) continue;
      for (let i = Math.max(h.start, mountA); i <= Math.min(h.end, last); i++) {
        const node = shownEl(i);
        if (node && node.getAttribute("data-highlight") !== "noted") node.setAttribute("data-highlight", h.note ? "noted" : "");
      }
      // Its ✦ is with its last word: in a later chapter, it's there.
      if (h.end > last) continue;
      const block = endOf(h)?.closest(".lx-reader-flow > *");
      if (!block) continue;
      const label = h.note ? `Your note: ${h.note}` : "Your highlight: add a note, or take it out";
      block.after(el("button", { part: "reader-note-mark", type: "button", state: h.note ? "noted" : undefined, "data-highlight-id": h.id, "aria-label": label, onclick: () => openNote(h.id) }, "✦"));
    }
    placeMarks();
  }

  /** Sets each ✦ in the margin beside its highlight's last word: at the text's right edge, or in a spread its column's
   * (the left edge in a right-to-left book, where its lines end). */
  function placeMarks() {
    const marks = flow.querySelectorAll('[data-part="reader-note-mark"]');
    if (!marks.length) return;
    const box = flow.getBoundingClientRect();
    const spread = root.getAttribute("data-variant") === "spread";
    const gap = spread ? parseFloat(getComputedStyle(flow).columnGap) || 0 : 0;
    const column = spread ? (flow.clientWidth - gap) / 2 : flow.clientWidth;
    for (const node of marks) {
      const h = highlights.find((row) => row.id === node.getAttribute("data-highlight-id"));
      // Not laid out yet (a reader still off the page): placed once it is (the reader's resize).
      const lines = h ? endOf(h)?.getClientRects() : null;
      const at = lines?.[lines.length - 1];
      node.hidden = !at;
      if (!at) continue;
      // Flow coordinates: the flow's own move (a page, a spread) is in both rectangles, so it cancels out; a zoom
      // scales both, so it's divided out.
      // Its column, counted from the side a line starts on.
      const along = rtl() ? (box.right - at.right) / zoom.s : (at.left - box.left) / zoom.s;
      const k = spread ? Math.max(0, Math.floor((along + gap / 2) / (column + gap))) : 0;
      const end = k * (column + gap) + column;
      node.style.left = `${rtl() ? flow.clientWidth - end - 6 : end - 6}px`;
      node.style.top = `${(at.top - box.top + at.height / 2) / zoom.s - 15}px`;
    }
  }

  /** Highlights and notes (readersound's sheet): how to make one, then yours by chapter; a tap opens the text there. */
  function buildMarks() {
    const titled = (row) => {
      row.querySelector(".lx-row-title")?.setAttribute("lang", model.book.lang ?? "en");
      return row;
    };
    const groups = [];
    let chapter = -1;
    let rows = [];
    const flush = () => {
      if (rows.length) groups.push(ui.group(model.chapters[chapter].title, rows));
      rows = [];
    };
    for (const h of drawn()) {
      const ci = chapterOfWord(model, h.start);
      if (ci !== chapter) {
        flush();
        chapter = ci;
      }
      rows.push(
        titled(
          ui.listRow({
            title: `“${h.quote}”`,
            sub: h.note || undefined,
            trailing: h.note ? el("span", { class: "lx-reader-noted", "aria-label": "With a note" }, "✦") : el("span"),
            onclick: () => {
              closeSheet({ animate: false });
              showWord(h.start);
            },
          }),
        ),
      );
    }
    flush();
    const earlier = highlights.filter((h) => h.version !== model.book.version);
    if (earlier.length) {
      groups.push(
        ui.group(
          "From an earlier version of this text",
          earlier.map((h) =>
            titled(
              ui.listRow({
                title: `“${h.quote}”`,
                sub: h.note || undefined,
                trailing: ui.iconButton("cross", "Take this highlight out", {
                  onclick: () => {
                    unmark(h.id);
                    buildMarks();
                  },
                }),
              }),
            ),
          ),
          "The text has changed since you made these, so they can't be shown in it.",
        ),
      );
    }
    if (removedMarks.length) {
      const day = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      groups.push(
        ui.group(
          "Removed on another device",
          removedMarks.map((r) =>
            titled(
              ui.listRow({
                title: `“${r.row.quote}”`,
                sub: `Removed ${day(r.at)} · you can restore it until ${day(r.until)}`,
                trailing: ui.button("Restore", { size: "sm", onclick: () => restoreMark(r.id) }),
              }),
            ),
          ),
          `A highlight removed on another device, through your storage, is kept here for ${RESTORE_DAYS} days. Restored, it comes back on your other devices too.`,
        ),
      );
    }
    const how = marksOn()
      ? "Hold a word (drag a handle to take in more), then Highlight or Note. Tap the ✦ beside a highlight for its note."
      : "Highlight and note are off: they're under More settings in the reading settings.";
    const empty = ui.group("Highlights and notes", [el("li", { part: "list-row" }, el("span", { class: "lx-row-text lx-muted" }, "None yet."))], how);
    marksSheet.lxBody.replaceChildren(...(groups.length ? [el("p", { class: "lx-small lx-muted lx-reader-sheet-intro" }, how), ...groups] : [empty]));
  }

  // The note being written: kept however its sheet closes (Save, the handle, a tap outside, Escape).
  let noting = null;
  /** A highlight's note (part reader-note): its words, your note, Remove highlight and Save. focus: to write at once. */
  function openNote(id, { focus = false } = {}) {
    const h = highlights.find((row) => row.id === id);
    if (!h) return;
    closePopover();
    closeSheet({ animate: false });
    const field = el("textarea", { part: "text-field", name: "note", rows: 4, placeholder: "Your note", "aria-label": "Your note" });
    field.value = h.note;
    noting = { id, field };
    noteSheet.lxBody.replaceChildren(
      el(
        "div",
        { part: "reader-note" },
        el("blockquote", { lang: model.book.lang ?? "en" }, `“${h.quote}”`),
        field,
        el(
          "div",
          { class: "lx-reader-note-actions" },
          ui.button("Remove highlight", {
            variant: "fade",
            onclick: () => {
              noting = null;
              closeSheet();
              unmark(id);
            },
          }),
          ui.button("Save", { variant: "go", onclick: () => closeSheet() }),
        ),
      ),
    );
    openSheet = noteSheet;
    noteSheet.lxShow();
    if (focus) field.focus({ preventScroll: true });
  }
  function keepNote() {
    if (!noting) return;
    const { id, field } = noting;
    noting = null;
    const at = highlights.findIndex((row) => row.id === id);
    const note = field.value.trim();
    if (at < 0 || highlights[at].note === note) return;
    highlights[at] = { ...highlights[at], note };
    keepHighlight(highlights[at]);
    paintHighlights();
  }

  // ---------- the sheets' contents ----------

  // The reading settings (Reading settings): what most change at once (the size, pages or scroll, the help on or off)
  // and your lists; the rest a press away, under More settings, open again next time if you left it open.
  const MORE_OPEN = "lx.reader.more";
  function moreSettings(rows) {
    let open = false;
    try {
      open = localStorage.getItem(MORE_OPEN) === "1";
    } catch {
      // Private browsing: it opens closed.
    }
    const node = el("details", { class: "lx-quiet-more lx-reader-more", open: open || undefined }, el("summary", {}, "More settings"), el("ul", { part: "list" }, rows));
    node.addEventListener("toggle", () => {
      try {
        localStorage.setItem(MORE_OPEN, node.open ? "1" : "0");
      } catch {
        // Private browsing: it stays as it is for this visit.
      }
    });
    return node;
  }

  function buildSettings() {
    knownDone();
    const parts = weave ? weaveParts() : parallel ? besideSettings() : { top: [], lists: [], note: null, more: [] };
    const groups = [
      ui.group(null, [el("li", { part: "list-row", class: "lx-reader-size-row" }, sizeControl())]),
      ui.group(null, [
        ui.choiceRow({
          title: "Turn pages or scroll",
          options: [["pages", "Pages"], ["scroll", "Scroll"]],
          value: mode,
          onchange: (next) => {
            // The same setting as Settings → Appearance → Reader (a demo leaves yours alone).
            if (!demo) theme.setPreset("reader", next);
            applyMode(next);
          },
        }),
        ...parts.top,
      ]),
      parts.lists.length || parts.note ? ui.group(null, parts.lists, parts.note) : null,
      moreSettings([
        ...parts.more,
        ui.switchRow({
          title: "Highlight and note",
          checked: marksOn(),
          onchange: (on) => {
            prefs.marks = on;
            saveReaderPrefs(prefs);
          },
        }),
      ]),
      demo ? null : ui.group(null, [removeRow()]),
    ].filter(Boolean);
    settings.lxBody.replaceChildren(...groups);
  }

  /** A book with a translation beside it: the switch a help layer's English has (helpOn, for the book's language), saying what it shows. */
  function besideSettings() {
    const name = LANGUAGES[parallel.to]?.name ?? parallel.to;
    const now = weavePrefs(prefs, model.book.lang);
    const set = (helpOn) => {
      prefs.weave[model.book.lang] = { ...weavePrefs(prefs, model.book.lang), helpOn };
      saveReaderPrefs(prefs);
      rewave();
    };
    return { top: [ui.switchRow({ title: `${name} translation`, checked: now.helpOn, onchange: set })], lists: [], note: null, more: [] };
  }

  /** How much of this text's words you know: [have, total]. */
  function knownCount() {
    let total = 0;
    let have = 0;
    for (const sentence of weave.sentences) for (const [, lemma] of sentence.t) if (lemma) {
      total++;
      if (known(lemma)) have++;
    }
    return [have, total];
  }
  const share = (have, total) => (total ? Math.round((have / total) * 100) : 0);

  /**
   * The layer's settings, in their places: top (on or off), lists (your words, the words you know) with a note of how
   * much you know, more (the rest). A help book: its help on or off, over the words or in place. A woven book: woven in
   * or not; when a sentence turns whole, its Dutch-order line, Dutch word order, the tint, the underline, suggesting
   * words, a lookup counting.
   */
  function weaveParts() {
    const set = (change) => {
      prefs.weave[lang] = { ...weavePrefs(prefs, lang), ...change };
      saveReaderPrefs(prefs);
      rewave();
    };
    const now = weavePrefs(prefs, lang);
    const [have, total] = knownCount();
    // A demo's words are its own (know), so it has no list of yours, and nothing to suggest.
    const lists = know
      ? []
      : [ui.listRow({ title: "Your words", value: String(bankWords(lang).length), onclick: () => showWords() }), ui.listRow({ title: "Words you already know", onclick: () => showKnownGrid() })];
    if (weave.kind === "help") {
      const helpName = LANGUAGES[weave.to]?.name ?? weave.to;
      return {
        top: [ui.switchRow({ title: `${helpName} help`, checked: now.helpOn, onchange: (helpOn) => set({ helpOn }) })],
        lists,
        note: `You know ${have} of its ${total} words (${share(have, total)}%). Tap one for its ${helpName}.`,
        more: [ui.choiceRow({ title: `Where the ${helpName} goes`, options: [["over", "Over the words"], ["place", "In place"]], value: now.help, onchange: (help) => set({ help }) })],
      };
    }
    const name = LANGUAGES[lang]?.name ?? lang;
    return {
      top: [ui.switchRow({ title: `${name} woven in`, checked: now.on, onchange: (on) => set({ on }) })],
      lists,
      note: `You know ${have} of its ${total} words (${share(have, total)}%). Tap one for its meaning.`,
      more: [
        ui.choiceRow({
          title: `A sentence turns all ${name} when you know`,
          options: FLIP_CHOICES.map((share) => [String(share), share > 100 ? "Never" : share === 100 ? "All" : `${share}%`]),
          value: String(now.flipAt),
          onchange: (value) => set({ flipAt: Number(value) }),
        }),
        ui.choiceRow({
          title: `The ${name}-order line under a whole sentence`,
          options: [["shown", "Shown"], ["tap", "On tap"]],
          value: now.literal,
          onchange: (literal) => set({ literal }),
        }),
        ui.switchRow({ title: `${name} word order`, checked: now.order, onchange: (order) => set({ order }) }),
        ui.switchRow({ title: `Tint the ${name} words`, checked: now.tint, onchange: (tint) => set({ tint }) }),
        ui.switchRow({ title: `Underline the ${name} words`, checked: now.underline, onchange: (underline) => set({ underline }) }),
        know
          ? null
          : ui.choiceRow({
              title: "Suggest words to learn",
              options: [["3", "3 pages"], ["5", "5 pages"], ["10", "10 pages"], ["0", "Never"]],
              value: String(now.suggest),
              onchange: (value) => {
                set({ suggest: Number(value) });
                suggest();
              },
            }),
        know ? null : ui.switchRow({ title: "Looking a word up counts", sub: `Checking ${withArticle(name)} word starts that count again, so no new words come while you're still working on the ones you have`, checked: now.peekResets, onchange: (peekResets) => set({ peekResets }) }),
      ].filter(Boolean),
    };
  }

  // ---------- your words ----------

  /** How many times a word is in this book, and the English it stands for there (most often first, up to three). */
  function inThisBook(lemma) {
    const places = occurrences.get(lemmaKey(lemma)) ?? [];
    const counts = new Map();
    for (const p of places) {
      const word = plainWord((weave?.kind === "help" ? glossAt.get(p) : model.words[p]) ?? "").toLowerCase();
      if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    return { count: places.length, english: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([word]) => word) };
  }

  // Each lemma's reading in this book's layer: where the word stands in its own form (a form of it, 食べた or Rōmam,
  // reads otherwise), the first that fits it. Built when a list first asks, again for another layer.
  let lemmaReadings = { of: null, readings: new Map() };
  /** Whether a reading fits a word as a list shows it: one the word may carry (mayRead: kanji or hanzi, marks, a romanization). */
  const readingFits = (word, reading) => Boolean(reading) && mayRead(lang, word) && !readingProblem(lang, word, reading);
  // A word in its own form, where its marks are its reading: the same letters (a word may be written with a mark of
  // its own, שׁלום for שלום, or a book with its macrons); readingFits says whether the reading fits the lemma.
  const letters = (text) => lemmaKey(text).normalize("NFD").replace(/\p{M}/gu, "");
  const ownForm = (word, key) => (vowelsHere() ? letters(word) === letters(key) : lemmaKey(word) === key);
  function layerReading(lemma) {
    if (lemmaReadings.of !== weave) {
      const readings = new Map();
      for (const sentence of weave?.sentences ?? []) {
        sentence.t.forEach(([target, l, reading], j) => {
          if (!l || !reading) return;
          const key = lemmaKey(l);
          const word = plainWord((weave.kind === "help" ? model.words[sentence.s + j] : target) ?? "");
          if (readings.has(key) || !ownForm(word, key)) return;
          // The list shows the lemma's key: a capital the word has here (a sentence's first) goes from its reading too.
          const shown = word === key ? reading : reading.toLowerCase();
          if (readingFits(key, shown)) readings.set(key, shown);
        });
      }
      lemmaReadings = { of: weave, readings };
    }
    return lemmaReadings.readings.get(lemmaKey(lemma)) ?? null;
  }
  /** Your studying's readings in this language, by the key your lists show (a pack's B型 is the b型 you added). */
  function studyReadings() {
    const byKey = new Map();
    if (contentLanguage() === lang) for (const [word, reading] of Object.entries(READINGS)) if (!byKey.has(lemmaKey(word))) byKey.set(lemmaKey(word), reading);
    return byKey;
  }
  /**
   * A word of your lists as they show it, by the study's rule (content.js shownName): with its reading while it's new
   * (ui.wordLabel: kana or pinyin over it, vowel marks on it), as written once you know it. The reading is the book's,
   * else your studying's in this language (studyReadings, built once a list); with neither, or one that doesn't fit,
   * the word as written.
   */
  function shownLemma(lemma, studied = studyReadings()) {
    // As the language writes it (study/written.js: Engels), its reading looked up by its key.
    const text = writtenOf(lang, lemma);
    if (!(readingsHere() || vowelsHere()) || readingKnown(lemma)) return text;
    const fromStudy = studied.get(lemmaKey(lemma));
    const reading = layerReading(lemma) ?? (readingFits(lemma, fromStudy) ? fromStudy : null);
    return reading ? { text, reading, lang } : text;
  }

  /**
   * Your words, a page of the settings sheet (readersound's word bank): the words you've added, newest first, each
   * with the English it stands for here and a button to take it out; then the words your studying knows, which follow
   * your progress. Each word is shown as studying shows it (shownLemma).
   */
  function showWords() {
    const name = LANGUAGES[lang]?.name ?? lang;
    const describe = (lemma) => {
      const { count, english } = inThisBook(lemma);
      return count ? `${english.join(", ")} · ${count} in this text` : "Not in this text";
    };
    const titled = (item) => {
      item.querySelector(".lx-row-title")?.setAttribute("lang", lang);
      return item;
    };
    const words = bankWords(lang);
    const studied = studyReadings();
    const rows = words.map((lemma) => {
      const out = ui.iconButton("cross", `Take ${writtenOf(lang, lemma)} out of your words`, {
        onclick: () => {
          motion.leave(item, { dx: 28 });
          removeWord(lang, lemma);
          showWords();
        },
      });
      // A word that's in this text opens its card (at its first place); the ✕ beside it takes it out.
      const first = (occurrences.get(lemmaKey(lemma)) ?? [])[0];
      const item =
        first === undefined
          ? titled(ui.listRow({ title: ui.wordLabel(shownLemma(lemma, studied), lang), sub: describe(lemma), trailing: out }))
          : el(
              "li",
              { class: "lx-row-item lx-reader-word-row" },
              el(
                "button",
                { part: "list-row", type: "button", onclick: () => openWordCard(first) },
                el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title", lang }, ui.wordLabel(shownLemma(lemma, studied), lang)), el("span", { class: "lx-row-sub" }, describe(lemma))),
                icon("chevron"),
              ),
              out,
            );
      return item;
    });
    // What your words are worth here: their share of the words to learn, and the sentences that show whole.
    let total = 0;
    let mine = 0;
    for (const sentence of weave.sentences) for (const [, lemma] of sentence.t) if (lemma) {
      total++;
      if (inBank(lang, lemma)) mine++;
    }
    const { flipAt, order } = weavePrefs(prefs, lang);
    // A help book: the sentences that need no help; a woven one: the sentences that show whole.
    const whole = weave.kind === "help"
      ? weave.sentences.filter((sentence) => {
          const shown = helpSentence(sentence, model.words, known);
          return shown.known === shown.total;
        }).length
      : weave.sentences.filter((sentence) => weaveSentence(sentence, model.words, known, { flipAt, order }).flipped).length;
    const wholeSays = weave.kind === "help"
      ? `${whole === 1 ? "needs" : "need"} no ${LANGUAGES[weave.to]?.name ?? weave.to}`
      : `${whole === 1 ? "shows" : "show"} all in ${name}`;
    const yours = words.length
      ? ui.group(
          `Your words (${words.length})`,
          rows,
          `Kept on this device. They're ${total ? Math.round((mine / total) * 100) : 0}% of the words to learn in this text, and with all you know, ${whole} of its ${weave.sentences.length} sentences ${wholeSays}.`,
        )
      : el("div", { part: "empty-state" }, weave.kind === "help" ? "Nothing yet. Hold a word in the text and tap I know it." : `Nothing yet. Hold a word in the text and tap → ${name}.`);
    const fromStudy = studiedWords(lang).filter((lemma) => !inBank(lang, lemma));
    const studying = fromStudy.length
      ? ui.group(
          "From your studying",
          fromStudy.map((lemma) => titled(ui.listRow({ title: ui.wordLabel(shownLemma(lemma, studied), lang), sub: describe(lemma), trailing: ui.strengthMeter(conceptState(`w:${lemmaKey(lemma)}`, { skill: "read", lang }).level) }))),
          `Strong in your studying, so they show in ${name} too. They follow your progress.`,
        )
      : null;
    settings.lxBody.replaceChildren(
      el("div", { class: "lx-reader-sheet-back" }, ui.backButton({ label: "Reading settings", onclick: () => buildSettings() })),
      yours,
      ...(studying ? [studying] : []),
    );
  }

  // Two presses: the first arms it, the second removes the text from this device.
  function removeRow() {
    let armed = 0;
    const item = ui.listRow({
      icon: "trash",
      title: "Remove it from this device",
      variant: "danger",
      trailing: el("span"),
      onclick: async () => {
        const row = item.querySelector('[data-part="list-row"]');
        const title = row.querySelector(".lx-row-title");
        if (!armed) {
          title.textContent = "Press again to remove it";
          row.setAttribute("data-armed", "");
          armed = setTimeout(() => {
            armed = 0;
            title.textContent = "Remove it from this device";
            row.removeAttribute("data-armed");
          }, 5000);
          return;
        }
        clearTimeout(armed);
        // One your AI added goes from every device, through the relay (with Undo); one you added, from here.
        await removeText(model.book.id);
        model = null;
        onClose?.();
      },
    });
    return item;
  }

  function buildContents() {
    clearTimeout(searchTimer);
    searchInput.value = "";
    contents.lxBody.replaceChildren(searchForm, contentsList);
    showChapters();
  }

  /**
   * How long a chapter is, in pages (readersound's): the open one exactly, the others about, by the open one's words per
   * page; a spread counts as one. Nothing in scroll.
   */
  function chapterLength(ci) {
    if (mode !== "pages" || !pages.length) return undefined;
    const spread = root.getAttribute("data-variant") === "spread";
    const unit = (n) => (spread ? (n === 1 ? "spread" : "spreads") : n === 1 ? "page" : "pages");
    if (ci === mounted) return `${pages.length} ${unit(pages.length)}`;
    const chapter = model.chapters[ci];
    const n = Math.max(1, Math.round((chapter.end - chapter.word) / (wordEls.length / pages.length)));
    return `about ${n} ${unit(n)}`;
  }

  // ---------- weaving a text of yours with your AI ----------

  // A text you added (pasted, opened from a file, or one your AI added) in another language than the one you're learning, not woven
  // yet, with an AI connected: one press asks your AI to weave it (ai/client.js askToWeave: the text goes up for that request alone,
  // then a "weave" request). The first time it opens, the offer sits at the reader's foot; Contents keeps the way to it after, with
  // where the request is, followed live while one is out. The layer comes back through the text relay (text-inbox.js), checked again
  // here; "Read it woven" opens it at the same word. With no AI connected, none of it shows.
  let weaveGroup = null;
  let offerCard = null;
  let stopWeave = null;
  async function offerWeave(book, layer) {
    const own = ["paste", "upload", "ai"].includes(book.source?.kind);
    const into = learning();
    // Only into a language weaves are ready for (the server refuses the rest).
    if (demo || !own || book.lang === into || !WEAVE_LANGUAGES.includes(into)) return;
    const [{ aiConnected }, client, { symbol }, inbox] = await Promise.all([import("../shell/layout.js"), import("../ai/client.js"), import("../lx/symbols.js"), import("./text-inbox.js")]);
    if (ended || !aiConnected()) return;
    const name = LANGUAGES[into]?.name ?? into;
    const ofThis = (requests) => requests.filter((r) => r.kind === "weave" && r.book === book.id).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    let request = ofThis(await client.listRequests().catch(() => []));
    let woven = layer;
    let kept = layer ? null : await store.getWeave(book.id, into);
    if (ended) return;
    const row = (title, sub, trailing) => ui.listRow({ symbol: "translate-q", title, sub, trailing });
    const ask = async () => {
      request = await client.askToWeave(book, into);
      follow();
      draw();
      return request;
    };
    const askButton = (label) =>
      ui.button(label, {
        size: "sm",
        onclick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            await ask();
          } catch (error) {
            button.disabled = false;
            weaveGroup?.querySelector('[part="group-note"], [data-part="group-note"]')?.remove();
            weaveGroup?.append(el("p", { part: "group-note" }, error.message));
          }
        },
      });
    // Where it stands, from the request and what this device keeps.
    const draw = () => {
      const state = request ? client.requestStatus(request).mark : null;
      const node = woven
        ? row(`Woven into ${name}`, "By your AI")
        : kept
          ? row(`Woven into ${name}`, "By your AI", ui.button("Read it woven", { size: "sm", onclick: () => readWoven() }))
          : state === "waiting"
            ? row("Waiting for your AI", "It weaves it the next time it checks in")
            : state === "working"
              ? row("Your AI is weaving it", "It opens woven here when it's done")
              : state === "done"
                ? row(`Woven into ${name}`, "On its way to this device")
                : state === "failed"
                  ? row("Your AI couldn't weave it", request.result?.why ?? "It didn't say why", askButton("Ask again"))
                  : row(`Weave it into ${name}`, `Your AI weaves ${name} in at your level`, askButton("Weave it"));
      // No heading of its own: the row says where it stands, and Contents' heading follows it.
      weaveGroup = ui.group(null, [node]);
      weaveGroup.classList.add("lx-reader-weave");
      if (openSheet === contents) showChapters();
    };
    // Opening it woven, where you are.
    const readWoven = async () => {
      const layerNow = await store.getWeave(book.id, into);
      if (ended || !layerNow || layerNow.bookVersion !== book.version) return;
      woven = layerNow;
      kept = null;
      closeSheet({ animate: false });
      // As the weave's own switch does: the layer in, its settings, and the chapter laid out again where you are (rewave).
      setWeave(layerNow);
      loadFrequency(lang);
      buildSettings();
      rewave();
      draw();
    };
    // While a request is out: its state live, and the layer the moment this device keeps it.
    const follow = () => {
      if (stopWeave || woven) return;
      const stopRequests = client.watchRequests(({ requests }) => {
        const next = ofThis(requests);
        if (!next || JSON.stringify(next) === JSON.stringify(request)) return;
        request = next;
        draw();
      });
      const stopTexts = inbox.onTextsChange(async () => {
        const got = await store.getWeave(book.id, into);
        if (ended || !got || woven) return;
        kept = got;
        draw();
      });
      stopWeave = () => {
        stopRequests();
        stopTexts();
      };
    };
    draw();
    if (request && (request.state === "waiting" || request.state === "taken" || request.state === "done")) follow();
    // The offer at the foot: only while nothing's been asked, it's not woven, and it hasn't been put away for this text.
    const KEY = `lx.weave-offer.${book.id}`;
    let put = false;
    try {
      put = localStorage.getItem(KEY) === "no";
    } catch {}
    if (woven || kept || request || put) return;
    const text = el("div", { class: "lx-offer-text" }, el("strong", {}, `Weave it into ${name}?`), el("span", {}, `Your AI weaves ${name} words in at your level. The text goes to it through your account.`));
    const close = ui.iconButton("cross", "Not now", {
      onclick: () => {
        try {
          localStorage.setItem(KEY, "no");
        } catch {}
        offerCard?.remove();
        offerCard = null;
      },
    });
    const go = ui.button("Weave it with your AI", {
      variant: "go",
      block: true,
      onclick: async () => {
        go.disabled = true;
        try {
          await ask();
          text.replaceChildren(el("strong", {}, "Sent to your AI"), el("span", {}, "It weaves it the next time it checks in, and it opens woven here."));
          go.remove();
        } catch (error) {
          go.disabled = false;
          text.replaceChildren(el("strong", {}, "That didn't go"), el("span", {}, error.message));
        }
      },
    });
    offerCard = el("div", { part: "reader-offer" }, el("div", { class: "lx-offer-top" }, symbol("translate-q", { size: 30 }), text, close), go);
    root.append(offerCard);
  }

  /** Contents' chapters (each with how long it is), where you are among them, and About this book. */
  function showChapters() {
    const rows = model.chapters.map((chapter, ci) => {
      // The heading's first line ("Chapter 3") when the chapter is named by its second.
      const head = model.paras[chapter.p0];
      const label = head?.k === "h" ? bookText(model.words.slice(head.s, head.e)) : null;
      const row = ui.listRow({
        title: chapter.title,
        sub: label && !chapter.title.includes(label) ? label : undefined,
        state: ci === mounted ? "current" : undefined,
        value: chapterLength(ci),
        trailing: ci === mounted ? icon("check") : el("span"),
        onclick: () => goToChapter(ci),
      });
      if (ci === mounted) row.querySelector('[data-part="list-row"]').setAttribute("aria-current", "true");
      return row;
    });
    // A book whose license asks for its credits, whose pictures carry them (a classic's cover), or with a layer to credit: "About this book".
    const about = aboutShown() ? ui.group("", [ui.listRow({ title: "About this book", sub: "Who made it, and its license", onclick: () => showAbout() })]) : null;
    contentsList.replaceChildren(...(weaveGroup ? [weaveGroup] : []), ui.group("Contents", rows), ...(about ? [about] : []));
  }

  // ---------- search in the text ----------

  // The text's words for searching (search.js), made the first time you search it; a search waits for a pause in typing.
  let searchIn = null;
  let searchTimer = 0;
  const searchForm = ui.searchField({
    label: "Search this text",
    onsubmit: (query) => {
      clearTimeout(searchTimer);
      showFound(query);
      searchInput.blur();
    },
  });
  const searchInput = searchForm.querySelector("input");
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => showFound(searchInput.value), 160);
  });
  const contentsList = el("div");

  /** Under the search field: every place the words come (the first SEARCH_MAX), each a snippet with them marked. */
  function showFound(query) {
    if (!model) return;
    searchIn ??= searchIndex(model.words, bookLang());
    const found = searchWords(searchIn, query, { lang: bookLang() });
    if (!found) return showChapters();
    const rows = found.places.map((place) => {
      const { before, found: words, after, cutBefore, cutAfter } = snippetOf(model.words, place);
      const title = el(
        "span",
        { lang: bookLang() },
        cutBefore ? "…" : "",
        before.length ? `${bookText(before)}${gapAfter(place.i - 1)}` : "",
        el("mark", { part: "reader-search-hit" }, bookText(words)),
        after.length ? `${gapAfter(place.j)}${bookText(after)}` : "",
        cutAfter ? "…" : "",
      );
      return ui.listRow({
        title,
        sub: model.chapters.length > 1 ? model.chapters[chapterOfWord(model, place.i)].title : undefined,
        onclick: () => goToFound(place),
      });
    });
    const count = found.places.length;
    const label = found.more ? `The first ${SEARCH_MAX} places` : count === 1 ? "1 place" : `${count} places`;
    contentsList.replaceChildren(
      count
        ? ui.group(label, rows, found.more ? "There are more: add a word or two to find fewer." : undefined)
        : ui.group("Search", [el("li", { part: "list-row" }, el("span", { class: "lx-row-text lx-muted" }, `“${query.trim()}” isn't in this text.`))]),
    );
  }

  /** A place a search found: the text opens there, and its words light up for a moment. */
  let foundTimers = [];
  function goToFound({ i, j }) {
    closeSheet({ animate: false });
    showWord(i);
    for (const timer of foundTimers) clearTimeout(timer);
    for (const node of flow.querySelectorAll("[data-found]")) node.removeAttribute("data-found");
    const nodes = new Set();
    for (let k = i; k <= j; k++) {
      const node = heldEl(k);
      if (node && !node.hidden) nodes.add(node);
    }
    for (const node of nodes) node.setAttribute("data-found", "");
    foundTimers = [
      setTimeout(() => nodes.forEach((node) => node.setAttribute("data-found", "fading")), FOUND_MS),
      setTimeout(() => nodes.forEach((node) => node.removeAttribute("data-found")), FOUND_MS + 400),
    ];
  }

  function showAbout() {
    contents.lxBody.replaceChildren(
      el("div", { class: "lx-reader-sheet-back" }, ui.backButton({ label: "Contents", onclick: () => buildContents() })),
      credits(),
    );
  }

  // ---------- keys ----------

  const onKey = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Escape" && (openSheet || popover)) {
      event.preventDefault();
      if (popover) closePopover();
      else closeSheet();
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && mode === "pages" && model && !openSheet && !typing) {
      event.preventDefault();
      // The arrow toward the book's next page: right, or left in a right-to-left book.
      turnBy((event.key === "ArrowRight") !== rtl() ? 1 : -1);
    }
  };
  document.addEventListener("keydown", onKey);

  // ---------- open ----------

  function open(book, word, woven = null, beside = null) {
    model = bookModel(book);
    savedWord = word;
    // A demo's definitions, as given.
    if (demo) defs = { layer: givenDefinitions?.layer ? { url: null, file: givenDefinitions.layer } : null, book: givenDefinitions?.book ? { url: null, file: givenDefinitions.book } : null };
    // A demo's highlights, as if made on this text.
    if (demo) highlights = (givenHighlights ?? []).map(({ start, end, note = "" }) => newHighlight({ book: book.id, version: book.version, start, end, quote: joinWords(book.words.slice(start, end + 1)), note }));
    setWeave(woven);
    setParallel(beside);
    useSize();
    // The order new words come in reads the language's frequency list: usually loaded at start; asked for here in case.
    if (woven && !demo) loadFrequency(lang);
    titleNode.textContent = book.title;
    setLang(text, book.lang ?? "en");
    // A right-to-left book's chevron sits top left, over the end of its first line; the bars themselves don't mirror.
    root.toggleAttribute("data-rtl", rtl());
    root.toggleAttribute("data-pictures", (book.pages ?? []).some((page) => page.picture != null));
    root.setAttribute("aria-label", book.title);
    buildSettings();
    showWord(Math.max(0, Math.min(word, book.words.length - 1)));
    root.setAttribute("data-ready", "");
  }

  (async () => {
    // A demo opens at once (before anything awaits), so a page building it can see all of it straight away.
    // A demo's layer, as given: a translation beside the book (a parallel layer) is never a weave.
    if (demo) return givenWeave?.kind === "parallel" ? open(given, givenWord, null, givenWeave) : open(given, givenWord, givenWeave);
    const found = await store.getBook(bookId);
    if (ended) return;
    if (!found) {
      flow.replaceChildren(el("p", { class: "lx-reader-note" }, "This text isn't on this device any more."), ui.button("Back to your texts", { onclick: () => onClose?.() }));
      return;
    }
    // A book in the language you're learning gets its help layer; any other, its weave into that language.
    const learningNow = learning();
    await migrateSize(prefs, learningNow);
    if (ended) return;
    const layerTo = found.text.lang === learningNow ? HELP_IN : learningNow;
    const [position, woven, marks, layerDefs, ownDefs] = await Promise.all([
      store.getPosition(bookId),
      store.getWeave(bookId, layerTo),
      highlightsOf(bookId).catch(() => []),
      store.getDefinitions(bookId, layerTo),
      store.getDefinitions(bookId, "book"),
    ]);
    if (ended) return;
    highlights = marks;
    defs = { layer: layerDefs, book: ownDefs };
    store.touchBook(bookId);
    // Its pictures kept on the device, if they aren't yet (a book added offline gets them now).
    if (found.text.pictures?.length) store.keepPictures(found.text).catch(() => {});
    const layer = (woven?.kind === "weave" || woven?.kind === "help") && woven.bookVersion === found.text.version ? woven : null;
    // A parallel layer is no weave: the book reads as written, its translation beside it.
    const beside = woven?.kind === "parallel" && woven.bookVersion === found.text.version ? woven : null;
    open(found.text, position?.word ?? 0, layer, beside);
    offerWeave(found.text, layer).catch((error) => console.error("[lexicommons] the weave offer:", error));
    // Definitions the library has now that this device doesn't yet (they came after the book): fetched, kept, used.
    newerDefinitions(found.text, layerTo, layer).catch(() => {});
  })().catch((error) => {
    console.error("[lexicommons] the reader couldn't open that text:", error);
    flow.replaceChildren(el("p", { class: "lx-reader-note" }, `This text couldn't be opened: ${error.message}`));
  });

  function end() {
    if (ended) return;
    // A note being written is kept, as closing its sheet keeps it (the browser's Back closes the reader with it open).
    keepNote();
    ended = true;
    leaveIndex?.();
    for (const off of [...gestures]) off();
    dropTurn();
    closePopover();
    stopBank();
    stopMarks?.();
    stopWeave?.();
    // Words from the grid that nothing has heard of yet (the shelf, the other tabs' lists).
    knownDone();
    if (model) savePosition();
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("fullscreenchange", onFullscreen);
    if (wentFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    resized.disconnect();
    for (const url of pictureUrls.values()) url.then((u) => u.startsWith("blob:") && URL.revokeObjectURL(u));
    root.remove();
    if (!demo && !document.querySelector('[data-part="session"]:not([data-ghost]), [data-part="reader"]:not([data-ghost])')) {
      document.documentElement.removeAttribute("data-scroll-lock");
    }
  }

  const handle = {
    element: root,
    end,
    setZen: (on) => setZen(on, { animate: false }),
    select: (a, b = a) => hold.select(a, b),
    showSheet: (name) => (name === "note" ? openNote(highlights[0]?.id) : toggleSheet(name === "contents" ? contents : name === "highlights" ? marksSheet : settings)),
    /** Opens word i's card, or (whole) its sentence's. */
    card: (i, { whole = false } = {}) => (whole ? openSentenceCard(sentenceOf(i)) : openWordCard(i)),
    /** Zooms the page to `s` about a point of the screen (as a pinch there would), for /design and the checks. */
    zoomTo: (s, fx, fy) => {
      pinchStart(fx, fy);
      pinchMove(fx, fy, s / pinch.s0);
      pinchEnd();
    },
    get zoom() {
      return { ...zoom };
    },
    /** Contents open, searching for `query` (as typed). */
    search: (query) => {
      if (openSheet !== contents) toggleSheet(contents);
      searchInput.value = query;
      showFound(query);
    },
    // For checks: where you are, and the bars.
    get word() {
      return lastWord;
    },
    get zen() {
      return zen;
    },
    get mode() {
      return mode;
    },
    // The language this book's text size is kept for.
    get sizeLang() {
      return sizeLang();
    },
    get page() {
      return disp;
    },
    get pages() {
      return pages.length;
    },
    /** For checks: the mounted chapter's pages as [first word, last word, height] (book word indices). */
    get pageRanges() {
      return pages.map((p) => [mountA + p.a, mountA + p.b, p.h]);
    },
    get turning() {
      return Boolean(turn);
    },
    get chapter() {
      return mounted;
    },
  };
  // Checks reach the reader through its element.
  root.lxReader = handle;
  return handle;
}
