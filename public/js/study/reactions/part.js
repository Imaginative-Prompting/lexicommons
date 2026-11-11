// Part's two stories, the peeled mandarin's own: with one segment out, its round has lost the arch that held it. Happy: the next segment
// along the gap leans out and comes away whole, tipping over onto the first, two parts ready, the fruit's inside showing where it was.
// Sad: the segments by the gap lean out into it and the whole fruit gives: one after another its segments fall open and apart, loose and
// spread on the table.
// Every frame is a pure function of t, in seconds. The still's own parts: the fruit (its round, the right segment's shaded skin, the
// gap's faces, the pith lines meeting at its top (80, 76), each from there to the round's edge), the loose segment lying in front. The
// fruit is its segments, the wedges between those pith lines; each falls outward about the fruit's foot (80, 164), turning in the world
// (seen a little from above, 20°), as a body.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M36 146C40 164 74 170 104 175L200 200L200 158L176 150L120 145Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><ellipse cx=\"82\" cy=\"108\" rx=\"64\" ry=\"56\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M80 76C110 66 128 76 142.1 88.8A64 56 0 0 1 109 158.7C136 130 126 82 80 76Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M80 76C90 96 90 140 76.4 163.8A64 56 0 0 0 109 158.7C136 130 126 82 80 76Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M80 76C90 96 90 140 76.4 163.8L83 163.9C96 140 95 98 80 76Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M80 76C34.7 71.5 16.7 117.5 34 143.4C19.3 118.5 37.3 72.5 80 76Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M80 76C56.7 83.6 42.7 129.6 55.4 158C45.3 130.4 59.3 84.4 80 76Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M80 76C88.6 96 88.6 140 76.6 163C91.4 140 91.4 96 80 76Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M80 76C124.6 82.3 134.6 130.3 108.5 158C137.4 129.7 127.4 81.7 80 76Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M80 76C110.7 64.8 128.7 74.8 141.4 88.6C127.3 77.2 109.3 67.2 80 76Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M80 76C91.6 64.7 103.6 60.7 118 62.8C104.4 63.3 92.4 67.3 80 76Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M80 76C76.8 68 75.8 58 80 52.8C78.2 58 79.2 68 80 76Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M80 76C70.4 64.7 56.4 60.7 46 62.8C55.6 63.3 69.6 67.3 80 76Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M80 76C59.5 64.7 35.5 74.7 22.6 88.6C36.5 77.3 60.5 67.3 80 76Z\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"80\" cy=\"76\" r=\"2\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M101 150C100 140 110 135 120 138C138 142 154 134 164 123C171 115 180 122 178 136C176 158 152 172 128 172C112 172 102 163 101 150Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M164 123C171 115 180 122 178 136C176 158 152 172 128 172C150 166 168 152 170 136C171 129 169 125 164 123Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M105 145C114 139 128 143 140 141C150 139 158 133 166 125C159 134 151 141.4 141 143.4C128 145.4 115 142 105 145Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M121 143C124 149 125 155 123 161C127 155 127 149 121 143Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M139 143C145 147 149 152 151 158C151 152 147 146 139 143Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M155 136C159 138 162 142 163 147C164 142 161 138 155 136Z\" fill=\"var(--art-paper,#FBF7EC)\"/></svg>\n";
export const STILL_HASH = "a8d40cf59f";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 23 || !EL[3].includes('cx="82" cy="108" rx="64" ry="56"')) throw new Error("part: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const t1 = (v) => (Math.round(v * 10) / 10).toString();
const dPoly = (P) => `M${P.map((p) => `${t1(p[0])} ${t1(p[1])}`).join(" ")}Z`;
const SCENE = EL.slice(0, 3).join(""), LOOSE = EL.slice(17).join("");
const POLE = [80, 76], FOOT = [80, 164], C = [82, 108], RX = 64, RY = 56;

// ---- the pith lines: each a band from the top out to the round's edge; its middle line (the two edges averaged)
const cubic = (a, b, c, d) => (t) => { const u = 1 - t; return [0, 1].map((j) => u * u * u * a[j] + 3 * u * u * t * b[j] + 3 * u * t * t * c[j] + t * t * t * d[j]); };
const PITH = EL.slice(7, 16).map((e) => {
  const n = /d="([^"]+)"/.exec(e)[1].match(/-?\d*\.?\d+/g).map(Number);
  // M80 76 C b c d  C e f 80 76: out along one edge, back along the other
  // (its end carried out onto the round itself, where the band's point stops a hair short: the segments meet the round's edge exactly)
  const b = [(n[2] + n[10]) / 2, (n[3] + n[11]) / 2], c = [(n[4] + n[8]) / 2, (n[5] + n[9]) / 2], at = Math.atan2((n[7] - C[1]) / RY, (n[6] - C[0]) / RX);
  const d = [C[0] + RX * Math.cos(at), C[1] + RY * Math.sin(at)];
  return { svg: e, mid: cubic(POLE, b, c, d), end: d, at };
});
// (by where they meet the round, going round from the left side: EL15, 7, 8, 9 | the gap | 10, 11, 12, 13, 14)
const [P15, P7, P8, P9, P10, P11, P12, P13, P14] = [8, 0, 1, 2, 3, 4, 5, 6, 7].map((i) => PITH[i]);
const arc = (a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [C[0] + RX * Math.cos(a), C[1] + RY * Math.sin(a)]; });
const along = (f, rev = false) => Array.from({ length: 9 }, (_, i) => f(rev ? 1 - i / 8 : i / 8));
// a segment: from the top down one pith line, round the edge, back up the next
const wedge = (pa, pb, aFrom, aTo) => [...along(pa.mid), ...arc(aFrom, aTo).slice(1, -1), ...along(pb.mid, true)];
const unwrap = (a, ref) => { while (a > ref) a -= 2 * Math.PI; while (a < ref - 2 * Math.PI) a += 2 * Math.PI; return a; };
const W = (pa, pb, tone, extra = "") => ({ P: wedge(pa, pb, pa.at, unwrap(pb.at, pa.at)), tone, extra });
// (the front segment runs on past the middle of its pith line to the gap's own edge: the right segment's face begins there)
// (its own sliver of face included)
const GAP_EDGE = { mid: cubic(POLE, [95, 98], [96, 140], [83, 163.9]), at: Math.atan2((163.9 - C[1]) / RY, (83 - C[0]) / RX) };
// the right segment's flat face in the gap: the still's, short of the front segment's sliver of face (which the still lays over it)
const RIGHT_FACE = EL[5].replace("C90 96 90 140 76.4 163.8A64 56 0 0 0 109 158.7", "C95 98 96 140 83 163.9A64 56 0 0 0 109 158.7");
// the segments (going round), each with the pith line it shares with the neighbour drawn before it (so every line is drawn over both its
// sides), the right one with its face in the gap, the front one with the sliver of its own
const SEGS = {
  left: W(P15, P7, "clay", P15.svg), frontLeft: W(P7, P8, "clay", P7.svg), front: W(P8, GAP_EDGE, "clay", P8.svg + P9.svg + EL[6]),
  right: W(P10, P11, "clay-deep", RIGHT_FACE + P10.svg + P11.svg), backRight: W(P11, P12, "clay", P12.svg), back: W(P12, P13, "clay"),
  backLeft: W(P13, P14, "clay", P13.svg), farLeft: W(P14, P15, "clay", P14.svg),
};
const TOP_DOT = EL[16];
// (the right one's face lies in the gap, outside its own wedge: its shape goes with it as a body, so the wedge carries it whole)
// the back-right segment's flat face, inside the fruit, seen once the right segment has gone: from the top along its pith line, down
// round toward the foot
// (from the gap's own left edge: it lies under the front segment's sliver of face as the right one's face did in the still)
const INSIDE = `<path d="M80 76C110 66 128 75 141.4 88.6C138 120 110 158 80 164L76.4 163.8C90 140 90 96 80 76Z" ${fill("sun-lit")}/><path d="M141.4 88.6C138 120 110 158 80 164L80.5 162.4C108.5 156.6 136.2 119.6 139.6 89.3Z" ${fill("paper")}/>`;

