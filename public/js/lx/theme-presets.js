// Ready-made themes beyond the four built in (look-rules.js BUILT_IN_THEMES): general ones, one for a language's own motif, and one from
// each language's flag. Each is a short palette (light or dark, a canvas, an ink, an accent or two, sometimes a typeface), and every token
// a theme sets is worked out from it here, by one rule, with each color moved in lightness (its hue kept) until it reads: text at 4.5:1
// at least, the main ink at 7:1, the way forward and the tab you're on at 3:1 against what's around them. Right and wrong keep the
// built-in themes' blue and orange (told apart in every kind of color blindness, and never by color alone: the app marks them too).
// Pure: the app, its tests and the flag tool (scripts/build-flag-themes.mjs) all run it.

// As a namespace: the flag tool (build-flag-themes.mjs) imports this module to write theme-flags.js, so a palette it hasn't written yet is
// simply missing (worked out here instead), never an import that fails.
import * as FLAG_DATA from "./theme-flags.js";
const { FLAG_COLORS } = FLAG_DATA;
// The same for the motif tool (build-motif-themes.mjs): a scene whose cut it hasn't measured yet is shown whole.
import * as MOTIF_DATA from "./theme-motifs.js";

// ---------- color ----------

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}
export const rgbToHex = (rgb) => `#${rgb.map((c) => Math.round(clamp(c) * 255).toString(16).padStart(2, "0")).join("")}`;
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
/** WCAG relative luminance of an sRGB color (0–1 channels). */
export const luminance = (rgb) => {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast between two colors (hex or rgb). */
export function contrast(a, b) {
  const [la, lb] = [a, b].map((c) => luminance(typeof c === "string" ? hexToRgb(c) : c));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** OKLab from sRGB, and back (Björn Ottosson's). */
export function toOklab(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(toGamma);
}
const inGamut = (rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);
/** A color at OKLab lightness L with its hue, its chroma lowered only as far as sRGB needs. */
function atLightness(hex, L) {
  const [, a, b] = toOklab(hexToRgb(hex));
  for (let k = 1; k >= 0; k -= 0.02) {
    const rgb = fromOklab([L, a * k, b * k]);
    if (inGamut(rgb)) return rgbToHex(rgb);
  }
  return rgbToHex(fromOklab([L, 0, 0]));
}
export const lightnessOf = (hex) => toOklab(hexToRgb(hex))[0];
/** A color's OKLCh: [L, C, h (degrees)]. */
export function lchOf(hex) {
  const [L, a, b] = toOklab(hexToRgb(hex));
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}
/** The same color turned `degrees` around OKLCh's hue (its lightness kept; its chroma eased in until it's a color a screen shows). */
function turned(hex, degrees) {
  const [L, C, h] = lchOf(hex);
  const r = ((h + degrees) * Math.PI) / 180;
  for (let k = 1; k >= 0; k -= 0.02) {
    const rgb = fromOklab([L, C * k * Math.cos(r), C * k * Math.sin(r)]);
    if (inGamut(rgb)) return rgbToHex(rgb);
  }
  return rgbToHex(fromOklab([L, 0, 0]));
}
/** How far apart two colors look to normal color vision (OKLab distance). */
export const distance = (x, y) => Math.hypot(...toOklab(hexToRgb(x)).map((v, i) => v - toOklab(hexToRgb(y))[i]));
// A saturated red (OKLCh chroma at least RED_CHROMA, its hue red's): a way forward in it takes white words, as a red button does.
const RED_CHROMA = 0.16;
export const saturatedRed = (hex) => {
  const [, C, h] = lchOf(hex);
  return C >= RED_CHROMA && (h <= 40 || h >= 345);
};
// Wrong is at least WRONG_FROM_GO from the way forward (OKLab, normal vision): about five just-noticeable steps (OKLab's is about 0.02), and the
// same order as right and wrong's MIN_APART under color blindness (0.12). Every theme's median is 0.185; under 0.10 sat the warm and red ones whose
// wrong answer and its Continue were one orange (7 Nov).
export const WRONG_FROM_GO = 0.1;
const WRONG_TURN_MOST = 90; // degrees wrong may turn toward red and rose
/** Two colors mixed in OKLab, t of the second. */
export function mix(a, b, t) {
  const [x, y] = [a, b].map((c) => toOklab(hexToRgb(c)));
  return rgbToHex(fromOklab(x.map((v, i) => v + (y[i] - v) * t)));
}
/** A color with alpha over another, as the eye sees it. */
// What a meaning color (right, wrong, slipping) is fitted to on its grounds: 4.5:1 with room for how a browser renders it (meaning() in tokens).
const MEANING_MIN = 4.6;
export const over = (hex, alpha, under) => rgbToHex(hexToRgb(hex).map((c, i) => c * alpha + hexToRgb(under)[i] * (1 - alpha)));
const rgba = (hex, alpha) => `rgba(${hexToRgb(hex).map((c) => Math.round(c * 255)).join(", ")}, ${alpha})`;

/**
 * A color moved in lightness (its hue kept) until it reads at `ratio` against every color in `against`: lighter on a dark ground, darker
 * on a light one. Left as it is when it already reads.
 */
export function fit(hex, against, ratio, { dark = lightnessOf(against[0]) < 0.6 } = {}) {
  const reads = (c) => against.every((g) => contrast(c, g) >= ratio);
  if (reads(hex)) return hex;
  let L = lightnessOf(hex);
  for (let i = 0; i < 120; i++) {
    L = clamp(L + (dark ? 0.01 : -0.01));
    const c = atLightness(hex, L);
    if (reads(c)) return c;
  }
  return dark ? "#ffffff" : "#000000";
}

// Color vision, simulated (Machado, Oliveira and Fernandes 2009, severity 1): right and wrong must stay apart in each.
const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
export function seenAs(hex, kind) {
  const lin = hexToRgb(hex).map(toLinear);
  return rgbToHex(CVD[kind].map((row) => toGamma(clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]))));
}
/** How far apart two colors look (OKLab distance), to a person with each kind of color blindness, and the least of those. */
export function apartFor(a, b) {
  const d = (x, y) => Math.hypot(...toOklab(hexToRgb(x)).map((v, i) => v - toOklab(hexToRgb(y))[i]));
  return Math.min(d(a, b), ...Object.keys(CVD).map((kind) => d(seenAs(a, kind), seenAs(b, kind))));
}

// ---------- a palette's tokens ----------

// The meaning colors of the built-in themes, which every theme keeps (only their lightness moves, to read on its canvas).
const MEANING = {
  dark: { right: "#5ab0f0", wrong: "#ff6e40", slipping: "#f2d25c", moved: "#d98cc0" },
  light: { right: "#0b6fb3", wrong: "#c2410c", slipping: "#7a5a00", moved: "#9a3f80" },
};
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const MONO = '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace';
export const TYPEFACES = { serif: SERIF, mono: MONO };

/**
 * Every token a theme sets, from its palette: { scheme "dark" | "light", canvas, ink, accent (the way forward), accent2 (the tab you're
 * on, highlights; the accent when it has none), chrome (the bar's own color; worked out when it has none), type ("serif" | "mono": its
 * headings and reading, and for mono its interface too), backdrop (backdropCss) }. The base it sits on is Graphite for dark and Paper for
 * light, which sets everything else (the bar's glass, color-scheme).
 */
// The surfaces and the main ink, which every other token grows from (themeTokens, standInTokens: one rule for both).
function groundsOf(p) {
  const dark = p.scheme === "dark";
  const canvas = p.canvas;
  const chrome = p.chrome ?? mix(canvas, p.ink, dark ? 0.045 : 0.03);
  const well = mix(canvas, p.ink, dark ? 0.075 : 0.045);
  const fillBase = mix(canvas, p.ink, dark ? 0.12 : 0.02);
  const surfaces = [canvas, chrome, well, over(fillBase, dark ? 0.88 : 0.94, canvas)];
  const grounds = [...surfaces, ...backdropGrounds(p.backdrop, canvas)];
  const ink1 = fit(p.ink, grounds, 7);
  const edgeInk = dark ? mix(ink1, canvas, 0.08) : mix(ink1, canvas, 0.1);
  return { dark, canvas, chrome, well, fillBase, surfaces, grounds, ink1, edgeInk };
}
// A theme's backdrop as tokens, as it's drawn.
function backdropTokens(p, canvas) {
  if (p.backdrop?.length) return { "--image-background": backdropCss(p.backdrop, canvas), "--image-background-dim": "0%", "--image-background-size": "auto", "--image-background-repeat": "repeat", "--image-background-position": "0 0" };
  return {};
}

/** What a theme's tile draws until its picture is here (appearance.js homeSwatch): its canvas, its hairline and its backdrop, the same
 * values themeTokens gives, worked out with one fitted ink instead of them all (a page of 70 flags opens on these). */
export function standInTokens(p) {
  const { dark, canvas, edgeInk } = groundsOf(p);
  return { "--canvas": canvas, "--hair": rgba(edgeInk, dark ? 0.09 : 0.08), ...backdropTokens(p, canvas) };
}

export function themeTokens(p) {
  const { dark, canvas, chrome, well, fillBase, surfaces, grounds, ink1, edgeInk } = groundsOf(p);
  const meaningGrounds = [...surfaces, ...backdropGrounds(p.backdrop, canvas, { points: false })];
  const ink2 = fit(mix(ink1, canvas, 0.36), grounds, 4.6);
  const ink3 = fit(mix(ink1, canvas, 0.5), [canvas, chrome], 4.6);
  const ink4 = mix(ink1, canvas, 0.66);
  const solid = dark ? mix(ink1, "#ffffff", 0.35) : mix(ink1, "#000000", 0.2);
  const onSolid = fit(dark ? mix(canvas, "#000000", 0.4) : mix(canvas, "#ffffff", 0.5), [solid], 7);
  // The way forward: its own color, its words white or the canvas's darkest, whichever reads; it stands out from the canvas at 3:1.
  let go = fit(p.accent, [canvas], 3);
  // A saturated red, deepened (its hue kept) until white reads on it at 4.5:1, as a red button looks; never near-black words on it (7 Nov, the
  // director: Albania's, Croatia's, Germany's and Taiwan's pure red with near-black labels read as harsh). The flag itself stays exact where it's drawn.
  if (saturatedRed(go) && contrast("#ffffff", go) < 4.5) {
    const deeper = fit(go, ["#ffffff"], 4.5, { dark: false });
    if (contrast(deeper, canvas) >= 3) go = deeper;
  }
  const onGoLight = contrast("#ffffff", go) >= 4.5;
  const onGo = onGoLight ? "#ffffff" : fit(mix(canvas, "#000000", 0.6), [go], 4.5, { dark: false });
  if (contrast(onGo, go) < 4.5) go = fit(go, [onGo], 4.5, { dark: lightnessOf(onGo) < 0.5 });
  const goDeep = atLightness(go, clamp(lightnessOf(go) - 0.14));
  const accent2 = p.accent2 ?? p.accent;
  const tabOn = fit(accent2, [chrome, mix(chrome, accent2, dark ? 0.18 : 0.1)], 4.5);
  const m = MEANING[dark ? "dark" : "light"];
  // A meaning color reads on its own tint as well (the tint is the color itself, faint, over the canvas): fitted until both hold, to MEANING_MIN,
  // not 4.5 itself. A browser composites the tint in 8 bits and WCAG's own constant reads a hair under this file's sRGB one: three flag themes'
  // right answers, fitted to 4.502, rendered 4.49:1 on their fill (7 Nov, the real-app sweep of every theme).
  const meaning = (hex, alpha) => {
    let c = fit(hex, meaningGrounds, MEANING_MIN);
    for (let i = 0; i < 4 && contrast(c, over(c, alpha, canvas)) < MEANING_MIN; i++) c = fit(c, [...meaningGrounds, over(c, alpha, canvas)], MEANING_MIN + 0.05);
    return c;
  };
  const right = meaning(m.right, dark ? 0.14 : 0.09);
  // Wrong stands apart from the way forward: a wrong answer's panel and its Continue are never one color (7 Nov, the director: in the warm themes
  // they blurred "you were wrong" with "go on"). The least change that does it: a turn of hue in steps of 5 degrees, toward red and rose first
  // (from an orange way forward), else toward orange; a step of lightness (0.04 deeper on a light canvas, brighter on a dark one) costs as much as
  // 15 degrees, so hue moves first and lightness helps only where hue alone can't (a red way forward: rose nears right's blue to color-blind eyes,
  // orange nears slipping). Each refitted to its
  // grounds, until it's WRONG_FROM_GO from --go, still MIN_APART from right in each kind of color blindness, and WRONG_FROM_GO from slipping.
  const wrongAlpha = dark ? 0.14 : 0.08;
  const slippingAt = fit(m.slipping, meaningGrounds, MEANING_MIN);
  const wrongReads = (c) => distance(c, go) >= WRONG_FROM_GO && apartFor(right, c) >= 0.12 && distance(c, slippingAt) >= WRONG_FROM_GO;
  let wrong = meaning(m.wrong, wrongAlpha);
  if (distance(wrong, go) < WRONG_FROM_GO) {
    const tries = [];
    for (let turn = 0; turn <= WRONG_TURN_MOST; turn += 5)
      for (let deeper = 0; deeper <= 3; deeper++) for (const sign of turn ? [-1, 1] : [1]) tries.push({ turn: sign * turn, deeper, cost: turn / 5 + 3 * deeper });
    tries.sort((a, b) => a.cost - b.cost || a.deeper - b.deeper || a.turn - b.turn);
    for (const { turn, deeper } of tries) {
      const base = turned(m.wrong, turn);
      const c = meaning(deeper ? atLightness(base, clamp(lightnessOf(base) + (dark ? 0.04 : -0.04) * deeper)) : base, wrongAlpha);
      if (wrongReads(c)) {
        wrong = c;
        break;
      }
    }
  }
  const slipping = slippingAt;
  const movedLine = fit(m.moved, [canvas], 3);
  const highlightMark = fit(accent2, [canvas], 3);
  const tokens = {
    "--canvas": canvas,
    "--chrome": chrome,
    "--well": well,
    "--fill": rgba(fillBase, dark ? 0.88 : 0.94),
    "--fill-hover": rgba(mix(canvas, p.ink, dark ? 0.18 : 0.07), dark ? 0.92 : 0.96),
    "--fill-active": rgba(mix(canvas, p.ink, dark ? 0.24 : 0.11), dark ? 0.92 : 0.96),
    "--hair": rgba(edgeInk, dark ? 0.09 : 0.08),
    "--edge": rgba(edgeInk, 0.14),
    "--edge-strong": rgba(edgeInk, 0.26),
    "--ink-1": ink1,
    "--ink-2": ink2,
    "--ink-3": ink3,
    "--ink-4": ink4,
    "--solid": solid,
    "--solid-hover": mix(solid, canvas, 0.14),
    "--on-solid": onSolid,
    "--ring": rgba(solid, dark ? 0.6 : 0.5),
    "--selection": rgba(solid, dark ? 0.18 : 0.12),
    "--highlight": rgba(highlightMark, dark ? 0.18 : 0.16),
    "--highlight-edge": rgba(highlightMark, dark ? 0.5 : 0.45),
    "--highlight-mark": highlightMark,
    "--backdrop": dark ? "rgba(0, 0, 0, 0.62)" : rgba(mix(ink1, "#000000", 0.4), 0.32),
    "--go": go,
    "--go-deep": goDeep,
    "--on-go": onGo,
    "--bar-edge": dark ? "rgba(255, 255, 255, 0.13)" : "rgba(255, 255, 255, 0.7)",
    "--tab-on": tabOn,
    "--tab-bubble-edge": rgba(tabOn, dark ? 0.28 : 0.2),
    "--m-right": right,
    "--m-right-bg": rgba(right, dark ? 0.14 : 0.09),
    "--m-right-edge": rgba(right, dark ? 0.42 : 0.36),
    "--m-wrong": wrong,
    "--m-wrong-bg": rgba(wrong, dark ? 0.14 : 0.08),
    "--m-wrong-edge": rgba(wrong, dark ? 0.45 : 0.36),
    "--m-slipping": slipping,
    "--m-slipping-bg": rgba(slipping, dark ? 0.13 : 0.16),
    "--m-slipping-edge": rgba(slipping, dark ? 0.4 : 0.45),
    "--m-new-bg": rgba(ink1, dark ? 0.08 : 0.06),
    "--m-new-edge": rgba(ink1, 0.34),
    "--m-hint-edge": rgba(edgeInk, 0.34),
    "--m-moved-mark": rgba(mix(canvas, m.moved, dark ? 0.45 : 0.25), 0.85),
    "--m-moved-line": movedLine,
    "--strength-0": rgba(edgeInk, 0.08),
    "--strength-1": rgba(edgeInk, 0.22),
    "--strength-2": rgba(edgeInk, 0.42),
    "--strength-3": rgba(edgeInk, 0.66),
    "--strength-4": ink1,
  };
  // Tinta's ink (character/ink.js works out his shade, light and the rest from it): the theme's own accent (a flag's its boldest color) as
  // near as it reads, unless that takes it far from itself (a yellow that would go mustard for his eyes): then whichever of its two accents
  // stays nearest itself (Brazil's green, Ukraine's blue).
  const ink = tintaOf(p, canvas);
  if (ink) {
    tokens["--tinta-ink"] = ink;
    // Progress in the interface in his ink's hue (know.css): as near his ink as reads on every ground it's drawn beside.
    const progress = progressInk(ink, progressGrounds(canvas, edgeInk, ink1));
    if (progress) tokens["--progress-ink"] = progress;
  }
  Object.assign(tokens, backdropTokens(p, canvas), sceneTokens(p));
  if (p.type === "serif") Object.assign(tokens, { "--type-head": SERIF, "--type-read": SERIF });
  if (p.type === "mono") Object.assign(tokens, { "--type-head": MONO, "--type-ui": MONO, "--type-read": MONO });
  return tokens;
}

/**
 * What Tinta's ink must read at: his edge 3:1 on the canvas, his white eyes (a studied day's check too) 3:1 against him, and his lightness inside
 * room for the shade below it and the shine above it that character/ink.js works out from it (a black ink had neither: no shine, and a session's
 * step you're on drew as black as the ones done). A progress bar has no eyes but sits on more grounds: it takes progressInk, below.
 */
export const TINTA_READS = { edge: 3, eyes: 3, room: [0.3, 0.85] };
// What a fitter aims past each ratio: the browser composites a faint ground in 8-bit color, and a color fitted to exactly 3:1 read 2.999 there.
const MARGIN = 0.05;
export const tintaReads = (ink, canvas) => {
  const L = lightnessOf(ink);
  return L >= TINTA_READS.room[0] && L <= TINTA_READS.room[1] && contrast(ink, canvas) >= TINTA_READS.edge + MARGIN && contrast("#ffffff", ink) >= TINTA_READS.eyes + MARGIN;
};
// A color's hue at the nearest lightness (from its own, outward) where reads(color) holds, or null.
function nearestThatReads(hex, reads) {
  if (reads(hex)) return hex;
  const L0 = lightnessOf(hex);
  for (let d = 0.005; d <= 1; d += 0.005)
    for (const L of [L0 - d, L0 + d]) {
      if (L <= 0 || L >= 1) continue;
      const c = atLightness(hex, L);
      if (reads(c)) return c;
    }
  return null;
}

/**
 * Progress in the interface in the theme's ink (know.css: the week's bars, the hundreds, the days of growth, a session's steps): his ink's hue at
 * the nearest lightness that's a non-text part's 3:1 on every ground it's drawn on or beside: the canvas, a session's step to come (so a step done
 * is told from one to come by lightness, not hue alone) and the line a hundred's bar fills (so how far it's filled reads).
 */
export const PROGRESS_READS = 3;
/** Those grounds in a theme: its canvas, a step to come (--strength-0 over it) and the line (tokens.css --line: the ink at 14% over it). */
export const progressGrounds = (canvas, edgeInk, ink1) => [canvas, over(edgeInk, 0.08, canvas), over(ink1, 0.14, canvas)];
export const progressReads = (color, grounds) => grounds.every((g) => contrast(color, g) >= PROGRESS_READS + MARGIN);
export const progressInk = (ink, grounds) => nearestThatReads(ink, (c) => progressReads(c, grounds));

/**
 * Tinta's ink from a color (he's ink, so any color of the theme's will do): the color itself where it reads (tintaReads), else its hue at
 * the nearest lightness that does. On a dark canvas that's a band, light enough for his edge and dark enough for his eyes; on a light one,
 * dark enough for both. null if no lightness reads (no ready-made theme's canvas is that mid gray: the theme test holds every one).
 */
export const tintaInk = (hex, canvas) => nearestThatReads(hex, (c) => tintaReads(c, canvas));

// How far an ink moved from the color it came from, in lightness; more than this and the theme's other accent is tried.
const TINTA_NEAR = 0.1;
export function tintaOf(p, canvas) {
  const sources = [...new Set([p.tinta ?? p.accent, p.accent2].filter(Boolean))];
  const fitted = sources.map((hex) => ({ hex, ink: tintaInk(hex, canvas) })).filter((f) => f.ink).map((f) => ({ ...f, moved: Math.abs(lightnessOf(f.ink) - lightnessOf(f.hex)) }));
  if (!fitted.length) return null;
  if (fitted[0].hex === sources[0] && fitted[0].moved <= TINTA_NEAR) return fitted[0].ink;
  return fitted.sort((a, b) => a.moved - b.moved)[0].ink;
}

/**
 * What each theme must read at (the theme test holds every one to these): [what, foreground, background, ratio]. Colors with alpha are
 * taken over the canvas, as they show.
 */
export function contrastPairs(tokens, theme = null) {
  if (theme?.backdrop?.length) tokens = { ...tokens, grounds: backdropGrounds(theme.backdrop, tokens["--canvas"]) };
  const t = tokens;
  const solidOf = (value) => {
    const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(value);
    return m ? over(rgbToHex([m[1], m[2], m[3]].map((v) => Number(v) / 255)), Number(m[4]), t["--canvas"]) : value;
  };
  const fill = solidOf(t["--fill"]);
  return [
    ["the main ink on the canvas", t["--ink-1"], t["--canvas"], 7],
    ["the main ink on a field", t["--ink-1"], fill, 4.5],
    ["labels on the canvas", t["--ink-2"], t["--canvas"], 4.5],
    ["labels on a well", t["--ink-2"], t["--well"], 4.5],
    ["labels on a field", t["--ink-2"], fill, 4.5],
    ["quiet text on the canvas", t["--ink-3"], t["--canvas"], 4.5],
    ["a solid button's words", t["--on-solid"], t["--solid"], 4.5],
    ["the way forward's words", t["--on-go"], t["--go"], 4.5],
    ["the way forward on the canvas", t["--go"], t["--canvas"], 3],
    ["the tab you're on", t["--tab-on"], t["--chrome"], 4.5],
    ["right", t["--m-right"], t["--canvas"], 4.5],
    ["wrong", t["--m-wrong"], t["--canvas"], 4.5],
    ["slipping", t["--m-slipping"], t["--canvas"], 4.5],
    ["right on its tint", t["--m-right"], solidOf(t["--m-right-bg"]), 4.5],
    ["wrong on its tint", t["--m-wrong"], solidOf(t["--m-wrong-bg"]), 4.5],
    ["the focus ring", solidOf(t["--ring"]), t["--canvas"], 3],
    ["a highlight's mark", t["--highlight-mark"], t["--canvas"], 3],
    ...(t.grounds ?? []).flatMap((ground, i) => [
      [`the main ink on the backdrop (${i})`, t["--ink-1"], ground, 4.5],
      [`labels on the backdrop (${i})`, t["--ink-2"], ground, 4.5],
    ]),
  ];
}

// ---------- a motif's scene ----------

/** Where a motif's picture is served (public/themes/motifs/<id>.webp: 1290 × 2796, drawn for a phone held upright, its top its canvas). */
export const motifPicture = (id) => `/themes/motifs/${id}.webp`;
export const PICTURE_SIZE = [1290, 2796];
/** A palette's scene (its picture's id), or null. */
export const sceneOf = (p) => p?.scene ?? null;
/**
 * A scene as tokens. A motif theme's picture isn't behind the page (every word sits on the plain canvas): its scene, cut from it below a row
 * with no art (theme-motifs.js MOTIF_SCENES), comes after the page's content, the screen's width, its own bottom edge its foot, the content
 * never over it (components.css .lx-view::after). On a page shorter than the screen it takes the screen's foot, above the tab bar. --scene-ratio
 * holds its box from the first frame; --scene-content turns it on. As tokens, not attributes on <html>, so a slide's picture of a page (a copy in
 * its own shadow root, shell/page-slide.js) has it too.
 */
export function sceneTokens(p) {
  const id = sceneOf(p);
  if (!id) return {};
  const from = MOTIF_DATA.MOTIF_SCENES?.[id]?.from ?? 0;
  const [w, h] = PICTURE_SIZE;
  return { "--scene": `url("${motifPicture(id)}")`, "--scene-ratio": `${w} / ${Math.round(h * (1 - from))}`, "--scene-content": '""', "--scene-grow": "1" };
}

// ---------- a theme's backdrop ----------

/**
 * A theme's own background, drawn in CSS on the page's background layer (base.css body::before), as data: layers, the first on top.
 *   ["glow", color, alpha, x%, y%, reach%]   a soft light (a moon, a sun, embers)
 *   ["sky", color, until%]                    the top of the page in a color, fading to the canvas
 *   ["lines", color, alpha, every px, angle]  ruled lines (a page, a screen's scanlines)
 *   ["grid", color, alpha, every px]          a drafting grid
 *   ["stars", alpha, count]                   a few points of light, the same every time
 * backdropCss gives its CSS; backdropGrounds, the colors text may sit on, for the contrast test.
 */
export function backdropCss(layers = [], canvas) {
  const out = [];
  for (const layer of layers) {
    const [kind] = layer;
    if (kind === "glow") {
      const [, color, alpha, x, y, reach] = layer;
      out.push(`radial-gradient(circle at ${x}% ${y}%, ${rgba(color, alpha)}, transparent ${reach}%)`);
    } else if (kind === "sky") {
      const [, color, until] = layer;
      out.push(`linear-gradient(180deg, ${color} 0%, ${rgba(color, 0)} ${until}%)`);
    } else if (kind === "lines") {
      const [, color, alpha, every, angle] = layer;
      out.push(`repeating-linear-gradient(${angle}deg, ${rgba(color, alpha)} 0 1px, transparent 1px ${every}px)`);
    } else if (kind === "grid") {
      const [, color, alpha, every] = layer;
      for (const angle of [0, 90]) out.push(`repeating-linear-gradient(${angle}deg, ${rgba(color, alpha)} 0 1px, transparent 1px ${every}px)`);
    } else if (kind === "stars") {
      const [, alpha, count] = layer;
      let seed = 7;
      const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < count; i++) out.push(`radial-gradient(1.5px 1.5px at ${(next() * 100).toFixed(1)}% ${(next() * 60).toFixed(1)}%, ${rgba("#ffffff", alpha)}, transparent)`);
    }
  }
  return out.join(", ");
}
export function backdropGrounds(layers = [], canvas, { points = true } = {}) {
  const grounds = [canvas];
  let top = canvas;
  for (const layer of [...layers].reverse()) {
    const [kind] = layer;
    if (kind === "sky") top = layer[1];
  }
  grounds.push(top);
  for (const layer of layers) {
    const [kind] = layer;
    if (kind === "glow") grounds.push(over(layer[1], layer[2], top), over(layer[1], layer[2], canvas));
    if (kind === "lines" || kind === "grid") grounds.push(over(layer[1], layer[2], top));
    // A star is a point, under a letter at most: the page's inks read on one, though a right or wrong answer never sits on it.
    if (kind === "stars" && points) grounds.push(over("#ffffff", layer[1], top));
  }
  return [...new Set(grounds)];
}

