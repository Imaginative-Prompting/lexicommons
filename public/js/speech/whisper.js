// The page's side of the Whisper worker: one worker holding one model at a time. It's let go after a few minutes
// unused, which frees the model's memory on the GPU; the next answer loads it again from the device. A phone, which has far
// less memory for it, lets it go after a minute, and as soon as the app leaves the screen. guard.js knows it's in memory from
// before it starts until it's let go, so a page that dies in between never starts it again by itself.

import { SpeechError } from "./errors.js";
import { onPhone, whisperHolds, whisperLetGo } from "./guard.js";

const IDLE_MS = () => (onPhone() ? 60 * 1000 : 5 * 60 * 1000);

let worker = null;
let loadedKey = null; // the model and device asked for
let loadedDevice = null; // the device it really runs on (WebAssembly when WebGPU wasn't there after all)
let loading = null; // { key, promise }
let idleTimer = null;
let nextId = 1;
const pending = new Map();

function spawn() {
  worker = new Worker(new URL("./whisper-worker.js", import.meta.url), { type: "module", name: "lexicommons-whisper" });
  worker.onmessage = (event) => {
    const message = event.data;
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.type === "error") waiting.reject(new SpeechError(message.code === "model-missing" ? "model-missing" : "model-failed", message.code === "model-missing" ? undefined : `The speech model couldn't run: ${message.message}`));
    else waiting.resolve(message);
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    const error = new SpeechError("model-failed", `The speech model stopped: ${event.message || "the worker failed to start"}`);
    for (const waiting of pending.values()) waiting.reject(error);
    pending.clear();
    unloadWhisper();
  };
}

function ask(message, transfer = []) {
  if (!worker) spawn();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...message, id }, transfer);
  });
}

function touch() {
  clearTimeout(idleTimer);
  // Never in the middle of a load: on a phone that can take longer than the wait.
  idleTimer = setTimeout(() => (loading ? touch() : unloadWhisper()), IDLE_MS());
}

/** Loads a model into the worker (from the device) and warms it up. → { device, ms } */
export function loadWhisper(model, device) {
  const key = `${model}:${device}`;
  touch();
  if (loadedKey === key && !loading) return Promise.resolve({ device: loadedDevice, ms: 0 });
  if (loading?.key === key) return loading.promise;
  whisperHolds("loading", { model, device });
  const promise = ask({ type: "load", model, device }).then(
    (message) => {
      loadedKey = key;
      loadedDevice = message.device;
      if (loading?.promise === promise) loading = null;
      whisperHolds("held", { device: message.device });
      touch();
      return { device: message.device, ms: message.ms };
    },
    (error) => {
      if (loading?.promise === promise) loading = null;
      // Whatever it got as far as goes with the worker, and the failure was an error, not a crash.
      unloadWhisper();
      throw error;
    },
  );
  loading = { key, promise };
  return promise;
}

/**
 * What Whisper heard in 16 kHz audio, and how well each of `score` fits it. detect: Whisper's codes for the languages it
 * may be, for it to say which it hears (language, shares in the answer: whisper-worker.js).
 */
export async function transcribeWhisper(audio, { language = "nl", score = [], detect } = {}) {
  touch();
  if (loading) await loading.promise;
  whisperHolds("thinking");
  try {
    return await ask({ type: "transcribe", audio, language, score, ...(detect ? { detect } : {}) }, [audio.buffer]);
  } finally {
    if (worker) {
      whisperHolds("held");
      touch();
    }
  }
}

export const whisperLoaded = () => (loadedKey ? { model: loadedKey.split(":")[0], device: loadedDevice } : null);

/** Lets the worker go, and with it the model's memory. */
export function unloadWhisper() {
  clearTimeout(idleTimer);
  worker?.terminate();
  worker = null;
  loadedKey = null;
  loadedDevice = null;
  loading = null;
  whisperLetGo();
  const error = new SpeechError("aborted");
  for (const waiting of pending.values()) waiting.reject(error);
  pending.clear();
}

globalThis.document?.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && onPhone()) unloadWhisper();
});
