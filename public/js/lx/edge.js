// A card's outline when it isn't a plain rounded box: one drawn path in a solid line color, so lines that meet can't double up, and each line ends on the line above it. Nothing is
// painted behind it, so a theme's background shows through, and it follows the card's size. A shape needs a reason: docs/design-bible.md, Off shapes.
const NS = "http://www.w3.org/2000/svg";
let made = 0;

/** A closed path through [x, y, r]: each corner rounded by r. */
const rounded = (points) => {
  let d = "";
  points.forEach((p, i) => {
    const prev = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    const toward = (to) => {
      const dx = to[0] - p[0], dy = to[1] - p[1], length = Math.hypot(dx, dy) || 1, k = Math.min(p[2], length / 2) / length;
      return `${(p[0] + dx * k).toFixed(2)} ${(p[1] + dy * k).toFixed(2)}`;
    };
    d += `${i ? "L" : "M"}${toward(prev)} Q${p[0]} ${p[1]} ${toward(next)} `;
  });
  return `${d}Z`;
};

const SHAPES = {
  // Translate's box, with a round bite out of its foot, holding the swap: what you typed above, the answer below, and the way between them.
  hinge: (w, h, { r = 16, bite = 30 }) => {
    const c = w / 2;
    return { d: `M${1 + r} 1 H${w - 1 - r} Q${w - 1} 1 ${w - 1} ${1 + r} V${h - 1 - r} Q${w - 1} ${h - 1} ${w - 1 - r} ${h - 1} H${c + bite} A${bite} ${bite} 0 0 0 ${c - bite} ${h - 1} H${1 + r} Q1 ${h - 1} 1 ${h - 1 - r} V${1 + r} Q1 1 ${1 + r} 1 Z`, tear: null };
  },
  // A flash card's clipped corner: the sentence you're being asked about. Top right; top left for a sentence that reads from the right, so the corner never sits over its first word.
  cut: (w, h, { r = 16, cut = 22, rtl = false }) => {
    const points = [[1, 1, r], [w - 1 - cut, 1, 5], [w - 1, 1 + cut, 5], [w - 1, h - 1, r], [1, h - 1, r]];
    return { d: rounded(rtl ? points.map(([x, y, c]) => [w - x, y, c]) : points) };
  },
  // A ticket: a bite out of the top and bottom edges at `at`, where its stub tears off.
  ticket: (w, h, { r = 20, at = 60, bite = 7 }) => ({
    d: `M${1 + r} 1 H${at - bite} A${bite} ${bite} 0 0 0 ${at + bite} 1 H${w - 1 - r} Q${w - 1} 1 ${w - 1} ${1 + r} V${h - 1 - r} Q${w - 1} ${h - 1} ${w - 1 - r} ${h - 1} H${at + bite} A${bite} ${bite} 0 0 0 ${at - bite} ${h - 1} H${1 + r} Q1 ${h - 1} 1 ${h - 1 - r} V${1 + r} Q1 1 ${1 + r} 1 Z`,
    tear: `M${at} ${1 + bite + 5} V${h - 1 - bite - 5}`,
  }),
  // A notch: the card's top right corner bitten by a circle, holding a small control of the card's own (Study's settings, in the Practice
  // card) so it reads as part of the card. The circle's center sits `c` in from the corner; its radius `R` leaves a ring of room round the
  // control. The interface never mirrors, so it's always the right.
  notch: (w, h, { r = 20, R = 28, c = 18 }) => {
    const k = Math.sqrt(R * R - c * c);
    return {
      d: `M${1 + r} 1 H${(w - 1 - c - k).toFixed(2)} A${R} ${R} 0 0 0 ${w - 1} ${(1 + c + k).toFixed(2)} V${h - 1 - r} Q${w - 1} ${h - 1} ${w - 1 - r} ${h - 1} H${1 + r} Q1 ${h - 1} 1 ${h - 1 - r} V${1 + r} Q1 1 ${1 + r} 1 Z`,
    };
  },
  // A till receipt: straight sides, a zigzag foot where it was torn off.
  receipt: (w, h, { r = 16, tooth = 9, depth = 7 }) => {
    const n = Math.max(4, Math.round((w - 2) / (tooth * 2)));
    const step = (w - 2) / n;
    let d = `M${1 + r} 1 H${w - 1 - r} Q${w - 1} 1 ${w - 1} ${1 + r} V${h - 1 - depth}`;
    for (let i = n - 1; i >= 0; i--) d += ` L${(1 + (i + 0.5) * step).toFixed(2)} ${h - 1} L${(1 + i * step).toFixed(2)} ${h - 1 - depth}`;
    return { d: `${d} V${1 + r} Q1 1 ${1 + r} 1 Z` };
  },
  // A ticket tucked under a card: the card's rounded box down to `ty`, and the stub coming out from under its foot, with a bite and a tear line at `at` when there's something to tear off.
  stubtuck: (w, h, { r = 22, ty = h - 40, at = null, inset = 24, foot = 16, bite = 7 }) => {
    const card = `M${1 + r} 1 H${w - 1 - r} Q${w - 1} 1 ${w - 1} ${1 + r} V${ty - r} Q${w - 1} ${ty} ${w - 1 - r} ${ty} H${1 + r} Q1 ${ty} 1 ${ty - r} V${1 + r} Q1 1 ${1 + r} 1 Z`;
    const x1 = w - inset;
    const notch = at === null ? "" : `H${at - bite} A${bite} ${bite} 0 0 1 ${at + bite} ${h - 1} `;
    const stub = `M${inset} ${ty} V${h - 1 - foot} Q${inset} ${h - 1} ${inset + foot} ${h - 1} ${notch}H${x1 - foot} Q${x1} ${h - 1} ${x1} ${h - 1 - foot} V${ty}`;
    return { d: `${card} ${stub}`, tear: at === null ? null : `M${at} ${ty + 6} V${h - 1 - bite - 3}` };
  },
};

