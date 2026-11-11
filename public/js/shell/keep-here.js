// Where your progress is kept, said once where it can be lost. Progress lives in this browser's own storage; three places give a learner a
// storage they're about to leave without knowing it:
//   - a browser on an iPhone or iPad that isn't the Home Screen app: the Home Screen app keeps its own progress, so a lesson done in the
//     browser stays in the browser ("ios-browser");
//   - another app's own browser (a link opened inside it): it keeps nothing once you leave it ("in-app");
//   - the Home Screen app on an iPhone or iPad, opened with nothing in it: a lesson done in the browser is still there, not here ("ios-app").
// Said in the first run (before lesson 1) and on the first finished session's summary, once each, never again. The rules are pure
// (keep-rules.js keepKind, keepWords); which device this is comes from install-guide.js through settings-install.js.

import { el } from "../lx/ui.js";
import * as ui from "../lx/ui.js";
import { thisDevice } from "./settings-install.js";
import { keepKind, keepWords } from "./keep-rules.js";

const SAID = "lx.keep-note.v1";

/** The note for this device as a node, or null: its words, and its one control (Copy the address, or How). where: "welcome" (no link out: the first run is over the app) or "summary". */
export function keepNote({ fresh = true, where = "welcome" } = {}) {
  const kind = keepKind(thisDevice(), { fresh });
  // The Home Screen app's own line belongs to its first run only; a summary there has nothing to warn about.
  if (!kind || (where === "summary" && kind === "ios-app")) return null;
  const words = keepWords(kind, { address: location.host });
  const control = words.copy ? ui.copyButton(() => `https://${words.copy}`, { label: "Copy the address" }) : words.how && where === "summary" ? el("a", { class: "lx-keep-how", href: words.how }, "Show me how") : null;
  return el("div", { "data-keep-note": kind, class: "lx-keep-note" }, el("p", { class: "lx-small lx-muted" }, words.text), ...(control ? [control] : []));
}

/** The summary's note, the first time only (kept on this device once shown), or null. */
export function keepNoteOnce() {
  try {
    if (localStorage.getItem(SAID)) return null;
  } catch {
    return null;
  }
  const note = keepNote({ fresh: false, where: "summary" });
  if (!note) return null;
  try {
    localStorage.setItem(SAID, String(Date.now()));
  } catch {}
  return note;
}

/**
 * Asks the browser to keep this site's storage (it's "best effort" until asked: a browser short of room may clear it). After a first
 * finished session, when there's something to keep; a browser that asks the person shows its own prompt, most just say yes or no.
 */
export function keepStorage() {
  try {
    globalThis.navigator?.storage?.persist?.().catch(() => {});
  } catch {}
}
