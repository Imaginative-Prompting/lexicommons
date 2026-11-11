// Sound effects in the real app, muted (lx/sound.js; scripts/quiet-browser.mjs plays Web Audio at zero volume): a new account on a phone screen.
//   - Settings → Sound and speech: the Sound effects switch, on by default; off, it's saved as a choice ({ effects: false, at }) and
//     every role's request is told as not played ("off"); on again.
//   - Every role asked for after a press: told on window as "lx-sound" with its role. Until the kit's files are in (KIT_READY false), none
//     plays ("no-kit") and no file under /audio/fx/ is asked for; once they are, every file is fetched once, from the app's shell, and
//     decodes in this engine (nothing is played to check that), and each role plays (one the kit leaves silent is told as "none").
//   - No page errors.
// node scripts/sound-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit]   LOCAL only (it signs up a test account) (exit 0 = pass)

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, webkit } from "./quiet-browser.mjs";

const args = process.argv.slice(2);
const [BASE, outArg] = args;
if (!BASE || !outArg || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  console.error("usage: sound-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit]   (local servers only)");
  process.exit(64);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
const ENGINES = (args.includes("--engines") ? args[args.indexOf("--engines") + 1] : "chromium,webkit").split(",");
const ROLES = ["right", "wrong", "tile-in", "tile-out", "match", "match-last", "match-miss", "session-done", "day-counted", "unit-done", "path-press", "tinta-hop"];

let failed = 0;
const check = (engine, ok, what) => {
  console.log(`${engine} ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};

async function signUp(page, context, engine) {
  if (engine === "chromium") {
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  }
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Sound Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/app/", { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
}

for (const engine of ENGINES) {
  // WebKit headless has no virtual authenticator: it signs in with the account Chromium made (a cookie handed across).
  if (engine === "webkit" && !globalThis.__cookies) {
    console.log("webkit skipped: needs Chromium's account first (run chromium,webkit)");
    continue;
  }
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: engine === "chromium", serviceWorkers: "block" });
    const fx = [];
    context.on("request", (r) => r.url().includes("/audio/fx/") && fx.push(r.url()));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    if (engine === "webkit") {
      await context.addCookies(globalThis.__cookies);
      await page.goto(`${BASE}/app/`);
      await page.waitForSelector("html[data-app-ready]");
    } else {
      await signUp(page, context, engine);
      globalThis.__cookies = await context.cookies();
    }
    await page.evaluate(() => {
      window.__told = [];
      addEventListener("lx-sound", (e) => window.__told.push(e.detail));
    });
    const kit = await page.evaluate(async () => (await import("/js/lx/sound-kit.js")).KIT_READY);
    // A press, as a person's would be (the context comes with it).
    await page.locator("body").click({ position: { x: 5, y: 400 } });
    // The switch.
    await page.goto(`${BASE}/app/#settings/voice`);
    const row = page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: /^Sound effects$/ }) });
    await row.waitFor();
    const toggle = row.locator('[data-part="switch"]');
    check(engine, await toggle.isChecked(), "Sound effects is on by default");
    await row.click();
    check(engine, !(await toggle.isChecked()), "a press turns it off");
    const saved = await page.evaluate(async () => (await import("/js/study/settings.js")).getStudySettings().sound);
    check(engine, saved?.effects === false && saved.at > 0, `saved as a choice to sync: ${JSON.stringify(saved)}`);
    const off = await page.evaluate(async (roles) => {
      const { play } = await import("/js/lx/sound.js");
      window.__told.length = 0;
      for (const role of roles) play(role, { step: 1 });
      return window.__told.map((d) => `${d.role}:${d.played ? "played" : d.why}`);
    }, ROLES);
    check(engine, off.length === ROLES.length && off.every((s) => s.endsWith(kit ? ":off" : ":no-kit") || s.endsWith(":off")), `off: every role told, none played (${[...new Set(off.map((s) => s.split(":")[1]))].join(", ")})`);
    await row.click();
    check(engine, await toggle.isChecked(), "and on again");
    // Every role after a press.
    await page.locator("body").click({ position: { x: 5, y: 700 } });
    if (kit) await page.evaluate(async () => (await import("/js/lx/sound.js")).loadSounds());
    const on = await page.evaluate(async (roles) => {
      const { play } = await import("/js/lx/sound.js");
      window.__told.length = 0;
      for (const role of roles) {
        play(role, { step: 1 });
        await new Promise((r) => setTimeout(r, 40));
      }
      return window.__told.map((d) => ({ role: d.role, played: d.played, why: d.why, file: d.file }));
    }, ROLES);
    check(engine, ROLES.every((role) => on.some((d) => d.role === role)), `every role's request told (${on.length})`);
    if (!kit) {
      check(engine, on.every((d) => !d.played && d.why === "no-kit"), `before the kit: none played, all "no-kit"`);
      check(engine, fx.length === 0, `before the kit: no file asked for (${fx.length})`);
    } else {
      // A role the kit leaves silent on purpose (no files) is told as "none"; every other plays.
      const silent = await page.evaluate(async () => Object.entries((await import("/js/lx/sound-kit.js")).ROLES).filter(([, r]) => !r.files.length).map(([role]) => role));
      const wrong = on.filter((d) => (silent.includes(d.role) ? d.played || d.why !== "none" : !d.played));
      check(engine, wrong.length === 0, `with the kit: every role played${silent.length ? `, but ${silent.join(", ")}, silent in this kit ("none")` : ""} (${wrong.map((d) => `${d.role}:${d.played ? "played" : d.why}`).join(", ") || "as expected"})`);
      const files = await page.evaluate(async () => (await import("/js/lx/sound-kit.js")).kitFiles());
      check(engine, files.every((f) => fx.some((u) => u.endsWith(f))) && new Set(fx).size === fx.length, `every kit file fetched once (${new Set(fx).size} of ${files.length})`);
      // Each decoded as the app decodes it, and where the app would start it (sound-kit.js shapeOf: its first audible sample, past a
      // decoder's padding: WebKit keeps an MP3 encoder's delay that Chrome trims, about 25 ms).
      const decoded = await page.evaluate(async (files) => {
        const { shapeOf } = await import("/js/lx/sound-kit.js");
        const out = {};
        for (const f of files) {
          try {
            const ctx = new OfflineAudioContext(1, 1, 48000);
            const b = await ctx.decodeAudioData(await (await fetch(f)).arrayBuffer());
            const shape = shapeOf(b.getChannelData(0), b.sampleRate);
            out[f] = { ms: Math.round(b.duration * 1000), startMs: Math.round(shape.start * 1000), clearMs: Math.round(shape.clear * 1000) };
          } catch (e) {
            out[f] = { error: String(e) };
          }
        }
        return out;
      }, files);
      const bad = Object.entries(decoded).filter(([, v]) => v.error || v.ms < 20);
      check(engine, bad.length === 0, `every kit file decodes here (${bad.map(([k, v]) => `${k}: ${v.error ?? v.ms}`).join(", ") || Object.keys(decoded).length + " files"})`);
      const late = Object.entries(decoded).filter(([, v]) => !v.error && v.startMs > 60);
      const starts = Object.values(decoded).filter((v) => !v.error).map((v) => v.startMs);
      check(engine, late.length === 0, `each starts at its first sound, past any padding: ${Math.min(...starts)}–${Math.max(...starts)} ms in (${late.map(([k, v]) => `${k}: ${v.startMs} ms`).join(", ") || "none later than 60 ms"})`);
      writeFileSync(join(OUT, `decoded-${engine}.json`), JSON.stringify(decoded, null, 1));
    }
    await page.screenshot({ path: join(OUT, `${engine}-settings.png`) });
    check(engine, errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  } finally {
    await browser.close();
  }
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
