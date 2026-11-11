// Tinta's acts in the app (docs/design-system.md, "Tinta's acts"; the acts are rig/splat/acts.js, run by the part's
// perform()), on a phone, on a LOCAL server (it creates and deletes a test account):
// - a download (part download-bar): Tinta pours itself into the bar and is its fill to the front while it comes in,
//   comes out of the far end when it's done, and settles there; the bar's own fill shows the progress whatever Tinta
//   does; a press ends Tinta's act at once and the bar goes on; with animations off it stands still on the bar; it
//   takes no presses. On /design's demo, then the real places: Whisper's download (Settings → Study → Speaking), a
//   book from the shelf opening, and a library pack's recordings kept for offline (its page).
// Every browser comes from quiet-browser.mjs: nothing makes a sound. Downloads are slowed in the browser (page.route)
// so each can be watched; nothing is changed on the server's side but the local library the check seeds itself.
//
// Usage (headless Chrome, so through gpu.py's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta acts check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/tinta-acts-check.mjs http://localhost:<port> <outDir> --persist-to <its state dir>
//     [--only design,whisper,book,recordings]                                                         (exit 0 = pass)
// A stage that needs what the local server or the browser hasn't got (the open library's books; a Whisper download on
// offer) says so and is skipped; --require-all fails it instead.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";
import { wholeReport, wholeWatch } from "./tinta-whole.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const VALUED = new Set(["--persist-to", "--only"]);
const [BASE, outArg = "tinta-acts-check-out"] = args.filter((a, i) => !a.startsWith("--") && !VALUED.has(args[i - 1]));
const OUT = resolve(outArg);
const PERSIST = flag("--persist-to") && resolve(flag("--persist-to"));
const ONLY = flag("--only")?.split(",") ?? null;
const REQUIRE_ALL = args.includes("--require-all");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("tinta-acts-check creates and deletes an account: give it a local server, e.g. http://localhost:8824");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
const problems = [];
let failed = 0;
let skipped = 0;
class Skip extends Error {}
const wanted = (part) => !ONLY || ONLY.includes(part);
async function stage(name, fn, part = null) {
  if (part && !wanted(part)) return;
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - t, detail });
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    if (error instanceof Skip && !REQUIRE_ALL) {
      skipped++;
      results.push({ stage: name, ok: true, skipped: true, ms: Date.now() - t, detail: error.message });
      console.log(`skip  ${name}: ${error.message}`);
      return;
    }
    failed++;
    results.push({ stage: name, ok: false, ms: Date.now() - t, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};

const browser = await chromium.launch({ headless: true, channel: "chrome" });
// No service worker: a request it answers never reaches page.route, so the downloads couldn't be slowed to be watched
// (the offline copy is sw-check's).
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
const wholeSeen = await wholeWatch(context); // every Tinta this check meets, every frame: nothing cuts it (tinta-whole.mjs)
// The "…" is off unless it's been turned on (ai/ask.js): its failures are acted here with it on.
await context.addInitScript(() => localStorage.setItem("lx.ai.ask-anywhere.v1", "on"));
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

/** Slows every response whose path matches `pattern`: each waits `ms` before it's handed over (the real bytes). */
async function slow(pattern, ms) {
  const handler = async (route) => {
    // A request the page gave up on while it waited (Stop aborts a download) is already handled: leave it.
    try {
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, ms));
      await route.fulfill({ response });
    } catch {}
  };
  await page.route(pattern, handler);
  return () => page.unroute(pattern, handler);
}

/**
 * A download bar and its Tinta, every frame for `ms`: Tinta's state, the bar's state and value, and where things are
 * on the screen: Tinta's box, what it draws (the union of its drawing's pieces), the track and the bar's own fill.
 */
const watchBar = (selector, ms) =>
  page.evaluate(async ({ selector, ms }) => {
    const rect = (r) => (r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null);
    const inkOf = (svg) => {
      let u = null;
      for (const node of svg?.querySelectorAll("path, circle, ellipse, rect, polygon") ?? []) {
        const r = node.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        u = u ? { l: Math.min(u.l, r.left), t: Math.min(u.t, r.top), r: Math.max(u.r, r.right), b: Math.max(u.b, r.bottom) } : rect(r);
      }
      return u;
    };
    const out = [];
    const t0 = performance.now();
    let same = null;
    while (performance.now() - t0 < ms) {
      await new Promise((r) => requestAnimationFrame(r));
      const bar = document.querySelector(selector);
      if (!bar) {
        out.push({ t: performance.now() - t0, gone: true });
        continue;
      }
      same ??= bar;
      const tinta = bar.querySelector(':scope > [data-part="character"]');
      out.push({
        t: performance.now() - t0,
        node: bar === same,
        bar: bar.getAttribute("data-state") ?? "running",
        value: Number(bar.getAttribute("aria-valuenow")),
        state: tinta?.getAttribute("data-state"),
        drawing: tinta?.querySelector("svg")?.innerHTML.length ?? 0,
        box: rect(tinta?.getBoundingClientRect()),
        ink: inkOf(tinta?.querySelector("svg")),
        track: rect(bar.querySelector(".lx-download-track")?.getBoundingClientRect()),
        fill: rect(bar.querySelector(".lx-download-fill")?.getBoundingClientRect()),
      });
    }
    return out;
  }, { selector, ms });

/**
 * The frames while Tinta was the bar's fill (from 0.65 s into its act, once it has poured itself in): its drawing runs
 * along the track from its near end to the bar's own fill's front, no taller than the track and a little.
 */
function checkPouring(frames, what) {
  const start = frames.find((f) => f.state === "pour")?.t ?? Infinity;
  const pouring = frames.filter((f) => f.state === "pour" && f.t >= start + 650 && f.value >= 15 && f.value <= 90 && f.ink && f.track && f.fill);
  assert(pouring.length >= 10, `${what}: it should pour itself into the bar while it downloads (${pouring.length} frames at 15–90% pouring)`);
  const bad = pouring.filter((f) => {
    const h = f.track.b - f.track.t;
    return Math.abs(f.ink.l - f.track.l) > 3 || f.ink.r < f.fill.r - 1.5 || f.ink.b - f.ink.t > h + 7 || f.ink.b < f.track.t || f.ink.t > f.track.b;
  });
  assert(bad.length <= 1, `${what}: in ${bad.length} of ${pouring.length} frames its ink wasn't the fill: ${JSON.stringify(bad[0])}`);
  return pouring.length;
}
/** It takes no presses: what's under the middle of its box and of the track is never Tinta. */
const takesNoPresses = (selector) =>
  page.evaluate((selector) => {
    const bar = document.querySelector(selector);
    const tinta = bar.querySelector(':scope > [data-part="character"]');
    const at = (r) => document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return [at(tinta.getBoundingClientRect()), at(bar.querySelector(".lx-download-track").getBoundingClientRect())].every((hit) => !hit || !(hit === tinta || tinta.contains(hit)));
  }, selector);

