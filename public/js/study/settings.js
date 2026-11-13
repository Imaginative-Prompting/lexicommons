// How you like to study: how long a practice is, what a quick session is made of, and each way of studying's own settings. Settings →
// Study edits these. Kept on this device, and (12 Nov 2026) on your other devices, each setting as you last set it (below); what belongs
// to a device stays on it.

import { learningName } from "./learning.js";
import { registerSync } from "../sync.js";

const KEY = "lx.study.v1";

export const LENGTHS = {
  short: { steps: 5, label: "Short", about: "about 3 minutes" },
  standard: { steps: 8, label: "Standard", about: "about 5 minutes" },
  long: { steps: 12, label: "Long", about: "about 8 minutes" },
};

export const WAYS = {
  cards: "Study cards",
  see: "Tap the picture",
  word: "Pick the word",
  translate: "What does it say?",
  choose: "Choose",
  get arrange() {
    return `Put it in ${learningName()} order`;
  },
  place: "Where does it go?",
  fill: "Fill the gap",
  meaning: "What does it mean?",
  match: "Match",
  type: "Type it",
  "type-word": "Type the word",
  "type-gap": "Type in the gap",
  "hear-gap": "Type what it says",
  listen: "Listening",
  say: "Say it",
  repeat: "Repeat after",
  "say-word": "Say the word",
  "repeat-word": "Repeat the word",
};

const DEFAULTS = {
  // 2 (9 Nov 2026): What does it say? shows its word-for-word line with the answer (load's migration).
  version: 2,
  // Practice: about how long, and after how many it suggests the next lesson.
  practice: { minutes: 5, suggestEvery: 3 },
  // What does it say?: its word-for-word line with the answer, after a miss and on a right answer (right.literal), as every game shows it; never
  // offered as a hint unless you turn the hint on (its tiles include the word-for-word line's words).
  translate: { hint: false, literal: true },
  see: { hint: false, literal: false },
  word: { hint: false, literal: false },
  quick: {
    length: "standard",
    newPerSession: 3,
    include: { see: true, word: true, translate: true, cards: true, choose: true, arrange: true, place: true, fill: true, meaning: true, match: true, type: true, "type-word": true, "type-gap": true, "hear-gap": true, listen: true, say: true, repeat: true, "say-word": true, "repeat-word": true },
  },
  cards: {
    literal: true, // show the Dutch-order line with the meaning
    reveal: "slide", // when it shows: slide (English order, then into Dutch) · dutch · english
    flip: true, // a control on the card to switch the line between Dutch and English order
    position: "below", // below or above the Dutch sentence
    natural: true, // show natural English with the meaning
  },
  // Each game: offer the Dutch-order line as a hint; show it (with its order switch) beside the answer.
  // right.literal: on a right answer too (where it says something the English doesn't: study/session.js finishStep), each game's literal still
  // turning it off for that game; on by default (9 Nov 2026).
  right: { literal: true },
  choose: { hint: true, literal: true },
  // tiles: dutch (the Dutch words) · english (the English, put into Dutch order) · mix (English for new sentences,
  // Dutch once you know them a little); stray: one tile that isn't in the sentence.
  arrange: { hint: true, literal: true, tiles: "mix", stray: true },
  place: { hint: true, literal: true },
  fill: { hint: true, literal: true },
  meaning: { literal: true },
  // from: english (type the Dutch for the English) · audio (type what you hear); accents: forgiving or strict.
  type: { hint: true, literal: true, from: "english", accents: "forgiving" },
  // mode: meaning (pick what it means) · order (put the words in the order you heard) · type (type what you heard) ·
  // mix (by how well you know the sentence).
  listen: { mode: "mix", literal: true },
  // show: after (the sentence appears once you've said it) · always.
  repeat: { show: "after", literal: true },
  match: { pairs: 4 },
  // Remembering: which strengths you train (a strength you don't is never due, and nothing asks you about it), and the
  // predicted recall a strength is due at (higher: more reviews, remembered better).
  memory: { train: { read: true, hear: true, say: true }, target: 0.9 },
  // Sound effects (lx/sound.js): on or off, and when that was chosen (at: 0 until it is), so
  // the choice syncs (kind "sound") and a new device's default never overrides it.
  sound: { effects: true, at: 0 },
  // Saying it: which recognizer (the browser's own, or Whisper running on this device), and what you're shown: the
  // Dutch sentence to read aloud, or the English to say in Dutch.
  // model: a Whisper model id, or "" for the one that suits this device.
  say: { engine: "browser", model: "", prompt: "dutch", hint: true, literal: true },
  // The script a language is studied in (study/script.js), for the languages that may be studied in their romanization instead of their
  // characters (Chinese in pinyin, Cantonese in jyutping): { <lang>: "characters" | "pinyin" | "jyutping" }, characters when not set.
  writing: {},
  // Hearing Dutch (Settings → Study → Voices). A pack's recorded voices belong to the pack, so they aren't chosen here:
  // sentences take turns between them, unless the pack's page pins one (pins: { packId: voice slug }).
  listening: {
    recorded: true, // play a pack's recordings when it has them
    device: "", // this device's voice for anything without a recording: a voiceURI, or "" for a Netherlands one
    pins: {},
    speed: "normal", // normal · slower
    cards: true, // play a study card's sentence when the card appears
    answers: true, // play the sentence after you answer a game
    tapWords: true, // say a word in the language you're learning as you tap it in a game: a tile, a choice, Match's, one tapped for its meaning (before 5 Nov: matchWords, Match's alone)
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));

