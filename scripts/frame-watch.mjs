// A check that can see what a person sees move. Everything else here looks at a screen once it has settled, and a screen can
// settle right after doing something ugly: a matched pair left behind for a third of a second, then snapping to where the rest
// of the grid already went. This records what's on the screen on every animation frame and finds the frames where it broke.
//
// install(page) puts a recorder in the page before its code runs. Nothing in the app changes, and it presses nothing.
// A track is one thing a person sees: a real element, or the ghost drawn for it (motion.js), since a pressable thing that
// moves is drawn by a copy on the ghost layer while the real one sits unseen at its destination. So a track follows the
// ghost while there is one and the real element once it's shown again, and the moment that hands over is one of the moments that
// can snap.
//
// What it flags, each with its frame, what moved and how far:
// - teleport: a visible thing jumps in one frame, with no motion in the frames either side of it, and stays there;
// - left-behind: members of one group make the same move at different times (a pair of tiles still where the grid was, then
//   snapping up). It's the same teleport, late, and the report says who went first and by how many frames;
// - disappear: a visible thing goes unseen for a few frames and comes back, or is replaced by the same thing after a gap (not while its
//   own page is off the screen: tabs pressed in quick turns take a page away and bring it back);
// - flash-empty: a part with words in it shows none for a few frames, or a container goes blank, then fills;
// - reflow: a thing's text is the same but its size changes in a frame (a font landing, a line wrapping mid-move);
// - scroll-jump: a scroller's position changes in a frame with no press or wheel that asked for it, while it's on the screen;
// - focus-loss: the field being typed in loses focus with nothing pressed;
// - state-flicker: a thing's state goes A, B and back to A within four frames (not when each flip comes as the page shown changes: a tab's own
//   state as tabs are pressed in quick turns);
// - long-frame: a frame that took over 100 ms while something was moving.
// settled(page) looks at a screen at rest: off the screen, under a bar, cut off, overlapping words, a control a press wouldn't reach.
// strays(page) gives the words only code prints (null, undefined, NaN, [object Object], Invalid Date, a whole true or false), in any
// text, in what a label says or a field holds, the moment they're put on the page, seen or not: they can come and go between looks.
// With them, what the interface's words show when one is missing (lx/i18n.js t(): ⟦key⟧, a value not given as {name}) and a key written
// where its words should be (core.retry), anywhere; and every problem t() has logged since the last look (i18nProblems()), seen or not.
//
// Candidates, not verdicts: look at every one, frame by frame (frames(), sheet()).
//
// Used by scripts/frame-check.mjs (the walk), and validated by its --plant stages: a check nobody has seen fail proves nothing.

