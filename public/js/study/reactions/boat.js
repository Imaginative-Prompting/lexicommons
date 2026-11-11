// Boat's two stories, the sea's own: a swell comes through and rolls the boat toward us, and the two loose oars lying on the seats slide downhill.
// Happy: they slide to the near side and come to rest there, a tidy pair against the rail, the rest of the boat clear. Sad: the swell is steeper:
// the near oar slides on, rides up over the rail and drops into the water beside the boat, and lies there floating, out of reach.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky and sea, the boat's shadow on the water and a wave line, the boat
// (its dark outline, its inside, the bow's inside, the two seats, the two oars (the far one, then the near one, each its shade and its lit side),
// its hull, the stern's shade, the stripe and its shade, the rim). We see it from about 22 degrees up: its inside opening, 26 tall in the middle, is
// a boat about 70 across (3.6 m long is 180: 50 to the meter).
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"0\" y=\"156.6\" width=\"200\" height=\"43.4\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M37 158.6L162.8 157.8 200 164.2 200 189.4 166.8 183.5 0 183.5 0 180.5 151.8 180.5Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<path d=\"M0 190.1H200V193.2H0Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<path d=\"M8.1 111.2C8.6 109.8 10.1 109.1 11.8 109.7L20.7 112.3C21.8 112.7 22.3 113.4 22.8 114.1 37.4 109.2 49 108.6 61.1 109 91.3 109.6 120.1 110.8 149.5 111.4 166.2 111.8 178.9 112.4 185 115.1 186.6 115.8 187.5 116.5 187.2 118.1 185.4 132.7 180.4 149.4 169.6 158.7 168.9 159.3 167.7 159.7 165.4 159.7H40.8C33.2 159.7 28.1 153.9 23.4 145.8 16.9 134.9 10.1 121 8.1 111.2Z\" fill=\"var(--art-bark,#7A4E2D)\"/>\n<path d=\"M23.8 117.1C35.6 112.6 47.4 111 61 111.5 95.6 112.1 125.4 113.3 152 113.8 165.6 114.1 176.8 114.9 183 117.1 181.1 125.4 174 130.2 162.1 132.9 141.5 137.1 100.2 137.8 67.7 135.6 45.8 134.1 32.5 128.3 23.8 117.1Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/>\n<path d=\"M24.2 117.2C35.3 113 43.4 112 51.1 111.6L44.4 129.8C35.7 127 29.3 122.8 24.2 117.2Z\" fill=\"var(--art-bark,#7A4E2D)\"/>\n<path d=\"M51.7 113.1C57.5 112.8 66.9 112.8 74.4 113.2 74.9 113.2 74.9 113.6 74.7 114.3L69.3 135.3 42.7 131.4 48.1 117.2C49 114.9 50 113.6 51.7 113.1Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M51.3 112.8C58 112.5 66.5 112.5 74.1 112.8 74.8 112.8 74.9 113.1 74.7 113.9L69.4 134.5 42.9 131.2 48.7 116.3C49.3 114.6 50 113.5 51.3 112.8Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<path d=\"M137.6 115.1L148.4 115.1 143 135.2 129.1 136 136.8 116.2C137 115.5 137.2 115.1 137.6 115.1Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M137.5 114.7L148.3 114.8 142.8 134.7 129.2 135.7 136.8 115.7C137 115.1 137.2 114.7 137.5 114.7Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<path d=\"M47.6 117.5C49.7 114.1 54.8 114.5 60.1 114.5 68.3 114.6 74.1 116.9 80.2 118.3L161.5 118.7C163 118.7 164.2 117.1 165.7 117.5 168 117.9 169.4 119.4 169.2 121.1 168.9 123.1 167.4 123.8 165.6 123.4 164.1 123.2 162.6 121.9 161.5 121.8L80.1 121.3C71.7 121.6 65 123.1 56.4 123.2L48.9 123.1C46.5 123 45.3 122 46.4 119.7Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M48.3 115.9C50.6 112.3 55 113.4 60.4 113.4 68.7 113.6 74.1 116.5 80.2 117.9L161.6 118.4C163.1 118.4 164 116.7 165.8 117 168 117.4 169.5 118.5 169.2 120.3 169 121.8 167.6 122.3 165.9 122.1 164.1 121.9 162.7 120.7 161.5 120.7L80 120.1C72.7 120.3 65 121.7 56.2 121.8H48.6C46.2 121.8 45.5 120.6 46.6 118.7Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M48.7 125C51.1 123.3 55.3 124.2 60.4 124.4 68.3 124.7 74.1 127 80.2 128.2L159.9 128.3C161.4 128.3 162 126.7 163.6 126.8 165.9 127 167.2 128.3 167.1 130.1 167 131.7 165.6 132.4 163.9 132.1 162.3 131.9 160.9 130.7 159.8 130.7L80.1 130.5C73 130.8 65.9 133 57.3 133.2L49 132.5C46.6 132.3 45.2 131.2 46.3 129Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M48.6 124.2C51.2 122.8 55.3 123.7 60.5 123.9 68.7 124.2 74.5 126.1 80.2 127.2L159.9 127.2C161.3 127.2 162.3 125.7 163.8 125.9 166.1 126.1 167.4 127.5 167.1 129 166.8 130.5 165.5 130.9 163.8 130.6 162.3 130.4 161.1 129.4 159.8 129.4L80.1 129.3C72.6 129.5 65.9 132 57.2 132.2L48.8 131.7C46.5 131.6 45.3 130.6 46.3 128.5Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M8.2 111.2L17.4 114.2C18.8 114.6 19.2 115.4 20 117 25.1 127 43.6 134.5 66.9 136.1 95.2 138 137.7 137.1 162 133.8 176.9 131.8 184 126.6 187 118.4 185.3 130.3 181.8 141.8 176 150.6 160.9 154.3 142.6 155.3 121.7 154.8 76.2 154 39 147 18.3 137.9 13.8 129.3 9.4 119.3 8.2 111.2Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M178.9 116.5L183.3 117.1C181.5 125 177.5 134.2 173.3 142.3 168.3 151.2 160.5 156.9 150.9 159.7H165.4C167.8 159.7 169 159.3 169.9 158.5 179.7 149.9 185.4 133.4 187.2 117.4Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M14.3 128.8C34.7 142.1 73 148.5 112.7 149.2 140.3 149.7 163.1 147.6 181 141 180.1 143.2 179.5 144.7 178.5 146.4 161.2 152.1 138.7 154.2 111.4 153.6 70.4 152.9 35 146.8 18.1 136.7Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M166.8 145.1C171.9 143.9 176.7 142.5 181 141 180.1 143.2 179.5 144.7 178.5 146.4 173.5 148 168.3 149.4 162.5 150.4 164.1 148.8 165.5 147 166.8 145.1Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M8.1 111.2C8.5 109.7 10 109.1 11.6 109.6L20.4 112.2C21.6 112.6 22.1 113.3 22.8 114.1 36.1 109.5 48.7 108.6 61.2 109 92.9 109.6 121.3 110.7 149.8 111.3 165.4 111.6 178.6 112.4 184.6 114.8 186.9 115.7 187.5 116.5 187.2 118.1 185.8 124.4 180.2 129.1 171.5 132.2 153.3 138.5 103.8 139.2 68.1 137.8 43.9 136.7 24.8 128.3 20.1 120.2 19 118.5 19 116.6 17.2 115.3ZM24.3 117C33.2 127 47.6 133.2 68.4 135 100 136.6 146 136 163.7 132.8 174.8 130.8 180.6 126.1 182.9 117.2 176.6 115.2 163.8 114.5 149.6 114.1 119.8 113.5 91.8 112.5 61 111.6 48.2 111.1 36.7 112.4 24.3 117Z\" fill=\"var(--art-sun-lit,#FAD57E)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "2390346217";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 20 || !EL[5].includes("M23.8 117.1C35.6 112.6")) throw new Error("boat: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const SEA = EL.slice(0, 4).join("");
const D = (i) => EL[i].match(/ d="([^"]*)"/)[1];
// a path's points moved by f (its commands here are M, L, C, H and Z, all absolute; an H becomes an L)
function warpD(d, f) {
  const T = d.match(/[MLCHZ]|-?\d*\.?\d+/g); let out = "", cmd = "", y0 = 0, k = 0, n = 0;
  while (k < T.length) {
    const tk = T[k];
    if (/[MLCHZ]/.test(tk)) { cmd = tk; k++; out += cmd === "H" ? "L" : cmd; continue; }
    const x = +T[k++], y = cmd === "H" ? y0 : +T[k++]; y0 = y;
    const p = f(x, y, n++); out += `${n2(p[0])} ${n2(p[1])} `;
  }
  return out.replace(/ ([A-Z])/g, "$1").trim();
}
const warp = (i, f) => EL[i].replace(/ d="[^"]*"/, ` d="${warpD(D(i), f)}"`);

