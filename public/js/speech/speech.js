// Speaking: what the games call to hear you say a sentence and check it, word by word. Two recognizers, both free to
// run (nothing goes through our server):
//   "browser"  the browser's own recognizer (Chrome sends audio to Google, Safari to Apple, unless the browser has
//              the language on the device)
//   "whisper"  Whisper, running in the app on your device, on WebGPU (WebAssembly where there's no WebGPU); its model
//              is downloaded once and kept on the device
//
//   support(lang)                       what this device can do, without touching the microphone
//   whisperKnows(lang)                  whether Whisper knows the language (WHISPER_LANGUAGES); support says none if not
//   languageCode(lang)                  the registry's language for a locale (zh-TW → zh-Hant, nl-BE → nl)
//   MODELS, recommendedModel(support)   the Whisper models, and the one that suits this device
//   modelState(id) / downloadModel(id, { onProgress, signal }) / deleteModel(id)
//   prepare({ engine, model })          load Whisper ahead of the first answer (optional; listen() does it too)
//   wake()                              first thing in the press that starts listening (iPhone audio)
//   listen({ engine, model, expected, accept, readings, lang, onState, onLevel, signal, holdMic, detect })
//     → { stop(), cancel(), done: Promise<Result> }
//     expected null: free speech (a conversation): nothing to check against, so match is null and `unsure` lists the
//     words the recognizer doubted. detect (Whisper only): the registry's codes it may be in: it's written down in each
//     (Result's written: [{ language, text, mean }], the one Whisper leans to first, with shares)
//   releaseMic(), unload()
//   match(expected, heard)              the matcher on its own (match.js)
//
// Result: { engine, heard, alternatives, match, unsure?, model?, device?, ms }
//   match: { ok, score, words: [{ text, heard, result: right|close|order|wrong|missing }], extra, how: "heard"|"fit" }
//   how "fit": the recognizer wrote something else, but your recording fits the expected sentence well (an accent),
//   so the words it doubted are "close". Never for a word-order slip, which is always reported as said.
// States, in order: "loading" (only when Whisper isn't in memory yet; it loads while you speak) → "asking" (the
//   microphone) → "listening" (the recording has started: nothing said from here is lost) → "hearing" (speech
//   started) → "thinking" → the result.
// Errors: SpeechError with .code (errors.js) and a .message for people.

import { browserListen, browserSupport, installLanguage, noteTrackDeaf, takesTrack } from "./browser.js";
import { asSpeechError, SpeechError } from "./errors.js";
import { onPhone } from "./guard.js";
import { match } from "./match.js";
import { LANGUAGES } from "../lang/index.js";
import { audioContext, holdMic, loadCapture, monitorLevel, openMic, record, releaseMic } from "./mic.js";
import { LIBRARIES, modelById, MODELS, runtimeFor, RUNTIMES } from "./models.js";
import * as store from "./store.js";
import { loadWhisper, transcribeWhisper, unloadWhisper, whisperLoaded } from "./whisper.js";

export { match, MODELS, SpeechError, releaseMic, installLanguage };
export { megabytes } from "./store.js";

// The language a locale is, as the registry names it: the language with that locale or code (zh-TW is zh-Hant, the
// Traditional one), or with its language and script (zh-Hant-TW); else its base code (nl-BE is nl).
export function languageCode(lang) {
  const tag = String(lang);
  const lower = tag.toLowerCase();
  const exact = Object.keys(LANGUAGES).find((code) => code.toLowerCase() === lower || LANGUAGES[code].locale?.toLowerCase() === lower);
  if (exact) return exact;
  const [base, ...rest] = lower.split("-");
  const script = rest.find((part) => /^[a-z]{4}$/.test(part));
  const scripted = script && Object.keys(LANGUAGES).find((code) => code.toLowerCase() === `${base}-${script}`);
  return scripted ?? base;
}
// The code Whisper knows a language by: its own, except where Whisper's differs (Norwegian Bokmål, nb, is no to it;
// transformers.js refuses a code it doesn't list).
const WHISPER_CODES = { nb: "no" };
const whisperCode = (lang) => WHISPER_CODES[languageCode(lang)] ?? languageCode(lang);
const fromWhisper = (code) => Object.keys(WHISPER_CODES).find((language) => WHISPER_CODES[language] === code) ?? code;
// The languages Whisper knows: transformers.js's list (4.3.1), the codes it takes. For any other it refuses to start, so
// Whisper isn't offered (scripts/test-speech-support.mjs holds this list to the vendored library's).
export const WHISPER_LANGUAGES = new Set(
  ("en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt la mi ml cy " +
    "sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo " +
    "uz fo ht ps tk nn mt sa lb my bo tl mg as tt haw ln ha ba jw su").split(" "),
);
/** Whether Whisper knows a locale's language. */
export const whisperKnows = (lang) => WHISPER_LANGUAGES.has(whisperCode(lang));

