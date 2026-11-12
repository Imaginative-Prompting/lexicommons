// Home's cards, under Your progress: each one idea with one hero, its live data in it and the app's own art (docs/design-bible.md, "Home's
// cards"). The book you're reading is Read's own symbol drawn big, a hard-light book on Read's teal tile that opens as you scroll to it: its
// cover's angle is a pure function of where the card is on the screen, so scrolling back closes it again, and nothing waits on it; with
// animations off it's simply open. Your last exchange with your AI is drawn the same way, on a sun tile. Where most of a card is its colored
// tile, the tile is the card, with a hard edge in its own deep tone; the notices are doors (a border and a hard edge, as Study's).

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import * as motion from "../lx/motion.js";
import { icon } from "../lx/icons.js";
import { loadPictures, pictureNode } from "../study/pictures.js";
import { t } from "../lx/i18n.js";

const clamp = (v) => Math.min(1, Math.max(0, v));
const SVG = "http://www.w3.org/2000/svg";

// A chapter's title without its own number when that number is the chapter's ("I: Down the Rabbit-Hole" under Chapter 1, said once); any other
// title as it is.
const ROMAN = { i: 1, v: 5, x: 10, l: 50, c: 100 };
const romanValue = (s) => [...s.toLowerCase()].reduce((sum, ch, i, all) => sum + (ROMAN[ch] < (ROMAN[all[i + 1]] ?? 0) ? -ROMAN[ch] : ROMAN[ch]), 0);
function chapterTitle(title, n) {
  const m = /^\s*([ivxlc]+|\d+)\s*[:.)–—-]\s+(\S.*)$/iu.exec(title ?? "");
  if (!m) return title;
  return (/^\d+$/.test(m[1]) ? Number(m[1]) : romanValue(m[1])) === n ? m[2] : title;
}

// A book's cover in one of the art's paints, by its id (ui.coverPaint: the same paint Read's shelves draw it in), never the cover's own colors.
const paintOf = (seed = "") => ui.coverPaint(seed);

/** A drawing stretched to its box: paths in a 100 × 100 frame, each with its class (know.css colors it). The drawings are fixed here, never input. */
function stretched(className, paths, { flip = false } = {}) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  for (const [name, d] of paths) {
    const path = document.createElementNS(SVG, "path");
    if (name) path.setAttribute("class", name);
    path.setAttribute("d", d);
    svg.append(path);
  }
  // Mirrored by the stylesheet (know.css [data-flip]): WebKit ignores a transform attribute on an outer <svg>, and on an iPhone the
  // right page came out unmirrored, its top and foot off the left page's at the spine.
  if (flip) svg.setAttribute("data-flip", "");
  return svg;
}
/** An open book's page as Read's symbol draws one: its top and foot dipping toward the spine, on the few leaves under it. Drawn with the spine on the right. */
const pageShape = (side) =>
  stretched("lx-hb-sheet", [["lx-hb-leaves", "M0 5C35 1 72 2 100 8V100C72 95 35 94 0 98Z"], ["lx-hb-leaf", "M0 3C35 -1 72 0 100 6V97C72 92 35 91 0 95Z"]], { flip: side === "right" });
/** The cover's hard split: its lit side, and the far side in its deep tone, curving a little, as the symbols draw it. */
const coverSplit = () => stretched("lx-hb-split", [[null, "M62 0C64 34 61 70 52 100H100V0Z"]]);

/**
 * The book card. With a book you're reading: its own book, shut, its title on the cover, opening onto the chapter you're in (the lit page) and the
 * sentence you're at (the page in shadow; a woven book's as the reader weaves it, a picture book's beside its page's picture); under it, its title
 * and where you are in it. The way to every book is the Reading heading over it (today.js). With none: Read's own book, opening onto how many
 * books the shelf has for your language and its first ones; the card opens Read.
 *   reading: continueReading()'s, or null; picture: a picture book's page's picture (read/library.js coverOfBook), or null; where: where you are in
 *   it, in words; shelf: { books: [{ title, lang }], count } for the language, or null; language: the language's name.
 */
export function bookCard({ reading, picture = null, where, shelf, language }) {
  const has = Boolean(reading);
  return el(
    "a",
    { part: "home-card", variant: "book", href: has ? `#read/book/${encodeURIComponent(reading.id)}` : "#read", "data-first": has ? undefined : "" },
    bookArt({ reading, picture, shelf, language }),
    el(
      "span",
      { class: "lx-hc-text" },
      el("span", { class: "lx-hc-title", lang: has ? reading.textLang : undefined }, has ? reading.title : t("home.cardOpenABook")),
      has ? el("span", { class: "lx-hc-sub" }, where) : null,
    ),
  );
}

