// Renders the app's icons from their SVG sources in public/icons/ (drawn from the ink drop's rig: app-icon.svg, the
// maskable icon, icon.svg the tab icon, badge.svg, startup.svg the splash's first frame), and writes the iOS launch images' <link> tags into
// public/index.html and public/app/index.html between their markers. Run by scripts/build-static.sh; safe to re-run.
//
//   node scripts/build-icons.mjs
//
// Needs rsvg-convert (librsvg) and ImageMagick's magick (for favicon.ico).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startupImages, startupLinks } from "../src/startup-images.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const icons = join(APP, "public", "icons");
const svg = (name) => join(icons, name);
const render = (src, w, h, out, extra = []) => execFileSync("rsvg-convert", ["-w", String(w), "-h", String(h), ...extra, src, "-o", out]);

// The manifest's icons ("any" from app-icon.svg, "maskable" from icon-maskable.svg), and Apple's (full bleed: iOS
// rounds it).
for (const size of [192, 512]) render(svg("app-icon.svg"), size, size, join(icons, `icon-${size}.png`));
render(svg("icon-maskable.svg"), 512, 512, join(icons, "icon-maskable-512.png"));
render(svg("icon-maskable.svg"), 180, 180, join(icons, "apple-touch-icon.png"));
// The tab icon at 16 and 32 (a PNG beside the SVG for browsers without SVG favicons), /favicon.ico from both, and
// /favicon.png as before.
render(svg("icon.svg"), 16, 16, join(icons, "favicon-16.png"));
render(svg("icon.svg"), 32, 32, join(icons, "favicon-32.png"));
render(svg("icon.svg"), 32, 32, join(APP, "public", "favicon.png"));
execFileSync("magick", [join(icons, "favicon-16.png"), join(icons, "favicon-32.png"), join(APP, "public", "favicon.ico")]);
// Android's notification badge: white on transparent; Android keeps only its alpha.
render(svg("badge.svg"), 96, 96, join(icons, "badge-96.png"));

// iOS launch images: startup.svg (the first frame, drawn by the character's rig, splash/app-frames.mjs) meet-fitted into
// what's below each device's status bar, exactly as the app's first paint meet-fits the same frame in the page, so the
// launch image and the first draw match (rsvg alone would stretch it); the rest black.
const dir = join(icons, "startup");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const startupSvg = readFileSync(svg("startup.svg"), "utf8");
const [bx, by, bw, bh] = startupSvg.match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
const inner = startupSvg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
for (const s of startupImages()) {
  const [w, h] = s.px;
  const k = Math.min(w / bw, (h - s.statusBarPx) / bh), vw = w / k, vh = h / k;
  // The frame's center lands in the middle of the page, statusBarPx / 2 below the screen's.
  const vx = bx + (bw - vw) / 2, vy = by + (bh - vh) / 2 - s.statusBarPx / 2 / k;
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vx} ${vy} ${vw} ${vh}"><rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#000000"/>${inner}</svg>`;
  execFileSync("rsvg-convert", ["-o", join(APP, "public", s.file)], { input: doc });
}

// The tags, between the markers in each page that can be added to the Home Screen.
const START = "<!-- launch images: written by scripts/build-icons.mjs from src/startup-images.ts -->";
const END = "<!-- /launch images -->";
for (const page of ["public/index.html", "public/app/index.html"]) {
  const path = join(APP, page);
  const html = readFileSync(path, "utf8");
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${page}: no launch-image markers (put the two marker comments in its <head>)`);
  writeFileSync(path, html.slice(0, a + START.length) + "\n" + startupLinks() + "\n" + html.slice(b));
}
console.log(`icons rendered; ${readdirSync(dir).length} launch images`);
