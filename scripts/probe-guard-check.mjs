// The device's native probes on a phone, in the real app (speech/probe-guard.js; study/game-modes.js; speech/speech.js, browser.js): an
// Android phone's browser (Samsung Internet 30's user agent), the GPU's requestAdapter and the recognizer's available() counted (stood in where
// the headless browser hasn't them; nothing is asked of a real GPU or recognizer). Opening Study asks neither (12 Nov 2026: Samsung Internet 30
// started the app again by itself on Study, where they were first asked); opening Say it asks both, each under its mark, cleared once
// answered. A mark planted as if the page had ended inside the GPU's probe: the next start reports it once (/api/errors, kind "probe-crash",
// naming the probe), Say it then asks the recognizer but never the GPU, and the start after reports nothing more. With --persist-to (the
// server's local state), the reports go on to the server, and the row it keeps is read back: kind probe-crash, the probe, the browser
// ("Samsung Internet 30 · Android", from the request) and the version, counted once.
//
//   node scripts/probe-guard-check.mjs http://localhost:<port> <outDir> [--from <copy dir>] [--persist-to <dir>]
//
// --from <copy> serves another copy's /js and /css (the app from before 12 Nov 2026 fails it: Study asked both). LOCAL only (it signs up an
// account), a copy with Dutch's lessons (npm run local); through gpu.py's parallel lane. Exit 0 = pass.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { knowWords } from "./fixtures/know-words.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const FROM = argv.includes("--from") ? resolve(argv[argv.indexOf("--from") + 1]) : null;
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = join(import.meta.dirname, "..");
// The server's own rows (as errors-check reads them): the probe-crash groups it keeps.
const crashRows = () => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", "SELECT kind, name, message, place, version, browser, count FROM error_groups WHERE kind = 'probe-crash'"], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/probe-guard-check.mjs http://localhost:<port> <outDir> [--from <copy dir>] [--persist-to <dir>]   (LOCAL only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.log("FAIL  timed out"), process.exit(3)), 6 * 60_000).unref();
let failed = 0;
const say = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

const SAMSUNG = "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/140.0.0.0 Mobile Safari/537.36";
// Before anything of the page runs: the two probes counted (in sessionStorage, which a reload keeps), stood in where the browser hasn't them.
const COUNT = () => {
  const bump = (name) => {
    try {
      sessionStorage.setItem(`check.${name}`, String(Number(sessionStorage.getItem(`check.${name}`) ?? 0) + 1));
    } catch {}
  };
  const gpu = { requestAdapter: async () => (bump("requestAdapter"), null) };
  try {
    Object.defineProperty(Navigator.prototype, "gpu", { configurable: true, get: () => gpu });
  } catch {}
  const R = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
  if (R) {
    try {
      Object.defineProperty(R, "available", { configurable: true, writable: true, value: async () => (bump("available"), "available") });
    } catch {}
  }
};
const counts = (page) => page.evaluate(() => ({ requestAdapter: Number(sessionStorage.getItem("check.requestAdapter") ?? 0), available: Number(sessionStorage.getItem("check.available") ?? 0) }));
const zero = (page) => page.evaluate(() => (sessionStorage.removeItem("check.requestAdapter"), sessionStorage.removeItem("check.available")));
const marks = (page) => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("lx.probe.")).map((key) => `${key}=${localStorage.getItem(key)}`));

