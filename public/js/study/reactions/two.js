// Two's two stories, the apples' own. Happy: cold from the fridge, they bead: the skins go from matte to dewy as condensation grows over
// both (thickest at the shoulders), and a few beads gather, merge and run down, each leaving a clear wet trail; they end beaded and fresh.
// Sad: one of the two is wormy: a small hole darkens on the right apple's side, a little frass pushes out, and a pale larva pokes its brown
// head out, wriggles, and stays there.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, paint, parsePath, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M54 84.3l.2-1.5c1 .2 1.9 .2 3 0l-.4 1.8c4.5-2 7.3-4.6 12.8-4.5 3.6 .1 8.8 5.9 10.6 8.7 7.9 12.3-1.2 30.9-10.2 40.2l-8.9 9.2c-1.7 1.7-3.1 3.6-4.4 5.6l-1.5-.2c-1.1 .7-2.6 .7-3.8 1.2-1.9 .8-3.7 1.6-5.7 1.9-8.8 1.5-15.7-5.4-20.3-12-8.6-12.2-13.8-30.4-4.9-43.9 2.5-3.8 6.1-7.1 10.3-9.1 3.1-1.5 6.4-2.2 9.7-2.2 5.6 .1 8.8 2.5 13.5 4.8ZM144 84.3l.2-1.5c1 .2 1.9 .2 3 0l-.4 1.8c4.5-2 7.3-4.6 12.8-4.5 3.6 .1 8.8 5.9 10.6 8.7 7.9 12.3-1.2 30.9-10.2 40.2l-8.9 9.2c-1.7 1.7-3.1 3.6-4.4 5.6l-1.5-.2c-1.1 .7-2.6 .7-3.8 1.2-1.9 .8-3.7 1.6-5.7 1.9-8.8 1.5-15.7-5.4-20.3-12-8.6-12.2-13.8-30.4-4.9-43.9 2.5-3.8 6.1-7.1 10.3-9.1 3.1-1.5 6.4-2.2 9.7-2.2 5.6 .1 8.8 2.5 13.5 4.8Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M54.8 143.9c1.4-2 2.8-4 4.5-5.8l8.6-8.7c7.2-7.5 13.2-18.5 13.6-29.2 .4-10.8-7-19.5-18.1-19.2 15.8-5 28.3 5.8 30.2 21.4 1.8 14.4-7.5 35.6-20.6 42.5-4 2-8.2 2.4-12.4 .9-2-.8-3.6-1.6-5.7-1.9ZM144.8 143.9c1.3-2 2.8-4 4.5-5.8l8.6-8.7c7.2-7.5 13.2-18.5 13.6-29.2 .4-10.8-7-19.5-18.1-19.2 15.8-5 28.2 5.8 30.2 21.4 1.8 14.4-7.5 35.6-20.6 42.5-4 2-8.2 2.4-12.4 .9-2-.8-3.6-1.6-5.7-1.9Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M86.2 59.2c-2 6.9-5.9 14-13.2 16.1-5.1 1.5-13.6-1.6-15.8 3.9-1.6-1.7-1.8-3.9-2.5-6 .2-.3 .5-.6 .8-.9 .2 .2 .4 .5 .6 .8 3.9-7.9 8-13.1 17.4-13.8 4.3-.4 8.5 .9 12.8-.1ZM176.2 59.2c-2 6.9-5.9 14-13.2 16.1-5.1 1.5-13.6-1.6-15.8 3.9-1.6-1.7-1.8-3.9-2.5-6 .2-.3 .5-.6 .8-.9 .2 .2 .4 .5 .7 .8 3.9-7.9 7.9-13.1 17.4-13.8 4.2-.4 8.5 .9 12.7-.1Z\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M57.2 84.4c-1.4 .4-2.4 .3-3.7-.2 .6-3.8 .2-7.5-2-10.8-.6-.8-1.8-1.6-2-2.5-.4-1.1 .7-2.6 1.7-2.9 1.8-.5 3.4 1.8 4.2 3.2 2.5 4 2.7 8.6 1.9 13.2ZM147.2 84.4c-1.3 .4-2.3 .3-3.7-.2 .7-3.8 .2-7.5-2.1-10.8-.5-.8-1.7-1.6-2-2.5-.3-1.1 .8-2.6 1.8-2.9 1.8-.5 3.4 1.8 4.2 3.2 2.5 4 2.7 8.6 1.8 13.2Z\" fill=\"var(--art-ink,#231F3B)\"/>\n</svg>\n";
export const STILL_HASH = "f5c210dd9b";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 5) throw new Error("two: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const dOf = (svg) => /d="([^"]+)"/.exec(svg)[1];
// the still's parts: the wall; both apples (one path, a part each); their shaded right sides; the leaves; the stems
const [WALL, APPLES, SHADE, LEAVES, STEMS] = EL;
const APPLES_D = dOf(APPLES);
// short numbers (tenths), for the many beads
const f1 = (v) => { const r = Math.round(v * 10) / 10, s = (r === 0 ? 0 : r).toString(); return s.replace(/^(-?)0\./, "$1."); };
const rnd = (i) => { const x = Math.sin(i * 78.233 + 12.9898) * 43758.5453; return x - Math.floor(x); };
// outlines as polygons (each part of a path), to place beads inside an apple and tell which lie on its shaded side
const outlines = (d) => parsePath(d).map((run) => run.segs.flatMap((s) => Array.from({ length: 6 }, (_, k) => { const t = k / 6, u = 1 - t; return [0, 1].map((j) => u * u * u * s[0][j] + 3 * u * u * t * s[1][j] + 3 * u * t * t * s[2][j] + t * t * t * s[3][j]); })));
const inside = (P, [x, y]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
// (an apple's outline is its lit part and its shaded side together: the still draws them as two shapes)
const APPLE_OUT = outlines(APPLES_D), SHADE_OUT = outlines(dOf(SHADE));
const onApple = (a, p) => inside(APPLE_OUT[a], p) || inside(SHADE_OUT[a], p);

// ---- happy: the beads, placed once (inside each apple, kept in from its edge; more at the shoulders, above y 104), each with the moment it
// forms and its size. Water on the skin reads lighter than the skin (it gives back the light): each bead a body a touch lighter than the
// skin under it, a crisp bright highlight on its lit side and a thin dark edge on its shadow side. Then the runs: on each apple two places
// where beads gather into a drop that runs down, leaving a lighter wet streak with the drop at its foot. The skin's own highlight sharpens
// as it gets wet: a fixed gloss on each apple's upper left, growing in where it lies.
const BEADS = (() => {
  const out = [];
  APPLE_OUT.forEach((P, a) => {
    const all = [...P, ...SHADE_OUT[a]], xs = all.map((p) => p[0]), ys = all.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) + 6, y1 = Math.max(...ys) - 6;
    for (let i = 0, n = 0; n < 16 && i < 6000; i++) {
      const p = [x0 + 5 + (x1 - x0 - 10) * rnd(a * 1000 + i * 2), y0 + (y1 - y0) * rnd(a * 1000 + i * 2 + 1)];
      if (!onApple(a, p) || !onApple(a, [p[0] - 5, p[1]]) || !onApple(a, [p[0] + 5, p[1]]) || !onApple(a, [p[0], p[1] + 5])) continue;
      if (p[1] > 104 && rnd(a * 77 + i) < 0.45) continue;
      if (out.some((q) => Math.hypot(q.x - p[0], q.y - p[1]) < 9.5)) continue;
      out.push({ x: p[0], y: p[1], r: 2.3 + 1.4 * rnd(a * 31 + n), t0: 0.2 + 1.4 * rnd(a * 53 + n), shade: SHADE_OUT.some((S) => inside(S, p)) });
      n++;
    }
  });
  return out;
})();
const RUNS = [
  // [x, top, bottom, gather at, run from, run to]
  [50, 94, 133, 1.25, 1.6, 2.25], [68, 100, 128, 1.45, 1.8, 2.4],
  [140, 94, 134, 1.3, 1.65, 2.3], [158, 101, 126, 1.5, 1.85, 2.45],
];
// a bead: its thin dark edge on the shadow side (a darker copy set down and right), the lighter body, the bright highlight up and left
const bead = (x, y, r, shade, parts) => {
  parts[shade ? "edgeS" : "edge"] += `<ellipse cx="${f1(x + r * 0.16)}" cy="${f1(y + r * 0.2)}" rx="${f1(r)}" ry="${f1(r * 0.88)}"/>`;
  parts[shade ? "bodyS" : "body"] += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r)}" ry="${f1(r * 0.88)}"/>`;
  if (r > 0.8) parts.hi += `<circle cx="${f1(x - r * 0.36)}" cy="${f1(y - r * 0.38)}" r="${f1(r * 0.3)}"/>`;
};
const HAPPY_DUR = 2.45 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const parts = { edge: "", body: "", edgeS: "", bodyS: "", hi: "" };
  let trails = "";
  const runs = RUNS.map(([x, top, bottom, tg, t1, t2]) => {
    const gather = track([[tg, 0], [t1, 1, "out"]], t), go = track([[t1, 0], [t2, 1, "io"]], t);
    return { x, top, y: top + (bottom - top) * go, gather, go };
  });
  // a run's line: wandering a little as it follows the skin
  const along = (r, y) => r.x + 1.1 * Math.sin((y - r.top) / 6.5);
  const wiped = (b) => runs.some((r) => r.go > 0 && Math.abs(b.x - along(r, b.y)) < 3.5 && b.y > r.top - 2 && b.y < r.y);
  for (const b of BEADS) {
    const g = track([[b.t0, 0], [b.t0 + 0.45, 1, "out"]], t);
    if (g < 0.02 || wiped(b)) continue;
    // a bead near a run's top joins its drop as it gathers
    const into = runs.find((r) => r.gather > 0 && Math.hypot(b.x - r.x, b.y - r.top) < 9);
    const k = into ? 1 - into.gather : 1, x = into ? b.x + (into.x - b.x) * into.gather : b.x, y = into ? b.y + (into.top - b.y) * into.gather : b.y;
    if (g * k < 0.05) continue;
    bead(x, y, b.r * g * Math.sqrt(k), b.shade, parts);
  }
  for (const r of runs) {
    if (r.gather <= 0.02) continue;
    const size = 1.8 + 2 * r.gather, x = along(r, r.y);
    if (r.go > 0.01) { let d = `M${f1(r.x)} ${f1(r.top)}`; for (let y = r.top + 3; y < r.y; y += 3) d += `L${f1(along(r, y))} ${f1(y)}`; trails += `<path d="${d}L${f1(x)} ${f1(r.y)}"/>`; }
    bead(x, r.y, size, false, parts);
  }
  // the gloss: a short bright arc on each apple's upper left, growing along itself as the skin gets wet
  const w = track([[0.5, 0], [2.0, 1, "io"]], t);
  let gloss = "";
  if (w > 0.02) for (const [cx, cy] of [[57, 113], [147, 113]]) {
    const a0 = (186 * Math.PI) / 180, a1 = ((186 + 34 * w) * Math.PI) / 180, R = 27;
    gloss += `<path d="M${f1(cx + R * Math.cos(a0))} ${f1(cy + R * Math.sin(a0))}A${R} ${R} 0 0 1 ${f1(cx + R * Math.cos(a1))} ${f1(cy + R * Math.sin(a1))}"/>`;
  }
  const dew = `<clipPath id="ap"><path d="${APPLES_D}"/><path d="${dOf(SHADE)}"/></clipPath><g clip-path="url(#ap)">`
    + (gloss ? `<g fill="none" stroke="${paint("clay-lit")}" stroke-width="3.2" stroke-linecap="round">${gloss}</g>` : "")
    + `<g fill="none" stroke="${paint("clay-lit")}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${trails}</g>`
    + `<g ${fill("clay-deep")}>${parts.edge}</g><g ${fill("clay-lit")}>${parts.body}</g><g ${fill("clay-deeper")}>${parts.edgeS}</g><g ${fill("clay")}>${parts.bodyS}</g><g ${fill("paper")}>${parts.hi}</g></g>`;
  return `${OPEN}${WALL}${APPLES}${SHADE}${dew}${LEAVES}${STEMS}</svg>`;
}

