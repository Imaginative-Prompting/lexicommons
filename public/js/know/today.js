// Today, the app's home: the date, Translate up front (the first thing typed turns the page into Translate's own:
// translate/page.js), one clear next step, then your progress at a glance. The next step, picked in order: a practice with your AI that's still
// open; what's due (today's session); a text you're reading; else something new, a text or your AI. Your progress: the
// words you'd recall now and what you did this week, the words you knew each day for four weeks (it opens What you
// know), the streak (know/streak.js: forgiving, never a warning) and the days you studied this week. Then where to
// keep going. Everything on it opens something.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import * as motion from "../lx/motion.js";
import { heldPlace, keepHeight } from "../lx/shapes.js";
import { evidenceSince, evidenceVersion, studiedUnits } from "../study/progress.js";
import { onContentChange, PACKS } from "../study/content.js";
import * as packs from "../study/packs.js";
import { onFrequency } from "../study/frequency.js";
import { comebackDays, comebackNow, planStale, studyOverview, warmPlan } from "../study/plan.js";
import { inSlices } from "./slices.js";
import { KINDS as PRACTICE_KINDS } from "../practice/protocol.js";
import { collectFinished, languageOf, listPractices } from "../practice/store.js";
import { continueReading, coverOfBook } from "../read/library.js";
import { loadCatalog, shelfStart } from "../read/shelf.js";
import { aiCard, aiCardReads, bookCard, bookOpens, installCard, lastExchange, pausedCard } from "./home-cards.js";
import { KIND_ORDER, dayOf, growth, knowledge, sourceOf, sources, warmKnowledge, week } from "./summary.js";
import { startedWords } from "./word-index.js";
import { shownName } from "../study/content.js";
import { growthChart, heldText, knowLinkCard, nextStep, statTiles, streakSpot, streakSummary, weekStrip } from "./ui.js";
import { translatePage } from "../translate/page.js";
import { learning, learningName } from "../study/learning.js";
import { isOwnLanguage } from "../lang/index.js";
import { installOffer } from "../shell/settings-install.js";
import { lessonsFinished, onDoneChange, streakNow } from "../study/done.js";
import { scriptFirst } from "../study/deck.js";
import { dayKey } from "./streak.js";
import { todayPose } from "./today-pose.js";
import { report } from "../push.js";
import { symbol } from "../lx/symbols.js";
import { aiConnected, thirdTab } from "../shell/layout.js";
import { formatDate, languageLabel, t } from "../lx/i18n.js";
import { sampleKey } from "../study/sample-mode.js";

const DAY = 86_400_000;
const KIND_NAMES = { word: "home.count.word", pattern: "home.count.pattern", phrase: "home.count.phrase" };
const WEEKDAY = ["M", "T", "W", "T", "F", "S", "S"];

/** Where Practice with your AI lives: in the AI tab (under Study when Know has the tab). */
export const practiceHref = () => "#practice";

/** About how long a session takes, in minutes: a step is about 36 seconds, and nothing's shorter than two. */
export const minutesOf = (plan) => Math.max(2, Math.round(plan.steps.length * 0.6));

/**
 * "212 words · 9 patterns · 1 phrase known": what you know, by kind. Each number stays with its word, and a dot with what's before it (no-break
 * spaces), so a long line on a small phone wraps only after a dot.
 */
export function countsLine(kinds) {
  const parts = KIND_ORDER.map((kind) => {
    const n = kinds[kind].known;
    return t(KIND_NAMES[kind], { count: n });
  });
  return t("home.countsKnown", { counts: parts.join("\u00a0· ") });
}

/** Where you are in what you're reading: a picture book's page, else its chapter, else (one chapter) how much you've read, as Read says it. */
const whereIn = (reading) =>
  reading.page
    ? t("home.pageOf", { page: reading.page.n, pages: reading.page.of })
    : reading.chapter.of > 1
      ? t("home.chapterOf", { chapter: reading.chapter.n, chapters: reading.chapter.of })
      : t("home.percentRead", { share: reading.read ?? 0 });

// The language's lessons on their way to this device (study/packs.js lessonsComing: the catalog's lessons pack, 15 s at most; offline, a failed
// download or a language with none ends it at once). Read through the module, so Home loads on a copy of packs.js from before it.
const lessonsComing = () => (typeof packs.lessonsComing === "function" ? packs.lessonsComing() : false);
// Its wait given up without them (a failed download, no connection, past the wait): what the device has comes first, and the card says why.
const lessonsMissing = () => (typeof packs.lessonsMissing === "function" ? packs.lessonsMissing() : false);

/**
 * Home's card while a new learner's first lesson is on its way: the card it comes in, its kicker and symbol as they'll be, its title saying the
 * language is getting ready, the lesson's line and its Start held in their places (ui.held), so it comes in place with nothing moving, and nothing
 * else is offered meanwhile (7 Nov 2026: a new learner's Start in those seconds opened the app's own starter, not the language's lesson 1). The
 * title keeps two lines: a first lesson's title beside the card's symbol takes two at a phone's width (path-nl's "Something to drink", 61.6 px at
 * 320 and at 390; Explore holds the same lesson's card at its two-line height). A title of another length grows or shrinks to it on a curve
 * (drawNext). Its meta held inside a line, so the line's height is the text's.
 */