const RECORDER = ({ strayPattern, i18nPattern, contentParts }) => {
  if (window.__fw) return;
  const ids = new WeakMap();
  let nextId = 1;
  const idOf = (node) => {
    let id = ids.get(node);
    if (!id) {
      id = nextId++;
      ids.set(node, id);
    }
    return id;
  };
  const state = { frames: [], marks: [], on: false, inputs: [], meta: new Map() };

  // Words only code prints. A word the language being learned really has (German's null, in a tile with its lang) and a phrase in
  // a part that holds language (a gloss's "null and void") are real words; "undefined" alone in a gloss is a gloss that's missing.
  const strayWord = new RegExp(strayPattern);
  const i18nWord = i18nPattern ? new RegExp(i18nPattern) : null;
  const strayFound = [];
  const strayKnown = new Set();
  let lastChange = 0;
  const NOT_WORDS = "script, style, noscript, template, textarea, [contenteditable]";
  const SPOKEN = ["aria-label", "aria-description", "aria-valuetext", "placeholder", "title", "alt"];
  const isStray = (raw, host) => {
    const text = raw.trim();
    if (!text) return false;
    // What t() shows for something missing, or a key in place of its words: never a real word, wherever it is.
    if (i18nWord?.test(text)) return true;
    const whole = /^(?:true|false)$/.test(text);
    if (!whole && !strayWord.test(text)) return false;
    if (/\[object /.test(text)) return true;
    const language = host.closest("[lang]");
    const inLanguage = language && language !== document.documentElement;
    if (whole) return !(inLanguage || host.closest(contentParts));
    if (inLanguage && /\bnull\b/i.test(text) && !/undefined|NaN|Infinity|Invalid Date/.test(text)) return false;
    if (/\s/.test(text) && host.closest(contentParts)) return false;
    return true;
  };
  const noteStray = (raw, host, how) => {
    if (!host || host.closest(NOT_WORDS) || !isStray(raw, host)) return;
    const part = host.closest("[data-part]")?.getAttribute("data-part") ?? host.tagName.toLowerCase();
    const key = `${raw.trim().slice(0, 80)}|${part}|${how}|${location.hash}`;
    if (strayKnown.has(key)) return;
    strayKnown.add(key);
    strayFound.push({ text: raw.trim().slice(0, 80), part, how, hash: location.hash || location.pathname, around: (host.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 90) });
  };
  const lookAtAttributes = (element) => {
    for (const name of SPOKEN) if (element.hasAttribute?.(name)) noteStray(element.getAttribute(name), element, name);
  };
  const lookAt = (root) => {
    if (root.nodeType === Node.TEXT_NODE) return noteStray(root.data, root.parentElement, "text");
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) lookAtAttributes(root);
    const words = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (words.nextNode()) noteStray(words.currentNode.data, words.currentNode.parentElement, "text");
    root.querySelectorAll?.(SPOKEN.map((name) => `[${name}]`).join()).forEach(lookAtAttributes);
  };
  new MutationObserver((records) => {
    lastChange = performance.now();
    for (const record of records) {
      if (record.type === "characterData") lookAt(record.target);
      else if (record.type === "attributes") lookAtAttributes(record.target);
      else record.addedNodes.forEach(lookAt);
    }
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: SPOKEN });
  const WATCHED = "[data-part], button, a[href], input, textarea, select, h1, h2, h3, h4, p";
  const LOUD_PARTS = new Set(["character", "skeleton"]); // Their own insides move by design.

  const textOf = (node) => (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const inMoving = (node) => node.closest?.("[data-part='character'], lx-tinta, svg");

  /** Effective opacity all the way up (a fade on a parent is a fade on this). */
  function seenOpacity(node) {
    let o = 1;
    for (let n = node; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none") return 0;
      if (n === node && s.visibility === "hidden") return 0;
      o *= Number(s.opacity);
      if (o === 0) return 0;
    }
    return o;
  }

  // Layers a transform animation has moved (document.getAnimations()), kept while they're on the page: the compositor moves them between the
  // frames sampled here, so analyze judges what's in one against its layer's own move. (Kept after their animation ends: a part judged against
  // a layer that didn't move is judged against the screen, as before.)
  const layers = new Set();
  const movesByTransform = (animation) => {
    try {
      return animation.effect.getKeyframes().some((k) => k.transform != null || k.translate != null);
    } catch {
      return false;
    }
  };

  function snap() {
    const vw = innerWidth;
    const vh = innerHeight;
    for (const animation of document.getAnimations()) {
      const target = animation.effect?.target;
      if (animation.playState === "running" && target?.isConnected && movesByTransform(animation)) layers.add(target);
    }
    for (const node of layers) if (!node.isConnected) layers.delete(node);
    // Innermost first: a part's layer is the deepest one it's in.
    const depth = (node) => {
      let d = 0;
      for (let n = node; n; n = n.parentElement) d++;
      return d;
    };
    const layerList = [...layers].sort((a, b) => depth(b) - depth(a));
    const layerOf = (node) => {
      for (const layer of layerList) if (layer.contains(node)) return layer;
      return null;
    };
    // The screen's size, so a move that takes a thing past its edge can be told from one that stays (analyze's teleports). And the pages in the
    // page area this frame (shell/main.js draws each into a host of its own, .lx-view, and takes one that leaves out of the document, keeping
    // it): a part of a page that isn't here is off the screen with its page, not gone from one that's on it (analyze's disappear, state-flicker).
    const PAGE_HOST = '[data-part="page"] > .lx-view';
    const pages = [...document.querySelectorAll(PAGE_HOST)].filter((host) => !host.hidden).map(idOf);
    const frame = { t: performance.now(), wall: Date.now(), e: [], scroll: [], focus: null, vw, vh, layers: {}, pages };
    for (const layer of layerList) {
      const r = layer.getBoundingClientRect();
      frame.layers[idOf(layer)] = [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10];
    }
    // A full-screen layer hides what's under it, once its fade lets it be seen: fading in (a session's start, motion.appear from nothing), what's
    // under shows through it and its own words aren't seen yet. Hidden from the layer's first frame, a page read as wordless that never was. Its
    // opacity and its box: a layer kept out of sight another way still covers, as frame-check's blank-flash plant has it.
    const layer = document.querySelector('[data-part="session"]:not([data-ghost]), [data-part="reader"]:not([data-ghost])');
    let fade = 1;
    for (let n = layer; n && n !== document.documentElement; n = n.parentElement) fade *= Number(getComputedStyle(n).opacity);
    const full = layer && fade >= 0.5 ? layer : null;
    // Only where it is: a layer still coming up from below the screen (a session's cover rising, or held below it while its first step draws)
    // hides only what's under its own box; the page above it is still in sight.
    const cover = full?.getBoundingClientRect() ?? null;
    const under = (r) => r.top >= cover.top - 1 && r.bottom <= cover.bottom + 1 && r.left >= cover.left - 1 && r.right <= cover.right + 1;
    for (const node of document.querySelectorAll(WATCHED)) {
      if (inMoving(node) && !node.matches("[data-part='character']")) continue;
      const r = node.getBoundingClientRect();
      if (full && !full.contains(node) && !node.closest('[data-motion-layer], [data-part="sheet"], [data-part="sheet-layer"], [data-part="toast"], [data-part="word-popover"]') && under(r)) continue;
      if (!r.width && !r.height) continue;
      if (r.bottom < -40 || r.top > vh + 40 || r.right < -40 || r.left > vw + 40) continue;
      const id = idOf(node);
      if (!state.meta.has(id)) {
        const part = node.getAttribute("data-part") ?? node.tagName.toLowerCase();
        state.meta.set(id, { id, part, ghost: node.closest("[data-ghost]") ? true : false, parent: node.parentElement ? idOf(node.parentElement) : 0, born: frame.t, leaf: !node.querySelector(WATCHED) });
      }
      const meta = state.meta.get(id);
      meta.text = textOf(node);
      const o = seenOpacity(node);
      const cs = getComputedStyle(node);
      const layer = layerOf(node);
      const host = node.closest(PAGE_HOST);
      frame.e.push([id, Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10, Math.round(o * 100) / 100, parseFloat(cs.fontSize), node.getAttribute("data-state") ?? "", node.closest("[data-motion-hidden]") ? 1 : 0, meta.text, layer ? idOf(layer) : 0, host ? idOf(host) : 0]);
    }
    // What a page's picture shows (shell/page-slide.js: a slide's two pages, the page under a swipe, the page that left held while the next one
    // composes) is words on the screen too: its copy lives in a closed shadow root that the walk above can't see, and a screen showing it isn't blank.
    frame.pw = 0;
    for (const shot of document.querySelectorAll("[data-page-picture]")) {
      const root = shot.lxRoot;
      if (!root || seenOpacity(shot) < 0.5) continue;
      const box = shot.getBoundingClientRect();
      for (const n of root.querySelectorAll(WATCHED)) {
        if (n.querySelector(WATCHED) || !textOf(n)) continue;
        const r = n.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < Math.max(0, box.top) || r.top > Math.min(vh, box.bottom) || r.right < Math.max(0, box.left) || r.left > Math.min(vw, box.right)) continue;
        frame.pw++;
      }
    }
    for (const node of document.querySelectorAll("[data-part='activity'], [data-part='page'], [data-part='sheet-body'], main, html")) {
      // (With whether it's on the screen at all: a page slid off it under a swipe's picture is put where it'll be seen, unseen.)
      if (node.scrollHeight > node.clientHeight + 1) {
        const box = node.getBoundingClientRect();
        const seen = box.right > 0 && box.left < vw && box.bottom > 0 && box.top < vh && seenOpacity(node) >= 0.05;
        frame.scroll.push([idOf(node), node.getAttribute("data-part") ?? node.tagName.toLowerCase(), Math.round(node.scrollTop), seen ? 1 : 0]);
      }
    }
    const a = document.activeElement;
    if (a && a !== document.body && a.matches("input, textarea")) frame.focus = idOf(a);
    // A press now on each control on top: does it land? (Only while a press could matter: the top layer's controls.)
    const top = document.querySelector('[data-part="sheet"]:not([hidden]):not([data-state="closed"])') ?? document.querySelector('[data-part="session"]:not([data-ghost])') ?? document.querySelector('[data-part="reader"]') ?? document.body;
    let tested = 0;
    for (const c of top.querySelectorAll('button, a[href], input, textarea, select, summary')) {
      if (tested >= 28) break;
      if (c.closest("[data-ghost], [data-motion-layer], [inert], [hidden]") || c.disabled) continue;
      const r = c.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx >= vw || cy >= vh) continue;
      let scroller = c.parentElement;
      while (scroller && !["auto", "scroll", "hidden"].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
      if (scroller && scroller !== document.documentElement && scroller !== document.body) {
        const box = scroller.getBoundingClientRect();
        if (cy < box.top || cy > box.bottom || cx < box.left || cx > box.right) continue;
      }
      tested++;
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit !== c && !c.contains(hit) && !hit.contains(c) && !hit.closest("[data-part='character'], lx-tinta") && !(c.matches("input, textarea") && hit.closest("button, a"))) {
        (frame.blocked ??= []).push([idOf(c), (c.getAttribute("data-part") ?? c.tagName.toLowerCase()), textOf(c).slice(0, 24), hit.getAttribute("data-part") ?? hit.tagName.toLowerCase()]);
      }
    }
    return frame;
  }

  // Each frame read as it's painted: after its animation-frame callbacks and its ResizeObserver notices too (a part fitted in one, as the header's
  // title is), from a message posted in the frame's rAF, which runs once that frame's rendering is done. Read in rAF itself, a part fitted in the
  // same frame's notices was read unfitted, and showed as a one-frame jump that was never painted (7 Nov 2026, the header's centered title).
  const after = new MessageChannel();
  after.port1.onmessage = () => {
    if (!state.on) return;
    state.frames.push(snap());
    requestAnimationFrame(tick);
  };
  function tick() {
    if (!state.on) return;
    after.port2.postMessage(0);
  }

  // What the person did, so a scroll or a focus change that follows one isn't blamed on the app.
  for (const type of ["pointerdown", "pointerup", "click", "keydown", "wheel", "touchstart", "touchmove", "touchend"]) {
    addEventListener(type, (event) => {
      if (!state.on) return;
      const target = event.target instanceof Element ? event.target.closest("[data-part], button, a") ?? event.target : null;
      state.inputs.push({ t: performance.now(), type, part: target?.getAttribute?.("data-part") ?? target?.tagName?.toLowerCase() ?? "", text: target ? textOf(target).slice(0, 30) : "", x: event.clientX ?? null, y: event.clientY ?? null });
    }, { capture: true, passive: true });
  }

  window.__fw = {
    start() {
      state.frames = [];
      state.inputs = [];
      state.marks = [];
      state.on = true;
      requestAnimationFrame(tick);
    },
    stop() {
      state.on = false;
      const frames = state.frames;
      const out = { frames, inputs: state.inputs, marks: state.marks, meta: [...state.meta.values()] };
      state.frames = [];
      return out;
    },
    mark(label) {
      state.marks.push({ t: performance.now(), label });
    },
    /** The stray words since the last time this was asked, with a look at everything now (a field's value changes unseen). */
    strays() {
      lookAt(document);
      document.querySelectorAll("input:not([type=hidden]), select").forEach((field) => noteStray(field.value ?? "", field, "value"));
      return strayFound.splice(0);
    },
    /** Resolves once nothing has been put on the page for `ms`, or after `longest`. */
    async quiet(ms = 150, longest = 1500) {
      const t0 = performance.now();
      while (performance.now() - t0 < longest && performance.now() - Math.max(lastChange, t0) < ms) await new Promise((r) => setTimeout(r, 30));
    },
  };
};

