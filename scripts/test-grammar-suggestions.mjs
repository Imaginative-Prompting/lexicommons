// Suggestions to a language's shared grammar (lang/grammar.js's checkSuggestion and withSuggestions; the server's
// src/grammar-suggestions.ts on the real migrations, D1 as SQLite: scripts/fixtures/worker-env.mjs). The explanation's
// rule (an example with its literal gloss, one to three sentences), ids made from names, every refusal of a
// suggestion, the next revision made from accepted ones (whose sources never name a person); then suggesting (who may,
// the terms, every problem at once, one open suggestion of yours per pattern, a new id someone suggested already, the
// day's limit), listing (a hidden one only to its author), likes, withdrawing, reporting (hidden at once for illegal
// content), an admin declining (and only an admin), and an account going. Accepting publishes a revision to the open
// library: scripts/grammar-check.mjs holds that, over HTTP. Runs in Node: `node scripts/test-grammar-suggestions.mjs`
// (exit 0 = pass).

import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite, row, rows } = workerEnv();
const { aboutProblems, checkGrammar, checkSuggestion, idFromName, seedGrammar, suggestedSource, withSuggestions } = await import(join(APP, "public/js/lang/grammar.js"));
const { forgetGrammarStatements, likeSuggestion, listSuggestions, reviewSuggestions, suggestPattern, withdrawSuggestion } = await import(join(APP, "src/grammar-suggestions.ts"));
const { reportGrammarSuggestion } = await import(join(APP, "src/moderation.ts"));

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
async function refuses(fn, text) {
  try {
    await fn();
  } catch (error) {
    ok(error.message.includes(text), `refused, but with: ${error.message}`);
    return;
  }
  throw new Error(`not refused (wanted: ${text})`);
}
const nl = seedGrammar("nl");
const ZELF = "Put zelf after a word to stress it: ik doe het zelf (I do it self).";

// ---------- the rules, pure ----------

await test("an explanation shown after every answer: an example with its literal gloss, one to three sentences, within the limit", () => {
  ok(aboutProblems(nl.patterns.want.about).length === 0, JSON.stringify(aboutProblems(nl.patterns.want.about)));
  ok(aboutProblems(ZELF).length === 0, "zelf");
  ok(aboutProblems(nl.patterns.v2.about).some((p) => p.includes("literal gloss")), "v2's has no example");
  ok(aboutProblems("One. Two. Three. Four: ik werk (I work).").some((p) => p.includes("4 sentences")), "four sentences");
  ok(aboutProblems(`${"x".repeat(390)}: ik werk (I work).`).some((p) => p.includes("keep it to 400")), "too long");
  ok(aboutProblems("").some((p) => p.includes("missing")), "missing");
  // Inside an example's brackets, end marks aren't sentences: "werk jij? (work you?)".
  ok(aboutProblems("Questions put the verb first: werk jij? (work you?). Een vraag: kom je? (come you?).").length === 0, "examples' marks");
});

await test("an id made from a name: lowercase letters, digits and dashes, accents gone, at most 40", () => {
  eq(idFromName("Verbs with zich, mé"), "verbs-with-zich-me");
  eq(idFromName("  zelf: -self  "), "zelf-self");
  eq(idFromName("x".repeat(60)).length, 40);
  eq(idFromName("!!!"), "");
});

