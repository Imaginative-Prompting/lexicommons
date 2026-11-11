// Translate, on this device (the Translate page builds on it, translate/page.js): what your packs and books here say,
// searched both ways with engine.js, so it works offline; and online, what the server finds in Lexicommons' own packs,
// Explore's shared packs and the open library's books (/api/translate, src/translate.ts), merged in after yours. Every
// result names its source. It finds what they say and nothing else: a language with nothing on this device can't be
// translated offline.
//
// The index and search run in a worker (translate/worker.js), so a phone's keyboard never waits on them; the same code
// on the page's thread where a worker can't start. It's built when Translate is about to be used (prepareTranslate), and the
// pages using it hold it (holdTranslateIndex: Translate's page while it's open, a book open in the reader): held, it's let go
// after IDLE of nothing; a minute (LEFT) after the last of them is left, or after a use while none holds it. Nothing here waits
// for the server: onLocal has this device's results first. The worker keeps the last index it built on the device (worker.js, IndexedDB) under
// a key naming what it was made of (keptKey), so a worker started again reads it back instead of being sent every pack.

import { LANGUAGES, languageName } from "../lang/index.js";
import { allPacks, onPacksChange, packDownloads, packsSettled, yourPacks } from "../study/packs.js";
import { learning } from "../study/learning.js";
import * as store from "../read/store.js";
import { bookSource, buildIndex, indexLanguages, lookBothWays, mergeResults } from "./engine.js";
import { translatorState } from "./translator.js";

// How long the server has to answer before a translation goes ahead with only this device's. Long, since nothing waits
// on it (onLocal), and a first search on a new Worker has an index to build.
const ONLINE_WAIT = 20_000;
const LANGUAGES_FRESH = 10 * 60_000; // how long the server's list of languages is kept
// While this device has no index yet, the server is asked on the first key and then at most once in COLD_EVERY ms while typing goes on,
// one at a time, always for the latest text: about 3 requests a second for one person's first few seconds (coldAsk).
const COLD_EVERY = 300;
const IDLE = 5 * 60_000; // ms unused before the worker and its index are let go
// ms after the last page using them is left (or a use while none holds them) before they're let go: the worker and its index held
// ~135 MB of an iPhone's page until a reload (7 Nov 2026), Read's for its whole IDLE after you'd left it, and the next start reads the
// index kept on the device back (KEPT_DB).
const LEFT = 60_000;
const KEPT_DB = "lexicommons-translate-index"; // worker.js keeps the last index built here

const CREDIT = {
  app: "Lexicommons",
  default: "Lexicommons",
  follow: "Shared in Explore (CC BY-SA 4.0)",
  yours: "Your pack",
};

/**
 * The packs on this device explained in English (the engine reads a pack's other side as English), as sources: yours
 * under their own ids, so none is taken for a shared pack's.
 */
const packSources = () =>
  allPacks()
    .filter((pack) => pack.from === "en")
    .map((pack) => ({
      id: pack.origin?.kind === "yours" ? `yours:${pack.id}` : `pack:${pack.id}`,
      kind: "pack",
      name: pack.name,
      // An opt-in pack of Lexicommons' own, added in Explore, is Lexicommons', not someone's shared pack.
      credit: pack.origin?.own ? CREDIT.default : (CREDIT[pack.origin?.kind] ?? "Lexicommons"),
      language: pack.language,
      items: pack.items,
      words: pack.words,
      chunks: pack.chunks,
    }));

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

// The app's version, as plan-kept.js reads it: a kept index is never read back by another version of the engine.
const appVersion = () => {
  const main = globalThis.document?.querySelector?.('script[src*="/js/shell/main.js"]');
  return (main && new URL(main.src).searchParams.get("v")) || "copy";
};
/** What an index of these books and this device's packs is made of, as the key it's kept under: each pack and how it stands (yours, when it last changed; the rest, where they came from), and each book's version. */
function keptKey(books) {
  const changed = new Map(yourPacks().map((record) => [record.id, record.changedAt ?? 0]));
  const packs = allPacks()
    .filter((pack) => pack.from === "en")
    .map((pack) => [pack.id, pack.origin?.kind === "yours" ? changed.get(pack.id) ?? 0 : JSON.stringify(pack.origin ?? null)]);
  return JSON.stringify([1, appVersion(), packs, books.map((b) => `${b.id}@${b.version}@${b.addedAt}`)]);
}
// The sentences of a pack sent across at a time: a few ms of copying on a slowed phone.
const PART = 200;

