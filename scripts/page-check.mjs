// Moving between a tab's pages on a phone, iPhone-style (shell/page-slide.js): going deeper slides the page in from the
// right over the one leaving, which moves a third of the way left (350 ms); back is the reverse, by the header's Back
// (back in the app's history), the browser's back, or a swipe from the left edge that follows the finger and goes
// past half or flicked, springing back short of that. The arriving page is pressable from the first frame; back
// restores each page's scroll; a page opened cold goes back to its parent without leaving the app; tab switches don't
// slide; nothing moves with animations off; nothing shifts; the header's band lies over nothing at rest. Real touch through CDP. LOCAL only: it signs up a test
// account, and deletes it.
// Usage: node scripts/page-check.mjs http://localhost:<port> <outDir>   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/page-check.mjs http://localhost:<port> <outDir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const W = 390;
const SLIDE_MS = 350;

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const desk = await browser.newContext();
const signup = await desk.newPage();
const dcdp = await desk.newCDPSession(signup);
await dcdp.send("WebAuthn.enable");
await dcdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await signup.goto(`${BASE}/app/`);
await signup.waitForURL(/\/login\?next=/);
await signup.click("summary");
await signup.fill('input[name="name"]', "Page Check");
await signup.click('#register button[type="submit"]');
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
const phone = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
// --swap <path under public>=<file>: the app with files as they were, to see a stage fail on what it holds.
for (let i = process.argv.indexOf("--swap"); i >= 0; i = process.argv.indexOf("--swap", i + 1)) {
  const [path, file] = process.argv[i + 1].split("=");
  await phone.route(`**/${path}*`, (route) => route.fulfill({ path: file, contentType: path.endsWith(".css") ? "text/css" : "text/javascript" }));
}
await phone.addCookies(await desk.cookies());
// Every layout shift, from the start.
await phone.addInitScript(() => {
  window.lxShifts = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.lxShifts.push({ at: entry.startTime, value: entry.value });
  }).observe({ type: "layout-shift", buffered: true });
});
let page = await phone.newPage();
let cdp = await phone.newCDPSession(page);
const errors = [];
const watch = (p) => p.on("pageerror", (e) => errors.push(String(e)));
watch(page);
const results = {};
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
async function stage(name, fn) {
  try {
    results[name] = { ok: true, note: (await fn()) ?? "" };
    console.log(`PASS ${name}: ${results[name].note}`);
  } catch (error) {
    failed++;
    results[name] = { ok: false, note: String(error.stack ?? error) };
    console.log(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: `${OUT}/fail-${Object.keys(results).length}.png` }).catch(() => {});
  }
}
const wait = (ms) => page.waitForTimeout(ms);
const REAL = '[data-part="page"]:not([data-ghost])';

