// Books in Explore (docs/explore-books.md): books people shared, each a book's text with the layers it's woven into, found by the language
// you're learning (a book in it, or woven into it), added to your reading library, liked and reported as a pack is.
//   #explore/books?lang&sort             every book for a language, popular or new, as covers
//   #explore/book/<id>?from              a book's page: its cover, who wrote it and who shared it, its first lines as they read (the
//                                        woven words in the reader's violet), where it's from and its license, its versions; Add to my
//                                        library pinned low (it's on this device at once, in Read), then Read it
//   #explore/share-book/<text>?from      sharing a text of yours from your reading library: whether it's free to share and where it
//                                        came from first (the server refuses a book without both), then its name, what it's about, its
//                                        level and topics, and the layers on this device that go with it
// Sharing shows only while it's open to this person (shell/sharing.js mayShare); finding, adding, liking and reporting are everyone's.
// Everything from the server goes into the page as text.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { t } from "../lx/i18n.js";
import { replaceRoute } from "../shell/route.js";
import { api, del, post } from "../shell/api.js";
import { languageName } from "../lang/index.js";
import { learning } from "../study/learning.js";
import { heldHeight, keepHeight } from "../lx/shapes.js";
import { mayShare } from "../shell/sharing.js";
import * as store from "../read/store.js";
import { fetchOpenBook } from "../read/shelf.js";
import { termsFirst } from "./terms.js";
import { knownSet } from "../read/bank.js";
import { weaveSentence } from "../read/book-format.js";
import { FLIP_AT, knownForShare, pieceGap } from "../read/woven-text.js";
import { reportSheet, takenDown } from "./explore.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
// The licenses a book may be shared under (read/book-format.js OPEN_LICENCES, the ones offered): [spdx, its name].
const LICENCES = [
  ["CC-BY-SA-4.0", "CC BY-SA 4.0"],
  ["CC-BY-4.0", "CC BY 4.0"],
  ["CC0-1.0", "CC0"],
];
// The open libraries whose books go live at once (community-books.ts KNOWN_SOURCES), named as people know them.
const KNOWN = ["Project Gutenberg", "Wikisource", "Standard Ebooks", "StoryWeaver", "African Storybook", "Global Storybooks"];
const SHELF = 6; // books on Explore's home shelf
// A woven book's page shows its first lines woven, from its layer (fetched for it: about 60 bytes an English word); a book longer than
// this shows them in English, with a line on how weaving works, so a page never fetches a big layer only to show five lines.
const PREVIEW_WORDS = 8000;

export const bookHref = (id) => `#explore/book/${encodeURIComponent(id)}`;
export const bookLink = (id, from) => (from ? `${bookHref(id)}?${new URLSearchParams({ from })}` : bookHref(id));
const shareBookHref = (textId, from) => `#explore/share-book/${encodeURIComponent(textId)}${from ? `?${new URLSearchParams({ from })}` : ""}`;

const ago = (iso) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400_000);
  return days < 1 ? t("explore.books.today") : days === 1 ? t("explore.books.yesterday") : days < 30 ? t("explore.books.daysAgo", { count: days }) : new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
const message = () => {
  const node = el("p", { class: "lx-settings-message", role: "status" });
  node.say = (text, tone) => {
    node.replaceChildren(text ?? "");
    if (tone) node.setAttribute("data-tone", tone);
    else node.removeAttribute("data-tone");
  };
  return node;
};
/** Who wrote it, as its cover and lines say: its authors (its translators after, as "translated by"). */
const authorOf = (book) => (book.authors ?? []).filter((a) => (a.role ?? "author") === "author").map((a) => a.name).join(", ");
function byLine(book) {
  const translators = (book.authors ?? []).filter((a) => a.role === "translator").map((a) => a.name).join(", ");
  return [authorOf(book), translators ? t("explore.books.translatedBy", { names: translators }) : null].filter(Boolean).join(", ");
}
/** How a book is for `lang`: woven into it (an English book with its words in), or in it. */
function howFor(book, lang) {
  if (book.language !== lang && book.layers?.includes(lang)) return t("explore.books.wovenInto", { language: languageName(lang) });
  return t("explore.books.inLanguage", { language: languageName(book.language) });
}
const lineOf = (book, lang) => [book.level, howFor(book, lang)].filter(Boolean).join(" · ");

