// The device's native probes on a phone, in the real app (speech/probe-guard.js; study/game-modes.js; speech/speech.js, browser.js;
// shell/settings-voice.js): the GPU's requestAdapter and the recognizer's available() counted, with how many were in flight at once (stood
// in where the headless browser hasn't them; nothing is asked of a real GPU or recognizer). Two phones:
//   - Samsung Internet 30's user agent. On 12 Nov 2026 (v730) one such phone's page ended with both in flight at once (two probe-crash reports
//     116 ms apart; the app started again on Settings): on Samsung Internet neither is ever asked. Opening Study, Settings and every Settings
//     page asks neither; Say it asks neither and still plays (the browser's recognizer, or Can't speak now where there's none); Settings →
//     Sound and speech and its Speaking page say so where Whisper is offered (stills).
//   - Chrome on an Android phone, where the guard stays the way: opening Study and every Settings page asks neither (only what they've
//     answered on the page is read: Settings → Speaking says what's checked on first use, shows no model as chosen and names no size on its
//     Download, saying what it could be; pressed, it asks the GPU alone and downloads the model its answer suits, not the page's guess, then
//     stopped and deleted; Smaller picked names its size, and pressed where the GPU can't be used says so with nothing downloaded); opening Say it asks both, one after the other,
//     never together, each under its mark, cleared once answered. A mark planted as if the page had ended inside the GPU's probe: the next
//     start reports it once (/api/errors, kind "probe-crash", naming the probe), Say it then asks the recognizer but never the GPU, and the
//     start after reports nothing more. With --persist-to (the server's local state), the report goes on to the server, and the row it keeps is
//     read back: kind probe-crash, the probe, the browser ("Chrome 140 · Android", from the request) and the version, counted once.
//
//   node scripts/probe-guard-check.mjs http://localhost:<port> <outDir> [--from <copy dir>] [--persist-to <dir>]
//
// --from <copy> serves another copy's /js and /css: the app from before 12 Nov 2026's evening fails it (on Samsung's user agent, Settings →
// Speaking asked both at once and Downloads asked the recognizer; Say it asked both). LOCAL only (it signs up two accounts), a copy with
// Dutch's lessons (npm run local); through gpu.py's parallel lane. Exit 0 = pass.
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
// The server's own rows (as errors-check reads them): the probe-crash groups it keeps.
const crashRows = () => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", "SELECT kind, name, message, place, version, browser, count FROM error_groups WHERE kind = 'probe-crash'"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/probe-guard-check.mjs http://localhost:<port> <outDir> [--from <copy dir>] [--persist-to <dir>]   (LOCAL only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.log("FAIL  timed out"), process.exit(3)), 12 * 60_000).unref();
let failed = 0;
const say = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

const SAMSUNG = "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/140.0.0.0 Mobile Safari/537.36";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
// Before anything of the page runs: the two probes counted, and the most in flight at once (in sessionStorage, which a reload keeps), each
// answering after a moment as a real one does, stood in where the browser hasn't them.
const COUNT = () => {
  let inFlight = 0;
  const bump = (name, by = 1) => {
    try {
      sessionStorage.setItem(`check.${name}`, String(Number(sessionStorage.getItem(`check.${name}`) ?? 0) + by));
    } catch {}
  };
  const counted = (name, answer) => async () => {
    bump(name);
    inFlight++;
    try {
      if (inFlight > Number(sessionStorage.getItem("check.together") ?? 0)) sessionStorage.setItem("check.together", String(inFlight));
    } catch {}
    await new Promise((done) => setTimeout(done, 120));
    inFlight--;
    return answer;
  };
  const gpu = { requestAdapter: counted("requestAdapter", null) };
  try {
    Object.defineProperty(Navigator.prototype, "gpu", { configurable: true, get: () => gpu });
  } catch {}
  const R = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
  if (R) {
    try {
      Object.defineProperty(R, "available", { configurable: true, writable: true, value: counted("available", "available") });
    } catch {}
  }
};
const counts = (page) =>
  page.evaluate(() => ({
    requestAdapter: Number(sessionStorage.getItem("check.requestAdapter") ?? 0),
    available: Number(sessionStorage.getItem("check.available") ?? 0),
    together: Number(sessionStorage.getItem("check.together") ?? 0),
  }));
