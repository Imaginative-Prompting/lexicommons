// Knowledge's idea cards show their idea (know/cards-more.js sentenceOf, ideasNotes; know.css's idea-card rule): a learner weeks in (the sample
// learner, study/sample-mode.js) on a phone. Each idea is drawn on a sentence that shows it, where one of the learner's does (its pack's notes
// mark the idea's words, or it carries its own shape for the idea), with those words lit; an idea none of theirs shows is drawn plain, never
// with every word dimmed; the tab's cards are the page's first, on the same sentences; a card's sheet opens on its card's sentence; opened
// straight at the Ideas page (a reload), its cards are there in the first frame and lit once the notes are read; opened again, the cards on the
// screen are lit by 1.5 s and those below are lit already when they're scrolled to. The ideas that have a
// sentence showing them are counted apart from the cards, from the learner's sentences and their packs' notes, and must be most of the page's
// (so the check can fail: 11 Nov 2026, before this, not one of the sample learner's 35 cards lit a word, though 26 of their ideas had such a
// sentence, and every word of every card was drawn quiet with its full stop alone at full ink).
//
//   node scripts/idea-cards-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]
//
// --from <copy> serves another copy's /js and /css (the app from before 11 Nov 2026 fails it). LOCAL only (it signs up an account), a copy with
// Dutch's lessons and word packs (npm run local); through gpu.py's parallel lane. Exit 0 = pass.
import { chromium } from "./quiet-browser.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const FROM = argv.includes("--from") ? resolve(argv[argv.indexOf("--from") + 1]) : null;
if (!/^http:\/\/localhost:\d+$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/idea-cards-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]   (LOCAL only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
let failed = 0;
const say = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

// Each idea card on the page now: its idea's name, its sentence, the words lit (an idea's own words, or a piece of its shape), and the ink of its
// line, of a word not lit and of a lit one.
const CARDS = () =>
  [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="idea-card"]')].map((card) => {
    const line = card.querySelector(".lx-rule-line");
    const lit = [...card.querySelectorAll(".lx-rule-word[data-lit], .lx-rule-word[data-piece]")];
    const plain = card.querySelector(".lx-rule-word:not([data-lit]):not([data-piece])");
    return {
      name: card.querySelector(".lx-idea-name")?.textContent.trim() ?? "",
      sentence: line?.textContent.trim() ?? "",
      lit: lit.map((word) => word.textContent),
      lineInk: line ? getComputedStyle(line).color : null,
      plainInk: plain ? getComputedStyle(plain).color : null,
      litInk: card.querySelector(".lx-rule-word[data-lit]") ? getComputedStyle(card.querySelector(".lx-rule-word[data-lit]")).color : null,
    };
  });
// The ideas a sentence of the learner's shows, by name: from every sentence and its pack's notes, read here, not from the cards.
const SHOWN = async () => {
  const content = await import("/js/study/content.js");
  const notes = await import("/js/study/notes.js");
  await notes.notesReady([...new Set(content.ITEMS.flatMap((item) => [item.copyOf, item.pack]).filter(Boolean))]);
  const ids = new Set();
  for (const item of content.ITEMS) for (const id of item.concepts ?? []) if (item.shapes?.[id] || notes.notesNow(item)?.marks?.[id]?.length) ids.add(id);
  return [...ids].map((id) => content.PATTERNS?.[id]?.name).filter(Boolean);
};

