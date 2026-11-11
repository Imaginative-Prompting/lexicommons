// Editing a pack of yours, in Chrome on a phone screen, from a new account with no AI: a copy of a pack for anyone (studying moves to it), the original
// read-only; list and search; what it means, a spelling fix and a real rewrite (said first), with everything else kept; delete and add; Undo, exactly and
// holding only what changed; a pack that isn't on the account changed offline with nothing uploaded and promising no more than it does; an imported deck's card, its
// fill-in and sounds; a pack on the account, through the relay to a second device, an AI's list and Undo; dark, light, 390 and 320 wide; no word of an AI; a Save at 4x slower.
// LOCAL only, words-nl-01 seeded as a default pack (scripts/packs/seed-local.mjs --default). Usage:
//   node scripts/pack-edit-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>]   (exit 0 = pass; 2 = not seeded)
import { chromium } from "./quiet-browser.mjs";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as undiciFetch } from "undici";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const ONLY = opt("only") && new RegExp(opt("only"));
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/pack-edit-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const fresh = new Agent({ pipelining: 0 });
const fetch = (url, init = {}) => undiciFetch(url, { ...init, dispatcher: fresh });
const SOURCE = "words-nl-01";
const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}));
if (!(catalogue.packs?.nl ?? []).some((pack) => pack.id === SOURCE)) {
  console.error(`pack-edit-check: the local library hasn't ${SOURCE}; seed it with scripts/packs/seed-local.mjs --default first.`);
  process.exit(2);
}

const results = [];
async function stage(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").slice(0, 10).join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const eq = (got, want, what) => assert(JSON.stringify(got) === JSON.stringify(want), `${what}\n got  ${JSON.stringify(got)?.slice(0, 600)}\n want ${JSON.stringify(want)?.slice(0, 600)}`);
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
};
const run = randomBytes(3).toString("hex");
function account(name, { admin = false } = {}) {
  const id = `pe${run}${randomBytes(5).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const now = Date.now();
  sql([
    `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'pack-edit-check')`,
    ...(admin ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, 'admin', ${now}, 'd1', 'pack-edit-check')`] : []),
  ].join("; "));
  return { id, name, cookie };
}
function connect(who) {
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  sql(`INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(who.id)}, 'pack-edit-check', ${q(sha256(token))}, ${q(token.slice(0, 12))}, ${Date.now()}, 0)`);
  who.token = token;
}
async function tool(who, name, args = {}) {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${name}: ${response.status} ${text.slice(0, 300)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error) throw new Error(`${name}: ${error.message}`);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}
const until = async (what, fn, ms = 30_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`waited ${ms / 1000} s for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
};

const browser = await chromium.launch();
/** A device of this account: theme graphite (dark) or paper (light). video: a folder for a recording of it. */
async function device(who, { width = 390, height = 844, theme = "graphite", video } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, ...(video ? { recordVideo: { dir: video, size: { width, height } } } : {}) });
  await context.addCookies([{ name: "lc_session", value: who.cookie, url: BASE, httpOnly: true, secure: false, sameSite: "Lax" }]);
  await context.addInitScript((id) => {
    try {
      if (!localStorage.getItem("lx.appearance.v1")) localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme: id, presets: {} }));
    } catch {}
  }, theme);
  const page = await context.newPage();
  const sent = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET" && request.method() !== "HEAD" && path.startsWith("/api/packs/") && path !== "/api/packs/device") sent.push({ method: request.method(), path, body: request.postData() ?? "" });
  });
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  return { context, page, sent, errors };
}
const go = async (page, hash) => {
  await page.evaluate((to) => (location.hash = to), hash);
  await page.waitForFunction((to) => location.hash === to, hash);
};
/** A pack of this device's, as it's stored. */
const stored = (page, id) => page.evaluate(async (packId) => (await import("/js/study/packs.js")).yourPacks().find((record) => record.id === packId)?.pack ?? null, id);
const storedItem = async (page, id, itemId) => (await stored(page, id))?.items.find((item) => item.id === itemId) ?? null;
const history = (page, id) => page.evaluate(async (packId) => (await import("/js/study/packs.js")).changesOf(packId), id);
const save = (page, value, options) => page.evaluate(async ([pack, opts]) => {
  const { savePack } = await import("/js/study/packs.js");
  const saved = await savePack(pack, opts);
  return { ok: saved.ok, errors: saved.errors };
}, [value, options]);
const rows = (page) => page.locator('[data-part="page"]:visible .lx-row-title');
const sheet = (page) => page.locator('[data-part="sheet"]:visible').first();
const toast = (page) => page.locator('[data-part="toast"]');
const openEdit = async (page, id) => {
  await go(page, `#settings/study/packs/${encodeURIComponent(id)}/edit`);
  await page.locator('[data-part="page"]:visible', { hasText: "Edit its items" }).first().waitFor({ timeout: 15_000 });
};
const search = async (page, words) => {
  const box = page.locator('[data-part="page"]:visible input[type="search"]');
  await box.fill(words);
  await box.dispatchEvent("input");
};
const openRow = async (page, words) => {
  await search(page, words);
  const row = page.locator('[data-part="page"]:visible [data-part="list-row"]', { hasText: words }).first();
  await row.waitFor({ timeout: 10_000 });
  await row.click();
  await sheet(page).locator("textarea").first().waitFor({ timeout: 10_000 });
};
const field = (page, i) => sheet(page).locator("textarea").nth(i);
const pressSave = (page, name = /^Save/) => sheet(page).getByRole("button", { name }).click();
const closed = (page) => page.waitForFunction(() => !document.querySelector('[data-part="sheet"]:not([hidden])'), null, { timeout: 15_000 });
const undoFromToast = async (page) => {
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await toast(page).filter({ hasText: "Undone" }).waitFor({ timeout: 15_000 });
};
const copyOf = (value) => JSON.parse(JSON.stringify(value));
const without = (value, ...keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const NO_AI = /\b(AI|A\.I\.|Claude|ChatGPT|assistant|Codex)\b/;
const noAi = async (page, where) => {
  const text = await page.locator("body").innerText();
  const hit = NO_AI.exec(text);
  assert(!hit, `${where} mentions an AI ("${hit?.[0]}"): ${text.slice(Math.max(0, (hit?.index ?? 0) - 60), (hit?.index ?? 0) + 60)}`);
};
// When anything's moving has finished.
// Whether a pack's item is among what the day can bring in as new (study/deck.js plainOfDay), as what the sheet says has to be true.
const newInTheDay = (page, packId, itemId) => page.evaluate(async ([pack, item]) => (await import("/js/study/deck.js")).plainOfDay().fresh.some((one) => one.pack.id === pack && one.card.id === item), [packId, itemId]);
const shot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
};

