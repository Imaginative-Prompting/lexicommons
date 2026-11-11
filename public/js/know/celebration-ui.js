// The moment at a finished session's summary (study/session.js): the streak rolling to today's number, a line in plain
// words, and at a milestone a bigger moment with a share card. One sound with the summary (lx/sound.js; Settings → Sound
// and speech → Sound effects turns it off): the unit's gold stop's at a milestone or a whole unit finished, "today counted"
// when today counts, else the session's end. It never blocks anything: Done and Study again are pressable from the first frame (the summary's bar),
// and the roll is text changing, nothing that moves under a finger. Animations off: the number is simply there.
// Tinta (ui.character, 72 px) stands above the number and reacts once the moment is on the page: it hops (`right`)
// when today counts, becomes a heart at a milestone, and stays calm on a mended day. Decoration: hidden from screen
// readers (the moment's label says it), no presses, and a press finishes it.

import { symbol } from "../lx/symbols.js";
import { el } from "../lx/ui.js";
import * as ui from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import * as motion from "../lx/motion.js";
import { momentWords } from "./celebrate.js";
import { play } from "../lx/sound.js";
import { drawShareCard, shareCard, tintaForCard } from "./share-card.js";
import { wordsKnownNow } from "./summary.js";
import { learningName } from "../study/learning.js";

/** Words you'd recall now, in the language you're learning (what Today's tile counts). */
export const wordsKnown = () => {
  try {
    return wordsKnownNow();
  } catch {
    return 0;
  }
};

// What the number counts: a words milestone's words in the language, a days milestone's days in a row, else days.
const unitOf = (m) => (m.milestone?.kind === "words" ? `${learningName()} words` : m.milestone?.kind === "days" ? "days in a row" : m.days === 1 ? "day" : "days");

/**
 * The moment, or null when the session changed nothing worth one (a second session the same day, no milestone). Its sound
 * plays either way, once nothing is being said: unit: the session was a unit's whole-unit lesson.
 */
export function celebration(m, { sound = true, unit = false } = {}) {
  const words = momentWords(m, learningName());
  const role = unit || m.milestone ? "unit-done" : words ? "day-counted" : "session-done";
  if (!words) {
    if (sound) play(role, { afterSpeech: true });
    return null;
  }
  const big = Boolean(m.milestone);
  const tinta = ui.character({ size: 72, hidden: true });
  const count = el("strong", { class: "lx-moment-count" });
  if (m.milestone?.kind === "words") count.textContent = m.milestone.n.toLocaleString();
  else motion.countUp(count, m.days, { from: m.from, format: (n) => String(Math.round(n)) });
  const node = el(
    "section",
    { part: "celebration", state: big ? "milestone" : "day", "aria-label": `${words.title}. ${words.line}` },
    el("div", { class: "lx-moment-character" }, tinta),
    // The number and its unit say it ("7 days in a row"); the line says what that means. Said once: the title is the
    // label's (and the share card's).
    el("div", { class: "lx-moment-head" }, m.milestone?.kind === "words" ? icon("book") : symbol("flame", { size: 44 }), count, el("span", { class: "lx-moment-unit" }, unitOf(m))),
    el("p", { class: "lx-moment-line" }, words.line),
    big
      ? ui.button("Share", {
          icon: "share",
          onclick: async () => {
            const blob = await drawShareCard({ big: m.milestone.n.toLocaleString(), title: m.milestone.kind === "days" ? "days in a row" : `${learningName()} words`, line: `Learning ${learningName()} on Lexicommons`, character: await tintaForCard() });
            await shareCard(blob, `lexicommons-${m.milestone.kind}-${m.milestone.n}.png`);
          },
        })
      : null,
  );
  if (sound) play(role, { afterSpeech: true, still: () => node.isConnected });
  // Its reaction once the moment is on the page (the summary puts it there at once).
  const reaction = big ? "heart" : m.mended ? null : "right";
  if (reaction) requestAnimationFrame(() => tinta.isConnected && ui.playCharacter(tinta, reaction));
  return node;
}
