// Moving between the pages of a tab as an iPhone does (the owner's pick, 27 Oct 2026). Going deeper, the arriving page
// slides in from the right over the one leaving, which moves a third of the way left under a light shade; going back
// is the same in reverse. 350 ms on the sheet's curve (--dur-page, --ease-sheet): Ionic's iOS transition takes 540 ms on
// the same curve (ios.transition.ts), wegoplace's 220. Pages are drawn by pictures (copies of the page on its own box,
// taking no presses), so the arriving page is in place and pressable from the first frame, and any press finishes the
// slide (lx/motion.js, rules 2 and 4). In the installed app a swipe from the left edge takes you back, the page
// following the finger as a sheet does (motion.js's one exception, `slide`). Animations off: nothing moves.
//
// A page is transparent (the app's backdrop shows through it, a theme's picture too), so the page underneath is never
// covered by the one over it: it's clipped at that page's edge, which moves with it.

import * as motion from "../lx/motion.js";
import { drawOutlines } from "../lx/edge.js";

const UNDER = 0.33; // how far left the page underneath sits (Ionic's -33%; wegoplace's -30%)
const SHADE = 0.1; // the shade over the page underneath (Ionic's cover)
// A swipe back (Ionic's swipe-back.ts): it starts within 50 px of the left edge, is a swipe once it has gone 10 px more
// sideways than up or down, and goes on release past half the width or when flicked at 0.2 px/ms or more.
const EDGE = 50;
const SETTLE_WITHIN = 1500; // ms: the longest a swipe that went waits for the shell to put the page back
const START = 10;
const FLICK = 0.2;
const SAMPLE_MS = 100; // the finger's speed: over its last 100 ms, by the touches' own times
const STALE_MS = 80; // a finger that has stopped this long before letting go has no speed
// The rest of a swipe's way from where the finger let go: on a curve that starts at the finger's speed and slows into its place, an ease-out
// whose first slope is 2, so it lasts twice what an even pace would take, never under three frames. (The sheet's curve starts at 2.25× and
// spends its last fifth on a pixel or two: given the time to start at the finger's speed, it crept the last 5 px for 120 ms; given less, on a
// 320 phone it took 88% of the last 20 px in its first frame, and the page jumped.)
const SETTLE_EASING = "cubic-bezier(0.5, 1, 0.89, 1)";
const SETTLE_SLOPE = 2;
const SETTLE_MIN = 48;

const pace = () => ({
  duration: motion.duration("--dur-page", 350),
  easing: getComputedStyle(document.documentElement).getPropertyValue("--ease-sheet").trim() || "cubic-bezier(0.32, 0.72, 0, 1)",
});

// The app's own rules, for pictures: a copy of every rule on the page, kept until they change (a look, a theme's CSS).
let rules = { key: "", sheet: null };
function appRules() {
  const sheets = [...document.styleSheets];
  const lists = sheets.map((sheet) => {
    try {
      return sheet.cssRules;
    } catch {
      return null; // another origin's: none of the app's
    }
  });
  const key = lists.map((list) => list?.length ?? 0).join(",");
  if (rules.key !== key || !rules.sheet) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(lists.flatMap((list) => (list ? [...list].map((rule) => rule.cssText) : [])).join("\n"));
    rules = { key, sheet };
  }
  return rules.sheet;
}

// What a page element's own box looks like, kept on its copy (its place among the app's parts isn't). Not its line-height: the page inherits
// body's 1.5, which getComputedStyle reads back as 24px, and copied as 24px every smaller line inside the picture was 24 px tall (a 14 px line
// 21 on the page): the picture was taller than the page, and everything in it moved when the page took its place.
const BOX = ["display", "flex-direction", "gap", "padding-top", "padding-right", "padding-bottom", "padding-left", "color", "font-family", "font-size"];

/**
 * A copy of a page's host for a picture of it. A copied canvas is blank (the pile of your words on Knowledge would be empty all through a move
 * and then flash in), so each canvas in the copy gets what's drawn on its own. A card's outline that its observer hasn't drawn yet (a page brought
 * up to date in this same task: Study's new lesson ticket) is drawn first (lx/edge.js), or the copy has the card with no line all through the slide.
 */
export function copyOf(host) {
  drawOutlines(host);
  const content = host.cloneNode(true);
  const drawn = host.querySelectorAll("canvas");
  const copies = content.querySelectorAll("canvas");
  drawn.forEach((canvas, i) => {
    const copy = copies[i];
    if (!copy || !canvas.width || !canvas.height) return;
    try {
      copy.getContext("2d")?.drawImage(canvas, 0, 0);
    } catch {}
  });
  return content;
}

