// Every screen change, as a person makes it, comes in composed: the gate for the app's transitions (decided 6 Nov 2026: nothing may flash onto
// a screen after it arrives, and a swipe back must never make the screen jump).
//
// As a learner a few lessons in with four texts of its own in Read (one opened past its first page), on a touch phone (390 × 844), every route
// found from the tabs and Settings (their links, breadth first; sessions and books, overlays of their own, aside; a link's query kept only
// where it makes another page, PAGE_QUERY: Find a book's kinds) is reached by a real tap on its link where a person finds it, and left by the
// app's own swipe back. Then back from a book: Read under it, from its Read button.
// From the press, every frame for 1.5 s, it fails on:
// - late: anything in the arriving page first seen after that page's first frame on the screen, unless a held place (data-part="skeleton", the
//   page's own ui.held) had its box (±2 px) from that first frame, or it fades in from nothing inside one. A held place that itself comes late
//   is late too. A Tinta box with no drawing in it, and a picture not yet loaded (an <img> not complete), count the same way.
// - teleport, scroll-jump and blank-flash: scripts/frame-watch.mjs's own, from the press on.
// A PLANT first: a part put into a page 300 ms after it arrives must be caught as late, or the check proves nothing (exit 3).
// LOCAL only (it signs up a test account). Usage: node scripts/transition-check.mjs http://localhost:<port> <outDir> [--max-routes 60]
//   [--only '#a,#b'] [--no-swipe] [--width 320] [--engine webkit] [--books 960]   (exit 0 = pass)
// --engine webkit: iPhone's engine, by taps alone (WebKit gives a check no touch moves, so no swipe backs); the account is signed up in Chromium
// (its virtual passkey) and its cookies carried over.
// --only: those routes alone, each reached where a person finds its link first (Home, its own tab, the pages above it, Settings, every tab), or
// from a page named before it, 'from>route' (a pack's page from a topic: '#explore/topic/food?lang=nl>#explore/item/nl-food-2').
import { wordsPoint } from "./fixtures/words-point.mjs";
import { chromium, webkit } from "./quiet-browser.mjs";
import * as fw from "./frame-watch.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/transition-check.mjs http://localhost:<port> <outDir> [--max-routes 60] [--only '#a,from>#b'] [--no-swipe] [--width 320] [--engine webkit] [--books 960]");
  process.exit(2);
}
const MAX = Number(opt("max-routes", "60"));
const ONLY_ARG = opt("only", null)?.split(",").map((r) => r.split(">")) ?? null;
const ONLY = ONLY_ARG?.map((parts) => parts[parts.length - 1]) ?? null;
// Where --only's 'from>route' says its link is.
const ONLY_FROM = new Map((ONLY_ARG ?? []).filter((parts) => parts.length === 2).map(([from, route]) => [route, from]));
const ENGINE = opt("engine", "chromium");
if (!["chromium", "webkit"].includes(ENGINE)) {
  console.error("--engine: chromium or webkit");
  process.exit(2);
}
const SWIPE = !argv.includes("--no-swipe") && ENGINE === "chromium";
// --slow-api <ms>: the server's answers (/api/) held that long once the learner is set up, as a slow server or a loaded phone has them: a page
// waiting on one comes in held (its places from its first frame) after the router's 400 ms.
const SLOW_API = Number(opt("slow-api", "0"));
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SKIP = /^#(study\/session|read\/book|practice\/room|welcome|ai\/connect)|^#settings\/(account\/delete|data)/;
const TABS = ["#today", "#study", "#know", "#explore"];
// The query keys that make another page (Find a book's kind): a route keeps them, so each kind's page is walked. Every other key (where a page
// was opened from, a language) is context, and dropped.
const PAGE_QUERY = ["kind"];
/** A link's route: its path, with only `keys`' query keys. The page functions below repeat it (no eval in the page: the CSP refuses it). */
const routeOf = (href, keys = PAGE_QUERY) => {
  const [path, query = ""] = href.split("?");
  const kept = [...new URLSearchParams(query)].filter(([key]) => keys.includes(key));
  return kept.length ? `${path}?${new URLSearchParams(kept)}` : path;
};

