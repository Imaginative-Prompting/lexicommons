// The streak's page and the way to it, on a phone, from a new account given a year of studying (shell/settings-streak.js, know/streak-days.js):
// - Home's streak, all of it, opens the page: the number and the week row alike (one link, no link inside it), and Back is Home.
// - The year: the months from the first day studied to today's, a year at most, newest first, the weekdays once over each month's columns.
// - The chosen day is ringed, today until another is tapped; a tap on a past day rings it and says what you did: the words you came to know
//   well that day (a word planted to cross that day), its lesson by title, the minutes read; a day with nothing is said plainly; "missed"
//   nowhere. Each month's days are one control, 44 px and more, and the arrows move the chosen day.
// - A tap never waits on the day's words: on a heavy day (60 words with a year of answers, three with 2,880 each), the processor slowed 4×, the tap's own
//   work ends under 50 ms with the ring moved, the words come after, and no task in between runs past 120 ms.
// - Pictures at 390 in Graphite and Paper.
// LOCAL only, path-nl seeded (for the lessons' titles). Usage: node scripts/streak-page-check.mjs http://localhost:<port> <outDir>
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/streak-page-check.mjs http://localhost:<port> <outDir> (a local server)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const run = randomBytes(3).toString("hex");
const results = [];
const opened = [];
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    const page = opened.at(-1)?.pages()[0];
    if (page && !page.isClosed()) await page.screenshot({ path: join(OUT, `fail-${results.length + 1}.png`) }).catch(() => {});
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").slice(0, 8).join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

const browser = await chromium.launch();
let shared = null;

