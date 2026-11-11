// A sheet as a phone uses it, with real touch input (Chrome's touch events, on a 390×844 touch phone): Explore's All
// languages, Read's Add a book or text and a reader's drawer. Over everything, the tabs too, with the page shaded
// behind it, never blacked out; it slides in; it follows the finger; let go short it springs back, past a quarter or
// flicked it slides away (never just vanishing); its content scrolls, and a pull at the content's top takes the sheet;
// its content doesn't bounce or scroll the page; the page is back the moment it goes. On a phone too busy to answer at
// once (its touch handlers running late, all in one burst), a flick still closes it and a drag held still still springs
// back: the sheet times a finger by its events' own times. The shade takes a tap even mid-slide. LOCAL only: it signs
// up a test account. The reader's stage needs the live library in the local state (skipped without it).
// Usage: node scripts/sheet-check.mjs http://localhost:<port> <outDir>   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/sheet-check.mjs http://localhost:<port> <outDir> (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
// Signing up wants a mouse context (the passkey prompt); the checks run on a touch phone with its cookies.
const desk = await browser.newContext({ viewport: { width: 390, height: 844 } });
const signup = await desk.newPage();
const vauth = await desk.newCDPSession(signup);
await vauth.send("WebAuthn.enable");
await vauth.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await signup.goto(`${BASE}/app/`);
await signup.waitForURL(/\/login\?next=/);
await signup.click("summary");
await signup.fill('input[name="name"]', "Sheet Check");
await signup.click('#register button[type="submit"]');
// Signing up is setup, not what's checked: a busy machine (sheet-check is also run beside busy Chromes) gets time.
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await phone.addCookies(await desk.cookies());
const page = await phone.newPage();
// Waits are upper bounds only (every assertion has its own measure), so a busy machine gets them too.
page.setDefaultTimeout(60_000);
// What a sheet did, recorded inside the page the moment it happened, never sampled from here afterwards (on a busy
// machine a sample taken "40 ms later" can arrive after the whole slide): right after the app has handled each lift
// (touchend) and tap (click), and at each press before the app sees it (pointerdown, capture, first in line). For the
// sheet in view: shown, closing, where it is, the slides it has running (from, to, how long), whether the page under it
// takes presses.
await page.addInitScript(() => {
  window.lxAfter = [];
  const sheetNow = () => [...document.querySelectorAll('[data-part="sheet"]')].filter((n) => !n.hidden && n.getClientRects().length).pop() ?? null;
  const note = (type) => {
    const sheet = sheetNow();
    const layer = sheet?.closest(".lx-sheet-layer");
    const tab = document.querySelector('[data-part="tab-bar"] [data-part="tab"]')?.getBoundingClientRect();
    const hit = tab ? document.elementFromPoint(tab.left + tab.width / 2, tab.top + tab.height / 2) : null;
    window.lxAfter.push({
      type,
      at: performance.now(),
      open: Boolean(sheet),
      closing: sheet?.getAttribute("data-state") === "closing" || layer?.getAttribute("data-state") === "closing",
      top: sheet ? sheet.getBoundingClientRect().top : null,
      height: sheet?.offsetHeight ?? 0,
      slides: sheet ? sheet.getAnimations().filter((a) => a.playState === "running").map((a) => { const k = a.effect.getKeyframes(); return { from: k[0]?.transform ?? null, to: k[k.length - 1]?.transform ?? null, duration: a.effect.getTiming().duration }; }) : [],
      appInert: document.querySelector('[data-part="app"]')?.hasAttribute("inert") ?? false,
      tabHit: Boolean(hit?.closest('[data-part="tab"]')),
    });
  };
  addEventListener("pointerdown", () => note("press"), true);
  addEventListener("touchend", () => note("lift"));
  addEventListener("click", () => note("tap"));
});
/** Forgets what was recorded; then `after(type)` is the latest record of that type since. */
const forget = () => page.evaluate(() => (window.lxAfter = []));
const after = async (type) => {
  await page.waitForFunction((t) => window.lxAfter.some((r) => r.type === t), type, { timeout: 30_000 }).catch(() => {});
  return page.evaluate((t) => window.lxAfter.filter((r) => r.type === t).pop() ?? null, type);
};
/** Waits until the sheet in view (and its shade) has nothing running: at rest, or gone. */
// (A sheet coming up is laid out at its slide's start, translateY(100%), in the frame it comes up in, and slides from the next: ui.sheet's lxShow.
// Until then nothing runs, and it's still on its way.)
const settle = () =>
  page.waitForFunction(() => {
    const busy = (n) => n.getAnimations({ subtree: true }).some((a) => a.playState === "running") || [n, ...n.querySelectorAll('[data-part="sheet"]')].some((x) => x.style?.transform === "translateY(100%)");
    return ![...document.querySelectorAll('.lx-sheet-layer, [data-part="sheet"]')].some((n) => !n.hidden && n.isConnected && busy(n));
  }, null, { polling: 50 });
