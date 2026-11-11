// Whisper's languages (public/js/speech/speech.js WHISPER_LANGUAGES) against the vendored transformers.js, and what
// support(), chooseEngine() (study/speaking.js) and listen() do for every registered language: where Whisper doesn't
// know one, it's never offered, the browser's recognizer takes over, and with no recognizer either Say it is told
// "unsupported" and why, never an error from Whisper. Stand-ins for a WebGPU device, its storage and Chrome's
// recognizer; nothing is downloaded. Exit 0 = pass.
//   node scripts/test-speech-support.mjs

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

const PUBLIC = new URL("../public/", import.meta.url);
// The app imports its own modules by site path (speaking.js: import("/js/speech/speech.js")).
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("/js/")) return { url: new URL(specifier.slice(1), PUBLIC).href, shortCircuit: true };
    return next(specifier, context);
  },
});

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}

// A device that can run Whisper on WebGPU, with 16-bit maths.
globalThis.self = globalThis;
globalThis.location = new URL("https://lexicommons.test/app/");
globalThis.Worker = class {};
Object.defineProperty(globalThis.navigator, "gpu", { value: { requestAdapter: async () => ({ features: new Set(["shader-f16"]) }) }, configurable: true });
const stored = new Map();
globalThis.localStorage = {
  getItem: (key) => (stored.has(key) ? stored.get(key) : null),
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: (key) => stored.delete(key),
};
globalThis.AudioContext = class {
  state = "running";
  async resume() {}
};
// The models' downloads: each pack's manifest from the site, its one chunk in Cache Storage once `downloaded`.
let downloaded = false;
const chunks = new Set();
globalThis.fetch = async (url) => {
  const pack = String(url).match(/\/models\/([^/]+)\/manifest\.json$/)?.[1];
  if (!pack) return new Response("", { status: 404 });
  chunks.add(new URL(`/models/${pack}/c/${pack}-0`, location.origin).href);
  const files = [{ path: "model.onnx", chunks: [{ name: `${pack}-0`, bytes: 10 }] }];
  return Response.json({ format: "lexicommons-speech-pack", version: 1, bytes: 10, files });
};
globalThis.caches = {
  open: async () => ({
    keys: async () => (downloaded ? [...chunks].map((url) => ({ url })) : []),
    match: async () => undefined,
  }),
};
// Chrome's recognizer as support() sees it: on the server for any tag (as Chrome answers), or no recognizer at all.
class ChromeRecognition {
  static async available({ processLocally }) {
    return processLocally ? "unavailable" : "available";
  }
}
const recognizer = (on) => {
  if (on) globalThis.SpeechRecognition = ChromeRecognition;
  else delete globalThis.SpeechRecognition;
};

const { LANGUAGES } = await import("../public/js/lang/index.js");
const speech = await import("../public/js/speech/speech.js");
const { chooseEngine } = await import("../public/js/study/speaking.js");
const { GOOGLE_KNOWS } = await import("../public/js/speech/browser.js");
const { setStudySetting } = await import("../public/js/study/settings.js");

// transformers.js's own list, the one its Whisper checks a language against (["en","english"], …).
const library = readFileSync(new URL("vendor/transformers/transformers.min.js", PUBLIC), "utf8");
const at = library.indexOf('["en","english"]');
let end = at - 1;
for (let depth = 0; end < library.length; end++) {
  if (library[end] === "[") depth++;
  else if (library[end] === "]" && --depth === 0) break;
}
const listed = JSON.parse(library.slice(at - 1, end + 1)).map(([code]) => code);
check("WHISPER_LANGUAGES is transformers.js's list of Whisper's languages", [...speech.WHISPER_LANGUAGES].sort(), [...listed].sort());

const whisperCode = (code) => (code === "nb" ? "no" : code);
const unknown = Object.keys(LANGUAGES).filter((code) => !listed.includes(whisperCode(code)));
// Live since v49 (ga), v50 (eo) and v52 (fy, gd); a language added outside Whisper's list joins them here by itself.
for (const code of ["eo", "fy", "ga", "gd"]) check(`Whisper doesn't know ${LANGUAGES[code].name} (${code})`, unknown.includes(code), true);
check("Norwegian Bokmål is Whisper's no", speech.whisperKnows("nb-NO"), true);
// A locale is its registry language, never just its first subtag: zh-TW is Traditional Chinese, which Whisper writes in
// Simplified, so it's the browser's alone.
check(
  "Every language's locale is that language",
  Object.entries(LANGUAGES).filter(([code, language]) => speech.languageCode(language.locale) !== code).map(([code]) => code),
  [],
);
check("A locale outside the registry: its language and script, else its base", ["nl-BE", "zh-Hant-HK", "zh-SG", "xx-YY"].map(speech.languageCode), ["nl", ...(LANGUAGES["zh-Hant"] ? ["zh-Hant"] : ["zh"]), "zh", "xx"]);