/** A phone with a new account and a year of studying planted: the streak's log and evidence for one word crossing on day D (`ago` days back). */
async function learner({ theme = "graphite" } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  opened.push(context);
  await context.addInitScript((theme) => {
    try {
      if (!localStorage.getItem("lx.appearance.v1")) localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme, presets: {} }));
    } catch {}
  }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const authn = await context.newCDPSession(page);
  await authn.send("WebAuthn.enable");
  await authn.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', `Streak ${run}`);
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  // Dutch's lessons first, as a learner a year in has them: a lesson planted while the path is still arriving was once titled one way
  // on the page and another when the check read it (6 Nov 2026, on the landed app); the page draws the day again as content changes.
  await page.evaluate(async () => {
    const content = await import("/js/study/content.js");
    const { pathLessons } = await import("/js/study/path.js");
    for (let waited = 0; waited < 90_000; waited += 250) {
      if (content.ITEMS.some((item) => item.pack === "path-nl") && pathLessons().length > 40) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("Dutch's lessons never came (path-nl seeded?)");
  });
  const planted = await page.evaluate(async () => {
    const { addDays, dayKey } = await import("/js/know/streak.js");
    const { pathLessons } = await import("/js/study/path.js");
    const today = dayKey();
    const at = (key, hour) => +new Date(`${key}T${String(hour).padStart(2, "0")}:00:00`);
    const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
    const lessons = pathLessons().slice(0, 40);
    const things = {};
    // A year back: studied most days (every ninth a plain day), a lesson each Monday, reading most days, a pause 40 days back.
    const pauseFrom = addDays(today, -42);
    const pauseTo = addDays(today, -40);
    let lessonAt = 0;
    for (let n = 360; n >= 1; n--) {
      const day = addDays(today, -n);
      // Six days off around 100 days back: past what rest days cover, so the streak shows plain days there.
      if (n % 9 === 0 || (n >= 100 && n <= 105) || (day >= pauseFrom && day <= pauseTo)) continue;
      things[`session:${hex()}`] = { at: at(day, 19), day };
      if (new Date(`${day}T12:00:00`).getDay() === 1 && lessons[lessonAt]) things[`lesson:${encodeURIComponent(lessons[lessonAt++].id)}`] = { at: at(day, 18), day };
      if (n % 2 === 0) for (const i of [1, 2]) things[`read:${day}#${i}`] = { at: at(day, 20 + i), day };
    }
    // Day D, 5 days back: a lesson whose title the page should name, 10 minutes reading, and huis known well that day.
    const D = addDays(today, -5);
    const lessonD = lessons[lessonAt] ?? lessons[0];
    things[`lesson:${encodeURIComponent(lessonD.id)}`] = { at: at(D, 18), day: D };
    things[`session:${hex()}`] = { at: at(D, 19), day: D };
    for (const i of [1, 2]) things[`read:${D}#${i}`] = { at: at(D, 20 + i), day: D };
    const pauses = { [hex()]: { at: at(pauseFrom, 9) - 86_400_000, from: pauseFrom, to: pauseTo } };
    localStorage.setItem("lx.streak.v1", JSON.stringify({ things, pauses }));
    const H = addDays(today, -10);
    return { today, D, H, words: ["huis", "fiets", "morgen", "koud", "boek"], lessonId: lessonD.id };
  });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  // The evidence, after the reload: kept in memory at once, so none of it waits on being saved (a reload right after 11,000 rows lost them).
  await page.evaluate(async ({ D, H }) => {
    const { addDays } = await import("/js/know/streak.js");
    const { record } = await import("/js/study/progress.js");
    const at = (key, hour) => +new Date(`${key}T${String(hour).padStart(2, "0")}:00:00`);
    // Words answered right twice, the second time on D, the first some days before: which of them D made known well is the app's own rule's
    // to say (checked below); the page must name those, and no other.
    const WORDS = { huis: 3, fiets: 5, morgen: 7, koud: 10, boek: 14 };
    for (const [word, gap] of Object.entries(WORDS))
      for (const day of [addDays(D, -gap), D]) record([{ concept: `w:${word}`, at: at(day, 19), outcome: "right", test: "recall", skill: "read", activity: "type", item: "t" }]);
    // Day H, 10 days back (past the week the page works out ahead), heavy as a year's learner's days are: 60 words answered every 12 days
    // for a year, and three answered eight times a day all year, as an idea is (each question about one of those is a replay of 2,880
    // answers); all of them answered right on H.
    const heavy = [];
    for (let w = 0; w < 60; w++) for (let k = 30; k >= 0; k--) heavy.push({ concept: `w:heavy${w}`, at: at(addDays(H, -12 * k), 19) + w, outcome: "right", test: "recall", skill: "read", activity: "type", item: "h" });
    for (const unit of ["w:veel", "w:vaak", "w:altijd"]) for (let n = 359; n >= 0; n--) for (let j = 0; j < 8; j++) heavy.push({ concept: unit, at: at(addDays(H, -n), 8 + j) + unit.length, outcome: "right", test: "recall", skill: "read", activity: "type", item: "h" });
    record(heavy);
  }, planted);
  // Which words crossed on D by the app's own rule (known well at its end, not at its start): the page must name exactly these.
  // Worked out here by replaying each word's evidence before the moment (progress.js unitState with until: read known at level 3 or more,
  // understood's rule), apart from the word index the page reads, so the two are held to each other.
  planted.crossed = await page.evaluate(async ({ D, words }) => {
    const { unitState } = await import("/js/study/progress.js");
    // The day from 4 am to 4 am, worked out here (an app from before the page has no streak-days.js, and its check must fail on the page).
    const { DAY_STARTS } = await import("/js/know/streak.js");
    const [y, m, d] = D.split("-").map(Number);
    const start = +new Date(y, m - 1, d, DAY_STARTS);
    const end = +new Date(y, m - 1, d + 1, DAY_STARTS);
    const knew = (unit, t) => {
      const read = unitState(unit, { now: t, until: t }).strengths.read;
      return Boolean(read?.known && read.level >= 3);
    };
    return words.filter((w) => knew(`w:${w}`, end) && !knew(`w:${w}`, start));
  }, planted);
  return { context, page, errors, planted };
}

// A day's part once its words are in: the page works them out after the tap, and says it's busy until then (a page from before says it all
// at once, and is never busy).
const wordsIn = (page) => page.waitForSelector(".lx-streak-daypart:not([aria-busy])", { timeout: 30_000 });
const pageReady = (page) => page.waitForSelector('[data-part="streak-calendar"]', { timeout: 20_000 });
const chosen = (page) => page.evaluate(() => [...document.querySelectorAll('[data-part="streak-day"][aria-current]')].map((n) => n.dataset.key));