/** Whether a slide goes from `from` (px, about) to `to`: "rest", "away" or "in". */
const slid = (record, to, from) =>
  record?.slides.some((slide) => {
    const px = (t) => (t === "none" ? 0 : /translateY\((-?[\d.]+)px\)/.exec(t ?? "")?.[1] != null ? Number(/translateY\((-?[\d.]+)px\)/.exec(t)[1]) : null);
    const start = slide.from === "translateY(100%)" ? Infinity : px(slide.from);
    const end = px(slide.to);
    const fromOk = from == null || (start != null && Math.abs(start - from) <= 4);
    if (to === "rest") return fromOk && end === 0 && start > 0 && slide.duration >= 200;
    if (to === "away") return fromOk && end != null && end > start && slide.duration > 0;
    if (to === "in") return slide.from === "translateY(100%)" && end === 0 && slide.duration >= 200;
    return false;
  }) ?? false;
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const cdp = await phone.newCDPSession(page);

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
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

// ---------- touch, as a finger does it ----------

const touch = (type, x, y, timestamp) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }], ...(timestamp ? { timestamp } : {}) });
/**
 * Puts a finger down at (x, y0) and moves it to y1 in `steps` moves `stepMs` apart; returns lift({ hold }), which lets
 * go `hold` ms after the last move. Every touch carries the time the finger was there (as a phone's hardware stamps
 * them), never later than the browser's clock: a busy machine can deliver them late, but not change what the finger did.
 */
async function press(x, y0, y1, { steps = 12, stepMs = 16 } = {}) {
  const origin = await page.evaluate(() => performance.timeOrigin + performance.now());
  const started = Date.now();
  const at = async (ms) => {
    const early = ms - (Date.now() - started);
    if (early > 0) await new Promise((r) => setTimeout(r, early));
    return (origin + ms) / 1000;
  };
  await touch("touchStart", x, y0, await at(0));
  for (let i = 1; i <= steps; i++) await touch("touchMove", x, y0 + ((y1 - y0) * i) / steps, await at(i * stepMs));
  return async ({ hold = 0 } = {}) => touch("touchEnd", x, y1, await at(steps * stepMs + Math.max(hold, 1)));
}

// ---------- the sheet on screen ----------

const LAYER = ".lx-sheet-layer:not([hidden])";
const geometry = () =>
  page.evaluate((sel) => {
    const layer = document.querySelector(sel);
    const sheet = layer?.querySelector('[data-part="sheet"]');
    const body = sheet?.querySelector(".lx-sheet-body");
    const scrim = layer?.querySelector('[data-part="sheet-scrim"]');
    const tab = document.querySelector('[data-part="tab-bar"] [data-part="tab"]');
    const tabBox = tab?.getBoundingClientRect();
    const hit = tabBox ? document.elementFromPoint(tabBox.left + tabBox.width / 2, tabBox.top + tabBox.height / 2) : null;
    const handle = sheet?.querySelector('[data-part="sheet-handle"]')?.getBoundingClientRect();
    return {
      open: Boolean(sheet && !sheet.hidden && getComputedStyle(sheet).display !== "none"),
      closing: layer?.getAttribute("data-state") === "closing",
      top: sheet?.getBoundingClientRect().top ?? null,
      height: sheet?.offsetHeight ?? 0,
      handle: handle ? { x: handle.left + handle.width / 2, y: handle.top + handle.height / 2 } : null,
      scrollTop: body?.scrollTop ?? 0,
      scrollable: body ? body.scrollHeight - body.clientHeight : 0,
      bodyBox: body ? body.getBoundingClientRect().toJSON() : null,
      scrimOpacity: scrim ? Number(getComputedStyle(scrim).opacity) : null,
      scrimColor: scrim ? getComputedStyle(scrim).backgroundColor : null,
      overscroll: body ? getComputedStyle(body).overscrollBehaviorY : null,
      tabCovered: Boolean(hit && layer?.contains(hit)),
      tabHit: hit ? hit.closest('[data-part="tab"]') !== null : false,
      appInert: document.querySelector('[data-part="app"]')?.hasAttribute("inert") ?? false,
      pageShown: getComputedStyle(document.querySelector('[data-part="page"]')).visibility !== "hidden",
    };
  }, LAYER);