const sayIt = (choice) => ({ engine: choice.engine, ...(choice.engine ? { fellBack: choice.fellBack } : { reason: choice.reason }), ...(choice.why ? { why: choice.why } : {}) });
for (const [code, language] of Object.entries(LANGUAGES)) {
  const locale = language.locale;
  const knows = !unknown.includes(code);
  const name = `${language.name} (${locale})`;
  const doesnt = `Whisper doesn't know ${language.name}.`;

  // No recognizer in the browser, no model downloaded.
  recognizer(false);
  downloaded = false;
  setStudySetting("say.engine", "browser");
  const { whisper } = await speech.support(locale);
  check(`${name}: support's Whisper`, whisper, knows ? { state: "webgpu", f16: true } : { state: "none", f16: false, why: doesnt, unknownLanguage: true });
  check(
    `${name}: no recognizer, no model: Say it`,
    sayIt(await chooseEngine(locale)),
    knows ? { engine: null, reason: "setup" } : { engine: null, reason: "unsupported", why: `This browser has no speech recognizer. ${doesnt}` },
  );

  // Whisper chosen in Settings and downloaded.
  downloaded = true;
  setStudySetting("say.engine", "whisper");
  check(
    `${name}: Whisper chosen and downloaded, no recognizer: Say it`,
    sayIt(await chooseEngine(locale)),
    knows ? { engine: "whisper", fellBack: false } : { engine: null, reason: "unsupported", why: `This browser has no speech recognizer. ${doesnt}` },
  );
  // Chrome's recognizer, for the languages Google knows (GOOGLE_KNOWS); for any other it isn't offered.
  recognizer(true);
  const google = GOOGLE_KNOWS.has(code.split("-")[0]);
  const chromeDoesnt = `Chrome's recognizer doesn't know ${language.name}.`;
  check(
    `${name}: Whisper chosen and downloaded, Chrome's recognizer: Say it`,
    sayIt(await chooseEngine(locale)),
    knows ? { engine: "whisper", fellBack: false } : google ? { engine: "browser", fellBack: true } : { engine: null, reason: "unsupported", why: `${chromeDoesnt} ${doesnt}` },
  );
  // Nothing downloaded, the browser's recognizer chosen (the default): Chrome's where Google knows the language; where
  // it doesn't, Say it is unavailable, and never asks for a Whisper download (the interim rule, 28 Oct).
  downloaded = false;
  setStudySetting("say.engine", "browser");
  check(
    `${name}: nothing downloaded, Chrome's recognizer: Say it`,
    sayIt(await chooseEngine(locale)),
    google ? { engine: "browser", fellBack: false } : { engine: null, reason: "unsupported", why: knows ? chromeDoesnt : `${chromeDoesnt} ${doesnt}` },
  );

  // listen() asked for Whisper anyway refuses in words before the microphone, never reaching the worker.
  if (!knows) {
    const listener = speech.listen({ engine: "whisper", model: "whisper-small", expected: "x", lang: locale });
    const error = await listener.done.then(() => null, (e) => e);
    check(`${name}: listen with Whisper`, { code: error?.code, message: error?.message }, { code: "unsupported", message: `${doesnt} Try the browser's recognizer.` });
  }
}