// ---------- /design ----------

const DEMO = ".ds-download";
const DEMO_BAR = `${DEMO} [data-part="download-bar"]`;
const demoButton = (name) => page.locator(`${DEMO} button`, { hasText: name }).first();

await stage("/design: the download bar's demo, Tinta pouring itself in as the fill, out of the far end at 100%, settled there", async () => {
  await page.goto(`${BASE}/design/#tinta-acts`);
  const found = await page.waitForSelector(DEMO, { timeout: 8000 }).then(() => true, () => false);
  assert(found, "no download bar demo on /design (#tinta-acts .ds-download)");
  await page.locator(DEMO).scrollIntoViewIfNeeded();
  await demoButton("Download").click();
  const frames = await watchBar(DEMO_BAR, 5200);
  writeFileSync(join(OUT, "design-frames.json"), JSON.stringify(frames));
  const first = frames.findIndex((f) => f.state === "pour");
  assert(first >= 0 && frames[first].t < 200, `it should start pouring at once (first pour at ${frames[first]?.t?.toFixed(0)} ms)`);
  const pouring = checkPouring(frames, "the demo");
  const done = frames.findIndex((f) => f.bar === "done");
  assert(done > 0, "the demo's download should finish");
  const d = frames[done];
  assert(Math.abs(d.box.r - d.track.r) <= 1.5, `once it's done its box should sit on the far end: box right ${d.box.r.toFixed(1)}, track right ${d.track.r.toFixed(1)}`);
  const after = frames.slice(done).filter((f) => f.t - d.t > 0.3e3 && f.t - d.t < 0.9e3 && f.ink);
  assert(after.length && after.every((f) => (f.ink.l + f.ink.r) / 2 > d.track.r - (d.box.r - d.box.l)), "coming out, it should be at the far end");
  const settled = frames.find((f) => f.t - d.t > 2100);
  assert(settled?.state === "idle", `it should be settled by 2.1 s after the end (state ${settled?.state})`);
  assert(settled.ink.l >= settled.box.l - 6 && settled.ink.r <= settled.box.r + 6, "settled, it's back inside its own box");
  assert(frames.every((f) => f.node), "the demo's bar should stay the same element");
  assert(await takesNoPresses(DEMO_BAR), "Tinta takes presses");
  await page.screenshot({ path: join(OUT, "design-done.png") });
  return `pouring from ${frames[first].t.toFixed(0)} ms, ${pouring} frames as the fill; done at ${d.t.toFixed(0)} ms, on the far end; idle by +2.1 s; no presses`;
}, "design");

await stage("/design: a press ends Tinta's act at once, and the bar goes on filling", async () => {
  await demoButton("Download").click();
  await page.waitForFunction((s) => document.querySelector(s)?.querySelector('[data-part="character"]')?.getAttribute("data-state") === "pour", DEMO_BAR, { timeout: 2000 });
  await page.waitForTimeout(900);
  const before = Number(await page.locator(DEMO_BAR).getAttribute("aria-valuenow"));
  // A press on nothing in particular (the demo's own label), by touch.
  const label = await page.locator(`${DEMO} .ds-download-note`).boundingBox();
  await page.touchscreen.tap(label.x + 4, label.y + label.height / 2);
  const frames = await watchBar(DEMO_BAR, 900);
  assert(frames[0].state !== "pour", `the press should end its act at once (state ${frames[0].state})`);
  assert(frames.every((f) => f.state !== "pour"), "it should stay ended");
  assert(frames.at(-1).value > before, `the bar should go on (${before} → ${frames.at(-1).value})`);
  const f = frames.at(-1);
  assert(f.ink.l >= f.box.l - 6 && f.ink.r <= f.box.r + 6, "ended, it's itself on the bar's near end");
  await page.waitForFunction((s) => document.querySelector(s)?.getAttribute("data-state") === "done", DEMO_BAR, { timeout: 6000 });
  return `ended at once; the bar ${before}% → ${f.value}% after`;
}, "design");

await stage("/design: with animations off, Tinta stands still on the bar while it fills", async () => {
  await page.evaluate(() => document.documentElement.setAttribute("data-motion", "off"));
  await demoButton("Download").click();
  const frames = await watchBar(DEMO_BAR, 2000);
  await page.waitForFunction((s) => document.querySelector(s)?.getAttribute("data-state") === "done", DEMO_BAR, { timeout: 6000 });
  const end = (await watchBar(DEMO_BAR, 200)).at(-1);
  await page.evaluate(() => document.documentElement.removeAttribute("data-motion"));
  const live = frames.filter((f) => !f.gone);
  const changes = live.filter((f, i) => i && f.drawing !== live[i - 1].drawing).length;
  assert(live.every((f) => f.state !== "pour"), "no act with animations off");
  assert(changes === 0, `its still should hold: ${changes} changes`);
  assert(live.at(-1).value > live[0].value, "the bar should fill");
  assert(Math.abs(end.box.r - end.track.r) <= 1.5, "done, it stands on the far end");
  return `${live.length} frames, the still unchanged, the bar ${live[0].value}% → ${live.at(-1).value}%`;
}, "design");

// ---------- the app ----------

await stage("sign up with a passkey", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Tinta Places");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
  await page.waitForSelector("html[data-app-ready]");
  // The "…" needs an AI to answer it, as well as the switch (a token will do).
  await page.evaluate(() => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "an AI, for this check" }) }));
  return "signed in";
});

const goSettings = async (hash, text) => {
  await page.goto(`${BASE}/app/${hash}`);
  await page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout: 10_000 });
};

await stage("Settings → Study → Speaking: Whisper's download, Tinta pouring into its bar; Stop", async () => {
  await goSettings("#settings/study/speaking", "Recognizer");
  const start = page.getByRole("button", { name: /^(Download Whisper|Finish downloading Whisper)\b/ }).first();
  if (!(await start.count())) throw new Skip("this browser offers no Whisper download here");
  const unslow = await slow("**/models/**", 450);
  try {
    await start.click();
    const BAR = '[data-part="list-row"] [data-part="download-bar"]';
    const appeared = await page.waitForSelector(BAR, { timeout: 4000 }).then(() => true, () => false);
    assert(appeared, "no download bar in Whisper's row");
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT, "whisper-pouring.png") });
    const frames = await watchBar(BAR, 3500);
    writeFileSync(join(OUT, "whisper-frames.json"), JSON.stringify(frames));
    const live = frames.filter((f) => !f.gone);
    const first = live.findIndex((f) => f.state === "pour");
    assert(first >= 0, "Tinta should pour itself into Whisper's bar");
    assert(live.slice(first).every((f) => f.node && f.state === "pour"), "the row redraws with each piece: the bar and its Tinta should stay the same, pouring all along");
    assert(live.at(-1).value >= live[first].value, "the bar should fill");
    const stop = page.locator('[data-part="list-row"] button', { hasText: "Stop" }).first();
    await stop.click();
    await page.waitForFunction((s) => !document.querySelector(s) || document.querySelector(s).getAttribute("data-state") === "stopped", BAR, { timeout: 4000 });
    return `${live.length - first} frames pouring at ${live[first].value}–${live.at(-1).value}%, the same bar throughout; Stop ended it`;
  } finally {
    await unslow();
  }
}, "whisper");

