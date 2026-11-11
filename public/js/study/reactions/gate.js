// Gate's story, its happy alone (its sad, the left leaf dropping on worn hinges to drag on the path, can't show: the leaves hang a hair over the
// ground, so a dropped leaf moves no more than that: the player keeps the still for it): a gust from our side rattles the two leaves against each
// other and shakes the loose bolt out of its keeper; then it pushes them, and both swing open, away from us into the yard, slowing as the gust
// dies and the old hinges drag, and stand there open: the way in clear.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall behind, the ground, the path, the threshold, the low walls, the
// left leaf (59-99.6 across, 96.5-156 down, slatted, its meeting edge shaded) and the right (100.4-141), the posts (their inner sides seen) and their
// caps, the hinge straps (two to a leaf, on their posts' edges), and the bolt (its bar from 88.5 to 105.5 on the right leaf, its thumb, and the
// keeper's staple and ring on the left). Depth runs up and right: a step away from us is 0.27 right and 0.136 up (the posts, 14.7 thick, show
// 4 by 2 of their sides). A leaf (1 m) is 40.6 across: 40 to the meter.
import { n2, n4, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect x=\"0\" y=\"155\" width=\"200\" height=\"45\" fill=\"var(--art-sun-lit,#FAD57E)\"/><rect x=\"0\" y=\"163\" width=\"200\" height=\"37\" fill=\"var(--art-teal,#37B39B)\"/><polygon points=\"60,155.5 140,155.5 172,200 28,200\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"16,157 59.3,157 56,161.5 22,161.5\" fill=\"var(--art-sun-deep,#DB9A22)\"/><polygon points=\"59.3,157 140.7,157 144,161.5 56,161.5\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><polygon points=\"140.7,157 188,157 194,161.5 144,161.5\" fill=\"var(--art-sun-deep,#DB9A22)\"/><polygon points=\"16,128.5 19.5,127 42.5,127 42.5,128.5\" fill=\"var(--art-clay-lit,#F6A06F)\"/><rect x=\"16\" y=\"128.3\" width=\"26.5\" height=\"29.7\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"154,128.5 157.5,127 187.5,127 184,128.5\" fill=\"var(--art-clay-lit,#F6A06F)\"/><rect x=\"154\" y=\"128.3\" width=\"30.2\" height=\"29.7\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"184,128.5 187.5,127 187.5,156.5 184,158\" fill=\"var(--art-clay-deep,#C25626)\"/><path fill-rule=\"evenodd\" d=\"M59 96.5H99.6V156H59ZM63.6 103h4v21.5h-4ZM70.6 103h4v21.5h-4ZM77.6 103h4v21.5h-4ZM84.6 103h4v21.5h-4ZM91.6 103h4v21.5h-4ZM63.6 130.5h4V151h-4ZM70.6 130.5h4V151h-4ZM77.6 130.5h4V151h-4ZM84.6 130.5h4V151h-4ZM91.6 130.5h4V151h-4Z\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"98.2\" y=\"96.5\" width=\"1.4\" height=\"59.5\" fill=\"var(--art-wood-deep,#B97F45)\"/><path fill-rule=\"evenodd\" d=\"M100.4 96.5H141V156H100.4ZM104.4 103h4v21.5h-4ZM111.4 103h4v21.5h-4ZM118.4 103h4v21.5h-4ZM125.4 103h4v21.5h-4ZM132.4 103h4v21.5h-4ZM104.4 130.5h4V151h-4ZM111.4 130.5h4V151h-4ZM118.4 130.5h4V151h-4ZM125.4 130.5h4V151h-4ZM132.4 130.5h4V151h-4Z\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"41.5\" y=\"91\" width=\"14.7\" height=\"67\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"56,92 60,90 60,156.5 56,158\" fill=\"var(--art-clay-deep,#C25626)\"/><rect x=\"140\" y=\"91\" width=\"14.7\" height=\"67\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"154.5,92 158.5,90 158.5,156.5 154.5,158\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"39.5,87.5 43,85 62,85 57.5,87.5\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"39.5\" y=\"87.5\" width=\"18\" height=\"5\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><polygon points=\"57.5,87.5 62,85 62,90 57.5,92.5\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><polygon points=\"138,87.5 141.5,85 160.5,85 156,87.5\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"138\" y=\"87.5\" width=\"18\" height=\"5\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><polygon points=\"156,87.5 160.5,85 160.5,90 156,92.5\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><rect x=\"57\" y=\"104\" width=\"9\" height=\"4.5\" rx=\"0.6\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"57\" y=\"144\" width=\"9\" height=\"4.5\" rx=\"0.6\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"134\" y=\"104\" width=\"9\" height=\"4.5\" rx=\"0.6\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"134\" y=\"144\" width=\"9\" height=\"4.5\" rx=\"0.6\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"88.5\" y=\"126.3\" width=\"17\" height=\"2.4\" rx=\"0.5\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"103.8\" y=\"124\" width=\"2.8\" height=\"7\" rx=\"0.5\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"91.3\" y=\"128.2\" width=\"1.6\" height=\"2.6\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"92.1\" cy=\"131.3\" r=\"1.5\" fill=\"var(--art-ink,#231F3B)\"/></svg>\n";
export const STILL_HASH = "6676cb4a7b";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 33 || !EL[12].includes("M59 96.5H99.6V156H59Z") || !EL[29].includes('x="88.5" y="126.3"')) throw new Error("gate: the still isn't as this story knows it");
const GROUND = EL.slice(0, 12).join(""), POSTS = EL.slice(15, 25).join("");
const LEFT = EL[12] + EL[13], RIGHT = EL[14], HINGES_L = EL[25] + EL[26], HINGES_R = EL[27] + EL[28], BAR = EL[29] + EL[30], KEEPER = EL[31] + EL[32];
const HL = 59, HR = 141, BACK = [0.27, -0.136];
// a leaf swung open by a: its points at s across from its hinge go s cos(a) along the gate's line and s sin(a) away from us
const swing = (h, a, side) => {
  const r = (a * Math.PI) / 180, A = Math.cos(r) + side * BACK[0] * Math.sin(r), B = side * BACK[1] * Math.sin(r);
  return a ? `translate(${h} 0) matrix(${n4(A)} ${n4(B)} 0 1 0 0) translate(${-h} 0)` : "";
};
const g = (tf, body) => (tf ? `<g transform="${tf}">${body}</g>` : body);

