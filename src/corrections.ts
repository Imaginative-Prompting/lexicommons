// Corrections to what's shared in Explore, Wikipedia style: anyone who may share can suggest a fix to one piece of a
// pack (checked as a version would be: the pack with it must pass checkPack) or flag a piece as wrong. The pack's
// author accepts them into one new version or declines them, with a reason; an admin can on any pack, and on the
// library's own packs it's an admin's alone (the new default version goes out through the library tools' publish).
// A new version supersedes the open corrections whose piece it changed. Corrections are liked (one per account, in the
// app) and, with "use community corrections" on a follow, a device plays the most-liked open fix per piece.
// The pieces and the fixes themselves are study/pack-corrections.js, shared with the device.

import { canonicalPath, checkFix as checkFixJs, pieceOf, withFixes as withFixesJs, CORRECTION_LIMITS } from "../public/js/study/pack-corrections.js";
import { packRefs as packRefsJs, packVersion as packVersionJs } from "../public/js/study/pack-format.js";
import { currentCatalogue, publish } from "./library-admin";
import { fetchLibraryPack, getItem, installedFor, mayShare, PUBLISHED_CLAIM, updateShared, type Pack } from "./community";
import type { Env } from "./env";
import { LibraryError } from "./library";
import { checkBan, limitGuard, enforce } from "./moderation";
import { queueOwnerChange, type OwnerOutcome } from "./packs";
import { logAdmin, rolesOf } from "./roles";
import { randomId } from "./util";
import { enqueue } from "./reminders";

interface Problem {
  at: string;
  message: string;
}
const checkFix = checkFixJs as unknown as (pack: Pack, path: string, value: unknown, options: { installed: unknown[] }) => { pack: Pack | null; errors: Problem[]; warnings: Problem[] };
const withFixes = withFixesJs as unknown as (pack: Pack, fixes: { path: string; value: unknown }[], options: { installed: unknown[] }) => { pack: Pack | null; errors: Problem[]; warnings: Problem[] };
const packVersion = packVersionJs as unknown as (pack: Pack) => Promise<string>;
const packRefs = packRefsJs as unknown as (catalogue: unknown, language: string) => { id: string; version: string }[];
const text = (value: unknown) => (typeof value === "string" ? value : undefined);
const VALUE_BYTES = 20_000;
/** At most this many accepted, and as many declined, in one answer (each is a bound parameter in one statement). */
const PER_REVIEW = 50;
const LOOK_AGAIN = "The pack or its corrections changed while this was being answered: look again (list_corrections).";
/**
 * The largest real bodies the app's routes read (app.ts): a suggestion (its value, note and path) and an answer to as
 * many as one takes (ids, and a reason each), times 6, the most JSON stretches a character (\u0000), with room.
 */
export const CORRECTION_BODY = {
  suggest: 6 * (VALUE_BYTES + CORRECTION_LIMITS.note + CORRECTION_LIMITS.path + 64) + 4 * 1024,
  review: 6 * (PER_REVIEW * 48 + PER_REVIEW * (48 + 500) + 300) + 4 * 1024,
};
/**
 * A claim older than this belongs to an accept that never finished (its request died; a live one takes seconds): it's
 * settled by whoever comes next. A shared pack's version is made only while its accept still holds every claim.
 */
const CLAIM_STALE = 30 * 60_000;

interface ItemFacts {
  id: string;
  title: string;
  owner_id: string | null;
  curated: number;
  state: string;
  head_version: string;
  language: string;
  /** The pack's id where its author keeps it (Explore's id may be suffixed). */
  source_id: string | null;
}
async function itemFacts(env: Env, id: string): Promise<ItemFacts | null> {
  return env.DB.prepare("SELECT id, title, owner_id, curated, state, head_version, language, source_id FROM items WHERE id = ? AND kind = 'pack'").bind(id).first<ItemFacts>();
}