/**
 * A picture of a page: a copy of `host` in a copy of the page element, fixed on the page's own box and scrolled to
 * `scroll`, taking no presses. It's drawn in a closed shadow root with the app's own rules, so nothing that looks for
 * a part in the page (the app's code, a check) ever finds the copy: it's a picture, not a second page.
 */
export function picture(page, host, scroll = 0, { prepare, before = null } = {}) {
  const rect = page.getBoundingClientRect();
  const shot = document.createElement("div");
  shot.setAttribute("data-page-picture", "");
  shot.setAttribute("data-ghost", "");
  shot.setAttribute("inert", "");
  shot.setAttribute("aria-hidden", "true");
  Object.assign(shot.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    zIndex: "4",
    overflow: "hidden",
    pointerEvents: "none",
  });
  const root = shot.attachShadow({ mode: "closed" });
  // (For checks: what a picture shows is words on the screen, which a walk of the document can't see inside a closed root. scripts/frame-watch.mjs)
  shot.lxRoot = root;
  root.adoptedStyleSheets = [appRules()];
  // The app's frame around it, so the rules that place a page in the app still hold.
  const app = document.createElement("div");
  app.setAttribute("data-part", "app");
  Object.assign(app.style, { display: "block", height: "100%", padding: "0", margin: "0" });
  const copy = page.cloneNode(false);
  copy.removeAttribute("id");
  const style = getComputedStyle(page);
  for (const property of BOX) copy.style.setProperty(property, style.getPropertyValue(property));
  // The room at its foot as the page has it: the rules that set it look at <html> (redesign.css), which a picture's rules can't see, and a picture
  // with less room was scrolled less far at its end.
  // (--page-foot-now: the room as things are now, the page's own; its copy carries it both ways, for its spacer and for what's inside it.)
  const foot = style.getPropertyValue("--page-foot-now") || style.getPropertyValue("--page-foot");
  copy.style.setProperty("--page-foot", foot);
  copy.style.setProperty("--page-foot-now", foot);
  Object.assign(copy.style, { height: "100%", overflow: "hidden", boxSizing: "border-box", margin: "0" });
  const content = copyOf(host);
  // (Not an SVG's own: its clips and outlines refer to them, and a drawing without them is a solid block.)
  for (const node of [content, ...content.querySelectorAll("[id]:not(svg *)")]) node.removeAttribute("id");
  for (const node of [content, ...content.querySelectorAll("[data-motion-hidden], [data-waiting]")]) {
    node.removeAttribute("data-motion-hidden");
    node.removeAttribute("data-waiting");
  }
  prepare?.(content);
  copy.append(content);
  app.append(copy);
  root.append(app);
  // In its place at once (before: under another picture), never moved after: see slide().
  if (before?.isConnected) before.before(shot);
  else page.parentElement.append(shot);
  // Moving the picture in the document (every slide appends it again, in its order) scrolls its copy back to the top: it's put back after each.
  // (Its loops restart each time too: they go back on the clock, in step with the page they're a picture of.)
  shot.lxScroll = () => {
    copy.scrollTop = scroll;
    motion.loopsOnClock(root);
  };
  shot.lxScroll();
  return shot;
}

// The shade over the page underneath: on the page's box, clipped to what of it shows.
function shadeOn(page) {
  const rect = page.getBoundingClientRect();
  const shade = document.createElement("div");
  shade.setAttribute("data-ghost", "");
  shade.setAttribute("aria-hidden", "true");
  Object.assign(shade.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: "4",
    background: "#000",
    opacity: "0",
    pointerEvents: "none",
  });
  page.parentElement.append(shade);
  return shade;
}

// Where the page underneath and its shade are when it's `p` of the way to its place (0: under the page over it, 1: in
// its place, the page over it gone), the page over it then `p` of the width from the left. It sits a third of the way
// left at most and is clipped at that page's edge, so the two never overlap; the shade covers what of it shows.
const underAt = (p, width) => ({ transform: `translateX(${-UNDER * width * (1 - p)}px)`, clipPath: `inset(0 ${(1 - UNDER) * 100 * (1 - p)}% 0 0)` });
const shadeAt = (p) => ({ opacity: String(SHADE * (1 - p)), clipPath: `inset(0 ${100 * (1 - p)}% 0 0)` });