// ---- a segment going: its wedge leans out about its foot (in the picture's plane), then tips over through edge-on (flattening toward its
// foot), and comes up as a segment lying (the loose one's own drawing), tumbling out to where it rests, its shadow under it
const DEG = Math.PI / 180;
const LOOSE_FOOT = [140, 172];
const LOOSE_SHADE = `<path d="${/d="([^"]+)"/.exec(EL[17])[1]}" transform="translate(4 3)" ${fill("violet-deep")}/>`;
// a segment lying: the loose one's drawing (its foot line's middle at x, y), turned a, at scale s, flattened by f (0 edge-on)
const lying = (x, y, a, s, f = 1, shade = 0) => {
  const at = `translate(${n2(x)} ${n2(y)}) rotate(${n2(a)}) scale(${n4(s)} ${n4(s * Math.max(f, 0.001))}) translate(${-LOOSE_FOOT[0]} ${-LOOSE_FOOT[1]})`;
  return (shade > 0.004 ? `<g transform="${at}" opacity="${n4(shade)}">${LOOSE_SHADE}</g>` : "") + `<g transform="${at}">${LOOSE}</g>`;
};
// a wedge in the fruit, leant out by lean (degrees) and flattened toward its foot by sq
const leaning = (seg, foot, lean, sq = 1) => (lean || sq < 1
  ? `<g transform="translate(${n2(foot[0])} ${n2(foot[1])}) rotate(${n2(lean)}) scale(1 ${n4(Math.max(sq, 0.001))}) translate(${-foot[0]} ${-foot[1]})"><path d="${dPoly(seg.P)}" ${fill(seg.tone)}/>${seg.extra}</g>`
  : `<path d="${dPoly(seg.P)}" ${fill(seg.tone)}/>${seg.extra}`);
