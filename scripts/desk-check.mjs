// Tablets and computers: the app at the sizes a phone never has, each part as it lands (docs/design-system.md, "Tablets and computers").
//   - settings: Settings opened from the sidebar (1024 × 768 and 1440 × 900 by mouse, 1180 × 820 an iPad on its side by touch) has no way
//     back, as the sidebar holds every tab and Settings itself; a page inside it keeps its way back to Settings; at 820 × 1180 (no sidebar)
//     the menu keeps its way back to the tab you came from.
//   - translate: Translate at those three sizes keeps the sidebar and the page's own column; its box as tall as its text (two lines at
//     least, about half the screen at most, then scrolling inside); the language bar on the screen, under the answer and clear of it; a tab
//     in the sidebar leaving it.
//   - games: 744, 820 and 1180 by touch, 1024, 1440 and 1920 by mouse, six games: the step and its bar one block in the screen's middle,
//     the game right under its question, Continue right under the game, the step still as the result comes, numbers on the choices with a
//     mouse (never by touch).
//   - hover: Home, Study, Explore and Knowledge at 1280 and 1440 by mouse, a learner weeks in: every link and button on the page, scrolled to,
//     looks different with the mouse on it (itself or anything in it; Tinta left out).
//   - keys: Tab from each tab's start at 1024 and 1440 reaches the sidebar first, then the header, then the page in the order it's seen; at
//     820 (the tabs at the foot) the page first and the tab bar last.
//   - targets: 744, 820 and 1180 by touch (an iPad's agent): every control on the sign-in page, a learner weeks in (Home, Study, Knowledge), every
//     game's question and result, Study cards and a book in the reader reaches 44 × 44 (component-check's measure; running text exempt).
//   - tablet: 744 and 820 portrait by touch, a learner weeks in: Translate with a line typed has a box as tall as its text and its answer
//     above the floating bar; Your words puts a word whose name and meaning fit a cell (18 letters, 44 characters) in one place, three to a
//     shelf; the reader's single page sets its text at most 640 px wide, centered, its picture wider.
//   - measure: 1024, 1280 and 1440 by mouse, a learner weeks in: Study's packs, a pack's page, an Explore item, Everyday's words, Translate's
//     sources, Terms and Privacy, and (at 1280 and 1440, in the wide column) Study, Explore, Knowledge, Your words and the topics have no line
//     of reading text over 72 characters (counted as read: each text node's line boxes over its own font's average character), a page's line
//     under its title starting where its column does.
//   - wide: 1280 and 1440 by mouse, a learner weeks in: the grid pages (Study's, Explore's and Knowledge's own, Your words, the topics) in a
//     960 column, Study's games 4 a row, Explore's topics 6, Your words 4 a shelf; their lists and forms (Study's packs, the path, a topic, a
//     pack's page, Browse, Add your own) and Home in the 720 one; on a grid page no button wider than it is with the column at 720,
//     and every row and list straight in the column reaching its right edge.
//   - split: 1280 and 1440 by mouse: Settings' menu in a 320 px pane beside the page it opened (Settings itself opening Account), that page's
//     row lit, no way back on a first page and its own further in, the pane kept from page to page with its title level with the page's, the
//     page 720 at 1440; leaving for a tab takes the pane away; at 1024 the menu alone.
//   - phones: 390 × 844 and 320 × 568 by touch, Home, Settings, Translate with a sentence typed, two games asked and answered, Your words,
//     Study's packs, Everyday's words and a book in the reader, each the
//     same picture pixel for pixel with this copy's files and with --base's (the app as it was): animations off, the caret and Tinta hidden,
//     the clock and Math.random fixed, on both sides; a pixel counts as changed past raster rounding (8 of 255 in a channel; two runs of the
//     same files differ by 2 at most). A screen that differs is pictured again on both sides up to three times, a second apart (Home,
//     Settings and Translate opened again for the last), and only then judged: KEEP THIS RULE AS IT IS. Never loosen the thresholds, skip
//     a screen or raise the tries to make a run pass; a difference that stays is the code's, so find it.
// --from <copy> serves another copy's /js and /css for everything but the phones' --base side (the app from before fails settings and
// translate). LOCAL only: it signs up accounts with a virtual passkey.
// Usage: node scripts/desk-check.mjs http://localhost:<port> <outDir> --base <copy dir> [--only <regex>] [--from <copy dir>] [--screens <regex>]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { knowWords } from "./fixtures/know-words.mjs";
import { answerStep, SESSION } from "./fixtures/play-session.mjs";

const argv = process.argv.slice(2);
const [BASE_URL, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const ONLY = opt("only") ? new RegExp(opt("only")) : null;
const FROM = opt("from") ? resolve(opt("from")) : null;
const BEFORE = opt("base") ? resolve(opt("base")) : null;
// The phones stage's screens to compare, for proving one (--screens reader): the others are left out, and the stage says so.
const SCREENS = opt("screens") ? new RegExp(opt("screens")) : null;
// This copy: the phones' side to compare, served the same way as --base's (from the files, not the server), so only the files differ.
const HERE = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL ?? "") || !OUT || !BEFORE || !existsSync(join(BEFORE, "public"))) {
  console.error("Usage: node scripts/desk-check.mjs http://localhost:<port> <outDir> --base <copy dir> [--only <regex>] [--from <copy dir>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
setTimeout(() => {
  console.error("desk-check: ceiling of 40 minutes");
  process.exit(3);
}, 40 * 60_000).unref();

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const results = [];
const assert = (cond, what) => {
  if (!cond) throw new Error(what);
};

async function stage(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail, ms: Date.now() - started });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.stack ?? error), ms: Date.now() - started });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").slice(0, 12).join("\n        ")}`);
  }
}

const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
// Animations off and no caret, the same on both sides of a comparison: a picture that differs is the code's doing.
// Tinta out of the picture too (his eyes follow the last touch, so two runs never draw him alike), his room kept.
// And a session's progress bar: its steps share the bar's width beside the count ("1/6"), which a face arriving a moment earlier or later
// makes a fraction of a pixel wider, so two runs of the same files end its fill apart. (Animations stay on: the motion system cleans up
// after each move as it ends.)
const STILL = '*, *::before, *::after { caret-color: transparent !important; } :is([data-part="character"], [data-part="session-progress"]) { visibility: hidden !important; }';
// Two runs of the same files differ by raster rounding alone, at most 2 of 255 in a channel (8 Nov: 135 pixels at the flag's corners, the
// tab bar's glass); a pixel counts as changed past this, which any change of layout, type or color is by far.
const PIXEL_NOISE = 8;
// And a few pixels of an edge drawn apart (a circle's rim on a layer the compositor kept on one side and not the other: 5 pixels, 53 at
// most): a screen counts as changed past 16 such pixels, or any pixel moved past 64, which a change of the code's is many times over.
const NOISE_PIXELS = 16;
const NOISE_MOST = 64;
const FIXED = new Date();

/** A context's /js and /css from another copy's files (--from, or a comparison's side). */
async function serveFiles(context, files) {
  await context.route(/\/(js|css)\/.*\.(js|css)(\?.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = join(files, "public", path);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ status: 200, contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body: readFileSync(file) });
  });
}

