// The community section (Explore): what people share, and the library's default packs indexed beside it. Listing and
// search, an item's page, follows (an account's devices load each followed pack's current version: study/packs.js
// syncLibraryPacks), likes, Explore's curated sections and topics, and sharing a pack: checked with the app's own
// pack check (study/pack-format.js checkPack), named by its content, stored once in the open library's bucket, under
// CC BY-SA 4.0. The app's routes (app.ts), the REST API and the MCP tools (mcp-community.ts) all call these.
//
// A shared pack's file sits where the library's own do (packs/<id>/<version>/pack.json, the same layout and loader);
// its id is its public id, unique across everyone, so a pack shared under an id someone else has gets a suffix.
// COMMUNITY_SHARING is the one switch for everything a learner puts in front of other people in Explore (sharing a pack or a book,
// requests on the board and their "me too", corrections and flags, grammar suggestions): open to everyone only when it's
// "everyone"; until then, to admins alone (sharingOpenFor). Sharing also needs the sharing terms accepted, in the app (mayShare).

import { plainItems, sentencesOf } from "../public/js/study/pack-items.js";
import { coverChoices, upgradePack } from "../public/js/study/pack-format.js";
import { frequencyRanks as frequencyRanksJs } from "../public/js/read/book-format.js";
import {
  checkPack as checkPackJs,
  compareVersions as compareVersionsJs,
  defaultInstalled as defaultInstalledJs,
  itemSentence as itemSentenceJs,
  PACK_LIMITS,
  packKey,
  packRefs as packRefsJs,
  packUrl,
  packText,
  packVersion as packVersionJs,
} from "../public/js/study/pack-format.js";
import { BUILT_IN } from "../public/js/packs/index.js";
import { changedPieces as changedPiecesJs, checkFix as checkFixJs, parsePath, pieceOf } from "../public/js/study/pack-corrections.js";
import type { Env } from "./env";
import { LibraryError } from "./library";
import { checkBan, checkLimit, downBinds, downSql, enforce, limitGuard, noticedWork, storageGuard } from "./moderation";
import { rolesOf, type Role } from "./roles";
import { randomId, sha256Hex } from "./util";
import { grammarReady } from "./grammar";

export const SHARING_TERMS_VERSION = 1;
export const SHARING_LICENCE = "CC BY-SA 4.0";
export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];
const TOPICS_PER_ITEM = 3;
const PAGE = 20;
const ESTABLISHED_MS = 7 * 24 * 60 * 60 * 1000;
const PACK_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
const SAMPLE = 5;

// The pack check, typed as it's called here (it's plain JS).
export interface Pack {
  id: string;
  name: string;
  about?: string;
  language: string;
  from: string;
  topics: Record<string, string>;
  words: Record<string, string>;
  readings?: Record<string, string>;
  chunks: Record<string, unknown>;
  patterns: Record<string, unknown>;
  items: { id: string; text?: string; words?: [string, string?][]; punct?: string; literal?: [string, boolean?][] | null; means?: string; concepts?: string[]; gap?: { index?: number } }[];
  copiedFrom?: PackRef;
}
type Problem = { at: string; message: string };
export interface PackRef {
  id: string;
  version: string;
}
type Changes = { added: string[]; removed: string[]; changed: string[]; kept: string[] };
// study/pack-format.js, typed as it's called here (it's plain JS).
const checkPack = checkPackJs as unknown as (value: unknown, options: { installed: unknown[] }) => { pack: Pack | null; errors: Problem[]; warnings: Problem[] };
const itemSentence = itemSentenceJs as unknown as (item: Pack["items"][number], language?: string) => string;
const packVersion = packVersionJs as unknown as (pack: Pack) => Promise<string>;
const compareVersions = compareVersionsJs as unknown as (previous: Pack, next: Pack) => Changes;
const packRefs = packRefsJs as unknown as (catalogue: unknown, language: string) => (PackRef & { url: string; audio?: string; optIn?: true; suggest?: true })[];
/** Lexicommons' opt-in packs (Dutch's strong language): someone adds one by choice, so Explore never suggests it. */
// The opt-in packs Explore never suggests (strong language): all but those published to be suggested (suggest: true, a pack
// about one topic). They're found by search and listed last.
const optInPacks = (catalogue: { packs?: Record<string, unknown> }) =>
  new Set(Object.keys(catalogue.packs ?? {}).flatMap((language) => packRefs(catalogue, language).filter((ref) => ref.optIn && !ref.suggest).map((ref) => ref.id)));
/** Adds that make "most added" mean something, from accounts past their first week too: with fewer, it says nothing about a pack. */
const MOST_ADDED_AT = 10;

/**
 * The library's own packs' recorded audio, as the catalog lists it now: id → { version, audio url }. A follow of one of
 * them carries its audio, as the catalog's own refs do (study/packs.js loads it with the pack).
 */
async function libraryAudio(env: Env): Promise<Map<string, { version: string; audio: string }>> {
  const catalogue = await catalogueNow(env);
  const refs = Object.keys(catalogue.packs ?? {}).flatMap((language) => packRefs(catalogue, language));
  return new Map(refs.filter((ref) => ref.audio).map((ref) => [ref.id, { version: ref.version, audio: ref.audio! }]));
}
const audioFor = (audio: Map<string, { version: string; audio: string }>, id: string, version: string) => {
  const found = audio.get(id);
  return found && found.version === version ? { audio: found.audio } : {};
};
const defaultInstalled = defaultInstalledJs as unknown as (catalogue: unknown, language: string, fetchPack: (ref: PackRef) => Promise<unknown>, exceptId?: string) => Promise<unknown[]>;

/** Sharing's refusal that the person (not their AI) must resolve in the app: the terms, a ban, sharing not open yet. */
export class SharingRefused extends LibraryError {}

/** Lowercase, accents gone, one space: what search compares. */
export const searchText = (...parts: (string | undefined | null)[]) =>
  parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/(?=\p{M})\p{Script=Inherited}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\u200C\u200D]+/gu, " ")
    .trim();

/** What a pack's file takes in R2 (UTF-8), which quotas and versions count, never its UTF-16 length (6 Nov 2026, Codex C12). */
const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;
const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

// ---------- reading ----------

interface ItemRow {
  id: string;
  kind: string;
  owner_id: string | null;
  owner_name: string | null;
  curated: number;
  source_id: string | null;
  title: string;
  about: string | null;
  language: string;
  from_lang: string | null;
  level: string | null;
  topics: string;
  badges: string;
  licence: string;
  copied_from: string | null;
  head_version: string;
  state: string;
  state_reason: string | null;
  likes: number;
  follows: number;
  /** The viewer's follow: how they take it (published, or with community corrections), or null. */
  following?: string | null;
  liked?: number;
  /** A shared pack's cover, one of the drawings for its topics (migration 0022); null when none was picked. */
  cover?: string | null;
  created_at: number;
  updated_at: number;
}

let topicNames: Map<string, string> | null = null;
export async function topicsById(env: Env): Promise<Map<string, string>> {
  if (topicNames) return topicNames;
  const rows = await env.DB.prepare("SELECT id, name FROM explore_topics ORDER BY rank").all<{ id: string; name: string }>();
  return (topicNames = new Map(rows.results.map((r) => [r.id, r.name])));
}

