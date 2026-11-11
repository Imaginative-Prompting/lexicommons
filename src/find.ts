// Finding a pack from what you typed: which packs on the server hold it, so one can be added with a press (POST /api/translate/find; the design is docs/design/translate-v2/find-a-pack.md,
// outside this folder). Only packs explained in English, as Translate reads them. Rows are written by indexMissing, outside the request that published a pack: the cron passes over it,
// and a search of a language with packs still to do starts on them. A search joins rows to items, so a pack that isn't live, or a version that isn't its head, is never found.

import { LANGUAGES } from "../public/js/lang/index.js";
import { findRows, termsOf } from "./find-rows";
import { upgradePack } from "../public/js/study/pack-format.js";
import { LibraryError } from "./library";
import type { Env } from "./env";

const separatorOf = (language: string) => (LANGUAGES as Record<string, { separator?: string }>)[language]?.separator ?? " ";

export const FIND = {
  queryChars: 300,
  terms: 8,
  rowsPerTerm: 50,
  packs: 5,
  sentencesPerPack: 2,
  wordsPerPack: 3,
  // Rows written in one statement (as JSON, read back by json_each: D1 caps a statement's bound values, not what's in one).
  chunk: 1500,
  statementsPerBatch: 40,
  // How a pack's rows are written (find_entries.format): 2 marks which words it teaches (find_terms.taught). A pack written before is written again.
  format: 2,
};

type Missing = { id: string; head_version: string; language: string; r2_key: string };

const missingSql = `SELECT i.id, i.head_version, i.language, v.r2_key FROM items i JOIN item_versions v ON v.item_id = i.id AND v.version = i.head_version
  WHERE i.kind = 'pack' AND i.state = 'live' AND i.from_lang = 'en' AND NOT EXISTS (SELECT 1 FROM find_entries e WHERE e.item_id = i.id AND e.version = i.head_version AND e.n = 0 AND e.format >= ${FIND.format})`;

async function writeRows(env: Env, row: Missing) {
  const object = await env.LIBRARY.get(row.r2_key);
  if (!object) return false;
  const pack = upgradePack(JSON.parse(await object.text())) as Parameters<typeof findRows>[0];
  const { entries, terms } = findRows(pack, separatorOf(row.language));
  // Terms first, entries last: a pack counts as done once its first entry is there in this format (missingSql), so a pass cut short does it again. Rows
  // already there are replaced, which writes a pack from before taught again in place: its rows serve searches until each is replaced, and any of its
  // old rows the new ones didn't replace (taught unknown) go before its entries are marked.
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < terms.length; i += FIND.chunk) {
    statements.push(
      env.DB.prepare(
        "INSERT OR REPLACE INTO find_terms (language, term, item_id, version, n, taught) SELECT ?1, json_extract(value, '$[0]'), ?2, ?3, json_extract(value, '$[1]'), json_extract(value, '$[2]') FROM json_each(?4)",
      ).bind(row.language, row.id, row.head_version, JSON.stringify(terms.slice(i, i + FIND.chunk))),
    );
  }
  statements.push(env.DB.prepare("DELETE FROM find_terms WHERE item_id = ? AND version = ? AND taught IS NULL").bind(row.id, row.head_version));
  // Bodies are longer: fewer to a statement, under D1's limit on one bound value.
  for (let i = 0; i < entries.length; i += 400) {
    statements.push(
      env.DB.prepare("INSERT OR REPLACE INTO find_entries (item_id, version, n, body, format) SELECT ?1, ?2, json_extract(value, '$.n'), json_extract(value, '$.body'), ?4 FROM json_each(?3)").bind(row.id, row.head_version, JSON.stringify(entries.slice(i, i + 400)), FIND.format),
    );
  }
  for (let i = 0; i < statements.length; i += FIND.statementsPerBatch) await env.DB.batch(statements.slice(i, i + FIND.statementsPerBatch));
  return true;
}

/** Rows no live head needs any more: an old version, a pack that went. A pack that comes back is written again. */
async function clearStale(env: Env) {
  const stale = await env.DB.prepare(
    `SELECT DISTINCT e.item_id, e.version FROM find_entries e LEFT JOIN items i ON i.id = e.item_id AND i.head_version = e.version AND i.state = 'live' WHERE i.id IS NULL LIMIT 20`,
  ).all<{ item_id: string; version: string }>();
  for (const { item_id, version } of stale.results) {
    await env.DB.batch([env.DB.prepare("DELETE FROM find_terms WHERE item_id = ? AND version = ?").bind(item_id, version), env.DB.prepare("DELETE FROM find_entries WHERE item_id = ? AND version = ?").bind(item_id, version)]);
  }
  return stale.results.length;
}

/** One pass: writes up to `limit` packs that have no rows yet, or rows from before this format (a language's, if it's named), and clears what's stale. Safe to run twice at once: both write the same rows. */
export async function indexMissing(env: Env, { language, limit = 4 }: { language?: string; limit?: number } = {}) {
  const missing = await (language ? env.DB.prepare(`${missingSql} AND i.language = ? LIMIT ?`).bind(language, limit) : env.DB.prepare(`${missingSql} LIMIT ?`).bind(limit)).all<Missing>();
  let written = 0;
  for (const row of missing.results) if (await writeRows(env, row)) written++;
  return { written, cleared: await clearStale(env) };
}

type Hit = { item_id: string; version: string; n: number; term: string; taught: number | null };

