// Lexicommons motion. Every animation is decoration on a UI that is already in its final state, so motion never
// blocks anyone. The rules, which every helper here enforces on its own:
//
// 1. State and layout change first, instantly. Nothing waits for an animation: no awaiting one before the next step,
//    no control disabled while something moves.
// 2. Interactive things never move under the pointer. A move, shake or pop of anything you can press is drawn by a
//    ghost (a copy on a layer the pointer passes through) while the real element already sits where it ends up,
//    pressable, and invisible only until its ghost lands. Press where something is going and you press it.
//    One exception, `slide`: a sheet moves itself. It follows the finger and settles from where the finger let go,
//    as every drawer does, and a copy of it would lose its scroll position and the layout its place gives it. A
//    press still finishes its slide at once (rule 4), and a closing sheet takes no presses while it goes. A page under
//    a swipe back (shell/page-slide.js) is the same: it follows the finger, and settles from where it was let go.
// 3. An interactive thing appears with opacity and blur only: a transform or clip-path would move or shrink where a
//    press lands.
// 4. Any pointer press or key press finishes every running animation at once, including those that draw their own
//    frames (the character, the splash), which join through `registerTicker`. One exception: a press on Tinta where he can be
//    poked is the poke itself, so it never finishes his poke (registerTicker's `spares`; character/character.js). It finishes
//    every other animation as any press does.
// 5. Animations off (Settings → Animations), or "Match device" on a device that asks for reduced motion: nothing
//    animates, and every helper applies its end state immediately.
//
// Durations and easings come from the --dur-* and --ease-* tokens, so a theme can change the pace.

const root = document.documentElement;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const INTERACTIVE = "button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex='-1']), [contenteditable='true']";

/**
 * Loops (CSS animations that repeat forever) under `root`, an element or a shadow root, on the document's clock: each at the phase the time says,
 * not counted from when its element was put in. Things that bob together stay together, and a copy of a page (a swipe's picture) and the page
 * built again show them in step.
 */
const onClock = (animation) => {
  if (animation.effect?.getTiming?.().iterations === Infinity && animation.startTime !== 0) animation.startTime = 0;
};
const watchedForLoops = new WeakSet();
export function loopsOnClock(scope) {
  if (!scope) return;
  const animations = scope instanceof Element ? scope.getAnimations({ subtree: true }) : (scope.getAnimations?.() ?? []);
  animations.forEach(onClock);
  // And every loop that starts under it later (an element drawn later, one that comes into view, one whose loop a class turns on).
  if (watchedForLoops.has(scope)) return;
  watchedForLoops.add(scope);
  scope.addEventListener("animationstart", (event) => {
    for (const animation of event.target.getAnimations?.() ?? []) if (animation.animationName === event.animationName) onClock(animation);
  });
}

/** Whether anything should animate right now. */
export function motionOn() {
  const setting = root.getAttribute("data-motion") ?? "system";
  if (setting === "off") return false;
  if (setting === "on") return true;
  return !reducedMotion.matches;
}

// (Inside something inert nothing can be pressed: a game once it's answered moves itself.)
const isInteractive = (node) => node instanceof Element && !node.closest("[inert]") && (node.matches(INTERACTIVE) || Boolean(node.querySelector(INTERACTIVE)));

function token(name, fallback) {
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  return value || fallback;
}

/** A --dur-* token in milliseconds. */
export function duration(name, fallback = 200) {
  const value = token(name, "");
  const ms = value.endsWith("ms") ? parseFloat(value) : value.endsWith("s") ? parseFloat(value) * 1000 : NaN;
  return Number.isFinite(ms) ? ms : fallback;
}

const easing = (name) => token(name, "cubic-bezier(0.4, 0, 0.2, 1)");
/** An --ease-* token's curve, for a move that goes with others. */
export const easingOf = easing;

