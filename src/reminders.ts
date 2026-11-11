// Reminders (chosen 1 Nov 2026): Web Push to the device you used last, never
// pressure. What exists, each with its own switch: the daily reminder (on), your AI finished something (on), community
// (off), the week (off). The rules:
//   - At most 1 study reminder and 2 notifications in all a day; a study reminder only on a day you haven't studied (and
//     not in a pause), at your time, and never twice. No second, late reminder.
//   - Quiet hours (9:30 pm to 8 am by default, in the device's own time zone): a study reminder that would fall inside
//     them is dropped; any other note waits until they end.
//   - Backing off: after 3 reminders in a row go unanswered (no studying that day, the app not opened), they come every
//     other day; after 7 they stop, with no goodbye. Studying, or opening the app, turns them back on.
//   - The words say what's waiting, never what's at stake: no losses, countdowns, "last chance" or the streak as a threat.
//     The wording rotates (repeating yesterday's does worse: Yancey & Settles, KDD 2020).
// The server never sees what you study: a device reports only the days it studied (4 am days), your pauses, how many
// reviews are due, its time zone, and (for the week's note) three counts. Turning reminders off deletes all of it.
// The cron (wrangler.jsonc, every 15 minutes) looks only at accounts whose next_at has come.

import type { Env } from "./env";
import { allowedEndpoint, payload, send, type Subscription } from "./webpush";

export const DEFAULTS = { daily: true, time: "19:00", cue: "", quietFrom: "21:30", quietTo: "08:00", ai: true, community: false, week: false };
export type Settings = typeof DEFAULTS;
export type State = {
  tz: string;
  studied: string[]; // day keys (4 am days) the device says you studied, the last 14
  pauses: { from: string; to: string }[];
  due: number; // reviews due today (or today's share, coming back after days away)
  lang: string; // the language's name, for the words
  week: { days: number; words: number; chapters: number } | null;
  device: string; // the device used last (its subscription gets the notes)
  openedAt: number;
  ignored: number; // study reminders in a row that went unanswered
  lastReminder: string | null; // the day key of the last study reminder
  lastReminderAt: number;
  counted: number; // the last reminder already counted as answered or not (its lastReminderAt)
  lastWeek: string | null; // the day key the week's note went
  sentDay: string | null; // today's count of notifications, by day
  sentCount: number;
  lastNoteAt: number; // the last note that wasn't a study reminder (AI, community: at most one an hour)
};
export const EMPTY_STATE: State = { tz: "UTC", studied: [], pauses: [], due: 0, lang: "", week: null, device: "", openedAt: 0, ignored: 0, lastReminder: null, lastReminderAt: 0, counted: 0, lastWeek: null, sentDay: null, sentCount: 0, lastNoteAt: 0 };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TICK = 15 * MINUTE;
export const BACK_OFF = 3; // unanswered in a row: every other day
export const STOP_AFTER = 7; // unanswered in a row: no more until you study or open the app
export const DAILY_CAP = 2;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ---------- time in the device's zone ----------

/** Whether a string is a time zone this runtime knows. */
export function validZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
/** A moment in a zone: its calendar date, hour and minute, weekday (0 = Sunday). */
export function zoned(at: number, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(String(parts.weekday)) };
}
const dayNumber = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY);
const addDays = (key: string, n: number) => new Date((dayNumber(key) + n) * DAY).toISOString().slice(0, 10);
/** The 4 am day a moment counts for, in a zone (know/streak.js dayKey's rule). */
export function dayIn(at: number, tz: string) {
  const z = zoned(at, tz);
  return z.minutes < 4 * 60 ? addDays(z.date, -1) : z.date;
}
const toMinutes = (hhmm: string) => {
  const m = HHMM.exec(hhmm)!;
  return Number(m[1]) * 60 + Number(m[2]);
};
/** Whether a local time (minutes) is inside quiet hours (which may run past midnight). */
export function inQuiet(minutes: number, s: Settings) {
  const from = toMinutes(s.quietFrom);
  const to = toMinutes(s.quietTo);
  if (from === to) return false;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

// ---------- what a device sends ----------

const text = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);