await test("a suggestion that isn't one is refused in words, every problem at once", () => {
  const cases = [
    [{ kind: "rename" }, 'kind is "new"'],
    [{ kind: "new", about: ZELF }, "A new pattern needs its name"],
    [{ kind: "new", name: "zelf" }, "The explanation is missing"],
    [{ kind: "new", name: "zelf", about: "Put zelf after a word to stress it." }, "literal gloss"],
    [{ kind: "new", name: "Verb second", pattern: "v2", about: ZELF }, 'The grammar has "v2" already'],
    [{ kind: "new", name: "zelf", about: ZELF, after: ["nope"] }, '"nope" isn\'t a pattern'],
    [{ kind: "new", name: "zelf", pattern: "zelf", about: ZELF, after: ["zelf"] }, '"zelf" isn\'t a pattern'],
    [{ kind: "new", name: "zelf", about: ZELF, after: "object" }, "after is a list"],
    [{ kind: "new", name: "x".repeat(81), about: ZELF }, "keep it to 80"],
    [{ kind: "fix", pattern: "nope", about: ZELF }, 'pattern "nope" isn\'t a pattern'],
    [{ kind: "fix", pattern: "want", about: nl.patterns.want.about }, "changes none of them"],
    [{ kind: "fix", pattern: "want", after: ["want"] }, "can't build on itself"],
    [{ kind: "retire", pattern: "omte", name: "x" }, "Retiring a pattern changes nothing else"],
  ];
  for (const [input, text] of cases) {
    const { suggestion, problems } = checkSuggestion(input, nl);
    ok(!suggestion && problems.some((p) => p.includes(text)), `${text}: ${JSON.stringify(problems)}`);
  }
  const retired = structuredClone(nl);
  retired.patterns.omte.retired = true;
  ok(checkSuggestion({ kind: "retire", pattern: "omte" }, retired).problems.some((p) => p.includes("retired already")), "retired already");
});

await test("what a suggestion keeps: a new one's every field, a fix's changes only, a retirement nothing", () => {
  eq(checkSuggestion({ kind: "new", name: "zelf: -self", about: ZELF, after: ["object", "object"] }, nl).suggestion, { kind: "new", pattern: "zelf-self", change: { name: "zelf: -self", about: ZELF, after: ["object"] } });
  eq(checkSuggestion({ kind: "fix", pattern: "want", name: nl.patterns.want.name, about: ZELF }, nl).suggestion, { kind: "fix", pattern: "want", change: { about: ZELF } });
  eq(checkSuggestion({ kind: "retire", pattern: "omte" }, nl).suggestion, { kind: "retire", pattern: "omte", change: {} });
});

await test("the next revision from accepted suggestions: each applied, one per pattern, every source saying how they know the language and never who", () => {
  const accepted = [
    { id: "s1", kind: "new", pattern: "zelf", change: { name: "zelf", about: ZELF, after: ["object"] }, knows: "native", via: "ai" },
    { id: "s2", kind: "fix", pattern: "want", change: { about: "Join with want (because), keeping the order: ik blijf, want ik ben moe (I stay, because I am tired)." }, knows: "fluent", via: "app" },
    { id: "s3", kind: "retire", pattern: "omte", change: {}, knows: "learning", via: "app" },
  ];
  const { grammar, problems } = withSuggestions(nl, accepted, { at: "2026-11-02" });
  ok(grammar, JSON.stringify(problems));
  eq(grammar.revision, 2);
  eq(grammar.patterns.zelf.source, { by: "A native speaker, in Explore", drafted: "with their AI", accepted: "an admin of Lexicommons", at: "2026-11-02" });
  eq(grammar.patterns.want.source.by, "A fluent speaker, in Explore");
  ok(grammar.patterns.want.source.note.includes(nl.patterns.want.source.by), JSON.stringify(grammar.patterns.want.source));
  eq(grammar.patterns.want.name, nl.patterns.want.name);
  eq(grammar.patterns.omte.retired, true);
  eq(grammar.patterns.omte.source, nl.patterns.omte.source);
  ok(checkGrammar(grammar, { previous: nl }).grammar, JSON.stringify(checkGrammar(grammar, { previous: nl }).errors));
  const twice = withSuggestions(nl, [accepted[1], { ...accepted[1], id: "s4" }], { at: "2026-11-02" });
  ok(!twice.grammar && twice.problems[0].includes("both change \"want\""), JSON.stringify(twice.problems));
  ok(!JSON.stringify(suggestedSource({ knows: "native", via: "app", kind: "new", at: "2026-11-02" })).includes("@"), "a source with an address");
});

// ---------- the server ----------

const now = Date.now();
const WEEK = 8 * 86_400_000;
function account(id, { admin = false, terms = true, since = now - WEEK } = {}) {
  sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, `Person ${id}`, since);
  if (terms) sqlite.prepare("INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (?, 1, ?)").run(id, now);
  if (admin) sqlite.prepare("INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (?, 'admin', ?, 'd1', 'test')").run(id, now);
  return id;
}
const ana = account("ana");
const bo = account("bo");
const cy = account("cy", { terms: false });
const dee = account("dee", { since: now - 1000 }); // a newcomer: 5 a day
const admin = account("admin-1", { admin: true });
const app = (userId) => ({ userId, via: "device", ai: false });
const ai = (userId) => ({ userId, via: "mcp:Claude Code", ai: true });

