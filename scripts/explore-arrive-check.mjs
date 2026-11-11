// Explore's drawn places arrive once (explore.js drawnWhole): a topic's tile and a pack's cover, its paint chosen from its drawing (a learner's
// cover never wears its drawing's own ground; a tile's hard edge is its ground's deep tone), on a slow phone with the drawings slow to come.
//
// As a new learner of Dutch on a touch phone, the processor slowed 4× (--cpu) and every drawing (/pictures/*.svg) held back --hold ms, each of
// #explore (by its tab), #explore/topics, #explore/browse and #explore/yours (by their links on #explore) is tapped with none of its drawings on the device
// (their kept copies deleted, the app started again), and every frame read from the press for --hold + 2 s. Each drawn place on the screen,
// from its first shown frame, fails on:
// - its paint changing (its background, its edge: the computed colors) once it shows, unless it was a held place (data-held, a skeleton in it),
//   and a held place wearing any paint of its own (it's unpainted: no background, no edge, its held place's fill alone);
// - shown bare (no drawing, no held place), then its drawing coming into it;
// - a place put where one just went, wearing another paint than that one wore (a held one aside).
// At the end none is still held, every one has its drawing, and no learner's cover wears its drawing's ground. Yours has a pack of the learner's own
// whose id gives it its drawing's ground as its paint (study/pack-format.js paintOf, coverByIdOf: worked out at run time), so its cover must take
// another; the app from before showed it in the first, then changed it as its drawing came.
// Then #explore again with its drawings in memory: every drawn place whole from its first shown frame, none held. Then a first visit (nothing
// kept on the device) with the home's answer held back --home-hold ms (2 s): the lessons' card in its first frame, and every part of the home
// that comes after its first frame landing inside a place held from it (transition-check's rule: its box within a held place's, on the screen;
// explore.js heldHome); the app from before held 330 px and 230 px, and the pick and topics came outside them. Then a topic's page (--topic,
// feelings: a pack whose sentence takes two lines, so its card is taller than a one-line card's 262 px) by its tile on #explore/topics, first
// seen this start, its answer held back 2 s: its cards into the place held from its first frame (heldToFoot); the app from before held two
// places of 262 px, and the taller card came past its own.
// Stills of #explore while its drawings are held back and once they're in, in <outDir>/arrive-<width>-held.png and -arrived.png, and of a first
// visit while the home's answer is on its way and once it's in, home-<width>-held.png and -arrived.png.
// The app from before fails the first part (a tile's edge took its paint as its drawing came; a learner's cover could change paint).
// LOCAL only (it signs up a test account), path-nl and the word packs seeded, --var COMMUNITY_SHARING:everyone (Yours lists a learner's own packs
// only where they may share; else exit 2, said). Through gpu.py's parallel lane.
// Usage: node scripts/explore-arrive-check.mjs http://localhost:<port> <outDir> [--hold 1500] [--home-hold 2000] [--cpu 4] [--width 390]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/explore-arrive-check.mjs http://localhost:<port> <outDir> [--hold 1500] [--cpu 4] [--width 390]");
  process.exit(2);
}
const HOLD = Number(opt("hold", "1500"));
const CPU = Number(opt("cpu", "4"));
const WIDTH = Number(opt("width", "390"));
const HOME_HOLD = Number(opt("home-hold", "2000"));
const TOPIC = opt("topic", "feelings");
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.error("ceiling: 10 minutes"), process.exit(3)), 10 * 60_000).unref();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const results = [];
const report = (ok, what, detail = "") => {
  if (!ok) failed++;
  results.push({ ok, what, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: WIDTH, height: WIDTH < 360 ? 568 : 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
// The drawings held back while `holding` (a route: a request already on its way when it ends still waits out its hold).
let holding = false;
await context.route(/\/pictures\/[^/?]+\.svg/, async (route) => {
  if (holding) await wait(HOLD);
  await route.continue().catch(() => {});
});
// The home's answer held back while `homeSlow` (fetchHome's /api/community/explore), and a topic's list while `topicSlow`.
let homeSlow = false;
let topicSlow = false;
await context.route(/\/api\/community\/explore\?/, async (route) => {
  if (homeSlow) await wait(HOME_HOLD);
  await route.continue().catch(() => {});
});
await context.route(/\/api\/community\/items\?[^#]*topic=/, async (route) => {
  if (topicSlow) await wait(HOME_HOLD);
  await route.continue().catch(() => {});
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Explore Arrive Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]", { state: "attached", timeout: 60_000 });
// A learner of Dutch, its first run behind it, the library's packs on the device (Explore's lessons card, its shelves).
await page.evaluate(async () => {
  localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
  const { syncLibraryPacks } = await import("/js/study/packs.js");
  await syncLibraryPacks().catch(() => {});
});
// Yours lists a learner's own packs only where they may share.
const mayShare = await page.evaluate(async () => (await (await fetch("/api/me", { credentials: "same-origin" })).json()).mayShare);
if (mayShare === false) {
  console.error("NOT REACHED: this server doesn't let a learner share, so Yours lists no pack of theirs: start it with --var COMMUNITY_SHARING:everyone");
  await browser.close();
  process.exit(2);
}
// A pack of the learner's own about Everyday, its id the first whose paint by id is its drawing's ground.
const mine = await page.evaluate(async () => {
  const { paintOf, coverByIdOf } = await import("/js/study/pack-format.js");
  const list = await (await fetch("/pictures/manifest.json")).json();
  const grounds = new Map();
  const ground = async (drawing) => {
    if (!grounds.has(drawing)) {
      const text = await (await fetch(`/pictures/${list.pictures[drawing].file}`)).text();
      grounds.set(drawing, /--art-(teal|sun|violet)\b/.exec(/<rect[^>]*fill="([^"]*)"/.exec(text)?.[1] ?? "")?.[1] ?? null);
    }
    return grounds.get(drawing);
  };
  let id = null;
  for (let k = 0; k < 200 && !id; k++) {
    const candidate = `arrive-check-${k}`;
    if (paintOf(candidate) === (await ground(coverByIdOf(candidate, ["everyday"])))) id = candidate;
  }
  if (!id) return { ok: false, errors: ["no id gives its drawing's ground as its paint"] };
  const { BUILT_IN } = await import("/js/packs/index.js");
  const pack = structuredClone(BUILT_IN.find((p) => p.language === "nl") ?? BUILT_IN[0]);
  Object.assign(pack, { id, name: "Explore arrive check", topics: { everyday: "Everyday" } });
  delete pack.builtIn;
  const saved = await (await import("/js/study/packs.js")).savePack(pack, { by: "the check" });
  return { ok: saved.ok, id, drawing: coverByIdOf(id, ["everyday"]), paint: paintOf(id), errors: (saved.errors ?? []).slice(0, 3).map((e) => e.message ?? e) };
});
report(mine.ok, "a pack of the learner's own whose paint by id is its drawing's ground", mine.ok ? `${mine.id}: ${mine.drawing}, ${mine.paint}` : JSON.stringify(mine.errors));

const tapAt = async ({ x, y }) => {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await wait(40);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
const atRest = async (route) => {
  await page.waitForFunction((r) => (location.hash || "#today").split("?")[0] === r && !document.querySelector('[data-part="page"] > .lx-view[data-waiting]'), route, { timeout: 20_000 });
  await wait(1200);
};
/** The app started again at `route` with no drawing on the device (kept copies deleted; memory gone with the page). */
async function fresh(route) {
  await page.evaluate(() => caches.delete("lx-pictures-v1"));
  // (A new page load: a goto that changes only the hash would keep the app, and its drawings in memory.)
  await page.goto("about:blank");
  await page.goto(`${BASE}/app/${route}`);
  await page.waitForSelector("html[data-app-ready]", { state: "attached", timeout: 60_000 });
  await atRest(route);
}
/** The point to tap the link to `href` (its route's path; the tab bar's or the page's), brought into view; null when there's none. */
const linkTo = (href) =>
  page.evaluate((href) => {
    const a = [...document.querySelectorAll('[data-part="tab-bar"] a[href^="#"], [data-part="page"] > .lx-view:not([data-waiting]) a[href^="#"]')].find(
      (n) => n.getAttribute("href").split("?")[0] === href && n.getClientRects().length && !n.closest("[data-ghost], [hidden], [inert]"),
    );
    if (!a) return null;
    if (!a.closest('[data-part="tab-bar"]')) a.scrollIntoView({ block: "center" });
    const r = a.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 20)) };
  }, href);

/**
 * From now for `ms`, every frame: the arriving page (the router's .lx-view shown, other than the one on the screen now) and in it every drawn
 * place on the screen (a pack's cover, a topic's tile) that's seen (its opacity, up to the page, over 0.05): its paint (computed background and
 * edge), whether it's held, whether it's drawn. Resolves with what broke the rules above.
 */
const watch = (ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const p = document.querySelector('[data-part="app"] > [data-part="page"]');
        const visible = (h) => h && h.getClientRects().length && !h.hasAttribute("data-waiting") && Number(getComputedStyle(h).opacity) > 0.05;
        const leaving = [...p.querySelectorAll(":scope > .lx-view")].find(visible) ?? null;
        const ids = new WeakMap();
        let next = 1;
        const idOf = (n) => (ids.has(n) ? ids.get(n) : (ids.set(n, next), next++));
        const t0 = performance.now();
        let host = null;
        let frame = 0;
        let firstFrame = -1;
        const seen = new Map(); // id → what it was last frame it was seen
        let shown = new Map(); // id → this frame's reading
        const gone = []; // places that went, with their last reading and frame
        const problems = [];
        const overlap = (a, b) => {
          const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
          const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
          return w > 0 && h > 0 ? (w * h) / Math.max(a[2] * a[3], b[2] * b[3]) : 0;
        };
        let heldSeen = 0;
        const look = () => {
          frame++;
          const t = Math.round(performance.now() - t0);
          if (!host) {
            host = [...p.querySelectorAll(":scope > .lx-view")].find((h) => visible(h) && h !== leaving) ?? null;
            if (host) firstFrame = frame;
          }
          if (host) {
            const now = new Map();
            for (const n of host.querySelectorAll('[data-part="pack-cover"], .lx-topic-art')) {
              const r = n.getBoundingClientRect();
              if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
              let o = 1;
              for (let q = n; q && q !== p; q = q.parentElement) o *= Number(getComputedStyle(q).opacity);
              if (o < 0.05) continue;
              const cs = getComputedStyle(n);
              const held = n.hasAttribute("data-held") || Boolean(n.querySelector(':scope > [data-part="skeleton"]'));
              const drawn = Boolean(n.querySelector('[data-part="picture"] svg, .lx-generic-book'));
              const paint = held ? "held" : `${cs.backgroundColor} ${cs.backgroundImage} ${cs.boxShadow}`;
              const box = [r.left, r.top, r.width, r.height].map(Math.round);
              const name = `${n.matches(".lx-topic-art") ? "topic tile" : n.hasAttribute("data-generic") ? "learner's cover" : "cover"} ${n.dataset.drawing ?? n.closest("[data-topic]")?.dataset.topic ?? n.closest("a")?.getAttribute("href")?.split("?")[0] ?? ""}`.trim();
              const id = idOf(n);
              const reading = { id, box, paint, held, drawn, name, frame, t };
              now.set(id, reading);
              if (held) heldSeen++;
              const ownPaint = cs.backgroundImage !== "none" || !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(cs.backgroundColor) || cs.boxShadow !== "none";
              if (held && ownPaint) problems.push(`${name}: held, but painted (+${t} ms): ${cs.backgroundColor} ${cs.backgroundImage} ${cs.boxShadow}`);
              const was = seen.get(id);
              if (!was) {
                // A place put where one just went (a stand-in taken over): what that one wore, unless it was held.
                const before = gone.find((g) => g.frame >= frame - 1 && overlap(g.box, box) > 0.6);
                if (before && !before.held && !held && before.paint !== paint)
                  problems.push(`${name}: put where ${before.name} was, in another paint (+${t} ms, frame ${frame - firstFrame}): ${before.paint} → ${paint}`);
              } else {
                if (!was.held && !held && was.paint !== paint) problems.push(`${name}: its paint changed after it showed (+${t} ms, frame ${frame - firstFrame}): ${was.paint} → ${paint}`);
                if (!was.held && !was.drawn && drawn) problems.push(`${name}: shown bare, then its drawing came into it (+${t} ms, frame ${frame - firstFrame})`);
              }
              seen.set(id, reading);
            }
            for (const [id, reading] of shown) if (!now.has(id)) gone.push(reading);
            shown = now;
          }
          if (performance.now() - t0 < ms) requestAnimationFrame(look);
          else {
            // At the end: every drawn place in the page (on the screen or not) has come whole.
            const places = host ? [...host.querySelectorAll('[data-part="pack-cover"], .lx-topic-art')] : [];
            const ground = (n) => /--art-(teal|sun|violet)\b/.exec(n.querySelector('[data-part="picture"] svg rect')?.getAttribute("fill") ?? "")?.[1] ?? null;
            resolve({
              arrived: Boolean(host),
              hash: location.hash,
              frames: frame,
              places: seen.size,
              heldSeen,
              problems: [...new Set(problems)],
              stillHeld: places.filter((n) => n.hasAttribute("data-held") || n.querySelector(':scope > [data-part="skeleton"]')).length,
              bare: places.filter((n) => !n.hasAttribute("data-held") && !n.querySelector('[data-part="picture"] svg, .lx-generic-book') && (n.dataset.drawing || n.matches(".lx-topic-art"))).map((n) => n.dataset.drawing ?? n.closest("[data-topic]")?.dataset.topic ?? "?"),
              ownGround: places.filter((n) => n.hasAttribute("data-generic") && ground(n) && n.dataset.paint === ground(n)).map((n) => n.dataset.drawing),
            });
          }
        };
        requestAnimationFrame(look);
      }),
    ms,
  );

