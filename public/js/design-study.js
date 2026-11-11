// /design: Study's page's own part (lx/ui.js: wayTiles), the games as large buttons, three to a row. The page fills it from the games
// there are (study/quick-play.js, study/plan.js GAMES): one that can't play here (no voice, no recognizer) is quieter and says why on a press.

import * as ui from "./lx/ui.js";
import { GAME_ART_NAMES, gameArt } from "./lx/game-art.js";

const WAYS = [
  ["see", "cards", "Tap the picture"],
  ["word", "tag", "Pick the word"],
  ["match", "cards", "Match"],
  ["meaning", "tag", "What does it mean?"],
  ["fill", "pencil", "Fill the gap"],
  ["arrange", "moved", "Put it in Portuguese order"],
  ["listen", "ear", "Listening", "unavailable"],
  ["repeat", "speaker", "Repeat after", "unavailable"],
  ["say", "mic", "Say it"],
].map(([kind, icon, title, state]) => ({
  kind,
  icon,
  title,
  art: GAME_ART_NAMES.includes(kind) ? gameArt(kind, { size: 56 }) : null,
  ...(state ? { state, onclick: () => {} } : { href: "#design-study" }),
}));

export function studySection({ section, demo }) {
  return section(
    "study",
    "Study's page",
    "Every game as a large button, three to a row: a line with a hard edge under it that a press pushes down. One that can't play here is quieter and stays pressable, to say why.",
    demo("The games, with two that can't play here and the longest name", ui.wayTiles(WAYS)),
  );
}
