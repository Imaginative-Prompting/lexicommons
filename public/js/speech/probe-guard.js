// The device's own native probes, guarded: asking the GPU for an adapter (WebGPU, which says which Whisper model suits) and asking the browser's
// recognizer whether it has a language on the device (SpeechRecognition.available). Either can take a whole page down on some phone's
// browser, with nothing the page runs ever seeing it: on 12 Nov 2026 Samsung Internet 30 on Android started the app again by itself on Study
// twice in five seconds, and Study is where these are first asked. So each is marked in localStorage while it runs, the mark cleared when it
// answers or throws, or when the page is closed the ordinary way or hidden (below). A mark still there at the next start means that probe ended the
// page: it's kept as one this device never runs again (the answer taken as unknown), and the start says so once (lx/error-report.js, a report
// of the "probe-crash" kind naming the probe; error-clean.js).

// Samsung Internet (12 Nov 2026, v730): a page ended at once with BOTH probes in flight (the Speaking page asked them together), two
// probe-crash reports 116 ms apart; the guard stops a phone asking again, but every new Samsung phone would crash once first. So on Samsung
// Internet neither is ever asked (probesOff): its recognizer is used by its presence, and Whisper runs on the processor. No other browser
// has a probe-crash report (error reports, 30 days, 12 Nov), so it's Samsung's alone until one does. And anywhere, never two at once: each
// probe waits for the one before it to answer (guarded's queue).
export const PROBES = Object.freeze(["webgpu-adapter", "speech-available"]);
/** Whether this browser is one the native probes are never asked on (Samsung Internet, by its user agent). */
export const probesOff = () => /\bSamsungBrowser\//.test(globalThis.navigator?.userAgent ?? "");
const RUNNING = (name) => `lx.probe.running.${name}`;
const CRASHED = "lx.probe.crashed.v1";

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // No storage (private browsing): the probe runs unguarded, as before.
  }
};
const crashedSet = () => {
  try {
    const list = JSON.parse(read(CRASHED) ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((name) => PROBES.includes(name)) : []);
  } catch {
    return new Set();
  }
};

/** Whether this probe ended the page on this device once: it's never run here again. */
export const probeCrashed = (name) => crashedSet().has(name);

// The marks of the probes running now, cleared when the page is closed the ordinary way or hidden, and set again if it comes back with one
// still running: only a page that ended by itself on screen leaves one. (A phone's app swiped away from the app switcher is hidden first, and
// may end with no pagehide: that mustn't count, or that probe would be switched off on the device for nothing.)
const running = new Set();
const unmark = () => {
  for (const name of running) write(RUNNING(name), null);
};
if (typeof addEventListener === "function") addEventListener("pagehide", unmark);
globalThis.document?.addEventListener?.("visibilitychange", () => {
  if (document.visibilityState === "hidden") return unmark();
  for (const name of running) write(RUNNING(name), String(Date.now()));
});

// The probe asked last, until it has answered (null: none in flight): the next waits for it, up to TURN_WAIT. One still unanswered by then
// is still in flight, so the next isn't asked beside it: it resolves to its `otherwise` (not known), and the one after waits for the
// unanswered one again. With none in flight, a probe starts at once.
let last = null;
export const TURN_WAIT = 5000;

/**
 * Runs a native probe under its mark, after any asked before it has answered. Resolves to what run() resolves to; throws what it throws. A
 * probe that crashed here before, or any on a browser they're off on (probesOff), isn't run: resolves to `otherwise`.
 */
export async function guarded(name, run, otherwise = null) {
  if (!PROBES.includes(name)) throw new Error(`No probe named ${name}`);
  if (probesOff() || probeCrashed(name)) return otherwise;
  // Its turn, claimed before anything waits (two asked in the same moment take turns): after every probe asked before it has answered.
  const before = last;
  let done;
  const mine = new Promise((resolve) => (done = resolve));
  last = mine;
  mine.then(() => last === mine && (last = null));
  if (before) {
    let waited;
    const turn = await Promise.race([before.then(() => true), new Promise((resolve) => (waited = setTimeout(resolve, TURN_WAIT, false)))]);
    clearTimeout(waited);
    if (!turn) {
      // Not asked; its place in line passes on once the one in flight answers.
      before.then(done);
      return otherwise;
    }
  }
  try {
    if (probeCrashed(name)) return otherwise;
    running.add(name);
    write(RUNNING(name), String(Date.now()));
    try {
      return await run();
    } finally {
      running.delete(name);
      write(RUNNING(name), null);
    }
  } finally {
    done();
  }
}

/**
 * At a start: the probes that were still running when the page last ended, each kept from now on as one that crashed here, their marks
 * cleared. Each is told once: a mark is gone once read.
 */
export function crashedLastTime() {
  const found = PROBES.filter((name) => read(RUNNING(name)) !== null);
  if (!found.length) return [];
  const all = crashedSet();
  for (const name of found) {
    all.add(name);
    write(RUNNING(name), null);
  }
  write(CRASHED, JSON.stringify([...all]));
  return found;
}