function merge(base, saved) {
  if (!saved || typeof saved !== "object") return base;
  for (const key of Object.keys(base)) {
    if (saved[key] === undefined) continue;
    // An empty object in the defaults is an open map (listening.pins): keep what was saved in it.
    const open = base[key] && typeof base[key] === "object" && !Array.isArray(base[key]) && !Object.keys(base[key]).length;
    if (open) {
      if (saved[key] && typeof saved[key] === "object" && !Array.isArray(saved[key])) base[key] = saved[key];
    } else if (base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) base[key] = merge(base[key], saved[key]);
    else if (typeof saved[key] === typeof base[key]) base[key] = saved[key];
  }
  return base;
}

let settings = load();
const listeners = new Set();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const loaded = merge(clone(DEFAULTS), saved);
    // Before 26 Oct 10:3x, one setting held the voice: a device voice chosen then carries over.
    const old = saved?.listening?.voice;
    if (typeof old === "string" && old.startsWith("device:") && !saved.listening.device) loaded.listening.device = old.slice(7);
    // Before 5 Nov, only Match said the words you tapped (matchWords): turned off there, it stays off for every game.
    if (typeof saved?.listening?.matchWords === "boolean" && saved.listening.tapWords === undefined) loaded.listening.tapWords = saved.listening.matchWords;
    // Before 5 Nov 2026 the celebration's chime had its own switch: turned off then, every effect starts off.
    if (saved?.celebrate?.sound === false && saved?.sound === undefined) loaded.sound.effects = false;
    // Before version 2 (9 Nov 2026) What does it say?'s word-for-word line was off by default, and a device that saved any setting saved that
    // off with it, though no one chose it: it comes on once. One turned off from version 2 on stays off.
    if (saved && (typeof saved.version !== "number" || saved.version < 2) && saved.translate?.literal === false) loaded.translate.literal = true;
    loaded.version = DEFAULTS.version;
    return loaded;
  } catch {
    return clone(DEFAULTS);
  }
}

export const getStudySettings = () => clone(settings);

/** Sets one value by path ("cards.flip", "quick.include.match") and saves. */
export function setStudySetting(path, value) {
  setAt(settings, path, value);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private browsing: the setting lasts for this visit.
  }
  // Set here: dated, for your other devices (unless it's this device's own).
  if (synced(path, value)) {
    times[path] = Date.now();
    keepTimes();
    for (const fn of syncListeners) fn();
  }
  for (const listener of listeners) listener(getStudySettings());
}

function setAt(target, path, value) {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)] = value;
}
const valueAt = (source, path) => path.split(".").reduce((node, key) => (node && typeof node === "object" ? node[key] : undefined), source);

