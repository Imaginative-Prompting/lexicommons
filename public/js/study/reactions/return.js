// Return's two stories: the boomerang, spinning, on the last of its way back (its path dotted behind it), slows and comes down; the camera
// follows it left, to a post with a peg on it, a patch of mud at its foot. Happy: its inner bend drops onto the peg and it's caught: still
// turning, it swings round on the peg until its arm meets the post, rocks back once and hangs there. Sad: it comes in one blade short of the
// peg, drops past it, and lands tip first in the mud, the tip stuck, the rest of it falling over onto the bank.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the world carries on past its frame.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><ellipse cx=\"98\" cy=\"175\" rx=\"30\" ry=\"4\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"121.2\" cy=\"67.8\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"126.4\" cy=\"68.5\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"131.6\" cy=\"69.3\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"136.8\" cy=\"70.2\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"142\" cy=\"71.3\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"147.3\" cy=\"72.6\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"152.5\" cy=\"74.1\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"157.7\" cy=\"75.9\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"162.8\" cy=\"77.9\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"167.8\" cy=\"80.4\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"172.8\" cy=\"83.2\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"177.4\" cy=\"86.6\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"181.5\" cy=\"90.5\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"184.8\" cy=\"95\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"187\" cy=\"100\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"187.4\" cy=\"105.4\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"185.6\" cy=\"110.4\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"182.3\" cy=\"114.6\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"178.3\" cy=\"118.3\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"173.9\" cy=\"121.4\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"169.2\" cy=\"124.1\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"164.3\" cy=\"126.5\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"159.3\" cy=\"128.7\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"154.3\" cy=\"130.7\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"149.2\" cy=\"132.6\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"144\" cy=\"134.3\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"138.8\" cy=\"135.9\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"133.5\" cy=\"137.3\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"128.2\" cy=\"138.7\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"122.9\" cy=\"140\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"117.5\" cy=\"141.2\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"112.1\" cy=\"142.3\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"106.7\" cy=\"143.3\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"101.3\" cy=\"144.3\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"95.8\" cy=\"145.2\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"90.3\" cy=\"146\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"84.8\" cy=\"146.8\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"79.3\" cy=\"147.5\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"73.8\" cy=\"148.2\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"68.3\" cy=\"148.9\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"62.8\" cy=\"149.6\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"57.3\" cy=\"150.2\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"51.8\" cy=\"150.8\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"46.3\" cy=\"151.4\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"40.8\" cy=\"152.1\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"35.3\" cy=\"152.8\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"29.8\" cy=\"153.6\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"24.4\" cy=\"154.5\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"19\" cy=\"155.6\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"13.6\" cy=\"157\" r=\"1.4\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M16,70 C22,60 60,48 86,42 C98,39 106,41 112,50 C118,60 127,82 131,95 C133,101 130,105 126,105 C121,105 117,100 110,91 C100,78 92,68 80,65.5 C66,62.5 40,68 24,73 C18,75 15,73 16,70 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M16,70 C22,60 60,48 86,42 C98,39 106,41 112,50 C118,60 127,82 131,95 C132,99 130,100.5 128,99 C124,94 119,85 112,76 C104,65 96,57 82,56 C66,55 40,64 22,71 C18,72.5 15.5,72 16,70 Z\" fill=\"var(--art-wood,#DCA063)\"/></svg>\n";
export const STILL_HASH = "8ed6e65846";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 54) throw new Error("return: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BG = `<rect x="-400" y="-400" width="1100" height="1000" ${fill("teal")}/>`;
const DOTS = EL.slice(2, 52).join(""), BOOM = EL[52] + EL[53];
const dOf = (e) => e.match(/ d="([^"]*)"/)[1];
// the boomerang: its middle (the middle of its area) and its inner bend, where a peg would take it; worked out from the still's outline
const C0 = [87.3, 65.5], CROTCH = [92.1, 71.2];
// its outline's points, for where it touches things
const OUTLINE = (() => {
  const d = dOf(EL[52]), nums = d.match(/-?[\d.]+/g).map(Number), P = [];
  for (let i = 0; i + 1 < nums.length; i += 2) P.push([nums[i], nums[i + 1]]);
  return P;
})();
const rot = (p, a, about) => { const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), dx = p[0] - about[0], dy = p[1] - about[1]; return [about[0] + c * dx - s * dy, about[1] + s * dx + c * dy]; };
/** The boomerang turned a° (about its middle) with its middle at `at`. */
const boomAt = (at, a) => `<g transform="translate(${n2(at[0] - C0[0])} ${n2(at[1] - C0[1])}) rotate(${n2(a)} ${C0[0]} ${C0[1]})">${BOOM}</g>`;
const pointOn = (p, at, a) => { const q = rot(p, a, C0); return [q[0] + at[0] - C0[0], q[1] + at[1] - C0[1]]; };

