// What stops Whisper taking the app down twice. Whisper needs about 1.1 GB on the GPU (docs/speech.md), and a phone can kill the
// whole page for that with no error anyone can catch. So a mark goes down before Whisper starts and comes up when it's let go; if
// the app opens and the mark is still there, the page died with Whisper in memory. From then on nothing starts Whisper on this
// device by itself (study/speaking.js), Settings says so, and only a press there tries it again.
//
// The mark says only "on the screen, with Whisper in memory". Leaving the screen lifts it, so a page the system closes in the
// background isn't called a crash, and a reload or a closed page isn't either. A second tab holds a lock while it has Whisper, so its
// mark isn't mistaken for a dead page's. Kept in this device's localStorage, never synced.

const RUNNING = "lx.whisper.running.v1";
const STOPPED = "lx.whisper.stopped.v1";
const LOCK = "lx-whisper-running";
const WAIT_FOR_LOCK = 1500; // ms: a dead page's lock goes as soon as the browser notices, which can be just after a reopen

/** A phone or a tablet: far less memory for Whisper than a computer has, and Safari doesn't say how much. */
export const onPhone = () => {
  const nav = globalThis.navigator;
  return /iPhone|iPad|iPod|Android/i.test(nav?.userAgent ?? "") || (nav?.platform === "MacIntel" && nav?.maxTouchPoints > 1);
};

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // Private browsing, or no room: the guard can't work here, and nothing else depends on it.
  }
};
const onScreen = () => globalThis.document?.visibilityState !== "hidden";

let holding = null; // this page's Whisper: { model, device, stage, at }
let letLockGo = null;
const hold = () => write(RUNNING, holding && onScreen() ? holding : null);

/** Whether another tab really has Whisper in memory: it holds the lock. With no locks here, a mark is taken as a dead page's. */
async function otherTabHolds() {
  if (!globalThis.navigator?.locks) return false;
  try {
    return await navigator.locks.request(LOCK, { signal: AbortSignal.timeout(WAIT_FOR_LOCK) }, () => false);
  } catch {
    return true; // It waited, and the lock is still held.
  }
}

// Read as this module loads, as the app opens: before this page can have put down a mark of its own.
const found = read(RUNNING);
/** Settled once a mark left from before has been looked at. Anything about to start Whisper waits for it. */
export const guardReady = found
  ? otherTabHolds().then((other) => {
      if (other) return;
      write(STOPPED, found);
      write(RUNNING, null);
    })
  : Promise.resolve();

globalThis.document?.addEventListener("visibilitychange", hold);
globalThis.addEventListener?.("pagehide", () => write(RUNNING, null));
globalThis.addEventListener?.("pageshow", hold);

/** Whisper is in memory, or on its way: stage says what it's doing (loading, held, thinking). Call before it starts. */
export function whisperHolds(stage, about) {
  holding = { ...holding, ...about, stage, at: Date.now() };
  hold();
  if (!letLockGo && globalThis.navigator?.locks) {
    navigator.locks.request(LOCK, { mode: "shared" }, () => new Promise((resolve) => (letLockGo = resolve))).catch(() => {});
  }
}

/** Whisper has been let go: its memory is back. */
export function whisperLetGo() {
  holding = null;
  hold();
  letLockGo?.();
  letLockGo = null;
}

/** When the app died with Whisper in memory on this device, and it hasn't been tried again: { model, device, stage, at }, else null. */
export const whisperStopped = () => read(STOPPED);

/** Whisper may start again: only ever from a press that says so (Settings → Study → Speaking). */
export const tryWhisperAgain = () => write(STOPPED, null);
