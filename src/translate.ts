// Translate, online (GET /api/translate and /api/translate/languages; the device merges it after its own,
// public/js/translate/translate.js): the same engine (public/js/translate/engine.js) over what Lexicommons has for
// everyone: Lexicommons' own packs (the catalog's, its source of truth), Explore's live shared packs (at their head
// version), and the open library's books with a layer joining their language and English. Only packs explained in
// English (from "en"): the engine reads a pack's other side as English. Never anyone's own packs or texts: those live
// on their devices.
//
// Each isolate builds a language's index when it's first asked for, and keeps it (TRANSLATE_SERVER.languages languages,
// keptBytes of sources in all) while what it was built from stays the same: which packs and books, at which versions, credited
// to whom. That's checked at most every TRANSLATE_SERVER.fresh ms. Sources are read in order (Lexicommons' own, then the most
// popular shared packs, then the shelf's books) until a budget is spent; the rest aren't searched.
//
// On this traffic an isolate rarely outlives a minute's quiet (measured on live, 4 Nov 2026), so nearly every first search builds
// again: 1.3 to 2.9 s at seven word bands, and 72 MB of a 128 MB isolate. So the server reads only the first of a language's
// default packs (ownDefaults) and its opt-in ones. Every device has the default packs a moment after a first open and searches them
// itself, so the rest would only slow every cold start; a result names them in notSearched, so a device without them never
// says a word isn't in Lexicommons.

import { upgradePack } from "../public/js/study/pack-format.js";
import type { Env } from "./env";
import { LANGUAGES } from "../public/js/lang/index.js";
import { bookSource, buildIndex, search } from "../public/js/translate/engine.js";
import { packKey as packKeyJs, packRefs as packRefsJs } from "../public/js/study/pack-format.js";
import { LibraryError } from "./library";

export const TRANSLATE_SERVER = {
  ownDefaults: 3, // Lexicommons' default packs read for a language, in the catalog's order (a starter and the first word bands)
  packs: 300, // shared packs considered, most popular first (after Lexicommons' own)
  books: 60, // books with a layer considered, in the shelf's order
  bytes: 8_000_000, // pack, book and layer files read for one language, all told
  items: 30_000, // pack sentences
  entries: 60_000, // pack glossary words and phrases
  sentences: 30_000, // book sentences
  languages: 3, // indexes kept per isolate; the one used longest ago goes
  keptBytes: 12_000_000, // the files those indexes were built from, all told (an index costs about 8× its files in memory, of 128 MB)
  fresh: 30_000, // ms between checks that what an index was built from is unchanged
  fetches: 8, // library files read at once
};

// study/pack-format.js, typed as it's called here (it's plain JS).
const packKey = packKeyJs as unknown as (id: string, version: string) => string;
const packRefs = packRefsJs as unknown as (catalogue: unknown, language: string) => { id: string; version: string }[];

type Index = ReturnType<typeof buildIndex>;
/** An index with what it was built from: bytes read, the default packs left to the devices, whether a budget stopped it. */
interface Built {
  index: Index;
  bytes: number;
  notSearched: string[];
  partial: boolean;
}
type Result = NonNullable<ReturnType<typeof search>>;
interface Catalogue {
  books?: { id: string; version: string; lang: string; book: string; layers?: Record<string, { kind: string; url: string }> }[];
  packs?: Record<string, unknown[]>;
}
interface PackRow {
  id: string;
  head_version: string;
  licence: string;
  owner_name: string | null;
  r2_key: string;
}
type PackFile = { name: string; language: string; from: string; items?: unknown[]; words?: Record<string, unknown>; chunks?: Record<string, unknown> };
interface PackRef {
  id: string;
  key: string;
  credit: string;
  license: string | null;
}
interface BookRef {
  book: string;
  layer: string;
}
interface Selection {
  key: string;
  packs: PackRef[];
  books: BookRef[];
  /** Lexicommons' default packs that aren't read: on every device soon after a first open. */
  notSearched: string[];
}

