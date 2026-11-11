#!/usr/bin/env node
// A language's shared grammar as data (public/js/lang/grammar.js), end to end on a LOCAL server and its own state: the
// app's revision 1 until the library has another; an admin's next revision over MCP (staged, checked, refused when it
// drops an id or skips a number, published; served at its content-named key), and a learner's token never seeing the
// admin tools; the server checking your AI's pack against it at once; a device whose grammar is older taking that pack
// through the relay (refused at first, the grammar fetched, applied), and showing it in Study (the renamed pattern,
// the new one, and none of the patterns no sentence shows yet); your AI's own pattern kept as <pack>.<id>, then made
// the shared one's (same: one unit of evidence); a restart with the library unreachable keeping it; a
// restore of the catalog never taking it back; another tab following a newer revision.
//
//   node scripts/grammar-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
//
// The server: npx wrangler dev --port <port> --local-upstream localhost:<port> --persist-to <dir> --var
// GATE_ENABLED:false --var PUBLIC_ORIGIN:http://localhost:<port> --var RP_ID:localhost --var
// UPLOAD_SIGNING_SECRET:<any local value>, after npx wrangler d1 migrations apply lexicommons --local --persist-to <dir>.
// It writes its accounts straight into that state's D1, so only a local server; a fresh state (it publishes Dutch's
// grammar there). Headless Chrome through the channel's parallel lane. Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { LANGUAGES } from "../public/js/lang/index.js";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
const PERSIST = opt("persist-to");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST) {
  console.error("Usage: grammar-check.mjs http://localhost:<port> <outDir> --persist-to <state dir>\n(it writes test accounts into that state, so only a local server)");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const results = [];
const problems = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

// ---------- accounts written straight into the local D1 ----------

const wrangler = (args) => execFileSync("npx", ["wrangler", ...args], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
const sql = (command) => {
  const out = wrangler(["d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command]);
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const run = randomBytes(3).toString("hex");
function account(name, { admin = false } = {}) {
  const id = `grm${run}${randomBytes(5).toString("hex")}`;
  const now = Date.now();
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  const statements = [
    `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'grammar-check')`,
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'grammar check', ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now}, ${admin ? 1 : 0})`,
  ];
  if (admin) statements.push(`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, 'admin', ${now}, 'd1', 'grammar-check')`);
  sql(statements.join("; "));
  return { id, name, cookie, token };
}

// ---------- MCP ----------

async function rpc(token, method, params) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(line.slice(6));
}
async function tool(token, name, args = {}) {
  const { result, error } = await rpc(token, "tools/call", { name, arguments: args });
  if (error) return { error: error.message };
  const text = result.content[0].text;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  return result.isError ? { error: typeof value === "string" ? value : JSON.stringify(value), value } : value;
}
async function must(token, name, args) {
  const value = await tool(token, name, args);
  if (value?.error) throw new Error(`${name}: ${value.error.slice(0, 600)}`);
  return value;
}
/** Stages one grammar file through library_upload and the script it gives. Returns its sha256. */
async function stageGrammar(token, grammar) {
  const bytes = Buffer.from(JSON.stringify(grammar, null, 2));
  const file = { name: `grammar-${grammar.revision}-${sha256(bytes).slice(0, 8)}.json`, type: "application/json", size: bytes.length, sha256: sha256(bytes) };
  const staged = await must(token, "library_upload", { files: [file] });
  if (staged.script) {
    const dir = mkdtempSync(join(tmpdir(), "grammar-check-"));
    writeFileSync(join(dir, file.name), bytes);
    writeFileSync(join(dir, "send.sh"), staged.script);
    const output = execFileSync("sh", ["send.sh"], { cwd: dir }).toString();
    rmSync(dir, { recursive: true, force: true });
    const answers = output.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l.replace(/^[^{]*/, "")));
    assert(answers.length === staged.toSend && answers.every((a) => a.ok), `the upload script: ${output.slice(0, 300)}`);
  }
  return file.sha256;
}

// ---------- Dutch's next revisions ----------

// Dutch's revision 1 as the app has it (lang/grammar.js's seed, built here from the registry so this check runs on an
// app from before grammar files too, and fails there in words).
const SEED_SOURCE = { by: "Lexicommons", note: "First drafted by Lexicommons, open to correction." };
const seedNl = () => ({
  format: "lexicommons-grammar",
  version: 1,
  language: "nl",
  revision: 1,
  patterns: Object.fromEntries(Object.entries(LANGUAGES.nl.patterns).map(([id, p]) => [id, { name: p.name, about: p.about, after: [...p.after], source: { ...(p.source ?? SEED_SOURCE) } }])),
});

const ADDED = { name: "zelf: -self, for emphasis", about: "Put zelf after a word to stress it: ik doe het zelf (I do it self), zij zelf (she self).", after: ["object"], source: { by: "Grammar check", reviewed: "none: a check's pattern", at: "2026-11-02" } };
function dutch(revision) {
  const g = seedNl();
  g.revision = revision;
  g.patterns.v2 = { ...g.patterns.v2, name: "Verb second: the verb in second place" };
  g.patterns["check-zelf"] = ADDED;
  if (revision >= 3) g.patterns["check-zelf"] = { ...ADDED, about: `${ADDED.about} Revision 3 says so again.` };
  return g;
}
// The AI's sentence, in its own form, an example of the pattern revision 2 adds.
const ZELF = { sentence: "Ik doe het zelf.", lemmas: { doe: "doen", zelf: "zelf" }, literal: ["I", "do", "it", "self."], english: [0, 1, 2, 3], natural: "I do it myself.", wrong: ["Ik zelf doe het.", "Zelf ik doe het."], gap: { word: "zelf", options: ["zelf", "zich", "zelfs"] }, patterns: ["check-zelf"] };

// ---------- the run ----------

const admin = account("Grammar admin", { admin: true });
const learner = account("Grammar learner");
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await context.addCookies([{ name: "lc_session", value: learner.cookie, url: BASE }]);
const watch = (p) => {
  p.on("console", (m) => {
    if (m.type() === "error" && !/ERR_INTERNET_DISCONNECTED|ERR_FAILED|net::ERR_/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  p.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
};
const page = await context.newPage();
watch(page);
// The device's Dutch grammar (an app from before grammar files: its registry, revision 1).
const grammarHere = (p = page) => p.evaluate(async () => {
  const g = await import("/js/lang/grammar.js").then((m) => m.grammarNow("nl"), async () => ({ revision: 1, libraryVersion: null, patterns: (await import("/js/lang/index.js")).LANGUAGES.nl.patterns }));
  return { revision: g.revision, version: g.libraryVersion, v2: g.patterns.v2.name, zelf: g.patterns["check-zelf"]?.name ?? null };
});
async function until(p, fn, arg, timeout = 20_000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await p.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error(`still not true after ${timeout / 1000} s: ${fn.toString().slice(0, 160)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}
// A picture once the page has settled: no slide between pages (or anything else) still moving.
const shot = async (name, p = page) => {
  await p.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
  await p.screenshot({ path: join(OUT, "shots", `${name}.png`) });
};
const patternRows = (p = page) => p.evaluate(() => [...document.querySelectorAll('[data-part="section"]')].find((s) => s.querySelector('[data-part="section-title"]')?.textContent === "Patterns")?.querySelectorAll('[data-part="list-row"]').length ?? 0);
const patternNames = (p = page) =>
  p.evaluate(() => [...([...document.querySelectorAll('[data-part="section"]')].find((s) => s.querySelector('[data-part="section-title"]')?.textContent === "Patterns")?.querySelectorAll('[data-part="list-row"] .lx-row-title') ?? [])].map((n) => n.textContent));
let revBefore = null;

await stage("before: the app's own revision 1, the catalog naming none; a learner's token sees no admin tools", async () => {
  await page.goto(`${BASE}/app/#study`);
  await until(page, async () => Boolean((await import("/js/study/pack-inbox.js")) && document.querySelector('[data-part="page"]')));
  const here = await grammarHere();
  assert(here.revision === 1 && here.version === null && here.v2 === "Verb second" && !here.zelf, JSON.stringify(here));
  const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json();
  assert(!catalogue.grammar?.nl, JSON.stringify(catalogue.grammar));
  const learnerTools = (await rpc(learner.token, "tools/list", {})).result.tools.map((t) => t.name);
  assert(!learnerTools.includes("library_publish"), "a learner sees library_publish");
  const refused = await tool(learner.token, "library_publish", { grammar: "0".repeat(64) });
  assert(refused.error, JSON.stringify(refused));
  // A revision of the catalog from before any grammar (a fresh state has none yet), for the restore stage.
  await must(admin.token, "library_shelf", { sections: [] });
  revBefore = (await must(admin.token, "library_get", {})).rev;
  assert(revBefore >= 1, `the catalog's revision: ${revBefore}`);
  return `${Object.keys(seedNl().patterns).length} Dutch patterns, catalog revision ${revBefore}`;
});

await stage("your AI's pack with a pattern the grammar doesn't have yet: refused by the server, nothing queued", async () => {
  const made = await tool(learner.token, "create_pack", { name: "Zelf check", language: "nl", items: [ZELF], words: { doen: "to do", zelf: "self" } });
  assert(made.error && made.error.includes("check-zelf"), JSON.stringify(made).slice(0, 400));
});

await stage("an admin's revision that drops an id, or skips a number, or is the same, is refused in words", async () => {
  const dropped = dutch(2);
  delete dropped.patterns.niet;
  const a = await must(admin.token, "library_check", { grammar: await stageGrammar(admin.token, dropped) });
  assert(!a.ok && JSON.stringify(a.problems).includes("It leaves out niet") && JSON.stringify(a.problems).includes("Retire it instead"), JSON.stringify(a.problems));
  const b = await must(admin.token, "library_check", { grammar: await stageGrammar(admin.token, dutch(3)) });
  assert(!b.ok && JSON.stringify(b.problems).includes("revision must be 2"), JSON.stringify(b.problems));
  const same = { ...seedNl(), revision: 2 };
  const c = await must(admin.token, "library_check", { grammar: await stageGrammar(admin.token, same) });
  assert(!c.ok && JSON.stringify(c.problems).includes("nothing to publish"), JSON.stringify(c.problems));
  const loop = dutch(2);
  loop.patterns.v2.after = ["dat"];
  const d = await must(admin.token, "library_check", { grammar: await stageGrammar(admin.token, loop) });
  assert(!d.ok && JSON.stringify(d.problems).includes("loop"), JSON.stringify(d.problems));
});

let published = null;
await stage("an admin publishes Dutch's revision 2 over MCP: checked, published, on the catalog, served at its content's key", async () => {
  const sha = await stageGrammar(admin.token, dutch(2));
  const checked = await must(admin.token, "library_check", { grammar: sha });
  assert(checked.ok && checked.wouldPublish.revision === 2, JSON.stringify(checked).slice(0, 500));
  assert(JSON.stringify(checked.wouldPublish.changes) === JSON.stringify({ added: ["check-zelf"], changed: ["v2"], retired: [], restored: [] }), JSON.stringify(checked.wouldPublish.changes));
  published = await must(admin.token, "library_publish", { grammar: sha, note: "grammar check: revision 2" });
  assert(published.published && published.what.grammar === "nl" && published.what.patterns === 30, JSON.stringify(published).slice(0, 400));
  const view = await must(admin.token, "library_get", {});
  const entry = view.grammar.nl;
  assert(entry.revision === 2 && entry.url === `/library/grammar/nl/${entry.version}.json`, JSON.stringify(view.grammar));
  const response = await fetch(`${BASE}${entry.url}`);
  const file = await response.json();
  assert(response.ok && /immutable/.test(response.headers.get("cache-control")) && response.headers.get("content-security-policy")?.includes("sandbox"), `${response.status} ${response.headers.get("cache-control")}`);
  assert(file.revision === 2 && file.patterns["check-zelf"].source.by === "Grammar check" && sha256(JSON.stringify(file)).slice(0, 12) === entry.version, "the file is the checked grammar, named by its content");
  const history = await must(admin.token, "library_history", { limit: 1 });
  assert(history[0].holds.grammar.nl === "revision 2", JSON.stringify(history[0].holds));
  return `revision 2 at ${entry.version}`;
});

let changeId = null;
await stage("the server checks against it at once: the same pack from your AI is taken now", async () => {
  const made = await must(learner.token, "create_pack", { name: "Zelf check", language: "nl", items: [ZELF], words: { doen: "to do", zelf: "self" } });
  assert(made.pack_id === "zelf-check" && made.change_id, JSON.stringify(made));
  changeId = made.change_id;
});

await stage("this device, its grammar still revision 1, takes the pack: refused at first, the grammar fetched, then applied", async () => {
  const here = await grammarHere();
  assert(here.revision === 1, `the device synced first: ${JSON.stringify(here)}`);
  await page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
  await until(page, async () => Boolean((await import("/js/study/packs.js")).yourPack("zelf-check")));
  const after = await grammarHere();
  assert(after.revision === 2 && after.version === published.what.version && after.zelf === ADDED.name && after.v2 === "Verb second: the verb in second place", JSON.stringify(after));
  const [change] = await must(learner.token, "list_pack_changes", {});
  assert(change.change_id === changeId && change.state === "applied" && change.devices.every((d) => d.state === "applied"), JSON.stringify(change));
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("lx.grammar.v1") ?? "{}").nl?.version);
  assert(kept === after.version, `kept ${kept}`);
  return "applied on the second try";
});

await stage("Study offers the patterns sentences show: the renamed one, the new one, never one no sentence shows", async () => {
  // The patterns sentences show (More ways' One concept list is gone; Choose your concepts offers these once you've met them).
  await page.goto(`${BASE}/app/#study`);
  await until(page, () => document.querySelectorAll('[data-part="way-tile"]').length > 3);
  const names = await page.evaluate(async () => {
    const { PATTERNS, PATTERNS_IN_USE } = await import("/js/study/content.js");
    return Object.keys(PATTERNS).filter((id) => PATTERNS_IN_USE.has(id)).map((id) => PATTERNS[id].name);
  });
  assert(names.includes("Verb second: the verb in second place") && names.includes(ADDED.name), names.join(" | "));
  const unused = seedNl().patterns["time-place"]?.name ?? "Time, then how, then where";
  assert(!names.includes(unused) && !names.includes("Verb second"), `${unused} offered: ${names.join(" | ")}`);
  const map = await page.evaluate(async () => (await import("/js/know/summary.js")).grammarMap().map((r) => r.name));
  assert(map.includes(ADDED.name) && !map.includes(unused), map.join(" | "));
  await shot("01-study-patterns");
  return `${names.length} patterns offered`;
});

// Phase 3: a pack's own pattern, made by your AI, is the pack's; and once it's the shared grammar's (same), one unit.
const EIGEN = { sentence: "Wij doen het zelf.", lemmas: { doen: "doen", zelf: "zelf" }, literal: ["We", "do", "it", "self."], english: [0, 1, 2, 3], natural: "We do it ourselves.", wrong: ["Wij zelf doen het.", "Zelf wij doen het."], gap: { word: "zelf", options: ["zelf", "zich", "zelfs"] }, patterns: ["nadruk"] };
const NADRUK = { name: "zelf for emphasis (the pack's own)", about: "zelf after a word stresses it: wij doen het zelf (we do it self)." };
await stage("your AI's own pattern is the pack's: kept as <pack>.<id>, its sentence following, on this device and in Study", async () => {
  const made = await must(learner.token, "create_pack", { name: "Eigen check", language: "nl", items: [EIGEN], words: { doen: "to do", zelf: "self" }, patterns: { nadruk: NADRUK } });
  assert(made.pack_id === "eigen-check", JSON.stringify(made));
  const read = await must(learner.token, "get_pack", { pack_id: "eigen-check" });
  assert(Object.keys(read.patterns ?? {}).join() === "eigen-check.nadruk" && read.items[0].patterns.join() === "eigen-check.nadruk", JSON.stringify({ patterns: read.patterns, item: read.items[0] }).slice(0, 400));
  await page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
  await until(page, async () => Boolean((await import("/js/study/packs.js")).yourPack("eigen-check")));
  await until(page, async () => "eigen-check.nadruk" in (await import("/js/study/content.js")).PATTERNS);
  return "eigen-check.nadruk";
});

await stage("same: your AI says the pack's own is the shared grammar's; its sentence counts for the shared one, and the evidence is one unit", async () => {
  // Evidence under the pack's own id first, as a session would have recorded it before.
  const at = Date.now() - 2 * 86_400_000;
  await page.evaluate(async (at) => (await import("/js/study/progress.js")).record([{ concept: "p:eigen-check.nadruk", at, lang: "nl", outcome: "right", test: "recall", skill: "read", activity: "test", item: "eigen-check/x" }]), at);
  const before = await page.evaluate(async () => (await import("/js/study/progress.js")).unitState("p:check-zelf", { lang: "nl" }).reviews);
  const refused = await tool(learner.token, "update_pack", { pack_id: "eigen-check", patterns: { nadruk: { ...NADRUK, same: "nope" } } });
  assert(refused.error && refused.error.includes("nope"), JSON.stringify(refused).slice(0, 300));
  await must(learner.token, "update_pack", { pack_id: "eigen-check", patterns: { nadruk: { ...NADRUK, same: "check-zelf" } } });
  await page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
  await until(page, async () => (await import("/js/study/packs.js")).yourPack("eigen-check")?.pack.patterns["eigen-check.nadruk"]?.same === "check-zelf");
  await until(page, async () => !("eigen-check.nadruk" in (await import("/js/study/content.js")).PATTERNS));
  const after = await page.evaluate(async () => {
    const progress = await import("/js/study/progress.js");
    const content = await import("/js/study/content.js");
    return { reviews: progress.unitState("p:check-zelf", { lang: "nl" }).reviews, item: content.ITEMS.find((i) => i.pack === "eigen-check")?.concepts, studied: progress.studiedUnits("nl").filter((u) => u.includes("nadruk") || u.includes("check-zelf")) };
  });
  assert(after.reviews === before + 1 && after.item?.join() === "check-zelf" && after.studied.join() === "p:check-zelf", JSON.stringify({ before, after }));
  return `p:check-zelf reviews ${before} → ${after.reviews}`;
});

await stage("a restart with the library unreachable: the grammar kept here is installed before any pack is checked", async () => {
  await page.route(/\/library\//, (route) => route.abort());
  await page.reload();
  await until(page, async () => Boolean((await import("/js/study/packs.js")).yourPack("zelf-check")));
  const here = await grammarHere();
  const refused = await page.evaluate(async () => (await import("/js/study/packs.js")).packProblems());
  assert(here.revision === 2 && here.zelf === ADDED.name && !refused.length, JSON.stringify({ here, refused }));
  await page.unroute(/\/library\//);
});

await stage("a restore of the catalog from before it never takes the grammar back", async () => {
  const restored = await must(admin.token, "library_restore", { rev: revBefore });
  assert(JSON.stringify(restored.grammarKept) === '["nl"]', JSON.stringify(restored));
  const view = await must(admin.token, "library_get", {});
  assert(view.grammar.nl?.revision === 2, JSON.stringify(view.grammar));
  const [last] = await must(admin.token, "library_history", { limit: 1 });
  assert(last.note.includes("The grammar of nl stays at its newest revision"), last.note);
});

await stage("another tab follows a newer revision this tab syncs: revision 3, installed there through storage, its packs checked again", async () => {
  const other = await context.newPage();
  watch(other);
  await other.goto(`${BASE}/app/#study`);
  await until(other, async () => Boolean((await import("/js/study/packs.js")).yourPack("zelf-check")));
  assert((await grammarHere(other)).revision === 2, "the other tab");
  const sha = await stageGrammar(admin.token, dutch(3));
  const published3 = await must(admin.token, "library_publish", { grammar: sha, note: "grammar check: revision 3" });
  assert(published3.published && published3.what.revision === 3, JSON.stringify(published3).slice(0, 300));
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  assert((await grammarHere()).revision === 3, "this tab");
  await until(other, async () => (await import("/js/lang/grammar.js").catch(() => null))?.grammarNow("nl").revision === 3, undefined, 10_000);
  const about = await other.evaluate(async () => (await import("/js/study/content.js")).PATTERNS["check-zelf"]?.about);
  assert(about?.includes("Revision 3 says so again."), about);
  await other.close();
});

// A pattern's short name and rule, and what's longer about it: what a tap on a concept after a question opens.
const stageMore = (token, more) => stageGrammar(token, more);
const MORE = { explain: "The verb comes second. English keeps the word for who does it first.", examples: [{ text: "Morgen werk ik thuis.", means: "Tomorrow I'm working at home.", literal: "Tomorrow work I at-home.", marks: [0, 1] }], contrasts: [{ with: "English", says: "English says I work, whatever comes first." }], mistakes: [{ wrong: "Morgen ik werk thuis.", right: "Morgen werk ik thuis.", why: "the verb comes second" }], source: { by: "Lexicommons", drafted: "with AI", note: "Open to correction." } };
const moreFile = (concepts) => ({ format: "lexicommons-grammar-more", version: 1, language: "nl", concepts });
const moreHere = (id, on = page) => on.evaluate(async (id) => (await import("/js/study/grammar.js")).patternMore("nl", id), id);

await stage("a pattern's short name and rule: published as a revision, reaching this device and what a concept shows", async () => {
  const next = dutch(4);
  next.patterns.v2 = { ...next.patterns.v2, chip: "Verb second", short: "In a main sentence, the verb comes second." };
  const sha = await stageGrammar(admin.token, next);
  const published4 = await must(admin.token, "library_publish", { grammar: sha, note: "grammar check: revision 4" });
  assert(published4.published && published4.what.changes.changed.includes("v2"), JSON.stringify(published4).slice(0, 300));
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  const got = await page.evaluate(async () => {
    const { PATTERNS, describe } = await import("/js/study/content.js");
    const d = describe("p:v2");
    return { chip: PATTERNS.v2?.chip, short: PATTERNS.v2?.short, shown: [d.chip, d.short] };
  });
  assert(got.chip === "Verb second" && got.short?.startsWith("In a main") && got.shown[0] === "Verb second" && got.shown[1] === got.short, JSON.stringify(got));
  // A pattern with neither is as it was: what a screen falls back to.
  const plain = await page.evaluate(async () => { const { PATTERNS } = await import("/js/study/content.js"); return [PATTERNS["check-zelf"]?.chip, PATTERNS["check-zelf"]?.short, Boolean(PATTERNS["check-zelf"]?.name)]; });
  assert(plain[0] === undefined && plain[1] === undefined && plain[2], JSON.stringify(plain));
  return JSON.stringify(got.shown);
});

await stage("what's longer about a pattern: refused in words when it's wrong; published beside the grammar; served; on this device, none of it in the grammar's own key", async () => {
  const before = await moreHere("v2");
  assert(before === null, `before it's published: ${JSON.stringify(before)}`);
  const badSha = await stageMore(admin.token, moreFile({ nope: MORE }));
  const refused = await tool(admin.token, "library_check", { grammar_more: badSha });
  assert(JSON.stringify(refused).includes("isn't a pattern of the grammar"), JSON.stringify(refused).slice(0, 400));
  const sha = await stageMore(admin.token, moreFile({ v2: MORE }));
  const published5 = await must(admin.token, "library_publish", { grammar_more: sha, note: "grammar check: what's longer" });
  assert(published5.published && published5.what.concepts === 1, JSON.stringify(published5).slice(0, 300));
  const catalogue = await (await fetch(`${BASE}/library/catalogue.json`, { cache: "no-store" })).json();
  const ref = catalogue.grammar.nl.more;
  assert(ref?.version === published5.what.version && ref.url.endsWith(`/more.${ref.version}.json`), JSON.stringify(catalogue.grammar.nl));
  const served = await fetch(`${BASE}${ref.url}`);
  assert(served.ok && (await served.json()).concepts.v2.explain === MORE.explain, `served ${served.status}`);
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  const got = await moreHere("v2");
  assert(got?.examples?.[0]?.marks?.join() === "0,1" && got.mistakes[0].right === MORE.mistakes[0].right && got.source?.by === "Lexicommons", JSON.stringify(got));
  assert((await moreHere("question")) === null, "a pattern it says nothing about");
  const kept = await page.evaluate(() => localStorage.getItem("lx.grammar.v1") ?? "");
  assert(kept.includes("Verb second") && !kept.includes(MORE.explain), "the grammar's own key took the long text");
  await shot("02-more-synced");
  return `version ${ref.version}`;
});

await stage("a longer file that isn't what the catalog says is left out; the one here stays, and a start offline still has it", async () => {
  // A new version, its bytes changed on the way: the device says nothing and keeps the one it has.
  const sha = await stageMore(admin.token, moreFile({ v2: { ...MORE, explain: `${MORE.explain} A second version.` } }));
  const published = await must(admin.token, "library_publish", { grammar_more: sha, note: "grammar check: a second longer file" });
  const url = `/library/grammar/nl/more.${published.what.version}.json`;
  // In the page's own fetch: the service worker makes the request a route would have to catch.
  await page.evaluate(({ url, body }) => {
    window.lxRealFetch = window.fetch;
    window.lxTaken = 0;
    window.fetch = (input, options) => (String(input?.url ?? input).endsWith(url) ? (window.lxTaken++, Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "application/json" } }))) : window.lxRealFetch(input, options));
  }, { url, body: JSON.stringify(moreFile({ v2: { ...MORE, explain: "Changed on the way." } })) });
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  assert((await page.evaluate(() => window.lxTaken)) >= 1, "the sync never asked for the new file, so this proves nothing");
  assert((await moreHere("v2")).explain === MORE.explain, `took a changed file: ${(await moreHere("v2")).explain}`);
  await page.evaluate(() => { window.fetch = window.lxRealFetch; });
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  assert((await moreHere("v2")).explain.endsWith("A second version."), `the real one: ${(await moreHere("v2")).explain}`);
  // Offline, from storage, in a fresh start.
  await page.route("**/library/**", (route) => route.abort());
  await page.reload();
  await until(page, async () => (await import("/js/lang/grammar.js")).grammarNow("nl").revision >= 4);
  assert((await moreHere("v2")).explain.endsWith("A second version."), "gone after a start with the library unreachable");
  await page.unroute("**/library/**");
  return "kept";
});

await stage("the next revision of the grammar keeps what's longer", async () => {
  const before = (await (await fetch(`${BASE}/library/catalogue.json`, { cache: "no-store" })).json()).grammar.nl;
  const next = dutch(5);
  next.patterns.v2 = { ...next.patterns.v2, chip: "Verb second", short: "In a main sentence, the verb always comes second." };
  const published = await must(admin.token, "library_publish", { grammar: await stageGrammar(admin.token, next), note: "grammar check: revision 5" });
  const after = (await (await fetch(`${BASE}/library/catalogue.json`, { cache: "no-store" })).json()).grammar.nl;
  assert(published.published && after.revision === before.revision + 1, JSON.stringify(after));
  assert(after.more?.version === before.more?.version, `more lost: ${JSON.stringify(after)}`);
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  assert((await moreHere("v2")).explain.endsWith("A second version."), "the device lost it");
  return `revision ${after.revision}`;
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
if (problems.length) console.log(`\nconsole and page errors:\n  ${problems.join("\n  ")}`);
writeFileSync(join(OUT, "grammar-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
console.log(`\n${passed}/${results.length} stages passed${problems.length ? `, ${problems.length} console errors` : ""}`);
process.exit(passed === results.length && !problems.length ? 0 : 1);