/**
 * Draws a move between two pages of a tab. `leaving`: a picture of the page that's going, taken before it went;
 * `host`: the arriving page's host, already in place and pressable, unseen while its picture moves. "push": the
 * arriving page comes in from the right over the leaving one; "pop": the leaving page goes off to the right,
 * uncovering the arriving one. Nothing moves with animations off (the pictures just go).
 */
export function slide(kind, { page, host, leaving, scroll = page.scrollTop }) {
  if (!motion.motionOn()) return leaving?.remove();
  const width = page.getBoundingClientRect().width || 1;
  // Underneath first, then its shade, then the page over it: each picture made in its place and never moved, the shade put in between. (Moving a
  // picture scrolls its copy back to the top, and putting it back cost a second style and layout of a whole page: 23 + 6 ms of a 94 ms open at 4×.)
  const placed = Boolean(leaving?.isConnected);
  const arriving = picture(page, host, scroll, { before: kind === "push" || !placed ? null : leaving });
  const shade = shadeOn(page);
  const top = kind === "push" ? arriving : leaving;
  const under = kind === "push" ? leaving : arriving;
  if (placed) top.before(shade);
  else {
    page.parentElement.append(...[under, shade, top].filter(Boolean));
    arriving.lxScroll?.();
    leaving?.lxScroll?.();
  }
  host.setAttribute("data-motion-hidden", "");
  let left = 3;
  const end = () => {
    if (--left > 0) return;
    for (const node of [arriving, leaving, shade]) node.remove();
    host.removeAttribute("data-motion-hidden");
  };
  // One curve and one duration for all three, so the page underneath stays clipped exactly at the moving edge.
  const options = { ...pace(), fill: "both", onEnd: end };
  const [from, to] = kind === "push" ? [1, 0] : [0, 1]; // the page underneath: in its place → under, or back
  const over = kind === "push" ? [{ transform: `translateX(${width}px)` }, { transform: "none" }] : [{ transform: "none" }, { transform: `translateX(${width}px)` }];
  motion.animate(top, over, options);
  motion.animate(under, [underAt(from, width), underAt(to, width)], options);
  motion.animate(shade, [shadeAt(from), shadeAt(to)], options);
}

/**
 * The swipe back, in the installed app (iOS gives an app on the home screen no edge swipe of its own; in Safari's tab
 * its own would run too). A finger from the left edge drags the page right, the page underneath following from a
 * third of the way left; let go past half or flicked, and it goes (back()); short of that it springs back.
 * underneath(): a picture of the page underneath, or null where there's none to go back to (a swipe doesn't start).
 */
