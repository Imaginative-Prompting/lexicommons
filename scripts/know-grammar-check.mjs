// The Knowledge tab's ideas (know/cards-more.js ideasCard), in Chrome on a phone: none before you've met one; then the patterns you've met as
// cards under "Ideas you've met", after your words, each with its picture and how well ("Getting there · 3 of 4 right"), the ones to work on
// first, each opening a sheet; one opens the sheet an answer does with its name, your own sentence with it and how well; past four, the first
// four and See all N ideas, which opens the Ideas page (#know/ideas, know/ideas-page.js) with every one; 390 and 320 in dark and light; a
// recording (walk.mp4). (Until 11 Nov 2026 it still looked for the tiles and the Show all of before v96, and failed on the app as it was.)
// LOCAL only, path-nl seeded.
// Usage: node scripts/know-grammar-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { knowWords, untilSaved } from "./fixtures/know-words.mjs";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const ONLY = opt("only") && new RegExp(opt("only"));
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/know-grammar-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
async function stage(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").slice(0, 10).join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const eq = (got, want, what) => assert(JSON.stringify(got) === JSON.stringify(want), `${what}\n got  ${JSON.stringify(got)?.slice(0, 500)}\n want ${JSON.stringify(want)?.slice(0, 500)}`);
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
};
const run = randomBytes(3).toString("hex");
function account(name) {
  const id = `kg${run}${randomBytes(5).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const now = Date.now();
  sql([
    `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'know-grammar-check')`,
  ].join("; "));
  return { id, name, cookie };
}

const PAGE = '[data-part="page"]';
const SESSION = '[data-part="session"]:not([data-ghost])';
const TILE = `${PAGE} [data-part="way-tile"]`;
const browser = await chromium.launch();
/** A phone of a new account that knows its words. theme: graphite (dark) or paper (light). noVoice: no voice for Dutch and its recordings unreachable. noRecognizer: none. */
async function phone({ width = 390, height = 844, theme = "graphite", noVoice = false, noRecognizer = false, video } = {}) {
  const who = account(`Knowledge ${run} ${theme} ${width}`);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, ...(video ? { recordVideo: { dir: video, size: { width, height } } } : {}) });
  await context.addCookies([{ name: "lc_session", value: who.cookie, url: BASE, httpOnly: true, secure: false, sameSite: "Lax" }]);
  await context.addInitScript(
    ({ theme, noVoice, noRecognizer }) => {
      try {
        if (!localStorage.getItem("lx.appearance.v1")) localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme, presets: {} }));
      } catch {}
      if (noVoice) window.speechSynthesis.getVoices = () => [];
      if (noRecognizer) {
        Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true, writable: true });
        Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true, writable: true });
      }
    },
    { theme, noVoice, noRecognizer },
  );
  if (noVoice) await context.route("**/audio/**/manifest.json", (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.waitForFunction(() => document.documentElement.dataset.theme);
  await knowWords(page);
  await page.evaluate(() => (location.hash = "#study"));
  await page.waitForSelector(TILE, { timeout: 20_000 });
  await page.waitForFunction((T) => [...document.querySelectorAll(T)].every((t) => t.querySelector(".lx-way-art > svg")), TILE, { timeout: 15_000 });
  return { context, page, errors };
}


const settle = (page, ms = 600) => page.waitForTimeout(ms);
const NO_AI = /\b(AI|A\.I\.|Claude|ChatGPT|assistant|Codex)\b/;
const shot = async (page, name) => {
  await settle(page, 700);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
};
const sheet = (page) => page.locator('[data-part="sheet"]:not([hidden])').first();
const SECTION = `${PAGE} [data-card="ideas"]`;
const ROWS = `${SECTION} [data-part="idea-card"]`;
const IDEAS_PAGE = `${PAGE} .lx-ideas-page [data-part="idea-card"]`;

/** The lessons' pack in, its words known, and `count` concepts met: answers on one of each one's sentences, `wrong` of them missed. */
async function meet(page, { count = 3, wrong = 1 } = {}) {
  for (let i = 0; i < 120 && !(await page.evaluate(async () => (await import("/js/study/content.js")).LESSONS.length > 100)); i++) await settle(page, 500);
  await knowWords(page);
  const { last, met } = await page.evaluate(
    async ([count, wrong]) => {
      const { record } = await import("/js/study/progress.js");
      const { ITEMS, PATTERNS, sentence } = await import("/js/study/content.js");
      const ids = Object.keys(PATTERNS).filter((id) => ITEMS.some((item) => item.concepts?.includes(id))).slice(0, count);
      const now = Date.now();
      const met = ids.map((id, i) => {
        const item = ITEMS.find((one) => one.concepts?.includes(id));
        return { id, item: item.id, sentence: sentence(item), right: i >= wrong };
      });
      const rows = record(met.map((one, i) => ({ concept: `p:${one.id}`, item: one.item, at: now - (count - i) * 60_000, outcome: one.right ? "right" : "wrong", activity: "choose", test: "pick", skill: "read" })));
      return { met, last: rows.at(-1)?.uid ?? null };
    },
    [count, wrong],
  );
  await untilSaved(page, last);
  return met;
}
const goKnow = async (page) => {
  await page.evaluate(() => (location.hash = "#know"));
  // The page drawn: a card, or what the top holds (the way to start, what's slipping); an empty top has no height.
  await page.waitForSelector(`${PAGE} [data-part="know-card"], ${PAGE} .lx-know-top > *`, { timeout: 20_000 });
};

await stage("Knowledge: the ideas you've met as a card after your words, each with how well, the ones to work on first; none at all before you've met one", async () => {
  {
    const { context, page } = await phone();
    try {
      await goKnow(page);
      await settle(page, 800);
      eq(await page.locator(SECTION).count(), 0, "a concepts section with none met");
    } finally {
      await context.close();
    }
  }
  const { context, page, errors } = await phone();
  try {
    const met = await meet(page, { count: 3, wrong: 1 });
    await goKnow(page);
    await page.locator(SECTION).waitFor({ timeout: 15_000 });
    const order = await page.locator(`${PAGE} .lx-know-board > [data-card]`).evaluateAll((nodes) => nodes.map((n) => n.dataset.card));
    assert(order.indexOf("ideas") > order.indexOf("words") && order.indexOf("words") >= 0, `where it sits: ${order}`);
    const rows = await page.locator(ROWS).evaluateAll((nodes) => nodes.map((n) => ({ text: n.innerText.replace(/\s+/g, " ").trim(), meter: Boolean(n.querySelector('[data-part="strength-meter"], .lx-strength, [data-part="strength"]')), sheet: n.getAttribute("aria-haspopup") })));
    eq(rows.length, 3, `the concepts met: ${JSON.stringify(rows)}`);
    assert(rows.every((r) => r.sheet === "dialog"), `a row that opens a sheet without saying so: ${JSON.stringify(rows)}`);
    assert(/0 of 1 right/.test(rows[0].text), `the one missed isn't first: ${JSON.stringify(rows)}`);
    assert(rows.slice(1).every((r) => /1 of 1 right/.test(r.text)), `how well: ${JSON.stringify(rows)}`);
    eq(await page.locator(`${SECTION} .lx-know-h`).first().innerText(), "Ideas you've met", "the card's title");
    eq(await page.locator(`${ROWS} .lx-rule-line`).count(), 3, "an idea without its picture");
    assert(!NO_AI.test(await page.locator(PAGE).first().innerText()), "the Knowledge page mentions an AI");
    assert(!errors.length, `page errors: ${errors.slice(0, 3)}`);
    return { met: met.map((m) => m.id), rows: rows.map((r) => r.text) };
  } finally {
    await context.close();
  }
});

