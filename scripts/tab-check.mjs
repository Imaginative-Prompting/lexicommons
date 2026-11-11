// Tabs as a phone uses them: switching between Today, Study, Read, AI and Explore and back. A tab's page is kept, not
// built again from nothing: coming back shows the same page at once, where it was scrolled to, with nothing moving as
// it comes in (every layout shift counted, those right after the tap too); it brings itself up to date quietly (Today
// after studying elsewhere), and draws nothing again when nothing changed. Explore's home is kept on the device too:
// after a restart it's there at once while the server is slow, and with no connection; with nothing kept, its featured
// pack arrives whole, never filled in after. LOCAL only: it signs up a test account, and shares a check pack in Explore
// as an admin it writes into the local D1 (as explore-check does), deleting both after.
// Usage: node scripts/tab-check.mjs http://localhost:<port> <outDir> --persist-to <state dir>   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/tab-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

// Explore with something in it: two Dutch check packs (one featured, one on a shelf), shared by a curator (an admin
// written into the local D1).
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sql = (command) => execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
const curator = { id: `tab${randomBytes(6).toString("hex")}`, cookie: randomBytes(24).toString("base64url") };
const now = Date.now();
sql(
  [
    `INSERT INTO users (id, name, created_at) VALUES (${q(curator.id)}, 'Tab Check Curator', ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(createHash("sha256").update(curator.cookie).digest("hex"))}, ${q(curator.id)}, ${now}, ${now + 86400_000}, 'tab-check')`,
    `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(curator.id)}, 'admin', ${now}, 'd1', 'tab-check')`,
  ].join("; "),
);
const asCurator = async (method, path, body) => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${curator.cookie}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
};
await asCurator("POST", "/api/community/terms", { version: 1 });
const NL = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
const second = { ...structuredClone(NL), id: "check-nl-tabs", name: "Dutch between tabs", about: "A second Dutch check pack, for a shelf." };
second.items = second.items.map((item) => ({ ...item, means: `${item.means} (between tabs)` }));
const shared = [await asCurator("POST", "/api/community/share", { pack: NL, level: "A1", topics: ["food"] }), await asCurator("POST", "/api/community/share", { pack: second, level: "A2", topics: ["travel"] })];
// A pack already there from an earlier run on this state is as good.
if (!shared.every((r) => r.status === 200 || /already in Explore/.test(JSON.stringify(r.body)))) {
  console.error(`tab-check couldn't share its check packs: ${JSON.stringify(shared.map((r) => r.body)).slice(0, 400)}`);
  process.exit(2);
}
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
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

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Tab Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
await page.waitForSelector("html[data-app-ready]");
// The AI tab is there only with an AI connected (a token will do): this check is of every tab.
await page.evaluate(() => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "an AI, for this check" }) }));
await page.reload();
await page.waitForSelector("html[data-app-ready]");
await lessonOneDone(page);

/** Lesson 1 done on this device, as a learner a day in has it: Explore's "Add next" waits for it (explore.js, 11 Nov 2026). */
async function lessonOneDone(p) {
  for (const start = Date.now(); ; await p.waitForTimeout(250)) {
    const done = await p.evaluate(async () => {
      const { lessonsComing } = await import("/js/study/packs.js");
      const { pathLessons } = await import("/js/study/path.js");
      const lessons = pathLessons();
      // The path's own lessons, never the stand-in a first sync lays out while they're on their way (a word band's starter lessons, while
      // packs.js lessonsComing): marking that one left the real lesson 1 undone after a reload. With no library, the starter's own path.
      if (lessonsComing() || !lessons.length) return false;
      const { lessonFinished, markLessonsDone } = await import("/js/study/plan.js");
      if (!lessonFinished(lessons[0])) markLessonsDone(lessons.slice(0, 1));
      return lessonFinished(lessons[0]);
    });
    if (done) return;
    if (Date.now() - start > 30_000) throw new Error("the path's lessons never came, to mark lesson 1 done");
  }
}