/** One tap, watched: `href` from where its link is (at rest), the drawings held back and the processor slowed while it's watched. */
async function tapWatched(href, { hold = true } = {}) {
  const at = await linkTo(href);
  if (!at) return null;
  await wait(250);
  holding = hold;
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  const watching = watch(HOLD + 2000);
  await tapAt(at);
  const seen = await watching;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  holding = false;
  return seen;
}

// ---------- each page's first visit, its drawings held back ----------
const ROUTES = [
  ["#explore", "#today"],
  ["#explore/topics", "#explore"],
  ["#explore/browse", "#explore"],
  ["#explore/yours", "#explore"],
];
for (const [route, from] of ROUTES) {
  await fresh(from);
  const seen = await tapWatched(route);
  if (!seen) {
    report(false, `${route}: no link to it on ${from}`);
    continue;
  }
  const here = (seen.hash || "#today").split("?")[0];
  report(here === route && seen.arrived, `${route}: arrived by its link on ${from}`, `${here}, ${seen.frames} frames`);
  report(seen.places > 0, `${route}: drawn places on the screen as it arrived`, `${seen.places} (${seen.heldSeen} held readings)`);
  report(!seen.problems.length, `${route}, its drawings held back ${HOLD} ms and the processor slowed ${CPU}×: every drawn place arrives once, its paint never changing after it shows`, seen.problems.join("; "));
  report(!seen.stillHeld && !seen.bare.length, `${route}: every drawn place whole once its drawings are in`, seen.stillHeld || seen.bare.length ? `${seen.stillHeld} still held; bare: ${seen.bare.join(", ")}` : "");
  report(!seen.ownGround.length, `${route}: no learner's cover wears its drawing's own ground`, seen.ownGround.join(", "));
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
}

