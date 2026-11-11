// The Knowledge page's first card (know/page.js), Your words: every word and phrase you've started as a tile in one pile, piled by physics
// and kept on this device (know/pile.js), the view pulling back as the pile grows, the words this page hasn't shown you yet falling onto it
// as you come to it, the ones you know well filled in; the whole card opens them all (#know/words, know/words-page.js). The other cards are
// know/cards-more.js.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { t, formatNumber } from "../lx/i18n.js";
import { symbol } from "../lx/symbols.js";
import * as motion from "../lx/motion.js";
import { writtenName } from "../study/content.js";
import { renderConcept } from "./concept.js";
import { isUnderstood, startedWords, understoodUnits } from "./word-index.js";
import { FLOOR, INSET, PILE_HEIGHT, hashOf, layOut, liftOf, riseOf, seeded, sinkLaw, viewOf, wallsOf } from "./pile.js";
import { sampleKey } from "../study/sample-mode.js";

const PAINTS = ["sun", "teal", "violet", "paper"];
const TILE_H = 36;
const TILE_FONT = 17;
const TILE_PAD = 13;

/** A word or phrase in a sheet over the page: everything its own page has (concept.js), without leaving this one. */
export function openUnitSheet(unit) {
  const layer = ui.sheetLayer({ label: writtenName(unit), onClose: () => layer.remove() });
  renderConcept(layer.lxBody, unit);
  // Its Practice this goes to a session: the sheet goes with the page.
  addEventListener("hashchange", () => layer.lxClose?.(), { once: true });
  document.body.append(layer);
  layer.lxOpen();
  return layer;
}

/**
 * Every word and phrase you've started (as the pile has them), the first you met first, each with whether you know it well (summary.js
 * understood: the one rule the number, Your words, This week and Home's tile count by): { unit, first, known }. From the word index
 * (know/word-index.js startedWords).
 */
export const pileUnits = (lang, now) => startedWords({ lang, now });

/** Every word and phrase you know well, the first you met first: what the number counts. */
export const recalledUnits = (lang, now) => understoodUnits({ lang, now });

/** A word's paint: the art's own (sun, teal, violet, paper), the same for the word everywhere, standing for nothing. */
export const paintOf = (unit) => PAINTS[hashOf(unit) % PAINTS.length];


/**
 * The pile: every word you've started a tile in one 2D pile, the card the same size at any count: the box grows and the view pulls back. 50 words
 * are big tiles you read; 2,000 a great pile of small ones.
 *
 * Each visit drops the whole pile in from above the card. It's laid out anew (pile.js layOut) with a seed of its own and the words in an order of
 * their own, so no two visits make the same pile, then poured in over about half a second: each word
 * falling by the drop's law (pile.js sinkLaw) from its own height, a little sooner or later than its neighbors, turning as it comes, and never
 * landing before a word laid under it. Nothing of a pile is kept between visits, only which words were outlines last time, so a word you've come
 * to know well since fills in once it's down. With animations off, a pile laid out at random, still. A visit is the page coming into view, or
 * coming back to it from elsewhere; back from the card's own page (Your words) it's the same visit, the pile as it lay. The number counts the
 * words you know well (before any, every word started) from the first frame.
 *
 * Drawn on a canvas, each tile from a sheet drawn once; two fingers zoom in, and the words are drawn again at that size, so they read.
 */