const zero = (page) => page.evaluate(() => ["requestAdapter", "available", "together"].forEach((name) => sessionStorage.removeItem(`check.${name}`)));
const marks = (page) => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("lx.probe.")).map((key) => `${key}=${localStorage.getItem(key)}`));
const none = (c) => c.requestAdapter === 0 && c.available === 0;
// Every page of Settings a learner can open (shell/settings.js's routes), its main page first.
const SETTINGS = [
  "#settings", "#settings/account", "#settings/language", "#settings/study", "#settings/study/practice", "#settings/study/memory", "#settings/study/games",
  "#settings/study/cards", "#settings/study/quick", "#settings/study/packs", "#settings/study/speaking", "#settings/study/say", "#settings/voice",
  "#settings/voice/voices", "#settings/voice/listening", "#settings/reminders", "#settings/appearance", "#settings/appearance/themes", "#settings/downloads",
  "#settings/storage", "#settings/data", "#settings/about", "#settings/install", "#settings/report", "#settings/streak", "#settings/translate",
];

const MIME = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const browser = await chromium.launch({ headless: true });
const report = {};

/** A phone with this user agent, signed up, with its words known and Study's packs in. */
async function phone(userAgent, name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark", userAgent });
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
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', name);
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await knowWords(page);
  const go = async (hash, ms = 2500) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(ms);
  };
  return { context, page, reports, errors, go };
}