/**
 * The book you're reading as Read's symbol drawn big: a hard-light book on Read's teal tile, shut (its paint, its name, its ribbon), opening
 * onto the chapter you're in and the sentence you're at (bookOpens). The one drawing of a book, on Home's card and at the top of Read.
 */
export function bookArt({ reading, picture = null, shelf = null, language }) {
  const has = Boolean(reading);
  const leftPage = picture
    ? el("div", { class: "lx-hb-inside", "data-picture": "" }, el("img", { src: picture, alt: "", decoding: "async" }))
    : has
      ? el(
          "div",
          { class: "lx-hb-inside" },
          el("span", { class: "lx-hb-n" }, String(reading.page?.n ?? reading.chapter?.n ?? 1)),
          el("span", { class: "lx-hb-what", lang: reading.page || !reading.chapter?.title ? undefined : reading.textLang }, reading.page ? t("home.pageOf", { page: reading.page.n, pages: reading.page.of }) : reading.chapter?.title ? chapterTitle(reading.chapter.title, reading.chapter.n ?? 1) : t("home.cardChapter", { chapter: reading.chapter?.n ?? 1 })),
        )
      : el(
          "div",
          { class: "lx-hb-inside" },
          shelf?.count ? el("span", { class: "lx-hb-n" }, String(shelf.count)) : null,
          el("span", { class: "lx-hb-what" }, shelf?.count ? t("home.cardBooksToRead", { count: shelf.count, language }) : t("home.cardRead")),
        );
  const rightPage = el(
    "div",
    { class: "lx-hb-page" },
    has
      ? reading.passage?.length
        ? el("p", { class: "lx-hb-text", lang: reading.textLang }, reading.passage.map((piece) => (piece.target ? el("span", { class: "lx-hb-woven", lang: reading.lang }, piece.text) : piece.text)))
        : null
      : shelf?.books.length
        ? [el("span", { class: "lx-hb-contents" }, t("home.cardToStartWith")), fitWhole(el("ol", { class: "lx-hb-list" }, shelf.books.slice(0, 4).map((book) => el("li", {}, el("bdi", { lang: book.lang }, book.title)))))]
        : shelf
          ? // The shelf is known and has none for the language: said, and what you can do meanwhile.
            [el("span", { class: "lx-hb-contents" }, t("home.cardNoBooksIn", { language })), el("p", { class: "lx-hb-text" }, t("home.cardNoBooksWhat"))]
          : el("p", { class: "lx-hb-text" }, t("home.cardBooksIn", { language })),
  );
  // On the cover, the book's own name, before any subtitle.
  const front = el("div", { class: "lx-hb-front" }, coverSplit(), el("span", { class: "lx-hb-cover-title", lang: has ? reading.textLang : undefined }, has ? reading.title.split(/:\s/u)[0] : t("home.cardRead")));
  return el(
    "div",
    { class: "lx-hb-tile", "data-paint": has ? paintOf(reading.id) : "violet", "aria-hidden": "true" },
    el(
      "div",
      { class: "lx-hb-book" },
      el("div", { class: "lx-hb-cast" }),
      el("div", { class: "lx-hb-block" }, pageShape("right"), rightPage, el("span", { class: "lx-hb-ribbon" })),
      el("div", { class: "lx-hb-cover" }, front, el("div", { class: "lx-hb-back" }, pageShape("left"), leftPage)),
    ),
  );
}

/**
 * A list on the book's page showing only whole items: as many as fit above the page's foot at its width and type size, the rest left
 * off, never one cut by the page's edge (French titles run to two lines). Fitted by a ResizeObserver on the page, which runs after layout
 * and before paint, so the list is whole in the first frame it shows, and again when the card's size changes. Returns the list.
 */
function fitWhole(list) {
  if (typeof ResizeObserver !== "function") return list;
  const fit = () => {
    const page = list.closest(".lx-hb-page");
    if (!page) return;
    const room = page.clientHeight;
    let cut = false;
    for (const item of list.children) {
      item.hidden = false;
      // Its foot within the page (the page is its offsetParent: positioned, the list isn't); a transform on the book changes neither.
      cut ||= item.offsetTop + item.offsetHeight > room + 0.5;
      item.hidden = cut;
    }
  };
  const watch = new ResizeObserver(fit);
  // The page holds it once the card's built: watched from then (an observer on the list alone wouldn't see the page's height change).
  queueMicrotask(() => list.closest(".lx-hb-page") && watch.observe(list.closest(".lx-hb-page")));
  return list;
}

