// Finding a pack from what you typed (src/find.ts), on the real migrations in Node's SQLite (fixtures/worker-env.mjs): what's filed, what's found, what never is, what it costs. Run:
// `node scripts/test-find.mjs` (exit 0 = pass).

// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
env.COMMUNITY_SHARING = "everyone";
const community = await import(join(APP, "src/community.ts"));
const moderation = await import(join(APP, "src/moderation.ts"));
const { findPacks, indexMissing, FIND } = await import(join(APP, "src/find.ts"));
const { findRows, termsOf, meaningOf } = await import(join(APP, "src/find-rows.ts"));

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.stack ?? error}`);
  }
}
const ok = (value, message = "expected true") => {
  if (!value) throw new Error(message);
};
const same = (a, b, message = "") => ok(JSON.stringify(a) === JSON.stringify(b), `${message} ${JSON.stringify(a)} is not ${JSON.stringify(b)}`);

const OWNER = "user-owner";
const OTHER = "user-other";
for (const [id, name] of [[OWNER, "Owner"], [OTHER, "Other"]]) sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, name, Date.now() - 90 * 86_400_000);
await community.acceptTerms(env, OWNER, community.SHARING_TERMS_VERSION);

const sentence = (id, text, lemmas, means, literal = text.split(" ").map((w) => [w])) => {
  const words = text.replace(/[.?!]$/, "").split(" ").map((word) => [word, lemmas[word] ?? word.toLowerCase()]);
  return { id, concepts: ["v2"], text, means, words, punct: text.match(/[.?!]$/)?.[0] ?? "", literal, english: null, moved: [], wrong: [`${text} nee`], gap: { index: words.length - 1, options: [words.at(-1)[0], "iets"] } };
};
const packOf = (id, name, items, words) => ({ format: "lexicommons-pack", version: 2, id, name, about: "For a check.", language: "nl", from: "en", topics: {}, words, chunks: {}, patterns: {}, items });
const WORDS = { ik: "I", willen: "to want", graag: "gladly; with pleasure", koffie: "coffee", thee: "tea", drinken: "to drink" };
const COFFEE = packOf("coffee-talk", "Coffee talk", [
  sentence("wil-koffie", "Ik wil graag koffie.", { Ik: "ik", wil: "willen", graag: "graag", koffie: "koffie" }, "I'd like coffee."),
  sentence("drink-thee", "Ik drink graag thee.", { Ik: "ik", drink: "drinken", graag: "graag", thee: "thee" }, "I like drinking tea."),
], WORDS);
const DOGS = packOf("dog-walks", "Dog walks", [sentence("hond-loopt", "De hond loopt op straat.", { De: "de", hond: "hond", loopt: "lopen", op: "op", straat: "straat" }, "The dog is walking in the street.")], { hond: "dog", lopen: "to walk", straat: "street", de: "the", op: "on" });
const share = (pack) => community.sharePack(env, { userId: OWNER, via: "app" }, { pack, title: pack.name, about: pack.about, topics: [] });
const find = (q, language = "nl") => findPacks(env, q, language);
const ids = (found) => found.packs.map((pack) => pack.id);

let coffee;
let dogs;
await test("a pack gives what it teaches: its sentences and glossed words, filed under their rare words", () => {
  const { entries, terms } = findRows(COFFEE);
  same(entries.length, 2 + Object.keys(WORDS).length);
  const of = (term) => terms.filter(([t]) => t === term).map(([, n]) => n);
  ok(of("koffie").includes(0), "the sentence under its own word");
  ok(of("coffee").includes(0), "and under the English");
  ok(!of("i").includes(0) || of("i").length < 3, "a common word doesn't take every sentence");
  ok(of("to").length === 0 || of("to").every((n) => n >= 2), "gloss words lead to the glossed word");
  same(entries[0].body, { t: "Ik wil graag koffie.", m: "I'd like coffee.", l: ["Ik", "wil", "graag", "koffie."] });
});

await test("what an entry teaches: a sentence its own word, that word's dictionary form and what it means; a word list nothing", () => {
  const { terms } = findRows(COFFEE);
  const taught = (n) => terms.filter(([, at, t]) => at === n && t === 1).map(([term]) => term).sort();
  same(taught(0), ["coffee", "koffie"], "the sentence written for koffie");
  same(taught(1), ["tea", "thee"], "the one written for thee");
  ok(terms.some(([term, at, t]) => term === "wil" && at === 0 && t === 0), `a rare word it only says is filed, not taught: ${JSON.stringify(terms.filter(([, at]) => at === 0))}`);
  ok(terms.filter(([, at]) => at >= 2).every(([, , t]) => t === 0), "the word list teaches nothing");
  ok(terms.every(([, , t]) => t === 0 || t === 1), "every row says");
  // A verb's gloss: its first sense, without "to"; a dictionary form that differs from the word said.
  const verb = findRows(packOf("v", "V", [sentence("drink", "Ik drink.", { Ik: "ik", drink: "drinken" }, "I drink.")], { ik: "I", drinken: "to drink; to swallow" }));
  same(verb.terms.filter(([, at, t]) => at === 0 && t === 1).map(([term]) => term).sort(), ["drink", "drinken"]);
  same(meaningOf("my, mine; mine (excavation or explosive device)"), ["my", "mine"]);
  same(meaningOf("to want"), ["want"]);
  same(meaningOf(undefined), []);
  // A word named like what every object has is still only its own gloss.
  same(findRows(packOf("p", "P", [sentence("c", "De constructor.", { De: "de", constructor: "constructor" }, "The builder.")], {})).terms.filter(([, , t]) => t === 1).map(([term]) => term).sort(), ["constructor"]);
});

await test("a plain item is filed under every word of it", () => {
  const { entries, terms } = findRows({ language: "es", items: [{ id: "a", text: "la llave", means: "the key" }], words: {} });
  same(entries[0].body, { t: "la llave", m: "the key" });
  same(terms.map(([t]) => t).sort(), ["key", "la", "llave", "the"]);
  ok(terms.every(([, , t]) => t === 1), "and teaches every word of it: it's what's learned");
});

await test("a language written without spaces: what's typed is split by its own segmenter", () => {
  ok(termsOf("私は学生です", "ja", "").length > 1, JSON.stringify(termsOf("私は学生です", "ja", "")));
});

await test("before it's indexed, nothing's found, and it says some packs aren't searchable yet", async () => {
  coffee = await share(COFFEE);
  dogs = await share(DOGS);
  ok(coffee.shared && dogs.shared, JSON.stringify([coffee, dogs]).slice(0, 300));
  const found = await find("koffie");
  same(found, { packs: [], indexing: true });
});

await test("a pass writes what's missing, and running it again changes nothing", async () => {
  const first = await indexMissing(env, { limit: 10 });
  same(first.written, 2);
  const count = () => [sqlite.prepare("SELECT COUNT(*) AS n FROM find_entries").get().n, sqlite.prepare("SELECT COUNT(*) AS n FROM find_terms").get().n];
  const after = count();
  ok(after[0] > 0 && after[1] > 0, JSON.stringify(after));
  same((await indexMissing(env, { limit: 10 })).written, 0);
  same(count(), after);
});

await test("found: a word in Dutch, a word in English, a sentence typed whole, each with what shows it", async () => {
  const word = await find("koffie");
  same(ids(word), ["coffee-talk"]);
  same(word.indexing, false);
  const pack = word.packs[0];
  same([pack.name, pack.kind, pack.credit], ["Coffee talk", "shared", "Shared in Explore by Owner"]);
  same(pack.sentences[0].text, "Ik wil graag koffie.");
  same(pack.sentences[0].means, "I'd like coffee.");
  ok(pack.words.some((w) => w.lemma === "koffie" && w.gloss === "coffee"), JSON.stringify(pack.words));
  same(ids(await find("coffee")), ["coffee-talk"]);
  same(ids(await find("ik wil graag koffie")), ["coffee-talk"]);
  same((await find("ik wil graag koffie")).packs[0].sentences[0].text, "Ik wil graag koffie.", "what holds the most of the words first");
  same(ids(await find("KOFFIE!")), ["coffee-talk"], "case and punctuation");
});

await test("the pack holding more of the words comes first", async () => {
  same(ids(await find("hond koffie graag")), ["coffee-talk", "dog-walks"]);
  const both = await find("hond koffie graag");
  same([both.packs[0].matched, both.packs[0].of, both.packs[1].matched], [2, 3, 1]);
});

await test("nothing found says so; another language's packs aren't looked in", async () => {
  same((await find("kwibus")).packs, []);
  same((await find("koffie", "de")).packs, []);
});

await test("what it refuses: nothing typed, no language, English as the language, too long", async () => {
  for (const [q, language] of [["", "nl"], ["  ", "nl"], [5, "nl"], ["koffie", "xx"], ["koffie", "en"], ["koffie", null], ["k".repeat(FIND.queryChars + 1), "nl"]]) {
    const refused = await findPacks(env, q, language).then(() => false, () => true);
    ok(refused, `not refused: ${JSON.stringify([q, language]).slice(0, 80)}`);
  }
  const long = await find(`${Array.from({ length: 20 }, (_, i) => `woord${i}`).join(" ")} koffie`);
  same(long.packs, [], "only the first few words are looked up");
});

await test("a new version: the new one's found at once when indexed, the old never, and its rows go", async () => {
  const next = packOf("coffee-talk", "Coffee talk", [...COFFEE.items, sentence("wil-melk", "Ik wil graag melk.", { Ik: "ik", wil: "willen", graag: "graag", melk: "melk" }, "I'd like milk.")], { ...WORDS, melk: "milk" });
  const done = await community.updateShared(env, { userId: OWNER, via: "app" }, coffee.id, { pack: next });
  ok(done.updated !== false && done.shared !== false, JSON.stringify(done).slice(0, 300));
  same((await find("koffie")).packs, [], "not the old version's rows");
  same((await find("koffie")).indexing, true);
  // What else there is, and what a pass writes: a republish of one pack is that pack's rows and no one else's.
  const others = () => JSON.stringify([sqlite.prepare("SELECT * FROM find_entries WHERE item_id <> ? ORDER BY 1, 2, 3").all("coffee-talk"), sqlite.prepare("SELECT * FROM find_terms WHERE item_id <> ? ORDER BY 1, 2, 3, 4, 5").all("coffee-talk")]);
  const count = (table) => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE item_id = ?`).get("coffee-talk").n;
  const othersBefore = others();
  ok(othersBefore.length > 20, "another pack's rows to compare");
  const oldRows = count("find_entries") + count("find_terms");
  const changesBefore = sqlite.prepare("SELECT total_changes() AS n").get().n;
  const pass = await indexMissing(env, { limit: 10 });
  same(pass.written, 1, "one pack written");
  same(others(), othersBefore, "no other pack's rows moved");
  const newRows = count("find_entries") + count("find_terms");
  same(sqlite.prepare("SELECT total_changes() AS n").get().n - changesBefore, oldRows + newRows, "every write was this pack's: its old version's rows gone, its new one's in");
  same(ids(await find("melk")), ["coffee-talk"]);
  same(ids(await find("koffie")), ["coffee-talk"]);
  const versions = sqlite.prepare("SELECT COUNT(DISTINCT version) AS n FROM find_entries WHERE item_id = ?").get("coffee-talk").n;
  same(versions, 1, "only the live version's rows are kept");
  const quiet = await indexMissing(env, { limit: 10 });
  same([quiet.written, quiet.cleared], [0, 0], "and the next pass, with nothing new, writes nothing");
});

