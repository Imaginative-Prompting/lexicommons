// A drawer slides up whole (ui.sheet, ui.sheetLayer): the frame it comes up in pays for laying out what it holds, and a slide started in that
// frame loses its first part to it; on its ease-out that's most of the move. On an iPhone Simulator (5 Nov 2026) every drawer's first frame was
// 57–180 ms and each arrived a quarter to most of the way up: a stutter. So a sheet is laid out at the slide's start, past the screen's foot, in
// the frame it comes up in, and slides from the next.
//
// Here, on a touch phone, by a real tap: Study's Choose the games and Choose your concepts, Read's Add a book or text, Settings → Language's
// drawer row, and Translate's Find a pack, each opened twice. For each, every frame: whether the sheet is on the page, its place, and when its
// slide was started. It fails on a slide started before a frame was drawn with the sheet laid out at its start (a headless browser times its
// own animations from their first drawn frame, so this is the cause, held: the stutter itself only an iPhone shows), on a first frame showing
// the sheet past a tenth of its way up, and on its height changing while it slides (the library's catalog held back 250 ms, as a phone's network: what's
// in a drawer is settled before it comes up, or it shrinks or grows under the finger's eye: Settings → Language's did, 776 to 308 px). --swap <path under public>=<file>: the app with files as they were, to see it fail on them.
// Usage: node scripts/drawer-open-check.mjs http://localhost:<port> <outDir> [--swap js/lx/ui.js=<old ui.js>]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/drawer-open-check.mjs http://localhost:<port> <outDir> [--swap <path>=<file>] (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
let failed = 0;
const report = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
const desk = await browser.newContext({ viewport: { width: 390, height: 844 } });
const signup = await desk.newPage();
const vauth = await desk.newCDPSession(signup);
await vauth.send("WebAuthn.enable");
await vauth.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await signup.goto(`${BASE}/app/`);
await signup.waitForURL(/\/login\?next=/);
await signup.click("summary");
await signup.fill('input[name="name"]', "Drawer Check");
await signup.click('#register button[type="submit"]');
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
for (let i = process.argv.indexOf("--swap"); i >= 0; i = process.argv.indexOf("--swap", i + 1)) {
  const [path, file] = process.argv[i + 1].split("=");
  await phone.route(`**/${path}*`, (route) => route.fulfill({ path: file, contentType: path.endsWith(".css") ? "text/css" : "text/javascript" }));
}
// The library's catalog a quarter of a second away, as on a phone's network: a drawer that's filtered by it once it's open changes under its slide.
await phone.route("**/library/catalogue.json*", async (route) => {
  await new Promise((r) => setTimeout(r, 250));
  await route.continue();
});
await phone.addCookies(await desk.cookies());
// Every frame from the start: its number and time, the sheet that's up (on the page, its translateY, its height), and each slide a sheet starts
// (Element.animate on a sheet, with the frame it was started in).
await phone.addInitScript(() => {
  const R = { frame: 0, rows: [], slides: [], on: false };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    if (R.on && this.matches?.('[data-part="sheet"]')) R.slides.push({ frame: R.frame, t: performance.now() });
    return animate.call(this, keyframes, options);
  };
  const tick = (t) => {
    R.frame++;
    if (R.on) {
      const s = [...document.querySelectorAll('[data-part="sheet"]')].find((x) => !x.hidden && x.getClientRects().length && !x.closest("[hidden]"));
      let ty = null;
      let h = null;
      if (s) {
        const m = getComputedStyle(s).transform;
        ty = m && m !== "none" ? new DOMMatrix(m).m42 : 0;
        h = s.getBoundingClientRect().height;
      }
      R.rows.push({ frame: R.frame, t, ty, h });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__drawers = R;
});
const page = await phone.newPage();
await page.goto(`${BASE}/app/#study`);
await page.waitForFunction(() => document.querySelector('[data-part="page"] [data-part="list-row"][aria-haspopup]'), null, { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(1500);

const typeTranslate = async () => {
  await page.evaluate(() => {
    const f = document.querySelector('[data-part="translate-field"] textarea');
    // A word no pack has: Translate's one drawer, Find a pack, is its wide button then (what the packs have is under the answer).
    f.value = "xyzzyq";
    f.dispatchEvent(new Event("input", { bubbles: true }));
    f.blur();
  });
  await page.waitForTimeout(2500);
};
const DRAWERS = [
  { name: "Choose the games", hash: "#study", opener: '[data-part="page"] [data-part="list-row"][aria-haspopup]', nth: 0 },
  { name: "Choose your concepts", hash: "#study", opener: '[data-part="page"] [data-part="list-row"][aria-haspopup]', nth: 1 },
  { name: "Read's Add a book or text", hash: "#read", opener: '[data-read-add]', nth: 0 },
  { name: "Settings → Language's drawer row", hash: "#settings/language", opener: '[data-part="page"] [aria-haspopup]', nth: 0 },
  { name: "Translate's Find a pack", hash: "#today/translate", opener: '[data-part="translate-more"][data-wide]', nth: 0, ready: typeTranslate },
];
const results = [];
for (const d of DRAWERS) {
  await page.evaluate((h) => (location.hash = h), d.hash);
  await page.waitForTimeout(1800);
  if (d.ready) await d.ready();
  for (let k = 0; k < 2; k++) {
    const opener = page.locator(d.opener).nth(d.nth);
    if (!(await opener.count())) {
      report(false, `${d.name}: there to open`, d.opener);
      break;
    }
    await opener.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.evaluate(() => Object.assign(window.__drawers, { rows: [], slides: [], on: true }));
    const box = await opener.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(900);
    const { rows, slides } = await page.evaluate(() => Object.assign(window.__drawers, { on: false }));
    const shown = rows.filter((r) => r.ty !== null);
    const first = shown[0];
    const travel = Math.max(1, ...shown.map((r) => r.h ?? 0));
    const slide = slides[0];
    // The slide's frame and the first frame the sheet was laid out in (its rows are read in each frame's first moment, so a sheet laid out in a
    // frame shows from the next row on: "laid out before the slide" is a row with it on the page, at its start, before the slide began).
    const laidOutFirst = slide ? shown.some((r) => r.frame <= slide.frame && Math.abs(r.ty - r.h) < 2) : false;
    const moving = shown.filter((r) => !slide || r.frame > slide.frame);
    const firstMoving = moving[0];
    const steps = moving.slice(1).map((r, i) => Math.abs(r.ty - moving[i].ty) / travel);
    const result = { name: d.name, open: k, slideFrame: slide?.frame ?? null, firstFrame: first?.frame ?? null, laidOutFirst, firstUp: firstMoving ? 1 - firstMoving.ty / travel : null, biggestStep: steps.length ? Math.max(...steps) : null, frames: moving.length };
    results.push(result);
    report(Boolean(slide) && laidOutFirst, `${d.name}, open ${k + 1}: laid out at its start in a frame before its slide began`, slide ? `slide started in frame ${slide.frame}, first on the page in frame ${first?.frame}` : "no slide");
    report(firstMoving && result.firstUp <= 0.1, `${d.name}, open ${k + 1}: its first frame sliding at its start`, firstMoving ? `${Math.round(result.firstUp * 100)}% of the way up` : "never seen");
    // (Its steps, read on the page's own frames, are a busy page more than a moving sheet: once a slide is going it runs apart from the page, and a
    // page busy mid-slide doesn't move it. Shown, not held.)
    console.log(`      its biggest step between the page's frames: ${Math.round((result.biggestStep ?? 0) * 100)}% in ${moving.length} frames`);
    const heights = [...new Set(moving.map((r) => Math.round(r.h)))];
    report(heights.length > 0 && Math.max(...heights) - Math.min(...heights) <= 2, `${d.name}, open ${k + 1}: the same height all the way up`, heights.slice(0, 4).join(" → ") + " px");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
  }
}
writeFileSync(`${OUT}/drawers.json`, JSON.stringify(results, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
