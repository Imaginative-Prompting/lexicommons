// What a local copy's open library holds (scripts/local.mjs), worked out from this repo with the same pure code an admin's publish runs
// (study/pack-format.js, study/pack-audio.js, lang/grammar.js, read/catalogue.js): packs/ and the starter inside the app,
// and library/ (its catalogue-seed.json names the books, the frequency list, the grammar and the shelf; the files beside it
// are at their keys, each checked against the hash in its name here).
//
// Explore's index comes from the Worker's own code too (src/community.ts syncLibraryIndex), run in Node on a scratch SQLite,
// and the rows it wrote are what goes to the copy's database.
//
// Which pack goes where: every default pack in packs/, by language. library/catalogue-seed.json's `seed` says Dutch's
// order, which packs are opt-in, which of those Explore may suggest (`suggest`: packs about one topic, as
// library_publish { opt_in: true, suggest: true } marks them) and which have recordings.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** A value as SQL, for an INSERT. */
export function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString("hex")}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

/**
 * The statements that make a database hold `after`, given it held `before`: rows by key, upserted so a row's children (a like, a
 * follow) survive where REPLACE would delete and cascade. tables: { name: { keys, columns } }; before, after: { name: rows }.
 */
export function rowChanges(tables, before, after) {
  const same = (a, b) => (a ?? null) === (b ?? null);
  const statements = [];
  for (const [table, { keys, columns }] of Object.entries(tables)) {
    const keyOf = (row) => JSON.stringify(keys.map((k) => row[k]));
    const old = new Map((before[table] ?? []).map((row) => [keyOf(row), row]));
    const next = new Map((after[table] ?? []).map((row) => [keyOf(row), row]));
    for (const [key, row] of next) {
      const was = old.get(key);
      if (was && columns.every((c) => same(was[c], row[c]))) continue;
      const set = columns.filter((c) => !keys.includes(c));
      const conflict = set.length ? `ON CONFLICT(${keys.join(", ")}) DO UPDATE SET ${set.map((c) => `${c} = excluded.${c}`).join(", ")}` : `ON CONFLICT(${keys.join(", ")}) DO NOTHING`;
      statements.push(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((c) => sqlValue(row[c])).join(", ")}) ${conflict};`);
    }
    for (const [key, row] of old) if (!next.has(key)) statements.push(`DELETE FROM ${table} WHERE ${keys.map((k) => `${k} = ${sqlValue(row[k])}`).join(" AND ")};`);
  }
  return statements;
}

/** A pack here against this repo's: new, the same, moved on since the last seed, or changed by this copy's own admin. */
export function mergeDecision(current, seed, lastSeeded) {
  if (!current) return "add";
  if (current === seed) return "same";
  if (lastSeeded === undefined || current === lastSeeded) return "update";
  return "theirs";
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const TYPES = { json: "application/json", jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp3: "audio/mpeg", m4a: "audio/mp4" };
const typeOf = (key) => TYPES[key.split(".").pop()] ?? (() => { throw new Error(`No type for ${key}`); })();

/** A file named by its hash must hold those bytes. A catalog read from this repo never names a file that isn't what it says. */
function checkNamed(key, bytes) {
  const named = /(?:^|[./])([0-9a-f]{12,16})\.[a-z0-9]+$/.exec(key)?.[1];
  // A book's version isn't a hash of its file; everything else named by hex is.
  if (named && !/^books\/[^/]+\/[0-9a-f]+\/book\.json$/.test(key) && !/^grammar\//.test(key) && !sha256(bytes).startsWith(named)) {
    throw new Error(`library/${key} doesn't match the hash in its name.`);
  }
}

/** Every default pack's order within a language: `order` as given, others by name, lessons last. */
export function orderPacks(ids, order = []) {
  const listed = order.filter((id) => ids.includes(id));
  const rest = ids.filter((id) => !listed.includes(id)).sort();
  const lessons = rest.filter((id) => id.startsWith("path-"));
  const others = rest.filter((id) => !id.startsWith("path-"));
  const lastIsPath = listed.length && listed[listed.length - 1].startsWith("path-");
  return lastIsPath ? [...listed.slice(0, -1), ...others, listed[listed.length - 1], ...lessons] : [...listed, ...others, ...lessons];
}

/**
 * The seed: { files: [{ key, type, path? | text? }], catalogue, versions: { packs: { id: version } } }. progress(message) is
 * told about each stage. Throws when anything in the repo doesn't pass its check: a copy never gets a library the app refuses.
 */
