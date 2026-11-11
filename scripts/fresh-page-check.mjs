// What arrives between a page's reveal and its first frame is in that frame (shell/main.js shown: data-fresh; lx/ui.js onScreenNow), never a
// frame with neither its held place nor what came. The router shows a held page at its ready wait (400 ms at most), and on a slow phone the frame
// that first shows it is painted later; a card or a drawing that came in that gap took its held place's place and faded up from nothing, so
// that first frame showed an empty spot (Explore's topic cards and drawings, under load: 8 Nov).
//
// A new learner of Dutch on a touch phone. Explore's topic page (#explore/topic/everyday) is visited once and its answers recorded (the list and
// each pack's sample: /api/community/items…); the app is started again on Home, and the page opened from there as a link from another tab opens
// it (the router reveals it: no slide, whose picture hides a page until it ends) with the processor slowed 4× and those answers held, page side,
// until the router shows the page, then released in that same moment (a MutationObserver on data-waiting), each from
// memory, read in a microtask: its held cards are taken over in the reveal's own task, before any frame. Every frame from the tap
// (transition-check's rule): a part first seen after the page's first frame must lie in a place held from that frame. Reached only when the
// cards came before that frame's animation frame (their held place's removal timed against it); a try that misses it is tried again (--tries),
// and none reached is exit 2. The app from before fails it (the cards faded up from nothing over an empty first frame).
// LOCAL only (it signs up a test account), path-nl and Explore's topic packs seeded. Through gpu.py's parallel lane.
// Usage: node scripts/fresh-page-check.mjs http://localhost:<port> <outDir> [--cpu 4] [--tries 4]   (exit 0 = pass, 2 = not reached)
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/fresh-page-check.mjs http://localhost:<port> <outDir> [--cpu 4] [--tries 4]");
  process.exit(2);
}
const CPU = Number(opt("cpu", "4"));
const TRIES = Number(opt("tries", "4"));
const TOPIC = "everyday";
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.error("ceiling: 8 minutes"), process.exit(3)), 8 * 60_000).unref();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let failed = 0;
const report = (ok, what, detail = "") => {
  if (!ok) failed++;
  results.push({ ok, what, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
// Page side, before the app: the topic page's answers recorded (mode "record", kept in sessionStorage across a start), or held (mode "hold", set
// right before the tap) and served from that record once the router shows a held page, in the same microtask; the moments timed. "idle": neither.
await context.addInitScript(() => {
  if (location.protocol === "about:") return;
  const KEY = "check.fresh.answers";
  const want = (key) => /^\/api\/community\/items(\/|\?)/.test(key);
  const kept = JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  const real = window.fetch.bind(window);
  const f = (window.__fresh = { mode: sessionStorage.getItem("check.fresh.mode") ?? "record", released: false, waiters: [], t: {}, log: [] });
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const key = url.pathname + url.search;
    if (!want(key)) return real(input, init);
    if (f.mode === "hold") f.log.push(`${Math.round(performance.now())} asked ${key}${kept[key] ? "" : " (not recorded)"}`);
    if (f.mode === "hold" && kept[key]) {
      if (!f.released) await new Promise((resolve) => f.waiters.push(resolve));
      f.log.push(`${Math.round(performance.now())} served ${key}`);
      // A response whose body is read in a microtask (a real Response's takes a task): what the page does with it runs on in the reveal's own
      // task, before any frame, as an answer landing in a slow first frame's gap does.
      const { body, status, type } = kept[key];
      const answer = { ok: status >= 200 && status < 300, status, headers: new Headers({ "content-type": type }), json: async () => JSON.parse(body), text: async () => body, clone: () => answer };
      return answer;
    }
    const response = await real(input, init);
    if (f.mode === "record" && response.ok) {
      kept[key] = { status: response.status, type: response.headers.get("content-type") ?? "application/json", body: await response.clone().text() };
      sessionStorage.setItem(KEY, JSON.stringify(kept));
    }
    return response;
  };
  new MutationObserver((records) => {
    if (f.mode !== "hold") return;
    for (const r of records) {
      if (r.type === "childList") for (const n of r.removedNodes) if (n.classList?.contains("lx-topic-held")) f.t.arrived ??= performance.now();
      if (r.type === "attributes" && !f.released && r.target.classList?.contains("lx-view") && r.oldValue !== null && !r.target.hasAttribute("data-waiting")) {
        f.released = true;
        f.t.released = performance.now();
        // The first frame that shows it: its animation frame (what's in the page by then is in that frame; what comes after, in a later one).
        requestAnimationFrame(() => (f.t.presented = performance.now()));
        for (const w of f.waiters.splice(0)) w();
      }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-waiting"], attributeOldValue: true });
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
await page.fill('input[name="name"]', "Fresh Page Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]", { state: "attached", timeout: 60_000 });
await page.evaluate(async () => {
  localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
  const { syncLibraryPacks } = await import("/js/study/packs.js");
  await syncLibraryPacks().catch(() => {});
});

const tapAt = async ({ x, y }) => {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await wait(40);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
const atRest = async (route) => {
  await page.waitForFunction((r) => (location.hash || "#today").split("?")[0] === r && !document.querySelector('[data-part="page"] > .lx-view[data-waiting]'), route, { timeout: 30_000 });
  await wait(1500);
};
const start = async (route, mode) => {
  await page.evaluate((m) => sessionStorage.setItem("check.fresh.mode", m), mode);
  await page.goto("about:blank");
  await page.goto(`${BASE}/app/${route}`);
  await page.waitForSelector("html[data-app-ready]", { state: "attached", timeout: 60_000 });
  await atRest(route.split("?")[0]);
};
const tileAt = () =>
  page.evaluate((topic) => {
    const a = document.querySelector(`[data-part="page"] > .lx-view:not([data-waiting]) .lx-topic[data-topic="${topic}"]`);
    if (!a) return null;
    a.scrollIntoView({ block: "center" });
    const r = a.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 3) };
  }, TOPIC);

/** The arriving page, every frame for `ms`: transition-check's rule (a part first seen after its first frame lies in a place held from it). */
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
        let firstFrame = null;
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
              // The cards' place in this first frame: its held place, or the cards (their opacity up to the page), never neither.
              const opacity = (n) => {
                let o = 1;
                for (let q = n; q && q !== host; q = q.parentElement) o *= Number(getComputedStyle(q).opacity);
                return o;
              };
              const heldCards = [...host.querySelectorAll(".lx-topic-held")].filter((n) => n.getClientRects().length && opacity(n) >= 0.5).length;
              const cards = [...host.querySelectorAll('.lx-topic-card, [data-part="next-step"]')].map((n) => Math.round(opacity(n) * 100) / 100);
              firstFrame = { heldCards, cards };
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
                late.push(`${n.getAttribute("data-part") ?? n.tagName.toLowerCase()} “${(n.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24)}” +${t} ms (frame ${frame - first}) at ${b.join(",")}`);
            }
          }
          if (performance.now() - t0 < ms) requestAnimationFrame(look);
          else resolve({ arrived: Boolean(host), hash: location.hash, held: held.length, late: late.slice(0, 10), lateCount: late.length, firstFrame });
        };
        requestAnimationFrame(look);
      }),
    ms,
  );

