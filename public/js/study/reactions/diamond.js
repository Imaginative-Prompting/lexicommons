// Diamond's story: the stone stands on its point, its weight a little to the right of it: it tips over to the right about its point, faster and
// faster, until the far corner of its girdle meets the floor.
// Happy: it lands with a knock, rocks once, and rests there, tilted on its point and its corner, whole.
// Sad: the corner that strikes chips: a wedge of the stone breaks away along a clean face and skids off across the floor, and the stone, its corner
// gone, settles a little further over, a bite out of its outline.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the shadow, and the stone's thirty-four facets (its
// girdle's thin bands, the pavilion's facets down to the point at 80.5, 162, the crown's facets and its table on top). The stone (10 cm) is 122
// across: 1220 to the meter, gravity 12000. About its point its weight is 48 out, 13.7 degrees right of straight up; it turns as a body of that
// reach with 30 of its own (I = m (48.4^2 + 30^2)).
import { n2, n4, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"132\" width=\"200\" height=\"68\" fill=\"var(--art-violet-lit,#A68CFF)\"/><polygon points=\"79,146.1 86.8,139.4 101.2,134.7 104.2,134.1 123,132 143.3,133 162.2,136.8 169.3,139.4 176.6,142.8 181.7,147 184.4,150.3 184.4,157.9 176.6,164.6 162.2,169.3 159.2,169.8 140.4,171.9 120,170.9 101.2,167.2 80.5,162 79,153.7\" fill=\"var(--art-violet-deep,#5E40C4)\"/><polygon points=\"80.3 87.4 79.6 90.4 103.7 95.3 104.4 92.3\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"104.4 92.3 103.7 95.3 126 102.7 126.7 99.7\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"58 85.9 57.3 88.8 79.6 90.4 80.3 87.4\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"79.6 90.4 80.5 162 103.7 95.3\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"126.7 99.7 126 102.7 143.1 111.5 143.8 108.6\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><polygon points=\"103.7 95.3 80.5 162 126 102.7\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"57.3 88.8 80.5 162 79.6 90.4\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"40.9 87.8 40.2 90.7 57.3 88.8 58 85.9\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"126 102.7 80.5 162 143.1 111.5\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><polygon points=\"40.2 90.7 80.5 162 57.3 88.8\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"143.8 108.6 143.1 111.5 152.3 120.4 153 117.5\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><polygon points=\"143.1 111.5 80.5 162 152.3 120.4\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"31.7 93 31 95.9 40.2 90.7 40.9 87.8\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"31 95.9 80.5 162 40.2 90.7\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"68 77.1 40.9 87.8 31.7 93\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><polygon points=\"152.3 120.4 80.5 162 152.3 128.1\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"153 117.5 152.3 120.4 152.3 128.1 153 125.1\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"31 103.5 80.5 162 31 95.9\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"130.8 93.8 153 125.1 153 117.5\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><polygon points=\"62.8 84.3 68 77.1 31.7 93\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><polygon points=\"152.3 128.1 80.5 162 143.1 133.2\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"116 83.8 90 76.9 68 77.1 62.8 84.3 77.6 94.3 103.6 101.1 125.6 101 130.8 93.8\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><polygon points=\"62.8 84.3 31.7 93 31.7 100.6\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"130.8 93.8 125.6 101 153 125.1\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"125.6 101 143.8 130.3 153 125.1\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><polygon points=\"62.8 84.3 31.7 100.6 40.9 109.5\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"77.6 94.3 62.8 84.3 40.9 109.5\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"125.6 101 126.7 132.2 143.8 130.3\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"125.6 101 103.6 101.1 126.7 132.2\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><polygon points=\"77.6 94.3 40.9 109.5 58 118.4\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><polygon points=\"103.6 101.1 77.6 94.3 80.3 125.8\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><polygon points=\"103.6 101.1 104.4 130.7 126.7 132.2\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><polygon points=\"77.6 94.3 58 118.4 80.3 125.8\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><polygon points=\"103.6 101.1 80.3 125.8 104.4 130.7\" fill=\"var(--art-paper,#FBF7EC)\"/></svg>\n";
export const STILL_HASH = "94849bcff6";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 37 || !EL[2].includes("79,146.1 86.8,139.4") || !EL[6].includes("79.6 90.4 80.5 162 103.7 95.3")) throw new Error("diamond: the still isn't as this story knows it");
const ROOM = EL[0] + EL[1], SHADOW = EL[2], STONE = EL.slice(3).join("");
const POINT = [80.5, 162], G = 12000, REACH = 48.4, A0 = 13.7, I = REACH ** 2 + 30 ** 2;
// the corner meets the floor (the point's own level) at 25.1 degrees over
const LAND = 25.1;
const TIP = (() => { const S = []; let a = 0, w = 0; const dt = 1 / 4000; while (a < (LAND * Math.PI) / 180) { S.push(a); w += ((G * REACH * Math.sin((A0 * Math.PI) / 180 + a)) / I) * dt; a += w * dt; } S.push((LAND * Math.PI) / 180); return S; })();
const T0 = 0.3, T_LAND = T0 + (TIP.length - 1) / 4000;
const tip = (t) => (t <= T0 ? 0 : t >= T_LAND ? LAND : (TIP[Math.round((t - T0) * 4000)] * 180) / Math.PI);
// (the shadow: the stone's top swings toward it, so it draws in a little toward the point)
const shadow = (a) => (a ? `<g transform="translate(${POINT[0]} 0) scale(${n4(1 - 0.18 * (a / LAND))} 1) translate(${-POINT[0]} 0)">${SHADOW}</g>` : SHADOW);
const stone = (a, body) => (a ? `<g transform="rotate(${n2(a)} ${POINT[0]} ${POINT[1]})">${body}</g>` : body);