// What code prints when it forgets something. Lowercase nan and Nan are left out (Min Nan is a language; a nan is a grandmother).
export const STRAY_WORDS = String.raw`(?:^|[\s(:,;./—–-])(?:null|Null|undefined|Undefined|NaN|-?Infinity|Invalid Date)(?=$|[\s).:,;%/—–-])|\[object \w+\]`;
// The interface's keys by family (lx/i18n.js englishEntries: core, welcome, language, …), read from this copy's own English so a new family is
// looked for once it's there; a copy from before i18n.js looks for the first three.
let KEY_FAMILIES = ["core", "welcome", "language"];
try {
  const { englishEntries } = await import(new URL("../public/js/lx/i18n.js", import.meta.url));
  KEY_FAMILIES = [...new Set(englishEntries().map((entry) => entry.key.split(".")[0]))];
} catch {}
// What t() shows when something's missing: ⟦key⟧ for a key the English doesn't have, {name} for a value it wasn't given; and a bare key
// (core.retry), which t() never shows, so someone wrote the key where t() should have been.
export const I18N_STRAYS = String.raw`⟦[^⟧\n]{1,80}⟧|\{[A-Za-z_][A-Za-z0-9_]{0,40}\}|(?:^|[\s(“"'])(?:${KEY_FAMILIES.join("|")})\.[A-Za-z0-9][\w-]*(?:\.[\w-]+)*(?=$|[\s).,;:!?”"'])`;
// The parts that hold language rather than the app's own words.
const CONTENT_PARTS = ["literal-chunk", "literal-line", "word-meaning", "word-card", "word-popover", "word-senses", "reader-text", "reader-gloss", "reader-literal", "reader-note", "reader-preview", "reader-sentence", "reader-title", "sentence-card", "sentence-row", "translate-result", "tile", "match-item", "fill-sentence", "place-sentence", "place-word", "book-tile"].map((part) => `[data-part="${part}"]`).join();