// ---------- the themes ----------

/** The general themes: each its own idea. */
export const GENERAL = [
  { id: "night-forest", name: "Night forest", about: "Pine dark, pale lichen, a firefly's glow under the moon", scheme: "dark", canvas: "#0e1f15", ink: "#e3ecdf", accent: "#c9e05a", accent2: "#8fd19e",
    backdrop: [["glow", "#e6f0da", 0.07, 84, 4, 28], ["stars", 0.26, 10], ["sky", "#153022", 50]] },
  { id: "desert-dawn", name: "Desert dawn", about: "Pale sand at first light, umber, a coral sun coming up", scheme: "light", canvas: "#f7ecdc", ink: "#3a2617", accent: "#d9572f", accent2: "#b9466d",
    backdrop: [["glow", "#ff9a5e", 0.32, 84, 0, 42], ["sky", "#fbdcc2", 42]] },
  { id: "ocean", name: "Ocean", about: "Light from the surface going down into the deep", scheme: "dark", canvas: "#06202f", ink: "#dff1f4", accent: "#2fc1d6", accent2: "#ff8a73",
    backdrop: [["lines", "#bfe9f2", 0.035, 52, 104], ["sky", "#0e4660", 58]] },
  { id: "slate", name: "Slate", about: "Cool gray stone, split clean, and a steel blue", scheme: "dark", canvas: "#1c2126", ink: "#e5e8ec", accent: "#6f9ccf", accent2: "#a9bfd8",
    backdrop: [["lines", "#e5e8ec", 0.022, 5, 33], ["glow", "#6f9ccf", 0.1, 15, 0, 45]] },
  { id: "mint-paper", name: "Mint paper", about: "A cool green notebook page, ink like a fountain pen's", scheme: "light", canvas: "#edf6f0", ink: "#14302a", accent: "#1d8762", accent2: "#2f6f8f",
    backdrop: [["lines", "#1d8762", 0.075, 32, 0]] },
  { id: "espresso", name: "Espresso", about: "Dark roast with its crema on top, caramel", scheme: "dark", canvas: "#1f140d", ink: "#f1e3d1", accent: "#d38b4c", accent2: "#e3b98a",
    backdrop: [["glow", "#d38b4c", 0.24, 50, -6, 58]] },
  { id: "lavender-dusk", name: "Lavender dusk", about: "The sky after sunset, lavender with a little rose left", scheme: "dark", canvas: "#1d1629", ink: "#ece5f6", accent: "#b392f0", accent2: "#f0a3c4",
    backdrop: [["glow", "#f0a3c4", 0.16, 50, -4, 46], ["sky", "#36284f", 52]] },
  { id: "arctic", name: "Arctic", about: "Snow light under a faint aurora, deep cold ink", scheme: "light", canvas: "#f1f6f9", ink: "#0e2332", accent: "#1c76b3", accent2: "#1f8a8a",
    backdrop: [["glow", "#2bb59a", 0.13, 18, -2, 52], ["glow", "#1c76b3", 0.11, 82, 0, 48]] },
  { id: "ember", name: "Ember", about: "A fire burned low: charcoal, and orange glowing up from below", scheme: "dark", canvas: "#170a06", ink: "#f6e6da", accent: "#ff7834", accent2: "#ffb054",
    backdrop: [["glow", "#ff7834", 0.3, 50, 112, 62], ["glow", "#ffb054", 0.12, 25, 104, 36]] },
  { id: "newsprint", name: "Newsprint", about: "Gray newsprint, black ink in a serif, the red of a headline", scheme: "light", canvas: "#efede7", ink: "#1b1b19", accent: "#b3261e", accent2: "#3a3a36", type: "serif",
    backdrop: [["lines", "#1b1b19", 0.03, 4, 0]] },
  { id: "terminal", name: "Terminal", about: "A green screen: phosphor on black, scanlines, a monospaced face", scheme: "dark", canvas: "#040805", ink: "#b8f3c4", accent: "#35d14f", accent2: "#7ee08f", type: "mono",
    backdrop: [["lines", "#35d14f", 0.06, 3, 0], ["glow", "#35d14f", 0.08, 50, 38, 72]] },
  { id: "midnight", name: "Midnight", about: "Blue-black, a few stars, and a gold that catches the light", scheme: "dark", canvas: "#0a1022", ink: "#e7ebf5", accent: "#e5b548", accent2: "#9fb6ff",
    backdrop: [["stars", 0.26, 18], ["glow", "#e5b548", 0.1, 88, 0, 34]] },
  { id: "rose-quartz", name: "Rose quartz", about: "Soft pink stone with its facets catching light, a deep rose", scheme: "light", canvas: "#fbeff1", ink: "#3a1c26", accent: "#c0436a", accent2: "#8a4b8f",
    backdrop: [["glow", "#c0436a", 0.1, 0, 0, 52], ["glow", "#8a4b8f", 0.08, 100, 12, 46]] },
  { id: "matcha", name: "Matcha", about: "Whisked green tea, its froth, on a pale ground", scheme: "light", canvas: "#f0f2e4", ink: "#252f17", accent: "#5f8424", accent2: "#8a6a2a",
    backdrop: [["glow", "#5f8424", 0.15, 24, -2, 46]] },
  { id: "sunset", name: "Sunset", about: "The sun going down in orange over a warm violet dark", scheme: "dark", canvas: "#1d0f1e", ink: "#fbe7df", accent: "#ff8558", accent2: "#ffc46a",
    backdrop: [["glow", "#ff8558", 0.3, 50, -6, 52], ["sky", "#4a1d39", 48]] },
  { id: "storm", name: "Storm", about: "Low blue-gray cloud and a flash of lightning", scheme: "dark", canvas: "#121820", ink: "#dce4eb", accent: "#7fb5ff", accent2: "#d9e86b",
    backdrop: [["glow", "#d9e86b", 0.07, 72, 8, 22], ["sky", "#2b3644", 54]] },
  { id: "clay", name: "Clay", about: "Fired terracotta and the cream of its slip", scheme: "light", canvas: "#f6eae2", ink: "#3a2118", accent: "#b2502c", accent2: "#5e7a4a",
    backdrop: [["glow", "#b2502c", 0.12, 90, -2, 46]] },
  { id: "blueprint", name: "Blueprint", about: "A drafting sheet: deep blue, its white grid, a yellow pencil", scheme: "dark", canvas: "#0d2f52", ink: "#e9f2fb", accent: "#ffd25c", accent2: "#9cc9f2",
    backdrop: [["grid", "#9cc9f2", 0.1, 24], ["grid", "#9cc9f2", 0.08, 96]] },
  { id: "citrus", name: "Citrus", about: "Lemon peel in the sun and a bright orange", scheme: "light", canvas: "#fbf8e4", ink: "#2d2911", accent: "#cf6a07", accent2: "#5c8a1e",
    backdrop: [["glow", "#f2b705", 0.24, 86, -2, 40], ["glow", "#cf6a07", 0.09, 8, 4, 30]] },
  { id: "chalkboard", name: "Chalkboard", about: "A slate green board, chalk dust, a stick of yellow", scheme: "dark", canvas: "#1f2a24", ink: "#f2f3ec", accent: "#f2d46b", accent2: "#a7d8c3",
    backdrop: [["glow", "#ffffff", 0.05, 28, 14, 44], ["glow", "#ffffff", 0.04, 78, 58, 40]] },
];

