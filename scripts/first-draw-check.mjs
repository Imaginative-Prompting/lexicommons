// Each tab's first draw, as a phone sees it: a start shows the app's frame at once (its "Loading" line only after a
// second); each tab's first visit after a start, and a start straight into it, come in whole with nothing moving (every
// layout shift counted); when this device's storage is slow, Today and Read hold their places with skeletons and Today
// never shows a guess that changes; the AI tab after a restart says what it said last, at once (never "No AI connected
// yet" for an AI that is); Explore's first visit with nothing kept holds its places while the server is slow; Read's
// shelf comes in whole, with its open books or, on a server without the open library (a fresh state), its empty shelf; a new
// device with lessons done whose path comes after Home's first draw never shows "Your first lesson", and nothing under the card jumps.
// LOCAL only: it signs up a test account, writes an admin into the local D1 to share two check packs, and deletes both.
// With --lang <code>, the account learns that language (its starter from the open library), and one more stage starts
// straight into a session with nothing cached (the first screen a learner sees its script on), the script's font
// arriving after the first paint: nothing may move.
// Usage: node scripts/first-draw-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> [--lang hi]
//        (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const LANG = argv.includes("--lang") ? argv[argv.indexOf("--lang") + 1] : null;
// --only <regex>: the stages whose names match (and "no page errors"); the others are skipped and say so.
const ONLY = argv.includes("--only") ? new RegExp(argv[argv.indexOf("--only") + 1]) : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/first-draw-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