// Every layout shift from here on, with the time it happened (input or not: a tab's tap doesn't excuse a jump).
await page.evaluate(() => {
  window.lxShifts = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.lxShifts.push({ at: entry.startTime, value: entry.value, sources: (entry.sources ?? []).map((s) => s.node?.className || s.node?.getAttribute?.("data-part") || s.node?.nodeName || "?") });
  }).observe({ type: "layout-shift", buffered: false });
});
const TABS = ["Home", "Study", "Knowledge", "Explore"]; // Read has no tab for now: Home's book card
const tab = (name) => page.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: name }).first();
// What the page shows: its one child (the shell's host for the tab's page; before the shell kept pages, the page's own
// first element), so a page built again is a different node.
const view = () => page.locator('[data-part="page"] > :first-child');
/** Taps a tab; returns the page's own host as it comes in, and the shifts in the 1.5 s after. */
async function switchTo(name) {
  const since = await page.evaluate(() => performance.now());
  await tab(name).click();
  await page.waitForFunction((n) => document.querySelector('[data-part="app-title"]')?.textContent.includes(n), name);
  const atOnce = await page.evaluate(() => {
    const host = document.querySelector('[data-part="page"] > :first-child');
    return { mark: host?.getAttribute("data-check-mark") ?? null, text: (host?.textContent ?? "").trim().length, scroll: document.querySelector('[data-part="page"]').scrollTop };
  });
  await page.waitForTimeout(1500);
  const shifts = await page.evaluate((t) => window.lxShifts.filter((s) => s.at >= t), since);
  return { ...atOnce, shift: shifts.reduce((sum, s) => sum + s.value, 0), sources: [...new Set(shifts.flatMap((s) => s.sources))] };
}

await stage("every tab: built once, then kept (the same page when you come back, shown at once)", async () => {
  // First visits: each tab's page is built; mark it so a second visit can tell it's the same one.
  for (const name of TABS) {
    await switchTo(name);
    await page.waitForTimeout(1500); // whatever it loads has loaded
    await view().evaluate((host, n) => host.setAttribute("data-check-mark", n), name);
  }
  const back = {};
  for (const name of TABS) back[name] = await switchTo(name);
  const rebuilt = TABS.filter((n) => back[n].mark !== n);
  assert(!rebuilt.length, `built again: ${rebuilt.join(", ")} ${JSON.stringify(back)}`);
  const empty = TABS.filter((n) => back[n].text < 20);
  assert(!empty.length, `empty as it came back: ${empty.join(", ")}`);
  return TABS.map((n) => `${n} kept`).join(", ");
});

await stage("coming back to a tab: nothing moves as it comes in (layout shift 0)", async () => {
  const shifts = {};
  for (const name of TABS) shifts[name] = await switchTo(name);
  const moved = TABS.filter((n) => shifts[n].shift > 0.001);
  assert(!moved.length, `shifted: ${moved.map((n) => `${n} ${shifts[n].shift.toFixed(3)} (${shifts[n].sources.join(", ")})`).join("; ")}`);
  return TABS.map((n) => `${n} ${shifts[n].shift.toFixed(3)}`).join(", ");
});

await stage("coming back to a tab: where it was scrolled to", async () => {
  const at = {};
  for (const name of ["Explore", "Study"]) {
    await switchTo(name);
    const max = await page.evaluate(() => {
      const p = document.querySelector('[data-part="page"]');
      p.scrollTop = Math.min(400, p.scrollHeight - p.clientHeight);
      return p.scrollTop;
    });
    at[name] = max;
  }
  await switchTo("Home");
  const back = {};
  for (const name of ["Explore", "Study"]) back[name] = (await switchTo(name)).scroll;
  const lost = Object.keys(at).filter((n) => Math.abs(back[n] - at[n]) > 1);
  assert(!lost.length, `scroll lost: ${lost.map((n) => `${n} ${at[n]} → ${back[n]}`).join(", ")}`);
  return Object.keys(at).map((n) => `${n} ${at[n]}px`).join(", ");
});

await stage("a kept tab brings itself up to date: Today after studying elsewhere", async () => {
  await switchTo("Home");
  const before = await page.evaluate(() => document.querySelector('[data-part="page"] .lx-today-progress-slot')?.textContent ?? "");
  await switchTo("Study");
  // Studied meanwhile: right answers on five words, recorded as a game records them.
  await page.evaluate(async () => {
    const { record } = await import("/js/study/progress.js");
    const words = ["boek", "huis", "fiets", "water", "brood"];
    record(words.map((w) => ({ concept: `w:${w}`, outcome: "right", test: "recall", skill: "read", activity: "choose", item: "starter-word-order" })));
  });
  await switchTo("Home");
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ text: document.querySelector('[data-part="page"] .lx-today-progress-slot')?.textContent ?? "", mark: document.querySelector('[data-part="page"] > :first-child')?.getAttribute("data-check-mark") ?? null }));
  assert(after.mark === "Home", `still the kept page (${after.mark})`);
  assert(after.text !== before, `Today's progress moved: before “${before.slice(0, 80)}”, after “${after.text.slice(0, 80)}”`);
  return `kept, and its progress changed`;
});

