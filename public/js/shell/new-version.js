// A new version of the app, with nothing on screen about it: no toast, banner or prompt, anywhere (11 Nov 2026; until then a toast
// offered Reload and Later).
// - A fresh open is the new version already: sw.js fetches pages and files from the network first, its copy only offline. So a new tab, a
//   cold start of the Home Screen app, or the app opened again after being closed runs the newest.
// - A page left open (the Home Screen app comes back from memory without loading anything) asks the worker to look for a new version as it
//   goes out of view and as it comes back (registration.update(), at most once a minute; going out gives a phone a few seconds to fetch it
//   before it's suspended). sw.js installs a new one at once and takes every page. The page goes on as it was, nothing on it changing; only
//   Settings → About says so: "A new version is ready", with Reload.
// - The one reload the app does by itself: coming back into view after AWAY or more out of it with a new version already ready, at that
//   moment, and only when nothing would be lost (reloadBlocked): no session or practice in progress,
//   nothing typed and not sent, no download the person started under way (lx/reload-holds.js), and the network answering, so it never
//   lands on the offline copy. The reader's place is kept to the word (it's saved as the page goes out of view; reader.js savePosition).
//   It's the moment a phone would often have started the app again anyway, and it keeps the page and its history (location.reload: the
//   router carries on from history.state.lx.i; shell/route.js). A page in view is never reloaded, however long it's been open, and a
//   version found after it's back waits for the next time it comes back after AWAY away, or the next fresh open. The time away is the
//   wall clock's (Date.now), which goes on while a phone has the app suspended.
// - A reload of the app's own marks itself first (lx/error-report.js markOwnReload), so the start after isn't told as one that came by itself.
import { markOwnReload } from "../lx/error-report.js";
import { reloadHolds } from "../lx/reload-holds.js";

const CHECK_EVERY = 60_000;
/** Out of view at least this long, and the app may reload as it comes back. */
export const AWAY = 30 * 60_000;

/** Whether something's in progress that a reload would cut short: a session, or a practice open past its list. */
export const busyRoute = (hash) => /^#study\/session/.test(hash) || /^#(study\/)?practice\/./.test(hash);

/** The version this page runs: what its own script was asked for (main.js?v=), or null for a copy without one. */
export function runningVersion() {
  const main = document.querySelector('script[src*="/js/shell/main.js"]');
  return (main && new URL(main.src).searchParams.get("v")) || null;
}

let ready = false;
const listeners = new Set();

/** Whether a newer version than this page's is ready (the worker has it): Settings → About's row. */
export const newVersionReady = () => ready;

/** Told once when a new version is ready; returns the unsubscribe. */
export function onNewVersionReady(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reload into the new version (Settings → About's Reload): this page, its place and history kept. */
export function reloadIntoNewVersion() {
  markOwnReload();
  location.reload();
}

// Something typed and not sent: a field in view with words in it (Translate's box, a request's form, Report a bug, a file picked).
const FIELDS = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="color"]), textarea, [contenteditable=""], [contenteditable="true"]';
function typedUnsent() {
  for (const field of document.querySelectorAll(FIELDS)) {
    if (field.closest("[data-ghost]") || field.disabled || field.readOnly || !field.getClientRects().length) continue;
    const words = field.isContentEditable ? field.textContent : field.value;
    if (String(words ?? "").trim()) return true;
  }
  return false;
}

/** What would be lost to a reload now, or null when nothing would (the network is asked separately). */
export function reloadBlocked() {
  if (busyRoute(location.hash)) return "in progress";
  const holds = reloadHolds();
  if (holds.length) return `downloading (${holds.join(", ")})`;
  if (typedUnsent()) return "typed";
  if (navigator.onLine === false) return "offline";
  return null;
}

// Whether the network answers, past the worker: the API is never the worker's (sw.js NEVER_CACHE), so offline this fails.
async function networkAnswers() {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 4000);
  try {
    await fetch("/api/me", { cache: "no-store", credentials: "same-origin", signal: stop.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// A worker's version, asked (sw.js answers { version } on a port), or null when it doesn't say in time.
function versionOf(worker) {
  return new Promise((resolve) => {
    if (!worker) return resolve(null);
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(typeof event.data?.version === "string" ? event.data.version : null);
    };
    try {
      worker.postMessage({ ask: "version" }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Starts watching for a new version, given the worker's registration (or its promise). */
export function watchForUpdates(registration) {
  const workers = navigator.serviceWorker;
  if (!workers) return;
  // A page with no worker yet is a first open: the worker taking it then is no new version, but every one after is.
  let hadWorker = Boolean(workers.controller);
  let checked = 0;
  // When the page went out of view (Date.now); a press since it came back (while the network is asked, a press keeps the page).
  let hiddenAt = null;
  let pressed = false;

  const look = () => {
    if (Date.now() - checked < CHECK_EVERY) return;
    checked = Date.now();
    Promise.resolve(registration)
      .then((reg) => reg?.update())
      .catch(() => {});
  };

  let reloading = false;
  // Back after AWAY away with a new version ready: reloaded into it, unless something would be lost.
  const backAfterAway = async () => {
    if (reloading || !ready || reloadBlocked()) return;
    reloading = true;
    const answers = await networkAnswers();
    // Asked again after the network's answer: a press, a field typed in or a session started meanwhile keeps the page.
    if (answers && !pressed && document.visibilityState === "visible" && !reloadBlocked()) reloadIntoNewVersion();
    else reloading = false;
  };

  for (const kind of ["pointerdown", "keydown"]) addEventListener(kind, () => (pressed = true), { capture: true, passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      checked = 0;
      look();
      return;
    }
    const away = hiddenAt == null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    pressed = false;
    look();
    if (away >= AWAY) backAfterAway();
  });
  addEventListener("pageshow", (event) => event.persisted && look());

  workers.addEventListener("controllerchange", async () => {
    if (!hadWorker) {
      hadWorker = true;
      return;
    }
    // The worker that took the page may be the very version it loaded (its files came from the network just before): nothing newer then.
    const own = runningVersion();
    const theirs = await versionOf(workers.controller);
    if (own && theirs && theirs.replace(/^shell-/, "") === own) return;
    if (ready) return;
    ready = true;
    document.documentElement.setAttribute("data-new-version", "ready");
    for (const listener of listeners) listener();
  });
}
