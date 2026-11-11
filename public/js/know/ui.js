// Builders for Today's and the Knowledge page's own parts (the theming surface's "Knowledge" group in lx/parts.js;
// styles in css/lx/know.css). They take numbers, words and links, so /design shows them with sample data and the pages
// fill them from the scheduler (know/summary.js).

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { symbol, SYMBOL_NAMES } from "../lx/symbols.js";
import { edge } from "../lx/edge.js";
import { formatDate, formatList, formatNumber, intlLocale, languageLabel, t } from "../lx/i18n.js";
import { frequencyCredit } from "../study/frequency.js";

const go = (href) => () => (location.hash = href);

/** Puts parts into a node, leaving out the optional ones that are null or false (replaceChildren would show "null"). */
export const fill = (node, ...parts) => node.replaceChildren(...parts.filter((part) => part !== null && part !== undefined && part !== false));

/** A Knowledge page's full-width button: one line at the usual sizes, its words wrapping where large text needs it, never
 * past the screen (know.css lx-know-wrap). Takes ui.button's options; block is always on. */
export function wideButton(label, options = {}) {
  const button = ui.button(label, { ...options, block: true });
  button.classList.add("lx-know-wrap");
  return button;
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export const ordinal = (n) => {
  return t("know.ordinal", { n });
};

/** A share as a percentage: whole numbers, with one decimal under 10% so a start isn't shown as nothing. */
export const percent = (share) => formatNumber(share, { style: "percent", maximumFractionDigits: share > 0 && share < 0.1 ? 1 : 0 });

/**
 * Today's next step: one card with its action low, in reach. variant: session · reading · practice · new.
 * action: { label, icon, href } ({ label, held: true }: its place held, below); focus: [[text, meaning]] (the concepts a session will practice); steps:
 * the session's preview ([{ icon, meaning, label }]); secondary: { text, href }, a smaller other way ({ held: true }: its place held, heldOther). A card
 * whose words are on their way (Home's card while the language's lessons come): title and meta as held lines (heldText), and label the card's name
 * meanwhile.
 */
export function nextStep({ variant = "session", kicker, title, meta, focus = [], steps = [], action, secondary, art = null, calm = false, label }) {
  const head = el(
    "div",
    { class: "lx-stack lx-next-head" },
    kicker ? el("p", { class: "lx-next-kicker" }, kicker) : null,
    el("h2", {}, title),
    meta ? el("p", { class: "lx-muted lx-next-meta" }, typeof meta === "string" ? meta.split(" · ").map((bit) => el("span", {}, bit)) : meta) : null,
  );
  const card = el(
    "section",
    { part: "next-step", variant, "aria-label": label ?? (typeof title === "string" ? title : title?.textContent || undefined), "aria-busy": action?.held ? "true" : undefined, "data-stub": secondary ? "" : undefined },
    el("div", { class: "lx-next-top" }, head, art ? el("div", { class: "lx-next-art", "aria-hidden": "true" }, art) : null),
    steps.length ? el("ol", { part: "session-preview", "aria-label": t("know.whatsInIt") }, steps.map((step) => el("li", { part: "preview-step", meaning: step.meaning ?? undefined, title: step.label }, icon(step.icon)))) : null,
    focus.length ? el("p", { class: "lx-qs-focus" }, focus.map(([text, meaning, lang]) => ui.conceptTag(text, meaning, { lang }))) : null,
    action?.held ? heldAction(action.label) : action ? ui.button(action.label, { variant: calm ? "calm" : "go", size: "lg", block: true, onclick: go(action.href) }) : null,
    secondary?.held ? heldOther() : secondary ? nextOther(secondary) : null,
  );
  // The other way forward comes out from under the card's foot: one drawn line round the card and its stub, measured from what's in it.
  const other = card.querySelector(":scope > .lx-next-other");
  if (other) {
    edge(card, "stubtuck", {
      fit: () => {
        const mark = other.querySelector("svg[data-symbol]")?.getBoundingClientRect();
        const style = getComputedStyle(other);
        const halfGap = parseFloat(style.columnGap) / 2 || 13;
        // The tear runs down the gap after the symbol, whichever way the row reads.
        const after = style.direction === "rtl" ? mark?.left - halfGap : mark?.right + halfGap;
        return { ty: other.offsetTop + 2, at: mark ? Math.round(after - card.getBoundingClientRect().left) : null };
      },
    });
  }
  return card;
}

/** A line of text held (lx/ui.js heldText). */
export const heldText = (width) => ui.heldText(width);

/** The other way forward held: the row a lesson's way comes in (its symbol, its two lines held), no link, nothing to press. */
function heldOther() {
  return el(
    "div",
    { class: "lx-next-other", "data-learn": "", "aria-hidden": "true" },
    symbol("learn-q", { size: 32 }),
    el("span", { class: "lx-next-other-words" }, el("span", {}, heldText("11em")), el("span", { class: "lx-next-other-sub" }, heldText("8em"))),
    icon("chevron"),
  );
}

/** A card's button held (lx/ui.js heldButton): its exact size at any text size. */
const heldAction = (label) => ui.heldButton(label, { variant: "go", size: "lg", block: true });

/** The other way forward: its words on two lines when it names a lesson, its symbol when it's learning. */
function nextOther({ text, href }) {
  const [head, rest] = text.split(/:\s+(.+)/);
  const row = el(
    "a",
    { class: "lx-next-other", href, "data-learn": rest ? "" : undefined },
    rest ? symbol("learn-q", { size: 32 }) : null,
    el("span", { class: "lx-next-other-words" }, el("span", {}, head), rest ? el("span", { class: "lx-next-other-sub" }, rest) : null),
    icon("chevron"),
  );
  return row;
}

/**
 * Read, hear and say as bars: [{ skill, label, known, of, trained }]. A bar is how many you know by that strength out of
 * everything you've started; a strength you don't train shows as off.
 */
export function skillBars(bars) {
  return el(
    "div",
    { part: "skill-bars" },
    bars.map(({ skill, label, known, of, trained = true }) => {
      const fill = el("span", { class: "lx-bar-fill" });
      fill.style.setProperty("--fill", String(of ? Math.min(1, known / of) : 0));
      return el(
        "div",
        { part: "skill-bar", "data-skill": skill, state: trained ? undefined : "off", role: "img", "aria-label": trained ? t("know.skillKnown", { label, known, of }) : t("know.skillNotTrained", { label }) },
        el("span", { class: "lx-bar-label" }, label),
        el("span", { class: "lx-bar-track" }, fill),
        el("span", { class: "lx-bar-count" }, trained ? String(known) : "off"),
      );
    }),
  );
}

/**
 * The days of a week: [{ label, title, studied, today, future, key }], Monday first, and how many you studied. No streak
 * to lose: just the days. mark { day, pose }: the square Tinta's calm pose at the streak is about (know/today-pose.js:
 * a rest day used, a missed day mended), ringed quietly.
 */
export function weekStrip(days, studied, { count = true, mark = null } = {}) {
  return el(
    "div",
    { part: "week-strip", role: "group", "aria-label": t("know.thisWeekStudied", { count: studied }) },
    el(
      "ol",
      { class: "lx-week-days" },
      days.map((day) =>
        el(
          "li",
          { part: "week-day", state: day.studied ? "studied" : day.rested ? "rested" : day.paused ? "paused" : day.future ? "future" : undefined, "aria-current": day.today ? "date" : undefined, "data-tinta-pose": mark?.pose && day.key === mark.day ? mark.pose : undefined, title: day.title },
          el("span", { class: "lx-week-label" }, day.label),
          el("span", { class: "lx-week-mark" }, day.studied ? symbol("studied", { size: 36 }) : day.rested ? symbol("rest", { size: 36 }) : day.paused ? symbol("paused", { size: 36 }) : null),
        ),
      ),
    ),
    // Beside the streak (Today), the count would be a second "days" number: left out there.
    count ? el("span", { class: "lx-week-count" }, `${studied} ${studied === 1 ? "day" : "days"}`) : null,
  );
}

/**
 * Today's streak spot (part streak-spot): Tinta (a part built by character(): ready, counted, rest, mended) at its left,
 * by the streak's line and the week strip. Today throws its drip into today's square from here (know/today.js).
 */
export function streakSpot({ character = null, summary, strip, href = null }) {
  const parts = [el("div", { class: "lx-streak-spot-top" }, character, el("div", { class: "lx-streak-spot-body" }, summary)), strip];
  // href: the whole of it opens the streak's page, the number, the flame and the week row alike (its summary built with inLink).
  return href ? el("a", { part: "streak-spot", href, "aria-label": summary.dataset.label }, ...parts) : el("div", { part: "streak-spot" }, ...parts);
}

/**
 * The streak (know/streak.js streakOf's result) as Today shows it: the days in a row, and one quiet line on what today
 * holds. It never warns: a missed day is mended or rested, never "lost", and a break is just day 1 again.
 */
export function streakSummary(s, { href, inLink = false } = {}) {
  const days = s.days;
  const count = el("span", { part: "streak", "data-days": days ? undefined : "none" }, symbol("flame", { size: 44 }), el("strong", {}, formatNumber(days)), " ", el("span", {}, t("know.streakDays", { count: days })));
  const until = s.pausedUntil ? formatDate(new Date(`${s.pausedUntil}T12:00:00`), { month: "short", day: "numeric" }) : null;
  const bits = [];
  if (s.state === "done") bits.push(t("know.todayCounts"));
  else if (s.state === "open") bits.push(t("know.todayCountsOnceYouFinish"));
  else if (s.state === "mend") bits.push(s.need >= 2 ? t("know.yesterdayMendsWithTwoFinished") : t("know.yesterdayMendsWithOneMore"));
  else if (s.state === "paused") bits.push(until ? t("know.pausedUntil", { until }) : t("know.paused"));
  else bits.push(t("know.finishOneThingToStart"));
  if (s.rest) bits.push(t("know.restDaysKept", { count: s.rest }));
  if (s.longest > days) bits.push(t("know.longest", { longest: s.longest }));
  // On Today it opens Settings → Streak (how it counts, and pausing it).
  const note = el("span", { class: "lx-streak-note" }, bits[0]);
  const label = t("know.streakPauseItOrSee", { count: count.textContent, details: bits.join(". ") });
  if (href) return el("a", { part: "streak-summary", state: s.state, href, "aria-label": label }, count, note, icon("chevron"));
  // inLink: inside a link of its own (Today's streak spot, all of which opens the page): drawn as the link is, its words the spot's.
  if (inLink) return el("div", { part: "streak-summary", state: s.state, "data-in-link": "", "data-label": label }, count, note, icon("chevron"));
  return el("div", { part: "streak-summary", state: s.state }, count, note);
}

/** Where a number comes from, with links: [text or { text, href }]. */
export function credit(pieces) {
  return el(
    "p",
    { part: "credit" },
    pieces.map((piece) => (typeof piece === "string" ? piece : el("a", { href: piece.href, target: "_blank", rel: "noopener" }, piece.text))),
  );
}

/** A license's short name from its SPDX id, as it's written (CC-BY-SA-4.0: CC BY-SA 4.0). */
const licenceName = (id) => String(id).replace(/^CC-/, "CC ").replace(/-(\d+(?:\.\d+)*)$/, " $1");
/**
 * Where a language's word list comes from: one quiet row that opens a sheet with its whole credit, each source linked and its license, as the
 * list's attribution asks. The credit stays a tap away instead of standing at a page's foot as small print. null with no list.
 */
export function creditRow(lang) {
  const credit = frequencyCredit(lang);
  if (!credit) return null;
  const open = () => {
    const layer = ui.sheetLayer({ label: t("know.credit.title"), onClose: () => layer.remove() });
    layer.lxBody.append(
      el(
        "div",
        { class: "lx-stack lx-credit-sheet" },
        el("h2", { class: "lx-sheet-title" }, t("know.credit.title")),
        el("p", {}, t("know.credit.corpus", { corpus: credit.corpus })),
        el(
          "ul",
          { class: "lx-credit-sources" },
          credit.attribution.map((source) => el("li", {}, el("span", { class: "lx-credit-what" }, source.what.replace(/^./, (c) => c.toUpperCase())), el("a", { href: source.url, target: "_blank", rel: "noopener" }, source.name))),
        ),
        el("p", { class: "lx-credit-licence" }, t("know.credit.licence", { licence: licenceName(credit.licence) })),
      ),
    );
    // Leaving the page takes the sheet with it.
    addEventListener("hashchange", () => layer.lxClose?.(), { once: true });
    document.body.append(layer);
    layer.lxOpen();
  };
  return el("ul", { part: "list", class: "lx-know-credit" }, ui.listRow({ title: t("know.credit.row"), onclick: open, opens: "sheet" }));
}

/** How much of everyday language you'd follow (share 0–1) as a ring: the arc is the share itself, its number inside. */
export function shareRing(share) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 88 88");
  svg.setAttribute("aria-hidden", "true");
  const arc = Math.max(0, Math.min(1, share)) * 100;
  for (const [cls, length] of [["lx-ring-track", 100], ["lx-ring-arc", arc]]) {
    if (!length) continue;
    const circle = document.createElementNS(ns, "circle");
    for (const [name, value] of [["cx", "44"], ["cy", "44"], ["r", "38"], ["pathLength", "100"], ["stroke-dasharray", `${length} 100`], ["class", cls]]) circle.setAttribute(name, value);
    svg.append(circle);
  }
  return el("div", { part: "share-ring" }, svg, el("span", { class: "lx-ring-number" }, percent(share)));
}

