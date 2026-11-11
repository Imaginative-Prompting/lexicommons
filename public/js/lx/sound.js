// Sound effects: the short sounds of right and wrong, a tile placed, Match's pairs, a session's end, the path. One kit, in one key
// (lx/sound-kit.js; its files in /audio/fx/, kept in the app's shell for offline), played through Web Audio so it starts at once.
//
// - Decoded ahead, with no press needed (an OfflineAudioContext decodes; its buffers play in any context), so the first one plays
//   in time. The context that plays them is made ahead too, in the first frame after the app is ready (its first page, or a first
//   run's first question, is up), not waiting for the kit: making one opens the audio device, a long task (190–305 ms on a phone
//   slowed 4×), and a first press that came before it made it there and held that press back (a first run's first tap, 0.3 s after
//   its question). Made outside a press it starts suspended; the first press anywhere wakes it (resume(), inside the press, as a
//   phone requires), and so does any later press (an iPhone suspends it for a call or the lock screen). Nothing plays before a press.
// - Under speech: every word said goes through study/voice.js, which announces it to character/speaking.js. While words are being
//   said, effects play at 30 %: down within about 60 ms, back up over about 200 ms after (lx/sound-kit.js DUCK). A tile placed as
//   its word is said starts at that level ({ duck: true }), not a beat later.
// - An answer's effect plays first; speech after it waits for its `clear` (when it has passed), so neither covers the other.
// - Celebrations ({ afterSpeech: true }) wait for a sentence still being said to end, up to 3 s, then play while still() holds.
// - It never sets the page's audio session (lx/audio-session.js): Web Audio plays as "ambient" on its own, so on an iPhone effects
//   follow the silent switch and mix with other apps' music.
// - Settings → Sound and speech → Sound effects turns them all off (on by default; synced through your storage, kind "sound").
// - Every request is told to the page as an "lx-sound" event ({ role, step, played, why, duck, afterSpeech, ducked }: duck and
//   afterSpeech as asked for, ducked whether it played ducked), so a check can see what was asked for and when without hearing
//   anything (checks are muted: scripts/quiet-browser.mjs).

import { DUCK, DUCK_DOWN_S, DUCK_UP_S, FX_DIR, KIT_READY, ROLES, fileFor, kitFiles, shapeOf } from "./sound-kit.js";
import { currentSpeech, onSpeech } from "../character/speaking.js";
import { getStudySettings, onStudySettingsChange, setStudySetting } from "../study/settings.js";
import { registerSync } from "../sync.js";

const decoded = new Map(); // file → { buffer, start, clear }
let loading = null;
let context = null;
let awake = false; // a press has woken the context: before one, a page may not start sound, and a phone wouldn't
let bus = null; // the effects' gain: ducked under speech
let under = null; // effects that start ducked (a tile under its word): never ducked twice
const counts = new Map(); // role → how many times it has played (tiles take turns)
const recent = new Map(); // role → when it last played (the same role twice within 30 ms is one press)

/** Whether sound effects are on (Settings → Sound and speech; on by default). */
export const soundEffectsOn = () => getStudySettings().sound?.effects !== false;

/** Turns them on or off, here and (through your storage) on your other devices. */
export function setSoundEffects(on) {
  setStudySetting("sound.at", Date.now());
  setStudySetting("sound.effects", Boolean(on));
}

/** Loads and decodes the kit (once). Resolves when it's ready, or with what it could load. */
export function loadSounds() {
  loading ??= (async () => {
    if (!KIT_READY) return;
    const Offline = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
    if (!Offline) return;
    let decoder;
    try {
      decoder = new Offline(1, 1, 48000);
    } catch {
      return;
    }
    await Promise.all(
      kitFiles().map(async (url) => {
        try {
          const bytes = await (await fetch(url)).arrayBuffer();
          const buffer = await decoder.decodeAudioData(bytes);
          decoded.set(url.slice(FX_DIR.length + 1), { buffer, ...shapeOf(buffer.getChannelData(0), buffer.sampleRate) });
        } catch {
          // A file that won't load or decode: its role stays silent.
        }
      }),
    );
  })();
  return loading;
}

