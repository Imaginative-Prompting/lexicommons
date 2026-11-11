// Sound effects (lx/sound.js, lx/sound-kit.js) in Node, with stand-ins for Web Audio, fetch and the page's events: nothing is
// decoded for real and nothing plays. What it holds:
//   the kit table: every role's files, each file once, Match's steps climbing and clamping, tiles taking turns;
//   shapeOf: where a sound starts (past a decoder's padding) and when it has passed, on made-up signals;
//   the context: made ahead of the first press, outside it (it opens the audio device: a long task), never with effects off; a press
//     only wakes it (resume() and a one-sample silence, inside the press); a press before it was made ahead makes it there; in a page,
//     made in the first frame after the app is ready (<html data-app-ready>), not before it nor inside the start's own work, and not
//     waiting for the kit; on a page that isn't the app's, once the kit is in;
//   play: nothing before the kit is in ("no-kit"), nothing before a press ("no-press"), off when the switch is off, an unknown
//     role refused; every report saying what was asked for (duck, afterSpeech), played or not; then, with a kit, the file each call plays, its start offset, the event it tells, clear resolving after the
//     sound's own clear; under speech the effects' gain goes to 30 % within 60 ms and back over 200 ms; { duck: true } starts there;
//     a celebration (afterSpeech) waits for words still being said and plays after them, or not at all once still() is false;
//   the switch: on by default, the old "A sound when you celebrate" off carrying over, its sync kind (only a choice syncs; a
//     record checked; another device's choice applied).
// node scripts/test-sound.mjs (exit 0 = pass)

import { registerHooks } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const JS = join(fileURLToPath(import.meta.url), "../../public/js");
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- the page, stood in ----------

const listeners = new Map();
globalThis.addEventListener = (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]);
globalThis.removeEventListener = () => {};
const told = [];
globalThis.CustomEvent ??= class extends Event {
  constructor(type, init) {
    super(type);
    this.detail = init?.detail;
  }
};
globalThis.dispatchEvent = (event) => (event.type === "lx-sound" && told.push(event.detail), true);
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.document = { hidden: false };
const fetched = [];
globalThis.fetch = async (url) => (fetched.push(String(url)), { ok: true, arrayBuffer: async () => new ArrayBuffer(8), json: async () => ({}) });

// A decoded sound: 10 ms of padding, then a 0.25 s tone falling away.
const RATE = 48000;
function fakeSamples() {
  const pad = 480;
  const x = new Float32Array(pad + RATE * 0.6);
  for (let i = 0; i < x.length - pad; i++) x[pad + i] = Math.sin((2 * Math.PI * 880 * i) / RATE) * Math.exp(-i / (RATE * 0.06));
  return x;
}
class FakeBuffer {
  constructor() {
    this.sampleRate = RATE;
    this.samples = fakeSamples();
  }
  getChannelData() {
    return this.samples;
  }
}
globalThis.OfflineAudioContext = class {
  async decodeAudioData() {
    return new FakeBuffer();
  }
};
const started = [];
const gains = [];
class FakeGain {
  constructor(name) {
    this.name = name;
    this.gain = {
      value: 1,
      events: [],
      cancelScheduledValues() {},
      setValueAtTime(v) {
        this.value = v;
      },
      setTargetAtTime(v, at, tc) {
        this.events.push({ v, at, tc });
        this.value = v;
      },
    };
    gains.push(this);
  }
  connect() {}
}
// A context starts suspended, as one made outside a press does in a browser; resume() wakes it. Each one made, and each resume() and
// source started, says whether it happened inside a press (press() below: the page's own listeners run, as a browser runs them).
const contexts = [];
let pressing = false;
const press = (type = "pointerdown") => {
  pressing = true;
  try {
    for (const fn of listeners.get(type) ?? []) fn({ type });
  } finally {
    pressing = false;
  }
};
globalThis.AudioContext = class {
  constructor() {
    this.state = "suspended";
    this.currentTime = 1;
    this.sampleRate = RATE;
    this.destination = {};
    this.madeInPress = pressing;
    this.resumed = [];
    contexts.push(this);
  }
  resume() {
    this.resumed.push(pressing);
    this.state = "running";
    return Promise.resolve();
  }
  createGain() {
    return new FakeGain(`gain${gains.length}`);
  }
  createBuffer(channels, length) {
    return Object.assign(new FakeBuffer(), { silence: length === 1 });
  }
  createBufferSource() {
    const source = { connect: (to) => (source.to = to), start: (at, offset) => started.push({ buffer: source.buffer, to: source.to, at, offset, inPress: pressing }) };
    return source;
  }
};

// ---------- the kit table ----------

