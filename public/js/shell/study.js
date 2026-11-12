// The Study tab: the day's doors, where you are on the path, your packs, then every game as a large button for a few rounds of it (Study
// cards among them), with Choose the games and Choose your concepts under them (study/quick-play.js). Sessions open over the page
// (#study/session/<mode>/<arg>; a topic pack by itself is #study/session/pack/<id>); the path is #study/path, a lesson #study/path/<id>.
// More ways to study and its pickers (#study/more, #study/concepts, #study/topics) are gone: an old link to one is Study.

import * as ui from "../lx/ui.js";
import { drawnEmpty } from "./settings.js";
import { el } from "../lx/ui.js";
import { CHUNKS, PACKS, PATTERNS, PATTERNS_IN_USE, TOPICS, ITEMS, WORD_PACKS, contentLanguage, describe, nameLang, sentenceUnits } from "../study/content.js";
import { conceptState, evidenceVersion } from "../study/progress.js";
import { lessonsFinished, onDoneChange } from "../study/done.js";
import { GAMES, MORE_LESSONS, lessonFinished, lessonsSkippedBy, markLessonsDone, overview, packLessons, pathOverview, studyOverview } from "../study/plan.js";
import { coverOfPack } from "../study/pack-format.js";
import { loadPictures, pictureNode } from "../study/pictures.js";
import { t } from "../lx/i18n.js";
import { mayShare } from "./sharing.js";
import { deckLine, deckOverview, decksHere, scriptFirst } from "../study/deck.js";
import { quickPlay } from "../study/quick-play.js";
import { focusNames } from "../study/concepts-sheet.js";
import { focusNow, onFocusChange } from "../study/concept-focus.js";
import { articled, meaningOfThing } from "../study/lesson.js";
import { pathLessons } from "../study/path.js";
import { pathPageTake } from "../study/path-page.js";
import { starterNote } from "../study/starter-note.js";
import { pathStrip, studyDoor } from "../study/doors.js";
import { symbol } from "../lx/symbols.js";
import { onVoicesChange } from "../study/voice.js";
import { onPlaceChange, placeOn, placementOn, setPlace } from "../study/path-place.js";
import { courseHere } from "../study/placement.js";
import { onFrequency } from "../study/frequency.js";
import { WAYS, getStudySettings, setStudySetting } from "../study/settings.js";
import { icon } from "../lx/icons.js";
import { renderPractice } from "../practice/home.js";
import { onPacksChange } from "../study/packs.js";
import * as packs from "../study/packs.js";
import { packsSettings, packsSummary, togglePack } from "./settings-packs.js";
import { learning, learningName } from "../study/learning.js";

const soon = (text = "Soon") => el("span", { part: "badge" }, text);
const go = (hash) => () => (location.hash = hash);
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

const STEP_LABEL = { card: "Study card", choose: "Choose", get arrange() { return GAMES.arrange.name; }, place: "Where does it go?", fill: "Fill the gap", type: "Type it", meaning: "What does it mean?", match: "Match", listen: "Listening", say: "Say it", repeat: "Repeat after" };
const MEANING_LABEL = { new: "new", slipping: "slipping", review: "to review" };

// What the page is running on: the packs that are on, and how many sentences they hold.

// Where a pack is from, in a few words (as Settings → Study → Packs says it).
const FROM = { app: "Lexicommons", default: "Lexicommons", follow: "Added from Explore", yours: "Yours" };
const sentences = (n) => `${n} ${n === 1 ? "sentence" : "sentences"}`;
const cardsText = (n) => `${n.toLocaleString()} ${n === 1 ? "card" : "cards"}`;

