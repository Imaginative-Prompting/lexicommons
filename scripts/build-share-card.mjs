#!/usr/bin/env node
// The picture a link to the home page shows (og:image in public/index.html): public/icons/share-card.png, 1200 × 630, drawn in Chrome
// from the site's own fonts and Tinta's delighted still, in the home page's words. Run it again if those words change.
//
//   node scripts/build-share-card.mjs     (through gpu.py's parallel lane; sandbox off)

import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stillSvg } from "../public/js/character/rig/inkdrop/tinta.js";
import { chromium } from "./quiet-browser.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const font = (name) => pathToFileURL(join(APP, "public/fonts", name)).href;
const OUT = join(APP, "public/icons/share-card.png");
const HERE = mkdtempSync(join(tmpdir(), "share-card-"));
const page = join(HERE, "card.html");
writeFileSync(
  page,
  `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: "Instrument Sans"; src: url("${font("instrument-sans-var.woff2")}") format("woff2"); font-weight: 400 700; }
  @font-face { font-family: "Onest"; src: url("${font("onest-var-latin.woff2")}") format("woff2"); font-weight: 100 900; }
  html, body { margin: 0; width: 1200px; height: 630px; background: #000; overflow: hidden; }
  .card { position: relative; width: 1200px; height: 630px; color: #f1efea; font-family: "Instrument Sans", sans-serif; }
  h1 { position: absolute; left: 80px; top: 150px; width: 640px; margin: 0; font: 600 92px/1.04 "Onest", sans-serif; letter-spacing: -0.02em; }
  .site { position: absolute; left: 80px; bottom: 76px; font-size: 34px; font-weight: 500; color: #a7a49c; }
  .tinta { position: absolute; right: 90px; top: 115px; width: 400px; height: 400px; }
  .tinta svg { width: 100%; height: 100%; display: block; }
  </style><div class="card"><h1>Learn a language for free.</h1><div class="site">lexicommons.com</div><div class="tinta">${stillSvg("right", { palette: "dark", size: 400 })}</div></div>`,
);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const tab = await context.newPage();
  await tab.goto(pathToFileURL(page).href);
  await tab.evaluate(() => document.fonts.ready);
  const faces = await tab.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
  if (faces.length < 2) throw new Error(`the card's fonts didn't load: ${faces.join(", ")}`);
  await tab.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } });
} finally {
  await browser.close();
  rmSync(HERE, { recursive: true, force: true });
}
console.log(`${OUT}: ${Math.round(statSync(OUT).size / 1024)} KB`);