/**
 * The Knowledge page's headline: how much of everyday language what you know covers (share 0–1, or null while the word
 * list isn't here) as a ring and a sentence, then what you know by kind, a note on what it includes and its credit.
 */
export function knowHeadline({ counts, share, note, language = languageLabel("nl"), credit: creditNode }) {
  const perThousand = share == null ? 0 : Math.round(share * 1000);
  const sentence =
    perThousand >= 1
      ? t("know.youdFollowAboutInEvery", { perThousand, thousand: 1000, language })
      : share > 0
        ? t("know.youreStartingOnTheWords", { language })
        : t("know.everyWordYouLearnCounts", { language });
  return el(
    "section",
    { part: "know-headline" },
    share == null ? null : el("div", { class: "lx-know-share-row" }, shareRing(share), el("p", { class: "lx-know-share" }, sentence)),
    el("p", { class: "lx-know-counts" }, counts),
    share != null && note ? el("p", { class: "lx-know-note" }, note) : null,
    share == null ? null : creditNode ?? null,
  );
}

/**
 * What you know over time, a bar a day, today last: points [{ at, n }] (summary.js growth), what a bar counts ("words
 * you'd recall"), with the most and 0 on the scale and the first day and Today along the foot.
 */
export function growthChart({ points, what }) {
  const most = Math.max(1, ...points.map((p) => p.n));
  const day = (at) => formatDate(at, { month: "short", day: "numeric" });
  const last = points.length - 1;
  const bars = el(
    "ol",
    { class: "lx-growth-bars" },
    points.map((p, i) => {
      const bar = el("li", { part: "growth-day", state: i === last ? "today" : undefined, title: t("know.growthDay", { day: i === last ? t("know.today") : day(p.at), count: p.n, what }) });
      bar.style.setProperty("--fill", String(p.n / most));
      return bar;
    }),
  );
  return el(
    "figure",
    { part: "growth-chart" },
    el(
      "div",
      { class: "lx-growth-plot", role: "img", "aria-label": t("know.onTodayAtMost", { what: capitalized(what), first: points[0].n, firstDay: day(points[0].at), last: points[last].n, most }) },
      bars,
      el("span", { class: "lx-growth-scale", "aria-hidden": "true" }, el("span", {}, formatNumber(most)), el("span", {}, "0")),
      el("p", { class: "lx-growth-axis", "aria-hidden": "true" }, el("span", {}, day(points[0].at)), el("span", {}, t("know.today2"))),
    ),
    el("figcaption", { class: "lx-growth-caption" }, t("know.eachDay", { what: capitalized(what) })),
  );
}

