// Cheers: two hands clink their beer glasses, then draw back for another. Happy: the second clink, harder, foams both beers up and over the rims,
// and they lift their glasses together, still touching. Sad: left hanging: the right glass turns up and away as the left one comes in, and the left
// reaches into nothing and droops. The still's own shapes on real joints, turned by the shared rig (rig.js). Every frame is a pure function of t, in
// seconds. (One bundle of the rig's cheers/ story files.)
// cheers/body.mjs
import { makeTformRig, parsePath } from "./rig.js";
var STILL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="var(--art-violet,#7C5CE6)"/><path d="M43.3 109.6c-3.2.3-5.2 1.7-7.5 5.2-1.4 2.2-5.3 7.5-12.4 17.4-2 2.8-5 6.8-6.5 9-1.6 2.2-3 4.1-3.1 4.2-.1.2 0 .3.2.5 .2.3.2.6-2.1 6.9-1.2 3.6-2.3 6.7-2.2 6.7 0 .1 5.1.1 11.2.1l11.1 0 3.2-5.8c1.7-3.2 4.1-7.7 5.4-9.9 1.2-2.2 3.1-5.5 4.1-7.4 3.7-6.6 5.5-9 7.7-10.2 .8-.5.8-.5.4-.8-.3-.3-.3-.3.4-1.6 1.1-2.2 1.2-3.5.6-4.4-.4-.6-.4-.7-.4-2.4 .2-4.4-4.7-8-10.1-7.5z" fill="var(--art-paper,#FBF7EC)"/><path d="M47.7 121.8c-.4.3-.7.9-.8 1.2-.4 1.1-.7 1.8-2.5 4.1-.9 1.3-3.4 4.9-5.5 8.1-5.2 8.1-11.9 18.1-12.3 18.5-.3.4-.3.4 1.1 1.8 .8.7 2 2 2.7 2.7 1.6 1.9 1.2 2.3 4.8-4.4 1.7-3.2 4.1-7.7 5.4-9.9 1.2-2.2 3.1-5.5 4.1-7.4 3.7-6.6 5.5-9 7.7-10.2 .8-.5.8-.5.4-.8-.2-.3-.3-.5-.2-.6 .2-.3.3-.3-2.1-2.1-2.6-1.9-2.1-1.7-2.8-1z" fill="var(--art-skin,#E9B48A)"/><path d="M11.1 145.6c-1.5.3-1.8.6-9.1 10.1-.6.7-1.2 1.5-1.5 1.8-.5.6-.5.6-.5 21.5l.1 20.9 5.1 0 5.1 0 1.7-2.5c2.1-3.1 6.8-10.1 8.3-12.4 .5-.9 1.3-2.2 1.7-2.8 3-4.6 4.7-7.4 6.8-10.7 1.3-2.1 2.6-4.2 2.9-4.6 2.2-3.5 2.3-4.3.9-6.9-3.4-5.9-17.3-15.2-21.5-14.4z" fill="var(--art-clay,#E8743B)"/><path d="M29 156.7c-.2.3-.5.7-.7 1-3.5 7.1-16.8 24.6-26.6 35.2l-1.7 1.8 0 2.6 .1 2.6 5.1 0 5.1 0 1.7-2.5c2.1-3.1 6.8-10.1 8.3-12.4 .5-.9 1.3-2.2 1.7-2.8 3-4.6 4.7-7.4 6.8-10.7 1.3-2.1 2.6-4.2 2.9-4.6 2.2-3.5 2.3-4.3.9-6.9-.6-.9-2.9-3.7-3.1-3.7 0 0-.3.2-.5.4z" fill="var(--art-clay-deep,#C25626)"/><path d="M155.3 109.3c-4.4.4-8.8 4.8-8.7 8.7 0 .2 0 .9 0 1.5 0 1.7.3 2.6 1.4 4.2 1.1 1.6 1.1 1.6 2.4 5.2 .5 1.4 1.3 3.2 1.7 3.9 .4.7 1.2 2 1.6 2.8 4 7 5 8.8 6.7 11.8 1 1.9 2.8 5 4 7.1 1.1 2 2.2 4 2.6 4.4l.5.7 12.7 0c8.3 0 12.6 0 12.7-.1 .1-.1-1.8-3.3-4-7.2-2.3-3.9-4.2-7.1-4.2-7.2 0-.2-1.7-2.5-5.1-7.3-1.2-1.7-3-4.1-3.9-5.4-.9-1.3-2.3-3.2-3-4.2-4.9-6.7-10.2-14.2-10.2-14.4 0 0-.3-.6-.8-1.3-.4-.8-.8-1.6-.9-1.8-.1-.5-.2-.7-1.4-1.1-1-.3-2.7-.5-4.1-.3z" fill="var(--art-paper,#FBF7EC)"/><path d="M158 110.2c-.2.4 21.4 45.5 23.5 48.8 .3.6 11.1 1 11.4.5 .1-.1-1.8-3.3-4-7.2-2.3-3.9-4.2-7.1-4.2-7.2 0-.2-1.7-2.5-5.1-7.3-1.2-1.7-3-4.1-3.9-5.4-.9-1.3-2.3-3.2-3-4.2-5.2-7.1-10.2-14.2-10.2-14.4 0-.1-.3-.5-.6-1-.3-.5-.7-1.3-.9-1.8-.4-.8-2.6-1.5-3-.8z" fill="var(--art-skin,#E9B48A)"/><path d="M186.5 144.6c-9.4 2.4-22.8 15.3-20.5 19.8 1.6 3.2 14.3 23.2 21.3 33.5l1.4 2.1 5.6 0 5.6-.1 .1-21c0-21.1 0-21.1-.4-21.4-.2-.2-1.1-1.3-2.1-2.5-1.5-1.9-2.7-3.3-6.6-8.2-1.5-1.8-3-2.6-4.4-2.2z" fill="var(--art-teal,#37B39B)"/><path d="M186.4 144.6c-.2 0-.4.1-.5.2-.1.1 13.7 26.1 13.9 26.1 .4 0 .2-13.1-.2-13.4-.2-.2-1.1-1.3-2.1-2.5-1.5-1.9-2.7-3.3-6.6-8.2-1.5-1.8-2.9-2.5-4.5-2.2z" fill="var(--art-teal-deep,#25907B)"/><path d="M59.3 50.4L54.5 114.7Q54.3 119.5 56.4 120.2Q66.3 124.9 77.5 123.5Q79.7 123.5 81.3 119.1L100.6 59.5Z" fill="var(--art-sky-lit,#8FCDF4)"/><path d="M97.6 60.9L100 61.4L81.3 119.1Q79.7 123.5 77.5 123.5L78.5 120Z" fill="var(--art-sky,#58ADEB)"/><path d="M60.6 61.9L56 112.8Q55.9 115.6 57.3 116.2Q67.2 120.2 78.1 119.5Q79.7 119.5 80.6 116.9L95.2 69.3Z" fill="var(--art-sun,#F7BE45)"/><path d="M89.6 68.1L95.2 69.3L80.6 116.9Q79.7 119.5 78.1 119.5Q72.9 119.9 69.2 119Q80.1 93 89.6 68.1Z" fill="var(--art-sun-deep,#DB9A22)"/><path d="M60.6 61.9L61.4 53L58.8 51.7L59.2 48.9L60.3 46.7L62 45L64.1 43.7L66.6 42.9L69.5 42.5L72.7 42.6L76 43L79.4 43.7L82.7 44.5L85.9 45.2L89 46L91.8 46.8L94.4 47.8L96.8 49.1L98.8 50.8L100.3 52.8L101.2 54.8L101.5 56.9L101.3 58.9L100.6 60.9L97.8 60.9L95.2 69.3Q77.6 67.3 60.6 61.9Z" fill="var(--art-paper,#FBF7EC)"/><path d="M94.4 47.8L96.8 49.1L98.8 50.8L100.3 52.8L101.2 54.8L101.5 56.9L101.3 58.9L100.6 60.9L97.8 60.9L95.2 69.3L93.3 69.4C95.4 62.5 97.8 54.1 94.4 47.8Z" fill="var(--art-paper-deep,#DAD1BC)"/><path d="M59.4 50.1Q79.6 56.9 100.7 59.2L100.1 61.2Q79.2 58.9 59.2 52.2Z" fill="var(--art-sky-lit,#8FCDF4)"/><path d="M100.2 59.6L118.6 119.2Q120.1 123.7 122.4 123.7Q133.5 125 143.5 120.2Q145.6 119.5 145.4 114.6L140.7 49.6Z" fill="var(--art-sky-lit,#8FCDF4)"/><path d="M138.4 52.3L140.8 51.7L145.4 114.6Q145.6 119.5 143.5 120.2L143.1 116.4Z" fill="var(--art-sky,#58ADEB)"/><path d="M105.4 69.4L119.3 117.1Q120.2 119.6 121.8 119.7Q132.6 120.3 142.5 116.2Q144 115.6 143.9 112.8L139.4 61.3Z" fill="var(--art-sun,#F7BE45)"/><path d="M133.9 62.6L139.4 61.3L143.9 112.8Q144 115.6 142.5 116.2Q137.8 118.2 134 118.5Q134.5 90 133.9 62.6Z" fill="var(--art-sun-deep,#DB9A22)"/><path d="M105.4 69.4L102.9 61L100.1 61L99.6 58.4L99.7 55.9L100.6 53.6L102.1 51.5L104.1 49.7L106.5 48L109.4 46.6L112.5 45.5L115.9 44.6L119.1 43.8L122.2 43L125.2 42.3L128.1 41.8L130.8 41.5L133.4 41.7L135.8 42.3L137.9 43.4L139.5 44.9L140.5 46.7L141.1 48.8L141.2 50.9L138.6 52.2L139.4 61.3Q122.7 67 105.4 69.4Z" fill="var(--art-paper,#FBF7EC)"/><path d="M130.8 41.5L133.4 41.7L135.8 42.3L137.9 43.4L139.5 44.9L140.5 46.7L141.1 48.8L141.2 50.9L138.6 52.2L139.4 61.3L137.8 62.2C137 54.8 136.1 45.8 130.8 41.5Z" fill="var(--art-paper-deep,#DAD1BC)"/><path d="M100.1 59.4Q120.8 56.6 140.6 49.3L140.8 51.4Q121.2 58.6 100.7 61.3Z" fill="var(--art-sky-lit,#8FCDF4)"/><path d="M63.4 75.7c-1.6.4-3.3.8-3.8.9-4.4.7-4.4.7-8.6 4.9-2 1.9-4.1 4-4.9 4.6-2.8 2.5-2.5 1.7-6.1 18.8-1 4.5-1.2 5.1-2.5 7.2-.5.7-.8 1.4-.8 1.5 0 .4 16.4 12.3 16.9 12.2 2-.6 6.8-3 6.1-3.2-4.6-1.5-6.3-2.8-6.3-4.7 0-2 .5-7.3.7-8.3 .7-2.6.9-5.5.8-10.3-.1-3 .8-5.5 2.6-7.6 .6-.7.6-.7.6-2.8 .1-2.6.1-2.6 2.2-3.3 6.1-2 10.1-6.5 8.5-9.5-.7-1.3-1.4-1.4-5.4-.4zM92.7 83.7c-.3.2-.8.4-1.5.6-4.6 1-6.7 3.2-5.8 6.1 0 .2.1.6.2.7 0 .2.3.6.5.8 .8.8.3 1.5-1.3 1.9-3.8.9-5.4 4.9-2.9 7.5 .8.8.7 1.4-.1 1.4-3.2.1-4.8 5.3-2.1 7.2 1 .8 1 .7.2 1.5-1.3 1.1-1.6 3.4-.5 4.8 .2.3.3.6.2.8-.2.8 2 1.5 2.6.8 .4-.4.7-.6 1.5-.7 3.5-.7 5.4-3.5 4-6.2-.5-1-.5-1.1.4-1.6 .5-.2.8-.5 2.1-1.5 1.7-1.4 2-4.7.6-6.2-.4-.5-.6-.3 1.2-1.6 2.8-2.1 3.5-5.2 1.8-7.4-.6-.8-.7-.6.4-1.9 2.3-2.6 2.1-5.8-.4-7.1-.8-.3-.8-.3-1.1.1z" fill="var(--art-paper,#FBF7EC)"/><path d="M66.9 80.6c-1.1.9-2.3 1.6-4 2.4-1.1.5-1.8.7-4.6 1.5-2.7.7-6.5 8.2-5.8 11.3 1.9 7.9-.4 16.2-5.2 19.4-1.6 1.1-1.6 1.1-.8 2.3 .7 1.1 1.2 2.5 1.2 3.6 0 .9 5 4.9 5.9 4.7 2-.6 6.8-3 6.1-3.2-4.6-1.5-6.3-2.8-6.3-4.7 0-2 .5-7.3.7-8.3 .7-2.6.9-5.5.8-10.3-.1-3 .8-5.5 2.6-7.6 .6-.7.6-.7.6-2.8 .1-2.6.1-2.6 2.2-3.3 3.1-1 6.1-2.8 7.3-4.5 .9-1.2.5-1.5-.7-.5zM92.8 83.5c-.3.3-.3.3 0 .6 3.1 3.3-1.4 8.2-6.2 6.8-1.1-.4-1.4 0-.6.9 .7.8.7.8.3 1.2-.7.8 2 1.3 4.5.8 1.8-.4 2.2 2.3.5 4.2-1.2 1.5-6.2 2.5-9.6 2-.8-.1-.6.4.7 1.9 1.3 1.4 1.9 1.5 5.5 1 2.5-.4 1.9 3.4-.7 4.7-1.8.9-6.5 1.4-7.9.8-1-.4-.7.9.3 1.5 .3.1.8.6 1.1.9 .5.7.5.7 2.6.7 2.3-.1 2.5 0 2.5 1 0 2-3.2 3.3-5.9 2.4-1.1-.3-1.4.3-.6 1.3 .3.3.4.6.3.8-.2.8 2 1.5 2.6.8 .4-.4.7-.6 1.5-.7 3.5-.7 5.4-3.5 4-6.2-.5-1-.5-1.1.4-1.6 .5-.2.8-.5 2.1-1.5 1.7-1.4 2-4.7.6-6.2-.4-.5-.6-.3 1.2-1.6 2.8-2.1 3.5-5.2 1.8-7.4-.6-.8-.7-.6.4-1.9 2.3-2.6 2.1-5.8-.4-7-.7-.4-.8-.4-1-.2z" fill="var(--art-skin,#E9B48A)"/><path d="M133 75c-1.8.5-2.1 2.6-.8 4.9 1.5 2.5 3.5 4 7.2 5.5 2.7 1 2.6 1 2.8 3.7 .1 2.2.1 2.2.6 2.8 1.5 1.6 2.6 4.7 2.4 6.8-.4 4.4 0 10.3.8 11.7 .1.3.5 5.7.6 7.7 0 .7-.2 1.2-.7 1.8-.4.4-.5.1 1.6 3.1 1.5 2.1 1.7 2.3 1.9 2.2 15.3-13.1 13.3-11.1 12.4-12.7-1-1.6-1.1-2.1-2.9-11.5-2.4-12-1.9-10.9-6.3-15.6-1.8-1.9-4-4.3-5-5.4-1.7-1.8-3-2.8-3.8-2.8-.4 0-5.3-1.1-7.8-1.7-2.5-.7-2.5-.7-3-.5zM107.3 84.3c-2.9 1.5-3.4 4.8-1 7.2 1 1.1 1 1.1.5 1.7-1.9 1.8-1.6 5.1.6 7 .5.4.9.7.9.7 .3-.3 1.3 1 1 1.4-1.6 1.8-1 5.5 1.1 6.8 2 1.2 2.6 1.7 2.2 2.1-2.2 2.4.1 6.6 3.9 6.9 .8.1 1.1.2 1.4.6 .8.7 2.8.2 2.7-.8 0-.3.1-1.3.1-2.3 .2-1.8.1-1.9-.9-3-.5-.6-.2-1 .7-1.3 .6-.2 1.2-.9 1.2-1.3 0-.1 0-.4.1-.7 .8-1.9-1.1-5.2-3-5.2-1.2 0-1.3-.6-.4-1.5 .5-.4.9-.8.9-1 0-.1 0-.5.1-.7 1-2.3-1.2-5.5-4-5.9-1.3-.2-1.7-.9-1-1.7 2.5-2.8.7-6.2-4-7.6-1.4-.4-1.9-.7-1.9-1.1 0-.6-.4-.7-1.2-.3z" fill="var(--art-paper,#FBF7EC)"/><path d="M132.8 80.7c-.2.3 2.1 2.5 3.4 3.2 1.7 1 4.2 2 4.2 1.7 .3-.7 0-1-1.3-1.5-2.4-.8-3.5-1.4-5.2-2.8-.6-.5-1.1-.7-1.1-.6zM153.2 86.3c0 0 .2.8.5 1.6 .7 1.4 2.2 7.9 5.2 22 .7 3.6 1.2 5.2 1.7 5.5 .1.1 1.9-1.3 1.9-1.5 0-.1-.3-.7-.8-1.4-.9-1.6-1-2.2-2.8-11.5-2.2-11.1-2.3-11.4-4.4-13.6-.7-.7-1.3-1.2-1.3-1.1zM107.1 92.1c0 .1 0 .2 0 .3 .1.1.2.3.2.4 0 1 6.6 2.4 6.7 1.4 0-.2.1-.6.4-.9 .9-.9.9-1.4 0-.9-.8.4-3.8.4-5.5-.1-1.2-.3-1.6-.3-1.8-.2zM108.7 100.9c0 .1.1.3.4.5 .3.2.5.5.4.6 0 .2 0 .3.2.3 .1.1.4.2.7.3 .2.1.9.4 1.6.5 .6.2 1.6.4 2 .5 1.5.4 2.8.3 3.5-.2 1.9-1.5 2.4-2.4 1-1.6-1.1.6-7.3 0-9.4-.9-.2-.1-.3-.1-.4 0zM111.7 109.7c-.7 1.1 6.4 3.2 7.6 2.2 .1-.1.6-.3 1-.5 .8-.3 1.6-1.1 1.3-1.4-.1 0-.4 0-.8.2-1.1.5-6.4.2-8.6-.5-.2-.1-.4-.1-.5 0zM120.2 116.1c-1.1.8-4 1.2-6 .8-.8-.1-.6.2.4.7 .6.3 1.3.5 1.9.5 .8.1 1.1.2 1.4.6 1.1 1 2.8.2 2.8-1.4 0-1.5-.1-1.6-.5-1.2z" fill="var(--art-skin,#E9B48A)"/></svg>\n';
var S = 200 / 1254;
var px = (x, y) => [Math.round(x * S * 10) / 10, Math.round(y * S * 10) / 10];
var BONES = {
  armL: { parent: null, at: [-8, 212] },
  handL: { parent: "armL", at: px(278, 748) },
  armR: { parent: null, at: [208, 212] },
  handR: { parent: "armR", at: px(980, 746) }
};
var NAMES = [
  "forearm L",
  "forearm L shade",
  "sleeve L",
  "sleeve L shade",
  "forearm R",
  "forearm R shade",
  "sleeve R",
  "sleeve R shade",
  "glass L",
  "glass L wall shade",
  "beer L",
  "beer L shade",
  "foam L",
  "foam L shade",
  "glass L rim",
  "glass R",
  "glass R wall shade",
  "beer R",
  "beer R shade",
  "foam R",
  "foam R shade",
  "glass R rim",
  "hand L",
  "hand L shade",
  "hand R",
  "hand R shade"
];
var BONE_OF = (n) => {
  const s = n.match(/ ([LR])\b/)[1];
  return (n.startsWith("forearm") || n.startsWith("sleeve") ? "arm" : "hand") + s;
};
var shapes = [...STILL.matchAll(/<(?:path|rect|ellipse)\b[^>]*\/>/g)].map((m) => m[0]);
if (shapes.length !== NAMES.length + 1) throw new Error(`cheers.svg has ${shapes.length} shapes, not the background and ${NAMES.length} paths`);
var BACK = shapes[0];
var drawn = NAMES.map((name, i) => ({ name, bone: BONE_OF(name), text: shapes[i + 1] }));
var beyond = (p, side2) => {
  const d = p.text.match(/ d="([^"]+)"/)[1], fill = p.text.match(/fill="([^"]+)"/)[1];
  const pts = parsePath(d).flatMap((sub) => {
    const out = [sub.start];
    let a = sub.start;
    for (const [c1, c2, e] of sub.segs) {
      for (let k = 1; k <= 16; k++) {
        const t = k / 16, m = 1 - t;
        out.push([0, 1].map((n2) => m * m * m * a[n2] + 3 * m * m * t * c1[n2] + 3 * m * t * t * c2[n2] + t * t * t * e[n2]));
      }
      a = e;
    }
    return out;
  });
  const cx = side2 === "L" ? 0 : 200, along = ([x, y]) => Math.abs(x - cx) < 0.15 ? -(200 - y) : y > 199.85 ? Math.abs(x - cx) : null;
  const on = pts.map((q, i) => [q, along(q), i]).filter(([, a]) => a !== null).sort((a, b) => a[1] - b[1]);
  if (on.length < 2) throw new Error(`cheers: ${p.name} doesn't meet the frame's edge`);
  const [lo, hi] = [on[0], on.at(-1)], snap = ([q, a]) => a < 0 ? [cx, q[1]] : [q[0], 200];
  const n = pts.length, onEdge = (j) => along(pts[(j + n) % n]) !== null;
  const walk = (i, dist) => {
    const step = !onEdge(i + 1) ? 1 : !onEdge(i - 1) ? -1 : 0;
    if (!step) return null;
    let j = i;
    for (let k = 0; k < n; k++) {
      j = (j + step + n) % n;
      if (Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]) >= dist) return pts[j];
    }
    return null;
  };
  const sideOf = ([q, a, i]) => {
    const c = snap([q, a]), far = walk(i, 3), near = walk(i, 1.5);
    if (!far || !near) throw new Error(`cheers: ${p.name}'s cut has no way back into the picture at ${q}`);
    const L = Math.hypot(c[0] - far[0], c[1] - far[1]) || 1, u = [(c[0] - far[0]) / L, (c[1] - far[1]) / L];
    return { c, u, from: near, out: [c[0] + u[0] * 90, c[1] + u[1] * 90] };
  };
  const A = sideOf(lo), B = sideOf(hi), own = (() => {
    const v = [A.u[0] + B.u[0], A.u[1] + B.u[1]], L = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / L, v[1] / L];
  })();
  const mid = lo[1] < 0 && hi[1] > 0 ? [cx, 200] : [(A.c[0] + B.c[0]) / 2, (A.c[1] + B.c[1]) / 2];
  const ring = [A.from, [mid[0] - own[0] * 1.2, mid[1] - own[1] * 1.2], B.from, B.out, A.out];
  const f = (v) => String(Math.round(v * 10) / 10);
  return { name: `${p.name} beyond`, bone: p.bone, text: `<path d="M${ring.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z" fill="${fill}"/>` };
};
var PIECES = drawn.flatMap((p) => {
  const m = /^sleeve ([LR])$/.exec(p.name);
  return m ? [beyond(p, m[1]), beyond(drawn.find((q) => q.name === `sleeve ${m[1]} shade`), m[1]), p] : [p];
});
var R = makeTformRig(BONES);