// ---- sad: the right apple's worm. A hole darkens on its lit side, its rim bruising; frass crumbs push out under it; the larva's brown head
// comes out up and to the left, its pale body after it, ringed; it wriggles, slowing, and stays out
const HOLE = [139, 108];
const FRASS = [[-2, 4.3, 1.4], [1.7, 5.2, 1.1], [-0.2, 7.1, 1.5], [3.3, 3.7, 1]];
const SAD_DUR = 2.6 + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  const h = track([[0.25, 0], [0.6, 1, "out"]], t);
  let worm = "";
  if (h > 0.01) {
    worm += `<ellipse cx="${HOLE[0]}" cy="${HOLE[1]}" rx="${n2(4.6 * h)}" ry="${n2(4.1 * h)}" ${fill("clay-deeper")}/><ellipse cx="${HOLE[0]}" cy="${HOLE[1]}" rx="${n2(3.4 * h)}" ry="${n2(3 * h)}" ${fill("bark-deep")}/>`;
    FRASS.forEach(([dx, dy, r], i) => {
      const g = track([[0.5 + i * 0.08, 0], [0.95 + i * 0.08, 1, "out"]], t);
      if (g > 0.02) worm += `<circle cx="${n2(HOLE[0] + dx * (0.6 + 0.4 * g))}" cy="${n2(HOLE[1] + dy * g)}" r="${n2(r * g)}" ${fill(i % 2 ? "bark" : "bark-deep")}/>`;
    });
    // the larva: out from 0.95 s, up and to the left; then wriggling, side to side, slowing to rest
    const out = track([[0.95, 0], [1.55, 1, "out"]], t);
    if (out > 0.01) {
      const wig = 1.8 * Math.exp(-Math.max(0, t - 1.55) * 2.2) * Math.sin(Math.max(0, t - 1.55) * 15) * track([[1.55, 0], [1.7, 1]], t);
      const head = [HOLE[0] + (-7.2 + wig) * out, HOLE[1] + (-9.1 + wig * 0.4) * out], ctrl = [HOLE[0] - 5.8 * out - wig * 0.5, HOLE[1] - 1.6 * out];
      const at = (s) => { const u = 1 - s; return [u * u * HOLE[0] + 2 * u * s * ctrl[0] + s * s * head[0], u * u * HOLE[1] + 2 * u * s * ctrl[1] + s * s * head[1]]; };
      worm += `<path d="M${HOLE[0]} ${HOLE[1]}Q${n2(ctrl[0])} ${n2(ctrl[1])} ${n2(head[0])} ${n2(head[1])}" fill="none" stroke="${paint("paper-mid")}" stroke-width="${n2(5.7 * Math.min(1, out * 2.5))}" stroke-linecap="round"/>`;
      // its rings, across the body
      let rings = "";
      for (const s of [0.3, 0.55, 0.78]) {
        if (s > out + 0.2) continue;
        const p = at(s), q = at(Math.min(1, s + 0.05)), dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        rings += `M${n2(p[0] + nx * 2.5)} ${n2(p[1] + ny * 2.5)}L${n2(p[0] - nx * 2.5)} ${n2(p[1] - ny * 2.5)}`;
      }
      if (rings) worm += `<path d="${rings}" stroke="${paint("paper-deeper")}" stroke-width=".7" fill="none"/>`;
      worm += `<circle cx="${n2(head[0])}" cy="${n2(head[1])}" r="${n2(3 * Math.min(1, out * 1.6))}" ${fill("bark")}/>`;
    }
  }
  return `${OPEN}${WALL}${APPLES}${SHADE}${worm}${LEAVES}${STEMS}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