// ---- the roll. The inside's far and near edges along the boat (from its own outline), so a point's place across the boat can be told from its height
const lerp = (P, x) => { if (x <= P[0][0]) return P[0][1]; for (let i = 1; i < P.length; i++) if (x <= P[i][0]) return P[i - 1][1] + ((P[i][1] - P[i - 1][1]) * (x - P[i - 1][0])) / (P[i][0] - P[i - 1][0]); return P[P.length - 1][1]; };
const FAR = [[23.8, 117.1], [40, 113.5], [61, 111.5], [100, 112.4], [152, 113.8], [176.8, 114.9], [183, 117.1]];
const NEAR = [[23.8, 117.1], [32.5, 128.3], [45.8, 134.1], [67.7, 135.6], [100.2, 137.8], [141.5, 137.1], [162.1, 132.9], [174, 130.2], [181.1, 125.4], [183, 117.1]];
const SIN = 0.375, COS = 0.927, RAIL = 23.1, WATER = 157;
// how far a point moves when the boat rolls r (radians, toward us): its place across (w: + far, - near) and its height above the water (h)
function rolled(x, y, r) {
  const yf = lerp(FAR, x), yn = lerp(NEAR, x), b = (yn - yf) / (2 * SIN);
  let w, h;
  if (y <= yn) { w = yn - yf > 0.5 ? b * (1 - (2 * (y - yf)) / (yn - yf)) : 0; h = RAIL; }
  else { w = -b; h = RAIL * Math.max(0, 1 - (y - yn) / Math.max(1, WATER - yn)); }
  return r * (-w * COS + h * SIN);
}
// the boat, rolled r and lifted by the swell: every part but the oars bends as its points move; the oars move whole (each lies at one place across)
const HULL = [4, 5, 6, 7, 8, 9, 10], SIDE = [15, 16, 17, 18, 19];
const OARS = [[11, 12, [105, 118.2]], [13, 14, [105, 127.7]]];
// (what dips below the still's own waterline goes under: the boat is drawn only inside its own outline and above it)
const KEEL = `<clipPath id="bt"><path d="${D(4)}"/><rect width="200" height="140"/></clipPath>`;
const oar = ([a, b, c], dy, r, lift) => { const s = dy + rolled(c[0], c[1] + dy, r) + lift; return `<g transform="translate(0 ${n2(s)})">${EL[a]}${EL[b]}</g>`; };
function boat(r, lift, slides, gone = false) {
  const f = (x, y) => [x, y + rolled(x, y, r) + lift];
  const oars = OARS.map((o, i) => (gone && i === 1 ? "" : oar(o, slides[i], r, lift))).join("");
  return `${KEEL}<g clip-path="url(#bt)">${HULL.map((i) => warp(i, f)).join("")}${oars}${SIDE.map((i) => warp(i, f)).join("")}</g>`;
}