// ---------- the topic page's answers, recorded on a visit ----------
await start("#explore", "record");
{
  const at = await tileAt();
  if (!at) {
    report(false, `#explore has a tile for the topic ${TOPIC}`);
    await browser.close();
    process.exit(2);
  }
  await tapAt(at);
  await atRest(`#explore/topic/${TOPIC}`);
  await wait(1500);
  const kept = await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem("check.fresh.answers") ?? "{}")));
  report(kept.some((k) => k.includes(`topic=${"everyday"}`)) && kept.length > 1, `${TOPIC}'s answers recorded (the list and its packs' samples)`, kept.join(", "));
}

// ---------- the answers landing between the reveal and its first frame ----------
let reached = null;
for (let n = 1; n <= TRIES && !reached; n++) {
  // From Home, another tab: the router shows the topic page when it's ready (400 ms at most), no slide (a slide's picture hides the page until
  // it ends), as a link from another tab opens it.
  await start("#today", "idle");
  // Held from now: only the answers the tap's page asks for, released when that page is shown.
  await page.evaluate(() => Object.assign(window.__fresh, { mode: "hold", released: false, waiters: [], t: {}, log: [] }));
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  const watching = watchLate(3500);
  await page.evaluate((topic) => (location.hash = `#explore/topic/${topic}?lang=nl`), TOPIC);
  const seen = await watching;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const t = await page.evaluate(() => window.__fresh.t);
  const cards = await page.evaluate(() => document.querySelectorAll('[data-part="page"] > .lx-view:not([data-waiting]) [data-part="next-step"]').length);
  const timing = `released +0, cards in +${Math.round((t.arrived ?? NaN) - t.released)} ms, the first frame's animation frame +${Math.round((t.presented ?? NaN) - t.released)} ms`;
  if (t.released !== undefined && t.arrived !== undefined && t.presented !== undefined && t.arrived < t.presented) reached = { n, seen, timing, cards };
  else {
    console.log(`  try ${n}: not reached (${timing}); again`);
    console.log(`    released at ${Math.round(t.released ?? NaN)}: ${(await page.evaluate(() => window.__fresh.log)).join(" | ")}`);
  }
}
if (!reached) {
  console.log(`NOT REACHED: in ${TRIES} tries the cards never came before the reveal's first frame was presented`);
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
  await browser.close();
  process.exit(2);
}
report(reached.cards > 0, `try ${reached.n}: the topic page's cards came between the router showing it and its first frame (${reached.timing})`, `${reached.cards} cards`);
const ff = reached.seen.firstFrame;
const whole = ff && (ff.heldCards > 0 || (ff.cards.length > 0 && ff.cards.every((o) => o >= 0.5)));
report(Boolean(whole), `processor slowed ${CPU}×: the page's first frame shows the cards' held place or the cards themselves, never neither (an empty spot)`, ff ? `held places ${ff.heldCards}, cards at opacity ${ff.cards.join(", ") || "none"}` : "no first frame seen");
report(!reached.seen.lateCount, "what came between the reveal and the first frame is in that frame, or in a place held from it (transition-check's rule)", reached.seen.late.join("; "));
report(!errors.length, "no page errors", errors.slice(0, 3).join("; "));
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
