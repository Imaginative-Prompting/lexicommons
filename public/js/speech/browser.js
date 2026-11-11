// The browser's own speech recognizer (the Web Speech API): Chrome's (Google's servers, or on the device where
// Chrome has the language), Safari's (Apple's), Edge's (Microsoft's). Nothing runs on our server and it costs us
// nothing. Chrome listens to a microphone track we open (start(track)), so it gets the same permission handling and
// level meter as Whisper; elsewhere the recognizer opens the microphone itself.

import { SpeechError } from "./errors.js";
import { LANGUAGES } from "../lang/index.js";

const Recognition = () => globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null;

// The languages Google's recognizer (Chrome's) really knows, by code, measured on 28 Oct 2026: every registered locale
// played a Tagalog and a Dutch recording in Chrome (docs/speech-2026-10-28-recognizer-languages in the project). For any
// other language Chrome raises no error: it writes what it hears as English, so every answer would be marked wrong. Off
// it then: be br cy eo fy ga gd haw ht la lb mt. Measured the same way later that night: gu mr ne pa on (each written in
// its own script), ps off (English; docs/languages/batch-yi-ps-ckb-kmr/recognizer-locales.log in the project). A
// language added since isn't on it, so Chrome isn't offered for it until it's measured.
export const GOOGLE_KNOWS = new Set(
  ("af ar az bg bs ca cs da de el en es et eu fa fi fr gl gu he hi hr hu hy id is it ja ka kk ko lt lv mk mr ms nb ne nl " +
    "pa pl pt ro ru sk sl sq sr sv sw th tl tr uk ur uz vi yue zh").split(" "),
);
// Chrome's recognizer: the one with available() (the release that added on-device recognition), and not Edge's, which
// has Microsoft behind it.
const isChrome = (R) => typeof R.available === "function" && !/\bEdg\//.test(navigator.userAgent ?? "");
const codeOf = (lang) => String(lang).split("-")[0].toLowerCase();

// The tag the recognizer is given for a locale: the locale itself, except where the recognizers know the language by
// another code. Google and Microsoft list Tagalog as Filipino, fil-PH (devices tag its voices fil too: study/voice.js).
const RECOGNIZER_CODES = { tl: "fil" };
export function recognizerLang(lang) {
  const [code, ...region] = String(lang).split("-");
  const alias = RECOGNIZER_CODES[code.toLowerCase()];
  return alias ? [alias, ...region].join("-") : String(lang);
}

const standalone = () => globalThis.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * What the browser's recognizer can do for this language:
 *   { state: "local" }          on the device
 *   { state: "downloadable" }   on the device once the browser downloads the language (install())
 *   { state: "server" }         through the browser maker's servers
 *   { state: "unknown" }        there is a recognizer, but the browser won't say where it runs (Safari)
 *   { state: "none", why, unknownLanguage? }   unknownLanguage: Chrome's recognizer doesn't know the language
 */
export async function browserSupport(lang = "nl-NL") {
  const R = Recognition();
  if (!R) return { state: "none", why: "This browser has no speech recognizer." };
  if (isChrome(R) && !GOOGLE_KNOWS.has(codeOf(lang))) return { state: "none", why: `Chrome's recognizer doesn't know ${LANGUAGES[codeOf(lang)]?.name ?? lang}.`, unknownLanguage: true };
  if (typeof R.available === "function") {
    const langs = [recognizerLang(lang)];
    try {
      const local = await R.available({ langs, processLocally: true });
      if (local === "available") return { state: "local" };
      const remote = await R.available({ langs, processLocally: false });
      if (remote === "available") return local === "downloadable" ? { state: "downloadable" } : { state: "server" };
      if (local === "downloadable" || local === "downloading") return { state: "downloadable" };
      return { state: "none", why: "This browser's recognizer doesn't know this language." };
    } catch {
      return { state: "unknown" };
    }
  }
  return { state: "unknown" };
}

/** Whether this browser's recognizer listens to a track we give it (Chrome's, from the same release as available()). */
export const takesTrack = () => typeof Recognition()?.available === "function";

/** Downloads the language for on-device recognition, where the browser offers it (Chrome). true when done. */
export async function installLanguage(lang = "nl-NL") {
  const R = Recognition();
  if (typeof R?.install !== "function") return false;
  try {
    return await R.install({ langs: [recognizerLang(lang)], processLocally: true });
  } catch {
    return false;
  }
}