/** Settings as stored: each field the type expected, else its default. */
export function readSettings(input: unknown): Settings {
  const o = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULTS };
  for (const k of ["daily", "ai", "community", "week"] as const) if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
  for (const k of ["time", "quietFrom", "quietTo"] as const) if (typeof o[k] === "string" && HHMM.test(o[k] as string)) out[k] = o[k] as string;
  const cue = text(o.cue, 40);
  if (cue !== null) out.cue = cue.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  return out;
}

const pauseOf = (p: unknown) => {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const { from, to } = p as Record<string, unknown>;
  return typeof from === "string" && typeof to === "string" && DAY_KEY.test(from) && DAY_KEY.test(to) && from <= to ? { from, to } : null;
};

/**
 * A device's report, applied to the state (each field only when it's the type expected). The app being open answers
 * the reminders so far, unless they've stopped: then only studying today turns them back on (or the app's button).
 */
export function applyReport(state: State, input: unknown, device: string, now: number): State {
  const o = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const next = { ...state, device, openedAt: now };
  if (validZone(o.tz)) next.tz = o.tz;
  if (Array.isArray(o.studied)) next.studied = [...new Set(o.studied.filter((d): d is string => typeof d === "string" && DAY_KEY.test(d)))].sort().slice(-14);
  if (Array.isArray(o.pauses)) next.pauses = o.pauses.map(pauseOf).filter((p): p is { from: string; to: string } => p !== null).slice(0, 20);
  if (Number.isInteger(o.due) && (o.due as number) >= 0 && (o.due as number) < 100_000) next.due = o.due as number;
  const lang = text(o.lang, 40);
  if (lang !== null) next.lang = lang;
  const w = o.week as Record<string, unknown> | null | undefined;
  if (w && typeof w === "object" && ["days", "words", "chapters"].every((k) => Number.isInteger(w[k]) && (w[k] as number) >= 0 && (w[k] as number) < 100_000)) next.week = { days: w.days as number, words: w.words as number, chapters: w.chapters as number };
  if (next.ignored < STOP_AFTER || next.studied.includes(dayIn(now, next.tz))) next.ignored = 0;
  return next;
}

// ---------- the words ----------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Today's study reminder: rotating wording, what's waiting, the cue as its title when there is one. */
export function reminderWords(state: State, settings: Settings, today: string) {
  const lang = state.lang || "your language";
  const minutes = Math.max(3, Math.min(10, Math.round(state.due * 0.35)));
  const due = state.due;
  const options: [string, string][] = due
    ? [
        ["Ready when you are", `${plural(due, "word")} to review, about ${minutes} minutes.`],
        ["A few minutes of " + lang + "?", `${plural(due, `${lang} word`)} ${due === 1 ? "is" : "are"} ready for you.`],
        ["Time for " + lang, `${plural(due, "word")} to review and something new, about ${minutes} minutes.`],
      ]
    : [
        ["Ready when you are", `Something new in ${lang}, about 5 minutes.`],
        ["A few minutes of " + lang + "?", "A short session is ready for you."],
        ["Time for " + lang, "A few new sentences are ready, about 5 minutes."],
      ];
  const [title, body] = options[dayNumber(today) % options.length]!;
  return settings.cue ? { title: settings.cue, body } : { title, body };
}

// ---------- deciding ----------

export type Message = { kind: "daily" | "ai" | "community" | "week" | "admin"; title: string; body: string; url: string; topic: string; ttl: number; urgency: "low" | "normal" | "high" };
export type Queued = { id: string; kind: "ai" | "community"; title: string; body: string; url: string; at: number };

/**
 * What to send now, and the state after it: { messages, state, done (queued ids sent or dropped), nextAt }. Pure (the
 * clock is `now`), so scripts/test-reminders.mjs runs every rule on a fake clock.
 */