export async function install(page) {
  await page.addInitScript(RECORDER, { strayPattern: STRAY_WORDS, i18nPattern: I18N_STRAYS, contentParts: CONTENT_PARTS });
}

// The stray words since the last look, and what t() logged since then (lx/i18n.js i18nProblems(): a missing key or value, seen or not; the
// module the app imported, by its own address).
export const strays = (page) =>
  page.evaluate(async () => {
    const found = window.__fw?.strays() ?? [];
    try {
      const problems = (await import("/js/lx/i18n.js")).i18nProblems();
      for (const problem of problems.slice(window.__fwI18nSeen ?? 0)) found.push({ text: problem, part: "i18n", how: "t()", hash: location.hash || location.pathname, around: "" });
      window.__fwI18nSeen = problems.length;
    } catch {}
    return found;
  });
export const quiet = (page, ms, longest) => page.evaluate(([ms, longest]) => window.__fw?.quiet(ms, longest), [ms, longest]);

export const start = (page) => page.evaluate(() => window.__fw.start());
export const mark = (page, label) => page.evaluate((label) => window.__fw?.mark(label), label);
export const stop = (page) => page.evaluate(() => window.__fw.stop());

// ---------- from frames to candidates ----------

const JUMP = 4; // px in one frame, with stillness either side: nothing eased moves like that
const STILL = 0.75; // px per frame that counts as not moving
const SKIP_PARTS = new Set(["character", "skeleton"]);
// The containers of a thing that moves. A group is the nearest of these, so a grid's tiles are one group.
const SEEN = 0.5;
const BARS = new Set(["answer-bar", "session-bar", "tab-bar", "sheet", "app-header", "progress-step"]);

/**
 * Tracks from raw frames: real elements by id, and each ghost joined to the hidden real element it stands for (same part and
 * words, the nearest on its first frame). A track's position each frame is the ghost's while one is drawn.
 */
export function tracks(run) {
  const meta = new Map(run.meta.map((m) => [m.id, m]));
  const out = new Map(); // key -> { key, part, text, parent, at: [{ f, x, y, w, h, o, fs, state, src }] }
  const ghostOwner = new Map(); // ghost id -> real id
  run.frames.forEach((frame, f) => {
    const realById = new Map();
    for (const row of frame.e) {
      const m = meta.get(row[0]);
      if (m && !m.ghost) realById.set(row[0], row);
    }
    // Who each ghost stands for, on its first frame: a hidden real thing with the same part and words, nearest first; else a free
    // ghost (a thing leaving, whose real one is already gone) that's a track of its own.
    for (const row of frame.e) {
      const m = meta.get(row[0]);
      if (!m?.ghost || ghostOwner.has(row[0])) continue;
      let best = null;
      let dist = Infinity;
      for (const [id, real] of realById) {
        const rm = meta.get(id);
        if (rm.part !== m.part || real[9] !== row[9]) continue;
        if (!real[8] && real[5] > 0 && m.part !== rm.part) continue;
        const d = Math.hypot(real[1] - row[1], real[2] - row[2]);
        if (real[8] && d < dist) {
          best = id;
          dist = d;
        }
      }
      ghostOwner.set(row[0], best ?? `g${row[0]}`);
    }
    const drawnBy = new Map(); // real id -> the ghost's row this frame
    for (const row of frame.e) {
      const owner = ghostOwner.get(row[0]);
      if (owner !== undefined && owner !== null && typeof owner === "number") {
        const prior = drawnBy.get(owner);
        if (!prior) drawnBy.set(owner, row);
      }
    }
    for (const row of frame.e) {
      const m = meta.get(row[0]);
      if (!m) continue;
      const owner = ghostOwner.get(row[0]);
      if (m.ghost && typeof owner === "number") continue; // drawn into its real one's track, below
      const key = m.ghost ? owner : row[0];
      if (!out.has(key)) out.set(key, { key, id: row[0], part: m.part, text: row[9], parent: m.parent, ghost: Boolean(m.ghost), at: [] });
      const track = out.get(key);
      const ghost = drawnBy.get(row[0]);
      const use = ghost ?? row;
      // (Its page: the real thing's, a ghost being in no page.)
      track.at.push({ f, x: use[1], y: use[2], w: use[3], h: use[4], o: ghost ? ghost[5] : row[8] ? 0 : use[5], fs: use[6], state: row[7], text: row[9], by: ghost ? "ghost" : "real", layer: use[10] ?? 0, page: m.ghost ? 0 : row[11] ?? 0 });
    }
  });
  return { tracks: [...out.values()], meta };
}

const nearInput = (run, t, ms = 120) => run.inputs.some((input) => Math.abs(input.t - t) < ms);