await stage("coming back to the AI tab draws nothing again when nothing changed", async () => {
  // Marked as they are; away and back; once each has read its data again (Read from the device, the AI tab from the
  // server), the same nodes are still there.
  const mark = async (name, sel) => {
    await switchTo(name);
    await page.waitForTimeout(2500);
    return page.evaluate((s) => {
      const n = document.querySelector(s);
      if (n) n.setAttribute("data-check-same", "1");
      return Boolean(n);
    }, sel);
  };
  // The AI tab's first thing (with the AI this check connected, the Practice with me card; with none, Connect your AI), whatever it's drawn as.
  const SLOTS = { AI: ".lx-ai-body > :first-child" };
  const third = async (id, label) => {
    await page.evaluate(async (id) => (await import("/js/shell/layout.js")).setThirdTab(id), id);
    await page.waitForFunction((label) => [...document.querySelectorAll('[data-part="tab-bar"] [data-part="tab"]')].some((t) => t.textContent.trim() === label), label);
  };
  const marked = {};
  const kept = {};
  // AI in the bar, as the switch puts it there.
  for (const [name, sel] of Object.entries(SLOTS)) {
    await third(name.toLowerCase(), name);
    marked[name] = await mark(name, sel);
    await switchTo("Home");
    await switchTo(name);
    await page.waitForTimeout(2500);
    kept[name] = await page.evaluate((s) => document.querySelector(s)?.getAttribute("data-check-same") === "1", sel);
  }
  await page.evaluate(async () => (await import("/js/shell/layout.js")).setThirdTab("none"));
  await page.waitForFunction(() => ![...document.querySelectorAll('[data-part="tab-bar"] [data-part="tab"]')].some((t) => t.textContent.trim() === "AI"));
  assert(marked.AI, `nothing to mark: ${JSON.stringify(marked)}`);
  const redrawn = Object.keys(kept).filter((n) => !kept[n]);
  assert(!redrawn.length, `drawn again with nothing changed: ${redrawn.join(", ")}`);
  return "the AI tab's first card, the same node after coming back";
});

// Coming back to a tab you've already opened, on a phone with its processor slowed 4×: the tab's kept page on the screen within REVISIT_MS of the press
// (the frame that shows it), no long task in the 2 s after (bringing it up to date never holds the page), and with nothing changed meanwhile, nothing
// in it drawn again. (A tab that does nothing at all comes back in ~55 ms here; Tinta's own drawing each frame adds ~30 ms on Home.) Knowledge isn't held to either yet: its new page is being
// built to the same limits, and is measured and shown here meanwhile. Add it to REVISIT_TABS when it lands.
const REVISIT_TABS = ["Home", "Study", "Explore"];
const REVISIT_MS = 120;
// A task holding the page longer than this after the press (a busy machine's slowed browser stretches every task; 50 ms, the long-task line, failed
// a page that does nothing more than draw itself).
const HELD_MS = 80;
const SLOWED = 4;
/** Taps a kept tab, slowed: the press to the frame that shows its page, the long tasks in the 2 s after, and what changed in the page meanwhile (Tinta's own
 * drawing and the shell putting the page in its place aside). */
async function revisit(name) {
  await page.evaluate((n) => {
    const shown = () => {
      const hosts = [...document.querySelectorAll('[data-part="page"] > .lx-view')].filter((h) => h.getClientRects().length && !h.hasAttribute("data-waiting"));
      return hosts.length === 1 && hosts[0].getAttribute("data-revisit") === n && document.querySelector('[data-part="app-title"]')?.textContent.includes(n);
    };
    window.lxRevisitStop?.();
    const r = (window.lxRevisit = { tapAt: 0, shownAt: 0, long: [], changes: [] });
    addEventListener("pointerdown", () => (r.tapAt = performance.now()), { capture: true, once: true });
    const tasks = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (r.tapAt && e.startTime + e.duration > r.tapAt) r.long.push(Math.round(e.duration));
    });
    tasks.observe({ type: "longtask", buffered: false });
    const pageNode = document.querySelector('[data-part="page"]');
    const changes = new MutationObserver((records) => {
      for (const m of records) {
        const at = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        // Only the arriving page, from the press on (the page leaving may still be animating as it goes).
        if (!r.tapAt || m.target === pageNode || at?.closest?.(".lx-view")?.getAttribute("data-revisit") !== n || at?.closest?.('lx-tinta, [data-part="character"]')) continue;
        r.changes.push(`${at?.tagName?.toLowerCase()}${at?.className && typeof at.className === "string" ? `.${at.className.split(" ")[0]}` : ""} ${m.type}${m.attributeName ? `:${m.attributeName}` : ""}`);
      }
    });
    changes.observe(pageNode, { subtree: true, childList: true, attributes: true, characterData: true });
    window.lxRevisitStop = () => (tasks.disconnect(), changes.disconnect());
    const look = () => {
      if (r.tapAt && shown()) return void (r.shownAt = performance.now());
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  }, name);
  await tab(name).click();
  await page.waitForFunction(() => window.lxRevisit.shownAt > 0, null, { timeout: 10_000 });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => window.lxRevisit);
  return { ms: Math.round(r.shownAt - r.tapAt), long: r.long, changes: [...new Set(r.changes)], changed: r.changes.length };
}