export function decide(settings: Settings, state: State, queue: Queued[], now: number) {
  const tz = validZone(state.tz) ? state.tz : "UTC";
  const z = zoned(now, tz);
  const today = dayIn(now, tz);
  let s: State = state.sentDay === today ? { ...state } : { ...state, sentDay: today, sentCount: 0 };
  const messages: Message[] = [];
  const done: string[] = [];
  const quiet = inQuiet(z.minutes, settings);
  const room = () => s.sentCount < DAILY_CAP;
  const paused = s.pauses.some((p) => p.from <= today && today <= p.to);

  // The last reminder, once its day is over, counts as answered (studied that day, or the app opened since) or not.
  if (s.lastReminder && s.lastReminder < today && s.counted < s.lastReminderAt) {
    const answered = s.studied.includes(s.lastReminder) || s.openedAt >= s.lastReminderAt;
    s = { ...s, ignored: answered ? 0 : s.ignored + 1, counted: s.lastReminderAt };
  }

  // 1. The study reminder.
  const time = toMinutes(settings.time);
  const lastGap = s.lastReminder ? dayNumber(today) - dayNumber(s.lastReminder) : Infinity;
  const due =
    settings.daily &&
    !paused &&
    !s.studied.includes(today) &&
    s.lastReminder !== today &&
    z.minutes >= time &&
    z.minutes < time + 3 * 60 && // a reminder late by hours (the phone off, the cron behind) isn't sent
    !quiet &&
    s.ignored < STOP_AFTER &&
    (s.ignored < BACK_OFF || lastGap >= 2) &&
    room();
  if (due) {
    const words = reminderWords(s, settings, today);
    messages.push({ kind: "daily", ...words, url: "/app/#study/session/day?from=push", topic: "daily", ttl: 3 * 3600, urgency: "normal" });
    s = { ...s, lastReminder: today, lastReminderAt: now, sentCount: s.sentCount + 1 };
  }

  // 2. Notes (your AI finished something, community): off → dropped; quiet → wait; one an hour, batched.
  const wanted = queue.filter((q) => (q.kind === "ai" ? settings.ai : settings.community));
  for (const q of queue) if (!wanted.includes(q)) done.push(q.id);
  if (wanted.length && !quiet && room() && now - s.lastNoteAt >= HOUR) {
    const ai = wanted.filter((q) => q.kind === "ai");
    const community = wanted.filter((q) => q.kind === "community");
    const group = ai.length ? ai : community;
    const first = group[0]!;
    const one = group.length === 1;
    const kind = first.kind;
    const title = one ? first.title : kind === "ai" ? "Your AI finished some things" : "News on what you shared";
    const body = one ? first.body : group.map((q) => q.title).slice(0, 3).join(" · ") + (group.length > 3 ? ` · and ${group.length - 3} more` : "");
    messages.push({ kind, title, body, url: one ? first.url : kind === "ai" ? "/app/#ai" : "/app/#explore", topic: kind, ttl: 12 * 3600, urgency: "low" });
    done.push(...group.map((q) => q.id));
    s = { ...s, lastNoteAt: now, sentCount: s.sentCount + 1 };
  }
  // A note older than two days isn't news any more.
  for (const q of wanted) if (!done.includes(q.id) && now - q.at > 2 * DAY) done.push(q.id);

  // 3. The week, Sunday from 6 pm to 9 pm, once.
  if (settings.week && s.week && z.weekday === 0 && z.minutes >= 18 * 60 && z.minutes < 21 * 60 && s.lastWeek !== today && !quiet && room() && (s.week.days || s.week.words || s.week.chapters)) {
    const w = s.week;
    const body = [plural(w.days, "day"), w.words && `${plural(w.words, "word")} more you'd recall`, w.chapters && plural(w.chapters, "chapter")].filter(Boolean).join(", ");
    messages.push({ kind: "week", title: "This week", body: `${body}.`, url: "/app/#know", topic: "week", ttl: 6 * 3600, urgency: "low" });
    s = { ...s, lastWeek: today, sentCount: s.sentCount + 1 };
  }

  // When to look again: the next quarter hour while notes wait, else around the reminder time, else Sunday evening.
  const pending = wanted.some((q) => !done.includes(q.id));
  const nextAt = pending ? now + TICK : nextLook(settings, s, now, tz);
  return { messages, state: s, done, nextAt };
}