const MIME = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const browser = await chromium.launch({ headless: true });
const report = {};
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block", colorScheme: "dark" });
if (FROM) {
  await context.route(/\/(js|css)\/[^?]+/, (route) => {
    const file = join(FROM, "public", new URL(route.request().url()).pathname);
    return existsSync(file) ? route.fulfill({ status: 200, contentType: MIME[extname(file)] ?? "application/octet-stream", body: readFileSync(file) }) : route.continue();
  });
}
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Idea Cards");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  for (let i = 0; i < 4; i++) {
    const choice = page.locator(".lx-welcome button, .lx-welcome [role='option']").filter({ hasText: /Dutch|Nederlands/ }).first();
    if (!(await choice.count())) break;
    await choice.click();
    await page.waitForTimeout(700);
  }
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
  if (why) throw new Error(`the sample learner: ${why}`);

  // Opened straight at the Ideas page (a reload there, which also starts the sample learner): its cards in the first frame, and lit once the
  // notes are read. (A goto to the same page with another hash isn't a load.)
  await page.evaluate(() => history.replaceState(history.state, "", "#know/ideas"));
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.waitForSelector('[data-part="page"]:not([data-ghost]) .lx-ideas-page', { timeout: 30_000 });
  const first = await page.evaluate(CARDS);
  await page.waitForTimeout(4000);
  const cards = await page.evaluate(CARDS);
  await page.screenshot({ path: join(OUT, "ideas-page.png") });
  const shown = new Set(await page.evaluate(SHOWN));
  report.cards = cards;
  report.shown = [...shown];
  say(first.length > 0 && first.length === cards.length && first.every((card) => card.sentence), "opened straight at the Ideas page, its cards are there in the first frame, each with its sentence", `${first.length} then ${cards.length}`);

  // The rule: an idea a sentence of the learner's shows, drawn on one, its words lit.
  const showable = cards.filter((card) => shown.has(card.name));
  const dark = showable.filter((card) => !card.lit.length);
  say(showable.length >= Math.ceil(cards.length / 2), "most of the learner's ideas have a sentence that shows them (counted from their sentences and the notes, not the cards)", `${showable.length} of ${cards.length}`);
  say(!dark.length, "every idea a sentence of the learner's shows is drawn on one, its words lit", dark.length ? `${dark.length} of ${showable.length} not: ${dark.slice(0, 4).map((card) => `"${card.name}" on "${card.sentence}"`).join(" | ")}` : `${showable.length} of ${showable.length}, e.g. ${showable.slice(0, 3).map((card) => `"${card.sentence}" (${card.lit.join(", ")})`).join("; ")}`);

  // Nothing lit, nothing dimmed: a plain card's words in its line's own ink, the ink a lit word has; a lit card's other words quieter.
  const plain = cards.filter((card) => !card.lit.length);
  const fullInk = cards.find((card) => card.litInk)?.litInk ?? null;
  const dimmed = plain.filter((card) => card.plainInk !== card.lineInk || (fullInk && card.lineInk !== fullInk));
  say(fullInk && !dimmed.length, "a card with nothing lit draws its sentence plain, in a lit word's ink, never every word dimmed", dimmed.length ? `${dimmed.length} of ${plain.length} dimmed: ${dimmed.slice(0, 3).map((card) => `"${card.sentence}" ${card.plainInk}`).join(" | ")}` : `${plain.length} plain at ${fullInk}`);
  const quiet = cards.filter((card) => card.lit.length && card.plainInk && card.plainInk === card.litInk);
  say(!quiet.length, "a lit card's other words are quieter than its lit ones", quiet.length ? quiet.map((card) => card.sentence).join(" | ") : "");

  // The page's pace: opened again (the notes read), every card on the screen that's lit is lit by 1.5 s (a quick ripple, 400 ms at most), and the
  // cards below are lit already as they're scrolled to, with nothing left to draw in. One after another at 450 ms, the 35th lit 16 s in.
  const PILLS = (onScreen) =>
    [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="idea-card"]')]
      .filter((card) => {
        const box = card.getBoundingClientRect();
        return onScreen ? box.bottom > 0 && box.top < innerHeight : true;
      })
      .flatMap((card) => [...card.querySelectorAll(".lx-rule-word[data-lit]")].map((word) => ({ card: card.querySelector(".lx-idea-name")?.textContent.trim() ?? "", size: getComputedStyle(word).backgroundSize, moving: word.getAnimations().length })));
  await page.evaluate(() => (location.hash = "#know"));
  await page.waitForTimeout(1500);
  await page.evaluate(() => (location.hash = "#know/ideas"));
  await page.waitForTimeout(1500);
  const atOnce = await page.evaluate(PILLS, true);
  const unlit = atOnce.filter((one) => one.size !== "100% 100%" || one.moving);
  say(atOnce.length > 0 && !unlit.length, "opened, every lit card on the screen has its words lit by 1.5 s", unlit.length ? `${unlit.length} of ${atOnce.length} not yet: ${unlit.slice(0, 3).map((one) => `"${one.card}" ${one.size}${one.moving ? ", still drawing" : ""}`).join(" | ")}` : `${atOnce.length} lit words on the screen`);
  await page.evaluate(() => {
    const cards = document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="idea-card"]');
    cards[cards.length - 1]?.scrollIntoView({ block: "end" });
  });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const below = await page.evaluate(PILLS, true);
  const waiting = below.filter((one) => one.size !== "100% 100%" || one.moving);
  say(below.length > 0 && !waiting.length, "scrolled to the last cards, their words are lit already, nothing drawing in", waiting.length ? `${waiting.length} of ${below.length}: ${waiting.slice(0, 3).map((one) => `"${one.card}" ${one.size}`).join(" | ")}` : `${below.length} lit words`);
  await page.evaluate(() => document.querySelector('[data-part="page"]:not([data-ghost])')?.scrollTo?.(0, 0));
  await page.evaluate(() => (document.scrollingElement.scrollTop = 0));
  await page.waitForTimeout(300);

  // A card's sheet opens on its card's sentence.
  const lit = page.locator('[data-part="page"]:not([data-ghost]) [data-part="idea-card"]').filter({ has: page.locator(".lx-rule-word[data-lit]") }).first();
  if (!(await lit.count())) say(false, "a card's sheet opens on its card's sentence", "no card has a word lit to open");
  else {
    const own = (await lit.locator(".lx-rule-line").textContent())?.trim() ?? "";
    await lit.click();
    await page.waitForTimeout(1200);
    const inSheet = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] .lx-rule-line, [role="dialog"] [data-part="spoken-line"]')].map((node) => node.textContent.trim()));
    await page.screenshot({ path: join(OUT, "sheet.png") });
    say(inSheet.some((text) => text.replace(/\s+/g, " ") === own.replace(/\s+/g, " ")), "a card's sheet opens on its card's sentence", `"${own}" in ${JSON.stringify(inSheet.slice(0, 3))}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  }

  // The tab's Ideas card: the page's first cards, on the same sentences.
  await page.evaluate(() => (location.hash = "#know"));
  await page.waitForSelector('[data-part="page"]:not([data-ghost]) .lx-know-board[data-drawn]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('[data-part="page"]:not([data-ghost]) .lx-know-board [data-card="ideas"]')?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(1200);
  const tab = await page.evaluate(CARDS);
  await page.screenshot({ path: join(OUT, "tab.png") });
  report.tab = tab;
  const apart = tab.filter((card, i) => card.name !== cards[i]?.name || card.sentence !== cards[i]?.sentence);
  say(tab.length > 0 && !apart.length, "the tab's ideas are the page's first, each on the same sentence", apart.length ? apart.map((card) => `"${card.name}" on "${card.sentence}"`).join(" | ") : `${tab.length} cards`);
  say(errors.length === 0, "no page error", errors.slice(0, 2).join(" | "));
  await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
} catch (error) {
  say(false, "the walk", String(error.stack ?? error).slice(0, 400));
}
writeFileSync(join(OUT, "idea-cards-check.json"), JSON.stringify(report, null, 1));
await context.close();
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