// What it says meanwhile is in the title's place and at its size, from the first frame (the director, 7 Nov, from lex-design-2's newcomer film:
// ~4 s of grey bars and no words), on the two lines the lesson's name takes, so its name replaces it with nothing moving.
const heldFirstLesson = ({ letters = false } = {}) =>
  nextStep({
    variant: "new",
    kicker: t("home.yourFirstLesson"),
    label: t("home.yourFirstLesson"),
    title: el("span", { class: "lx-next-coming" }, t("home.gettingReady", { language: languageLabel(learning()) })),
    meta: el("span", {}, heldText("4.5em")),
    action: { label: t("home.start"), held: true },
    // The letters' link (lettersExpected), held in its own shape, so the card that comes has it in the same place.
    ...(letters ? { secondary: { held: true } } : {}),
    art: symbol("learn", { size: 88 }),
  });

/**
 * Whether a new learner's first-lesson card has the letters' link (a pack that teaches the language's script, kana: deck.js scriptFirst):
 * its pack on the device with letters still new, or one the catalog last read on this device lists for the language that isn't on the device
 * yet (packs.js scriptPacksListed: it's coming). One that's here but off, or learned, isn't.
 */
const lettersComing = () => {
  const listed = typeof packs.scriptPacksListed === "function" ? (packs.scriptPacksListed(learning()) ?? []) : [];
  return listed.some((id) => !packs.allPacks().some((pack) => pack.id === id));
};
const lettersExpected = (now) => Boolean(scriptFirst(true, now)) || lettersComing();

/**
 * Home's card while the lessons come for a learner who has finished lessons (a returning learner on a new phone, its packs still coming): what's
 * next can't be worked out yet, and it's very likely Practice, so its card is held in Practice's shape: its title, its two lines (what you know,
 * mixed · its minutes), its Start and its way to the next lesson under it, each held in place. Another kind comes in that box and changes to its own
 * size on a curve (drawNext), never from nothing.
 */
const heldPractice = () =>
  nextStep({
    variant: "session",
    label: t("home.practice"),
    title: heldText("45%"),
    meta: [el("span", {}, heldText("10em")), el("span", {}, heldText("5em"))],
    action: { label: t("home.start"), held: true },
    secondary: { held: true },
    art: symbol("practice2", { size: 88 }),
  });

// The next step, in order. open: a practice that's open in the app.
function pickNext({ open, now, letters = "off" }) {
  const practice = practiceHref();
  if (open) {
    return {
      variant: "practice",
      kicker: t("home.upNext"),
      title: t("home.isOpen", { kind: PRACTICE_KINDS[open.settings?.kind]?.name ?? t("home.yourPractice") }),
      meta: open.client ? t("home.withPickUpWhereYou", { client: open.client }) : t("home.pickUpWhereYouLeft"),
      action: { label: t("home.backToIt"), icon: "chat", href: `${practice}/room/${encodeURIComponent(open.id)}` },
    };
  }
  const comeback = comebackNow(now);
  const study = studyOverview(now);
  const learn = study.lesson ? { text: t("home.learnSomethingNew", { title: study.lesson.title }), href: "#study/session/lesson?from=today" } : null;
  // The same one thing as Study: with nothing taught yet, a first lesson; after that, practice.
  if (study.firstTime && study.lesson) {
    // What the device has offered because the language's lessons didn't come (offline, a failed download, or past lessonsComing's wait): said plainly.
    const language = languageLabel(learning());
    const instead = lessonsMissing();
    // A language written in letters of its own (Japanese's kana): their pack offered beside lesson 1, never in its place. letters: drawNext's
    // decision for this visit ("on": the link, held in its shape until the pack is here; "off": none, even once it is).
    const script = letters === "on" ? scriptFirst(true, now) : null;
    const lettersHeld = letters === "on" && !script && lettersComing();
    return {
      variant: "new",
      kicker: t("home.yourFirstLesson"),
      lessonId: study.lesson.id,
      title: study.lesson.title,
      meta: instead ? (navigator.onLine === false ? t("home.lessonsNeedAConnection", { language }) : t("home.lessonsNotDownloaded", { language })) : t("home.aboutMin", { minutes: study.lesson.minutes }),
      action: { label: t("home.start"), icon: "play", href: "#study/session/lesson?from=today" },
      ...(script ? { secondary: { text: t("home.lettersFirst", { name: script.pack.name }), href: `#study/session/deck/${encodeURIComponent(script.pack.id)}?from=today` } } : lettersHeld ? { secondary: { held: true } } : {}),
    };
  }
  if (study.practice && !study.practicedToday) {
    // Back after days away: a greeting on the first day back. Never the days missed.
    const greet = comeback && comeback.day === 0;
    return {
      variant: "session",
      kicker: greet ? t("home.welcomeBack") : null,
      title: greet ? t("home.pickUpWhereYouLeft2") : t("home.practice"),
      meta: t("home.whatYouKnowMixedAbout", { minutes: study.practice.minutes }),
      action: { label: t("home.start"), icon: "play", href: "#study/session/practice?from=today" },
      secondary: learn,
    };
  }
  // (What you're reading is never the next step: its own card is right below, in More to do.)
  if (study.practice) {
    return {
      variant: "session",
      calm: true,
      title: t("home.youvePracticedToday"),
      meta: t("home.thatsTheDayCountedMore"),
      action: { label: t("home.practiceAgain"), icon: "refresh", href: "#study/session/practice?from=today" },
      secondary: learn,
    };
  }
  // A language just picked: its first pack is on its way, and this card redraws when it's here (onContentChange).
  if (!PACKS.length) {
    return {
      variant: "new",
      title: t("home.gettingReady", { language: languageLabel(learning()) }),
      meta: navigator.onLine === false ? t("home.itNeedsAConnectionThe") : t("home.itsFirstLessonsAreOn"),
      secondary: { text: t("home.findMoreInExplore"), href: "#explore" },
    };
  }
  return {
    variant: "new",
    title: t("home.readSomething"),
    meta: t("home.theresNothingNewToStudy"),
    action: { label: t("home.read"), icon: "book", href: "#read" },
    secondary: { text: t("home.findMoreInExplore"), href: "#explore" },
  };
}

