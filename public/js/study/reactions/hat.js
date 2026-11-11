// Hat's two stories, the gust's (a sun hat's wide brim is what the wind takes): the brim lifts on its windward side, the hat rises, sails
// off to the right, turning, the camera going with it, its shadow running on the ground below. Happy: it comes down over the top of a fence
// post and sits there, as if the post were wearing it, rocking and still; the fence runs on either side, its rails and the next
// posts. Sad: it tumbles over and comes down upside down in a puddle, and its brim darkens where the water takes it.
// Every frame is a pure function of t, in seconds. The still's own world: the sky above y 131.4, the ground below, the hat (its middle about
// (99, 110), its band at y 108), its long shadow on the ground to the right (its edges run 0.41 down for each one across).
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<rect x=\"0\" y=\"131.4\" width=\"200\" height=\"68.6\" fill=\"var(--art-violet-lit,#A68CFF)\"/>\n<path d=\"M17 134.4C34 131 111 125.3 173.7 131L200 141.9V200H168.1L42.2 148.5C31.9 144.3 23 139.8 17 134.4Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M11 121.8C11 110.9 29.8 100 53 95.7C77.5 89.4 117.4 89.8 142.5 95.1C163.3 99.4 186.7 109.1 186.7 121.8C186.7 136.6 155 149.9 119.7 152.6C84.8 155.2 41.1 151.6 20.7 139.3C14.7 135.6 11 129.4 11 121.8Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M139.1 99.6C159.6 104.3 180.8 113 186.7 121.8C186.8 136.8 155.6 149.6 119.7 152.6C109.1 153.5 98.4 153.6 88.6 153.2C114.5 151.1 141.4 146.5 155.9 137.7C163.7 133 167.6 127.6 164.2 123C160.4 117.8 147.1 114.4 134.5 112.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M51.4 99.5C54.2 88.7 57.2 76.8 64.5 68.5C72.3 59.5 83.5 54 96.1 54C115.6 53.5 130.6 63.5 137.5 81.3C140 87.7 141.9 94.9 143.6 103.2C126.6 116 75.6 119.2 51.4 105.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M107.8 55.2C121.6 57.7 132.4 66.1 137.8 82.1C140.5 89.7 141.8 96.1 143.6 103.2C138.8 107.1 131.3 109.7 122.5 111.1C126.7 101.1 127.2 90.5 125.8 80.6C124.4 69.7 118.1 60.1 107.8 55.2Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M51.4 99C62.2 103.1 76.2 104.7 90.6 104.3C111.5 104 134.5 100.2 142.2 92.8L145.1 104.8C145.9 108.5 142.3 111.4 136.4 113.7C115.7 121.6 77.8 122.2 54.8 113.8Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M57.2 108.6C52.5 115 41.8 120.6 29.8 127.1L38 127C39.1 127 39.5 127.7 39.7 129.2L40.5 136C46.8 129.2 53.9 120.8 59.9 111.6Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M59 109.5C57.8 117 57.4 130.8 60.3 138.5L64.8 134C65.5 133.2 66.4 132.9 67.4 133.3L75.6 136.4C73.2 127.2 69.8 116.7 64.2 110.7Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M57.8 109.4C52.9 111.3 43.1 116.5 38.3 113.2C34.5 110.5 35.4 104.3 36.2 101.1L48.7 102.4Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M60.7 109.7C65.4 116.6 74 121.9 80.5 120.4C85.5 119.3 87.1 111.5 87.3 103.1L76.7 102.7Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M58.8 101.2C54.9 96.7 49.8 92.3 45.7 90.9C41.5 89.4 39 91.4 37.5 95.4C36 99.5 34.8 106.1 35.7 108.5C36 109.5 36.6 109.5 38 109.3C44.3 108.3 51.1 108.8 56.6 110.8Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M63.3 102.7C68.6 99 75.9 95.4 80.9 95.5C85 95.3 87.4 97.1 87.2 101.4C87 106.1 85.5 113.6 82.9 115.9C81.8 117 80.3 116.2 78.2 115.2C73.5 113 68.9 111.8 63.4 111.2Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M56.8 100.1C58.8 99.8 63.6 100.5 65 101.8C66.7 103.5 65.3 108.6 63.9 111.4C63 113.1 60.5 114.1 58.6 113.5C56.2 112.9 55.2 110.4 54.9 107.7C54.6 104.6 55.2 101.3 56.8 100.1Z\" fill=\"var(--art-clay,#E8743B)\"/>\n</svg>\n";
export const STILL_HASH = "6c18f6f509";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 15 || !EL[2].includes("M17 134.4C34 131")) throw new Error("hat: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const rect = (x, y, w, h, tone) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" ${fill(tone)}/>`;
const HAT = EL.slice(3).join("");
const MID = [99, 110];
const WORLD = rect(-400, -400, 1400, 531.4, "violet") + rect(-400, 131.4, 1400, 700, "violet-lit");
// the hat's shadow, its far edges carried on down the ground (it lies along the light)
const SHADOW = `<path d="M17 134.4C34 131 111 125.3 173.7 131L1174 545.5L1168 609L42.2 148.5C31.9 144.3 23 139.8 17 134.4Z" ${fill("violet-deep")}/>`;
// the hat where it is: its middle at (x, y), turned a; its shadow on the ground moved with it, carried further along the light the higher
// it is (h), narrower as it rises
const hatAt = (x, y, a) => `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)}) translate(${-MID[0]} ${-MID[1]})">${HAT}</g>`;
const shadowAt = (x, h) => (h > 60 ? "" : `<g transform="translate(${n2(x - MID[0] + 1.6 * h)} ${n2(0.66 * h)})" opacity="${n4(Math.max(0, 1 - h / 60))}">${SHADOW}</g>`);
const cam = (cx, cy, z) => `translate(100 100) scale(${n4(z)}) translate(${n2(-cx)} ${n2(-cy)})`;

