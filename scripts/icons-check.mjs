// The app's icons and launch images, as every page and the manifest point at them (no browser, no server):
// - every icon, manifest and launch-image link in public/*.html, public/**/index.html and src/pages.ts names a file
//   that exists, under a path the site gate lets through (/icons/, /favicon.ico, /manifest.webmanifest);
// - the manifest's icons are PNGs of the sizes they say; the maskable one is full bleed with the drop inside the
//   maskable safe zone (a circle of 40% radius); apple-touch-icon is 180 and opaque;
// - the tab icons are 16 and 32 px, /favicon.ico exists; the notification badge is white wherever it shows (Android
//   keeps only its alpha) with clear around it;
// - each launch image in src/startup-images.ts exists at its pixel size, both installable pages carry exactly its
//   tags, and both of src/pages.ts's layouts write them;
// - the service worker's precached /icons/ files exist.
// Exit 0 = pass.
//
//   node scripts/icons-check.mjs [<app dir>]   (default: this app)
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const APP = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), ".."));
const PUBLIC = join(APP, "public");
const { startupImages, startupLinks } = await import(join(APP, "src", "startup-images.ts"));
const problems = [];
const ok = [];
const fail = (m) => problems.push(m);

/** A PNG's size and, when asked, its pixels as RGBA (8-bit RGB/RGBA, non-interlaced: what rsvg and magick write). */
function png(path, pixels = false) {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], type = b[25], interlace = b[28];
  if (!pixels) return { w, h, type };
  if (depth !== 8 || ![2, 6].includes(type) || interlace) throw new Error(`${path}: unsupported PNG (depth ${depth}, type ${type})`);
  const idat = [];
  for (let o = 8; o < b.length;) {
    const len = b.readUInt32BE(o), kind = b.toString("ascii", o + 4, o + 8);
    if (kind === "IDAT") idat.push(b.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = type === 6 ? 4 : 3, stride = w * bpp, out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      line[x] = (line[x] + [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f]) & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) out[(y * w + x) * 4 + k] = k < bpp ? line[x * bpp + k] : 255;
    prev = line;
  }
  return { w, h, type, px: out };
}

const pagesTs = readFileSync(join(APP, "src", "pages.ts"), "utf8");
const htmlPages = [
  ...readdirSync(PUBLIC).filter((f) => f.endsWith(".html")).map((f) => join(PUBLIC, f)),
  ...["app", "design", "app/storage"].flatMap((d) => readdirSync(join(PUBLIC, d)).filter((f) => f.endsWith(".html")).map((f) => join(PUBLIC, d, f))),
];

// 1. Every linked icon exists, under a path the gate lets through.
const GATE_OK = (u) => u.startsWith("/icons/") || u === "/favicon.ico" || u === "/manifest.webmanifest";
const linkRe = /<link\b[^>]*\brel="(icon|apple-touch-icon|manifest|apple-touch-startup-image)"[^>]*\bhref="([^"]+)"/g;
const imgRe = /<img\b[^>]*\bsrc="(\/icons\/[^"]+)"/g;
let links = 0;
for (const file of [...htmlPages, join(APP, "src", "pages.ts")]) {
  const text = readFileSync(file, "utf8");
  for (const m of [...text.matchAll(linkRe), ...text.matchAll(imgRe)]) {
    const url = (m[2] ?? m[1]).split("?")[0];
    links++;
    if (!existsSync(join(PUBLIC, url))) fail(`${file.slice(APP.length + 1)}: links ${url}, which doesn't exist`);
    if (!GATE_OK(url)) fail(`${file.slice(APP.length + 1)}: links ${url}, outside what the gate lets through`);
  }
}
ok.push(`${links} icon links on ${htmlPages.length + 1} pages`);

