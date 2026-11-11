// The city's two stories. Happy: fireworks. Dusk falls, then three go up from behind the buildings, one after another, burst and thin away; it ends on
// the lit city at night. Sad: a storm. Clouds roll in from both sides and meet over the towers, the day goes dull, it pours, and lightning cracks down behind the tower.
// Every frame is a pure function of t, in seconds. The buildings are the still's own; the sky's events go behind them, the clouds and the rain in front.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M-5 176H205V205H-5Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M-5 176H205V205H-5Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M120 66H144V176H120Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M144 66H156V176H144Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M125 74h5v7h-5zM134 74h5v7h-5zM125 86h5v7h-5zM134 86h5v7h-5zM125 98h5v7h-5zM134 98h5v7h-5zM125 110h5v7h-5zM134 110h5v7h-5zM125 122h5v7h-5zM134 122h5v7h-5zM125 134h5v7h-5zM134 134h5v7h-5zM125 146h5v7h-5zM134 146h5v7h-5zM125 158h5v7h-5zM134 158h5v7h-5z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M147 74h6v6h-6zM147 86h6v6h-6zM147 98h6v6h-6zM147 110h6v6h-6zM147 122h6v6h-6zM147 134h6v6h-6zM147 146h6v6h-6zM147 158h6v6h-6z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M28 80H50V176H28Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M50 80H60V176H50Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M33 88h5v7h-5zM41 88h5v7h-5zM33 100h5v7h-5zM41 100h5v7h-5zM33 112h5v7h-5zM41 112h5v7h-5zM33 124h5v7h-5zM41 124h5v7h-5zM33 136h5v7h-5zM41 136h5v7h-5zM33 148h5v7h-5zM41 148h5v7h-5zM33 160h5v7h-5zM41 160h5v7h-5z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M53 88h4v6h-4zM53 100h4v6h-4zM53 112h4v6h-4zM53 124h4v6h-4zM53 136h4v6h-4zM53 148h4v6h-4zM53 160h4v6h-4z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M66 34H96V176H66Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M96 34H112V176H96Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M71 42h5v7h-5zM79.4 42h5v7h-5zM87.8 42h5v7h-5zM71 54h5v7h-5zM79.4 54h5v7h-5zM87.8 54h5v7h-5zM71 66h5v7h-5zM79.4 66h5v7h-5zM87.8 66h5v7h-5zM71 78h5v7h-5zM79.4 78h5v7h-5zM87.8 78h5v7h-5zM71 90h5v7h-5zM79.4 90h5v7h-5zM87.8 90h5v7h-5zM71 102h5v7h-5zM79.4 102h5v7h-5zM87.8 102h5v7h-5zM71 114h5v7h-5zM79.4 114h5v7h-5zM87.8 114h5v7h-5zM71 126h5v7h-5zM79.4 126h5v7h-5zM87.8 126h5v7h-5zM71 138h5v7h-5zM79.4 138h5v7h-5zM87.8 138h5v7h-5zM71 150h5v7h-5zM79.4 150h5v7h-5zM87.8 150h5v7h-5zM71 162h5v7h-5zM79.4 162h5v7h-5zM87.8 162h5v7h-5z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M99 42h10v6h-10zM99 54h10v6h-10zM99 66h10v6h-10zM99 78h10v6h-10zM99 90h10v6h-10zM99 102h10v6h-10zM99 114h10v6h-10zM99 126h10v6h-10zM99 138h10v6h-10zM99 150h10v6h-10zM99 162h10v6h-10z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M150 110H170V176H150Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M170 110H180V176H170Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M155 118h5v7h-5zM162.6 118h5v7h-5zM155 130h5v7h-5zM162.6 130h5v7h-5zM155 142h5v7h-5zM162.6 142h5v7h-5zM155 154h5v7h-5zM162.6 154h5v7h-5zM155 166h5v7h-5zM162.6 166h5v7h-5z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M173 118h4v6h-4zM173 130h4v6h-4zM173 142h4v6h-4zM173 154h4v6h-4zM173 166h4v6h-4z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M8 126H26V176H8Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M26 126H34V176H26Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M13 134h5v7h-5zM13 146h5v7h-5zM13 158h5v7h-5z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M29 134h2v6h-2zM29 146h2v6h-2zM29 158h2v6h-2z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M80 34V18H83V34Z\" fill=\"var(--art-ink,#231F3B)\"/>\n</svg>\n";
export const STILL_HASH = "583c4051a7";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const REST = STILL.slice(STILL.indexOf("<path"), STILL.lastIndexOf("</svg>"));
const fill = (t) => `fill="${paint(t)}"`;
const line = (x1, y1, x2, y2, c, w) => `<path d="M${n2(x1)} ${n2(y1)}L${n2(x2)} ${n2(y2)}" stroke="${paint(c)}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;

// ---- happy. A rocket: up from behind the roofs, slowing as it climbs. A burst: rays thrown out fast, slowing, sagging as they fall, the tails catching up
// with the heads until they are dashes, then gone. The last two stop at their fullest.
// (fireworks are a night thing: dusk falls first, and every burst thins away to nothing, the last just before the end; none is held mid-burst)
const ROCKETS = [
  { x: 38, y: 50, R: 25, up: 0.42, at: 0.74, color: "violet", n: 11 },
  { x: 146, y: 44, R: 25, up: 0.66, at: 0.98, color: "teal", n: 11 },
  // (from behind the tall tower: at x 112 its trail showed in the gap between the tower and the next building)
  { x: 104, y: 30, R: 32, up: 0.86, at: 1.16, color: "clay", n: 13 },
];
const HAPPY_DUR = 2.05;
function burst(r, t) {
  const s = t - r.at;
  if (t < r.up) return "";
  if (s < 0) {
    // (it goes up from behind the buildings: low enough that the building in front hides its start, high enough that it's never on the street)
    const p = (t - r.up) / (r.at - r.up), k = 1 - (1 - p) * (1 - p), y = 130 - (130 - r.y) * k;
    return line(r.x, y + 16 * (1 - p) + 3, r.x, y, "paper", 3);
  }
  const life = r.hold ? 0.5 : 0.85;
  const q = r.hold ? Math.min(s, life) : s;
  if (q > life) return "";
  const head = track([[0, 0.1], [0.32, 1, "out"]], q), tail = track([[0, 0], [0.12, 0], [r.hold ? life : 0.7, r.hold ? 0.62 : 1, "out"]], q), sag = 9 * q * q;
  // The sparks thin to nothing at the end of their life rather than vanishing.
  const w = r.hold ? 3.6 : n2(3.6 * (1 - Math.max(0, Math.min(1, (q - 0.62) / 0.23))));
  if (Number(w) <= 0) return "";
  let out = "";
  for (let i = 0; i < r.n; i++) {
    const a = (i / r.n) * 2 * Math.PI + 0.3, c = Math.cos(a), sn = Math.sin(a);
    const x1 = r.x + c * r.R * tail, y1 = r.y + sn * r.R * tail + sag * tail, x2 = r.x + c * r.R * head, y2 = r.y + sn * r.R * head + sag;
    out += line(x1, y1, x2, y2, r.color, w);
  }
  // A flash at the middle as it bursts.
  if (q < 0.12) out += `<circle cx="${r.x}" cy="${r.y}" r="${n2(7 * (1 - q / 0.12))}" ${fill("paper")}/>`;
  return out;
}
// The still's ground (its first two shapes), and the buildings after it (each: its lit front, its dark side, its windows).
const PATHS = [...REST.matchAll(/<path\b[^>]*\/>/g)].map((m) => m[0]);
const GROUND = PATHS.slice(0, 2).join(""), TOWERS = PATHS.slice(2);
function happy(t) {
  if (t <= 0) return STILL;
  // Dusk: the sky and the ground darken to night together, and the towers' lit fronts dim with them; their windows are what's left lit.
  const dusk = track([[0.05, 0], [0.6, 1, "io"]], t);
  // (the sky becomes the night's own color, wholly, and the ground goes darker still, so the two stay apart)
  const night = dusk > 0 ? `<rect width="200" height="176" ${fill("ink-lit")} opacity="${n2(dusk)}"/><rect y="176" width="200" height="24" ${fill("ink")} opacity="${n2(0.85 * dusk)}"/>` : "";
  const towers = TOWERS.map((p) => (dusk > 0 && p.includes("--art-paper,") ? p + p.replace(/fill="[^"]*"/, `fill="${paint("ink")}" opacity="${n2(0.55 * dusk)}"`) : p)).join("");
  return `${OPEN}${BG}${GROUND}${night}${ROCKETS.map((r) => burst(r, t)).join("")}${towers}</svg>`;
}

// ---- sad. Cloud banks: lumps of gray, lit along their tops from the left, rolling in from each side; the day dulls under them; rain in slanting streaks;
// one flash, and a bolt behind the tower.
const LUMPS = [[-6, 18, 26], [24, 8, 28], [50, 22, 22], [74, 6, 26], [98, 20, 22], [122, 4, 28], [146, 18, 24], [170, 6, 28], [196, 20, 26]];
function clouds(k) {
  // The left half comes from the left, the right half from the right.
  let out = "";
  for (const shade of ["steel-deep", "steel"]) {
    for (const [x, y, r] of LUMPS) {
      const from = x < 100 ? -130 : 130, dx = from * (1 - k);
      out += shade === "steel-deep" ? `<circle cx="${n2(x + dx)}" cy="${y}" r="${r}" ${fill(shade)}/>` : `<circle cx="${n2(x + dx - 4)}" cy="${y - 5}" r="${n2(r * 0.72)}" ${fill(shade)}/>`;
    }
  }
  return out;
}
// Rain: each streak starts falling from inside the cloud bank when its turn comes (the downpour thickening), and falls the whole way, slanting; after
// it reaches the ground the next drop starts again inside the cloud. It's drawn behind the clouds, so every streak comes out of their underside.
function rain(t) {
  let out = "";
  const BASE = 18, H = 190, v = 330;
  for (let i = 0; i < 34; i++) {
    const start = 0.85 + 0.4 * (((i * 7) % 34) / 34) + ((i * 61.7) % 200) / v / 4;
    if (t <= start) continue;
    const d = (v * (t - start)) % H, y = BASE + d, x = ((i * 37.3) % 210) - 0.3 * d + 30;
    out += line(x, y, x - 3.6, y + 12, "steel", 2.2);
  }
  return out;
}
const SAD_DUR = 2.5;
const FLASH = 1.42;
function sad(t) {
  if (t <= 0) return STILL;
  const k = track([[0.15, 0], [0.95, 1, "io"]], t);
  const dull = track([[0.3, 0], [1.0, 0.55, "io"]], t);
  const pour = track([[0.85, 0], [1.25, 1, "io"]], t);
  // The flash: the sky lights, twice, quickly; the bolt shows with it.
  const lit = (t > FLASH && t < FLASH + 0.05) || (t > FLASH + 0.09 && t < FLASH + 0.13);
  const sky = `${BG}${dull > 0 ? `<rect width="200" height="176" ${fill("steel-deep")} opacity="${n2(dull)}"/>` : ""}${lit ? `<rect width="200" height="176" ${fill("paper")} opacity="0.7"/>` : ""}`;
  const bolt = lit ? `<polygon points="117,30 126,30 117,46 125,46 110,72 113,52 106,52" ${fill("paper")}/>` : "";
  return `${OPEN}${sky}${bolt}${REST}${rain(t)}${clouds(k)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