const alpha = (color) => {
  const m = /rgba?\(([^)]+)\)/.exec(color ?? "");
  const parts = m ? m[1].split(",").map(Number) : [];
  return parts.length === 4 ? parts[3] : 1;
};

async function openAllLanguages() {
  // From nothing open: a sheet left by a stage before is closed first.
  if (await page.locator(LAYER).count()) {
    await page.keyboard.press("Escape");
    await page.waitForSelector(LAYER, { state: "detached" });
  }
  await page.goto(`${BASE}/app/#explore`);
  await page.waitForSelector("html[data-app-ready]");
  // Explore's row to the other languages (a button that opens their sheet), found afresh once the counts have arrived.
  await page.waitForLoadState("networkidle");
  const all = page.locator('[data-part="list-row"]', { hasText: "Change target language" });
  let box = null;
  for (let i = 0; i < 5 && !box; i++) {
    await all.waitFor({ timeout: 15_000 });
    // The last choice in a row that scrolls sideways: brought into view first, as a thumb would, to the middle of the screen (at its
    // foot it sits under the floating tab bar, which takes the tap: Explore's topics pushed it down there on 6 Nov).
    box = await all.evaluate((n) => (n.scrollIntoView({ inline: "center", block: "center" }), true)).then(
      async () => (await wait(300), all.boundingBox()),
      () => null,
    );
  }
  await touch("touchStart", box.x + box.width / 2, box.y + box.height / 2);
  await touch("touchEnd", box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector(`${LAYER} [data-part="sheet"]`);
}

let rest = null;

await stage("All languages: over the tabs, the page shaded behind it (never black), and it slides in", async () => {
  await forget();
  await openAllLanguages();
  // Its slide, once it runs (it starts the frame after the one it's laid out in).
  const opened = await page.evaluate(
    () =>
      new Promise((done) => {
        const t0 = performance.now();
        const look = () => {
          const sheet = document.querySelector('.lx-sheet-layer:not([hidden]) [data-part="sheet"]');
          const slides = sheet ? sheet.getAnimations().filter((a) => a.playState === "running").map((a) => { const k = a.effect.getKeyframes(); return { from: k[0]?.transform ?? null, to: k[k.length - 1]?.transform ?? null, duration: a.effect.getTiming().duration }; }) : [];
          if (slides.length || performance.now() - t0 > 2000) return done({ slides });
          requestAnimationFrame(look);
        };
        look();
      }),
  );
  await settle();
  const g = await geometry();
  rest = g;
  await shot("01-open");
  assert(g.open && g.tabCovered && !g.tabHit, `the tabs are under it: ${JSON.stringify({ covered: g.tabCovered, tabHit: g.tabHit })}`);
  assert(g.scrimOpacity === 1 && alpha(g.scrimColor) >= 0.2 && alpha(g.scrimColor) <= 0.7 && g.pageShown, `a translucent shade over the page: ${g.scrimColor} at ${g.scrimOpacity}`);
  assert(g.appInert, "the page under it can't be pressed");
  assert(slid(opened, "in"), `it slides in from below as it opens: ${JSON.stringify(opened?.slides)}`);
  assert(g.top >= 24, `clear of the top of the screen: ${g.top}`);
  return `slid in (${opened.slides.map((x) => `${x.from} → ${x.to}, ${x.duration} ms`).join("; ")}); rests at ${Math.round(g.top)}px (${g.height}px tall); shade ${g.scrimColor}`;
});

await stage("its handle: the sheet follows the finger, and the shade lightens with it", async () => {
  const g = await geometry();
  const lift = await press(g.handle.x, g.handle.y, g.handle.y + 120);
  const mid = await geometry();
  await lift({ hold: 300 });
  await settle();
  assert(Math.abs(mid.top - (g.top + 120)) <= 3, `followed: ${Math.round(mid.top)} for ${Math.round(g.top + 120)}`);
  assert(mid.scrimOpacity < 0.95 && mid.scrimOpacity > 0.5, `the shade follows: ${mid.scrimOpacity}`);
  return `120 px down: top ${Math.round(mid.top)} (from ${Math.round(g.top)}), shade ${mid.scrimOpacity.toFixed(2)}`;
});

await stage("let go short of a quarter, slowly: it springs back, animated, never jumping", async () => {
  const g = await geometry();
  const down = g.height * 0.15;
  await forget();
  const lift = await press(g.handle.x, g.handle.y, g.handle.y + down);
  await lift({ hold: 200 }); // held still: no flick
  const let_go = await after("lift");
  await settle();
  const back = await geometry();
  assert(let_go?.open && !let_go.closing && slid(let_go, "rest", down), `let go ${Math.round(down)} px down, it springs back from there: ${JSON.stringify(let_go)}`);
  assert(back.open && Math.abs(back.top - g.top) <= 1 && back.scrimOpacity === 1, `back at rest: ${Math.round(back.top)}`);
  return `let go ${Math.round(down)} px down: ${let_go.slides.map((x) => `${x.from} → ${x.to}, ${x.duration} ms`).join("; ")}; then at ${Math.round(back.top)}`;
});

await stage("its content scrolls under the finger, and the sheet stays put", async () => {
  const g = await geometry();
  assert(g.scrollable > 100, `the list is longer than the sheet: ${g.scrollable}px more`);
  const x = g.bodyBox.left + g.bodyBox.width / 2;
  const y = g.bodyBox.top + g.bodyBox.height * 0.8;
  const lift = await press(x, y, y - 300, { steps: 15, stepMs: 16 });
  const mid = await geometry();
  await lift({ hold: 200 });
  await wait(800);
  const later = await geometry();
  assert(later.scrollTop > 100, `it scrolled: ${later.scrollTop}`);
  assert(Math.abs(mid.top - g.top) <= 1 && Math.abs(later.top - g.top) <= 1, `the sheet didn't move: ${mid.top} → ${later.top}`);
  assert(g.overscroll === "none", `its content doesn't bounce or scroll the page: overscroll-behavior ${g.overscroll}`);
  return `scrolled to ${Math.round(later.scrollTop)} of ${g.scrollable}; overscroll ${g.overscroll}`;
});

await stage("scrolled down, a pull down scrolls the content back; at its top, the next pull takes the sheet", async () => {
  const g = await geometry();
  const x = g.bodyBox.left + g.bodyBox.width / 2;
  const y = g.bodyBox.top + 40;
  let lift = await press(x, y, y + 60, { steps: 6 });
  const mid = await geometry();
  await lift({ hold: 200 });
  await wait(600);
  assert(Math.abs(mid.top - g.top) <= 1, `a pull while scrolled is the content's: the sheet went to ${mid.top}`);
  // Back to the top, then pause past the scroll lock.
  await page.evaluate((sel) => (document.querySelector(`${sel} .lx-sheet-body`).scrollTop = 0), LAYER);
  await wait(300);
  lift = await press(x, y, y + 100, { steps: 10 });
  const pulled = await geometry();
  await lift({ hold: 200 });
  await settle();
  const back = await geometry();
  assert(pulled.top > g.top + 80, `at the top a pull takes the sheet: ${Math.round(pulled.top)} (rest ${Math.round(g.top)})`);
  assert(back.open && Math.abs(back.top - g.top) <= 1, `a short pull springs back: ${back.top}`);
  return `while scrolled the sheet stayed at ${Math.round(mid.top)}; at the top a 100 px pull took it to ${Math.round(pulled.top)}`;
});

await stage("let go past a quarter: it slides away from the finger (no jump), and the page is back at once", async () => {
  const g = await geometry();
  const lift = await press(g.handle.x, g.handle.y, g.handle.y + g.height * 0.4);
  const held = await geometry();
  await forget();
  await lift({ hold: 150 });
  const going = await after("lift");
  await shot("02-closing");
  await settle();
  const gone = await geometry();
  const down = held.top - g.top;
  assert(going?.open && going.closing && slid(going, "away", down), `let go ${Math.round(down)} px down, it slides away from there: ${JSON.stringify(going)}`);
  assert(going.tabHit && !going.appInert, "the page takes presses the moment it starts going");
  assert(!gone.open, "then it's gone");
  return `let go ${Math.round(down)} px down: ${going.slides.map((x) => `${x.from} → ${x.to}, ${x.duration} ms`).join("; ")}, the page pressable at once; gone after`;
});

await stage("a flick down closes it, however short", async () => {
  await openAllLanguages();
  await settle();
  const g = await geometry();
  await forget();
  const lift = await press(g.handle.x, g.handle.y, g.handle.y + 70, { steps: 4, stepMs: 12 });
  await lift({ hold: 4 });
  const going = await after("lift");
  await settle();
  const gone = await geometry();
  assert(going?.closing && slid(going, "away", 70) && !gone.open, `a quick 70 px flick (48 ms) closes it: ${JSON.stringify(going)}`);
  return `70 px in 48 ms: ${going.slides.map((x) => `${x.from} → ${x.to}, ${x.duration} ms`).join("; ")}; gone`;
});

/**
 * Watches the open layer from inside the page (a check's own polling is too slow on a busy machine): when it starts
 * closing and when it's gone, in ms from now. Returns read(), which waits up to `ms` for it to be gone.
 */
async function watchClose() {
  await page.evaluate((sel) => {
    const layer = document.querySelector(sel);
    const t0 = performance.now();
    const seen = (window.lxCloseSeen = { closing: null, gone: null });
    const look = () => {
      if (seen.closing == null && layer.getAttribute("data-state") === "closing") seen.closing = performance.now() - t0;
      if (seen.gone == null && (layer.hidden || !layer.isConnected)) seen.gone = performance.now() - t0;
    };
    new MutationObserver(look).observe(layer, { attributes: true });
    new MutationObserver(look).observe(document.body, { childList: true });
  }, LAYER);
  return async (ms = 3000) => {
    await page.waitForFunction(() => window.lxCloseSeen.gone != null, null, { timeout: ms }).catch(() => {});
    return page.evaluate(() => window.lxCloseSeen);
  };
}

/**
 * A flick on a phone too busy to answer at once: its main thread is held for `busy` ms from the moment the finger goes
 * down, so every touch handler runs late, all in one burst. The touches carry the times the finger was there (as a
 * phone's touch events do), `steps` moves `stepMs` apart over `distance` px.
 */
async function busyFlick(g, { busy = 300, distance = 70, steps = 4, stepMs = 12 } = {}) {
  const { origin, now } = await page.evaluate(() => ({ origin: performance.timeOrigin, now: performance.now() }));
  const at = (ms) => (origin + now + 30 + ms) / 1000;
  page.evaluate((ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end);
  }, busy).catch(() => {});
  await wait(10);
  const sent = [touch("touchStart", g.handle.x, g.handle.y, at(0))];
  for (let i = 1; i <= steps; i++) sent.push(touch("touchMove", g.handle.x, g.handle.y + (distance * i) / steps, at(i * stepMs)));
  sent.push(touch("touchEnd", g.handle.x, g.handle.y + distance, at(steps * stepMs + 4)));
  await Promise.all(sent);
}

