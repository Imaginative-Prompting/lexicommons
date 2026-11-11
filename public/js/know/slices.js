// Work done a little at a time, so it never holds up a frame: the Knowledge page's cards are worked out this way while the pile moves
// (know/page.js, know/cards.js). The work is a generator that yields between pieces. One queue runs them, first come first served, a few ms
// a task with the browser free between tasks to draw its frames (not in idle callbacks: while the pile moves a phone is rarely idle, and
// they'd come once every 200 ms). The same generator run to its end at once gives the same answer (whole).

/** The most a task works, in ms: with the frame's own work it stays inside a frame on a slowed phone. */
export const SLICE_MS = 6;

/** fn when the page is next idle (or soon after: a page that's never idle). For what can wait: keeping things, not working them out. */
export const later = (fn) => (globalThis.requestIdleCallback ? requestIdleCallback(() => fn(), { timeout: 500 }) : setTimeout(fn, 50));

const jobs = [];
let running = false;
// Node (the tests) has setImmediate, a task of its own after what's waiting, as a browser's message is: its own ports take a message posted
// while they're delivering in the same go, so nothing else would run between the slices. A browser has no setImmediate.
const node = typeof setImmediate === "function";
// Where the browser has it (Chrome), each slice is a background task: what the page does for the person (a key, a tap, a worker's answer,
// a frame) goes first. WebKit has no postTask (Safari 26.6, 7 Nov 2026): there it's a message, as before, and holdSlices does the rest.
const background = !node && typeof globalThis.scheduler?.postTask === "function";
const channel = !node && !background && typeof MessageChannel === "function" ? new MessageChannel() : null;
const post = () => (node ? setImmediate(run) : background ? globalThis.scheduler.postTask(run, { priority: "background" }).catch(() => {}) : channel ? channel.port2.postMessage(0) : setTimeout(run, 0));
if (channel) channel.port1.onmessage = () => run();

// Work the person is waiting for holds the slices (Translate: a key, until its answer is drawn; on a phone slowed 4× it waited behind
// content's slices back to back, 331 ms of a 375 ms key, 7 Nov 2026): no slice starts while a hold is on, and each hold lets go by itself
// after HOLD_MOST at the latest, so what's held is late by that much at most. A slice already going finishes its step.
export const HOLD_MOST = 300;
let holds = 0;
let waiting = false; // a slice was due while held
/** Holds the slices until the function it returns is called, or ms (at most HOLD_MOST) pass. */
export function holdSlices(ms = HOLD_MOST) {
  holds++;
  let on = true;
  const release = () => {
    if (!on) return;
    on = false;
    clearTimeout(timer);
    holds--;
    if (!holds && waiting) {
      waiting = false;
      post();
    }
  };
  const timer = setTimeout(release, Math.min(ms, HOLD_MOST));
  return release;
}

function run() {
  if (holds) {
    waiting = true;
    return;
  }
  const until = performance.now() + SLICE_MS;
  while (jobs.length) {
    const job = jobs[0];
    if (!job.alive()) {
      jobs.shift();
      job.resolve(undefined);
      continue;
    }
    let step;
    try {
      step = job.steps.next();
    } catch (error) {
      jobs.shift();
      job.reject(error);
      continue;
    }
    // A job done ends the task, and what waits on it goes on in a task of its own: resolved here, it ran in this one (a pack's check, then
    // its hash, held a slowed phone's page for 74 ms, 7 Nov 2026).
    if (step.done) {
      jobs.shift();
      const { value } = step;
      setTimeout(() => job.resolve(value), 0);
      break;
    }
    if (performance.now() >= until || holds) break;
  }
  if (jobs.length) post();
  else running = false;
}

/**
 * Runs steps (a generator) a piece at a time, after the work queued before it. Resolves to what it returns; to undefined if alive() turns
 * false first (the page went), when it stops where it is.
 */
export function inSlices(steps, { alive = () => true } = {}) {
  return new Promise((resolve, reject) => {
    jobs.push({ steps, alive, resolve, reject });
    if (running) return;
    running = true;
    post();
  });
}

/** A task of its own, after the work queued so far: for what can't be had a piece at a time, so it never runs inside another's slice. */
export const turn = () => inSlices((function* () {})());

/** Runs steps to their end at once: what inSlices resolves to, now. */
export function whole(steps) {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