await test("who may suggest: while sharing is an admin's, only an admin; then anyone who accepted the terms", async () => {
  env.COMMUNITY_SHARING = "admins";
  await refuses(() => suggestPattern(env, app(ana), { language: "nl", kind: "new", name: "zelf", about: ZELF, knows: "native" }), "only the library's admins");
  env.COMMUNITY_SHARING = "everyone";
  await refuses(() => suggestPattern(env, app(cy), { language: "nl", kind: "new", name: "zelf", about: ZELF, knows: "native" }), "sharing terms");
  await refuses(() => suggestPattern(env, app(ana), { language: "xx", kind: "new", name: "zelf", about: ZELF, knows: "native" }), "language is");
  await refuses(() => suggestPattern(env, app(ana), { language: "nl", kind: "new", name: "zelf", about: ZELF, knows: "a bit" }), "knows says");
  await refuses(() => suggestPattern(env, app(ana), { language: "nl", kind: "new", name: "zelf", about: ZELF, knows: "native", note: { toString: null } }), "note is text");
});

let zelf;
await test("a suggestion that doesn't pass: every problem at once, nothing kept; one that does: kept, made against the revision it saw", async () => {
  const bad = await suggestPattern(env, app(ana), { language: "nl", kind: "new", name: "zelf", about: "Put zelf after a word.", after: ["nope"], knows: "native" });
  ok(!bad.suggested && bad.problems.length === 2, JSON.stringify(bad));
  eq(row("SELECT COUNT(*) AS n FROM grammar_suggestions").n, 0);
  const good = await suggestPattern(env, ai(ana), { language: "nl", kind: "new", pattern: "zelf", name: "zelf: -self", about: ZELF, after: ["object"], knows: "native", note: "Very common." });
  ok(good.suggested, JSON.stringify(good));
  zelf = good.suggestion;
  eq([zelf.pattern, zelf.kind, zelf.via, zelf.knows, zelf.against, zelf.state, zelf.mine, zelf.by], ["zelf", "new", "ai", "native", 1, "open", true, "Person ana"]);
});

await test("one open suggestion of yours per pattern; a new id someone suggested already: like theirs", async () => {
  // A fix to "zelf": not a pattern of the grammar yet (it's a suggestion), so it doesn't pass, and nothing's kept.
  const notYet = await suggestPattern(env, app(ana), { language: "nl", kind: "fix", pattern: "zelf", about: ZELF, knows: "native" });
  ok(!notYet.suggested && notYet.problems.some((p) => p.includes("isn't a pattern of this grammar")), JSON.stringify(notYet));
  await suggestPattern(env, app(ana), { language: "nl", kind: "fix", pattern: "want", about: "Join with want (because): ik blijf, want ik ben moe (I stay, because I am tired).", knows: "native" });
  await refuses(() => suggestPattern(env, app(ana), { language: "nl", kind: "retire", pattern: "want", knows: "native" }), "waiting already");
  await refuses(() => suggestPattern(env, app(bo), { language: "nl", kind: "new", pattern: "zelf", name: "zelf", about: ZELF, knows: "learning" }), "like theirs");
});

await test("listed: the open ones most liked first, one pattern's, the decided ones too; yours whatever became of them", async () => {
  const fix = await suggestPattern(env, app(bo), { language: "nl", kind: "fix", pattern: "v2", about: "In a main clause the verb comes second: morgen ga ik (tomorrow go I).", knows: "learning" });
  ok(fix.suggested, JSON.stringify(fix));
  // Made in the same millisecond as "want" (as Node often does it): equal likes and equal times still list in the order
  // they were made, never by the index's order (v2 before want), as they did 1 run in 5 before the rowid tie-break.
  sqlite.prepare("UPDATE grammar_suggestions SET created_at = (SELECT created_at FROM grammar_suggestions WHERE pattern = 'want') WHERE id = ?").run(fix.suggestion.id);
  await likeSuggestion(env, bo, zelf.id, true);
  const open = await listSuggestions(env, bo, { language: "nl" });
  eq(open.map((s) => s.pattern), ["zelf", "want", "v2"]);
  ok(open[0].liked === true && open[0].likes === 1 && !open[0].mine, JSON.stringify(open[0]));
  eq((await listSuggestions(env, ana, { language: "nl", pattern: "v2" })).map((s) => s.by), ["Person bo"]);
  eq((await listSuggestions(env, ana, { mine: true })).length, 2);
  await refuses(() => listSuggestions(env, null, { mine: true }), "Sign in");
});

