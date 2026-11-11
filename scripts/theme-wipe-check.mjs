// A new theme in Settings → Appearance (character/theme-wipe.js): the old theme stays a moment as a picture of the app, a hole opening in it from
// under Tinta. On an iPhone Simulator (5 Nov 2026) that picture showed for about 70 ms before the app's rules reached it (its closed shadow
// root's adopted sheet came a few frames late): unstyled, its links underlined, Tinta's drawing at its natural size over half the screen, the
// page seeming to jump; and taps in a row each started a new picture, splat and shake. Headless Chromium applies the sheet at once, so this
// plays the late sheet (--late <frames>, 5 by default: the picture's rules held back that many frames, as WebKit did) and holds the cause:
// a picture is never shown unless it's drawn as the page is (its Tinta and the page's title where the page's are), every frame.
//   1. One change: the picture lined up every frame it shows; the theme changes and the wipe plays (a hole opening frame by frame, gone
//      within about a second); the page's own parts (title, the Theme label, Tinta, the swatches) where they were; no frame shows the new
//      theme before the picture is up and then the old one again.
//   2. Taps in a row (four swatches 150 ms apart, by real touch): one picture at most, never a new one per tap; it settles on the last tapped,
//      with nothing left over (no picture, no ink edge, Tinta not shaking).
//   3. A picture that never gets its rules (held back 40 frames): the theme just changes, nothing unstyled shown.
//   4. Animations off: no picture at all.
//   5. Tinta off the screen (the wipe called as the picker calls it): the theme just changes, nothing left over it, no error.
// --swap <path under public>=<file>: the app with files as they were, to see it fail on them.
// Usage: node scripts/theme-wipe-check.mjs http://localhost:<port> <outDir> [--late <frames>] [--swap js/character/theme-wipe.js=<old>]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/theme-wipe-check.mjs http://localhost:<port> <outDir> [--late <frames>] [--swap <path>=<file>] (a local server only: it signs up a test account)");
  process.exit(2);
}
const LATE = process.argv.includes("--late") ? Number(process.argv[process.argv.indexOf("--late") + 1]) : 5;
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
await signup.fill('input[name="name"]', "Theme Check");
await signup.click('#register button[type="submit"]');
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
for (let i = process.argv.indexOf("--swap"); i >= 0; i = process.argv.indexOf("--swap", i + 1)) {
  const [path, file] = process.argv[i + 1].split("=");
  await phone.route(`**/${path}*`, (route) => route.fulfill({ path: file, contentType: path.endsWith(".css") ? "text/css" : "text/javascript" }));
}
await phone.addCookies(await desk.cookies());
// The picture's shadow root, kept for this check (it's closed), with its rules held back `late` frames as WebKit did; and every frame, from the
// start: the theme, each picture (shown or not, its Tinta and title against the page's), the page's own parts, an ink edge, Tinta's state.
await phone.addInitScript((late) => {
  const roots = new WeakMap();
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = attach.call(this, init);
    roots.set(this, root);
    return root;
  };
  const own = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "adoptedStyleSheets") ?? Object.getOwnPropertyDescriptor(Document.prototype, "adoptedStyleSheets");
  Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", {
    configurable: true,
    get() {
      return own.get.call(this);
    },
    set(sheets) {
      if (!this.host?.hasAttribute("data-theme-picture") || !window.__late) return own.set.call(this, sheets);
      own.set.call(this, []);
      let n = window.__late;
      const later = () => (--n > 0 ? requestAnimationFrame(later) : own.set.call(this, sheets));
      requestAnimationFrame(later);
    },
  });
  window.__late = late;
  const R = { rows: [], on: false, t0: 0, pictures: new Set(), seen: new Set() };
  const box = (n) => {
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  };
  const off = (a, b) => (a && b ? Math.max(...a.map((v, i) => Math.abs(v - b[i]))) : null);
  const shownTitle = (scope) => [...scope.querySelectorAll('[data-part="page-title"]')].find((t) => t.getClientRects().length && t.getBoundingClientRect().width > 0);
  const tick = (t) => {
    if (R.on) {
      const page = [...document.querySelectorAll('[data-part="page"]')].find((x) => !x.closest("[data-ghost]") && x.getClientRects().length);
      const tinta = document.querySelector('.lx-theme-head > [data-part="character"]');
      const title = page && shownTitle(page);
      const pictures = [...document.querySelectorAll("[data-theme-picture]")];
      for (const p of pictures) R.pictures.add(p);
      const shown = pictures.filter((p) => Number(getComputedStyle(p).opacity) > 0);
      for (const p of shown) R.seen.add(p);
      const lineUp = shown.map((p) => {
        const root = roots.get(p);
        const still = root?.querySelector('.lx-theme-head > [data-part="character"]');
        const copyTitle = root && shownTitle(root);
        return { tinta: off(box(still), box(tinta)), title: off(box(copyTitle), box(title)), stillBox: box(still) };
      });
      R.rows.push({
        t: t - R.t0,
        theme: document.documentElement.getAttribute("data-theme"),
        pictures: pictures.length,
        shown: shown.length,
        clip: shown[0]?.style.clipPath.length ?? 0,
        lineUp,
        edges: document.querySelectorAll("body > svg[data-ghost]").length,
        tintaState: tinta?.getAttribute("data-state"),
        parts: { title: box(title), label: box(page?.querySelector('.lx-theme-head [data-part="group-label"]')), tinta: box(tinta), swatch: box(page?.querySelector('.lx-theme-picker [data-part="theme-swatch"]')) },
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  R.start = () => Object.assign(R, { rows: [], on: true, t0: performance.now(), pictures: new Set(), seen: new Set() }) && 1;
  R.stop = () => {
    R.on = false;
    return { rows: R.rows, made: R.pictures.size, seen: R.seen.size };
  };
  window.__wipe = R;
}, LATE);

const page = await phone.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const open = async () => {
  // (A goto to the same address with only a hash is no reload.)
  if (page.url().startsWith(`${BASE}/app/`)) await page.reload();
  else await page.goto(`${BASE}/app/#settings/appearance`);
  await page.waitForSelector('.lx-theme-head > [data-part="character"] svg', { timeout: 15_000 });
  await page.waitForTimeout(1200);
  // theme-wipe.js loads with the page (appearance.js imports it; until it has, a new theme just changes, with no wipe): waited for, as a busy
  // machine took longer than the wait above to bring it and the first change made no picture. The same address is the same module, so this
  // loads nothing the page hasn't asked for; a page that never asks still has no wipe.
  await page.evaluate(async () => {
    await import("/js/character/theme-wipe.js");
    await new Promise((done) => setTimeout(done, 0));
  });
};
const swatch = (name) => page.locator('.lx-theme-picker [data-part="theme-swatch"]', { hasText: new RegExp(`^${name}`) }).first();
const tap = async (name) => {
  const b = await swatch(name).boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};
const record = async (ms, act) => {
  await page.evaluate(() => window.__wipe.start());
  await act();
  await page.waitForTimeout(ms);
  return page.evaluate(() => window.__wipe.stop());
};
const misaligned = (rows) => rows.filter((r) => r.lineUp.some((l) => l.tinta === null || l.tinta > 2 || (l.title !== null && l.title > 2)));
const steady = (rows, key) => [...new Set(rows.map((r) => JSON.stringify(r.parts[key])))];
const theme = () => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const leftover = () => page.evaluate(() => ({ pictures: document.querySelectorAll("[data-theme-picture]").length, edges: document.querySelectorAll("body > svg[data-ghost]").length, shaking: document.querySelector('.lx-theme-head > [data-part="character"]')?.getAttribute("data-state") === "shake" }));

await open();
const names = await page.evaluate(() => [...document.querySelectorAll('.lx-theme-picker [data-part="theme-swatch"]')].map((s) => s.textContent.trim()));
console.log(`swatches: ${names.join(", ")}; the picture's rules held back ${LATE} frames`);
const pick = names.filter((n) => /^(Paper|Graphite|Sepia|Ink)/.test(n)).map((n) => n.split(/\s/)[0]);

// 1. One change.
{
  const from = await theme();
  const target = pick.find((n) => n.toLowerCase() !== from) ?? pick[0];
  const { rows, made } = await record(1800, () => tap(target));
  writeFileSync(join(OUT, "once.json"), JSON.stringify(rows));
  const to = rows.at(-1).theme;
  const bad = misaligned(rows);
  report(bad.length === 0, "one change: the picture shown only drawn as the page is (its Tinta and title in the page's places)", bad.length ? `${bad.length} frames off, the first at ${Math.round(bad[0].t)} ms: ${JSON.stringify(bad[0].lineUp)}` : `${rows.filter((r) => r.shown).length} frames shown`);
  const changed = rows.findIndex((r) => r.theme !== from);
  // On the press, or the moment the picture is drawn in its rules (the rules held back LATE frames): counted in frames, which a busy machine
  // stretches and a phone doesn't.
  report(changed >= 0 && (rows[changed].t < 400 || changed <= LATE + 6), "one change: the theme changes on the press, or as soon as its picture is drawn", changed >= 0 ? `${from} → ${to} at ${Math.round(rows[changed].t)} ms, frame ${changed}` : "never");
  const shown = rows.filter((r) => r.shown);
  const holes = new Set(shown.map((r) => r.clip)).size;
  const last = rows.findLastIndex((r) => r.pictures);
  report(shown.length >= 10 && holes >= 6 && last >= 0 && rows[last].t < 1300, "one change: the wipe plays, a hole opening frame by frame, gone within about a second", `${shown.length} frames, ${holes} holes, made ${made}, last at ${last >= 0 ? Math.round(rows[last].t) : "-"} ms`);
  const flash = rows.findIndex((r, i) => r.theme !== from && !r.shown && rows.slice(i + 1).some((x) => x.shown));
  report(flash < 0, "one change: no frame shows the new theme bare and then the old one's picture", flash >= 0 ? `at ${Math.round(rows[flash].t)} ms` : "");
  const moved = ["title", "label", "tinta", "swatch"].filter((k) => steady(rows, k).length > 1);
  report(moved.length === 0, "one change: the page's own parts stay where they were", moved.map((k) => `${k}: ${steady(rows, k).slice(0, 3).join(" → ")}`).join("; "));
}

// 2. Taps in a row.
{
  await page.waitForTimeout(1500);
  // Four taps, none on the theme in use when it's tapped.
  const now0 = await theme();
  const rest = pick.filter((n) => n.toLowerCase() !== now0);
  const order = [rest[0], rest[1], now0 && pick.find((n) => n.toLowerCase() === now0), rest[0]].filter(Boolean);
  const { rows, made, seen } = await record(2200, async () => {
    for (const name of order) {
      await tap(name);
      await page.waitForTimeout(150);
    }
  });
  writeFileSync(join(OUT, "fast.json"), JSON.stringify(rows));
  const bad = misaligned(rows);
  report(bad.length === 0, "taps in a row: no picture shown unless drawn as the page is", bad.length ? `${bad.length} frames off: ${JSON.stringify(bad[0].lineUp)}` : "");
  report(seen <= 1 && Math.max(...rows.map((r) => r.pictures)) <= 1, "taps in a row: one picture at most, never a new one per tap", `${seen} shown (${made} made) for ${order.length} taps: ${order.join(", ")}`);
  const want = order.at(-1).toLowerCase();
  const now = await theme();
  const left = await leftover();
  report(now === want && !left.pictures && !left.edges && !left.shaking, "taps in a row: settles on the last one tapped, nothing left over", `${now} (wanted ${want}); ${JSON.stringify(left)}`);
}

// 3. A picture that never gets its rules.
{
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window.__late = 40));
  const from = await theme();
  const target = pick.find((n) => n.toLowerCase() !== from);
  const { rows } = await record(1800, () => tap(target));
  writeFileSync(join(OUT, "never.json"), JSON.stringify(rows));
  await page.evaluate((late) => (window.__late = late), LATE);
  const bad = misaligned(rows);
  const changed = rows.findIndex((r) => r.theme !== from);
  const left = await leftover();
  report(bad.length === 0 && changed >= 0 && rows[changed].t < 500 && !left.pictures, "never drawn in its rules: the theme just changes, nothing unstyled shown", `${bad.length} frames off; changed at ${changed >= 0 ? Math.round(rows[changed].t) : "never"} ms; ${JSON.stringify(left)}`);
}

