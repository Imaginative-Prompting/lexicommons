// The pile of your words (know/cards.js wordsCard): every word you've started a tile, laid onto a heap the way a pour leaves one (layOut), and
// how a tile falls into the card (sinkLaw). Each visit's pile is laid out anew, with a seed of its own (know/cards.js: never the same pile twice):
// 2,500 words in a few ms. The walls step outward as the count grows (the box gets bigger in the world as the view pulls back, and
// from a few hundred words it's wider than the card, so a big pile is a mountain whose slopes run off the card rather than a pile with straight
// sides). Pure: no DOM; Node's tests run it as the page does.

/** A seeded random number generator (mulberry32): the same seed, the same numbers (a pile's seed is its visit's own, never the words'). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string's hash (FNV-1a), for seeds. */
export function hashOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const STEP = 1 / 60;
const GRAVITY = 2200; // px/s²
const LONGEST = 60 * 6;
const BIN = 20; // px: the surface is kept in bins this wide
const LIFT = 12; // px on the screen the pile's top starts above its place, on the way in
const DROP = 900; // px a second on the screen: the fastest a pile with nothing kept drops into the card
const SLOPE = 0.9; // the steepest a laid-out pile's side stands (rise a px across), as a poured one does
const DROP_G = 2400; // px/s² on the screen: a pile dropping in falls the same on the screen at any size
const SINK = 30; // px a second on the screen: how fast the pile settles

/** The box a pile of n words lives in, in px at full size: its width (wall to wall) and its height, for a view that's about three fifths full. */
/** How much wider than the card the pile's box is: the card's own width at 50 words, past both its sides as the pile grows (a mountain whose
 * slopes run off the card, rather than a pile that fills a phone-narrow box with straight sides). */
export const spreadOf = (n) => 1 + 1.3 * Math.min(1, Math.max(0, Math.log(Math.max(1, n) / 50) / Math.log(2000 / 50)));
export const FILL = 0.45; // the tiles' own area to the box's: with its sides lower at the walls, a heap stands about two thirds of the box high
export function boxOf(n, { width, area, height }) {
  // area: the tiles' own area, packed loosely, at full size; width × height: the card's pile space.
  const z = Math.min(1, Math.sqrt((FILL * width * height) / Math.max(1, area)));
  return { z, w: width / z, h: height / z };
}

/** The card's pile space, in px: the same at any count (the box gets bigger and the view pulls back, never the card). */
export const PILE_HEIGHT = 300;
/** The floor, over the card's foot, and the walls' inset inside its sides (clear of its rounded corners), in px. */
export const FLOOR = 12;
export const INSET = 12;
/** How far back the view is for n words: px a px at full size, one card's view, the same in the worker and on the page. */
export const zoomOf = (n, { width, average }) => boxOf(n, { width: width * spreadOf(n), height: PILE_HEIGHT - FLOOR, area: n * average }).z;
/** Half the box's width at c words, in full-size px (the walls). width: the card's inside width; average: a tile's area, packed loosely. */
export const wallsOf = ({ width, average }) => (c) => boxOf(c, { width: width * spreadOf(c), height: PILE_HEIGHT - FLOOR, area: c * average }).w / 2;
/** How full the card's pile space is at most: the view pulls back further when a pile would stand higher than this. */
export const FIT = 0.62;
/** How far back the view is for n words whose pile's top is at top (full-size px): the box's own view, or further back to keep the pile's top
 * at FIT of the card. */
export const viewOf = (n, { width, average }, top) => Math.min(zoomOf(n, { width, average }), (FIT * (PILE_HEIGHT - FLOOR)) / Math.max(1, top));
/** How far a tile starts above its place on the way in, per px of its height, for a pile whose top is at top (full-size px) seen at z. */
export const liftOf = (top, z) => LIFT / z / Math.max(1, top);

/**
 * Lays tiles onto a pile without the world: each resting on the surface where it lands (the lowest of a few places, a little toward the middle,
 * as a pour chooses), mostly lying flat, a few tipped, rolling down any side steeper than a poured heap's, never overlapping. placed: the
 * pile's tiles already there ({ id: [x, y, a] }, their sizes in sizes: { id: { w, h } }); tiles: the new ones in order ({ id, w, h }); half:
 * the box's half-width. Returns { id: [x, y, a] } for the new ones. Pure and fast (2,500 tiles in a few ms), so the page lays a pile out as it
 * drops it in.
 */
