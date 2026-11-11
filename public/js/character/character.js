// Tinta, Lexicommons' character (an ink drop), drawn live: the part `character`, built by ui.character(). The art is
// the character's rig (public/js/character/rig/, exported from it); this file only runs it on the page.
//
// - Decoration: it takes no presses (pointer-events: none), and nothing ever waits for it. Where it stands on a tab it can be
//   poked (data-pokeable; ui.character({ pokeable: true })): its box takes a tap, and a tap on his ink (his body as drawn, a finger's
//   INK_SLOP around it: onInk) is his alone (never the link or card around him: data-poking while it's down, for their pressed
//   looks), and he splats, giggles, slides off and back, and every fifth time squirts, grumpy (the rig's poke.js), a poke while he's
//   at it taking over from where he is, at most one a beat. Not with animations off (the tap does nothing), nor in a state he's busy
//   in (scribbling). A tap in his box beside his ink isn't his: it goes on to the link around him. A press on his ink never finishes
//   his poke; any other press finishes every animation (motion.js).
// - A held state loops (idle, loading, and the states drafted on the rig: lex-retention's lounge, sleepy, rest…); a
//   reaction (right, wrong, heart, wave) plays once, then it's back to its state. Which is which is the rig's state
//   itself (`loop`, or a `dur`), never a list here. A reaction registers with motion.js, so a press or a key finishes it
//   at once, as it does every animation.
// - perform(make, targets, { data, spares }): an act another part of the app hands it (lex-mascots' rig/splat/acts.js: a
//   download's pour, an error's slump…). make({ palette, size }) → { name, dur (Infinity: until end()), durFor(data) (a length
//   that comes from its data, over dur), exit, frame(t, T, { rects, data, speak, endedAt }) }, made again when the theme changes;
//   data its first data (as set() hands it, but from its first frame); spares a press it isn't finished by (motion.js). rects are
//   the targets' boxes in its drawing's units, measured every frame (null for one that has left the page). It returns { set(data), end() }: set hands the act its data (a
//   download's progress), end plays its exit (it settles at endedAt + exit, or at dur). A move, so a press finishes it;
//   with animations off (or a still) nothing plays, and the handle does nothing: the page shows the result. performOnArrival(make,
//   targets, options) queues one on a Tinta not on the page yet, started as it's connected, so its first drawing is the act's.
// - Moved on the page (taken out and put back in the same task), it carries on with what it was doing.
// - Made before this file had loaded (a page drawn early in a start), it holds its kind's first frame, kept from an earlier start
//   (firsts.js), and takes over from that very frame: its loop runs from its own first frame, not the page's clock. With none kept, it
//   fades in. Every kind it draws first is kept for next time.
// - Animations Off (or a device asking for reduced motion, under Match device): a still for each state, drawn once.
// - One frame loop for every Tinta on the page: 30 frames a second at card sizes, 60 at 120 px and up; none while it's
//   off screen or the page is hidden.
// - Its colors follow the theme: the light ink on a light theme (paper, sepia), the dark one otherwise.
// - A Tinta that speaks (data-speaks; ui.character({ speaks: true })) says what the app says (study/voice.js announces
//   each sound to speaking.js): its mouth follows the words at their times, opened and closed by a recording's
//   loudness, read from the file itself (decoded, never played). It follows the sound, so it isn't a move a press
//   finishes: it ends when the sound does (a press that stops the sound closes it). Not while a reaction plays, and not
//   with animations off (its still).
// - Its eyes can follow what you touch: watch(container) (the control you press or focus there, the tile as you drag
//   it), or lookAt(element | { x, y } | null). They go back to its own glances 2.5 s after the last touch, eased both
//   ways so they never jump.
// - pointAt(elements): it points its curl at each in turn (a hint's clue words: never hand it an answer), its eyes on
//   each, the one it's on marked data-pointed; then it looks back at you. A move, so a press finishes it.

import { motionOn, registerTicker } from "../lx/motion.js";
import { STATES, VIEW, VIEW_LOADING, tinta } from "./rig/inkdrop/tinta.js";
import { loudness, speechTrack } from "./rig/kit/speech.js";
import { onSpeech } from "./speaking.js";
import { hasFirst, inkOf, keepFirst, kindOf, placed } from "./firsts.js";
import { inkKey, publishInk, readInk } from "./ink.js";
import { BEAT, REST, pokeLength } from "./rig/inkdrop/poke.js";
import { sharpen } from "./sharpen.js";

const SVG = "http://www.w3.org/2000/svg";

/** One of the rig's held states (it loops), by the state itself. */
const loops = (clips, name) =>
  typeof name === "string" && Object.hasOwn(clips, name) && clips[name]?.loop === true && typeof clips[name].frame === "function";
/** One of the rig's reactions (it plays once, for its `dur`), by the state itself. */
const playsOnce = (clips, name) =>
  typeof name === "string" &&
  Object.hasOwn(clips, name) &&
  !clips[name]?.loop &&
  Number.isFinite(clips[name]?.dur) &&
  typeof clips[name].frame === "function";
