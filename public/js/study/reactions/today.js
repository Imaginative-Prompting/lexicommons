// Today's two stories: a gust comes from the left. Happy: it tumbles yesterday's crumpled page away over the floor and out of the frame, and today
// stands clean. Sad: it's stronger, and knocks today over: the calendar tips back and falls flat on its back with a slap, while yesterday's page,
// in its lee, stays where it was.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-violet-lit,#A68CFF)\"/><polygon points=\"24,160 128,158 172,158 200,171 200,200 96,200 25,167.5\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M50.5 73L50.5 60.2A11.6 11.6 0 0 1 73.7 60.2L73.7 66L67.7 66L67.7 60.2A5.6 5.6 0 0 0 56.5 60.2L56.5 73A3 3 0 0 1 50.5 73Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M85.9 73L85.9 60.2A11.6 11.6 0 0 1 109.1 60.2L109.1 66L103.1 66L103.1 60.2A5.6 5.6 0 0 0 91.9 60.2L91.9 73A3 3 0 0 1 85.9 73Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M112.6 90L125.7 84L124.4 71Q123.5 64 117 64L112 64Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M110 87.3L113.8 87.3L125.4 81.4L129.4 163Q121 168.5 90 168.5L100 150Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M30.8 88L33.6 75Q36 64 47 64L118.4 64L113.6 88Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M50.5 62L56.5 62L56.5 73A3 3 0 0 1 50.5 73Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M85.9 62L91.9 62L91.9 73A3 3 0 0 1 85.9 73Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M30.9 87.3L113.8 87.3L100.2 158Q98.6 168 88 168L25.5 168Q15.5 168 16.6 157.5Z\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"30.9,87.3 113.8,87.3 113.2,90.5 111.5,92 109.4,90.5 107.4,92 105.3,90.5 103.2,92 101.1,90.5 99,92 97,90.5 94.9,92 92.8,90.5 90.7,92 88.6,90.5 86.6,92 84.5,90.5 82.4,92 80.3,90.5 78.2,92 76.2,90.5 74.1,92 72,90.5 69.9,92 67.8,90.5 65.8,92 63.7,90.5 61.6,92 59.5,90.5 57.4,92 55.4,90.5 53.3,92 51.2,90.5 49.1,92 47,90.5 45,92 42.9,90.5 40.8,92 38.7,90.5 36.6,92 34.6,90.5 32.5,92 30.3,90.5\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M149 117Q152 118 156 123.5Q160 127 168 127.5Q174 129 173.5 136Q173.5 141 177.5 146Q176 152 172 156Q170 166 162 170.5Q156 174 150 172Q144 169.5 138 169.5Q130 171 125 167Q120 162 117 155Q113.5 150 117 144.5Q122 139 122.5 133Q125 127 133 126.5Q139 126 142 121Q145 117 149 117Z\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"149,117.2 152.5,136 133,141.5 147,132\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><polygon points=\"116.8,153.5 124.5,166.5 128.5,148.5\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><polygon points=\"163.5,147 172,131 158,140.5\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M177.5 146Q176 152 172 156Q170 166 162 170.5Q156 174 150 172L151.5 163L158 158.5L163.5 147Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/></svg>\n";
export const STILL_HASH = "75ca5e04ce";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 17) throw new Error("today: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const ROOM = EL.slice(0, 2).join(""), SHADOW = EL[2];
const CALENDAR = EL.slice(3, 12).join(""); // its rings, header, side, page and the page's perforated edge
const BALL = EL[12], FOLDS = EL.slice(13, 16).join(""), BALL_SHADE = EL[15 + 1];
const BALL_D = BALL.match(/ d="([^"]+)"/)[1];
// the still's shadow runs out of the frame: its two edges carried on to a rounded end, so it can draw in (inside the frame it's the still's own)
const LONG_SHADOW = "M24 160L128 158L172 158L300 217.4Q336 234 284 238.3L180 238.5L96 200L25 167.5Z";