/** A device with a new account (a virtual passkey). touch: a finger (an iPad's agent from 700 wide); files: another copy whose /js and /css it's served. */
async function device({ width, height, touch = false, files = FROM, still = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    serviceWorkers: "block",
    hasTouch: touch,
    isMobile: touch && width < 700,
    ...(touch && width >= 700 ? { userAgent: IPAD } : {}),
    colorScheme: "dark",
    reducedMotion: still ? "reduce" : "no-preference",
    // The no-caret rule goes in as a style tag, which the app's CSP refuses: both sides of a comparison take it the same way.
    bypassCSP: still,
  });
  if (files) await serveFiles(context, files);
  const page = await context.newPage();
  if (still) {
    // The same moment and the same "random" on both sides of a comparison: a session's plan and the order of its choices come out the same.
    await page.clock.setFixedTime(FIXED);
    await page.addInitScript(() => {
      let seed = 1;
      Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    });
  }
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE_URL}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Desk Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/app/`, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  // A first run, if it's up: the language you speak, then what you learn.
  for (let i = 0; i < 4; i++) {
    const choice = page.locator(".lx-welcome button, .lx-welcome [role='option']").filter({ hasText: /English|Dutch|Nederlands/ }).first();
    if (!(await choice.count())) break;
    await choice.click();
    await page.waitForTimeout(600);
  }
  if (still) await page.addStyleTag({ content: STILL });
  return { context, page, errors };
}

const go = async (page, hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(900);
};
const box = (page, selector) =>
  page.evaluate((s) => {
    const node = document.querySelector(s);
    if (!node || !node.checkVisibility({ visibilityProperty: true })) return null;
    const r = node.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) };
  }, selector);
const PILL = '[data-part="app"] > [data-part="app-header"] > [data-part="app-back"]';
const SIDEBAR = '[data-part="app"] > [data-part="tab-bar"]';
const pillText = (page) => page.evaluate((s) => document.querySelector(s)?.textContent.trim() ?? null, PILL);

const WIDE = [
  { width: 1024, height: 768, touch: false, name: "1024" },
  { width: 1180, height: 820, touch: true, name: "1180-ipad" },
  { width: 1440, height: 900, touch: false, name: "1440" },
];

await stage("settings: from the sidebar no way back (the sidebar has every tab), a page inside it back to Settings (at 1280 and up, with the menu beside it, a page further in back to its own), and at 820 the menu's way back to the tab", async () => {
  const seen = [];
  for (const size of WIDE) {
    const { context, page, errors } = await device(size);
    try {
      await go(page, "#study");
      const tab = page.locator(`${SIDEBAR} [data-part="tab"][data-variant="settings"]`);
      assert(await tab.isVisible(), `${size.name}: the sidebar's Settings isn't on the screen`);
      await (size.touch ? tab.tap() : tab.click());
      // (1280 and up: Settings opens its first page beside its menu, shell/main.js SPLIT.)
      const split = size.width >= 1280;
      await page.waitForFunction((split) => location.hash === (split ? "#settings/account" : "#settings"), split, { timeout: 10_000 });
      await page.waitForTimeout(700);
      const pill = await box(page, PILL);
      await page.screenshot({ path: join(OUT, `settings-${size.name}.png`) });
      assert(!pill, `${size.name}: Settings from the sidebar has a way back ("${await pillText(page)}" at ${JSON.stringify(pill)})`);
      // Tab from the top never stops on it.
      await page.evaluate(() => document.activeElement?.blur());
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("Tab");
        const on = await page.evaluate(() => document.activeElement?.dataset.part ?? document.activeElement?.tagName);
        assert(on !== "app-back", `${size.name}: Tab stops on a hidden way back`);
      }
      // A page inside Settings keeps its way back to Settings; beside the menu (1280 and up) the menu is its way back, and a page further in
      // keeps its own.
      await go(page, "#settings/study");
      const inner = await box(page, PILL);
      if (split) {
        assert(!inner, `${size.name}: Settings → Study beside the menu has a way back ("${await pillText(page)}")`);
        await go(page, "#settings/appearance/edit");
        assert((await box(page, PILL)) && /Appearance/.test(await pillText(page)), `${size.name}: Make it yours has no way back to Appearance (${await pillText(page)})`);
      } else assert(inner && /Settings/.test(await pillText(page)), `${size.name}: Settings → Study has no way back to Settings (${await pillText(page)})`);
      assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
      seen.push(size.name);
    } finally {
      await context.close();
    }
  }
  // No sidebar: the menu still goes back to the tab you came from.
  const { context, page } = await device({ width: 820, height: 1180, touch: true });
  try {
    await go(page, "#study");
    await page.locator('[data-part="settings-button"]').first().tap();
    await page.waitForFunction(() => location.hash === "#settings", null, { timeout: 10_000 });
    await page.waitForTimeout(700);
    const pill = await box(page, PILL);
    assert(pill && /Study/.test(await pillText(page)), `820: Settings from Study has no way back to Study (${await pillText(page)})`);
    await page.screenshot({ path: join(OUT, "settings-820.png") });
  } finally {
    await context.close();
  }
  return `${seen.join(", ")}: none; Settings → Study: back to Settings (1440: none beside the menu, Make it yours back to Appearance); 820: back to Study`;
});

const TYPED = "I would like a coffee";
const LONG = "I would like a coffee with milk and a little sugar please, and then a glass of water, because it is very warm today and we have walked a long way through the old town to the station and back again before the train left for the coast";
const answered = (page) =>
  page
    .waitForFunction(
      () => {
        const want = document.querySelector('[data-part="translate-field"] :is(textarea, input)')?.value.trim() ?? "";
        const got = document.querySelector('.lx-tr-results[aria-live="polite"]')?.dataset.query;
        return want !== "" && (got === want || (got && want.startsWith(got) && got.length >= 100)) && !document.querySelector('.lx-today-translate [data-part="looking-up"]');
      },
      null,
      { timeout: 60_000, polling: 100 },
    )
    .then(
      () => true,
      () => false,
    );
const openTranslate = async (page, touch, text) => {
  await go(page, "#today");
  const field = page.locator('[data-part="translate-field"] textarea').first();
  await (touch ? field.tap() : field.click());
  await page.waitForTimeout(500);
  await page.keyboard.type(text, { delay: 15 });
  assert(await answered(page), `no answer for "${text.slice(0, 30)}…" within 60 s`);
  await page.waitForTimeout(600);
};
const translateNow = (page) =>
  page.evaluate(() => {
    const r = (node) => {
      if (!node || !node.checkVisibility()) return null;
      const b = node.getBoundingClientRect();
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) };
    };
    const section = document.querySelector(".lx-today-translate[data-open]");
    const textarea = section?.querySelector('[data-part="translate-field"] textarea');
    const style = textarea && getComputedStyle(textarea);
    return {
      translate: document.documentElement.hasAttribute("data-translate"),
      sidebar: r(document.querySelector('[data-part="app"] > [data-part="tab-bar"]')),
      section: r(section),
      field: r(section?.querySelector('[data-part="translate-field"]')),
      textarea: textarea && { ...r(textarea), scroll: textarea.scrollHeight, client: textarea.clientHeight, line: parseFloat(style.lineHeight) },
      bar: r(section?.querySelector(".lx-way-bar")),
      scroll: r(section?.querySelector(".lx-tr-scroll")),
      best: r(section?.querySelector('[data-part="translate-result"][data-state="best"]')),
      view: { w: innerWidth, h: innerHeight },
    };
  });

await stage("translate: the sidebar and the page's column kept, the box as tall as its text, the language bar under the answer and clear of it, a tab leaving it", async () => {
  const seen = [];
  for (const size of WIDE) {
    const { context, page, errors } = await device(size);
    try {
      await go(page, "#today");
      const column = await box(page, '[data-part="app"] > [data-part="page"] .lx-view');
      await openTranslate(page, size.touch, TYPED);
      const now = await translateNow(page);
      await page.screenshot({ path: join(OUT, `translate-${size.name}.png`) });
      const at = `${size.name}: ${JSON.stringify(now)}`;
      assert(now.translate, `${size.name}: Translate didn't open`);
      assert(now.sidebar && now.sidebar.x <= 0 && now.sidebar.w >= 200, `${size.name}: the sidebar is gone in Translate\n${at}`);
      assert(column && Math.abs(now.section.x - column.x) <= 2 && Math.abs(now.section.r - column.r) <= 2, `${size.name}: Translate's column (${now.section.x}–${now.section.r}) isn't Home's (${column?.x}–${column?.r})`);
      // One line typed: the box's text area two lines at most (with its own spacing), however tall the screen.
      const twoLines = 2 * now.textarea.line + 8 + 2;
      assert(now.textarea.h <= Math.max(twoLines, now.textarea.scroll + 2), `${size.name}: one line typed, the box's text area is ${now.textarea.h} px for ${now.textarea.scroll} px of text (two lines: ${Math.round(twoLines)})\n${at}`);
      assert(now.field.h < now.view.h * 0.35, `${size.name}: the box is ${now.field.h} px of a ${now.view.h} px screen for one line\n${at}`);
      assert(now.bar && now.bar.b <= now.view.h && now.bar.y >= 0, `${size.name}: the language bar isn't on the screen\n${at}`);
      assert(now.scroll && now.bar.y >= now.scroll.b - 1, `${size.name}: the language bar (${now.bar.y}–${now.bar.b}) is over the answer's area (to ${now.scroll?.b})\n${at}`);
      assert(now.best && now.best.b <= now.scroll.b, `${size.name}: the answer isn't in view above the bar\n${at}`);
      // A long text: the box grows with it, to about half the screen, then scrolls inside.
      await page.keyboard.type(` ${LONG} ${LONG}`, { delay: 0 });
      assert(await answered(page), `${size.name}: no answer for the long text`);
      await page.waitForTimeout(500);
      const long = await translateNow(page);
      await page.screenshot({ path: join(OUT, `translate-${size.name}-long.png`) });
      assert(long.textarea.h > now.textarea.h + now.textarea.line, `${size.name}: the box didn't grow with a long text (${now.textarea.h} → ${long.textarea.h})`);
      assert(long.textarea.h <= Math.ceil(long.view.h * 0.4) + 1, `${size.name}: the box's text area is ${long.textarea.h} px, over 40% of a ${long.view.h} px screen`);
      assert(long.textarea.scroll > long.textarea.client || long.textarea.h < long.view.h * 0.4 - 2, `${size.name}: at its tallest the box doesn't scroll its text`);
      assert(long.bar.y >= long.scroll.b - 1 && long.bar.b <= long.view.h, `${size.name}: with a long text the bar is over the answer or off the screen\n${JSON.stringify(long)}`);
      // The sidebar leaves Translate for another tab.
      const study = page.locator(`${SIDEBAR} [data-part="tab"]`).nth(1);
      await (size.touch ? study.tap() : study.click());
      await page.waitForFunction(() => location.hash.startsWith("#study") && !document.documentElement.hasAttribute("data-translate"), null, { timeout: 10_000 });
      assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
      seen.push(`${size.name} box ${now.field.h}→${long.field.h}`);
    } finally {
      await context.close();
    }
  }
  return seen.join("; ");
});

