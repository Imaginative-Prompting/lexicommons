// Page mode's engine, readersound's "Pages v2/v3" (its docs/design.md): the chapter stays one flow of word spans, and a
// page is a window onto it. Pagination is a measuring pass over where the words already sit; showing page n moves
// the flow up by that page's top, with covers hiding the lines either side of it. The turn is the Play Books curl:
// the page you hold folds back along a line, its back shown mirrored and faded, the real next page beneath.
//
// The rules, from readersound:
// - The line is the atom: a page ends on a whole line, never a cut word or half a line. Lines whose painted boxes
//   touch fold into one atom, so whatever makes a line tall (a gloss over a word) can't be sliced.
// - A paragraph that ends within the last B lines of a full page ends the page there (B = 11% of the page's lines,
//   1 to 3). A scene break within 2B lines pulls the page's end to just after it. A chapter starts a fresh page (it's
//   paginated on its own), its heading and the text under it together.
// - A picture book's page starts a fresh page too, its picture over its text. A picture, and each block of a book's
//   credits, is a block ("atom": data-atom): it's never cut, and it goes on whichever page it fits.
// - Pagination is a pure function of the chapter, the text size and the page's size.
// - The curl: what you grab is the right edge at your finger's height, and after a quick fly-in it is your finger,
//   x one to one and y damped to 0.4. Paper physics keeps it within reach of the left edge. On release the fold
//   flattens first. A turn commits past the middle (back: pulled in half a page) or on a flick with 60 px of travel.

/**
 * The pages of the mounted chapter. words: the chapter's word spans in order (null for none); flow: their container
 * (positioned, so offsetTop is measured from it); pageH: the page's height. Returns [{ a, b, top, h }] where a and b
 * are the first and last word's position in `words`, top the page's y in the flow, h its height.
 */