// 2. The manifest's icons.
const manifest = JSON.parse(readFileSync(join(PUBLIC, "manifest.webmanifest"), "utf8"));
for (const icon of manifest.icons) {
  const path = join(PUBLIC, icon.src);
  if (!existsSync(path)) { fail(`manifest: ${icon.src} missing`); continue; }
  const { w, h } = png(path);
  if (`${w}x${h}` !== icon.sizes) fail(`manifest: ${icon.src} is ${w}x${h}, says ${icon.sizes}`);
  if (icon.purpose === "maskable") {
    const im = png(path, true);
    const at = (x, y) => im.px.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4);
    const bg = at(0, 0);
    for (const [x, y] of [[0, 0], [im.w - 1, 0], [0, im.h - 1], [im.w - 1, im.h - 1]]) if (at(x, y)[3] !== 255) fail(`maskable: corner ${x},${y} isn't opaque (it must be full bleed)`);
    let outside = 0;
    const r = 0.4 * im.w, cx = im.w / 2, cy = im.h / 2;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      const p = at(x, y);
      const differs = Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 24;
      if (differs && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) outside++;
    }
    if (outside) fail(`maskable: ${outside} px of the drop lie outside the safe zone (radius ${r})`);
    else ok.push("maskable: the whole drop inside the safe zone");
  }
}
{
  const a = png(join(PUBLIC, "icons", "apple-touch-icon.png"), true);
  if (a.w !== 180 || a.h !== 180) fail(`apple-touch-icon is ${a.w}x${a.h}, not 180`);
  for (let i = 3; i < a.px.length; i += 4) if (a.px[i] !== 255) { fail("apple-touch-icon has transparent pixels (iOS shows them black)"); break; }
}

// 3. Tab icons and the badge.
for (const [f, s] of [["icons/favicon-16.png", 16], ["icons/favicon-32.png", 32], ["favicon.png", 32]]) {
  if (!existsSync(join(PUBLIC, f))) { fail(`${f} missing`); continue; }
  const { w, h } = png(join(PUBLIC, f));
  if (w !== s || h !== s) fail(`${f} is ${w}x${h}, not ${s}`);
}
if (!existsSync(join(PUBLIC, "favicon.ico"))) fail("favicon.ico missing");
{
  const path = join(PUBLIC, "icons", "badge-96.png");
  if (!existsSync(path)) fail("icons/badge-96.png missing");
  else {
    const b = png(path, true);
    let shown = 0, notWhite = 0, clear = 0;
    for (let i = 0; i < b.px.length; i += 4) {
      if (b.px[i + 3] === 0) clear++;
      else { shown++; if (b.px[i] !== 255 || b.px[i + 1] !== 255 || b.px[i + 2] !== 255) notWhite++; }
    }
    if (b.w !== 96 || b.h !== 96) fail(`badge is ${b.w}x${b.h}, not 96`);
    if (notWhite) fail(`badge: ${notWhite} of ${shown} shown pixels aren't white`);
    if (clear < b.w * b.h * 0.2) fail("badge: hardly any transparency (Android would show a blob)");
    if (!notWhite) ok.push(`badge: ${shown} px white, ${clear} clear`);
  }
}

// 4. Launch images.
const images = startupImages();
for (const s of images) {
  const path = join(PUBLIC, s.file);
  if (!existsSync(path)) { fail(`launch image ${s.file} missing`); continue; }
  const { w, h } = png(path);
  if (w !== s.px[0] || h !== s.px[1]) fail(`${s.file} is ${w}x${h}, not ${s.px.join("x")}`);
}
const block = startupLinks();
for (const page of ["index.html", "app/index.html"]) {
  const text = readFileSync(join(PUBLIC, page), "utf8");
  if (!text.includes(block)) fail(`public/${page}: its launch-image tags aren't src/startup-images.ts's (run scripts/build-icons.mjs)`);
  const n = (text.match(/apple-touch-startup-image/g) || []).length;
  if (n !== images.length * 2) fail(`public/${page}: ${n} launch-image tags, ${images.length} images (each has two: exact, then iOS 27's)`);
}
if ((pagesTs.match(/\$\{startupLinks\(\)\}/g) || []).length !== 2) fail("src/pages.ts: both layouts should write ${startupLinks()}");
ok.push(`${images.length} launch images at their sizes, two tags each, on both pages and in pages.ts`);