await stage(`coming back to a tab, on a phone ${SLOWED}× slower: the tab's page on the screen within ${REVISIT_MS} ms of the press, no task over ${HELD_MS} ms after it, nothing drawn again when nothing changed`, async () => {
  // Each tab opened, its page marked, and given time to have what it loads.
  for (const name of TABS) {
    await switchTo(name);
    await page.waitForTimeout(1500);
    await view().evaluate((host, n) => host.setAttribute("data-revisit", n), name);
  }
  await switchTo("Home");
  await page.waitForTimeout(1500);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: SLOWED });
  const seen = Object.fromEntries(TABS.map((n) => [n, []]));
  try {
    for (let round = 0; round < 2; round++) for (const name of [...TABS.slice(1), TABS[0]]) seen[name].push(await revisit(name));
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
  const line = (n) => `${n} ${seen[n].map((v) => `${v.ms} ms${v.long.length ? ` (long tasks ${v.long.join(", ")} ms)` : ""}${v.changed ? `, ${v.changed} changes` : ""}`).join(" / ")}`;
  writeFileSync(`${OUT}/revisit.json`, JSON.stringify({ slowed: SLOWED, limit: REVISIT_MS, seen }, null, 1));
  const slow = REVISIT_TABS.filter((n) => seen[n].some((v) => v.ms > REVISIT_MS));
  const redrawn = REVISIT_TABS.filter((n) => seen[n].some((v) => v.changed));
  const held = REVISIT_TABS.filter((n) => seen[n].some((v) => v.long.some((ms) => ms > HELD_MS)));
  assert(!slow.length && !redrawn.length && !held.length, [slow.length ? `slower than ${REVISIT_MS} ms: ${slow.map(line).join("; ")}` : "", held.length ? `a task over ${HELD_MS} ms after the press: ${held.map(line).join("; ")}` : "", redrawn.length ? `drawn again with nothing changed: ${redrawn.map((n) => `${n} (${seen[n].flatMap((v) => v.changes).slice(0, 6).join(", ")})`).join("; ")}` : ""].filter(Boolean).join(". "));
  return `${TABS.map(line).join("; ")}${TABS.filter((n) => !REVISIT_TABS.includes(n)).map((n) => ` (${n} not held to it yet)`).join("")}`;
});

await stage("a session over Study: Study kept under it as it was, and back to it where it was scrolled (by the session's cross, and by the phone's back)", async () => {
  // In and out of a game after scrolling Study, it came back at its top, built again (6 Nov 2026). Moved by the page itself (no scrolling a
  // press of the check's own could do).
  const seen = {};
  for (const how of ["cross", "phone"]) {
    await switchTo("Study");
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => {
      const p = document.querySelector('[data-part="app"] > [data-part="page"]');
      p.scrollTop = Math.min(400, p.scrollHeight - p.clientHeight);
      document.querySelector('[data-part="page"] > .lx-view')?.setAttribute("data-check-under", "1");
      return Math.round(p.scrollTop);
    });
    const game = await page.evaluate(() => document.querySelector('[data-part="page"] .lx-quick-play a[href^="#study/session/game/"]')?.getAttribute("href"));
    assert(before > 50 && game, `Study to scroll (${before}) and a game to start (${game})`);
    await page.evaluate((href) => (location.hash = href), game);
    await page.waitForSelector('[data-part="session-bar"]', { timeout: 10_000 });
    await page.waitForTimeout(800);
    if (how === "cross") await page.evaluate(() => document.querySelector('[data-part="session-bar"] [data-part="icon-button"]')?.click());
    else await page.evaluate(() => history.back());
    await page.waitForFunction(() => !document.querySelector('[data-part="session-bar"]') && (location.hash || "#today").startsWith("#study"), null, { timeout: 10_000 });
    await page.waitForTimeout(800);
    seen[how] = await page.evaluate(() => ({ y: Math.round(document.querySelector('[data-part="app"] > [data-part="page"]').scrollTop), same: document.querySelector('[data-part="page"] > .lx-view')?.getAttribute("data-check-under") === "1" }));
    seen[how].before = before;
  }
  const bad = Object.entries(seen).filter(([, s]) => !s.same || Math.abs(s.y - s.before) > 2);
  assert(!bad.length, bad.map(([how, s]) => `${how}: ${s.same ? "the same page" : "built again"}, scrolled ${s.before} → ${s.y}`).join("; "));
  return Object.entries(seen).map(([how, s]) => `${how}: the same page, at ${s.y} px`).join("; ");
});