/**
 * Opens a book card's book as it comes up the screen: shut until it's all in view (its foot 24 px clear of the tab bar floating over the screen's
 * foot), open once its top is a quarter of the way down. A book that's all in view with the page at its top (a computer's Home, where it's in
 * the first screen) is simply open: it rested part-turned there, its pages squeezed, until you scrolled (11 Nov 2026, 1280 × 800).
 * Returns stop().
 */
export function bookOpens(card) {
  const book = card?.querySelector(".lx-hb-book");
  if (!book) return () => {};
  if (!motion.motionOn()) {
    book.style.setProperty("--open", "1");
    return () => {};
  }
  const scroller = card.closest('[data-part="page"]');
  let last = -1;
  let frame = 0;
  const update = () => {
    frame = 0;
    if (!card.isConnected) return;
    const box = book.getBoundingClientRect();
    if (!box.height) return;
    // Its box without the cover's slide: the slide moves it across, never up or down. In view means clear of the bar.
    const bar = document.querySelector('[data-part="tab-bar"]')?.getBoundingClientRect();
    const foot = bar?.height && bar.top > innerHeight / 2 ? bar.top : innerHeight;
    // Open once its top is a quarter of the way down, or, near the page's end, at the highest it can come (the page scrolled to its
    // end): a book on a short page or last on it opens all the way, never left part way. It opens over a quarter screen of scroll at least.
    const atTop = box.top + (scroller ? scroller.scrollTop : scrollY); // where it is with the page at its top
    if (atTop + box.height <= foot - 24) {
      if (last !== 1) book.style.setProperty("--open", "1");
      last = 1;
      return;
    }
    const reach = scroller ? box.top - Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) : -Infinity;
    const end = Math.max(innerHeight * 0.25, reach);
    const start = Math.max(foot - 24 - box.height, end + innerHeight * 0.25);
    const k = clamp((start - box.top) / (start - end));
    // Written only when it changes, in two-hundredths: the book alone restyles.
    const open = Math.round(k * k * (3 - 2 * k) * 200) / 200;
    if (open === last) return;
    last = open;
    book.style.setProperty("--open", String(open));
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const target = scroller ?? window;
  target.addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  update();
  return () => {
    target.removeEventListener("scroll", onScroll);
    removeEventListener("resize", onScroll);
    cancelAnimationFrame(frame);
  };
}

/**
 * Your AI, and the last thing you said to each other: the exchange drawn in hard light on a sun tile, its line in the language lit with what it
 * means under it, your answer in ink, and Tinta on the floor beside your answer. When your AI had the last word, your bubble is the empty place
 * an answer goes ("Your turn"). Only with an AI connected (outside the AI section the app never offers one). exchange: lastExchange()'s or null;
 * client: what it's called; lang: the language's code; language: its name. Tinta holds `beside` and reads the line once it's seen (aiCardReads);
 * a tap on him is a poke, his alone (the card doesn't open).
 */
export function aiCard({ exchange, client, lang, language }) {
  const name = client || t("home.yourAi");
  const tinta = ui.character({ state: "beside", size: 48, hidden: true, pokeable: true });
  tinta.classList.add("lx-hc-perch");
  const ai = exchange
    ? el("span", { class: "lx-hc-bubble", "data-who": "ai" }, el("span", { class: "lx-hc-words", lang, "data-ai-line": "" }, exchange.ai.text), exchange.ai.means ? el("span", { class: "lx-hc-means" }, exchange.ai.means) : null)
    : el("span", { class: "lx-hc-bubble", "data-who": "ai" }, el("span", { class: "lx-hc-words" }, t("home.cardTalkWith", { client: name, language })));
  const you = exchange?.you
    ? el("span", { class: "lx-hc-bubble", "data-who": "you" }, el("span", { class: "lx-hc-words", lang }, exchange.you))
    : exchange
      ? el("span", { class: "lx-hc-bubble", "data-who": "turn" }, t("home.cardYourTurn"))
      : null;
  return el(
    "a",
    { part: "home-card", variant: "ai", href: "#ai", "data-line": exchange?.ai.text, "data-ask": exchange && !exchange.you ? "" : undefined },
    el("span", { class: "lx-hc-scene" }, ai, el("span", { class: "lx-hc-floor" }, tinta, you)),
    el(
      "span",
      { class: "lx-hc-text" },
      el("span", { class: "lx-hc-title" }, exchange ? t("home.cardPickUpTheConversation") : t("home.cardHaveAConversation")),
      el("span", { class: "lx-hc-sub" }, t("home.cardWithClient", { client: name })),
    ),
  );
}

