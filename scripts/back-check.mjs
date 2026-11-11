// Back, every way at once (shell/main.js, "back: one rule"), on a touch phone with the Home Screen app's own swipe on: the app's swipe from the left
// edge (real touch), the header's Back, and the phone's own back (an iPhone's Home Screen app or Safari has its own edge swipe; here the browser's
// back, page.goBack). On an iPhone (iOS 18, the Home Screen app, 5 Nov 2026) one swipe went back twice, the app's and the phone's: the page went a
// step past where it should (Knowledge for a second, then the tab bar on Home) and the screen stayed black.
//   1. His path: Home → "things done this week" → the phone's back → "words you'd recall" → a page under Knowledge (a word's, from its search;
//      the cards open no pages) → a swipe that is both the app's and the phone's (the phone's at the lift, then 250 ms after it): Knowledge, and
//      nothing more; two pages in under Settings too (the phone's after the app's).
//   A tab's own page: back goes to Home (as Android has it), and Home has nothing of the app's before it.
//   A tab, then a page at once (0, 5, 30 ms): the page stays, though the tab's history is still stepping back to start afresh.
//   A page that becomes another in its entry (shell/route.js replaceRoute, a form's Done): drawn in place, the app's record following.
//   2. Seeded walks over the app's real links (cross-tab ones among them: Home's progress into Knowledge, Study into Explore, Settings), tab taps,
//      Settings' gear, the header's Back, the app's swipe and the phone's back. After every step: the screen isn't blank (a page in place, no
//      picture left over), the tab lit is the page's, a back moved one step at most and stayed in its tab or went to the page that opened it (a
//      back at a tab's own page goes nowhere), and the app's record of the history is the browser's. A failure prints its seed and steps.
// Usage: node scripts/back-check.mjs http://localhost:<port> <outDir> [--seeds 1,2,3] [--steps 200]   (exit 0 = pass; LOCAL only)
import { wordsPoint } from "./fixtures/words-point.mjs";
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/back-check.mjs http://localhost:<port> <outDir> [--seeds 1,2,3] [--steps 200] (a local server only: it signs up a test account)");
  process.exit(2);
}
const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const SEEDS = arg("--seeds", "1,2,3").split(",").map(Number);
const STEPS = Number(arg("--steps", "200"));
mkdirSync(OUT, { recursive: true });
let failed = 0;
const failures = [];
const report = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const desk = await browser.newContext({ viewport: { width: 390, height: 844 } });
const signup = await desk.newPage();
const vauth = await desk.newCDPSession(signup);
await vauth.send("WebAuthn.enable");
await vauth.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await signup.goto(`${BASE}/app/`);
await signup.waitForURL(/\/login\?next=/);
await signup.click("summary");
await signup.fill('input[name="name"]', "Back Check");
await signup.click('#register button[type="submit"]');
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
const cookies = await desk.cookies();

/** A phone: the Home Screen app's swipe on, some study (so Home shows its progress), at Home. */
async function phone() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addCookies(cookies);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("check.swipe-back", "1");
      localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
    } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector('[data-part="tab-bar"]', { timeout: 30_000 });
  await page.waitForTimeout(2000);
  await page.evaluate(async () => {
    const { syncLibraryPacks } = await import("/js/study/packs.js");
    await syncLibraryPacks();
    const { record } = await import("/js/study/progress.js");
    const { CHUNKS, WORDS } = await import("/js/study/content.js");
    record([...Object.keys(WORDS).slice(0, 150).map((w) => "w:" + w), ...Object.keys(CHUNKS).slice(0, 20).map((c) => "c:" + c)].map((concept) => ({ concept, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "check" })));
    await new Promise((r) => setTimeout(r, 300));
  });
  // A fresh start of the app at Home (its first entry), as an iPhone's Home Screen app opens.
  const fresh = await context.newPage();
  fresh.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
  await page.close();
  await fresh.goto(`${BASE}/app/#today`);
  await fresh.waitForSelector('[data-part="tab-bar"]', { timeout: 30_000 });
  await fresh.waitForTimeout(2000);
  const cdp = await context.newCDPSession(fresh);
  return { context, page: fresh, cdp, errors };
}

/** What's on the screen, and the app's record against the browser's history. */
const look = (page) =>
  page.evaluate(() => {
    const route = `#${location.hash.replace(/^#\/?/, "").split("?")[0] || "today"}`;
    const p = document.querySelector('[data-part="app"] > [data-part="page"]');
    const host = p && [...p.querySelectorAll(":scope > .lx-view")].find((h) => !h.hasAttribute("data-waiting"));
    const box = host?.getBoundingClientRect();
    const x = p ? new DOMMatrixReadOnly(getComputedStyle(p).transform).m41 : null;
    const lit = document.querySelector('[data-part="tab-bar"] [data-part="tab"][data-state="active"]')?.getAttribute("href") ?? null;
    const tabsIds = [...document.querySelectorAll('[data-part="tab-bar"] [data-part="tab"]')].map((t) => t.getAttribute("href"));
    const nav = globalThis.__lxNav?.() ?? null;
    return {
      route,
      i: history.state?.lx?.i ?? null,
      lit,
      tabsIds,
      x: x === null ? null : Math.round(x),
      pictures: document.querySelectorAll("[data-page-picture]").length,
      shown: Boolean(host && box.width > 0 && box.height > 0 && box.right > 0 && box.left < innerWidth && (host.innerText.trim().length > 0 || host.querySelector("svg, img, canvas"))),
      session: Boolean(document.querySelector('[data-part="session"]')),
      reader: Boolean(document.querySelector('[data-part="reader"]')),
      back: (() => {
        const b = [...document.querySelectorAll('[data-part="app-back"]')].find((n) => n.getClientRects().length && !n.closest("[data-ghost]"));
        return b ? { href: b.getAttribute("href"), label: b.textContent.trim() } : null;
      })(),
      nav,
    };
  });
