// Fall's two stories, the root ball's: the pot is mid-fall off the shelf, turning, its soil plug half out of the mouth. Happy: the plug comes clean
// out and lands on its broad base: it squats into the floor and holds, the plant standing in it, while the empty pot strikes on its rim and goes
// over onto its side beside it. Sad: the plug stays caught in the turning pot and strikes the floor on its corner: it breaks up, the clods spill
// out, and the plant goes over and lies across the floor, its roots bare among them; the pot goes over onto its side the same.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor (from y 182), the shelf (its shadow, brackets, wood),
// the two books, the soil specks on the shelf, the pot (its base, body and shade, its rim, its mouth and dark inside), the soil plug, the plant, the
// shadow on the floor, the crumbs (falling, and a few already down). The pot is about 20 cm across its mouth: 230 to the meter.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"182\" width=\"200\" height=\"18\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M4 52H110L106 58H8Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M24.2 70.5L37.6 51.8L39.8 52.6L26.2 72ZM86.2 70.5L99.6 51.8L101.8 52.6L88.2 72Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M22 50L25 50L25 74L22 74ZM25 50L40 50L40 52.6L27.4 52.6ZM84 50L87 50L87 74L84 74ZM87 50L102 50L102 52.6L89.4 52.6Z\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M-2 44H112V51H-2Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M-2 39H112V44H-2Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M6 13H14V39H6Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M12 13H14V39H12Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M15 18H22V39H15Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M20 18H22V39H20Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M95.2 41L95.9 40.6L96.7 41L95.9 41.4ZM93.1 42.2L93.9 41.7L94.7 42.2L93.9 42.6ZM88.5 42.7L89.4 42.1L90.4 42.7L89.4 43.2ZM78.4 42.4L79.6 41.7L80.8 42.4L79.6 43ZM75.5 41.6L76.3 41.1L77.1 41.6L76.3 42ZM75.8 40.6L76.7 40.1L77.5 40.6L76.7 41.1ZM79.1 39.9L79.9 39.5L80.7 39.9L79.9 40.3ZM85.3 39.6L86.6 38.8L87.9 39.6L86.6 40.2ZM93.3 40.3L94.4 39.6L95.6 40.3L94.4 40.9Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M105.2 92.4L102.5 95.4L99.8 97.9L97.3 99.6L95.3 100.4L93.9 100.1L93.3 98.8L93.5 96.6L94.5 93.8L96.3 90.6L98.6 87.3L101.2 84.2L103.9 81.7L106.4 80L108.5 79.3L109.9 79.6L110.5 80.9L110.3 83.1L109.2 85.9L107.5 89.1Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M109.9 79.6L144.8 98.3L120.4 129.4L93.9 100.1Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M99.1 93.4L128.3 119.3L120.4 129.4L93.9 100.1Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M146.9 95.6L152.4 99.9L123.8 136.4L118.3 132.1Z\" fill=\"var(--art-clay-lit,#F6A06F)\"/><path d=\"M127.6 120.2L133.1 124.6L123.8 136.4L118.3 132.1Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M144.7 123.3L140 128.7L135.1 133.1L130.4 136L126.6 137.1L123.8 136.4L122.5 134L122.7 129.9L124.4 124.7L127.5 118.9L131.5 113L136.3 107.6L141.2 103.3L145.8 100.3L149.7 99.2L152.4 99.9L153.7 102.4L153.5 106.4L151.8 111.6L148.8 117.4Z\" fill=\"var(--art-clay-lit,#F6A06F)\"/><path d=\"M143 122L138.8 126.9L134.6 130.9L130.7 133.7L127.5 134.9L125.3 134.6L124.4 132.6L124.9 129.2L126.6 124.7L129.5 119.6L133.2 114.3L137.4 109.4L141.7 105.4L145.6 102.6L148.8 101.4L150.9 101.8L151.8 103.8L151.4 107.2L149.6 111.6L146.8 116.7Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M157.4 124L157.9 127.6L155.3 130.2L151.5 132.5L148.4 135.3L144.7 136.8L140.1 135.8L136.4 134.1L133.3 133L129.5 131L126.9 127.5L127.4 124L129.2 120.8L130.1 117.2L131.9 114.4L135.9 113.5L140.4 113.1L144.4 112L148.9 112.3L152.9 114.9L154.7 118.1L155.7 120.8Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M135.3 119.1L133.3 115.6L131.4 112.2L129.5 109L127.3 106.1L125 103.3L122.5 100.6L120 97.8L118.9 94L118.6 94.3L119.7 98.1L120.1 102.5L120.9 106.8L122.5 110.6L124.8 113.8L127.8 116.3L131.3 118.1L135.1 119.4ZM138 117L137.1 112.4L136.2 107.9L135.2 103.5L133.8 99.3L132.2 95.2L130.3 91.2L128.4 87.1L128.1 82.5L127.8 82.6L128.1 87.2L127.4 92.2L127.2 97.2L127.7 101.9L129.2 106.3L131.4 110.3L134.3 113.9L137.7 117.2ZM141.4 116.1L142.6 112.5L143.8 109L144.8 105.7L145.5 102.4L146 99.1L146.3 95.7L146.8 92.3L148.9 89.2L148.5 89.1L146.4 92.2L143.3 95.2L140.7 98.4L138.9 101.9L138.1 105.5L138.3 109.2L139.4 112.7L141.1 116.1ZM133.7 121.9L131.2 119.8L128.8 117.7L126.4 115.9L123.8 114.5L121.1 113.5L118.3 112.7L115.4 111.8L113.2 109.6L113 109.9L115.2 112.2L116.9 115.4L118.9 118.3L121.3 120.6L124.1 122.1L127.1 122.8L130.3 122.8L133.6 122.3ZM145 116.4L147.2 114.2L149.4 112.3L151.3 110.3L153 108.2L154.3 106L155.5 103.7L156.8 101.3L159.5 99.9L159.2 99.7L156.5 101.1L153 101.9L149.8 103.2L147.1 105.1L145.3 107.5L144.4 110.2L144.2 113.2L144.6 116.3Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M126 187C134 184.5 156 184.5 166 187C156 189.5 134 189.5 126 187Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M164.2 171.3L163.6 172.3L162.7 171.8L162.5 170.8L163.5 170.4ZM154.5 141.9L151.6 142L150.8 139.3L153.4 138.1L155.5 139.7ZM151.3 144.9L149.8 143.2L151.5 141.4L153.6 142.1L153.2 144.7ZM153.3 145.4L154 144.1L155.4 144.5L155.3 145.7L154.2 146.4ZM152.9 146.1L154.1 145.7L154.7 147L153.7 147.5L152.7 147.2ZM165.4 168.4L166.4 170.1L165.4 171.5L163.6 171.4L163.6 169.5ZM151 137.8L150.1 140.4L147.9 139.7L147.6 137.7L149.2 136ZM151.5 144.1L150 144.3L148.7 142.7L150 141.4L151.6 142.1ZM149.8 139.3L148.8 138.1L149.5 137L150.7 137.2L151.2 138.4ZM150.3 139.3L150.9 137.2L153.3 136.9L154 138.9L152.5 140.6ZM172 175.1L173 174.7L173.6 175.6L173.1 176.4L171.9 176.3ZM153 137.7L155.7 139L154.7 141.7L151.9 141.2L150.6 138.8ZM169.6 168.4L169.6 169.5L168.8 169.8L168.1 168.9L168.9 168ZM156 145.7L154.5 146.4L153.6 145.3L154 144.1L155.6 144.2ZM152 143.9L149.7 143.4L150.6 140.9L152.7 140.4L153.6 142.7ZM162.6 158.1L162.3 157.2L163.3 156.7L164 157.5L163.4 158.2ZM156.4 149.2L157.8 148.4L158.9 149.1L158.6 150.6L156.9 150.8ZM148.5 134.8L150.4 135.8L150.1 137.8L148.4 138.4L146.8 136.5ZM165.4 165.2L165.7 166.2L164.5 167L163.6 166.1L164.2 164.9ZM158.8 152.3L158.3 152.9L157.2 152.5L157.5 151.6L158.5 151.5ZM161.2 154.7L160.2 154.4L160.2 153.4L161 152.9L161.9 153.8ZM152.3 144.8L151.6 142.8L153.2 141.6L154.8 142.7L154.2 144.7ZM157 149.6L157.9 148.4L159.3 148.9L159.5 150.5L157.9 150.8ZM159.4 153.1L160.6 153L161.1 154.3L159.9 155.1L158.9 154.1ZM154.1 137L155.1 139.5L153.3 141.4L150.3 140.7L150.9 137.9ZM155.2 146.4L154.4 148.8L151.5 148.1L151.4 145.9L153.7 145.1ZM138.5 184.4a1.2 0.8 0 0 1 2.3 0ZM131.9 184.4a2.4 1.7 0 0 1 4.8 0ZM136.8 184.4a2.2 1.6 0 0 1 4.5 0ZM145.7 184.4a2 1.4 0 0 1 4 0ZM144.4 184.4a2.3 1.6 0 0 1 4.7 0ZM149.4 184.4a2 1.4 0 0 1 4 0ZM142.8 184.4a2 1.4 0 0 1 3.9 0Z\" fill=\"var(--art-bark,#7A4E2D)\"/></svg>\n";
export const STILL_HASH = "cdfb8b2efa";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 23 || !EL[13].includes("M109.9 79.6L144.8 98.3")) throw new Error("fall: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 12).join(""), POT = EL.slice(12, 19).join(""), PLUG = EL[19], PLANT = EL[20], SHADOW = EL[21];
const pts = (i) => [...EL[i].match(/d="([^"]*)"/)[1].matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
// the crumbs: those still falling (each its own small stone) and the few already on the floor
const CRUMB_D = EL[22].match(/d="([^"]*)"/)[1], FLYING = CRUMB_D.match(/M[^Ma]*Z/g), DOWN = CRUMB_D.match(/M[^M]*a[^M]*Z/g).join("");
const CRUMB_MID = FLYING.map((d) => { const P = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]); return [P.reduce((s, p) => s + p[0], 0) / P.length, Math.max(...P.map((p) => p[1]))]; });

