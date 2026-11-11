// Home's two numbers against Knowledge's, on a phone at 390 and 320, on day one and a week in (know/today.js, know/cards.js, know/cards-more.js):
//   day one, played for real (lesson 1, a Practice and three games, each to its summary by the shared player): Home's words tile says the words
//   started (never "0 words you know well" before the first is known), the same number and words as Knowledge's Your words card; Home's things
//   done this week is This week's number, and This week says what they came from ("From 1 lesson, 1 practice, and 3 games") and what one is; the
//   done-log holds the three games as games (study/done.js finishedGame, session.js);
//   a week in (answers to some of those words on days apart, so they're known well): both turn to the words you know well, the same number.
// Stills of Home's tiles and the two Knowledge cards at each width and day. LOCAL only, path-nl seeded (npm run local) (exit 0 = pass).
//   node scripts/home-numbers-check.mjs http://localhost:<port> <outDir> [--widths 390,320]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { goRouted } from "./fixtures/routed.mjs";
import { SESSION, playToSummary } from "./fixtures/play-session.mjs";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
const opt = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const WIDTHS = opt("--widths", "390,320").split(",").map(Number);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/home-numbers-check.mjs http://localhost:<port> <outDir> [--widths 390,320] (a local server only)");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });
let failed = 0;
const results = [];
const report = (ok, what, detail = "") => {
  if (!ok) failed++;
  results.push({ ok, what, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
const desk = await browser.newContext();
const signup = await desk.newPage();
const cdp = await desk.newCDPSession(signup);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await signup.goto(`${BASE}/app/`);
await signup.waitForURL(/\/login\?next=/);
await signup.click("summary");
await signup.fill('input[name="name"]', "Home Numbers");
await signup.click('#register button[type="submit"]');
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
const cookies = await desk.cookies();

// One phone, its device's own study (each width is its own device, so each plays its own day one).
async function phone(width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await context.addCookies(cookies);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/app/`);
  await page.waitForSelector("html[data-app-ready]");
  return { context, page, errors };
}

// What Home's two tiles say, and Knowledge's two cards (the words card's number once its pile has stopped counting).
const HOME_TILES = () =>
  [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="stat-tile"]')].map((tile) => ({
    href: tile.getAttribute("href"),
    text: tile.textContent.replace(/\s+/g, " ").trim(),
    n: tile.querySelector(".lx-stat-n, [class*='-n']")?.textContent.trim() ?? null,
  }));
const homeTiles = async (page) => {
  await goRouted(page, BASE, "#today");
  await page.waitForSelector('[data-part="page"]:not([data-ghost]) [data-part="stat-tile"]', { timeout: 30_000 });
  await page.waitForTimeout(800);
  return page.evaluate(HOME_TILES);
};
const knowCards = async (page) => {
  await goRouted(page, BASE, "#know");
  await page.waitForSelector('[data-part="page"]:not([data-ghost]) #know-words', { timeout: 30_000 });
  // The pile counts its number up as its tiles land: wait until it has held still for 1.5 s (15 s at most).
  let last = null;
  let still = 0;
  for (let i = 0; i < 60 && still < 6; i++) {
    const now = await page.evaluate(() => {
      const card = document.querySelector('[data-part="page"]:not([data-ghost]) [data-card="words"]');
      return `${card?.querySelector(".lx-know-n")?.textContent.trim()}|${card?.querySelector(".lx-know-label")?.textContent.trim()}`;
    });
    still = now === last ? still + 1 : 0;
    last = now;
    await page.waitForTimeout(250);
  }
  return page.evaluate(() => {
    const words = document.querySelector('[data-part="page"]:not([data-ghost]) [data-card="words"]');
    const week = document.querySelector('[data-part="page"]:not([data-ghost]) [data-card="week"]');
    return {
      words: { n: words?.querySelector(".lx-know-n")?.textContent.trim() ?? null, label: words?.querySelector(".lx-know-label")?.textContent.trim() ?? null, aria: words?.querySelector("#know-words")?.getAttribute("aria-label") ?? null },
      week: {
        n: week?.querySelector(".lx-know-n")?.textContent.trim() ?? null,
        counted: week?.querySelector("[data-counted]")?.textContent.trim() ?? null,
        counts: week?.querySelector("[data-counts]")?.textContent.trim() ?? null,
      },
    };
  });
};
const shotOf = async (page, sel, file) => {
  const el = page.locator(sel).first();
  if (!(await el.count())) return;
  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  await el.screenshot({ path: join(OUT, "shots", file) });
};
// A session to its summary by the shared player; the summary's own counting (done.js) has run once it's on the screen.
const play = async (page, hash) => {
  await goRouted(page, BASE, hash);
  await page.waitForSelector(SESSION, { timeout: 20_000 });
  const steps = await playToSummary(page);
  await page.waitForSelector(`${SESSION} [data-part="session-summary"]`, { timeout: 15_000 });
  await page.waitForTimeout(600);
  return steps.length;
};

for (const width of WIDTHS) {
  const { context, page, errors } = await phone(width);
  // Day one: lesson 1, a practice, and three games that need no voice or microphone (Choose the games' tapping section).
  const played = [];
  played.push(`lesson ${await play(page, "#study/session/lesson")}`);
  played.push(`practice ${await play(page, "#study/session/practice")}`);
  const games = [];
  for (const game of ["match", "meaning", "choose", "see", "word", "fill"]) {
    if (games.length === 3) break;
    try {
      played.push(`${game} ${await play(page, `#study/session/game/${game}`)}`);
      games.push(game);
    } catch (error) {
      played.push(`${game}: not played (${String(error.message).slice(0, 60)})`);
    }
  }
  const log = await page.evaluate(async () => {
    const { finishedBetween } = await import("/js/study/done.js");
    const kinds = {};
    for (const thing of finishedBetween(0, Date.now() + 1)) kinds[thing.kind] = (kinds[thing.kind] ?? 0) + 1;
    return kinds;
  });
  report(log.lesson === 1 && log.practice === 1 && log.game === 3 && !log.session, `${width}: day one played (${played.join(", ")}): the done-log has a lesson, a practice and three games as games`, JSON.stringify(log));

  const tiles = await homeTiles(page);
  const wordsTile = tiles.find((tile) => tile.href === "#know");
  const doneTile = tiles.find((tile) => tile.href === "#know/days");
  await shotOf(page, '[data-part="page"]:not([data-ghost]) [data-part="stat-tiles"]', `${width}-day1-home-tiles.png`);
  const know = await knowCards(page);
  await shotOf(page, '[data-part="page"]:not([data-ghost]) [data-card="words"]', `${width}-day1-know-words.png`);
  await shotOf(page, '[data-part="page"]:not([data-ghost]) [data-card="week"]', `${width}-day1-know-week.png`);
  const started = Number(String(know.words.n).replace(/\D/g, ""));
  report(
    Boolean(wordsTile) && started > 0 && /words? started/.test(wordsTile.text) && wordsTile.text.startsWith(know.words.n) && /words? started/.test(know.words.label ?? "") && !/know well/.test(wordsTile.text),
    `${width}: day one: Home's words tile says the words started, the same as Knowledge's Your words card (never 0 words you know well)`,
    `Home “${wordsTile?.text}”, Knowledge “${know.words.n} ${know.words.label}” (${know.words.aria})`,
  );
  report(
    // (Joined the language's way, formatList: "From 1 lesson, 1 practice, and 3 games" in English.)
    Boolean(doneTile) && doneTile.text.startsWith(know.week.n) && /^From /.test(know.week.counted ?? "") && ["1 lesson", "1 practice", "3 games"].every((part) => know.week.counted.includes(part)) && Boolean(know.week.counts),
    `${width}: day one: Home's things done this week is This week's number, and This week says what it came from and what one is`,
    `Home “${doneTile?.text}”, This week ${know.week.n}: “${know.week.counted}” / “${know.week.counts}”`,
  );

  // A week in: answers to five of the words started, a week ago and yesterday (right each time, days apart), so they're known well.
  const made = await page.evaluate(async () => {
    const { startedWords } = await import("/js/know/word-index.js");
    const { record } = await import("/js/study/progress.js");
    const DAY = 86_400_000;
    const now = Date.now();
    const units = startedWords().map((row) => row.unit).slice(0, 5);
    for (const days of [7, 4, 1]) record(units.map((concept) => ({ concept, outcome: "right", test: "recall", skill: "read", activity: "type", item: "tile", at: now - days * DAY })));
    return { units, known: startedWords().filter((row) => row.known).length };
  });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const tiles2 = await homeTiles(page);
  const wordsTile2 = tiles2.find((tile) => tile.href === "#know");
  await shotOf(page, '[data-part="page"]:not([data-ghost]) [data-part="stat-tiles"]', `${width}-week-home-tiles.png`);
  const know2 = await knowCards(page);
  await shotOf(page, '[data-part="page"]:not([data-ghost]) [data-card="words"]', `${width}-week-know-words.png`);
  report(
    made.known > 0 && Boolean(wordsTile2) && /words? you know well/.test(wordsTile2.text) && wordsTile2.text.startsWith(String(made.known)) && know2.words.n === String(made.known) && /know well/.test(know2.words.label ?? ""),
    `${width}: a week in: both turn to the words you know well, the same number`,
    `${made.known} known (${made.units.join(", ")}); Home “${wordsTile2?.text}”, Knowledge “${know2.words.n} ${know2.words.label}”`,
  );
  report(errors.length === 0, `${width}: no page errors`, errors.slice(0, 3).join(" | "));
  await context.close();
}
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
await signup.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
await browser.close();
process.exit(failed ? 1 : 0);