// A CSS cubic-bezier() as a function of time, for sampling a path in JS.
function bezier(css) {
  const m = /cubic-bezier\(([^)]+)\)/.exec(css);
  const [x1, y1, x2, y2] = m ? m[1].split(",").map(Number) : [0.4, 0, 0.2, 1];
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (t) => ((ax * t + bx) * t + cx) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (target) => {
    let t = target;
    for (let i = 0; i < 8; i++) {
      const err = x(t) - target;
      const slope = dx(t);
      if (Math.abs(err) < 1e-5 || Math.abs(slope) < 1e-6) break;
      t -= err / slope;
    }
    t = Math.min(1, Math.max(0, t));
    return ((ay * t + by) * t + cy) * t;
  };
}

/**
 * Keyframes for one smooth move along a curve: at(p) gives the frame at eased progress p (0 → 1), sampled finely with
 * linear steps between, so the thing travels in a single motion. (Easing each keyframe segment instead slows it to a
 * stop at every point along the way.) from: where the move starts in the animation (0–1), after a hold.
 */
function curveFrames(at, { ease = easing("--ease-standard"), from = 0, samples = 20 } = {}) {
  const f = bezier(ease);
  const frames = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    frames.push({ ...at(f(t)), offset: from + (1 - from) * t, easing: "linear" });
  }
  return frames;
}

// ---------- tracking: everything running can be finished at once ----------

const running = new Map(); // Animation (or ticker) -> cleanup, run once when it ends however it ends

function track(animation, cleanup) {
  running.set(animation, cleanup);
  const end = () => {
    if (!running.has(animation)) return;
    const done = running.get(animation);
    running.delete(animation);
    done?.();
  };
  animation.finished?.then(end, end);
  animation.lxEnd = end;
  return animation;
}

/**
 * Finishes every running animation now, end states applied synchronously. Runs on every press, with the press: an animation
 * that spares it (registerTicker's `spares`) runs on.
 */
export function finishAll(event = null) {
  for (const animation of [...running.keys()]) {
    if (event && animation.lxSpares?.(event)) continue;
    // Where a sheet had got to, for one pressed away on its way up.
    if (animation.lxSliding?.isConnected) animation.lxSliding.lxSlidTo = { at: performance.now(), y: new DOMMatrix(getComputedStyle(animation.lxSliding).transform).m42 };
    try {
      animation.finish();
    } catch {
      animation.cancel?.();
    }
    animation.lxEnd?.();
  }
}

/** How many animations are running (for checks). */
export const runningCount = () => running.size;

/**
 * An animation that draws its own frames (requestAnimationFrame: the character, the splash) joins the rest here, so a
 * press finishes it exactly as it finishes a ghost: `finish` jumps it to its end state, synchronously, once (it stops
 * its own frame loop there). Call the returned `end()` when it ends by itself. With motion off nothing plays: this
 * finishes it at once and returns null, so the caller's end state is all anyone sees. `spares(event)`, if given, is true for a
 * press that doesn't finish it (only a poke on the Tinta playing it: rule 4's one exception).
 */
export function registerTicker(finish, { spares = null } = {}) {
  let finished = false;
  const ticker = {
    finish() {
      if (finished) return;
      finished = true;
      finish();
    },
    // spares(event): true for a press that doesn't finish it (a poke on the Tinta that's playing it: rule 4's one exception).
    lxSpares: typeof spares === "function" ? spares : null,
  };
  if (!motionOn()) {
    ticker.finish();
    return null;
  }
  track(ticker);
  return {
    end() {
      finished = true;
      ticker.lxEnd();
    },
  };
}

// Capture phase, so it runs before anything the press does. Hit-testing has already happened by then, against the
// real elements (ghosts ignore the pointer), so a press always lands on what is really there.
addEventListener("pointerdown", (event) => finishAll(event), true);
addEventListener("keydown", (event) => {
  if (!event.repeat) finishAll(event);
}, true);

// ---------- a press always lands ----------