// Your packs, each on or off right here, and the ways to more of them.
function packsSection() {
  const none = PACKS.length > 0 && PACKS.every((pack) => !pack.on);
  return el(
    "section",
    { class: "lx-study-packs" },
    ui.sectionHead("Your packs"),
    none ? ui.emptyState("Every pack is off, so there's nothing to study. Turn one on, or find one in Explore.", { pose: "off" }) : null,
    PACKS.length
      ? el(
          "ul",
          { part: "list" },
          PACKS.map((pack) =>
            ui.switchLinkRow({
              icon: "cards",
              title: pack.name,
              sub: `${pack.cards && !pack.items ? cardsText(pack.cards) : sentences(pack.items)} · ${FROM[pack.origin?.kind] ?? "Lexicommons"}`,
              href: `#settings/study/packs/${encodeURIComponent(pack.id)}`,
              checked: pack.on,
              label: `Study with ${pack.name}`,
              onchange: (checked) => togglePack(pack.id, checked),
            }),
          ),
        )
      : ui.emptyState(`No ${learningName()} pack on this device yet. Find one in Explore.`, { pose: "box" }),
    el(
      "div",
      { class: "lx-inline-form lx-study-more" },
      ui.button("Find packs", { icon: "compass", onclick: go(`#explore?lang=${learning()}`) }),
      ui.button("Add an Anki deck", { icon: "plus", onclick: go("#study/import") }),
    ),
    el("p", { class: "lx-muted lx-study-note" }, `Find packs in Explore for ${learningName()} or another language.`),
  );
}

// Your plain decks in this language: what each has due, and a session on it.
function deckRows(from = "") {
  return decksHere().map((pack) => ui.listRow({ icon: "cards", title: pack.name, sub: deckLine(deckOverview(pack)), href: `#study/session/deck/${encodeURIComponent(pack.id)}${from}` }));
}

// Study's page as last drawn: what it showed (its key) and its games, kept. Drawn again with nothing changed (coming back to the tab, a pack's sync that
// changed nothing here), it stays as it is: built again, it was the whole page and the path strip's Tinta, a long moment on a slow phone each time.
const drawnStudy = new WeakMap(); // page → { key, games }

// The language's lessons on their way (study/packs.js lessonsComing, 15 s at most), read through the module so Study loads on a packs.js from before it.
const lessonsComing = () => (typeof packs.lessonsComing === "function" ? packs.lessonsComing() : false);
// Its wait given up without them: what the device has, and the door says why.
const lessonsMissing = () => (typeof packs.lessonsMissing === "function" ? packs.lessonsMissing() : false);

