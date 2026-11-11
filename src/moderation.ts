// Moderation for what's shared in Explore: reports first, with no AI pass over everything. The rules:
//   - a complete copyright notice hides the item at once (no review first);
//   - a report of anything involving minors, or illegal content, hides it at once and goes to the top of the queue;
//   - any other reason hides it once three accounts at least a week old have open reports on it, or a moderator says so.
// Hidden means not listed and not served, and followers' devices drop it. The owner can answer with a counter-notice.
// A moderator (role 'moderator' or 'admin') works the queue: hide, restore, uphold or dismiss, escalate to an admin. Bans
// are an admin's. Three upheld copyright reports against one account stop it sharing (the repeat-infringer rule).
// Daily limits per account keep the community from being flooded; new accounts (their first week) get tighter ones.
// The library's own packs (curated) are an admin's: a report never hides one, it goes to an admin, who takes it off with
// library_unpublish (a hide wouldn't last anyway: the next catalog write lists every default pack again).
// Every moderator action is in the admin log.
// Corrections (corrections.ts) are reported and decided the same way, on their own `shown` (visible, hidden, removed):
// any reason but copyright (a correction holds no work of its own); hidden at once for minors or illegal content, or
// once three established accounts report it; upheld, it's down for good; dismissed, it's back. Its author sees why.
//
// Two moderators (or a moderator and a new report) can act on one item at once, so every decision is one batch whose
// writes are conditional on what the decision read: a report settled twice, or an item that changed meanwhile, comes
// back as "look again" and changes nothing.

import { plainItems, sentencesOf } from "../public/js/study/pack-items.js";
import { upgradePack } from "../public/js/study/pack-format.js";
import { adminDevices } from "./admin-alerts";
import type { Env } from "./env";
import { LibraryError } from "./library";
import { itemSentence, packKey } from "../public/js/study/pack-format.js";
import { joinWords as joinWordsJs, LANGUAGES as LANGUAGES_JS } from "../public/js/read/book-format.js";
import { logAdmin, rolesOf } from "./roles";
import { randomId } from "./util";