/**
 * A language's own motif: one where there's an honest, well-known one, with its drawn picture (docs/design/themes/motifs.md; the pictures are
 * lex-art's, public/themes/motifs/<id>.webp). Its palette is the picture's: its canvas the picture's top exactly, its ink, accent and second
 * accent from its drawing.
 */
export const MOTIFS = {
  ja: { id: "ja-sakura", name: "Sakura", about: "Cherry blossom on a spring morning, ink like sumi", scheme: "light", canvas: "#fbf0f2", ink: "#2b1d23", accent: "#cf4677", accent2: "#5b8c4c", scene: "ja-sakura" },
  es: { id: "es-andalusia", name: "Andalusia", about: "Whitewashed walls, terracotta and a cobalt tile", scheme: "light", canvas: "#fbf5ec", ink: "#3a2316", accent: "#c0502b", accent2: "#2856a6", scene: "es-andalusia" },
  fr: { id: "fr-lavender", name: "Lavender", about: "Rows of lavender in Provence up to a stone farmhouse", scheme: "light", canvas: "#f5f2f8", ink: "#2a2238", accent: "#7f63aa", accent2: "#ad6242", scene: "fr-lavender" },
  de: { id: "de-black-forest", name: "Black Forest", about: "Fir ridges at dusk, mist in the valleys and one lit window", scheme: "dark", canvas: "#17221d", ink: "#eef0ea", accent: "#d79a52", accent2: "#7f9f6c", scene: "de-black-forest" },
  ko: { id: "ko-celadon", name: "Celadon", about: "Goryeo celadon green and dancheong red", scheme: "light", canvas: "#e8f1eb", ink: "#1b2a24", accent: "#b9382f", accent2: "#3f7f6a", scene: "ko-celadon" },
  it: { id: "it-tuscany", name: "Tuscany", about: "Cypresses along a winding road, olive groves and terracotta", scheme: "light", canvas: "#f8f1e4", ink: "#33261a", accent: "#c96e47", accent2: "#566b40", scene: "it-tuscany" },
  pt: { id: "pt-azulejo", name: "Azulejo", about: "Glazed white tiles in cobalt, and a touch of ochre", scheme: "light", canvas: "#f4f6fb", ink: "#0e1d44", accent: "#1c4db1", accent2: "#c99412", scene: "pt-azulejo" },
  zh: { id: "zh-porcelain", name: "Blue and white", about: "Cobalt on white porcelain: a lotus scroll and crested waves", scheme: "light", canvas: "#f5f7fa", ink: "#14203a", accent: "#3c5fa6", accent2: "#2b4a8a", scene: "zh-porcelain" },
  nl: { id: "nl-tulips", name: "Tulip fields", about: "Tulip fields along a canal under a wide Dutch sky", scheme: "light", canvas: "#f2f5fa", ink: "#13223b", accent: "#e0532a", accent2: "#1f4f9c", scene: "nl-tulips" },
  el: { id: "el-aegean", name: "Aegean", about: "Whitewashed houses, blue shutters and bougainvillea above the sea", scheme: "light", canvas: "#f3f6f9", ink: "#14283f", accent: "#2f6fb3", accent2: "#a3366e", scene: "el-aegean" },
  "zh-Hant": { id: "zh-hant-shanshui", name: "Shan shui", about: "Ink mountains in bands of mist, a pine on the rocks and a thin waterfall", scheme: "light", canvas: "#f4f1ea", ink: "#24231f", accent: "#4a564c", accent2: "#6a6966", scene: "zh-hant-shanshui" },
  yue: { id: "yue-harbour", name: "Harbor lights", about: "Hong Kong's towers lit at night across the harbor, and a ferry", scheme: "dark", canvas: "#0f1426", ink: "#eceef6", accent: "#e3a65a", accent2: "#3fbfb0", scene: "yue-harbour" },
  ru: { id: "ru-birch", name: "Birch forest", about: "White birches in autumn gold along a path", scheme: "light", canvas: "#eef1f0", ink: "#22231d", accent: "#c29a37", accent2: "#4a4640", scene: "ru-birch" },
  uk: { id: "uk-sunflowers", name: "Sunflower fields", about: "Sunflowers to the horizon, a row of poplars at its edge", scheme: "light", canvas: "#f4f6f2", ink: "#22231a", accent: "#d9a01c", accent2: "#557a33", scene: "uk-sunflowers" },
  pl: { id: "pl-wycinanki", name: "Wycinanki", about: "Folk paper cuts: layered flowers in red, green, blue and yellow", scheme: "light", canvas: "#f7f3ea", ink: "#26201c", accent: "#d6403a", accent2: "#2f63b0", scene: "pl-wycinanki" },
  sv: { id: "sv-midsummer", name: "Midsummer meadow", about: "A falu-red cottage above a meadow of wildflowers", scheme: "light", canvas: "#f3f5f2", ink: "#1d2420", accent: "#a8402e", accent2: "#5f7f55", scene: "sv-midsummer" },
  nb: { id: "nb-fjord", name: "Fjord", about: "Steep fjord walls, a waterfall and a red house above calm water", scheme: "light", canvas: "#eef3f6", ink: "#16212a", accent: "#557f9c", accent2: "#a8402e", scene: "nb-fjord" },
  fi: { id: "fi-lakes", name: "Lake and birch", about: "A calm lake, birches and a red sauna on the shore", scheme: "light", canvas: "#eef2f3", ink: "#17212a", accent: "#86a9c0", accent2: "#3e5a45", scene: "fi-lakes" },
  is: { id: "is-moss-lava", name: "Moss and lava", about: "Moss over an old lava field below a snow-topped mountain", scheme: "light", canvas: "#eef0ee", ink: "#1f2321", accent: "#7d9450", accent2: "#5a5652", scene: "is-moss-lava" },
  ga: { id: "ga-kells", name: "Book of Kells", about: "Knotwork ribbons on vellum in the Book of Kells' colors", scheme: "light", canvas: "#f3ead8", ink: "#2a2016", accent: "#b8432f", accent2: "#2f4f8a", scene: "ga-kells" },
  cy: { id: "cy-slate-daffodil", name: "Daffodils", about: "Daffodils against a dry-stone wall of Welsh slate", scheme: "light", canvas: "#f1f3f2", ink: "#1d2226", accent: "#e8a32a", accent2: "#6f777f", scene: "cy-slate-daffodil" },
  gd: { id: "gd-heather-loch", name: "Heather and loch", about: "Heather on the hills around a calm loch", scheme: "light", canvas: "#eef1f3", ink: "#1f1d26", accent: "#84508a", accent2: "#6d8ba2", scene: "gd-heather-loch" },
  tr: { id: "tr-iznik", name: "İznik tiles", about: "Tulips, carnations and saz leaves in cobalt, turquoise and İznik's red", scheme: "light", canvas: "#f6f5f0", ink: "#16203a", accent: "#2f4f9e", accent2: "#c0392b", scene: "tr-iznik" },
  fa: { id: "fa-isfahan", name: "Isfahan tilework", about: "A lattice of turquoise and cobalt tile with small flowers, as on Isfahan's walls", scheme: "light", canvas: "#f3efe4", ink: "#1d1f2e", accent: "#2f9fa5", accent2: "#2c4f96", scene: "fa-isfahan" },
  he: { id: "he-almond", name: "Almond blossom", about: "Almond trees in flower on terraced hills in early spring", scheme: "light", canvas: "#f6f2ef", ink: "#2a1f22", accent: "#c6566f", accent2: "#6a5550", scene: "he-almond" },
  ar: { id: "ar-zellij", name: "Arabesque", about: "Interlocking stars and rosettes of cut, glazed tile", scheme: "light", canvas: "#f4f1ea", ink: "#1e2226", accent: "#2f5f9e", accent2: "#2f7a5a", scene: "ar-zellij" },
  hi: { id: "hi-marigold", name: "Marigold", about: "Baskets of marigolds and strung garlands at a flower market", scheme: "light", canvas: "#fbf4e8", ink: "#2b1d10", accent: "#d87a12", accent2: "#9e2f24", scene: "hi-marigold" },
  gu: { id: "gu-bandhani", name: "Bandhani", about: "Tie-dyed dots in rings on deep red cloth", scheme: "dark", canvas: "#3a1219", ink: "#f4ece2", accent: "#f2c14e", accent2: "#4f9a6a", scene: "gu-bandhani" },
  pa: { id: "pa-mustard", name: "Mustard fields", about: "Mustard in yellow flower to the horizon, a farmhouse beyond", scheme: "light", canvas: "#f6f3e6", ink: "#24220f", accent: "#d6b026", accent2: "#6f8f3f", scene: "pa-mustard" },
  ne: { id: "ne-himalaya", name: "Himalaya", about: "Snow peaks above terraced green hills", scheme: "light", canvas: "#eef3f7", ink: "#17212c", accent: "#63804f", accent2: "#7d8a97", scene: "ne-himalaya" },
  ur: { id: "ur-mughal-garden", name: "Mughal garden", about: "Cypresses along a water channel to a red sandstone pavilion", scheme: "light", canvas: "#f6f2ea", ink: "#241d17", accent: "#a2583a", accent2: "#4f6f45", scene: "ur-mughal-garden" },
  th: { id: "th-lotus", name: "Lotus", about: "Pink lotus flowers and broad leaves on still water", scheme: "light", canvas: "#f3f5ef", ink: "#1f2620", accent: "#d97895", accent2: "#557f50", scene: "th-lotus" },
  vi: { id: "vi-hoi-an", name: "Hội An lanterns", about: "Silk lanterns along old shopfronts by the river at night", scheme: "dark", canvas: "#141a2e", ink: "#f2ece0", accent: "#e48a3a", accent2: "#d0503c", scene: "vi-hoi-an" },
  id: { id: "id-batik", name: "Batik", about: "Parang and kawung in sogan brown and indigo", scheme: "light", canvas: "#f4ecdc", ink: "#261a10", accent: "#2f3f6a", accent2: "#8a5a2e", scene: "id-batik" },
  tl: { id: "tl-sampaguita", name: "Sampaguita", about: "White sampaguita flowers among their leaves", scheme: "light", canvas: "#f2f5ef", ink: "#17231a", accent: "#3f7040", accent2: "#5f7f4a", scene: "tl-sampaguita" },
  sw: { id: "sw-swahili-coast", name: "Swahili coast", about: "Dhows under sail off the coast, and a carved wooden door", scheme: "light", canvas: "#eef5f5", ink: "#14262a", accent: "#2f8288", accent2: "#7a4a2a", scene: "sw-swahili-coast" },
  hy: { id: "hy-pomegranate", name: "Pomegranate", about: "Pomegranates ripe on the branch, one split open", scheme: "light", canvas: "#f7f1ec", ink: "#2a1a1c", accent: "#b8333a", accent2: "#476f38", scene: "hy-pomegranate" },
  ka: { id: "ka-vineyards", name: "Vineyards", about: "Rows of vines heavy with grapes below the mountains", scheme: "light", canvas: "#f3f3ec", ink: "#1f2219", accent: "#6a4a7a", accent2: "#62803c", scene: "ka-vineyards" },
  mt: { id: "mt-luzzu", name: "Luzzu", about: "Painted luzzu boats below a limestone harbor front", scheme: "light", canvas: "#f5f1e6", ink: "#1d2430", accent: "#2f6fb3", accent2: "#c8403a", scene: "mt-luzzu" },
  eu: { id: "eu-basque-coast", name: "Basque coast", about: "Steep layered cliffs running out into the sea", scheme: "light", canvas: "#eef2f3", ink: "#1c2226", accent: "#476f86", accent2: "#658545", scene: "eu-basque-coast" },
  hu: { id: "hu-matyo", name: "Matyó embroidery", about: "Bright Matyó flowers embroidered on black cloth", scheme: "dark", canvas: "#17161c", ink: "#f1ece2", accent: "#d0403a", accent2: "#3f7fd0", scene: "hu-matyo" },
  ca: { id: "ca-trencadis", name: "Trencadís", about: "A mosaic of broken tile along a curving bench", scheme: "light", canvas: "#f4f2ec", ink: "#1d2128", accent: "#4f7fc6", accent2: "#d39a3a", scene: "ca-trencadis" },
  sk: { id: "sk-tatras", name: "Tatras", about: "Kriváň's crooked peak above spruce woods and a mountain lake", scheme: "light", canvas: "#eef2f5", ink: "#18202a", accent: "#3f5a46", accent2: "#8a9299", scene: "sk-tatras" },
  cs: { id: "cs-bohemian-glass", name: "Bohemian glass", about: "Cut ruby and cobalt glass on a shelf", scheme: "light", canvas: "#f2f3f5", ink: "#1c1f28", accent: "#b8323f", accent2: "#2f4f9e", scene: "cs-bohemian-glass" },
  sl: { id: "sl-bled", name: "Lake Bled", about: "A church on the lake's island below a castle on its cliff", scheme: "light", canvas: "#eef3f3", ink: "#16222a", accent: "#4f8686", accent2: "#b8503a", scene: "sl-bled" },
  bg: { id: "bg-rose-valley", name: "Rose Valley", about: "Damask roses in flower below the Balkan Mountains", scheme: "light", canvas: "#f6f1f2", ink: "#28191f", accent: "#c45a7c", accent2: "#507739", scene: "bg-rose-valley" },
  hr: { id: "hr-adriatic", name: "Adriatic", about: "Terracotta roofs inside old stone walls above the sea", scheme: "light", canvas: "#eef4f6", ink: "#1a2228", accent: "#2f7c94", accent2: "#c8643f", scene: "hr-adriatic" },
  ro: { id: "ro-voronet", name: "Voroneț blue", about: "A painted monastery in its own blue under a deep shingle roof", scheme: "light", canvas: "#eef1f4", ink: "#182234", accent: "#2f528a", accent2: "#5a4a3e", scene: "ro-voronet" },
  kk: { id: "kk-steppe", name: "Steppe", about: "Feather grass bending in the wind, a yurt far off below the mountains", scheme: "light", canvas: "#f4f2ea", ink: "#24221a", accent: "#aaa46a", accent2: "#b8503a", scene: "kk-steppe" },
  lt: { id: "lt-amber", name: "Baltic amber", about: "Amber among the pebbles on a Baltic shore below the dunes", scheme: "light", canvas: "#f3f1ea", ink: "#22201a", accent: "#b8741c", accent2: "#6f92a3", scene: "lt-amber" },
  af: { id: "af-fynbos", name: "Fynbos", about: "King proteas and pincushions below Table Mountain", scheme: "light", canvas: "#f3f3ee", ink: "#1e2220", accent: "#c46a82", accent2: "#c95e24", scene: "af-fynbos" },
  uz: { id: "uz-samarkand", name: "Samarkand", about: "Turquoise domes and a tiled portal, as on the Registan", scheme: "light", canvas: "#f5f1e8", ink: "#1c2229", accent: "#217f92", accent2: "#2c4f96", scene: "uz-samarkand" },
  la: { id: "la-roman-mosaic", name: "Roman mosaic", about: "A guilloche and a meander border in stone tesserae", scheme: "light", canvas: "#f2ece0", ink: "#26211c", accent: "#b8613a", accent2: "#d2a24a", scene: "la-roman-mosaic" },
  haw: { id: "haw-hibiscus", name: "Hibiscus", about: "Yellow hibiscus by a lagoon below fluted green ridges", scheme: "light", canvas: "#eef6f5", ink: "#14262a", accent: "#3f9fa3", accent2: "#d9a01c", scene: "haw-hibiscus" },
};

