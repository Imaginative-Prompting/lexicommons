// The ideas you've met, every one (#know/ideas), from the Knowledge page's Ideas card: each its name and how well you know it, then the idea
// drawn on a sentence of yours, the least known first; each opens its sheet, as on the card. Under them, Still to come: the rest of the
// language's ideas (its grammar as this device has it), in the order to learn them, each a row opening the same sheet.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { t } from "../lx/i18n.js";
import { learning } from "../study/learning.js";
import { LANGUAGES } from "../lang/index.js";
import { ITEMS, sentence as itemSentence, sentenceUnits } from "../study/content.js";
import { conceptSheet } from "../study/after-answer.js";
import { suggestWay } from "../explore/suggest-way.js";
import { ideaCards, ideasNotes, ideasNotesRead } from "./cards-more.js";

/** A language's ideas in the order to learn them: each after the first idea it builds on (`after`), the rest as they come. */
function learnOrder(patterns) {
  const ids = Object.keys(patterns);
  const children = new Map(ids.map((id) => [id, []]));
  const roots = [];
  for (const id of ids) {
    const parent = (patterns[id].after ?? []).find((other) => other !== id && children.has(other));
    if (parent) children.get(parent).push(id);
    else roots.push(id);
  }
  const out = [];
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
    for (const child of children.get(id)) walk(child);
  };
  for (const id of roots) walk(id);
  for (const id of ids) walk(id);
  return out;
}

// An idea's first sentence: what it is, in a line.
const firstSentence = (text = "") => /^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text;

/** The ideas still to come: the language's ideas not met yet, in the order to learn them, each opening its sheet (with a sentence that has
 * it, when one does). */
function stillToCome(lang, met) {
  const patterns = LANGUAGES[lang]?.patterns ?? {};
  const rows = learnOrder(patterns)
    .filter((id) => !patterns[id].retired && !met.has(`p:${id}`))
    .map((id) => {
      const unit = `p:${id}`;
      const open = () => {
        const item = ITEMS.find((it) => sentenceUnits(it).includes(unit)) ?? null;
        conceptSheet(unit, { item: item ?? undefined, sentence: item ? itemSentence(item) : undefined, extra: suggestWay(unit) });
      };
      return ui.listRow({ title: patterns[id].name, sub: firstSentence(patterns[id].about) || undefined, onclick: open, opens: "sheet" });
    });
  return rows.length ? ui.group(t("know.ideas.toCome", { count: rows.length }), rows) : null;
}

/** Renders every idea you've met into `page`, and the ones still to come. */
export function renderIdeas(page) {
  const lang = learning();
  let withNotes = false; // whether the cards on the page were drawn with the packs' notes read
  const draw = () => {
    withNotes = ideasNotesRead();
    const ideas = ideaCards({ lang, now: Date.now() });
    const toCome = stillToCome(lang, new Set(ideas.rows.map((row) => row.unit)));
    if (!ideas.rows.length) {
      page.replaceChildren(el("div", { class: "lx-ideas-page" }, ui.pageTitle(t("know.ideas.title")), ui.emptyState(t("know.ideas.none"), { pose: "page" }), toCome));
      return;
    }
    const list = el("div", { class: "lx-idea-cards" }, ideas.rows.map(ideas.card));
    ideas.arrive(list, { every: true });
    page.replaceChildren(el("div", { class: "lx-ideas-page" }, ui.pageTitle(t("know.ideas.title"), t("know.ideas.count", { count: ideas.rows.length })), list, toCome));
  };
  draw();
  // Drawn at once, so the page is there in its first frame. Each card is drawn on the sentence the packs' notes mark: opened straight at this page,
  // before anything read them, it's drawn again once they're read.
  if (!withNotes) ideasNotes().then(() => page.isConnected && !withNotes && draw());
  return { title: t("know.ideas.title"), back: { href: "#know", label: t("know.week.back") }, refresh: draw };
}