const kit = await import(pathToFileURL(join(JS, "lx/sound-kit.js")).href);
const roles = Object.keys(kit.ROLES);
check(["right", "wrong", "tile-in", "tile-out", "match", "match-last", "match-miss", "session-done", "day-counted", "unit-done", "path-press", "tinta-hop"].every((r) => roles.includes(r)), `every role is in the kit (${roles.length})`);
const files = Object.values(kit.ROLES).flatMap((r) => r.files);
check(new Set(files).size === files.length, "no file is two roles'");
check(kit.fileFor("match", { step: 1 }) === "match-1.mp3" && kit.fileFor("match", { step: 4 }) === "match-4.mp3", "Match's steps climb");
check(kit.fileFor("match", { step: 99 }) === kit.ROLES.match.files.at(-1) && kit.fileFor("match", { step: 0 }) === "match-1.mp3", "a step past the end holds the last; none is the first");
check(kit.fileFor("tile-in", { count: 0 }) !== kit.fileFor("tile-in", { count: 1 }) && kit.fileFor("tile-in", { count: 0 }) === kit.fileFor("tile-in", { count: 2 }), "a tile's two take turns");
check(kit.fileFor("nope") === null, "an unknown role has no file");
check(kit.DUCK === 0.3 && kit.DUCK_DOWN_S === 0.06 && kit.DUCK_UP_S === 0.2, "the duck as agreed with the games: 30 %, 60 ms down, 200 ms up");

// shapeOf on a made-up sound: it starts after its 10 ms padding (less 1 ms), and has passed when it's 12 dB down (about 0.08 s
// for a 60 ms decay constant).
const shape = kit.shapeOf(fakeSamples(), RATE);
check(near(shape.start, 0.009, 0.0015), `a sound starts past a decoder's padding (${shape.start.toFixed(4)} s)`);
check(near(shape.clear, 0.0829, 0.012), `it has passed 12 dB down (${shape.clear.toFixed(3)} s; 0.083 expected)`);
check(kit.shapeOf(new Float32Array(100), RATE).clear === 0, "silence: nothing to wait for");

// ---------- play, before the kit's files are in ----------

const sound = await import(pathToFileURL(join(JS, "lx/sound.js")).href);
const speaking = await import(pathToFileURL(join(JS, "character/speaking.js")).href);
const settings = await import(pathToFileURL(join(JS, "study/settings.js")).href);
const last = () => told.at(-1);

check(sound.soundEffectsOn(), "effects are on by default");
if (!kit.KIT_READY) {
  const r = sound.play("right");
  check(r.played === false && last()?.why === "no-kit", `before the kit: nothing plays, "no-kit" told (${last()?.why})`);
  await sound.loadSounds();
  check(fetched.filter((u) => u.includes("/audio/fx/")).length === 0, "before the kit: nothing fetched");
  sound.play("tile-in", { duck: true });
  check(last()?.duck === true && last()?.afterSpeech === false, `before the kit, a report says what was asked for: duck ${last()?.duck}, afterSpeech ${last()?.afterSpeech}`);
  sound.play("session-done", { afterSpeech: true });
  check(last()?.duck === false && last()?.afterSpeech === true, `and afterSpeech (${last()?.afterSpeech})`);
}

// ---------- with a kit ----------