// ---------- a flag's theme ----------

const chromaOf = (hex) => Math.hypot(...toOklab(hexToRgb(hex)).slice(1));
// White, or near it: light and nearly colorless (Brazil's yellow is light, and no white).
const lightish = (hex) => lightnessOf(hex) > 0.9 && chromaOf(hex) < 0.05;
/** Whether a flag's theme is light: white is two fifths of the flag or more. */
export const flagIsLight = (colors) => colors.filter(([hex]) => lightish(hex)).reduce((s, [, share]) => s + share, 0) >= 0.4;

/**
 * A theme from a flag's colors: [[hex, share of the flag], …], most first (scripts/build-flag-themes.mjs reads them off the flag). A clean
 * theme with the flag's colors as its accents: no flag behind the page (the flag is the picker tile's mark). A flag that's mostly white makes
 * a light theme on that white; any other, a dark one on a near black with a trace of its main color's hue. The way forward is its boldest
 * other color; the tab you're on, the next.
 */
export function flagPalette(colors) {
  const light = flagIsLight(colors);
  // The flag's main color: the darkest of its colors that are a fifth of it or more (the Netherlands' blue, not its red; Germany's black).
  const mains = colors.filter(([hex, share]) => !lightish(hex) && share >= 0.2);
  const main = mains.sort((a, b) => lightnessOf(a[0]) - lightnessOf(b[0]))[0] ?? colors.find(([hex]) => !lightish(hex)) ?? colors[0];
  // A color's weight in a flag: how colorful it is, by how much of the flag it is.
  const boldest = (list) => [...list].sort((a, b) => chromaOf(b[0]) * Math.sqrt(b[1]) - chromaOf(a[0]) * Math.sqrt(a[1]));
  const colored = colors.filter(([hex]) => !lightish(hex));
  // A color, not black or gray: an accent is one wherever the flag has one (Albania's red, not its eagle's black, fitted to a gray), and black
  // only for a flag that's black and white (Brittany's).
  const hued = ([hex]) => chromaOf(hex) >= 0.04;
  const pool = light ? colored : colored.filter(([hex]) => hex !== main[0]);
  const accent = (boldest(pool.filter(hued))[0] ?? boldest(colored.filter(hued))[0] ?? boldest(pool)[0])?.[0] ?? main[0];
  // The tab you're on: the boldest of the flag's other colors, its main one among them (the Netherlands' blue beside its red, the Philippines'
  // blue before its sun), that's its own (not a near twin of the first, as Spain's two golds), a real part of the flag (India's green, not its
  // wheel's navy) and a color (Estonia's black would be a gray tab): two of its colors wherever it has two.
  const own = ([hex, share]) => hex !== accent && share >= 0.05 && labDistance(hex, accent) >= 0.12;
  const accent2 = boldest(colored.filter(own).filter(hued))[0]?.[0] ?? accent;
  if (light) return { scheme: "light", canvas: mix("#ffffff", accent, 0.035), ink: atLightness(accent, 0.24), accent, accent2 };
  return { scheme: "dark", canvas: quietAt(main[0], 0.17, 0.018), ink: mix("#f4f2ec", main[0], 0.06), accent, accent2 };
}
const labDistance = (x, y) => Math.hypot(...toOklab(hexToRgb(x)).map((v, i) => v - toOklab(hexToRgb(y))[i]));