/** What became of an accept on the author's own pack, in words for whoever accepted (the author, or an admin). */
function ownerCopyOf(outcome: OwnerOutcome, own: boolean) {
  const their = own ? "your" : "the author's";
  if (outcome.ok) return { updated: true, devices: outcome.devices.length, change: outcome.changeId, note: `${own ? "Your" : "The author's"} own pack takes the same fixes on ${own ? "your" : "their"} devices (with Undo there).` };
  const later = `${own ? "Take" : "They take"} the fixes in ${own ? "yourself" : "themselves"}, or ${their} next share of it asks first (confirm_reverts).`;
  const why =
    outcome.reason === "no_copy"
      ? `None of ${their} devices has sent this pack yet, so ${their} own copy wasn't changed. ${later}`
      : outcome.reason === "busy"
        ? `A change still on its way to ${their} devices touches the same sentence or word, so ${their} own copy wasn't changed. ${later}`
        : outcome.reason === "nothing"
          ? `${own ? "Your" : "The author's"} own pack already says this.`
          : `${own ? "Your" : "The author's"} own pack couldn't take the fixes: ${outcome.errors.map((e) => e.message).join(" ")} ${later}`;
  return { updated: false, reason: outcome.reason, why };
}
/** The version of one of the library's own packs on the catalog now (the catalog is the source of truth). */
async function catalogueHead(env: Env, id: string) {
  const { catalogue } = await currentCatalogue(env);
  return Object.keys(catalogue.packs ?? {})
    .flatMap((language) => packRefs(catalogue, language))
    .find((ref) => ref.id === id)?.version;
}

/**
 * Settles an accept's claim (claim:<token>:<the version it makes>) once nothing more will come of it: the version's own
 * batch accepted its corrections if that version was made (community.ts versionStatements). On one of the library's
 * own packs the catalog is written before Explore's index, which may come late or skip it: there a claim whose version
 * was published (its admin log entry, or the catalog's head) is accepted here, and one let go is superseded if the
 * pack's piece changed since the version it was made on (no index superseded it while it was claimed). Whatever's still
 * claimed after that goes back to open.
 */
async function settleClaim(env: Env, item: { id: string; curated: number }, claim: string) {
  const version = claim.split(":")[2] ?? "";
  const release = (to: "open" | "superseded") =>
    `UPDATE corrections SET state = '${to}', accepted_in = NULL, answered_by = NULL, answered_at = NULL, answer_note = NULL, updated_at = ? WHERE item_id = ? AND state = 'accepting' AND accepted_in = ?`;
  if (!item.curated) {
    await env.DB.prepare(release("open")).bind(Date.now(), item.id, claim).run();
    return;
  }
  // Each try reads whether the version was published and the index's head, and writes only if neither has moved
  // since; else it reads again. Three tries all overtaken leave the claim for the next request (settleStale).
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await libraryPublished(env, item.id, version)) {
      await env.DB.prepare("UPDATE corrections SET state = 'accepted', accepted_in = ?, updated_at = ? WHERE item_id = ? AND state = 'accepting' AND accepted_in = ?").bind(version, Date.now(), item.id, claim).run();
      return;
    }
    const rows = await env.DB.prepare("SELECT id, version, path FROM corrections WHERE item_id = ? AND state = 'accepting' AND accepted_in = ?").bind(item.id, claim).all<{ id: string; version: string; path: string }>();
    if (!rows.results.length) return;
    const facts = await itemFacts(env, item.id);
    if (!facts) return;
    const head = (await fetchLibraryPack(env)({ id: item.id, version: facts.head_version })) as Pack | null;
    const moved = [];
    for (const row of rows.results) {
      const made = row.version === facts.head_version ? head : ((await fetchLibraryPack(env)({ id: item.id, version: row.version })) as Pack | null);
      if (head && made && JSON.stringify(pieceOf(made, row.path)) !== JSON.stringify(pieceOf(head, row.path))) moved.push(row.id);
    }
    const fence = ` AND EXISTS (SELECT 1 FROM items WHERE id = ? AND head_version = ?) AND NOT (${PUBLISHED_CLAIM})`;
    await env.DB.batch([
      // Its piece changed since the version it was made on: superseded (no index superseded it while it was claimed).
      ...(moved.length ? [env.DB.prepare(`${release("superseded")} AND id IN (${moved.map(() => "?").join(", ")})${fence}`).bind(Date.now(), item.id, claim, ...moved, item.id, facts.head_version)] : []),
      env.DB.prepare(`${release("open")}${fence}`).bind(Date.now(), item.id, claim, item.id, facts.head_version),
    ]);
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM corrections WHERE item_id = ? AND state = 'accepting' AND accepted_in = ?").bind(item.id, claim).first<{ n: number }>();
    if (!left?.n) return;
  }
}