// one segment's going: [its foot in the fruit, how far it leans, when it tips, where it comes to rest (foot x, y, turn, scale)]
function going(seg, [foot, leanTo, tGo, [x, y, a, sc]], t) {
  const lean = track([[0.25, 0], [tGo, leanTo, "in"]], t);
  if (t < tGo + 0.13) return { fruit: leaning(seg, foot, lean, track([[tGo, 1], [tGo + 0.13, 0, "in"]], t)), lying: "" };
  // (over: it comes up lying where it went over, and tumbles out to rest, a little hop as it lands)
  const u = track([[tGo + 0.13, 0], [tGo + 0.5, 1, "out"]], t), f = track([[tGo + 0.13, 0], [tGo + 0.29, 1, "io"]], t);
  const hop = track([[tGo + 0.38, 0], [tGo + 0.44, 2.5, "out"], [tGo + 0.5, 0, "in"]], t);
  return { fruit: "", lying: lying(foot[0] + (x - foot[0]) * u, foot[1] + (y - foot[1]) * u - hop, lean + (a - lean) * u, 0.7 + (sc - 0.7) * u, f, f) };
}

// ---- happy: the right segment comes away and lies whole beside the first
const HAPPY_DUR = 2.4;
const RIGHT_GOES = [[104, 160], 13, 0.95, [112, 198, -6, 0.95]];
function happy(t) {
  if (t <= 0) return STILL;
  const s = SEGS, r = going(s.right, RIGHT_GOES, t);
  return `${OPEN}${SCENE}${segment(s.back)}${segment(s.backLeft)}${segment(s.farLeft)}${segment(s.backRight)}${INSIDE}${segment(s.left)}${segment(s.frontLeft)}${segment(s.front)}`
    + `${r.fruit}${TOP_DOT}${LOOSE}${r.lying}</svg>`;
}
const segment = (seg) => `<path d="${dPoly(seg.P)}" ${fill(seg.tone)}/>${seg.extra}`;

