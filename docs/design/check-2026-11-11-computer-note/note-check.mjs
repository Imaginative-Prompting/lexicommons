// lx-app (scratch, recorded with the computer note, 11 Nov 2026): the sign-in pages' note on a computer, and never on a phone or a tablet.
// node note-check.mjs <app dir> http://localhost:<port> <outDir>   (exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [APP, BASE, outArg] = process.argv.slice(2);
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(pathToFileURL(join(resolve(APP), "scripts/quiet-browser.mjs")).href);
const browser = await chromium.launch();
const results = [];
let failed = 0;
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
};
const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};
async function look(path, { width, height, scheme = "light", ua, touchPoints = 0, mobile = false, shot = null }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: scheme, userAgent: ua, isMobile: mobile, hasTouch: touchPoints > 0 });
  if (touchPoints > 1) await context.addInitScript((n) => Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => n }), touchPoints);
  const page = await context.newPage();
  const errors = [];
  const asked = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => r.url().includes("qr-lexicommons") && asked.push(r.url()));
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  const seen = await page.evaluate(() => {
    const note = document.getElementById("on-a-computer");
    const img = note?.querySelector("img");
    const box = note?.getBoundingClientRect();
    const ways = document.getElementById("auth")?.getBoundingClientRect();
    const rows = document.querySelectorAll('#auth form[action^="/login/"]').length;
    return {
      here: Boolean(note), shown: Boolean(note && !note.hidden && box.height > 0), loaded: Boolean(img?.complete && img.naturalWidth > 0), text: note?.textContent.replace(/\s+/g, " ").trim() ?? "",
      bottom: box ? Math.round(box.bottom) : 0, top: box ? Math.round(box.top) : 0, left: box ? Math.round(box.left) : 0, mid: box ? Math.round((box.top + box.bottom) / 2) : 0, vh: innerHeight, scrollable: document.documentElement.scrollHeight > innerHeight,
      ways: ways ? { top: Math.round(ways.top), bottom: Math.round(ways.bottom), right: Math.round(ways.right) } : null, rows,
    };
  });
  if (shot) await page.screenshot({ path: join(OUT, shot) });
  await context.close();
  return { ...seen, errors, asked };
}
try {
  for (const [width, height] of [[1280, 800], [1440, 900]])
    for (const scheme of ["light", "dark"]) {
      const r = await look("/login?new=1", { width, height, scheme, ua: UA.mac, shot: `create-account-${width}-${scheme}.png` });
      check(`a computer (Chrome on a Mac), Create your account at ${width}×${height}, ${scheme}: the note shown with its code`, r.shown && r.loaded && !r.errors.length, `${r.text.slice(0, 70)}…; code ${r.loaded ? "loaded" : "NOT loaded"}; foot at ${r.bottom} of ${r.vh}${r.errors.length ? `; errors ${r.errors}` : ""}`);
    }
  const signIn = await look("/login", { width: 1280, height: 800, ua: UA.mac, shot: "sign-in-1280-light.png" });
  check("a computer, Sign in at 1280: the note shown", signIn.shown && signIn.loaded, signIn.text.slice(0, 60));
  // Where it sits (with the sign-in rows a server has: --providers draws Google's and GitHub's): on a wide window beside the ways in, level with
  // them and in view with no scroll; on a narrower one under them.
  const beside = (r) => r.ways && r.left >= r.ways.right + 24 && r.mid >= r.ways.top && r.mid <= r.ways.bottom && r.top >= 0 && r.bottom <= r.vh;
  for (const [path, width, height, scheme, shot] of [["/login?new=1", 1280, 800, "light", "beside-create-1280-light.png"], ["/login?new=1", 1280, 800, "dark", "beside-create-1280-dark.png"], ["/login?new=1", 1440, 900, "light", "beside-create-1440-light.png"], ["/login?new=1", 1440, 900, "dark", "beside-create-1440-dark.png"], ["/login", 1280, 800, "light", "beside-sign-in-1280-light.png"]]) {
    const r = await look(path, { width, height, scheme, ua: UA.mac, shot });
    check(`a wide window, ${path} at ${width}×${height} ${scheme}: the note beside the ways in, level with them, in view with no scroll`, r.shown && beside(r), `${r.rows} sign-in rows; ways ${JSON.stringify(r.ways)}; note left ${r.left}, top ${r.top}, middle ${r.mid}, bottom ${r.bottom} of ${r.vh}`);
  }
  const narrow = await look("/login?new=1", { width: 900, height: 800, ua: UA.mac, shot: "under-create-900-light.png" });
  check("a narrower window (900): the note under the ways in, as before", narrow.shown && narrow.ways && narrow.top >= narrow.ways.bottom, `ways bottom ${narrow.ways?.bottom}, note top ${narrow.top}`);
  for (const [name, opts] of [
    ["an iPhone (Safari)", { width: 390, height: 844, ua: UA.iphone, touchPoints: 5, mobile: true, shot: "create-account-iphone-390.png" }],
    ["an iPad asking for the desktop page (a Mac's user agent, touch)", { width: 1180, height: 820, ua: UA.ipad, touchPoints: 5, shot: "create-account-ipad-1180.png" }],
    ["an Android tablet (Chrome)", { width: 1280, height: 800, ua: UA.androidTablet, touchPoints: 5 }],
  ]) {
    const r = await look("/login?new=1", opts);
    check(`${name}: no note, and the code never fetched`, r.here && !r.shown && !r.asked.length && !r.errors.length, `in the page ${r.here}, shown ${r.shown}, code fetched ${r.asked.length}`);
  }
  // The control: the same iPad without touch reads as a Mac, so the measure sees the note when it's there.
  const mac = await look("/login?new=1", { width: 1180, height: 820, ua: UA.ipad });
  check("the control: that user agent with no touch is a Mac: the note shown", mac.shown, "");
} catch (error) {
  check("the run", false, error.message);
}
await browser.close();
writeFileSync(join(OUT, "note-check.json"), JSON.stringify(results, null, 1));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