// The next moment worth a look: the reminder time today or tomorrow (local), or Sunday 6 pm for the week's note.
function nextLook(settings: Settings, s: State, now: number, tz: string) {
  const z = zoned(now, tz);
  const candidates: number[] = [];
  const at = (minutesFromNow: number) => now + Math.max(TICK, minutesFromNow * MINUTE);
  if (settings.daily) {
    const t = toMinutes(settings.time);
    candidates.push(at(t > z.minutes ? t - z.minutes : t + 24 * 60 - z.minutes));
  }
  if (settings.week) {
    const minutesToSunday6 = (((7 - z.weekday) % 7) * 24 * 60 + 18 * 60 - z.minutes + 7 * 24 * 60) % (7 * 24 * 60);
    candidates.push(at(minutesToSunday6 || 7 * 24 * 60));
  }
  // At least once a day: the time zone or a pause may have changed, and a report may come in.
  candidates.push(now + DAY);
  return Math.min(...candidates);
}

// ---------- storage (D1: migrations/0015_reminders.sql) ----------

type Row = { user_id: string; settings: string; state: string; next_at: number; updated_at: number };

const parse = <T>(textValue: string | null | undefined, fallback: T): T => {
  try {
    return textValue ? { ...fallback, ...JSON.parse(textValue) } : fallback;
  } catch {
    return fallback;
  }
};

export async function getReminders(env: Env, userId: string) {
  const row = await env.DB.prepare("SELECT settings, state FROM reminders WHERE user_id = ?").bind(userId).first<Row>();
  const subs = await env.DB.prepare("SELECT device FROM push_subscriptions WHERE user_id = ?").bind(userId).all<{ device: string }>();
  const state = parse(row?.state, EMPTY_STATE);
  return { settings: readSettings(row ? JSON.parse(row.settings) : {}), devices: subs.results.map((r) => r.device), stopped: state.ignored >= STOP_AFTER, on: !!row };
}

// ---------- the state, by compare-and-set ----------
// The cron's run and a device's report (or a subscription) each read the state and write it back worked out. Written
// whole, one landing inside the other would be undone: a report's studied day lost (a reminder on a day already
// studied), or the reminder the cron just sent (a second one that day). So every write is a compare-and-set on
// updated_at, and every write moves updated_at forward, at least by 1, so two in the same millisecond still differ.

const WRITE_STATE = "UPDATE reminders SET state = ?, next_at = ?, updated_at = MAX(?, updated_at + 1) WHERE user_id = ? AND updated_at = ?";
const TRIES = 5;

/**
 * The account's state worked out by change() from the state as it is, and written only while nobody has written since
 * it was read; else read and worked out again (up to 5 times). The next look is now. null when there's no row.
 */
async function changeState(env: Env, userId: string, change: (state: State) => State, now: number): Promise<State | null> {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const row = await env.DB.prepare("SELECT state, updated_at FROM reminders WHERE user_id = ?").bind(userId).first<Pick<Row, "state" | "updated_at">>();
    if (!row) return null;
    const state = change(parse(row.state, EMPTY_STATE));
    const written = await env.DB.prepare(WRITE_STATE).bind(JSON.stringify(state), now, now, userId, row.updated_at).run();
    if (written.meta.changes) return state;
  }
  throw new Error("reminders: the state kept changing under a write");
}