// The context and its two paths (the effects' gain, ducked under speech; and effects that start ducked). Made ahead (prepareSound),
// or in a press that comes before that (a press in the app's first frames, or on a page that isn't the app's).
function make() {
  if (context) return true;
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Context) return false;
  try {
    context = new Context({ latencyHint: "interactive" });
    bus = context.createGain();
    bus.connect(context.destination);
    under = context.createGain();
    under.gain.value = DUCK;
    under.connect(context.destination);
    // Whatever is being said now, and from now on: the effects go down under it.
    onSpeech((speech) => duck(Boolean(speech)));
    return true;
  } catch {
    context = bus = under = null;
    return false;
  }
}

/** Makes the context ahead of a press, if effects are on and there's a kit (it starts suspended; a press wakes it). Called in the first
 * quiet moment after the app is ready, and again when the switch is turned on. */
export function prepareSound() {
  if (KIT_READY && soundEffectsOn()) make();
}

// Woken inside a press, as a phone requires (an iPhone plays nothing otherwise): resume(), and a one-sample silence that starts it
// on old Safari, both cheap. The making is costly, so a press makes it only when it wasn't made ahead, and not at all with effects
// off or no kit (it's made ahead once the switch is turned on).
function wake() {
  if (!context && (!KIT_READY || !soundEffectsOn())) return;
  if (!make()) return;
  try {
    if (context.state !== "running") {
      const silence = context.createBufferSource();
      silence.buffer = context.createBuffer(1, 1, context.sampleRate);
      silence.connect(context.destination);
      silence.start();
      context.resume().catch(() => {});
    }
    awake = true;
  } catch {}
}

function duck(down) {
  if (!bus) return;
  const now = context.currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(bus.gain.value, now);
  // setTargetAtTime reaches about 95 % in three time constants.
  bus.gain.setTargetAtTime(down ? DUCK : 1, now, (down ? DUCK_DOWN_S : DUCK_UP_S) / 3);
}

const PRESSES = ["pointerdown", "touchend", "click", "keydown"];
if (typeof addEventListener === "function") for (const type of PRESSES) addEventListener(type, wake, { capture: true, passive: true });

function tell(detail) {
  try {
    dispatchEvent(new CustomEvent("lx-sound", { detail }));
  } catch {}
}

// What a request asked for, in every report of it: { duck, afterSpeech }, as requested.
const nothing = (role, why, step, asked = {}) => {
  tell({ role, step, played: false, why, duck: Boolean(asked.duck), afterSpeech: Boolean(asked.afterSpeech), at: performance.now() });
  return { played: false, clear: Promise.resolve() };
};

/**
 * Plays a role's sound (lx/sound-kit.js ROLES). Options:
 *   step         Match's pair number, from 1: each pair one step higher
 *   duck         start at the ducked level: an effect that sounds with a word being said (a tile placed as its word is said)
 *   afterSpeech  wait for words still being said to end (up to 3 s), then play while still() holds: a celebration
 *   still        () → whether the moment is still on screen (afterSpeech)
 * Returns { played, clear }: clear resolves once the sound has passed (at once when nothing played); speech after an answer
 * waits for it. Never throws, never blocks.
 */
export function play(role, { step, duck: ducked = false, afterSpeech = false, still = () => true } = {}) {
  const asked = { duck: ducked, afterSpeech };
  if (!ROLES[role]) return nothing(role, "unknown", step, asked);
  if (!KIT_READY) return nothing(role, "no-kit", step, asked);
  if (!soundEffectsOn()) return nothing(role, "off", step, asked);
  if (typeof document !== "undefined" && document.hidden) return nothing(role, "hidden", step, asked);
  if (afterSpeech) {
    let resolve;
    const clear = new Promise((r) => (resolve = r));
    const started = Date.now();
    const when = () => {
      if (!still()) return resolve(nothing(role, "gone", step, asked).clear);
      if (currentSpeech() && Date.now() - started < 3000) return void setTimeout(when, 100);
      if (currentSpeech()) return resolve(nothing(role, "speech", step, asked).clear);
      resolve(start(role, { step, ducked, asked }).clear);
    };
    setTimeout(when, 0);
    return { played: true, clear };
  }
  return start(role, { step, ducked, asked });
}