const isLanguage = (code: unknown): code is string => typeof code === "string" && Object.hasOwn(LANGUAGES, code);
const libraryKey = (url: string) => url.replace(/^\/library\//, "");
const parse = <T>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

// The catalog, read again only when its etag changes.
let catalogueKept: { etag: string; catalogue: Catalogue } | null = null;
async function catalogueNow(env: Env): Promise<Catalogue> {
  const head = await env.LIBRARY.head("catalogue.json");
  if (!head) return {};
  if (catalogueKept?.etag === head.etag) return catalogueKept.catalogue;
  const object = await env.LIBRARY.get("catalogue.json");
  const catalogue = object ? (parse<Catalogue>(await object.text()) ?? {}) : {};
  catalogueKept = { etag: object?.etag ?? head.etag, catalogue };
  return catalogue;
}

/** The library's books with a layer joining a language and English, in the shelf's order. */
const layeredBooks = (catalogue: Catalogue, language: string): BookRef[] =>
  (catalogue.books ?? []).flatMap((entry) => {
    const layer = entry.lang === language && language !== "en" ? entry.layers?.en : entry.lang === "en" ? entry.layers?.[language] : undefined;
    const fits = layer && (entry.lang === "en" ? layer.kind === "weave" : layer.kind === "help");
    return fits ? [{ book: libraryKey(entry.book), layer: libraryKey(layer.url) }] : [];
  });

/** What a language's index is built from: its key names every source, its version and its credit. */
async function selection(env: Env, language: string): Promise<Selection> {
  const [catalogue, rows] = await Promise.all([
    catalogueNow(env),
    env.DB.prepare(
      `SELECT i.id, i.head_version, i.licence, u.name AS owner_name, v.r2_key FROM items i
       JOIN item_versions v ON v.item_id = i.id AND v.version = i.head_version
       LEFT JOIN users u ON u.id = i.owner_id
       WHERE i.kind = 'pack' AND i.curated = 0 AND i.state = 'live' AND i.language = ? AND i.from_lang = 'en'
       ORDER BY i.popular DESC, i.created_at DESC, i.id LIMIT ?`,
    )
      .bind(language, TRANSLATE_SERVER.packs)
      .all<PackRow>(),
  ]);
  const refs = packRefs(catalogue, language) as { id: string; version: string; optIn?: boolean }[];
  const defaults = refs.filter((ref) => !ref.optIn);
  const read = new Set(defaults.slice(0, TRANSLATE_SERVER.ownDefaults).map((ref) => ref.id));
  const notSearched = defaults.filter((ref) => !read.has(ref.id)).map((ref) => ref.id);
  const own: PackRef[] = refs.filter((ref) => ref.optIn || read.has(ref.id)).map((ref) => ({ id: ref.id, key: packKey(ref.id, ref.version), credit: "Lexicommons", license: null }));
  const shared: PackRef[] = rows.results
    .filter((row) => !refs.some((o) => o.id === row.id))
    .map((row) => ({ id: row.id, key: row.r2_key, credit: `Shared in Explore by ${row.owner_name ?? "a former member"}`, license: row.licence }));
  const packs = [...own, ...shared];
  const books = layeredBooks(catalogue, language).slice(0, TRANSLATE_SERVER.books);
  return { key: JSON.stringify([packs.map((p) => [p.key, p.credit, p.license]), books.map((b) => [b.book, b.layer]), notSearched]), packs, books, notSearched };
}

/** Reads library files in batches, in order, until the byte budget is spent; each comes back parsed (or null). */
async function readInOrder<T>(env: Env, keys: string[][], spent: { bytes: number }, use: (files: (unknown | null)[], at: number) => boolean) {
  for (let i = 0; i < keys.length; i += TRANSLATE_SERVER.fetches) {
    const batch = keys.slice(i, i + TRANSLATE_SERVER.fetches);
    const objects = await Promise.all(batch.map((group) => Promise.all(group.map((key) => env.LIBRARY.get(key)))));
    let stop = false;
    for (const [j, group] of objects.entries()) {
      const size = group.reduce((sum, object) => sum + (object?.size ?? 0), 0);
      if (stop || spent.bytes + size > TRANSLATE_SERVER.bytes) {
        stop = true;
        for (const object of group) await object?.body.cancel();
        continue;
      }
      spent.bytes += size;
      const files = await Promise.all(group.map(async (object) => (object ? parse<T>(await object.text()) : null)));
      if (!use(files, i + j)) stop = true;
    }
    if (stop) return;
  }
}

/** How a search's index came: for the response's Server-Timing, so a slow first search can be measured on live. */
export interface TranslateTiming {
  index?: "built" | "kept" | "waited";
  /** ms reading its files (a Worker's clock stands still while it computes: the build itself shows as the rest of the wait). */
  read?: number;
  bytes?: number;
  isolate?: string;
}
let isolateId = "";
/** The header's value: which isolate answered, whether it built its index, how long it read for and how much. */
export function serverTiming(timing: TranslateTiming): string {
  isolateId ||= crypto.randomUUID().slice(0, 8);
  return [
    `isolate;desc="${isolateId}"`,
    `index;desc="${timing.index ?? "none"}"`,
    ...(timing.read === undefined ? [] : [`read;dur=${timing.read}`]),
    ...(timing.bytes === undefined ? [] : [`bytes;desc="${timing.bytes}"`]),
  ].join(", ");
}

async function build(env: Env, language: string, chosen: Selection, timing?: TranslateTiming): Promise<Built> {
  const sources: unknown[] = [];
  const spent = { bytes: 0, items: 0, entries: 0, sentences: 0 };
  const started = Date.now();
  await readInOrder<PackFile>(env, chosen.packs.map((ref) => [ref.key]), spent, ([file], at) => {
    const pack = upgradePack(file) as PackFile | null;
    const ref = chosen.packs[at];
    if (!ref || !pack || pack.language !== language || pack.from !== "en" || !Array.isArray(pack.items)) return true;
    const entries = Object.keys(pack.words ?? {}).length + Object.keys(pack.chunks ?? {}).length;
    if (spent.items + pack.items.length > TRANSLATE_SERVER.items || spent.entries + entries > TRANSLATE_SERVER.entries) return false;
    spent.items += pack.items.length;
    spent.entries += entries;
    sources.push({ id: `pack:${ref.id}`, kind: "pack", name: pack.name, credit: ref.credit, ...(ref.license ? { license: ref.license } : {}), language, items: pack.items, words: pack.words, chunks: pack.chunks });
    return true;
  });
  await readInOrder(env, chosen.books.map((ref) => [ref.book, ref.layer]), spent, ([book, layer]) => {
    const source = book && layer ? bookSource(book, layer) : null;
    if (!source || source.language !== language) return true;
    if (spent.sentences + source.sentences.length > TRANSLATE_SERVER.sentences) return false;
    spent.sentences += source.sentences.length;
    sources.push(source);
    return true;
  });
  if (timing) {
    timing.read = Date.now() - started;
    timing.bytes = spent.bytes;
  }
  // A budget ran out before every source was read: what wasn't is named for the device as much as can be, and marked.
  const partial = sources.length < chosen.packs.length + chosen.books.length && (spent.bytes > 0.95 * TRANSLATE_SERVER.bytes || spent.items >= TRANSLATE_SERVER.items || spent.entries >= TRANSLATE_SERVER.entries || spent.sentences >= TRANSLATE_SERVER.sentences);
  return { index: buildIndex(sources), bytes: spent.bytes, notSearched: chosen.notSearched, partial };
}

// Per isolate: language → { key, checked, index, … }, the most recently used last; and the build under way for each.
type Kept = Built & { key: string; checked: number };
const indexes = new Map<string, Kept>();
const building = new Map<string, { key: string; promise: Promise<Built> }>();

function keep(language: string, entry: Kept) {
  indexes.delete(language);
  indexes.set(language, entry);
  const total = () => [...indexes.values()].reduce((sum, kept) => sum + kept.bytes, 0);
  while (indexes.size > 1 && (indexes.size > TRANSLATE_SERVER.languages || total() > TRANSLATE_SERVER.keptBytes)) indexes.delete(indexes.keys().next().value as string);
}

async function indexFor(env: Env, language: string, timing?: TranslateTiming): Promise<Built> {
  const kept = indexes.get(language);
  if (timing) timing.index = "kept";
  if (kept && timing) timing.bytes = kept.bytes;
  if (kept && Date.now() - kept.checked < TRANSLATE_SERVER.fresh) {
    keep(language, kept);
    return kept;
  }
  const chosen = await selection(env, language);
  if (kept?.key === chosen.key) {
    const again = { ...kept, checked: Date.now() };
    keep(language, again);
    return again;
  }
  const under = building.get(language);
  if (timing) timing.index = under?.key === chosen.key ? "waited" : "built";
  if (under?.key === chosen.key) return under.promise;
  // Only the newest build is kept: one started earlier that ends later never replaces it.
  const entry = { key: chosen.key, promise: null as unknown as Promise<Built> };
  entry.promise = build(env, language, chosen, timing)
    .then((built) => {
      if (building.get(language) === entry) keep(language, { ...built, key: chosen.key, checked: Date.now() });
      return built;
    })
    .finally(() => {
      if (building.get(language) === entry) building.delete(language);
    });
  building.set(language, entry);
  return entry.promise;
}

/** The languages Lexicommons has something for, online (English isn't listed: everything goes to or from it). */
export async function translateLanguages(env: Env): Promise<string[]> {
  const [rows, catalogue] = await Promise.all([
    env.DB.prepare("SELECT DISTINCT language FROM items WHERE kind = 'pack' AND curated = 0 AND state = 'live' AND from_lang = 'en'").all<{ language: string }>(),
    catalogueNow(env),
  ]);
  const codes = new Set(rows.results.map((r) => r.language));
  for (const code of Object.keys(LANGUAGES)) if (code !== "en" && (packRefs(catalogue, code).length || layeredBooks(catalogue, code).length)) codes.add(code);
  return [...codes].filter((code) => isLanguage(code) && code !== "en").sort();
}

/**
 * Translates text between English and a language: from and to are "en" and a language code, or both are left out and
 * language names the language (the direction is the one that finds more).
 */
export async function translateOnline(env: Env, text: string, { from, to, language }: { from?: unknown; to?: unknown; language?: unknown }, timing?: TranslateTiming): Promise<Result | null> {
  const between = "Translate goes between English and one language: from and to are \"en\" and a language code (or give language alone).";
  if (from === undefined && to === undefined) {
    if (!isLanguage(language) || language === "en") throw new LibraryError(between);
    return answer(await indexFor(env, language, timing), text, { language });
  }
  if (!isLanguage(from) || !isLanguage(to) || (from === "en") === (to === "en")) throw new LibraryError(between);
  return answer(await indexFor(env, from === "en" ? to : from, timing), text, { from, to });
}

/** A search, with what it left out: so a device knows what "found nothing" covers. */
function answer(built: Built, text: string, way: Parameters<typeof search>[2]) {
  const result = search(built.index, text, way);
  return result && { ...result, ...(built.notSearched.length ? { notSearched: built.notSearched } : {}), ...(built.partial ? { partial: true } : {}) };
}