await stage("a page under a tab is built fresh, and its tab's page is still kept when you go back", async () => {
  await switchTo("Study");
  await page.goto(`${BASE}/app/#settings/study`);
  await page.waitForFunction(() => location.hash === "#settings/study");
  await page.waitForTimeout(500);
  await switchTo("Study");
  const mark = await view().evaluate((host) => host.getAttribute("data-check-mark"));
  assert(mark === "Study", `Study's page after Settings: ${mark}`);
  const hosts = await page.evaluate(() => document.querySelectorAll('[data-part="page"] > .lx-view').length);
  assert(hosts <= 1, `one page on the screen: ${hosts}`);
  return "kept; one page in view";
});

// Explore's home after the app starts again: what the page shows the moment Explore's tab is tapped, and how long
// until its pack to start is there, face-out on the shelf (the server held back by `slow` ms, or failing).
const FEATURE = ".lx-face";
async function exploreAfterRestart({ slow = 0, fail = false, forget = false, slowItem = 0 } = {}) {
  await page.unroute("**/api/community/**").catch(() => {});
  if (forget) await page.evaluate(() => localStorage.removeItem("lx.explore-home.v1"));
  await page.route("**/api/community/**", async (route) => {
    if (fail) return route.abort("internetdisconnected");
    const isItem = /\/api\/community\/items\/[^/?]+$/.test(new URL(route.request().url()).pathname);
    const wait = isItem ? slowItem : slow;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return route.continue().catch(() => {});
  });
  await page.goto(`${BASE}/app/#today`);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForFunction(() => document.querySelector('[data-part="app-title"]')?.textContent.includes("Home"));
  // Watch the featured pack from the tap: when it first appears, and whether it had its cover's place then.
  await page.evaluate((sel) => {
    window.lxFeature = null;
    window.lxShifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.lxShifts.push({ at: entry.startTime, value: entry.value, sources: (entry.sources ?? []).map((s) => s.node?.className || s.node?.getAttribute?.("data-part") || s.node?.nodeName || "?") });
    }).observe({ type: "layout-shift", buffered: false });
    const start = performance.now();
    const look = () => {
      const f = document.querySelector(sel);
      if (f && !window.lxFeature) window.lxFeature = { at: performance.now() - start, withCover: Boolean(f.querySelector('[data-part="pack-cover"]')) };
    };
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true });
    window.lxTapAt = start;
  }, FEATURE);
  const since = await page.evaluate(() => performance.now());
  await tab("Explore").click();
  // The moment the page has changed to Explore: what's on it then.
  await page.waitForFunction(() => document.querySelector('[data-part="app-title"]')?.textContent.includes("Explore"));
  const atOnce = await page.evaluate((sel) => ({ feature: Boolean(document.querySelector(sel)), loading: [...document.querySelectorAll('[data-part="empty-state"]')].some((e) => e.textContent.includes("Loading")), shelves: document.querySelectorAll(".lx-explore-shelf").length }), FEATURE);
  await page.waitForTimeout(Math.max(slow, slowItem) + 1500);
  const after = await page.evaluate((t) => ({ feature: window.lxFeature, shift: window.lxShifts.filter((s) => s.at >= t).reduce((sum, s) => sum + s.value, 0), sources: [...new Set(window.lxShifts.filter((s) => s.at >= t).flatMap((s) => s.sources))] }), since);
  await page.unroute("**/api/community/**").catch(() => {});
  return { atOnce, ...after };
}