/** What perform() hands back when nothing plays (animations off, a still, a Tinta not on the page). */
const NOTHING = Object.freeze({ set() {}, end() {} });
/** How far from his ink a tap still lands on him, in px: a finger's slop. */
const INK_SLOP = 4;
/** Whether a press came down on his ink, worked out once a press (motion.js asks first, in its capture, then his own listener). */
const onInkOf = new WeakMap();
/** An act's mistake is reported (a check sees it) and it settles; it never stops the other Tintas' frames. */
const report = (error) => (typeof reportError === "function" ? reportError(error) : console.error(error));

const live = new Set();
let raf = 0;
// A timer waking the loop for the next resting Tinta's blink, glance or shiver (idle on the compositor: draw()), so no frame runs between.
let nap = 0;
// A held state's motion as keyframes, made once for every Tinta that plays it: its transform KEYS_PER_SECOND times a second of its period.
const motionFrames = new WeakMap();
// A part's own track (the rig's held state `tracks`: a prop held still against the breath, doze's cloud): its matrices, KEYS_PER_SECOND of its period.
// A track's keyframes a second, the compositor stepping linearly between them: 10 keep every breath and part within 0.03 units of its exact
// matrix (0.03 px at 160 px), from a third of the keyframes 30 took (313 for a 31.2 s track).
const KEYS_PER_SECOND = 10;
const trackFrames = new WeakMap();
function framesOfTrack(track) {
  if (!trackFrames.has(track)) {
    const n = Math.round(track.period * KEYS_PER_SECOND);
    trackFrames.set(track, Array.from({ length: n + 1 }, (_, k) => {
      const m = track.matrix((k / n) * track.period);
      const t = (k / n) * track.period;
      // A part that fades (sleepy's z's) carries its opacity too.
      return { offset: k / n, transform: `matrix(${m.map((v) => v.toFixed(6)).join(",")})`, ...(track.opacity ? { opacity: track.opacity(t).toFixed(4) } : {}) };
    }));
  }
  return trackFrames.get(track);
}
/** A held state's drawing with its parts' tracks baked in at T (a kept first frame has no animations): each marked part's matrix, and its opacity. */
const bakeTracks = (st, html, T = 0) =>
  (st.tracks ?? []).reduce((out, t) => out.replace(`<g data-track="${t.part}">`, `<g data-track="${t.part}" transform="matrix(${t.matrix(T).map((v) => v.toFixed(6)).join(" ")})"${t.opacity ? ` opacity="${t.opacity(T).toFixed(4)}"` : ""}>`), html);
function framesOf(motion) {
  if (!motionFrames.has(motion)) {
    const n = Math.round(motion.period * KEYS_PER_SECOND);
    motionFrames.set(motion, Array.from({ length: n + 1 }, (_, k) => {
      const [a, b, c, d] = motion.matrix((k / n) * motion.period);
      return { offset: k / n, transform: `matrix(${a.toFixed(6)},${b.toFixed(6)},${c.toFixed(6)},${d.toFixed(6)},0,0)` };
    }));
  }
  return motionFrames.get(motion);
}
// The ink: the theme's (ink.js), read once a theme change; what CSS draws while the app takes over from the splash reads it too.
let paletteNow = null;
const palette = () => (paletteNow ??= readInk());
publishInk(palette());
// Its first frames' ink key (firsts.js inkOf), read once a theme change as the palette is: inkOf reads the page's computed style, and a
// Tinta put back on the page (a tab's kept page coming back) would make the browser work out the whole page's style again just for it.
let firstsInkNow = null;
const firstsInk = () => (firstsInkNow ??= inkOf());
const redrawAll = () => {
  paletteNow = null;
  firstsInkNow = null;
  publishInk(palette());
  for (const t of live) t.dirty = true;
  wake();
};
new MutationObserver(redrawAll).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", redrawAll);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redrawAll);

const seen = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    entry.target.visible = entry.isIntersecting;
    if (entry.isIntersecting) wake();
  }
});

// ---- speaking: what's said now, as one mouth track for every Tinta that speaks ----------------------------------------
const LOUD_RATE = 100; // loudness samples a second
let speech = null;
let track = null;
let envelope = null;
const loudnessCache = new Map();

/**
 * A recording's loudness, 0–1, LOUD_RATE times a second: its file decoded on the device (never played), or null. From
 * its address, or from a kept clip's Blob; a blob: address is never fetched (the CSP refuses it, and nothing needs it).
 */
function loudnessOf(src, blob = null) {
  const key = blob ?? src;
  if (!key || (!blob && String(src).startsWith("blob:"))) return Promise.resolve(null);
  if (!loudnessCache.has(key)) {
    loudnessCache.set(key, (async () => {
      try {
        const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!Offline) return null;
        let bytes;
        if (blob) bytes = await blob.arrayBuffer();
        else {
          const response = await fetch(src);
          if (!response.ok) return null;
          bytes = await response.arrayBuffer();
        }
        // Decoding resamples to the context's rate: 22,050 a second is plenty for loudness, and every browser takes it.
        const context = new Offline(1, 1, 22050);
        const audio = await new Promise((resolve, reject) => context.decodeAudioData(bytes, resolve, reject)?.catch?.(reject));
        const mono = new Float32Array(audio.length);
        for (let c = 0; c < audio.numberOfChannels; c++) {
          const data = audio.getChannelData(c);
          for (let i = 0; i < mono.length; i++) mono[i] += data[i] / audio.numberOfChannels;
        }
        return loudness(mono, audio.sampleRate, LOUD_RATE);
      } catch {
        return null;
      }
    })());
    // The last 64 recordings, by address (a clip's address names its bytes) or kept Blob.
    if (loudnessCache.size > 64) loudnessCache.delete(loudnessCache.keys().next().value);
  }
  return loudnessCache.get(key);
}

