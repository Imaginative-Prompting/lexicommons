// What the stories share: keys over time, in seconds, and a few plain deformers over path data. Pure: no DOM, nothing on load. Every frame of a story is a pure function of time.
export const CURVES = {
  lin: (x) => x,
  io: (x) => x * x * (3 - 2 * x),
  in: (x) => x * x, // falling: starts slow, hits at speed
  in3: (x) => x * x * x,
  out: (x) => 1 - (1 - x) * (1 - x), // pushed: starts fast
  out3: (x) => 1 - (1 - x) ** 3,
  back: (x) => { const c = 1.25, u = x - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
};
/** A value over time: [[t, value, curve into it], ...]. */
export const track = (k, t) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * CURVES[k[i][2] ?? "io"]((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
  }
  return k[k.length - 1][1];
};
export const n2 = (v) => { const s = (Math.round(v * 100) / 100).toString(); return s === "-0" ? "0" : s; };
/** For scales and matrices: a hundredth of a scale is 1.7 units on a 170-unit shape, a visible step, so these keep four places. */
export const n4 = (v) => { const s = (Math.round(v * 10000) / 10000).toString(); return s === "-0" ? "0" : s; };
const HEX = { paper: "#FBF7EC", "paper-mid": "#EDE6D5", "paper-deep": "#DAD1BC", "paper-deeper": "#BDB19A", ground: "#D3CAB5", ink: "#231F3B", "ink-lit": "#3A3460", steel: "#A9B0BF", "steel-deep": "#6B687A", sky: "#58ADEB", "sky-lit": "#8FCDF4", "sky-pale": "#C9E7F9", "sky-deep": "#3488C9", sun: "#F7BE45", "sun-lit": "#FAD57E", "sun-deep": "#DB9A22", clay: "#E8743B", "clay-lit": "#F6A06F", "clay-deep": "#C25626", "clay-deeper": "#9C4219", violet: "#7C5CE6", "violet-lit": "#A68CFF", "violet-deep": "#5E40C4", teal: "#37B39B", "teal-lit": "#6FD0BD", "teal-deep": "#25907B", skin: "#E9B48A", "skin-deep": "#CF9468", wood: "#DCA063", "wood-deep": "#B97F45", bark: "#7A4E2D", "bark-deep": "#4B2F24" };
/** A fill in the app's art tokens. */
export const paint = (t) => { if (!HEX[t]) throw new Error(`no art token ${t}`); return `var(--art-${t},${HEX[t]})`; };
/** A still's paths, in order: its text, path data, fill and rule. */
export const partsOf = (still) => [...still.matchAll(/<path d="([^"]*)" fill="([^"]*)"((?: fill-rule="evenodd")?)\/>/g)].map((m) => ({ svg: m[0], d: m[1], fill: m[2], rule: m[3] }));
/** A closed smooth curve through points. */
export function blob(P) {
  const n = P.length;
  let d = `M${n2(P[0][0])} ${n2(P[0][1])}`;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], z = P[(i - 1 + n) % n], c = P[(i + 2) % n];
    d += `C${n2(a[0] + (b[0] - z[0]) / 6)} ${n2(a[1] + (b[1] - z[1]) / 6)} ${n2(b[0] - (c[0] - a[0]) / 6)} ${n2(b[1] - (c[1] - a[1]) / 6)} ${n2(b[0])} ${n2(b[1])}`;
  }
  return `${d}Z`;
}
/** Path data to runs of cubics. */
export function parsePath(d) {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g);
  const runs = [];
  let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, cx = null, cy = null, run = null;
  const num = () => Number(toks[i++]);
  const line = (nx, ny) => { run.segs.push([[x, y], [x + (nx - x) / 3, y + (ny - y) / 3], [x + (2 * (nx - x)) / 3, y + (2 * (ny - y)) / 3], [nx, ny]]); x = nx; y = ny; };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    if (C === "M") {
      x = num() + (rel ? x : 0); y = num() + (rel ? y : 0); sx = x; sy = y;
      run = { segs: [], closed: false }; runs.push(run);
      cmd = rel ? "l" : "L"; cx = null;
    } else if (C === "L") { const nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0); line(nx, ny); cx = null; }
    else if (C === "H") { const nx = num() + (rel ? x : 0); line(nx, y); cx = null; }
    else if (C === "V") { const ny = num() + (rel ? y : 0); line(x, ny); cx = null; }
    else if (C === "C" || C === "S") {
      let x1, y1;
      if (C === "C") { x1 = num() + (rel ? x : 0); y1 = num() + (rel ? y : 0); }
      else { x1 = cx === null ? x : 2 * x - cx; y1 = cy === null ? y : 2 * y - cy; }
      const x2 = num() + (rel ? x : 0), y2 = num() + (rel ? y : 0), nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0);
      run.segs.push([[x, y], [x1, y1], [x2, y2], [nx, ny]]);
      x = nx; y = ny; cx = x2; cy = y2;
    } else if (C === "Z") { run.closed = true; if (Math.hypot(x - sx, y - sy) > 1e-6) line(sx, sy); x = sx; y = sy; cx = null; }
    else throw new Error(`path command ${cmd}`);
  }
  return runs;
}
/** Finer curves, so a bend stays smooth. */
export function subdivide(runs, n) {
  if (n <= 1) return runs;
  return runs.map((r) => ({ closed: r.closed, segs: r.segs.flatMap((s) => {
    const out = []; let cur = s;
    for (let k = n; k > 1; k--) {
      const t = 1 / k, [a, b, c, d] = cur, mix = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      const ab = mix(a, b), bc = mix(b, c), cd = mix(c, d), abc = mix(ab, bc), bcd = mix(bc, cd), m = mix(abc, bcd);
      out.push([a, ab, abc, m]); cur = [m, bcd, cd, d];
    }
    out.push(cur); return out;
  }) }));
}
/** Runs of cubics back to path data, through a function of a point. */
export function runsToD(runs, fn) {
  let d = "";
  for (const r of runs) {
    const p0 = fn ? fn(r.segs[0][0][0], r.segs[0][0][1]) : r.segs[0][0];
    d += `M${n2(p0[0])} ${n2(p0[1])}`;
    for (const s of r.segs) {
      const a = fn ? fn(s[1][0], s[1][1]) : s[1], b = fn ? fn(s[2][0], s[2][1]) : s[2], c = fn ? fn(s[3][0], s[3][1]) : s[3];
      d += `C${n2(a[0])} ${n2(a[1])} ${n2(b[0])} ${n2(b[1])} ${n2(c[0])} ${n2(c[1])}`;
    }
    if (r.closed) d += "Z";
  }
  return d;
}
/** The same, written small: tenths, each point relative to the last as rounded, so nothing drifts. For paths warped every frame, where bytes add up. */
export function runsToDc(runs, fn) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const num = (v) => { let s = String(Math.round(v * 10) / 10); if (s === "-0") s = "0"; return s.replace(/^(-?)0\./, "$1."); };
  let d = "";
  const put = (vals) => { for (const v of vals) { const s = num(v); d += s[0] === "-" ? s : ` ${s}`; } };
  for (const r of runs) {
    const map = (q) => { const p = fn ? fn(q[0], q[1]) : q; return [r1(p[0]), r1(p[1])]; };
    let [x, y] = map(r.segs[0][0]);
    d += `M${num(x)} ${num(y)}c`;
    let first = true;
    for (const s of r.segs) {
      const a = map(s[1]), b = map(s[2]), c = map(s[3]);
      const vals = [a[0] - x, a[1] - y, b[0] - x, b[1] - y, c[0] - x, c[1] - y];
      if (first) { const t0 = num(vals[0]); d += t0; put(vals.slice(1)); first = false; } else put(vals);
      x = c[0]; y = c[1];
    }
    if (r.closed) d += "Z";
  }
  return d;
}
export const scaleAbout = (x, y, px, py, sx, sy) => [px + (x - px) * sx, py + (y - py) * sy];
/** Bends along an axis, keeping its length: from the pivot along `ang` degrees, the shape curves by `turn` degrees over `len`. Points before the pivot don't move. */
export function bendAbout(x, y, px, py, ang, len, turn) {
  if (Math.abs(turn) < 1e-3) return [x, y];
  const a = (ang * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const s = (x - px) * ux + (y - py) * uy, n = (x - px) * nx + (y - py) * ny;
  if (s <= 0) return [x, y];
  const T = (turn * Math.PI) / 180, R = len / T, q = Math.min(s, len), th = (q / len) * T;
  const ax = R * Math.sin(th) - n * Math.sin(th), ay = R * (1 - Math.cos(th)) + n * Math.cos(th);
  const rest = s - q, bx = ax + rest * Math.cos(T), by = ay + rest * Math.sin(T);
  return [px + bx * ux + by * nx, py + bx * uy + by * ny];
}
