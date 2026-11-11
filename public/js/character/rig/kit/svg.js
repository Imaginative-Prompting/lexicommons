// Generated from the character's rig (08-lexicommons/docs/design/character/rig/kit/svg.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// The SVG document wrapper shared by every character's renders.
import { f2 } from "./geom.js";

/** A whole SVG document around drawn groups. viewBox in world units, y down (SVG). */
export function svgDoc(content, { x = -80, y = -140, w = 160, h = 150, px = 512, bg = null } = {}) {
  const hpx = Math.round((px * h) / w);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${hpx}" viewBox="${f2(x)} ${f2(y)} ${f2(w)} ${f2(h)}">` +
    (bg ? `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="${bg}"/>` : "") + content + `</svg>`;
}
