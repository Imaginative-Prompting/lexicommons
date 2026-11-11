// Over time's own page (#know/time/more), what its card on the Knowledge page opens: the card's line told in full. The words and phrases you
// understand well (summary.js understood), over a month, three months or all of it, with the words that were your 10th, 25th, 50th… sitting on
// the line where you met them; how you know them, read, by ear and aloud, on one scale so they compare; the ideas you've met over the same
// time; and the week ahead, day by day, with the words coming back. What you only read has no surface; the range is a switch.
// The line draws in once as the page arrives; a new range is simply drawn. With animations off nothing moves.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { t, formatNumber, formatDate } from "../lx/i18n.js";
import { symbol } from "../lx/symbols.js";
import * as motion from "../lx/motion.js";
import { learning } from "../study/learning.js";
import { allEvidence, evidenceVersion, langOf } from "../study/progress.js";
import { shownName } from "../study/content.js";
import { bankEntry, bankWords } from "../read/bank.js";
import { dayOf, forecast, overTime } from "./summary.js";
import { openUnitSheet, paintOf, recalledUnits } from "./cards.js";
import { seeded, hashOf } from "./pile.js";

const DAY = 86_400_000;
const SVG = "http://www.w3.org/2000/svg";
const svg = (name, attrs = {}) => {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined) node.setAttribute(key, String(value));
  return node;
};
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000];
// The ranges: a month and three months a day at a time; all of it from your first word, a day at a time up to POINTS days, else evenly.
const RANGES = { month: 30, quarter: 91, all: Infinity };
const POINTS = 120;
const RANGE_KEY = "lx.know.time-range.v1";
const SKILL_LABEL = { read: "know.timePage.read", hear: "know.timePage.hear", say: "know.timePage.say" };

/** The times a range's points stand at, oldest first, today (now) last: the end of each day. */
function timesOf(range, first, now) {
  const days = Math.max(1, Math.min(RANGES[range], Math.ceil((now - first) / DAY) + 1));
  const step = Math.max(1, Math.ceil(days / POINTS));
  const count = Math.max(2, Math.ceil(days / step));
  const ats = [];
  for (let i = count - 1; i >= 0; i--) ats.push(i === 0 ? now : new Date(now - i * step * DAY).setHours(23, 59, 59, 999));
  return { ats, step };
}

/** A word as a small tile in its paint (the pile's own), opening the word. */
function tile(unit, lang) {
  return el("button", { type: "button", part: "mini-tile", "data-paint": paintOf(unit), "aria-haspopup": "dialog", onclick: () => openUnitSheet(unit) }, ui.wordLabel(shownName(unit), lang));
}

/** How far a word on the line slides back over its day so it stays inside the chart: centered, but within 15% of an end, toward that end. */
export const markShift = (x) => (x < 0.15 ? -50 * (x / 0.15) : x > 0.85 ? -50 - 50 * ((x - 0.85) / 0.15) : -50);

/** Sets style properties through the style object (the page's CSP refuses style attributes). */
function styled(node, props) {
  for (const [key, value] of Object.entries(props)) node.style.setProperty(key, String(value));
  return node;
}

/**
 * A filled line in the chart's violet over `values` (oldest first), `max` at the top: { node, wipe, W, H, xOf, yOf }. The wipe is its reveal,
 * for drawing it in; `stepped` holds each value until the next (a count that only goes up in whole steps, as ideas met).
 */
function areaChart(values, { max, W = 340, H = 150, top = 6, stepped = false, label = null }) {
  const xOf = (i) => (values.length < 2 ? W : (i / (values.length - 1)) * W);
  const yOf = (n) => H - (n / Math.max(1, max)) * (H - top);
  const path = values
    .map((n, i) => {
      if (!i) return `M0 ${yOf(n).toFixed(1)}`;
      return stepped ? `H${xOf(i).toFixed(1)}V${yOf(n).toFixed(1)}` : `L${xOf(i).toFixed(1)} ${yOf(n).toFixed(1)}`;
    })
    .join("");
  const id = `lx-tp-${Math.random().toString(36).slice(2, 9)}`;
  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "lx-tp-chart", preserveAspectRatio: "none", role: label ? "img" : undefined, "aria-label": label ?? undefined, "aria-hidden": label ? undefined : "true" });
  const reveal = svg("clipPath", { id });
  const wipe = svg("rect", { x: 0, y: 0, width: W, height: H });
  reveal.append(wipe);
  const drawn = svg("g", { "clip-path": `url(#${id})` });
  drawn.append(
    svg("path", { d: `${path}L${W} ${H}L0 ${H}Z`, fill: "var(--art-violet)" }),
    svg("path", { d: path, fill: "none", stroke: "var(--art-violet-lit)", "stroke-width": 3, "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" }),
  );
  chart.append(reveal, drawn);
  return { node: chart, wipe, W, H, xOf, yOf };
}