await stage("Read: a book from the shelf opening: its bar on the cover, plain (no Tinta: the step into reading); none in the reader", async () => {
  await page.goto(`${BASE}/app/#read`);
  await page.waitForSelector("html[data-app-ready]");
  const catalog = await page.evaluate(async () => (await (await fetch("/library/catalogue.json", { cache: "no-cache" })).json()).books ?? []).catch(() => []);
  if (!catalog.length) throw new Skip("the local server has no open library (scripts/books/seed-local-library.sh)");
  const tile = page.locator('.lx-read-shelf [data-part="book-tile"]').first();
  await tile.waitFor({ timeout: 10_000 });
  const unslow = await slow("**/library/{books,weaves,layers,definitions}/**", 1500);
  try {
    await tile.scrollIntoViewIfNeeded();
    await tile.click();
    const BAR = '.lx-read-shelf [data-part="book-tile"] [data-part="book-cover"] > [data-part="download-bar"]';
    assert(await page.waitForSelector(BAR, { timeout: 3000 }).then(() => true, () => false), "no download bar on the book's cover while it comes");
    const variant = await page.locator(BAR).getAttribute("data-variant");
    const frames = await watchBar(BAR, 1200);
    writeFileSync(join(OUT, "book-frames.json"), JSON.stringify(frames));
    await page.screenshot({ path: join(OUT, "book-bar.png") });
    const live = frames.filter((f) => !f.gone);
    assert(variant === "plain", `the book's bar should be the plain one (variant ${variant})`);
    assert(live.length >= 10, `the bar should stay while the book comes (${live.length} frames)`);
    assert(live.every((f) => f.state === undefined && !f.box), "opening a book is the step into reading: the bar has no Tinta");
    await page.waitForFunction(() => /^#read\/(book|open)/.test(location.hash) || document.querySelector('[data-part="reader"]'), null, { timeout: 15_000 });
    await page.waitForTimeout(500);
    const inReader = await page.evaluate(() => document.querySelectorAll('[data-part="reader"] [data-part="character"]').length);
    assert(inReader === 0, `no Tinta in the reader (found ${inReader})`);
    return `the plain bar on the cover for ${live.length} frames (${live[0].value}% → ${live.at(-1).value}%); the book opened; no Tinta in it`;
  } finally {
    await unslow();
  }
}, "book");

await stage("a library pack's recordings: its page shows the bar while they're kept, Tinta out of the far end at the end; gone on the next visit", async () => {
  if (!PERSIST) throw new Skip("give --persist-to <the server's state dir> to seed a pack with recordings");
  const scratch = mkdtempSync(join(tmpdir(), "tinta-acts-"));
  try {
    const made = join(scratch, "starter-audio");
    execFileSync("node", [join(APP, "scripts/packs/audio-v2.mjs"), join(APP, "public/audio/starter-word-order"), "--pack", join(APP, "public/js/packs/starter-word-order.js"), "--out", made, "--license", "For the check only", "--credit", "{name}, a voice for the check"], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
    const out = execFileSync("node", [join(APP, "scripts/packs/seed-local.mjs"), join(APP, "public/js/packs/starter-word-order.js"), "--persist-to", PERSIST, "--audio", join(made, "manifest.json"), "--clips", join(made, "clips")], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
    assert(/recordings: \d+ voice\(s\), \d+ clips/.test(out), out);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  const unslow = await slow("**/library/audio/**", 120);
  try {
    await goSettings("#settings/study/packs/starter-word-order", "About it");
    // The sync brings the pack with its recordings, and keeping starts (packs.js does that a little after each sync,
    // in the background; started here at once).
    await page.evaluate(async () => {
      const packs = await import("/js/study/packs.js");
      // What keeping says, for the failure message.
      window.lxKeepLog = [];
      packs.onKeeping((id, now) => window.lxKeepLog.push([Math.round(performance.now()), id, now.have, now.total, now.done ? "done" : now.stopped ?? ""]));
      // Nothing kept yet, so they all come now: one run, the one the bar shows.
      await caches.delete("lx-audio-v1");
      await packs.syncLibraryPacks();
      packs.keepRecordingsForOffline();
    });
    const BAR = '[data-part="download-bar"]';
    assert(await page.waitForSelector(BAR, { timeout: 8000 }).then(() => true, () => false), "no bar on the pack's page while its recordings are kept");
    const frames = await watchBar(BAR, 2500);
    await page.screenshot({ path: join(OUT, "recordings-pouring.png") });
    assert(frames.some((f) => f.state === "pour"), "Tinta should pour itself into the recordings' bar");
    await page.waitForFunction((s) => document.querySelector(s)?.getAttribute("data-state") === "done", BAR, { timeout: 60_000 });
    const end = await watchBar(BAR, 2400);
    await page.screenshot({ path: join(OUT, "recordings-done.png") });
    const d = end[0];
    assert(Math.abs(d.box.r - d.track.r) <= 1.5, "done, it should sit on the far end");
    assert(end.at(-1).state === "idle", "and settle there");
    const row = await page.evaluate(() => document.querySelector('[data-part="download-bar"]')?.closest('[data-part="list-row"]')?.innerText ?? null);
    const log = await page.evaluate(() => (window.lxKeepLog ?? []).filter((e, i, all) => i < 3 || i > all.length - 4));
    assert(row?.includes("kept on this device"), `the row should say they're kept on this device: ${JSON.stringify(row)}; keeping said ${JSON.stringify(log)}`);
    await goSettings("#study/packs", "Find packs in Explore");
    await goSettings("#settings/study/packs/starter-word-order", "About it");
    await page.waitForTimeout(600);
    assert((await page.locator(BAR).count()) === 0, "kept already, the next visit shows no bar");
    return `poured, kept, out at the far end; no bar on the next visit`;
  } finally {
    await unslow();
  }
}, "recordings");

// ---------- something that didn't go (ui.retryLine) ----------

/** One Tinta, every frame for `ms`: its state, its box and what it draws (the union of its drawing's pieces). */
const watchTinta = (selector, ms) =>
  page.evaluate(async ({ selector, ms }) => {
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      await new Promise((r) => requestAnimationFrame(r));
      const tinta = document.querySelector(selector);
      if (!tinta) {
        out.push({ t: performance.now() - t0, gone: true });
        continue;
      }
      let ink = null;
      // Unseen (an arriving plane's Tinta before its plane is on its way): it draws nothing on the screen.
      const unseen = getComputedStyle(tinta).visibility === "hidden";
      for (const node of unseen ? [] : tinta.querySelectorAll("svg path, svg circle, svg ellipse")) {
        const r = node.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        ink = ink ? { l: Math.min(ink.l, r.left), t: Math.min(ink.t, r.top), r: Math.max(ink.r, r.right), b: Math.max(ink.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
      }
      const b = tinta.getBoundingClientRect();
      out.push({ t: performance.now() - t0, state: tinta.getAttribute("data-state"), drawing: tinta.querySelector("svg")?.innerHTML.length ?? 0, box: { l: b.left, t: b.top, r: b.right, b: b.bottom }, ink });
    }
    return out;
  }, { selector, ms });
/** A puddle: what it draws is low, under half its box, and down on its ground. */
const puddled = (f) => f.ink && f.ink.b - f.ink.t < 0.5 * (f.box.b - f.box.t) && f.ink.t > f.box.t + 0.45 * (f.box.b - f.box.t);
/** The middle of an element is that element (it'd take a press there). */
const pressable = (selector) => page.evaluate((s) => {
  const node = document.querySelector(s);
  const r = node.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return Boolean(hit && (hit === node || node.contains(hit)));
}, selector);

await stage("/design: something that didn't go: the words, Retry, and Tinta slumping into a puddle beside them; Retry works all along", async () => {
  await page.goto(`${BASE}/design/#tinta-acts`);
  const R = ".ds-retry";
  assert(await page.waitForSelector(R, { timeout: 8000 }).then(() => true, () => false), "no retry demo on /design (#tinta-acts .ds-retry)");
  await page.locator(R).scrollIntoViewIfNeeded();
  await page.locator(`${R} button`, { hasText: "Send" }).click();
  const LINE = `${R} [data-part="retry-line"]`;
  await page.waitForSelector(LINE, { timeout: 3000 });
  const TINTA = `${LINE} > [data-part="character"]`;
  const frames = await watchTinta(TINTA, 1300);
  const slumping = frames.filter((f) => f.state === "slump");
  assert(slumping.length > 20 && frames.findIndex((f) => f.state === "slump") < 15, `it should slump at once (${slumping.length} frames)`);
  await page.screenshot({ path: join(OUT, "retry-design.png") });
  const puddle = frames.filter((f) => f.t > 1000 && puddled(f));
  assert(puddle.length >= 3, `by a second in it should be a puddle of itself: ${JSON.stringify(frames.at(-1))}`);
  const retry = `${LINE} button`;
  assert(await pressable(retry), "Retry should take a press while it's a puddle");
  const hidden = await page.evaluate((s) => document.querySelector(s).getAttribute("aria-hidden") === "true", TINTA);
  assert(hidden, "Tinta beside the words is hidden from screen readers (the words say it)");
  const box = await page.locator(retry).boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  const after = await watchTinta(TINTA, 200);
  assert(after.every((f) => f.gone || f.state !== "slump"), "the press should end its act");
  await page.locator(`${R} [data-part="ask-status"]`, { hasText: "Sent to your AI" }).waitFor({ timeout: 3000 });
  return `slumped at once, a puddle by 1 s (${puddle.length} frames), Retry pressed mid-puddle and it sent`;
}, "error");

await stage("/design: something that didn't go, with animations off: Tinta still beside the words", async () => {
  await page.evaluate(() => document.documentElement.setAttribute("data-motion", "off"));
  try {
    const R = ".ds-retry";
    await page.locator(`${R} button`, { hasText: "Send" }).click();
    await page.waitForSelector(`${R} [data-part="retry-line"]`, { timeout: 3000 });
    const frames = await watchTinta(`${R} [data-part="retry-line"] > [data-part="character"]`, 1500);
    const changes = frames.filter((f, i) => i && f.drawing !== frames[i - 1].drawing).length;
    assert(frames.every((f) => f.state !== "slump") && changes === 0, `no act with animations off (${changes} changes)`);
    return `${frames.length} frames, its still unchanged`;
  } finally {
    await page.evaluate(() => document.documentElement.removeAttribute("data-motion"));
  }
}, "error");

await stage("Explain this that can't go: the app's words, Retry and Tinta slumping; Retry sends it once it can", async () => {
  const offline = (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue());
  await page.route("**/api/ai/requests", offline);
  try {
    await page.goto(`${BASE}/app/#know/p%3Av2`);
    const more = page.locator('[data-part="concept-head"] [aria-haspopup="menu"]');
    await more.waitFor({ timeout: 10_000 });
    await more.click();
    await page.locator('.lx-menu-layer[data-part="menu"] [data-part="menu-item"]', { hasText: "Explain this" }).click();
    const LINE = '[data-part="concept-head"] [data-part="ask-status"] [data-part="retry-line"]';
    await page.waitForSelector(LINE, { timeout: 4000 });
    const words = await page.locator(`${LINE} .lx-retry-words`).textContent();
    assert(/^Couldn't reach Lexicommons, so it wasn't sent/.test(words), `the app's own words: ${words}`);
    const frames = await watchTinta(`${LINE} > [data-part="character"]`, 1300);
    await page.screenshot({ path: join(OUT, "retry-explain.png") });
    assert(frames.some((f) => f.state === "slump") && frames.some(puddled), "Tinta should slump into a puddle beside the words");
    await page.unroute("**/api/ai/requests", offline);
    await page.locator(`${LINE} button`, { hasText: "Retry" }).click();
    await page.locator('[data-part="concept-head"] [data-part="ask-status"]', { hasText: "Sent to your AI" }).waitFor({ timeout: 5000 });
    return `“${words.slice(0, 40)}…”; slumped; Retry sent it`;
  } finally {
    await page.unroute("**/api/ai/requests", offline).catch(() => {});
  }
}, "error");

// Another account's request to answer "Me too" to: written straight into the local D1 (its user, session and the
// sharing terms), then posted through the app's own API. LOCAL only (--persist-to).
const { createHash, randomBytes } = await import("node:crypto");
const d1 = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const sqlq = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
let ASKER = null;
async function askersRequest(title) {
  if (!ASKER) {
    const id = `tp${randomBytes(6).toString("hex")}`;
    const cookie = randomBytes(24).toString("base64url");
    const now = Date.now();
    d1([
      `INSERT INTO users (id, name, created_at) VALUES (${sqlq(id)}, 'Tinta Asker', ${now - 30 * 86400_000})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${sqlq(createHash("sha256").update(cookie).digest("hex"))}, ${sqlq(id)}, ${now}, ${now + 86400_000}, 'tinta-acts-check')`,
      `INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${sqlq(id)}, 1, ${now})`,
    ].join("; "));
    ASKER = { id, cookie };
  }
  const response = await fetch(`${BASE}/api/community/requests`, { method: "POST", headers: { Cookie: `lc_session=${ASKER.cookie}`, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "pack", language: "nl", title, details: "For tinta-acts-check." }) });
  const body = await response.json().catch(() => null);
  if (response.status === 403 && /only the library's admins/.test(body?.error ?? "")) throw new Skip(`the server lets only admins share and ask (start it with --var COMMUNITY_SHARING:everyone)`);
  assert(response.status === 200 && body?.id, `posting a request as another account: ${response.status} ${JSON.stringify(body)}`);
  return body.id;
}

await stage("The practice room: a line that couldn't go has Tinta beside its Try again, slumping; Try again sends it", async () => {
  // A practice needs an AI connected (it's offered only then).
  await page.evaluate(() => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "an AI, for this check" }) }));
  await page.goto(`${BASE}/app/#practice/new/conversation`);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const typed = page.locator('[data-part="segment"]', { hasText: "Speak or type" });
  if (!(await typed.count())) throw new Skip("no practice setup on this server");
  await typed.click();
  await page.fill('input[aria-label="Topic"]', "family");
  await page.getByRole("button", { name: "Start" }).click();
  const ROOM = ".lx-practice-room:not([data-ghost])";
  await page.locator(ROOM).waitFor({ timeout: 10_000 });
  const input = page.locator(`${ROOM} [data-part="composer"] input`);
  await input.waitFor({ timeout: 10_000 });
  const offline = (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue());
  await page.route("**/api/practice/*/turns", offline);
  try {
    await input.fill("Gisteren ben ik naar de markt gegaan");
    await input.press("Enter");
    const LINE = `${ROOM} [data-part="chat-line"][data-state="failed"]`;
    await page.waitForSelector(LINE, { timeout: 6000 });
    const TINTA = `${LINE} > [data-part="character"]`;
    const frames = await watchTinta(TINTA, 1300);
    await page.screenshot({ path: join(OUT, "retry-practice.png") });
    assert(frames.some((f) => f.state === "slump"), "Tinta beside the line should slump");
    const retry = page.locator(`${LINE} button`, { hasText: "Couldn't send. Try again" });
    assert(await retry.count(), "the room's own Try again is there, its words as they were");
    await page.unroute("**/api/practice/*/turns", offline);
    await retry.click();
    await page.locator(`${ROOM} [data-part="chat-line"][data-variant="you"][data-state="sent"]`).waitFor({ timeout: 6000 });
    assert((await page.locator(`${ROOM} [data-part="chat-line"] > [data-part="character"]`).count()) === 0, "once it's sent, Tinta goes with the button");
    return "slumped beside the failed line; Try again sent it, and Tinta went with the button";
  } finally {
    await page.unroute("**/api/practice/*/turns", offline).catch(() => {});
  }
}, "error");

// ---------- Me too (ui.stampCharacter) ----------

/** The color on the screen at (x, y) in CSS px, as [r, g, b] (a screenshot of the spot, read with sharp). */
async function pixelAt(x, y) {
  const sharp = (await import("sharp")).default;
  const png = await page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 2, height: 2 } });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += info.channels) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
  return sum.map((v) => Math.round(v / (data.length / info.channels)));
}
/** Tinta's violet ink, as painted (on top, not dimmed under something): a blue-violet hue, well saturated. */
const isInk = ([r, g, b]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d || max < 60) return false;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const hue = (h * 60 + 360) % 360;
  return hue > 235 && hue < 285 && d / max > 0.35;
};
/** The seal's ring (left of its check) on the button's near top corner, read off the screen. */
const sealPixel = (b) => {
  const h = b.b - b.t, R = 0.22 * h;
  return pixelAt(b.l + 0.24 * h - 0.62 * R, b.t + 0.06 * h);
};
/** Whether a drawn box reaches onto the button's near top corner (where the seal lands). */
const onCorner = (ink, b) => ink && ink.r > b.l + 6 && ink.l < b.l + 0.6 * (b.b - b.t) && ink.t < b.t + 0.45 * (b.b - b.t) && ink.b > b.t - 6;
const rectOf = (selector) => page.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom };
}, selector);