function studyHome(page) {
  const study = studyOverview();
  // A new learner's first lesson is the language's lesson 1: while its lessons are coming, its door is held (the lesson's name in its place, no
  // press), never the app's starter in the meantime (7 Nov 2026). Past the wait, the starter, and the door says why.
  const coming = Boolean(study.firstTime && lessonsComing());
  const instead = Boolean(!coming && study.firstTime && study.lesson && lessonsMissing());
  const kept = drawnStudy.get(page);
  // Nothing to study: why, and the switches to do something about it, right here.
  if (study.nothing) {
    drawnStudy.delete(page);
    page.replaceChildren(packsSection(), ...(decksHere().length ? [el("ul", { part: "list", class: "lx-study-rows" }, ...deckRows())] : []));
    return "Study";
  }
  const lessons = pathLessons();
  const here = study.lesson ? lessons.findIndex((one) => one.id === study.lesson.id) : -1;
  // A pack that teaches how the language is written (kana), while nothing's taught yet: first among the rows, saying what it's for, beside
  // the first lesson's door, never instead of it.
  const letters = scriptFirst(study.firstTime)?.pack.id ?? null;
  const decks = decksHere()
    .map((pack) => ({ pack, line: pack.id === letters ? `If ${learningName()}'s letters are new to you, start here` : deckLine(deckOverview(pack)) }))
    .sort((a, b) => (b.pack.id === letters) - (a.pack.id === letters));
  const key = JSON.stringify([learningName(), study, coming, instead, focusNow(), lessons.length, here, decks.map(({ pack, line }) => [pack.id, pack.name, line]), offerPlacement(coming)]);
  // The games follow what can play here themselves (quick-play.js); coming back, they look again.
  if (kept?.key === key && kept.games.parentNode === page) {
    kept.games.lxRefresh?.();
    return "Study";
  }
  const games = kept?.games ?? quickPlay();
  if (kept) games.lxRefresh?.();
  drawnStudy.set(page, { key, games });
  // Two doors: Home has said what to do, and here you choose how. With nothing taught yet, the first lesson is the only one.
  // Study's settings a press away, notched into the Practice card's top corner: the door is a link, so the gear stands beside it, over its edge.
  // While it keeps to some concepts (Choose your concepts), Practice's own line says which, in the place its words always have: nothing is added
  // above it, so nothing moves down.
  const focus = focusNow();
  const practice = study.practice
    ? el(
        "div",
        { class: "lx-door-wrap" },
        studyDoor({ door: "practice", art: "practice2", title: "Practice", sub: focus.length ? `Only ${focusNames(focus)}. About ${study.practice.minutes} min` : `What you know, mixed. About ${study.practice.minutes} min`, href: "#study/session/practice" }),
        el("a", { class: "lx-door-gear", href: "#settings/study?from=study", "aria-label": "Study settings" }, icon("gear")),
      )
    : null;
  // Past the written lessons, what's next is a row (it says so); before anything's taught, the lesson there is.
  const lesson = coming
    ? heldDoor()
    : study.lesson && (!study.practice || !study.writtenEnd)
      ? studyDoor({ door: "lesson", art: "learn", title: study.practice ? "A new lesson" : "Your first lesson", sub: instead ? [study.lesson.title, el("span", { class: "lx-door-note" }, navigator.onLine === false ? `${learningName()}'s lessons need a connection the first time.` : `${learningName()}'s lessons haven't downloaded yet.`)] : study.lesson.title, href: "#study/session/lesson" })
      : null;
  const quietRow = (name, options) => ui.listRow({ ...options, art: symbol(name, { size: 24 }) });
  // Study a topic's covers, loaded now, so its sheet draws them in its first frame.
  loadPictures(topicPacks().map((pack) => coverOfPack(pack.id)).filter(Boolean)).catch(() => {});
  page.replaceChildren(
    el("div", { class: "lx-study-doors" }, practice, lesson),
    // Where you are on the path: while the lessons come, it's held with the door (lesson 1 of the path's first stops, the place's words held, no link),
    // never the stops the device works out meanwhile.
    ...(coming ? [heldStrip()] : here >= 0 ? [pathStrip({ here, count: lessons.length, place: study.lesson.place, href: "#study/path" })] : []),
    // Its rows only when it has some: an empty list would hold a gap above the games.
    ...(() => {
      const rows = [
        // Find your level (study/placement.js), for someone who may know some already: until about PLACEMENT_ROW lessons are done or it's been taken.
        offerPlacement(coming) ? ui.listRow({ icon: "target", title: `Know some ${learningName()} already?`, sub: "Find your level: about 20 questions", href: "#study/session/placement/again" }) : null,
        study.writtenEnd ? ui.listRow({ icon: "compass", title: "Learn something new", sub: `You've done every ${learningName()} lesson here`, href: MORE_LESSONS }) : null,
        here < 0 && lessons.length ? quietRow("path-q", { title: "The lessons", href: "#study/path" }) : null,
        ...decks.map(({ pack, line }) => quietRow("deck-q", { title: pack.name, sub: line, href: `#study/session/deck/${encodeURIComponent(pack.id)}` })),
      ].filter(Boolean);
      return rows.length ? [el("ul", { part: "list", class: "lx-study-rows" }, ...rows)] : [];
    })(),
    // The games themselves, a few rounds of one at a press, with Choose the games and Choose your concepts under them (study/quick-play.js).
    games,
    // Your packs, a page of their own (each on or off, finding more, adding a deck): under the games, so a small phone's first view still
    // shows the first row of them.
    // A topic at a time (its next lesson, then its own words): a sheet of the topic packs you've added, in a list of its own (a row that
    // opens a sheet is a button, beside the chevron rows it would look like another kind).
    // (The two in one holder: on a computer they're a row of two, as the doors and the rows over them are (study-screens.css, from 1280);
    // on a phone the holder has no box of its own, so each is a row of the page as before.)
    el(
      "div",
      { class: "lx-study-foot" },
      el("ul", { part: "list", class: "lx-study-rows lx-study-topics" }, quietRow("ways-q", { title: t("study.topics.row"), opens: "sheet", onclick: openTopics })),
      el("ul", { part: "list", class: "lx-study-rows lx-study-yours" }, quietRow("cards-q", { title: "Your packs", value: packsSummary(), href: "#study/packs" })),
    ),
  );
  return "Study";
}