// A touch that ends as a tap always gets its click. iOS doesn't send one for a tap that comes within a few hundred ms of the last
// (measured on a real iOS 26.4: pointerdown and pointerup arrive, and no click), or for one overlapping another finger, and then
// the control shows its pressed state and nothing happens: the second of two quick tiles, for one. So: at once when the last tap
// was that recent, in the press itself; otherwise a moment later if the browser hasn't sent its own. If the browser's comes
// after all, it's the same press, and it goes nowhere.
const TAP_TRAVEL = 12; // px a finger can roll within a tap (a drag starts past it)
const TAP_LONGEST = 600; // ms: past it, a long press is the phone's (the selection's menu)
const NO_CLICK_WITHIN = 450; // ms since the last tap in which no click is sent
const CLICK_COMES_BY = 80; // ms after the finger lifts
const FIELD = "select, textarea, [contenteditable='true'], input:not([type='checkbox'], [type='radio'], [type='button'], [type='submit'])";
const touches = new Map(); // pointerId -> where and when it came down, and how far it's gone
let lastTap = -Infinity;
let lastClick = { at: -Infinity, target: null }; // the browser's own
let sentAt = -Infinity;
let sentTo = { x: 0, y: 0 }; // where the last click sent for a tap was
let expected = 0; // a timer waiting for the browser's own click
// A double tap on something that went with the first (Continue, and the next step's button where it was) is one press: the second
// never lands on what took its place. Anything still there takes every tap.
const SAME_SPOT = 24; // px
const DOUBLE_TAP = 200; // ms: a finger can bounce that fast; nobody reads what came up and means it
let tapped = null; // the last tap: where, when, on what

const doubled = (x, y, now) => tapped && now - tapped.at < DOUBLE_TAP && !tapped.target.isConnected && Math.hypot(x - tapped.x, y - tapped.y) < SAME_SPOT;

function sendClick(target, x, y) {
  if (!target.isConnected) return;
  sentAt = performance.now();
  sentTo = { x, y };
  if (typeof target.click === "function") target.click();
  else target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
}
addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") touches.set(event.pointerId, { x: event.clientX, y: event.clientY, at: performance.now(), far: 0, target: event.target });
}, true);
addEventListener("pointermove", (event) => {
  const touch = touches.get(event.pointerId);
  if (touch) touch.far = Math.max(touch.far, Math.hypot(event.clientX - touch.x, event.clientY - touch.y));
}, true);
addEventListener("pointercancel", (event) => touches.delete(event.pointerId), true);
addEventListener("pointerup", (event) => {
  const touch = touches.get(event.pointerId);
  touches.delete(event.pointerId);
  if (!touch) return;
  const now = performance.now();
  if (touch.far > TAP_TRAVEL || now - touch.at > TAP_LONGEST) return;
  // Its own click has already come (an earlier tap's, arriving late, isn't).
  if (lastClick.at >= touch.at && (touch.target.contains?.(lastClick.target) || lastClick.target?.contains?.(touch.target))) return;
  const target = document.elementFromPoint(event.clientX, event.clientY);
  // Something else under the finger now, or a field, whose press is the keyboard's: the browser's call.
  if (!target || !(touch.target.contains?.(target) || target.contains(touch.target)) || target.closest(FIELD)) return;
  const again = doubled(event.clientX, event.clientY, now);
  const tooSoon = now - lastTap < NO_CLICK_WITHIN;
  lastTap = now;
  const { clientX: x, clientY: y } = event;
  if (again) {
    // The browser's click for this, if it comes, goes nowhere either.
    sentAt = now;
    sentTo = { x, y };
    return;
  }
  tapped = { x, y, at: now, target };
  if (tooSoon) sendClick(target, x, y);
  else {
    clearTimeout(expected);
    expected = setTimeout(() => {
      expected = 0;
      sendClick(target, x, y);
    }, CLICK_COMES_BY);
  }
}, true);
addEventListener("click", (event) => {
  if (!event.isTrusted) return;
  lastClick = { at: performance.now(), target: event.target };
  if (expected) {
    clearTimeout(expected);
    expected = 0;
    return;
  }
  // The browser's own, after one was sent for that same tap: it goes nowhere. Anything else is another press: a mouse's, a key's,
  // or a finger somewhere else.
  const sameTap = lastClick.at - sentAt < 500 && event.pointerType !== "mouse" && event.detail !== 0 && Math.hypot(event.clientX - sentTo.x, event.clientY - sentTo.y) < SAME_SPOT;
  if (sameTap) {
    event.stopImmediatePropagation();
    event.preventDefault();
  }
}, true);

