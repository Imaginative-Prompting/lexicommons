// The app behaves as an app, not a web page, on every route a person can reach (6 Nov 2026: a held tab opened a preview of its link, a held
// button selected its words, and a page scrolled sideways). As a new learner who has studied a little, on a touch phone at 390 and 320 wide,
// each route found from the tabs, Settings and Translate (their links, followed breadth first; sessions and books, which are overlays with
// gestures of their own, left out):
// - Nothing moves sideways: a real swipe across the middle of the page (Chromium, touch; WebKit, a sideways wheel) leaves the page, the app's
//   frame, the document and the visual viewport where they were. What reaches past the screen's edge as the page comes in (every frame for
//   1.5 s) is listed, the cause to fix where it's drawn; the guard (shell.css) is what this holds. A PLANT first: a block wider than the screen
//   put in a page, which the same swipe must not move either (and on an app without the guard, does).
// - A held finger selects nothing and opens no menu: a hold on a tab, a row, a button and a heading leaves no selection and the browser's menu
//   (contextmenu) stopped (Chromium); text in them can't be selected (user-select none, both engines); a field's text can. (iPhone's link
//   preview, -webkit-touch-callout, exists only on an iPhone: the rule is read from shell.css as served.)
// LOCAL only (it signs up a test account). Usage: node scripts/app-feel-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit]
//   [--widths 390,320] [--max-routes 70]   (exit 0 = pass)
import { chromium, webkit } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/app-feel-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit] [--widths 390,320] [--max-routes 70]");
  process.exit(2);
}
const ENGINES = opt("engines", "chromium,webkit").split(",");
const WIDTHS = opt("widths", "390,320").split(",").map(Number);
const MAX_ROUTES = Number(opt("max-routes", "70"));
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const results = [];
const report = (ok, what, detail = "") => {
  if (!ok) failed++;
  results.push({ ok, what, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};
const SKIP = /^#(study\/session|read\/book|practice\/room|welcome)|^#today\/translate\/./;

/** Signs a new account up with a virtual passkey (Chromium only). */
async function signUp(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "App Feel Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
}

/** A new account at Home, some study recorded (so pages have something in them), on a touch phone. */
async function phone(engine) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: WIDTHS[0], height: 844 }, deviceScaleFactor: 2, isMobile: engine === chromium, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
  if (engine === chromium) {
    await signUp(context, page);
    phone.cookies = await context.cookies();
  } else {
    // WebKit can't make a passkey: the account is signed up in Chromium, here or (--engines webkit alone) in a Chromium of its own first.
    if (!phone.cookies) {
      const helper = await chromium.launch({ headless: true });
      const helperContext = await helper.newContext();
      await signUp(helperContext, await helperContext.newPage());
      phone.cookies = await helperContext.cookies();
      await helper.close();
    }
    await context.addCookies(phone.cookies);
    await page.goto(`${BASE}/app/`);
  }
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000, state: "attached" });
  await page.evaluate(async () => {
    localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
    const { syncLibraryPacks } = await import("/js/study/packs.js");
    await syncLibraryPacks().catch(() => {});
    const { record } = await import("/js/study/progress.js");
    const { WORDS } = await import("/js/study/content.js");
    record(Object.keys(WORDS).slice(0, 80).map((w) => ({ concept: `w:${w}`, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "check" })));
    await new Promise((r) => setTimeout(r, 500));
  });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000, state: "attached" });
  const cdp = engine === chromium ? await context.newCDPSession(page) : null;
  return { browser, context, page, cdp, errors };
}

/** To a route, the way a link goes there, then at rest. */
async function go(page, route) {
  await page.evaluate((r) => (location.hash = r), route);
  await page.waitForFunction((r) => (location.hash || "#today").split("?")[0] === r.split("?")[0], route, { timeout: 5000 }).catch(() => {});
  await wait(900);
}

/** Every in-app link on the screen now (the page and the tab bar). */
const linksHere = (page) =>
  page.evaluate(() => [...new Set([...document.querySelectorAll('[data-part="page"] a[href^="#"], [data-part="tab-bar"] a[href^="#"]')].filter((a) => a.getClientRects().length).map((a) => a.getAttribute("href")))]);