/** An item as the app and an AI see it. */
async function itemView(env: Env, row: ItemRow, viewerId: string | null) {
  const topics = await topicsById(env);
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    about: row.about,
    by: row.curated ? "Lexicommons" : (row.owner_name ?? "a former member"),
    curated: row.curated === 1,
    mine: viewerId !== null && row.owner_id === viewerId,
    language: row.language,
    from: row.from_lang,
    level: row.level,
    topics: (JSON.parse(row.topics) as string[]).map((id) => ({ id, name: topics.get(id) ?? id })),
    badges: JSON.parse(row.badges) as Record<string, number>,
    licence: row.licence,
    copiedFrom: row.copied_from ? (JSON.parse(row.copied_from) as PackRef) : null,
    version: row.head_version,
    likes: row.likes,
    follows: row.follows,
    following: Boolean(row.following),
    // How the viewer follows it: the pack as published, or with community corrections (study/packs.js plays them).
    ...(row.following ? { followCorrections: row.following === "community" ? ("community" as const) : ("published" as const) } : {}),
    liked: Boolean(row.liked),
    state: row.state,
    ...(row.state !== "live" && row.state_reason ? { stateReason: row.state_reason } : {}),
    ...(row.cover ? { cover: row.cover } : {}),
    sharedAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
export type ItemView = Awaited<ReturnType<typeof itemView>>;

const SELECT_ITEM = `SELECT i.*, u.name AS owner_name,
  (SELECT f.corrections FROM follows f WHERE f.item_id = i.id AND f.user_id = ?1) AS following,
  (SELECT 1 FROM likes l WHERE l.target_kind = 'item' AND l.target_id = i.id AND l.user_id = ?1) AS liked
  FROM items i LEFT JOIN users u ON u.id = i.owner_id`;

export interface ListQuery {
  kind?: "pack";
  language?: string;
  level?: string;
  topic?: string;
  q?: string;
  sort?: "popular" | "new";
  offset?: number;
  limit?: number;
}

/** Explore's lists and search: live items, filtered and sorted. */
/**
 * What's about a topic: anything a person shared with it, and Lexicommons' own about it alone. The language's general packs (its lessons, its
 * word bands) are tagged with every topic they touch, so they'd fill every topic and its count; they stay on Explore's home.
 */
const ABOUT_ONE_TOPIC = "(i.curated = 0 OR json_array_length(i.topics) = 1)";

export async function listItems(env: Env, viewerId: string | null, query: ListQuery, known?: Set<string>) {
  const where = ["i.kind = ?2", "i.state = 'live'"];
  const binds: unknown[] = [viewerId, query.kind ?? "pack"];
  const add = (clause: string, value: unknown) => {
    binds.push(value);
    where.push(clause.replace("?", `?${binds.length}`));
  };
  if (query.language) add("i.language = ?", query.language);
  if (query.level) add("i.level = ?", query.level);
  if (query.topic) add(`EXISTS (SELECT 1 FROM json_each(i.topics) t WHERE t.value = ?) AND ${ABOUT_ONE_TOPIC}`, query.topic);
  for (const term of searchText(query.q).split(" ").filter(Boolean).slice(0, 6)) add("i.search LIKE ? ESCAPE '\\'", `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const limit = Math.min(Math.max(query.limit ?? PAGE, 1), 50);
  const offset = Math.max(query.offset ?? 0, 0);
  // The pack list keeps an opt-in pack, after the others unless someone searched for it (the home never shows one).
  const last = query.sort !== "new" && !query.q ? [...(known ?? optInPacks(await catalogueNow(env)))] : [];
  const lastFirst = last.length
    ? `CASE WHEN i.id IN (${last.map((id) => {
        binds.push(id);
        return `?${binds.length}`;
      }).join(", ")}) THEN 1 ELSE 0 END, `
    : "";
  // Nobody's added anything yet, so ties are the norm: a language's lessons first, then Lexicommons' own in the order they were published (word bands from the commonest), then the newest of what people share.
  // Within a topic, what's about that topic alone comes before what covers many (a food pack before a word band that also has food in it).
  const onTopic = query.topic ? "json_array_length(i.topics) ASC, " : "";
  const order = query.sort === "new" ? "i.created_at DESC" : `${lastFirst}${onTopic}i.curated DESC, i.popular DESC, i.likes DESC, (i.curated = 1 AND i.id LIKE 'path-%') DESC, CASE WHEN i.curated = 1 THEN i.created_at END ASC, i.created_at DESC`;
  const rows = await env.DB.prepare(`${SELECT_ITEM} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit + 1} OFFSET ${offset}`)
    .bind(...binds)
    .all<ItemRow>();
  const more = rows.results.length > limit;
  return { items: await Promise.all(rows.results.slice(0, limit).map((row) => itemView(env, row, viewerId))), ...(more ? { next: offset + limit } : {}) };
}

/** How many packs Explore lists in each language (what browsing a language finds), the most first: its language picker. */
export async function languageCounts(env: Env): Promise<{ lang: string; packs: number }[]> {
  const rows = await env.DB.prepare("SELECT language AS lang, COUNT(*) AS packs FROM items WHERE kind = 'pack' AND state = 'live' GROUP BY language ORDER BY packs DESC, lang").all<{ lang: string; packs: number }>();
  return rows.results;
}

async function itemRow(env: Env, id: string, viewerId: string | null): Promise<ItemRow | null> {
  return env.DB.prepare(`${SELECT_ITEM} WHERE i.id = ?2`).bind(viewerId, id).first<ItemRow>();
}

/**
 * A library pack's recorded voices, for its page: each voice's name, and the credit and license it's published under
 * (recordings are not the pack's text, and their rights are their own). [] when its version has no audio.
 */
async function recordingsOf(env: Env, id: string, version: string): Promise<{ name: string; credit: string; license: string }[]> {
  const found = (await libraryAudio(env)).get(id);
  if (!found || found.version !== version) return [];
  const object = await env.LIBRARY.get(found.audio.replace(/^\/library\//, ""));
  if (!object) return [];
  try {
    const manifest = JSON.parse(await object.text()) as { voices?: Record<string, { name?: string; credit?: string; license?: string }> };
    return Object.values(manifest.voices ?? {}).map((v) => ({ name: String(v.name ?? ""), credit: String(v.credit ?? ""), license: String(v.license ?? "") }));
  } catch {
    return [];
  }
}

/** One item's page: the item, its versions (newest first, with what changed) and a sample of its sentences. */
export async function getItem(env: Env, id: string, viewerId: string | null) {
  const row = await itemRow(env, id, viewerId);
  const recordings = row?.curated ? await recordingsOf(env, row.id, row.head_version) : [];
  // A hidden or removed item is its owner's (and a moderator's) business only; so is a withdrawn one reports took down.
  const down = row?.state === "withdrawn" && Boolean((await env.DB.prepare(`SELECT ${downSql("?")} AS d`).bind(...downBinds("?", id)).first<{ d: number }>())?.d);
  if (!row || ((row.state === "hidden" || row.state === "removed" || down) && row.owner_id !== viewerId)) return null;
  // Its owner is told the work a copyright notice names, so they know what they're answering; never who sent it.
  const work = row.owner_id === viewerId && (down || row.state === "hidden" || row.state === "removed") ? await noticedWork(env, id) : null;
  const versions = await env.DB.prepare("SELECT version, seq, summary, note, licence, created_at FROM item_versions WHERE item_id = ? ORDER BY seq DESC LIMIT 20")
    .bind(id)
    .all<{ version: string; seq: number; summary: string; note: string | null; licence: string; created_at: number }>();
  const head = versions.results.find((v) => v.version === row.head_version);
  const summary = head ? (JSON.parse(head.summary) as { sample?: unknown[]; samples?: number }) : {};
  let sample = summary.sample ?? [];
  // A version summarized before samples carried readings: its sample made again from the pack, once, and kept.
  if (head && summary.samples !== SAMPLE_FORM) {
    const pack = (await fetchLibraryPack(env)({ id, version: row.head_version }).catch(() => null)) as Pack | null;
    if (pack?.items) {
      sample = sampleOf(pack);
      await env.DB.prepare("UPDATE item_versions SET summary = json_set(summary, '$.sample', json(?), '$.samples', ?) WHERE item_id = ? AND version = ?").bind(JSON.stringify(sample), SAMPLE_FORM, id, row.head_version).run();
    }
  }
  return {
    item: { ...(await itemView(env, row, viewerId)), ...(down ? { down: true } : {}), ...(recordings.length ? { recordings } : {}), ...(work ? { work } : {}) },
    sample,
    versions: versions.results.map((v) => {
      const s = JSON.parse(v.summary) as { changes?: unknown };
      return { version: v.version, seq: v.seq, note: v.note, licence: v.licence, changes: s.changes ?? null, at: new Date(v.created_at).toISOString() };
    }),
  };
}

/** Explore's home for a language: its curated sections, then popular and new. */
/**
 * The pack to feature when no curated section has one, and why it's that one: the most added once enough people have added
 * it; else, for someone signed in, the first pack of Lexicommons' own published to be suggested that they haven't added (the defaults are on
 * their devices already); else the language's lessons, or with none the first of Lexicommons' own (the catalog's order, a starter first);
 * else a pack someone shared. Never an opt-in pack that isn't published to be suggested.
 */
async function featureOf(env: Env, viewerId: string | null, language: string, catalogue: { packs?: Record<string, unknown> }, optIn: Set<string>, top: Awaited<ReturnType<typeof itemView>> | undefined) {
  const added = await env.DB.prepare(`${SELECT_ITEM} WHERE i.kind = 'pack' AND i.state = 'live' AND i.language = ?2 AND i.follows >= ?3 AND i.popular >= ?3 ORDER BY i.follows DESC, i.popular DESC LIMIT ${1 + optIn.size}`)
    .bind(viewerId, language, MOST_ADDED_AT)
    .all<ItemRow>();
  const most = added.results.find((row) => !optIn.has(row.id));
  if (most) return { item: await itemView(env, most, viewerId), why: "most-added" as const };
  // Lexicommons' own, counting the opt-in packs published to be suggested (a pack about one topic): Explore may put one there. The
  // language's default packs (its lessons, its word bands) are on every device already, so for someone signed in the suggested pack they
  // haven't added whose words are the commonest comes first (its index's meanRank, lowest first: meanRankOf; one with none after, in the
  // catalog's order); then the lessons, as before.
  const own = packRefs(catalogue, language).filter((ref) => !ref.optIn || ref.suggest);
  if (viewerId) {
    const added = new Set((await env.DB.prepare("SELECT item_id FROM follows WHERE user_id = ?").bind(viewerId).all<{ item_id: string }>()).results.map((r) => r.item_id));
    const candidates = own.filter((one) => one.optIn && one.suggest && !added.has(one.id));
    if (candidates.length) {
      const rows = await env.DB.prepare(`SELECT id, badges FROM items WHERE state = 'live' AND id IN (${candidates.map(() => "?").join(", ")})`)
        .bind(...candidates.map((ref) => ref.id))
        .all<{ id: string; badges: string }>();
      const rankOf = (badges: string) => {
        const rank = (JSON.parse(badges) as { meanRank?: unknown }).meanRank;
        return typeof rank === "number" ? rank : Infinity;
      };
      const live = new Map(rows.results.map((row) => [row.id, rankOf(row.badges)]));
      const best = candidates.map((ref, n) => ({ id: ref.id, n, rank: live.get(ref.id) })).filter((c): c is { id: string; n: number; rank: number } => c.rank !== undefined).sort((a, b) => a.rank - b.rank || a.n - b.n)[0];
      const row = best ? await itemRow(env, best.id, viewerId) : null;
      if (row?.state === "live") return { item: await itemView(env, row, viewerId), why: "start" as const };
    }
  }
  const starter = own.find((ref) => ref.id === `path-${language}`) ?? own.find((ref) => !ref.optIn) ?? own[0];
  const row = starter ? await itemRow(env, starter.id, viewerId) : null;
  if (row?.state === "live") return { item: await itemView(env, row, viewerId), why: "start" as const };
  return top ? { item: top, why: "shared" as const } : null;
}

export async function exploreHome(env: Env, viewerId: string | null, language?: string) {
  const catalogue = await catalogueNow(env);
  const optIn = optInPacks(catalogue);
  const sections = await env.DB.prepare("SELECT id, title, items FROM explore_sections ORDER BY rank").all<{ id: string; title: string; items: string }>();
  const shown = [];
  for (const section of sections.results) {
    const ids = (JSON.parse(section.items) as string[]).filter((id) => !optIn.has(id));
    if (!ids.length) continue;
    const rows = await env.DB.prepare(`${SELECT_ITEM} WHERE i.id IN (${ids.map((_, n) => `?${n + 2}`).join(", ")}) AND i.state = 'live'${language ? ` AND i.language = ?${ids.length + 2}` : ""}`)
      .bind(viewerId, ...ids, ...(language ? [language] : []))
      .all<ItemRow>();
    const byId = new Map(rows.results.map((r) => [r.id, r]));
    const items = await Promise.all(ids.flatMap((id) => (byId.has(id) ? [itemView(env, byId.get(id)!, viewerId)] : [])));
    if (items.length) shown.push({ id: section.id, title: section.title, items });
  }
  const shelf = async (sort: "popular" | "new") => (await listItems(env, viewerId, { language, sort, limit: 10 + optIn.size }, optIn)).items.filter((item) => !optIn.has(item.id)).slice(0, 10);
  const [popular, recent] = await Promise.all([shelf("popular"), shelf("new")]);
  const feature = language ? await featureOf(env, viewerId, language, catalogue, optIn, popular[0]) : null;
  return { sections: shown, popular, new: recent, feature, topics: language ? await topicsIn(env, language) : [] };
}

/** The topics with packs in a language, in the topics' own order, each with how many live packs it has there: Explore's home browses by them. */
export async function topicsIn(env: Env, language: string) {
  const [names, counts] = await Promise.all([
    topicsById(env),
    env.DB.prepare(`SELECT t.value AS id, COUNT(*) AS packs FROM items i, json_each(i.topics) t WHERE i.kind = 'pack' AND i.state = 'live' AND i.language = ?1 AND ${ABOUT_ONE_TOPIC} GROUP BY t.value`).bind(language).all<{ id: string; packs: number }>(),
  ]);
  const byId = new Map(counts.results.map((row) => [row.id, row.packs]));
  return [...names.entries()].filter(([id]) => (byId.get(id) ?? 0) > 0).map(([id, name]) => ({ id, name, packs: byId.get(id) ?? 0 }));
}

export async function listTopics(env: Env) {
  return [...(await topicsById(env)).entries()].map(([id, name]) => ({ id, name }));
}

// ---------- follows and likes ----------

/** Recounts an item's likes, follows and popularity (from accounts at least 7 days old). */
const recount = (env: Env, itemId: string) =>
  env.DB.prepare(
    `UPDATE items SET
       likes = (SELECT COUNT(*) FROM likes WHERE target_kind = 'item' AND target_id = ?1),
       follows = (SELECT COUNT(*) FROM follows WHERE item_id = ?1),
       popular = (SELECT COUNT(*) FROM likes l JOIN users u ON u.id = l.user_id WHERE l.target_kind = 'item' AND l.target_id = ?1 AND u.created_at <= ?2)
               + (SELECT COUNT(*) FROM follows f JOIN users u ON u.id = f.user_id WHERE f.item_id = ?1 AND u.created_at <= ?2)
     WHERE id = ?1`,
  ).bind(itemId, Date.now() - ESTABLISHED_MS);

async function liveItem(env: Env, id: string): Promise<{ id: string; head_version: string; state: string; curated: number }> {
  const row = await env.DB.prepare("SELECT id, head_version, state, curated FROM items WHERE id = ?").bind(id).first<{ id: string; head_version: string; state: string; curated: number }>();
  if (!row || row.state !== "live") throw new LibraryError(`There's no pack "${id}" in Explore to follow.`);
  return row;
}

/** Follows an item: its ref ({ id, version, url }), for the device to load at once (study/packs.js followPack). */
export async function follow(env: Env, userId: string, id: string, corrections: "published" | "community" = "published"): Promise<PackRef & { url: string; audio?: string; corrections: string }> {
  await checkBan(env, userId, "community");
  const already = await env.DB.prepare("SELECT 1 AS y FROM follows WHERE user_id = ? AND item_id = ?").bind(userId, id).first();
  if (!already) await checkLimit(env, userId, "follow");
  const item = await liveItem(env, id);
  // Community corrections are for community packs: Lexicommons' own are studied as published on every device (they're
  // the ground other packs are checked on), and their fixes come in through new versions.
  const how = item.curated ? "published" : corrections;
  const guard = await limitGuard(env, userId, "follow");
  const [added] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO follows (user_id, item_id, corrections, created_at) SELECT ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM follows WHERE user_id = ? AND item_id = ?) OR ${guard.sql}
       ON CONFLICT(user_id, item_id) DO UPDATE SET corrections = excluded.corrections`,
    ).bind(userId, id, how, Date.now(), userId, id, ...guard.binds),
    recount(env, id),
  ]);
  if (!added!.meta.changes) throw guard.refusal();
  const audio = item.curated ? audioFor(await libraryAudio(env), id, item.head_version) : {};
  return { id, version: item.head_version, url: packUrl(id, item.head_version) as string, ...audio, corrections: how };
}

export async function unfollow(env: Env, userId: string, id: string): Promise<{ id: string; following: false }> {
  await env.DB.batch([env.DB.prepare("DELETE FROM follows WHERE user_id = ? AND item_id = ?").bind(userId, id), recount(env, id)]);
  return { id, following: false };
}

/**
 * What an account follows, as refs its devices load (study/packs.js syncLibraryPacks): live items, and withdrawn ones
 * (whoever has one keeps it, with no more updates). A hidden or removed one isn't listed, so devices drop it.
 */
export async function following(env: Env, userId: string): Promise<(PackRef & { url: string; audio?: string; corrections: string })[]> {
  const rows = await env.DB.prepare(
    `SELECT f.item_id AS id, i.head_version AS version, f.corrections, i.curated FROM follows f JOIN items i ON i.id = f.item_id
     WHERE f.user_id = ? AND (i.state = 'live' OR (i.state = 'withdrawn' AND NOT ${downSql("i.id")})) ORDER BY f.created_at`,
  )
    .bind(userId, ...downBinds("i.id"))
    .all<PackRef & { corrections: string; curated: number }>();
  // The library's own packs carry their recorded audio, as the catalog lists it (shared packs have none).
  const audio = rows.results.some((r) => r.curated) ? await libraryAudio(env) : new Map();
  return rows.results.map((r) => ({ id: r.id, version: r.version, url: packUrl(r.id, r.version) as string, ...(r.curated ? audioFor(audio, r.id, r.version) : {}), corrections: r.corrections }));
}

/**
 * What an account follows that's hidden or taken down now: its devices dropped it (following leaves it out), and
 * Explore's home says why, in general words (the moderator's note is for the owner). It comes back if it's restored.
 */
export async function followingDown(env: Env, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT i.id, i.title, i.state FROM follows f JOIN items i ON i.id = f.item_id
     WHERE f.user_id = ? AND (i.state IN ('hidden', 'removed') OR (i.state = 'withdrawn' AND ${downSql("i.id")})) ORDER BY i.state_at DESC`,
  )
    .bind(userId, ...downBinds("i.id"))
    .all<{ id: string; title: string; state: string }>();
  return rows.results.map((r) => ({ id: r.id, title: r.title, state: r.state === "removed" ? "removed" : "hidden" }));
}