/** The session on the screen, if any, ended (Escape, as a keyboard ends one) and gone, so the next one opens on its own. */
async function endSession(page) {
  if (!(await page.locator(SESSION).count())) return;
  await page.keyboard.press("Escape");
  await page.waitForFunction((S) => !document.querySelector(S), SESSION, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

// ---------- games: one block in the screen's middle ----------
const STAGE = [
  { width: 744, height: 1133, touch: true, name: "744-ipad-mini" },
  { width: 820, height: 1180, touch: true, name: "820-ipad" },
  { width: 1180, height: 820, touch: true, name: "1180-ipad" },
  { width: 1024, height: 768, touch: false, name: "1024" },
  { width: 1440, height: 900, touch: false, name: "1440" },
  { width: 1920, height: 1080, touch: false, name: "1920" },
];
// Games of every shape: a word and its choices (see), a sentence and its choices (choose), a gap (fill), pairs (match), tiles (arrange), a card.
const STAGE_GAMES = ["see", "choose", "fill", "match", "arrange", "card"];
const KEYED = new Set(["see", "choose", "fill"]);
// A choice's number as its ::after's content: the counter (or its value).
const shownNumber = (content) => /counter\(|^"\d+"$/.test(content);
/** Where a session's step and its bar are: the step's parts (Tinta aside), its game's, the bar, the forward button, each number's look. */
const stageNow = (page) =>
  page.evaluate((S) => {
    const root = document.querySelector(S);
    const shown = (node) => node.getClientRects().length && node.checkVisibility() && !node.closest('[data-part="character"], [data-ghost]');
    const boxOf = (nodes) => {
      const rects = [...nodes].filter(shown).map((node) => node.getBoundingClientRect()).filter((r) => r.width && r.height);
      return rects.length ? { top: Math.round(Math.min(...rects.map((r) => r.top))), bottom: Math.round(Math.max(...rects.map((r) => r.bottom))) } : null;
    };
    const step = root.querySelector(".lx-step");
    const reach = step?.querySelector(":scope > .lx-reach");
    const bar = root.querySelector('[data-part="answer-bar"]').getBoundingClientRect();
    const forward = root.querySelector('[data-part="answer-bar"] [data-variant="white"]');
    return {
      view: innerHeight,
      head: Math.round(root.querySelector('[data-part="session-bar"]').getBoundingClientRect().bottom),
      foot: Math.round(root.getBoundingClientRect().bottom),
      step: boxOf(step?.querySelectorAll("*") ?? []),
      // Everything the step shows before its game (the question, a word's card, a sentence), as one box.
      lead: reach ? boxOf([...step.children].filter((child) => child !== reach && child.compareDocumentPosition(reach) & Node.DOCUMENT_POSITION_FOLLOWING).flatMap((child) => [child, ...child.querySelectorAll("*")])) : null,
      game: reach ? boxOf(reach.querySelectorAll("*")) : null,
      bar: { top: Math.round(bar.top), bottom: Math.round(bar.bottom) },
      forward: forward?.checkVisibility() ? Math.round(forward.getBoundingClientRect().bottom) : null,
      numbers: [...root.querySelectorAll("[data-keys] > button")].map((button) => getComputedStyle(button, "::after").content),
      // Each number's box (from its button and its own style) against the button's words: none may touch.
      covering: [...root.querySelectorAll("[data-keys] > button")].filter((button) => {
        const after = getComputedStyle(button, "::after");
        if (after.content === "none" || after.content === "normal") return false;
        const b = button.getBoundingClientRect();
        // (A size the browser doesn't resolve counts as the keycap's least: 20 px.)
        const px = (value, least) => (Number.isFinite(parseFloat(value)) ? parseFloat(value) : least);
        // (border-box, as base.css sets every ::after: its width has its padding and border in it already.)
        const extra = after.boxSizing === "border-box" ? 0 : px(after.paddingLeft, 0) + px(after.paddingRight, 0) + px(after.borderLeftWidth, 0) + px(after.borderRightWidth, 0);
        const width = px(after.width, 20) + extra;
        const height = px(after.height, 20);
        const left = after.left !== "auto" ? b.left + parseFloat(after.left) : b.right - parseFloat(after.right) - width;
        const top = b.top + parseFloat(after.top);
        // The words alone (each text node's lines), not the boxes of what holds them.
        const rects = [];
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          rects.push(...range.getClientRects());
        }
        // Over them by more than 2 px each way (a line's box has its leading over the letters, so corners may meet).
        const hit = rects.find((r) => r.width && Math.min(r.right, left + width) - Math.max(r.left, left) > 2 && Math.min(r.bottom, top + height) - Math.max(r.top, top) > 2);
        if (hit) (globalThis.__deskCovering ??= []).push({ text: button.textContent.trim(), key: { left, top, width, height, after: [after.width, after.right, after.top, after.boxSizing] }, words: { left: hit.left, right: hit.right, top: hit.top, bottom: hit.bottom }, button: [b.left, b.top, b.right, b.bottom] });
        return Boolean(hit);
      }).length,
      coveringWhy: (globalThis.__deskCovering ?? []).slice(0, 2),
    };
  }, SESSION);

await stage("games: the step and its bar one block in the screen's middle, the game right under its question, Continue right under the game and the step still as the result comes; numbers on the choices with a mouse", async () => {
  const seen = [];
  for (const size of STAGE) {
    const { context, page, errors } = await device(size);
    try {
      await knowWords(page);
      for (const game of STAGE_GAMES) {
        await endSession(page);
        // (Study cards are a session of their own: #study/session/cards.)
        await go(page, game === "card" ? "#study/session/cards" : `#study/session/game/${game}`);
        await page.waitForSelector(SESSION, { timeout: 20_000 });
        await page.waitForTimeout(700);
        const empty = page.locator(`${SESSION} [data-part="empty-state"]`);
        if (await empty.count()) throw new Error(`${size.name} ${game}: the session has nothing to ask (${(await empty.first().innerText()).trim()})`);
        const before = await stageNow(page);
        await page.screenshot({ path: join(OUT, `game-${size.name}-${game}.png`) });
        const at = `${size.name} ${game}: ${JSON.stringify(before)}`;
        // (A card is the step itself: no game under a question.)
        assert(before.step && (before.game || game === "card"), `${size.name} ${game}: no step or game on the screen\n${at}`);
        // The game right under its question (the step's own spacing), not centered in the room under it.
        if (before.lead && before.game) assert(before.game.top - before.lead.bottom <= 64, `${size.name} ${game}: ${before.game.top - before.lead.bottom} px between what's asked and the game\n${at}`);
        // The bar right under the step, and the block in the middle: as much room over it as under it.
        assert(before.bar.top - before.step.bottom <= 48, `${size.name} ${game}: ${before.bar.top - before.step.bottom} px between the step and its bar\n${at}`);
        const over = before.step.top - before.head;
        const under = before.foot - before.bar.bottom;
        if (over + under > 120) assert(Math.abs(over - under) <= 72, `${size.name} ${game}: ${over} px over the block and ${under} under it\n${at}`);
        if (!size.touch && KEYED.has(game)) {
          assert(before.numbers.length >= 2 && before.numbers.every(shownNumber), `${size.name} ${game}: the choices show no number (${before.numbers.join(", ")})`);
          assert(!before.covering, `${size.name} ${game}: ${before.covering} choice(s) have their number over their words: ${JSON.stringify(before.coveringWhy)}`);
        }
        if (size.touch && KEYED.has(game)) assert(!before.numbers.some(shownNumber), `${size.name} ${game}: numbers shown on a touch screen (${before.numbers.join(", ")})`);
        // Answered: the result in the bar right under the game, Continue on the screen, the step where it was.
        await answerStep(page, { next: false });
        await page.waitForTimeout(700);
        const after = await stageNow(page);
        await page.screenshot({ path: join(OUT, `game-${size.name}-${game}-result.png`) });
        const then = `${size.name} ${game} answered: ${JSON.stringify(after)}`;
        assert(after.forward && after.forward <= after.view, `${size.name} ${game}: Continue isn't on the screen\n${then}`);
        assert(after.bar.top - after.step.bottom <= 48, `${size.name} ${game}: ${after.bar.top - after.step.bottom} px between the answered step and its result\n${then}`);
        // The step stays where it is; only a result taller than the room under the block moves it, up, as one, by what it needs (the
        // result then reaching the screen's foot), never the game away from its question.
        const moved = after.step.top - before.step.top;
        if (game !== "match" && game !== "card" && Math.abs(moved) > 1) {
          assert(moved < 0 && after.bar.bottom >= after.foot - 24, `${size.name} ${game}: the step moved ${moved} px as the result came, with room to spare under it (to ${after.bar.bottom} of ${after.foot})\n${then}`);
        }
        if (before.lead && before.game && after.lead && after.game) {
          const grew = after.game.top - after.lead.bottom - (before.game.top - before.lead.bottom);
          assert(Math.abs(grew) <= 2, `${size.name} ${game}: the game moved ${grew} px away from its question as the result came\n${then}`);
        }
        if (KEYED.has(game)) assert(!after.numbers.some(shownNumber), `${size.name} ${game}: numbers still shown after the answer`);
      }
      assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
      seen.push(size.name);
    } finally {
      await context.close();
    }
  }
  return `${STAGE_GAMES.join(", ")} at ${seen.join(", ")}`;
});

/** A picture of the page once it's settled: its faces and pictures in, nothing said for 1.5 s, every move that ends ended, and two
 *  pictures 400 ms apart the same (a flag or a face arriving late drew a frame differently, 8 Nov). Up to 8 s, then the last one. */
async function steady(page) {
  // (Time in the page by performance.now: the phones' pages run on a fixed clock, where Date.now never moves.)
  const waited = await page.evaluate(async () => {
    const t0 = performance.now();
    await document.fonts.ready;
    // Nothing said for 1.5 s on end: a result says its sentence once the answer's sound has passed (so not at once), the word it's on
    // underlined, for as long as the (silenced) voice takes.
    let quietSince = performance.now();
    for (const until = performance.now() + 15_000; performance.now() < until && performance.now() - quietSince < 1500; ) {
      if (document.querySelector('[data-state="playing"]')) quietSince = performance.now();
      await new Promise((r) => setTimeout(r, 100));
    }
    const t1 = performance.now();
    // And every move that ends has ended (a right answer's pop and its mark drawn; loops that never end aside).
    let moving = [];
    for (const until = performance.now() + 5000; performance.now() < until; ) {
      moving = document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity);
      if (!moving.length) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const t2 = performance.now();
    const loaded = (img) =>
      new Promise((done) => {
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        setTimeout(done, 3000);
      });
    await Promise.all([...document.images].filter((img) => !img.complete).map(loaded));
    const playing = [...document.querySelectorAll('[data-state="playing"]')].map((n) => n.dataset.part ?? n.tagName);
    const label = (a) => `${a.animationName ?? a.transitionProperty ?? a.id ?? "?"} on ${a.effect?.target?.dataset?.part ?? a.effect?.target?.className ?? a.effect?.target?.tagName ?? "?"}`;
    return { quiet: t1 - t0, moves: t2 - t1, playing, moving: moving.slice(0, 3).map(label) };
  });
  if (process.env.DESK_DEBUG) console.log(`    steady: ${JSON.stringify(waited)}`);
  let last = await page.screenshot();
  for (const until = Date.now() + 8000; Date.now() < until; ) {
    await page.waitForTimeout(400);
    const now = await page.screenshot();
    if (now.equals(last)) return now;
    last = now;
  }
  return last;
}

const noise = []; // the edges drawn apart that were let pass, said in the stage's result
/** Two pictures the same, pixel for pixel; else how many differ, and a picture of where. skip: boxes in the pictures' own pixels ({ x, y, r, b })
 *  left out (a book's photo, compared by its place and size instead: photosOf). */
async function samePixels(a, b, name, skip = []) {
  const [one, two] = await Promise.all([sharp(a).raw().toBuffer({ resolveWithObject: true }), sharp(b).raw().toBuffer({ resolveWithObject: true })]);
  if (one.info.width !== two.info.width || one.info.height !== two.info.height) return `${name}: ${one.info.width}×${one.info.height} against ${two.info.width}×${two.info.height}`;
  const channels = one.info.channels;
  const marks = Buffer.alloc(one.info.width * one.info.height);
  const out = skip.length ? Buffer.alloc(one.info.width * one.info.height) : null;
  for (const box of skip) for (let y = Math.max(0, box.y); y < Math.min(one.info.height, box.b); y++) out.fill(1, y * one.info.width + Math.max(0, box.x), y * one.info.width + Math.min(one.info.width, box.r));
  let differ = 0;
  let most = 0;
  for (let i = 0, p = 0; i < one.data.length; i += channels, p++) {
    if (out?.[p]) continue;
    for (let c = 0; c < channels; c++) {
      const by = Math.abs(one.data[i + c] - two.data[i + c]);
      most = Math.max(most, by);
      if (by > PIXEL_NOISE) {
        differ++;
        marks[p] = 255;
        break;
      }
    }
  }
  if (!differ) return null;
  if (differ <= NOISE_PIXELS && most <= NOISE_MOST) {
    noise.push(`${name}: ${differ} px, ${most} at most`);
    return null;
  }
  await sharp(marks, { raw: { width: one.info.width, height: one.info.height, channels: 1 } }).png().toFile(join(OUT, `${name}-differ.png`));
  return `${name}: ${differ} pixels differ by more than ${PIXEL_NOISE} (at most ${most}; ${name}-differ.png)`;
}

// A learner weeks in (the sample learner, study/sample-mode.js), made from this server's Dutch course: Home, Study, Explore and Knowledge with
// everything they show.
async function weeksIn(page) {
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  const why = await page.evaluate(async () => {
    const { pathLessons } = await import("/js/study/path.js");
    for (let i = 0; i < 300 && pathLessons().length < 20; i++) await new Promise((r) => setTimeout(r, 100));
    try {
      await (await import("/js/study/sample-start.js")).startSample("weeks", { reload: false });
      return null;
    } catch (error) {
      return String(error.message ?? error);
    }
  });
  assert(!why, `the sample learner: ${why}`);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.waitForTimeout(1500);
}
const MAIN_TABS = ["#today", "#study", "#explore", "#know"];
// A computer's block button (components.css, frame.md rule 4, 11 Nov 2026): on the page itself and in its cards (not a session, a sheet, a
// dialog or the reader, whose boxes are blocks of their own) as wide as its words, 240 to 360 px (narrower only where its box is), at its box's
// start edge or centered in it. Each fault said with the button's words.
const BUTTON_RULE = () => {
  const view = document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])');
  const out = [];
  for (const b of view?.querySelectorAll('[data-part="button"][data-block]') ?? []) {
    if (!b.checkVisibility() || b.closest('[data-part="session"], [data-part="sheet"], [role="dialog"], [data-part="reader"]')) continue;
    const r = b.getBoundingClientRect();
    const box = b.parentElement;
    const s = getComputedStyle(box);
    const br = box.getBoundingClientRect();
    const start = br.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth);
    const end = br.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth);
    const name = `"${b.textContent.trim().replace(/\s+/g, " ").slice(0, 28)}"`;
    if (r.width > 361) out.push(`${name} ${Math.round(r.width)} wide, past 360`);
    if (r.width < Math.min(240, end - start) - 1) out.push(`${name} ${Math.round(r.width)} wide, under 240`);
    const alone = [...box.children].filter((c) => c.matches('[data-part="button"]') && c.checkVisibility()).length === 1;
    // Where its box lays out as a column (block, a flex column, a one-track grid); a box laid out as a row (a one-line card with the button
    // at its end: Explore's lessons card) is that page's own design.
    const column = /^(block|flow-root)$/.test(s.display) || (/flex/.test(s.display) && s.flexDirection.startsWith("column")) || (/grid/.test(s.display) && s.gridTemplateColumns.trim().split(/\s+/).length === 1);
    if (alone && column && Math.abs(r.left - start) > 1 && Math.abs((r.left + r.right) / 2 - (start + end) / 2) > 1) out.push(`${name} neither at its box's start edge nor centered in it`);
  }
  return out;
};
const TITLE_X = () => {
  const t = document.querySelector('[data-part="app-title"]');
  return t && t.checkVisibility() ? Math.round(t.getBoundingClientRect().left) : null;
};
// The pages in the wide column at 1280 and up (shell/main.js WIDE_PAGES): the grids. Their lists and forms, Home and Settings keep the 720.
const WIDE_GRIDS = [["#study", "Study"], ["#explore", "Explore"], ["#know", "Knowledge"], ["#know/words", "Your words"], ["#explore/topics", "the topics"]];

// With a mouse, everything you can press shows it before you press: on the four tabs, every link and button on the page, scrolled to, looks
// different with the mouse on it, itself or anything in it (a pack's cover, a topic's drawing, a drawn edge), Tinta left out (he breathes).
// Before 8 Nov, 29 of 64 didn't (the audit's "hardly anything answers the mouse").
await stage("hover: on Home, Study, Explore and Knowledge at 1280 and 1440 by mouse (the narrower in Study's, Explore's and Knowledge's wide column too), everything you can press changes its look with the mouse on it", async () => {
  const said = [];
  for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    const { context, page, errors } = await device(size);
    try {
      await weeksIn(page);
      const none = [];
      let tried = 0;
      for (const route of MAIN_TABS) {
        await go(page, route);
        await page.waitForTimeout(1200);
        const targets = await page.evaluate(() =>
          [...document.querySelectorAll('[data-part="page"] :is(a[href], button, [role="button"])')]
            .filter((node) => {
              const r = node.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && node.checkVisibility() && !node.closest("[inert]");
            })
            .map((node, i) => {
              node.dataset.hoverCheck = String(i);
              return { i, part: node.dataset.part ?? null, text: (node.getAttribute("aria-label") ?? node.textContent).trim().replace(/\s+/g, " ").slice(0, 30) };
            }),
        );
        for (const t of targets) {
          tried++;
          const el = page.locator(`[data-hover-check="${t.i}"]`);
          // Drawn again since it was marked (Knowledge draws its cards as they come into view): the same kind of thing with the same words.
          if (!(await el.count()))
            await page.evaluate(({ i, part, text }) => {
              const again = [...document.querySelectorAll(part ? `[data-part="${part}"]` : '[data-part="page"] :is(a[href], button)')].find(
                (node) => (node.getAttribute("aria-label") ?? node.textContent).trim().replace(/\s+/g, " ").slice(0, 30) === text,
              );
              if (again) again.dataset.hoverCheck = String(i);
            }, t);
          const look = (node) =>
            [node, ...[...node.querySelectorAll("*")].filter((part) => !part.closest('[data-part="character"]')).slice(0, 300)]
              .map((part) => {
                const s = getComputedStyle(part);
                return [s.backgroundColor, s.color, s.borderColor, s.boxShadow, s.transform, s.translate, s.filter, s.textDecorationLine, s.opacity, s.outlineStyle, s.fill, s.stroke].join("|");
              })
              .join("\n");
          try {
            await el.evaluate((node) => node.scrollIntoView({ block: "center" }), null, { timeout: 2000 });
            await page.waitForTimeout(150);
            await page.mouse.move(2, size.height - 2);
            await page.waitForTimeout(250);
            const before = await el.evaluate(look, null, { timeout: 2000 });
            await el.hover({ force: true, timeout: 2000 });
            await page.waitForTimeout(300);
            if (before === (await el.evaluate(look, null, { timeout: 2000 }))) none.push(`${route} ${t.part ?? "link"} "${t.text}"`);
          } catch {
            none.push(`${route} ${t.part ?? "link"} "${t.text}" (gone before the mouse reached it)`);
          }
        }
      }
      assert(tried >= 40, `${size.width}: only ${tried} things to press on the four tabs: the learner didn't come`);
      assert(!none.length, `${size.width}: ${none.length} of ${tried} don't change with the mouse on them:\n${none.join("\n")}`);
      assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
      said.push(`${size.width}: ${tried}`);
    } finally {
      await context.close();
    }
  }
  return `things on the four tabs, each changing with the mouse on it: ${said.join(", ")}`;
});