// Every frame while something happens: the pictures of pages on the screen (left to right as drawn, underneath
// first), the real page's own place, and whether its page is still unseen.
const record = () =>
  page.evaluate(() => {
    window.lxFrames = [];
    const t0 = performance.now();
    const tick = () => {
      if (!window.lxFrames) return;
      const real = document.querySelector('[data-part="page"]:not([data-ghost])');
      window.lxFrames.push({
        t: Math.round(performance.now() - t0),
        ghosts: [...document.querySelectorAll('[data-page-picture]')].map((g) => ({ left: Math.round(g.getBoundingClientRect().left), clip: getComputedStyle(g).clipPath })),
        real: Math.round(real.getBoundingClientRect().left),
        hidden: Boolean(real.querySelector(":scope > .lx-view")?.hasAttribute("data-motion-hidden")),
        hash: location.hash,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const stop = () =>
  page.evaluate(() => {
    const frames = window.lxFrames;
    window.lxFrames = null;
    return frames;
  });
// A slide's frames: those with two pictures, the page over the other (drawn last) and the one underneath.
const slideOf = (frames) => {
  const both = frames.filter((f) => f.ghosts.length >= 2);
  if (!both.length) return null;
  const first = both[0];
  const last = both[both.length - 1];
  return { frames: both.length, ms: last.t - first.t, top: [first.ghosts.at(-1).left, last.ghosts.at(-1).left], under: [first.ghosts[0].left, last.ghosts[0].left], hidden: both.every((f) => f.hidden) };
};
const shiftsSince = (t) => page.evaluate((since) => window.lxShifts.filter((s) => s.at >= since).reduce((sum, s) => sum + s.value, 0), t);
const now = () => page.evaluate(() => performance.now());
/** A page of its own for a stage (its history starts here), opened at `hash`. */
async function fresh(hash) {
  await page.close().catch(() => {});
  page = await phone.newPage();
  watch(page);
  cdp = await phone.newCDPSession(page);
  await page.goto(`${BASE}/app/${hash}`);
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForFunction((h) => location.hash === h, hash);
  await wait(500);
}
const settings = async () => {
  await fresh("#settings");
  await page.waitForSelector('a[href="#settings/appearance"]');
};
const tapLink = async (href) => {
  const link = page.locator(`${REAL} a[href="${href}"]:visible`).first();
  await link.scrollIntoViewIfNeeded();
  await link.tap();
};
const onPage = (hash) => page.waitForFunction((h) => location.hash === h, hash, { timeout: 10_000 });
const scrollOf = () => page.evaluate((sel) => Math.round(document.querySelector(sel).scrollTop), REAL);

await stage("going deeper slides the page in from the right over the one leaving, which moves a third left (350 ms)", async () => {
  await settings();
  const t = await now();
  await record();
  await tapLink("#settings/appearance");
  await onPage("#settings/appearance");
  await wait(SLIDE_MS + 300);
  const s = slideOf(await stop());
  const shift = await shiftsSince(t);
  assert(s, "no slide: the page just changed");
  assert(s.top[0] > W * 0.6 && Math.abs(s.top[1]) <= 6, `the arriving page went ${s.top[0]} → ${s.top[1]}`);
  assert(Math.abs(s.under[0]) <= 6 && Math.abs(s.under[1] + W * 0.33) <= 14, `the leaving page went ${s.under[0]} → ${s.under[1]} (a third: ${-Math.round(W * 0.33)})`);
  assert(s.ms >= SLIDE_MS - 90 && s.ms <= SLIDE_MS + 110, `it took ${s.ms} ms`);
  assert(s.hidden, "the real page showed before its picture landed");
  assert(shift <= 0.001, `layout shift ${shift.toFixed(4)}`);
  return `arriving ${s.top[0]} → ${s.top[1]}, leaving ${s.under[0]} → ${s.under[1]} in ${s.ms} ms (${s.frames} frames); shift ${shift.toFixed(4)}`;
});

await stage("the arriving page is pressable from the first frame: a press during the slide lands on it", async () => {
  await settings();
  await record();
  await tapLink("#settings/appearance");
  // As soon as the page is in place (unseen, its picture still sliding), press where its Animations "On" is: at the
  // top of Appearance, on the screen.
  await page.waitForFunction((sel) => [...document.querySelectorAll(`${sel} [data-part="segment"]`)].some((b) => b.textContent.trim() === "On"), REAL, { polling: "raf" });
  const at = await page.evaluate((sel) => {
    const on = [...document.querySelectorAll(`${sel} [data-part="segment"]`)].find((b) => b.textContent.trim() === "On");
    const r = on.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, sliding: document.querySelectorAll('[data-page-picture]').length, hidden: Boolean(on.closest("[data-motion-hidden]")) };
  }, REAL);
  await page.touchscreen.tap(at.x, at.y);
  await wait(SLIDE_MS + 200);
  await stop();
  const pressed = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-part="segment"]`)].find((b) => b.textContent.trim() === "On")?.getAttribute("aria-pressed"), REAL);
  // Back to "Match device", as the account had it.
  await page.locator(`${REAL} [data-part="segment"]`, { hasText: /^Match device$/ }).first().tap().catch(() => {});
  assert(at.sliding >= 2 && at.hidden, `the slide had ended before the press (${at.sliding} pictures, page unseen: ${at.hidden})`);
  assert(pressed === "true", `Animations "On" after the press during the slide: aria-pressed ${pressed}`);
  return `pressed Animations "On" at (${Math.round(at.x)}, ${Math.round(at.y)}) with ${at.sliding} pictures sliding and the page still unseen: it took the press`;
});

await stage("back (the browser's) slides the page out to the right, uncovering the one before", async () => {
  await settings();
  await tapLink("#settings/appearance");
  await onPage("#settings/appearance");
  await wait(SLIDE_MS + 300);
  const t = await now();
  await record();
  await page.evaluate(() => history.back());
  await onPage("#settings");
  await wait(SLIDE_MS + 300);
  const s = slideOf(await stop());
  const shift = await shiftsSince(t);
  assert(s, "no slide on back");
  assert(Math.abs(s.top[0]) <= 6 && s.top[1] > W * 0.6, `the leaving page went ${s.top[0]} → ${s.top[1]}`);
  assert(Math.abs(s.under[0] + W * 0.33) <= 14 && Math.abs(s.under[1]) <= 6, `the page before came ${s.under[0]} → ${s.under[1]}`);
  assert(shift <= 0.001, `layout shift ${shift.toFixed(4)}`);
  return `leaving ${s.top[0]} → ${s.top[1]}, the page before ${s.under[0]} → ${s.under[1]} in ${s.ms} ms`;
});

await stage("the header's Back goes back in the app's history (no new entry), with the back slide", async () => {
  await settings();
  await tapLink("#settings/appearance");
  await onPage("#settings/appearance");
  await wait(SLIDE_MS + 300);
  const before = await page.evaluate(() => history.length);
  await record();
  await page.locator('[data-part="app-back"]').tap();
  await onPage("#settings");
  await wait(SLIDE_MS + 300);
  const s = slideOf(await stop());
  const after = await page.evaluate(() => history.length);
  // Forward is still there: back again in the browser's own history.
  await page.evaluate(() => history.forward());
  await onPage("#settings/appearance").catch(() => {});
  const forward = await page.evaluate(() => location.hash);
  assert(after === before, `history grew: ${before} → ${after}`);
  assert(s && s.top[1] > W * 0.6, `no back slide: ${JSON.stringify(s)}`);
  assert(forward === "#settings/appearance", `forward afterwards: ${forward}`);
  return `history ${before} → ${after}; back slide ${s.top[0]} → ${s.top[1]}; forward goes to Appearance again`;
});

await stage("back puts each page where you left it: Games scrolled, a page under it, back", async () => {
  await fresh("#settings/study");
  await page.waitForSelector('a[href="#settings/study/games"]');
  await tapLink("#settings/study/games");
  await onPage("#settings/study/games");
  await wait(SLIDE_MS + 300);
  const left = await page.evaluate((sel) => {
    const p = document.querySelector(sel);
    p.scrollTop = 700;
    return Math.round(p.scrollTop);
  }, REAL);
  await wait(200);
  await tapLink("#settings/study/speaking?from=games");
  await onPage("#settings/study/speaking?from=games");
  await wait(SLIDE_MS + 300);
  const deeper = await scrollOf();
  await page.locator('[data-part="app-back"]').tap();
  await onPage("#settings/study/games");
  await wait(SLIDE_MS + 500);
  const back = await scrollOf();
  // And a fresh push starts at the top.
  await page.locator('[data-part="app-back"]').tap();
  await onPage("#settings/study");
  await wait(SLIDE_MS + 300);
  await tapLink("#settings/study/games");
  await onPage("#settings/study/games");
  await wait(SLIDE_MS + 300);
  const freshTop = await scrollOf();
  assert(left >= 40, `Games didn't scroll: ${left}`);
  assert(Math.abs(back - left) <= 2, `back on Games at ${back}, left at ${left}`);
  assert(deeper <= 2 && freshTop <= 2, `a page arrived at deeper ${deeper}, fresh ${freshTop}`);
  return `left Games at ${left}px; Speaking (from Say it) at ${deeper}; back at ${back}; a fresh visit at ${freshTop}`;
});

await stage("a page opened cold (no page before it here): Back puts its parent in its place, with the back slide, and stays in the app", async () => {
  await fresh("#settings/appearance");
  await page.waitForSelector('[data-part="app-back"]');
  const before = await page.evaluate(() => history.length);
  await record();
  await page.locator('[data-part="app-back"]').tap();
  await onPage("#settings");
  await wait(SLIDE_MS + 300);
  const s = slideOf(await stop());
  const after = await page.evaluate(() => ({ length: history.length, path: location.pathname, hash: location.hash }));
  assert(after.path === "/app/" && after.hash === "#settings", `after Back: ${JSON.stringify(after)}`);
  assert(after.length === before, `history grew: ${before} → ${after.length}`);
  assert(s && s.top[1] > W * 0.6, `no back slide: ${JSON.stringify(s)}`);
  return `history ${before} → ${after.length}, in the app at ${after.hash}; back slide ${s.top[0]} → ${s.top[1]}`;
});

// A finger on the screen, as CDP gives one (the page stamps each touch with its own time).
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
async function drag(x0, x1, y, { steps = 12, stepMs = 16 } = {}) {
  await touch("touchStart", x0, y);
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", x0 + ((x1 - x0) * i) / steps, y);
    await wait(stepMs);
  }
}
const realX = () => page.evaluate((sel) => Math.round(new DOMMatrixReadOnly(getComputedStyle(document.querySelector(sel)).transform).m41), REAL);
const pictures = () => page.evaluate(() => document.querySelectorAll('[data-page-picture]').length);

await stage("a swipe from the left edge follows the finger: short and slow springs back; past half, or flicked, goes back", async () => {
  await page.evaluate(() => localStorage.setItem("check.swipe-back", "1"));
  await settings();
  await page.evaluate(() => localStorage.setItem("check.swipe-back", "1"));
  await tapLink("#settings/appearance");
  await onPage("#settings/appearance");
  await wait(SLIDE_MS + 300);
  // Short and slow: follows, then springs back.
  await drag(8, 150, 420);
  const mid = await realX();
  const under = await pictures();
  await wait(300);
  await touch("touchEnd", 150, 420);
  await wait(SLIDE_MS + 300);
  const sprang = { x: await realX(), hash: await page.evaluate(() => location.hash), pictures: await pictures() };
  // Past half: goes back.
  await drag(8, 260, 420);
  await wait(300);
  await touch("touchEnd", 260, 420);
  await onPage("#settings").catch(() => {});
  await wait(SLIDE_MS + 300);
  const went = { x: await realX(), hash: await page.evaluate(() => location.hash), pictures: await pictures() };
  // A flick: a short quick swipe goes back too.
  await tapLink("#settings/appearance");
  await onPage("#settings/appearance");
  await wait(SLIDE_MS + 300);
  await drag(8, 100, 420, { steps: 4, stepMs: 8 });
  await touch("touchEnd", 100, 420);
  await onPage("#settings").catch(() => {});
  await wait(SLIDE_MS + 300);
  const flicked = { x: await realX(), hash: await page.evaluate(() => location.hash), pictures: await pictures() };
  await page.evaluate(() => localStorage.removeItem("check.swipe-back"));
  assert(Math.abs(mid - 142) <= 6 && under >= 1, `under the finger at 142: the page at ${mid}, ${under} pictures underneath`);
  assert(sprang.x === 0 && sprang.hash === "#settings/appearance" && sprang.pictures === 0, `short and slow: ${JSON.stringify(sprang)}`);
  assert(went.x === 0 && went.hash === "#settings" && went.pictures === 0, `past half: ${JSON.stringify(went)}`);
  assert(flicked.x === 0 && flicked.hash === "#settings" && flicked.pictures === 0, `flicked: ${JSON.stringify(flicked)}`);
  return `the page at ${mid} under the finger at 142; short and slow sprang back; past half went; a 92 px flick went`;
});

await stage("a swipe back never leaves the page off the screen: not onto a session closed behind it, not to an entry with the same address", async () => {
  // A book or a session closes by going to its page as a new entry (main.js openBook, openSession), so the entry before is the
  // book: a swipe there went back into it, and nothing ever put the page back from where the swipe left it, off to the right.
  // On a phone every tab was black but the tab bar.
  await fresh("#study");
  await page.evaluate(() => localStorage.setItem("check.swipe-back", "1"));
  await page.evaluate(() => (location.hash = "#study/session/practice"));
  await page.waitForSelector('[data-part="session"]', { timeout: 15_000 });
  await wait(1200);
  await page.evaluate(() => (location.hash = "#study")); // as a session's close does
  await onPage("#study");
  await wait(SLIDE_MS + 800);
  await drag(8, 280, 420);
  await wait(200);
  await touch("touchEnd", 280, 420);
  await wait(2000);
  const book = { x: await realX(), hash: await page.evaluate(() => location.hash), pictures: await pictures() };
  if (book.hash !== "#study") await page.evaluate(() => (location.hash = "#study"));
  await wait(1200);
  await page.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: "Study" }).first().tap();
  await onPage("#study");
  await wait(SLIDE_MS + 300);
  const tab = { x: await realX(), pictures: await pictures() };
  // An entry whose address became the one before it (a page that put its parent's address in its place): no hashchange comes back.
  await settings();
  await page.evaluate(() => localStorage.setItem("check.swipe-back", "1"));
  await tapLink("#settings/appearance");
  await onPage("#settings/appearance");
  await wait(SLIDE_MS + 300);
  await page.evaluate(() => history.replaceState(history.state, "", "#settings"));
  await drag(8, 280, 420);
  await wait(200);
  await touch("touchEnd", 280, 420);
  await wait(2500);
  const same = { x: await realX(), pictures: await pictures(), shown: await page.evaluate((sel) => document.querySelector(sel)?.innerText.trim().length > 0, REAL) };
  await page.evaluate(() => localStorage.removeItem("check.swipe-back"));
  assert(book.x === 0 && book.pictures === 0, `after a swipe where a session was closed: the page at ${book.x}, ${book.pictures} pictures (${book.hash})`);
  assert(tab.x === 0 && tab.pictures === 0, `then another tab: the page at ${tab.x}, ${tab.pictures} pictures`);
  assert(same.x === 0 && same.pictures === 0 && same.shown, `a swipe to an entry with the same address: ${JSON.stringify(same)}`);
  return `a session closed behind: ${JSON.stringify(book)}; another tab: ${JSON.stringify(tab)}; the same address: ${JSON.stringify(same)}`;
});