// Explore with something in it: two Dutch check packs, shared by a curator (an admin written into the local D1).
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sql = (command) => execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
const curator = { id: `fd${randomBytes(6).toString("hex")}`, cookie: randomBytes(24).toString("base64url") };
const now = Date.now();
sql(
  [
    `INSERT INTO users (id, name, created_at) VALUES (${q(curator.id)}, 'First Draw Curator', ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(createHash("sha256").update(curator.cookie).digest("hex"))}, ${q(curator.id)}, ${now}, ${now + 86400_000}, 'first-draw-check')`,
    `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(curator.id)}, 'admin', ${now}, 'd1', 'first-draw-check')`,
  ].join("; "),
);
const asCurator = async (method, path, body) => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${curator.cookie}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
};
await asCurator("POST", "/api/community/terms", { version: 1 });
const NL = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
const second = { ...structuredClone(NL), id: "check-nl-first-draw", name: "Dutch, drawn first", about: "A second Dutch check pack, for a shelf." };
second.items = second.items.map((item) => ({ ...item, means: `${item.means} (drawn first)` }));
const shared = [await asCurator("POST", "/api/community/share", { pack: NL, level: "A1", topics: ["food"] }), await asCurator("POST", "/api/community/share", { pack: second, level: "A2", topics: ["travel"] })];
if (!shared.every((r) => r.status === 200 || /already in Explore/.test(JSON.stringify(r.body)))) {
  console.error(`first-draw-check couldn't share its check packs: ${JSON.stringify(shared.map((r) => r.body)).slice(0, 400)}`);
  process.exit(2);
}

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// What a start and a page did, recorded inside the page from its very first moment: every layout shift, when the app's
// frame (its tab bar) first drew, whether the "Loading" line was ever seen, and (when asked) the texts Today's next step
// and the AI tab's status went through. A device with slow storage: every IndexedDB answer 700 ms late, while
// "check.slow-storage" is set. Late as a slow phone's is: given inside a later success event of the same transaction, so
// the transaction is still active and a request made in the answer (the next record of a read one at a time, a read's
// write) goes on. A timer around the answer gave it after the transaction had finished, and the app's own requests made
// in an answer threw TransactionInactiveError, as they never do on a phone.
await context.addInitScript(() => {
  window.lxSeen = { shifts: [], frameAt: null, loadingAt: null, next: [], status: [], firstPaint: null };
  // The installed app, while "check.standalone" is set for this tab (the splash's stage).
  if (sessionStorage.getItem("check.standalone")) Object.defineProperty(navigator, "standalone", { get: () => true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      window.lxSeen.shifts.push({ at: Math.round(e.startTime), value: e.value, sources: (e.sources ?? []).map((s) => { const n = s.node; return n ? `${n.getAttribute?.("data-part") || n.className || n.nodeName} ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)}` : "?"; }) });
  }).observe({ type: "layout-shift", buffered: true });
  const look = (painting) => {
    const seen = window.lxSeen;
    // The first painted frame: is it the splash's first frame (theme-boot.js decided before it)?
    if (painting && seen.firstPaint == null) {
      const first = document.querySelector(".lx-splash-first");
      seen.firstPaint = { at: performance.now(), splash: document.documentElement.getAttribute("data-splash"), firstFrame: Boolean(first && getComputedStyle(first).visibility === "visible" && getComputedStyle(first.parentElement).display === "block") };
    }
    if (seen.frameAt == null && document.querySelector('[data-part="tab-bar"] [data-part="tab"]')) seen.frameAt = performance.now();
    // What's painted: only in a frame (a mutation while the page is still parsing comes before its stylesheets).
    const loading = painting && document.querySelector(".lx-loading");
    if (seen.loadingAt == null && loading && getComputedStyle(loading).visibility === "visible") seen.loadingAt = performance.now();
    const next = document.querySelector(".lx-today-next");
    const nextText = next && !next.closest("[data-waiting]") && !next.querySelector('[data-part="skeleton"]') ? next.textContent.trim() : "";
    if (nextText && seen.next[seen.next.length - 1] !== nextText) seen.next.push(nextText);
    // The AI page's first card: Practice with me's line (with your AI by name), or with none connected the card to connect one.
    const status = document.querySelector('[data-part="page"]:not([data-ghost]) .lx-ai-body > [data-part="ai-practice"]');
    const statusText = status && !status.closest("[data-waiting]") && !status.querySelector('[data-part="skeleton"]') ? (status.matches("[data-variant]") ? status.textContent.trim() : status.querySelector(".lx-ap-sub")?.textContent.trim() ?? "") : "";
    if (statusText && seen.status[seen.status.length - 1] !== statusText) seen.status.push(statusText);
  };
  const frame = () => {
    look(true);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  new MutationObserver(() => look(false)).observe(document, { childList: true, subtree: true, characterData: true, attributes: true });
  if (localStorage.getItem("check.slow-storage")) {
    const real = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "onsuccess");
    Object.defineProperty(IDBRequest.prototype, "onsuccess", {
      configurable: true,
      get() {
        return real.get.call(this);
      },
      set(fn) {
        if (typeof fn !== "function") return real.set.call(this, fn);
        const request = this;
        real.set.call(this, (event) => {
          const due = performance.now() + 700;
          let store = null;
          try {
            store = request.source instanceof IDBIndex ? request.source.objectStore : request.source instanceof IDBObjectStore ? request.source : null;
          } catch {}
          // Opening a database has no transaction to keep: its answer late by a timer.
          if (!request.transaction || !store) return void setTimeout(() => fn.call(request, event), 700);
          // A small request after another on the same store keeps the transaction going until the answer is due.
          const wait = () => store.count("\uffff slow storage").addEventListener("success", () => (performance.now() >= due ? fn.call(request, event) : wait()));
          wait();
        });
      },
    });
  }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const results = {};
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
async function stage(name, fn) {
  if (ONLY && !ONLY.test(name) && name !== "no page errors") return void console.log(`skip ${name}`);
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
const seen = () => page.evaluate(() => window.lxSeen);
const shiftOf = (shifts, since = 0) => shifts.filter((s) => s.at >= since).reduce((sum, s) => sum + s.value, 0);
const sourcesOf = (shifts, since = 0) => [...new Set(shifts.filter((s) => s.at >= since).flatMap((s) => s.sources))].join("; ");
const tab = (name) => page.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: name }).first();
// The tabs (Home, Study, Knowledge, Explore) and Read, which is Home's book card; each one's own address.
const TABS = ["Home", "Study", "Knowledge", "Read", "Explore"];
const ROUTE = { Home: "#today", Study: "#study", Knowledge: "#know", Read: "#read", Explore: "#explore" };
/** A fresh start at `hash` (a reload), waited out until the app is ready. */
async function start(hash) {
  await page.goto(`${BASE}/app/${hash}`);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
}
/** Taps a tab and waits 3 s; returns what moved after the tap. */
async function firstVisit(name) {
  // Read has no tab for now: it's Home's book card (or its Reading heading's All books), the visit counted from that press.
  if (name === "Read") {
    await tab("Home").click();
    await page.locator('[data-part="page"]:not([data-ghost]) .lx-home-cards a[href="#read"]').first().waitFor();
  }
  const t0 = await page.evaluate(() => performance.now());
  if (name === "Read") await page.locator('[data-part="page"]:not([data-ghost]) .lx-home-cards a[href="#read"]').first().click();
  else await tab(name).click();
  // A tab's own page names itself in the header; a page you went into (Read, from Home) has its title on the page (the bible's one title form).
  await page.waitForFunction((n) => [document.querySelector('[data-part="app-title"]'), document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="page-title"]')].some((title) => title?.textContent.includes(n)), name);
  await wait(3000);
  const s = await seen();
  return { shift: shiftOf(s.shifts, t0), sources: sourcesOf(s.shifts, t0), seen: s };
}

// ---------- setting up: an account with something to read, an AI, and every tab visited once ----------

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "First Draw");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
await page.waitForSelector("html[data-app-ready]");
// The AI tab is there only with an AI connected (a token will do): this check is of every tab.
await page.evaluate(() => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "an AI, for this check" }) }));
await page.reload();
await page.waitForSelector("html[data-app-ready]");
// Learning another language: its starter (one of the library's default packs) is what Today and Study draw on.
if (LANG) {
  await page.evaluate((lang) => localStorage.setItem("lx.learning.v1", JSON.stringify({ lang, from: "en" })), LANG);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
}
// Something being read: the first open book, a page turned. A server without the open library (a fresh state) has
// none, and Read's empty shelf is what its first draws show.
await page.goto(`${BASE}/app/#read`);
const hasBooks = await page.evaluate(async () => Boolean((await (await fetch("/library/catalogue.json")).json()).books?.length));
if (hasBooks) {
  const book = page.locator('.lx-read-shelf [data-part="book-tile"]').first();
  await book.waitFor();
  await book.click();
  await page.waitForSelector('[data-part="reader"][data-ready]');
  await page.keyboard.press("ArrowRight");
  await wait(1500);
}
// An AI that has checked in: a personal token, and the AI's list_requests over MCP.
const token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "First draw check" }) })).json()).token);
const mcp = async (method, params) => {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const line = (await response.text()).split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status}`);
  return JSON.parse(line.slice(6)).result;
};
await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "First draw AI", version: "1" } });
await mcp("tools/call", { name: "list_requests", arguments: {} });
for (const t of ["today", "study", "read", "ai", "explore", "settings"]) {
  await page.goto(`${BASE}/app/#${t}`);
  await wait(2500);
}

// ---------- the stages ----------

await stage("a start draws the app's frame at once, and says \"Loading\" only after a second", async () => {
  await start("#today");
  const quick = await seen();
  const ready = await page.evaluate(() => performance.now());
  // Said only once a start has taken a second (a busy machine's can); never at the first paint.
  assert(quick.loadingAt == null || quick.loadingAt >= 950, `the Loading line showed ${Math.round(quick.loadingAt)} ms into the start`);
  // A slow start (storage 700 ms per answer): the frame comes long before the page.
  await page.evaluate(() => localStorage.setItem("check.slow-storage", "1"));
  await start("#today");
  const readyAt = await page.evaluate(() => performance.now());
  const slow = await seen();
  await page.evaluate(() => localStorage.removeItem("check.slow-storage"));
  assert(slow.frameAt != null && slow.frameAt < readyAt - 300, `the frame (tab bar) at ${Math.round(slow.frameAt)} ms, the app ready at ${Math.round(readyAt)} ms`);
  return `start: frame at ${Math.round(quick.frameAt)} ms, ${quick.loadingAt == null ? "no Loading line" : `Loading line at ${Math.round(quick.loadingAt)} ms`}, ready by ${Math.round(ready)} ms; slow storage: frame at ${Math.round(slow.frameAt)} ms, ready at ${Math.round(readyAt)} ms`;
});