/** The texts on this device that have a layer joining their language and English (the open library's, so far). */
async function bookSources(books) {
  const sources = [];
  for (const entry of books) {
    const layers = entry.lang === "en" ? Object.keys(LANGUAGES).filter((code) => code !== "en") : ["en"];
    for (const to of layers) {
      const layer = await store.getWeave(entry.id, to).catch(() => null);
      if (!layer) continue;
      const kept = await store.getBook(entry.id).catch(() => null);
      const source = kept && bookSource(kept.text, layer);
      if (source) sources.push(source);
      await nextTask();
    }
  }
  return sources;
}

// ---------- where the index lives ----------

/** The index on the page's thread, where a worker can't start: the same messages' work, at once. */
function onThisThread() {
  const sources = new Map();
  let index = null;
  return {
    begin(keep) {
      for (const id of sources.keys()) if (!keep.includes(id)) sources.delete(id);
    },
    source(source) {
      sources.set(source.id, source);
    },
    more(id, items) {
      sources.get(id)?.items.push(...items);
    },
    end: async (order) => {
      await nextTask();
      index = buildIndex(order.map((id) => sources.get(id)).filter(Boolean));
      return indexLanguages(index);
    },
    // (Nothing read back here: a kept index made into objects on the page's thread would hold it far longer than building it does.)
    look: async (text, options) => lookBothWays(index, text, options),
    stop() {},
  };
}

/** The index in a worker (worker.js), falling back to this thread when one can't start or stops working. */
function inWorker(fallback) {
  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module", name: "lexicommons-translate" });
  const waiting = new Map();
  let id = 0;
  let dead = false;
  const ask = (message) =>
    new Promise((resolve, reject) => {
      if (dead) return reject(new Error("worker"));
      waiting.set(++id, { resolve, reject });
      worker.postMessage({ ...message, id });
    });
  let builtWaiting = null;
  worker.onmessage = ({ data }) => {
    if (data.type === "built") {
      rebuilding = false;
      builtWaiting?.resolve(data.languages);
    }
    else if (data.type === "looked" || data.type === "loaded") {
      waiting.get(data.id)?.resolve(data.type === "loaded" ? data.languages : data.look);
      waiting.delete(data.id);
    }
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    console.warn("[translate] the worker stopped; on this thread from here on", event.message);
    const failed = new Error("worker");
    dead = true;
    rebuilding = false;
    builtWaiting?.reject(failed);
    for (const entry of waiting.values()) entry.reject(failed);
    waiting.clear();
    worker.terminate();
    fallback();
  };
  return {
    begin(keep, key) {
      worker.postMessage({ type: "begin", key, keep });
    },
    source(source) {
      worker.postMessage({ type: "source", source });
    },
    more(id, items) {
      worker.postMessage({ type: "more", id, items });
    },
    end(order, key, kept) {
      return new Promise((resolve, reject) => {
        if (dead) return reject(new Error("worker"));
        builtWaiting = { resolve, reject };
        rebuilding = true;
        worker.postMessage({ type: "end", key, order, kept });
      });
    },
    /** The index kept under kept, read back in the worker: its languages, or null when none is kept for it. */
    load: (kept, key) => ask({ type: "load", kept, key }),
    look: (text, options) => ask({ type: "look", text, options }),
    stop: () => worker.terminate(),
  };
}

let host = null;
// The worker making a new index (from its "end" to its "built"): it let the one before go first (G10: built beside it, a phone held two), so
// a look meanwhile waits for the new one. Online, a key goes the cold lane then, as before the first index (translate()).
let rebuilding = false;
let sent = new Map(); // source id → what it was sent as, so only what changed goes across
let usable = true; // whether a worker can run here

