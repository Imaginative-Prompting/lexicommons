// Tinta on the main tabs, end to end in headless Chrome on a LOCAL server (it creates and deletes a test account and a
// curator written into the local D1, so never point it at the live site). Each place has its own pose and act:
//   Today      by the streak and the week strip: ready (a drip of ink on its curl) until today counts; on the day's first
//              finished thing it throws the drip into today's square (once a day: the square stays open until the ink
//              lands, at THROW_IMPACT; a press ends it with the square shown at once), then sits back, counted
//   Study      it peeks over the quick session's top edge (its edge line on the card's, its head clear of the header)
//   Knowledge  beside This week's number, idle on a first look; after a session, holding its drip, it throws it into today's glass as
//              the glasses come in (know/week-tinta.js), and today's glass rises only from the ink's landing; no second throw that day
//   AI         beside your AI, listening; scribbling while your AI is working (a request taken over MCP); catching
//              the answer when it's done, then listening again
//   Explore    none: the featured pack has its cover
// Everywhere: hidden, clear of every word, moving; a tap at its middle is his (a poke: character.js poke(), the rig's
// poke.js): it never opens the link around him nor gives it its pressed look, pokes a beat apart are the next in turn (splat,
// tickle, slide, splat, the grumpy squirt), one sooner is dropped, a tap on him never ends his poke and a press elsewhere
// does; with Animations off a still in every place, no throw and a tap that does nothing. Fails on any page error.
//
// Usage (headless Chrome, so through the channel's GPU queue's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta tabs check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/tinta-tabs-check.mjs http://localhost:<port> <outDir> --persist-to <state dir>

import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { wholeReport, wholeWatch } from "./tinta-whole.mjs";
import { fillChoice, ownText } from "./fixtures/step-text.mjs";
import { pastReminderAsk, playToSummary } from "./fixtures/play-session.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/tinta-tabs-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

const results = [];
const problems = [];
let failed = 0;
async function stage(name, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - t, detail });
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    results.push({ stage: name, ok: false, ms: Date.now() - t, error: String(error?.stack ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
    await page.screenshot({ path: join(OUT, "shots", `fail-${results.length}.png`) }).catch(() => {});
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// ---------- Explore with a featured pack: a check pack shared by a curator (an admin written into the local D1) ----------
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sql = (command) => execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
const curator = { id: `tt${randomBytes(6).toString("hex")}`, cookie: randomBytes(24).toString("base64url") };
const now0 = Date.now();
sql(
  [
    `INSERT INTO users (id, name, created_at) VALUES (${q(curator.id)}, 'Tinta Tabs Curator', ${now0})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(createHash("sha256").update(curator.cookie).digest("hex"))}, ${q(curator.id)}, ${now0}, ${now0 + 86400_000}, 'tinta-tabs-check')`,
    `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(curator.id)}, 'admin', ${now0}, 'd1', 'tinta-tabs-check')`,
  ].join("; "),
);
const asCurator = async (method, path, body) => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${curator.cookie}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
};
await asCurator("POST", "/api/community/terms", { version: 1 });
const NL = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
const shared = await asCurator("POST", "/api/community/share", { pack: NL, level: "A1", topics: ["food"] });
if (!(shared.status === 200 || /already in Explore/.test(JSON.stringify(shared.body)))) {
  console.error(`tinta-tabs-check couldn't share its check pack: ${JSON.stringify(shared.body).slice(0, 400)}`);
  process.exit(2);
}

// ---------- the browser: a phone; every Tinta's states and acts recorded with their times ----------
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const wholeSeen = await wholeWatch(context); // every Tinta this check meets, every frame: nothing cuts it (tinta-whole.mjs)
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
await context.addInitScript(() => {
  // Where a Tinta is: the place it's in.
  const PLACES = { "streak-spot": "today", "path-strip": "study", "ai-practice": "ai", "week-tinta": "know" };
  const placeOf = (node) => {
    for (const [part, place] of Object.entries(PLACES)) if (node.closest?.(`[data-part="${part}"]`)) return place;
    return null;
  };
  window.lxStates = [];
  window.lxActs = [];
  new MutationObserver((records) => {
    for (const r of records) {
      const node = r.target;
      if (node.localName !== "lx-tinta") continue;
      const place = placeOf(node);
      if (place) window.lxStates.push({ place, state: node.getAttribute("data-state"), at: performance.now() });
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
  customElements.whenDefined("lx-tinta").then(() => {
    const part = customElements.get("lx-tinta").prototype;
    const perform = part.perform;
    part.perform = function (make, targets, ...rest) {
      // Every argument through (a poke hands its first data and the presses it's spared by).
      const handle = perform.call(this, make, targets, ...rest);
      window.lxActs.push({ place: placeOf(this), name: this.getAttribute("data-state"), targets: [...(targets ?? [])].map((t) => t?.getAttribute?.("class") ?? t?.nodeName ?? null), at: performance.now() });
      return handle;
    };
  });
});
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const SESSION = '[data-part="session"]:not([data-ghost])';
const TINTA = { today: '[data-part="streak-spot"] [data-part="character"]', study: '[data-part="path-strip"] [data-part="character"]', ai: '[data-part="ai-practice"] [data-part="character"]', know: '[data-part="page"]:not([data-ghost]) [data-part="week-tinta"] [data-part="character"]' };
const tab = (name) => page.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: name }).first();
const toTab = async (name) => {
  await tab(name).click();
  await page.waitForFunction((n) => document.querySelector('[data-part="app-title"]')?.textContent.includes(n), name);
};
const shot = (name) => page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
/**
 * A point in a place's Tinta's box, as the page's own hit test reads his ink (character.js inkAt: his body as drawn): on it (from `across` of
 * the way along his box in to his ink's edge, then halfway back to his middle, on the row `down` of the way down, or the nearest row where he's
 * drawn on that side: mid-poke he may be a puddle at his foot), or `beside` it (in his box, 10 px and more from his ink: the lowest such row first, from his
 * box's left: beside his drop's foot). { x, y, on } in the page's px, or null.
 */
const inkPoint = (selector, { across = 0.5, down = 0.6, beside = false } = {}) =>
  page.evaluate(([sel, across, down, beside]) => {
    const t = document.querySelector(sel), b = t.getBoundingClientRect();
    if (beside) {
      for (let y = b.bottom - 3; y > b.top + 2; y -= 2) for (let x = b.left + 3; x < b.right - 2; x += 2) if (!t.inkAt(x, y, 10)) return { x, y, on: t.inkAt(x, y) };
      return null;
    }
    // From his body's middle as drawn (character.js inkBox, as a poke's side is told): mid-run he may have slid off his box's middle.
    const ink = t.inkBox(), mid = ink ? (ink.left + ink.right) / 2 : b.left + b.width / 2, from = b.left + b.width * across, step = from <= mid ? 1 : -1;
    for (const r of [down, ...Array.from({ length: 24 }, (_, k) => down + (k % 2 ? -1 : 1) * 0.02 * Math.ceil((k + 1) / 2))]) {
      if (r <= 0.02 || r >= 0.98) continue;
      const y = b.top + b.height * r;
      // His ink's edge on that side along this row (from `across` in toward his middle), then halfway back to his middle: well on that
      // side of him, so a few px of his moving (mid-poke) between this read and the tap can't put it on the other.
      let edge = (from - mid) * step >= 0 ? (t.inkAt(mid, y, 0) ? mid : null) : null;
      for (let x = from; edge === null && (x - mid) * step < 0; x += step) if (t.inkAt(x, y, 0)) edge = x;
      if (edge === null) continue;
      const x = (edge + mid) / 2;
      if (t.inkAt(x, y, 0)) return { x, y, on: true };
    }
    return { x: from, y: b.top + b.height * down, on: false };
  }, [selector, across, down, beside]);
/**
 * A real tap on a place's Tinta's ink, from `across` of the way along his box (0 his left edge, 1 his right) in to his ink, at 60% down:
 * what he does next (data-state), the run of pokes he's taken ([act time, which in the run, side]), whether a poke now is still the run's
 * act, and where the page is.
 */
const pokeAt = async (selector, across) => {
  // Into view by the element itself: a locator waits for it to hold still, and the path page's Tinta bobs.
  await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), selector);
  const on = await inkPoint(selector, { across });
  if (!on?.on) throw new Error(`no point on ${selector}'s ink from ${across} across: ${JSON.stringify(on)}`);
  // Its click comes after the finger lifts (the browser's, or motion.js's for a tap that got none): counted on him, then read.
  const before = await page.evaluate((sel) => {
    const t = document.querySelector(sel);
    if (!t.lxClicks) {
      t.lxClicks = { n: 0 };
      t.addEventListener("click", () => t.lxClicks.n++);
    }
    return t.lxClicks.n;
  }, selector);
  await page.touchscreen.tap(on.x, on.y);
  await page.waitForFunction(([sel, n]) => document.querySelector(sel)?.lxClicks.n > n, [selector, before], { timeout: 2000 });
  return pokeState(selector);
};
const pokeState = (selector) =>
  page.evaluate((sel) => {
    const t = document.querySelector(sel);
    return {
      state: t?.getAttribute("data-state"),
      run: (t?.pokes?.list ?? []).map((p) => [Math.round(p.at * 100) / 100, p.n, p.side]),
      same: Boolean(t?.pokes && t.reaction === t.pokes.r),
      hash: location.hash,
    };
  }, selector);

/**
 * A place's Tinta, brought to the middle of the screen: its state, whether it's drawn and moving (its drawing changes
 * over 500 ms), whether a press at its middle reaches something else or him (a poke), and which words in `within` it covers
 * (its box, 3 px in, against each text line's box).
 */
const look = (place, within) =>
  page.evaluate(
    async ([selector, within]) => {
      const until = performance.now() + 8000;
      let node = document.querySelector(selector);
      while (performance.now() < until && !(node && node.querySelector("svg path"))) {
        await new Promise((r) => setTimeout(r, 50));
        node = document.querySelector(selector);
      }
      if (!node) return null;
      node.scrollIntoView({ block: "center" });
      await new Promise((r) => setTimeout(r, 300));
      const svg = node.querySelector("svg");
      const before = svg.innerHTML;
      await new Promise((r) => setTimeout(r, 500));
      // Alive: its drawing changing, or (idle on the compositor, character.js startMotion) its breath and sway playing as a transform.
      const moved = svg.innerHTML !== before || svg.getAnimations().some((a) => a.playState === "running");
      const b = node.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const box = { left: b.left + 3, top: b.top + 3, right: b.right - 3, bottom: b.bottom - 3 };
      const covered = [];
      const host = within ? node.closest(within) : null;
      if (host) {
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          if (!t.textContent.trim() || node.contains(t)) continue;
          const range = document.createRange();
          range.selectNodeContents(t);
          for (const r of range.getClientRects()) if (r.width && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) covered.push(t.textContent.trim().slice(0, 30));
        }
      }
      return {
        state: node.getAttribute("data-state"),
        hidden: node.getAttribute("aria-hidden") === "true",
        drawn: Boolean(svg.querySelector("path")),
        moved,
        pressedThrough: !hit || !node.contains(hit),
        // Where he stands on a tab a tap is his: his box takes it (data-pokeable), never his drawing past it.
        pokeable: node.hasAttribute("data-pokeable"),
        hitHim: hit === node,
        covered,
        box: { left: b.left, top: b.top, width: b.width, height: b.height },
      };
    },
    [TINTA[place], within],
  );