// ---- happy: a tidy pair
const HAPPY_DUR = 2.6;
const swell = (t, peak) => ({ r: track([[0.15, 0], [0.6, peak, "io"], [1.15, -peak * 0.3, "io"], [1.6, peak * 0.12, "io"], [1.95, 0, "io"]], t), lift: track([[0.15, 0], [0.55, -2.4, "io"], [1.1, 0.6, "io"], [1.6, 0, "io"]], t) });
function happy(t) {
  if (t <= 0) return STILL;
  const { r, lift } = swell(t, 0.12);
  // once the boat leans far enough, the oars slide: the near one to the rail (and stops there), the far one down to lie against it
  const near = track([[0.42, 0], [0.72, 4.5, "in"], [0.77, 4, "out"], [0.83, 4.5, "in"]], t);
  const far = track([[0.47, 0], [0.84, 9, "in"], [0.89, 8.3, "out"], [0.96, 9, "in"]], t);
  return `${OPEN}${SEA}${boat(r, lift, [far, near])}</svg>`;
}

// ---- sad: one goes over
const SAD_DUR = 2.8, T_OVER = 0.7, G = 490;
// What of the near oar shows while it's coming out of the boat: the opening the rim leaves (the rim's own hole, its second outline: the oar's ends,
// toward bow and stern, are under the rim there), its near edge let down by a band along the oar's length as the oar comes up over the rim (band 0 is
// exactly the opening, so nothing shows that the boat covered; past the rail the band grows until it holds the whole oar, and then it's let go). The
// near edge is the hole's first ten points; the band tapers to nothing at its two ends.
const HOLE = D(19).slice(D(19).indexOf("ZM") + 1);
const opening = (band, r, lift) =>
  `<clipPath id="lp"><path d="${warpD(HOLE, (x, y, n) => { const yb = n < 10 ? y + band * Math.sin((Math.PI * Math.min(1, Math.max(0, (x - 24.3) / 158.6)))) ** 0.3 : y; return [x, yb + rolled(x, yb, r) + lift]; })}"/></clipPath>`;