function hostNow() {
  if (host) return host;
  const again = () => {
    usable = false;
    host = null;
    built = null;
    sent = new Map();
  };
  try {
    if (!usable || typeof Worker !== "function") throw new Error("no worker");
    host = inWorker(again);
  } catch {
    usable = false;
    host = onThisThread();
  }
  sent = new Map();
  return host;
}

// The index of what's on this device, rebuilt when a pack or a text changes. built: the newest whole one
// ({ key, languages }). One is made at a time, so one source's two versions never cross; the loop goes on to the newest
// wanted, and stops early on one that's already out of date.
let packsVersion = 0;
let built = null;
let wanted = null; // { key, books }
let making = null; // the loop's promise
const listeners = new Set();
const changedIndex = () => {
  for (const fn of listeners) fn();
};
// ms of no pack change before the new index is made. A burst (an AI's packs arriving through the relay, a deck of 3,000 cards) made a whole
// index for each change, each built while the last was still held: a phone's page went from 508 to 1,018 MB and the app started again by
// itself (G10, lex-design-2's measure, 7 Nov 2026). Meanwhile the index there is answers (its results a moment behind the packs).
const QUIET = 1500;
// ms after the last look before a new index is made, as well: a whole build takes the worker 0.3–0.5 s here and about 1 s on an older
// iPhone (7 Nov 2026), and a look waits for it, so while someone is typing the index there goes on answering, and the new one is made in
// their pause. What's shown stays as it is meanwhile; the look on "built" changes it only where the new index says something else.
const TYPING_QUIET = 1000;
let lastLook = -Infinity;
let quietTimer = null;
function makeWhenQuiet(wait = QUIET) {
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    if (!built || !holders.size) return void (quietTimer = null);
    const typing = TYPING_QUIET - (performance.now() - lastLook);
    if (typing > 0) return makeWhenQuiet(typing);
    quietTimer = null;
    ensureIndex().catch(() => {});
  }, wait);
}
onPacksChange(() => {
  packsVersion++;
  // Being used (a page holds it: Translate open, a book in the reader): the new index is made once the packs are quiet and nobody's typing,
  // and whoever's showing a result looks again (onTranslateIndex). Held by none (Translate left, its worker waiting out LEFT), nothing is
  // made for no one: the next use makes it (ensureIndex), and a build and its keep never land on a page busy with something else (G10's
  // share flow: 903 MB).
  if (!built || !holders.size) return;
  makeWhenQuiet();
});

