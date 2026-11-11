// Who opens the microphone for the browser's recognizer (speech/browser.js takesTrack; speech/speech.js listen's browser path), with the
// recognizer, getUserMedia and the meter stood in; nothing recorded or played.
//   - A computer's Chrome (a recognizer with available()): we open the microphone, the recognizer is started on our track, the meter runs.
//   - Android's Chrome, same recognizer: we open NO microphone and start it plain (it recognizes through Android's own service, which opens
//     the microphone itself; with ours open beside it a learner's meter moved and nothing was heard, 11 Nov 2026). The bars there are drawn
//     from what the recognizer says: flat until it has something, a swell each time it does (speech started, each result).
//   - Any device: a listen on our track that ends "no-speech" while our meter measured a voice makes the device open none from then on;
//     with a quiet room, or an answer heard, it changes nothing (the controls).
//   - Safari (no available()): as ever, no microphone of ours.
// Pass another copy's dir to see it fail on one from before:  node scripts/test-recognizer-mic.mjs [<app dir>]   (exit 0 = pass)
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const APP = process.argv[2] ? pathToFileURL(`${resolve(process.argv[2])}/`) : new URL("../", import.meta.url);
const PUBLIC = new URL("public/", APP);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("/js/")) return { url: new URL(specifier.slice(1), PUBLIC).href, shortCircuit: true };
    return next(specifier, context);
  },
});

let failed = 0;
let passed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}

const UA = {
  computer: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
  android: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
};
let ua = UA.computer;
Object.defineProperty(globalThis.navigator, "userAgent", { get: () => ua, configurable: true });
globalThis.self = globalThis;
globalThis.isSecureContext = true;
globalThis.location = new URL("https://lexicommons.test/app/");
const stored = new Map();
globalThis.localStorage = { getItem: (key) => (stored.has(key) ? stored.get(key) : null), setItem: (key, value) => stored.set(key, String(value)), removeItem: (key) => stored.delete(key) };

// The microphone and the meter. `loudness`: the level the meter reads (an RMS), set by each case.
const opened = [];
let loudness = 0;
const track = { kind: "audio", stop() {}, enabled: true, addEventListener() {} };
const stream = { active: true, getTracks: () => [track], getAudioTracks: () => [track] };
Object.defineProperty(globalThis.navigator, "mediaDevices", { value: { getUserMedia: async (how) => (opened.push(how), stream) }, configurable: true });
globalThis.AudioContext = class {
  state = "running";
  async resume() {}
  async suspend() {}
  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }
  createAnalyser() {
    return { fftSize: 2048, getFloatTimeDomainData: (samples) => samples.fill(loudness) };
  }
};

// The recognizer. `script(rec)`: what it does once started; `started`: what each start() was given.
const started = [];
let script = () => {};
const recognizer = ({ chrome }) => {
  globalThis.SpeechRecognition = class {
    start(given) {
      started.push(given === undefined ? "plain" : given === track ? "our track" : "something else");
      script(this);
    }
    stop() {}
    abort() {}
  };
  if (chrome) globalThis.SpeechRecognition.available = async ({ processLocally }) => (processLocally ? "unavailable" : "available");
};
const later = (ms) => new Promise((done) => setTimeout(done, ms));
// What a recognizer does: says it has audio, hears speech, gives a result and ends; or ends with "no-speech" after `ms`.
const hears = (text, { after = 30 } = {}) => (rec) =>
  setTimeout(async () => {
    rec.onaudiostart?.();
    await later(after);
    rec.onspeechstart?.();
    await later(260);
    const result = Object.assign([{ transcript: text }], { isFinal: true });
    rec.onresult?.({ resultIndex: 0, results: [result] });
    rec.onspeechend?.();
    rec.onend?.();
  }, 5);
const hearsNothing = (ms) => (rec) =>
  setTimeout(() => {
    rec.onaudiostart?.();
    setTimeout(() => (rec.onerror?.({ error: "no-speech" }), rec.onend?.()), ms);
  }, 5);

const speech = await import(new URL("js/speech/speech.js", PUBLIC).href);
const browser = await import(new URL("js/speech/browser.js", PUBLIC).href);

async function listenOnce({ onLevel = () => {} } = {}) {
  opened.length = 0;
  started.length = 0;
  const states = [];
  const levels = [];
  const listener = speech.listen({ engine: "browser", expected: "Ik drink koffie.", lang: "nl-NL", onState: (state) => states.push(state), onLevel: (level) => (levels.push(level), onLevel(level)) });
  const out = await listener.done.then(
    (result) => ({ heard: result.heard }),
    (error) => ({ code: error.code, message: error.message }),
  );
  return { ...out, opened: opened.length, started: [...started], states, levels };
}

