// The Knowledge page's other cards, after Your words (know/cards.js wordsCard): each one picture of one thing, which comes to life once as you
// scroll to it (lx/motion.js; with animations off it's simply there). What you only read has no surface; what you press is an outline with a
// hard edge. This week: a glass of ink a day, filling to what you did. Everyday Dutch: the language's commonest words as a page, yours in ink and
// the rest still blank. The ideas you've met: each drawn on a sentence of yours. Over time: the words you'd recall, day by day, with the words
// that were your 10th, 25th, 50th… sitting on the line where you met them.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { t, formatNumber, formatDate, formatList, languageLabel } from "../lx/i18n.js";
import { symbol } from "../lx/symbols.js";
import * as motion from "../lx/motion.js";
import { conceptState, evidenceSince, itemEvidence } from "../study/progress.js";
import { finishedBetween } from "../study/done.js";
import { ITEMS, PATTERNS, contentLanguage, sentence as itemSentence, sentenceUnits, shownName } from "../study/content.js";
import { notesNow } from "../study/notes.js";
import { patternMore } from "../study/grammar.js";
import { rulePicture } from "../study/concept-picture.js";
import { separatorOf } from "../study/pack-format.js";
import { directionOf } from "../lang/index.js";
import { conceptSheet } from "../study/after-answer.js";
import { suggestWay } from "../explore/suggest-way.js";
import { dayOf, everydayShare, grammarMap, overTime, sourceOf, wordStrip } from "./summary.js";
import { isUnderstood, levelOf, wordEntries } from "./word-index.js";
import { percent, wideButton } from "./ui.js";
import { openUnitSheet, paintOf, recalledUnits } from "./cards.js";
import { seeded, hashOf } from "./pile.js";
import { markShift } from "./time-page.js";
import { whole } from "./slices.js";
import { weekTinta } from "./week-tinta.js";

const DAY = 86_400_000;
const SVG = "http://www.w3.org/2000/svg";
const svg = (name, attrs = {}) => {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined) node.setAttribute(key, String(value));
  return node;
};
const LEVEL_WORD = { 1: "know.words.level1", 2: "know.words.level2", 3: "know.words.level3", 4: "know.words.level4" };

/** A card with no surface: its title, a number that leads with its quiet symbol on the number's own line, the label under it, then what it shows. */
function section(id, { title, number = null, label = null, mark = null }, ...body) {
  return el(
    "section",
    { part: "know-section", "data-card": id, id: `know-${id}`, "aria-labelledby": `know-${id}-title` },
    el("h2", { class: "lx-know-h", id: `know-${id}-title` }, title),
    number === null ? null : el("div", { class: "lx-know-stat-block" }, el("span", { class: "lx-know-n" }, number), mark ? symbol(mark, { size: 30 }) : null, label ? el("span", { class: "lx-know-label" }, label) : null),
    ...body.filter(Boolean),
  );
}

/** Sets style properties through the style object (the page's CSP refuses style attributes). */
function styled(node, props) {
  for (const [key, value] of Object.entries(props)) node.style.setProperty(key, String(value));
  return node;
}

// A card drawn again in place (the page brought up to date while you were away): simply there, never arriving a second time.
let quiet = false;
/** Makes a card with make() as it ends up, with no arrival. */
export function quietly(make) {
  quiet = true;
  try {
    return make();
  } finally {
    quiet = false;
  }
}

// The longest an arrival waits on what it was asked to wait for (onArrive's arrive), in seconds: past it, it plays all the same.
const ARRIVE_WAIT_MOST = 2.5;
/**
 * Once, when node is half on the screen: play(t, since) every frame from 0 until it says it's done; with animations off, play(Infinity,
 * Infinity) at once. since is the time from that moment. arrive (optional) is called then and may hand back a promise: t holds at 0 until it
 * settles (ARRIVE_WAIT_MOST at most), then counts from there, while since runs on. This week's Tinta throws his drip then, and the glasses
 * fill as it lands (weekCard's tinta). again: it arrives even when drawn again in place (quietly), as This week does when its number has
 * changed since it was last drawn.
 */
function onArrive(node, play, { arrive = null, again = false } = {}) {
  if ((quiet && !again) || !motion.motionOn()) {
    play(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    return;
  }
  play(0, 0);
  const seen = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      seen.disconnect();
      const arrived = performance.now();
      // When t starts counting: at once, or once what arrive handed back settles.
      let start = null;
      const tick = (now) => {
        // A frame's time can come a little before the start: never less than 0.
        const since = Math.max(0, (now - arrived) / 1000);
        const time = start === null ? 0 : Math.max(0, (now - start) / 1000);
        // Done only once its time has started: a wait still running keeps it going.
        if ((!play(time, since) || start === null) && node.isConnected) requestAnimationFrame(tick);
      };
      let waiting = null;
      try {
        waiting = arrive?.() ?? null;
      } catch {
        waiting = null;
      }
      if (!waiting) start = arrived;
      else {
        let settled = false;
        const once = () => {
          if (settled) return;
          settled = true;
          clearTimeout(cap);
          start = performance.now();
        };
        const cap = setTimeout(once, ARRIVE_WAIT_MOST * 1000);
        Promise.resolve(waiting).then(once, once);
      }
      requestAnimationFrame(tick);
    },
    // As soon as any of it is clear of the tab bar (the bar's height off the screen's foot): never a part shown in its before-state.
    { threshold: 0, rootMargin: "0px 0px -96px 0px" },
  );
  seen.observe(node);
}

