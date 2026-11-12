// The interface's words in the language it's shown in (../docs/plan-localization.md, outside this repo). Every word a
// person sees, hears from a screen reader or reads in a label goes through t(key, vars): the English is in
// js/i18n/en/<area>.js, each entry [text, about] (about: what it is and where, for whoever translates it); another
// locale's words come as a file (lexicommons-strings, below) and fall back to the English, never to a key. Pure (no DOM,
// no storage), so the Worker and the tests use the same code; shell/main.js sets the locale at start.
//
// A message is ICU MessageFormat's common part, on the browser's Intl:
//   {name}                             a value: a string as it is, a number in the locale's digits, a node kept as it is
//                                      (then t() returns an array of parts for el(), so a flag or a chip sits wherever
//                                      the translation puts it)
//   {n, number} {n, number, percent} {n, number, integer}
//   {s, lower}                         a value in lowercase, by the locale's rules (a title inside a sentence, in English)
//   {n, plural, =0 {…} one {# word} other {# words}}   the locale's own categories (Intl.PluralRules); # is n
//   {n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}   ordinals, by the locale's ordinal rules
//   {x, select, ai {…} other {…}}
//   '{' and '}' are literal braces; '' is one apostrophe; any other apostrophe is itself (What's, can't).
// Language names are a family of keys, language.<code>: in English the language's own module's name, in another
// locale its catalog's (languageLabel).
//
// Checks: the pseudo locale en-XA (every message's letters accented, the text longer by as much as a translation tends
// to be, in [ ]), so a word that didn't come through t() shows up plain English among it (scripts/i18n-walk.mjs
// --pseudo); and marking, where each message carries its key in characters that draw nothing (MARK_*), so a walk of the
// running app finds which key every piece of text on the screen is (--capture). Neither is ever on for a person.

import { LANGUAGES } from "../lang/index.js";
import { AREAS } from "../i18n/en/index.js";

export const STRINGS_FORMAT = "lexicommons-strings";
export const STRINGS_VERSION = 1;
export const PSEUDO_LOCALES = ["en-XA"];
const KEY = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9-]+)+$/;

// ---------- the English, from every area ----------

const english = new Map(); // key → text
const abouts = new Map(); // key → about
const duplicates = [];
for (const [area, entries] of Object.entries(AREAS)) {
  for (const [key, entry] of Object.entries(entries)) {
    if (english.has(key)) duplicates.push(key);
    english.set(key, Array.isArray(entry) ? entry[0] : entry);
    abouts.set(key, Array.isArray(entry) ? entry[1] : undefined);
    void area;
  }
}
for (const [code, language] of Object.entries(LANGUAGES)) {
  const key = `language.${code}`;
  if (!english.has(key)) {
    english.set(key, language.name);
    abouts.set(key, "A language's name, as a list, a row or a label shows it on its own (never inside a sentence).");
  }
}

/** Every English key with its text and about, the language family included: [{ key, text, about, area }]. */
export function englishEntries() {
  const areaOf = new Map();
  for (const [area, entries] of Object.entries(AREAS)) for (const key of Object.keys(entries)) areaOf.set(key, area);
  return [...english].map(([key, text]) => ({ key, text, about: abouts.get(key), area: areaOf.get(key) ?? "language" }));
}
/** Keys named in more than one area's file (each must be in one). */
export const duplicateKeys = () => [...duplicates];
export const isKey = (key) => typeof key === "string" && KEY.test(key);

// ---------- the locale ----------

// A check's own settings, put on the page before any of the app's code runs (scripts/i18n-walk.mjs addInitScript):
// { locale: a pseudo locale, file: a locale's strings file (lexicommons-strings), mark: true }. While it's there, the app
// can't set another locale. Nothing else sets it.
const CHECK = typeof globalThis.__lxI18nCheck === "object" && globalThis.__lxI18nCheck !== null ? globalThis.__lxI18nCheck : null;
const state = { locale: PSEUDO_LOCALES.includes(CHECK?.locale) ? CHECK.locale : "en", strings: null, mark: CHECK?.mark === true, chooser: null };
const listeners = new Set();
const keyIndex = new Map([...english.keys()].sort().map((key, i) => [key, i]));
const keyList = [...english.keys()].sort();