let failed = 0;
const results = [];
const report = (ok, what, detail = "") => {
  if (!ok) failed++;
  results.push({ ok, what, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
// --width: a narrower phone (320: an iPhone SE's 568 tall).
const WIDTH = Number(opt("width", "390"));
const phone = { viewport: { width: WIDTH, height: WIDTH < 360 ? 568 : 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const signUp = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Transition Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  return cdp;
};
// --books <n>: the open library as it'll be (scripts/fixtures/read-catalog.mjs: the server's books, then made-up ones up to n), so Read's
// shelves have their All N and each kind's page in Find a book is reached by a tap. On the phone's context, before its first page.
const BOOKS = Number(opt("books", "0"));
const serveBooks = async (context) => {
  if (!BOOKS) return;
  const { scaledCatalog } = await import("./fixtures/read-catalog.mjs");
  let served = null;
  await context.route("**/library/catalogue.json", async (route) => {
    served ??= scaledCatalog(await (await route.fetch()).json(), BOOKS);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(served) });
  });
};
let context, page, cdp, other = null;
if (ENGINE === "webkit") {
  const desk = await browser.newContext();
  await signUp(await desk.newPage());
  const cookies = await desk.cookies();
  await desk.close();
  other = await webkit.launch({ headless: true });
  context = await other.newContext(phone);
  await serveBooks(context);
  await context.addCookies(cookies);
  page = await context.newPage();
  await page.goto(`${BASE}/app/`);
} else {
  context = await browser.newContext(phone);
  await serveBooks(context);
  page = await context.newPage();
  cdp = await signUp(page);
}
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
await page.waitForSelector("html[data-app-ready]", { state: "attached", timeout: 60_000 });
// A learner a few lessons in, the app's own swipe on (as the Home Screen app has it), its first run behind it.
await page.evaluate(async () => {
  localStorage.setItem("check.swipe-back", "1");
  localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
  const { syncLibraryPacks } = await import("/js/study/packs.js");
  await syncLibraryPacks().catch(() => {});
  const { record } = await import("/js/study/progress.js");
  const { WORDS } = await import("/js/study/content.js");
  record(Object.keys(WORDS).slice(0, 120).map((w) => ({ concept: `w:${w}`, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "check" })));
  // Four texts of its own in Read, the first opened past its first page: Read's place up front is that book, and Your library has its All
  // (read/library.js, more than three books), so #read/library is walked too.
  const { bookFromText } = await import("/js/read/import-text.js");
  const store = await import("/js/read/store.js");
  const body = Array.from({ length: 240 }, (_, k) => ["De", "kat", "zit", "op", "de", "mat", "en", "kijkt", "naar", "buiten."][k % 10]).join(" ");
  const books = [];
  for (const title of ["Een dag aan zee", "De oude molen", "Het rode huis", "Op de markt"]) {
    const book = await bookFromText(body, { title, lang: "nl" });
    await store.addBook(book);
    books.push(book);
  }
  await store.touchBook(books[0].id);
  await store.setPosition(books[0].id, 80, books[0].version);
  await new Promise((r) => setTimeout(r, 500));
});
if (SLOW_API > 0) {
  await context.route(/\/api\//, async (route) => {
    await wait(SLOW_API);
    await route.continue().catch(() => {});
  });
}
await fw.install(page);
await page.reload();
await page.waitForSelector("html[data-app-ready]", { state: "attached", timeout: 60_000 });
await wait(2500);

const tapAt = async ({ x, y }) => {
  // (WebKit: Playwright's touchscreen, a tap at once; Chromium: a finger held 40 ms.)
  if (!cdp) return page.touchscreen.tap(x, y);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await wait(40);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
const swipeBack = async () => {
  const touch = (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: 430 }] });
  await touch("touchStart", 4);
  for (let k = 1; k <= 14; k++) {
    await touch("touchMove", 4 + (300 * k) / 14);
    await wait(16);
  }
  await touch("touchEnd", 304);
};
/** To a route as a link goes there, at rest. */
async function goRoute(route) {
  await page.evaluate((r) => (location.hash = r), route);
  await page.waitForFunction((r) => (location.hash || "#today").split("?")[0] === r.split("?")[0], route, { timeout: 5000 }).catch(() => {});
  await fw.quiet(page, 400, 3000);
  await wait(300);
}
/**
 * The link to `href` on the screen now, brought into view: the point to tap it, or null. The point is on its words (fixtures/words-point.mjs),
 * never its middle as such: Tinta standing on a link (Home's streak spot and Your AI card, the path strip) takes a tap on him as a poke, his
 * alone, and the page never comes.
 */
