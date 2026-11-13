// Trying Lexicommons with no account (/try/: try/main.js; study/sample-mode.js demoPage; session.js tryOut; packs.js), in Chrome, by real presses:
//   - a visitor on a phone: the band ("Make an account"), the first run's chooser, Dutch's lesson 1 to its summary (what it taught, and nothing
//     that promises more: no streak, no "they're yours", no reminder ask), Next lesson, lesson 2, Done, the end card ("Make an account", "Back
//     to the home page"); nothing asked of /api/ but error reports, nothing of /login; only the packs that carry Dutch's lessons fetched;
//     what's kept is the try-out's own (….try databases, lx.try: keys), never a real progress store or the first run's real keys
//     (a planted real key caught first);
//   - a signed-in learner on the same browser: their app's progress hashed, a try-out lesson played (its band and summary "Go to your app"),
//     then their app again: every progress store as it was, their answers the same, and the try-out's keys gone (the app's start clears them);
//   - a computer (1280 × 800): the chooser in its columns, lesson 1's first step, its cross partway bringing the end card with the way back;
//   - each full course reaches its lesson 1's first step.
// LOCAL only (it signs up an account), a copy with the full courses' lessons (npm run local):
//   node scripts/try-check.mjs http://localhost:<port> <outDir> [--only <regex>]   (exit 0 = pass)
process.env.LX_FIRST_RUN = "1";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const { chromium } = await import("./quiet-browser.mjs");
const { answerStep, nextStep, pastReminderAsk, SESSION } = await import("./fixtures/play-session.mjs");
const { pastKnowSome, pressInPage } = await import("./fixtures/first-run.mjs");

const [BASE, outArg, ...rest] = process.argv.slice(2);
if (!BASE || !outArg || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("usage: try-check.mjs http://localhost:<port> <outDir> [--only <regex>] (LOCAL only)");
  process.exit(2);
}
const ONLY = rest.includes("--only") ? new RegExp(rest[rest.indexOf("--only") + 1]) : null;
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.log("FAIL  timed out"), process.exit(3)), 25 * 60_000).unref();
const COURSES = ["nl", "es", "fr", "de", "it", "pt", "ja", "ru"];
const PROGRESS_DBS = ["lexicommons-study", "lexicommons-practice", "lexicommons-highlights", "lexicommons-word-index", "lexicommons-plan", "lexicommons-read"];
const PROGRESS_KEYS = /^(lx\.streak\.|lx\.path\.v1|lx\.learning\.v1|lx\.welcome\.v1|lx\.study\.|lx\.reader\.|lx\.today\.thrown|lx\.know\.pile\.|lx\.ai\.record\.v1|lx\.sync\.)/;

let failed = 0;
let passed = 0;
const results = [];
async function stage(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
    results.push({ name, ok: true, note });
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${String(error.message ?? error).slice(0, 600)}`);
    results.push({ name, ok: false, error: error.message });
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const browser = await chromium.launch({ headless: true });
const errors = [];
async function device({ width = 390, height = 844, phone = width < 700 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone, serviceWorkers: "block", colorScheme: "dark", locale: "en-US" });
  const page = await context.newPage();
  const asked = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    asked.push({ path: u.pathname, method: r.method() });
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, asked };
}
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });
// What a browser keeps that's a learner's real progress: databases and keys (the try-out's and a sample's aside).
const realProgress = (page) =>
  page.evaluate(
    async ({ dbs, keys }) => {
      const re = new RegExp(keys);
      const names = (await indexedDB.databases()).map((d) => d.name);
      return { dbs: names.filter((n) => dbs.includes(n)), keys: Object.keys(localStorage).filter((k) => re.test(k)), tryKeys: Object.keys(localStorage).filter((k) => k.startsWith("lx.try:")).length, tryDbs: names.filter((n) => n.endsWith(".try")) };
    },
    { dbs: PROGRESS_DBS, keys: PROGRESS_KEYS.source },
  );
const hashProgress = (page) =>
  page.evaluate(
    async ({ dbs, keys }) => {
      const re = new RegExp(keys);
      const sha = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const out = {};
      for (const name of (await indexedDB.databases()).map((d) => d.name).filter((n) => dbs.includes(n)).sort()) {
        const db = await new Promise((done, fail) => {
          const r = indexedDB.open(name);
          r.onsuccess = () => done(r.result);
          r.onerror = () => fail(r.error);
        });
        const parts = [];
        for (const store of [...db.objectStoreNames].sort()) {
          parts.push(
            await new Promise((done, fail) => {
              const tx = db.transaction(store, "readonly");
              const k = tx.objectStore(store).getAllKeys();
              const v = tx.objectStore(store).getAll();
              tx.oncomplete = () => done([store, k.result, v.result]);
              tx.onerror = () => fail(tx.error);
            }),
          );
        }
        db.close();
        out[`db:${name}`] = await sha(JSON.stringify(parts));
      }
      for (const k of Object.keys(localStorage).sort()) if (re.test(k)) out[`ls:${k}`] = await sha(localStorage.getItem(k));
      return out;
    },
    { dbs: PROGRESS_DBS, keys: PROGRESS_KEYS.source },
  );
async function playToSummary(page) {
  await page.waitForSelector(SESSION, { timeout: 40_000 });
  let steps = 0;
  for (let i = 0; i < 90; i++) {
    const step = await nextStep(page);
    if (step?.kind === "summary") return steps;
    steps++;
    await answerStep(page, {});
  }
  throw new Error("no summary after 90 steps");
}
const barLabels = (page) => page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`).allInnerTexts().then((list) => list.map((s) => s.trim()));
const pickLanguage = async (page, code) => {
  await page.waitForSelector(`.lx-try-stage [data-language="${code}"]`, { timeout: 30_000 });
  await page.locator(`.lx-try-stage [data-language="${code}"]`).scrollIntoViewIfNeeded();
  await page.locator(`.lx-try-stage [data-language="${code}"]`).click();
};