// Tab from a page's start: where the tabs are a sidebar (1024 and 1440) its tabs come first, Settings among them, then the header's, then the
// page's in the order they're seen (each at or below the one before, by the page's own scroll, a row read left to right); at 820 (the tabs at
// the foot, as on a phone) the page comes first and the tab bar last. Before 8 Nov the sidebar came last, after the whole page.
await stage("keys: Tab from a page's start reaches the sidebar first, then the page in the order it's seen; at 820 the tab bar last", async () => {
  const lines = [];
  for (const size of [
    { width: 1024, height: 768, sidebar: true },
    { width: 1440, height: 900, sidebar: true },
    { width: 820, height: 1180, sidebar: false },
  ]) {
    const { context, page, errors } = await device(size);
    try {
      await weeksIn(page);
      for (const route of MAIN_TABS) {
        // A fresh page each time: the browser remembers where focus last was and would start from there.
        await page.goto(`${BASE_URL}/app/${route}`);
        await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
        await page.waitForTimeout(1500);
        const stops = [];
        for (let n = 0; n < 60; n++) {
          await page.keyboard.press("Tab");
          const stop = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const r = el.getBoundingClientRect();
            const where = el.closest('[data-part="tab-bar"]') ? "tabs" : el.closest('[data-part="app-header"]') ? "header" : el.closest('[data-part="page"]') ? "page" : "other";
            const host = el.closest('[data-part="page"]');
            const y = host ? r.top - host.getBoundingClientRect().top + host.scrollTop : r.top + scrollY;
            return { where, x: Math.round(r.left), y: Math.round(y), text: (el.getAttribute("aria-label") ?? el.textContent).trim().replace(/\s+/g, " ").slice(0, 24) };
          });
          if (!stop) break;
          if (stops.length && stop.where === stops[0].where && stop.text === stops[0].text && stop.x === stops[0].x && stop.y === stops[0].y) break;
          stops.push(stop);
        }
        const order = stops.map((s) => s.where).filter((where, i, all) => where !== all[i - 1]).join(" → ");
        const want = size.sidebar ? /^tabs → (header → )?page$/ : /^(header → )?page → tabs$/;
        assert(want.test(order), `${size.width} ${route}: Tab goes ${order} (want ${size.sidebar ? "tabs → header → page" : "header → page → tabs"})`);
        const tabs = stops.filter((s) => s.where === "tabs");
        assert(tabs.length >= 4, `${size.width} ${route}: only ${tabs.length} of the tabs reached by Tab`);
        const page_ = stops.filter((s) => s.where === "page");
        const back = page_.find((s, i) => i && s.y < page_[i - 1].y - 8);
        assert(!back, `${size.width} ${route}: Tab goes back up the page, from "${page_[page_.indexOf(back) - 1]?.text}" (y ${page_[page_.indexOf(back) - 1]?.y}) to "${back?.text}" (y ${back?.y})`);
        lines.push(`${size.width} ${route} ${order} (${page_.length} on the page)`);
      }
      assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
    } finally {
      await context.close();
    }
  }
  return lines.join("; ");
});

// Every control answers a touch over 44 × 44 px on a tablet too, where component-check's walk of the pages doesn't go: the sign-in page, a learner
// weeks in (Home, Study with its settings gear, Knowledge with its word tiles), every game's question and its result, Study cards, and a book in
// the reader. component-check's measure: each control brought to the middle and hit-tested out from its center, so an invisible ::before reach
// counts and anything over it (the page's header) doesn't; words and links in running text are exempt (WCAG 2.5.8's inline exception), and so is
// a gap you type into, which is its sentence's line (Type in the gap, Hear the gap). A link's line is its text beside it, a word of its own or an
// inline label like the reader's credits' "From: " before StoryWeaver, never another control (sign-in's Privacy beside Terms). On 8 Nov sign-in's
// "Terms" reached 42 and Study's gear 41 (the header over its top 3 px).
const TARGET_GAMES = ["choose", "arrange", "place", "fill", "meaning", "match", "type", "type-word", "type-gap", "hear-gap", "see", "word", "translate", "listen", "say", "repeat", "say-word", "repeat-word"];
const SMALL_TARGETS = (MIN) => {
  const CONTROL = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="menuitem"]';
  const INLINE = ["target-word", "woven-word", "reader-word", "credit", "gap-field"];
  const shown = (n) => {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    return r.width >= 1 && r.height >= 1 && cs.visibility === "visible" && Number(cs.opacity) > 0 && !n.closest("[inert], [hidden], [aria-hidden='true'], [data-motion-layer], .lx-visually-hidden");
  };
  const owns = (n, hit) => Boolean(hit) && (hit === n || n.contains(hit) || Boolean(hit.closest("label")?.contains(n)));
  const words = (c) =>
    c.nodeType === 3 ? c.textContent.trim() : c.nodeType === 1 && getComputedStyle(c).display === "inline" && !c.matches(CONTROL) && !c.querySelector(CONTROL) && c.textContent.trim();
  const inline = (n) =>
    INLINE.includes(n.getAttribute("data-part")) || (getComputedStyle(n).display === "inline" && [...(n.parentElement?.childNodes ?? [])].some((c) => c !== n && words(c)));
  const reach = (n) => {
    n.scrollIntoView({ block: "center", inline: "center" });
    const r = n.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight || !owns(n, document.elementFromPoint(cx, cy))) return null;
    const out = (dx, dy) => {
      let d = 0;
      for (let k = 1; k <= MIN; k += 1) {
        const x = cx + dx * k, y = cy + dy * k;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !owns(n, document.elementFromPoint(x, y))) break;
        d = k;
      }
      return d;
    };
    // (As component-check: a box laid out at a fraction of a pixel loses a sliver to what's beside it when hit-tested by whole pixels.)
    const across = (from, to, at) => {
      for (let k = Math.ceil(from); k + 1 <= to; k++) if (!owns(n, document.elementFromPoint(...at(k + 0.5)))) return 0;
      return to - from;
    };
    const boxed = (measured, from, to, at) => (measured >= MIN ? measured : Math.max(measured, Math.round(across(from, to, at) * 100) / 100));
    return [boxed(out(-1, 0) + out(1, 0) + 1, r.left, r.right, (x) => [x, cy]), boxed(out(0, -1) + out(0, 1) + 1, r.top, r.bottom, (y) => [cx, y])];
  };
  const small = [];
  for (const n of [...document.querySelectorAll(CONTROL)].filter(shown)) {
    if (inline(n)) continue;
    const hit = reach(n);
    if (hit && (hit[0] < MIN || hit[1] < MIN))
      small.push(`${n.getAttribute("data-part") ?? n.closest("[data-part]")?.getAttribute("data-part") ?? n.tagName.toLowerCase()} "${(n.getAttribute("aria-label") || n.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30)}" ${hit.join("×")}`);
  }
  return small;
};
await stage("targets: on a tablet by touch, every control on the sign-in page, a learner's Home, Study and Knowledge, every game and the reader reaches 44 × 44", async () => {
  const lines = [];
  const faults = [];
  for (const size of [
    { width: 744, height: 1133 },
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
  ]) {
    const measured = [];
    const look = async (page, name) => {
      await page.waitForTimeout(700);
      const small = await page.evaluate(SMALL_TARGETS, 44);
      measured.push(name);
      for (const one of small) faults.push(`${size.width} ${name}: ${one}`);
    };
    // Signed out: the sign-in page, as it opens and with an account being made.
    const out = await browser.newContext({ viewport: size, deviceScaleFactor: 2, hasTouch: true, userAgent: IPAD, serviceWorkers: "block", colorScheme: "dark" });
    if (FROM) await serveFiles(out, FROM);
    try {
      const page = await out.newPage();
      await page.goto(`${BASE_URL}/app/`);
      await page.waitForURL(/\/login\?next=/);
      await look(page, "sign-in");
      await page.click("summary");
      await look(page, "sign-in, an account being made");
    } finally {
      await out.close();
    }
    const { context, page, errors } = await device({ ...size, touch: true });
    try {
      await weeksIn(page);
      for (const route of ["#today", "#study", "#know"]) {
        await go(page, route);
        await page.waitForTimeout(800);
        await look(page, route);
      }
      for (const route of [...TARGET_GAMES.map((game) => `#study/session/game/${game}`), "#study/session/cards"]) {
        const name = route.replace("#study/session/", "");
        await go(page, route);
        await page.waitForSelector(SESSION, { timeout: 20_000 });
        await page.waitForTimeout(900);
        await look(page, `${name}'s question`);
        await answerStep(page, { next: false });
        await look(page, `${name}'s result`);
        await endSession(page);
      }
      // A book from Read's shelf, in the reader, and with its controls up (a tap in the page's middle shows them).
      await go(page, "#read");
      await page.waitForTimeout(1200);
      const tile = page.locator('[data-part="page"]:not([data-ghost]) .lx-read-shelf [data-part="book-tile"]').first();
      assert(await tile.count(), `${size.width}: Read has no book on its shelf to open`);
      await tile.scrollIntoViewIfNeeded();
      await tile.tap();
      await page.waitForSelector('[data-part="reader"]', { timeout: 30_000 });
      await page.waitForTimeout(2000);
      await look(page, "a book in the reader");
      await page.touchscreen.tap(size.width / 2, size.height / 2);
      await look(page, "the reader, its controls up");
      assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
    } finally {
      await context.close();
    }
    lines.push(`${size.width}×${size.height}: ${measured.length} screens`);
  }
  assert(!faults.length, `${faults.length} controls reach under 44 × 44:\n${faults.join("\n")}`);
  return lines.join("; ");
});