/** What the main card shows: the symbol for what it does. (A lesson's own picture waits for the new picture style.) */
function artOf(next) {
  if (next.lessonId) return symbol("learn", { size: 88 });
  if (next.calm) return symbol("studied", { size: 88 });
  return symbol(next.variant === "reading" ? "reading" : next.variant === "practice" ? "ai-q" : next.variant === "session" ? "practice2" : "reading", { size: 88 });
}


/** The number under it, shown: the same count as things done this week, a bar for each of the last 7 days, today last. */
function weekBars(now, since) {
  const today = dayOf(now);
  const days = Array.from({ length: 7 }, () => new Set());
  for (const row of evidenceSince(since)) {
    days[6 - Math.min(6, Math.max(0, today - dayOf(row.at)))].add(`${sourceOf(row.activity)} ${row.at}`);
  }
  const most = Math.max(1, ...days.map((day) => day.size));
  return el(
    "span",
    { class: "lx-tile-bars", "aria-hidden": "true" },
    days.map((day, i) => {
      const bar = el("span", { class: "lx-tile-bar", state: day.size ? "done" : undefined, "aria-current": i === 6 ? "date" : undefined });
      bar.style.setProperty("--fill", String(day.size / most));
      return bar;
    }),
  );
}

/** The words you understand well, the latest first: real ones, which is what the number means (the Knowledge page's pile counts the same). */
function latestWords(rows, count = 6) {
  const latest = rows.slice(-count).reverse();
  return latest.length ? el("span", { class: "lx-tile-words" }, latest.map((row) => el("span", { class: "lx-tile-word" }, ui.wordLabel(shownName(row.unit))))) : null;
}

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// ---------- your progress ----------

// Today's throw (Tinta's drip into today's square) plays once a day, the first time Today shows the day counting.
// The sample learner's own while it's on (study/sample-mode.js).
const THROWN = sampleKey("lx.today.thrown");
const thrownOn = () => {
  try {
    return localStorage.getItem(THROWN);
  } catch {
    return null;
  }
};
const markThrown = (key) => {
  try {
    localStorage.setItem(THROWN, key);
  } catch {}
};

// The first day back after days away: Tinta at the streak spot waves, once that day (Home has one Tinta, and the hello is his).
const WAVED = sampleKey("lx.today.waved");
const wavedOn = () => {
  try {
    return localStorage.getItem(WAVED);
  } catch {
    return null;
  }
};
const markWaved = (key) => {
  try {
    localStorage.setItem(WAVED, key);
  } catch {}
};

/**
 * The streak spot's Tinta's pose: a calm pose lex-retention's todayPose picks (rest, mended); else ready (its drip of
 * ink) until today counts, then counted. While the day's throw is still to come it stays ready: it throws from there.
 */
function spotPose(streak, mark, key) {
  const counted = streak.state === "done";
  if (counted && motion.motionOn() && thrownOn() !== key) return "ready";
  return mark?.pose ?? (counted ? "counted" : "ready");
}

/** What Your progress shows, as data: Home draws it again only when this changes. */
function wordsOf(started, now) {
  const words = started ? startedWords({ lang: learning(), now }) : [];
  return { words, understood: words.filter((row) => row.known) };
}

function progressOf(now) {
  const k = knowledge({ now });
  const started = KIND_ORDER.some((kind) => k.kinds[kind].started);
  const w = week({ now });
  const today = dayKey(now);
  const mark = todayPose(w.streak, today);
  return {
    today,
    // The words you've started, and of them the ones you understand well (summary.js understood), as the Knowledge page counts them.
    ...wordsOf(started, now),
    started,
    w,
    mark,
    pose: spotPose(w.streak, mark, today),
    done: started ? Object.values(sources({ since: now - 7 * DAY })).reduce((sum, n) => sum + n, 0) : 0,
    points: started ? growth({ now, phrases: true }) : null,
  };
}

