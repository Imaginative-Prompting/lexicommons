// A copy on this computer as a new learner finds it (npm run local; docs/self-host.md), in Chrome on a phone screen, from a
// brand-new account: no Google or GitHub button, a passkey account, lesson 1's first step from Study, a Translate result, Read
// from Home with every book in the library and the one up front opened with its pictures, Explore's packs, no store to connect,
// its own MCP address, and no request or script failing on the way.
//
//   node scripts/local-copy-check.mjs http://localhost:<port> <outDir> [--admin-command "npm run local -- admin"]
//
// It signs up a test account and deletes it. --admin-command runs that shell command, and the account must then reach an admin
// route. Exit 0 = pass.

import { chromium } from "./quiet-browser.mjs";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const adminCommand = argv.includes("--admin-command") ? argv[argv.indexOf("--admin-command") + 1] : undefined;
if (!/^http:\/\/localhost:\d+$/.test(BASE ?? "") || !OUT) {
  console.error('Usage: node scripts/local-copy-check.mjs http://localhost:<port> <outDir> [--admin-command "npm run local -- admin"]');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
const page = await context.newPage();
const problems = [];
const failed = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("response", (r) => {
  const url = new URL(r.url());
  // Signed out, /api/me answers 401 and the app goes to sign-in: that's the design.
  // The app asks once whether this copy has the speech models (speech/store.js siteHasModels): no is an answer.
  const asksForModels = url.pathname.startsWith("/models/") && r.request().method() === "HEAD" && r.status() === 404;
  if (r.status() >= 400 && url.origin === BASE && !asksForModels && !(url.pathname === "/api/me" && r.status() === 401)) failed.push(`${r.status()} ${url.pathname}`);
});
page.on("requestfailed", (r) => {
  const url = new URL(r.url());
  if (url.origin === BASE && !/ERR_ABORTED/.test(r.failure()?.errorText ?? "")) failed.push(`failed ${url.pathname}: ${r.failure()?.errorText}`);
});
const results = {};
let stageFailed = 0;
async function stage(name, run) {
  try {
    const note = await run();
    results[name] = { ok: true, note };
    console.log(`PASS  ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    stageFailed++;
    results[name] = { ok: false, note: String(error.message) };
    console.log(`FAIL  ${name}: ${String(error.message).split("\n")[0]}`);
    await page.screenshot({ path: `${OUT}/fail-${stageFailed}.png` }).catch(() => {});
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const open = async (hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(500);
};

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

await stage("sign-in offers what works here: a passkey, no Google or GitHub", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await shot("01-sign-in");
  const providers = await page.locator('form[action*="/login/google"], form[action*="/login/github"]').count();
  assert(providers === 0, `${providers} provider buttons with no app behind them`);
  const words = await page.locator("body").innerText();
  assert(!/Continue with (Google|GitHub)/.test(words), "a provider's name on the sign-in page");
});

await stage("a new account with a passkey", async () => {
  await page.click("summary");
  await page.fill('input[name="name"]', "Local Copy Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
});

await stage("the library reached the device", async () => {
  const device = await page.evaluate(async () => {
    const packs = await import("/js/study/packs.js");
    await packs.syncLibraryPacks();
    const freq = await import("/js/study/frequency.js");
    await freq.loadFrequency("nl");
    const { grammarNow } = await import("/js/lang/grammar.js");
    return { nl: packs.libraryPacks().filter((p) => p.language === "nl").map((p) => p.id), rank: freq.rankOf("ik", "nl"), grammar: grammarNow("nl").revision };
  });
  assert(device.nl.includes("path-nl") && device.nl.includes("words-nl-01"), `Dutch packs here: ${device.nl}`);
  assert(device.rank > 0, "the frequency list isn't here");
  assert(device.grammar >= 2, `grammar revision ${device.grammar}`);
  return `${device.nl.length} Dutch packs, the frequency list, grammar revision ${device.grammar}`;
});

await stage("Study reaches lesson 1's first step", async () => {
  await page.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: "Study" }).first().click();
  const start = page.locator('[data-part="page"]:not([data-ghost]) [data-part="study-door"]').first();
  await start.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await shot("02-study");
  const card = (await start.innerText()).replace(/\s+/g, " ");
  assert(/Your first lesson/.test(card), `Study's door: ${card}`);
  const where = (await page.locator('[data-part="page"]:not([data-ghost])').first().innerText()).replace(/\s+/g, " ");
  assert(/Lesson 1\b/.test(where), `Where you are isn't lesson 1: ${where.slice(0, 120)}`);
  await start.click();
  await page.waitForSelector('[data-part="session"]:not([data-ghost])', { timeout: 30_000 });
  await page.waitForTimeout(600);
  await shot("03-lesson-first-step");
  const step = (await page.locator('[data-part="session"]:not([data-ghost])').innerText()).replace(/\s+/g, " ");
  assert(step.length > 10, `an empty first step: "${step}"`);
  const word = await page.locator('[data-part="session"]:not([data-ghost]) [data-part="target-word"][data-state="target"]').first().getAttribute("data-word").catch(() => null);
  return `"${card.slice(0, 60)}"; first word: ${word ?? step.slice(0, 40)}`;
});

await stage("Translate gives a result", async () => {
  await page.goto(`${BASE}/app/#today/translate`);
  await page.waitForSelector("html[data-app-ready]");
  const field = page.locator('[data-part="translate-field"] :is(textarea, input)');
  await field.waitFor({ timeout: 30_000 });
  await field.fill("hi");
  const best = page.locator('[data-part="translate-result"][data-state="best"]');
  await best.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await shot("04-translate");
  const text = (await best.innerText()).replace(/\s+/g, " ");
  assert(/hoi/i.test(text), `hi gave: ${text}`);
  return text.slice(0, 80);
});

await stage("Read shows the books, and one opens with its picture", async () => {
  // Read has no tab: a person reaches it from Home's book card (or its Reading heading's All books), then the book up front opens with Start reading.
  const books = (await (await page.request.get(`${BASE}/library/catalogue.json`)).json()).books ?? [];
  assert(books.length > 0, "this copy's library has no books");
  await page.goto(`${BASE}/app/`);
  await page.waitForSelector("html[data-app-ready]");
  const row = page.locator('[data-part="page"]:not([data-ghost]) .lx-home-cards a[href="#read"]').first();
  await row.waitFor({ timeout: 30_000 });
  await row.click();
  await page.waitForFunction(() => location.hash === "#read", null, { timeout: 30_000 });
  const start = page.locator('[data-part="continue-card"]').getByRole("button", { name: "Start reading" });
  await start.waitFor({ timeout: 30_000 });
  const read = page.locator('[data-part="page"]', { has: start });
  await read.locator('.lx-read-shelf [data-part="book-tile"]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await shot("05-read");
  const heads = await read.locator('[data-part="section-head"]').allInnerTexts();
  assert(heads.some((h) => /Picture books/.test(h)), `Read's sections: ${heads.join(", ")}`);
  const offered = (await read.locator('[data-part="continue-card"] [data-part="book-tile"]').getAttribute("aria-label")) ?? "";
  // Every book in the library is on Read: up front or among the shelves' covers that show, by its tile's name (a title can be cut short on
  // screen), or behind a shelf's All, on the page it opens (Find a book with that kind, or the shelf's own page).
  const tiles = await read.locator('[data-part="book-tile"]').evaluateAll((nodes) => nodes.filter((n) => n.getClientRects().length).map((n) => n.getAttribute("aria-label") ?? ""));
  const rows = await read.locator('.lx-read-shelf [data-part="section-link"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
  let missing = books.filter((book) => !tiles.some((label) => label.startsWith(`${book.title}:`)));
  const behind = [];
  for (const href of rows) {
    if (!missing.length) break;
    await page.goto(`${BASE}/app/${href}`);
    await page.waitForSelector("html[data-app-ready]");
    const shown = page.locator('[data-part="page"]:not([data-ghost])').locator('[data-book], [data-part="book-tile"]');
    await shown.first().waitFor({ timeout: 30_000 });
    const found = await shown.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-book") ?? n.getAttribute("aria-label") ?? ""));
    const there = missing.filter((book) => found.some((one) => one === book.id || one.startsWith(`${book.title}:`)));
    if (there.length) behind.push(`${there.length} behind ${href}`);
    missing = missing.filter((book) => !there.includes(book));
  }
  assert(!missing.length, `not on Read: ${missing.map((book) => book.title).join(", ")} (its rows: ${rows.join(", ") || "none"})`);
  if (rows.length) {
    await page.goto(`${BASE}/app/#read`);
    await start.waitFor({ timeout: 30_000 });
  }
  await start.click();
  await page.waitForURL(/#read\/book\//, { timeout: 30_000 });
  await page.waitForSelector('[data-part="reader"][data-ready]', { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await shot("06-book");
  const id = decodeURIComponent(new URL(page.url()).hash.replace(/^#read\/book\//, ""));
  const book = books.find((b) => b.id === id);
  assert(book && offered.startsWith(`${book.title}:`), `Start reading under "${offered.split(":")[0]}" opened ${id}`);
  assert(book.pictures > 0, `the book up front, ${book.title}, has no pictures in the catalog`);
  // The book's own words, without the English drawn over them.
  const words = await page.evaluate(() => {
    const copy = document.querySelector('[data-part="reader"]').cloneNode(true);
    copy.querySelectorAll("rt").forEach((rt) => rt.remove());
    return copy.textContent.replace(/\s+/g, " ");
  });
  assert(words.includes(book.title), `${book.title}'s text isn't on the page: ${words.slice(0, 120)}`);
  const pictures = await page.evaluate(() => [...document.querySelectorAll('[data-part="reader"] img')].filter((i) => i.src.includes("/library/pictures/")).map((i) => i.naturalWidth));
  assert(pictures.length > 0 && pictures.every((w) => w > 0), `the book's pictures (their widths): ${pictures.length ? pictures : "none from the library"}`);
  return `${books.length} books on Read${behind.length ? ` (${behind.join(", ")})` : ""}; ${book.title} from Start reading, ${pictures.length} picture(s) loaded`;
});

await stage("Explore lists the library's packs", async () => {
  await page.goto(`${BASE}/app/#explore/language/nl`);
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForTimeout(1500);
  const search = await page.evaluate(async () => {
    const response = await fetch("/api/community/items?lang=nl");
    return { status: response.status, body: response.ok ? await response.json() : null };
  });
  await shot("07-explore");
  const items = search.body?.items ?? search.body ?? [];
  assert(search.status === 200 && items.length >= 10, `Dutch items in Explore: ${search.status}, ${items.length}`);
  return `${items.length} Dutch packs listed`;
});

await stage("No store to connect, and no dead button", async () => {
  await page.goto(`${BASE}/app/#settings`);
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForTimeout(800);
  await shot("08-settings");
  const titles = await page.locator(".lx-row-title").allInnerTexts();
  assert(!titles.includes("Sync across devices"), "Settings offers syncing with no store behind it");
  assert(titles.includes("Your data"), `Settings' rows: ${titles.join(", ")}`);
  await page.evaluate(() => (location.hash = "#settings/storage"));
  await page.waitForTimeout(800);
  await shot("08-storage");
  const words = await page.locator("body").innerText();
  for (const name of ["Google Drive", "Dropbox", "OneDrive"]) assert(!words.includes(name), `${name} with no app behind it`);
  assert(/no cloud storage to connect/.test(words), "the page doesn't say why");
  const stores = await page.evaluate(async () => (await (await fetch("/api/me")).json()).stores);
  assert(Array.isArray(stores) && stores.length === 0, `stores: ${stores}`);
});

await stage("Speaking says plainly when this copy has no speech model", async () => {
  const hasModels = (await page.request.head(`${BASE}/models/whisper-small/manifest.json`)).ok();
  await page.goto(`${BASE}/app/#settings/study/speaking`);
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForTimeout(1200);
  await shot("09-say");
  const words = await page.locator("body").innerText();
  const support = await page.evaluate(async () => (await (await import("/js/speech/speech.js")).support("nl-NL")).whisper);
  if (hasModels) {
    assert(support.state !== "none", `the models are here, and Whisper says: ${support.why}`);
    return "the models are here";
  }
  assert(support.state === "none", `no models here, and Whisper says it's ${support.state}`);
  assert(!/Download Whisper/.test(words), "a Download Whisper button with nothing to download");
  return support.why;
});

await stage("The AI section's address is this copy's own", async () => {
  await page.goto(`${BASE}/app/#ai/connect`);
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForTimeout(800);
  const words = await page.locator("body").innerText();
  assert(words.includes(`${BASE}/mcp`), "this copy's MCP address isn't shown");
  assert(!words.includes("lexicommons.com/mcp"), "the main site's MCP address is shown");
});

await stage("An AI can connect to this copy over MCP", async () => {
  const answer = await page.evaluate(async (origin) => {
    const made = await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "local copy check" }) });
    if (!made.ok) return { made: made.status };
    const { token, id } = await made.json();
    const call = (body) => fetch(`${origin}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify(body) });
    const init = await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "local-copy-check", version: "1" } } });
    const session = init.headers.get("mcp-session-id");
    const tools = await fetch(`${origin}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(session ? { "mcp-session-id": session } : {}), "MCP-Protocol-Version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) });
    const text = await tools.text();
    await fetch(`/api/tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
    return { init: init.status, tools: tools.status, whoami: text.includes("whoami") };
  }, BASE);
  assert(answer.init === 200 && answer.tools === 200 && answer.whoami, `MCP: ${JSON.stringify(answer)}`);
  return "a personal token listed the tools";
});

if (adminCommand) {
  await stage("The admin command makes this account an admin", async () => {
    const out = execSync(adminCommand, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n").pop();
    assert(/admin/.test(out), `the command said: ${out}`);
    const usable = await page.evaluate(async () => {
      const made = await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "local copy admin check", admin: true }) })).json();
      const response = await fetch("/api/v1/admin/library", { headers: { Authorization: `Bearer ${made.token}` } });
      const body = response.ok ? await response.json() : null;
      await fetch(`/api/tokens/${encodeURIComponent(made.id)}`, { method: "DELETE" });
      return { status: response.status, packs: body?.packs ? Object.values(body.packs).flat().length : 0 };
    });
    assert(usable.status === 200, `an admin route answered ${usable.status}`);
    assert(usable.packs > 0, "the admin's library view is empty");
    return out.slice(0, 80);
  });
}

await stage("the test account is deleted", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForSelector("html[data-app-ready]");
  const deleted = await page.evaluate(async () => {
    const response = await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) });
    return response.status;
  });
  assert(deleted === 200, `delete answered ${deleted}`);
});

await stage("nothing failed on the way", async () => {
  const unique = [...new Set(failed)];
  assert(!unique.length, `requests: ${unique.slice(0, 8).join(", ")}`);
  const scripts = [...new Set(problems)].filter((p) => !/status of (40[0-9]|41[0-9])/.test(p));
  assert(!scripts.length, scripts.slice(0, 4).join(" | "));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
console.log(`\n${Object.keys(results).length - stageFailed} of ${Object.keys(results).length} passed`);
process.exit(stageFailed ? 1 : 0);