// ---------- the ghost layer ----------

let layer = null;
function ghostLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div");
    layer.setAttribute("data-motion-layer", "");
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
  }
  return layer;
}

// What a copy needs to look like the original once it's lifted out of its place in the page.
const COPIED = [
  "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "color", "background-color",
  "background-image", "border-top", "border-right", "border-bottom", "border-left", "border-radius", "padding-top",
  "padding-right", "padding-bottom", "padding-left", "box-shadow", "text-decoration", "text-underline-offset",
  "text-align", "display", "align-items", "justify-content", "gap", "white-space", "opacity",
];

// And for what's inside it: a copy out of its place loses every rule that depends on where it stood (a session's fit levels, the
// answer bar's insides), so it would look different for as long as it's drawn and snap when it lands. So its parts keep what they computed.
const COPIED_INSIDE = [
  ...COPIED,
  "margin-top", "margin-right", "margin-bottom", "margin-left", "max-width", "min-width", "min-height", "max-height", "flex-direction", "flex-wrap",
  "flex-grow", "flex-shrink", "flex-basis", "align-self", "justify-self", "text-overflow", "overflow-x", "overflow-y", "overflow-wrap", "word-break",
  "direction", "unicode-bidi", "vertical-align", "visibility", "background-size", "background-position", "background-repeat", "position",
  "top", "right", "bottom", "left", "-webkit-line-clamp", "-webkit-box-orient",
];
const INSIDE_LIMIT = 400;
function copyInside(source, ghost, budget = { left: INSIDE_LIMIT }) {
  const from = source.children;
  const to = ghost.children;
  for (let i = 0; i < from.length && i < to.length; i++) {
    const a = from[i];
    const b = to[i];
    // What's inside a drawing keeps its own; Tinta is one drawing.
    if (a.closest("svg *, lx-tinta, [data-part='character']")) continue;
    if (budget.left-- <= 0) return;
    const style = getComputedStyle(a);
    for (const property of COPIED_INSIDE) b.style.setProperty(property, style.getPropertyValue(property));
    // A part at opacity 0 is shown in the copy only where motion made it so: an original hidden under its own ghost
    // (data-motion-hidden), or one still fading in. A part the page itself hides (an unchosen choice's mark) stays hidden:
    // shown, every such mark flashed for as long as the copy of a leaving step was drawn.
    if (style.opacity === "0" && (a.hasAttribute("data-motion-hidden") || a.getAnimations().length > 0)) b.style.opacity = "1";
    // A drawing itself takes its place as it does (an icon a tight fit leaves out), at its size.
    if (a.localName === "svg") {
      b.style.setProperty("width", style.getPropertyValue("width"));
      b.style.setProperty("height", style.getPropertyValue("height"));
      continue;
    }
    copyInside(a, b, budget);
  }
}

/** A copy of an element, fixed over the page at a rect, that the pointer passes through. */
/** A copy of `source` drawn at `rect` on the ghost layer, taking no presses (a tile being dragged follows the finger). */
export const ghostOf = (source, rect) => makeGhost(source, rect);

function makeGhost(source, rect) {
  const ghost = source.cloneNode(true);
  // (Not an SVG's own: its clips and outlines refer to them, and a drawing without them is a solid block.)
  for (const node of [ghost, ...ghost.querySelectorAll("[id]:not(svg *)")]) node.removeAttribute("id");
  ghost.removeAttribute("data-motion-hidden");
  for (const node of ghost.querySelectorAll("[data-motion-hidden]")) node.removeAttribute("data-motion-hidden");
  ghost.setAttribute("inert", "");
  ghost.setAttribute("data-ghost", "");
  const style = getComputedStyle(source);
  for (const property of COPIED) ghost.style.setProperty(property, style.getPropertyValue(property));
  if (style.opacity === "0") ghost.style.opacity = "1";
  copyInside(source, ghost);
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    boxSizing: "border-box",
    pointerEvents: "none",
  });
  ghostLayer().append(ghost);
  return ghost;
}

