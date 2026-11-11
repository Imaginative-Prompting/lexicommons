// The Words card's pile (know/pile.js layOut, as know/cards.js drops it in each visit), in plain Node: at 50 to 2,500 words, a pile laid out
// with a seed of its own never has two tiles overlapping (as drawn: each a turned rectangle) nor one past its box's walls or under its floor;
// two seeds make two different piles (the same words, other places), and the same seed the same pile; laying out 2,500 words takes a few ms
// (the page does it in the frame the card comes into view). Then no tilt: nothing under public/ listens to the phone's tilt or motion or asks
// to (deviceorientation, devicemotion, their permission), nor ships the physics the tilt needed (Rapier, planck), a planted listener caught
// first. Usage: node scripts/test-pile-drop.mjs [<app dir>]   (exit 0 = pass)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const { layOut, wallsOf, PILE_HEIGHT, FLOOR, INSET } = await import(pathToFileURL(join(APP, "public/js/know/pile.js")).href);
let failed = 0;
const check = (name, fn) => {
  try {
    const detail = fn();
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
};

// Tiles as the card makes them (cards.js: TILE_H 36, a word's width its letters' and 13 px each side, 52 at least), from the path's words.
const TILE_H = 36;
const path = JSON.parse(readFileSync(join(APP, "packs", "path-nl.json"), "utf8"));
const names = [...new Set(path.items.flatMap((item) => item.words.map(([text]) => text.replace(/[.,!?¿¡:;]/g, ""))))].filter(Boolean);
const tilesOf = (n) => Array.from({ length: n }, (_, i) => {
  const name = names[i % names.length];
  return { id: `w:${i}`, w: Math.max(52, Math.ceil(name.length * 9.5 + 26)), h: TILE_H };
});
// The card's own width on a 390 phone (its pile space inside its walls), as cards.js measures it.
const INNER = 390 - 2 * 16 - 2 * INSET;
const halfOf = (tiles) => wallsOf({ width: INNER, average: tiles.reduce((sum, tile) => sum + tile.w * TILE_H, 0) / tiles.length / 0.75 })(tiles.length);

// Two turned rectangles overlap (separating axes): by how much, along the axis that separates them least.
function overlap(a, b) {
  const axes = [a.a, a.a + Math.PI / 2, b.a, b.a + Math.PI / 2].map((t) => [Math.cos(t), Math.sin(t)]);
  let least = Number.POSITIVE_INFINITY;
  for (const [ux, uy] of axes) {
    const span = (r) => {
      const c = Math.cos(r.a);
      const s = Math.sin(r.a);
      const ex = Math.abs((r.w / 2) * (c * ux + s * uy)) + Math.abs((r.h / 2) * (-s * ux + c * uy));
      const m = r.x * ux + r.y * uy;
      return [m - ex, m + ex];
    };
    const [a0, a1] = span(a);
    const [b0, b1] = span(b);
    least = Math.min(least, Math.min(a1, b1) - Math.max(a0, b0));
    if (least <= 0) return 0;
  }
  return least;
}
const rectsOf = (tiles, at) => tiles.map((tile) => ({ id: tile.id, x: at[tile.id][0], y: at[tile.id][1], a: at[tile.id][2], w: tile.w, h: tile.h }));
// Every pair that overlaps by more than 1 px, through a grid of cells so 2,500 tiles take a moment, not a minute.
function overlaps(rects) {
  const cell = 120;
  const grid = new Map();
  rects.forEach((r, i) => {
    const reach = Math.hypot(r.w, r.h) / 2;
    for (let gx = Math.floor((r.x - reach) / cell); gx <= Math.floor((r.x + reach) / cell); gx++)
      for (let gy = Math.floor((r.y - reach) / cell); gy <= Math.floor((r.y + reach) / cell); gy++) {
        const key = `${gx},${gy}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
  });
  const found = new Set();
  for (const list of grid.values())
    for (let p = 0; p < list.length; p++)
      for (let q = p + 1; q < list.length; q++) {
        const key = `${list[p]},${list[q]}`;
        if (found.has(key)) continue;
        if (overlap(rects[list[p]], rects[list[q]]) > 1) found.add(key);
      }
  return [...found];
}
const boundsOf = (r) => {
  const c = Math.abs(Math.cos(r.a));
  const s = Math.abs(Math.sin(r.a));
  return [(c * r.w + s * r.h) / 2, (s * r.w + c * r.h) / 2];
};

const SIZES = [50, 150, 430, 900, 2500];
check("a pile laid out at random never overlaps, nor passes its walls or floor: 50, 150, 430, 900 and 2,500 words, three seeds each (a planted overlap caught first)", () => {
  const planted = overlaps([{ x: 0, y: 18, a: 0, w: 60, h: 36 }, { x: 40, y: 30, a: 0.2, w: 60, h: 36 }]);
  if (planted.length !== 1) throw new Error("a planted overlap wasn't caught");
  const said = [];
  for (const n of SIZES) {
    const tiles = tilesOf(n);
    const half = halfOf(tiles);
    for (const seed of [1, 0x9e3779b9, 0xdeadbeef]) {
      const rects = rectsOf(tiles, layOut({ tiles, half, seed }));
      const over = overlaps(rects);
      if (over.length) throw new Error(`${n} words, seed ${seed}: ${over.length} pairs overlap (${over.slice(0, 3).join("; ")})`);
      const out = rects.filter((r) => {
        const [hx, hy] = boundsOf(r);
        return r.x - hx < -half - 0.5 || r.x + hx > half + 0.5 || r.y - hy < -0.5;
      });
      if (out.length) throw new Error(`${n} words, seed ${seed}: ${out.length} past a wall or the floor (${out[0].id} at ${out[0].x.toFixed(1)}, ${out[0].y.toFixed(1)}; walls ±${half.toFixed(1)})`);
    }
    said.push(`${n}: walls ±${Math.round(half)}`);
  }
  return said.join(", ");
});

check("two seeds, two piles (the same words in other places); the same seed, the same pile", () => {
  const said = [];
  for (const n of [50, 2500]) {
    const tiles = tilesOf(n);
    const half = halfOf(tiles);
    const a = layOut({ tiles, half, seed: 11 });
    const b = layOut({ tiles, half, seed: 12 });
    const again = layOut({ tiles, half, seed: 11 });
    const moved = tiles.filter((tile) => Math.hypot(a[tile.id][0] - b[tile.id][0], a[tile.id][1] - b[tile.id][1]) > 20).length;
    if (moved < 0.8 * n) throw new Error(`${n} words: only ${moved} of them more than 20 px from where the other seed put them`);
    if (tiles.some((tile) => a[tile.id].some((v, i) => v !== again[tile.id][i]))) throw new Error(`${n} words: the same seed laid them out differently`);
    said.push(`${n}: ${Math.round((100 * moved) / n)}% elsewhere`);
  }
  return said.join(", ");
});

check("2,500 words laid out in under 15 ms here (the page lays a pile out in the frame it drops it: under 60 ms slowed 4×)", () => {
  const tiles = tilesOf(2500);
  const half = halfOf(tiles);
  const times = [];
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    layOut({ tiles, half, seed: k + 1 });
    times.push(performance.now() - t0);
  }
  const best = Math.min(...times);
  if (best > 15) throw new Error(`${Math.round(best)} ms`);
  return `${Math.round(best)} ms (of ${times.map(Math.round).join(", ")})`;
});

// The scan: every text file under public/ (the vendored libraries too), for the phone's tilt or motion, a listener or its permission ask.
const TILT = /deviceorientation|devicemotion|DeviceOrientationEvent|DeviceMotionEvent/i;
const scan = (files) => files.filter(([, text]) => TILT.test(text)).map(([file]) => file);
const textFiles = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) out.push(...textFiles(file));
    else if (/\.(m?js|html|css|json|webmanifest)$/.test(name)) out.push(file);
  }
  return out;
};
check("no tilt: nothing under public/ listens to the phone's tilt or motion or asks to, and no physics engine is shipped (a planted listener caught first)", () => {
  const planted = scan([["planted.js", 'addEventListener("deviceorientation", (e) => e.beta)'], ["asked.js", "await DeviceOrientationEvent.requestPermission()"]]);
  if (planted.length !== 2) throw new Error(`the planted listener and ask weren't both caught: ${planted.join(", ") || "neither"}`);
  const files = textFiles(join(APP, "public"));
  const found = scan(files.map((file) => [relative(APP, file), readFileSync(file, "utf8")]));
  if (found.length) throw new Error(`the tilt in ${found.join(", ")}`);
  const engines = ["public/vendor/rapier", "public/vendor/planck", "public/js/know/tilt.js", "public/js/know/pile-live.js", "public/js/know/pile-rapier.js", "public/js/know/pile-worker.js"].filter((p) => existsSync(join(APP, p)));
  if (engines.length) throw new Error(`still shipped: ${engines.join(", ")}`);
  const sw = readFileSync(join(APP, "public/sw.js"), "utf8");
  if (/rapier|planck|tilt\.js|pile-live|pile-worker/.test(sw.replace(/^\s*\/\/.*$/gm, ""))) throw new Error("the service worker still names the tilt's files");
  return `${files.length} files read`;
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
