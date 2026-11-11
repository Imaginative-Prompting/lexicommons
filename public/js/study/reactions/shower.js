// Shower's story: a surge comes up the pipe, the water's pressure rising.
// Happy: the four thin streams thicken and reach all the way down into the tray, two more stream out between them, the loose drops fall away into
// the tray, and water films over the tray's floor round the drain: a full shower.
// Sad: the surge finds the worn seam between the pipe's collar and the head: the streams swell for a moment, then a jet bursts out sideways from the
// seam, arcs over past the tray and pools on the floor beside it, and the spray under the head goes thin and short.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the tray's shadow, the pipe (lit and shaded), the tray (its rim,
// its basin's sides and floor, the drain at 86, 168.4, its front and its front's shade), four streams from the head's underside at y 62 (each a
// band and its lit edge, ending in a round tip: 94, 108, 102, 90 down), nine falling drops (each a drop and its lit side), the collar (79-95 across,
// 30-37 down) and the head (its dome and shade, its underside an ellipse at 87, 60). The head (20 cm) is 76 across: 380 to the meter, gravity 3700.
import { blob, n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"30,186 146,178 200,198 200,200 52,200\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M28,176V36C28,23.8 37.8,14 50,14H78C86.3,14 93,20.7 93,29V42H81V30C81,27.8 79.2,26 77,26H52C45.4,26 40,31.4 40,38V176Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M35,176V40C35,36.5 36,33.5 37.6,31.2L40.6,34.2C40.2,35.4 40,36.7 40,38V176Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M84.9,15.7C89.8,17.9 93,23.1 93,29V41H89V29.5C89,24 87.6,19.3 84.9,15.7Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M42,160H130Q133,160 135,162L145,171Q147,173 144,173H28Q25,173 27,171L37,162Q39,160 42,160Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M46,163H126Q127.5,163 128.5,164L136,170.5H36L43.5,164Q44.5,163 46,163Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M47.5,166H124.5L131.5,170.5H40.5Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><ellipse cx=\"86\" cy=\"168.4\" rx=\"5\" ry=\"1.2\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M26,172H146V184Q146,189 141,189H31Q26,189 26,184Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M138,172H146V184Q146,189 141,189H138Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M68.3,62L65.2,94A1.7,1.7 0 0 0 68.6,94L71.7,62Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M68.3,62L65.2,94A1.15,1.15 0 0 0 67.5,94L70.6,62Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M78.3,62L76.5,108A1.7,1.7 0 0 0 79.9,108L81.7,62Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M78.3,62L76.5,108A1.15,1.15 0 0 0 78.8,108L80.6,62Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M91.3,62L92.7,102A1.7,1.7 0 0 0 96.1,102L94.7,62Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M91.3,62L92.7,102A1.15,1.15 0 0 0 95,102L93.6,62Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M102.3,62L105,90A1.7,1.7 0 0 0 108.4,90L105.7,62Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M102.3,62L105,90A1.15,1.15 0 0 0 107.3,90L104.6,62Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M64.5,101.3C65.3,103.4 67.1,104.9 67.1,107A2.6,2.6 0 0 1 61.9,107C61.9,104.9 63.7,103.4 64.5,101.3Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M64.5,101.3C63.7,103.4 61.9,104.9 61.9,107A2.6,2.6 0 0 0 65.3,109.5C65.7,107 65.4,103.9 64.5,101.3Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M61.5,123.2C62.2,124.9 63.7,126.2 63.7,128A2.2,2.2 0 0 1 59.3,128C59.3,126.2 60.8,124.9 61.5,123.2Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M61.5,123.2C60.8,124.9 59.3,126.2 59.3,128A2.2,2.2 0 0 0 62.2,130.1C62.5,128 62.3,125.4 61.5,123.2Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M76.3,117.7C77,119.6 78.7,121.1 78.7,123A2.4,2.4 0 0 1 73.9,123C73.9,121.1 75.6,119.6 76.3,117.7Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M76.3,117.7C75.6,119.6 73.9,121.1 73.9,123A2.4,2.4 0 0 0 77,125.3C77.4,123 77.1,120.1 76.3,117.7Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M74.8,135.6C75.7,137.9 77.7,139.7 77.7,142A2.9,2.9 0 0 1 71.9,142C71.9,139.7 73.9,137.9 74.8,135.6Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M74.8,135.6C73.9,137.9 71.9,139.7 71.9,142A2.9,2.9 0 0 0 75.7,144.8C76.1,142 75.8,138.5 74.8,135.6Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M86.6,91.8C87.2,93.3 88.5,94.5 88.5,96A1.9,1.9 0 0 1 84.7,96C84.7,94.5 86,93.3 86.6,91.8Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M86.6,91.8C86,93.3 84.7,94.5 84.7,96A1.9,1.9 0 0 0 87.2,97.8C87.5,96 87.3,93.7 86.6,91.8Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M95.8,110.1C96.6,112.2 98.5,113.8 98.5,116A2.7,2.7 0 0 1 93.1,116C93.1,113.8 95,112.2 95.8,110.1Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M95.8,110.1C95,112.2 93.1,113.8 93.1,116A2.7,2.7 0 0 0 96.6,118.6C97,116 96.7,112.8 95.8,110.1Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M97.4,131.4C98,133.1 99.5,134.3 99.5,136A2.1,2.1 0 0 1 95.3,136C95.3,134.3 96.8,133.1 97.4,131.4Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M97.4,131.4C96.8,133.1 95.3,134.3 95.3,136A2.1,2.1 0 0 0 98,138C98.3,136 98.1,133.5 97.4,131.4Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M109.2,96.9C109.9,98.8 111.5,100.2 111.5,102A2.3,2.3 0 0 1 106.9,102C106.9,100.2 108.5,98.8 109.2,96.9Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M109.2,96.9C108.5,98.8 106.9,100.2 106.9,102A2.3,2.3 0 0 0 109.9,104.2C110.2,102 110,99.2 109.2,96.9Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M112,119.8C112.8,122.1 114.8,123.8 114.8,126A2.8,2.8 0 0 1 109.2,126C109.2,123.8 111.2,122.1 112,119.8Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M112,119.8C111.2,122.1 109.2,123.8 109.2,126A2.8,2.8 0 0 0 112.8,128.7C113.3,126 113,122.6 112,119.8Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"79\" y=\"30\" width=\"16\" height=\"7\" rx=\"1.5\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M91,30H93.5Q95,30 95,31.5V35.5Q95,37 93.5,37H91Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M49,60C51,45 67,36 87,36C107,36 123,45 125,60Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M101,37.5C114,41 123,49 125,60H112C111,50 107,42 101,37.5Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><ellipse cx=\"87\" cy=\"60\" rx=\"38\" ry=\"5.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/></svg>\n";
export const STILL_HASH = "7cc38c05b9";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 42 || !EL[11].includes("M68.3,62L65.2,94") || !EL[37].includes('x="79" y="30" width="16" height="7"')) throw new Error("shower: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const WALL = EL.slice(0, 11).join(""), HEAD = EL.slice(37).join("");
const DROPS = Array.from({ length: 9 }, (_, i) => EL[19 + 2 * i] + EL[20 + 2 * i]);
const DROP_Y = DROPS.map((d) => Number(d.match(/^<path d="M[\d.]+,([\d.]+)/)[1]));
// the streams: [top's middle at y 62, the tip's middle, the tip's depth], half-width 1.7 (the lit edge 1.15 from its left side)
const STREAMS = [[70, 66.9, 94], [80, 78.2, 108], [93, 94.4, 102], [104, 106.7, 90]];
const NEW = [[75, 73.2, 94], [98.5, 100.6, 98]]; // two more, between them, when the pressure's up
const TOP = 62, BASIN = 167;
function stream([c, tc, ty], reach, w, show) {
  // a stream from the head to its tip, along its own line, reach its tip's depth, w its half-width
  if (show <= 0) return "";
  const k = (tc - c) / (ty - TOP), tip = [c + k * (reach - TOP), reach], hw = w * show;
  const lit = hw * (2.3 / 3.4) * 2;
  return `<path d="M${n2(c - hw)} ${TOP}L${n2(tip[0] - hw)} ${n2(tip[1])}A${n2(hw)} ${n2(hw)} 0 0 0 ${n2(tip[0] + hw)} ${n2(tip[1])}L${n2(c + hw)} ${TOP}Z" ${fill("sky")}/><path d="M${n2(c - hw)} ${TOP}L${n2(tip[0] - hw)} ${n2(tip[1])}A${n2(lit / 2)} ${n2(lit / 2)} 0 0 0 ${n2(tip[0] - hw + lit)} ${n2(tip[1])}L${n2(c - hw + lit)} ${TOP}Z" ${fill("sky-lit")}/>`;
}
// the drops already falling: they fall on, faster, and go into the tray (behind its rim: nothing of them shows below the basin)
function drops(t) {
  const s = Math.max(0, t - 0.3);
  return DROPS.map((d, i) => { const dy = 0.5 * 3700 * s * s * (0.6 + 0.1 * (i % 4)); return DROP_Y[i] + dy > BASIN + 2 ? "" : dy > 0.01 ? `<g transform="translate(0 ${n2(dy)})">${d}</g>` : d; }).join("");
}
const clipTray = (body) => `<clipPath id="sb"><path d="M0 0H200V${BASIN}H0Z"/></clipPath><g clip-path="url(#sb)">${body}</g>`;

// ---- happy: full
const HAPPY_DUR = 2.0;
function happy(t) {
  if (t <= 0.3) return STILL;
  const w = 1.7 + 0.9 * track([[0.3, 0], [0.9, 1, "io"]], t);
  const s = STREAMS.map((d) => stream(d, d[2] + (BASIN + 1 - d[2]) * track([[0.4, 0], [1.2, 1, "io"]], t), w, 1)).join("");
  const n = NEW.map((d, i) => { const g = track([[0.55 + 0.1 * i, 0], [1.35 + 0.1 * i, 1, "io"]], t); return g > 0.01 ? stream(d, TOP + 3 + (BASIN + 1 - TOP - 3) * g, w * 0.9, Math.min(1, g * 4)) : ""; }).join("");
  // the tray's floor filming over, from the drain outward
  const film = track([[0.9, 0], [1.7, 1, "out"]], t);
  const water = film > 0.02 ? `<clipPath id="sf"><path d="M47.5,166H124.5L131.5,170.5H40.5Z"/></clipPath><g clip-path="url(#sf)"><ellipse cx="86" cy="168.4" rx="${n2(50 * film)}" ry="${n2(4.6 * Math.sqrt(film))}" ${fill("sky")}/></g>${EL[8]}` : "";
  return `${OPEN}${WALL}${water}${clipTray(s + n + drops(t))}${HEAD}</svg>`;
}

// ---- sad: the seam
// the jet: from the seam's right end (95.5, 35), out and over in a parabola (3700 down), to the floor beside the tray (172, 194)
const SEAM = [95.5, 35], LAND = [172, 194], FLIGHT = 0.32, VX = (LAND[0] - SEAM[0]) / FLIGHT, VY = (LAND[1] - SEAM[1] - 0.5 * 3700 * FLIGHT ** 2) / FLIGHT;
const jetAt = (u) => [SEAM[0] + VX * u * FLIGHT, SEAM[1] + VY * u * FLIGHT + 0.5 * 3700 * (u * FLIGHT) ** 2];
function jet(front) {
  if (front <= 0.005) return "";
  const n = Math.max(3, Math.ceil(front * 14)), L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const u = (front * i) / n, p = jetAt(u), q = jetAt(Math.min(1, u + 0.01)), d = [q[0] - p[0], q[1] - p[1]], m = Math.hypot(d[0], d[1]) || 1, w = (1.6 - 0.6 * u) * Math.min(1, (front - u) / 0.04 + 0.3);
    L.push([p[0] - (d[1] / m) * w, p[1] + (d[0] / m) * w]); R.push([p[0] + (d[1] / m) * w, p[1] - (d[0] / m) * w]);
  }
  return `<path d="${blob([...L, jetAt(Math.min(1, front + 0.01)), ...R.reverse()])}" ${fill("sky")}/>`;
}
const SAD_DUR = 2.1, T_BURST = 0.55;
function sad(t) {
  if (t <= 0.3) return STILL;
  // the streams swell with the surge, then, the pressure going out of the seam, thin and shorten
  const swell = track([[0.3, 0], [T_BURST, 1, "out"], [T_BURST + 0.5, 0, "io"]], t), weak = track([[T_BURST, 0], [T_BURST + 0.7, 1, "io"]], t);
  const w = 1.7 * (1 + 0.35 * swell - 0.4 * weak);
  const s = STREAMS.map((d) => stream(d, d[2] + 10 * swell - (d[2] - TOP - 12) * 0.6 * weak, w, 1)).join("");
  const front = track([[T_BURST, 0], [T_BURST + FLIGHT, 1]], t);
  const pool = track([[T_BURST + FLIGHT - 0.02, 0], [T_BURST + FLIGHT + 0.7, 1, "out"]], t);
  const puddle = pool > 0.02 ? `<ellipse cx="${n2(LAND[0] + 2 * pool)}" cy="${n2(LAND[1] + 0.5)}" rx="${n2(20 * pool)}" ry="${n2(3.6 * Math.sqrt(pool))}" ${fill("sky")}/>` : "";
  // (a spurt at the seam as it gives)
  const spurt = t > T_BURST ? `<ellipse cx="96.2" cy="34.6" rx="${n4(1.4 * Math.min(1, (t - T_BURST) / 0.05))}" ry="${n4(1.1 * Math.min(1, (t - T_BURST) / 0.05))}" ${fill("sky-lit")}/>` : "";
  return `${OPEN}${WALL}${puddle}${clipTray(s + drops(t))}${HEAD}${jet(front)}${spurt}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
