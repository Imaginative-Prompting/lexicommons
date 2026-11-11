// Translate's index and search off the page's thread (translate.js is its other side), so typing never waits on them:
// the sources come one at a time, the index is built once they're all here, and a search answers from the newest index
// built while a newer one is on its way. Pure engine.js underneath; nothing here touches the page.
//
//   { type: "begin", key, keep: [ids] }   a new set of sources: forgets any not named
//   { type: "source", source }            one source that's new or changed (a pack's: its first sentences)
//   { type: "more", id, items }           the next of that source's sentences, in order (a part at a time: a whole band's copy held
//                                         the page's thread for 90 ms at 4×)
//   { type: "end", key, order: [ids], kept? }   builds the index a piece at a time → { type: "built", key, languages, ms }; with kept, then
//                                         keeps it on the device under that key (IndexedDB, KEPT), the last one built. A look while it's made
//                                         waits and is answered from it; a newer end, or a new begin, drops it
//   { type: "load", id, key, kept }       the index kept under kept, read back instead of made → { type: "loaded", id, languages } (null:
//                                         none kept for it; then the sources come as above)
//   { type: "look", id, text, options }   → { type: "looked", id, key, look, ms } (engine.js lookBothWays)

import { buildIndexSteps, indexLanguages, lookBothWays } from "./engine.js";

const sources = new Map();
let index = null;
let indexKey = null;

// The last index built, kept on this device (translate.js KEPT_DB): a worker started again (Translate opened a while after it was left)
// reads it back here, off the page, instead of being sent every pack and building it again. One record, replaced by each build, and its
// key (what it was made of: the app's version, every source's) in a record of its own, written with it: a key that's changed is found
// without reading the index (~30 MB with the Dutch word bands).
const KEPT_DB = "lexicommons-translate-index";
const KEPT_STORE = "index";
let kept = null;
const KEEP_AFTER = 5000; // ms an index stands before it's kept
// ms with no look before it's kept: the write is one long piece of the worker's (the index cloned into IndexedDB, ~0.3 s of a slowed phone's,
// 7 Nov 2026), and a key typed meanwhile waited for it (translate-check's speed: three keys over 100 ms, the worker busy keeping).
const KEEP_QUIET = 2000;
let keepTimer = null;
let lastLook = -Infinity;
/** Keeps this index once it has stood KEEP_AFTER and nobody has looked for KEEP_QUIET (a newer build cancels it). */
function keepWhenQuiet(kept, built, wait = KEEP_AFTER) {
  keepTimer = setTimeout(() => {
    if (built !== index) return;
    const typing = KEEP_QUIET - (performance.now() - lastLook);
    if (typing > 0) return keepWhenQuiet(kept, built, typing);
    keep(kept, built).catch(() => {});
  }, wait);
}
const keptDb = () =>
  (kept ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(KEPT_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(KEPT_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
async function readKept(key) {
  const db = await keptDb();
  return new Promise((resolve) => {
    const store = db.transaction(KEPT_STORE).objectStore(KEPT_STORE);
    const named = store.get("key");
    named.onsuccess = () => {
      if (named.result !== key) return resolve(null);
      const last = store.get("last");
      last.onsuccess = () => resolve(last.result?.key === key ? last.result.index : null);
      last.onerror = () => resolve(null);
    };
    named.onerror = () => resolve(null);
  });
}
async function keep(key, built) {
  const db = await keptDb();
  const store = db.transaction(KEPT_STORE, "readwrite").objectStore(KEPT_STORE);
  store.put({ key, index: built, at: Date.now() }, "last");
  store.put(key, "key");
}

// The build, a piece at a time (engine.js buildIndexSteps, about PIECE_MS each): this worker's other messages are taken between pieces (a
// whole build held it 0.3–0.5 s here and about 1 s on an older iPhone, 7 Nov 2026). A look that comes meanwhile waits for it and is answered
// from it, never from half an index (and there's no other: the one before is let go first, G10). A newer build, or a new set of sources,
// drops the one under way, which never says it's built.
const PIECE_MS = 8;
let building = null; // { steps, key, kept, started }
const waiting = []; // looks that came while an index was being made
// A browser's worker: a message to itself, a task of its own after the messages waiting. Node (the tests) has setImmediate: its own ports take
// a message posted while they're delivering in the same go, so nothing would run between the pieces (as know/slices.js has it).
const node = typeof setImmediate === "function";
const tick = node ? null : new MessageChannel();
let ticking = false; // a piece is asked for (one at a time, whichever build it finds)
const fire = () => {
  ticking = false;
  buildMore();
};
const later = () => {
  if (ticking) return;
  ticking = true;
  if (node) setImmediate(fire);
  else tick.port2.postMessage(0);
};
if (tick) tick.port1.onmessage = fire;
function buildMore() {
  const b = building;
  if (!b) return;
  const until = performance.now() + PIECE_MS;
  let step;
  do step = b.steps.next();
  while (!step.done && performance.now() < until);
  if (!step.done) return void later();
  building = null;
  index = step.value;
  indexKey = b.key;
  self.postMessage({ type: "built", key: b.key, languages: indexLanguages(index), ms: Math.round(performance.now() - b.started) });
  // Kept once it has stood a while (KEEP_AFTER) and looks have stopped (KEEP_QUIET): nothing waits on it, a build after it replaces it
  // before it's written (a burst writes one, not one each), and a device that can't keep it just builds it again next time.
  if (b.kept && typeof indexedDB !== "undefined") keepWhenQuiet(b.kept, index);
  for (const look of waiting.splice(0)) answer(look);
}
function answer(data) {
  const started = performance.now();
  const look = lookBothWays(index, data.text, data.options);
  self.postMessage({ type: "looked", id: data.id, key: indexKey, look, ms: performance.now() - started });
}

self.onmessage = ({ data }) => {
  if (data.type === "begin") {
    // A new set of sources: a build of the set before is of no use (its sources change under it).
    building = null;
    const keep = new Set(data.keep);
    for (const id of sources.keys()) if (!keep.has(id)) sources.delete(id);
  } else if (data.type === "source") {
    sources.set(data.source.id, data.source);
  } else if (data.type === "more") {
    sources.get(data.id)?.items.push(...data.items);
  } else if (data.type === "end") {
    // The index before is let go first: built beside it, a phone held two (G10). A look meanwhile waits for the new one.
    index = null;
    clearTimeout(keepTimer);
    building = { steps: buildIndexSteps(data.order.map((id) => sources.get(id)).filter(Boolean)), key: data.key, kept: data.kept, started: performance.now() };
    later();
  } else if (data.type === "load") {
    (typeof indexedDB === "undefined" ? Promise.resolve(null) : readKept(data.kept).catch(() => null)).then((found) => {
      if (found) {
        index = found;
        indexKey = data.key;
      }
      self.postMessage({ type: "loaded", id: data.id, languages: found ? indexLanguages(found) : null });
    });
  } else if (data.type === "look") {
    lastLook = performance.now();
    if (building) waiting.push(data);
    else answer(data);
  }
};
