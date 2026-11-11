// Books in Explore: a book someone made, or their AI wove, shared with its weave layers (one per language it's woven into, or a help
// layer), the way packs are (community.ts). Others find it in Explore and add it to their reading library (a follow: their devices load
// its current version), like it and report it; moderation, copyright notices, strikes and bans are moderation.ts's, on the same rules as a
// pack's (target_kind 'book').
//
// The rights gate, before anything is stored:
//   - the text: book-format.js rightsProblems (public domain in both the US and the EU, or CC0 / CC BY / CC BY-SA 4.0 with its credit
//     recorded), the same rule the open library's shelf keeps; and where it came from (its source's link), shown on its page;
//   - a layer is its sharer's own adaptation, under CC BY-SA 4.0 like a pack (the sharing terms say so), checked against the book
//     (validateWeave) and passing the weave audit, as a layer on the shelf must;
//   - text and weaves only for now: a book with pictures (pictures, pages or a cover) is refused, plainly.
// A book from a known open source (KNOWN_SOURCES: Project Gutenberg, Wikisource, StoryWeaver and the like) goes live at once; one from
// anywhere else waits for an admin to look at its source (state 'pending', decide_shared_book). Sharing is open to whoever may share
// packs (community.ts mayShare: COMMUNITY_SHARING, the terms, bans), within its own daily limits (moderation.ts: book, bookVersion).
//
// Storage: the library's bucket, under shared/books/<id>/<book version>/: book.json, and <kind>.<to>.<sha12>.json for each layer, named
// by its bytes and written only if absent. They're served through /api/community/books/:id/:version/:file (serveBookFile), only while the
// book is live and only files a version on record names: a takedown or a withdrawal stops them at once. The answer a device reads to add
// one (bookMeta) is the shape read/shelf.js fetchOpenBook already takes. A copy already on a device can't be recalled.
//
// A shared book's id is its public id: the book's own, or its own with a suffix when another shared book or the shelf has it. The files
// carry it (the book's id and each layer's book), so a device checks them as it checks a shelf book.

import { rightsProblems as rightsProblemsJs, validateBook as validateBookJs, validateWeave as validateWeaveJs, joinWords as joinWordsJs, LANGUAGES as LANGUAGES_JS, BOOK_ID } from "../public/js/read/book-format.js";
import { auditWeave as auditWeaveJs } from "../public/js/read/weave-audit.js";
import { checkMeta, mayShare, searchText, SHARING_LICENCE, SHARING_TERMS_VERSION, topicsById } from "./community";
import type { Env } from "./env";
import { grammarReady } from "./grammar";
import { LibraryError } from "./library";
import { checkBan, checkLimit, downBinds, downSqlOf, enforce, limitGuard, noticedWork, storageGuard } from "./moderation";
import { logAdmin, rolesOf } from "./roles";
import { FILE_CSP, randomId, sha256Hex } from "./util";

/** What a shared book may be: its file, each layer's file (UTF-8 bytes), and how many layers a version holds. */
export const BOOK_LIMITS = { bookBytes: 2 * 1024 * 1024, layerBytes: 1024 * 1024, layers: 12 } as const;
/**
 * Known open sources: a book whose text comes from one (its source's link on this site, or under this path) goes live at once. Any other
 * waits for an admin. The rights gate applies to every book either way; this is only who looks first.
 */
export const KNOWN_SOURCES: { name: string; host: string; path?: string }[] = [
  { name: "Project Gutenberg", host: "gutenberg.org" },
  { name: "Wikisource", host: "wikisource.org" },
  { name: "StoryWeaver", host: "storyweaver.org.in" },
  { name: "Standard Ebooks", host: "standardebooks.org" },
  { name: "Standard Ebooks", host: "github.com", path: "/standardebooks/" },
  { name: "African Storybook", host: "africanstorybook.org" },
  { name: "Global Storybooks", host: "globalstorybooks.net" },
];
const PAGE = 20;
const SAMPLE = 5;
const ESTABLISHED_MS = 7 * 24 * 60 * 60 * 1000;
const RIGHTS_REFUSAL =
  "This book can be shared only if it's in the public domain in both the US and the EU (rights.us and rights.eu), or under CC0, CC BY or CC BY-SA with its credit recorded (rights.spdx and rights.attribution). A book under a license that forbids changes (ND) or other uses (NC) can't be woven and shared.";
const SOURCE_REFUSAL = "Say where the text came from: the book's source.url, a link anyone can open to check it.";
const PICTURES_REFUSAL = "A book with pictures can't be shared in Explore yet: share its text alone (no pictures, pages or cover). Picture books come later.";

// book-format.js and weave-audit.js, typed as they're called here (they're plain JS).
type Rights = { us?: unknown; eu?: unknown; spdx?: unknown; attribution?: unknown };
interface Book {
  format: string;
  id: string;
  version: string;
  title: string;
  authors: { name?: string; role?: string }[];
  lang: string;
  words: string[];
  sentences: [number, number][];
  paras: unknown[];
  chapters: unknown[];
  rights?: Rights;
  source?: { url?: unknown; ref?: unknown; kind?: unknown };
  pictures?: unknown[];
  pages?: unknown;
  cover?: unknown;
}
interface Layer {
  kind: "weave" | "help";
  book: string;
  bookVersion: string;
  from: string;
  to: string;
  sentences: { text?: unknown }[];
  licence?: unknown;
  credit?: unknown;
}
const validateBook = validateBookJs as unknown as (book: unknown) => Promise<string[]>;
const validateWeave = validateWeaveJs as unknown as (weave: unknown, book: unknown, options: { keep: string[] }) => Promise<string[]>;
const rightsProblems = rightsProblemsJs as unknown as (book: unknown) => string[];
const auditWeave = auditWeaveJs as unknown as (book: unknown, weave: unknown, options: { keep: string[] }) => Promise<{ report: { ok: boolean; invariants: Record<string, number> } }>;
const joinWords = joinWordsJs as unknown as (words: string[], separator: string, lang: string | null) => string;
const LANGUAGES = LANGUAGES_JS as unknown as Record<string, { name?: string; separator?: string }>;
const BOOK_ID_RE = BOOK_ID as unknown as RegExp;
type Problem = { at: string; message: string };

const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;
const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const sentenceOf = (book: Pick<Book, "lang" | "words">, [s, e]: [number, number]) => joinWords(book.words.slice(s, e), LANGUAGES[book.lang]?.separator ?? " ", book.lang);

// ---------- where a book came from ----------

/** The link a book says its text came from: its source's url, or its ref when that's a link; null when it gives none. */
export function sourceUrlOf(book: { source?: { url?: unknown; ref?: unknown } } | null | undefined): string | null {
  for (const value of [book?.source?.url, book?.source?.ref]) {
    if (typeof value !== "string" || value.length > 500) continue;
    try {
      const url = new URL(value);
      if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && url.hostname.includes(".")) return url.href;
    } catch {
      // not a link
    }
  }
  return null;
}