export const REPORT_REASONS = ["copyright", "minors", "illegal", "abuse", "spam", "personal", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
const AT_ONCE: ReportReason[] = ["minors", "illegal"];
const HIDE_AT = 3;
const ESTABLISHED_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STRIKES = 3;
/** Someone whose copyright notices were dismissed this many times loses the fast path: their notices wait in the queue. */
const FAST_PATH_LOST_AT = 3;

/** What an account may do in a day: [established, in its first week]. */
export const LIMITS = {
  share: [10, 3],
  version: [30, 10],
  report: [20, 5],
  correction: [60, 20],
  follow: [300, 100],
  like: [300, 100],
  request: [5, 2],
  answer: [30, 10],
  grammar: [20, 5],
  // Books in Explore (community-books.ts): 5 a day; a new version or layer as a pack's version; adding one to a reading library as a follow.
  book: [5, 5],
  bookVersion: [30, 10],
  bookFollow: [300, 100],
} as const;
export type LimitKind = keyof typeof LIMITS;
/** What an account's shared packs and books may hold in Explore, every version counted: [established, in its first week]. */
export const STORAGE = [200 * 1024 * 1024, 50 * 1024 * 1024] as const;

/** A banned account's refusal (403 in the app). */
export class Banned extends LibraryError {}
/** A day's allowance used up (429 in the app). */
export class OverLimit extends LibraryError {}

export const DEFAULT_POLICY = `How to work the Lexicommons report queue (the moderator's rules; an admin changes them with moderation_policy).

You moderate what people share in Explore: packs of sentences for learning a language. Reports bring things to you;
nothing is checked before it's shared. Work the queue oldest and worst first (mod_queue), one case at a time
(mod_get), and write why for every decision: the note goes in the record, the owner sees the reason.

- Copyright: a complete notice hides the item at once, unless its sender's notices were dismissed three times before;
  then it waits for you with the item still up. Don't judge the claim. Uphold it (the item comes down for good) unless
  the notice is plainly not about this item, or the reporter is plainly abusing notices; then dismiss it (a hidden
  item comes back). Counter-notices are an admin's: escalate them with the case laid out, and leave the report a
  counter-notice answers to the admin too.
- Minors, or illegal content: escalate at once, with what you saw; never restore it yourself.
- Abuse, hate, harassment, sexual content: uphold (it comes down for good). Hide only while you look into a reported
  pack (a hide lasts while a report on it is open).
- Spam or not what it says (a "Dutch" pack that isn't Dutch, junk, ads): uphold.
- Personal information (someone's address, phone number, private details): uphold.
- A report about quality ("the translations are bad") isn't abuse: dismiss it, and say corrections are the way.
- Corrections (a fix or a flag someone suggested on a pack) come to you by the same reasons. Judge what the correction
  itself says, its value and its note: abuse, spam, personal information or worse in them, uphold (it comes down for
  good, the pack stays as it is). A fix that's merely wrong isn't for you: the pack's author declines it; dismiss.
- Requests (someone asking for a pack, or for a book woven into a language) come to you by the same reasons. Judge
  what the request says, its title and its lines: abuse, spam, personal information or worse, uphold (it comes down
  for good). One that's merely odd, or hard to answer, isn't for you: dismiss. Whether a book may go on the shelf (a
  book request waiting) is an admin's (decide_book_request), never yours.
- Suggestions to a language's grammar come to you by the same reasons. Judge what the suggestion itself says, its text
  and its note: abuse, spam, personal information or worse, uphold. One that's merely wrong isn't for you: an admin
  reviews suggestions anyway; dismiss.
- Books (a text someone shared with its woven layers) come to you by the same reasons as packs, and a copyright notice
  hides one the same way. A book's text is someone else's work, open by its rights; its layers are its sharer's own
  words: judge what the layers say as you'd judge a pack's sentences (mod_get { book } shows each sentence with them).
  Whether a book from an unknown source may go into Explore at all is an admin's (decide_shared_book), never yours.
- When you're unsure, escalate rather than guess.
Reports on Lexicommons' own packs go straight to an admin, not to you. Never ban anyone yourself: bans are an admin's.
Never touch the library (library_*).`;

/** A text field from a request, or undefined (a number or an object isn't text). */
const text = (value: unknown) => (typeof value === "string" ? value : undefined);

// ---------- limits and bans ----------

async function isEstablished(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT created_at FROM users WHERE id = ?").bind(userId).first<{ created_at: number }>();
  return Boolean(row && Date.now() - row.created_at >= ESTABLISHED_MS);
}

/** What an account did of each kind since a time: bind (userId, since). */
const COUNTS: Record<LimitKind, string> = {
  share: "SELECT COUNT(*) FROM items WHERE owner_id = ? AND created_at > ?",
  version: "SELECT COUNT(*) FROM item_versions v JOIN items i ON i.id = v.item_id WHERE i.owner_id = ? AND v.seq > 1 AND v.created_at > ?",
  report: "SELECT COUNT(*) FROM reports WHERE reporter_id = ? AND created_at > ?",
  correction: "SELECT COUNT(*) FROM corrections WHERE author_id = ? AND created_at > ?",
  follow: "SELECT COUNT(*) FROM follows WHERE user_id = ? AND created_at > ?",
  like: "SELECT COUNT(*) FROM likes WHERE user_id = ? AND created_at > ?",
  request: "SELECT COUNT(*) FROM requests WHERE author_id = ? AND created_at > ?",
  answer: "SELECT COUNT(*) FROM request_answers WHERE by_id = ? AND created_at > ?",
  grammar: "SELECT COUNT(*) FROM grammar_suggestions WHERE author_id = ? AND created_at > ?",
  book: "SELECT COUNT(*) FROM shared_books WHERE owner_id = ? AND created_at > ?",
  bookVersion: "SELECT COUNT(*) FROM shared_book_versions v JOIN shared_books b ON b.id = v.book_id WHERE b.owner_id = ? AND v.seq > 1 AND v.created_at > ?",
  bookFollow: "SELECT COUNT(*) FROM book_follows WHERE user_id = ? AND created_at > ?",
};
const LIMIT_WORDS: Record<LimitKind, string> = { share: "new shares", version: "new versions", report: "reports", correction: "corrections", follow: "follows", like: "likes", request: "requests", answer: "answers to requests", grammar: "suggestions to a grammar", book: "books shared", bookVersion: "new versions of shared books", bookFollow: "books added from Explore" };

export interface LimitGuard {
  /** SQL that's true while the account is under its day's allowance (for a write's WHERE). */
  sql: string;
  /** What it binds, in order. */
  binds: unknown[];
  /** The refusal, once a guarded write changed nothing because of it. */
  refusal: () => OverLimit;
}

/** Throws the refusal of the first guard that doesn't hold now: an early answer, or the reason a guarded write did nothing. */
export async function enforce(env: Env, guards: LimitGuard[]): Promise<void> {
  for (const guard of guards) {
    const row = await env.DB.prepare(`SELECT ${guard.sql} AS ok`).bind(...guard.binds).first<{ ok: number }>();
    if (!row?.ok) throw guard.refusal();
  }
}

/** Room for this many more bytes in what the account has shared, packs and books (every version counts; admins have no cap). */
export async function storageGuard(env: Env, userId: string, bytes: number): Promise<LimitGuard> {
  if ((await rolesOf(env, userId)).has("admin")) return { sql: "1", binds: [], refusal: () => new OverLimit("") };
  const [established, newcomer] = STORAGE;
  const room = (await isEstablished(env, userId)) ? established : newcomer;
  return {
    sql: "(SELECT COALESCE(SUM(v.bytes), 0) FROM item_versions v JOIN items i ON i.id = v.item_id WHERE i.owner_id = ?) + (SELECT COALESCE(SUM(v.bytes), 0) FROM shared_book_versions v JOIN shared_books b ON b.id = v.book_id WHERE b.owner_id = ?) + ? <= ?",
    binds: [userId, userId, bytes, room],
    refusal: () => new OverLimit(`That would take what you've shared in Explore past ${room / 1024 / 1024} MB, this account's room${room === newcomer ? " in its first week" : ""}. Withdraw a pack or book you no longer need, or share a smaller one.`),
  };
}

/**
 * The day's allowance as a guard for the write itself, so requests sent at once can't all pass a count taken before
 * any of them wrote (admins have none). Undoing a follow or a like frees its place; the counts net out, so that
 * gives nothing to game.
 */
export async function limitGuard(env: Env, userId: string, kind: LimitKind): Promise<LimitGuard> {
  if ((await rolesOf(env, userId)).has("admin")) return { sql: "1", binds: [], refusal: () => new OverLimit("") };
  const [established, newcomer] = LIMITS[kind];
  const limit = (await isEstablished(env, userId)) ? established : newcomer;
  return {
    sql: `(${COUNTS[kind]}) < ?`,
    binds: [userId, Date.now() - DAY_MS, limit],
    refusal: () => new OverLimit(`That's ${limit} ${LIMIT_WORDS[kind]} in a day, this account's limit${limit === newcomer ? " in its first week" : ""}. Try again tomorrow.`),
  };
}

/** Throws OverLimit when the account has used its day's allowance of this: an early answer, before the work of a write. */
export async function checkLimit(env: Env, userId: string, kind: LimitKind): Promise<void> {
  await enforce(env, [await limitGuard(env, userId, kind)]);
}

/** The ban in force on an account for this scope ('share' is covered by a 'community' ban too), or null. */
export async function banOf(env: Env, userId: string, scope: "share" | "community") {
  return env.DB.prepare(
    "SELECT id, scope, reason, until FROM user_bans WHERE user_id = ? AND lifted_at IS NULL AND (until IS NULL OR until > ?) AND (scope = 'community' OR scope = ?) ORDER BY created_at DESC LIMIT 1",
  )
    .bind(userId, Date.now(), scope)
    .first<{ id: string; scope: string; reason: string; until: number | null }>();
}

/** Throws Banned for a banned account. */
export async function checkBan(env: Env, userId: string, scope: "share" | "community"): Promise<void> {
  const ban = await banOf(env, userId, scope);
  if (ban) throw new Banned(`This account can't ${scope === "share" ? "share in Explore" : "take part in Explore"}${ban.until ? ` until ${new Date(ban.until).toISOString().slice(0, 10)}` : ""}: ${ban.reason}`);
}

// ---------- what holds an item down ----------

// A report that takes an item down by itself (a copyright notice with the fast path, minors, illegal content) is marked
// action = 'hidden' when it's filed. target below is the item's id as SQL: "?" (bound) or a column (i.id).
const cutoff = () => Date.now() - ESTABLISHED_MS;
type Target = "item" | "correction" | "request" | "grammar" | "book";
/**
 * What's moderated by its state (live, hidden, withdrawn, removed): a shared pack (an item), or a shared book (community-books.ts, migration
 * 0028). Both tables have the same moderation columns (owner_id, curated, state, state_reason, state_at; a book's curated is always 0), so
 * each decision's SQL is the same with the table and the kind put in. Fixed names, never anything from a request.
 */
export type Work = "item" | "book";
const WORKS: Record<Work, { table: string; noun: string; withdraw: string; get: string }> = {
  item: { table: "items", noun: "pack", withdraw: "withdraw_shared", get: "mod_get { id }" },
  book: { table: "shared_books", noun: "book", withdraw: "withdraw_shared_book", get: "mod_get { book }" },
};
// Three established accounts' reports, open or escalated (escalating one keeps the item down while an admin looks).
const countedOf = (kind: Target, target: string) =>
  `(SELECT COUNT(DISTINCT h.reporter_id) FROM reports h JOIN users u ON u.id = h.reporter_id WHERE h.target_kind = '${kind}' AND h.target_id = ${target} AND h.state IN ('open', 'escalated') AND u.created_at <= ?) >= ${HIDE_AT}`;
/**
 * SQL that's true while reports take an item down (it would be hidden): a marked report still open or escalated, an
 * upheld one, or reports from three established accounts. It's what keeps a withdrawn pack from being served
 * (books.ts) or listed to its followers. Binds: for "?", (id, id, cutoff); for a column, (cutoff).
 */
const downOf = (kind: Target, target: string) =>
  `(EXISTS (SELECT 1 FROM reports h WHERE h.target_kind = '${kind}' AND h.target_id = ${target} AND (h.state = 'upheld' OR (h.state IN ('open', 'escalated') AND h.action = 'hidden'))) OR ${countedOf(kind, target)})`;
export const downSql = (target: string) => downOf("item", target);
/** downSql for a pack or a book (the same binds as downBinds). */
export const downSqlOf = (work: Work, target: string) => downOf(work, target);
export const downBinds = (target: string, id?: string) => (target === "?" ? [id, id, cutoff()] : [cutoff()]);
/**
 * What blocks an automatic return (a dismissal, a counter-notice upheld): the item is down, or a report on it is
 * escalated (an admin's to decide). A report or counter-notice settled earlier in the same batch no longer counts.
 * Binds for "?": (id, id, cutoff, id).
 */
const heldOf = (kind: Target) => `(${downOf(kind, "?")} OR EXISTS (SELECT 1 FROM reports h WHERE h.target_kind = '${kind}' AND h.target_id = ? AND h.state = 'escalated'))`;
const heldBinds = (itemId: string) => [itemId, itemId, cutoff(), itemId];
/** A moderator's own hide says so in its reason; only a moderator lifts it (mod_restore). */
const BY_MODERATOR = "Hidden by a moderator";

/**
 * Keeps the automatic share ban in step with an account's upheld copyright reports. After a copyright report is upheld
 * ("strike"): three or more and it can't share. After one is overturned ("overturned"): fewer than three and that
 * automatic ban is lifted. (Only those two moments, so an admin's own unban stands until the next strike.)
 */
async function reconcileStrikes(env: Env, ownerId: string, moment: "strike" | "overturned"): Promise<"banned" | "lifted" | null> {
  const now = Date.now();
  if (moment === "strike") {
    const added = await env.DB.prepare(
      `INSERT INTO user_bans (id, user_id, scope, reason, by, created_at)
       SELECT ?, ?, 'share', ?, 'strikes', ? WHERE (${STRIKES_SQL}) >= ${STRIKES}
         AND NOT EXISTS (SELECT 1 FROM user_bans WHERE user_id = ? AND by = 'strikes' AND lifted_at IS NULL)`,
    )
      .bind(randomId(10), ownerId, `${STRIKES} upheld copyright notices.`, now, ownerId, ownerId, ownerId)
      .run();
    return added.meta.changes ? "banned" : null;
  }
  const lifted = await env.DB.prepare(`UPDATE user_bans SET lifted_at = ? WHERE user_id = ? AND by = 'strikes' AND lifted_at IS NULL AND (${STRIKES_SQL}) < ${STRIKES}`).bind(now, ownerId, ownerId, ownerId).run();
  return lifted.meta.changes ? "lifted" : null;
}
/** An account's upheld copyright reports, on its packs and its books: bind (owner id, owner id). */
const STRIKES_SQL =
  "SELECT COUNT(*) FROM reports r WHERE r.reason = 'copyright' AND r.state = 'upheld' AND ((r.target_kind = 'item' AND r.target_id IN (SELECT id FROM items WHERE owner_id = ?)) OR (r.target_kind = 'book' AND r.target_id IN (SELECT id FROM shared_books WHERE owner_id = ?)))";
const strikesOf = async (env: Env, ownerId: string) => (await env.DB.prepare(`${STRIKES_SQL.replace("COUNT(*)", "COUNT(*) AS n")}`).bind(ownerId, ownerId).first<{ n: number }>())?.n ?? 0;
const ownerOf = async (env: Env, itemId: string, work: Work = "item") => (await env.DB.prepare(`SELECT owner_id FROM ${WORKS[work].table} WHERE id = ?`).bind(itemId).first<{ owner_id: string | null }>())?.owner_id ?? null;

// ---------- reports ----------

export interface ReportInput {
  reason: string;
  details?: unknown;
  version?: unknown;
  /** A copyright notice, filed in the app: who you are, the work, how to reach you, and the good-faith statement. */
  notice?: unknown;
}

/** Reports an item (a shared pack), or with work "book" a shared book. Returns whether it's now hidden. */
export async function report(env: Env, reporterId: string, itemId: string, input: ReportInput, { via, work = "item" }: { via: "app" | "mcp"; work?: Work }) {
  const { table, withdraw } = WORKS[work];
  await checkBan(env, reporterId, "community");
  await checkLimit(env, reporterId, "report");
  const reason = input.reason as ReportReason;
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) throw new LibraryError(`reason must be one of ${REPORT_REASONS.join(", ")}.`);
  const item = await env.DB.prepare(`SELECT id, owner_id, state, curated FROM ${table} WHERE id = ?`).bind(itemId).first<{ id: string; owner_id: string | null; state: string; curated: number }>();
  // A book waiting for an admin (pending) or declined was never in Explore: there's nothing anyone else can see to report.
  if (!item || ["removed", "pending", "declined"].includes(item.state)) throw new LibraryError(`There's no ${work === "book" ? "book " : ""}"${itemId}" in Explore to report.`);
  if (item.owner_id === reporterId) throw new LibraryError(`That's yours: take it out of Explore with ${withdraw} instead.`);
  const details = text(input.details)?.trim().slice(0, 2000) || null;
  let notice: string | null = null;
  if (reason === "copyright") {
    if (via !== "app") throw new LibraryError("A copyright notice is filed in the app, by the person whose work it is (it's a statement they make themselves).");
    const n = (input.notice && typeof input.notice === "object" ? input.notice : {}) as Record<string, unknown>;
    const [name, contact, work] = [text(n.name)?.trim(), text(n.contact)?.trim(), text(n.work)?.trim()];
    const missing = [!name && "your name", !contact && "how to reach you", !work && "the work it copies", n.statement !== true && "the statement"].filter(Boolean);
    if (missing.length) throw new LibraryError(`A copyright notice needs ${missing.join(", ")}.`);
    notice = JSON.stringify({ name: name!.slice(0, 200), contact: contact!.slice(0, 300), work: work!.slice(0, 1000), statement: true });
  }
  const curated = item.curated === 1;
  const severe = AT_ONCE.includes(reason);
  const guard = await limitGuard(env, reporterId, "report");
  const id = randomId(10);
  const now = Date.now();
  // One batch, so a report and what it does land together: the report (only within the day's limit), marked when it
  // takes the item down by itself, and the hide (never for one of the library's own packs: that goes to an admin).
  // A copyright notice from someone whose notices were dismissed three times isn't marked: it waits in the queue.
  const mark = curated
    ? { sql: "NULL", binds: [] as unknown[] }
    : severe
      ? { sql: "'hidden'", binds: [] }
      : reason === "copyright"
        ? { sql: `CASE WHEN (SELECT COUNT(*) FROM reports WHERE reporter_id = ? AND reason = 'copyright' AND state = 'dismissed') < ${FAST_PATH_LOST_AT} THEN 'hidden' END`, binds: [reporterId] }
        : { sql: "NULL", binds: [] };
  const atOnce = reason === "copyright" ? "Hidden after a copyright notice." : "Hidden after a report, while it's looked at.";
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO reports (id, target_kind, target_id, version, reason, details, notice, reporter_id, state, action, created_at)
         SELECT ?, '${work}', ?, ?, ?, ?, ?, ?, ?, ${mark.sql}, ? WHERE ${guard.sql}`,
      ).bind(id, itemId, text(input.version)?.slice(0, 64) ?? null, reason, details, notice, reporterId, severe || curated ? "escalated" : "open", ...mark.binds, now, ...guard.binds),
      env.DB.prepare(
        `UPDATE ${table} SET state = 'hidden', state_at = ?,
           state_reason = CASE WHEN EXISTS (SELECT 1 FROM reports WHERE id = ? AND action = 'hidden') THEN ? ELSE 'Hidden after reports, while they''re looked at.' END
         WHERE id = ? AND state = 'live' AND curated = 0 AND EXISTS (SELECT 1 FROM reports WHERE id = ?) AND ${downOf(work, "?")}`,
      ).bind(now, id, atOnce, itemId, id, ...downBinds("?", itemId)),
    ]);
  } catch (error) {
    if (/UNIQUE/i.test(String(error))) throw new LibraryError("You've reported this already; it's in the queue.");
    throw error;
  }
  if (!results[0]!.meta.changes) throw guard.refusal();
  const hidden = Boolean(results[1]!.meta.changes);
  return { reported: true, id, hidden, note: hidden ? "It's hidden now while it's looked at." : curated ? "Thanks: it's one of Lexicommons' own packs, so it's with an admin." : "Thanks: it's in the queue." };
}

/** The reasons a correction or a request can be reported for: all but copyright (neither holds work of its own). */
export const CORRECTION_REPORT_REASONS = REPORT_REASONS.filter((r) => r !== "copyright");
const SHOWN_HIDDEN = "Hidden after a report, while it's looked at.";
/**
 * SET clauses for a correction hidden or taken down: an accept's claim on it is let go (open again), so that accept
 * makes no version with it (a version is made only while its accept holds every claim, corrections.ts). Every CASE
 * reads the row as it was.
 */
const LETS_GO = ["state = CASE WHEN state = 'accepting' THEN 'open' ELSE state END", ...["accepted_in", "answered_by", "answered_at", "answer_note"].map((c) => `${c} = CASE WHEN state = 'accepting' THEN NULL ELSE ${c} END`)].join(", ");
/**
 * What's moderated on its own `shown` (visible, hidden, removed), apart from its state: a correction, or a request
 * (board.ts). Its table, and what hiding it does besides (a correction's accept lets go of it). Fixed names, never
 * anything from a request.
 */
type Shown = "correction" | "request" | "grammar";
/** A grammar suggestion's accept in flight lets go of it when it's hidden (as a correction's does). */
const GRAMMAR_LETS_GO = ["state = CASE WHEN state = 'accepting' THEN 'open' ELSE state END", ...["claim", "claimed_at", "revision"].map((c) => `${c} = CASE WHEN state = 'accepting' THEN NULL ELSE ${c} END`)].join(", ");
const SHOWN: Record<Shown, { table: string; also: string; noun: string; yours: string; reportable: string }> = {
  correction: { table: "corrections", also: `, ${LETS_GO}`, noun: "correction", yours: "take it back with withdraw_correction instead", reportable: "1" },
  // A request is reported only while it's on the board (open or done): a pending, declined or closed one is its
  // author's own, and a report must never open it to a moderator (caseOfRequest).
  request: { table: "requests", also: "", noun: "request", yours: "close it instead (close_explore_request)", reportable: "state IN ('open', 'done')" },
  // A suggestion to a language's grammar (grammar-suggestions.ts), reported while it waits for an admin's decision.
  grammar: { table: "grammar_suggestions", also: `, ${GRAMMAR_LETS_GO}`, noun: "suggestion", yours: "withdraw it instead (withdraw_pattern_suggestion)", reportable: "state IN ('open', 'accepting')" },
};

/** Reports a correction or a request (what it says). Returns whether it's now hidden. */
async function reportShown(env: Env, kind: Shown, reporterId: string, targetId: string, input: { reason: string; details?: unknown }) {
  const { table, also, noun, yours, reportable } = SHOWN[kind];
  await checkBan(env, reporterId, "community");
  await checkLimit(env, reporterId, "report");
  const reason = input.reason as ReportReason;
  if (reason === "copyright") throw new LibraryError(`A copyright notice is about a shared pack, filed in the app on the pack itself. Report a ${noun} for what it says (abuse, spam, personal, minors, illegal, other).`);
  if (!(CORRECTION_REPORT_REASONS as readonly string[]).includes(reason)) throw new LibraryError(`reason must be one of ${CORRECTION_REPORT_REASONS.join(", ")}.`);
  const c = await env.DB.prepare(`SELECT id, author_id, shown, (${reportable}) AS reportable FROM ${table} WHERE id = ?`).bind(targetId).first<{ id: string; author_id: string | null; shown: string; reportable: number }>();
  if (c && c.author_id === reporterId) throw new LibraryError(`That one's yours: ${yours}.`);
  if (!c || c.shown === "removed" || !c.reportable) throw new LibraryError(`There's no such ${noun} to report.`);
  const details = text(input.details)?.trim().slice(0, 2000) || null;
  const severe = AT_ONCE.includes(reason);
  const guard = await limitGuard(env, reporterId, "report");
  const id = randomId(10);
  const now = Date.now();
  // As a pack's report: the report (within the day's limit), marked when it hides the target by itself, and the hide,
  // in one batch.
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO reports (id, target_kind, target_id, version, reason, details, notice, reporter_id, state, action, created_at)
         SELECT ?, '${kind}', ?, NULL, ?, ?, NULL, ?, ?, ${severe ? "'hidden'" : "NULL"}, ? WHERE ${guard.sql} AND EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND shown != 'removed' AND ${reportable})`,
      ).bind(id, targetId, reason, details, reporterId, severe ? "escalated" : "open", now, ...guard.binds, targetId),
      env.DB.prepare(
        `UPDATE ${table} SET shown = 'hidden', shown_at = ?${also},
           shown_reason = CASE WHEN EXISTS (SELECT 1 FROM reports WHERE id = ? AND action = 'hidden') THEN ? ELSE 'Hidden after reports, while they''re looked at.' END
         WHERE id = ? AND shown = 'visible' AND EXISTS (SELECT 1 FROM reports WHERE id = ?) AND ${downOf(kind, "?")}`,
      ).bind(now, id, SHOWN_HIDDEN, targetId, id, ...downBinds("?", targetId)),
    ]);
  } catch (error) {
    if (/UNIQUE/i.test(String(error))) throw new LibraryError("You've reported this already; it's in the queue.");
    throw error;
  }
  if (!results[0]!.meta.changes) {
    await enforce(env, [guard]);
    throw new LibraryError(`That ${noun} changed just now (closed, or taken down): there's nothing to report.`);
  }
  const hidden = Boolean(results[1]!.meta.changes);
  return { reported: true, id, hidden, note: hidden ? "It's hidden now while it's looked at." : "Thanks: it's in the queue." };
}
/** Reports a correction (what its fix or its note says). Returns whether it's now hidden. */
export const reportCorrection = (env: Env, reporterId: string, correctionId: string, input: { reason: string; details?: unknown }) => reportShown(env, "correction", reporterId, correctionId, input);
/** Reports a request in Explore (what its title or its lines say). Returns whether it's now hidden. */
export const reportRequest = (env: Env, reporterId: string, requestId: string, input: { reason: string; details?: unknown }) => reportShown(env, "request", reporterId, requestId, input);
/** Reports a suggestion to a language's grammar (what its words or its note say). Returns whether it's now hidden. */
export const reportGrammarSuggestion = (env: Env, reporterId: string, suggestionId: string, input: { reason: string; details?: unknown }) => reportShown(env, "grammar", reporterId, suggestionId, input);