await test("likes: not your own, one each, taken back; never on one decided", async () => {
  await refuses(() => likeSuggestion(env, ana, zelf.id, true), "That one's yours");
  eq((await likeSuggestion(env, bo, zelf.id, true)).likes, 1);
  eq((await likeSuggestion(env, bo, zelf.id, false)).likes, 0);
  eq((await likeSuggestion(env, bo, zelf.id, true)).likes, 1);
});

await test("withdrawing: yours, while it waits", async () => {
  const mine = (await listSuggestions(env, ana, { mine: true })).find((s) => s.pattern === "want");
  await refuses(() => withdrawSuggestion(env, bo, mine.id), "no suggestion of yours");
  eq((await withdrawSuggestion(env, ana, mine.id)).state, "withdrawn");
  await refuses(() => withdrawSuggestion(env, ana, mine.id), "withdrawn already");
  ok(!(await listSuggestions(env, bo, { language: "nl" })).some((s) => s.id === mine.id), "a withdrawn one listed as open");
  eq((await listSuggestions(env, bo, { language: "nl", decided: true })).find((s) => s.id === mine.id)?.state, "withdrawn");
});

await test("reported for illegal content: hidden at once, then listed only to its author, and never liked", async () => {
  const fix = (await listSuggestions(env, ana, { language: "nl", pattern: "v2" }))[0];
  await refuses(() => reportGrammarSuggestion(env, bo, fix.id, { reason: "spam" }), "That one's yours");
  const reported = await reportGrammarSuggestion(env, ana, fix.id, { reason: "illegal", details: "a test" });
  ok(reported.hidden, JSON.stringify(reported));
  ok(!(await listSuggestions(env, ana, { language: "nl" })).some((s) => s.id === fix.id), "a hidden one listed to others");
  const theirs = (await listSuggestions(env, bo, { language: "nl" })).find((s) => s.id === fix.id);
  ok(theirs?.shown === "hidden", JSON.stringify(theirs));
  await refuses(() => likeSuggestion(env, ana, fix.id, true), "no such suggestion");
  eq(row("SELECT COUNT(*) AS n FROM reports WHERE target_kind = 'grammar' AND target_id = ?", fix.id).n, 1);
});

await test("an admin declines, saying why (shown to its suggester, logged); nobody else can", async () => {
  const caller = (userId, via = "oauth") => ({ userId, via, tokenAdmin: false });
  await refuses(() => reviewSuggestions(env, { userId: bo, via: "device", caller: caller(bo) }, { language: "nl", decline: [{ id: zelf.id, why: "no" }] }), "isn't an admin");
  await refuses(() => reviewSuggestions(env, { userId: admin, via: "token", caller: caller(admin, "token") }, { language: "nl", decline: [{ id: zelf.id, why: "no" }] }), "without admin access");
  await refuses(() => reviewSuggestions(env, { userId: admin, via: "mcp", caller: caller(admin) }, { language: "nl", decline: [{ id: zelf.id, why: "  " }] }), "Say why");
  await refuses(() => reviewSuggestions(env, { userId: admin, via: "mcp", caller: caller(admin) }, { language: "nl", accept: [zelf.id], decline: [{ id: zelf.id, why: "x" }] }), "not both");
  const done = await reviewSuggestions(env, { userId: admin, via: "mcp", caller: caller(admin) }, { language: "nl", decline: [{ id: zelf.id, why: "zelf is taught with the object words." }] });
  eq(done.declined, [zelf.id]);
  const seen = (await listSuggestions(env, ana, { mine: true })).find((s) => s.id === zelf.id);
  eq([seen.state, seen.why], ["declined", "zelf is taught with the object words."]);
  eq(row("SELECT COUNT(*) AS n FROM admin_log WHERE action = 'grammar.decline'").n, 1);
  await refuses(() => reviewSuggestions(env, { userId: admin, via: "mcp", caller: caller(admin) }, { language: "nl", decline: [{ id: zelf.id, why: "again" }] }), "isn't an open suggestion");
  // Its likes come off nobody: a declined one can't be liked again.
  await refuses(() => likeSuggestion(env, bo, zelf.id, true), "declined already");
});