export function paginate(flow, words, pageH) {
  let lines = [];
  let line = null;
  for (let k = 0; k < words.length; k++) {
    const node = words[k];
    if (!node) continue;
    const top = node.offsetTop;
    const height = node.offsetHeight;
    // A hidden word (a flipped sentence's other words) rides the line of the word that carries it.
    if (!height) {
      if (line) line.b = k;
      continue;
    }
    // A word taller than most of a page (a whole sentence shown in the language you're learning, its line under it): its own
    // lines, each still whole, so a page can end between them and none of it is cut off at the page's foot.
    if (height > pageH * 0.9) {
      const rows = linesOf(node, flow);
      if (rows.length > 1) {
        if (line) lines.push(line);
        line = null;
        rows.forEach(([rowTop, rowBottom], part) => lines.push({ top: rowTop, bottom: rowBottom, a: k, b: k, over: 0, part, lastPart: part === rows.length - 1 }));
        continue;
      }
    }
    if (!line || Math.abs(top - line.top) > 3) {
      if (line) lines.push(line);
      line = { top, bottom: top + height, a: k, b: k, over: 0 };
    } else {
      line.b = k;
      line.bottom = Math.max(line.bottom, top + height);
    }
  }
  if (line) lines.push(line);
  // Blocks that aren't words (a picture, the credits): each a line of its own. A picture goes with the words after it
  // (its page's), the credits after the last word; one that starts a book's page starts a page.
  const index = new Map(words.map((node, k) => [node, k]));
  for (const block of flow.querySelectorAll("[data-atom]")) {
    let k = words.length;
    for (let next = block.nextElementSibling; next; next = next.nextElementSibling) {
      const first = next.matches(".lx-w") ? next : next.querySelector(".lx-w");
      if (first && index.has(first)) {
        k = index.get(first);
        break;
      }
    }
    const top = block.offsetTop;
    lines.push({ top, bottom: top + block.offsetHeight, a: k, b: k - 1, over: 0, block, pageStart: block.hasAttribute("data-page-start") });
  }
  if (!lines.length || pageH < 60) return [];

  // Anything painted above a word's box (a gloss) lifts its line's top, so a cut can't slice through it.
  for (const rt of flow.querySelectorAll("rt")) {
    const word = rt.closest(".lx-w");
    const k = word ? words.indexOf(word) : -1;
    if (k < 0) continue;
    const over = word.getBoundingClientRect().top - rt.getBoundingClientRect().top;
    if (over <= 0) continue;
    const owner = lines.find((L) => k >= L.a && k <= L.b);
    if (owner) owner.over = Math.max(owner.over, over + 1);
  }
  lines.sort((x, y) => x.top - y.top);
  // Atoms may not overlap: lines whose painted extents touch become one.
  const packed = [];
  for (const L of lines) {
    const p = packed[packed.length - 1];
    if (p && !L.block && !p.block && L.top - L.over < p.bottom - 0.5) {
      const top = Math.min(p.top - p.over, L.top - L.over);
      p.a = Math.min(p.a, L.a);
      p.b = Math.max(p.b, L.b);
      p.top = Math.min(p.top, L.top);
      p.bottom = Math.max(p.bottom, L.bottom);
      p.over = p.top - top;
      continue;
    }
    packed.push(L);
  }
  lines = packed;
  // The chapter's opening heading (with its title line, if it has one) starts the first page with room above it.
  // A heading further in (a section of a chapter) is just more lines: only chapters start fresh pages, and each
  // chapter is paginated on its own.
  const firstWord = words.findIndex(Boolean);
  for (const L of lines) {
    if (L.block) {
      L.paraEnd = true;
      L.headStart = false;
      L.para = L.block;
      continue;
    }
    const para = words[L.a].parentElement;
    const next = words[L.b + 1];
    // (A tall word's lines: only its first can start a page fresh, only its last end a paragraph.)
    const first = !L.part;
    L.paraEnd = (L.part == null || L.lastPart) && (!next || next.parentElement !== para);
    L.headStart = first && L.a === firstWord && para.getAttribute("data-part") === "reader-heading" && !lines.some((B) => B.block && B.pageStart && B.a === L.a);
    // A book's page with no picture starts at its first paragraph.
    L.pageStart = first && para.hasAttribute("data-page-start") && L.a === index.get(para.querySelector(".lx-w"));
    L.para = para;
  }
  const topOf = (j) => lines[j].top - lines[j].over;

  // Scene breaks sit between lines; each is glued to the line above it. So is a sentence's English beside the book (reader-parallel,
  // reader.js besideParts): a page's edge falls after it, never in it, so a sentence's last line and its English are on one page
  // (7 Nov: the edge fell mid-gap, the middle of the English, and a page ended on half of it with the next line's tops cut).
  const glued = (selector) => {
    const after = new Map();
    for (const block of flow.querySelectorAll(selector)) {
      const top = block.offsetTop;
      let k = -1;
      for (let j = 0; j < lines.length; j++) {
        if (lines[j].bottom <= top + 2) k = j;
        else break;
      }
      if (k >= 0) after.set(k, { top, bottom: Math.max(after.get(k)?.bottom ?? 0, top + block.offsetHeight) });
    }
    return after;
  };
  const sceneAfter = glued('[data-part="reader-scene"]');
  const gluedAfter = glued('[data-part="reader-scene"], [data-part="reader-parallel"]');

  const marginTop = (L) => parseFloat(getComputedStyle(L.para).marginTop) || 24;
  // Where a new page has to start: a chapter's heading, a book's page.
  const fresh = (j) => lines[j].headStart || lines[j].pageStart;
  // Where a page starting at line k begins.
  const boundary = (k) => {
    if (k <= 0) return Math.max(0, lines[0].headStart ? topOf(0) - marginTop(lines[0]) * 0.85 : topOf(0) - 10);
    if (k >= lines.length) return lines[lines.length - 1].bottom + 10;
    if (lines[k].headStart) return Math.max(lines[k - 1].bottom + 4, topOf(k) - marginTop(lines[k]) * 0.85);
    if (lines[k].pageStart) return Math.max(lines[k - 1].bottom + 4, topOf(k) - 8);
    // The atoms never overlap, so the middle of the gap is whitespace; a scene break or a line's English goes with the page above.
    const scene = gluedAfter.get(k - 1);
    const lo = lines[k - 1].bottom;
    const hi = topOf(k);
    const mid = scene ? (scene.bottom + hi) / 2 : (lo + hi) / 2;
    return hi < lo ? lo : Math.max(lo, Math.min(hi, mid));
  };

  const pages = [];
  let s = 0;
  while (s < lines.length) {
    const top = boundary(s);
    let e = s;
    while (e + 1 < lines.length && !fresh(e + 1) && boundary(e + 2) - top <= pageH) e++;
    if (e + 1 < lines.length && !fresh(e + 1)) {
      // A full page: a scene break near its end, else a paragraph's end, ends it early.
      const B = Math.max(1, Math.min(3, Math.round((e - s + 1) * 0.11)));
      let cut = -1;
      for (let k = e; k >= Math.max(s, e - 2 * B + 1); k--) {
        if (sceneAfter.has(k)) {
          cut = k;
          break;
        }
      }
      if (cut < 0) {
        for (let k = e; k >= Math.max(s, e - B + 1); k--) {
          if (lines[k].paraEnd) {
            cut = k;
            break;
          }
        }
      }
      if (cut >= s) e = cut;
    }
    // A page's words a..b (a page of only credits: a past the chapter's last word, b before it).
    const a = Math.min(...lines.slice(s, e + 1).map((L) => L.a));
    const b = Math.max(a - 1, ...lines.slice(s, e + 1).filter((L) => !L.block).map((L) => L.b));
    pages.push({ a, b, top, h: boundary(e + 1) - top, first: lines[s].block ?? words[lines[s].a], last: lines[e].block ?? words[lines[e].b] });
    s = e + 1;
  }
  return pages;
}

