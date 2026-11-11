import { bareChoice, gapMarks } from "../../public/js/study/gap-marks.js";

// A question's own words, without its tags. A step's tags (Once more, New word, Not word for word: study/session.js stepTag) take no room
// of their own: show() puts them on the top edge of the question's card, inside it (the prompt's line, the word, a spoken line), or inside
// the instruction's span when the step has no card. So the textContent of either runs the tag's words on ("What did you hear?Not word for
// word", "I like coffee.Not word for word"), and a check reading it found no game and no sentence (v96). Self-contained, so Playwright can
// hand it to the page: `locator.evaluate(ownText)`.
export const ownText = (node) => {
  const copy = node.cloneNode(true);
  for (const tag of copy.querySelectorAll('[data-part="step-tags"], [data-part="step-tag"]')) tag.remove();
  return copy.textContent.trim();
};

/** The instruction over the current step ("What did you hear?"), without its tags. */
export const stepTitle = (page, session = '[data-part="session"]:not([data-ghost])') => page.locator(`${session} [data-part="activity-prompt"] > span`).first().evaluate(ownText);

// Fill's choices are words: the marks the gap's word is written with ("No," in "No, gracias.", "koffie," in "een koffie, graag.", "¿Tenemos"
// in "¿Tenemos que hacer esto?") stay out of them, drawn around the gap: study/gap-marks.js, the rule session.js draws with (pure, so it's
// imported here rather than copied).
/** The Fill choice a word is offered as: without the marks of the gap's own word (gapWord; the word itself unless given). */
export const fillChoice = (word, gapWord = word) => bareChoice(word, gapMarks(gapWord));