/** Calls fn whenever a newer index is ready. Returns a function that stops it. */
export function onTranslateIndex(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// What a source was sent as: its sentences (by identity: a pack's change makes new ones), name and credit.
const sentAs = new WeakMap();
let sentCount = 0;
const markOf = (source) => {
  const of = source.items ?? source.sentences ?? source;
  if (!sentAs.has(of)) sentAs.set(of, ++sentCount);
  return `${sentAs.get(of)}|${source.name}|${source.credit}`;
};

/** Makes the index for one key; null when a newer one is wanted by the time it would be built. */
async function make(key, books) {
  const at = hostNow();
  const kept = keptKey(books);
  // A worker that has nothing yet may have this very index kept on the device: read back there, and nothing is sent across.
  if (at.load && !sent.size) {
    const languages = await at.load(kept, key).catch(() => null);
    if (languages) return wanted?.key === key ? { key, languages } : null;
  }
  const sources = [...packSources(), ...(await bookSources(books))];
  const order = sources.map((source) => source.id);
  at.begin(order, key);
  for (const source of sources) {
    const mark = markOf(source);
    if (sent.get(source.id) === mark) continue;
    // Each pack is copied across on this thread, a part of its sentences at a time (a word band's whole copy held a phone's page for 90 ms
    // at 4×, 7 Nov 2026), so the keyboard stays free between them. The other side puts them back in order (worker.js more).
    const items = Array.isArray(source.items) ? source.items : null;
    at.source(items ? { ...source, items: items.slice(0, PART) } : source);
    for (let from = PART; items && from < items.length; from += PART) {
      await nextTask();
      at.more(source.id, items.slice(from, from + PART));
    }
    sent.set(source.id, mark);
    await nextTask();
  }
  // Out of date already: not built, while an index is there to answer. With none yet (Translate opened while packs still arrive), this one is
  // built all the same: it answers at once, and the newer one is made once typing is quiet (makeWanted).
  if (wanted?.key !== key && built) return null;
  return { key, languages: await at.end(order, key, kept) };
}

async function makeWanted() {
  while (wanted && built?.key !== wanted.key) {
    const first = !built;
    try {
      const index = await make(wanted.key, wanted.books);
      if (!index) continue;
      built = index;
      changedIndex();
      // The first index there is, made from the packs that were here when it began, answers at once (7 Nov 2026: with a pack arriving
      // while it was made, it was dropped, and the whole of a phrase typed meanwhile went unanswered for 3 s); the one with what came
      // meanwhile is made once the packs and the typing are quiet, as a rebuild is.
      if (first && wanted && built.key !== wanted.key) {
        makeWhenQuiet();
        break;
      }
    } catch (error) {
      // The worker stopped: on this thread now (hostNow), from nothing.
      if (error?.message !== "worker") throw error;
    }
  }
  return built;
}

async function ensureIndex() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(letGo, lifetime());
  // Packs still arriving: the index there is answers until they're quiet (QUIET), when the new one is made, once.
  if (built && quietTimer) return built;
  // A load of this device's packs under way reads them in place (packs.js packsSettled): an index made now would hold part of them. One
  // made from the starter alone, mid-load, answered nothing while a phrase was typed after a start, and the next waited for typing to stop.
  await packsSettled();
  const books = await store.listBooks().catch(() => []);
  const key = `${packsVersion}|${books.map((b) => `${b.id}@${b.version}@${b.addedAt}`).join(",")}`;
  if (built?.key === key) return built;
  wanted = { key, books };
  making ??= makeWanted().finally(() => (making = null));
  return making;
}

let idleTimer = null;
// The pages using the index now (holdTranslateIndex): while any is, it's kept for IDLE after its last use; with none, for LEFT.
const holders = new Set();
const lifetime = () => (holders.size ? IDLE : LEFT);
function letGo() {
  // Still making one, it's in use: looked at again later.
  if (making) {
    idleTimer = setTimeout(letGo, lifetime());
    return;
  }
  clearTimeout(quietTimer);
  quietTimer = null;
  host?.stop();
  host = null;
  built = null;
  wanted = null;
  sent = new Map();
}

/**
 * A page using the index (Translate's page while it's open, a book open in the reader): while one is, the worker and its index stay
 * for IDLE after their last use. Returns the function that leaves it; once the last one has, they're let go a minute on (LEFT) unless
 * a page holds them again first, and the next start reads the index kept on the device back.
 */
export function holdTranslateIndex() {
  const hold = Symbol("translate index");
  holders.add(hold);
  if (host) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(letGo, IDLE);
  }
  return () => {
    if (!holders.delete(hold) || holders.size || !host) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(letGo, LEFT);
  };
}

