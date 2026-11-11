// The splash, running: a drop falls, splats and bounces up as Tinta (the art is the character's rig:
// rig/splash/splash.js). theme-boot.js decided before the first paint (<html data-splash>), and its first frame is
// already on screen (static markup in app/index.html, splash.css). This takes over from there:
// - "play": the first frame holds until the app has drawn (<html data-app-drawn>): a held first frame looks finished, and
//   only then is the main thread free (on a phone the app's first draw took it for seconds, the live frames stopped, and
//   their clock ran on without them). If that took too long already, there's no splash: it fades into the app. Then the
//   drop falls, by transform alone (fallFrames), and at the hit live frames take over, each moving the camera and
//   redrawing the ink and Tinta, on a clock that's never ahead of what's been drawn. At the end it fades out over 250 ms (fadeAway).
//   The app is live under it the whole time; nothing waits for it.
// - A press or a key ends it at once (it registers with motion.js, so finishAll() ends it as it ends every animation).
//   The press is the splash's: it stays (invisible) until that press is over, so nothing under it is pressed.
// Only "play" loads this (shell/main.js). Before it arrives, theme-boot.js keeps the splash's promises (a press ends it,
// a slow start steps aside) and owns "still" (Animations Off, reduced motion: its last frame for half a second) whole.
// Taking over, it marks the overlay data-run; a splash theme-boot.js already ended or took away is left to it.
import { registerTicker } from "../lx/motion.js";
import { DUR, camera, fallFrames, movingParts } from "./rig/splash/splash.js";
import { defaultInk, mixInk, readInk } from "./ink.js";

const SVG = "http://www.w3.org/2000/svg";
const root = document.documentElement;
const overlay = document.querySelector(".lx-splash");
const mode = root.getAttribute("data-splash");
const TOO_LATE = 5000; // ms since the app was opened: past this they've waited enough, and it's the app they came for
const GIVE_UP = 6000; // the app's first draw never came: step aside (theme-boot.js's, once this has taken over)
const LONGEST_STEP = 0.05; // s of its clock a frame can move: a stall holds it, and it carries on from there

function remove() {
  overlay?.remove();
  root.removeAttribute("data-splash");
}

/**
 * Fades into the app, as theme-boot.js's fadeAway does: the overlay's opacity (its own layer, splash.css) set each frame on a clock that moves
 * at most one frame's worth (34 ms) a frame, so a busy main thread holds the fade where it is and it carries on from there; gone on the frame
 * after it's clear. On a phone, a CSS transition run on its own clock with a 260 ms timer showed its first frame half way through, or none.
 */
function fadeAway() {
  let gone = false;
  let t = 0;
  let last = 0;
  const finish = () => {
    if (gone) return;
    gone = true;
    remove();
  };
  overlay.setAttribute("data-going", "");
  setTimeout(finish, 3000); // whatever comes, it never stays
  const frame = (now) => {
    if (gone || !overlay.isConnected || overlay.hasAttribute("data-ended")) return;
    if (last) t += Math.min(34, Math.max(0, now - last));
    last = now;
    const x = Math.min(1, t / 250);
    overlay.style.opacity = String(Math.round((1 - x) * (1 - x) * 1000) / 1000); // ease-out
    overlay.style.setProperty("--lx-splash-ink", String(Math.round(x * x * (3 - 2 * x) * 1000) / 1000)); // a theme's ink, eased in (splash.css)
    requestAnimationFrame(x >= 1 ? finish : frame);
  };
  requestAnimationFrame(frame);
}

/** Ends it now: invisible at once; gone once the press that ended it is over (that press never reaches the app). */
function end({ pressed = false } = {}) {
  if (!overlay?.isConnected) return;
  overlay.setAttribute("data-ended", "");
  overlay.removeAttribute("data-going");
  if (!pressed) return remove();
  const events = ["pointerup", "pointercancel", "keyup"];
  const done = () => {
    for (const type of events) removeEventListener(type, later, true);
    remove();
  };
  // The press is over (a finger or a key lifted): the click that follows lands on the overlay, then it goes.
  const later = () => setTimeout(done, 60);
  for (const type of events) addEventListener(type, later, true);
  setTimeout(done, 1500);
}