const capitalized = (text) => text.replace(/^./u, (c) => c.toLocaleUpperCase(intlLocale()));

/**
 * Read, hear and say as three numbers: [{ skill, n, label ("you can read"), icon, trained, href }]. Each opens what's
 * behind it; a strength you don't train shows as off.
 */
export function skillTiles(tiles) {
  return el(
    "div",
    { part: "skill-tiles" },
    tiles.map(({ skill, n, label, icon: name, trained = true, href }) =>
      el(
        "a",
        { part: "skill-tile", "data-skill": skill, state: trained ? undefined : "off", href, "aria-label": trained ? t("know.skillTile", { count: n, label }) : t("know.skillNotTrained", { label: capitalized(skill) }) },
        icon(name),
        el("span", { class: "lx-tile-number" }, trained ? formatNumber(n) : t("know.off")),
        el("span", { class: "lx-tile-label" }, trained ? label : t("know.notTrained3")),
      ),
    ),
  );
}

/**
 * One thing worth knowing now, in a sentence: meaning slipping · right (or none), an icon, what's in it as links
 * (tags: [[text, href, meaning, lang]]) and a way to act on it (action: { label, href, icon, variant }).
 */
export function knowHighlight({ icon: name, meaning, text, tags = [], action }) {
  return el(
    "div",
    { part: "know-highlight", meaning },
    icon(name),
    el(
      "div",
      { class: "lx-highlight-body" },
      el("p", {}, text),
      tags.length ? el("p", { class: "lx-know-chips" }, tags.map(([tagText, href, tagMeaning, lang]) => el("a", { href, class: "lx-know-chip" }, ui.conceptTag(tagText, tagMeaning, { lang })))) : null,
      action ? ui.button(action.label, { variant: action.variant ?? "gray", icon: action.icon ?? "play", onclick: go(action.href) }) : null,
    ),
  );
}

