// lx-app (scratch): pick 3's measure, alone: a brand-new learner's Explore, the pack to add next face-out (explore-check's own selector).
// node control.mjs <app dir> http://localhost:<port>   → prints the count (app's explore.js: 1 or more; pick 3's: 0)
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [APP, BASE] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(join(resolve(APP), "scripts/quiet-browser.mjs")).href);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
try {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Pick three control");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.goto(`${BASE}/app/#explore`);
  await page.locator('[data-part="page"]:not([data-ghost]) .lx-explore-topics').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  const faces = await page.locator('[data-part="page"]:not([data-ghost]) .lx-face').count();
  const pick = await page.locator('[data-part="page"]:not([data-ghost]) .lx-pick').first().innerText().catch(() => "");
  const lessons = await page.evaluate(async () => (await import("/js/study/path.js")).pathLessons().length);
  console.log(`a brand-new learner's Explore: ${faces} face-out pick(s)${pick ? ` (${pick.replace(/\s+/g, " ").slice(0, 80)})` : ""}; path lessons here: ${lessons}`);
  await page.evaluate(() => fetch("/account/delete", { method: "POST" })).catch(() => {});
} finally {
  await browser.close();
}
