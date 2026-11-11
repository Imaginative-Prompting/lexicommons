// Each theme's picture for Settings → Appearance (the built-in ones, and the ready-made ones of lx/theme-presets.js): the app's own Home in that theme, as a
// learner some days in, cropped to its top (the header, Translate, the Practice card), the way a theme is chosen; a motif theme's, Home at its
// end, cut to its scene's foot (the scene is what makes it that theme). A new account on a
// local copy, its studying planted, every theme picked in turn through the app's own theme.js; the date's line hidden, so no day is
// fixed in a picture, and the header's language (this learner's flag, not the theme's: a flag theme's tile draws its own flag there). Writes public/themes/tiles/<id>.webp (240 × 258: Home's top 390 × 420, for a tile about 120 px wide) and tiles.json (each file's bytes' hash).
// LOCAL only, Chrome for Testing (quiet-browser.mjs), through gpu.py's parallel lane:
//   node scripts/build-theme-tiles.mjs http://localhost:<port> [--only <id,id>]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const { chromium } = await import("./quiet-browser.mjs");

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const [BASE] = process.argv.slice(2);
if (!BASE || !/^http:\/\/localhost/.test(BASE)) {
  console.error("Usage: build-theme-tiles.mjs http://localhost:<port> [--only <id,id>] (LOCAL only: it signs up an account)");
  process.exit(2);
}
const ONLY = process.argv.includes("--only") ? new Set(process.argv[process.argv.indexOf("--only") + 1].split(",")) : null;
const OUT = join(APP, "public/themes/tiles");
mkdirSync(OUT, { recursive: true });
const { READY_THEMES, readyTokens } = await import(join(APP, "public/js/lx/theme-presets.js"));
const { BUILT_IN_THEMES } = await import(join(APP, "public/js/lx/look-rules.js"));
// The built-in themes as well, so the picker is one kind of tile; Match device is Graphite and Paper, split down the middle (made after them).
const THEMES = [...BUILT_IN_THEMES.filter((t) => t.id !== "auto"), ...READY_THEMES];
const INDEX = join(OUT, "tiles.json");
const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : {};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark" });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Theme Tiles");
await page.click('#register button[type="submit"]');
await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]");
// Some days in: a few answers and finished lessons, so Home leads with Practice.
await page.evaluate(async () => {
  const { record } = await import("/js/study/progress.js");
  const { finishedLesson, finishedSession } = await import("/js/study/done.js");
  const { pathLessons } = await import("/js/study/path.js");
  const DAY = 86_400_000;
  const now = Date.now();
  for (let d = 6; d >= 1; d--) {
    record([{ concept: "w:huis", outcome: "right", test: "recall", skill: "read", activity: "type", item: "tile", at: now - d * DAY }]);
    finishedSession(now - d * DAY);
  }
  for (const lesson of pathLessons().slice(0, 3)) finishedLesson(lesson.id, now - 3 * DAY);
});
// The answers are saved after record() returns (progress.js commits to IndexedDB): a reload before all six are kept leaves the oldest days
// alone, four days away, and Home greets a comeback ("Welcome back" in place of Practice, 7 Nov on a busy Mac). Wait until they're stored.
const stored = await page.evaluate(async () => {
  const count = () => new Promise((resolve) => {
    const open = indexedDB.open("lexicommons-study");
    open.onsuccess = () => {
      const all = open.result.transaction("evidence").objectStore("evidence").getAll();
      all.onsuccess = () => {
        resolve(all.result.filter((row) => row.item === "tile").length);
        open.result.close();
      };
      all.onerror = () => resolve(0);
    };
    open.onerror = () => resolve(0);
  });
  let n = 0;
  for (let i = 0; i < 100 && (n = await count()) < 6; i++) await new Promise((r) => setTimeout(r, 100));
  return n;
});
if (stored < 6) throw new Error(`the planted answers weren't stored (${stored} of 6 after 10 s)`);
await page.reload();
await page.waitForSelector("html[data-app-ready]");
// Home settles on Practice as its lead card (its cards come in as the evidence loads) before the first picture: Practice among the top's words,
// never "Welcome back" (7 Nov: a wait for the word anywhere on the page let every general tile show Welcome back's card).
const PRACTICE = (words) => words.split("|").includes("Practice") && !/Welcome back|Pick up where/.test(words);
// And the app's first page has faded in (main.js: only the first page fades): a first tile taken sooner is dim (7 Nov: Graphite's was).
await page.waitForTimeout(1500);