/** A word as a small tile in its paint (the pile's own), opening the word. */
function miniTile(unit, lang) {
  return el("button", { type: "button", part: "mini-tile", "data-paint": paintOf(unit), "aria-haspopup": "dialog", onclick: () => openUnitSheet(unit) }, ui.wordLabel(shownName(unit), lang));
}

// ---------- this week: a glass of ink a day ----------

const GLASS = { w: 44, h: 124, inside: { left: 5, right: 39, bottom: 119, top: 8 } };
const glassOutline = "M4 4V107Q4 121 18 121H26Q40 121 40 107V4";
const glassInside = "M5.5 0V107Q5.5 119.5 18 119.5H26Q38.5 119.5 38.5 107V0Z";

/**
 * The last seven days, counted as Home counts them (summary.js sources: one answer, one page or one turn is one thing, rows recorded together
 * once): { days: [{ day, date, moments, from: { games, listening, reading, talk } }] oldest first, done, most (the busiest day's count), from (the
 * week's, by source), fresh (the words and phrases met this week that you understand well, newest last), stronger (older ones that got stronger
 * this week) }. This week's card and its page (know/week-page.js) both show it.
 */
export const weekOf = (options) => whole(weekSteps(options));
/** weekOf a piece at a time (slices.js inSlices): its rows a few hundred a step, then a word a step. */
export function* weekSteps({ lang, now }) {
  const since = now - 7 * DAY;
  const today = dayOf(now);
  const days = Array.from({ length: 7 }, (_, i) => ({ day: today - 6 + i, date: now - (6 - i) * DAY, moments: new Set(), from: { games: 0, listening: 0, reading: 0, talk: 0 }, words: [] }));
  const from = { games: 0, listening: 0, reading: 0, talk: 0 };
  const counted = new Set();
  let read = 0;
  for (const row of evidenceSince(since)) {
    if (++read % 400 === 0) yield;
    const source = sourceOf(row.activity);
    const moment = `${source} ${row.at}`;
    const d = days[6 - Math.min(6, Math.max(0, today - dayOf(row.at)))];
    if (!d.moments.has(moment)) {
      d.moments.add(moment);
      d.from[source]++;
    }
    if (!counted.has(moment)) {
      counted.add(moment);
      from[source]++;
    }
  }
  const fresh = [];
  const stronger = [];
  // From the word index: when each word and phrase was first met, whether you understand it well, and its level then and now.
  for (const entry of wordEntries({ lang })) {
    const { unit, metAt: first } = entry;
    if (first >= since) {
      if (!isUnderstood(unit, { lang, now })) continue;
      fresh.push({ unit, first });
      days[6 - Math.min(6, Math.max(0, today - dayOf(first)))].words.push(unit);
    } else if (levelOf(unit, { lang }) > levelOf(unit, { lang, before: since })) stronger.push(unit);
    yield;
  }
  fresh.sort((a, b) => a.first - b.first);
  return { days, done: days.reduce((sum, d) => sum + d.moments.size, 0), most: Math.max(1, ...days.map((d) => d.moments.size)), from, fresh: fresh.map((row) => row.unit), stronger };
}

const SOURCES = ["games", "listening", "reading", "talk"];
const COUNT_OF = { games: "know.week.count.games", listening: "know.week.count.listening", reading: "know.week.count.reading", talk: "know.week.count.talk" };
/** What a count of things is made of, each in its own unit (answers, pages, turns), the most first: they add up to the count. null with one. */
const READ_BLOCK = 5; // minutes: the done-log keeps reading in blocks of five (study/done.js)

/**
 * What was finished from `from` up to `to` (study/done.js finishedBetween): lessons, Study's practices, games played by themselves, other
 * sessions (a quick session, reviews, a topic), minutes of reading and conversations. What a week's or a day's things done came from.
 */
export function finishedIn(from, to) {
  const things = finishedBetween(from, to);
  const n = (kind) => things.filter((thing) => thing.kind === kind).length;
  return { lessons: n("lesson"), practices: n("practice"), games: n("game"), sessions: n("session"), minutes: n("read") * READ_BLOCK, talks: n("talk") };
}

