// What breaks in the app reaches us: every uncaught error and unhandled rejection, and a start after the page itself ended (the end
// of this file), cleaned on the device before it leaves
// (lx/error-clean.js: no typed text, no addresses, only our own code's frames), sent to this site's own /api/errors and nowhere
// else. At most ERROR_LIMITS.perPage a page load, the same error once. It never throws, never waits, never retries: a report
// that can't be sent (offline) is dropped. Imported first by shell/main.js, so it's listening before anything else runs.

import { cleanReport, ERROR_LIMITS, groupKey, RELOAD, startedAgainByItself } from "./error-clean.js";
import { crashedLastTime } from "../speech/probe-guard.js";
import { demoPage, sampleOn } from "../study/sample-mode.js";

const sent = new Set();
// Noise that says nothing about our code: the browser's ResizeObserver note, and a fetch the page itself called off.
const IGNORED = /^ResizeObserver loop/;

function version() {
  try {
    const main = document.querySelector('script[type="module"][src*="/js/shell/main.js"]');
    return main ? new URL(main.src, location.href).searchParams.get("v") ?? "" : "";
  } catch {
    return "";
  }
}

function send(kind, error, message, file, line, col) {
  try {
    // Nothing goes out while the sample learner is on (study/sample-mode.js); the try-out's errors do (/api/errors takes a signed-out page's,
    // checked and capped as ever), so a stranger's crash on /try/ reaches us too.
    if (sent.size >= ERROR_LIMITS.perPage || (sampleOn() && !demoPage())) return;
    const isError = error instanceof Error;
    if (isError && error.name === "AbortError") return;
    const raw = isError ? error.message : message ?? (error === undefined ? "" : String(error));
    if (IGNORED.test(raw ?? "")) return;
    const report = cleanReport({
      kind,
      name: isError ? error.name : "Error",
      message: raw,
      stack: isError ? error.stack : "",
      file,
      line,
      col,
      place: `${location.pathname}${location.hash}`,
      version: version(),
    });
    if (!report) return;
    const key = groupKey({ source: "client", ...report });
    if (sent.has(key)) return;
    sent.add(key);
    const body = JSON.stringify(report);
    if (body.length > ERROR_LIMITS.body) return;
    fetch("/api/errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, cache: "no-store" }).catch(() => {});
  } catch {
    // A report must never be the next error.
  }
}

/** Reports an error the app caught itself, as an uncaught one goes (cleaned the same; once a page per kind of message). */
export function reportCaught(error) {
  send("error", error, undefined);
}

addEventListener("error", (event) => {
  // Only the page's own errors: a picture or a script that failed to load fires here too, with no message, on capture only.
  if (event instanceof ErrorEvent) send("error", event.error, event.message, event.filename, event.lineno, event.colno);
});
addEventListener("unhandledrejection", (event) => send("rejection", event.reason, undefined));

// The app started again by itself (error-clean.js startedAgainByItself): an iPhone ends a page that runs out of memory and loads it
// again, and nothing the page runs sees that end, so this start says it, with the screen it was on and the app's version only. The
// page's last state on screen is kept for this tab (sessionStorage, which a reload keeps), and the app's own Reload marks itself
// first (markOwnReload, from shell/new-version.js).
const OWN_RELOAD = "lx.reload.own";
const LAST_SEEN = "lx.page.seen";

/** Called just before the app reloads the page itself, so the next start isn't told as one that came by itself. */
export function markOwnReload() {
  try {
    sessionStorage.setItem(OWN_RELOAD, "1");
  } catch {
    // No storage: the start after counts as the person's own, as a browser tab's always does.
  }
}

try {
  let own = false;
  let lastSeen = null;
  try {
    own = sessionStorage.getItem(OWN_RELOAD) !== null;
    sessionStorage.removeItem(OWN_RELOAD);
    lastSeen = sessionStorage.getItem(LAST_SEEN);
  } catch {
    // Storage refused: what can't be read stays unknown.
  }
  const seen = () => {
    try {
      sessionStorage.setItem(LAST_SEEN, document.visibilityState === "hidden" ? "hidden" : "visible");
    } catch {}
  };
  seen();
  document.addEventListener("visibilitychange", seen);
  const type = performance.getEntriesByType?.("navigation")?.[0]?.type ?? "";
  const installed = matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;
  const touch = matchMedia("(pointer: coarse)").matches;
  if (startedAgainByItself({ type, installed, touch, own, lastSeen })) send("reload", undefined, RELOAD.message);
} catch {
  // A report must never be the next error.
}

// A native probe that ended the page last time (speech/probe-guard.js: its mark still there at this start): told once, by name, and never run
// on this device again.
try {
  for (const probe of crashedLastTime()) send("probe-crash", undefined, probe);
} catch {
  // A report must never be the next error.
}
