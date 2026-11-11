// What a session's first step reads of the study material (plan.js warmGames: each sentence's words, the next new words' sentences),
// worked out while the page is idle, and again after each change to the study material or the words' order: a game's or a session's
// first tap then finds it ready. Idle callbacks, a few ms each, rather than know/slices.js's queue: it's work ahead of need, so it never
// stands ahead of a pack's check or a page's own work. (WebKit has no requestIdleCallback: a piece every 25 ms there.)

import { warmGames } from "./plan.js";
import { onContentChange } from "./content.js";
import { onFrequency } from "./frequency.js";

// The most a piece works, in ms (less when the browser says the idle time left is less).
const PIECE_MS = 4;
const idle = (fn) => (globalThis.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 25));
let run = 0;

function start() {
  const mine = ++run;
  const steps = warmGames();
  const piece = (deadline) => {
    if (mine !== run) return;
    const left = deadline?.didTimeout === false ? deadline.timeRemaining() : PIECE_MS;
    const until = performance.now() + Math.max(1, Math.min(PIECE_MS, left));
    // A failure here is the plan's own, and the plan meets it again when it's asked for: nothing more is worked out ahead.
    try {
      do {
        if (steps.next().done) return;
      } while (performance.now() < until);
    } catch {
      return;
    }
    idle(piece);
  };
  idle(piece);
}

let started = false;
/** Keeps what a session's first step reads worked out ahead, from now on (the shell calls it once the app is ready). */
export function warmWhileIdle() {
  if (started) return;
  started = true;
  start();
  onContentChange(start);
  onFrequency(start);
}