/**
 * A card that opens a page of its own: its title, a line, and a glimpse of what's there (preview: a node with nothing
 * pressable in it; the page has the real thing).
 */
export function knowLinkCard({ title, sub, href, preview, art }) {
  return el(
    "a",
    { part: "know-link-card", href, "aria-label": sub ? `${title}: ${sub}` : title, "data-rowed": art ? "" : undefined },
    art ?? null,
    el("span", { class: "lx-link-card-head" }, el("h2", {}, title), icon("chevron")),
    sub ? el("span", { class: "lx-link-card-sub" }, sub) : null,
    preview ? el("span", { class: "lx-link-card-preview", "aria-hidden": "true" }, preview) : null,
  );
}

/**
 * Read, hear and say by kind of unit, as a table of counts: columns [label], rows [{ skill, label, trained, cells:
 * [{ n, href }] }]. Each count opens its list.
 */
export function skillTable(columns, rows) {
  return el(
    "table",
    { part: "skill-table" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, el("span", { class: "lx-visually-hidden" }, t("know.strength"))), columns.map((c) => el("th", { scope: "col" }, c)))),
    el(
      "tbody",
      {},
      rows.map((row) =>
        el(
          "tr",
          { "data-skill": row.skill, state: row.trained === false ? "off" : undefined },
          el("th", { scope: "row" }, row.label),
          row.cells.map((cell) => el("td", {}, cell.href ? el("a", { href: cell.href }, String(cell.n)) : String(cell.n))),
        ),
      ),
    ),
  );
}

/**
 * The top of a concept's page: its name and kind, what it is, and an example (a node: the sentence with its speak
 * button and literal line).
 */
export function conceptHead({ name, kind, about, en, example, more, status }) {
  return el(
    "section",
    { part: "concept-head" },
    el("div", { class: "lx-concept-title" }, el("h1", {}, name), el("span", { part: "badge" }, kind), more ?? null),
    status ?? null,
    en ? el("p", { class: "lx-concept-en" }, en) : null,
    about ? el("p", { class: "lx-muted" }, about) : null,
    example ?? null,
  );
}

/**
 * The most common words as a strip of cells in frequency order, filled by how well you know each ({ lemma, rank, state }
 * as summary.js wordStrip), in links of `perLink` words (two rows) that open those words (without linkHref, none).
 */
export function wordStrip({ cells, perRow = 50, perLink = 100, linkHref = null, label }) {
  const links = [];
  for (let i = 0; i < cells.length; i += perLink) {
    const block = cells.slice(i, i + perLink);
    const known = block.filter((c) => c.state === "known" || c.state === "said").length;
    const rows = [];
    for (let r = 0; r < block.length; r += perRow) {
      rows.push(el("span", { part: "word-row" }, block.slice(r, r + perRow).map((c) => el("i", { part: "word-cell", state: c.state, title: `${c.rank}. ${c.lemma}` }))));
    }
    // Without linkHref, a glimpse: the same cells, nothing to press.
    links.push(linkHref ? el("a", { href: linkHref(i), class: "lx-strip-block", "aria-label": t("know.wordsToKnown", { from: i + 1, to: i + block.length, known }) }, rows) : el("span", { class: "lx-strip-block" }, rows));
  }
  return el("div", { part: "word-strip", role: "group", "aria-label": label }, links);
}

/** What the strip's cells mean: [[state, words]]. */
export function stripLegend(items) {
  return el("p", { class: "lx-strip-legend" }, items.map(([state, text]) => el("span", {}, el("i", { part: "word-cell", state, "aria-hidden": "true" }), text)));
}

const NODE_WORD = { strong: "know.node.strong", learning: "know.node.learning", slipping: "know.node.slipping", new: "know.node.new" };

