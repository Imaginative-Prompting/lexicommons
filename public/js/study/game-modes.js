// How each game is answered, for the places that list the games (Study's One game at a time, Choose the games): Tapping, Typing and Speaking,
// each its own section, since several games come in more than one of them (the same game typed, or tapped). The modes and each game's are
// plan.js's (GAME_MODES, modeOf: a game says its own, Study cards is tapped). And why a game can't play on this device, which both places
// show the same way: it stays in its section, quieter, and says why.

import { GAME_MODES, modeOf, needsSound } from "./plan.js";
import { hearsAnything } from "./voice.js";
import { chooseEngine } from "./speaking.js";
import { learningName } from "./learning.js";
import { setSpeechHearing } from "./deck.js";

/** The games, gentlest first, the way a learner meets them, as Study lists them (Study cards comes after them, in Tapping). */
export const QUICK_GAMES = ["see", "word", "match", "meaning", "fill", "choose", "place", "arrange", "translate", "type", "type-word", "type-gap", "hear-gap", "listen", "repeat", "say", "say-word", "repeat-word"];

// Choose the games calls Study cards "cards" (its setting's name); plan.js knows it as "card".
const modeOfWay = (kind) => modeOf(kind === "cards" ? "card" : kind);

/** The games in their modes' sections, each section's games in the order given: [{ id, name, kinds }], no empty section. */
export function byMode(kinds) {
  return GAME_MODES.map((mode) => ({ ...mode, kinds: kinds.filter((kind) => modeOfWay(kind) === mode.id) })).filter((mode) => mode.kinds.length);
}

// What the recognizer said last, so a redraw doesn't show a speaking game as playable while it's asked again.
let speaking = null;

/** Asks again whether this device can listen to you (the recognizer, speaking.js); resolves once it has answered. */
export function askSpeaking() {
  return chooseEngine()
    .then((choice) => {
      speaking = choice?.engine ? { ok: true } : { ok: false, why: choice?.why ?? (choice?.reason === "setup" ? "This browser has no speech recognizer of its own. Whisper can listen on this device once it's downloaded." : "This browser can't recognize speech.") };
      // A pack's plain cards are offered Say it only where something can listen (deck.js).
      setSpeechHearing(speaking.ok);
    })
    .catch(() => {});
}

/** Why a game can't run here, or null: { why, short, fix: { title, href } }. */
export function blockedBy(kind) {
  if (needsSound(kind) && !hearsAnything()) {
    return { why: `This device has no ${learningName()} voice, and nothing here is recorded in ${learningName()}, so there's nothing to hear.`, short: `No ${learningName()} voice here`, fix: { title: "Voices", href: "#settings/study/voices" } };
  }
  if (modeOfWay(kind) === "speak" && speaking && !speaking.ok) return { why: speaking.why, short: "Can't listen to you here", fix: { title: "Speaking", href: "#settings/study/speaking" } };
  return null;
}
