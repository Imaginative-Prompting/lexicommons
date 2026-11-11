// Inside's two stories, the weather's: an evening goes by in a few seconds, outside the open-fronted house. Happy: snow comes on and
// settles, white on the roof and the chimney's top, smoke rising from the chimney; the room inside is warm and dry, the lamp on; the snow
// eases off and stops. Sad: rain comes on, and the roof leaks: drops gather on the ceiling over the armchair and fall onto its cushion, a wet
// dark patch spreading there and a puddle on the floor in front; the rain eases off and stops, the chair soaked.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><polygon points=\"26,175 156,175 170,166 200,184 200,200 66,200\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"156,84 170,75 170,167 156,176\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"44\" y=\"38\" width=\"13\" height=\"24\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"57,40 64,35.5 64,53 57,58\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"42,33 49,28.5 66,28.5 59,33\" fill=\"var(--art-clay-lit,#F6A06F)\"/><polygon points=\"59,33 66,28.5 66,34.5 59,39\" fill=\"var(--art-clay-deep,#C25626)\"/><rect x=\"42\" y=\"33\" width=\"17\" height=\"6\" rx=\"1\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M32 92.2L91 45.2L150 92.2V170H32Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"32,92.2 44,82.6 44,162 32,170\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"32,170 44,162 150,162 150,170\" fill=\"var(--art-ground,#D3CAB5)\"/><rect x=\"82\" y=\"71\" width=\"38\" height=\"29\" fill=\"var(--art-bark,#7A4E2D)\"/><rect x=\"85.5\" y=\"74.5\" width=\"31\" height=\"22\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M98 96.5C101 90 108 85 116.5 84.8V96.5Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M85.5 85C93 84 101 86.5 107 90.5C111 93.3 114 95.5 116.5 96.3V96.5H85.5Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M58.9 151H60.7V162.6Q59.8 163.4 58.9 162.6Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M57.4 137C57.4 141 56 143 56 146.5C56 149.5 54 151 51 153.5C48.5 155.5 47 158 46.8 163.8C46.8 164.6 48.4 164.6 48.4 163.8C49 159.5 51.5 156.5 57 154.5Q59.8 153.6 62.6 154.5C68.1 156.5 70.6 159.5 71.2 163.8C71.2 164.6 72.8 164.6 72.8 163.8C72.6 158 71.1 155.5 68.6 153.5C65.6 151 63.6 149.5 63.6 146.5C63.6 143 62.2 141 62.2 137Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M40.8 132.5V135.5A19 3.2 0 0 0 78.8 135.5V132.5Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><ellipse cx=\"59.8\" cy=\"132.5\" rx=\"19\" ry=\"3.2\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M57.3 110V112.5C57.3 115 51.8 118 51.8 124C51.8 128 54.5 130.5 55.3 133.2H64.3C65.1 130.5 67.8 128 67.8 124C67.8 118 62.3 115 62.3 112.5V110Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M60.8 110V112.5C61.5 116 63.6 119 63.6 124.5C63.6 128.5 61.8 131 61.6 133.2H64.3C65.1 130.5 67.8 128 67.8 124C67.8 118 62.3 115 62.3 112.5V110Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M50.6 89.3Q59.8 88.3 69 89.3L76.8 109.4Q77 110.5 75.8 110.5Q59.8 111.5 43.8 110.5Q42.6 110.5 42.8 109.4Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M65.2 89L69 89.3L76.8 109.4Q77 110.5 75.8 110.5Q72 110.8 68 110.9Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M92.5 151H97L94.6 162.2H92.4Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M139 151H143.5L143.6 162.2H141.4Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M86.5 155H91L88.6 166.2H86.4Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M133 155H137.5L137.6 166.2H135.4Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M103 103.6H123C132 103.6 138.5 106 138.5 113.5V140H103Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M91.5 142V113C91.5 106.5 95 104 103 104H121C129 104 132.5 106.5 132.5 113V142Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M95 123.5C98.5 121.6 102.5 121.3 103.8 123.4V141H95Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><rect x=\"95\" y=\"140\" width=\"34\" height=\"16\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M98 134.5H126C128 134.5 129.5 135.5 129.5 137.5V143C129.5 145 128 146 126 146H98C96 146 94.5 145 94.5 143V137.5C94.5 135.5 96 134.5 98 134.5Z\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M133 122.6C137 121 143.5 120.4 145.3 122.2C146 123 146.2 124.6 146.2 126.4V152L140 156H133Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M127 156V128C127 124.6 129.4 122.5 133.5 122.5C137.6 122.5 140 124.6 140 128V156Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M84 156V128C84 124.6 86.4 122.5 90.5 122.5C94.6 122.5 97 124.6 97 128V156Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M26 84L91 33L156 84V176H26ZM33 91.4L91 46.2L149 91.4V169H33Z\" fill-rule=\"evenodd\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"91,24 105,15 182,75 175.8,82.9 161.8,91.9\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M91 24L166.8 83.1Q168 84 167.1 85.2L162.7 90.7Q161.8 91.9 160.6 91L91 36.7L21.4 91Q20.2 91.9 19.3 90.7L14.9 85.2Q14 84 15.2 83.1Z\" fill=\"var(--art-clay,#E8743B)\"/></svg>\n";
export const STILL_HASH = "de3e747e8f";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 38) throw new Error("inside: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
// the house's outline (walls, roof, chimney): weather falls round it, never in it (it's open only towards us)
const HOUSE = "M14.9 85.2L42 64V33L49 28.5H66V50.6L91 24L105 15L182 75L175.8 82.9L170 86.6V167L156 176H26V91.4L21.4 91Q20.2 91.9 19.3 90.7Z";
const OUTSIDE = `<clipPath id="ou"><path d="M-50 -50H250V250H-50Z${HOUSE}" clip-rule="evenodd"/></clipPath>`;
// a fixed scatter: the same every frame (pure)
const rnd = (k, j) => { const x = Math.sin(k * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };

// the top of the house's outline at x (its roof's slopes, the ridge, the chimney): what falls on it lands there
const roofAt = (x) => {
  if (x < 15 || x > 182) return 1e9;
  if (x >= 42 && x <= 66) return 28.5;
  if (x <= 91) return 85.2 - ((x - 14.9) * 61.2) / 76.1;
  if (x <= 105) return 24 - ((x - 91) * 9) / 14;
  return 15 + ((x - 105) * 60) / 77;
};
// ---- weather: each piece spawned above the frame at its own time and place, falling at its speed (with a sway for snow), gone where it
// lands: on the ground (at its own depth, 176 to 200) or on the roof (it merges into what's there). It comes on, and eases off by T_END.
function fallers(t, n, v, from, to, draw, swayAmp) {
  let out = "";
  for (let k = 0; k < n; k++) {
    // the rate eases on and off: spawn times spread over [from, to], thicker in the middle
    const u = (k + rnd(k, 1)) / n, s0 = from + (to - from) * (u < 0.5 ? Math.sqrt(u / 2) : 1 - Math.sqrt((1 - u) / 2));
    const x0 = -30 + 260 * rnd(k, 2), y = -12 + v * (t - s0);
    const x = x0 + swayAmp * Math.sin((t - s0) * 3 + k) + (draw === "rain" ? -0.27 * (y + 12) : 0);
    // where it lands: the roof (or the chimney's top) if it's over the house, else the ground at its own depth
    const ground = Math.min(176 + 24 * rnd(k, 3), roofAt(x));
    if (t < s0 || y > ground + 2) continue;
    // at the ground it lands: shrinking away over its last 2 units
    const k2 = Math.max(0, Math.min(1, (ground + 2 - y) / 2));
    out += draw === "rain"
      ? `<path d="M${n2(x)} ${n2(y)}l${n2(-2.7 * k2)} ${n2(10 * k2)}" stroke="${paint("sky-lit")}" stroke-width="1.1" stroke-linecap="round"/>`
      : `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2((1.1 + 0.7 * rnd(k, 4)) * k2)}" ${fill("paper")}/>`;
  }
  return `<g clip-path="url(#ou)">${out}</g>`;
}

// ---- happy: snow (in time-lapse, falling 200 a second), settling on the roof: a white cap on its back plane and along the eaves' tops,
// and on the chimney's top; the chimney's smoke drawn up out of it, curling, as the room is warm
const snowOn = (k) => {
  if (k < 0.004) return "";
  const back = `<polygon points="91,24 105,15 182,75 178.5,79.5 166,85" ${fill("paper")} opacity="${n2(k)}"/>`;
  const eave = `<path d="M91 ${n2(24 - 2.4 * k)}L166.8 ${n2(83.1 - 2.4 * k)}V83.1L91 24L15.2 83.1V${n2(83.1 - 2.4 * k)}Z" ${fill("paper")}/>`;
  const cap = `<polygon points="42,33 49,28.5 66,28.5 59,33" ${fill("paper")} opacity="${n2(k)}"/><rect x="42" y="${n2(33 - 2.2 * k)}" width="17" height="${n2(2.2 * k)}" ${fill("paper")}/>`;
  return back + eave + cap;
};
const smoke = (g) => {
  if (g < 0.004) return "";
  // a ribbon drawn up from the chimney's mouth, its top swaying off to the right as it rises
  const top = 28.5 - 26 * g, sway = 7 * g;
  return `<path d="M51 28.5C48 ${n2(28.5 - 8 * g)} ${n2(56 + sway * 0.4)} ${n2(28.5 - 14 * g)} ${n2(53 + sway * 0.6)} ${n2(28.5 - 19 * g)}C${n2(50 + sway)} ${n2(top + 4)} ${n2(58 + sway)} ${n2(top + 1)} ${n2(60 + sway)} ${n2(top)}`
    + `C${n2(61 + sway)} ${n2(top + 4)} ${n2(55 + sway)} ${n2(top + 6)} ${n2(58 + sway * 0.6)} ${n2(28.5 - 17 * g)}C${n2(60 + sway * 0.4)} ${n2(28.5 - 12 * g)} 53 ${n2(28.5 - 7 * g)} 55 28.5Z" ${fill("paper-mid")}/>`;
};
const T_END = 2.5;
const HAPPY_DUR = T_END + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const settle = track([[0.5, 0], [2.3, 1, "io"]], t), sm = track([[0.25, 0], [1.6, 1, "io"]], t);
  // (spawned from the start until 1.4: at 200 a second the last are down by the end)
  const flakes = fallers(t, 80, 200, 0.05, 1.4, "snow", 3);
  return `${OPEN}${OUTSIDE}${EL.slice(0, 3).join("")}${smoke(sm)}${EL.slice(3, 38).join("")}${snowOn(settle)}${flakes}</svg>`;
}

// ---- sad: rain (falling 360 a second, slanted a little by the wind); the leak over the armchair: a drop gathers on the ceiling there
// (swelling), lets go, falls (gravity: the house is 6 m, so 245 a second squared), lands on the cushion; then the next. The cushion darkens
// where they land, wider with each; once it's wet through a puddle grows on the floor in front.
const LEAK = [126, 74.5], SEAT = 137.5, G = 245;
const FALL_T = Math.sqrt((2 * (SEAT - LEAK[1])) / G);
// (and a last one still gathering when it ends: hanging from the stain)
const DRIPS = [0.55, 1.05, 1.45, 1.8, 2.12, 3.3];
function leak(t) {
  let svg = "";
  for (const d of DRIPS) {
    // (the last gathers slowly, and is still hanging, swollen, at the end)
    const grow = track([[d - (d > 3 ? 0.8 : 0.3), 0], [d, 1, "in"]], t);
    if (t < d) { if (grow > 0.02) svg += `<ellipse cx="${LEAK[0]}" cy="${n2(LEAK[1] + 1.6 * grow)}" rx="${n2(1.6 * grow)}" ry="${n2(2.1 * grow)}" ${fill("sky")}/>`; continue; }
    const s = t - d;
    if (s < FALL_T) svg += `<ellipse cx="${LEAK[0]}" cy="${n2(LEAK[1] + 3 + 0.5 * G * s * s)}" rx="1.5" ry="2.3" ${fill("sky")}/>`;
    else if (s < FALL_T + 0.08) { const k = (s - FALL_T) / 0.08; svg += `<ellipse cx="${LEAK[0]}" cy="${SEAT}" rx="${n2(1.5 + 3 * k)}" ry="${n2(2.3 * (1 - k))}" ${fill("sky")}/>`; }
  }
  return svg;
}
const SAD_DUR = T_END + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  const drops = fallers(t, 130, 360, 0.05, T_END - 0.6, "rain", 0);
  // the wet: on the cushion where the drops land, growing with each landing; then the puddle in front of the chair
  // (each drop soaks in over 0.3 s after it lands)
  const wet = DRIPS.reduce((a, d) => a + Math.max(0, Math.min(1, (t - d - FALL_T) / 0.3)), 0) / DRIPS.length;
  const stain = wet > 0.004 ? `<clipPath id="cu"><path d="${EL[31].match(/ d="([^"]*)"/)[1]}"/></clipPath><g clip-path="url(#cu)"><ellipse cx="${LEAK[0]}" cy="140" rx="${n2(15 * Math.sqrt(wet))}" ry="${n2(7 * Math.sqrt(wet))}" ${fill("violet")}/></g>` : "";
  // the puddle, flat on the floor in front of the chair, as wide as the chair's front by the end
  const puddle = track([[1.7, 0], [2.9, 1, "out"]], t);
  const pool = puddle > 0.01 ? `<ellipse cx="114" cy="166" rx="${n2(27 * puddle)}" ry="${n2(3.8 * puddle)}" ${fill("sky-deep")}/><ellipse cx="108" cy="165.2" rx="${n2(9 * puddle)}" ry="${n2(1.1 * puddle)}" ${fill("sky")}/>` : "";
  // where the drops gather, the ceiling darkens: a damp stain spreading from the leak, down the wall under the ceiling's slope, darker at
  // its middle (kept to the room's back wall)
  const damp = track([[0.25, 0], [2.9, 1, "out"]], t);
  const blob = (r, dy) => { const P = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * 2 * Math.PI, w = 1 + 0.18 * Math.sin(i * 2.7 + 1) + 0.1 * Math.cos(i * 4.1); P.push([LEAK[0] + Math.cos(a) * r * 1.35 * w, LEAK[1] + dy + Math.sin(a) * r * w]); } return P; };
  const poly = (P, tone) => `<polygon points="${P.map((q) => `${n2(q[0])},${n2(q[1])}`).join(" ")}" ${fill(tone)}/>`;
  const ceiling = damp > 0.01 ? `<clipPath id="wa"><path d="M32 92.2L91 45.2L150 92.2V170H32Z"/></clipPath><g clip-path="url(#wa)">${poly(blob(13 * damp, 3 * damp), "sun")}${poly(blob(6.5 * damp, 1.5 * damp), "sun-deep")}</g>` : "";
  // the roof wet through by the rain: its tiles darken, as the snow whitened them
  const wetRoof = 0.55 * track([[0.2, 0], [1.6, 1, "io"]], t);
  const roof = wetRoof > 0.004 ? `<polygon points="91,24 105,15 182,75 175.8,82.9 161.8,91.9" ${fill("clay-deeper")} opacity="${n2(wetRoof)}"/>${EL[37].replace(paint("clay"), paint("clay-deep")).replace("/>", ` opacity="${n2(wetRoof * 0.8)}"/>`)}` : "";
  // (under the chair's legs, so they stand in it; a thin ring round each front foot once the water reaches it)
  const ring = (x, dist) => { const k = Math.max(0, Math.min(1, (27 * puddle - dist) / 3)); return k > 0.01 ? `<ellipse cx="${x}" cy="166.2" rx="${n2(3.4 * k)}" ry="${n2(0.9 * k)}" fill="none" stroke="${paint("ink-lit")}" stroke-width="0.6"/>` : ""; };
  const rings = ring(88.5, 25.5) + ring(136.5, 22.5);
  return `${OPEN}${OUTSIDE}${EL.slice(0, 11).join("")}${ceiling}${EL.slice(11, 23).join("")}${pool}${EL.slice(23, 31).join("")}${rings}${EL[31]}${stain}${EL.slice(32, 38).join("")}${roof}${leak(t)}${drops}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
