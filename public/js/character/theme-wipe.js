// A new theme spreading from under Tinta (lex-mascots, 2 Nov 2026: Settings → Appearance). The theme changes on the
// press, as it always has. The old one
// stays a moment as a picture over the screen that takes no presses, and a hole in it opens from under Tinta while it
// shakes itself, a wet edge of the old theme's ink running out ahead of the new one: the splat of the rig's
// splat/throw.js, contoured each frame. The picture is a copy of the app in a closed shadow root with the app's rules
// and the old theme's colors pinned on it (as shell/page-slide.js's pictures), so nothing that looks for a part in the
// page ever finds it: it's never a second copy of the page. A press finishes it (motion.registerTicker); with
// animations off, or with no Tinta on the screen, the theme just changes.
// The picture stays unseen until it's drawn in the app's own styles (5 Nov 2026, on an iPhone Simulator: a closed shadow root's adopted sheet
// can come a few frames late on WebKit, and for about 70 ms the copy showed unstyled, its links underlined and Tinta's drawing at its natural
// size, half the screen: "tinta becomes huge", the page jumping). The theme changes, and the wipe starts, the frame it's ready; not ready
// within a few frames, the theme just changes. Taps in a row: the press ends the wipe, and the theme it picks, and the next ones a
// moment apart, change in place.

import { motionOn, registerTicker } from "../lx/motion.js";
import { performCharacter } from "../lx/ui.js";
import { shake } from "./rig/splat/acts.js";
import { splatField } from "./rig/splat/throw.js";
import { contour, thin } from "./rig/splat/field.js";
import { smoothPath } from "./rig/kit/geom.js";
import { readInk } from "./ink.js";

const OPEN = 0.1; // the hole opens round Tinta in this long (with a little overshoot)
const START = 0.06; // and starts running out this long after the shake starts
const SPREAD = 0.68; // past the screen's corners in this long
const EDGE = 7; // the wet edge of the old theme's ink, px
const SVG = "http://www.w3.org/2000/svg";

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const outBack = (t, k = 2) => 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2;

// The app's rules, copied for pictures, with every custom property they name (the theme's colors among them).
let rules = { key: "", sheet: null, names: [] };
function appRules() {
  const lists = [...document.styleSheets].map((sheet) => {
    try {
      return sheet.cssRules;
    } catch {
      return null; // another origin's: none of the app's
    }
  });
  const key = lists.map((list) => list?.length ?? 0).join(",");
  if (rules.key !== key || !rules.sheet) {
    const texts = [];
    const names = new Set();
    const walk = (list) => {
      for (const rule of list) {
        if (rule.style) for (let i = 0; i < rule.style.length; i++) if (rule.style[i].startsWith("--")) names.add(rule.style[i]);
        if (rule.cssRules) walk(rule.cssRules);
      }
    };
    for (const list of lists) {
      if (!list) continue;
      for (const rule of list) texts.push(rule.cssText);
      walk(list);
    }
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(texts.join("\n"));
    rules = { key, sheet, names: [...names] };
  }
  return rules;
}