/** The interface's locale ("en", "es", "en-XA"). */
export const locale = () => state.locale;
/** The locale Intl is given (a pseudo locale formats as English). */
export const intlLocale = () => (PSEUDO_LOCALES.includes(state.locale) ? "en" : state.locale);
/** What <html lang> says. */
export const htmlLang = () => state.locale;
/** What <html dir> says: "rtl" for an interface written right to left. */
export const htmlDir = () => (LANGUAGES[state.locale]?.direction === "rtl" ? "rtl" : "ltr");

/**
 * Shows the interface in a locale: "en", a pseudo locale, or one whose strings file has been read (readStrings). Anything
 * else stays English. Calls the listeners when it changes.
 */
export function setLocale(code, { strings = null } = {}) {
  if (PSEUDO_LOCALES.includes(CHECK?.locale) || CHECK?.file) return;
  const next = typeof code === "string" && (code === "en" || PSEUDO_LOCALES.includes(code) || strings) ? code : "en";
  if (next === state.locale && strings === state.strings) return;
  state.locale = next;
  state.strings = next === "en" || PSEUDO_LOCALES.includes(next) ? null : strings;
  cache.clear();
  for (const fn of listeners) fn(state.locale);
}
export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
/** Marking for the capture walk (and test-i18n): each message carries its key, drawn as nothing. */
export function setMarking(on) {
  state.mark = Boolean(on);
}
/** Whether messages are marked now. */
export const marking = () => state.mark;
/**
 * Which strings a key is shown from, key by key: fn(key) → a strings map (readStrings' strings), { locale, strings } to
 * have a message from it counted and formatted in that locale's own plurals and numbers, or null for the interface's own.
 * For the app shown in the language you're learning, word by word as you learn them.
 */
export function setChooser(fn) {
  state.chooser = typeof fn === "function" ? fn : null;
}

// ---------- a locale's strings file ----------

/**
 * A short hash of a text (cyrb53, as hex), the English an entry was translated from: when the English changes, every
 * locale's entry for it is stale until it's translated again (scripts/i18n-freeze.mjs refuses a freeze with one).
 */
