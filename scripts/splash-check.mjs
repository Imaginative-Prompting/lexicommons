// The splash (the installed app's first open of the day: a drop falls, splats and bounces up as Tinta) and the first
// frame every start of the installed app holds, end to end in headless Chrome on a LOCAL server (it creates and deletes a test account):
// - every other start of the installed app holds the same first frame until the app has drawn, then fades; a reload doesn't;
// - the day's first open as the installed app holds it until the app has drawn, then plays over the app, and it's gone on
//   time; with the processor slowed its frames don't stall and its clock doesn't run ahead of them (the freeze a phone showed);
//   an app that took too long to draw gets no splash;
// - with the main thread busy as it fades into the app (a phone's, finishing its draw), the fade starts from the whole frame and
//   plays out before the overlay goes: on a phone, a timer took it away before a frame of its fade (a cut to the app), and the
//   fade's first frame came half way through;
// - a reload the same day, and a browser tab, never show it;
// - a press ends it at once and never reaches the app under it (the app answers the next press); a key ends it too;
// - before the app's code arrives (splash-run.js held back), theme-boot.js keeps those promises: a press ends it and
//   isn't passed through, and a splash the app's code never starts steps aside after 6 s, fading into the app (once the app has drawn: one
//   drawing later is waited for, and one that never draws is stepped aside from at 12 s);
// - Animations Off, and a device asking for reduced motion: its last frame as a still for half a second, no animation;
// - the first paint is the launch image (public/icons/startup/1170x2532.png) for that screen, in the page below its status bar.
// "Installed" is played with navigator.standalone (iOS's), switched on per tab by sessionStorage "check.standalone".
// Every browser comes from quiet-browser.mjs: nothing makes a sound.
//
// Usage (headless Chrome, so through gpu.py's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "splash check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/splash-check.mjs http://localhost:<port> <outDir>      (exit 0 = pass)
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";
import { DUR } from "../public/js/character/rig/splash/splash.js";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOO_LATE = 5000; // splash-run.js's
const [BASE, outArg = "splash-check-out"] = process.argv.slice(2);
const OUT = resolve(outArg);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("splash-check creates and deletes an account: give it a local server, e.g. http://localhost:8824");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

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
    results.push({ stage: name, ok: false, ms: Date.now() - t, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true, channel: "chrome" });
