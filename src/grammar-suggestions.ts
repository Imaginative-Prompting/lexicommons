// Suggestions to a language's shared grammar (public/js/lang/grammar.js; ../docs/design/grammar-as-data/README.md,
// phase 2). Anyone signed in suggests a new pattern, a fix to one (its name, its explanation, what it builds on) or
// retiring one, in Explore or through their AI (suggest_pattern), checked at once against the grammar as the library
// has it now; others like them (in the app) and report them (moderation.ts, on their own `shown`). An admin accepts
// some into the grammar's next revision, published to the open library through library-admin.ts's own checks, or
// declines them, over MCP (review_grammar_suggestions). Who may decide is mayReview: an admin now, a language's named
// maintainers later. The published file never names a person (grammar.js suggestedSource): who suggested what stays
// here, and goes with their account.
//
// Accepting is claimed first (state accepting, a token naming the revision it's going into), then published, then
// marked accepted, so two reviews at once never put one suggestion in twice, and a hide (moderation) lets go of a
// claim. A claim left by a request that died is settled by the next review after 30 minutes: accepted if the admin
// log has the publish that named its token, else open again.

import { LANGUAGES, languageName } from "../public/js/lang/index.js";
import { KNOWS, SUGGESTION_LIMITS, checkSuggestion as checkSuggestionJs, withSuggestions as withSuggestionsJs } from "../public/js/lang/grammar.js";
import { mayShare } from "./community";
import type { CallerProps, Env } from "./env";
import type { Grammar } from "./grammar";
import { LibraryError } from "./library";
import { catalogueGrammar, currentCatalogue, publish } from "./library-admin";
import { checkBan, enforce, limitGuard } from "./moderation";
import { logAdmin, requireRole } from "./roles";
import { randomId } from "./util";

type Kind = "new" | "fix" | "retire";
interface Change {
  name?: string;
  about?: string;
  after?: string[];
  chip?: string;
  short?: string;
}
const checkSuggestion = checkSuggestionJs as unknown as (input: unknown, grammar: Grammar) => { suggestion: { kind: Kind; pattern: string; change: Change } | null; problems: string[] };
const withSuggestions = withSuggestionsJs as unknown as (
  grammar: Grammar,
  accepted: { id: string; kind: Kind; pattern: string; change: Change; knows: string; via: string }[],
  options: { at: string },
) => { grammar: Grammar | null; problems: string[] };

export const GRAMMAR_SUGGESTION_LIMITS = { note: SUGGESTION_LIMITS.note, why: 500, list: 100, review: 20 };
/** The largest real bodies the app's routes read (app.ts): a suggestion with every field at its longest, times 6 (JSON's \u0000), with room. */
export const GRAMMAR_SUGGESTION_BODY = { suggest: 6 * (80 + 400 + GRAMMAR_SUGGESTION_LIMITS.note + 8 * 44 + 200) + 4 * 1024 };
const CLAIM_MS = 30 * 60_000;
const text = (value: unknown) => (typeof value === "string" ? value : undefined);
/** A language someone can learn here (any in the registry but English). */
const learnable = (code: unknown): code is string => typeof code === "string" && code !== "en" && Object.hasOwn(LANGUAGES, code);

interface Row {
  id: string;
  language: string;
  kind: Kind;
  pattern: string;
  change: string;
  note: string | null;
  knows: string;
  via: "app" | "ai";
  source: string | null;
  author_id: string | null;
  author_name?: string | null;
  against: number;
  state: string;
  claim: string | null;
  claimed_at: number | null;
  revision: number | null;
  decided_at: number | null;
  decision_note: string | null;
  shown: string;
  shown_reason: string | null;
  likes: number;
  liked?: number;
  created_at: number;
}

/** A suggestion as people see it: its author's name, whether you liked it, and (to its author) its moderation. */
function view(row: Row, viewerId: string | null) {
  const mine = Boolean(viewerId && row.author_id === viewerId);
  return {
    id: row.id,
    language: row.language,
    kind: row.kind,
    pattern: row.pattern,
    change: JSON.parse(row.change) as Change,
    note: row.note,
    knows: row.knows,
    via: row.via,
    by: row.author_name ?? null,
    state: row.state === "accepting" ? "open" : row.state,
    ...(row.state === "accepted" ? { revision: row.revision } : {}),
    ...(row.decision_note ? { why: row.decision_note } : {}),
    ...(row.decided_at ? { decidedAt: new Date(row.decided_at).toISOString() } : {}),
    against: row.against,
    likes: row.likes,
    ...(viewerId ? { liked: Boolean(row.liked) } : {}),
    mine,
    ...(mine && row.shown !== "visible" ? { shown: row.shown, shownReason: row.shown_reason } : {}),
    at: new Date(row.created_at).toISOString(),
  };
}
export type SuggestionView = ReturnType<typeof view>;