await test("withdrawn: gone from results at once, its rows cleared by the next pass, and back if it comes back", async () => {
  await community.withdrawShared(env, { userId: OWNER, via: "app" }, dogs.id);
  same(ids(await find("hond")), []);
  await indexMissing(env, { limit: 10 });
  same(sqlite.prepare("SELECT COUNT(*) AS n FROM find_terms WHERE item_id = ?").get(dogs.id).n, 0);
  same(sqlite.prepare("SELECT COUNT(*) AS n FROM find_entries WHERE item_id = ?").get(dogs.id).n, 0);
});

await test("hidden by moderation: not found, whatever its rows say", async () => {
  sqlite.prepare("UPDATE items SET state = 'hidden' WHERE id = ?").run(coffee.id);
  same(ids(await find("melk")), []);
  sqlite.prepare("UPDATE items SET state = 'live' WHERE id = ?").run(coffee.id);
  await indexMissing(env, { limit: 10 });
  same(ids(await find("melk")), ["coffee-talk"], "and back, written again if a pass cleared it");
});

await test("nothing typed is kept: no table holds it after a search", async () => {
  const mark = "zzqmarkerzz";
  await find(`${mark} koffie`);
  for (const { name } of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'").all()) {
    const columns = sqlite.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all().map((c) => c.name);
    for (const column of columns) {
      const hit = sqlite.prepare(`SELECT 1 FROM ${JSON.stringify(name)} WHERE CAST(${JSON.stringify(column)} AS TEXT) LIKE ? LIMIT 1`).get(`%${mark}%`);
      ok(!hit, `${name}.${column} holds it`);
    }
  }
});