// ---- sad: the whole fruit falls apart
const SAD_DUR = 2.9;
// the fruit's inside, seen once its front has gone: the back half's flesh, until that goes too
// (all of the fruit below the back half's top: up to the two pith lines that run from the top out to the round's sides, and round the
// bottom, the flesh seen from the front, its pith running down to the foot)
const INNER = `<path d="${dPoly([...along(P15.mid, true), ...along(P11.mid).slice(1), ...arc(P11.at, P15.at + 2 * Math.PI, 40).slice(1, -1)])}" ${fill("sun-lit")}/>`
  + `<path d="M80 159C78 138 70 112 58 92L59.6 91.2C72 111 80.6 138 81.6 158.8ZM80 159C84 138 94 112 108 90L109.6 90.8C96 112 86 138 81.6 158.8Z" ${fill("paper")}/>`;
// each: its foot in the fruit, its lean, when it goes over, where it rests; the front and sides first, the back half after (falling back
// toward the wall, resting nearer it, higher in the picture; it slumps as one, down onto the fruit's foot)
const GOES = {
  right: [[104, 160], 13, 0.55, [158, 199, 10, 0.86]], front: [[82, 163], -4, 0.62, [86, 198, -9, 0.9]],
  frontLeft: [[58, 160], -12, 0.7, [38, 193, -20, 0.86]], left: [[32, 146], -16, 0.78, [16, 178, -46, 0.82]],
  backRight: [[82, 158], 0, 0.95, [184, 156, 28, 0.78]], back: [[82, 158], 0, 0.95, [118, 152, 172, 0.76]],
  backLeft: [[82, 158], 0, 0.95, [66, 151, -168, 0.76]], farLeft: [[82, 158], 0, 0.95, [24, 154, -24, 0.78]],
};
function sad(t) {
  if (t <= 0) return STILL;
  const g = Object.fromEntries(Object.keys(GOES).map((k) => [k, going(SEGS[k], GOES[k], t)]));
  // the inside stands with the back half until the back half goes; the fruit's shadow goes as it comes apart (each piece lying has its own)
  const innerSq = track([[0.95, 1], [1.08, 0, "in"]], t), shadow = track([[0.55, 1], [1.2, 0, "io"]], t);
  const inner = innerSq > 0.004 ? `<g transform="translate(82 158) scale(1 ${n4(innerSq)}) translate(-82 -158)">${INNER}</g>` : "";
  const scene = EL[0] + EL[1] + (shadow > 0.004 ? EL[2].replace("/>", shadow < 1 ? ` opacity="${n4(shadow)}"/>` : "/>") : "");
  const loose = (shadow < 1 ? `<g opacity="${n4(1 - shadow)}">${LOOSE_SHADE}</g>` : "") + LOOSE;
  // (the dot where the pith met at the top goes as the top parts)
  const dot = track([[0.3, 1], [0.55, 0, "io"]], t);
  // (far to near: what lies back by the wall, the back half and its inside, the sides and front, the loose one, what lies nearest)
  return `${OPEN}${scene}${g.back.lying}${g.backLeft.lying}${g.farLeft.lying}${g.backRight.lying}${g.back.fruit}${g.backLeft.fruit}${g.farLeft.fruit}${g.backRight.fruit}`
    + `${inner}${g.left.fruit}${g.frontLeft.fruit}${g.front.fruit}${g.right.fruit}${dot > 0.004 ? TOP_DOT.replace("/>", dot < 1 ? ` opacity="${n4(dot)}"/>` : "/>") : ""}`
    + `${g.left.lying}${loose}${g.right.lying}${g.frontLeft.lying}${g.front.lying}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