/** The first and last day under a chart: the first as a date (a month and year past ten months), the last today. */
function axis(ats) {
  const long = ats.at(-1) - ats[0] > 300 * DAY;
  return el("div", { class: "lx-time-axis" }, el("span", {}, formatDate(ats[0], long ? { month: "short", year: "numeric" } : { month: "short", day: "numeric" })), el("span", {}, t("know.today")));
}

/** When your history in a language starts: its first evidence, or a word you added to your word bank before that. */
function firstAt(lang, now) {
  let first = now;
  for (const row of allEvidence()) if (langOf(row) === lang && row.at < first) first = row.at;
  for (const lemma of bankWords(lang)) {
    const added = bankEntry(lang, lemma)?.added;
    if (added && added < first) first = added;
  }
  return first;
}

/** Once, when node is on the screen: play(time) every frame from 0 until it says it's done; with animations off (or quiet), play(Infinity) at once. */
function onArrive(node, play, quiet) {
  if (quiet || !motion.motionOn()) {
    play(Number.POSITIVE_INFINITY);
    return;
  }
  play(0);
  const seen = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      seen.disconnect();
      const start = performance.now();
      const tick = (now) => {
        if (!play(Math.max(0, (now - start) / 1000)) && node.isConnected) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { threshold: 0, rootMargin: "0px 0px -96px 0px" },
  );
  seen.observe(node);
}

/** The line drawing in left to right over 1.1 s (fast, then slowing). */
const wipeIn = (chart) => (time) => {
  const p = Math.min(1, time / 1.1);
  chart.wipe.setAttribute("width", String(chart.W * (1 - (1 - p) ** 2)));
  return p >= 1;
};

/** The words you understand well over the range, with your milestone words on the line where you met them. */
function mainChart(points, step, { lang, now, quiet }) {
  const values = points.map((p) => p.n);
  const chart = areaChart(values, { max: Math.max(1, ...values), H: 200, top: 40 });
  const start = points[0].at - step * DAY;
  // Your nth word: the words you understand well, in the order you met them.
  const met = recalledUnits(lang, now);
  const random = seeded(hashOf(met.map((row) => row.unit).slice(0, 12).join(" ")));
  const spots = [];
  for (const n of MILESTONES.filter((n) => n <= met.length).reverse()) {
    const row = met[n - 1];
    if (row.first < start) continue;
    const i = Math.max(0, Math.min(points.length - 1, Math.round((row.first - start) / (step * DAY)) - 1));
    const x = chart.xOf(i) / chart.W;
    // A word's tile is about a quarter of the chart wide, and the ends' tiles lean inward: no two closer than that.
    if (spots.some((spot) => Math.abs(spot.x - x) < 0.26)) continue;
    spots.push({ n, row, x, y: chart.yOf(points[i].n) / chart.H });
  }
  const marks = spots.reverse().map(({ n, row, x, y }) => ({
    x,
    shift: markShift(x),
    tilt: (random() - 0.5) * 10,
    node: styled(el("span", { class: "lx-time-mark" }, el("span", { class: "lx-time-mark-n" }, t("know.time.nth", { n: formatNumber(n) })), tile(row.unit, lang)), { left: `${(x * 100).toFixed(2)}%`, top: `${(y * 100).toFixed(2)}%` }),
  }));
  const plot = el("div", { class: "lx-time-plot lx-tp-main" }, chart.node, ...marks.map((m) => m.node));
  // The line draws in; each word drops onto it from rest as the line reaches its day, landing with a small settle.
  onArrive(
    plot,
    (time) => {
      let done = wipeIn(chart)(time);
      for (const m of marks) {
        const s = time - m.x * 1.1;
        let lift = 40;
        if (s >= 0) {
          const fall = 0.5 * 2600 * s * s;
          if (fall < 40) lift = 40 - fall;
          else {
            const after = s - Math.sqrt(80 / 2600);
            lift = after < 0.35 ? -3 * Math.exp(-9 * after) * Math.cos(18 * after) : 0;
          }
        }
        if (!Number.isFinite(time)) lift = 0;
        else if (s < 0.6) done = false;
        m.node.style.transform = `translate(${m.shift.toFixed(1)}%, calc(-100% - ${lift.toFixed(1)}px)) rotate(${m.tilt.toFixed(1)}deg)`;
        m.node.style.visibility = s >= 0 || !Number.isFinite(time) ? "visible" : "hidden";
      }
      return done;
    },
    quiet,
  );
  return plot;
}

