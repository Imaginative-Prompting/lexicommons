// The rules scripts/local.mjs lives by, with no server: it can only reach this computer's storage, row changes keep a row's
// children, the merge keeps what a copy's admin changed, and this repo's library passes the app's own checks.
// Usage: node scripts/test-local-copy.mjs   (exit 0 = pass)
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeed, indexStatements, mergeCatalogue, mergeDecision, orderPacks, rowChanges, sqlValue } from "./local/seed.mjs";

process.removeAllListeners("warning");
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
const eq = (actual, want, what) => {
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `: got ${JSON.stringify(actual)}, want ${JSON.stringify(want)}`}`);
};

// It only ever reaches this computer's storage. Every call that touches stored data goes through local(), with --local.
const code = ["scripts/local.mjs", "scripts/local/seed.mjs"].map((file) => readFileSync(join(APP, file), "utf8")).join("\n");
const tool = readFileSync(join(APP, "scripts/local.mjs"), "utf8");
eq(/--remote|\bdeploy\b|\bsecret\b|CLOUDFLARE_|whoami/.test(code), false, "no remote flag, deploy, secret or account in the tool");
eq(tool.includes(`wrangler([...args, "--local", "--persist-to", STATE]`), true, "local() always passes --local and this copy's folder");
const direct = [...tool.matchAll(/\bwrangler\(\[\s*"([a-z0-9]+)"/g)].map((m) => m[1]);
eq(direct, [], "no wrangler call around local() (a server starts through its own spawn)");
eq([...tool.matchAll(/local\(\[\s*"([a-z0-9]+)"/g)].every((m) => ["d1", "r2"].includes(m[1])), true, "local() only ever does d1 and r2");
eq(tool.includes(`"dev", "--port"`) && (tool.match(/spawn\(WRANGLER/g) ?? []).length === 2, true, "the only other wrangler use is dev, its two ways of starting");
eq(tool.includes('ps.stdout.includes(STATE)'), true, "it stops only a process that's this copy's");

// Row changes.
const tables = { items: { keys: ["id"], columns: ["id", "title", "n"] } };
eq(rowChanges(tables, { items: [{ id: "a", title: "same", n: 1 }] }, { items: [{ id: "a", title: "same", n: 1 }] }), [], "nothing changed, nothing to do");
const upsert = rowChanges(tables, { items: [] }, { items: [{ id: "a", title: "it's", n: 1 }] })[0];
eq(upsert.includes("'it''s'"), true, "a quote in a value is escaped");
eq(upsert.includes("ON CONFLICT(id) DO UPDATE"), true, "an upsert, so a row's children survive");
eq(/REPLACE/.test(upsert), false, "never REPLACE, which would delete and cascade");
eq(rowChanges(tables, { items: [{ id: "a", title: "x", n: 1 }] }, { items: [] }), ["DELETE FROM items WHERE id = 'a';"], "a row gone is deleted");
eq([sqlValue(null), sqlValue(3), sqlValue("x")], ["NULL", "3", "'x'"], "values as SQL");

// The merge.
eq(mergeDecision(undefined, "v2", "v1"), "add", "new here: added");
eq(mergeDecision("v2", "v2", "v1"), "same", "the same: nothing");
eq(mergeDecision("v1", "v2", "v1"), "update", "what the last seed put: updated");
eq(mergeDecision("mine", "v2", "v1"), "theirs", "what the copy's admin changed: kept");
eq(orderPacks(["path-nl", "words-nl-09", "starter", "words-nl-01"], ["starter", "words-nl-01", "path-nl"]), ["starter", "words-nl-01", "words-nl-09", "path-nl"], "a new band goes before the lessons");

// This repo's library: every file checked against its name, every pack against the app's own check.
const seed = await buildSeed(APP);
eq(seed.catalogue.packs.nl[0].id, "starter-word-order", "Dutch starts with the starter");
eq(seed.catalogue.packs.nl.at(-1).id, "path-nl", "and ends with the lessons");
eq(seed.catalogue.packs.nl.some((p) => p.id === "words-nl-strong" && p.optIn === true), true, "strong language stays opt-in");
eq(seed.catalogue.packs.nl.some((p) => p.id === "words-nl-strong" && !("suggest" in p)), true, "and is never suggested");
// Dutch's category packs (packs/nl-<topic>-<n>.json): opt-in, and suggested in Explore, as the catalog lists them.
const categoryFiles = readdirSync(join(APP, "packs")).filter((f) => /^nl-[a-z]+-\d+\.json$/.test(f)).map((f) => f.slice(0, -5));
const categories = seed.catalogue.packs.nl.filter((p) => categoryFiles.includes(p.id));
eq(categoryFiles.length > 0 && categories.length === categoryFiles.length, true, "every category pack in the catalog");
eq(categories.filter((p) => !(p.optIn === true && p.suggest === true)).map((p) => p.id), [], "each opt-in and suggested");
eq(Boolean(seed.catalogue.packs.nl[0].audio), true, "the starter has its recordings");
eq(seed.catalogue.books.length >= 3, true, "the books");
eq(Boolean(seed.catalogue.lists.frequency.nl), true, "the frequency list");
eq(Boolean(seed.catalogue.grammar.nl), true, "the grammar");
eq(new Set(seed.files.map((f) => f.key)).size, seed.files.length, "every key once");
eq(seed.files.filter((f) => f.path && !f.path.startsWith(APP)).length, 0, "only files from this repo");

const sql = await indexStatements(APP, seed.catalogue, seed.files, async () => [], async () => null);
eq(sql.filter((s) => s.startsWith("INSERT INTO items ")).length, Object.values(seed.catalogue.packs).flat().length, "Explore's index: a row per pack");
eq(sql.some((s) => /library_index/.test(s)), false, "the Worker keeps library_index");

// A second run on the same state changes nothing; a copy's own pack stays.
eq((await mergeCatalogue(APP, seed.catalogue, seed, seed.versions)).changed, 0, "merging the same library again changes nothing");
const refs = seed.catalogue.packs.es.map((p) => ({ ...p, version: "aaaaaaaaaaaa", url: p.url.replace(p.version, "aaaaaaaaaaaa") }));
const merged = await mergeCatalogue(APP, { ...seed.catalogue, packs: { ...seed.catalogue.packs, es: refs } }, seed, seed.versions);
eq(merged.kept, refs.map((p) => p.id), "a pack the copy's admin changed stays theirs (every Spanish one here: the starter and the lessons)");
eq(merged.catalogue.packs.es[0].version, "aaaaaaaaaaaa", "and keeps its version");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
