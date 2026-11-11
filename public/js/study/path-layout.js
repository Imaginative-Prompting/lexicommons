// Where everything on the path stands. No line: the lessons themselves make the wave, a slow wander from side to side over several lessons (the
// drafts' own: two sines across the width, a little different per lesson), each lesson a large solid icon with its words on the side with room, the
// outside of its bend. A unit's name in the middle over its first lesson, its grand stop in the middle at its end. The rows keep the drafts' rhythm and
// open only where something would touch: no words ever meet another lesson, its words or Tinta. Pure geometry, no DOM: the same lesson stands in the
// same place on every device of a size.
//
//   pathLayout(lessons, width, { labelSize, headerHeight }) → { units, height, c, S, P }
//     labelSize(lesson, width) → { h }: how tall a lesson's words are at that width (the page measures them in their own faces).
//     headerHeight(unit) → the px its header takes (its number, its name, the starter's line).
//   a unit: { id, title, n, first, top, bottom, headerTop, stops, piece }
//   a stop: { lesson, k, x, y, side, label: { x, y, w, h, align }, tinta? }   side: where its words are, "left" or "right" of it
//   a piece (the grand stop): { lesson, x, y, size, here, tinta? }

/** A lesson's icon, its side in px. */
export const stopSize = (width) => (width < 360 ? 72 : 84);
/** The grand stop at a unit's end. */
export const pieceSize = (width) => (width < 360 ? 116 : 132);
const DEPTH = 0.04; // the solid's depth under and right of its face, of its size
const GAP = 14; // from an icon's edge to its words
const EDGE = 16; // from the words to the screen's edge
const CLEAR = 12; // the least room between one lesson's things and another's
const STEP = (width) => (width < 360 ? 122 : 130); // the rhythm: from one lesson to the next (the drafts' 118, for bigger icons)
const HEADER_GAP = 30; // from a unit's header to its first lesson
const UNIT_GAP = 70; // from a unit's end to the next unit's header
const TINTA = 48;