let gpu = null;
function gpuInfo() {
  gpu ??= (async () => {
    try {
      const adapter = await navigator.gpu?.requestAdapter();
      return adapter ? { f16: adapter.features.has("shader-f16") } : null;
    } catch {
      return null;
    }
  })();
  return gpu;
}

/**
 * What this device can do:
 *   browser: { state: "local" | "downloadable" | "server" | "unknown" | "none", why? }
 *   whisper: { state: "webgpu" | "wasm" | "none", f16, why?, unknownLanguage? }
 *   unknownLanguage: true when the device could run Whisper but Whisper doesn't know the language
 */
export async function support(lang = "nl-NL") {
  const [browser, gpu] = await Promise.all([browserSupport(lang), gpuInfo()]);
  let whisper;
  if (!globalThis.Worker || !globalThis.WebAssembly || !globalThis.caches) whisper = { state: "none", f16: false, why: "This browser can't run a speech model in the app." };
  else if (!whisperKnows(lang)) whisper = { state: "none", f16: false, why: `Whisper doesn't know ${LANGUAGES[languageCode(lang)]?.name ?? lang}.`, unknownLanguage: true };
  else if (!(await store.siteHasModels(MODELS[0].id))) whisper = { state: "none", f16: false, why: "This copy of Lexicommons doesn't have the speech model. Whoever runs it can add it." };
  else if (gpu) whisper = { state: "webgpu", f16: gpu.f16 };
  else whisper = { state: "wasm", f16: false, why: "No WebGPU here, so the speech model runs on the processor: slower." };
  return { browser, whisper };
}

/** The model that suits this device: the best one where the GPU can, smaller without 16-bit GPU maths or memory. */
export function recommendedModel(supported) {
  const whisper = supported?.whisper ?? supported;
  if (whisper?.state === "wasm") return "whisper-base";
  if (whisper?.state !== "webgpu") return null;
  const lowMemory = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
  // Phones and tablets have far less memory for it than a computer (and Safari doesn't say how much): Smaller there.
  // Best's first load froze an iPhone's home-screen app (26 Oct).
  return whisper.f16 && !lowMemory && !onPhone() ? "whisper-turbo" : "whisper-small";
}

const deviceFor = (model, supported) => (model.devices.includes("webgpu") && supported?.whisper?.state !== "wasm" ? "webgpu" : "wasm");

function packsFor(model, device) {
  return [model.id, runtimeFor(device).pack];
}

/**
 * How much of a model (and the runtime it needs on this device) is downloaded: { state: "absent" | "partial" |
 * "ready", have, total } in bytes; total - have is what a download still fetches (the runtime may already be here
 * for another model). Pass `device` only to ask about another one.
 */
export async function modelState(id, { device } = {}) {
  const model = modelById(id);
  if (!model) throw new SpeechError("model-missing", `There's no speech model called ${id}.`);
  try {
    const states = await Promise.all(packsFor(model, device ?? deviceFor(model, await support())).map((pack) => store.packState(pack)));
    const have = states.reduce((n, s) => n + s.have, 0);
    const total = states.reduce((n, s) => n + s.total, 0);
    // The runtime is shared, so another model's download doesn't make this one partly here.
    return { state: states[0].state === "absent" ? "absent" : have >= total ? "ready" : "partial", have, total };
  } catch (error) {
    throw asSpeechError(error, "offline");
  }
}

/** Downloads a model and its runtime onto the device. onProgress({ have, total }). Stopping keeps what's done. */
export async function downloadModel(id, { onProgress, signal, device } = {}) {
  const model = modelById(id);
  if (!model) throw new SpeechError("model-missing", `There's no speech model called ${id}.`);
  try {
    const result = await store.download(packsFor(model, device ?? deviceFor(model, await support())), { onProgress, signal });
    await store.keep(LIBRARIES);
    return result;
  } catch (error) {
    throw asSpeechError(error, "download-failed");
  }
}