/** A pattern's mark on the grammar map: strong ● · learning ◐ · slipping ◌ · new ○ (a shape, never color alone). */
const nodeMark = (state) => el("span", { class: "lx-node-mark", "data-mark": state, "aria-hidden": "true" });

/**
 * The grammar map: patterns in the order they build on each other, each lit by how well you know it and opening its own
 * page. rows: [{ unit, name, depth, also, state, level }] (summary.js grammarMap); href(unit), or null for a glimpse
 * with nothing to press.
 */
export function grammarMap(rows, { href = null } = {}) {
  return el(
    "ol",
    { part: "grammar-map" },
    rows.map((row) => {
      const node = el(
        "li",
        { part: "grammar-node", state: row.state, class: row.depth === 0 ? "lx-node-root" : undefined },
        el(
          href ? "a" : "span",
          { href: href ? href(row.unit) : undefined, class: "lx-node-row", "aria-label": href ? t(row.also.length ? "know.nodeRowAlso" : "know.nodeRow", { name: row.name, state: t(NODE_WORD[row.state]), units: formatList(row.also, { type: "unit", style: "short" }) }) : undefined },
          nodeMark(row.state),
          el("span", { class: "lx-node-text" }, el("span", { class: "lx-node-name" }, row.name), row.also.length ? el("span", { class: "lx-node-also" }, t("know.alsoAfter", { units: formatList(row.also, { type: "unit", style: "short" }) })) : null),
          ui.strengthMeter(row.level, row.state === "slipping" ? "slipping" : undefined),
        ),
      );
      node.style.setProperty("--depth", String(row.depth));
      return node;
    }),
  );
}

/** What the grammar map's marks mean. */
export const grammarLegend = () =>
  el("p", { class: "lx-strip-legend" }, Object.entries(NODE_WORD).map(([state, word]) => el("span", {}, nodeMark(state), t(word))));

/** Reviews coming, a bar a day, today first: [{ label, title, count }] (summary.js forecast, labeled). */
export function forecastBars(days) {
  const most = Math.max(1, ...days.map((day) => day.count));
  return el(
    "ol",
    { part: "forecast", "aria-label": t("know.reviewsComing", { days: days.map((day) => `${day.title}, ${day.count}`).join("; ") }) },
    days.map((day) => {
      const bar = el("span", { class: "lx-forecast-bar" });
      bar.style.setProperty("--fill", String(day.count / most));
      return el(
        "li",
        { part: "forecast-day", state: day.count ? undefined : "none", title: `${day.title}: ${day.count} ${day.count === 1 ? "review" : "reviews"}` },
        el("span", { class: "lx-forecast-count" }, String(day.count)),
        el("span", { class: "lx-forecast-track" }, bar),
        el("span", { class: "lx-forecast-label" }, day.label),
      );
    }),
  );
}

/** Where what you did came from, as bars: [{ source, label, count }]; each against the largest. */
export function sourceBars(items) {
  const most = Math.max(1, ...items.map((item) => item.count));
  return el(
    "div",
    { part: "source-bars" },
    items.map(({ source, label, count }) => {
      const fill = el("span", { class: "lx-bar-fill" });
      fill.style.setProperty("--fill", String(count / most));
      return el(
        "div",
        { part: "source-bar", "data-source": source, role: "img", "aria-label": `${label}: ${count}` },
        el("span", { class: "lx-bar-label" }, label),
        el("span", { class: "lx-bar-track" }, fill),
        el("span", { class: "lx-bar-count" }, String(count)),
      );
    }),
  );
}

const CAL_DAYS = ["M", "", "W", "", "F", "", ""];

/**
 * Every day you studied: weeks as columns, Monday at the top, each day filled by how much you did (level 0–4), with the
 * months along the top. weeks: summary.js calendar's; months: [{ week, label }].
 */
export function studyCalendar({ weeks, studied, months = [] }) {
  const grid = el("div", { class: "lx-cal-grid" });
  grid.style.setProperty("--weeks", String(weeks.length));
  for (const { week, label } of months) {
    const month = el("span", { class: "lx-cal-month" }, label);
    month.style.setProperty("--week", String(week + 2));
    grid.append(month);
  }
  CAL_DAYS.forEach((label, d) => {
    const name = el("span", { class: "lx-cal-day-name" }, label);
    name.style.setProperty("--row", String(d + 2));
    grid.append(name);
  });
  weeks.forEach((week, w) =>
    week.forEach((day, d) => {
      const cell = el("span", {
        part: "calendar-day",
        state: day.future ? "future" : day.moments ? "studied" : undefined,
        "data-level": day.level,
        "aria-current": day.today ? "date" : undefined,
        title: t(day.moments ? "know.dayDone" : "know.day", { date: formatDate(day.date, { weekday: "short", day: "numeric", month: "short" }), count: day.moments }),
      });
      cell.style.setProperty("--week", String(w + 2));
      cell.style.setProperty("--row", String(d + 2));
      grid.append(cell);
    }),
  );
  return el("div", { part: "study-calendar", role: "img", "aria-label": t("know.studiedInTheLastWeeks", { count: studied, weeks: weeks.length }) }, grid);
}

/**
 * Numbers at a glance: [{ n, label, sub, symbol, extra, href }], each opening what's behind it (Home's progress: words you'd
 * recall now, things done this week).
 */