/** The last exchange of a practice: its last line from your AI in the language (and what it means), and what you said after it (null when it had the last word). */
export function lastExchange(practice) {
  const turns = practice?.turns ?? [];
  const said = (turn) => turn?.who === "you" && turn.type === "said" && typeof turn.text === "string" && turn.text.trim();
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    const line = turn?.who === "ai" && turn.type === "reply" && Array.isArray(turn.say) ? turn.say.findLast((one) => typeof one?.nl === "string" && one.nl.trim()) : null;
    if (!line) continue;
    const you = turns.slice(i + 1).find(said);
    return { ai: { text: line.nl, means: typeof line.en === "string" ? line.en : null }, you: you?.text ?? null };
  }
  return null;
}

// The lines Tinta has read on this page's life: each once, as Today's throw is.
const read = new Set();

/**
 * Tinta reads your AI's line once the AI card is on the screen, clear of the tab bar (lex-character's read act from `beside`, back to it exactly):
 * a curious look and a nod toward the line when it waits on your answer, else a happy blink. Never with animations off; a press ends it. Returns stop().
 */
export function aiCardReads(card) {
  const tinta = card?.querySelector(".lx-hc-perch");
  const line = card?.querySelector("[data-ai-line][lang]");
  const key = card?.dataset.line;
  if (!tinta || !line || !key || read.has(key) || !motion.motionOn()) return () => {};
  const bar = document.querySelector('[data-part="tab-bar"]')?.getBoundingClientRect();
  const under = bar && bar.top > innerHeight / 2 ? Math.round(innerHeight - bar.top) : 0;
  let watching = null;
  const stop = () => {
    watching?.disconnect();
    watching = null;
  };
  watching = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      stop();
      if (!line.isConnected || read.has(key) || !motion.motionOn()) return;
      read.add(key);
      const style = getComputedStyle(line);
      const options = { ask: card.dataset.ask !== undefined, rtl: style.direction === "rtl", lineHeight: parseFloat(style.lineHeight) || 21.6 };
      import("../character/rig/inkdrop/read-line.js")
        .then(({ readLine }) => line.isConnected && ui.performCharacter(tinta, (o) => readLine({ ...o, ...options }), [line]))
        .catch(() => {});
    },
    { threshold: 0.75, rootMargin: `0px 0px ${-under}px 0px` },
  );
  watching.observe(card);
  return stop;
}

/** The install card's drawing: lex-art's phone in its stand, the app's own icon on its screen (in the screen's slant); a plain phone until it's here. */
function installArt() {
  const icon = () => el("img", { class: "lx-hc-phone-icon", src: "/icons/icon.svg", alt: "", width: 40, height: 40 });
  const art = el("div", { class: "lx-hc-art", "aria-hidden": "true" }, el("span", { class: "lx-hc-phone" }, el("span", { class: "lx-hc-phone-screen" }, icon())));
  loadPictures(["card-install"])
    .then((found) => found && art.replaceChildren(el("span", { class: "lx-hc-drawn" }, pictureNode("card-install"), icon())))
    .catch(() => {});
  return art;
}

/** Adding Lexicommons to the Home Screen (a phone that hasn't, once something's finished), as a door: the phone, its title and one line; the card shows how, its cross is Not now. */
export function installCard({ inApp, onDismiss }) {
  return el(
    "div",
    { part: "home-card", variant: "install" },
    el(
      "a",
      { class: "lx-hc-main", href: "#settings/install?from=today" },
      el("span", { class: "lx-hc-tile" }, installArt()),
      el(
        "span",
        { class: "lx-hc-text" },
        el("span", { class: "lx-hc-title" }, inApp ? t("home.cardOpenInYourBrowser") : t("home.cardAddToHomeScreen")),
        el("span", { class: "lx-hc-sub" }, inApp ? t("home.cardThenAddIt") : t("home.cardItOpensFullScreen")),
      ),
    ),
    el("button", { type: "button", class: "lx-hc-close", "aria-label": t("home.cardNotNow"), onclick: () => onDismiss?.() }, icon("cross")),
  );
}

/** Reminders that paused themselves, as a door: what's true now and the way back on (never what went unanswered). No drawing. */
export function pausedCard() {
  return el(
    "a",
    { part: "home-card", variant: "paused", href: "#settings/reminders?from=today" },
    el("span", { class: "lx-hc-text" }, el("span", { class: "lx-hc-title" }, t("home.remindersArePaused")), el("span", { class: "lx-hc-sub" }, t("home.cardTurnThemBackOn"))),
    icon("chevron"),
  );
}
