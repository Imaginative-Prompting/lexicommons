// Tinta standing on a drawing (a lesson on Study's path): its feet on the drawing's own top edge under its middle, not on the drawing's box.
// A drawing's top under Tinta is wherever its shapes are (a cup's rim, a medal's ribbon), so it's found from the shapes themselves: the first
// point, down the drawing, that any of its shapes fills or strokes, across the middle of Tinta's foot. Everything is measured as a share of
// the boxes as they are on the screen, so a bob, a scale or a scroll in between changes nothing; Tinta is moved by its margin, which its own
// bob (a CSS translate) never touches.

// Where its feet are in its box: its drawing's ground (y = 0) is this far down its viewBox (the rig's VIEW, [-64, -124, 128, 130], until its
// drawing is up). Read from the drawing itself, so the rig isn't loaded for it.
const feetOf = (tinta) => {
  const box = tinta.querySelector(":scope > svg")?.viewBox?.baseVal;
  return box?.height ? -box.y / box.height : 124 / 130;
};
const SHAPES = "path, circle, ellipse, rect, polygon, polyline, line";

/** The first share of the drawing's height, top down, that its shapes cover at any of the shares across `xs`; null if none does. */
function topAt(drawing, xs, rows = 96) {
  const box = drawing.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const shapes = [...drawing.querySelectorAll(SHAPES)].filter((shape) => {
    if (typeof shape.isPointInFill !== "function") return false;
    const style = getComputedStyle(shape);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    return style.fill !== "none" || style.stroke !== "none";
  });
  const inverses = shapes.map((shape) => shape.getScreenCTM()?.inverse() ?? null);
  for (let row = 0; row <= rows; row++) {
    const y = box.top + (row / rows) * box.height;
    for (const fx of xs) {
      const point = new DOMPoint(box.left + fx * box.width, y);
      for (let i = 0; i < shapes.length; i++) {
        if (!inverses[i]) continue;
        const local = point.matrixTransform(inverses[i]);
        const style = getComputedStyle(shapes[i]);
        if ((style.fill !== "none" && shapes[i].isPointInFill(local)) || (style.stroke !== "none" && shapes[i].isPointInStroke(local))) return row / rows;
      }
    }
  }
  return null;
}

/**
 * Puts a Tinta that stands on `drawing` (an element holding an inline SVG) with its feet on the drawing's top under its middle, sunk `sink`
 * px into it (a wet foot). Both must be on the page and laid out. Returns how far it moved it (px), or 0 when there was nothing to stand on.
 */
export function standOn(tinta, drawing, { sink = 1.5 } = {}) {
  const svg = drawing.matches("svg") ? drawing : drawing.querySelector("svg");
  if (!svg || !tinta.isConnected) return 0;
  const t = tinta.getBoundingClientRect();
  const d = svg.getBoundingClientRect();
  if (!t.height || !d.width) return 0;
  // Across the middle of its foot: its middle, and a little either side.
  const mid = (t.left + t.width / 2 - d.left) / d.width;
  const spread = (t.width * 0.14) / d.width;
  const xs = [mid, mid - spread, mid + spread].filter((x) => x >= 0 && x <= 1);
  const top = xs.length ? topAt(svg, xs) : null;
  if (top === null) return 0;
  // Where its feet are now and where the drawing's top is, on the screen; the margin moves it by the difference (the boxes' scale cancels:
  // both are in the same transformed space, so it's converted back by Tinta's own scale).
  const scale = t.height / tinta.offsetHeight || 1;
  const feet = t.top + feetOf(tinta) * t.height;
  const surface = d.top + top * d.height + sink * scale;
  const by = (surface - feet) / scale;
  const before = parseFloat(tinta.style.marginTop) || 0;
  tinta.style.marginTop = `${(before + by).toFixed(1)}px`;
  return by;
}