await test("a newcomer's day: 5 suggestions, then refused in words", async () => {
  const ids = ["present", "de-het", "plural", "geen", "er-is"];
  for (const id of ids) ok((await suggestPattern(env, app(dee), { language: "nl", kind: "retire", pattern: id, knows: "learning" })).suggested, id);
  await refuses(() => suggestPattern(env, app(dee), { language: "nl", kind: "retire", pattern: "adjective", knows: "learning" }), "suggestions to a grammar");
});

await test("an account going: its suggestions, their likes and reports settled, and its likes off others' counts", async () => {
  const other = (await suggestPattern(env, app(bo), { language: "nl", kind: "retire", pattern: "future", knows: "learning" })).suggestion;
  await likeSuggestion(env, dee, other.id, true);
  const deesOwn = (await listSuggestions(env, dee, { mine: true }))[0];
  await likeSuggestion(env, bo, deesOwn.id, true);
  await env.DB.batch([...forgetGrammarStatements(env, dee), env.DB.prepare("DELETE FROM users WHERE id = ?").bind(dee)]);
  eq(row("SELECT COUNT(*) AS n FROM grammar_suggestions WHERE author_id = ?", dee).n, 0);
  eq(row("SELECT likes FROM grammar_suggestions WHERE id = ?", other.id).likes, 0);
  eq(rows("SELECT * FROM likes WHERE target_kind = 'grammar' AND (user_id = ? OR target_id = ?)", dee, deesOwn.id).length, 0);
});

await test("a suggestion may fix the short name and the rule in a sentence, which then go into the next revision", async () => {
  const { GRAMMAR_LIMITS } = await import(join(APP, "public/js/lang/grammar.js"));
  const seed = seedGrammar("nl");
  const grammar = { ...seed, patterns: { ...seed.patterns, v2: { ...seed.patterns.v2, chip: "Verb second", short: "The old rule." } } };
  const good = checkSuggestion({ kind: "fix", pattern: "v2", short: "In a main sentence, the verb comes second." }, grammar);
  eq(good.problems, []);
  eq(good.suggestion.change, { short: "In a main sentence, the verb comes second." });
  // The same words as it has now aren't a fix; the form sends every field, and only what changed is kept.
  eq(checkSuggestion({ kind: "fix", pattern: "v2", short: "The old rule.", chip: "Verb second" }, grammar).suggestion, null);
  eq(checkSuggestion({ kind: "fix", pattern: "v2", name: grammar.patterns.v2.name, after: grammar.patterns.v2.after, short: "New." }, grammar).suggestion.change, { short: "New." });
  eq(checkSuggestion({ kind: "fix", pattern: "v2", short: "x".repeat(GRAMMAR_LIMITS.short + 1) }, grammar).suggestion, null);
  eq(checkSuggestion({ kind: "fix", pattern: "v2", chip: "x".repeat(GRAMMAR_LIMITS.chip + 1) }, grammar).suggestion, null);
  eq(checkSuggestion({ kind: "fix", pattern: "v2", short: "   " }, grammar).suggestion, null);
  eq(checkSuggestion({ kind: "retire", pattern: "v2", short: "New." }, grammar).suggestion, null, "retiring changes nothing else");
  const { grammar: next, problems } = withSuggestions(grammar, [{ id: "s1", knows: "native", ...good.suggestion }], { at: "2026-11-05" });
  eq(problems, []);
  eq([next.patterns.v2.short, next.patterns.v2.chip, next.patterns.v2.name], ["In a main sentence, the verb comes second.", "Verb second", grammar.patterns.v2.name]);
  eq(checkGrammar(next, { previous: grammar }).errors, []);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