// Which words were outlines last time (the sample learner's its own while it's on: study/sample-mode.js). The pile itself is never kept: before
// 9 Nov 2026 lx.know.pile.v2 kept where every tile lay, and it's taken off the device at the first visit since.
const OUTLINES = (lang) => sampleKey(`lx.know.pile.v3:${lang}`);
const OLD_PILE = (lang) => sampleKey(`lx.know.pile.v2:${lang}`);
const FRAME = 1000 / 60;
const turnOf = (a) => ((((-a + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI) - Math.PI / 2; // the same box, read the right way up
const readOutlines = (lang) => {
  try {
    const saved = JSON.parse(localStorage.getItem(OUTLINES(lang)) ?? "null");
    return new Set(Array.isArray(saved?.outlines) ? saved.outlines : []);
  } catch {
    return new Set();
  }
};
const FILL_MS = 600;
const POUR_FRAMES = 36; // the drop's words start falling over about this many frames (0.6 s), at random gaps
const SPIN = 0.8; // radians at most a word is turned from how it lands, as it starts to fall
// A seed no visit shares: never from the words.
const freshSeed = () => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
};
// The frames a fall of h takes by the law (the first frame it has sunk that far).
const framesTo = (law, h) => {
  let lo = 0;
  let hi = law.length - 1;
  if (law[hi] < h) return hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (law[mid] >= h) hi = mid;
    else lo = mid + 1;
  }
  return lo;
};

function pileIn(holder, { lang, rows, number, label, card }) {
  // Before you know any word well, the number is the words you've started (every tile on the pile), as Home's tile says (know/today.js); from
  // the first one known well on, the ones you know well.
  const knowsAny = rows.some((row) => row.known);
  const moves = motion.motionOn();
  holder.style.height = `${PILE_HEIGHT}px`;
  const faceOf = () => getComputedStyle(document.documentElement).getPropertyValue("--type-head").trim() || "sans-serif";
  const font = `700 ${TILE_FONT}px ${faceOf()}`;
  const measure = document.createElement("canvas").getContext("2d");

  // The tiles, in the order you met them: { id, i, name, w, paint, x, y, a, placed, filled, fill, fall, landsAt }. fill: when it starts filling in
  // (null: it's as it is). fall: { from, h, spin } on a visit's drop: h above its place when it starts to fall at `from`, turned by spin.
  const tiles = [];
  const byId = new Map();
  const tileOf = (id) => {
    let tile = byId.get(id);
    if (tile) return tile;
    const name = writtenName(id);
    tile = { id, i: tiles.length, name, w: Math.max(52, Math.ceil(measure.measureText(name).width + 2 * TILE_PAD)), paint: paintOf(id), x: 0, y: 0, a: 0, placed: false, filled: false, known: false, fill: null, fall: null, landsAt: 0 };
    tiles.push(tile);
    byId.set(id, tile);
    return tile;
  };
  // A word that was an outline last time comes in as one: known well now, it fills in once it's down. Any other comes in as it is now.
  const load = () => {
    try {
      localStorage.removeItem(OLD_PILE(lang));
    } catch {}
    const outlines = readOutlines(lang);
    for (const row of rows) tileOf(row.unit).filled = Boolean(row.known) && !outlines.has(row.unit);
  };
  const keep = () => {
    try {
      localStorage.setItem(OUTLINES(lang), JSON.stringify({ outlines: tiles.filter((tile) => !tile.filled).map((tile) => tile.id) }));
    } catch {}
  };
  // The number: the ones you know well (half filled in counts); before you know any well, every tile.
  let shown = -1;
  const showCount = (now = performance.now()) => {
    let n = 0;
    for (const tile of tiles) if (!knowsAny || (tile.filled && (tile.fill === null || now - tile.fill >= FILL_MS / 2))) n++;
    if (n === shown) return;
    shown = n;
    number.textContent = formatNumber(n);
    label.textContent = t(knowsAny ? "know.words.unit" : "know.words.startedUnit", { count: n });
    card?.setAttribute("aria-label", t(knowsAny ? "know.words.cardLabel" : "know.words.startedCardLabel", { count: n }));
  };
  // A press on the card opens its own page (Your words): back from it is the same visit.
  let toOwnPage = false;
  card?.addEventListener("click", () => (toOwnPage = true));

  let loaded = false;
  let built = "";
  let view = { s: 1, ox: 0, oy: 0 };
  let api = { again: () => {}, paint: () => {} };
  // When a visit's drop has begun, and when it's down (and which you know well worked out): the page's other cards wait for these (page.js).
  let moved;
  let rested;
  let moving;
  let free;
  const anew = () => {
    moving = new Promise((resolve) => (moved = resolve));
    free = new Promise((resolve) => (rested = resolve));
  };
  anew();
  const build = async () => {
    const W = Math.round(holder.clientWidth);
    const H = Math.round(holder.clientHeight);
    const size = `${W}x${H}`;
    if (!W || !H || built === size) return;
    const first = !built;
    built = size;
    // The face the tiles are measured and drawn in: waited for only when it isn't here yet.
    if (document.fonts && !document.fonts.check(font)) await document.fonts.load(font).catch(() => {});
    if (built !== size || !holder.isConnected) return;
    measure.font = font;
    if (!loaded) {
      loaded = true;
      load();
    }
    const live = () => built === size && holder.isConnected;
    const inner = W - 2 * INSET;
    const room = H - FLOOR;
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    const canvas = el("canvas", { class: "lx-pile-canvas", "aria-hidden": "true" });
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    holder.replaceChildren(canvas);
    const ctx = canvas.getContext("2d");
    const css = getComputedStyle(holder);
    const v = (name) => css.getPropertyValue(name).trim();
    const face = v("--type-head") || "sans-serif";
    const paints = {
      sun: { face: v("--art-sun"), deep: v("--art-sun-deep"), ink: v("--art-ink") },
      teal: { face: v("--art-teal"), deep: v("--art-teal-deep"), ink: v("--art-ink") },
      violet: { face: v("--art-violet"), deep: v("--art-violet-deep"), ink: v("--art-paper") },
      paper: { face: v("--art-paper"), deep: v("--art-paper-deep"), ink: v("--art-ink"), line: true },
    };
    // An outline tile is the page's ground inside its paint: the paint's tone that stands out on this ground (its face on a dark page, its deep
    // tone on a light one), so it's the same tile, quieter, never a second layer.
    const ground = v("--page-ground") || v("--canvas") || "#000";
    const probe = document.createElement("canvas").getContext("2d");
    probe.fillStyle = ground;
    probe.fillRect(0, 0, 1, 1);
    const [gr, gg, gb] = probe.getImageData(0, 0, 1, 1).data;
    const darkGround = (0.2126 * gr + 0.7152 * gg + 0.0722 * gb) / 255 < 0.5;

    const n = tiles.length;
    const average = tiles.reduce((sum, tile) => sum + tile.w * TILE_H, 0) / Math.max(1, n) / 0.75;
    const shape = { width: inner, average };
    const half = wallsOf(shape)(n);
    const topOf = (list) => list.reduce((top, tile) => Math.max(top, tile.y), 1);

    // A pile laid out: { seed, order, at }, the words in an order of the seed's own. On the page: 2,500 words take a few ms (about 12 on a phone
    // slowed 4×), so a visit's drop starts in the frame it comes into view.
    const lay = (seed) => {
      const random = seeded(seed ^ 0x9e3779b9);
      const order = tiles.slice();
      for (let k = order.length - 1; k > 0; k--) {
        const j = Math.floor(random() * (k + 1));
        [order[k], order[j]] = [order[j], order[k]];
      }
      return { seed, order, at: layOut({ tiles: order.map((tile) => ({ id: tile.id, w: tile.w, h: TILE_H })), half, seed }) };
    };

    // The view and the sheets, for the pile as it's laid: how far back (from its top), and every tile drawn once at that zoom, so a frame is copies.
    let z = 1;
    let sheets = null;
    const paintTile = (c, tile, px, outline = false) => {
      const w = tile.w;
      const p = paints[tile.paint];
      if (outline) {
        const tone = darkGround ? p.face : p.deep;
        c.beginPath();
        c.roundRect(-w / 2 + 1, -TILE_H / 2 + 1, w - 2, TILE_H - 2, 8);
        c.fillStyle = ground;
        c.fill();
        // Quieter, all of it: its outline and its word at three quarters.
        const was = c.globalAlpha;
        c.globalAlpha = was * 0.75;
        c.lineWidth = 2;
        c.strokeStyle = tone;
        c.stroke();
        if (TILE_FONT * px >= 6) {
          c.font = `700 ${TILE_FONT}px ${face}`;
          c.fillStyle = tone;
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText(tile.name, 0, 0);
        }
        c.globalAlpha = was;
        return;
      }
      c.beginPath();
      c.roundRect(-w / 2, -TILE_H / 2, w, TILE_H, 9);
      c.fillStyle = p.deep;
      c.fill();
      c.beginPath();
      c.roundRect(-w / 2, -TILE_H / 2, w, TILE_H - 3, 9);
      c.fillStyle = p.face;
      c.fill();
      if (p.line && px > 0.3 * dpr) {
        c.lineWidth = 1.5;
        c.strokeStyle = p.deep;
        c.beginPath();
        c.roundRect(-w / 2, -TILE_H / 2, w, TILE_H, 9);
        c.stroke();
      }
      if (TILE_FONT * px >= 6) {
        c.font = `700 ${TILE_FONT}px ${face}`;
        c.fillStyle = p.ink;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(tile.name, 0, -1.5);
      }
    };
    // Each tile on the sheets it's drawn from (filled, outline, or both while it fills in or empties): a year's pile drew twice what it showed.
    const onSheet = (tile, outline) => (outline ? !tile.filled || !tile.known : tile.filled || tile.known);
    // A sheet: every cell placed at once, each drawn later (paintSome, a few ms a frame in the drop's order: a year's pile is too much for one
    // frame on a phone slowed 4×), or there and then when its tile is on the screen first.
    const sheetFor = (outline) => {
      const k = z * dpr;
      const at = new Float32Array(tiles.length * 4);
      let x = 0;
      let y = 0;
      let line = 0;
      for (const tile of tiles) {
        if (!onSheet(tile, outline)) continue;
        const sw = Math.ceil((tile.w + 4) * k);
        const sh = Math.ceil((TILE_H + 4) * k);
        if (x + sw > 2048) {
          x = 0;
          y += line;
          line = 0;
        }
        at.set([x, y, sw, sh], tile.i * 4);
        x += sw;
        line = Math.max(line, sh);
      }
      const art = document.createElement("canvas");
      art.width = 2048;
      art.height = Math.max(1, y + line);
      return { art, at, c: art.getContext("2d"), k, outline, drawn: new Uint8Array(tiles.length) };
    };
    const paintCell = (sheet, tile) => {
      const o = tile.i * 4;
      sheet.c.setTransform(sheet.k, 0, 0, sheet.k, sheet.at[o] + sheet.at[o + 2] / 2, sheet.at[o + 1] + sheet.at[o + 3] / 2);
      paintTile(sheet.c, tile, sheet.k, sheet.outline);
      sheet.drawn[tile.i] = 1;
    };
    // The cells still to draw: { order, next }, null once every one is.
    let painting = null;
    const newSheets = (order) => {
      sheets = { filled: sheetFor(false), outline: sheetFor(true) };
      painting = { order, next: 0 };
    };
    const paintSome = (budget) => {
      if (!painting) return;
      const t0 = performance.now();
      while (painting.next < painting.order.length) {
        const tile = painting.order[painting.next++];
        for (const sheet of [sheets.filled, sheets.outline]) if (sheet.at[tile.i * 4 + 2] && !sheet.drawn[tile.i]) paintCell(sheet, tile);
        if (performance.now() - t0 > budget) return;
      }
      painting = null;
    };
    // A pile laid: every tile at its place, at rest, and the view and sheets for it (drawn again only when the view changes).
    let pileSeed = 0;
    const place = ({ seed, order, at }) => {
      pileSeed = seed;
      for (const tile of tiles) {
        [tile.x, tile.y, tile.a] = at[tile.id];
        tile.placed = true;
        tile.fall = null;
      }
      const next = viewOf(n, shape, topOf(tiles));
      if (!sheets || Math.abs(next - z) > 1e-6) {
        z = next;
        newSheets(order);
      }
    };
    // How a tile is drawn now: [outline?, opacity] layers: filled; an outline; or filling in, the filled tile coming in over its outline.
    const layersOf = (tile, now) => {
      if (!tile.filled) return [[true, 1]];
      if (tile.fill === null) return [[false, 1]];
      const p = Math.min(1, Math.max(0, (now - tile.fill) / FILL_MS));
      const e = 1 - (1 - p) ** 3;
      return e >= 1 ? [[false, 1]] : e <= 0 ? [[true, 1]] : [[true, 1], [false, e]];
    };
    // One tile at (x, y, a) in full-size px, in the view as it is: a copy from the sheet, or, zoomed in, drawn again at that size.
    const put = (tile, x, y, a, now) => {
      const sx = INSET + inner / 2 + x * z;
      const sy = room - y * z;
      const X = view.ox + (sx - view.ox) * view.s;
      const Y = view.oy + (sy - view.oy) * view.s;
      const reach = (tile.w / 2 + 4) * z * view.s;
      if (X < -reach || X > W + reach || Y < -reach || Y > H + reach) return;
      const k = dpr * z * view.s;
      ctx.setTransform(k, 0, 0, k, dpr * X, dpr * Y);
      ctx.rotate(turnOf(a));
      for (const [outline, alpha] of layersOf(tile, now)) {
        ctx.globalAlpha = alpha;
        const from = outline ? sheets.outline : sheets.filled;
        if (view.s === 1 && from.at[tile.i * 4 + 2]) {
          if (!from.drawn[tile.i]) paintCell(from, tile);
          const o = tile.i * 4;
          const sw = from.at[o + 2] / k;
          const sh = from.at[o + 3] / k;
          ctx.drawImage(from.art, from.at[o], from.at[o + 1], from.at[o + 2], from.at[o + 3], -sw / 2, -sh / 2, sw, sh);
        } else paintTile(ctx, tile, k, outline);
      }
      ctx.globalAlpha = 1;
    };

    // Where a tile is now: on its fall, by the law; else at rest. null: not on the screen yet (above the card, or not laid).
    let law = null;
    const where = (tile, now) => {
      if (!tile.placed) return null;
      const fall = tile.fall;
      if (fall) {
        const f = Math.floor((now - fall.from) / FRAME);
        if (f < 0) return null;
        const left = f < law.length ? fall.h - law[f] : 0;
        if (left > 0) return { x: tile.x, y: tile.y + left, a: tile.a + fall.spin * (left / fall.h) };
        tile.fall = null;
      }
      return tile;
    };
    // A check can ask for every frame's drawn tiles (globalThis.__lxPileFrames, an array): each tile's box on the screen, [x, y, a, w, h] in
    // CSS px, with the walls and the pile's seed (scripts' overlap and drop probes).
    const draw = (now) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const record = Array.isArray(globalThis.__lxPileFrames) && view.s === 1 ? [] : null;
      if (sheets)
        for (const tile of tiles) {
          const p = where(tile, now);
          if (!p) continue;
          put(tile, p.x, p.y, p.a, now);
          record?.push(INSET + inner / 2 + p.x * z, room - p.y * z, p.a, tile.w * z, TILE_H * z);
        }
      if (record) globalThis.__lxPileFrames.push({ t: Math.round(now), boxes: Float32Array.from(record), walls: [INSET, W - INSET, 0, room], seed: pileSeed });
    };
    // Busy: words on their way down, filling in, or cells still to draw.
    const busy = (now) => Boolean(painting) || tiles.some((tile) => tile.fall || (tile.fill !== null && now - tile.fill < FILL_MS));
    const SLICE = 6; // ms a frame of drawing cells
    let holdDraw = !moves;

    // The frames: one loop while anything moves.
    let looping = false;
    let knownDone = false;
    const tick = (now) => {
      if (!live()) return (looping = false);
      paintSome(SLICE);
      // A pile that doesn't fall (animations off, or laid again for a new size) is drawn once every cell is (never in pieces).
      if (!holdDraw || !painting) draw(now);
      showCount(now);
      if (busy(now)) return requestAnimationFrame(tick);
      looping = false;
      atRest();
    };
    const kick = () => {
      if (looping) return;
      looping = true;
      requestAnimationFrame(tick);
    };
    // Down: which words were outlines kept.
    const atRest = () => {
      holder.dataset.pile = knownDone ? "ready" : "resting";
      if (!knownDone) return;
      rested();
      keep();
    };

    // The drop: from above the card, every word at a gap of the seed's own after the one before (about POUR_FRAMES in all), from a height of
    // its own, turned a little; none landing before the word laid before it, which may be under it.
    const pour = (order, seed, from) => {
      law = sinkLaw({ z, drop: true });
      const random = seeded(seed ^ 0x85ebca6b);
      const rise = riseOf({ z, height: room });
      const lift = liftOf(topOf(tiles), z);
      const gap = (2 * POUR_FRAMES) / Math.max(1, order.length);
      let start = 0;
      let landed = Number.NEGATIVE_INFINITY;
      for (const tile of order) {
        start += gap * random();
        const h = rise + lift * tile.y + random() * 0.25 * rise;
        let begins = from + start * FRAME;
        const lands = begins + framesTo(law, h) * FRAME;
        if (lands < landed) begins += landed - lands;
        tile.fall = { from: begins, h, spin: (random() * 2 - 1) * SPIN };
        tile.landsAt = begins + framesTo(law, h) * FRAME;
        landed = tile.landsAt;
      }
    };

    // Which words you know well, read from the word index (before the sheets are drawn, so each tile is drawn for what it shows), then shown: one
    // you've come to know well since last time fills in once it's down (at once with animations off), one you no longer do goes back to its
    // outline. A tile the sheets haven't got as it now shows draws them again.
    const readKnown = () => {
      const now = Date.now();
      for (const tile of tiles) tile.known = isUnderstood(tile.id, { lang, now });
    };
    const learn = () => {
      const at = performance.now();
      let filling = 0;
      let redraw = false;
      for (const tile of tiles) {
        if (tile.known === tile.filled) continue;
        tile.filled = tile.known;
        tile.fill = tile.known && moves ? Math.max(at, tile.fall ? tile.landsAt : at) + Math.min(FILL_MS, filling++ * 20) : null;
        if (sheets && !(tile.filled ? sheets.filled : sheets.outline).at[tile.i * 4 + 2]) redraw = true;
      }
      if (redraw) newSheets(tiles);
      knownDone = true;
      showCount();
    };

    // A visit: the pile laid out anew and dropped in (still, with animations off). Its own work is two tasks, each well under a long task on a
    // phone slowed 4× (all of it in one was 50 ms on a year's pile, its first visit): laid out and what you know read as it comes into view;
    // placed, its sheets made, its drop planned and begun in the next frame, while the words would still be above the card. Each part is
    // measured (lx-pile-visit, for scripts/pile-drop-check.mjs). A newer visit, or the card laid out again, before the second drops it.
    let visit = 0;
    const comeIn = (lay) => {
      const mine = ++visit;
      knownDone = false;
      holdDraw = !moves;
      let begun = performance.now();
      const laid = lay();
      readKnown();
      performance.measure?.("lx-pile-visit", { start: begun, end: performance.now(), detail: "laid" });
      requestAnimationFrame(() => {
        if (mine !== visit) return;
        // Laid out again meanwhile (turned, resized): that pile lies at rest in its place, and the page's other cards needn't wait for this drop.
        if (!live()) return moved();
        begun = performance.now();
        place(laid);
        if (moves) {
          pour(laid.order, laid.seed, performance.now());
          holder.dataset.pile = "moving";
        }
        moved();
        learn();
        performance.measure?.("lx-pile-visit", { start: begun, end: performance.now(), detail: "dropped" });
        kick();
      });
    };

    // The pile's space, ready and empty, before anything comes; resized (turned, the sidebar), the pile laid out again for its new walls, at rest.
    draw(performance.now());
    showCount();
    holder.dataset.pile = first ? "waiting" : "ready";
    if (!first) {
      readKnown();
      place(lay(freshSeed()));
      holdDraw = true;
      knownDone = true;
      kick();
    }
    // Scrolled away from it (a link opened the page at another card), nothing of it moves for now: the page's other cards needn't wait.
    const away = ({ boundingClientRect: box, rootBounds: root }) => Boolean(root) && (box.bottom < root.top || box.top > root.bottom);
    let arrived = !first;
    const arrive = new IntersectionObserver(
      (entries) => {
        if (arrived) return arrive.disconnect();
        if (!entries.some((entry) => entry.isIntersecting)) {
          if (entries.some(away)) {
            moved();
            rested();
          }
          return;
        }
        arrived = true;
        arrive.disconnect();
        comeIn(() => lay(freshSeed()));
      },
      { threshold: 0, rootMargin: "0px 0px -96px 0px" },
    );
    arrive.observe(holder);

    api = {
      paint: () => draw(performance.now()),
      // Coming back to the page: a new visit, a new pile dropped in; back from Your words, the same visit, the pile as it lay, and which you know
      // well looked at again. (A word new since, or one gone, draws the card again: page.js.)
      again: () => {
        const own = toOwnPage;
        toOwnPage = false;
        if (!arrived) return;
        if (own) {
          readKnown();
          learn();
          kick();
          return;
        }
        anew();
        comeIn(() => lay(freshSeed()));
      },
    };
  };
  new ResizeObserver(build).observe(holder);
  zoomable(holder, (next) => {
    view = next;
    api.paint();
  });
  return {
    again: () => api.again(),
    get moving() {
      return moving;
    },
    get free() {
      return free;
    },
  };
}

