// lx-app (scratch only): Home's "Learn something new" after Study's mark-as-done. A new Dutch learner plays lesson 1, marks the rest of unit 1
// done (plan.js markLessonsDone, as Study's own does), then Home's card read: on the same page (no reload), after a reload, and 30 s on;
// beside it what plan.js's studyOverview says in the page at the same moments, and the evidence and marks the page has.
//   node probe-home-marks.mjs http://localhost:<port> <outDir> --app <copy dir>
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = resolve(outArg);
const APP = resolve(argv[argv.indexOf("--app") + 1]);
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(pathToFileURL(join(APP, "scripts/quiet-browser.mjs")).href);
const { playToSummary, pastReminderAsk, SESSION } = await import(pathToFileURL(join(APP, "scripts/fixtures/play-session.mjs")).href);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark", reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', `Marks ${randomBytes(2).toString("hex")}`);
await page.click('#register button[type="submit"]');
await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]");
await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
await page.waitForFunction(async () => true);
await page.evaluate(async () => {
  const content = await import("/js/study/content.js");
  const { pathLessons } = await import("/js/study/path.js");
  for (let waited = 0; waited < 120_000; waited += 400) {
    if (content.ITEMS.some((item) => item.pack === "path-nl") && pathLessons().length > 5) return;
    await new Promise((r) => setTimeout(r, 400));
  }
});
await page.evaluate(() => (location.hash = "#study/session/lesson?from=today"));
await page.waitForSelector(SESSION);
await playToSummary(page, { limit: 90 });
await page.locator(`${SESSION} [data-part="answer-bar"]`).getByRole("button", { name: "Done" }).click();
await pastReminderAsk(page);

// Each delay in turn on its own unit: mark it, reload after the delay, and read what the page has once it's back.
const results = { runs: [], errors };
for (const delay of [0, 500, 1500, 3000]) {
  const before = await page.evaluate(async () => {
    const { pathLessons } = await import("/js/study/path.js");
    const plan = await import("/js/study/plan.js");
    const progress = await import("/js/study/progress.js");
    const next = plan.studyOverview().lesson;
    const lesson = pathLessons().find((one) => one.id === next.id);
    const unit = pathLessons().filter((one) => one.unit?.id === lesson.unit?.id && !one.worked);
    const was = progress.allEvidence().length;
    plan.markLessonsDone(unit);
    return { unit: lesson.unit?.id, lessons: unit.length, evidenceBefore: was, evidenceAfter: progress.allEvidence().length, nextAfter: plan.studyOverview().lesson?.title };
  });
  await page.waitForTimeout(delay);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForTimeout(3000);
  const after = await page.evaluate(async () => {
    const plan = await import("/js/study/plan.js");
    const progress = await import("/js/study/progress.js");
    const card = document.querySelector('[data-part="page"]')?.textContent.replace(/\s+/g, " ") ?? "";
    return { evidence: progress.allEvidence().length, next: plan.studyOverview().lesson?.title, homeLearn: /Learn something new(.{0,40})/.exec(card)?.[1] ?? null };
  });
  results.runs.push({ delay, ...before, ...after });
}
writeFileSync(join(OUT, "home-marks-reload.json"), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
await browser.close();
process.exit(0);