/** Likes come from the app only: no MCP tool likes anything, so nobody's AI can farm them. */
export async function like(env: Env, userId: string, id: string, on: boolean) {
  if (on) {
    await checkBan(env, userId, "community");
    const already = await env.DB.prepare("SELECT 1 AS y FROM likes WHERE user_id = ? AND target_kind = 'item' AND target_id = ?").bind(userId, id).first();
    if (!already) await checkLimit(env, userId, "like");
    await liveItem(env, id);
    const guard = await limitGuard(env, userId, "like");
    const [added] = await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO likes (user_id, target_kind, target_id, created_at) SELECT ?, 'item', ?, ? WHERE ${guard.sql}`).bind(userId, id, Date.now(), ...guard.binds),
      recount(env, id),
    ]);
    if (!already && !added!.meta.changes) throw guard.refusal();
  } else await env.DB.batch([env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND target_kind = 'item' AND target_id = ?").bind(userId, id), recount(env, id)]);
  const row = await env.DB.prepare("SELECT likes FROM items WHERE id = ?").bind(id).first<{ likes: number }>();
  return { id, liked: on, likes: row?.likes ?? 0 };
}

// ---------- sharing ----------

export async function termsOf(env: Env, userId: string) {
  const row = await env.DB.prepare("SELECT terms_version, accepted_at FROM sharing_terms WHERE user_id = ?").bind(userId).first<{ terms_version: number; accepted_at: number }>();
  return { version: SHARING_TERMS_VERSION, licence: SHARING_LICENCE, accepted: row?.terms_version === SHARING_TERMS_VERSION, acceptedAt: row ? new Date(row.accepted_at).toISOString() : null };
}

/** The person accepts the sharing terms, in the app (never through MCP). */
export async function acceptTerms(env: Env, userId: string, version: number) {
  if (version !== SHARING_TERMS_VERSION) throw new LibraryError("These aren't the current sharing terms; reload and read them again.");
  await env.DB.prepare("INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET terms_version = excluded.terms_version, accepted_at = excluded.accepted_at")
    .bind(userId, version, Date.now())
    .run();
  return termsOf(env, userId);
}

export interface ShareMeta {
  title?: string;
  about?: string;
  level?: string | null;
  topics?: string[];
  /** One of the drawings for its topics (coverChoices), or null for none. Only when it's shared. */
  cover?: string | null;
}

/**
 * Whether the switch opens Explore to this account (COMMUNITY_SHARING): "everyone", or an admin until then. The one rule: what the server
 * refuses (sharingOpen, mayShare), the tools MCP lists (mcp-community.ts sharingListed) and /api/me's mayShare, which the app's screens read.
 */
export const sharingOpenFor = (env: Env, roles: Set<Role>) => env.COMMUNITY_SHARING === "everyone" || roles.has("admin");

/** The switch alone (no terms, no ban): throws SharingRefused, in words, while it's closed to this account. */
export async function sharingOpen(env: Env, userId: string) {
  if (!sharingOpenFor(env, await rolesOf(env, userId))) {
    throw new SharingRefused("Sharing in Explore opens to everyone soon; for now only the library's admins can share, ask or suggest there.");
  }
}

/** Whether this account may share in Explore now (and so post requests, suggest corrections or patterns): throws the reason it can't. */
export async function mayShare(env: Env, userId: string) {
  await sharingOpen(env, userId);
  await checkBan(env, userId, "share");
  if (!(await termsOf(env, userId)).accepted) {
    throw new SharingRefused(`Accept the sharing terms first, once, in the app (everything shared is under ${SHARING_LICENCE}): ${env.PUBLIC_ORIGIN}/app/#explore/terms. They can only be accepted there.`);
  }
}

