// The full translator, on this device: the one place Translate's page and Settings → Translate ask about it. Mozilla's
// on-device models (translate/models.js; MPL-2.0), run in their own worker (translate/model-worker.js), downloaded per
// language, both ways with English as one download, kept in Cache Storage for offline, removable in Settings → Translate.
// The packs answer first, always; the translator's answer joins as the best guess once it's here (translate/page.js).
//
//   translatorState(from, to): { state, got, size, language, waiting }
//     ready: it answers this way. downloading: got of size MB, packs answering meanwhile (waiting: not started yet, until
//     the word packs this device is getting are in). offer: a download of size MB
//     would bring it (the page offers it on a limited answer). declined: Not now, for this language on this device.
//     none: no translator for this language (language: its code). absent: not known yet, or offline with nothing asked.
//   translateWith(from, to, text): a Promise of its one answer, or null.
//   onTranslatorChange(fn): calls fn when any state changes; returns a function that stops it.
//   downloadTranslator(lang), stopTranslator(lang), removeTranslator(lang), declineTranslator(lang), translatorsHere(),
//   translatorSize(lang): what the download and Settings use. Never "model", "Mozilla" or "AI" on a screen.
//
// Nothing downloads without a press, but one: the language you're learning, once the app has been opened before, while the
// browser says it's on Wi-Fi and not saving data, with room to spare (navigator.connection; iOS doesn't say, so an iPhone
// is always asked).

import { CACHE, LANGUAGES_WITH, RUNTIME, WAYS, filesOf } from "./models.js";

const MB = 1e6;
const DECLINED = "lx.translator.declined.v1"; // [lang]: Not now, on this device
const BACKGROUND = "lx.translator.background.v1"; // the languages a background download was started for (once each)
const listeners = new Set();
const here = new Set(); // languages whose every file is on this device
const downloads = new Map(); // lang → { got, size, promise }
const failed = new Map(); // lang → message
let checked = false;
let worker = null;
let next = 0;
const pending = new Map();

const tell = () => {
  for (const fn of listeners) {
    try {
      fn();
    } catch (error) {
      console.error(error);
    }
  }
};
const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const languageOf = (from, to) => (from === "en" ? to : from);
const hasTranslator = (lang) => LANGUAGES_WITH.includes(lang);
const allFiles = (lang) => [RUNTIME.wasm, ...filesOf(lang)];

/** What a language's translator is, in bytes: its files, and the runtime unless another language here holds it already.
 * The one number for it everywhere: the download's size, and what it takes on the device (Remove takes the runtime too
 * when no other language uses it). */
export function translatorSize(lang, { runtimeHere = [...here].some((code) => code !== lang) } = {}) {
  return (runtimeHere ? 0 : RUNTIME.wasm.size) + filesOf(lang).reduce((sum, file) => sum + file.size, 0);
}

function call(op, data = {}, onProgress) {
  if (!worker) {
    worker = new Worker("/js/translate/model-worker.js");
    worker.onmessage = ({ data: message }) => {
      const job = pending.get(message.id);
      if (!job) return;
      if (!message.done) return job.onProgress?.(message);
      pending.delete(message.id);
      if (message.error) job.reject(new Error(message.error));
      else job.resolve(message);
    };
    // A worker that never started (its script, or the runtime it imports, didn't load) or that died: every call waiting
    // on it fails (a download says it didn't, with Retry), and the next call starts a new one.
    const died = (event) => {
      event?.preventDefault?.();
      if (worker !== started) return;
      worker = null;
      started.terminate();
      for (const job of pending.values()) job.reject(new Error("The translator didn't start."));
      pending.clear();
    };
    const started = worker;
    worker.onerror = died;
    worker.onmessageerror = died;
    worker.postMessage({ id: -1, op: "configure", cache: CACHE });
  }
  const id = ++next;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, op, ...data });
  });
}

// What's on this device, read from Cache Storage on the page (no worker needed to know).
async function check() {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE);
    for (const lang of LANGUAGES_WITH) {
      let all = true;
      for (const file of allFiles(lang)) if (!(await cache.match(file.url))) all = false;
      if (all) here.add(lang);
      else here.delete(lang);
    }
  } catch {}
  checked = true;
  tell();
}
if (typeof window !== "undefined") check().then(() => setTimeout(considerBackground, 10_000));

export function translatorState(from, to) {
  const language = languageOf(from, to);
  if (!hasTranslator(language)) return { state: "none", language };
  if (here.has(language)) return { state: "ready", language };
  const download = downloads.get(language);
  if (download) return { state: "downloading", language, waiting: download.waiting, got: Math.round(download.got / MB), size: Math.round(download.size / MB) };
  if (!checked) return { state: "absent", language };
  if (failed.has(language)) return { state: "failed", language, message: failed.get(language), size: Math.round(translatorSize(language) / MB) };
  if (read(DECLINED).includes(language)) return { state: "declined", language };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { state: "absent", language };
  return { state: "offer", language, size: Math.round(translatorSize(language) / MB) };
}