// cheers/glass.mjs
import { writePath, smoothRing } from "./rig.js";
var S2 = 200 / 1254;
var G = { L: [[372, 316], [631, 373], [503, 775], [337, 749]], R: [[628, 374], [882, 311], [916, 749], [750, 776]] };
var Q = (side2, u, v) => {
  const [tl, tr, br, bl] = G[side2], top = [tl[0] + (tr[0] - tl[0]) * u, tl[1] + (tr[1] - tl[1]) * u], bot = [bl[0] + (br[0] - bl[0]) * u, bl[1] + (br[1] - bl[1]) * u];
  return [(top[0] + (bot[0] - top[0]) * v) * S2, (top[1] + (bot[1] - top[1]) * v) * S2];
};
var cubicPts = (p0, p1, p2, p3, n) => Array.from({ length: n }, (_, i) => {
  const t = i / (n - 1), m = 1 - t;
  return [0, 1].map((k) => m * m * m * p0[k] + 3 * m * m * t * p1[k] + 3 * m * t * t * p2[k] + t * t * t * p3[k]);
});
var tok = (name, hex) => `var(--art-${name},${hex})`;
var PAPER = tok("paper", "#FBF7EC");
var PAPER_DEEP = tok("paper-deep", "#DAD1BC");
function dome(side2, rise) {
  const q = (u, v) => Q(side2, u, v < 0 ? v * rise : v);
  return [...cubicPts(q(-0.01, 0.02), q(-0.02, -0.11), q(0.2, -0.165), q(0.44, -0.16), 10), ...cubicPts(q(0.44, -0.16), q(0.62, -0.156), q(0.78, -0.17), q(0.9, -0.12), 8).slice(1), ...cubicPts(q(0.9, -0.12), q(0.99, -0.085), q(1.02, -0.03), q(1.01, 0.02), 6).slice(1)];
}
var TONGUES = { L: [[0.16, 0.34, 0.07], [0.62, 0.22, 0.06]], R: [[0.3, 0.28, 0.065], [0.78, 0.4, 0.07]] };
var F = (v) => Math.abs(v) >= 0.05 ? v.toFixed(1).replace(/\.?0+$/, "") : "0";
var pt = (p) => `${F(p[0])} ${F(p[1])}`;
function foam(side2, rise = 1, spill = 0) {
  const d = dome(side2, rise), q = (u, v) => Q(side2, u, v);
  const body = [q(0.055, 0.16), q(0.055, 0.03), ...d, q(0.945, 0.03), q(0.945, 0.16)];
  const k = d.findIndex((p) => p[0] >= q(0.74, -0.16 * rise)[0]), sh = [...d.slice(k), q(0.945, 0.03), q(0.945, 0.16), q(0.9, 0.168)];
  const out = {
    foam: `<path d="M${body.map(pt).join("L")}Q${pt(q(0.5, 0.185))} ${pt(q(0.055, 0.16))}Z" fill="${PAPER}"/>`,
    shade: `<path d="M${sh.map(pt).join("L")}C${pt(q(0.9, 0.06))} ${pt(q(0.9, -0.07 * rise))} ${pt(d[k])}Z" fill="${PAPER_DEEP}"/>`,
    spill: ""
  };
  if (spill > 0.01) {
    out.spill = TONGUES[side2].map(([u, v, w]) => {
      const end = v * spill, ring = [Q(side2, u - w, -0.01), Q(side2, u - w * 0.9, end * 0.6), Q(side2, u - w * 0.7, end), Q(side2, u, end + 0.04 * spill), Q(side2, u + w * 0.7, end), Q(side2, u + w * 0.9, end * 0.6), Q(side2, u + w, -0.01)];
      return `<path d="${writePath(smoothRing(ring))}" fill="${PAPER}"/>`;
    }).join("");
  }
  return out;
}