function progressNode(now, tinta, { words, understood, started, w, mark, pose, done, points } = progressOf(now)) {
  const days = w.days.map((day, i) => ({
    ...day,
    label: WEEKDAY[i],
    title: t(day.studied ? "home.dayStudied" : day.rested ? "home.dayRested" : day.paused ? "home.dayPaused" : "home.day", { date: formatDate(day.date, { weekday: "long", day: "numeric", month: "short" }) }),
  }));
  const head = ui.sectionHead(t("home.yourProgress"), started ? { link: { href: "#know", label: t("home.allOfIt") } } : undefined);
  const streak = streakSummary(w.streak, { inLink: true });
  // The day a calm pose at the streak is about (a rest day used, a missed day mended), ringed in the strip: mark.
  // Tinta at the streak (one for the page, moved into each new drawing, so a throw it's playing carries on); before
  // anything's been studied the empty state's Tinta speaks for the section, so the spot has none yet.
  ui.holdCharacter(tinta, pose);
  // All of it opens the streak's page: the number, the flame and the week row (the owner's walkthrough, 6 Nov 2026).
  const spot = streakSpot({ character: started ? tinta : null, summary: streak, strip: weekStrip(days, w.studied, { count: false, mark }), href: "#settings/streak?from=today" });
  if (!started) {
    return el("section", { class: "lx-today-progress" }, head, ui.emptyState(t("home.afterYourFirstSessionYour"), { pose: "page" }), spot);
  }
  const change = points.at(-1).n - points[0].n;
  // The streak first: Tinta and today's throw are in a phone's first view, with no scrolling to find them.
  return el(
    "section",
    { class: "lx-today-progress" },
    head,
    spot,
    statTiles([
      // The words you know well; before the first of them, the words you've started, as Knowledge's Your words card counts them then, so a
      // first day reads as what it did, never 0.
      understood.length
        ? { symbol: "recall-q", n: understood.length, label: t("home.wordsYoudRecall", { count: understood.length }), href: "#know", extra: latestWords(understood) }
        : { symbol: "recall-q", n: words.length, label: t("home.wordsStarted", { count: words.length }), href: "#know", extra: latestWords(words) },
      { symbol: "done-q", n: done, label: t("home.thingsDoneThisWeek", { count: done }), href: "#know/days", extra: weekBars(now, now - 7 * DAY) },
    ]),
    // Last 4 weeks once there are four weeks to show (its first day has words): before that it's a few bars at the end of an empty month, and the
    // two tiles above say it.
    !(points[0].n > 0) ? null : knowLinkCard({ title: t("home.last4Weeks"), sub: change > 0 ? t("home.moreWords", { count: change }) : t("home.dayByDay"), href: "#know", preview: growthChart({ points, what: t("home.wordsAndPhrasesYoudRecall") }) }),
  );
}

/**
 * Today's throw: the first time Today shows the day counting, once the streak spot is on the screen, Tinta throws its
 * drip into today's square (the rig's inkdrop/today-throw.js, played by the part's perform()). The square keeps its
 * open look (data-ink) until the ink lands on it, at THROW_IMPACT; the act's end, or a press, shows it at once. With
 * animations off there's no throw (the day is marked, so it never plays late). Returns stop().
 */
function throwWhenSeen(tinta, progressSlot, now) {
  let watching = null;
  const stop = () => {
    watching?.disconnect();
    watching = null;
  };
  const check = () => {
    stop();
    const key = dayKey(now());
    const day = progressSlot.querySelector('[data-part="week-day"][aria-current="date"]');
    if (day?.getAttribute("data-state") !== "studied" || thrownOn() === key) return;
    if (!motion.motionOn()) return void markThrown(key);
    const spot = progressSlot.querySelector('[data-part="streak-spot"]');
    if (!spot) return;
    // On the screen means clear of a phone's tab bar: a throw under it would be today's throw missed.
    const bar = document.querySelector('[data-part="tab-bar"]')?.getBoundingClientRect();
    const under = bar && bar.top > innerHeight / 2 ? Math.round(innerHeight - bar.top) : 0;
    watching = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      stop();
      if (thrownOn() === key || !day.isConnected || !motion.motionOn()) return;
      markThrown(key);
      // Held open first, so the square never shows its check before the ink arrives.
      day.setAttribute("data-ink", "");
      let timer = 0;
      const open = () => {
        clearTimeout(timer);
        day.removeAttribute("data-ink");
        ended?.disconnect();
        motion.decorate(day.querySelector(".lx-week-mark > svg"), [
          { transform: "scale(0.2, 0.2)" },
          { transform: "scale(1.28, 0.82)", offset: 0.42 },
          { transform: "scale(0.92, 1.1)", offset: 0.7 },
          { transform: "none" },
        ], { duration: 380 });
      };
      // Its end (back to a held state), or a press ending it, shows the square at once.
      const ended = new MutationObserver(() => {
        if (tinta.getAttribute("data-state") !== "throw") open();
      });
      timer = setTimeout(open, 4000);
      Promise.all([import("../character/rig/inkdrop/today-throw.js"), customElements.whenDefined("lx-tinta")])
        .then(([{ throwToday, THROW_IMPACT }]) => {
          if (!day.isConnected || !tinta.isConnected) return open();
          // It settles where the spot is now, counted or the calm pose that holds today (mended), its throw ending
          // straight into that pose.
          const into = todayPose(streakNow(), key)?.pose ?? "counted";
          ui.holdCharacter(tinta, into);
          tinta.perform((options) => throwToday({ ...options, into, mark: "splat", markScale: 46 / 40 }), [day.querySelector(".lx-week-mark")]);
          if (tinta.getAttribute("data-state") !== "throw") return open();
          clearTimeout(timer);
          timer = setTimeout(open, THROW_IMPACT * 1000);
          ended.observe(tinta, { attributes: true, attributeFilter: ["data-state"] });
        })
        .catch(open);
    }, { threshold: 0.75, rootMargin: `0px 0px ${-under}px 0px` });
    watching.observe(spot);
  };
  return { check, stop };
}