// A color at lightness L with a color's hue and at most chroma c: a canvas with a trace of a flag in it, never a colored page.
function quietAt(hex, L, c) {
  const [, a, b] = toOklab(hexToRgb(hex));
  const k = Math.min(1, c / (Math.hypot(a, b) || 1));
  for (let f = k; f >= 0; f -= 0.002) {
    const rgb = fromOklab([L, a * f, b * f]);
    if (inGamut(rgb)) return rgbToHex(rgb);
  }
  return rgbToHex(fromOklab([L, 0, 0]));
}

// ---------- the ready-made themes, as the app lists them ----------

/** The base a ready-made theme sits on: Graphite under a dark one, Paper under a light one. */
export const baseOf = (palette) => (palette.scheme === "dark" ? "graphite" : "paper");

// ---------- a flag's place ----------

// The flags that aren't a country's (lang/flags.js), by name; every other flag is named by its ISO code.
export const FLAG_PLACES = {
  "es-ct": "Catalonia",
  "es-ga": "Galicia",
  "es-pv": "Basque Country",
  "gb-sct": "Scotland",
  "gb-wls": "Wales",
  "fr-bre": "Brittany",
  "nl-fr": "Friesland",
  "us-hi": "Hawaii",
  esperanto: "Esperanto",
  kurdistan: "Kurdistan",
};
const placeNames = new Map();
/** A flag's place, in a locale ("en" by default): its short name ("Bosnia", "Hong Kong"), the long one where that's letters ("US"). */
export function flagPlace(code, locale = "en") {
  if (Object.hasOwn(FLAG_PLACES, code)) return FLAG_PLACES[code];
  if (!placeNames.has(locale)) {
    try {
      placeNames.set(locale, [new Intl.DisplayNames([locale], { type: "region", style: "short" }), new Intl.DisplayNames([locale], { type: "region" })]);
    } catch {
      placeNames.set(locale, null);
    }
  }
  const names = placeNames.get(locale);
  const region = code.toUpperCase();
  if (!names) return region;
  const short = names[0].of(region);
  return /^[A-Z.\s]+$/.test(short) ? names[1].of(region) : short;
}