export async function translateWith(from, to, text) {
  const way = `${from}>${to}`;
  const language = languageOf(from, to);
  if (!WAYS[way] || !here.has(language) || !text?.trim()) return null;
  try {
    await call("load", { way, wasm: RUNTIME.wasm, files: { model: WAYS[way].model, lex: WAYS[way].lex, vocab: WAYS[way].vocab }, from, to });
    const { out } = await call("translate", { way, text: text.slice(0, 1000) });
    return typeof out === "string" && out.trim() ? out.trim() : null;
  } catch (error) {
    console.error("[translator]", error);
    return null;
  }
}

export function onTranslatorChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Downloads a language's translator (both ways), resolving when it's here; onProgress({ got, size }) in bytes. */
export function downloadTranslator(lang, { onProgress } = {}) {
  if (!hasTranslator(lang)) return Promise.reject(new Error(`No translator for ${lang}`));
  if (here.has(lang)) return Promise.resolve();
  if (downloads.has(lang)) return downloads.get(lang).promise;
  failed.delete(lang);
  const files = allFiles(lang);
  const download = { got: 0, size: files.reduce((sum, file) => sum + file.size, 0), waiting: false, started: false, stopped: false, stopWait: null };
  // Kept for good, if the browser lets us: a download someone chose shouldn't be the first thing cleared.
  navigator.storage?.persist?.().catch(() => {});
  download.promise = afterPacks(download)
    .then(() =>
      call("download", { files }, ({ got }) => {
        download.got = got;
        onProgress?.({ got, size: download.size });
        tell();
      }),
    )
    .then(() => {
      downloads.delete(lang);
      here.add(lang);
      write(DECLINED, read(DECLINED).filter((code) => code !== lang));
      tell();
    })
    .catch((error) => {
      downloads.delete(lang);
      if (error.message !== "stopped") failed.set(lang, error.message);
      tell();
      throw error;
    });
  downloads.set(lang, download);
  tell();
  return download.promise;
}

/** Stops a download (or its wait for the word packs); what came whole stays, and the next download goes on from there. Not
 * remembered as Not now. */
export async function stopTranslator(lang) {
  const download = downloads.get(lang);
  if (!download) return;
  if (download.waiting || !download.started) {
    download.stopped = true;
    download.stopWait?.();
    return;
  }
  await call("stop");
}

// The word packs first: a download pressed, or started in the background, while this device is still getting its word
// packs waits for them, so the two never share the connection (the packs answer Translate, and the full translator is
// bigger). It says so (translatorState's waiting), and Stop ends the wait. packs.js is loaded here only when a download
// starts, so Node's tests of this module never load it.
async function afterPacks(download) {
  const { packDownloads, onPackDownloads } = await import("../study/packs.js");
  if (download.stopped) throw new Error("stopped");
  if (packDownloads()) {
    download.waiting = true;
    tell();
    await new Promise((resolve, reject) => {
      const stop = onPackDownloads((now) => {
        if (now) return;
        stop();
        resolve();
      });
      download.stopWait = () => {
        stop();
        reject(new Error("stopped"));
      };
    });
    download.waiting = false;
    download.stopWait = null;
  }
  if (download.stopped) throw new Error("stopped");
  download.started = true;
  tell();
}

/** Takes a language's translator off this device (the runtime stays while another language uses it). */
export async function removeTranslator(lang) {
  const others = [...here].filter((code) => code !== lang);
  const files = [...filesOf(lang), ...(others.length ? [] : [RUNTIME.wasm])].filter((file) => !others.some((code) => filesOf(code).some((f) => f.url === file.url)));
  await call("remove", { files, ways: [`${lang}>en`, `en>${lang}`] });
  here.delete(lang);
  tell();
}

/** Not now: the offer stays away for this language on this device; Settings → Translate is the way back. */
export function declineTranslator(lang) {
  write(DECLINED, [...new Set([...read(DECLINED), lang])]);
  tell();
}

/** The languages whose translator is on this device, with what each takes. */
export const translatorsHere = () => [...here].map((lang) => ({ lang, bytes: translatorSize(lang) }));
export const translatorChecked = () => checked;
export const hasFullTranslator = hasTranslator;

// The language you're learning, in the background: only on Wi-Fi the browser vouches for, not saving data, with room,
// once per language, never for one you said Not now to.
async function considerBackground() {
  try {
    const { learning } = await import("../study/learning.js");
    const lang = learning();
    const connection = navigator.connection;
    if (!hasTranslator(lang) || here.has(lang) || downloads.has(lang) || read(DECLINED).includes(lang) || read(BACKGROUND).includes(lang)) return;
    if (connection?.type !== "wifi" || connection.saveData) return;
    const { quota = 0, usage = 0 } = (await navigator.storage?.estimate?.()) ?? {};
    if (quota - usage < 3 * translatorSize(lang)) return;
    write(BACKGROUND, [...read(BACKGROUND), lang]);
    downloadTranslator(lang).catch(() => {});
  } catch {}
}