// The real element stays in place and pressable but unseen while its ghost is drawn. Counted, so overlapping
// animations on one element show it again only when the last one ends.
const hiddenCount = new WeakMap();
function hideWhileDrawn(node) {
  hiddenCount.set(node, (hiddenCount.get(node) ?? 0) + 1);
  node.setAttribute("data-motion-hidden", "");
  return () => {
    const left = (hiddenCount.get(node) ?? 1) - 1;
    hiddenCount.set(node, left);
    if (left > 0) return;
    // Shown at once, where its ghost just landed: a control's own opacity transition would fade it in, a blink on landing.
    const transition = node.style.transition;
    node.style.transition = "none";
    node.removeAttribute("data-motion-hidden");
    void getComputedStyle(node).opacity;
    node.style.transition = transition;
  };
}

// A ghost stands for a real element that's already in its place. If the layout moves that place while the ghost is drawn (a
// result bar making room, a font arriving), the ghost goes with it: otherwise it's left where the place was, while
// the rest of the page has moved, and snaps when it lands. It follows on `translate`, which the moves' own `transform` and
// box keyframes add to.
const anchors = new Map(); // ghost -> { node, x, y, w, h }: where the real element was when the ghost was made
let anchorFrame = 0;
/** Puts every ghost right over where its real element is now. Call it after changing the layout, for the same frame. */
export function syncGhosts() {
  for (const [ghost, anchor] of anchors) {
    if (!ghost.isConnected || !anchor.node.isConnected) {
      anchors.delete(ghost);
      continue;
    }
    const now = anchor.node.getBoundingClientRect();
    // Its size too (a grid narrowing for the result under a picture still popping): both about its center, so a pop's own scale stays centered.
    ghost.style.translate = `${now.left + now.width / 2 - (anchor.x + anchor.w / 2)}px ${now.top + now.height / 2 - (anchor.y + anchor.h / 2)}px`;
    const sx = anchor.w && now.width ? now.width / anchor.w : 1;
    const sy = anchor.h && now.height ? now.height / anchor.h : 1;
    ghost.style.scale = Math.abs(sx - 1) < 0.002 && Math.abs(sy - 1) < 0.002 ? "" : `${sx} ${sy}`;
  }
}
function followAnchors() {
  syncGhosts();
  anchorFrame = anchors.size ? requestAnimationFrame(followAnchors) : 0;
}
function anchorGhost(ghost, node, rect) {
  anchors.set(ghost, { node, x: rect.left, y: rect.top, w: rect.width, h: rect.height });
  anchorFrame ||= requestAnimationFrame(followAnchors);
}

// ---------- helpers ----------

/** Plain animation of a non-interactive element (or of things that don't move: color, opacity, blur). */
export function animate(node, keyframes, options = {}) {
  if (!motionOn() || !node?.animate) return null;
  const animation = node.animate(keyframes, {
    duration: options.duration ?? duration("--dur-200"),
    easing: options.easing ?? easing("--ease-standard"),
    delay: options.delay ?? 0,
    fill: options.fill ?? "backwards",
  });
  return track(animation, options.onEnd);
}

/**
 * An effect that moves or scales (a shake, a pop). On an interactive element it's drawn on a ghost over the element,
 * so where a press lands never changes.
 */
export function decorate(node, keyframes, options = {}) {
  if (!motionOn() || !node?.isConnected) return null;
  if (!isInteractive(node)) return animate(node, keyframes, options);
  const rect = node.getBoundingClientRect();
  if (!rect.width) return null;
  const ghost = makeGhost(node, rect);
  const show = hideWhileDrawn(node);
  anchorGhost(ghost, node, rect);
  const animation = ghost.animate(keyframes, {
    duration: options.duration ?? duration("--dur-320"),
    easing: options.easing ?? easing("--ease-standard"),
    delay: options.delay ?? 0,
    fill: "backwards",
  });
  return track(animation, () => {
    anchors.delete(ghost);
    ghost.remove();
    show();
  });
}

