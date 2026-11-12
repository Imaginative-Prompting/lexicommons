// Word pictures: our own drawings of what a word means, one file per concept (public/pictures/), named by a concept id in
// lessons and packs (never a URL or a drawing). They're drawn inline, so they take their colors from the art tokens
// (css/lx/art.css): designed in color, or in the theme's own. Each file is read by the same rules the test holds
// (lx/art-rules.js) before it's drawn. Fetched when first asked for, then kept on the device, the way recordings are:
// not in the shell, not through the service worker, under a name carrying the drawing's hash, so a redrawn one replaces it.

import { ART_ID, checkArt } from "../lx/art-rules.js";
import { isOurLanguage } from "../lang/index.js";
import { LESSONS, contentLanguage } from "./content.js";
import { keepClips } from "./keep-clips.js";
import { setPictures } from "./lesson.js";

/** Where the drawings are kept on this device. */
export const PICTURES = "lx-pictures-v1";
const BASE = "/pictures/";
const MANIFEST = `${BASE}manifest.json`;
/** How long the list may take before the kept copy is used. */
const MANIFEST_WAIT = 3000;
/** The most a language's drawings may take on the device. */
const BUDGET = 10_000_000;
/** Drawings per idle turn, fetched one at a time. */
const KEEP_BATCH = 4;

const openCache = async () => {
  try {
    return (await globalThis.caches?.open(PICTURES)) ?? null;
  } catch {
    return null;
  }
};

let listing = null;
let listed = null; // the manifest, once it's in: what a lesson's plan asks of, synchronously
/** The manifest: { pictures: { id: { file, h, alt, keep? } } }. Never rejects; empty when there's none. Which words they are: words.<language>.json. */
export function pictureList() {
  listing ??= (async () => {
    const cache = await openCache();
    try {
      const response = await fetch(MANIFEST, { signal: AbortSignal.timeout(MANIFEST_WAIT) });
      if (response.status === 404) {
        // This server has no drawings at all (a copy without them): nothing kept from before says otherwise.
        await cache?.delete(MANIFEST).catch(() => {});
        listed = { pictures: {} };
        return listed;
      }
      if (!response.ok) throw new Error(String(response.status));
      await cache?.put(MANIFEST, response.clone()).catch(() => {});
      listed = await response.json();
    } catch {
      const kept = await cache?.match(MANIFEST);
      if (kept) listed = await kept.json();
      else listing = null; // Nothing yet: try again next time.
    }
    return listed ?? { pictures: {} };
  })();
  return listing;
}

const entryOf = (list, id) => (typeof id === "string" && ART_ID.test(id) && Object.hasOwn(list?.pictures ?? {}, id) ? list.pictures[id] : null);
const urlOf = (entry) => `${BASE}${entry.file}?h=${entry.h}`;

/** The concept's text, from the device or the network, if it may be drawn. */
async function fetchDrawing(entry) {
  if (!ART_ID.test(entry.file?.replace(/\.svg$/, "") ?? "") || !entry.file.endsWith(".svg")) return null;
  const url = urlOf(entry);
  const cache = await openCache();
  let text = await (await cache?.match(url))?.text();
  if (text === undefined) {
    const response = await fetch(url);
    if (!response.ok) return null;
    text = await response.clone().text();
    if (!checkArt(text).length) await cache?.put(url, response).catch(() => {});
  }
  return checkArt(text).length ? null : text;
}

const drawings = new Map(); // id -> Promise<SVGElement | null>, the parsed drawing
function drawingOf(id) {
  if (!drawings.has(id)) {
    const loading = (async () => {
      try {
        const entry = entryOf(await pictureList(), id);
        const text = entry && (await fetchDrawing(entry));
        if (!text) return null;
        const svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
        return svg.localName === "svg" ? svg : null;
      } catch {
        return null;
      }
    })();
    drawings.set(id, loading);
    // A failure isn't final: the next question tries again.
    loading.then((svg) => svg || drawings.delete(id));
  }
  return drawings.get(id);
}

const ready = new Map(); // id -> the parsed drawing, once it's in

/**
 * Gets every drawing ready, so they can appear together. True only if all of them are: a question that can't have all
 * its pictures doesn't appear. Never rejects.
 */