/** Every candidate in a recording. Each says which frame, what, and how far. */
export function analyze(run, { label = "", scrolled = false } = {}) {
  const { frames } = run;
  const found = [];
  // scrolled: this recording scrolled the page itself, so what scrolling does isn't a finding.
  const add = (kind, f, detail) => {
    if (scrolled && ["scroll-jump", "press-blocked", "teleport", "left-behind"].includes(kind)) return;
    found.push({ kind, label, frame: f, at: Math.round(frames[f]?.t ?? 0), wall: frames[f]?.wall ?? 0, ...detail });
  };
  const { tracks: all, meta } = tracks(run);
  // The pages in the page area each frame (snap's pages). A part whose own page is out of it through a gap went with its page (a tab pressed
  // while another tab's page shows, a page opened over it and left): the person went elsewhere, nothing went missing. Only through the whole
  // gap: a part unseen while its page is there is still gone from it. (A recording from before pages were noted has none: nothing is excused.)
  const pagesIn = frames.map((frame) => (frame.pages ? new Set(frame.pages) : null));
  const pageOut = (page, from, to) => {
    if (!page || from >= to) return false;
    for (let f = from; f < to; f++) if (!pagesIn[f] || pagesIn[f].has(page)) return false;
    return true;
  };
  // A frame where the pages shown changed from the frame before (a tab or a page coming in), or the frame either side of it.
  const pagesKey = (f) => (pagesIn[f] ? [...pagesIn[f]].sort((a, b) => a - b).join(",") : null);
  const turned = (f) => f > 0 && pagesIn[f] && pagesIn[f - 1] && pagesKey(f) !== pagesKey(f - 1);
  const pageTurn = (f) => turned(f - 1) || turned(f) || turned(f + 1);

  // Moves, per track: the frames where it jumped.
  const moves = new Map(); // track key -> [{ f, dx, dy, by }]
  for (const track of all) {
    if (SKIP_PARTS.has(track.part)) continue;
    // A container draws little itself; what's in it is judged on its own (a grid can move while its tiles glide).
    if (!meta.get(track.id)?.leaf && !BARS.has(track.part)) continue;
    const list = [];
    for (let i = 1; i < track.at.length; i++) {
      const a = track.at[i - 1];
      const b = track.at[i];
      if (b.f !== a.f + 1 || a.o < SEEN || b.o < SEEN) continue;
      if (a.text !== b.text && !BARS.has(track.part)) continue; // new words, centered anew: not a move
      // A ghost starting its move starts where the move starts: only a ghost handing back to the real thing can snap.
      if (a.by === "real" && b.by === "ghost") continue;
      // Several tiles with the same words (yours and the right order's): the join by words can't tell them apart at a handover.
      if (a.by !== b.by && all.filter((other) => other.part === track.part && other.text === track.text).length > 1) continue;
      if (a.by === "ghost" && b.by === "ghost" && all.filter((other) => other.part === track.part && other.text === track.text).length > 1) continue;
      // A bar changing under the old one's ghost sliding away isn't seen to.
      if (a.by === "real" && b.by === "real" && BARS.has(track.part) && run.frames[b.f].e.some((row) => row[0] !== track.id && meta.get(row[0])?.ghost && meta.get(row[0])?.part === track.part)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.hypot(dx, dy) < JUMP) continue;
      // In a layer a transform animation moves (the same one in both frames): what the layer moved is the compositor's slide, seen in samples
      // far apart when the main thread is slow; only a move apart from it is this part's own.
      const layer = a.layer && a.layer === b.layer ? a.layer : 0;
      const la = layer ? run.frames[a.f].layers?.[layer] : null;
      const lb = layer ? run.frames[b.f].layers?.[layer] : null;
      if (la && lb && Math.hypot(dx - (lb[0] - la[0]), dy - (lb[1] - la[1])) < JUMP) continue;
      if (track.part === "progress-step" && Math.hypot(dx, dy) < 9) continue; // making room for one more: a few px across many
      if (track.part === "place-gap" && b.w < 10) continue; // a closed gap draws nothing
      const before = track.at[i - 2];
      const after = track.at[i + 1];
      const pre = before && before.f === a.f - 1 ? Math.hypot(a.x - before.x, a.y - before.y) : 0;
      const post = after && after.f === b.f + 1 ? Math.hypot(after.x - b.x, after.y - b.y) : 0;
      if (pre > STILL * 2 && pre > Math.hypot(dx, dy) * 0.25) continue;
      if (post > STILL * 2 && post > Math.hypot(dx, dy) * 0.25) continue;
      // Still before and after has to be seen. A thing not recorded the frame before its move (over 40 px past the screen's edge then), that a
      // step back at the same speed would put off the screen, came onto it; one not recorded the frame after, that a step on puts off the screen,
      // went off it. Their moves go on where they can't be seen: a sheet sliding away takes its lowest row past the foot, and one coming up brings
      // a row on that holds as a press turns it back; both once read as that row jumping (Choose the games, 5 Nov). Something new that jumps on
      // the screen is still a teleport.
      const offScreen = (p, f) => {
        const frame = run.frames[f];
        return Boolean(frame?.vh) && (p.y >= frame.vh || p.y + p.h <= 0 || p.x >= frame.vw || p.x + p.w <= 0);
      };
      const cameOn = !(before && before.f === a.f - 1) && offScreen({ x: a.x - dx, y: a.y - dy, w: a.w, h: a.h }, a.f);
      const wentOff = !(after && after.f === b.f + 1) && offScreen({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }, b.f);
      if (cameOn || wentOff) continue;
      list.push({ f: b.f, dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10, by: a.by === b.by ? b.by : `${a.by}→${b.by}`, from: [a.x, a.y], to: [b.x, b.y] });
    }
    if (list.length) moves.set(track.key, list);
  }

  // Group-level: the same move made at different frames by parts of one group. A track's group is its parent.
  const byKey = new Map(all.map((t) => [t.key, t]));
  const groups = new Map();
  for (const [key, list] of moves) {
    const track = byKey.get(key);
    for (const move of list) {
      if (!groups.has(track.parent)) groups.set(track.parent, []);
      groups.get(track.parent).push({ key, track, ...move });
    }
  }
  const explained = new Set();
  for (const [parent, list] of groups) {
    list.sort((a, b) => a.f - b.f);
    const first = list[0];
    const same = list.filter((m) => Math.abs(m.dy - first.dy) < 3 && Math.abs(m.dx - first.dx) < 3);
    const late = same.filter((m) => m.f - first.f >= 2);
    const onTime = same.filter((m) => m.f - first.f < 2);
    if (late.length && onTime.length) {
      add("left-behind", late[0].f, {
        what: `${late.map((m) => `"${m.track.text}"`).join(", ")} (${first.track.part}) moved ${first.dy.toFixed(0)}px ${late[0].f - first.f} frames after ${onTime.length} of its group`,
        part: first.track.part,
        firstFrame: first.f,
        lateFrames: late[0].f - first.f,
        dy: first.dy,
        dx: first.dx,
        by: late[0].by,
      });
      for (const m of same) explained.add(`${m.key}:${m.f}`);
    }
  }

  // Teleports: everything else that jumped. Reported once per part and frame, with how many went together.
  const perFrame = new Map();
  for (const [key, list] of moves) {
    const track = byKey.get(key);
    for (const move of list) {
      if (explained.has(`${key}:${move.f}`)) continue;
      const k = `${move.f}:${Math.round(move.dx)}:${Math.round(move.dy)}`;
      if (!perFrame.has(k)) perFrame.set(k, { f: move.f, dx: move.dx, dy: move.dy, by: move.by, parts: [] });
      perFrame.get(k).parts.push(`${track.part}${track.text ? ` "${track.text.slice(0, 24)}"` : ""}`);
    }
  }
  for (const row of perFrame.values()) {
    add("teleport", row.f, { what: `${row.parts.length} thing${row.parts.length === 1 ? "" : "s"} jumped (${row.dx.toFixed(0)}, ${row.dy.toFixed(0)}) px in one frame${row.by !== "real" ? ` (${row.by})` : ""}: ${row.parts.slice(0, 5).join(", ")}`, dx: row.dx, dy: row.dy, count: row.parts.length, parts: row.parts });
  }

  // Disappearing: seen, unseen for a few frames, seen again. Or gone from the page for a few frames. (Not while a copy of the same words is up: a crossfade's old look.)
  const copies = new Map(); // words -> the frames a ghost of them is seen in
  const words = new Map((run.meta ?? []).filter((m) => m.ghost && m.text).map((m) => [m.id, m.text]));
  frames.forEach((frame, f) => {
    for (const row of frame.e) {
      const text = words.get(row[0]);
      if (text && row[5] >= SEEN) (copies.get(text) ?? copies.set(text, new Set()).get(text)).add(f);
    }
  });
  const copyUp = (track, from, to) => {
    const seen = copies.get(track.text);
    if (!seen) return false;
    for (let f = from; f < to; f++) if (!seen.has(f)) return false;
    return true;
  };
  for (const track of all) {
    if (SKIP_PARTS.has(track.part)) continue;
    for (let i = 1; i < track.at.length; i++) {
      const a = track.at[i - 1];
      const b = track.at[i];
      if (b.f - a.f > 1 && b.f - a.f <= 12 && a.o >= SEEN && b.o >= SEEN && !pageOut(b.page || a.page, a.f + 1, b.f)) add("disappear", a.f + 1, { what: `${track.part} "${track.text.slice(0, 30)}" gone for ${b.f - a.f - 1} frames, then back`, part: track.part, gap: b.f - a.f - 1 });
      if (a.o >= SEEN && b.o < 0.05) {
        for (let j = i + 1; j < Math.min(i + 13, track.at.length); j++) {
          if (track.at[j].o >= SEEN) {
            if (!copyUp(track, b.f, track.at[j].f)) add("disappear", b.f, { what: `${track.part} "${track.text.slice(0, 30)}" unseen for ${track.at[j].f - b.f} frames, then back`, part: track.part, gap: track.at[j].f - b.f });
            break;
          }
        }
      }
    }
  }

  // Flashing empty: words, none for a few frames, words again.
  for (const track of all) {
    if (SKIP_PARTS.has(track.part) || track.ghost) continue;
    for (let i = 1; i < track.at.length; i++) {
      const a = track.at[i - 1];
      const b = track.at[i];
      if (!a.text || b.text) continue;
      for (let j = i + 1; j < Math.min(i + 13, track.at.length); j++) {
        if (track.at[j].text) {
          add("flash-empty", b.f, { what: `${track.part} had "${a.text.slice(0, 30)}", empty for ${track.at[j].f - b.f} frames, then "${track.at[j].text.slice(0, 30)}"`, part: track.part });
          break;
        }
      }
    }
  }

  // Reflow: the same words, a new size, in one frame, and not because a transform scaled it (a transform moves the rect, not the font size).
  const reflows = new Map();
  for (const track of all) {
    if (SKIP_PARTS.has(track.part) || track.ghost) continue; // a ghost by itself: its size is its own flight's
    if (!meta.get(track.id)?.leaf && !BARS.has(track.part)) continue;
    for (let i = 1; i < track.at.length; i++) {
      const a = track.at[i - 1];
      const b = track.at[i];
      if (b.f !== a.f + 1 || a.o < SEEN || b.o < SEEN || (a.text !== b.text && !BARS.has(track.part))) continue;
      // Still changing next frame: a move that starts fast, not a jump.
      const next = track.at[i + 1];
      if (next && next.f === b.f + 1 && (Math.abs(next.h - b.h) > 1 || Math.abs(next.w - b.w) > 1)) continue;
      if (a.by !== b.by || b.by === "ghost") continue; // a ghost's size is its own move's (a pop's scale); teleport looks at where it went
      if (BARS.has(track.part) && run.frames[b.f].e.some((row) => row[0] !== track.id && meta.get(row[0])?.ghost && meta.get(row[0])?.part === track.part)) continue;
      const fontChanged = a.fs !== b.fs;
      const dh = Math.abs(b.h - a.h);
      const dw = Math.abs(b.w - a.w);
      if (!fontChanged && dh < 6 && dw < 8) continue;
      const before = track.at[i - 2];
      if (before && before.f === a.f - 1 && (Math.abs(a.h - before.h) > 1 || Math.abs(a.w - before.w) > 1)) continue; // a smooth resize
      const k = `${b.f}:${track.part}`;
      if (!reflows.has(k)) reflows.set(k, { f: b.f, part: track.part, n: 0, text: track.text, fs: fontChanged ? `${a.fs}→${b.fs}px` : "", h: `${a.h}→${b.h}`, w: `${a.w}→${b.w}` });
      reflows.get(k).n++;
    }
  }
  for (const row of reflows.values()) add("reflow", row.f, { what: `${row.n} ${row.part} "${row.text.slice(0, 30)}" changed size in one frame (${row.fs ? `font ${row.fs}, ` : ""}h ${row.h}, w ${row.w})`, part: row.part });

  // A press that would land on something else, for a moment (at rest it's settled()'s).
  const blockedSince = new Map();
  frames.forEach((frame, f) => {
    const now = new Set();
    for (const [id, part, text, over] of frame.blocked ?? []) {
      // Passing under the tab bar on its way in or out of view isn't a press that's lost.
      if (over === "tab" || over === "tab-bar" || over === "app-header") continue;
      now.add(id);
      if (!blockedSince.has(id)) blockedSince.set(id, { f, part, text, over });
    }
    for (const [id, row] of [...blockedSince]) {
      if (now.has(id)) continue;
      add("press-blocked", row.f, { what: `for ${f - row.f} frames a press on ${row.part} "${row.text}" landed on ${row.over}`, part: row.part, gap: f - row.f });
      blockedSince.delete(id);
    }
  });

  // A state that flickers: A, B, back to A within four frames.
  for (const track of all) {
    if (SKIP_PARTS.has(track.part) || track.ghost) continue;
    for (let i = 1; i < track.at.length - 1; i++) {
      const a = track.at[i - 1];
      const b = track.at[i];
      if (a.state === b.state) continue;
      for (let j = i + 1; j < Math.min(i + 4, track.at.length); j++) {
        if (track.at[j].state === a.state && track.at[j].state !== b.state) {
          // Each flip in a frame the page shown changed: a state that follows the page shown (a tab's, pressed in quick turns), not a flicker.
          // A state flipping back and forth with no page coming in is still one.
          if (pageTurn(b.f) && pageTurn(track.at[j].f)) break;
          add("state-flicker", b.f, { what: `${track.part} "${(track.text ?? "").slice(0, 24)}" went ${a.state || "(none)"} → ${b.state || "(none)"} → ${a.state || "(none)"} in ${track.at[j].f - a.f} frames`, part: track.part });
          break;
        }
      }
    }
  }

  // The screen going blank: the words on it fall away for a few frames and come back.
  // (With what pages' pictures show: snap's pw.)
  const counts = frames.map((frame) => frame.e.filter((row) => row[5] >= 0.5 && row[9] && meta.get(row[0])?.leaf).length + (frame.pw ?? 0));
  for (let f = 1; f < counts.length; f++) {
    if (counts[f - 1] < 4 || counts[f] >= counts[f - 1] * 0.3) continue;
    for (let g = f + 1; g < Math.min(f + 13, counts.length); g++) {
      if (counts[g] >= counts[f - 1] * 0.7) {
        add("blank-flash", f, { what: `words on screen fell from ${counts[f - 1]} to ${counts[f]} for ${g - f} frames` });
        break;
      }
    }
  }

  // Scroll jumps: no input near it, on a scroller that's on the screen in both frames, at its place before and after (the page a swipe back slid
  // off the screen is put where it was left before it comes back, a sliver of it still showing the frame before, or in the frame it comes back:
  // not a jump anyone sees). A row from before the field (three long) counts as seen.
  const scrolls = new Map();
  frames.forEach((frame, f) => {
    for (const [id, name, top, seen = 1] of frame.scroll) {
      const last = scrolls.get(id);
      if (last !== undefined && Math.abs(last.top - top) >= 8 && seen && last.seen && !nearInput(run, frame.t, 400)) add("scroll-jump", f, { what: `${name} scrolled ${last.top}→${top} with nothing pressed`, part: name });
      scrolls.set(id, { top, seen });
    }
  });

  // Focus lost with nothing pressed.
  frames.forEach((frame, f) => {
    const prev = frames[f - 1];
    if (prev?.focus && prev.focus !== frame.focus && !nearInput(run, frame.t, 300)) add("focus-loss", f, { what: "the field being typed in lost focus with nothing pressed", part: "field" });
  });

  // A frame over 100 ms, while something was moving.
  frames.forEach((frame, f) => {
    const prev = frames[f - 1];
    if (prev && frame.t - prev.t > 100) add("long-frame", f, { what: `a frame took ${Math.round(frame.t - prev.t)} ms`, ms: Math.round(frame.t - prev.t) });
  });

  return found.sort((a, b) => a.frame - b.frame);
}

