// Cabinet's story: the open right door hangs on self-closing hinges whose springs have long been stuck in old grease. Now the top one frees with a
// creak: the door gives a hair, then its spring drives it in, faster and faster.
// Happy: it claps shut and the catch takes it: a closed cupboard, its two doors and two knobs a matching pair.
// Sad: it claps shut, and the knock pulls the worn top hinge's screws out of the wood: the door drops, swinging down on its bottom hinge until its
// free corner hits the floor, and it hangs there crooked across the cupboard's front.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the shadow, the back legs, the side, the front, the
// open bay (its dark back, its left wall, its two shelves), the closed left door (55-90 across, 65-134 down, its shade, its knob at 84.5, 100.5),
// the top, the front legs, and the open right door: its inside face from its hinge at x 128, its top and its edge, its knob seen side on. Depth here
// runs up and right, 12 across and 8 up for the cupboard's 46: a step toward us is 0.26 left and 0.175 down. The door (35 wide) is open 139 degrees.
// The cupboard (80 cm) is 82 tall: 100 to the meter, gravity 1000.
import { n2, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect x=\"0\" y=\"136\" width=\"200\" height=\"64\" fill=\"var(--art-violet-lit,#A68CFF)\"/><polygon points=\"52,140 132,140 144,134 200,162 200,184 118,184 54,152\" fill=\"var(--art-violet-deep,#5E40C4)\"/><rect x=\"68\" y=\"132\" width=\"8\" height=\"12\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"134\" y=\"132\" width=\"8\" height=\"12\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"131.5,58 144,50 144,132 131.5,140.3\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"131.5,60 144,52 144,57 131.5,65\" fill=\"var(--art-bark,#7A4E2D)\"/><rect x=\"52\" y=\"58\" width=\"80\" height=\"82\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"52\" y=\"60\" width=\"80\" height=\"2\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"93\" y=\"65\" width=\"35.5\" height=\"69\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"93,65 105,65 105,126 93,134\" fill=\"var(--art-bark-deep,#4B2F24)\"/><polygon points=\"93,134 105,126 128.5,126 128.5,134\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"93,88 105,80 128.5,80 128.5,88\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"93\" y=\"88\" width=\"35.5\" height=\"3\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"93,111 105,103 128.5,103 128.5,111\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"93\" y=\"111\" width=\"35.5\" height=\"3\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"56.5\" y=\"66.5\" width=\"35\" height=\"69\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"55\" y=\"65\" width=\"35\" height=\"69\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"84.5\" cy=\"100.5\" r=\"3.5\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"84\" cy=\"100\" r=\"3\" fill=\"var(--art-ink-lit,#3A3460)\"/><polygon points=\"48,52 60,44 148,44 136,52\" fill=\"var(--art-clay-lit,#F6A06F)\"/><rect x=\"48\" y=\"52\" width=\"88\" height=\"8\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"136,52 148,44 148,52 136,60\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"56\" y=\"140\" width=\"8\" height=\"12\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"56\" y=\"140\" width=\"8\" height=\"2\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"63.5,140 67,138 67,150 63.5,152\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"120\" y=\"140\" width=\"8\" height=\"12\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"120\" y=\"140\" width=\"8\" height=\"2\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"127.5,140 131,138 131,150 127.5,152\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"128,65 149,69 149,139 128,134\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"128,65 131.5,63.5 152.5,67.5 149,69\" fill=\"var(--art-clay-lit,#F6A06F)\"/><polygon points=\"149,69 152.5,67.5 152.5,137.5 149,139\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"152.3\" y=\"103\" width=\"2.6\" height=\"2.2\" fill=\"var(--art-ink-lit,#3A3460)\"/><ellipse cx=\"155.6\" cy=\"104.1\" rx=\"1.5\" ry=\"3.1\" fill=\"var(--art-ink,#231F3B)\"/></svg>";
export const STILL_HASH = "ed6025fdac";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 34 || !EL[29].includes("128,65 149,69 149,139 128,134") || !EL[33].includes('cx="155.6" cy="104.1"')) throw new Error("cabinet: the still isn't as this story knows it");
const CUPBOARD = EL.slice(0, 29).join("");
const fill = (t, hex) => `fill="var(--art-${t},${hex})"`;
const WOOD = fill("wood", "#DCA063"), DEEP = fill("wood-deep", "#B97F45"), TOP = fill("clay-lit", "#F6A06F"), INK = fill("ink", "#231F3B"), LIT = fill("ink-lit", "#3A3460");

