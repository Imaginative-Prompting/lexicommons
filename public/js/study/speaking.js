// Speaking, for the games and Settings → Study → Say it: which recognizer to use (the browser's own, or Whisper running
// on this device), falling back to the other when the chosen one can't run here. Whisper never starts here once the app has
// died with it in memory on this device (speech/guard.js). The speech module (js/speech/) is loaded only when something needs it.

import { getStudySettings, setStudySetting } from "./settings.js";
import { learningLocale } from "./learning.js";
import { guardReady, onPhone, whisperStopped } from "../speech/guard.js";

// Once, on a phone: a Whisper chosen before 4 Nov 2026 goes back to the browser's recognizer. A model on the device used to pick Whisper for
// you, and it could take the page down with nothing to stop it happening again, so an old choice isn't one made knowing that. Choosing it again stays.
try {
  if (onPhone() && !localStorage.getItem("lx.whisper.phone-choice.v1")) {
    localStorage.setItem("lx.whisper.phone-choice.v1", "1");
    if (getStudySettings().say.engine === "whisper") setStudySetting("say.engine", "browser");
  }
} catch {
  // Private browsing: nothing kept, so nothing to put back.
}

let loading = null;
let loaded = null;
/** The speech module, or null when it can't load. */
export const speechApi = () =>
  (loading ??= import("/js/speech/speech.js")
    .then((api) => (loaded = api))
    .catch((error) => (console.warn("[speaking] speech module unavailable", error), null)));

/**
 * Call first thing in the mic button's press, before anything awaits: on iPhone the microphone's audio has to start
 * inside the press itself. Works once the module has loaded (a speaking step starts loading it as it appears).
 */
export function wakeSpeech() {
  loaded?.wake?.();
}

/** The Whisper models this device can run, best first. */
export const usableModels = (api, support) =>
  (api.MODELS ?? []).filter((m) =>
    support.whisper.state === "webgpu" ? m.devices.includes("webgpu") && (!m.needsF16 || support.whisper.f16) : support.whisper.state === "wasm" && m.devices.includes("wasm"),
  );

/**
 * The Whisper model to use: the one you chose; else the best one already on this device (so a download is never
 * wasted); else the one that suits this device.
 */
export async function pickModel(api, support) {
  const chosen = getStudySettings().say.model;
  if (chosen) return chosen;
  for (const model of usableModels(api, support)) {
    if ((await api.modelState(model.id).catch(() => null))?.state === "ready") return model.id;
  }
  return api.recommendedModel(support);
}

/** What to show while Whisper loads into memory, after `seconds`. */
export const loadingText = (seconds) =>
  seconds < 12
    ? `Getting Whisper ready… ${seconds} s`
    : `Getting Whisper ready… ${seconds} s. The first time takes longest on a phone; the Smaller model (Settings, Study, Speaking) loads faster.`;

/**
 * Gets Whisper into memory before listening, so its heavy load never runs alongside the microphone prompt or a
 * recording (on an iPhone that froze the app). onWait(seconds) ticks once a second while it loads.
 */
export async function readyWhisper(choice, onWait) {
  if (choice.engine !== "whisper") return;
  const started = Date.now();
  const tick = setInterval(() => onWait?.(Math.round((Date.now() - started) / 1000)), 1000);
  try {
    await choice.api.prepare({ engine: "whisper", model: choice.model });
  } finally {
    clearInterval(tick);
  }
}

/** What can listen for a locale, as the choosers below read it. refused: recognizers that failed outright just now. */
async function recognizers(locale, refused = []) {
  await guardReady;
  const api = await speechApi();
  if (!api) return { api };
  const want = getStudySettings().say.engine;
  const support = await api.support(locale);
  const model = await pickModel(api, support);
  const stopped = whisperStopped();
  const whisperOk = support.whisper.state !== "none" && !stopped && !refused.includes("whisper");
  // Unreachable and not kept (offline, say): not here. It never stops the browser's recognizer listening.
  const state = whisperOk && model ? await api.modelState(model).catch(() => null) : null;
  return { api, want, support, model, state, stopped, whisperOk, whisperReady: state?.state === "ready", browserOk: support.browser.state !== "none" && !refused.includes("browser") };
}

/** The order every choice starts with: what you chose in Settings, else the browser's, which needs no download. Else null. */
function chosenFirst({ api, want, model, stopped, whisperReady, browserOk }) {
  if (want === "whisper" && whisperReady) return { api, engine: "whisper", model, fellBack: false };
  if (browserOk) return { api, engine: "browser", fellBack: want !== "browser", ...(want === "whisper" && stopped ? { whisperStopped: true } : {}) };
  return null;
}

// When the app died with Whisper in memory: no choice starts it, and with nothing else to listen, this says why.
const STOPPED_WHY = "Whisper stopped this app on this device, and this browser has no recognizer of its own. Settings, Study, Speaking can try it again.";

/**
 * The recognizer to listen with now, for a locale (the language you're learning's unless said): { api, engine:
 * "browser" | "whisper", model, fellBack, whisperStopped? }. When neither can run, { api, engine: null, reason, why? } where reason is
 * "setup" (Whisper could run once its model is downloaded) or "unsupported"; why, when Whisper doesn't know the
 * language, says so (the browser's recognizer can't help either), for the screen to show.
 */
export async function chooseEngine(locale = learningLocale()) {
  const found = await recognizers(locale);
  const { api, support, model, stopped, whisperOk, whisperReady } = found;
  if (!api) return { api, engine: null, reason: "unsupported" };
  const first = chosenFirst(found);
  if (first) return first;
  if (whisperReady) return { api, engine: "whisper", model, fellBack: true };
  if (support.whisper.unknownLanguage) return { api, engine: null, reason: "unsupported", why: [support.browser.why, support.whisper.why].filter(Boolean).join(" ") };
  // A language this browser's recognizer doesn't know: Whisper listens only if it's already downloaded (chosen in
  // Settings); Say it never asks for a download for one of these, Whisper's weaker languages, until that's decided.
  if (support.browser.unknownLanguage) return { api, engine: null, reason: "unsupported", why: support.browser.why };
  if (stopped) return { api, engine: null, reason: "unsupported", why: STOPPED_WHY };
  return { api, engine: null, reason: whisperOk ? "setup" : "unsupported" };
}

/**
 * The recognizer for dictation (Translate), for a locale: the same order as everywhere: what you chose in Settings, else the
 * browser's, one language at a time with a press to switch. On a phone that's all: Whisper there is only ever a choice in Settings, so
 * it's never offered, and a model already on the phone changes nothing. On a computer, with no browser's recognizer, Whisper listens
 * if it's here, and else { engine: null, reason: "download", model, bytes } offers it: bytes to come.
 * { engine: null, reason: "unsupported", why } when nothing can. refused: recognizers that failed outright just now.
 */
export async function chooseDictation(locale = learningLocale(), { refused = [] } = {}) {
  const found = await recognizers(locale, refused);
  const { api, support, model, state, stopped, whisperOk, whisperReady } = found;
  if (!api) return { api, engine: null, reason: "unsupported" };
  const first = chosenFirst(found);
  if (first) return first;
  const why = stopped ? STOPPED_WHY : [support.browser.why, support.whisper.state === "none" ? support.whisper.why : null].filter(Boolean).join(" ");
  if (onPhone()) return { api, engine: null, reason: "unsupported", why };
  if (whisperReady) return { api, engine: "whisper", model, fellBack: true };
  if (state) return { api, engine: null, reason: "download", model, bytes: state.total - state.have };
  return { api, engine: null, reason: "unsupported", why };
}