onSpeech((now) => {
  speech = now;
  envelope = null;
  track = now ? speechTrack(now.words, { lang: now.lang }) : null;
  if (now?.src || now?.bytes) {
    loudnessOf(now.src, now.bytes).then((found) => {
      if (speech !== now || !found) return;
      envelope = found;
      track = speechTrack(now.words, { lang: now.lang, envelope: found, rate: LOUD_RATE });
    });
  }
  for (const t of live) if (t.speaks) t.dirty = true;
  wake();
});

/** The mouth, now: speechTrack's parameters at the sound's clock, and how loud it is (0–1). */
function mouthNow() {
  const t = speech.clock();
  const params = track.at(t);
  let loud = params.open * 0.6;
  if (envelope) {
    const i = t * LOUD_RATE, a = Math.floor(i);
    loud = a >= 0 && a < envelope.length - 1 ? envelope[a] + (envelope[a + 1] - envelope[a]) * (i - a) : 0;
  }
  return { t, params, loud };
}

function frame(now) {
  raf = 0;
  if (document.hidden) return;
  let more = false, until = Infinity;
  const moving = motionOn();
  for (const t of live) {
    if (!t.visible) continue;
    // Idle on the compositor, with nothing to draw until its next blink, glance or shiver (restUntil, draw()): no frame for it.
    if (t.restUntil > now && !t.dirty) {
      until = Math.min(until, t.restUntil);
      continue;
    }
    t.draw(now);
    if (!moving || t.still) continue;
    if (t.restUntil > now) until = Math.min(until, t.restUntil);
    else more = true;
  }
  if (more) raf = requestAnimationFrame(frame);
  else if (until < Infinity) {
    // Every Tinta at rest: no frames at all until the soonest one has something to draw (a running frame loop, even an empty one,
    // keeps WebKit from collecting garbage).
    clearTimeout(nap);
    nap = setTimeout(() => {
      nap = 0;
      wake();
    }, Math.max(0, until - now));
  }
}
function wake() {
  if (nap) {
    clearTimeout(nap);
    nap = 0;
  }
  if (!raf && live.size && !document.hidden) raf = requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", wake);
// A question's Tinta stands over the session bar only at its step's start: once the step's scrolled on, it goes under the
// bar with everything else (components.css). Set on the step that scrolled, whatever scrolled it.
document.addEventListener(
  "scroll",
  ({ target }) => {
    if (target.matches?.('[data-part="session"] > [data-part="activity"]')) target.toggleAttribute("data-scrolled", target.scrollTop > 0);
  },
  { capture: true, passive: true },
);

class Tinta extends HTMLElement {
  connectedCallback() {
    if (!this.pressing) {
      // A tap on a Tinta that can be poked (data-pokeable: its box takes presses, components.css): where on him it came down (the tap's
      // click may come without a position: motion.js sends one for an iPhone's tap that got none), then the poke itself.
      this.pressing = true;
      this.addEventListener(
        "pointerdown",
        (event) => {
          this.downAt = event.clientX;
          // On his ink: his, the link around him not looking pressed while it's down (data-poking; redesign.css, know.css).
          this.poking = this.hasAttribute("data-pokeable") && this.onInk(event);
          if (!this.poking) return;
          this.setAttribute("data-poking", "");
          const up = () => {
            this.removeAttribute("data-poking");
            removeEventListener("pointerup", up, true);
            removeEventListener("pointercancel", up, true);
          };
          addEventListener("pointerup", up, true);
          addEventListener("pointercancel", up, true);
        },
        { passive: true },
      );
      this.addEventListener("click", (event) => this.pressed(event));
    }
    // Its kind's kept first frame, put in before this file had loaded (ui.character, firsts.js): it takes over from it.
    const held = this.svg ? null : this.querySelector(":scope > svg");
    const first = held && placed.has(held) ? held : null;
    // A copy in a picture of the page (a step leaving, a page sliding away: cloneNode brings its drawing along): it's
    // that drawing, as it was, never a second live Tinta drawn under it.
    if (held && !first) return;
    if (!this.svg) {
      if (first) {
        this.svg = first;
        // Its loop from the frame it held: its own clock starts at its first live frame (draw()).
        this.born = null;
      } else {
        this.svg = document.createElementNS(SVG, "svg");
        this.svg.setAttribute("aria-hidden", "true");
        this.svg.setAttribute("focusable", "false");
        this.append(this.svg);
      }
      this.stats = { frames: 0, ms: 0 };
    }
    const size = Number(this.getAttribute("data-size")) || 72;
    // Standing on something drawn (data-ground="none": a lesson on the path), it has no puddle of its own under it.
    const ground = this.getAttribute("data-ground") !== "none";
    if (size !== this.size || ground !== this.ground) {
      this.size = size;
      this.ground = ground;
      this.cached = null;
      this.stills = null;
    }
    this.still = this.hasAttribute("data-still");
    this.speaks = this.hasAttribute("data-speaks");
    // Back on the page in the middle of something (moved: disconnectedCallback waited), it carries on with it.
    if (!this.reaction) {
      const named = this.getAttribute("data-state");
      this.base = loops(this.clips(), named) ? named : (this.base ?? "idle");
    }
    this.speaking = null;
    this.visible = true;
    this.dirty = true;
    this.last = 0;
    live.add(this);
    seen.observe(this);
    // An act queued before it was on the page (performOnArrival): it starts now, so its first drawing is the act's.
    if (this.arriving) {
      const { make, targets, options, resolve } = this.arriving;
      this.arriving = null;
      resolve(this.perform(make, targets, options));
    }
    this.draw(performance.now(), true);
    this.arrive();
    this.keepFirst();
    wake();
  }

  /**
   * perform(), from the moment it's on the page: on one not connected yet (a part still being built), the act starts as it's connected,
   * so its first drawing is the act's and never its state's a frame before (the strip's hop stands over the stop it left from the first
   * frame). Resolves with perform's handle (NOTHING when nothing plays). On the page already, it's perform() now.
   */
  performOnArrival(make, targets = [], options = {}) {
    if (this.isConnected) return Promise.resolve(this.perform(make, targets, options));
    return new Promise((resolve) => {
      this.arriving?.resolve(NOTHING);
      this.arriving = { make, targets, options, resolve };
    });
  }

  /** Made before this file had loaded with no first frame kept for it (ui.character): it fades in now, never popping into its place. */
  arrive() {
    if (!this.hasAttribute("data-first-pending")) return;
    this.removeAttribute("data-first-pending");
    if (!motionOn() || this.still) return;
    this.svg.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
  }

  /** Keeps its kind's first frame for a later start (firsts.js): once, a second after it's drawn, never in the frame a page goes in. */
  keepFirst() {
    if (this.keeping || this.reaction) return;
    const still = this.still || !motionOn();
    const base = this.base;
    const kind = kindOf({ state: base, size: this.size, ground: this.ground, still, ink: firstsInk() });
    if (hasFirst(kind)) return;
    this.keeping = true;
    setTimeout(() => {
      this.keeping = false;
      if (!this.isConnected || kind !== kindOf({ state: this.base, size: this.size, ground: this.ground, still: this.still || !motionOn(), ink: firstsInk() })) return;
      try {
        const clips = this.clips();
        const st = clips[base];
        // A held state on the compositor keeps its first frame as its live one will be: rest(0) under motion(0), the transform baked in
        // about its ground point (the svg's origin), so the live Tinta takes over with the very same picture.
        const first = still ? this.stillOf(base) : typeof st.rest === "function" && st.motion ? `<g transform="matrix(${st.motion.matrix(0).join(" ")} 0 0)">${bakeTracks(st, st.rest(0, null))}</g>` : st.frame(0, 0, null);
        keepFirst(kind, base === "loading" ? VIEW_LOADING : VIEW, first);
      } catch (error) {
        report(error);
      }
    }, 1000);
  }

  disconnectedCallback() {
    // Only once it's really gone: a Tinta moved on the page (taken out and put back in the same task) keeps its act.
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.stopWatching?.();
      live.delete(this);
      seen.unobserve(this);
      this.finish();
      this.stopMotion();
    });
  }

  /**
   * Plays a held state's motion (the rig's idle-motion.js: the breath and sway) on the compositor: one transform animation on its drawing,
   * replacing (one added to another runs on the main thread in Chrome), turning about its ground point, its time the loop's own clock (L in
   * draw(), in ms), so the drawing under it and the transform are always the same moment. With no Web Animations, it just stands still.
   */
  startMotion(motion, now) {
    if (this.motion?.of === motion && this.motion.svg === this.svg) {
      // Its sharpening ended by anything at all (it ends at 1): started again at the next drawing.
      if (this.motion.sharpened && this.motion.sharpened.playState !== "running") this.motion.sharpened = sharpen(this);
      return;
    }
    this.stopMotion();
    if (typeof this.svg?.animate !== "function") return;
    // Turning about its ground point, VIEW's (0, 0): components.css's [data-breathing] rule (never a style attribute: the CSP refuses one in a
    // picture of the page, which is parsed again).
    this.setAttribute("data-breathing", "");
    const anim = this.svg.animate(framesOf(motion), { duration: motion.period * 1000, iterations: Infinity, easing: "linear" });
    // On its loop's clock, L (draw()): (now − born) ms in at this frame, on the document's timeline. A draw from outside a frame (performance.now())
    // is ahead of the timeline, and a start time of born would put the track before its start for that frame: drawn with no breath (a Tinta
    // taking over from its kept first frame, which has its breath baked in, shrank for a frame: tinta-arrive-check, 7 Nov).
    anim.startTime = (document.timeline.currentTime ?? now) - (now - (this.born ?? 0));
    // As sharp as drawn in Chromium, whose compositor samples his texture under the breath (sharpen.js: on his own element, never through
    // motion.js, and every way it can end shows him at 1).
    this.motion = { of: motion, svg: this.svg, anim, sharpened: sharpen(this) };
  }

  /**
   * A held state's parts on their own tracks (the rig's `tracks`: a prop held still against the breath, doze's cloud drifting), played on the
   * elements its drawing marks data-track="<part>", on its clock as its motion is. A drawing puts in new elements, so each is started again.
   */
  playTracks() {
    this.partAnims ??= new Map();
    for (const track of this.tracks) {
      const node = this.svg.querySelector(`[data-track="${track.part}"]`);
      if (!node || typeof node.animate !== "function") continue;
      const was = this.partAnims.get(track.part);
      if (was?.lxTrack === track && was.playState === "running") {
        // The same track on the new drawing's part: the running animation moves over to it (built once: a track of 937 keyframes made
        // again at every drawing cost a box's Tinta 1.3 ms a drawing, more than drawing him).
        if (was.effect.target !== node) was.effect.target = node;
        continue;
      }
      was?.cancel();
      const anim = node.animate(framesOfTrack(track), { duration: track.period * 1000, iterations: Infinity, easing: "linear" });
      // On the breath's own clock (startMotion: its loop's time on the document's timeline), so the two stay one picture.
      anim.startTime = this.motion?.anim.startTime ?? this.born ?? 0;
      anim.lxTrack = track;
      this.partAnims.set(track.part, anim);
    }
  }

  /** Stops it: the drawing as drawn again. */
  stopMotion() {
    if (!this.motion) return;
    this.motion.anim.cancel();
    this.motion.sharpened?.cancel();
    for (const anim of this.partAnims?.values() ?? []) anim.cancel();
    this.partAnims?.clear();
    this.removeAttribute("data-breathing");
    this.motion = null;
  }

  /** Its held state: idle, loading, or one drafted on the rig (lounge, sleepy…). A reaction's name plays it once. */
  set state(name) {
    const clips = this.clips();
    if (playsOnce(clips, name)) return void this.play(name);
    if (!loops(clips, name)) return;
    this.base = name;
    this.held = null;
    this.finish();
    this.setAttribute("data-state", name);
    this.dirty = true;
    wake();
  }
  get state() {
    return this.base;
  }

  /** Plays a reaction once (right, wrong, heart, wave…); a press finishes it. Returns nothing: nothing waits for it. */
  play(name) {
    if (!playsOnce(this.clips(), name)) return void (this.state = name);
    this.finish();
    const ticker = this.still ? null : registerTicker(() => this.settle());
    this.setAttribute("data-state", name);
    if (!ticker) {
      // Animations Off (or a still): the reaction's still stands in for it, until its state changes (a redraw, for a
      // new theme, keeps it).
      this.held = name;
      this.show(this.stillOf(name), VIEW);
      return;
    }
    this.held = null;
    this.reaction = { kind: "play", name, t0: performance.now() / 1000, ticker };
    this.dirty = true;
    wake();
  }

  /** Points at each element in turn (where each is as it moves), then looks back at you; a press finishes it. */
  pointAt(elements) {
    const clues = [...elements].filter((e) => e?.isConnected);
    if (!clues.length || this.still || !motionOn()) return;
    this.finish();
    const ticker = registerTicker(() => this.settle());
    if (!ticker) return;
    const remake = (clips) => clips.pointing(clues.length);
    this.reaction = { kind: "point", name: "point", remake, act: remake(this.clips()), made: this.clips(), clues, t0: performance.now() / 1000, ticker };
    this.setAttribute("data-state", "point");
    this.dirty = true;
    wake();
  }

  /**
   * Plays an act another part of the app hands it (see the top of this file): make({ palette, size }) → { name, dur,
   * exit, frame(t, T, { rects, data, speak, endedAt }) }, on `targets` (elements; their boxes reach frame as rects).
   * Returns { set(data), end() }, which do nothing once the act is over or another has taken its place. Its first frame
   * is drawn at once; a press finishes it; with animations off, a still, or off the page, nothing plays.
   */
  perform(make, targets = [], { data = null, spares = null } = {}) {
    if (typeof make !== "function" || !this.isConnected || this.still || !motionOn()) return NOTHING;
    const list = [...(targets ?? [])];
    const remake = (clips) => {
      const act = make({ palette: this.cachedPal, size: this.size });
      if (typeof act?.frame !== "function") throw new TypeError("perform: make() returned no frame()");
      return act;
    };
    let act;
    try {
      act = remake(this.clips());
    } catch (error) {
      report(error);
      return NOTHING;
    }
    this.finish();
    const ticker = registerTicker(() => this.settle(), { spares });
    if (!ticker) return NOTHING;
    const name = typeof act.name === "string" && act.name ? act.name : "act";
    const r = { kind: "act", name, remake, act, made: this.clips(), targets: list, data, endedAt: null, t0: performance.now() / 1000, ticker };
    this.held = null;
    this.reaction = r;
    this.setAttribute("data-state", name);
    this.draw(performance.now(), true);
    wake();
    const current = () => this.reaction === r;
    return {
      set: (data) => {
        if (!current()) return;
        r.data = data;
        this.dirty = true;
        wake();
      },
      end: () => {
        if (!current() || r.endedAt !== null) return;
        r.endedAt = Math.max(0, performance.now() / 1000 - r.t0);
        this.dirty = true;
        wake();
      },
    };
  }

  /**
   * A tap on him where he can be poked. On his ink (the press that came down on it): his alone (never the link or card around him
   * opens), and a poke. Beside it, in his box: not his; it goes on up to the link or card around him.
   */
  pressed(event) {
    if (!this.hasAttribute("data-pokeable")) return;
    const mine = this.poking;
    this.poking = false;
    if (!mine) return;
    event.preventDefault();
    event.stopPropagation();
    // Which side of his middle: his body's as drawn (mid-run he may have slid a step off his box's middle).
    const box = this.getBoundingClientRect(), ink = this.inkBox();
    const middle = ink ? (ink.left + ink.right) / 2 : box.left + box.width / 2;
    const x = event.clientX || this.downAt || middle;
    this.poke(x < middle ? -1 : 1);
  }

  /** His bodies as drawn: each <use> of an outline his drawing fills, outside its defs, clips and masks, with the outline it draws. */
  bodies() {
    const svg = this.svg, out = [];
    if (!svg) return out;
    for (const use of svg.querySelectorAll("use")) {
      if (use.closest("defs, clipPath, mask, [clip-path], [mask]")) continue;
      const id = use.getAttribute("href") ?? use.getAttribute("xlink:href");
      const shape = id?.startsWith("#") ? svg.querySelector(`[id="${CSS.escape(id.slice(1))}"]`) : null;
      if (typeof shape?.isPointInFill === "function") out.push({ use, shape });
    }
    return out;
  }

  /** His body as drawn, as one box on the screen ({ left, top, right, bottom }, px), or null with none drawn. */
  inkBox() {
    let box = null;
    for (const { use } of this.bodies()) {
      const r = use.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      box = box
        ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
        : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    return box;
  }

  /** Whether a press came down on his ink (once a press: see onInkOf). */
  onInk(event) {
    if (!onInkOf.has(event)) onInkOf.set(event, this.inkAt(event.clientX, event.clientY));
    return onInkOf.get(event);
  }

  /**
   * Whether a point on the screen (px) is on his ink as drawn now, within `slop` px: his body, every outline his drawing fills (the
   * rig draws a body as a <use> of an outline in its <defs>; the eyes and the rest lie inside it). His ground's shadow and what he
   * holds aren't him; nor is an outline's copy drawn only inside a clip or a mask.
   */
  inkAt(x, y, slop = INK_SLOP) {
    const around = [[0, 0], ...Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4) * slop, Math.sin((i * Math.PI) / 4) * slop])];
    for (const { use, shape } of this.bodies()) {
      const back = use.getScreenCTM()?.inverse();
      if (!back) continue;
      for (const [dx, dy] of around) {
        if (shape.isPointInFill(new DOMPoint(x + dx, y + dy).matrixTransform(back))) return true;
      }
    }
    return false;
  }

  /**
   * Poked, on `side` of his middle (-1 his left on the screen, 1 the right): the rig's poke (poke.js) layered on the state he
   * stands in. A poke while he's at it is the next in the run, from where he is, at most one a beat; a run starts again (a
   * splat) once he's been left alone REST seconds. Nothing with animations off or a still, or in a state he's busy in.
   */
  poke(side = 1) {
    if (this.still || !motionOn() || !this.isConnected) return;
    const now = performance.now() / 1000;
    const run = this.pokes;
    if (run && this.reaction && this.reaction === run.r) {
      const at = now - run.r.t0, last = run.list.at(-1);
      if (at < last.at + BEAT) return;
      run.list = [...run.list, { at, n: last.n + 1, side }];
      run.handle.set({ pokes: run.list });
      return;
    }
    if (!this.clips().poke(this.base)) return;
    const ended = run ? run.t0 + pokeLength({ pokes: run.list }) : -Infinity;
    const list = [{ at: 0, n: run && now - ended < REST ? run.list.at(-1).n + 1 : 0, side }];
    const handle = this.perform(() => this.clips().poke(this.base), [], {
      data: { pokes: list },
      // A press on his ink is the next poke, never the end of this one; one beside it, in his box, ends it as any press does.
      spares: (event) => event.type === "pointerdown" && this.contains(event.target) && this.onInk(event),
    });
    const r = this.reaction;
    if (handle === NOTHING || r?.name !== "poke") return;
    this.pokes = { r, t0: r.t0, list, handle };
  }

  /**
   * Where elements are now, as boxes [x0, y0, x1, y1] in its drawing's units from its origin (its ground's middle), y
   * down as on the screen; null for one that has left the page.
   */
  boxesNow(elements) {
    const box = this.getBoundingClientRect();
    if (!box.height) return elements.map(() => null);
    const k = VIEW[3] / box.height;
    const ox = box.left + (-VIEW[0] / VIEW[2]) * box.width, oy = box.top + (-VIEW[1] / VIEW[3]) * box.height;
    return elements.map((e) => {
      if (!e?.isConnected) return null;
      const r = e.getBoundingClientRect();
      return [(r.left - ox) * k, (r.top - oy) * k, (r.right - ox) * k, (r.bottom - oy) * k];
    });
  }

  /** Where the clues are now (their middles), in its drawing's units from its origin, y down as on the screen. */
  cluesNow(clues) {
    return this.boxesNow(clues)
      .filter(Boolean)
      .map(([x0, y0, x1, y1]) => [(x0 + x1) / 2, (y0 + y1) / 2]);
  }

  /** Where its eyes go: an element (its middle), a point { x, y } on the screen, or null (back to its own glances). */
  lookAt(target) {
    this.target = target ?? null;
    this.lookedAt = performance.now();
    // Its eyes move: drawn every frame while they do, at rest or not.
    this.restUntil = 0;
    wake();
  }

  /**
   * Its eyes follow what you touch inside `container`: the control you press or focus, and the point under your finger
   * as you drag. Returns stop(); watching another container stops this one.
   */
  watch(container) {
    this.stopWatching?.();
    if (!container) return () => {};
    let held = false;
    const pressed = (node) => {
      const el = node?.closest?.('button, a, input, textarea, select, [role="button"], [data-part]');
      return el && el !== container && container.contains(el) ? el : null;
    };
    const down = (event) => {
      held = true;
      this.lookAt(pressed(event.target) ?? { x: event.clientX, y: event.clientY });
    };
    const move = (event) => {
      if (held) this.lookAt({ x: event.clientX, y: event.clientY });
    };
    const up = () => (held = false);
    const focus = (event) => {
      const el = pressed(event.target);
      if (el) this.lookAt(el);
    };
    container.addEventListener("pointerdown", down, true);
    container.addEventListener("focusin", focus);
    addEventListener("pointermove", move, true);
    addEventListener("pointerup", up, true);
    addEventListener("pointercancel", up, true);
    const stop = () => {
      container.removeEventListener("pointerdown", down, true);
      container.removeEventListener("focusin", focus);
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", up, true);
      if (this.stopWatching === stop) this.stopWatching = null;
      this.lookAt(null);
    };
    this.stopWatching = stop;
    return stop;
  }

  /** Its gaze now ({ look, weight } for the rig's idle, or null): toward its target, eased; back to its glances after. */
  gazeNow(now) {
    const dt = Math.min(0.1, Math.max(0, (now - (this.gazeAt ?? now)) / 1000));
    this.gazeAt = now;
    const watching = Boolean(this.target) && now - this.lookedAt < 2500 && (!(this.target instanceof Element) || this.target.isConnected);
    let want = [0, 0];
    if (watching) {
      const box = this.getBoundingClientRect();
      const cx = box.left + box.width / 2, cy = box.top + box.height * 0.6;
      let x = this.target.x, y = this.target.y;
      if (this.target instanceof Element) {
        const r = this.target.getBoundingClientRect();
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, reach = Math.min(1, d / 120);
      // Screen y runs down; its eyes' y runs up.
      want = [(dx / d) * reach * 0.8, (-dy / d) * reach * 0.6];
    }
    const g = (this.gaze ??= { look: [0, 0], weight: 0 });
    const toward = 1 - Math.exp(-dt / 0.07), handing = 1 - Math.exp(-dt / 0.2);
    if (watching) g.look = [g.look[0] + (want[0] - g.look[0]) * toward, g.look[1] + (want[1] - g.look[1]) * toward];
    g.weight += ((watching ? 1 : 0) - g.weight) * handing;
    if (!watching && g.weight < 0.01) g.weight = 0;
    this.looking = g.weight ? { look: [...g.look], weight: g.weight } : null;
    return this.looking;
  }

  /** Back to its loop, at once (a press, or the reaction's end). */
  settle() {
    this.finish();
    this.dirty = true;
    if (this.isConnected) this.draw(performance.now(), true);
  }

  /** Ends what it's doing (a reaction, a point, an act), without drawing: its marks taken off, its ticker let go. */
  finish() {
    const r = this.reaction;
    if (!r) return;
    this.reaction = null;
    for (const c of r.clues ?? []) c.removeAttribute("data-pointed");
    r.ticker?.end();
    this.setAttribute("data-state", this.base);
  }

  clips() {
    const pal = palette();
    if (!this.cached || this.cachedPal !== pal) {
      this.cached = tinta({ palette: pal, size: this.size, ground: this.ground !== false });
      this.cachedPal = pal;
    }
    return this.cached;
  }

  /** The reaction's frame at t seconds in, or null once it's over. A point or an act is made again for a new theme. */
  reactionFrame(r, clips, t, T, speak) {
    if (r.kind === "play") {
      const clip = clips[r.name];
      return t >= clip.dur ? null : clip.frame(t, T, speak);
    }
    if (r.made !== clips) {
      r.act = r.remake(clips);
      r.made = clips;
    }
    const { act } = r;
    if (r.kind === "point") {
      const { clues } = r;
      if (t >= act.dur) return null;
      // The clue it's on now is marked; the others aren't.
      const on = Math.min(clues.length - 1, Math.max(0, Math.floor((t - 0.5) / 0.9)));
      clues.forEach((c, i) => c.toggleAttribute("data-pointed", i === on && t > 0.5 && t < act.dur - 0.95));
      return act.frame(t, T, { targets: this.cluesNow(clues), speak });
    }
    const dur = Number(typeof act.durFor === "function" ? act.durFor(r.data) : (act.dur ?? Infinity)), exit = Math.max(0, Number(act.exit) || 0);
    const over = Math.min(Number.isNaN(dur) ? Infinity : dur, r.endedAt === null ? Infinity : r.endedAt + exit);
    if (t >= over) return null;
    const content = act.frame(t, T, { rects: this.boxesNow(r.targets), data: r.data, speak, endedAt: r.endedAt });
    if (typeof content !== "string") throw new TypeError(`perform: ${r.name}'s frame() returned no SVG`);
    return content;
  }

  /**
   * Its held state's drawing at L. A state with a rest (the rig's idle) is on the compositor: its breath and sway a transform the compositor
   * plays (startMotion), this drawing only what a transform can't show (a blink, a glance, the shiver, eyes on what you touch), and until the
   * next of those nothing at all (restUntil: frame() skips it and the loop sleeps). Any other state draws every frame as it always has.
   */
  heldFrame(clips, now, L) {
    const st = clips[this.base];
    const gaze = this.base === "idle" ? this.gazeNow(now) : null;
    if (typeof st.rest !== "function" || !st.motion) {
      this.stopMotion();
      return st.frame(L, L, gaze);
    }
    this.startMotion(st.motion, now);
    this.tracks = st.tracks ?? null;
    const watching = gaze !== null || (this.target && now - this.lookedAt < 2500);
    this.restUntil = watching || st.busy(L) ? 0 : now + (st.next(L) - L) * 1000;
    return st.rest(L, gaze);
  }

  /** A state's still, drawn once per theme: a redraw puts back the very same drawing. */
  stillOf(name) {
    const key = `${name} ${inkKey(palette())}`;
    this.stills ??= new Map();
    if (!this.stills.has(key)) this.stills.set(key, this.clips()[name].still());
    return this.stills.get(key);
  }

  show(content, view) {
    const box = view.join(" ");
    if (this.svg.getAttribute("viewBox") !== box) this.svg.setAttribute("viewBox", box);
    this.svg.innerHTML = content;
  }

  draw(now, force = false) {
    const clips = this.clips();
    this.restUntil = 0;
    this.tracks = null;
    if (this.still || !motionOn()) {
      this.stopMotion();
      this.speaking = null;
      if (this.reaction) {
        // Animations went off mid-move (the device's setting, another tab's): a reaction's still stands in for it, as
        // play() does then; a point or an act just ends (the page shows the result).
        const { kind, name } = this.reaction;
        this.finish();
        if (kind === "play") {
          this.held = name;
          this.setAttribute("data-state", name);
        }
        this.dirty = true;
      }
      if (this.dirty || force) this.show(this.stillOf(this.held ?? this.base), this.held || this.base !== "loading" ? VIEW : VIEW_LOADING);
      this.dirty = false;
      return;
    }
    if (this.held) {
      // Animations came back on: a reaction's still gives way to its state.
      this.held = null;
      this.setAttribute("data-state", this.base);
    }
    if (!force && !this.dirty && now - this.last < 1000 / (this.size < 120 ? 30 : 60) - 2) return;
    this.last = now;
    this.dirty = false;
    const T = now / 1000;
    // Its loop's clock: the page's, or, for a Tinta that took over from its kept first frame, its own from its first live frame (so that
    // frame is the one it held).
    if (this.born === null) this.born = now;
    const L = this.born === undefined ? T : (now - this.born) / 1000;
    const started = performance.now();
    let content = null;
    if (this.reaction) {
      const r = this.reaction;
      // Mid-reaction the app may be speaking: its mouth says the words in the reaction's pose.
      const speak = this.speaks && speech ? mouthNow().params : null;
      try {
        content = this.reactionFrame(r, clips, T - r.t0, L, speak);
      } catch (error) {
        // Someone's act went wrong: it's reported, and Tinta goes back to its loop (every other Tinta draws on).
        report(error);
      }
      if (content === null) {
        this.finish();
        content = this.heldFrame(clips, now, L);
      } else this.stopMotion();
    } else if (this.speaks && speech && this.base === "idle") {
      // Saying what the app says. `speaking` is what checks read: where in the sound it is and the mouth's opening.
      this.stopMotion();
      const { t, params, loud } = mouthNow();
      this.speaking = { kind: speech.kind, t, open: params.open, loud, words: speech.words.length, loudness: Boolean(envelope), at: performance.now() };
      content = clips.say(L, { params, loud });
    } else content = this.heldFrame(clips, now, L);
    if (!(this.speaks && speech && this.base === "idle" && !this.reaction)) this.speaking = null;
    this.show(content, this.base === "loading" && !this.reaction ? VIEW_LOADING : VIEW);
    if (this.tracks) this.playTracks();
    this.stats.frames++;
    this.stats.ms += performance.now() - started;
  }
}

if (!customElements.get("lx-tinta")) customElements.define("lx-tinta", Tinta);

/** The rig's own states (idle, right, wrong, loading, heart); the drafted ones are whatever its clips name besides. */
export { STATES };