/** Waits for the page to come to rest: no picture, in place, the address steady. */
async function rest(page, ms = 1600) {
  const t0 = Date.now();
  let last = "";
  let same = 0;
  while (Date.now() - t0 < ms) {
    const s = await look(page);
    const key = `${s.route}|${s.i}|${s.x}|${s.pictures}`;
    same = key === last && s.pictures === 0 && Math.abs(s.x ?? 0) < 1 ? same + 1 : 0;
    last = key;
    if (same >= 3) break;
    await wait(80);
  }
  await wait(120);
  return look(page);
}
const firstOf = (route) => route.slice(1).split("/")[0];
/** The tab a route lights (the app's own rule: a page with no tab lights the one it lives under), by what the bar has. */
function tabOf(route, tabsIds) {
  const first = firstOf(route);
  if (first === "settings") return null;
  if (tabsIds.includes(`#${first}`)) return `#${first}`;
  if (first === "read") return "#today";
  return undefined; // (the AI section and Practice: under whichever has them now; not asserted)
}
const isTabsOwnPage = (route, tabsIds) => route.split("/").length === 1 && (tabsIds.includes(route) || route === "#settings");

async function tapBox(ctx, box) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await ctx.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await wait(40);
  await ctx.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
/** The app's own swipe from the left edge, by touch; with phoneAt (ms after the lift), the phone's back too, as an iPhone that has its own. */
async function swipe(ctx, { phoneAt = null } = {}) {
  const touch = (type, x) => ctx.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: 430 }] });
  await touch("touchStart", 4);
  for (let k = 1; k <= 14; k++) {
    await touch("touchMove", 4 + (300 * k) / 14);
    await wait(16);
  }
  await touch("touchEnd", 304);
  if (phoneAt !== null) {
    await wait(phoneAt);
    await phoneBack(ctx);
  }
}
// The phone's own back: one step back, made by nothing in the app. Only within the app's history: on an iPhone nothing is before the app's
// first entry (here the tab's blank page is, which a phone never goes to).
const phoneBack = (ctx) => ctx.page.evaluate(() => (history.state?.lx?.i ?? 0) > 0 && history.back()).catch(() => {});
async function tapLink(ctx, selector) {
  const l = ctx.page.locator(selector).first();
  if (!(await l.count())) return false;
  await l.scrollIntoViewIfNeeded().catch(() => {});
  await wait(200);
  // On its words (fixtures/words-point.mjs), never its middle as such: Tinta standing on a link (Home's streak spot and Your AI card, the path
  // strip) takes a tap on him as a poke, his alone, and the walk would go nowhere.
  const at = await l.evaluate(wordsPoint).catch(() => null);
  if (!at || at.y < 50 || at.y > 760) return false;
  await tapBox(ctx, { x: at.x, y: at.y, width: 0, height: 0 });
  return true;
}

/** A page under Knowledge, as a person reaches one: a word typed in its search, its first result tapped. */
async function wordFromSearch(ctx) {
  const field = ctx.page.locator('[data-part="page"]:not([data-ghost]) .lx-know-search input[type="search"]');
  if (!(await field.count())) return false;
  await field.fill("ik");
  await ctx.page.locator('[data-part="page"]:not([data-ghost]) .lx-know-search a[data-part="list-row"]').first().waitFor({ timeout: 10_000 }).catch(() => {});
  return tapLink(ctx, '[data-part="page"] .lx-know-search a[data-part="list-row"]');
}

/** Everything that must hold at rest. */
function atRest(s, what) {
  const bad = [];
  if (!s.session && !s.reader) {
    if (!s.shown) bad.push("nothing on the screen (no page in place)");
    if (Math.abs(s.x ?? 0) > 1) bad.push(`the page off its place (x ${s.x})`);
    if (s.pictures) bad.push(`${s.pictures} pictures of pages left`);
    const tab = tabOf(s.route, s.tabsIds);
    if (tab && s.lit !== tab) bad.push(`the tab lit is ${s.lit} on ${s.route}`);
  }
  if (s.nav && (s.nav.i !== s.i || s.nav.routes[s.nav.i] !== s.route)) bad.push(`the app's record (entry ${s.nav.i}, ${s.nav.routes[s.nav.i]}) isn't the browser's (entry ${s.i}, ${s.route})`);
  return bad.map((b) => `${what}: ${b}`);
}