await stage("a visitor on a phone: the band, the chooser, two lessons with quiet summaries, the end card; nothing out, nothing kept as anyone's", async () => {
  const { context, page, asked } = await device();
  await page.goto(`${BASE}/try/`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 40_000 });
  const band = (await page.locator(".lx-try-band").innerText()).replace(/\s+/g, " ").trim();
  assert(/Trying Lexicommons\. Nothing here is kept\./.test(band) && /Make an account/.test(band), `the band: ${band}`);
  await shot(page, "phone-1-choose");
  // The control: a real progress key planted is what this stage's reading finds.
  await page.evaluate(() => localStorage.setItem("lx.learning.v1", "planted"));
  const planted = await realProgress(page);
  assert(planted.keys.includes("lx.learning.v1"), `a planted real key wasn't found: ${JSON.stringify(planted)}`);
  await page.evaluate(() => localStorage.removeItem("lx.learning.v1"));
  await pickLanguage(page, "nl");
  await page.waitForSelector(SESSION, { timeout: 40_000 });
  await page.waitForTimeout(600);
  await shot(page, "phone-2-lesson1");
  const one = await playToSummary(page);
  await page.waitForTimeout(900);
  await shot(page, "phone-3-summary1");
  const summary1 = (await page.locator(`${SESSION} [data-part="session-summary"]`).innerText()).replace(/\s+/g, " ");
  const celebrations = await page.locator(`${SESSION} [data-part="celebration"]`).count();
  assert(!celebrations && !/yours now|come up when you practice/i.test(summary1), `the summary promises more: ${summary1.slice(0, 240)} (celebrations ${celebrations})`);
  assert(/new words? in this lesson/.test(summary1), `what it taught: ${summary1.slice(0, 200)}`);
  assert(JSON.stringify(await barLabels(page)) === JSON.stringify(["Make an account", "Next lesson"]), `its buttons: ${JSON.stringify(await barLabels(page))}`);
  await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Next lesson" }).click();
  const two = await playToSummary(page);
  await page.waitForTimeout(900);
  await shot(page, "phone-4-summary2");
  assert(JSON.stringify(await barLabels(page)) === JSON.stringify(["Done"]), `lesson 2's buttons: ${JSON.stringify(await barLabels(page))}`);
  await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Done" }).click();
  await page.waitForSelector(".lx-try-end", { timeout: 10_000 });
  await page.waitForTimeout(800);
  await shot(page, "phone-5-end");
  const end = (await page.locator(".lx-try-end").innerText()).replace(/\s+/g, " ");
  assert(/That's the try-out/.test(end) && /Make an account/.test(end) && /Back to the home page/.test(end), `the end card: ${end}`);
  const widths = await page.locator(".lx-try-actions > [data-part='button']").evaluateAll((list) => list.map((b) => Math.round(b.getBoundingClientRect().width)));
  assert(widths.length === 2 && Math.abs(widths[0] - widths[1]) <= 1, `the end card's two buttons: ${widths.join(" and ")} px wide`);
  // Nothing out but error reports; no sign-in asked.
  const out = asked.filter((r) => (r.path.startsWith("/api/") && r.path !== "/api/errors") || r.path.startsWith("/login"));
  assert(!out.length, `asked of the server: ${[...new Set(out.map((r) => `${r.method} ${r.path}`))].join(", ")}`);
  // Only the packs that carry Dutch's lessons.
  const catalogue = await page.evaluate(async () => (await (await fetch("/library/catalogue.json")).json()).packs.nl);
  const lessonIds = catalogue.filter((p) => Number(p.lessons) > 0).map((p) => p.id);
  const fetched = [...new Set(asked.map((r) => r.path).filter((p) => /^\/library\/packs\//.test(p) && /\.json$/.test(p) && !/\/(notes|forms|audio|grammar)/.test(p)))];
  const strays = fetched.filter((p) => !lessonIds.some((id) => p.includes(id)));
  assert(fetched.length && !strays.length, `packs fetched: ${fetched.join(", ")}; the lessons' packs: ${lessonIds.join(", ")}`);
  const kept = await realProgress(page);
  assert(!kept.dbs.length && !kept.keys.length && kept.tryKeys > 0 && kept.tryDbs.includes("lexicommons-study.try"), `kept: ${JSON.stringify(kept)}`);
  await context.close();
  return `lesson 1 in ${one} steps, lesson 2 in ${two}; asked of /api/: nothing; packs: ${fetched.map((p) => p.split("/").pop()).join(", ")}; kept: ${kept.tryKeys} try-out keys, ${kept.tryDbs.length} try-out databases, no real one`;
});

await stage("a signed-in learner on the same browser: their progress untouched by a try-out, the band and summary go to their app, the try-out's keys gone after", async () => {
  const { context, page, asked } = await device();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Try check");
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector(".lx-welcome", { timeout: 30_000 });
  await page.evaluate(() => document.querySelector('.lx-welcome [data-language="nl"]').click());
  // Dutch is a full course: its question whether you know some already, answered No, I'm new to it (fixtures/first-run.mjs).
  await pastKnowSome(page, { press: pressInPage });
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(() => (location.hash = "#study/session/lesson"));
  await playToSummary(page);
  await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page).catch(() => {});
  await page.waitForTimeout(1500);
  const answers = await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().length);
  const before = await hashProgress(page);
  await page.goto(`${BASE}/try/`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 40_000 });
  const band = (await page.locator(".lx-try-band").innerText()).replace(/\s+/g, " ");
  assert(/Go to your app/.test(band) && !/Make an account/.test(band), `the band for a signed-in browser: ${band}`);
  await shot(page, "signed-in-1-band");
  await pickLanguage(page, "nl");
  await playToSummary(page);
  const labels = await barLabels(page);
  assert(labels[0] === "Go to your app", `the summary's buttons: ${JSON.stringify(labels)}`);
  const during = await hashProgress(page);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(during)])].filter((k) => before[k] !== during[k]);
  assert(!changed.length, `their progress changed during a try-out: ${changed.join(", ")}`);
  await page.goto(`${BASE}/app/`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 40_000 });
  await page.waitForTimeout(1500);
  const after = await hashProgress(page);
  const again = await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().length);
  const left = await realProgress(page);
  const progressChanged = Object.keys(before).filter((k) => k.startsWith("db:lexicommons-study") && before[k] !== after[k]);
  assert(again === answers && !progressChanged.length, `their answers ${answers} then ${again}; changed: ${progressChanged.join(", ")}`);
  assert(left.tryKeys === 0, `the try-out's keys left after the app's start: ${left.tryKeys}`);
  await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) }).catch(() => {}));
  await context.close();
  return `${answers} answers before and after; ${Object.keys(before).length} progress stores hashed, none changed by the try-out`;
});