// Every tile from the same Home: the words of Home's top as the first picture had them, and each later one waits until they're the same
// (Home's lead card can come in a moment late, and a "Welcome back" in place of Practice would make one tile a different screen).
const topWords = () => page.evaluate(() => {
  const page = document.querySelector('[data-part="page"]');
  const top = page ? [...page.querySelectorAll("h1, h2, h3, strong, [data-part='button']")].filter((n) => n.getBoundingClientRect().top < 420).map((n) => n.textContent.trim()).join("|") : "";
  return top.replace(/\s+/g, " ");
});
let firstWords = null;
const made = [];
for (const t of THEMES) {
  if (ONLY && !ONLY.has(t.id) && !(ONLY.has("auto") && ["graphite", "paper"].includes(t.id))) continue;
  await page.evaluate(async (id) => {
    const theme = await import("/js/lx/theme.js");
    await theme.useTheme(id);
    location.hash = "#today";
  }, t.id);
  await page.waitForTimeout(900);
  // The date's line (it would fix a day in the picture), the header's initials (someone's) and its language (this learner's: on Japan's
  // flag tile it would be the Netherlands', where the tile draws Japan's) left out of the picture.
  await page.evaluate(() => {
    document.querySelector('[data-part="page"]')?.scrollTo(0, 0);
    for (const n of document.querySelectorAll(".lx-today-date, [data-part='settings-button'], [data-part='header-language']")) n.style.visibility = "hidden";
  });
  await page.waitForTimeout(300);
  let words = await topWords();
  for (let w = 0; firstWords !== null && words !== firstWords && w < 30; w++) {
    await page.waitForTimeout(250);
    words = await topWords();
  }
  if (firstWords === null) {
    for (let w = 0; !PRACTICE(words) && w < 60; w++) {
      await page.waitForTimeout(250);
      words = await topWords();
    }
    if (!PRACTICE(words)) throw new Error(`${t.id}: Home's lead card isn't Practice ("${words}")`);
    firstWords = words;
    console.log(`Home's top in every tile: "${words}"`);
  }
  if (words !== firstWords) throw new Error(`${t.id}: Home's top isn't the same screen as the first tile's ("${words}" against "${firstWords}")`);
  // A motif theme (its scene: theme-presets.js sceneTokens) is Home at its end instead, cut to the scene's foot: what makes it that theme is
  // the scene, which a page's top never shows. The tab bar and the switch's toast left out of it.
  const scene = READY_THEMES.some((one) => one.id === t.id) && readyTokens(t.id)?.["--scene"];
  let clip = { x: 0, y: 0, width: 390, height: 420 };
  if (scene) {
    clip = await page.evaluate(async () => {
      for (const n of document.querySelectorAll('[data-part="tab-bar"], [data-part="toast"]')) n.style.visibility = "hidden";
      const scroller = document.querySelector('[data-part="app"] > [data-part="page"]');
      scroller.scrollTo(0, scroller.scrollHeight);
      await new Promise((r) => setTimeout(r, 400));
      // The scene's picture decoded and shown (theme.js holdPicture), so the tile is never the canvas it holds until then.
      for (let w = 0; w < 5000 && document.documentElement.hasAttribute("data-scene-waiting"); w += 100) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 500));
      const view = [...scroller.querySelectorAll(":scope > .lx-view")].find((v) => getComputedStyle(v).display !== "none");
      const bottom = Math.round(view.getBoundingClientRect().bottom);
      return { x: 0, y: Math.max(0, bottom - 420), width: 390, height: 420 };
    });
  }
  const shot = await page.screenshot({ clip });
  const webp = await sharp(shot).resize(240, 258, { fit: "cover", position: "top" }).webp({ quality: 82 }).toBuffer();
  const file = join(OUT, `${t.id}.webp`);
  writeFileSync(file, webp);
  index[t.id] = createHash("sha256").update(webp).digest("hex").slice(0, 16);
  made.push(t.id);
}
// Match device: Graphite's left half beside Paper's right half.
if (!ONLY || ONLY.has("auto")) {
  const half = (id, left) => sharp(join(OUT, `${id}.webp`)).extract({ left: left ? 0 : 120, top: 0, width: 120, height: 258 }).toBuffer();
  const auto = await sharp({ create: { width: 240, height: 258, channels: 3, background: "#000000" } })
    .composite([{ input: await half("graphite", true), left: 0, top: 0 }, { input: await half("paper", false), left: 120, top: 0 }])
    .webp({ quality: 82 })
    .toBuffer();
  writeFileSync(join(OUT, "auto.webp"), auto);
  index.auto = createHash("sha256").update(auto).digest("hex").slice(0, 16);
  made.push("auto");
}
writeFileSync(INDEX, `${JSON.stringify(Object.fromEntries(Object.entries(index).sort()), null, 1)}\n`);
await browser.close();
console.log(`${made.length} tiles in public/themes/tiles/`);