/**
 * Tinta's hello on the first day back after days away (the next-step card says Welcome back): he waves from the streak spot, once that
 * day, the first time the spot is on the screen clear of the tab bar. Never in place of today's throw (once something's finished that
 * day, the throw is his), nothing about the gap, never with animations off. Returns { check, stop }.
 */
function waveWhenSeen(tinta, progressSlot, now) {
  let watching = null;
  const stop = () => {
    watching?.disconnect();
    watching = null;
  };
  const check = () => {
    stop();
    const key = dayKey(now());
    // Which day back it is, from the days studied alone: comebackNow's share works out what's due (the scheduler's whole view), and this runs
    // in Home's return, while that view is still being worked out a piece at a time (a 184 ms task on a phone slowed 4×, 7 Nov).
    if (comebackDays(now())?.day !== 0 || wavedOn() === key || !motion.motionOn()) return;
    const day = progressSlot.querySelector('[data-part="week-day"][aria-current="date"]');
    if (day?.getAttribute("data-state") === "studied") return;
    const spot = progressSlot.querySelector('[data-part="streak-spot"]');
    if (!spot) return;
    const bar = document.querySelector('[data-part="tab-bar"]')?.getBoundingClientRect();
    const under = bar && bar.top > innerHeight / 2 ? Math.round(innerHeight - bar.top) : 0;
    watching = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        stop();
        if (wavedOn() === key || !tinta.isConnected || !motion.motionOn()) return;
        markWaved(key);
        ui.playCharacter(tinta, "wave");
      },
      { threshold: 0.75, rootMargin: `0px 0px ${-under}px 0px` },
    );
    watching.observe(spot);
  };
  return { check, stop };
}

