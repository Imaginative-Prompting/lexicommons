// The app's own API (cookie session). A 401 means signed out: go to sign-in and come back here after.

import { turnSampleOff } from "../study/sample-mode.js";
import { fetchRetrying } from "../lx/retry.js";

export class SignedOut extends Error {}

// options.stream: a stream's answer (ai/hosted.js): the Response itself once it's ok, for the caller to read; refused, it throws
// as any call does. A refusal's error carries the server's code (error.code) and everything it said (error.data). The server's
// overload is tried again (lx/retry.js): a read always, a write only when the server says it wasn't applied, or with
// options.idempotent (a write that does the same done twice).
export async function api(path, { stream = false, idempotent = false, ...options } = {}) {
  let response;
  try {
    response = await fetchRetrying(path, { credentials: "same-origin", ...options }, { idempotent });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    // A browser's own words for this differ and say nothing ("Failed to fetch", "Load failed"). The screen shows this one. Still a
    // TypeError, as fetch's is: a caller with better words for it tells it apart that way (ai/ask.js).
    throw new TypeError(navigator.onLine === false ? "You're offline. Try again once you're back." : "Lexicommons couldn't be reached. Try again in a moment.");
  }
  if (response.status === 401) {
    forgetMe();
    location.assign(`/login?next=${encodeURIComponent(location.pathname + location.hash)}`);
    throw new SignedOut("signed out");
  }
  if (stream && response.ok) return response;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(wordsFor(response.status, data.error));
    error.code = typeof data.code === "string" ? data.code : typeof data.error === "string" ? data.error : undefined;
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

// What the server says when something didn't go is words, except a few codes; a person never reads a code (internal_error) on a
// screen. A code that isn't here, or a failure with nothing said, gets plain words by its kind.
const CODE_WORDS = {
  rate_limited: "That's a lot at once. Try again in a minute.",
  site_locked: "Lexicommons is closed for a moment. Try again soon.",
};
function wordsFor(status, said) {
  if (typeof said === "string" && said && !/^[a-z]+(_[a-z]+)+$/.test(said)) return said;
  if (typeof said === "string" && CODE_WORDS[said]) return CODE_WORDS[said];
  return status >= 500 ? "Lexicommons had a problem on its side. Try again in a moment." : "Something went wrong. Try again in a moment.";
}

const json = (method) => (path, body) =>
  api(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const post = json("POST");
export const del = json("DELETE");

// Who you are (/api/me), its last answer kept on this device, so the app starts without the network: when the network
// (or the server) fails, the app starts from the last answer and everything on the device works. Signed out (a 401,
// from any call) still goes to sign-in and forgets it, and so does Sign out; deleting the account clears every lx.* key.
// What the screens show, never what you may do: the server decides that on every request.
const ME = "lx.me.v1";

export async function whoAmI() {
  try {
    const me = await api("/api/me");
    try {
      localStorage.setItem(ME, JSON.stringify({ at: Date.now(), me }));
    } catch {
      // Private browsing: this visit only.
    }
    return me;
  } catch (error) {
    if (error instanceof SignedOut) throw error;
    const kept = keptMe();
    if (kept) return kept;
    throw error;
  }
}

/** The last answer kept on this device, or null. */
export function keptMe() {
  try {
    const kept = JSON.parse(localStorage.getItem(ME) ?? "null");
    return kept?.me?.user && typeof kept.me.user.id === "string" ? kept.me : null;
  } catch {
    return null;
  }
}

export function forgetMe() {
  try {
    localStorage.removeItem(ME);
  } catch {
    // Nothing kept.
  }
  // Signed out, the sample learner goes too: the next start is the next person's own (study/sample-mode.js).
  turnSampleOff();
}