// ---------- the owner's answer ----------

/**
 * The owner of a hidden or taken-down item answers a report that holds it down now, the one that took it down first:
 * one upheld against it, then one that hid it at once, then one escalated, then (when three established accounts'
 * reports hid it) the oldest of those, oldest first in each. Once per report: a report already answered isn't
 * answered again, settled either way, so the next counter-notice answers the next hold.
 */
export async function counterNotice(env: Env, ownerId: string, itemId: string, input: { statement?: unknown; name?: unknown; email?: unknown }, work: Work = "item") {
  const { table } = WORKS[work];
  const item = await env.DB.prepare(`SELECT id, owner_id, state FROM ${table} WHERE id = ?`).bind(itemId).first<{ id: string; owner_id: string | null; state: string }>();
  if (!item || item.owner_id !== ownerId) throw new LibraryError(`"${itemId}" isn't yours.`);
  const down = item.state === "withdrawn" && Boolean((await env.DB.prepare(`SELECT ${downOf(work, "?")} AS d`).bind(...downBinds("?", itemId)).first<{ d: number }>())?.d);
  if (item.state !== "hidden" && item.state !== "removed" && !down) throw new LibraryError(`"${itemId}" isn't hidden or taken down.`);
  const statement = text(input.statement)?.trim() ?? "";
  const [name, email] = [text(input.name)?.trim(), text(input.email)?.trim()];
  if (statement.length < 20) throw new LibraryError("Say why it should come back (at least a sentence).");
  if (!name || !email) throw new LibraryError("A counter-notice needs your name and an email to reach you.");
  const holding = `target_kind = '${work}' AND target_id = ? AND (state IN ('upheld', 'escalated') OR (state = 'open' AND (action = 'hidden' OR (${countedOf(work, "?")} AND reporter_id IN (SELECT id FROM users WHERE created_at <= ?)))))`;
  const holdingBinds = () => [itemId, itemId, cutoff(), cutoff()];
  const report = await env.DB.prepare(`SELECT id FROM reports r WHERE ${holding} AND NOT EXISTS (SELECT 1 FROM counter_notices c WHERE c.report_id = r.id)
     ORDER BY CASE WHEN state = 'upheld' THEN 0 WHEN action = 'hidden' THEN 1 WHEN state = 'escalated' THEN 2 ELSE 3 END, created_at LIMIT 1`)
    .bind(...holdingBinds())
    .first<{ id: string }>();
  if (!report) {
    const answered = await env.DB.prepare(`SELECT 1 AS y FROM reports r WHERE ${holding} LIMIT 1`).bind(...holdingBinds()).first();
    throw new LibraryError(answered ? "A counter-notice to that report was filed already, and settled." : "There's no report that hid it to answer; a moderator hid it. It's in the queue.");
  }
  const id = randomId(10);
  const done = await env.DB.prepare(
    `INSERT INTO counter_notices (id, report_id, target_kind, item_id, owner_id, statement, contact, created_at)
     SELECT ?, ?, '${work}', ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM counter_notices WHERE report_id = ? OR (target_kind = '${work}' AND item_id = ? AND state IN ('open', 'escalated')))`,
  )
    .bind(id, report.id, itemId, ownerId, statement.slice(0, 4000), JSON.stringify({ name: name.slice(0, 200), email: email.slice(0, 300) }), Date.now(), report.id, itemId)
    .run();
  if (!done.meta.changes) {
    const open = await env.DB.prepare(`SELECT 1 AS y FROM counter_notices WHERE target_kind = '${work}' AND item_id = ? AND state IN ('open', 'escalated')`).bind(itemId).first();
    throw new LibraryError(open ? "There's a counter-notice for it in the queue already." : "A counter-notice to that report was filed already, and settled.");
  }
  return { filed: true, id, note: "It's with the moderators. You'll see the answer here." };
}

/** What happened to an owner's hidden packs and books, for Explore → Yours (a book's says kind "book"), the latest first. */
export async function ownerCases(env: Env, ownerId: string) {
  const casesOf = async (work: Work) =>
    (
      await env.DB.prepare(
        `SELECT i.id, i.title, i.state, i.state_reason, i.state_at,
           (SELECT state FROM counter_notices c WHERE c.target_kind = '${work}' AND c.item_id = i.id ORDER BY c.created_at DESC LIMIT 1) AS counter_state,
           ${noticedWorkOf(work)} AS work
         FROM ${WORKS[work].table} i WHERE i.owner_id = ? AND i.state IN ('hidden', 'removed') ORDER BY i.state_at DESC`,
      )
        .bind(ownerId)
        .all<{ id: string; title: string; state: string; state_reason: string | null; state_at: number | null; counter_state: string | null; work: string | null }>()
    ).results.map((r) => ({ ...(work === "book" ? { kind: "book" as const } : {}), id: r.id, title: r.title, state: r.state, reason: r.state_reason, at: r.state_at ? new Date(r.state_at).toISOString() : null, counterNotice: r.counter_state, ...(r.work ? { work: r.work } : {}), sort: r.state_at ?? 0 }));
  const all = [...(await casesOf("item")), ...(await casesOf("book"))].sort((a, b) => b.sort - a.sort);
  return all.map(({ sort: _, ...one }) => one);
}

/** The work a copyright notice on pack (or book) i names, so its owner knows what they're answering. Never who sent it or how to reach them. */
const noticedWorkOf = (work: Work) =>
  `(SELECT json_extract(r.notice, '$.work') FROM reports r WHERE r.target_kind = '${work}' AND r.target_id = i.id AND r.notice IS NOT NULL AND r.state IN ('open', 'upheld', 'escalated') ORDER BY r.created_at DESC LIMIT 1)`;