// An iPhone 13/14-sized screen at its own density, so a screenshot is the size of its launch image. No service worker:
// one answers splash-run.js from its cache, where page.route can't hold it back.
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: "block" });
await context.addInitScript(() => {
  if (sessionStorage.getItem("check.standalone")) Object.defineProperty(navigator, "standalone", { get: () => true });
  // What this document's splash did, from its first moment (performance.now()): the mode theme-boot.js gave it, what
  // the first frame drawn with its markup showed, when splash-run.js took over and drew live, when it ended (a press, or
  // its fade), when it stopped showing (data-splash off) and when its markup went.
  const s = (window.lxSplash = { fallAt: null, tasks: [], drawnAt: null, longestGap: 0, frames: 0, goingAt: null, mode: null, firstFrame: null, runAt: null, liveAt: null, liveSvg: false, endedAt: null, offAt: null, goneAt: null, seen: false });
  const now = () => Math.round(performance.now());
  new MutationObserver(() => {
    const attr = document.documentElement?.getAttribute("data-splash"), overlay = document.querySelector(".lx-splash");
    if (attr && s.mode == null) s.mode = attr;
    if (document.documentElement?.hasAttribute("data-app-drawn") && s.drawnAt == null) s.drawnAt = now();
    if (overlay?.hasAttribute("data-going") && s.goingAt == null) s.goingAt = now();
    if (s.mode && !attr && s.offAt == null) s.offAt = now();
    if (overlay) s.seen = true;
    if (overlay?.hasAttribute("data-run") && s.runAt == null) s.runAt = now();
    if (overlay?.hasAttribute("data-fall") && s.fallAt == null) s.fallAt = now();
    if (overlay?.hasAttribute("data-live") && s.liveAt == null) s.liveAt = now();
    if (overlay?.querySelector(".lx-splash-live")) s.liveSvg = true;
    if ((overlay?.hasAttribute("data-ended") || overlay?.hasAttribute("data-going")) && s.endedAt == null) s.endedAt = now();
    if (s.seen && !overlay && s.goneAt == null) s.goneAt = now();
  }).observe(document, { childList: true, subtree: true, attributes: true });
  // What held the main thread while it played: that's what stopped it on a phone. (Frame gaps are noted too, but a headless
  // browser's frames also wait on its software drawing, which says nothing of a phone's.)
  s.longestTask = 0;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        s.tasks.push([Math.round(entry.startTime), Math.round(entry.duration)]);
        if (s.fallAt != null && entry.startTime >= s.fallAt && !s.goingAt) s.longestTask = Math.max(s.longestTask, Math.round(entry.duration));
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  // Its fade into the app, frame by frame: the overlay's opacity at each frame from when it's asked to go until it's gone. With
  // check.busy set, the main thread is held that many ms as the fade begins, as a phone's is as the app finishes drawing.
  s.fade = [];
  let fading = false;
  new MutationObserver(() => {
    if (fading || !document.querySelector(".lx-splash")?.hasAttribute("data-going")) return;
    fading = true;
    const busy = Number(sessionStorage.getItem("check.busy") || 0);
    if (busy)
      setTimeout(() => {
        const end = performance.now() + busy;
        while (performance.now() < end);
      }, 0);
    const note = () => {
      const o = document.querySelector(".lx-splash");
      s.fade.push([now(), o ? Number(getComputedStyle(o).opacity) : null]);
      if (o) requestAnimationFrame(note);
    };
    requestAnimationFrame(note);
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-going"] });
  let lastFrame = 0;
  const gaps = (t) => {
    if (s.fallAt != null && !s.goingAt && !s.endedAt) {
      if (lastFrame) s.longestGap = Math.max(s.longestGap, Math.round(t - lastFrame));
      s.frames++;
      lastFrame = t;
    }
    if (performance.now() < 20_000) requestAnimationFrame(gaps);
  };
  requestAnimationFrame(gaps);
  const frame = () => {
    const overlay = document.querySelector(".lx-splash");
    if (overlay && document.body) {
      const shown = (el) => Boolean(el && getComputedStyle(overlay).display !== "none" && getComputedStyle(el).visibility === "visible");
      s.firstFrame = { at: now(), mode: document.documentElement.getAttribute("data-splash"), shown: getComputedStyle(overlay).display !== "none", first: shown(overlay.querySelector(".lx-splash-first")), last: shown(overlay.querySelector(".lx-splash-last")) };
    } else if (performance.now() < 10_000) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});
const page = await context.newPage();
// --swap js/x.js=/some/old.js (or a .css): the app with one file as it was, to see a stage fail on what it holds.
for (let i = process.argv.indexOf("--swap"); i >= 0; i = process.argv.indexOf("--swap", i + 1)) {
  const [path, file] = process.argv[i + 1].split("=");
  await context.route(`**/${path}*`, (route) => route.fulfill({ path: file, contentType: file.endsWith(".css") ? "text/css" : "text/javascript" }));
}
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

/** Opens the app again (a fresh document), as the installed app or a browser tab, with today's splash still to come or
 * already seen; waits for the app to be ready. */
async function open({ installed, firstOfDay, appearance = null }) {
  await page.evaluate(({ installed, firstOfDay, appearance }) => {
    if (installed) sessionStorage.setItem("check.standalone", "1");
    else sessionStorage.removeItem("check.standalone");
    if (firstOfDay) localStorage.removeItem("lx.splash.day");
    if (appearance) localStorage.setItem("lx.appearance.v1", JSON.stringify(appearance));
    else localStorage.removeItem("lx.appearance.v1");
  }, { installed, firstOfDay, appearance });
  // Not waiting for "load": a held splash-run.js may be what it waits on.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("html[data-app-ready]");
}
const splash = () => page.evaluate(() => ({ attr: document.documentElement.getAttribute("data-splash"), overlay: Boolean(document.querySelector(".lx-splash")), ...window.lxSplash }));
const gone = (ms = 8000) => page.waitForFunction(() => !document.querySelector(".lx-splash"), null, { timeout: ms });
/** Holds splash-run.js back (the app's code arriving late, or never); release() lets it through. */
async function holdRunner() {
  let release;
  const held = new Promise((r) => (release = r));
  const pattern = "**/js/character/splash-run.js*";
  await page.route(pattern, async (route) => {
    await held;
    await route.continue().catch(() => {});
  });
  return async () => {
    release();
    await page.unroute(pattern);
  };
}

await stage("sign up with a passkey as a browser tab (no splash on the way in)", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Splash Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
  await page.waitForSelector("html[data-app-ready]");
  const s = await splash();
  assert(s.mode == null && !s.firstFrame?.shown && !s.overlay, `a browser tab showed the splash: ${JSON.stringify(s)}`);
  return "signed in, no splash (and its markup taken out)";
});

await stage("every other start of the installed app holds the first frame until the app has drawn, then fades", async () => {
  // Opened, not reloaded: what tapping its icon does.
  await page.evaluate(() => {
    sessionStorage.setItem("check.standalone", "1");
    localStorage.removeItem("lx.appearance.v1");
    const now = new Date(Date.now() - 4 * 3600 * 1000);
    localStorage.setItem("lx.splash.day", `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`); // already had today's
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/app/#today`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("html[data-app-drawn]", { timeout: 20_000 });
  const during = await splash();
  await gone();
  const s = await splash();
  assert(s.mode === "hold", `it should hold: ${JSON.stringify(s)}`);
  assert(s.firstFrame?.shown && s.firstFrame.first, `its first frame should be the first thing drawn: ${JSON.stringify(s.firstFrame)}`);
  assert(!s.liveSvg && s.runAt == null, `nothing should play: ${JSON.stringify(s)}`);
  assert(s.goneAt - s.drawnAt <= 700, `it should be gone soon after the app has drawn: drawn at ${s.drawnAt}, gone at ${s.goneAt}`);
  assert(during.attr === "hold", `it should still be up as the app draws: ${JSON.stringify(during)}`);
  return `held to ${s.drawnAt} ms, gone at ${s.goneAt} ms`;
});

await stage("the page's height last time holds the first frame where the launch image has it, from the first paint", async () => {
  await page.evaluate(() => localStorage.setItem("lx.splash.heights", JSON.stringify({ [innerWidth]: 700 })));
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/app/#today`, { waitUntil: "domcontentloaded" });
  const held = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--lx-splash-height").trim());
  await page.waitForSelector("html[data-app-drawn]", { timeout: 20_000 });
  await gone();
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("lx.splash.heights"))[innerWidth]);
  const now = await page.evaluate(() => innerHeight);
  assert(held === "700px", `it should hold what was kept: ${held}`);
  assert(kept === now, `it should keep the page's height for next time: ${kept}, the page ${now}`);
  return `held at ${held}, kept ${kept} for next time`;
});

await stage("with the processor slowed 4×, the day's first open waits for the app, doesn't stall, and its clock stays with its frames", async () => {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  try {
    await open({ installed: true, firstOfDay: true });
    await page.waitForFunction(() => window.lxSplash?.goneAt != null || !document.querySelector(".lx-splash"), null, { timeout: 25_000 });
    const s = await splash();
    assert(s.drawnAt != null, `the app should have drawn: ${JSON.stringify(s)}`);
    if (s.liveAt == null) return `drawn at ${s.drawnAt} ms, past its ${TOO_LATE} ms: no splash, as it should be`;
    // Well past a frame or two on a busy machine: a task that size is the app's. (The old code's first draw: 1.5 s on the simulator.)
    assert(s.longestTask <= 1500, `a task held the main thread ${s.longestTask} ms while it played (long tasks: ${JSON.stringify(s.tasks)}, fall at ${s.fallAt}, drawn at ${s.drawnAt})`);
    assert(s.fallAt >= s.drawnAt, `it started at ${s.fallAt} ms, before the app had drawn at ${s.drawnAt} ms: it'd stall in its long tasks`);
    const ran = (s.goingAt ?? s.goneAt) - s.fallAt;
    assert(ran >= DUR * 1000 - 50, `it ran ${Math.round(ran)} ms of its ${Math.round(DUR * 1000)}: its clock ran ahead of what it drew`);
    return `drawn at ${s.drawnAt} ms, falling at ${s.fallAt} ms, live at ${s.liveAt} ms, the longest task while it played ${s.longestTask} ms (the longest frame gap ${s.longestGap} ms over ${s.frames} frames, a headless browser's)`;
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
});

await stage("an app that took too long to draw gets no splash: it fades straight in", async () => {
  const pattern = "**/js/shell/main.js*";
  await page.route(pattern, async (route) => {
    await wait(TOO_LATE + 100);
    await route.continue().catch(() => {});
  });
  await page.evaluate(() => {
    sessionStorage.setItem("check.standalone", "1");
    localStorage.removeItem("lx.splash.day");
    localStorage.removeItem("lx.appearance.v1");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("html[data-app-ready]", { timeout: 30_000 });
  await gone();
  await page.unroute(pattern);
  const s = await splash();
  assert(s.mode === "play", `it should have been its day: ${JSON.stringify(s)}`);
  assert(s.liveAt == null && s.fallAt == null, `it should not have played: ${JSON.stringify(s)}`);
  return `no live frames; gone at ${s.goneAt} ms`;
});

await stage("the installed app's first open of the day: it holds until the app has drawn, plays over it, and it's gone on time", async () => {
  await open({ installed: true, firstOfDay: true });
  await page.waitForFunction(() => document.querySelector(".lx-splash")?.hasAttribute("data-live"), null, { timeout: 15_000 });
  const during = await splash();
  const app = await page.evaluate(() => Boolean(document.querySelector('[data-part="tab-bar"] [data-part="tab"]')));
  const a = await page.evaluate(() => document.querySelector(".lx-splash-live")?.innerHTML ?? "");
  await wait(150);
  const b = await page.evaluate(() => document.querySelector(".lx-splash-live")?.innerHTML ?? "");
  await page.screenshot({ path: join(OUT, "playing.png") });
  await gone();
  const s = await splash();
  const ran = s.goneAt - s.fallAt;
  assert(during.attr === "play" && s.liveSvg, `it should play: ${JSON.stringify(during)}`);
  assert(s.firstFrame?.mode === "play" && s.firstFrame.shown && s.firstFrame.first && !s.firstFrame.last, `its first frame should be the first drawn: ${JSON.stringify(s.firstFrame)}`);
  assert(app, "the app's frame should be drawn under it");
  assert(a.length > 0 && b.length > 0 && a !== b, "its live frames should be drawing (a frame 150 ms later differs)");
  assert(ran >= DUR * 1000 - 50 && ran <= DUR * 1000 + 600, `it should play its ${DUR.toFixed(2)} s and be gone 0.25 s after: it ran ${Math.round(ran)} ms`);
  return `played ${Math.round(ran)} ms (its ${DUR.toFixed(2)} s and the fade), the app drawn under it`;
});

/** Its fade, from its frames: how many, the first one's opacity, how many in between, the largest step down, the last before it went. */
function fadeOf(s) {
  const frames = s.fade.filter(([, o]) => o != null);
  let leap = 0;
  for (let i = 1; i < frames.length; i++) leap = Math.max(leap, frames[i - 1][1] - frames[i][1]);
  return { frames: frames.length, first: frames[0]?.[1], between: frames.filter(([, o]) => o > 0.05 && o < 0.95).length, leap: Number(leap.toFixed(2)), last: frames.at(-1)?.[1] };
}

await stage("a main thread busy as it fades into the app (a phone's, finishing its draw): the fade starts from the whole frame and plays out before it goes, never a cut, on another start and on the day's first", async () => {
  const told = [];
  for (const firstOfDay of [false, true]) {
    const kind = firstOfDay ? "the day's first" : "another start";
    await page.evaluate(() => sessionStorage.setItem("check.busy", "400"));
    try {
      if (firstOfDay) await open({ installed: true, firstOfDay: true });
      else {
        await page.evaluate(() => {
          sessionStorage.setItem("check.standalone", "1");
          localStorage.removeItem("lx.appearance.v1");
          const now = new Date(Date.now() - 4 * 3600 * 1000);
          localStorage.setItem("lx.splash.day", `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`);
        });
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        await page.goto(`${BASE}/app/#today`, { waitUntil: "domcontentloaded" });
      }
      await page.waitForFunction(() => window.lxSplash?.goneAt != null, null, { timeout: 20_000 });
      const s = await splash();
      const f = fadeOf(s);
      const frames = JSON.stringify(s.fade.map(([t, o]) => [t, o == null ? null : Number(o.toFixed(2))]));
      assert(s.mode === (firstOfDay ? "play" : "hold"), `${kind}: ${s.mode}, not ${firstOfDay ? "play" : "hold"}`);
      assert(f.first >= 0.99, `${kind}: its first frame after the busy spell was already faded to ${f.first}: ${frames}`);
      assert(f.between >= 4 && f.last <= 0.15, `${kind}: it went before its fade had played, ${f.between} frames on the way and the last at ${f.last}: ${frames}`);
      assert(f.leap <= 0.4, `${kind}: its fade leapt ${f.leap} in one frame: ${frames}`);
      told.push(`${kind}: ${f.frames} frames from ${f.first} down, ${f.between} on the way, the largest step ${f.leap}, the last ${f.last}`);
    } finally {
      await page.evaluate(() => sessionStorage.removeItem("check.busy"));
    }
  }
  return told.join("; ");
});

await stage("a reload the same day, and a browser tab: no splash", async () => {
  await open({ installed: true, firstOfDay: false });
  const reload = await splash();
  await open({ installed: false, firstOfDay: true });
  const tab = await splash();
  assert(reload.mode == null && !reload.firstFrame?.shown && !reload.overlay, `a reload the same day showed it: ${JSON.stringify(reload)}`);
  assert(tab.mode == null && !tab.firstFrame?.shown && !tab.overlay, `a browser tab showed it: ${JSON.stringify(tab)}`);
  return "none on a reload, none in a tab";
});

await stage("a press ends it at once and never reaches the app under it; the app answers the next press", async () => {
  await page.goto(`${BASE}/app/#today`);
  await open({ installed: true, firstOfDay: true });
  await page.waitForFunction(() => document.querySelector(".lx-splash")?.hasAttribute("data-live"));
  await wait(300);
  const study = page.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: "Study" }).first();
  const box = await study.boundingBox();
  const before = await page.evaluate(() => location.hash);
  const t0 = await page.evaluate(() => performance.now());
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  const ended = await page.evaluate(() => window.lxSplash.endedAt);
  await gone(3000);
  await wait(200);
  const after = await page.evaluate(() => location.hash);
  await study.tap();
  await page.waitForFunction(() => location.hash.startsWith("#study"), null, { timeout: 3000 }).catch(() => {});
  const next = await page.evaluate(() => location.hash);
  assert(ended != null && ended - t0 < 120, `the press should end it at once (ended ${ended == null ? "never" : `${Math.round(ended - t0)} ms after`})`);
  assert(after === before, `the press reached the app under it: ${before} → ${after}`);
  assert(next.startsWith("#study"), `the app should answer the next press: ${next}`);
  return `ended ${Math.round(ended - t0)} ms after the press; the tab under it untouched (${before}); the next press went to Study`;
});

await stage("a key ends it too", async () => {
  await page.goto(`${BASE}/app/#today`);
  await open({ installed: true, firstOfDay: true });
  await page.waitForFunction(() => document.querySelector(".lx-splash")?.hasAttribute("data-live"));
  const t0 = await page.evaluate(() => performance.now());
  await page.keyboard.press("Space");
  await gone(1500);
  const s = await splash();
  return `gone ${Math.round(s.goneAt - t0)} ms after the key`;
});

for (const [label, appearance, media] of [
  ["Animations Off", { version: 1, presets: { motion: "off" } }, null],
  ["a device asking for reduced motion (Match device)", null, "reduce"],
]) {
  await stage(`${label}: its last frame as a still for half a second, then gone; nothing animates`, async () => {
    if (media) await page.emulateMedia({ reducedMotion: media });
    await open({ installed: true, firstOfDay: true, appearance });
    await gone(3000);
    const s = await splash();
    if (media) await page.emulateMedia({ reducedMotion: "no-preference" });
    const f = s.firstFrame;
    assert(s.mode === "still" && f?.mode === "still" && f.shown && f.last && !f.first, `the first frame drawn should be its last frame, still: ${JSON.stringify(f)}`);
    assert(!s.liveSvg && s.runAt == null, "nothing should animate (splash-run.js never takes a still)");
    const off = Math.min(s.offAt ?? Infinity, s.goneAt ?? Infinity);
    assert(off >= 480 && off <= 900, `it should go half a second after the first paint, on its own: off at ${off} ms`);
    return `its last frame from the first paint (${f.at} ms), off at ${off} ms`;
  });
}

await stage("before the app's code arrives, a press ends it (theme-boot.js) and isn't passed through", async () => {
  await page.goto(`${BASE}/app/#today`);
  const release = await holdRunner();
  await open({ installed: true, firstOfDay: true });
  const before = await splash();
  assert(before.attr === "play" && before.overlay && before.runAt == null, `it should be showing, its runner not yet here: ${JSON.stringify(before)}`);
  const study = page.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: "Study" }).first();
  const box = await study.boundingBox();
  const hash = await page.evaluate(() => location.hash);
  const t0 = await page.evaluate(() => performance.now());
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  const ended = await page.evaluate(() => window.lxSplash.endedAt);
  await gone(3000);
  await release();
  await wait(400);
  const after = await splash();
  const hashAfter = await page.evaluate(() => location.hash);
  await study.tap();
  await page.waitForFunction(() => location.hash.startsWith("#study"), null, { timeout: 3000 }).catch(() => {});
  const next = await page.evaluate(() => location.hash);
  assert(ended != null && ended - t0 < 120, `the press should end it at once (ended ${ended == null ? "never" : `${Math.round(ended - t0)} ms after`})`);
  assert(hashAfter === hash, `the press reached the app under it: ${hash} → ${hashAfter}`);
  assert(!after.liveSvg && after.runAt == null && !after.attr && !after.overlay, `the runner arriving late should leave it ended: ${JSON.stringify(after)}`);
  assert(next.startsWith("#study"), `the app should answer the next press: ${next}`);
  return `ended ${Math.round(ended - t0)} ms after the press, the runner arriving later left it so; the next press went to Study`;
});

await stage("a splash the app's code never starts steps aside after 6 s, fading into the app", async () => {
  const release = await holdRunner();
  await open({ installed: true, firstOfDay: true });
  await gone(9000);
  const s = await splash();
  await release();
  await wait(400);
  const after = await splash();
  const off = Math.min(s.offAt ?? Infinity, s.goneAt ?? Infinity);
  assert(s.runAt == null && !s.liveSvg, `its runner should have been held back: ${JSON.stringify(s)}`);
  assert(s.mode === "play" && s.firstFrame?.first, `it should have shown its first frame: ${JSON.stringify(s.firstFrame)}`);
  assert(off >= 5950 && off <= 6600, `it should step aside at 6 s: off at ${off} ms`);
  const f = fadeOf(s);
  assert(f.first >= 0.99 && f.between >= 4 && f.last <= 0.15, `it should fade into the app, never cut: ${JSON.stringify(s.fade)}`);
  assert(!after.liveSvg && !after.attr && !after.overlay, `the runner arriving after should do nothing: ${JSON.stringify(after)}`);
  return `stepped aside at ${off} ms, fading (${f.between} frames on the way); the late runner did nothing`;
});

await stage("an app that draws after 6 s: the first frame holds until it has drawn, then fades into it, never into an app half drawn", async () => {
  const pattern = "**/js/shell/main.js*";
  await page.route(pattern, async (route) => {
    await wait(6500);
    await route.continue().catch(() => {});
  });
  try {
    await page.evaluate(() => {
      sessionStorage.setItem("check.standalone", "1");
      localStorage.removeItem("lx.appearance.v1");
      const now = new Date(Date.now() - 4 * 3600 * 1000);
      localStorage.setItem("lx.splash.day", `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`);
    });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.goto(`${BASE}/app/#today`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.lxSplash?.goneAt != null && window.lxSplash?.drawnAt != null, null, { timeout: 30_000 });
  } finally {
    await page.unroute(pattern);
  }
  const s = await splash();
  const f = fadeOf(s);
  assert(s.drawnAt > 6000, `the app drew at ${s.drawnAt} ms: not late enough to tell`);
  assert(s.goingAt >= s.drawnAt, `it began fading at ${s.goingAt} ms, before the app had drawn at ${s.drawnAt}`);
  assert(f.first >= 0.99 && f.between >= 4 && f.last <= 0.15, `it should fade into the app, never cut: ${JSON.stringify(s.fade)}`);
  return `drawn at ${s.drawnAt} ms; the fade from ${s.goingAt} ms, ${f.between} frames on the way`;
});

await stage("an app that never draws: the first frame steps aside at 12 s, fading", async () => {
  const pattern = "**/js/shell/main.js*";
  let s = null;
  await page.route(pattern, () => {}); // never answered
  try {
    await page.evaluate(() => {
      sessionStorage.setItem("check.standalone", "1");
      const now = new Date(Date.now() - 4 * 3600 * 1000);
      localStorage.setItem("lx.splash.day", `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`);
    });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.goto(`${BASE}/app/#today`, { waitUntil: "commit" }); // its module never arrives, so it never gets to DOMContentLoaded
    await page.waitForFunction(() => window.lxSplash?.goneAt != null, null, { timeout: 20_000 });
    s = await splash();
  } finally {
    await page.unroute(pattern);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" }).catch(() => {}); // off the page whose module is still asked for
  }
  assert(s.drawnAt == null, `the app drew at ${s.drawnAt}`);
  assert(s.goingAt >= 11_950 && s.goingAt <= 12_600, `it should step aside at 12 s: fading from ${s.goingAt} ms`);
  return `fading from ${s.goingAt} ms, gone at ${s.goneAt} ms`;
});

await stage("the first paint is the launch image for this screen (1170 × 2532), in the page below its status bar", async () => {
  // The splash's runner held back, so the first paint (static markup) stays on screen to be photographed (before 6 s).
  // The page is what's below the status bar (47 px on this phone, src/startup-images.ts): the two must match there.
  const STATUS_BAR = 47;
  await page.setViewportSize({ width: 390, height: 844 - STATUS_BAR });
  const release = await holdRunner();
  await page.evaluate(() => {
    sessionStorage.setItem("check.standalone", "1");
    localStorage.removeItem("lx.splash.day");
    localStorage.removeItem("lx.appearance.v1");
    localStorage.removeItem("lx.splash.heights"); // this page's own height, below: a new install's
  });
  // Opened, never reloaded: the stage before leaves the page on the site's home page, where theme-boot.js never starts a splash.
  await page.goto(`${BASE}/app/#today`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.getAttribute("data-splash") === "play");
  await wait(300);
  const shot = join(OUT, "first-paint.png");
  const at = await page.evaluate(() => performance.now());
  assert(at < 5500, `photographing at ${Math.round(at)} ms, too near its stepping aside at 6 s`);
  await page.screenshot({ path: shot });
  await release();
  await gone();
  // Compared in ImageMagick: the pixels more than 10% apart (edges drawn by two renderers differ by a pixel; the
  // picture must not). compare exits 1 when the images differ at all, and writes the count to stderr.
  await page.setViewportSize({ width: 390, height: 844 });
  const launch = join(OUT, "launch-below-status-bar.png");
  spawnSync("magick", [join(APP, "public/icons/startup/1170x2532.png"), "-crop", `1170x${(844 - STATUS_BAR) * 3}+0+${STATUS_BAR * 3}`, "+repage", launch]);
  const run = spawnSync("magick", ["compare", "-metric", "AE", "-fuzz", "10%", shot, launch, join(OUT, "first-paint-diff.png")], { encoding: "utf8" });
  assert(run.status === 0 || run.status === 1, `magick compare failed (${run.status}): ${run.stderr}`);
  const differing = Number(String(run.stderr).trim().split(/\s/)[0]);
  assert(Number.isFinite(differing), `magick compare said: ${run.stderr}`);
  const share = differing / (1170 * (844 - STATUS_BAR) * 3);
  assert(share <= 0.01, `${(share * 100).toFixed(2)}% of the pixels differ from the launch image (first-paint-diff.png)`);
  return `${(share * 100).toFixed(3)}% of the pixels differ (${differing})`;
});

await stage("delete the account", async () => {
  await page.goto(`${BASE}/app/#settings/account`);
  const row = (text) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${text}$`) }) }).first();
  await row("Delete my account").click();
  await row("Press again to delete it for good").click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  return "deleted";
});

await stage("no console errors", async () => {
  const real = problems.filter((p) => !/status of 401/.test(p));
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "splash-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
console.log(`${results.filter((r) => r.ok).length}/${results.length} stages passed`);
process.exit(failed ? 1 : 0);
