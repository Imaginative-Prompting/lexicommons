// Cold's two stories, the ice's own, a time-lapse: snowmelt runs off the roof and down the three middle icicles and freezes onto them, layer on layer.
// Happy: they thicken until they meet, and the ice webs across between them: one broad fringe with three points, hanging clear of the window. Sad: the
// joined weight is too much for their roots: they snap at the eave, the mass drops onto the window's header and breaks in three, and the pieces
// tumble on down past the window and out of sight: three stumps and a gap in the row are left.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the fascia, the wall, the snow on the roof, the eave's underside, the
// window's frame (its header's top at y 152) and panes, the nine icicles (each lit and shaded, hanging from the eave at y 81; the middle three over
// x 70-130, their tips at y 120, 144 and 128), the eave's dark edge. The window is about 1.5 m: 80 to the meter.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect x=\"0\" y=\"44\" width=\"200\" height=\"28\" fill=\"var(--art-clay,#E8743B)\"/><rect x=\"0\" y=\"80\" width=\"200\" height=\"120\" fill=\"var(--art-ground,#D3CAB5)\"/><rect x=\"0\" y=\"53\" width=\"200\" height=\"4.5\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M-2 14C20 4 45 10 70 22C90 32 105 36 125 30C145 24 160 26 180 34C190 38 196 40 202 42L202 55.5L-2 55.5Z\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"0\" y=\"81\" width=\"200\" height=\"4\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><rect x=\"33\" y=\"152\" width=\"134\" height=\"50\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"40.5\" y=\"158\" width=\"55.5\" height=\"30\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"104\" y=\"158\" width=\"55.5\" height=\"30\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"40.5\" y=\"193\" width=\"55.5\" height=\"9\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"104\" y=\"193\" width=\"55.5\" height=\"9\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M4 81C5 90.5 10 97.2 10.5 108C11 97.2 15 90.5 16 81Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M10.5 108C11 97.2 15 90.5 16 81L11.5 81C11.5 90.5 10.7 96 10.5 108Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M25 81C26 96 31.5 106.8 32 124C32.5 106.8 38 96 39 81Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M32 124C32.5 106.8 38 96 39 81L34.5 81C34.5 96 32.2 104.6 32 124Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M47 81C48 99.2 54.5 112.2 55 133C55.5 112.2 62 99.2 63 81Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M55 133C55.5 112.2 62 99.2 63 81L58.5 81C58.5 99.2 55.2 109.6 55 133Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M70 81C71 94.7 76.5 104.4 77 120C77.5 104.4 83 94.7 84 81Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M77 120C77.5 104.4 83 94.7 84 81L79.5 81C79.5 94.7 77.2 102.4 77 120Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M90 81C91 103 99.5 118.8 100 144C100.5 118.8 109 103 110 81Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M100 144C100.5 118.8 109 103 110 81L104.5 81C104.5 103 100.2 115.6 100 144Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M116 81C117 97.5 122.5 109.2 123 128C123.5 109.2 129 97.5 130 81Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M123 128C123.5 109.2 129 97.5 130 81L125.5 81C125.5 97.5 123.2 106.8 123 128Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M137 81C138 99.6 144.5 112.8 145 134C145.5 112.8 152 99.6 153 81Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M145 134C145.5 112.8 152 99.6 153 81L148.5 81C148.5 99.6 145.2 110.1 145 134Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M161 81C162 93.6 167.5 102.6 168 117C168.5 102.6 174 93.6 175 81Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M168 117C168.5 102.6 174 93.6 175 81L170.5 81C170.5 93.6 168.2 100.8 168 117Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M184 81C185 89 189.5 94.8 190 104C190.5 94.8 195 89 196 81Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M190 104C190.5 94.8 195 89 196 81L192 81C192 89 190.2 93.6 190 104Z\" fill=\"var(--art-sky,#58ADEB)\"/><rect x=\"0\" y=\"70.5\" width=\"200\" height=\"5\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"0\" y=\"75\" width=\"200\" height=\"7\" fill=\"var(--art-ink,#231F3B)\"/></svg>\n";
export const STILL_HASH = "12671b5d4e";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 31 || !EL[19].includes("M90 81C91 103")) throw new Error("cold: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 17).join(""), REST = EL.slice(23, 29).join(""), EAVE = EL[29] + EL[30];
const MIDDLE = [[17, 18, 77], [19, 20, 100], [21, 22, 123]]; // each: its lit side, its shade, its middle
// the three middle icicles, thickened w (each grown out about its own middle line, a little longer too), and the web of ice between them grown j
function middle(w, j, cut = 0) {
  const ice = MIDDLE.map(([a, b, x]) => (w < 0.004 ? EL[a] + EL[b] : `<g transform="translate(${x} 81) scale(${n4(1 + 0.55 * w)} ${n4(1 + 0.06 * w)}) translate(${-x} -81)">${EL[a]}${EL[b]}</g>`)).join("");
  if (j < 0.004) return ice;
  // (between each pair the ice fills down from the eave in a shallow point; lit, shaded on its right)
  const web = (x0, x1, d) => `M${x0} 81L${x1} 81L${n2((x0 + x1) / 2 + 1)} ${n2(81 + d * j)}Z`;
  return `<path d="${web(76, 102, 22)}${web(99, 125, 26)}" ${fill("sky-lit")}/><path d="M${n2(90 + 2)} ${n2(81 + 22 * j - 6 * j)}L102 81L${n2(89 + 1)} ${n2(81 + 22 * j)}ZM${n2(113 + 2)} ${n2(81 + 26 * j - 7 * j)}L125 81L${n2(112 + 1)} ${n2(81 + 26 * j)}Z" ${fill("sky")}/>${ice}`;
}
// the freeze: thickening, then the webbing between them
const grow = (t) => ({ w: track([[0.3, 0], [1.6, 1, "io"]], t), j: track([[0.8, 0], [1.75, 1, "io"]], t) });

// ---- happy: one fringe
const HAPPY_DUR = 2.4;
function happy(t) {
  if (t <= 0) return STILL;
  const { w, j } = grow(t);
  return `${OPEN}${BACK}${middle(w, j)}${REST}${EAVE}</svg>`;
}

// ---- sad: it comes down
const SAD_DUR = 2.6, T_SNAP = 1.45, G = 785, HEADER = 152;
// the three pieces it breaks into on the header: where each goes (its middle's drop after it hits, its turn, and whether it stays on the header)
const PIECES = [[77, -1, 160], [100, 1, -40], [123, 1, 120]];
function sad(t) {
  if (t <= 0) return STILL;
  const g = grow(Math.min(t, T_SNAP));
  if (t <= T_SNAP) return `${OPEN}${BACK}${middle(g.w, g.j)}${REST}${EAVE}</svg>`;
  // snapped at the roots: the stumps left at the eave; the mass dropping its last few units onto the header, then breaking, the pieces tumbling
  const s = t - T_SNAP, drop = 0.5 * G * s * s, hit = Math.sqrt((2 * (HEADER - 148)) / G);
  const stumps = MIDDLE.map(([, , x]) => `<path d="M${x - 6} 81L${x + 6} 81L${x + 1} 87L${x - 1} 86Z" ${fill("sky-lit")}/>`).join("");
  let mass;
  if (s < hit) mass = `<g transform="translate(0 ${n2(drop)})">${middle(g.w, g.j)}</g>`;
  else {
    const r = s - hit, dy = HEADER - 148;
    mass = PIECES.map(([x, d, turn], i) => {
      // each piece is its icicle's part, cut free of the others where the web broke
      const clip = `<clipPath id="pc${i}"><rect x="${x - 13}" y="70" width="26" height="90"/></clipPath>`;
      // (each tumbles on down past the window and out of the picture)
      const ty = dy + 0.5 * G * r * r, sway = d * 30 * r, ang = turn * r;
      return `${clip}<g transform="translate(${n2(sway)} ${n2(ty)}) rotate(${n2(ang)} ${x} 148)"><g clip-path="url(#pc${i})">${middle(g.w, g.j)}</g></g>`;
    }).join("");
  }
  return `${OPEN}${BACK}${stumps}${mass}${REST}${EAVE}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