// Translate's dictation (chooseDictation): the same order as Say it, the browser's first; on a phone, Whisper only if it was chosen in Settings.
{
  const { chooseDictation } = await import("../public/js/study/speaking.js");
  const { guardReady, tryWhisperAgain, whisperStopped } = await import("../public/js/speech/guard.js");
  await guardReady;
  const { browserSupport } = await import("../public/js/speech/browser.js");
  const ua = (value) => Object.defineProperty(globalThis.navigator, "userAgent", { value, configurable: true });
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
  const COMPUTER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
  // Safari's recognizer as support() sees it: no available(), so it can't say where it runs.
  class SafariRecognition {}
  const dictate = async ({ device, safari, model, engine, refused, say = chooseDictation }) => {
    ua(device);
    Object.defineProperty(globalThis.navigator, "standalone", { value: device === IPHONE, configurable: true });
    delete globalThis.SpeechRecognition;
    if (safari) globalThis.SpeechRecognition = SafariRecognition;
    downloaded = model;
    setStudySetting("say.engine", engine);
    const choice = await say("nl-NL", { refused });
    return { engine: choice.engine, ...(choice.engine ? { fellBack: choice.fellBack } : { reason: choice.reason }), ...(choice.whisperStopped ? { whisperStopped: true } : {}) };
  };
  ua(IPHONE);
  Object.defineProperty(globalThis.navigator, "standalone", { value: true, configurable: true });
  globalThis.SpeechRecognition = SafariRecognition;
  check("An iPhone's Home Screen app: its recognizer is there, with no warning against it", await browserSupport("nl-NL"), { state: "unknown" });
  const browser = { engine: "browser", fellBack: false };
  const nothing = { engine: null, reason: "unsupported" };
  for (const [name, setting, want] of [
    ["Home Screen, nothing downloaded", { device: IPHONE, safari: true, model: false, engine: "browser" }, browser],
    ["Home Screen, the model downloaded, Settings untouched", { device: IPHONE, safari: true, model: true, engine: "browser" }, browser],
    ["Home Screen, Whisper chosen, the model downloaded", { device: IPHONE, safari: true, model: true, engine: "whisper" }, { engine: "whisper", fellBack: false }],
    ["Home Screen, Whisper chosen, not downloaded", { device: IPHONE, safari: true, model: false, engine: "whisper" }, { engine: "browser", fellBack: true }],
    ["Home Screen, Whisper chosen, it failed outright", { device: IPHONE, safari: true, model: true, engine: "whisper", refused: ["whisper"] }, { engine: "browser", fellBack: true }],
    ["a phone with no recognizer, nothing downloaded: never offered", { device: IPHONE, safari: false, model: false, engine: "browser" }, nothing],
    ["a phone with no recognizer, the model downloaded, not chosen", { device: IPHONE, safari: false, model: true, engine: "browser" }, nothing],
    ["a computer, the browser's and the model", { device: COMPUTER, safari: true, model: true, engine: "browser" }, browser],
    ["a computer with no recognizer, nothing downloaded: offered", { device: COMPUTER, safari: false, model: false, engine: "browser" }, { engine: null, reason: "download" }],
    ["a computer with no recognizer, the model downloaded", { device: COMPUTER, safari: false, model: true, engine: "browser" }, { engine: "whisper", fellBack: true }],
    ["a computer whose recognizer failed outright, the model downloaded", { device: COMPUTER, safari: true, model: true, engine: "browser", refused: ["browser"] }, { engine: "whisper", fellBack: true }],
    ["a computer whose recognizer failed outright, nothing downloaded", { device: COMPUTER, safari: true, model: false, engine: "browser", refused: ["browser"] }, { engine: null, reason: "download" }],
  ]) check(`Dictation: ${name}`, await dictate(setting), want);

  // The app died with Whisper in memory on this device: nothing starts it, whoever chose it.
  localStorage.setItem("lx.whisper.stopped.v1", JSON.stringify({ model: "whisper-small", stage: "loading", at: 1 }));
  check("Whisper stopped: noted", whisperStopped()?.stage, "loading");
  const fellBack = { engine: "browser", fellBack: true, whisperStopped: true };
  const withStopped = { device: IPHONE, safari: true, model: true, engine: "whisper" };
  check("Whisper stopped, chosen: Translate", await dictate(withStopped), fellBack);
  check("Whisper stopped, chosen: Say it and a conversation", await dictate({ ...withStopped, say: chooseEngine }), fellBack);
  check("Whisper stopped, no recognizer: Say it says so", await dictate({ ...withStopped, safari: false, say: chooseEngine }), nothing);
  check("Whisper stopped, a computer with no recognizer: not offered", await dictate({ device: COMPUTER, safari: false, model: true, engine: "browser" }), nothing);
  tryWhisperAgain();
  check("Tried again: Whisper is back for who chose it", await dictate(withStopped), { engine: "whisper", fellBack: false });
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