/** The metadata a share or an update sets, checked (a shared book's too: community-books.ts). */
export async function checkMeta(env: Env, meta: ShareMeta): Promise<{ problems: Problem[]; level: string | null | undefined; topics: string[] | undefined; cover: string | null }> {
  const problems: Problem[] = [];
  const level = meta.level === undefined ? undefined : meta.level === null || meta.level === "" ? null : meta.level;
  if (level && !(LEVELS as readonly string[]).includes(level)) problems.push({ at: "level", message: `level must be one of ${LEVELS.join(", ")} (or none).` });
  let topics: string[] | undefined;
  if (meta.topics !== undefined) {
    const known = await topicsById(env);
    topics = [...new Set(meta.topics)];
    if (topics.length > TOPICS_PER_ITEM) problems.push({ at: "topics", message: `At most ${TOPICS_PER_ITEM} topics.` });
    const unknown = topics.filter((t) => !known.has(t));
    if (unknown.length) problems.push({ at: "topics", message: `${unknown.join(", ")} ${unknown.length === 1 ? "isn't a topic" : "aren't topics"}; Explore's topics are ${[...known.keys()].join(", ")}.` });
  }
  if (meta.title !== undefined && !meta.title.trim()) problems.push({ at: "title", message: "title can't be empty." });
  // A cover is one of the drawings its topics offer: never any picture, and never one of Lexicommons' own packs' (pack-format.js).
  const cover = typeof meta.cover === "string" && meta.cover ? meta.cover : null;
  if (cover && !coverChoices(topics ?? []).includes(cover)) problems.push({ at: "cover", message: `cover must be one of the drawings for its topics${topics?.length ? `: ${coverChoices(topics).join(", ")}` : " (it has none: pick its topics first)"}.` });
  return { problems, level, topics, cover };
}

export const fetchLibraryPack = (env: Env) => async (ref: PackRef) => {
  const object = await env.LIBRARY.get(`packs/${ref.id}/${ref.version}/pack.json`);
  return object ? upgradePack(JSON.parse(await object.text())) : null;
};

async function catalogueNow(env: Env) {
  const object = await env.LIBRARY.get("catalogue.json");
  return object ? JSON.parse(await object.text()) : { packs: {} };
}

/** A checked pack's content, without its id and names: two shares of the same packs collide here. */
const contentHash = (pack: Pack) => sha256Hex(JSON.stringify({ language: pack.language, from: pack.from, topics: pack.topics, words: pack.words, readings: pack.readings, chunks: pack.chunks, patterns: pack.patterns, items: pack.items }));

/** Which form a version's sample is in: 2 carries each word with its reading, for a language that shows readings. */
const SAMPLE_FORM = 2;
/** A version's sample: as the study cards draw them (the sentence, its literal line with moved words marked, its natural line). */
const sampleOf = (pack: Pack) => [...sentenceSample(pack), ...cardSample(pack)].slice(0, SAMPLE);
type PlainCard = { id: string; text: string; means?: string };
const cardsOf = (pack: Pack) => plainItems(pack) as PlainCard[];
// A plain card as a sample: its two sides (card: nothing on it takes a fix, which are for sentences).
const cardSample = (pack: Pack) => cardsOf(pack).slice(0, SAMPLE).map((card) => ({ id: card.id, card: true, sentence: card.text, ...(card.means ? { natural: card.means } : {}) }));
const sentenceSample = (pack: Pack) =>
  (sentencesOf(pack) as Pack["items"]).slice(0, SAMPLE).map((item) => ({
    id: item.id,
    sentence: itemSentence(item, pack.language),
    ...(item.literal ? { literal: item.literal.map(([text, moved]) => ({ text, moved: Boolean(moved) })), punct: item.punct ?? "" } : {}),
    ...(item.means ? { natural: item.means } : {}),
    // A sentence with readings (Japanese and Chinese readings, Arabic, Hebrew, Persian and Urdu vowel marks): its words
    // as [text, lemma, reading], so a preview shows them by Study's rule (explore.js). Without any, the sentence alone.
    ...((item.words as [string, string?, string?][]).some((word) => word[2])
      ? { words: (item.words as [string, string?, string?][]).map(([text, lemma, reading]) => [text, lemma ?? null, reading ?? null]), punct: item.punct ?? "" }
      : {}),
  }));
/** What an item's page and list rows show of a version: its counts and a sample. */
function summarize(pack: Pack) {
  return {
    counts: { sentences: sentencesOf(pack).length, ...(cardsOf(pack).length ? { cards: cardsOf(pack).length } : {}), words: Object.keys(pack.words).length, patterns: patternsUsed(pack), phrases: Object.keys(pack.chunks).length },
    sample: sampleOf(pack),
    samples: SAMPLE_FORM,
  };
}
// The grammar a pack teaches: every pattern its sentences are examples of, its own and its language's catalog's alike
// (a pack that only tags the catalog's defines none of its own, and still teaches them).
const patternsUsed = (pack: Pack) => new Set(pack.items.flatMap((item) => item.concepts ?? [])).size;
const badgesOf = (pack: Pack) => ({ sentences: sentencesOf(pack).length, ...(cardsOf(pack).length ? { cards: cardsOf(pack).length } : {}), words: Object.keys(pack.words).length, patterns: patternsUsed(pack), literal: pack.items.filter((item) => item.literal?.length).length });

// A library pack's own topics as Explore's, where one plainly is the other: the same id or name, or one of these. The
// rest are left out rather than guessed. Every one that matches (a sharer's limit of TOPICS_PER_ITEM is for what they
// pick; these are Lexicommons' own packs). A shared pack's topics are the ones its author picks.
const TOPIC_ALIASES: Record<string, string> = { people: "family", "family and people": "family", friends: "family", "at home": "home", "getting around": "travel" };
const topicKey = (text: string) => text.trim().toLowerCase().replace(/-/g, " ").replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ");
function exploreTopicsOf(pack: Pack, known: Map<string, string>): string[] {
  const byName = new Map([...known].map(([id, name]) => [topicKey(name), id]));
  const found = new Set<string>();
  for (const [id, label] of Object.entries(((pack as { topics?: Record<string, unknown> }).topics ?? {}) as Record<string, unknown>)) {
    for (const key of [topicKey(id), typeof label === "string" ? topicKey(label) : ""]) {
      const hit = known.has(key) ? key : (byName.get(key) ?? TOPIC_ALIASES[key]);
      if (hit && known.has(hit)) {
        found.add(hit);
        break;
      }
    }
  }
  return [...found];
}

/** What Explore's index keeps of one of the library's packs beyond its version: its badges and its topics, as JSON. */
function libraryIndexed(pack: Pack, audio: string | undefined, known: Map<string, string>, meanRank: number | null = null) {
  return { badges: JSON.stringify({ ...badgesOf(pack), ...(audio ? { audio: true } : {}), ...(meanRank !== null ? { meanRank } : {}) }), topics: JSON.stringify(exploreTopicsOf(pack, known)) };
}

const frequencyRanks = frequencyRanksJs as unknown as (list: unknown) => Map<string, number>;
/**
 * How common the words a pack is written for are: the mean of each item's own word's place on its language's frequency list (the word
 * its gap is, by its lemma), a word off the list counting as one past its end. Lower is commoner. Null with no list, or no item with a
 * gap. Explore's pack to start is the commonest suggested topic pack (featureOf).
 */
export function meanRankOf(pack: Pack, ranks: Map<string, number> | null): number | null {
  if (!ranks) return null;
  const past = ranks.size + 1;
  const own = pack.items.flatMap((item) => {
    const at = item.gap?.index;
    const lemma = typeof at === "number" ? item.words?.[at]?.[1] : undefined;
    return lemma ? [lemma] : [];
  });
  if (!own.length) return null;
  return Math.round(own.reduce((sum, lemma) => sum + (ranks.get(lemma) ?? ranks.get(lemma.toLowerCase()) ?? past), 0) / own.length);
}
/** A language's frequency list as ranks (frequencyRanks), read once for a sync from where its catalog says; null when it has none. */
function ranksReader(env: Env, catalogue: { lists?: { frequency?: Record<string, { url?: string }> } }) {
  const read = new Map<string, Promise<Map<string, number> | null>>();
  return (language: string) => {
    if (!read.has(language))
      read.set(
        language,
        (async () => {
          const url = catalogue.lists?.frequency?.[language]?.url;
          const object = url?.startsWith("/library/") ? await env.LIBRARY.get(url.slice("/library/".length)) : null;
          return object ? frequencyRanks(JSON.parse(await object.text())) : null;
        })().catch(() => null),
      );
    return read.get(language)!;
  };
}

