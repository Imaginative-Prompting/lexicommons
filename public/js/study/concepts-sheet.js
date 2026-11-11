// Choose your concepts, on the screen: the drawer (conceptsSheet), and focusNames for what's picked as Study says it (in Practice's own line,
// shell/study.js, and the drawer's row, quick-play.js). What's picked, and what it means for a session, is concept-focus.js.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { FOCUS_LEAST, clearFocus, conceptLabel, conceptsMet, focusNow, setFocus } from "./concept-focus.js";

/** The concepts picked, shortly: two names and how many more. Apart by a dot, since a name may have commas of its own ("Want, can, must"). */
export const focusNames = (ids) => names(ids);
const names = (ids) => {
  const labels = ids.map(conceptLabel);
  return labels.length > 2 ? `${labels.slice(0, 2).join(" · ")} +${labels.length - 2}` : labels.join(" · ");
};

/**
 * The drawer: All concepts, then the concepts you've met, as a plain list with what's chosen bold and checked (the bible's long choice). All
 * concepts is chosen while none is picked, so nothing picked never reads as nothing allowed; picking one leaves All, and taking the last one
 * away, or pressing All, comes back to it.
 */
export function conceptsSheet() {
  const layer = ui.sheetLayer({ label: "Choose your concepts" });
  const list = el("ul", { part: "list", class: "lx-concept-choices" });
  const met = conceptsMet();
  const row = ({ title, sub, chosen, disabled = false, onclick }) => {
    const item = ui.listRow({ title, sub, onclick, trailing: el("span", { class: "lx-choice-check", "aria-hidden": "true" }, icon("check")) });
    const button = item.querySelector('[data-part="list-row"]');
    button.setAttribute("aria-pressed", String(chosen));
    if (disabled) {
      button.disabled = true;
      button.setAttribute("data-state", "thin");
    }
    return item;
  };
  const draw = () => {
    const on = new Set(focusNow());
    list.replaceChildren(
      row({ title: "All concepts", sub: `Every one you've met (${met.length.toLocaleString()})`, chosen: !on.size, onclick: () => (clearFocus(), draw()) }),
      ...met.map((concept) => {
        const thin = concept.sentences < FOCUS_LEAST;
        return row({
          title: concept.label,
          sub: thin ? `Only ${concept.sentences} ${concept.sentences === 1 ? "sentence" : "sentences"} so far: it needs ${FOCUS_LEAST}` : `${concept.sentences.toLocaleString()} sentences`,
          chosen: on.has(concept.id),
          disabled: thin,
          onclick: () => {
            const now = new Set(focusNow());
            if (now.has(concept.id)) now.delete(concept.id);
            else now.add(concept.id);
            setFocus([...now]);
            draw();
          },
        });
      }),
    );
  };
  draw();
  layer.lxBody.append(
    el(
      "div",
      { class: "lx-stack" },
      el("h2", { class: "lx-sheet-title" }, "Choose your concepts"),
      el("p", { class: "lx-games-sub" }, "Practice, the games and reviews keep to the ones you choose. Lessons stay as they are."),
      met.length ? list : ui.emptyState("You haven't met a grammar concept yet. Your first lessons bring them.", { pose: "lounge" }),
    ),
  );
  layer.lxOpen();
}
