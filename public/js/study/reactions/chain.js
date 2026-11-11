// Chain's story, its sad alone (its happy was the same fall: the player keeps the still for it): the right fixing's stem snaps under the chain's
// weight. Its end let go, the chain swings down from the left fixing, faster and faster, its free end sweeping down, and its lower length comes down
// on the floor and lies there in a heap, the rest hanging straight down the wall; the broken stem lies on the floor below the right fixing.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor (from y 178), the links' shadows on the wall, eight
// round links (each an outer ring with a hole: shade and lit) and seven links seen edge on between them, hanging in a U between two fixings (each a
// round head and a short stem, its end at 48.3) at 30 and 170 across. The links (3 cm) are 16 apart: 530 to the meter, gravity 5200. The chain's
// fall is worked out once, link by link (each link a point at its middle, each the same distance from the next, the floor holding them up with
// friction), and every frame reads it.
import { n2, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"178\" width=\"200\" height=\"22\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M40.7 58.7L44.4 69A8 8 0 0 1 29.3 74.3L25.6 64A8 8 0 0 1 40.7 58.7ZM36.2 60.3L39.8 70.6A3.2 3.2 0 0 1 33.8 72.7L30.2 62.4A3.2 3.2 0 0 1 36.2 60.3ZM52 87.8L56.9 97.7A8 8 0 0 1 42.5 104.8L37.7 94.9A8 8 0 0 1 52 87.8ZM47.7 90L52.6 99.8A3.2 3.2 0 0 1 46.8 102.7L42 92.8A3.2 3.2 0 0 1 47.7 90ZM67 114.3L73.9 122.8A8 8 0 0 1 61.5 132.9L54.6 124.4A8 8 0 0 1 67 114.3ZM63.3 117.3L70.2 125.8A3.2 3.2 0 0 1 65.3 129.9L58.3 121.3A3.2 3.2 0 0 1 63.3 117.3ZM87.2 133.8L97.4 138A8 8 0 0 1 91.4 152.8L81.2 148.7A8 8 0 0 1 87.2 133.8ZM85.4 138.3L95.6 142.5A3.2 3.2 0 0 1 93.2 148.4L83 144.2A3.2 3.2 0 0 1 85.4 138.3ZM112.6 138L122.8 133.8A8 8 0 0 1 128.8 148.7L118.6 152.8A8 8 0 0 1 112.6 138ZM114.4 142.5L124.6 138.3A3.2 3.2 0 0 1 127 144.2L116.8 148.4A3.2 3.2 0 0 1 114.4 142.5ZM136.1 122.8L143 114.3A8 8 0 0 1 155.4 124.4L148.5 132.9A8 8 0 0 1 136.1 122.8ZM139.8 125.8L146.7 117.3A3.2 3.2 0 0 1 151.7 121.3L144.7 129.9A3.2 3.2 0 0 1 139.8 125.8ZM153.1 97.7L158 87.8A8 8 0 0 1 172.3 94.9L167.5 104.8A8 8 0 0 1 153.1 97.7ZM157.4 99.8L162.3 90A3.2 3.2 0 0 1 168 92.8L163.2 102.7A3.2 3.2 0 0 1 157.4 99.8ZM165.6 69L169.3 58.7A8 8 0 0 1 184.4 64L180.7 74.3A8 8 0 0 1 165.6 69ZM170.2 70.6L173.8 60.3A3.2 3.2 0 0 1 179.8 62.4L176.2 72.7A3.2 3.2 0 0 1 170.2 70.6Z\" fill-rule=\"evenodd\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M38.7 70.4L47.1 91A2.4 2.4 0 0 1 42.7 92.8L34.3 72.2A2.4 2.4 0 0 1 38.7 70.4ZM51.2 99.7L62.8 118.6A2.4 2.4 0 0 1 58.7 121.1L47.1 102.2A2.4 2.4 0 0 1 51.2 99.7ZM68.5 126.1L85.7 140.2A2.4 2.4 0 0 1 82.6 143.9L65.4 129.9A2.4 2.4 0 0 1 68.5 126.1ZM93.9 144.1L116.1 144.1A2.4 2.4 0 0 1 116.1 148.9L93.9 148.9A2.4 2.4 0 0 1 93.9 144.1ZM124.3 140.2L141.5 126.1A2.4 2.4 0 0 1 144.6 129.9L127.4 143.9A2.4 2.4 0 0 1 124.3 140.2ZM147.2 118.6L158.8 99.7A2.4 2.4 0 0 1 162.9 102.2L151.3 121.1A2.4 2.4 0 0 1 147.2 118.6ZM162.9 91L171.3 70.4A2.4 2.4 0 0 1 175.7 72.2L167.3 92.8A2.4 2.4 0 0 1 162.9 91ZM29.5 45.1h6v9.5a3 3 0 0 1-6 0ZM169.5 45.1h6v9.5a3 3 0 0 1-6 0Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M35.7 52.2L39.4 62.5A8 8 0 0 1 24.3 67.8L20.6 57.5A8 8 0 0 1 35.7 52.2ZM31.2 53.8L34.8 64.1A3.2 3.2 0 0 1 28.8 66.2L25.2 55.9A3.2 3.2 0 0 1 31.2 53.8ZM47 81.3L51.9 91.2A8 8 0 0 1 37.5 98.3L32.7 88.4A8 8 0 0 1 47 81.3ZM42.7 83.5L47.6 93.3A3.2 3.2 0 0 1 41.8 96.2L37 86.3A3.2 3.2 0 0 1 42.7 83.5ZM62 107.8L68.9 116.3A8 8 0 0 1 56.5 126.4L49.6 117.9A8 8 0 0 1 62 107.8ZM58.3 110.8L65.2 119.3A3.2 3.2 0 0 1 60.3 123.4L53.3 114.8A3.2 3.2 0 0 1 58.3 110.8ZM82.2 127.3L92.4 131.5A8 8 0 0 1 86.4 146.3L76.2 142.2A8 8 0 0 1 82.2 127.3ZM80.4 131.8L90.6 136A3.2 3.2 0 0 1 88.2 141.9L78 137.7A3.2 3.2 0 0 1 80.4 131.8ZM107.6 131.5L117.8 127.3A8 8 0 0 1 123.8 142.2L113.6 146.3A8 8 0 0 1 107.6 131.5ZM109.4 136L119.6 131.8A3.2 3.2 0 0 1 122 137.7L111.8 141.9A3.2 3.2 0 0 1 109.4 136ZM131.1 116.3L138 107.8A8 8 0 0 1 150.4 117.9L143.5 126.4A8 8 0 0 1 131.1 116.3ZM134.8 119.3L141.7 110.8A3.2 3.2 0 0 1 146.7 114.8L139.7 123.4A3.2 3.2 0 0 1 134.8 119.3ZM148.1 91.2L153 81.3A8 8 0 0 1 167.3 88.4L162.5 98.3A8 8 0 0 1 148.1 91.2ZM152.4 93.3L157.3 83.5A3.2 3.2 0 0 1 163 86.3L158.2 96.2A3.2 3.2 0 0 1 152.4 93.3ZM160.6 62.5L164.3 52.2A8 8 0 0 1 179.4 57.5L175.7 67.8A8 8 0 0 1 160.6 62.5ZM165.2 64.1L168.8 53.8A3.2 3.2 0 0 1 174.8 55.9L171.2 66.2A3.2 3.2 0 0 1 165.2 64.1Z\" fill-rule=\"evenodd\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M34.8 51.3L38.5 61.6A8 8 0 0 1 23.4 66.9L19.7 56.6A8 8 0 0 1 34.8 51.3ZM30.3 52.9L33.9 63.2A3.2 3.2 0 0 1 27.9 65.3L24.3 55A3.2 3.2 0 0 1 30.3 52.9ZM46.1 80.4L51 90.3A8 8 0 0 1 36.6 97.4L31.8 87.5A8 8 0 0 1 46.1 80.4ZM41.8 82.6L46.7 92.4A3.2 3.2 0 0 1 40.9 95.3L36.1 85.4A3.2 3.2 0 0 1 41.8 82.6ZM61.1 106.9L68 115.4A8 8 0 0 1 55.6 125.5L48.7 117A8 8 0 0 1 61.1 106.9ZM57.4 109.9L64.3 118.4A3.2 3.2 0 0 1 59.4 122.5L52.4 113.9A3.2 3.2 0 0 1 57.4 109.9ZM81.3 126.4L91.5 130.6A8 8 0 0 1 85.5 145.4L75.3 141.3A8 8 0 0 1 81.3 126.4ZM79.5 130.9L89.7 135.1A3.2 3.2 0 0 1 87.3 141L77.1 136.8A3.2 3.2 0 0 1 79.5 130.9ZM106.7 130.6L116.9 126.4A8 8 0 0 1 122.9 141.3L112.7 145.4A8 8 0 0 1 106.7 130.6ZM108.5 135.1L118.7 130.9A3.2 3.2 0 0 1 121.1 136.8L110.9 141A3.2 3.2 0 0 1 108.5 135.1ZM130.2 115.4L137.1 106.9A8 8 0 0 1 149.5 117L142.6 125.5A8 8 0 0 1 130.2 115.4ZM133.9 118.4L140.8 109.9A3.2 3.2 0 0 1 145.8 113.9L138.8 122.5A3.2 3.2 0 0 1 133.9 118.4ZM147.2 90.3L152.1 80.4A8 8 0 0 1 166.4 87.5L161.6 97.4A8 8 0 0 1 147.2 90.3ZM151.5 92.4L156.4 82.6A3.2 3.2 0 0 1 162.1 85.4L157.3 95.3A3.2 3.2 0 0 1 151.5 92.4ZM159.7 61.6L163.4 51.3A8 8 0 0 1 178.5 56.6L174.8 66.9A8 8 0 0 1 159.7 61.6ZM164.3 63.2L167.9 52.9A3.2 3.2 0 0 1 173.9 55L170.3 65.3A3.2 3.2 0 0 1 164.3 63.2Z\" fill-rule=\"evenodd\" fill=\"var(--art-steel,#A9B0BF)\"/><circle cx=\"30\" cy=\"39.8\" r=\"4.2\" fill=\"var(--art-steel-deep,#6B687A)\"/><circle cx=\"29.4\" cy=\"39.2\" r=\"3.4\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M27.8 39.8h4.4v8.5a2.2 2.2 0 0 1-4.4 0Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M27.8 39.8h3.2v8.2a1.6 1.6 0 0 1-3.2 0Z\" fill=\"var(--art-steel,#A9B0BF)\"/><circle cx=\"170\" cy=\"39.8\" r=\"4.2\" fill=\"var(--art-steel-deep,#6B687A)\"/><circle cx=\"169.4\" cy=\"39.2\" r=\"3.4\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M167.8 39.8h4.4v8.5a2.2 2.2 0 0 1-4.4 0Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M167.8 39.8h3.2v8.2a1.6 1.6 0 0 1-3.2 0Z\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M33.7 63.9L42.1 84.5A2.4 2.4 0 0 1 37.7 86.3L29.3 65.7A2.4 2.4 0 0 1 33.7 63.9ZM46.2 93.2L57.8 112.1A2.4 2.4 0 0 1 53.7 114.6L42.1 95.7A2.4 2.4 0 0 1 46.2 93.2ZM63.5 119.6L80.7 133.7A2.4 2.4 0 0 1 77.6 137.4L60.4 123.4A2.4 2.4 0 0 1 63.5 119.6ZM88.9 137.6L111.1 137.6A2.4 2.4 0 0 1 111.1 142.4L88.9 142.4A2.4 2.4 0 0 1 88.9 137.6ZM119.3 133.7L136.5 119.6A2.4 2.4 0 0 1 139.6 123.4L122.4 137.4A2.4 2.4 0 0 1 119.3 133.7ZM142.2 112.1L153.8 93.2A2.4 2.4 0 0 1 157.9 95.7L146.3 114.6A2.4 2.4 0 0 1 142.2 112.1ZM157.9 84.5L166.3 63.9A2.4 2.4 0 0 1 170.7 65.7L162.3 86.3A2.4 2.4 0 0 1 157.9 84.5Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M32.6 62.8L41.7 85A1.5 1.5 0 0 1 39 86.2L29.9 63.9A1.5 1.5 0 0 1 32.6 62.8ZM45 92.2L57.6 112.7A1.5 1.5 0 0 1 55.1 114.2L42.5 93.7A1.5 1.5 0 0 1 45 92.2ZM62.1 118.9L80.8 134.1A1.5 1.5 0 0 1 78.9 136.4L60.3 121.3A1.5 1.5 0 0 1 62.1 118.9ZM87.6 137.6L111.6 137.6A1.5 1.5 0 0 1 111.6 140.5L87.6 140.5A1.5 1.5 0 0 1 87.6 137.6ZM118.4 134.1L137.1 118.9A1.5 1.5 0 0 1 138.9 121.3L120.3 136.4A1.5 1.5 0 0 1 118.4 134.1ZM141.6 112.7L154.2 92.2A1.5 1.5 0 0 1 156.7 93.7L144.1 114.2A1.5 1.5 0 0 1 141.6 112.7ZM157.5 85L166.6 62.8A1.5 1.5 0 0 1 169.3 63.9L160.2 86.2A1.5 1.5 0 0 1 157.5 85Z\" fill=\"var(--art-steel,#A9B0BF)\"/></svg>\n";
export const STILL_HASH = "a20876e11d";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 16 || !EL[2].includes("M40.7 58.7L44.4 69A8 8 0 0 1 29.3 74.3") || !EL[10].includes('cx="170" cy="39.8"')) throw new Error("chain: the still isn't as this story knows it");
const subs = (e) => e.match(/ d="([^"]*)"/)[1].match(/M[^M]*/g);
const attrs = (e) => e.replace(/^<path d="[^"]*"/, "").replace(/\/>$/, "");
// each layer's subpaths, gathered by link: the round links have two subpaths (ring and hole), the edge-on ones one
const ROUND = [2, 4, 5].map((i) => ({ attr: attrs(EL[i]), parts: subs(EL[i]) }));
const EDGE = [14, 15].map((i) => ({ attr: attrs(EL[i]), parts: subs(EL[i]) }));
const EDGE_SHADOW = { attr: attrs(EL[3]), parts: subs(EL[3]) };
// numbers in a subpath (M, L, A with circles, Z), its points, and moving them
const nums = (p) => p.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g);
function points(p) {
  const t = nums(p), P = []; let i = 0, c = null;
  while (i < t.length) { if (/[A-Za-z]/.test(t[i])) c = t[i++]; if (c === "M" || c === "L") { P.push([+t[i], +t[i + 1]]); i += 2; } else if (c === "A") { P.push([+t[i + 5], +t[i + 6]]); i += 7; } else if (c === "Z") { /* */ } else throw new Error(`chain: ${c}`); }
  return P;
}
function moved(p, f) {
  const t = nums(p); let i = 0, c = null, out = "";
  while (i < t.length) {
    if (/[A-Za-z]/.test(t[i])) { c = t[i++]; out += c; }
    if (c === "M" || c === "L") { const q = f([+t[i], +t[i + 1]]); out += `${n2(q[0])} ${n2(q[1])}`; i += 2; }
    else if (c === "A") { const q = f([+t[i + 5], +t[i + 6]]); out += `${t[i]} ${t[i + 1]} 0 ${t[i + 3]} ${t[i + 4]} ${n2(q[0])} ${n2(q[1])}`; i += 7; }
  }
  return out;
}
const mid = (P) => [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length];
// the links in order along the chain, left to right: round, edge, round, … (8 round, 7 edge); each its middle at rest
const LINKS = [];
for (let k = 0; k < 15; k++) LINKS.push(k % 2 === 0 ? { round: k / 2, c: mid(points(ROUND[2].parts[k])) } : { edge: (k - 1) / 2, c: mid(points(EDGE[1].parts[(k - 1) / 2])) });
const ANCHOR = [30, 48.3], RIGHT_END = [170, 48.3], FLOOR = 178 - 4;
const NODES0 = [ANCHOR, ...LINKS.map((l) => l.c)];
const LEN = NODES0.slice(1).map((p, i) => Math.hypot(p[0] - NODES0[i][0], p[1] - NODES0[i][1]));
const restAngle = (k, N) => { const a = N[k], b = N[Math.min(N.length - 1, k + 2)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
// ---- the fall, worked out once: the chain let go at its right end
const G = 5200, T_SNAP = 0.4, STEP = 1 / 4000, KEEP = 200, RUN = 2.2;
const FALL = (() => {
  let X = NODES0.map((p) => [...p]), Y = NODES0.map((p) => [...p]);
  const frames = [];
  for (let s = 0; s <= RUN / STEP; s++) {
    if (s % (1 / STEP / KEEP) === 0) frames.push(X.map((p) => [...p]));
    for (let i = 1; i < X.length; i++) {
      const v = [(X[i][0] - Y[i][0]) * 0.9995, (X[i][1] - Y[i][1]) * 0.9995];
      Y[i] = X[i]; X[i] = [X[i][0] + v[0], X[i][1] + v[1] + G * STEP * STEP];
    }
    for (let it = 0; it < 24; it++) {
      for (let i = 0; i < LEN.length; i++) {
        const a = X[i], b = X[i + 1], d = [b[0] - a[0], b[1] - a[1]], m = Math.hypot(d[0], d[1]) || 1e-9, e = (m - LEN[i]) / m;
        if (i === 0) { X[1] = [b[0] - d[0] * e, b[1] - d[1] * e]; } else { X[i] = [a[0] + d[0] * e * 0.5, a[1] + d[1] * e * 0.5]; X[i + 1] = [b[0] - d[0] * e * 0.5, b[1] - d[1] * e * 0.5]; }
      }
      for (let i = 1; i < X.length; i++) if (X[i][1] > FLOOR) { X[i][1] = FLOOR; Y[i][0] = X[i][0] - (X[i][0] - Y[i][0]) * 0.6; Y[i][1] = Math.max(Y[i][1], FLOOR); }
      X[0] = [...ANCHOR];
    }
  }
  return frames;
})();
function nodesAt(t) {
  if (t <= T_SNAP) return NODES0;
  const k = (t - T_SNAP) * KEEP, i = Math.min(FALL.length - 2, Math.floor(k)), f = Math.min(1, k - i);
  return FALL[i].map((p, j) => [p[0] + (FALL[i + 1][j][0] - p[0]) * f, p[1] + (FALL[i + 1][j][1] - p[1]) * f]);
}
// ---- the broken stem (and its shadow on the wall): it drops off the fixing, falls, and lies on the floor
const STEM_SHADOW = EDGE_SHADOW.parts.find((q) => q.startsWith("M169.5")), STEM_SHADOW_SVG = `<path d="${STEM_SHADOW}"${EDGE_SHADOW.attr}/>`, STEM = EL[12] + EL[13], STEM_DROP = FLOOR + 2 - 48.3, T_STEM = T_SNAP + Math.sqrt((2 * STEM_DROP) / G);
function stem(t, body) {
  if (t <= T_SNAP) return body;
  const dy = Math.min(STEM_DROP, 0.5 * G * (t - T_SNAP) ** 2), turn = 90 * track([[T_STEM - 0.02, 0], [T_STEM + 0.08, 1, "out"]], t);
  return `<g transform="translate(0 ${n2(dy)}) rotate(${n2(turn)} 170 48.3)">${body}</g>`;
}

// ---- sad: down
const SAD_DUR = T_SNAP + RUN - 0.05;
function sad(t) {
  if (t <= T_SNAP) return STILL;
  const N = nodesAt(t);
  const place = (k, off) => { const l = LINKS[k], c0 = l.c, c = N[k + 1], a = restAngle(k, N) - restAngle(k, NODES0), co = Math.cos(a), si = Math.sin(a), h = Math.max(0, Math.min(1, (FLOOR - c[1]) / 20)), o = [off[0] * h, off[1] * h];
    return (p) => { const x = p[0] - c0[0] - off[0], y = p[1] - c0[1] - off[1]; return [c[0] + o[0] + x * co - y * si, c[1] + o[1] + x * si + y * co]; }; };
  const SH = [5, 6.5];
  // the links' shadows, then the round links (shade, lit), the fixings, the edge-on links (shade, lit), as the still layers them
  const roundShadow = `<path d="${LINKS.map((l, k) => (l.round === undefined ? "" : ROUND[0].parts.slice(2 * l.round, 2 * l.round + 2).map((p) => moved(p, place(k, SH))).join(""))).join("")}"${ROUND[0].attr}/>`;
  const edgeShadow = `<path d="${LINKS.map((l, k) => (l.edge === undefined ? "" : moved(EDGE_SHADOW.parts[l.edge], place(k, SH)))).join("")}${EDGE_SHADOW.parts.slice(7).filter((q) => q !== STEM_SHADOW).join("")}"${EDGE_SHADOW.attr}/>`;
  const round = [1, 2].map((j) => `<path d="${LINKS.map((l, k) => (l.round === undefined ? "" : ROUND[j].parts.slice(2 * l.round, 2 * l.round + 2).map((p) => moved(p, place(k, [0, 0]))).join(""))).join("")}"${ROUND[j].attr}/>`).join("");
  const edge = [0, 1].map((j) => `<path d="${LINKS.map((l, k) => (l.edge === undefined ? "" : moved(EDGE[j].parts[l.edge], place(k, [0, 0])))).join("")}"${EDGE[j].attr}/>`).join("");
  return `${OPEN}${EL[0]}${EL[1]}${roundShadow}${edgeShadow}${stem(t, STEM_SHADOW_SVG)}${round}${EL.slice(6, 12).join("")}${stem(t, STEM)}${edge}</svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