const ERRORS = {
  "not-allowed": "denied",
  "service-not-allowed": "unsupported",
  "audio-capture": "no-mic",
  network: "network",
  "no-speech": "no-speech",
  aborted: "aborted",
  "language-not-supported": "unsupported",
};

// A recognizer can go quiet for good and say nothing: no result, no error, no end. WebKit bug 321436 (2026) reports it on iPhones after
// a sound has played, and on later dictations with none, until the app is reopened; nothing it tried brings it back from the page. So
// nothing here waits on it for ever.
const QUIET_MS = 20_000; // nothing heard for this long
const STOPPED_MS = 3_000; // asked to stop, and it hasn't ended

/**
 * Listens once (to `track` when given). onState("listening" | "hearing" | "thinking"). Ends by itself when you stop
 * talking.
 * → { stop(), cancel(), done: Promise<{ heard, alternatives, local }> }
 */
export function browserListen({ lang = "nl-NL", onState, signal, local = false, track = null } = {}) {
  const R = Recognition();
  if (!R) throw new SpeechError("unsupported", "This browser has no speech recognizer.");
  const rec = new R();
  rec.lang = recognizerLang(lang);
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  if (local && "processLocally" in rec) rec.processLocally = true;

  const finals = []; // per result: its alternatives
  let latest = []; // the interim guess, in case the browser ends without a final one
  let settled = false;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  let quiet = null;
  const fail = (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(quiet);
    rejectDone(error);
  };
  // What it heard, once it has ended, or has stopped answering: the best guesses of what's final, or the last interim one.
  const finish = () => {
    if (settled) return;
    const results = finals.filter(Boolean);
    if (!results.length && !latest.length) return fail(new SpeechError("no-speech"));
    // Several results (a pause mid-sentence): join their best guesses; the alternatives of the first one too.
    const pieces = results.length ? results : [latest];
    const heard = pieces.map((alternatives) => alternatives[0]).join(" ");
    const alternatives = pieces.length === 1 ? pieces[0] : [heard];
    settled = true;
    clearTimeout(quiet);
    resolveDone({ heard, alternatives, local: rec.processLocally === true });
  };
  const wentQuiet = () => {
    if (settled) return;
    const heardSomething = finals.some(Boolean) || latest.length;
    if (heardSomething) finish();
    else fail(new SpeechError("deaf"));
    rec.abort();
  };
  const stillThere = (ms = QUIET_MS) => {
    clearTimeout(quiet);
    quiet = setTimeout(wentQuiet, ms);
  };

  rec.onaudiostart = () => onState?.("listening");
  rec.onspeechstart = () => (stillThere(), onState?.("hearing"));
  rec.onspeechend = () => onState?.("thinking");
  rec.onresult = (event) => {
    stillThere();
    latest = [];
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const alternatives = [...result].map((alt) => alt.transcript.trim()).filter(Boolean);
      if (result.isFinal) finals[i] = alternatives;
      else latest = alternatives;
    }
  };
  rec.onerror = (event) => {
    const code = ERRORS[event.error] ?? "failed";
    if (code === "unsupported" && event.error === "service-not-allowed" && isApple() && standalone()) {
      return fail(new SpeechError("unsupported", "The browser's recognizer wouldn't start in the app added to the home screen. Try Lexicommons in Safari, or see Settings, Study, Speaking."));
    }
    fail(new SpeechError(code));
  };
  rec.onend = finish;

  signal?.addEventListener("abort", () => {
    fail(new SpeechError("aborted"));
    rec.abort();
  }, { once: true });

  try {
    if (track) rec.start(track);
    else rec.start();
  } catch (error) {
    // A browser that doesn't take a track yet: let it open the microphone itself.
    if (track && error?.name === "TypeError") {
      try {
        rec.start();
      } catch (again) {
        fail(new SpeechError("failed", undefined, { cause: again }));
      }
    } else fail(new SpeechError("failed", undefined, { cause: error }));
  }
  if (!settled) stillThere();
  return {
    stop: () => {
      rec.stop();
      if (!settled) stillThere(STOPPED_MS);
    },
    cancel: () => {
      fail(new SpeechError("aborted"));
      rec.abort();
    },
    done,
  };
}
