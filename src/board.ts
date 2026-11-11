// Requests in Explore (the board): someone asks for a pack (a language, a level, a topic, a few lines) or for a book
// woven into a language, with or without an AI, and others answer. A pack request is answered by a pack shared in
// Explore, linked by whoever made it (an admin may link any live pack, the library's own too). A request for a book on
// the shelf is answered by that language's layer going on it, worked out when it's read; a book not on the shelf yet
// waits for an admin first (pending), since only a book public domain in the US and the EU, or openly licensed, can go
// there. Requests are liked ("me too", one per account, in the app) and reported like corrections (moderation.ts, on
// their own `shown`). Text requests come with piece 5, when a shared text can answer one.
// (Requests for your own AI are another thing: practice.ts and src/mcp-requests.ts.)

import { LANGUAGES, languageName } from "../public/js/lang/index.js";
import { LEVELS, mayShare, sharingOpen } from "./community";
import type { Env } from "./env";
import { LibraryError } from "./library";
import { checkBan, enforce, limitGuard } from "./moderation";
import { logAdmin, rolesOf } from "./roles";
import { randomId } from "./util";
import { enqueue } from "./reminders";

export const REQUEST_KINDS = ["pack", "book"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const REQUEST_LIMITS = { title: 120, details: 1000, bookTitle: 200, bookAuthor: 200, bookSource: 300, note: 500, page: 50 };
/**
 * The largest real bodies the app's routes read (app.ts): a request with every field at its longest, an answer, a
 * close with its note, times 6, the most JSON stretches a character (\u0000), with room.
 */
export const REQUEST_BODY = {
  post: 6 * (REQUEST_LIMITS.title + REQUEST_LIMITS.details + REQUEST_LIMITS.bookTitle + REQUEST_LIMITS.bookAuthor + REQUEST_LIMITS.bookSource + 300) + 4 * 1024,
  answer: 4 * 1024,
  close: 6 * (REQUEST_LIMITS.note + 64) + 4 * 1024,
};
const text = (value: unknown) => (typeof value === "string" ? value : undefined);
/** On the board for everyone (open, done); any other state is its author's only (pending, declined, closed). */
const PUBLIC = ["open", "done"];
/** A write refused by requests_book_once (0014): another request for that book in that language is open or waiting. */
const sameBook = (error: unknown) => /UNIQUE/i.test(String(error)) && /requests/i.test(String(error));
const LOOK_AGAIN = "The request changed while this was being done (it was answered, closed or hidden meanwhile): look at it again (explore_request).";

/** A language someone can learn here (any in the registry but English, the one everything's explained in). */
const learnable = (code: unknown): code is string => typeof code === "string" && code !== "en" && Object.hasOwn(LANGUAGES, code);

interface ShelfBook {
  title: string;
  lang: string;
  layers: string[];
}
/** The shelf's books as the catalog lists them now (read as served: the catalog is the source of truth). */
async function shelf(env: Env): Promise<Map<string, ShelfBook>> {
  const object = await env.LIBRARY.get("catalogue.json");
  const catalogue = object ? ((await object.json().catch(() => null)) as { books?: { id?: unknown; title?: unknown; lang?: unknown; layers?: Record<string, unknown> }[] } | null) : null;
  const books = new Map<string, ShelfBook>();
  for (const b of catalogue?.books ?? []) {
    if (typeof b?.id === "string") books.set(b.id, { title: typeof b.title === "string" ? b.title : b.id, lang: typeof b.lang === "string" ? b.lang : "en", layers: Object.keys(b.layers ?? {}) });
  }
  return books;
}

async function topics(env: Env): Promise<Map<string, string>> {
  const rows = await env.DB.prepare("SELECT id, name FROM explore_topics ORDER BY rank").all<{ id: string; name: string }>();
  return new Map(rows.results.map((r) => [r.id, r.name]));
}

interface RequestRow {
  id: string;
  kind: RequestKind;
  language: string;
  from_lang: string;
  level: string | null;
  topic: string | null;
  book_id: string | null;
  book: string | null;
  title: string;
  details: string | null;
  author_id: string | null;
  author_name?: string | null;
  state: "pending" | "open" | "done" | "closed" | "declined";
  state_note: string | null;
  shown: string;
  shown_reason: string | null;
  likes: number;
  answers: number;
  seen_at: number | null;
  created_at: number;
  updated_at: number;
  liked?: number | null;
  fresh?: number | null;
}
// A request with its author's name, whether the viewer (bound first) likes it, and how many answers came after its
// author last looked (bound second: the viewer again, so it's counted only for the author).
const SELECT = `SELECT q.*, u.name AS author_name,
    (SELECT 1 FROM likes l WHERE l.target_kind = 'request' AND l.target_id = q.id AND l.user_id = ?) AS liked,
    CASE WHEN q.author_id = ? THEN (SELECT COUNT(*) FROM request_answers a WHERE a.request_id = q.id AND a.created_at > COALESCE(q.seen_at, 0)) END AS fresh
  FROM requests q LEFT JOIN users u ON u.id = q.author_id`;

/** A request as the app and an AI see it. */
function view(row: RequestRow, viewerId: string | null, books: Map<string, ShelfBook>, topicNames: Map<string, string>) {
  const mine = viewerId !== null && row.author_id === viewerId;
  const named = row.book ? (JSON.parse(row.book) as { title: string; author?: string; source?: string }) : null;
  const onShelf = row.book_id ? books.get(row.book_id) : undefined;
  return {
    id: row.id,
    kind: row.kind,
    language: row.language,
    from: row.from_lang,
    ...(row.level ? { level: row.level } : {}),
    ...(row.topic ? { topic: { id: row.topic, name: topicNames.get(row.topic) ?? row.topic } } : {}),
    ...(row.kind === "book"
      ? {
          book: onShelf
            ? { id: row.book_id, title: onShelf.title, onShelf: true, layer: onShelf.layers.includes(row.language) }
            : row.book_id
              ? { id: row.book_id, title: named?.title ?? row.book_id, onShelf: false }
              : { ...(named ?? { title: "" }), onShelf: false },
        }
      : {}),
    title: row.title,
    details: row.details,
    by: row.author_name ?? "a former member",
    mine,
    state: row.state,
    ...(row.state_note ? { stateNote: row.state_note } : {}),
    // Hidden or taken down after a report: only its author sees it, and why.
    ...(row.shown !== "visible" ? { shown: row.shown, ...(row.shown_reason ? { shownReason: row.shown_reason } : {}) } : {}),
    likes: row.likes,
    liked: Boolean(row.liked),
    answers: row.answers,
    ...(mine && row.fresh ? { newAnswers: row.fresh } : {}),
    at: new Date(row.created_at).toISOString(),
    updated: new Date(row.updated_at).toISOString(),
  };
}
export type RequestView = ReturnType<typeof view>;

/**
 * A book request whose book is on the shelf is done once the shelf has its language's layer: written when it's read
 * (only while still open, so a request closed meanwhile stays closed). Returns the rows as they are now.
 */
async function settleShelved(env: Env, rows: RequestRow[], books: Map<string, ShelfBook>) {
  const done = rows.filter((r) => r.kind === "book" && r.state === "open" && r.book_id && books.get(r.book_id)?.layers.includes(r.language));
  if (!done.length) return rows;
  const now = Date.now();
  await env.DB.batch(
    done.map((r) =>
      env.DB.prepare("UPDATE requests SET state = 'done', state_note = ?, decided_at = ?, updated_at = ? WHERE id = ? AND state = 'open'").bind(`Its ${languageName(r.language)} layer is on the shelf: read it in Read.`, now, now, r.id),
    ),
  );
  return rows.map((r) => (done.includes(r) ? { ...r, state: "done" as const, state_note: `Its ${languageName(r.language)} layer is on the shelf: read it in Read.`, updated_at: now } : r));
}

export interface BoardQuery {
  lang?: string;
  kind?: string;
  state?: string;
  sort?: string;
  mine?: boolean;
  limit?: number;
}

/**
 * The board: open requests (or done ones) in a language, the most "me too" first or the newest first; or, with mine,
 * every request of the viewer's, newest first, whatever became of it. A request waiting for an admin, declined,
 * closed, or hidden after a report is shown to its author only.
 */
export async function listRequests(env: Env, viewerId: string | null, query: BoardQuery = {}) {
  const limit = Math.min(Math.max(Math.floor(query.limit ?? 30), 1), REQUEST_LIMITS.page);
  if (query.mine) {
    if (!viewerId) throw new LibraryError("Sign in to see your requests.");
    const rows = await env.DB.prepare(`${SELECT} WHERE q.author_id = ? ORDER BY q.created_at DESC LIMIT ?`).bind(viewerId, viewerId, viewerId, limit).all<RequestRow>();
    const [books, topicNames] = await Promise.all([shelf(env), topics(env)]);
    return (await settleShelved(env, rows.results, books)).map((row) => view(row, viewerId, books, topicNames));
  }
  if (query.lang !== undefined && !learnable(query.lang)) throw new LibraryError(`lang is a language code someone can learn here (${Object.keys(LANGUAGES).filter((c) => c !== "en").join(", ")}).`);
  if (query.kind !== undefined && !(REQUEST_KINDS as readonly string[]).includes(query.kind)) throw new LibraryError(`kind is ${REQUEST_KINDS.join(" or ")}.`);
  const state = query.state ?? "open";
  if (state !== "open" && state !== "done") throw new LibraryError('state is "open" or "done" (yours, every state: mine).');
  const where = ["q.shown = 'visible'", "q.state = ?"];
  const binds: unknown[] = [viewerId, viewerId, state];
  if (query.lang) (where.push("q.language = ?"), binds.push(query.lang));
  if (query.kind) (where.push("q.kind = ?"), binds.push(query.kind));
  const order = query.sort === "new" ? "q.created_at DESC" : "q.likes DESC, q.created_at DESC";
  const rows = await env.DB.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?`).bind(...binds, limit).all<RequestRow>();
  const [books, topicNames] = await Promise.all([rows.results.some((r) => r.kind === "book") ? shelf(env) : Promise.resolve(new Map<string, ShelfBook>()), topics(env)]);
  // One that turns out answered by the shelf just now leaves the open board (it's done).
  return (await settleShelved(env, rows.results, books)).filter((row) => row.state === state).map((row) => view(row, viewerId, books, topicNames));
}

/**
 * One request with its answers (the live packs linked to it, oldest first; one hidden, removed or withdrawn since isn't
 * shown). markSeen: its author opened it in the app, so its answers are no longer new to them.
 */
export async function getRequest(env: Env, id: string, viewerId: string | null, { markSeen = false } = {}) {
  const row = await env.DB.prepare(`${SELECT} WHERE q.id = ?`).bind(viewerId, viewerId, id).first<RequestRow>();
  const theirs = row && viewerId !== null && row.author_id === viewerId;
  if (!row || ((row.shown !== "visible" || !PUBLIC.includes(row.state)) && !theirs)) throw new LibraryError("There's no such request in Explore.");
  const [books, topicNames, answers] = await Promise.all([
    row.kind === "book" ? shelf(env) : Promise.resolve(new Map<string, ShelfBook>()),
    topics(env),
    env.DB.prepare(
      `SELECT a.item_id, a.created_at, i.title, i.language, i.level, i.likes, i.follows, i.curated, u.name AS owner_name
       FROM request_answers a JOIN items i ON i.id = a.item_id LEFT JOIN users u ON u.id = i.owner_id
       WHERE a.request_id = ? AND i.state = 'live' ORDER BY a.created_at`,
    )
      .bind(id)
      .all<{ item_id: string; created_at: number; title: string; language: string; level: string | null; likes: number; follows: number; curated: number; owner_name: string | null }>(),
  ]);
  const [now] = await settleShelved(env, [row], books);
  if (markSeen && theirs) await env.DB.prepare("UPDATE requests SET seen_at = ? WHERE id = ? AND author_id = ?").bind(Date.now(), id, viewerId).run();
  return {
    ...view(now!, viewerId, books, topicNames),
    answeredBy: answers.results.map((a) => ({
      item: a.item_id,
      title: a.title,
      by: a.curated ? "Lexicommons" : (a.owner_name ?? "a former member"),
      language: a.language,
      ...(a.level ? { level: a.level } : {}),
      likes: a.likes,
      follows: a.follows,
      at: new Date(a.created_at).toISOString(),
      ...(theirs && a.created_at > (row.seen_at ?? 0) ? { new: true } : {}),
    })),
  };
}

export interface PostInput {
  kind?: unknown;
  language?: unknown;
  level?: unknown;
  topic?: unknown;
  title?: unknown;
  details?: unknown;
  book?: unknown;
}

/**
 * Posts a request, for anyone who may share (the sharing terms accepted in the app; a request's words are shared
 * under the same license). A pack request names a language, and a level and a topic if it likes. A book request names
 * a book on the shelf (its catalog id) and the language to weave it with, or a book not on the shelf yet ({ title,
 * author?, source? }), which waits for an admin (pending).
 */
export async function postRequest(env: Env, actor: { userId: string; via: string }, input: PostInput) {
  await mayShare(env, actor.userId);
  await checkBan(env, actor.userId, "community");
  const kind = (REQUEST_KINDS as readonly unknown[]).includes(input.kind) ? (input.kind as RequestKind) : null;
  if (!kind) throw new LibraryError('kind is "pack" (a pack in a language, at a level, on a topic) or "book" (a book woven into a language).');
  if (!learnable(input.language)) throw new LibraryError(`language is the language wanted, a code someone can learn here (${Object.keys(LANGUAGES).filter((c) => c !== "en").join(", ")}).`);
  const language = input.language;
  const level = input.level === undefined || input.level === null || input.level === "" ? null : text(input.level);
  if (level === undefined || (level !== null && !(LEVELS as readonly string[]).includes(level))) throw new LibraryError(`level is one of ${LEVELS.join(", ")}, or left out for any.`);
  const topic = input.topic === undefined || input.topic === null || input.topic === "" ? null : text(input.topic);
  const topicNames = await topics(env);
  if (topic === undefined || (topic !== null && !topicNames.has(topic))) throw new LibraryError(`topic is one of Explore's topics (${[...topicNames.keys()].join(", ")}), or left out.`);
  const title = text(input.title)?.trim() ?? "";
  if (title.length < 3 || title.length > REQUEST_LIMITS.title) throw new LibraryError(`title says what's wanted in a few words (3 to ${REQUEST_LIMITS.title} characters).`);
  if (input.details !== undefined && input.details !== null && typeof input.details !== "string") throw new LibraryError("details is text.");
  const details = text(input.details)?.trim().slice(0, REQUEST_LIMITS.details) || null;
  let bookId: string | null = null;
  let named: string | null = null;
  let state: "open" | "pending" = "open";
  if (kind === "book") {
    if (typeof input.book === "string") {
      const books = await shelf(env);
      const book = books.get(input.book);
      if (!book) throw new LibraryError(`There's no book "${input.book}" on the shelf. For a book that isn't there yet, give book as { title, author, source }.`);
      if (book.lang === language) throw new LibraryError(`${book.title} is in ${languageName(language)} already.`);
      if (book.layers.includes(language)) throw new LibraryError(`${book.title} is on the shelf in ${languageName(language)} already: read it in Read.`);
      const asked = await env.DB.prepare("SELECT id, shown FROM requests WHERE kind = 'book' AND book_id = ? AND language = ? AND state IN ('open', 'pending')").bind(input.book, language).first<{ id: string; shown: string }>();
      if (asked)
        throw new LibraryError(
          asked.shown === "visible"
            ? `Someone's asked for ${book.title} in ${languageName(language)} already: say "me too" on that request (${asked.id}) instead.`
            : `There's a request for ${book.title} in ${languageName(language)} already, being looked at after a report.`,
        );
      bookId = input.book;
    } else if (input.book && typeof input.book === "object" && !Array.isArray(input.book)) {
      const b = input.book as Record<string, unknown>;
      const bookTitle = text(b.title)?.trim() ?? "";
      if (bookTitle.length < 2 || bookTitle.length > REQUEST_LIMITS.bookTitle) throw new LibraryError(`book.title is the book's title (2 to ${REQUEST_LIMITS.bookTitle} characters).`);
      for (const field of ["author", "source"] as const) if (b[field] !== undefined && b[field] !== null && typeof b[field] !== "string") throw new LibraryError(`book.${field} is text.`);
      const author = text(b.author)?.trim().slice(0, REQUEST_LIMITS.bookAuthor) || undefined;
      const source = text(b.source)?.trim().slice(0, REQUEST_LIMITS.bookSource) || undefined;
      named = JSON.stringify({ title: bookTitle, ...(author ? { author } : {}), ...(source ? { source } : {}) });
      state = "pending";
    } else throw new LibraryError("A book request names its book: a book on the shelf (its id), or { title, author, source } for one that isn't there yet.");
  } else if (input.book !== undefined) throw new LibraryError("book is for a book request (kind: \"book\").");
  const guard = await limitGuard(env, actor.userId, "request");
  const id = randomId(10);
  const now = Date.now();
  let done;
  try {
    done = await env.DB.prepare(
      `INSERT INTO requests (id, kind, language, from_lang, level, topic, book_id, book, title, details, author_id, state, approved_at, created_at, updated_at)
       SELECT ?, ?, ?, 'en', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`,
    )
      .bind(id, kind, language, level, topic, bookId, named, title, details, actor.userId, state, state === "open" ? now : null, now, now, ...guard.binds)
      .run();
  } catch (error) {
    if (sameBook(error)) throw new LibraryError(`Someone asked for that book in ${languageName(language)} just now: say "me too" on their request instead.`);
    throw error;
  }
  if (!done.meta.changes) {
    await enforce(env, [guard]);
    throw guard.refusal();
  }
  return {
    posted: true as const,
    id,
    state,
    note:
      state === "pending"
        ? "A book not on the shelf yet waits for an admin first: only a book public domain in the US and the EU, or openly licensed, can go there. What they decide shows in Explore → Yours."
        : "It's on the board in Explore. Answers show in Explore → Yours.",
  };
}

/**
 * Answers a pack request with a pack shared in Explore: one of your own live packs in the request's language, or, for
 * an admin (with admin access, over MCP), any live pack, the library's own too. Not your own request (close it as done
 * instead). A request can have several answers.
 */
export async function answerRequest(env: Env, actor: { userId: string; via: string; adminAccess: boolean }, requestId: string, input: { item?: unknown }) {
  await mayShare(env, actor.userId);
  await checkBan(env, actor.userId, "community");
  const itemId = text(input.item);
  if (!itemId) throw new LibraryError("item is the pack that answers it: one you've shared in Explore (its id, from my_shared).");
  const q = await env.DB.prepare("SELECT id, kind, language, author_id, state, shown FROM requests WHERE id = ?").bind(requestId).first<{ id: string; kind: string; language: string; author_id: string | null; state: string; shown: string }>();
  if (!q || q.shown !== "visible" || !PUBLIC.includes(q.state)) throw new LibraryError("There's no such request in Explore.");
  if (q.kind !== "pack") throw new LibraryError("A book request is answered by its layer going on the shelf, not by a pack.");
  if (q.state !== "open") throw new LibraryError(`That request is ${q.state}.`);
  if (q.author_id === actor.userId) throw new LibraryError("It's your own request: when something answers it, close it as done (close_explore_request).");
  const item = await env.DB.prepare("SELECT id, owner_id, state, language, kind FROM items WHERE id = ?").bind(itemId).first<{ id: string; owner_id: string | null; state: string; language: string; kind: string }>();
  if (!item || item.kind !== "pack" || item.state !== "live") throw new LibraryError(`There's no live pack "${itemId}" in Explore.`);
  const admin = actor.adminAccess && (await rolesOf(env, actor.userId)).has("admin");
  if (item.owner_id !== actor.userId && !admin) throw new LibraryError("Answer with a pack you've shared yourself (share it first with share_pack).");
  if (item.language !== q.language) throw new LibraryError(`That pack is ${languageName(item.language)}; the request asks for ${languageName(q.language)}.`);
  const guard = await limitGuard(env, actor.userId, "answer");
  const now = Date.now();
  const already = await env.DB.prepare("SELECT 1 AS y FROM request_answers WHERE request_id = ? AND item_id = ?").bind(requestId, itemId).first();
  if (already) throw new LibraryError("That pack answers it already.");
  // Only while the request is still open and shown and the pack still live (a hidden or removed pack isn't); its count
  // in the same batch.
  const [added] = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO request_answers (request_id, item_id, by_id, created_at) SELECT ?, ?, ?, ?
       WHERE ${guard.sql} AND EXISTS (SELECT 1 FROM requests WHERE id = ? AND state = 'open' AND shown = 'visible') AND EXISTS (SELECT 1 FROM items WHERE id = ? AND state = 'live')`,
    ).bind(requestId, itemId, actor.userId, now, ...guard.binds, requestId, itemId),
    env.DB.prepare(
      "UPDATE requests SET answers = (SELECT COUNT(*) FROM request_answers WHERE request_id = ?1), updated_at = ?2 WHERE id = ?1 AND EXISTS (SELECT 1 FROM request_answers WHERE request_id = ?1 AND item_id = ?3 AND by_id = ?4 AND created_at = ?2)",
    ).bind(requestId, now, itemId, actor.userId),
  ]);
  if (!added!.meta.changes) {
    await enforce(env, [guard]);
    throw new LibraryError(LOOK_AGAIN);
  }
  if (item.owner_id !== actor.userId) await logAdmin(env, { actorId: actor.userId, via: actor.via, action: "request.answer", target: `request:${requestId}`, note: `with pack:${itemId}` });
  // Its author hears of it, if they have reminders and community notes on (src/reminders.ts).
  if (q.author_id) await enqueue(env, q.author_id, "community", { title: "Your request has an answer", body: "Someone answered it with a pack in Explore.", url: "/app/#explore/yours" }).catch(() => false);
  return { answered: true as const, request: requestId, item: itemId, note: "Its author sees your pack under their request, in Explore → Yours." };
}

/**
 * Its author marks a request done (something answered it) or closes it, or opens a done or closed one again; an admin
 * can too (with admin access over MCP), saying why. A request waiting for an admin can only be closed, and a declined
 * one stays declined.
 */
export async function closeRequest(env: Env, actor: { userId: string; via: string; adminAccess: boolean }, requestId: string, input: { state?: unknown; note?: unknown }) {
  const to = input.state === "done" || input.state === "closed" || input.state === "open" ? input.state : null;
  if (!to) throw new LibraryError('state is "done" (something answered it), "closed" (it isn\'t wanted now), or "open" (again).');
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") throw new LibraryError("note is text.");
  const note = text(input.note)?.trim().slice(0, REQUEST_LIMITS.note) || null;
  const q = await env.DB.prepare("SELECT id, kind, book_id, author_id, state, shown, approved_at FROM requests WHERE id = ?")
    .bind(requestId)
    .first<{ id: string; kind: string; book_id: string | null; author_id: string | null; state: string; shown: string; approved_at: number | null }>();
  const mine = q && q.author_id === actor.userId;
  const admin = !mine && actor.adminAccess && (await rolesOf(env, actor.userId)).has("admin");
  if (!q || (!mine && !admin) || (!mine && q.shown === "removed")) throw new LibraryError("No request of yours with that id.");
  if (admin && !note) throw new LibraryError("Say why (note): its author sees it.");
  // Its author opening it again puts it back on the public board: only someone who may post there now (6 Nov 2026, Codex C13: a
  // banned account reopened its closed requests). Marking it done or closed takes it off, and stays open to everyone.
  if (mine && to === "open") {
    await mayShare(env, actor.userId);
    await checkBan(env, actor.userId, "community");
  }
  const from = { done: ["open"], closed: ["open", "pending"], open: ["done", "closed"] }[to];
  if (!from.includes(q.state)) throw new LibraryError(q.state === to ? `It's ${to} already.` : q.state === "declined" ? "A declined request stays declined: post a new one." : q.state === "pending" ? "It's waiting for an admin: it can only be closed." : `A ${q.state} request can't be marked ${to}.`);
  // Opened again, a book not on the shelf that no admin opened (it may not go there yet) waits for an admin again; a
  // pack request, or a shelf book's, never needs one.
  const next = to === "open" && q.kind === "book" && q.book_id === null && q.approved_at === null ? "pending" : to;
  const now = Date.now();
  let done;
  try {
    done = await env.DB.prepare("UPDATE requests SET state = ?, state_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ? AND state = ?")
      .bind(next, to === "open" ? null : (note ?? null), actor.userId, now, now, requestId, q.state)
      .run();
  } catch (error) {
    if (sameBook(error)) throw new LibraryError("Someone asked for that book in that language again since this was closed: say \"me too\" on their request instead.");
    throw error;
  }
  if (!done.meta.changes) throw new LibraryError(LOOK_AGAIN);
  if (admin) await logAdmin(env, { actorId: actor.userId, via: actor.via, action: `request.${to}`, target: `request:${requestId}`, note: note ?? undefined });
  return { request: requestId, state: next, ...(next === "pending" ? { note: "It waits for an admin again: the book isn't cleared for the shelf yet." } : {}) };
}

/**
 * Likes ("me too") come from the app only, one per account, on an open request you didn't post, while the board is open to this account
 * (community.ts sharingOpen: the switch alone, so no terms are asked); taking one back always works.
 */
export async function likeRequest(env: Env, userId: string, id: string, on: boolean) {
  const row = await env.DB.prepare("SELECT author_id, state, shown FROM requests WHERE id = ?").bind(id).first<{ author_id: string | null; state: string; shown: string }>();
  if (!row || row.shown !== "visible" || !PUBLIC.includes(row.state)) throw new LibraryError("There's no such request in Explore.");
  const recount = env.DB.prepare("UPDATE requests SET likes = (SELECT COUNT(*) FROM likes WHERE target_kind = 'request' AND target_id = ?1) WHERE id = ?1").bind(id);
  if (on) {
    await sharingOpen(env, userId);
    await checkBan(env, userId, "community");
    if (row.author_id === userId) throw new LibraryError("That one's yours.");
    if (row.state !== "open") throw new LibraryError(`That request is ${row.state}.`);
    const guard = await limitGuard(env, userId, "like");
    const already = await env.DB.prepare("SELECT 1 AS y FROM likes WHERE user_id = ? AND target_kind = 'request' AND target_id = ?").bind(userId, id).first();
    const [added] = await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO likes (user_id, target_kind, target_id, created_at) SELECT ?, 'request', ?, ? WHERE ${guard.sql} AND EXISTS (SELECT 1 FROM requests WHERE id = ? AND state = 'open' AND shown = 'visible')`).bind(
        userId,
        id,
        Date.now(),
        ...guard.binds,
        id,
      ),
      recount,
    ]);
    if (!already && !added!.meta.changes) {
      await enforce(env, [guard]);
      throw new LibraryError("That request changed just now (closed, done or hidden): look at it again.");
    }
  } else await env.DB.batch([env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND target_kind = 'request' AND target_id = ?").bind(userId, id), recount]);
  const after = await env.DB.prepare("SELECT likes FROM requests WHERE id = ?").bind(id).first<{ likes: number }>();
  return { id, liked: on, likes: after?.likes ?? 0 };
}

/**
 * An admin decides a book request: open it (the book may go on the shelf: public domain in the US and the EU, or
 * openly licensed), naming the shelf's book once it's there (book: its catalog id; it can be named later, the same
 * way), or decline it, saying why. Its author sees either in Explore → Yours.
 */
export async function decideBookRequest(env: Env, actor: { userId: string; via: string }, requestId: string, input: { decision?: unknown; why?: unknown; book?: unknown }) {
  if (!(await rolesOf(env, actor.userId)).has("admin")) throw new LibraryError("Book requests are an admin's to decide.");
  const decision = input.decision === "open" || input.decision === "decline" ? input.decision : null;
  if (!decision) throw new LibraryError('decision is "open" (the book may go on the shelf) or "decline" (it may not: say why).');
  const why = text(input.why)?.trim().slice(0, REQUEST_LIMITS.note) ?? "";
  if (!why) throw new LibraryError("Say why (its author sees it).");
  const q = await env.DB.prepare("SELECT id, kind, language, state, shown, book_id FROM requests WHERE id = ?").bind(requestId).first<{ id: string; kind: string; language: string; state: string; shown: string; book_id: string | null }>();
  if (!q || q.kind !== "book") throw new LibraryError("No book request with that id.");
  if (q.shown !== "visible") throw new LibraryError("It's hidden after a report: settle that first (mod_get { request }).");
  let bookId: string | null = null;
  if (input.book !== undefined && input.book !== null) {
    if (typeof input.book !== "string") throw new LibraryError("book is the shelf's book, its catalog id.");
    const book = (await shelf(env)).get(input.book);
    if (!book) throw new LibraryError(`There's no book "${input.book}" on the shelf yet: open the request now, and name its book once it's published.`);
    if (book.lang === q.language) throw new LibraryError(`${book.title} is in ${languageName(q.language)} already.`);
    bookId = input.book;
  }
  const now = Date.now();
  const from = decision === "open" ? (bookId ? ["pending", "open"] : ["pending"]) : ["pending", "open"];
  if (!from.includes(q.state)) throw new LibraryError(decision === "open" && q.state === "open" ? "It's open already: give book to name the shelf's book." : `It's ${q.state}.`);
  if (q.book_id && bookId && q.book_id !== bookId) throw new LibraryError(`It names ${q.book_id} already.`);
  let done;
  try {
    done = await env.DB.prepare(
      `UPDATE requests SET state = ?, state_note = ?, decided_by = ?, decided_at = ?, updated_at = ?${decision === "open" ? ", approved_at = COALESCE(approved_at, ?)" : ""}${bookId ? ", book_id = ?" : ""}
       WHERE id = ? AND state = ? AND shown = 'visible' AND book_id IS ?`,
    )
      .bind(decision === "open" ? "open" : "declined", decision === "open" ? null : why, actor.userId, now, now, ...(decision === "open" ? [now] : []), ...(bookId ? [bookId] : []), requestId, q.state, q.book_id)
      .run();
  } catch (error) {
    if (!sameBook(error)) throw error;
    const other = await env.DB.prepare("SELECT id FROM requests WHERE kind = 'book' AND book_id = ? AND language = ? AND state IN ('open', 'pending') AND id != ?").bind(bookId, q.language, requestId).first<{ id: string }>();
    throw new LibraryError(`There's an open request for ${bookId} in ${languageName(q.language)} already${other ? ` (${other.id})` : ""}: decline this one as the same request.`);
  }
  if (!done.meta.changes) throw new LibraryError(LOOK_AGAIN);
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: `request.book.${decision}`, target: `request:${requestId}`, note: `${why}${bookId ? ` (book ${bookId})` : ""}` });
  return { request: requestId, state: decision === "open" ? "open" : "declined", ...(bookId ? { book: bookId } : {}) };
}

/**
 * For deleting an account (accounts.ts deleteAccount): statements for its batch, before its likes go. Its requests go,
 * with their likes and answers (the packs that answered them stay); an open report on one is settled, saying why;
 * its "me too"s come off others' requests' counts. Its answers on others' requests stay (by_id goes to NULL).
 */
export function forgetRequestsStatements(env: Env, userId: string): D1PreparedStatement[] {
  const now = Date.now();
  const theirs = "SELECT id FROM requests WHERE author_id = ?";
  return [
    env.DB.prepare(`UPDATE reports SET state = 'dismissed', handled_at = ?, handled_note = 'Its account was deleted, and the request with it.' WHERE target_kind = 'request' AND state IN ('open', 'escalated') AND target_id IN (${theirs})`).bind(now, userId),
    env.DB.prepare(`DELETE FROM likes WHERE target_kind = 'request' AND target_id IN (${theirs})`).bind(userId),
    env.DB.prepare("UPDATE requests SET likes = MAX(0, likes - 1) WHERE id IN (SELECT target_id FROM likes WHERE user_id = ? AND target_kind = 'request')").bind(userId),
    env.DB.prepare("DELETE FROM requests WHERE author_id = ?").bind(userId),
  ];
}
