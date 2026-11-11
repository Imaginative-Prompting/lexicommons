// A language's shared grammar as data (public/js/lang/grammar.js): every language's revision 1 inside the app passes
// the check, and every pattern id ever published is still there (scripts/fixtures/pattern-ids.json: the list only
// grows); the check's every refusal, and the rule between revisions (the next number, every id kept, retire instead of
// remove); versions named by content, the library's key, the catalog's entry and its rules, a restore never taking a
// grammar back; installing only ever moving forward, and what's checked against it (a pack's pattern the newer
// revision adds, a retired one warned about, an id like "constructor" never a pattern); then the Worker's side
// (src/grammar.ts, R2 in memory): a pack checked against the library's revision once the catalog names it, a file that
// doesn't pass left out; a grammar's and its longer file's readings for their own words' forms (9 Nov 2026). Runs in Node:
// `node scripts/test-grammar.mjs` (exit 0 = pass).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
const grammarJs = await import(join(APP, "public/js/lang/grammar.js"));
const {
  GRAMMAR_FORMAT,
  SEED_SOURCE,
  checkGrammar,
  grammarCatalogueProblems,
  grammarChanges,
  grammarEntry,
  grammarKey,
  grammarNow,
  grammarRef,
  grammarText,
  grammarUrl,
  grammarVersion,
  keepsEveryId,
  newerGrammar,
  resetGrammar,
  seedGrammar,
  useGrammar,
  withGrammarEntry,
} = grammarJs;
const { LANGUAGES } = await import(join(APP, "public/js/lang/index.js"));
const { checkPack, buildView } = await import(join(APP, "public/js/study/pack-format.js"));
const { authoringItem } = await import(join(APP, "public/js/study/pack-authoring.js"));
const { catalogueProblems, emptyCatalogue } = await import(join(APP, "public/js/read/catalogue.js"));
const { BUILT_IN } = await import(join(APP, "public/js/packs/index.js"));
const { grammarReady } = await import(join(APP, "src/grammar.ts"));
const { checkItems } = await import(join(APP, "src/packs.ts"));

const FROZEN = JSON.parse(readFileSync(join(APP, "scripts/fixtures/pattern-ids.json"), "utf8"));

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const eq = (a, b) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const copy = (value) => structuredClone(value);
const said = (result, text) => [...result.errors].some((e) => e.message.includes(text));

// Dutch's revision 2, as an admin would publish it: one pattern added, one renamed, one retired.
function dutch2() {
  const next = copy(seedGrammar("nl"));
  next.revision = 2;
  next.patterns["test-added"] = { name: "A pattern added for the test", about: "Something the grammar didn't have: het huisje (the little house).", after: ["de-het"], source: { by: "A test", at: "2026-11-02" } };
  next.patterns.v2.name = "Verb second (renamed)";
  next.patterns.omte.retired = true;
  return next;
}

// ---------- revision 1, inside the app ----------

await test("every language's revision 1 (the app's own) passes the check as it is, each pattern with a source", () => {
  for (const code of Object.keys(LANGUAGES)) {
    const seed = seedGrammar(code);
    const { grammar, errors, warnings } = checkGrammar(seed);
    ok(grammar && !warnings.length, `${code}: ${JSON.stringify([...errors, ...warnings].slice(0, 3))}`);
    eq(grammar, seed);
    for (const [id, p] of Object.entries(seed.patterns)) ok(p.source.by, `${code}.${id} has no source`);
  }
  return `${Object.keys(LANGUAGES).length} languages`;
});

await test("Dutch's revision 1 has the series' 21 patterns beside its first 8, each saying who drafted and reviewed it", () => {
  const nl = seedGrammar("nl");
  eq(Object.keys(nl.patterns).length, 29);
  eq(nl.patterns.v2.source, SEED_SOURCE);
  eq(nl.patterns.want.source.drafted, "gpt-6.1-sol");
  ok(nl.patterns.want.source.reviewed.includes("gpt-6-astra"), JSON.stringify(nl.patterns.want.source));
  eq(nl.patterns.omdat.after, ["dat"]);
});