export function statTiles(tiles) {
  return el(
    "div",
    { part: "stat-tiles" },
    tiles.map((t) =>
      el(
        t.href ? "a" : "div",
        { part: "stat-tile", href: t.href },
        t.symbol && SYMBOL_NAMES.includes(t.symbol) ? symbol(t.symbol, { size: 32 }) : null,
        el("span", { class: "lx-tile-number" }, formatNumber(t.n)),
        el("span", { class: "lx-tile-label" }, t.label),
        t.sub ? el("span", { class: "lx-tile-sub" }, t.sub) : null,
        t.extra ?? null,
        el("span", { class: "lx-tile-open", "aria-hidden": "true" }, icon("chevron")),
      ),
    ),
  );
}

/**
 * Translate's field: what you type (it grows with a phrase), a clear button once there's text, and which way it goes.
 * One field for Home's box and the Translate page, so the keyboard never drops between them. left, right: { code,
 * name }; both: either way. onInput(value, { now }); onWay(); onClear(); form.lxSetWay({ left, right, both }) in place. mic: a
 * microphone button for dictation (ui.micButton, compact), which keeps the field's focus like the others.
 */
export function translateField({ left, right, both = true, value = "", onInput, onWay, onClear, onFocus, onSwap, onLabel, mic = null }) {
  const label = (one) => (one.both ? t("know.translateOr", { left: one.left.name, right: one.right.name }) : t("know.translateFromTo", { from: one.left.name, to: one.right.name }));
  const input = el("textarea", {
    part: "text-field",
    rows: 1,
    placeholder: t("know.translate"),
    "aria-label": label({ left, right, both }),
    autocomplete: "off",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    enterkeyhint: "search",
    maxlength: 400,
    dir: "auto",
  });
  input.value = value;
  const fromLabel = el("button", { class: "lx-tr-lang", type: "button", onclick: () => onLabel?.(), onmousedown: (event) => event.preventDefault() });
  const form = el("form", { part: "translate-field", role: "search" }, symbol("translate", { size: 28 }), fromLabel, input);
  // Grows with what's typed: the browser's own sizing where it has it, else measured.
  const measures = !globalThis.CSS?.supports?.("field-sizing", "content");
  const grow = () => {
    if (!measures) return;
    input.style.setProperty("height", "auto");
    input.style.setProperty("height", `${input.scrollHeight + 2}px`);
  };
  const hasText = () => form.toggleAttribute("data-has-text", Boolean(input.value));
  input.addEventListener("input", () => {
    hasText();
    grow();
    onInput?.(input.value, { now: false });
  });
  input.addEventListener("focus", () => onFocus?.());
  // Enter runs it now and puts the keyboard away, to read the answer: a line never breaks.
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    form.requestSubmit();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onInput?.(input.value, { now: true });
    input.blur();
  });
  // A press on these keeps the field's focus, and with it the keyboard.
  const keepFocus = (button) => (button.addEventListener("mousedown", (event) => event.preventDefault()), button);
  const clear = keepFocus(el("button", { part: "translate-clear", type: "button", "aria-label": t("know.clear"), title: t("know.clear2"), onclick: () => onClear?.() }, icon("cross")));
  const way = keepFocus(el("button", { part: "translate-direction", type: "button", onclick: () => onWay?.() }));
  const wayFlags = ui.steadyFlags([left.code, right.code]);
  form.lxSetWay = ({ left, right, both }) => {
    input.setAttribute("aria-label", label({ left, right, both }));
    way.setAttribute("aria-label", `${both ? t("know.eitherWayAnd", { left: left.name, right: right.name }) : `${left.name} to ${right.name}`}. Change which way`);
    way.replaceChildren(...[wayFlags(left.code), el("span", {}, left.code.toUpperCase()), icon(both ? "moved" : "chevron"), wayFlags(right.code), el("span", {}, right.code.toUpperCase())].filter(Boolean)); // a language with no flag has none
  };
  form.lxSetWay({ left, right, both });
  form.lxSetValue = (text) => {
    input.value = text;
    hasText();
    grow();
  };
  form.lxInput = input;
  if (mic) keepFocus(mic);
  form.append(el("div", { class: "lx-tr-controls" }, clear, way, mic));
  // Take c: which language is above, and the swap in a bite out of the box's foot.
  // The same flag elements each time (ui.steadyFlags): a change of language never draws one blank.
  const fromFlags = ui.steadyFlags([left.code, right.code]);
  form.lxSetFrom = (ends) => fromLabel.replaceChildren(...ends.flatMap((end, i) => [i ? " or " : "", fromFlags(end.code), end.name]).filter((part) => part !== null));
  const swap = keepFocus(el("button", { class: "lx-tr-swap", type: "button", "aria-label": t("know.translateTheOtherWay"), title: t("know.translateTheOtherWay2"), onclick: () => onSwap?.() }, SYMBOL_NAMES.includes("swap") ? symbol("swap", { size: 22 }) : icon("moved")));
  form.lxFlip = (on) => swap.toggleAttribute("data-flip", on);
  form.append(swap);
  edge(form, "hinge");
  const said = el("div", { class: "lx-tr-box-speak" });
  form.append(said);
  form.lxSetSpeak = (node) => said.replaceChildren(...(node ? [node] : []));
  hasText();
  return form;
}

/**
 * What Translate found: a word, or a whole sentence (variant sentence), in its language; what it means; where it's
 * from; and a button to hear it (speak, as ui.speakButton takes it). about: what typed word it's a reading of ("for loopt").
 */
