// Reminders on this device (src/reminders.ts sends them): whether this browser can get them, turning them on (from a tap:
// the permission prompt, then a Web Push subscription the server keeps), off, and the device's report. The report is
// all the server ever learns: the 4 am days you studied (the last 14), your pauses, how many reviews are due today (on
// a comeback, today's share), the language's name, your time zone, and for the week's note three counts. Never what you
// studied. With reminders off nothing is sent, and turning them off on your last device deletes what was kept.
// On iPhone and iPad, Web Push works only in the app added to the Home Screen (iOS 16.4 and later): there, Settings
// shows the way to add it instead (shell/settings-install.js).

import { api, post } from "./shell/api.js";
import { deviceTag } from "./sync.js";
import { finishedBetween, onDoneChange, pauses, streakNow } from "./study/done.js";
import { addDays, dayKey } from "./know/streak.js";
import { overview } from "./study/plan.js";
import { learningName } from "./study/learning.js";
import { onProgressChange } from "./study/progress.js";
import { growth } from "./know/summary.js";
import { sampleOn } from "./study/sample-mode.js";

const ON = "lx.reminders.on";
const ASKED = "lx.reminders.asked";

const readFlag = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeFlag = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
};

const installedApp = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const appleMobile = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1);

/**
 * What this browser can do: { can (Web Push works here now), needsHomeScreen (an iPhone or iPad browser tab: only the
 * Home Screen app can), permission ("granted" · "denied" · "default" · "unsupported"), on (reminders on, on this device) }.
 */
export function pushSupport() {
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const needsHomeScreen = appleMobile() && !installedApp();
  return {
    can: hasPush && !needsHomeScreen,
    needsHomeScreen,
    permission: "Notification" in window ? Notification.permission : "unsupported",
    on: readFlag(ON) === "1",
  };
}

/** Whether the ask after a first finished session was answered (Yes or Not now): it never comes back. */
export const askedAboutReminders = () => readFlag(ASKED) === "1";
export const answeredAsk = () => writeFlag(ASKED, "1");

// Whether this server can send reminders at all: a copy run without push keys can't. Asked once a page, and asked before anything asks
// the phone for its permission, so a learner is never asked for one nothing could use. The ask and Settings → Reminders ask it while
// they're drawn, so by a press it's known and the phone's prompt still comes from the press itself. The key, as the bytes
// PushManager.subscribe wants; false: it can't; null: not known yet.
let serverPush = null;
let serverAsking = null;
const keyBytes = (key) => {
  const s = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
/** Whether this server can send reminders (a promise: asked once a page; a failure to ask is asked again next time). */
export function serverCanSend() {
  if (serverPush !== null) return Promise.resolve(Boolean(serverPush));
  serverAsking ??= api("/api/push/key").then(
    ({ key }) => {
      serverPush = key ? keyBytes(key) : false;
      return Boolean(serverPush);
    },
    (error) => {
      serverAsking = null;
      throw error;
    },
  );
  return serverAsking;
}
/** What's known now without asking: true, false, or null (not asked yet, or the asking failed). */
export const serverSendsKnown = () => (serverPush === null ? null : Boolean(serverPush));

/** What the server is told (see the top of this file). */
export function reportBody(now = Date.now()) {
  const s = streakNow({ now });
  const today = dayKey(now);
  const studied = [];
  for (let i = 13; i >= 0; i--) {
    const day = addDays(today, -i);
    if (s.statuses[day] === "studied") studied.push(day);
  }
  let due = 0;
  let words = 0;
  try {
    due = overview(now).due;
    // Words you'd recall now, against a week ago (summary.js growth: one point a day, today last).
    const points = growth({ now });
    words = Math.max(0, points.at(-1).n - (points.at(-8)?.n ?? 0));
  } catch {}
  return {
    device: deviceTag(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    studied,
    pauses: pauses().map(({ from, to }) => ({ from, to })),
    due,
    lang: learningName(),
    // Chapters aren't counted yet: the week's note leaves a 0 out.
    week: { days: streakWeek(s, today), words, chapters: 0 },
  };
}
// Days studied in the week so far (Monday first).
function streakWeek(s, today) {
  const d = new Date(`${today}T12:00:00`);
  const monday = addDays(today, -((d.getDay() + 6) % 7));
  let n = 0;
  for (let i = 0; i < 7; i++) if (s.statuses[addDays(monday, i)] === "studied") n++;
  return n;
}

/**
 * A new learner's reminder time: the hour their first session ended on this device (now, if none has), kept between 8:00 and
 * 21:00 so it never falls in the default quiet hours. Each learner's own hour, so a big day's learners aren't all due at one 7 pm.
 */
export function startTime(now = Date.now()) {
  const hour = new Date(finishedBetween(0, now + 1)[0]?.at ?? now).getHours();
  return `${String(Math.min(21, Math.max(8, hour))).padStart(2, "0")}:00`;
}

/**
 * Turns reminders on, from a tap (browsers ask for permission only then): the prompt, a subscription, the server told. time: the
 * reminder's time for an account that has none yet (an account with reminders on another device keeps its own).
 * Returns { ok, why? }: "denied" (the person said no, or did before: Settings in the system turns it back on), "home"
 * (an iPhone browser tab), "unsupported", "server" (this server can't send reminders: the phone is never asked), or the server's refusal.
 */
export async function turnOn(time = startTime()) {
  if (sampleOn()) throw new Error("Turn the sample learner off first: reminders go by your own studying.");
  const support = pushSupport();
  if (support.needsHomeScreen) return { ok: false, why: "home" };
  if (!support.can) return { ok: false, why: "unsupported" };
  const device = deviceTag();
  if (!device) return { ok: false, why: "unsupported" };
  if (!(await serverCanSend())) return { ok: false, why: "server" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, why: "denied" };
  const registration = await navigator.serviceWorker.ready;
  let sub = await registration.pushManager.getSubscription();
  if (!sub) sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverPush });
  const json = sub.toJSON();
  await post("/api/push/subscribe", { endpoint: json.endpoint, keys: json.keys, device, time, report: reportBody() });
  writeFlag(ON, "1");
  answeredAsk();
  return { ok: true };
}

/** Turns reminders off on this device (and, on the last one, the server forgets everything it kept). */
export async function turnOff() {
  const registration = await navigator.serviceWorker?.ready;
  const sub = await registration?.pushManager?.getSubscription();
  await sub?.unsubscribe().catch(() => {});
  writeFlag(ON, null);
  await post("/api/push/unsubscribe", { device: deviceTag() }).catch(() => {});
}

let reporting = null;
/** Sends this device's report, when reminders are on here. Returns { stopped } (reminders paused after 7 unanswered). */
export function report() {
  // The sample learner's days aren't yours: reminders go by your own (study/sample-mode.js).
  if (readFlag(ON) !== "1" || sampleOn()) return Promise.resolve({ stopped: false });
  reporting ??= post("/api/reminders/report", reportBody())
    .catch(() => ({ stopped: false }))
    .finally(() => (reporting = null));
  return reporting;
}

/** The app opened: the badge clears (it counts unread notifications only), and the report goes out, then on changes. */
export function startReminders() {
  navigator.clearAppBadge?.().catch?.(() => {});
  if (readFlag(ON) !== "1") return;
  report();
  let timer = null;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(report, 5000);
  };
  onDoneChange(soon);
  onProgressChange(soon);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      navigator.clearAppBadge?.().catch?.(() => {});
      report();
    }
  });
}