// ---------- signing up, as every check does ----------
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Tinta Tabs");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
await page.waitForSelector("html[data-app-ready]");
// A personal token for playing the AI over MCP (as ai-check does).
const token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Tinta tabs check" }) })).json()).token);
// With an AI connected, and the setting that gives it Read's place, the AI tab is there.
await page.evaluate(() => localStorage.setItem("lx.shell.v1", JSON.stringify({ third: "ai" })));
await page.reload();
await page.waitForSelector("html[data-app-ready]");
async function mcp(method, params) {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 200)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
}
async function tool(name, args = {}) {
  const result = await mcp("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}

// ---------- a quick session to its summary, played by scripts/fixtures/play-session.mjs (each step by its kind) ----------
async function playSession() {
  await page.goto(`${BASE}/app/#study/session/quick`);
  await page.waitForSelector(SESSION);
  await playToSummary(page, { session: SESSION });
  await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page, { session: SESSION });
}

/**
 * Today's throw, watched from the moment the streak spot is brought into view: when the act started, its target, when
 * today's square lost data-ink, what the act drew on the way (the flying drop, the ink), where the ink landed against
 * the square, and the state it settled in. Waits up to `ms`.
 */
const watchThrow = (ms = 5000) =>
  page.evaluate(async (ms) => {
    const spot = document.querySelector('[data-part="streak-spot"]');
    const node = spot?.querySelector('[data-part="character"]');
    if (!node) return { spot: false };
    const t0 = performance.now();
    spot.scrollIntoView({ block: "center" });
    const out = { spot: true, started: null, inkAt: null, inkOff: null, flying: false, splat: null, square: null, settled: null, states: [] };
    const today = () => spot.querySelector('[data-part="week-day"][aria-current="date"]');
    let last = node.getAttribute("data-state");
    out.states.push(last);
    while (performance.now() - t0 < ms) {
      const state = node.getAttribute("data-state");
      if (state !== last) out.states.push((last = state));
      const now = performance.now() - t0;
      if (state === "throw" && out.started == null) out.started = now;
      const day = today();
      if (day?.hasAttribute("data-ink") && out.inkAt == null) out.inkAt = now;
      if (out.inkAt != null && out.inkOff == null && !day?.hasAttribute("data-ink")) out.inkOff = now;
      if (state === "throw") {
        const svg = node.querySelector("svg");
        // drawFlying's drop: an ellipse in a translated, rotated group.
        if (svg.querySelector('g[transform*="rotate"] > ellipse')) out.flying = true;
        // drawInk's ink: a path clipped by its own clipPath (id ink…); where it is against today's square.
        const ink = svg.querySelector('clipPath[id^="ink"] + path');
        const mark = day?.querySelector(".lx-week-mark");
        if (ink && mark && !out.splat) {
          const a = ink.getBoundingClientRect(), b = mark.getBoundingClientRect();
          out.splat = { dx: a.left + a.width / 2 - (b.left + b.width / 2), dy: a.top + a.height / 2 - (b.top + b.height / 2), w: a.width, side: b.width };
        }
      }
      if (out.started != null && state !== "throw") {
        out.settled = { state, at: now };
        break;
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    out.square = today()?.getAttribute("data-state") ?? null;
    out.inkLeft = today()?.hasAttribute("data-ink") ?? null;
    return out;
  }, ms);
const thrownKey = () => page.evaluate(async () => {
  const { dayKey } = await import("/js/know/streak.js");
  let stored = null;
  try {
    stored = localStorage.getItem("lx.today.thrown");
  } catch {}
  return { stored, today: dayKey() };
});

// ---------- the stages ----------

await stage("A fresh account's Home: the empty state's Tinta speaks for its progress, none at the streak spot yet", async () => {
  await page.goto(`${BASE}/app/#today`);
  await page.waitForFunction(() => document.querySelector('[data-part="app-title"]')?.textContent.includes("Home"));
  await page.waitForSelector('[data-part="streak-spot"]');
  const r = await page.evaluate(() => ({
    spot: document.querySelectorAll('[data-part="streak-spot"] [data-part="character"]').length,
    progress: document.querySelectorAll('.lx-today-progress [data-part="character"]').length,
  }));
  assert(r.spot === 0 && r.progress === 1, `one Tinta in the progress section, the empty state's: ${JSON.stringify(r)}`);
  return "the empty state's Tinta only";
});

await stage("A session makes today count: back on Home, Tinta throws its drip into today's square, which stays open until the ink lands", async () => {
  await playSession();
  await toTab("Home");
  const w = await watchThrow(6000);
  const THROW_IMPACT = await page.evaluate(async () => (await import("/js/character/rig/inkdrop/today-throw.js")).THROW_IMPACT);
  assert(w.spot, "no streak spot");
  assert(w.started != null && w.started < 1500, `the throw should start once the spot is on screen: ${JSON.stringify(w)}`);
  assert(w.states[0] === "ready", `it should be ready (its drip) until it throws: ${w.states.join(" → ")}`);
  const acts = await page.evaluate(() => window.lxActs.filter((a) => a.place === "today"));
  assert(acts.length === 1 && acts[0].name === "throw" && acts[0].targets[0] === "lx-week-mark", `one throw, at today's square: ${JSON.stringify(acts)}`);
  assert(w.inkAt != null && w.inkAt <= w.started + 50, `today's square held open as the throw starts: ${JSON.stringify(w)}`);
  const open = (w.inkOff - w.started) / 1000;
  assert(Math.abs(open - THROW_IMPACT) < 0.25, `the square opens to studied when the ink lands (${THROW_IMPACT}s): it was held ${open.toFixed(2)}s`);
  assert(w.flying, "the flying drop should be drawn on its way");
  assert(w.splat && Math.hypot(w.splat.dx, w.splat.dy) < w.splat.side * 0.4, `the ink lands on today's square: ${JSON.stringify(w.splat)}`);
  assert(w.settled?.state === "counted", `it settles counted: ${JSON.stringify(w.settled)}`);
  assert(w.square === "studied" && w.inkLeft === false, `today's square studied, nothing left on it: ${JSON.stringify(w)}`);
  const key = await thrownKey();
  assert(key.stored === key.today, `today's throw kept (once a day): ${JSON.stringify(key)}`);
  await shot("today-counted");
  return `throw ${Math.round(w.started)} ms after the spot was on screen, square open ${open.toFixed(2)} s (impact ${THROW_IMPACT}), ink landed ${Math.hypot(w.splat.dx, w.splat.dy).toFixed(1)} px off the square's middle, settled counted after ${(w.settled.at / 1000).toFixed(2)} s`;
});

await stage("Back on Home the same day: no second throw, counted", async () => {
  await toTab("Study");
  await toTab("Home");
  const w = await watchThrow(2000);
  assert(w.started == null, `no second throw: ${JSON.stringify(w)}`);
  assert(w.states.at(-1) === "counted", `counted: ${w.states.join(" → ")}`);
  return "no throw; counted";
});

await stage("A press 300 ms into the throw ends it at once: counted, today's square shown", async () => {
  await page.evaluate(() => localStorage.removeItem("lx.today.thrown"));
  await toTab("Study");
  await toTab("Home");
  const started = await page.evaluate(async () => {
    document.querySelector('[data-part="streak-spot"]').scrollIntoView({ block: "center" });
    const node = document.querySelector('[data-part="streak-spot"] [data-part="character"]');
    const t0 = performance.now();
    while (performance.now() - t0 < 2000 && node.getAttribute("data-state") !== "throw") await new Promise((r) => requestAnimationFrame(r));
    return node.getAttribute("data-state") === "throw";
  });
  assert(started, "the throw should start again once the day's mark is cleared");
  await page.waitForTimeout(300);
  // A press in a corner clear of everything (the tab bar's gap would change tabs): the page's own title.
  const title = await page.locator('[data-part="app-title"]').boundingBox();
  await page.mouse.click(title.x + 4, title.y + title.height / 2);
  const after = await page.evaluate(() => {
    const day = document.querySelector('[data-part="streak-spot"] [data-part="week-day"][aria-current="date"]');
    return { state: document.querySelector('[data-part="streak-spot"] [data-part="character"]').getAttribute("data-state"), ink: day.hasAttribute("data-ink"), square: day.getAttribute("data-state") };
  });
  assert(after.state === "counted" && !after.ink && after.square === "studied", `a press should end it at once: ${JSON.stringify(after)}`);
  return "counted, the square studied, at the press";
});

await stage("Home before today counts (studied before, nothing yet today): Tinta by the streak, ready with its drip, clear of the words, a tap at his middle his", async () => {
  // The day's log gone (study/done.js's store), the app started fresh: what you studied stays, today doesn't count yet.
  await page.evaluate(() => localStorage.removeItem("lx.streak.v1"));
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.goto(`${BASE}/app/#today`);
  await page.waitForFunction(() => document.querySelector('[data-part="app-title"]')?.textContent.includes("Home"));
  const t = await look("today", '[data-part="streak-spot"]');
  assert(t, "no Tinta at the streak spot");
  assert(t.state === "ready", `before today counts it should be ready: ${t.state}`);
  assert(t.hidden && t.drawn && t.moved && t.pokeable && t.hitHim, `hidden, drawn, moving, a tap at his middle his: ${JSON.stringify(t)}`);
  assert(!t.covered.length, `it covers words at the streak: ${t.covered.join(" · ")}`);
  const strip = await page.locator('[data-part="streak-spot"] [data-part="week-strip"]').boundingBox();
  // At the far end of the streak's row, above the week, and apart from the flame: two drops side by side read alike.
  const flame = await page.locator('[data-part="streak-spot"] [data-part="streak"] > svg').boundingBox();
  assert(t.box.top + t.box.height <= strip.y + 1 && t.box.left + t.box.width <= strip.x + strip.width + 1, `it sits in the row above the week strip: ${JSON.stringify({ tinta: t.box, strip })}`);
  assert(t.box.left - (flame.x + flame.width) >= 120, `apart from the flame: ${JSON.stringify({ tinta: t.box, flame })}`);
  await shot("today-ready");
  return `ready at ${Math.round(t.box.width)} × ${Math.round(t.box.height)} px, at the far end of the row, moving, no words covered`;
});

await stage("Poked at the streak spot: a tap is his (the streak's link neither opens nor looks pressed); taps a beat apart the next in turn (splat, tickle, slide, splat, the grumpy squirt), one sooner dropped, a tap on him never ending his poke; back to ready after; a press elsewhere ends it at once; a run starts again after a rest", async () => {
  const sel = TINTA.today;
  await page.locator(sel).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  // Held down on his ink (a mouse, so it's held): the streak's link keeps its look (pressed, it dims to 0.7) and nothing opens.
  const held = await inkPoint(sel);
  assert(held?.on, `a point on his ink: ${JSON.stringify(held)}`);
  await page.mouse.move(held.x, held.y);
  await page.mouse.down();
  const look = await page.evaluate(() => getComputedStyle(document.querySelector('a[data-part="streak-spot"]')).opacity);
  await page.mouse.up();
  assert(look === "1", `held down on him, the streak's link shouldn't look pressed: opacity ${look}`);
  await page.waitForFunction((s) => document.querySelector(s).getAttribute("data-state") === "ready", sel, { timeout: 6000 });
  await page.waitForTimeout(4200); // a rest, so the run below starts with a splat
  const first = await pokeAt(sel, 0.25);
  assert(first.state === "poke" && first.hash === "#today", `a tap on him pokes him and opens nothing: ${JSON.stringify(first)}`);
  assert(first.run.length === 1 && first.run[0][1] === 0 && first.run[0][2] === -1, `the first a splat, on his left: ${JSON.stringify(first.run)}`);
  const svgAt = () => page.evaluate((s) => document.querySelector(s).querySelector("svg").innerHTML, sel);
  const drawn0 = await svgAt();
  await page.waitForTimeout(80);
  const sooner = await pokeAt(sel, 0.75);
  assert(sooner.run.length === 1 && sooner.same, `a tap sooner than a beat is dropped, the poke going on: ${JSON.stringify(sooner)}`);
  assert((await svgAt()) !== drawn0, "he moves as he's poked");
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(340);
    const now = await pokeAt(sel, 0.75);
    assert(now.same && now.state === "poke", `a tap on him never ends his poke: ${JSON.stringify(now)}`);
  }
  const run = await pokeState(sel);
  assert(run.run.map((p) => p[1]).join() === "0,1,2,3,4" && run.run.slice(1).every((p) => p[2] === 1), `five pokes, each the next in turn, on his right: ${JSON.stringify(run.run)}`);
  assert(run.hash === "#today", `nothing opened: ${run.hash}`);
  await shot("today-poked");
  await page.waitForFunction((s) => document.querySelector(s).getAttribute("data-state") === "ready", sel, { timeout: 8000 });
  // After a rest, a new run: a splat again. Then a press elsewhere ends it at once, as a press ends every animation.
  await page.waitForTimeout(4200);
  const again = await pokeAt(sel, 0.5);
  assert(again.state === "poke" && again.run[0][1] === 0, `after a rest a run starts again with a splat: ${JSON.stringify(again)}`);
  await page.waitForTimeout(200);
  const title = await page.locator('[data-part="app-title"]').boundingBox();
  await page.touchscreen.tap(title.x + 4, title.y + title.height / 2);
  const ended = await page.evaluate((s) => document.querySelector(s).getAttribute("data-state"), sel);
  assert(ended === "ready", `a press elsewhere ends the poke at once: ${ended}`);
  return `held: the link's opacity ${look}; a run ${run.run.map((p) => p[1]).join(" ")} at ${run.run.map((p) => p[0]).join(", ")} s; a press elsewhere ending it`;
});

await stage("A mending day: the throw ends straight into Tinta's mended pose, blended, with no jump", async () => {
  // A day missed after three studied, no rest day to cover it: today's two finished things mend it (know/streak.js),
  // and lex-retention's todayPose puts Tinta in its mended pose for the day. The day's throw hasn't played yet.
  await page.evaluate(async () => {
    const { finishedSession } = await import("/js/study/done.js");
    const { dayKey } = await import("/js/know/streak.js");
    localStorage.removeItem("lx.streak.v1");
    const noon = new Date(`${dayKey()}T12:00:00`).getTime();
    for (const back of [2, 3, 4]) finishedSession(noon - back * 86_400_000);
  });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => {
    const { finishedSession } = await import("/js/study/done.js");
    finishedSession(Date.now());
    finishedSession(Date.now() + 1000);
    localStorage.removeItem("lx.today.thrown");
  });
  const pose = await page.evaluate(async () => {
    const { todayPose } = await import("/js/know/today-pose.js");
    const { streakNow } = await import("/js/study/done.js");
    const { dayKey } = await import("/js/know/streak.js");
    return todayPose(streakNow(), dayKey())?.pose ?? null;
  });
  assert(pose === "mended", `the day should be a mended one: ${pose}`);
  await toTab("Study");
  await toTab("Home");
  // From the throw's start to well after it settles: the drop's outline every frame (its defs path, the compact
  // drawing's: its points), and the state it's in. A pose cut moves its points several units at once (counted to
  // mended: 5.9 on average, measured in the rig) while its extent hardly changes, so it's the points that are compared.
  // As it shows: mended breathes on the compositor (its breath the svg's transform, about its ground point, and its drawing
  // held between its pat, its look and a blink), so each frame's points are taken under the svg's live transform.
  const r = await page.evaluate(async () => {
    const spot = document.querySelector('[data-part="streak-spot"]');
    const node = spot.querySelector('[data-part="character"]');
    spot.scrollIntoView({ block: "center" });
    const extent = () => {
      const svg = node.querySelector(":scope > svg");
      const d = svg?.querySelector('defs path[id$="o"]')?.getAttribute("d");
      if (!d) return null;
      const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      // The breath's transform has no move of its own (character.js framesOf), so its 2×2 alone, on its units about the ground point.
      const live = getComputedStyle(svg).transform;
      const [a, b, c, e] = live === "none" ? [1, 0, 0, 1] : live.replace(/^matrix\(|\)$/g, "").split(",").map(Number);
      const out = [];
      for (let i = 0; i + 1 < n.length; i += 2) out.push(a * n[i] + c * n[i + 1], b * n[i] + e * n[i + 1]);
      return out;
    };
    const t0 = performance.now();
    let started = null;
    const frames = [];
    while (performance.now() - t0 < 6000) {
      const state = node.getAttribute("data-state");
      if (state === "throw" && started == null) started = performance.now();
      if (started != null) frames.push({ at: (performance.now() - started) / 1000, state, e: extent() });
      if (started != null && performance.now() - started > 4000) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { started: started != null, frames, end: node.getAttribute("data-state") };
  });
  assert(r.started, "the day's throw should play");
  assert(r.end === "mended", `it should settle in its mended pose: ${r.end}`);
  // The end of the throw and the first second after: the most the outline's points moved on the screen, on average,
  // between two frames in a row (a frame that shows nothing new is skipped).
  const last = r.frames.findLastIndex((f) => f.state === "throw");
  const near = r.frames.slice(Math.max(1, last - 12), Math.min(r.frames.length, last + 30)).filter((f) => f.e);
  let jump = 0, at = null, pairs = 0;
  for (let i = 1; i < near.length; i++) {
    const a = near[i - 1].e, b = near[i].e;
    if (a.length !== b.length) continue;
    const mean = b.reduce((sum, v, k) => sum + Math.abs(v - a[k]), 0) / b.length;
    if (mean === 0) continue;
    pairs++;
    if (mean > jump) [jump, at] = [mean, near[i].at];
  }
  assert(pairs > 10, `frames around the end that showed something new: ${pairs}`);
  assert(jump < 2, `no jump where the throw hands over to mended: its outline's points moved ${jump.toFixed(2)} units on average from one frame to the next at ${at?.toFixed(2)} s`);
  return `mended after the throw; around its end the outline's points, as shown (under its breath's transform), moved at most ${jump.toFixed(2)} units on average from one frame to the next (${pairs} frames)`;
});

await stage("Study: Tinta stands at your place on the strip, over your stop, clear of the words", async () => {
  await toTab("Study");
  const t = await look("study", '[data-part="path-strip"]');
  assert(t, "no Tinta on the strip");
  assert(t.hidden && t.drawn && t.moved && t.pokeable && t.hitHim, `hidden, drawn, moving, a tap at his middle his: ${JSON.stringify(t)}`);
  assert(!t.covered.length, `it covers words on the strip: ${t.covered.join(" · ")}`);
  const geo = await page.evaluate(() => {
    const stop = document.querySelector('[data-part="path-strip"] .lx-strip-here').getBoundingClientRect();
    const node = document.querySelector('[data-part="path-strip"] [data-part="character"]').getBoundingClientRect();
    return { off: Math.abs(node.left + node.width / 2 - (stop.left + stop.width / 2)), gap: stop.top - node.bottom };
  });
  assert(geo.off <= 1.5, `over your stop: ${JSON.stringify(geo)}`);
  assert(Math.abs(geo.gap) <= 6, `standing on it, not floating: ${JSON.stringify(geo)}`);
  // With the page at its top, all of its box inside the page's scroll area: nothing cuts its head off.
  const top = await page.evaluate(async () => {
    const scroller = document.querySelector('[data-part="page"]');
    scroller.scrollTop = 0;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const node = document.querySelector('[data-part="path-strip"] [data-part="character"]').getBoundingClientRect();
    return { tinta: node.top, page: scroller.getBoundingClientRect().top };
  });
  assert(top.tinta >= top.page - 0.5, `its head cut off by the page's top: ${JSON.stringify(top)}`);
  // A tap on him pokes him and the strip stays where it is; a tap on the strip's words opens the path, as before.
  const poked = await pokeAt(TINTA.study, 0.5);
  assert(poked.state === "poke" && poked.hash === "#study", `a tap on him on the strip pokes him and opens nothing: ${JSON.stringify(poked)}`);
  await page.locator('[data-part="path-strip"] .lx-path-strip-title').tap();
  await page.waitForFunction(() => location.hash !== "#study", null, { timeout: 5000 });
  const opened = await page.evaluate(() => location.hash);
  await toTab("Study");
  return `over your stop by ${geo.off.toFixed(1)} px, ${geo.gap.toFixed(1)} px off it, moving, no words covered; poked on the strip, its words opening ${opened}`;
});

// ---------- A breathing Tinta's sharpening track (character/sharpen.js): nothing that ends it shows him larger ----------
await stage("Study: a breathing Tinta's sharpening track never shows him larger: after a press elsewhere, motion.js's finishAll(), a theme change and back, and a tab switch and back, his scale is 1 and the track runs; finished, it ends at 1 (the keyframes from before, the control, end at 1.5)", async () => {
  // His scale as shown, and his tracks on scale (the sharpening one's keyframes pass 1).
  const read = () =>
    page.evaluate((sel) => {
      const node = document.querySelector(sel);
      if (!node) return null;
      const tracks = node.getAnimations().filter((a) => a.effect?.getKeyframes().some((k) => k.scale && k.scale !== "1" && k.scale !== "none"));
      return { scale: getComputedStyle(node).scale, breathing: node.hasAttribute("data-breathing"), tracks: tracks.map((a) => a.playState), height: Math.round(node.getBoundingClientRect().height) };
    }, TINTA.study);
  const shownAt1 = (r) => Boolean(r) && (r.scale === "1" || r.scale === "none");
  const seen = [];
  const at = async (what) => {
    await page.waitForTimeout(400);
    const r = await read();
    seen.push(`${what} ${r?.scale}`);
    assert(shownAt1(r) && r.breathing && r.tracks.length === 1 && r.tracks[0] === "running", `${what}: his scale 1, breathing, the track running: ${JSON.stringify(r)}`);
    return r;
  };
  const toStudy = async () => {
    await page.evaluate(() => (location.hash = "#study"));
    await page.waitForFunction((sel) => document.querySelector('[data-part="app-title"]')?.textContent.includes("Study") && document.querySelector(sel)?.hasAttribute("data-breathing"), TINTA.study, { timeout: 15_000 });
  };
  await toTab("Study");
  const first = await at("on Study");
  // A press elsewhere (motion.js finishes what it runs on every press), then its finishAll() itself.
  await page.touchscreen.tap(4, Math.round(first.height + 300));
  await at("a press elsewhere");
  await page.evaluate(async () => (await import("/js/lx/motion.js")).finishAll());
  await at("finishAll()");
  // A theme change (Settings → Appearance, a swatch pressed: the theme's picture wipes away from under Tinta there), Study again, then back.
  await page.evaluate(() => (location.hash = "#settings/appearance"));
  const swatch = (id) => page.locator(`[data-part="theme-swatch"][data-theme-id="${id}"]`).first();
  await page.waitForSelector('[data-part="theme-swatch"][aria-pressed="true"]', { timeout: 10_000 });
  const was = await page.locator('[data-part="theme-swatch"][aria-pressed="true"]').first().getAttribute("data-theme-id");
  const other = was === "paper" ? "sepia" : "paper";
  await swatch(other).click();
  await page.waitForFunction((id) => document.documentElement.getAttribute("data-theme") === id, other, { timeout: 5000 });
  await page.waitForTimeout(1500);
  await toStudy();
  await at(`a theme change (${was} → ${other})`);
  await page.evaluate(() => (location.hash = "#settings/appearance"));
  await swatch(was).click();
  await page.waitForFunction((id) => document.documentElement.getAttribute("data-theme") === id, was, { timeout: 5000 });
  await page.waitForTimeout(1500);
  await toStudy();
  await at(`the theme back (${was})`);
  // Another tab and back.
  await toTab("Home");
  await toTab("Study");
  await at("Home and back");
  // Its end shows 1: the track finished as a seek past it would.
  const ended = await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    const track = node.getAnimations().find((a) => a.effect?.getKeyframes().some((k) => k.scale && k.scale !== "1" && k.scale !== "none"));
    track.finish();
    const out = { scale: getComputedStyle(node).scale, state: track.playState };
    // The control: the keyframes from before, finished on the same Tinta, show him at 1.5; then gone.
    const old = node.animate([{ scale: "1" }, { scale: "1", offset: 0.999999 }, { scale: "1.5" }], { duration: 1e12, fill: "forwards" });
    old.finish();
    out.control = getComputedStyle(node).scale;
    old.cancel();
    out.after = getComputedStyle(node).scale;
    return out;
  }, TINTA.study);
  assert(shownAt1(ended), `finished, the track ends at 1: ${JSON.stringify(ended)}`);
  assert(ended.control === "1.5", `CONTROL: the keyframes from before, finished, show him at 1.5 (so this reading can fail): ${JSON.stringify(ended)}`);
  assert(shownAt1({ scale: ended.after }), `the control gone, back at 1: ${JSON.stringify(ended)}`);
  // Ended, it's started again at his next drawing (his next blink or glance at most: character.js startMotion).
  const back = await page
    .waitForFunction((sel) => document.querySelector(sel)?.getAnimations().some((a) => a.playState === "running" && a.effect?.getKeyframes().some((k) => k.scale && k.scale !== "1" && k.scale !== "none")), TINTA.study, { timeout: 15_000 })
    .then(() => true, () => false);
  assert(back, "ended, the sharpening track should start again at his next drawing");
  await at("started again");
  return `${seen.join(" · ")}; finished: ${ended.scale}; the control finished: ${ended.control}`;
});

