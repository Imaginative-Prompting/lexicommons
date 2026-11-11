// Is Tinta whole? What the checks use to ask: how far its ink goes past anything that clips it, wherever it is.
//
// In the page (wholeInit, an init script), window.lxWhole:
//   ink(node)        the box of what it has drawn, on the screen
//   over(node)       how far that goes past each side of what clips it: every ancestor that clips, each axis on its own (its top and
//                    foot where its overflow-y isn't visible, its sides where its overflow-x isn't), and the window. A side a
//                    scroller could still scroll to doesn't count (a page scrolled on takes Tinta with it; a part above a
//                    scroller's start can never be reached, which is what a clip is)
//   at(node, t)      draws the frame t seconds into its act (or its loop), at once, in its place
//   sweep(node, dur) every frame of its act: the worst overshoot on each side, the highest frame found to 1/240 s
//   hold(t), release()  keeps every Tinta on one moment, for a picture; a real frame, drawn by its own code in its place
//   watch(sink)      every frame, every Tinta on the page: reports each one past what clips it
//   pictures         every picture of the page so far, and each Tinta in it: how many drawings, any broken references
//
// wholeWatch(context, seen) is the watcher for a check's whole run: what it saw lands in `seen`, by place.
export function wholeInit() {
  const NOT_DRAWN = new Set(["defs", "clipPath", "mask", "title", "desc", "linearGradient", "radialGradient", "filter", "style", "metadata"]);
  const clipping = (s) => s.overflowX !== "visible" || s.overflowY !== "visible";
  let held = null;

  const ink = (node) => {
    const svg = node.querySelector(":scope > svg");
    if (!svg) return null;
    let box = null;
    for (const child of svg.children) {
      if (NOT_DRAWN.has(child.localName)) continue;
      const r = child.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      box = box
        ? { top: Math.min(box.top, r.top), left: Math.min(box.left, r.left), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
        : { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
    }
    return box;
  };

  const describe = (a) => a.getAttribute?.("data-part") ?? a.className ?? a.localName;

  const over = (node) => {
    const box = ink(node);
    const out = { top: 0, left: 0, right: 0, bottom: 0, by: {}, ink: box };
    if (!box) return out;
    const past = (side, amount, who) => {
      if (amount > out[side]) {
        out[side] = amount;
        out.by[side] = who;
      }
    };
    let scrolled = false; // inside something that scrolls: the window's top and foot are only how far it's scrolled
    // A scroller inside could still bring it up (or down) into view: then a frame around that scroller doesn't cut it at that side either,
    // as the window doesn't. (Home on a short screen: the streak spot's Tinta waits below the foot, under the tab bar, until it's scrolled to.)
    let moreBelow = false;
    let moreAbove = false;
    for (let a = node.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (!clipping(s)) continue;
      const r = a.getBoundingClientRect();
      const top = r.top + a.clientTop, left = r.left + a.clientLeft, bottom = top + a.clientHeight, right = left + a.clientWidth;
      const scrollsY = /auto|scroll/.test(s.overflowY), scrollsX = /auto|scroll/.test(s.overflowX);
      if (scrollsY) scrolled = true;
      const who = describe(a);
      const atTop = !scrollsY || a.scrollTop <= 0.5;
      const atFoot = !scrollsY || a.scrollTop >= a.scrollHeight - a.clientHeight - 0.5;
      // Each axis on its own: a frame cuts at its top and foot only where its overflow-y clips, at its sides only where its overflow-x does
      // (the app's frame is overflow-x: clip with overflow-y visible: a session's cover rising from below the screen isn't cut by it).
      if (s.overflowY !== "visible") {
        if (atTop && !moreAbove) past("top", top - box.top, who);
        if (atFoot && !moreBelow) past("bottom", box.bottom - bottom, who);
        if (!atTop) moreAbove = true;
        if (!atFoot) moreBelow = true;
      }
      if (s.overflowX !== "visible") {
        if (!scrollsX || a.scrollLeft <= 0.5) past("left", left - box.left, who);
        if (!scrollsX || a.scrollLeft >= a.scrollWidth - a.clientWidth - 0.5) past("right", box.right - right, who);
      }
    }
    past("left", -box.left, "window");
    past("right", box.right - innerWidth, "window");
    if (!scrolled) {
      past("top", -box.top, "window");
      past("bottom", box.bottom - innerHeight, "window");
    }
    return out;
  };

  // A reaction's time runs from its own start; a loop's is the clock itself.
  const at = (node, t) => node.draw(((node.reaction?.t0 ?? 0) + t) * 1000, true);

  const sweep = (node, dur) => {
    const worst = { top: 0, left: 0, right: 0, bottom: 0, by: {} };
    let high = { y: Infinity, t: 0 };
    const look = (t) => {
      at(node, t);
      const o = over(node);
      for (const side of ["top", "left", "right", "bottom"])
        if (o[side] > worst[side]) {
          worst[side] = o[side];
          worst.by[side] = o.by[side];
        }
      if (o.ink && o.ink.top < high.y) high = { y: o.ink.top, t };
      return o;
    };
    for (let t = 0; t < dur; t += 1 / 30) look(t);
    const coarse = high.t;
    for (let t = Math.max(0, coarse - 1 / 30); t <= Math.min(dur - 1e-3, coarse + 1 / 30); t += 1 / 240) look(t);
    at(node, high.t);
    return { top: worst.top, left: worst.left, right: worst.right, bottom: worst.bottom, by: worst.by, highest: high.t, inkTop: high.y };
  };

  customElements.whenDefined("lx-tinta").then(() => {
    const part = customElements.get("lx-tinta").prototype;
    const draw = part.draw;
    part.draw = function (now, force) {
      return held === null ? draw.call(this, now, force) : draw.call(this, ((this.reaction?.t0 ?? 0) + held) * 1000, true);
    };
  });

  const watch = (sink) => {
    const worst = new Map();
    const tick = () => {
      requestAnimationFrame(tick);
      // (The design page's demos stand in frames of their own, none of them a place in the app.)
      if (held !== null || !location.pathname.startsWith("/app")) return;
      for (const node of document.querySelectorAll("lx-tinta")) {
        if (node.closest("[data-motion-layer], [data-ghost]")) continue;
        // Under a session or a practice room: the page beneath it is locked and covered, not cut.
        if (document.documentElement.hasAttribute("data-scroll-lock") && !node.closest('[data-part="session"]')) continue;
        // The paper plane flies off the screen and back: that's the act (ui.planeCharacter).
        if (/^plane/.test(node.getAttribute("data-state") ?? "")) continue;
        if (!node.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
        const o = over(node);
        const side = ["top", "left", "right", "bottom"].reduce((a, b) => (o[b] > o[a] ? b : a));
        if (o[side] <= 1) continue;
        const parts = [];
        for (let a = node.parentElement; a && parts.length < 2; a = a.parentElement) if (a.hasAttribute?.("data-part")) parts.push(a.getAttribute("data-part"));
        const key = `${parts.join(" < ")} · ${node.getAttribute("data-state")} · ${node.style.getPropertyValue("--character-size")} · ${side}`;
        const t = node.reaction ? performance.now() / 1000 - node.reaction.t0 : null;
        // What's made to come in from off the page: catch's stack of pages drops in from behind the header until it lands
        // on its curl. From then on it's held like everything else, and Tinta's own body is well below it till then.
        if (node.reaction?.name === "catch" && t < 0.66 && side === "top") continue;
        if (o[side] > (worst.get(key) ?? 0) + 0.5) {
          worst.set(key, o[side]);
          sink({ key, px: +o[side].toFixed(1), by: o.by[side], path: location.hash || location.pathname, width: innerWidth, t: t === null ? null : +t.toFixed(2) });
        }
      }
    };
    requestAnimationFrame(tick);
  };

  // Pictures of the page (a step or a session leaving, a page sliding away, the theme's old look): cloned from the page,
  // each with any Tinta in it. Recorded as it's added: how many drawings each Tinta has, and any reference in them (a
  // clip, a mask, a drawn outline) that points at nothing, which draws a solid block where its shape should be.
  const shadows = new WeakMap();
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (options) {
    const root = attach.call(this, options);
    shadows.set(this, root);
    return root;
  };
  const pictures = [];
  let frozen = false;
  // (A fill's own "#7C5CE6" is a color, not a reference: only url(#…), and href's #….)
  const referredTo = (node) =>
    [...["clip-path", "mask", "fill"].map((name) => /^url\(#([^)]+)\)/.exec(node.getAttribute(name) ?? "")?.[1]), /^#(.+)$/.exec(node.getAttribute("href") ?? "")?.[1]].filter(Boolean);
  const looked = new WeakSet();
  const lookAt = (host) => {
    if (looked.has(host)) return;
    looked.add(host);
    const root = shadows.get(host) ?? host;
    const scope = shadows.has(host) ? root : document;
    const tintas = [...root.querySelectorAll('[data-part="character"]')].map((t) => {
      const svgs = t.querySelectorAll(":scope > svg");
      let broken = 0, drawn = 0;
      for (const svg of svgs)
        for (const node of svg.querySelectorAll("*")) {
          drawn++;
          for (const id of referredTo(node)) if (!scope.getElementById(id)) broken++;
        }
      return { svgs: svgs.length, broken, drawn };
    });
    const kind = host.hasAttribute("data-theme-picture") ? "theme" : host.hasAttribute("data-page-picture") ? "page" : host.getAttribute("data-part") === "session" ? "session" : host.classList?.contains("lx-step") ? "step" : (host.getAttribute("data-part") ?? host.localName);
    pictures.push({ kind, tintas });
    if (frozen) for (const a of host.getAnimations()) a.pause();
  };
  // A copy put in (a step, a page, the theme's old look), or a part that becomes its own picture where it is (a session leaving moves
  // itself: study/session.js sets data-ghost on it rather than putting in a copy that would show its answers).
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") {
        const node = r.target;
        if (r.oldValue === null && node.hasAttribute("data-ghost") && node.localName !== "lx-tinta") lookAt(node);
        continue;
      }
      for (const node of r.addedNodes) if (node.nodeType === 1 && node.hasAttribute("data-ghost") && node.localName !== "lx-tinta") lookAt(node);
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-ghost"], attributeOldValue: true });

  window.lxWhole = {
    ink,
    over,
    at,
    sweep,
    watch,
    hold: (t) => (held = t),
    release: () => (held = null),
    pictures,
    freezePictures: (on) => {
      frozen = on;
      if (!on) for (const g of document.querySelectorAll("[data-ghost]")) for (const a of g.getAnimations()) a.finish();
    },
  };
}

/** Watches every Tinta for a check's whole run. Returns seen (a Map: key → the worst report); call before any page opens. */
export async function wholeWatch(context) {
  const seen = new Map();
  await context.exposeFunction("lxWholeSink", (r) => {
    if (!seen.has(r.key) || seen.get(r.key).px < r.px) seen.set(r.key, r);
  });
  await context.addInitScript(wholeInit);
  await context.addInitScript(() => addEventListener("DOMContentLoaded", () => window.lxWhole.watch((r) => window.lxWholeSink(r))));
  return seen;
}

/** What wholeWatch saw, as lines; the check fails on any. */
export const wholeReport = (seen) => [...seen.values()].map((r) => `${r.key}: ${r.px} px past ${r.by} at t=${r.t} (${r.path}, ${r.width} px wide)`);