await stage("/design: Me too counts at once, and Tinta's drop lands on the button as a seal, holds and dries away; taking it back throws nothing", async () => {
  await page.goto(`${BASE}/design/#tinta-acts`);
  const S = ".ds-stamp";
  assert(await page.waitForSelector(S, { timeout: 8000 }).then(() => true, () => false), "no Me too demo on /design (#tinta-acts .ds-stamp)");
  await page.locator(S).scrollIntoViewIfNeeded();
  const button = page.locator(`${S} button`, { hasText: /^Me too/ });
  const TINTA = `${S} .lx-pinned-buttons > [data-part="character"]:first-child`;
  await button.click();
  assert((await button.textContent()) === "Me too · 15" && (await button.getAttribute("aria-pressed")) === "true", "it should count at once");
  const b = await rectOf(`${S} .lx-pinned-buttons > button`);
  const shot = page.waitForTimeout(1050).then(() => page.screenshot({ path: join(OUT, "metoo-design.png") }));
  const ink = page.waitForTimeout(950).then(() => sealPixel(b));
  const frames = await watchTinta(TINTA, 3000);
  await shot;
  const painted = await ink;
  assert(isInk(painted), `the seal should be painted on top of the button, in the ink: rgb(${painted.join(", ")})`);
  assert(frames.slice(0, 10).some((f) => f.state === "stamp"), "it should throw at once");
  const sealed = frames.filter((f) => f.t > 700 && f.t < 1500 && onCorner(f.ink, b));
  assert(sealed.length >= 10, `its seal should sit on the button's corner from about 0.7 s (${sealed.length} frames)`);
  const end = frames.at(-1);
  assert(end.state === "idle" && end.ink.r <= end.box.r + 6, `dried away and itself again by 3 s: ${JSON.stringify(end)}`);
  assert(await pressable(`${S} .lx-pinned-buttons > button`), "the button takes presses with the seal on it");
  await button.click();
  const back = await watchTinta(TINTA, 600);
  assert(back.every((f) => f.state !== "stamp") && (await button.getAttribute("aria-pressed")) === "false", "taking it back throws nothing");
  return `counted at once; the seal on the corner for ${sealed.length} frames from ${sealed[0].t.toFixed(0)} ms; gone by 3 s; taking it back threw nothing`;
}, "metoo");

