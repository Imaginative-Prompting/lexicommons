// The Words card's pile dropped in on each visit (know/cards.js pileIn), on a 390 phone in Chrome, a new account that has started N words:
// - two visits in a row (Knowledge, Home, Knowledge) drop two different piles: every word falls in from above the card, and most lie elsewhere
//   the second time;
// - at rest, no two tiles overlap (each a turned rectangle, as drawn) and none is under the floor;
// - the biggest pile (2,500 words) with the processor slowed 4× (CDP): the pile's own work on a visit (laying it out, its sheets, the drop's plan:
//   cards.js's lx-pile-visit measures, one a task: laid out, then placed and dropped in the next frame) each under 50 ms, their sum beside it, no long
//   task from its start to its rest, no frame gap over 100 ms, at rest within 3 s (the page's own long
//   tasks on its first build reported beside it: the page from before has them too);
// - animations off (the system's reduced motion): the pile laid out at random and still (it never moves), two loads two piles;
// - a new theme: the tiles in its paints and on its ground. Words only started are outlines, each the page's ground inside its paint; counted
//   on the pile's own canvas, after the theme is changed from Settings (Knowledge kept off the screen) and back on Knowledge, and again
//   changed with Knowledge on the screen, no pixel is the old theme's ground and the tiles' insides are the new one's (the pile from before
//   read its paints once, when built: black tiles on Paper's white card after Graphite, until a reload).
// It writes a frame strip of each visit (strip-<n>-visit-<k>.png), a video of the proof run (proof.webm) and the still (still-<n>.png).
// LOCAL only (it signs up accounts with a virtual passkey); through gpu.py's parallel lane.
// --files <copy> serves that copy's /js and /css in place of the server's (the app from before fails it).
//   node scripts/pile-drop-check.mjs http://localhost:<port> <outDir> [--proof 150] [--big 2500] [--files <copy>]   (exit 0 = pass)
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { chromium } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
if (!BASE || !outArg || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  console.error("Usage: node scripts/pile-drop-check.mjs http://localhost:<port> <outDir> [--proof 150] [--big 2500] (a local server only)");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
const PROOF = Number(opt("proof", 150));
const BIG = Number(opt("big", 2500));
const FILES = opt("files", null) && resolve(opt("files"));
setTimeout(() => (console.error("pile drop check: past its 12-minute ceiling"), process.exit(1)), 12 * 60_000).unref();

let failed = 0;
const report = (ok, name, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const PILE = '.lx-know-board [data-part="word-pile"]';

/** A new account on a 390 phone that has started `n` Dutch words (evidence as a game writes it), at Knowledge's tab, recording the pile. */
async function learner(n, { video = null, reduced = false, cpu = 1 } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    colorScheme: "dark",
    reducedMotion: reduced ? "reduce" : "no-preference",
    ...(video ? { recordVideo: { dir: video, size: { width: 390, height: 844 } } } : {}),
  });
  if (FILES)
    await context.route(/\/(js|css)\/.*\.(js|css)(\?.*)?$/, async (route) => {
      const path = new URL(route.request().url()).pathname;
      const file = join(FILES, "public", path);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
      await route.fulfill({ status: 200, contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body: readFileSync(file) });
    });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Pile Drop");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.evaluate(() => {
    localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
    localStorage.setItem("lx.welcome.v1", String(Date.now()));
  });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  // n words started: the first n of the language's words, each a right answer.
  const recorded = await page.evaluate(async (n) => {
    const content = await import("/js/study/content.js");
    for (let i = 0; i < 400 && Object.keys(content.WORDS).length < n; i++) await new Promise((r) => setTimeout(r, 100));
    const { record } = await import("/js/study/progress.js");
    const units = Object.keys(content.WORDS).slice(0, n).map((word) => `w:${word}`);
    record(units.map((concept) => ({ concept, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "check" })));
    await new Promise((r) => setTimeout(r, 1500));
    return units.length;
  }, n);
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  return { context, page, cdp, errors, recorded };
}