await stage("the splash (the installed app's first open of the day): its first frame is the first paint, over the app's frame drawn under it; nothing moves", async () => {
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(() => {
    sessionStorage.setItem("check.standalone", "1");
    localStorage.removeItem("lx.splash.day");
  });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const during = await seen();
  await page.waitForFunction(() => !document.querySelector(".lx-splash"), null, { timeout: 10_000 });
  const after = await seen();
  await page.evaluate(() => sessionStorage.removeItem("check.standalone"));
  assert(during.firstPaint?.splash === "play" && during.firstPaint.firstFrame, `the first paint should be the splash's first frame: ${JSON.stringify(during.firstPaint)}`);
  assert(after.frameAt != null, "the app's frame should draw under the splash");
  assert(shiftOf(after.shifts) === 0, `moved: ${sourcesOf(after.shifts)}`);
  return `first paint at ${Math.round(during.firstPaint.at)} ms: the splash's first frame; the app's frame under it at ${Math.round(after.frameAt)} ms; nothing moved; the splash gone`;
});

await stage("each tab's first visit after a start comes in whole: nothing moves", async () => {
  const moved = {};
  for (const name of TABS) {
    await start("#settings");
    await wait(1000);
    const v = await firstVisit(name);
    moved[name] = v;
  }
  const bad = TABS.filter((n) => moved[n].shift > 0.001);
  assert(!bad.length, `shifted: ${bad.map((n) => `${n} ${moved[n].shift.toFixed(4)} (${moved[n].sources})`).join(" | ")}`);
  return TABS.map((n) => `${n} ${moved[n].shift.toFixed(4)}`).join(", ");
});

await stage("a start straight into each tab: nothing moves, from the first frame on", async () => {
  const moved = {};
  for (const name of TABS) {
    await start(ROUTE[name]);
    await wait(3000);
    const s = await seen();
    moved[name] = { shift: shiftOf(s.shifts), sources: sourcesOf(s.shifts) };
  }
  const bad = TABS.filter((n) => moved[n].shift > 0.001);
  assert(!bad.length, `shifted: ${bad.map((n) => `${n} ${moved[n].shift.toFixed(4)} (${moved[n].sources})`).join(" | ")}`);
  return TABS.map((n) => `${n} ${moved[n].shift.toFixed(4)}`).join(", ");
});

await stage("slow device storage: Home and Read hold their places, nothing moves, and Home never shows a guess", async () => {
  await page.evaluate(() => localStorage.setItem("check.slow-storage", "1"));
  try {
    await start("#settings");
    await wait(500);
    const today = await firstVisit("Home");
    await start("#settings");
    await wait(500);
    const read = await firstVisit("Read");
    assert(today.seen.next.length === 1, `Today's next step changed under you: ${JSON.stringify(today.seen.next.map((t) => t.slice(0, 60)))}`);
    assert(today.shift <= 0.001 && read.shift <= 0.001, `shifted: Today ${today.shift.toFixed(4)} (${today.sources}), Read ${read.shift.toFixed(4)} (${read.sources})`);
    return `Today: one next step (“${today.seen.next[0].slice(0, 40)}…”), shift ${today.shift.toFixed(4)}; Read: shift ${read.shift.toFixed(4)}`;
  } finally {
    await page.evaluate(() => localStorage.removeItem("check.slow-storage"));
  }
});

await stage("Read's shelf comes in whole after a start: its open books, or on a server without them, its empty shelf; nothing moves", async () => {
  await start("#settings");
  await wait(500);
  const v = await firstVisit("Read");
  const shelf = await page.evaluate(() => {
    const node = document.querySelector(".lx-read-shelf");
    const visible = (n) => getComputedStyle(n).visibility === "visible" && n.getClientRects().length > 0;
    return {
      shown: Boolean(node && visible(node)),
      tiles: node ? [...node.querySelectorAll('[data-part="book-tile"]')].filter(visible).length : 0,
      said: node ? [...node.querySelectorAll('[data-part="empty-state"]')].filter(visible).map((n) => n.textContent.trim()) : [],
    };
  });
  if (hasBooks) assert(shelf.shown && shelf.tiles > 0 && !shelf.said.length, `the shelf: ${JSON.stringify(shelf)}`);
  else assert(shelf.shown && !shelf.tiles && shelf.said.length === 1 && /^No open books yet/.test(shelf.said[0]), `the empty shelf: ${JSON.stringify(shelf)}`);
  assert(v.shift <= 0.001, `shifted ${v.shift.toFixed(4)} (${v.sources})`);
  return `${hasBooks ? `${shelf.tiles} books on the shelf` : `no open books on this server: “${shelf.said[0]}”`}; shift ${v.shift.toFixed(4)}`;
});

await stage("the AI tab after a restart says what it said last, at once: never \"No AI connected yet\" for an AI that is", async () => {
  // The server held back 1.5 s: what shows first is this device's.
  await page.route("**/api/ai/requests**", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue().catch(() => {});
  });
  try {
    // Read has the third tab until the setting gives it to AI.
    await page.evaluate(() => localStorage.setItem("lx.shell.v1", JSON.stringify({ third: "ai" })));
    await start("#settings");
    await wait(500);
    const v = await firstVisit("AI");
    assert(v.seen.status.length > 0 && !v.seen.status.some((t) => /No AI connected|Connect your AI/i.test(t)), `the status went through: ${JSON.stringify(v.seen.status.map((t) => t.slice(0, 60)))}`);
    assert(/First draw/i.test(v.seen.status[0]), `first shown: ${v.seen.status[0]?.slice(0, 80)}`);
    assert(v.shift <= 0.001, `shifted ${v.shift.toFixed(4)} (${v.sources})`);
    // The study material changing while it's on the screen (a sync's packs: one turned off and on): Practice with me keeps its pair, the same
    // bubbles, never picked again under the eye (a new pair can turn the card across and move all below it: 0.0268 on lex-design-2's state).
    const marks = () => page.evaluate(() => [...document.querySelectorAll('[data-part="ai-practice"] .lx-hc-bubble')].map((n) => (n.dataset.check ??= String(Math.random()))));
    const before = await marks();
    const toggled = await page.evaluate(async () => {
      const packs = await import("/js/study/packs.js");
      const { onContentChange } = await import("/js/study/content.js");
      const id = packs.allPacks().find((one) => one.language === "nl" && one.id !== "path-nl" && packs.isPackOn(one.id))?.id;
      if (!id) return null;
      let changes = 0;
      const stop = onContentChange(() => changes++);
      packs.setPackOn(id, false);
      for (let t = 0; t < 50 && !changes; t++) await new Promise((r) => setTimeout(r, 100));
      packs.setPackOn(id, true);
      for (let t = 0; t < 50 && changes < 2; t++) await new Promise((r) => setTimeout(r, 100));
      stop();
      return { id, changes };
    });
    await wait(300);
    const after = await marks();
    assert(toggled && toggled.changes >= 1, `SETUP: no change to the study material (${JSON.stringify(toggled)})`);
    assert(before.length && before.join() === after.join(), `Practice with me picked its pair again while on the screen (${toggled.changes} changes from ${toggled.id})`);
    return `status: ${JSON.stringify(v.seen.status.map((t) => t.slice(0, 50)))}; shift ${v.shift.toFixed(4)}; its pair kept through ${toggled.changes} changes to the study material`;
  } finally {
    await page.evaluate(() => localStorage.removeItem("lx.shell.v1"));
    await page.unroute("**/api/ai/requests**");
  }
});