/** Lessons done in a language past which Study stops offering Find your level (Settings → Study always has it). */
const PLACEMENT_ROW = 10;
/** Whether Study offers Find your level: a full course, its lessons here, never taken, and fewer than PLACEMENT_ROW of its lessons done. */
function offerPlacement(coming) {
  if (coming) return false;
  const lang = contentLanguage();
  if (placementOn(lang)?.taken || !courseHere()) return false;
  let done = 0;
  for (const id of lessonsFinished()) if (id.startsWith(`path-${lang}/`) && ++done >= PLACEMENT_ROW) return false;
  return true;
}

/** The first-lesson door while its lesson is on its way: the door it comes in, its name held in its place, no link (nothing to open yet). */
function heldDoor() {
  const door = studyDoor({ door: "lesson", art: "learn", title: "Your first lesson", sub: ui.held({ inline: true, width: "7.5em" }, "lesson") });
  door.setAttribute("aria-busy", "true");
  door.dataset.held = "";
  return door;
}

/** "Where you are" while the lessons come: a new learner is at the path's first stop, so its line is drawn as it'll be, its place's words held, no link. */
function heldStrip() {
  // (held: pathStrip's own business skips it, as Tinta's hop onto a new place: nothing seen yet, nothing kept.)
  const strip = pathStrip({ here: 0, count: 7, place: ui.held({ inline: true, width: "6em" }, "lesson"), held: true });
  strip.setAttribute("aria-busy", "true");
  strip.dataset.held = "";
  return strip;
}

// Study a topic: the packs written for their words that you chose (content.js WORD_PACKS less Lexicommons' own series and starter: a
// topic pack added from Explore, or one of yours), each started by itself (#study/session/pack/<id>: its next lesson not yet done, then a
// practice on its own words), with how far its lessons are; and a way to Explore's topics for more. With none yet, Tinta says so above it.
const topicPacks = () => WORD_PACKS.filter((pack) => !pack.builtIn);
function topicCover(id) {
  const drawing = coverOfPack(id);
  if (!drawing) return symbol("cards-q", { size: 24 });
  const holder = el("span", { class: "lx-topic-cover" });
  // Loaded already (Study loads its topics' covers as it draws): in the sheet's first frame; else it fades into its place.
  const now = pictureNode(drawing);
  if (now.firstChild) holder.append(now);
  else loadPictures([drawing]).then((found) => found && ui.arriveIn(holder, pictureNode(drawing)));
  return holder;
}
function openTopics() {
  const layer = ui.sheetLayer({ label: t("study.topics.title") });
  // Only a topic with something to play: lessons on the path, or words of it you know (a pack the path doesn't teach would open on nothing).
  const packs = topicPacks()
    .map((pack) => ({ pack, ...packLessons(pack.id) }))
    .filter(({ total, known }) => total > 0 || known > 0);
  const rows = packs.map(({ pack, total, done, known }) => {
    const sub = !total ? t("study.topics.known", { count: known }) : done < total ? t("study.topics.lessons", { done, total }) : t("study.topics.allDone");
    return ui.listRow({ art: topicCover(pack.id), title: pack.name, sub, href: `#study/session/pack/${encodeURIComponent(pack.id)}` });
  });
  const list = el("ul", { part: "list" }, ...rows, ui.listRow({ title: t("study.topics.explore"), href: `#explore?lang=${encodeURIComponent(learning())}` }));
  // A row goes somewhere: the sheet steps aside at once, so the page it opens isn't under it.
  list.addEventListener("click", (event) => event.target.closest("a") && layer.lxClose?.({ animate: false }));
  layer.lxBody.append(
    el(
      "div",
      { class: "lx-stack" },
      el("h2", { class: "lx-sheet-title" }, t("study.topics.title")),
      packs.length ? null : ui.emptyState(t("study.topics.none"), { pose: "box" }),
      list,
    ),
  );
  layer.lxOpen();
}