// Which image each device takes, from the tags as written. A correct engine's device-height is the screen's: only its own exact tag
// matches. iOS 27 reads Safari's window height there (WebKit bug 326500: 660–669 on a 375 × 812 13 mini, 143–152 under its screen): its
// fallback alone matches, its own image. Its control: the exact tags alone (the list before) match nothing under iOS 27's heights.
const tags = [...block.matchAll(/media="([^"]+)" href="([^"]+)"/g)].map((m) => ({ media: m[1], href: m[2] }));
const matches = (media, env) =>
  media.split(" and ").every((part) => {
    const m = /^\(([-a-z]+): ([\d.]+)(px)?\)$/.exec(part) ?? /^\((orientation): ([a-z]+)\)$/.exec(part);
    if (!m) return fail(`a launch-image query icons-check can't read: ${part}`);
    const [, feature, value] = m;
    if (feature === "orientation") return env.orientation === value;
    const n = Number(value);
    return { "device-width": env.w === n, "device-height": env.h === n, "min-device-height": env.h >= n, "max-device-height": env.h <= n, "-webkit-device-pixel-ratio": env.dpr === n }[feature] ?? fail(`launch-image query feature ${feature}`);
  });
const taken = (list, env) => [...new Set(list.filter((t) => matches(t.media, env)).map((t) => t.href))];
const { STARTUP_DEVICES } = await import(join(APP, "src", "startup-images.ts"));
let devices = 0;
let windows = 0;
for (const d of STARTUP_DEVICES) {
  for (const orientation of d.landscape ? ["portrait", "landscape"] : ["portrait"]) {
    const own = images.find((s) => s.px[0] === (orientation === "portrait" ? d.w : d.h) * d.dpr && s.px[1] === (orientation === "portrait" ? d.h : d.w) * d.dpr).file;
    const exact = tags.filter((t) => matches(t.media, { w: d.w, h: d.h, dpr: d.dpr, orientation }));
    if (exact.length !== 1 || exact[0].href !== own) fail(`${d.note} (${orientation}): a correct engine matches ${JSON.stringify(exact.map((t) => t.href))}, not only ${own}`);
    devices++;
  }
  if (d.landscape) continue; // iPads on iOS 27: their window heights aren't measured
  for (let under = 143; under <= 152; under++) {
    const env = { w: d.w, h: d.h - under, dpr: d.dpr, orientation: "portrait" };
    const got = taken(tags, env);
    const own = images.find((s) => s.px[0] === d.w * d.dpr && s.px[1] === d.h * d.dpr).file;
    if (got.length !== 1 || got[0] !== own) fail(`${d.note} on iOS 27 (window ${env.h}): takes ${JSON.stringify(got)}, not ${own}`);
    if (taken(images.map((s) => ({ media: s.media, href: s.file })), env).length) fail(`control: the exact tags alone matched iOS 27's window ${env.h} on ${d.note}`);
    windows++;
  }
}
ok.push(`each of ${devices} devices and orientations takes only its own image on a correct engine; each iPhone at ${windows / STARTUP_DEVICES.filter((d) => !d.landscape).length} of iOS 27's window heights takes its own, where the exact tags alone take none`);

// 5. The service worker's precached icons.
const sw = readFileSync(join(PUBLIC, "sw.js"), "utf8");
for (const m of sw.matchAll(/"(\/icons\/[^"]+)"/g)) if (!existsSync(join(PUBLIC, m[1]))) fail(`sw.js precaches ${m[1]}, which doesn't exist`);

for (const line of ok) console.log(`ok    ${line}`);
for (const p of problems) console.log(`FAIL  ${p}`);
console.log(problems.length ? `${problems.length} problem(s)` : "icons check passed");
process.exit(problems.length ? 1 : 0);
