// What a word's History (know/concept.js) calls each thing a session records an answer under: the kinds progress.js TESTS lists, the
// reader, a talk with your AI. A game is called by its own name in study/plan.js GAMES, the one Study shows, so a game added there is
// named here at once; only what isn't a game of its own is named below. scripts/test-activity-names.mjs fails on an activity left without
// a name. No DOM: Node's tests import it.

import { GAMES } from "../study/plan.js";
import { KINDS as PRACTICE_KINDS } from "../practice/protocol.js";

// Recorded under an id of their own, but a game's answers all the same: Listening's three ways, and Type it's id from before.
const AS_GAME = { "listen-type": "listen", "listen-meaning": "listen", "listen-order": "listen", write: "type" };

// The rest, in the words the app uses for them where they happen.
const OWN = {
  card: "Study card",
  // Put it in order with English tiles (a sentence built in English from what you hear).
  "arrange-english": "English tiles",
  "type-heard": "Type what you hear",
  // A script's letter (kana-ja), its step's own words.
  "type-sound": "Type how it's said",
  // A sentence read aloud (Say it when it shows the sentence; a practice card), its button's words.
  "read-aloud": "Read it aloud",
  // Lessons jumped past and marked done on the path ("Yes, mark them done").
  marked: "Marked as done",
  // A lesson's new thing, met: nothing asked, so never graded, but named all the same.
  meet: "Met in a lesson",
  reader: "Reading",
};

/** The activity's name, or null for one nothing here knows (a newer device's, say). */
export function activityName(activity = "") {
  if (Object.hasOwn(OWN, activity)) return OWN[activity];
  const game = Object.hasOwn(AS_GAME, activity) ? AS_GAME[activity] : activity;
  if (Object.hasOwn(GAMES, game)) return GAMES[game].name;
  if (activity.startsWith("practice:")) return `Talk: ${PRACTICE_KINDS[activity.slice(9)]?.name ?? "with your AI"}`;
  return null;
}