// The path as a page of penmanship (study/path-page.js).
function pathPage(page, open = null) {
  return pathPageTake(page, { moreLessons: MORE_LESSONS, open });
}

// Going to a lesson further on: what about the ones you'd be skipping? Yes puts them in what you know; no adds only what you actually do.
export function startLesson(lesson) {
  const go = () => (location.hash = `#study/session/lesson/${encodeURIComponent(lesson.id)}`);
  const skipped = lessonsSkippedBy(lesson.id);
  if (!skipped.length) return go();
  const layer = ui.sheetLayer({ label: "The lessons you're skipping" });
  const n = skipped.length;
  const leave = (mark) => {
    if (mark) markLessonsDone(skipped);
    setPlace(learning(), lesson.id);
    layer.lxClose?.({ animate: false });
    go();
  };
  layer.lxBody.append(
    el(
      "div",
      { class: "lx-stack" },
      el("h2", { class: "lx-sheet-title" }, `Mark the ${plural(n, "lesson")} you skipped as done?`),
      el("p", { class: "lx-small lx-muted" }, `Yes, and Practice asks about ${n === 1 ? "its" : "their"} words as things you know.`),
      ui.button("Yes, mark them done", { variant: "go", size: "lg", block: true, onclick: () => leave(true) }),
      ui.button("No, just this lesson", { variant: "gray", size: "lg", block: true, onclick: () => leave(false) }),
    ),
  );
  layer.lxOpen();
}

// Where a language's lessons run out, and what comes next. It's the same in every language, whichever has most lessons:
// you keep what you learned, and anyone can ask for more or add to it.
function moreLessonsPage(page) {
  const name = learningName();
  const lang = learning();
  const { writtenEnd: atEnd, practice, lesson } = studyOverview();
  const quiet = (art, opts) => ui.listRow({ ...opts, art: symbol(art, { size: 24 }) });
  page.replaceChildren(
    el(
      "div",
      { class: "lx-more-lessons" },
      ui.character({ state: "present", size: 72, hidden: true }),
      // With sharing off (for launch) nobody adds lessons for now: no promise of what comes next, only where to carry on.
      ui.pageTitle(atEnd ? `You've done every ${name} lesson here` : `More ${name} lessons`, mayShare() ? "What comes next is up to the people learning it." : "Explore has packs to carry on with."),
    ),
    el(
      "ul",
      { part: "list", class: "lx-study-rows" },
      !mayShare() ? null : quiet("hint-q", { title: "Ask for more", sub: `What you'd like to learn next in ${name}`, href: `#explore/requests?lang=${encodeURIComponent(lang)}&ask=lessons` }),
      // With sharing off (for launch), Explore holds Lexicommons' own packs: finding them, not what people shared.
      quiet("globe-q", { title: mayShare() ? "See what people have shared" : "Find packs in Explore", href: `#explore?lang=${encodeURIComponent(lang)}` }),
      mayShare() ? quiet("share-q", { title: "Share what you've made", href: "#explore/yours" }) : null,
      // The words the list has left, as lessons worked out one after another, for anyone who'd rather carry on.
      // A pack written for its words carries on with them, under its name.
      lesson?.id.startsWith("words/") ? quiet("words-q", lesson.wordsFrom ? { title: `Carry on with ${lesson.wordsFrom}`, sub: "Its own words, most common first", href: "#study/session/lesson" } : { title: "Carry on with more words", sub: "Made from the word list", href: "#study/session/lesson" }) : null,
    ),
    ...(atEnd && practice ? [ui.pinnedActions([ui.button("Practice", { variant: "go", size: "lg", block: true, onclick: go("#study/session/practice") })])] : []),
  );
  return "What's next";
}