// ---------- a tablet (C): Translate's box, Your words, the reader's page ----------
// On an iPad portrait by touch, a learner weeks in: Translate with a line typed has a box as tall as its text (a phone's split left ~300 px of
// it empty at 820) and its answer above the floating bar; Your words puts a word whose name (to 18 letters) and meaning (to 44) fit a cell in
// one place, so a shelf holds three (the phone's rule, 9 and 22, made two a shelf there); the reader's single page sets its text at most
// 640 px wide, centered, its picture the page's whole width (the text ran edge to edge between 22 px gutters).
await stage("tablet: on an iPad portrait by touch, Translate's box as tall as its text, Your words three to a shelf, the reader's text at most 640 px with its picture wider", async () => {
  const lines = [];
  // Every fault of the three, at both sizes, said together (the app from before fails each).
  const faults = [];
  const want = (ok, what) => void (ok || faults.push(what));
  for (const size of [
    { width: 744, height: 1133, name: "744" },
    { width: 820, height: 1180, name: "820" },
  ]) {
    const { context, page, errors } = await device({ ...size, touch: true });
    try {
      await weeksIn(page);
      // Translate, a line typed.
      await openTranslate(page, true, TYPED);
      const now = await translateNow(page);
      await page.screenshot({ path: join(OUT, `tablet-translate-${size.name}.png`) });
      const at = `${size.name}: ${JSON.stringify(now)}`;
      const twoLines = 2 * now.textarea.line + 8 + 2;
      want(now.textarea.h <= Math.max(twoLines, now.textarea.scroll + 2), `${size.name}: one line typed, the box's text area is ${now.textarea.h} px for ${now.textarea.scroll} px of text (two lines: ${twoLines})`);
      want(now.field.h < now.view.h * 0.3, `${size.name}: the box is ${now.field.h} px of a ${now.view.h} px screen for one line`);
      want(now.best && now.best.b <= (now.bar ? now.bar.y : now.view.h), `${size.name}: the answer isn't in view above the bar\n${at}`);
      await page.locator('[data-part="app-back"]').first().tap();
      await page.waitForFunction(() => !document.documentElement.hasAttribute("data-translate"), null, { timeout: 10_000 });
      // Your words.
      await go(page, "#know/words");
      await page.waitForTimeout(1500);
      // Every shelf's words (a shelf this week may hold one or two: after midnight on a Sunday it did, 9 Nov 2026), each against its own grid.
      const words = await page.evaluate(() => {
        const grids = [...document.querySelectorAll(".lx-shelf-tiles")].filter((g) => g.getClientRects().length);
        if (!grids.length) return null;
        const cell = grids[0].getBoundingClientRect().width / 3;
        const tiles = grids.flatMap((grid, g) => [...grid.querySelectorAll('[data-part="word-tile"]')].map((t) => ({
          name: t.querySelector(".lx-tile-face")?.textContent.trim() ?? "",
          means: t.querySelector(".lx-tile-means")?.textContent.trim() ?? "",
          places: Math.round(t.getBoundingClientRect().width / (grid.getBoundingClientRect().width / 3)),
          top: `${g}:${Math.round(t.getBoundingClientRect().top)}`,
        })));
        return { cell: Math.round(cell), tiles };
      });
      await page.screenshot({ path: join(OUT, `tablet-words-${size.name}.png`) });
      assert(words && words.tiles.length >= 3, `${size.name}: Your words has no shelf of words (${JSON.stringify(words)})`);
      const doubled = words.tiles.filter((t) => t.places > 1 && t.name.length <= 18 && t.means.length <= 44);
      want(!doubled.length, `${size.name}: ${doubled.length} words that fit a ${words.cell} px cell take two places: ${doubled.slice(0, 6).map((t) => `${t.name} (${t.means})`).join("; ")}`);
      const rows = [...Object.values(Object.groupBy(words.tiles, (t) => t.top))].map((row) => row.reduce((n, t) => n + t.places, 0));
      // The reader: Read's first book, its second page.
      await go(page, "#read");
      await page.waitForTimeout(1200);
      const tile = page.locator('[data-part="page"]:not([data-ghost]) .lx-read-shelf [data-part="book-tile"]').first();
      assert(await tile.count(), `${size.name}: Read has no book on its shelf to open`);
      await tile.scrollIntoViewIfNeeded();
      await tile.tap();
      await page.waitForSelector('[data-part="reader"]', { timeout: 30_000 });
      await page.waitForTimeout(2000);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(1500);
      const reader = await page.evaluate(() => {
        const flow = document.querySelector('[data-part="reader"] .lx-reader-flow');
        const seen = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
        const p = [...(flow?.querySelectorAll(":scope > p") ?? [])].find(seen);
        const img = [...(flow?.querySelectorAll('[data-part="reader-picture"] img') ?? [])].find(seen);
        const b = p?.getBoundingClientRect();
        return { variant: document.querySelector('[data-part="reader"]')?.dataset.variant ?? null, vw: innerWidth, text: b ? { x: Math.round(b.left), w: Math.round(b.width) } : null, picture: img ? Math.round(img.getBoundingClientRect().width) : null };
      });
      await page.screenshot({ path: join(OUT, `tablet-reader-${size.name}.png`) });
      assert(reader.variant !== "spread", `${size.name}: the reader shows a spread in portrait`);
      assert(reader.text, `${size.name}: no paragraph on the reader's page (${JSON.stringify(reader)})`);
      want(reader.text.w <= 641, `${size.name}: the reader's text is ${reader.text.w} px wide (at most 640)`);
      want(Math.abs(reader.text.x - (reader.vw - reader.text.w) / 2) <= 2, `${size.name}: the reader's text isn't centered (${reader.text.x} px from the left, ${reader.text.w} wide on ${reader.vw})`);
      want(reader.picture === null || reader.picture > reader.text.w, `${size.name}: the page's picture (${reader.picture} px) isn't wider than its text (${reader.text.w})`);
      assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
      lines.push(`${size.name}: box ${now.field.h} px for ${now.textarea.scroll} px of text; words ${words.tiles.length} on rows of ${rows.join("/")} places (cell ${words.cell} px); reader text ${reader.text.w} px, picture ${reader.picture ?? "none on that page"}`);
    } finally {
      await context.close();
    }
  }
  assert(!faults.length, faults.join("\n"));
  return lines.join("; ");
});

// ---------- reading lines (E): at most ~68 characters ----------
// The reading measure (tokens.css --measure, min(31em, 640px): ~68 characters of Instrument Sans at 12–16 px) on the text itself, left where its
// column starts: at 1024 and 1440 by mouse, a learner weeks in, each page of running text the walk found long (8 Nov 2026: 99–118 characters
// a line) has no line of reading text over 72 characters, counted as read (each text node's line boxes, its own font's average character, not
// "ch", which is this font's 0 at 0.67em); a page's line under its title starts where its column does. (Everyday's hundreds, a run of single
// words, aren't lines to read.)
const READING_LINES = () => {
  const ctx = document.createElement("canvas").getContext("2d");
  const out = [];
  for (const node of document.querySelectorAll("p, li, dd, .lx-row-title, .lx-row-sub")) {
    if (!node.getClientRects().length || node.closest('[hidden], [inert], [data-ghost], [aria-hidden="true"], [data-part="common-page"]')) continue;
    const text = node.textContent.trim().replace(/\s+/g, " ");
    if (text.length < 60) continue;
    const range = document.createRange();
    const lines = new Map();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim()) continue;
      range.selectNodeContents(t);
      for (const r of range.getClientRects()) {
        if (r.width < 1) continue;
        const key = Math.round(r.top / 4);
        const line = lines.get(key) ?? { left: Infinity, right: -Infinity };
        line.left = Math.min(line.left, r.left);
        line.right = Math.max(line.right, r.right);
        lines.set(key, line);
      }
    }
    const style = getComputedStyle(node);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const avg = ctx.measureText(text).width / text.length;
    const widest = Math.max(0, ...[...lines.values()].map((l) => l.right - l.left));
    out.push({ chars: Math.round(widest / avg), text: text.slice(0, 40) });
  }
  // A page's line under its title, against its column: the page's, or on Knowledge's board (know.css, from 1280: the pile's card beside This
  // week, itself in two columns) the card's own, or This week's side where that's a column (a box of its own; on a phone it draws none).
  const column = document.querySelector('[data-part="app"] > [data-part="page"] .lx-view')?.getBoundingClientRect();
  const columnOf = (n) => [n.closest(".lx-week-side"), n.closest('[data-part="know-section"]')].find((at) => at?.getClientRects().length)?.getBoundingClientRect() ?? column;
  const intros = [...document.querySelectorAll(".lx-page-head > p, .lx-packs-line, .lx-know-caption")].filter((n) => n.getClientRects().length).map((n) => ({ text: n.textContent.trim().slice(0, 30), off: column ? Math.round(n.getBoundingClientRect().left - columnOf(n).left) : null }));
  return { longest: out.sort((a, b) => b.chars - a.chars)[0] ?? null, intros };
};
await stage("measure: at 1024, 1280 and 1440 by mouse, no line of reading text over 72 characters on the pages the walk found long (Study's packs, a pack's page, an Explore item, Everyday's words, Translate's sources, Terms, Privacy) nor, in the wide column, on Study, Explore, Knowledge, Your words and the topics; a page's line under its title where its column starts", async () => {
  const lines = [];
  const faults = [];
  for (const size of [
    { width: 1024, height: 768, name: "1024" },
    { width: 1280, height: 800, name: "1280" },
    { width: 1440, height: 900, name: "1440" },
  ]) {
    const { context, page, errors } = await device(size);
    try {
      await weeksIn(page);
      const seen = [];
      const look = async (name) => {
        await page.waitForTimeout(1000);
        const got = await page.evaluate(READING_LINES);
        if (got.longest && got.longest.chars > 72) faults.push(`${size.name} ${name}: a line of ${got.longest.chars} characters ("${got.longest.text}…")`);
        for (const intro of got.intros) if (intro.off !== null && Math.abs(intro.off) > 1) faults.push(`${size.name} ${name}: "${intro.text}…" starts ${intro.off} px from its column`);
        seen.push(`${name} ${got.longest?.chars ?? "-"}`);
      };
      const follow = async (selector) => {
        const link = page.locator(selector).first();
        assert(await link.count(), `${size.name}: nothing to follow (${selector})`);
        await link.scrollIntoViewIfNeeded();
        await link.click();
        await page.waitForTimeout(1500);
      };
      // The wide column's pages (1280 and up: shell.css), whose text has the most room.
      if (size.width >= 1280) for (const [route, name] of WIDE_GRIDS) {
        await go(page, route);
        await look(name);
      }
      await go(page, "#study/packs");
      await look("Study's packs");
      await follow('[data-part="page"]:not([data-ghost]) a[href^="#study/packs/"], [data-part="page"]:not([data-ghost]) a[href*="pack"]');
      await look("a pack's page");
      await go(page, "#explore");
      await follow('[data-part="page"]:not([data-ghost]) a[href^="#explore/"][href*="/"]:not([href="#explore/yours"])');
      await look("an Explore item");
      await go(page, "#know/everyday/words");
      await look("Everyday's words");
      await openTranslate(page, false, "lopen");
      await look("Translate's sources");
      await page.evaluate(() => (location.hash = "#today"));
      for (const path of ["/terms", "/privacy"]) {
        await page.goto(`${BASE_URL}${path}`);
        await look(path.slice(1));
      }
      assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
      lines.push(`${size.name}: ${seen.join(", ")}`);
    } finally {
      await context.close();
    }
  }
  assert(!faults.length, faults.join("\n"));
  return `the longest line of reading text, in characters: ${lines.join("; ")}`;
});

const NARROW = [["#study/packs", "Study's packs"], ["#study/path", "the path"], ["#explore/topic/everyday", "a topic"], ["#explore/item/path-nl", "a pack's page"], ["#explore/browse", "Browse"], ["#explore/own", "Add your own"], ["#today", "Home"]];
// A grid on the page: how many of its items are in its first row.
const IN_A_ROW = (selector) => {
  const grid = [...document.querySelectorAll(`[data-part="page"] ${selector}`)].find((node) => node.checkVisibility());
  const items = grid ? [...grid.children].filter((node) => node.getBoundingClientRect().height > 0) : [];
  const top = items[0]?.getBoundingClientRect().top;
  return items.filter((node) => Math.abs(node.getBoundingClientRect().top - top) < 2).length;
};