/**
 * Two fingers on the pile zoom into it (a trackpad's pinch too), about where they are, up to 4×, the words drawn again at that size; letting go
 * springs it back. A tap that wasn't a pinch still reaches the card. apply({ s, ox, oy }): the view, s times about (ox, oy) in the pile's px.
 */
function zoomable(holder, apply) {
  const points = new Map();
  let start = null;
  let zoom = 1;
  let origin = [0, 0];
  let pinched = false;
  let back = 0;
  let queued = 0;
  const set = (s) => {
    zoom = s;
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      apply({ s: zoom, ox: origin[0], oy: origin[1] });
    });
  };
  const release = () => {
    if (zoom === 1) return;
    if (!motion.motionOn()) return set(1);
    const from = zoom;
    const begun = performance.now();
    const step = (time) => {
      const p = Math.min(1, (time - begun) / 320);
      set(p >= 1 ? 1 : from + (1 - from) * (1 - (1 - p) ** 3));
      if (p < 1) back = requestAnimationFrame(step);
    };
    back = requestAnimationFrame(step);
  };
  holder.addEventListener("pointerdown", (event) => {
    points.set(event.pointerId, [event.clientX, event.clientY]);
    if (points.size === 1) pinched = false;
    if (points.size === 2) {
      cancelAnimationFrame(back);
      const [[ax, ay], [bx, by]] = [...points.values()];
      const box = holder.getBoundingClientRect();
      start = { distance: Math.hypot(ax - bx, ay - by) / zoom };
      if (zoom === 1) origin = [(ax + bx) / 2 - box.left, (ay + by) / 2 - box.top];
      pinched = true;
    }
  });
  holder.addEventListener("pointermove", (event) => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, [event.clientX, event.clientY]);
    if (points.size !== 2 || !start) return;
    const [[ax, ay], [bx, by]] = [...points.values()];
    set(Math.min(4, Math.max(1, Math.hypot(ax - bx, ay - by) / start.distance)));
  });
  const up = (event) => {
    points.delete(event.pointerId);
    if (points.size < 2) {
      start = null;
      release();
    }
  };
  holder.addEventListener("pointerup", up);
  holder.addEventListener("pointercancel", up);
  // A trackpad's pinch arrives as a wheel with ctrl held: in while it moves, back once it stops.
  let idle = 0;
  holder.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      cancelAnimationFrame(back);
      const box = holder.getBoundingClientRect();
      if (zoom === 1) origin = [event.clientX - box.left, event.clientY - box.top];
      set(Math.min(4, Math.max(1, zoom * Math.exp(-event.deltaY / 100))));
      pinched = true;
      clearTimeout(idle);
      idle = setTimeout(release, 450);
    },
    { passive: false },
  );
  // The card's press: not when it was a pinch.
  holder.closest("a")?.addEventListener(
    "click",
    (event) => {
      if (!pinched) return;
      pinched = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}

/**
 * Your words: every word and phrase you've started as a tile in the pile, the first you met at the bottom; the ones you know well filled in
 * their paint, the rest a quieter outline in it, filling in as you come to know them. The ones this page hasn't shown you yet fall onto it as
 * you come to it. The number is how many you know well. The whole card opens them all (#know/words). rows: word-index.js startedWords.
 */
export function wordsCard({ lang, rows = startedWords({ lang }) }) {
  // A check can ask for a pile of a given size (globalThis.__lxPileSize: its first n words), to look at a size no sample learner has.
  if (Number.isInteger(globalThis.__lxPileSize)) rows = rows.slice(0, globalThis.__lxPileSize);
  // Before you know any word well the card counts the words started (pileIn), as Home's tile does.
  const knowsAny = rows.some((row) => row.known);
  const number = el("span", { class: "lx-know-n" }, formatNumber(0));
  const label = el("span", { class: "lx-know-label" }, t(knowsAny || !rows.length ? "know.words.unit" : "know.words.startedUnit", { count: 0 }));
  const head = [el("span", { class: "lx-know-stat" }, number, symbol("recall-q", { size: 30 })), label];
  if (!rows.length) {
    return el("section", { part: "know-card", "data-card": "words", id: "know-words", "data-empty": "" }, el("span", { class: "lx-pile-head" }, ...head), ui.emptyState(t("know.words.none"), { pose: "page" }));
  }
  const holder = el("span", { part: "word-pile", "aria-hidden": "true" });
  const link = el("a", { part: "know-card", id: "know-words", href: "#know/words", "aria-label": knowsAny ? t("know.words.cardLabel", { count: rows.filter((row) => row.known).length }) : t("know.words.startedCardLabel", { count: rows.length }) }, el("span", { class: "lx-pile-head" }, ...head), holder);
  const card = el("div", { class: "lx-words-card", "data-card": "words" }, link);
  piles.set(card, pileIn(holder, { lang, rows, number, label, card: link }));
  return card;
}

const piles = new WeakMap();
/** Coming back to the Knowledge page: the Words card's pile settles again (when it can; nothing when animations are off). */
export function settleAgain(card) {
  piles.get(card)?.again();
}
/**
 * When the Words card's pile has begun its way in (moving), and when it's first at rest (free): what the page's other cards wait for, so
 * nothing holds up its frames. Resolved at once for a card with no pile.
 */
export const pileMoving = (card) => piles.get(card)?.moving ?? Promise.resolve();
export const pileFree = (card) => piles.get(card)?.free ?? Promise.resolve();