export function followSwipeBack({ page, underneath, back, enabled, onMove }) {
  let start = null; // { x, y, t } of the finger, until it's decided
  let swipe = null; // { under, shade, width, samples }
  const settle = (goes, velocity) => {
    const { under, shade, width } = swipe;
    const at = new DOMMatrixReadOnly(getComputedStyle(page).transform).m41;
    const p = Math.min(1, Math.max(0, at / width));
    const missing = (goes ? 1 - p : p) * width;
    // At the finger's speed (SETTLE_EASING starts at twice an even pace, so twice the time the finger would take), 350 ms at most.
    const most = pace().duration;
    const duration = missing <= 1 ? 1 : Math.max(SETTLE_MIN, missing > 5 && Math.abs(velocity) > 0 ? Math.min((SETTLE_SLOPE * missing) / Math.abs(velocity), most) : most * (missing / width));
    const done = () => {
      if (goes) {
        // The page underneath is where it'll be; the shell puts the real one there and clears this (settle()).
        swipe.gone = true;
        const mine = swipe;
        back();
        // And if the shell never does (back went nowhere, or to an entry it doesn't draw), the page comes back in place anyway: a page left
        // off the screen is every tab black but the tab bar.
        setTimeout(() => {
          if (swipe === mine) putBack();
        }, SETTLE_WITHIN);
      } else {
        onMove?.(null);
        under.remove();
        shade.remove();
        // The spring back held its last frame (fill: forwards): let it go, or it would hold the next swipe still.
        for (const animation of page.getAnimations()) animation.cancel();
        page.style.removeProperty("transform");
        swipe = null;
      }
    };
    const to = goes ? 1 : 0;
    onMove?.(to, { duration: Math.max(1, duration) });
    // Where it all ends, set first: with animations off the slide ends at once (done() runs inside it, back() with it), and a back that draws
    // in this entry's place clears the swipe there and then; set after it, the page would be put back off the screen.
    page.style.setProperty("transform", `translateX(${to * width}px)`);
    under.style.setProperty("transform", underAt(to, width).transform);
    under.style.setProperty("clip-path", underAt(to, width).clipPath);
    Object.assign(shade.style, { opacity: shadeAt(to).opacity, clipPath: shadeAt(to).clipPath });
    // The rest of the way at the finger's speed (350 ms at most), the page and what's underneath on one curve.
    const options = { duration: Math.max(1, duration), fill: "forwards" };
    motion.slide(page, [{ transform: `translateX(${at}px)` }, { transform: `translateX(${to * width}px)` }], { ...options, ease: SETTLE_EASING, onEnd: done });
    motion.animate(under, [underAt(p, width), underAt(to, width)], { ...options, easing: SETTLE_EASING });
    motion.animate(shade, [shadeAt(p), shadeAt(to)], { ...options, easing: SETTLE_EASING });
  };
  const move = (x) => {
    const { under, shade, width } = swipe;
    const dx = Math.min(width, Math.max(0, x - start.x));
    const p = dx / width;
    onMove?.(p);
    page.style.setProperty("transform", `translateX(${dx}px)`);
    under.style.setProperty("transform", underAt(p, width).transform);
    under.style.setProperty("clip-path", underAt(p, width).clipPath);
    Object.assign(shade.style, { opacity: shadeAt(p).opacity, clipPath: shadeAt(p).clipPath });
  };
  page.addEventListener(
    "touchstart",
    (event) => {
      if (swipe || event.touches.length !== 1 || !enabled()) return;
      const t = event.touches[0];
      start = t.clientX <= EDGE ? { x: t.clientX, y: t.clientY } : null;
    },
    { passive: true },
  );
  page.addEventListener(
    "touchmove",
    (event) => {
      if (!start) return;
      const t = event.touches[0];
      if (!swipe) {
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) < START && Math.abs(dy) < START) return;
        if (dx < START || Math.abs(dy) >= Math.abs(dx)) return void (start = null); // a scroll, or a swipe the other way
        const under = underneath();
        if (!under) return void (start = null);
        motion.finishAll();
        const width = page.getBoundingClientRect().width || 1;
        const shade = shadeOn(page);
        page.parentElement.append(under, shade);
        under.lxScroll?.();
        // The page keeps its place under the finger from where it touched down.
        swipe = { under, shade, width, samples: [] };
      }
      event.preventDefault();
      swipe.samples.push({ x: t.clientX, t: event.timeStamp });
      while (swipe.samples.length > 2 && event.timeStamp - swipe.samples[0].t > SAMPLE_MS) swipe.samples.shift();
      move(t.clientX);
    },
    { passive: false },
  );
  const lift = (event) => {
    if (!swipe || swipe.settling) {
      start = null;
      return;
    }
    const { samples, width } = swipe;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const velocity = last && first && last.t > first.t && event.timeStamp - last.t <= STALE_MS ? (last.x - first.x) / (last.t - first.t) : 0;
    const at = new DOMMatrixReadOnly(getComputedStyle(page).transform).m41;
    swipe.settling = true;
    start = null;
    // A touch the system took away (touchcancel: its own gesture, a call) never goes back: the page springs back, however far it was.
    settle(event.type !== "touchcancel" && velocity >= 0 && (velocity > FLICK || at > width / 2), velocity);
  };
  page.addEventListener("touchend", lift);
  page.addEventListener("touchcancel", lift);
  function putBack() {
    onMove?.(null);
    swipe?.under.remove();
    swipe?.shade.remove();
    for (const animation of page.getAnimations()) animation.cancel();
    page.style.removeProperty("transform");
    swipe = null;
  }
  // Coming back to the app (a phone that froze it mid-swipe): nothing left half done.
  addEventListener("pageshow", () => swipe?.gone && putBack());
  return {
    /** Whether a swipe is under way (a finger on it, or its settling). */
    get active() {
      return Boolean(swipe);
    },
    /** After a swipe that went: the real page is in place; the picture and shade go, and the page moves no more. */
    settle() {
      if (!swipe?.gone) return false;
      putBack();
      return true;
    },
    /**
     * The phone took the step itself while this finger was still swiping (its own back): the page back in place at once, the rest of the gesture
     * ignored. (The page the finger started on is gone with that step, and so are its touches: they never reach the page again, and the page was
     * left part way across the screen, the picture under it, for good. back-check's "with less motion" stage.)
     */
    drop() {
      start = null;
      if (swipe) putBack();
    },
  };
}
