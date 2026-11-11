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
      // A long word or phrase takes two of a shelf's three places: on a phone (cells ~119 px) a word over 9 letters or a meaning over 22; on a
      // tablet or wider (the 720 column's cells ~240 px, know.css) only one over 18 letters or 44, so a shelf holds three words there.
      "data-wide": writtenName(unit).length > 9 || meaning.length > 22 ? "" : undefined,
      "data-long": writtenName(unit).length > 18 || meaning.length > 44 ? "" : undefined,
      "aria-haspopup": "dialog",
      onclick: () => openUnitSheet(unit),
    },
    el("span", { class: "lx-tile-face" }, ui.wordLabel(shownName(unit), lang)),
    meaning ? el("span", { class: "lx-tile-means", lang: "en" }, meaning) : null,
  );
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
  const draw = () => {
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
      if (units.length <= SHOWN) return [grid];
      const more = wideButton(t("know.yourWords.showAll", { count: units.length }), {
        variant: "fade",
        onclick: () => {
          grid.append(...units.slice(SHOWN).map((unit) => item(unit, lang, opts)));
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