// 4. Animations off.
{
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("lx.appearance.v1") ?? "{}");
    localStorage.setItem("lx.appearance.v1", JSON.stringify({ ...saved, version: 1, presets: { ...(saved.presets ?? {}), motion: "off" } }));
  });
  await open();
  const from = await theme();
  const target = pick.find((n) => n.toLowerCase() !== from);
  const { rows, made } = await record(900, () => tap(target));
  report(made === 0 && rows.at(-1).theme === target.toLowerCase(), "animations off: the theme just changes, no picture", `${from} → ${rows.at(-1).theme}, ${made} pictures`);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("lx.appearance.v1") ?? "{}");
    if (saved.presets) delete saved.presets.motion;
    localStorage.setItem("lx.appearance.v1", JSON.stringify(saved));
  });
}

// 5. Tinta off the screen (a long picker scrolled past it): the wipe has nowhere to start, so the theme just changes, with no picture
// left over the new theme and no error. Called as the picker calls it, so it holds whatever the picker does first (before 6 Nov, the
// wipe's frame threw a RangeError on the splat's empty box and left the old theme's picture up).
{
  await open();
  const from = await theme();
  const target = pick.find((n) => n.toLowerCase() !== from);
  const before = errors.length;
  await page.evaluate(async (id) => {
    const tinta = document.querySelector('.lx-theme-head > [data-part="character"]');
    tinta.style.translate = "0 -1600px"; // above the screen, as when the page is scrolled down past it
    const [{ wipeTheme }, theme] = await Promise.all([import("/js/character/theme-wipe.js"), import("/js/lx/theme.js")]);
    await wipeTheme(() => theme.useTheme(id), tinta);
  }, target.toLowerCase());
  await page.waitForTimeout(1500);
  const left = await leftover();
  const now = await theme();
  const thrown = errors.slice(before);
  await page.evaluate(() => document.querySelector('.lx-theme-head > [data-part="character"]')?.style.removeProperty("translate"));
  report(now === target.toLowerCase() && !left.pictures && !left.edges && thrown.length === 0, "Tinta off the screen: the theme just changes, nothing left over it, no error", `${from} → ${now}; ${left.pictures} pictures, ${left.edges} edges left; ${thrown.length ? thrown[0].slice(0, 160) : "no error"}`);
}

report(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