await stage("Explore's first visit with nothing kept, the server slow: its places held, then the home, nothing moving", async () => {
  await page.evaluate(() => localStorage.removeItem("lx.explore-home.v1"));
  // Explore's home is in the language you're learning, and the check's packs are Dutch: with --lang, Explore is visited
  // as a Dutch learner, then the language goes back (a language with no packs on this server would feature none).
  if (LANG) await page.evaluate(() => localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" })));
  await page.route("**/api/community/explore**", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue().catch(() => {});
  });
  try {
    await start("#settings");
    await wait(500);
    const t0 = await page.evaluate(() => performance.now());
    await tab("Explore").click();
    await page.waitForFunction(() => document.querySelector('[data-part="app-title"]')?.textContent.includes("Explore"));
    await wait(700);
    const held = await page.evaluate(() => {
      const body = document.querySelector(".lx-explore-body");
      const visible = (n) => n && getComputedStyle(n).visibility === "visible" && n.getClientRects().length > 0;
      return { skeletons: body ? body.querySelectorAll('[data-part="skeleton"]').length : 0, shown: visible(body), loadingText: [...document.querySelectorAll('[data-part="empty-state"]')].filter(visible).map((n) => n.textContent.trim()) };
    });
    await page.locator(".lx-face").waitFor({ timeout: 15_000 });
    await wait(800);
    const s = await seen();
    const shift = shiftOf(s.shifts, t0);
    assert(held.shown && held.skeletons >= 2 && !held.loadingText.length, `while the server was slow: ${JSON.stringify(held)}`);
    assert(shift <= 0.001, `shifted ${shift.toFixed(4)} (${sourcesOf(s.shifts, t0)})`);
    return `${held.skeletons} places held, then the home; shift ${shift.toFixed(4)}`;
  } finally {
    await page.unroute("**/api/community/explore**");
    if (LANG) await page.evaluate((lang) => localStorage.setItem("lx.learning.v1", JSON.stringify({ lang, from: "en" })), LANG);
  }
});