// The rest runs with the kit present: a module-loading hook marks it ready for this test only.
if (!kit.KIT_READY) {
  const text = (source) => (typeof source === "string" ? source : new TextDecoder().decode(source));
  registerHooks({
    load(url, context, next) {
      const out = next(url, context);
      const path = new URL(url).pathname;
      if (!url.includes("?ready")) return out;
      if (path.endsWith("/lx/sound-kit.js")) return { ...out, source: text(out.source).replace("export const KIT_READY = false;", "export const KIT_READY = true;") };
      if (path.endsWith("/lx/sound.js")) return { ...out, source: text(out.source).replace('from "./sound-kit.js"', 'from "./sound-kit.js?ready"') };
      return out;
    },
  });
}
const s = kit.KIT_READY ? sound : await import(pathToFileURL(join(JS, "lx/sound.js")).href + "?ready");
told.length = 0;
// The context is made ahead of the first press (prepareSound, once the kit is in): making one opens the audio device, a long task that
// held back the first tap's first frame. A press only wakes it, inside the press: resume() and a one-sample silence.
const made = contexts.length;
s.setSoundEffects(false);
s.prepareSound?.(); // (?. so a sound.js from before fails these checks rather than stopping the test)
press("pointerdown");
check(contexts.length === made, "effects off: no context made ahead, and none by a press (the press stays light)");
s.setSoundEffects(true);
s.prepareSound?.();
s.prepareSound?.();
const ahead = contexts.at(-1);
check(contexts.length === made + 1 && !ahead.madeInPress && ahead.state === "suspended" && ahead.resumed.length === 0, `made ahead: once, outside any press, suspended and not woken (${contexts.length - made} made)`);
let r = s.play("right");
check(r.played === false && last()?.why === "no-press" && !started.length, `before any press: nothing, even with the context made ("${last()?.why}")`);
// The first press anywhere wakes it.
press("pointerdown");
check(contexts.length === made + 1, "the first press makes no context: it wakes the one made ahead");
check(ahead.resumed.length === 1 && ahead.resumed[0] === true && ahead.state === "running", "resume() inside the press");
check(started.length === 1 && started[0].buffer.silence && started[0].inPress, "and a one-sample silence, inside the press (old Safari)");
press("click");
check(ahead.resumed.length === 1 && started.length === 1, "a press while it's running does nothing more");
await s.loadSounds();
check(fetched.filter((u) => u.includes("/audio/fx/")).length === kit.kitFiles().length, `the kit fetched once (${kit.kitFiles().length} files)`);
const playing = started.length;
r = s.play("right");
await wait(0);
check(r.played === true && started.length === playing + 1, "after a press: right plays");
const bus = started.at(-1).to;
check(near(started.at(-1).offset, 0.009, 0.0015), `from past its padding (offset ${started.at(-1).offset?.toFixed(4)})`);
check(last()?.role === "right" && last()?.played === true && last()?.file === "right.mp3", "and says so: lx-sound { role, played, file }");
let t0 = Date.now();
await r.clear;
check(Date.now() - t0 >= 60, `clear resolves once it has passed (${Date.now() - t0} ms)`);
s.play("wrong");
r = s.play("wrong");
check(r.played === false && last()?.why === "repeat", "the same sound twice within 30 ms is one press");
await wait(40);
r = s.play("match", { step: 3 });
check(last()?.file === "match-3.mp3", "Match's third pair plays its third step");
const t1 = s.play("tile-in");
await wait(40);
const t2 = s.play("tile-in");
check(told.filter((e) => e.role === "tile-in" && e.played).map((e) => e.file).join() === "tile-in-1.mp3,tile-in-2.mp3", "two tiles: the two files in turn");
r = s.play("no-such-role");
check(r.played === false && last()?.why === "unknown", "an unknown role: nothing");

// Under speech.
const end = speaking.startSpeech({ kind: "recording", lang: "nl", words: [{ text: "oma", start: 0, end: 0.4 }], clock: () => 0, src: null });
const down = bus.gain.events.at(-1);
check(down?.v === 0.3 && near(down.tc * 3, 0.06, 0.001), `words start: effects to 30 % within 60 ms (${down?.v}, ${(down?.tc * 3).toFixed(3)} s)`);
await wait(40);
r = s.play("wrong");
check(last()?.ducked === true, "an effect asked for while words are said is ducked");
end();
const up = bus.gain.events.at(-1);
check(up?.v === 1 && near(up.tc * 3, 0.2, 0.001), `words end: back up over 200 ms (${up?.v}, ${(up?.tc * 3).toFixed(3)} s)`);
await wait(40);
s.play("tile-in", { duck: true });
const under = started.at(-1).to;
check(under !== bus && under.gain.value === 0.3, "duck: true starts at 30 %, on its own path (never ducked twice)");
check(last()?.duck === true && last()?.played === true, "and its report says it was asked to start ducked");

// A celebration waits for words still being said.
const end2 = speaking.startSpeech({ kind: "device", lang: "nl", words: [{ text: "ja", start: 0, end: 0.3 }], clock: () => 0, src: null });
const before = started.length;
r = s.play("unit-done", { afterSpeech: true });
await wait(250);
check(started.length === before, "a celebration doesn't play over words still being said");
end2();
await wait(250);
check(started.length === before + 1 && last()?.role === "unit-done", "and plays once they've ended");
// A role the kit leaves silent on purpose (no files) is told as "none", and plays nothing.
const silentRole = Object.entries(kit.ROLES).find(([, r]) => !r.files.length)?.[0];
if (silentRole) {
  const n = started.length;
  await wait(40);
  r = s.play(silentRole);
  check(r.played === false && last()?.why === "none" && started.length === n, `${silentRole}, silent in this kit: told "none", nothing played`);
}
let here = true;
const end3 = speaking.startSpeech({ kind: "device", lang: "nl", words: [{ text: "ja", start: 0, end: 0.3 }], clock: () => 0, src: null });
s.play("day-counted", { afterSpeech: true, still: () => here });
here = false;
end3();
await wait(250);
check(last()?.role === "day-counted" && last()?.played === false && last()?.why === "gone", "not at all once its moment has left the screen");

// Hidden page, and the switch.
document.hidden = true;
await wait(40);
r = s.play("wrong");
check(r.played === false && last()?.why === "hidden", "a hidden page: nothing");
document.hidden = false;
s.setSoundEffects(false);
await wait(40);
r = s.play("wrong");
check(r.played === false && last()?.why === "off", "the switch off: nothing");
const t3 = Date.now();
await r.clear;
check(Date.now() - t3 < 20, "and clear resolves at once");