/** Checks a pack as it would be shared under `id`: with the language's default packs as what everyone has. */
async function checkForSharing(env: Env, raw: unknown, id: string, name?: string, about?: string) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { pack: null, errors: [{ at: "pack", message: "A pack must be an object." }], warnings: [] };
  const source = raw as Record<string, unknown>;
  const candidate = { ...source, id, ...(name ? { name } : {}), ...(about !== undefined ? (about ? { about } : { about: undefined }) : {}) };
  const language = typeof source.language === "string" ? source.language : "";
  const installed = await installedFor(env, language, id);
  // A value the check doesn't expect may throw in it: that's a problem with the pack, said so, never a 500.
  try {
    return checkPack(candidate, { installed });
  } catch (error) {
    return { pack: null, errors: [{ at: "pack", message: `The pack couldn't be checked: ${error instanceof Error ? error.message : "a value of the wrong kind"}.` }], warnings: [] };
  }
}

/** What everyone has in a language, to check a pack against: the library's default packs, and the app's built-in ones not among them. */
export async function installedFor(env: Env, language: string, exceptId: string) {
  const catalogue = await catalogueNow(env);
  // The language's shared grammar first (src/grammar.ts): every check beside these packs resolves patterns against it.
  await grammarReady(env, language, catalogue);
  const defaults = (await defaultInstalled(catalogue, language, fetchLibraryPack(env), exceptId)) as { id: string }[];
  const builtIn = BUILT_IN.filter((p: { id: string; language: string }) => p.language === language && !defaults.some((d) => d.id === p.id)).map((p: object) => ({ ...p, builtIn: true }));
  return [...defaults, ...builtIn];
}

const changedPieces = changedPiecesJs as unknown as (previous: Pack, next: Pack) => Set<string>;
const checkFix = checkFixJs as unknown as (pack: Pack, path: string, value: unknown, options: { installed: unknown[] }) => { pack: Pack | null };

/**
 * The accepted corrections the current version holds (applying one again changes nothing) and the next one changes:
 * what a new version would undo. The newest hundred accepted are looked at.
 */
export async function undoneCorrections(env: Env, itemId: string, head: Pack, next: Pack) {
  // Only a piece that changes can be undone: every correction accepted on one (or being accepted right now, its version
  // maybe the head already), the newest first.
  const changed = [...changedPieces(head, next)];
  const found: { path: string; value: string; by_name: string | null; updated_at: number }[] = [];
  for (let i = 0; i < changed.length; i += 40) {
    const chunk = changed.slice(i, i + 40);
    const rows = await env.DB.prepare(
      `SELECT c.path, c.value, c.updated_at, u.name AS by_name FROM corrections c LEFT JOIN users u ON u.id = c.author_id WHERE c.item_id = ? AND c.state IN ('accepted', 'accepting') AND c.kind = 'fix' AND c.path IN (${chunk.map(() => "?").join(", ")})`,
    )
      .bind(itemId, ...chunk)
      .all<{ path: string; value: string; by_name: string | null; updated_at: number }>();
    found.push(...rows.results);
  }
  if (!found.length) return [];
  found.sort((a, b) => b.updated_at - a.updated_at);
  const rows = { results: found };
  const installed = await installedFor(env, head.language, head.id);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  // Only the fields a correction writes (a sentence's fix may leave its gap, punct or moved alone).
  const written = (path: string, value: unknown, piece: unknown) => {
    if (parsePath(path)?.field !== "words" || !piece || typeof piece !== "object" || !value || typeof value !== "object") return piece;
    const keys = ["words", "punct", "moved", "gap"].filter((k) => k === "words" || (value as Record<string, unknown>)[k] !== undefined);
    return Object.fromEntries(keys.map((k) => [k, (piece as Record<string, unknown>)[k]]));
  };
  return rows.results
    .filter((r) => {
      const value = JSON.parse(r.value);
      if (same(written(r.path, value, pieceOf(head, r.path)), written(r.path, value, pieceOf(next, r.path)))) return false;
      const again = checkFix(head, r.path, value, { installed });
      return Boolean(again.pack) && same(written(r.path, value, pieceOf(again.pack, r.path)), written(r.path, value, pieceOf(head, r.path)));
    })
    .map((r) => ({ path: r.path, by: r.by_name ?? "a former member" }));
}
/**
 * What a new version does to corrections, as statements for the version's own batch (so nothing reads the new head
 * while they're still undone): the ones an accept claimed for this very version are accepted into it
 * (corrections.ts names the version in its claim), then the open ones, and any claimed for another version, on every
 * piece it changed are superseded (study/pack-corrections.js). when: extra SQL that must hold (the version's row is
 * there) and its binds.
 *
 * The library's own packs (curated) are indexed after their catalog write, by whichever write comes next, so a version
 * may be indexed late or skipped: there, a claim whose version was published (its admin log entry, written with the
 * catalog's revision) is accepted whatever version this is, and only open ones are superseded. An accept still in
 * flight is left to settle itself (corrections.ts settleClaim).
 */
export function versionStatements(
  env: Env,
  itemId: string,
  version: string,
  previous: Pack | null,
  next: Pack,
  { when = { sql: "1", binds: [] }, curated = false }: { when?: { sql: string; binds: unknown[] }; curated?: boolean } = {},
) {
  const now = Date.now();
  const statements = [
    env.DB.prepare(`UPDATE corrections SET state = 'accepted', accepted_in = ?, updated_at = ? WHERE item_id = ? AND state = 'accepting' AND accepted_in LIKE 'claim:%:' || ? AND ${when.sql}`).bind(version, now, itemId, version, ...when.binds),
  ];
  if (curated) statements.push(env.DB.prepare(`UPDATE corrections SET state = 'accepted', accepted_in = substr(accepted_in, -12), updated_at = ? WHERE item_id = ? AND state = 'accepting' AND ${PUBLISHED_CLAIM} AND ${when.sql}`).bind(now, itemId, ...when.binds));
  const changed = previous ? [...changedPieces(previous, next)] : [];
  for (let i = 0; i < changed.length; i += 40) {
    const chunk = changed.slice(i, i + 40);
    statements.push(
      env.DB.prepare(
        `UPDATE corrections SET state = 'superseded', accepted_in = NULL, answered_by = NULL, answered_at = NULL, answer_note = NULL, updated_at = ? WHERE item_id = ? AND state IN (${curated ? "'open'" : "'open', 'accepting'"}) AND path IN (${chunk.map(() => "?").join(", ")}) AND ${when.sql}`,
      ).bind(now, itemId, ...chunk, ...when.binds),
    );
  }
  return statements;
}
/** SQL on a corrections row: its claim (claim:<token>:<version>) names a version of the library's pack that was published. */
export const PUBLISHED_CLAIM =
  "accepted_in LIKE 'claim:%' AND EXISTS (SELECT 1 FROM admin_log WHERE action = 'library.publish' AND target = 'pack:' || corrections.item_id || '@' || substr(corrections.accepted_in, -12))";

/**
 * Puts a version's file into the library before its records: created only if absent (a version is named by its
 * content). It isn't served until its version is recorded in D1 (books.ts), so a share or version the records then
 * refuse (a limit) leaves a file nobody can get, and nothing points at a file that isn't there.
 */
async function storeVersion(env: Env, id: string, version: string, text: string): Promise<string> {
  const key = packKey(id, version) as string;
  const sha = await sha256Hex(text);
  const put = await env.LIBRARY.put(key, text, { httpMetadata: { contentType: "application/json" }, sha256: sha, onlyIf: new Headers({ "If-None-Match": "*" }) });
  if (!put) {
    const existing = await env.LIBRARY.get(key);
    if (!existing || (await sha256Hex(await existing.text())) !== sha) throw new LibraryError(`${key} already holds other bytes; nothing was shared.`);
  }
  return key;
}

/**
 * An item in Explore with the same content: one taken down by reports first (removed, or withdrawn and down: down is
 * set), then one that's up or hidden. A withdrawn one with nothing against it doesn't count (it can be shared again).
 */
async function twinOf(env: Env, hash: string, exceptId = ""): Promise<{ id: string; title: string; down: number } | null> {
  const down = `(state = 'removed' OR (state = 'withdrawn' AND ${downSql("items.id")}))`;
  return env.DB.prepare(`SELECT id, title, ${down} AS down FROM items WHERE content_hash = ? AND id != ? AND (state IN ('live', 'hidden') OR ${down}) ORDER BY down DESC LIMIT 1`)
    .bind(...downBinds("items.id"), hash, exceptId, ...downBinds("items.id"))
    .first<{ id: string; title: string; down: number }>();
}

/**
 * twinOf's rule inside the write itself: no other pack in Explore, or taken down from it, has these contents. Two shares of the same
 * pack sent at once each read no twin before either was written, and both went in (7 Nov 2026, Codex C19).
 */
function noTwin(hash: string, exceptId = "") {
  const down = `(twin.state = 'removed' OR (twin.state = 'withdrawn' AND ${downSql("twin.id")}))`;
  return {
    sql: `NOT EXISTS (SELECT 1 FROM items twin WHERE twin.content_hash = ? AND twin.id != ? AND (twin.state IN ('live', 'hidden') OR ${down}))`,
    binds: [hash, exceptId, ...downBinds("twin.id")],
  };
}

/** The public id a pack is shared under: its own, or its own with a suffix when someone already has that one. */
async function publicId(env: Env, sourceId: string): Promise<string> {
  const reserved = async (id: string) =>
    Boolean(await env.DB.prepare("SELECT 1 AS y FROM items WHERE id = ?").bind(id).first()) || BUILT_IN.some((p: { id: string }) => p.id === id);
  if (PACK_ID.test(sourceId) && !(await reserved(sourceId))) return sourceId;
  for (let tries = 0; tries < 5; tries++) {
    const id = `${sourceId.replace(/[^a-z0-9-]/g, "").slice(0, 40) || "pack"}-${randomHex(3)}`;
    if (!(await reserved(id))) return id;
  }
  throw new LibraryError("Couldn't find a free id for this pack; try again.");
}

