// The streak: how many days in a row you've studied, forgiving by design (../docs/design/retention/README.md).
//   - A day counts once it holds one finished thing: a finished study session, 5 minutes of reading, or a conversation
//     with your AI (study/done.js keeps them). Days from before the log are counted from the evidence, one thing each.
//   - A day starts at 4 am (as Anki's does), so studying at 12:30 am counts for the day before.
//   - Every 7 days studied earns a rest day, up to 2 kept. A missed day uses one by itself.
//   - With none left, a missed day mends when the next day holds two finished things.
//   - A pause (days you set ahead) holds the streak: those days neither count nor break it.
//   - Nothing here ever warns, counts down or costs anything. A break is just day 1 again; the longest stays.
// Pure: no DOM, no storage. Day keys are local dates ("2026-11-01"), fixed when the thing happened, so a trip across
// time zones never splits or merges days.

export const DAY_STARTS = 4; // the hour a new day starts, local time
export const REST_EVERY = 7; // days studied that earn a rest day
export const REST_MOST = 2; // rest days kept at most
export const MEND_NEEDS = 2; // finished things the day after a miss needs to mend it

const DAY = 86_400_000;
const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The day a moment counts for, as a local date key ("2026-11-01"): before 4 am, the day before. */
export function dayKey(at = Date.now()) {
  const d = new Date(at);
  if (d.getHours() < DAY_STARTS) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whether a value is a day key for a real date. */
export function isDayKey(value) {
  const m = typeof value === "string" && KEY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return y >= 2000 && y <= 2200 && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** A day key as a number of days (since 1970), for counting between days. */
export const dayNumber = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};
/** The day key of a day number. */
export const keyOfNumber = (n) => new Date(n * DAY).toISOString().slice(0, 10);
/** The key of the day `n` days after `key` (before, when negative). */
export const addDays = (key, n) => keyOfNumber(dayNumber(key) + n);

/**
 * The streak as of `today`.
 *   things   { [dayKey]: how many finished things that day }
 *   before   day keys studied before the log began (each counts as one thing)
 *   pauses   [{ from, to }] (day keys, both included)
 *   today    the day key it's computed for
 * Returns {
 *   days       the streak: days studied in this run (rest, mended and paused days hold it without adding)
 *   longest    the longest run ever, this one included
 *   rest       rest days kept (0–2)
 *   nextRestIn days of studying until the next rest day (null while 2 are kept)
 *   state      today: "done" (it counts), "open" (a streak, nothing yet today), "mend" (yesterday needs mending:
 *              `need` more finished things today), "paused", or "none" (no streak, nothing yet today)
 *   need       finished things still needed today for it to count (0 once it does)
 *   done       finished things today
 *   pausedUntil  the last day of today's pause, when paused
 *   statuses   { [dayKey]: "studied" | "rested" | "mended" | "paused" | "missed" } from the first day studied to today
 *              ("mended": a missed day covered by the day after it; "rested": one covered by a rest day)
 * }
 */
export function streakOf({ things = {}, before = [], pauses = [], today }) {
  const count = new Map();
  for (const [key, n] of Object.entries(things)) if (isDayKey(key) && n > 0) count.set(key, (count.get(key) ?? 0) + n);
  for (const key of before) if (isDayKey(key) && !count.has(key)) count.set(key, 1);
  const spans = pauses.filter((p) => isDayKey(p?.from) && isDayKey(p?.to) && p.from <= p.to);
  const pauseOf = (key) => spans.find((p) => p.from <= key && key <= p.to);
  const todayN = dayNumber(today);
  const studiedDays = [...count.keys()].map(dayNumber).filter((n) => n <= todayN);
  const statuses = {};
  const out = { days: 0, longest: 0, rest: 0, nextRestIn: REST_EVERY, state: "none", need: 1, done: count.get(today) ?? 0, pausedUntil: null, statuses };
  if (!studiedDays.length) {
    const pause = pauseOf(today);
    if (pause) Object.assign(out, { state: "paused", pausedUntil: pause.to });
    return out;
  }
  let days = 0;
  let longest = 0;
  let rest = 0;
  let toward = 0; // days studied toward the next rest day
  let pending = null; // a missed day waiting on the next day to mend it
  const studied = () => {
    days++;
    toward++;
    if (toward >= REST_EVERY) {
      toward = 0;
      rest = Math.min(REST_MOST, rest + 1);
    }
    longest = Math.max(longest, days);
  };
  const broke = () => {
    days = 0;
    toward = 0;
    rest = 0;
    pending = null;
  };
  for (let n = Math.min(...studiedDays); n <= todayN; n++) {
    const key = keyOfNumber(n);
    const done = count.get(key) ?? 0;
    const paused = pauseOf(key);
    if (n === todayN) {
      if (pending && done >= MEND_NEEDS) {
        statuses[pending] = "mended";
        pending = null;
        studied();
        statuses[key] = "studied";
        out.state = "done";
        out.need = 0;
      } else if (pending) {
        out.state = paused ? "paused" : "mend";
        out.need = paused ? 0 : MEND_NEEDS - done;
        if (paused) out.pausedUntil = paused.to;
        if (paused) statuses[key] = "paused";
      } else if (done >= 1) {
        studied();
        statuses[key] = "studied";
        out.state = "done";
        out.need = 0;
      } else if (paused) {
        statuses[key] = "paused";
        out.state = "paused";
        out.need = 0;
        out.pausedUntil = paused.to;
      } else {
        out.state = days > 0 ? "open" : "none";
        out.need = 1;
      }
      break;
    }
    if (done >= 1) {
      if (pending) {
        if (done >= MEND_NEEDS) {
          statuses[pending] = "mended";
          pending = null;
        } else {
          statuses[pending] = "missed";
          broke();
        }
      }
      studied();
      statuses[key] = "studied";
    } else if (paused) {
      statuses[key] = "paused";
    } else if (days === 0) {
      statuses[key] = "missed";
    } else if (pending) {
      // Two days missed in a row with no rest day: the run is over.
      statuses[pending] = "missed";
      statuses[key] = "missed";
      broke();
    } else if (rest > 0) {
      rest--;
      statuses[key] = "rested";
    } else {
      pending = key;
      statuses[key] = "missed";
    }
  }
  out.days = days;
  out.longest = longest;
  out.rest = rest;
  out.nextRestIn = rest >= REST_MOST ? null : REST_EVERY - toward;
  return out;
}

// ---------- the log's records, as they sync (study/done.js, sync.js kind "streak") ----------

/** A finished thing's kinds, and what its id may be. */
export const THING_KINDS = {
  session: /^[0-9a-f]{16}$/, // a finished study session: its own random id
  practice: /^[0-9a-f]{16}$/, // a finished practice: its own random id
  game: /^[0-9a-f]{16}$/, // a game played by itself, finished (Study's game buttons): its own random id
  lesson: /^[A-Za-z0-9_.%-]{1,100}$/, // a finished lesson: its id, once however often it's done
  read: /^\d{4}-\d{2}-\d{2}#[1-9]\d{0,2}$/, // the nth 5 minutes of reading on a day: "2026-11-01#2"
  talk: /^[A-Za-z0-9_-]{1,80}$/, // a conversation with your AI: its practice's id
};
const PAUSE_ID = /^[0-9a-f]{16}$/;
const MAX_TIME = 8.64e15;
const isTime = (v) => Number.isFinite(v) && v > 0 && v < MAX_TIME;
const exactly = (value, fields) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join() === [...fields].sort().join();

/** What a record's key names: { type: "thing", kind, id } or { type: "pause", id }, or null. */
export function recordKey(key) {
  if (typeof key !== "string" || key.length > 120) return null;
  const colon = key.indexOf(":");
  const kind = key.slice(0, colon);
  const id = key.slice(colon + 1);
  if (kind === "pause") return PAUSE_ID.test(id) ? { type: "pause", id } : null;
  return Object.hasOwn(THING_KINDS, kind) && THING_KINDS[kind].test(id) ? { type: "thing", kind, id } : null;
}

/**
 * Whether a record from another device may be taken (both untrusted): a finished thing { at, value: { day } }, never
 * deleted; a pause { at, value: { from, to } } (at most a year long), or its deletion { at, gone: true }.
 */
export function checkRecord(record, key) {
  const parts = recordKey(key);
  if (!parts || !record || typeof record !== "object" || Array.isArray(record) || !isTime(record.at)) return false;
  if (parts.type === "thing") {
    if (record.gone || !exactly(record, ["at", "value"]) || !exactly(record.value, ["day"]) || !isDayKey(record.value.day)) return false;
    // A reading thing names its own day.
    return parts.kind !== "read" || parts.id.startsWith(`${record.value.day}#`);
  }
  if (record.gone) return exactly(record, ["at", "gone"]) && record.gone === true;
  const v = record.value;
  return exactly(record, ["at", "value"]) && exactly(v, ["from", "to"]) && isDayKey(v.from) && isDayKey(v.to) && v.from <= v.to && dayNumber(v.to) - dayNumber(v.from) <= 366;
}
