// lx-app (scratch, recorded with pick 3, 11 Nov 2026): the director's look at Explore's home on a phone at 390, a brand-new Dutch learner:
// before lesson 1 (no pack to add next under the lessons' card), then lesson 1 done (marked as one studied: plan.js markLessonsDone) and
// back on Explore, kept, no reload: "Add next" face-out.
// node stills.mjs <app dir> http://localhost:<port> <outDir>
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [APP, BASE, outArg] = process.argv.slice(2);
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(pathToFileURL(join(resolve(APP), "scripts/quiet-browser.mjs")).href);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const face = () => page.locator('[data-part="page"]:not([data-ghost]) .lx-face').count();
try {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Explore look");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.goto(`${BASE}/app/#explore`);
  await page.locator('[data-part="page"]:not([data-ghost]) .lx-explore-topics').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  if (await face()) throw new Error("a pack to add next before lesson 1");
  await page.screenshot({ path: join(OUT, "explore-before-lesson-1-390.png") });
  console.log("  before lesson 1: no pack to add next");
  for (const start = Date.now(); ; await page.waitForTimeout(250)) {
    const done = await page.evaluate(async () => {
      const { lessonsComing } = await import("/js/study/packs.js");
      const { pathLessons } = await import("/js/study/path.js");
      const lessons = pathLessons();
      if (lessonsComing() || !lessons.length) return false;
      const { lessonFinished, markLessonsDone } = await import("/js/study/plan.js");
      if (!lessonFinished(lessons[0])) markLessonsDone(lessons.slice(0, 1));
      return lessonFinished(lessons[0]);
    });
    if (done) break;
    if (Date.now() - start > 30_000) throw new Error("the path's lessons never came");
  }
  await page.goto(`${BASE}/app/#today`);
  await page.waitForFunction(() => location.hash === "#today");
  await page.goto(`${BASE}/app/#explore`);
  await page.locator('[data-part="page"]:not([data-ghost]) .lx-face').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "explore-after-lesson-1-390.png") });
  const pick = (await page.locator('[data-part="page"]:not([data-ghost]) .lx-pick').first().innerText()).replace(/\s+/g, " ");
  console.log(`  after lesson 1: ${pick}`);
  await page.evaluate(() => fetch("/account/delete", { method: "POST" })).catch(() => {});
  console.log("explore stills: done");
} catch (error) {
  console.log(`explore stills: FAILED\n  ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