/** A book as a tile on a shelf or in a list: its designed cover (its title and author on it), its level and how it's for the language. */
export function bookTileOf(book, lang, from) {
  const tile = ui.bookTile({ id: book.id, title: book.title, lang: book.language, cover: { by: authorOf(book) || undefined }, sub: lineOf(book, lang), href: bookLink(book.id, from) });
  return tile;
}

/** Explore home's shelf of books for `lang` (books: the home's kept answer), or null when there are none. */
export function booksShelf(books, lang, from) {
  if (!Array.isArray(books) || !books.length) return null;
  return el(
    "section",
    { class: "lx-stack lx-explore-shelf lx-explore-books" },
    ui.sectionHead(t("explore.books.title"), { link: { href: `#explore/books?${new URLSearchParams({ lang })}`, label: t("explore.books.seeAll") } }),
    ui.bookList(books.slice(0, SHELF).map((book) => bookTileOf(book, lang, from)), { label: t("explore.books.title") }),
  );
}

// ---------- every book for a language ----------

export function renderBooks(page, params = {}) {
  const lang = typeof params.lang === "string" && params.lang ? params.lang : learning();
  const sort = params.sort === "new" ? "new" : "popular";
  const here = `#explore/books?${new URLSearchParams({ lang, sort })}`;
  const sorts = ui.segmented(
    [
      ["popular", t("explore.books.popular")],
      ["new", t("explore.books.new")],
    ],
    sort,
    (value) => replaceRoute(`#explore/books?${new URLSearchParams({ lang, sort: value })}`),
    t("explore.books.sort"),
  );
  const grid = el("div", { class: "lx-stack" });
  const holder = ui.held({ height: heldHeight("explore.books") ?? 420 }, "books");
  const more = el("div", { class: "lx-stack" });
  page.replaceChildren(ui.pageTitle(t("explore.books.title"), t("explore.books.sub", { language: languageName(lang) })), sorts, holder, more);
  let stale = false;
  const tiles = [];
  const load = async (offset = 0) => {
    try {
      const answer = await api(`/api/community/books?${new URLSearchParams({ learning: lang, sort, offset: String(offset) })}`);
      if (stale) return;
      tiles.push(...answer.books.map((book) => bookTileOf(book, lang, here)));
      grid.replaceChildren(
        tiles.length
          ? ui.bookList(tiles, { layout: "grid", label: t("explore.books.title") })
          : ui.emptyState(t("explore.books.none", { language: languageName(lang) }), { pose: "page", art: "empty-books" }),
      );
      if (holder.isConnected) ui.arrive(holder, grid);
      requestAnimationFrame(() => keepHeight("explore.books", grid));
      more.replaceChildren(
        answer.next != null
          ? ui.button(t("explore.books.more"), { variant: "fade", block: true, onclick: (event) => ((event.currentTarget.disabled = true), load(answer.next)) })
          : "",
      );
    } catch (error) {
      if (stale) return;
      const failed = ui.loadFailed(error, () => load(offset), { offline: t("explore.books.offline") });
      if (holder.isConnected) ui.arrive(holder, failed);
      else more.replaceChildren(failed);
    }
  };
  const loaded = load();
  return { title: "Explore", back: { href: `#explore?${new URLSearchParams({ lang })}`, label: "Explore" }, ready: loaded, dispose: () => (stale = true) };
}

// ---------- a book's page ----------

// The book just shared from this device: its page, opened right after, has Tinta fly it off as a paper plane, once.
let justShared = null;

/**
 * The sample's sentences as the reader would show them woven into `lang` (book-format.js weaveSentence, the reader's own render): with
 * the words you know (read/bank.js knownSet), or, when they'd weave in none of these, the text's most common words (knownForShare), said
 * so in the heading. Each sentence's English words come from the sample (one per word of the layer's sentence; one that doesn't match is
 * left as it is). Null when the layer doesn't fit the sample.
 */