// ---- yesterday's ball: its outline as points, to keep its lowest point on the floor as it tumbles over its folds
const OUTLINE = (() => {
  // (its outline is a start and quadratic curves, absolute)
  const nums = BALL_D.replace(/[MQZ]/g, " ").trim().split(/\s+/).map(Number), pts = [];
  let at = [nums[0], nums[1]];
  for (let i = 2; i + 3 < nums.length; i += 4) {
    const c = [nums[i], nums[i + 1]], e = [nums[i + 2], nums[i + 3]];
    for (let k = 0; k < 6; k++) { const u = k / 6; pts.push([(1 - u) ** 2 * at[0] + 2 * (1 - u) * u * c[0] + u * u * e[0], (1 - u) ** 2 * at[1] + 2 * (1 - u) * u * c[1] + u * u * e[1]]); }
    at = e;
  }
  return pts;
})();
const MID = [147, 145], R = 28;
const lowest = (th) => Math.max(...OUTLINE.map(([x, y]) => MID[1] + (x - MID[0]) * Math.sin(th) + (y - MID[1]) * Math.cos(th)));
const LOW0 = lowest(0);
/** The ball moved dx along the floor, turned th (radians), resting on its lowest point: its folds turn with it; its shade stays where the light is. */
function ball(dx, th) {
  if (!dx && !th) return `${BALL}${FOLDS}${BALL_SHADE}`;
  const lift = LOW0 - lowest(th);
  const deg = (th * 180) / Math.PI;
  const at = `translate(${n2(dx)} ${n2(lift)})`, turn = `rotate(${n2(deg)} ${MID[0]} ${MID[1]})`;
  return `<clipPath id="bl"><path d="${BALL_D}" transform="${at} ${turn}"/></clipPath><g transform="${at} ${turn}">${BALL}${FOLDS}</g><g clip-path="url(#bl)"><g transform="${at}">${BALL_SHADE}</g></g>`;
}

// ---- happy. The gust pushes it from rest, faster and faster (light paper), over and over, out through the right edge.
const PUSH = 0.06, ACC = 390, OUT = 232 - MID[0];
const T_OUT = PUSH + Math.sqrt((2 * OUT) / ACC);
const HAPPY_DUR = T_OUT + 0.55;
function happy(t) {
  if (t <= 0) return STILL;
  const s = Math.max(0, t - PUSH), dx = Math.min(OUT + 30, 0.5 * ACC * s * s);
  const gone = MID[0] + dx - R - 8 > 200;
  return `${OPEN}${ROOM}${SHADOW}${CALENDAR}${gone ? "" : ball(dx, dx / R)}</svg>`;
}

// ---- sad. The calendar tips back about its foot, slowly at first, then faster and faster, and slaps down flat on its back; a small bounce.
// Seen from a little above (about 20°), a face tipped θ back from upright shows cos(θ − 20°) of its height (a touch more at first, as it turns
// to us), and lying flat, tan 20° of it. Its shadow draws in under it; the ball's own, hidden in the calendar's long one, is left.
const E = 20 * (Math.PI / 180), FOOT = 168;
const tipK = (th) => Math.cos(th - E) / Math.cos(E);
const T_TIP = 0.08, T_FLAT = 0.62;
const tipAt = (t) => track([[T_TIP, 0], [T_FLAT, Math.PI / 2, "in"], [T_FLAT + 0.06, Math.PI / 2 - 0.1, "out"], [T_FLAT + 0.12, Math.PI / 2, "in"], [T_FLAT + 0.16, Math.PI / 2 - 0.025, "out"], [T_FLAT + 0.2, Math.PI / 2, "in"]], t);
// the ball's own shadow, down and right of it as the calendar's is: inside the long shadow, so it shows only once that draws in
const BALL_SHADOW = `<path d="M134 169.5L176 163L197 171.5L181 178.5L150 177Z" ${fill("violet-deep")}/>`;
const SAD_DUR = T_FLAT + 0.2 + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  const th = tipAt(t), k = tipK(th), sh = Math.max(0.05, Math.cos(th));
  const fall = `translate(0 ${FOOT}) scale(1 ${n4(k)}) translate(0 ${-FOOT})`;
  // (drawn in towards a point under the calendar's foot: what's left of it lies under the calendar, as a flat thing's shadow does)
  const shadow = sh === 1 ? SHADOW : `<path d="${LONG_SHADOW}" transform="translate(62 167) scale(${n4(sh)}) translate(-62 -167)" ${fill("violet-deep")}/>`;
  return `${OPEN}${ROOM}${BALL_SHADOW}${shadow}<g transform="${fall}">${CALENDAR}</g>${ball(0, 0)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