/** Whether a version of one of the library's packs went out: the catalog's head now, or its publish in the admin log. */
async function libraryPublished(env: Env, id: string, version: string) {
  return (
    (await catalogueHead(env, id)) === version ||
    Boolean(await env.DB.prepare("SELECT 1 AS y FROM admin_log WHERE action = 'library.publish' AND target = ?").bind(`pack:${id}@${version}`).first())
  );
}

/** Settles the claims on a pack left by accepts that never finished. */
async function settleStale(env: Env, item: { id: string; curated: number }) {
  const stale = await env.DB.prepare("SELECT DISTINCT accepted_in AS claim FROM corrections WHERE item_id = ? AND state = 'accepting' AND updated_at < ?").bind(item.id, Date.now() - CLAIM_STALE).all<{ claim: string }>();
  for (const { claim } of stale.results) await settleClaim(env, item, claim);
}

async function headPack(env: Env, item: ItemFacts): Promise<Pack> {
  const pack = (await fetchLibraryPack(env)({ id: item.id, version: item.head_version })) as Pack | null;
  if (!pack) throw new LibraryError(`"${item.id}"'s current version isn't in the library.`);
  return pack;
}

interface CorrectionRow {
  id: string;
  item_id: string;
  version: string;
  path: string;
  kind: "fix" | "flag";
  value: string | null;
  note: string | null;
  author_id: string | null;
  author_name?: string | null;
  state: string;
  accepted_in: string | null;
  answer_note: string | null;
  answered_at: number | null;
  shown: string;
  shown_reason?: string | null;
  likes: number;
  liked?: number | null;
  created_at: number;
  title?: string;
}
function view(row: CorrectionRow, viewerId: string | null, current?: Pack | null) {
  return {
    id: row.id,
    item: row.item_id,
    ...(row.title ? { title: row.title } : {}),
    path: row.path,
    kind: row.kind,
    ...(row.value !== null ? { value: JSON.parse(row.value) } : {}),
    ...(current ? { current: pieceOf(current, row.path) ?? null } : {}),
    note: row.note,
    by: row.author_name ?? "a former member",
    mine: viewerId !== null && row.author_id === viewerId,
    state: row.state,
    ...(row.accepted_in ? { acceptedIn: row.accepted_in } : {}),
    ...(row.answer_note ? { answer: row.answer_note } : {}),
    // Hidden or taken down after a report: only its author sees it, and why.
    ...(row.shown !== "visible" ? { shown: row.shown, ...(row.shown_reason ? { shownReason: row.shown_reason } : {}) } : {}),
    likes: row.likes,
    liked: Boolean(row.liked),
    version: row.version,
    at: new Date(row.created_at).toISOString(),
  };
}