await stage("a flick still closes it on a busy phone (its handlers running late, all at once)", async () => {
  await openAllLanguages();
  await settle();
  const g = await geometry();
  const read = await watchClose();
  await busyFlick(g);
  const seen = await read();
  assert(seen.closing != null && seen.gone != null, `a 70 px flick in 50 ms, handled 300 ms late: ${seen.closing == null ? "it sprang back" : "it never went"} (${JSON.stringify(seen)})`);
  return `closed: closing at ${Math.round(seen.closing)} ms, gone at ${Math.round(seen.gone)} ms`;
});

await stage("a slow drag that stops before letting go isn't a flick, on a busy phone too", async () => {
  await openAllLanguages();
  await settle();
  const g = await geometry();
  // 40 px down (short of a quarter), held still 200 ms, then let go: it springs back.
  const { origin, now } = await page.evaluate(() => ({ origin: performance.timeOrigin, now: performance.now() }));
  const at = (ms) => (origin + now + 30 + ms) / 1000;
  page.evaluate(() => {
    const end = performance.now() + 400;
    while (performance.now() < end);
  }).catch(() => {});
  await wait(10);
  await forget();
  await Promise.all([touch("touchStart", g.handle.x, g.handle.y, at(0)), ...[1, 2, 3, 4].map((i) => touch("touchMove", g.handle.x, g.handle.y + 10 * i, at(i * 12))), touch("touchEnd", g.handle.x, g.handle.y + 40, at(48 + 200))]);
  const let_go = await after("lift");
  await settle();
  const back = await geometry();
  assert(let_go?.open && !let_go.closing && slid(let_go, "rest", 40) && Math.abs(back.top - g.top) < 2, `held still, then let go: ${JSON.stringify({ let_go, top: back.top, rest: g.top })}`);
  return `sprang back: ${let_go.slides.map((x) => `${x.from} → ${x.to}`).join("; ")}`;
});