if (LANG)
  await stage(`a session started with nothing cached, learning ${LANG}: its script's font arrives after the first paint, and nothing moves`, async () => {
    const moved = {};
    const fonts = new Set();
    const watch = (request) => /\/fonts\/noto-/.test(request.url()) && fonts.add(request.url().replace(/.*\/fonts\//, ""));
    page.on("request", watch);
    try {
      for (const name of ["study/session/quick", "study/session/game/match"]) {
        // Nothing kept: the HTTP cache and the service worker's font cache both emptied.
        await cdp.send("Network.clearBrowserCache");
        await page.evaluate(async () => { for (const key of await caches.keys()) if (key.startsWith("lx-fonts")) await caches.delete(key); });
        await start(`#${name}`);
        await page.waitForSelector('[data-part="session"]').catch(() => {});
        await wait(3000);
        const s = await seen();
        const script = await page.evaluate(() => [...document.querySelectorAll("[lang]")].filter((n) => n.lang && n.lang !== "en" && n.textContent.trim()).map((n) => n.lang)[0] ?? null);
        moved[name] = { shift: shiftOf(s.shifts), sources: sourcesOf(s.shifts), script };
      }
    } finally {
      page.off("request", watch);
    }
    // The check can fail: the language's words were on the page and its font was fetched each time.
    assert(Object.values(moved).every((m) => m.script === LANG), `the language's text on each session's first screen: ${JSON.stringify(moved)}`);
    assert(fonts.size > 0, "no script font was fetched: nothing was tested");
    const bad = Object.entries(moved).filter(([, m]) => m.shift > 0.001);
    assert(!bad.length, `shifted: ${bad.map(([n, m]) => `${n} ${m.shift.toFixed(4)} (${m.sources})`).join(" | ")}`);
    return `${Object.entries(moved).map(([n, m]) => `${n} ${m.shift.toFixed(4)}`).join(", ")}; fonts fetched: ${[...fonts].join(", ")}`;
  });

await stage("a new device with lessons done, its path still coming: Home never shows \"Your first lesson\", and nothing under its card jumps", async () => {
  // A new device: its own sign-up, three lessons finished at once (as a learner's history arriving), then a start with the library's answers held
  // back 600 ms, so Home's first draw comes before the path. The next card must never say "Your first lesson" (it isn't, for this learner), and
  // when the real card comes its place may grow, but on a curve: Your progress moves at most 4 px in any frame. (7 Nov 2026: "Your first
  // lesson" for 3 s, then Practice, and Your progress jumped 9 px.)
  const device = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await device.newPage();
  try {
    const c = await device.newCDPSession(p);
    await c.send("WebAuthn.enable");
    await c.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await p.goto(`${BASE}/app/`);
    await p.waitForURL(/\/login\?next=/);
    await p.click("summary");
    await p.fill('input[name="name"]', "New Device");
    await p.click('#register button[type="submit"]');
    await p.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
    await p.waitForSelector("html[data-app-ready]");
    const finished = await p.evaluate(async () => {
      const DAY = 86_400_000;
      const { record } = await import("/js/study/progress.js");
      const { finishedLesson, finishedSession } = await import("/js/study/done.js");
      const { pathLessons } = await import("/js/study/path.js");
      // (Its first sync brings the path a moment after the start.)
      for (let t = 0; t < 150 && !pathLessons().length; t++) await new Promise((r) => setTimeout(r, 100));
      for (let d = 6; d >= 1; d--) {
        record([{ concept: "w:huis", outcome: "right", test: "recall", skill: "read", activity: "type", item: "tile", at: Date.now() - d * DAY }]);
        finishedSession(Date.now() - d * DAY);
      }
      for (const lesson of pathLessons().slice(0, 3)) finishedLesson(lesson.id, Date.now() - 3 * DAY);
      // A device that has drawn Home before: its card drawn (not held while the lessons came) and its height kept (lx/shapes.js), as the next
      // start's held place. (A brand-new learner's card is held while the lessons come, and a held card isn't kept: without this wait the
      // reload could come first, and the start below had nothing kept.)
      const kept = () => {
        try {
          return JSON.parse(localStorage.getItem("lx.shapes.v1") ?? "{}")["today.next"] > 0;
        } catch {
          return false;
        }
      };
      for (let t = 0; t < 150 && !(kept() && document.querySelector('.lx-today-next [data-part="next-step"]:not(:has([data-part="skeleton"]))')); t++) await new Promise((r) => setTimeout(r, 100));
      if (!kept()) return -1;
      return (await import("/js/study/done.js")).lessonsFinished().size;
    });
    // The path still coming: every answer from the library held back.
    await device.route(/\/library\//, async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.continue().catch(() => {});
    });
    await p.addInitScript(() => {
      const t0 = performance.now();
      const frames = (globalThis.__nextFrames = []);
      const look = () => {
        const slot = document.querySelector(".lx-today-progress-slot");
        const next = document.querySelector(".lx-today-next");
        // What the slot holds: nothing, a held place (a skeleton), a held card, or a card.
        const kind = !next?.firstElementChild ? "empty" : next.firstElementChild.matches('[data-part="skeleton"]') ? "place" : next.querySelector('[data-part="skeleton"]') ? "held card" : "card";
        if (slot) frames.push({ t: Math.round(performance.now() - t0), top: slot.getBoundingClientRect().top, h: next ? Math.round(next.getBoundingClientRect().height * 10) / 10 : null, kind, kept: (() => { try { return JSON.parse(localStorage.getItem("lx.shapes.v1") ?? "{}")["today.next"] ?? null; } catch { return "?"; } })(), next: (next?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40) });
        if (performance.now() - t0 < 15000) requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    await p.goto(`${BASE}/app/#today`);
    await p.reload();
    await p.waitForSelector("html[data-app-ready]");
    await p.waitForTimeout(15500);
    const frames = await p.evaluate(() => globalThis.__nextFrames ?? []);
    const wrong = frames.find((f) => /^Your first lesson/.test(f.next));
    let jump = { by: 0 };
    for (let i = 1; i < frames.length; i++) {
      const by = Math.abs(frames[i].top - frames[i - 1].top);
      if (by > jump.by) jump = { by: Math.round(by * 10) / 10, at: frames[i].t, card: frames[i].next };
    }
    const cards = [...new Set(frames.map((f) => f.next))].filter(Boolean);
    // Each card as it came: when, and its slot's height then.
    const came = frames.filter((f, i) => !i || frames[i - 1].next !== f.next || frames[i - 1].kind !== f.kind).map((f) => `${f.t} ms ${f.kind}${f.next ? ` "${f.next}"` : ""} ${f.h} px (kept ${f.kept})`);
    assert(finished !== -1, "SETUP: Home's card never drawn and kept before the reload");
    assert(finished >= 1, `SETUP: no lesson finished (${finished})`);
    assert(cards.length, "the next card never came");
    assert(!wrong, `"Your first lesson" shown at ${wrong?.t} ms to a learner who has finished ${finished} lessons`);
    assert(jump.by <= 4, `Your progress jumped ${jump.by} px in one frame at ${jump.at} ms (as "${jump.card}" came); cards: ${came.join(" → ")}`);
    return `${finished} lessons done; cards seen: ${cards.join(" → ")}; the most Your progress moved in a frame: ${jump.by} px; the slot: ${came.join(" → ")}`;
  } finally {
    await device.close();
  }
});

// A brand-new learner whose language's lessons (path-nl) are still coming: Home's card and Study's first-lesson door held in the shape they come
// in, never offering the app's own starter meanwhile, then lesson 1 in place; when the lessons can't come (a failed download) or take past the
// wait (study/packs.js lessonsComing: 15 s), what the device has (the app's starter, or a lesson worked out from the word packs), said
// plainly (lessonsMissing), and lesson 1 once it does come. (7 Nov 2026, the launch rehearsal: Home's
// Start a second after picking Dutch opened the starter's lesson, and the whole first lesson was the starter's.)
const newLearner = async ({ hold, abort = false, hash = "#today", ms }) => {
  const device = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await device.newPage();
  p.on("pageerror", (e) => errors.push(`new learner: ${e.message}`));
  const c = await device.newCDPSession(p);
  await c.send("WebAuthn.enable");
  await c.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  // The lessons pack alone held back (or failed): everything else as it comes.
  await device.route(/\/library\/packs\/path-nl\//, async (route) => {
    if (abort) return route.abort();
    await new Promise((r) => setTimeout(r, hold));
    await route.continue().catch(() => {});
  });
  // Every frame from the app's start: Home's card and Study's lesson door (their words, whether held, their height) and what's under the card.
  await device.addInitScript(() => {
    if (location.pathname !== "/app/") return;
    const t0 = performance.now();
    const frames = (globalThis.__learnerFrames = []);
    const text = (n) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
    // The signal the cards follow (study/packs.js), from the app's own module once the app has loaded it (importing it sooner would change its order).
    let packs = null;
    let asked = false;
    const look = () => {
      if (!asked && document.documentElement.hasAttribute("data-app-ready")) {
        asked = true;
        import("/js/study/packs.js").then((m) => (packs = m), () => {});
      }
      const card = document.querySelector('.lx-today-next [data-part="next-step"]');
      const door = document.querySelector('[data-part="study-door"][data-door="lesson"]');
      const under = document.querySelector(".lx-today-progress-slot");
      // How much of the card's content is seen: a held card's (its held lines) or the words' of a card that came, whichever shows more; a held
      // card can lie over the one that came while it hands over.
      const slot = card?.parentElement;
      const seenOf = (node) => {
        let o = 1;
        for (let n = node; n && n !== slot?.parentElement; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        return o;
      };
      const shown = slot ? Math.max(0, ...[...slot.querySelectorAll(':scope > [data-part="next-step"]')].map((c) => (c.querySelector('[data-part="skeleton"]') ? seenOf(c) : seenOf(c.querySelector("h2") ?? c)))) : null;
      frames.push({
        shown: shown === null ? null : Math.round(shown * 100) / 100,
        t: Math.round(performance.now() - t0),
        hash: location.hash,
        coming: typeof packs?.lessonsComing === "function" ? packs.lessonsComing() : null,
        missing: typeof packs?.lessonsMissing === "function" ? packs.lessonsMissing() : null,
        card: card && { title: text(card.querySelector("h2")), kicker: text(card.querySelector(".lx-next-kicker")), meta: text(card.querySelector(".lx-next-meta")), held: Boolean(card.querySelector('[data-part="skeleton"]')), h: Math.round(card.getBoundingClientRect().height * 10) / 10, start: Boolean(card.querySelector(':scope > [data-part="button"]')) },
        under: under ? Math.round(under.getBoundingClientRect().top * 10) / 10 : null,
        door: door && { title: text(door.querySelector(".lx-door-title")), sub: text(door.querySelector(".lx-door-sub")), held: door.hasAttribute("data-held"), h: Math.round(door.getBoundingClientRect().height * 10) / 10, href: door.getAttribute("href") },
      });
      if (performance.now() - t0 < 40000) requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await p.goto(`${BASE}/app/`);
  await p.waitForURL(/\/login\?next=/);
  await p.evaluate(() => localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" })));
  await p.click("summary");
  await p.fill('input[name="name"]', "New Learner");
  await p.click('#register button[type="submit"]');
  await p.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
  if (hash !== "#today") await p.evaluate((h) => (location.hash = h), hash);
  await p.waitForTimeout(ms);
  const frames = await p.evaluate(() => globalThis.__learnerFrames ?? []);
  // What lesson 1 is, and the app's own starter's first lesson, once both are here.
  const lessons = await p.evaluate(async () => {
    const { LESSONS, PACK } = await import("/js/study/content.js");
    return { first: LESSONS.find((one) => one.pack === "path-nl")?.title ?? null, starter: LESSONS.find((one) => one.pack === PACK.id)?.title ?? null };
  });
  await p.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
  await device.close();
  return { frames, lessons };
};
// Frames where a part (card or door) is held while the signal says the lessons aren't coming, or shown while it says they are, for more than the
// frame the change lands in (frames before the signal can be read are left out). Returns the first such frame, or null.
const offSignal = (frames, part) => {
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i], before = frames[i - 1];
    if (!f[part] || f.coming === null || before.coming === null) continue;
    if (f[part].held !== f.coming && f.coming === before.coming) return f;
  }
  return null;
};
// How long the signal said the lessons were coming: from its first frame of true to its first of false after.
const comingSpan = (frames) => {
  const from = frames.find((f) => f.coming === true);
  const to = from && frames.find((f) => f.t > from.t && f.coming === false);
  return from ? { from: from.t, to: to?.t ?? null } : null;
};

// The most a frame's value moved from the frame before, and when.
const biggestStep = (frames, value) => {
  let worst = { by: 0 };
  for (let i = 1; i < frames.length; i++) {
    const a = value(frames[i - 1]), b = value(frames[i]);
    if (a == null || b == null) continue;
    if (Math.abs(b - a) > worst.by) worst = { by: Math.round(Math.abs(b - a) * 10) / 10, t: frames[i].t };
  }
  return worst;
};

await stage("a brand-new learner while Dutch's lessons come (held 5 s): Home's card held in its shape while lessonsComing() says so, no other lesson, then lesson 1 in place", async () => {
  const { frames, lessons } = await newLearner({ hold: 5000, ms: 9000 });
  const seen = frames.filter((f) => f.card);
  assert(lessons.first, `SETUP: path-nl never arrived (${JSON.stringify(lessons)})`);
  const held = seen.filter((f) => f.card.held);
  const shown = seen.filter((f) => !f.card.held);
  assert(held.length, `the card was never held (first card: ${JSON.stringify(seen[0]?.card)})`);
  assert(seen[0].card.held, `the first card drawn wasn't held: ${JSON.stringify(seen[0].card)}`);
  const off = offSignal(seen, "card");
  assert(!off, `the card ${off?.card.held ? "held" : "shown"} at ${off?.t} ms while lessonsComing() said ${off?.coming}`);
  const other = shown.find((f) => f.card.title !== lessons.first);
  assert(!other, `a card other than lesson 1 ("${lessons.first}") at ${other?.t} ms: ${JSON.stringify(other?.card)}`);
  assert(held.every((f) => f.card.kicker === "Your first lesson"), `the held card's kicker: ${[...new Set(held.map((f) => f.card.kicker))].join(" | ")}`);
  // Saying what's happening from its first frame, in the title's place (never only grey bars).
  assert(held.every((f) => f.card.title === "Getting Dutch ready"), `the held card's title: ${[...new Set(held.map((f) => f.card.title))].join(" | ")}`);
  const last = seen.at(-1).card;
  assert(last.title === lessons.first && last.kicker === "Your first lesson" && last.start, `the card at the end: ${JSON.stringify(last)}`);
  // The same box: the held card as tall as the card that came, and nothing under it moved.
  const heldH = held.at(-1).card.h;
  assert(Math.abs(heldH - last.h) <= 1, `the held card ${heldH} px, the card that came ${last.h} px`);
  const under = biggestStep(seen, (f) => f.under);
  assert(under.by <= 1, `Your progress moved ${under.by} px in one frame at ${under.t} ms`);
  // Never a frame of neither: from the first held frame on, the held lines or the words are at least half seen.
  const empty = seen.find((f) => f.t >= held[0].t && f.shown !== null && f.shown < 0.5);
  assert(!empty, `the card showed neither its held lines nor its words at ${empty?.t} ms (seen ${empty?.shown}): ${JSON.stringify(empty?.card)}`);
  return `held ${held[0].t}–${held.at(-1).t} ms at ${heldH} px, then "${last.title}" at ${shown[0].t} ms at ${last.h} px (${last.meta}); no other lesson shown; Your progress's biggest step ${under.by} px`;
});

await stage("a brand-new learner on Study while Dutch's lessons come (held 5 s): the first-lesson door held in its shape, no link, then lesson 1", async () => {
  const { frames, lessons } = await newLearner({ hold: 5000, hash: "#study", ms: 9000 });
  const seen = frames.filter((f) => f.door && f.hash === "#study");
  assert(lessons.first, `SETUP: path-nl never arrived (${JSON.stringify(lessons)})`);
  const held = seen.filter((f) => f.door.held);
  const shown = seen.filter((f) => !f.door.held);
  assert(held.length, `the door was never held (first door: ${JSON.stringify(seen[0]?.door)})`);
  const off = offSignal(seen, "door");
  assert(!off, `the door ${off?.door.held ? "held" : "shown"} at ${off?.t} ms while lessonsComing() said ${off?.coming}`);
  assert(held.every((f) => f.door.href === null && f.door.title === "Your first lesson"), `a held door with a link or another title: ${JSON.stringify(held.find((f) => f.door.href !== null || f.door.title !== "Your first lesson")?.door)}`);
  const other = shown.find((f) => f.door.sub !== lessons.first);
  assert(!other, `a door other than lesson 1 ("${lessons.first}") at ${other?.t} ms: ${JSON.stringify(other?.door)}`);
  const last = seen.at(-1).door;
  assert(last.sub === lessons.first && last.href, `the door at the end: ${JSON.stringify(last)}`);
  assert(Math.abs(held.at(-1).door.h - last.h) <= 1, `the held door ${held.at(-1).door.h} px, the door that came ${last.h} px`);
  return `held ${held[0].t}–${held.at(-1).t} ms at ${held.at(-1).door.h} px, then "${last.sub}" at ${shown[0]?.t} ms at ${last.h} px`;
});

await stage("a brand-new learner whose Dutch lessons fail to download: at once what the device has, said plainly, on Home and on Study", async () => {
  const home = await newLearner({ abort: true, ms: 4000 });
  const study = await newLearner({ abort: true, hash: "#study", ms: 4000 });
  const card = home.frames.filter((f) => f.card).at(-1)?.card;
  const door = study.frames.filter((f) => f.door && f.hash === "#study").at(-1)?.door;
  const heldUntil = home.frames.filter((f) => f.card?.held).at(-1)?.t ?? null;
  // What the device has: the app's starter, or a lesson worked out from the word packs that did come; never held, never lesson 1, with its way to start.
  assert(card && !card.held && card.title && card.kicker === "Your first lesson" && /lessons haven't downloaded yet/.test(card.meta) && card.start, `Home's card: ${JSON.stringify(card)}`);
  assert(door && !door.held && /lessons haven't downloaded yet/.test(door.sub) && door.href, `Study's door: ${JSON.stringify(door)}`);
  const homeOff = offSignal(home.frames.filter((f) => f.card), "card");
  const studyOff = offSignal(study.frames.filter((f) => f.door && f.hash === "#study"), "door");
  assert(!homeOff && !studyOff, `held or shown against lessonsComing(): Home ${JSON.stringify(homeOff)}, Study ${JSON.stringify(studyOff)}`);
  const span = comingSpan(home.frames);
  assert(home.frames.at(-1).missing === true, `lessonsMissing() at the end: ${home.frames.at(-1).missing}`);
  return `Home: "${card.title}", "${card.meta}" (held until ${heldUntil ?? "never"} ms; lessonsComing() true ${span ? `${span.from}–${span.to} ms` : "never read"}); Study: "${door.sub}"`;
});

await stage("a brand-new learner whose Dutch lessons take 20 s: held through the 15 s wait, then what the device has said plainly, then lesson 1 once it comes", async () => {
  const { frames, lessons } = await newLearner({ hold: 20000, ms: 26000 });
  const seen = frames.filter((f) => f.card);
  assert(lessons.first, `SETUP: path-nl never arrived (${JSON.stringify(lessons)})`);
  const held = seen.filter((f) => f.card.held);
  const instead = seen.filter((f) => !f.card.held && f.card.title !== lessons.first);
  const first = seen.filter((f) => !f.card.held && f.card.title === lessons.first);
  const span = comingSpan(frames);
  const off = offSignal(seen, "card");
  assert(!off, `the card ${off?.card.held ? "held" : "shown"} at ${off?.t} ms while lessonsComing() said ${off?.coming}`);
  assert(held.length && span?.to && span.to - span.from >= 14000 && span.to - span.from <= 16500, `lessonsComing() true ${span?.from}–${span?.to} ms (its wait is 15 s); held ${held[0]?.t}–${held.at(-1)?.t} ms`);
  assert(instead.length && /lessons haven't downloaded yet/.test(instead[0].card.meta) && instead[0].card.start, `after the wait: ${JSON.stringify(seen.find((f) => !f.card.held)?.card)}`);
  assert(first.length && first[0].t > instead[0].t && !/lessons haven't/.test(first.at(-1).card.meta), `lesson 1 never came after what the device had (last card: ${JSON.stringify(seen.at(-1).card)})`);
  return `held ${held[0].t}–${held.at(-1).t} ms (lessonsComing() true ${span.from}–${span.to} ms), then "${instead[0].card.title}" from ${instead[0].t} ms ("${instead[0].card.meta}"), lesson 1 "${lessons.first}" from ${first[0].t} ms ("${first.at(-1).card.meta}")`;
});

// At 390 and at 320 (its lines wrap differently there). lessons: false is a learner who played a game before any lesson (studied, nothing finished):
// Home shows Practice for them once the lessons are in, so it's held in Practice's shape too.
const newPhone = async (width, { lessons = true } = {}) => {
  // Lessons done and studied (as a learner's history on this phone), then a phone with none of the packs and nothing kept of Home's shapes, as a
  // new phone is: the lessons pack held back 5 s. The card is held in the shape it most likely comes in, Practice's, from the first frame, and the
  // card that comes takes that box: nothing under it moves. (7 Nov 2026: with nothing kept, it grew from 0, 36.6 px in one frame at load.)
  const device = await browser.newContext({ viewport: { width, height: width < 340 ? 568 : 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await device.newPage();
  p.on("pageerror", (e) => errors.push(`new phone: ${e.message}`));
  try {
    const c = await device.newCDPSession(p);
    await c.send("WebAuthn.enable");
    await c.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await p.goto(`${BASE}/app/`);
    await p.waitForURL(/\/login\?next=/);
    await p.evaluate(() => localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" })));
    await p.click("summary");
    await p.fill('input[name="name"]', "New Phone");
    await p.click('#register button[type="submit"]');
    await p.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
    await p.waitForSelector("html[data-app-ready]");
    const setup = await p.evaluate(async (lessons) => {
      const DAY = 86_400_000;
      const { record } = await import("/js/study/progress.js");
      const { finishedLesson, finishedSession, lessonsFinished } = await import("/js/study/done.js");
      const { pathLessons } = await import("/js/study/path.js");
      for (let t = 0; t < 150 && !pathLessons().length; t++) await new Promise((r) => setTimeout(r, 100));
      for (let d = 6; d >= 1; d--) {
        record([{ concept: "w:huis", outcome: "right", test: "recall", skill: "read", activity: "type", item: "tile", at: Date.now() - d * DAY }]);
        finishedSession(Date.now() - d * DAY);
      }
      if (lessons) for (const lesson of pathLessons().slice(0, 3)) finishedLesson(lesson.id, Date.now() - 3 * DAY);
      // A new phone: none of the packs, nothing of Home's shapes kept.
      const { clearPacks } = await import("/js/study/packs.js");
      await clearPacks();
      localStorage.removeItem("lx.shapes.v1");
      return { finished: lessonsFinished().size, lessons: pathLessons().length };
    }, lessons);
    await device.route(/\/library\/packs\/path-nl\//, async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.continue().catch(() => {});
    });
    await p.addInitScript(() => {
      if (location.pathname !== "/app/") return;
      const t0 = performance.now();
      const frames = (globalThis.__phoneFrames = []);
      let packs = null;
      let asked = false;
      const text = (n) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
      const look = () => {
        if (!asked && document.documentElement.hasAttribute("data-app-ready")) {
          asked = true;
          import("/js/study/packs.js").then((m) => (packs = m), () => {});
        }
        const slot = document.querySelector(".lx-today-next");
        const card = slot?.querySelector('[data-part="next-step"]');
        const under = document.querySelector(".lx-today-progress-slot");
        if (slot) frames.push({
          t: Math.round(performance.now() - t0),
          coming: typeof packs?.lessonsComing === "function" ? packs.lessonsComing() : null,
          card: card ? { held: Boolean(card.querySelector('[data-part="skeleton"]')), h: Math.round(card.getBoundingClientRect().height * 10) / 10, title: text(card.querySelector("h2")), kicker: text(card.querySelector(".lx-next-kicker")) } : null,
          slot: Math.round(slot.getBoundingClientRect().height * 10) / 10,
          under: under ? Math.round(under.getBoundingClientRect().top * 10) / 10 : null,
        });
        if (performance.now() - t0 < 20000) requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    await p.reload();
    await p.waitForSelector("html[data-app-ready]");
    // (Long enough for a loaded machine: the lessons held 5 s come in a few seconds after a start that can itself take several.)
    await p.waitForTimeout(19000);
    const frames = await p.evaluate(() => globalThis.__phoneFrames ?? []);
    const seen = frames.filter((f) => f.card);
    assert(lessons ? setup.finished >= 1 : setup.finished === 0, `SETUP: ${JSON.stringify(setup)}`);
    assert(seen.length, "no card ever drawn");
    const held = seen.filter((f) => f.card.held);
    const shown = seen.filter((f) => !f.card.held);
    assert(seen[0].card.held, `the first card wasn't held: ${JSON.stringify(seen[0].card)}`);
    assert(!frames.some((f) => f.slot === 0 && f.t > seen[0].t), "the card's place was empty after it was first drawn");
    const off = offSignal(seen, "card");
    assert(!off, `the card ${off?.card.held ? "held" : "shown"} at ${off?.t} ms while lessonsComing() said ${off?.coming}`);
    assert(shown.length, `the card never came (held ${held[0]?.t}–${held.at(-1)?.t} ms)`);
    assert(!shown.some((f) => f.card.kicker === "Your first lesson"), `"Your first lesson" shown to a learner who has studied (${setup.finished} lessons done)`);
    const last = shown.at(-1).card;
    assert(Math.abs(held.at(-1).card.h - last.h) <= 1, `held in Practice's shape at ${held.at(-1).card.h} px, the card that came ("${last.title}") ${last.h} px`);
    const under = biggestStep(frames, (f) => f.under);
    assert(under.by <= 1, `Your progress moved ${under.by} px in one frame at ${under.t} ms`);
    return `${width}${lessons ? "" : ", a game played, no lesson"}: held ${held[0].t}–${held.at(-1).t} ms at ${held.at(-1).card.h} px, then "${last.title}" at ${shown[0].t} ms at ${last.h} px; Your progress's biggest step ${under.by} px`;
  } finally {
    await device.close();
  }
};
await stage("a returning learner on a new phone (lessons done, nothing kept) while Dutch's lessons come (held 5 s): Home's card held in Practice's shape, then the card in place, nothing under it moving, at 390 and 320; and a learner who played a game before any lesson the same", async () => `${await newPhone(390)}; ${await newPhone(320)}; ${await newPhone(390, { lessons: false })}`);

await stage("no page errors", async () => {
  assert(!errors.length, errors.join("\n"));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} stages passed`);
// The test account and the curator go, and the packs with them.
await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
await asCurator("DELETE", "/api/me", { confirm: "delete my account" });
await browser.close();
process.exit(failed ? 1 : 0);
