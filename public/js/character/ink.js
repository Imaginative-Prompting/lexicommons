// Tinta's ink, from the theme. Tinta is ink, so a theme may color it: these tokens, read off the page, become a palette object
// of the same shape as the rig's (rig/inkdrop/inkdrop.js PALETTES), which every drawing function takes in place of a name.
//
//   --tinta-ink         the body (the one a theme usually sets: every other is worked out from it, as below)
//   --tinta-ink-shade   its shade crescent, the drying ink of a splat
//   --tinta-ink-light   its highlight streak (also its tongue, and a lens's tint on a dark ground)
//   --tinta-ink-deep    a prop's inside or track (a box, a switch)
//   --tinta-ink-brow    its brows
//   --tinta-ink-gloss   the gloss on running ink
//
// With none set, the palette is the rig's own for the theme's scheme (dark or light), the very same object, so nothing changes
// until a theme sets one. With --tinta-ink alone, each other color keeps the offset it has from the body in that palette, in
// OKLCH (its lightness, its chroma's ratio, its hue), so every pose and act stays one ink; a token set beside it wins. The eyes,
// the mouth and a prop's paper, rim and grip keep their own colors. The splash keeps the default ink: it's iOS's launch image,
// which no theme can change (character/splash-run.js eases it into the theme's ink as it hands over to the app).
//
// The pure parts (deriveInk, the color math) load in Node with no DOM, for scripts/test-tinta-ink.mjs.

import { PALETTES } from "./rig/inkdrop/inkdrop.js";
import { TOKENS } from "./ink-tokens.js";

export { TOKENS };

// ---- color math: sRGB hex ↔ OKLCH (Björn Ottosson's OKLab) -----------------------------------------------------------
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** "#RRGGBB" → [L 0..1, C, h degrees]. */
export function hexToOklch(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

/** [L, C, h] → "#RRGGBB", each channel clipped into sRGB. */
export function oklchToHex([L, C, h]) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, c))))) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Two colors mixed in OKLCH (the shorter way round the hue), u 0..1 from a to b. */
export function mixHex(a, b, u) {
  if (u <= 0 || a === b) return a;
  if (u >= 1) return b;
  const [La, Ca, ha] = hexToOklch(a), [Lb, Cb, hb] = hexToOklch(b);
  const dh = ((hb - ha + 540) % 360) - 180;
  return oklchToHex([La + (Lb - La) * u, Ca + (Cb - Ca) * u, ha + dh * u]);
}

// ---- the palette from the tokens -------------------------------------------------------------------------------------
// Each derived color's offset from the body in each base palette, in OKLCH: today's palettes' own (so the body they have
// gives them back), applied to a theme's body.
const DERIVED = ["shade", "light", "deep", "brow", "gloss"];
const offsetsOf = (P) => {
  const [L, C, h] = hexToOklch(P.body);
  return Object.fromEntries(DERIVED.map((f) => {
    const [Lf, Cf, hf] = hexToOklch(P[f]);
    return [f, { dL: Lf - L, kC: C ? Cf / C : 1, dh: hf - h }];
  }));
};
const OFFSETS = { dark: offsetsOf(PALETTES.dark), light: offsetsOf(PALETTES.light) };
/** A scheme's offsets from the body ({ shade: { dL, kC, dh }, … }), for splash.css's own derivation (rig/splash/app-frames.mjs). */
export const inkOffsets = (scheme) => OFFSETS[scheme === "light" ? "light" : "dark"];

/** The rig's own palette for a scheme. */
export const defaultInk = (scheme) => PALETTES[scheme === "light" ? "light" : "dark"];

const fromBody = (body, o) => {
  const [L, C, h] = hexToOklch(body);
  return oklchToHex([Math.min(0.99, Math.max(0.02, L + o.dL)), C * o.kC, (h + o.dh + 360) % 360]);
};

/**
 * The palette for a scheme ("dark" or "light") with what a theme gave ({ body, shade, … } as "#RRGGBB"): the rig's own, the
 * same object, when it gave nothing; otherwise a copy with the theme's ink, each color it didn't give worked out from its body
 * (its tongue the light, its lens the light on a dark ground and the shade on a light one, as the rig's are). Its key names the
 * colors, for anything kept per drawing (character/firsts.js), and is the scheme's name when they're the rig's.
 */
