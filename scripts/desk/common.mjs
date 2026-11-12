// desk-check's runner state and helpers (lx-app's: the arguments, the browser, stage(), every helper a stage uses, and the registries the
// lane files fill). scripts/desk-check.mjs runs the stages; each lane's are in its own file here.
import { chromium } from "../quiet-browser.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { knowWords } from "../fixtures/know-words.mjs";
import { answerStep, SESSION } from "../fixtures/play-session.mjs";

export const argv = process.argv.slice(2);
export const [BASE_URL, outArg] = argv;
export const OUT = outArg && resolve(outArg);
export const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
export const ONLY = opt("only") ? new RegExp(opt("only")) : null;
export const FROM = opt("from") ? resolve(opt("from")) : null;
export const BEFORE = opt("base") ? resolve(opt("base")) : null;
// The phones stage's screens to compare, for proving one (--screens reader): the others are left out, and the stage says so.
export const SCREENS = opt("screens") ? new RegExp(opt("screens")) : null;
// This copy: the phones' side to compare, served the same way as --base's (from the files, not the server), so only the files differ.
export const HERE = resolve(fileURLToPath(new URL("../..", import.meta.url)));
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL ?? "") || !OUT || !BEFORE || !existsSync(join(BEFORE, "public"))) {
  console.error("Usage: node scripts/desk-check.mjs http://localhost:<port> <outDir> --base <copy dir> [--only <regex>] [--from <copy dir>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
setTimeout(() => {
  console.error("desk-check: ceiling of 40 minutes");
  process.exit(3);
}, 40 * 60_000).unref();

export const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
export const results = [];
export const assert = (cond, what) => {
  if (!cond) throw new Error(what);
};

export async function stage(name, fn) {
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

export const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
// Animations off and no caret, the same on both sides of a comparison: a picture that differs is the code's doing.
// Tinta out of the picture too (his eyes follow the last touch, so two runs never draw him alike), his room kept.
// And a session's progress bar: its steps share the bar's width beside the count ("1/6"), which a face arriving a moment earlier or later
// makes a fraction of a pixel wider, so two runs of the same files end its fill apart. (Animations stay on: the motion system cleans up
// after each move as it ends.)
export const STILL = '*, *::before, *::after { caret-color: transparent !important; } :is([data-part="character"], [data-part="session-progress"]) { visibility: hidden !important; }';
// Two runs of the same files differ by raster rounding alone, at most 2 of 255 in a channel (8 Nov: 135 pixels at the flag's corners, the
// tab bar's glass); a pixel counts as changed past this, which any change of layout, type or color is by far.
export const PIXEL_NOISE = 8;
// And a few pixels of an edge drawn apart (a circle's rim on a layer the compositor kept on one side and not the other: 5 pixels, 53 at
// most): a screen counts as changed past 16 such pixels, or any pixel moved past 64, which a change of the code's is many times over.
export const NOISE_PIXELS = 16;
export const NOISE_MOST = 64;
// A drawing (an inline svg: a game's word picture or icon, Study's path strip, a stop of the path) has an allowance of its own, by its size
// (drawnAllowance), each pixel NOISE_MOST at most: with the very same files and every box in the very same place on both sides, a drawing's own edges come out a few
// pixels apart most runs (11 Nov 2026, twenty-seven runs of four screens with the same files both sides: none in a third of the runs, 2 to 13
// pixels in most, once 16 round the "?" on a result, once 37 along the sides of a patch drawn again inside one picture; 53 of 255 at most).
// The screen's allowance of 16 sat right at that: the "?" ring's 16 and one pixel of a tile's corner made a screen 17 and the stage red on a
// landing that couldn't reach it. Drawing everything again at rest didn't change it, and it isn't told by strength: a drawing's lines moved
// one pixel differ by 63 at most too, but in 978 to 3,624 pixels (the stage's own control, measured on each of the eight screens). So a
// drawing is held by its place and size to the hundredth of a pixel (drawingsOf) and its own pixels by the count; the stage proves both on
// every game's screen each run: a drawing moved one pixel, and the lines of its smallest drawing moved one pixel inside its box.
// The allowance goes by the drawing's size (three tenths of its box's width and height together, in the picture's pixels, 64 at the
// least): Study's path strip, 358 by 46 on a phone, came out 84 pixels apart once on another lane's landing with the same files (a third of
// its allowance); a word's picture 37 (of 205); the ring 16 (of 64). A real move is the other side by as much again or far more: the
// ring's 153, the smallest icon's 88, a picture's 2,824.
export const NOISE_DRAWN = 64;
export const drawnAllowance = (box) => Math.max(NOISE_DRAWN, Math.round(0.3 * (box.r - box.x + box.b - box.y)));
export const FIXED = new Date();

/** A context's /js and /css from another copy's files (--from, or a comparison's side). */
export async function serveFiles(context, files) {
  await context.route(/\/(js|css)\/.*\.(js|css)(\?.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = join(files, "public", path);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ status: 200, contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body: readFileSync(file) });
  });
}

/** A device with a new account (a virtual passkey). touch: a finger (an iPad's agent from 700 wide); files: another copy whose /js and /css it's served. */
export async function device({ width, height, touch = false, files = FROM, still = false }) {
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

export const go = async (page, hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(900);
};
export const box = (page, selector) =>
  page.evaluate((s) => {
    const node = document.querySelector(s);
    if (!node || !node.checkVisibility({ visibilityProperty: true })) return null;
    const r = node.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) };
  }, selector);