const linkOnScreen = async (href) => {
  const handle = await page.evaluateHandle(([href, keys]) => {
    const routeOf = (h) => {
      const [path, query = ""] = h.split("?");
      const kept = [...new URLSearchParams(query)].filter(([key]) => keys.includes(key));
      return kept.length ? `${path}?${new URLSearchParams(kept)}` : path;
    };
    const want = routeOf(href);
    // (Settings' own page opens from the header's initials button, not a link.)
    const a =
      [...document.querySelectorAll('[data-part="page"] a[href^="#"], [data-part="tab-bar"] a[href^="#"]')].find((n) => routeOf(n.getAttribute("href")) === want && n.getClientRects().length && !n.closest("[data-ghost], [hidden], [inert]")) ??
      (want === "#settings" ? [...document.querySelectorAll('[data-part="settings-button"]')].find((n) => n.getClientRects().length && !n.closest("[data-ghost], [hidden], [inert]")) : undefined);
    if (!a) return null;
    if (!a.closest('[data-part="tab-bar"]')) a.scrollIntoView({ block: "center" });
    return a;
  }, [href, PAGE_QUERY]);
  const link = handle.asElement();
  const at = link ? await link.evaluate(wordsPoint) : null;
  await handle.dispose();
  return at;
};
/** The link to `href` (by its route: its path, and only a query key that makes another page; the app's links carry a query), waiting up to 3 s for a page whose lower parts come in later. */
async function linkTo(href) {
  for (let t = 0; t < 3000; t += 250) {
    const at = await linkOnScreen(href);
    if (at) return at;
    await wait(250);
  }
  return null;
}
const linksHere = () =>
  page.evaluate((keys) => {
    const routeOf = (h) => {
      const [path, query = ""] = h.split("?");
      const kept = [...new URLSearchParams(query)].filter(([key]) => keys.includes(key));
      return kept.length ? `${path}?${new URLSearchParams(kept)}` : path;
    };
    return [...new Set([...document.querySelectorAll('[data-part="page"] a[href^="#"]')].filter((a) => a.getClientRects().length && !a.closest("[data-ghost]")).map((a) => routeOf(a.getAttribute("href"))))];
  }, PAGE_QUERY);


/**
 * The arriving page, every frame from now for `ms`: the visible host (the router's .lx-view) other than the one on the screen now, and in it every
 * part's first frame seen, its box, and whether a held place had that box from the host's first frame; Tinta boxes with no drawing; pictures
 * not loaded. Resolves with what came late.
 */