// ---------- spreads: two pages side by side (landscape and wide screens) ----------

/** Whether a reader of this size shows two pages side by side: readersound's landscape-or-wide rule (at least 700 px
 * wide and wider than tall by 5%), applied to the reader's own box, so a small reader on a big screen stays single. */
export const spreadFits = (width, height) => width >= 700 && width * 20 >= height * 21;

/**
 * The spreads of the mounted chapter, readersound's spread engine: the flow is set in two fixed-height columns
 * (column-fill auto, so the columns past the first two lie to the right), and a spread is a pair of columns, shown by
 * moving the flow left by its x. A word's column comes from where the words restart at the top (they only go down a
 * column), never from dividing its x, which drifts at some zooms. Hidden words ride their carrier's column.
 * pin ({ w, side }, from spreadPin) keeps word w on the side of the gutter it was on (0 left, 1 right) across a
 * re-layout: if the columns would put it on the other side, the chapter opens on a lone right-hand page instead, as
 * printed books do. Returns [{ a, b, x, top: 0, h, rs }] (rs: the first word right of the gutter, or null).
 */
export function paginateSpread(flow, words, pageH, pin = null) {
  if (pageH < 60) return [];
  flow.style.height = `${pageH}px`;
  // A right-to-left flow sets its columns from the right, so x is measured from the right edge (a column's x is its
  // rightmost line start), and the reader moves the flow right to show a spread. Everything else is the same.
  const rtl = getComputedStyle(flow).direction === "rtl";
  // A column and the gap after it (the gap is the CSS's: two side margins, so it reads as two facing margins).
  const stride = (flow.clientWidth + (parseFloat(getComputedStyle(flow).columnGap) || 0)) / 2;
  const cols = [];
  let prevTop = Infinity;
  // Words and blocks (a picture, the credits) in the order they're laid out; a column of only credits holds no words.
  const index = new Map(words.map((node, k) => [node, k]));
  let para = null;
  for (const node of flow.querySelectorAll(".lx-w, [data-atom]")) {
    const k = index.get(node);
    const isBlock = node.hasAttribute("data-atom");
    if (k == null && !isBlock) continue;
    if (!node.offsetHeight) {
      if (cols.length && k != null) cols[cols.length - 1].b = k;
      continue;
    }
    const top = node.offsetTop;
    const left = rtl ? flow.clientWidth - node.offsetLeft - node.offsetWidth : node.offsetLeft;
    // A book's page (its picture, or its text when the picture has a page to itself) always starts a column, whatever
    // the height it lands at.
    const starts = isBlock ? node.hasAttribute("data-page-start") : node.parentElement !== para && node.parentElement.hasAttribute("data-page-start");
    if (!isBlock) para = node.parentElement;
    if (!cols.length || prevTop - top > 20 || starts) cols.push({ a: k ?? null, b: k ?? null, minLeft: left });
    else {
      const col = cols[cols.length - 1];
      if (k != null) {
        if (col.a == null) col.a = k;
        col.b = k;
      }
      col.minLeft = Math.min(col.minLeft, left);
    }
    prevTop = top;
  }
  // A column with no words (a picture on a page of its own, a blank page, the credits) holds the next word's place.
  for (let c = cols.length - 1, next = words.length; c >= 0; c--) {
    if (cols[c].a == null) [cols[c].a, cols[c].b] = [next, next - 1];
    else next = cols[c].a;
  }
  if (!cols.length) return [];
  // A column's x is its leftmost line start. A column of only indented or centered lines (verse, a heading) starts
  // further in than its edge, so it's never taken past one stride on from the column before.
  cols.forEach((col, c) => (col.x = Math.min(col.minLeft, c ? cols[c - 1].x + stride : 0)));
  let parity = 0;
  if (pin && pin.side != null) {
    const c = cols.findIndex((col) => pin.w >= col.a && pin.w <= col.b);
    if (c >= 0) parity = (c - pin.side) & 1;
  }
  const spreads = [];
  let c = 0;
  if (parity) {
    // A lone right-hand page first: the left half of the spread is blank.
    spreads.push({ a: cols[0].a, b: cols[0].b, x: cols[0].x - stride, top: 0, h: pageH, rs: cols[0].a });
    c = 1;
  }
  for (; c < cols.length; c += 2) {
    const right = cols[c + 1];
    spreads.push({ a: cols[c].a, b: (right ?? cols[c]).b, x: cols[c].x, top: 0, h: pageH, rs: right ? right.a : null });
  }
  return spreads;
}

