// Everyday Dutch's own page (#know/everyday/words), what its card on the Knowledge page opens: the language's 1,000 commonest words in order,
// set as a page the way the card sets its first 100, yours in ink and the rest blank, each blank as long as its word. A word is yours when
// you understand it well (summary.js understood: right again on a later day, or in your word bank). At 1,000 it reads in blocks of 100, each
// headed by how many of its words are yours: what you read, so no press. Each block inks in once as you come to it; with animations off it's
// simply there. The share of everyday speech you'd follow leads; the way forward is learning the next ones;
// the list's credit is one quiet row at the foot that opens it in a sheet (know/ui.js creditRow, as the Knowledge page's foot has).

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { t, formatNumber, languageLabel } from "../lx/i18n.js";
import { symbol } from "../lx/symbols.js";
import * as motion from "../lx/motion.js";
import { learning } from "../study/learning.js";
import { loadFrequency, onFrequency } from "../study/frequency.js";
import { evidenceVersion } from "../study/progress.js";
import { bankWords } from "../read/bank.js";
import { everydayShare, wordStrip } from "./summary.js";
import { creditRow, percent, wideButton } from "./ui.js";

export const WORDS = 1000;
const BLOCK = 100;
/** Once, when node is half on the screen: its words ink in, in order, over about 0.6 s. With animations off they're simply there. */
function inkIn(node, words) {
  const show = () => words.forEach((word) => word.removeAttribute("data-blank"));
  if (!motion.motionOn() || !words.length) return show();
  for (const word of words) word.setAttribute("data-blank", "");
  const seen = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      seen.disconnect();
      const start = performance.now();
      const step = Math.min(0.02, 0.6 / words.length);
      const tick = (now) => {
        const time = Math.max(0, (now - start) / 1000);
        words.forEach((word, n) => word.toggleAttribute("data-blank", time < n * step));
        if (time < words.length * step && node.isConnected) requestAnimationFrame(tick);
        else show();
      };
      requestAnimationFrame(tick);
    },
    // As soon as any of it is clear of the tab bar: never a block shown in its before-state.
    { threshold: 0, rootMargin: "0px 0px -96px 0px" },
  );
  seen.observe(node);
}

/** A hundred of the commonest words: its head (where it runs, how many are yours), then the words as a page. */
function block(cells, start, lang) {
  const mine = cells.filter((cell) => cell.yours).length;
  const inked = [];
  const words = cells.map((cell) => {
    const word = el("span", { class: cell.yours ? "lx-common-word" : "lx-common-gap", "aria-hidden": cell.yours ? undefined : "true" }, cell.lemma);
    if (cell.yours) inked.push(word);
    return word;
  });
  const page = el(
    "p",
    { part: "common-page", lang, "aria-label": t("know.everydayPage.blockLabel", { count: mine, from: start + 1, to: start + cells.length }) },
    words.flatMap((word, i) => (i ? [" ", word] : [word])),
  );
  inkIn(page, inked);
  const head = el(
    "h2",
    { part: "hundred-head" },
    el("span", { class: "lx-hundred-range" }, t("know.everydayPage.range", { from: formatNumber(start + 1), to: formatNumber(start + cells.length) })),
    el("span", { class: "lx-hundred-count" }, t("know.everydayPage.yoursOf", { count: mine, of: cells.length })),
  );
  return el("section", { part: "hundred", "aria-label": t("know.everydayPage.range", { from: formatNumber(start + 1), to: formatNumber(start + cells.length) }) }, head, page);
}

/** Renders Everyday's page into `page`. */
export function renderEveryday(page) {
  const lang = learning();
  const title = t("know.everyday.title", { language: languageLabel(lang) });
  let stamp = "";
  const stampOf = (now) => [evidenceVersion(), bankWords(lang).length, Math.floor(now / 3_600_000), lang].join("|");
  const draw = () => {
    const now = Date.now();
    const said = new Set(bankWords(lang));
    const strip = wordStrip({ lang, now, size: WORDS, said });
    stamp = stampOf(now);
    if (!strip) {
      page.replaceChildren(ui.pageTitle(title), ui.emptyState(t("know.everydayPage.noList"), { pose: "lounge" }));
      return;
    }
    // The list is here (a strip), so the share is too.
    const share = everydayShare({ lang, now });
    const head = el("div", { class: "lx-know-stat-block" }, el("span", { class: "lx-know-n" }, percent(share.share)), symbol("words-q", { size: 30 }), el("span", { class: "lx-know-label" }, t("know.everyday.label")));
    const madeOf = el("p", { class: "lx-know-line" }, t("know.everydayPage.madeOf", { count: strip.counts.yours, of: strip.size }));
    const next = wideButton(t("know.map.learnNext"), { variant: "go", size: "lg", onclick: () => (location.hash = "#study/session/frequent?from=know") });
    const blocks = [];
    for (let start = 0; start < strip.cells.length; start += BLOCK) blocks.push(block(strip.cells.slice(start, start + BLOCK), start, lang));
    page.classList.add("lx-everyday-page");
    page.replaceChildren(
      ui.pageTitle(title),
      el("div", { class: "lx-everyday-top" }, head, madeOf, el("p", { class: "lx-know-caption" }, t("know.everydayPage.inkMeans"))),
      next,
      el("div", { class: "lx-hundreds" }, blocks),
      ...[creditRow(lang)].filter((row) => row !== null),
    );
  };
  draw();
  // The list arrives in the background on a first visit (it's fetched once, then kept).
  loadFrequency(lang);
  const stop = onFrequency((which) => which === lang && draw());
  return {
    title,
    back: { href: "#know/everyday", label: t("know.yourWords.back") },
    dispose: stop,
    refresh: () => stampOf(Date.now()) !== stamp && draw(),
  };
}
