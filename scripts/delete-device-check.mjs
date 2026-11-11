// What deleting an account, and clearing this device's study progress, leave on the device, on a phone by the real presses. The account
// page says deleting takes this device's progress, packs, texts and settings: after it, no IndexedDB store of the app's holds a row and no
// lx.* key is left, the kept word index and the plan's kept parts included (know/word-index.js, study/plan-kept.js: worked out from the
// progress and the packs, so the person's study in another form). Clear study progress on this device leaves no answer and no unit in the
// kept index. First a control for each reading: a row planted in a store, and a unit planted in the kept index, must be found.
//
//   node scripts/delete-device-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]
//
// --from <copy> serves another copy's /js and /css (the app from before 10 Nov 2026 fails it: the word index's and the plan's rows stayed
// after a delete). LOCAL only (it signs up an account and deletes it), a copy with Dutch's lessons; through gpu.py's parallel lane.
// Exit 0 = pass.
import { chromium } from "./quiet-browser.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { answerStep, SESSION } from "./fixtures/play-session.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const FROM = argv.includes("--from") ? resolve(argv[argv.indexOf("--from") + 1]) : null;
if (!/^http:\/\/localhost:\d+$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/delete-device-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]   (LOCAL only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
let failed = 0;
const say = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

// Every row the app's IndexedDB stores hold: [{ store: "<database>/<store>", rows, units }], units being the kept index's entries.
const STORES = async () => {
  const out = [];
  for (const { name } of await indexedDB.databases()) {
    if (!name?.startsWith("lexicommons")) continue;
    const db = await new Promise((done, fail) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => done(request.result);
      request.onerror = () => fail(request.error);
    });
    for (const store of db.objectStoreNames) {
      const rows = await new Promise((done) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => done(request.result);
        request.onerror = () => done([]);
      });
      if (rows.length) out.push({ store: `${name}/${store}`, rows: rows.length, units: rows.reduce((n, row) => n + (Array.isArray(row?.entries) ? row.entries.length : 0), 0) });
    }
    db.close();
  }
  return out;
};
const PLANT = ([name, store, row]) =>
  new Promise((done, fail) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      const tx = request.result.transaction(store, "readwrite");
      tx.objectStore(store).put(row);
      tx.oncomplete = () => (request.result.close(), done(true));
      tx.onerror = () => fail(tx.error);
    };
    request.onerror = () => fail(request.error);
  });
const KEYS = () => Object.keys(localStorage).filter((key) => key.startsWith("lx."));
const told = (stores) => stores.map((s) => `${s.store}: ${s.rows} row(s)${s.units ? `, ${s.units} unit(s)` : ""}`).join("; ") || "none";

const MIME = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block", colorScheme: "dark" });
if (FROM) {
  await context.route(/\/(js|css)\/[^?]+/, (route) => {
    const file = join(FROM, "public", new URL(route.request().url()).pathname);
    return existsSync(file) ? route.fulfill({ status: 200, contentType: MIME[extname(file)] ?? "application/octet-stream", body: readFileSync(file) }) : route.continue();
  });
}
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const here = '[data-part="page"]:not([data-ghost])';
const report = {};

await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Delete Device");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());

/** Five answers of the next lesson, then long enough for what's kept to be written (both keep 2 s after the last change). */
async function study() {
  await page.evaluate(() => (location.hash = "#study/session/lesson"));
  await page.waitForSelector(SESSION, { timeout: 40_000 });
  for (let i = 0; i < 5; i++) await answerStep(page);
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForTimeout(4000);
}
const twoPresses = async (first, second) => {
  await page.locator(here).getByText(first, { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.locator(here).getByText(second, { exact: true }).first().click();
};

await study();
const studied = await page.evaluate(STORES);
report.studied = studied;
const index = studied.find((s) => s.store === "lexicommons-word-index/languages");
say(Boolean(index?.units) && studied.some((s) => s.store.startsWith("lexicommons-study/")), "after five answers the device holds the answers and a kept word index with their units", told(studied));

// Clear study progress on this device.
await page.evaluate(() => (location.hash = "#settings/data"));
await page.waitForTimeout(1200);
await twoPresses("Clear study progress on this device", "Press again to clear it");
await page.waitForTimeout(4000);
const cleared = await page.evaluate(STORES);
report.cleared = cleared;
const left = cleared.filter((s) => s.store.startsWith("lexicommons-study/") || s.units > 0);
say(left.length === 0, "Clear study progress on this device: no answer is left, and no unit in the kept word index", told(left));
// Its control: a unit planted in the kept index is found by that reading.
await page.evaluate(PLANT, ["lexicommons-word-index", "languages", { lang: "zz", schema: 0, model: "", stamp: "", entries: [["w:planted", 1, 1, 1, [], 0, 0, 0]] }]);
const plantedUnit = (await page.evaluate(STORES)).filter((s) => s.units > 0);
say(plantedUnit.length === 1, "the control: a unit planted in the kept word index is found", told(plantedUnit));

// Delete my account, with study of its own again.
await study();
await page.evaluate(() => (location.hash = "#settings/account"));
await page.waitForTimeout(1200);
await twoPresses("Delete my account", "Press again to delete it for good");
await page.waitForURL(/\/login\?deleted=1/, { timeout: 30_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, "after-delete.png") });
const after = await page.evaluate(STORES);
const keys = await page.evaluate(KEYS);
report.deleted = { stores: after, keys };
say((await page.locator("body").innerText()).includes("Your account has been deleted."), "Delete my account lands on sign-in, saying the account has been deleted", page.url().replace(BASE, ""));
say(after.length === 0, "after deleting, no store of the app's on the device holds a row", told(after));
say(keys.length === 0, "and no lx.* key is left", keys.join(", "));
say((await page.evaluate(() => fetch("/api/me").then((r) => r.status))) === 401, "and the account is gone from the server");
// Its control: a row planted in a store is found by that reading.
await page.evaluate(PLANT, ["lexicommons-plan", "languages", { lang: "zz", schema: 0, parts: {} }]);
const plantedRow = await page.evaluate(STORES);
say(plantedRow.length === 1 && plantedRow[0].store === "lexicommons-plan/languages", "the control: a row planted in a store is found", told(plantedRow));
say(errors.length === 0, "no page error", errors.slice(0, 2).join(" | "));

writeFileSync(join(OUT, "delete-device-check.json"), JSON.stringify(report, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