await stage("a concept opens the sheet an answer does: its name, your own sentence with it, how well you know it; Escape closes it back to Knowledge", async () => {
  const { context, page } = await phone();
  try {
    const met = await meet(page, { count: 3, wrong: 1 });
    await goKnow(page);
    await page.locator(ROWS).first().click();
    const s = sheet(page);
    await s.waitFor({ timeout: 5000 });
    await settle(page, 600);
    const text = (await s.innerText()).replace(/\s+/g, " ");
    const missed = met.find((m) => !m.right);
    const name = await page.evaluate(async (id) => (await import("/js/study/content.js")).describe(`p:${id}`).name, missed.id);
    assert(text.includes(name.split(":")[0]), `its name (${name}): ${text.slice(0, 300)}`);
    assert(text.includes(missed.sentence.replace(/\s+/g, " ").slice(0, 20)), `your sentence (${missed.sentence}): ${text.slice(0, 400)}`);
    assert(/0 of 1 right/.test(text), `how well: ${text.slice(0, 400)}`);
    await shot(page, "concept-sheet");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector('[data-part="sheet"]:not([hidden])'), null, { timeout: 5000 });
    eq(await page.evaluate(() => location.hash), "#know", "where it leaves you");
    return text.slice(0, 160);
  } finally {
    await context.close();
  }
});

