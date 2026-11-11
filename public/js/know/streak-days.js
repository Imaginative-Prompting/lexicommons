// The streak page's year and a day of it (shell/settings-streak.js): the months a streak has run through, each day studied, a rest day
// (or a missed day mended, as Home's week row shows it), paused, or a plain day; and what you did on one day: the words and ideas you came to
// know well that day (understood's rule, know/word-index.js, as of the day's end and not its start), the lessons you finished, the sessions, the
// minutes you read and the conversations (study/done.js). streakMonths is pure (scripts/test-streak-days.mjs runs it in Node).

import { DAY_STARTS } from "./streak.js";

/** How many months the page shows at most: a year. */
export const MONTHS_SHOWN = 12;

/**
 * The months from the first day the streak knows (statuses, know/streak.js streakOf) to today's, newest first, at most `most`:
 * [{ year, month (0–11), lead (blank days before the 1st, Monday first), days: [{ key, day, state }] }], state one of studied · rested ·
 * paused · plain (nothing that day, never called missed) · future.
 */
export function streakMonths(statuses, today, { most = MONTHS_SHOWN } = {}) {
  const [ty, tm] = today.split("-").map(Number);
  const first = Object.keys(statuses).sort()[0] ?? today;
  const [fy, fm] = first.split("-").map(Number);
  const count = Math.max(1, Math.min(most, (ty - fy) * 12 + (tm - fm) + 1));
  const months = [];
  for (let i = 0; i < count; i++) {
    const start = new Date(ty, tm - 1 - i, 1);
    const year = start.getFullYear();
    const month = start.getMonth();
    const days = [];
    for (let day = 1, last = new Date(year, month + 1, 0).getDate(); day <= last; day++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const status = statuses[key];
      days.push({ key, day, state: key > today ? "future" : status === "studied" ? "studied" : status === "rested" || status === "mended" ? "rested" : status === "paused" ? "paused" : "plain" });
    }
    months.push({ year, month, lead: (start.getDay() + 6) % 7, days });
  }
  return months;
}

/** When a day (a day key) begins and ends as the streak counts it, from 4 am to 4 am: { start, end } in ms. */
export function dayBounds(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { start: +new Date(y, m - 1, d, DAY_STARTS), end: +new Date(y, m - 1, d + 1, DAY_STARTS) };
}

/**
 * The units a day had evidence for, in its language ("w:huis", "c:…", "p:…"), first seen first: those that may have come to be known well
 * that day. `rose` (row) says whether a row could have raised its unit (the page passes progress.js gradeOf good or hard): a miss, or a word
 * only met in a sentence, never makes a unit known, so a unit with no such row that day isn't asked about.
 */
export function dayUnits(key, { evidence = [], lang, rose = () => true }) {
  const { start, end } = dayBounds(key);
  const units = new Set();
  for (const row of evidence) if (row.at >= start && row.at < end && (row.lang ?? "nl") === lang && typeof row.concept === "string" && /^[wcp]:/.test(row.concept) && rose(row)) units.add(row.concept);
  return [...units];
}

/**
 * Which of a day's units came to be known well over it ({ start, end }, dayBounds): not at its start, and at its end. One question a step,
 * so the page asks a few between frames (it asks the word index; replaying a unit's history for each, an idea's thousands of answers, froze
 * a phone for a second). The start is asked first: most of a day's units were known already, and those need no second question.
 * { step(knewAt), done, crossed }.
 */
export function crossings(units, { start, end }) {
  let i = 0;
  let knownAtStart = null;
  const crossed = [];
  return {
    crossed,
    get done() {
      return i >= units.length;
    },
    step(knewAt) {
      if (i >= units.length) return;
      const unit = units[i];
      if (knownAtStart === null) {
        knownAtStart = knewAt(unit, start);
        if (!knownAtStart) return;
      } else if (knewAt(unit, end)) crossed.push(unit);
      i++;
      knownAtStart = null;
    },
  };
}

/** The day's finished things, counted: { lessons: [title], untitled (lessons with no title found), sessions, minutes, talks }. */
export function dayThings(things = [], lessonTitle = () => null) {
  const lessons = [];
  let untitled = 0;
  for (const thing of things.filter((t) => t.kind === "lesson")) {
    const title = lessonTitle(decodeURIComponent(thing.id));
    if (title) lessons.push(title);
    else untitled++;
  }
  return {
    lessons,
    untitled,
    sessions: things.filter((t) => t.kind === "session" || t.kind === "practice" || t.kind === "game").length,
    minutes: things.filter((t) => t.kind === "read").length * 5,
    talks: things.filter((t) => t.kind === "talk").length,
  };
}

/** The units that crossed (crossings), as words and ideas: { words: [name], ideas: [name] }. */
export function wordsAndIdeas(units, nameOf = (unit) => unit.slice(2)) {
  const words = [];
  const ideas = [];
  for (const unit of units) (unit.startsWith("p:") ? ideas : words).push(nameOf(unit));
  return { words, ideas };
}

/**
 * What you did on a day, from what's handed in (so it runs in Node too), all at once (the page asks crossings' questions a few at a time,
 * so a tap never waits on them):
 *   things     its finished things (done.js thingsOn): [{ kind, id, at }]
 *   evidence   every evidence row (progress.js allEvidence), each { at, concept (the unit: "w:huis"), lang? }
 *   knewAt     (unit, moment) → whether you knew it well then (understood on its own evidence until that moment)
 *   rose       (row) → whether it could have raised its unit (dayUnits)
 *   lessonTitle (id) → a finished lesson's title, or null
 *   nameOf     (unit) → how a word, phrase or idea is shown
 * Returns { words: [name], ideas: [name], lessons: [title], untitled, sessions, minutes, talks }.
 * A unit counts for the day only when it had evidence that day and you knew it well at the day's end and not at its start: its strength
 * moves only when it's answered.
 */
export function dayDoings(key, { things = [], evidence = [], lang, knewAt, rose, lessonTitle = () => null, nameOf = (unit) => unit.slice(2) }) {
  const asking = crossings(dayUnits(key, { evidence, lang, rose }), dayBounds(key));
  while (!asking.done) asking.step(knewAt);
  return { ...wordsAndIdeas(asking.crossed, nameOf), ...dayThings(things, lessonTitle) };
}