/** Read, by ear and aloud: each its own small line on one scale, so they compare, with how many now (shown: as the range writes a number). */
function skillCharts(points, quiet, shown = formatNumber) {
  const max = Math.max(1, ...points.flatMap((p) => [p.read, p.hear, p.say]));
  return el(
    "div",
    { class: "lx-tp-skills" },
    ["read", "hear", "say"].map((skill) => {
      const now = points.at(-1)[skill];
      const chart = areaChart(
        points.map((p) => p[skill]),
        { max, H: 64, label: t("know.timePage.skillLabel", { skill: t(SKILL_LABEL[skill]), count: now }) },
      );
      const row = el(
        "div",
        { class: "lx-tp-skill" },
        el("div", { class: "lx-tp-skill-head" }, el("span", { class: "lx-tp-skill-name" }, t(SKILL_LABEL[skill])), el("span", { class: "lx-tp-skill-n" }, shown(now))),
        el("div", { class: "lx-tp-small" }, chart.node),
      );
      onArrive(row, wipeIn(chart), quiet);
      return row;
    }),
  );
}

/** The week ahead in full: each day, how many come back, and the words among them. */
function weekAhead({ lang, now }) {
  const days = forecast({ lang, now, days: 7 });
  const today = dayOf(now);
  return el(
    "ol",
    { class: "lx-tp-days" },
    days.map((day) => {
      const words = day.units.filter((unit) => unit.startsWith("w:") || unit.startsWith("c:"));
      const name = day.day === today ? t("know.today") : day.day === today + 1 ? t("know.timePage.tomorrow") : formatDate(day.date, { weekday: "long" });
      return el(
        "li",
        { class: "lx-tp-day", "data-empty": day.count ? undefined : "" },
        el("div", { class: "lx-tp-day-head" }, el("span", { class: "lx-tp-day-name" }, name), el("span", { class: "lx-tp-day-n" }, day.count ? t("know.timePage.comeBack", { count: day.count }) : t("know.timePage.none"))),
        words.length
          ? el("div", { class: "lx-mini-tiles", lang }, words.slice(0, 10).map((unit) => tile(unit, lang)), words.length > 10 ? el("span", { class: "lx-know-line" }, t("know.week.andMore", { count: words.length - 10 })) : null)
          : null,
      );
    }),
  );
}