// ---- the fall both share: gravity at the pot's scale, the speed it left the shelf with, and its turn
const G = 2250, V0 = 640, VX = 50, W = 120, COM = [120.6, 106.9], C = [123.8, 136.4], FLOOR = 188.5, REST = -52.5;
const POT_PTS = [12, 13, 14, 15, 16, 17].flatMap(pts);
const turn = (p, a, c) => { const r = (a * Math.PI) / 180, x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)]; };
const lowest = (a) => Math.max(...POT_PTS.map((p) => turn(p, a, C)[1]));
const drop = (t) => V0 * t + 0.5 * G * t * t;
// in flight it turns about its middle; the moment its lowest point reaches the floor, it strikes
const flightLow = (t) => Math.max(...POT_PTS.map((p) => turn(p, W * t, COM)[1])) + drop(t);
const T1 = (() => { let a = 0, b = 0.3; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (flightLow(m) < FLOOR) a = m; else b = m; } return (a + b) / 2; })();
const AT_STRIKE = turn(C, W * T1, COM), C_X = AT_STRIKE[0] + VX * T1;
// the pot's pose: rotation a about the rim corner C, moved so that C sits at (x, y)
const potAt = (a, x, y) => `<g transform="translate(${n2(x - C[0])} ${n2(y - C[1])}) rotate(${n2(a)} ${C[0]} ${C[1]})">${POT}</g>`;
function pot(t) {
  if (t < T1) { const p = turn(C, W * t, COM); return { svg: potAt(W * t, p[0] + VX * t, p[1] + drop(t)), a: W * t, down: false }; }
  // struck on its rim, it goes over the other way, its base swinging down to the floor; it lands on its side, rocks once and lies there
  const s = t - T1, a1 = W * T1;
  // (knocked by the strike, it starts going over at once and gathers speed as its base comes down)
  const over = (x) => 0.4 * x + 0.6 * x * x, D = 0.26;
  const a = s < D ? a1 + (REST - a1) * over(s / D) : track([[0, REST], [0.07, REST + 3.2, "out"], [0.14, REST, "in"], [0.19, REST + 0.8, "out"], [0.24, REST, "in"]], s - D);
  // (the floor holds its lowest point; the rim corner stays where it struck, give or take a roll)
  const y = C[1] + FLOOR - lowest(a);
  return { svg: potAt(a, C_X - 0.06 * (a1 - a), y), a, down: true };
}
// the pot's shadow on the floor, as it comes down onto its side: none while it stands on its rim, the full length once it lies
const potShadow = ({ a, down }) => { if (!down) return ""; const k = Math.min(1, Math.max(0, (W * T1 - a) / (W * T1 - REST))); if (k < 0.01) return ""; const cx = C_X - 26 * k; return `<g transform="translate(${n2(cx)} 189) scale(${n4(0.25 + 1.15 * k)} ${n4(k)}) translate(-146 -187)">${SHADOW}</g>`; };

