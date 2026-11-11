// A Settings row's value is never cut: every page of Settings on a phone at 320 and 390 wide, each row's value (ui.listRow's value: the
// language, the voice, a theme's name) read by where its words are drawn against the box that clips them. A value that doesn't fit wraps
// (shell.css); held to one line it lost its start, with no ellipsis. First a control: a value held to one line and too long for its room
// must be caught, so this can fail.
//
//   node scripts/settings-values-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]
//
// --from <copy> serves another copy's /css and /js (the app from before 10 Nov 2026 fails it at 320, on Sound and speech's Voices).
// LOCAL only (it signs up an account); through gpu.py's parallel lane. Exit 0 = pass.
import { chromium } from "./quiet-browser.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const FROM = argv.includes("--from") ? resolve(argv[argv.indexOf("--from") + 1]) : null;
if (!/^http:\/\/localhost:\d+$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/settings-values-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]   (LOCAL only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
let failed = 0;
const say = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

// Each value on the page now whose words are drawn outside the box that clips them: by more than a pixel, on either side.
const CUT = () => {
  const out = [];
  const page = document.querySelector('[data-part="page"]:not([data-ghost])');
  for (const value of page?.querySelectorAll(".lx-row-value") ?? []) {
    if (!value.getClientRects().length || !value.textContent.trim()) continue;
    const box = value.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(value);
    const words = range.getBoundingClientRect();
    const clips = getComputedStyle(value).overflowX !== "visible";
    const start = Math.round(box.left - words.left);
    const end = Math.round(words.right - box.right);
    if (clips && (start > 1 || end > 1)) out.push(`"${value.textContent.trim().slice(0, 40)}" (${start > 1 ? `${start} px of its start` : `${end} px of its end`} cut)`);
    else if (box.right > innerWidth + 1 || box.left < -1) out.push(`"${value.textContent.trim().slice(0, 40)}" (off the screen)`);
  }
  return out;
};

const MIME = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const PAGES = ["", "account", "language", "study", "study/games", "study/speaking", "study/voices", "study/practice", "study/quick", "study/memory", "voice", "translate", "appearance", "appearance/layout", "reminders", "storage", "downloads", "data", "about", "report"];
const browser = await chromium.launch({ headless: true });
const report = {};
for (const [width, height] of [[320, 568], [390, 844]]) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block", colorScheme: "dark" });
  if (FROM) {
    await context.route(/\/(js|css)\/[^?]+/, (route) => {
      const file = join(FROM, "public", new URL(route.request().url()).pathname);
      return existsSync(file) ? route.fulfill({ status: 200, contentType: MIME[extname(file)] ?? "application/octet-stream", body: readFileSync(file) }) : route.continue();
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', `Values ${width}`);
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  const open = async (sub) => {
    await page.evaluate((h) => (location.hash = h), `#settings${sub ? `/${sub}` : ""}`);
    await page.waitForTimeout(900);
  };
  if (width === 320) {
    // The control, on Settings' own menu: its first value held to one line with more words than its room.
    await open("");
    const planted = await page.evaluate(() => {
      const value = document.querySelector('[data-part="page"]:not([data-ghost]) .lx-row-value');
      if (!value) return null;
      const before = [value.textContent, value.getAttribute("style")];
      value.textContent = "Recorded, then a voice with a very long name indeed";
      value.style.whiteSpace = "nowrap";
      return { before };
    });
    const caught = await page.evaluate(CUT);
    await page.evaluate(([text, style]) => {
      const value = document.querySelector('[data-part="page"]:not([data-ghost]) .lx-row-value');
      value.textContent = text;
      if (style === null) value.removeAttribute("style");
      else value.setAttribute("style", style);
    }, planted?.before ?? ["", null]).catch(() => {});
    say(Boolean(planted) && caught.length > 0, "the control: a value held to one line and too long for its room is caught", caught[0] ?? "nothing caught");
  }
  const cut = [];
  let values = 0;
  for (const sub of PAGES) {
    await open(sub);
    values += await page.evaluate(() => [...(document.querySelector('[data-part="page"]:not([data-ghost])')?.querySelectorAll(".lx-row-value") ?? [])].filter((v) => v.getClientRects().length).length);
    const here = await page.evaluate(CUT);
    for (const one of here) cut.push(`${sub || "the menu"}: ${one}`);
    if (here.length || sub === "voice") await page.screenshot({ path: join(OUT, `${width}-${(sub || "menu").replace(/\W+/g, "-")}.png`) });
  }
  report[width] = { values, cut };
  say(values >= 8, `at ${width} the rows' values were read`, `${values} values on ${PAGES.length} pages of Settings`);
  say(cut.length === 0, `at ${width} no value is cut`, cut.join(" | "));
  say(errors.length === 0, `at ${width} no page error`, errors.slice(0, 2).join(" | "));
  await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
  await context.close();
}
writeFileSync(join(OUT, "settings-values-check.json"), JSON.stringify(report, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