await stage("A request's Me too: Tinta at the start of its actions throws the seal onto the button, through the page's redraw", async () => {
  if (!PERSIST) throw new Skip("give --persist-to <the server's state dir> to make another account's request");
  const id = await askersRequest(`Stamp check ${Date.now() % 100000}`);
  await page.goto(`${BASE}/app/#explore/request/${encodeURIComponent(id)}`);
  const TINTA = '[data-part="pinned-actions"] .lx-pinned-buttons > [data-part="character"]:first-child';
  await page.waitForSelector(TINTA, { timeout: 10_000 });
  await page.evaluate((s) => (document.querySelector(s).lxMark = true), TINTA);
  const meToo = page.locator('[data-part="pinned-actions"] button', { hasText: /^Me too/ }).first();
  // Tinta's act loads late (acts.js held back 400 ms), so the server's answer has redrawn the page, and replaced the
  // button, before the act's first frame: the seal still lands where the button was pressed.
  const unslow = await slow("**/js/character/rig/splat/acts.js*", 400);
  await meToo.click();
  // The server's answer redraws the page (its line above the actions moves them down): the button is measured after.
  const shot = page.waitForTimeout(1450).then(() => page.screenshot({ path: join(OUT, "metoo-request.png") }));
  const later = page.waitForTimeout(1400).then(async () => {
    const b = await rectOf('[data-part="pinned-actions"] .lx-pinned-buttons > button');
    return { b, painted: await sealPixel(b) };
  });
  const frames = await watchTinta(TINTA, 3000);
  await unslow();
  await shot;
  const { b, painted } = await later;
  writeFileSync(join(OUT, "metoo-request-frames.json"), JSON.stringify({ b, frames }));
  assert(isInk(painted), `the seal should be painted on top of Me too, in the ink: rgb(${painted.join(", ")})`);
  const sealed = frames.filter((f) => f.t > 1300 && f.t < 2000 && onCorner(f.ink, b));
  assert(frames.some((f) => f.t < 800 && f.state === "stamp"), "it should throw as soon as its act has loaded (held back 400 ms here)");
  assert(sealed.length >= 8, `the seal should sit on Me too's corner (${sealed.length} frames)`);
  await page.locator(".lx-settings-message", { hasText: "Me too: it's counted." }).waitFor({ timeout: 6000 });
  const same = await page.evaluate((s) => document.querySelector(s)?.lxMark === true, TINTA);
  assert(same, "the page's redraw should keep the same Tinta (its act goes on)");
  const from = frames.findIndex((f) => f.state === "stamp");
  assert(frames.slice(from).filter((f) => f.t < 1500).every((f) => f.gone || f.state === "stamp"), "once started, its act should carry on through the redraw");
  const count = await page.locator('[data-part="pinned-actions"] button', { hasText: /^Me too/ }).first().textContent();
  assert(/Me too · 1$/.test(count), `the server's count: ${count}`);
  return `the seal on the corner for ${sealed.length} frames; the redraw kept Tinta and its act; ${count}`;
}, "metoo");