/** One visit to Knowledge (from Home): every frame of the pile, its states, the long tasks and the page's frame gaps, until it's at rest. */
async function visit(page, { strip = null, reduced = false } = {}) {
  await page.evaluate(() => {
    globalThis.__lxPileFrames = [];
    const w = (globalThis.__dropWatch = { states: [], long: [], gaps: [], t0: performance.now(), moving: null, ready: null });
    new MutationObserver((records) => {
      for (const r of records)
        if (r.target.dataset?.pile) {
          const state = r.target.dataset.pile;
          w.states.push(state);
          if (state === "moving" && w.moving === null) w.moving = performance.now();
          if (state === "ready" && w.moving !== null && w.ready === null) w.ready = performance.now();
        }
    }).observe(document.body, { attributes: true, attributeFilter: ["data-pile"], subtree: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.startTime >= w.t0) w.long.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: "longtask" });
    performance.clearMeasures("lx-pile-visit");
    let last = performance.now();
    const frame = (now) => {
      if (w.moving !== null && w.ready === null) w.gaps.push(Math.round(now - last));
      last = now;
      if (!w.stop) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await page.evaluate(() => (location.hash = "#know"));
  const shots = [];
  if (strip) {
    // The card as the words come down: a picture as often as one can be taken, for about a second.
    await page.waitForSelector(PILE, { timeout: 30_000 });
    const card = page.locator('.lx-know-board [data-card="words"]');
    const t0 = Date.now();
    while (Date.now() - t0 < 1400 && shots.length < 12) shots.push(await card.screenshot());
  }
  // This visit's own rest (the last one's "ready" is still on the card until the page's way back starts this one): moving and down again, or with
  // animations off, set ready again.
  await page.waitForFunction((still) => {
    const w = globalThis.__dropWatch;
    return w.states.at(-1) === "ready" && (still || w.moving !== null);
  }, reduced, { timeout: 90_000 });
  await page.waitForTimeout(300);
  const got = await page.evaluate(() => {
    const w = globalThis.__dropWatch;
    w.stop = true;
    const frames = globalThis.__lxPileFrames ?? [];
    globalThis.__lxPileFrames = undefined;
    const first = frames.find((f) => f.boxes.length);
    const last = frames.at(-1);
    const ys = (f) => Array.from({ length: f.boxes.length / 5 }, (_, i) => f.boxes[i * 5 + 1]);
    const own = performance.getEntriesByName("lx-pile-visit").map((e) => Math.round(e.duration));
    return {
      states: w.states,
      own,
      long: w.long.map(([, d]) => d),
      // From the drop's start to its rest: what comes after (the page's Everyday and Over time, worked out once the pile is down) isn't the fall's.
      falling: w.long.filter(([at]) => w.moving !== null && at >= w.moving && (w.ready === null || at < w.ready)).map(([, d]) => d),
      maxGap: w.gaps.length ? Math.max(...w.gaps) : 0,
      restMs: w.moving !== null && w.ready !== null ? Math.round(w.ready - w.moving) : null,
      firstLowest: first ? Math.max(...ys(first)) : null,
      rest: last ? Array.from(last.boxes) : [],
      floor: last ? last.walls[3] : null,
      seed: last?.seed ?? null,
    };
  });
  if (strip && shots.length) {
    const metas = await Promise.all(shots.map((s) => sharp(s).metadata()));
    const w = metas[0].width;
    const h = metas[0].height;
    const gap = 8;
    await sharp({ create: { width: shots.length * (w + gap) - gap, height: h, channels: 3, background: "#282828" } })
      .composite(shots.map((input, i) => ({ input, left: i * (w + gap), top: 0 })))
      .png()
      .toFile(strip);
  }
  return got;
}
const goHome = async (page) => {
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForTimeout(700);
};

// Two turned rectangles overlap (separating axes) by how much; every pair over 1 px, through a grid.
function overlap(a, b) {
  let least = Number.POSITIVE_INFINITY;
  for (const t of [a.a, a.a + Math.PI / 2, b.a, b.a + Math.PI / 2]) {
    const ux = Math.cos(t);
    const uy = Math.sin(t);
    const span = (r) => {
      const c = Math.cos(r.a);
      const s = Math.sin(r.a);
      const ex = Math.abs((r.w / 2) * (c * ux + s * uy)) + Math.abs((r.h / 2) * (-s * ux + c * uy));
      const m = r.x * ux + r.y * uy;
      return [m - ex, m + ex];
    };
    const [a0, a1] = span(a);
    const [b0, b1] = span(b);
    least = Math.min(least, Math.min(a1, b1) - Math.max(a0, b0));
    if (least <= 0) return 0;
  }
  return least;
}
const rectsOf = (boxes) => Array.from({ length: boxes.length / 5 }, (_, i) => ({ x: boxes[i * 5], y: -boxes[i * 5 + 1], a: boxes[i * 5 + 2], w: boxes[i * 5 + 3], h: boxes[i * 5 + 4] }));
function overlapping(rects) {
  const cell = 40;
  const grid = new Map();
  rects.forEach((r, i) => {
    const reach = Math.hypot(r.w, r.h) / 2;
    for (let gx = Math.floor((r.x - reach) / cell); gx <= Math.floor((r.x + reach) / cell); gx++)
      for (let gy = Math.floor((r.y - reach) / cell); gy <= Math.floor((r.y + reach) / cell); gy++) {
        const key = `${gx},${gy}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
  });
  const found = new Set();
  for (const list of grid.values())
    for (let p = 0; p < list.length; p++)
      for (let q = p + 1; q < list.length; q++) if (overlap(rects[list[p]], rects[list[q]]) > 1) found.add(`${list[p]}-${list[q]}`);
  return found.size;
}
const underFloor = (boxes, floor) =>
  rectsOf(boxes).filter((r) => {
    const c = Math.abs(Math.cos(r.a));
    const s = Math.abs(Math.sin(r.a));
    return -r.y + (s * r.w + c * r.h) / 2 > floor + 1;
  }).length;
const elsewhere = (a, b) => {
  let moved = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 5) if (Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]) > 4) moved++;
  return moved / Math.max(1, a.length / 5);
};
const judgeRest = (label, v, n) => {
  report(v.rest.length / 5 === n, `${label}: every word on the pile at rest`, `${v.rest.length / 5} of ${n}`);
  const over = overlapping(rectsOf(v.rest));
  const under = underFloor(v.rest, v.floor);
  report(!over && !under, `${label}: at rest no two tiles overlap and none is under the floor`, `${over} overlapping, ${under} under`);
};

try {
  // 0. A planted overlap is caught.
  report(overlapping(rectsOf([200, -18, 0, 60, 36, 230, -30, 0.2, 60, 36])) === 1, "PLANT: two tiles laid over each other are caught as overlapping");

  // 1. The proof: two visits in a row at 390 on one account, recorded, each a strip.
  const videoDir = join(OUT, "video");
  const proof = await learner(PROOF, { video: videoDir });
  const visits = [];
  for (let k = 1; k <= 2; k++) {
    if (k > 1) await goHome(proof.page);
    visits.push(await visit(proof.page, { strip: join(OUT, `strip-${PROOF}-visit-${k}.png`) }));
  }
  for (const [k, v] of visits.entries()) {
    report(v.states.includes("moving") && v.firstLowest !== null && v.firstLowest < 0, `${PROOF} words, visit ${k + 1}: the words fall in from above the card`, `${v.states.join(" → ")}; the first drawn lowest at ${v.firstLowest} px`);
    judgeRest(`${PROOF} words, visit ${k + 1}`, v, proof.recorded);
  }
  const share = elsewhere(visits[0].rest, visits[1].rest);
  report(visits[0].seed !== visits[1].seed && share > 0.6, `${PROOF} words: two visits, two piles`, `${Math.round(share * 100)}% of the words elsewhere the second time (seeds ${visits.map((v) => v.seed).join(", ")})`);
  report(!proof.errors.length, `${PROOF} words: no page errors`, proof.errors.join(" | "));
  const video = await proof.page.video()?.path();
  await proof.context.close();
  if (video) console.log(`video: ${video}`);

  // 2. The biggest pile, the processor slowed 4×: two visits.
  const big = await learner(BIG, { cpu: 4 });
  const bigVisits = [];
  for (let k = 1; k <= 2; k++) {
    if (k > 1) await goHome(big.page);
    bigVisits.push(await visit(big.page));
  }
  for (const [k, v] of bigVisits.entries()) {
    const own = Math.max(0, ...v.own);
    report(v.own.length > 0 && own < 50 && !v.falling.length && v.maxGap <= 100 && v.restMs !== null && v.restMs <= 3000, `${BIG} words at 4×, visit ${k + 1}: the pile's own work under 50 ms, no long task while it falls, no frame gap over 100 ms, at rest within 3 s`, `its own work ${v.own.join(" + ") || "not measured"} ms (${v.own.reduce((a, b) => a + b, 0)} in all), each task under 50; long tasks while it falls ${v.falling.join(", ") || "none"}; the longest gap ${v.maxGap} ms; at rest ${v.restMs} ms after it began falling; the page's long tasks over the visit ${v.long.join(", ") || "none"}`);
    judgeRest(`${BIG} words at 4×, visit ${k + 1}`, v, big.recorded);
  }
  report(elsewhere(bigVisits[0].rest, bigVisits[1].rest) > 0.6, `${BIG} words: two visits, two piles`, `${Math.round(elsewhere(bigVisits[0].rest, bigVisits[1].rest) * 100)}% elsewhere`);
  report(!big.errors.length, `${BIG} words: no page errors`, big.errors.join(" | "));
  await big.context.close();

  // 3. Animations off: laid out at random, still; two loads, two piles.
  const still = await learner(PROOF, { reduced: true });
  const loads = [];
  for (let k = 1; k <= 2; k++) {
    if (k > 1) await goHome(still.page);
    loads.push(await visit(still.page, { reduced: true }));
    if (k === 1) await still.page.locator('.lx-know-board [data-card="words"]').screenshot({ path: join(OUT, `still-${PROOF}.png`) });
  }
  for (const [k, v] of loads.entries()) {
    report(!v.states.includes("moving") && v.states.at(-1) === "ready", `animations off, load ${k + 1}: the pile still, never falling`, v.states.join(" → "));
    judgeRest(`animations off, load ${k + 1}`, v, still.recorded);
  }
  report(elsewhere(loads[0].rest, loads[1].rest) > 0.6, "animations off: two loads, two piles", `${Math.round(elsewhere(loads[0].rest, loads[1].rest) * 100)}% elsewhere`);
  await still.context.close();

  // 4. A new theme. 40 words started and none known well: every tile an outline, the page's ground inside it.
  const themed = await learner(40);
  const tp = themed.page;
  // The page's ground as the pile reads it (cards.js readPaints), as [r, g, b].
  const groundNow = () =>
    tp.evaluate((sel) => {
      const css = getComputedStyle(document.querySelector(sel));
      const probe = document.createElement("canvas").getContext("2d");
      probe.fillStyle = css.getPropertyValue("--page-ground").trim() || css.getPropertyValue("--canvas").trim() || "#000";
      probe.fillRect(0, 0, 1, 1);
      return Array.from(probe.getImageData(0, 0, 1, 1).data.slice(0, 3));
    }, PILE);
  // How many of the pile's own pixels are exactly that color, solid (an outline tile's inside; the canvas around the tiles is clear).
  const countOf = (rgb) =>
    tp.evaluate(
      ([sel, [r, g, b]]) => {
        const canvas = document.querySelector(`${sel} canvas`);
        const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        let n = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255 && data[i] === r && data[i + 1] === g && data[i + 2] === b) n++;
        return n;
      },
      [PILE, rgb],
    );
  const useTheme = (id) => tp.evaluate(async (theme) => (await import("/js/lx/theme.js")).useTheme(theme), id);
  const themeNow = () => tp.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await visit(tp);
  const first = await themeNow();
  const other = first === "paper" ? "graphite" : "paper";
  const groundA = await groundNow();
  const insideA = await countOf(groundA);
  report(insideA > 20_000 && (await countOf([1, 2, 3])) === 0, `a new theme: the counter counts (in ${first}, the outline tiles' insides are its ground; a color nothing is drawn in counts none)`, `${insideA} px of ${groundA.join(",")}`);
  // Changed where a learner changes it: Settings → Appearance, Knowledge kept off the screen; then back to Knowledge, the same load.
  await tp.evaluate(() => ((globalThis.__sameLoad = true), (location.hash = "#settings/appearance")));
  await tp.waitForFunction(() => location.hash === "#settings/appearance" && !document.querySelector(".lx-know-board"));
  await useTheme(other);
  await tp.waitForTimeout(800);
  await visit(tp);
  const groundB = await groundNow();
  const [oldB, insideB] = [await countOf(groundA), await countOf(groundB)];
  await tp.locator('.lx-know-board [data-card="words"]').screenshot({ path: join(OUT, `theme-${other}-after-settings.png`) });
  report(
    (await themeNow()) === other && groundB.join() !== groundA.join() && (await tp.evaluate(() => globalThis.__sameLoad === true)) && oldB === 0 && insideB > insideA / 2,
    `a new theme from Settings, back on Knowledge (no reload): no tile on ${first}'s ground, their insides ${other}'s`,
    `${oldB} px still ${groundA.join(",")}; ${insideB} px of ${groundB.join(",")} (were ${insideA})`,
  );
  // Changed with Knowledge on the screen (your AI's change to the look, another tab's): the pile is drawn again where it lies.
  await useTheme(first);
  let oldC = -1;
  let insideC = 0;
  for (const start = Date.now(); Date.now() - start < 5000; await tp.waitForTimeout(150)) {
    [oldC, insideC] = [await countOf(groundB), await countOf(groundA)];
    if (oldC === 0 && insideC > insideA / 2) break;
  }
  await tp.locator('.lx-know-board [data-card="words"]').screenshot({ path: join(OUT, `theme-${first}-on-the-page.png`) });
  report(oldC === 0 && insideC > insideA / 2, `a new theme with Knowledge on the screen: no tile on ${other}'s ground within 5 s, their insides ${first}'s`, `${oldC} px still ${groundB.join(",")}; ${insideC} px of ${groundA.join(",")}`);
  report(!themed.errors.length, "a new theme: no page errors", themed.errors.join(" | "));
  await themed.context.close();
} finally {
  await browser.close();
}
console.log(failed ? `\npile drop check: ${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
