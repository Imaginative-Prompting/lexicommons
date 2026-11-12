// The device's own native probes, guarded: asking the GPU for an adapter (WebGPU, which says which Whisper model suits) and asking the browser's
// recognizer whether it has a language on the device (SpeechRecognition.available). Either can take a whole page down on some phone's
// browser, with nothing the page runs ever seeing it: on 12 Nov 2026 Samsung Internet 30 on Android started the app again by itself on Study
// twice in five seconds, and Study is where these are first asked. So each is marked in localStorage while it runs, the mark cleared when it
// answers or throws, or when the page is closed the ordinary way or hidden (below). A mark still there at the next start means that probe ended the
// page: it's kept as one this device never runs again (the answer taken as unknown), and the start says so once (lx/error-report.js, a report
// of the "probe-crash" kind naming the probe; error-clean.js).

export const PROBES = Object.freeze(["webgpu-adapter", "speech-available"]);
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

/**
 * Runs a native probe under its mark. Resolves to what run() resolves to; throws what it throws. A probe that crashed here before isn't run:
 * resolves to `otherwise`.
 */
export async function guarded(name, run, otherwise = null) {
  if (!PROBES.includes(name)) throw new Error(`No probe named ${name}`);
  if (probeCrashed(name)) return otherwise;
  running.add(name);
  write(RUNNING(name), String(Date.now()));
  try {
    return await run();
  } finally {
    running.delete(name);
    write(RUNNING(name), null);
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
