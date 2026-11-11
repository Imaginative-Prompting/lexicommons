// How you like to study, kept on this device: how long a practice is, what a quick session is made of, and each way of
// studying's own settings. Settings → Study edits these.

import { learningName } from "./learning.js";

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
  const keys = path.split(".");
  let node = settings;
  for (const key of keys.slice(0, -1)) node = node[key];
  node[keys.at(-1)] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private browsing: the setting lasts for this visit.
  }
  for (const listener of listeners) listener(getStudySettings());
}

export function onStudySettingsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Another tab changed them. (Not in Node, where the scheduler's tests load this with the defaults.)
globalThis.addEventListener?.("storage", (event) => {
  if (event.key !== KEY) return;
  settings = load();
  for (const listener of listeners) listener(getStudySettings());
});

/** Back to the defaults (Settings → Your data → start over clears this too). */
export function resetStudySettings() {
  settings = clone(DEFAULTS);
  try {
    localStorage.removeItem(KEY);
  } catch {}
  for (const listener of listeners) listener(getStudySettings());
}
