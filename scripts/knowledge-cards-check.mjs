// The Knowledge page (know/page.js, know/cards.js, know/cards-more.js) on a phone in Chrome, as a learner four weeks in: Your words, This week,
// Everyday Dutch, the ideas you've met and Over time, in order, Your words the one card that opens a page; Your words the pile (a canvas the same
// height at any count), its number Home's own, nothing of the pile kept on the device; a new visit (the tab left and come back to, twice) dropping the
// whole pile in from above the card, every word you've started on it, laid out anew each time (two visits, two piles), the number the same from the
// first frame; a return to the tab with nothing changed showing the same page at once (the same nodes, no long task) and the pile dropping in again,
// counting nothing; two fingers zooming into the pile and springing back, a tap opening Your words; This week's number Home's
// own, Home's tile opening the page at it; Everyday Dutch's 1,000 commonest words as ten hundreds (a strip, each filled as far as its words are
// yours, the one you're on outlined) and that hundred as a page, yours in ink, moving on to the next hundred once eight in ten are yours (79 of the
// first stays on Words 1–100, 80 is Words 101–200: words put in the word bank make them yours); each idea drawn on a sentence of yours,
// opening its sheet; Over time's chart; every control 44 px. A brand-new account: the way to start, no cards. LOCAL only, path-nl seeded.
// node scripts/knowledge-cards-check.mjs http://localhost:<port> <outDir> [--theme paper]
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
const { chromium } = await import("./quiet-browser.mjs");

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
if (!BASE || !outArg || !/^http:\/\/localhost/.test(BASE)) {
  console.error("Usage: knowledge-cards-check.mjs http://localhost:<port> <outDir> [--theme paper] (LOCAL only: it signs up accounts)");
  process.exit(2);
}
const THEME = argv.includes("--theme") ? argv[argv.indexOf("--theme") + 1] : "graphite";
const ONLY = argv.includes("--only") ? new RegExp(argv[argv.indexOf("--only") + 1], "i") : null;
const OUT = resolve(outArg);
mkdirSync(join(OUT, "shots"), { recursive: true });
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const stage = async (name, run) => {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const said = await run();
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${String(error.message ?? error).slice(0, 400)}`);
  }
};

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [];
async function newAccount(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: THEME === "paper" ? "light" : "dark" });
  // The pictures a move between pages draws live in closed shadow roots (shell/page-slide.js): open here, so a frame's pile can be read in them.
  await context.addInitScript(() => {
    // The Home Screen app's own swipe back, on (as back-check.mjs has it).
    try {
      localStorage.setItem("check.swipe-back", "1");
    } catch {}
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      const root = attach.call(this, { ...init, mode: "open" });
      (globalThis.__roots ??= []).push(root);
      return root;
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.log(`  pageerror: ${error.message}`);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', name);
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
  if (THEME !== "graphite") await page.evaluate((t) => (document.documentElement.dataset.theme = t), THEME);
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  const ready = await page.evaluate(async () => {
    const content = await import("/js/study/content.js");
    const { pathLessons } = await import("/js/study/path.js");
    for (let waited = 0; waited < 120_000; waited += 400) {
      if (content.ITEMS.some((item) => item.pack === "path-nl") && pathLessons().length > 5) return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  });
  if (!ready) {
    console.log("FAIL  path-nl never came: seed it (scripts/packs/seed-local.mjs --default)");
    process.exit(2);
  }
  return { context, page, cdp };
}
const go = async (page, hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(1500);
};
const tab = (page, href) => page.tap(`[data-part="tab"][href="${href}"], a[href="${href}"][data-part="tab"]`);
const board = '[data-part="page"] .lx-know-board';
/**
 * The ms until `ready()` holds, polled every 50 ms up to `most`, or null. The ideas and Over time come after the pile is at rest and the packs'
 * notes are read (know/page.js: each wait up to 4 s), so a page just opened has them a moment later than the rest.
 */
const until = async (ready, most = 10_000) => {
  const t0 = Date.now();
  for (; Date.now() - t0 < most; await page.waitForTimeout(50)) if (await ready()) return Date.now() - t0;
  return null;
};
const sheet = (page) => page.locator('.lx-sheet-layer:not([hidden]) [role="dialog"]').last();
const closeSheet = async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".lx-sheet-layer:not([hidden])"), null, { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(300);
};
const pileReady = (page) => page.waitForFunction(() => document.querySelector('.lx-know-board [data-part="word-pile"][data-pile="ready"]'), null, { timeout: 120_000 });
// What the page knows, from the app's own sums, to hold the screens to.
const sums = (page) =>
  page.evaluate(async () => {
    const S = await import("/js/know/summary.js");
    const { pileUnits, recalledUnits } = await import("/js/know/cards.js");
    const { PILE_HEIGHT } = await import("/js/know/pile.js");
    const { bankWords } = await import("/js/read/bank.js");
    const { learning } = await import("/js/study/learning.js");
    const lang = learning();
    const now = Date.now();
    const strip = S.wordStrip({ lang, now, size: 1000, said: new Set(bankWords(lang)) });
    const ideas = S.grammarMap({ lang, now }).filter((row) => row.state !== "new").length;
    const recalled = recalledUnits(lang, now).map((row) => row.unit);
    const started = pileUnits(lang, now).map((row) => row.unit);
    // Everyday's card (know/cards-more.js): the commonest words in hundreds, and the one you're on, the first under eight in ten yours.
    let everyday = null;
    if (strip) {
      const hundreds = [];
      for (let k = 0; k < strip.cells.length; k += 100) hundreds.push(strip.cells.slice(k, k + 100));
      const shares = hundreds.map((h) => h.filter((c) => c.yours).length / h.length);
      const ahead = shares.findIndex((share) => share < 0.8);
      const on = ahead === -1 ? hundreds.length - 1 : ahead;
      const page = hundreds[on];
      everyday = { on, from: on * 100 + 1, to: on * 100 + page.length, count: page.filter((c) => c.yours).length, size: page.length, shares, first: hundreds[0].map((c) => ({ lemma: c.lemma, yours: c.yours })) };
    }
    return { recalled, started, everyday, common: strip?.cells.length ?? null, ideas, height: PILE_HEIGHT, lang };
  });
// Everyday's card as it's drawn: the range and count over the hundred, its words in ink and blank, the strip's bars (each one's fill, the outlined one).
const everydayShown = (page) =>
  page.locator(`${board} [data-card="everyday"]`).evaluate((card) => ({
    range: card.querySelector(".lx-hundred-range")?.textContent.trim(),
    count: card.querySelector(".lx-hundred-count")?.textContent.trim(),
    inked: card.querySelectorAll(".lx-common-word").length,
    blank: card.querySelectorAll(".lx-common-gap").length,
    bars: [...card.querySelectorAll(".lx-hundred-bar")].map((bar) => ({ fill: Number(bar.firstElementChild?.style.getPropertyValue("--fill") || 0), on: bar.hasAttribute("data-on") })),
  }));
const everydayAgrees = (shown, want) => {
  const wrong = [];
  if (shown.range !== `Words ${want.from}–${want.to}`) wrong.push(`the range says "${shown.range}" for Words ${want.from}–${want.to}`);
  if (shown.inked !== want.count || shown.inked + shown.blank !== want.size) wrong.push(`${shown.inked} in ink and ${shown.blank} blank for ${want.count} of ${want.size} yours`);
  if (shown.count !== `${want.count} of ${want.size}`) wrong.push(`the count says "${shown.count}"`);
  if (shown.bars.length !== want.shares.length) wrong.push(`${shown.bars.length} bars for ${want.shares.length} hundreds`);
  const off = shown.bars.map((bar, k) => Math.abs(bar.fill - (want.shares[k] ?? -1))).findIndex((d) => d > 0.015);
  if (off !== -1) wrong.push(`bar ${off + 1} filled ${shown.bars[off].fill.toFixed(2)} for ${want.shares[off].toFixed(2)}`);
  const outlined = shown.bars.flatMap((bar, k) => (bar.on ? [k] : []));
  if (outlined.length !== 1 || outlined[0] !== want.on) wrong.push(`bar ${outlined.map((k) => k + 1).join(", ") || "none"} outlined for ${want.on + 1}`);
  return wrong;
};
// The pile's canvas, summed: what's drawn on it now.
const drawn = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('.lx-know-board [data-part="word-pile"] canvas');
    if (!canvas) return null;
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 16) sum = (sum + data[i] * 7 + data[i + 1] * 3 + data[i + 3] * (i % 97)) % 1_000_000_007;
    return sum;
  });
// Everything the pile does from now: its states and the card's number, every frame, and the long tasks.
const watch = (page) =>
  page.evaluate(() => {
    const w = (globalThis.__knowWatch = { states: [], numbers: [], long: [], t0: performance.now() });
    new MutationObserver((records) => {
      for (const r of records) if (r.target.dataset?.pile) w.states.push(r.target.dataset.pile);
    }).observe(document.body, { attributes: true, attributeFilter: ["data-pile"], subtree: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.startTime >= w.t0) w.long.push(Math.round(e.duration));
    }).observe({ type: "longtask" });
    const frame = () => {
      const n = document.querySelector('.lx-know-board [data-card="words"] .lx-know-n')?.textContent;
      if (n && n !== w.numbers.at(-1)) w.numbers.push(n);
      if (!w.stop) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
const watched = (page) =>
  page.evaluate(() => {
    const w = globalThis.__knowWatch;
    w.stop = true;
    return { states: w.states, numbers: w.numbers, long: w.long };
  });

// ---------- a learner four weeks in ----------
const { context, page, cdp } = await newAccount("Knowledge Cards");
await page.evaluate(async () => {
  const { record } = await import("/js/study/progress.js");
  const { ITEMS, conceptsOf } = await import("/js/study/content.js");
  const { pathLessons } = await import("/js/study/path.js");
  const { finishedLesson, finishedPractice } = await import("/js/study/done.js");
  const DAY = 86_400_000, now = Date.now();
  const lessons = pathLessons().slice(0, 14);
  const queue = lessons.flatMap((lesson) => (lesson.items ?? []).filter((id) => ITEMS.some((item) => item.id === id)));
  const byId = new Map(ITEMS.map((item) => [item.id, item]));
  queue.forEach((id, k) => {
    const first = 27 - Math.floor(k / 4);
    for (const gap of [0, 1, 3, 7, 14, 21]) {
      const day = first - gap;
      if (day < 0) break;
      const item = byId.get(id);
      const outcome = k % 11 === 3 && gap === 7 ? "wrong" : "right";
      if (item) record(conceptsOf(item).map((concept) => ({ concept, at: now - day * DAY - 5 * 3_600_000 + k * 1000, outcome, test: "recall", skill: k % 3 ? "read" : "hear", activity: "choose", item: id })));
    }
  });
  lessons.forEach((lesson, n) => finishedLesson(lesson.id, now - (27 - n * 2) * DAY));
  for (let day = 27; day >= 1; day--) if (![19, 11, 12].includes(day)) finishedPractice(now - day * DAY - 3_600_000);
});
await page.waitForTimeout(2000);
// The packs' notes read (they mark the words an idea's picture lights), as a returning learner's device has them.
await page.evaluate(async () => {
  const notes = await import("/js/study/notes.js");
  const { ITEMS } = await import("/js/study/content.js");
  await notes.notesReady([...new Set(ITEMS.map((item) => item.pack))]);
});
// Home's two numbers first: the page must say the same.
await go(page, "#today");
const home = await page.evaluate(() => [...document.querySelectorAll('[data-part="stat-tile"]')].map((tile) => ({ n: tile.querySelector(".lx-tile-number")?.textContent.trim(), href: tile.getAttribute("href") })));
await go(page, "#know");
await page.waitForFunction(() => document.querySelector('[data-part="page"] .lx-know-board [data-card="time"]'), null, { timeout: 30_000 }).catch(() => {});
const truth = await sums(page);
const total = truth.recalled.length;

await stage("the Knowledge page: Your words, This week, the ideas, Everyday, Over time, in order; the cards open their own pages", async () => {
  const cards = await page.locator(`${board} > [data-card]`).evaluateAll((nodes) => nodes.map((n) => n.dataset.card));
  // Everyday is the language's frequency list: a server without one (a local state with only path-nl) has no such card.
  const expected = truth.common === null ? "words,week,ideas,time" : "words,week,ideas,everyday,time";
  assert(cards.join() === expected, `the cards: ${cards.join(", ") || "none"} (expected ${expected})`);
  // Your words, Everyday and Over time are whole cards that open their pages; This week and the ideas end with a button to theirs; "and N
  // more" opens Your words at This week.
  const doors = await page.locator('[data-part="page"] a[href^="#know/"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
  const DOORS = ["#know/words", "#know/everyday/words", "#know/time/more", "#know/words/week"];
  assert(doors.includes("#know/words") && doors.every((href) => DOORS.includes(href)), `links to other Knowledge pages: ${doors.join(", ") || "none"}`);
  const h = await page.evaluate(() => document.querySelector('[data-part="page"]').scrollHeight);
  await page.setViewportSize({ width: 390, height: Math.min(h + 120, 6000) });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, "shots", "01-knowledge.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  return cards.join(", ");
});
await stage("Your words: the pile, the number (the ones you know well) Home's tile shows, its space the same height at any count, nothing of where it lies kept on the device", async () => {
  await pileReady(page);
  const card = page.locator(`${board} [data-card="words"]`);
  const number = (await card.locator(".lx-know-n").innerText()).trim();
  assert(number === String(total) || number === total.toLocaleString("en"), `the card says ${number}, the sums ${total}`);
  const homeWords = home.find((tile) => tile.href === "#know" || tile.href === "#know/words")?.n;
  assert(!homeWords || homeWords === number, `Home's tile says ${homeWords}, the card ${number}`);
  const space = await card.locator('[data-part="word-pile"]').evaluate((n) => ({ h: Math.round(n.getBoundingClientRect().height), canvas: Boolean(n.querySelector("canvas")) }));
  assert(space.canvas, "no pile drawn");
  assert(space.h === truth.height, `the pile's space is ${space.h} px, not the fixed ${truth.height}`);
  // Each visit's pile is its own: nothing of where its tiles lie is kept (lx.know.pile.v2 kept every tile's place until 9 Nov 2026).
  const kept = await page.evaluate((lang) => [localStorage.getItem(`lx.know.pile.v2:${lang}`), localStorage.getItem(`lx.know.pile.v3:${lang}`)], truth.lang);
  assert(kept[0] === null, "the old kept pile (lx.know.pile.v2) is still on the device");
  assert(!kept[1] || !/"at"/.test(kept[1]), `the pile's places are kept: ${kept[1].slice(0, 80)}`);
  assert((await drawn(page)) > 0, "the canvas is blank");
  await card.screenshot({ path: join(OUT, "shots", "02-your-words.png") });
  return `${number} words, ${space.h} px`;
});
await stage("a new visit (the tab left and come back to, twice): the whole pile falls in from above the card, every word you've started on it, laid out anew each time (two visits, two piles), the number the same from the first frame", async () => {
  const visits = [];
  for (let k = 0; k < 2; k++) {
    await page.evaluate(() => (globalThis.__lxPileFrames = []));
    await tab(page, "#today");
    await page.waitForTimeout(800);
    await watch(page);
    await tab(page, "#know");
    await page.waitForFunction(() => globalThis.__knowWatch.states.at(-1) === "ready" && globalThis.__knowWatch.states.includes("moving"), null, { timeout: 60_000 });
    const w = await watched(page);
    const frames = await page.evaluate(() => {
      const all = globalThis.__lxPileFrames ?? [];
      globalThis.__lxPileFrames = undefined;
      const first = all.find((f) => f.boxes.length);
      const last = all.at(-1);
      const ys = (f) => Array.from({ length: f.boxes.length / 5 }, (_, i) => f.boxes[i * 5 + 1]);
      return { count: all.length, firstLowest: first ? Math.max(...ys(first)) : null, firstDrawn: first ? first.boxes.length / 5 : 0, rest: last ? Array.from(last.boxes) : [], seed: last?.seed ?? null };
    });
    visits.push({ w, frames });
    assert(w.states.includes("moving"), `visit ${k + 1}: it never dropped: ${w.states.join(" → ")}`);
    assert(frames.firstLowest !== null && frames.firstLowest < 0, `visit ${k + 1}: the first words drawn weren't above the card (the lowest at ${frames.firstLowest} px)`);
    assert(frames.rest.length / 5 === truth.started.length, `visit ${k + 1}: ${frames.rest.length / 5} tiles at rest for ${truth.started.length} words started`);
    assert(w.numbers.length <= 1, `visit ${k + 1}: the number moved: ${w.numbers.join(" → ")}`);
  }
  const [a, b] = visits.map((v) => v.frames.rest);
  let moved = 0;
  for (let i = 0; i < a.length; i += 5) if (Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]) > 6) moved++;
  const share = moved / (a.length / 5);
  assert(visits[0].frames.seed !== visits[1].frames.seed && share > 0.6, `two visits, the same pile: ${Math.round(share * 100)}% of the words elsewhere (seeds ${visits.map((v) => v.frames.seed).join(", ")})`);
  return `${truth.started.length} words each time, ${Math.round(share * 100)}% elsewhere the second time; ${visits.map((v) => v.w.states.join(" → ")).join("; ")}`;
});
await stage("coming back with nothing changed: the same page at once (the same nodes, no long task), the pile dropping in again and counting nothing", async () => {
  // The page whole first: its cards come after the pile (know/page.js marks the board when every one is in).
  await page.waitForFunction(() => document.querySelector(".lx-know-board[data-drawn]"), null, { timeout: 30_000 });
  await page.evaluate(() => document.querySelectorAll(".lx-know-board > [data-card]").forEach((n) => (n.dataset.checkMark = "kept")));
  const before = await drawn(page);
  await tab(page, "#today");
  await page.waitForTimeout(3000);
  await watch(page);
  await tab(page, "#know");
  await page.waitForFunction(() => globalThis.__knowWatch.states.at(-1) === "ready", null, { timeout: 30_000 });
  await page.waitForTimeout(400);
  const w = await watched(page);
  const kept = await page.evaluate(() => [...document.querySelectorAll(".lx-know-board > [data-card]")].map((n) => n.dataset.checkMark === "kept"));
  assert(kept.length && kept.every(Boolean), `cards drawn again: ${kept.map((k) => (k ? "kept" : "new")).join(", ")}`);
  assert(w.states.includes("moving"), `the pile didn't drop in again: ${w.states.join(" → ") || "nothing"}`);
  assert(w.numbers.length <= 1, `the number moved: ${w.numbers.join(" → ")}`);
  const long = w.long.filter((ms) => ms > 120);
  assert(!long.length, `long tasks coming back: ${long.join(", ")} ms`);
  const after = await drawn(page);
  return `same nodes; ${w.states.join(" → ")}; drawn ${before === after ? "the same (?)" : "a new pile"}`;
});
await stage("two fingers zoom into the pile and it springs back; a tap opens Your words, every word on its shelves", async () => {
  const pile = page.locator(`${board} [data-part="word-pile"]`);
  await pile.scrollIntoViewIfNeeded();
  const box = await pile.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height * 0.55;
  const before = await drawn(page);
  const touch = (type, spread) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 }] });
  await touch("touchStart", 30);
  for (let k = 1; k <= 24; k++) {
    await touch("touchMove", 30 + k * 4);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(300);
  const pinched = await drawn(page);
  await page.screenshot({ path: join(OUT, "shots", "03-pinched.png") });
  await touch("touchEnd", 0);
  await page.waitForTimeout(900);
  const back = await drawn(page);
  assert(pinched !== before, "the pinch drew nothing new");
  assert(back === before, "it didn't spring back to the whole pile");
  assert((await page.evaluate(() => location.hash)) === "#know", "the pinch opened something");
  await pile.tap();
  await page.waitForFunction(() => location.hash === "#know/words", null, { timeout: 5_000 });
  await page.waitForTimeout(800);
  const shelves = await page.locator('[data-part="word-shelf"]').count();
  const tiles = await page.locator('[data-part="word-tile"]').count();
  assert(shelves > 0 && tiles > 0 && tiles <= total, `${shelves} shelves, ${tiles} tiles for ${total} words`);
  await page.screenshot({ path: join(OUT, "shots", "04-your-words-page.png") });
  await go(page, "#know");
  return `${shelves} shelves, ${tiles} tiles`;
});
await stage("back from Your words, by the floating Back and by a swipe from the edge: the pile is there in every frame, never empty", async () => {
  const said = [];
  const empty = [];
  for (const way of ["Back", "swipe"]) {
    await go(page, "#know");
    await pileReady(page);
    await page.locator(`${board} [data-card="words"]`).tap();
    await page.waitForFunction(() => location.hash === "#know/words", null, { timeout: 5_000 });
    await page.waitForTimeout(1000);
    // Every frame from here: each pile on the screen (the page's own, or a picture of it in a move), and whether it's empty (nothing drawn
    // along its floor, where any pile has tiles).
    await page.evaluate(() => {
      const w = (globalThis.__pileFrames = []);
      const until = performance.now() + 1800;
      const frame = () => {
        const canvases = [...document.querySelectorAll("canvas.lx-pile-canvas"), ...(globalThis.__roots ?? []).flatMap((root) => [...root.querySelectorAll("canvas.lx-pile-canvas")])];
        let shown = 0;
        let blank = 0;
        for (const canvas of canvases) {
          if (!canvas.isConnected || !canvas.width || !canvas.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
          const box = canvas.getBoundingClientRect();
          if (box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth) continue;
          shown++;
          const band = canvas.getContext("2d").getImageData(0, Math.max(0, canvas.height - Math.round(canvas.height * 0.08)), canvas.width, 3).data;
          let ink = 0;
          for (let i = 3; i < band.length; i += 4) ink += band[i];
          if (!ink) blank++;
        }
        w.push({ shown, blank, hash: location.hash });
        if (performance.now() < until) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    if (way === "Back") await page.locator(".lx-back").filter({ visible: true }).first().tap();
    else {
      const touch = (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: 430 }] });
      await touch("touchStart", 4);
      for (let k = 1; k <= 14; k++) {
        await touch("touchMove", 4 + (300 * k) / 14);
        await page.waitForTimeout(16);
      }
      await touch("touchEnd", 304);
    }
    await page.waitForTimeout(1900);
    const frames = await page.evaluate(() => globalThis.__pileFrames);
    const blank = frames.filter((f) => f.blank).length;
    const withPile = frames.filter((f) => f.shown).length;
    if ((await page.evaluate(() => location.hash)) !== "#know") {
      empty.push(`${way} didn't go back to Knowledge`);
      continue;
    }
    said.push(`${way}: ${withPile} frames with a pile, ${blank} empty`);
    if (blank) empty.push(`${way}: ${blank} of ${frames.length} frames show an empty pile`);
    if (!withPile) empty.push(`${way}: no frame showed the pile at all`);
  }
  assert(!empty.length, empty.join("; "));
  return said.join("; ");
});
await stage("This week: Home's number of things done, a glass a day, and Home's tile opens the page at this card", async () => {
  const homeDone = home.find((tile) => tile.href === "#know/days")?.n;
  const card = page.locator(`${board} [data-card="week"]`);
  const number = (await card.locator(".lx-know-n").first().innerText()).trim();
  assert(!homeDone || homeDone === number, `Home's tile says ${homeDone}, the card ${number}`);
  const glasses = await card.locator(".lx-glass-col").count();
  assert(glasses === 7, `${glasses} days`);
  await go(page, "#know/days");
  await page.waitForTimeout(500);
  const top = await page.evaluate(() => {
    const node = [...document.querySelectorAll('[data-card="week"]')].find((n) => n.getClientRects().length);
    return node ? Math.round(node.getBoundingClientRect().top) : null;
  });
  assert(top !== null && top >= 0 && top < 220, `Home's link opens the page with this week at ${top} px`);
  await page.screenshot({ path: join(OUT, "shots", "05-this-week.png") });
  await go(page, "#know");
  return `${number} things done; opened at ${top} px`;
});
await stage("Everyday: the commonest words as ten hundreds, each bar filled as far as its words are yours and the one you're on outlined, that hundred as a page, yours in ink and the rest blank, and Learn the next common words", async () => {
  if (truth.common === null) return "no frequency list on this server";
  const card = page.locator(`${board} [data-card="everyday"]`);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000); // its arrival plays out
  // In ink: the words you understand well (know/word-index.js isUnderstood, with your word bank), as the strip's `yours` says.
  const shown = await everydayShown(page);
  const wrong = everydayAgrees(shown, truth.everyday);
  assert(!wrong.length, wrong.join("; "));
  assert(await card.getByRole("button", { name: "Learn the next common words" }).count(), "no way to learn the next");
  return `${shown.range}, ${shown.count}; the hundreds ${truth.everyday.shares.map((x) => Math.round(x * 100)).join(" ")}%`;
});
await stage("Everyday moves on to the next hundred once eight in ten of the one you're on are yours: 79 of the first stays on Words 1–100, 80 is Words 101–200 (words put in the word bank make them yours; taken out after)", async () => {
  if (truth.common === null) return "no frequency list on this server";
  const first = truth.everyday.first;
  const yours = first.filter((c) => c.yours).length;
  if (yours > 79) return `skipped: ${yours} of the first hundred are this learner's already`;
  const missing = first.filter((c) => !c.yours).map((c) => c.lemma);
  const added = [];
  const bankTo = async (n) => {
    // Up to n of the first hundred yours, by the word bank (read/bank.js addWord), then the page drawn fresh.
    await page.evaluate(async ({ words }) => {
      const { addWord } = await import("/js/read/bank.js");
      for (const lemma of words) addWord("nl", lemma, { quiet: true });
    }, { words: missing.slice(added.length, n - yours) });
    added.push(...missing.slice(added.length, n - yours));
    await page.reload();
    await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
    await go(page, "#know");
    await page.waitForFunction(() => document.querySelector('[data-part="page"] .lx-know-board [data-card="everyday"] .lx-hundred-range'), null, { timeout: 30_000 });
    await page.locator(`${board} [data-card="everyday"]`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    const want = (await sums(page)).everyday;
    const shown = await everydayShown(page);
    return { want, shown, wrong: everydayAgrees(shown, want) };
  };
  try {
    const at79 = await bankTo(79);
    assert(at79.want.on === 0 && !at79.wrong.length && at79.shown.range === "Words 1–100", `79 of the first hundred: ${at79.shown.range}, ${at79.shown.count}; ${at79.wrong.join("; ")}`);
    const at80 = await bankTo(80);
    assert(at80.want.on === 1 && !at80.wrong.length && at80.shown.range === "Words 101–200", `80 of the first hundred: ${at80.shown.range}, ${at80.shown.count}; ${at80.wrong.join("; ")}`);
    await page.locator(`${board} [data-card="everyday"]`).screenshot({ path: join(OUT, "shots", "04b-everyday-101.png") });
    return `79 yours: ${at79.shown.range} (${at79.shown.count}); 80: ${at80.shown.range} (${at80.shown.count}), the first bar full ${at80.shown.bars[0].fill.toFixed(2)} and the second outlined`;
  } finally {
    await page.evaluate(async ({ words }) => {
      const { removeWord } = await import("/js/read/bank.js");
      for (const lemma of words) removeWord("nl", lemma);
    }, { words: added });
    await page.reload();
    await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
    await go(page, "#know");
  }
});
await stage("the ideas you've met: the least known four on the card, each drawn on a sentence of yours and opening its sheet; See all opens every one on its page", async () => {
  const card = page.locator(`${board} [data-card="ideas"]`);
  const ideas = card.locator('[data-part="idea-card"]');
  const shown = Math.min(4, truth.ideas);
  const came = await until(async () => (await ideas.count()) === shown);
  assert((await ideas.count()) === shown, `${await ideas.count()} ideas on the card for ${truth.ideas} met (the card shows ${shown}), 10 s after the page settled`);
  const pictures = await card.locator('[data-part="idea-card"] .lx-idea-picture').evaluateAll((nodes) => nodes.filter((n) => n.childElementCount).length);
  assert(pictures === shown, `${pictures} pictures for ${shown} ideas`);
  const noted = await page.evaluate(async () => {
    const [{ notesNow }, { ITEMS }] = await Promise.all([import("/js/study/notes.js"), import("/js/study/content.js")]);
    return ITEMS.filter((item) => Object.keys(notesNow(item)?.marks ?? {}).length).length;
  });
  const lit = await card.locator('[data-part="idea-card"] .lx-rule-word[data-lit]').count();
  if (noted) assert(lit > 0, `no idea's picture lights a word (${noted} sentences have notes)`);
  await ideas.first().click();
  await sheet(page).waitFor({ timeout: 5_000 });
  await closeSheet(page);
  let all = shown;
  const seeAll = card.getByRole("button", { name: /^See all/ });
  if (truth.ideas > shown) {
    assert(await seeAll.count(), "no way to every idea");
    await seeAll.click();
    await page.waitForFunction(() => location.hash === "#know/ideas", null, { timeout: 5_000 });
    await page.waitForTimeout(800);
    all = await page.locator('.lx-ideas-page [data-part="idea-card"]').count();
    assert(all === truth.ideas, `the ideas' page has ${all} for ${truth.ideas} met`);
    await page.screenshot({ path: join(OUT, "shots", "05b-ideas-page.png") });
    await go(page, "#know");
  } else assert(!(await seeAll.count()), "See all with nothing more to see");
  return `${shown} on the card ${came} ms after the page settled, ${all} on the page, ${lit} words lit${noted ? "" : " (no notes on this server)"}`;
});
await stage("Over time: the chart, with the words that were milestones on it", async () => {
  const card = page.locator(`${board} [data-card="time"]`);
  const came = await until(async () => (await card.locator(".lx-time-chart").count()) > 0);
  assert(await card.locator(".lx-time-chart").count(), "no chart, 10 s after the page settled");
  const marks = await card.locator(".lx-time-mark").count();
  assert(total < 10 || marks > 0, `${total} words and no milestone on the chart`);
  return `${marks} milestones; the chart there ${came} ms after the ideas`;
});
await stage("every control on the cards answers a 44 px press (a link in a sentence exempt)", async () => {
  const small = await page.evaluate(() => {
    const out = [];
    for (const node of document.querySelectorAll(".lx-know-board button, .lx-know-board a")) {
      if (!node.getClientRects().length) continue;
      if (node.tagName === "A" && node.closest("p, [data-part='credit'], .lx-credit, .lx-know-credit")) continue;
      const box = node.getBoundingClientRect();
      const reach = getComputedStyle(node, "::before");
      const extra = reach.content !== "none" && reach.position === "absolute" ? Math.max(0, -parseFloat(reach.top) || 0) * 2 : 0;
      const w = box.width + (reach.content !== "none" ? Math.max(0, -parseFloat(reach.left) || 0) * 2 : 0);
      if (Math.min(w, box.height + extra) < 44) out.push(`${node.dataset.part ?? node.tagName} ${Math.round(w)}×${Math.round(box.height + extra)}`);
    }
    return out;
  });
  assert(!small.length, `under 44 px: ${small.slice(0, 6).join("; ")}`);
});
await context.close();

// ---------- a brand-new account ----------
await stage("a brand-new account: the way to start, and no cards", async () => {
  const fresh = await newAccount("Knowledge Fresh");
  await go(fresh.page, "#know");
  const cards = await fresh.page.locator(`${board} > [data-card]`).count();
  const start = await fresh.page.getByRole("button", { name: "Start your first session" }).count();
  assert(start === 1, "no way to start");
  assert(cards === 0, `${cards} cards on a new account`);
  await fresh.page.screenshot({ path: join(OUT, "shots", "06-new-account.png") });
  await fresh.context.close();
});

await browser.close();
if (errors.length) {
  failed++;
  console.log(`FAIL  no page errors: ${errors.slice(0, 3).join(" | ")}`);
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