/** Removes a model from the device (and the runtime, once no model is left). */
export async function deleteModel(id) {
  const model = modelById(id);
  if (!model) return;
  if (whisperLoaded()?.model === id) unloadWhisper();
  await store.remove(id);
  const others = await Promise.all(MODELS.filter((m) => m.id !== id).map((m) => store.packState(m.id).catch(() => ({ state: "absent" }))));
  if (others.every((s) => s.state === "absent")) {
    for (const runtime of Object.values(RUNTIMES)) await store.remove(runtime.pack);
    await store.forget(LIBRARIES);
  }
}

/** Loads Whisper ahead of the first answer, so that one isn't slow. → { device } */
export async function prepare({ engine = "whisper", model = null } = {}) {
  if (engine !== "whisper") return { device: null };
  const supported = await support();
  const chosen = modelById(model ?? recommendedModel(supported));
  if (!chosen) throw new SpeechError("unsupported", "This device can't run the speech model.");
  const state = await modelState(chosen.id, { device: deviceFor(chosen, supported) });
  if (state.state !== "ready") throw new SpeechError("model-missing");
  return loadWhisper(chosen.id, deviceFor(chosen, supported));
}

/**
 * Starts the device's audio. Call it first thing in the press that starts listening, before anything awaits: an
 * iPhone only starts audio from inside a press, and listen() may run after awaits of the game's own.
 */
export function wake() {
  try {
    // The recorder's worklet too, so its slow first start (mic.js loadCapture) runs while Whisper loads, not after
    // the microphone opens.
    loadCapture(audioContext()).catch(() => {});
  } catch {}
}

/** Lets the speech model go (its memory), and the microphone. */
export function unload() {
  unloadWhisper();
  releaseMic();
}

// ---------- deciding ----------

// Words Whisper writes for things that weren't speech, when the sentence itself doesn't have them.
const NOISE = [/\[[^\]]*\]/g, /\([^)]*\)/g, /\bondertitel(d|ing)\b[^.!?]*[.!?]?/gi, /\bamara\.org\b[^.!?]*[.!?]?/gi, /\bbedankt voor het (kijken|luisteren)\b[.!?]?/gi];

