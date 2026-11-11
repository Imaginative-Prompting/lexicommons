// What reaches a person about moderation and errors, by push, from the Worker's cron, so it doesn't depend on the moderator's runner
// (tools/mod-agent, on a Mac that sleeps). Worked out from the rows each run, so nothing a report or a decision does has to
// remember to send one, and what was sent is in the admin log (action alert.*), which is also what stops it being sent twice.
//
//   severe     a report of minors or illegal content: at the next run, at any hour. It's hidden already; an admin decides.
//   admin      something else only an admin can settle: an escalated report, a counter-notice, a book shared from a source that isn't a
//              known open one (community-books.ts, waiting for decide_shared_book). Within the hour, outside quiet hours.
//   stuck      reports waiting longer than STUCK_AFTER, or an admin's cases waiting longer than a day: the runner has stopped, hit
//              a ceiling, or nobody has looked. Once a day, outside quiet hours, for as long as it's true.
//   errors     errors spiking (errors.ts): an hour, this one so far or the last whole one, with at least ERROR_SPIKE.floor errors and
//              ERROR_SPIKE.times the day before's hourly mean. At most every 6 hours, outside quiet hours.
//   bugs       bug reports (bug-reports.ts): a new one since the last push, batched as an admin's cases are: at most hourly, outside
//              quiet hours, saying how many are open (never what one says).
//
// A push says how many and of what, never what a report or an item says, since a phone shows it on its lock screen. There are
// no admin screens, so it opens the app and the admin works mod_queue over MCP. It goes to every device of every admin, past the
// learner's rules in reminders.ts (those are promises about studying; this is the admin's job). An admin with no device gets
// nothing, and the log says so; /api/v1/mod/pending reports how many devices would hear, so the runner can say that too.

import type { Env } from "./env";
import { bugFacts } from "./bug-reports";
import { errorFacts } from "./errors";
import { DEFAULTS, deliver, EMPTY_STATE, inQuiet, type Message, readSettings, vapidOf, validZone, zoned } from "./reminders";
import { logAdmin } from "./roles";
import type { Subscription } from "./webpush";

export const STUCK_AFTER = 6 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ADMIN_WAITING_AFTER = DAY;
export const ERROR_SPIKE = Object.freeze({ floor: 25, times: 4, every: 6 * HOUR });
const ACTOR = "system";
const VIA = "cron";

type Facts = {
  severe: number;
  severeNewest: number;
  admin: number;
  adminNewest: number;
  adminOldest: number | null;
  open: number;
  openOldest: number | null;
} & Awaited<ReturnType<typeof errorFacts>> &
  Partial<Awaited<ReturnType<typeof bugFacts>>>;
type Kind = "severe" | "admin" | "stuck" | "errors" | "bugs";