// Every outline on the page, by its svg: how to draw it now. An outline is drawn by its observer, after layout and before the frame is painted,
// so the page itself never shows one empty; but a copy of the page taken before that (a picture for a slide, shell/page-slide.js copyOf, in the
// same task that brought the page up to date as it comes back) copied the card with no line for the whole slide. drawOutlines draws them first.
const live = new WeakMap(); // svg → draw

/** Draws every outline inside `root` at its card's size now (a layout, if one is due), before `root` is copied for a picture of it. */
export function drawOutlines(root) {
  for (const svg of root.querySelectorAll("svg.lx-edge")) live.get(svg)?.();
}

/** Draws `kind` around `node` (position: relative; its own border transparent) and keeps it fitted. options.fit(node) can measure what's in it as it's drawn; options.drop: a hard edge
 *  that many px deep under the shape, showing only below it, with nothing painted behind the card. */
export function edge(node, kind, options = {}) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "lx-edge");
  svg.setAttribute("data-edge", kind);
  svg.setAttribute("aria-hidden", "true");
  // Sized by its card (redesign.css), the drawing stretched to it until it's drawn again at the new size.
  svg.setAttribute("preserveAspectRatio", "none");
  const id = `lx-edge-${++made}`;
  const drop = options.drop ?? 0;
  svg.style.setProperty("--edge-drop", `${drop}px`);
  // What it was last drawn for: put back at the same size (a kept page coming back to the screen), it isn't drawn again.
  let drawnFor = "";
  const paint = (w, h, fitted) => {
    drawnFor = `${w} ${h} ${JSON.stringify(fitted)}`;
    const shape = SHAPES[kind](w, h, fitted ? { ...options, ...fitted } : options);
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h + drop));
    svg.setAttribute("viewBox", `0 0 ${w} ${h + drop}`);
    const under = drop
      ? `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h + drop}"><rect width="${w}" height="${h + drop}" fill="#fff"/><path d="${shape.d}" fill="#000"/></mask><g mask="url(#${id})"><path class="lx-edge-drop" d="${shape.d}" transform="translate(0 ${drop})"/></g>`
      : "";
    svg.innerHTML = `${under}<path class="lx-edge-line" d="${shape.d}"/>${shape.tear ? `<path class="lx-edge-tear" d="${shape.tear}"/>` : ""}`;
  };
  const draw = () => {
    const w = node.offsetWidth, h = node.offsetHeight;
    if (!w || !h) return;
    const fitted = typeof options.fit === "function" ? options.fit(node) : null;
    if (`${w} ${h} ${JSON.stringify(fitted)}` === drawnFor && svg.firstChild) return;
    paint(w, h, fitted);
  };
  live.set(svg, draw);
  node.append(svg);
  new ResizeObserver(draw).observe(node);
  return svg;
}