await test("every pattern id ever published is still in its language (the frozen list), and every one there is on it", () => {
  // Published = revision 1 inside the app, and every revision in library/grammar/<code>/ (a library revision can add ids
  // the app's revision 1 never had). Still there = in revision 1 or in the language's newest library revision.
  const revisions = (code) => {
    const dir = join(APP, "library/grammar", code);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => /^[0-9a-f]{12}\.json$/.test(name))
      .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")))
      .sort((a, b) => a.revision - b.revision);
  };
  const missing = [];
  const unlisted = [];
  for (const [code, ids] of Object.entries(FROZEN)) {
    const newest = revisions(code).at(-1)?.patterns ?? {};
    for (const id of ids) if (!Object.hasOwn(seedGrammar(code)?.patterns ?? {}, id) && !Object.hasOwn(newest, id)) missing.push(`${code}:${id}`);
  }
  for (const code of Object.keys(LANGUAGES)) {
    const published = new Set([seedGrammar(code), ...revisions(code)].flatMap((grammar) => Object.keys(grammar.patterns)));
    for (const id of published) if (!(FROZEN[code] ?? []).includes(id)) unlisted.push(`${code}:${id}`);
  }
  ok(!missing.length, `gone (an id is never removed: retire it instead): ${missing.join(", ")}`);
  ok(!unlisted.length, `new ids not on scripts/fixtures/pattern-ids.json (add them: the list only grows): ${unlisted.join(", ")}`);
  return `${Object.values(FROZEN).flat().length} ids`;
});

// ---------- the check ----------

await test("a grammar that isn't one is refused in words, every problem at once", () => {
  const base = seedGrammar("nl");
  const cases = [
    [null, "A grammar is an object"],
    [{ ...base, format: "lexicommons-pack" }, `format must be "${GRAMMAR_FORMAT}"`],
    [{ ...base, version: 2 }, "version must be 1"],
    [{ ...base, language: "xx" }, 'language "xx" isn\'t one'],
    [{ ...base, language: "__proto__" }, "isn't one Lexicommons knows"],
    [{ ...base, revision: 0 }, "revision must be a whole number"],
    [{ ...base, revision: 2.5 }, "revision must be a whole number"],
    [{ ...base, patterns: [] }, "patterns must be"],
  ];
  for (const [value, text] of cases) {
    const result = checkGrammar(value);
    ok(!result.grammar && said(result, text), `${text}: ${JSON.stringify(result.errors)}`);
  }
});

await test("each pattern: its id, name, about, after (in the grammar, never itself, never a loop), source and retired", () => {
  const with_ = (fn) => {
    const g = copy(seedGrammar("nl"));
    fn(g.patterns);
    return checkGrammar(g);
  };
  const cases = [
    [(p) => (p["Bad Id"] = { ...p.v2 }), "isn't a pattern id"],
    [(p) => (p["x".repeat(41)] = { ...p.v2 }), "isn't a pattern id"],
    [(p) => (p.v2 = "verb second"), "must be { name, about, after, source }"],
    [(p) => delete p.v2.name, "patterns.v2.name is missing"],
    [(p) => (p.v2.name = { toString: null }), "patterns.v2.name is missing"],
    [(p) => (p.v2.about = "x".repeat(401)), "keep it to 400"],
    [(p) => (p.v2.after = "perfect"), "must be a list"],
    [(p) => (p.v2.after = ["nope"]), '"nope" isn\'t a pattern in this grammar'],
    [(p) => (p.v2.after = ["v2"]), "can't build on itself"],
    [(p) => (p.v2.after = ["perfect", "perfect"]), "names one pattern twice"],
    [(p) => (p.v2.after = ["dat"]), "goes round in a loop"],
    [(p) => delete p.v2.source, "source must be"],
    [(p) => (p.v2.source = { drafted: "someone" }), "source.by is missing"],
    [(p) => (p.v2.source = { by: "x", at: "2 Nov" }), "source.at is a date"],
    [(p) => (p.v2.source = { by: "x".repeat(201) }), "keep it to 200"],
    [(p) => (p.v2.retired = "yes"), "retired is true, or left out"],
  ];
  for (const [fn, text] of cases) {
    const result = with_(fn);
    ok(!result.grammar && said(result, text), `${text}: ${JSON.stringify(result.errors.slice(0, 3))}`);
  }
  const extra = checkGrammar({ ...seedGrammar("nl"), extra: 1, patterns: { ...seedGrammar("nl").patterns, v2: { ...seedGrammar("nl").patterns.v2, colour: "red" } } });
  ok(extra.grammar && !("extra" in extra.grammar) && !("colour" in extra.grammar.patterns.v2) && extra.warnings.length === 2, JSON.stringify(extra.warnings));
  const cleaned = checkGrammar({ ...seedGrammar("nl"), patterns: { ...seedGrammar("nl").patterns, v2: { ...seedGrammar("nl").patterns.v2, name: "  Verb​  second " } } });
  eq(cleaned.grammar.patterns.v2.name, "Verb second");
});