/**
 * A cron run's changes (from `read` to `mine`) laid over the state as it is now, when another write came in between:
 * its notifications have gone, so what it changed must stay. A field the other write changed too keeps theirs (it came
 * later: an open's reset, new settings); the sooner next look stays. Nothing when the row has gone (reminders off).
 */
async function overlayState(env: Env, userId: string, read: State, mine: State, nextAt: number, now: number) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const changed = (Object.keys(mine) as (keyof State)[]).filter((k) => !same(mine[k], read[k]));
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const row = await env.DB.prepare("SELECT state, next_at, updated_at FROM reminders WHERE user_id = ?").bind(userId).first<Pick<Row, "state" | "next_at" | "updated_at">>();
    if (!row) return;
    const fresh = parse(row.state, EMPTY_STATE);
    const next: State = { ...fresh };
    for (const k of changed) if (same(fresh[k], read[k])) Object.assign(next, { [k]: mine[k] });
    const written = await env.DB.prepare(WRITE_STATE).bind(JSON.stringify(next), Math.min(nextAt, row.next_at), now, userId, row.updated_at).run();
    if (written.meta.changes) return;
  }
  throw new Error("reminders: the state kept changing under the cron's write");
}

const DEVICE = /^[0-9a-f]{8}$/;

/** A device's subscription (after the person said yes). Refused: an endpoint that isn't a browser's push service. */
export async function subscribe(env: Env, userId: string, body: Record<string, unknown>, now = Date.now()) {
  const keys = (body.keys ?? {}) as Record<string, unknown>;
  const device = typeof body.device === "string" && DEVICE.test(body.device) ? body.device : null;
  if (!allowedEndpoint(body.endpoint) || typeof keys.p256dh !== "string" || !/^[A-Za-z0-9_-]{80,100}$/.test(keys.p256dh) || typeof keys.auth !== "string" || !/^[A-Za-z0-9_-]{20,30}$/.test(keys.auth) || !device) {
    return { ok: false as const, error: "not a push subscription" };
  }
  // One subscription per device: a new one replaces it (an endpoint, if it moves to another account, goes with it).
  await env.DB.batch([
    env.DB.prepare("DELETE FROM push_subscriptions WHERE (user_id = ? AND device = ?) OR endpoint = ?").bind(userId, device, body.endpoint),
    env.DB.prepare("INSERT INTO push_subscriptions (endpoint, user_id, device, p256dh, auth, created_at, used_at, fails) VALUES (?, ?, ?, ?, ?, ?, ?, 0)").bind(body.endpoint, userId, device, keys.p256dh, keys.auth, now, now),
  ]);
  // The account's reminders as they are (a second device), or begun with the defaults at the time the device gives (a new learner's: the
  // hour of their first session, so a big day's learners aren't all due at one 7 pm; push.js startTime); then this device's report.
  await env.DB.prepare("INSERT INTO reminders (user_id, settings, state, next_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id) DO NOTHING")
    .bind(userId, JSON.stringify(readSettings({ time: body.time })), JSON.stringify(EMPTY_STATE), now, now)
    .run();
  await changeState(env, userId, (state) => applyReport(state, body.report ?? {}, device, now), now);
  return { ok: true as const };
}

/** A device stops: its subscription goes; with none left, everything the reminders kept about you goes too. */
export async function unsubscribe(env: Env, userId: string, device: unknown) {
  if (typeof device === "string" && DEVICE.test(device)) await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND device = ?").bind(userId, device).run();
  const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?").bind(userId).first<{ n: number }>();
  if (!left?.n) await env.DB.batch([env.DB.prepare("DELETE FROM reminders WHERE user_id = ?").bind(userId), env.DB.prepare("DELETE FROM push_queue WHERE user_id = ?").bind(userId)]);
  return { ok: true, left: left?.n ?? 0 };
}

