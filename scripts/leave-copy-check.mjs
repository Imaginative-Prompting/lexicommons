// A copy of something leaving never shows what the original hid. A step, a result and a summary leave as copies on the ghost layer
// (lx/motion.js makeGhost, copyInside), each part keeping what it computed; a part the page hid by opacity 0 (an unchosen tile's
// mark, a choice's mark) must stay hidden in the copy. Every frame of every leave in a real lesson and a Practice is read, in the
// page, at normal speed and with the processor slowed 4×: before a press that makes something leave, each part of the session that
// is on the screen at opacity 0 (not one motion itself hid, not one mid-animation) is marked; in every frame after, no copy of a
// marked part may be seen. First a control: a copy made by the rule from before (opacity 0 forced to 1) of a tile with a hidden
// mark must be caught, so this can fail.
//
//   node scripts/leave-copy-check.mjs http://localhost:<port> <outDir> [--from <copy dir>] [--cpu 1,4]
//
// --from <copy> serves another copy's /js and /css (the app from before fails it). LOCAL only (it signs up accounts), a copy with
// Dutch's lessons (npm run local); through gpu.py's parallel lane. Exit 0 = pass, 2 = a stage not reached.
import { chromium } from "./quiet-browser.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { answerStep, nextStep, pastReminderAsk, shownAfter, SESSION } from "./fixtures/play-session.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const FROM = opt("from") && resolve(opt("from"));
const GAMES_ALONE = ["type-gap", "place", "repeat-word", "repeat", "meaning"];
const CPUS = (opt("cpu") ?? "1,4").split(",").map(Number);
if (!/^http:\/\/localhost:\d+$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/leave-copy-check.mjs http://localhost:<port> <outDir> [--from <copy dir>] [--cpu 1,4]   (LOCAL only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

let failed = 0;
let unreached = 0;
const say = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

// In the page: mark what's hidden, then read every frame.
const WATCH = () => {
  if (window.__leave) return;
  const seenNow = (node) => {
    // Seen: every opacity up to the root above 0, visible, with a box on the screen.
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height || box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth) return null;
    let opacity = 1;
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (style.display === "none" || style.visibility === "hidden") return null;
      opacity *= Number(style.opacity);
      if (opacity <= 0.02) return null;
    }
    return { opacity: Math.round(opacity * 100) / 100, box: [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)] };
  };
  const state = { on: false, frame: 0, hits: [], marked: 0 };
  window.__leave = {
    /** Marks each part under `root` that's on the screen at opacity 0 by the page's own rules; how many. */
    mark(rootSelector) {
      for (const old of document.querySelectorAll("[data-leave-hidden]")) old.removeAttribute("data-leave-hidden");
      const root = document.querySelector(rootSelector);
      let n = 0;
      if (!root) return 0;
      for (const node of root.querySelectorAll("*")) {
        if (node.closest("[data-ghost]") || node.hasAttribute("data-motion-hidden")) continue;
        const style = getComputedStyle(node);
        if (style.opacity !== "0" || style.display === "none") continue;
        if (node.getAnimations().length) continue;
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const holder = node.closest("[data-part]");
        node.setAttribute("data-leave-hidden", `${holder?.getAttribute("data-part") ?? "?"}${holder?.getAttribute("data-state") ? `[${holder.getAttribute("data-state")}]` : ""} ${node.localName}.${node.getAttribute("class") ?? ""}`.trim());
        n++;
      }
      state.marked = n;
      return n;
    },
    start() {
      state.on = true;
      state.frame = 0;
      state.hits = [];
      const tick = () => {
        if (!state.on) return;
        state.frame++;
        for (const copy of document.querySelectorAll("[data-ghost] [data-leave-hidden], [data-ghost][data-leave-hidden]")) {
          const seen = seenNow(copy);
          if (seen) state.hits.push({ frame: state.frame, what: copy.getAttribute("data-leave-hidden"), ...seen });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    stop() {
      state.on = false;
      return { frames: state.frame, hits: state.hits, marked: state.marked };
    },
  };
};

const MIME = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const browser = await chromium.launch({ headless: true });
async function learner(name, cpu) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block", colorScheme: "dark" });
  if (FROM) {
    await context.route(/\/(js|css)\/[^?]+/, (route) => {
      const path = new URL(route.request().url()).pathname;
      const file = join(FROM, "public", path);
      if (!existsSync(file)) return route.continue();
      return route.fulfill({ status: 200, contentType: MIME[extname(file)] ?? "application/octet-stream", body: readFileSync(file) });
    });
  }
  await context.addInitScript(WATCH);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', name);
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.evaluate(async () => {
    const packs = await import("/js/study/packs.js");
    await packs.syncLibraryPacks();
  });
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  return { context, page, errors };
}

/** A press that makes something leave, every frame after it read for `ms`: what was marked, the frames, and each copy of a marked part seen. */
async function leaving(page, press, ms) {
  const marked = await page.evaluate((S) => window.__leave.mark(S), SESSION);
  await page.evaluate(() => window.__leave.start());
  await press();
  await page.waitForTimeout(ms);
  return { ...(await page.evaluate(() => window.__leave.stop())), marked };
}

// The control: on a real answered picture step, a copy made as the rule from before made one (every part at opacity 0 shown at 1).
async function control() {
  const { context, page } = await learner("Leave copy control", 1);
  try {
    await page.goto(`${BASE}/app/#study`);
    const door = page.locator('[data-part="page"]:not([data-ghost]) [data-part="study-door"]').first();
    await door.waitFor({ timeout: 40_000 });
    await page.waitForTimeout(800);
    await door.click();
    await page.waitForSelector(SESSION, { timeout: 30_000 });
    let step = null;
    for (let i = 0; i < 8; i++) {
      step = await answerStep(page, { next: false });
      if (await page.locator(`${SESSION} [data-part="picture-choice"]`).count()) break;
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first().click();
      step = null;
    }
    if (!step) {
      unreached++;
      return console.log("NOT REACHED  the control: no picture step in the first eight");
    }
    await page.waitForTimeout(700);
    const marked = await page.evaluate((S) => window.__leave.mark(S), SESSION);
    await page.evaluate(() => window.__leave.start());
    await page.evaluate((S) => {
      const tile = document.querySelector(`${S} [data-part="picture-choice"] [data-leave-hidden]`).closest('[data-part="picture-choice"]');
      const box = tile.getBoundingClientRect();
      const copy = tile.cloneNode(true);
      copy.setAttribute("data-ghost", "");
      Object.assign(copy.style, { position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      for (const part of copy.querySelectorAll("[data-leave-hidden]")) part.style.opacity = "1";
      document.body.append(copy);
      setTimeout(() => copy.remove(), 150);
    }, SESSION);
    await page.waitForTimeout(400);
    const read = await page.evaluate(() => window.__leave.stop());
    say(marked > 0 && read.hits.length > 0, "the control: a copy that shows a tile's hidden mark is caught", `${marked} hidden parts marked; seen in ${new Set(read.hits.map((h) => h.frame)).size} frames`);
  } finally {
    await context.close();
  }
}

async function session(page, label, cpu, record, { open, wrongAt = () => false }) {
  await open();
  await page.waitForSelector(SESSION, { timeout: 40_000 });
  const wait = 900 * Math.min(cpu, 3);
  let steps = 0;
  for (let i = 0; i < 45; i++) {
    const now = await nextStep(page);
    if (now?.kind === "summary") break;
    const wrong = Boolean(wrongAt(i));
    await answerStep(page, { wrong, next: false });
    await page.waitForTimeout(450 * Math.min(cpu, 3));
    // A step that went on by itself (a card's I knew it) has the next step up already: its bar's button is that step's own, not a Continue.
    if (await shownAfter(page)) continue;
    const bar = page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first();
    if (!(await bar.count())) continue;
    const read = await leaving(page, () => bar.click(), wait);
    record.push({ where: `${label} step ${i + 1} ${now.kind}${wrong ? " (wrong)" : ""}`, ...read });
    steps++;
  }
  await page.waitForSelector(`${SESSION} [data-part="session-summary"]`, { timeout: 30_000 });
  await page.waitForTimeout(1500 * Math.min(cpu, 3));
  const done = page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`).last();
  const read = await leaving(page, () => done.click(), wait);
  record.push({ where: `${label} summary`, ...read });
  await pastReminderAsk(page).catch(() => false);
  await page.waitForTimeout(800);
  return steps;
}

await control();
const report = {};
for (const cpu of CPUS) {
  const { context, page, errors } = await learner(`Leave copy ${cpu}x`, cpu);
  const record = [];
  try {
    const lesson = await session(page, "lesson 1", cpu, record, {
      open: async () => {
        await page.goto(`${BASE}/app/#study`);
        const door = page.locator('[data-part="page"]:not([data-ghost]) [data-part="study-door"]').first();
        await door.waitFor({ timeout: 40_000 });
        await page.waitForTimeout(800);
        await door.click();
      },
      wrongAt: (i) => i === 3 || i === 7,
    });
    const practice = await session(page, "practice", cpu, record, {
      open: async () => {
        await page.evaluate(() => (location.hash = "#study"));
        const door = page.locator('[data-part="page"]:not([data-ghost]) [data-part="study-door"]').first();
        await door.waitFor({ timeout: 40_000 });
        await page.waitForTimeout(1200);
        await door.click();
      },
      wrongAt: (i) => i % 4 === 1,
    });
    // The kinds a lesson and a Practice needn't bring: each game alone (Study's own sessions), then Japanese's first lesson, which meets its
    // idea as a step of its own, and a deck's cards (the kana).
    const alone = [];
    for (const game of GAMES_ALONE) {
      try {
        await session(page, game, cpu, record, { open: () => page.evaluate((g) => (location.hash = `#study/session/game/${g}`), game), wrongAt: (i) => i === 1 });
        alone.push(game);
      } catch (error) {
        console.log(`      (${game} alone didn't play here: ${String(error.message).split("\n")[0].slice(0, 90)})`);
        await page.evaluate(() => (location.hash = "#study"));
        await page.waitForTimeout(800);
      }
    }
    await page.evaluate(async () => {
      (await import("/js/study/learning.js")).setLearning("ja", "en");
      const packs = await import("/js/study/packs.js");
      await packs.syncLibraryPacks();
      for (let i = 0; i < 100 && !packs.libraryPacks().some((p) => p.id === "path-ja"); i++) await new Promise((r) => setTimeout(r, 300));
    });
    await page.waitForTimeout(1500);
    await session(page, "ja lesson 1", cpu, record, { open: () => page.evaluate(() => (location.hash = "#study/session/lesson")), wrongAt: (i) => i === 5 });
    await session(page, "kana deck", cpu, record, { open: () => page.evaluate(() => (location.hash = "#study/session/deck/kana-ja")), wrongAt: (i) => i === 2 }).catch((error) => console.log(`      (the kana deck didn't play here: ${String(error.message).split("\n")[0].slice(0, 90)})`));
    const kinds = [...new Set(record.map((r) => r.where.replace(/^.*step \d+ /, "").replace(" (wrong)", "")))];
    const wanted = ["meet", ...GAMES_ALONE.filter((g) => alone.includes(g))];
    const missing = wanted.filter((k) => !kinds.includes(k));
    say(missing.length === 0 && alone.length >= 3, `at ${cpu}× the kinds a lesson and a Practice needn't bring were read too`, `alone: ${alone.join(", ") || "none"}; Japanese's lesson and the kana deck${missing.length ? `; not seen: ${missing.join(", ")}` : ""}`);
    const bad = record.filter((r) => r.hits.length);
    const watched = record.filter((r) => r.marked > 0).length;
    say(lesson >= 10 && practice >= 8 && watched >= 5, `at ${cpu}× the leaves were read`, `${record.length} leaves in a lesson and a Practice (${kinds.join(", ")}), ${watched} with hidden parts marked, ${record.reduce((n, r) => n + r.frames, 0)} frames`);
    say(bad.length === 0, `at ${cpu}× no copy of a leaving step, result or summary shows a part the page hid`, bad.length ? bad.slice(0, 6).map((r) => `${r.where}: ${[...new Set(r.hits.map((h) => h.what))].join("; ")} in frames ${Math.min(...r.hits.map((h) => h.frame))}–${Math.max(...r.hits.map((h) => h.frame))}`).join(" | ") + (bad.length > 6 ? ` | and ${bad.length - 6} more` : "") : "");
    say(errors.length === 0, `at ${cpu}× no page error`, errors.slice(0, 3).join(" | "));
  } catch (error) {
    unreached++;
    console.log(`NOT REACHED  at ${cpu}×: ${String(error.message).split("\n")[0]}`);
    await page.screenshot({ path: join(OUT, `not-reached-${cpu}x.png`) }).catch(() => {});
  } finally {
    report[`${cpu}x`] = record;
    await context.close();
  }
}
writeFileSync(join(OUT, "leave-copy-check.json"), JSON.stringify(report, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : unreached ? `\n${unreached} not reached` : "\nall passed");
process.exit(failed ? 1 : unreached ? 2 : 0);