export const PILL = '[data-part="app"] > [data-part="app-header"] > [data-part="app-back"]';
export const SIDEBAR = '[data-part="app"] > [data-part="tab-bar"]';
export const pillText = (page) => page.evaluate((s) => document.querySelector(s)?.textContent.trim() ?? null, PILL);

export const WIDE = [
  { width: 1024, height: 768, touch: false, name: "1024" },
  { width: 1180, height: 820, touch: true, name: "1180-ipad" },
  { width: 1440, height: 900, touch: false, name: "1440" },
];


export const TYPED = "I would like a coffee";
export const LONG = "I would like a coffee with milk and a little sugar please, and then a glass of water, because it is very warm today and we have walked a long way through the old town to the station and back again before the train left for the coast";
export const answered = (page) =>
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
export const openTranslate = async (page, touch, text) => {
  await go(page, "#today");
  const field = page.locator('[data-part="translate-field"] textarea').first();
  await (touch ? field.tap() : field.click());
  await page.waitForTimeout(500);
  await page.keyboard.type(text, { delay: 15 });
  assert(await answered(page), `no answer for "${text.slice(0, 30)}…" within 60 s`);
  await page.waitForTimeout(600);
};
export const translateNow = (page) =>
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


/** The session on the screen, if any, ended (Escape, as a keyboard ends one) and gone, so the next one opens on its own. */
export async function endSession(page) {
  if (!(await page.locator(SESSION).count())) return;
  await page.keyboard.press("Escape");
  await page.waitForFunction((S) => !document.querySelector(S), SESSION, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

// ---------- games: one block in the screen's middle ----------
export const STAGE = [
  { width: 744, height: 1133, touch: true, name: "744-ipad-mini" },
  { width: 820, height: 1180, touch: true, name: "820-ipad" },
  { width: 1180, height: 820, touch: true, name: "1180-ipad" },
  { width: 1024, height: 768, touch: false, name: "1024" },
  { width: 1440, height: 900, touch: false, name: "1440" },
  { width: 1920, height: 1080, touch: false, name: "1920" },
];
// Games of every shape: a word and its choices (see), a sentence and its choices (choose), a gap (fill), pairs (match), tiles (arrange), a card.
export const STAGE_GAMES = ["see", "choose", "fill", "match", "arrange", "card"];
export const KEYED = new Set(["see", "choose", "fill"]);
// A choice's number as its ::after's content: the counter (or its value).
export const shownNumber = (content) => /counter\(|^"\d+"$/.test(content);
/** Where a session's step and its bar are: the step's parts (Tinta aside), its game's, the bar, the forward button, each number's look. */
export const stageNow = (page) =>
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


/** A picture of the page once it's settled: its faces and pictures in, nothing said for 1.5 s, every move that ends ended, and two
 *  pictures 400 ms apart the same (a flag or a face arriving late drew a frame differently, 8 Nov). Up to 8 s, then the last one. */
export async function steady(page) {
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

export const noise = []; // the edges drawn apart that were let pass, said in the stage's result
/** Two pictures the same, pixel for pixel; else how many differ, and a picture of where. skip: boxes in the pictures' own pixels ({ x, y, r, b })
 *  left out (a book's photo, compared by its place and size instead: photosOf). places: boxes whose own pixels are held to a drawing's
 *  allowance each (NOISE_DRAWN; a game's drawings, compared by their place too: drawingsOf), the rest of the screen to its own. */
export async function samePixels(a, b, name, skip = [], places = []) {
  const [one, two] = await Promise.all([sharp(a).raw().toBuffer({ resolveWithObject: true }), sharp(b).raw().toBuffer({ resolveWithObject: true })]);
  if (one.info.width !== two.info.width || one.info.height !== two.info.height) return `${name}: ${one.info.width}×${one.info.height} against ${two.info.width}×${two.info.height}`;
  const channels = one.info.channels;
  const marks = Buffer.alloc(one.info.width * one.info.height);
  const out = skip.length ? Buffer.alloc(one.info.width * one.info.height) : null;
  for (const box of skip) for (let y = Math.max(0, box.y); y < Math.min(one.info.height, box.b); y++) out.fill(1, y * one.info.width + Math.max(0, box.x), y * one.info.width + Math.min(one.info.width, box.r));
  // Whose each pixel is: a drawing's (the smallest it's in, so an icon on a picture is the icon's) or the screen's own (0).
  const owner = places.length ? new Uint16Array(one.info.width * one.info.height) : null;
  const order = places.map((box, i) => ({ box, i })).sort((x, y) => (y.box.r - y.box.x) * (y.box.b - y.box.y) - (x.box.r - x.box.x) * (x.box.b - x.box.y));
  for (const { box, i } of order) for (let y = Math.max(0, box.y); y < Math.min(one.info.height, box.b); y++) owner.fill(i + 1, y * one.info.width + Math.max(0, box.x), y * one.info.width + Math.min(one.info.width, box.r));
  const drawnApart = new Array(places.length).fill(0); // each drawing's own pixels past raster rounding
  let differ = 0; // the screen's own
  let most = 0;
  let drawnMost = 0;
  for (let i = 0, p = 0; i < one.data.length; i += channels, p++) {
    if (out?.[p]) continue;
    let by = 0;
    for (let c = 0; c < channels; c++) by = Math.max(by, Math.abs(one.data[i + c] - two.data[i + c]));
    if (by <= PIXEL_NOISE) continue;
    marks[p] = 255;
    if (owner?.[p]) {
      drawnApart[owner[p] - 1]++;
      drawnMost = Math.max(drawnMost, by);
    } else {
      differ++;
      most = Math.max(most, by);
    }
  }
  const inDrawings = drawnApart.reduce((sum, n) => sum + n, 0);
  const inOne = Math.max(0, ...drawnApart);
  if (process.env.DESK_DEBUG) console.log(`    samePixels ${name}: ${differ} of the screen's own (${most} at most); ${inDrawings} inside ${drawnApart.filter(Boolean).length} of ${places.length} drawings, ${inOne} in one (${drawnMost} at most)`);
  // A drawing's own edges: a few pixels drawn apart, each by a blend, for its size (drawnAllowance); more is its lines moved.
  const over = places.map((box, i) => drawnApart[i] - drawnAllowance(box));
  if (over.some((by) => by > 0) || drawnMost > NOISE_MOST) {
    await sharp(marks, { raw: { width: one.info.width, height: one.info.height, channels: 1 } }).png().toFile(join(OUT, `${name}-differ.png`));
    const worst = over.indexOf(Math.max(...over));
    return `${name}: ${drawnApart[worst]} pixels of one drawing differ by more than ${PIXEL_NOISE} (${inDrawings} in ${drawnApart.filter(Boolean).length} drawings, at most ${drawnMost}; that drawing's edges are let ${drawnAllowance(places[worst])}, each ${NOISE_MOST} at most; ${name}-differ.png)`;
  }
  if (inDrawings) noise.push(`${name}: ${inDrawings} px inside ${drawnApart.filter(Boolean).length} drawing${drawnApart.filter(Boolean).length === 1 ? "" : "s"} (${inOne} in one), ${drawnMost} at most`);
  if (!differ) return null;
  if (differ <= NOISE_PIXELS && most <= NOISE_MOST) {
    noise.push(`${name}: ${differ} px, ${most} at most`);
    // Where they were drawn apart, kept to look at (and, with DESK_KEEP_NOISE set, both pictures).
    await sharp(marks, { raw: { width: one.info.width, height: one.info.height, channels: 1 } }).png().toFile(join(OUT, `${name}-noise.png`));
    if (process.env.DESK_KEEP_NOISE) {
      writeFileSync(join(OUT, `${name}-noise-now.png`), a);
      writeFileSync(join(OUT, `${name}-noise-before.png`), b);
    }
    return null;
  }
  await sharp(marks, { raw: { width: one.info.width, height: one.info.height, channels: 1 } }).png().toFile(join(OUT, `${name}-differ.png`));
  return `${name}: ${differ} pixels differ by more than ${PIXEL_NOISE} (at most ${most}; ${name}-differ.png)`;
}

// A learner weeks in (the sample learner, study/sample-mode.js), made from this server's Dutch course: Home, Study, Explore and Knowledge with
// everything they show.
export async function weeksIn(page) {
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
export const MAIN_TABS = ["#today", "#study", "#explore", "#know"];
// A computer's block button (components.css, frame.md rule 4, 11 Nov 2026): on the page itself and in its cards (not a session, a sheet, a
// dialog or the reader, whose boxes are blocks of their own) as wide as its words, 240 to 360 px (narrower only where its box is), at its box's
// start edge or centered in it. Each fault said with the button's words.
export const BUTTON_RULE = () => {
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
export const TITLE_X = () => {
  const t = document.querySelector('[data-part="app-title"]');
  return t && t.checkVisibility() ? Math.round(t.getBoundingClientRect().left) : null;
};
// The pages in the wide column at 1280 and up (shell/main.js WIDE_PAGES): the grids. Their lists and forms, Home and Settings keep the 720.
export const WIDE_GRIDS = []; // filled by the lane files (desk/*.mjs), each entry [route, name]
// A tab's own page in two columns, its main column and an aside (frame.md §1: Home, the AI section), filled by the lane files: { route, name,
// grid (the two columns' box, inside the page's view; grid ":scope": the view itself), aside (its child that's the aside), ready? (an async
// (page) that sets the page up first) }.
export const WIDE_ASIDES = [];



// Every control answers a touch over 44 × 44 px on a tablet too, where component-check's walk of the pages doesn't go: the sign-in page, a learner
// weeks in (Home, Study with its settings gear, Knowledge with its word tiles), every game's question and its result, Study cards, and a book in
// the reader. component-check's measure: each control brought to the middle and hit-tested out from its center, so an invisible ::before reach
// counts and anything over it (the page's header) doesn't; words and links in running text are exempt (WCAG 2.5.8's inline exception), and so is
// a gap you type into, which is its sentence's line (Type in the gap, Hear the gap). A link's line is its text beside it, a word of its own or an
// inline label like the reader's credits' "From: " before StoryWeaver, never another control (sign-in's Privacy beside Terms). On 8 Nov sign-in's
// "Terms" reached 42 and Study's gear 41 (the header over its top 3 px).
export const TARGET_GAMES = ["choose", "arrange", "place", "fill", "meaning", "match", "type", "type-word", "type-gap", "hear-gap", "see", "word", "translate", "listen", "say", "repeat", "say-word", "repeat-word"];
export const SMALL_TARGETS = (MIN) => {
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


// ---------- reading lines (E): at most ~68 characters ----------
// The reading measure (tokens.css --measure, min(31em, 640px): ~68 characters of Instrument Sans at 12–16 px) on the text itself, left where its
// column starts: at 1024 and 1440 by mouse, a learner weeks in, each page of running text the walk found long (8 Nov 2026: 99–118 characters
// a line) has no line of reading text over 72 characters, counted as read (each text node's line boxes, its own font's average character, not
// "ch", which is this font's 0 at 0.67em); a page's line under its title starts where its column does. (Everyday's hundreds, a run of single
// words, aren't lines to read.)
export const READING_LINES = () => {
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

export const NARROW = []; // filled by the lane files (desk/*.mjs), each entry [route, name]
// A grid on the page: how many of its items are in its first row.
export const IN_A_ROW = (selector) => {
  const grid = [...document.querySelectorAll(`[data-part="page"] ${selector}`)].find((node) => node.checkVisibility());
  const items = grid ? [...grid.children].filter((node) => node.getBoundingClientRect().height > 0) : [];
  const top = items[0]?.getBoundingClientRect().top;
  return items.filter((node) => Math.abs(node.getBoundingClientRect().top - top) < 2).length;
};



export const PHONE_GAMES = ["see", "fill"];
// The Knowledge tab on a phone, for the phones stage: its top (the pile's card), This week brought to the top (its glasses, what it's made of,
// its new words and its button, which a computer's board lays out in two columns), and the Ideas page. Two things on the tab aren't in the
// pictures: the pile's own tiles, which hold their place (every visit lays them out anew from a seed of its own, know/cards.js freshSeed,
// crypto's, so two sides never match; the pile itself is pile-drop-check's), and the tab's idea cards, which are taken out whole (each is
// built a little at a time before it's on the page, and its sentence is sized to its line only if no frame passes in between,
// study/concept-picture.js, so the same files can draw it a step apart: 11 Nov 2026, one side at 1.05 on one line, the other at 1.1 on
// two; hidden but in their place they still moved what's under them by a line, about every other run). The Ideas page builds its cards
// at once, and has them.
export const KNOW_BOARD = '[data-part="page"]:not([data-ghost]) .lx-know-board';
export const NO_PILE = '.lx-pile-canvas { visibility: hidden !important; } .lx-know-board [data-card="ideas"] { display: none !important; }';
export const toKnowCard = async (page, card) => {
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "start" }), `${KNOW_BOARD} [data-card="${card}"]`);
  await page.waitForTimeout(800);
};
export const EXPLORE_PAGE = '[data-part="page"]:not([data-ghost])';
// A book's photos on the reader's screen: each one shown (what's under its middle is the photo itself, so one under a page's cover doesn't count),
// by where it is, how large it's drawn and its file's own size. Their own pixels are left out of the pixel comparison: one photo scaled
// twice comes out a few dots apart with the very same files both sides (8 Nov 2026: 347 pixels inside the photo at 390; 11 Nov: 126 to 347 on
// every lane's landing, a different count each run, never outside the photo), so a photo is compared by its place and size, and everything
// around it pixel for pixel. The stage proves both halves each run: a word moved one pixel and a photo moved one pixel are each caught.
// The screens with photos: where its photos are, and a word of its own to move for the control. Read's shelf has the same photos as covers.
export const PHOTO_SCREENS = {
  reader: { photos: '[data-part="reader"] img', word: '[data-part="reader"] > [data-part="reader-text"] .lx-w' },
  read: { photos: '[data-part="page"]:not([data-ghost]) [data-part="book-cover"] img:not([data-part="language-flag"])', word: '[data-part="page"]:not([data-ghost]) :is([data-part="continue-card"] h2, [data-part="section-title"])' },
};
export const photosOf = (page, selector = PHOTO_SCREENS.reader.photos) =>
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
export const placed = (photos) => JSON.stringify(photos.map((photo) => [photo.loaded, photo.file, photo.at]));
// A screen's drawings (the inline svgs that are shown: a game's word pictures and icons, Study's path strip and its games' art, the path's
// stops), each by where it is and how large, and its box in the picture's own pixels (a pixel wider all round). Not a drawn edge
// (svg.lx-edge: a card's or a door's outline, whose box holds the card's own words, which stay the screen's to compare).
export const DRAWN = 'svg:not(.lx-edge)';
// The screens that have them, each with the root its drawings are under: a lane names its own (DRAWN_SCREENS[name] = selector).
export const DRAWN_SCREENS = {};
export const drawingsOf = (page, within) =>
  page.evaluate(({ within, DRAWN }) =>
    [...document.querySelectorAll(`${within} ${DRAWN}`)]
      .filter((svg) => !svg.parentElement.closest("svg") && svg.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
      .map((svg) => ({ svg, box: svg.getBoundingClientRect() }))
      .filter(({ box }) => box.width >= 1 && box.height >= 1 && box.right > 0 && box.left < innerWidth && box.bottom > 0 && box.top < innerHeight)
      .map(({ box }) => ({
        at: [box.left, box.top, box.width, box.height].map((n) => Math.round(n * 100) / 100),
        box: { x: Math.floor(box.left * devicePixelRatio) - 1, y: Math.floor(box.top * devicePixelRatio) - 1, r: Math.ceil(box.right * devicePixelRatio) + 1, b: Math.ceil(box.bottom * devicePixelRatio) + 1 },
      })),
    { within, DRAWN },
  );
export const drawn = (drawings) => JSON.stringify(drawings.map((drawing) => drawing.at));
/** One of a screen's drawings changed for a control and put back. how "moved": the drawing itself one pixel along, so its place changes;
 *  "lines": everything drawn in it one pixel along inside its box, which stays. */
export async function withDrawing(page, within, how, during) {
  const found = await page.evaluate(({ how, within, DRAWN }) => {
    // (The largest to move whole; the smallest, with something drawn in it, for its lines: the fewest pixels a real move can change. On the
    // screen: one scrolled off it draws nothing to compare.)
    const all = [...document.querySelectorAll(`${within} ${DRAWN}`)]
      .filter((svg) => {
        const b = svg.getBoundingClientRect();
        return !svg.parentElement.closest("svg") && svg.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && b.width >= 16 && svg.children.length && b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight && svg.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
      })
      .sort((x, y) => y.getBoundingClientRect().width - x.getBoundingClientRect().width);
    const shown = how === "moved" ? all[0] : all.at(-1);
    if (!shown) return false;
    const nodes = how === "moved" ? [shown] : [...shown.children];
    globalThis.__deskMoved = nodes.map((node) => [node, node.getAttribute("style")]);
    for (const node of nodes) {
      if (how === "moved") {
        node.style.position = "relative";
        node.style.left = "1px";
      } else node.style.transform = "translate(1px, 0)";
    }
    return nodes.length > 0;
  }, { how, within, DRAWN });
  if (!found) return null;
  await page.waitForTimeout(300);
  try {
    return await during();
  } finally {
    await page.evaluate(() => {
      for (const [node, style] of globalThis.__deskMoved ?? []) {
        if (style === null) node.removeAttribute("style");
        else node.setAttribute("style", style);
      }
      globalThis.__deskMoved = null;
    });
    await page.waitForTimeout(200);
  }
}
/** How many pixels inside these boxes two pictures draw apart (past raster rounding): what leaving a photo's own pixels out left out, said in the stage's result. */
export async function apartInside(a, b, boxes) {
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
export const AGAIN = new Set(["home", "settings", "translate"]);





export { SESSION, answerStep, chromium, existsSync, fileURLToPath, join, knowWords, mkdirSync, readFileSync, resolve, sharp, writeFileSync };

/** Each lane's phone screens ({ order, screens: [[name, act]] }), filled by desk/*.mjs at import; the phones stage takes them in order. */
export const PHONE_SCREENS = [];
export const phoneScreens = () => PHONE_SCREENS.slice().sort((a, b) => a.order - b.order).flatMap((entry) => entry.screens);