await test("among packs holding the same words, the one where more of its sentences and words hold them comes first, not the first by name", async () => {
  // "aa-cup" sorts first by its id and has koffie only in its word list; "zz-koffie" says it in two sentences.
  const cup = packOf("aa-cup", "A cup", [sentence("cup-thee", "Ik drink thee.", { Ik: "ik", drink: "drinken", thee: "thee" }, "I drink tea.")], WORDS);
  const twice = packOf("zz-koffie", "Koffie twice", [
    sentence("zz-drink", "Ik drink koffie.", { Ik: "ik", drink: "drinken", koffie: "koffie" }, "I drink coffee."),
    sentence("zz-warm", "De koffie is warm.", { De: "de", koffie: "koffie", is: "zijn", warm: "warm" }, "The coffee is hot."),
  ], { ...WORDS, de: "the", zijn: "to be", warm: "warm; hot" });
  ok((await share(cup)).shared && (await share(twice)).shared, "shared");
  await indexMissing(env, { limit: 10 });
  const found = ids(await find("koffie")).filter((id) => id === "aa-cup" || id === "zz-koffie");
  same(found, ["zz-koffie", "aa-cup"]);
});

await test("a pack written for the word comes before one that only says it, however many of its sentences do; the sentence written for it shows first", async () => {
  // "ab-says" says koffie in three short sentences, each written for another word, so koffie is filed under all three (and before, it came first).
  // "zy-teaches" says it twice: first in a sentence written for zetten, then in one written for koffie.
  const says = packOf("ab-says", "Says koffie", [
    sentence("ab-1", "Koffie alstublieft.", { Koffie: "koffie", alstublieft: "alstublieft" }, "Coffee, please."),
    sentence("ab-2", "Koffie drinken.", { Koffie: "koffie", drinken: "drinken" }, "To drink coffee."),
    sentence("ab-3", "Koffie halen.", { Koffie: "koffie", halen: "halen" }, "To fetch coffee."),
  ], { koffie: "coffee", alstublieft: "please", drinken: "to drink", halen: "to fetch" });
  const teaches = packOf("zy-teaches", "Teaches koffie", [
    sentence("zy-1", "Koffie zetten.", { Koffie: "koffie", zetten: "zetten" }, "To make coffee."),
    sentence("zy-2", "Ik drink koffie.", { Ik: "ik", drink: "drinken", koffie: "koffie" }, "I drink coffee."),
  ], { koffie: "coffee", zetten: "to make; to put", ik: "I", drinken: "to drink" });
  ok((await share(says)).shared && (await share(teaches)).shared, "shared");
  await indexMissing(env, { limit: 10 });
  const mine = (found) => found.packs.filter((pack) => pack.id === "ab-says" || pack.id === "zy-teaches");
  const dutch = mine(await find("koffie"));
  same(dutch.map((pack) => [pack.id, pack.teaches]), [["zy-teaches", true], ["ab-says", false]], "by the Dutch");
  same(dutch[0].sentences[0].text, "Ik drink koffie.", "the sentence written for it, first");
  same(mine(await find("coffee")).map((pack) => [pack.id, pack.teaches]), [["zy-teaches", true], ["ab-says", false]], "and by what it means");
  same(mine(await find("drinken")).map((pack) => [pack.id, pack.teaches]), [["ab-says", true], ["zy-teaches", false]], "and the other way round: a word ab-says is written for, that zy-teaches only says");
});