/** New settings, from the app. Only for an account that has reminders on (a subscription). */
export async function setSettings(env: Env, userId: string, input: unknown, now = Date.now()) {
  const settings = readSettings(input);
  // The settings, and the unanswered count cleared (turned back on from "Reminders are paused": a fresh start), in one
  // statement: the rest of the state (a report's days) stays as it is now, never as it was read.
  const saved = await env.DB.prepare("UPDATE reminders SET settings = ?, state = json_set(state, '$.ignored', 0), next_at = ?, updated_at = MAX(?, updated_at + 1) WHERE user_id = ?")
    .bind(JSON.stringify(settings), now, now, userId)
    .run();
  if (!saved.meta.changes) return { ok: false as const, error: "reminders are off" };
  return { ok: true as const, settings };
}

/** A device's report (studied days, pauses, due, the week's counts): only for an account with reminders on. */
export async function report(env: Env, userId: string, body: Record<string, unknown>, now = Date.now()) {
  const device = typeof body.device === "string" && DEVICE.test(body.device) ? body.device : null;
  if (!device) return { ok: false as const };
  // Only the state (settings saved meanwhile stay as saved), by compare-and-set (a cron run meanwhile stays too).
  const state = await changeState(env, userId, (s) => applyReport(s, body, device, now), now);
  if (!state) return { ok: false as const };
  await env.DB.prepare("UPDATE push_subscriptions SET used_at = ? WHERE user_id = ? AND device = ?").bind(now, userId, device).run();
  return { ok: true as const, stopped: state.ignored >= STOP_AFTER };
}

/** Something to tell someone (your AI finished a request; a correction to your pack): kept until the cron sends it. */
export async function enqueue(env: Env, userId: string, kind: "ai" | "community", note: { title: string; body: string; url: string }, now = Date.now()) {
  const has = await env.DB.prepare("SELECT next_at FROM reminders WHERE user_id = ?").bind(userId).first<{ next_at: number }>();
  if (!has) return false; // reminders off: nothing kept
  await env.DB.batch([
    env.DB.prepare("INSERT INTO push_queue (id, user_id, kind, title, body, url, at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), userId, kind, note.title.slice(0, 80), note.body.slice(0, 200), note.url.slice(0, 200), now),
    env.DB.prepare("UPDATE reminders SET next_at = MIN(next_at, ?) WHERE user_id = ?").bind(now, userId),
  ]);
  return true;
}

export type Vapid = { privateJwk: JsonWebKey; publicKey: string; subject: string };
export function vapidOf(env: Env): Vapid | null {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return null;
  try {
    return { privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK), publicKey: env.VAPID_PUBLIC_KEY, subject: "https://lexicommons.com" };
  } catch {
    return null;
  }
}


/** Reminders in an account's export: what's kept, and each device's subscription (never its keys). */
export async function exportReminders(env: Env, userId: string) {
  const [row, subs, queue] = await Promise.all([
    env.DB.prepare("SELECT settings, state, next_at, updated_at FROM reminders WHERE user_id = ?").bind(userId).first<Pick<Row, "settings" | "state" | "next_at" | "updated_at">>(),
    env.DB.prepare("SELECT device, endpoint, created_at, used_at, ok_at, failed_at, fails FROM push_subscriptions WHERE user_id = ? ORDER BY created_at").bind(userId).all(),
    env.DB.prepare("SELECT kind, title, body, url, at FROM push_queue WHERE user_id = ? ORDER BY at").bind(userId).all(),
  ]);
  return { settings: row ? JSON.parse(row.settings) : null, state: row ? JSON.parse(row.state) : null, nextLook: row?.next_at ?? null, devices: subs.results, waiting: queue.results };
}

