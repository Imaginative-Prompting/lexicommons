// Explore, the community section: packs others made and the library's own, to find, add and copy, in the language
// you're learning or any other.
//   #explore[?lang]                   the home: the languages, the topics to browse by (each its picture and how many packs it
//                                     has here), search, one pack to start with, then shelves (the curated sections, popular,
//                                     new), each pack shown once
//   #explore/topic/<id>?lang           a topic: its packs as covers, those about it alone first
//   #explore/search?q&lang             search: the packs that teach a word (src/find.ts, Translate's Find a pack), topics by
//                                     name, and packs by their name
//   #explore/browse?lang&level&topic&sort&q   a list, filtered and sorted
//   #explore/topics?lang               every topic with packs here
//   #explore/share/<pack>?from         sharing a pack of yours, a page (Done becomes the pack's page in Explore, in its place)
//   An item opened from somewhere in Explore, or a share from a pack's page, carries ?from=<that page's address>, so its
//   Back goes one step, to there (shell/main.js, "back: one rule").
//   #explore/item/<id>                one item's page: what it is, what's in it (its sentences), its versions, and
//                                     Add pack, Like and More (copy, report) pinned low
//   #explore/terms                    the sharing terms, accepted here before a first share
//   #explore/yours                    what you've shared, and anything of yours taken down (with a counter-notice);
//                                     your requests
//   #explore/requests?lang&kind&sort&state, #explore/request/<id>   requests: requests.js
//   #explore/grammar?lang, #explore/pattern/<lang>/<id>   a language's shared grammar and suggestions to it: grammar.js
//   #explore/own?lang                  Add your own pack: an Anki deck, one started by hand, or (with an AI connected) the words to ask it: own.js
// Following a pack puts it on this device at once (study/packs.js followPack) and on the account, so every device and
// the person's AI see it; likes are this page's only (no AI likes anything). Everything from the server goes into the
// page as text.

import * as ui from "../lx/ui.js";
import { lookToast } from "../shell/look-watch.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { t } from "../lx/i18n.js";
import { replaceRoute } from "../shell/route.js";
import * as motion from "../lx/motion.js";
import { api, del, post } from "../shell/api.js";
import { languageName, withArticle } from "../lang/index.js";
import { learning } from "../study/learning.js";
import { aiConnected } from "../shell/layout.js";
import { onProgressChange, readingHides } from "../study/progress.js";
import * as packs from "../study/packs.js";
import { addPackAction } from "../study/pack-actions.js";
import { LANGUAGES } from "../lang/index.js";
import { WORDS_NAMED, pathLessons, taughtForm } from "../study/path.js";
import { lessonFinished, lessonNow, studyOverview } from "../study/plan.js";

/** Whether the path's first lesson is done (marked or studied), or there's no path to wait for. */
const lessonOneDone = () => {
  const first = pathLessons()[0];
  return !first || lessonFinished(first);
};
import { onContentChange } from "../study/content.js";
import { onDoneChange } from "../study/done.js";
import { onPlaceChange } from "../study/path-place.js";
import { coverByIdOf, coverChoices, coverOfPack, itemSentence, paintOf, TOPIC_ART, upgradePack } from "../study/pack-format.js";
import { loadPictures, pictureNode } from "../study/pictures.js";
import { plainItems, sentencesOf } from "../study/pack-items.js";
import { featuredOf, fetchCounts, fetchHome, keptCounts, keptHome, sameHome } from "./home-data.js";
import { heldHeight, keepHeight } from "../lx/shapes.js";
import { mayShare, onSharingChange, sharingOpen } from "../shell/sharing.js";
import { ownRow, renderOwn } from "./own.js";
import { renderRequest, renderRequests, requestsRow, yourRequests } from "./requests.js";
import { renderGrammar, renderPattern, yourSuggestions } from "./grammar.js";
import { reasonPicker, termsFirst, termsGroup } from "./terms.js";
import { nextStep } from "../know/ui.js";
import { sharedFromHere } from "../study/pack-inbox.js";
import { booksShelf, renderBook, renderBooks, renderShareBook, yourBooks } from "./books.js";
import { fetchRetrying } from "../lx/retry.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
// The lessons card's height before a device has kept one: the first lesson's ("Something to drink", Start), as Chrome draws it at 360 to
// 430 wide, and at 320, where its title takes two lines. Phones are 320 or 360 and up. explore-books-check holds a first visit at 390 and
// 320 to no shift.
const firstLessonsCard = () => (innerWidth < 340 ? 254.08 : 223.28);

// What this account follows, for the device's packs to load at each sync (study/packs.js syncLibraryPacks). A plain
// fetch, not api(): a sync in the background never sends anyone to sign in; on any trouble the follows stay as they are.
packs.setFollowsSource?.(async () => {
  const response = await fetchRetrying("/api/community/following", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(`following: ${response.status}`);
  // Every field the sync reads: a library pack's recordings (audio) too, or the next sync would drop them.
  return (await response.json()).map(({ id, version, url, audio, corrections }) => ({ id, version, url, ...(typeof audio === "string" ? { audio } : {}), corrections }));
});
// A default of Lexicommons' that the catalog made opt-in, on this device already: followed, as Add does (packs.js syncNow).
packs.setFollowAdder?.(async (id) => {
  const response = await fetch(`/api/community/items/${encodeURIComponent(id)}/follow`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!response.ok) throw new Error(`follow: ${response.status}`);
});
const SORTS = [
  ["popular", "Popular"],
  ["new", "New"],
];
const itemHref = (id) => `#explore/item/${encodeURIComponent(id)}`;
/**
 * A preview sentence's words by Study's rule (session.js shownWord): a word with a reading (kana or pinyin over it,
 * vowel marks in it) shows it while it's new to you and as written once you know it; in a language you aren't learning,
 * every reading shows. words: [text, lemma, reading] each (the sample's, or a pack item's nl). Undefined when none has
 * a reading, so the sentence's text is drawn as it is.
 */
function previewWords(words, lang) {
  // Kept data is read as the server sent it: anything else in it (a word that isn't [text, lemma, reading]) and the
  // sentence's text is drawn instead.
  const word = (w) => Array.isArray(w) && typeof w[0] === "string" && (w[1] == null || typeof w[1] === "string") && (w[2] == null || typeof w[2] === "string");
  if (!Array.isArray(words) || !words.length || !words.every(word) || !words.some((w) => w[2])) return undefined;
  const mine = lang === learning();
  return words.map(([text, lemma, reading]) => (typeof reading === "string" && reading ? { text, reading, hidden: mine && typeof lemma === "string" && readingHides(`w:${lemma}`) } : text));
}
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const ago = (iso) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400_000);
  return days < 1 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

/** A short line under an item's title: who, level, topics, size, and how many follow it. */
// What a pack holds, in a few words: its sentences, its plain cards, or both.
const sizeLine = (item) => [(item.badges.sentences ?? 0) || !item.badges.cards ? plural(item.badges.sentences ?? 0, "sentence") : null, item.badges.cards ? plural(item.badges.cards, "card") : null].filter(Boolean).join(" · ");