/** The line saying what the things done came from ("From 1 lesson, 1 practice, 3 games and 10 minutes of reading"); null with nothing finished. */
export function countedFrom(done) {
  const parts = [
    done.lessons ? t("know.week.part.lessons", { count: done.lessons }) : null,
    done.practices ? t("know.week.part.practices", { count: done.practices }) : null,
    done.games ? t("know.week.part.games", { count: done.games }) : null,
    done.sessions ? t("know.week.part.sessions", { count: done.sessions }) : null,
    done.minutes ? t("know.week.reading", { minutes: done.minutes }) : null,
    done.talks ? t("know.week.talks", { count: done.talks }) : null,
  ].filter(Boolean);
  return parts.length ? el("p", { class: "lx-know-line", "data-counted": "" }, t("know.week.from", { parts: formatList(parts) })) : null;
}

/** What one thing done is: an answer, a page read, a turn in a conversation. */
export const whatCounts = () => el("p", { class: "lx-know-caption", "data-counts": "" }, t("know.week.whatCounts"));

export function madeOf(from, { always = false } = {}) {
  const parts = SOURCES.filter((source) => from[source] > 0).sort((a, b) => from[b] - from[a]);
  if (parts.length < (always ? 1 : 2)) return null;
  return el("p", { class: "lx-know-line" }, parts.map((source) => t(COUNT_OF[source], { count: from[source] })).join(" · "));
}

/** Words as the pile's own small tiles, each opening its sheet. */
export const miniTiles = (units, lang, ...after) => el("div", { class: "lx-mini-tiles", lang }, units.map((unit) => miniTile(unit, lang)), ...after);

// Drawn again on a new scale (the week's busiest day changed): the glasses ease from where they were drawn onto it first, in this long (s).
const RESCALE = 0.35;
/**
 * A glass of ink a day for the week (weekOf), as high as what you did that day against the week's busiest, its number over it. They fill in
 * turn as they come into view, the ink tipping once and settling. arrive: onArrive's (their fill waits on what it hands back). from (a Map of
 * day → { level, n }, each glass as last drawn): the card arrives even when drawn again in place. Each glass stands at its old number on this
 * week's scale (eased there from where it was drawn, RESCALE, when the scale changed) and moves only as far as its day grew: 9 of a week whose
 * busiest is now 20 stands at 45% and rises to the top. When something lands in today's glass (arrive handed back a promise) or the card
 * arrives again, today's glass moves first. onTotal(n): every frame, the sum of the numbers the glasses show.
 */
