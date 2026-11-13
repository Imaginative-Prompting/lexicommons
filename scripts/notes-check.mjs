#!/usr/bin/env node
// A default pack's notes end to end on a LOCAL server and its own state (study/pack-notes.js, study/notes.js, src/library-admin.ts): an admin's refusals and publish over MCP, served; a learner's token never seeing them as a tool;
// a device taking them with its packs, its words and marks at a tap, a saving-data device waiting, and a start with the library and the network gone still having them, from a real installed service worker's cache; a new version of the pack keeping them, a changed sentence with none and the rest as they were.
//
//   node scripts/notes-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>     (path-nl seeded as a default pack, exit 2 otherwise; a fresh state)
//
// Headless Chrome through the channel's parallel lane. Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
const PERSIST = opt("persist-to");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST) {
  console.error("Usage: notes-check.mjs http://localhost:<port> <outDir> --persist-to <state dir>\n(it writes test accounts into that state, so only a local server)");
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

async function stageBytes(token, name, bytes) {
  const file = { name, type: "application/json", size: bytes.length, sha256: sha256(bytes) };
  const staged = await must(token, "library_upload", { files: [file] });
  if (staged.script) {
    const dir = mkdtempSync(join(tmpdir(), "notes-check-"));
    writeFileSync(join(dir, name), bytes);
    writeFileSync(join(dir, "send.sh"), staged.script);
    const output = execFileSync("sh", ["send.sh"], { cwd: dir }).toString();
    rmSync(dir, { recursive: true, force: true });
    const answers = output.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l.replace(/^[^{]*/, "")));
    assert(answers.length === staged.toSend && answers.every((a) => a.ok), `the upload script: ${output.slice(0, 300)}`);
  }
  return file.sha256;
}
const catalog = async () => (await fetch(`${BASE}/library/catalogue.json`, { cache: "no-store" })).json();
const first = await catalog();
if (!(first.packs?.nl ?? []).some((pack) => pack.id === "path-nl")) {
  console.error("notes-check: the local library doesn't list path-nl; seed it first.");
  process.exit(2);
}
const PACK = JSON.parse(readFileSync(join(APP, "packs/path-nl.json"), "utf8"));
const take = PACK.items.filter((item) => item.words?.length).slice(0, 30);
const noteFile = (extra = {}) => ({
  format: "lexicommons-notes",
  version: 1,
  pack: "path-nl",
  language: "nl",
  source: { by: "Lexicommons", drafted: "a check", reviewed: "nobody" },
  items: Object.fromEntries(take.map((item) => [item.id, { text: item.text, words: item.words.map(([word], i) => ({ role: i ? "a later word" : "the first word", ...(i === 1 && item.concepts?.[0] ? { concept: item.concepts[0], why: `Why ${word} is here.` } : {}) })) }])),
  ...extra,
});
const bytesOf = (value) => Buffer.from(JSON.stringify(value));
const admin = account("Notes admin", { admin: true });
const learner = account("Notes learner");
let published = null;
const SAMPLE = take[0];