/** Where everything is sideways: the page, the app's frame, the document and the visual viewport. */
const sideways = (page) =>
  page.evaluate(() => {
    const p = document.querySelector('[data-part="app"] > [data-part="page"]');
    const app = document.querySelector('[data-part="app"]');
    return { page: Math.round(p?.scrollLeft ?? 0), app: Math.round(app?.scrollLeft ?? 0), doc: Math.round(document.scrollingElement?.scrollLeft ?? 0), body: Math.round(document.body.scrollLeft), vv: Math.round(visualViewport?.offsetLeft ?? 0), x: Math.round(scrollX) };
  });
const moved = (s) => Object.values(s).some((v) => Math.abs(v) > 0);

/** A person's sideways swipe across the middle of the page (not from its edge: that's back). */
async function swipeSideways(ctx) {
  const y = 430;
  if (ctx.cdp) {
    const touch = (type, x) => ctx.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touch("touchStart", 300);
    for (let k = 1; k <= 12; k++) {
      await touch("touchMove", 300 - k * 20);
      await wait(16);
    }
    await touch("touchEnd", 60);
  } else {
    await ctx.page.mouse.move(200, y);
    for (let k = 0; k < 6; k++) {
      await ctx.page.mouse.wheel(120, 0);
      await wait(30);
    }
  }
  await wait(500);
}

/** What reaches past the screen's right edge while the page comes in (every frame for 1.5 s), the widest first. */
const pastTheEdge = (page, route) =>
  page.evaluate(
    (route) =>
      new Promise((resolve) => {
        const seen = new Map();
        const until = performance.now() + 1500;
        const frame = () => {
          const vw = innerWidth;
          const p = document.querySelector('[data-part="page"]');
          const over = Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, p ? p.scrollWidth - p.clientWidth : 0);
          if (over > 0)
            for (const node of document.querySelectorAll('[data-part="page"] *')) {
              const r = node.getBoundingClientRect();
              if (r.width && r.right > vw + 0.5) {
                const name = `${node.tagName.toLowerCase()}${node.dataset.part ? `[${node.dataset.part}]` : ""}${typeof node.className === "string" && node.className ? `.${node.className.split(" ")[0]}` : ""}`;
                seen.set(name, Math.max(seen.get(name) ?? 0, Math.round(r.right - vw)));
              }
            }
          if (performance.now() < until) requestAnimationFrame(frame);
          else resolve([...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, px]) => `${n} +${px}`));
        };
        location.hash = route;
        requestAnimationFrame(frame);
      }),
    route,
  );