await test("between revisions: the next number, every id kept (retired, never removed), the same language", () => {
  const before = seedGrammar("nl");
  const next = dutch2();
  const good = checkGrammar(next, { previous: before });
  ok(good.grammar, JSON.stringify(good.errors));
  eq(grammarChanges(before, good.grammar), { added: ["test-added"], changed: ["v2"], retired: ["omte"], restored: [] });
  const skipped = checkGrammar({ ...next, revision: 3 }, { previous: before });
  ok(said(skipped, "revision must be 2"), JSON.stringify(skipped.errors));
  const dropped = copy(next);
  delete dropped.patterns.niet;
  const refused = checkGrammar(dropped, { previous: before });
  ok(said(refused, "It leaves out niet") && said(refused, "Retire it instead"), JSON.stringify(refused.errors));
  const german = checkGrammar({ ...seedGrammar("de"), revision: 2 }, { previous: before });
  ok(said(german, "the one it follows is nl's"), JSON.stringify(german.errors));
  const back = copy(good.grammar);
  back.revision = 3;
  delete back.patterns.omte.retired;
  eq(grammarChanges(good.grammar, checkGrammar(back, { previous: good.grammar }).grammar).restored, ["omte"]);
  ok(keepsEveryId(before, good.grammar) && !keepsEveryId(good.grammar, before), "keepsEveryId");
});

// ---------- the open library ----------

await test("a version is the checked grammar's content: the same content, the same version; its key, url and entry", async () => {
  const g = checkGrammar(dutch2()).grammar;
  const v = await grammarVersion(g);
  ok(/^[0-9a-f]{12}$/.test(v), v);
  eq(await grammarVersion(JSON.parse(grammarText(g))), v);
  ok((await grammarVersion({ ...g, revision: 3 })) !== v, "a different content, the same version");
  eq(grammarKey("nl", v), `grammar/nl/${v}.json`);
  eq(grammarUrl("zh-Hant", v), `/library/grammar/zh-Hant/${v}.json`);
  eq(grammarEntry(g, v), { revision: 2, version: v, url: `/library/grammar/nl/${v}.json`, patterns: 30 });
});

await test("the catalog's entry: set beside everything else, read only when well formed, and a catalog with a bad one refused", async () => {
  const g = checkGrammar(dutch2()).grammar;
  const v = await grammarVersion(g);
  const base = { ...emptyCatalogue(), packs: { nl: [] } };
  const cat = withGrammarEntry(base, "nl", grammarEntry(g, v));
  eq(cat.packs, { nl: [] });
  eq(grammarRef(cat, "nl"), { revision: 2, version: v, url: `/library/grammar/nl/${v}.json` });
  eq(grammarRef(cat, "de"), null);
  eq(grammarRef(base, "nl"), null);
  eq(catalogueProblems(cat), []);
  for (const bad of [
    { ...cat, grammar: [] },
    withGrammarEntry(base, "nl", { ...grammarEntry(g, v), url: "/library/grammar/nl/elsewhere.json" }),
    withGrammarEntry(base, "nl", { ...grammarEntry(g, v), revision: 1 }),
    withGrammarEntry(base, "xx", grammarEntry({ ...g, language: "xx" }, v)),
  ]) {
    ok(grammarCatalogueProblems(bad).length && catalogueProblems(bad).length, JSON.stringify(bad.grammar));
    ok(!grammarRef(bad, "nl") || bad.grammar.nl.revision !== 1, "a bad entry read");
  }
  // A restore of an older catalog keeps each grammar's newest revision.
  const older = withGrammarEntry(base, "nl", { ...grammarEntry(g, v), revision: 2 });
  const newer = withGrammarEntry(base, "nl", { revision: 3, version: "aaaaaaaaaaaa", url: grammarUrl("nl", "aaaaaaaaaaaa"), patterns: 30 });
  eq(Object.keys(newerGrammar(newer, older)), ["nl"]);
  eq(Object.keys(newerGrammar(newer, base)), ["nl"]);
  eq(newerGrammar(older, newer), {});
});

