// Tinta's first frames, kept on this device. A page drawn before Tinta's drawing has loaded (character/character.js and its rig) would
// show Tinta's place empty and then Tinta a moment later. Instead, ui.character() puts in the very frame a Tinta of that kind draws first,
// kept here from an earlier start. When the drawing comes, the live Tinta takes over from that same frame (character.js), so nothing
// changes on the screen.
//
// - A kind is its state, its size, whether it has ground of its own, the theme's ink (light or dark), and moving or still (Animations Off,
//   or a still: its designed still). Its frame is its state's frame at the start of its own clock (the rig's frame(0, 0)).
// - Kept per build of the app (the ?v= its first script came with), the KEEP kinds seen last, in localStorage: read without the rig, at
//   once. A build that changed the rig never shows another build's frames.
// - The rig numbers its ids across the page; a kept frame's ids are written as tokens and made new each time it's put in, so it never
//   takes another drawing's gradient or clip.
// - Nothing here draws or decides anything: a missing, stale or unreadable kind is null, and Tinta fades in when it comes instead.

import { TOKENS } from "./ink-tokens.js";
import { motionOn } from "../lx/motion.js";

const KEY = "lx.tinta.firsts.v1";
const KEEP = 8;
const TOO_BIG = 64_000; // characters: a kind's frame bigger than this isn't kept (a still at full detail is ~45 K)
const MARK = "\u0001"; // around an id's token: never in the rig's markup (checked before it's kept)

/** Placeholders put in by first() (the svg elements), so character.js takes over only a real one, never one copied into a picture of the page. */
export const placed = new WeakSet();

/**
 * The theme's ink for Tinta, as a key: the light palette on a light theme (paper, sepia), the dark one otherwise, and the --tinta-*
 * tokens' text where a theme sets them (ink.js reads them into the palette itself). Just the scheme's name with none, as before.
 */
export const inkOf = () => {
  const style = getComputedStyle(document.documentElement);
  const scheme = style.colorScheme.includes("light") ? "light" : "dark";
  const set = Object.values(TOKENS).map((token) => style.getPropertyValue(token).trim());
  return set.some(Boolean) ? `${scheme}:${set.join(",")}` : scheme;
};

/** This build of the app: the ?v= its first script came with; null on a page without it (nothing is kept or read there). */
function build() {
  const src = document.querySelector('script[src*="/js/lx/theme-boot.js"]')?.getAttribute("src") ?? "";
  return /[?&]v=([^&#]+)/.exec(src)?.[1] ?? null;
}

let kept = null;
function load() {
  if (kept) return kept;
  const here = build();
  kept = { build: here, kinds: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved && saved.build === here && saved.kinds && typeof saved.kinds === "object") kept.kinds = saved.kinds;
  } catch {}
  return kept;
}

let saving = 0;
function save() {
  if (saving) return;
  // Once things have settled: never in the frame a page is drawn in.
  saving = setTimeout(() => {
    saving = 0;
    try {
      localStorage.setItem(KEY, JSON.stringify(kept));
    } catch {
      // Full, or private browsing: the frames last for this visit.
    }
  }, 2000);
}

/** A Tinta's kind: what decides its first frame. */
export function kindOf({ state, size, ground = true, still = false, ink = inkOf() }) {
  const moving = !still && motionOn();
  return `${state}|${Math.round(Number(size) || 72)}|${ground ? "ground" : "none"}|${ink}|${moving ? "moving" : "still"}`;
}

/** Whether a kind's first frame is kept for this build (and when it was seen last, now). */
export function hasFirst(kind) {
  const entry = load().kinds[kind];
  if (!entry) return false;
  // Seen again: it stays among the last KEEP kinds (written once a day at most per kind).
  if (Date.now() - entry.at > 86_400_000) {
    entry.at = Date.now();
    save();
  }
  return true;
}

/** Keeps a kind's first frame: `view` its viewBox, `svg` its markup as the rig drew it. */
export function keepFirst(kind, view, svg) {
  const state = load();
  if (!state.build || typeof svg !== "string" || svg.length > TOO_BIG || svg.includes(MARK)) return;
  const ids = [...new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))];
  let tokened = svg;
  ids.forEach((id, i) => {
    const safe = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    tokened = tokened.replace(new RegExp(`(id="|#)${safe}(?=["')])`, "g"), `$1${MARK}${i}${MARK}`);
  });
  state.kinds[kind] = { at: Date.now(), view: view.join(" "), svg: tokened };
  const kinds = Object.entries(state.kinds).sort((a, b) => b[1].at - a[1].at);
  state.kinds = Object.fromEntries(kinds.slice(0, KEEP));
  save();
}

let made = 0;
/** A kind's kept first frame as an svg element ready to go in a Tinta, its ids new; null if none is kept for this build. */
export function first(kind) {
  const entry = load().kinds[kind];
  if (!entry) return null;
  const prefix = `tf${made++}-`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("viewBox", entry.view);
  svg.innerHTML = entry.svg.replace(new RegExp(`${MARK}(\\d+)${MARK}`, "g"), (_, i) => `${prefix}${i}`);
  placed.add(svg);
  return svg;
}