function itemSub(item) {
  return [
    item.level,
    sizeLine(item),
    item.curated ? null : `by ${item.by}`,
    item.follows ? `added by ${plural(item.follows, "person", "people")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** An item's page, opened from `from` (a page's address): its Back goes there. */
// What the server said, when it's words: a code (internal_error) is never put on a screen (shell/api.js says the same of api()'s errors).
const wordsOf = (said) => (typeof said === "string" && said && !/^[a-z]+(_[a-z]+)+$/.test(said) ? said : null);
const itemLink = (id, from) => (from ? `${itemHref(id)}?${new URLSearchParams({ from })}` : itemHref(id));
// Whether a pack is already this person's: added in Explore (followed), or on this device all the same (one of the language's own, like its
// lessons, or a pack of yours). Such a pack never offers Add.
const haveIt = (item) => Boolean(item.following) || packs.allPacks().some((one) => one.id === item.id);

function itemRow(item, from) {
  return ui.listRow({
    art: packCover(item),
    title: item.title,
    sub: itemSub(item),
    href: itemLink(item.id, from),
    value: haveIt(item) ? "Added" : item.likes ? `♥ ${item.likes}` : undefined,
  });
}

const message = () => {
  const node = el("p", { class: "lx-settings-message", role: "status" });
  node.say = (text, tone) => {
    node.replaceChildren(text ?? "");
    if (tone) node.setAttribute("data-tone", tone);
    else node.removeAttribute("data-tone");
  };
  return node;
};

// ---------- a sheet of choices (a filter, the ⋯ menu) ----------

/**
 * Opens a sheet over the page (ui.sheetLayer: over the tabs, the page shaded behind it); closes on its handle, a drag
 * down, the shade, Escape, a choice, or the page changing. It sits over the app, not in the page, so a page drawing
 * itself again never takes it away. `page` is kept for the callers; the layer finds its own place.
 */
function openSheet(page, label, rows, { content } = {}) {
  const layer = ui.sheetLayer({ label });
  layer.lxBody.replaceChildren(el("h2", { class: "lx-sheet-title" }, label), content ?? el("ul", { part: "list" }, rows));
  layer.lxOpen();
  return { close: (options) => layer.lxClose(options) };
}

/** A filter's button: its current value, opening a sheet of choices. */
function filterButton(page, label, options, value, onpick) {
  const current = options.find(([v]) => v === value)?.[1] ?? options[0][1];
  return ui.button(`${label}: ${current}`, {
    size: "sm",
    icon: "sliders",
    onclick: () => {
      const sheet = openSheet(
        page,
        label,
        options.map(([v, text]) =>
          ui.radioRow({
            title: text,
            name: `filter-${label}`,
            value: v,
            checked: v === value,
            onchange: () => {
              sheet.close({ animate: false });
              onpick(v);
            },
          }),
        ),
      );
    },
  });
}

// ---------- the home and the lists ----------

/**
 * Explore's search: a word or a topic, in a language. Hardly anyone knows a pack's name, so it finds packs by what they teach (a word
 * in their sentences), topics by name, and only then packs by name (an empty search goes back to the home).
 */
const searchForm = (q = "", lang = learning()) =>
  ui.searchField({ label: t("explore.searchLabel"), value: q, onsubmit: (query) => (location.hash = query ? `#explore/search?${new URLSearchParams({ q: query, lang })}` : `#explore?lang=${lang}`) });

// The topics' names as last seen (a Back to a topic's page says its name).
const topicNames = new Map();
// A topic page's first answer and its packs' first sentences, kept for this visit of the app (explore.js renderTopic).
const topicFirsts = new Map();
const topicSamples = new Map();
// The height a topic page holds for each of its two cards while they're on their way: the card as drawn at 390 with a one-line sentence.
const TOPIC_CARD_HEIGHT = 262;
const topicHref = (id, lang) => `#explore/topic/${encodeURIComponent(id)}?${new URLSearchParams({ lang })}`;
// While a page draws, the pictures it asks for, so its ready can wait for them (the router holds the page up to 400 ms): the page then
// comes in with its drawings in place, and only a slower one comes after, into a place held for it (drawnWhole).
let pictureWaits = null;
const waitPicture = (loading) => (pictureWaits?.push(loading.catch(() => {})), loading);
/**
 * A place a drawing decides (a topic's tile, a pack's cover: its paint is never its drawing's own ground), built whole by `build(node)`, node
 * the drawing (null when it can't be had). A drawing in memory already: built now, in the page's first frame. Else a stand-in, `stand()`,
 * the place's own box unpainted with a held place filling it (data-held), until the drawing is here; then the place built whole takes its
 * place (ui.arrive: a fade when it's on the screen; off the page, a kept tab's, at once), its paint and drawing coming in together, so a
 * paint never changes once it shows.
 * (Word pictures load apart from the app's first load. On a loaded machine Explore's came after the router's hold into bare places, and a
 * learner's cover took a new paint as its drawing came: 8 Nov.)
 */
function drawnWhole(id, build, stand) {
  const now = pictureNode(id);
  if (now.firstChild) return build(now);
  const place = stand();
  place.dataset.held = "";
  const hold = ui.held({}, "picture");
  hold.classList.add("lx-art-held");
  place.append(hold);
  waitPicture(loadPictures([id])).then((found) => {
    const whole = build(found ? pictureNode(id) : null);
    // On the page it arrives (ui.arrive). Off it (a kept home drawn again while you're elsewhere: pickCheck, a newer home), ui.arrive leaves
    // a place alone, and the held place stayed for good once the page came back (11 Nov 2026: a new learner's pack to add next had a blank
    // cover after lesson 1 until a reload). The place takes its drawing there too: nothing is on the screen to fade.
    if (place.isConnected) ui.arrive(place, whole);
    else place.replaceWith(whole);
  });
  return place;
}
/** A drawing in its place at its size (drawnWhole). */
function drawing(id, cls) {
  const holder = () => el("span", { class: cls });
  return id ? drawnWhole(id, (node) => el("span", { class: cls }, node), holder) : holder();
}

const TOPICS_SHOWN = 6;
/**
 * A topic as a card: its drawing large, as the card itself (no border; a hard edge in its ground's own deep tone that a press pushes it
 * down onto), its name under it in the full ink, and how many packs are about it here (when the server says).
 */
function topicCard(topic, lang) {
  topicNames.set(topic.id, topic.name);
  const tile = () => el("span", { class: "lx-topic-art", "aria-hidden": "true" });
  const id = TOPIC_ART[topic.id];
  // Its hard edge in its drawing's ground's deep tone, coming with the drawing (drawnWhole).
  const art = !id
    ? tile()
    : drawnWhole(id, (node) => {
        const place = tile();
        if (!node) return place;
        const ground = groundOf(node);
        if (ground) place.dataset.paint = ground;
        place.append(node);
        return place;
      }, tile);
  return el("a", { class: "lx-topic", href: topicHref(topic.id, lang), "data-topic": topic.id }, art, el("span", { class: "lx-topic-name" }, topic.name), typeof topic.packs === "number" ? el("span", { class: "lx-topic-count" }, t("explore.packCount", { count: topic.packs })) : null);
}
/** Topics to browse by, as cards: three to a row on a phone, more on a wide screen. */
const topicCards = (topics, lang) => {
  const grid = el("nav", { class: "lx-topics", "aria-label": t("explore.topics") }, topics.map((topic) => topicCard(topic, lang)));
  // On a computer's wide column (explore.css, from 1280) every topic's page of them fills its rows: how many to a row, from how many there are.
  if (topics.length > TOPICS_SHOWN) {
    grid.dataset.aRow = "";
    grid.style.setProperty("--topics-a-row", String(topicsARow(topics.length)));
  }
  return grid;
};
/**
 * How many topics to a row in the wide column, so no row ends with one or two alone: six where they fill their rows or the last is nearly
 * full (two short at most), else seven, else five by the same rule; six when none does. 14 topics: seven a row.
 */
export function topicsARow(count) {
  const short = (cols) => (cols - (count % cols)) % cols;
  return [6, 7, 5].find((cols) => short(cols) === 0) ?? [6, 7, 5].find((cols) => short(cols) <= 2) ?? 6;
}
/** The one pack to add next: its cover face-out with "Add next", its name, its size and how much of it you know beside it, the whole one link. */
const pickCard = (pick, lang) =>
  el("div", { class: "lx-pick", "data-pick": "" },
    el("a", { class: "lx-face", href: itemLink(pick.id, `#explore?lang=${lang}`) }, packCover(pick),
      el("p", { class: "lx-face-words" }, el("span", {}, t("explore.addNextShort")), el("b", {}, pick.title), el("span", { class: "lx-face-size" }, sizeLine(pick)), knownBar(pick))));

/**
 * Explore's home held, on a first visit in a language (nothing kept): one held place from under the lessons' card to the screen's foot, drawing
 * nothing itself, so whatever of the home lands on the screen lands inside it; in it, the home's own shapes as they'll come: the pack to add next
 * (its cover, its lines) and the topics (their heading, six tiles), each a held place of the part's own size. (It held 330 px and 230 px before,
 * and a home that came after the router's hold drew its pick and topics outside them: 8 Nov.)
 */
/** One held place from where it stands to the screen's foot, drawing nothing itself (explore.css .lx-held-to-foot), the shapes of what comes in it. */
function heldToFoot(holds, cls, ...shapes) {
  const place = ui.held({}, holds);
  place.classList.add("lx-stack", "lx-held-to-foot", cls);
  place.append(...shapes);
  return place;
}

function heldHome() {
  const art = (attrs) => {
    const place = el("span", { ...attrs, "data-held": "", "aria-hidden": "true" });
    const hold = ui.held({}, "picture");
    hold.classList.add("lx-art-held");
    place.append(hold);
    return place;
  };
  const tile = () => el("span", { class: "lx-topic" }, art({ class: "lx-topic-art" }), ui.heldLine("80%", "explore.topicName"), ui.heldLine("45%", "explore.topicCount"));
  return heldToFoot(
    "explore.home",
    "lx-home-held",
    el("div", { class: "lx-pick" }, el("span", { class: "lx-face" }, art({ part: "pack-cover" }), el("span", { class: "lx-face-words" }, ui.heldLine("45%"), ui.heldLine("75%"), ui.heldLine("55%")))),
    el("section", { class: "lx-stack lx-explore-topics" }, el("div", { part: "section-head" }, ui.heldLine("30%", "explore.topicsHead")), el("div", { class: "lx-topics" }, Array.from({ length: TOPICS_SHOWN }, tile))),
  );
}

/**
 * The language's lessons, front and center: the pack everyone studies first, shown though it's on the device already, with where you
 * are in it and Continue (Start before the first lesson), as Home's next lesson is. Only for the language you're learning: another
 * language's lessons aren't what Study plays.
 */
function lessonsCard(lang) {
  if (lang !== learning()) return null;
  const id = `path-${lang}`;
  const pack = packs.allPacks().find((one) => one.id === id);
  if (!pack) return null;
  const { lesson, firstTime } = studyOverview();
  const card = nextStep({
    variant: "new",
    kicker: lesson ? lesson.place : t("explore.lessons.allDone"),
    title: pack.name,
    meta: lesson ? lesson.title : undefined,
    art: packCover({ id, title: pack.name }),
    action: lesson ? { label: firstTime ? t("explore.lessons.start") : t("explore.lessons.continue"), href: "#study/session/lesson?from=explore" } : undefined,
  });
  card.classList.add("lx-lessons-card");
  card.querySelector(".lx-next-head")?.append(knownBar({ id, curated: 1 }));
  // The whole card opens the lessons' own page (its units, as Explore draws them); Start starts.
  linkWhole(card, itemLink(id, `#explore?lang=${lang}`));
  return card;
}

// How much of a pack you know: lex-lessons' packKnown (study/pack-known.js) over the pack's own words, as a short bar with the share beside it
// in words ("20% known"), the same size and look everywhere a pack's progress shows. A pack on this device by its
// id; one of Lexicommons' own that isn't, from its library file, fetched once; a learner's pack that isn't on the device has none (its sample
// would give a wrong number), and takes no room.
// PACK_KNOWN: study/pack-known.js (lex-lessons) is in, so the bars draw. Off would draw none.
const PACK_KNOWN = true;
let knownModule = null;
const packFiles = new Map();
// A live pack's file at its version, fetched once for its page and its bar (null when it can't be had).
const hasFile = (item) => Boolean(item.version) && (item.state === undefined || item.state === "live" || item.state === "withdrawn") && !item.down;
function packFile(item) {
  const url = `/library/packs/${encodeURIComponent(item.id)}/${encodeURIComponent(item.version)}/pack.json`;
  if (!packFiles.has(url)) packFiles.set(url, fetch(url, { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return packFiles.get(url);
}
// The bar's box as it waits: its words a share's of the same length, unseen, so the line (and where it wraps) is the one that comes. A pack's
// page held while it's on its way (heldItem) has it too.
function knownBarWaiting() {
  const fill = el("span", { class: "lx-known-fill" });
  const label = el("span", { class: "lx-known-label" }, t("explore.knownPercent", { percent: 0 }));
  const bar = el("span", { class: "lx-known", "data-state": "waiting", "aria-hidden": "true" }, el("span", { class: "lx-known-track", "aria-hidden": "true" }, fill), label);
  return { bar, fill, label };
}
// Where it can tell, its box is there from the first frame, empty, and the line fades into it once it's worked out (arriving, the bar once
// pushed what's below down 6 px: first-draw-check). On a card: a curated pack's (its file fetched for it). On a pack's own page (page: true), any
// live pack's, its file the one the page fetches: the page's first draw had no bar unless the pack was curated or on the device, and its second,
// once the file came, put one in, moving all below it 34 px (7 Nov). [hidden] is display: none !important in base.css, so it waits by
// data-state instead.
function knownBar(item, full = null, { page = false } = {}) {
  const onDevice = packs.allPacks().some((one) => one.id === item.id);
  const fetchable = page ? hasFile(item) : Boolean(item.curated && item.version);
  if (!PACK_KNOWN || !(onDevice || Array.isArray(full?.items) || fetchable)) return document.createTextNode("");
  const { bar, label } = knownBarWaiting();
  (async () => {
    const known = await (knownModule ??= import("../study/pack-known.js").catch(() => null));
    if (typeof known?.packKnown !== "function") return;
    let source = onDevice ? item.id : Array.isArray(full?.items) ? full : null;
    if (!source && fetchable) source = await packFile(item);
    if (!source) return;
    const got = await known.packKnown(source);
    if (!got || !(got.total > 0)) return;
    const share = Math.min(1, got.known / got.total);
    bar.style.setProperty("--known", String(share));
    // A share that's there but under 1% says so, never "0%" for words you know.
    const percent = got.known > 0 ? Math.max(1, Math.round(share * 100)) : 0;
    label.textContent = t("explore.knownPercent", { percent });
    label.title = t("explore.knownOf", { known: got.known, total: got.total });
    bar.removeAttribute("data-state");
    bar.removeAttribute("aria-hidden");
    // Into its held box: a fade, opacity only (none with animations off).
    if (bar.isConnected) motion.animate(bar, [{ opacity: 0 }, { opacity: 1 }], { duration: motion.duration("--dur-160", 160) });
  })();
  return bar;
}

/**
 * A whole card opens the pack's own page, the one with everything about it: its title is a link stretched over
 * the card (explore.css .lx-card-link), and the card's own button (Add, Start) sits above it and does its own thing at once.
 */
function linkWhole(card, href) {
  const title = card.querySelector(".lx-next-head > h2");
  if (!title) return card;
  title.replaceChildren(el("a", { class: "lx-card-link", href }, ...title.childNodes));
  card.classList.add("lx-card-whole");
  return card;
}

/** A drawing's own ground, one of the art's three paints, so a cover never wears the same and swallows it. */
const groundOf = (node) => /--art-(teal|sun|violet)\b/.exec(node.querySelector("svg rect")?.getAttribute("fill") ?? "")?.[1] ?? null;
/**
 * A pack's cover, every one in the app's art (no flat designed cover): Lexicommons' own its drawing (pack-format.js coverOfPack); a
 * learner's the drawing it picked, else one of its first topic's by its id (coverByIdOf, skipping those `used` on the same shelf), else a
 * book drawn in hard light; on its paint, never its drawing's own ground, its title printed at its foot (hidden under 96 px, where the
 * name is beside it). The cover comes whole, paint and drawing together, its place held while the drawing is on its way (drawnWhole).
 */
function packCover(item, { used = null } = {}) {
  const own = coverOfPack(item.id);
  const topics = (item.topics ?? []).map((one) => (typeof one === "string" ? one : one.id));
  const id = own ?? item.cover ?? coverByIdOf(item.id, topics, used);
  const cover = () => {
    const holder = el("span", { part: "pack-cover" });
    if (!own && id) holder.dataset.drawing = id; // which drawing it is, for whoever reads the page (a check holding a shelf to no repeats)
    return holder;
  };
  const build = (node) => {
    const holder = cover();
    if (own) return node ? (holder.append(node), holder) : holder;
    holder.dataset.generic = "";
    holder.dataset.paint = paintOf(item.id, node ? groundOf(node) : null);
    const art = el("span", { class: "lx-generic-art" }, node ?? el("span", { class: "lx-generic-book", "aria-hidden": "true" }, el("span"), el("span")));
    holder.append(art, el("span", { class: "lx-generic-title" }, item.title));
    return holder;
  };
  const stand = () => {
    const holder = cover();
    // While it's held, a learner's cover is still one (data-generic, for whoever reads the page) and still says its title to a screen reader
    // (printed on the cover once it's here).
    if (!own) {
      holder.dataset.generic = "";
      holder.append(el("span", { class: "lx-visually-hidden" }, item.title));
    }
    return holder;
  };
  return id ? drawnWhole(id, build, stand) : build(null);
}
/** A pack on a shelf, and a shelf of them under its heading: each face-out on planks, its cover, who shared it. */
const packFacts = (item) => [item.level, sizeLine(item), item.curated ? null : `by ${item.by}`].filter(Boolean).join(" · ");
function coverShelf(title, items, link, from) {
  const used = new Set();
  const cards = items.map((item) => el("a", { class: "lx-cover-card", href: itemLink(item.id, from) }, packCover(item, { used }), el("span", { class: "lx-cover-by" }, item.curated ? sizeLine(item) : t("explore.by", { name: item.by })), knownBar(item)));
  const planks = [];
  for (let i = 0; i < cards.length; i += 3) planks.push(el("div", { class: "lx-cover-row" }, cards.slice(i, i + 3)));
  return el("section", { class: "lx-stack lx-explore-shelf" }, ui.sectionHead(title, { link }), el("div", { class: "lx-covers" }, planks));
}

// The languages to find packs in: the one you're learning first, then every other the app has, by name.
const languagesOf = () => [learning(), ...Object.keys(LANGUAGES).filter((code) => code !== "en" && code !== learning()).sort((a, b) => languageName(a).localeCompare(languageName(b)))];

const packsLine = (n) => (n == null ? null : n === 0 ? "No packs yet" : plural(n, "pack"));
const countOf = (n) => n ?? -1;

/** Every language, in a sheet with a search: each with its flag and how many packs it has. */
function allLanguages(page, shown, counts) {
  const rows = (query = "") => {
    const q = query.trim().toLowerCase();
    return languagesOf()
      .filter((code) => !q || languageName(code).toLowerCase().includes(q) || code === q)
      .map((code, i) =>
        ui.listRow({
          title: [ui.languageFlag(code, { lazy: i >= ui.FLAG_ROWS_SHOWN }), languageName(code)],
          sub: [code === learning() ? "Learning" : null, code === shown && code !== learning() ? "Shown now" : null, packsLine(counts[code])].filter(Boolean).join(" · ") || undefined,
          href: `#explore?lang=${code}`,
        }),
      );
  };
  const list = el("ul", { part: "list" }, rows());
  const find = el("input", { part: "text-field", type: "search", placeholder: "Find a language", "aria-label": "Find a language", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false" });
  find.addEventListener("input", () => list.replaceChildren(...rows(find.value)));
  openSheet(page, "All languages", null, { content: el("div", { class: "lx-stack" }, find, list) });
}

/**
 * The pack to start with: the featured rule (a curated section's first, else the most added, else the language's lessons or the first of
 * Lexicommons' own, a topic pack published to be suggested among them, else a pack someone shared), in the server's order, skipping any
 * pack this person already has (a learner has the lessons and the word bands, so a topic's pack comes up). Null when there's none left.
 */
function pickOf(home) {
  const have = new Set([...packs.libraryPacks().map((one) => one.id), ...packs.yourPacks().map((one) => one.id)]);
  const order = [...home.sections.flatMap((section) => section.items), ...(home.feature?.item ? [home.feature.item] : []), ...home.popular, ...home.new];
  return order.find((item) => item && !have.has(item.id) && !item.mine) ?? null;
}

function renderHome(page, params = {}) {
  const lang = params.lang && LANGUAGES[params.lang] && params.lang !== "en" ? params.lang : learning();
  const name = languageName(lang);
  const msg = message();
  // Every language, one without packs at 0 (an unknown count shows nothing): the sheet that opens from the foot's row.
  const countsFor = (counts) => (counts ? Object.fromEntries(languagesOf().map((code) => [code, counts[code] ?? 0])) : {});
  let shownCounts = countsFor(keptCounts());
  // The search first (a place you type, as Home's Translate field), then the language's lessons as the main card, then the one pack to add
  // next face-out, then the topics as cards (their drawings large, their names whole), then what learners have shared, then the quiet
  // rows. The search is made once, so a redraw never takes what's being typed.
  const top = el("div", { class: "lx-stack lx-explore-top" });
  const rest = el("div", { class: "lx-stack lx-explore-rest" });
  const elsewhere = lang !== learning() ? el("p", { class: "lx-small lx-muted" }, t("explore.inLanguage", { language: name })) : null;
  // The search filters this page in place: once you've finished a word (a pause, a space, or Enter) the home gives way to what it finds,
  // and clearing the field brings the home back. The address doesn't change while you type (a redraw would take the field); a pack
  // opened from the results comes back here with the search as it was (#explore?q=…).
  const home = el("div", { class: "lx-stack" }, elsewhere, top, rest);
  const results = el("div", { class: "lx-stack lx-explore-results", hidden: true });
  let stopSearch = null;
  let pause = 0;
  let searched = "";
  const searchFor = (typed) => {
    const q = typed.trim().slice(0, 200);
    if (q === searched) return;
    searched = q;
    stopSearch?.();
    stopSearch = null;
    home.hidden = Boolean(q);
    results.hidden = !q;
    if (!q) return results.replaceChildren();
    stopSearch = searchResults(results, q, lang, `#explore?${new URLSearchParams({ lang, q })}`);
  };
  const startQuery = String(params.q ?? "").trim().slice(0, 200);
  const field = ui.searchField({
    label: t("explore.searchLabel"),
    value: startQuery,
    onsubmit: (q) => (clearTimeout(pause), searchFor(q)),
    oninput: (value) => {
      clearTimeout(pause);
      if (!value.trim() || /\s$/.test(value)) return searchFor(value);
      pause = setTimeout(() => searchFor(value), 700);
    },
  });
  const body = el("div", { class: "lx-stack lx-explore-body" }, el("div", { class: "lx-explore-search" }, field), home, results);
  if (startQuery) searchFor(startQuery);
  // A tab's own page: the header names it, so no large title of its own (as Know's, in its tab).
  page.replaceChildren(body, msg);
  // The lessons' card follows what's on the device and where you are: on a new device the packs arrive after the home has drawn.
  // While they're still coming, its place is held at the height it had last time, so nothing jumps when it arrives.
  const lessonsSlot = el("div", { class: "lx-lessons-slot" });
  const fillLessons = () => {
    const card = lessonsCard(lang);
    if (card) lessonsSlot.replaceChildren(card);
    // A new device's first visit has no height kept: the first lesson's card (Unit 1 · Lesson 1, Start), as tall as it draws at a phone's width.
    else if (lang === learning() && packs.packDownloads()) lessonsSlot.replaceChildren(ui.skeleton({ height: heldHeight("explore.lessons") ?? firstLessonsCard() }));
    else lessonsSlot.replaceChildren();
    lessonsSlot.hidden = !lessonsSlot.childElementCount;
    const holder = lessonsSlot.parentElement;
    if (holder) holder.hidden = ![...holder.children].some((child) => !child.hidden);
    if (card) requestAnimationFrame(() => keepHeight("explore.lessons", lessonsSlot));
  };
  const redrawLessons = () => lessonsSlot.isConnected && fillLessons();
  const stopLessons = [onContentChange(redrawLessons), onDoneChange(redrawLessons), onPlaceChange(redrawLessons)];
  let stale = false;
  let shown = null; // the home as drawn (home-data.js): a refresh draws again only when what came differs
  // Whether the home as drawn held its pack to add next back for lesson 1 (drawHome). Once lesson 1 is done it's drawn with it: at once off
  // the screen, else the next time the page comes (stale, refresh({ now }), worked out then), never into it under the eye.
  let pickHeld = false;
  // Each draw collects the pictures it asks for (waitPicture), for the page's ready.
  let drawnPictures = [];
  const draw = (entry) => {
    const outer = pictureWaits;
    pictureWaits = [];
    try {
      drawHome(entry);
    } finally {
      drawnPictures = pictureWaits;
      pictureWaits = outer;
    }
  };
  const drawHome = (entry) => {
    const { home, topics, down, books = [] } = entry;
    // Change target language's sheet draws its first rows' flags at once, the first time too (lx/ui.js warmFlags).
    ui.warmFlags(languagesOf().slice(0, ui.FLAG_ROWS_SHOWN));
    // Packs you added that a report took down: off your devices, and here, why (they come back if restored).
    const gone = down.map((i) => ui.listRow({ icon: "info", title: i.title, sub: i.state === "removed" ? "Taken down after a report: it's off your devices" : "Hidden while a report is looked at: it's off your devices for now" }));
    // The pack to add next waits for lesson 1 in the language being learned (11 Nov 2026: a brand-new learner saw "Add next: Culture" under
    // Dutch lessons' Start, a second thing to start before the first). Another language's Explore keeps its pick, and a language with no
    // lessons (a starter alone) has none to wait for. Held back, it's drawn once lesson 1 is done (pickCheck).
    pickHeld = lang === learning() && !lessonOneDone();
    const pick = pickHeld ? null : pickOf(home);
    // The topics with packs here, each with how many (the server's count, of what's about it alone).
    const here = Array.isArray(home.topics) ? home.topics : topics;
    const shelfNode = here.length
      ? el(
          "section",
          { class: "lx-stack lx-explore-topics" },
          ui.sectionHead(t("explore.topics"), { link: here.length > TOPICS_SHOWN ? { href: `#explore/topics?lang=${lang}`, label: t("explore.allTopics", { count: here.length }) } : undefined }),
          topicCards(here.slice(0, TOPICS_SHOWN), lang),
          // Every pack in the language, the general ones (the lessons, the word bands) among them, right under the topics.
          el("ul", { part: "list", class: "lx-all-packs" }, ui.listRow({ icon: "cards", title: t("explore.allPacks"), href: `#explore/browse?${new URLSearchParams({ lang, sort: "popular" })}` })),
        )
      : null;
    const pickNode = pick ? pickCard(pick, lang) : null;
    // The lessons' card is the device's own: drawn once here, or already in a first visit's first frame (kept as it is, never drawn again
    // as the home comes: its own changes redraw it, redrawLessons).
    if (!lessonsSlot.childElementCount) fillLessons();
    // What people have shared, by who shared it; a curated section's packs too, when there are any. Each pack once.
    const seen = new Set(pick ? [pick.id] : []);
    const fresh = (items) => items.filter((item) => !seen.has(item.id) && seen.add(item.id));
    const sections = home.sections.map((section) => coverShelf(section.title, fresh(section.items), undefined, `#explore?lang=${lang}`)).filter((node) => node.querySelector(".lx-cover-card"));
    const learners = fresh(home.new.filter((item) => !item.curated));
    const learnersNode = learners.length ? coverShelf(t("explore.sharedByLearners"), learners.slice(0, 6), { href: `#explore/browse?${new URLSearchParams({ lang, sort: "new" })}`, label: t("explore.seeAll") }, `#explore?lang=${lang}`) : null;
    top.replaceChildren(...[gone.length ? ui.group("Off your devices", gone) : null, lessonsSlot, pickNode, shelfNode].filter(Boolean));
    top.hidden = ![...top.children].some((child) => !child.hidden);
    const booksNode = booksShelf(books, lang, `#explore?lang=${lang}`);
    rest.replaceChildren(
      ...[
        booksNode,
        shelfNode || pickNode || lessonsSlot.childElementCount || learnersNode || booksNode ? null : ui.emptyState([el("p", {}, `Nobody has shared ${withArticle(name)} pack yet.`), ui.button("How sharing works", { onclick: () => (location.hash = "#explore/terms") })], { pose: "box" }),
        // Another language: what adding one of its packs does.
        lang !== learning()
          ? el("p", { class: "lx-small lx-muted" }, `Packs you add in ${name} wait on this device: Study and Home follow the language you're learning (${languageName(learning())}). Change it any time in `, el("a", { href: "#settings/language" }, "Settings → Language"), ".")
          : null,
        ...sections,
        learnersNode,
        // Which language's packs these are, its flag and name on the row, its sheet the others (static: no count, no fetch, so the home
        // still draws whole from the device).
        ui.group(null, [ui.listRow({ icon: "globe", title: t("explore.changeTarget"), value: [ui.languageFlag(lang), name], opens: "sheet", onclick: () => allLanguages(page, lang, shownCounts) })]),
        // A pack of your own, for everyone. Ask for it and Share only once sharing is open to learners (shell/sharing.js sharingOpen), for an
        // admin too: until then an admin reaches them from Settings → Admin. A language's ideas are Knowledge's (Ideas: the ones met,
        // then the ones still to come); its grammar pages here stay for whoever has their address.
        ui.group(null, [ownRow(lang)]),
        sharingOpen() && mayShare() ? requestsRow(lang) : null,
        sharingOpen() && mayShare() ? ui.group(null, [ui.listRow({ icon: "share", title: "Share what you've made", href: "#explore/yours" })]) : null,
      ].filter(Boolean),
    );
    shown = entry;
  };
  // On the screen (the router's host shown, not held unseen while the page composes): what's drawn then stays as it is.
  const seen = () => page.isConnected && !page.hasAttribute("data-waiting");
  // A newer home that came while this one was on the screen: drawn the next time the page comes (stale, refresh({ now })), never into it.
  let pending = null;
  // What's on its way: the home and the counts, from the server. It replaces what's shown only when it differs and the page isn't on the
  // screen yet (or isn't on it: a tab kept away); when it can't be had, what's shown stays (offline, the home as last seen).
  const update = () => {
    fetchCounts().then((counts) => {
      const next = countsFor(counts);
      if (stale || !counts || JSON.stringify(next) === JSON.stringify(shownCounts)) return;
      shownCounts = next;
    });
    return fetchHome(lang)
      .then((entry) => {
        if (stale || sameHome(entry, shown)) return;
        // Shown from what this device kept: what came is kept for the next time (fetchHome), never drawn in under the eye. A home with nothing
        // kept (its places held) fills in as it comes.
        if (shown && seen()) {
          pending = entry;
          return;
        }
        pending = null;
        const late = firstVisit && !shown && seen();
        draw(entry);
        // Into the held place while it's on the screen: what came fades in (opacity alone, none with animations off), the lessons' card as it was.
        if (late)
          for (const node of [...top.children, ...rest.children])
            if (node !== lessonsSlot && !node.hidden) motion.animate(node, [{ opacity: 0 }, { opacity: 1 }], { duration: motion.duration("--dur-160", 160) });
      })
      .catch((error) => {
        if (stale || shown) return;
        // Offline: Tinta dozes under a small cloud until you're back. A failure online says what went wrong.
        top.hidden = true;
        rest.replaceChildren(navigator.onLine ? ui.loadFailed(error, () => update()) : ui.emptyState("Explore needs a connection. It'll be here when you're back online.", { pose: "doze" , art: "empty-offline" }));
      });
  };
  // The home as last seen on this device, at once; else the page waits for it.
  const kept = keptHome(lang);
  try {
    if (kept) draw(kept);
  } catch {
    shown = null; // a copy this app can't draw: the server's answer will
  }
  // Nothing kept yet (a first visit in this language): the lessons' card, the device's own, in the first frame, and the rest of the home held
  // under it (heldHome) until it comes.
  const firstVisit = !shown;
  if (firstVisit) {
    top.replaceChildren(el("p", { class: "lx-visually-hidden", role: "status" }, "Loading Explore…"), lessonsSlot, heldHome());
    rest.replaceChildren();
    fillLessons();
  }
  const asked = update();
  // Lesson 1 done (a session's end, its answers, a mark, or another device's at a sync): a home that held its pick back is drawn again with it,
  // at once off the screen (a kept tab), else the next time it comes. (A kept Explore is otherwise drawn again only when the server's home
  // differs, so the pick would wait for that.) A beat after the last change: a session's answers come one by one.
  // (The path's own lessons arriving count too: until they're here, a first sync's stand-in lessons are the path.)
  const pickNow = () => !stale && Boolean(shown) && pickHeld && lessonOneDone();
  let pickTimer = 0;
  const pickCheck = () => {
    clearTimeout(pickTimer);
    pickTimer = setTimeout(() => {
      if (pickNow() && !seen()) draw(shown);
    }, 300);
  };
  stopLessons.push(onProgressChange(pickCheck), onDoneChange(pickCheck), onPlaceChange(pickCheck), onContentChange(pickCheck));
  // The learner view turned on or off (Settings → Admin): its rows drawn again from what's shown.
  stopLessons.push(onSharingChange(() => !stale && shown && draw(shown)));
  // Kept while you're elsewhere (shell/main.js): coming back shows it as it was, and brings it up to date quietly. A first
  // visit with nothing kept is shown whole once the server's answer is drawn, or held as above if that's slow.
  return {
    title: "Explore",
    // Ready once the server's answer is in and drawn (the router waits 400 ms at most: a quick answer composes the first draw, a slow one is
    // kept for the next time over what this device kept), and its pictures.
    ready: Promise.resolve(asked).then(() => Promise.all(drawnPictures)),
    // Coming back: a newer home kept while this one was on the screen is drawn before the first frame; else it looks again, quietly.
    refresh: ({ now = false } = {}) => {
      const due = now && pickNow();
      if (now && (pending || due)) {
        const next = pending ?? shown;
        pending = null;
        if (due || !sameHome(next, shown)) draw(next);
        return;
      }
      return update();
    },
    stale: () => Boolean(pending) || pickNow(),
    dispose: () => {
      stale = true;
      clearTimeout(pause);
      clearTimeout(pickTimer);
      stopSearch?.();
      for (const stop of stopLessons) stop?.();
    },
  };
}

/** Every topic with packs here, as tiles with their pictures and counts (from the home's answer, kept or fetched). */
function renderTopics(page, params) {
  const lang = params.lang && LANGUAGES[params.lang] ? params.lang : learning();
  const body = el("div", { class: "lx-stack" });
  page.replaceChildren(ui.pageTitle(t("explore.topics"), t("explore.topicsSub", { language: languageName(lang) })), body);
  let stale = false;
  let drawnKey = null;
  let drawnPictures = [];
  // The topics, drawn from an answer: the same topics as on the page leave it as it is (drawn again, every card and its drawing was new and
  // faded in a second time). Their drawings are collected for the page's ready, as the home's are.
  const drawn = (entry) => {
    const here = Array.isArray(entry?.home?.topics) ? entry.home.topics : entry?.topics ?? [];
    const key = JSON.stringify(here);
    if (key === drawnKey) return;
    drawnKey = key;
    const outer = pictureWaits;
    pictureWaits = [];
    try {
      body.replaceChildren(here.length ? topicCards(here, lang) : ui.emptyState(t("explore.noTopics", { language: languageName(lang) }), { pose: "shrug", art: "empty-packs" }));
    } finally {
      drawnPictures = pictureWaits;
      pictureWaits = outer;
    }
  };
  const kept = keptHome(lang);
  if (kept) drawn(kept);
  const load = () =>
    fetchHome(lang)
      .then((entry) => !stale && drawn(entry))
      .catch((error) => !stale && !kept && body.replaceChildren(ui.loadFailed(error, load, { offline: t("explore.topicsOffline") })));
  const asked = load();
  // Drawn from what this device kept: ready once its drawings are in; else once the answer is drawn, and its drawings.
  return { title: "Explore", back: { href: `#explore?lang=${lang}`, label: "Explore" }, ready: kept ? Promise.all(drawnPictures) : asked.then(() => Promise.all(drawnPictures)), dispose: () => (stale = true) };
}

/**
 * A topic, started the way Home is: its name and how many packs are about it; its first pack of Lexicommons' own as the main card, led
 * by its first sentence with its English, with one Add pack; its second pack as the plain stub under the card, by how much more it
 * has; then what learners have shared on it, as rows. Only what's about the topic (community.ts ABOUT_ONE_TOPIC): the language's
 * general packs are on the home. 20 at a time.
 */
function renderTopic(page, id, params) {
  const lang = params.lang && LANGUAGES[params.lang] ? params.lang : learning();
  const here = `#explore/topic/${encodeURIComponent(id)}?${new URLSearchParams({ lang })}`;
  const head = ui.pageTitle(topicNames.get(id) ?? "", "");
  const title = head.querySelector('[data-part="page-title"]');
  const count = el("p", { class: "lx-muted" });
  head.append(count);
  const lead = el("div", { class: "lx-stack" });
  const rows = el("ul", { part: "list" });
  const theirs = el("section", { class: "lx-stack", hidden: true }, ui.sectionHead(t("explore.fromLearners")), rows);
  const more = ui.button(t("explore.more"), { variant: "fade", block: true });
  more.hidden = true;
  const status = el("div");
  const msg = message();
  page.replaceChildren(head, lead, theirs, more, status, msg);
  let stale = false;
  let offset = 0;
  let shownCount = 0;
  // The topic's own packs lead, each on a card of its own, the second marked as the one that comes after the first: its first
  // sentence, its size, how much of it you know; the whole card opens its page, Add adds it at once. The second says it comes after the first.
  // first: the topic's first pack, whose Add is the page's one solid button; the sequel's is the quieter one.
  const packCard = (pack, kicker, found, { first = true } = {}) => {
    const s = found?.sample?.[0];
    const said = s?.sentence ? (/[.!?…]$/.test(s.sentence) ? s.sentence : `${s.sentence}${s.punct ?? ""}`) : null;
    const card = nextStep({
      kicker: [kicker, sizeLine(pack)].join(" · "),
      title: said ? el("span", { lang: pack.language }, said) : pack.title,
      meta: said ? (s.natural ?? undefined) : undefined,
      art: packCover(pack),
      action: { label: t("explore.addPack"), href: itemLink(pack.id, here) },
    });
    card.classList.add("lx-topic-card");
    card.querySelector(".lx-next-head")?.append(knownBar(pack));
    linkWhole(card, itemLink(pack.id, here));
    // Add pack adds it here, the way the pack's own page does: following it puts it in your studying.
    const added = () => ui.button(t("explore.added"), { variant: "gray", size: "lg", block: true, icon: "check", pressed: "true", onclick: () => (location.hash = itemLink(pack.id, here)) });
    const add = ui.button(t("explore.addPack"), first ? { variant: "go", size: "lg", block: true } : { variant: "gray", size: "lg", block: true, icon: "plus" });
    let adding = false;
    add.addEventListener("click", async () => {
      if (adding) return;
      adding = true;
      const got = await addPack(pack);
      adding = false;
      msg.say(got.text, got.tone);
      if (got.added) add.replaceWith(added());
    });
    card.querySelector('[data-part="button"]')?.replaceWith(haveIt(pack) ? added() : add);
    return card;
  };
  // Each pack's first sentence, asked once a visit of the app (topicSamples), so coming back to the page draws it in its first frame.
  const sampleOf = (pack) =>
    topicSamples.has(pack.id)
      ? topicSamples.get(pack.id)
      : api(`/api/community/items/${encodeURIComponent(pack.id)}`)
          .then((found) => (topicSamples.set(pack.id, found), found))
          .catch(() => null);
  const leadCards = (own, founds) => own.slice(0, 2).map((pack, i) => packCard(pack, i ? t("explore.afterPack", { title: own[0].title }) : t("explore.toStart"), founds[i], { first: i === 0 }));
  // The first answer's parts, drawn at once from what was kept or once they're here. Asked again quietly after a page drawn from what was kept
  // (back from a pack's page), an answer that draws the same leaves the page as it is: drawn again, every card was a new node and every cover
  // faded in again from nothing, a blink of each one on every swipe back. What it drew is keyed by the answer and each lead pack's first sentence.
  let drawnKey = null;
  const drawFirst = (answer, founds) => {
    const key = JSON.stringify([answer.items, answer.next ?? null, founds.map((found) => found?.sample?.[0] ?? null)]);
    if (key === drawnKey) return;
    drawnKey = key;
    const own = answer.items.filter((item) => item.curated);
    const learners = answer.items.filter((item) => !item.curated);
    const cards = leadCards(own, founds);
    // Held (a first visit on a slow connection): the cards come into the places held for them; else they're in the page's first frame.
    const holding = lead.querySelector(":scope > .lx-topic-held");
    const drawnLead = el("div", { class: "lx-stack" }, ...cards);
    // Into the place held for them, which reaches the screen's foot, so never its height (ui.arriveIn: a fade when it's on the screen).
    if (holding) ui.arriveIn(lead, drawnLead);
    else lead.replaceChildren(drawnLead);
    ui.arriveIn(rows, ...learners.map((item) => itemRow(item, here)));
    theirs.hidden = !rows.childElementCount;
    shownCount = answer.items.length;
    offset = answer.next ?? 0;
    more.hidden = answer.next === undefined;
    status.replaceChildren(shownCount ? "" : ui.emptyState(t("explore.topicEmpty", { language: languageName(lang) }), { pose: "shrug", art: "empty-packs" }));
  };
  const firstKey = `${lang}:${id}`;
  const load = async () => {
    more.hidden = true;
    const answer = await api(`/api/community/items?${new URLSearchParams({ lang, topic: id, offset: String(offset) })}`);
    if (stale) return;
    if (offset === 0) {
      const own = answer.items.filter((item) => item.curated).slice(0, 2);
      const founds = await Promise.all(own.map(sampleOf));
      if (stale) return;
      topicFirsts.set(firstKey, answer);
      return drawFirst(answer, founds);
    }
    rows.append(...answer.items.filter((item) => !item.curated).map((item) => itemRow(item, here)));
    theirs.hidden = !rows.childElementCount;
    shownCount += answer.items.length;
    offset = answer.next ?? offset;
    more.hidden = answer.next === undefined;
  };
  // Seen before in this visit of the app (back from a pack's page): drawn in the first frame, then asked again quietly.
  const before = topicFirsts.get(firstKey);
  const beforeFounds = before?.items.filter((item) => item.curated).slice(0, 2).map((pack) => topicSamples.get(pack.id));
  const drawnFromBefore = Boolean(before && beforeFounds.every((found) => found !== undefined));
  if (drawnFromBefore) drawFirst(before, beforeFounds);
  // Else the two cards' places, their shape, until the answer comes (only seen if it takes longer than the router waits for ready); and, where
  // the topic's kept count says there are more packs than those two, the learners' section's, its heading and a screen's height under it.
  else {
    // One held place to the screen's foot (heldToFoot), the two cards' shapes in it: a card whose sentence takes two lines is taller than its
    // shape, and still lands inside. (Two places of 262 px held before, and such a card came past its own: 8 Nov.)
    lead.replaceChildren(heldToFoot("explore.topicLead", "lx-topic-held", ui.held({ height: TOPIC_CARD_HEIGHT, radius: 24 }, "explore.topicCard"), ui.held({ height: TOPIC_CARD_HEIGHT, radius: 24 }, "explore.topicCard")));
    const kept = keptHome(lang);
    const keptTopic = (kept?.home?.topics ?? kept?.topics ?? []).find((one) => one.id === id);
    if (typeof keptTopic?.packs === "number" && keptTopic.packs > 2) {
      rows.replaceChildren(el("li", { class: "lx-topic-rows-held" }, ui.held({ height: "100vh" }, "explore.topicLearners")));
      theirs.hidden = false;
    }
  }
  more.addEventListener("click", () => load().catch((error) => status.replaceChildren(ui.loadFailed(error, () => load()))));
  const drawnOnce = (async () => {
    try {
      // Its name and how many: from the home's answer (kept, else asked), the same count the home's book shows.
      const entry = keptHome(lang) ?? (await fetchHome(lang).catch(() => null));
      const topic = (entry?.home?.topics ?? entry?.topics ?? []).find((one) => one.id === id);
      if (stale) return;
      if (topic) {
        topicNames.set(id, topic.name);
        title.textContent = topic.name;
        count.textContent = typeof topic.packs === "number" ? t("explore.packCount", { count: topic.packs }) : t("explore.inLanguage", { language: languageName(lang) });
      } else title.textContent ||= id;
      offset = 0;
      await load();
    } catch (error) {
      // Drawn from before, it stays as it was; else what went wrong takes the held places.
      if (!stale && !before) (lead.replaceChildren(), status.replaceChildren(ui.loadFailed(error, () => load(), { offline: t("explore.topicOffline") })));
    }
  })();
  // The router holds the page for its first answer (400 ms at most), so on a quick connection the cards are in its first frame.
  // Drawn from what was kept, it's whole in its first frame: ready at once.
  return { title: "Explore", back: { href: `#explore?lang=${lang}`, label: "Explore" }, ready: drawnFromBefore ? Promise.resolve() : drawnOnce, dispose: () => (stale = true) };
}

/** The words of a query, for marking them in a sentence: what's searched for, without case or accents. */
const fold = (text) => String(text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Search: the packs that teach what was typed (their sentences with it, from src/find.ts, the same as Translate's Find a pack), topics
 * whose name has it, and packs named with it. What's typed goes to the server in a request's body, never its address.
 */
function renderSearch(page, params) {
  const lang = params.lang && LANGUAGES[params.lang] && params.lang !== "en" ? params.lang : learning();
  const q = String(params.q ?? "").trim().slice(0, 200);
  const here = `#explore/search?${new URLSearchParams({ q, lang })}`;
  const holder = el("div", { class: "lx-stack" });
  page.replaceChildren(ui.pageTitle(t("explore.searchTitle", { query: q }), t("explore.inLanguage", { language: languageName(lang) })), searchForm(q, lang), holder);
  const stop = searchResults(holder, q, lang, here);
  return { title: "Explore", back: { href: `#explore?lang=${lang}`, label: "Explore" }, dispose: stop };
}

/**
 * What a search finds, drawn into `holder`: a topic first when what's typed names one (food: Food and drink), then the packs that teach
 * it, then packs by name. `here` is where a pack opened from it comes back to. Returns what stops it (a newer search, the page going).
 */
function searchResults(holder, q, lang, here) {
  const teach = el("section", { class: "lx-stack lx-search-teach" });
  const byTopic = el("section", { class: "lx-stack" });
  const byName = el("section", { class: "lx-stack" });
  const status = el("div", { role: "status" }, ui.loadingState());
  holder.replaceChildren(status, byTopic, teach, byName);
  let stale = false;
  const words = fold(q).split(/\s+/).filter(Boolean);
  // A sentence with what was looked for in bold, as Translate marks it: the word itself, not the mark after it.
  const marked = (text) =>
    String(text)
      .split(/([\p{L}\p{M}\p{N}'’-]+)/u)
      .map((part) => (words.includes(fold(part)) ? el("b", {}, part) : part));
  (async () => {
    const [found, topicList, named] = await Promise.all([
      post("/api/translate/find", { q, language: lang }).catch((error) => ({ error })),
      (keptHome(lang) ? Promise.resolve(keptHome(lang)) : fetchHome(lang)).then((entry) => entry?.home?.topics ?? entry?.topics ?? []).catch(() => []),
      api(`/api/community/items?${new URLSearchParams({ lang, q })}`).catch(() => ({ items: [] })),
    ]);
    if (stale) return;
    const packsFound = Array.isArray(found?.packs) ? found.packs : [];
    const row = (pack) => {
      const s = pack.sentences?.[0];
      const w = pack.words?.[0];
      const sub = s ? el("span", {}, el("bdi", { lang }, ...marked(s.text)), s.means ? ` · ${s.means}` : "") : w ? el("span", {}, el("bdi", { lang }, w.lemma), w.gloss ? `: ${w.gloss}` : "") : undefined;
      const cover = packCover({ id: pack.id, title: pack.name, topics: pack.topics, cover: pack.cover });
      return ui.listRow({ art: cover, title: pack.name, sub, href: itemLink(pack.id, here) });
    };
    // Those written for the word first (the server ranks them first too), then those that only say it in a sentence written for another. One the
    // server can't say yet (its pack still being read again) goes with the first, as before it could.
    const says = packsFound.filter((pack) => pack.teaches === false);
    const teaches = packsFound.filter((pack) => pack.teaches !== false);
    const list = (packs, heading, which) => (packs.length ? [ui.sectionHead(heading), el("ul", { part: "list", "data-found": which }, packs.map(row))] : []);
    teach.replaceChildren(
      ...list(teaches, t("explore.teach", { query: q }), "teaches"),
      ...list(says, t("explore.says", { query: q }), "says"),
      ...(packsFound.length && found.indexing ? [el("p", { class: "lx-small lx-muted" }, t("explore.indexing"))] : []),
    );
    const topicsFound = topicList.filter((topic) => words.length && words.every((w) => fold(topic.name).includes(w) || fold(topic.id).includes(w)));
    byTopic.replaceChildren(...(topicsFound.length ? [ui.sectionHead(t("explore.topics")), topicCards(topicsFound, lang)] : []));
    const taught = new Set(packsFound.map((p) => p.id));
    const namedOnly = (named.items ?? []).filter((item) => !taught.has(item.id));
    byName.replaceChildren(...(namedOnly.length ? [ui.sectionHead(t("explore.named", { query: q })), el("ul", { part: "list" }, namedOnly.map((item) => itemRow(item, here)))] : []));
    const nothing = !packsFound.length && !topicsFound.length && !namedOnly.length;
    status.replaceChildren(
      nothing
        ? found?.error && navigator.onLine === false
          ? ui.emptyState(t("explore.searchOffline"), { pose: "doze", art: "empty-offline" })
          : ui.emptyState([el("p", {}, t("explore.nothingTeaches", { language: languageName(lang), query: q })), mayShare() ? ui.button(t("explore.askForOne"), { onclick: () => (location.hash = `#explore/requests?${new URLSearchParams({ lang, ask: "pack", about: q })}`) }) : null], { pose: "shrug", art: "empty-found" })
        : "",
    );
    // A part with nothing in it takes no room: the page's gap between parts would leave a band of empty space under the search field.
    for (const part of [status, byTopic, teach, byName]) part.hidden = !part.childElementCount;
  })();
  return () => (stale = true);
}

/**
 * Where a page's Back goes when it was opened from somewhere (its ?from=<that page's address>): there, named, one step back. Only
 * the pages that open these; anything else gets the page's own way back.
 */
function backFrom(from) {
  if (typeof from !== "string" || !from.startsWith("#") || from.length > 400) return null;
  const route = from.split("?")[0];
  const parts = route.slice(1).split("/").map((part) => decodeURIComponent(part));
  if (parts[0] === "explore" && parts[1] === "topic" && parts[2]) return { href: from, label: topicNames.get(parts[2]) ?? t("explore.back.topic") };
  if (route === "#explore/search" || (route === "#explore" && /[?&]q=/.test(from))) return { href: from, label: t("explore.back.search") };
  if (route === "#explore/browse") return { href: from, label: t("explore.back.packs") };
  if (route === "#explore/yours") return { href: from, label: t("explore.back.yours") };
  if (parts[0] === "explore" && parts[1] === "item" && parts[2]) return { href: from, label: t("explore.back.pack") };
  if (parts[0] === "explore" && parts[1] === "book" && parts[2]) return { href: from, label: t("explore.back.book") };
  if (parts[0] === "settings" && parts[1] === "study" && parts[2] === "packs" && parts[3]) return { href: from, label: packs.allPacks().find((p) => p.id === parts[3])?.name ?? t("explore.back.yourPack") };
  return null;
}

/** The filters for a list: language, level, topic and sort, each changing the address (so Back undoes it). */
function filters(page, params, topics) {
  const go = (change) => {
    const next = { ...params, ...change };
    for (const [k, v] of Object.entries(next)) if (!v) delete next[k];
    location.hash = `#explore/browse?${new URLSearchParams(next)}`;
  };
  const languages = [...new Set([learning(), "nl", "de", "es", "fr"])].map((code) => [code, languageName(code)]);
  return el(
    "div",
    { class: "lx-inline-form lx-explore-filters" },
    filterButton(page, "Language", languages, params.lang ?? learning(), (lang) => go({ lang })),
    filterButton(page, "Level", [["", "Any"], ...LEVELS.map((l) => [l, l])], params.level ?? "", (level) => go({ level })),
    filterButton(page, "Topic", [["", "Any"], ...topics.map((t) => [t.id, t.name])], params.topic ?? "", (topic) => go({ topic })),
    filterButton(page, "Sort", SORTS, params.sort ?? "popular", (sort) => go({ sort })),
  );
}

// A list's first page and the topics for its filters, by what it lists, for this visit of the app: coming back to it (a swipe back from a
// pack) draws it in its first frame.
const browseFirsts = new Map();

function renderBrowse(page, params) {
  const list = el("ul", { part: "list" });
  const more = ui.button("More", { variant: "fade", block: true });
  more.hidden = true;
  const status = el("p", { class: "lx-small lx-muted" });
  const query = { lang: params.lang ?? learning(), ...(params.level ? { level: params.level } : {}), ...(params.topic ? { topic: params.topic } : {}), sort: params.sort ?? "popular", ...(params.q ? { q: params.q } : {}) };
  const filterSlot = el("div");
  const listSlot = el("div", { class: "lx-stack" });
  page.replaceChildren(...(params.q ? [ui.pageTitle(`“${params.q}”`, `In ${languageName(query.lang)}`)] : []), searchForm(params.q, query.lang), filterSlot, listSlot, more, status);
  let stale = false;
  let offset = 0;
  let drawnKey = null;
  const firstKey = JSON.stringify(query);
  const empty = () => ui.emptyState(params.q ? "Nothing matches that. Try fewer words, or another language." : "Nothing here yet.", { pose: "shrug", art: "empty-found" });
  // The first page and the filters, drawn from an answer: the same as what's on the page leaves it as it is (drawn again, every row
  // and cover was new, and faded in a second time).
  const drawFirst = (topics, answer) => {
    const key = JSON.stringify([topics, answer]);
    if (key === drawnKey) return;
    drawnKey = key;
    filterSlot.replaceChildren(filters(page, query, topics));
    // The covers' pictures it asks for, collected for the page's ready (as the home's are), so a page drawn from before is held unseen until
    // they're in: on a swipe back it's on the screen at once, and a picture coming a frame later would fade in there.
    const outer = pictureWaits;
    pictureWaits = [];
    try {
      list.replaceChildren(...answer.items.map((item) => itemRow(item, location.hash)));
    } finally {
      drawnPictures = pictureWaits;
      pictureWaits = outer;
    }
    offset = answer.next ?? 0;
    more.hidden = answer.next === undefined;
    status.replaceChildren(list.children.length ? "" : empty());
    // Into the place held for it (a first visit) with a fade; drawn from before, it's simply there.
    if (list.parentElement !== listSlot) {
      if (listSlot.querySelector('[data-part="skeleton"]')) ui.arriveIn(listSlot, list);
      else listSlot.replaceChildren(list);
    }
    keepHeight("explore.browse", listSlot);
  };
  let drawnPictures = [];
  const loadMore = async () => {
    more.hidden = true;
    const answer = await api(`/api/community/items?${new URLSearchParams({ ...query, offset: String(offset) })}`);
    if (stale) return;
    list.append(...answer.items.map((item) => itemRow(item, location.hash)));
    offset = answer.next ?? offset;
    more.hidden = answer.next === undefined;
  };
  more.addEventListener("click", () => loadMore().catch((error) => status.replaceChildren(error.message)));
  // In its first frame: this visit's last answer for the same list; else its place held at the height it had last time.
  const kept = browseFirsts.get(firstKey);
  if (kept) drawFirst(kept.topics, kept.answer);
  else listSlot.replaceChildren(ui.skeleton({ height: heldHeight("explore.browse") ?? 360 }));
  const drawn = (async () => {
    try {
      const [topics, answer] = await Promise.all([api("/api/community/topics"), api(`/api/community/items?${new URLSearchParams({ ...query, offset: "0" })}`)]);
      if (stale) return;
      browseFirsts.set(firstKey, { topics, answer });
      drawFirst(topics, answer);
    } catch (error) {
      // Drawn from before, it stays; else what went wrong takes the held place.
      if (!stale && !drawnKey) (listSlot.replaceChildren(), status.replaceChildren(error.message));
    }
  })();
  // The router holds a first visit for its answer (400 ms at most); one drawn from before is whole at once.
  return { title: "Explore", back: { href: `#explore?lang=${query.lang}`, label: "Explore" }, ready: kept ? Promise.all(drawnPictures) : drawn.then(() => Promise.all(drawnPictures)), dispose: () => (stale = true) };
}

// ---------- reporting ----------

const REASONS = [
  ["copyright", "It's my copyrighted work", "A notice that it copies your work. It's taken down at once while it's looked at."],
  ["abuse", "Abuse or hate", "Harassment, hate, threats, or sexual content."],
  ["minors", "It involves a child", "Anything sexual or harmful involving a minor. It's taken down at once."],
  ["illegal", "It's illegal", "Something unlawful to share. It's taken down at once while it's looked at."],
  ["spam", "Spam, or not what it says", "Junk, ads, or a pack that isn't the language it claims."],
  ["personal", "Personal information", "Someone's address, phone number or private details."],
  ["other", "Something else", "Say what in the details."],
];
const field = (attrs) => el("input", { part: "text-field", ...attrs });

/** The report sheet: a reason, details, and (for copyright) the notice's fields. base: the route's, "items" (a pack's) or "books" (books.js). */
export function reportSheet(page, item, msg, base = "items") {
  let reason = null;
  const details = el("textarea", { part: "text-field", rows: 3, maxlength: 2000, placeholder: "What's wrong, and where (optional)", "aria-label": "Details" });
  const name = field({ placeholder: "Your full name", maxlength: 200, "aria-label": "Your full name" });
  const contact = field({ placeholder: "How to reach you (email or address)", maxlength: 300, "aria-label": "How to reach you" });
  const work = field({ placeholder: "The work it copies (title, where it's published)", maxlength: 1000, "aria-label": "The work it copies" });
  const statement = ui.switchRow({ title: "I believe in good faith that this copies my work, and what I've said here is true", sub: "A notice is a statement you make yourself" });
  const notice = el("div", { class: "lx-stack", hidden: true }, name, contact, work, el("ul", { part: "list" }, statement));
  const send = ui.button("Send report", { variant: "go", block: true });
  const status = el("p", { class: "lx-small", role: "status" });
  const reasons = reasonPicker(REASONS, "report-reason", (value) => {
    reason = value;
    notice.hidden = value !== "copyright";
  });
  const content = el("div", { class: "lx-stack" }, reasons, notice, details, ui.pinnedActions([send], { status }));
  const sheet = openSheet(page, "Report", null, { content });
  sendOnce(send, async () => {
    if (!reason) return status.replaceChildren("Pick a reason first.");
    try {
      const answer = await post(`/api/community/${base}/${encodeURIComponent(item.id)}/report`, {
        reason,
        details: details.value.trim() || undefined,
        version: item.version,
        ...(reason === "copyright" ? { notice: { name: name.value, contact: contact.value, work: work.value, statement: statement.querySelector("input").checked } } : {}),
      });
      sheet.close({ animate: false });
      msg.say(answer.hidden ? "Thanks. It's taken down while it's looked at." : "Thanks. It's with the moderators.", "right");
      return true;
    } catch (error) {
      status.replaceChildren(error.message);
    }
  });
}

/** The owner's own taken-down item: why, and the counter-notice that asks for it back. base: "items" (a pack's) or "books" (books.js). */
export function takenDown(item, base = "items") {
  const msg = message();
  const statement = el("textarea", { part: "text-field", rows: 4, maxlength: 4000, placeholder: "Why it should come back: it's your own work, it's openly licensed, the report is mistaken…", "aria-label": "Why it should come back" });
  const name = field({ placeholder: "Your full name", maxlength: 200, "aria-label": "Your full name" });
  const email = field({ type: "email", placeholder: "An email to reach you", maxlength: 300, "aria-label": "An email to reach you" });
  const send = ui.button("Send a counter-notice");
  send.addEventListener("click", async () => {
    try {
      await post(`/api/community/${base}/${encodeURIComponent(item.id)}/counter-notice`, { statement: statement.value, name: name.value, email: email.value });
      msg.say("Sent. The moderators will look at it, and the answer shows here.", "right");
      send.disabled = true;
    } catch (error) {
      msg.say(error.message, "wrong");
    }
  });
  return el(
    "section",
    { part: "section" },
    el("h2", { part: "section-title" }, item.state === "removed" || item.down ? "Taken down" : "Hidden"),
    // A withdrawn pack a report took down: its followers' copies are off their devices until it's settled.
    el("p", { class: "lx-small" }, item.down ? "Taken down after a report: whoever had it can't get it while the report is looked at." : (item.stateReason ?? "It's not in Explore while a report is looked at.")),
    item.work ? el("p", { class: "lx-small" }, `The notice says it copies: ${item.work}`) : null,
    item.state === "hidden" || item.state === "removed" || item.down ? el("div", { class: "lx-stack" }, el("p", { class: "lx-small lx-muted" }, "If the report is wrong, say why. The moderators see why; your name and email go only to an admin."), statement, name, email, send, msg) : null,
  );
}

// ---------- sharing a pack of yours (an action on its page in Study: study/pack-actions.js) ----------

// The item just shared from this device: its page, opened right after, has Tinta fly it off as a paper plane, once.
let justShared = null;

/** Sharing a pack of yours: its page, opened from `from` (a page's address), where its Back goes. */
const shareHref = (packId, from) => `#explore/share/${encodeURIComponent(packId)}${from ? `?${new URLSearchParams({ from })}` : ""}`;


/**
 * Sharing a pack of yours in Explore, as a page of its own (from its page in Study's packs, or Yours): the terms first if they
 * aren't accepted yet, then what it'll be in Explore (its title, what it's about, its level and up to three topics), Share
 * pinned low. Done becomes the shared pack's page in this page's place, so its Back goes where sharing started, one step. A
 * pack already shared gets its update instead: what changed, and Share this update.
 */
function renderShare(page, packId, params) {
  const from = typeof params.from === "string" && params.from.startsWith("#") ? params.from : "#explore/yours";
  const back = backFrom(from) ?? { href: "#explore/yours", label: t("explore.back.yours") };
  const body = el("div", { class: "lx-stack lx-share" }, ui.loadingState());
  page.replaceChildren(body);
  let stale = false;
  const pack = packs.allPacks().find((p) => p.id === packId && p.origin?.kind === "yours");
  if (!pack) {
    body.replaceChildren(ui.emptyState(t("explore.share.notYours"), { pose: "shrug", art: "empty-packs" }));
    return { title: "Explore", back, dispose: () => (stale = true) };
  }
  const status = el("p", { class: "lx-small", role: "status" });
  const errorsOf = (answer) => (answer.errors ?? []).map((e) => `${e.at}: ${e.message}`).join("\n");
  const send = async (path, payload) => {
    const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { ok: response.ok, answer: await response.json().catch(() => ({})) };
  };
  const done = (id) => {
    justShared = id;
    replaceRoute(itemLink(id, from));
  };
  const count = plainItems(pack).length ? t("explore.share.cards", { count: plainItems(pack).length }) : t("explore.share.sentences", { count: sentencesOf(pack).length });
  // What's being shared: its language and size, said under the title (no box around it).
  const facts = t("explore.share.previewLine", { language: languageName(pack.language), size: count });

  // The form: its cover beside its name in Explore (said once, in its field), what it's about, its level as one row, the shelves it goes
  // on as the home's books (pressed, a book slides out with a check; three at most), and its cover: one of the drawings for those
  // topics, the one picked for it by its id chosen until another is pressed. Share is the page's one solid.
  const newForm = (terms, topics) => {
    const title = el("input", { part: "text-field", value: pack.name, maxlength: 80 });
    const about = el("textarea", { part: "text-field", rows: 3, maxlength: 400, placeholder: t("explore.share.aboutHint") }, pack.about ?? "");
    let level = null;
    const picked = new Set();
    let cover = null; // null: the one picked for it by its id
    const levels = el("div", { class: "lx-levels", role: "group", "aria-label": t("explore.share.level") },
      ["", ...LEVELS].map((value) => el("button", { type: "button", class: "lx-level", "data-value": value, "aria-pressed": String(value === ""), "aria-label": value ? value : t("explore.share.anyLevel") }, value || t("explore.share.any"))));
    levels.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      level = button.dataset.value || null;
      for (const one of levels.children) one.setAttribute("aria-pressed", String(one === button));
    });
    const preview = el("span", { class: "lx-share-cover" });
    const picks = el("div", { class: "lx-cover-picks", role: "group", "aria-label": t("explore.share.cover") });
    const coverPart = el("section", { class: "lx-stack lx-share-part", hidden: true }, el("h2", { part: "group-label" }, t("explore.share.cover")), el("p", { part: "group-note" }, t("explore.share.coverNote")), picks);
    const drawCover = () => {
      const chosen = [...picked];
      const choices = coverChoices(chosen);
      if (cover && !choices.includes(cover)) cover = null;
      const shown = cover ?? coverByIdOf(pack.id, chosen);
      preview.replaceChildren(packCover({ id: pack.id, title: title.value.trim() || pack.name, topics: chosen, cover: shown }));
      coverPart.hidden = !choices.length;
      picks.replaceChildren(...choices.map((id) => {
        const button = el("button", { type: "button", class: "lx-cover-pick", "aria-pressed": String(id === shown), "aria-label": id }, drawing(id, "lx-cover-pick-art"), el("span", { class: "lx-cover-pick-mark", "aria-hidden": "true" }, icon("check")));
        button.addEventListener("click", () => {
          cover = id;
          drawCover();
        });
        return button;
      }));
    };
    title.addEventListener("input", () => drawCover());
    // Its topics as chips, outlined; a chosen one bold with a check (the shelves people find packs on: up to three).
    const chips = topics.map((topic) => {
      const chip = el("button", { type: "button", class: "lx-chip", "aria-pressed": "false", "data-topic": topic.id }, icon("check"), el("span", {}, topic.name));
      chip.addEventListener("click", () => {
        const id = topic.id;
        if (picked.has(id)) picked.delete(id);
        else if (picked.size >= 3) return status.replaceChildren(t("explore.share.tooMany"));
        else picked.add(id);
        chip.setAttribute("aria-pressed", String(picked.has(id)));
        status.replaceChildren();
        drawCover();
      });
      return chip;
    });
    const go = ui.button(t("explore.share.go"), { variant: "go", size: "lg", block: true });
    let sending = false;
    go.addEventListener("click", async () => {
      if (sending) return;
      sending = true;
      status.replaceChildren();
      try {
        const { ok, answer } = await send("/api/community/share", { pack, title: title.value.trim() || undefined, about: about.value.trim(), level, topics: [...picked], ...(cover ? { cover } : {}) });
        if (ok && answer.shared) {
          sharedFromHere(pack.id);
          return done(answer.id);
        }
        status.replaceChildren(wordsOf(answer.error) ?? (errorsOf(answer) || t("explore.share.failed")));
      } catch {
        status.replaceChildren(t("explore.share.unreachable"));
      } finally {
        sending = false;
      }
    });
    drawCover();
    body.replaceChildren(
      ...[
        ui.pageTitle(t("explore.share.action"), t("explore.share.sub", { licence: terms.licence })),
        el("div", { class: "lx-share-head" }, preview, el("label", { part: "field" }, t("explore.share.title"), title)),
        // A deck from elsewhere is often someone else's work: say so where it matters. Its sounds never go with it.
        plainItems(pack).length ? el("p", { class: "lx-small lx-muted", "data-share": "deck" }, t("explore.share.deck")) : null,
        el("label", { part: "field" }, t("explore.share.about"), about),
        el("section", { class: "lx-stack lx-share-part" }, el("h2", { part: "group-label" }, t("explore.share.level")), levels),
        el("section", { class: "lx-stack lx-share-part" }, el("h2", { part: "group-label" }, t("explore.share.topics")), el("p", { part: "group-note" }, t("explore.share.topicsNote")), el("div", { class: "lx-chips", role: "group", "aria-label": t("explore.share.topics") }, chips)),
        coverPart,
        ui.pinnedActions([go], { status }),
      ].filter(Boolean),
    );
  };

  const updateForm = (shared) => {
    const note = el("input", { part: "text-field", maxlength: 500, placeholder: t("explore.share.optional") });
    const go = ui.button(t("explore.share.updateTitle"), { variant: "go", size: "lg", block: true });
    let confirmRemoved = false;
    let confirmReverts = false;
    let sending = false;
    go.addEventListener("click", async () => {
      if (sending) return;
      sending = true;
      try {
        const { ok, answer } = await send(`/api/community/items/${encodeURIComponent(shared.id)}/update`, { pack, note: note.value.trim() || undefined, confirmRemoved, confirmReverts });
        if (ok && answer.updated) return done(shared.id);
        const text = answer.error ?? errorsOf(answer);
        // Sentences people follow removed, or accepted corrections undone: say so, and the same press shares it anyway.
        if (/confirm_removed|confirm_reverts/.test(text)) {
          confirmRemoved ||= /confirm_removed/.test(text);
          confirmReverts ||= /confirm_reverts/.test(text);
          go.replaceChildren(t("explore.share.anyway"));
          status.replaceChildren(text.replace(/Send it again with confirm_removed if that's meant\./, "Share it anyway if that's meant.").replace(/or send it again with confirm_reverts if that's meant\./, "or share it anyway if that's meant."));
        } else status.replaceChildren(wordsOf(text) ?? t("explore.share.failed"));
      } catch {
        status.replaceChildren(t("explore.share.unreachable"));
      } finally {
        sending = false;
      }
    });
    body.replaceChildren(
      ui.pageTitle(t("explore.share.updateTitle"), t("explore.share.updateSub", { title: shared.title, count: shared.follows ?? 0 })),
      el("p", { class: "lx-muted" }, facts),
      el("label", { part: "field" }, t("explore.share.whatChanged"), note),
      ui.pinnedActions([go], { status }),
    );
  };

  // The terms, asked once, as this page's first screen; agreeing goes on to the form in the same place.
  const askTerms = (terms, then) => {
    const agree = ui.button(t("explore.share.agree"), { variant: "go", size: "lg", block: true });
    let agreeing = false;
    agree.addEventListener("click", async () => {
      if (agreeing) return;
      agreeing = true;
      try {
        await post("/api/community/terms", { version: terms.version });
        status.replaceChildren();
        then();
      } catch (error) {
        agreeing = false;
        status.replaceChildren(error instanceof TypeError ? t("explore.share.unreachable") : error.message);
      }
    });
    // The pack named once, in the title; what it is and that this is asked once under it; the terms as four plain lines.
    body.replaceChildren(ui.pageTitle(t("explore.share.termsTitleFor", { title: pack.name }), t("explore.share.termsSubFor", { facts })), termsGroup(terms.licence), ui.pinnedActions([agree], { status }));
  };

  const load = async () => {
    try {
      const [terms, mine, topics] = await Promise.all([api("/api/community/terms"), api("/api/community/mine"), api("/api/community/topics")]);
      if (stale) return;
      const shared = mine.find((i) => i.sourceId === pack.id && i.state !== "removed");
      const form = () => (shared ? updateForm(shared) : newForm(terms, topics));
      if (terms.accepted) form();
      else askTerms(terms, form);
    } catch (error) {
      if (!stale) body.replaceChildren(ui.loadFailed(error, load, { offline: t("explore.share.offline") }));
    }
  };
  load();
  return { title: "Explore", back, dispose: () => (stale = true) };
}

// A pack of yours: Share in Explore, a page of its own (it was a sheet), whose Back comes back to the pack.
addPackAction((pack, info) => (info.kind === "yours" && mayShare() ? [{ label: t("explore.share.action"), icon: "globe", run: () => (location.hash = shareHref(pack.id, location.hash)) }] : []));

// ---------- an item ----------

/**
 * A pack's page for a pack that's on the device without being added in Explore (one of the language's own, a pack of yours): never Add. The
 * lessons of the language you're learning: Start or Continue, as Home's lesson. Any other: Added, opening its page in Settings, where its
 * switch is. A pack added in Explore keeps its Added that takes it out again (null: the page draws that one).
 */
function haveAlready(item) {
  if (item.following || !packs.allPacks().some((one) => one.id === item.id)) return null;
  if (item.id === `path-${learning()}`) {
    const { lesson, firstTime } = studyOverview();
    if (lesson) return ui.button(firstTime ? t("explore.lessons.start") : t("explore.lessons.continue"), { variant: "go", size: "lg", block: true, onclick: () => (location.hash = "#study/session/lesson?from=explore") });
  }
  return ui.button(t("explore.added"), { variant: "gray", size: "lg", block: true, icon: "check", pressed: "true", onclick: () => (location.hash = `#settings/study/packs/${encodeURIComponent(item.id)}`) });
}

/** Puts a followed pack on this device now (the next sync would anyway), or takes it off. */
async function onDevice(ref, on) {
  if (on && packs.followPack) return packs.followPack(ref);
  if (!on && packs.unfollowPack) return packs.unfollowPack(ref.id);
  return { ok: true };
}

/** Adds a pack from Explore (follows it, and puts it on this device now): what to say, and whether it's in. */
async function addPack(item) {
  try {
    const answer = await post(`/api/community/items/${encodeURIComponent(item.id)}/follow`);
    const device = await onDevice(answer, true);
    item.following = true;
    item.follows = (item.follows ?? 0) + 1;
    if (device?.ok === false) return { added: true, text: `Added. It couldn't be put on this device yet (${device.errors?.[0]?.message ?? "it'll try again"}).` };
    return { added: true, tone: "right", text: item.language !== learning() ? `Added: it's on this device for when you study ${languageName(item.language)}.` : "Added: it's in your studying now." };
  } catch (error) {
    return { added: false, tone: "wrong", text: error.message };
  }
}

/** Makes a pack of the person's own from a version of this one: a new id, and where it came from. */
// What a copy costs, said on the press: studying moves to it, and a plain card's progress is counted by its pack.
const COPY_LINE = "A pack of yours to change as you like, with no more updates from this one. Studying uses it instead.";
const copyLine = (cards) => (cards ? `${COPY_LINE} Your progress on its cards starts again in the copy.` : COPY_LINE);

async function makeCopy(item) {
  const response = await fetch(`/library/packs/${encodeURIComponent(item.id)}/${item.version}/pack.json`, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Its pack couldn't be fetched. Try again in a moment.");
  const pack = await response.json();
  const suffix = [...crypto.getRandomValues(new Uint8Array(2))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const copy = { ...pack, id: `${item.id.slice(0, 40)}-${suffix}`, name: `${pack.name} (your copy)`, copiedFrom: { id: item.id, version: item.version } };
  const saved = await packs.savePack(copy, { by: `copied from ${item.by}` });
  if (!saved.ok) throw new Error(saved.errors?.[0]?.message ?? "The copy couldn't be saved.");
  // Both on would play every sentence twice.
  if (packs.allPacks().some((one) => one.id === item.id)) packs.setPackOn(item.id, false);
  return saved.pack;
}

// On the page of a pack you can't change: Lexicommons' own, or one you follow.
addPackAction((pack, info) =>
  (info.kind === "default" || info.kind === "follow") && info.version
    ? [
        {
          label: "Make my own copy",
          sub: copyLine(plainItems(pack).length > 0),
          icon: "copy",
          run: async () => {
            try {
              const copy = await makeCopy({ id: pack.id, version: info.version, by: info.kind === "default" ? "Lexicommons" : pack.origin?.by ?? "Explore" });
              location.hash = `#settings/study/packs/${encodeURIComponent(copy.id)}/edit`;
            } catch (error) {
              lookToast("wrong", error.message);
            }
          },
        },
      ]
    : [],
);

/** One of a pack's sentences on its page; its own "…" holds rowActions (none: no "…"). */
function sentenceRow(item, s, ctx) {
  // A plain card's sides take no fix or flag (those are for sentences); Report on the pack's page covers what's on them.
  const actions = s.card ? [] : rowActions(item, s, ctx);
  return ui.sentenceRow({
    text: s.sentence,
    words: previewWords(s.words, item.language),
    literal: s.literal,
    punct: s.punct,
    natural: s.natural,
    lang: item.language,
    onMore: actions.length
      ? () => {
          // The rows again, with the sheet's close: one that opens a sheet of its own closes this one first.
          const sheet = openSheet(document.querySelector('[data-part="page"]') ?? document.body, "This sentence", rowActions(item, s, { ...ctx, close: () => sheet.close({ animate: false }) }));
        }
      : undefined,
  });
}

// ---------- corrections (corrections.ts): a fix or a flag on one piece of a pack, and the open ones on its page ----------

/** A request whose refusal (a 422 with its problems, or a 400) is read here in words. Resolves to { ok, answer }. */
async function submit(method, path, body) {
  let response;
  try {
    response = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    return { ok: false, answer: { error: "Lexicommons couldn't be reached. Try again in a moment." } };
  }
  if (response.status === 401) location.assign(`/login?next=${encodeURIComponent(location.pathname + location.hash)}`);
  return { ok: response.ok, answer: await response.json().catch(() => ({})) };
}
const problemOf = (answer) => wordsOf(answer.error) ?? ((answer.errors ?? []).map((e) => e.message).join(" ") || "Something went wrong.");
const page$ = () => document.querySelector('[data-part="page"]') ?? document.body;
/**
 * A button that sends something, one press at a time: it's off while the request is out, and on again when fn
 * resolves to anything but true (refused, or not sent: what's wrong is said beside it). true is sent and done.
 */
function sendOnce(button, fn) {
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      if ((await fn()) !== true) button.disabled = false;
    } catch (error) {
      button.disabled = false;
      throw error;
    }
  });
}

/** Which piece a correction is on, in words: a sentence's natural line, its wrong versions, …, or a word's gloss. */
function pieceLabel(path) {
  if (path.startsWith("words/")) {
    let lemma = path.slice(6);
    try {
      lemma = decodeURIComponent(lemma);
    } catch {}
    return `the word “${lemma}”`;
  }
  const field = path.split("/")[2];
  return { means: "the natural line", wrong: "the wrong versions", gap: "the gap", literal: "the literal line", words: "the sentence" }[field] ?? "a piece";
}
/** A piece's value as text: a line, a gloss, the wrong versions; anything else as "a new …". */
function valueText(path, value) {
  if (typeof value === "string") return `“${value}”`;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value.map((v) => `“${v}”`).join(" · ");
  return `a new ${pieceLabel(path).replace(/^the /, "")}`;
}

/**
 * Suggest a fix to a sentence's natural line, or flag the sentence: a sheet with the sentence, sent to the pack's
 * author (it's checked as a version would be: what's wrong comes back here, in words).
 */
function correctionSheet(item, s, kind, ctx) {
  const line = el("textarea", { part: "text-field", rows: 3, maxlength: 500, "aria-label": "The natural line" });
  line.value = s.natural ?? "";
  const note = el("textarea", {
    part: "text-field",
    rows: kind === "flag" ? 3 : 2,
    maxlength: 1000,
    placeholder: kind === "flag" ? "What's wrong with it" : "Why (optional)",
    "aria-label": kind === "flag" ? "What's wrong" : "Why",
  });
  const send = ui.button(kind === "flag" ? "Send flag" : "Send fix", { variant: "go", block: true });
  const status = el("p", { class: "lx-small", role: "status" });
  const content = el(
    "div",
    { class: "lx-stack" },
    el("p", { lang: item.language }, s.sentence),
    kind === "fix" ? el("p", { class: "lx-small lx-muted" }, "Its natural line, as it should be:") : null,
    kind === "fix" ? line : null,
    note,
    el("p", { class: "lx-small lx-muted" }, "Its author accepts or declines it. What you suggest is shared under CC BY-SA 4.0, like the pack."),
    ui.pinnedActions([send], { status }),
  );
  const sheet = openSheet(page$(), kind === "flag" ? "Flag this sentence" : "Suggest a fix", null, { content });
  sendOnce(send, async () => {
    const why = note.value.trim();
    if (kind === "fix" && !line.value.trim()) return status.replaceChildren("Write the natural line as it should be.");
    if (kind === "fix" && line.value.trim() === (s.natural ?? "")) return status.replaceChildren("That's what it says already.");
    if (kind === "flag" && why.length < 5) return status.replaceChildren("Say what's wrong.");
    const body =
      kind === "fix"
        ? { path: `items/${s.id}/means`, kind: "fix", value: line.value.trim(), ...(why ? { note: why } : {}), version: item.version }
        : { path: `items/${s.id}/nl`, kind: "flag", note: why, version: item.version };
    if (!(await termsFirst(content, { from: send }))) return;
    const { ok, answer } = await submit("POST", `/api/community/items/${encodeURIComponent(item.id)}/corrections`, body);
    if (!ok || !answer.suggested) return status.replaceChildren(problemOf(answer));
    sheet.close({ animate: false });
    ctx.msg.say(kind === "flag" ? "Thanks: your flag is with its author." : "Thanks: your fix is with its author.", "right");
    ctx.redraw();
    return true;
  });
}

/** What a sentence's own menu offers: a fix or a flag, for anyone but the pack's author (its author shares a new version). */
const rowActions = (item, s, ctx) =>
  item.mine || item.state !== "live" || !s.id || !mayShare()
    ? []
    : [
        ui.listRow({
          icon: "pencil",
          title: "Suggest a fix",
          sub: "A better natural line for this sentence",
          onclick: () => {
            ctx.close?.();
            correctionSheet(item, s, "fix", ctx);
          },
        }),
        ui.listRow({
          icon: "tag",
          title: "Flag it",
          sub: "Something's wrong with this sentence: say what",
          onclick: () => {
            ctx.close?.();
            correctionSheet(item, s, "flag", ctx);
          },
        }),
      ];

/** Declining one: why goes to whoever suggested it. */
function declineSheet(item, c, ctx) {
  const why = el("textarea", { part: "text-field", rows: 3, maxlength: 500, placeholder: "Why it stays as it is", "aria-label": "Why" });
  const send = ui.button("Decline", { variant: "go", block: true });
  const status = el("p", { class: "lx-small", role: "status" });
  const sheet = openSheet(page$(), "Decline it", null, { content: el("div", { class: "lx-stack" }, why, ui.pinnedActions([send], { status })) });
  sendOnce(send, async () => {
    if (why.value.trim().length < 3) return status.replaceChildren("Say why, for whoever suggested it.");
    const { ok, answer } = await submit("POST", `/api/community/items/${encodeURIComponent(item.id)}/corrections/review`, { decline: [{ id: c.id, why: why.value.trim() }] });
    if (!ok || !answer.reviewed) return status.replaceChildren(problemOf(answer));
    sheet.close({ animate: false });
    ctx.msg.say("Declined, with your reason.", "right");
    ctx.redraw();
    return true;
  });
}

/** Reporting one, for what it says (any reason but copyright: a correction holds no work of its own). */
function correctionReportSheet(c, ctx) {
  let reason = null;
  const details = el("textarea", { part: "text-field", rows: 3, maxlength: 2000, placeholder: "What's wrong with it (optional)", "aria-label": "Details" });
  const send = ui.button("Send report", { variant: "go", block: true });
  const status = el("p", { class: "lx-small", role: "status" });
  const reasons = reasonPicker(
    REASONS.filter(([value]) => value !== "copyright").map(([value, title, sub]) => [value, title, sub.replace(/a pack that isn't the language it claims/, "not a correction")]),
    "correction-report-reason",
    (value) => (reason = value),
  );
  const content = el("div", { class: "lx-stack" }, reasons, details, el("p", { class: "lx-small lx-muted" }, "A wrong fix isn't for reporting: its author declines it."), ui.pinnedActions([send], { status }));
  const sheet = openSheet(page$(), "Report this correction", null, { content });
  sendOnce(send, async () => {
    if (!reason) return status.replaceChildren("Pick a reason first.");
    const { ok, answer } = await submit("POST", `/api/community/corrections/${encodeURIComponent(c.id)}/report`, { reason, ...(details.value.trim() ? { details: details.value.trim() } : {}) });
    if (!ok) return status.replaceChildren(problemOf(answer));
    sheet.close({ animate: false });
    ctx.msg.say(answer.hidden ? "Thanks. It's hidden while it's looked at." : "Thanks. It's with the moderators.", "right");
    ctx.redraw();
    return true;
  });
}

/** One correction's own menu: like it, accept or decline it (the pack's author), report it, or take your own back. */
function correctionActions(item, c, ctx) {
  const done = (text, again = ctx.redraw) => {
    ctx.close?.();
    ctx.msg.say(text, "right");
    again();
  };
  // One press at a time: another while one is out sends nothing.
  let busy = false;
  const once = (fn) => async () => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  };
  const failed = (answer) => {
    ctx.close?.();
    ctx.msg.say(problemOf(answer), "wrong");
  };
  const open = c.state === "open" && !c.shown;
  return [
    open && !c.mine
      ? ui.listRow({
          icon: "sparkle",
          title: c.liked ? "Unlike it" : "Like it",
          sub: "The most liked fix for a sentence is the one community corrections play",
          onclick: once(async () => {
            const { ok, answer } = await submit(c.liked ? "DELETE" : "POST", `/api/community/corrections/${encodeURIComponent(c.id)}/like`);
            return ok ? done(c.liked ? "Unliked." : "Liked.") : failed(answer);
          }),
        })
      : null,
    open && item.mine && c.kind === "fix"
      ? ui.listRow({
          icon: "check",
          title: "Accept it",
          sub: "It goes into a new version, for everyone who added the pack",
          onclick: once(async () => {
            const { ok, answer } = await submit("POST", `/api/community/items/${encodeURIComponent(item.id)}/corrections/review`, { accept: [c.id] });
            if (!ok || !answer.reviewed) return failed(answer);
            const yours = answer.ownerCopy ? ` ${answer.ownerCopy.updated ? "Your own copy takes it too." : answer.ownerCopy.why}` : "";
            return done(`Accepted: it's in the new version.${yours}`, ctx.reload);
          }),
        })
      : null,
    open && item.mine
      ? ui.listRow({
          icon: "cross",
          title: "Decline it",
          sub: c.kind === "flag" ? "It stays as it is: say why" : "The pack stays as it is: say why",
          onclick: () => {
            ctx.close?.();
            declineSheet(item, c, ctx);
          },
        })
      : null,
    open && c.mine
      ? ui.listRow({
          icon: "trash",
          title: "Take it back",
          sub: "Withdraw your correction",
          onclick: once(async () => {
            const { ok, answer } = await submit("POST", `/api/community/corrections/${encodeURIComponent(c.id)}/withdraw`);
            return ok ? done("Taken back.") : failed(answer);
          }),
        })
      : null,
    !c.mine
      ? ui.listRow({
          icon: "info",
          title: "Report it",
          sub: "Spam, abuse or personal details in what it says",
          onclick: () => {
            ctx.close?.();
            correctionReportSheet(c, ctx);
          },
        })
      : null,
  ].filter(Boolean);
}

/** One correction, as a row: what it says, on which piece, who suggested it and its likes. Its menu holds its actions. */
function correctionRow(item, c, ctx) {
  const said = c.kind === "flag" ? `Flag: ${c.note ?? ""}` : valueText(c.path, c.value);
  const sub = [
    pieceLabel(c.path),
    c.kind === "fix" && c.current !== undefined && c.current !== null ? `now ${valueText(c.path, c.current)}` : null,
    c.kind === "fix" && c.note ? `“${c.note}”` : null,
    `by ${c.mine ? "you" : c.by}`,
    c.likes ? plural(c.likes, "like") : null,
    c.shown ? (c.shownReason ?? "Hidden after a report") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return ui.listRow({
    icon: c.kind === "flag" ? "tag" : "pencil",
    title: said,
    sub,
    onclick: () => {
      const sheet = openSheet(page$(), "This correction", correctionActions(item, c, { ...ctx, close: () => sheet.close({ animate: false }) }));
    },
  });
}

/** The corrections people suggest for a pack, after what's in it: the open ones, the most liked first. */
function correctionsSection(found, ctx) {
  const { item } = found;
  if (item.state !== "live") return null;
  const note = el("p", { class: "lx-small lx-muted" }, "Loading the corrections…");
  const list = el("ul", { part: "list" });
  const section = el("section", { part: "section", class: "lx-explore-corrections" }, el("h2", { part: "section-title" }, "Corrections"), note, list);
  (async () => {
    const { ok, answer } = await submit("GET", `/api/community/items/${encodeURIComponent(item.id)}/corrections`);
    if (!ok || !Array.isArray(answer)) return note.replaceChildren(problemOf(answer));
    list.replaceChildren(...answer.map((c) => correctionRow(item, c, ctx)));
    // With something waiting, it's open.
    if (answer.length) section.closest("details")?.setAttribute("open", "");
    note.replaceChildren(
      answer.length
        ? item.mine
          ? "Suggested for your pack. Accept one and it's in the next version; decline it and say why."
          : "Suggested by people studying it. Its author accepts or declines each one."
        : item.mine
          ? "None yet. When someone suggests a fix, it shows here for you to accept or decline."
          : "None yet. Something wrong? Press a sentence's … to suggest a fix.",
    );
  })();
  return section;
}

/** What More holds on a pack's page: Report (unless it's yours) and Make my own copy. ctx.close closes the sheet. */
function moreRows(item, ctx) {
  const { msg, close } = ctx;
  return [
    // How the added pack is studied: as its author published it, or with the most-liked fix per sentence in it.
    // Community packs only: Lexicommons' own are studied as published (a device holds them as its own, the ground every
    // other pack is checked on), and their fixes come in through new versions.
    ...(item.following && item.state === "live" && !item.curated
      ? [
          ui.switchRow({
            icon: "pencil",
            title: "Use community corrections",
            sub: "Study it with the most liked fix for each sentence, before its author takes them in",
            checked: item.followCorrections === "community",
            onchange: async (on, input) => {
              // One change at a time: the switch is off while it's out.
              input.disabled = true;
              const { ok, answer } = await submit("POST", `/api/community/items/${encodeURIComponent(item.id)}/follow`, { corrections: on ? "community" : "published" });
              if (!ok) {
                input.disabled = false;
                input.checked = !on;
                return msg.say(problemOf(answer), "wrong");
              }
              // The account has it now, and every device syncs from that: this one takes it at once, or at its next sync.
              item.followCorrections = answer.corrections === "community" ? "community" : "published";
              const device = await packs.followPack(answer).catch((error) => ({ ok: false, errors: [{ message: error.message }] }));
              input.disabled = false;
              input.checked = item.followCorrections === "community";
              const said = item.followCorrections === "community" ? "Community corrections on: studying plays the most-liked fixes." : "Community corrections off: the pack as its author published it.";
              msg.say(device.ok ? said : `${said} This device takes it at its next sync (${device.errors?.[0]?.message ?? "it couldn't yet"}).`, device.ok ? "right" : undefined);
            },
          }),
        ]
      : []),
    ...(item.mine
      ? []
      : [
          ui.listRow({
            icon: "info",
            title: "Report",
            sub: "Copyright, abuse, spam or anything else that shouldn't be here",
            onclick: () => {
              close();
              reportSheet(document.querySelector('[data-part="page"]') ?? document.body, item, msg);
            },
          }),
        ]),
    ui.listRow({
      icon: "copy",
      title: "Make my own copy",
      sub: copyLine((item.badges?.cards ?? 0) > 0),
      onclick: async () => {
        close();
        try {
          const copy = await makeCopy(item);
          location.hash = `#settings/study/packs/${encodeURIComponent(copy.id)}/edit`;
        } catch (error) {
          msg.say(error.message, "wrong");
        }
      },
    }),
  ];
}

/**
 * Where you are in a pack's lessons, from your path: { done: the ids of its lessons you've done, here: the unit of the lesson you're on, or null }.
 * Nothing for a pack that isn't on your path (another language, or one you haven't added).
 */
function whereIn(pack) {
  const prefix = `${pack.id}/`;
  const own = pathLessons().filter((lesson) => lesson.id.startsWith(prefix) && !lesson.full);
  if (!own.length) return { done: new Set(), here: null };
  const done = new Set(own.filter((lesson) => lessonFinished(lesson)).map((lesson) => lesson.id.slice(prefix.length)));
  const now = lessonNow();
  const on = now?.id.startsWith(prefix) ? pathLessons().find((lesson) => lesson.id === now.id) : null;
  return { done, here: on?.unit?.id?.startsWith(prefix) ? on.unit.id.slice(prefix.length) : null };
}

/**
 * A pack's lessons, by its units: each lesson a row saying what it teaches, opening its sentences on this page. null when it has none, so no
 * empty heading. page: what the page keeps of it through a redraw (renderItem's lessonsOpen): the units open (null until it first draws, then
 * the one you're on), whether you've opened or closed one yourself, and the section as drawn.
 */
function lessonsOf(item, pack, page) {
  if (!pack?.lessons?.length) return null;
  // How far you've got: each lesson you've done says so at its end, and each unit counts them.
  const { done, here } = whereIn(pack);
  const idea = (pattern) => (pattern ? { name: pack.patterns?.[pattern]?.name ?? LANGUAGES[item.language]?.patterns?.[pattern]?.name ?? pattern } : null);
  const row = (lesson) => {
    const words = [...(lesson.words ?? []).map((word) => taughtForm({ means: word.means, forms: word.forms, text: word.lemma })), ...(lesson.phrases ?? []).map((id) => pack.chunks?.[id]?.text ?? id)];
    // What it teaches, as path.js teachesLine says it, with the words in their own language and direction (Arabic's read right to left in an English line).
    const shown = idea(lesson.concept?.pattern);
    const sub = words.length || shown
      ? el(
          "span",
          {},
          ...(words.length ? ["New words: ", el("bdi", { lang: item.language }, words.slice(0, WORDS_NAMED).join(", ")), words.length > WORDS_NAMED ? ` +${words.length - WORDS_NAMED}` : ""] : []),
          ...(shown ? [words.length ? " · " : "", `A new idea: ${shown.name}`] : []),
        )
      : undefined;
    return ui.listRow({ title: lesson.title, sub, value: done.has(lesson.id) ? "Done" : undefined, href: `${itemHref(item.id)}?${new URLSearchParams({ lesson: lesson.id, from: "explore" })}` });
  };
  const units = pack.units ?? [];
  // One unit, or none: its lessons, open.
  if (units.length <= 1) return el("div", { class: "lx-stack lx-explore-lessons" }, ui.group(units[0]?.title ?? null, pack.lessons.map(row)));
  // More: a row each, with how many lessons, how far you've got and what they teach in brief. The unit you're on starts open (for a pack you
  // haven't started, the first); a press on any opens it in place, under its row, and it stays as you leave it through a redraw.
  const lessonsIn = (unit) => pack.lessons.filter((lesson) => lesson.unit === unit.id);
  if (!page.openUnits) {
    const start = here ?? (done.size ? (units.find((unit) => lessonsIn(unit).some((lesson) => !done.has(lesson.id))) ?? units.at(-1)).id : units[0].id);
    page.openUnits = new Set([start]);
  }
  const unitRow = (unit, n) => {
    const lessons = lessonsIn(unit);
    const words = new Set(lessons.flatMap((lesson) => [...(lesson.words ?? []).map((word) => word.lemma), ...(lesson.phrases ?? [])])).size;
    const ideas = lessons.filter((lesson) => lesson.concept).length;
    const finished = lessons.filter((lesson) => done.has(lesson.id)).length;
    const count = !finished ? plural(lessons.length, "lesson") : finished === lessons.length && finished > 1 ? `All ${plural(lessons.length, "lesson")} done` : `${finished.toLocaleString()} of ${plural(lessons.length, "lesson")} done`;
    // Each piece whole on its line ("8 ideas", never "8" then "ideas"), the dot with the piece before it.
    const brief = [count, words ? plural(words, "new word") : null, ideas ? plural(ideas, "idea") : null].filter(Boolean).map((piece) => piece.replaceAll(" ", "\u00a0")).join("\u00a0· ");
    const id = `lx-unit-${n}`;
    const open = page.openUnits.has(unit.id);
    const list = el("ul", { part: "list", id, class: "lx-explore-unit-lessons", hidden: !open }, lessons.map(row));
    // It opens here, so it ends in the mark a section that opens in place has, never the page chevron.
    const item = ui.listRow({
      title: unit.title,
      sub: brief,
      trailing: el("span", { class: "lx-unit-mark", "aria-hidden": "true" }),
      onclick: () => {
        list.hidden = !list.hidden;
        button.setAttribute("aria-expanded", String(!list.hidden));
        page.touched = true;
        if (list.hidden) page.openUnits.delete(unit.id);
        else page.openUnits.add(unit.id);
      },
    });
    const button = item.querySelector('[data-part="list-row"]');
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-controls", id);
    if (unit.id === here) button.setAttribute("data-here", "");
    item.append(list);
    return item;
  };
  page.node = el("div", { class: "lx-stack lx-explore-lessons" }, el("ul", { part: "list", class: "lx-explore-units" }, units.map(unitRow)));
  return page.node;
}

/**
 * A pack's page while it's on its way from the server: its head held in the shape it comes in (the cover's square, the title's line, its facts'
 * line, Like and More), what's in it below held a screen's height, and Add pinned low, so what comes takes those places. (The WebKit sweep, 7 Nov: with the server slower than the router's
 * 400 ms, a loading Tinta came, then the cover, title and facts into empty space.)
 */
function heldItem() {
  return [
    el(
      "div",
      { class: "lx-pack-head", "aria-busy": "true" },
      el("span", { part: "pack-cover" }, ui.held({ height: "100%", radius: 24 }, "cover")),
      // (Across the head: centered, its lines shrink to their words, and a held line has none.)
      Object.assign(ui.pageTitle(ui.heldLine("70%", "title")), { style: "align-self: stretch" }),
      Object.assign(el("p", { class: "lx-small lx-muted lx-explore-facts" }, ui.heldLine("80%", "facts")), { style: "align-self: stretch" }),
      PACK_KNOWN ? knownBarWaiting().bar : null,
      el("div", { class: "lx-pack-actions" }, ...(actionsInHead() ? [ui.heldButton("Add pack", { variant: "go", size: "lg", block: true })] : []), ui.heldButton("Like", { size: "lg" }), ui.heldButton("More", { size: "lg" })),
    ),
    // What's in it, below: a screen's height held, so its sentences come in where something was.
    ui.held({ height: "100vh" }, "sentences"),
    ...(actionsInHead() ? [] : [heldPinned()]),
  ];
}
// On a computer (the tabs a sidebar: 1024 px and up) a pack's way forward sits in its head with Like and More, where the eye is, not in a
// band at the window's foot: a phone's thumb has that band, a mouse hasn't, and under a pack's sentences it's a screen away from its name.
const HEAD_ACTIONS = globalThis.matchMedia?.("(min-width: 1024px)") ?? null;
const actionsInHead = () => Boolean(HEAD_ACTIONS?.matches);
// Add pinned low, held: the bar it comes in, a held place over the whole of it (the bar that comes is that box), its button held inside.
function heldPinned() {
  const pinned = ui.pinnedActions([ui.heldButton("Add pack", { variant: "go", size: "lg", block: true })]);
  const over = ui.held({ height: 0 }, "actions");
  Object.assign(over.style, { position: "absolute", inset: "0", minHeight: "0", background: "none", animation: "none" });
  pinned.append(over);
  return pinned;
}

function renderItem(page, id, { lesson = null, from = null } = {}) {
  const msg = message();
  const body = el("div", { class: "lx-stack lx-explore-item" }, ...heldItem());
  page.replaceChildren(body);
  // Its first draw (or its failure): the router shows the page then, 400 ms at most, so a quick answer comes in composed.
  let drawnFirst = null;
  const ready = new Promise((resolve) => (drawnFirst = resolve));
  let stale = false;
  // Just shared from this device: Tinta, at the start of its actions, folds into a paper plane of ink and flies it
  // off (round and back), once. One for the page, moved into each redraw's actions.
  const tinta = justShared === id ? ui.character({ size: 36, hidden: true }) : null;
  if (tinta) justShared = null;
  let flown = false;
  const opened = new Set(); // what's open on the page, kept through a redraw
  // A pack's units: which are open (kept through a redraw), whether you've opened or closed one yourself, the section drawn, and its item.
  const lessonsOpen = { openUnits: null, touched: false, node: null, item: null };
  // Where you are moves under the page (a lesson finished, a place set, the packs arriving after it drew): its units say so. The one you're on
  // opens, unless you've opened or closed one yourself.
  const freshLessons = () => {
    const old = lessonsOpen.node;
    if (stale || !old?.isConnected || !pack || !lessonsOpen.item) return;
    if (!lessonsOpen.touched) lessonsOpen.openUnits = null;
    const next = lessonsOf(lessonsOpen.item, pack, lessonsOpen);
    if (next) old.replaceWith(next);
  };
  const stops = [onContentChange(freshLessons), onDoneChange(freshLessons), onPlaceChange(freshLessons)];
  // What's drawn, for when the window crosses a computer's width: its way forward moves between the head and the band (actionsInHead).
  let shown = null;
  const onWidth = () => !stale && shown && draw(shown);
  HEAD_ACTIONS?.addEventListener("change", onWidth);
  stops.push(() => HEAD_ACTIONS?.removeEventListener("change", onWidth));
  const draw = (found) => {
    // The pictures it asks for (its cover's), collected for the page's ready.
    const outer = pictureWaits;
    pictureWaits = [];
    const { item } = found;
    lessonsOpen.item = item;
    const ctx = { item, msg, redraw: () => draw(found), reload: () => load(true) };
    const other = item.language !== learning();
    const addButton = haveAlready(item) ?? ui.button(item.following ? "Added" : "Add pack", { variant: item.following ? "gray" : "go", size: "lg", block: true, icon: item.following ? "check" : undefined, pressed: item.following ? "true" : undefined });
    const likeButton = ui.button(item.liked ? `Liked · ${item.likes}` : `Like${item.likes ? ` · ${item.likes}` : ""}`, { size: "lg", pressed: item.liked ? "true" : "false" });
    const menuButton = ui.button("More", { size: "lg" });
    // Its way forward and the line that goes with it: in the head on a computer (actionsInHead), in the band low on a phone's screen.
    const inHead = actionsInHead();
    const wayOn = item.state === "live" && (!lesson || from === "explore") ? addButton : null;
    const wayNote = item.state !== "live" ? null : other ? `${withArticle(languageName(item.language), { capital: true })} pack: it waits on this device until you study ${languageName(item.language)}.` : null;
    shown = found;
    if (!haveAlready(item)) addButton.addEventListener("click", async () => {
      const on = !item.following;
      try {
        const answer = on ? await post(`/api/community/items/${encodeURIComponent(item.id)}/follow`) : await del(`/api/community/items/${encodeURIComponent(item.id)}/follow`);
        const device = await onDevice(on ? answer : { id: item.id }, on);
        item.following = on;
        if (on) item.followCorrections = answer.corrections === "community" ? "community" : "published";
        else delete item.followCorrections;
        item.follows += on ? 1 : -1;
        msg.say(
          on
            ? device?.ok === false
              ? `Added. It couldn't be put on this device yet (${device.errors?.[0]?.message ?? "it'll try again"}).`
              : other
                ? `Added: it's on this device for when you study ${languageName(item.language)}.`
                : "Added: it's in your studying now."
            : "Taken out of your packs. What you learned from it stays.",
          on && device?.ok !== false ? "right" : undefined,
        );
        draw(found);
      } catch (error) {
        msg.say(error.message, "wrong");
      }
    });
    likeButton.addEventListener("click", async () => {
      try {
        const answer = item.liked ? await del(`/api/community/items/${encodeURIComponent(item.id)}/like`) : await post(`/api/community/items/${encodeURIComponent(item.id)}/like`);
        item.liked = answer.liked;
        item.likes = answer.likes;
        draw(found);
      } catch (error) {
        msg.say(error.message, "wrong");
      }
    });
    menuButton.addEventListener("click", () => {
      const sheet = openSheet(page, "More", moreRows(item, { ...ctx, close: () => sheet.close({ animate: false }) }));
    });
    const counts = [(item.badges.sentences ?? 0) || !item.badges.cards ? plural(item.badges.sentences ?? 0, "sentence") : null, item.badges.cards ? plural(item.badges.cards, "card") : null, item.badges.words ? plural(item.badges.words, "word") : null, item.badges.patterns ? plural(item.badges.patterns, "pattern") : null, item.badges.literal ? `${item.badges.literal} with the literal line` : null, item.badges.audio ? "recorded" : null]
      .filter(Boolean)
      .join(" · ");
    // What's in it: its sentences (the sample, then all of them from its file), and the patterns they use.
    const rowOf = (it) => sentenceRow(item, { id: it.id, sentence: itemSentence(it, pack.language), ...(it.literal ? { literal: it.literal.map(([text, moved]) => ({ text, moved: Boolean(moved) })) } : {}), punct: it.punct ?? "", words: it.words, natural: it.means }, ctx);
    // Come from a lesson (a starter's "Tell us"): that lesson's sentences in place of the sample, each with its own fix and flag.
    const fromLesson = lesson && pack ? pack.lessons?.find((one) => one.id === lesson) : null;
    const ofLesson = fromLesson ? fromLesson.items.map((one) => sentencesOf(pack).find((it) => it.id === one)).filter(Boolean) : [];
    const lessonHint = ofLesson.length ? el("p", { class: "lx-small lx-muted", "data-from-lesson": "" }, `The sentences in “${fromLesson.title}”. Press … on one to suggest a fix or flag it.`) : null;
    const sentences = el("div", { class: "lx-stack lx-explore-sentences" }, ofLesson.length ? ofLesson.map(rowOf) : found.sample.map((s) => sentenceRow(item, s, ctx)));
    const patterns = el("p", { class: "lx-qs-focus" });
    const all = (item.badges.sentences ?? 0) > found.sample.length && pack ? ui.button(`See all ${plural(item.badges.sentences, "sentence")}`, { variant: "fade", block: true, icon: "list" }) : null;
    const allCards = !all && (item.badges.cards ?? 0) > found.sample.length && pack ? ui.button(`See all ${plural(item.badges.cards, "card")}`, { variant: "fade", block: true, icon: "list" }) : null;
    allCards?.addEventListener("click", () => {
      sentences.replaceChildren(...plainItems(pack).map((card) => sentenceRow(item, { id: card.id, card: true, sentence: card.text, natural: card.means }, ctx)));
      allCards.remove();
    });
    all?.addEventListener("click", () => {
      sentences.replaceChildren(...sentencesOf(pack).map(rowOf));
      lessonHint?.remove();
      all.remove();
    });
    if (pack) {
      const names = [...new Set(pack.items.flatMap((it) => it.concepts ?? []))].map((pid) => pack.patterns?.[pid]?.name ?? LANGUAGES[item.language]?.patterns?.[pid]?.name).filter(Boolean);
      patterns.replaceChildren(...names.map((n) => ui.conceptTag(n)));
    }
    // What's there to read first: its cover, its name, its sentences. The rest is a press away, each in its place, and stays open through a redraw.
    const quiet = (name, label, content, { open = false } = {}) => {
      const node = el("details", { class: "lx-quiet-more", "data-more": name, open: open || opened.has(name) || undefined }, el("summary", {}, label), el("div", { class: "lx-quiet-body" }, content));
      node.addEventListener("toggle", () => (node.open ? opened.add(name) : opened.delete(name)));
      return node;
    };
    const corrections = correctionsSection(found, ctx);
    const lessons = lessonsOf(item, pack, lessonsOpen);
    // (replaceChildren would show a missing part as "null": the optional ones are dropped first.)
    const parts = [
      el(
        "div",
        { class: "lx-pack-head" },
        packCover(item),
        ui.pageTitle(item.title),
        el("p", { class: "lx-small lx-muted lx-explore-facts" }, ui.languageFlag(item.language), [languageName(item.language), item.level ? `Level ${item.level}` : null, sizeLine(item), `by ${item.by}`].filter(Boolean).join(" · ")),
        knownBar(item, pack, { page: true }),
        el("div", { class: "lx-pack-actions" }, ...(inHead ? [tinta, wayOn].filter(Boolean) : []), likeButton, menuButton),
        inHead && wayNote ? el("p", { class: "lx-small lx-muted lx-pack-note" }, wayNote) : null,
      ),
      item.state === "withdrawn" ? el("p", { class: "lx-small" }, "Its author has taken it out of Explore. Whoever added it keeps the version they have.") : null,
      item.mine && (item.state === "hidden" || item.state === "removed" || item.down) ? takenDown(item) : null,
      el("section", { part: "section" }, ...(lessonHint ? [lessonHint] : []), ...(found.sample.length ? [sentences] : []), all, allCards),
      quiet(
        "about",
        "About this pack",
        [
          item.about ? el("p", { class: "lx-explore-about" }, item.about) : null,
          el("p", { class: "lx-small lx-muted" }, [counts, item.topics.map((t) => t.name).join(", ") || null, item.follows ? `added by ${plural(item.follows, "person", "people")}` : null, `updated ${ago(item.updatedAt)}`].filter(Boolean).join(" · ")),
          patterns.childElementCount ? patterns : null,
          el("p", { part: "group-note" }, `${item.licence}: anyone may use, change and share it, crediting ${item.curated ? "Lexicommons" : item.by}, under the same license.`),
          // Its recordings are under their own terms, with their own credit.
          ...(item.recordings ?? []).map((r) => el("p", { part: "group-note" }, `Recordings: ${r.credit} (${r.license}).`)),
        ].filter(Boolean),
      ),
      lessons ? quiet("lessons", "Lessons", lessons) : null,
      corrections ? quiet("corrections", "Corrections", corrections) : null,
      quiet(
        "versions",
        "Versions",
        ui.group(
          null,
          found.versions.map((v) =>
            ui.listRow({
              icon: "clock",
              title: `Version ${v.seq}${v.note ? `: ${v.note}` : ""}`,
              sub: [ago(v.at), v.changes ? [v.changes.added.length ? `${v.changes.added.length} added` : null, v.changes.changed.length ? `${v.changes.changed.length} changed` : null, v.changes.removed.length ? `${v.changes.removed.length} removed` : null].filter(Boolean).join(", ") || "no sentences changed" : "the first"].join(" · "),
            }),
          ),
        ),
      ),
      msg,
      // Add pack, in reach: low on the screen, over the page as it scrolls.
      // (From a lesson you're already studying it: nothing here to add.)
      inHead ? null : ui.pinnedActions([tinta, wayOn].filter(Boolean), { note: wayNote }),
    ];
    body.replaceChildren(...parts.filter(Boolean));
    const pictures = pictureWaits;
    pictureWaits = outer;
    // Ready with its first draw's pictures in (its cover): the router shows it then, 400 ms at most.
    drawnFirst(Promise.all(pictures));
    if (tinta && !flown) {
      flown = true;
      ui.planeCharacter(tinta, "off");
    }
  };
  let pack = null;
  let loads = 0;
  // The item, drawn, then its file (all its sentences and their patterns). Again (after an accept made a new version),
  // both are fetched first and drawn once; a failure then is said, and the page stays as it was. Only the latest load
  // draws: an earlier one still fetching (the first load's file, say) gives way, so it can't draw an older version.
  const load = async (again = false) => {
    const mine = ++loads;
    const current = () => !stale && mine === loads;
    try {
      const found = await api(`/api/community/items/${encodeURIComponent(id)}`);
      if (!current()) return;
      if (!again) draw(found);
      const { item } = found;
      let file = null;
      if ((item.state === "live" || item.state === "withdrawn") && !item.down) file = await packFile(item);
      if (!current()) return;
      pack = upgradePack(file);
      if (again || pack) draw(found);
    } catch (error) {
      if (!current()) return;
      if (again) msg.say(error.message, "wrong");
      else body.replaceChildren(ui.loadFailed(error, () => load(), { offline: "This pack's page needs a connection. It'll come back by itself once you're online." }));
      drawnFirst();
    }
  };
  load();
  // From a lesson, back to it.
  // From a lesson, back to it; opened from a page in Explore (a topic, a search, Yours) or from sharing, back there in one step.
  const back = lesson && from === "explore" ? { href: itemHref(id), label: "The pack" } : lesson ? { href: `#study/path/${encodeURIComponent(`${id}/${lesson}`)}`, label: "The lesson" } : backFrom(from) ?? { href: "#explore", label: "Explore" };
  return {
    title: "Explore",
    back,
    ready,
    dispose: () => {
      stale = true;
      drawnFirst();
      for (const stop of stops) stop();
    },
  };
}

// ---------- yours ----------

function renderYours(page) {
  // The quiet rows at the foot are the page's own, in its first frame; what's yours comes from the server into a place held as tall as it
  // was last time (lx/shapes.js), arriving into it (ui.arrive). The page waits for it up to the router's 400 ms (ready).
  const foot = el(
    "ul",
    { part: "list", class: "lx-yours-more" },
    ui.listRow({ icon: "plus", title: t("explore.yours.anki"), href: "#study/import?from=explore" }),
    // Asking and the terms only while sharing is open to this person; with it off, this page is what you shared before, to withdraw.
    mayShare() ? ui.listRow({ icon: "chat", title: t("explore.yours.askForPack"), href: `#explore/requests?lang=${encodeURIComponent(learning())}` }) : null,
    mayShare() ? ui.listRow({ icon: "globe", title: t("explore.yours.terms"), href: "#explore/terms" }) : null,
  );
  const content = el("div", { class: "lx-stack" });
  const holder = ui.held({ height: heldHeight("explore.yours") ?? 120 }, "yours");
  const body = el("div", { class: "lx-stack lx-explore-yours" }, holder, foot);
  const show = (...nodes) => {
    content.replaceChildren(...nodes);
    if (holder.isConnected) ui.arrive(holder, content);
    requestAnimationFrame(() => keepHeight("explore.yours", content));
  };
  // With sharing off (an old link here), the page is only what you shared before, to withdraw: no line about sharing.
  page.replaceChildren(ui.pageTitle(t("explore.yours.title"), mayShare() ? t("explore.yours.sub") : undefined), body);
  let stale = false;
  const load = async () => {
    try {
      const [items, books, requests, suggestions] = await Promise.all([
        api("/api/community/mine"),
        yourBooks().catch((error) => [ui.group(t("explore.yours.booksShared"), [ui.listRow({ icon: "info", title: t("explore.yours.booksFailed"), sub: error.message })])]),
        yourRequests().catch((error) => ui.group("Your requests", [ui.listRow({ icon: "info", title: "Your requests couldn't be read", sub: error.message })])),
        yourSuggestions().catch((error) => ui.group("Your suggestions to a grammar", [ui.listRow({ icon: "info", title: "Your suggestions couldn't be read", sub: error.message })])),
      ]);
      if (stale) return;
      const state = (i) => (i.down ? "Withdrawn, then taken down after a report" : { live: null, hidden: "Hidden after a report", removed: "Taken down", withdrawn: "Withdrawn" }[i.state]);
      // What's yours and not out there yet. With an AI connected (and only then: outside the AI section the app names no AI), what it made
      // comes first, under its own name, each with the words to ask it to share that pack over MCP; without one, every pack of yours is just yours.
      const shared = new Set(items.filter((i) => i.state !== "removed").map((i) => i.sourceId));
      const records = packs.yourPacks().filter((record) => !shared.has(record.id));
      const madeByAi = (record) => aiConnected() && record.by && record.by !== "you" && record.by !== "An Anki deck";
      const theirs = records.filter(madeByAi);
      const mine = records.filter((record) => !madeByAi(record));
      const sizeOf = (pack) => (plainItems(pack).length ? plural(plainItems(pack).length, "card") : plural(pack.items.length, "sentence"));
      const coverOf = (pack) => packCover({ id: pack.id, title: pack.name, topics: Object.keys(pack.topics ?? {}) });
      const readyRow = (record, by) => ui.listRow({ art: coverOf(record.pack), title: record.pack.name, sub: [sizeOf(record.pack), ...(by ? [" · ", el("b", { class: "lx-yours-by" }, t("explore.yours.madeBy", { name: by }))] : [])], href: shareHref(record.id, "#explore/yours") });
      const section = (heading, ...children) => el("section", { class: "lx-group lx-stack" }, ui.sectionHead(heading), ...children);
      const names = [...new Set(theirs.map((record) => record.by))];
      const aiPart = theirs.length && mayShare()
        ? section(
            names.length === 1 ? t("explore.yours.madeBy", { name: names[0] }) : t("explore.yours.madeByYourAi"),
            // Each marked with its maker only when they come from more than one (one AI's name is the heading already).
            ...theirs.map((record) => el("div", { class: "lx-yours-ai" }, el("ul", { part: "list" }, readyRow(record, names.length > 1 ? record.by : null)), askToShare(record.pack.name, record.by))),
          )
        : null;
      const readyPart = mine.length && mayShare() ? section(t("explore.yours.ready"), el("ul", { part: "list" }, mine.map((record) => readyRow(record, null)))) : null;
      const sharedPart = items.length
        ? section(t("explore.yours.shared"), el("ul", { part: "list" }, items.map((i) => ui.listRow({ art: packCover(i), title: i.title, sub: [state(i), itemSub(i)].filter(Boolean).join(" · "), href: itemLink(i.id, "#explore/yours") }))))
        : null;
      // Nothing to show is what's drawn (with sharing off, packs ready to share aren't).
      const nothing = !aiPart && !readyPart && !sharedPart && !books && !requests && !suggestions;
      show(
        ...[
          aiPart,
          readyPart,
          sharedPart,
          ...(books ?? []),
          nothing ? ui.emptyState(mayShare() ? "Nothing shared yet. What you share shows here." : "Nothing of yours is in Explore.", { pose: "page" }) : null,
          // Your own requests and grammar suggestions, while you have some: their answers and decisions show here.
          requests,
          suggestions,
        ].filter(Boolean),
      );
    } catch (error) {
      if (!stale) show(ui.loadFailed(error, load, { offline: "What you've shared needs a connection to show. It'll come back by itself once you're online." }));
    }
  };
  const loaded = load();
  return { title: "Explore", back: { href: "#explore", label: "Explore" }, ready: loaded, dispose: () => (stale = true) };
}

/** The words to ask your AI to share one of its packs over MCP, with Copy (only drawn with an AI connected). */
function askToShare(name, by) {
  const words = t("explore.yours.prompt", { name });
  const said = el("span", { class: "lx-small lx-muted", role: "status" });
  const copy = ui.button(t("explore.yours.copy"), {
    variant: "gray",
    size: "sm",
    icon: "copy",
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(words);
        said.textContent = t("explore.yours.copied");
      } catch {
        said.textContent = t("explore.yours.copyFailed");
      }
    },
  });
  return el("div", { class: "lx-yours-prompt" }, el("p", { class: "lx-yours-prompt-label" }, t("explore.yours.askYourAi", { name: by })), el("p", { class: "lx-yours-prompt-words" }, words), copy, said);
}

// ---------- the sharing terms ----------

function renderTerms(page) {
  const msg = message();
  const body = el("div", { class: "lx-stack" });
  page.replaceChildren(ui.pageTitle("Sharing in Explore"), body);
  let stale = false;
  (async () => {
    try {
      const terms = await api("/api/community/terms");
      if (stale) return;
      const accept = ui.button(terms.accepted ? "Accepted" : "I agree", { variant: terms.accepted ? "gray" : "go", block: true, pressed: terms.accepted ? "true" : undefined });
      accept.addEventListener("click", async () => {
        if (terms.accepted) return;
        try {
          await post("/api/community/terms", { version: terms.version });
          terms.accepted = true;
          accept.replaceChildren("Accepted");
          accept.setAttribute("data-variant", "gray");
          msg.say("Thanks. You can share now.", "right");
        } catch (error) {
          msg.say(error.message, "wrong");
        }
      });
      body.replaceChildren(termsGroup(terms.licence), ui.pinnedActions([accept], { status: msg }));
    } catch (error) {
      if (stale) return;
      body.replaceChildren(msg);
      msg.say(error.message, "wrong");
    }
  })();
  return { title: "Explore", back: { href: "#explore", label: "Explore" }, dispose: () => (stale = true) };
}

/** Renders an Explore page into `page`. Returns { title, back?, dispose }. */
export function renderExplore(page, rest = [], params = {}) {
  if (rest[0] === "item" && rest[1]) return renderItem(page, rest[1], params);
  if (rest[0] === "topic" && rest[1]) return renderTopic(page, rest[1], params);
  if (rest[0] === "search") return renderSearch(page, params);
  if (rest[0] === "share" && rest[1]) {
    // With sharing off for this person, an old link to sharing a pack opens the pack itself.
    if (!mayShare()) {
      queueMicrotask(() => replaceRoute(`#settings/study/packs/${encodeURIComponent(rest[1])}`));
      return { title: "Explore" };
    }
    return renderShare(page, rest[1], params);
  }
  if (rest[0] === "browse") return renderBrowse(page, params);
  if (rest[0] === "books") return renderBooks(page, params);
  if (rest[0] === "book" && rest[1]) return renderBook(page, rest[1], params);
  if (rest[0] === "share-book" && rest[1]) {
    // With sharing off for this person, an old link to sharing a book opens Yours.
    if (!mayShare()) {
      queueMicrotask(() => replaceRoute("#explore/yours"));
      return { title: "Explore" };
    }
    return renderShareBook(page, rest[1], params);
  }
  if (rest[0] === "topics") return renderTopics(page, params);
  if (rest[0] === "terms") return renderTerms(page);
  if (rest[0] === "yours") return renderYours(page);
  if (rest[0] === "requests") return renderRequests(page, params);
  if (rest[0] === "request" && rest[1]) return renderRequest(page, rest[1]);
  if (rest[0] === "grammar") return renderGrammar(page, params);
  if (rest[0] === "own") return renderOwn(page, params);
  if (rest[0] === "pattern" && rest[1] && rest[2]) return renderPattern(page, rest[1], rest[2]);
  return renderHome(page, params);
}