function wovenSample(found, layer, lang) {
  const sentences = found.sample.map((s, x) => {
    const sentence = layer.sentences?.[x];
    const words = String(s.sentence).split(" ");
    if (!sentence || !Array.isArray(sentence.t) || words.length !== sentence.e - sentence.s) return { plain: s.sentence };
    const book = [];
    words.forEach((word, j) => (book[sentence.s + j] = word));
    return { sentence, book };
  });
  if (!sentences.some((one) => one.sentence)) return null;
  const draw = (known) =>
    sentences.map((one) => {
      if (!one.sentence) return { pieces: [{ text: one.plain, show: "en" }], flipped: false };
      const shown = weaveSentence(one.sentence, one.book, known, { flipAt: FLIP_AT, lang, from: layer.from });
      return { pieces: shown.words.filter((piece) => piece.show !== "hidden"), flipped: shown.flipped };
    });
  const woven = (lines) => lines.some((line) => line.pieces.some((piece) => piece.show === "target"));
  const yours = draw(knownSet(lang));
  if (woven(yours)) return { lines: yours, yours: true };
  return { lines: draw(knownForShare(layer, 0.2)), yours: false };
}

/** A woven line: its pieces, those in `lang` in the reader's violet, spaced as the reader spaces them. */
function wovenLine(line, lang, from) {
  const parts = [];
  line.pieces.forEach((piece, k) => {
    if (k) parts.push(pieceGap(line.pieces[k - 1], piece, lang, line.flipped));
    parts.push(piece.show === "target" ? el("span", { class: "lx-book-woven", lang }, piece.text) : piece.text);
  });
  return el("p", { class: "lx-book-line", "data-woven": "", lang: from }, parts);
}