// ---------- Knowledge: beside This week (know/week-tinta.js on cards-more.js's weekCard hook) ----------
const toKnow = async () => {
  await page.locator('[data-part="tab-bar"] [data-part="tab"][href="#know"]').first().click();
  await page.waitForFunction(() => location.hash === "#know" && document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="know-section"][data-card="week"]'), null, { timeout: 15_000 });
};
/**
 * This week, watched from the tap on Knowledge's tab for `ms`: Tinta's states (with when), when today's glass's number first changed and what it
 * went from and to, and the week's own number. The card's glasses only move once Tinta's ink has landed (cards-more.js waits on arrive()).
 */
const watchWeek = async (ms) => {
  await page.evaluate(() => {
    window.lxWeek = { t0: performance.now(), states: [], counts: [] };
    const sample = () => {
      const w = window.lxWeek;
      if (!w) return;
      const card = document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="know-section"][data-card="week"]');
      const node = card?.querySelector('[data-part="week-tinta"] [data-part="character"]');
      const state = node?.getAttribute("data-state") ?? null;
      const n = card?.querySelector('.lx-glass-col[aria-current="date"] .lx-glass-n')?.textContent ?? null;
      const at = performance.now() - w.t0;
      if (w.states.at(-1)?.state !== state) w.states.push({ state, at });
      if (w.counts.at(-1)?.n !== n) w.counts.push({ n, at });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await toKnow();
  // The card as it is now (a redraw in place puts in a new one): in the middle of the screen, its glasses clear of the tab bar.
  await page.evaluate(() => document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="know-section"][data-card="week"]')?.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const w = window.lxWeek;
    window.lxWeek = null;
    const card = document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="know-section"][data-card="week"]');
    return { ...w, done: card?.querySelector(".lx-know-n")?.textContent ?? null };
  });
};
const weekSeen = () => page.evaluate(() => JSON.parse(localStorage.getItem("lx.know.weekSeen") ?? "null"));