export function weekGlasses(week, now, { arrive = null, from = null, onTotal = null } = {}) {
  const today = dayOf(now);
  // Whether arrive handed back something to wait for: a drop into today's glass, which then fills first.
  let dropped = false;
  const waitFor = arrive
    ? () => {
        const waiting = arrive();
        dropped = Boolean(waiting);
        return waiting;
      }
    : null;
  // Each glass: its outline, its ink (clipped to the inside), the ink's lit side and its surface.
  const glasses = week.days.map(({ day, date, moments }, i) => {
    const id = `lx-glass-${i}-${Math.round(now % 1e6)}`;
    const ink = svg("path", { fill: "var(--art-violet)" });
    const lit = svg("path", { fill: "var(--art-violet-lit)" });
    const top = svg("path", { fill: "none", stroke: "var(--art-violet-lit)", "stroke-width": 3, "stroke-linecap": "round" });
    const drawing = svg("svg", { viewBox: `0 0 ${GLASS.w} ${GLASS.h}`, class: "lx-glass", "aria-hidden": "true" });
    const clip = svg("clipPath", { id });
    clip.append(svg("path", { d: glassInside }));
    const inside = svg("g", { "clip-path": `url(#${id})` });
    inside.append(ink, lit, top);
    drawing.append(clip, inside, svg("path", { d: glassOutline, fill: "none", stroke: "var(--line-strong)", "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    const level = moments.size / week.most;
    const was = from?.get(day);
    // Its height as last drawn (on the scale it was drawn on), and its old number on this week's scale, where its fill starts.
    const drawn = was?.level ?? 0;
    const n0 = was?.n ?? 0;
    const start = n0 / week.most;
    const count = el("span", { class: "lx-glass-n" }, "");
    // shown: its number, counting from where it started with its ink (never standing over an empty glass).
    const set = (filled, slosh, shown) => {
      count.textContent = filled > 0 && level > 0 ? formatNumber(Math.round(shown)) : "";
      const { left, right, bottom, top: high } = GLASS.inside;
      const y = bottom - filled * (bottom - high);
      if (filled <= 0) {
        for (const p of [ink, lit, top]) p.setAttribute("d", "");
        return;
      }
      const a = slosh;
      ink.setAttribute("d", `M${left} ${y - a}L${right} ${y + a}L${right} 124L${left} 124Z`);
      // Hard light: the ink's left third lit, a straight split.
      lit.setAttribute("d", `M${left} ${y - a}L${left + 11} ${y - a + (22 * a) / (right - left)}L${left + 11} 124L${left} 124Z`);
      top.setAttribute("d", `M${left} ${y - a}L${right} ${y + a}`);
    };
    return {
      level,
      drawn,
      start,
      n: moments.size,
      n0,
      today: day === today,
      set,
      node: el("div", { class: "lx-glass-col", "aria-current": day === today ? "date" : undefined }, count, drawing, el("span", { class: "lx-glass-day" }, formatDate(date, { weekday: "narrow" }))),
    };
  });
  const row = el("div", { part: "week-glasses", role: "img", "aria-label": t("know.week.barsLabel", { count: week.done }) }, glasses.map((g) => g.node));
  // In turn, left to right: each glass whose number changed fills over 0.75 s (fast, then slowing) from where it starts (empty, or its old
  // number on this week's scale), its number counting with it, its ink tipping once and settling, as much as it rose; all still by about 2 s.
  // A glass whose number didn't change only eases onto the new scale, if there is one. After a drop, or arriving again, today's glass goes
  // first and the others that changed follow it.
  const fills = (g) => g.n !== g.n0;
  const rescale = Boolean(from) && glasses.some((g) => g.drawn !== g.start);
  const turnOf = (g, i) => {
    if (!dropped && !from) return i;
    const order = [...glasses.filter((x) => x.today && fills(x)), ...glasses.filter((x) => !x.today && fills(x))];
    return order.indexOf(g);
  };
  onArrive(row, (time, since) => {
    // Onto the new scale first (eased in and out), then the fill: it never starts before that's done.
    const r = rescale && Number.isFinite(since) ? Math.min(1, since / RESCALE) : 1;
    const settled = r < 0.5 ? 2 * r * r : 1 - (-2 * r + 2) ** 2 / 2;
    const fillTime = rescale && Number.isFinite(since) ? Math.min(time, since - RESCALE) : time;
    let busy = r < 1;
    let total = 0;
    glasses.forEach((g, i) => {
      const stand = g.drawn + (g.start - g.drawn) * settled;
      if (!fills(g)) {
        total += g.n;
        return g.set(stand, 0, g.n);
      }
      const s = fillTime - turnOf(g, i) * 0.08;
      if (s <= 0) {
        busy = true; // its turn is still to come
        total += g.n0;
        return g.set(stand, 0, g.n0);
      }
      const p = Math.min(1, s / 0.75);
      const eased = 1 - (1 - p) ** 3;
      const filled = g.start + (g.level - g.start) * eased;
      // How hard it tips: as far as it rose (a first fill: its whole height).
      const slosh = Number.isFinite(s) && s < 1.8 ? 3.4 * Math.exp(-3.2 * s) * Math.sin(12 * s) * Math.min(1, Math.abs(g.level - g.start) * 3) : 0;
      if (Number.isFinite(s) && s < 1.8) busy = true;
      const shown = g.n0 + (g.n - g.n0) * eased;
      total += shown;
      g.set(filled, slosh, shown);
    });
    onTotal?.(total);
    return !busy;
  }, { arrive: waitFor, again: Boolean(from) });
  return row;
}

// Per language, This week as it was last drawn: its number and each day's level.
const weekDrawn = new Map();

/**
 * This week: a glass of ink a day, as high as what you did that day against the week's busiest, the number over it; under them what the week's
 * things are made of, each in its own unit, so they add up to the number. The words you met this week that you understand well, as the pile's
 * own tiles (each opens the word; past twelve, the rest are on Your words' This week shelf), and how many older ones got stronger. The whole week,
 * day by day, is its own page (#know/week).
 * tinta (optional; know/week-tinta.js): Tinta beside the week's number. It's called once with { slot, glass, week, arriving }: slot, a box at the
 * stat block's end (know.css: its size from the first frame, so nothing moves when he's drawn), glass today's glass, arriving false when the
 * card won't arrive (drawn again in place, or animations off). It may hand back { arrive }, called the moment the glasses come into view: a
 * promise from it holds their fill until it settles (ARRIVE_WAIT_MOST at most), so his drip lands in them first.
 * Drawn again in place (the page brought up to date when you come back) with its number changed since it was last drawn, the card arrives
 * again: each glass stands at its old number on this week's scale and rises as far as its day grew as it comes into view (weekGlasses), Tinta
 * may throw (arriving is true), and the week's number counts up with the glasses, from the total they showed. A screen reader is given the
 * week's number itself at once; with animations off it's simply there.
 */
export function weekCard({ lang, now, week = weekOf({ lang, now }), tinta = null }) {
  const SHOWN = 12;
  const more = week.fresh.length - SHOWN;
  const words = week.fresh.length
    ? el(
        "div",
        { class: "lx-week-new" },
        el("p", { class: "lx-know-line" }, t("know.week.newWords", { count: week.fresh.length })),
        miniTiles(week.fresh.slice(-SHOWN).reverse(), lang, more > 0 ? el("a", { class: "lx-week-more", href: "#know/words/week" }, t("know.week.andMore", { count: more })) : null),
      )
    : null;
  const stronger = week.stronger.length ? el("p", { class: "lx-know-line" }, t("know.week.strongerWords", { count: week.stronger.length })) : null;
  const before = weekDrawn.get(lang);
  const again = quiet && Boolean(before) && before.done !== week.done;
  weekDrawn.set(lang, { done: week.done, levels: new Map(week.days.map((d) => [d.day, { level: d.moments.size / week.most, n: d.moments.size }])) });
  let arrive = null;
  // Arriving again, the week's number is the sum of what the glasses show, every frame (the number node is made below: the first total waits).
  let headline = null;
  let shownTotal = week.done;
  const onTotal = again
    ? (total) => {
        shownTotal = total;
        if (headline) headline.textContent = formatNumber(Math.round(total));
      }
    : null;
  const glasses = weekGlasses(week, now, { arrive: tinta ? () => arrive?.() ?? null : null, from: again ? before.levels : null, onTotal });
  const card = section(
    "week",
    { title: t("know.week.title"), number: formatNumber(week.done), label: t("know.week.unit", { count: week.done }), mark: "done-q" },
    glasses,
    el("p", { class: "lx-know-caption" }, t("know.week.scale")),
    // What the number counted: what it came from (lessons, practices, games, reading), and what one thing is. Home's "things done this week"
    // opens this card. With the new words and the way on, one group: the card's own parts on a phone (know.css: its box isn't drawn), a
    // column of its own beside the glasses on a computer's board.
    el(
      "div",
      { class: "lx-week-side" },
      countedFrom(finishedIn(now - 7 * DAY, now + 1)),
      madeOf(week.from),
      week.done ? whatCounts() : null,
      words,
      stronger,
      wideButton(t("know.week.seeAll"), { variant: "gray", onclick: () => (location.hash = "#know/week") }),
    ),
  );
  // The number a screen reader hears is the week's, at once; the one shown may still be counting.
  headline = card.querySelector(":scope > .lx-know-stat-block > .lx-know-n");
  if (headline) {
    headline.setAttribute("aria-hidden", "true");
    headline.before(el("span", { class: "lx-visually-hidden" }, formatNumber(week.done)));
    headline.textContent = formatNumber(Math.round(shownTotal));
  }
  if (tinta) {
    const slot = el("span", { part: "week-tinta", "aria-hidden": "true" });
    card.querySelector(":scope > .lx-know-stat-block")?.append(slot);
    // His failing never takes the card with it: the glasses then fill as they always have.
    try {
      arrive = tinta({ slot, glass: glasses.querySelector('[aria-current="date"] svg.lx-glass'), week, arriving: (!quiet || again) && motion.motionOn() })?.arrive ?? null;
    } catch (error) {
      console.error(error);
    }
  }
  return card;
}

// ---------- everyday Dutch: the commonest words, yours in ink ----------

const HUNDRED = 100;
const COMMON = 1000;
// A hundred is behind you once this share of its words is yours: the card moves on to the next one (the few left keep their blanks on the
// page). Eight in ten: the sample learner a year in understands 73–83% of every hundred at any moment (what's known well slips and comes back),
// so nine in ten would keep a year's learner on the first hundred.
const DONE_AT = 0.8;

/**
 * How much of everyday speech you'd follow, and what that's made of. The language's 1,000 commonest words as ten hundreds: a strip of them,
 * each filled as far as its words are yours (summary.js understood, with your word bank), the one you're on outlined; then that hundred set as a
 * page, yours in ink and the rest still blank, each blank the length of its word: Words 1–100 to begin with, Words 101–200 once eight in ten of
 * those are yours, and so on. As the card comes into view the strip fills and yours ink in, in order. The card is a press (an outline with a
 * hard edge) that opens all 1,000 (#know/everyday/words, everyday-page.js); then the next common words to learn. said: the word bank's lemmas.
 */
export function everydayCard({ lang, now, said, action = null }) {
  const strip = wordStrip({ lang, now, size: COMMON, said });
  if (!strip) return null;
  const share = everydayShare({ lang, now });
  const hundreds = Array.from({ length: Math.ceil(strip.cells.length / HUNDRED) }, (_, k) => strip.cells.slice(k * HUNDRED, (k + 1) * HUNDRED));
  const yoursIn = (cells) => cells.filter((cell) => cell.yours).length;
  // The hundred you're on: the first not yet nine in ten yours; all of them behind you, the last.
  const ahead = hundreds.findIndex((cells) => yoursIn(cells) < DONE_AT * cells.length);
  const on = ahead === -1 ? hundreds.length - 1 : ahead;
  const cells = hundreds[on];
  const from = on * HUNDRED + 1;
  const to = on * HUNDRED + cells.length;
  const count = yoursIn(cells);
  const title = t("know.everyday.title", { language: languageLabel(lang) });
  // The strip: a bar a hundred, its ink as far as its words are yours.
  const bars = hundreds.map((h, k) => {
    const fill = el("i", {});
    return { share: yoursIn(h) / h.length, fill, node: el("span", { class: "lx-hundred-bar", "data-on": k === on ? "" : undefined }, fill) };
  });
  const barsRow = el("div", { part: "hundreds-strip", "aria-hidden": "true" }, bars.map((bar) => bar.node));
  const words = cells.map((cell, i) => (cell.yours ? el("span", { class: "lx-common-word", "data-i": i }, cell.lemma) : el("span", { class: "lx-common-gap" }, cell.lemma)));
  const page = el("p", { part: "common-page", lang, "aria-hidden": "true" }, words.flatMap((word, i) => (i ? [" ", word] : [word])));
  const mine = words.filter((word) => word.classList.contains("lx-common-word"));
  // The strip fills left to right over 0.6 s; then yours ink in, in the language's order, about 0.8 s for all of them.
  onArrive(barsRow, (time) => {
    bars.forEach((bar, k) => {
      const p = Number.isFinite(time) ? Math.max(0, Math.min(1, (time - k * 0.04) / 0.35)) : 1;
      bar.fill.style.setProperty("--fill", String(bar.share * (1 - (1 - p) ** 2)));
    });
    const step = Math.min(0.03, 0.8 / Math.max(1, mine.length));
    const inked = time - 0.5;
    mine.forEach((word, n) => word.toggleAttribute("data-blank", !(inked >= n * step)));
    return inked >= mine.length * step;
  });
  const range = t("know.everydayPage.range", { from: formatNumber(from), to: formatNumber(to) });
  const door = el(
    "a",
    { part: "know-door", href: "#know/everyday/words", "aria-label": `${title}: ${share ? `${percent(share.share)} ${t("know.everyday.label")}. ` : ""}${t("know.everydayPage.blockLabel", { count, from, to })}. ${t("know.everyday.open")}` },
    el("h2", { class: "lx-know-h", id: "know-everyday-title" }, title),
    el("div", { class: "lx-know-stat-block" }, el("span", { class: "lx-know-n" }, share ? percent(share.share) : formatNumber(count)), symbol("words-q", { size: 30 }), share ? el("span", { class: "lx-know-label" }, t("know.everyday.label")) : null),
    barsRow,
    el("div", { part: "hundred", class: "lx-everyday-hundred" }, el("h3", { part: "hundred-head" }, el("span", { class: "lx-hundred-range" }, t("know.everyday.hundred", { range })), el("span", { class: "lx-hundred-count" }, t("know.everydayPage.yoursOf", { count, of: cells.length }))), page),
  );
  return el("section", { part: "know-section", "data-card": "everyday", id: "know-everyday", "aria-labelledby": "know-everyday-title" }, door, action);
}

// ---------- the ideas you've met ----------

/** A sentence of yours that shows the idea (one you've played first), else any that does. */
function sentenceOf(unit) {
  const withIt = ITEMS.filter((item) => sentenceUnits(item).includes(unit));
  return withIt.find((item) => itemEvidence(item.id).length) ?? withIt[0] ?? null;
}

/** The idea's picture on that sentence, as its sheet draws it: { node, play } (concept-picture.js). */
function ideaPicture(unit, item) {
  if (!item) return null;
  const id = unit.slice(2);
  const lang = contentLanguage();
  const notes = notesNow(item);
  const words = item.words.map(([text], i) => (i === item.words.length - 1 ? text + (item.punct ?? "") : text));
  const marks = (notes?.marks?.[id] ?? []).filter((at) => at < words.length);
  const roles = notes ? words.map((_, at) => notes.words[at]?.role ?? "") : [];
  const lemmas = item.words.map(([, lemma]) => lemma ?? "");
  const kind = patternMore(lang, id)?.picture ?? PATTERNS[id]?.picture;
  return rulePicture({ kind, text: itemSentence(item), words, shapes: item.shapes?.[id], marks, roles, lemmas, separator: separatorOf(lang), dir: directionOf(lang), lang });
}

/** The ideas you've met, the least known first, and how to make each one's card and play them in: { rows, card(row), arrive(list) }. */
export const ideaCards = (options) => whole(ideaSteps(options));
/**
 * ideaCards a piece at a time (slices.js inSlices): the map (read from the word index), then each idea's counts, one a step.
 */
export function* ideaSteps({ lang, now }) {
  const rows = grammarMap({ lang, now }).filter((row) => row.state !== "new");
  yield;
  const states = new Map();
  for (const row of rows) {
    states.set(row.unit, conceptState(row.unit, { lang, now }));
    yield;
  }
  const share = (row) => {
    const { right = 0, wrong = 0 } = states.get(row.unit) ?? {};
    return right + wrong ? right / (right + wrong) : 1;
  };
  rows.sort((a, b) => a.level - b.level || share(a) - share(b) || (b.state === "slipping") - (a.state === "slipping"));
  const plays = [];
  // Its name first, loud, and how well you know it; under them the idea drawn on a sentence of yours, quieter, only its own words lit.
  const card = (row) => {
    const item = sentenceOf(row.unit);
    const how = states.get(row.unit);
    const picture = ideaPicture(row.unit, item);
    if (picture?.play) plays.push(picture.play);
    return el(
      "button",
      { type: "button", part: "idea-card", "aria-haspopup": "dialog", "data-state": row.state, onclick: () => conceptSheet(row.unit, { item: sentenceOf(row.unit), sentence: item ? itemSentence(item) : undefined, extra: suggestWay(row.unit) }) },
      el(
        "span",
        { class: "lx-idea-foot" },
        el("span", { class: "lx-idea-name" }, row.name),
        el("span", { class: "lx-idea-how" }, t("know.ideas.how", { level: t(LEVEL_WORD[Math.min(4, Math.max(1, row.level))]), right: how.right, tries: how.right + how.wrong })),
      ),
      el("span", { class: "lx-idea-picture", "aria-hidden": "true" }, picture?.node ?? null),
    );
  };
  // One after another as `list` comes into view, each its words then its shape (its own draw-in, the one its sheet has).
  const arrive = (list) => {
    const drawn = plays.slice();
    if (quiet || !motion.motionOn()) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        seen.disconnect();
        drawn.forEach((play, i) => play(i * 450));
      },
      { threshold: 0, rootMargin: "0px 0px -96px 0px" },
    );
    seen.observe(list);
  };
  return { rows, card, arrive };
}

/**
 * The ideas (grammar) you've met, each drawn on a sentence of yours: its name and how well you know it, then the idea on the sentence, its words
 * lit and its shape drawn on them. Each one is a press (an outline with a hard edge) that opens its sheet. They draw in, one after another, as
 * the card comes into view. The least known first; four, then every one on its own page (#know/ideas, know/ideas-page.js).
 */
export const ideasCard = (options) => whole(ideasCardSteps(options))();
/** ideasCard a piece at a time (slices.js inSlices): what it knows, then a card a step. Returns make(): the card, made from them. */
export function* ideasCardSteps({ lang, now, shown = 4 }) {
  const ideas = yield* ideaSteps({ lang, now });
  const cards = [];
  for (const row of ideas.rows.slice(0, shown)) {
    cards.push(ideas.card(row));
    yield;
  }
  return () => {
    if (!ideas.rows.length) return null;
    const list = el("div", { class: "lx-idea-cards" }, cards);
    ideas.arrive(list);
    const all = ideas.rows.length > shown ? wideButton(t("know.ideas.seeAll", { count: ideas.rows.length }), { variant: "gray", onclick: () => (location.hash = "#know/ideas") }) : null;
    return section("ideas", { title: t("know.ideas.title") }, list, all);
  };
}
/** weekCard a piece at a time (slices.js inSlices). Returns make(): the card. */
export function* weekCardSteps({ lang, now }) {
  const week = yield* weekSteps({ lang, now });
  return () => weekCard({ lang, now, week, tinta: weekTinta });
}

// ---------- over time ----------

const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000];