await stage("Explore after a restart: there at once from the device while the server is slow, and nothing moves when it answers", async () => {
  const r = await exploreAfterRestart({ slow: 2500 });
  assert(r.atOnce.feature && !r.atOnce.loading && r.atOnce.shelves > 0, `at the tap: ${JSON.stringify(r.atOnce)}`);
  assert(r.feature?.withCover, `the featured pack with its cover: ${JSON.stringify(r.feature)}`);
  assert(r.shift <= 0.001, `shifted ${r.shift.toFixed(3)} (${r.sources.join(", ")}) when the server answered`);
  return `featured pack and ${r.atOnce.shelves} shelves at the tap; shift ${r.shift.toFixed(3)} after the server's answer`;
});

await stage("Explore with no connection: the home as last seen, from the device", async () => {
  const r = await exploreAfterRestart({ fail: true });
  assert(r.atOnce.feature && !r.atOnce.loading && r.atOnce.shelves > 0, `at the tap: ${JSON.stringify(r.atOnce)}`);
  const said = await page.evaluate(() => document.querySelector('[data-part="page"]').textContent);
  assert(!/needs a connection|Failed to fetch/i.test(said), "an error over the kept home");
  return `featured pack and ${r.atOnce.shelves} shelves with Explore's server unreachable`;
});

await stage("Explore with nothing kept: the featured pack arrives whole, its cover with it", async () => {
  const r = await exploreAfterRestart({ forget: true, slowItem: 1200 });
  assert(r.feature, "a featured pack");
  assert(r.feature.withCover, `the featured pack appeared without its cover (${Math.round(r.feature.at)} ms after the tap), to be filled in after`);
  return `appeared ${Math.round(r.feature.at)} ms after the tap with its cover (the pack's page held back 1.2 s)`;
});

await stage("tapping the tab you're on: its page scrolls to the top; on a page under it, the top first, then the tab's own page", async () => {
  // The scroll and the hash a tap leaves, a moment after it. A spacer makes each page tall enough to scroll, whatever
  // a test account has on it, and goes again after.
  const tall = () =>
    page.evaluate(() => {
      const p = document.querySelector('[data-part="page"]');
      const spacer = document.createElement("div");
      spacer.className = "check-spacer";
      spacer.style.height = "2000px";
      p.querySelector(":scope > .lx-view").append(spacer);
      p.scrollTop = 600;
      return p.scrollTop;
    });
  const after = async (name) => {
    await tab(name).click();
    await page.waitForTimeout(900);
    return page.evaluate(() => ({ scroll: Math.round(document.querySelector('[data-part="page"]').scrollTop), hash: location.hash }));
  };
  const untall = () => page.evaluate(() => document.querySelectorAll(".check-spacer").forEach((n) => n.remove()));
  try {
    // A tab's own page.
    await switchTo("Explore");
    const was = await tall();
    const first = await after("Explore");
    const again = await after("Explore");
    await untall();
    assert(was >= 500, `Explore didn't scroll: ${was}`);
    assert(first.scroll === 0 && first.hash === "#explore", `Explore's tab tapped at ${was}px: ${JSON.stringify(first)}`);
    assert(again.scroll === 0 && again.hash === "#explore", `tapped again at the top: ${JSON.stringify(again)}`);
    // A page under Home (Read, which has no tab): the top first, then Home's own page.
    await switchTo("Home");
    await page.goto(`${BASE}/app/#read`);
    await page.waitForFunction(() => location.hash === "#read" && document.querySelector('[data-part="tab-bar"] [data-state="active"]')?.textContent.includes("Home"));
    await page.waitForTimeout(500);
    const under = await tall();
    const top = await after("Home");
    const home = await after("Home");
    await untall();
    assert(under >= 500, `Read didn't scroll: ${under}`);
    assert(top.scroll === 0 && top.hash === "#read", `Home's tab tapped on Read at ${under}px: ${JSON.stringify(top)}`);
    assert(home.hash === "#today", `Home's tab tapped again at the top: ${JSON.stringify(home)}`);
    return `Explore ${was}px → 0, then nothing; Read ${under}px → 0 (still #read), then #today`;
  } finally {
    await untall().catch(() => {});
  }
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.join("\n"));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
// The test account and the curator go, and the pack with them.
await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
await asCurator("DELETE", "/api/me", { confirm: "delete my account" });
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} stages passed`);
await browser.close();
process.exit(failed ? 1 : 0);