export function translateResult({ text, meaning, from, lang, speak, variant, about, onPick, current = false }) {
  const hear = speak ? ui.speakButton(speak, { label: t("know.hear", { text }) }) : null;
  const inside = [about ? el("span", { class: "lx-tr-from" }, about) : null, el("span", { class: "lx-tr-said", lang }, text), meaning ? el("span", { class: "lx-tr-meaning" }, meaning) : null, from ? el("span", { class: "lx-tr-from" }, from) : null];
  return el(
    "div",
    { part: "translate-result", variant, "data-current": current ? "" : undefined },
    onPick ? el("button", { class: "lx-tr-text lx-tr-pick", type: "button", onclick: onPick }, inside) : el("div", { class: "lx-tr-text" }, inside),
    current ? icon("check") : null,
    hear,
  );
}

/**
 * Translate's best guess, what the page says first, large (part translate-result, state best). toEnglish: the big line is
 * the English and the small one the language; otherwise the big one is the language. said, meaning: each side, either
 * one a list of nodes. rough: labeled a word-by-word guess. speak: hears the big line; speakSaid: hears the language when
 * it's the small line. notFound: words it didn't find.
 */
export function translateBest({ variant, said, meaning, toEnglish, lang, rough = false, from, speak, speakSaid, speakLabel, notFound = [] }) {
  const saidNode = said ? el("span", { class: "lx-tr-said", lang, dir: "auto" }, said) : null;
  const meaningNode = meaning ? el("span", { class: "lx-tr-meaning" }, meaning) : null;
  const [big, small] = toEnglish ? [meaningNode, saidNode] : [saidNode, meaningNode];
  const hear = speak ? ui.speakButton(speak, { label: speakLabel ?? t("know.hearIt") }) : null;
  const hearSaid = speakSaid ? ui.speakButton(speakSaid, { label: t("know.hearItInTheLanguage") }) : null;
  // The answer is the largest thing here: a word very large, a sentence large, a long one still the largest.
  const length = (big?.textContent ?? "").length;
  return el(
    "div",
    { part: "translate-result", variant, state: "best", "data-way": toEnglish ? "to-english" : "from-english", "data-len": length <= 12 ? "word" : length <= 64 ? "line" : "long" },
    rough ? el("p", { class: "lx-tr-rough" }, t("know.roughGuessWordByWord")) : null,
    el("div", { class: "lx-tr-line" }, el("div", { class: "lx-tr-big" }, big), hear),
    small ? el("div", { class: "lx-tr-line" }, el("div", { class: "lx-tr-small" }, small), hearSaid) : null,
    notFound.length ? el("p", { class: "lx-tr-notfound" }, t("know.notFound", { words: formatList(notFound, { type: "unit", style: "short" }) })) : null,
    from ? el("span", { class: "lx-tr-from" }, from) : null,
  );
}

/**
 * A word spelled the same in two languages that's two different words: both readings, plainly (part translate-result, state
 * best, variant two). readings: [{ label, said | meaning, lang, from, speak, speakLabel }].
 */
export function translateTwo({ readings }) {
  return el(
    "div",
    { part: "translate-result", variant: "two", state: "best", "data-len": "line" },
    ...readings.map(({ label, said, meaning, lang, from, speak, speakLabel }) =>
      el(
        "div",
        { class: "lx-tr-reading" },
        el("p", { class: "lx-tr-rough" }, label),
        el("div", { class: "lx-tr-line" }, el("div", { class: "lx-tr-big" }, said ? el("span", { class: "lx-tr-said", lang }, said) : el("span", { class: "lx-tr-meaning" }, meaning)), speak ? ui.speakButton(speak, { label: speakLabel ?? t("know.hearIt") }) : null),
        from ? el("span", { class: "lx-tr-from" }, from) : null,
      ),
    ),
  );
}

/**
 * Take b: the bar on Translate's page, the tab bar's shape and bubble: the two languages, with the bubble on the one you're typing from (over both while it could be
 * either), and speaking as its third place. onPick(code). node.lxFrom(code | null) moves the bubble; node.lxHold(mic) takes the microphone.
 */
export function translateBar({ ends, onPick }) {
  let pair = ends;
  const makeTab = (end, at) => {
    const tab = el("button", { class: "lx-way-tab", type: "button", "data-at": at, "data-code": end.code, "aria-pressed": "false", "aria-label": end.name, title: end.name, "data-noflag": ui.languageFlag(end.code) ? undefined : "", onclick: () => onPick(end.code) }, ui.languageFlag(end.code), el("span", {}, end.name));
    tab.addEventListener("mousedown", (event) => event.preventDefault());
    return tab;
  };
  let tabs = ends.map(makeTab);
  const all = el("span", { class: "lx-way-all" });
  const bubble = el("span", { class: "lx-way-bubble", "aria-hidden": "true" });
  const lensItems = (list) => list.map((end) => el("span", { class: "lx-way-lens-item", "data-noflag": ui.languageFlag(end.code) ? undefined : "" }, ui.languageFlag(end.code), el("span", {}, end.name)));
  const lens = el("span", { class: "lx-way-lens", "aria-hidden": "true" }, lensItems(ends));
  // Which way it's going: an arrow between them, away from the language you're typing. Gone while it could be either.
  const arrow = el("span", { class: "lx-way-arrow", "aria-hidden": "true" }, icon("chevron"));
  const node = el("div", { class: "lx-way-bar", role: "group", "aria-label": t("know.theLanguageYoureTyping") }, bubble, all, tabs, lens, arrow);
  const moves = ui.tabLens(node, bubble, lens);
  // The way it was last said: said again (Translate opening, a redraw), nothing moves, and nothing is measured (it forced a layout of the
  // whole page as Translate opened). The bar's own observer places the bubble once it has a size.
  const UNSAID = Symbol("unsaid");
  let shownFrom = UNSAID;
  node.lxFrom = (code) => {
    if (code === shownFrom) return;
    shownFrom = code;
    for (const tab of tabs) tab.setAttribute("aria-pressed", String(tab.dataset.code === code));
    moves.to(tabs.find((tab) => tab.dataset.code === code) ?? all);
    if (code) node.setAttribute("data-from", code === pair[0].code ? "0" : "1");
    else node.removeAttribute("data-from");
  };
  node.lxSetEnds = (next) => {
    pair = next;
    shownFrom = UNSAID;
    const made = next.map(makeTab);
    tabs.forEach((tab, i) => tab.replaceWith(made[i]));
    tabs = made;
    lens.replaceChildren(...lensItems(next));
  };
  return node;
}