await stage("Knowledge: Tinta beside This week's number, idle on a first look (nothing to compare with), hidden, moving, a tap at his middle his, clear of the words; the glasses fill as they come in, no throw", async () => {
  await page.evaluate(() => (window.lxActs.length = 0));
  const w = await watchWeek(2500);
  const t = await look("know", '[data-part="know-section"]');
  assert(t, "no Tinta beside This week");
  assert(t.state === "idle" && t.hidden && t.drawn && t.moved && t.pokeable && t.hitHim, `idle, hidden, drawn, moving, a tap at his middle his: ${JSON.stringify(t)}`);
  assert(!t.covered.length, `he covers words on the card: ${t.covered.join(" · ")}`);
  const slot = await page.evaluate(() => {
    const b = document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="week-tinta"]')?.getBoundingClientRect();
    return b ? { width: b.width, height: b.height } : null;
  });
  // His box is his drawing's (128 × 130 units): 64 tall is 63 wide, in the card's 64 × 64 place.
  assert(Math.abs(t.box.width - (64 * 128) / 130) < 0.6 && Math.round(t.box.height) === 64 && slot && Math.round(slot.width) === 64 && Math.round(slot.height) === 64, `64 tall in a 64 × 64 place: ${JSON.stringify({ tinta: t.box, slot })}`);
  assert(!w.states.some((s) => s.state === "throw"), `no throw on a first look: ${JSON.stringify(w.states)}`);
  const acts = await page.evaluate(() => window.lxActs.filter((a) => a.place === "know"));
  assert(!acts.length, `no act: ${JSON.stringify(acts)}`);
  const seen = await weekSeen();
  const lang = Object.keys(seen ?? {})[0];
  assert(seen?.[lang] && String(seen[lang].done) === w.done.replace(/\D/g, ""), `the week's number taken as seen: ${JSON.stringify({ seen, done: w.done })}`);
  await shot("know-idle");
  return `idle at ${Math.round(t.box.left)},${Math.round(t.box.top)}, ${Math.round(t.box.width)} px, moving, no words covered; seen ${w.done}`;
});

await stage("Knowledge after a session: Tinta, holding his drip, throws it into today's glass as the glasses come in; today's glass rises from the ink's landing, not before; then idle", async () => {
  await playSession();
  await page.evaluate(() => (window.lxActs.length = 0));
  const before = await weekSeen();
  const w = await watchWeek(4500);
  const THROW_IMPACT = await page.evaluate(async () => (await import("/js/character/rig/inkdrop/today-throw.js")).THROW_IMPACT);
  const throwAt = w.states.find((s) => s.state === "throw")?.at;
  assert(w.states.some((s) => s.state === "ready") && throwAt != null, `ready, then a throw: ${JSON.stringify(w.states)}`);
  const acts = await page.evaluate(() => window.lxActs.filter((a) => a.place === "know"));
  assert(acts.length === 1 && acts[0].name === "throw" && acts[0].targets[0] === "lx-glass", `one throw, at today's glass: ${JSON.stringify(acts)}`);
  // Today's glass shows what it showed before until the ink lands, then rises.
  // From the first number it shows (the card may come in a frame after the tap).
  const first = w.counts.find((c) => c.n != null && c.n !== "");
  const rose = w.counts.find((c) => first && c.at > first.at && Number(c.n) > Number(first.n))?.at ?? null;
  assert(rose != null, `today's glass rises: ${JSON.stringify(w.counts)}`);
  const after = (rose - throwAt) / 1000;
  assert(Math.abs(after - THROW_IMPACT) < 0.3, `today's glass rises as the ink lands (${THROW_IMPACT} s into the throw): it rose ${after.toFixed(2)} s in (${JSON.stringify({ throwAt, counts: w.counts })})`);
  assert(w.states.at(-1).state === "idle", `then idle: ${JSON.stringify(w.states)}`);
  const seen = await weekSeen();
  const lang = Object.keys(seen)[0];
  assert(Number(seen[lang].done) > Number(before?.[lang]?.done ?? 0) && seen[lang].thrown, `the new number seen and today's throw kept: ${JSON.stringify({ before, seen })}`);
  await shot("know-after-throw");
  return `ready → throw ${Math.round(throwAt)} ms after the tab; today's glass rose ${after.toFixed(2)} s into it (impact ${THROW_IMPACT}); idle; ${before?.[lang]?.done} → ${seen[lang].done}`;
});

await stage("Knowledge after another session the same day: no second throw; today's glass rises on its own", async () => {
  await playSession();
  await page.evaluate(() => (window.lxActs.length = 0));
  const w = await watchWeek(3000);
  assert(!w.states.some((s) => s.state === "throw" || s.state === "ready"), `no second throw the same day: ${JSON.stringify(w.states)}`);
  const acts = await page.evaluate(() => window.lxActs.filter((a) => a.place === "know"));
  assert(!acts.length, `no act: ${JSON.stringify(acts)}`);
  assert(w.counts.length > 1, `today's glass still moves with its new number: ${JSON.stringify(w.counts)}`);
  return `idle throughout; today's glass ${w.counts[0].n} → ${w.counts.at(-1).n}`;
});

// ---------- Study's strip: his hop to your new place (study/strip-hop.js, the rig's inkdrop/hop-to.js) ----------
const stripSeen = () => page.evaluate(() => JSON.parse(localStorage.getItem("lx.study.stripSeen") ?? "null"));
/**
 * Study loaded afresh, every frame for `ms`: the strip's Tinta's state, his drawing's middle across, the stops' middles, kinds and sizes,
 * where the line ends and the strip's drawing as markup. press: a key pressed (a press, as motion.js takes one) once the line has inked
 * a fifth of the way to your place.
 */
