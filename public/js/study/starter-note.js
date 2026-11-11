// A language's starter lessons: few have been read closely by anyone. Where they show, one quiet line says so, and where to say what's off.
// Its press opens the pack's own page in Explore, where each sentence has Suggest a fix and Flag it; from a lesson, that lesson's sentences.
import { el } from "../lx/ui.js";

/**
 * The line for a unit ({ id, title }, as lesson.unit has it): null unless it's a starter's First steps, so never on Dutch's own units or on the lessons
 * worked out after a starter. lesson: where it's shown from, if that's one lesson with sentences of its own.
 */
export function starterNote(unit, lesson = null) {
  const pack = /^(starter-[^/]+)\/first-steps$/.exec(unit?.id ?? "")?.[1];
  if (!pack) return null;
  const key = lesson && !lesson.full ? lesson.id.split("/").at(-1) : null;
  const href = `#explore/item/${encodeURIComponent(pack)}${key ? `?lesson=${encodeURIComponent(key)}` : ""}`;
  return el("p", { class: "lx-path-note" }, "These lessons are a start, and they can be wrong. See something off? ", el("a", { class: "lx-link", href }, "Tell us"), ".");
}
