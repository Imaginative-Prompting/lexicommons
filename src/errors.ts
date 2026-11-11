// Error reports: what broke, kept in our own database and seen by nobody else. The app sends its errors to POST /api/errors
// (public/js/lx/error-report.js); the Worker records its own from app.onError, the MCP tools and the cron. Each is cleaned
// (public/js/lx/error-clean.js) and counted into a group of the same error, with a count for each hour. An admin reads them over
// MCP (error_reports); a spike reaches an admin by push (admin-alerts.ts). Nothing kept says who: no account, no IP, nothing
// typed, no page's address; the route a request took is its pattern, never its path.
//
// Writing is bounded so a flood can't run up the database: per isolate, at most PER_MINUTE writes a minute (the rest are still
// counted into the hour by the next write), and at most GROUP_CAP groups (past it, new kinds are counted as one overflow row).
// D1 saying it's overloaded (its queue full) is never written while it lasts: each write would join the queue that's full (7 Nov
// 2026, the load rehearsal: 6,206 such statements in its worst moments). Each is counted in the isolate (holdOverload), and once
// D1 answers again they're written as one group, counted (flushOverloads), so error_reports still shows the overload happened.

import { cleanMessage, cleanReport, cleanStack, coarseBrowser, ERROR_LIMITS, groupKey, workerOwn } from "../public/js/lx/error-clean.js";
import type { Env } from "./env";
import { sha256Hex } from "./util";

export const ERRORS = Object.freeze({
  groupCap: 500,
  perMinute: 60,
  keepGroups: 30 * 24 * 60 * 60 * 1000, // after a group was last seen
  keepHours: 14 * 24 * 60 * 60 * 1000,
  body: ERROR_LIMITS.body,
});
const HOUR = 60 * 60 * 1000;

export type Source = "client" | "server" | "mcp" | "cron";
export type ErrorRecord = { source: Source; kind: string; name: string; message: string; stack: string; place: string; version: string; browser: string };

// This isolate's writes in the current minute, and the reports it turned away since its last write.
const isolate = { start: 0, writes: 0, held: 0 };
// The D1 overloads this isolate has held back, and when the last one came.
const overloads = { held: 0, last: 0 };
/** Test hook: a fresh isolate. */
export function resetWindow() {
  isolate.start = isolate.writes = isolate.held = 0;
  overloads.held = overloads.last = 0;
}

/**
 * D1's own "overloaded" (D1's error list: its queue too long, waited in too long, or too much used in 10 s), told apart from every
 * other failure: a request it failed is answered 503 with Retry-After (app.ts), and its report held back (holdOverload). Only an error
 * the D1 binding itself threw: workerd's d1-api throws `new Error("D1_ERROR: <message>", { cause })` with the service's error as its
 * cause, and only that cause's words say "overloaded". Words alone (an exception quoting what someone sent) never pass (7 Nov 2026,
 * the launch's security pass).
 */
export function isD1Overloaded(error: unknown): boolean {
  if (!(error instanceof Error) || !/^D1_(EXEC_)?ERROR: /.test(error.message)) return false;
  const cause = (error as Error & { cause?: unknown }).cause;
  return cause instanceof Error && /\bD1 DB is overloaded\b/.test(cause.message);
}
export const OVERLOAD = Object.freeze({
  /** How long after the last overload D1 counts as answering again (a request through, and none overloaded for this long). */
  quiet: 10_000,
  /** What a 503 asks the app to wait, in seconds: D1 drained ~720 round trips a second in the rehearsal, so a queue clears in about one. */
  retryAfter: 1,
});
/** One overload, held back from D1 and counted in this isolate. */
export function holdOverload(now = Date.now()) {
  overloads.held++;
  overloads.last = now;
}
export const overloadsHeld = () => overloads.held;
/**
 * Once D1 answers again (OVERLOAD.quiet after the last overload), what this isolate held as one group, counted: false with nothing
 * to write, too soon, or D1 still refusing it (then they're kept for the next time). Never throws.
 */
export async function flushOverloads(env: Env, now = Date.now()): Promise<boolean> {
  if (!overloads.held || now - overloads.last < OVERLOAD.quiet) return false;
  const count = overloads.held;
  overloads.held = 0;
  const record: ErrorRecord = {
    source: "server",
    kind: "overloaded",
    name: "D1Overloaded",
    message: "D1 was overloaded: the requests it refused were answered 503 with Retry-After, and their reports counted here.",
    stack: "",
    place: "D1",
    version: "",
    browser: "",
  };
  const written = await recordError(env, record, now, count);
  if (!written) overloads.held += count;
  return written;
}