await stage("a swipe back lands as it showed: the page under the finger at the far end is the page you get, on Settings scrolled to its end, the path at your place, and Home from Translate", async () => {
  // What's under the finger is a picture of the page (page-slide.js picture); once you let go the real page takes its place. Any difference between
  // the two is a jump after the swipe: the picture's scroll lost when it was put in place, its lines taller than the page's, its foot shorter, Translate's
  // box still holding what was typed. Compared in the page's own band (under the header, over the tabs), by the pixels.
  const BAND = { x: 0, y: 72, width: W, height: 620 };
  const flown = {}; // anything drawn moving on the ghost layer as the page lands: the swipe already drew the move
  // Loops (a bob that goes on forever, on the document's clock: motion.loopsOnClock) are compared at the moment the finger held: a picture held
  // still can't keep pace with a loop that goes on, but the page that lands must be where the picture was at that moment. Everything else (a pop,
  // a light-up, the scroll, the layout) is compared as it is.
  const holdLoops = (at) =>
    page.evaluate((at) => {
      window.lxHeldLoops = [];
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getTiming?.().iterations !== Infinity) continue;
        window.lxHeldLoops.push([animation, animation.startTime]);
        animation.pause();
        animation.currentTime = at - (animation.startTime ?? 0);
      }
    }, at);
  const freeLoops = () =>
    page.evaluate(() => {
      for (const [animation, start] of window.lxHeldLoops ?? []) {
        animation.play();
        animation.startTime = start;
      }
      window.lxHeldLoops = [];
    });
  const compare = async (name) => {
    await drag(2, W + 4, 430, { steps: 14, stepMs: 16 });
    await wait(300);
    const held = join(OUT, `land-${name}-held.png`);
    await page.screenshot({ path: held, clip: BAND });
    const heldAt = await page.evaluate(() => document.timeline.currentTime);
    await touch("touchEnd", W + 4, 430);
    // The first frame the real page is there, and a moment later: neither may differ from what the finger held.
    await page.waitForFunction(() => !document.querySelector("[data-page-picture]") && document.documentElement.dataset.check !== "x", null, { timeout: 5000, polling: "raf" });
    flown[name] = await page.evaluate(() => document.querySelectorAll(".lx-tr-ghost, [data-motion-layer] > *").length);
    const first = join(OUT, `land-${name}-first.png`);
    await holdLoops(heldAt);
    await page.screenshot({ path: first, clip: BAND });
    await freeLoops();
    await wait(1400);
    const landed = join(OUT, `land-${name}-landed.png`);
    await holdLoops(heldAt);
    await page.screenshot({ path: landed, clip: BAND });
    await freeLoops();
    const share = (shot, tag) => {
      const run = spawnSync("magick", ["compare", "-metric", "AE", "-fuzz", "12%", held, shot, join(OUT, `land-${name}-diff-${tag}.png`)], { encoding: "utf8" });
      const differing = Number(String(run.stderr).trim().split(/\s/)[0]);
      assert(Number.isFinite(differing), `magick compare said: ${run.stderr}`);
      return Math.round((differing / (BAND.width * BAND.height * 9)) * 10000) / 100; // device pixels, at 3x
    };
    return Math.max(share(first, "first"), share(landed, "landed"));
  };
  await settings();
  await page.evaluate(() => localStorage.setItem("check.swipe-back", "1"));
  await page.evaluate((sel) => { const p = document.querySelector(sel); p.scrollTop = p.scrollHeight; }, REAL);
  await wait(300);
  await page.evaluate(() => (location.hash = "#settings/appearance"));
  await onPage("#settings/appearance");
  await wait(SLIDE_MS + 400);
  const settingsShare = await compare("settings");
  await fresh("#study/path");
  await page.evaluate(() => localStorage.setItem("check.swipe-back", "1"));
  await wait(1500);
  const pathScroll = await page.evaluate((sel) => document.querySelector(sel).scrollTop, REAL);
  // A page of Study's the path opens (its foot's More lessons, which says to come back to it), then the swipe back to the path: it lands as it was
  // left, lit, never lighting up again (its pop would be drawn moving as it lands).
  await page.evaluate(() => (location.hash = "#study/more-lessons?from=path"));
  await onPage("#study/more-lessons?from=path");
  await wait(SLIDE_MS + 900);
  const pathShare = await compare("path");
  await fresh("#today");
  await page.evaluate(() => localStorage.setItem("check.swipe-back", "1"));
  const field = page.locator('[data-part="translate-field"] :is(textarea, input)').first();
  await field.tap({ position: { x: 24, y: 20 } });
  await page.keyboard.type("hoi");
  await wait(1500);
  await field.evaluate((n) => n.blur());
  await wait(600);
  const translateShare = await compare("translate");
  const translateAfter = await page.evaluate(() => ({ hash: location.hash, tabs: getComputedStyle(document.querySelector('[data-part="tab-bar"]')).opacity, swipe: document.documentElement.hasAttribute("data-swipe-back") }));
  await page.evaluate(() => localStorage.removeItem("check.swipe-back"));
  const shares = { settings: settingsShare, path: pathShare, translate: translateShare };
  assert(settingsShare <= 0.5, `Settings at its end: ${settingsShare}% of the page changed once let go (land-settings-*.png)`);
  assert(pathShare <= 0.5, `the path at your place (scrolled ${pathScroll}): ${pathShare}% changed once let go (land-path-*.png)`);
  assert(translateShare <= 1, `Home from Translate: ${translateShare}% changed once let go (land-translate-*.png)`);
  assert(!flown.translate, `Home from Translate: the box moved again as the page landed (${flown.translate} drawn moving)`);
  assert(!flown.path, `the path lit up again as it landed (${flown.path} drawn moving)`);
  assert(translateAfter.hash === "#today" && translateAfter.tabs === "1" && !translateAfter.swipe, `after Translate: ${JSON.stringify(translateAfter)}`);
  return `changed once let go: ${JSON.stringify(shares)} (% of the page's band); drawn moving as it landed: ${JSON.stringify(flown)}; the path scrolled ${pathScroll}`;
});