// cheers/draw.mjs
function frame(pose) {
  const W = R.solve(pose), f = { L: foam("L", pose.rise?.L ?? 1, pose.spill?.L ?? 0), R: foam("R", pose.rise?.R ?? 1, pose.spill?.R ?? 0) };
  const pieces = PIECES.flatMap((p) => {
    const m = /^(foam|glass) ([LR])( shade| rim)?$/.exec(p.name);
    if (!m) return [p];
    const side2 = m[2];
    if (m[1] === "foam") return [{ ...p, text: m[3] ? f[side2].shade : f[side2].foam }];
    if (m[3] === " rim" && f[side2].spill) return [p, { name: `foam ${side2} spill`, bone: p.bone, text: f[side2].spill }];
    return [p];
  });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${BACK}${R.draw(pieces, W)}</svg>`, W };
}

// cheers/lift.mjs
var rad = Math.PI / 180;
var CORNER = { L: Q("L", 1, 0), R: Q("R", 0, 0) };
function side(s, h, lean) {
  const E = BONES[`arm${s}`].at, W0 = BONES[`hand${s}`].at, C = CORNER[s], c = Math.cos(lean * rad), sn = Math.sin(lean * rad);
  const W = [C[0] + c * (W0[0] - C[0]) - sn * (W0[1] - C[1]), C[1] - h + sn * (W0[0] - C[0]) + c * (W0[1] - C[1])];
  const v = [W0[0] - E[0], W0[1] - E[1]], r = Math.hypot(v[0], v[1]), u = [v[0] / r, v[1] / r];
  const D = [W[0] - E[0], W[1] - E[1]], du = D[0] * u[0] + D[1] * u[1], disc = du * du - (D[0] * D[0] + D[1] * D[1]) + r * r;
  if (disc < 0) throw new Error(`cheers: no lift of ${h} leaning ${lean} for the ${s} arm`);
  const reach = du - Math.sqrt(disc);
  const w = [D[0] - reach * u[0], D[1] - reach * u[1]], turn = (Math.atan2(w[1], w[0]) - Math.atan2(v[1], v[0])) / rad;
  return { move: [reach * u[0], reach * u[1]], turn, hand: lean - turn };
}
function liftPose(h, lean = 0) {
  const L = side("L", h, -lean), R2 = side("R", h, lean);
  return { moves: { armL: L.move, armR: R2.move }, rot: { armL: L.turn, handL: L.hand, armR: R2.turn, handR: R2.hand } };
}

// cheers/poses.mjs
var HAPPY_LIFT = { h: 8, lean: 3 };
var ENDS = {
  happy: { ...liftPose(HAPPY_LIFT.h, HAPPY_LIFT.lean), rise: { L: 1.8, R: 1.9 }, spill: { L: 1, R: 1 } },
  sad: { rot: { armL: 12, handL: -16, armR: 16, handR: -4 } }
};

// cheers/story.mjs
import { track } from "./rig.js";
var BACK_L = -6;
var BACK_R = 6;
var BEAT = [[0, 0], [0.1, 0], [0.32, 1, "io"]];
var clink = (t, at) => t < at ? 0 : Math.exp(-(t - at) * 18) * Math.sin(Math.min((t - at) * Math.PI * 2 * 9, Math.PI));
var bob = (t, D) => t <= 0 ? 0 : Math.min(1, t / 0.3) * Math.max(0, 1 - t / D) ** 2 * Math.sin(t * Math.PI * 2 * 0.8);
var MOODS = {
  happy: {
    dur: 2.3,
    // (back, then in to the clink at 0.48 s, swung from the wrists; then the lift: up past the end's height and its lean, and settling into them,
    // the rims touching all the way (lift.mjs): its height and lean along one track, a little over and back)
    // (alive: the bob is the lift's own, a little up and down, both glasses together, the rims touching through it)
    pose: (t, bob2) => {
      const back = track(BEAT, t) * (1 - track([[0.32, 0], [0.48, 1, "in"]], t)), k = clink(t, 0.48);
      const u = track([[0.7, 0], [1.15, 1.18, "out"], [1.5, 1, "io"]], t), lift = { h: HAPPY_LIFT.h * u + 0.8 * bob2 + 1.4 * k, lean: HAPPY_LIFT.lean * u };
      const L = liftPose(lift.h, lift.lean);
      return { lift, moves: L.moves, rot: { armL: L.rot.armL, handL: L.rot.handL + BACK_L * back, armR: L.rot.armR, handR: L.rot.handR + BACK_R * back } };
    },
    // the knock foams them up: the dome climbs (fast, then slower), and the foam over the rim slides down the front, slowly (foam is thick)
    rise: (t) => ({ L: 1 + (ENDS.happy.rise.L - 1) * track([[0.5, 0], [1.2, 1, "out"]], t), R: 1 + (ENDS.happy.rise.R - 1) * track([[0.52, 0], [1.25, 1, "out"]], t) }),
    spill: (t) => ({ L: track([[0.85, 0], [1.9, 1, "out"]], t), R: track([[0.9, 0], [2, 1, "out"]], t) })
  },
  sad: {
    dur: 2.5,
    // (alive: the same bob as the happy's, both glasses a little up and down together, which keeps them touching while they still do)
    pose: (t, bob2) => {
      const rot = sadRot(t), lift = { h: 0.8 * bob2, lean: 0 }, L = liftPose(lift.h, lift.lean);
      for (const k of Object.keys(rot)) rot[k] += L.rot[k];
      return { lift, moves: L.moves, rot };
    },
    rise: () => ({ L: 1, R: 1 }),
    spill: () => ({ L: 0, R: 0 })
  }
};
function sadRot(t) {
  {
    const back = track(BEAT, t);
    const away = track([[0.34, 0], [0.7, 1, "io"]], t);
    const inL = track([[0.32, 0], [0.5, 1, "in"]], t), over = track([[0.5, 0], [0.62, 1, "out"], [0.9, 0, "io"]], t);
    const wob = t > 0.62 && t < 1.25 ? Math.sin((t - 0.62) * Math.PI * 2 * 3.2) * Math.exp(-(t - 0.62) * 5) : 0;
    const droop = track([[1.05, 0], [1.6, 0.62, "io"], [2.4, 1, "io"]], t), E = ENDS.sad.rot;
    return {
      armL: E.armL * droop,
      handL: BACK_L * back * (1 - inL) + 7 * over + 2.5 * wob + E.handL * droop,
      armR: E.armR * away,
      handR: BACK_R * back * (1 - away) + E.handR * away
    };
  }
}
var REACTIONS = Object.fromEntries(Object.entries(MOODS).map(([m, M]) => [m, { dur: M.dur }]));
function poseAt(m, t) {
  const M = MOODS[m], D = M.dur;
  t = Math.min(Math.max(t, 0), D);
  const p = M.pose(t, bob(t, D));
  return { ...p, rise: M.rise(t), spill: M.spill(t) };
}
function frame2(m, t) {
  t = Math.min(Math.max(t, 0), MOODS[m].dur);
  if (t === 0) return STILL;
  return frame(poseAt(m, t)).svg;
}
export {
  REACTIONS,
  STILL,
  frame2 as frame
};
export const STILL_HASH = "f5907e5eb7";