const mine2 = (found) => found.packs.filter((pack) => pack.id === "ab-says" || pack.id === "zy-teaches").map((pack) => [pack.id, pack.teaches]);
await test("rows from before taught: they serve searches until a pass writes them again, then none are left unknown", async () => {
  const unknown = () => sqlite.prepare("SELECT COUNT(*) AS n FROM find_terms WHERE item_id IN ('ab-says', 'zy-teaches') AND taught IS NULL").get().n;
  const entries = () => sqlite.prepare("SELECT COUNT(*) AS n FROM find_entries WHERE item_id IN ('ab-says', 'zy-teaches')").get().n;
  const terms = () => sqlite.prepare("SELECT COUNT(*) AS n FROM find_terms WHERE item_id IN ('ab-says', 'zy-teaches')").get().n;
  const [entriesBefore, termsBefore] = [entries(), terms()];
  // As the migration leaves them: taught unknown, the format before; and a row the new way doesn't file, as an older filing could have left.
  sqlite.prepare("UPDATE find_terms SET taught = NULL WHERE item_id IN ('ab-says', 'zy-teaches')").run();
  sqlite.prepare("UPDATE find_entries SET format = 1 WHERE item_id IN ('ab-says', 'zy-teaches')").run();
  sqlite.prepare("INSERT INTO find_terms (language, term, item_id, version, n) SELECT 'nl', 'oudwoord', item_id, version, 0 FROM find_entries WHERE item_id = 'ab-says' AND n = 0").run();
  const meanwhile = await find("koffie");
  const both = meanwhile.packs.filter((pack) => pack.id === "ab-says" || pack.id === "zy-teaches");
  same(both.map((pack) => [pack.id, "teaches" in pack]).sort(), [["ab-says", false], ["zy-teaches", false]], "still found, and neither says whether it teaches");
  same(meanwhile.indexing, true, "and it says some are still being read");
  same(ids(await find("oudwoord")), ["ab-says"]);
  const pass = await indexMissing(env, { limit: 10 });
  same(pass.written, 2, "both written again");
  same([unknown(), entries(), terms()], [0, entriesBefore, termsBefore], "every row known, the same rows as written new, the old filing's row gone");
  same(mine2(await find("koffie")), [["zy-teaches", true], ["ab-says", false]]);
  same((await find("koffie")).indexing, false);
  same((await indexMissing(env, { limit: 10 })).written, 0, "and done");
});