for (const name of ENGINES) {
  const engine = name === "webkit" ? webkit : chromium;
  const ctx = await phone(engine);
  const { page } = ctx;

  // ---------- a held finger ----------
  await go(page, "#today");
  // user-select isn't inherited: a word's own value stays "auto", which takes the nearest set one above it. Read that.
  const selectable = await page.evaluate(() => {
    const effective = (node) => {
      for (let n = node; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        const v = s.userSelect || s.webkitUserSelect;
        if (v && v !== "auto") return v;
      }
      return node ? "auto" : null;
    };
    const pick = (sel) => [...document.querySelectorAll(sel)].find((n) => n.getClientRects().length);
    return {
      tab: effective(pick('[data-part="tab-bar"] [data-part="tab"] .lx-tab-label')),
      heading: effective(pick('[data-part="page"] h1, [data-part="page"] h2, [data-part="page"] [data-part="section-head"]')),
      button: effective(pick('[data-part="page"] button, [data-part="page"] [data-part="button"]')),
      text: effective(pick('[data-part="page"] p')),
      field: effective(pick('[data-part="page"] textarea, [data-part="page"] input')),
    };
  });
  const words = Object.entries(selectable).filter(([k, v]) => k !== "field" && v !== null && v !== "none");
  report(!words.length && selectable.field && selectable.field !== "none", `${name}: words in the app can't be selected, a field's can`, JSON.stringify(selectable));
  // A real double press on a heading's and a paragraph's words (a mouse's, in both engines): nothing selected.
  const pressed = [];
  for (const sel of ['[data-part="page"] h1, [data-part="page"] h2, [data-part="page"] [data-part="section-head"]', '[data-part="page"] p']) {
    const box = await page.locator(sel).first().boundingBox().catch(() => null);
    if (!box) continue;
    await page.evaluate(() => getSelection()?.removeAllRanges());
    await page.mouse.dblclick(box.x + Math.min(30, box.width / 2), box.y + box.height / 2);
    await wait(200);
    pressed.push({ sel: sel.split(",")[0], selection: await page.evaluate(() => getSelection()?.toString() ?? "") });
  }
  report(pressed.length === 2 && pressed.every((p) => !p.selection), `${name}: a double press on a heading and on a paragraph selects nothing`, JSON.stringify(pressed));
  // A finger held on a tab, a row, a button: the browser's menu for it (Android's "Open in new tab"; contextmenu, as a touch press) is stopped,
  // in the app's own handler.
  const menus = await page.evaluate(() =>
    ['[data-part="tab-bar"] [data-part="tab"]', '[data-part="page"] [data-part="list-row"], [data-part="page"] a[href^="#"]', '[data-part="page"] button'].map((sel) => {
      const node = [...document.querySelectorAll(sel)].find((n) => n.getClientRects().length);
      if (!node) return { sel, menu: "none found" };
      const r = node.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: "touch" };
      const event = typeof PointerEvent === "function" ? new PointerEvent("contextmenu", init) : new MouseEvent("contextmenu", init);
      node.dispatchEvent(event);
      return { sel: sel.split(",")[0], menu: event.defaultPrevented ? "stopped" : "shown" };
    }),
  );
  report(menus.every((m) => m.menu === "stopped"), `${name}: a finger held on a tab, a row and a button opens no menu`, JSON.stringify(menus));
  const css = await page.evaluate(async () => (await (await fetch([...document.styleSheets].map((s) => s.href).find((h) => h?.includes("/css/shell.css")) ?? "/css/shell.css")).text()));
  report(/html\s*\{[^}]*-webkit-touch-callout:\s*none/.test(css), `${name}: an iPhone's preview of a held link is off (shell.css as served: html -webkit-touch-callout none)`);

  // ---------- sideways ----------
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    // PLANT: a block wider than the screen in the page. The same swipe must move nothing (an app without the guard scrolls).
    await go(page, "#today");
    await page.evaluate(() => {
      const wide = document.createElement("div");
      wide.id = "check-too-wide";
      wide.style.cssText = "width: 900px; height: 40px; background: transparent;";
      document.querySelector('[data-part="page"] > .lx-view')?.prepend(wide);
    });
    await swipeSideways(ctx);
    const planted = await sideways(page);
    await page.evaluate(() => document.getElementById("check-too-wide")?.remove());
    report(!moved(planted), `${name} at ${width}: PLANT a block 900 px wide in Home: a sideways swipe moves nothing`, JSON.stringify(planted));

    // Every route, breadth first from the tabs, Settings and Translate.
    const queue = ["#today", "#study", "#know", "#explore", "#settings", "#today/translate"];
    const done = new Set();
    const bad = [];
    const past = [];
    while (queue.length && done.size < MAX_ROUTES) {
      const route = queue.shift();
      if (done.has(route) || SKIP.test(route)) continue;
      done.add(route);
      const wide = await pastTheEdge(page, route);
      await wait(300);
      if (wide.length) past.push(`${route}: ${wide.join(", ")}`);
      await swipeSideways(ctx);
      const s = await sideways(page);
      if (moved(s)) bad.push(`${route} ${JSON.stringify(s)}`);
      // Put back whatever moved, so the next route starts straight.
      if (moved(s)) await page.evaluate(() => { for (const n of [document.querySelector('[data-part="page"]'), document.querySelector('[data-part="app"]'), document.scrollingElement, document.body]) if (n) n.scrollLeft = 0; });
      for (const href of await linksHere(page)) {
        const r = href.split("?")[0];
        if (!done.has(r) && !SKIP.test(r) && !queue.includes(r)) queue.push(r);
      }
    }
    report(!bad.length && done.size >= 20, `${name} at ${width}: ${done.size} routes, a sideways swipe moves nothing on any`, bad.slice(0, 6).join("; "));
    writeFileSync(`${OUT}/${name}-${width}-routes.txt`, [...done].join("\n"));
    if (past.length) console.log(`      what reaches past the edge as a page comes in (${name} at ${width}; held by the guard, the cause is its page's): ${past.slice(0, 8).join(" | ")}`);
    writeFileSync(`${OUT}/${name}-${width}-past-the-edge.txt`, past.join("\n"));
  }
  report(!ctx.errors.length, `${name}: no page errors`, ctx.errors.slice(0, 3).join(" | "));
  await ctx.browser.close();
}
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