// One theme per flag, with every language it marks (India's marks four, Norway's three, Kurdistan's two), in the order of its place's name.
const FLAG_SETS = (() => {
  const by = new Map();
  for (const lang of Object.keys(FLAG_COLORS)) {
    const { flag, colors } = FLAG_COLORS[lang];
    if (!by.has(flag)) by.set(flag, { id: `flag-${flag}`, flag, colors, langs: [] });
    by.get(flag).langs.push(lang);
  }
  return [...by.values()].map((f) => ({ ...f, name: flagPlace(f.flag) })).sort((a, b) => a.name.localeCompare(b.name, "en"));
})();
const FLAG_BY_ID = new Map(FLAG_SETS.map((f) => [f.id, f]));

/**
 * Every ready-made theme the app offers: [{ id, name, about, group ("general" | "motif" | "flag"), base }; a flag's also its flag and the
 * languages it marks (langs)]. Their tokens are worked out only when one is used (readyTokens). The motif themes come in with their pictures.
 */
export const READY_THEMES = [
  ...GENERAL.map((t) => ({ id: t.id, name: t.name, about: t.about, group: "general", base: baseOf(t) })),
  ...Object.entries(MOTIFS).map(([lang, m]) => ({ id: m.id, name: m.name, about: m.about, group: "motif", lang, base: baseOf(m) })),
  ...FLAG_SETS.map((f) => ({ id: f.id, name: f.name, about: "", group: "flag", flag: f.flag, langs: f.langs, base: flagIsLight(f.colors) ? "paper" : "graphite" })),
];
const PALETTES = new Map([...GENERAL, ...Object.values(MOTIFS)].map((t) => [t.id, t]));
const BY_ID = new Map(READY_THEMES.map((t) => [t.id, t]));
export const READY_IDS = READY_THEMES.map((t) => t.id);
/** A language's motif theme, or null. */
export const motifThemeOf = (lang) => (Object.hasOwn(MOTIFS, lang) ? BY_ID.get(MOTIFS[lang].id) ?? null : null);
/** The flag theme for a language, or null. */
export const flagThemeOf = (lang) => (Object.hasOwn(FLAG_COLORS, lang) ? BY_ID.get(`flag-${FLAG_COLORS[lang].flag}`) ?? null : null);
// A flag's palette, worked out the first time it's asked for.
const paletteOf = (id) => {
  if (!PALETTES.has(id) && FLAG_BY_ID.has(id)) {
    const f = FLAG_BY_ID.get(id);
    // The palette build-flag-themes.mjs wrote (the same flagPalette, kept), else worked out here.
    PALETTES.set(id, { id, name: f.name, ...(FLAG_DATA.FLAG_PALETTES?.[f.flag] ?? flagPalette(f.colors)) });
  }
  return PALETTES.get(id) ?? null;
};

/** A ready-made theme by id ({ id, name, about, group, base, … }), or null. */
export const readyTheme = (id) => BY_ID.get(id) ?? null;

const tokenCache = new Map();
/** A ready-made theme's tokens (themeTokens of its palette), worked out once; null for an id that isn't one. */
export function readyTokens(id) {
  const palette = paletteOf(id);
  if (!palette) return null;
  if (!tokenCache.has(id)) tokenCache.set(id, themeTokens(palette));
  return tokenCache.get(id);
}
const standInCache = new Map();
/** A ready-made theme's tile stand-in (standInTokens of its palette), worked out once; null for an id that isn't one. */
export function readyStandIn(id) {
  const palette = paletteOf(id);
  if (!palette) return null;
  if (!standInCache.has(id)) standInCache.set(id, standInTokens(palette));
  return standInCache.get(id);
}
/** A ready-made theme's palette (the theme test and the tile tool read it), or null. */
export const readyPalette = (id) => paletteOf(id);