const SELECT = (viewer: string | null) =>
  `SELECT g.*, u.name AS author_name${viewer ? ", EXISTS (SELECT 1 FROM likes l WHERE l.user_id = ? AND l.target_kind = 'grammar' AND l.target_id = g.id) AS liked" : ""}
   FROM grammar_suggestions g LEFT JOIN users u ON u.id = g.author_id`;

/** The grammar a language has now (the catalog's revision, or the app's own revision 1). */
async function grammarOf(env: Env, language: string): Promise<Grammar> {
  const found = await catalogueGrammar(env, (await currentCatalogue(env)).catalogue, language);
  if ("problem" in found) throw new LibraryError(found.problem);
  return found.grammar;
}

/** An author's suggestions still open on a pattern. Binds: author, language, pattern. */
const YOURS_OPEN = "FROM grammar_suggestions WHERE author_id = ? AND language = ? AND pattern = ? AND state IN ('open', 'accepting')";

/**
 * Suggests a change to a language's grammar: { language, kind, pattern?, name?, about?, after?, note?, knows }.
 * actor.ai: it came through their AI (suggest_pattern). Returns { suggested: true, suggestion } or, when the
 * suggestion doesn't pass the check, { suggested: false, problems } (every one at once, nothing kept).
 */
export async function suggestPattern(env: Env, actor: { userId: string; via: string; ai: boolean }, input: Record<string, unknown>) {
  await mayShare(env, actor.userId);
  await checkBan(env, actor.userId, "community");
  if (!learnable(input.language)) throw new LibraryError(`language is the language whose grammar it's for (${Object.keys(LANGUAGES).filter((c) => c !== "en").join(", ")}).`);
  const language = input.language;
  const knows = text(input.knows);
  if (!knows || !Object.hasOwn(KNOWS, knows)) throw new LibraryError(`knows says how its suggester knows ${languageName(language)}: "native", "fluent" or "learning".`);
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") throw new LibraryError("note is text.");
  const note = text(input.note)?.trim().slice(0, GRAMMAR_SUGGESTION_LIMITS.note) || null;
  const grammar = await grammarOf(env, language);
  const { suggestion, problems } = checkSuggestion(input, grammar);
  if (!suggestion) return { suggested: false as const, problems };
  // One open suggestion of yours per pattern: change it by withdrawing it and suggesting again. Read here for the answer, and held again
  // in the write itself, so two sent at once can't both go in (7 Nov 2026, Codex C19).
  const yours = async () =>
    env.DB.prepare(`SELECT id ${YOURS_OPEN}`).bind(actor.userId, language, suggestion.pattern).first<{ id: string }>();
  const waiting = (found: { id: string }) => new LibraryError(`You have a suggestion on "${suggestion.pattern}" waiting already (${found.id}): withdraw it first to suggest another.`);
  const already = await yours();
  if (already) throw waiting(already);
  const guard = await limitGuard(env, actor.userId, "grammar");
  const id = randomId(10);
  const now = Date.now();
  let done;
  try {
    done = await env.DB.prepare(
      `INSERT INTO grammar_suggestions (id, language, kind, pattern, change, note, knows, via, source, author_id, against, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql} AND NOT EXISTS (SELECT 1 ${YOURS_OPEN})`,
    )
      .bind(id, language, suggestion.kind, suggestion.pattern, JSON.stringify(suggestion.change), note, knows, actor.ai ? "ai" : "app", actor.via.slice(0, 120), actor.userId, grammar.revision, now, now, ...guard.binds, actor.userId, language, suggestion.pattern)
      .run();
  } catch (error) {
    if (/UNIQUE/i.test(String(error))) throw new LibraryError(`Someone suggested a new pattern "${suggestion.pattern}" just now: like theirs, or give yours another id.`);
    throw error;
  }
  if (!done.meta.changes) {
    const found = await yours();
    if (found) throw waiting(found);
    await enforce(env, [guard]);
    throw new LibraryError("It wasn't kept: try again.");
  }
  return { suggested: true as const, suggestion: await getSuggestion(env, id, actor.userId) };
}