// Where Add an Anki deck goes back to: the page it was opened from (?from=), else Your packs.
const IMPORT_FROM = { packs: { href: "#study/packs", label: "Your packs" }, explore: { href: "#explore/yours", label: "Share" }, own: { href: "#explore/own", label: "Add your own pack" } };

// Add an Anki deck: the parser and its page load only now, so none of it is in the app's shell.
function importPage(page) {
  const from = new URLSearchParams(location.hash.split("?")[1] ?? "").get("from");
  let gone = false;
  let stop = null;
  // The router holds the page for its module (400 ms at most), so it comes in drawn, never empty and then filled.
  const loaded = import("../anki/page.js").then(
    ({ ankiImportPage }) => {
      if (!gone) stop = ankiImportPage(page).dispose;
    },
    () => !gone && page.replaceChildren(drawnEmpty("empty-offline", "Reading a deck needs a connection the first time. Try again once you're online.", "off")),
  );
  const lang = new URLSearchParams(location.hash.split("?")[1] ?? "").get("lang");
  const back = from === "own" && lang ? { ...IMPORT_FROM.own, href: `#explore/own?${new URLSearchParams({ lang })}` } : IMPORT_FROM[from] ?? IMPORT_FROM.packs;
  return {
    title: "Add an Anki deck",
    back,
    ready: loaded,
    dispose() {
      gone = true;
      stop?.();
    },
  };
}

/** Renders the Study tab (or one of its pickers) into `page`; returns { title, back }. */
export function renderStudy(page, rest, params = {}) {
  if (rest[0] === "import") return importPage(page);
  // Your packs: the one page (settings-packs.js), Study's way in.
  if (rest[0] === "packs") return packsSettings(page, { href: "#study", label: "Study" });
  // More ways to study and its pickers are gone (Study cards is a game, a concept is Choose your concepts, a topic its own pack): an old link
  // to one of them is Study itself.
  if (rest[0] === "more" || rest[0] === "concepts" || rest[0] === "topics") return renderStudy(page, [], params);
  // Opened from the path's foot (?from=path), its way back is the path, where you were.
  if (rest[0] === "more-lessons") return { title: moreLessonsPage(page), back: params.from === "path" ? { href: "#study/path", label: "Where you are" } : { href: "#study", label: "Study" }, refresh: () => moreLessonsPage(page) };
  // A lesson's address opens the path with its bubble open: a lesson has no page of its own.
  if (rest[0] === "path") {
    const view = pathPage(page, rest[1] ? decodeURIComponent(rest.slice(1).join("/")) : null);
    return { title: view.title, ready: view.ready, place: view.place, hide: view.leave, dispose: view.dispose, back: { href: "#study", label: "Study" }, ...(rest[1] ? {} : { refresh: view.redraw }) };
  }
  // Practice with your AI is a section of its own (practice/home.js).
  if (rest[0] === "practice") return renderPractice(page, rest.slice(1));
  // The page draws again when a pack is turned on or off (here or anywhere), so the session follows at once.
  // What it last drew from: a kept Study whose data changed while you were away (stale) is drawn again before it's shown (shell/main.js).
  let changes = 0;
  const drawnFromNow = () => `${evidenceVersion()}|${changes}|${learning()}`;
  let drawnFrom = "";
  const draw = () => {
    const title = studyHome(page);
    drawnFrom = drawnFromNow();
    return title;
  };
  const title = draw();
  const redraw = () => {
    changes++;
    if (page.isConnected) draw();
  };
  // The packs and the word list arrive after a first draw, and today's one thing follows them.
  // The lessons' wait given up (offline, a failed download, its 15 s) changes no pack, so it's heard here.
  const stops = [onPacksChange(redraw), onPlaceChange(redraw), onFrequency(redraw), onFocusChange(redraw), onDoneChange(() => changes++), typeof packs.onLessonsComing === "function" ? packs.onLessonsComing(redraw) : null];
  const stop = () => stops.forEach((off) => off?.());
  // Coming back to Study (the shell keeps it): drawn again in place, from what's on this device, so nothing waits.
  return { title, dispose: stop, refresh: draw, stale: () => drawnFromNow() !== drawnFrom };
}
