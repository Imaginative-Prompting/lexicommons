// The script a language is studied in (12 Nov 2026): its own writing, or for Chinese and Cantonese the romanization over it instead, pinyin
// or jyutping, when you choose that (study settings' writing.<lang>). Reading one isn't reading the other, so a read answer is kept with the
// script it was read in (progress.js record: row.script), and a unit's read strength comes from its current script's answers alone: an
// answer read in pinyin never counts as reading the characters, and turning the characters back on finds them as they were left.

import { getStudySettings, onStudySettingsChange } from "./settings.js";
import { readingKind } from "../lang/readings.js";

/** The romanizations a language may be studied in instead of its characters: its readings' kind (lang/readings.js). */
export const ROMANIZATIONS = Object.freeze(["pinyin", "jyutping"]);
/** The script of a row with none: the language as it's written. */
export const CHARACTERS = "characters";

let chosen = getStudySettings().writing ?? {};
const listeners = new Set();
onStudySettingsChange((settings) => {
  const next = settings.writing ?? {};
  if (JSON.stringify(next) === JSON.stringify(chosen)) return;
  chosen = next;
  for (const fn of listeners) fn();
});

/** Whether a language may be studied in a romanization instead of its characters (its readings are one). */
export const romanizes = (lang) => ROMANIZATIONS.includes(readingKind(lang));

/** "characters", or the romanization a language is studied in instead ("pinyin" for Chinese, "jyutping" for Cantonese). */
export function scriptOf(lang) {
  const kind = readingKind(lang);
  return ROMANIZATIONS.includes(kind) && chosen?.[lang] === kind ? kind : CHARACTERS;
}

/** Calls fn when the script a language is studied in changes. Returns a stop. */
export function onScriptChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