// ---------- no AI, one device: a copy, and everything done to it ----------

const owner = account(`Pack Editor ${run}`);
let one = null;
let copyId = null;
const needsCopy = async () => {
  one ??= await device(owner);
  if (copyId) return;
  await until("the band to arrive", () => one.page.evaluate(async (id) => (await import("/js/study/packs.js")).allPacks().some((pack) => pack.id === id), SOURCE), 60_000);
  await go(one.page, `#settings/study/packs/${SOURCE}`);
  await one.page.locator('[data-part="page"]:visible .lx-row-title', { hasText: "Make my own copy" }).click();
  await one.page.waitForFunction(() => /\/edit$/.test(location.hash), null, { timeout: 60_000 });
  copyId = await one.page.evaluate(() => decodeURIComponent(location.hash.split("/").at(-2)));
};

await stage("a copy: anyone can make one of a shared pack, and the press says a deck's progress starts again; Lexicommons' own stays read-only, and copying it turns it off so nothing plays twice", async () => {
  // A deck someone shared, found in Explore by someone with no AI. The sharer is an admin, who may share whatever COMMUNITY_SHARING says
  // (community.ts sharingOpenFor): wrangler.jsonc's own "admins", as at launch, refused a learner's share with a 403 here (7 Nov 2026).
  const sharer = account(`Pack Sharer ${run}`, { admin: true });
  const theirs = await device(sharer);
  const deck = { format: "lexicommons-pack", version: 2, id: `shared-${run}`, name: "A shared deck", language: "nl", from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items: ["kat:cat", "hond:dog", "vis:fish"].map((pair) => ({ id: pair.split(":")[0], text: `De ${pair.split(":")[0]}`, means: `The ${pair.split(":")[1]}` })) };
  const shared = await theirs.page.evaluate(async (value) => {
    const terms = await fetch("/api/community/terms").then((response) => response.json());
    await fetch("/api/community/terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: terms.version }) });
    const response = await fetch("/api/community/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack: value, level: "A1", topics: [] }) });
    return { status: response.status, body: await response.json() };
  }, deck);
  await theirs.context.close();
  assert(shared.status === 200 && shared.body.shared, `the share: ${JSON.stringify(shared).slice(0, 300)}`);
  const sharedId = shared.body.shared.id ?? shared.body.id;
  one = await device(owner);
  const { page, sent } = one;
  await go(page, `#explore/item/${sharedId}`);
  await page.getByRole("button", { name: "More", exact: true }).click();
  const row = page.locator('[data-part="sheet"] [data-part="list-row"]', { hasText: "Make my own copy" });
  await row.waitFor({ timeout: 15_000 });
  await row.locator("text=Your progress on its cards starts again").waitFor({ timeout: 5000 });
  await shot(page, "copy-in-explore");
  await noAi(page, "Explore's menu");
  await row.click();
  await page.waitForFunction(() => /\/edit$/.test(location.hash), null, { timeout: 30_000 });
  const deckCopy = await page.evaluate(() => decodeURIComponent(location.hash.split("/").at(-2)));
  eq((await stored(page, deckCopy))?.copiedFrom?.id, sharedId, "where the copy came from");
  await page.locator('[data-part="page"]:visible', { hasText: "Changes stay on this device." }).first().waitFor({ timeout: 15_000 });
  await noAi(page, "the edit page");
  // Lexicommons' own: read-only, and a copy is the way to change it.
  await until("the band to arrive", () => page.evaluate(async (id) => (await import("/js/study/packs.js")).allPacks().some((pack) => pack.id === id), SOURCE), 60_000);
  await go(page, `#settings/study/packs/${SOURCE}`);
  const action = page.locator('[data-part="page"]:visible [data-part="list-row"]', { hasText: "Make my own copy" });
  await action.waitFor({ timeout: 15_000 });
  const text = await page.locator('[data-part="page"]:visible').innerText();
  assert(!text.includes("Edit its items"), "Lexicommons' own pack offers an editor");
  assert(!/starts again/.test(await action.innerText()), "a pack of sentences has no cards' progress to lose");
  await noAi(page, "Lexicommons' pack page");
  await shot(page, "lexicommons-pack-page");
  await action.click();
  await page.waitForFunction(() => /\/edit$/.test(location.hash), null, { timeout: 60_000 });
  copyId = await page.evaluate(() => decodeURIComponent(location.hash.split("/").at(-2)));
  eq((await stored(page, copyId))?.copiedFrom?.id, SOURCE, "where the copy came from");
  assert(await page.evaluate(async (id) => !(await import("/js/study/packs.js")).isPackOn(id), SOURCE), "the original is still on: every sentence would play twice");
  assert(await page.evaluate(async (id) => (await import("/js/study/packs.js")).isPackOn(id), copyId), "the copy is off");
  eq(sent.filter((request) => request.path.startsWith("/api/packs/copies") || request.path === "/api/packs/changes"), [], "what went up for a copy");
  return copyId;
});

await stage("list and search: a long pack shows a page at a time; a search finds a word or its meaning, without its accents", async () => {
  await needsCopy();
  const { page } = one;
  await openEdit(page, copyId);
  const total = (await stored(page, copyId)).items.length;
  await page.locator('[data-part="page"]:visible', { hasText: `${total.toLocaleString()} items` }).first().waitFor();
  const shownRows = () => page.locator('[data-part="page"]:visible [data-part="list-row"]').count();
  const first = await shownRows();
  assert(first <= 53, `${first} rows at once on a pack of ${total}`);
  await page.locator('[data-part="page"]:visible .lx-row-title', { hasText: /^Show 50 more$/ }).click();
  await until("more rows", async () => (await shownRows()) > first);
  await search(page, "goed idee");
  await page.locator('[data-part="page"]:visible .lx-row-title', { hasText: "Dat is een goed idee." }).waitFor({ timeout: 10_000 });
  await search(page, "a good idea");
  await page.locator('[data-part="page"]:visible .lx-row-title', { hasText: "Dat is een goed idee." }).waitFor({ timeout: 10_000 });
  await search(page, "qqqqqq");
  await page.locator('[data-part="page"]:visible', { hasText: "Nothing in this pack says that." }).first().waitFor({ timeout: 10_000 });
  await shot(page, "search-nothing");
  await search(page, "");
  await page.locator('[data-part="page"]:visible', { hasText: `${total.toLocaleString()} items` }).first().waitFor();
  return `${total} items`;
});

await stage("what it means: only that changes, it stays a sentence and survives a reload, and Undo puts it back exactly, holding only that item", async () => {
  await needsCopy();
  const { page } = one;
  await openEdit(page, copyId);
  const before = copyOf(await storedItem(page, copyId, "dat"));
  assert(before?.words && before.literal && before.gap, "the fixture has its detail");
  await openRow(page, "Dat is een goed idee.");
  await sheet(page).locator("text=word-by-word help").first().waitFor();
  await shot(page, "edit-sheet");
  await field(page, 1).fill("That's a great idea.");
  await pressSave(page);
  await closed(page);
  const after = await storedItem(page, copyId, "dat");
  eq(without(after, "means"), without(before, "means"), "everything but what it means");
  eq(after.means, "That's a great idea.", "what it means");
  await toast(page).filter({ hasText: "Changed" }).waitFor({ timeout: 10_000 });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  eq((await storedItem(page, copyId, "dat")).means, "That's a great idea.", "after a reload");
  await go(page, `#settings/study/packs/${encodeURIComponent(copyId)}`);
  await shot(page, "pack-page");
  await page.locator('[data-part="page"]:visible .lx-row-title', { hasText: "Edit its items" }).waitFor({ timeout: 10_000 });
  const list = page.locator('[data-part="page"]:visible .lx-row-title', { hasText: /^You changed/ }).first();
  await list.waitFor({ timeout: 10_000 });
  await list.scrollIntoViewIfNeeded();
  await page.locator('[data-part="page"]:visible', { hasText: "Undo takes back the latest change on this device." }).first().waitFor();
  await noAi(page, "the pack's page");
  await shot(page, "pack-page-changes");
  await page.locator('[data-part="page"]:visible [data-part="list-row"]', { hasText: /^You changed/ }).first().getByRole("button", { name: "Undo" }).click();
  await until("the undo", async () => (await storedItem(page, copyId, "dat")).means === before.means);
  eq(await storedItem(page, copyId, "dat"), before, "after Undo");
  const entries = await history(page, copyId);
  const bytes = Math.max(...entries.map((entry) => JSON.stringify(entry).length));
  assert(bytes < 8_000, `a history entry holds ${bytes} bytes on a pack of ${JSON.stringify(await stored(page, copyId)).length}`);
  assert(entries.every((entry) => !("before" in entry)), "a history entry keeps the whole pack");
  return `a history entry: ${bytes} bytes`;
});

await stage("a spelling fix: its word-by-word help stays, and the fix carries into its words and wrong versions; no warning", async () => {
  await needsCopy();
  const { page } = one;
  await openEdit(page, copyId);
  const before = copyOf(await storedItem(page, copyId, "dat"));
  await openRow(page, "Dat is een goed idee.");
  await field(page, 0).fill("Dat is een goet idee.");
  assert(!(await sheet(page).locator("[data-rewrite]").isVisible()), "a spelling fix warns");
  await pressSave(page, /^Save$/);
  await closed(page);
  const after = await storedItem(page, copyId, "dat");
  eq(after.words[3], ["goet", "goed"], "the word, with its lemma");
  eq([after.text, after.literal, after.gap, after.concepts, after.id], ["Dat is een goet idee.", before.literal, before.gap, before.concepts, before.id], "the rest");
  assert(after.wrong.every((wrong) => wrong.includes("goet")), `its wrong versions: ${after.wrong}`);
  await undoFromToast(page);
  eq(await storedItem(page, copyId, "dat"), before, "after Undo");
});

await stage("a real rewrite: it says so before Save, what goes goes, it's a simple item, and Undo brings back all of it", async () => {
  await needsCopy();
  const { page } = one;
  await openEdit(page, copyId);
  const before = copyOf(await storedItem(page, copyId, "dat"));
  await openRow(page, "Dat is een goed idee.");
  const warning = sheet(page).locator("[data-rewrite]");
  await field(page, 0).fill("Vandaag schrijf ik een heel andere zin.");
  await warning.waitFor({ state: "visible", timeout: 5000 });
  assert(!(await sheet(page).locator("[data-stays]").isVisible()), "it says the help stays and that it goes, at once");
  const said = await warning.innerText();
  assert(/word-by-word help/.test(said) && /simple item/.test(said) && /starts again as new/.test(said) && /Practice brings in up to two/.test(said), `the warning: ${said}`);
  assert(!/own sessions|not in your daily/.test(said), `the warning says what's no longer so: ${said}`);
  await shot(page, "edit-rewrite");
  await field(page, 0).fill(before.text);
  assert(!(await warning.isVisible()), "the warning stays after the text is put back");
  await sheet(page).getByRole("button", { name: /^Save$/ }).waitFor();
  await field(page, 0).fill("Vandaag schrijf ik een heel andere zin.");
  await pressSave(page, /^Save as a simple item$/);
  await closed(page);
  const after = await storedItem(page, copyId, "dat");
  eq(Object.keys(after), ["id", "topic", "concepts", "text", "means"], "a simple item");
  eq([after.id, after.means, after.concepts], [before.id, before.means, before.concepts], "what stays");
  assert(await newInTheDay(page, copyId, "dat"), "the sheet says it comes into Practice as new, and the day doesn't have it");
  await undoFromToast(page);
  eq(await storedItem(page, copyId, "dat"), before, "after Undo");
  assert(!(await newInTheDay(page, copyId, "dat")), "a sentence again, and still among the day's new simple items");
  return said;
});

await stage("delete takes two presses, and Undo puts it back in its place; add needs only a word and what it means, and refuses less in words", async () => {
  await needsCopy();
  const { page } = one;
  await openEdit(page, copyId);
  const pack = await stored(page, copyId);
  const place = pack.items.findIndex((item) => item.id === "dat");
  await openRow(page, "Dat is een goed idee.");
  const del = sheet(page).locator('[data-part="list-row"]', { hasText: "Delete it" });
  await del.click();
  assert(await storedItem(page, copyId, "dat"), "one press deleted it");
  await sheet(page).locator('[data-part="list-row"]', { hasText: "Press again to delete it" }).click();
  await closed(page);
  assert(!(await storedItem(page, copyId, "dat")), "it's still there");
  await undoFromToast(page);
  eq((await stored(page, copyId)).items.findIndex((item) => item.id === "dat"), place, "its place");
  await page.locator('[data-part="page"]:visible .lx-row-title', { hasText: "Add a word or sentence" }).click();
  await sheet(page).locator("textarea").first().waitFor();
  await sheet(page).getByRole("button", { name: "Add", exact: true }).click();
  await sheet(page).locator('[role="status"]', { hasText: "Write the word or sentence." }).waitFor({ timeout: 5000 });
  await field(page, 0).fill("De paraplu");
  await sheet(page).getByRole("button", { name: "Add", exact: true }).click();
  await sheet(page).locator('[role="status"]', { hasText: "Say what it means." }).waitFor({ timeout: 5000 });
  await field(page, 1).fill("The umbrella");
  await sheet(page).locator("text=It comes into Practice as a new item. Practice brings in up to two at a time.").waitFor({ timeout: 5000 });
  await shot(page, "add-sheet");
  await sheet(page).getByRole("button", { name: "Add", exact: true }).click();
  await closed(page);
  const added = (await stored(page, copyId)).items.at(-1);
  eq(Object.keys(added), ["id", "text", "means"], "a new item is as small as that");
  eq([added.text, added.means], ["De paraplu", "The umbrella"], "what was written");
  assert(await newInTheDay(page, copyId, added.id), "the sheet says it comes into Practice, and the day doesn't have it");
  await go(page, `#settings/study/packs/${encodeURIComponent(copyId)}`);
  await page.locator('[data-part="page"]:visible .lx-row-title', { hasText: "De paraplu" }).first().waitFor({ timeout: 10_000 });
  await openEdit(page, copyId);
  await openRow(page, "De paraplu");
  await sheet(page).locator('[data-part="list-row"]', { hasText: "Delete it" }).click();
  await sheet(page).locator('[data-part="list-row"]', { hasText: "Press again to delete it" }).click();
  await closed(page);
});

await stage("offline and with no AI: saving and Undo work with no connection, nothing goes up, and the account has no copy", async () => {
  await needsCopy();
  const { page, context, sent } = one;
  await openEdit(page, copyId);
  const before = copyOf(await storedItem(page, copyId, "dat"));
  await context.setOffline(true);
  try {
    await openRow(page, "Dat is een goed idee.");
    await field(page, 1).fill("Offline, it means this.");
    await pressSave(page);
    await closed(page);
    eq((await storedItem(page, copyId, "dat")).means, "Offline, it means this.", "saved offline");
    await undoFromToast(page);
    eq(await storedItem(page, copyId, "dat"), before, "undone offline");
  } finally {
    await context.setOffline(false);
  }
  await page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
  const up = sent.filter((request) => request.body.includes("Dat is een") || request.path.startsWith("/api/packs/copies") || request.path === "/api/packs/changes");
  eq(up, [], "what went to the server about this pack");
  eq(sql(`SELECT pack_id FROM pack_copies WHERE user_id = ${q(owner.id)} AND pack IS NOT NULL`), [], "the account's copies");
  eq(sql(`SELECT id FROM pack_changes WHERE user_id = ${q(owner.id)}`), [], "the relay's changes");
});

await stage("what it promises: with your own storage connected it says what that does and what it doesn't, and never more", async () => {
  await needsCopy();
  const { page } = one;
  await page.route(/googleapis|dropbox|graph\.microsoft/, (route) => route.abort());
  await page.evaluate(() => localStorage.setItem("lc_storage_dropbox", JSON.stringify({ accessToken: "stand-in" })));
  await go(page, "#today");
  await openEdit(page, copyId);
  const line = page.locator('[data-part="page"]:visible', { hasText: "one device's changes are lost" }).first();
  await line.waitFor({ timeout: 10_000 });
  await page.evaluate(() => localStorage.removeItem("lc_storage_dropbox"));
  await page.unroute(/googleapis|dropbox|graph\.microsoft/);
  await go(page, "#today");
  await openEdit(page, copyId);
  await page.locator('[data-part="page"]:visible', { hasText: "Changes stay on this device." }).first().waitFor({ timeout: 10_000 });
  const text = await page.locator('[data-part="page"]:visible').first().innerText();
  assert(!/other devices/.test(text), `with no storage it mentions your other devices: ${text.slice(0, 300)}`);
});

await stage("an imported deck's card: its text and how it's said, its fill-in follows, its sounds stay, and a fill-in gone from the text is refused in words", async () => {
  await needsCopy();
  const { page, sent } = one;
  const deck = {
    format: "lexicommons-pack", version: 2, id: `anki-a-deck-${run}`, name: "An imported deck", language: "nl", from: "en", topics: {}, words: {}, chunks: {}, patterns: {},
    items: [
      { id: "kat", text: "De kat zit op de mat.", means: "The cat sits on the mat.", reading: "de kat", cloze: { at: 3, answer: "kat" } },
      { id: "hond", text: "De hond", means: "The dog", sentence: "De hond rent.", sentenceBack: "The dog runs." },
    ],
  };
  const saved = await page.evaluate(async (value) => {
    const { savePack } = await import("/js/study/packs.js");
    const result = await savePack(value, { by: "An Anki deck", sounds: { kat: { clip: "abc", format: "mp3" } } });
    return { ok: result.ok, errors: result.errors };
  }, deck);
  assert(saved.ok, JSON.stringify(saved.errors));
  const sounds = () => page.evaluate(async (id) => (await import("/js/study/packs.js")).packSounds(id), deck.id);
  const by = () => page.evaluate(async (id) => (await import("/js/study/packs.js")).yourPack(id)?.by, deck.id);
  const held = await sounds();
  await openEdit(page, deck.id);
  // New cards in an imported deck come only when you open it, and the sheet says so.
  await page.locator('[data-part="page"]:visible .lx-row-title', { hasText: "Add a word or sentence" }).click();
  await sheet(page).locator("text=You'll meet it when you open this deck.").waitFor({ timeout: 5000 });
  assert(!/Practice/.test(await sheet(page).innerText()), "an imported deck's sheet promises Practice");
  await page.keyboard.press("Escape");
  await closed(page);
  assert(!(await newInTheDay(page, deck.id, "hond")), "an imported deck's new card is in the day");
  await openRow(page, "De kat zit op de mat.");
  assert((await sheet(page).locator("textarea").count()) === 3, "a card that has how it's said shows it");
  await field(page, 0).fill("Nu zit de kat op de mat.");
  assert(!(await sheet(page).locator("[data-rewrite]").isVisible()), "a card has no word-by-word help to lose");
  await field(page, 2).fill("nu zit de kat");
  await pressSave(page);
  await closed(page);
  const card = await storedItem(page, deck.id, "kat");
  eq([card.text, card.reading, card.cloze], ["Nu zit de kat op de mat.", "nu zit de kat", { at: 10, answer: "kat" }], "the card");
  eq(await sounds(), held, "its sounds");
  eq(await by(), "An Anki deck", "still from a deck");
  await undoFromToast(page);
  eq((await storedItem(page, deck.id, "kat")).cloze, deck.items[0].cloze, "after Undo");
  await search(page, "");
  await openRow(page, "De kat zit op de mat.");
  await field(page, 0).fill("De hond zit op de mat.");
  await pressSave(page);
  await sheet(page).locator('[role="status"]', { hasText: "hides “kat”" }).waitFor({ timeout: 5000 });
  eq(await field(page, 0).inputValue(), "De hond zit op de mat.", "what was written stays");
  await page.keyboard.press("Escape");
  await search(page, "");
  await openRow(page, "De hond");
  assert((await sheet(page).locator("textarea").count()) === 2, "nobody is asked for how it's said");
  await field(page, 1).fill("The hound");
  await pressSave(page);
  await closed(page);
  const hond = await storedItem(page, deck.id, "hond");
  eq([hond.sentence, hond.sentenceBack, hond.means], ["De hond rent.", "The dog runs.", "The hound"], "its own sentence stays");
  assert(!sent.some((request) => request.body.includes("De hond")), "a deck's cards went to the server");
});

// ---------- with an AI connected, on two devices: the relay ----------

await stage("a pack on the account: a change goes to the other device and the AI's list, Undo from either side reaches both, the page says so, and offline it says it needs a connection", async () => {
  const both = account(`Pack Relay ${run}`);
  connect(both);
  const a = await device(both);
  const b = await device(both);
  try {
    const sentence = "Dat is een goed idee.";
    const made = await tool(both, "create_pack", { name: "On the account", language: "nl", items: [{ sentence, literal: ["That", "is", "a good idea"], natural: "That's a good idea.", wrong: ["Dat zijn een goed idee."], gap: { word: "Dat", options: ["Dat", "Dit", "Wat"] }, patterns: ["zijn-hebben"] }] });
    const packId = made.pack_id ?? made.packId ?? made.id;
    assert(packId, `create_pack: ${JSON.stringify(made).slice(0, 200)}`);
    const take = (one) => one.page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
    await until("both devices to have it", async () => {
      await take(a);
      await take(b);
      return (await stored(a.page, packId)) && (await stored(b.page, packId));
    });
    const itemId = (await stored(a.page, packId)).items[0].id;
    await openEdit(a.page, packId);
    await a.page.locator('[data-part="page"]:visible', { hasText: "Changes reach your other devices." }).first().waitFor({ timeout: 10_000 });
    await openRow(a.page, sentence);
    await field(a.page, 1).fill("A fine idea, that.");
    await pressSave(a.page);
    await closed(a.page);
    eq((await storedItem(a.page, packId, itemId)).means, "A fine idea, that.", "this device");
    await until("the other device", async () => {
      await take(b);
      return (await storedItem(b.page, packId, itemId)).means === "A fine idea, that.";
    });
    const listed = await tool(both, "list_pack_changes", { pack_id: packId });
    assert(JSON.stringify(listed).includes("changed “Dat is een goed idee.”"), `list_pack_changes: ${JSON.stringify(listed).slice(0, 400)}`);
    const receipt = (await history(a.page, packId)).find((entry) => entry.kind === "update");
    assert(!("before" in receipt) && JSON.stringify(receipt).length < 8000, `what it keeps to undo: ${JSON.stringify(receipt).length}`);
    await undoFromToast(a.page);
    await until("the undo on the other device", async () => {
      await take(b);
      return (await storedItem(b.page, packId, itemId)).means === "That's a good idea.";
    });
    // Undone by the AI, the same way.
    await search(a.page, "");
    await openRow(a.page, sentence);
    await field(a.page, 1).fill("Once more.");
    await pressSave(a.page);
    await closed(a.page);
    const again = (await history(a.page, packId)).filter((entry) => entry.kind === "update" && entry.state === "applied").sort((x, y) => y.at - x.at)[0];
    await tool(both, "undo_pack_change", { change_id: again.id });
    await until("the AI's undo on both", async () => {
      await take(a);
      await take(b);
      return (await storedItem(a.page, packId, itemId)).means === "That's a good idea." && (await storedItem(b.page, packId, itemId)).means === "That's a good idea.";
    });
    await go(a.page, `#settings/study/packs/${encodeURIComponent(packId)}`);
    await a.page.locator('[data-part="page"]:visible', { hasText: "Undo takes back the latest change, here and on your other devices." }).first().waitFor({ timeout: 10_000 });
    await openEdit(a.page, packId);
    await a.context.setOffline(true);
    try {
      await openRow(a.page, sentence);
      await field(a.page, 1).fill("Never saved.");
      await pressSave(a.page);
      await sheet(a.page).locator('[role="status"]', { hasText: "needs a connection" }).waitFor({ timeout: 15_000 });
      eq(await field(a.page, 1).inputValue(), "Never saved.", "what was written stays");
      eq((await storedItem(a.page, packId, itemId)).means, "That's a good idea.", "nothing changed");
    } finally {
      await a.context.setOffline(false);
    }
    await a.page.keyboard.press("Escape");
    assert(!a.errors.length && !b.errors.length, `page errors: ${[...a.errors, ...b.errors].slice(0, 3)}`);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

// ---------- how it looks ----------

await stage("dark and light, 390 and 320 wide: nothing runs off the page, controls are big enough, fields are 16 px, text 12 px or more", async () => {
  const measures = [];
  for (const [theme, width, height] of [["graphite", 390, 844], ["paper", 390, 844], ["graphite", 320, 568], ["paper", 320, 568]]) {
    // An account each: the look is the account's, so a second device would take the first's.
    const one = await device(account(`Pack Look ${run} ${theme} ${width}`), { theme, width, height });
    const { page } = one;
    try {
      const id = `look-${theme}-${width}`;
      const long = "Dit is een heel erg lange zin met woorden die gewoon doorgaan tot het einde van de regel en nog een stuk verder, zodat hij op een smal scherm moet afbreken.";
      await until("the band to arrive", () => page.evaluate(async (band) => (await import("/js/study/packs.js")).allPacks().some((pack) => pack.id === band), SOURCE), 60_000);
      const whole = await page.evaluate(async (band) => (await import("/js/study/packs.js")).allPacks().find((pack) => pack.id === band).items.find((item) => item.id === "dat"), SOURCE);
      const saved = await save(page, { format: "lexicommons-pack", version: 2, id, name: "A pack with a long enough name that it has to wrap on a phone", language: "nl", from: "en", topics: {}, words: { dat: "that", zijn: "to be", een: "a", goed: "good", idee: "idea" }, chunks: {}, patterns: {}, items: [whole, { id: "lang", text: long, means: "A very long sentence that just keeps going to the end of the line and a good way further." }, { id: "kort", text: "De kat", means: "The cat" }] }, { by: "you" });
      assert(saved.ok, JSON.stringify(saved.errors));
      assert((await page.evaluate(() => document.documentElement.dataset.theme)) === theme, `the theme: ${await page.evaluate(() => document.documentElement.dataset.theme)}`);
      await openEdit(page, id);
      await page.waitForTimeout(500);
      await shot(page, `page-${theme}-${width}`);
      const check = (where) => page.evaluate((scope) => {
        const root = scope === "sheet" ? document.querySelector('[data-part="sheet"]:not([hidden])') : [...document.querySelectorAll('[data-part="page"]')].find((one) => one.checkVisibility());
        const over = document.documentElement.scrollWidth - innerWidth;
        const small = [...root.querySelectorAll("*")].filter((node) => node.childNodes.length && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim()) && node.checkVisibility() && parseFloat(getComputedStyle(node).fontSize) < 12).map((node) => node.textContent.slice(0, 30));
        const fields = [...root.querySelectorAll("textarea, input")].filter((node) => node.checkVisibility()).map((node) => parseFloat(getComputedStyle(node).fontSize));
        const mono = [...root.querySelectorAll("textarea, input")].filter((node) => node.checkVisibility() && /mono/i.test(getComputedStyle(node).fontFamily)).length;
        const short = [...root.querySelectorAll('button, a[href], [data-part="list-row"]')].filter((node) => node.checkVisibility()).filter((node) => node.getBoundingClientRect().height < 44 && !node.closest('[data-part="sheet-handle"]') && node.getAttribute("data-part") !== "sheet-handle").map((node) => `${node.textContent.slice(0, 24)} ${Math.round(node.getBoundingClientRect().height)}`);
        const wide = [...root.querySelectorAll("*")].filter((node) => node.checkVisibility() && node.getBoundingClientRect().right > innerWidth + 1).map((node) => node.tagName + ":" + node.textContent.slice(0, 20)).slice(0, 4);
        return { over, small, fields, short, wide, mono };
      }, where);
      const atPage = await check("page");
      await openRow(page, "Dat is een goed idee.");
      await field(page, 0).fill(long);
      await sheet(page).locator("[data-rewrite]").waitFor({ state: "visible", timeout: 5000 });
      eq(await sheet(page).getByRole("button", { name: /^Save/ }).getAttribute("data-variant"), "go", `${theme} ${width}: Save is the way forward`);
      const cut = await field(page, 0).evaluate((box) => box.scrollHeight - box.clientHeight);
      assert(cut <= 2, `${theme} ${width}: a long sentence is cut off in its box by ${cut} px`);
      await shot(page, `sheet-${theme}-${width}`);
      const atSheet = await check("sheet");
      for (const [where, m] of [["page", atPage], ["sheet", atSheet]]) {
        const label = `${theme} ${width} ${where}`;
        eq(m.over, 0, `${label}: runs off the page sideways`);
        eq(m.wide, [], `${label}: wider than the screen`);
        eq(m.small, [], `${label}: text under 12 px`);
        assert(m.fields.every((size) => size >= 16), `${label}: fields ${m.fields}`);
        eq(m.mono, 0, `${label}: a language written in code's type`);
        eq(m.short, [], `${label}: controls under 44 px`);
      }
      measures.push(`${theme} ${width}`);
    } finally {
      await one.context.close();
    }
  }
  return measures.join(", ");
});

await stage("slowed 4x on a band's copy: a key's search and a Save, what they take", async () => {
  await needsCopy();
  const { page, context } = one;
  await openEdit(page, copyId);
  const client = await context.newCDPSession(page);
  await page.evaluate(() => {
    window.lxLong = [];
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => window.lxLong.push(Math.round(entry.duration)))).observe({ type: "longtask", buffered: false });
  });
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const started = Date.now();
  await search(page, "goed idee");
  await page.locator('[data-part="page"]:visible .lx-row-title', { hasText: "Dat is een goed idee." }).waitFor({ timeout: 30_000 });
  const searched = Date.now() - started;
  const searching = await page.evaluate(() => window.lxLong.splice(0));
  await page.locator('[data-part="page"]:visible [data-part="list-row"]', { hasText: "Dat is een goed idee." }).first().click();
  await sheet(page).locator("textarea").first().waitFor();
  await field(page, 1).fill("Slowly.");
  const pressed = Date.now();
  await pressSave(page);
  await closed(page);
  const saved = Date.now() - pressed;
  const saving = await page.evaluate(() => window.lxLong.splice(0));
  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await undoFromToast(page);
  assert(saved < 15_000, `a Save took ${saved} ms at 4x slower`);
  return { searchedMs: searched, searchLongTasks: searching, savedMs: saved, saveLongTasks: saving };
});

await stage("a walk, recorded for looking at: open a copy, fix a sentence, undo", async () => {
  const walker = account(`Pack Walk ${run}`);
  const video = join(OUT, "walk-raw");
  rmSync(video, { recursive: true, force: true });
  const { context, page } = await device(walker, { video });
  const hold = (ms = 900) => page.waitForTimeout(ms);
  await until("the band to arrive", () => page.evaluate(async (id) => (await import("/js/study/packs.js")).allPacks().some((pack) => pack.id === id), SOURCE), 60_000);
  await go(page, `#settings/study/packs/${SOURCE}`);
  await page.locator('[data-part="page"]:visible .lx-row-title', { hasText: "Make my own copy" }).scrollIntoViewIfNeeded();
  await hold();
  await page.locator('[data-part="page"]:visible .lx-row-title', { hasText: "Make my own copy" }).click();
  await page.waitForFunction(() => /\/edit$/.test(location.hash), null, { timeout: 60_000 });
  await hold();
  await search(page, "goed idee");
  await hold();
  await page.locator('[data-part="page"]:visible [data-part="list-row"]', { hasText: "Dat is een goed idee." }).first().click();
  await sheet(page).locator("textarea").first().waitFor();
  await hold();
  await field(page, 0).pressSequentially("", { delay: 40 });
  await field(page, 0).fill("Dat is een goet idee.");
  await hold(600);
  await field(page, 0).fill("Dat is een heel ander verhaal geworden.");
  await hold(1400);
  await field(page, 0).fill("Dat is een goed idee!");
  await hold(600);
  await pressSave(page, /^Save$/);
  await closed(page);
  await hold(1400);
  await undoFromToast(page);
  await hold(1200);
  await context.close();
  const [file] = readdirSync(video);
  renameSync(join(video, file), join(OUT, "walk.webm"));
  rmSync(video, { recursive: true, force: true });
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", join(OUT, "walk.webm"), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", join(OUT, "walk.mp4")]);
  rmSync(join(OUT, "walk.webm"), { force: true });
  return "walk.mp4";
});

if (one && one.errors.length) console.log(`  page errors on the main device: ${one.errors.slice(0, 3).join(" | ")}`);
await browser.close().catch(() => {});
writeFileSync(join(OUT, "pack-edit-check.json"), JSON.stringify(results, null, 1));
const failed = results.filter((one) => !one.ok).length;
console.log(`pack edit check: ${failed ? `${failed} of ${results.length} stages FAILED` : `all ${results.length} stages passed`}`);
process.exit(failed ? 1 : 0);