/** One suggestion, as the viewer may see it (a hidden or removed one only to its author). */
export async function getSuggestion(env: Env, id: string, viewerId: string | null) {
  const row = await env.DB.prepare(`${SELECT(viewerId)} WHERE g.id = ?`)
    .bind(...(viewerId ? [viewerId] : []), id)
    .first<Row>();
  if (!row || (row.shown !== "visible" && row.author_id !== viewerId)) throw new LibraryError("There's no such suggestion.");
  return view(row, viewerId);
}

/**
 * A language's suggestions: the open ones (most liked first, then the longest waiting) and, with decided, the decided
 * ones too (newest first).
 * pattern narrows them to one pattern; mine lists only the viewer's own, any language, any state. Hidden ones show
 * only to their author.
 */
export async function listSuggestions(env: Env, viewerId: string | null, query: { language?: unknown; pattern?: unknown; decided?: boolean; mine?: boolean; limit?: number } = {}) {
  const where: string[] = [];
  const binds: unknown[] = viewerId ? [viewerId] : [];
  if (query.mine) {
    if (!viewerId) throw new LibraryError("Sign in to see your suggestions.");
    where.push("g.author_id = ?");
    binds.push(viewerId);
  } else {
    if (!learnable(query.language)) throw new LibraryError("language is the language whose grammar's suggestions to list.");
    where.push("g.language = ?", viewerId ? "(g.shown = 'visible' OR g.author_id = ?)" : "g.shown = 'visible'");
    binds.push(query.language, ...(viewerId ? [viewerId] : []));
    if (!query.decided) where.push("g.state IN ('open', 'accepting')");
  }
  if (query.pattern !== undefined) {
    if (typeof query.pattern !== "string") throw new LibraryError("pattern is a pattern's id.");
    where.push("g.pattern = ?");
    binds.push(query.pattern);
  }
  if (query.mine && query.language !== undefined) {
    if (!learnable(query.language)) throw new LibraryError("language is a language's code.");
    where.push("g.language = ?");
    binds.push(query.language);
  }
  const limit = Math.min(Math.max(query.limit ?? 50, 1), GRAMMAR_SUGGESTION_LIMITS.list);
  // Two made in the same millisecond tie on created_at, and SQLite then gives them in whatever order its plan reads
  // them (the index's: by pattern). The rowid, which grows with each one made (the id is random), keeps the order they
  // were made in.
  const rows = await env.DB.prepare(
    `${SELECT(viewerId)} WHERE ${where.join(" AND ")}
     ORDER BY CASE WHEN g.state IN ('open', 'accepting') THEN 0 ELSE 1 END, CASE WHEN g.state IN ('open', 'accepting') THEN -g.likes ELSE -COALESCE(g.decided_at, g.updated_at) END,
       CASE WHEN g.state IN ('open', 'accepting') THEN g.created_at ELSE -g.created_at END,
       CASE WHEN g.state IN ('open', 'accepting') THEN g.rowid ELSE -g.rowid END LIMIT ?`,
  )
    .bind(...binds, limit)
    .all<Row>();
  return rows.results.map((row) => view(row, viewerId));
}

