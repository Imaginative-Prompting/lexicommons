// Find a book (#read/find?q&level&kind): every book on the open shelf, searched by its title and its people, filtered by
// level and kind (shelf.js bookKinds), counted, and shown 40 at a time with a press for the next 40. It works on the
// catalog as this device last had it when there's no connection, and says so; a book already in your library opens
// from the device, and any other needs a connection to open.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { ownDrawingOf } from "./book-format.js";
import { OFFLINE_OPEN, asDrawn, bookKinds, coverOfMeta, kindOf, loadCatalog, opener } from "./shelf.js";
import { lookToast } from "../shell/look-watch.js";
import { learning, learningName } from "../study/learning.js";
import { readableBooks } from "./readable.js";
import * as store from "./store.js";

const PAGE = 40;
const routeOf = (hash) => String(hash ?? "").split("?")[0];

// Search is forgiving of case and accents: "kat" finds "Kat", "cafe" finds "café".
const plain = (text) => String(text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const people = (meta) => (meta.authors ?? []).map((a) => a.name).filter(Boolean);
const matches = (meta, q) => !q || plain(meta.title).includes(q) || people(meta).some((name) => plain(name).includes(q));

/** Its line in the list: who wrote it (an author), its level, its kind, its length. */
function lineOf(meta, kinds) {
  const author = (meta.authors ?? []).find((a) => (a.role ?? "author") === "author")?.name;
  const kind = kinds.find((k) => k.id === kindOf(meta));
  // A level and a length each stay on one line ("Level\u00a02", "4,450\u00a0words"): a line never ends on a lone number.
  return [author, meta.level ? `Level\u00a0${meta.level}` : null, kind && kind.id !== "other" ? kind.name.replace(/s$/, "") : null, meta.words ? `${meta.words.toLocaleString("en")}\u00a0words` : null]
    .filter(Boolean)
    .join(" · ");
}

/** A small cover for a row: the book's own picture, its own drawing, or its title cover (only its color shows this small). */
function thumbOf(meta) {
  const face = ui.bookCover(meta.cover ? coverOfMeta(meta) : { title: meta.title, seed: meta.id });
  const drawing = meta.cover ? null : ownDrawingOf(meta);
  if (drawing) asDrawn(face, drawing);
  return el("span", { class: "lx-read-thumb" }, face);
}

/**
 * Renders Find a book into `page`. open: hands a fetched book over to be kept and opened (library.js openRecord). Its
 * search, level and kind are in its address (#read/find?q&level&kind) for a reload or a link; changing one here changes the
 * address in place (the same history entry, so Back goes where it would have) and draws the list again, never the page.
 */
export function renderFind(page, { open, known } = {}) {
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const now = { q: (params.get("q") ?? "").trim(), level: params.get("level") ?? "", kind: params.get("kind") ?? "" };
  const { choose, status, stop } = opener({ open, known });
  const search = ui.searchField({ label: "Search the open books", value: now.q, onsubmit: (value) => go({ q: value.trim() }) });
  const filters = el("div", { class: "lx-inline-form lx-read-filters" });
  const count = el("p", { class: "lx-small lx-muted lx-read-count", role: "status" });
  const list = el("ul", { part: "list", class: "lx-read-found" });
  const more = el("div", { class: "lx-read-more" });
  const note = el("p", { class: "lx-small lx-muted lx-read-note" });
  // None for the language you're learning: said first, with Tinta waiting on a box (read/shelf.js says the same on Read).
  const none = el("div", { class: "lx-read-none-yet", hidden: true });
  // data-for: the address it's drawn for, and data-ready once it's drawn (for checks: pages slide, so two can be here).
  const body = el("div", { class: "lx-stack lx-read-findpage", "data-for": location.hash }, ui.pageTitle("Find a book"), none, search, filters, note, count, list, more, status);
  page.replaceChildren(body);
  let stale = false;
  let layer = null;
  let draw = () => {};
  const addressOf = ({ q, level, kind }) => {
    const next = new URLSearchParams(Object.entries({ q, level, kind }).filter(([, value]) => value));
    return `#read/find${next.size ? `?${next}` : ""}`;
  };
  function go(change) {
    Object.assign(now, change);
    const input = search.querySelector("input");
    if (input && input.value.trim() !== now.q) input.value = now.q;
    history.replaceState(history.state, "", addressOf(now));
    // From the top of what's found (the filters are above it).
    const scroller = body.closest('[data-part="page"]');
    if (scroller && scroller.scrollTop > body.offsetTop + list.offsetTop) scroller.scrollTop = 0;
    draw();
  }
  // An address for this page from elsewhere (a link to #read/find while it's here, which the shell keeps as this page):
  // followed in place too.
  const follow = () => {
    if (routeOf(location.hash) !== "#read/find" || location.hash === body.dataset.for) return;
    const next = new URLSearchParams(location.hash.split("?")[1] ?? "");
    go({ q: (next.get("q") ?? "").trim(), level: next.get("level") ?? "", kind: next.get("kind") ?? "" });
  };
  addEventListener("hashchange", follow);
  (async () => {
    let catalog;
    try {
      catalog = await loadCatalog();
    } catch {
      if (!stale) count.replaceChildren("Finding a book needs a connection the first time. Once you've been online, it works here without one.");
      body.dataset.ready = "";
      return;
    }
    if (stale) return;
    const kinds = bookKinds();
    const all = catalog.books ?? [];
    // What it finds: the books you can read (readable.js, as Home and Read count them); the other languages' only when that kind is asked for,
    // or when none is for the language you're learning: then the other languages' are what it offers, and it says so first.
    const readable = readableBooks(catalog, learning());
    const others = !readable.length && all.length > 0;
    const offered = others ? all : readable;
    const mine = new Set((await store.listBooks().catch(() => [])).map((book) => book.id));
    if (stale) return;
    if (others) {
      none.replaceChildren(ui.emptyState(`No books in ${learningName()} yet. These are free to read in other languages.`, { pose: "box" }));
      none.hidden = false;
    }
    search.querySelector("input")?.setAttribute("placeholder", `Search ${offered.length.toLocaleString("en")} ${offered.length === 1 ? "book" : "books"}`);
    if (catalog.kept) note.replaceChildren("Offline: these are the books as they were when you were last online. A book in your library opens; any other needs a connection.");
    // The filters: a sheet each, with only what's there to pick (the levels of the books it can show, as its search counts them).
    const levelsOf = (books) => [...new Set(books.map((meta) => meta.level).filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
    const present = kinds.filter((k) => all.some(k.has));
    const choose1 = (label, options, value, key) => {
      layer?.lxClose({ animate: false });
      layer = ui.sheetLayer({ label });
      layer.lxBody.replaceChildren(
        el("h2", { class: "lx-sheet-title" }, label),
        el(
          "ul",
          { part: "list" },
          options.map(([v, name]) =>
            ui.radioRow({
              title: name,
              name: `find-${key}`,
              value: v,
              checked: v === value,
              onchange: () => {
                layer.lxClose();
                go({ [key]: v });
              },
            }),
          ),
        ),
      );
      layer.lxOpen();
    };
    // A filter's button says what it's set to ("Level 2"), or what it is while it's any.
    const filter = (label, options, value, key) => {
      const picked = value ? options.find(([v]) => v === value)?.[1] : null;
      const button = ui.button(picked ?? `${label}: Any`, { size: "sm", icon: "sliders", onclick: () => choose1(label, options, value, key) });
      button.setAttribute("aria-label", `${label}: ${picked ?? "Any"}`);
      if (picked) button.setAttribute("data-set", "");
      return button;
    };
    const row = (meta) => {
      const item = ui.listRow({
        art: thumbOf(meta),
        // In its own language and direction, so a right-to-left title sits whole in a left-to-right list.
        title: el("bdi", { lang: meta.lang }, meta.title),
        sub: [mine.has(meta.id) ? "In your library" : null, lineOf(meta, kinds)].filter(Boolean).join(" · "),
        onclick: () => {
          if (mine.has(meta.id)) return void (location.hash = `#read/book/${encodeURIComponent(meta.id)}`);
          // Known offline: said at once. A kept catalog alone may be a server's hiccup, so it tries (and says why if it can't).
          if (navigator.onLine === false) return void lookToast("wrong", OFFLINE_OPEN);
          choose(meta, item);
        },
      });
      item.setAttribute("data-book", meta.id);
      return item;
    };
    draw = () => {
      const { q, level, kind } = now;
      const pool = kind === "other" || others ? all : readable;
      const levels = levelsOf(kind ? pool.filter((meta) => kindOf(meta) === kind) : pool);
      filters.replaceChildren(
        ...(levels.length ? [filter("Level", [["", "Any"], ...levels.map((n) => [String(n), `Level ${n}`])], level, "level")] : []),
        ...(present.length > 1 ? [filter("Kind", [["", "Any"], ...present.map((k) => [k.id, k.name])], kind, "kind")] : []),
      );
      // What's found: by its title, ones already in your library first.
      const needle = plain(q);
      const found = pool
        .filter((meta) => matches(meta, needle) && (!level || String(meta.level) === level) && (!kind || kindOf(meta) === kind))
        .sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)) || (a.title < b.title ? -1 : 1));
      let shown = 0;
      list.replaceChildren();
      const showMore = () => {
        const next = found.slice(shown, shown + PAGE);
        list.append(...next.map(row));
        shown += next.length;
        count.replaceChildren(
          found.length ? `${found.length.toLocaleString("en")} ${found.length === 1 ? "book" : "books"}${found.length > shown ? `, the first ${shown.toLocaleString("en")} here` : ""}` : q || level || kind ? "No book here has that." : "No open books yet.",
        );
        more.replaceChildren(
          ...(found.length > shown
            ? [ui.button(`Show ${Math.min(PAGE, found.length - shown)} more`, { block: true, onclick: () => showMore() })]
            : !found.length && (q || level || kind)
              ? [ui.button("Show every book", { onclick: () => go({ q: "", level: "", kind: "" }) })]
              : []),
        );
      };
      showMore();
      body.dataset.for = addressOf(now);
    };
    draw();
    body.dataset.ready = "";
  })();
  return {
    title: "Find a book",
    back: { href: "#read", label: "Read" },
    dispose: () => {
      stale = true;
      removeEventListener("hashchange", follow);
      stop();
      layer?.lxClose({ animate: false });
    },
  };
}