export function layOut({ tiles, placed = {}, sizes = {}, half, seed = 0 }) {
  const random = seeded(seed ^ hashOf(`lay ${tiles.length} ${Object.keys(placed).length}`));
  // The surface, exactly: a skyline of steps (xs[i] where a step starts, hs[i] its height), so a tile laid on it rests on whatever is under
  // any part of it and never overlaps a neighbor. A tile's box is its rotated tile's bounding box.
  const xs = [Number.NEGATIVE_INFINITY];
  const hs = [0];
  const stepAt = (x) => {
    let lo = 0;
    let hi = xs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const topAt = (from, to) => {
    let h = 0;
    for (let i = stepAt(from); i < xs.length && xs[i] < to; i++) h = Math.max(h, hs[i]);
    return h;
  };
  const split = (x) => {
    const i = stepAt(x);
    if (xs[i] === x) return i;
    xs.splice(i + 1, 0, x);
    hs.splice(i + 1, 0, hs[i]);
    return i + 1;
  };
  // Raises [from, to) to at least top. A tile laid on the surface is above all of it there: its span becomes one step (the skyline stays as
  // short as the surface is wide, not as long as the pile has tiles).
  const raise = (from, to, top) => {
    const a = split(from);
    const b = split(to);
    let over = true;
    for (let i = a; i < b; i++) over &&= hs[i] <= top;
    if (over) {
      xs.splice(a + 1, b - a - 1);
      hs.splice(a + 1, b - a - 1);
      hs[a] = top;
    } else for (let i = a; i < b; i++) hs[i] = Math.max(hs[i], top);
  };
  const boxOf = (w, h, a) => {
    const c = Math.abs(Math.cos(a));
    const sn = Math.abs(Math.sin(a));
    return [(c * w + sn * h) / 2, (sn * w + c * h) / 2];
  };
  for (const [id, [x, y, a = 0]] of Object.entries(placed)) {
    const [hx, hy] = boxOf(sizes[id]?.w ?? 60, sizes[id]?.h ?? 36, a);
    raise(x - hx, x + hx, y + hy);
  }
  const out = {};
  for (const tile of tiles) {
    // Mostly lying flat, a few tipped: a tipped tile stands taller and leaves room under it.
    const a = random() < 0.88 ? (random() - 0.5) * 0.22 : (random() - 0.5) * 0.9;
    const c = Math.abs(Math.cos(a));
    const sn = Math.abs(Math.sin(a));
    const hx = (c * tile.w + sn * tile.h) / 2;
    const hy = (sn * tile.w + c * tile.h) / 2;
    let best = null;
    for (let k = 0; k < 5; k++) {
      const x = Math.max(-half + hx + 1, Math.min(half - hx - 1, (random() * 2 - 1) * half));
      const score = topAt(x - hx, x + hx) + 0.9 * Math.abs(x);
      if (!best || score < best.score) best = { x, score };
    }
    // It rolls down any side steeper than the pile stands (as a poured one does), so the mound keeps its slopes rather than a spike.
    let x = best.x;
    for (let guard = 0; guard < 600; guard++) {
      const here = topAt(x - hx, x + hx);
      const left = x - hx - BIN > -half ? topAt(x - hx - BIN, x + hx - BIN) : Number.POSITIVE_INFINITY;
      const right = x + hx + BIN < half ? topAt(x - hx + BIN, x + hx + BIN) : Number.POSITIVE_INFINITY;
      if (left < here - SLOPE * BIN && left <= right) x -= BIN;
      else if (right < here - SLOPE * BIN) x += BIN;
      else break;
    }
    const under = topAt(x - hx, x + hx);
    out[tile.id] = [x, under + hy, a];
    raise(x - hx, x + hx, under + 2 * hy);
  }
  return out;
}

/**
 * How far a tile has sunk by each frame of a way in, as the world steps it (v += g dt; v /= 1 + c dt; y += v dt): a kept pile's gentle settle
 * (the world's gravity, slowed to SINK on the screen), or a drop into the card (the screen's own law, the same at any size). z: the view.
 */
export function sinkLaw({ z, drop = false, frames = LONGEST + 2 }) {
  const g = drop ? DROP_G / z : GRAVITY;
  const c = drop ? DROP_G / DROP : (GRAVITY * z) / SINK;
  const sunk = [0];
  for (let v = 0, d = 0; sunk.length < frames; ) {
    v = (v + g * STEP) / (1 + c * STEP);
    d += v * STEP;
    sunk.push(d);
  }
  return Float32Array.from(sunk);
}
/** How far a tile at height y starts above its place on a way in: lift per px of height (liftOf), and rise for a drop (the card's height). */
export const riseOf = ({ z, height }) => height / z + 40;
