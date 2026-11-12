// Your words (#know/words), the page the Knowledge page's pile opens: every word and phrase you'd recall as the pile's own tiles, standing on
// shelves by when you met them (this week, last week, then by month), each with what it means under the shelf's edge, and the ones you're
// still learning after them, in outline. A tile opens its word in a sheet.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { wideButton } from "./ui.js";
import { t, formatNumber, formatDate } from "../lx/i18n.js";
import { describe, shownName, writtenName } from "../study/content.js";
import { studiedUnits, unitState } from "../study/progress.js";
import { learning } from "../study/learning.js";
import { withoutAccents } from "../lang/index.js";
import { openUnitSheet, paintOf, recalledUnits } from "./cards.js";

const DAY = 86_400_000;
const SHOWN = 12; // a shelf's tiles before Show all: four rows, so the words you're still learning are a short scroll away

/** A word's first meaning, as its sheet leads with. */
const meaningOf = (unit) => {
  const en = describe(unit).en;
  return en ? String(en).split(";")[0].trim() : "";
};

/** A word on its shelf: its tile (the pile's own, standing on the shelf's line) and under the line, what it means. */
function item(unit, lang, { learning: still = false } = {}) {
  const meaning = meaningOf(unit);
  return el(
    "button",
    {
      type: "button",
      part: "word-tile",
      "data-paint": still ? undefined : paintOf(unit),
      "data-still": still ? "" : undefined,
      // How many of the shelf's places it takes is measured once the shelf is laid out (fitTiles, below).
      "aria-haspopup": "dialog",
      onclick: () => openUnitSheet(unit),
    },
    el("span", { class: "lx-tile-face" }, ui.wordLabel(shownName(unit), lang)),
    meaning ? el("span", { class: "lx-tile-means", lang: "en" }, meaning) : null,
  );
}

// ---------- a tile's places, by measure ----------
// A tile takes the fewest of its shelf's places whose width holds its word on one line and its meaning in its two, measured in the page.
// (12 Nov 2026: counted by letters, a word over 9 took two places, tuned for a 390 phone's ~119 px cells; Burmese's လက်ဖက်ရည် (tea) is 9
// letters drawn far wider than 9 Latin ones, and ran off a 320 screen, whose cells are ~90 px.) A shelf is measured once it's laid out, so a
// page kept off-screen and a month that opens later are measured when they arrive, again when its width changes, and when Show all adds tiles.

/** The width a node's text is laid out at (one line: a tile's face doesn't wrap). Its real shaping: Myanmar's marks, a word's reading over it. */
function laidOutWidth(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getBoundingClientRect().width;
}
let measuring = null;
const widthOf = (text, font) => {
  measuring ??= document.createElement("canvas").getContext("2d");
  measuring.font = font;
  return measuring.measureText(text).width;
};
/** The narrowest width that holds a meaning in two lines, where its line is cut (know.css .lx-tile-means): its best place to break. */
function meaningWidth(node) {
  const words = node.textContent.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const font = getComputedStyle(node).font;
  const space = widthOf(" ", font);
  const widths = words.map((word) => widthOf(word, font));
  const line = (from, to) => widths.slice(from, to).reduce((sum, width) => sum + width, 0) + space * Math.max(0, to - from - 1);
  let best = line(0, words.length);
  for (let at = 1; at < words.length; at++) best = Math.min(best, Math.max(line(0, at), line(at, words.length)));
  return best;
}
/** Sets each of a shelf's tiles to the places it needs (data-span 2 or 3; one by default). Every width read first, then every span set. */
export function fitTiles(grid) {
  const width = grid.clientWidth;
  if (!width || !grid.isConnected) return;
  const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 3;
  const cell = width / columns;
  const tiles = [...grid.querySelectorAll(':scope > [data-part="word-tile"]')];
  const needs = tiles.map((tile) => {
    const face = tile.querySelector(".lx-tile-face");
    const means = tile.querySelector(".lx-tile-means");
    const around = (style) => parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    // A face may give up half its padding (13 px a side, know.css) before its tile needs another place: "gisteren" at 320 keeps one, as it
    // always looked right with 9 px a side; a word wider than that takes two.
    const word = face ? laidOutWidth(face) + around(getComputedStyle(face)) / 2 : 0;
    return Math.max(word, means ? meaningWidth(means) : 0) + around(getComputedStyle(tile));
  });
  tiles.forEach((tile, i) => {
    // (A hair over a cell is still one: a width read to a fraction of a pixel.)
    const span = Math.min(columns, Math.max(1, Math.ceil(needs[i] / cell - 0.01)));
    const value = span > 1 ? String(span) : null;
    if (tile.getAttribute("data-span") !== value) value ? tile.setAttribute("data-span", value) : tile.removeAttribute("data-span");
  });
}