export interface ShareInput extends ShareMeta {
  pack: unknown;
  note?: string;
}

export type ShareResult =
  | { shared: true; id: string; version: string; url: string; page: string; warnings: Problem[]; notes: string[] }
  | { shared: false; errors: Problem[]; warnings: Problem[] };

/** Shares one of the person's packs to Explore: checked, named by its content, stored once, under CC BY-SA 4.0. */
export async function sharePack(env: Env, actor: { userId: string; via: string }, input: ShareInput): Promise<ShareResult> {
  await mayShare(env, actor.userId);
  await checkLimit(env, actor.userId, "share");
  const packId = (input.pack as { id?: unknown } | null | undefined)?.id;
  const sourceId = typeof packId === "string" ? packId : "";
  const already = await env.DB.prepare("SELECT id FROM items WHERE owner_id = ? AND source_id = ? AND state != 'removed'").bind(actor.userId, sourceId).first<{ id: string }>();
  if (already) return { shared: false, errors: [{ at: "pack", message: `You've shared this pack already, as "${already.id}": share a new version of it with update_shared (or "Share this update" in the app).` }], warnings: [] };
  const meta = await checkMeta(env, input);
  const id = await publicId(env, sourceId);
  const checked = await checkForSharing(env, input.pack, id, input.title?.trim(), input.about?.trim());
  const errors = [...meta.problems, ...checked.errors];
  if (errors.length || !checked.pack) return { shared: false, errors, warnings: checked.warnings };
  const pack = checked.pack;
  const hash = await contentHash(pack);
  const twin = await twinOf(env, hash);
  if (twin?.down) return { shared: false, errors: [{ at: "pack", message: "This is the same pack as one taken down from Explore after a report; it can't be shared again." }], warnings: checked.warnings };
  if (twin) return { shared: false, errors: [{ at: "pack", message: `This is the same pack as "${twin.title}" (${twin.id}), already in Explore: follow it, or suggest corrections to it.` }], warnings: checked.warnings };
  const text = packText(pack) as string;
  const version = await packVersion(pack);
  // The day's limit and the account's room, checked now and again inside the write, so shares sent at once can't all
  // pass them.
  const guard = await limitGuard(env, actor.userId, "share");
  const room = await storageGuard(env, actor.userId, byteLength(text));
  const unique = noTwin(hash);
  await enforce(env, [guard, room]);
  const key = await storeVersion(env, id, version, text);
  const now = Date.now();
  const owner = await env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(actor.userId).first<{ name: string }>();
  const [added] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO items (id, kind, owner_id, curated, source_id, title, about, language, from_lang, level, topics, badges, licence, copied_from, head_version, content_hash, search, cover, created_at, updated_at)
       SELECT ?, 'pack', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql} AND ${room.sql} AND ${unique.sql}`,
    ).bind(
      id,
      actor.userId,
      sourceId,
      pack.name,
      pack.about ?? null,
      pack.language,
      pack.from,
      meta.level ?? null,
      JSON.stringify(meta.topics ?? []),
      JSON.stringify(badgesOf(pack)),
      SHARING_LICENCE,
      pack.copiedFrom ? JSON.stringify(pack.copiedFrom) : null,
      version,
      hash,
      searchText(pack.name, pack.about, ...(meta.topics ?? []), owner?.name),
      meta.cover,
      now,
      now,
      ...guard.binds,
      ...room.binds,
      ...unique.binds,
    ),
    env.DB.prepare(
      "INSERT INTO item_versions (item_id, version, seq, r2_key, bytes, summary, note, licence, terms_version, made_by, created_at) SELECT ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM items WHERE id = ? AND created_at = ?)",
    ).bind(id, version, key, byteLength(text), JSON.stringify(summarize(pack)), input.note?.trim().slice(0, 500) || null, SHARING_LICENCE, SHARING_TERMS_VERSION, actor.via, now, id, now),
  ]);
  // Over a limit, or the same pack shared at this moment: nothing was written to D1, so its file (already in R2) is never served.
  if (!added!.meta.changes) {
    const twinNow = await twinOf(env, hash);
    if (twinNow) {
      const message = twinNow.down ? "This is the same pack as one taken down from Explore after a report; it can't be shared again." : `This is the same pack as "${twinNow.title}" (${twinNow.id}), already in Explore: follow it, or suggest corrections to it.`;
      return { shared: false, errors: [{ at: "pack", message }], warnings: checked.warnings };
    }
    await enforce(env, [guard, room]);
    throw guard.refusal();
  }
  return {
    shared: true,
    id,
    version,
    url: `/library/${key}`,
    page: `${env.PUBLIC_ORIGIN}/app/#explore/item/${encodeURIComponent(id)}`,
    warnings: checked.warnings,
    notes: id !== sourceId ? [`"${sourceId}" was taken in Explore, so it's shared as "${id}".`] : [],
  };
}

/**
 * A shared pack the actor may change: their own, or anyone's for an admin acting with admin access (adminAccess: a person in the app,
 * an MCP sign-in, or a personal token made with admin access; never a token made without it, though its account is an admin's).
 */
async function ownedItem(env: Env, actor: { userId: string; adminAccess?: boolean }, id: string) {
  const row = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(id).first<ItemRow & { content_hash: string }>();
  if (!row || row.state === "removed") throw new LibraryError(`There's no pack "${id}" of yours in Explore.`);
  if (row.owner_id !== actor.userId && !(actor.adminAccess === true && (await rolesOf(env, actor.userId)).has("admin"))) throw new LibraryError(`"${id}" isn't yours to change.`);
  return row;
}

export interface UpdateInput extends ShareMeta {
  pack?: unknown;
  note?: string;
  confirmRemoved?: boolean;
  /** A version that undoes corrections accepted into the current one: share it anyway. */
  confirmReverts?: boolean;
}