try {
  await stage("Home's streak, all of it, opens the page: the number and the week row; one link with none inside; Back is Home", async () => {
    shared = await learner();
    const { page } = shared;
    await page.evaluate(() => (location.hash = "#today"));
    const spot = page.locator('[data-part="page"] a[data-part="streak-spot"]');
    await spot.waitFor({ timeout: 20_000 });
    assert((await spot.locator("a").count()) === 0, "a link inside the streak's link");
    await spot.scrollIntoViewIfNeeded();
    await page.locator('[data-part="page"] [data-part="streak-spot"] [data-part="streak"] strong').tap();
    await page.waitForURL(/#settings\/streak\?from=today$/, { timeout: 10_000 });
    await pageReady(page);
    await page.locator(".lx-back").first().tap();
    await page.waitForURL(/#today$/, { timeout: 10_000 });
    await page.locator('[data-part="page"] [data-part="streak-spot"] [data-part="week-strip"]').tap();
    await page.waitForURL(/#settings\/streak\?from=today$/, { timeout: 10_000 });
    await pageReady(page);
    return "the number and the week row";
  });

  await stage("the year: twelve months, newest first, the weekdays over each; today chosen and ringed; no \"missed\" anywhere", async () => {
    const { page, planted } = shared;
    if (!/#settings\/streak/.test(page.url())) await page.evaluate(() => (location.hash = "#settings/streak?from=today"));
    await pageReady(page);
    const months = await page.evaluate(() => [...document.querySelectorAll('[data-part="streak-month"]')].map((m) => ({ name: m.querySelector("h3").textContent, weekdays: [...m.querySelectorAll(".lx-streak-weekdays span")].map((s) => s.textContent).join("") })));
    assert(months.length === 12, `months: ${months.length}`);
    assert(months.every((m) => m.weekdays === "MTWTFSS"), `weekdays: ${JSON.stringify(months.slice(0, 2))}`);
    const thisMonth = new Date(`${planted.today}T12:00:00`).toLocaleDateString([], { month: "long" });
    assert(months[0].name === thisMonth, `first month ${months[0].name}, not ${thisMonth}`);
    assert(JSON.stringify(await chosen(page)) === JSON.stringify([planted.today]), `chosen: ${await chosen(page)}`);
    assert((await page.locator(".lx-streak-day-title").textContent()) === "Today", "the day's title isn't Today");
    const text = await page.locator('[data-part="page"]').innerText();
    assert(!/missed/i.test(text), "the page says missed");
    const reach = await page.evaluate(() => [...document.querySelectorAll('[data-part="streak-month-days"]')].map((b) => b.getBoundingClientRect()).map((r) => Math.min(r.width, r.height)));
    assert(reach.every((r) => r >= 44), `a month's reach under 44 px: ${reach}`);
    await page.screenshot({ path: join(OUT, "graphite-top-390.png") });
    return `${months.length} months`;
  });

  await stage("a tap on a past day rings it and says what you did: the words known well that day, its lesson, the minutes read", async () => {
    const { page, planted } = shared;
    assert(planted.crossed.length, "none of the planted words crossed on their day by the app's rule: the stage couldn't tell");
    const cell = page.locator(`[data-part="streak-day"][data-key="${planted.D}"]`);
    await cell.scrollIntoViewIfNeeded();
    await cell.tap();
    await page.waitForFunction((D) => document.querySelector('[data-part="streak-day"][aria-current]')?.dataset.key === D, planted.D, { timeout: 5000 });
    await wordsIn(page);
    const day = await page.locator(".lx-streak-daypart").innerText();
    const listed = (day.match(/words? you now know well\n([^\n]*)/)?.[1] ?? "").split(", ").filter(Boolean);
    assert(JSON.stringify([...listed].sort()) === JSON.stringify([...planted.crossed].sort()), `the words: ${listed} (crossed that day: ${planted.crossed})`);
    // Its title as the path names it now (a starter lesson's title names the words it teaches once the packs are in).
    const title = await page.evaluate(async (id) => (await import("/js/study/path.js")).pathLessons().find((l) => l.id === id)?.title ?? null, planted.lessonId);
    assert(title && day.includes(title), `the lesson ${title}: ${day}`);
    assert(/10 minutes reading/.test(day), `the minutes: ${day}`);
    assert(!day.includes("Today"), "still Today");
    await page.locator(".lx-streak-daypart").scrollIntoViewIfNeeded();
    // Past the press (the month's :active fill), as a person sees it once their finger is up.
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, "graphite-day-390.png") });
    return `${listed.join(", ")}; ${title}`;
  });

  await stage("a tap on a heavy day never waits on its words: the ring at once, no long task (processor slowed 4×), the words after", async () => {
    const { page, planted } = shared;
    await page.locator(`[data-part="streak-day"][data-key="${planted.H}"]`).scrollIntoViewIfNeeded();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    try {
      const took = await page.evaluate((H) => {
        globalThis.__streakLong = [];
        new PerformanceObserver((list) => globalThis.__streakLong.push(...list.getEntries().map((e) => Math.round(e.duration)))).observe({ type: "longtask" });
        const span = document.querySelector(`[data-part="streak-day"][data-key="${H}"]`);
        const t = performance.now();
        span.click();
        return { ms: Math.round(performance.now() - t), ringed: document.querySelector('[data-part="streak-day"][aria-current]')?.dataset.key === H };
      }, planted.H);
      assert(took.ringed, "the ring didn't move with the tap");
      assert(took.ms < 50, `the tap's own work took ${took.ms} ms with the processor slowed 4×: the ring waited on the words`);
      await page.waitForFunction((H) => document.querySelector(`.lx-streak-daypart[data-key="${H}"]`) && !document.querySelector(`.lx-streak-daypart[data-key="${H}"][aria-busy]`), planted.H, { timeout: 60_000 });
      const said = await page.locator(".lx-streak-daypart").innerText();
      const long = await page.evaluate(() => globalThis.__streakLong);
      assert(!long.some((ms) => ms > 120), `a task ran ${Math.max(...long)} ms while the words were worked out (long tasks: ${long.join(", ")} ms)`);
      assert(/session/.test(said), `the heavy day said: ${said}`);
      return `the tap ${took.ms} ms, long tasks after it: ${long.length ? long.join(", ") + " ms" : "none"}`;
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
  });

  await stage("a plain day is said plainly; the arrows move the chosen day", async () => {
    const { page, planted } = shared;
    // A day the streak holds nothing for (a missed day is covered by a rest day while one's kept): the first plain one shown.
    planted.plain = await page.evaluate((today) => [...document.querySelectorAll('[data-part="streak-day"][data-state="plain"]')].map((n) => n.dataset.key).filter((k) => k !== today).at(-1) ?? null, planted.today);
    assert(planted.plain, "no plain day shown");
    await page.locator(`[data-part="streak-day"][data-key="${planted.plain}"]`).scrollIntoViewIfNeeded();
    await page.locator(`[data-part="streak-day"][data-key="${planted.plain}"]`).tap();
    await page.waitForFunction((k) => document.querySelector('[data-part="streak-day"][aria-current]')?.dataset.key === k, planted.plain, { timeout: 5000 });
    await wordsIn(page);
    const said = await page.locator(".lx-streak-daypart").innerText();
    assert(/Nothing that day\./.test(said), `a plain day: ${said}`);
    await page.locator(`[data-part="streak-day"][data-key="${planted.plain}"]`).evaluate((n) => n.closest("button").focus());
    await page.keyboard.press("ArrowRight");
    const next = await page.evaluate(async (k) => (await import("/js/know/streak.js")).addDays(k, 1), planted.plain);
    await page.waitForFunction((k) => document.querySelector('[data-part="streak-day"][aria-current]')?.dataset.key === k, next, { timeout: 5000 });
    assert(!shared.errors.length, `page errors: ${shared.errors}`);
    return "said; the arrow moved it";
  });

  await stage("Paper at 390", async () => {
    const { page } = await learner({ theme: "paper" });
    await page.evaluate(() => (location.hash = "#settings/streak"));
    await pageReady(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, "paper-top-390.png") });
    return "pictured";
  });
} finally {
  await browser.close().catch(() => {});
}

writeFileSync(join(OUT, "streak-page-check.json"), JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(`streak page check: ${failed ? `${failed} of ${results.length} stages FAILED` : `all ${results.length} stages passed`}`);
process.exit(failed ? 1 : 0);