// The drafts' noise: the same small difference for a lesson every time.
const hash = (text) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const noise = (seed, n) => {
  let h = (hash(seed) + Math.imul(n + 1, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Lessons in units, in order: each unit's lessons, and its whole-unit lesson as its grand stop. */
function unitsOf(lessons) {
  const units = [];
  for (const lesson of lessons) {
    if (units.at(-1)?.id !== lesson.unit.id) units.push({ id: lesson.unit.id, title: lesson.unit.title, lessons: [], full: null });
    const unit = units.at(-1);
    if (lesson.full) unit.full = lesson;
    else unit.lessons.push(lesson);
  }
  return units;
}

const grow = (r, by) => ({ l: r.l - by, r: r.r + by, t: r.t - by, b: r.b + by });
const meets = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
const shift = (r, dy) => ({ l: r.l, r: r.r, t: r.t + dy, b: r.b + dy });

export function pathLayout(lessons, width, { labelSize, headerHeight }) {
  const c = width / 2;
  const S = stopSize(width);
  const P = pieceSize(width);
  const step = STEP(width);
  const reach = width * 0.27;
  const labelMin = Math.min(width * 0.38, 160);
  // Across: every lesson by its place along the whole path, as the drafts do.
  const plain = lessons.filter((lesson) => !lesson.full);
  const xs = plain.map((lesson, i) => {
    const wander = Math.sin(i * 0.62) * 0.72 + Math.sin(i * 0.23 + 1.3) * 0.28;
    const nudge = (noise(lesson.id, 1) - 0.5) * width * 0.05;
    return Math.min(width - S / 2 - 8, Math.max(S / 2 + 8, c + wander * reach + nudge));
  });
  // Its words on the outside of its bend, if there's room there for them; else the other side.
  const sideOf = (i) => {
    const x = xs[i];
    const outside = x >= (xs[Math.max(0, i - 1)] + xs[Math.min(xs.length - 1, i + 1)]) / 2 ? "right" : "left";
    const room = { left: x, right: width - x };
    const need = S / 2 + GAP + labelMin + EDGE;
    if (room[outside] >= need) return outside;
    const other = outside === "right" ? "left" : "right";
    return room[other] >= need || room[other] > room[outside] ? other : outside;
  };
  const index = new Map(plain.map((lesson, i) => [lesson.id, i]));

  const units = [];
  let y = 0;
  unitsOf(lessons).forEach((group, u) => {
    const first = u === 0;
    const top = y;
    const headerTop = top + (first ? 16 : 40);
    const headerFoot = headerTop + headerHeight(group);
    const placed = []; // each stop's rectangles, to keep the next clear of them
    const stops = [];
    group.lessons.forEach((lesson, k) => {
      const i = index.get(lesson.id);
      const x = xs[i];
      const side = sideOf(i);
      const lx = side === "right" ? x + S / 2 + GAP : EDGE;
      const w = side === "right" ? width - EDGE - lx : x - S / 2 - GAP - EDGE;
      const h = labelSize(lesson, w).h;
      const here = lesson.state === "here";
      // Tinta on top of your place's icon, toward the side away from its words.
      const tx = x + (side === "right" ? -1 : 1) * S * 0.22 - TINTA / 2;
      // Its things at y = 0: the icon (with its depth), its words, Tinta.
      const icon = { l: x - S / 2, r: x + S / 2 + S * DEPTH, t: -S / 2, b: S / 2 + S * DEPTH };
      const words = { l: lx, r: lx + w, t: -h / 2, b: h / 2 };
      const tinta = here ? { l: tx, r: tx + TINTA, t: -S / 2 - TINTA + 10, b: -S / 2 + 10 } : null;
      const mine = [icon, words, ...(tinta ? [tinta] : [])];
      // Down: the rhythm, a little different per lesson, then down past anything it would touch.
      let sy = k ? stops[k - 1].y + step + (noise(lesson.id, 2) - 0.5) * 12 : headerFoot + HEADER_GAP + Math.max(...mine.map((r) => -r.t));
      const before = placed.slice(-3).flat();
      for (let guard = 0; guard < 200 && mine.some((r) => before.some((b) => meets(grow(shift(r, sy), CLEAR), b))); guard++) sy += 4;
      placed.push(mine.map((r) => shift(r, sy)));
      const stop = { lesson, k, x, y: sy, side, label: { x: lx, y: sy - h / 2, w, h, align: side === "right" ? "start" : "end" } };
      if (tinta) stop.tinta = { x: tx, y: sy + tinta.t, size: TINTA };
      stops.push(stop);
    });
    const lastFoot = placed.length ? Math.max(...placed.slice(-3).flat().map((r) => r.b)) : headerFoot;
    // The grand stop, in the middle, with room of its own above it and its words under it (and a Start when it's your place).
    let piece = null;
    if (group.full) {
      const here = group.full.state === "here";
      let py = lastFoot + 44 + (here ? TINTA * 0.5 : 0) + P / 2;
      const body = { l: c - P / 2, r: c + P / 2, t: -P / 2 - (here ? TINTA : 0), b: P / 2 + 60 };
      const before = placed.slice(-3).flat();
      for (let guard = 0; guard < 200 && before.some((b) => meets(grow(shift(body, py), CLEAR), b)); guard++) py += 4;
      piece = { lesson: group.full, x: c, y: py, size: P, here };
      if (here) piece.tinta = { x: c + P / 2 - 6, y: py - P / 2 - 10, size: TINTA };
    }
    const bottom = (piece ? piece.y + P / 2 + (piece.here ? 150 : 96) : lastFoot) + UNIT_GAP;
    units.push({ id: group.id, title: group.title, n: u + 1, first, top, bottom, headerTop, stops, piece });
    y = bottom;
  });
  return { units, height: y, c, S, P };
}