/** A new version of a shared pack (its followers get it), or new metadata (level, topics) with no new version. */
export async function updateShared(
  env: Env,
  actor: { userId: string; via: string; adminAccess?: boolean },
  id: string,
  input: UpdateInput,
  {
    asAdmin = false,
    expectedHead,
    claim,
  }: {
    asAdmin?: boolean;
    expectedHead?: string;
    /** An accept's claim (corrections.ts): the version is made only while it still holds all its corrections. */
    claim?: { id: string; count: number };
  } = {},
) {
  // An admin accepting corrections on someone else's pack (corrections.ts) shares nothing of their own.
  if (!asAdmin) await mayShare(env, actor.userId);
  const row = await ownedItem(env, actor, id);
  if (row.state === "hidden") throw new LibraryError(`"${id}" is hidden after a report; it can't be updated until that's settled.`);
  if (row.state === "removed") throw new LibraryError(`"${id}" was taken down from Explore after a report; it can't be updated.`);
  // A withdrawn pack gets no more updates (its followers keep the version they have); share it again as a new one.
  if (row.state === "withdrawn") throw new LibraryError(`"${id}" is withdrawn from Explore, so it isn't updated any more: share it again as a new pack.`);
  if (expectedHead !== undefined && row.head_version !== expectedHead) throw new LibraryError(`"${id}" has a newer version than the one this was made on: look again.`);
  const meta = await checkMeta(env, input);
  if (meta.problems.length) return { updated: false as const, errors: meta.problems, warnings: [] };
  const now = Date.now();
  const owner = row.owner_id ? await env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(row.owner_id).first<{ name: string }>() : null;
  const topics = meta.topics ?? (JSON.parse(row.topics) as string[]);
  const level = meta.level === undefined ? row.level : meta.level;
  if (input.pack === undefined) {
    if (input.title !== undefined || input.about !== undefined) return { updated: false as const, errors: [{ at: "title", message: "A new title or about is part of the pack: send the pack with it." }], warnings: [] };
    if (meta.level === undefined && meta.topics === undefined) throw new LibraryError("Nothing to change: send a new version (the pack), or the level or topics.");
    // Only while it's live, as it is now (a report may have hidden it meanwhile).
    const done = await env.DB.prepare("UPDATE items SET level = ?, topics = ?, search = ?, updated_at = ? WHERE id = ? AND state = 'live'").bind(level, JSON.stringify(topics), searchText(row.title, row.about, ...topics, owner?.name), now, id).run();
    if (!done.meta.changes) throw new LibraryError(`"${id}" changed meanwhile (a report hid it): it isn't live.`);
    return { updated: true as const, id, version: row.head_version, newVersion: false, warnings: [] };
  }
  await checkLimit(env, actor.userId, "version");
  const checked = await checkForSharing(env, input.pack, id, input.title?.trim(), input.about?.trim());
  if (checked.errors.length || !checked.pack) return { updated: false as const, errors: checked.errors, warnings: checked.warnings };
  const pack = checked.pack;
  // A new version is the same pack's: its languages stay, so Explore's listing, its followers and requests answered with it all
  // mean the same pack (6 Nov 2026, Codex C11: a Dutch pack could become French while Explore still said Dutch).
  if (pack.language !== row.language || (pack.from ?? null) !== (row.from_lang ?? null)) {
    return { updated: false as const, errors: [{ at: "pack", message: `A new version keeps the pack's languages (${row.language}, from ${row.from_lang ?? "English"}): share a pack in another language as a new pack.` }], warnings: checked.warnings };
  }
  const version = await packVersion(pack);
  if (version === row.head_version) return { updated: false as const, errors: [{ at: "pack", message: "This is the version already shared: nothing changed." }], warnings: checked.warnings };
  const earlier = await env.DB.prepare("SELECT seq FROM item_versions WHERE item_id = ? AND version = ?").bind(id, version).first<{ seq: number }>();
  if (earlier) return { updated: false as const, errors: [{ at: "pack", message: `This is the same as version ${earlier.seq} of this pack, shared before: Explore keeps each version once. Change something to share it again.` }], warnings: checked.warnings };
  const previous = await fetchLibraryPack(env)({ id, version: row.head_version });
  const changes = previous ? compareVersions(previous as Pack, pack) : null;
  if (changes?.removed.length && row.follows > 0 && !input.confirmRemoved) {
    return {
      updated: false as const,
      errors: [{ at: "pack", message: `This version removes ${changes.removed.length} ${changes.removed.every((one) => one.startsWith("card:")) ? "card" : "sentence"}${changes.removed.length === 1 ? "" : "s"} (${changes.removed.slice(0, 8).map((one) => one.replace(/^card:/, "")).join(", ")}${changes.removed.length > 8 ? ", …" : ""}) that ${row.follows} follower${row.follows === 1 ? " has" : "s have"} studied. Send it again with confirm_removed if that's meant.` }],
      warnings: checked.warnings,
    };
  }
  // Corrections accepted into the current version that this one would undo: the author's own copy (on their device)
  // doesn't have them until they take them in, so a share from it says so first.
  if (previous && !input.confirmReverts) {
    const undone = await undoneCorrections(env, id, previous as Pack, pack);
    if (undone.length) {
      const list = undone.slice(0, 8).map((u) => `${u.path} by ${u.by}`).join(", ") + (undone.length > 8 ? ", …" : "");
      return {
        updated: false as const,
        errors: [{ at: "pack", message: `This version undoes ${undone.length} accepted correction${undone.length === 1 ? "" : "s"} (${list}): your own copy doesn't have ${undone.length === 1 ? "it" : "them"} yet. Take ${undone.length === 1 ? "it" : "them"} into your pack, or send it again with confirm_reverts if that's meant.` }],
        warnings: checked.warnings,
      };
    }
  }
  const hash = await contentHash(pack);
  const twin = await twinOf(env, hash, id);
  if (twin?.down) return { updated: false as const, errors: [{ at: "pack", message: "This version is the same pack as one taken down from Explore after a report." }], warnings: checked.warnings };
  if (twin) return { updated: false as const, errors: [{ at: "pack", message: `This version is the same pack as "${twin.title}" (${twin.id}).` }], warnings: checked.warnings };
  const text = packText(pack) as string;
  const guard = await limitGuard(env, actor.userId, "version");
  const room = await storageGuard(env, actor.userId, byteLength(text));
  const unique = noTwin(hash, id);
  await enforce(env, [guard, room]);
  const key = await storeVersion(env, id, version, text);
  const seq = ((await env.DB.prepare("SELECT MAX(seq) AS seq FROM item_versions WHERE item_id = ?").bind(id).first<{ seq: number }>())?.seq ?? 0) + 1;
  // This write's own token, in the version's row: the rest of the batch happens only with it.
  const token = randomId(12);
  const made = { sql: "EXISTS (SELECT 1 FROM item_versions WHERE item_id = ? AND version = ? AND write_token = ?)", binds: [id, version, token] };
  const [added] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO item_versions (item_id, version, seq, r2_key, bytes, summary, note, licence, terms_version, made_by, created_at, write_token) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql} AND ${room.sql} AND ${unique.sql} AND EXISTS (SELECT 1 FROM items WHERE id = ? AND state = 'live' AND head_version = ?)${claim ? " AND (SELECT COUNT(*) FROM corrections WHERE item_id = ? AND state = 'accepting' AND accepted_in = ? AND shown = 'visible') = ?" : ""}`).bind(
      id,
      version,
      seq,
      key,
      byteLength(text),
      JSON.stringify({ ...summarize(pack), changes }),
      input.note?.trim().slice(0, 500) || null,
      row.licence,
      row.curated ? null : SHARING_TERMS_VERSION,
      actor.via,
      now,
      token,
      ...guard.binds,
      ...room.binds,
      ...unique.binds,
      id,
      row.head_version,
      ...(claim ? [id, claim.id, claim.count] : []),
    ),
    env.DB.prepare(`UPDATE items SET title = ?, about = ?, level = ?, topics = ?, badges = ?, head_version = ?, content_hash = ?, search = ?, updated_at = ? WHERE id = ? AND ${made.sql}`).bind(
      pack.name,
      pack.about ?? null,
      level,
      JSON.stringify(topics),
      JSON.stringify(badgesOf(pack)),
      version,
      hash,
      searchText(pack.name, pack.about, ...topics, owner?.name),
      now,
      id,
      ...made.binds,
    ),
    // In the same batch, with the version this write made: what it accepts and supersedes.
    ...versionStatements(env, id, version, previous as Pack | null, pack, { when: made }),
  ]);
  if (!added!.meta.changes) {
    // The same pack shared, or given as a version, at this moment.
    const twinNow = await twinOf(env, hash, id);
    if (twinNow) {
      const message = twinNow.down ? "This version is the same pack as one taken down from Explore after a report." : `This version is the same pack as "${twinNow.title}" (${twinNow.id}).`;
      return { updated: false as const, errors: [{ at: "pack", message }], warnings: checked.warnings };
    }
    await enforce(env, [guard, room]);
    const current = await env.DB.prepare("SELECT state, head_version FROM items WHERE id = ?").bind(id).first<{ state: string; head_version: string }>();
    if (current?.state === "live" && current.head_version !== row.head_version) throw new LibraryError(`"${id}" got another new version meanwhile: look again.`);
    if (claim) {
      const held = await env.DB.prepare("SELECT COUNT(*) AS n FROM corrections WHERE item_id = ? AND state = 'accepting' AND accepted_in = ? AND shown = 'visible'").bind(id, claim.id).first<{ n: number }>();
      if (held?.n !== claim.count) throw new LibraryError("The corrections being accepted changed meanwhile, so no version was made: look again (list_corrections).");
    }
    throw current?.state === "live" ? guard.refusal() : new LibraryError(`"${id}" changed meanwhile (a report hid it): it isn't live, so this version wasn't shared.`);
  }
  return { updated: true as const, id, version, newVersion: true, changes, warnings: checked.warnings };
}

/** Takes a shared pack out of Explore; whoever follows it keeps the version they have (the license allows it). */
export async function withdrawShared(env: Env, actor: { userId: string; adminAccess?: boolean }, id: string) {
  const row = await ownedItem(env, actor, id);
  if (row.curated) throw new LibraryError(`"${id}" is one of the library's default packs: take it off with library_unpublish.`);
  if (row.state !== "live") throw new LibraryError(`"${id}" isn't live (it's ${row.state}).`);
  // Only from live as it is now: a report that hid it meanwhile isn't undone by withdrawing.
  const done = await env.DB.prepare("UPDATE items SET state = 'withdrawn', state_reason = 'Withdrawn by its author.', state_at = ? WHERE id = ? AND state = 'live'").bind(Date.now(), id).run();
  if (!done.meta.changes) throw new LibraryError(`"${id}" changed meanwhile (a report hid it): it isn't live.`);
  return { id, state: "withdrawn", note: "It's gone from Explore. Whoever follows it keeps the version they have, with no more updates." };
}

/** What this account has shared, for Explore → Yours and an AI's update_shared: taken-down ones too, saying so. */
export async function mine(env: Env, userId: string) {
  const rows = await env.DB.prepare(`${SELECT_ITEM} WHERE i.owner_id = ?2 ORDER BY i.updated_at DESC`).bind(userId, userId).all<ItemRow>();
  const down = new Set(
    (
      await env.DB.prepare(`SELECT i.id FROM items i WHERE i.owner_id = ? AND i.state = 'withdrawn' AND ${downSql("i.id")}`)
        .bind(userId, ...downBinds("i.id"))
        .all<{ id: string }>()
    ).results.map((r) => r.id),
  );
  return Promise.all(rows.results.map(async (row) => ({ ...(await itemView(env, row, userId)), sourceId: row.source_id, ...(down.has(row.id) ? { down: true } : {}) })));
}

// ---------- the library's default packs, indexed in Explore ----------

/**
 * The library's default pack (catalogue.packs), indexed in Explore beside community packs, so people find it where
 * they find everything else. The catalog stays the source of truth for what everyone gets; this is the index.
 */