const watchStrip = async (ms, { press = false } = {}) => {
  await page.evaluate(() => sessionStorage.setItem("lx.check.watchStrip", "1"));
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  // From the strip's first drawn frame (a slow start can take longer than the watch itself).
  await page.waitForFunction(() => window.lxStrip?.length > 0, null, { timeout: 10_000 });
  if (press) {
    await page.waitForFunction(() => window.lxStripInking, null, { timeout: 8000, polling: "raf" });
    await page.keyboard.press("Shift");
  }
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    sessionStorage.removeItem("lx.check.watchStrip");
    return window.lxStrip ?? [];
  });
};
await page.addInitScript(() => {
  if (sessionStorage.getItem("lx.check.watchStrip") !== "1") return;
  window.lxStrip = [];
  const t0 = performance.now();
  const NOT_DRAWN = new Set(["defs", "clipPath", "mask", "title", "desc"]);
  const look = () => {
    const strip = document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="path-strip"]');
    const node = strip?.querySelector('[data-part="character"]');
    const svg = node?.querySelector(":scope > svg");
    if (svg?.querySelector("path")) {
      let l = Infinity, r = -Infinity;
      for (const c of svg.children) {
        if (NOT_DRAWN.has(c.localName)) continue;
        const b = c.getBoundingClientRect();
        if (!b.width && !b.height) continue;
        l = Math.min(l, b.left);
        r = Math.max(r, b.right);
      }
      const drawing = strip.querySelector("svg.lx-strip");
      const stops = [...drawing.querySelectorAll("circle")].map((c) => {
        const b = c.getBoundingClientRect(), s = getComputedStyle(c), r = Number(c.getAttribute("r"));
        // How far it's drawn out: its radius and half its stroke (a ring of 10 with a stroke of 4 reaches 12, a blot of 7 reaches 7).
        return { x: b.left + b.width / 2, kind: c.getAttribute("class"), r, outer: r + (s.stroke === "none" ? 0 : parseFloat(s.strokeWidth) / 2) };
      });
      // The line's end: its box's right (a path's box is its shape's, without the stroke's round cap).
      const line = drawing.querySelector(".lx-strip-done")?.getBoundingClientRect().right ?? null;
      const f = { at: Math.round(performance.now() - t0), state: node.getAttribute("data-state"), x: (l + r) / 2, stops, line, html: drawing.innerHTML };
      window.lxStrip.push(f);
      const here = stops.findIndex((s) => s.kind === "lx-strip-here");
      if (f.state === "hop-to" && here >= 0 && stops[here + 1] && line > stops[here].x + (stops[here + 1].x - stops[here].x) * 0.2) window.lxStripInking = true;
    }
    // 6 s from its first frame recorded (a slow start can take longer than that to draw the strip), 30 s at most.
    window.lxStripFrom ??= window.lxStrip.length ? performance.now() : null;
    if (performance.now() - t0 < 30_000 && (window.lxStripFrom === null || performance.now() - window.lxStripFrom < 6000)) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
});

await stage("Study after a lesson: from the strip's first frame Tinta stands over the stop before your new place on the old progress, then hops onto your place once the strip is on the screen, the new segment inking in under him and landing with him, and stands there idle on doors.js's own drawing; a press mid-hop puts it all at your place at once; once a place; none with less motion", async () => {
  await toTab("Study");
  // A lesson played through (its door on Study, every step by the shared player, Done): back on Study, he hops to the new place.
  await page.evaluate(() => (window.lxStates.length = 0));
  await page.locator('[data-part="page"]:not([data-ghost]) [data-part="study-door"][data-door="lesson"]').first().click();
  await page.waitForSelector(SESSION);
  await playToSummary(page, { session: SESSION });
  await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page, { session: SESSION });
  await page.waitForFunction((s) => !document.querySelector(s), SESSION, { timeout: 15_000 });
  await page.waitForTimeout(3000);
  const back = await page.evaluate(() => window.lxStates.filter((x) => x.place === "study").map((x) => x.state));
  assert(back.includes("hop-to") && back.at(-1) === "idle", `back on Study after a lesson he hops to his new place: ${back.join(" → ") || "nothing"}`);
  const seen = await stripSeen();
  const key = Object.keys(seen ?? {}).find((k) => Number.isFinite(seen[k]) && seen[k] >= 1);
  assert(key, `the strip's place taken as seen on Study: ${JSON.stringify(seen)}`);
  const here = seen[key];
  // The strip as doors.js draws it for your place, with nothing to hop (the place already seen): what every frame off the hop must show.
  const plainFrames = await watchStrip(800);
  assert(plainFrames.length, "no frames of the strip with nothing to hop");
  const plain = plainFrames[0].html;
  assert(plainFrames.every((f) => f.html === plain && f.state !== "hop-to"), `with nothing to hop, doors.js's drawing in every frame: ${[...new Set(plainFrames.map((f) => f.state))].join(", ")}`);
  // As if a lesson had been finished since: the place this device saw, one before yours.
  await page.evaluate(([k, v]) => localStorage.setItem("lx.study.stripSeen", JSON.stringify({ [k]: v })), [key, here - 1]);
  const frames = await watchStrip(3500);
  assert(frames.length > 20, `frames of the strip: ${frames.length}`);
  const first = frames[0], last = frames.at(-1);
  const at = last.stops.findIndex((s) => s.kind === "lx-strip-here");
  assert(at >= 1, `your place's stop, with one before it: ${JSON.stringify(last.stops)}`);
  const from = first.stops[at - 1].x, to = first.stops[at].x, gap = from - to;
  assert(first.state === "hop-to", `his first drawn frame is the hop's (standing over the stop before yours): ${first.state}`);
  // The first frame: the old progress (the line to the stop he stands on, that stop your place's ring, yours a plain stop ahead).
  const old = { leave: first.stops[at - 1], land: first.stops[at], line: first.line };
  assert(old.leave.kind === "lx-strip-here" && old.leave.r === 10 && old.land.kind === "lx-strip-next" && old.land.r === 6 && Math.abs(old.line - from) < 1,
    `the strip's first frame shows the old progress: ${JSON.stringify(old)} (stop before ${from.toFixed(1)})`);
  assert(Math.abs(first.x - last.x - gap) < 4, `he starts over the stop before yours and ends on yours: moved ${(last.x - first.x).toFixed(1)} px, the stops ${(-gap).toFixed(1)} apart`);
  assert(last.state === "idle", `then idle: ${frames.map((f) => f.state).filter((s, i, a) => s !== a[i - 1]).join(" → ")}`);
  let worst = 0;
  for (let i = 1; i < frames.length; i++) worst = Math.max(worst, Math.abs(frames[i].x - frames[i - 1].x));
  assert(worst < Math.abs(gap) / 2, `no jump across between frames: worst ${worst.toFixed(1)} px for a ${Math.abs(gap).toFixed(1)} px hop`);
  // In flight the line's end is under him (his drawing's middle, less where it stood over each stop), never behind or ahead by more than
  // a few px (his lean as he lands moves his drawing's middle up to 2.2 px off the place he's at, measured on the rig at 40 px), and it
  // only ever grows, by no more than his own steps.
  const offFrom = first.x - from, offTo = last.x - to;
  const flight = frames.filter((f) => f.state === "hop-to" && f.line > from + 0.5 && f.line < to - 0.5);
  assert(flight.length >= 4, `frames with the line between the stops: ${flight.length}`);
  const under = flight.map((f) => { const p = (f.line - from) / (to - from); return f.x - (offFrom + (offTo - offFrom) * p) - f.line; });
  const most = Math.max(...under.map(Math.abs));
  assert(most < 4, `the line's end under him in flight: worst ${most.toFixed(2)} px off (${under.map((u) => u.toFixed(1)).join(" ")})`);
  let back2 = 0, step = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].line === null || frames[i - 1].line === null) continue;
    back2 = Math.max(back2, frames[i - 1].line - frames[i].line);
    step = Math.max(step, frames[i].line - frames[i - 1].line);
  }
  assert(back2 < 0.5 && step < Math.abs(gap) / 2, `the line only grows, smoothly: back ${back2.toFixed(2)} px, worst step ${step.toFixed(1)} px`);
  // The two stops change size smoothly as drawn (no pop: 12 for your place's ring, 7 a blot or a plain stop), the one he lands on a little
  // past your place's ring and back.
  let pop = 0, peak = 0;
  for (let i = 1; i < frames.length; i++) for (const s of [at - 1, at]) pop = Math.max(pop, Math.abs(frames[i].stops[s].outer - frames[i - 1].stops[s].outer));
  for (const f of frames) peak = Math.max(peak, f.stops[at].outer);
  assert(pop < 2.5 && peak <= 12.6, `the stops grow and shrink smoothly as drawn: worst ${pop.toFixed(2)} a frame, your place's ring out to at most ${peak.toFixed(2)}`);
  // Landed: doors.js's own drawing, exactly, and in every frame off the hop.
  const off = frames.filter((f) => f.state !== "hop-to");
  assert(off.length && off.every((f) => f.html === plain), `once he's off the hop the strip is doors.js's own drawing: ${off.filter((f) => f.html !== plain).length} of ${off.length} frames not`);
  const landedAt = frames.findIndex((f) => f.html === plain);
  assert(landedAt > 0 && frames.slice(landedAt).every((f) => f.html === plain), `the strip, once back to doors.js's drawing, stays it`);
  const after = await stripSeen();
  assert(after?.[key] === here, `your place taken as seen: ${JSON.stringify(after)}`);
  // A press mid-hop: he's at your place, the strip with him, in the same frame.
  await page.evaluate(([k, v]) => localStorage.setItem("lx.study.stripSeen", JSON.stringify({ [k]: v })), [key, here - 1]);
  const pressed = await watchStrip(1200, { press: true });
  const ends = pressed.findIndex((f, i) => i && f.state !== "hop-to" && pressed[i - 1].state === "hop-to");
  assert(ends > 0, `the press ends the hop: ${pressed.map((f) => f.state).filter((s, i, a) => s !== a[i - 1]).join(" → ")}`);
  const before = pressed[ends - 1];
  assert(before.line > from + 1 && before.line < to - 1, `pressed mid-ink: the line at ${before.line.toFixed(1)} between ${from.toFixed(1)} and ${to.toFixed(1)}`);
  assert(pressed.slice(ends).every((f) => f.html === plain && f.state !== "hop-to"), `from the press's frame on, doors.js's own drawing: ${pressed.slice(ends).filter((f) => f.html !== plain).length} frames not`);
  // Once a place: Study again, no hop, the plain drawing throughout.
  const again = await watchStrip(1500);
  assert(again.length && again.every((f) => f.state !== "hop-to" && f.html === plain), `no second hop for the same place: ${[...new Set(again.map((f) => f.state))].join(", ")}`);
  // With less motion (the device's setting): no hop, he stands on your place on the plain drawing, and the place is taken as seen all the same.
  await page.evaluate(([k, v]) => localStorage.setItem("lx.study.stripSeen", JSON.stringify({ [k]: v })), [key, here - 1]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const still = await watchStrip(1200);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert(still.length && still.every((f) => f.state !== "hop-to" && f.html === plain), `no hop with less motion, the plain drawing: ${[...new Set(still.map((f) => f.state))].join(", ")}`);
  const stillSeen = await stripSeen();
  assert(stillSeen?.[key] === here, `with less motion the place is taken as seen: ${JSON.stringify(stillSeen)}`);
  return `hop-to from the first frame on the old progress, ${(-gap).toFixed(1)} px onto yours (moved ${(last.x - first.x).toFixed(1)}), the line under him (worst ${most.toFixed(2)} px over ${flight.length} frames), stops worst ${pop.toFixed(2)} a frame (peak ${peak.toFixed(2)}), doors.js's drawing from frame ${landedAt}; a press mid-ink at once; once; none with less motion`;
});