/** The work named against one of an owner's packs (or books), for its page. */
export async function noticedWork(env: Env, itemId: string, work: Work = "item"): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT ${noticedWorkOf(work)} AS work FROM ${WORKS[work].table} i WHERE i.id = ?`).bind(itemId).first<{ work: string | null }>();
  return row?.work ?? null;
}

/** Everything of an account's in Explore, for its export (/api/me/export). */
export async function exportCommunity(env: Env, userId: string) {
  const all = <T = Record<string, unknown>>(query: string) => env.DB.prepare(query).bind(userId).all<T>().then((r) => r.results);
  const [shared, versions, follows, likes, terms, reports, counterNotices, bans, grammarSuggestions, answers, sharedBooks, bookVersions, bookFollows] = await Promise.all([
    all("SELECT id, kind, title, about, language, from_lang, level, topics, licence, copied_from, head_version, state, state_reason, likes, follows, created_at, updated_at FROM items WHERE owner_id = ? ORDER BY created_at"),
    all("SELECT v.item_id, v.version, v.seq, v.bytes, v.note, v.licence, v.terms_version, v.made_by, v.created_at FROM item_versions v JOIN items i ON i.id = v.item_id WHERE i.owner_id = ? ORDER BY v.created_at"),
    all("SELECT item_id, corrections, created_at FROM follows WHERE user_id = ? ORDER BY created_at"),
    all("SELECT target_kind, target_id, created_at FROM likes WHERE user_id = ? ORDER BY created_at"),
    all("SELECT terms_version, accepted_at FROM sharing_terms WHERE user_id = ?"),
    all("SELECT id, target_kind, target_id, reason, details, notice, state, created_at FROM reports WHERE reporter_id = ? ORDER BY created_at"),
    all("SELECT id, report_id, target_kind, item_id, statement, contact, state, handled_note, created_at FROM counter_notices WHERE owner_id = ? ORDER BY created_at"),
    all("SELECT scope, reason, created_at, until, lifted_at FROM user_bans WHERE user_id = ? ORDER BY created_at"),
    all("SELECT id, language, kind, pattern, change, note, state, decision_note, likes, created_at, updated_at FROM grammar_suggestions WHERE author_id = ? ORDER BY created_at"),
    all("SELECT request_id, item_id, created_at FROM request_answers WHERE by_id = ? ORDER BY created_at"),
    // The books it shared (community-books.ts), their versions, and the books it added from Explore.
    all("SELECT id, source_id, title, authors, about, language, layers, level, topics, rights, source, source_url, licence, head_seq, head_version, state, state_reason, likes, follows, created_at, updated_at FROM shared_books WHERE owner_id = ? ORDER BY created_at"),
    all("SELECT v.book_id, v.seq, v.book_version, v.layers, v.bytes, v.note, v.licence, v.terms_version, v.made_by, v.created_at FROM shared_book_versions v JOIN shared_books b ON b.id = v.book_id WHERE b.owner_id = ? ORDER BY v.created_at"),
    all("SELECT book_id, created_at FROM book_follows WHERE user_id = ? ORDER BY created_at"),
  ]);
  return { shared, versions, follows, likes, terms, reports, counterNotices, bans, grammarSuggestions, answers, sharedBooks, bookVersions, bookFollows };
}

// ---------- the queue (moderators) ----------

export async function requireModerator(env: Env, userId: string): Promise<"admin" | "moderator"> {
  const roles = await rolesOf(env, userId);
  if (roles.has("admin")) return "admin";
  if (roles.has("moderator")) return "moderator";
  throw new LibraryError("This account isn't a moderator.");
}

/** How much is waiting, for the zero-token check (/api/v1/mod/pending) and the top of mod_queue. */
export async function pending(env: Env) {
  const [reports, counters, severe, oldest, books, sharedBooks, devices] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE state = 'open'").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM counter_notices WHERE state = 'open'").first<{ n: number }>(),
    env.DB.prepare("SELECT (SELECT COUNT(*) FROM reports WHERE state = 'escalated') + (SELECT COUNT(*) FROM counter_notices WHERE state = 'escalated') AS n").first<{ n: number }>(),
    env.DB.prepare("SELECT MIN(created_at) AS at FROM (SELECT created_at FROM reports WHERE state IN ('open', 'escalated') UNION ALL SELECT created_at FROM counter_notices WHERE state IN ('open', 'escalated'))").first<{ at: number | null }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE state = 'pending' AND shown = 'visible'").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM shared_books WHERE state = 'pending'").first<{ n: number }>(),
    adminDevices(env),
  ]);
  const open = (reports?.n ?? 0) + (counters?.n ?? 0);
  // Book requests waiting are an admin's (whether a book may go on the shelf), and so are shared books from a source that isn't a known
  // open one (community-books.ts), so both are counted apart from open.
  return { open, reports: reports?.n ?? 0, counterNotices: counters?.n ?? 0, escalated: severe?.n ?? 0, oldest: oldest?.at ? new Date(oldest.at).toISOString() : null, bookRequests: books?.n ?? 0, sharedBooks: sharedBooks?.n ?? 0, adminDevices: devices };
}

/** The queue: cases (an item with its open reports and counter-notices), worst and oldest first. */
export async function queue(env: Env, actor: { userId: string }, { includeEscalated = false, limit = 20 } = {}) {
  const role = await requireModerator(env, actor.userId);
  const states = role === "admin" || includeEscalated ? ["open", "escalated"] : ["open"];
  const marks = states.map(() => "?").join(", ");
  const rows = await env.DB.prepare(
    // At most five terms: D1 refuses a compound SELECT of more (SQLITE_MAX_COMPOUND_SELECT), so a pack's reports and a book's are one.
    `SELECT target_id AS target, CASE target_kind WHEN 'book' THEN 'book' ELSE 'reports' END AS kind, MIN(created_at) AS first_at, COUNT(*) AS n,
       MAX(CASE reason WHEN 'minors' THEN 3 WHEN 'illegal' THEN 3 WHEN 'copyright' THEN 2 ELSE 1 END) AS severity,
       group_concat(DISTINCT reason) AS reasons
     FROM reports WHERE target_kind IN ('item', 'book') AND state IN (${marks}) GROUP BY target_kind, target_id
     UNION ALL
     SELECT target_id, 'correction', MIN(created_at), COUNT(*), MAX(CASE reason WHEN 'minors' THEN 3 WHEN 'illegal' THEN 3 ELSE 1 END), group_concat(DISTINCT reason)
     FROM reports WHERE target_kind = 'correction' AND state IN (${marks}) GROUP BY target_id
     UNION ALL
     SELECT target_id, 'request', MIN(created_at), COUNT(*), MAX(CASE reason WHEN 'minors' THEN 3 WHEN 'illegal' THEN 3 ELSE 1 END), group_concat(DISTINCT reason)
     FROM reports WHERE target_kind = 'request' AND state IN (${marks}) GROUP BY target_id
     UNION ALL
     SELECT target_id, 'grammar', MIN(created_at), COUNT(*), MAX(CASE reason WHEN 'minors' THEN 3 WHEN 'illegal' THEN 3 ELSE 1 END), group_concat(DISTINCT reason)
     FROM reports WHERE target_kind = 'grammar' AND state IN (${marks}) GROUP BY target_id

     UNION ALL
     SELECT item_id, CASE target_kind WHEN 'book' THEN 'book-counter-notice' ELSE 'counter-notice' END, MIN(created_at), COUNT(*), 2, 'counter-notice' FROM counter_notices WHERE state IN (${marks}) GROUP BY target_kind, item_id
     ORDER BY severity DESC, first_at ASC LIMIT ?`,
  )
    .bind(...states, ...states, ...states, ...states, ...states, Math.min(Math.max(limit, 1), 50))
    .all<{ target: string; kind: "reports" | "correction" | "request" | "grammar" | "book" | "counter-notice" | "book-counter-notice"; first_at: number; n: number; severity: number; reasons: string }>();
  // An admin's too: book requests waiting for whether the book may go on the shelf (decide_book_request), oldest first.
  const books =
    role === "admin"
      ? (
          await env.DB.prepare("SELECT id, language, title, book, created_at FROM requests WHERE state = 'pending' AND shown = 'visible' ORDER BY created_at LIMIT 20").all<{ id: string; language: string; title: string; book: string | null; created_at: number }>()
        ).results.map((b) => ({ request: b.id, language: b.language, title: b.title, book: b.book ? JSON.parse(b.book) : null, since: new Date(b.created_at).toISOString() }))
      : null;
  // And shared books from a source that isn't a known open one, waiting for an admin to open them (decide_shared_book).
  const shared =
    role === "admin"
      ? (
          await env.DB.prepare("SELECT id, title, language, source_url, created_at FROM shared_books WHERE state = 'pending' ORDER BY created_at LIMIT 20").all<{ id: string; title: string; language: string; source_url: string; created_at: number }>()
        ).results.map((b) => ({ book: b.id, title: b.title, language: b.language, source: b.source_url, since: new Date(b.created_at).toISOString() }))
      : null;
  return {
    waiting: await pending(env),
    ...(books ? { bookRequests: books } : {}),
    ...(shared ? { sharedBooks: shared } : {}),
    cases: rows.results.map((r) => ({
      ...(r.kind === "correction" ? { correction: r.target } : r.kind === "request" ? { request: r.target } : r.kind === "grammar" ? { grammar: r.target } : r.kind === "book" || r.kind === "book-counter-notice" ? { book: r.target } : { item: r.target }),
      kind: r.kind === "book" ? ("reports" as const) : r.kind === "book-counter-notice" ? ("counter-notice" as const) : r.kind,
      reasons: r.reasons.split(","),
      count: r.n,
      since: new Date(r.first_at).toISOString(),
      severity: r.severity,
    })),
    next:
      'Each case: mod_get { id: <case.item> } (a shared book\'s: mod_get { book: <case.book> }; a correction\'s: mod_get { correction: <case.correction> }; a request\'s: mod_get { request: <case.request> }; a grammar suggestion\'s: mod_get { grammar: <case.grammar> }), then mod_resolve { report: <report id>, decision: "uphold" | "dismiss", why } (or counter_notice instead of report: an admin\'s), mod_escalate { report | counter_notice, why }, mod_hide { id | book | correction | request | grammar, why } or mod_restore { id | book | correction | request | grammar, why }. Write why every time.' +
      (books ? " Book requests waiting (bookRequests): decide_book_request { request, decision: \"open\" | \"decline\", why, book? }, once you've checked the book may go on the shelf." : "") +
      (shared ? " Shared books waiting (sharedBooks), from a source that isn't a known open one: decide_shared_book { id, decision: \"open\" | \"decline\", why }, once you've checked at its source that the text may be shared." : ""),
  };
}

/** How many of a pack's sentences a case shows. */
const CASE_SENTENCES = 400;
/** A pack's sentences as text, for whoever judges a report on it: what's reported can be anywhere, and an item's sample is only its first five. Read straight from the bucket, so a hidden pack's are there too. */
async function caseSentences(env: Env, itemId: string, version: string) {
  try {
    const object = await env.LIBRARY.get(packKey(itemId, version));
    if (!object) return { sentenceCount: 0, sentences: [] };
    const pack = upgradePack(JSON.parse(await object.text())) as { language: string; items?: Record<string, unknown>[] };
    const items = sentencesOf(pack) as Record<string, unknown>[];
    // A plain card's two sides are read as a sentence and what it means: what's reported can be on either.
    // And everything else on it: what's reported can be anywhere a person reads, so a moderator sees it all.
    type Card = { text: string; means?: string; sentence?: string; sentenceBack?: string; extras?: { label: string; text: string }[]; tags?: string[] };
    const cards = (plainItems(pack) as Card[]).flatMap((card) => [
      { sentence: card.text, ...(card.means ? { natural: card.means } : {}) },
      ...(card.sentence ? [{ sentence: card.sentence, ...(card.sentenceBack ? { natural: card.sentenceBack } : {}) }] : []),
      ...(card.extras ?? []).map((extra) => ({ sentence: extra.text, natural: `On "${card.text}": ${extra.label}` })),
      ...(card.tags?.length ? [{ sentence: card.tags.join(", "), natural: `Tags on "${card.text}"` }] : []),
    ]);
    return { sentenceCount: items.length + cards.length, sentences: [...items.slice(0, CASE_SENTENCES).map((item) => ({ sentence: itemSentence(item, pack.language), ...(typeof item.means === "string" ? { natural: item.means } : {}) })), ...cards.slice(0, CASE_SENTENCES)].slice(0, CASE_SENTENCES) };
  } catch {
    return { sentenceCount: 0, sentences: [] };
  }
}

// book-format.js, typed as it's called here (it's plain JS).
const joinWords = joinWordsJs as unknown as (words: string[], separator: string, lang: string | null) => string;
const LANGUAGES = LANGUAGES_JS as unknown as Record<string, { separator?: string }>;
/** A book's sentence as the page shows it. */
const bookSentence = (book: { lang: string; words: string[] }, s: number, e: number) => joinWords(book.words.slice(s, e), LANGUAGES[book.lang]?.separator ?? " ", book.lang);

/**
 * A shared book's sentences as text, for whoever judges a report on it, with what each of its layers says for that sentence (what's reported
 * can be in a layer too: a layer is its sharer's own words). Read straight from the bucket, so a hidden book's are there too.
 */
async function bookCaseSentences(env: Env, bookKey: string, layers: Record<string, { key: string }>) {
  try {
    const object = await env.LIBRARY.get(bookKey);
    if (!object) return { sentenceCount: 0, sentences: [] };
    const book = JSON.parse(await object.text()) as { lang: string; words: string[]; sentences: [number, number][] };
    const woven: [string, { sentences?: { text?: unknown }[] }][] = [];
    for (const [to, layer] of Object.entries(layers)) {
      const file = await env.LIBRARY.get(layer.key);
      if (file) woven.push([to, JSON.parse(await file.text())]);
    }
    const sentences = book.sentences.slice(0, CASE_SENTENCES).map(([s, e], x) => ({
      sentence: bookSentence(book, s, e),
      ...(woven.length ? { layers: Object.fromEntries(woven.map(([to, w]) => [to, typeof w.sentences?.[x]?.text === "string" ? (w.sentences[x]!.text as string) : ""])) } : {}),
    }));
    return { sentenceCount: book.sentences.length, sentences };
  } catch {
    return { sentenceCount: 0, sentences: [] };
  }
}

/** One shared book's case in full: the book (its rights and where it came from, its sentences and its layers'), every report and counter-notice, and the owner's record. */
async function caseOfBook(env: Env, actor: { userId: string }, bookId: string) {
  const role = await requireModerator(env, actor.userId);
  const book = await env.DB.prepare("SELECT b.*, u.name AS owner_name, u.created_at AS owner_since FROM shared_books b LEFT JOIN users u ON u.id = b.owner_id WHERE b.id = ?")
    .bind(bookId)
    .first<{ id: string; title: string; authors: string; about: string | null; language: string; level: string | null; rights: string; source_url: string; state: string; state_reason: string | null; owner_id: string | null; owner_name: string | null; owner_since: number | null; head_seq: number }>();
  if (!book) throw new LibraryError(`There's no book "${bookId}".`);
  const [head, reports, counters, record] = await Promise.all([
    env.DB.prepare("SELECT book_key, layers FROM shared_book_versions WHERE book_id = ? AND seq = ?").bind(bookId, book.head_seq).first<{ book_key: string; layers: string }>(),
    env.DB.prepare("SELECT r.id, r.reason, r.details, r.notice, r.state, r.action, r.handled_note, r.created_at, u.created_at AS reporter_since FROM reports r LEFT JOIN users u ON u.id = r.reporter_id WHERE r.target_kind = 'book' AND r.target_id = ? ORDER BY r.created_at")
      .bind(bookId)
      .all<{ id: string; reason: string; details: string | null; notice: string | null; state: string; action: string | null; handled_note: string | null; created_at: number; reporter_since: number | null }>(),
    env.DB.prepare("SELECT id, report_id, statement, contact, state, handled_note, created_at FROM counter_notices WHERE target_kind = 'book' AND item_id = ? ORDER BY created_at")
      .bind(bookId)
      .all<{ id: string; report_id: string; statement: string; contact: string; state: string; handled_note: string | null; created_at: number }>(),
    book.owner_id
      ? env.DB.prepare(
          "SELECT (SELECT COUNT(*) FROM items WHERE owner_id = ?1) + (SELECT COUNT(*) FROM shared_books WHERE owner_id = ?1) AS shared, (SELECT COUNT(*) FROM items WHERE owner_id = ?1 AND state IN ('hidden', 'removed')) + (SELECT COUNT(*) FROM shared_books WHERE owner_id = ?1 AND state IN ('hidden', 'removed')) AS down",
        )
          .bind(book.owner_id)
          .first<{ shared: number; down: number }>()
      : Promise.resolve(null),
  ]);
  const strikes = book.owner_id ? await strikesOf(env, book.owner_id) : 0;
  const days = (at: number | null) => (at ? Math.floor((Date.now() - at) / DAY_MS) : null);
  const layers = head ? (JSON.parse(head.layers) as Record<string, { kind: string; key: string }>) : {};
  return {
    book: {
      id: book.id,
      title: book.title,
      authors: JSON.parse(book.authors),
      about: book.about,
      language: book.language,
      layers: Object.fromEntries(Object.entries(layers).map(([to, layer]) => [to, layer.kind])),
      level: book.level,
      rights: JSON.parse(book.rights),
      source: book.source_url,
      state: book.state,
      stateReason: book.state_reason,
      ...(head ? await bookCaseSentences(env, head.book_key, layers) : { sentenceCount: 0, sentences: [] }),
    },
    owner: book.owner_id ? { name: book.owner_name, accountDays: days(book.owner_since), shared: record?.shared ?? 0, takenDown: record?.down ?? 0, copyrightStrikes: strikes, ...(role === "admin" ? { id: book.owner_id } : {}) } : null,
    reports: reports.results.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      ...(r.notice ? { notice: role === "admin" ? JSON.parse(r.notice) : { work: JSON.parse(r.notice).work, filed: "complete" } } : {}),
      state: r.state,
      action: r.action,
      note: r.handled_note,
      at: new Date(r.created_at).toISOString(),
      reporterAccountDays: days(r.reporter_since),
    })),
    counterNotices: counters.results.map((c) => ({ id: c.id, answers: c.report_id, statement: c.statement, ...(role === "admin" ? { contact: JSON.parse(c.contact) } : {}), state: c.state, note: c.handled_note, at: new Date(c.created_at).toISOString() })),
  };
}

