// The things you finished, day by day: what the streak counts (know/streak.js has the rules). Kept on this device and
// synced through your own storage (sync.js kind "streak"), so every device counts the same days.
//   session   a study session you finished (session.js calls finishedSession at its summary)
//   practice  a practice you finished; lesson  a lesson you finished, once each
//   read      each 5 minutes of reading in a day, from the reader's evidence (page turns, gaps capped at 3 minutes)
//   talk      a conversation with your AI, once it holds 3 of your turns (from the practice's evidence)
// Reading and talk are noticed here as their evidence is recorded, each under a key every device would give it, so two
// devices never count one twice. A thing's day is fixed when it happens (a trip across time zones moves nothing).
// Pauses (days you set ahead, for a trip or an illness) are kept here too.
// Days from before this device kept the log count from the evidence (any studying, one thing each), so a streak
// already under way isn't lost.

import { evidenceBefore, evidenceSince, onProgressChange } from "./progress.js";
import { addDays, checkRecord, dayKey, recordKey, streakOf } from "../know/streak.js";
import { registerSync } from "../sync.js";
import { sampleKey } from "./sample-mode.js";

/** The log's keys, as yours are named (the sample learner's are its own: sample-mode.js). */
export const DONE_KEYS = { log: "lx.streak.v1", since: "lx.streak.since" };
const KEY = sampleKey(DONE_KEYS.log);
const SINCE_KEY = sampleKey(DONE_KEYS.since);
const READ_MINUTES = 5;
const READ_GAP = 3 * 60_000; // a gap between page turns counts up to this much
const TALK_TURNS = 3;
const listeners = new Set();

// { things: { "<kind>:<id>": { at, day } }, pauses: { <id>: { at, from, to } | { at, gone: true } } }
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved && typeof saved === "object") return { things: saved.things ?? {}, pauses: saved.pauses ?? {} };
  } catch {}
  return { things: {}, pauses: {} };
}
let log = load();

// When this device started keeping the log: days before it count from the evidence.
function firstRun() {
  try {
    const saved = Number(localStorage.getItem(SINCE_KEY));
    if (Number.isFinite(saved) && saved > 0) return saved;
    const now = Date.now();
    localStorage.setItem(SINCE_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}
const startedAt = firstRun();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // Private browsing: the log lasts for this visit.
  }
  for (const fn of listeners) fn();
}
if (typeof addEventListener === "function") {
  addEventListener("storage", (event) => {
    if (event.key !== KEY) return;
    log = load();
    for (const fn of listeners) fn();
  });
}

/** Calls fn whenever the log changes (here, in another tab, or from a sync). Returns a function that stops it. */
export function onDoneChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const hex16 = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Records a finished thing under its key, once: true when it's new. */
function finished(kind, id, at = Date.now()) {
  const key = `${kind}:${id}`;
  if (log.things[key] || !recordKey(key)) return false;
  log.things[key] = { at, day: dayKey(at) };
  save();
  return true;
}

/** A lesson finished, once each however often it's done: what the path goes by. */
export const finishedLesson = (id, at = Date.now()) => finished("lesson", encodeURIComponent(id), at) || finished("session", hex16(), at);

/** A practice finished. */
export const finishedPractice = (at = Date.now()) => finished("practice", hex16(), at);

/** The lessons you've finished, by id. */
export const lessonsFinished = () => new Set(Object.keys(log.things).filter((key) => key.startsWith("lesson:")).map((key) => decodeURIComponent(key.slice(7))));

/** The lesson finished last (its first time), by id; null with none. */
export function lastLessonFinished() {
  let last = null;
  for (const [key, thing] of Object.entries(log.things)) if (key.startsWith("lesson:") && (!last || thing.at > last.at)) last = { id: decodeURIComponent(key.slice(7)), at: thing.at };
  return last?.id ?? null;
}

/** Practices finished since the last lesson (or ever). */
export function practicesSinceLesson() {
  let last = 0;
  for (const [key, thing] of Object.entries(log.things)) if (key.startsWith("lesson:")) last = Math.max(last, thing.at);
  return Object.entries(log.things).filter(([key, thing]) => key.startsWith("practice:") && thing.at > last).length;
}

/** Forgets every finished thing (a test's fresh start). */
export function clearFinished() {
  log = { things: {}, pauses: {} };
  save();
}

/** Practices finished, ever: what makes each one different. */
export const practicesDone = () => Object.keys(log.things).filter((key) => key.startsWith("practice:")).length;

/** Whether you've finished a practice today. */
export const practicedToday = (now = Date.now()) => Object.entries(log.things).some(([key, thing]) => key.startsWith("practice:") && thing.day === dayKey(now));

/** A study session finished (its summary is on the screen). */
export const finishedSession = (at = Date.now()) => finished("session", hex16(), at);

/** A game played by itself finished (Study's game buttons, #study/session/game/<game>): a session of its own kind, so what you did reads as games. */
export const finishedGame = (at = Date.now()) => finished("game", hex16(), at);