await stage("A tap in his box beside his drop isn't his: the link around him takes it, looking pressed while it's down and opening (Home's streak spot, Study's path strip)", async () => {
  const said = [];
  /** A wait that says which it was when it runs out. */
  const waitFor = (what, fn, arg, timeout = 8000) =>
    page.waitForFunction(fn, arg, { timeout }).catch((error) => {
      throw new Error(`waiting for ${what}: ${error.message.split("\n")[0]}`);
    });
  /** Drawn and not mid-act (a throw or a poke): he's standing where he stands. */
  const standing = (sel) => waitFor(`${sel} standing`, (s) => { const t = document.querySelector(s); return t?.querySelector("svg path") && !["throw", "poke", "hop-to"].includes(t.getAttribute("data-state")); }, sel);
  /** A press held beside his drop and let go: how the link looked before and while it was down, and where it went. */
  const onPage = (sel) => `[data-part="page"]:not([data-ghost]) ${sel}`;
  // Into view by the element itself (a locator can be left holding a node a redraw replaced).
  const into = (sel) => page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), sel);
  const beside = async (selector, link, prop) => {
    await into(selector);
    await page.waitForTimeout(300);
    const p = await inkPoint(selector, { beside: true });
    assert(p && !p.on, `a point in his box beside his ink: ${JSON.stringify(p)}`);
    const { href, rest } = await page.evaluate(([l, prop]) => ({ href: document.querySelector(l).getAttribute("href"), rest: getComputedStyle(document.querySelector(l))[prop] }), [link, prop]);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    const down = await page.evaluate(([l, s, prop]) => ({ look: getComputedStyle(document.querySelector(l))[prop], poking: document.querySelector(s).hasAttribute("data-poking"), state: document.querySelector(s).getAttribute("data-state") }), [link, selector, prop]);
    await page.mouse.up();
    await page.waitForFunction((h) => location.hash === h, href, { timeout: 5000 }).catch(() => {});
    const hash = await page.evaluate(() => location.hash);
    assert(down.look !== rest && !down.poking, `held beside his drop, the link looks pressed (${prop} ${rest} → ${down.look}) and he isn't poked: ${JSON.stringify(down)}`);
    assert(hash === href, `let go, the link opens: ${hash}, its href ${href}`);
    said.push(`${link.match(/data-part="([^"]+)"\]$/)?.[1] ?? link}: ${prop} ${rest} → ${down.look}, opened ${hash}`);
  };
  await toTab("Home");
  await standing(onPage(TINTA.today));
  await beside(onPage(TINTA.today), onPage('a[data-part="streak-spot"]'), "opacity");
  await toTab("Study");
  await standing(onPage(TINTA.study));
  await beside(onPage(TINTA.study), onPage('[data-part="path-strip"]'), "backgroundColor");
  await toTab("Study");
  return said.join("; ");
});

await stage("AI tab: on Practice with me's floor, beside your AI; scribbling while your AI works on a request; catching the answer, then beside again", async () => {
  await toTab("AI");
  const t = await look("ai", '[data-part="ai-practice"]');
  assert(t, "no Tinta on the Practice card");
  assert(t.state === "beside" && t.hidden && t.drawn && t.moved && t.pokeable && t.hitHim, `beside, hidden, drawn, moving, a tap at his middle his: ${JSON.stringify(t)}`);
  const poked = await pokeAt(TINTA.ai, 0.5);
  assert(poked.state === "poke" && poked.hash === "#ai", `a tap on him beside your AI pokes him and starts nothing: ${JSON.stringify(poked)}`);
  await page.waitForFunction((sel) => document.querySelector(sel).getAttribute("data-state") === "beside", TINTA.ai, { timeout: 6000 });
  assert(!t.covered.length, `it covers words on the Practice card: ${t.covered.join(" · ")}`);
  // A question, sent as the "…" menu sends one (the page has no field of its own); the AI (this check, over MCP) takes it, then answers.
  await page.evaluate(async () => (await import("/js/ai/client.js")).createRequest({ kind: "ask", what: "What does gezellig mean?", about: { where: "ai" } }));
  const since = await page.evaluate(() => performance.now());
  const waitFor = (state, ms) =>
    page.evaluate(
      async ([state, ms, since]) => {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          if (window.lxStates.some((s) => s.place === "ai" && s.state === state && s.at >= since)) return true;
          await new Promise((r) => setTimeout(r, 50));
        }
        return false;
      },
      [state, ms, since],
    );
  const { waiting } = await tool("list_requests", {});
  const ask = waiting.find((r) => r.kind === "ask");
  assert(ask, `the question should reach the AI: ${JSON.stringify(waiting).slice(0, 300)}`);
  const taken = await tool("take_request", { request_id: ask.request_id });
  assert(await waitFor("scribble", 10_000), "it should scribble while your AI is on it");
  await shot("ai-scribble");
  // Busy scribbling, he takes no poke (his pad has no pose to layer one on), and the tap opens nothing either.
  const busy = await pokeAt(TINTA.ai, 0.5);
  assert(busy.state === "scribble" && busy.hash === "#ai", `scribbling, a tap neither pokes him nor opens anything: ${JSON.stringify(busy)}`);
  await tool("finish_request", { request_id: ask.request_id, seat: taken.seat, answer: "It means cosy: [[gezellig]]." });
  assert(await waitFor("catch", 10_000), "it should catch the answer when it's done");
  // Then beside your AI again: the catch's own end, after it (a state recorded before the catch doesn't count).
  const back = await page.evaluate(async (since) => {
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      const states = window.lxStates.filter((s) => s.place === "ai" && s.at >= since);
      const caught = states.findLastIndex((s) => s.state === "catch");
      if (caught >= 0 && states.slice(caught + 1).some((s) => s.state === "beside")) return { states: states.map((s) => s.state), after: (states.at(-1).at - states[caught].at) / 1000 };
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }, since);
  assert(back, "after the catch it should be beside your AI again");
  assert(back.after > 1.5, `the catch should play out (about 2.3 s) before it's beside again: ${back.after.toFixed(2)} s`);
  // Its box and the card's words, while it scribbles too (the pad draws at its right, inside its box).
  const t2 = await look("ai", '[data-part="ai-practice"]');
  assert(!t2.covered.length, `it covers words on the Practice card: ${t2.covered.join(" · ")}`);
  return `${back.states.join(" → ")} (the catch ${back.after.toFixed(2)} s)`;
});

await stage("Explore: the pack to start stands face-out with its cover, and Tinta leaves it to that", async () => {
  await toTab("Explore");
  await page.waitForSelector(".lx-face", { timeout: 15_000 });
  assert(await page.locator('.lx-face [data-part="pack-cover"]').count(), "no cover on the pack to start");
  assert(!(await page.locator('.lx-pick[data-pick] [data-part="character"]').count()), "Tinta beside the pack to start");
  await shot("explore-present");
  return "its cover, no Tinta";
});

await stage("Loading: a slow page's Loading… has Tinta writing loops of ink, shown once the wait has lasted; the page takes it away", async () => {
  // Explore's search, its packs by name held back until this has looked (a pack's own page now holds its place as it loads, with no
  // Loading…; search still waits with it: explore.js searchResults, ui.loadingState).
  let release;
  const held = new Promise((r) => (release = r));
  const slow = (url) => new URL(url).pathname === "/api/community/items";
  await page.route(slow, async (route) => {
    await held;
    // Let go once the stage is done with it; the page may have given up on it meanwhile (retried or aborted: lx/retry.js), which handled it.
    await route.continue().catch(() => {});
  });
  try {
    await page.evaluate(() => (location.hash = `#explore/search?${new URLSearchParams({ q: "water", lang: "nl" })}`));
    const seen = await page.evaluate(async () => {
      const t0 = performance.now();
      let node = null;
      while (performance.now() - t0 < 3000 && !(node = document.querySelector('[data-part="empty-state"][data-state="loading"] > [data-part="character"]'))) await new Promise((r) => requestAnimationFrame(r));
      if (!node) return null;
      const opacity = () => Number(getComputedStyle(node).opacity);
      const shown = performance.now();
      const early = opacity();
      await new Promise((r) => setTimeout(r, 150));
      const stillEarly = opacity();
      await new Promise((r) => setTimeout(r, 750));
      const late = opacity();
      const svg = node.querySelector("svg");
      const a = svg.innerHTML;
      await new Promise((r) => setTimeout(r, 400));
      const words = node.parentElement.textContent.trim();
      return { state: node.getAttribute("data-state"), hidden: node.getAttribute("aria-hidden") === "true", early, stillEarly, late, moved: svg.innerHTML !== a, loops: (svg.innerHTML.match(/fill="none"/g) ?? []).length, words, at: shown - t0 };
    });
    assert(seen, "no Tinta in the page's Loading…");
    assert(seen.state === "writing" && seen.hidden && seen.moved && seen.loops > 0, `writing loops of ink, hidden, moving: ${JSON.stringify(seen)}`);
    assert(seen.early < 0.05 && seen.stillEarly < 0.05 && seen.late > 0.95, `shown only once the wait has lasted 0.4 s: ${JSON.stringify(seen)}`);
    assert(seen.words === "Loading…", `its words: ${seen.words}`);
    await shot("loading");
    release();
    const gone = await page.evaluate(async () => {
      const t0 = performance.now();
      const loading = () => document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="empty-state"][data-state="loading"]');
      while (performance.now() - t0 < 5000 && loading()) await new Promise((r) => setTimeout(r, 50));
      return !loading() && !document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="character"][data-state="writing"]');
    });
    assert(gone, "the page should replace the Loading… and its Tinta when it comes");
    return `writing, ${seen.loops} line(s) of loops; opacity ${seen.early.toFixed(2)} → ${seen.late.toFixed(2)} after the 0.4 s wait; gone when the page came`;
  } finally {
    release();
    // A request still held is let go by its own handler: unrouting mustn't throw over it ("Route is already handled!").
    await page.unroute(slow, { behavior: "ignoreErrors" });
  }
});

await stage("The shell's loading, before any of the app's code: Tinta writing above the words, after a second", async () => {
  // A page whose app code never comes: the static page alone. Its own context, signed in as this one (its cookies),
  // with no service worker (route() never sees what a worker answers, and this one's worker has the app's code).
  const alone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block" });
  await alone.addCookies(await context.cookies());
  const shell = await alone.newPage();
  shell.on("pageerror", (e) => problems.push(`shell page error: ${e.message}`));
  await shell.route((url) => new URL(url).pathname === "/js/shell/main.js", (route) => route.abort());
  try {
    await shell.goto(`${BASE}/app/`);
    const at = (ms) =>
      shell.evaluate(async (ms) => {
        await new Promise((r) => setTimeout(r, ms));
        const box = document.querySelector(".lx-loading");
        const svg = box?.querySelector(".lx-loading-tinta");
        const loops = svg?.querySelector(".lx-loading-loops");
        const body = svg?.querySelector('[class*="sp-f-drop-body"]');
        return {
          visible: box ? getComputedStyle(box).visibility : null,
          svg: Boolean(svg),
          height: svg?.getBoundingClientRect().height ?? 0,
          ink: body ? getComputedStyle(body).fill : null,
          writing: loops ? loops.getAnimations().length : null,
          words: box?.textContent.trim() ?? null,
        };
      }, ms);
    const early = await at(300);
    const late = await at(1100);
    assert(early.visible === "hidden", `nothing before a second: ${JSON.stringify(early)}`);
    assert(late.visible === "visible" && late.svg && late.height > 40 && late.words === "Loading Lexicommons…", `Tinta above the words after a second: ${JSON.stringify(late)}`);
    assert(late.ink === "rgb(124, 92, 230)", `in its ink on the dark theme (#7C5CE6): ${late.ink}`);
    assert(late.writing > 0, `its line of loops writing itself: ${JSON.stringify(late)}`);
    await shell.screenshot({ path: join(OUT, "shots", "shell-loading.png") });
    return `hidden at 0.3 s; at 1.1 s Tinta ${Math.round(late.height)} px above "${late.words}", in ${late.ink}, its loops writing`;
  } finally {
    await alone.close();
  }
});