/** Which shelf a day goes on: this week, last week, else its month. */
function shelfOf(at, now) {
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / DAY);
  if (days < 7) return { key: "week0", label: t("know.yourWords.thisWeek") };
  if (days < 14) return { key: "week1", label: t("know.yourWords.lastWeek") };
  const d = new Date(at);
  return { key: `m${d.getFullYear()}-${d.getMonth()}`, label: formatDate(d, { month: "long", year: d.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" }) };
}

export function renderYourWords(page, { at = null } = {}) {
  const lang = learning();
  // Each shelf measured as it's laid out and whenever its width changes (fitTiles): before it's painted, so a tile is never seen too narrow.
  const fitting = new ResizeObserver((entries) => entries.forEach((entry) => fitTiles(entry.target)));
  const draw = () => {
    fitting.disconnect();
    const now = Date.now();
    const rows = recalledUnits(lang, now);
    const known = new Set(rows.map((row) => row.unit));
    const still = studiedUnits(lang).filter((unit) => (unit.startsWith("w:") || unit.startsWith("c:")) && !known.has(unit) && !unitState(unit, { lang, now }).isNew);
    if (!rows.length && !still.length) {
      page.replaceChildren(ui.pageTitle(t("know.yourWords.title")), ui.emptyState(t("know.words.none"), { pose: "page" }));
      return;
    }
    // Newest shelf first; on each, the newest first.
    const shelves = new Map();
    for (const row of [...rows].reverse()) {
      const shelf = shelfOf(row.first, now);
      if (!shelves.has(shelf.key)) shelves.set(shelf.key, { label: shelf.label, units: [] });
      shelves.get(shelf.key).units.push(row.unit);
    }
    // A shelf's tiles, a page of them at a time: past SHOWN, the rest open in place.
    const tilesOf = (units, opts) => {
      const grid = el("div", { class: "lx-shelf-tiles" }, units.slice(0, SHOWN).map((unit) => item(unit, lang, opts)));
      fitting.observe(grid);
      if (units.length <= SHOWN) return [grid];
      const more = wideButton(t("know.yourWords.showAll", { count: units.length }), {
        variant: "fade",
        onclick: () => {
          grid.append(...units.slice(SHOWN).map((unit) => item(unit, lang, opts)));
          fitTiles(grid);
          more.remove();
        },
      });
      return [grid, more];
    };
    // The newest shelves stand open; an older month is a row that opens in place, with its first few words to say what's on it.
    const shelf = (label, units, { open = true, counted = true, key, ...opts } = {}) => {
      const body = el("div", { class: "lx-shelf-body" });
      const head = open
        ? el("h2", { class: "lx-shelf-label" }, label, counted ? el("span", { class: "lx-shelf-count" }, formatNumber(units.length)) : null)
        : el(
            "button",
            {
              type: "button",
              class: "lx-shelf-row",
              "aria-expanded": "false",
              onclick: () => {
                const opening = head.getAttribute("aria-expanded") !== "true";
                head.setAttribute("aria-expanded", String(opening));
                body.replaceChildren(...(opening ? tilesOf(units, opts) : []));
              },
            },
            el("span", { class: "lx-shelf-label" }, label, el("span", { class: "lx-shelf-count" }, formatNumber(units.length))),
            el("span", { class: "lx-shelf-peek", lang }, units.slice(0, 6).map((unit) => writtenName(unit)).join(" · ")),
          );
      if (open) body.append(...tilesOf(units, opts));
      return el("section", { part: "word-shelf", "aria-label": label, "data-shelf": key }, head, body);
    };
    const list = [...shelves.entries()];
    const board = el("div", { class: "lx-shelves", lang });
    // The recent shelves stand open; then the words you're still learning, open too, so the ones to work on are a short scroll away; then the
    // older months, each a row that opens in place.
    const opens = (key, i) => key === "week0" || key === "week1" || i === 0 || (i === 1 && list.length === 2);
    list.forEach(([key, s], i) => opens(key, i) && board.append(shelf(s.label, s.units, { key, open: true })));
    if (still.length) board.append(shelf(t("know.yourWords.stillLearning"), still, { key: "learning", open: true, learning: true }));
    list.forEach(([key, s], i) => !opens(key, i) && board.append(shelf(s.label, s.units, { key, open: false })));
    // Find one: by the word or by what it means, any of yours, past accents and case.
    const everything = [...rows.map((row) => row.unit).reverse(), ...still];
    const plain = (text) => withoutAccents(String(text ?? "").toLowerCase()).trim();
    const found = el("div", { class: "lx-shelves", lang, hidden: true });
    const field = el("input", { part: "text-field", type: "search", placeholder: t("know.yourWords.find"), "aria-label": t("know.yourWords.find"), autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "search" });
    field.addEventListener("input", () => {
      const q = plain(field.value);
      board.hidden = Boolean(q);
      found.hidden = !q;
      if (!q) return;
      found.querySelectorAll(".lx-shelf-tiles").forEach((grid) => fitting.unobserve(grid));
      const hits = everything.filter((unit) => plain(describe(unit).name).includes(q) || plain(meaningOf(unit)).includes(q));
      // The words that start with it first.
      hits.sort((a, b) => Number(!plain(describe(a).name).startsWith(q)) - Number(!plain(describe(b).name).startsWith(q)));
      found.replaceChildren(
        hits.length
          ? shelf(t("know.yourWords.found", { count: hits.length }), hits, { counted: false })
          : el("p", { class: "lx-shelf-none" }, t("know.yourWords.none")),
      );
    });
    page.classList.add("lx-shelves-page");
    page.replaceChildren(ui.pageTitle(t("know.yourWords.title"), t("know.yourWords.sub", { count: rows.length })), el("div", { class: "lx-shelves-find", role: "search" }, field), found, board);
  };
  draw();
  // Opened at a shelf (This week's "and N more": #know/words/week): there, until you touch or scroll the page yourself.
  if (at) {
    let held = true;
    for (const kind of ["pointerdown", "wheel", "keydown"]) page.addEventListener(kind, () => (held = false), { once: true, passive: true });
    const go = () => held && page.querySelector(`[data-shelf="${at}"]`)?.scrollIntoView({ block: "start" });
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 450);
  }
  return { title: t("know.yourWords.title"), back: { href: "#know", label: t("know.yourWords.back") }, refresh: draw };
}