async function facts(env: Env, now: number): Promise<Facts> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM reports WHERE state = 'escalated' AND reason IN ('minors', 'illegal')) AS severe,
       (SELECT COALESCE(MAX(created_at), 0) FROM reports WHERE state = 'escalated' AND reason IN ('minors', 'illegal')) AS severeNewest,
       (SELECT COUNT(*) FROM reports WHERE state = 'escalated' AND reason NOT IN ('minors', 'illegal')) + (SELECT COUNT(*) FROM counter_notices WHERE state IN ('open', 'escalated'))
         + (SELECT COUNT(*) FROM shared_books WHERE state = 'pending') AS admin,
       -- A report can be made escalated, or escalated later (the admin log says when); either is news.
       MAX(
         COALESCE((SELECT MAX(created_at) FROM reports WHERE state = 'escalated' AND reason NOT IN ('minors', 'illegal')), 0),
         COALESCE((SELECT MAX(created_at) FROM admin_log WHERE action = 'mod.escalate'), 0),
         COALESCE((SELECT MAX(created_at) FROM counter_notices WHERE state IN ('open', 'escalated')), 0),
         COALESCE((SELECT MAX(created_at) FROM shared_books WHERE state = 'pending'), 0)
       ) AS adminNewest,
       (SELECT MIN(at) FROM (SELECT created_at AS at FROM reports WHERE state = 'escalated' UNION ALL SELECT created_at FROM counter_notices WHERE state IN ('open', 'escalated') UNION ALL SELECT created_at FROM shared_books WHERE state = 'pending')) AS adminOldest,
       (SELECT COUNT(*) FROM reports WHERE state = 'open') AS open,
       (SELECT MIN(created_at) FROM reports WHERE state = 'open') AS openOldest`,
  ).first<Omit<Facts, keyof Awaited<ReturnType<typeof errorFacts>> | keyof Awaited<ReturnType<typeof bugFacts>>>>();
  return { ...(row ?? { severe: 0, severeNewest: 0, admin: 0, adminNewest: 0, adminOldest: 0, open: 0, openOldest: 0 }), ...(await errorFacts(env, now)), ...(await bugFacts(env)) };
}

/** When each kind was last sent, from the admin log. */
async function lastSent(env: Env): Promise<Record<Kind, number>> {
  const rows = await env.DB.prepare("SELECT action, MAX(created_at) AS at FROM admin_log WHERE action IN ('alert.severe', 'alert.admin', 'alert.stuck', 'alert.errors', 'alert.bugs') GROUP BY action").all<{ action: string; at: number }>();
  const at = (kind: string) => rows.results.find((r) => r.action === `alert.${kind}`)?.at ?? 0;
  return { severe: at("severe"), admin: at("admin"), stuck: at("stuck"), errors: at("errors"), bugs: at("bugs") };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const hoursSince = (at: number, now: number) => Math.max(1, Math.round((now - at) / HOUR));

/** What to send now. Pure: the facts, when each kind last went, and whether it's the admin's quiet hours. */
export function alertsDue(f: Facts, last: Partial<Record<Kind, number>> & Record<Exclude<Kind, "bugs">, number>, quiet: boolean, now: number) {
  const due: { kind: Kind; title: string; body: string; urgency: Message["urgency"] }[] = [];
  if (f.severe && f.severeNewest > last.severe) {
    due.push({ kind: "severe", title: "A serious report needs you", body: `${plural(f.severe, "report")} of minors or illegal content, hidden already. Only an admin can settle them: mod_queue.`, urgency: "high" });
  }
  if (f.admin && f.adminNewest > last.admin && now - last.admin >= HOUR && !quiet) {
    due.push({ kind: "admin", title: "A case needs an admin", body: `${plural(f.admin, "case")} escalated, counter-noticed or a shared book to look at: mod_queue.`, urgency: "normal" });
  }
  const stuckOpen = f.open > 0 && f.openOldest !== null && now - f.openOldest >= STUCK_AFTER;
  const stuckAdmin = f.admin + f.severe > 0 && f.adminOldest !== null && now - f.adminOldest >= ADMIN_WAITING_AFTER;
  if ((stuckOpen || stuckAdmin) && now - last.stuck >= DAY && !quiet) {
    const parts = [
      stuckOpen ? `${plural(f.open, "report")} waiting, the oldest ${hoursSince(f.openOldest!, now)} h: is the monitor running?` : "",
      stuckAdmin ? `${plural(f.admin + f.severe, "case")} waiting for an admin, the oldest ${hoursSince(f.adminOldest!, now)} h.` : "",
    ].filter(Boolean);
    due.push({ kind: "stuck", title: "The report queue is waiting", body: parts.join(" "), urgency: "normal" });
  }
  const errorsHour = Math.max(f.errorsNow, f.errorsLastHour);
  const usual = f.errorsDayBefore / 24;
  if (errorsHour >= Math.max(ERROR_SPIKE.floor, ERROR_SPIKE.times * usual) && now - last.errors >= ERROR_SPIKE.every && !quiet) {
    const body = `${plural(errorsHour, "error")} in an hour, against about ${Math.round(usual)} an hour the day before, in ${plural(f.errorKinds, "kind")}: error_reports.`;
    due.push({ kind: "errors", title: "Errors are spiking", body, urgency: "normal" });
  }
  // New bug reports: batched, at most hourly, never in quiet hours; the count of open ones, nothing they say.
  const bugsOpen = f.bugsOpen ?? 0;
  const bugsLast = last.bugs ?? 0;
  if (bugsOpen && (f.bugsNewest ?? 0) > bugsLast && now - bugsLast >= HOUR && !quiet) {
    due.push({ kind: "bugs", title: "New bug reports", body: `${plural(bugsOpen, "bug report")} open: bug_reports.`, urgency: "normal" });
  }
  return due;
}

/** How many devices an alert would reach (every admin's). */
export async function adminDevices(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id IN (SELECT user_id FROM user_roles WHERE role = 'admin')").first<{ n: number }>();
  return row?.n ?? 0;
}

/** The cron's run. Returns what it did, for the log and the tests. */
export async function runAdminAlerts(env: Env, now = Date.now(), fetcher: typeof fetch = fetch) {
  const f = await facts(env, now);
  if (!f.severe && !f.admin && !f.open && !f.bugsOpen && Math.max(f.errorsNow, f.errorsLastHour) < ERROR_SPIKE.floor) return { due: 0, sent: 0 };
  const vapid = vapidOf(env);
  if (!vapid) return { due: 0, sent: 0, skipped: "no VAPID keys" };
  const subs = (await env.DB.prepare(
    `SELECT s.user_id, s.endpoint, s.device, s.p256dh, s.auth, r.settings, r.state FROM push_subscriptions s JOIN user_roles a ON a.user_id = s.user_id AND a.role = 'admin' LEFT JOIN reminders r ON r.user_id = s.user_id`,
  ).all<Subscription & { user_id: string; device: string; settings: string | null; state: string | null }>()).results;
  // One admin's quiet hours rule all: on launch there's one, and an alert held for one is better than an alert at 3 am.
  const first = subs[0];
  const settings = first?.settings ? readSettings(JSON.parse(first.settings)) : DEFAULTS;
  const tz = first?.state ? (JSON.parse(first.state) as typeof EMPTY_STATE).tz : "UTC";
  const quiet = inQuiet(zoned(now, validZone(tz) ? tz : "UTC").minutes, settings);
  const due = alertsDue(f, await lastSent(env), quiet, now);
  if (!due.length) return { due: 0, sent: 0 };
  if (!subs.length) {
    // Nobody to tell, and the log is the only place it can say so. The next run looks again.
    console.warn(JSON.stringify({ admin_alert: "no admin device", kinds: due.map((d) => d.kind) }));
    return { due: due.length, sent: 0, skipped: "no admin device" };
  }
  let sent = 0;
  for (const alert of due) {
    const message: Message = { kind: "admin", title: alert.title, body: alert.body, url: "/app/", topic: `admin-${alert.kind}`, ttl: 24 * 3600, urgency: alert.urgency };
    let reached = 0;
    for (const sub of subs) if ((await deliver(env, vapid, sub.user_id, sub, message, fetcher, now)).ok) reached++;
    sent += reached;
    // Marked only once it reached a device: a push service that's down gets another try at the next run.
    if (reached) await logAdmin(env, { actorId: ACTOR, via: VIA, action: `alert.${alert.kind}`, note: `${alert.body} (${reached} of ${subs.length} devices)` });
    else console.warn(JSON.stringify({ admin_alert: "not delivered", kind: alert.kind, devices: subs.length }));
  }
  return { due: due.length, sent };
}
