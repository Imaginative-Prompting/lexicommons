// When something fails (docs/design-bible.md): every main page as someone sees it offline, and with the server failing, on a phone.
// It signs up, opens each page online once (so the app's worker and the device have what a returning person has), then goes offline
// and opens each again, then online with every /api/ and /library/ call answering 500; on each, presses that need the server
// (reminders, a passkey, a storage, a session, asking in Explore). Fails on a page with no words, on words only code or a browser
// prints anywhere on the screen (server_error, Failed to fetch, undefined, null, NaN), and on a page error; a control first plants
// such words to show it catches them. A still per page per state, and words.json. LOCAL only: it signs up a test account, and deletes it.
// Usage: node scripts/failure-check.mjs http://localhost:<port> <outDir> [--theme paper]   (exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !outArg) {
  console.error("Usage: node scripts/failure-check.mjs http://localhost:<port> <outDir> [--theme paper] (a local server only)");
  process.exit(2);
}
const THEME = argv.includes("--theme") ? argv[argv.indexOf("--theme") + 1] : "graphite";
const OUT = resolve(outArg); mkdirSync(OUT, { recursive: true });
const ROUTES = [
  ["home", "#today"], ["study", "#study"], ["packs", "#study/packs"], ["path", "#study/path"], ["knowledge", "#know"],
  ["read", "#read"], ["read-find", "#read/find"], ["read-library", "#read/library"],
  ["explore", "#explore"], ["explore-yours", "#explore/yours"], ["explore-requests", "#explore/requests"],
  ["settings", "#settings"], ["packs", "#study/packs"], ["storage", "#settings/storage"], ["reminders", "#settings/reminders"],
  ["account", "#settings/account"], ["voices", "#settings/study/voices"], ["about", "#settings/about"], ["anki", "#study/import"], ["ai", "#ai"],
];
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: THEME === "paper" ? "light" : "dark" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`${page.url().split("#")[1] ?? ""}: ${e}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Sam Rivera");
await page.click('#register button[type="submit"]');
await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]");
if (THEME !== "graphite") await page.evaluate((t) => (document.documentElement.dataset.theme = t), THEME);
const go = async (hash, wait = 1800) => { await page.evaluate((h) => (location.hash = h), hash); await page.waitForTimeout(wait); };
const words = () => page.evaluate(() => (document.querySelector('[data-part="app"] > [data-part="page"]')?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 400));
// Words only code or a browser prints, anywhere on the screen (a sheet, a toast, the page).
const CODE_WORDS = /Failed to fetch|Load failed|NetworkError|\b[a-z]+_[a-z]+(_[a-z]+)*\b|\bundefined\b|\bnull\b|\[object Object\]|\bNaN\b/;
const leaks = [];
// The control: the scan has to catch what it's for.
const CONTROLS = ["Dropbox: Failed to fetch", "server_error", "Load failed", "undefined cards"];
for (const planted of CONTROLS) if (!CODE_WORDS.test(planted)) { console.error(`the scan misses "${planted}"`); process.exit(3); }
const scan = async (where) => {
  const text = await page.evaluate(() => document.body.innerText);
  for (const line of text.split("\n")) if (CODE_WORDS.test(line)) leaks.push(`${where}: ${line.trim().slice(0, 160)}`);
};
const report = {};
// Online once, as a returning person has had it.
for (const [, hash] of ROUTES) await go(hash, 1200);
await go("#today", 1500);
for (const state of ["offline", "server-down"]) {
  mkdirSync(join(OUT, state), { recursive: true });
  if (state === "offline") await context.setOffline(true);
  else {
    await context.setOffline(false);
    await page.route(/\/(api|library)\//, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "server_error" }) }));
  }
  // Each page drawn fresh: from another one first.
  for (const [name, hash] of ROUTES) {
    await go(hash === "#today" ? "#study" : "#today", 600);
    await go(hash);
    await page.screenshot({ path: join(OUT, state, `${name}.png`) });
    report[`${state} ${name}`] = await words();
    await scan(`${state} ${name}`);
  }
  // What a press says when it needs the server: each on its page drawn fresh, a still after the press.
  const PRESSES = [
    ["press-reminders", "#settings/reminders", { role: "button", name: "Turn on reminders" }],
    ["press-passkey", "#settings/account", { text: "Add a passkey on this device" }],
    ["press-dropbox", "#settings/storage", { row: "Dropbox" }],
    ["press-start", "#today", { role: "button", name: "Start" }],
    // Asking for a book fetches the shelf's books: offline and with the server failing, the sheet says so in words.
    ["press-ask", "#explore/requests", { role: "button", name: "Ask for a book" }],
  ];
  for (const [name, hash, what] of PRESSES) {
    await go(hash === "#today" ? "#study" : "#today", 600);
    await go(hash);
    try {
      const target = what.role ? page.getByRole(what.role, { name: what.name }).first() : what.row ? page.locator('[data-part="list-row"], li', { hasText: what.row }).locator("button").first() : page.getByText(what.text).first();
      await target.click({ timeout: 5000 });
      await page.waitForTimeout(2500);
    } catch (error) {
      report[`${state} ${name}`] = `(couldn't press: ${String(error.message).slice(0, 80)})`;
    }
    await page.screenshot({ path: join(OUT, state, `${name}.png`) });
    report[`${state} ${name}`] ??= await words();
    await scan(`${state} ${name}`);
    await page.keyboard.press("Escape").catch(() => {});
  }
}
const blank = Object.entries(report).filter(([, text]) => !text.trim()).map(([where]) => where);
writeFileSync(join(OUT, "words.json"), JSON.stringify({ report, errors, leaks, blank }, null, 2));
console.log(`${Object.keys(report).length} pages and presses; ${errors.length} page errors; ${leaks.length} lines with code's words; ${blank.length} blank`);
for (const l of leaks) console.log("FAIL code words:", l);
for (const b of blank) console.log("FAIL blank:", b);
for (const e of errors) console.log("FAIL page error:", e.slice(0, 200));
await page.unroute(/\/(api|library)\//).catch(() => {});
await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
await browser.close();
process.exit(leaks.length || blank.length || errors.length ? 1 : 0);