function start(role, { step, ducked, asked }) {
  const now = performance.now();
  if (now - (recent.get(role) ?? -Infinity) < 30 && ROLES[role].pick !== "step") return nothing(role, "repeat", step, asked);
  // Woken by the first press (wake): before one, a page may not start sound, and a phone wouldn't. A sound started on a context
  // no press has woken would wait, and play late, at the next press.
  if (!context || !awake) return nothing(role, "no-press", step, asked);
  // "interrupted" (an iPhone's call, the lock screen) or "closed": the next press wakes it.
  if (context.state !== "running" && context.state !== "suspended") return nothing(role, context.state, step, asked);
  const count = counts.get(role) ?? 0;
  const file = fileFor(role, { step, count });
  // A role the kit leaves silent on purpose (no files).
  if (!file) return nothing(role, "none", step, asked);
  const sound = decoded.get(file);
  if (!sound) {
    loadSounds();
    return nothing(role, "loading", step, asked);
  }
  counts.set(role, count + 1);
  recent.set(role, now);
  try {
    const source = context.createBufferSource();
    source.buffer = sound.buffer;
    source.connect(ducked ? under : bus);
    source.start(context.currentTime, sound.start);
  } catch {
    return nothing(role, "failed", step, asked);
  }
  tell({ role, step, file, played: true, duck: Boolean(asked.duck), afterSpeech: Boolean(asked.afterSpeech), ducked: ducked || Boolean(currentSpeech()), at: now, clearAfter: sound.clear });
  return { played: true, clear: new Promise((r) => setTimeout(r, sound.clear * 1000)) };
}

// The context made ahead in the first frame after the app is ready (<html data-app-ready>, shell/main.js: its first page, or a first run's
// first question, is up), in a quiet moment there or AHEAD_WITHIN at most, so a person's first press finds it made and only wakes it; and
// again whenever the switch is turned on. The kit is decoded later, off the first frames' way; on a page that isn't the app's (no
// data-app-ready), the context is made ahead once the kit is in.
const AHEAD_WITHIN = 50; // ms
let started = false; // never in the start's own work: a settings change while it runs waits for it
function soon() {
  if (!started || context || !KIT_READY || !soundEffectsOn()) return;
  if (typeof requestIdleCallback === "function") requestIdleCallback(prepareSound, { timeout: AHEAD_WITHIN });
  else setTimeout(prepareSound, 0);
}
function begin() {
  if (started) return;
  started = true;
  soon();
}
if (typeof window !== "undefined") {
  // Once its frame is drawn: never inside the start's own work.
  const afterFrame = () => requestAnimationFrame(() => setTimeout(begin, 0));
  const root = document.documentElement;
  if (root.hasAttribute("data-app-ready")) afterFrame();
  else {
    const watching = new MutationObserver(() => {
      if (!root.hasAttribute("data-app-ready")) return;
      watching.disconnect();
      afterFrame();
    });
    watching.observe(root, { attributes: true, attributeFilter: ["data-app-ready"] });
  }
  setTimeout(() => loadSounds().then(begin), 1500);
  onStudySettingsChange(soon);
}

// ---------- the switch, on every device ----------

let applying = false;
/** Its sync kind (sync.js), exported so a test can apply a record as another device would send it. */
export const soundSync = {
  id: "sound",
  label: "Sound effects",
  icon: "speaker",
  counted: () => "on or off",
  // Only a choice you made syncs (at > 0): a new device's default never overrides it.
  records() {
    const s = getStudySettings().sound ?? {};
    return s.at > 0 ? { effects: { at: s.at, value: s.effects !== false } } : {};
  },
  check: (record, key) => key === "effects" && Number.isFinite(record?.at) && record.at > 0 && typeof record?.value === "boolean",
  apply(newer) {
    const record = newer.effects;
    if (!record) return [];
    applying = true;
    try {
      setStudySetting("sound.effects", record.value);
      setStudySetting("sound.at", record.at);
    } finally {
      applying = false;
    }
    return [];
  },
  // Only when the switch itself changed here (study settings change for many other reasons).
  onChange: (fn) => {
    let last = JSON.stringify(soundSync.records());
    return onStudySettingsChange(() => {
      const now = JSON.stringify(soundSync.records());
      if (now === last) return;
      last = now;
      if (!applying) fn();
    });
  },
};
registerSync(soundSync);