/** One case in full: the item (with its sentences), every report and counter-notice, and the owner's record. A shared book's with work "book". */
export async function caseOf(env: Env, actor: { userId: string }, itemId: string, work: Work = "item") {
  if (work === "book") return caseOfBook(env, actor, itemId);
  const role = await requireModerator(env, actor.userId);
  const item = await env.DB.prepare("SELECT i.*, u.name AS owner_name, u.created_at AS owner_since FROM items i LEFT JOIN users u ON u.id = i.owner_id WHERE i.id = ?")
    .bind(itemId)
    .first<{ id: string; title: string; about: string | null; language: string; level: string | null; state: string; state_reason: string | null; owner_id: string | null; owner_name: string | null; owner_since: number | null; head_version: string; curated: number }>();
  if (!item) throw new LibraryError(`There's no "${itemId}".`);
  const [head, reports, counters, record] = await Promise.all([
    env.DB.prepare("SELECT summary FROM item_versions WHERE item_id = ? AND version = ?").bind(itemId, item.head_version).first<{ summary: string }>(),
    env.DB.prepare("SELECT r.id, r.reason, r.details, r.notice, r.state, r.action, r.handled_note, r.created_at, u.created_at AS reporter_since FROM reports r LEFT JOIN users u ON u.id = r.reporter_id WHERE r.target_kind = 'item' AND r.target_id = ? ORDER BY r.created_at")
      .bind(itemId)
      .all<{ id: string; reason: string; details: string | null; notice: string | null; state: string; action: string | null; handled_note: string | null; created_at: number; reporter_since: number | null }>(),
    env.DB.prepare("SELECT id, report_id, statement, contact, state, handled_note, created_at FROM counter_notices WHERE target_kind = 'item' AND item_id = ? ORDER BY created_at")
      .bind(itemId)
      .all<{ id: string; report_id: string; statement: string; contact: string; state: string; handled_note: string | null; created_at: number }>(),
    item.owner_id
      ? env.DB.prepare("SELECT COUNT(*) AS shared, SUM(CASE WHEN state IN ('hidden', 'removed') THEN 1 ELSE 0 END) AS down FROM items WHERE owner_id = ?").bind(item.owner_id).first<{ shared: number; down: number }>()
      : Promise.resolve(null),
  ]);
  const strikes = item.owner_id ? await strikesOf(env, item.owner_id) : 0;
  const days = (at: number | null) => (at ? Math.floor((Date.now() - at) / DAY_MS) : null);
  return {
    item: { id: item.id, title: item.title, about: item.about, language: item.language, level: item.level, state: item.state, stateReason: item.state_reason, curated: item.curated === 1, sample: head ? (JSON.parse(head.summary).sample ?? []) : [], ...(await caseSentences(env, itemId, item.head_version)) },
    owner: item.owner_id ? { name: item.owner_name, accountDays: days(item.owner_since), shared: record?.shared ?? 0, takenDown: record?.down ?? 0, copyrightStrikes: strikes, ...(role === "admin" ? { id: item.owner_id } : {}) } : null,
    reports: reports.results.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      ...(r.notice ? { notice: role === "admin" ? JSON.parse(r.notice) : { work: JSON.parse(r.notice).work, filed: "complete" } } : {}),
      state: r.state,
      action: r.action,
      note: r.handled_note,
      at: new Date(r.created_at).toISOString(),
      reporterAccountDays: days(r.reporter_since),
    })),
    counterNotices: counters.results.map((c) => ({ id: c.id, answers: c.report_id, statement: c.statement, ...(role === "admin" ? { contact: JSON.parse(c.contact) } : {}), state: c.state, note: c.handled_note, at: new Date(c.created_at).toISOString() })),
  };
}