/**
 * Translate listening: what you've said is on its way to the answer's place, so that's where listening shows, large. node.lxSay(words): the line under it.
 * node.lxState and node.lxLevel as the microphone's, so they can be driven together.
 */
export function translateListening() {
  const BARS = 34;
  const levels = new Array(BARS).fill(0);
  const bars = Array.from({ length: BARS }, () => el("i"));
  const line = el("p", { class: "lx-tr-listening-line" });
  const node = el("div", { class: "lx-tr-listening", role: "status" }, el("h2", {}, t("know.listening")), line, el("div", { class: "lx-tr-listening-bars", "aria-hidden": "true" }, bars));
  const draw = () => bars.forEach((bar, i) => bar.style.setProperty("--h", levels[i].toFixed(3)));
  let last = 0;
  node.lxSay = (words) => (line.textContent = words ?? "");
  node.lxLevel = (level) => {
    const value = Math.max(0, Math.min(1, level));
    const now = performance.now();
    if (now - last >= 50) {
      levels.shift();
      levels.push(value);
      last = now;
    } else levels[BARS - 1] = Math.max(levels[BARS - 1], value);
    draw();
  };
  node.lxReset = () => {
    levels.fill(0);
    draw();
  };
  return node;
}

/** Take d: more on what you asked, a press away: a clean symbol and one word for each. items: [{ symbol, word, label, onclick }]. */
/** The one wide button under an answer: a symbol, a word, and how many, when there's a count (part translate-more, data-wide). */
export function translateWide({ symbol: name, icon: iconName, word, count, onclick }) {
  return el(
    "button",
    { part: "translate-more", "data-wide": "", type: "button", onclick, onmousedown: (event) => event.preventDefault() },
    name ? symbol(name, { size: 26 }) : icon(iconName),
    el("span", {}, word),
    count ? el("span", { class: "lx-tr-count" }, String(count)) : null,
  );
}

/** A pack that has what you typed, to add (part translate-pack): its name, whose it is, one of its sentences. add: its button. */
export function translatePack({ name, by, add, line, means, lang }) {
  return el(
    "div",
    { part: "translate-pack" },
    el("div", { class: "lx-tr-pack-top" }, el("div", {}, el("p", { class: "lx-tr-pack-name" }, name), el("p", { class: "lx-tr-pack-by" }, by)), add),
    line ? el("p", { class: "lx-tr-pack-line", lang }, line) : null,
    means ? el("p", { class: "lx-tr-pack-means" }, means) : null,
  );
}

/** A quiet line over that button, saying why the answer is what it is, with how far along when something's on its way. */
export function translateStatus({ words, share = null }) {
  return el("div", { class: "lx-tr-status", role: "status" }, el("p", {}, words), share === null ? null : ui.downloadBar({ label: words, share, tinta: false }));
}

/**
 * Translate's next best guesses behind one tap (part translate-guesses): count of them on the button, the list drawn
 * when it's opened. rows(): the guesses, made when asked. open: starts open; onToggle(open).
 */
export function translateGuesses({ count, rows, open = false, onToggle }) {
  const list = el("div", { class: "lx-tr-guess-list" });
  const button = el("button", { type: "button", class: "lx-tr-guess-toggle", "aria-expanded": "false" }, el("span", {}, t("know.more", { count })), icon("chevron"));
  const node = el("div", { part: "translate-guesses" }, button, list);
  const set = (on) => {
    button.setAttribute("aria-expanded", String(on));
    node.toggleAttribute("data-open", on);
    if (on) {
      if (!list.children.length) list.append(...rows());
    } else list.replaceChildren();
  };
  button.addEventListener("click", () => {
    const on = !node.hasAttribute("data-open");
    set(on);
    onToggle?.(on);
  });
  if (open) set(true);
  return node;
}

/**
 * One of Translate's main words (part translate-word): the word (a study card's way: ui.wordLabel), what it means, its
 * sentences, and More for the rest. rows: the sentence rows shown first; rest: () => the others, made when asked.
 */
export function translateWord({ word, lang, meaning, rows = [], rest = null, restCount = 0 }) {
  const list = el("div", { class: "lx-tr-word-rows" }, ...rows);
  const more = rest && restCount
    ? el("button", { type: "button", class: "lx-tr-word-more", onclick: () => {
        list.append(...rest());
        more.remove();
      } }, t("know.more2", { count: restCount }))
    : null;
  return el("div", { part: "translate-word" }, el("p", { class: "lx-tr-word-head" }, el("span", { class: "lx-tr-word-name", lang }, ui.wordLabel(word, lang)), meaning ? el("span", { class: "lx-tr-word-meaning" }, meaning) : null), list, more);
}