/** A fix or a flag on one piece of a pack's current version, from anyone who may share (not its own author). */
export async function suggestCorrection(env: Env, actor: { userId: string; via: string }, itemId: string, input: { path?: unknown; kind?: unknown; value?: unknown; note?: unknown; version?: unknown }) {
  await mayShare(env, actor.userId);
  await checkBan(env, actor.userId, "community");
  const item = await itemFacts(env, itemId);
  if (!item || item.state !== "live") throw new LibraryError(`There's no pack "${itemId}" in Explore to correct.`);
  if (item.owner_id === actor.userId) throw new LibraryError("That pack is yours: share a new version of it instead (update_shared, or Share this update).");
  await settleStale(env, item);
  const version = text(input.version);
  if (version !== undefined && version !== item.head_version) throw new LibraryError(`That's an older version: corrections go on the current one (${item.head_version}).`);
  const path = canonicalPath(text(input.path) ?? "");
  if (!path) throw new LibraryError('path names one piece: "items/<id>/means", "items/<id>/wrong", "items/<id>/gap", "items/<id>/literal", "items/<id>/words", or "words/<lemma>".');
  const kind = input.kind === "fix" || input.kind === "flag" ? input.kind : null;
  if (!kind) throw new LibraryError('kind is "fix" (with value, the new value for that piece) or "flag" (with note, what\'s wrong).');
  const note = text(input.note)?.trim().slice(0, CORRECTION_LIMITS.note) || null;
  const pack = await headPack(env, item);
  const current = pieceOf(pack, path);
  if (current === undefined) throw new LibraryError(`The pack has no ${path} to correct.`);
  let value: string | null = null;
  if (kind === "fix") {
    if (input.value === undefined) throw new LibraryError("A fix carries value: the new value for that piece.");
    value = JSON.stringify(input.value);
    if (value.length > VALUE_BYTES) throw new LibraryError(`That value is ${value.length} bytes; a piece is never that big.`);
    if (value === JSON.stringify(current)) throw new LibraryError("That's what it says already.");
    const checked = checkFix(pack, path, input.value, { installed: await installedFor(env, pack.language, pack.id) });
    if (!checked.pack) return { suggested: false as const, errors: checked.errors, warnings: checked.warnings };
  } else if (!note || note.length < 5) throw new LibraryError("A flag says what's wrong (note).");
  const guard = await limitGuard(env, actor.userId, "correction");
  const id = randomId(10);
  const now = Date.now();
  try {
    const done = await env.DB.prepare(
      // Only while the pack is still at the version it was checked on (a new one may have changed this piece).
      `INSERT INTO corrections (id, item_id, version, path, kind, value, note, author_id, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE ${guard.sql} AND EXISTS (SELECT 1 FROM items WHERE id = ? AND state = 'live' AND head_version = ?)`,
    )
      .bind(id, item.id, item.head_version, path, kind, value, note, actor.userId, now, now, ...guard.binds, item.id, item.head_version)
      .run();
    if (!done.meta.changes) {
      await enforce(env, [guard]);
      throw new LibraryError("The pack changed while this was being checked: look at its current version and suggest it again.");
    }
  } catch (error) {
    if (/UNIQUE/i.test(String(error))) throw new LibraryError("You've an open correction on that piece already: withdraw it to suggest another.");
    throw error;
  }
  // The pack's author hears of it, if they have reminders and community notes on (src/reminders.ts).
  if (item.owner_id && item.owner_id !== actor.userId) await enqueue(env, item.owner_id, "community", { title: "A correction to your pack", body: "Someone suggested a fix to a pack you shared.", url: "/app/#explore/yours" }).catch(() => false);
  return { suggested: true as const, id, path, kind, version: item.head_version };
}

// A correction with its author's name, whether the viewer (bound first) likes it, and its pack's title.
const SELECT = `SELECT c.*, u.name AS author_name, i.title,
    (SELECT 1 FROM likes l WHERE l.target_kind = 'correction' AND l.target_id = c.id AND l.user_id = ?) AS liked
  FROM corrections c JOIN items i ON i.id = c.item_id LEFT JOIN users u ON u.id = c.author_id`;

/** An item's corrections (open first, the most liked first): only on an item the viewer can see, and only visible ones (and the viewer's own). */
export async function listCorrections(env: Env, itemId: string, viewerId: string | null, { all = false } = {}) {
  const page = await getItem(env, itemId, viewerId);
  if (!page) throw new LibraryError(`There's no pack "${itemId}" in Explore.`);
  const item = await itemFacts(env, itemId);
  const rows = await env.DB.prepare(
    `${SELECT} WHERE c.item_id = ? AND (c.shown = 'visible' OR c.author_id = ?) ${all ? "" : "AND c.state = 'open'"} ORDER BY c.state = 'open' DESC, c.likes DESC, c.created_at`,
  )
    .bind(viewerId, itemId, viewerId)
    .all<CorrectionRow>();
  const head = item ? await headPack(env, item).catch(() => null) : null;
  return rows.results.map((row) => view(row, viewerId, head));
}