/** A picture of the app as it looks now, over the whole screen, taking no presses: see the top of this file. */
function pictureOfApp(tinta = null) {
  const app = document.querySelector('[data-part="app"]');
  if (!app) throw new Error("no app");
  const { sheet, names } = appRules();
  const shot = document.createElement("div");
  for (const name of ["data-theme-picture", "data-ghost", "inert"]) shot.setAttribute(name, "");
  shot.setAttribute("aria-hidden", "true");
  Object.assign(shot.style, { position: "fixed", inset: "0", margin: "0", zIndex: "60", pointerEvents: "none", overflow: "hidden" });
  // The old theme, pinned on the picture: every custom property at its value now, and the page's own color, type and
  // background layer (body and body::before), which the copy's rules can't reach from inside it.
  const root = getComputedStyle(document.documentElement);
  for (const name of names) {
    const value = root.getPropertyValue(name);
    if (value) shot.style.setProperty(name, value);
  }
  const body = getComputedStyle(document.body);
  Object.assign(shot.style, { colorScheme: root.colorScheme, backgroundColor: body.backgroundColor, color: body.color, font: body.font });
  const backdrop = document.createElement("div");
  const before = getComputedStyle(document.body, "::before");
  Object.assign(backdrop.style, { position: "absolute", inset: before.inset, backgroundImage: before.backgroundImage, backgroundSize: before.backgroundSize, backgroundPosition: before.backgroundPosition, backgroundRepeat: before.backgroundRepeat, filter: before.filter });
  const shadow = shot.attachShadow({ mode: "closed" });
  shadow.adoptedStyleSheets = [sheet];
  const copy = app.cloneNode(true);
  // Where things are scrolled to, by their place in the tree (set once the copy is laid out).
  const originals = [app, ...app.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  const scrolled = originals.flatMap((node, i) => (node.scrollTop || node.scrollLeft ? [[copies[i], node.scrollTop, node.scrollLeft]] : []));
  // (Not an SVG's own: its clips and outlines refer to them, and a drawing without them is a solid block.)
  for (const node of [copy, ...copy.querySelectorAll("[id]:not(svg *)")]) node.removeAttribute("id");
  for (const node of copy.querySelectorAll("[data-motion-hidden], [data-waiting]")) {
    node.removeAttribute("data-motion-hidden");
    node.removeAttribute("data-waiting");
  }
  // A Tinta in the picture is its drawing as it is now: a still, never a second live one. (The one wiping from, kept: its size says when the
  // picture is drawn in the app's styles.)
  const live = [...app.querySelectorAll("lx-tinta")];
  const copiesOfTinta = [...copy.querySelectorAll("lx-tinta")];
  const which = tinta ? live.indexOf(tinta) : -1;
  for (const [i, tinta] of copiesOfTinta.entries()) {
    const still = document.createElement("span");
    // Its style through the CSSOM (a style attribute is refused by the CSP): its size lives there.
    for (const { name, value } of tinta.attributes) if (name !== "style") still.setAttribute(name, value);
    still.style.cssText = tinta.style.cssText;
    still.innerHTML = tinta.innerHTML;
    tinta.replaceWith(still);
    if (i === which) shot.lxPairs = [[still, tinta]];
  }
  // And the page's title on the screen, with its copy (a tab's page that's kept is in the app too, not shown).
  const titles = [...app.querySelectorAll('[data-part="page-title"]')];
  const shown = titles.findIndex((title) => title.getClientRects().length && title.getBoundingClientRect().width > 0);
  if (shown >= 0) (shot.lxPairs ??= []).push([copy.querySelectorAll('[data-part="page-title"]')[shown], titles[shown]]);
  Object.assign(copy.style, { height: "100%", margin: "0" });
  shadow.append(backdrop, copy);
  document.body.append(shot);
  for (const [node, top, left] of scrolled) {
    node.scrollTop = top;
    node.scrollLeft = left;
  }
  return shot;
}

/** Loops as one SVG path (screen px; smoothPath takes y up, so y goes in negated and comes out as it was). */
const loopsPath = (loops, res) => loops.map((loop) => smoothPath(thin(loop, res * 0.5).map(([x, y]) => [x, -y]))).join("");

// A theme picked by a press that ended a wipe, or soon after one picked in place, changes in place: taps in a row change the theme each
// time, and only one wipe plays (never a new splat on every tap).
const IN_PLACE = 400;
let inPlaceUntil = -Infinity;

/** Whether the picture is drawn in the app's styles: its Tinta the size and place of the one on the page, its title where the page's is. */
function drawnInStyle(shot) {
  const near = (a, b) => Math.abs(a.left - b.left) < 2 && Math.abs(a.top - b.top) < 2 && Math.abs(a.width - b.width) < 2 && Math.abs(a.height - b.height) < 2;
  return (shot.lxPairs ?? []).every(([copy, real]) => !copy || !real.isConnected || near(copy.getBoundingClientRect(), real.getBoundingClientRect()));
}

/**
 * Changes the theme with apply(), which may return a promise (the theme changes when it settles: theme.useTheme), and
 * spreads the new theme from under `tinta` (an <lx-tinta> on the screen) as it shakes itself. Returns what apply()
 * returns (a promise of it once a wipe holds the change for its picture). apply()'s result null (the theme was already in use) or a
 * failure takes the picture away at once.
 */
/** Whether Tinta is where the wipe can start from: on the screen (a Tinta scrolled off it would open the new theme from nowhere). */
function onScreen(tinta) {
  const box = tinta.getBoundingClientRect();
  return box.width > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
}

export function wipeTheme(apply, tinta) {
  if (!motionOn() || !tinta?.isConnected || !onScreen(tinta)) return apply();
  if (performance.now() < inPlaceUntil) {
    inPlaceUntil = performance.now() + IN_PLACE;
    return apply();
  }
  const ink = readInk().body; // the old theme's (its tokens' or its scheme's own), read before it goes
  let shot = null;
  try {
    shot = pictureOfApp(tinta);
  } catch {
    shot = null;
  }
  if (!shot) return apply();
  // Unseen until it's drawn in the app's styles (see the top of this file).
  shot.style.opacity = "0";
  let edge = null;
  let raf = 0;
  let over = false;
  let applied = false;
  let settle;
  let fail;
  const out = new Promise((resolve, reject) => ((settle = resolve), (fail = reject)));
  const applyNow = () => {
    if (applied) return undefined;
    applied = true;
    try {
      const result = apply();
      Promise.resolve(result).then(settle, fail);
      return result;
    } catch (error) {
      fail(error);
      return null; // nothing changed: no wipe
    }
  };
  // Ended (a press, the wipe done, or never ready): the picture goes, and the theme is the new one.
  const finish = (pressed = false) => {
    if (over) return;
    over = true;
    if (pressed) inPlaceUntil = performance.now() + IN_PLACE;
    cancelAnimationFrame(raf);
    shot.remove();
    edge?.remove();
    applyNow();
  };
  const ticker = registerTicker(() => finish(true));
  if (!ticker) {
    finish();
    return out;
  }
  const stop = () => {
    ticker.end();
    finish();
  };
  let waited = 0;
  const ready = () => {
    raf = 0;
    if (over) return;
    if (!drawnInStyle(shot)) {
      // Never drawn in its styles: the theme just changes.
      if (++waited > 12) return stop();
      raf = requestAnimationFrame(ready);
      return;
    }
    shot.style.removeProperty("opacity");
    Promise.resolve(applyNow()).then((changed) => (changed === null ? stop() : begin()), stop);
  };
  raf = requestAnimationFrame(ready);

  // Anything that goes wrong while it plays ends it: the picture goes and the new theme is what's left (never the old one's picture
  // held over the new theme).
  function begin() {
    try {
      play();
    } catch {
      stop();
    }
  }
  function play() {
    if (over) return;
    if (!tinta.isConnected || !onScreen(tinta)) return stop();
    const box = tinta.getBoundingClientRect();
    const at = [box.left + box.width / 2, box.top + box.height * 0.55];
    const W = innerWidth;
    const H = innerHeight;
    // Its core is 0.72 of its radius: at the end it reaches past the farthest corner.
    const far = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - at[0], y - at[1]))) / 0.7 + 40;
    const R0 = box.height * 0.9;
    performCharacter(tinta, shake);
    edge = document.createElementNS(SVG, "svg");
    edge.setAttribute("aria-hidden", "true");
    edge.setAttribute("data-ghost", "");
    Object.assign(edge.style, { position: "fixed", inset: "0", width: "100%", height: "100%", zIndex: "61", pointerEvents: "none", overflow: "visible" });
    const ring = document.createElementNS(SVG, "path");
    ring.setAttribute("fill", ink);
    ring.setAttribute("fill-rule", "evenodd");
    edge.append(ring);
    document.body.append(edge);
    const t0 = performance.now();
    const frame = () => {
      try {
        step();
      } catch {
        stop();
      }
    };
    const step = () => {
      raf = 0;
      if (over) return;
      const s = (performance.now() - t0) / 1000;
      if (s >= START + SPREAD) return stop();
      const R = R0 * outBack(clamp01(s / OPEN)) + (far - R0) * inOut(clamp01((s - START) / SPREAD));
      const field = splatField(at, R, 71, 1, [0, 1]);
      // Only round the splat (its thrown dots reach about 1.9 of its radius), within the screen and a little past.
      const reach = 1.95 * R;
      const x0 = Math.max(-30, at[0] - reach), y0 = Math.max(-30, at[1] - reach), x1 = Math.min(W + 30, at[0] + reach), y1 = Math.min(H + 30, at[1] + reach);
      const res = Math.max(1.5, R / 30);
      // Nothing of the splat on the screen yet: the picture covers it all this frame.
      const seen = x1 > x0 + res && y1 > y0 + res;
      const outer = seen ? loopsPath(contour(field, x0, y0, x1, y1, res), res) : "";
      const inner = seen ? loopsPath(contour((q) => field(q) + EDGE, x0, y0, x1, y1, res), res) : "";
      shot.style.clipPath = `path(evenodd, "M-60,-60 H${W + 60} V${H + 60} H-60 Z ${outer}")`;
      ring.setAttribute("d", outer + inner);
      raf = requestAnimationFrame(frame);
    };
    frame();
  }
  return out;
}