// ---------- #explore again, its drawings in memory: whole from the first frame ----------
{
  await fresh("#today");
  holding = false;
  await page.evaluate(() => (location.hash = "#explore"));
  await atRest("#explore");
  await wait(HOLD); // (any drawing still on its way is in by now)
  await page.evaluate(() => (location.hash = "#today"));
  await atRest("#today");
  const seen = await tapWatched("#explore");
  report(Boolean(seen?.arrived), "#explore again: arrived by its tab", seen ? `${seen.frames} frames` : "no tab");
  if (seen) report(!seen.heldSeen && !seen.problems.length && !seen.bare.length, "#explore again, its drawings in memory: every drawn place whole from its first shown frame, none held", [`${seen.heldSeen} held readings`, ...seen.problems.slice(0, 4), seen.bare.length ? `bare: ${seen.bare.join(", ")}` : ""].filter(Boolean).join("; "));
}

// ---------- a first visit, the home's answer slow: the lessons' card at once, all else into places held from the first frame ----------
/**
 * The arriving page, every frame for `ms` (transition-check's watchArrival, its rule): the held places' boxes at its first frame; every part
 * first seen after that frame (one frame's grace) must lie within one of them, on the screen, or inside a held place itself.
 */
const watchLate = (ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const p = document.querySelector('[data-part="app"] > [data-part="page"]');
        const visible = (h) => h && h.getClientRects().length && !h.hasAttribute("data-waiting") && Number(getComputedStyle(h).opacity) > 0.05;
        const leaving = [...p.querySelectorAll(":scope > .lx-view")].find(visible) ?? null;
        const t0 = performance.now();
        let host = null;
        let first = -1;
        let frame = 0;
        const seen = new WeakSet();
        const held = [];
        const late = [];
        let lessonsAtFirst = false;
        const box = (n) => {
          const r = n.getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
        };
        const onScreen = ([x, y, w, h]) => {
          const top = Math.max(y, 0);
          const bottom = Math.min(y + h, innerHeight);
          return [x, top, w, Math.max(0, bottom - top)];
        };
        const inside = (a, b) => a[0] >= b[0] - 2 && a[1] >= b[1] - 2 && a[0] + a[2] <= b[0] + b[2] + 2 && a[1] + a[3] <= b[1] + b[3] + 2;
        const look = () => {
          frame++;
          const t = Math.round(performance.now() - t0);
          if (!host) {
            host = [...p.querySelectorAll(":scope > .lx-view")].find((h) => visible(h) && h !== leaving) ?? null;
            if (host) {
              first = frame;
              for (const s of host.querySelectorAll('[data-part="skeleton"]')) if (s.getClientRects().length) held.push(box(s));
              lessonsAtFirst = [...host.querySelectorAll(".lx-lessons-card")].some((n) => n.getBoundingClientRect().height > 0);
            }
          }
          if (host) {
            for (const n of host.querySelectorAll("[data-part], button, a[href], h1, h2, h3, p, img")) {
              const r = n.getBoundingClientRect();
              if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
              let o = 1;
              for (let q = n; q && q !== host; q = q.parentElement) o *= Number(getComputedStyle(q).opacity);
              if (o < 0.05 || seen.has(n)) continue;
              seen.add(n);
              const b = box(n);
              if (frame > first + 1 && !n.closest('[data-part="skeleton"]') && !held.some((h) => inside(onScreen(b), onScreen(h))))
                late.push(`${n.getAttribute("data-part") ?? n.tagName.toLowerCase()} “${(n.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24)}” +${t} ms at ${b.join(",")}`);
            }
          }
          if (performance.now() - t0 < ms) requestAnimationFrame(look);
          else resolve({ arrived: Boolean(host), hash: location.hash, held: held.length, lessonsAtFirst, late: late.slice(0, 12), lateCount: late.length });
        };
        requestAnimationFrame(look);
      }),
    ms,
  );
{
  // A device's first visit: no home kept, and no heights kept from an earlier one (lx/shapes.js).
  await page.evaluate(() => ["lx.explore-home.v1", "lx.shapes.v1"].forEach((key) => localStorage.removeItem(key)));
  await fresh("#today");
  const at = await linkTo("#explore");
  if (!at) report(false, "a first visit to #explore: no tab");
  else {
    homeSlow = true;
    if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
    const watching = watchLate(HOME_HOLD + 2500);
    await tapAt(at);
    const seen = await watching;
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    homeSlow = false;
    const home = await page.evaluate(() => document.querySelectorAll('[data-part="page"] > .lx-view:not([data-waiting]) .lx-topics .lx-topic[href]').length);
    report(seen.arrived && (seen.hash || "").startsWith("#explore"), "a first visit to #explore, its home's answer held back: arrived by its tab", `${seen.hash}, ${seen.held} held places in its first frame`);
    report(home > 0, "the home came once its answer did (its topic cards)", `${home} topic cards`);
    report(seen.lessonsAtFirst, "the lessons' card in its first frame (the device's own packs: nothing to wait for)");
    report(!seen.lateCount, `a first visit, its home's answer held back ${HOME_HOLD} ms and the processor slowed ${CPU}×: everything that came after the first frame came into a place held from it`, seen.late.join("; "));
  }
}