/** The open fixes on an item's current version, for a device playing it with community corrections (study/pack-corrections.js communityOverlay). */
export async function openFixes(env: Env, itemId: string, viewerId: string | null) {
  const page = await getItem(env, itemId, viewerId);
  if (!page) throw new LibraryError(`There's no pack "${itemId}" in Explore.`);
  const rows = await env.DB.prepare("SELECT id, path, value, likes, created_at FROM corrections WHERE item_id = ? AND state = 'open' AND kind = 'fix' AND shown = 'visible' ORDER BY id")
    .bind(itemId)
    .all<{ id: string; path: string; value: string; likes: number; created_at: number }>();
  return { id: itemId, version: page.item.version, fixes: rows.results.map((r) => ({ id: r.id, path: r.path, value: JSON.parse(r.value), likes: r.likes, at: new Date(r.created_at).toISOString() })) };
}

/** This account's corrections, newest first, with what became of each. */
export async function myCorrections(env: Env, userId: string) {
  const rows = await env.DB.prepare(`${SELECT} WHERE c.author_id = ? ORDER BY c.created_at DESC LIMIT 200`)
    .bind(userId, userId)
    .all<CorrectionRow>();
  return rows.results.map((row) => view(row, userId));
}

/** Open corrections waiting on this account's packs (or, for an admin, waiting a month with likes on any pack). */
export async function correctionsToAnswer(env: Env, userId: string, { waiting = false, adminAccess = false } = {}) {
  if (waiting) {
    if (!adminAccess || !(await rolesOf(env, userId)).has("admin")) throw new LibraryError("Corrections waiting a month are an admin's to see (over a connection with admin access).");
    const rows = await env.DB.prepare(`${SELECT} WHERE c.state = 'open' AND c.shown = 'visible' AND c.likes > 0 AND c.created_at < ? AND i.state = 'live' ORDER BY c.likes DESC, c.created_at LIMIT 100`)
      .bind(userId, Date.now() - 30 * 24 * 60 * 60 * 1000)
      .all<CorrectionRow>();
    return rows.results.map((row) => view(row, userId));
  }
  const rows = await env.DB.prepare(`${SELECT} WHERE i.owner_id = ? AND c.state = 'open' AND c.shown = 'visible' ORDER BY c.likes DESC, c.created_at LIMIT 200`)
    .bind(userId, userId)
    .all<CorrectionRow>();
  return rows.results.map((row) => view(row, userId));
}

/** Its author takes an open correction back. */
export async function withdrawCorrection(env: Env, userId: string, id: string) {
  const done = await env.DB.prepare("UPDATE corrections SET state = 'withdrawn', updated_at = ? WHERE id = ? AND author_id = ? AND state = 'open'").bind(Date.now(), id, userId).run();
  if (!done.meta.changes) throw new LibraryError("No open correction of yours with that id.");
  return { id, state: "withdrawn" };
}