/** What a re-layout keeps in place: word w (a position in the chapter's words) on the side it was on, page being
 * the page or spread showing (a single page counts as the left side, so a turn to landscape opens on its word). */
export function spreadPin(page, w) {
  if (!page) return null;
  return { w, side: page.rs != null && w >= page.rs ? 1 : 0 };
}

/** The page holding word k (a position in the chapter's words). Pages that start at k itself (a picture's own page and its
 * text's; a sentence taller than a page, over several): the first of them. */
export function pageOf(pages, k) {
  let lo = 0;
  let hi = pages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pages[mid].a <= k) lo = mid;
    else hi = mid - 1;
  }
  while (lo > 0 && pages[lo].a === k && pages[lo - 1].a === k) lo--;
  return lo;
}

/** A word's line boxes in the flow's own coordinates (as offsetTop measures, a page's move and a zoom divided out):
 * [[top, bottom]] by line, its text and what's inside it (a reading over a word is a row of its own). */
function linesOf(node, flow) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const box = flow.getBoundingClientRect();
  const scale = flow.offsetHeight ? box.height / flow.offsetHeight : 1;
  const rows = [];
  for (const r of range.getClientRects()) {
    if (!r.width || !r.height) continue;
    const top = (r.top - box.top) / scale;
    const bottom = (r.bottom - box.top) / scale;
    const row = rows.find((x) => Math.abs(x[0] - top) <= 3);
    if (row) row[1] = Math.max(row[1], bottom);
    else rows.push([top, bottom]);
  }
  return rows.sort((x, y) => x[0] - y[0]);
}

// ---------- the curl ----------