const watchArrival = (ms = 1500, plant = false) =>
  page.evaluate(
    ([ms, plant]) =>
      new Promise((resolve) => {
        const p = document.querySelector('[data-part="app"] > [data-part="page"]');
        const visible = (h) => h && h.getClientRects().length && !h.hasAttribute("data-waiting") && Number(getComputedStyle(h).opacity) > 0.05;
        const leaving = [...p.querySelectorAll(":scope > .lx-view")].find(visible) ?? null;
        const ids = new WeakMap();
        let next = 1;
        const idOf = (n) => (ids.has(n) ? ids.get(n) : (ids.set(n, next), next++));
        const t0 = performance.now();
        let host = null;
        let first = -1;
        const seen = new Map(); // id → { frame, box, part, text }
        const held = []; // boxes of held places at the host's first frame
        const late = [];
        let frame = 0;
        const box = (n) => {
          const r = n.getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
        };
        const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 2);
        const inside = (a, b) => a[0] >= b[0] - 2 && a[1] >= b[1] - 2 && a[0] + a[2] <= b[0] + b[2] + 2 && a[1] + a[3] <= b[1] + b[3] + 2;
        // On the screen: a part running past the screen's foot arrives into a held place that runs past it too, and only what's seen is judged.
        const onScreen = ([x, y, w, h]) => {
          const top = Math.max(y, 0);
          const bottom = Math.min(y + h, innerHeight);
          return [x, top, w, Math.max(0, bottom - top)];
        };
        const look = () => {
          frame++;
          const t = Math.round(performance.now() - t0);
          if (!host) {
            host = [...p.querySelectorAll(":scope > .lx-view")].find((h) => visible(h) && h !== leaving) ?? null;
            if (host) {
              first = frame;
              if (plant) setTimeout(() => host.prepend(Object.assign(document.createElement("p"), { className: "check-late-plant", textContent: "Planted late" })), 300);
              for (const s of host.querySelectorAll('[data-part="skeleton"]')) if (s.getClientRects().length) held.push(box(s));
            }
          }
          if (host) {
            const vh = innerHeight;
            for (const n of host.querySelectorAll("[data-part], button, a[href], h1, h2, h3, p, img, lx-tinta")) {
              if (n.closest('[data-part="character"] svg, lx-tinta svg')) continue;
              const r = n.getBoundingClientRect();
              if (!r.width || !r.height || r.bottom < 0 || r.top > vh) continue;
              let o = 1;
              for (let q = n; q && q !== host; q = q.parentElement) o *= Number(getComputedStyle(q).opacity);
              if (o < 0.05) continue;
              const id = idOf(n);
              const part = n.getAttribute("data-part") ?? n.tagName.toLowerCase();
              const b = box(n);
              const problem =
                n.tagName === "IMG" && !n.complete ? "picture not loaded" : n.matches('lx-tinta, [data-part="character"]') && !n.querySelector("svg *") ? "Tinta with no drawing" : null;
              if (!seen.has(id)) {
                seen.set(id, { frame, t, part });
                const covered = held.some((h) => near(b, h) || inside(b, h) || inside(onScreen(b), onScreen(h)));
                if (frame > first + 1 && !covered && !n.closest('[data-part="skeleton"]'))
                  late.push({ t, frame: frame - first, part, text: (n.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30), box: b });
              }
              if (problem && frame > first + 1) late.push({ t, frame: frame - first, part, text: problem, box: b, problem: true });
            }
          }
          if (performance.now() - t0 < ms) requestAnimationFrame(look);
          else {
            // One entry per part and kind (the first): a thing late in every frame is one thing.
            const once = new Map();
            for (const l of late) if (!once.has(`${l.part}|${l.text}|${l.box.join()}`)) once.set(`${l.part}|${l.text}|${l.box.join()}`, l);
            resolve({ arrived: Boolean(host), first, frames: frame, late: [...once.values()].slice(0, 12), hash: location.hash });
          }
        };
        requestAnimationFrame(look);
      }),
    [ms, plant],
  );

/** One move: the press (`act`), the arrival watched, frame-watch's teleports and scroll jumps from the press on. */
async function move(label, act, { plant = false } = {}) {
  await fw.start(page);
  await fw.mark(page, label);
  const watching = watchArrival(1500, plant);
  await act();
  const arrival = await watching;
  const run = await fw.stop(page);
  const found = fw.analyze(run, { label });
  const moves = found.filter((c) => ["teleport", "scroll-jump", "blank-flash"].includes(c.kind));
  return { arrival, moves };
}

// ---------- the PLANT ----------
{
  await goRoute("#settings");
  const to = await linkTo("#settings/appearance");
  const m = to ? await move("plant", () => tapAt(to), { plant: true }) : null;
  const caught = m?.arrival.late.some((l) => /Planted late/.test(l.text));
  report(Boolean(caught), "PLANT a part put into the arriving page 300 ms after it came: caught as late", m ? JSON.stringify(m.arrival.late.slice(0, 2)) : "no link to Appearance");
  if (!caught) {
    writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
    await browser.close();
    process.exit(3);
  }
}

