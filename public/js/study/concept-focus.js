// Choose your concepts: the grammar concepts Study's sessions keep to. Picking some makes Practice, the quick session, reviews, a topic and every
// game on Study use only sentences with at least one of them (study/plan.js, through focusNow); lessons and decks stay as they are, since a lesson is
// its own material. A concept with fewer sentences than one game's few rounds can't be picked, and says so, rather than playing the same few again.
// Kept on this device, per language. Pure, so the plan (and Node's tests of it) can read it; the drawer and Study's line are concepts-sheet.js.

import { ITEMS, PATTERNS, contentLanguage } from "./content.js";
import { conceptState } from "./progress.js";
import { sampleKey } from "./sample-mode.js";

// The sample learner's own while it's on (sample-mode.js): never yours.
const KEY = sampleKey("lx.study.focus.v1");
/** Fewer sentences than this and a concept can't be picked: one game's six questions would repeat them. */
export const FOCUS_LEAST = 6;

const listeners = new Set();
const read = () => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};
const write = (value) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private browsing: it lasts for this visit only.
  }
  memory = value;
  for (const fn of listeners) fn();
};
let memory = read();

/**
 * A concept's short name: its chip where the grammar gives one; else, as the chips after an answer do (after-answer.js), what comes before its name's colon
 * when that's a name in itself ("Comparisons", not "Comparisons: -er, meer, het -st, het meest"); else its name.
 */
export function conceptLabel(id) {
  const pattern = PATTERNS[id];
  if (!pattern) return id;
  if (pattern.chip) return pattern.chip;
  // A head that's a name in English (several words, or a capitalized one: "Present tense", "Comparisons"), never the language's own word ("dat").
  const [head] = String(pattern.name).split(":");
  return head !== pattern.name && (head.includes(" ") || /^\p{Lu}\p{Ll}{3,}$/u.test(head)) ? head : pattern.name;
}

/** How many sentences on this device use a concept. */
export const sentencesWith = (id) => ITEMS.filter((item) => item.concepts?.includes(id)).length;

/** The concepts picked, for the language you're learning: only ones that still exist here and have enough sentences. */
export function focusNow() {
  const picked = Array.isArray(memory[contentLanguage()]) ? memory[contentLanguage()] : [];
  return picked.filter((id) => typeof id === "string" && Object.hasOwn(PATTERNS, id) && sentencesWith(id) >= FOCUS_LEAST);
}

export function setFocus(ids) {
  write({ ...memory, [contentLanguage()]: [...new Set(ids)] });
}
export const clearFocus = () => setFocus([]);

/** Calls fn when what's picked changes (here, or in another tab). Returns a function that stops it. */
export function onFocusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
globalThis.addEventListener?.("storage", (event) => {
  if (event.key !== KEY) return;
  memory = read();
  for (const fn of listeners) fn();
});

/** The concepts you've met, the ones you know least well first (by level, then the share you got right), then by name: [{ id, label, sentences, level }]. */
export function conceptsMet() {
  const share = (state) => (state.right + state.wrong ? state.right / (state.right + state.wrong) : 1);
  return Object.keys(PATTERNS)
    .map((id) => ({ id, state: conceptState(`p:${id}`) }))
    .filter(({ state }) => !state.isNew)
    .sort((a, b) => a.state.level - b.state.level || share(a.state) - share(b.state) || conceptLabel(a.id).localeCompare(conceptLabel(b.id)))
    .map(({ id, state }) => ({ id, label: conceptLabel(id), sentences: sentencesWith(id), level: state.level }));
}