/** Sends one message to one subscription; an ended subscription's row goes. */
export async function deliver(env: Env, vapid: Vapid, userId: string, sub: Subscription & { device: string }, m: Message, fetcher: typeof fetch, now: number) {
  const r = await send(sub, payload({ title: m.title, body: m.body, url: m.url }), vapid, { ttl: m.ttl, urgency: m.urgency, topic: m.topic }, fetcher);
  if (r.gone) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(sub.endpoint).run();
  else if (r.ok) await env.DB.prepare("UPDATE push_subscriptions SET ok_at = ?, fails = 0 WHERE endpoint = ?").bind(now, sub.endpoint).run();
  else await env.DB.prepare("UPDATE push_subscriptions SET failed_at = ?, fails = fails + 1 WHERE endpoint = ?").bind(now, sub.endpoint).run();
  return r;
}

/**
 * How much one cron run does. It takes the accounts whose next look has come a batch at a time until none is left, RUN.most is reached
 * or RUN.budgetMs has gone (the cron's own limit is 15 minutes of wall time and 30 s of CPU, every 15 minutes, so a run never meets the
 * next). Each batch reads its accounts, their queued notes and their devices in three queries; sends RUN.atOnce at a time (a Worker waits
 * on 6 connections at once); and writes RUN.writeEvery accounts back in one D1 batch, which counts as one query of the 1,000 a run may
 * make, so a run cut short loses at most that many accounts' writes (they're looked at again on the next run). Before, a run was 500
 * accounts one after another, with four queries each: a 7 pm with thousands due reached the last hours late, past quiet hours.
 * RUN.most keeps a run's pushes (2 an account at most) and queries under the 10,000 subrequests a Worker invocation makes by default.
 * Measured on the real code (7 Nov 2026, 1,000 accounts due, a push service answering in 100 ms): before, 4 queries, 0.81 ms of CPU and
 * 103 ms an account, 500 a run; now 0.03 queries, 0.60 ms of CPU and 19 ms an account, all 1,000 in one run of 19 s.
 */
export const RUN = { batch: 500, most: 4000, budgetMs: 10 * 60_000, atOnce: 6, writeEvery: 50 };

/** fn over items, n at a time, in order. */
async function atOnce<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

type Device = Subscription & { user_id: string; device: string };

/** One group of accounts: what each is due, sent RUN.atOnce at a time, then every write in one batch. Returns how many went. */
async function sendGroup(env: Env, vapid: Vapid, group: Row[], queued: Map<string, Queued[]>, devices: Map<string, Device[]>, now: number, fetcher: typeof fetch) {
  const plans = group.map((row) => {
    const read = parse(row.state, EMPTY_STATE);
    const result = decide(readSettings(JSON.parse(row.settings)), read, queued.get(row.user_id) ?? [], now);
    const subs = devices.get(row.user_id) ?? [];
    // The device used last gets them; else the one seen most recently.
    const sub = result.messages.length ? (subs.find((s) => s.device === result.state.device) ?? subs[0] ?? null) : null;
    return { row, read, result, sub };
  });
  const jobs = plans.flatMap((p) => (p.sub ? p.result.messages.map((m) => ({ sub: p.sub!, m })) : []));
  // A push service that can't be reached counts as a failed send, as a 5xx does: the run goes on.
  const outcomes = await atOnce(jobs, RUN.atOnce, ({ sub, m }) =>
    send(sub, payload({ title: m.title, body: m.body, url: m.url }), vapid, { ttl: m.ttl, urgency: m.urgency, topic: m.topic }, fetcher).catch(() => ({ ok: false, status: 0, gone: false })),
  );
  // Written while nobody has written since this run read the row (a state write's place is its account's in `plans`); else what it changed
  // goes over what's there now (overlayState).
  const statements = plans.map((p) => env.DB.prepare(WRITE_STATE).bind(JSON.stringify(p.result.state), p.result.nextAt, now, p.row.user_id, p.row.updated_at));
  for (const p of plans) for (const id of p.result.done) statements.push(env.DB.prepare("DELETE FROM push_queue WHERE id = ? AND user_id = ?").bind(id, p.row.user_id));
  jobs.forEach(({ sub }, i) => {
    const r = outcomes[i]!;
    if (r.gone) statements.push(env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(sub.endpoint));
    else if (r.ok) statements.push(env.DB.prepare("UPDATE push_subscriptions SET ok_at = ?, fails = 0 WHERE endpoint = ?").bind(now, sub.endpoint));
    else statements.push(env.DB.prepare("UPDATE push_subscriptions SET failed_at = ?, fails = fails + 1 WHERE endpoint = ?").bind(now, sub.endpoint));
  });
  const written = await env.DB.batch(statements);
  for (const [i, p] of plans.entries()) if (!written[i]?.meta.changes) await overlayState(env, p.row.user_id, p.read, p.result.state, p.result.nextAt, now);
  return outcomes.filter((r) => r.ok).length;
}

