// The language you're learning, and the one you learn it from: a setting on this device (localStorage
// "lx.learning.v1"), Dutch from English until you pick another. Studying draws on that language's packs (content.js),
// and evidence is recorded in it (progress.js). Other tabs follow a change.

// A learner's own languages first: the language you're learning may be one (lang/own-languages.js).
import "../lang/own-languages.js";
import { LANGUAGES, languageName } from "../lang/index.js";
import { sampleKey } from "./sample-mode.js";

// The sample learner's own while it's on (sample-mode.js): Dutch, until it picks another.
const KEY = sampleKey("lx.learning.v1");
const DEFAULT = { lang: "nl", from: "en" };
const listeners = new Set();

const valid = (value) => Boolean(value) && Boolean(LANGUAGES[value.lang]) && Boolean(LANGUAGES[value.from]) && value.lang !== value.from;

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (valid(value)) return { lang: value.lang, from: value.from };
  } catch {}
  return { ...DEFAULT };
}

let current = read();

/** The language you're learning ("nl"). */
export const learning = () => current.lang;

/** The language you learn it from ("en"). */
export const learningFrom = () => current.from;

/** The language you're learning, by name ("Dutch"); and the one you learn it from ("English"). */
export const learningName = () => languageName(current.lang);
export const learningFromName = () => languageName(current.from);

/** The language you're learning as a BCP 47 tag (nl-NL): what the device voice and the recognizers are asked for. */
export const learningLocale = () => LANGUAGES[current.lang].locale;

/**
 * The language you learn `lang` from, when you speak `speak` ("I speak", shell/interface-language.js iSpeak): what its packs are
 * written from, and never the language you learned before. Lexicommons' packs for every language are written from English, but
 * English's own, which are written from the learner's language (a starter for each language its learners speak). So English
 * comes from the language you speak, and every other language from English, until a pack carries a side for each learner
 * language (plan-localization §2.1). null: none to learn it from (English, for someone who speaks it or hasn't said).
 */
export function fromFor(lang, speak) {
  if (lang !== "en") return "en";
  return speak && speak !== "en" && LANGUAGES[speak] ? speak : null;
}

/**
 * Switches the language you're learning, and the one you learn it from: fromFor(lang, speak) from a picker, or a pack's own
 * from. Never swapped to the language learned before (a new learner who spoke Spanish and picked English got Dutch). With no
 * language to learn it from, nothing changes (false).
 */
export function setLearning(lang, from = fromFor(lang, null)) {
  if (!LANGUAGES[lang]) throw new Error(`Lexicommons doesn't know the language "${lang}".`);
  const next = { lang, from };
  if (!valid(next)) return false;
  if (next.lang === current.lang && next.from === current.from) return true;
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {}
  for (const listener of listeners) listener(current);
  return true;
}

/** Calls fn({ lang, from }) whenever the language changes, here or in another tab. Returns a function that stops it. */
export function onLearningChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY) return;
    const next = read();
    if (next.lang === current.lang && next.from === current.from) return;
    current = next;
    for (const listener of listeners) listener(current);
  });
}