// ---------- every route, by tap and by swipe back ----------
const queue = ONLY ?? [...TABS, "#settings"];
const parentOf = new Map(); // route → the route whose link reached it
const done = new Set();
const bad = [];
while (queue.length && done.size < MAX) {
  const route = queue.shift();
  // (Counted by its route, so an --only route with a query of context isn't walked again when a link to it is found.)
  if (done.has(routeOf(route)) || SKIP.test(route)) continue;
  done.add(routeOf(route));
  // By tap: from where its link is (the page it was found on), or for a tab another tab; with --only, wherever a person finds it first:
  // Home, the route's own tab, Settings.
  const tabRoot = `#${route.slice(1).split("/")[0]}`;
  // (The pages above it: its path's shorter prefixes, longest first, with its query.)
  const [path, query] = route.split("?");
  const above = path.split("/").slice(0, -1).map((_, i, all) => all.slice(0, all.length - i).join("/") + (query ? `?${query}` : "")).filter((r) => r !== tabRoot);
  const places = ONLY_FROM.has(route) ? [ONLY_FROM.get(route)] : parentOf.has(route) ? [parentOf.get(route)] : TABS.includes(route) ? [route === "#today" ? "#study" : "#today"] : [...new Set(["#today", tabRoot, ...above, "#settings", ...TABS])];
  let to = null;
  for (const from of places) {
    await goRoute(from);
    to = await linkTo(route);
    if (to) break;
  }
  if (!to) {
    if (ONLY) report(false, `${route}: no link to it on ${places.join(", ")}`);
    continue;
  }
  await wait(250);
  const tap = await move(`tap ${route}`, () => tapAt(to));
  await fw.quiet(page, 400, 3000);
  const here = await page.evaluate(() => (location.hash || "#today").split("?")[0]);
  const lateTap = tap.arrival.late;
  // A tap that opened another page than its own (the WebKit sweep, 7 Nov: Study's gear tapped near its corner opened Practice, and the walk counted
  // the settings page as walked and lost all under it).
  if (here !== route.split("?")[0]) bad.push({ route, how: "tap", late: [], moves: [`the tap opened ${here}, not ${route}`], detail: [] });
  const told = (m) => `${m.kind} ${m.part ?? m.what ?? ""}${m.text ? ` “${String(m.text).slice(0, 24)}”` : ""} frame ${m.frame} (+${m.at} ms)${m.dx !== undefined ? ` by ${Math.round(m.dx)},${Math.round(m.dy ?? 0)}` : ""}`;
  if (lateTap.length || tap.moves.length) bad.push({ route, how: "tap", late: lateTap, moves: tap.moves.map(told), detail: tap.moves });
  // The links on it, for the routes after.
  if (here.split("?")[0] === route.split("?")[0])
    for (const href of await linksHere()) if (!done.has(href) && !SKIP.test(href) && !queue.includes(href)) {
      queue.push(href);
      parentOf.set(href, route);
    }
  // By the app's swipe back, from a page under a tab (a tab's own page has nothing of its tab's to go back to).
  if (SWIPE && route.split("/").length > 1 && here === route.split("?")[0]) {
    const back = await move(`swipe back from ${route}`, swipeBack);
    await fw.quiet(page, 400, 3000);
    if (back.arrival.late.length || back.moves.length) bad.push({ route, how: "swipe back", late: back.arrival.late, moves: back.moves.map(told), detail: back.moves });
  }
}
writeFileSync(`${OUT}/found.json`, JSON.stringify(bad, null, 1));
const line = (b) => `${b.route} (${b.how}): ${[...b.late.map((l) => `${l.problem ? l.text : "late"} ${l.part}${l.problem ? "" : ` “${l.text}”`} +${l.t}ms`), ...b.moves].slice(0, 4).join(", ")}`;
// (--only: the routes it names; a whole walk must reach 15 at least.)
report(!bad.length && (ONLY ? done.size >= 1 : done.size >= 15), `${done.size} routes by tap${SWIPE ? " and by swipe back" : ""}: every page comes in composed, nothing jumps`, bad.slice(0, 12).map(line).join(" | "));
// ---------- back from a book: Read under it, as it'll stay ----------
/**
 * Read on the screen again once a book over it closes, every frame for `ms` from now: its parts first seen after its first frame back (in
 * view, as watchArrival counts them). Read is the same page as before the book (its host kept), so watchArrival, which waits for another, can't.
 */