// ---- the door, drawn at any angle (0 shut, 139.2 as the still has it)
const HX = 128, W = 35, Y0 = 65, Y1 = 134, KD = 31, KY = 100.5, TH = 4.1, KS = 2.6, KR = 3;
const THETA0 = 180 - (Math.asin(4 / (0.175 * W)) * 180) / Math.PI; // (its free edge 4 lower than its hinge: 0.175 a step toward us)
const P = (x, y, z) => [x - 0.26 * z, y + 0.175 * z];
const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1]];
// the model: a slab hinged at x 128 in the front's plane; its inside face, and the thickness from it to the outside face
function model(th) {
  const r = (th * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const at = (d, y) => P(HX - d * c, y, d * s);
  const n = [s, c]; // the outside face's way, (x, z)
  const D = P(TH * n[0], 0, TH * n[1]);
  const base = add(at(KD, KY), D), stem = P(KS * n[0], 0, KS * n[1]), head = P((KS + KR) * n[0], 0, (KS + KR) * n[1]);
  return { Ht: at(0, Y0), Hb: at(0, Y1), Ft: at(W, Y0), Fb: at(W, Y1), D, S1: base, S2: add(base, stem), K: add(base, head) };
}
// at each end, the shapes the pictures have: shut, a mirror of the left door (its shade 1.5 down and right, its knob 5.5 in from its edge);
// open, the still's own. The model is put right toward each end, the correction fading out over 35 degrees.
const SHUT = { Ht: [129.5, 66.5], Hb: [129.5, 135.5], Ft: [94.5, 66.5], Fb: [94.5, 135.5], D: [-1.5, -1.5], S1: [98.5, 100.5], S2: [98.5, 100.5], K: [98.5, 100.5] };
const OPENED = { Ht: [128, 65], Hb: [128, 134], Ft: [149, 69], Fb: [149, 139], D: [3.5, -1.5], S1: [152.3, 104.1], S2: [154.9, 104.1], K: [155.6, 104.1] };
const M0 = model(0), M1 = model(THETA0);
const fade = (x) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
function door(th) {
  const m = model(th), w0 = fade(1 - th / 35), w1 = fade(1 - (THETA0 - th) / 35), q = {};
  for (const k of Object.keys(m)) q[k] = [0, 1].map((i) => m[k][i] + (SHUT[k][i] - M0[k][i]) * w0 + (OPENED[k][i] - M1[k][i]) * w1);
  const poly = (pts, f) => `<polygon points="${pts.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ")}" ${f}/>`;
  const inside = [q.Ht, q.Ft, q.Fb, q.Hb], outside = inside.map((p) => add(p, q.D));
  const top = [q.Ht, q.Ft, add(q.Ft, q.D), add(q.Ht, q.D)], edge = [q.Ft, add(q.Ft, q.D), add(q.Fb, q.D), q.Fb];
  // the knob: side on while the door faces away, round as it comes to face us
  const f = Math.max(0, Math.cos((th * Math.PI) / 180));
  const knob = `${poly([add(q.S1, [0, -1.1]), add(q.S2, [0, -1.1]), add(q.S2, [0, 1.1]), add(q.S1, [0, 1.1])], LIT)}<ellipse cx="${n2(q.K[0])}" cy="${n2(q.K[1])}" rx="${n2(1.5 + 2 * f)}" ry="${n2(3.1 + 0.4 * f)}" ${INK}/>${3 * f > 0.05 ? `<ellipse cx="${n2(q.K[0] - 0.5)}" cy="${n2(q.K[1] - 0.5)}" rx="${n2(3 * f)}" ry="3" ${LIT}/>` : ""}`;
  // past square to the front, its inside faces us (as the still); short of it, its outside, the inside showing only as its shade
  return th >= 90 ? `${poly(inside, WOOD)}${poly(top, TOP)}${poly(edge, DEEP)}${knob}` : `${poly(inside, DEEP)}${poly(top, TOP)}${poly(edge, DEEP)}${poly(outside, WOOD)}${knob}`;
}

// ---- the swing: the spring's push, strongest wound open, still most of it at shut, against a little friction in the old hinges; the door's
// weight takes no part (its hinges stand straight). From the creak to the clap in a little under a second.
const T_GIVE = 0.3, T_GO = 0.48, CREAK = 0.6, SPRING = 7.5, DRAG = 0.6;
const SWING = (() => { const S = []; const a0 = ((THETA0 - CREAK) * Math.PI) / 180; let a = a0, w = 0; const dt = 1 / 2000; while (a > 0) { S.push(a); w += (-SPRING * (0.6 + (0.4 * a) / a0) - DRAG * w) * dt; a += w * dt; } S.push(0); return S; })();
const T_CLAP = T_GO + (SWING.length - 1) / 2000;
// (the creak: it gives a hair and catches; then it goes)
const swing = (t) => (t <= T_GIVE ? THETA0 : t <= T_GO ? THETA0 - track([[T_GIVE, 0], [T_GIVE + 0.06, CREAK, "out"]], t) : t >= T_CLAP ? 0 : (SWING[Math.round((t - T_GO) * 2000)] * 180) / Math.PI);

// ---- happy: shut
const HAPPY_DUR = T_CLAP + 0.5;
function happy(t) {
  if (t <= T_GIVE) return STILL;
  // (it claps against the frame, bounces off a hair, and the catch pulls it home)
  const th = t < T_CLAP ? swing(t) : track([[T_CLAP, 0], [T_CLAP + 0.05, 3, "out"], [T_CLAP + 0.11, 0, "in"], [T_CLAP + 0.14, 0.6, "out"], [T_CLAP + 0.17, 0, "in"]], t);
  return `${OPEN}${CUPBOARD}${door(th)}</svg>`;
}

// ---- sad: off its top hinge
// it hangs from the bottom hinge (x 128, y 126): the door's weight to the left of it (I about it 1507 m, the lever 17.5: 11.6 rad/s/s) swings it
// down until its lowest corner meets the floor in front (y 152.5)
const PIVOT = [128, 126], ALPHA = (1000 * 17.5) / 1507, T_TEAR = T_CLAP + 0.07;
const SHUT_PTS = [[93, 65], [93, 134], [94.5, 135.5], [129.5, 135.5]];
const DROP = (() => { for (let d = 0; d < 90; d += 0.01) { const r = (d * Math.PI) / 180; if (Math.max(...SHUT_PTS.map(([x, y]) => PIVOT[1] - (x - PIVOT[0]) * Math.sin(r) + (y - PIVOT[1]) * Math.cos(r))) >= 152.5) return d; } return 90; })();
const T_DOWN = T_TEAR + Math.sqrt((2 * ((DROP * Math.PI) / 180)) / ALPHA);
const SAD_DUR = T_DOWN + 0.6;
function sad(t) {
  if (t <= T_GIVE) return STILL;
  if (t < T_CLAP) return `${OPEN}${CUPBOARD}${door(swing(t))}</svg>`;
  let drop = 0;
  if (t > T_TEAR) drop = t < T_DOWN ? (0.5 * ALPHA * (t - T_TEAR) ** 2 * 180) / Math.PI : DROP - track([[T_DOWN, 0], [T_DOWN + 0.06, 2.2, "out"], [T_DOWN + 0.12, 0, "in"], [T_DOWN + 0.15, 0.5, "out"], [T_DOWN + 0.18, 0, "in"]], t);
  const shut = door(0);
  return `${OPEN}${CUPBOARD}${drop ? `<g transform="rotate(${n2(-drop)} ${PIVOT[0]} ${PIVOT[1]})">${shut}</g>` : shut}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