/** Renders Over time's page into `page`. */
export function renderTime(page) {
  const lang = learning();
  const title = t("know.time.title");
  let range = "all";
  try {
    range = Object.hasOwn(RANGES, localStorage.getItem(RANGE_KEY)) ? localStorage.getItem(RANGE_KEY) : "all";
  } catch {}
  let stamp = "";
  const stampOf = (now) => [evidenceVersion(), bankWords(lang).length, dayOf(now), lang].join("|");
  const body = el("div", { class: "lx-tp-body" });
  const switcher = ui.segmented(
    [
      ["month", t("know.timePage.month")],
      ["quarter", t("know.timePage.quarter")],
      ["all", t("know.timePage.all")],
    ],
    range,
    (next) => {
      range = next;
      try {
        localStorage.setItem(RANGE_KEY, next);
      } catch {}
      draw({ quiet: true });
    },
    t("know.timePage.rangeLabel"),
  );
  const draw = ({ quiet = false } = {}) => {
    const now = Date.now();
    stamp = stampOf(now);
    const { ats, step } = timesOf(range, firstAt(lang, now), now);
    const all = overTime({ lang, ats });
    const last = all.at(-1);
    if (!all.some((p) => p.n || p.read || p.hear || p.say || p.ideas)) {
      body.replaceChildren(ui.emptyState(t("know.timePage.nothingYet"), { pose: "page" }));
      return;
    }
    // A month or three: each chart is what you gained in that time, from nothing at its start (never below it: a loss is never drawn), and
    // each number with its +. All of it: everything, from your first word.
    const ranged = range !== "all";
    const from = all[0];
    const gained = (p, key) => Math.max(0, p[key] - from[key]);
    const points = ranged ? all.map((p) => ({ at: p.at, n: gained(p, "n"), read: gained(p, "read"), hear: gained(p, "hear"), say: gained(p, "say"), ideas: gained(p, "ideas") })) : all;
    const shownOf = (value) => (ranged ? (value > 0 ? `+${formatNumber(value)}` : formatNumber(0)) : formatNumber(value));
    // A range's gain when there is one; else (all of it, or no gain) how many you know well now.
    const gain = last.n - from.n;
    const stat =
      range !== "all" && gain > 0
        ? { n: `+${formatNumber(gain)}`, label: t(range === "month" ? "know.timePage.monthLabel" : "know.timePage.quarterLabel", { count: gain }) }
        : { n: formatNumber(last.n), label: t("know.timePage.allLabel", { count: last.n }) };
    const ideasGain = last.ideas - points[0].ideas;
    const ahead = el("ol", { class: "lx-tp-days" });
    body.replaceChildren(
      el("div", { class: "lx-know-stat-block" }, el("span", { class: "lx-know-n" }, stat.n), symbol("path-q", { size: 30 }), el("span", { class: "lx-know-label" }, stat.label)),
      mainChart(points, step, { lang, now, quiet }),
      axis(ats),
      el(
        "section",
        { class: "lx-tp-section", "aria-labelledby": "lx-tp-how" },
        el("h2", { class: "lx-know-h", id: "lx-tp-how" }, t("know.timePage.howTitle")),
        ranged ? el("p", { class: "lx-know-line" }, t(range === "month" ? "know.timePage.pastMonth" : "know.timePage.pastQuarter")) : null,
        skillCharts(points, quiet, shownOf),
      ),
      el(
        "section",
        { class: "lx-tp-section", "aria-labelledby": "lx-tp-ideas" },
        el("h2", { class: "lx-know-h", id: "lx-tp-ideas" }, t("know.ideas.title")),
        el(
          "div",
          { class: "lx-know-stat-block" },
          el("span", { class: "lx-know-n" }, shownOf(ranged ? ideasGain : last.ideas)),
          ranged ? el("span", { class: "lx-know-label" }, t(range === "month" ? "know.timePage.ideasMonth" : "know.timePage.ideasQuarter", { count: Math.max(0, ideasGain) })) : null,
        ),
        (() => {
          const chart = areaChart(
            points.map((p) => p.ideas),
            { max: Math.max(1, ...points.map((p) => p.ideas)), H: 80, stepped: true },
          );
          const holder = el("div", { class: "lx-tp-small lx-tp-ideas" }, chart.node);
          onArrive(holder, wipeIn(chart), quiet);
          return holder;
        })(),
      ),
      el(
        "section",
        { class: "lx-tp-section", "aria-labelledby": "lx-tp-ahead" },
        el("h2", { class: "lx-know-h", id: "lx-tp-ahead" }, t("know.timePage.aheadTitle")),
        ahead,
      ),
    );
    // The week ahead in the task after (it reads every unit there is to practice): the page's first draw never waits on it.
    setTimeout(() => ahead.isConnected && ahead.replaceWith(weekAhead({ lang, now })), 0);
  };
  page.classList.add("lx-time-page");
  page.replaceChildren(ui.pageTitle(title), el("div", { class: "lx-tp-range" }, switcher), body);
  draw();
  return {
    title,
    back: { href: "#know/time", label: t("know.yourWords.back") },
    refresh: () => stampOf(Date.now()) !== stamp && draw({ quiet: true }),
  };
}