// ---- the gust: it rattles the leaves (knocking a degree or so inward against the bolt and back), the bolt shaking out to the right as it does;
// then its push swings them, less as they turn edge on to it, against the hinges' drag; it dies away, and they coast to a stop
const T_RATTLE = 0.3, T_FREE = 0.72, SLIDE = 12;
const rattle = (t) => (t <= T_RATTLE || t >= T_FREE ? 0 : 0.9 * Math.sin(((t - T_RATTLE) / (T_FREE - T_RATTLE)) * Math.PI) * Math.sin((t - T_RATTLE) * 2 * Math.PI * 9));
const gust = (t) => track([[T_FREE, 0], [T_FREE + 0.25, 1, "out"], [T_FREE + 0.7, 0.8, "io"], [T_FREE + 1.3, 0, "io"]], t);
const table = (push, drag) => { const S = []; let a = 0, w = 0; const dt = 1 / 2000; for (let i = 0; i <= 4 / dt; i++) { if (i % 10 === 0) S.push(a); const t = T_FREE + i * dt; w += (push * gust(t) * Math.cos(a) - drag * w - (w > 0 ? 0.35 : 0)) * dt; if (w < 0) w = 0; a += w * dt; } return S; };
const LEFT_A = table(4.8, 2.2), RIGHT_A = table(4.6, 2.4);
const at = (S, t) => { if (t <= T_FREE) return 0; const k = (t - T_FREE) * 200, i = Math.floor(k), f = k - i; return ((i >= S.length - 1 ? S[S.length - 1] : S[i] + (S[i + 1] - S[i]) * f) * 180) / Math.PI; };

// ---- happy: open
const HAPPY_DUR = T_FREE + 2.6;
function happy(t) {
  if (t <= T_RATTLE) return STILL;
  // (bolted, they can only knock inward together, as far as the bolt's play lets them)
  const r = Math.max(0, rattle(t)), al = at(LEFT_A, t) + r, ar = at(RIGHT_A, t) + 0.8 * r;
  const slide = SLIDE * track([[T_RATTLE + 0.05, 0], [T_FREE, 1, "in"]], t);
  const tl = swing(HL, al, 1), tr = swing(HR, ar, -1);
  const bar = slide > 0.01 ? `<g transform="translate(${n2(slide)} 0)">${BAR}</g>` : BAR;
  return `${OPEN}${GROUND}${g(tl, LEFT)}${g(tr, RIGHT)}${POSTS}${g(tl, HINGES_L + KEEPER)}${g(tr, HINGES_R + bar)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : STILL;
}