await stage("a computer (1280 × 800): the chooser in columns, lesson 1, its cross partway bringing the end card with the way back", async () => {
  const { context, page } = await device({ width: 1280, height: 800 });
  await page.goto(`${BASE}/try/`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 40_000 });
  await page.waitForTimeout(800);
  await shot(page, "computer-1-choose");
  await pickLanguage(page, "nl");
  await page.waitForSelector(SESSION, { timeout: 40_000 });
  await page.waitForTimeout(800);
  await shot(page, "computer-2-lesson1");
  await answerStep(page, {});
  await page.waitForTimeout(500);
  await page.locator(`${SESSION} [data-part="session-bar"] [data-part="icon-button"]`).first().click({ timeout: 5000 });
  await page.waitForSelector(".lx-try-end", { timeout: 10_000 });
  await page.waitForTimeout(800);
  await shot(page, "computer-3-end-partway");
  const end = (await page.locator(".lx-try-end").innerText()).replace(/\s+/g, " ");
  assert(/Back to the lesson/.test(end) && /Make an account/.test(end), `the end card partway: ${end}`);
  const widths = await page.locator(".lx-try-actions > [data-part='button']").evaluateAll((list) => list.map((b) => Math.round(b.getBoundingClientRect().width)));
  assert(widths.length === 2 && Math.abs(widths[0] - widths[1]) <= 1, `the end card's two buttons at 1280: ${widths.join(" and ")} px wide`);
  await context.close();
});

await stage("each full course reaches its lesson 1's first step", async () => {
  const reached = [];
  for (const code of COURSES) {
    const { context, page } = await device();
    await page.goto(`${BASE}/try/`);
    await page.waitForSelector("html[data-app-ready]", { timeout: 40_000 });
    await pickLanguage(page, code);
    const step = await page.waitForSelector(SESSION, { timeout: 45_000 }).then(() => nextStep(page)).catch(() => null);
    if (code === "ja") await shot(page, "phone-ja-lesson1");
    reached.push(`${code}:${step?.kind ?? "none"}`);
    await context.close();
  }
  assert(reached.every((r) => !r.endsWith(":none") && !r.endsWith(":summary")), reached.join(", "));
  return reached.join(", ");
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.slice(0, 3).join(" | "));
});
await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