export async function loadPictures(ids) {
  const found = await Promise.all(ids.map(async (id) => {
    const svg = await drawingOf(id);
    if (svg) ready.set(id, svg);
    return Boolean(svg);
  }));
  return found.every(Boolean);
}

let copies = 0;
/**
 * A picture, on its tile, sized by what holds it, for a concept loadPictures has got ready. Each is its own copy, with its
 * own ids, so any number can share a screen. alt: what it shows (the manifest's, told to a screen reader); "" when the
 * words beside it already say.
 */
export function pictureNode(id, { alt = "" } = {}) {
  const node = document.createElement("span");
  node.dataset.part = "picture";
  if (alt) {
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", alt);
  }
  const source = ready.get(id);
  if (!source) return node;
  const svg = document.importNode(source, true);
  svg.setAttribute("aria-hidden", "true");
  const prefix = `p${++copies}-`;
  for (const part of svg.querySelectorAll("[id]")) part.id = prefix + part.id;
  for (const part of svg.querySelectorAll("[clip-path]")) part.setAttribute("clip-path", part.getAttribute("clip-path").replace("url(#", `url(#${prefix}`));
  node.append(svg);
  return node;
}

/** What a concept's picture shows, from the manifest ("" when it has none). */
export async function pictureAlt(id) {
  return entryOf(await pictureList(), id)?.alt ?? "";
}

// ---------- which drawing a word is ----------
// A drawing is the same in every language; which word it is belongs to the language. Each language has one file beside the
// drawings, words.<language>.json ({ language, words: { lemma: concept } }), naming only what's drawn, so every pack in that
// language gets its pictures: ours, your own, shared ones. A lesson word's own `picture` comes first; this is for the rest.
// Kept on the device like the manifest, so it's there offline; never in the shell.
/** lang/index.js LANGUAGE_CODE, repeated so this file needn't load every language (test-art holds them the same). */
export const WORDS_LANGUAGE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?$/;
const wordsUrl = (language) => `${BASE}words.${language}.json`;
const wordMaps = new Map(); // language -> Promise<{ lemma: concept } | null>
const wordMapsIn = new Map(); // language -> { lemma: concept }, once it's in
let wordsLanguage = null; // the language last asked for: the one being learned
async function fetchWords(language) {
  const url = wordsUrl(language);
  const cache = await openCache();
  let data = null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(MANIFEST_WAIT) });
    if (response.status === 404) {
      await cache?.delete(url).catch(() => {});
      return null;
    }
    if (!response.ok) throw new Error(String(response.status));
    await cache?.put(url, response.clone()).catch(() => {});
    data = await response.json();
  } catch {
    data = await (await cache?.match(url))?.json().catch(() => null);
    if (!data) wordMaps.delete(language); // Nothing yet: try again next time.
  }
  const words = data && data.language === language && data.words && typeof data.words === "object" ? data.words : null;
  if (!words) return null;
  // Only what can be drawn: a concept id, for a word (an own key, never one an object inherits).
  return Object.fromEntries(Object.entries(words).filter(([lemma, concept]) => typeof lemma === "string" && lemma && typeof concept === "string" && ART_ID.test(concept)));
}
/**
 * Gets a language's words to their drawings, for pictureOfWord. True once it's in, false when the language has none or it can't be
 * had now. Never rejects. The language asked for last is the one pictureOfWord answers for.
 */
export function loadWordPictures(language) {
  // A language of the learner's own has no map (only ours do): never asked for (a real code, my or tok, was a 404 on every start).
  if (typeof language !== "string" || !WORDS_LANGUAGE.test(language) || !isOurLanguage(language)) return Promise.resolve(false);
  wordsLanguage = language;
  if (!wordMaps.has(language)) wordMaps.set(language, fetchWords(language));
  return wordMaps.get(language).then((map) => {
    if (map) wordMapsIn.set(language, map);
    return Boolean(map);
  });
}
/** A language's words and the drawing each is ({ lemma: concept }), or null when it has none or they can't be had now. Never rejects; changes nothing pictureOfWord answers. */
export function pictureWords(language) {
  if (typeof language !== "string" || !WORDS_LANGUAGE.test(language) || !isOurLanguage(language)) return Promise.resolve(null);
  if (!wordMaps.has(language)) wordMaps.set(language, fetchWords(language));
  return wordMaps.get(language);
}
/** The concept a word of the language being learned is drawn as (a lemma), or null: none, or its language's words aren't in yet. Synchronous. */
export function pictureOfWord(lemma) {
  const map = wordMapsIn.get(wordsLanguage);
  return map && typeof lemma === "string" && Object.hasOwn(map, lemma) ? map[lemma] : null;
}