// ---------- a topic's page, its answer slow: its cards, one taller than a one-line card, into the place held from its first frame ----------
{
  await fresh("#explore/topics");
  const at = await linkTo(`#explore/topic/${TOPIC}`);
  if (!at) report(false, `#explore/topics has a tile for ${TOPIC}`);
  else {
    topicSlow = true;
    if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
    const watching = watchLate(HOME_HOLD + 2500);
    await tapAt(at);
    const seen = await watching;
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    topicSlow = false;
    const heights = await page.evaluate(() => [...document.querySelectorAll('[data-part="page"] > .lx-view:not([data-waiting]) .lx-topic-card')].map((n) => Math.round(n.getBoundingClientRect().height)));
    report(seen.arrived && (seen.hash || "").startsWith(`#explore/topic/${TOPIC}`), `${TOPIC}'s page by its tile, its answer held back: arrived`, `${seen.hash}, ${seen.held} held places in its first frame`);
    report(heights.length >= 2 && Math.max(...heights) > 262, `a card taller than a one-line card's 262 px (its sentence on two lines): the case this holds`, `card heights ${heights.join(", ")}`);
    report(!seen.lateCount, `${TOPIC}'s page, its answer held back ${HOME_HOLD} ms and the processor slowed ${CPU}×: its cards came into the place held from its first frame`, seen.late.join("; "));
  }
}

