// Every toast the app raises, measured where it shows (12 Nov 2026: a session's Practice this toast, "3 more on this, coming up", drew as a
// 223 × 490 pill over the question, the choices and the result, and as Continue was pressed the step's leave drew over it). Each is a small
// pill: at most two lines of its words tall, no wider than the screen less its margins, over nothing that takes a press; and while a step
// changes under it, it stays as it was, frame after frame. On a phone (390 × 844 and 320 × 568) and a computer (1280 × 800):
// - in a session, Practice this from a result's idea (its chip's sheet, else the drawer's): its toast under the session's top;
// - on the main pages (Home, Study, Knowledge, the AI section, Settings → Language), the app's notice of a look changed ("Now using …",
//   with Undo): at the foot, over the tabs or beside the sidebar.
// Usage: node scripts/toast-check.mjs http://localhost:<port> <outDir>  (LOCAL only; through gpu.py's parallel lane) (exit 0 = pass)

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { chromium } from "./quiet-browser.mjs";
import { SESSION, answerStep, nextStep, pastReminderAsk, playToSummary } from "./fixtures/play-session.mjs";

const [BASE, outArg] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !outArg) {
  console.error("Usage: node scripts/toast-check.mjs http://localhost:<port> <outDir> (a local server only)");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
setTimeout(() => {
  console.error("toast-check: ceiling of 20 minutes");
  process.exit(3);
}, 20 * 60_000).unref();

const results = [];
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const SIZES = [
  { name: "390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: "320", viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "1280", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
const browser = await chromium.launch();
const errors = [];

/** A new account on a device of this size, signed in, on Home. */
async function device(size) {
  const context = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: size.deviceScaleFactor, isMobile: size.isMobile, hasTouch: size.hasTouch, colorScheme: "light", serviceWorkers: "block" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${size.name} ${page.url()}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${size.name} ${page.url()}: ${m.text().slice(0, 200)}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/login?new=1`);
  await page.fill('input[name="name"]', `Toasts ${size.name}`);
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/**`, { timeout: 90_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.evaluate(async () => (await import("/js/lx/theme.js")).useTheme("paper"));
  await page.waitForTimeout(3500); // the theme's own notice gone
  return { context, page };
}
const go = async (page, hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(1200);
};

/** The toast on screen: its box, its lines, the height two lines of it may take, and what takes a press under it. */
const measure = (page) =>
  page.evaluate(() => {
    const toast = [...document.querySelectorAll('[data-part="toast"]')].find((node) => node.checkVisibility() && !node.closest(".ds-states, [data-motion-layer]"));
    if (!toast) return null;
    const r = toast.getBoundingClientRect();
    const style = getComputedStyle(toast);
    const textLine = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.35;
    // A line of it: its words' line, or what stands in it if taller (its icon, its Undo).
    const line = Math.max(textLine, ...[...toast.querySelectorAll("svg, .lx-icon, [data-part='button']")].map((node) => node.getBoundingClientRect().height));
    const chrome = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    // Its words' lines (a button's words, Undo's, aside): their boxes' tops, a line apart at least half a line of its words.
    const tops = [];
    const walker = document.createTreeWalker(toast, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim() || t.parentElement.closest("button")) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const rect of range.getClientRects()) if (rect.width > 1) tops.push(rect.top);
    }
    tops.sort((a, b) => a - b);
    const lines = tops.reduce((n, top, i) => (i === 0 || top - tops[i - 1] > textLine * 0.5 ? n + 1 : n), 0);
    const pressable = 'button, a[href], input, select, textarea, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [data-part="choice"], [data-part="tile"]';
    // What stays put on a page's screen: the tabs, the header, a pinned action (a page's own content scrolls under a notice).
    const FIXED = '[data-part="tab-bar"], [data-part="app-header"], [data-part="pinned-actions"]';
    const covers = [...document.querySelectorAll(pressable)]
      .filter((node) => !toast.contains(node) && node.checkVisibility() && !node.closest("[inert], [data-motion-layer], [aria-hidden='true'], [data-ghost]"))
      .filter((node) => {
        const b = node.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return false;
        if (!(b.left < r.right - 1 && b.right > r.left + 1 && b.top < r.bottom - 1 && b.bottom > r.top + 1)) return false;
        // What's drawn there: covered only where it's on the screen and not itself under something else (a sheet, the session).
        const x = Math.min(Math.max((Math.max(b.left, r.left) + Math.min(b.right, r.right)) / 2, 0), innerWidth - 1);
        const y = Math.min(Math.max((Math.max(b.top, r.top) + Math.min(b.bottom, r.bottom)) / 2, 0), innerHeight - 1);
        toast.style.visibility = "hidden";
        const under = document.elementFromPoint(x, y);
        toast.style.visibility = "";
        return Boolean(under && (under === node || node.contains(under)));
      })
      .map((node) => ({ name: (node.getAttribute("aria-label") || node.textContent || node.getAttribute("data-part") || node.tagName).trim().replace(/\s+/g, " ").slice(0, 40), fixed: Boolean(node.closest(FIXED)) }));
    return {
      text: toast.textContent.trim(),
      box: { x: r.left, y: r.top, width: r.width, height: r.height },
      lines,
      most: Math.ceil(2 * line + chrome + 2),
      covers,
      screen: [innerWidth, innerHeight],
    };
  });
// In a session, nothing under a toast may take a press; on a page, nothing that stays put (the tabs, the header, a pinned action), while what
// scrolls under a notice for its few seconds is said, not a fault (a notice floats over a page's content by design).
const faultsOf = (where, m, { onPage = false } = {}) => {
  const faults = [];
  if (!m) return [`${where}: no toast showed`];
  const size = `${Math.round(m.box.width)} × ${Math.round(m.box.height)}`;
  if (m.lines > 2) faults.push(`${where}: "${m.text}" in ${m.lines} lines`);
  if (m.box.height > m.most) faults.push(`${where}: "${m.text}" is ${size}, taller than two lines of it (${m.most} px)`);
  if (m.box.width > m.screen[0] - 24 || m.box.x < 0 || m.box.x + m.box.width > m.screen[0]) faults.push(`${where}: "${m.text}" is ${size} at ${Math.round(m.box.x)}, wider than the screen less its margins`);
  const covered = m.covers.filter((c) => !onPage || c.fixed);
  if (covered.length) faults.push(`${where}: "${m.text}" covers ${covered.map((c) => `"${c.name}"`).join(", ")}`);
  return faults;
};

/** Practice this in a session, from a result's idea: the toast it raises (null when no step here offered one). */
// plant: the toast's layer put just under the ghosts a step leaves as (motion.js's layer, 1000), as it was inside the session before 12 Nov
// 2026; the guard must then see the step drawn over it as Continue changes the step. lessonFirst: a first lesson played first, so the games
// have sentences to ask.
async function practiceThis(page, faults, where, shots, { plant = false, lessonFirst = true } = {}) {
  if (lessonFirst) {
    await go(page, "#today");
    await page.locator('[data-part="page"] [data-part="button"]', { hasText: "Start" }).first().click();
    await page.waitForSelector(SESSION, { timeout: 30_000 });
    await playToSummary(page);
    await page.locator(`${SESSION} [data-part="button"]`, { hasText: "Done" }).first().click();
    await pastReminderAsk(page);
    await page.waitForFunction((S) => !document.querySelector(S), SESSION, { timeout: 20_000 });
  }
  for (const game of ["choose", "meaning", "fill"]) {
    await go(page, `#study/session/game/${game}`);
    if (!(await page.waitForSelector(SESSION, { timeout: 15_000 }).then(() => true, () => false))) continue;
    for (let i = 0; i < 8; i++) {
      const now = await nextStep(page);
      if (!now || now.kind === "summary") break;
      await answerStep(page, { next: false });
      await page.waitForTimeout(500);
      const chip = page.locator(`${SESSION} [data-part="concept-chip"]`).first();
      const learn = page.locator(`${SESSION} [data-part="learn-more"]`).first();
      if (await chip.count()) await chip.click();
      else if (await learn.count()) await learn.click();
      else {
        await page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first().click();
        continue;
      }
      const practice = page.getByRole("button", { name: "Practice this" }).last();
      if (!(await practice.waitFor({ timeout: 8000 }).then(() => true, () => false))) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
        await page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first().click();
        continue;
      }
      await practice.click();
      await page.waitForTimeout(700);
      const shown = await measure(page);
      if (!shown) {
        // Nothing to practice on it here: on to the next.
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
        await page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first().click();
        continue;
      }
      await page.screenshot({ path: join(OUT, `session-${where}${plant ? "-planted" : ""}.png`) });
      shots.push(`session-${where}${plant ? "-planted" : ""}.png`);
      if (!plant) faults.push(...faultsOf(`${where}, a session's Practice this`, shown));
      // (By the layer's own style: the page's CSP takes no <style> of a check's.)
      const setPlant = (on) => page.evaluate((on) => document.querySelector(".lx-session-toasts")?.style[on ? "setProperty" : "removeProperty"]("z-index", ...(on ? ["999", "important"] : [])), on);
      if (plant) await setPlant(true);
      // Continue while it's up: the step changes under it, and it's drawn as it was, frame after frame.
      const clip = { x: Math.max(0, shown.box.x), y: Math.max(0, shown.box.y), width: Math.min(shown.box.width, shown.screen[0] - Math.max(0, shown.box.x)), height: Math.min(shown.box.height, 200) };
      const pixels = async () => (await sharp(await page.screenshot({ clip })).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
      const before = await pixels();
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first().click({ noWaitAfter: true });
      let worst = 0;
      for (let frame = 0; frame < 10; frame++) {
        const now = await pixels();
        let differ = 0;
        for (let i = 0; i < now.data.length; i += 3) if (Math.abs(now.data[i] - before.data[i]) + Math.abs(now.data[i + 1] - before.data[i + 1]) + Math.abs(now.data[i + 2] - before.data[i + 2]) > 48) differ++;
        worst = Math.max(worst, differ / (now.data.length / 3));
      }
      if (plant) await setPlant(false);
      shown.worst = worst;
      if (!plant && worst > 0.05) faults.push(`${where}: as Continue changed the step under it, ${Math.round(worst * 100)}% of the toast's pixels changed (something drew over it)`);
      return shown;
    }
    await page.evaluate(async (S) => document.querySelector(S)?.querySelector('[aria-label^="Leave"], [data-part="icon-button"]')?.click(), SESSION).catch(() => {});
    await page.waitForTimeout(600);
  }
  faults.push(`${where}: no step offered Practice this from a result's idea`);
  return null;
}

/** A look changed on a page: the app's notice ("Now using …", with Undo). */
async function lookNotice(page, hash, theme) {
  await go(page, hash);
  await page.evaluate(async (id) => (await import("/js/lx/theme.js")).useTheme(id), theme);
  await page.waitForTimeout(800);
  return measure(page);
}

try {
  for (const size of SIZES) {
    const { context, page } = await device(size);
    try {
      await stage(`${size.name}: a session's Practice this toast is its own small pill under the session's top, over nothing that takes a press, drawn as it was while Continue changes the step`, async () => {
        const faults = [];
        const shots = [];
        const shown = await practiceThis(page, faults, size.name, shots);
        assert(!faults.length, faults.join("\n"));
        return `"${shown.text}" ${Math.round(shown.box.width)} × ${Math.round(shown.box.height)} at ${Math.round(shown.box.y)}, ${shown.lines} line(s) (${shots.join(", ")})`;
      });
      if (size.name === "390")
        await stage("390: the guard sees a toast drawn under a step's ghosts (planted: its layer just under motion.js's, as inside the session before)", async () => {
          const faults = [];
          const shown = await practiceThis(page, faults, size.name, [], { plant: true, lessonFirst: false });
          assert(shown, faults.join("\n") || "no toast to plant under");
          assert(shown.worst > 0.05, `planted under the ghosts, only ${Math.round(shown.worst * 100)}% of its pixels changed as the step left: the guard can't see it`);
          return `${Math.round(shown.worst * 100)}% of its pixels changed as the step left over it`;
        });
      // Leave the session, whatever state the stage left it in.
      await page.evaluate(() => (location.hash = "#today"));
      await page.waitForTimeout(1500);
      await stage(`${size.name}: the notice of a look changed is its own small pill on Home, Study, Knowledge, the AI section and Settings → Language, over nothing that stays put and takes a press (the tabs, the header, a pinned action)`, async () => {
        const faults = [];
        const seen = [];
        let theme = "graphite";
        for (const [name, hash] of [["Home", "#today"], ["Study", "#study"], ["Knowledge", "#know"], ["AI", "#ai"], ["Settings → Language", "#settings/language"]]) {
          const shown = await lookNotice(page, hash, theme);
          await page.screenshot({ path: join(OUT, `notice-${size.name}-${name.replace(/[^a-z]+/gi, "-").toLowerCase()}.png`) });
          faults.push(...faultsOf(`${size.name}, ${name}`, shown, { onPage: true }));
          if (shown) seen.push(`${name} ${Math.round(shown.box.width)} × ${Math.round(shown.box.height)}${shown.covers.length ? ` (over ${shown.covers.map((c) => c.name).join(", ")})` : ""}`);
          theme = theme === "graphite" ? "paper" : "graphite";
          await page.waitForTimeout(400);
        }
        assert(!faults.length, faults.join("\n"));
        return seen.join("; ");
      });
    } finally {
      await context.close();
    }
  }
  await stage("no console error or page error", async () => {
    assert(!errors.length, errors.slice(0, 8).join(" | "));
  });
} finally {
  await browser.close();
  writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