/** Counts one error (or count of the same). Never throws: a report that can't be kept is dropped, and says so in the Worker's log. */
export async function recordError(env: Env, record: ErrorRecord, now = Date.now(), count = 1): Promise<boolean> {
  try {
    if (now - isolate.start >= 60_000) {
      isolate.start = now;
      isolate.writes = 0;
    }
    if (isolate.writes >= ERRORS.perMinute) {
      isolate.held++;
      return false;
    }
    isolate.writes++;
    const counted = count + isolate.held;
    isolate.held = 0;
    const fingerprint = (await sha256Hex(groupKey(record))).slice(0, 16);
    const hour = Math.floor(now / HOUR) * HOUR;
    const overflow = `overflow:${record.source}`;
    const exists = "SELECT 1 FROM error_groups WHERE fingerprint = ?";
    await env.DB.batch([
      env.DB.prepare("UPDATE error_groups SET count = count + ?, last_seen = ?, stack = ?, version = ?, browser = ? WHERE fingerprint = ?").bind(
        count,
        now,
        record.stack,
        record.version,
        record.browser,
        fingerprint,
      ),
      env.DB.prepare(
        `INSERT INTO error_groups (fingerprint, source, kind, name, message, stack, place, version, browser, first_seen, last_seen, count)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (${exists}) AND (SELECT COUNT(*) FROM error_groups) < ?`,
      ).bind(fingerprint, record.source, record.kind, record.name, record.message, record.stack, record.place, record.version, record.browser, now, now, count, fingerprint, ERRORS.groupCap),
      // Past the cap, a new kind is counted in its source's overflow row instead (the INSERT above added nothing).
      env.DB.prepare(
        `INSERT INTO error_groups (fingerprint, source, kind, name, message, stack, place, version, browser, first_seen, last_seen, count)
         SELECT ?, ?, 'overflow', '', 'More kinds of error than are kept: these went uncounted by kind.', '', '', '', '', ?, ?, ?
         WHERE NOT EXISTS (${exists}) AND (SELECT COUNT(*) FROM error_groups) >= ?
         ON CONFLICT (fingerprint) DO UPDATE SET count = count + excluded.count, last_seen = excluded.last_seen`,
      ).bind(overflow, record.source, now, now, count, fingerprint, ERRORS.groupCap),
      env.DB.prepare("INSERT INTO error_hours (hour, source, count) VALUES (?, ?, ?) ON CONFLICT (hour, source) DO UPDATE SET count = count + excluded.count").bind(
        hour,
        record.source,
        counted,
      ),
    ]);
    return true;
  } catch (error) {
    console.warn(JSON.stringify({ error_report_dropped: String((error as Error)?.message ?? error) }));
    return false;
  }
}

/** A report from the app: its JSON, cleaned again here (it can come from anything), with the browser read from the request. */
export async function recordClientReport(env: Env, text: string, userAgent: string, now = Date.now()): Promise<boolean> {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return false;
  }
  const report = cleanReport(input);
  if (!report) return false;
  return recordError(env, { source: "client", ...report, browser: coarseBrowser(userAgent) }, now);
}

/** One of the Worker's own: where is a route pattern ("GET /api/packs/:id"), a tool ("mcp"), or a cron job ("cron reminders"). */
export function serverRecord(source: Exclude<Source, "client">, error: unknown, place: string): ErrorRecord {
  const e = error instanceof Error ? error : null;
  const name = e && /^[A-Za-z][\w$]{0,39}$/.test(e.name) ? e.name : "Error";
  return {
    source,
    kind: "exception",
    name,
    message: cleanMessage(e ? e.message : error),
    stack: cleanStack(e?.stack, workerOwn).join("\n"),
    place: /^[\w\-/:*. ]{1,100}$/.test(place) ? place : "?",
    version: "",
    browser: "",
  };
}

/** One of the Worker's own errors, counted; D1's "overloaded" held back instead (holdOverload), never written while it lasts. */
export async function recordServerError(env: Env, source: Exclude<Source, "client">, error: unknown, place: string, now = Date.now()): Promise<boolean> {
  if (isD1Overloaded(error)) {
    holdOverload(now);
    return false;
  }
  return recordError(env, serverRecord(source, error, place), now);
}

