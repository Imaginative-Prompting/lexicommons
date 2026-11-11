// Right-to-left text in an English interface. The interface never mirrors: only text in a right-to-left language runs
// right to left (an element holding it gets dir="rtl"), and a run of right-to-left script inside English text is
// isolated so the English punctuation around it stays where the English put it ("Questions: هل at the start (هل
// تتكلم؟)"). Pure, so scripts/test-bidi.mjs runs it; lx/ui.js puts it on the page.

import { directionOf } from "../lang/index.js";

/** The dir an element holding text in `lang` needs: "rtl" for a right-to-left language, null otherwise (it inherits). */
export const dirFor = (lang) => (directionOf(lang) === "rtl" ? "rtl" : null);

/** Gives a node its text's lang, and dir="rtl" with it when the language runs right to left (taken off otherwise). */
export function setLang(node, lang) {
  node.setAttribute("lang", lang);
  const dir = dirFor(lang);
  if (dir) node.setAttribute("dir", dir);
  else node.removeAttribute("dir");
}

// A run of right-to-left script starts with one of its letters and ends with a letter, a mark or the scripts' own
// punctuation (، ؛ ؟ ۔), and may hold spaces, digits, joiners and an ellipsis between, so a whole phrase (پٙه … کې), its ؟
// too, is one run.
// Arabic's joining stroke (tatweel, U+0640, a Common character) counts as a letter, so a suffix (ـَم) or a prefix (نـ)
// shown with it stays joined; and a hyphen touching a run's start or end is the run's own, so an affix shown with one
// (Sorani's دە-, -ەکە) keeps it on the side its word joins.
const RTL = "\\p{Script=Arabic}\\p{Script=Hebrew}\\p{Script=Syriac}\\p{Script=Thaana}\\p{Script=Nko}\\u0640";
const RUN = new RegExp(`[-\\u2010]?[${RTL}](?:[${RTL}\\p{M}\\p{N}\\u200c\\u200d\\s\\u2026\\u060c\\u061b\\u061f\\u06d4\\u05be]*[${RTL}\\p{M}\\u060c\\u061b\\u061f\\u06d4])?[-\\u2010]?`, "gu");

/** Text split into its right-to-left runs and the rest, in order: [{ text, rtl }]. Text with none is one piece. */
export function bidiRuns(text) {
  const source = String(text ?? "");
  const runs = [];
  let at = 0;
  for (const match of source.matchAll(RUN)) {
    if (match.index > at) runs.push({ text: source.slice(at, match.index), rtl: false });
    runs.push({ text: match[0], rtl: true });
    at = match.index + match[0].length;
  }
  if (at < source.length || !runs.length) runs.push({ text: source.slice(at), rtl: false });
  return runs;
}