/** The known open source a link is on (its name), or null. */
export function knownSource(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const found = KNOWN_SOURCES.find((s) => (host === s.host || host.endsWith(`.${s.host}`)) && (!s.path || url.pathname.startsWith(s.path)));
  return found?.name ?? null;
}

// ---------- checking what's shared ----------

/**
 * A book as it's shared: checked (the format, the rights, its source, no pictures, its size) and given its public id. Returns the book
 * with that id and its file's text, or the problems.
 */
async function checkBook(raw: unknown, publicId: string): Promise<{ book: Book | null; text: string; problems: Problem[] }> {
  const problems: Problem[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { book: null, text: "", problems: [{ at: "book", message: "The book must be a lexicommons-book file (JSON)." }] };
  const given = raw as Book;
  const formatProblems = await validateBook(given);
  for (const message of formatProblems.slice(0, 20)) problems.push({ at: "book", message });
  if (formatProblems.length > 20) problems.push({ at: "book", message: `… and ${formatProblems.length - 20} more.` });
  if (problems.length) return { book: null, text: "", problems };
  if ((Array.isArray(given.pictures) && given.pictures.length) || given.pages !== undefined || given.cover !== undefined) problems.push({ at: "book.pictures", message: PICTURES_REFUSAL });
  if (rightsProblems(given).length) problems.push({ at: "book.rights", message: RIGHTS_REFUSAL });
  if (!sourceUrlOf(given)) problems.push({ at: "book.source", message: SOURCE_REFUSAL });
  if (problems.length) return { book: null, text: "", problems };
  const book = { ...given, id: publicId };
  const text = JSON.stringify(book);
  if (byteLength(text) > BOOK_LIMITS.bookBytes) return { book: null, text: "", problems: [{ at: "book", message: `The book is ${(byteLength(text) / 1024 / 1024).toFixed(1)} MB; a shared book is at most ${BOOK_LIMITS.bookBytes / 1024 / 1024} MB.` }] };
  return { book, text, problems };
}

interface CheckedLayer {
  layer: Layer;
  text: string;
  sha256: string;
  bytes: number;
}

/**
 * The layers given with a book, each checked against it: the format (validateWeave), the weave audit (a known word never silent, an
 * unknown one never shown), its size, one per language. names: the ids a layer may call the book by (its own, and its id before
 * sharing); each is stored calling it by its public id.
 */
async function checkLayers(env: Env, raws: unknown[], book: Book, names: string[]): Promise<{ layers: CheckedLayer[]; problems: Problem[] }> {
  const problems: Problem[] = [];
  const layers: CheckedLayer[] = [];
  if (raws.length > BOOK_LIMITS.layers) return { layers, problems: [{ at: "layers", message: `At most ${BOOK_LIMITS.layers} layers at once.` }] };
  const seen = new Set<string>();
  for (const [n, raw] of raws.entries()) {
    const at = `layers[${n}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      problems.push({ at, message: "A layer must be a lexicommons-weave file (JSON)." });
      continue;
    }
    const given = raw as Layer;
    const layer = { ...given, book: typeof given.book === "string" && names.includes(given.book) ? book.id : given.book };
    if (typeof layer.to === "string" && seen.has(layer.to)) {
      problems.push({ at, message: `Two layers into ${layer.to}; give one.` });
      continue;
    }
    // A translation beside a book (a parallel layer) is the open library's alone: its promise that a person made it is the books
    // pipeline's to keep.
    if ((layer.kind as string) === "parallel") {
      problems.push({ at, message: "A parallel layer (a translation beside a book) comes only with the open library's own books, never with a shared one." });
      continue;
    }
    // Its woven grammar names patterns of the language being learned, as the catalog's grammar has them.
    await grammarReady(env, layer.kind === "help" ? book.lang : layer.to);
    const found = await validateWeave(layer, book, { keep: [] });
    if (found.length) {
      for (const message of found.slice(0, 10)) problems.push({ at, message });
      if (found.length > 10) problems.push({ at, message: `… and ${found.length - 10} more.` });
      continue;
    }
    const { report } = await auditWeave(book, layer, { keep: [] });
    if (!report.ok) {
      problems.push({ at, message: `The ${layer.to} layer fails the weave audit: a known word left in the book's language ${report.invariants["known-but-silent"]} times, an unknown one shown ${report.invariants["unknown-shown"]} times, one word shown twice in a row for two of the book's words ${report.invariants.doubled} times (all must be 0). weave-audit.mjs shows where.` });
      continue;
    }
    const text = JSON.stringify(layer);
    const bytes = byteLength(text);
    if (bytes > BOOK_LIMITS.layerBytes) {
      problems.push({ at, message: `The ${layer.to} layer is ${(bytes / 1024 / 1024).toFixed(1)} MB; a layer is at most ${BOOK_LIMITS.layerBytes / 1024 / 1024} MB.` });
      continue;
    }
    seen.add(layer.to);
    layers.push({ layer, text, sha256: await sha256Hex(text), bytes });
  }
  return { layers, problems };
}

// ---------- storage ----------

const bookKeyOf = (id: string, version: string) => `shared/books/${id}/${version}/book.json`;
const layerKeyOf = (id: string, version: string, layer: Layer, sha: string) => `shared/books/${id}/${version}/${layer.kind}.${layer.to}.${sha.slice(0, 12)}.json`;
/** A version's layers as its row keeps them. */
type LayerRecord = { kind: "weave" | "help"; key: string; sha256: string; bytes: number; sentences: number };
const recordOf = (id: string, version: string, checked: CheckedLayer): LayerRecord => ({ kind: checked.layer.kind, key: layerKeyOf(id, version, checked.layer, checked.sha256), sha256: checked.sha256, bytes: checked.bytes, sentences: checked.layer.sentences.length });

/** Puts a file in the library only if it isn't there; one already there must hold the same bytes. Files are written before their records, so one a refused write leaves is never served. */
async function storeFile(env: Env, key: string, text: string): Promise<void> {
  const sha = await sha256Hex(text);
  const put = await env.LIBRARY.put(key, text, { httpMetadata: { contentType: "application/json" }, sha256: sha, onlyIf: new Headers({ "If-None-Match": "*" }) });
  if (!put) {
    const existing = await env.LIBRARY.get(key);
    if (!existing || (await sha256Hex(await existing.text())) !== sha) throw new LibraryError(`${key} already holds other bytes; nothing was shared.`);
  }
}

/** The keys a book's versions so far name: a file one of them already names isn't counted again in the account's room. */
async function keysOnRecord(env: Env, id: string): Promise<Set<string>> {
  const rows = await env.DB.prepare("SELECT book_key, layers FROM shared_book_versions WHERE book_id = ?").bind(id).all<{ book_key: string; layers: string }>();
  return new Set(rows.results.flatMap((r) => [r.book_key, ...Object.values(JSON.parse(r.layers) as Record<string, LayerRecord>).map((l) => l.key)]));
}

// ---------- reading ----------

interface BookRow {
  id: string;
  owner_id: string | null;
  owner_name?: string | null;
  source_id: string;
  title: string;
  authors: string;
  about: string | null;
  language: string;
  layers: string;
  level: string | null;
  topics: string;
  rights: string;
  source: string;
  source_url: string;
  licence: string;
  head_seq: number;
  head_version: string;
  content_hash: string;
  state: string;
  state_reason: string | null;
  likes: number;
  follows: number;
  following?: number | null;
  liked?: number | null;
  created_at: number;
  updated_at: number;
}
interface VersionRow {
  seq: number;
  book_version: string;
  book_key: string;
  layers: string;
  summary: string;
  note: string | null;
  created_at: number;
}

const SELECT_BOOK = `SELECT b.*, u.name AS owner_name,
  (SELECT 1 FROM book_follows f WHERE f.book_id = b.id AND f.user_id = ?1) AS following,
  (SELECT 1 FROM likes l WHERE l.target_kind = 'book' AND l.target_id = b.id AND l.user_id = ?1) AS liked
  FROM shared_books b LEFT JOIN users u ON u.id = b.owner_id`;

/** How a book's rights read on its page: in the public domain, or its license with its credit. */
function rightsLine(rights: Rights & { licence?: unknown; attributionText?: unknown }): string {
  if (rights.us && rights.eu) return "Public domain in the US and the EU";
  const licence = typeof rights.licence === "string" ? rights.licence : String(rights.spdx ?? "");
  return typeof rights.attributionText === "string" && rights.attributionText ? `${licence}: ${rights.attributionText}` : licence;
}

/** A shared book as the app and an AI see it (kind "book", beside packs' "pack"). */
async function bookView(env: Env, row: BookRow, viewerId: string | null) {
  const topics = await topicsById(env);
  const rights = JSON.parse(row.rights) as Rights;
  return {
    id: row.id,
    kind: "book" as const,
    title: row.title,
    authors: JSON.parse(row.authors) as { name?: string; role?: string }[],
    about: row.about,
    by: row.owner_name ?? "a former member",
    mine: viewerId !== null && row.owner_id === viewerId,
    language: row.language,
    layers: JSON.parse(row.layers) as string[],
    level: row.level,
    topics: (JSON.parse(row.topics) as string[]).map((id) => ({ id, name: topics.get(id) ?? id })),
    rights: { line: rightsLine(rights), publicDomain: Boolean(rights.us && rights.eu), ...(typeof rights.spdx === "string" ? { spdx: rights.spdx } : {}) },
    source: { url: row.source_url, ...(knownSource(row.source_url) ? { name: knownSource(row.source_url) } : {}) },
    licence: row.licence,
    version: row.head_version,
    likes: row.likes,
    follows: row.follows,
    following: Boolean(row.following),
    liked: Boolean(row.liked),
    state: row.state,
    ...(row.state !== "live" && row.state_reason ? { stateReason: row.state_reason } : {}),
    sharedAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
export type BookView = Awaited<ReturnType<typeof bookView>>;

/** Where a device fetches a version's files (serveBookFile). */
const fileUrl = (key: string) => `/api/community/books/${key.replace(/^shared\/books\//, "")}`;

/**
 * What a device reads to add a shared book to its reading library: the shape read/shelf.js fetchOpenBook takes (the book's url, and its
 * layers by language), with what Read shows of it.
 */
function metaOf(row: BookRow, head: VersionRow, by: string) {
  const layers = JSON.parse(head.layers) as Record<string, LayerRecord>;
  const summary = JSON.parse(head.summary) as { words?: number; sentences?: number; chapters?: number };
  return {
    id: row.id,
    version: head.book_version,
    shared: true as const,
    title: row.title,
    authors: JSON.parse(row.authors),
    lang: row.language,
    rights: JSON.parse(row.rights),
    source: { url: row.source_url },
    words: summary.words,
    sentences: summary.sentences,
    chapters: summary.chapters,
    ...(row.level ? { level: row.level } : {}),
    book: fileUrl(head.book_key),
    layers: Object.fromEntries(Object.entries(layers).map(([to, layer]) => [to, { kind: layer.kind, url: fileUrl(layer.key), licence: row.licence, credit: by, sentences: layer.sentences }])),
    page: `/app/#explore/book/${encodeURIComponent(row.id)}`,
  };
}
export type SharedBookMeta = ReturnType<typeof metaOf>;

export interface BookQuery {
  /** The book's language. */
  language?: string;
  /** A language it has a layer into (a weave, or help). */
  layer?: string;
  /** The language someone is learning: a book in it, or one with a layer into it. */
  learning?: string;
  level?: string;
  topic?: string;
  q?: string;
  sort?: "popular" | "new";
  offset?: number;
  limit?: number;
}

/** Explore's books: live ones, filtered and sorted, as its packs are (community.ts listItems). */
export async function listBooks(env: Env, viewerId: string | null, query: BookQuery) {
  const where = ["b.state = 'live'"];
  const binds: unknown[] = [viewerId];
  const add = (clause: string, value: unknown) => {
    binds.push(value);
    where.push(clause.replaceAll("?", `?${binds.length}`));
  };
  if (query.language) add("b.language = ?", query.language);
  if (query.layer) add("EXISTS (SELECT 1 FROM json_each(b.layers) t WHERE t.value = ?)", query.layer);
  if (query.learning) add("(b.language = ? OR EXISTS (SELECT 1 FROM json_each(b.layers) t WHERE t.value = ?))", query.learning);
  if (query.level) add("b.level = ?", query.level);
  if (query.topic) add("EXISTS (SELECT 1 FROM json_each(b.topics) t WHERE t.value = ?)", query.topic);
  for (const term of searchText(query.q).split(" ").filter(Boolean).slice(0, 6)) add("b.search LIKE ? ESCAPE '\\'", `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const limit = Math.min(Math.max(query.limit ?? PAGE, 1), 50);
  const offset = Math.max(query.offset ?? 0, 0);
  const order = query.sort === "new" ? "b.created_at DESC" : "b.popular DESC, b.likes DESC, b.created_at DESC";
  const rows = await env.DB.prepare(`${SELECT_BOOK} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit + 1} OFFSET ${offset}`)
    .bind(...binds)
    .all<BookRow>();
  const more = rows.results.length > limit;
  return { books: await Promise.all(rows.results.slice(0, limit).map((row) => bookView(env, row, viewerId))), ...(more ? { next: offset + limit } : {}) };
}

const bookRow = (env: Env, id: string, viewerId: string | null) => env.DB.prepare(`${SELECT_BOOK} WHERE b.id = ?2`).bind(viewerId, id).first<BookRow>();
const headOf = (env: Env, id: string, seq: number) => env.DB.prepare("SELECT * FROM shared_book_versions WHERE book_id = ? AND seq = ?").bind(id, seq).first<VersionRow>();
/** Whether reports take a withdrawn book down (moderation.ts downOf): then it's its owner's business only, as a hidden one is. */
const isDown = async (env: Env, id: string) => Boolean((await env.DB.prepare(`SELECT ${downSqlOf("book", "?")} AS d`).bind(...downBinds("?", id)).first<{ d: number }>())?.d);

/**
 * One book's page: the book, a sample of its sentences (each with its layers' lines), its versions newest first, and while it's live the
 * files to add it (meta). Hidden, removed, waiting for an admin, declined, or withdrawn and taken down: its owner's business only.
 */
export async function getBook(env: Env, id: string, viewerId: string | null) {
  const row = await bookRow(env, id, viewerId);
  if (!row) return null;
  const down = row.state === "withdrawn" && (await isDown(env, id));
  const ownersOnly = ["hidden", "removed", "pending", "declined"].includes(row.state) || down;
  if (ownersOnly && row.owner_id !== viewerId) return null;
  const work = row.owner_id === viewerId && (down || row.state === "hidden" || row.state === "removed") ? await noticedWork(env, id, "book") : null;
  const versions = await env.DB.prepare("SELECT seq, book_version, book_key, layers, summary, note, created_at FROM shared_book_versions WHERE book_id = ? ORDER BY seq DESC LIMIT 20").bind(id).all<VersionRow>();
  const head = versions.results.find((v) => v.seq === row.head_seq);
  const summary = head ? (JSON.parse(head.summary) as { sample?: unknown[] }) : {};
  return {
    book: { ...(await bookView(env, row, viewerId)), ...(down ? { down: true } : {}), ...(work ? { work } : {}) },
    sample: summary.sample ?? [],
    versions: versions.results.map((v) => {
      const s = JSON.parse(v.summary) as { changes?: unknown };
      return { seq: v.seq, version: v.book_version, layers: Object.keys(JSON.parse(v.layers) as Record<string, unknown>), note: v.note, changes: s.changes ?? null, at: new Date(v.created_at).toISOString() };
    }),
    ...(row.state === "live" && head ? { meta: metaOf(row, head, row.owner_name ?? "a former member") } : {}),
  };
}

// ---------- adding one to a reading library (a follow), and likes ----------

/** Recounts a book's likes, follows and popularity (from accounts at least 7 days old). */
const recount = (env: Env, id: string) =>
  env.DB.prepare(
    `UPDATE shared_books SET
       likes = (SELECT COUNT(*) FROM likes WHERE target_kind = 'book' AND target_id = ?1),
       follows = (SELECT COUNT(*) FROM book_follows WHERE book_id = ?1),
       popular = (SELECT COUNT(*) FROM likes l JOIN users u ON u.id = l.user_id WHERE l.target_kind = 'book' AND l.target_id = ?1 AND u.created_at <= ?2)
               + (SELECT COUNT(*) FROM book_follows f JOIN users u ON u.id = f.user_id WHERE f.book_id = ?1 AND u.created_at <= ?2)
     WHERE id = ?1`,
  ).bind(id, Date.now() - ESTABLISHED_MS);

async function liveBook(env: Env, id: string) {
  const row = await bookRow(env, id, null);
  if (!row || row.state !== "live") throw new LibraryError(`There's no book "${id}" in Explore.`);
  return row;
}

/** Adds a book to the person's reading library: its meta, for the device to load at once. Its new versions and layers reach it. */
export async function followBook(env: Env, userId: string, id: string) {
  await checkBan(env, userId, "community");
  const already = await env.DB.prepare("SELECT 1 AS y FROM book_follows WHERE user_id = ? AND book_id = ?").bind(userId, id).first();
  if (!already) await checkLimit(env, userId, "bookFollow");
  const row = await liveBook(env, id);
  const guard = await limitGuard(env, userId, "bookFollow");
  const [added] = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO book_follows (user_id, book_id, created_at) SELECT ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM shared_books WHERE id = ? AND state = 'live') AND (EXISTS (SELECT 1 FROM book_follows WHERE user_id = ? AND book_id = ?) OR ${guard.sql})`,
    ).bind(userId, id, Date.now(), id, userId, id, ...guard.binds),
    recount(env, id),
  ]);
  if (!already && !added!.meta.changes) {
    await enforce(env, [guard]);
    throw new LibraryError(`"${id}" changed just now (it isn't in Explore): look again.`);
  }
  const head = await headOf(env, id, row.head_seq);
  return metaOf(row, head!, row.owner_name ?? "a former member");
}

export async function unfollowBook(env: Env, userId: string, id: string) {
  await env.DB.batch([env.DB.prepare("DELETE FROM book_follows WHERE user_id = ? AND book_id = ?").bind(userId, id), recount(env, id)]);
  return { id, following: false };
}

/**
 * The books an account added from Explore, as metas its devices load (the current version of each live one), and those that are down now
 * (hidden, taken down, or withdrawn: their files aren't served any more), so Read can say why in general words. A copy a device already
 * has stays on it.
 */
export async function followedBooks(env: Env, userId: string) {
  const rows = await env.DB.prepare(`${SELECT_BOOK} JOIN book_follows mine ON mine.book_id = b.id AND mine.user_id = ?1 ORDER BY mine.created_at`).bind(userId).all<BookRow>();
  const books: SharedBookMeta[] = [];
  const down: { id: string; title: string; state: "hidden" | "removed" | "withdrawn" }[] = [];
  for (const row of rows.results) {
    if (row.state === "live") {
      const head = await headOf(env, row.id, row.head_seq);
      if (head) books.push(metaOf(row, head, row.owner_name ?? "a former member"));
    } else down.push({ id: row.id, title: row.title, state: row.state === "removed" ? "removed" : row.state === "withdrawn" ? "withdrawn" : "hidden" });
  }
  return { books, down };
}

/** Likes come from the app only, as packs' do (no MCP tool likes anything). */
export async function likeBook(env: Env, userId: string, id: string, on: boolean) {
  if (on) {
    await checkBan(env, userId, "community");
    const already = await env.DB.prepare("SELECT 1 AS y FROM likes WHERE user_id = ? AND target_kind = 'book' AND target_id = ?").bind(userId, id).first();
    if (!already) await checkLimit(env, userId, "like");
    await liveBook(env, id);
    const guard = await limitGuard(env, userId, "like");
    const [added] = await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO likes (user_id, target_kind, target_id, created_at) SELECT ?, 'book', ?, ? WHERE ${guard.sql} AND EXISTS (SELECT 1 FROM shared_books WHERE id = ? AND state = 'live')`).bind(userId, id, Date.now(), ...guard.binds, id),
      recount(env, id),
    ]);
    if (!already && !added!.meta.changes) {
      await enforce(env, [guard]);
      throw new LibraryError(`"${id}" changed just now (it isn't in Explore): look again.`);
    }
  } else await env.DB.batch([env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND target_kind = 'book' AND target_id = ?").bind(userId, id), recount(env, id)]);
  const row = await env.DB.prepare("SELECT likes FROM shared_books WHERE id = ?").bind(id).first<{ likes: number }>();
  return { id, liked: on, likes: row?.likes ?? 0 };
}

// ---------- sharing ----------

/** The public id a book is shared under: its own, or its own with a suffix when another shared book or the shelf has that one. */
async function publicBookId(env: Env, sourceId: string): Promise<string> {
  const catalogue = await env.LIBRARY.get("catalogue.json");
  const shelf = new Set<string>(catalogue ? ((JSON.parse(await catalogue.text()) as { books?: { id?: string }[] }).books ?? []).map((b) => String(b.id)) : []);
  const reserved = async (id: string) => shelf.has(id) || Boolean(await env.DB.prepare("SELECT 1 AS y FROM shared_books WHERE id = ?").bind(id).first());
  if (BOOK_ID_RE.test(sourceId) && !(await reserved(sourceId))) return sourceId;
  for (let tries = 0; tries < 5; tries++) {
    const id = `${sourceId.replace(/[^a-z0-9-]/g, "").slice(0, 72) || "book"}-${randomHex(3)}`;
    if (!(await reserved(id))) return id;
  }
  throw new LibraryError("Couldn't find a free id for this book; try again.");
}

/**
 * The same text already in Explore (a shared book with the same content), one taken down by reports first; or on the open library's
 * shelf. A withdrawn one with nothing against it doesn't count.
 */
async function twinOf(env: Env, version: string, exceptId = ""): Promise<{ problem: string } | null> {
  const down = `(state = 'removed' OR (state = 'withdrawn' AND ${downSqlOf("book", "shared_books.id")}))`;
  const row = await env.DB.prepare(`SELECT id, title, ${down} AS down FROM shared_books WHERE content_hash = ? AND id != ? AND (state IN ('live', 'hidden', 'pending') OR ${down}) ORDER BY down DESC LIMIT 1`)
    .bind(...downBinds("shared_books.id"), version, exceptId, ...downBinds("shared_books.id"))
    .first<{ id: string; title: string; down: number }>();
  if (row?.down) return { problem: "This is the same text as a book taken down from Explore after a report; it can't be shared again." };
  if (row) return { problem: `This is the same text as "${row.title}" (${row.id}), already in Explore: add it to your library from there.` };
  const catalogue = await env.LIBRARY.get("catalogue.json");
  const onShelf = catalogue ? ((JSON.parse(await catalogue.text()) as { books?: { version?: string; title?: string }[] }).books ?? []).find((b) => b.version === version) : undefined;
  if (onShelf) return { problem: `This is the same text as "${onShelf.title}", on Lexicommons' shelf already: open it in Read. To ask for its layer in another language, post a request (post_explore_request).` };
  return null;
}

/** What a version's row says about it: its counts, the first sentences with each layer's lines, and what changed from the version before. */
function summaryOf(book: Book, layers: CheckedLayer[], kept: Record<string, Layer>, changes: unknown) {
  const all: [string, Layer][] = [...Object.entries(kept), ...layers.map((l) => [l.layer.to, l.layer] as [string, Layer])];
  const sample = book.sentences.slice(0, SAMPLE).map((span, x) => ({
    sentence: sentenceOf(book, span),
    ...(all.length ? { layers: Object.fromEntries(all.map(([to, layer]) => [to, typeof layer.sentences[x]?.text === "string" ? layer.sentences[x]!.text : ""])) } : {}),
  }));
  return { words: book.words.length, sentences: book.sentences.length, chapters: Array.isArray(book.chapters) ? book.chapters.length : 0, sample, changes };
}

export interface BookShareInput {
  book: unknown;
  layers?: unknown[];
  title?: string;
  about?: string;
  level?: string | null;
  topics?: string[];
  note?: string;
}

export type BookShareResult =
  | { shared: true; id: string; version: string; state: "live" | "pending"; layers: string[]; page: string; notes: string[] }
  | { shared: false; errors: Problem[] };

/** Shares a book (and the layers given with it) to Explore: checked, stored once, its layers under CC BY-SA 4.0. */
export async function shareBook(env: Env, actor: { userId: string; via: string }, input: BookShareInput): Promise<BookShareResult> {
  await mayShare(env, actor.userId);
  await checkLimit(env, actor.userId, "book");
  const sourceId = typeof (input.book as { id?: unknown } | null)?.id === "string" ? ((input.book as { id: string }).id as string) : "";
  const already = await env.DB.prepare("SELECT id FROM shared_books WHERE owner_id = ? AND source_id = ? AND state IN ('live', 'pending', 'hidden')").bind(actor.userId, sourceId).first<{ id: string }>();
  if (already) return { shared: false, errors: [{ at: "book", message: `You've shared this book already, as "${already.id}": add a layer or a new version with update_shared_book.` }] };
  const meta = await checkMeta(env, { title: input.title, level: input.level, topics: input.topics });
  const id = await publicBookId(env, sourceId);
  const checked = await checkBook(input.book, id);
  const errors: Problem[] = [...meta.problems, ...checked.problems];
  if (errors.length || !checked.book) return { shared: false, errors };
  const book = checked.book;
  const layers = await checkLayers(env, input.layers ?? [], book, [sourceId, id]);
  if (layers.problems.length) return { shared: false, errors: layers.problems };
  const twin = await twinOf(env, book.version);
  if (twin) return { shared: false, errors: [{ at: "book", message: twin.problem }] };
  const sourceUrl = sourceUrlOf(book)!;
  const known = knownSource(sourceUrl);
  const state = known ? "live" : "pending";
  const bookKey = bookKeyOf(id, book.version);
  const records = Object.fromEntries(layers.layers.map((l) => [l.layer.to, recordOf(id, book.version, l)]));
  const bytes = byteLength(checked.text) + layers.layers.reduce((sum, l) => sum + l.bytes, 0);
  // The day's limit and the account's room, checked now and again inside the write, so shares sent at once can't all pass them.
  const guard = await limitGuard(env, actor.userId, "book");
  const room = await storageGuard(env, actor.userId, bytes);
  await enforce(env, [guard, room]);
  await storeFile(env, bookKey, checked.text);
  for (const l of layers.layers) await storeFile(env, records[l.layer.to]!.key, l.text);
  const now = Date.now();
  const owner = await env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(actor.userId).first<{ name: string }>();
  const title = input.title?.trim() || book.title;
  const about = input.about?.trim() || null;
  const topics = meta.topics ?? [];
  const authors = book.authors.map((a) => a.name).filter((n): n is string => typeof n === "string");
  let added;
  try {
    [added] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO shared_books (id, owner_id, source_id, title, authors, about, language, layers, level, topics, rights, source, source_url, licence, head_seq, head_version, content_hash, state, state_reason, state_at, search, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql} AND ${room.sql}`,
      ).bind(
        id,
        actor.userId,
        sourceId,
        title,
        JSON.stringify(book.authors),
        about,
        book.lang,
        JSON.stringify(Object.keys(records)),
        meta.level ?? null,
        JSON.stringify(topics),
        JSON.stringify(book.rights),
        JSON.stringify(book.source),
        sourceUrl,
        SHARING_LICENCE,
        book.version,
        book.version,
        state,
        state === "pending" ? "Waiting for an admin to look at where its text came from." : null,
        now,
        searchText(title, ...authors, about, ...topics, owner?.name),
        now,
        now,
        ...guard.binds,
        ...room.binds,
      ),
      env.DB.prepare(
        "INSERT INTO shared_book_versions (book_id, seq, book_version, book_key, layers, bytes, summary, note, licence, terms_version, made_by, created_at) SELECT ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM shared_books WHERE id = ? AND created_at = ?)",
      ).bind(id, book.version, bookKey, JSON.stringify(records), bytes, JSON.stringify(summaryOf(book, layers.layers, {}, null)), input.note?.trim().slice(0, 500) || null, SHARING_LICENCE, SHARING_TERMS_VERSION, actor.via, now, id, now),
    ]);
  } catch (error) {
    // Two shares of the same book at once: one of them is in (shared_books_once).
    if (/UNIQUE/i.test(String(error))) return { shared: false, errors: [{ at: "book", message: "You've shared this book already (just now): add a layer or a new version with update_shared_book." }] };
    throw error;
  }
  // Over a limit: nothing was written to D1, so its files (already in R2) are never served.
  if (!added!.meta.changes) {
    await enforce(env, [guard, room]);
    throw guard.refusal();
  }
  const notes = [
    ...(id !== sourceId ? [`"${sourceId}" was taken, so it's shared as "${id}".`] : []),
    ...(state === "pending" ? [`Its text comes from ${new URL(sourceUrl).hostname}, which isn't one of the open libraries Explore knows (${[...new Set(KNOWN_SOURCES.map((s) => s.name))].join(", ")}), so it's waiting for an admin to look at its source. It shows in Explore once they have.`] : []),
  ];
  return { shared: true, id, version: book.version, state, layers: Object.keys(records), page: `${env.PUBLIC_ORIGIN}/app/#explore/book/${encodeURIComponent(id)}`, notes };
}

/**
 * A shared book the actor may change: their own, or anyone's for an admin acting with admin access (as community.ts ownedItem: a person
 * in the app, an MCP sign-in, or a personal token made with admin access).
 */
async function ownedBook(env: Env, actor: { userId: string; adminAccess?: boolean }, id: string) {
  const row = await bookRow(env, id, null);
  if (!row || row.state === "removed" || row.state === "declined") throw new LibraryError(`There's no book "${id}" of yours in Explore.`);
  if (row.owner_id !== actor.userId && !(actor.adminAccess === true && (await rolesOf(env, actor.userId)).has("admin"))) throw new LibraryError(`"${id}" isn't yours to change.`);
  return row;
}

export interface BookUpdateInput {
  /** A new version of the book: its layers are only those given with it (a layer belongs to one version of the text). */
  book?: unknown;
  /** Layers to add (or put in place of one into the same language). */
  layers?: unknown[];
  /** Languages whose layers come off. */
  dropLayers?: string[];
  title?: string;
  about?: string;
  level?: string | null;
  topics?: string[];
  note?: string;
}

/**
 * A new version of a shared book (its followers' devices get it): a new text, or the same text with layers added, put in place or taken
 * off. Without any of those, it changes only what Explore shows (title, about, level, topics), with no new version.
 */
export async function updateSharedBook(env: Env, actor: { userId: string; via: string; adminAccess?: boolean }, id: string, input: BookUpdateInput) {
  await mayShare(env, actor.userId);
  const row = await ownedBook(env, actor, id);
  if (row.state === "pending") throw new LibraryError(`"${id}" is waiting for an admin to look at its source; it can be changed once it's in Explore.`);
  if (row.state === "hidden") throw new LibraryError(`"${id}" is hidden after a report; it can't be changed until that's settled.`);
  if (row.state === "withdrawn") throw new LibraryError(`"${id}" is withdrawn from Explore, so it isn't updated any more: share it again as a new book.`);
  const meta = await checkMeta(env, { title: input.title, level: input.level, topics: input.topics });
  if (meta.problems.length) return { updated: false as const, errors: meta.problems };
  const now = Date.now();
  const owner = row.owner_id ? await env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(row.owner_id).first<{ name: string }>() : null;
  const topics = meta.topics ?? (JSON.parse(row.topics) as string[]);
  const level = meta.level === undefined ? row.level : meta.level;
  const about = input.about === undefined ? row.about : input.about.trim() || null;
  const drop = [...new Set(input.dropLayers ?? [])];
  if (input.book === undefined && !input.layers?.length && !drop.length) {
    if (input.title === undefined && input.about === undefined && meta.level === undefined && meta.topics === undefined) throw new LibraryError("Nothing to change: send a new version (book), layers to add or drop, or the title, about, level or topics.");
    const title = input.title?.trim() || row.title;
    const done = await env.DB.prepare("UPDATE shared_books SET title = ?, about = ?, level = ?, topics = ?, search = ?, updated_at = ? WHERE id = ? AND state = 'live'")
      .bind(title, about, level, JSON.stringify(topics), searchText(title, ...(JSON.parse(row.authors) as { name?: string }[]).map((a) => a.name), about, ...topics, owner?.name), now, id)
      .run();
    if (!done.meta.changes) throw new LibraryError(`"${id}" changed meanwhile (a report hid it): it isn't live.`);
    return { updated: true as const, id, version: row.head_version, newVersion: false };
  }
  await checkLimit(env, actor.userId, "bookVersion");
  const head = (await headOf(env, id, row.head_seq))!;
  const headLayers = JSON.parse(head.layers) as Record<string, LayerRecord>;
  // The book this version is of: a new text, or the one at head, read back from the library (also when the text sent is the same: the file
  // at its version is the one on record, whatever else the copy sent says).
  let book: Book | null = null;
  let bookText: string | null = null;
  if (input.book !== undefined) {
    const checked = await checkBook(input.book, id);
    if (checked.problems.length || !checked.book) return { updated: false as const, errors: checked.problems };
    if (checked.book.version !== row.head_version) {
      book = checked.book;
      bookText = checked.text;
      if (book.lang !== row.language) return { updated: false as const, errors: [{ at: "book", message: `A new version keeps the book's language (${row.language}): share a book in another language as a new book.` }] };
      // Its source stays the one it went into Explore with, or another known open source: a new version is never a way around the look an
      // admin gives a book from elsewhere.
      const url = sourceUrlOf(book)!;
      if (url !== row.source_url && !knownSource(url)) return { updated: false as const, errors: [{ at: "book.source", message: `A new version keeps where its text came from (${row.source_url}), or comes from a known open library: share a text from elsewhere as a new book.` }] };
    }
  }
  if (!book) {
    const object = await env.LIBRARY.get(head.book_key);
    if (!object) throw new LibraryError(`"${id}"'s text can't be read right now; try again in a moment.`);
    book = JSON.parse(await object.text()) as Book;
  }
  const newText = bookText !== null;
  const checked = await checkLayers(env, input.layers ?? [], book, [row.source_id, id]);
  if (checked.problems.length) return { updated: false as const, errors: checked.problems };
  // A new text holds only the layers given with it, so there's nothing to drop; on the same text, each one dropped must be there.
  const missing = newText ? [] : drop.filter((to) => !headLayers[to]);
  if (missing.length) return { updated: false as const, errors: [{ at: "drop_layers", message: `It has no ${missing.join(", ")} layer to drop (it has ${Object.keys(headLayers).join(", ") || "none"}).` }] };
  // The layers this version holds: a new text holds only those given with it; the same text keeps its own but those dropped or replaced.
  const kept: Record<string, LayerRecord> = newText ? {} : Object.fromEntries(Object.entries(headLayers).filter(([to]) => !drop.includes(to) && !checked.layers.some((l) => l.layer.to === to)));
  const records: Record<string, LayerRecord> = { ...kept, ...Object.fromEntries(checked.layers.map((l) => [l.layer.to, recordOf(id, book.version, l)])) };
  if (!newText && JSON.stringify(Object.entries(records).sort()) === JSON.stringify(Object.entries(headLayers).sort())) return { updated: false as const, errors: [{ at: "book", message: "This is the version already shared: nothing changed." }] };
  if (newText) {
    const twin = await twinOf(env, book.version, id);
    if (twin) return { updated: false as const, errors: [{ at: "book", message: twin.problem }] };
  }
  const bookKey = bookKeyOf(id, book.version);
  // What this version newly stores: a file an earlier version of this book names already counts once.
  const before = await keysOnRecord(env, id);
  const bytes = (bookText !== null && !before.has(bookKey) ? byteLength(bookText) : 0) + checked.layers.filter((l) => !before.has(records[l.layer.to]!.key)).reduce((sum, l) => sum + l.bytes, 0);
  const guard = await limitGuard(env, actor.userId, "bookVersion");
  const room = await storageGuard(env, actor.userId, bytes);
  await enforce(env, [guard, room]);
  if (bookText !== null) await storeFile(env, bookKey, bookText);
  for (const l of checked.layers) await storeFile(env, records[l.layer.to]!.key, l.text);
  // The layers kept, read back for the sample (their lines beside the book's).
  const keptLayers: Record<string, Layer> = {};
  for (const [to, record] of Object.entries(kept)) {
    const object = await env.LIBRARY.get(record.key);
    if (object) keptLayers[to] = JSON.parse(await object.text()) as Layer;
  }
  const changes = {
    ...(newText ? { text: { from: row.head_version, to: book.version } } : {}),
    layersAdded: checked.layers.filter((l) => !headLayers[l.layer.to] || newText).map((l) => l.layer.to),
    layersReplaced: newText ? [] : checked.layers.filter((l) => headLayers[l.layer.to]).map((l) => l.layer.to),
    layersDropped: newText ? Object.keys(headLayers).filter((to) => !records[to]) : drop,
  };
  const seq = row.head_seq + 1;
  const token = randomId(12);
  const made = { sql: "EXISTS (SELECT 1 FROM shared_book_versions WHERE book_id = ? AND seq = ? AND write_token = ?)", binds: [id, seq, token] };
  const title = input.title?.trim() || (newText ? book.title : row.title);
  const authors = book.authors.map((a) => a.name).filter((n): n is string => typeof n === "string");
  let added;
  try {
    [added] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO shared_book_versions (book_id, seq, book_version, book_key, layers, bytes, summary, note, licence, terms_version, made_by, write_token, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql} AND ${room.sql} AND EXISTS (SELECT 1 FROM shared_books WHERE id = ? AND state = 'live' AND head_seq = ?)`,
      ).bind(id, seq, book.version, bookKey, JSON.stringify(records), bytes, JSON.stringify(summaryOf(book, checked.layers, keptLayers, changes)), input.note?.trim().slice(0, 500) || null, row.licence, SHARING_TERMS_VERSION, actor.via, token, now, ...guard.binds, ...room.binds, id, row.head_seq),
      env.DB.prepare(
        `UPDATE shared_books SET title = ?, authors = ?, about = ?, layers = ?, level = ?, topics = ?, rights = ?, source = ?, source_url = ?, head_seq = ?, head_version = ?, content_hash = ?, search = ?, updated_at = ? WHERE id = ? AND ${made.sql}`,
      ).bind(
        title,
        JSON.stringify(book.authors),
        about,
        JSON.stringify(Object.keys(records)),
        level,
        JSON.stringify(topics),
        JSON.stringify(book.rights),
        JSON.stringify(book.source),
        sourceUrlOf(book) ?? row.source_url,
        seq,
        book.version,
        book.version,
        searchText(title, ...authors, about, ...topics, owner?.name),
        now,
        id,
        ...made.binds,
      ),
    ]);
  } catch (error) {
    if (/UNIQUE|PRIMARY/i.test(String(error))) throw new LibraryError(`"${id}" got another new version meanwhile: look again.`);
    throw error;
  }
  if (!added!.meta.changes) {
    await enforce(env, [guard, room]);
    const current = await env.DB.prepare("SELECT state, head_seq FROM shared_books WHERE id = ?").bind(id).first<{ state: string; head_seq: number }>();
    if (current?.state === "live" && current.head_seq !== row.head_seq) throw new LibraryError(`"${id}" got another new version meanwhile: look again.`);
    throw current?.state === "live" ? guard.refusal() : new LibraryError(`"${id}" changed meanwhile (a report hid it): it isn't live, so this version wasn't shared.`);
  }
  return {
    updated: true as const,
    id,
    version: book.version,
    seq,
    newVersion: true,
    layers: Object.keys(records),
    changes,
    ...(newText && changes.layersDropped.length ? { notes: [`The ${changes.layersDropped.join(", ")} ${changes.layersDropped.length === 1 ? "layer belongs" : "layers belong"} to the text before: weave this version to bring ${changes.layersDropped.length === 1 ? "it" : "them"} back.`] } : {}),
  };
}

/** Takes a shared book out of Explore (or one waiting for an admin). Whoever added it keeps the copy on their device; its files aren't served any more. */
export async function withdrawSharedBook(env: Env, actor: { userId: string; adminAccess?: boolean }, id: string) {
  const row = await ownedBook(env, actor, id);
  if (row.state !== "live" && row.state !== "pending") throw new LibraryError(`"${id}" isn't in Explore (it's ${row.state}).`);
  // Only from live (or pending) as it is now: a report that hid it meanwhile isn't undone by withdrawing.
  const done = await env.DB.prepare("UPDATE shared_books SET state = 'withdrawn', state_reason = 'Withdrawn by whoever shared it.', state_at = ? WHERE id = ? AND state IN ('live', 'pending')").bind(Date.now(), id).run();
  if (!done.meta.changes) throw new LibraryError(`"${id}" changed meanwhile (a report hid it): it isn't live.`);
  return { id, state: "withdrawn", note: "It's gone from Explore. Whoever added it keeps the copy on their device, with no more versions." };
}

/** What this account has shared as books, for Explore → Yours and an AI's update_shared_book: those down or waiting too, saying so. */
export async function mineBooks(env: Env, userId: string) {
  const rows = await env.DB.prepare(`${SELECT_BOOK} WHERE b.owner_id = ?1 ORDER BY b.updated_at DESC`).bind(userId).all<BookRow>();
  return Promise.all(rows.results.map(async (row) => ({ ...(await bookView(env, row, userId)), sourceId: row.source_id, ...(row.state === "withdrawn" && (await isDown(env, row.id)) ? { down: true } : {}) })));
}

/** An admin's look at a book from a source that isn't a known open one: open it (live in Explore) or decline it (its sharer sees why). */
export async function decideSharedBook(env: Env, actor: { userId: string; via: string }, id: string, input: { decision: "open" | "decline"; why: string }) {
  if (!(await rolesOf(env, actor.userId)).has("admin")) throw new LibraryError("Whether a book from elsewhere goes into Explore is an admin's to decide.");
  if (!input.why.trim()) throw new LibraryError("Say why (its sharer sees it).");
  const open = input.decision === "open";
  const done = await env.DB.prepare("UPDATE shared_books SET state = ?, state_reason = ?, state_at = ? WHERE id = ? AND state = 'pending'")
    .bind(open ? "live" : "declined", open ? null : `Declined: ${input.why.trim().slice(0, 300)}`, Date.now(), id)
    .run();
  if (!done.meta.changes) throw new LibraryError(`"${id}" isn't waiting for an admin.`);
  await logAdmin(env, { actorId: actor.userId, via: actor.via, action: `book.${input.decision}`, target: `book:${id}`, note: input.why });
  return { id, state: open ? "live" : "declined" };
}

// ---------- the files ----------

const FILE = /^(?:book|(?:weave|help)\.[a-z]{2,3}(?:-[A-Z][a-z]{3})?\.[0-9a-f]{12})\.json$/;

/**
 * A shared book's file (GET /api/community/books/:id/:version/:file): only while the book is live, and only a file a version on record
 * names, so a takedown or a withdrawal stops it at once, and a file a refused write left is never served. Revalidated on every fetch
 * (no-cache, by its ETag), for the same reason.
 */
export async function serveBookFile(env: Env, request: Request, id: string, version: string, file: string): Promise<Response> {
  const notFound = () => new Response(JSON.stringify({ error: "There's no such book in Explore." }), { status: 404, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  if (!BOOK_ID_RE.test(id) || !/^[0-9a-f]{16}$/.test(version) || !FILE.test(file)) return notFound();
  const key = `shared/books/${id}/${version}/${file}`;
  const recorded = await env.DB.prepare(
    `SELECT 1 AS y FROM shared_books b WHERE b.id = ? AND b.state = 'live' AND EXISTS (SELECT 1 FROM shared_book_versions v WHERE v.book_id = b.id AND (v.book_key = ? OR EXISTS (SELECT 1 FROM json_each(v.layers) l WHERE json_extract(l.value, '$.key') = ?)))`,
  )
    .bind(id, key, key)
    .first();
  if (!recorded) return notFound();
  const object = await env.LIBRARY.get(key, { onlyIf: request.headers });
  if (!object) return notFound();
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    ETag: object.httpEtag,
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    // People's own JSON: like every stored file, nothing in one may run, even opened directly.
    "Content-Security-Policy": FILE_CSP,
  });
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}

// ---------- an account going ----------

/**
 * For deleting an account (accounts.ts deleteAccount): statements for its batch. The books it shared stay under their licenses, shown as
 * "a former member", and its name leaves their search text; the books it added go (book_follows, and its likes by the batch's own delete),
 * and recountBookStatements(booksTouchedBy) after the batch puts the counts right.
 */
export async function forgetBookStatements(env: Env, userId: string): Promise<D1PreparedStatement[]> {
  const owned = await env.DB.prepare("SELECT id, title, authors, about, topics FROM shared_books WHERE owner_id = ?").bind(userId).all<{ id: string; title: string; authors: string; about: string | null; topics: string }>();
  return [
    ...owned.results.map((row) =>
      env.DB.prepare("UPDATE shared_books SET owner_id = NULL, search = ? WHERE id = ?").bind(searchText(row.title, ...(JSON.parse(row.authors) as { name?: string }[]).map((a) => a.name), row.about, ...(JSON.parse(row.topics) as string[])), row.id),
    ),
    env.DB.prepare("DELETE FROM book_follows WHERE user_id = ?").bind(userId),
  ];
}

/** The books an account added or liked, to recount once it's gone. */
export async function booksTouchedBy(env: Env, userId: string): Promise<string[]> {
  const rows = await env.DB.prepare("SELECT book_id AS id FROM book_follows WHERE user_id = ?1 UNION SELECT target_id AS id FROM likes WHERE user_id = ?1 AND target_kind = 'book'").bind(userId).all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

export const recountBookStatements = (env: Env, ids: string[]) => ids.map((id) => recount(env, id));