/** Likes a suggestion waiting for a decision (not your own), or takes the like back. */
export async function likeSuggestion(env: Env, userId: string, id: string, on: boolean) {
  const row = await env.DB.prepare("SELECT author_id, state, shown FROM grammar_suggestions WHERE id = ?").bind(id).first<{ author_id: string | null; state: string; shown: string }>();
  if (!row || row.shown !== "visible") throw new LibraryError("There's no such suggestion.");
  const recount = env.DB.prepare("UPDATE grammar_suggestions SET likes = (SELECT COUNT(*) FROM likes WHERE target_kind = 'grammar' AND target_id = ?1) WHERE id = ?1").bind(id);
  if (on) {
    await checkBan(env, userId, "community");
    if (row.author_id === userId) throw new LibraryError("That one's yours.");
    if (!["open", "accepting"].includes(row.state)) throw new LibraryError(`That suggestion was ${row.state} already.`);
    const guard = await limitGuard(env, userId, "like");
    const already = await env.DB.prepare("SELECT 1 AS y FROM likes WHERE user_id = ? AND target_kind = 'grammar' AND target_id = ?").bind(userId, id).first();
    const [added] = await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO likes (user_id, target_kind, target_id, created_at) SELECT ?, 'grammar', ?, ? WHERE ${guard.sql} AND EXISTS (SELECT 1 FROM grammar_suggestions WHERE id = ? AND state IN ('open', 'accepting') AND shown = 'visible')`,
      ).bind(userId, id, Date.now(), ...guard.binds, id),
      recount,
    ]);
    if (!already && !added!.meta.changes) {
      await enforce(env, [guard]);
      throw new LibraryError("That suggestion changed just now (decided, withdrawn or hidden): look at it again.");
    }
  } else await env.DB.batch([env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND target_kind = 'grammar' AND target_id = ?").bind(userId, id), recount]);
  const after = await env.DB.prepare("SELECT likes FROM grammar_suggestions WHERE id = ?").bind(id).first<{ likes: number }>();
  return { id, liked: on, likes: after?.likes ?? 0 };
}

/** Withdraws a suggestion of yours that's still waiting. */
export async function withdrawSuggestion(env: Env, userId: string, id: string) {
  const done = await env.DB.prepare("UPDATE grammar_suggestions SET state = 'withdrawn', decided_at = ?, updated_at = ? WHERE id = ? AND author_id = ? AND state = 'open'").bind(Date.now(), Date.now(), id, userId).run();
  if (!done.meta.changes) {
    const row = await env.DB.prepare("SELECT author_id, state FROM grammar_suggestions WHERE id = ?").bind(id).first<{ author_id: string | null; state: string }>();
    throw new LibraryError(!row || row.author_id !== userId ? "There's no suggestion of yours with that id." : row.state === "accepting" ? "It's being accepted right now." : `It was ${row.state} already.`);
  }
  return { id, state: "withdrawn" };
}

/**
 * Who may accept or decline suggestions to a language's grammar: an admin, for now. Named maintainers per language
 * are the next step, and this is the one place they'd go.
 */
export async function mayReview(env: Env, caller: CallerProps, _language: string): Promise<void> {
  await requireRole(env, caller, "admin");
}

/**
 * Claims left by a review that died: accepted if the admin log has the publish that named the claim (its note starts
 * with it), else open again. Only claims older than 30 minutes (a review may still be publishing).
 */
async function settleStale(env: Env, language: string) {
  const stale = await env.DB.prepare("SELECT DISTINCT claim FROM grammar_suggestions WHERE language = ? AND state = 'accepting' AND claimed_at < ?").bind(language, Date.now() - CLAIM_MS).all<{ claim: string }>();
  for (const { claim } of stale.results) {
    const published = await env.DB.prepare("SELECT created_at, actor_id FROM admin_log WHERE action = 'library.publish' AND note LIKE ? ORDER BY created_at LIMIT 1").bind(`(claim ${claim})%`).first<{ created_at: number; actor_id: string }>();
    if (published) await env.DB.prepare("UPDATE grammar_suggestions SET state = 'accepted', claim = NULL, decided_by = ?, decided_at = ?, updated_at = ? WHERE claim = ? AND state = 'accepting'").bind(published.actor_id, published.created_at, Date.now(), claim).run();
    else await env.DB.prepare("UPDATE grammar_suggestions SET state = 'open', claim = NULL, claimed_at = NULL, revision = NULL, updated_at = ? WHERE claim = ? AND state = 'accepting'").bind(Date.now(), claim).run();
  }
}

/**
 * An admin's decision on suggestions to one language's grammar: accept (ids: they go into its next revision together,
 * published to the open library through library_publish's own checks) and decline ([{ id, why }]: why is shown to its
 * suggester). Open suggestions on a pattern an accepted fix or retirement changed are superseded. Returns what was
 * done; when the accepted ones can't make a revision that passes, { published: false, problems } and nothing is
 * accepted (the declines stand).
 */
export async function reviewSuggestions(env: Env, actor: { userId: string; via: string; caller: CallerProps }, input: { language?: unknown; accept?: unknown; decline?: unknown; note?: unknown }) {
  if (!learnable(input.language)) throw new LibraryError("language is the language whose grammar these suggestions are for.");
  const language = input.language;
  await mayReview(env, actor.caller, language);
  await settleStale(env, language);
  const accept = Array.isArray(input.accept) ? [...new Set(input.accept.filter((id): id is string => typeof id === "string"))] : [];
  const decline = Array.isArray(input.decline) ? input.decline.filter((d): d is { id: string; why: string } => Boolean(d) && typeof d.id === "string" && typeof d.why === "string") : [];
  if (!accept.length && !decline.length) throw new LibraryError("Say what to accept (ids) or decline ([{ id, why }]).");
  if (accept.length > GRAMMAR_SUGGESTION_LIMITS.review || decline.length > GRAMMAR_SUGGESTION_LIMITS.review) throw new LibraryError(`At most ${GRAMMAR_SUGGESTION_LIMITS.review} of each at a time.`);
  if (decline.some((d) => accept.includes(d.id))) throw new LibraryError("A suggestion is accepted or declined, not both.");
  const note = text(input.note)?.trim().slice(0, 300) || "";
  const now = Date.now();
  const out: { language: string; declined: string[]; accepted: string[]; superseded: string[]; revision?: number; published?: unknown; problems?: string[] } = { language, declined: [], accepted: [], superseded: [] };

  for (const d of decline) {
    const why = d.why.trim().slice(0, GRAMMAR_SUGGESTION_LIMITS.why);
    if (!why) throw new LibraryError(`Say why ${d.id} is declined (its suggester sees it).`);
    const done = await env.DB.prepare("UPDATE grammar_suggestions SET state = 'declined', decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ? WHERE id = ? AND language = ? AND state = 'open'")
      .bind(actor.userId, now, why, now, d.id, language)
      .run();
    if (!done.meta.changes) throw new LibraryError(`${d.id} isn't an open suggestion to ${languageName(language)}'s grammar (look again: grammar_suggestions).`);
    out.declined.push(d.id);
  }
  if (out.declined.length) await logAdmin(env, { actorId: actor.userId, via: actor.via, action: "grammar.decline", target: `grammar:${language}`, after: { declined: decline.map((d) => ({ id: d.id, why: d.why })) } });
  if (!accept.length) return out;

  const marks = accept.map(() => "?").join(", ");
  const rows = (await env.DB.prepare(`SELECT * FROM grammar_suggestions WHERE id IN (${marks})`).bind(...accept).all<Row>()).results;
  const missing = accept.filter((id) => !rows.some((r) => r.id === id && r.language === language && r.state === "open" && r.shown === "visible"));
  if (missing.length) throw new LibraryError(`${missing.join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} open and shown in ${languageName(language)}'s grammar (decided, withdrawn, hidden, or another language's): look again.`);
  const current = await grammarOf(env, language);
  const built = withSuggestions(
    current,
    rows.map((r) => ({ id: r.id, kind: r.kind, pattern: r.pattern, change: JSON.parse(r.change) as Change, knows: r.knows, via: r.via })),
    { at: new Date(now).toISOString().slice(0, 10) },
  );
  if (!built.grammar) return { ...out, published: false, problems: built.problems };

  // Claimed first: a second review at once, or a hide, finds them taken.
  const claim = randomId(12);
  const claimed = await env.DB.prepare(`UPDATE grammar_suggestions SET state = 'accepting', claim = ?, claimed_at = ?, revision = ?, updated_at = ? WHERE id IN (${marks}) AND state = 'open' AND shown = 'visible'`)
    .bind(claim, now, built.grammar.revision, now, ...accept)
    .run();
  const release = () => env.DB.prepare("UPDATE grammar_suggestions SET state = 'open', claim = NULL, claimed_at = NULL, revision = NULL WHERE claim = ? AND state = 'accepting'").bind(claim).run();
  if (claimed.meta.changes !== accept.length) {
    await release();
    throw new LibraryError("Some of them changed just now (decided, withdrawn or hidden): look again (grammar_suggestions).");
  }
  let result;
  try {
    // A hide meanwhile lets go of its claim (moderation.ts GRAMMAR_LETS_GO): every claim is checked again as late as can be, just before the
    // catalog is written, so a suggestion hidden while this ran never goes out (6 Nov 2026, the Codex review's C15; before, it was only
    // left out of what was marked accepted, its words already in the grammar). A hide in the moment between that check and R2's write is
    // the window left: D1 and R2 can't be written as one.
    const stillClaimed = async () => {
      const held = await env.DB.prepare("SELECT COUNT(*) AS n FROM grammar_suggestions WHERE claim = ? AND state = 'accepting'").bind(claim).first<{ n: number }>();
      return held?.n === accept.length ? null : "One of them was hidden while this was being published (a report came in): nothing was published. Look again (grammar_suggestions).";
    };
    result = await publish(
      env,
      { userId: actor.userId, via: actor.via },
      { grammarValue: built.grammar, note: `(claim ${claim}) Suggestions ${accept.join(", ")} to ${languageName(language)}'s grammar.${note ? ` ${note}` : ""}` },
      undefined,
      { beforeWrite: stillClaimed },
    );
  } catch (error) {
    await release();
    throw error;
  }
  if (!result.published) {
    await release();
    return { ...out, published: false, problems: result.problems.map((p) => `${p.at}: ${p.message}`) };
  }
  // Accepted where the claim still holds, and the open ones on a pattern this revision changed are superseded: those made against a revision
  // before it, never one made against this revision itself in the moment since it was written (C15).
  const touched = [...new Set(rows.map((r) => r.pattern))];
  const [acceptedNow, superseded] = await env.DB.batch([
    env.DB.prepare("UPDATE grammar_suggestions SET state = 'accepted', claim = NULL, decided_by = ?, decided_at = ?, updated_at = ? WHERE claim = ? AND state = 'accepting' RETURNING id").bind(actor.userId, now, now, claim),
    env.DB.prepare(
      `UPDATE grammar_suggestions SET state = 'superseded', decided_at = ?, decision_note = ?, updated_at = ? WHERE language = ? AND state = 'open' AND kind IN ('fix', 'retire') AND against < ? AND pattern IN (${touched.map(() => "?").join(", ")}) RETURNING id`,
    ).bind(now, `Revision ${built.grammar.revision} changed this pattern since: look at it as it is now, and suggest again if it still needs it.`, now, language, built.grammar.revision, ...touched),
  ]);
  out.accepted = (acceptedNow!.results as { id: string }[]).map((r) => r.id);
  out.superseded = (superseded!.results as { id: string }[]).map((r) => r.id);
  return { ...out, revision: built.grammar.revision, published: result.what };
}