/**
 * The words and phrases you understand well (summary.js understood), from your first one, as a filled line in the chart's violet, and on it,
 * sitting where you met them, the words that were your 10th, 25th, 50th… As the card comes into view the line draws left to right and each
 * word drops onto it as the line reaches its day. Then how you know them: by ear, aloud. The card is a press (an outline with a hard edge)
 * that opens it in full (#know/time/more, time-page.js).
 */
export function timeCard({ lang, now }) {
  // From your first word: four weeks a day at a time, a longer history in as many points, evenly spaced.
  const met = recalledUnits(lang, now);
  const span = met.length ? (now - met[0].first) / DAY : 0; // days since your first word
  const step = Math.max(1, Math.ceil(span / 28)); // 28 points: up to four weeks, a day a point
  const timesOf = (by) => Array.from({ length: 28 }, (_, k) => 27 - k).map((i) => (i === 0 ? now : new Date(now - i * by * DAY).setHours(23, 59, 59, 999)));
  const points = overTime({ lang, ats: timesOf(step) });
  const last = points.at(-1);
  // The number is the last four weeks' gain, whatever the line spans; no number when there's none (a loss is never counted here).
  const recent = step === 1 ? points : overTime({ lang, ats: timesOf(1) });
  const change = last.n - recent[0].n;
  const title = t("know.time.title");
  const skills = el("p", { class: "lx-know-line" }, t("know.time.howYouKnow", { hear: formatNumber(last.hear), say: last.say }));
  const door = (...body) =>
    el(
      "section",
      { part: "know-section", "data-card": "time", id: "know-time", "aria-labelledby": "know-time-title" },
      el(
        "a",
        { part: "know-door", href: "#know/time/more", "aria-label": `${title}${change > 0 ? `: +${formatNumber(change)} ${t("know.time.changeLabel")}` : ""}. ${t("know.time.open")}` },
        el("h2", { class: "lx-know-h", id: "know-time-title" }, title),
        change > 0 ? el("div", { class: "lx-know-stat-block" }, el("span", { class: "lx-know-n" }, `+${formatNumber(change)}`), symbol("path-q", { size: 30 }), el("span", { class: "lx-know-label" }, t("know.time.changeLabel"))) : null,
        ...body,
      ),
    );
  if (!points.some((p) => p.n > 0)) return door(skills);
  // The chart: the most at the top; the milestone words by when you met them.
  const W = 340;
  const H = 150;
  const most = Math.max(1, ...points.map((p) => p.n));
  const xOf = (i) => (i / (points.length - 1)) * W;
  const yOf = (n) => H - (n / most) * (H - 34);
  const line = points.map((p, i) => `${i ? "L" : "M"}${xOf(i).toFixed(1)} ${yOf(p.n).toFixed(1)}`).join("");
  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "lx-time-chart", preserveAspectRatio: "none", "aria-hidden": "true" });
  const reveal = svg("clipPath", { id: `lx-time-clip-${Math.round(now % 1e6)}` });
  const wipe = svg("rect", { x: 0, y: 0, width: W, height: H });
  reveal.append(wipe);
  const area = svg("path", { d: `${line}L${W} ${H}L0 ${H}Z`, fill: "var(--art-violet)" });
  const edge = svg("path", { d: line, fill: "none", stroke: "var(--art-violet-lit)", "stroke-width": 3, "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" });
  const drawn = svg("g", { "clip-path": `url(#${reveal.id})` });
  drawn.append(area, edge);
  chart.append(reveal, drawn);
  // The milestone words: the nth word you met, where it falls on the line.
  const start = points[0].at - step * DAY;
  const random = seeded(hashOf(met.map((row) => row.unit).slice(0, 12).join(" ")));
  // The milestones that fall on the line, and no two crowding each other: the later one keeps its place.
  const spots = [];
  for (const n of MILESTONES.filter((n) => n <= met.length).reverse()) {
    const row = met[n - 1];
    if (row.first < start) continue;
    const x = Math.max(0, Math.min(1, (row.first - start) / (step * DAY) / Math.max(1, points.length - 1)));
    // A word's tile is about a quarter of the chart wide, and the ends' tiles lean inward: no two closer than that.
    if (spots.some((spot) => Math.abs(spot.x - x) < 0.26)) continue;
    spots.push({ n, row, x });
  }
  const marks = spots
    .reverse()
    .map(({ n, row }) => {
      const i = Math.max(0, Math.min(points.length - 1, Math.round((row.first - start) / (step * DAY)) - 1));
      const x = xOf(i) / W;
      const y = yOf(points[i].n) / H;
      // A tile here is part of the card's press (the page has the ones that open a word).
      const node = styled(el("span", { class: "lx-time-mark" }, el("span", { class: "lx-time-mark-n" }, t("know.time.nth", { n: formatNumber(n) })), el("span", { part: "mini-tile", "data-paint": paintOf(row.unit) }, ui.wordLabel(shownName(row.unit), lang))), { left: `${(x * 100).toFixed(2)}%`, top: `${(y * 100).toFixed(2)}%` });
      return { node, x, shift: markShift(x), tilt: (random() - 0.5) * 10 };
    });
  const plot = el("div", { class: "lx-time-plot" }, chart, ...marks.map((m) => m.node));
  const axis = el("div", { class: "lx-time-axis" }, el("span", {}, formatDate(points[0].at, { month: "short", day: "numeric" })), el("span", {}, t("know.today")));
  // The line draws in left to right over 1.1 s; each word drops from 40 px over its day as the line gets there, falling from rest, landing with
  // a small settle.
  onArrive(plot, (time) => {
    const p = Math.min(1, time / 1.1);
    wipe.setAttribute("width", String(W * (1 - (1 - p) ** 2)));
    let busy = p < 1;
    for (const m of marks) {
      const s = time - m.x * 1.1;
      let lift = 40;
      if (s >= 0) {
        const fall = 0.5 * 2600 * s * s; // px, from rest
        if (fall < 40) lift = 40 - fall;
        else {
          const after = s - Math.sqrt(80 / 2600);
          lift = after < 0.35 ? -3 * Math.exp(-9 * after) * Math.cos(18 * after) : 0;
        }
      }
      if (!Number.isFinite(time)) lift = 0;
      if (Number.isFinite(time) && s < 0.6) busy = true;
      m.node.style.transform = `translate(${m.shift.toFixed(1)}%, calc(-100% - ${lift.toFixed(1)}px)) rotate(${m.tilt.toFixed(1)}deg)`;
      m.node.style.visibility = s >= 0 || !Number.isFinite(time) ? "visible" : "hidden";
    }
    return !busy;
  });
  return door(plot, axis, skills);
}