await stage("A request's Me too that can't go: the page's own Tinta slumps beside the words (one Tinta on the screen); Retry counts it", async () => {
  if (!PERSIST) throw new Skip("give --persist-to <the server's state dir> to make another account's request");
  const id = await askersRequest(`Retry check ${Date.now() % 100000}`);
  const offline = (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue());
  await page.route("**/api/community/requests/*/like", offline);
  try {
    await page.goto(`${BASE}/app/#explore/request/${encodeURIComponent(id)}`);
    const TINTA = '[data-part="pinned-actions"] .lx-pinned-buttons > [data-part="character"]:first-child';
    const meToo = page.locator('[data-part="pinned-actions"] button', { hasText: /^Me too/ }).first();
    await meToo.waitFor({ timeout: 10_000 });
    await meToo.click();
    const LINE = '.lx-settings-message [data-part="retry-line"]';
    await page.waitForSelector(LINE, { timeout: 4000 });
    const frames = await watchTinta(TINTA, 1300);
    assert(frames.some((f) => f.state === "slump"), "the page's Tinta should slump");
    const tintas = await page.locator('[data-part="page"] [data-part="character"]').count();
    assert(tintas === 1, `one Tinta on the screen (found ${tintas})`);
    assert(!(await meToo.isDisabled()), "Me too is pressable again");
    await page.unroute("**/api/community/requests/*/like", offline);
    await page.locator(`${LINE} button`, { hasText: "Retry" }).click();
    await page.locator(".lx-settings-message", { hasText: "Me too: it's counted." }).waitFor({ timeout: 6000 });
    return "the page's Tinta slumped beside the words, the only one; Retry counted it";
  } finally {
    await page.unroute("**/api/community/requests/*/like", offline).catch(() => {});
  }
}, "metoo");

// ---------- the paper plane (ui.planeCharacter) ----------

/** How far what it draws is from its own box (0 when it overlaps), or Infinity when it draws nothing on the screen. */
const away = (f) => {
  if (!f.ink) return Infinity;
  const onScreen = f.ink.r > 0 && f.ink.l < 390 && f.ink.b > 0 && f.ink.t < 844;
  if (!onScreen) return Infinity;
  const dx = Math.max(0, f.box.l - f.ink.r, f.ink.l - f.box.r), dy = Math.max(0, f.box.t - f.ink.b, f.ink.t - f.box.b);
  return Math.hypot(dx, dy);
};
const home = (f) => f.ink && f.ink.l >= f.box.l - 8 && f.ink.r <= f.box.r + 8 && f.ink.t >= f.box.t - 12 && f.ink.b <= f.box.b + 8;

await stage("/design: the paper plane: shared, it folds, flies off, comes round and lands back; an answer, a plane glides in and unfolds", async () => {
  await page.goto(`${BASE}/design/#tinta-acts`);
  const P = ".ds-plane";
  assert(await page.waitForSelector(P, { timeout: 8000 }).then(() => true, () => false), "no plane demo on /design (#tinta-acts .ds-plane)");
  await page.locator(P).scrollIntoViewIfNeeded();
  const TINTA = `${P} .lx-pinned-buttons > [data-part="character"]:first-child`;
  await page.locator(`${P} button`, { hasText: "Shared" }).click();
  const offShot = page.waitForTimeout(1000).then(() => page.screenshot({ path: join(OUT, "plane-off.png") }));
  const off = await watchTinta(TINTA, 4700);
  await offShot;
  assert(off.slice(0, 5).some((f) => f.state === "plane-off"), "it should fold at once");
  const gone = off.filter((f) => f.t > 1000 && f.t < 2600 && away(f) > 80);
  assert(gone.length >= 20, `it should fly well off (${gone.length} frames over 80 px away between 1 and 2.6 s)`);
  const end = off.at(-1);
  assert(end.state === "idle" && home(end), `back on its spot and itself by 4.7 s: ${JSON.stringify(end)}`);
  await page.locator(`${P} button`, { hasText: "An answer" }).click();
  const inShot = page.waitForTimeout(700).then(() => page.screenshot({ path: join(OUT, "plane-in.png") }));
  const arrive = await watchTinta(TINTA, 2900);
  await inShot;
  const shown = arrive.find((f) => f.ink);
  assert(arrive.some((f) => f.state === "plane-in") && shown && away(shown) > 80, `its first frame on the screen should be the plane far off: ${JSON.stringify(shown)}`);
  const landed = arrive.find((f) => f.t > 1700);
  assert(landed && home(landed), "landed on its spot by 1.7 s");
  assert(arrive.at(-1).state === "idle", "itself again by 2.9 s");
  return `off: ${gone.length} frames far away, home by 4.7 s; in: first seen ${away(shown).toFixed(0)} px off, landed by 1.7 s`;
}, "plane");

