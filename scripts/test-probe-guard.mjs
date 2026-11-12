// The device's native probes, guarded (speech/probe-guard.js), in plain Node with localStorage and the page's events stood in: a probe's mark
// is there while it runs and gone when it answers, throws, or the page is closed the ordinary way (pagehide) or hidden (set again if it comes
// back with the probe still running); a mark left at a start (the page
// ended inside the probe) is told once and that probe is never run on the device again; the recognizer's on-device question (speech/browser.js
// browserSupport) is asked only where wanted and never once it crashed; the report of it (lx/error-clean.js, kind "probe-crash") says only
// the probe in fixed words, its screen and version. 12 Nov 2026: Samsung Internet 30 started the app again by itself on Study, where these
// are first asked.
//   node scripts/test-probe-guard.mjs [<app dir>]   (another copy's dir to see it fail on one from before; exit 0 = pass)
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP = resolve(process.argv[2] ?? join(import.meta.dirname, ".."));
let failed = 0;
let passed = 0;
const check = (ok, what, detail = "") => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

// The page stood in: storage, and its events (pagehide).
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
const listeners = new Map();
globalThis.addEventListener = (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]);
const fire = (type) => (listeners.get(type) ?? []).forEach((fn) => fn());
const docListeners = new Map();
globalThis.document = { visibilityState: "visible", addEventListener: (type, fn) => docListeners.set(type, [...(docListeners.get(type) ?? []), fn]) };
const shown = (state) => ((document.visibilityState = state), (docListeners.get("visibilitychange") ?? []).forEach((fn) => fn()));

const guardFile = join(APP, "public/js/speech/probe-guard.js");
if (!existsSync(guardFile)) {
  check(false, "speech/probe-guard.js is there", `none in ${APP}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}
const guard = await import(pathToFileURL(guardFile).href);
const marks = () => [...store.keys()].filter((key) => key.startsWith("lx.probe.running."));

// A probe that answers: its mark there while it runs, gone after.
let during = null;
const value = await guard.guarded("webgpu-adapter", async () => {
  during = marks();
  return { f16: true };
});
check(during?.join() === "lx.probe.running.webgpu-adapter" && !marks().length && value?.f16 === true, "a probe that answers: its mark while it runs, none after, its answer", JSON.stringify({ during, after: marks() }));

// One that throws: the mark cleared, the error passed on.
let thrown = null;
await guard.guarded("speech-available", async () => {
  throw new Error("no");
}).catch((error) => (thrown = error.message));
check(thrown === "no" && !marks().length, "a probe that throws: its error passed on, its mark cleared", JSON.stringify({ thrown, after: marks() }));

// The page closed the ordinary way while one runs: pagehide clears its mark (a page that ended by itself fires none).
let release;
const pending = guard.guarded("webgpu-adapter", () => new Promise((done) => (release = done)));
const before = marks().length;
fire("pagehide");
check(before === 1 && !marks().length, "closed the ordinary way mid-probe, pagehide clears the mark", `${before} → ${marks().length}`);
release(null);
await pending;

// Hidden while one runs (an app swiped away from the switcher is hidden first, and may end with no pagehide): its mark cleared; back on screen
// with it still running, set again.
let release2;
const pending2 = guard.guarded("speech-available", () => new Promise((done) => (release2 = done)));
shown("hidden");
const whileHidden = marks().length;
shown("visible");
const backOn = marks().join();
release2(null);
await pending2;
check(whileHidden === 0 && backOn === "lx.probe.running.speech-available" && !marks().length, "hidden mid-probe: its mark cleared; back on screen still running: set again; cleared once it answers", JSON.stringify({ whileHidden, backOn, after: marks() }));

// A mark left at a start: told once, kept as crashed, never run again.
check(guard.crashedLastTime().length === 0, "a start with no mark left tells nothing");
store.set("lx.probe.running.webgpu-adapter", "1");
const told = guard.crashedLastTime();
const again = guard.crashedLastTime();
check(told.join() === "webgpu-adapter" && again.length === 0 && !marks().length, "a mark left at a start is told once, by name, and cleared", JSON.stringify({ told, again }));
let ran = false;
const skipped = await guard.guarded("webgpu-adapter", async () => ((ran = true), "ran"), "unknown");
check(guard.probeCrashed("webgpu-adapter") && !ran && skipped === "unknown" && !guard.probeCrashed("speech-available"), "a probe that crashed here is never run again (its answer taken as unknown); the other still runs", JSON.stringify({ ran, skipped }));
// A mark with a name that isn't a probe's is nobody's: not told.
store.set("lx.probe.running.nothing", "1");
check(guard.crashedLastTime().length === 0, "a mark that names no probe isn't told");
store.delete("lx.probe.running.nothing");

// The recognizer's on-device question: asked only where wanted, never once it crashed.
const browserFile = join(APP, "public/js/speech/browser.js");
let asked = 0;
class Recognizer {
  static async available({ processLocally }) {
    asked++;
    return processLocally ? "available" : "available";
  }
}
globalThis.webkitSpeechRecognition = Recognizer;
globalThis.navigator ??= { userAgent: "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/140.0.0.0 Mobile Safari/537.36" };
const { browserSupport } = await import(pathToFileURL(browserFile).href);
store.delete("lx.probe.crashed.v1");
const light = await browserSupport("nl-NL", { onDevice: false });
check(asked === 0 && light.state === "unknown", "not wanted (Study's list on a phone): the recognizer isn't asked, and is used as one that may have it", JSON.stringify({ asked, light }));
const full = await browserSupport("nl-NL");
check(asked === 1 && full.state === "local" && !marks().length, "wanted: asked once under its mark, cleared after", JSON.stringify({ asked, full, marks: marks() }));
store.set("lx.probe.running.speech-available", "1");
guard.crashedLastTime();
const afterCrash = await browserSupport("nl-NL");
check(asked === 1 && afterCrash.state === "unknown", "once it crashed here, never asked again: the recognizer used as one that may have it", JSON.stringify({ asked, afterCrash }));

// The report: the probe's name in fixed words, its screen and version; nothing else of the input; none for a name that's no probe's.
const clean = await import(pathToFileURL(join(APP, "public/js/lx/error-clean.js")).href);
const report = clean.cleanReport({ kind: "probe-crash", message: "webgpu-adapter", stack: "at secret (/js/x.js:1:1)", place: "/app/#study/session/lesson?word=koffie", version: "716", name: "Anything" });
check(
  report?.kind === "probe-crash" && /asking the GPU for an adapter/.test(report.message) && /webgpu-adapter/.test(report.message) && report.stack === "" && report.place === "/app/#study/session" && report.version === "716" && report.name === "ProbeCrash",
  "the report says the probe in fixed words, its screen and version, and nothing else",
  JSON.stringify(report),
);
check(clean.cleanReport({ kind: "probe-crash", message: "<img src=x>" }) === null, "a report naming no probe isn't kept");
// What the device sends is its cleaned report, and the server cleans it again (src/errors.ts recordClientReport): the same report, never dropped.
const twice = clean.cleanReport(JSON.parse(JSON.stringify(report)));
check(JSON.stringify(twice) === JSON.stringify(report), "cleaned on the device, then again on the server, it comes out the same", JSON.stringify(twice));
check(clean.cleanReport({ kind: "probe-crash", message: `${report?.message} ` }) === null, "a report with the cleaned words changed isn't kept");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