export function deriveInk(scheme, given = {}) {
  const base = PALETTES[scheme === "light" ? "light" : "dark"];
  const name = scheme === "light" ? "light" : "dark";
  const set = Object.fromEntries(Object.entries(given).filter(([field, hex]) => field in TOKENS && /^#[0-9A-F]{6}$/.test(hex ?? "")));
  if (!Object.keys(set).length || Object.entries(set).every(([field, hex]) => base[field] === hex)) return base;
  const body = set.body ?? base.body;
  const ink = { ...base, body };
  for (const field of DERIVED) ink[field] = set[field] ?? (body === base.body ? base[field] : fromBody(body, OFFSETS[name][field]));
  ink.tongue = ink.light;
  ink.glass = name === "light" ? ink.shade : ink.light;
  ink.scheme = name;
  ink.key = `${name}:${["body", ...DERIVED].map((f) => ink[f]).join(",")}`;
  return ink;
}

/** A palette's key: its scheme's name for the rig's own, else the colors it carries. */
export const inkKey = (palette) => palette?.key ?? (palette === PALETTES.light ? "light" : "dark");

/** Two palettes mixed field by field in OKLCH (the splash easing from the default ink into a theme's). */
export function mixInk(a, b, u) {
  if (u <= 0 || a === b) return a;
  if (u >= 1) return b;
  const out = { ...a };
  for (const field of ["body", "shade", "light", "deep", "brow", "gloss", "tongue", "glass"]) out[field] = mixHex(a[field], b[field], u);
  out.key = `mix:${inkKey(a)}>${inkKey(b)}@${u.toFixed(3)}`;
  return out;
}

// ---- reading the page --------------------------------------------------------------------------------------------------
let probe = null;
/** Any CSS color the page can read → "#RRGGBB" (opaque), or null. The browser's own parser, through a 1 px canvas. */
function cssHex(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return `#${hex[1].toUpperCase()}`;
  try {
    probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    probe.fillStyle = "#010203";
    probe.fillStyle = value;
    if (probe.fillStyle === "#010203" && !/^#010203$/i.test(value)) return null; // not a color
    probe.clearRect(0, 0, 1, 1);
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
    if (!a) return null;
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  } catch {
    return null;
  }
}

const seen = new Map(); // a token's text → its hex, so a redraw reads nothing it has read before

/** Tinta's palette now: the theme's scheme (its color-scheme) and its --tinta-* tokens. */
export function readInk(root = document.documentElement) {
  const style = getComputedStyle(root);
  const scheme = style.colorScheme.includes("light") ? "light" : "dark";
  const given = {};
  for (const [field, token] of Object.entries(TOKENS)) {
    const text = style.getPropertyValue(token).trim();
    if (!text) continue;
    if (!seen.has(text)) seen.set(text, cssHex(text));
    const hex = seen.get(text);
    if (hex) given[field] = hex;
  }
  return deriveInk(scheme, given);
}

/**
 * Puts the ink in use on <html> for what CSS draws as the splash hands over to the app (splash.css: the first frame's drop easing
 * from the default ink, --tinta-was-<field>, into the theme's, --tinta-now-<field>, as it fades), with data-tinta-themed: only
 * while a theme colors Tinta.
 */
export function publishInk(ink, root = document.documentElement) {
  const themed = ink !== PALETTES.dark && ink !== PALETTES.light;
  const was = PALETTES[ink.scheme === "light" ? "light" : "dark"];
  root.toggleAttribute("data-tinta-themed", themed);
  for (const field of ["body", "shade", "light", "brow", "deep", "tongue", "glass"]) {
    if (themed) {
      root.style.setProperty(`--tinta-now-${field}`, ink[field]);
      root.style.setProperty(`--tinta-was-${field}`, was[field]);
    } else {
      root.style.removeProperty(`--tinta-now-${field}`);
      root.style.removeProperty(`--tinta-was-${field}`);
    }
  }
}