// the gust both start with: the brim lifting on the left, then the hat up and away to the right
function flight(t) {
  const tilt = track([[0.25, 0], [0.62, 16, "in"]], t), lift = track([[0.5, 0], [0.75, 6, "in"]], t);
  return { x: MID[0] + track([[0.5, 0], [0.75, 4, "in"]], t), y: MID[1] - lift, a: tilt };
}

// ---- happy: onto the fence post
const HAPPY_DUR = 2.9, POST = { x: 330, top: 84 }, T_UP = 0.75;
// the fence the post is one of: posts along it, two rails between them; each casting its long shadow down the light (2.6 across, 1.07
// down, for each unit of height above the ground at y 168)
const POSTS = [216, 330, 444, 558], RAILS = [[100, 107], [132, 139]], GROUND = 168, RAIL_FROM = 205, RAIL_TO = 700;
const post = (x) => rect(x - 11, POST.top, 22, GROUND - POST.top, "wood") + rect(x + 5, POST.top, 6, GROUND - POST.top, "wood-deep") + rect(x - 11, POST.top - 3, 22, 4, "wood-deep");
const shade = (x, h) => [x + 2.6 * h, GROUND + 1.07 * h];
const fenceShadow = () => POSTS.map((x) => `<path d="M${x - 11} ${GROUND}H${x + 11}L${shade(x + 11, GROUND - POST.top).join(" ")}L${shade(x - 11, GROUND - POST.top).join(" ")}Z" ${fill("violet-deep")}/>`).join("")
  + RAILS.map(([a, b]) => { const P = [shade(RAIL_FROM, GROUND - a), shade(RAIL_TO, GROUND - a), shade(RAIL_TO, GROUND - b), shade(RAIL_FROM, GROUND - b)]; return `<path d="M${P.map((p) => p.map(n2).join(" ")).join("L")}Z" ${fill("violet-deep")}/>`; }).join("");