/** The cron's sweep: groups not seen for 30 days, hours older than 14. */
export async function sweepErrors(env: Env, now = Date.now()) {
  const [groups, hours] = await env.DB.batch([
    env.DB.prepare("DELETE FROM error_groups WHERE last_seen < ?").bind(now - ERRORS.keepGroups),
    env.DB.prepare("DELETE FROM error_hours WHERE hour < ?").bind(now - ERRORS.keepHours),
  ]);
  return { groups: groups?.meta.changes ?? 0, hours: hours?.meta.changes ?? 0 };
}

type GroupRow = { fingerprint: string; source: string; kind: string; name: string; message: string; stack: string; place: string; version: string; browser: string; first_seen: number; last_seen: number; count: number };

/** What error_reports shows: the groups seen in the window, newest first, and the last 48 hours' counts by source. */
export async function errorReports(env: Env, { source, sinceHours = 168, limit = 30 }: { source?: Source; sinceHours?: number; limit?: number } = {}, now = Date.now()) {
  const since = now - sinceHours * HOUR;
  const [groups, total, hours] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM error_groups WHERE last_seen >= ? AND (? IS NULL OR source = ?) ORDER BY last_seen DESC LIMIT ?").bind(since, source ?? null, source ?? null, limit),
    env.DB.prepare("SELECT COUNT(*) AS kinds, COALESCE(SUM(count), 0) AS errors FROM error_groups WHERE last_seen >= ? AND (? IS NULL OR source = ?)").bind(since, source ?? null, source ?? null),
    env.DB.prepare("SELECT hour, source, count FROM error_hours WHERE hour >= ? ORDER BY hour").bind(Math.floor(now / HOUR) * HOUR - 47 * HOUR),
  ]);
  const iso = (ms: number) => new Date(ms).toISOString();
  const byHour = new Map<number, Record<string, number>>();
  for (const row of (hours?.results ?? []) as { hour: number; source: string; count: number }[]) {
    byHour.set(row.hour, { ...(byHour.get(row.hour) ?? {}), [row.source]: row.count });
  }
  const sums = (total?.results?.[0] ?? { kinds: 0, errors: 0 }) as { kinds: number; errors: number };
  return {
    window: `the last ${sinceHours} h${source ? `, ${source} only` : ""}`,
    kinds: sums.kinds,
    errors_in_those_kinds: sums.errors,
    groups: ((groups?.results ?? []) as GroupRow[]).map((g) => ({ ...g, first_seen: iso(g.first_seen), last_seen: iso(g.last_seen) })),
    last_48_hours: [...byHour].map(([hour, counts]) => ({ hour: iso(hour), ...counts })),
    kept: "A kind of error goes 30 days after it was last seen; the hourly counts after 14 days. error_reports_clear removes kinds you've fixed.",
  };
}

/** Removes groups (by fingerprint, or every one); the hourly counts stay, since they're the trend. */
export async function clearErrors(env: Env, target: { fingerprints?: string[]; all?: boolean }) {
  if (target.all) return (await env.DB.prepare("DELETE FROM error_groups").run()).meta.changes ?? 0;
  const fingerprints = (target.fingerprints ?? []).slice(0, 100);
  if (!fingerprints.length) return 0;
  const result = await env.DB.prepare(`DELETE FROM error_groups WHERE fingerprint IN (${fingerprints.map(() => "?").join(", ")})`).bind(...fingerprints).run();
  return result.meta.changes ?? 0;
}

/** The facts the spike alert reads (admin-alerts.ts): this hour so far, the last whole hour, the 24 hours before that, kinds seen. */
export async function errorFacts(env: Env, now = Date.now()) {
  const current = Math.floor(now / HOUR) * HOUR;
  const previous = current - HOUR;
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COALESCE(SUM(count), 0) FROM error_hours WHERE hour = ?) AS errorsNow,
       (SELECT COALESCE(SUM(count), 0) FROM error_hours WHERE hour = ?) AS errorsLastHour,
       (SELECT COALESCE(SUM(count), 0) FROM error_hours WHERE hour >= ? AND hour < ?) AS errorsDayBefore,
       (SELECT COUNT(*) FROM error_groups WHERE last_seen >= ?) AS errorKinds`,
  )
    .bind(current, previous, previous - 24 * HOUR, previous, previous)
    .first<{ errorsNow: number; errorsLastHour: number; errorsDayBefore: number; errorKinds: number }>();
  return row ?? { errorsNow: 0, errorsLastHour: 0, errorsDayBefore: 0, errorKinds: 0 };
}