// ---------- a screen at rest ----------

/** What's wrong with the screen as it stands: off screen, under a bar, cut off, covered, a control a press wouldn't reach. */
export const settled = (page, { label = "" } = {}) =>
  page.evaluate((label) => {
    const out = [];
    const add = (kind, what, node) => {
      const r = node?.getBoundingClientRect?.();
      out.push({ kind, label, what, rect: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null });
    };
    const seen = (node) => {
      if (node.closest("details:not([open]) > :not(summary)")) return false;
      const box = node.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) return false; // words for a screen reader
      for (let n = node; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return false;
      }
      return true;
    };
    const vw = innerWidth;
    const vh = innerHeight;
    // A row that scrolls sideways: not a page that scrolls down, whose overflow-x reads auto as well, and which nothing should run past.
    const sidewaysRow = (node) => {
      if (node === document.documentElement || node === document.body || node.matches('[data-part="activity"], [data-part="page"], [data-part="session"]')) return false;
      return ["auto", "scroll"].includes(getComputedStyle(node).overflowX) && node.scrollWidth > node.clientWidth + 1;
    };
    const name = (node) => `${node.getAttribute("data-part") ?? node.tagName.toLowerCase()} "${(node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}"`;
    const top = document.querySelector('[data-part="sheet"][data-state="open"], [data-part="sheet-layer"]:not([hidden])') ?? null;
    // What's on top is what can be seen and pressed: a sheet over all, then a session or a book, then the app.
    const scope = document.querySelector(".lx-sheet-layer:not([hidden]) [data-part='sheet']") ?? document.querySelector('[data-part="session"]:not([data-ghost])') ?? document.querySelector('[data-part="reader"]') ?? document.body;
    const controls = [...scope.querySelectorAll('button, a[href], input, select, textarea, summary, [role="button"], [tabindex="0"]')].filter((n) => !n.closest("[data-ghost], [data-motion-layer], [inert]") && seen(n));
    for (const c of controls) {
      const r = c.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      let row = c.parentElement;
      while (row && !sidewaysRow(row)) row = row.parentElement;
      if (row && row !== document.documentElement && row !== document.body) {
        // In a row that scrolls sideways: past its edge, it's simply scrolled away.
        const edge = row.getBoundingClientRect();
        if (r.left + r.width / 2 < edge.left || r.left + r.width / 2 > edge.right) continue;
      } else if (r.left < -0.5 || r.right > vw + 0.5) add("off-screen", `control ${name(c)} runs past the screen's side (${Math.round(r.left)}–${Math.round(r.right)} of ${vw})`, c);
      // Inside a scroller, it may simply be scrolled away. Outside one, it can't be reached.
      let scroller = c.parentElement;
      while (scroller && !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
      if (!scroller && (r.bottom > vh + 0.5 || r.top < -0.5)) add("off-screen", `control ${name(c)} is off the screen with nothing to scroll (${Math.round(r.top)}–${Math.round(r.bottom)} of ${vh})`, c);
      const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
      const cy = r.top + r.height / 2;
      if (cy < 0 || cy >= vh) continue;
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (cy < box.top || cy > box.bottom) continue;
      }
      const hit = document.elementFromPoint(cx, cy);
      if (!hit) continue;
      if (hit !== c && !c.contains(hit) && !hit.contains(c) && !hit.closest("label")?.contains(c) && !hit.closest("[data-part='character']") && !(scroller && hit.closest('[data-part="tab-bar"], [data-part="app-header"], [data-part="session-bar"]')) && !(c.matches("input, textarea") && hit.closest("button, a"))) {
        add("covered", `a press on ${name(c)} lands on ${name(hit)}`, c);
      }
    }
    // Words cut off: a thing with text that its own box hides, unless it ends in an ellipsis on purpose.
    for (const node of scope.querySelectorAll("p, span, h1, h2, h3, h4, button, a, label, [data-part]")) {
      if (node.closest("[data-ghost], [data-motion-layer], svg, lx-tinta, [data-part='character']") || !seen(node)) continue;
      if (![...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim())) continue;
      const s = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      let sideways = node.parentElement;
      while (sideways && !sidewaysRow(sideways)) sideways = sideways.parentElement;
      if (!sideways && (r.right > vw + 1 || r.left < -1)) add("off-screen", `words ${name(node)} run past the screen's side`, node);
      if (s.overflowX !== "visible" && node.scrollWidth > node.clientWidth + 1 && s.textOverflow !== "ellipsis") add("clipped", `words ${name(node)} are cut off`, node);
      if (s.overflowY !== "visible" && node.scrollHeight > node.clientHeight + 2 && !s.webkitLineClamp?.match(/\d/) && !["auto", "scroll"].includes(s.overflowY)) add("clipped", `words ${name(node)} are cut off below`, node);
    }
    // Words on words: two leaf texts overlapping.
    const leaves = [...scope.querySelectorAll("p, span, h1, h2, h3, h4, button, a, label")].filter((node) => !node.closest("[data-ghost], [data-motion-layer], svg, lx-tinta, [data-part='character']") && seen(node) && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim()));
    // A page's content scrolling under the header or the tab bar is what those bars are for.
    const overBar = (node) => node.closest('[data-part="tab-bar"], [data-part="app-header"], [data-part="session-bar"], [data-part="answer-bar"]');
    // By the lines they're really on: a text running on to the next line has a box bigger than its words.
    const lines = (node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    };
    const textBox = (node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    };
    const boxes = leaves.map((node) => [node, textBox(node), lines(node)]).filter(([, r]) => r.width && r.height);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, ra, la] = boxes[i];
        const [b, rb, lb] = boxes[j];
        if (a.contains(b) || b.contains(a) || overBar(a) || overBar(b)) continue;
        if (Math.min(ra.right, rb.right) <= Math.max(ra.left, rb.left) || Math.min(ra.bottom, rb.bottom) <= Math.max(ra.top, rb.top)) continue;
        let w = 0;
        let h = 0;
        for (const x of la) {
          for (const y of lb) {
            const cw = Math.min(x.right, y.right) - Math.max(x.left, y.left);
            const ch = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
            if (cw > w && ch > h) {
              w = cw;
              h = ch;
            }
          }
        }
        if (w > 4 && h > 6) add("overlap", `words ${name(a)} and ${name(b)} overlap by ${Math.round(w)} × ${Math.round(h)}`, a);
      }
    }
    // Words under a bar: the answer bar and the session bar are solid, so anything under them is hidden.
    for (const barPart of ["session-bar", "answer-bar", "tab-bar"]) {
      const bar = document.querySelector(`[data-part="${barPart}"]`);
      if (!bar || !seen(bar)) continue;
      // Under a full-screen layer, the page's own bars are out of sight too.
      if (scope !== document.body && !scope.contains(bar)) continue;
      const rb = bar.getBoundingClientRect();
      for (const [node, r] of boxes) {
        if (bar.contains(node) || node.contains(bar)) continue;
        let scroller = node.parentElement;
        while (scroller && !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
        if (scroller && scroller !== document.documentElement && scroller !== document.body) continue;
        const h = Math.min(r.bottom, rb.bottom) - Math.max(r.top, rb.top);
        const w = Math.min(r.right, rb.right) - Math.max(r.left, rb.left);
        if (h > 4 && w > 4) add("under-bar", `words ${name(node)} sit under the ${barPart}`, node);
      }
    }
    // Sideways scrolling on the page, and something still pressed.
    const scrollWidth = document.documentElement.scrollWidth;
    if (scrollWidth > vw + 1) add("off-screen", `the page scrolls sideways (${scrollWidth} wide on a ${vw} screen)`, document.documentElement);
    for (const node of document.querySelectorAll(":active")) if (node !== document.documentElement && node !== document.body) add("stuck", `${name(node)} is still pressed`, node);
    if (top && false) void top;
    return out;
  }, label);