// the falling crumbs go on down and stop on the floor, each at its own depth
const crumbs = (t) => FLYING.map((d, i) => { const rest = 184.5 + ((i * 37) % 7), dy = Math.min(drop(t), rest - CRUMB_MID[i][1]), dx = VX * Math.min(t, T1); return Math.abs(dy) < 0.01 ? d : d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (m, x, y) => `${n2(+x + dx)} ${n2(+y + dy)}`); }).join("");

// ---- happy: it lands on its feet
const HAPPY_DUR = 2.4, PLUG_FOOT = 136.8, PLUG_FLOOR = 187.5, SLIDE = 70, BASE = [139, 119.5];
// the plug, let go by the pot, falls straight, sliding on out of the mouth as it goes
const T_PLUG = (() => { const d = PLUG_FLOOR - PLUG_FOOT; return (-V0 + Math.sqrt(V0 * V0 + 2 * G * d)) / G; })();
function happy(t) {
  if (t <= 0) return STILL;
  const p = pot(t);
  let dx, dy, sx = 1, sy = 1, lx = 1, ly = 1;
  if (t < T_PLUG) { dx = (VX + SLIDE) * t; dy = drop(t); }
  else {
    // it lands on its broad base: the soil gives (squats, spreads), comes back a little and holds, squatter than it was; it skids a hair on
    const s = t - T_PLUG;
    dx = (VX + SLIDE) * T_PLUG + track([[0, 0], [0.12, 4, "out"]], s); dy = PLUG_FLOOR - PLUG_FOOT;
    sy = track([[0, 1], [0.05, 0.84, "out"], [0.16, 0.99, "io"], [0.26, 0.94, "io"], [0.34, 0.95, "io"]], s); sx = 1 + 0.45 * (1 - sy);
    // the leaves, carried down hard, droop and spread, then spring back
    ly = track([[0, 1], [0.08, 0.78, "out"], [0.22, 1.06, "io"], [0.35, 0.96, "io"], [0.47, 1.015, "io"], [0.58, 1, "io"]], s); lx = 1 + 0.6 * (1 - ly);
  }
  const foot = [144.7 + dx, PLUG_FOOT + dy];
  const plug = `<g transform="translate(${n2(foot[0])} ${n2(foot[1])}) scale(${n4(sx)} ${n4(sy)}) translate(${-144.7} ${-PLUG_FOOT})">${PLUG}<g transform="translate(${BASE[0]} ${BASE[1]}) scale(${n4(lx)} ${n4(ly)}) translate(${-BASE[0]} ${-BASE[1]})">${PLANT}</g></g>`;
  // (its shadow follows it in, tightening as it nears the floor)
  const shadow = `<g transform="translate(${n2(dx)} 0) translate(146 187) scale(${n4(1 - 0.18 * Math.min(1, t / T_PLUG))} 1) translate(-146 -187)">${SHADOW}</g>`;
  return `${OPEN}${BACK}${potShadow(p)}${shadow}${p.svg}${plug}<path d="${crumbs(t)}${DOWN}" ${fill("bark")}/></svg>`;
}