await stage("the shade takes a tap while the sheet is sliding (springing back from a drag, and sliding in)", async () => {
  // Springing back: let go short, and tap the shade straight after (the tap queued behind the lift, so it lands
  // while the spring-back runs, and right after a drag, whose own click the sheet swallows).
  await openAllLanguages();
  await settle();
  const g = await geometry();
  await forget();
  const lift = await press(g.handle.x, g.handle.y, g.handle.y + g.height * 0.15);
  const read = await watchClose();
  await lift({ hold: 200 });
  await touch("touchStart", 195, 60);
  await touch("touchEnd", 195, 60);
  const seen = await read();
  const press1 = await page.evaluate(() => window.lxAfter.filter((r) => r.type === "press").pop() ?? null);
  assert(press1?.slides.length > 0, `the shade was pressed while the spring-back ran: ${JSON.stringify(press1)}`);
  assert(seen.closing != null && seen.gone != null, `a tap on the shade during the spring-back closes it: ${JSON.stringify(seen)}`);
  // Sliding in: tapped as soon as the sheet is there.
  await forget();
  await openAllLanguages();
  const read2 = await watchClose();
  await touch("touchStart", 195, 60);
  await touch("touchEnd", 195, 60);
  const seen2 = await read2();
  const press2 = await page.evaluate(() => window.lxAfter.filter((r) => r.type === "press").pop() ?? null);
  assert(seen2.closing != null && seen2.gone != null, `a tap on the shade as it slides in closes it: ${JSON.stringify(seen2)}`);
  return `springing back: closed (closing at ${Math.round(seen.closing)} ms); sliding in: closed${press2?.slides.length ? "" : " (the slide had ended by the tap)"}`;
});