function sad(t) {
  if (t <= 0) return STILL;
  const { r, lift } = swell(t, 0.2);
  const far = track([[0.42, 0], [0.75, 9, "in"], [0.8, 8.3, "out"], [0.87, 9, "in"]], t);
  // the near oar slides faster, meets the rail, rides up it and over
  const near = track([[0.36, 0], [T_OVER, 6, "in"]], t);
  if (t <= T_OVER) {
    // (riding up the rail, it comes out from behind the rim: drawn in front of the boat, shown through the opening and the band it rises into)
    if (near < 4.5) return `${OPEN}${SEA}${boat(r, lift, [far, near])}</svg>`;
    return `${OPEN}${SEA}${boat(r, lift, [far, near], true)}${opening(8 * ((near - 4.5) / 1.5), r, lift)}<g clip-path="url(#lp)">${oar(OARS[1], near, r, lift)}</g></svg>`;
  }
  // over: it drops (whole, its blade end a little first) into the water in front of the boat, dips, comes up and floats there
  const s = t - T_OVER, from = 6 + rolled(105, 127.7 + 6, swell(T_OVER, 0.2).r) + swell(T_OVER, 0.2).lift, to = 38, land = Math.sqrt((2 * (to - from)) / G);
  let dy, tilt = 0, ring = "";
  if (s < land) { dy = from + 0.5 * G * s * s; tilt = 3.5 * Math.sin((Math.PI * s) / land); }
  else {
    const q = s - land;
    dy = to + track([[0, 0], [0.12, 2.6, "out"], [0.34, -0.8, "io"], [0.55, 0.4, "io"], [0.75, 0, "io"]], q);
    // (the water rings out from where it came down, coming up in the moment it lands and fading as it spreads)
    const k = Math.min(1, q / 1.1);
    if (k < 1) { const rx = 64 + 22 * k, ry = 5 + 4 * k, cx = 106, cy = 167.7, e = (a, b) => `M${n2(cx - a)} ${cy}a${n2(a)} ${n2(b)} 0 1 0 ${n2(2 * a)} 0a${n2(a)} ${n2(b)} 0 1 0 ${n2(-2 * a)} 0Z`; ring = `<path d="${e(rx, ry)}${e(rx - 1.6, ry - 0.9)}" fill-rule="evenodd" ${fill("sky-lit")} opacity="${n4(0.85 * Math.min(1, q / 0.08) * (1 - k))}"/>`; }
  }
  let floating = `<g transform="translate(0 ${n2(dy)}) rotate(${n2(tilt)} 105 127.7)">${EL[13]}${EL[14]}</g>`;
  // (its ends come out from behind the rim as it drops, the band growing until it holds all of it, the grip's end too; then the clip goes on holding
  // nothing back, the frame whole, so the oar is drawn the one way to the end)
  floating = `${s < 0.15 ? opening(8 + 82 * (s / 0.15), r, lift) : '<clipPath id="lp"><path d="M0 0H200V200H0Z"/></clipPath>'}<g clip-path="url(#lp)">${floating}</g>`;
  return `${OPEN}${SEA}${ring}${boat(r, lift, [far, 0], true)}${floating}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