// ---------- installed, and what's checked against it ----------

const starter = BUILT_IN[0];
// A pack of one starter sentence that's an example of the given pattern.
const packUsing = (pattern, id = "grammar-check") => ({ ...copy(starter), id, name: "Grammar check", items: [{ ...copy(starter.items[0]), concepts: [pattern] }] });

await test("installing moves only forward: revision 2 replaces 1, an older or the same one never replaces it", async () => {
  resetGrammar("nl");
  const g = checkGrammar(dutch2()).grammar;
  const v = await grammarVersion(g);
  eq(grammarNow("nl").revision, 1);
  ok(useGrammar(g, v), "revision 2 not installed");
  eq(grammarNow("nl").revision, 2);
  eq(grammarNow("nl").libraryVersion, v);
  eq(LANGUAGES.nl.patterns.v2.name, "Verb second (renamed)");
  ok(!useGrammar(g, v) && !useGrammar(seedGrammar("nl"), null), "installed again, or back");
  eq(grammarNow("nl").revision, 2);
  resetGrammar("nl");
  eq(grammarNow("nl").revision, 1);
  eq(LANGUAGES.nl.patterns.v2.name, "Verb second");
});

await test("a pack's pattern the newer revision adds: refused against revision 1, kept once it's installed; a retired one warned about", async () => {
  resetGrammar("nl");
  const before = checkPack(packUsing("test-added"));
  ok(!before.pack && before.errors.some((e) => e.message.includes('"test-added" isn\'t in the language\'s catalog')), JSON.stringify(before.errors));
  useGrammar(checkGrammar(dutch2()).grammar, await grammarVersion(checkGrammar(dutch2()).grammar));
  const after = checkPack(packUsing("test-added"));
  ok(after.pack && !after.warnings.length, JSON.stringify([after.errors, after.warnings]));
  const retired = checkPack(packUsing("omte"));
  ok(retired.pack && retired.warnings.some((w) => w.message.includes("omte is retired")), JSON.stringify(retired.warnings));
  // The view names it as the shared grammar does.
  eq(buildView([{ ...after.pack, builtIn: true }], "nl").patterns["test-added"].name, "A pattern added for the test");
  resetGrammar("nl");
});

await test('an id like "constructor" is never a pattern of the language (the catalog is read by its own keys)', () => {
  const result = checkPack(packUsing("constructor"));
  ok(!result.pack && result.errors.some((e) => e.message.includes('"constructor" isn\'t in the language\'s catalog')), JSON.stringify(result.errors));
  const own = checkPack({ ...packUsing("constructor"), patterns: { constructor: { name: "Own", about: "A pack's own.", after: [] } } });
  ok(own.pack && own.pack.patterns.constructor?.name === "Own", JSON.stringify([own.errors, own.warnings]));
});

// ---------- the Worker's side ----------

const OWNER = "user-grammar";
sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(OWNER, "Grammar", Date.now());
const aiItem = (pattern) => ({ ...authoringItem(starter.items[1], "nl"), id: undefined, patterns: [pattern] });

await test("the server checks against the library's revision once the catalog names it, and keeps it for good", async () => {
  resetGrammar("nl");
  const g = checkGrammar(dutch2()).grammar;
  const v = await grammarVersion(g);
  const first = await checkItems(env, OWNER, { language: "nl", items: [aiItem("test-added")] });
  ok(!first.ok && JSON.stringify(first.errors).includes("test-added"), JSON.stringify(first));
  await env.LIBRARY.put(grammarKey("nl", v), grammarText(g));
  await env.LIBRARY.put("catalogue.json", JSON.stringify(withGrammarEntry(emptyCatalogue(), "nl", grammarEntry(g, v))));
  const second = await checkItems(env, OWNER, { language: "nl", items: [aiItem("test-added")] });
  ok(second.ok, JSON.stringify(second));
  eq(grammarNow("nl").revision, 2);
  // A catalog restored to before it: the grammar here stays (packs checked since may use it).
  await env.LIBRARY.put("catalogue.json", JSON.stringify(emptyCatalogue()));
  await grammarReady(env, "nl");
  eq(grammarNow("nl").revision, 2);
  resetGrammar("nl");
});