// The rectangle W×H cut by the fold line (through M, normal n), on the corner's side or the other.
function clipHalf(W, H, M, n, cornerSide) {
  const corners = [[0, 0], [W, 0], [W, H], [0, H]];
  const sign = cornerSide ? 1 : -1;
  const d = (p) => sign * ((p[0] - M.x) * n.x + (p[1] - M.y) * n.y);
  const out = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const da = d(a);
    const db = d(b);
    if (da >= 0) out.push(a);
    if (da > 0 !== db > 0) {
      const t = da / (da - db);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out.length ? `polygon(${out.map((p) => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(",")})` : "polygon(0px 0px,0px 0px,0px 0px)";
}

/**
 * The turning sheet for a page: copies of its paragraphs, clipped to exactly the page's band so no neighboring line
 * rides along, as a front (the page, cut along the fold) and a back (the same page mirrored across the fold, faded).
 * layer: the turn layer (fixed over the reader, the pointer passes through it); page: from paginate() or
 * paginateSpread(); flow and text:
 * the reader's flow and scroller. Returns { setFold(C0, F) }: C0 where the grabbed point rests, F where it is now.
 */
export function curlLayers(layer, { page, flow, text, root }) {
  layer.replaceChildren();
  const r = root.getBoundingClientRect();
  const textRect = text.getBoundingClientRect();
  const flowRect = flow.getBoundingClientRect();
  const padTop = parseFloat(getComputedStyle(text).paddingTop) || 0;
  const band = document.createElement("div");
  band.className = "lx-turn-band";
  band.style.top = `${textRect.top - r.top + padTop}px`;
  band.style.height = `${page.h}px`;
  const inner = document.createElement("div");
  inner.className = "lx-turn-inner";
  inner.style.left = `${flowRect.left - r.left}px`;
  inner.style.top = `${-page.top}px`;
  inner.style.width = `${flowRect.width}px`;
  inner.style.fontSize = getComputedStyle(text).fontSize;
  // A right-to-left book's copy reads the way its page does: its paragraphs and columns right to left, its font.
  inner.lang = text.lang;
  if (text.getAttribute("dir") === "rtl") inner.setAttribute("dir", "rtl");
  // Each block copied as itself, with the live block it copies (set where its words are, below).
  let placed = [];
  if (page.x != null) {
    // A spread: a paragraph split across two columns has no one place to copy it to, so the copy is the whole
    // chapter's flow, set in the same columns, moved to show this spread the way the real flow is. The band is the
    // text's box, which clips the flow's other columns as the text does.
    const textLeft = textRect.left - r.left;
    band.style.left = `${textLeft}px`;
    band.style.width = `${textRect.width}px`;
    // Where the flow sits with no spread showing (its own transform moves it to the spread showing now).
    const transform = getComputedStyle(flow).transform;
    const shown = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
    inner.setAttribute("data-part", "reader-text");
    // A right-to-left flow shows a spread moved right (paginateSpread's x is from the right edge).
    const along = getComputedStyle(flow).direction === "rtl" ? page.x : -page.x;
    inner.style.left = `${flowRect.left - shown - r.left - textLeft + along}px`;
    inner.style.top = `${flowRect.top - textRect.top - padTop}px`;
    inner.style.padding = "0";
    const copy = flow.cloneNode(true);
    copy.style.transform = "none";
    copy.style.margin = "0";
    inner.append(copy);
  } else {
    // A block (a picture, the credits) is copied as itself; a word, by its paragraph. A highlight's ✦ follows the block
    // its last word is in, so the last block's come too.
    let node = page.first.hasAttribute?.("data-atom") ? page.first : page.first.parentElement;
    placed = [];
    const last = page.last.hasAttribute?.("data-atom") ? page.last : page.last.parentElement;
    const isMark = (n) => n?.getAttribute("data-part") === "reader-note-mark";
    let past = false;
    while (node) {
      if (!node.classList.contains("lx-reader-cover") && !node.hidden) {
        const copy = node.cloneNode(true);
        copy.removeAttribute("id");
        copy.style.position = "absolute";
        copy.style.margin = "0";
        copy.style.left = `${node.offsetLeft}px`;
        copy.style.top = `${node.offsetTop}px`;
        // (Its width as laid out, not offsetWidth's whole pixels: a line could break elsewhere.)
        copy.style.width = `${node.getBoundingClientRect().width}px`;
        inner.append(copy);
        placed.push([node, copy]);
      }
      if (node === last) past = true;
      node = node.nextElementSibling;
      if (past && !isMark(node)) break;
    }
  }
  band.append(inner);
  const front = document.createElement("div");
  front.className = "lx-turn-front";
  front.append(band);
  layer.append(front);
  // Each copy where its words are on the page, not only where its box is: a block's first line can hang out of its box, as a picture book's
  // title does with its help over it (the English of its first line's words, in the margin over the title), and a copy set with no margin
  // made room for that inside instead, its words 11 px lower. Moved by whole pixels only: the copies sit at offsetTop's whole pixels, where
  // their words are drawn on the same device pixels as the page's, and a fraction moved them a device pixel or three (Alice's page, against
  // a page drawn the same before). Measured now, the live page still the one copied and nothing painted between (the layer shown only to be
  // measured); the sheet's back is cloned from this.
  if (placed.length) {
    const hidden = layer.hidden;
    layer.hidden = false;
    const at = inner.getBoundingClientRect();
    const firstLine = (block) => {
      const range = document.createRange();
      range.selectNodeContents(block);
      return [...range.getClientRects()].find((line) => line.height > 0.5) ?? block.getBoundingClientRect();
    };
    for (const [node, copy] of placed) {
      const live = firstLine(node);
      const drawn = firstLine(copy);
      const dy = Math.round(live.top - flowRect.top - (drawn.top - at.top));
      const dx = Math.round(live.left - flowRect.left - (drawn.left - at.left));
      if (dy) copy.style.top = `${parseFloat(copy.style.top) + dy}px`;
      if (dx) copy.style.left = `${parseFloat(copy.style.left) + dx}px`;
    }
    layer.hidden = hidden;
  }
  const back = document.createElement("div");
  back.className = "lx-turn-back";
  back.append(band.cloneNode(true));
  const shade = document.createElement("div");
  shade.className = "lx-turn-shade";
  back.append(shade);
  layer.append(back);
  const W = r.width;
  const H = r.height;
  return {
    front,
    setFold(C0, F) {
      const dx = C0.x - F.x;
      const dy = C0.y - F.y;
      const len = Math.hypot(dx, dy);
      if (len < 2) {
        front.style.clipPath = "none";
        back.style.display = "none";
        return;
      }
      const n = { x: dx / len, y: dy / len };
      const M = { x: (C0.x + F.x) / 2, y: (C0.y + F.y) / 2 };
      front.style.clipPath = clipHalf(W, H, M, n, false);
      back.style.display = "block";
      back.style.clipPath = clipHalf(W, H, M, n, true);
      // The reflection across the fold (det −1, so the copy mirrors itself, like the back of a sheet).
      const a = 1 - 2 * n.x * n.x;
      const b = -2 * n.x * n.y;
      const d = 1 - 2 * n.y * n.y;
      const k = M.x * n.x + M.y * n.y;
      back.style.transform = `matrix(${a},${b},${b},${d},${2 * k * n.x},${2 * k * n.y})`;
      // The crease: darkest at the fold, fading into the flap.
      const proj = [[0, 0], [W, 0], [W, H], [0, H]].map((p) => p[0] * n.x + p[1] * n.y);
      const lo = Math.min(...proj);
      const hi = Math.max(...proj);
      const at = Math.max(0, Math.min(1, (k - lo) / (hi - lo || 1))) * 100;
      const angle = (Math.atan2(n.x, -n.y) * 180) / Math.PI;
      shade.style.background = `linear-gradient(${angle.toFixed(1)}deg, transparent ${(at - 2).toFixed(1)}%, rgba(0,0,0,.42) ${at.toFixed(1)}%, transparent ${(at + 22).toFixed(1)}%)`;
    },
  };
}

/**
 * A turn in progress, driven by a finger (move/end) or by itself (auto). W and H: the reader's size; y0: the height
 * the page was grabbed at (null: the bottom); dir 1 forward, −1 back. setFold from curlLayers; onDone(commit) once
 * the sheet has gone (or been put back). animate: false skips the fly-in and the ending (Animations off).
 */
export function turnSession({ W, H, y0, dir, setFold, onDone, animate = true }) {
  // The grabbed point: the right edge at the finger's height. Forward it starts there; back it starts off the left.
  const P0 = { x: W, y: y0 == null ? H : Math.max(0, Math.min(H, y0)) };
  const cur = { x: dir === 1 ? W : -W, y: P0.y };
  const target = { ...cur };
  // The fly-in to the finger is an animation, so with animations off the sheet is under the finger at once.
  let flying = animate;
  let ending = null;
  let frame = 0;
  let backstop = 0;
  let over = false;

  const draw = () => {
    // Paper physics: the point stays within reach of the left edge at its height and of the two left corners.
    const f = { x: cur.x, y: cur.y };
    const within = (c, radius) => {
      const ddx = f.x - c.x;
      const ddy = f.y - c.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist > radius) {
        f.x = c.x + (ddx / dist) * radius;
        f.y = c.y + (ddy / dist) * radius;
      }
    };
    within({ x: 0, y: P0.y }, W);
    within({ x: 0, y: 0 }, Math.hypot(W, P0.y));
    within({ x: 0, y: H }, Math.hypot(W, H - P0.y));
    setFold(P0, f);
  };
  const done = (commit) => {
    if (over) return;
    over = true;
    cancelAnimationFrame(frame);
    clearTimeout(backstop);
    onDone(commit);
  };
  // Only the fly-in and the ending animate: while the finger moves, the sheet is exactly under it.
  const tick = () => {
    if (over) return;
    if (flying || ending) {
      cur.x += (target.x - cur.x) * 0.35;
      // On release the fold flattens first (y twice as fast), so nothing swings across on the way out.
      cur.y += (target.y - cur.y) * (ending ? 0.65 : 0.35);
      if (Math.hypot(cur.x - target.x, cur.y - target.y) < 6) {
        if (ending) return done(ending.commit);
        flying = false;
        cur.x = target.x;
        cur.y = target.y;
      }
      draw();
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  draw();

  return {
    dir,
    get ending() {
      return Boolean(ending);
    },
    move(fx, fy) {
      if (ending || over) return;
      target.x = fx;
      target.y = P0.y + 0.4 * (fy - P0.y);
      if (flying) {
        cur.x += (target.x - cur.x) * 0.5;
        cur.y += (target.y - cur.y) * 0.5;
        if (Math.hypot(cur.x - target.x, cur.y - target.y) < 6) flying = false;
      } else {
        cur.x = target.x;
        cur.y = target.y;
      }
      draw();
    },
    /** The finger let go: vx its speed (px/ms, smoothed), travel how far it went sideways. */
    end(vx, travel) {
      if (ending || over) return;
      const flick = travel > 60;
      const commit = dir === 1 ? cur.x < W * 0.5 || (vx < -0.5 && flick) : cur.x > -W * 0.5 || (vx > 0.5 && flick);
      if (!animate) return done(commit);
      target.x = commit === (dir === 1) ? -W : W;
      target.y = P0.y;
      ending = { commit };
      // A tab that stops drawing frames still finishes the turn.
      backstop = setTimeout(() => done(commit), 700);
    },
    /** A turn nobody holds (a tap, a key): straight through. */
    auto() {
      this.end(dir === 1 ? -9 : 9, 1e4);
    },
    /** Ends it now, as it would have ended (a press finishes every animation). */
    finish() {
      if (over) return;
      if (ending) done(ending.commit);
    },
    cancel() {
      done(false);
    },
    /** Stops it without a word (the chapter under it is being rebuilt). */
    drop() {
      over = true;
      cancelAnimationFrame(frame);
      clearTimeout(backstop);
    },
  };
}