/** Likes come from the app only, one per account, on an open correction you didn't make. */
export async function likeCorrection(env: Env, userId: string, id: string, on: boolean) {
  const row = await env.DB.prepare("SELECT author_id, state, shown FROM corrections WHERE id = ?").bind(id).first<{ author_id: string | null; state: string; shown: string }>();
  if (!row || row.shown !== "visible") throw new LibraryError("There's no such correction.");
  const recount = env.DB.prepare("UPDATE corrections SET likes = (SELECT COUNT(*) FROM likes WHERE target_kind = 'correction' AND target_id = ?1) WHERE id = ?1").bind(id);
  if (on) {
    await checkBan(env, userId, "community");
    if (row.author_id === userId) throw new LibraryError("That one's yours.");
    if (row.state !== "open") throw new LibraryError("That correction is settled.");
    const guard = await limitGuard(env, userId, "like");
    const already = await env.DB.prepare("SELECT 1 AS y FROM likes WHERE user_id = ? AND target_kind = 'correction' AND target_id = ?").bind(userId, id).first();
    const [added] = await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO likes (user_id, target_kind, target_id, created_at) SELECT ?, 'correction', ?, ? WHERE ${guard.sql}`).bind(userId, id, Date.now(), ...guard.binds),
      recount,
    ]);
    if (!already && !added!.meta.changes) throw guard.refusal();
  } else await env.DB.batch([env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND target_kind = 'correction' AND target_id = ?").bind(userId, id), recount]);
  const after = await env.DB.prepare("SELECT likes FROM corrections WHERE id = ?").bind(id).first<{ likes: number }>();
  return { id, liked: on, likes: after?.likes ?? 0 };
}

/**
 * Accepts or declines corrections on a pack: its author, or an admin (on the library's own packs, an admin only).
 * Accepting several makes one new version with each fix in it (checked as any version is), its note naming who
 * suggested them; declining gives a reason. A flag can be declined; it's settled for good by the version that changes
 * its piece (superseded).
 */
export async function reviewCorrections(env: Env, actor: { userId: string; via: string; adminAccess: boolean }, itemId: string, input: { accept?: unknown; decline?: unknown; note?: unknown }) {
  const item = await itemFacts(env, itemId);
  if (!item) throw new LibraryError(`There's no pack "${itemId}".`);
  // An admin's power, only over a connection that reaches it (a personal token made with admin access, or sign-in).
  const admin = actor.adminAccess && (await rolesOf(env, actor.userId)).has("admin");
  if (item.curated ? !admin : item.owner_id !== actor.userId && !admin) throw new LibraryError(item.curated ? "Corrections to Lexicommons' own packs are an admin's to answer." : "Only the pack's author (or an admin) answers its corrections.");
  const accept = Array.isArray(input.accept) ? input.accept.filter((v): v is string => typeof v === "string") : [];
  const decline = Array.isArray(input.decline) ? input.decline.filter((d): d is { id: string; why: string } => Boolean(d) && typeof d.id === "string" && typeof d.why === "string") : [];
  if (!accept.length && !decline.length) throw new LibraryError("Say what to accept (accept: [ids]) or decline (decline: [{ id, why }]).");
  if (accept.length > PER_REVIEW || decline.length > PER_REVIEW) throw new LibraryError(`At most ${PER_REVIEW} accepted and ${PER_REVIEW} declined in one answer.`);
  if (decline.some((d) => d.why.trim().length < 3)) throw new LibraryError("Each declined correction needs a reason (why).");
  if (new Set([...accept, ...decline.map((d) => d.id)]).size !== accept.length + decline.length) throw new LibraryError("A correction can be accepted or declined, not both.");
  const now = Date.now();
  await settleStale(env, item);
  let version: string | null = null;
  let ownerCopy: Record<string, unknown> | null = null;
  let acceptedCount = 0;
  const warnings: Problem[] = [];
  if (accept.length) {
    if (item.state !== "live") throw new LibraryError(`"${itemId}" isn't live, so it can't take a new version.`);
    const rows = await env.DB.prepare(`SELECT c.*, u.name AS author_name FROM corrections c LEFT JOIN users u ON u.id = c.author_id WHERE c.item_id = ? AND c.id IN (${accept.map(() => "?").join(", ")})`)
      .bind(itemId, ...accept)
      .all<CorrectionRow>();
    const found = new Map(rows.results.map((r) => [r.id, r]));
    const problems = accept.flatMap((id) => {
      const r = found.get(id);
      if (!r) return [`${id}: no such correction on this pack.`];
      if (r.state !== "open") return [`${id} is ${r.state}.`];
      if (r.kind !== "fix") return [`${id} is a flag: there's no value to put in (decline it, or share a version that fixes the piece).`];
      if (r.shown !== "visible") return [`${id} is hidden after a report.`];
      return [];
    });
    if (problems.length) throw new LibraryError(problems.join("\n"));
    const fixes = accept.map((id) => found.get(id)!);
    const head = await headPack(env, item);
    const fixed = withFixes(head, fixes.map((f) => ({ path: f.path, value: JSON.parse(f.value!) })), { installed: await installedFor(env, head.language, head.id) });
    if (!fixed.pack) return { reviewed: false as const, errors: fixed.errors, warnings: fixed.warnings };
    const authors = [...new Set(fixes.map((f) => f.author_name ?? "a former member"))];
    const note = [`Corrections by ${authors.join(", ")}.`, text(input.note)?.trim()].filter(Boolean).join(" ").slice(0, 500);
    // Claim them first, all or none, naming the version they'll make (accepting: from here a withdrawal or a second
    // suggestion on the piece can't take them, and a version that changes their piece supersedes them). That version's
    // own batch accepts them (community.ts versionStatements), and it's made only on the head they were read on. So
    // when it's over, their state says how it went, whatever was thrown: accepted into it, or open again.
    const expected = await packVersion(fixed.pack);
    const claim = `claim:${randomId(8)}:${expected}`;
    const marks = accept.map(() => "?").join(", ");
    const claimed = await env.DB.prepare(
      `UPDATE corrections SET state = 'accepting', accepted_in = ?, answered_by = ?, answered_at = ?, answer_note = ?, updated_at = ? WHERE item_id = ? AND state = 'open' AND kind = 'fix' AND shown = 'visible' AND id IN (${marks})`,
    )
      .bind(claim, actor.userId, now, note, now, itemId, ...accept)
      .run();
    if (claimed.meta.changes !== accept.length) {
      await settleClaim(env, item, claim);
      throw new LibraryError(LOOK_AGAIN);
    }
    let failure: { errors: Problem[]; warnings: Problem[] } | null = null;
    let thrown: unknown = null;
    try {
      if (item.curated) {
        // The new default version, through the library tools' own publish (its checks, a compare-and-set, a revision),
        // only over the version the fixes were applied to, and only while the claim still holds them all (the catalog
        // is in R2, so this is read just before; a claim is taken for stale only after CLAIM_STALE).
        const held = await env.DB.prepare("SELECT COUNT(*) AS n FROM corrections WHERE item_id = ? AND state = 'accepting' AND accepted_in = ? AND shown = 'visible'").bind(itemId, claim).first<{ n: number }>();
        if (held?.n !== accept.length) failure = { errors: [{ at: "pack", message: LOOK_AGAIN }], warnings: [] };
        else {
          const published = await publish(env, actor, { packValue: fixed.pack, packFrom: item.head_version, note });
          if (!published.published) failure = { errors: published.problems, warnings: [] };
        }
      } else {
        // Made on the head, so a piece it changes that held an earlier accepted correction is replaced on purpose: it
        // never asks confirm_reverts (that guards an update from the author's own copy, which may not have them).
        const updated = await updateShared(env, actor, itemId, { pack: fixed.pack, note, confirmReverts: true }, { asAdmin: admin && item.owner_id !== actor.userId, expectedHead: item.head_version, claim: { id: claim, count: accept.length } });
        if (!updated.updated) failure = { errors: updated.errors, warnings: updated.warnings };
      }
    } catch (error) {
      thrown = error;
    }
    await settleClaim(env, item, claim);
    const into = await env.DB.prepare(`SELECT COUNT(*) AS n FROM corrections WHERE item_id = ? AND state = 'accepted' AND accepted_in = ? AND id IN (${marks})`)
      .bind(itemId, expected, ...accept)
      .first<{ n: number }>();
    // A library pack's version may be out though moderation let go of some of its claims meanwhile (a hide in the
    // moment before its catalog write): what went out says, and the warning below names what was hidden.
    const out = into?.n === accept.length || (item.curated === 1 && !failure && (await libraryPublished(env, itemId, expected)));
    if (!out) {
      if (thrown) throw thrown;
      return { reviewed: false as const, errors: failure?.errors ?? [{ at: "pack", message: LOOK_AGAIN }], warnings: failure?.warnings ?? [] };
    }
    acceptedCount = into?.n ?? 0;
    // Made, though something after it went wrong (the library's bookkeeping after its catalog write): say so.
    if (thrown) warnings.push({ at: "pack", message: `The new version is out, but something after it didn't finish: ${thrown instanceof Error ? thrown.message : String(thrown)}` });
    version = expected;
    // A library pack's accept can't be fenced in R2 (its catalog): one hidden in the moment before its write is said.
    if (item.curated) {
      const hidden = await env.DB.prepare(`SELECT id FROM corrections WHERE id IN (${marks}) AND shown != 'visible'`).bind(...accept).all<{ id: string }>();
      if (hidden.results.length) {
        const one = hidden.results.length === 1;
        warnings.push({ at: "pack", message: `Hidden after a report while this was being published: ${hidden.results.map((r) => r.id).join(", ")}. The new version carries ${one ? "its fix" : "their fixes"}: look at it, and take ${one ? "it" : "them"} out with a new version if the report is right.` });
      }
    }
    // A shared pack's author keeps their own copy on their devices: the same fixes go to it through the relay
    // (packs.ts queueOwnerChange), applied to it as it is there, so their own edits elsewhere stay. Whatever comes of
    // it, the version is made and the corrections accepted; the answer says what became of their copy.
    if (!item.curated && item.owner_id && item.source_id) {
      const own = item.owner_id === actor.userId;
      const values = fixes.map((f) => ({ path: f.path, value: JSON.parse(f.value!) }));
      try {
        const installed = await installedFor(env, item.language, item.source_id);
        const outcome = await queueOwnerChange(env, item.owner_id, {
          packId: item.source_id,
          label: "corrections",
          said: `brought in ${accept.length} accepted correction${accept.length === 1 ? "" : "s"} to ${item.title}`,
          revise: (pack) => {
            const applied = withFixes(pack as unknown as Pack, values, { installed });
            // The fixes don't apply to their pack as it is there (a piece it no longer has): said so, as refused.
            if (!applied.pack) throw new Error(applied.errors.map((e) => e.message).join(" "));
            return applied.pack as unknown as typeof pack;
          },
        });
        ownerCopy = ownerCopyOf(outcome, own);
      } catch (error) {
        ownerCopy = { updated: false, reason: "error", why: `${own ? "Your" : "The author's"} own copy wasn't changed (${error instanceof Error ? error.message : "an error"}); the new version is out.` };
      }
    }
  }
  let declined = 0;
  if (decline.length) {
    const results = await env.DB.batch(
      decline.map((d) => env.DB.prepare("UPDATE corrections SET state = 'declined', answered_by = ?, answered_at = ?, answer_note = ?, updated_at = ? WHERE id = ? AND item_id = ? AND state = 'open'").bind(actor.userId, now, d.why.trim().slice(0, 500), now, d.id, itemId)),
    );
    declined = results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  }
  if (admin && item.owner_id !== actor.userId) {
    await logAdmin(env, { actorId: actor.userId, via: actor.via, action: "corrections.review", target: `item:${itemId}`, after: { accepted: accept, declined: decline.map((d) => d.id), version } });
  }
  // Whoever suggested an accepted correction hears of it, if they have reminders and community notes on.
  if (acceptedCount && accept.length) {
    const authors = await env.DB.prepare(`SELECT DISTINCT author_id FROM corrections WHERE item_id = ? AND state = 'accepted' AND id IN (${accept.map(() => "?").join(",")})`).bind(itemId, ...accept).all<{ author_id: string | null }>();
    for (const { author_id } of authors.results) if (author_id && author_id !== actor.userId) await enqueue(env, author_id, "community", { title: "Your correction was accepted", body: "It's in the pack now. Thank you.", url: "/app/#explore" }).catch(() => false);
  }
  return { reviewed: true as const, id: itemId, accepted: acceptedCount, declined, ...(version ? { version } : {}), ...(ownerCopy ? { ownerCopy } : {}), ...(warnings.length ? { warnings } : {}) };
}