/** The cron's run: every account whose next look has come (RUN). Returns what it did, for the log and the tests. */
export async function runReminders(env: Env, now = Date.now(), fetcher: typeof fetch = fetch, clock: () => number = Date.now) {
  const vapid = vapidOf(env);
  if (!vapid) return { looked: 0, sent: 0, skipped: "no VAPID keys" };
  const started = clock();
  const seen = new Set<string>();
  let looked = 0;
  let sent = 0;
  while (looked < RUN.most && clock() - started < RUN.budgetMs) {
    const due = (await env.DB.prepare("SELECT user_id, settings, state, next_at, updated_at FROM reminders WHERE next_at <= ? ORDER BY next_at LIMIT ?").bind(now, RUN.batch).all<Row>()).results;
    // An account this run has already looked at (one whose write met another's and still came out due) waits for the next run.
    const rows = due.filter((r) => !seen.has(r.user_id)).slice(0, RUN.most - looked);
    if (!rows.length) break;
    for (const r of rows) seen.add(r.user_id);
    const ids = JSON.stringify(rows.map((r) => r.user_id));
    const [queue, subs] = await Promise.all([
      env.DB.prepare("SELECT id, user_id, kind, title, body, url, at FROM push_queue WHERE user_id IN (SELECT value FROM json_each(?)) ORDER BY at").bind(ids).all<Queued & { user_id: string }>(),
      env.DB.prepare("SELECT endpoint, user_id, device, p256dh, auth FROM push_subscriptions WHERE user_id IN (SELECT value FROM json_each(?)) ORDER BY used_at DESC").bind(ids).all<Device>(),
    ]);
    const queued = new Map<string, Queued[]>();
    for (const { user_id, ...q } of queue.results) queued.set(user_id, [...(queued.get(user_id) ?? []), q]);
    const devices = new Map<string, Device[]>();
    for (const d of subs.results) devices.set(d.user_id, [...(devices.get(d.user_id) ?? []), d]);
    for (let i = 0; i < rows.length && clock() - started < RUN.budgetMs; i += RUN.writeEvery) {
      const group = rows.slice(i, i + RUN.writeEvery);
      sent += await sendGroup(env, vapid, group, queued, devices, now, fetcher);
      looked += group.length;
    }
    if (due.length < RUN.batch) break;
  }
  return { looked, sent };
}

/** A test notification to this device, from Settings → Reminders. */
export async function sendTest(env: Env, userId: string, device: unknown, fetcher: typeof fetch = fetch, now = Date.now()) {
  const vapid = vapidOf(env);
  if (!vapid || typeof device !== "string" || !DEVICE.test(device)) return { ok: false, error: "can't send" };
  const sub = (await env.DB.prepare("SELECT endpoint, device, p256dh, auth FROM push_subscriptions WHERE user_id = ? AND device = ?").bind(userId, device).first<Subscription & { device: string }>()) ?? null;
  if (!sub) return { ok: false, error: "this device has no subscription" };
  const r = await deliver(env, vapid, userId, sub, { kind: "daily", title: "Reminders are on", body: "This is how they'll look on this device.", url: "/app/#settings/reminders", topic: "test", ttl: 600, urgency: "normal" }, fetcher, now);
  return { ok: r.ok, status: r.status, gone: r.gone };
}