const MIME = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark", userAgent: SAMSUNG });
await context.addInitScript(COUNT);
const reports = [];
await context.route(/\/api\/errors$/, (route) => {
  try {
    reports.push(JSON.parse(route.request().postData() ?? "{}"));
  } catch {}
  return PERSIST ? route.continue() : route.fulfill({ status: 204, body: "" });
});
if (FROM) {
  await context.route(/\/(js|css)\/[^?]+/, (route) => {
    const file = join(FROM, "public", new URL(route.request().url()).pathname);
    return existsSync(file) ? route.fulfill({ status: 200, contentType: MIME[extname(file)] ?? "application/octet-stream", body: readFileSync(file) }) : route.continue();
  });
}
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const SESSION = '[data-part="session"]';
const report = {};
const go = async (hash, ms = 2500) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(ms);
};
try {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Probe guard");
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await knowWords(page);

  // Opening Study: neither probe asked.
  await go("#today", 1500);
  await zero(page);
  await go("#study", 3500);
  const study = await counts(page);
  report.study = study;
  await page.screenshot({ path: join(OUT, "study.png") });
  const speakingShown = await page.evaluate(() => [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="way-tile"], [data-part="page"]:not([data-ghost]) .lx-quick-play button')].some((node) => /Say it/.test(node.textContent)));
  say(study.requestAdapter === 0 && study.available === 0 && speakingShown, "a phone opening Study asks neither the GPU nor the recognizer, and Say it is still there among the games", JSON.stringify({ ...study, speakingShown }));

  // Opening Say it: both asked, each under its mark, cleared once answered.
  await go("#study/session/game/say", 3500);
  const sayIt = await counts(page);
  const left = await marks(page);
  report.sayIt = { ...sayIt, left };
  say(sayIt.requestAdapter >= 1 && sayIt.available >= 1 && !left.some((one) => one.startsWith("lx.probe.running.")), "opening Say it asks both, their marks cleared once answered", JSON.stringify(report.sayIt));
  await go("#study", 1200);

  // The page as if it ended inside the GPU's probe: a mark left. The next start reports it once and never asks the GPU again.
  await page.evaluate(() => localStorage.setItem("lx.probe.running.webgpu-adapter", "1"));
  const keptBefore = PERSIST ? crashRows() : [];
  reports.length = 0;
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForTimeout(1500);
  const told = reports.filter((one) => one.kind === "probe-crash");
  report.told = told;
  say(told.length === 1 && /webgpu-adapter/.test(told[0].message ?? "") && (await marks(page)).includes('lx.probe.crashed.v1=["webgpu-adapter"]'), "a mark left at a start is told once (kind probe-crash, naming the GPU's probe) and kept as crashed", JSON.stringify({ told, marks: await marks(page) }));
  if (PERSIST) {
    await page.waitForTimeout(1500);
    const kept = crashRows();
    const count = (rows) => rows.filter((row) => /webgpu-adapter/.test(row.message)).reduce((n, row) => n + row.count, 0);
    const row = kept.find((one) => /webgpu-adapter/.test(one.message));
    report.kept = { before: keptBefore, after: kept };
    say(
      count(kept) === count(keptBefore) + 1 && row?.browser === "Samsung Internet 30 · Android" && row?.name === "ProbeCrash" && row?.place === "/app/#study" && /^\d+$/.test(row?.version ?? ""),
      "the server keeps it: one more probe-crash of the GPU's probe, with the browser, its screen and version",
      JSON.stringify(row ?? kept),
    );
  }
  await zero(page);
  await go("#study/session/game/say", 3500);
  const after = await counts(page);
  report.after = after;
  say(after.requestAdapter === 0 && after.available >= 1, "after it, Say it never asks the GPU, and still asks the recognizer", JSON.stringify(after));
  reports.length = 0;
  await go("#study", 1000);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForTimeout(1500);
  say(!reports.some((one) => one.kind === "probe-crash"), "the start after reports nothing more", JSON.stringify(reports.map((one) => one.kind)));
  say(errors.length === 0, "no page error", errors.slice(0, 2).join(" | "));
  await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
} catch (error) {
  await page.screenshot({ path: join(OUT, "walk-failed.png") }).catch(() => {});
  say(false, "the walk", `${String(error.stack ?? error).slice(0, 300)} (at ${await page.evaluate(() => location.href).catch(() => "?")}; walk-failed.png)`);
}
writeFileSync(join(OUT, "probe-guard-check.json"), JSON.stringify({ report, errors }, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