export function onStudySettingsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Another tab changed them. (Not in Node, where the scheduler's tests load this with the defaults.)
globalThis.addEventListener?.("storage", (event) => {
  if (event.key === TIMES) times = readTimes();
  if (event.key !== KEY) return;
  settings = load();
  for (const listener of listeners) listener(getStudySettings());
});

/**
 * Back to the defaults. Settings → Study's Reset (everywhere: true) is a choice like any other: every setting that goes to your other
 * devices goes back there too. Clearing this device (Settings → Your data) forgets them here alone; your account still has them.
 */
export function resetStudySettings({ everywhere = false } = {}) {
  const chosen = everywhere ? Object.keys(times) : [];
  settings = clone(DEFAULTS);
  times = {};
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(TIMES);
  } catch {}
  if (chosen.length) {
    const now = Date.now();
    for (const path of chosen) {
      // A pack's pinned voice has no default: it goes back to none (null, as unpinning it on the pack's page does).
      const value = valueAt(settings, path) ?? null;
      if (!synced(path, value)) continue;
      if (value === null) setAt(settings, path, null);
      times[path] = now;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {}
    keepTimes();
    for (const fn of syncListeners) fn();
  }
  for (const listener of listeners) listener(getStudySettings());
}

// ---------- on your other devices (sync.js, kind "study-settings") ----------
//
// Each setting is a record of its own (its path, "quick.include.match"), dated when it was set: a change on one device and another on a
// second both stay, and one never set goes nowhere, so a new device's defaults never undo your choices. What belongs to a device stays on
// it: which recognizer and model Say it runs here (Whisper is downloaded per device), this device's voice (listening.device), and sound
// effects (their own kind, lx/sound.js). A setting from another device is taken only if it's one of these and what it may be.
const TIMES = "lx.study.times.v1";
const HERE_ONLY = /^(?:version|sound(?:\.|$)|say\.(?:engine|model)$|listening\.device$)/;
const CHOICES = {
  "quick.length": Object.keys(LENGTHS),
  "cards.reveal": ["slide", "dutch", "english"],
  "cards.position": ["below", "above"],
  "arrange.tiles": ["dutch", "english", "mix"],
  "type.from": ["english", "audio"],
  "type.accents": ["forgiving", "strict"],
  "listen.mode": ["meaning", "order", "type", "mix"],
  "repeat.show": ["after", "always"],
  "say.prompt": ["dutch", "english"],
  "listening.speed": ["normal", "slower"],
};
const RANGES = { "practice.minutes": [1, 180], "practice.suggestEvery": [1, 100], "quick.newPerSession": [0, 50], "match.pairs": [2, 12], "memory.target": [0.5, 0.99] };
/** Whether a setting goes to your other devices, and a value is one it may be there. */
function synced(path, value) {
  if (typeof path !== "string" || path.length > 120 || HERE_ONLY.test(path)) return false;
  // The script a language is studied in (writing.<lang>): its characters, or its romanization (study/script.js checks it fits the language).
  if (/^writing\.[a-z]{2,3}(?:-[A-Z][a-z]{3})?$/.test(path)) return ["characters", "pinyin", "jyutping"].includes(value);
  // A pack's voice pinned on its page (listening.pins.<pack id>): a voice's slug, or null for none.
  if (/^listening\.pins\.[a-z0-9][a-z0-9-]{1,47}$/.test(path)) return value === null || (typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,47}$/.test(value));
  let node = DEFAULTS;
  for (const key of path.split(".")) {
    if (!node || typeof node !== "object" || Array.isArray(node) || !Object.hasOwn(node, key)) return false;
    node = node[key];
  }
  if ((node && typeof node === "object") || typeof value !== typeof node) return false;
  if (typeof value === "number") {
    const [low, high] = RANGES[path] ?? [0, 1e6];
    return Number.isFinite(value) && value >= low && value <= high;
  }
  if (typeof value === "string") return (CHOICES[path] ?? []).includes(value);
  return typeof value === "boolean";
}
// When each setting was set here. A device that kept settings before they went to other devices (before 12 Nov 2026) has none: what it
// chose then (each setting not at its default) counts as set at the dawn of time (1), so a new device takes it and any choice made since,
// on any device, wins over it. That's worked out in memory and written with the first setting set or brought here, so opening a page
// writes nothing (the try-out keeps only its own stores).
function readTimes() {
  try {
    const raw = localStorage.getItem(TIMES);
    if (raw === null) return chosenBefore();
    const kept = JSON.parse(raw);
    return kept && typeof kept === "object" && !Array.isArray(kept) ? kept : {};
  } catch {
    return {};
  }
}
function chosenBefore() {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {}
  if (saved === null) return {};
  const out = {};
  const walk = (node, base, path) => {
    for (const [key, value] of Object.entries(node ?? {})) {
      const at = path ? `${path}.${key}` : key;
      if (value && typeof value === "object" && !Array.isArray(value)) walk(value, base?.[key], at);
      else if (synced(at, value) && value !== base?.[key]) out[at] = 1;
    }
  };
  walk(settings, DEFAULTS, "");
  return out;
}
let times = readTimes();
function keepTimes() {
  try {
    localStorage.setItem(TIMES, JSON.stringify(times));
  } catch {}
}
const syncListeners = new Set();

export const studySettingsSync = {
  id: "study-settings",
  label: "How you like to study",
  icon: "sliders",
  counted: (n) => `${n.toLocaleString()} ${n === 1 ? "setting" : "settings"} you chose`,
  records() {
    const out = {};
    for (const [path, at] of Object.entries(times)) {
      const value = valueAt(settings, path);
      if (Number.isFinite(at) && at > 0 && synced(path, value)) out[path] = { at, value };
    }
    return out;
  },
  check: (record, key) => !record.gone && synced(key, record.value),
  // What a sync brought (never asking for another sync: only setStudySetting and Reset tell it).
  apply(newer) {
    for (const [path, record] of Object.entries(newer)) {
      setAt(settings, path, record.value);
      times[path] = record.at;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {}
    keepTimes();
    for (const listener of listeners) listener(getStudySettings());
    return [];
  },
  onChange: (fn) => {
    syncListeners.add(fn);
    return () => syncListeners.delete(fn);
  },
};
registerSync(studySettingsSync);