const fence = () => RAILS.map(([a, b]) => rect(RAIL_FROM, a, RAIL_TO - RAIL_FROM, b - a, "wood") + rect(RAIL_FROM, b - 2, RAIL_TO - RAIL_FROM, 2, "wood-deep")).join("") + POSTS.map(post).join("");
function happy(t) {
  if (t <= 0) return STILL;
  let p = flight(t);
  if (t > T_UP) {
    // sailing: up and over to the right, turning one way and back, then settling down over the post, its band at the post's top, a rock
    const k = track([[T_UP, 0], [2.0, 1, "io"]], t), arc = Math.sin(Math.PI * Math.min(1, k * 1.15)) * 70;
    const sitY = POST.top - 108 + MID[1] + 6;
    p = { x: p.x + (POST.x - p.x) * k, y: p.y + (sitY - p.y) * k - arc * (1 - k * 0.3), a: track([[T_UP, 16], [1.3, -22, "io"], [2.0, 4, "io"], [2.2, -2, "io"], [2.4, 0, "io"]], t) };
  }
  const h = 160 - (p.y + 45), u = track([[0.6, 0], [2.2, 1, "io"]], t);
  return `${OPEN}<g transform="${cam(100 + 262 * u, 100 + 10 * u, 1 - 0.32 * u)}">${WORLD}${fenceShadow()}${shadowAt(p.x, Math.max(0, h - 5))}${fence()}${hatAt(p.x, p.y, p.a)}</g></svg>`;
}

// ---- sad: over, and into the puddle
const SAD_DUR = 2.9, PUDDLE = { x: 290, y: 168 };
function sad(t) {
  if (t <= 0) return STILL;
  let p = flight(t);
  if (t > T_UP) {
    // sailing up and over, then it tips past upright and keeps going, over onto its crown, and comes down so into the water
    const k = track([[T_UP, 0], [1.95, 1, "io"]], t), arc = Math.sin(Math.PI * Math.min(1, k * 1.1)) * 60;
    const restY = PUDDLE.y - 24;
    p = { x: p.x + (PUDDLE.x - p.x) * k, y: p.y + (restY - p.y) * k - arc * (1 - k * 0.3), a: track([[T_UP, 16], [1.2, 70, "io"], [1.95, 180, "in"], [2.1, 172, "out"], [2.3, 180, "io"]], t) };
  }
  const h = 160 - (p.y + 45), u = track([[0.6, 0], [2.2, 1, "io"]], t), wet = track([[1.95, 0], [2.8, 1, "out"]], t);
  const puddle = `<ellipse cx="${PUDDLE.x + 4}" cy="${PUDDLE.y + 2}" rx="104" ry="18" ${fill("sky-deep")}/><ellipse cx="${PUDDLE.x - 4}" cy="${PUDDLE.y}" rx="90" ry="13" ${fill("sky")}/>`;
  // (the brim, now on top and in the water at its edge, darkening from where it lies in the puddle)
  const soak = wet > 0.004 ? `<clipPath id="wt"><rect x="0" y="${n2(PUDDLE.y - 10 - 26 * wet)}" width="600" height="80"/></clipPath><g clip-path="url(#wt)" opacity="${n4(0.8 * wet)}">${hatAt(p.x, p.y, p.a).replace(/fill="var\(--art-sun,#[0-9A-F]+\)"/g, fill("sun-deep")).replace(/fill="var\(--art-clay,#[0-9A-F]+\)"/g, fill("clay-deep"))}</g>` : "";
  return `${OPEN}<g transform="${cam(100 + 190 * u, 100 + 22 * u, 1 - 0.3 * u)}">${WORLD}${puddle}${shadowAt(p.x, Math.max(0, h - 5))}${hatAt(p.x, p.y, p.a)}${soak}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