// The wide column (1280 and up: shell.css, the director's option 2, 9 Nov 2026): the grid pages at 960, so their grids use the room, and their
// lists and forms at 720 (a list's switches sat 900 px from their names at 960). No button grows past its width in the 720 column
// (components.css, its end: Explore's Continue was 924 wide at 960): each measured with the column at 960, then with the app's data-column
// taken off for a frame (the 720), then put back. Rows and lists span the column as its fields and cards do: one straight in it (no box between
// with an inset of its own) ends at its right edge (the director, 9 Nov: capped too, Explore's All packs and its language row stopped short
// of the search field and the topics above them). Before 9 Nov every page was 720 wide at every size.
await stage("wide: at 1280 and 1440 by mouse, the grid pages (Study's, Explore's, Knowledge's, Your words, the topics) in a 960 column with Study's games 4 a row, Explore's topics 6 and Your words 4 a shelf; their lists and forms and Home at 720; on a grid page no button wider than with the column at 720, every row and list straight in the column to its right edge", async () => {
  const faults = [];
  const said = [];
  for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    const { context, page, errors } = await device(size);
    try {
      await weeksIn(page);
      let rowsSeen = 0;
      const titles = [];
      const column = () => page.evaluate(() => Math.round(document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])')?.getBoundingClientRect().width ?? -1));
      for (const [route, name] of WIDE_GRIDS) {
        await go(page, route);
        await page.waitForTimeout(600);
        const width = await column();
        if (width !== 960) faults.push(`${size.width} ${name}: its column ${width} wide, not 960`);
        for (const one of await page.evaluate(BUTTON_RULE)) faults.push(`${size.width} ${name}: ${one}`);
        titles.push([name, await page.evaluate(TITLE_X)]);
        const spans = await page.evaluate(() => {
          const view = document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])');
          const right = view.getBoundingClientRect().right;
          // Inside a box with an inset of its own (a card's padding or border) that ends short of the column: that box's to fill, not this.
          const inset = (node) => {
            for (let at = node.parentElement; at && at !== view; at = at.parentElement) {
              const s = getComputedStyle(at);
              if (at.getBoundingClientRect().right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth) < right - 1) return true;
            }
            return false;
          };
          const rows = [...view.querySelectorAll('[data-part="list"], [data-part="list-row"]')].filter((node) => node.checkVisibility() && node.getBoundingClientRect().width > 0 && !inset(node));
          return {
            rows: rows.length,
            short: rows
              .filter((node) => node.getBoundingClientRect().right < right - 1)
              .map((node) => `${node.dataset.part} "${node.textContent.trim().replace(/\s+/g, " ").slice(0, 28)}" ends ${Math.round(right - node.getBoundingClientRect().right)} px short of the column`),
          };
        });
        rowsSeen += spans.rows;
        for (const one of spans.short) faults.push(`${size.width} ${name}: ${one}`);
      }
      const rows = {};
      await go(page, "#study");
      rows.games = await page.evaluate(IN_A_ROW, '[data-part="way-tiles"]');
      await go(page, "#explore");
      rows.topics = await page.evaluate(IN_A_ROW, ".lx-topics");
      await go(page, "#know/words");
      rows.words = await page.evaluate(IN_A_ROW, ".lx-shelf-tiles");
      if (rows.games !== 4) faults.push(`${size.width}: Study's games ${rows.games} a row, not 4`);
      if (rows.topics !== 6) faults.push(`${size.width}: Explore's topics ${rows.topics} a row, not 6`);
      if (rows.words !== 4) faults.push(`${size.width}: Your words ${rows.words} a shelf, not 4`);
      for (const [route, name] of NARROW) {
        await go(page, route);
        await page.waitForTimeout(600);
        const width = await column();
        if (width !== 720) faults.push(`${size.width} ${name}: its column ${width} wide, not 720`);
        for (const one of await page.evaluate(BUTTON_RULE)) faults.push(`${size.width} ${name}: ${one}`);
        // (The path is one block centered as a whole, its title with it: main.js CENTER_PAGES.)
        if (route !== "#study/path") titles.push([name, await page.evaluate(TITLE_X)]);
      }
      // One frame: every page's title starts at the same place, a grid page's and a list's alike (shell.css --lx-frame).
      const xs = new Set(titles.filter(([, x]) => x !== null).map(([, x]) => x));
      if (xs.size !== 1) faults.push(`${size.width}: the title moves between pages: ${titles.map(([n, x]) => `${n} ${x}`).join(", ")}`);
      assert(rowsSeen >= 2, `${size.width}: only ${rowsSeen} rows straight in a grid page's column: Explore's All packs and its language row missing`);
      assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
      said.push(`${size.width}: games ${rows.games}, topics ${rows.topics}, words ${rows.words} a row, ${rowsSeen} rows to the column's edge`);
    } finally {
      await context.close();
    }
  }
  assert(!faults.length, faults.join("\n"));
  return `the grid pages 960, the rest 720 at the frame's start, every title at one place, every block button 240–360 at its box's start or centered, the rows the column's width; ${said.join("; ")}`;
});

// Settings on a wide screen (1280 and up: shell/main.js SPLIT, shell.css data-split): its menu in a pane of its own beside the page it opened, as a
// computer's settings are. Settings itself opens its first page, Account; the pane's row for the page in view lit (aria-current); a first page has
// no back pill (the pane is its way back), a page further in its own; the pane the same node from page to page, its title level with the page's,
// never under it; the page the 720 column at 1440 (narrower at 1280); leaving for a tab takes the pane away; at 1024 none, the menu alone.
// Before 9 Nov the menu was a page of its own at every size.
await stage("split: at 1280 and 1440 by mouse, Settings' menu in a pane beside its page (Settings itself opening Account), the page's row lit, no way back on a first page and its own further in, the pane kept from page to page and level with the page; none at 1024", async () => {
  const faults = [];
  const said = [];
  const PANE = '[data-part="page"] > .lx-settings-aside';
  const now = (page) =>
    page.evaluate((PANE) => {
      const pane = document.querySelector(PANE);
      const view = document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])');
      const r = (node) => node && node.getBoundingClientRect();
      const title = (root) => r(root?.querySelector('[data-part="page-title"], h1'));
      return {
        hash: location.hash,
        // The pane's content box (its rows' rounded outset sits in its padding, shell.css: their text is where the pane's is).
        pane: pane && pane.checkVisibility() ? (() => {
          const s = getComputedStyle(pane);
          const left = r(pane).left + parseFloat(s.paddingLeft);
          const right = r(pane).right - parseFloat(s.paddingRight);
          return { left: Math.round(left), right: Math.round(right), width: Math.round(right - left), title: Math.round(title(pane)?.top ?? -1) };
        })() : null,
        view: view ? { left: Math.round(r(view).left), width: Math.round(r(view).width), title: Math.round(title(view)?.top ?? -1) } : null,
        lit: pane ? [...pane.querySelectorAll('[aria-current="page"]')].map((node) => node.getAttribute("href")) : [],
      };
    }, PANE);
  for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    const { context, page, errors } = await device(size);
    try {
      await go(page, "#study");
      await page.locator(`${SIDEBAR} [data-part="tab"][data-variant="settings"]`).click();
      await page.waitForFunction(() => location.hash === "#settings/account", null, { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(700);
      let at = await now(page);
      if (at.hash !== "#settings/account") faults.push(`${size.width}: Settings from the sidebar opened ${at.hash}, not Account`);
      if (!at.pane) {
        faults.push(`${size.width}: no menu beside Settings' page`);
        continue;
      }
      const widths = { pane: at.pane.width, page: at.view.width };
      if (at.pane.width !== 320) faults.push(`${size.width}: the menu's pane ${at.pane.width} wide, not 320`);
      if (at.view.left < at.pane.right + 24) faults.push(`${size.width}: the page starts ${at.view.left - at.pane.right} px after the pane`);
      if (Math.abs(at.view.title - at.pane.title) > 2) faults.push(`${size.width}: the page's title at ${at.view.title}, the pane's at ${at.pane.title}`);
      const want = size.width >= 1440 ? 720 : 640;
      if (size.width >= 1440 ? at.view.width !== want : at.view.width < want) faults.push(`${size.width}: the page ${at.view.width} wide (${size.width >= 1440 ? "not 720" : "under 640"})`);
      if (at.lit.join() !== "#settings/account") faults.push(`${size.width}: lit in the pane: ${at.lit.join() || "nothing"}, not Account`);
      // Lit as the sidebar lights the tab you're on, the avatar on it ringed.
      const looks = await page.evaluate((PANE) => {
        const row = document.querySelector(`${PANE} [aria-current="page"]`);
        const tab = document.querySelector('[data-part="app"] > [data-part="tab-bar"] [data-part="tab"][data-state="active"]');
        return { row: row && getComputedStyle(row).backgroundColor, tab: tab && getComputedStyle(tab).backgroundColor, ring: getComputedStyle(row?.querySelector('[data-part="avatar"]') ?? document.body).boxShadow };
      }, PANE);
      if (!looks.row || looks.row !== looks.tab) faults.push(`${size.width}: the lit row ${looks.row}, the sidebar's lit tab ${looks.tab}`);
      if (!/inset/.test(looks.ring ?? "")) faults.push(`${size.width}: the lit Account row's avatar has no ring (${looks.ring})`);
      if (await box(page, PILL)) faults.push(`${size.width}: Account beside the menu has a way back ("${await pillText(page)}")`);
      await page.screenshot({ path: join(OUT, `split-${size.width}-account.png`) });
      // A press in the pane: its page beside it, the pane the same node, that row lit.
      await page.evaluate((PANE) => (window.lxPane = document.querySelector(PANE)), PANE);
      await page.locator(`${PANE} a[href="#settings/appearance"]`).click();
      await page.waitForFunction(() => location.hash === "#settings/appearance", null, { timeout: 10_000 });
      await page.waitForTimeout(600);
      at = await now(page);
      if (!(await page.evaluate((PANE) => window.lxPane === document.querySelector(PANE), PANE))) faults.push(`${size.width}: the pane was drawn again for Appearance`);
      if (at.lit.join() !== "#settings/appearance") faults.push(`${size.width}: lit for Appearance: ${at.lit.join() || "nothing"}`);
      if (await box(page, PILL)) faults.push(`${size.width}: Appearance beside the menu has a way back ("${await pillText(page)}")`);
      // Further in: its own way back; the pane still lit at Appearance.
      await page.locator('[data-part="page"] > .lx-view:not([data-waiting]) a[href="#settings/appearance/edit"]').first().click();
      await page.waitForFunction(() => location.hash === "#settings/appearance/edit", null, { timeout: 10_000 });
      await page.waitForTimeout(600);
      at = await now(page);
      if (at.lit.join() !== "#settings/appearance") faults.push(`${size.width}: lit for Make it yours: ${at.lit.join() || "nothing"}`);
      if (!(await box(page, PILL)) || !/Appearance/.test(await pillText(page))) faults.push(`${size.width}: Make it yours has no way back to Appearance (${await pillText(page)})`);
      await page.screenshot({ path: join(OUT, `split-${size.width}-make-it-yours.png`) });
      // Back a step at a time, as on a phone: Appearance, Account (Settings' own place, its first page took it), then out of Settings, the
      // pane gone with it.
      const backs = [];
      for (let i = 0; i < 3; i++) {
        await page.goBack();
        await page.waitForTimeout(600);
        at = await now(page);
        backs.push(`${at.hash}${at.pane ? "+pane" : ""}`);
      }
      // (The last, the app's first entry: Home, by whatever address it was opened at.)
      const out = !backs[2].startsWith("#settings") && !backs[2].endsWith("+pane");
      if (backs.slice(0, 2).join() !== "#settings/appearance+pane,#settings/account+pane" || !out) faults.push(`${size.width}: back three times from Make it yours: ${backs.map((b) => b || "(the first page)").join(", ")}`);
      // A tab: the pane goes.
      await page.locator(`${SIDEBAR} [data-part="tab"][data-variant="settings"]`).click();
      await page.waitForFunction(() => location.hash === "#settings/account", null, { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(600);
      await page.locator(`${SIDEBAR} [data-part="tab"]`).first().click();
      await page.waitForTimeout(700);
      if ((await now(page)).pane) faults.push(`${size.width}: the menu's pane stayed on ${await page.evaluate(() => location.hash)}`);
      assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
      said.push(`${size.width}: pane ${widths.pane}, page ${widths.page}`);
    } finally {
      await context.close();
    }
  }
  // 1024: the menu alone, as before.
  const { context, page } = await device({ width: 1024, height: 768 });
  try {
    await go(page, "#settings");
    await page.waitForTimeout(700);
    const at = await now(page);
    if (at.hash !== "#settings" || at.pane) faults.push(`1024: ${at.hash}${at.pane ? " with a pane" : ""}, not the menu alone`);
  } finally {
    await context.close();
  }
  assert(!faults.length, faults.join("\n"));
  return `the menu beside its page, Settings opening Account, the page's row lit, a first page's way back the pane, Make it yours back to Appearance; ${said.join("; ")}; 1024 the menu alone`;
});

const PHONE_GAMES = ["see", "fill"];
// The Knowledge tab on a phone, for the phones stage: its top (the pile's card), This week brought to the top (its glasses, what it's made of,
// its new words and its button, which a computer's board lays out in two columns), and the Ideas page. Two things on the tab aren't in the
// pictures, each holding its place: the pile's own tiles (every visit lays them out anew from a seed of its own, know/cards.js freshSeed,
// crypto's, so two sides never match; the pile itself is pile-drop-check's), and the tab's idea cards (each is built a little at a time
// before it's on the page, and its sentence is sized to its line only if no frame passes in between, study/concept-picture.js, so the same
// files can draw it a step apart: 11 Nov 2026, one side at 1.05 on one line, the other at 1.1 on two). The Ideas page builds its cards at
// once, and has them.
const KNOW_BOARD = '[data-part="page"]:not([data-ghost]) .lx-know-board';
const NO_PILE = '.lx-pile-canvas, .lx-know-board [data-card="ideas"] { visibility: hidden !important; }';
const toKnowCard = async (page, card) => {
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "start" }), `${KNOW_BOARD} [data-card="${card}"]`);
  await page.waitForTimeout(800);
};
const KNOW_SCREENS = [
  ["know", async (page) => (await page.addStyleTag({ content: NO_PILE }), await go(page, "#know"), await page.waitForSelector(`${KNOW_BOARD}[data-drawn]`, { timeout: 30_000 }), await page.waitForTimeout(1500))],
  ["know-week", (page) => toKnowCard(page, "week")],
  ["ideas", async (page) => (await go(page, "#know/ideas"), await page.waitForTimeout(1500))],
];
// A book's photos on the reader's screen: each one shown (what's under its middle is the photo itself, so one under a page's cover doesn't count),
// by where it is, how large it's drawn and its file's own size. Their own pixels are left out of the pixel comparison: one photo scaled
// twice comes out a few dots apart with the very same files both sides (8 Nov 2026: 347 pixels inside the photo at 390; 11 Nov: 126 to 347 on
// every lane's landing, a different count each run, never outside the photo), so a photo is compared by its place and size, and everything
// around it pixel for pixel. The stage proves both halves each run: a word moved one pixel and a photo moved one pixel are each caught.
// The screens with photos: where its photos are, and a word of its own to move for the control. Read's shelf has the same photos as covers.
const PHOTO_SCREENS = {
  reader: { photos: '[data-part="reader"] img', word: '[data-part="reader"] > [data-part="reader-text"] .lx-w' },
  read: { photos: '[data-part="page"]:not([data-ghost]) [data-part="book-cover"] img:not([data-part="language-flag"])', word: '[data-part="page"]:not([data-ghost]) :is([data-part="continue-card"] h2, [data-part="section-title"])' },
};
const photosOf = (page, selector = PHOTO_SCREENS.reader.photos) =>
  page.evaluate((selector) =>
    [...document.querySelectorAll(selector)]
      .map((img) => ({ img, box: img.getBoundingClientRect() }))
      .filter(({ img, box }) => {
        if (!box.width || !box.height || box.right <= 0 || box.left >= innerWidth || box.bottom <= 0 || box.top >= innerHeight) return false;
        const at = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, box.left + box.width / 2)), Math.min(innerHeight - 1, Math.max(0, box.top + box.height / 2)));
        return Boolean(at) && (img.closest('[data-part="reader-picture"], [data-part="book-cover"]') ?? img).contains(at);
      })
      .map(({ img, box }) => ({
        loaded: img.complete && img.naturalWidth > 0,
        file: [img.naturalWidth, img.naturalHeight],
        at: [box.left, box.top, box.width, box.height].map((n) => Math.round(n * 100) / 100),
        // In the picture's pixels, a pixel wider all round (the edge it's blended into).
        skip: { x: Math.floor(box.left * devicePixelRatio) - 1, y: Math.floor(box.top * devicePixelRatio) - 1, r: Math.ceil(box.right * devicePixelRatio) + 1, b: Math.ceil(box.bottom * devicePixelRatio) + 1 },
      })), selector);