export function renderBook(page, id, params = {}) {
  const lang = learning();
  const from = typeof params.from === "string" && params.from.startsWith("#") ? params.from : null;
  const msg = message();
  const body = el("div", { class: "lx-stack lx-explore-item lx-explore-book" }, ui.loadingState());
  page.replaceChildren(body);
  let stale = false;
  const tinta = justShared === id ? ui.character({ size: 36, hidden: true }) : null;
  if (tinta) justShared = null;
  let flown = false;
  const opened = new Set();
  let adding = false;
  const draw = (found, kept) => {
    const { book } = found;
    const cover = ui.bookCover({ title: book.title, by: authorOf(book) || undefined, seed: book.id, lang: book.language });
    // On this device already (in Read): Read it. Else Add to my library, which follows it and puts it here at once, its download's bar
    // on its cover; a follow whose book couldn't be put here says so, and the same press tries again.
    const read = () => ui.button(t("explore.book.read"), { variant: "go", size: "lg", block: true, icon: "book", onclick: () => (location.hash = `#read/book/${encodeURIComponent(book.id)}`) });
    const add = ui.button(t("explore.book.add"), { variant: "go", size: "lg", block: true });
    add.addEventListener("click", async () => {
      if (adding) return;
      adding = true;
      add.disabled = true;
      const bar = ui.downloadBar({ label: t("explore.book.adding", { title: book.title }), tinta: false });
      cover.append(bar);
      try {
        const meta = await post(`/api/community/books/${encodeURIComponent(book.id)}/follow`);
        book.following = true;
        const record = await fetchOpenBook(meta, { onProgress: (share) => bar.set(share) });
        await store.addBook(record.book, record.weaves, { definitions: record.definitions });
        bar.done();
        if (stale) return;
        msg.say(t("explore.book.added"), "right");
        draw(found, true);
      } catch (error) {
        bar.stop();
        bar.remove();
        add.disabled = false;
        msg.say(book.following ? t("explore.book.notHere", { why: error.message }) : error.message, "wrong");
      } finally {
        adding = false;
      }
    });
    const likeButton = ui.button(book.liked ? t("explore.book.liked", { count: book.likes }) : book.likes ? t("explore.book.likeCount", { count: book.likes }) : t("explore.book.like"), { size: "lg", pressed: book.liked ? "true" : "false" });
    likeButton.addEventListener("click", async () => {
      try {
        const answer = book.liked ? await del(`/api/community/books/${encodeURIComponent(book.id)}/like`) : await post(`/api/community/books/${encodeURIComponent(book.id)}/like`);
        book.liked = answer.liked;
        book.likes = answer.likes;
        draw(found, kept);
      } catch (error) {
        msg.say(error.message, "wrong");
      }
    });
    const moreButton = ui.button(t("explore.book.more"), { size: "lg" });
    moreButton.addEventListener("click", () => {
      const layer = ui.sheetLayer({ label: t("explore.book.more") });
      const close = () => layer.lxClose({ animate: false });
      const rows = [
        book.state === "live" && !book.mine ? ui.listRow({ icon: "info", title: t("explore.book.report"), sub: t("explore.book.reportSub"), opens: "sheet", onclick: () => (close(), reportSheet(page, book, msg, "books")) }) : null,
        book.mine && (book.state === "live" || book.state === "pending") ? ui.listRow({ icon: "cross", title: t("explore.book.withdraw"), sub: t("explore.book.withdrawSub"), onclick: () => (close(), withdraw(found)) }) : null,
      ].filter(Boolean);
      layer.lxBody.replaceChildren(el("h2", { class: "lx-sheet-title" }, t("explore.book.more")), el("ul", { part: "list" }, rows));
      layer.lxOpen();
    });
    const layers = (book.layers ?? []).map((l) => languageName(l));
    const quiet = (name, label, content) => {
      const node = el("details", { class: "lx-quiet-more", "data-more": name, open: opened.has(name) || undefined }, el("summary", {}, label), el("div", { class: "lx-quiet-body" }, content));
      node.addEventListener("toggle", () => (node.open ? opened.add(name) : opened.delete(name)));
      return node;
    };
    const source = book.source?.url
      ? el("a", { class: "lx-book-source", href: book.source.url, target: "_blank", rel: "noopener noreferrer" }, book.source.name ?? new URL(book.source.url).hostname.replace(/^www\./, ""))
      : null;
    const state = {
      pending: t("explore.book.pending"),
      declined: book.stateReason ? t("explore.book.declinedWhy", { why: book.stateReason }) : t("explore.book.declined"),
      withdrawn: t("explore.book.withdrawn"),
    }[book.state];
    const parts = [
      // As a pack's page: its cover (book-shaped) over its title, who wrote it, a line of facts, then Like and More.
      el(
        "div",
        { class: "lx-pack-head lx-book-head" },
        el("div", { class: "lx-book-head-cover" }, cover),
        ui.pageTitle(book.title),
        byLine(book) ? el("p", { class: "lx-book-by" }, byLine(book)) : null,
        el("p", { class: "lx-small lx-muted lx-explore-facts" }, [book.level ? t("explore.book.level", { level: book.level }) : null, howFor(book, lang), t("explore.book.sharedBy", { name: book.by })].filter(Boolean).join(" · ")),
        book.state === "live" || book.state === "withdrawn" ? el("div", { class: "lx-pack-actions" }, likeButton, moreButton) : book.mine ? el("div", { class: "lx-pack-actions" }, moreButton) : null,
      ),
      state ? el("p", { class: "lx-small", "data-state": book.state }, state) : null,
      book.mine && (book.state === "hidden" || book.state === "removed" || book.down) ? takenDown(book, "books") : null,
      found.sample.length ? sampleSection(found, lang) : null,
      quiet("about", t("explore.book.about"), [
        book.about ? el("p", { class: "lx-explore-about" }, book.about) : null,
        el("p", { class: "lx-small lx-muted" }, [book.topics.map((topic) => topic.name).join(", ") || null, book.follows ? t("explore.book.addedBy", { count: book.follows }) : null, t("explore.book.updated", { when: ago(book.updatedAt) })].filter(Boolean).join(" · ")),
        // Where its text came from, and whether it's free: what anyone needs to trust that it may be here.
        el("p", { class: "lx-small" }, book.rights.publicDomain ? t("explore.book.publicDomain") : t("explore.book.licensed", { line: book.rights.line })),
        source ? el("p", { class: "lx-small" }, t("explore.book.from"), " ", source) : null,
        layers.length ? el("p", { part: "group-note" }, t("explore.book.layersLicence", { languages: new Intl.ListFormat(undefined, { type: "conjunction" }).format(layers), count: layers.length, licence: book.licence, name: book.by })) : null,
      ]),
      found.versions.length > 1
        ? quiet(
            "versions",
            t("explore.book.versions"),
            ui.group(
              null,
              found.versions.map((v) =>
                ui.listRow({
                  icon: "clock",
                  title: v.note ? t("explore.book.versionNote", { seq: v.seq, note: v.note }) : t("explore.book.version", { seq: v.seq }),
                  sub: [ago(v.at), changesOf(v.changes)].filter(Boolean).join(" · "),
                }),
              ),
            ),
          )
        : null,
      msg,
      book.state === "live" ? ui.pinnedActions([tinta, kept ? read() : add].filter(Boolean)) : null,
    ];
    body.replaceChildren(...parts.filter(Boolean));
    if (tinta && !flown) {
      flown = true;
      ui.planeCharacter(tinta, "off");
    }
  };
  const withdraw = async (found) => {
    try {
      await post(`/api/community/books/${encodeURIComponent(found.book.id)}/withdraw`);
      found.book.state = "withdrawn";
      msg.say(t("explore.book.withdrawnSaid"), "right");
      draw(found, false);
    } catch (error) {
      msg.say(error.message, "wrong");
    }
  };
  const load = async () => {
    try {
      const [found, here] = await Promise.all([api(`/api/community/books/${encodeURIComponent(id)}`), store.listBooks().catch(() => [])]);
      if (stale) return;
      // A woven book's layer for the language you're learning, for its first lines as they read (none past PREVIEW_WORDS, or offline:
      // its lines then show as written).
      const entry = found.book.language !== lang ? found.meta?.layers?.[lang] : null;
      if (entry?.kind === "weave" && entry.url && (found.meta.words ?? Infinity) <= PREVIEW_WORDS && found.sample.length) {
        const layer = await fetch(entry.url, { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (stale) return;
        found.preview = layer ? wovenSample(found, layer, lang) : null;
      }
      draw(found, here.some((entry) => entry.id === found.book.id));
    } catch (error) {
      if (!stale) body.replaceChildren(ui.loadFailed(error, () => load(), { offline: t("explore.book.offline") }));
    }
  };
  const loaded = load();
  const back = from === "#explore/yours" ? { href: from, label: t("explore.back.yours") } : from?.startsWith("#explore/books") ? { href: from, label: t("explore.books.title") } : { href: "#explore", label: "Explore" };
  return { title: "Explore", back, ready: loaded, dispose: () => (stale = true) };
}

// A chapter's marker among a book's first sentences ("I", "HOOFDSTUK I", "Chapter 1"): left out of how it starts. A short line with no
// lowercase letter, or one naming a chapter; a chapter's title in words ("Down the Rabbit-Hole") stays.
const isMarker = (text) => String(text).trim().split(/\s+/).length <= 4 && (!/\p{Ll}/u.test(text) || /^(chapter|hoofdstuk|kapitel|chapitre|cap[ií]tulo|capitolo)\b/iu.test(String(text).trim()));

/**
 * A book's first lines: woven into the language you're learning as the reader shows them (found.preview, its layer fetched with the
 * page), else as written, a woven book's with a line on how weaving works.
 */
function sampleSection(found, lang) {
  const { book, preview } = found;
  const wovenBook = book.language !== lang && book.layers?.includes(lang);
  const heading = preview ? (preview.yours ? t("explore.book.howItReadsYours", { language: languageName(lang) }) : t("explore.book.howItReadsCommon", { language: languageName(lang) })) : t("explore.book.howItReads");
  return el(
    "section",
    { part: "section", class: "lx-book-sample" },
    el("h2", { part: "group-label" }, heading),
    wovenBook && !preview ? el("p", { part: "group-note" }, t("explore.book.wovenNote", { language: languageName(lang) })) : null,
    el(
      "div",
      { class: "lx-book-lines" },
      preview
        ? preview.lines.filter((_, x) => !isMarker(found.sample[x].sentence)).map((line) => wovenLine(line, lang, book.language))
        : found.sample.filter((s) => !isMarker(s.sentence)).map((s) => el("p", { class: "lx-book-line", lang: book.language }, s.sentence)),
    ),
  );
}

/** What a version changed, in words: its text, and the layers added, put in place or taken off. */
function changesOf(changes) {
  if (!changes) return t("explore.book.first");
  const names = (langs) => new Intl.ListFormat(undefined, { type: "conjunction" }).format(langs.map((l) => languageName(l)));
  return [
    changes.text ? t("explore.book.newText") : null,
    changes.layersAdded?.length ? t("explore.book.layersAdded", { languages: names(changes.layersAdded) }) : null,
    changes.layersReplaced?.length ? t("explore.book.layersReplaced", { languages: names(changes.layersReplaced) }) : null,
    changes.layersDropped?.length ? t("explore.book.layersDropped", { languages: names(changes.layersDropped) }) : null,
  ].filter(Boolean).join(", ") || null;
}

// ---------- yours: the books you shared, and the texts of yours ready to share ----------

// A text of yours (read/store.js: pasted, a file, or one your AI added), never a book from the shelf or Explore.
const isYours = (entry) => ["paste", "upload", "ai"].includes(entry.source?.kind);

/**
 * Yours' books: what you've shared as books (every state), then, while sharing is open to you, the texts in your reading library not
 * shared yet, each opening its share page. Null when there are neither.
 */
export async function yourBooks() {
  const [mine, entries] = await Promise.all([api("/api/community/books/mine"), store.listBooks().catch(() => [])]);
  const stateOf = (b) =>
    b.down ? t("explore.yours.bookDown") : { live: null, pending: t("explore.yours.bookPending"), declined: t("explore.yours.bookDeclined"), hidden: t("explore.yours.bookHidden"), removed: t("explore.yours.bookRemoved"), withdrawn: t("explore.yours.bookWithdrawn") }[b.state];
  const mini = (book) => el("span", { class: "lx-book-mini" }, ui.bookCover({ title: book.title, seed: book.id, lang: book.language ?? book.lang }));
  const shared = new Set(mine.filter((b) => b.state !== "removed").map((b) => b.sourceId));
  const ready = mayShare() ? entries.filter((entry) => isYours(entry) && !shared.has(entry.id)) : [];
  const section = (heading, rows) => el("section", { class: "lx-group lx-stack" }, ui.sectionHead(heading), el("ul", { part: "list" }, rows));
  const parts = [
    ready.length
      ? section(
          t("explore.yours.booksReady"),
          ready.map((entry) =>
            entry.pictures?.length
              ? ui.listRow({ art: mini({ ...entry, language: entry.lang }), title: entry.title, sub: t("explore.yours.bookPictures") })
              : ui.listRow({ art: mini({ ...entry, language: entry.lang }), title: entry.title, sub: t("explore.yours.bookWords", { count: entry.words }), href: shareBookHref(entry.id, "#explore/yours") }),
          ),
        )
      : null,
    mine.length ? section(t("explore.yours.booksShared"), mine.map((b) => ui.listRow({ art: mini(b), title: b.title, sub: [stateOf(b), lineOf(b, b.layers?.[0] ?? b.language)].filter(Boolean).join(" · "), href: bookLink(b.id, "#explore/yours") }))) : null,
  ].filter(Boolean);
  return parts.length ? parts : null;
}

// ---------- sharing a book of yours ----------

export function renderShareBook(page, textId, params = {}) {
  const from = typeof params.from === "string" && params.from.startsWith("#") ? params.from : "#explore/yours";
  const back = from === "#explore/yours" ? { href: from, label: t("explore.back.yours") } : { href: from, label: t("explore.book.back") };
  const body = el("div", { class: "lx-stack lx-share lx-share-book" }, ui.loadingState());
  page.replaceChildren(body);
  let stale = false;
  const status = el("p", { class: "lx-small", role: "status" });

  const form = (entry, text, weaves, topics) => {
    const title = el("input", { part: "text-field", value: entry.title, maxlength: 200 });
    const about = el("textarea", { part: "text-field", rows: 3, maxlength: 400, placeholder: t("explore.shareBook.aboutHint") });
    // Whether it may be shared, asked first: public domain, an open license (which, and whom it credits), or neither (then it can't be).
    let rights = null;
    let licence = LICENCES[0][0];
    const credit = el("input", { part: "text-field", maxlength: 300, placeholder: t("explore.shareBook.creditHint"), value: byLine(text) });
    const licenceRow = ui.choiceRow({ title: t("explore.shareBook.which"), options: LICENCES, value: licence, onchange: (value) => (licence = value) });
    const openPart = el("div", { class: "lx-stack lx-share-open", hidden: true }, el("ul", { part: "list" }, licenceRow), el("label", { part: "field" }, t("explore.shareBook.credit"), credit));
    const neither = el("p", { class: "lx-small", "data-tone": "wrong", hidden: true }, t("explore.shareBook.neitherSaid"));
    const rightsPick = ui.pickList(t("explore.shareBook.free"), [
      ui.radioRow({ name: "book-rights", value: "pd", title: t("explore.shareBook.pd"), sub: t("explore.shareBook.pdSub"), onchange: (value) => pickRights(value) }),
      ui.radioRow({ name: "book-rights", value: "open", title: t("explore.shareBook.open"), sub: t("explore.shareBook.openSub"), onchange: (value) => pickRights(value) }),
      ui.radioRow({ name: "book-rights", value: "neither", title: t("explore.shareBook.neither"), onchange: (value) => pickRights(value) }),
    ]);
    const pickRights = (value) => {
      rights = value;
      openPart.hidden = value !== "open";
      neither.hidden = value !== "neither";
      go.disabled = value === "neither";
      status.replaceChildren();
    };
    // Where its text came from: a link anyone can open to check it (one it was read in with, else typed here).
    const link = el("input", { part: "text-field", type: "url", inputmode: "url", maxlength: 500, placeholder: "https://", value: typeof text.source?.url === "string" ? text.source.url : "" });
    let level = null;
    const levels = el("div", { class: "lx-levels", role: "group", "aria-label": t("explore.share.level") },
      ["", ...LEVELS].map((value) => el("button", { type: "button", class: "lx-level", "data-value": value, "aria-pressed": String(value === ""), "aria-label": value ? value : t("explore.share.anyLevel") }, value || t("explore.share.any"))));
    levels.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      level = button.dataset.value || null;
      for (const one of levels.children) one.setAttribute("aria-pressed", String(one === button));
    });
    const picked = new Set();
    const chips = topics.map((topic) => {
      const chip = el("button", { type: "button", class: "lx-chip", "aria-pressed": "false", "data-topic": topic.id }, icon("check"), el("span", {}, topic.name));
      chip.addEventListener("click", () => {
        if (picked.has(topic.id)) picked.delete(topic.id);
        else if (picked.size >= 3) return status.replaceChildren(t("explore.share.tooMany"));
        else picked.add(topic.id);
        chip.setAttribute("aria-pressed", String(picked.has(topic.id)));
        status.replaceChildren();
      });
      return chip;
    });
    // The layers on this device that go with it, each its own switch (on): they're shared as its sharer's own work.
    const layerSwitches = Object.keys(weaves).map((to) => ui.switchRow({ title: t("explore.shareBook.layer", { language: languageName(to) }), sub: t("explore.shareBook.layerSub"), checked: true }));
    const go = ui.button(t("explore.shareBook.go"), { variant: "go", size: "lg", block: true });
    let sending = false;
    go.addEventListener("click", async () => {
      if (sending) return;
      if (!rights) return status.replaceChildren(t("explore.shareBook.sayRights"));
      if (rights === "open" && !credit.value.trim()) return status.replaceChildren(t("explore.shareBook.sayCredit"));
      if (!link.value.trim()) return status.replaceChildren(t("explore.shareBook.sayLink"));
      const url = linkOf(link.value);
      if (!url) return status.replaceChildren(t("explore.shareBook.badLink"));
      sending = true;
      status.replaceChildren();
      try {
        if (!(await termsFirst(body, { from: go }))) return;
        const name = licenceName(licence);
        const said = credit.value.trim();
        const book = {
          ...text,
          title: title.value.trim() || text.title,
          rights: rights === "pd" ? { us: true, eu: true, basis: "Said by whoever shared it: in the public domain in the US and the EU." } : { us: false, eu: false, spdx: licence, licence: name, attribution: [{ role: "author", name: said }], attributionText: said },
          source: { ...(text.source ?? {}), kind: "web", url },
        };
        const layers = Object.values(weaves).filter((_, i) => layerSwitches[i]?.querySelector("input")?.checked);
        const response = await fetch("/api/community/books/share", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ book, layers, title: title.value.trim() || undefined, about: about.value.trim() || undefined, level, topics: [...picked] }),
        });
        const answer = await response.json().catch(() => ({}));
        if (answer.shared) {
          justShared = answer.id;
          return replaceRoute(bookLink(answer.id, from));
        }
        // The same text in Explore already: its page when it opens for you (one waiting for an admin, or hidden, is its sharer's alone).
        const twin = twinOf(answer);
        if (twin) {
          const open = await api(`/api/community/books/${encodeURIComponent(twin)}`).then(() => true, () => false);
          return status.replaceChildren(...(open ? [t("explore.shareBook.twin"), " ", el("a", { href: bookLink(twin, from) }, t("explore.shareBook.openPage"))] : [t("explore.shareBook.twinWaiting")]));
        }
        status.replaceChildren(refusalOf(answer));
      } catch {
        status.replaceChildren(t("explore.share.unreachable"));
      } finally {
        sending = false;
      }
    });
    const part = (heading, note, ...children) => el("section", { class: "lx-stack lx-share-part" }, el("h2", { part: "group-label" }, heading), note ? el("p", { part: "group-note" }, note) : null, ...children);
    body.replaceChildren(
      ...[
        ui.pageTitle(t("explore.shareBook.title"), t("explore.shareBook.sub")),
        el(
          "div",
          { class: "lx-share-head" },
          el("span", { class: "lx-book-mini lx-share-book-cover" }, ui.bookCover({ title: entry.title, by: authorOf(text) || undefined, seed: entry.id, lang: entry.lang })),
          el("label", { part: "field" }, t("explore.shareBook.name"), title),
        ),
        rightsPick,
        openPart,
        neither,
        part(t("explore.shareBook.where"), t("explore.shareBook.whereNote", { libraries: new Intl.ListFormat(undefined, { type: "conjunction" }).format(KNOWN) }), link),
        el("label", { part: "field" }, t("explore.share.about"), about),
        part(t("explore.share.level"), null, levels),
        part(t("explore.share.topics"), t("explore.shareBook.topicsNote"), el("div", { class: "lx-chips", role: "group", "aria-label": t("explore.share.topics") }, chips)),
        layerSwitches.length ? part(t("explore.shareBook.layers"), null, el("ul", { part: "list" }, layerSwitches)) : null,
        ui.pinnedActions([go], { status }),
      ].filter(Boolean),
    );
  };

  const load = async () => {
    try {
      const [entries, langs, mine, topics] = await Promise.all([store.listBooks(), store.weaveLanguages(), api("/api/community/books/mine"), api("/api/community/topics")]);
      if (stale) return;
      const entry = entries.find((e) => e.id === textId);
      if (!entry || !isYours(entry)) return body.replaceChildren(ui.emptyState(t("explore.shareBook.notYours"), { pose: "shrug", art: "empty-books" }));
      const already = mine.find((b) => b.sourceId === textId && b.state !== "removed");
      if (already) {
        return body.replaceChildren(
          ui.pageTitle(entry.title, t("explore.shareBook.already")),
          ui.button(t("explore.shareBook.openPage"), { variant: "go", size: "lg", block: true, onclick: () => replaceRoute(bookLink(already.id, from)) }),
        );
      }
      if (entry.pictures?.length) return body.replaceChildren(ui.emptyState(t("explore.yours.bookPictures"), { pose: "shrug", art: "empty-books" }));
      const text = (await store.getBook(textId))?.text;
      if (!text) return body.replaceChildren(ui.emptyState(t("explore.shareBook.notYours"), { pose: "shrug", art: "empty-books" }));
      const weaves = {};
      for (const to of langs.get(textId) ?? []) {
        const weave = await store.getWeave(textId, to);
        if (weave) weaves[to] = weave;
      }
      if (!stale) form(entry, text, weaves, topics);
    } catch (error) {
      if (!stale) body.replaceChildren(ui.loadFailed(error, load, { offline: t("explore.share.offline") }));
    }
  };
  load();
  return { title: "Explore", back, dispose: () => (stale = true) };
}