// ---- sad: it breaks up
const SAD_DUR = 2.6, PLUG_PTS = pts(19);
// the plug stays in the turning pot, the two going on together: where a point of it is, and the move that puts it there
const flown = (p, t) => { const q = turn(p, W * t, COM); return [q[0] + VX * t, q[1] + drop(t)]; };
const rigid = (t) => `translate(${n2(VX * t)} ${n2(drop(t))}) rotate(${n2(W * t)} ${COM[0]} ${COM[1]})`;
// its corner, out of the mouth and lowest, reaches the floor first
const T_HIT = (() => { let a = 0, b = 0.3; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (Math.max(...PLUG_PTS.map((p) => flown(p, m)[1])) < PLUG_FLOOR) a = m; else b = m; } return (a + b) / 2; })();
// where it breaks, in the still's own place: the top (with the plant's roots in it) and three pieces of the lower part
// (the break line, left to right; the top's cell reaches a unit past it and the middle piece's a unit past its edges, so where they meet no gap shows)
const CUT = [[118, 126], [121, 126.5], [124, 128], [128, 127.5], [132, 124.5], [135.5, 125.5], [139, 128.5], [143, 127], [146, 124], [149.5, 125.5], [153, 127.5], [156, 125], [159, 121.5], [162, 123.5], [168, 121]];
const poly = (P) => `M${P.map((q) => `${n2(q[0])} ${n2(q[1])}`).join("L")}Z`;
const CELLS = [poly([[118, 96], [168, 96], ...CUT.slice().reverse().map(([x, y]) => [x, y + 1])]), "M118 126L121 126.5L124 128L128 127.5L132 124.5L135.5 125.5L139 128.5L136.5 130.5L137 133L134.5 136.5L134 142H118Z", poly([[139, 127.5], [143, 126], [146, 123], [149.5, 124.5], [154, 127], [152, 130], [151, 134], [153.5, 137.5], [152, 143], [133, 143], [133.5, 136.5], [136, 133], [135.5, 130.5]]), "M153 127.5L156 125L159 121.5L162 123.5L168 121V142H151L152.5 137.5L150 134L151 130Z"];
const piece = (i, move) => `<clipPath id="k${i}"><path d="${CELLS[i]}"/></clipPath><g transform="${move} ${rigid(T_HIT)}"><g clip-path="url(#k${i})">${PLUG}</g></g>`;
// the lower pieces: each its middle (in the still), how it's knocked (x, y speeds), its tumble (degrees a second), where its middle comes to rest
const CLODS = [[1, [130, 131], [-55, -120], -260, 186], [2, [144, 132], [8, -40], 90, 187.5], [3, [156, 128], [85, -170], 320, 187]];
function clod([i, c, v, spin, rest], s) {
  const m = flown(c, T_HIT), land = (-v[1] + Math.sqrt(v[1] * v[1] + 2 * G * (rest - m[1]))) / G, f = Math.min(s, land);
  const x = v[0] * f + (s > land ? (v[0] > 0 ? 3 : -3) * Math.min(1, (s - land) / 0.15) : 0), y = s > land ? rest - m[1] : v[1] * f + 0.5 * G * f * f;
  return piece(i, `translate(${n2(x)} ${n2(y)}) rotate(${n2(spin * f)} ${n2(m[0])} ${n2(m[1])})`);
}
// the top drops onto what's left and slumps; the plant in it goes over to the right, pulling its roots out of the loose soil
const TOP_DROP = 9;
// the plant going over: from the angle it hit at, faster and faster, to the floor
const OVER = (() => { const S = [[0, (W * T_HIT * Math.PI) / 180]]; let a = S[0][1], w = 1.2, s = 0; while (a < 1.52) { w += (94 * Math.sin(a)) / 4000; a += w / 4000; s += 1 / 4000; S.push([s, Math.min(a, 1.52)]); } return S; })();
const T_OVER = OVER[OVER.length - 1][0], T_GO = 0.1, LIE = (1.52 * 180) / Math.PI;
// the roots: thin, wavering strands from the base, more of them on its left (the side that tears up when it goes over to the right)
const ROOTS = (() => { let d = ""; for (const [a, l, w] of [[-88, 8, 1], [-70, 10, -1], [-50, 11, 1], [-25, 12, -1], [0, 12, 1], [25, 11, -1], [50, 9, 1]]) {
  const r = (a * Math.PI) / 180, u = [Math.sin(r), Math.cos(r)], n = [u[1], -u[0]], K = [0, 0.3, 0.55, 0.8, 1], off = [0, 0.9, -0.5, 0.6, 0].map((o) => o * w), wd = [0.75, 0.6, 0.45, 0.3, 0];
  const P = (i, side) => `${n2(BASE[0] + u[0] * l * K[i] + n[0] * (off[i] + side * wd[i]))} ${n2(BASE[1] + u[1] * l * K[i] + n[1] * (off[i] + side * wd[i]))}`;
  d += `M${[0, 1, 2, 3, 4].map((i) => P(i, 1)).join("L")}L${[3, 2, 1, 0].map((i) => P(i, -1)).join("L")}Z`; } return d; })();