export const shake = (node, options) =>
  decorate(
    node,
    [{ transform: "none" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(2px)" }, { transform: "none" }],
    { duration: duration("--dur-320", 320), ...options },
  );

export const pop = (node, options) =>
  decorate(node, [{ transform: "scale(1)" }, { transform: "scale(1.045)", offset: 0.4 }, { transform: "scale(1)" }], {
    duration: duration("--dur-320", 320),
    easing: easing("--ease-spring"),
    ...options,
  });

/**
 * Brings something in. Interactive things only fade and sharpen (rule 3); others may also rise a few pixels.
 */
export function appear(node, { delay = 0, rise = 6, blur = 4, duration: ms } = {}) {
  if (!node) return null;
  const moves = !isInteractive(node) && rise;
  return animate(
    node,
    [
      { opacity: 0, filter: blur ? `blur(${blur}px)` : "none", transform: moves ? `translateY(${rise}px)` : "none" },
      { opacity: 1, filter: blur ? "blur(0)" : "none", transform: "none" },
    ],
    { duration: ms ?? duration("--dur-320", 320), easing: easing("--ease-out"), delay },
  );
}

/**
 * Draws something leaving. Call it just before removing the node: a ghost of it slides off and fades, while the real
 * node is already gone and whatever replaces it is already pressable.
 */
export function leave(node, { dx = -28, dy = 0, duration: ms, fade = true } = {}) {
  if (!motionOn() || !node?.isConnected) return null;
  const rect = node.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const ghost = makeGhost(node, rect);
  const animation = ghost.animate([{ opacity: 1, transform: "none" }, { opacity: fade ? 0 : 1, transform: `translate(${dx}px, ${dy}px)` }], {
    duration: ms ?? duration("--dur-200", 200),
    easing: easing("--ease-standard"),
    fill: "forwards",
  });
  return track(animation, () => ghost.remove());
}

/**
 * A sheet's slide, or a page's under a swipe back (rule 2's one exception): `node` itself moves through `keyframes`,
 * on the sheet's own pace (--dur-sheet, --ease-sheet; `ease` another curve, as a swipe's rest of the way from the finger has). onEnd runs once
 * when it ends, however it ends (finished by a press, too); with animations off it runs at once and nothing moves.
 */
export function slide(node, keyframes, { duration: ms, onEnd, fill = "none", ease } = {}) {
  if (!motionOn() || !node?.isConnected || !node.animate) {
    onEnd?.();
    return null;
  }
  const animation = node.animate(keyframes, { duration: ms ?? duration("--dur-sheet", 500), easing: ease ?? easing("--ease-sheet"), fill });
  animation.lxSliding = node;
  return track(animation, onEnd);
}

/** Staggered appear for a list of nodes. */
export function stagger(nodes, { step = 28, ...options } = {}) {
  [...nodes].forEach((node, i) => appear(node, { ...options, delay: (options.delay ?? 0) + i * step }));
}

/**
 * Draws a move: `node` is already where it ends up; a ghost travels there from `fromRect`. Pass `ghostOf` to draw
 * the ghost as a different element (a word flying from a button into a gap), and `arc` to lift the path.
 */
export function fly(node, fromRect, { ghostOf, arc = 0, duration: ms, delay = 0, easing: ease, clip = false } = {}) {
  if (!motionOn() || !node?.isConnected || !fromRect) return null;
  const to = node.getBoundingClientRect();
  if (!to.width || (Math.abs(to.left - fromRect.left) < 0.5 && Math.abs(to.top - fromRect.top) < 0.5 && Math.abs(to.width - fromRect.width) < 0.5)) return null;
  const ghost = makeGhost(ghostOf ?? node, fromRect);
  // (Growing from something smaller: what's inside shows as there's room for it.)
  if (clip) ghost.style.overflow = "hidden";
  const show = hideWhileDrawn(node);
  anchorGhost(ghost, node, to);
  const box = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  const lerp = (a, b, p) => a + (b - a) * p;
  // An arc is one smooth curve, lifting by `arc` at its middle, eased once from end to end.
  const frames = arc
    ? curveFrames(
        (p) => ({
          left: `${lerp(fromRect.left, to.left, p)}px`,
          top: `${lerp(fromRect.top, to.top, p) - arc * 4 * p * (1 - p)}px`,
          width: `${lerp(fromRect.width, to.width, p)}px`,
          height: `${lerp(fromRect.height, to.height, p)}px`,
        }),
        { ease: ease ?? easing("--ease-out") },
      )
    : [box(fromRect), box(to)];
  const animation = ghost.animate(frames, {
    duration: ms ?? duration("--dur-320", 320),
    easing: arc ? "linear" : ease ?? easing("--ease-out"),
    delay,
    fill: "backwards",
  });
  animation.lxGhost = ghost;
  return track(animation, () => {
    anchors.delete(ghost);
    ghost.remove();
    show();
  });
}

/**
 * Animates a layout change: records where each node is, runs `change` (which updates the DOM at once), then draws
 * each node that moved traveling from its old place (rule 2: by ghost if it's pressable).
 */
export function glide(nodes, change, options = {}) {
  const before = measure(nodes);
  change();
  glideFrom(before, options);
}

/** How each of `nodes` looks now, for glideFrom's options.looks, kept off the page until it's used: a ghost is copied from what's computed when it's made, so this has to be before the change. */
export const keepLooks = (nodes) =>
  new Map(
    motionOn()
      ? [...nodes].map((node) => {
          const look = makeGhost(node, node.getBoundingClientRect());
          look.remove();
          return [node, look];
        })
      : [],
  );

/** Where each of `nodes` is now, for glideFrom. */
export const measure = (nodes) => new Map([...nodes].map((node) => [node, node.getBoundingClientRect()]));

/** Draws what moved since `before` (measure): each node that's still here travels from where it was, all on one curve. */
export function glideFrom(before, options = {}) {
  if (!motionOn()) return;
  for (const [node, rect] of before) {
    if (!node.isConnected) continue;
    if (isInteractive(node)) fly(node, rect, options);
    else {
      const now = node.getBoundingClientRect();
      if (!now.width || !now.height) {
        // Gone from the layout (an instruction a tighter fit leaves out): it fades as it looked, the look kept before the change where
        // there's one (options.looks: a ghost made now has the tighter fit's styles, and its words wrapped anew in the old box: at 320,
        // "Which one is / it?" over the card below, 7 Nov). It goes with what was under it, on the same curve, so what closes up into its
        // room never meets it, whichever is drawn on top.
        if (options.size && rect.width && rect.height && !node.getClientRects().length) {
          const kept = options.looks?.get(node) ?? null;
          if (kept) {
            options.looks.delete(node);
            ghostLayer().append(kept);
          }
          const ghost = kept ?? makeGhost(node, rect);
          ghost.style.display = "block";
          const under = [...before].find(([other, was]) => other !== node && other.isConnected && other.getClientRects().length && was.top >= rect.bottom - 1);
          const shift = under ? under[0].getBoundingClientRect().top - under[1].top : 0;
          const ms = options.duration ?? duration("--dur-320", 320);
          ghost.animate([{ opacity: 1 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }], { duration: ms, easing: "linear", fill: "forwards" });
          track(ghost.animate([{ transform: "none" }, { transform: `translateY(${shift}px)` }], { duration: ms, easing: options.easing ?? easing("--ease-out"), fill: "forwards" }), () => ghost.remove());
        }
        continue;
      }
      const dx = rect.left - now.left;
      const dy = rect.top - now.top;
      // Its size too, where a tighter fit changed it (a smaller instruction): it shrinks into place rather than jumping.
      const sx = rect.width / now.width;
      const sy = rect.height / now.height;
      // (By one scale: a part that changed shape, its words wrapping differently, isn't squeezed into it.)
      const sized = options.size && rect.width && rect.height && (Math.abs(rect.width - now.width) > 1 || Math.abs(rect.height - now.height) > 1) && Math.abs(sx - sy) < 0.12;
      // Words that wrap differently now have no scale to take them there: the look they had (options.looks, keepLooks) stays up on its way to the new place while the new one comes up over it.
      const look = options.looks?.get(node);
      if (look && options.size && !sized && (Math.abs(rect.height - now.height) > 1 || Math.abs(rect.width - now.width) > 1)) {
        options.looks.delete(node);
        const ms = options.duration ?? duration("--dur-320", 320);
        const ease = options.easing ?? easing("--ease-out");
        ghostLayer().append(look);
        const going = look.animate([{ transform: "translate(0, 0)" }, { transform: `translate(${-dx}px, ${-dy}px)` }], { duration: ms, easing: ease, fill: "both" });
        look.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0, offset: 0.35 }, { opacity: 0, offset: 1 }], { duration: ms, fill: "both" });
        track(going, () => look.remove());
        animate(node, [{ transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px)` }, { transformOrigin: "0 0", transform: "translate(0, 0)" }], { duration: ms, easing: ease });
        animate(node, [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 1 }], { duration: ms, easing: "linear" });
        continue;
      }
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !sized) continue;
      animate(node, [{ transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px)${sized ? ` scale(${sx}, ${sy})` : ""}` }, { transformOrigin: "0 0", transform: "none" }], {
        duration: options.duration ?? duration("--dur-320", 320),
        easing: options.easing ?? easing("--ease-out"),
      });
    }
  }
}

