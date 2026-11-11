// Each motif theme's scene (lx/theme-presets.js MOTIFS, public/themes/motifs/<id>.webp): where it's cut from its picture. The picture is read at a
// phone's CSS size (430 × 932, each pixel as drawn); its scene begins where its art does (the first row from which the next 24 average 5% art or
// more: a stray petal above isn't the scene), and the cut is the nearest row with no art at all at least 12 px above that, so nothing is cut in
// half at the scene's top edge. Its top must be its palette's canvas, exactly: the page's color runs on into it with no seam. Writes
// public/js/lx/theme-motifs.js (pure data: each cut as a share of the picture's height); test-themes.mjs fails when it isn't what this writes.
//   node scripts/build-motif-themes.mjs [--check]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(APP, "public/js/lx/theme-motifs.js");
const { MOTIFS, motifPicture, PICTURE_SIZE } = await import(join(APP, "public/js/lx/theme-presets.js"));
const ROOM = 12;

async function sceneOf(motif) {
  const file = join(APP, "public", motifPicture(motif.scene));
  if (!existsSync(file)) throw new Error(`${motif.id}: no picture at ${file}`);
  const { width, height } = await sharp(file).metadata();
  if (width !== PICTURE_SIZE[0] || height !== PICTURE_SIZE[1]) throw new Error(`${motif.id}: the picture is ${width} × ${height}, not ${PICTURE_SIZE.join(" × ")}`);
  const { data, info } = await sharp(file).resize(430, 932, { kernel: "nearest" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const hex = (x, y) => {
    const i = (y * info.width + x) * 3;
    return `#${[data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };
  const top = hex(Math.floor(info.width / 2), 4);
  if (top !== motif.canvas.toLowerCase()) throw new Error(`${motif.id}: the picture's top is ${top}, its palette's canvas ${motif.canvas}`);
  const art = Array.from({ length: info.height }, (_, y) => {
    let n = 0;
    for (let x = 0; x < info.width; x++) if (hex(x, y) !== top) n++;
    return n / info.width;
  });
  const begins = art.findIndex((_, y) => {
    const next = art.slice(y, y + 24);
    return next.reduce((a, b) => a + b, 0) / next.length >= 0.05;
  });
  if (begins < 0) throw new Error(`${motif.id}: no scene found in its picture`);
  let cut = begins - ROOM;
  while (cut > 0 && art[cut] > 0) cut--;
  return { from: Math.round((cut / info.height) * 10000) / 10000 };
}

const scenes = {};
for (const motif of Object.values(MOTIFS).sort((a, b) => a.id.localeCompare(b.id))) scenes[motif.scene] = await sceneOf(motif);
const text = `// Where each motif theme's scene is cut from its picture (lx/theme-presets.js MOTIFS): from, a share of the picture's height, the nearest row with
// no art at least 12 px (at 430 wide) above where its art begins. Written by scripts/build-motif-themes.mjs from public/themes/motifs/<id>.webp; run
// it after a picture changes. Pure data.
export const MOTIF_SCENES = ${JSON.stringify(scenes, null, 1).replace(/\{\n\s+/g, "{ ").replace(/\n\s+\}/g, " }")};
`;
if (process.argv.includes("--check")) {
  const now = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (now !== text) {
    console.error("theme-motifs.js isn't what the pictures give: run node scripts/build-motif-themes.mjs");
    process.exit(1);
  }
  console.log(`theme-motifs.js is current (${Object.keys(scenes).length} scenes)`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}: ${Object.entries(scenes).map(([id, s]) => `${id} from ${(s.from * 100).toFixed(1)}%`).join(", ")}`);
}