// A press before the context was made ahead (in a start's first moments): made there, as before, so no first press is left without sound.
{
  s.setSoundEffects(true);
  const early = await import(pathToFileURL(join(JS, "lx/sound.js")).href + "?ready-early");
  const n = contexts.length;
  early.play("right");
  check(last()?.why === "no-press" && contexts.length === n, "another start: nothing before a press, no context yet");
  press("touchend");
  const made = contexts.at(-1);
  check(contexts.length === n + 1 && made.madeInPress && made.resumed.length === 1 && made.resumed[0] === true, "a press before it's made ahead makes it there, and wakes it in the press");
  await early.loadSounds();
  await wait(40);
  check(early.play("right").played === true, "and it plays");
  s.setSoundEffects(false);
}

// ---------- the switch on every device ----------

const records = s.soundSync.records();
check(records.effects?.value === false && records.effects.at > 0, "a choice made here is a record to sync");
check(s.soundSync.check({ at: Date.now(), value: true }, "effects") && !s.soundSync.check({ at: Date.now(), value: "yes" }, "effects") && !s.soundSync.check({ at: Date.now(), value: true }, "__proto__") && !s.soundSync.check({ at: 0, value: true }, "effects"), "a record from elsewhere is checked: its key, a time, a true or false");
s.soundSync.apply({ effects: { at: Date.now() + 1000, value: true } });
check(s.soundEffectsOn(), "another device's newer choice is taken");
settings.resetStudySettings();
check(Object.keys(s.soundSync.records()).length === 0, "the default isn't a choice: nothing to sync, so a new device never overrides one");
// The old switch carries over.
store.set("lx.study.v1", JSON.stringify({ celebrate: { sound: false } }));
const fresh = await import(pathToFileURL(join(JS, "study/settings.js")).href + "?again");
check(fresh.getStudySettings().sound?.effects === false, "A sound when you celebrate turned off before: effects start off");

// ---------- when the context is made ahead, in a page ----------
// The page stood in: <html> and its attributes, a MutationObserver, frames drawn by hand, idle moments at once. (Last: window from here on.)
{
  s.setSoundEffects(true);
  const attrs = new Set();
  const observers = [];
  globalThis.MutationObserver = class {
    constructor(fn) {
      this.fn = fn;
    }
    observe() {
      observers.push(this);
    }
    disconnect() {
      observers.splice(observers.indexOf(this), 1);
    }
  };
  globalThis.document.documentElement = {
    hasAttribute: (name) => attrs.has(name),
    setAttribute: (name) => {
      attrs.add(name);
      for (const o of [...observers]) queueMicrotask(() => o.fn([]));
    },
  };
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => frames.push(fn);
  const frame = () => frames.splice(0).forEach((fn) => fn(performance.now()));
  globalThis.requestIdleCallback = (fn) => setTimeout(fn, 0);
  globalThis.window = globalThis;
  const n = contexts.length;
  const kitAsked = fetched.length;
  const page = await import(pathToFileURL(join(JS, "lx/sound.js")).href + "?in-the-app");
  frame();
  await wait(20);
  check(contexts.length === n, "the app's start: no context before it's ready, however many frames");
  document.documentElement.setAttribute("data-app-ready", "");
  await wait(20);
  check(contexts.length === n, "the app ready: none until its frame is drawn (never inside the start's own work)");
  frame();
  await wait(20);
  // (This page's own context, or none: an earlier stage's contexts are never this one.)
  const made = contexts.length > n ? contexts[n] : null;
  check(contexts.length === n + 1 && !made.madeInPress && made.state === "suspended" && made.resumed.length === 0, "its first frame drawn: made ahead, outside any press, suspended");
  check(fetched.length === kitAsked, "not waiting for the kit (fetched 1.5 s on)");
  press("pointerdown");
  const woken = contexts.length > n ? contexts[n] : null;
  check(contexts.length === n + 1 && woken === made && !woken.madeInPress && woken.resumed.length === 1 && woken.resumed[0] === true, "so a first press soon after makes none: it wakes that one, inside the press");
  // A page that isn't the app's (no data-app-ready): made ahead once the kit is in, as before.
  attrs.clear();
  const m = contexts.length;
  const other = await import(pathToFileURL(join(JS, "lx/sound.js")).href + "?not-the-app");
  frame();
  await wait(200);
  check(contexts.length === m, "a page that isn't the app's: nothing made in its first moments");
  await wait(1600);
  check(contexts.length === m + 1 && !contexts.at(-1).madeInPress, "and made ahead once the kit is in, outside any press");
  page.setSoundEffects(false);
  other.setSoundEffects(false);
}

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