/** Draws an icon's strokes on (a check being written, a cross struck). */
export function draw(svg, { delay = 0, duration: ms } = {}) {
  if (!motionOn() || !svg) return;
  for (const path of svg.querySelectorAll("path, circle")) {
    path.setAttribute("pathLength", "1");
    animate(path, [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], {
      duration: ms ?? duration("--dur-320", 320),
      easing: easing("--ease-out"),
      delay,
    });
  }
}

/** Counts a number up in a text node; finishing it (any press) shows the final number at once. */
export function countUp(node, to, { from = 0, format = (n) => String(Math.round(n)), duration: ms } = {}) {
  node.textContent = format(to);
  if (!motionOn()) return null;
  const total = ms ?? duration("--dur-640", 640);
  const start = performance.now();
  let frame = 0;
  let resolve;
  const ticker = {
    finished: new Promise((r) => (resolve = r)),
    finish() {
      cancelAnimationFrame(frame);
      node.textContent = format(to);
      resolve();
    },
    cancel() {
      this.finish();
    },
  };
  const tick = (now) => {
    const t = Math.min(1, (now - start) / total);
    const eased = 1 - (1 - t) ** 3;
    node.textContent = format(from + (to - from) * eased);
    if (t < 1) frame = requestAnimationFrame(tick);
    else ticker.finish();
  };
  node.textContent = format(from);
  frame = requestAnimationFrame(tick);
  return track(ticker);
}