const placed = (photos) => JSON.stringify(photos.map((photo) => [photo.loaded, photo.file, photo.at]));
/** How many pixels inside these boxes two pictures draw apart (past raster rounding): what leaving a photo's own pixels out left out, said in the stage's result. */
async function apartInside(a, b, boxes) {
  const [one, two] = await Promise.all([sharp(a).raw().toBuffer({ resolveWithObject: true }), sharp(b).raw().toBuffer({ resolveWithObject: true })]);
  if (one.info.width !== two.info.width || one.info.height !== two.info.height) return -1;
  const { width, height, channels } = one.info;
  let apart = 0;
  for (const box of boxes)
    for (let y = Math.max(0, box.y); y < Math.min(height, box.b); y++)
      for (let x = Math.max(0, box.x); x < Math.min(width, box.r); x++) {
        const i = (y * width + x) * channels;
        for (let c = 0; c < channels; c++)
          if (Math.abs(one.data[i + c] - two.data[i + c]) > PIXEL_NOISE) {
            apart++;
            break;
          }
      }
  return apart;
}
const AGAIN = new Set(["home", "settings", "translate"]);
// Both versions side by side, a screen at a time: what each did to get there, then a picture of each once settled. A screen that differs is
// pictured again on both sides, up to three times, a second apart: a moment caught differently (a face, a flag, a sound) clears, a change
// of the code's stays.
// ---------- Read on a computer ----------
// From 1024 px (read.css, "on a computer"): the book up front sits beside its name and its way in at a book's size (it was a phone's page
// across the column: a 720 × 343 picture over the button, the window's whole first view), so Weave your own is in the first view; the lead
// shelf is a shelf, its covers one height, none wider than a wide page; Your library's books are six to a row.
await stage("read: at 1024, 1280 and 1440 by mouse the book up front sits beside its name and its way in at a book's size with Weave your own in the first view, the lead shelf's covers are one height, and Your library's books are six to a row", async () => {
  const seen = [];
  for (const size of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    const { context, page, errors } = await device(size);
    try {
      await go(page, "#read");
      await page.waitForSelector('[data-part="page"]:not([data-ghost]) [data-part="continue-card"]', { timeout: 30_000 });
      await page.waitForTimeout(1800);
      const now = await page.evaluate(() => {
        const r = (node) => {
          if (!node || !node.checkVisibility({ visibilityProperty: true })) return null;
          const b = node.getBoundingClientRect();
          return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) };
        };
        const live = document.querySelector('[data-part="page"]:not([data-ghost])');
        const card = live.querySelector('[data-part="continue-card"]');
        const cover = card.querySelector(".lx-continue-top > :first-child");
        return {
          column: r(live.querySelector(".lx-library")),
          card: r(card),
          cover: r(cover.querySelector('[data-part="book-cover"]') ?? cover),
          text: r(card.querySelector(".lx-continue-text")),
          button: r(card.querySelector(':scope > [data-part="button"]')),
          weave: r(live.querySelector('[data-part="weave-your-own"] [data-part="section-title"], [data-part="weave-your-own"] h2, [data-part="weave-your-own"]')),
          shelf: [...live.querySelectorAll('.lx-shelf-grid > [data-part="book-tile"]')].map((tile) => r(tile.querySelector('[data-part="book-cover"]'))).filter(Boolean),
          view: innerHeight,
        };
      });
      const at = `${size.width}: ${JSON.stringify(now)}`;
      await page.screenshot({ path: join(OUT, `read-${size.width}.png`) });
      assert(now.cover && now.text && now.button, `${size.width}: Read has no book up front\n${at}`);
      assert(now.cover.h <= 240 && now.cover.w <= 380, `${size.width}: the book up front is ${now.cover.w} × ${now.cover.h}, larger than a book (380 × 240 at most)\n${at}`);
      assert(now.text.x >= now.cover.r && now.text.y < now.cover.b && now.text.b > now.cover.y, `${size.width}: its name (${now.text.x}, ${now.text.y}–${now.text.b}) isn't beside its cover (to ${now.cover.r}, ${now.cover.y}–${now.cover.b})\n${at}`);
      assert(Math.abs(now.button.x - now.text.x) <= 2 && now.button.y >= now.text.b && now.button.w <= 360, `${size.width}: its way in (${now.button.x}, ${now.button.w} wide) isn't under its name (${now.text.x}), a button's width\n${at}`);
      assert(now.card.h <= 260, `${size.width}: the book up front takes ${now.card.h} px of the page\n${at}`);
      assert(now.weave && now.weave.y < now.view - 80, `${size.width}: Weave your own (${now.weave?.y}) isn't in the window's first view (${now.view})\n${at}`);
      assert(now.shelf.length >= 1 && now.shelf.every((cover) => Math.abs(cover.h - now.shelf[0].h) <= 1 && cover.h <= 140 && cover.w <= 300 && cover.r <= now.column.r + 1), `${size.width}: the lead shelf's covers aren't one height (140 at most), 300 wide at most, in the column: ${JSON.stringify(now.shelf)}`);
      // Your library, with the book just opened in it.
      await page.locator('[data-part="page"]:not([data-ghost]) [data-part="continue-card"] > [data-part="button"]').click();
      await page.waitForSelector('[data-part="reader"]', { timeout: 30_000 });
      await page.waitForTimeout(1500);
      await go(page, "#read/library");
      await page.waitForSelector('[data-part="page"]:not([data-ghost]) .lx-read-library-all [data-part="book-tile"]', { timeout: 20_000 });
      await page.waitForTimeout(800);
      const library = await page.evaluate(() => {
        const grid = document.querySelector('[data-part="page"]:not([data-ghost]) .lx-read-library-all [data-part="book-list"]');
        const covers = [...grid.querySelectorAll('[data-part="book-cover"]')].map((cover) => cover.getBoundingClientRect());
        return { columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length, widest: Math.round(Math.max(...covers.map((b) => b.width))), tallest: Math.round(Math.max(...covers.map((b) => b.height))) };
      });
      await page.screenshot({ path: join(OUT, `read-${size.width}-library.png`) });
      assert(library.columns === 6 && library.widest <= 250 && library.tallest <= 200, `${size.width}: Your library isn't six books to a row at a book's size: ${JSON.stringify(library)}`);
      assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
      seen.push(`${size.width}: the book up front ${now.cover.w} × ${now.cover.h}, its name at ${now.text.x}, Start ${now.button.w} wide, Weave your own at ${now.weave.y} of ${now.view}; shelf covers ${now.shelf[0].h} tall; library ${library.columns} a row, covers ${library.widest} wide at most`);
    } finally {
      await context.close();
    }
  }
  return seen.join("; ");
});