// Reading and talk, from the evidence as it's recorded: today's reader rows, and recent practice rows.
function noticeEvidence(now = Date.now()) {
  const today = dayKey(now);
  const recent = evidenceSince(now - 2 * 86_400_000 + 1); // the last two days only (a year's rows aren't copied for them)
  // Reading: the moments today's pages were recorded, the time between them (each gap up to 3 minutes).
  const moments = [...new Set(recent.filter((row) => row.activity === "reader" && dayKey(row.at) === today).map((row) => row.at))].sort((a, b) => a - b);
  let ms = 0;
  for (let i = 1; i < moments.length; i++) ms += Math.min(READ_GAP, moments[i] - moments[i - 1]);
  const blocks = Math.floor(ms / (READ_MINUTES * 60_000));
  for (let n = 1; n <= Math.min(blocks, 999); n++) finished("read", `${today}#${n}`, moments.at(-1));
  // Talk: a practice's turns (the moments its rows were recorded); its third makes it a finished thing.
  const turns = new Map();
  for (const row of recent) {
    if (!row.activity?.startsWith("practice") || typeof row.practice !== "string") continue;
    if (!turns.has(row.practice)) turns.set(row.practice, new Set());
    turns.get(row.practice).add(row.at);
  }
  for (const [practice, set] of turns) {
    if (set.size < TALK_TURNS) continue;
    finished("talk", practice, [...set].sort((a, b) => a - b)[TALK_TURNS - 1]);
  }
}
let noticing = false;
onProgressChange(() => {
  if (noticing) return;
  noticing = true;
  try {
    noticeEvidence();
  } finally {
    noticing = false;
  }
});

// ---------- pauses ----------

/** The pauses that stand: [{ id, from, to }], earliest first. */
export function pauses() {
  return Object.entries(log.pauses)
    .filter(([, p]) => !p.gone)
    .map(([id, p]) => ({ id, from: p.from, to: p.to }))
    .sort((a, b) => (a.from < b.from ? -1 : 1));
}

/** Pauses the streak from `from` to `to` (day keys, both included). Returns its id. */
export function addPause(from, to, at = Date.now()) {
  const id = hex16();
  log.pauses[id] = { at, from, to };
  if (!checkRecord({ at, value: { from, to } }, `pause:${id}`)) {
    delete log.pauses[id];
    throw new Error("A pause runs from one day to a later one, a year at most.");
  }
  save();
  return id;
}

/** Ends a pause: one that hasn't started goes; one under way ends yesterday (today counts again). */
export function endPause(id, now = Date.now()) {
  const p = log.pauses[id];
  if (!p || p.gone) return;
  const today = dayKey(now);
  if (p.from >= today) log.pauses[id] = { at: now, gone: true };
  else log.pauses[id] = { at: now, from: p.from, to: p.to < today ? p.to : addDays(today, -1) };
  save();
}

// ---------- the streak, now ----------

/** What was finished from `from` up to `to` (times), in order: [{ kind, id, at }] (kind: lesson, session, practice, read or talk; a lesson's id its own). */
export function finishedBetween(from, to = Date.now()) {
  return Object.entries(log.things)
    .filter(([, thing]) => thing.at >= from && thing.at < to)
    .map(([key, thing]) => {
      const kind = key.slice(0, key.indexOf(":"));
      const id = key.slice(kind.length + 1);
      return { kind, id: kind === "lesson" ? decodeURIComponent(id) : id, at: thing.at };
    })
    .sort((a, b) => a.at - b.at);
}

/** The things finished on a day (a day key), oldest first: [{ kind, id, at }] (the streak page's day, know/streak-days.js). */
export function thingsOn(day) {
  return Object.entries(log.things)
    .filter(([, thing]) => thing.day === day)
    .map(([key, thing]) => ({ kind: key.slice(0, key.indexOf(":")), id: key.slice(key.indexOf(":") + 1), at: thing.at }))
    .sort((a, b) => a.at - b.at);
}

/** Finished things per day: { [dayKey]: n }. */
export function thingsPerDay() {
  const out = {};
  for (const t of Object.values(log.things)) out[t.day] = (out[t.day] ?? 0) + 1;
  return out;
}

/** The streak as of `now` (know/streak.js streakOf). */
export function streakNow({ now = Date.now() } = {}) {
  // Days before the log began, from the evidence: before the first thing any device kept, and before this device began. A row on that
  // day or after can't be one, and the evidence is in time order, so only the rows before it (and a day's worth past it) are read. A day's
  // key is the same through any quarter of an hour (every time zone is a whole number of quarters off, and the day turns at 4 am), so it's
  // made once a quarter, not once a row.
  const firstThing = Math.min(...Object.values(log.things).map((t) => t.at));
  const start = Math.min(startedAt, firstThing);
  const until = dayKey(start);
  const before = new Set();
  let quarter = NaN;
  let day = null;
  for (const row of evidenceBefore(start + 86_400_000)) {
    const q = Math.floor(row.at / 900_000);
    if (q !== quarter) {
      quarter = q;
      day = dayKey(row.at);
    }
    if (day < until) before.add(day);
  }
  return streakOf({ things: thingsPerDay(), before: [...before], pauses: pauses(), today: dayKey(now) });
}

/** Everything the log keeps, for Settings → Your data's export. */
export const streakExport = () => structuredClone(log);

// ---------- on your other devices (sync.js) ----------

let applying = false;
registerSync({
  id: "streak",
  label: "Your streak",
  icon: "flame",
  counted: (n) => `${n.toLocaleString()} ${n === 1 ? "day's record" : "days' records"}`,
  records() {
    const out = {};
    for (const [key, t] of Object.entries(log.things)) if (recordKey(key)) out[key] = { at: t.at, value: { day: t.day } };
    for (const [id, p] of Object.entries(log.pauses)) out[`pause:${id}`] = p.gone ? { at: p.at, gone: true } : { at: p.at, value: { from: p.from, to: p.to } };
    return out;
  },
  check: checkRecord,
  apply(newer) {
    for (const [key, record] of Object.entries(newer)) {
      const parts = recordKey(key);
      if (!parts) continue;
      if (parts.type === "thing") log.things[key] = { at: record.at, day: record.value.day };
      else log.pauses[parts.id] = record.gone ? { at: record.at, gone: true } : { at: record.at, from: record.value.from, to: record.value.to };
    }
    applying = true;
    try {
      save();
    } finally {
      applying = false;
    }
    return [];
  },
  onChange: (fn) => onDoneChange(() => applying || fn()),
});