/** Deleting the account: the worker stopped and the index kept on this device deleted (it holds your packs' sentences). */
export async function forgetTranslateIndex() {
  clearTimeout(idleTimer);
  host?.stop();
  host = null;
  built = null;
  wanted = null;
  sent = new Map();
  await new Promise((resolve) => {
    const request = globalThis.indexedDB?.deleteDatabase(KEPT_DB);
    if (!request) return resolve();
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

/** Gets the index ready ahead of the first search (Translate's field getting focus): the search is then instant. */
export function prepareTranslate() {
  ensureIndex().catch((error) => console.warn("[translate] couldn't get ready", error));
}

/** This device's look, from the current index; with stale, from the newest there is while a newer one is made. */
async function lookHere(text, options, { stale }) {
  lastLook = performance.now();
  const current = ensureIndex();
  if (!stale || !built) await current;
  try {
    return await hostNow().look(text, options);
  } catch (error) {
    if (error?.message !== "worker") throw error;
    await ensureIndex();
    return hostNow().look(text, options);
  }
}

/** How much of a text this device knows as a language's words: 0 to 1. */
export async function knownShare(text, language) {
  const mine = learning();
  const { result } = await lookHere(text, language === "en" ? { from: "en", to: mine, language: mine } : { from: language, to: "en", language }, { stale: true });
  return result?.tokens?.length ? result.found / result.tokens.length : 0;
}

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** The server's answer: { answer } when it gave one, else { offline: true }, or { failed: true } when it was asked and
 * didn't (down, or too slow), so nothing is taken for an answer that never came. */
async function ask(path, signal, body) {
  if (isOffline()) return { offline: true };
  try {
    const timeout = AbortSignal.timeout(ONLINE_WAIT);
    const asked = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
    const response = await fetch(path, { ...asked, credentials: "same-origin", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.ok) return { failed: true };
    return { answer: await response.json() };
  } catch {
    return { failed: true };
  }
}

let serverLanguages = null; // { at, codes }

/**
 * The languages Translate can go to and from English (English itself isn't listed), the one you're learning first:
 * [{ code, name, offline }]. offline: this device has something for it, so it works without a connection. Online, the
 * languages only Lexicommons' or shared packs have are listed too (offline: false).
 */
export async function translateLanguages() {
  const local = new Set((await ensureIndex()).languages);
  if (!serverLanguages || Date.now() - serverLanguages.at > LANGUAGES_FRESH) {
    const { answer } = await ask("/api/translate/languages");
    if (Array.isArray(answer?.languages)) serverLanguages = { at: Date.now(), codes: answer.languages };
  }
  const codes = new Set([...local, ...(serverLanguages?.codes ?? [])].filter((code) => code !== "en" && Object.hasOwn(LANGUAGES, code)));
  const mine = learning();
  return [...codes]
    .map((code) => ({ code, name: languageName(code), offline: local.has(code) }))
    .sort((a, b) => (a.code === mine ? -1 : b.code === mine ? 1 : a.name.localeCompare(b.name)));
}

/**
 * Which packs hold what was typed, on a press: [{ id, name, credit, kind, matched, of, sentences: [{ text, means, literal? }], words: [{ lemma, gloss }] }], without the ones
 * already on this device. { offline: true } with no connection, { failed: true } if the server didn't answer; indexing: some of this language's packs aren't searchable yet.
 */
export async function findPacksHolding(text, language, signal) {
  const { answer, offline, failed } = await ask("/api/translate/find", signal, { q: text, language });
  if (offline) return { packs: [], offline: true };
  if (failed || !Array.isArray(answer?.packs)) return { packs: [], failed: true };
  const here = new Set(allPacks().map((pack) => pack.id));
  return { packs: answer.packs.filter((pack) => !here.has(pack.id)), indexing: Boolean(answer.indexing) };
}

const pause = (ms, signal) =>
  new Promise((resolve) => {
    if (!ms) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

// ---------- the server while this device has no index ----------
// After a start every pack is copied into the worker and indexed before this device can answer (23.7 s once on an Android phone). Meanwhile,
// online, the server answers. It's asked at once on the first key, then for the latest text as each answer comes back, at most once every
// COLD_EVERY. Never for each letter, and never only once typing stops: a pause before each ask, reset by every key, left a phrase typed after
// a start with nothing on the screen for its 3.2 s. One request is out at a time. Stopping it for newer text would starve a link slower than
// COLD_EVERY (each answer cut off before it came, nothing on the screen until a pause), and launch day is phones on mobile networks.
// An answer that found nothing (a single letter) lets the next text go at once: one wasted trip, never 300 ms more before the first real
// answer. Each answer goes, the moment it's back, to the translate() that asked for exactly that text, and to onColdAnswer's listeners, the
// page among them, with when it was typed (at). An answer to the start of what's typed now, newer than what's shown, keeps the screen up with
// the typing. None of it is tied to a key's signal: each key stops the last key's translate(), which would stop every ask.
let coldWaiting = null; // the newest text not yet sent: { body, key, at, waiters }
let coldOut = null; // the one out: { body, key, at, waiters }
let coldSentAt = -Infinity;
let coldNothing = false; // the last answer found nothing: the next text goes at once
let coldTimer = null;
const coldListeners = new Set();
const coldKey = (body) => JSON.stringify(body);
const answerWaiters = (entry, outcome) => {
  for (const done of entry.waiters) done(outcome);
  entry.waiters = [];
};

/** The server's answers while this device has no index: fn({ ...answer, online: true, indexing: true, at }), at: when what it answers was
 * typed (performance.now()). Returns the way to stop listening. */
export function onColdAnswer(fn) {
  coldListeners.add(fn);
  return () => coldListeners.delete(fn);
}

/** Sends the newest text when it may go: nothing out, and COLD_EVERY since the last send (at once after an answer that found nothing). */
function coldNext() {
  clearTimeout(coldTimer);
  coldTimer = null;
  if (coldOut || !coldWaiting) return;
  const wait = coldNothing ? 0 : coldSentAt + COLD_EVERY - performance.now();
  if (wait > 0) return void (coldTimer = setTimeout(coldNext, wait));
  const entry = coldWaiting;
  coldWaiting = null;
  coldOut = entry;
  coldSentAt = performance.now();
  coldNothing = false;
  ask("/api/translate", null, entry.body).then((outcome) => {
    coldOut = null;
    coldNothing = Boolean(outcome.answer) && !outcome.answer.whole && !outcome.answer.words?.length;
    // The next text on its way before this one is drawn.
    coldNext();
    answerWaiters(entry, outcome);
    if (!outcome.answer) return;
    const found = { ...outcome.answer, online: true, indexing: true, at: entry.at };
    for (const fn of coldListeners) fn(found);
  });
}

/** The server's answer for body ({ q, language } or { q, from, to }) through the cold lane: { answer } | { failed } | { offline } |
 * { superseded } (newer text went instead; the caller asks again if it still wants this one). */
function coldAsk(body) {
  const key = coldKey(body);
  return new Promise((resolve) => {
    // The same text already out, or waiting to go: one request answers both.
    for (const entry of [coldOut, coldWaiting]) if (entry?.key === key) return void entry.waiters.push(resolve);
    if (coldWaiting) answerWaiters(coldWaiting, { superseded: true });
    coldWaiting = { body, key, at: performance.now(), waiters: [resolve] };
    coldNext();
  });
}

/**
 * Translates text between English and a language: from and to are "en" and a language code (either one says the
 * direction; both left out, the language is the one you're learning and the direction the one that finds more, here
 * or, when this device finds the same both ways, on the server; one word found whole both ways shows both readings).
 * Resolves to null for nothing typed, else
 * { query, from, to, online, onlineFailed?, whole, words, sentences, unknown, sources, found, tokens, alternatives, main }
 * (engine.js says what each holds); online: whether Lexicommons' and shared packs were searched too; onlineFailed: they
 * were asked, and didn't answer, so what's here is only this device's; notSearched: Lexicommons' default packs the server
 * leaves to the devices (src/translate.ts), and partial: a budget stopped it. This device's results come first.
 *
 * What it takes as its third argument: onLocal(result), this device's results as soon as they're found and before the
 * server answers (pending: true), when they found something; pauseOnline: ms to wait before asking the server (a person
 * still typing never asks for each letter; with no index on this device yet, the cold lane's pace instead: coldAsk); signal: stops the
 * asking (not the cold lane's, which outlives a key); stale: true looks in the newest index there is while a newer one is made, instead
 * of waiting for it (onTranslateIndex says when it's ready), and online, with none yet, takes the server's answer meanwhile.
 */
export async function translate(text, { from, to, language: asked } = {}, { onLocal, pauseOnline = 0, signal, stale = false } = {}) {
  const query = String(text ?? "").trim();
  if (!query) return null;
  const language = from && from !== "en" ? from : to && to !== "en" ? to : asked ?? learning();
  const looking = lookHere(query, { from, to, language }, { stale });
  // The server through the cold lane (coldAsk: at once on a first key, then one at a time, at most once in COLD_EVERY, no pause) while this
  // device can't answer for itself yet: no index here, or this language's packs still arriving (a newcomer's first minutes: their index is
  // made at once from what they have, maybe nothing). With no index, its answer is the result the moment it's back unless the index came
  // first; it's marked indexing, and the page looks again when the index is ready (onTranslateIndex), with this device's own merged in.
  // While packs arrive, this device's own answer is drawn first as it always is (onLocal) and the cold lane's answer is the server's half of
  // the merge below. Outside that window (packs all in, a word this device lacks), the pause before asking, as before.
  // The same while this device's index is being made again (rebuilding: a pack came, the old index let go first, G10): the key waits ~125 ms
  // of a slowed phone's worker for it otherwise (9 Nov 2026), and the server answers in the meantime, the device's own merged in after.
  let early = null;
  const making = !built || rebuilding;
  if (stale && !isOffline() && (making || packDownloads()?.language === language)) {
    early = coldAsk(from || to ? { q: query, from: from ?? (to === "en" ? language : "en"), to: to ?? (from === "en" ? language : "en") } : { q: query, language });
    if (making) {
      const first = await Promise.race([looking.then(() => "here", () => "here"), early.then(() => "server")]);
      if (signal?.aborted) return null;
      const answered = first === "server" ? (await early).answer : null;
      if (answered) return { ...answered, online: true, indexing: true };
    }
  }
  const look = await looking;
  let local = look.tied ? look.there : look.result;
  // This device's result before the server answers: when the packs found something, and when they didn't but the full
  // translator is here for the language (the page asks it from this result: on Wi-Fi with no internet the server's answer
  // would hold it back its 20 s).
  const translatorHere = translatorState(local.from, local.to).state === "ready";
  if ((local.found || translatorHere) && onLocal && !isOffline()) onLocal({ ...mergeResults(local, null), online: false, pending: true });
  if (!early) await pause(pauseOnline, signal);
  if (signal?.aborted) return null;
  // One question: which way too, when this device can't tell.
  const params = look.tied || local.both || local.led ? { q: local.query, language } : { q: local.query, from: local.from, to: local.to };
  // In the body, never the URL: what someone types is theirs, and a URL ends up in the host's logs. The server asked before
  // the index was ready answers again here, unless it went the other way from what this device read.
  const before = early && (await early);
  // A newer key stopped this one while the cold lane answered (its text superseded there): nothing to ask for.
  if (signal?.aborted) return null;
  const { answer, failed } = before && (before.failed || (before.answer?.from === local.from && before.answer?.to === local.to)) ? before : await ask("/api/translate", signal, params);
  if (signal?.aborted) return null;
  // When this device couldn't tell which way, the server's way (else the language to English).
  if (look.tied && answer?.from === "en") local = look.back;
  const usable = answer && answer.from === local.from && answer.to === local.to ? answer : null;
  const merged = mergeResults(local, usable);
  // The server knows who shared a pack (this device only that it's shared), so its credit wins for the same source.
  const sources = merged.sources.map((source) => usable?.sources.find((s) => s.id === source.id) ?? source);
  // What the two sides are is this device's reading, or the server's when this device found nothing to read.
  const sides = local.found ? local : (usable ?? local);
  return { ...merged, ...(sides.both ? { both: true } : {}), ...(sides.reading ? { reading: sides.reading } : {}), ...(sides.readings ? { readings: sides.readings } : {}), ...(sides.led ? { led: true } : {}), sources, online: Boolean(usable), ...(usable?.notSearched ? { notSearched: usable.notSearched } : {}), ...(usable?.partial ? { partial: true } : {}), ...(failed ? { onlineFailed: true } : {}) };
}
