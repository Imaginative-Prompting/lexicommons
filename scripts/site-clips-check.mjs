#!/usr/bin/env node
// The home page's phones (public/index.html .site-clip, public/js/site.js) in a real browser, muted: each clip plays only while its
// phone is in view, from its poster's moment, looping; one far down the page isn't fetched until it's wanted; every phone's button
// pauses them all and the pause is kept for the visit; under reduced motion none is fetched or plays and the buttons stay hidden.
// A clip plays from a blob (Safari plays no video from a server that answers a Range request whole, as the site's static files do).
// Each stage's control is another stage: the motion run fetches and plays what the reduced-motion run never does.
// Usage: node scripts/site-clips-check.mjs <base url> <outDir> [--engines chromium,webkit]   (through gpu.py's parallel lane; exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, webkit } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, OUT] = argv;
const ENGINES = (argv.includes("--engines") ? argv[argv.indexOf("--engines") + 1] : "chromium,webkit").split(",");
if (!/^https?:\/\//.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/site-clips-check.mjs <base url> <outDir> [--engines chromium,webkit]");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
};
const state = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".site-clip")].map((clip) => ({
      id: clip.dataset.src.split("/").pop(),
      start: Number(clip.dataset.start),
      src: clip.currentSrc || clip.src || "",
      paused: clip.paused,
      time: clip.currentTime,
      duration: clip.duration,
      loop: clip.loop,
      muted: clip.muted,
    })),
  );
const buttonsState = (page) => page.evaluate(() => [...document.querySelectorAll(".site-pause")].map((b) => ({ hidden: b.hidden, pressed: b.getAttribute("aria-pressed") })));
const wait = (page, ms) => page.waitForTimeout(ms);
const pollFor = async (page, test, ms = 8000) => {
  for (let waited = 0; waited < ms; waited += 200) {
    if (test(await state(page))) return true;
    await wait(page, 200);
  }
  return false;
};

for (const engine of ENGINES) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: true });
  for (const motion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: motion, serviceWorkers: "block", ...(engine === "chromium" ? { hasTouch: true, isMobile: true } : {}) });
    const page = await context.newPage();
    const fetched = [];
    page.on("request", (r) => /\/icons\/site\/clips\/.+\.mp4/.test(r.url()) && fetched.push(new URL(r.url()).pathname.split("/").pop()));
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/`);
    await wait(page, 600);
    const tag = `${engine}, ${motion === "reduce" ? "reduced motion" : "motion"}`;
    if (motion === "reduce") {
      await wait(page, 2500);
      for (let y = 0; y < 9000; y += 600) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await wait(page, 250);
      }
      const clips = await state(page);
      check(`${tag}: no clip fetched, walking the whole page`, fetched.length === 0, fetched.join(", "));
      check(`${tag}: none plays; each shows its poster`, clips.every((c) => c.paused && !c.src), JSON.stringify(clips.filter((c) => !c.paused || c.src).map((c) => c.id)));
      check(`${tag}: the pause buttons stay hidden`, (await buttonsState(page)).every((b) => b.hidden));
      await page.screenshot({ path: join(OUT, `${engine}-reduced-top.png`) });
    } else {
      // The top phone's clip: plays, from a blob, from its poster's moment, muted, looping.
      const playing = await pollFor(page, (clips) => !clips[0].paused && clips[0].time > clips[0].start);
      let clips = await state(page);
      check(`${tag}: the top clip plays`, playing, JSON.stringify(clips[0]));
      check(`${tag}: from a blob, muted, looping`, clips[0].src.startsWith("blob:") && clips[0].muted && clips[0].loop, clips[0].src.slice(0, 40));
      check(`${tag}: it started at its poster's moment (${clips[0].start} s), never at the loop's join`, clips[0].time >= clips[0].start - 0.05, `at ${clips[0].time.toFixed(2)} s`);
      const far = clips.at(-1).id;
      check(`${tag}: the last phone's clip isn't fetched while it's out of view`, !fetched.includes(far), fetched.join(", "));
      // It loops: past its length, still playing.
      const length = clips[0].duration;
      await wait(page, Math.max(0, (length - (clips[0].time - clips[0].start)) * 1000) + 1500);
      clips = await state(page);
      check(`${tag}: it loops past its ${length.toFixed(1)} s`, !clips[0].paused && clips[0].time < length, `at ${clips[0].time.toFixed(2)} s`);
      // Scrolled to the third phone: it plays, and the top one pauses.
      await page.locator(".site-phone").nth(2).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 120));
      const third = await pollFor(page, (c) => !c[2].paused && c[2].time > c[2].start && c[0].paused);
      clips = await state(page);
      check(`${tag}: scrolled to the third phone, its clip plays and the top one pauses`, third, JSON.stringify([clips[0].paused, clips[2].paused, clips[2].time.toFixed(2)]));
      await page.screenshot({ path: join(OUT, `${engine}-third-playing.png`) });
      // The button: shown, pauses every clip, kept across a reload, and plays again.
      const buttons = await buttonsState(page);
      check(`${tag}: every phone has its pause button`, buttons.length === clips.length && buttons.every((b) => !b.hidden && b.pressed === "false"));
      await page.locator(".site-pause").nth(2).click();
      await wait(page, 400);
      clips = await state(page);
      check(`${tag}: pressed, every clip pauses and every button says so`, clips.every((c) => c.paused) && (await buttonsState(page)).every((b) => b.pressed === "true"));
      await page.reload();
      await page.locator(".site-phone").nth(2).scrollIntoViewIfNeeded();
      await wait(page, 2500);
      clips = await state(page);
      check(`${tag}: after a reload it stays paused`, clips.every((c) => c.paused) && (await buttonsState(page)).every((b) => b.pressed === "true"));
      await page.locator(".site-pause").nth(2).click();
      const again = await pollFor(page, (c) => !c[2].paused);
      check(`${tag}: pressed again, the clip in view plays`, again);
    }
    check(`${tag}: no page errors`, errors.length === 0, errors.join("; "));
    await context.close();
  }
  await browser.close();
}
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