// ---- the world off to the left: the ground (where shadows lie, 178), a post with a peg, the mud at its foot
// (the peg stands out from the post's face towards us, tilted up a little, so a thing hung on it leans back against the post)
const GROUND = 178, POST = [-90, -80], PEG = [-85, 95];
const POST_SVG = `<ellipse cx="-80" cy="${GROUND + 1}" rx="16" ry="3" ${fill("teal-deep")}/>`
  + `<rect x="${POST[0]}" y="58" width="${POST[1] - POST[0]}" height="${GROUND - 58}" ${fill("wood")}/><rect x="${POST[1] - 3}" y="58" width="3" height="${GROUND - 58}" ${fill("wood-deep")}/>`
  + `<path d="M${POST[0]} 58Q-85 55.5 ${POST[1]} 58Z" ${fill("wood")}/>`
;
// the peg's end, seen end on: its shaft and its end, the end a little up (it tilts up towards us); drawn over what hangs on it
const PEG_END = `<circle cx="${PEG[0]}" cy="${PEG[1]}" r="2.9" ${fill("bark")}/><circle cx="${PEG[0]}" cy="${PEG[1] - 0.8}" r="2.3" ${fill("wood-deep")}/>`;
// where its inner bend sits on the peg: on the peg's top
const SEAT = [PEG[0], PEG[1] - 2.9];
const MUD = [-46, GROUND + 1.5], MUD_R = [31, 5.6];
const mudHalf = (near) => `<path d="M${MUD[0] - MUD_R[0]} ${MUD[1]}A${MUD_R[0]} ${MUD_R[1]} 0 0 ${near ? 0 : 1} ${MUD[0] + MUD_R[0]} ${MUD[1]}Z" ${fill(near ? "bark" : "bark-deep")}/>`
  + (near ? `<ellipse cx="${MUD[0] - 9}" cy="${MUD[1] + 2.2}" rx="6" ry="1.1" ${fill("wood-deep")}/>` : "");

// ---- its flight in: spinning to the left (anticlockwise) and slowing; its middle eases on to where its bend meets the peg (or, sad, a
// blade short of it), dipping a little; the camera follows it
const T_IN = 0.95, G = 2800; // (it's 115 across, about 40 cm: gravity 2800 a second squared)
// hung, its bend under its outer corner: the bend-to-corner line straight up (it's 57.2° up from the right in the still)
const HANG = -32.8;
/** Turn by t over the way in: from 0 (it starts from the still, so its spin comes up from rest in its first moments) to `end` at T_IN,
 *  arriving there turning at `wEnd` a second. */