let keeping = null;
/**
 * Keeps every drawing of a language on this device, in the background (after a sync, as recordings are), so its pictures
 * are there offline even before they've been seen. None while the device asks to save data. Drops what a redraw replaced.
 */
export function keepPicturesForOffline(language) {
  if (keeping) return keeping;
  const controller = new AbortController();
  const stop = () => controller.abort();
  globalThis.addEventListener?.("hashchange", stop);
  globalThis.addEventListener?.("pagehide", stop);
  return (keeping = keepNow(language, controller.signal).finally(() => {
    globalThis.removeEventListener?.("hashchange", stop);
    globalThis.removeEventListener?.("pagehide", stop);
    keeping = null;
  }));
}
async function keepNow(language, signal) {
  const page = globalThis.location?.href;
  const stop = () => signal.aborted || globalThis.location?.href !== page;
  const cache = await openCache();
  if (!cache) return { kept: 0, already: 0, bytes: 0, stoppedBy: "no cache" };
  const list = await pictureList();
  const entries = Object.entries(list.pictures ?? {});
  await loadWordPictures(language);
  const named = new Set(Object.values(wordMapsIn.get(language) ?? {}));
  // What's kept and still used: the list, every language's words that have come, and the drawings the list names.
  const current = new Set([MANIFEST, ...[...wordMapsIn.keys()].map(wordsUrl), ...entries.map(([, entry]) => urlOf(entry))]);
  for (const request of await cache.keys()) {
    const { pathname, search } = new URL(request.url);
    if (!current.has(pathname + search)) await cache.delete(request);
  }
  // A lesson word's own drawing (its `picture`) is the language's too, whether or not a words line names it: a lesson draws the sense it
  // teaches, and a word whose other sentences use another sense has no line at all (Spanish en: "in" in one lesson, "on the table" in
  // another). Read from the lessons studying draws on, the device's own packs, so nothing has to name it again.
  if (contentLanguage() === language) for (const lesson of LESSONS) for (const word of lesson.words ?? []) if (typeof word.picture === "string") named.add(word.picture);
  // The language's drawings are the ones its words and its lessons name. A drawing marked keep (an empty state, above all the offline one) is no word, and must be there anyway.
  const urls = entries.filter(([id, entry]) => entry.keep === true || named.has(id)).map(([, entry]) => urlOf(entry));
  // A whole language can have hundreds of drawings: leave room for the page, and stop when it changes.
  let fetched = 0;
  const fetcher = async (url, options) => {
    if (fetched % KEEP_BATCH === 0 && !stop()) await new Promise((resolve) => {
      const idle = typeof globalThis.requestIdleCallback === "function";
      const done = () => {
        signal.removeEventListener("abort", cancel);
        resolve();
      };
      const cancel = () => {
        if (idle) globalThis.cancelIdleCallback?.(pending);
        else clearTimeout(pending);
        done();
      };
      const pending = idle ? globalThis.requestIdleCallback(done) : setTimeout(done, 100);
      signal.addEventListener("abort", cancel, { once: true });
    });
    if (stop()) throw new Error("stopped");
    fetched++;
    return fetch(url, { ...options, signal });
  };
  const result = await keepClips(urls, { cache, fetcher, budget: BUDGET, saveData: Boolean(globalThis.navigator?.connection?.saveData), stop });
  return stop() ? { ...result, stoppedBy: "stopped" } : result;
}

// ---------- what a lesson's plan asks ----------
// The plan decides synchronously whether a question has its drawings: yes once the list is in and names it; until then, words.
const inBrowser = typeof fetch === "function" && typeof location !== "undefined";
setPictures((concept) => Boolean(entryOf(listed, concept)));
if (inBrowser) pictureList();