export async function indexLibraryPack(env: Env, pack: Pack, version: string, key: string, via: string, audio: string | undefined, owner: string, meanRank: number | null = null) {
  const text = packText(pack) as string;
  const now = Date.now();
  const token = randomId(12);
  // Only while this sync still owns the index (syncLibraryIndex: owner is its token), and over the head it read; the
  // rest of the batch only with this write's own token.
  const owns = "(SELECT token FROM library_index WHERE id = 1) = ?";
  const existing = await env.DB.prepare("SELECT head_version FROM items WHERE id = ?").bind(pack.id).first<{ head_version: string }>();
  const previous = existing && existing.head_version !== version ? await fetchLibraryPack(env)({ id: pack.id, version: existing.head_version }) : null;
  const fence = { sql: "EXISTS (SELECT 1 FROM items WHERE id = ? AND index_token = ?)", binds: [pack.id, token] };
  const indexed = libraryIndexed(pack, audio, await topicsById(env), meanRank);
  const statements = [
    env.DB.prepare(
      `INSERT INTO items (id, kind, owner_id, curated, title, about, language, from_lang, topics, badges, licence, head_version, content_hash, search, created_at, updated_at, index_token)
       SELECT ?1, 'pack', NULL, 1, ?2, ?3, ?4, ?5, ?15, ?6, ?7, ?8, ?9, ?10, ?11, ?11, ?12 WHERE ${owns.replace("?", "?13")}
       ON CONFLICT(id) DO UPDATE SET title = ?2, about = ?3, topics = ?15, badges = ?6, head_version = ?8, content_hash = ?9, search = ?10, state = 'live', state_reason = NULL, updated_at = ?11, index_token = ?12
       WHERE items.curated = 1 AND items.head_version IS ?14 AND ${owns.replace("?", "?13")}`,
    ).bind(pack.id, pack.name, pack.about ?? null, pack.language, pack.from, indexed.badges, SHARING_LICENCE, version, await contentHash(pack), searchText(pack.name, pack.about, "Lexicommons", ...(JSON.parse(indexed.topics) as string[])), now, token, owner, existing?.head_version ?? null, indexed.topics),
  ];
  if (!existing || existing.head_version !== version) {
    // Its place in the history taken in the statement itself (a version already there, as after a restore, stays).
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO item_versions (item_id, version, seq, r2_key, bytes, summary, note, licence, terms_version, made_by, created_at) SELECT ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM item_versions WHERE item_id = ?), ?, ?, ?, NULL, ?, NULL, ?, ? WHERE ${fence.sql}`,
      ).bind(pack.id, version, pack.id, key, byteLength(text), JSON.stringify({ ...summarize(pack), changes: previous ? compareVersions(previous as Pack, pack) : null }), SHARING_LICENCE, via, now, ...fence.binds),
    );
  }
  // Its version's counts as the pack has them now (one already on record keeps its history, and gets them too).
  statements.push(
    env.DB.prepare(`UPDATE item_versions SET summary = json_set(summary, '$.counts', json(?)) WHERE item_id = ? AND version = ? AND ${fence.sql}`).bind(JSON.stringify(summarize(pack).counts), pack.id, version, ...fence.binds),
  );
  statements.push(...versionStatements(env, pack.id, version, previous as Pack | null, pack, { when: fence, curated: true }));
  await env.DB.batch(statements);
}

/** A default pack taken off the catalog leaves Explore too (its followers keep what they have), while this sync owns the index. */
export async function unindexLibraryPack(env: Env, id: string, owner: string) {
  await env.DB.prepare("UPDATE items SET state = 'withdrawn', state_reason = 'No longer one of the library''s packs.', state_at = ?, index_token = NULL WHERE id = ? AND curated = 1 AND (SELECT token FROM library_index WHERE id = 1) = ?")
    .bind(Date.now(), id, owner)
    .run();
}

/**
 * Brings Explore's index of the library's default packs in line with a catalog (after any change to it: a publish,
 * an unpublish, a restore, or the command line): each default pack listed at its version, and none listed that isn't
 * one. The catalog is the source of truth.
 */
/** How the index is written (library_index.format): a sync claims a revision it already finished when its rows were written an older way. 1: badges.meanRank. */
const INDEX_FORMAT = 1;
export async function syncLibraryIndex(env: Env, catalogue: { packs?: Record<string, unknown>; lists?: { frequency?: Record<string, { url?: string }> } }, via: string, rev: number) {
  // One sync at a time owns the index: the newest catalog revision's to begin, or one for the same revision taking over
  // a sync that never finished (an error, or its request ended), or one finished when the index was written an older way (INDEX_FORMAT; the
  // cron looks every 15 minutes, so a new way reaches every row after a deploy). Claimed here with its own token, and every write it
  // makes checks it still owns it (an older or overtaken sync that resumes late changes nothing; the owner reads the
  // index after its claim, so it sees whatever another wrote first). Marked done at the end.
  const owner = randomId(12);
  const claimed = await env.DB.prepare("UPDATE library_index SET rev = ?1, token = ?2, done = 0, format = ?3 WHERE id = 1 AND (rev < ?1 OR (rev = ?1 AND (done = 0 OR format < ?3)))").bind(rev, owner, INDEX_FORMAT).run();
  if (!claimed.meta.changes) return;
  const refs = Object.keys(catalogue.packs ?? {}).flatMap((language) => packRefs(catalogue, language));
  const indexed = await env.DB.prepare("SELECT id, head_version, state, badges, topics FROM items WHERE curated = 1").all<{ id: string; head_version: string; state: string; badges: string; topics: string }>();
  const byId = new Map(indexed.results.map((r) => [r.id, r]));
  const known = await topicsById(env);
  const ranksOf = ranksReader(env, catalogue);
  // Each pack read (a few at a time), so its badges and topics are what it says now, not only its version.
  for (let i = 0; i < refs.length; i += 8) {
    const chunk = refs.slice(i, i + 8);
    const packs = await Promise.all(chunk.map((ref) => fetchLibraryPack(env)(ref)));
    for (const [n, ref] of chunk.entries()) {
      const pack = packs[n] as Pack | null;
      if (!pack) continue;
      const row = byId.get(ref.id);
      const meanRank = meanRankOf(pack, await ranksOf(pack.language));
      const want = libraryIndexed(pack, ref.audio, known, meanRank);
      // Up to date: the same version, live, with its badges (audio can come without a new version) and topics.
      if (row && row.head_version === ref.version && row.state === "live" && row.badges === want.badges && row.topics === want.topics) continue;
      await indexLibraryPack(env, pack, ref.version, packKey(ref.id, ref.version) as string, via, ref.audio, owner, meanRank);
    }
  }
  for (const row of indexed.results) if (row.state === "live" && !refs.some((ref) => ref.id === row.id)) await unindexLibraryPack(env, row.id, owner);
  await env.DB.prepare("UPDATE library_index SET done = 1 WHERE id = 1 AND token = ?").bind(owner).run();
}

// ---------- curation (admins: mcp-community.ts) ----------

export async function setSections(env: Env, actorId: string, sections: { id?: string; title: string; items: string[] }[]) {
  const problems: string[] = [];
  const kept = sections.map((s, n) => {
    const title = s.title.replace(/\s+/g, " ").trim();
    const id = s.id ?? searchText(title).replace(/ /g, "-").slice(0, 40);
    if (!title) problems.push(`sections[${n}].title is missing.`);
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) problems.push(`sections[${n}].id must be lowercase letters, digits and dashes.`);
    return { id, title, items: [...new Set(s.items)] };
  });
  if (new Set(kept.map((s) => s.id)).size !== kept.length) problems.push("Two sections have the same id.");
  const ids = [...new Set(kept.flatMap((s) => s.items))];
  if (ids.length) {
    const found = await env.DB.prepare(`SELECT id FROM items WHERE id IN (${ids.map(() => "?").join(", ")})`).bind(...ids).all<{ id: string }>();
    const known = new Set(found.results.map((r) => r.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length) problems.push(`${unknown.map((id) => `"${id}"`).join(", ")} ${unknown.length === 1 ? "isn't an item" : "aren't items"} in Explore.`);
  }
  if (problems.length) throw new LibraryError(problems.join("\n"));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM explore_sections"),
    ...kept.map((s, rank) => env.DB.prepare("INSERT INTO explore_sections (id, title, rank, items, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(s.id, s.title, rank, JSON.stringify(s.items), actorId, now)),
  ]);
  return kept;
}

export async function setTopics(env: Env, topics: { id: string; name: string }[]) {
  const problems: string[] = [];
  for (const [n, t] of topics.entries()) {
    if (!/^[a-z0-9][a-z0-9-]{0,29}$/.test(t.id)) problems.push(`topics[${n}].id must be lowercase letters, digits and dashes.`);
    if (!t.name.trim()) problems.push(`topics[${n}].name is missing.`);
  }
  if (new Set(topics.map((t) => t.id)).size !== topics.length) problems.push("Two topics have the same id.");
  // A topic an item uses can't go: rename it instead.
  const gone = (await listTopics(env)).filter((t) => !topics.some((n) => n.id === t.id)).map((t) => t.id);
  for (const id of gone) {
    const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM items i WHERE EXISTS (SELECT 1 FROM json_each(i.topics) t WHERE t.value = ?)").bind(id).first<{ n: number }>();
    if (used?.n) problems.push(`"${id}" is used by ${used.n} item${used.n === 1 ? "" : "s"}: keep it (rename it if you like).`);
  }
  if (problems.length) throw new LibraryError(problems.join("\n"));
  await env.DB.batch([env.DB.prepare("DELETE FROM explore_topics"), ...topics.map((t, rank) => env.DB.prepare("INSERT INTO explore_topics (id, name, rank) VALUES (?, ?, ?)").bind(t.id, t.name.trim(), rank + 1))]);
  topicNames = null;
  return listTopics(env);
}

// ---------- an account going ----------

/**
 * For deleting an account (accounts.ts deleteAccount): statements for its batch. What it shared stays under its license,
 * shown as "a former member", and its name leaves those items' search text; its follows, likes and terms go (by the
 * batch's own deletes), and recountStatements(itemsTouchedBy) after the batch puts the counts right.
 */
export async function forgetAccountStatements(env: Env, userId: string): Promise<D1PreparedStatement[]> {
  const owned = await env.DB.prepare("SELECT id, title, about, topics FROM items WHERE owner_id = ?").bind(userId).all<{ id: string; title: string; about: string | null; topics: string }>();
  return [
    ...owned.results.map((row) => env.DB.prepare("UPDATE items SET owner_id = NULL, search = ? WHERE id = ?").bind(searchText(row.title, row.about, ...(JSON.parse(row.topics) as string[])), row.id)),
    // Its likes on corrections come off their counts in this same batch, just before its likes go (its own corrections
    // stay, by a former member).
    env.DB.prepare("UPDATE corrections SET likes = MAX(0, likes - 1) WHERE id IN (SELECT target_id FROM likes WHERE user_id = ? AND target_kind = 'correction')").bind(userId),
    ...["follows", "likes", "sharing_terms"].map((table) => env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId)),
  ];
}

/** The items an account followed or liked, to recount once it's gone. */
export async function itemsTouchedBy(env: Env, userId: string): Promise<string[]> {
  const rows = await env.DB.prepare("SELECT item_id AS id FROM follows WHERE user_id = ?1 UNION SELECT target_id AS id FROM likes WHERE user_id = ?1 AND target_kind = 'item'").bind(userId).all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

export const recountStatements = (env: Env, ids: string[]) => ids.map((id) => recount(env, id));
export { PACK_LIMITS };