// Study, then every Settings page, each from a count of none: which asked anything.
async function walkQuiet(p, label) {
  await p.go("#today", 1500);
  await zero(p.page);
  await p.go("#study", 3500);
  const study = await counts(p.page);
  const speakingShown = await p.page.evaluate(() => [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="way-tile"], [data-part="page"]:not([data-ghost]) .lx-quick-play button')].some((node) => /Say it/.test(node.textContent)));
  await p.page.screenshot({ path: join(OUT, `${label}-study.png`) });
  say(none(study) && speakingShown, `${label}: opening Study asks neither the GPU nor the recognizer, and Say it is still there among the games`, JSON.stringify({ ...study, speakingShown }));
  const asked = {};
  for (const hash of SETTINGS) {
    await zero(p.page);
    await p.go(hash, 2200);
    const c = await counts(p.page);
    if (!none(c)) asked[hash] = c;
  }
  report[`${label}-settings`] = asked;
  say(Object.keys(asked).length === 0, `${label}: Settings and every Settings page (${SETTINGS.length}) ask neither`, Object.keys(asked).length ? JSON.stringify(asked) : "");
}

try {
  // ---------- Samsung Internet: never asked ----------
  const sam = await phone(SAMSUNG, "Probe guard Samsung");
  await walkQuiet(sam, "samsung");
  // Where Whisper is offered, it says why it runs on the processor here; stills of Sound and speech and its Speaking page.
  await sam.go("#settings/voice", 2000);
  await sam.page.screenshot({ path: join(OUT, "samsung-sound-and-speech.png") });
  await sam.go("#settings/study/speaking", 3000);
  const whisperRow = await sam.page.evaluate(() => [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="list-row"], [data-part="page"]:not([data-ghost]) label')].map((n) => n.textContent.replace(/\s+/g, " ")).find((t) => /^Whisper, on this device/.test(t.trim())) ?? null);
  await sam.page.screenshot({ path: join(OUT, "samsung-speaking.png"), fullPage: true });
  report.samsungWhisper = whisperRow;
  say(/Samsung Internet/.test(whisperRow ?? "") && /processor/.test(whisperRow ?? ""), "samsung: Settings → Speaking says plainly where Whisper is offered that it runs on the processor here, and why", whisperRow ?? "no Whisper row");
  // Say it: neither asked, and it plays: the browser's recognizer (its microphone), or Can't speak now.
  await zero(sam.page);
  await sam.go("#study/session/game/say", 4000);
  const samSay = await counts(sam.page);
  const step = await sam.page.evaluate(() => {
    const session = document.querySelector('[data-part="session"]');
    const visible = (node) => Boolean(node && node.getClientRects().length);
    return {
      mic: visible(session?.querySelector('[data-part="mic-button"]')),
      cantSpeak: [...(session?.querySelectorAll("button") ?? [])].some((b) => /Can.t speak now/.test(b.textContent) && visible(b)),
      words: (session?.textContent ?? "").replace(/\s+/g, " ").slice(0, 160),
    };
  });
  await sam.page.screenshot({ path: join(OUT, "samsung-say-it.png") });
  report.samsungSay = { ...samSay, ...step, marks: await marks(sam.page) };
  say(none(samSay) && (step.mic || step.cantSpeak) && !(await marks(sam.page)).length, "samsung: Say it asks neither, no mark, and plays (the browser's recognizer, or Can't speak now)", JSON.stringify(report.samsungSay));
  say(sam.errors.length === 0, "samsung: no page error", sam.errors.slice(0, 2).join(" | "));
  await sam.page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
  await sam.context.close();

  // ---------- Chrome on Android: the guard, one at a time ----------
  const and = await phone(ANDROID_CHROME, "Probe guard Android");
  const page = and.page;
  await walkQuiet(and, "android");
  // Settings → Speaking, before Say it has asked anything: what's checked on first use, and no model shown as chosen: none pressed in the
  // picker, the download naming no size, a line under it with what it could be.
  await and.go("#settings/study/speaking", 3000);
  await page.screenshot({ path: join(OUT, "android-speaking-before-say-it.png"), fullPage: true });
  const pageButtons = () => page.evaluate(() => [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) button')].map((b) => b.textContent.trim()));
  const unsure = await page.evaluate(() => {
    const root = document.querySelector('[data-part="page"]:not([data-ghost])');
    const picker = [...root.querySelectorAll('[data-part="segmented"][aria-label="Whisper model"] [data-part="segment"]')].map((b) => `${b.textContent}${b.getAttribute("aria-pressed") === "true" ? " (chosen)" : ""}`);
    const go = root.querySelector(".lx-row-go");
    return { picker, button: go?.querySelector("button")?.textContent.trim() ?? null, note: go?.querySelector('[data-part="group-note"]')?.textContent ?? null };
  });
  report.unsure = unsure;
  say(
    unsure.picker.length > 1 && !unsure.picker.some((one) => one.endsWith("(chosen)")) && unsure.button === "Download Whisper" && /^\d+ MB or \d+ MB, depending on this device/.test(unsure.note ?? ""),
    "android: Speaking before the GPU has answered shows no model as chosen, and its download names no size but what it could be",
    JSON.stringify(unsure),
  );
  // Download pressed there is using speech: the GPU asked (only it), and the model that suits its answer downloaded (the stand-in GPU has no
  // adapter: Basic, on the processor), not the page's guess. Stopped (or done: the local server is quick), and what came deleted; a reload,
  // so Say it below asks afresh.
  const guessed = await page.evaluate(() => [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) button')].map((b) => b.textContent).find((t) => /^Download Whisper/.test(t)) ?? null);
  await zero(page);
  await page.locator('[data-part="page"]:not([data-ghost]) button', { hasText: /^Download Whisper/ }).click();
  await page.locator('[data-part="page"]:not([data-ghost]) button', { hasText: /^Stop$/ }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  const pressed = await counts(page);
  // From the local server it may be done already; else stopped.
  await page.locator('[data-part="page"]:not([data-ghost]) button', { hasText: /^Stop$/ }).click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const came = await page.evaluate(async () => {
    const store = await import("/js/speech/store.js");
    const have = async (id) => (await store.packState(id).catch(() => ({ have: 0 }))).have;
    const out = { base: await have("whisper-base"), small: await have("whisper-small"), turbo: await have("whisper-turbo") };
    const speech = await import("/js/speech/speech.js");
    for (const id of ["whisper-base", "whisper-small", "whisper-turbo"]) await speech.deleteModel(id).catch(() => {});
    return out;
  });
  report.download = { guessed, pressed, came };
  say(
    pressed.requestAdapter === 1 && pressed.available === 0 && came.base > 0 && came.small === 0 && came.turbo === 0,
    "android: Download on Speaking before Say it asks the GPU alone, and downloads the model its answer suits (Basic), not the page's guess",
    JSON.stringify(report.download),
  );
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  // Smaller picked by a press before the GPU has answered: the download names its size; pressed, the GPU (alone) says this device has none
  // to use, and that's said, nothing downloaded. Your pick taken back after, and a reload.
  await and.go("#settings/study/speaking", 3000);
  await page.locator('[data-part="page"]:not([data-ghost]) [data-part="segment"]', { hasText: /^Smaller/ }).click();
  await page.waitForTimeout(1200);
  const pickedButton = (await pageButtons()).find((t) => /^Download Whisper/.test(t)) ?? null;
  const smallerSize = await page.evaluate(() => [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="segment"]')].find((b) => /^Smaller/.test(b.textContent))?.textContent.split("·")[1]?.trim() ?? null);
  await page.screenshot({ path: join(OUT, "android-speaking-smaller-picked.png"), fullPage: true });
  await zero(page);
  await page.locator('[data-part="page"]:not([data-ghost]) button', { hasText: /^Download Whisper/ }).click();
  await page.waitForTimeout(2000);
  // Said under the button pressed, and the page now offering the model that suits (Basic, at its size from the picker before).
  const refused = await page.evaluate(() => document.querySelector('[data-part="page"]:not([data-ghost]) .lx-row-go [data-part="group-note"]')?.textContent ?? null);
  const offeredAfter = (await pageButtons()).find((t) => /^Download Whisper/.test(t)) ?? null;
  const basicSize = (unsure.picker.find((one) => /^Basic/.test(one)) ?? "").split("·")[1]?.trim() ?? null;
  const askedOnPick = await counts(page);
  const smallCame = await page.evaluate(async () => (await (await import("/js/speech/store.js")).packState("whisper-small").catch(() => ({ have: 0 }))).have);
  await page.screenshot({ path: join(OUT, "android-speaking-smaller-pressed.png"), fullPage: true });
  report.picked = { pickedButton, smallerSize, refused, offeredAfter, basicSize, askedOnPick, smallCame };
  say(
    pickedButton === `Download Whisper · ${smallerSize}` && /Smaller needs this device's graphics chip/.test(refused ?? "") && offeredAfter === `Download Whisper · ${basicSize}` && askedOnPick.requestAdapter === 1 && askedOnPick.available === 0 && smallCame === 0,
    "android: Smaller picked, the download names its size; pressed where the GPU can't be used, that's said under it, nothing comes, and Basic is offered at its size",
    JSON.stringify(report.picked),
  );
  await page.evaluate(async () => (await import("/js/study/settings.js")).setStudySetting("say.model", ""));
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  // Opening Say it: both asked, one after the other, each under its mark, cleared once answered.
  await and.go("#today", 1200);
  await zero(page);
  await and.go("#study/session/game/say", 3500);
  const sayIt = await counts(page);
  const left = await marks(page);
  report.sayIt = { ...sayIt, left };
  say(sayIt.requestAdapter >= 1 && sayIt.available >= 1 && sayIt.together === 1 && !left.some((one) => one.startsWith("lx.probe.running.")), "android: opening Say it asks both, never together (one in flight at most), their marks cleared once answered", JSON.stringify(report.sayIt));
  // Settings → Speaking after it: what was answered, read and asked nothing more.
  await zero(page);
  await and.go("#settings/study/speaking", 3000);
  const after = await counts(page);
  await page.screenshot({ path: join(OUT, "android-speaking-after-say-it.png"), fullPage: true });
  say(none(after), "android: Settings → Speaking after Say it asks nothing more", JSON.stringify(after));
  await and.go("#study", 1200);

  // The page as if it ended inside the GPU's probe: a mark left. The next start reports it once and never asks the GPU again.
  await page.evaluate(() => localStorage.setItem("lx.probe.running.webgpu-adapter", "1"));
  const keptBefore = PERSIST ? crashRows() : [];
  and.reports.length = 0;
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForTimeout(1500);
  const told = and.reports.filter((one) => one.kind === "probe-crash");
  report.told = told;
  say(told.length === 1 && /webgpu-adapter/.test(told[0].message ?? "") && (await marks(page)).includes('lx.probe.crashed.v1=["webgpu-adapter"]'), "android: a mark left at a start is told once (kind probe-crash, naming the GPU's probe) and kept as crashed", JSON.stringify(told));
  if (PERSIST) {
    await page.waitForTimeout(1500);
    const kept = crashRows();
    const count = (rows) => rows.filter((row) => /webgpu-adapter/.test(row.message)).reduce((n, row) => n + row.count, 0);
    const row = kept.find((one) => /webgpu-adapter/.test(one.message) && /^Chrome/.test(one.browser));
    report.kept = { before: keptBefore, after: kept };
    say(
      count(kept) === count(keptBefore) + 1 && row?.browser === "Chrome 140 · Android" && row?.name === "ProbeCrash" && row?.place === "/app/#study" && /^\d+$/.test(row?.version ?? ""),
      "android: the server keeps it: one more probe-crash of the GPU's probe, with the browser, its screen and version",
      JSON.stringify(row ?? kept),
    );
  }
  await zero(page);
  await and.go("#study/session/game/say", 3500);
  const afterCrash = await counts(page);
  report.afterCrash = afterCrash;
  say(afterCrash.requestAdapter === 0 && afterCrash.available >= 1, "android: after it, Say it never asks the GPU, and still asks the recognizer", JSON.stringify(afterCrash));
  and.reports.length = 0;
  await and.go("#study", 1000);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForTimeout(1500);
  say(!and.reports.some((one) => one.kind === "probe-crash"), "android: the start after reports nothing more", JSON.stringify(and.reports.map((one) => one.kind)));
  say(and.errors.length === 0, "android: no page error", and.errors.slice(0, 2).join(" | "));
  await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
} catch (error) {
  say(false, "the walk", String(error.stack ?? error).slice(0, 400));
}
writeFileSync(join(OUT, "probe-guard-check.json"), JSON.stringify(report, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