function clean(text, expectedText) {
  let out = text;
  for (const pattern of NOISE) {
    const probe = new RegExp(pattern.source, pattern.flags.replace("g", ""));
    if (!probe.test(expectedText)) out = out.replace(pattern, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

// The expected sentence as text: its words joined as its language joins them (nothing in Japanese or Chinese).
const asText = (expected, lang = "") => (expected == null ? "" : Array.isArray(expected) ? expected.join(LANGUAGES[languageCode(lang)]?.separator ?? " ") : String(expected));

// Free speech: the words Whisper was least sure of (any token less likely than this), as written.
const UNSURE_WORD = -2.5;
const bareWord = (word) => word.toLowerCase().replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, "");
function unsureFromWhisper(out, heard) {
  const said = new Set(heard.split(/\s+/).map(bareWord));
  return [...new Set((out.heard?.words ?? []).filter((w) => w.min < UNSURE_WORD).map((w) => bareWord(w.text)).filter((w) => w && said.has(w)))];
}
// The browser's recognizer: the words its other guesses disagree on.
function unsureFromBrowser(heard, alternatives) {
  const best = heard.split(/\s+/).map(bareWord).filter(Boolean);
  const others = alternatives.slice(1).map((alt) => new Set(alt.split(/\s+/).map(bareWord)));
  return [...new Set(best.filter((word) => others.some((alt) => !alt.has(word))))];
}

// How sure the rescue has to be (from the starter deck's recordings: no wrong word or wrong order passes these on
// either model, and most accented recordings of the right sentence do).
const FIT_SENTENCE = -1.5; // the expected sentence may be at most this much less likely than what Whisper wrote
const FIT_WORD = -3.5; // and no doubted word's least likely token below this

function decide(expected, accept, lang, out, readings = []) {
  const expectedText = asText(expected, lang);
  const heard = clean(out.text, expectedText);
  const m = match(expected, heard, { lang: languageCode(lang), accept, readings });
  if (m.ok || !out.scored?.length) return { ...m, how: "heard" };
  const doubted = m.words.map((w, i) => ({ ...w, i })).filter((w) => w.result !== "right");
  if (doubted.some((w) => w.result === "order")) return { ...m, how: "heard" };
  // The best-fitting way of writing the expected sentence (or an accepted one).
  const best = out.scored.reduce((a, b) => (b.lp > a.lp ? b : a));
  const delta = best.lp - out.heard.lp;
  const target = match(best.text, best.text, { lang: languageCode(lang) });
  const aligned = best.words.length === target.words.length;
  const wordsFit = aligned && doubted.every((w) => (best.words[w.i]?.min ?? -Infinity) >= FIT_WORD);
  if (delta < FIT_SENTENCE || !wordsFit) return { ...m, how: "heard", fit: { delta: Math.round(delta * 100) / 100 } };
  const words = m.words.map((w) => (w.result === "right" ? w : { ...w, result: "close" }));
  return { ...m, ok: true, score: Math.max(m.score, 0.75), words, extra: [], how: "fit", fit: { delta: Math.round(delta * 100) / 100 } };
}

// ---------- listening ----------

// A voice at the microphone, by our meter: a level a room's noise doesn't reach (mic.js levelOf: 0.5 is -36 dBFS), for this long in one
// listen. With that measured and the recognizer saying it heard nothing, the recognizer isn't hearing our track (browser.js noteTrackDeaf).
const VOICED_LEVEL = 0.5;
export const VOICED_MS = 400;
/** Adds up how long the meter's levels stayed at a voice's: { hear(level, now?), ms() }. A gap between two readings counts 100 ms at most. */
export function voicedClock() {
  let total = 0;
  let last = null;
  return {
    hear(level, now = performance.now()) {
      if (last != null && level >= VOICED_LEVEL) total += Math.min(100, now - last);
      last = now;
    },
    ms: () => total,
  };
}

// The bars where there's no meter (the recognizer has the microphone): each heard() moves them for a moment, a set swell and fall, so
// they follow what the recognizer says it has and never a sound nobody measured.
const HEARD_SWELL = [0.35, 0.7, 0.9, 0.6, 0.75, 0.45, 0.3, 0.15, 0];
const HEARD_STEP_MS = 70;
/** → { heard(), stop() }. onLevel gets the swell's levels, then 0. */
export function heardBars(onLevel) {
  let timer = null;
  let at = 0;
  const step = () => {
    onLevel(HEARD_SWELL[at]);
    at++;
    timer = at < HEARD_SWELL.length ? setTimeout(step, HEARD_STEP_MS) : null;
  };
  return {
    heard() {
      clearTimeout(timer);
      at = 0;
      step();
    },
    stop() {
      clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Listens for one answer and checks it against `expected` (a sentence, or its words as an array). See the top of
 * this file for the states, the result and the errors. Call it inside the press that starts it (iPhone needs that
 * to start audio).
 */
export function listen({ engine = "whisper", model = null, expected, accept = [], readings = [], lang = "nl-NL", onState, onLevel, signal, holdMic: hold = false, silence, wait, longest, detect } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let active = null; // the recording or the browser's recognizer, once started
  let stopped = false;
  const started = performance.now();
  const state = (s) => {
    if (!controller.signal.aborted) onState?.(s);
  };

  async function viaWhisper() {
    // Inside the press, the recorder's worklet too (mic.js loadCapture): its slow first start runs beside the
    // microphone's, when nothing called wake() first.
    loadCapture(audioContext()).catch(() => {});
    const supported = await support(lang);
    if (supported.whisper.unknownLanguage) throw new SpeechError("unsupported", `${supported.whisper.why} Try the browser's recognizer.`);
    const chosen = modelById(model ?? recommendedModel(supported));
    if (!chosen) throw new SpeechError("unsupported", "This device can't run the speech model. Try the browser's recognizer.");
    const device = deviceFor(chosen, supported);
    const ready = await modelState(chosen.id, { device });
    if (ready.state !== "ready") throw new SpeechError("model-missing");
    // Load while recording: by the time you've finished speaking it's usually ready.
    const already = whisperLoaded();
    const loading = loadWhisper(chosen.id, device);
    loading.catch(() => {});
    if (!already || already.model !== chosen.id) state("loading");
    state("asking");
    const stream = await openMic({ processing: false });
    if (hold) holdMic(stream, true);
    if (controller.signal.aborted) {
      if (!hold) releaseMic(stream);
      throw new SpeechError("aborted");
    }
    // "Listening" once the recording has its first audio, never when the microphone opens: on a first press the
    // recorder starts most of a second later (its worklet, and Chrome's first audio from a new source), and anything
    // said in between was lost while the button already said to speak.
    active = record(stream, { onStart: () => state("listening"), onLevel, onSpeech: () => state("hearing"), signal: controller.signal, silence, wait, longest });
    if (stopped) active.stop();
    const { audio } = await active.done;
    state("thinking");
    await loading;
    // Asked again: a phone lets Whisper go when the app leaves the screen, and that may have been while you spoke.
    const { device: ranOn } = await loadWhisper(chosen.id, device);
    const expectedText = asText(expected, lang);
    const free = expected == null;
    const listened = performance.now();
    // The worker also scores the expected sentence (and any accepted ones) against the recording.
    const out = await transcribeWhisper(audio, { language: whisperCode(lang), score: free ? [] : [expectedText, ...accept.map((a) => asText(a, lang))], ...(detect?.length ? { detect: detect.map(whisperCode) } : {}) });
    if (controller.signal.aborted) throw new SpeechError("aborted");
    const heard = free ? clean(out.text, "") : out.text;
    return {
      engine: "whisper",
      model: chosen.id,
      device: ranOn,
      heard,
      alternatives: [heard],
      match: free ? null : decide(expected, accept, lang, out, readings),
      ...(free ? { unsure: unsureFromWhisper(out, heard) } : {}),
      ...(out.language ? { language: fromWhisper(out.language), shares: out.shares, written: out.written.map((one) => ({ ...one, language: fromWhisper(one.language), text: clean(one.text, "") })) } : {}),
      ms: { listening: Math.round(listened - started), thinking: Math.round(performance.now() - listened) },
    };
  }

  async function viaBrowser() {
    // A computer's Chrome listens to our own microphone track; start audio inside the press, for the level meter.
    const ownMic = takesTrack();
    if (ownMic && onLevel) audioContext();
    state("asking");
    const supported = await browserSupport(lang);
    if (supported.state === "none") throw new SpeechError("unsupported", supported.why);
    let stream = null;
    let stopLevel = null;
    const voiced = voicedClock();
    if (ownMic) {
      stream = await openMic();
      if (hold) holdMic(stream, true);
      if (controller.signal.aborted) {
        if (!hold) releaseMic(stream);
        throw new SpeechError("aborted");
      }
      // The meter, and how long it measured a voice: a recognizer that then says it heard nothing is deaf to our track.
      stopLevel = monitorLevel(stream, (level) => (voiced.hear(level), onLevel?.(level)));
    }
    // Where the recognizer opens the microphone itself there's no meter: the bars are drawn from what it says, flat until it has
    // something of yours, moving each time it does (heardBars), so nobody speaks into a button that looks dead.
    const drawn = !ownMic && onLevel ? heardBars(onLevel) : null;
    let out;
    try {
      active = browserListen({ lang, onState: state, onHeard: drawn?.heard, signal: controller.signal, local: supported.state === "local", track: stream?.getAudioTracks()[0] ?? null });
      if (stopped) active.stop();
      out = await active.done;
    } catch (error) {
      if (ownMic && error?.code === "no-speech" && voiced.ms() >= VOICED_MS) noteTrackDeaf();
      throw error;
    } finally {
      drawn?.stop();
      stopLevel?.();
      if (stream && !hold) releaseMic(stream);
    }
    const listened = performance.now();
    const free = expected == null;
    const m = free ? null : match(expected, out.alternatives.length ? out.alternatives : [out.heard], { lang: languageCode(lang), accept, readings });
    return {
      engine: "browser",
      local: out.local,
      heard: out.heard,
      alternatives: out.alternatives,
      match: m && { ...m, how: "heard" },
      ...(free ? { unsure: unsureFromBrowser(out.heard, out.alternatives) } : {}),
      ms: { listening: Math.round(listened - started), thinking: 0 },
    };
  }

  const done = (engine === "browser" ? viaBrowser() : viaWhisper())
    .catch((error) => {
      throw controller.signal.aborted ? new SpeechError("aborted") : asSpeechError(error);
    })
    .finally(() => signal?.removeEventListener("abort", abort));

  return {
    stop: () => {
      stopped = true;
      active?.stop();
    },
    cancel: () => {
      controller.abort();
      active?.cancel();
    },
    done,
  };
}