await stage("switching tabs doesn't slide (it's not deeper or back)", async () => {
  await fresh("#today");
  await record();
  await page.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: "Study" }).first().tap();
  await onPage("#study");
  await wait(SLIDE_MS + 300);
  const s = slideOf(await stop());
  assert(!s, `slid: ${JSON.stringify(s)}`);
  return "Today → Study, no slide";
});

await stage("with animations off nothing moves, and back still puts a page where you left it", async () => {
  await fresh("#settings/study");
  await page.waitForSelector('a[href="#settings/study/games"]');
  await page.evaluate(() => document.documentElement.setAttribute("data-motion", "off"));
  await record();
  await tapLink("#settings/study/games");
  await onPage("#settings/study/games");
  await wait(200);
  const pushFrames = await stop();
  const left = await page.evaluate((sel) => {
    const p = document.querySelector(sel);
    p.scrollTop = 600;
    return Math.round(p.scrollTop);
  }, REAL);
  await tapLink("#settings/study/speaking?from=games");
  await onPage("#settings/study/speaking?from=games");
  await wait(200);
  await record();
  await page.locator('[data-part="app-back"]').tap();
  await onPage("#settings/study/games");
  await wait(500);
  const popFrames = await stop();
  const back = await scrollOf();
  await page.evaluate(() => document.documentElement.removeAttribute("data-motion"));
  const moved = [...pushFrames, ...popFrames].filter((f) => f.ghosts.length || f.hidden || f.real !== 0);
  assert(!moved.length, `something moved: ${JSON.stringify(moved.slice(0, 3))}`);
  assert(left >= 40, `Games didn't scroll: ${left}`);
  assert(Math.abs(back - left) <= 2, `back at ${back}, left at ${left}`);
  return `no pictures, nothing unseen; back at ${back} (left at ${left})`;
});

