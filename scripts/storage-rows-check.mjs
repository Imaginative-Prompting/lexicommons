// Settings → Storage's rows at their first frame, on a slow connection: exactly the stores this site offers, with no empty
// section and no jump when anything arrives later. Then a first run with nothing remembered, then a control: a row taken
// out while sampling must be seen, so this can fail. On a local server with the main site's config; it signs up a test account
// and deletes it. (A copy on someone's computer has no rows: local-copy-check holds that.)
//   node scripts/storage-rows-check.mjs <origin> <outDir> --expect "Google Drive,Dropbox,OneDrive"   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const EXPECT = argv.includes("--expect") ? argv[argv.indexOf("--expect") + 1].split(",").filter(Boolean) : null;
if (!BASE || !OUT || !EXPECT?.length || /(^|\.)lexicommons\.(com|app)$/.test(new URL(BASE).hostname)) {
  console.error('Usage: node scripts/storage-rows-check.mjs <origin> <outDir> --expect "A,B"   (never the main site: it signs up a test account)');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
let failed = 0;
const say = (ok, what, detail = "") => {
  failed += ok ? 0 : 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Storage Rows Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });

// Every /api answer from here on is slow, as on a poor connection.
await context.route("**/api/**", async (route) => {
  await new Promise((r) => setTimeout(r, 1200));
  await route.continue().catch(() => {});
});

/** Goes to the Storage page, sampling every frame for `ms`: which rows, how tall the section. */
const sample = (hash, ms, sabotage = false) =>
  page.evaluate(
    ({ hash, ms, sabotage }) =>
      new Promise((resolve) => {
        const frames = [];
        const start = performance.now();
        let hit = false;
        const look = () => {
          const pages = [...document.querySelectorAll('[data-part="page"]:not([data-ghost])')];
          const here = pages.find((p) => p.querySelector('[data-part="page-title"]')?.textContent.trim() === "Sync across devices" || /^Sync across devices/.test(p.querySelector("h1")?.textContent.trim() ?? ""));
          if (here) {
            const group = here.querySelector("section.lx-group");
            const rows = [...(group?.querySelectorAll(".lx-row-title") ?? [])].map((n) => n.textContent.trim());
            if (sabotage && !hit && performance.now() - start > ms / 2 && rows.length) {
              hit = true;
              group.querySelector("li")?.remove();
            }
            frames.push({ t: Math.round(performance.now() - start), rows, height: Math.round(group?.getBoundingClientRect().height ?? 0) });
          }
          if (performance.now() - start < ms) requestAnimationFrame(look);
          else resolve(frames);
        };
        location.hash = hash;
        requestAnimationFrame(look);
      }),
    { hash, ms, sabotage },
  );
const judge = (frames, name) => {
  const first = frames[0];
  const rowsAlways = frames.every((f) => JSON.stringify(f.rows) === JSON.stringify(EXPECT));
  const heights = [...new Set(frames.map((f) => f.height))];
  say(frames.length > 30, `${name}: sampled`, `${frames.length} frames`);
  say(JSON.stringify(first?.rows) === JSON.stringify(EXPECT), `${name}: the rows are there at the first frame`, JSON.stringify(first?.rows));
  say(rowsAlways, `${name}: the same rows at every frame`);
  say(heights.length === 1 && heights[0] > 0, `${name}: the section's height never changes`, heights.join(", "));
  return { first, heights, frames: frames.length };
};

const results = {};
results.slow = judge(await sample("#settings/storage", 3500), "slow connection");
await page.screenshot({ path: `${OUT}/storage-slow.png` });
await page.evaluate(() => (location.hash = "#settings"));
await page.waitForTimeout(500);
// The menu's row for it (since v89 it says what's connected, as its value, not the stores on offer; called Sync across devices since
// v154): there at once, since the start knew the stores, and Off with none connected.
const menu = page.locator('[data-part="list-row"]').filter({ has: page.locator(".lx-row-title", { hasText: /^Sync across devices$/ }) }).locator(".lx-row-value").first();
const value = ((await menu.textContent({ timeout: 10_000 }).catch(() => null)) ?? "(no Sync across devices row)").trim();
say(value === "Off", "the menu's Sync across devices row is there, Off with nothing connected", value);
await page.waitForTimeout(1500);
say(((await menu.textContent({ timeout: 2_000 }).catch(() => null)) ?? "").trim() === value, "and doesn't change later");

// Nothing remembered: the same, because the start told it (a reload through /api/me).
await page.evaluate(() => {
  localStorage.removeItem("lc_storage_available");
  location.hash = "#today";
});
await page.reload();
await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
results.first = judge(await sample("#settings/storage", 2500), "first run, nothing remembered");

// It can fail: a row taken out mid-sample is seen.
await page.evaluate(() => (location.hash = "#today"));
await page.waitForTimeout(500);
const sabotaged = await sample("#settings/storage", 2000, true);
const sawIt = new Set(sabotaged.map((f) => f.height)).size > 1 && sabotaged.some((f) => f.rows.length < EXPECT.length);
say(sawIt, "the control: a row taken out while sampling is seen", [...new Set(sabotaged.map((f) => f.height))].join(", "));

await context.unroute("**/api/**");
const gone = await page.evaluate(async () => (await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).status);
say(gone === 200, "the test account is deleted");
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
console.log(`\n${failed} failed`);
process.exit(failed ? 1 : 0);