/** One correction's case in full: the correction (what its fix or note says, on which pack), its reports, its author's record. */
export async function caseOfCorrection(env: Env, actor: { userId: string }, correctionId: string) {
  const role = await requireModerator(env, actor.userId);
  const c = await env.DB.prepare(
    "SELECT c.*, u.name AS author_name, u.created_at AS author_since, i.title AS item_title, i.language FROM corrections c LEFT JOIN users u ON u.id = c.author_id LEFT JOIN items i ON i.id = c.item_id WHERE c.id = ?",
  )
    .bind(correctionId)
    .first<{
      id: string; item_id: string; path: string; kind: string; value: string | null; note: string | null; state: string; shown: string; shown_reason: string | null; likes: number; created_at: number;
      author_id: string | null; author_name: string | null; author_since: number | null; item_title: string | null; language: string | null;
    }>();
  if (!c) throw new LibraryError("There's no such correction.");
  const [reports, record] = await Promise.all([
    env.DB.prepare("SELECT r.id, r.reason, r.details, r.state, r.action, r.handled_note, r.created_at, u.created_at AS reporter_since FROM reports r LEFT JOIN users u ON u.id = r.reporter_id WHERE r.target_kind = 'correction' AND r.target_id = ? ORDER BY r.created_at")
      .bind(correctionId)
      .all<{ id: string; reason: string; details: string | null; state: string; action: string | null; handled_note: string | null; created_at: number; reporter_since: number | null }>(),
    c.author_id
      ? env.DB.prepare("SELECT COUNT(*) AS made, SUM(CASE WHEN shown IN ('hidden', 'removed') THEN 1 ELSE 0 END) AS down FROM corrections WHERE author_id = ?").bind(c.author_id).first<{ made: number; down: number }>()
      : Promise.resolve(null),
  ]);
  const days = (at: number | null) => (at ? Math.floor((Date.now() - at) / DAY_MS) : null);
  return {
    correction: {
      id: c.id,
      pack: { id: c.item_id, title: c.item_title, language: c.language },
      path: c.path,
      kind: c.kind,
      ...(c.value !== null ? { value: JSON.parse(c.value) } : {}),
      note: c.note,
      state: c.state,
      shown: c.shown,
      shownReason: c.shown_reason,
      likes: c.likes,
      at: new Date(c.created_at).toISOString(),
    },
    author: c.author_id ? { name: c.author_name, accountDays: days(c.author_since), corrections: record?.made ?? 0, takenDown: record?.down ?? 0, ...(role === "admin" ? { id: c.author_id } : {}) } : null,
    reports: reports.results.map((r) => ({ id: r.id, reason: r.reason, details: r.details, state: r.state, action: r.action, note: r.handled_note, at: new Date(r.created_at).toISOString(), reporterAccountDays: days(r.reporter_since) })),
  };
}

/** One request's case in full: the request (what it asks, in its words), its reports, its author's record. */
export async function caseOfRequest(env: Env, actor: { userId: string }, requestId: string) {
  const role = await requireModerator(env, actor.userId);
  const q = await env.DB.prepare("SELECT q.*, u.name AS author_name, u.created_at AS author_since FROM requests q LEFT JOIN users u ON u.id = q.author_id WHERE q.id = ?")
    .bind(requestId)
    .first<{
      id: string; kind: string; language: string; level: string | null; topic: string | null; book_id: string | null; book: string | null; title: string; details: string | null; state: string; shown: string; shown_reason: string | null; likes: number; answers: number; created_at: number;
      author_id: string | null; author_name: string | null; author_since: number | null;
    }>();
  if (!q) throw new LibraryError("There's no such request.");
  // A request comes to a moderator only once it's reported (one waiting for an admin, or closed, is its author's own).
  if (role !== "admin" && !(await env.DB.prepare("SELECT 1 AS y FROM reports WHERE target_kind = 'request' AND target_id = ?").bind(requestId).first())) throw new LibraryError("There's no such case: a request comes to a moderator once it's reported.");
  const [reports, record] = await Promise.all([
    env.DB.prepare("SELECT r.id, r.reason, r.details, r.state, r.action, r.handled_note, r.created_at, u.created_at AS reporter_since FROM reports r LEFT JOIN users u ON u.id = r.reporter_id WHERE r.target_kind = 'request' AND r.target_id = ? ORDER BY r.created_at")
      .bind(requestId)
      .all<{ id: string; reason: string; details: string | null; state: string; action: string | null; handled_note: string | null; created_at: number; reporter_since: number | null }>(),
    q.author_id
      ? env.DB.prepare("SELECT COUNT(*) AS made, SUM(CASE WHEN shown IN ('hidden', 'removed') THEN 1 ELSE 0 END) AS down FROM requests WHERE author_id = ?").bind(q.author_id).first<{ made: number; down: number }>()
      : Promise.resolve(null),
  ]);
  const days = (at: number | null) => (at ? Math.floor((Date.now() - at) / DAY_MS) : null);
  return {
    request: {
      id: q.id,
      kind: q.kind,
      language: q.language,
      level: q.level,
      topic: q.topic,
      ...(q.book_id ? { book: q.book_id } : q.book ? { book: JSON.parse(q.book) } : {}),
      title: q.title,
      details: q.details,
      state: q.state,
      shown: q.shown,
      shownReason: q.shown_reason,
      likes: q.likes,
      answers: q.answers,
      at: new Date(q.created_at).toISOString(),
    },
    author: q.author_id ? { name: q.author_name, accountDays: days(q.author_since), requests: record?.made ?? 0, takenDown: record?.down ?? 0, ...(role === "admin" ? { id: q.author_id } : {}) } : null,
    reports: reports.results.map((r) => ({ id: r.id, reason: r.reason, details: r.details, state: r.state, action: r.action, note: r.handled_note, at: new Date(r.created_at).toISOString(), reporterAccountDays: days(r.reporter_since) })),
  };
}

/** One grammar suggestion's case in full: what it proposes (in its words), for which language and pattern, its reports, its author's record. */
export async function caseOfGrammar(env: Env, actor: { userId: string }, suggestionId: string) {
  const role = await requireModerator(env, actor.userId);
  const g = await env.DB.prepare("SELECT g.*, u.name AS author_name, u.created_at AS author_since FROM grammar_suggestions g LEFT JOIN users u ON u.id = g.author_id WHERE g.id = ?")
    .bind(suggestionId)
    .first<{ id: string; language: string; kind: string; pattern: string; change: string; note: string | null; knows: string; via: string; state: string; shown: string; shown_reason: string | null; likes: number; created_at: number; author_id: string | null; author_name: string | null; author_since: number | null }>();
  if (!g) throw new LibraryError("There's no such suggestion.");
  if (role !== "admin" && !(await env.DB.prepare("SELECT 1 AS y FROM reports WHERE target_kind = 'grammar' AND target_id = ?").bind(suggestionId).first())) throw new LibraryError("There's no such case: a suggestion comes to a moderator once it's reported.");
  const [reports, record] = await Promise.all([
    env.DB.prepare("SELECT r.id, r.reason, r.details, r.state, r.action, r.handled_note, r.created_at, u.created_at AS reporter_since FROM reports r LEFT JOIN users u ON u.id = r.reporter_id WHERE r.target_kind = 'grammar' AND r.target_id = ? ORDER BY r.created_at")
      .bind(suggestionId)
      .all<{ id: string; reason: string; details: string | null; state: string; action: string | null; handled_note: string | null; created_at: number; reporter_since: number | null }>(),
    g.author_id
      ? env.DB.prepare("SELECT COUNT(*) AS made, SUM(CASE WHEN shown IN ('hidden', 'removed') THEN 1 ELSE 0 END) AS down FROM grammar_suggestions WHERE author_id = ?").bind(g.author_id).first<{ made: number; down: number }>()
      : Promise.resolve(null),
  ]);
  const days = (at: number | null) => (at ? Math.floor((Date.now() - at) / DAY_MS) : null);
  return {
    grammar: { id: g.id, language: g.language, kind: g.kind, pattern: g.pattern, change: JSON.parse(g.change), note: g.note, knows: g.knows, via: g.via, state: g.state, shown: g.shown, shownReason: g.shown_reason, likes: g.likes, at: new Date(g.created_at).toISOString() },
    author: g.author_id ? { name: g.author_name, accountDays: days(g.author_since), suggestions: record?.made ?? 0, takenDown: record?.down ?? 0, ...(role === "admin" ? { id: g.author_id } : {}) } : null,
    reports: reports.results.map((r) => ({ id: r.id, reason: r.reason, details: r.details, state: r.state, action: r.action, note: r.handled_note, at: new Date(r.created_at).toISOString(), reporterAccountDays: days(r.reporter_since) })),
  };
}

/**
 * What a restore decides on: the reports on it (and a pack's counter-notices), counted with their newest row and by state, as one value
 * read with the item and checked again in its write. A report filed, or one acted on, between the two makes the restore write nothing
 * (LOOK_AGAIN), so it never dismisses a report it never saw (6 Nov 2026, the Codex review's C14: an illegal report filed mid-restore was
 * dismissed with the old decision). Order-free: counts, the highest rowid, and the count in each live state.
 */
const reportsSeen = (kind: string) =>
  `(SELECT COUNT(*) || '.' || COALESCE(MAX(rowid), 0) || '.' || TOTAL(state = 'open') || '.' || TOTAL(state = 'escalated') || '.' || TOTAL(state = 'upheld') FROM reports WHERE target_kind = '${kind}' AND target_id = ?)`;
const noticesSeen = (work: Work) => `(SELECT COUNT(*) || '.' || COALESCE(MAX(rowid), 0) || '.' || TOTAL(state = 'open') || '.' || TOTAL(state = 'escalated') FROM counter_notices WHERE target_kind = '${work}' AND item_id = ?)`;
/** A pack's (or a book's) case as a restore reads it: binds (id, id). */
const caseSeen = (work: Work) => `${reportsSeen(work)} || '|' || ${noticesSeen(work)}`;

const LOOK_AGAIN = "It changed while you were deciding (someone else acted on it, or a new report came in): look again with mod_get.";

/** Hides an item (a shared pack) by a moderator's call; with work "book", a shared book. */
export async function modHide(env: Env, actor: { userId: string; via: string }, itemId: string, why: string, work: Work = "item") {
  const { table } = WORKS[work];
  await requireModerator(env, actor.userId);
  if (!why.trim()) throw new LibraryError("Say why (the owner sees it).");
  // Only while a report on it is open, so the case is always in the queue (and the hide ends when the case does).
  const REPORTED = `EXISTS (SELECT 1 FROM reports WHERE target_kind = '${work}' AND target_id = ? AND state IN ('open', 'escalated'))`;
  const done = await env.DB.prepare(`UPDATE ${table} SET state = 'hidden', state_reason = ?, state_at = ? WHERE id = ? AND state = 'live' AND curated = 0 AND ${REPORTED}`)
    .bind(`${BY_MODERATOR}: ${why.trim().slice(0, 300)}`, Date.now(), itemId, itemId)
    .run();
  if (!done.meta.changes) {
    const item = await env.DB.prepare(`SELECT curated, state, ${REPORTED} AS reported FROM ${table} WHERE id = ?`).bind(itemId, itemId).first<{ curated: number; state: string; reported: number }>();
    throw new LibraryError(
      item?.curated
        ? `"${itemId}" is one of the library's own packs: an admin takes it off with library_unpublish.`
        : item?.state !== "live"
          ? `"${itemId}" isn't live.`
          : "Nothing open is reported on it: a hide lasts while a report is looked at, so report it first (report).",
    );
  }
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: "mod.hide", target: `${work}:${itemId}`, note: why });
  return { ...(work === "book" ? { book: itemId } : { id: itemId }), state: "hidden" };
}

/**
 * Puts a hidden item back, dismissing its open reports with the same note, and answering any counter-notice waiting on
 * it. A moderator restores only what's hidden, with no report of minors or illegal content and nothing escalated. An
 * admin can also put back what was taken down: that overturns the reports upheld against it (their strikes go too).
 */