// ---------- 1. his path ----------
for (const phoneAt of [0, 250]) {
  const ctx = await phone();
  const { page } = ctx;
  const steps = [];
  const step = async (what, act) => {
    await act();
    const s = await rest(page);
    steps.push(`${what} → ${s.route} (entry ${s.i}, tab ${s.lit})`);
    return s;
  };
  await step("things done this week", () => tapLink(ctx, '[data-part="page"] a[href="#know/days"]'));
  await step("the phone's back", () => phoneBack(ctx));
  await step("words you'd recall", () => tapLink(ctx, '[data-part="page"] a[href="#know"]'));
  // A page under Knowledge (its cards open no pages: a word from its search opens the word's own).
  const before = await step("a word's page from Knowledge's search", () => wordFromSearch(ctx));
  const after = await step(`a swipe that's the app's and the phone's (${phoneAt} ms after the lift)`, () => swipe(ctx, { phoneAt }));
  await wait(1500);
  const later = await look(page);
  const bad = [...atRest(later, "after the swipe")];
  if (later.route !== "#know") bad.push(`landed on ${later.route}, not Knowledge (#know)`);
  if (later.route !== after.route) bad.push(`moved again after it came to rest: ${after.route} → ${later.route}`);
  report(/^#know\/w(%3A|:)/.test(before.route) && bad.length === 0, `his path, one swipe that's the app's and the phone's (${phoneAt} ms): Knowledge, once, the page in place`, bad.join("; ") || steps.join(" · "));
  if (bad.length) failures.push({ what: `his path (${phoneAt} ms)`, steps, bad });
  await page.screenshot({ path: `${OUT}/his-path-${phoneAt}.png` });
  // Deeper: the app's swipe first, the phone's back after it, from two pages in.
  if (phoneAt === 250) {
    // Settings, then one of its pages, then one of that one's: the first link to a deeper page each has.
    const firstUnder = (prefix) =>
      page.evaluate((prefix) => [...document.querySelectorAll('[data-part="page"] a[href]')].find((a) => a.getClientRects().length && !a.closest("[data-ghost]") && a.getAttribute("href").startsWith(prefix) && a.getAttribute("href") !== prefix)?.getAttribute("href") ?? null, prefix);
    // The first of Settings' pages that has a page under it.
    const candidates = await (async () => {
      await page.evaluate(() => (location.hash = "#settings"));
      await rest(page);
      return page.evaluate(() => [...new Set([...document.querySelectorAll('[data-part="page"] a[href^="#settings/"]')].filter((a) => a.getClientRects().length && !a.closest("[data-ghost]")).map((a) => a.getAttribute("href")))]);
    })();
    let first = null;
    let deeper = null;
    let d1 = null;
    let link = null;
    for (const href of candidates.slice(0, 10)) {
      await page.evaluate(() => (location.hash = "#settings"));
      await rest(page);
      deeper = await tapLink(ctx, `[data-part="page"] a[href="${href}"]`);
      d1 = await rest(page);
      link = deeper ? await firstUnder(`${d1.route}/`) : null;
      first = href;
      if (link) break;
    }
    if (!deeper || !link) report(false, "two pages in, the app's swipe and then the phone's back: one step", `no two pages in under Settings (${first} → ${link})`);
    if (deeper && link) {
      await tapLink(ctx, `[data-part="page"] a[href="${link}"]`);
      const d2 = await rest(page);
      await swipe(ctx, { phoneAt: 450 });
      await wait(1500);
      const d3 = await rest(page);
      const badD = atRest(d3, "deeper");
      if (d3.route !== d1.route) badD.push(`landed on ${d3.route}, not ${d1.route}`);
      report(badD.length === 0, "two pages in, the app's swipe and then the phone's back: one step", badD.join("; ") || `${d2.route} → ${d3.route}`);
    }
  }
  await ctx.context.close();
}

// ---------- a tab's own page: back goes to Home, and only Home's leaves (as Android has it) ----------
{
  const ctx = await phone();
  const { page } = ctx;
  const tab = async (id) => {
    const box = await page.locator(`[data-part="tab-bar"] [data-part="tab"][href="#${id}"]`).first().boundingBox();
    await tapBox(ctx, box);
    return rest(page);
  };
  const bad = [];
  const steps = [];
  const a = await tab("explore");
  await phoneBack(ctx);
  const b = await rest(page);
  steps.push(`Explore's tab → back → ${b.route} (entry ${b.i})`);
  if (b.route !== "#today") bad.push(`back at Explore's own page went to ${b.route}, not Home`);
  await tab("study");
  await tab("explore");
  await phoneBack(ctx);
  const c = await rest(page);
  steps.push(`Study's tab, Explore's tab → back → ${c.route} (entry ${c.i})`);
  if (c.route !== "#today") bad.push(`back at Explore's own page, after Study's, went to ${c.route}, not Home (never Study)`);
  // Home's own page: nothing of the app's before it (a phone's back leaves the app there).
  if (c.i !== 0) bad.push(`Home is entry ${c.i}, with the app's own entries before it`);
  // A page under a tab, then back to it, then back to Home.
  await tab("know");
  // A page under it: a word's, from its search (the cards open no pages).
  const linked = await wordFromSearch(ctx);
  const d = await rest(page);
  await phoneBack(ctx);
  const e = await rest(page);
  await phoneBack(ctx);
  const f = await rest(page);
  steps.push(`Knowledge, ${d.route} → back → ${e.route} → back → ${f.route}`);
  if (linked && e.route !== "#know") bad.push(`back from ${d.route} went to ${e.route}, not Knowledge`);
  if (f.route !== "#today") bad.push(`back at Knowledge's own page went to ${f.route}, not Home`);
  bad.push(...atRest(b, "Explore back"), ...atRest(c, "Explore back again"), ...atRest(f, "Knowledge back"));
  report(bad.length === 0, "a tab's own page: back goes to Home, and Home has nothing of the app's before it", bad.join("; ") || steps.join(" · "));
  void a;
  await ctx.context.close();
}

// ---------- a tab, then at once a page: the page stays (a tab's history starting afresh steps back through the browser's history, which takes
// a moment; a page that comes first is the one you're on: 5 Nov 2026, Home then a page lost its address to Home's) ----------
for (const ms of [0, 5, 30]) {
  const ctx = await phone();
  const { page } = ctx;
  // Entries to step back through, in Explore.
  for (const h of ["#explore", "#explore/browse?lang=nl", "#explore/requests?lang=nl", "#explore/terms"]) {
    await page.evaluate((x) => (location.hash = x), h);
    await page.waitForTimeout(500);
  }
  // The page pressed the moment the tab's own address comes (0 ms: in that same moment), or a few ms after.
  await page.evaluate((ms) => {
    const go = () => (location.hash = "#know/days");
    addEventListener("hashchange", function next() {
      if (location.hash !== "#today") return;
      removeEventListener("hashchange", next);
      if (ms) setTimeout(go, ms);
      else go();
    });
  }, ms);
  const box = await page.locator('[data-part="tab-bar"] [data-part="tab"][href="#today"]').first().boundingBox();
  await tapBox(ctx, box);
  await page.waitForTimeout(2500);
  const s1 = await rest(page);
  // #know/days is the Knowledge page opened at its This week card.
  const shown = await page.evaluate(() => Boolean([...document.querySelectorAll('[data-card="week"]')].find((n) => n.getClientRects().length && !n.closest("[data-ghost]"))));
  const bad = [...atRest(s1, "the page")];
  if (s1.route !== "#know/days") bad.push(`ended on ${s1.route}, not the page (#know/days)`);
  if (!shown) bad.push("This week isn't on the screen");
  let s2 = null;
  try {
    await phoneBack(ctx);
    s2 = await rest(page);
    bad.push(...atRest(s2, "then back"));
    if (s2.route !== "#today") bad.push(`back from it went to ${s2.route}, not Home`);
  } catch (error) {
    bad.push(`back from it left the app (${page.url()}): ${String(error).split("\n")[0].slice(0, 80)}`);
  }
  report(bad.length === 0, `a tab, then a page ${ms} ms after: the page stays, and back goes to the tab`, bad.join("; ") || `${s1.route} (entry ${s1.i}) → back → ${s2.route} (entry ${s2.i})`);
  await ctx.context.close();
}

// ---------- a full history (the browser keeps 50 entries a tab), then a tab's page from another tab, then a link on it at once: the link's
// page comes (7 Nov 2026: past the cap a new entry drops the oldest and the history's length doesn't grow, so the router took the link's new
// entry for its own step's and drew nothing; after 91 pages in a row Study's Practice door changed the address and no session came) ----------
{
  const ctx = await phone();
  const { page } = ctx;
  const pages = ["#explore/browse?lang=nl", "#explore/requests?lang=nl", "#explore/terms", "#explore"];
  for (let k = 0; k < 56; k++) {
    await page.evaluate((x) => (location.hash = x), pages[k % pages.length]);
    await page.waitForTimeout(120);
  }
  await rest(page);
  const full = await page.evaluate(() => history.length);
  // To Study from Explore (its history starting afresh: the router's own step), then a link on it the moment it's there.
  await page.evaluate(() => (location.hash = "#study"));
  await page.waitForFunction(() => location.hash === "#study" && document.querySelector('[data-part="page"] a[href="#study/packs"]'), null, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);
  const tapped = await tapLink(ctx, '[data-part="page"] a[href="#study/packs"]');
  await page.waitForTimeout(2000);
  const s1 = await rest(page);
  const bad = [...atRest(s1, "the link's page")];
  if (full < 50) bad.push(`SETUP: the history only ${full} long`);
  if (!tapped) bad.push("SETUP: no Your packs link on Study");
  if (s1.route !== "#study/packs") bad.push(`ended on ${s1.route}, not #study/packs`);
  if (s1.nav?.routes?.[s1.nav.i] !== "#study/packs") bad.push(`the router's record: ${JSON.stringify(s1.nav)}`);
  report(bad.length === 0, "a full history (50 entries), then Study from Explore and a link on it at once: the link's page comes, the router's record with it", bad.join("; ") || `history ${full}; ${s1.route} (entry ${s1.i}), the record ${JSON.stringify(s1.nav?.routes)}`);
  await ctx.context.close();
}

// ---------- a page that becomes another in its entry (shell/route.js replaceRoute) ----------
{
  const ctx = await phone();
  const { page } = ctx;
  await tapLink(ctx, '[data-part="page"] a[href="#know/days"]');
  const a = await rest(page);
  const swapped = await page.evaluate(async () => {
    try {
      const { replaceRoute } = await import("/js/shell/route.js");
      replaceRoute("#know/now");
      return true;
    } catch (error) {
      return String(error).slice(0, 80);
    }
  });
  const b = await rest(page);
  const title = await page.evaluate(() => document.querySelector('[data-part="page-title"]')?.textContent ?? null);
  await phoneBack(ctx);
  const c = await rest(page);
  const bad = [...atRest(b, "replaced"), ...atRest(c, "then back")];
  if (swapped !== true) bad.push(`no replaceRoute: ${swapped}`);
  if (b.route !== "#know/now" || b.i !== a.i) bad.push(`replaced: ${b.route} at entry ${b.i} (was entry ${a.i})`);
  if (!/right now/i.test(title ?? "")) bad.push(`the page shown is ${JSON.stringify(title)}`);
  if (c.route !== "#today") bad.push(`back from it went to ${c.route}, not Home`);
  report(bad.length === 0, "a page that becomes another in its entry (replaceRoute): drawn in place, the record following, back skipping it", bad.join("; ") || `${a.route} → ${b.route} (entry ${b.i}) → back → ${c.route}`);
  await ctx.context.close();
}

// ---------- 2. walks ----------
const EXCLUDED = /^#(study\/session|read\/book|settings\/account|ai\/connect|settings\/data)/;
const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (const seed of SEEDS) {
  const ctx = await phone();
  const { page } = ctx;
  const r = rng(seed * 7919 + 17);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const log = [];
  // Which entry each page was opened from (by the browser's entry number): a back may go there across tabs.
  const openedFrom = new Map();
  let s = await rest(page);
  let failedHere = false;
  for (let n = 0; n < STEPS && !failedHere; n++) {
    const before = s;
    const roll = r();
    let what = null;
    let kind = null;
    if (roll < 0.18) {
      const other = before.tabsIds.filter((t) => t !== before.lit);
      const t = pick(other);
      const box = await page.locator(`[data-part="tab-bar"] [data-part="tab"][href="${t}"]`).first().boundingBox();
      if (!box) continue;
      await tapBox(ctx, box);
      what = `tab ${t}`;
      kind = "tab";
    } else if (roll < 0.22) {
      const box = await page.locator('[data-part="header"] [aria-label*="Settings" i], [data-part="app-header"] button:last-child').first().boundingBox().catch(() => null);
      if (!box) {
        await page.evaluate(() => (location.hash = "#settings"));
      } else await tapBox(ctx, box);
      what = "Settings";
      kind = "link";
    } else if (roll < 0.6) {
      const links = await page.evaluate(() =>
        [...document.querySelectorAll('[data-part="page"] a[href^="#"]')]
          .filter((a) => {
            const b = a.getBoundingClientRect();
            return b.width > 0 && b.height > 0 && !a.closest("[data-ghost]") && !a.closest("[hidden]");
          })
          .map((a) => a.getAttribute("href")),
      );
      const ok = links.filter((h) => !EXCLUDED.test(h));
      if (!ok.length) continue;
      const href = pick(ok);
      if (!(await tapLink(ctx, `[data-part="page"] a[href="${href.replace(/"/g, '\\"')}"]`))) continue;
      what = `link ${href}`;
      kind = "link";
    } else if (roll < 0.72) {
      if (!before.back) continue;
      const box = await page.locator('[data-part="app-back"]').first().boundingBox().catch(() => null);
      if (!box) continue;
      await tapBox(ctx, box);
      what = `Back (${before.back.label})`;
      kind = "header";
    } else if (roll < 0.88) {
      await swipe(ctx);
      what = "the app's swipe";
      kind = "swipe";
    } else {
      if (!before.i) continue; // the app's first entry: an iPhone has nothing before it
      await phoneBack(ctx);
      what = "the phone's back";
      kind = "phone";
    }
    s = await rest(page);
    if (kind === "link" && s.i !== null && before.i !== null && s.i === before.i + 1) openedFrom.set(s.i, before.route);
    log.push(`${n}: ${what} on ${before.route} (entry ${before.i}) → ${s.route} (entry ${s.i}, tab ${s.lit})`);
    const bad = atRest(s, `step ${n}`);
    if (kind === "swipe" || kind === "phone") {
      if (s.i !== null && before.i !== null && s.i < before.i - 1) bad.push(`step ${n}: ${what} went ${before.i - s.i} steps back`);
      const moved = s.route !== before.route || s.i !== before.i;
      const sameTab = tabOf(s.route, s.tabsIds) === tabOf(before.route, before.tabsIds) || firstOf(s.route) === firstOf(before.route);
      const toOpener = openedFrom.get(before.i) === s.route;
      // From a tab's own page (not Home's), back goes to Home: Android's way, and never into the tab left before it.
      const toHome = isTabsOwnPage(before.route, before.tabsIds) && before.route !== "#today" && s.route === "#today";
      if (moved && !sameTab && !toOpener && !toHome) bad.push(`step ${n}: ${what} from ${before.route} went into another tab, to ${s.route}`);
    }
    if (kind === "header" && s.i !== null && before.i !== null && s.i > before.i) bad.push(`step ${n}: Back went forward`);
    if (bad.length) {
      failedHere = true;
      failures.push({ seed, steps: log.slice(-12), bad });
      report(false, `walk ${seed}: step ${n}`, bad.join("; "));
      console.log(log.slice(-12).map((l) => `      ${l}`).join("\n"));
      await page.screenshot({ path: `${OUT}/walk-${seed}-step-${n}.png` });
    }
  }
  if (!failedHere) report(true, `walk ${seed}: ${STEPS} steps`, `${log.filter((l) => /swipe|phone's back|Back \(/.test(l)).length} backs, ${log.filter((l) => / tab #/.test(l) && l.includes(": tab ")).length} tab taps`);
  report(ctx.errors.length === 0, `walk ${seed}: no page errors`, ctx.errors.slice(0, 3).join(" | "));
  writeFileSync(`${OUT}/walk-${seed}.txt`, log.join("\n"));
  await ctx.context.close();
}
// ---------- the router's edges (6 Nov, from a code review) ----------
{
  // A malformed escape in the address ("#study/%", a link cut short) still opens the app (decodeURIComponent threw, and the app didn't start).
  const ctx = await phone();
  // Followed from inside the app (a link, a hashchange), then opened cold. Each: a page in place, its tab lit, nothing thrown (the frame and its
  // tabs come up before the router draws, so they alone prove nothing).
  ctx.errors.length = 0;
  await ctx.page.evaluate(() => (location.hash = "#study/%"));
  const inside = await rest(ctx.page);
  const insideErrors = ctx.errors.splice(0);
  const cold = await ctx.context.newPage();
  cold.on("pageerror", (e) => ctx.errors.push(String(e).split("\n")[0]));
  await cold.goto(`${BASE}/app/#study/%`);
  const started = await cold.waitForSelector("html[data-app-ready]", { timeout: 20_000 }).then(() => true, () => false);
  const s = await rest(cold);
  report(inside.shown && inside.lit === "#study" && !insideErrors.length && started && s.shown && s.lit === "#study" && !ctx.errors.length, "a malformed address (#study/%) opens the app", `followed: a page shown ${inside.shown}, tab lit ${inside.lit}, errors ${JSON.stringify(insideErrors.slice(0, 1))}; cold: ready ${started}, a page shown ${s.shown}, tab lit ${s.lit}, errors ${JSON.stringify(ctx.errors.slice(0, 1))}`);
  await ctx.context.close();
}
{
  // A swipe the system takes away (touchcancel) past half springs back: no back.
  const ctx = await phone();
  await tapBox(ctx, await ctx.page.locator('[data-part="tab-bar"] [data-part="tab"][href="#study"]').first().boundingBox());
  await rest(ctx.page);
  await tapLink(ctx, '[data-part="page"] a[href="#study/packs"]');
  const before = await rest(ctx.page);
  const touch = (type, x) => ctx.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchCancel" ? [] : [{ x, y: 430 }] });
  await touch("touchStart", 4);
  for (let k = 1; k <= 14; k++) {
    await touch("touchMove", 4 + (300 * k) / 14);
    await wait(16);
  }
  await touch("touchCancel", 304);
  const after = await rest(ctx.page);
  report(before.route === "#study/packs" && after.route === before.route && after.i === before.i && Math.abs(after.x ?? 0) < 1 && after.shown, "a swipe the system cancels (touchcancel) past half springs back and goes nowhere", `${before.route} (entry ${before.i}) → ${after.route} (entry ${after.i}), x ${after.x}`);
  await ctx.context.close();
}
{
  // With less motion, a swipe whose step the phone already took (its own back mid-drag) leaves the page in place, never off the screen.
  const ctx = await phone();
  await ctx.page.emulateMedia({ reducedMotion: "reduce" });
  await tapBox(ctx, await ctx.page.locator('[data-part="tab-bar"] [data-part="tab"][href="#study"]').first().boundingBox());
  await rest(ctx.page);
  await tapLink(ctx, '[data-part="page"] a[href="#study/packs"]');
  const before = await rest(ctx.page);
  const touch = (type, x) => ctx.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: 430 }] });
  await touch("touchStart", 4);
  for (let k = 1; k <= 14; k++) {
    await touch("touchMove", 4 + (300 * k) / 14);
    await wait(16);
    if (k === 10) await phoneBack(ctx);
  }
  await wait(300);
  await touch("touchEnd", 304);
  const after = await rest(ctx.page, 2500);
  report(before.route === "#study/packs" && Math.abs(after.x ?? 0) < 1 && after.shown && after.i === before.i - 1, "with less motion, a swipe the phone's own back already took leaves the page in place", `${before.route} (entry ${before.i}) → ${after.route} (entry ${after.i}), x ${after.x}, shown ${after.shown}`);
  await ctx.context.close();
}
{
  // A tab tapped while the app is still starting (the account slow to come): its entry has its place, the record is the browser's, and the
  // phone's back goes one step, to Home.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await context.addCookies(cookies);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
    } catch {}
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.route("**/api/me", async (route) => {
    await wait(5000);
    await route.continue().catch(() => {});
  });
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector('[data-part="tab-bar"] [data-part="tab"][href="#know"]', { timeout: 20_000 });
  const early = !(await page.evaluate(() => document.documentElement.hasAttribute("data-app-ready")));
  const box = await page.locator('[data-part="tab-bar"] [data-part="tab"][href="#know"]').boundingBox();
  await tapBox({ cdp }, box);
  await page.waitForSelector("html[data-app-ready]", { timeout: 30_000 });
  const started = await rest(page, 2500);
  await page.evaluate(() => history.back());
  const back = await rest(page, 2500);
  const inStep = (s) => s.i !== null && s.nav && s.nav.i === s.i && s.nav.routes[s.nav.i] === s.route;
  report(early && started.route === "#know" && inStep(started) && back.route === "#today" && inStep(back), "a tab tapped while the app is still starting keeps the record in step, and back goes one step", `tapped before ready ${early}; after the start ${started.route} (entry ${started.i}, record ${started.nav?.i} ${JSON.stringify(started.nav?.routes)}); back → ${back.route} (entry ${back.i}, record ${back.nav?.i})`);
  await context.close();
}
{
  // A tab's own page from another tab, when an entry it steps back over has lost its place: going to the address you're already on (a link to
  // the page you're on, the same address loaded again) replaces that entry with no state and no hashchange, so its place is gone. (6 Nov 2026:
  // Knowledge's tab from Read stepped back onto such an entry, took it for a new page and showed Study: a tab that opened another tab.)
  const ctx = await phone();
  const { page } = ctx;
  await page.evaluate(() => (location.hash = "#study"));
  await rest(page);
  await page.goto(`${BASE}/app/#study`);
  await rest(page);
  const lost = await page.evaluate(() => history.state?.lx?.i === undefined);
  for (const h of ["#study/more", "#settings/appearance", "#read"]) {
    await page.evaluate((x) => (location.hash = x), h);
    await rest(page);
  }
  const box = await page.locator('[data-part="tab-bar"] [data-part="tab"][href="#know"]').first().boundingBox();
  await tapBox(ctx, box);
  await page.waitForTimeout(2500);
  const after = await rest(page, 2500);
  const section = await page.evaluate(() => document.documentElement.getAttribute("data-section"));
  const bad = [...atRest(after, "after the tab")];
  if (after.route !== "#know") bad.push(`landed on ${after.route}, not #know`);
  if (section !== "know") bad.push(`the section is ${section}`);
  if (after.nav?.afresh) bad.push("still stepping (afresh)");
  report(lost && !bad.length, "Knowledge's tab from Read, over an entry that lost its place (the same address loaded again): Knowledge", `${lost ? "the entry's place was lost" : "SETUP: the entry kept its place"}; ${bad.join("; ") || `#know (entry ${after.i})`}`);
  await ctx.context.close();
}
{
  // On an iPhone, a back the phone makes itself (its own swipe from the edge) is already animated by the phone: the app plays no slide of its own
  // on top. (6 Nov 2026: Settings → Reminders, a swipe back: the screen jumped right, then left.) The phone's back here is history.back(); every
  // frame for 800 ms after it, no picture of a page and the page in its place.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1" });
  await context.addCookies(cookies);
  const page = await context.newPage();
  await page.goto(`${BASE}/app/#settings`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 30_000, state: "attached" });
  await rest(page, 2000);
  await page.evaluate(() => (location.hash = "#settings/reminders"));
  await rest(page, 2000);
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const p = document.querySelector('[data-part="app"] > [data-part="page"]');
        const out = [];
        const t0 = performance.now();
        const look = () => {
          out.push({ t: Math.round(performance.now() - t0), hash: location.hash, pictures: document.querySelectorAll("[data-page-picture]").length, x: Math.round(new DOMMatrixReadOnly(getComputedStyle(p).transform).m41) });
          if (performance.now() - t0 < 800) requestAnimationFrame(look);
          else resolve(out);
        };
        history.back();
        requestAnimationFrame(look);
      }),
  );
  const moved = frames.filter((f) => f.pictures || Math.abs(f.x) > 1);
  const s = await rest(page);
  report(s.route === "#settings" && !moved.length, "on an iPhone, the phone's own back (already animated by it) plays no slide of the app's", `${s.route}; ${moved.length ? `${moved.length} frames sliding (from ${moved[0].t} ms: ${moved[0].pictures} pictures, x ${moved[0].x})` : `${frames.length} frames, none sliding`}`);
  await context.close();
}
{
  // On an iPhone, the phone's own back out of a session (a game): the phone's swipe has already shown the page beneath, so the session is gone in
  // the first frame after it, never on the screen again and slid down over that page. Every frame for 800 ms after history.back() from the first
  // whose address has left the session (the back is applied a moment after the call; a frame before that still has the session, rightly): no
  // session cover (a leaving one included) inside the screen.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1" });
  await context.addCookies(cookies);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
    } catch {}
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/app/#study`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 30_000, state: "attached" });
  await rest(page, 2000);
  await page.evaluate(() => (location.hash = "#study/session/quick"));
  const up = await page
    .waitForFunction(() => {
      const s = document.querySelector('[data-part="session"]:not([data-ghost])');
      return Boolean(s) && s.getAnimations().length === 0 && Math.abs(s.getBoundingClientRect().top) < 1;
    }, null, { timeout: 8000 })
    .then(() => true, () => false);
  await wait(600);
  const frames = up
    ? await page.evaluate(
        () =>
          new Promise((resolve) => {
            const out = [];
            const t0 = performance.now();
            const look = () => {
              const shown = [...document.querySelectorAll('[data-part="session"]')].filter((s) => {
                const r = s.getBoundingClientRect();
                return r.top < innerHeight - 1 && r.bottom > 1 && r.width > 0;
              });
              out.push({ t: Math.round(performance.now() - t0), hash: location.hash, shown: shown.length, top: shown[0] ? Math.round(shown[0].getBoundingClientRect().top) : null });
              if (performance.now() - t0 < 800) requestAnimationFrame(look);
              else resolve(out);
            };
            history.back();
            requestAnimationFrame(look);
          }),
      )
    : [];
  const left = frames.findIndex((f) => !f.hash.startsWith("#study/session"));
  const shown = left < 0 ? frames.filter((f) => f.shown) : frames.slice(left).filter((f) => f.shown);
  const s = await rest(page);
  report(
    up && s.route === "#study" && !shown.length,
    "on an iPhone, the phone's own back out of a session closes it at once: the game never shown again sliding down",
    !up ? "SETUP: no session came up on #study/session/quick" : `${s.route}; ${shown.length ? `${shown.length} frames still showing the session (from ${shown[0].t} ms, its top at ${shown[0].top} px, then ${shown.at(-1).top} px at ${shown.at(-1).t} ms)` : `${frames.length} frames, none showing it`}`,
  );

  // And the phone's own forward back into it (its swipe from the right edge): the phone has already shown the session coming in, so it's there,
  // never rising from the bottom after the phone's move. Every frame for 1.2 s after history.forward(): no session cover part way up the screen
  // (one held below it while its first step is drawn is off the screen, not rising), and the session at rest at the top at the end.
  const forward = up
    ? await page.evaluate(
        () =>
          new Promise((resolve) => {
            const out = [];
            const t0 = performance.now();
            const look = () => {
              const covers = [...document.querySelectorAll('[data-part="session"]:not([data-ghost])')].map((s) => Math.round(s.getBoundingClientRect().top));
              out.push({ t: Math.round(performance.now() - t0), hash: location.hash, covers });
              if (performance.now() - t0 < 1200) requestAnimationFrame(look);
              else resolve(out);
            };
            history.forward();
            requestAnimationFrame(look);
          }),
      )
    : [];
  const rising = forward.filter((f) => f.covers.some((top) => top > 1 && top < 843));
  const last = forward.at(-1);
  const there = Boolean(last) && last.hash.startsWith("#study/session") && last.covers.some((top) => Math.abs(top) <= 1);
  report(
    up && there && !rising.length,
    "on an iPhone, the phone's own forward into a session shows it at once: never rising after the phone's move",
    !up ? "SETUP: no session came up on #study/session/quick" : `${last?.hash}; ${rising.length ? `${rising.length} frames with the session part way up (from ${rising[0].t} ms at ${rising[0].covers.join("/")} px, to ${rising.at(-1).covers.join("/")} px at ${rising.at(-1).t} ms)` : `${forward.length} frames, none rising`}${there ? "" : `; the session not at the top at the end (${JSON.stringify(last?.covers)})`}`,
  );
  await context.close();
}
{
  // On an iPhone, the phone's own back out of Translate (Home's box, typed into): the phone's swipe has already shown Home with its box in place,
  // so the box is there at once, never flying down from Translate's place after it (translate/page.js setOpen's ghost, .lx-tr-ghost). Every frame
  // for 800 ms after history.back(): no flying copy of the box on the page; Home at the end with Translate closed.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1" });
  await context.addCookies(cookies);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
    } catch {}
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]", { timeout: 30_000, state: "attached" });
  await rest(page, 2000);
  await page.locator('[data-part="translate-field"] :is(textarea, input)').first().tap({ position: { x: 24, y: 20 } });
  await page.keyboard.type("hoi");
  const open = await page
    .waitForFunction(() => location.hash === "#today/translate" && Boolean(document.querySelector(".lx-today-translate[data-open]")), null, { timeout: 8000 })
    .then(() => true, () => false);
  await wait(800);
  const frames = open
    ? await page.evaluate(
        () =>
          new Promise((resolve) => {
            const out = [];
            const t0 = performance.now();
            const look = () => {
              out.push({ t: Math.round(performance.now() - t0), hash: location.hash, ghosts: document.querySelectorAll(".lx-tr-ghost").length });
              if (performance.now() - t0 < 800) requestAnimationFrame(look);
              else resolve(out);
            };
            history.back();
            requestAnimationFrame(look);
          }),
      )
    : [];
  const flying = frames.filter((f) => f.ghosts);
  const closed = await page.evaluate(() => location.hash === "#today" && !document.querySelector(".lx-today-translate[data-open]"));
  report(
    open && closed && !flying.length,
    "on an iPhone, the phone's own back out of Translate puts Home's box in place at once: never flying down after the phone's move",
    !open ? "SETUP: typing into Home's box didn't open Translate" : `${closed ? "#today, Translate closed" : "Translate still open"}; ${flying.length ? `${flying.length} frames with the box flying (from ${flying[0].t} ms to ${flying.at(-1).t} ms)` : `${frames.length} frames, none flying`}`,
  );
  await context.close();
}

writeFileSync(`${OUT}/failures.json`, JSON.stringify(failures, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
