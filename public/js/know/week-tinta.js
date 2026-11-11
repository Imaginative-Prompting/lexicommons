// Tinta beside This week on the Knowledge page: weekCard's `tinta` hook (know/cards-more.js, lex-design-3's) calls weekTinta once as the
// card is built, with the slot at the end of its stat block (64 × 64, held by know.css from the card's first frame), today's glass, the
// week, and whether the card is arriving (a fresh build, or a redraw whose number changed; never with animations off).
// - He stands there idle, hidden from screen readers, and can be poked (character.js), as everywhere he stands on a tab.
// - When the week's number has grown since this device last saw it in this language, at most once a day, he holds his drip (ready) and,
//   the moment the glasses come into view (arrive(), from the card's own observer), throws it into today's glass: the rig's
//   inkdrop/today-throw.js with mark "into" (the drop falls to the glass's floor and is gone, no splat), settling into idle. arrive()
//   returns the landing's promise, and the card moves its glasses from that moment.
// - Nothing waits on him: the promise resolves at the landing (THROW_IMPACT), at once when a press ends the throw or anything's missing,
//   and never rejects; the card caps its wait at 2.5 s. With animations off, or a card that isn't arriving, nothing's thrown and the number
//   is taken as seen.
import * as ui from "../lx/ui.js";
import * as motion from "../lx/motion.js";
import { dayKey } from "./streak.js";
import { learning } from "../study/learning.js";
import { sampleKey } from "../study/sample-mode.js";

// Per language: { done } the week's number this device last showed, { thrown } the day (dayKey) he last threw.
const SEEN = sampleKey("lx.know.weekSeen");
const readSeen = () => {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN) ?? "null");
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
};
const writeSeen = (lang, entry) => {
  const all = readSeen();
  all[lang] = entry;
  try {
    localStorage.setItem(SEEN, JSON.stringify(all));
  } catch {
    // Full, or private browsing: it may throw again on another visit, never more than the number grows.
  }
};

/** weekCard's tinta hook: his place beside This week, and { arrive } when there's a throw to make, else null. */
export function weekTinta({ slot, glass, week, arriving }) {
  const lang = learning();
  const today = dayKey(Date.now());
  const seen = readSeen()[lang] ?? null;
  const done = Number(week?.done) || 0;
  // A first sight has nothing to compare with: he only stands there, and the number is the one to grow from.
  const grew = seen !== null && done > (Number(seen.done) || 0);
  const throws = Boolean(arriving && glass && motion.motionOn() && grew && seen.thrown !== today);
  const tinta = ui.character({ state: throws ? "ready" : "idle", size: 64, hidden: true, pokeable: true });
  slot.append(tinta);
  if (!throws) {
    writeSeen(lang, { done, thrown: seen?.thrown ?? null });
    return null;
  }
  let started = null;
  return {
    arrive() {
      if (started) return started;
      started = new Promise((resolve) => {
        // Seen from this moment, thrown or not: a press, a theme change or the card leaving never brings the throw back.
        writeSeen(lang, { done, thrown: today });
        let timer = 0;
        let ended = null;
        const land = () => {
          clearTimeout(timer);
          ended?.disconnect();
          resolve();
        };
        if (!glass.isConnected || !tinta.isConnected || !motion.motionOn()) return land();
        Promise.all([import("../character/rig/inkdrop/today-throw.js"), customElements.whenDefined("lx-tinta")])
          .then(([{ throwToday, THROW_IMPACT }]) => {
            if (!glass.isConnected || !tinta.isConnected || !motion.motionOn()) return land();
            // He goes on idle after it: the throw's last frame is idle's own drawing.
            ui.holdCharacter(tinta, "idle");
            tinta.perform((options) => throwToday({ ...options, into: "idle", mark: "into" }), [glass]);
            // Animations went off, or it couldn't start: the glasses move now.
            if (tinta.getAttribute("data-state") !== "throw") return land();
            timer = setTimeout(land, THROW_IMPACT * 1000);
            // Its end (back to idle), or a press ending it, lands it at once.
            ended = new MutationObserver(() => {
              if (tinta.getAttribute("data-state") !== "throw") land();
            });
            ended.observe(tinta, { attributes: true, attributeFilter: ["data-state"] });
          })
          .catch(land);
      });
      return started;
    },
  };
}