await test("the real Dutch packs: what it takes, and what a search reads", async () => {
  const names = ["path-nl", ...Array.from({ length: 10 }, (_, i) => `words-nl-${String(i + 1).padStart(2, "0")}`)];
  const before = Date.now();
  let entries = 0;
  let terms = 0;
  let bytes = 0;
  sqlite.exec("BEGIN");
  const putEntry = sqlite.prepare("INSERT INTO find_entries (item_id, version, n, body, format) VALUES (?, 'v', ?, ?, ?)");
  const putTerm = sqlite.prepare("INSERT OR IGNORE INTO find_terms (language, term, item_id, version, n, taught) VALUES ('nl', ?, ?, 'v', ?, ?)");
  const putItem = sqlite.prepare("INSERT INTO items (id, kind, owner_id, curated, title, language, from_lang, topics, badges, licence, head_version, content_hash, search, created_at, updated_at) VALUES (?, 'pack', NULL, 1, ?, 'nl', 'en', '[]', '{}', 'CC', 'v', ?, ?, 1, 1)");
  for (const name of names) {
    const pack = JSON.parse(readFileSync(join(APP, "packs", `${name}.json`), "utf8"));
    putItem.run(name, pack.name, name, pack.name);
    const rows = findRows(pack);
    for (const entry of rows.entries) {
      const body = JSON.stringify(entry.body);
      bytes += body.length;
      putEntry.run(name, entry.n, body, FIND.format);
    }
    for (const [term, n, taught] of rows.terms) putTerm.run(term, name, n, taught);
    entries += rows.entries.length;
    terms += rows.terms.length;
  }
  sqlite.exec("COMMIT");
  const started = performance.now();
  const found = await find("ik wil graag een rondleiding");
  const ms = Math.round(performance.now() - started);
  ok(found.packs.length > 0, "found nothing");
  ok(found.packs.some((pack) => pack.sentences.some((s) => /rondleiding/i.test(s.text))), JSON.stringify(found.packs.map((p) => p.sentences)).slice(0, 400));
  // A word the real packs teach: those written for it first, each shown by a sentence that has it.
  const koffie = await find("koffie");
  const teachers = names.filter((name) => JSON.parse(readFileSync(join(APP, "packs", `${name}.json`), "utf8")).items.some((item) => /^koffie$/i.test(item.words?.[item.gap?.index]?.[1] ?? "")));
  const real = koffie.packs.filter((pack) => names.includes(pack.id));
  ok(teachers.length, "no real pack is written for koffie");
  same(real.slice(0, Math.min(teachers.length, FIND.packs)).map((pack) => pack.teaches), Array(Math.min(teachers.length, FIND.packs)).fill(true), `the packs written for koffie first: ${JSON.stringify(real.map((p) => [p.id, p.teaches]))}, written for it: ${teachers}`);
  ok(real.every((pack) => pack.sentences.length && /koffie/i.test(pack.sentences[0].text)), JSON.stringify(real.map((p) => p.sentences[0])));
  const largest = sqlite.prepare("SELECT term, COUNT(*) AS n FROM find_terms WHERE language = 'nl' GROUP BY term ORDER BY n DESC LIMIT 3").all();
  const taughtRows = sqlite.prepare("SELECT COUNT(*) AS n FROM find_terms WHERE language = 'nl' AND version = 'v' AND taught = 1").get().n;
  return `koffie: ${real.map((p) => `${p.id}${p.teaches ? " (teaches)" : ""}`).join(", ")}; ${names.length} packs: ${entries} entries (${Math.round(bytes / 1e6)} MB), ${terms} terms (${taughtRows} taught), written in ${Date.now() - before} ms here; a search ${ms} ms here; commonest terms ${largest.map((r) => `${r.term} ${r.n}`).join(", ")}; packs found: ${found.packs.map((p) => p.id).join(",")}`;
});

console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