/** The check's own account id (for its sharing terms). */
const myId = () => page.evaluate(async () => (await (await fetch("/api/me", { credentials: "same-origin" })).json()).user?.id);
/** The check's account accepts the sharing terms (straight into the local D1: the app's own screen is explore-check's). */
async function acceptTerms() {
  const id = await myId();
  assert(typeof id === "string" && id, `the check's account id: ${id}`);
  d1(`INSERT OR IGNORE INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${sqlq(id)}, 1, ${Date.now()})`);
}

await stage("Share in Explore: the shared item's page opens with Tinta flying it off as a paper plane, once", async () => {
  if (!PERSIST) throw new Skip("give --persist-to <the server's state dir> (the check's sharing terms go in its D1)");
  await acceptTerms();
  // A server that lets only admins share: say so and skip (an empty share answers 403 then, 422 otherwise, and goes
  // through the API, so the page's console stays clean).
  const probe = await page.request.post(`${BASE}/api/community/share`, { data: {}, failOnStatusCode: false });
  if (probe.status() === 403 && /only the library's admins/.test((await probe.json().catch(() => ({}))).error ?? "")) throw new Skip("the server lets only admins share and ask (start it with --var COMMUNITY_SHARING:everyone)");
  await page.goto(`${BASE}/app/#study`);
  await page.waitForSelector("html[data-app-ready]");
  const pack = JSON.parse((await import("node:fs")).readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
  pack.id = `plane-${Date.now() % 1e6}`;
  pack.name = "Tinta's plane check";
  pack.items = pack.items.map((item) => ({ ...item, means: `${item.means} (plane ${pack.id})` }));
  const saved = await page.evaluate(async (p) => (await import("/js/study/packs.js")).savePack(p, { by: "the check" }), pack);
  assert(saved.ok, `saved: ${JSON.stringify(saved.errors)}`);
  await page.goto(`${BASE}/app/#settings/study/packs/${pack.id}`);
  await page.locator(".lx-row-title", { hasText: /^Share in Explore$/ }).click();
  // Sharing is a page of its own (explore.js renderShare, #explore/share/<pack>): with the terms accepted, its form at once.
  await page.waitForFunction((id) => location.hash.startsWith(`#explore/share/${encodeURIComponent(id)}`), pack.id, { timeout: 10_000 });
  const form = page.locator('[data-part="page"]:visible');
  await form.locator('[data-part="page-title"]', { hasText: "Share in Explore" }).waitFor({ timeout: 15_000 });
  await form.getByRole("button", { name: "Share", exact: true }).click();
  await page.waitForFunction(() => location.hash.startsWith("#explore/item/"), null, { timeout: 10_000 });
  const TINTA = '[data-part="pinned-actions"] .lx-pinned-buttons > [data-part="character"]:first-child';
  assert(await page.waitForSelector(TINTA, { timeout: 8000 }).then(() => true, () => false), "no Tinta in the shared item's actions");
  const frames = await watchTinta(TINTA, 4700);
  assert(frames.some((f) => f.state === "plane-off"), "it should fly it off as a paper plane");
  assert(frames.filter((f) => away(f) > 80).length >= 15, "the plane should fly well off");
  assert(frames.at(-1).state === "idle", "and land back");
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.locator('[data-part="page-title"]', { hasText: "Tinta's plane check" }).waitFor({ timeout: 8000 });
  assert((await page.locator(TINTA).count()) === 0, "once: opened again, the item's page has no plane");
  return "flown off and back from the shared item's actions; none when it's opened again";
}, "plane");

await stage("Your own request with a new answer: a paper plane glides into its actions and unfolds into Tinta, once", async () => {
  if (!PERSIST) throw new Skip("give --persist-to <the server's state dir> to have another account answer");
  await acceptTerms();
  const title = `Plane answer check ${Date.now() % 100000}`;
  // Through the API with the account's own cookie (page.request), so a refusal never reaches the page's console.
  const response = await page.request.post(`${BASE}/api/community/requests`, { data: { kind: "pack", language: "nl", title }, failOnStatusCode: false });
  const posted = { status: response.status(), body: await response.json().catch(() => null) };
  if (posted.status === 403 && /only the library's admins/.test(posted.body?.error ?? "")) throw new Skip(`the server lets only admins share and ask (start it with --var COMMUNITY_SHARING:everyone)`);
  assert(posted.status === 200 && posted.body?.id, `posting the check's own request: ${JSON.stringify(posted)}`);
  await askersRequest(`Asker's warm-up ${Date.now() % 100000}`); // makes the other account (its session and terms)
  const pack = JSON.parse((await import("node:fs")).readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
  pack.id = `answer-${Date.now() % 1e6}`;
  pack.items = pack.items.map((item) => ({ ...item, means: `${item.means} (answer ${pack.id})` }));
  const as = (path, body) => fetch(`${BASE}${path}`, { method: "POST", headers: { Cookie: `lc_session=${ASKER.cookie}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const shared = await as("/api/community/share", { pack, title: "Kitchen Dutch" });
  assert(shared.status === 200 && shared.body?.id, `the other account sharing a pack: ${JSON.stringify(shared)}`);
  const answered = await as(`/api/community/requests/${encodeURIComponent(posted.body.id)}/answers`, { item: shared.body.id });
  assert(answered.status === 200, `answering: ${JSON.stringify(answered)}`);
  await page.goto(`${BASE}/app/#explore/request/${encodeURIComponent(posted.body.id)}`);
  const TINTA = '[data-part="pinned-actions"] .lx-pinned-buttons > [data-part="character"]:first-child';
  assert(await page.waitForSelector(TINTA, { state: "attached", timeout: 8000 }).then(() => true, () => false), "no Tinta in your request's actions with a new answer");
  const frames = await watchTinta(TINTA, 2900);
  const seen = frames.filter((f) => f.state === "plane-in");
  assert(seen.length > 20, `a paper plane should arrive (${seen.length} frames)`);
  const first = frames.find((f) => f.ink);
  assert(first && away(first) > 60, `its first drawn frame is the plane far off, never itself at its spot: ${JSON.stringify(first)}`);
  assert(home(frames.at(-1)) && frames.at(-1).state === "idle", "landed and itself");
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.locator('[data-part="page-title"]', { hasText: title }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);
  assert((await page.locator(TINTA).count()) === 0, "seen once: opened again, no plane and no Tinta");
  return `${seen.length} frames arriving from ${away(first).toFixed(0)} px off; none when opened again`;
}, "plane");

// ---------- a new theme (character/theme-wipe.js) ----------

const SWATCH = (name) => page.locator('.lx-theme-picker [data-part="theme-swatch"], .lx-theme-picker button', { hasText: new RegExp(`^${name}`) }).first();
const THEME_TINTA = '.lx-theme-head > [data-part="character"]';
/** The picture and the page, every frame for `ms`: the theme in use, whether the picture's there, its hole, Tinta's state. */
const watchWipe = (ms) =>
  page.evaluate(async (ms) => {
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      await new Promise((r) => requestAnimationFrame(r));
      const shot = document.querySelector("[data-theme-picture]");
      out.push({
        t: performance.now() - t0,
        theme: document.documentElement.getAttribute("data-theme"),
        canvas: getComputedStyle(document.body).backgroundColor,
        shot: Boolean(shot),
        clip: shot?.style.clipPath.length ?? 0,
        pointer: shot ? getComputedStyle(shot).pointerEvents : null,
        pages: document.querySelectorAll('[data-part="page"]').length,
        tinta: document.querySelector('.lx-theme-head > [data-part="character"]')?.getAttribute("data-state"),
      });
    }
    return out;
  }, ms);

await stage("Settings → Appearance: Tinta by the Theme label; a new theme on the press, spreading from under Tinta as it shakes; the picture takes no presses and is never a second page", async () => {
  await page.goto(`${BASE}/app/#settings/appearance`);
  await page.waitForSelector(`${THEME_TINTA} svg`, { timeout: 10_000 });
  const placed = await page.evaluate((s) => {
    const tinta = document.querySelector(s);
    const b = tinta.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const label = tinta.parentElement.querySelector('[data-part="group-label"]').getBoundingClientRect();
    return { size: Math.round(b.height), hidden: tinta.getAttribute("aria-hidden") === "true", presses: Boolean(hit && (hit === tinta || tinta.contains(hit))), clear: b.left >= label.right, onScreen: b.right <= innerWidth };
  }, THEME_TINTA);
  assert(placed.size === 48 && placed.hidden && !placed.presses && placed.clear && placed.onScreen, `Tinta by the label: ${JSON.stringify(placed)}`);
  await page.waitForTimeout(600); // theme-wipe.js loads with the page
  const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const paper = SWATCH("Paper");
  await paper.click();
  // Pictures mid-wipe, taken while it runs.
  const shots = Promise.all([120, 300, 500].map((ms) => page.waitForTimeout(ms).then(() => page.screenshot({ path: join(OUT, `theme-${ms}.png`) }))));
  const frames = await watchWipe(1600);
  await shots;
  writeFileSync(join(OUT, "theme-frames.json"), JSON.stringify(frames));
  const changed = frames.findIndex((f) => f.theme === "paper");
  assert(changed >= 0 && frames[changed].t < 400, `the theme should change on the press (${before} → paper at ${frames[changed]?.t?.toFixed(0)} ms)`);
  const shown = frames.filter((f) => f.shot);
  assert(shown.length >= 10, `the old theme should stay a moment as a picture (${shown.length} frames)`);
  assert(shown.every((f) => f.pointer === "none"), "the picture takes no presses");
  assert(frames.every((f) => f.pages === 1), "never a second copy of the page in the document");
  const clips = new Set(shown.map((f) => f.clip));
  assert(clips.size >= 6, `its hole should open frame by frame (${clips.size} different holes)`);
  const last = frames.findLastIndex((f) => f.shot);
  assert(frames[last].t < 1100, `the picture should be gone within about a second (last at ${frames[last].t.toFixed(0)} ms)`);
  assert(frames.some((f) => f.tinta === "shake"), "Tinta should shake itself");
  return `${before} → paper at ${frames[changed].t.toFixed(0)} ms; the picture for ${shown.length} frames, ${clips.size} holes, gone by ${frames[last].t.toFixed(0)} ms; Tinta shook`;
}, "theme");

await stage("Settings → Appearance: a press during the wipe ends it at once, the new theme in place; a swatch under the picture takes the press", async () => {
  await page.waitForTimeout(1200);
  await SWATCH("Graphite").click();
  await page.waitForSelector("[data-theme-picture]", { state: "attached", timeout: 1500 });
  await page.waitForTimeout(120);
  // A press on nothing in particular (the page's title): the picture goes at once, Graphite in place.
  const title = await page.locator('[data-part="page-title"]').first().boundingBox();
  await page.touchscreen.tap(title.x + 8, title.y + title.height / 2);
  const frames = await watchWipe(400);
  assert(frames.every((f) => !f.shot), `the press should take the picture away at once (${frames.filter((f) => f.shot).length} frames with it)`);
  assert(frames.every((f) => f.theme === "graphite"), "the new theme stays");
  // A swatch under the picture, pressed mid-wipe, takes the press: its theme is picked.
  await page.waitForTimeout(300);
  await SWATCH("Paper").click();
  await page.waitForSelector("[data-theme-picture]", { state: "attached", timeout: 1500 });
  await page.waitForTimeout(150);
  const box = await SWATCH("Sepia").boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "sepia", null, { timeout: 3000 });
  return "a press on the title took the picture away at once; Sepia, pressed under the picture, was picked";
}, "theme");

await stage("Settings → Appearance with animations off: the theme just changes, no picture, Tinta still", async () => {
  await page.waitForTimeout(1200);
  await page.evaluate(() => localStorage.setItem("lx.appearance.v1", JSON.stringify({ ...JSON.parse(localStorage.getItem("lx.appearance.v1") ?? "{}"), version: 1, presets: { ...(JSON.parse(localStorage.getItem("lx.appearance.v1") ?? "{}").presets ?? {}), motion: "off" } })));
  await page.reload();
  await page.waitForSelector(`${THEME_TINTA} svg`, { timeout: 10_000 });
  await page.waitForTimeout(600);
  await SWATCH("Graphite").click();
  const frames = await watchWipe(900);
  assert(frames.every((f) => !f.shot), "no picture with animations off");
  assert(frames.every((f) => f.tinta !== "shake"), "no shake with animations off");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "graphite", null, { timeout: 3000 });
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("lx.appearance.v1") ?? "{}");
    if (saved.presets) delete saved.presets.motion;
    localStorage.setItem("lx.appearance.v1", JSON.stringify(saved));
  });
  return "Graphite at once; no picture, no shake";
}, "theme");

await stage("delete the account", async () => {
  await page.goto(`${BASE}/app/#settings/account`);
  const row = (text) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${text}$`) }) }).first();
  await row("Delete my account").click();
  await row("Press again to delete it for good").click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  return "deleted";
});

await stage("Every Tinta on the way stayed whole (nothing cut it, on any frame)", async () => {
  const cut = wholeReport(wholeSeen);
  writeFileSync(join(OUT, "whole-cut.txt"), `${cut.join("\n")}\n`);
  assert(cut.length === 0, `${cut.length} cut: ${cut.slice(0, 10).join(" | ")}`);
});

await stage("no console errors", async () => {
  // The check's own offline requests (route.abort) log the browser's ERR_INTERNET_DISCONNECTED: those are expected.
  const real = problems.filter((p) => !/status of 401/.test(p) && !/net::ERR_INTERNET_DISCONNECTED/.test(p));
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "tinta-acts-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
console.log(`${results.filter((r) => r.ok && !r.skipped).length}/${results.length} stages passed${skipped ? `, ${skipped} skipped` : ""}`);
process.exit(failed ? 1 : 0);