await stage("the header's band lies over nothing at rest: a page's title in its own ink, the band growing past the header only as the page scrolls", async () => {
  // The band behind the header (shell.css, app-header::after) reached 24 px past it, over a page's first line at rest, and grayed its title.
  const band = () =>
    page.evaluate((sel) => {
      const header = document.querySelector('[data-part="app"] > [data-part="app-header"]');
      const below = Math.round(header.getBoundingClientRect().bottom);
      const after = getComputedStyle(header, "::after");
      const title = document.querySelector(`${sel} [data-part="page-title"], ${sel} h1`);
      return { past: Math.round(-parseFloat(after.bottom)), below, title: title ? Math.round(title.getBoundingClientRect().top) : null, scroll: Math.round(document.querySelector(sel).scrollTop) };
    }, REAL);
  await settings();
  const rest = await band();
  assert(rest.title !== null && rest.title >= rest.below, `the title starts at ${rest.title}, under the header's foot at ${rest.below}`);
  assert(rest.past === 0, `at rest the band reaches ${rest.past} px past the header`);
  await page.evaluate((sel) => (document.querySelector(sel).scrollTop = 60), REAL);
  await wait(300);
  const scrolled = await band();
  assert(scrolled.past >= 16, `scrolled ${scrolled.scroll} px, the band reaches only ${scrolled.past} px past the header`);
  // A page under it starts at its top: the band goes with the page that's up, not the one before.
  await tapLink("#settings/study");
  await onPage("#settings/study");
  await wait(SLIDE_MS + 300);
  const next = await band();
  assert(next.scroll === 0 && next.past === 0, `the next page at ${next.scroll} px, its band ${next.past} px past the header`);
  return `at rest 0 px past the header (the title at ${rest.title}, the foot at ${rest.below}); scrolled ${scrolled.scroll} px, ${scrolled.past} px; the next page 0 px`;
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.join("\n"));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} stages passed`);
await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
await browser.close();
process.exit(failed ? 1 : 0);