await stage("the shade and Escape close it too, sliding away", async () => {
  await openAllLanguages();
  await settle();
  const read = await watchClose();
  await touch("touchStart", 195, 60);
  await touch("touchEnd", 195, 60);
  const seen = await read();
  // It slides away (a closing state first, then gone), however long the tap took to arrive.
  assert(seen.closing != null && seen.gone != null && seen.gone > seen.closing, `a tap on the shade: ${JSON.stringify(seen)}`);
  await openAllLanguages();
  await settle();
  await page.keyboard.press("Escape");
  await settle();
  assert(!(await geometry()).open, "Escape closed it");
  return "shade and Escape";
});

await stage("Read's Add a book or text: the same sheet, over the tabs", async () => {
  await page.goto(`${BASE}/app/#read`);
  await page.waitForSelector("html[data-app-ready]");
  const add = page.locator('[data-part="page"] [data-read-add]');
  await add.waitFor();
  // Read's library drawn (its first draw fills in after the page: the button moves until then; tab-check holds that).
  // (steady for a moment: nothing of yours on a new account, so the library alone can't say it's done.)
  for (let last = null, i = 0; i < 40; i++) { const top = (await add.boundingBox())?.y; if (top === last) break; last = top; await page.waitForTimeout(400); }
  await add.scrollIntoViewIfNeeded(); // under a first book, off a phone's first screen
  const box = await add.boundingBox();
  await touch("touchStart", box.x + box.width / 2, box.y + box.height / 2);
  await touch("touchEnd", box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector(`${LAYER} [data-part="sheet"]`);
  await settle();
  const g = await geometry();
  await shot("03-read-add");
  assert(g.open && g.tabCovered && g.appInert, "over the tabs, the page not to be pressed");
  await forget();
  const lift = await press(g.handle.x, g.handle.y, g.handle.y + g.height * 0.45);
  await lift({ hold: 150 });
  const going = await after("lift");
  await settle();
  assert(going?.open && going.closing && slid(going, "away") && !(await geometry()).open, `dragged away, it slides off: ${JSON.stringify(going)}`);
  // The same sheet again (Read keeps one): back at rest, not left where its last slide ended.
  await page.locator('[data-part="page"] [data-read-add]').tap();
  await page.waitForSelector(`${LAYER} [data-part="sheet"]`);
  await settle();
  const again = await geometry();
  assert(again.open && Math.abs(again.top - g.top) <= 1, `opened again, it rests where it did: ${Math.round(again.top)} (was ${Math.round(g.top)})`);
  await page.keyboard.press("Escape");
  await settle();
  return `rests at ${Math.round(g.top)}; dragged away, sliding; opened again at ${Math.round(again.top)}`;
});

await stage("a reader's drawer (Reading settings): follows the finger and slides away", async () => {
  const catalogue = await page.evaluate(async () => (await fetch("/library/catalogue.json")).json().catch(() => null));
  const meta = catalogue?.books?.find((b) => b.layers?.nl?.kind === "weave") ?? catalogue?.books?.[0];
  if (!meta) return "no library on this server (skipped)";
  await page.goto(`${BASE}/app/#read`);
  await page.waitForSelector("html[data-app-ready]");
  // Its cover on Read when it's on the lead shelf or up front; else (a shelf that's a counted row on Read) Find a book's row.
  const tile = page.locator(':is(.lx-read-shelf, .lx-continue-top) [data-part="book-tile"]', { hasText: meta.title.slice(0, 20) }).first();
  await page.waitForSelector('.lx-read-shelf :is(.lx-shelf-section[data-lead] [data-part="book-tile"], [data-part="empty-state"])', { timeout: 30_000 });
  if (await tile.count()) await tile.tap();
  else {
    await page.evaluate((q) => (location.hash = `#read/find?${new URLSearchParams({ q })}`), meta.title);
    const row = page.locator('[data-part="page"]:not([data-ghost]) [data-book] [data-part="list-row"]', { hasText: meta.title.slice(0, 20) }).first();
    await row.waitFor({ timeout: 20_000 });
    await row.tap();
  }
  const READER = '[data-part="reader"]:not([data-ghost])';
  await page.waitForSelector(`${READER}[data-ready]`);
  // Bring the bars back (the reader opens in zen), then its settings.
  if (await page.locator(READER).evaluate((r) => r.getAttribute("data-state") === "zen")) await page.touchscreen.tap(195, 40);
  await page.locator(`${READER} [data-part="reader-settings-button"]`).tap();
  const sheet = page.locator(`${READER} > [data-part="sheet"]:not([hidden])`);
  await sheet.waitFor();
  await settle();
  const box = await sheet.boundingBox();
  const grip = await sheet.locator('[data-part="sheet-handle"]').boundingBox();
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  let lift = await press(x, y, y + 60);
  const mid = await sheet.boundingBox();
  await lift({ hold: 300 });
  await settle();
  assert(Math.abs(mid.y - (box.y + 60)) <= 3, `followed: ${mid.y} for ${box.y + 60}`);
  await forget();
  lift = await press(x, y, y + box.height * 0.45);
  await lift({ hold: 150 });
  const going = await after("lift");
  await settle();
  const gone = await page.locator(`${READER} > [data-part="sheet"]:not([hidden])`).count();
  assert(going?.open && slid(going, "away", box.height * 0.45), `let go, it slides away from where it was: ${JSON.stringify(going)}`);
  assert(gone === 0, "then it's gone");
  return `followed to ${Math.round(mid.y)}; slid away: ${going.slides.map((x) => `${x.from} → ${x.to}, ${x.duration} ms`).join("; ")}`;
});

await stage("one sheet at a time: a sheet coming up closes the one that's up, through its owner, and the page stays held", async () => {
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]");
  const r = await page.evaluate(async () => {
    const ui = await import("/js/lx/ui.js");
    const pause = (ms) => new Promise((done) => setTimeout(done, ms));
    const up = () => [...document.querySelectorAll('[data-part="sheet"]')].filter((s) => !s.hidden && s.getAttribute("data-state") !== "closing").map((s) => s.getAttribute("aria-label"));
    const held = () => ({ inert: Boolean(document.querySelector('[data-part="app"]')?.hasAttribute("inert")), locked: document.documentElement.hasAttribute("data-scroll-lock") });
    const first = ui.sheetLayer({ label: "First" });
    const second = ui.sheetLayer({ label: "Second" });
    first.lxOpen();
    await pause(700);
    const one = up();
    // The second opened from the first, as a button in it would.
    second.lxOpen();
    await pause(700);
    const two = { up: up(), ...held() };
    second.lxClose({ animate: false });
    await pause(100);
    const none = { up: up(), ...held() };
    // A sheet its owner holds (as the reader holds its own), and a layer coming up over it: closed through its owner.
    let told = null;
    const owned = ui.sheet({ label: "Owned", onClose: (options) => { told = options ?? {}; owned.lxHide(options); } });
    document.body.append(owned);
    owned.lxShow();
    await pause(700);
    const third = ui.sheetLayer({ label: "Third" });
    third.lxOpen();
    await pause(700);
    const three = { up: up(), told, ...held() };
    third.lxClose({ animate: false });
    owned.remove();
    return { one, two, none, three };
  });
  assert(JSON.stringify(r.one) === '["First"]', `the first: ${JSON.stringify(r.one)}`);
  assert(JSON.stringify(r.two.up) === '["Second"]' && r.two.inert && r.two.locked, `the second, opened from the first: ${JSON.stringify(r.two)}`);
  assert(!r.none.up.length && !r.none.inert && !r.none.locked, `the second closed, nothing's up and the page is free: ${JSON.stringify(r.none)}`);
  assert(JSON.stringify(r.three.up) === '["Third"]' && r.three.told?.animate === false && r.three.inert && r.three.locked, `a layer over an owned sheet: ${JSON.stringify(r.three)}`);
  return `First, then Second from it: only ${r.two.up} up, the page held; Third over an owned sheet: its owner told (${JSON.stringify(r.three.told)})`;
});