await stage("a learner's token has no such tool, and the server refuses what's wrong in words", async () => {
  const refused = await tool(learner.token, "library_publish", { notes: "0".repeat(64) });
  assert(refused.error, `a learner published: ${JSON.stringify(refused).slice(0, 200)}`);
  const wrongCount = noteFile();
  wrongCount.items[SAMPLE.id].words.pop();
  const a = await tool(admin.token, "library_check", { notes: await stageBytes(admin.token, "wrong-count.json", bytesOf(wrongCount)) });
  assert(/words/.test(JSON.stringify(a)) && a.ok !== true, `a word short: ${JSON.stringify(a).slice(0, 300)}`);
  const wrongPack = noteFile({ pack: "not-on-the-catalog" });
  const b = await tool(admin.token, "library_check", { notes: await stageBytes(admin.token, "wrong-pack.json", bytesOf(wrongPack)) });
  assert(/no default pack/.test(JSON.stringify(b)), `a pack that isn't there: ${JSON.stringify(b).slice(0, 300)}`);
  const script = noteFile();
  script.items[SAMPLE.id].words[0].concept = "not-on-this-sentence";
  const c = await tool(admin.token, "library_check", { notes: await stageBytes(admin.token, "wrong-concept.json", bytesOf(script)) });
  assert(/doesn't name/.test(JSON.stringify(c)), `a concept it doesn't have: ${JSON.stringify(c).slice(0, 300)}`);
  return "4 refused";
});

await stage("an admin publishes them: checked, on the catalog beside the packs, served from their own key", async () => {
  const sha = await stageBytes(admin.token, "notes.json", bytesOf(noteFile()));
  const checked = await must(admin.token, "library_check", { notes: sha });
  assert(checked.ok === true && checked.wouldPublish?.sentences === take.length, JSON.stringify(checked).slice(0, 400));
  published = await must(admin.token, "library_publish", { notes: sha, note: "notes check" });
  assert(published.published && published.what.notes === "path-nl", JSON.stringify(published).slice(0, 400));
  const entry = (await catalog()).notes["path-nl"];
  assert(entry.version === published.what.version && entry.url === `/library/notes/path-nl/${entry.version}.json` && entry.sentences === take.length, JSON.stringify(entry));
  const served = await fetch(`${BASE}${entry.url}`);
  assert(served.ok && (await served.json()).items[SAMPLE.id].text === SAMPLE.text, `served ${served.status}`);
  // Published, its staged file is gone: staged again, the same notes have nothing to publish.
  const again = await tool(admin.token, "library_publish", { notes: await stageBytes(admin.token, "notes.json", bytesOf(noteFile())), note: "again" });
  assert(/already these/.test(JSON.stringify(again)), JSON.stringify(again).slice(0, 300));
  return `${entry.sentences} sentences at ${entry.version}`;
});

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await context.addCookies([{ name: "lc_session", value: learner.cookie, url: BASE }]);
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error" && !/ERR_INTERNET_DISCONNECTED|ERR_FAILED|net::ERR_|Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const sync = () => page.evaluate(async () => (await (await import("/js/study/packs.js")).syncLibraryPacks()).problems ?? []);
const notesOfSample = (id = SAMPLE.id) => page.evaluate(async (one) => {
  const { ITEMS } = await import("/js/study/content.js");
  const item = ITEMS.find((it) => String(it.id).split("/").pop() === one);
  if (!item) return { missing: true };
  const { notesOfItem } = await import("/js/study/notes.js");
  return { item: item.id, pack: item.pack, notes: await notesOfItem(item) };
}, id);

await stage("a device with the pack takes them when it syncs, and a sentence has its words and marks at a tap", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForSelector("html[data-app-ready]");
  const problemsNow = await sync();
  assert(!problemsNow.some((p) => /notes/.test(p.at ?? "")), JSON.stringify(problemsNow).slice(0, 300));
  const got = await notesOfSample();
  assert(got.notes?.words?.length === SAMPLE.words.length && got.notes.words[0].role === "the first word", JSON.stringify(got).slice(0, 400));
  if (SAMPLE.concepts?.[0]) assert(got.notes.marks[SAMPLE.concepts[0]]?.join() === "1", JSON.stringify(got.notes.marks));
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("lx.notes.v1") ?? "{}")["path-nl"]?.version);
  assert(kept === published.what.version, `kept ${kept}`);
  const inTheStart = await page.evaluate(() => (localStorage.getItem("lx.packs.order.v1") ?? "").length + (localStorage.getItem("lx.notes.v1") ?? "").length);
  assert(inTheStart < 5000, `${inTheStart} bytes in storage read at a start`);
  const none = await notesOfSample(PACK.items.find((item) => item.words?.length && !take.includes(item))?.id);
  assert(none.notes === null, `a sentence with no note: ${JSON.stringify(none).slice(0, 200)}`);
  return `${got.notes.words.length} words on ${got.item}`;
});

await stage("a start with the network gone: read from the device's copy, with the app's own worker in charge", async () => {
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 20_000 });
  const got = await notesOfSample();
  await context.setOffline(false);
  assert(got.notes?.words?.[0]?.role === "the first word", `offline: ${JSON.stringify(got).slice(0, 300)}`);
  return got.item;
});

// iOS Safari clears Cache Storage on its own (storage pressure, a week unused) and keeps localStorage (12 Nov 2026, found by ls-order).
await stage("Cache Storage cleared on its own, localStorage kept: after a reload the sync takes them again, the sentence has its words back, and the file is in the cache again", async () => {
  const named = () => page.evaluate(() => JSON.parse(localStorage.getItem("lx.notes.v1") ?? "{}")["path-nl"] ?? null);
  const before = await named();
  assert(before?.version === published.what.version, `named before: ${JSON.stringify(before)}`);
  await page.evaluate(async () => caches.delete("lx-notes-v1"));
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const problemsNow = await sync();
  assert(!problemsNow.some((p) => /notes/.test(p.at ?? "")), JSON.stringify(problemsNow).slice(0, 300));
  const got = await notesOfSample();
  assert(got.notes?.words?.[0]?.role === "the first word", `after the cache was cleared: ${JSON.stringify(got).slice(0, 300)}`);
  const back = await page.evaluate(async (url) => Boolean(await (await caches.open("lx-notes-v1")).match(url)), (await named())?.url);
  assert(back, "the file isn't in the cache again");
  return `${got.notes.words.length} words on ${got.item} again`;
});

await stage("saving data: nothing's fetched, and the sentence simply has none yet", async () => {
  const other = await context.browser().newContext({ viewport: { width: 390, height: 844 } });
  await other.addCookies([{ name: "lc_session", value: learner.cookie, url: BASE }]);
  await other.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true }));
  const quiet = await other.newPage();
  const asked = [];
  quiet.on("request", (r) => {
    if (r.url().includes("/library/notes/")) asked.push(r.url());
  });
  await quiet.goto(`${BASE}/app/`);
  await quiet.waitForSelector("html[data-app-ready]");
  await quiet.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  await other.close();
  assert(!asked.length, `fetched ${asked}`);
});

await stage("a new version of the pack: the catalog keeps its notes, the same sentences have them, a changed one has none, and nothing's taken twice", async () => {
  const next = JSON.parse(JSON.stringify(PACK));
  // The smallest change to a sentence: its end mark.
  const changed = next.items.find((item) => item.id === take[1].id);
  changed.punct = changed.punct === "!" ? "." : "!";
  changed.text = `${changed.words.map(([word]) => word).join(" ")}${changed.punct}`;
  const sha = await stageBytes(admin.token, "path-nl-next.json", bytesOf(next));
  const done = await tool(admin.token, "library_publish", { pack: sha, note: "notes check: a new version" });
  if (done.error || !done.published) throw new Error(`the new version: ${JSON.stringify(done).slice(0, 500)}`);
  const entry = (await catalog()).notes["path-nl"];
  assert(entry.version === published.what.version, `the notes moved: ${JSON.stringify(entry)}`);
  const asked = [];
  page.on("request", (r) => {
    if (r.url().includes("/library/notes/")) asked.push(r.url());
  });
  await sync();
  await page.waitForTimeout(300);
  assert(!asked.length, `fetched again: ${asked}`);
  const same = await notesOfSample();
  assert(same.notes?.words?.length === SAMPLE.words.length, `the unchanged one: ${JSON.stringify(same).slice(0, 300)}`);
  const stale = await notesOfSample(take[1].id);
  assert(!stale.missing && stale.notes === null, `the changed one: ${JSON.stringify(stale).slice(0, 300)}`);
  return `${take[1].id} has none now; ${SAMPLE.id} still does`;
});

await stage("a language's word forms: published on their own, taken by a device with its packs, a line by the word as it's written, a start offline still has them", async () => {
  const FORMS = { format: "lexicommons-forms", version: 1, language: "nl", source: { by: "Lexicommons", drafted: "a check" }, forms: { huis: { huizen: "plural of huis" }, gaan: { ga: "gaan with ik; with jij or je after the verb; also a command" } } };
  const bad = await tool(admin.token, "library_check", { forms: await stageBytes(admin.token, "forms-bad.json", bytesOf({ ...FORMS, language: "dutch" })) });
  assert(/language/.test(JSON.stringify(bad)) && bad.ok !== true, `a bad language: ${JSON.stringify(bad).slice(0, 300)}`);
  const unknown = await tool(admin.token, "library_check", { forms: await stageBytes(admin.token, "forms-unknown.json", bytesOf({ ...FORMS, language: "xq" })) });
  assert(/isn't a language/.test(JSON.stringify(unknown)), `a language it doesn't know: ${JSON.stringify(unknown).slice(0, 300)}`);
  const sha = await stageBytes(admin.token, "forms.json", bytesOf(FORMS));
  const done = await must(admin.token, "library_publish", { forms: sha, note: "notes check: forms" });
  assert(done.published && done.what.lines === 2, JSON.stringify(done).slice(0, 300));
  const entry = (await catalog()).forms.nl;
  assert(entry.url === `/library/forms/nl/${entry.version}.json` && entry.lines === 2, JSON.stringify(entry));
  assert((await fetch(`${BASE}${entry.url}`)).ok, "not served");
  await sync();
  const line = () => page.evaluate(async () => {
    const { formOfWord } = await import("/js/study/notes.js");
    return [await formOfWord("nl", "huis", "Huizen,"), await formOfWord("nl", "huis", "huis"), await formOfWord("nl", "gaan", "Ga")];
  });
  const got = await line();
  assert(got[0] === "plural of huis" && got[1] === null && got[2].startsWith("gaan with ik"), JSON.stringify(got));
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 20_000 });
  const offline = await line();
  await context.setOffline(false);
  assert(offline[0] === "plural of huis", `offline: ${JSON.stringify(offline)}`);
  return `${entry.lines} lines at ${entry.version}`;
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
if (problems.length) console.log(`\nconsole and page errors:\n  ${problems.join("\n  ")}`);
writeFileSync(join(OUT, "notes-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
console.log(`\n${passed}/${results.length} stages passed${problems.length ? `, ${problems.length} console errors` : ""}`);
process.exit(passed === results.length && !problems.length ? 0 : 1);