export async function modRestore(env: Env, actor: { userId: string; via: string }, itemId: string, why: string, work: Work = "item") {
  const { table } = WORKS[work];
  const role = await requireModerator(env, actor.userId);
  if (!why.trim()) throw new LibraryError("Say why (it goes in the record).");
  const item = await env.DB.prepare(`SELECT state, ${caseSeen(work)} AS seen FROM ${table} WHERE id = ?`).bind(itemId, itemId, itemId).first<{ state: string; seen: string }>();
  if (!item || !["hidden", "removed"].includes(item.state)) throw new LibraryError(`"${itemId}" isn't hidden.`);
  const admin = role === "admin";
  if (item.state === "removed" && !admin) throw new LibraryError(`"${itemId}" was taken down for good (a report upheld): only an admin puts it back.`);
  // What only an admin settles: anything involving minors or illegal content, anything escalated, and a counter-notice
  // (restoring would answer it).
  const ADMINS = `SELECT 1 FROM reports WHERE target_kind = '${work}' AND target_id = ? AND ((reason IN ('minors', 'illegal') AND state IN ('open', 'escalated', 'upheld')) OR state = 'escalated') UNION ALL SELECT 1 FROM counter_notices WHERE target_kind = '${work}' AND item_id = ? AND state IN ('open', 'escalated')`;
  if (!admin && (await env.DB.prepare(ADMINS).bind(itemId, itemId).first())) throw new LibraryError("It's an admin's to settle (minors, illegal content, something escalated, or a counter-notice): escalate it.");
  const now = Date.now();
  const restored = `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND state = 'live' AND state_at = ?)`;
  const [back] = await env.DB.batch([
    env.DB.prepare(`UPDATE ${table} SET state = 'live', state_reason = NULL, state_at = ? WHERE id = ? AND state = ? AND ${caseSeen(work)} = ?${admin ? "" : ` AND NOT EXISTS (${ADMINS})`}`).bind(
      now,
      itemId,
      item.state,
      itemId,
      itemId,
      item.seen,
      ...(admin ? [] : [itemId, itemId]),
    ),
    env.DB.prepare(`UPDATE reports SET state = 'dismissed', handled_by = ?, handled_at = ?, handled_note = ? WHERE target_kind = '${work}' AND target_id = ? AND state IN ('open', 'escalated') AND ${restored}`).bind(actor.userId, now, why, itemId, itemId, now),
    env.DB.prepare(`UPDATE reports SET state = 'dismissed', handled_by = ?, handled_at = ?, handled_note = ? WHERE target_kind = '${work}' AND target_id = ? AND state = 'upheld' AND ${restored}`).bind(actor.userId, now, `Overturned: ${why}`, itemId, itemId, now),
    env.DB.prepare(`UPDATE counter_notices SET state = 'upheld', handled_by = ?, handled_at = ?, handled_note = ? WHERE target_kind = '${work}' AND item_id = ? AND state IN ('open', 'escalated') AND ${restored}`).bind(actor.userId, now, `Restored: ${why}`, itemId, itemId, now),
  ]);
  if (!back!.meta.changes) throw new LibraryError(LOOK_AGAIN);
  const owner = await ownerOf(env, itemId, work);
  const ban = owner ? await reconcileStrikes(env, owner, "overturned") : null;
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: "mod.restore", target: `${work}:${itemId}`, note: why, after: ban ? { ban } : undefined });
  return { ...(work === "book" ? { book: itemId } : { id: itemId }), state: "live", ...(ban === "lifted" ? { ownerBan: "lifted (fewer than three upheld copyright notices now)" } : {}) };
}

/** Hides a reported correction by a moderator's call (while a report on it is open, as a pack's hide). */
async function modHideShown(env: Env, kind: Shown, actor: { userId: string; via: string }, targetId: string, why: string) {
  const { table, also, noun } = SHOWN[kind];
  await requireModerator(env, actor.userId);
  if (!why.trim()) throw new LibraryError("Say why (its author sees it).");
  const REPORTED = `EXISTS (SELECT 1 FROM reports WHERE target_kind = '${kind}' AND target_id = ? AND state IN ('open', 'escalated'))`;
  const done = await env.DB.prepare(`UPDATE ${table} SET shown = 'hidden', shown_reason = ?, shown_at = ?${also} WHERE id = ? AND shown = 'visible' AND ${REPORTED}`)
    .bind(`${BY_MODERATOR}: ${why.trim().slice(0, 300)}`, Date.now(), targetId, targetId)
    .run();
  if (!done.meta.changes) {
    const c = await env.DB.prepare(`SELECT shown, ${REPORTED} AS reported FROM ${table} WHERE id = ?`).bind(targetId, targetId).first<{ shown: string; reported: number }>();
    throw new LibraryError(!c ? `There's no such ${noun}.` : c.shown !== "visible" ? "It isn't shown now." : "Nothing open is reported on it: a hide lasts while a report is looked at, so report it first (report).");
  }
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: "mod.hide", target: `${kind}:${targetId}`, note: why });
  return { [kind]: targetId, shown: "hidden" };
}
/** Hides a reported correction while it's looked at (only its author sees it, and why). */
export const modHideCorrection = (env: Env, actor: { userId: string; via: string }, correctionId: string, why: string) => modHideShown(env, "correction", actor, correctionId, why);
/** Hides a reported request while it's looked at (only its author sees it, and why). */
export const modHideRequest = (env: Env, actor: { userId: string; via: string }, requestId: string, why: string) => modHideShown(env, "request", actor, requestId, why);
/** Hides a reported grammar suggestion while it's looked at (only its author sees it, and why; never accepted while hidden). */
export const modHideGrammar = (env: Env, actor: { userId: string; via: string }, suggestionId: string, why: string) => modHideShown(env, "grammar", actor, suggestionId, why);

/**
 * Shows a hidden correction or request again, dismissing its open reports with the same note. As a pack's restore: a
 * moderator, only what's hidden with nothing of minors or illegal content and nothing escalated; an admin, what was
 * taken down too (the reports upheld against it are overturned).
 */
async function modRestoreShown(env: Env, kind: Shown, actor: { userId: string; via: string }, targetId: string, why: string) {
  const { table } = SHOWN[kind];
  const role = await requireModerator(env, actor.userId);
  if (!why.trim()) throw new LibraryError("Say why (it goes in the record).");
  const c = await env.DB.prepare(`SELECT shown, ${reportsSeen(kind)} AS seen FROM ${table} WHERE id = ?`).bind(targetId, targetId).first<{ shown: string; seen: string }>();
  if (!c || !["hidden", "removed"].includes(c.shown)) throw new LibraryError("It isn't hidden.");
  const admin = role === "admin";
  if (c.shown === "removed" && !admin) throw new LibraryError("It was taken down for good (a report upheld): only an admin puts it back.");
  const ADMINS = `SELECT 1 FROM reports WHERE target_kind = '${kind}' AND target_id = ? AND ((reason IN ('minors', 'illegal') AND state IN ('open', 'escalated', 'upheld')) OR state = 'escalated')`;
  if (!admin && (await env.DB.prepare(ADMINS).bind(targetId).first())) throw new LibraryError("It's an admin's to settle (minors, illegal content, or something escalated): escalate it.");
  const now = Date.now();
  const restored = `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND shown = 'visible' AND shown_at = ?)`;
  const [back] = await env.DB.batch([
    env.DB.prepare(`UPDATE ${table} SET shown = 'visible', shown_reason = NULL, shown_at = ? WHERE id = ? AND shown = ? AND ${reportsSeen(kind)} = ?${admin ? "" : ` AND NOT EXISTS (${ADMINS})`}`).bind(
      now,
      targetId,
      c.shown,
      targetId,
      c.seen,
      ...(admin ? [] : [targetId]),
    ),
    env.DB.prepare(`UPDATE reports SET state = 'dismissed', handled_by = ?, handled_at = ?, handled_note = ? WHERE target_kind = '${kind}' AND target_id = ? AND state IN ('open', 'escalated') AND ${restored}`).bind(actor.userId, now, why, targetId, targetId, now),
    env.DB.prepare(`UPDATE reports SET state = 'dismissed', handled_by = ?, handled_at = ?, handled_note = ? WHERE target_kind = '${kind}' AND target_id = ? AND state = 'upheld' AND ${restored}`).bind(actor.userId, now, `Overturned: ${why}`, targetId, targetId, now),
  ]);
  if (!back!.meta.changes) throw new LibraryError(LOOK_AGAIN);
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: "mod.restore", target: `${kind}:${targetId}`, note: why });
  return { [kind]: targetId, shown: "visible" };
}
/** Shows a hidden correction again (see modRestoreShown). */
export const modRestoreCorrection = (env: Env, actor: { userId: string; via: string }, correctionId: string, why: string) => modRestoreShown(env, "correction", actor, correctionId, why);
/** Shows a hidden request again (see modRestoreShown). */
export const modRestoreRequest = (env: Env, actor: { userId: string; via: string }, requestId: string, why: string) => modRestoreShown(env, "request", actor, requestId, why);
/** Shows a hidden grammar suggestion again (see modRestoreShown). */
export const modRestoreGrammar = (env: Env, actor: { userId: string; via: string }, suggestionId: string, why: string) => modRestoreShown(env, "grammar", actor, suggestionId, why);

/**
 * Settles a report or counter-notice. Upholding a report keeps the item down (removed, for good, unless an admin
 * restores it); dismissing one puts a hidden item back once nothing else holds it down (heldOf). Upholding a
 * counter-notice dismisses the report it answered and puts the item back, again once nothing else holds it down.
 * Counter-notices are an admin's.
 */