export async function buildSeed(app, progress = () => {}) {
  const js = (path) => import(pathToFileURL(join(app, path)).href);
  const { catalogueEntry, checkPack, defaultInstalled, packKey, packRefs, packText, packVersion, withPackEntry } = await js("public/js/study/pack-format.js");
  const { audioKey, audioText, audioUrl, audioVersion, checkAudio, clipKey, clipName, clipsOf, fromVersion1 } = await js("public/js/study/pack-audio.js");
  const { catalogueProblems, emptyCatalogue } = await js("public/js/read/catalogue.js");
  const { checkGrammar, checkGrammarMore, grammarEntry, grammarKey, grammarText, grammarVersion, keepsEveryId, moreRef, seedGrammar, useGrammar, withGrammarEntry } = await js("public/js/lang/grammar.js");
  const seed = JSON.parse(readFileSync(join(app, "library/catalogue-seed.json"), "utf8"));
  const files = [];
  const add = (key, entry) => files.push({ key, type: typeOf(key), ...entry });
  const fromLibrary = (url) => {
    const key = url.replace(/^\/library\//, "");
    const path = join(app, "library", key);
    if (!existsSync(path)) throw new Error(`The catalog names ${key}, which isn't in library/.`);
    checkNamed(key, readFileSync(path));
    add(key, { path });
    return path;
  };
  let catalogue = { ...emptyCatalogue(), books: seed.books, lists: seed.lists, ...(seed.shelf ? { shelf: seed.shelf } : {}) };

  // The frequency lists and books, as they are: named by content, checked against the names.
  for (const list of Object.values(seed.lists.frequency ?? {})) fromLibrary(list.url);
  for (const book of seed.books) {
    const parsed = JSON.parse(readFileSync(fromLibrary(book.book), "utf8"));
    if (parsed.version !== book.version || parsed.id !== book.id) throw new Error(`library/: ${book.id}'s file isn't version ${book.version}.`);
    for (const layer of Object.values(book.layers ?? {})) fromLibrary(layer.url);
    for (const picture of parsed.pictures ?? []) fromLibrary(`/library/pictures/${picture.file}`);
  }

  // Each pack's notes: checked by themselves here (their sentences are checked when an admin publishes them).
  const { checkNotes, notesText, notesVersion, withNotesEntry, notesUrl } = await js("public/js/study/pack-notes.js");
  for (const [id, entry] of Object.entries(seed.notes ?? {})) {
    const checked = checkNotes(JSON.parse(readFileSync(fromLibrary(entry.url), "utf8")));
    if (!checked.notes || checked.notes.pack !== id) throw new Error(`library/: ${id}'s notes are refused: ${checked.errors.map((e) => e.message).join(" ")}`);
    const version = await notesVersion(checked.notes);
    if (version !== entry.version || notesUrl(id, version) !== entry.url) throw new Error(`library/: ${id}'s notes aren't version ${entry.version}.`);
    catalogue = withNotesEntry(catalogue, id, { version, url: entry.url, sentences: Object.keys(checked.notes.items).length });
    if (notesText(checked.notes).length < 2) throw new Error("Empty notes.");
  }

  // The grammar first, so a pack using a pattern from a later revision passes.
  for (const [lang, entry] of Object.entries(seed.grammar ?? {})) {
    const path = fromLibrary(entry.url);
    const checked = checkGrammar(JSON.parse(readFileSync(path, "utf8")));
    if (!checked.grammar) throw new Error(`library/: ${lang}'s grammar is refused: ${checked.errors.map((e) => e.message).join(" ")}`);
    if (!keepsEveryId(seedGrammar(lang), checked.grammar)) throw new Error(`library/: ${lang}'s grammar leaves out patterns the app has.`);
    const version = await grammarVersion(checked.grammar);
    if (version !== entry.version || grammarKey(lang, version) !== entry.url.replace(/^\/library\//, "")) throw new Error(`library/: ${lang}'s grammar isn't version ${entry.version}.`);
    useGrammar(checked.grammar, version);
    // What's longer about its patterns, checked against it, named by its own hash.
    let more;
    if (entry.more) {
      const text = readFileSync(fromLibrary(entry.more.url), "utf8");
      const kept = checkGrammarMore(JSON.parse(text), checked.grammar);
      if (!kept.more) throw new Error(`library/: ${lang}'s longer file is refused: ${kept.errors.map((e) => e.message).join(" ")}`);
      if (sha256(Buffer.from(JSON.stringify(kept.more))).slice(0, 12) !== entry.more.version || moreRef(lang, entry.more.version).url !== entry.more.url) throw new Error(`library/: ${lang}'s longer file isn't version ${entry.more.version}.`);
      more = entry.more;
    }
    catalogue = withGrammarEntry(catalogue, lang, grammarEntry(checked.grammar, version, more));
    if (grammarText(checked.grammar).length < 2) throw new Error("An empty grammar.");
  }

  // The packs.
  const sources = new Map();
  for (const file of readdirSync(join(app, "packs")).filter((f) => f.endsWith(".json")).sort()) {
    const raw = JSON.parse(readFileSync(join(app, "packs", file), "utf8"));
    sources.set(raw.id, raw);
  }
  for (const [id, path] of Object.entries(seed.seed?.inApp ?? {})) {
    const module = await js(path);
    sources.set(id, Object.values(module).find((v) => v?.format === "lexicommons-pack"));
  }
  const byLanguage = new Map();
  for (const [id, raw] of sources) byLanguage.set(raw.language, [...(byLanguage.get(raw.language) ?? []), id]);
  const parsed = new Map();
  const fetchPack = async (ref) => parsed.get(`${ref.id}@${ref.version}`) ?? null;
  const versions = {};
  let done = 0;
  for (const [language, ids] of [...byLanguage].sort(([a], [b]) => (a < b ? -1 : 1))) {
    for (const id of orderPacks(ids, seed.seed?.order?.[language])) {
      const installed = await defaultInstalled(catalogue, language, fetchPack, id);
      const { pack, errors } = checkPack(sources.get(id), { installed });
      if (!pack) throw new Error(`${id} is refused: ${errors.slice(0, 3).map((e) => `${e.at}: ${e.message}`).join("; ")}`);
      const version = await packVersion(pack);
      parsed.set(`${id}@${version}`, pack);
      add(packKey(id, version), { text: packText(pack) });
      versions[id] = version;
      let audio;
      const recordings = seed.seed?.audio?.[id];
      if (recordings) {
        const folder = join(app, recordings.folder);
        const clips = new Map();
        const v2 = fromVersion1(JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")), (src) => {
          const name = clipName(sha256(readFileSync(join(folder, src))), src.endsWith(".m4a") ? "m4a" : "mp3");
          clips.set(name, join(folder, src));
          return name;
        });
        for (const voice of Object.values(v2.voices)) {
          voice.license = recordings.license;
          voice.credit = recordings.credit.replaceAll("{name}", voice.name);
        }
        const checked = checkAudio(v2, pack, { forLibrary: true });
        if (!checked.audio) throw new Error(`${id}'s recordings are refused: ${checked.errors.slice(0, 3).map((e) => e.message).join(" ")}`);
        for (const clip of clipsOf(checked.audio)) add(clipKey(clip), { path: clips.get(clip) });
        const audioV = await audioVersion(checked.audio);
        add(audioKey(id, version, audioV), { text: audioText(checked.audio) });
        audio = audioUrl(id, version, audioV);
      }
      const optIn = (seed.seed?.optIn ?? []).includes(id);
      const suggest = optIn && (seed.seed?.suggest ?? []).includes(id);
      catalogue = withPackEntry(catalogue, language, catalogueEntry(pack, version, { ...(audio ? { audio } : {}), optIn, suggest }));
      if (++done % 20 === 0) progress(`  checked ${done} of ${sources.size} packs`);
    }
  }
  const problems = catalogueProblems(catalogue);
  if (problems.length) throw new Error(`The catalog this makes isn't valid:\n  ${problems.join("\n  ")}`);
  if (packRefs(catalogue, "nl").length === 0) throw new Error("No Dutch packs: the repo's packs/ looks empty.");
  // A key named twice (a picture two books share) goes once.
  const unique = [...new Map(files.map((f) => [f.key, f])).values()];
  return { files: unique, catalogue, versions: { packs: versions } };
}

/**
 * What a copy's catalog becomes: this repo's where it's new or its version moved on, what this copy's admin
 * published where they changed it. Keys this doesn't own stay. Returns { catalogue, kept: [what stayed theirs], changed }.
 */
export async function mergeCatalogue(app, current, seed, lastSeeded = {}) {
  const js = (path) => import(pathToFileURL(join(app, path)).href);
  const { packRefs, withPackEntry } = await js("public/js/study/pack-format.js");
  const { withGrammarEntry } = await js("public/js/lang/grammar.js");
  if (!current) return { catalogue: seed.catalogue, kept: [], changed: Object.keys(seed.versions.packs).length };
  let catalogue = current;
  const kept = [];
  let changed = 0;
  for (const language of Object.keys(seed.catalogue.packs ?? {})) {
    for (const ref of packRefs(seed.catalogue, language)) {
      const now = packRefs(catalogue, language).find((r) => r.id === ref.id);
      const decision = mergeDecision(now?.version, ref.version, lastSeeded.packs?.[ref.id]);
      if (decision === "theirs") kept.push(ref.id);
      else if (decision !== "same") {
        catalogue = withPackEntry(catalogue, language, ref);
        changed++;
      }
    }
  }
  for (const [id, entry] of Object.entries(seed.catalogue.notes ?? {})) {
    if (catalogue.notes?.[id]?.version !== entry.version) {
      catalogue = { ...catalogue, notes: { ...catalogue.notes, [id]: entry } };
      changed++;
    }
  }
  for (const [lang, entry] of Object.entries(seed.catalogue.grammar ?? {})) {
    const now = catalogue.grammar?.[lang];
    if (!now || now.revision < entry.revision) {
      catalogue = withGrammarEntry(catalogue, lang, entry);
      changed++;
    }
  }
  for (const [lang, list] of Object.entries(seed.catalogue.lists?.frequency ?? {})) {
    const now = catalogue.lists?.frequency?.[lang];
    if (!now || now.lemmas < list.lemmas) {
      catalogue = { ...catalogue, lists: { ...catalogue.lists, frequency: { ...catalogue.lists?.frequency, [lang]: list } } };
      changed++;
    }
  }
  const books = new Map((catalogue.books ?? []).map((b) => [b.id, b]));
  for (const book of seed.catalogue.books ?? []) {
    if (!books.has(book.id)) {
      books.set(book.id, book);
      changed++;
    }
  }
  catalogue = { ...catalogue, books: [...books.values()].sort((a, b) => (a.title < b.title ? -1 : 1)) };
  if (!catalogue.shelf && seed.catalogue.shelf) catalogue = { ...catalogue, shelf: seed.catalogue.shelf };
  return { catalogue, kept, changed };
}

// Tables Explore's index may touch. library_index isn't one: the Worker keeps it (its rev is the catalog's revision there).
const LOADED = {
  items: "SELECT * FROM items WHERE curated = 1",
  item_versions: "SELECT * FROM item_versions WHERE item_id IN (SELECT id FROM items WHERE curated = 1)",
  corrections: "SELECT * FROM corrections WHERE item_id IN (SELECT id FROM items WHERE curated = 1)",
  explore_topics: "SELECT * FROM explore_topics",
};
export const INDEX_READS = LOADED;

/**
 * The SQL that brings a copy's Explore index in line with a catalog, from the Worker's own sync run here. read(sql)
 * answers a SELECT on the copy, for what it holds now; readFile(key) a library file on it, for a version replaced.
 * Returns statements (possibly none).
 */
export async function indexStatements(app, catalogue, files, read, readFile) {
  const { workerEnv } = await import(pathToFileURL(join(app, "scripts/fixtures/worker-env.mjs")).href);
  const { env, sqlite } = workerEnv();
  const tables = {};
  for (const { name } of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('library_index', 'd1_migrations')").all()) {
    const info = sqlite.prepare(`PRAGMA table_info(${name})`).all();
    const keys = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
    if (keys.length) tables[name] = { keys, columns: info.map((c) => c.name) };
  }
  const dump = () => Object.fromEntries(Object.keys(tables).map((t) => [t, sqlite.prepare(`SELECT * FROM ${t}`).all().map((r) => ({ ...r }))]));
  sqlite.exec("PRAGMA foreign_keys = OFF");
  for (const [table, sql] of Object.entries(LOADED)) {
    const rows = await read(sql);
    for (const row of rows) {
      const columns = Object.keys(row);
      sqlite.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...columns.map((c) => row[c]));
    }
  }
  const before = dump();
  for (const file of files) {
    if (!file.key.startsWith("packs/")) continue;
    await env.LIBRARY.put(file.key, file.text ?? readFileSync(file.path));
  }
  await env.LIBRARY.put("catalogue.json", JSON.stringify(catalogue));
  // A version the copy holds and this repo no longer names, read from the copy: its history stays right.
  const known = new Set(files.map((f) => f.key));
  for (const row of before.items ?? []) {
    const key = `packs/${row.id}/${row.head_version}/pack.json`;
    if (known.has(key)) continue;
    const text = await readFile(key);
    if (text) await env.LIBRARY.put(key, text);
  }
  const { syncLibraryIndex } = await import(pathToFileURL(join(app, "src/community.ts")).href);
  await syncLibraryIndex(env, catalogue, "self-host", 1);
  return rowChanges(tables, before, dump());
}