/** Renders Today into `page`. Returns { title, dispose }. */
export function renderToday(page, { onTranslate } = {}) {
  let alive = true;
  let open = null;
  let reading = null;
  const now = () => Date.now();
  // What's next: its place held as it was last time (lx/shapes.js) until it's drawn, never filled with a guess that changes under you.
  const nextSlot = el("div", { class: "lx-today-next" }, ...heldPlace("today.next"));
  const progressSlot = el("div", { class: "lx-today-progress-slot" });
  // Tinta at the streak spot: one for the page (progressNode moves it into each drawing).
  const spotTinta = ui.character({ state: "ready", size: 64, hidden: true, pokeable: true });
  const throwing = throwWhenSeen(spotTinta, progressSlot, () => Date.now());
  const waving = waveWhenSeen(spotTinta, progressSlot, () => Date.now());
  // Home's cards under Your progress: the app's own notes, then Reading (the book you're reading, with the way to every book at its heading's end),
  // then Your AI under its own heading. Each card and heading is drawn once and kept (drawBook).
  const keepList = el("div", { class: "lx-home-cards" });
  const keepSection = el("section", { part: "section", hidden: true }, keepList);

  let shownNext = "";
  // A change Home didn't follow while it was off the screen (waits, below).
  let waiting = false;
  let warming = null;
  // Today's one thing drawn again as what it's worked out from comes in after the start (the packs, the word list, the history): for the first
  // seconds the slot never gets shorter, so nothing under it moves up. On a first start the card's other way went from two lines to one as the
  // packs came, and Your progress moved up 12 px (7 Nov 2026). The card itself is what's kept as the slot's height (lx/shapes.js), so the next
  // start's held place is the card's.
  let firstDrawnAt = 0;
  const START_SWAPS = 6000;
  // The language's lessons still on their way (lessonsComing): what's next can't be worked out yet, and the app's starter isn't it (7 Nov 2026).
  // The card is held in the shape it most likely comes in (HELD below): a new learner's first lesson (heldFirstLesson), or, for anyone who has
  // studied, Practice (heldPractice). onLessonsComing (a give-up) and onContentChange (the lessons here) draw it; a card that comes taller or shorter than
  // its place changes to its own size on a curve, never from nothing.
  const builtAt = performance.now();
  const HELD = "held";
  // The letters' link on a new learner's first-lesson card, decided once for this visit: on when it can be known (lettersExpected: the pack
  // here, or the catalog listing it), its place held in its shape until the pack is here; else off, and a pack that comes after never adds it,
  // so the card never grows once it's on the screen (8 Nov 2026). A held card that can't know yet (a device that has never read the catalog)
  // leaves it to the card that comes in its place, which changes the slot's size on a curve as it comes anyway.
  let letters = null;
  const lettersOn = ({ held = false } = {}) => {
    if (letters) return letters === "on";
    const on = lettersExpected(now());
    if (on || !held) letters = on ? "on" : "off";
    return on;
  };
  const drawNext = ({ warmed = false } = {}) => {
    waiting = false;
    if ((!shownNext || shownNext === HELD) && lessonsComing()) {
      if (!shownNext) {
        shownNext = HELD;
        // The shape follows what Home will show once the lessons are in: Practice for anyone who has studied (a lesson finished, or a game played
        // before any lesson), else the first lesson. (Not studyOverview's firstTime: it counts what's on the device, a part of it while they come.)
        nextSlot.replaceChildren(lessonsFinished().size || studiedUnits(learning()).length ? heldPractice() : heldFirstLesson({ letters: lettersOn({ held: true }) }));
        firstDrawnAt = performance.now();
      }
      return;
    }
    // After the study material changes (a pack on or off, a new version), what the card says is worked out again: a piece at a time, the card
    // that's there staying until the new one is ready (plan.js warmPlan through slices.js), so no task holds the page for long. (It was one task
    // of 200 ms and more on a phone slowed 4×.) The same when only time has passed since (what's next is very likely the same). Not after
    // studying elsewhere: then the card is new at once, as it comes back (a first lesson done elsewhere left "Your first lesson" on Home's first
    // frame, "Practice" a frame later). The first draw has no card to keep: it works it out at once, as a start has it kept (plan-kept.js).
    // Once it's warm the card is drawn (never a second round): at worst that draw works out the rest at once, as before.
    const stale = shownNext && shownNext !== HELD && !warmed ? planStale(now()) : null;
    if (stale === "content" || stale === "time") {
      warming ??= inSlices(warmPlan(now()), { alive: () => alive }).then(
        () => {
          warming = null;
          if (alive) drawNext({ warmed: true });
        },
        () => (warming = null),
      );
      return;
    }
    const next = pickNext({ open, now: now(), letters: lettersOn() ? "on" : "off" });
    const key = JSON.stringify(next);
    if (key === shownNext) return;
    const first = !shownNext;
    const held = shownNext === HELD;
    shownNext = key;
    const card = nextStep({ ...next, art: artOf(next) });
    const was = nextSlot.getBoundingClientRect().height;
    const heldCard = held ? nextSlot.firstElementChild : null;
    // A first card drawn late (after a held wait for the lessons): Home is already on the screen, its place held at its last height or none, or
    // held as the card itself (HELD).
    const late = (first && performance.now() - builtAt > 100) || held;
    nextSlot.replaceChildren(card);
    if (first) firstDrawnAt = performance.now();
    else if (!held && was && performance.now() - firstDrawnAt < START_SWAPS) nextSlot.style.minHeight = `${Math.round(Math.max(was, parseFloat(nextSlot.style.minHeight) || 0))}px`;
    if (late && nextSlot.isConnected) {
      const now = nextSlot.getBoundingClientRect().height;
      if (Math.abs(now - was) > 1) motion.animate(nextSlot, [{ height: `${was}px`, overflow: "hidden" }, { height: `${now}px`, overflow: "hidden" }], { duration: motion.duration("--dur-320", 320) });
      // In place of the held card: the card that came is there whole at once, and the held card stays over it a moment, fading out, so its held
      // lines dissolve into the words (its kicker and symbol are the same as beneath). Fading the words in from nothing showed a frame of neither
      // (lex-retention's afternoon re-rehearsal, 7 Nov).
      if (held && heldCard && motion.motionOn()) {
        if (getComputedStyle(nextSlot).position === "static") nextSlot.style.position = "relative";
        Object.assign(heldCard.style, { position: "absolute", top: "0", left: "0", right: "0", pointerEvents: "none", zIndex: "1" });
        heldCard.inert = true;
        heldCard.setAttribute("aria-hidden", "true");
        nextSlot.append(heldCard);
        motion.animate(heldCard, [{ opacity: 1 }, { opacity: 0 }], { duration: motion.duration("--dur-160", 160), fill: "forwards", onEnd: () => heldCard.remove() });
      } else if (!held) motion.appear(card, { rise: 0 });
    }
    keepHeight("today.next", card);
    if (!first && !held) motion.appear(card, { rise: 0 });
  };
  let remindersPaused = false;
  // What the cards show beside what you're reading: its cover (Read's), the shelf's first books when you aren't, your last exchange with your AI.
  let cover = { cover: {}, picture: null, urls: [] };
  let shelf = null;
  let talk = null;
  // Each card drawn from what it shows (its key), and kept while that's the same: a redraw (the shelf arriving, coming back to Home) never puts a new
  // card under a finger, restarts its book or its Tinta, or moves the list.
  let shown = new Map(); // key → { node, stop }
  const drawBook = () => {
    const language = languageLabel(learning());
    // Reminders paused after going unanswered (src/reminders.ts): said once here, with the way back on. Then, on a phone that hasn't added
    // Lexicommons to its Home Screen once you've studied, the way to (settings-install.js).
    const offer = installOffer({ finishedSomething: streakNow().longest > 0 });
    const wanted = [];
    if (remindersPaused) wanted.push({ key: "paused", make: () => ({ node: pausedCard() }) });
    if (offer) wanted.push({ key: JSON.stringify(["install", offer.inApp]), make: () => ({ node: installCard({ inApp: offer.inApp, onDismiss: () => (offer.dismiss(), drawBook()) }) }) });
    // What has no tab: Read (for now, always: the book you're reading, else Read's own), and your AI once one's connected when it isn't in the bar.
    const where = reading ? whereIn(reading) : null;
    // With a book, its heading's end is the way to every book (as All of it is on Your progress); with none, the card itself opens Read.
    if (reading) wanted.push({ key: "reading-head", make: () => ({ node: el("div", { class: "lx-hc-head" }, ui.sectionHead(t("home.reading"), { link: { href: "#read", label: t("home.allBooks") } })) }) });
    // A language of your own has no books (they're in the languages Lexicommons lists): its card only while you're reading one.
    if (reading || !isOwnLanguage(learning()))
      wanted.push({
        key: JSON.stringify(["book", reading, cover.picture, where, shelf, language]),
        make: () => ({ node: bookCard({ reading, picture: reading ? cover.picture : null, where, shelf, language }) }),
      });
    if (aiConnected() && thirdTab() !== "ai") {
      const exchange = talk?.exchange ?? null;
      const client = talk?.client ?? null;
      // Under its own heading, never read as part of Reading.
      wanted.push({ key: "ai-head", make: () => ({ node: el("div", { class: "lx-hc-head" }, ui.sectionHead(t("home.yourAi"))) }) });
      wanted.push({ key: JSON.stringify(["ai", exchange, client, language]), make: () => ({ node: aiCard({ exchange, client, lang: learning(), language }) }) });
    }
    const next = new Map();
    for (const { key, make } of wanted) next.set(key, shown.get(key) ?? make());
    for (const [key, card] of shown) if (!next.has(key)) card.stop?.();
    const nodes = [...next.values()].map((card) => card.node);
    if (nodes.length !== keepList.children.length || nodes.some((node, i) => keepList.children[i] !== node)) keepList.replaceChildren(...nodes);
    // What a new card starts once it's in the page: the book opening with the scroll, Tinta reading your AI's line.
    for (const [key, card] of next) {
      if (shown.get(key) === card) continue;
      const stops = [card.node.matches('[data-variant="book"]') ? bookOpens(card.node) : null, card.node.matches('[data-variant="ai"]') ? aiCardReads(card.node) : null].filter(Boolean);
      card.stop = () => stops.forEach((stop) => stop());
    }
    shown = next;
    keepSection.hidden = !nodes.length;
  };
  const stopBook = () => {
    for (const card of shown.values()) card.stop?.();
  };
  // The small movements play once, as the page first arrives; never on a redraw.
  if (motion.motionOn()) {
    page.setAttribute("data-arrive", "");
    setTimeout(() => page.removeAttribute("data-arrive"), 1800);
  }
  // Your progress, drawn again only when what it shows has changed: coming back to Home with nothing new leaves it (and its Tinta) as it is.
  let shownProgress = "";
  const drawProgress = () => {
    const at = now();
    const progress = progressOf(at);
    // (The chart's points by their counts: their times move with the clock, and the day is in the key already.)
    // (The words by how many and the latest six, which is what the tile shows: the ones known well, and the ones started it shows before them.)
    const brief = (rows) => [rows.length, ...rows.slice(-6).map((row) => row.unit)];
    const key = JSON.stringify([{ ...progress, words: brief(progress.words), understood: brief(progress.understood), points: progress.points?.map((point) => point.n) }, evidenceVersion()]);
    if (key === shownProgress) return;
    shownProgress = key;
    progressSlot.replaceChildren(progressNode(at, spotTinta, progress));
  };
  // What Home last drew everything from. A kept Home whose data changed while you were away (stale) is brought up to date before it's shown, all of
  // it at once; with nothing changed, it's shown as it is and looks again after (shell/main.js). (A first lesson done elsewhere left "Your first
  // lesson" on Home's first frame, "Practice" a frame later.)
  let doneChanges = 0;
  let contentChanges = 0;
  const offDone = onDoneChange(() => doneChanges++);
  const offContentCount = onContentChange(() => contentChanges++);
  const drawnParts = () => [evidenceVersion(), doneChanges, contentChanges, dayKey(Date.now()), learning()];
  const drawnFromNow = () => drawnParts().join("|");
  let drawnFrom = "";
  // Whether all that changed since everything was last drawn is the study material (its count, the third part), or nothing (Home waited
  // while off the screen for a word list): what only the next step reads.
  const onlyContentChanged = () => {
    const was = drawnFrom.split("|");
    return was.length === 5 && drawnParts().every((part, i) => i === 2 || String(part) === was[i]);
  };
  const drawAll = () => {
    drawNext();
    drawProgress();
    drawBook();
    throwing.check();
    waving.check();
    drawnFrom = drawnFromNow();
  };

  const dateLine = el("p", { class: "lx-today-date" });
  const drawDate = () => {
    const text = formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" });
    if (dateLine.textContent !== text) dateLine.textContent = text;
  };
  drawDate();
  const translating = translatePage({ host: page, onChange: onTranslate });
  page.replaceChildren(
    dateLine,
    translating.node,
    nextSlot,
    progressSlot,
    keepSection,
  );
  // On a computer (from 1280, know.css) Your progress is a column of its own beside the rest, so in the page's order (Tab, a screen reader) it
  // comes after them, as it's laid out: down the first column, then down the second. On a phone it's between what's next and what to read, as
  // it's seen there. Moved again when the window crosses 1280.
  const beside = globalThis.matchMedia?.("(min-width: 1280px)");
  const placeProgress = () => {
    const after = beside?.matches ? keepSection : nextSlot;
    if (after.nextElementSibling !== progressSlot) after.after(progressSlot);
  };
  placeProgress();
  beside?.addEventListener("change", placeProgress);
  drawAll();

  // What only comes later: a practice that's open (from the server), what you're reading (from this device), and
  // practices your AI finished while you were away, saved here now (their evidence moves what you know).
  const later = () => {
    const version = evidenceVersion();
    collectFinished()
      .then((result) => {
        if (!alive) return;
        open = result.open.find((p) => p.mode === "app") ?? null;
        if (evidenceVersion() !== version) drawAll();
        else drawNext();
      })
      .catch(() => {});
    // Your last exchange with your AI (this device's practices, in the language you're learning), only with one connected.
    const talking = aiConnected()
      ? listPractices()
          .then((list) => {
            const practice = list.find((one) => languageOf(one) === learning() && lastExchange(one));
            talk = practice ? { exchange: lastExchange(practice), client: practice.client ?? null } : null;
          })
          .catch(() => {})
      : Promise.resolve((talk = null));
    return Promise.all([
      continueReading().then(async (found) => {
        if (!alive) return;
        reading = found;
        const key = found ? `${found.id} ${found.picture}` : null;
        if (!found || key === cover.key) return;
        const next = await coverOfBook(found.id, found.picture).catch(() => ({ cover: {}, picture: null, urls: [] }));
        for (const url of cover.urls) URL.revokeObjectURL(url);
        cover = { ...next, key };
      }),
      talking,
    ])
      .catch(() => {})
      .then(() => {
        if (!alive) return;
        drawNext();
        drawBook();
        if (!reading && !shelf)
          loadCatalog()
            .then((catalog) => {
              if (!alive) return;
              shelf = shelfStart(catalog);
              if (!reading) drawBook();
            })
            .catch(() => {});
      });
  };
  // Shown whole once what you're reading is known (shell/main.js reveal).
  const ready = later();
  // A first open: the packs and the word list arrive after the page is drawn, and today's one thing follows them, while Home is on the
  // screen. Off it (another tab, a session or a book over it, Translate open in it), what's next waits until it's shown again, so only what's
  // on the screen works anything out: a kept Home is brought up to date as it comes back (stale, shell/main.js), and Translate closing
  // brings it up to date before that frame (a sync's new packs worked out the plan while you typed: a phone's page held for a fifth of a
  // second at 4×, 7 Nov 2026).
  const onScreen = () => page.isConnected && !page.hasAttribute("data-translating");
  const follow = () => {
    if (!alive) return;
    if (onScreen()) drawNext();
    else waiting = true;
  };
  const offContent = onContentChange(follow);
  // The lessons' wait given up (offline, a failed download, its 15 s): no content changes, so this alone draws the card then.
  const offLessons = typeof packs.onLessonsComing === "function" ? packs.onLessonsComing(follow) : null;
  const offFrequency = onFrequency(follow);
  const translateClosed = new MutationObserver(() => alive && waiting && onScreen() && drawNext());
  translateClosed.observe(page, { attributes: true, attributeFilter: ["data-translating"] });
  // Whether reminders have paused themselves: the report (push.js) says, a moment after the page.
  report().then((r) => {
    if (!alive || !r?.stopped) return;
    remindersPaused = true;
    drawBook();
  });

  // Coming back to Today (the shell keeps it): the same page, brought up to date in place, what's already there staying
  // until what replaces it is ready.
  // Each part in a task of its own, so bringing the page up to date never holds it for long (one task, it was a long one on a slow phone).
  // Stale only because the study material changed (a pack on or off, a new version) or Home waited off the screen, only what's next reads that:
  // the return draws it alone (it holds its card and catches up a piece at a time, drawNext), and the rest follows in tasks of their own, as a
  // return with nothing changed has them (all of it at once was one task of 60–90 ms on a phone slowed 4×). Stale any other way (an answer, a
  // finished thing, the day, the language), all of it is drawn before the first frame, as a lesson done elsewhere needs.
  const refresh = ({ now = false } = {}) => {
    if (now && !onlyContentChanged()) {
      drawDate();
      drawAll();
      later();
      return;
    }
    drawDate();
    drawNext();
    const rest = () => {
      if (!alive) return;
      drawProgress();
      setTimeout(() => {
        if (!alive) return;
        drawBook();
        throwing.check();
        waving.check();
        if (now) drawnFrom = drawnFromNow();
        later();
      }, 0);
    };
    // What you know (summary.js knowledge) first, a piece at a time: it's kept for the minute, so a return a minute on works it out again, and
    // at once it made Your progress's task long (57 ms of it on a phone slowed 4×, 7 Nov). Your progress then finds it kept, in a task of its own.
    setTimeout(() => {
      if (alive) inSlices(warmKnowledge({ now: Date.now() }), { alive: () => alive }).then(rest, rest);
    }, 0);
  };
  return {
    title: "Home",
    ready,
    dispose: () => {
      alive = false;
      beside?.removeEventListener("change", placeProgress);
      offContent?.();
      offLessons?.();
      offFrequency?.();
      translateClosed.disconnect();
      throwing.stop();
      waving.stop();
      offDone();
      offContentCount();
      translating.dispose();
      stopBook();
      for (const url of cover.urls) URL.revokeObjectURL(url);
    },
    refresh,
    stale: () => waiting || drawnFromNow() !== drawnFrom,
    translate: translating.setOpen,
  };
}