export async function modResolve(env: Env, actor: { userId: string; via: string }, input: { report?: string; counterNotice?: string; decision: "uphold" | "dismiss"; why: string }) {
  const role = await requireModerator(env, actor.userId);
  if (!input.why.trim()) throw new LibraryError("Say why (it goes in the record).");
  const now = Date.now();
  const upheld = input.decision === "uphold";
  if (input.counterNotice) {
    if (role !== "admin") throw new LibraryError("Counter-notices are an admin's to settle: escalate it.");
    const c = await env.DB.prepare("SELECT c.id, c.target_kind, c.item_id, c.report_id, c.state, r.reason AS report_reason FROM counter_notices c LEFT JOIN reports r ON r.id = c.report_id WHERE c.id = ?")
      .bind(input.counterNotice)
      .first<{ id: string; target_kind: Work; item_id: string; report_id: string; state: string; report_reason: string | null }>();
    if (!c || !["open", "escalated"].includes(c.state)) throw new LibraryError("No open counter-notice with that id.");
    const work: Work = c.target_kind === "book" ? "book" : "item";
    const { table } = WORKS[work];
    const decided = "EXISTS (SELECT 1 FROM counter_notices WHERE id = ? AND state = 'upheld' AND handled_at = ? AND handled_by = ?)";
    const [settled] = await env.DB.batch([
      env.DB.prepare("UPDATE counter_notices SET state = ?, handled_by = ?, handled_at = ?, handled_note = ? WHERE id = ? AND state IN ('open', 'escalated')").bind(upheld ? "upheld" : "dismissed", actor.userId, now, input.why, c.id),
      ...(upheld
        ? [
            env.DB.prepare(`UPDATE reports SET state = 'dismissed', handled_by = ?, handled_at = ?, handled_note = ? WHERE id = ? AND state IN ('open', 'escalated', 'upheld') AND ${decided}`).bind(
              actor.userId,
              now,
              `Counter-notice upheld: ${input.why}`,
              c.report_id,
              c.id,
              now,
              actor.userId,
            ),
            env.DB.prepare(`UPDATE ${table} SET state = 'live', state_reason = NULL, state_at = ? WHERE id = ? AND state IN ('hidden', 'removed') AND ${decided} AND NOT ${heldOf(work)}`).bind(
              now,
              c.item_id,
              c.id,
              now,
              actor.userId,
              ...heldBinds(c.item_id),
            ),
          ]
        : []),
    ]);
    if (!settled!.meta.changes) throw new LibraryError(LOOK_AGAIN);
    // Its report may have been upheld meanwhile (a strike), so the ban is reconciled whatever this read saw.
    const owner = upheld && c.report_reason === "copyright" ? await ownerOf(env, c.item_id, work) : null;
    const ban = owner ? await reconcileStrikes(env, owner, "overturned") : null;
    await logAdmin(env, { actorId: actor.userId, via: actor.via, action: `mod.counter.${input.decision}`, target: `${work}:${c.item_id}`, note: input.why, after: ban ? { ban } : undefined });
    const after = await env.DB.prepare(`SELECT state FROM ${table} WHERE id = ?`).bind(c.item_id).first<{ state: string }>();
    return {
      counterNotice: c.id,
      decision: input.decision,
      ...(work === "book" ? { book: c.item_id } : { item: c.item_id }),
      itemState: after?.state,
      ...(upheld && after?.state !== "live" ? { note: "It stays down: other reports still hold it (mod_get)." } : {}),
      ...(ban === "lifted" ? { ownerBan: "lifted (fewer than three upheld copyright notices now)" } : {}),
    };
  }
  const r = await env.DB.prepare("SELECT id, target_kind, target_id, reason, state FROM reports WHERE id = ?").bind(input.report ?? "").first<{ id: string; target_kind: Target; target_id: string; reason: string; state: string }>();
  if (!r || !["open", "escalated"].includes(r.state)) throw new LibraryError("No open report with that id.");
  if (r.state === "escalated" && role !== "admin") throw new LibraryError("That one's been escalated to an admin.");
  if (AT_ONCE.includes(r.reason as ReportReason) && !upheld && role !== "admin") throw new LibraryError("A report of minors or illegal content is an admin's to settle: escalate it.");
  if (r.target_kind === "correction" || r.target_kind === "request" || r.target_kind === "grammar") return resolveShownReport(env, r.target_kind, actor, role, r, upheld, input.why, now);
  const work: Work = r.target_kind === "book" ? "book" : "item";
  const { table } = WORKS[work];
  const ANSWERED = "EXISTS (SELECT 1 FROM counter_notices WHERE report_id = ? AND state IN ('open', 'escalated'))";
  if (role !== "admin" && (await env.DB.prepare(`SELECT ${ANSWERED} AS y`).bind(r.id).first<{ y: number }>())?.y) {
    throw new LibraryError("A counter-notice answers this report, so it's an admin's to settle: escalate the counter-notice.");
  }
  // One of the library's own packs stays as the catalog has it: upholding a report on it says so, and the admin
  // takes it off with library_unpublish.
  const curated = Boolean((await env.DB.prepare(`SELECT curated FROM ${table} WHERE id = ?`).bind(r.target_id).first<{ curated: number }>())?.curated);
  const decided = `EXISTS (SELECT 1 FROM reports WHERE id = ? AND state = '${upheld ? "upheld" : "dismissed"}' AND handled_at = ? AND handled_by = ?)`;
  const [settled] = await env.DB.batch([
    env.DB.prepare(`UPDATE reports SET state = ?, handled_by = ?, handled_at = ?, handled_note = ? WHERE id = ? AND state IN (${role === "admin" ? "'open', 'escalated'" : "'open'"})${role === "admin" ? "" : ` AND NOT ${ANSWERED}`}`).bind(
      upheld ? "upheld" : "dismissed",
      actor.userId,
      now,
      input.why,
      r.id,
      ...(role === "admin" ? [] : [r.id]),
    ),
    upheld
      ? env.DB.prepare(`UPDATE ${table} SET state = 'removed', state_reason = ?, state_at = ? WHERE id = ? AND state IN ('live', 'hidden', 'withdrawn') AND curated = 0 AND ${decided}`).bind(
          `Taken down: ${input.why.slice(0, 300)}`,
          now,
          r.target_id,
          r.id,
          now,
          actor.userId,
        )
      : // Back up only when nothing else holds it down: hidden (a moderator's hide lasts while any report on it is open),
        // or taken down by reports since overturned (heldOf counts an upheld one).
        env.DB.prepare(
          `UPDATE ${table} SET state = 'live', state_reason = NULL, state_at = ? WHERE id = ?
             AND ((state = 'hidden' AND (state_reason IS NULL OR state_reason NOT LIKE '${BY_MODERATOR}%' OR NOT EXISTS (SELECT 1 FROM reports WHERE target_kind = '${work}' AND target_id = ? AND state IN ('open', 'escalated')))) OR state = 'removed')
             AND ${decided} AND NOT ${heldOf(work)}`,
        ).bind(now, r.target_id, r.target_id, r.id, now, actor.userId, ...heldBinds(r.target_id)),
    // A counter-notice waiting on a dismissed report has its answer.
    ...(upheld
      ? []
      : [
          env.DB.prepare(`UPDATE counter_notices SET state = 'upheld', handled_by = ?, handled_at = ?, handled_note = ? WHERE report_id = ? AND state IN ('open', 'escalated') AND ${decided}`).bind(
            actor.userId,
            now,
            `The report it answered was dismissed: ${input.why}`,
            r.id,
            r.id,
            now,
            actor.userId,
          ),
        ]),
  ]);
  if (!settled!.meta.changes) throw new LibraryError(LOOK_AGAIN);
  const owner = upheld && r.reason === "copyright" ? await ownerOf(env, r.target_id, work) : null;
  const ban = owner ? await reconcileStrikes(env, owner, "strike") : null;
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: `mod.report.${input.decision}`, target: `${work}:${r.target_id}`, note: input.why, after: ban ? { ban } : undefined });
  const after = await env.DB.prepare(`SELECT state FROM ${table} WHERE id = ?`).bind(r.target_id).first<{ state: string }>();
  return {
    report: r.id,
    decision: input.decision,
    ...(work === "book" ? { book: r.target_id } : { item: r.target_id }),
    itemState: after?.state,
    ...(ban === "banned" ? { ownerBanned: "from sharing (repeat copyright notices)" } : {}),
    ...(curated && upheld ? { next: "It's one of the library's own packs, still listed: take it off with library_unpublish." } : {}),
  };
}

/**
 * A report on a correction or a request, settled: upheld, it's down for good (removed; a correction's pack stays as it
 * is); dismissed, a hidden one is shown again once nothing else holds it down (as a pack's: heldOf). One batch,
 * conditional on the report still being open.
 */
async function resolveShownReport(
  env: Env,
  kind: Shown,
  actor: { userId: string; via: string },
  role: "admin" | "moderator",
  r: { id: string; target_id: string },
  upheld: boolean,
  why: string,
  now: number,
) {
  const { table, also } = SHOWN[kind];
  const decided = `EXISTS (SELECT 1 FROM reports WHERE id = ? AND state = '${upheld ? "upheld" : "dismissed"}' AND handled_at = ? AND handled_by = ?)`;
  const [settled] = await env.DB.batch([
    env.DB.prepare(`UPDATE reports SET state = ?, handled_by = ?, handled_at = ?, handled_note = ? WHERE id = ? AND state IN (${role === "admin" ? "'open', 'escalated'" : "'open'"})`).bind(upheld ? "upheld" : "dismissed", actor.userId, now, why, r.id),
    upheld
      ? env.DB.prepare(`UPDATE ${table} SET shown = 'removed', shown_reason = ?, shown_at = ?${also} WHERE id = ? AND shown IN ('visible', 'hidden') AND ${decided}`).bind(`Taken down: ${why.slice(0, 300)}`, now, r.target_id, r.id, now, actor.userId)
      : env.DB.prepare(
          `UPDATE ${table} SET shown = 'visible', shown_reason = NULL, shown_at = ? WHERE id = ?
             AND ((shown = 'hidden' AND (shown_reason IS NULL OR shown_reason NOT LIKE '${BY_MODERATOR}%' OR NOT EXISTS (SELECT 1 FROM reports WHERE target_kind = '${kind}' AND target_id = ? AND state IN ('open', 'escalated')))) OR shown = 'removed')
             AND ${decided} AND NOT ${heldOf(kind)}`,
        ).bind(now, r.target_id, r.target_id, r.id, now, actor.userId, ...heldBinds(r.target_id)),
  ]);
  if (!settled!.meta.changes) throw new LibraryError(LOOK_AGAIN);
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: `mod.report.${upheld ? "uphold" : "dismiss"}`, target: `${kind}:${r.target_id}`, note: why });
  const after = await env.DB.prepare(`SELECT shown FROM ${table} WHERE id = ?`).bind(r.target_id).first<{ shown: string }>();
  return { report: r.id, decision: upheld ? ("uphold" as const) : ("dismiss" as const), [kind]: r.target_id, shown: after?.shown };
}

/** Hands a case to an admin. */
export async function modEscalate(env: Env, actor: { userId: string; via: string }, input: { report?: string; counterNotice?: string; why: string }) {
  await requireModerator(env, actor.userId);
  if (!input.why.trim()) throw new LibraryError("Lay out the case for the admin.");
  const table = input.counterNotice ? "counter_notices" : "reports";
  const id = input.counterNotice ?? input.report ?? "";
  const done = await env.DB.prepare(`UPDATE ${table} SET state = 'escalated', handled_note = ? WHERE id = ? AND state = 'open'`).bind(input.why.slice(0, 2000), id).run();
  if (!done.meta.changes) throw new LibraryError("Nothing open with that id.");
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: "mod.escalate", target: `${table === "reports" ? "report" : "counter"}:${id}`, note: input.why });
  return { escalated: id };
}

/** Bans (an admin's only): stop an account sharing, or taking part at all, for some days or for good. */
export async function modBan(env: Env, actor: { userId: string; via: string }, input: { user: string; scope: "share" | "community"; why: string; days?: number }) {
  if (!(await rolesOf(env, actor.userId)).has("admin")) throw new LibraryError("Bans are an admin's.");
  if (!input.why.trim()) throw new LibraryError("Say why (the account sees it).");
  const target = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(input.user).first();
  if (!target) throw new LibraryError("No such account.");
  const id = randomId(10);
  const until = input.days ? Date.now() + input.days * DAY_MS : null;
  await env.DB.prepare("INSERT INTO user_bans (id, user_id, scope, reason, by, created_at, until) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, input.user, input.scope, input.why.slice(0, 500), actor.userId, Date.now(), until).run();
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: "mod.ban", target: `user:${input.user}`, note: input.why, after: { scope: input.scope, until } });
  return { ban: id, scope: input.scope, until: until ? new Date(until).toISOString() : "for good" };
}

export async function modUnban(env: Env, actor: { userId: string; via: string }, input: { user: string; why: string }) {
  if (!(await rolesOf(env, actor.userId)).has("admin")) throw new LibraryError("Bans are an admin's.");
  const done = await env.DB.prepare("UPDATE user_bans SET lifted_at = ? WHERE user_id = ? AND lifted_at IS NULL").bind(Date.now(), input.user).run();
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: "mod.unban", target: `user:${input.user}`, note: input.why });
  return { lifted: done.meta.changes ?? 0 };
}

export async function policy(env: Env) {
  const row = await env.DB.prepare("SELECT rev, text, created_at FROM moderation_policy ORDER BY rev DESC LIMIT 1").first<{ rev: number; text: string; created_at: number }>();
  return row ? { rev: row.rev, text: row.text, since: new Date(row.created_at).toISOString() } : { rev: 0, text: DEFAULT_POLICY, since: null };
}

export async function setPolicy(env: Env, actor: { userId: string; via: string }, text: string) {
  if (!(await rolesOf(env, actor.userId)).has("admin")) throw new LibraryError("The policy is an admin's to change.");
  if (text.trim().length < 40) throw new LibraryError("That's too short to be the policy.");
  const now = Date.now();
  const row = await env.DB.prepare("INSERT INTO moderation_policy (rev, text, by, created_at) SELECT COALESCE(MAX(rev), 0) + 1, ?, ?, ? FROM moderation_policy RETURNING rev").bind(text.slice(0, 20000), actor.userId, now).first<{ rev: number }>();
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: "mod.policy", target: `policy:${row?.rev}` });
  return policy(env);
}