// ---- happy: down, whole
const HAPPY_DUR = T_LAND + 0.55;
function happy(t) {
  if (t <= T0) return STILL;
  // (the knock: it rocks back off its corner a little, and down again)
  const a = t < T_LAND ? tip(t) : LAND - track([[T_LAND, 0], [T_LAND + 0.06, 2.2, "out"], [T_LAND + 0.12, 0, "in"], [T_LAND + 0.16, 0.5, "out"], [T_LAND + 0.2, 0, "in"]], t);
  return `${OPEN}${ROOM}${shadow(a)}${stone(a, STONE)}</svg>`;
}

// ---- sad: chipped
// the chip: the stone's far end beyond a clean break from (141, 105) on its top edge to (138, 134) underneath
const CUT = [[141, 105], [138, 134]];
const CHIP_CLIP = `M${CUT[0][0]} ${CUT[0][1] - 30}L170 ${CUT[0][1] - 30}L170 ${CUT[1][1] + 30}L${CUT[1][0]} ${CUT[1][1] + 30}L${CUT[1][0]} ${CUT[1][1]}L${CUT[0][0]} ${CUT[0][1]}Z`;
const REST_CLIP = `M0 0H${CUT[0][0]}V${CUT[0][1]}L${CUT[1][0]} ${CUT[1][1]}V200H0Z`;
// once the corner is gone the stone goes on over onto the break's lower end: 5 degrees more
const MORE = 5;
// the chip, knocked off as the corner lands: it hops out to the right and skids, turning, on the floor
function chip(t) {
  const s = t - T_LAND, hop = Math.max(0, 140 * s - 0.5 * G * 0.08 * s * s);
  const slide = 16 * track([[T_LAND, 0], [T_LAND + 0.35, 1, "out"]], t), turn = 38 * track([[T_LAND, 0], [T_LAND + 0.35, 1, "out"]], t), sink = 3.2 * track([[T_LAND, 0], [T_LAND + 0.12, 1, "in"]], t);
  return { dx: slide, dy: sink - Math.min(hop, 2.5 * Math.sin(Math.min(1, s / 0.12) * Math.PI)), turn };
}
const SAD_DUR = T_LAND + 0.8;
function sad(t) {
  if (t <= T0) return STILL;
  // (drawn as the two pieces it will break into from the start of the fall, the chip held in place, so the parts stay the same parts at the knock)
  // the stone: over to its corner, then a little more as the broken end lets it, then still
  const down = t >= T_LAND;
  const a = !down ? tip(t) : LAND + MORE * track([[T_LAND, 0], [T_LAND + 0.09, 1, "in"]], t) - track([[T_LAND + 0.09, 0], [T_LAND + 0.13, 0.6, "out"], [T_LAND + 0.17, 0, "in"]], t);
  // the chip's place on the stone as it was at the knock, then its own way
  const c = down ? chip(t) : { dx: 0, dy: 0, turn: 0 }, corner = [CUT[0][0] + 10, CUT[0][1] + 18];
  // (the break's clean face, seen edge on at first, opening to view as the chip comes away)
  const face = track([[T_LAND, 0], [T_LAND + 0.05, 1, "out"]], t);
  const rest = `<clipPath id="dr"><path d="${REST_CLIP}"/></clipPath><g clip-path="url(#dr)">${STONE}</g>${face > 0.02 ? `<path d="M${CUT[0][0]} ${CUT[0][1]}L${CUT[1][0]} ${CUT[1][1]}L${n2(CUT[1][0] - 1.6 * face)} ${n2(CUT[1][1] - 1.4 * face)}L${n2(CUT[0][0] - 1.4 * face)} ${n2(CUT[0][1] + 2.2 * face)}Z" fill="var(--art-sky-pale,#C9E7F9)"/>` : ""}`;
  const piece = `<g transform="translate(${n2(c.dx)} ${n2(c.dy)}) rotate(${n2(down ? LAND : a)} ${POINT[0]} ${POINT[1]}) rotate(${n2(c.turn)} ${corner[0]} ${corner[1]})"><clipPath id="dc"><path d="${CHIP_CLIP}"/></clipPath><g clip-path="url(#dc)">${STONE}</g></g>`;
  return `${OPEN}${ROOM}${shadow(Math.min(a, LAND))}<g transform="rotate(${n2(a)} ${POINT[0]} ${POINT[1]})">${rest}</g>${piece}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