// ---------- stills: #explore while its drawings are held back, and once they're in ----------
{
  await fresh("#today");
  const at = await linkTo("#explore");
  if (at) {
    holding = true;
    await tapAt(at);
    await wait(Math.min(1200, HOLD - 200));
    await page.screenshot({ path: `${OUT}/arrive-${WIDTH}-held.png` });
    holding = false;
    await wait(HOLD + 1200);
    await page.screenshot({ path: `${OUT}/arrive-${WIDTH}-arrived.png` });
    console.log(`stills: ${OUT}/arrive-${WIDTH}-held.png, ${OUT}/arrive-${WIDTH}-arrived.png`);
  }
}

// ---------- stills: a first visit while the home's answer is on its way, and once it's in ----------
{
  // A device's first visit: no home kept, and no heights kept from an earlier one (lx/shapes.js).
  await page.evaluate(() => ["lx.explore-home.v1", "lx.shapes.v1"].forEach((key) => localStorage.removeItem(key)));
  await fresh("#today");
  const at = await linkTo("#explore");
  if (at) {
    homeSlow = true;
    await tapAt(at);
    await wait(Math.min(1500, HOME_HOLD - 300));
    await page.screenshot({ path: `${OUT}/home-${WIDTH}-held.png` });
    homeSlow = false;
    await wait(HOME_HOLD + 1500);
    await page.screenshot({ path: `${OUT}/home-${WIDTH}-arrived.png` });
    console.log(`stills: ${OUT}/home-${WIDTH}-held.png, ${OUT}/home-${WIDTH}-arrived.png`);
  }
}

// ---------- stills: a topic's page while its answer is on its way, and once it's in ----------
{
  await fresh("#explore/topics");
  const at = await linkTo(`#explore/topic/${TOPIC}`);
  if (at) {
    topicSlow = true;
    await tapAt(at);
    await wait(Math.min(1500, HOME_HOLD - 300));
    await page.screenshot({ path: `${OUT}/topic-${WIDTH}-held.png` });
    topicSlow = false;
    await wait(HOME_HOLD + 1500);
    await page.screenshot({ path: `${OUT}/topic-${WIDTH}-arrived.png` });
    console.log(`stills: ${OUT}/topic-${WIDTH}-held.png, ${OUT}/topic-${WIDTH}-arrived.png`);
  }
}

report(!errors.length, "no page errors", errors.slice(0, 3).join("; "));
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
