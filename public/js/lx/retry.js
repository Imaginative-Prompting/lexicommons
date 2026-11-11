// When the server is overloaded, and when a connection comes back: what the app does so it doesn't add to a crowd (the launch's
// capacity, measured under load: D1 refuses a wave past its queue at once, and a refused wave tried again together is the same wave).
//
// The server answers a D1 overload (app.ts) as 503 with Retry-After: 1 and {"error": words, "code": "overloaded", "applied": false},
// "applied" there only when the overload came before the route ran (the session lookup), so nothing of the request landed. Another
// 503 (a gate not set up, an OAuth endpoint's) isn't that answer and isn't tried again.
//
// fetchRetrying tries a request again only on that answer: a read (GET, HEAD), a write its caller says is idempotent (a whole state
// replaced: PUT /api/packs/device, a look's image put by its hash), and any other write only when the server says it wasn't applied.
// At most RETRIES more tries, each after the Retry-After plus a random part of WINDOWS[try] ("full jitter": apps refused together
// come back spread out, not together). Never while offline, never for a Retry-After past MAX_RETRY_AFTER seconds, never a body that
// can't be sent twice. Out of tries, the last answer comes back, so a caller meets a refusal as it always has.
//
// jittered(ms) is a poll's wait, 10% either side at random (POLL_SPREAD): apps started in the same burst (a launch, a network back) would
// otherwise poll in lockstep for as long as they're open.
//
// onReconnect(fn) is for what the app does in the background when the connection comes back (the polls, a sync): every app on a
// network that blinked comes back at once, so fn runs a random 0–RECONNECT_SPREAD ms later, once per return, and not at all if the
// connection goes again first. What a person is looking at (a page saying it's offline) still comes back at once.

export const RETRIES = 3;
export const WINDOWS = [500, 1000, 2000];
export const MAX_RETRY_AFTER = 5;
export const RECONNECT_SPREAD = 30_000;
export const POLL_SPREAD = 0.1;
const READS = new Set(["GET", "HEAD"]);

/** fetch(input, init), tried again on the server's overload as above. idempotent: a write that does the same done twice. */
export async function fetchRetrying(input, init = {}, { idempotent = false } = {}) {
  const method = String(init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const safe = idempotent || READS.has(method);
  const resendable = !(input instanceof Request && input.body) && !(init.body instanceof ReadableStream);
  for (let tried = 0; ; tried++) {
    const response = await fetch(input, init);
    const wait = tried < RETRIES && resendable ? await overloadWait(response, safe) : null;
    if (wait === null) return response;
    response.body?.cancel().catch(() => {});
    await sleep(wait + Math.random() * WINDOWS[tried], init.signal);
  }
}

/** How long the server asks to wait (ms) before this request is tried again, or null: not the overload's answer, or not to be tried again. */
async function overloadWait(response, safe) {
  if (response.status !== 503) return null;
  const header = response.headers.get("Retry-After")?.trim();
  if (!header || !/^\d{1,4}$/.test(header) || Number(header) > MAX_RETRY_AFTER) return null;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  const said = await response.clone().json().catch(() => null);
  if (said?.code !== "overloaded") return null;
  if (!safe && said.applied !== false) return null;
  return Number(header) * 1000;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const stopped = () => signal.reason ?? new DOMException("The request was stopped.", "AbortError");
    if (signal?.aborted) return reject(stopped());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(stopped());
      },
      { once: true },
    );
  });
}

/** A poll's wait, POLL_SPREAD either side at random. */
export const jittered = (ms) => ms * (1 - POLL_SPREAD + Math.random() * 2 * POLL_SPREAD);

const reconnecting = new Set();
let returnTimer = null;

/** Runs fn a random 0–RECONNECT_SPREAD ms after the connection comes back (one wait a return for every fn). Returns a stop. */
export function onReconnect(fn) {
  if (typeof addEventListener !== "function") return () => {};
  if (!reconnecting.size) {
    addEventListener("online", backOnline);
    addEventListener("offline", wentOffline);
  }
  reconnecting.add(fn);
  return () => reconnecting.delete(fn);
}

function backOnline() {
  if (returnTimer !== null) return;
  returnTimer = setTimeout(() => {
    returnTimer = null;
    for (const fn of [...reconnecting]) {
      try {
        fn();
      } catch (error) {
        // One that fails doesn't keep the others from running; it's still an error the page reports.
        setTimeout(() => {
          throw error;
        });
      }
    }
  }, Math.random() * RECONNECT_SPREAD);
}

function wentOffline() {
  clearTimeout(returnTimer);
  returnTimer = null;
}