// ---------- the reader on a computer ----------
// From 1024 px the book's own things keep to the book (reader.css, "on a computer"). A text's two pages start under the top bar: until 11 Nov 2026
// the bar lay over both pages' first lines (a chapter's heading, the opening of a text of your own) until it was put away, and putting it away
// still moves no word. The bar's buttons, the page number and the gear sit at the book's edges, not the window's corners (400 px from the page
// at 1920). Its sheets are panels at its end edge with no handle to drag: reading settings over the gear, Contents under its own button.
await stage("reader: at 1280, 1440 and 1920 by mouse a text's two pages start under the top bar and stay put when it's put away, the bar's buttons, the page number and the gear keep to the book's edges, and its sheets are panels at its end edge (settings over the gear, Contents under its button)", async () => {
  const seen = [];
  for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    const { context, page, errors } = await device(size);
    try {
      await go(page, "#read");
      await page.waitForTimeout(1200);
      const tile = page.locator('[data-part="page"]:not([data-ghost]) [data-part="book-tile"]', { hasText: /Alice/ }).first();
      assert(await tile.count(), `${size.width}: no text book on Read's shelf (a copy with the shelf's books: npm run local)`);
      await tile.scrollIntoViewIfNeeded();
      await tile.click();
      await page.waitForSelector('[data-part="reader"][data-variant="spread"]', { timeout: 30_000 });
      await page.waitForTimeout(2500);
      const now = () =>
        page.evaluate(() => {
          const r = (node) => {
            if (!node || !node.checkVisibility({ visibilityProperty: true })) return null;
            const b = node.getBoundingClientRect();
            return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) };
          };
          const reader = document.querySelector('[data-part="reader"]');
          const text = reader.querySelector(':scope > [data-part="reader-text"]');
          const book = text.getBoundingClientRect();
          const gutter = parseFloat(getComputedStyle(text).paddingLeft);
          // The words of the two pages in view (the next spread's columns lie outside the text's box, which clips them).
          const words = [...text.querySelectorAll('.lx-w, [data-part="woven-word"], [data-part="reader-heading"]')]
            .map((node) => node.getBoundingClientRect())
            .filter((b) => b.width > 0 && b.left >= book.left - 1 && b.right <= book.right + 1 && b.bottom > 0 && b.top < innerHeight);
          const sheet = reader.querySelector(':scope > [data-part="sheet"]:not([hidden])');
          return {
            bar: r(reader.querySelector('[data-part="reader-bar"]')),
            back: r(reader.querySelector('[data-part="reader-bar"] .lx-back')),
            collapse: r(reader.querySelector('[data-part="reader-collapse"]')),
            status: r(reader.querySelector('[data-part="reader-status"]')),
            gear: r(reader.querySelector('[data-part="reader-settings-button"]')),
            words: words.length,
            first: words.length ? Math.round(Math.min(...words.map((b) => b.top))) : null,
            heading: r(text.querySelector('[data-part="reader-heading"]')),
            page: { x: Math.round(book.left + gutter), r: Math.round(book.right - gutter) },
            sheet: sheet && { ...r(sheet), handle: Boolean(sheet.querySelector('[data-part="sheet-handle"]')?.checkVisibility()), label: sheet.getAttribute("aria-label") },
            zen: reader.getAttribute("data-state") === "zen",
          };
        });
      const up = await now();
      const at = `${size.width}: ${JSON.stringify(up)}`;
      await page.screenshot({ path: join(OUT, `reader-${size.width}.png`) });
      assert(up.words > 40 && up.heading, `${size.width}: the chapter's first two pages aren't on the screen\n${at}`);
      assert(up.first >= up.bar.b - 1, `${size.width}: the pages' first line (${up.first}) is under the top bar (to ${up.bar.b})\n${at}`);
      assert(up.heading.y >= up.bar.b - 1, `${size.width}: the chapter's heading (${up.heading.y}) is under the top bar (to ${up.bar.b})`);
      // The book's edges: where its pages' text starts and ends.
      assert(up.back.x >= up.page.x - 24 && up.back.x <= up.page.x + 8, `${size.width}: the way back (${up.back.x}) isn't at the page's start (${up.page.x})\n${at}`);
      assert(up.collapse.r <= up.page.r + 24 && up.collapse.r >= up.page.r - 8, `${size.width}: the chevron (to ${up.collapse.r}) isn't at the page's end (${up.page.r})\n${at}`);
      assert(up.status && Math.abs(up.status.x - up.page.x) <= 2, `${size.width}: the page number (${up.status?.x}) isn't under the page's first letter (${up.page.x})\n${at}`);
      assert(up.gear.x >= up.page.r && up.gear.x - up.page.r <= 48, `${size.width}: the gear (${up.gear.x}) isn't beside the last page (text to ${up.page.r})\n${at}`);
      // Reading settings: a panel over the gear.
      await page.locator('[data-part="reader-settings-button"]').click();
      await page.waitForTimeout(900);
      const set = (await now()).sheet;
      await page.screenshot({ path: join(OUT, `reader-${size.width}-settings.png`) });
      assert(set, `${size.width}: the gear opened nothing`);
      assert(set.w <= 400 && Math.abs(set.r - up.gear.r) <= 2 && set.b <= up.gear.y && set.y >= up.bar.b - 1 && !set.handle, `${size.width}: reading settings isn't a panel over the gear, at most 400 wide, under the bar, with no handle: ${JSON.stringify(set)} (the gear ${JSON.stringify(up.gear)})`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
      assert(!(await now()).sheet, `${size.width}: Escape left reading settings open`);
      // Contents: under its own button.
      const contents = page.locator('[data-part="reader-bar"] button', { hasText: "Contents" }).first();
      const button = await contents.boundingBox();
      await contents.click();
      await page.waitForTimeout(900);
      const list = (await now()).sheet;
      await page.screenshot({ path: join(OUT, `reader-${size.width}-contents.png`) });
      assert(list && list.w <= 400 && list.y >= button.y + button.height - 1 && list.y <= button.y + button.height + 16 && Math.abs(list.r - up.collapse.r) <= 2 && !list.handle, `${size.width}: Contents isn't a panel under its button, to the bar's end: ${JSON.stringify(list)} (its button to ${Math.round(button.y + button.height)}, the chevron to ${up.collapse.r})`);
      // A press on the page puts it away, and turns nothing.
      await page.mouse.click(up.page.x + 40, size.height - 200);
      await page.waitForTimeout(700);
      assert(!(await now()).sheet, `${size.width}: a press on the page left Contents open`);
      // The bar put away: no word moves.
      await page.locator('[data-part="reader-collapse"]').click();
      await page.waitForTimeout(900);
      const away = await now();
      assert(away.zen && away.first === up.first && away.heading.y === up.heading.y, `${size.width}: putting the bar away moved the page (first line ${up.first} → ${away.first}, zen ${away.zen})`);
      assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
      seen.push(`${size.width}: first line ${up.first} under the bar's ${up.bar.b}; back ${up.back.x}, number ${up.status.x}, text ${up.page.x}–${up.page.r}, gear ${up.gear.x}; settings ${set.w} wide over the gear, Contents ${list.y} under its button`);
    } finally {
      await context.close();
    }
  }
  return seen.join("; ");
});

await stage("phones: Home, Settings, Translate, two games (question and result), Your words, Study's packs, Everyday's words, Read and a book in the reader at 390 and 320, pixel for pixel as the app was (--base)", async () => {
  const faults = [];
  const shots = [];
  const controls = [];
  const settings = async (page) => {
    await page.locator('[data-part="settings-button"]').first().tap();
    await page.waitForFunction(() => location.hash === "#settings", null, { timeout: 10_000 });
    await page.waitForTimeout(1200);
  };
  const screens = [
    ["home", async (page) => (await go(page, "#today"), await page.waitForTimeout(1500))],
    ["settings", settings],
    ["translate", async (page) => (await openTranslate(page, true, TYPED), await page.waitForTimeout(800))],
    // A game's question and its result, on the words known (the plan and its choices the same both sides: the clock and Math.random fixed).
    ...PHONE_GAMES.flatMap((game) => [
      [game, async (page) => {
        if (game === PHONE_GAMES[0]) await knowWords(page);
        await endSession(page);
        await go(page, `#study/session/game/${game}`);
        await page.waitForSelector(SESSION, { timeout: 20_000 });
      }],
      [`${game}-result`, async (page) => void (await answerStep(page, { next: false }))],
    ]),
    ["words", async (page) => (await endSession(page), await go(page, "#know/words"), await page.waitForTimeout(1500))],
    ...KNOW_SCREENS,
    ["packs", async (page) => (await go(page, "#study/packs"), await page.waitForTimeout(1500))],
    // Study's own page and Where you are (the path): their computer rules sit beside the phone's in study-screens.css and path-page.css.
    ["study", async (page) => (await go(page, "#study"), await page.waitForTimeout(1500))],
    ["path", async (page) => (await go(page, "#study/path"), await page.waitForTimeout(2000))],
    ["everyday", async (page) => (await go(page, "#know/everyday/words"), await page.waitForTimeout(1500))],
    // Read, its top as a new learner has it: the book up front, Weave your own, the shelf's first covers (decoded before it's pictured).
    ["read", async (page) => {
      await go(page, "#read");
      await page.waitForSelector('[data-part="page"]:not([data-ghost]) [data-part="continue-card"]', { timeout: 30_000 });
      await page.waitForTimeout(1500);
      await page.evaluate(async () => {
        await Promise.all([...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="book-cover"] img')].filter((img) => img.getBoundingClientRect().top < innerHeight).map((img) => img.decode().catch(() => {})));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
    }],
    ["reader", async (page) => {
      await go(page, "#read");
      await page.waitForTimeout(1200);
      const tile = page.locator('[data-part="page"]:not([data-ghost]) .lx-read-shelf [data-part="book-tile"]').first();
      await tile.scrollIntoViewIfNeeded();
      await tile.tap();
      await page.waitForSelector('[data-part="reader"]', { timeout: 30_000 });
      await page.waitForTimeout(2500);
      // Its pictures decoded whole before it's pictured. (A book's photo has still come out a few hundred pixels apart, inside the photo only and
      // the layout the same, with the very same files on both sides: so its own pixels are left out, and it's compared by its place and size, photosOf.)
      await page.evaluate(async () => {
        await Promise.all([...document.querySelectorAll('[data-part="reader"] img')].map((img) => img.decode().catch(() => {})));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
    }],
  ];
  for (const [width, height] of [
    [390, 844],
    [320, 568],
  ]) {
    const now = await device({ width, height, touch: true, still: true, files: FROM ?? HERE });
    const before = await device({ width, height, touch: true, still: true, files: BEFORE });
    try {
      for (const [name, act] of screens) {
        if (SCREENS && !SCREENS.test(name)) continue;
        await act(now.page);
        await act(before.page);
        let fault = null;
        let shot = null;
        let other = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 1000));
          // A page that can be opened again (Home, Settings, Translate) is, once, on both sides: a word placed a fraction of a pixel apart
          // when a page was laid out stays that way for that drawing of it (8 Nov: "Graphite" on Settings' Appearance row, one run in three).
          if (attempt === 3) {
            if (!AGAIN.has(name)) break;
            for (const side of [now, before]) {
              await side.page.reload();
              await side.page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
              await side.page.addStyleTag({ content: STILL });
              if (name !== "home") await go(side.page, "#today");
              await act(side.page);
            }
          }
          shot = await steady(now.page);
          other = await steady(before.page);
          // A book's photos by their place and size (photosOf), the rest of the screen pixel for pixel.
          const pictured = PHOTO_SCREENS[name];
          const photos = pictured ? [await photosOf(now.page, pictured.photos), await photosOf(before.page, pictured.photos)] : null;
          fault =
            photos && (placed(photos[0]) !== placed(photos[1]) || photos[0].some((photo) => !photo.loaded))
              ? `phone-${width}-${name}: the book's photos aren't as they were (loaded, the file's size, left/top/width/height): ${placed(photos[1])} → ${placed(photos[0])}`
              : await samePixels(shot, other, `phone-${width}-${name}`, photos ? photos[0].map((photo) => photo.skip) : []);
          if (!fault) break;
        }
        // That comparison can still fail: a word of the page moved one pixel is caught with the photos left out, and a photo moved one pixel
        // is caught by its place.
        if (PHOTO_SCREENS[name] && !fault) {
          const pictured = PHOTO_SCREENS[name];
          const skip = (await photosOf(now.page, pictured.photos)).map((photo) => photo.skip);
          const inside = await apartInside(shot, other, skip);
          const word = await now.page.evaluate((selector) => {
            const shown = [...document.querySelectorAll(selector)].find((node) => {
              const b = node.getBoundingClientRect();
              const at = b.width > 4 && b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) : null;
              return Boolean(at) && (node.contains(at) || at.contains(node));
            });
            if (!shown) return null;
            shown.setAttribute("data-desk-check-moved", "");
            shown.style.position = "relative";
            shown.style.left = "1px";
            const word = shown.cloneNode(true);
            for (const gloss of word.querySelectorAll("rt")) gloss.remove();
            return word.textContent.trim().slice(0, 20);
          }, pictured.word);
          assert(word, `phone-${width}-${name}: no word of its own on the screen to move for the control`);
          await now.page.waitForTimeout(300);
          const moved = await samePixels(await now.page.screenshot(), other, `phone-${width}-${name}-control-word`, skip);
          await now.page.evaluate(() => {
            const node = document.querySelector("[data-desk-check-moved]");
            node.style.removeProperty("position");
            node.style.removeProperty("left");
            node.removeAttribute("data-desk-check-moved");
          });
          assert(moved, `phone-${width}-${name}: "${word}" moved one pixel, and the screens still compare the same: the comparison can't fail`);
          if (skip.length) {
            await now.page.evaluate((selector) => {
              const img = [...document.querySelectorAll(selector)].find((node) => {
                const b = node.getBoundingClientRect();
                const at = b.width && b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) : null;
                return Boolean(at) && (node.closest('[data-part="reader-picture"], [data-part="book-cover"]') ?? node).contains(at);
              });
              img.setAttribute("data-desk-check-moved", "");
              img.style.position = "relative";
              img.style.left = "1px";
            }, pictured.photos);
            const there = placed(await photosOf(now.page, pictured.photos)) !== placed(await photosOf(before.page, pictured.photos));
            await now.page.evaluate(() => {
              const node = document.querySelector("[data-desk-check-moved]");
              node.style.removeProperty("position");
              node.style.removeProperty("left");
              node.removeAttribute("data-desk-check-moved");
            });
            assert(there, `phone-${width}-${name}: a photo moved one pixel, and its place still reads the same: the comparison can't fail`);
          }
          controls.push(`${width} ${name}: ${skip.length} photo${skip.length === 1 ? "" : "s"} by place and size (${inside} of its own pixels drawn apart this run, left out), "${word}" and a photo each caught one pixel off`);
        }
        writeFileSync(join(OUT, `phone-${width}-${name}.png`), shot);
        if (fault) writeFileSync(join(OUT, `phone-${width}-${name}-before.png`), other);
        if (fault) faults.push(fault);
        else shots.push(`${width} ${name}`);
      }
      assert(!now.errors.length && !before.errors.length, `${width}: page errors: ${[...now.errors, ...before.errors].join(" | ")}`);
    } finally {
      await now.context.close();
      await before.context.close();
    }
  }
  assert(!faults.length, faults.join("\n"));
  assert(shots.length, `no screen compared${SCREENS ? ` (--screens ${SCREENS.source} names none of ${screens.map(([name]) => name).join(", ")})` : ""}`);
  return `the same: ${shots.join(", ")}${SCREENS ? ` (only --screens ${SCREENS.source})` : ""}; a book's photos: ${controls.join("; ") || "no screen with one"}${noise.length ? ` (edges drawn apart, let pass: ${noise.join("; ")})` : ""}`;
});

await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((one) => !one.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