await test("a grammar file that doesn't pass, or isn't what the catalog says, is left out: the one installed stays", async () => {
  resetGrammar("nl");
  // Its own content (a grammar fetched once is kept by its version: files are never changed), at its own key.
  const own = dutch2();
  own.patterns.v2.name = "Verb second (a file left out)";
  const g = checkGrammar(own).grammar;
  const v = await grammarVersion(g);
  const warned = [];
  const warn = console.warn;
  console.warn = (line) => warned.push(String(line));
  try {
    const cases = [
      ["missing", null],
      ["not a grammar", "{ nope"],
      ["another content", grammarText({ ...g, patterns: { ...g.patterns, v2: { ...g.patterns.v2, name: "Changed" } } })],
      ["an id taken away", grammarText({ ...g, patterns: Object.fromEntries(Object.entries(g.patterns).filter(([id]) => id !== "niet")) })],
    ];
    for (const [what, text] of cases) {
      env.LIBRARY.objects.delete(grammarKey("nl", v));
      if (text !== null) await env.LIBRARY.put(grammarKey("nl", v), text);
      await env.LIBRARY.put("catalogue.json", JSON.stringify(withGrammarEntry(emptyCatalogue(), "nl", grammarEntry(g, v))));
      await grammarReady(env, "nl");
      ok(grammarNow("nl").revision === 1, `${what}: installed`);
    }
  } finally {
    console.warn = warn;
  }
  ok(warned.length === 4 && warned.every((w) => w.includes("grammar_not_installed")), warned.join("\n"));
  resetGrammar("nl");
});

const moreOf = (grammar, concepts) => ({ format: "lexicommons-grammar-more", version: 1, language: grammar.language, concepts });
const MORE = { explain: "The verb comes second.", examples: [{ text: "Morgen werk ik thuis.", means: "Tomorrow I'm working at home.", literal: "Tomorrow work I at-home.", marks: [0, 1] }], contrasts: [{ with: "English", says: "English keeps I before the verb." }, { with: "question", says: "A question starts with the verb." }], mistakes: [{ wrong: "Morgen ik werk thuis.", right: "Morgen werk ik thuis.", why: "the verb comes second" }], source: { by: "Lexicommons", note: "Open to correction." } };

await test("a pattern may carry a short name and the rule in a sentence, kept through a check, and a change to either counts as a change", async () => {
  const { checkGrammar, grammarChanges, grammarVersion, seedGrammar, GRAMMAR_LIMITS } = grammarJs;
  const seed = seedGrammar("nl");
  const next = { ...seed, revision: 2, patterns: { ...seed.patterns, v2: { ...seed.patterns.v2, chip: "Verb second", short: "The verb comes second in a main sentence." } } };
  const { grammar, errors } = checkGrammar(next, { previous: seed });
  eq(errors, []);
  eq([grammar.patterns.v2.chip, grammar.patterns.v2.short], ["Verb second", "The verb comes second in a main sentence."]);
  eq(grammarChanges(seed, grammar).changed, ["v2"]);
  eq((await grammarVersion(checkGrammar(grammar).grammar)) === (await grammarVersion(grammar)), true, "the same text checked again");
  eq(Object.keys(seed.patterns.v2).includes("chip"), false, "and revision 1 has neither");
  for (const [bad, what] of [[{ chip: "x".repeat(GRAMMAR_LIMITS.chip + 1) }, "chip"], [{ short: "x".repeat(GRAMMAR_LIMITS.short + 1) }, "short"], [{ chip: "" }, "chip"]]) {
    const refused = checkGrammar({ ...next, patterns: { ...next.patterns, v2: { ...next.patterns.v2, ...bad } } }, { previous: seed });
    eq(refused.errors.some((e) => e.at.endsWith(what)), true, JSON.stringify(refused.errors));
  }
});

await test("a fix through a suggestion keeps the short name and the rule", () => {
  const { seedGrammar, withSuggestions } = grammarJs;
  const seed = seedGrammar("nl");
  const before = { ...seed, patterns: { ...seed.patterns, v2: { ...seed.patterns.v2, chip: "Verb second", short: "The rule." } } };
  const { grammar } = withSuggestions(before, [{ id: "s1", kind: "fix", pattern: "v2", change: { about: "Better words." }, knows: "native" }], { at: "2026-11-05" });
  eq([grammar.patterns.v2.about, grammar.patterns.v2.chip, grammar.patterns.v2.short], ["Better words.", "Verb second", "The rule."]);
});