const spin = (end, wEnd, t) => { const u = Math.min(t, T_IN) / T_IN, m1 = (wEnd * T_IN) / end; return end * (-2 * u ** 3 + 3 * u * u + m1 * (u ** 3 - u * u)); };
const middleFor = (crotchAt, a) => { const q = rot(CROTCH, a, C0); return [crotchAt[0] - (q[0] - C0[0]), crotchAt[1] - (q[1] - C0[1])]; };
function flight(t, end, endAngle) {
  // (eased out of the still: it comes up to its speed in its first moments, then slows all the way in to where it's going)
  const u = Math.min(1, t / T_IN), k = -2 * u ** 3 + 3 * u * u + 0.35 * (u ** 3 - 2 * u * u + u), to = middleFor(end, endAngle);
  return [C0[0] + (to[0] - C0[0]) * k, C0[1] + (to[1] - C0[1]) * k + 7 * Math.sin(Math.PI * u)];
}
// its dotted path goes on behind it: from the still's last dot, along where its middle has been, dots coming up as it leaves them
const TRAIL_FROM = [121.2, 67.8], Q0 = [118, 64];
function trail(path) {
  // path: the points its middle has passed so far (t from 0), as a polyline; the trail is that path set where Q0 is on the boomerang
  const P = [TRAIL_FROM, ...path.map((p) => [p[0] + Q0[0] - C0[0], p[1] + Q0[1] - C0[1]])];
  let out = "", acc = 5.4, run = 0;
  const lengths = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1])), total = lengths.reduce((a, b) => a + b, 0);
  for (let i = 1; i < P.length; i++) {
    const L = lengths[i - 1];
    while (acc <= run + L) {
      const f = (acc - run) / L, p = [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f];
      const r = 1.4 * Math.max(0, Math.min(1, (total - acc - 10) / 12));
      if (r > 0.02) out += `<circle cx="${n2(p[0])}" cy="${n2(p[1])}" r="${n2(r)}" ${fill("paper")}/>`;
      acc += 5.4;
    }
    run += L;
  }
  return out;
}
const pathUpTo = (t, end, endAngle) => { const n = Math.ceil(Math.min(t, T_IN) * 60), P = []; for (let i = 0; i <= n; i++) P.push(flight(Math.min(t, (i / 60)), end, endAngle)); return P; };
const camAt = (t) => { const k = track([[0.05, 0], [1.05, 1, "io"]], t); return [100 - 148 * k, 100 + 8 * k]; };
const view = ([fx, fy], inner) => `${OPEN}<g transform="translate(${n2(100 - fx)} ${n2(100 - fy)})">${inner}</g></svg>`;
// its shadow on the ground, under its middle (the still's sits 10.7 right of it)
const shadow = (x, rx = 30, ry = 4, y = 175) => `<ellipse cx="${n2(x + 10.7)}" cy="${n2(y)}" rx="${n2(rx)}" ry="${n2(ry)}" ${fill("teal-deep")}/>`;

// ---- happy. Caught: still turning anticlockwise (300° a second) it swings on round the peg, its back dragging on the post's face, rocks
// back and settles hanging, its outer corner up, leaning back on the post (its weight sits a little to the left: it settles 4° that way).
const END_SPIN = HANG - 360, REST = 4;
const HAPPY_DUR = Math.round((T_IN + 0.5 + 0.7) * 100) / 100;
function happy(t) {
  if (t <= 0) return STILL;
  let a, at;
  if (t < T_IN) { a = spin(END_SPIN, -300, t); at = flight(t, SEAT, END_SPIN); } else {
    const d = track([[T_IN, 0], [T_IN + 0.11, 19, "out"], [T_IN + 0.27, -5, "io"], [T_IN + 0.4, REST + 2.5, "io"], [T_IN + 0.5, REST, "io"]], t);
    a = END_SPIN - d; at = middleFor(SEAT, a);
  }
  const dots = trail(pathUpTo(t, SEAT, END_SPIN));
  return view(camAt(t), `${BG}${mudHalf(false)}${mudHalf(true)}${shadow(at[0])}${DOTS}${dots}${POST_SVG}${boomAt(at, a)}${PEG_END}`);
}