await stage("more than four: the first four, the ones to work on first, then See all 11 ideas, which opens the Ideas page with every one; back is Knowledge", async () => {
  const { context, page } = await phone();
  try {
    await meet(page, { count: 11, wrong: 3 });
    await goKnow(page);
    await page.locator(SECTION).waitFor({ timeout: 15_000 });
    eq(await page.locator(ROWS).count(), 4, "the first four");
    assert((await page.locator(ROWS).allInnerTexts()).slice(0, 3).every((text) => /0 of 1 right/.test(text)), "the missed ones aren't first");
    const all = page.locator(`${SECTION} [data-part="button"]`, { hasText: /^See all 11 ideas$/ });
    eq(await all.count(), 1, "See all 11 ideas");
    await all.click();
    await page.waitForFunction(() => location.hash === "#know/ideas", null, { timeout: 5000 });
    await page.waitForFunction((R) => [...document.querySelectorAll(R)].filter((n) => !n.closest("[data-ghost]")).length === 11, IDEAS_PAGE, { timeout: 8000 });
    const texts = await page.locator(IDEAS_PAGE).allInnerTexts();
    assert(texts.slice(0, 3).every((text) => /0 of 1 right/.test(text)), `the Ideas page: the missed ones aren't first: ${JSON.stringify(texts.slice(0, 4))}`);
    eq(await page.locator(`${IDEAS_PAGE} .lx-rule-line`).count(), 11, "the Ideas page: an idea without its picture");
    await shot(page, "ideas-page");
    await page.goBack();
    await page.waitForFunction(() => location.hash === "#know", null, { timeout: 5000 });
    return `the first four on the tab, all 11 on the Ideas page`;
  } finally {
    await context.close();
  }
});

await stage("how it looks at 390 and 320, dark and light: whole cards, nothing off the page; and a recording of opening a concept (walk.mp4)", async () => {
  const seen = [];
  for (const [theme, width, height] of [["graphite", 390, 844], ["paper", 390, 844], ["graphite", 320, 568], ["paper", 320, 568]]) {
    const { context, page } = await phone({ theme, width, height });
    try {
      await meet(page, { count: 5, wrong: 2 });
      await goKnow(page);
      await page.locator(SECTION).waitFor({ timeout: 15_000 });
      // Every tile whole on the page, at least 44 px tall, none off it.
      const m = await page.evaluate((R) => ({
        sideways: document.documentElement.scrollWidth - innerWidth,
        short: [...document.querySelectorAll(R)].filter((n) => n.getBoundingClientRect().height < 44).length,
        off: [...document.querySelectorAll(R)].filter((n) => n.getBoundingClientRect().right > innerWidth + 0.5).length,
      }), ROWS);
      eq([m.sideways, m.short, m.off], [0, 0, 0], `${theme} ${width}: sideways, short cards, cards off the page`);
      // Its picture is of the ideas (they're under the pile and This week).
      await page.locator(SECTION).evaluate((node) => node.scrollIntoView({ block: "start" }));
      await shot(page, `knowledge-${theme}-${width}`);
      seen.push(`${theme} ${width}`);
    } finally {
      await context.close();
    }
  }
  const video = join(OUT, "walk-raw");
  rmSync(video, { recursive: true, force: true });
  const { context, page } = await phone({ video });
  try {
    await meet(page, { count: 5, wrong: 2 });
    await page.evaluate(() => (location.hash = "#today"));
    await settle(page, 900);
    await goKnow(page);
    await settle(page, 1200);
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await settle(page, 1000);
    await page.locator(ROWS).first().click();
    await settle(page, 2500);
    await page.keyboard.press("Escape");
    await settle(page, 1200);
  } finally {
    await context.close();
  }
  const [file] = readdirSync(video);
  renameSync(join(video, file), join(OUT, "walk.webm"));
  rmSync(video, { recursive: true, force: true });
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", join(OUT, "walk.webm"), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", join(OUT, "walk.mp4")]);
  rmSync(join(OUT, "walk.webm"), { force: true });
  return seen.join(", ");
});

await browser.close().catch(() => {});
writeFileSync(join(OUT, "know-grammar-check.json"), JSON.stringify(results, null, 1));
const failed = results.filter((one) => !one.ok).length;
console.log(`know grammar check: ${failed ? `${failed} of ${results.length} stages FAILED` : `all ${results.length} stages passed`}`);
process.exit(failed ? 1 : 0);