// ---- a computer's Chrome: our microphone, our track, the meter
ua = UA.computer;
recognizer({ chrome: true });
check("a computer's Chrome takes our track", browser.takesTrack(), true);
loudness = 0.05;
script = hears("ik drink koffie", { after: 150 });
{
  const out = await listenOnce();
  check("a computer's Chrome: we open the microphone once and the recognizer starts on our track", [out.opened, out.started, out.heard], [1, ["our track"], "ik drink koffie"]);
  check("and the meter runs on it (levels from the microphone)", out.levels.length > 0 && out.levels.every((level) => level > 0.5), true);
  check("an answer heard on our track leaves the device as it was", [browser.takesTrack(), stored.size], [true, 0]);
}

// ---- Android's Chrome: no microphone of ours, a plain start, bars drawn from what the recognizer says
ua = UA.android;
check("Android's Chrome, the same recognizer, takes no track", browser.takesTrack(), false);
script = hears("ik drink koffie", { after: 200 });
{
  const out = await listenOnce();
  check("Android's Chrome: we open NO microphone and the recognizer starts plain, and hears", [out.opened, out.started, out.heard], [0, ["plain"], "ik drink koffie"]);
  check("its states reach the button: listening, then hearing", [out.states.includes("listening"), out.states.includes("hearing"), out.states.indexOf("listening") < out.states.indexOf("hearing")], [true, true, true]);
  check("its bars move once the recognizer has something (a swell that rises above half)", out.levels.some((level) => level >= 0.7), true);
}
// Flat until then: a recognizer that hears nothing draws nothing.
script = hearsNothing(300);
{
  const out = await listenOnce();
  check("Android, nothing heard: the recognizer's own no-speech in its words, no bar moved, no microphone of ours", [out.code, out.message, out.levels, out.opened, out.started], ["no-speech", "Didn't hear anything. Try again, a little closer to the microphone.", [], 0, ["plain"]]);
}
// The swell itself: set levels, ending at rest, started again by each thing heard.
{
  const seen = [];
  const bars = speech.heardBars((level) => seen.push(level));
  bars.heard();
  await later(1000);
  check("the swell rises, falls and ends at rest", [seen.length > 4, Math.max(...seen) >= 0.7, seen.at(-1)], [true, true, 0]);
  const before = seen.length;
  await later(300);
  check("and nothing moves after it with nothing more heard", seen.length, before);
  bars.heard();
  bars.stop();
  await later(300);
  check("stop() ends it at once", seen.length, before + 1);
}

// ---- the safety net: deaf to our track with a voice measured → from then on, none
ua = UA.computer;
stored.clear();
loudness = 0.0005; // a quiet room: about -66 dBFS
script = hearsNothing(900);
{
  const out = await listenOnce();
  check("CONTROL a quiet room and nothing heard: the device still takes our track", [out.code, browser.takesTrack(), stored.size], ["no-speech", true, 0]);
}
loudness = 0.1; // a voice: -20 dBFS
script = hearsNothing(900);
{
  const out = await listenOnce();
  check("a voice on our meter and the recognizer heard nothing: told as ever, and the device takes no track from then on", [out.code, out.started, browser.takesTrack()], ["no-speech", ["our track"], false]);
}
script = hears("ik drink koffie");
{
  const out = await listenOnce();
  check("the next listen there: no microphone of ours, a plain start, heard", [out.opened, out.started, out.heard], [0, ["plain"], "ik drink koffie"]);
}
// The clock by itself.
{
  const clock = speech.voicedClock();
  for (let t = 0; t <= 2000; t += 43) clock.hear(0.2, t);
  check("the voiced clock: a room's noise for 2 s counts nothing", clock.ms(), 0);
  for (let t = 3000; t <= 3600; t += 43) clock.hear(0.7, t);
  check("a voice for 0.6 s counts past the mark", clock.ms() >= speech.VOICED_MS, true);
  const gap = speech.voicedClock();
  gap.hear(0.9, 0);
  gap.hear(0.9, 60_000);
  check("two readings a minute apart count 100 ms at most", gap.ms(), 100);
}

// ---- Safari: no available(), so no microphone of ours, as ever
ua = UA.iphone;
stored.clear();
recognizer({ chrome: false });
script = hears("ik drink koffie");
{
  const out = await listenOnce();
  check("Safari: no microphone of ours, a plain start, heard", [browser.takesTrack(), out.opened, out.started, out.heard], [false, 0, ["plain"], "ik drink koffie"]);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