/**
 * A link as the server takes one (community-books.ts sourceUrlOf): http or https, a host with a dot, no name or password in it. One typed
 * without its https:// gets it. Null when it isn't a link.
 */
function linkOf(typed) {
  const text = String(typed).trim();
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** The id of the book in Explore with the same text, when that's why a share was refused (community-books.ts twinOf's words), or null. */
const twinOf = (answer) => (answer.errors ?? []).map((e) => /\(([a-z0-9][a-z0-9-]{1,90})\), already in Explore/.exec(e.message)?.[1]).find(Boolean) ?? null;

/**
 * Why a share was refused, in the form's own words where it asks the question (the server's name each field as its format does): on the
 * shelf already, the link, its pictures; anything else as the server says it, less any id or tool's name in brackets.
 */
function refusalOf(answer) {
  const errors = answer.errors ?? [];
  const said = errors.map((e) =>
    e.at === "book.rights" ? t("explore.shareBook.sayRights") :
    e.at === "book.source" ? t("explore.shareBook.badLink") :
    e.at === "book.pictures" ? t("explore.yours.bookPictures") :
    /on Lexicommons' shelf already/.test(e.message) ? t("explore.shareBook.onShelf") :
    e.message.replace(/\s*\((?:[a-z0-9]+[-_][a-z0-9_-]*)\)/g, ""),
  );
  return [...new Set(said)].join(" ") || answer.error || t("explore.shareBook.failed");
}

const licenceName = (spdx) => LICENCES.find(([id]) => id === spdx)?.[1] ?? spdx;