const watchBackToRead = (ms = 1500) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const p = document.querySelector('[data-part="app"] > [data-part="page"]');
        const host = () => [...p.querySelectorAll(":scope > .lx-view")].find((h) => h.querySelector(".lx-library"));
        const shown = (h) => h && h.getClientRects().length && !h.hasAttribute("data-waiting") && !document.querySelector('[data-part="reader"]:not([data-ghost])') && Number(getComputedStyle(h).opacity) > 0.05;
        const seen = new WeakSet();
        const late = [];
        let first = -1;
        let frame = 0;
        const t0 = performance.now();
        const look = () => {
          frame++;
          const h = host();
          if (first < 0 && shown(h)) first = frame;
          if (first > 0)
            for (const n of h.querySelectorAll("[data-part], button, a[href], h1, h2, h3, p, img, lx-tinta")) {
              if (n.closest('[data-part="character"] svg, lx-tinta svg')) continue;
              const r = n.getBoundingClientRect();
              if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
              let o = 1;
              for (let q = n; q && q !== h; q = q.parentElement) o *= Number(getComputedStyle(q).opacity);
              if (o < 0.05 || seen.has(n)) continue;
              seen.add(n);
              if (frame > first + 1) late.push({ t: Math.round(performance.now() - t0), frame: frame - first, part: n.getAttribute("data-part") ?? n.tagName.toLowerCase(), text: (n.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30) });
            }
          if (performance.now() - t0 < ms) requestAnimationFrame(look);
          else resolve({ arrived: first > 0, late: late.slice(0, 10) });
        };
        requestAnimationFrame(look);
      }),
    ms,
  );
{
  const found = [];
  // A server with no open library has no shelf: that half isn't set up there, and says so (a server with books and no cover on Read fails).
  const shelfBooks = await page.evaluate(async () => {
    try {
      return (await (await fetch("/library/catalogue.json")).json()).books?.length ?? 0;
    } catch {
      return 0;
    }
  });
  const ways = [["the book up front", '[data-part="continue-card"] [data-part="button"]'], ...(shelfBooks ? [["a cover on the shelf", '.lx-read-shelf [data-part="book-tile"]']] : [])];
  // Opened from the book up front (Continue), then from a cover on the shelf (kept in your library as it opens); a page read; its Read button.
  for (const [how, part] of ways) {
    await goRoute("#read");
    const at = await page.evaluate((part) => {
      const n = [...document.querySelectorAll(`[data-part="page"]:not([data-ghost]) ${part}`)].find((x) => x.getClientRects().length);
      if (!n) return null;
      n.scrollIntoView({ block: "center" });
      const r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40) };
    }, part);
    if (!at) {
      found.push(`${how}: none on Read`);
      continue;
    }
    await wait(300);
    await tapAt(at);
    if (!(await page.waitForSelector('[data-part="reader"][data-ready]', { timeout: 60_000 }).then(() => true, () => false))) {
      found.push(`${how}: the book didn't open`);
      continue;
    }
    await wait(1200);
    await page.keyboard.press("ArrowRight");
    await wait(1200);
    await fw.start(page);
    await fw.mark(page, `back from ${how}`);
    const watching = watchBackToRead();
    await page.locator('[data-part="reader"] [aria-label="Back to your texts"]').click();
    const back = await watching;
    const moves = fw.analyze(await fw.stop(page), { label: `back from ${how}` }).filter((c) => ["teleport", "scroll-jump", "blank-flash"].includes(c.kind));
    if (!back.arrived || back.late.length || moves.length)
      found.push(`${how}: ${back.arrived ? "" : "Read never came back; "}${[...back.late.map((l) => `late ${l.part} “${l.text}” +${l.t}ms`), ...moves.map((m) => `${m.kind} ${m.part ?? ""}`)].slice(0, 4).join(", ")}`);
    await fw.quiet(page, 400, 3000);
  }
  report(!found.length, "back from a book (from the book up front, and from a cover on the shelf; a page read; its Read button): Read as it'll stay from its first frame, nothing jumping", found.length ? found.join(" | ") : shelfBooks ? "" : "no open library on this server: from a cover on the shelf not set up");
}

