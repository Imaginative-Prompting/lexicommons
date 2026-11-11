// The app's own words, and the language they're in (docs/plan-localization.md §4.7). Three settings on this device (localStorage
// "lx.interface.v1": { speak, app, grow }) decide it:
// - I speak: the language you speak, asked at the first run (from the device's languages first, never assumed). The app's words come in
//   it when the app has that language. (Explanations follow it too once packs have sides in it; until then study stays on its own `from`,
//   study/learning.js.)
// - App language: another language for the app's words, to live in the one you're learning; null is the same as I speak.
// - Grow: off until it's turned on. With the app's words in the language you speak, each one turns into the language you're learning once
//   you know every word of it.
// Only a language the app has been translated into (a shipped locale, lx/locales.js) can be the app's: any other falls back to English,
// and Settings → Language says so plainly.
import { learning, onLearningChange } from "../study/learning.js";
import { loadLocale, shippedLocales } from "../lx/locales.js";
import { locale, setChooser, setLocale } from "../lx/i18n.js";
import { onProgressChange } from "../study/progress.js";
import { onContentChange } from "../study/content.js";
import { lemmaOfForm } from "../study/new-words.js";
import { knownWords } from "../know/summary.js";
import { appLanguageFor, decide, deviceLanguagesOf, grownKeys, settingOf, speakerOf } from "./interface-rules.js";
import { LANGUAGES } from "../lang/index.js";

const KEY = "lx.interface.v1";
const listeners = new Set();

/** The device's own languages Lexicommons knows, in its order ("en-GB" is en, "zh-TW" zh-Hant): what the first run offers first. */
export const deviceLanguages = () =>
  deviceLanguagesOf(typeof navigator !== "undefined" ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []);

export const isShipped = (code) => shippedLocales().includes(code);

function read() {
  try {
    return settingOf(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return settingOf(null);
  }
}
let current = read();
const save = (next) => {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {}
  for (const fn of listeners) fn(interfaceLanguage());
};

/** The language you speak, as set (the first run asks it); before that, the device's first language Lexicommons knows, or null. */
export const iSpeak = () => speakerOf(current, deviceLanguages());
/** Whether you've said which language you speak (the first run asks until you have). */
export const saidISpeak = () => current.speak !== null;
/** { speak, app, grow } as set. */
export const interfaceSetting = () => ({ ...current });

export function setISpeak(code) {
  if (!Object.hasOwn(LANGUAGES, code)) return;
  // An app language that's now the language you speak is just "the same".
  if (code !== current.speak) save({ ...current, speak: code, app: current.app === code ? null : current.app });
}
/** The app's language: a shipped locale, or null for the same as I speak. */
export function setAppLanguage(code) {
  const app = appLanguageFor(code, { shipped: shippedLocales(), speak: iSpeak() });
  if (app !== current.app) save({ ...current, app });
}
export function setGrow(on) {
  if (Boolean(on) !== current.grow) save({ ...current, grow: Boolean(on) });
}
export function onInterfaceChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
onLearningChange(() => {
  for (const fn of listeners) fn(interfaceLanguage());
});

/** What the settings decide now (interface-rules.js decide): { code, wanted, fallback, canGrow, growInto }. */
export const interfaceLanguage = () => decide(current, { device: deviceLanguages(), shipped: shippedLocales(), learning: learning() });

/** Whether Grow can work for the language you're learning: the app has to have its words in that language. */
export const canGrow = () => interfaceLanguage().canGrow;

// ---------- showing it ----------

const shownListeners = new Set();
// What's applied now: the locale's strings, and Grow's (the language it grows into, its strings, the keys grown so far).
const shown = { growInto: null, growStrings: null, grown: new Set() };
let applying = 0;

/**
 * Calls fn() when the app's words have changed language: a new locale, Grow turned on or off, or the language it grows into. The page
 * in view is drawn again then (shell/main.js), and <html lang>/dir follow it. A word growing as you learn it redraws nothing: what's
 * drawn next shows it. Returns a function to stop.
 */
export function onInterfaceShown(fn) {
  shownListeners.add(fn);
  return () => shownListeners.delete(fn);
}

/** The keys grown into the language you're learning now (Grow), for the screens that mark them. */
export const grownNow = () => shown.grown;
/** The language they've grown into, or null. */
export const grownInto = () => (shown.grown.size ? shown.growInto : null);

/** Works out which keys have grown, from what you know now. */
function regrow() {
  const lang = shown.growInto;
  shown.grown =
    lang && shown.growStrings && lang === learning()
      ? grownKeys(shown.growStrings, { lang, lemmaOf: lemmaOfForm, known: (lemma) => known.has(lemma) })
      : new Set();
}
// What you know, as lemmas, read once per regrow (knownWords works out each word's state).
let known = new Set();
function regrowNow() {
  known = shown.growInto ? knownWords({ lang: shown.growInto }) : new Set();
  regrow();
}

/**
 * Shows the app's words as the settings say (interfaceLanguage): the locale's strings, and Grow's. Resolves once they're applied; a
 * newer call wins over one still loading. A locale whose strings don't come (offline before it was ever kept, or a file that doesn't
 * read) shows English, as one not shipped does.
 */
export async function applyInterface() {
  const call = ++applying;
  const { code, growInto } = interfaceLanguage();
  const [strings, growStrings] = await Promise.all([code === "en" ? null : loadLocale(code), growInto ? loadLocale(growInto) : null]);
  if (call !== applying) return;
  const before = { locale: locale(), growInto: grownInto(), grown: shown.grown };
  setLocale(strings ? code : "en", { strings });
  shown.growInto = growStrings ? growInto : null;
  shown.growStrings = growStrings;
  regrowNow();
  // A grown message is counted and formatted in its own language (lx/i18n.js: the chooser's { locale, strings }).
  const chosen = shown.growStrings ? { locale: shown.growInto, strings: shown.growStrings } : null;
  setChooser(chosen ? (key) => (shown.grown.has(key) ? chosen : null) : null);
  const same = before.locale === locale() && before.growInto === grownInto() && before.grown.size === shown.grown.size && [...before.grown].every((key) => shown.grown.has(key));
  if (!same) for (const fn of shownListeners) fn();
}

// What you know changes as you answer: the grown keys follow, a second after the last change (an answer records several rows), and what's
// drawn next shows them. New packs bring new forms of words, so they're read again then too.
let regrowTimer = 0;
const regrowSoon = () => {
  if (!shown.growInto) return;
  clearTimeout(regrowTimer);
  regrowTimer = setTimeout(regrowNow, 1000);
};
onProgressChange(regrowSoon);
onContentChange(regrowSoon);
// The settings, or the language you're learning, change what's shown.
onInterfaceChange(() => applyInterface());