// ---- sad. A blade short: its bend comes in a blade's length to the right of the peg's seat and nothing takes it; it drops (still turning), drifting on
// left; its lowest tip goes into the mud, sinks 4 and sticks, and it falls over about the stuck tip onto the bank.
// (its bend stops a blade's length, 60, right of the peg's seat; its turn is timed so its left arm's tip leads it down into the mud)
const MISS = [SEAT[0] + 60, SEAT[1] + 4], END_SAD = -376;
const V_LEFT = -30;
// the drop, worked out once: free fall from where it stops flying, turning on at 300° a second (slowing), until its lowest point reaches the mud
const DROP = (() => {
  const from = flight(T_IN, MISS, END_SAD);
  for (let s = 0; s < 1; s += 1 / 1200) {
    const a = END_SAD - 300 * s + 120 * s * s, at = [from[0] + V_LEFT * s, from[1] + 0.5 * G * s * s];
    const low = OUTLINE.reduce((m, p) => { const q = pointOn(p, at, a); return q[1] > m[1] ? q : m; }, [0, -1e9]);
    if (low[1] >= MUD[1]) return { s, a, at, tip: low, from };
  }
  return null;
})();
const T_HIT = T_IN + DROP.s;
// stuck at the tip, it falls over (about the tip) until another part of its outline is down on the ground
const OVER = (() => {
  const pivot = [DROP.tip[0], DROP.tip[1] + 4];
  for (let d = 0; d < 120; d += 0.25) for (const sgn of [1]) {
    const a = DROP.a + sgn * d, at = (() => { const p = rot(DROP.at, sgn * d, DROP.tip); return [p[0], p[1] + 4]; })();
    const hits = OUTLINE.filter((p) => { const q = pointOn(p, at, a); return q[1] >= GROUND + 1.5 && Math.abs(q[0] - pivot[0]) > 12; });
    if (hits.length) return { d: sgn * d, pivot };
  }
  return { d: 60, pivot };
})();
const T_OVER = T_HIT + 0.06 + Math.sqrt(Math.abs(OVER.d) / 400);
const SAD_DUR = Math.round((T_OVER + 0.25 + 0.7) * 100) / 100;
// mud thrown up where the tip goes in: four drops, up and out and back down into it
const SPLASH = [[-26, -70], [-9, -95], [12, -88], [27, -60]];
const splash = (t) => {
  const s = t - T_HIT;
  if (s <= 0 || s > 0.45) return "";
  return SPLASH.map(([vx, vy], i) => {
    const x = DROP.tip[0] + vx * s, y = DROP.tip[1] + vy * s + 0.5 * G * 0.3 * s * s, r = Math.min(1.6 - i * 0.15, s * 40) * (y > MUD[1] ? 0 : 1);
    return r > 0.05 ? `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" ${fill("bark")}/>` : "";
  }).join("");
};
function sad(t) {
  if (t <= 0) return STILL;
  let a, at;
  if (t < T_IN) { a = spin(END_SAD, -300, t); at = flight(t, MISS, END_SAD); } else if (t < T_HIT) {
    const s = t - T_IN; a = END_SAD - 300 * s + 120 * s * s; at = [DROP.from[0] + V_LEFT * s, DROP.from[1] + 0.5 * G * s * s];
  } else {
    // in: the tip sinks 4 over 0.06, then it goes over about it, faster as it goes, a small bounce at the end
    const sink = track([[T_HIT, 0], [T_HIT + 0.06, 4, "out"]], t);
    const over = OVER.d * track([[T_HIT + 0.06, 0], [T_OVER, 1, "in"]], t) - Math.sign(OVER.d) * track([[T_OVER, 0], [T_OVER + 0.08, 3, "out"], [T_OVER + 0.18, 0, "in"]], t);
    a = DROP.a + over; const p = rot(DROP.at, over, DROP.tip); at = [p[0], p[1] + sink];
  }
  const dots = trail(pathUpTo(Math.min(t, T_IN), MISS, END_SAD));
  // its shadow draws in under it as it comes down to the ground
  const down = Math.max(0, Math.min(1, (at[1] - 80) / 80));
  return view(camAt(t), `${BG}${mudHalf(false)}${shadow(at[0], 30 - 8 * down, 4 - 1 * down, 175 + 4 * down)}${DOTS}${dots}${POST_SVG}${PEG_END}${boomAt(at, a)}${mudHalf(true)}${splash(t)}`);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