await stage("The tab bar's lens: a bubble over the current tab and a purple copy clipped to it; a change stretches it over on two springs with the links standing still; a press mid-move lands on the tab under the finger; with animations off it's just there", async () => {
  await toTab("Home");
  await page.waitForTimeout(700);
  const where = () =>
    page.evaluate(() => {
      const nav = document.querySelector('[data-part="tab-bar"]');
      const bubble = nav.querySelector(".lx-tab-bubble"), lens = nav.querySelector(".lx-tab-lens");
      const tab = nav.querySelector('[data-part="tab"][data-state="active"]');
      const b = bubble.getBoundingClientRect(), t = tab.getBoundingClientRect(), n = nav.getBoundingClientRect();
      // What the clip leaves showing, from its own numbers: what's seen in purple.
      const m = getComputedStyle(lens).clipPath.match(/inset\(([\d.]+)px ([\d.]+)px ([\d.]+)px ([\d.]+)px/);
      const clip = m ? { left: n.left + nav.clientLeft + Number(m[4]), right: n.left + nav.clientLeft + nav.clientWidth - Number(m[2]) } : null;
      return {
        tab: tab.textContent.trim(),
        bubbles: nav.querySelectorAll(".lx-tab-bubble").length,
        offLeft: Math.abs(b.left - t.left),
        offRight: Math.abs(b.right - t.right),
        clipOff: clip ? Math.max(Math.abs(clip.left - b.left), Math.abs(clip.right - b.right)) : null,
        lensColor: getComputedStyle(lens).color,
        tabColor: getComputedStyle(tab).color,
        otherColor: getComputedStyle(nav.querySelector('[data-part="tab"]:not([data-state="active"])')).color,
        takesPresses: [bubble, lens].some((node) => getComputedStyle(node).pointerEvents !== "none"),
        words: [...lens.querySelectorAll(".lx-tab-lens-item")].map((item) => item.textContent.trim()).join(),
        links: [...nav.querySelectorAll('[data-part="tab"]')].filter((a) => a.offsetWidth).map((a) => a.textContent.trim()).join(),
      };
    });
  const before = await where();
  assert(before.bubbles === 1 && before.offLeft < 1 && before.offRight < 1, `one bubble, on the current tab: ${JSON.stringify(before)}`);
  assert(before.clipOff < 1, `the purple copy shows through exactly the bubble: ${JSON.stringify(before)}`);
  assert(before.lensColor === "rgb(166, 140, 255)" && before.lensColor !== before.tabColor && before.tabColor === before.otherColor, `purple only through the lens, every link gray under it: ${JSON.stringify(before)}`);
  assert(!before.takesPresses, "the lens takes no presses");
  assert(before.words === before.links, `the copy has the same tabs as the row: ${before.words} / ${before.links}`);
  // Home → Explore, its box and every link's every frame from the tap.
  await page.evaluate(() => {
    window.lxLens = [];
    const nav = document.querySelector('[data-part="tab-bar"]');
    const links = [...nav.querySelectorAll('[data-part="tab"]')].filter((a) => a.offsetWidth);
    const t0 = performance.now();
    const rec = () => {
      const r = nav.querySelector(".lx-tab-bubble").getBoundingClientRect();
      window.lxLens.push({ left: r.left, right: r.right, height: r.height, at: performance.now() - t0, links: links.map((a) => a.getBoundingClientRect().left) });
      if (performance.now() - t0 < 900) requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);
  });
  const homeBox = await tab("Home").boundingBox();
  await tab("Explore").click();
  await page.waitForTimeout(1000);
  const path = await page.evaluate(() => window.lxLens);
  const end = await tab("Explore").boundingBox();
  const restWidth = end.width;
  const moved = path.filter((p) => Math.abs(p.left - end.x) > 1);
  const widest = Math.max(...path.map((p) => p.right - p.left)), thinnest = Math.min(...path.map((p) => p.height));
  assert(moved.length >= 4, `it should move over (frames on its way): ${moved.length}`);
  assert(Math.abs(path[0].left - homeBox.x) < 12, `from where it was (Home's): ${JSON.stringify(path[0])}`);
  assert(widest > restWidth * 1.3 && thinnest < path[0].height - 2, `it stretches and thins on its way: widest ${widest.toFixed(1)} px of ${restWidth.toFixed(1)}, ${thinnest.toFixed(1)} px tall`);
  // Its far edge overshoots the tab it's going to and comes back.
  assert(Math.max(...path.map((p) => p.right)) > end.x + end.width + 0.5, `a little overshoot: ${Math.max(...path.map((p) => p.right)).toFixed(1)} past ${(end.x + end.width).toFixed(1)}`);
  const last = path.at(-1);
  assert(Math.abs(last.left - end.x) < 1 && Math.abs(last.right - (end.x + end.width)) < 1, `settled on Explore: ${JSON.stringify(last)}`);
  const stood = path.every((p) => p.links.every((x, k) => Math.abs(x - path[0].links[k]) < 0.01));
  assert(stood, "a link moved while the bubble did");
  // A press 100 ms into a move lands on the tab under the finger, and the bubble turns there from where it was.
  await tab("Home").click();
  await page.waitForTimeout(100);
  await tab("Study").click();
  await page.waitForFunction(() => document.querySelector('[data-part="app-title"]')?.textContent.includes("Study"));
  await page.waitForTimeout(800);
  const study = await where();
  assert(study.tab === "Study" && study.offLeft < 1 && study.offRight < 1 && study.clipOff < 1, `the press mid-move went to Study, the bubble on it: ${JSON.stringify(study)}`);
  // Animations off: no move, just there.
  await page.evaluate(() => document.documentElement.setAttribute("data-motion", "off"));
  await tab("AI").click();
  await page.waitForFunction(() => document.querySelector('[data-part="app-title"]')?.textContent.includes("AI"));
  await page.waitForFunction(() => document.querySelector('[data-part="tab"][data-state="active"]')?.textContent.includes("AI"));
  const off = await where();
  await page.evaluate(() => document.documentElement.removeAttribute("data-motion"));
  assert(off.tab === "AI" && off.offLeft < 1 && off.offRight < 1, `with animations off it's just there: ${JSON.stringify(off)}`);
  return `${moved.length} frames on its way, widest ${widest.toFixed(1)} px, thinnest ${thinnest.toFixed(1)} px, the links still; the press mid-move went to Study; just there with animations off`;
});

await stage("Animations off: a still in every place, and no throw", async () => {
  await page.evaluate(() => document.documentElement.setAttribute("data-motion", "off"));
  const held = {};
  await toKnow();
  {
    const t = await look("know", null);
    held.know = t && !t.moved && t.drawn && t.state === "idle";
  }
  for (const [tabName, place] of [["Study", "study"], ["AI", "ai"], ["Home", "today"]]) {
    await toTab(tabName);
    const t = await look(place, null);
    held[place] = t && !t.moved && t.drawn;
  }
  assert(Object.values(held).every(Boolean), `every place still: ${JSON.stringify(held)}`);
  // A tap on him does nothing at all: no poke, nothing opened.
  const still = await pokeAt(TINTA.today, 0.5);
  assert(still.state !== "poke" && still.hash === "#today", `with animations off a tap on him does nothing: ${JSON.stringify(still)}`);
  // Today counting again (a session finished now, as study/done.js records one), its throw not yet played.
  await page.evaluate(async () => {
    const { finishedSession } = await import("/js/study/done.js");
    finishedSession(Date.now());
    localStorage.removeItem("lx.today.thrown");
  });
  await toTab("Study");
  await toTab("Home");
  const w = await watchThrow(1500);
  const key = await thrownKey();
  assert(w.started == null && w.inkAt == null, `no throw with animations off: ${JSON.stringify(w)}`);
  assert(key.stored === key.today, `the day's throw is marked as done, so it never plays later: ${JSON.stringify(key)}`);
  await page.evaluate(() => document.documentElement.removeAttribute("data-motion"));
  return "still in all five (Knowledge's idle), a tap doing nothing; no throw, the day marked";
});

await stage("Looking it up (ui.lookingUp, Translate's wait): Tinta beside its words with its magnifier, clear of them, inside its box, no presses; fades in; gone 50 ms after it came, nothing left running; a still with animations off", async () => {
  await page.goto(`${BASE}/design/`);
  // Attached, not visible: a drawing's first path is its outline in <defs>, which is never rendered itself.
  await page.waitForSelector('[data-part="looking-up"] [data-part="character"] svg path', { state: "attached", timeout: 15_000 });
  const demos = await page.evaluate(async () => {
    const out = [];
    for (const row of document.querySelectorAll('[data-part="looking-up"]')) {
      // On the screen as the page sees it (character.js draws a Tinta only once its observer has seen it in view; on /design, busy with
      // its start, that can come after 300 ms), then a moment drawing. /design can still move under it after the scroll (its pictures
      // coming in above: 7 Nov, in view at 92 ms and out of view by 800), and a Tinta out of view rightly stops drawing, so a row that
      // isn't seen drawing is brought into view again and watched again, up to 3 times.
      const tries = [];
      let node, svg, before;
      for (let attempt = 0; attempt < 3; attempt++) {
        row.scrollIntoView({ block: "center" });
        const shown = row.querySelector('[data-part="character"]');
        const w0 = performance.now();
        for (; !shown.visible && performance.now() - w0 < 2000; ) await new Promise((r) => setTimeout(r, 50));
        const waited = Math.round(performance.now() - w0);
        await new Promise((r) => setTimeout(r, 300));
        node = row.querySelector('[data-part="character"]');
        svg = node.querySelector("svg");
        before = svg.innerHTML;
        const f0 = node.stats?.frames ?? null;
        await new Promise((r) => setTimeout(r, 500));
        const top = Math.round(row.getBoundingClientRect().top);
        tries.push({ waited, visible: node.visible, top, inView: top > -40 && top < innerHeight, draws: (node.stats?.frames ?? 0) - (f0 ?? 0), hidden: document.hidden, kept: node.hasAttribute("data-first-pending"), last: Math.round(performance.now() - (node.last ?? 0)), born: node.born === undefined ? "page" : node.born === null ? "null" : "set" });
        if (svg.innerHTML !== before) break;
      }
      const why = { tries };
      const b = node.getBoundingClientRect();
      const lens = svg.querySelector("[data-lens]")?.getBoundingClientRect();
      const words = row.querySelector("span:not([data-part])");
      const range = document.createRange();
      range.selectNodeContents(words);
      const text = [...range.getClientRects()];
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      out.push({
        state: node.getAttribute("data-state"),
        size: Math.round(b.height),
        hidden: node.getAttribute("aria-hidden") === "true",
        moved: svg.innerHTML !== before,
        lensInside: lens ? lens.right <= b.right + 0.5 && lens.left >= b.left - 0.5 && lens.top >= b.top - 0.5 : false,
        clear: text.every((r) => r.left >= b.right - 0.5),
        pressedThrough: !hit || !node.contains(hit),
        words: words.textContent,
        ...(svg.innerHTML !== before ? {} : { why }),
      });
    }
    return out;
  });
  assert(demos.length >= 2, `its two forms on /design: ${demos.length}`);
  for (const d of demos) assert(d.state === "lookup" && d.hidden && d.moved && d.lensInside && d.clear && d.pressedThrough, `looking it up: ${JSON.stringify(d)}`);
  // Built, then gone 50 ms later (a fast answer): it fades in from nothing, and leaves nothing running or broken.
  const quick = await page.evaluate(async () => {
    const ui = await import("/js/lx/ui.js");
    const motion = await import("/js/lx/motion.js");
    // Other demos on the page run their own (a download bar's pour): what counts is that this one leaves none.
    const before = motion.runningCount();
    const row = ui.lookingUp();
    document.body.append(row);
    const node = row.querySelector('[data-part="character"]');
    await new Promise((r) => requestAnimationFrame(r));
    const first = Number(getComputedStyle(node).opacity);
    await new Promise((r) => setTimeout(r, 50));
    row.remove();
    await new Promise((r) => setTimeout(r, 400));
    const kept = ui.lookingUp("Looking online too…", { size: 32 });
    document.body.append(kept);
    await new Promise((r) => setTimeout(r, 300));
    const settled = Number(getComputedStyle(kept.querySelector('[data-part="character"]')).opacity);
    kept.remove();
    return { first, settled, before, running: motion.runningCount(), connected: node.isConnected };
  });
  assert(quick.first < 0.6 && quick.settled === 1, `it fades in: ${JSON.stringify(quick)}`);
  assert(quick.running <= quick.before && !quick.connected, `gone 50 ms after it came, nothing of its own left running: ${JSON.stringify(quick)}`);
  // Animations off: there at once, its still.
  const off = await page.evaluate(async () => {
    const ui = await import("/js/lx/ui.js");
    document.documentElement.setAttribute("data-motion", "off");
    const row = ui.lookingUp();
    document.body.append(row);
    const node = row.querySelector('[data-part="character"]');
    const t0 = performance.now();
    while (performance.now() - t0 < 3000 && !node.querySelector("svg path")) await new Promise((r) => setTimeout(r, 30));
    const opacity = Number(getComputedStyle(node).opacity);
    const a = node.querySelector("svg").innerHTML;
    await new Promise((r) => setTimeout(r, 500));
    const still = node.querySelector("svg").innerHTML === a;
    row.remove();
    document.documentElement.removeAttribute("data-motion");
    return { opacity, still };
  });
  assert(off.opacity === 1 && off.still, `with animations off it's there at once, still: ${JSON.stringify(off)}`);
  await page.screenshot({ path: join(OUT, "shots", "looking-up.png") });
  return `${demos.map((d) => `${d.size} px beside "${d.words}"`).join(", ")}: moving, its glass inside its box, clear of the words; fades in (${quick.first.toFixed(2)} at the first frame); gone at 50 ms with nothing running; still with animations off`;
});

await stage("A new learner on a phone: Tinta in Home's first view; after lesson 1 it's at the streak right under Your progress, and it throws there with no scrolling", async () => {
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const freshSeen = await wholeWatch(fresh);
  const learner = await fresh.newPage();
  const freshCdp = await fresh.newCDPSession(learner);
  await freshCdp.send("WebAuthn.enable");
  await freshCdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await learner.goto(`${BASE}/app/`);
  await learner.waitForURL(/\/login\?next=/);
  await learner.click("summary");
  await learner.fill('input[name="name"]', "Tinta New Learner");
  await learner.click('#register button[type="submit"]');
  await learner.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
  await learner.waitForSelector("html[data-app-ready]");
  await learner.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  const firstView = () => learner.evaluate(() => {
    const onPage = (n) => n.checkVisibility() && Boolean(n.closest('[data-part="page"]'));
    const bar = document.querySelector('[data-part="tab-bar"]').getBoundingClientRect();
    const tintas = [...document.querySelectorAll('[data-part="page"] [data-part="character"]')].filter(onPage).map((n) => {
      const b = n.getBoundingClientRect();
      return { state: n.getAttribute("data-state"), top: Math.round(b.top), bottom: Math.round(b.bottom), inView: b.top >= 0 && b.bottom <= bar.top };
    });
    const spot = document.querySelector('[data-part="streak-spot"]');
    const s = spot.getBoundingClientRect();
    let scrolled = 0;
    for (let n = spot.parentElement; n; n = n.parentElement) scrolled += n.scrollTop;
    const section = spot.closest(".lx-today-progress");
    return { tintas, scrolled, spot: { top: Math.round(s.top), bottom: Math.round(s.bottom), inView: s.top >= 0 && s.bottom <= bar.top }, barTop: Math.round(bar.top), before: [...section.children].map((n) => n.getAttribute("data-part") ?? n.className) };
  });
  // A brand-new account: nothing studied.
  await learner.evaluate(() => (location.hash = "#today"));
  await learner.waitForSelector('[data-part="streak-spot"]');
  await learner.waitForTimeout(800);
  const atFirst = await firstView();
  await learner.screenshot({ path: join(OUT, "shots", "new-learner-today.png") });
  assert(atFirst.tintas.some((t) => t.inView), `a brand-new account's first view has a Tinta: ${JSON.stringify(atFirst)}`);
  // Lesson 1 from Study's door, with real presses.
  await learner.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: "Study" }).first().click();
  await learner.waitForSelector('[data-part="page"] [data-part="study-door"]');
  await learner.waitForTimeout(400);
  await learner.locator('[data-part="page"] [data-part="study-door"]').first().click();
  await learner.waitForSelector(SESSION);
  const session = learner.locator(SESSION);
  // Played by the shared player, each step by its kind with real presses (a hand-rolled Match here once looked its tiles up in WORDS,
  // and a tile showing another form threw).
  await playToSummary(learner, { session: SESSION });
  assert(await learner.locator(`${SESSION} [data-part="session-summary"]`).count(), "lesson 1 should end in its summary");
  await session.getByRole("button", { name: "Done" }).click();
  await pastReminderAsk(learner, { session: SESSION });
  await learner.waitForSelector(SESSION, { state: "detached" }).catch(() => {});
  // Today's tab: nothing scrolled, ever, from here. The states as they come, from the press on.
  const states = learner.evaluate(async () => {
    const out = []; const t0 = performance.now();
    while (performance.now() - t0 < 7000) {
      const node = document.querySelector('[data-part="streak-spot"] [data-part="character"]');
      const state = node?.getAttribute("data-state") ?? null;
      if (state && out.at(-1)?.state !== state) out.push({ state, at: Math.round(performance.now() - t0) });
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  });
  await learner.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: "Home" }).first().click();
  await learner.waitForSelector('[data-part="streak-spot"] [data-part="character"]');
  await learner.waitForTimeout(1200);
  await learner.screenshot({ path: join(OUT, "shots", "new-learner-today-throw.png") });
  const seen = await states;
  await learner.screenshot({ path: join(OUT, "shots", "new-learner-today-after-lesson.png") });
  const after = await firstView();
  assert(after.scrolled === 0, `nothing should have scrolled: ${after.scrolled}`);
  assert(after.spot.inView, `the streak spot is in the first view on 844: ${JSON.stringify(after.spot)}, the tab bar at ${after.barTop}`);
  assert(after.tintas.some((t) => t.inView), `a Tinta in the first view: ${JSON.stringify(after.tintas)}`);
  assert(after.before[1] === "streak-spot", `right under Your progress: ${after.before.join(", ")}`);
  const order = seen.map((s) => s.state).join(" → ");
  assert(seen.some((s) => s.state === "throw"), `it should throw with no scrolling: ${order}`);
  assert(seen.at(-1).state === "counted", `it should settle counted: ${order}`);
  // A shorter screen: under the tab bar it waits, and it plays once it's clear.
  await learner.setViewportSize({ width: 390, height: 600 });
  await learner.evaluate(() => localStorage.removeItem("lx.today.thrown"));
  await learner.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: "Study" }).first().click();
  await learner.waitForSelector('[data-part="page"] [data-part="study-door"]');
  await learner.waitForTimeout(300);
  await learner.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: "Home" }).first().click();
  await learner.waitForSelector('[data-part="streak-spot"] [data-part="character"]');
  await learner.waitForTimeout(1500);
  const short = await learner.evaluate(() => {
    const node = document.querySelector('[data-part="streak-spot"] [data-part="character"]');
    const bar = document.querySelector('[data-part="tab-bar"]').getBoundingClientRect();
    return { state: node.getAttribute("data-state"), kept: localStorage.getItem("lx.today.thrown"), hidden: node.getBoundingClientRect().bottom > bar.top };
  });
  assert(short.hidden && short.state !== "throw" && !short.kept, `under the tab bar it should wait: ${JSON.stringify(short)}`);
  const later = await learner.evaluate(async () => {
    const node = document.querySelector('[data-part="streak-spot"] [data-part="character"]');
    document.querySelector('[data-part="streak-spot"]').scrollIntoView({ block: "center" });
    const t0 = performance.now();
    while (performance.now() - t0 < 2000 && node.getAttribute("data-state") !== "throw") await new Promise((r) => requestAnimationFrame(r));
    return node.getAttribute("data-state");
  });
  assert(later === "throw", `once it's clear of the tab bar it should throw: ${later}`);
  await learner.waitForTimeout(3200);
  const cut = wholeReport(freshSeen);
  assert(cut.length === 0, `${cut.length} cut: ${cut.slice(0, 6).join(" | ")}`);
  await learner.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
  await fresh.close();
  return `new account: ${atFirst.tintas.map((t) => `${t.state} at y ${t.top}`).join(", ")}; after lesson 1: the spot at y ${after.spot.top}–${after.spot.bottom} (tab bar ${after.barTop}), ${order}, nothing scrolled; 600 tall: it waited under the tab bar, threw once clear`;
});

await stage("Every Tinta on the way stayed whole (nothing cut it, on any frame)", async () => {
  const cut = wholeReport(wholeSeen);
  writeFileSync(join(OUT, "whole-cut.txt"), `${cut.join("\n")}\n`);
  assert(cut.length === 0, `${cut.length} cut: ${cut.slice(0, 10).join(" | ")}`);
});

await stage("no console errors or page errors", async () => {
  assert(problems.length === 0, problems.join(" | "));
});

writeFileSync(join(OUT, "tinta-tabs-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
// The test account and the curator go, and the pack with them.
await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
await asCurator("DELETE", "/api/me", { confirm: "delete my account" });
console.log(`${results.length - failed}/${results.length} stages passed`);
await browser.close();
process.exit(failed ? 1 : 0);
