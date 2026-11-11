// The colors of each language's flag, for its flag theme (lx/theme-presets.js flagPalette): every flag lang/flags.js names, its SVG from
// public/flags/4x3/ drawn small, each pixel given to the nearest of the colors the SVG itself declares, and each color's share of the flag,
// most first. Writes public/js/lx/theme-flags.js (pure data); test-themes.mjs fails when it isn't what this writes.
//   node scripts/build-flag-themes.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(APP, "public/js/lx/theme-flags.js");
const { FLAGS } = await import(join(APP, "public/js/lang/flags.js"));
const { hexToRgb, rgbToHex, toOklab, flagPalette } = await import(join(APP, "public/js/lx/theme-presets.js"));

const NAMED = { white: "#ffffff", black: "#000000", red: "#ff0000", blue: "#0000ff", green: "#008000", yellow: "#ffff00", gold: "#ffd700", navy: "#000080" };
const declared = (svg) => {
  const found = new Set();
  for (const m of svg.matchAll(/(?:fill|stop-color|stroke)\s*[:=]\s*"?\s*(#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|[a-z]+)/g)) {
    const v = m[1].toLowerCase();
    const hex = v.startsWith("#") ? (v.length === 4 ? `#${[...v.slice(1)].map((c) => c + c).join("")}` : v) : NAMED[v];
    if (hex) found.add(hex);
  }
  return [...found];
};

async function colorsOf(code) {
  const svg = readFileSync(join(APP, "public/flags/4x3", `${code}.svg`), "utf8");
  const palette = declared(svg);
  if (!palette.length) throw new Error(`${code}.svg declares no colors`);
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 }).resize(160, 120, { fit: "fill" }).flatten({ background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
  const labs = palette.map((hex) => toOklab(hexToRgb(hex)));
  const count = new Map(palette.map((hex) => [hex, 0]));
  for (let i = 0; i < data.length; i += info.channels) {
    const lab = toOklab([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]);
    let best = 0;
    let bestD = Infinity;
    labs.forEach((l, k) => {
      const d = (l[0] - lab[0]) ** 2 + (l[1] - lab[1]) ** 2 + (l[2] - lab[2]) ** 2;
      if (d < bestD) [best, bestD] = [k, d];
    });
    count.set(palette[best], count.get(palette[best]) + 1);
  }
  const total = info.width * info.height;
  // Colors under 1% of the flag (a line, a tiny emblem's detail) are left out; the rest add up to the flag.
  return [...count.entries()]
    .map(([hex, n]) => [rgbToHex(hexToRgb(hex)), Math.round((n / total) * 1000) / 1000])
    .filter(([, share]) => share >= 0.01)
    .sort((a, b) => b[1] - a[1]);
}

const out = {};
for (const lang of Object.keys(FLAGS).sort()) out[lang] = { flag: FLAGS[lang], colors: await colorsOf(FLAGS[lang]) };
// Each flag's palette (theme-presets.js flagPalette of its colors), kept here so the app reads it rather than working out 70 on a page's open.
const palettes = {};
for (const { flag, colors } of Object.values(out)) palettes[flag] ??= flagPalette(colors);
const sorted = Object.fromEntries(Object.entries(palettes).sort(([a], [b]) => a.localeCompare(b)));
const text = `// Each language's flag's colors, [hex, share of the flag] most first, and each flag's palette (lx/theme-presets.js flagPalette of them): written
// by scripts/build-flag-themes.mjs from public/flags/4x3/ (flag-icons, MIT, and public/flags/SOURCES.md's five). Never edited by hand;
// lx/theme-presets.js makes each flag a theme.
export const FLAG_COLORS = ${JSON.stringify(out, null, 1).replace(/\n\s*/g, " ")};
export const FLAG_PALETTES = ${JSON.stringify(sorted, null, 1).replace(/\n\s*/g, " ")};
`;
if (process.argv.includes("--check")) {
  const now = readFileSync(OUT, "utf8");
  if (now !== text) {
    console.error("public/js/lx/theme-flags.js isn't what build-flag-themes.mjs writes: run it");
    process.exit(1);
  }
  console.log(`theme-flags.js is current (${Object.keys(out).length} languages)`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT} (${Object.keys(out).length} languages)`);
}