/**
 * Puts a container's children into a new order and draws the change: each child slides from where it was. For
 * children nobody presses (the words of a literal line). The page holds the new order at once. `arc(child)` marks
 * children that arc off the line instead of gliding through the others: heading left they go over, heading right
 * under, so two crossing each other pass cleanly. `delay` holds the old picture first. `change()` runs once the old
 * places are measured and before the new order goes in, for a change that moves them too (a line turning right to left).
 */
export function reorder(container, nextChildren, { delay = 0, arc = () => false, change } = {}) {
  const before = new Map(nextChildren.map((child) => [child, child.getBoundingClientRect()]));
  change?.();
  container.append(...nextChildren);
  if (!motionOn() || !container.isConnected) return;
  const move = duration("--dur-640", 640);
  const total = delay + move;
  const start = delay / total;
  for (const child of nextChildren) {
    const from = before.get(child);
    const now = child.getBoundingClientRect();
    const dx = from.left - now.left;
    const dy = from.top - now.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    const size = Math.min(16, now.height * 0.7);
    const lift = arc(child) && Math.abs(dx) > 1 ? (dx > 0 ? size : -size) : 0;
    // One smooth move from where it was to where it is (over or under the line for a moved word), after the hold.
    const path = curveFrames((p) => ({ transform: `translate(${dx * (1 - p)}px, ${dy * (1 - p) - lift * 4 * p * (1 - p)}px)` }), { from: start });
    animate(child, start > 0 ? [{ transform: `translate(${dx}px, ${dy}px)`, offset: 0, easing: "linear" }, ...path] : path, { duration: total, easing: "linear" });
  }
}