export function textHash(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/**
 * Everything a locale's strings file lacks against the English as it is now: the freeze's rules (scripts/i18n-freeze.mjs
 * refuses a freeze while any shipped locale has one) and the app's (readStrings). The file is
 * { format: "lexicommons-strings", version: 1, locale, strings: { key: { text, from } } }, from the hash of the English the
 * entry was translated from. Returns { locale, errors (the file itself), missing (English keys it has no entry for), stale
 * (translated from English that has since changed), broken: [{ key, problem }] (doesn't read, or drops or invents a value),
 * plurals: [{ key, lacks: [category] }] (a plural without an option for every category the locale's own rules have),
 * unknown (keys the English doesn't have), ok: [key] }.
 */
export function localeProblems(file) {
  const out = { locale: null, errors: [], missing: [], stale: [], broken: [], plurals: [], unknown: [], ok: [] };
  if (!file || typeof file !== "object" || file.format !== STRINGS_FORMAT) return (out.errors.push(`format must be ${STRINGS_FORMAT}`), out);
  if (file.version !== STRINGS_VERSION) return (out.errors.push(`version must be ${STRINGS_VERSION}`), out);
  if (typeof file.locale !== "string" || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(file.locale)) return (out.errors.push("locale must be a BCP 47 tag"), out);
  out.locale = file.locale;
  if (!file.strings || typeof file.strings !== "object" || Array.isArray(file.strings)) return (out.errors.push("strings must be an object"), out);
  let categories;
  try {
    categories = { cardinal: pluralCategories(file.locale), ordinal: pluralCategories(file.locale, { ordinal: true }) };
  } catch {
    out.errors.push(`Intl has no plural rules for ${file.locale}`);
    categories = { cardinal: ["other"], ordinal: ["other"] };
  }
  for (const [key, entry] of Object.entries(file.strings)) {
    if (!english.has(key)) {
      out.unknown.push(key);
      continue;
    }
    if (!entry || typeof entry !== "object" || typeof entry.text !== "string" || typeof entry.from !== "string") {
      out.broken.push({ key, problem: "each entry is { text, from }" });
      continue;
    }
    const problem = messageProblem(entry.text, english.get(key));
    if (problem) {
      out.broken.push({ key, problem });
      continue;
    }
    if (entry.from !== textHash(english.get(key))) {
      out.stale.push(key);
      continue;
    }
    const lacks = pluralLacks(parseMessage(entry.text), categories);
    if (lacks.length) {
      out.plurals.push({ key, lacks });
      continue;
    }
    out.ok.push(key);
  }
  for (const key of english.keys()) if (!Object.hasOwn(file.strings, key)) out.missing.push(key);
  return out;
}

/** The plural categories of locale code that a message's plurals have no option for (what a freeze refuses). */
export const pluralLacking = (text, code) => pluralLacks(parseMessage(text), { cardinal: pluralCategories(code), ordinal: pluralCategories(code, { ordinal: true }) });

// The categories a message's plurals leave without an option of their own (an =N option covers one number, not a category).
function pluralLacks(parsed, categories, into = new Set()) {
  for (const part of parsed) {
    if (typeof part !== "object" || part === null) continue;
    if (part.plural) for (const category of categories.cardinal) if (!Object.hasOwn(part.options, category)) into.add(category);
    if (part.selectordinal) for (const category of categories.ordinal) if (!Object.hasOwn(part.options, category)) into.add(`${category} (ordinal)`);
    if (part.plural || part.select || part.selectordinal) for (const option of Object.values(part.options)) pluralLacks(option, categories, into);
  }
  return [...into];
}

/**
 * A locale's strings file, read for showing: { locale, strings: Map key → text, stale: [key], unknown: [key], errors:
 * [message] }. An entry whose English has changed since, or that doesn't read, is left out (its English shows), as is one
 * for a key the English doesn't have; a plural short of a category still shows (its other option stands in), though a
 * freeze refuses it.
 */
export function readStrings(file) {
  const found = localeProblems(file);
  const out = { locale: found.locale, strings: new Map(), stale: found.stale, unknown: found.unknown, errors: [...found.errors, ...found.broken.map(({ key, problem }) => `${key}: ${problem}`)] };
  for (const key of [...found.ok, ...found.plurals.map((p) => p.key)]) out.strings.set(key, file.strings[key].text);
  return out;
}

// ---------- messages ----------

// A plural's # (its number), as a part of its own: never confused with the text "#".
const POUND = Object.freeze({ pound: true });

/** A message's parts: text, { arg, type?, style? }, { plural|select, options: { key: parts } }, POUND inside a plural. */
export function parseMessage(text) {
  let i = 0;
  const n = text.length;
  function parts(inPlural, untilBrace) {
    const out = [];
    let buf = "";
    const flush = () => {
      if (buf) out.push(buf);
      buf = "";
    };
    while (i < n) {
      const c = text[i];
      if (c === "'") {
        if (text[i + 1] === "'") {
          buf += "'";
          i += 2;
          continue;
        }
        const next = text[i + 1];
        if (next === "{" || next === "}" || (inPlural && next === "#")) {
          const end = text.indexOf("'", i + 1);
          if (end < 0) throw new Error("a quoted part never closes");
          buf += text.slice(i + 1, end);
          i = end + 1;
          continue;
        }
        buf += c;
        i++;
        continue;
      }
      if (c === "}") {
        if (!untilBrace) throw new Error("a } with no {");
        flush();
        return out;
      }
      if (c === "#" && inPlural) {
        flush();
        out.push(POUND);
        i++;
        continue;
      }
      if (c === "{") {
        flush();
        i++;
        out.push(argument());
        continue;
      }
      buf += c;
      i++;
    }
    if (untilBrace) throw new Error("a { never closes");
    flush();
    return out;
  }
  const space = () => {
    while (i < n && /\s/.test(text[i])) i++;
  };
  const word = () => {
    space();
    const m = /^[A-Za-z_][\w-]*/.exec(text.slice(i));
    if (!m) throw new Error(`a name was expected at ${i}`);
    i += m[0].length;
    space();
    return m[0];
  };
  function argument() {
    const name = word();
    if (text[i] === "}") {
      i++;
      return { arg: name };
    }
    if (text[i] !== ",") throw new Error(`{${name} needs } or ,`);
    i++;
    const type = word();
    if (type === "plural" || type === "select" || type === "selectordinal") {
      if (text[i] !== ",") throw new Error(`{${name}, ${type} needs its options`);
      i++;
      const options = {};
      space();
      while (i < n && text[i] !== "}") {
        let selector;
        if (text[i] === "=") {
          const m = /^=\d+/.exec(text.slice(i));
          if (!m) throw new Error("=N needs a number");
          selector = m[0];
          i += m[0].length;
          space();
        } else selector = word();
        if (text[i] !== "{") throw new Error(`the option ${selector} needs {…}`);
        i++;
        if (Object.hasOwn(options, selector)) throw new Error(`the option ${selector} is there twice`);
        options[selector] = parts(type !== "select", true);
        i++; // past its }
        space();
      }
      if (text[i] !== "}") throw new Error(`{${name}, ${type} never closes`);
      i++;
      if (!options.other) throw new Error(`{${name}, ${type} needs an other`);
      return { [type]: name, options };
    }
    if (type !== "number" && type !== "lower") throw new Error(`{${name}, ${type}}: the type must be number, lower, plural, selectordinal or select`);
    let style;
    if (text[i] === ",") {
      i++;
      style = word();
      if (type !== "number" || !["percent", "integer"].includes(style)) throw new Error(`{${name}, ${type}, ${style}}: no such style`);
    }
    if (text[i] !== "}") throw new Error(`{${name}, ${type} never closes`);
    i++;
    return style ? { arg: name, type, style } : { arg: name, type };
  }
  return parts(false, false);
}

/** Every value a message's parts name, with how: Map name → "value" | "number" | "lower" | "plural" | "select". */
export function argumentsOf(parsed, into = new Map()) {
  for (const part of parsed) {
    if (typeof part === "string") continue;
    if (part.arg) into.set(part.arg, part.type ?? into.get(part.arg) ?? "value");
    if (part.plural || part.select || part.selectordinal) {
      into.set(part.plural ?? part.select ?? part.selectordinal, part.plural ? "plural" : part.select ? "select" : "selectordinal");
      for (const option of Object.values(part.options)) argumentsOf(option, into);
    }
  }
  return into;
}

/**
 * What's wrong with a translation of english, or null: it doesn't parse, names a value the English doesn't give, or
 * leaves out one it does (a plural or select may be written as its value: "{n}" for "{n, plural, …}" isn't enough, it
 * must count with the locale's own categories).
 */
export function messageProblem(text, englishText) {
  let mine;
  let theirs;
  try {
    mine = argumentsOf(parseMessage(text));
  } catch (error) {
    return `it doesn't read: ${error.message}`;
  }
  try {
    theirs = argumentsOf(parseMessage(englishText));
  } catch (error) {
    return `its English doesn't read: ${error.message}`;
  }
  for (const name of mine.keys()) if (!theirs.has(name)) return `{${name}} isn't a value its English gives`;
  for (const [name, how] of theirs) {
    if (!mine.has(name)) return `{${name}} is left out`;
    if ((how === "plural" || how === "select" || how === "selectordinal") && mine.get(name) !== how) return `{${name}} must be a ${how}`;
  }
  return null;
}

/** The plural categories a plural in this locale must have options for ("one", "few", "other", …); ordinal: a selectordinal's. */
export const pluralCategories = (code, { ordinal = false } = {}) => new Intl.PluralRules(code, ordinal ? { type: "ordinal" } : undefined).resolvedOptions().pluralCategories;

// ---------- formatting ----------

const formatters = new Map();
// A tag Intl can use, or the interface's: a chooser's locale is data, so a bad one never breaks a message.
const usable = (code) => {
  try {
    return typeof code === "string" && code ? (Intl.getCanonicalLocales(code)[0] ?? intlLocale()) : intlLocale();
  } catch {
    return intlLocale();
  }
};
const formatter = (kind, options, locale = intlLocale()) => {
  const id = `${locale}|${kind}|${JSON.stringify(options ?? {})}`;
  if (!formatters.has(id)) {
    const make = { number: Intl.NumberFormat, date: Intl.DateTimeFormat, list: Intl.ListFormat, plural: Intl.PluralRules, relative: Intl.RelativeTimeFormat }[kind];
    formatters.set(id, new make(locale, options));
  }
  return formatters.get(id);
};
/** A number in the interface's locale. */
export const formatNumber = (value, options) => formatter("number", options).format(value);
/** A date (a Date or a time in ms) in the interface's locale. */
export const formatDate = (value, options) => formatter("date", options).format(value);
/** Several things as the locale lists them ("a, b and c"). */
export const formatList = (items, options = { type: "conjunction" }) => formatter("list", options).format(items);
/** A time from now ("in 3 days", "yesterday"). */
export const formatRelative = (value, unit, options = { numeric: "auto" }) => formatter("relative", options).format(value, unit);

// ---------- t() ----------

const cache = new Map(); // text → parsed
const problems = [];
const tell = (problem) => {
  if (problems.length < 200) problems.push(problem);
  if (typeof console !== "undefined") console.error(`[i18n] ${problem}`);
};
/** What t() found wrong since the start (a missing key, a missing value), for checks. */
export const i18nProblems = () => [...problems];

const isPart = (value) => value !== null && typeof value === "object"; // a node, or an array of parts

// A message's parts with vars put in, counted and formatted in locale (the interface's, or a chooser's for its own strings).
function render(parsed, vars, key, count, locale) {
  const out = [];
  for (const part of parsed) {
    if (typeof part === "string") {
      out.push(pseudoText(part));
      continue;
    }
    if (part === POUND) {
      out.push(formatter("number", undefined, locale).format(count));
      continue;
    }
    if (part.plural || part.selectordinal) {
      const name = part.plural ?? part.selectordinal;
      const value = vars?.[name];
      if (typeof value !== "number") tell(`${key}: {${name}} must be a number`);
      const n = typeof value === "number" ? value : 0;
      const exact = part.options[`=${n}`];
      const rules = part.plural ? formatter("plural", undefined, locale) : formatter("plural", { type: "ordinal" }, locale);
      const option = exact ?? part.options[rules.select(n)] ?? part.options.other;
      out.push(...render(option, vars, key, n, locale));
      continue;
    }
    if (part.select) {
      const value = vars?.[part.select];
      const option = Object.hasOwn(part.options, String(value)) && String(value) !== "other" ? part.options[String(value)] : part.options.other;
      out.push(...render(option, vars, key, count, locale));
      continue;
    }
    if (!vars || !Object.hasOwn(vars, part.arg) || vars[part.arg] === undefined || vars[part.arg] === null) {
      tell(`${key}: no value for {${part.arg}}`);
      out.push(`{${part.arg}}`);
      continue;
    }
    const value = vars[part.arg];
    if (part.type === "number") out.push(formatter("number", part.style === "percent" ? { style: "percent" } : part.style === "integer" ? { maximumFractionDigits: 0 } : undefined, locale).format(value));
    else if (part.type === "lower") out.push(String(value).toLocaleLowerCase(locale));
    else if (typeof value === "number") out.push(formatter("number", undefined, locale).format(value));
    else if (isPart(value)) out.push(value);
    else out.push(String(value));
  }
  return out;
}

/**
 * The words for key, with vars put in. A string, or (when a value is a node) an array of strings and nodes for el().
 * A key the English doesn't have shows as ⟦key⟧ (and test-i18n fails on it); a missing value as {name}.
 */
export function t(key, vars) {
  let text = null;
  let locale;
  // The chooser's answer: a strings map (shown in the interface's locale), or { locale, strings }, counted and formatted
  // in that locale (a message from the language you're learning keeps its own plurals and numbers).
  const chosen = state.chooser?.(key);
  const chosenStrings = typeof chosen?.has === "function" ? chosen : typeof chosen?.strings?.has === "function" ? chosen.strings : null;
  if (chosenStrings?.has(key)) {
    text = chosenStrings.get(key);
    if (chosenStrings !== chosen) locale = usable(chosen.locale);
  } else if (state.strings?.has(key)) text = state.strings.get(key);
  else if (english.has(key)) text = english.get(key);
  if (text === null) {
    tell(`no English for ${key}`);
    return `⟦${key}⟧`;
  }
  return formatMessage(text, vars, key, locale);
}

/** A message's text with vars put in, in the interface's locale: what t() does once it has the text. */
export function formatMessage(text, vars, key = "(a message)", locale = intlLocale()) {
  let parsed = cache.get(text);
  if (!parsed) {
    try {
      parsed = parseMessage(text);
    } catch (error) {
      tell(`${key}: ${error.message}`);
      parsed = [text];
    }
    cache.set(text, parsed);
  }
  let parts = render(parsed, vars, key, 0, locale);
  if (PSEUDO_LOCALES.includes(state.locale)) parts = pseudoWrap(parts);
  if (state.mark) parts = [markOpen(key), ...parts, MARK_CLOSE];
  return parts.every((part) => typeof part === "string") ? parts.join("") : parts;
}

/** A language's name in the interface's locale (language.<code>). */
export const languageLabel = (code) => {
  // A learner's own language is named by its definition: the interface's catalog only has Lexicommons' own.
  if (typeof code === "string" && Object.hasOwn(LANGUAGES, code) && LANGUAGES[code].own) return LANGUAGES[code].name;
  const out = t(`language.${code}`);
  return typeof out === "string" ? out : String(code);
};

// ---------- the pseudo locale ----------

const ACCENTED = {
  a: "å", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "î", j: "ĵ", k: "ķ", l: "ļ", m: "ɱ", n: "ñ", o: "ö", p: "þ", q: "ǫ", r: "ŕ", s: "š", t: "ţ", u: "û", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
  A: "Å", B: "Ɓ", C: "Ç", D: "Ð", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Î", J: "Ĵ", K: "Ķ", L: "Ļ", M: "Ṁ", N: "Ñ", O: "Ö", P: "Þ", Q: "Ǫ", R: "Ŕ", S: "Š", T: "Ţ", U: "Û", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
};
const PAD = "ļöŕéɱ îþšûɱ ðöļöŕ šîţ åɱéţ çöñšéçţéţûŕ åðîþîšçîñĝ éļîţ šéð ðö éîûšɱöð ţéɱþöŕ";
function pseudoText(text) {
  if (!PSEUDO_LOCALES.includes(state.locale)) return text;
  return text.replace(/[A-Za-z]/g, (c) => ACCENTED[c]);
}
// As much longer as a translation of that length tends to be (short labels grow the most).
const growth = (letters) => (letters <= 10 ? 1 : letters <= 20 ? 0.8 : letters <= 30 ? 0.6 : letters <= 50 ? 0.5 : letters <= 70 ? 0.4 : 0.3);
function pseudoWrap(parts) {
  const letters = parts.filter((part) => typeof part === "string").join("").replace(/[^\p{L}]/gu, "").length;
  const extra = Math.ceil(letters * growth(letters));
  const pad = extra ? ` ${PAD.slice(0, extra).trimEnd()}` : "";
  return ["[", ...parts, `${pad}]`];
}

// ---------- marking (the capture walk) ----------

// Characters that draw nothing, join nothing and break no line: U+2063 opens and closes, U+2061 U+2062 U+2064 are the
// key's index in base 3. A message is OPEN index OPEN … OPEN OPEN; one inside another nests.
export const MARK = "⁣";
const DIGITS = ["⁡", "⁢", "⁤"];
export const MARK_CLOSE = MARK + MARK;
function markOpen(key) {
  let n = keyIndex.get(key) ?? 0;
  let digits = "";
  do {
    digits = DIGITS[n % 3] + digits;
    n = Math.floor(n / 3);
  } while (n > 0);
  return MARK + digits + MARK;
}
/**
 * The keys marked in a text, outermost first, with the text each one holds once the marks are gone:
 * { text, keys: [{ key, text }] }.
 */
export function decodeMarks(text) {
  const keys = [];
  const stack = [];
  let plain = "";
  for (let i = 0; i < text.length; ) {
    if (text[i] === MARK) {
      if (text[i + 1] === MARK) {
        const open = stack.pop();
        if (open) keys.push({ key: open.key, text: plain.slice(open.at), depth: stack.length });
        i += 2;
        continue;
      }
      let j = i + 1;
      let n = 0;
      while (j < text.length && DIGITS.includes(text[j])) n = n * 3 + DIGITS.indexOf(text[j++]);
      if (text[j] === MARK && j > i + 1) {
        stack.push({ key: keyList[n] ?? null, at: plain.length });
        i = j + 1;
        continue;
      }
    }
    if (!DIGITS.includes(text[i])) plain += text[i];
    i++;
  }
  // A message whose close is in another text node (a node placeholder split it) is still open here.
  for (const open of stack) keys.push({ key: open.key, text: plain.slice(open.at), depth: 0, open: true });
  return { text: plain, keys: keys.sort((a, b) => a.depth - b.depth) };
}

// A check's locale file (i18n-walk --mode fit --locale <code>), read once everything above exists.
if (CHECK?.file) {
  const read = readStrings(CHECK.file);
  if (read.locale) {
    state.locale = read.locale;
    state.strings = read.strings;
  }
}