/** Which packs of a language hold what was typed: those with the most of its words first, then those that teach them, each with what shows it. */
export async function findPacks(env: Env, text: unknown, language: unknown) {
  if (typeof text !== "string" || !text.trim()) throw new LibraryError("Type something to look for.");
  if (typeof language !== "string" || !Object.hasOwn(LANGUAGES, language) || language === "en") throw new LibraryError("Say which language to look in.");
  if (text.length > FIND.queryChars) throw new LibraryError(`That's over ${FIND.queryChars} characters: look for a word or a sentence.`);
  const terms = [...new Set(termsOf(text, language, separatorOf(language)))].slice(0, FIND.terms);
  if (!terms.length) return { packs: [], indexing: false };
  const asked = await env.DB.batch(
    terms.map((term) =>
      env.DB.prepare(
        // What teaches the word first, so a common word's many sentences don't crowd out the packs written for it; rows from before taught next.
        `SELECT t.term, t.item_id, t.version, t.n, t.taught FROM find_terms t JOIN items i ON i.id = t.item_id AND i.head_version = t.version AND i.state = 'live' WHERE t.language = ? AND t.term = ? ORDER BY coalesce(t.taught, 0.5) DESC LIMIT ?`,
      ).bind(language, term, FIND.rowsPerTerm),
    ),
  );
  const hits = asked.flatMap((result) => (result.results ?? []) as Hit[]);
  type Found = { version: string; terms: Set<string>; byEntry: Map<number, Set<string>>; taught: Set<string>; taughtAt: Set<number>; unknown: boolean };
  const byPack = new Map<string, Found>();
  for (const hit of hits) {
    const pack = byPack.get(hit.item_id) ?? { version: hit.version, terms: new Set<string>(), byEntry: new Map<number, Set<string>>(), taught: new Set<string>(), taughtAt: new Set<number>(), unknown: false };
    pack.terms.add(hit.term);
    pack.byEntry.set(hit.n, (pack.byEntry.get(hit.n) ?? new Set<string>()).add(hit.term));
    if (hit.taught === 1) {
      pack.taught.add(hit.term);
      pack.taughtAt.add(hit.n);
    } else if (hit.taught === null) pack.unknown = true;
    byPack.set(hit.item_id, pack);
  }
  // What holds the most of the words first; then what teaches the most of them (a pack written for koffie before one that only says it, and one
  // not yet known between the two); then what holds them in the most of its sentences and words (a pack about coffee before one whose word list
  // only has koffie); then by id, so it's the same each time.
  const teaching = (pack: Found) => pack.taught.size * 2 + (pack.unknown ? 1 : 0);
  const chosen = [...byPack.entries()]
    .sort((a, b) => b[1].terms.size - a[1].terms.size || teaching(b[1]) - teaching(a[1]) || b[1].byEntry.size - a[1].byEntry.size || a[0].localeCompare(b[0]))
    .slice(0, FIND.packs);
  const facts = chosen.length
    ? await env.DB.prepare(`SELECT i.id, i.title, i.curated, i.licence, i.topics, i.cover, u.name AS owner_name FROM items i LEFT JOIN users u ON u.id = i.owner_id WHERE i.id IN (${chosen.map(() => "?").join(",")})`)
        .bind(...chosen.map(([id]) => id))
        .all<{ id: string; title: string; curated: number; licence: string | null; topics: string; cover: string | null; owner_name: string | null }>()
    : { results: [] };
  const packs = [];
  for (const [id, pack] of chosen) {
    const fact = facts.results.find((row) => row.id === id);
    if (!fact) continue;
    // What holds the most of the words comes first, then what was written for them; a few more than are shown, as some are words and some sentences.
    const best = [...pack.byEntry.entries()]
      .sort((a, b) => b[1].size - a[1].size || Number(pack.taughtAt.has(b[0])) - Number(pack.taughtAt.has(a[0])) || a[0] - b[0])
      .slice(0, 12)
      .map(([n]) => n);
    const rows = await env.DB.prepare(`SELECT n, body FROM find_entries WHERE item_id = ? AND version = ? AND n IN (${best.map(() => "?").join(",")})`).bind(id, pack.version, ...best).all<{ n: number; body: string }>();
    const bodies = new Map(rows.results.map((row) => [row.n, JSON.parse(row.body) as { t?: string; m?: string; l?: string[]; w?: string; g?: string }]));
    const inOrder = best.map((n) => bodies.get(n)).filter((body): body is NonNullable<typeof body> => Boolean(body));
    packs.push({
      id,
      name: fact.title,
      credit: fact.curated ? "Lexicommons" : `Shared in Explore by ${fact.owner_name ?? "a former member"}`,
      kind: fact.curated ? "library" : "shared",
      ...(fact.licence ? { license: fact.licence } : {}),
      // What its cover is drawn from (explore.js packCover): its topics' ids, and the drawing a learner picked.
      topics: JSON.parse(fact.topics) as string[],
      ...(fact.cover ? { cover: fact.cover } : {}),
      matched: pack.terms.size,
      of: terms.length,
      // Whether it teaches what was typed (a sentence or an item written for one of its words), or only says it; left out while that isn't known yet.
      ...(pack.taught.size ? { teaches: true } : pack.unknown ? {} : { teaches: false }),
      sentences: inOrder.filter((body) => body.t).slice(0, FIND.sentencesPerPack).map((body) => ({ text: body.t, ...(body.m ? { means: body.m } : {}), ...(body.l ? { literal: body.l } : {}) })),
      words: inOrder.filter((body) => body.w).slice(0, FIND.wordsPerPack).map((body) => ({ lemma: body.w, gloss: body.g })),
    });
  }
  const left = await env.DB.prepare(`${missingSql} AND i.language = ? LIMIT 1`).bind(language).first();
  return { packs, indexing: Boolean(left) };
}
