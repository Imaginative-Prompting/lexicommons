// What a drawing of ours may be: a word picture (public/pictures/) or a symbol. Plain shapes, colored only by the art tokens
// (css/lx/art.css), nothing that runs, reaches out or needs a font. Read by the loader before anything is drawn, and by
// scripts/test-art.mjs over every file, so both refuse the same things. Pure, no DOM: it reads the text itself and takes
// nothing it can't name, so what passes here is what any parser will build.

/** The palette a drawing is colored from, with the color it's designed in (art.css holds the same, by theme). */
export const ART_TOKENS = {
  paper: "#FBF7EC", "paper-mid": "#EDE6D5", "paper-deep": "#DAD1BC", "paper-deeper": "#BDB19A", ground: "#D3CAB5",
  ink: "#231F3B", "ink-lit": "#3A3460", steel: "#A9B0BF", "steel-deep": "#6B687A",
  sky: "#58ADEB", "sky-lit": "#8FCDF4", "sky-pale": "#C9E7F9", "sky-deep": "#3488C9",
  sun: "#F7BE45", "sun-lit": "#FAD57E", "sun-deep": "#DB9A22",
  clay: "#E8743B", "clay-lit": "#F6A06F", "clay-deep": "#C25626", "clay-deeper": "#9C4219",
  violet: "#7C5CE6", "violet-lit": "#A68CFF", "violet-deep": "#5E40C4",
  teal: "#37B39B", "teal-lit": "#6FD0BD", "teal-deep": "#25907B",
  skin: "#E9B48A", "skin-deep": "#CF9468",
  wood: "#DCA063", "wood-deep": "#B97F45", bark: "#7A4E2D", "bark-deep": "#4B2F24",
  // The lesson path's stops (lx/stop-art.js): the path sets these on each button per state; these are done, in violet, on a gold grand stop.
  "stop-face": "#7C5CE6", "stop-wall": "#5E40C4", "stop-wall-dark": "#45309A", "stop-mark": "#FFFFFF", "stop-rim": "#F7BE45", "stop-rim-wall": "#DB9A22", "stop-rim-wall-dark": "#B47A12",
};
/** The most a drawing may weigh. */
export const ART_BYTES = 12000;
/** A concept's id, as lessons and packs name it. Never a path or a URL. */
export const ART_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SVG_NS = "http://www.w3.org/2000/svg";
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;
const NUMBERS = /^[-\d.,\s]+$/;
const PATH = /^[MmLlHhVvCcSsQqTtAaZz\d\s.,-]+$/;
const TRANSFORM = /^(?:\s*(?:translate|rotate|scale|skewX|skewY|matrix)\([-\d.,\s]+\))+\s*$/;
const UNIT = /^(?:0?\.\d+|0|1(?:\.0+)?)$/;
const LOCAL_ID = /^[a-z][a-z0-9-]*$/;
const SHAPE = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "fill-rule", "clip-rule", "clip-path", "transform", "opacity", "fill-opacity", "stroke-opacity"];
const ELEMENTS = {
  g: SHAPE,
  clipPath: ["id"],
  path: [...SHAPE, "d", "pathLength"],
  rect: [...SHAPE, "x", "y", "width", "height", "rx", "ry"],
  circle: [...SHAPE, "cx", "cy", "r"],
  ellipse: [...SHAPE, "cx", "cy", "rx", "ry"],
  line: [...SHAPE, "x1", "y1", "x2", "y2"],
  polygon: [...SHAPE, "points"],
  polyline: [...SHAPE, "points"],
};
const paint = (value) => {
  if (value === "none") return true;
  const named = /^var\(--art-([a-z-]+),(#[0-9A-F]{6})\)$/.exec(value);
  return Boolean(named && ART_TOKENS[named[1]] === named[2]);
};
const VALUES = {
  fill: paint, stroke: paint,
  "stroke-width": (v) => NUMBER.test(v),
  "stroke-linecap": (v) => ["butt", "round", "square"].includes(v),
  "stroke-linejoin": (v) => ["miter", "round", "bevel"].includes(v),
  "stroke-dasharray": (v) => NUMBERS.test(v),
  "fill-rule": (v) => ["nonzero", "evenodd"].includes(v),
  "clip-rule": (v) => ["nonzero", "evenodd"].includes(v),
  transform: (v) => TRANSFORM.test(v),
  opacity: (v) => UNIT.test(v), "fill-opacity": (v) => UNIT.test(v), "stroke-opacity": (v) => UNIT.test(v),
  d: (v) => PATH.test(v),
  points: (v) => NUMBERS.test(v),
  id: (v) => LOCAL_ID.test(v),
};

/**
 * What's wrong with a drawing's text: an empty list means it may be drawn. A symbol (symbol: true) may name a moving part with
 * a class, and take a color from what holds it (currentColor: a quiet, single-color one); a word picture does neither.
 */
export function checkArt(text, { symbol = false } = {}) {
  if (typeof text !== "string") return ["not text"];
  const problems = [];
  if (new TextEncoder().encode(text).length > ART_BYTES) problems.push(`over ${ART_BYTES} bytes`);
  const tag = /\s*<(\/?)([A-Za-z]+)((?:\s+[A-Za-z][A-Za-z0-9-]*="[^"<>&]*")*)\s*(\/?)>/y;
  const ids = new Set();
  const used = [];
  const open = [];
  let roots = 0;
  while (tag.lastIndex < text.length) {
    const at = tag.lastIndex;
    if (/^\s*$/.test(text.slice(at))) break;
    const m = tag.exec(text);
    if (!m) {
      problems.push(`something other than plain shapes at character ${at}: ${JSON.stringify(text.slice(at, at + 40))}`);
      break;
    }
    const [, closing, name, attrs, selfClosed] = m;
    if (closing) {
      if (attrs || selfClosed || open.pop() !== name) problems.push(`a closing ${name} that closes nothing`);
      continue;
    }
    const seen = new Set();
    const list = [...attrs.matchAll(/([A-Za-z][A-Za-z0-9-]*)="([^"]*)"/g)].map(([, key, value]) => [key, value]);
    for (const [key] of list) {
      if (seen.has(key)) problems.push(`${name} has ${key} twice`);
      seen.add(key);
    }
    if (name === "svg") {
      if (open.length || roots++) problems.push("an svg inside a drawing");
      const a = Object.fromEntries(list);
      if (list.length !== 2 || a.xmlns !== SVG_NS) problems.push("the svg must have just xmlns and a viewBox");
      const box = /^0 0 (\d+) (\d+)$/.exec(a.viewBox ?? "");
      if (!box || box[1] !== box[2]) problems.push(`its viewBox isn't square from 0 0: ${a.viewBox}`);
    } else {
      if (!open.length) problems.push(`${name} outside the svg`);
      const allowed = Object.hasOwn(ELEMENTS, name) ? ELEMENTS[name] : null;
      if (!allowed) {
        problems.push(`a ${name}: drawings are plain shapes only`);
      } else {
        for (const [key, value] of list) {
          if (key === "class" && symbol) {
            if (!LOCAL_ID.test(value)) problems.push(`a class that isn't plain: ${value}`);
          } else if (!allowed.includes(key)) problems.push(`${name} has ${key}`);
          else if (key === "clip-path") {
            const ref = /^url\(#([a-z][a-z0-9-]*)\)$/.exec(value);
            if (ref) used.push(ref[1]);
            else problems.push(`clip-path isn't one of its own: ${value}`);
          } else if (key === "id") {
            if (!LOCAL_ID.test(value)) problems.push(`an id that isn't plain: ${value}`);
            else if (ids.has(value)) problems.push(`the id ${value} twice`);
            ids.add(value);
          } else if (symbol && value === "currentColor" && (key === "fill" || key === "stroke")) {
            // Its color is what holds it.
          } else if (!(VALUES[key] ?? ((v) => NUMBER.test(v)))(value)) {
            problems.push(`${name} ${key}="${value}"`);
          }
        }
      }
    }
    if (!selfClosed) open.push(name);
  }
  if (roots !== 1) problems.push("not one svg");
  if (open.length) problems.push(`never closed: ${open.join(", ")}`);
  for (const id of used) if (!ids.has(id)) problems.push(`clip-path names ${id}, which it doesn't have`);
  return problems;
}
