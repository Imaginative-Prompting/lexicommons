// Say it with Whisper as the recognizer (Firefox, and any browser with no recognizer of its own), on a phone: the speech module is a stand-in
// (no microphone, no model, nothing heard aloud) whose browser recognizer is none and whose Whisper is downloaded, taking 2.6 s to come into
// memory. While the sentence is read the step gets Whisper ready, saying so once it takes a second ("Getting Whisper ready… 1 s") and then its
// own line again; pressed, the microphone listens with Whisper and the answer is taken. No page error: the step's draw once threw
// "can't access lexical declaration 'shown' before initialization" there (session.js drawSay, a flag named like the step it was held to,
// 11 Nov 2026, Firefox on Android), so Whisper was never readied while you read, and the loading line never showed.
//
//   node scripts/say-whisper-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]
//
// --from <copy> serves another copy's /js and /css (the app from before 12 Nov 2026 fails it). LOCAL only (it signs up an account), a copy
// with Dutch's lessons (npm run local); through gpu.py's parallel lane. Exit 0 = pass.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { knowWords } from "./fixtures/know-words.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const FROM = argv.includes("--from") ? resolve(argv[argv.indexOf("--from") + 1]) : null;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/say-whisper-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]   (LOCAL only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.log("FAIL  timed out"), process.exit(3)), 6 * 60_000).unref();
let failed = 0;
const say = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

// The stand-in speech module: every name the real one exports; no recognizer in the browser, Whisper downloaded and slow to load.
const SPEECH = `
import { match } from "/js/speech/match.js";
export { match };
export const MODELS = [{ id: "whisper-standin", devices: ["wasm"], needsF16: false }];
export class SpeechError extends Error { constructor(code, message) { super(message ?? code); this.code = code; } }
export const releaseMic = () => {};
export const installLanguage = async () => ({ state: "none" });
export const megabytes = (bytes) => Math.round(bytes / 1e6);
export const languageCode = (lang) => String(lang).split("-")[0];
export const WHISPER_LANGUAGES = new Set(["nl"]);
export const whisperKnows = () => true;
export async function support() { return { browser: { state: "none", why: "a check's stand-in" }, whisper: { state: "wasm", f16: false } }; }
export const recommendedModel = () => "whisper-standin";
export async function modelState() { return { state: "ready" }; }
export async function downloadModel() {}
export async function deleteModel() {}
export function prepare() {
  (globalThis.__prepares ??= []).push(Math.round(performance.now()));
  return new Promise((done) => setTimeout(done, 2600));
}
export function wake() {}
export function unload() {}
export const VOICED_MS = 400;
export function voicedClock() { return { voiced: () => 0, stop() {} }; }
export function heardBars() { return () => {}; }
export function listen({ engine, expected, accept = [], readings = [], lang = "nl-NL", onState } = {}) {
  const heard = String(globalThis.__heard ?? "");
  (globalThis.__listens ??= []).push({ engine, expected, heard });
  onState?.("listening");
  let fail = () => {};
  const done = new Promise((resolve, reject) => {
    fail = reject;
    setTimeout(() => {
      onState?.("thinking");
      resolve({ heard, alternatives: [heard], match: match(expected, heard, { lang: languageCode(lang), accept, readings }) });
    }, 250);
  });
  return { done, stop() {}, cancel() { fail(new SpeechError("aborted")); } };
}
`;

const MIME = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark" });
await context.route(/\/js\/speech\/speech\.js(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: SPEECH }));
if (FROM) {
  await context.route(/\/(js|css)\/[^?]+/, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/js/speech/speech.js") return route.fallback();
    const file = join(FROM, "public", path);
    return existsSync(file) ? route.fulfill({ status: 200, contentType: MIME[extname(file)] ?? "application/octet-stream", body: readFileSync(file) }) : route.continue();
  });
}
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const SESSION = '[data-part="session"]';
const report = {};
try {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Say with Whisper");
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await knowWords(page);

  // Say it: the step draws, and while its sentence is read, Whisper is got ready, the line saying so after a second.
  await page.evaluate(() => (location.hash = "#study/session/game/say"));
  await page.waitForFunction((S) => document.querySelector(S)?.getAttribute("data-step") === "say", SESSION, { timeout: 20_000 });
  const lines = await page.evaluate(async (S) => {
    const seen = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 4200) {
      const text = document.querySelector(`${S} .lx-say-status`)?.textContent ?? "";
      if (seen.at(-1)?.text !== text) seen.push({ t: Math.round(performance.now() - t0), text });
      await new Promise((done) => setTimeout(done, 100));
    }
    return { seen, prepares: (globalThis.__prepares ?? []).length };
  }, SESSION);
  report.whileRead = lines;
  await page.screenshot({ path: join(OUT, "say-read.png") });
  const loading = lines.seen.filter((one) => /Getting Whisper ready/.test(one.text));
  const own = lines.seen.at(-1)?.text ?? "";
  say(lines.prepares >= 1, "while the sentence is read, Whisper is got ready (the speech module's prepare asked for)", `${lines.prepares} time(s)`);
  say(loading.length > 0 && !/Getting Whisper ready/.test(own) && own.length > 0, "a load over a second says so, then the step's own line again", lines.seen.map((one) => `${one.t} ms “${one.text.slice(0, 44)}”`).join(" → "));

  // Pressed: Whisper listens (ready already, a moment), and the answer is taken.
  const expected = await page.evaluate(async (S) => {
    const step = document.querySelector(S)?.lxStep;
    const { sentence } = await import("/js/study/content.js");
    return step?.item ? sentence(step.item) : null;
  }, SESSION);
  await page.evaluate((said) => (globalThis.__heard = said), expected ?? "");
  await page.locator(`${SESSION} [data-part="mic-button"]`).first().click();
  await page.waitForSelector(`${SESSION} [data-part="answer-bar"][data-meaning]`, { timeout: 15_000 }).catch(() => {});
  const result = await page.evaluate((S) => ({ meaning: document.querySelector(`${S} [data-part="answer-bar"]`)?.getAttribute("data-meaning") ?? null, listens: globalThis.__listens ?? [] }), SESSION);
  report.answered = result;
  await page.screenshot({ path: join(OUT, "say-answered.png") });
  say(result.listens.length === 1 && result.listens[0].engine === "whisper" && result.meaning === "right", "pressed, the microphone listens with Whisper and the sentence said is taken as right", JSON.stringify({ meaning: result.meaning, listens: result.listens.map((one) => one.engine) }));
  say(errors.length === 0, "no page error", errors.slice(0, 2).join(" | "));
  await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
} catch (error) {
  say(false, "the walk", String(error.stack ?? error).slice(0, 400));
}
writeFileSync(join(OUT, "say-whisper-check.json"), JSON.stringify({ report, errors }, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