await test("the longer file may say why a rule is and how to picture it, kept through a check; a field a checker doesn't know is dropped, never the file", () => {
  const { checkGrammarMore, seedGrammar, GRAMMAR_LIMITS, MORE_PICTURES } = grammarJs;
  const seed = seedGrammar("nl");
  const why = "Dutch keeps one seat for the verb: second place.";
  const kept = checkGrammarMore(moreOf(seed, { v2: { ...MORE, why, picture: "order" } }), seed);
  eq(kept.errors, []);
  eq([kept.more.concepts.v2.why, kept.more.concepts.v2.picture], [why, "order"]);
  eq(MORE_PICTURES, ["frame", "place", "order", "ending", "agreement", "article"]);
  // Both are optional: a concept without them is as it was.
  const without = checkGrammarMore(moreOf(seed, { v2: MORE }), seed).more.concepts.v2;
  ok(!("why" in without) && !("picture" in without), JSON.stringify(Object.keys(without)));
  const atOf = (c) => checkGrammarMore(moreOf(seed, { v2: { ...MORE, ...c } }), seed).errors.map((e) => e.at);
  // A kind this checker doesn't know (a newer app's): left out, with a warning, and the file and its explanations kept.
  const newer = checkGrammarMore(moreOf(seed, { v2: { ...MORE, why, picture: "spiral" }, perfect: { ...MORE, picture: "frame" } }), seed);
  eq(newer.errors, []);
  eq(newer.warnings.map((w) => w.at), ["concepts.v2.picture"]);
  eq([newer.more.concepts.v2.explain, newer.more.concepts.v2.why, "picture" in newer.more.concepts.v2, newer.more.concepts.perfect.picture], [MORE.explain, why, false, "frame"]);
  eq(atOf({ why: "x".repeat(GRAMMAR_LIMITS.more.reason + 1) }), ["concepts.v2.why"], "a why too long");
  // What today's devices do with a file that has fields they don't know: they keep the rest, so publishing why and picture loses nothing there.
  const later = checkGrammarMore(moreOf(seed, { v2: { ...MORE, why, picture: "order", somethingNew: { a: 1 } } }), seed);
  eq(later.errors, []);
  eq(later.more.concepts.v2.explain, MORE.explain);
  ok(!("somethingNew" in later.more.concepts.v2), "an unknown field was kept");
});

