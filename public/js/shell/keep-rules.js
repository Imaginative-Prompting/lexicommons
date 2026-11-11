// Where your progress is kept: which browsers are about to leave it behind, and what to say there (shell/keep-here.js draws it). Pure, so
// Node's tests read it (scripts/test-install.mjs).
//
// EVERY LINE HERE IS TRUE ONLY WHILE PROGRESS LIVES IN THE BROWSER ALONE. The day an account keeps its own copy of your progress on the server
// (a route under /api/account/sync, so signing in anywhere brings it back), they're false: set KEPT_WITH_ACCOUNT in that same landing and
// take keep-here.js's notes out. scripts/test-install.mjs fails while that route exists and this still says anything.
export const KEPT_WITH_ACCOUNT = false;

/**
 * Which of the three this device and browser is, or null: device is install-guide.js detect()'s { id, installed, mobile }.
 * fresh: nothing has been studied here.
 */
export function keepKind(device, { fresh = true } = {}) {
  if (!device || KEPT_WITH_ACCOUNT) return null;
  if (device.id === "in-app") return "in-app";
  const ios = typeof device.id === "string" && device.id.startsWith("ios-");
  if (!ios) return null;
  if (device.installed) return fresh ? "ios-app" : null;
  return "ios-browser";
}

/** Each one's words: { text, copy? (an address to copy), how? (a link to the steps) }. */
export function keepWords(kind, { address = "lexicommons.com" } = {}) {
  if (kind === "in-app") return { text: `You're in another app's browser. What you do here stays inside that app: to keep your progress, open ${address} in Safari or your phone's own browser and start there.`, copy: address };
  if (kind === "ios-browser") return { text: "Add Lexicommons to your Home Screen before you go on: tap Share, then Add to Home Screen, and start there. The Home Screen app keeps its own progress, so a lesson done here stays in this browser.", how: "#settings/install?from=today" };
  if (kind === "ios-app") return { text: "Did a lesson in Safari? It's still there, in Safari. This app keeps its own progress, so it starts fresh here." };
  return null;
}