function sad(t) {
  if (t <= 0) return STILL;
  const p = pot(t);
  const crumbsSvg = `<path d="${crumbs(t)}${DOWN}" ${fill("bark")}/>`;
  if (t < T_HIT) return `${OPEN}${BACK}${potShadow(p)}${SHADOW}${p.svg}<g transform="${rigid(t)}">${PLUG}${PLANT}</g>${crumbsSvg}</svg>`;
  const s = t - T_HIT;
  const clods = CLODS.map((c) => clod(c, s));
  // the top: it drops onto the crushed corner, squats and spreads
  const bottom = flown([142, 127], T_HIT), fallTop = Math.min(TOP_DROP, 0.5 * G * s * s), landed = Math.sqrt((2 * TOP_DROP) / G);
  const sy = s < landed ? 1 : track([[0, 1], [0.06, 0.7, "out"], [0.2, 0.8, "io"]], s - landed), sx = 1 + 0.5 * (1 - sy);
  const topMove = `translate(0 ${n2(fallTop)}) translate(${n2(bottom[0])} ${n2(bottom[1])}) scale(${n4(sx)} ${n4(sy)}) translate(${n2(-bottom[0])} ${n2(-bottom[1])})`;
  // the plant: its base rides the top, then it goes over to the right about its base, sliding out of the soil as it goes
  const b0 = flown(BASE, T_HIT), bh = (b0[1] - bottom[1]) * sy;
  const g = Math.max(0, s - T_GO), k = Math.min(1, g / T_OVER);
  let ang = g < T_OVER ? (OVER[Math.min(OVER.length - 1, Math.floor(g * 4000))][1] * 180) / Math.PI : track([[0, LIE], [0.07, LIE - 5, "out"], [0.16, LIE, "in"], [0.22, LIE - 1.2, "out"], [0.28, LIE, "in"]], g - T_OVER);
  // (its base comes up onto the right end of the slumped soil, the roots on its far side torn up out of it; lying, the leaves press flat on the floor)
  const base = [b0[0] + 12.6 * k, bottom[1] + fallTop + bh - 3.2 * k * k], flat = 1 - 0.38 * k * k;
  const at = (sy) => `<g transform="translate(${n2(base[0])} ${n2(base[1])})${sy < 1 ? ` scale(1 ${n4(sy)})` : ""} rotate(${n2(ang)}) translate(${-BASE[0]} ${-BASE[1]})">`;
  // (the roots were in the soil all along: drawn behind every piece of it, they show only where it has come away)
  return `${OPEN}${BACK}${potShadow(p)}${SHADOW}${p.svg}${at(1)}<path d="${ROOTS}" ${fill("paper-deeper")}/></g>${clods[0]}${clods[2]}${piece(0, topMove)}${clods[1]}${crumbsSvg}${at(flat)}${PLANT}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
