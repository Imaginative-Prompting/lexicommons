// lx-app (scratch): what "lesson 1 done" reads right after a restart (app-ready), and 2 s on.
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
const read = () => page.evaluate(async () => {
  const { pathLessons } = await import("/js/study/path.js");
  const { lessonFinished } = await import("/js/study/plan.js");
  const { allEvidence } = await import("/js/study/progress.js");
  const { markedOn } = await import("/js/study/path-place.js");
  const { learning } = await import("/js/study/learning.js");
  const { lessonsComing } = await import("/js/study/packs.js");
  const coming = lessonsComing();
  const ls = pathLessons();
  return { coming, lessons: ls.length, first: ls[0]?.id, firstTitle: ls[0]?.title, finished: ls[0] ? lessonFinished(ls[0]) : null, evidence: allEvidence().length, marked: markedOn(learning()) };
});
try {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Restart probe");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  for (let i = 0; i < 120; i++) { const r = await read(); console.log("  look", i, JSON.stringify({ coming: r.coming, lessons: r.lessons, first: r.first })); if (r.lessons > 3) break; await page.waitForTimeout(250); }
  console.log("before marking:", JSON.stringify(await read()));
  await page.evaluate(async () => {
    const { pathLessons } = await import("/js/study/path.js");
    const { markLessonsDone } = await import("/js/study/plan.js");
    markLessonsDone(pathLessons().slice(0, 1));
  });
  console.log("marked:", JSON.stringify(await read()));
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  console.log("at app-ready after a reload:", JSON.stringify(await read()));
  await page.waitForTimeout(2000);
  console.log("2 s on:", JSON.stringify(await read()));
  await page.evaluate(() => fetch("/account/delete", { method: "POST" })).catch(() => {});
} finally {
  await browser.close();
}