if (overlay?.hasAttribute("data-ended") || overlay?.hasAttribute("data-going")) {
  // A press ended it before this arrived, or theme-boot.js stepped aside (6 s): it's theme-boot.js's to take away.
} else if (!overlay || mode !== "play") {
  remove();
} else {
  overlay.setAttribute("data-run", "");
  try {
    start();
  } catch (error) {
    remove();
    throw error;
  }
}

function start() {
  const theme = getComputedStyle(root).colorScheme.includes("light") ? "light" : "dark";
  // The splash is drawn in the default ink (it's iOS's launch image). A theme that colors Tinta (ink.js) has it ease into the theme's
  // ink in OKLCH from the splat to the end, so the Tinta it becomes fades into the app already in the app's ink.
  const from = defaultInk(theme), to = readInk();
  let easeFrom = DUR;
  const inkAt = (t) => {
    if (to === from) return theme;
    const u = Math.min(1, Math.max(0, (t - easeFrom) / Math.max(0.001, DUR - easeFrom)));
    return { name: theme, ink: mixInk(from, to, u * u * (3 - 2 * u)) };
  };
  const live = document.createElementNS(SVG, "svg");
  live.setAttribute("class", "lx-splash-live");
  live.setAttribute("aria-hidden", "true");
  const g = () => document.createElementNS(SVG, "g");
  const cam = g(), ink = g();
  cam.append(ink);
  live.append(cam);
  overlay.append(live);

  let width = 0, height = 0;
  const size = () => {
    width = overlay.clientWidth || innerWidth;
    height = overlay.clientHeight || innerHeight;
    live.setAttribute("viewBox", `0 0 ${width} ${height}`);
  };
  size();
  addEventListener("resize", size);

  let raf = 0, finished = false, started = false, watching = null, falling = null;
  const ticker = registerTicker(() => {
    // A press (or a key): it ends now.
    finished = true;
    cancelAnimationFrame(raf);
    watching?.disconnect();
    falling?.cancel();
    end({ pressed: true });
  });
  if (!ticker) return remove(); // Animations went off since the first paint: no splash

  const fadeOut = () => {
    if (finished) return;
    finished = true;
    ticker.end();
    fadeAway();
  };
  // The live frame at the fall's end is the same as the first frame there; once it's drawn, the first frame steps aside.
  let shown = false;
  let t = 0, last = 0;
  const draw = (now) => {
    if (finished) return;
    t = Math.min(DUR, t + Math.min(LONGEST_STEP, Math.max(0, (now - last) / 1000)));
    last = now;
    const c = camera(t, width, height);
    cam.setAttribute("transform", `translate(${(width / 2).toFixed(2)},${(height / 2).toFixed(2)}) scale(${c.s.toFixed(5)}) translate(${(-c.cx).toFixed(2)},${c.cy.toFixed(2)})`);
    ink.innerHTML = movingParts(t, inkAt(t), { detail: 2, points: 160, compact: true }).ink;
    if (!shown) {
      overlay.setAttribute("data-live", "");
      shown = true;
    }
    if (t >= DUR) return fadeOut();
    raf = requestAnimationFrame(draw);
  };
  const play = () => {
    if (finished || started) return;
    if (performance.now() > TOO_LATE) return fadeOut();
    started = true;
    size();
    // The fall is the first frame's own element, moved by transform alone: once begun it needs nothing of the main thread. If
    // the thread is busy as it ends, the drop waits a hair above the ground, and the splat comes as soon as there are frames.
    const fall = fallFrames(width, height);
    easeFrom = fall.t;
    overlay.setAttribute("data-fall", "");
    falling = overlay.querySelector(fall.selector).animate(fall.keyframes, { duration: fall.duration, easing: "linear", fill: "forwards" });
    falling.finished
      .then(() => {
        if (finished) return;
        t = fall.t;
        last = performance.now();
        raf = requestAnimationFrame((now) => {
          last = now; // from this frame: nothing's owed for the wait
          draw(now);
        });
      })
      .catch(() => {}); // cancelled: a press ended it
  };
  if (root.hasAttribute("data-app-drawn")) return play();
  watching = new MutationObserver(() => {
    if (!root.hasAttribute("data-app-drawn")) return;
    watching.disconnect();
    play();
  });
  watching.observe(root, { attributes: true, attributeFilter: ["data-app-drawn"] });
  setTimeout(() => {
    watching.disconnect();
    if (!started) fadeOut();
  }, Math.max(0, GIVE_UP - performance.now()));
}
