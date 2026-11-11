// The shared grammar on this device (lang/grammar.js): the app's own revision 1 of each language, until the open
// library's newer one arrives. The catalog names it (grammar.<lang>); syncGrammar fetches it, checks it (the format,
// its version against its content, every id the one here has), keeps it (localStorage "lx.grammar.v1": { <lang>:
// { version, text } }) and installs it into the registry, so every check and screen reads it from then on. Kept ones
// are installed as this module loads, before any pack is checked (packs.js imports it first), so a start offline has
// the newest this device has seen. Another tab's sync reaches this one through the storage event.

import { checkGrammar, checkGrammarMore, grammarNow, grammarRef, grammarVersion, keepsEveryId, useGrammar } from "../lang/grammar.js";

const KEY = "lx.grammar.v1";
const listeners = new Set();

function readKept() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {}
  return {};
}

// A kept grammar, checked again as it's installed (it's the device's own copy, but storage can be changed under it).
function installKept(lang, entry) {
  if (!entry || typeof entry.text !== "string" || typeof entry.version !== "string") return false;
  let raw;
  try {
    raw = JSON.parse(entry.text);
  } catch {
    return false;
  }
  const { grammar } = checkGrammar(raw);
  if (!grammar || grammar.language !== lang || !keepsEveryId(grammarNow(lang), grammar)) return false;
  return useGrammar(grammar, entry.version);
}

function installAllKept() {
  const kept = readKept();
  let any = false;
  for (const lang of Object.keys(kept)) if (installKept(lang, kept[lang])) any = true;
  return any;
}

installAllKept();
if (typeof addEventListener === "function") {
  addEventListener("storage", (event) => {
    if (event.key === KEY && installAllKept()) tell();
  });
}

function tell() {
  for (const listener of listeners) listener();
}

/**
 * Calls fn() when another tab's sync installs a newer grammar here (this tab's own sync says so in what it returns, so
 * its caller can re-check what it holds in order). Returns its stop.
 */
export function onGrammarChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Brings a language's grammar here in line with the catalog (already fetched: packs.js's sync passes it): when the
 * catalog names a newer revision than the one installed, it's fetched, checked and kept, then installed. Offline or
 * refused, the one here stays. Resolves to { changed, problems }: changed, a newer grammar was installed (what was
 * checked against the one before should be checked again).
 */
export async function syncGrammar(catalogue, lang) {
  const synced = await syncMain(catalogue, lang);
  // After the grammar itself, as it's checked against that. Never in the way: a pattern opens with what it has.
  await syncMore(catalogue, lang).catch(() => {});
  return synced;
}

// What's longer about each pattern, kept apart from the grammar's key: it's read only when a pattern opens, and only the language you're on is fetched.
const MORE_KEY = "lx.grammar.more.v1";
const moreHere = new Map();
function readMore() {
  try {
    const value = JSON.parse(localStorage.getItem(MORE_KEY) ?? "null");
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {}
  return {};
}
async function syncMore(catalogue, lang) {
  const ref = grammarRef(catalogue, lang)?.more;
  if (!ref || readMore()[lang]?.version === ref.version) return;
  const response = await fetch(ref.url, { credentials: "same-origin" });
  if (!response.ok) return;
  const text = await response.text();
  const { more } = checkGrammarMore(JSON.parse(text), grammarNow(lang));
  if (!more) return;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(more)));
  if ([...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12) !== ref.version) return;
  const kept = readMore();
  kept[lang] = { version: ref.version, text: JSON.stringify(more) };
  try {
    localStorage.setItem(MORE_KEY, JSON.stringify(kept));
  } catch {}
  moreHere.delete(lang);
}

/** What's longer about a pattern, as this device has it: { explain, why?, picture?, examples, contrasts, mistakes, source }, or null (the pattern's name, chip, short and about are all there is). */
export function patternMore(lang, id) {
  const { concepts } = moreOf(lang);
  return Object.hasOwn(concepts, id) ? concepts[id] : null;
}

/** The longer file's readings ({ form: reading }) for the forms its own words have, as this device has it: none without one. */
export const moreReadings = (lang) => moreOf(lang).readings;

function moreOf(lang) {
  if (!moreHere.has(lang)) {
    let file = null;
    try {
      file = JSON.parse(readMore()[lang]?.text ?? "null");
    } catch {}
    const isMap = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
    moreHere.set(lang, { concepts: isMap(file?.concepts) ? file.concepts : {}, readings: isMap(file?.readings) ? file.readings : {} });
  }
  return moreHere.get(lang);
}

async function syncMain(catalogue, lang) {
  const ref = grammarRef(catalogue, lang);
  const now = grammarNow(lang);
  if (!ref || !now || ref.revision <= now.revision) return { changed: false, problems: [] };
  let raw;
  try {
    const response = await fetch(ref.url, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`${response.status}`);
    raw = await response.json();
  } catch (error) {
    return { changed: false, problems: [{ at: "grammar", message: `The ${lang} grammar couldn't be fetched (${error.message}); the one here stays.` }] };
  }
  const { grammar, errors } = checkGrammar(raw);
  const problems = !grammar
    ? errors
    : grammar.language !== lang
      ? [{ at: "grammar.language", message: `It says it's ${grammar.language}'s grammar, not ${lang}'s.` }]
      : grammar.revision !== ref.revision
        ? [{ at: "grammar.revision", message: `It's revision ${grammar.revision}, not ${ref.revision}.` }]
        : (await grammarVersion(grammar)) !== ref.version
          ? [{ at: "grammar.version", message: `Its content doesn't match its version (${ref.version}).` }]
          : !keepsEveryId(grammarNow(lang), grammar)
            ? [{ at: "grammar.patterns", message: "It leaves out patterns the grammar here has." }]
            : [];
  if (problems.length) return { changed: false, problems: problems.slice(0, 5).map((p) => ({ at: p.at, message: `The ${lang} grammar isn't used: ${p.message}` })) };
  const kept = readKept();
  kept[lang] = { version: ref.version, text: JSON.stringify(grammar) };
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {}
  return { changed: useGrammar(grammar, ref.version), problems: [] };
}

/**
 * Fetches the catalog and brings a language's grammar in line with it (for a check that failed on a pattern the
 * grammar here may not have yet: a change from your AI, made against the server's newer one). Resolves to whether a
 * newer one was installed. With orThrow, it throws when the grammar couldn't be checked (the relay inbox: a failed
 * refresh leaves a change waiting rather than making its first refusal final); otherwise that's false, as before.
 */
export async function refreshGrammar(lang, { orThrow = false } = {}) {
  try {
    const response = await fetch("/library/catalogue.json", { credentials: "same-origin", cache: "no-cache" });
    if (!response.ok) throw new Error(`grammar: ${response.status}`);
    const result = await syncGrammar(await response.json(), lang);
    if (orThrow && result.problems.length) throw new Error(result.problems[0].message);
    return result.changed;
  } catch (error) {
    if (orThrow) throw error;
    return false;
  }
}