await stage("a sheet opened after a field had focus has no ring around it", async () => {
  // A sheet takes focus when it opens, and after typing the browser calls that focus-visible: base.css's ring would draw a
  // bright line round the whole sheet. A key (one that types nothing) makes this the case for real; the first assert holds it
  // to that, and the control takes the rule out to show the ring comes back, so this can fail.
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector('[data-part="translate-field"] textarea');
  await page.locator('[data-part="translate-field"] textarea').focus();
  await page.keyboard.press("ArrowLeft");
  const r = await page.evaluate(async () => {
    const ui = await import("/js/lx/ui.js");
    const layer = ui.sheetLayer({ label: "Focus" });
    layer.lxBody.append("Focus");
    layer.lxOpen();
    await new Promise((done) => setTimeout(done, 700));
    const sheet = layer.lxPanel;
    const seen = { focused: document.activeElement === sheet, visible: sheet.matches(":focus-visible"), outline: getComputedStyle(sheet).outlineStyle };
    const taken = [];
    const walk = (list, owner) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const rule = list[i];
        if (rule.selectorText === '[data-part="sheet"]:focus-visible') {
          taken.push([owner, rule.cssText, i]);
          owner.deleteRule(i);
        } else if (rule.cssRules?.length && !rule.selectorText) walk(rule.cssRules, rule);
      }
    };
    for (const sheetFile of document.styleSheets) walk(sheetFile.cssRules, sheetFile);
    seen.taken = taken.length;
    seen.without = getComputedStyle(sheet).outlineStyle;
    for (const [owner, text, i] of taken) owner.insertRule(text, i);
    layer.lxClose({ animate: false });
    layer.remove();
    return seen;
  });
  assert(r.focused && r.visible, `the sheet has the focus, as focus-visible: ${JSON.stringify(r)}`);
  assert(r.outline === "none", `no ring round the sheet: ${JSON.stringify(r)}`);
  assert(r.taken > 0 && r.without !== "none", `without the rule the ring should come back: ${JSON.stringify(r)}`);
  return `focus-visible, outline none; without the rule, ${r.without}`;
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.join("\n"));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} stages passed`);
await browser.close();
process.exit(failed ? 1 : 0);