// ---------- sessions: their own move, composed ----------
/**
 * The session arriving (the newest session layer, not a ghost), every frame for `ms`: its parts first seen after its first frame (by presence in it,
 * not on the screen: the whole cover moves), a Tinta in it with no drawing. Resolves with what came late.
 */
const watchSession = (ms = 1500) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const was = new Set(document.querySelectorAll('[data-part="session"]'));
        const seen = new WeakSet();
        const late = [];
        let first = -1;
        let frame = 0;
        const t0 = performance.now();
        const look = () => {
          frame++;
          const root = [...document.querySelectorAll('[data-part="session"]:not([data-ghost])')].find((n) => !was.has(n));
          if (root && first < 0 && root.getClientRects().length) first = frame;
          if (root && first > 0)
            for (const n of root.querySelectorAll("[data-part], button, h1, h2, p, img, lx-tinta")) {
              if (n.closest("lx-tinta svg")) continue;
              const r = n.getBoundingClientRect();
              if (!r.width || !r.height) continue;
              let o = 1;
              for (let q = n; q && q !== root; q = q.parentElement) o *= Number(getComputedStyle(q).opacity);
              const tinta = n.matches("lx-tinta") && !n.querySelector("svg *");
              if (seen.has(n) && !tinta) continue;
              if (o < 0.05) continue;
              seen.add(n);
              if (frame > first + 1 || tinta) late.push({ t: Math.round(performance.now() - t0), frame: frame - first, part: n.getAttribute("data-part") ?? n.tagName.toLowerCase(), text: tinta ? "Tinta with no drawing" : (n.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30) });
            }
          if (performance.now() - t0 < ms) requestAnimationFrame(look);
          else resolve({ arrived: first > 0, late: late.slice(0, 10) });
        };
        requestAnimationFrame(look);
      }),
    ms,
  );
{
  const found = [];
  await goRoute("#study");
  const door = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[data-part="page"] [data-part="study-door"]')].find((n) => n.getClientRects().length);
    if (!d) return null;
    document.querySelector('[data-part="app"] > [data-part="page"]').scrollTop = 0;
    d.scrollIntoView({ block: "center" });
    const r = d.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (door) {
    await wait(300);
    // What a press there would reach, for when the session doesn't come.
    const under = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      const d = [...document.querySelectorAll('[data-part="page"] [data-part="study-door"]')].find((n) => n.getClientRects().length);
      const r = d?.getBoundingClientRect();
      return `${hit ? `${hit.tagName.toLowerCase()}${hit.getAttribute("data-part") ? `[${hit.getAttribute("data-part")}]` : ""} in ${hit.closest("a")?.getAttribute("href") ?? "no link"}` : "nothing"}; door ${r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(",") : "-"}, its link ${d?.getAttribute("href")}`;
    }, door);
    // The events a tap there makes, for when the session doesn't come: each one's target, and whether it was cancelled or stopped short of
    // the window's bubble (a listener the walk left behind).
    await page.evaluate(() => {
      const trace = (globalThis.__lxTapTrace = []);
      const desc = (n) => (n instanceof Element ? `${n.tagName.toLowerCase()}${n.getAttribute("data-part") ? `[${n.getAttribute("data-part")}]` : ""}${n.closest("a[href]") ? ` in ${n.closest("a[href]").getAttribute("href")}` : ""}` : String(n));
      for (const type of ["touchstart", "touchend", "touchcancel", "pointerdown", "pointerup", "pointercancel", "click", "hashchange"]) {
        addEventListener(type, (e) => trace.push({ type, at: Math.round(performance.now()), target: desc(e.target), seenAtBubble: false }), { capture: true });
        addEventListener(type, (e) => {
          const last = [...trace].reverse().find((x) => x.type === type);
          if (last) Object.assign(last, { seenAtBubble: true, cancelled: e.defaultPrevented });
        });
      }
    });
    await fw.start(page);
    // (4 s to come: on a loaded machine, after a long walk, a session's plan can take past 1.5 s to work out. Composed or not is judged from
    // its own first frame either way.)
    const up = watchSession(4000);
    await tapAt(door);
    const a = await up;
    let upAt = null;
    if (!a.arrived) {
      // Never came: what the page was like then (an inert layer, a drawer still up, focus), and whether a second tap opens it.
      const state = await page.evaluate(() => {
        const d = [...document.querySelectorAll('[data-part="page"] [data-part="study-door"]')].find((n) => n.getClientRects().length);
        const sheet = [...document.querySelectorAll('[data-part="sheet"], [data-part="sheet-layer"]')].find((n) => !n.hidden && n.getClientRects().length);
        return `inert above the door: ${d?.closest("[inert]")?.getAttribute("data-part") ?? d?.closest("[inert]")?.tagName ?? "none"}; a drawer up: ${sheet ? sheet.getAttribute("aria-label") ?? "yes" : "none"}; focus: ${document.activeElement?.tagName.toLowerCase()}${document.activeElement?.getAttribute("data-part") ? `[${document.activeElement.getAttribute("data-part")}]` : ""}; sessions in the page: ${document.querySelectorAll('[data-part="session"]').length}; the router: ${JSON.stringify(globalThis.__lxNav?.() ?? null).slice(0, 400)}; history: ${history.length}, its place ${JSON.stringify(history.state?.lx ?? null)}`;
      });
      await tapAt(door);
      await wait(2500);
      const again = await page.evaluate(() => location.hash);
      const trace = await page.evaluate(() => (globalThis.__lxTapTrace ?? []).map((x) => `${x.type} ${x.target}${x.seenAtBubble ? (x.cancelled ? " CANCELLED" : "") : " STOPPED"}`).join(" → "));
      upAt = `${await page.evaluate(() => location.hash)}; under the tap: ${under}; ${state}; a second tap: ${again}; the walk's last routes: ${[...done].slice(-4).join(", ")}; events: ${trace}`;
    }
    const runUp = await fw.stop(page);
    const movesUp = fw.analyze(runUp, { label: "session up" }).filter((c) => ["teleport", "blank-flash"].includes(c.kind));
    if (!a.arrived || a.late.length || movesUp.length) found.push(`up: ${a.arrived ? "" : `never arrived in 4 s (the address then: ${upAt}); `}${a.late.map((l) => `late ${l.part} “${l.text}” +${l.t}ms`).join(", ")}${movesUp.map((m) => ` ${m.kind} ${m.part ?? ""} ${m.what ?? ""} (frame ${m.frame ?? "?"})`).join("")}`);
    await fw.quiet(page, 400, 3000);
    // Pushed: another session while this one is up (a summary's Practice again goes this way).
    const push = watchSession();
    await page.evaluate(() => (location.hash = "#study/session/quick"));
    const b = await push;
    if (!b.arrived || b.late.length) found.push(`push: ${b.arrived ? "" : "never arrived; "}${b.late.map((l) => `late ${l.part} “${l.text}” +${l.t}ms`).join(", ")}`);
    await fw.quiet(page, 400, 3000);
    // Down: its cross; Study under it, as it was.
    const cross = await page.evaluate(() => {
      const c = document.querySelector('[data-part="session"]:not([data-ghost]) [data-part="session-bar"] [data-part="icon-button"]');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (cross) {
      const down = await move("session down", () => tapAt(cross));
      if (down.moves.length) found.push(`down: ${down.moves.map((m) => `${m.kind} ${m.part ?? ""} ${m.what ?? ""}`).join(", ")}`);
    } else found.push("down: no cross to press");
  } else found.push("no door on Study");
  report(!found.length, "a session's own move (up from Study's door, pushed by the next session, down by its cross): composed from its first frame, nothing jumping", found.join(" | "));
}

report(!errors.length, "no page errors", errors.slice(0, 3).join(" | "));
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
writeFileSync(`${OUT}/routes.txt`, [...done].join("\n"));
await other?.close();
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