await test("a grammar and its longer file may carry readings for the forms their own words have (Japanese's kana), kept through a check, installed with it and counted in its version; refused where they can't be", async () => {
  const { checkGrammar, checkGrammarMore, grammarReadings, grammarVersion, resetGrammar, seedGrammar, useGrammar, GRAMMAR_LIMITS } = grammarJs;
  const seed = seedGrammar("ja");
  const readings = { 行きます: "いきます", 飲みます: "のみます" };
  const next = { ...seed, revision: 2, readings };
  const { grammar, errors, warnings } = checkGrammar(next, { previous: seed });
  eq(errors, []);
  eq(warnings, []);
  eq(grammar.readings, readings);
  const without = checkGrammar({ ...seed, revision: 2 }, { previous: seed }).grammar;
  ok((await grammarVersion(grammar)) !== (await grammarVersion(without)), "the readings are part of what the version names");
  // A revision whose only change is its readings is a change (the library publishes it); the same readings, none.
  eq([grammarJs.grammarChanges(without, grammar).readings, "readings" in grammarJs.grammarChanges(grammar, grammar)], [true, false]);
  eq((await grammarVersion(checkGrammar(grammar).grammar)) === (await grammarVersion(grammar)), true, "the same text checked again");
  // A form its words haven't got would never be drawn: left out, with a warning, the rest kept.
  const unused = checkGrammar({ ...next, readings: { ...readings, 銀行: "ぎんこう" } }, { previous: seed });
  eq([unused.errors, Object.keys(unused.grammar.readings), unused.warnings.map((w) => w.at)], [[], ["行きます", "飲みます"], ["readings.銀行"]]);
  // Refused: not a map, a reading that isn't the form's (kana that don't end as the form does), one in letters, a form with no kanji, too many,
  // and a language whose words carry none.
  const refusedAt = (value, lang = "ja") => checkGrammar(lang === "ja" ? { ...next, readings: value } : { ...seedGrammar(lang), revision: 2, readings: value }, { previous: seedGrammar(lang) }).errors.map((e) => e.at);
  eq(refusedAt(["行きます"]), ["readings"]);
  eq(refusedAt({ 行きます: "たべます" }), ["readings.行きます"]);
  eq(refusedAt({ 行きます: "ikimasu" }), ["readings.行きます"]);
  eq(refusedAt({ いきます: "いきます" }), ["readings.いきます"]);
  eq(refusedAt(Object.fromEntries(Array.from({ length: GRAMMAR_LIMITS.readings + 1 }, (_, i) => [`行${i}`, "い"]))).includes("readings"), true, "too many");
  eq(refusedAt({ huis: "haus" }, "nl"), ["readings"]);
  // Installed with the grammar, and gone with it.
  resetGrammar("ja");
  eq(grammarReadings("ja"), {}, "revision 1 has none");
  useGrammar(grammar, await grammarVersion(grammar));
  eq(grammarReadings("ja"), readings);
  resetGrammar("ja");
  eq(grammarReadings("ja"), {});
  // The longer file's own: for the forms its words have (here a mistake's sentence and a why), the same rules.
  const more = { format: "lexicommons-grammar-more", version: 1, language: "ja", readings: { 母: "はは", 帰ります: "かえります", 銀行: "ぎんこう" }, concepts: { masu: { explain: "Polite verbs end in -ます.", why: "母は帰ります: the verb ends in -ます.", examples: [], contrasts: [], mistakes: [{ wrong: "母は帰るます。", right: "母は帰ります。", why: "The form is 帰ります." }], source: { by: "A test" } } } };
  const checked = checkGrammarMore(more, grammar);
  eq([checked.errors, checked.more.readings, checked.warnings.map((w) => w.at)], [[], { 母: "はは", 帰ります: "かえります" }, ["readings.銀行"]]);
  eq(checkGrammarMore({ ...more, readings: { 母: "mama" } }, grammar).errors.map((e) => e.at), ["readings.母"]);
});

await test("the longer file: checked against the grammar, every problem at once, and what it isn't", () => {
  const { checkGrammarMore, moreKey, moreRef, seedGrammar, grammarRef, grammarEntry, withGrammarEntry } = grammarJs;
  const seed = seedGrammar("nl");
  const good = checkGrammarMore(moreOf(seed, { v2: MORE }), seed);
  eq(good.errors, []);
  eq(good.more.concepts.v2.examples[0].marks, [0, 1]);
  const atOf = (concepts, grammar = seed) => checkGrammarMore(moreOf(grammar, concepts), grammar).errors.map((e) => e.at);
  eq(atOf({ nope: MORE }), ["concepts.nope"], "a pattern the grammar doesn't have");
  eq(atOf({ v2: { ...MORE, examples: [{ ...MORE.examples[0], marks: [9] }] } }), ["concepts.v2.examples[0].marks"], "a mark past its words");
  eq(atOf({ v2: { ...MORE, contrasts: [{ with: "nope", says: "x" }] } }), ["concepts.v2.contrasts[0].with"], "a contrast with something that isn't there");
  eq(atOf({ v2: { ...MORE, mistakes: [{ wrong: "Ik ga.", right: "Ik ga.", why: "x" }] } }), ["concepts.v2.mistakes[0]"], "a mistake that's its own correction");
  eq(atOf({ v2: { ...MORE, explain: "" } }), ["concepts.v2.explain"], "no explanation");
  eq(checkGrammarMore(null, seed).more, null);
  eq(checkGrammarMore({ ...moreOf(seed, {}), language: "de" }, seed).errors.map((e) => e.at), ["language"]);
  // The catalog: its entry names the file, only as that version's own place.
  const ref = moreRef("nl", "0123456789ab");
  eq(ref.url, `/library/${moreKey("nl", "0123456789ab")}`);
  const entry = { ...grammarEntry({ ...seed, revision: 2 }, "abcdefabcdef"), more: ref };
  eq(grammarRef(withGrammarEntry({}, "nl", entry), "nl").more, ref);
  eq(grammarRef(withGrammarEntry({}, "nl", { ...entry, more: { version: "0123456789ab", url: "/elsewhere" } }), "nl").more, undefined, "an entry pointing elsewhere isn't believed");
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