/**
 * For deleting an account (accounts.ts deleteAccount): statements, for its batch, taking its suggestions (their
 * reports settled, their likes gone) and its likes of others' (each count recounted). What was accepted stays in the
 * grammar, which never named them.
 */
export function forgetGrammarStatements(env: Env, userId: string): D1PreparedStatement[] {
  const now = Date.now();
  const theirs = "SELECT id FROM grammar_suggestions WHERE author_id = ?";
  return [
    env.DB.prepare(`UPDATE reports SET state = 'dismissed', handled_at = ?, handled_note = 'Its account was deleted, and the suggestion with it.' WHERE target_kind = 'grammar' AND state IN ('open', 'escalated') AND target_id IN (${theirs})`).bind(now, userId),
    env.DB.prepare(`DELETE FROM likes WHERE target_kind = 'grammar' AND target_id IN (${theirs})`).bind(userId),
    env.DB.prepare("UPDATE grammar_suggestions SET likes = MAX(0, likes - 1) WHERE id IN (SELECT target_id FROM likes WHERE user_id = ? AND target_kind = 'grammar')").bind(userId),
    env.DB.prepare("DELETE FROM grammar_suggestions WHERE author_id = ?").bind(userId),
  ];
}

/**
 * A language's grammar as Explore shows it: the newest revision (its patterns with where each is from, retired ones
 * marked), and how many suggestions wait on each pattern (and for new ones).
 */
export async function grammarPage(env: Env, language: unknown) {
  if (!learnable(language)) throw new LibraryError("There's no such language here.");
  const grammar = await grammarOf(env, language);
  const counts = await env.DB.prepare("SELECT kind, pattern, COUNT(*) AS n FROM grammar_suggestions WHERE language = ? AND state IN ('open', 'accepting') AND shown = 'visible' GROUP BY kind, pattern")
    .bind(language)
    .all<{ kind: Kind; pattern: string; n: number }>();
  const waiting: Record<string, number> = {};
  let newOnes = 0;
  for (const row of counts.results) {
    if (row.kind === "new") newOnes += row.n;
    else waiting[row.pattern] = (waiting[row.pattern] ?? 0) + row.n;
  }
  return { language, revision: grammar.revision, patterns: grammar.patterns, waiting, newOnes };
}
