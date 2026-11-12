// The packs on this device. IndexedDB (lexicommons-packs, store packs), one record per pack:
//   yours         { id, pack, addedAt, changedAt, by, lastChange, through, account, audio? }: study material your AI made (by:
//                 who made the last change; lastChange: the id of the last change from your AI it took, through: that
//                 change's place in the relay, account: the account whose relay it came through, study/pack-inbox.js)
//   public packs  { id: "library:<pack id>", pack, source: { kind, id, version, language, corrections? }, fixes?, addedAt,
//                 changedAt }: a copy of a pack in the open library (/library/packs/<id>/<version>/pack.json), kept so
//                 studying works offline. kind: default (Lexicommons' own, listed in the catalog for the language you're
//                 learning, everyone has them) or follow (one you follow: from the follows source the community section
//                 registers, setFollowsSource; own: true when it's one of Lexicommons' opt-in packs, added in Explore). corrections: "community" when you follow it with community corrections;
//                 then fixes ({ version, fixes }) are its open fixes from Explore, kept beside the copy as published, and
//                 studying sees the copy with the most-liked fix per piece in it (study/pack-corrections.js). audio:
//                 { url, manifest }, its recordings when its catalog entry (or follow) names them (pack-audio.js: checked
//                 with every voice's license and credit; packAudio gives them as voice.js plays them).
// Every pack goes through pack-format.js's check when it arrives and again when it's loaded, so nothing on the device
// skips it, and a public pack's content must hash to the version it's listed at. A public pack is kept with the proof
// of its full check (checked: pack-format.js checkedProof); at a start, one whose proof still holds and whose content
// still hashes to its version is used without the full check again (a series of big packs made every start seconds
// slower on a phone). That hashing is done in a worker reading the same records (pack-hash-worker.js), and a hash is used
// only for the very record it was made of; anything else is hashed here. Anything else, a changed pack, new check rules, your own packs, is checked in full, as is a
// pack's community corrections overlay (viewOf). A stored pack that fails is left where it is but not used
// (packProblems() lists them). The starter is also inside the app (public/js/packs/), used
// until its copy from the library is here: a first start offline still has something to study.
// Each pack is on or off (localStorage "lx.packs.v1": { off: [pack id] }), and studying draws only on the ones that are
// on (content.js), so one pack on its own is a way to study. Other tabs follow a change.
// What each change from your AI did here is kept (IndexedDB lexicommons-pack-changes, the last 30 per pack, with the
// pack as it was before), so it can be undone.
// A pack of yours may carry recordings your AI made for it (audio: { manifest }, pack-audio.js version 2, clips at
// /api/packs/audio/<clip>, the account's own): they come as a change through the relay, stay while they fit the pack
// (a sentence it loses or changes loses its recordings: fitAudio), and play as any pack's own (packAudio, voice.js).
// With your own storage connected, the signed-in account's packs of yours sync (sync.js, kind "packs"), each whole
// record with the changes from your AI it took (changes, the last 50) and the edits made to it outside the relay since
// the last of them (edits: a copy from Explore, a delete while the relay couldn't be reached). Of two copies, the one
// further along the relay (through) wins, whatever the clocks say; then the one with more edits since; then the newer
// (one order, so every device ends with the same). One that arrives is checked like any other, and only up to the
// relay's furthest change (setRelayLatest); a change it names is one pack-inbox.js needn't take. Deleting one leaves
// a deletion that syncs, kept in the same store ({ id: "gone:<account>:<pack id>", gone: true, account, pack, at,
// changes, edits, through }) and written in one transaction with the pack it replaces. A pack a deletion from your
// storage takes away is kept with it for 30 days (restore, restoreUntil), so it can be restored (deletedElsewhere,
// restorePack): a file in that storage can delete what it syncs. A pack this device saw the relay delete is never
// offered to restore, whatever arrives after (its own record, here only: { id: "relaygone:<account>:<pack id>", seq },
// until a later change from the relay makes it again). Copies of public packs don't sync: the library and your follows
// bring them.
// The language's shared grammar (study/grammar.js) syncs first, from the same catalog: a pack may use a pattern its
// newer revision added.

import { BUILT_IN } from "../packs/index.js";
// The shared grammar first: what it keeps on this device is installed before any pack here is checked.
import { onGrammarChange, syncGrammar } from "./grammar.js";
import { syncForms, syncNotes } from "./notes.js";
import { checkPack, checkPackSteps, checkedProof, isAudioUrl, isPackId, isPackRef, PACK_ID, packBytesSteps, packRefs, packUrl, packVersion, proofHolds, upgradePack, versionOfBytes } from "./pack-format.js";
import { inSlices } from "../know/slices.js";
import { checkAudio, clipsOf, clipUrl, fitAudio, readAudio, unchangedItems } from "./pack-audio.js";
import { CLIPS, keepClips } from "./keep-clips.js";
import { CLIP_BYTES, clipBlob, hasClip, isClip, keepClip, loadClips, onClipsChange, pruneClips } from "./clips.js";
import { communityOverlay } from "./pack-corrections.js";
import { learning, onLearningChange } from "./learning.js";
import { demoPage } from "./sample-mode.js";
import { canonical, registerBlobs, registerSync, winner } from "../sync.js";
import { fetchRetrying, onReconnect } from "../lx/retry.js";

const DB = "lexicommons-packs";
const STORE = "packs";
const ON_KEY = "lx.packs.v1";
const ORDER_KEY = "lx.packs.order.v1"; // { <language>: [pack id] }: the catalog's order of a language's default packs, as of the last sync
const GONE = "gone:"; // a deletion's record id: "gone:<account>:<pack id>"
const RELAY_GONE = "relaygone:"; // the relay deleted this pack: "relaygone:<account>:<pack id>" (this device only)
const LINEAGE = 50; // the changes from your AI a record names, the latest last
/** How long a pack a deletion from your storage took is kept, to restore. */
export const RESTORE_DAYS = 30;
const DAY = 86_400_000;
const LIBRARY = "library:"; // a public pack's record id: "library:<pack id>"
const CATALOGUE = "/library/catalogue.json";
const SYNC_EVERY = 10 * 60_000; // when the app comes back into view, at most this often
const RECORDINGS_EVERY = 60_000; // the recordings of the versions here, looked for when the app comes back into view, at most this often
const bundled = BUILT_IN.map((pack) => ({ ...pack, builtIn: true, origin: { kind: "app" } }));
const listeners = new Set();
let records = []; // yours, checked, oldest first
let library = []; // public packs' copies, checked, oldest first
let refused = []; // stored or fetched, but failing the check: { id, errors }
const memory = new Map(); // when IndexedDB isn't there (a private window): this visit only
let opening = null;
let channel = null;
let syncing = null;
let lastSync = 0;
let lastRecordings = 0;
let watching = false;
let followsSource = null; // () => Promise<[{ id, version }]>: the packs you follow (the community section's)
let followAdder = null; // (id) => Promise: follows one of Lexicommons' packs for this account, as Explore's Add does
const optInSeen = new Set(); // Lexicommons' opt-in packs the catalog listed, this visit (sync)
let lastLoad = null; // { checked, trusted, hashedAway, hashedHere, at }: what the last loadPacks did with the public packs
let signedIn = null; // the account signed in (pack-inbox.js): a pack of yours made here is that account's
let downloads = null; // { language, done, total }: public packs a sync is fetching that this device hasn't got yet
const downloadListeners = new Set();

/**
 * The public packs a sync is downloading now, that this device hasn't got at their version yet: { language, done,
 * total }, or null. Until they're here, Translate looks them up online (translate.js); they're used once the sync ends.
 */
export const packDownloads = () => (downloads ? { ...downloads } : null);

/** Calls fn(packDownloads()) whenever downloads start, move on or end. Returns a function that stops it. */
export function onPackDownloads(fn) {
  downloadListeners.add(fn);
  return () => downloadListeners.delete(fn);
}

function setDownloads(next) {
  downloads = next;
  for (const fn of downloadListeners) fn(packDownloads());
}

function readOff() {
  try {
    const value = JSON.parse(localStorage.getItem(ON_KEY) ?? "null");
    if (Array.isArray(value?.off)) return new Set(value.off.filter((id) => typeof id === "string"));
  } catch {}
  return new Set();
}
let off = readOff();
const keepOff = () => {
  try {
    localStorage.setItem(ON_KEY, JSON.stringify({ off: [...off] }));
  } catch {}
};

// Deletions of your packs, to sync, kept beside them (loadPacks reads them in): "<account>:<pack id>" → the deletion.
let tombs = new Map();
const tombId = (account, id) => `${GONE}${account}:${id}`;
let relayGone = new Map(); // "<account>:<pack id>" → { id, account, pack, seq }
const relayGoneId = (account, id) => `${RELAY_GONE}${account}:${id}`;
let relayLatest = 0; // the relay's furthest change, as the account last said (setRelayLatest)
let askRelay = null; // asks the account how far its relay has got (pack-inbox.js)
let waitingOnRelay = false; // a copy from your storage waits for the relay's furthest change

function db() {
  return (opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  }));
}

/**
 * Every record, read one at a time in one transaction: each its own request, so each is made into objects in a task of its own (a dozen
 * 2,000-sentence packs read by one getAll held a phone's main thread for a second at a start).
 */
function readEach() {
  return db().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const out = [];
        const keys = store.getAllKeys();
        keys.onsuccess = () => {
          const list = keys.result ?? [];
          const next = (i) => {
            if (i >= list.length) return;
            const request = store.get(list[i]);
            request.onsuccess = () => {
              if (request.result !== undefined) out.push(request.result);
              next(i + 1);
            };
          };
          next(0);
        };
        tx.oncomplete = () => resolve(out);
        tx.onerror = tx.onabort = () => reject(tx.error);
      }),
  );
}

function run(mode, action) {
  return db().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      }),
  );
}

// A public pack from before version 2 stays on the device as it was published, as its version is the hash of those bytes (published); it's
// used upgraded (upgradePack).
const asKept = ({ published, ...record }) => (published ? { ...record, pack: published } : record);
const publishedOf = (raw) => (raw?.version === 1 ? { published: raw } : {});

const put = async (given) => {
  const record = asKept(given);
  try {
    await run("readwrite", (store) => store.put(record));
  } catch {
    memory.set(record.id, record);
  }
};

// A library pack's record written by a worker (pack-put-worker.js): IndexedDB's put serializes the whole record where it's called, and a word
// band's took a phone's main thread 44–52 ms at 4× every time a sync brought one (7 Nov 2026). The worker gets the pack as the bytes of its
// text (what was hashed against its version: exactly what's kept, JSON.parse giving it back), transferred, and the rest of the record, and
// answers once its write is complete, so whatever reads the store after (a load, the hash worker, another tab) finds it. No worker, or one
// that fails or doesn't answer: the record is put here, as before.
const PUT_WAIT = 20_000;
let putter = null; // { worker, waiting: Map(seq → { resolve, timer }), settle }, while writes are out
let putSeq = 0;
function putAway(message, transfer) {
  if (typeof Worker !== "function") return Promise.resolve(false);
  if (!putter) {
    let worker;
    try {
      worker = new Worker(new URL("./pack-put-worker.js", import.meta.url), { type: "module", name: "lexicommons-pack-put" });
    } catch {
      return Promise.resolve(false);
    }
    const waiting = new Map();
    const settle = (seq, ok) => {
      const one = waiting.get(seq);
      if (!one) return;
      clearTimeout(one.timer);
      waiting.delete(seq);
      one.resolve(ok);
      if (!waiting.size && putter?.worker === worker) {
        worker.terminate();
        putter = null;
      }
    };
    worker.onmessage = ({ data }) => settle(data?.seq, data?.ok === true);
    worker.onerror = () => {
      for (const seq of [...waiting.keys()]) settle(seq, false);
    };
    putter = { worker, waiting, settle };
  }
  const { worker, waiting, settle } = putter;
  // Each write answered by its own number: the worker takes them in turn, and IndexedDB keeps their transactions in that order, so a later
  // write of the same record is the one that stays.
  const seq = ++putSeq;
  return new Promise((resolve) => {
    waiting.set(seq, { resolve, timer: setTimeout(() => settle(seq, false), PUT_WAIT) });
    try {
      worker.postMessage({ ...message, seq }, transfer);
    } catch {
      settle(seq, false);
    }
  });
}

/**
 * A library record kept: its pack's text as bytes (packBytesSteps of what's kept: the published raw of a version 1 pack, else the pack; made
 * here a few ms at a time when not given) and the rest written by the worker; resolves once it's written, here if the worker can't.
 */
async function putLibrary(given, bytes) {
  const kept = asKept(given);
  const { pack, ...rest } = kept;
  const text = bytes ?? (await inSlices(packBytesSteps(pack)));
  const away = await putAway({ db: DB, version: 1, store: STORE, record: rest, bytes: text }, [text.buffer]).catch(() => false);
  if (!away) await put(given);
}
/**
 * Puts recordings (or none) on a public pack's record as it's stored now, only while it's still the version they're
 * for: another tab may have installed a newer one while they were being fetched. Returns whether it wrote.
 */
async function putAudio(key, version, audio) {
  const merge = (latest) => {
    if (!latest || latest.source?.version !== version) return null;
    const next = { ...latest };
    if (audio) next.audio = audio;
    else delete next.audio;
    return next;
  };
  try {
    return Boolean(
      await run("readwrite", (store) => {
        const out = { result: false };
        const request = store.get(key);
        request.onsuccess = () => {
          const next = merge(request.result);
          if (next) store.put(next);
          out.result = Boolean(next);
        };
        return out;
      }),
    );
  } catch {
    const next = merge(memory.get(key));
    if (next) memory.set(key, next);
    return Boolean(next);
  }
}
const remove = async (id) => {
  try {
    await run("readwrite", (store) => store.delete(id));
  } catch {}
  memory.delete(id);
};
/** Takes records away and writes others in one transaction (in memory when there's no IndexedDB). */
async function writeAll({ puts = [], removes = [] }) {
  try {
    await run("readwrite", (store) => {
      for (const id of removes) store.delete(id);
      for (const record of puts) store.put(record);
    });
  } catch (error) {
    // A write the database refused (its storage full) fails, so the inbox never acknowledges a relay change a later
    // load would lose; only a device whose database won't open at all (a private window) keeps this visit's packs here.
    if (await db().then(() => true, () => false)) throw error;
    for (const record of puts) memory.set(record.id, record);
  }
  for (const id of removes) memory.delete(id);
}

/** The changes a record names, with one more from your AI (applied) at the end. */
function lineageOf(record, applied) {
  const changes = Array.isArray(record?.changes) ? record.changes : record?.lastChange ? [record.lastChange] : [];
  return (applied ? [...changes.filter((c) => c !== applied), applied] : changes).slice(-LINEAGE);
}

// Other tabs: a change there is loaded here.
function tell() {
  if (!channel && typeof BroadcastChannel === "function") {
    channel = new BroadcastChannel("lx-packs");
    channel.onmessage = () => loadPacks();
  }
  return channel;
}

// Inside packsBatch: what changed is told once, at its end (held: this tab's listeners, other tabs'). 0 outside one.
let batching = 0;
const held = { here: false, everywhere: false };
const changed = () => {
  if (batching) return void (held.here = true);
  for (const listener of listeners) listener();
};
// What content.js works out from the packs (its view), done a few ms at a time before a sync's change is told, so telling it is quick
// (content.js prepare). Anything else that changes the packs tells at once, and the view is worked out then.
let prepareContent = null;
/** content.js's: fn() resolves once the view of the packs as they are now is ready to be taken. */
export function setContentPrepare(fn) {
  prepareContent = fn;
}
const changedEverywhere = () => {
  if (batching) return void (held.here = held.everywhere = true);
  changed();
  tell()?.postMessage("changed");
};

/**
 * Runs fn (several packs changed in a row: the relay's round, an AI's packs arriving together) with what changes told once, at its end, the
 * view studying draws on worked out a few ms at a time first (content.js prepare), as a sync's is. Each told on its own, every pack made a
 * whole view at once, and an AI's four made four: a phone's page 411 → 648 MB (WebKit, 7 Nov 2026), and Translate's index a build each.
 * A pack saved alone (the editor, Add pack, a deck) still tells at once. Nested, the outermost tells. Resolves to fn's answer.
 */
export async function packsBatch(fn) {
  batching++;
  try {
    return await fn();
  } finally {
    if (--batching === 0 && held.here) {
      const everywhere = held.everywhere;
      held.here = held.everywhere = false;
      await prepareContent?.().catch(() => {});
      // A change made while the view was worked out (another tab's, a toggle) has told by itself, at once; this tells what's held.
      changed();
      if (everywhere) tell()?.postMessage("changed");
    }
  }
}

const refuse = (id, errors) => {
  refused = [...refused.filter((entry) => entry.id !== id), { id, errors }];
  console.warn(`Lexicommons: the pack "${id}" didn't pass the check, so it isn't used:`, errors);
};

// A followed pack with community corrections, as studying sees it: worked out when its fixes arrive (sync) and at load,
// kept in memory only (record id → { pack, applied }), so the copy as published is what's stored and switching back is
// instant.
const views = new Map();

/** Works out (or drops) a followed pack's view with community corrections. */
function viewOf(record) {
  if (record.source.kind !== "follow" || record.source.corrections !== "community" || record.fixes?.version !== record.source.version || !record.fixes.fixes?.length) {
    views.delete(record.id);
    return;
  }
  // Checked against Lexicommons' own packs, as sharing is (never allPacks(), which reads these views). The fixes came
  // from the server: if working them in fails, the copy as published is used, and loading goes on.
  try {
    const { pack, applied } = communityOverlay(record.pack, record.fixes.fixes, { installed: defaultPacks().filter((p) => p.id !== record.pack.id) });
    views.set(record.id, { pack, applied });
  } catch (error) {
    views.delete(record.id);
    console.warn(`Lexicommons: the community corrections for "${record.id}" couldn't be worked in, so the pack as published is used:`, error);
  }
}

// A public pack's copy as studying sees it (with community corrections in it, when you follow it that way).
const asPack = (record) => {
  const view = record.source.kind === "follow" && record.source.corrections === "community" ? views.get(record.id) : undefined;
  return { ...(view?.pack ?? record.pack), builtIn: record.source.kind === "default", origin: { kind: record.source.kind, version: record.source.version, ...(record.source.own ? { own: true } : {}), ...(view ? { corrections: view.applied } : {}) } };
};

// Default packs in the catalog's order, however and whenever each version arrived: what's taught and credited follows it (a word series is
// in frequency order, and Translate ranks words by where they come). Kept at each sync so a start offline has it. A device that
// hasn't synced since this came uses the packs' ids, and a pack the catalog doesn't list (a local library's starter) stays first if it's built in.
function readOrder() {
  try {
    const value = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "null");
    if (value && typeof value === "object") return value;
  } catch {}
  return {};
}
let catalogOrder = readOrder();

// ---------- a language's lessons on their way ----------

// The packs that carry each language's lessons, as the catalog last said them ({ [language]: [id] }), kept on the device, so a start
// knows before the catalog is read again. A language not in it has never had its catalog read on this device.
const LESSON_PACKS_KEY = "lx-lesson-packs";
let lessonPacksSaid = (() => {
  try {
    const value = JSON.parse(localStorage.getItem(LESSON_PACKS_KEY) ?? "null");
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {}
  return {};
})();
// Which of a language's default packs teach its script (pack-format.js teaches: "script": Japanese's kana), as the catalog last said on this
// device, kept across starts: Home holds the letters' link on a new learner's first card from its first frame while they come (know/today.js).
const SCRIPT_PACKS_KEY = "lx-script-packs";
let scriptPacksSaid = (() => {
  try {
    const value = JSON.parse(localStorage.getItem(SCRIPT_PACKS_KEY) ?? "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
})();
function rememberScriptPacks(language, ids) {
  if (JSON.stringify(scriptPacksSaid[language] ?? null) === JSON.stringify(ids)) return;
  scriptPacksSaid = { ...scriptPacksSaid, [language]: ids };
  try {
    localStorage.setItem(SCRIPT_PACKS_KEY, JSON.stringify(scriptPacksSaid));
  } catch {}
}
/** The default packs that teach a language's script, as the catalog last said on this device: [] when it lists none, null when never read. */
export const scriptPacksListed = (language = learning()) => scriptPacksSaid[language] ?? null;

function rememberLessonPacks(language, ids) {
  if (JSON.stringify(lessonPacksSaid[language]) === JSON.stringify(ids)) return;
  lessonPacksSaid = { ...lessonPacksSaid, [language]: ids };
  try {
    localStorage.setItem(LESSON_PACKS_KEY, JSON.stringify(lessonPacksSaid));
  } catch {}
}
/**
 * Which of a language's own packs carry its lessons: the defaults the catalog says have lessons; on a catalog from before it said (no
 * entry with the count), path-<language>. (An opt-in pack isn't a newcomer's lessons.)
 */
const lessonRefsOf = (refs, language) => {
  const defaults = refs.filter((ref) => !ref.optIn);
  return refs.some((ref) => "lessons" in ref) ? defaults.filter((ref) => ref.lessons > 0) : defaults.filter((ref) => ref.id === `path-${language}`);
};
// Whether a pack of Lexicommons' own with lessons in that language is on this device.
const lessonsHere = (language) => library.some((record) => record.source.kind === "default" && record.source.language === language && record.pack?.lessons?.length);
/** How long a start waits for a language's lessons before it gives them up for now (lessonsComing): what's here is studied meanwhile. */
export const LESSONS_WAIT = 15_000;
// What this start's syncs have said of each language's lessons (true: on their way; false: here, or not coming after all), and when each
// was first taken to be coming (the wait's start).
const lessonsSaid = new Map();
const comingSince = new Map();
const comingListeners = new Set();
const comingTimers = new Map();
function tellComing() {
  for (const listener of [...comingListeners]) {
    try {
      listener();
    } catch (error) {
      console.error(error);
    }
  }
}
// The wait's start, the first time a language's lessons are taken to be coming, and its end told when it comes.
function startWait(language) {
  if (comingSince.has(language)) return;
  comingSince.set(language, Date.now());
  comingTimers.set(
    language,
    setTimeout(() => {
      comingTimers.delete(language);
      if (lessonsSaid.get(language) !== false) tellComing();
    }, LESSONS_WAIT),
  );
}
// quietly: the caller tells (the lessons here: after studying has taken them, so both kinds of listener find them). was: what it was before the
// caller changed what it's worked out from (the catalog's answer remembered first, so a listener finds lessonsMissing settled too).
function sayLessons(language, coming, { quietly = false, was = lessonsComing(language) } = {}) {
  lessonsSaid.set(language, coming);
  if (!coming) {
    clearTimeout(comingTimers.get(language));
    comingTimers.delete(language);
  }
  const turned = was !== lessonsComing(language);
  if (turned && !quietly) tellComing();
  return turned;
}
/**
 * Whether the lessons of a language (the one you're learning) are on their way, so a newcomer's first lesson waits for them rather than
 * the starter's: true from the first frame on a device that has never read the catalog for it and has no pack of it with lessons, and
 * while a sync brings the pack the catalog says carries them (a lessons count on its entry: pack-format.js catalogueEntry; path-<language>
 * on a catalog from before). False once they're in what studying draws on (it turns false just before onContentChange tells of them), or
 * once a sync gives them up (the catalog unreachable, the pack refused or not fetched, none listed, the sync over without them), and
 * LESSONS_WAIT after this start's first sync for the language began (never counted from a look before it, a first run's questions on screen): the starter is studied meanwhile, and lessons that come later come as any change does.
 * One answer for Home's card, Study's, the path and a lesson's start.
 */
export function lessonsComing(language = learning()) {
  if (!mayBeComing(language)) return false;
  // The wait counts from this language's sync (syncNow starts it), never from the first look: Home is drawn under a first run's questions,
  // which can take longer than the wait, and nothing is asked for until a language is picked (8 Nov 2026: 20 s over the questions, and Start
  // opened a word band's lesson while path-nl was still on its way). Until its sync starts, they're coming.
  if (!comingSince.has(language)) return true;
  return Date.now() - comingSince.get(language) < LESSONS_WAIT;
}
// Whether a language's lessons may still be on their way, the clock aside: what a sync has said, else none here and the catalog listing some
// (or never read for it on this device).
function mayBeComing(language) {
  const said = lessonsSaid.get(language);
  return said ?? (!lessonsHere(language) && (lessonPacksSaid[language] === undefined || lessonPacksSaid[language].length > 0));
}
/**
 * Whether a language's lessons were given up without them (lessonsComing false and none here): the catalog lists a pack that carries them
 * and it isn't here (its file failed, or LESSONS_WAIT ran out), or the catalog has never been read on this device for it (offline from the
 * start). False while they're coming, once they're here, and for a language the catalog lists none for: then there are none to miss. It turns
 * with lessonsComing (onLessonsComing) and when they come (onContentChange).
 */
export function lessonsMissing(language = learning()) {
  if (lessonsHere(language) || lessonsComing(language)) return false;
  const said = lessonPacksSaid[language];
  return said === undefined || said.length > 0;
}
/** Calls listener() whenever lessonsComing turns, either way (the lessons here: onContentChange tells of them too). Returns its stop. */
export function onLessonsComing(listener) {
  comingListeners.add(listener);
  return () => comingListeners.delete(listener);
}

function keepOrder(language, ids) {
  if (JSON.stringify(catalogOrder[language]) === JSON.stringify(ids)) return;
  catalogOrder = { ...catalogOrder, [language]: ids };
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(catalogOrder));
  } catch {}
}
const BUNDLED_IDS = new Set(BUILT_IN.map((pack) => pack.id));
function inCatalogOrder(list, idOf = (x) => x.id, languageOf = (x) => x.language) {
  const place = (x) => {
    const order = catalogOrder[languageOf(x)];
    const at = Array.isArray(order) ? order.indexOf(idOf(x)) : -1;
    return at >= 0 ? at : BUNDLED_IDS.has(idOf(x)) ? -1 : Infinity;
  };
  return [...list].sort((a, b) => {
    const [x, y] = [place(a), place(b)];
    return x === y ? idOf(a).localeCompare(idOf(b), "en", { numeric: true }) : x - y;
  });
}
/** The public packs here, in order: the defaults as the catalog has them, then what you follow, as they are. */
function orderLibrary() {
  const isDefault = (record) => record.source.kind === "default";
  library = [...inCatalogOrder(library.filter(isDefault), (r) => r.source.id, (r) => r.source.language), ...library.filter((record) => !isDefault(record))];
}

/** Lexicommons' own packs (the ones everyone has): the starter from the library once it's here, else the app's copy. */
function defaultPacks() {
  const fromLibrary = library.filter((record) => record.source.kind === "default").map(asPack);
  return inCatalogOrder([...bundled.map((pack) => fromLibrary.find((p) => p.id === pack.id) ?? pack), ...fromLibrary.filter((p) => !bundled.some((b) => b.id === p.id))]);
}

/** What the last load did with the public packs: { checked: in full, trusted: on their proof, at }, or null before one. */
export const lastPackLoad = () => (lastLoad ? { ...lastLoad } : null);

/** Loads (and checks) every pack on this device. Call once at start; it's called again when another tab changes one. */
/** How long a start waits for the worker's hashes before making them here instead (ms). */
const HASH_WAIT = 8000;

/**
 * The library's packs on this device hashed against their versions in a worker (pack-hash-worker.js) that reads the same records from the
 * same store: the start's main thread never makes a pack's text (a dozen word bands' took a phone's a third of a second at 4×, 6 Nov 2026).
 * By record id: { changedAt, version, hash }. Empty with no worker, or one that fails or is slow: then each is hashed here, as before.
 */
function hashedAway() {
  if (typeof Worker !== "function") return Promise.resolve(new Map());
  return new Promise((resolve) => {
    let worker = null;
    let timer = 0;
    const asked = performance.now();
    const done = (hashes, took = null) => {
      clearTimeout(timer);
      worker?.terminate();
      const map = new Map((Array.isArray(hashes) ? hashes : []).filter((h) => typeof h?.id === "string").map((h) => [h.id, h]));
      map.took = { ...took, answered: Math.round(performance.now() - asked) };
      resolve(map);
    };
    try {
      worker = new Worker(new URL("./pack-hash-worker.js", import.meta.url), { type: "module", name: "lexicommons-pack-hash" });
    } catch {
      return done([]);
    }
    timer = setTimeout(() => done([]), HASH_WAIT);
    worker.onmessage = ({ data }) => done(data?.hashes, data?.took);
    worker.onerror = () => done([]);
    worker.postMessage({ db: DB, version: 1, store: STORE, prefix: LIBRARY });
  });
}

/**
 * A library record's content hashed: the worker's hash when it hashed this very record (the same id, written at the same moment, saying
 * the same version), else made here.
 */
function hashOf(record, hashes, counts) {
  const away = hashes.get(record.id);
  if (away && away.changedAt === (record.changedAt ?? null) && away.version === (record.source?.version ?? null) && typeof away.hash === "string") {
    counts.hashedAway++;
    return away.hash;
  }
  counts.hashedHere++;
  return packVersion(record.pack).catch(() => null);
}

// A load under way works its lists out in place (the library emptied, then filled a pack at a time, each checked against those before it),
// so what's read from them meanwhile is part of them: the starter alone, at first. packsSettled() waits it out (Translate's index, made
// from allPacks(): one made from the starter alone mid-load answered nothing while a phrase was typed, until typing stopped).
let loading = 0;
let settledWaiters = [];
/** Resolves once no load of this device's packs is under way (at once when none is). */
export function packsSettled() {
  return loading ? new Promise((done) => settledWaiters.push(done)) : Promise.resolve();
}

/** Loads (and checks) every pack on this device (readAndCheck): at start, and again when another tab changes one. */
export async function loadPacks() {
  loading++;
  try {
    return await readAndCheck();
  } finally {
    if (--loading === 0) for (const done of settledWaiters.splice(0)) done();
  }
}

async function readAndCheck() {
  tell();
  // The library's packs hashed meanwhile, in a worker reading the same records (hashedAway).
  const hashing = hashedAway();
  let stored;
  try {
    stored = await readEach();
  } catch {
    stored = [...memory.values()];
  }
  tombs = new Map(stored.filter((r) => r.id.startsWith(GONE) && r.gone === true).map((r) => [`${r.account}:${r.pack}`, r]));
  relayGone = new Map(stored.filter((r) => r.id.startsWith(RELAY_GONE)).map((r) => [`${r.account}:${r.pack}`, r]));
  stored = stored.filter((r) => !r.id.startsWith(GONE) && !r.id.startsWith(RELAY_GONE));
  // A pack kept to restore goes once its 30 days are up.
  const expired = [...tombs.values()].filter((t) => t.restore && !(t.restoreUntil > Date.now()));
  if (expired.length) {
    const trimmed = expired.map(({ restore: _r, restoreUntil: _u, restoreAudio: _a, ...t }) => t);
    for (const t of trimmed) tombs.set(`${t.account}:${t.pack}`, t);
    writeAll({ puts: trimmed }).catch(() => {});
  }
  stored.sort((a, b) => a.addedAt - b.addedAt);
  const failed = [];
  const fail = (record, errors) => {
    failed.push({ id: record.id, errors });
    console.warn(`Lexicommons: the pack "${record.id}" on this device didn't pass the check, so it isn't used:`, errors);
  };
  // Public packs first (the defaults before what you follow), then yours, each checked against what came before it.
  const publicRecords = stored.filter((r) => r.id.startsWith(LIBRARY)).sort((a, b) => Number(b.source?.kind === "default") - Number(a.source?.kind === "default"));
  library = [];
  catalogOrder = readOrder(); // another tab's sync may have moved it
  const counts = { checked: 0, trusted: 0, hashedAway: 0, hashedHere: 0 };
  const waitFrom = performance.now();
  const hashes = publicRecords.length ? await hashing : new Map();
  // How long the start waited for the worker after its own read, and what the worker's parts took.
  counts.hashWait = Math.round(performance.now() - waitFrom);
  counts.hashTook = hashes.took ?? null;
  const proofs = []; // records checked in full now that can carry a proof from here on
  for (const record of publicRecords) {
    const id = record.id.slice(LIBRARY.length);
    if (record.pack?.id !== id || !["default", "follow"].includes(record.source?.kind)) {
      fail(record, [{ at: "id", message: "The pack isn't the one it's stored as." }]);
      continue;
    }
    // Its full check's proof still holds and its content still hashes to its version: used as it was checked.
    const version = record.source.version;
    const trusted = proofHolds(record.checked, record.pack, version) && (await hashOf(record, hashes, counts)) === version;
    const { pack, errors } = trusted ? { pack: upgradePack(record.pack), errors: [] } : checkPack(record.pack, { installed: defaultPacks().filter((p) => p.id !== id) });
    counts[trusted ? "trusted" : "checked"]++;
    if (!pack) {
      fail(record, errors);
      continue;
    }
    if (!trusted) proofs.push({ record, pack });
    // Its recordings are checked again with it; ones that no longer pass are left out (the pack is still used).
    const kept = { ...record, pack, ...publishedOf(record.pack) };
    // Compatible recordings kept from an earlier version still have that version's URL.
    const audioVersion = typeof record.audio?.url === "string" ? record.audio.url.split("/")[4] : null;
    const audio = record.audio && /^[0-9a-f]{12}$/.test(audioVersion) && isAudioUrl(record.audio.url, id, audioVersion) ? checkAudio(record.audio.manifest, pack, { forLibrary: true }).audio : null;
    if (audio) kept.audio = { url: record.audio.url, manifest: audio };
    else delete kept.audio;
    library.push(kept);
  }
  orderLibrary();
  records = [];
  for (const record of stored.filter((r) => !r.id.startsWith(LIBRARY))) {
    const taken = allPacks().some((p) => p.id === record.id);
    const { pack, errors } = taken
      ? { pack: null, errors: [{ at: "id", message: "A public pack has this id." }] }
      : record.pack?.id !== record.id
        ? { pack: null, errors: [{ at: "id", message: "The pack's id isn't the one it's stored under." }] }
        : checkPack(record.pack, { installed: allPacks() });
    if (pack) {
      // Its recordings are checked again with it; ones that no longer fit are left out (the pack is still used).
      const { audio: _audio, ...plain } = record;
      const audio = record.audio ? fitAudio(record.audio.manifest, pack) : null;
      records.push({ ...plain, pack, ...(audio ? { audio: { manifest: audio } } : {}) });
    } else fail(record, errors);
  }
  refused = failed;
  lastLoad = { ...counts, at: Date.now() };
  // A pack checked in full now, whose content hashes to its version, keeps the proof for the next start.
  if (proofs.length)
    Promise.all(
      proofs.map(async ({ record, pack }) => {
        if ((await packVersion(record.pack?.version === 1 ? record.pack : pack)) !== record.source.version) return;
        const kept = library.find((r) => r.id === record.id);
        if (kept) {
          kept.checked = checkedProof(pack, record.source.version);
          await put({ ...record, checked: kept.checked });
        }
      }),
    ).catch(() => {});
  off = readOff();
  views.clear();
  for (const record of library) viewOf(record);
  changed();
  if (!pruned) {
    pruned = true;
    pruneRecordings().catch(() => {});
  }
  return records.length + library.length;
}

// Recordings of yours nothing here names any more (no pack of any account on this device, no deletion you can still
// restore, no Undo) go, once a page start: they're personal, so none is kept for nothing (study/clips.js pruneClips;
// one kept within the hour stays, for a change still taking it in another tab).
let pruned = false;
export async function pruneRecordings({ now = Date.now() } = {}) {
  const restorable = [...tombs.values()].filter((t) => t.restore && t.restoreUntil > now);
  // Undo's recordings only for a pack still here or still restorable (Undo walks back one change at a time, so any of
  // its changes may come to be undone; a pack gone for good has none to undo).
  const live = new Set([...records.map((r) => r.id), ...restorable.map((t) => t.pack)]);
  const named = new Set([
    ...records.flatMap((r) => (r.audio ? clipsOf(r.audio.manifest) : [])),
    ...records.flatMap((r) => Object.values(r.sounds ?? {})),
    ...restorable.flatMap((t) => (t.restoreAudio ? clipsOf(t.restoreAudio) : [])),
    ...(await allHistory()).flatMap((e) => (e.beforeAudio && live.has(e.packId) ? clipsOf(e.beforeAudio) : [])),
  ]);
  return pruneClips(named, { now });
}

/**
 * What content.js draws on: Lexicommons' own packs, then the public packs you follow, then yours (oldest first). One of yours that came
 * through the relay (your AI made it or changed it: its record's through, which never goes back) says so, relayed: study/path.js puts a pack
 * your AI made for its words next on your path.
 */
export const allPacks = () => [
  ...defaultPacks(),
  ...library.filter((record) => record.source.kind === "follow").map(asPack),
  ...records.map((record) => ({ ...record.pack, origin: { kind: "yours", ...(record.through > 0 ? { relayed: true } : {}) } })),
];

/** Your packs with when and by whom: [{ id, pack, addedAt, changedAt, by, lastChange, through }]. */
export const yourPacks = () => records.map((record) => ({ ...record }));

/** One pack of yours as it's kept here, or null. */
export const yourPack = (id) => {
  const record = records.find((r) => r.id === id);
  return record ? { ...record } : null;
};

/** The public packs on this device: [{ id, version, kind, language, name, changedAt }]. */
export const libraryPacks = () => library.map((r) => ({ id: r.source.id, version: r.source.version, kind: r.source.kind, language: r.source.language, name: r.pack.name, changedAt: r.changedAt }));

/**
 * A public pack's recordings as voice.js plays them (pack-audio.js readAudio: each voice's items and words with their
 * clips' addresses, its license and credit), or null when it has none on this device.
 */
export function packAudio(id) {
  const record = library.find((r) => r.source.id === id);
  if (record?.audio) return readAudio(record.audio.manifest);
  const mine = records.find((r) => r.id === id);
  const kept = mine?.audio ? clipsHereOnly(mine.audio.manifest) : null;
  return kept ? readAudio(kept, { clipBase: YOUR_CLIPS }) : null;
}
/** A manifest of yours kept to the clips this device has (clips.js); the device's own voice reads the rest. */
function clipsHereOnly(manifest) {
  const voices = {};
  for (const [slug, voice] of Object.entries(manifest.voices ?? {})) {
    const items = Object.fromEntries(Object.entries(voice.items ?? {}).filter(([, e]) => hasClip(e.clip)));
    const words = Object.fromEntries(Object.entries(voice.words ?? {}).filter(([, e]) => hasClip(e.clip)));
    if (Object.keys(items).length || Object.keys(words).length) voices[slug] = { ...voice, items, words };
  }
  return Object.keys(voices).length ? { ...manifest, voices } : null;
}
/** Where a pack of yours's clips are served (to the account's own devices only). */
const YOUR_CLIPS = "/api/packs/audio";

/** Packs that don't pass the check (stored, or just fetched): [{ id, errors }]. */
export const packProblems = () => refused.map((entry) => ({ ...entry }));

/**
 * Adds a pack, or replaces yours with the same id, after checking it against everything else on the device. Returns
 * { ok: true, pack, warnings } or { ok: false, errors, warnings }; the id of a public pack (one of Lexicommons' own, or
 * one you follow) is refused. change, through and account: the change from your AI it comes from, and whose (pack-inbox.js;
 * an undo gives the change before the one it undoes); left out, they stay as they were (a new pack is the signed-in
 * account's). applied: the change from your AI this save is (an undo's own id); without one, it's an edit made here.
 * audio: its recordings (a checked manifest; null takes them away); left out, the ones it had stay where they still fit.
 */
export async function savePack(value, { by = "you", change, through, account, applied, audio, sounds } = {}) {
  const id = value?.id;
  if (allPacks().some((pack) => pack.id === id && pack.origin?.kind !== "yours")) {
    return { ok: false, errors: [{ at: "id", message: `"${id}" is a public pack's id; a pack of yours needs its own.` }], warnings: [] };
  }
  const installed = allPacks().filter((pack) => pack.id !== id);
  const { pack, errors, warnings } = checkPack(value, { installed });
  if (!pack) return { ok: false, errors, warnings };
  const now = Date.now();
  const before = records.find((record) => record.id === pack.id);
  const owner = account ?? before?.account ?? signedIn;
  // A pack made again after it was deleted follows that deletion (its changes, one edit more), so the deletion doesn't
  // win it back.
  const deleted = owner ? tombs.get(`${owner}:${pack.id}`) : undefined;
  const base = before ?? deleted;
  const baseThrough = Math.max(before?.through ?? 0, deleted?.through ?? 0);
  const newThrough = Math.max(through ?? 0, baseThrough);
  const record = {
    id: pack.id,
    pack,
    addedAt: before?.addedAt ?? now,
    changedAt: Math.max(now, (before?.changedAt ?? deleted?.at ?? 0) + 1),
    by: String(by).slice(0, 80),
    lastChange: change !== undefined ? change : (before?.lastChange ?? null),
    through: newThrough,
    account: owner,
    changes: lineageOf(base, applied),
    // Always ahead of what it replaces (preferPack): a change from your AI further along the relay starts again at 0.
    edits: applied && newThrough > baseThrough ? 0 : (base?.edits ?? 0) + 1,
  };
  // Its recordings: the ones given (a change of them; null takes them away), else the ones it had, where they still fit.
  const recordings = audio !== undefined ? audio : before?.audio ? fitAudio(before.audio.manifest, pack, { still: unchangedItems(before.pack, pack) }) : null;
  if (recordings) record.audio = { manifest: recordings };
  // A deck's own sounds, kept on this device only (study/deck.js): the ones given, else the ones it had.
  const keptSounds = sounds ?? before?.sounds;
  if (keptSounds) record.sounds = keptSounds;
  // A change from the relay after its deletion makes the pack again: it's no longer one the relay deleted.
  const relayed = owner ? relayGone.get(`${owner}:${pack.id}`) : undefined;
  const madeAgain = relayed && applied && newThrough > relayed.seq;
  await writeAll({ puts: [record], removes: [...(deleted ? [deleted.id] : []), ...(madeAgain ? [relayed.id] : [])] });
  if (deleted) tombs.delete(`${owner}:${pack.id}`);
  if (madeAgain) relayGone.delete(`${owner}:${pack.id}`);
  records = [...records.filter((r) => r.id !== record.id), record].sort((a, b) => a.addedAt - b.addedAt);
  refused = refused.filter((entry) => entry.id !== record.id);
  changedEverywhere();
  return { ok: true, pack, warnings };
}

/** A pack of yours' own sounds on this device: { card id: clip }, or null. They never leave the device. */
export const packSounds = (id) => records.find((record) => record.id === id)?.sounds ?? null;

/** Packs of yours a deletion from your storage took away, still restorable: [{ id, name, at, until }], newest first. */
export const deletedElsewhere = (now = Date.now()) =>
  [...tombs.values()]
    .filter((t) => t.account === signedIn && t.restore && !relayGone.has(`${t.account}:${t.pack}`) && t.restoreUntil > now)
    .sort((a, b) => b.at - a.at)
    .map((t) => ({ id: t.pack, name: t.restore.name ?? t.pack, at: t.at, until: t.restoreUntil }));

/**
 * A deletion from the relay of a pack that isn't here: kept, ahead of any deletion or copy of it this device has, and
 * remembered as the relay's, so neither brings it back nor is it offered to restore.
 */
async function relayDeleted(id, { through, applied, remove: alsoRemove = false }) {
  const before = tombs.get(`${signedIn}:${id}`);
  const tombThrough = Math.max(through ?? 0, before?.through ?? 0);
  const tomb = {
    id: tombId(signedIn, id),
    gone: true,
    account: signedIn,
    pack: id,
    at: Math.max(Date.now(), (before?.at ?? 0) + 1),
    changes: lineageOf(before, applied),
    edits: tombThrough > (before?.through ?? 0) ? 0 : (before?.edits ?? 0) + 1,
    through: tombThrough,
  };
  const relayed = { id: relayGoneId(signedIn, id), account: signedIn, pack: id, seq: tombThrough };
  // With the copy it replaces (one that didn't pass the check), in one transaction.
  await writeAll({ puts: [tomb, relayed], removes: alsoRemove ? [id] : [] });
  tombs.set(`${signedIn}:${id}`, tomb);
  relayGone.set(`${signedIn}:${id}`, relayed);
  changedEverywhere();
}

/**
 * Puts back a pack a deletion from your storage took (an edit made here, so it wins that deletion everywhere): only
 * while that deletion, as it's stored, still keeps it and the relay hasn't deleted the pack (another tab may have taken
 * that since), checked and written in one transaction.
 */
export async function restorePack(id) {
  const cant = { ok: false, errors: [{ at: "id", message: "That pack can't be restored any more." }], warnings: [] };
  const tomb = signedIn ? tombs.get(`${signedIn}:${id}`) : undefined;
  if (!tomb?.restore || relayGone.has(`${signedIn}:${id}`) || !(tomb.restoreUntil > Date.now())) return cant;
  if (allPacks().some((pack) => pack.id === id)) return cant;
  const { pack, errors, warnings } = checkPack(tomb.restore, { installed: allPacks() });
  if (!pack) return { ok: false, errors, warnings };
  const now = Date.now();
  const record = {
    id,
    pack,
    addedAt: now,
    changedAt: Math.max(now, tomb.at + 1),
    by: "you",
    lastChange: tomb.changes?.at(-1) ?? null,
    through: tomb.through ?? 0,
    account: signedIn,
    changes: lineageOf(tomb),
    edits: (tomb.edits ?? 0) + 1,
  };
  const recordings = tomb.restoreAudio ? fitAudio(tomb.restoreAudio, pack) : null;
  if (recordings) record.audio = { manifest: recordings };
  let done = false;
  try {
    done = await run("readwrite", (store) => {
      const out = { result: false };
      const stored = store.get(tombId(signedIn, id));
      const relayed = store.get(relayGoneId(signedIn, id));
      relayed.onsuccess = () => {
        const t = stored.result;
        // The very deletion the record was built from, all of it (another tab may have put a newer one since: then
        // nothing, and a reload).
        if (!t?.restore || relayed.result || !(t.restoreUntil > Date.now()) || canonical(t) !== canonical(tomb)) return;
        store.delete(t.id);
        store.put(record);
        out.result = true;
      };
      return out;
    });
  } catch {
    // No IndexedDB (a private window): this visit's memory is all there is.
    memory.delete(tomb.id);
    memory.set(id, record);
    done = true;
  }
  if (!done) {
    await loadPacks();
    return cant;
  }
  tombs.delete(`${signedIn}:${id}`);
  records = [...records.filter((r) => r.id !== id), record].sort((a, b) => a.addedAt - b.addedAt);
  changedEverywhere();
  return { ok: true, pack, warnings };
}

/** Which account is signed in (pack-inbox.js sets it at start): new packs of yours are its. */
export function setPacksAccount(id) {
  signedIn = id ?? null;
}

/** Gives a pack of yours made before packs had an account (or saved before sign-in was known) to an account. */
export async function claimPack(id, account) {
  const record = records.find((r) => r.id === id);
  if (!record || record.account) return;
  const claimed = { ...record, account };
  await put(claimed);
  records = records.map((r) => (r.id === id ? claimed : r));
}

/**
 * Removes one of your packs from this device (one that no longer passes the check too). through and applied: the change
 * from your AI that deleted it (its place in the relay, and its id); without them, it's an edit made here. The
 * signed-in account's pack leaves a deletion that syncs, written with the delete.
 */
export async function deletePack(id, { through, applied } = {}) {
  if (id.startsWith(LIBRARY)) return;
  const record = records.find((r) => r.id === id);
  if (!record) {
    // Not here, or here only as a copy that doesn't pass the check: that goes, and a deletion from the relay is still
    // kept, so no copy or restore brings it back.
    const here = refused.some((entry) => entry.id === id);
    if (applied && signedIn) await relayDeleted(id, { through, applied, remove: here });
    else if (here) await remove(id);
    if (here) {
      refused = refused.filter((entry) => entry.id !== id);
      if (off.delete(id)) keepOff();
    }
    changedEverywhere();
    return;
  }
  const tombThrough = Math.max(through ?? 0, record?.through ?? 0);
  const tomb =
    record?.account && record.account === signedIn
      ? {
          id: tombId(record.account, id),
          gone: true,
          account: record.account,
          pack: id,
          at: Math.max(Date.now(), record.changedAt + 1),
          changes: lineageOf(record, applied),
          // Always ahead of the pack it deletes (a restored one too), as savePack's records are.
          edits: applied && tombThrough > (record.through ?? 0) ? 0 : (record.edits ?? 0) + 1,
          through: tombThrough,
        }
      : null;
  const relayed = tomb && applied ? { id: relayGoneId(tomb.account, id), account: tomb.account, pack: id, seq: tombThrough } : null;
  await writeAll({ puts: [...(tomb ? [tomb] : []), ...(relayed ? [relayed] : [])], removes: [id] });
  if (tomb) tombs.set(`${tomb.account}:${id}`, tomb);
  if (relayed) relayGone.set(`${tomb.account}:${id}`, relayed);
  records = records.filter((record) => record.id !== id);
  refused = refused.filter((entry) => entry.id !== id);
  if (off.delete(id)) keepOff();
  changedEverywhere();
}

/** Deletes every pack on this device (yours, and the copies of public ones), which packs are off, and what changed them. */
export async function clearPacks() {
  await run("readwrite", (store) => store.clear()).catch(() => {});
  await runHistory("readwrite", (store) => store.clear()).catch(() => {});
  // Your recordings with them: every one of yours on this device.
  await pruneClips(new Set(), { all: true });
  memory.clear();
  historyMemory.clear();
  tombs = new Map();
  relayGone = new Map();
  records = [];
  library = [];
  refused = [];
  off = new Set();
  keepOff();
  changedEverywhere();
}

// ---------- public packs from the open library ----------

/**
 * Makes sure this device has a public pack at the version a ref names: fetched, checked, its content hashed against
 * its version, and kept. Returns the problems ([] when it's here). A copy that's already at that version only takes
 * the new kind (a pack you follow that became one of Lexicommons' own).
 */
async function ensure(ref, kind) {
  const key = LIBRARY + ref.id;
  const have = library.find((record) => record.id === key);
  const corrections = kind === "follow" && ref.corrections === "community" ? "community" : undefined;
  const own = kind === "follow" && ref.own === true;
  if (have?.source.version === ref.version) {
    if ((have.source.kind !== kind && kind === "default") || (kind === "follow" && (have.source.corrections !== corrections || Boolean(have.source.own) !== own))) {
      const record = { ...have, source: { ...have.source, kind, ...(kind === "follow" ? { corrections, own } : {}) } };
      if (!record.source.corrections) delete record.source.corrections;
      if (!record.source.own) delete record.source.own;
      await putLibrary(record);
      library = library.map((r) => (r.id === key ? record : r));
      viewOf(record);
    }
    refused = refused.filter((entry) => entry.id !== key);
    return syncAudio(key, ref);
  }
  let raw;
  try {
    const response = await fetchRetrying(ref.url, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`${response.status}`);
    raw = await response.json();
  } catch (error) {
    return [{ at: "pack", message: `"${ref.id}" couldn't be fetched (${error.message}); the copy here stays as it was.` }];
  }
  // Checked and hashed a few ms at a time (a big pack's check held a phone's page for a third of a second at 4×, 7 Nov 2026): the same check,
  // and the same bytes hashed (pack-format.js packBytesSteps).
  const { pack, errors } = await inSlices(checkPackSteps(raw, { installed: defaultPacks().filter((p) => p.id !== ref.id) }));
  // The bytes hashed are the text of what's kept (a version 1 pack keeps its raw: asKept), so the write takes them as they are (putLibrary).
  const bytes = pack && pack.id === ref.id ? await inSlices(packBytesSteps(raw?.version === 1 ? raw : pack)) : null;
  const problems = !pack ? errors : pack.id !== ref.id ? [{ at: "id", message: `It says it's "${pack.id}", not "${ref.id}".` }] : (await versionOfBytes(bytes)) !== ref.version ? [{ at: "version", message: `Its content doesn't match its version (${ref.version}).` }] : [];
  if (problems.length) {
    refuse(key, problems);
    return problems;
  }
  const now = Date.now();
  // The recordings of every sentence this version still says word for word come with it (a recording reads its sentence's
  // words), until its own are published: a version goes out before its recordings, and meanwhile every line would fall to
  // the device's voice, which may not be heard at all (an iPhone on silent).
  const kept = have?.audio ? fitAudio(have.audio.manifest, pack, { still: unchangedItems(have.pack, pack), forLibrary: true }) : null;
  const record = { id: key, pack, ...publishedOf(raw), checked: checkedProof(pack, ref.version), source: { kind, id: ref.id, version: ref.version, language: pack.language, ...(corrections ? { corrections } : {}), ...(own ? { own: true } : {}) }, ...(kept ? { audio: { url: have.audio.url, manifest: kept } } : {}), addedAt: have?.addedAt ?? now, changedAt: now };
  await putLibrary(record, bytes);
  // A new version takes the old one's place.
  library = have ? library.map((r) => (r.id === key ? record : r)) : [...library, record];
  viewOf(record);
  refused = refused.filter((entry) => entry.id !== key);
  return syncAudio(key, ref);
}

/**
 * A public pack's recordings, as its ref names them (`audio`, beside its version): fetched, checked against the copy
 * here (checkAudio, forLibrary: every voice's license and credit), and kept on its record, even when the pack's version
 * stays the same (recordings can come after the pack). Recordings brought from an earlier version (ensure: only the
 * sentences it still says word for word) stay until this version's own come, and when those can't be fetched or don't
 * pass the check; the version's own recordings, taken off its ref, go. Only what no longer fits is ever dropped. Problems
 * are said in what sync returns. Returns the problems.
 */
async function syncAudio(key, ref) {
  const record = library.find((r) => r.id === key);
  if (!record) return [];
  const url = typeof ref.audio === "string" && isAudioUrl(ref.audio, ref.id, ref.version) ? ref.audio : null;
  if ((record.audio?.url ?? null) === url) return [];
  // Brought from an earlier version: its url is that version's.
  const brought = Boolean(record.audio) && !isAudioUrl(record.audio.url, ref.id, ref.version);
  if (!url && brought) return [];
  let audio = null;
  const problems = [];
  if (url) {
    const keeping = record.audio ? "the ones it had stay for now" : "it's used without them for now";
    let raw;
    try {
      const response = await fetchRetrying(url, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`${response.status}`);
      raw = await response.json();
    } catch (error) {
      problems.push({ at: "audio", message: `"${ref.id}"'s recordings couldn't be fetched (${error.message}); ${keeping}.` });
      return problems;
    }
    const checked = checkAudio(raw, record.pack, { forLibrary: true });
    if (checked.audio) audio = { url, manifest: checked.audio };
    else {
      problems.push(...checked.errors.slice(0, 5).map((e) => ({ at: `audio.${e.at}`, message: `"${ref.id}"'s recordings don't pass the check, so ${keeping}: ${e.message}` })));
      if (record.audio) return problems;
    }
  }
  // Written onto the record as it is now, and only while it's still this version.
  if (await putAudio(key, ref.version, audio)) {
    library = library.map((r) => {
      if (r.id !== key || r.source.version !== ref.version) return r;
      const next = { ...r };
      if (audio) next.audio = audio;
      else delete next.audio;
      return next;
    });
  }
  return problems;
}

/**
 * A followed pack's open fixes from Explore, when you follow it with community corrections: fetched, kept beside the
 * copy (for an offline start), and its view worked out again. Offline or refused, the ones kept stay.
 */
async function refreshFixes(id) {
  const key = LIBRARY + id;
  const have = library.find((r) => r.id === key);
  if (!have || have.source.kind !== "follow" || have.source.corrections !== "community") return;
  let answer;
  try {
    answer = await json(`/api/community/items/${encodeURIComponent(id)}/fixes`);
  } catch {
    return;
  }
  if (answer?.version !== have.source.version || !Array.isArray(answer.fixes)) return;
  const fixes = { version: answer.version, fixes: answer.fixes };
  if (JSON.stringify(fixes) === JSON.stringify(have.fixes)) return;
  const record = { ...have, fixes };
  await put(record);
  library = library.map((r) => (r.id === key ? record : r));
  viewOf(record);
}

async function json(url) {
  const response = await fetchRetrying(url, { credentials: "same-origin", cache: "no-cache" });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

// Another tab installed a newer grammar: what's here is checked again against it.
onGrammarChange(() => loadPacks());

// Syncs again when the app comes back into view (at most every SYNC_EVERY) and when the learning language changes.
function watchForSync() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastSync > SYNC_EVERY) syncLibraryPacks();
    // Between syncs, the recordings of the versions here: a version published before its recordings reaches a device
    // without them, and an app left open (a phone's, for days) would wait for the next sync to hear them.
    else if (!syncing && Date.now() - lastRecordings > RECORDINGS_EVERY) syncRecordings();
  });
  onLearningChange(() => syncLibraryPacks());
  // Back online: the recordings not kept yet (a start offline, or the network gone mid-way), within 30 s and 3 s after (lx/retry.js).
  onReconnect(() => setTimeout(keepRecordingsForOffline, 3000));
}

let recordingsLook = null;
/**
 * The recordings of Lexicommons' own packs here, as the catalog has them now, for the versions this device holds: one
 * read of the catalog, nothing else fetched unless a pack's recordings changed (syncAudio). A new version of a pack
 * waits for the next sync. Resolves to the problems.
 */
export function syncRecordings() {
  lastRecordings = Date.now();
  return (recordingsLook ??= (async () => {
    let catalogue;
    try {
      catalogue = await json(CATALOGUE);
    } catch {
      return [];
    }
    const before = JSON.stringify(library.map((r) => [r.id, r.audio?.url]));
    const problems = [];
    for (const ref of packRefs(catalogue, learning())) {
      const record = library.find((r) => r.id === LIBRARY + ref.id);
      if (record?.source.version === ref.version) problems.push(...(await syncAudio(record.id, ref)));
    }
    if (JSON.stringify(library.map((r) => [r.id, r.audio?.url])) !== before) {
      changedEverywhere();
      setTimeout(keepRecordingsForOffline, 3000);
    }
    return problems;
  })().finally(() => (recordingsLook = null)));
}

/**
 * Where the packs you follow are listed: the community section registers a function that resolves to [{ id, version }]
 * (the account's follows). Until one is registered, or while it can't be read, the packs you follow stay as they are.
 */
export function setFollowsSource(fn) {
  followsSource = fn;
}

/** Sets how a sync follows one of Lexicommons' packs for the account (a default the catalog made opt-in: syncNow). */
export function setFollowAdder(fn) {
  followAdder = fn;
}

let syncedFor = null; // the language the last sync started on
/**
 * Brings this device's public packs in line with the library: Lexicommons' own for the language you're learning
 * (the catalog's packs.<language>) and the ones you follow (setFollowsSource; while that can't be read, they stay as
 * they are). New versions are fetched and checked; a copy that's no longer listed is removed (your evidence
 * from it stays). Offline, nothing changes. Resolves to { ok, defaults, follows, problems }.
 */
export function syncLibraryPacks() {
  return (syncing ??= sync().finally(() => {
    syncing = null;
    lastSync = Date.now();
    // The language changed while it ran: the one you're learning now hasn't been looked at.
    if (syncedFor !== null && syncedFor !== learning()) syncLibraryPacks();
  }));
}

// A sync, whose downloads always end (packDownloads), whatever happens in it.
async function sync() {
  const language = learning();
  try {
    return await syncNow();
  } finally {
    if (downloads) setDownloads(null);
    // A sync over without its language's lessons gives them up for now: what's here is studied (lessonsComing).
    if (lessonsSaid.get(language) === true) sayLessons(language, false);
  }
}

async function syncNow() {
  watchForSync();
  const language = learning();
  syncedFor = language;
  // Its lessons' wait starts here, with the first sync for this language (lessonsComing); a later one on this start keeps that clock.
  if (mayBeComing(language)) startWait(language);
  let catalogue;
  try {
    catalogue = await json(CATALOGUE);
  } catch {
    sayLessons(language, false);
    return { ok: false, defaults: null, follows: null, problems: [] };
  }
  // Lexicommons' own packs: the defaults every device has, and the opt-in ones a device has only once you add them.
  const own = packRefs(catalogue, language);
  const defaults = own.filter((ref) => !ref.optIn);
  const optIn = new Set(own.filter((ref) => ref.optIn).map((ref) => ref.id));
  for (const id of optIn) optInSeen.add(id);
  // The packs that carry this language's lessons, remembered for the next start; on their way while none with lessons is here and one of
  // them isn't here at any version (a new version of one that's here changes nothing for a first lesson).
  const lessonRefs = lessonRefsOf(own, language);
  const lessonIds = new Set(lessonRefs.map((ref) => ref.id));
  rememberScriptPacks(language, defaults.filter((ref) => ref.teaches === "script").map((ref) => ref.id));
  // (What it was until now is worked out from what was remembered before; then the catalog's answer is remembered and the turn told.)
  const was = lessonsComing(language);
  rememberLessonPacks(language, [...lessonIds]);
  sayLessons(language, !lessonsHere(language) && lessonRefs.some((ref) => !library.some((record) => record.id === LIBRARY + ref.id)), { was });
  // What isn't here at its version yet is downloading, said at once (packDownloads): Translate looks it up online
  // meanwhile, and a first open has only the starter until it's all here.
  const missing = (ref) => library.find((record) => record.id === LIBRARY + ref.id)?.source.version !== ref.version;
  const fetching = new Set(defaults.filter(missing).map((ref) => ref.id));
  if (fetching.size) setDownloads({ language, done: 0, total: fetching.size });
  // The grammar of every language with a pack here, the one you're learning first: packs are checked against it.
  const problems = [];
  let grammarChanged = false;
  for (const lang of new Set([language, ...[...records, ...library].map((r) => r.pack?.language).filter(Boolean)])) {
    const result = await syncGrammar(catalogue, lang);
    grammarChanged ||= result.changed;
    problems.push(...result.problems);
  }
  // Everything here checked again against it, before anything new arrives (a pack refused for a pattern it adds).
  if (grammarChanged) await loadPacks();
  let follows = null;
  try {
    const list = followsSource ? await followsSource() : null;
    if (Array.isArray(list)) follows = list.map((r) => ({ id: r?.id, version: r?.version, url: packUrl(r?.id, r?.version), ...(typeof r?.audio === "string" ? { audio: r.audio } : {}), corrections: r?.corrections === "community" ? "community" : "published" })).filter(isPackRef);
  } catch {}
  // A default of this language that the catalog now lists as opt-in (Dutch's word bands, once its category packs are out:
  // 5 Nov 2026), here already and not yet followed: kept, and what was learned on it with it (its sentences keep their
  // ids). It goes on as a default here, and it's followed for the account, as Explore's Add does, so the account's other
  // devices and a new one bring it too; once the follows list it, it's one of the followed packs like any other.
  const kept = own.filter((ref) => ref.optIn && !follows?.some((f) => f.id === ref.id) && library.some((r) => r.source.kind === "default" && r.source.id === ref.id && r.source.language === language));
  for (const ref of follows ?? []) if (!defaults.some((d) => d.id === ref.id) && missing(ref)) fetching.add(ref.id);
  if (fetching.size) setDownloads({ language, done: downloads?.done ?? 0, total: fetching.size });
  const fetched = (ref) => fetching.has(ref.id) && downloads && setDownloads({ ...downloads, done: downloads.done + 1 });
  const before = JSON.stringify(library.map((r) => [r.id, r.source, r.fixes, r.audio?.url]));
  keepOrder(language, own.filter((ref) => !ref.optIn || kept.includes(ref)).map((ref) => ref.id));
  // The packs that carry the lessons first, then the rest (every view keeps the catalog's order: keepOrder above, orderLibrary): a newcomer's
  // first lesson is the path's, not the starter's (path-nl came last, 2–4 s after Dutch was picked, and a Start meanwhile opened the
  // starter's lesson, 7 Nov 2026). Once they're checked, studying has them at once, before the word bands come.
  // The try-out (/try/) fetches the packs that carry the lessons and nothing more: two lessons are what it plays.
  const queue = demoPage() ? defaults.filter((ref) => lessonIds.has(ref.id)) : [...defaults, ...kept];
  const ordered = [...queue.filter((ref) => lessonIds.has(ref.id)), ...queue.filter((ref) => !lessonIds.has(ref.id))];
  let lessonsLeft = ordered.filter((ref) => lessonIds.has(ref.id)).length;
  for (const ref of ordered) {
    problems.push(...(await ensure(ref, "default")));
    fetched(ref);
    if (lessonIds.has(ref.id) && --lessonsLeft === 0 && lessonsSaid.get(language) === true) {
      if (lessonsHere(language)) {
        // In their catalog place among what's here and worked out (content.js prepare); then, in one go, no longer coming, taken by studying
        // (onContentChange) and told (onLessonsComing): whoever hears either finds the lessons there and lessonsComing false.
        orderLibrary();
        await prepareContent?.().catch(() => {});
        const turned = sayLessons(language, false, { quietly: true });
        changedEverywhere();
        if (turned) tellComing();
      } else sayLessons(language, false);
    }
  }
  if (followAdder && follows !== null) for (const ref of kept) await followAdder(ref.id).catch(() => {});
  for (const ref of follows ?? []) {
    if (defaults.some((d) => d.id === ref.id)) continue;
    problems.push(...(await ensure(optIn.has(ref.id) ? { ...ref, own: true } : ref, "follow")));
    fetched(ref);
  }
  for (const ref of follows ?? []) if (ref.corrections === "community") await refreshFixes(ref.id);
  // What's no longer listed: a default of this language the catalog dropped; a follow you no longer follow.
  const listed = (record) =>
    record.source.kind === "default"
      ? record.source.language !== language || defaults.some((d) => d.id === record.source.id) || kept.some((k) => k.id === record.source.id)
      : follows === null || follows.some((f) => f.id === record.source.id);
  for (const record of library.filter((r) => !listed(r))) {
    await remove(record.id);
    views.delete(record.id);
  }
  library = library.filter(listed);
  // In order at last, also on a device whose packs came in the wrong order before it kept this: the view and its plan follow.
  orderLibrary();
  if (JSON.stringify(library.map((r) => [r.id, r.source, r.fixes, r.audio?.url])) !== before) {
    // The view studying draws on, worked out a piece at a time first (content.js prepare): told at once, a new version's held a phone's
    // page for half a second at 4× (7 Nov 2026).
    await prepareContent?.().catch(() => {});
    changedEverywhere();
  }
  // Their recordings kept for offline, a little after (never in a start's way). Not for a try-out: nothing of it is kept.
  if (!demoPage()) setTimeout(() => {
    keepRecordingsForOffline();
    // (Word pictures reach the lessons through this: imported when it's time, so nothing here waits on them.)
    import("./pictures.js").then(({ keepPicturesForOffline }) => keepPicturesForOffline(learning())).catch(() => {});
  }, 3000);
  // Each pack's notes (notes.js), for the packs here in the language you're learning. Never in the way of anything above.
  problems.push(...(await syncNotes(catalogue, allPacks().filter((pack) => pack.language === language && pack.origin?.kind !== "yours").map((pack) => pack.id))));
  problems.push(...(await syncForms(catalogue, language)));
  return { ok: true, defaults: defaults.length, follows: follows?.length ?? null, problems };
}

// ---------- the recordings of the packs you study, kept for offline ----------

let keeping = null;
/**
 * Keeps on this device every clip of the packs that are on in the language you're learning (every voice: they take
 * turns), where voice.js plays a library clip from offline: after each sync and when a pack is turned on, in the
 * background (keep-clips.js: 50 MB a language, none while the device asks to save data). Resolves to what it did.
 */
export function keepRecordingsForOffline() {
  return (keeping ??= keepNow().finally(() => (keeping = null)));
}
async function keepNow() {
  if (typeof caches === "undefined") return { kept: 0, already: 0, bytes: 0, stoppedBy: "no cache" };
  const language = learning();
  const urls = [];
  const owner = new Map(); // a clip → the pack it's counted for (the first that has it)
  for (const record of library) {
    if (!record.audio || record.source.language !== language || !isPackOn(record.source.id)) continue;
    const voices = Object.values(record.audio.manifest.voices ?? {});
    const add = (entry) => {
      const url = clipUrl(entry.clip);
      urls.push(url);
      if (!owner.has(url)) owner.set(url, record.source.id);
    };
    // Every voice's sentences first, then their words.
    for (const voice of voices) for (const entry of Object.values(voice.items ?? {})) add(entry);
    for (const voice of voices) for (const entry of Object.values(voice.words ?? {})) add(entry);
  }
  if (!urls.length) return { kept: 0, already: 0, bytes: 0, stoppedBy: null };
  // Each pack's count, and which packs have clips coming now (one whose clips were all kept already never shows).
  const counts = new Map();
  for (const id of owner.values()) counts.set(id, { have: 0, total: (counts.get(id)?.total ?? 0) + 1 });
  const coming = new Set();
  const onProgress = (url, what) => {
    const id = owner.get(url);
    const count = counts.get(id);
    if (!count) return;
    if (what === "fetching") {
      if (!coming.has(id)) coming.add(id);
    } else count.have++;
    if (coming.has(id)) tellKeeping(id, { have: count.have, total: count.total, done: false });
  };
  const result = await keepClips(urls, { cache: await caches.open(CLIPS), saveData: Boolean(globalThis.navigator?.connection?.saveData), stop: () => learning() !== language, onProgress });
  for (const id of coming) {
    const count = counts.get(id);
    tellKeeping(id, result.stoppedBy ? { have: count.have, total: count.total, stopped: result.stoppedBy } : { have: count.total, total: count.total, done: true });
  }
  return result;
}

// What keeping is doing now, for the pack pages: a pack whose clips are coming now → { have, total } (clips), then one
// last word when it ends ({ done: true }, or { stopped: why }), after which it isn't listed.
const keeping_ = new Map();
const keepingListeners = new Set();
function tellKeeping(id, now) {
  if (now.done || now.stopped) keeping_.delete(id);
  else keeping_.set(id, now);
  for (const listener of keepingListeners) listener(id, now);
}
/** A pack's recordings being kept for offline right now: { have, total } (clips), or null. */
export const keepingNow = (id) => keeping_.get(id) ?? null;
/** Calls listener(id, { have, total, done?, stopped? }) as packs' recordings are kept; returns its stop. */
export function onKeeping(listener) {
  keepingListeners.add(listener);
  return () => keepingListeners.delete(listener);
}

/**
 * Brings a public pack you've just followed onto this device at once (the community's follow list has it from now on,
 * so later syncs keep it). ref: { id, version, url }. Resolves to { ok, errors }.
 */
export async function followPack(ref) {
  if (!isPackRef(ref)) return { ok: false, errors: [{ at: "ref", message: "A pack to follow is { id, version, url }, its url where that version lives." }] };
  if (allPacks().some((pack) => pack.id === ref.id && pack.origin?.kind === "yours")) return { ok: false, errors: [{ at: "id", message: `A pack of yours already has the id "${ref.id}".` }] };
  const kind = library.some((r) => r.id === LIBRARY + ref.id && r.source.kind === "default") ? "default" : "follow";
  // One of Lexicommons' opt-in packs (the catalog's, as last read), added in Explore: kept as Lexicommons' own.
  const errors = await ensure(kind === "follow" && optInSeen.has(ref.id) ? { ...ref, own: true } : ref, kind);
  if (!errors.length && ref.corrections === "community") await refreshFixes(ref.id);
  if (!errors.length) changedEverywhere();
  return { ok: !errors.length, errors };
}

/** Removes a public pack you've stopped following from this device (your evidence from it stays). */
export async function unfollowPack(id) {
  const record = library.find((r) => r.id === LIBRARY + id && r.source.kind === "follow");
  if (!record) return;
  await remove(record.id);
  library = library.filter((r) => r !== record);
  views.delete(record.id);
  changedEverywhere();
}

// ---------- what each change from your AI did here (for Undo) ----------

const HISTORY_DB = "lexicommons-pack-changes";
const HISTORY_STORE = "changes";
const HISTORY_KEEP = 30; // per pack
const historyMemory = new Map();
const historyListeners = new Set();
let openingHistory = null;

function historyDb() {
  return (openingHistory ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(HISTORY_STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      openingHistory = null;
      reject(request.error);
    };
  }));
}

function runHistory(mode, action) {
  return historyDb().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(HISTORY_STORE, mode);
        const request = action(tx.objectStore(HISTORY_STORE));
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      }),
  );
}

async function allHistory() {
  try {
    return (await runHistory("readonly", (store) => store.getAll())) ?? [];
  } catch {
    return [...historyMemory.values()];
  }
}

/**
 * Keeps what a change did here: { id (the change's), packId, kind, said, source, seq, at, state, before (the pack as it
 * was, null when the change made it), previous (the pack's lastChange before it) }. state: applied · refused ·
 * missing · undone. The oldest past 30 for a pack go.
 */
export async function keepChange(entry) {
  try {
    await runHistory("readwrite", (store) => store.put(entry));
  } catch {
    historyMemory.set(entry.id, entry);
  }
  const ofPack = (await allHistory()).filter((e) => e.packId === entry.packId).sort((a, b) => b.at - a.at);
  for (const old of ofPack.slice(HISTORY_KEEP)) {
    await runHistory("readwrite", (store) => store.delete(old.id)).catch(() => {});
    historyMemory.delete(old.id);
  }
  for (const listener of historyListeners) listener(entry);
}

/** Calls fn(entry) whenever what a change did here is kept or updated (it's undone, say). Returns a function that stops it. */
export function onKeptChange(fn) {
  historyListeners.add(fn);
  return () => historyListeners.delete(fn);
}

/** What a change did here, or null. */
export async function keptChange(id) {
  try {
    return (await runHistory("readonly", (store) => store.get(id))) ?? historyMemory.get(id) ?? null;
  } catch {
    return historyMemory.get(id) ?? null;
  }
}

/** The changes a pack took here, newest first. */
export async function changesOf(packId) {
  return (await allHistory()).filter((e) => e.packId === packId).sort((a, b) => b.at - a.at);
}

// ---------- on and off ----------

/** Whether studying draws on a pack (every pack is, until it's turned off). */
export const isPackOn = (id) => !off.has(id);

/** The packs (any kind, any language) turned off. */
export const packsOff = () => [...off];

/** Turns a pack on or off for studying. */
export function setPackOn(id, on) {
  if (Boolean(on) === isPackOn(id)) return;
  if (on) off.delete(id);
  else off.add(id);
  keepOff();
  changedEverywhere();
  if (on) setTimeout(keepRecordingsForOffline, 0);
}

/** Calls fn() whenever the packs change (one arrives, changes or goes, or is turned on or off). Returns a function that stops it. */
export function onPacksChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- syncing your packs (sync.js) ----------

let applying = false; // a sync's changes being applied

/**
 * The relay's furthest change (pack-inbox.js, from the account): a copy from your storage is taken only up to it. One
 * that waited on it is tried again (a sync, soon).
 */
export function setRelayLatest(seq) {
  if (!Number.isInteger(seq) || seq <= relayLatest) return;
  relayLatest = seq;
  if (waitingOnRelay) {
    waitingOnRelay = false;
    changed();
  }
}

/** How packs.js asks the account how far its relay has got, when a copy from your storage waits on it (pack-inbox.js). */
export function setRelayAsk(fn) {
  askRelay = fn;
}

const CHANGE_ID = /^chg_[A-Za-z0-9_-]{1,40}$/;
const lineageOk = (changes) => Array.isArray(changes) && changes.length <= LINEAGE && changes.every((c) => typeof c === "string" && CHANGE_ID.test(c)) && new Set(changes).size === changes.length;
const editsOk = (edits) => Number.isInteger(edits) && edits >= 0 && edits <= 1_000_000;
const throughOk = (through) => Number.isInteger(through) && through >= 0;
const timeOk = (t) => Number.isFinite(t) && t > 0 && t < 8.64e15;

/** A pack record from another device, in the shape kept here, or null. */
function syncedRecord(value, id) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.id !== id || value.pack?.id !== id || !signedIn || value.account !== signedIn) return null;
  if (!timeOk(value.addedAt) || !timeOk(value.changedAt) || !throughOk(value.through) || !lineageOk(value.changes) || !editsOk(value.edits)) return null;
  if (typeof value.by !== "string" || value.by.length > 80 || !(value.lastChange === null || (typeof value.lastChange === "string" && CHANGE_ID.test(value.lastChange)))) return null;
  if (value.audio !== undefined && !(value.audio && typeof value.audio === "object" && !Array.isArray(value.audio) && Object.keys(value.audio).length === 1 && value.audio.manifest)) return null;
  const { addedAt, changedAt, by, lastChange, through, account, changes, edits } = value;
  return { id, pack: value.pack, addedAt, changedAt, by, lastChange, through, account, changes, edits, ...(value.audio ? { audio: value.audio } : {}) };
}

/**
 * Which of two records of one pack wins: the one further along the relay (through), then the one with more edits made
 * outside it since, then winner (the newer, a deletion, the larger JSON). One order over every record, so merging in
 * any order ends the same.
 */
export function preferPack(a, b) {
  const position = (r) => (r.gone ? r.about : r.value) ?? {};
  const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
  const [ta, tb] = [count(position(a).through), count(position(b).through)];
  if (ta !== tb) return ta > tb ? a : b;
  const [ea, eb] = [count(position(a).edits), count(position(b).edits)];
  if (ea !== eb) return ea > eb ? a : b;
  return winner(a, b);
}

async function applySynced(newer) {
  const turnedDown = [];
  const puts = [];
  const removes = [];
  const taken = [];
  for (const [id, record] of Object.entries(newer)) {
    const here = records.find((r) => r.id === id);
    // Only up to the relay's furthest change, as the account last said (a copy past it waits; it's tried again).
    const through = record.gone ? record.about?.through : record.value?.through;
    if (!signedIn || !isPackId(id) || (here && here.account !== signedIn) || !(through <= relayLatest)) {
      if (Number.isInteger(through) && through > relayLatest) waitingOnRelay = true;
      turnedDown.push(id);
      continue;
    }
    if (record.gone) {
      const { changes, edits, through } = record.about;
      // The pack it takes away is kept to restore (or the one kept already, by an earlier deletion of it), unless
      // the relay deleted it here: that stays the relay's.
      const earlier = tombs.get(`${signedIn}:${id}`);
      const restore = relayGone.has(`${signedIn}:${id}`) ? undefined : (here?.pack ?? earlier?.restore);
      const restoreAudio = restore ? (here ? here.audio?.manifest : earlier?.restoreAudio) : undefined;
      const keptUntil = here ? Date.now() + RESTORE_DAYS * DAY : earlier?.restoreUntil;
      const tomb = { id: tombId(signedIn, id), gone: true, account: signedIn, pack: id, at: record.at, changes, edits, through, ...(restore ? { restore, restoreUntil: keptUntil, ...(restoreAudio ? { restoreAudio } : {}) } : {}) };
      puts.push(tomb);
      if (here || refused.some((entry) => entry.id === id)) removes.push(id);
      taken.push({ id, tomb });
      continue;
    }
    const value = syncedRecord(record.value, id);
    const publicId = allPacks().some((pack) => pack.id === id && pack.origin?.kind !== "yours");
    const { pack, errors } = value && !publicId ? checkPack(value.pack, { installed: allPacks().filter((p) => p.id !== id) }) : { pack: null, errors: [] };
    if (!pack) {
      if (errors.length) console.warn(`Lexicommons: the pack "${id}" from your storage didn't pass the check, so it isn't used:`, errors);
      turnedDown.push(id);
      continue;
    }
    // Its recordings must pass against it as they are (nothing dropped), or the copy isn't taken.
    const recordings = value.audio ? checkAudio(value.audio.manifest, pack).audio : null;
    if (value.audio && !recordings) {
      turnedDown.push(id);
      continue;
    }
    const { audio: _audio, ...plain } = value;
    const kept = { ...plain, pack, ...(recordings ? { audio: { manifest: recordings } } : {}), ...(here?.sounds ? { sounds: here.sounds } : {}) };
    puts.push(kept);
    const tomb = tombs.get(`${signedIn}:${id}`);
    if (tomb) removes.push(tomb.id);
    // A copy past the relay's deletion of it (made again by a later change): no longer one the relay deleted.
    const relayed = relayGone.get(`${signedIn}:${id}`);
    if (relayed && value.through > relayed.seq) removes.push(relayed.id);
    taken.push({ id, kept, madeAgain: Boolean(relayed && value.through > relayed.seq) });
  }
  if (waitingOnRelay) askRelay?.();
  if (!taken.length) return turnedDown;
  await writeAll({ puts, removes });
  for (const { id, kept, tomb, madeAgain } of taken) {
    records = records.filter((r) => r.id !== id);
    refused = refused.filter((entry) => entry.id !== id);
    if (kept) {
      records.push(kept);
      tombs.delete(`${signedIn}:${id}`);
      if (madeAgain) relayGone.delete(`${signedIn}:${id}`);
    } else {
      tombs.set(`${signedIn}:${id}`, tomb);
      if (off.delete(id)) keepOff();
    }
  }
  records.sort((a, b) => a.addedAt - b.addedAt);
  changedEverywhere();
  return turnedDown;
}

registerSync({
  id: "packs",
  label: "Your packs",
  icon: "cards",
  counted: (n) => `${n} ${n === 1 ? "pack" : "packs"}`,
  // A file per pack (its id the shard), so a pack's change writes its own file, and a big deck never makes one file too big for your
  // account's copy. Before 12 Nov 2026 a device kept them all in one file: that file is still read and merged, and never written.
  shard: (key) => key,
  shards: PACK_ID,
  wholeBefore: true,
  records() {
    const out = {};
    if (!signedIn) return out;
    for (const tomb of tombs.values()) {
      if (tomb.account === signedIn) out[tomb.pack] = { at: tomb.at, gone: true, about: { changes: tomb.changes ?? [], edits: tomb.edits ?? 0, through: tomb.through ?? 0 } };
    }
    for (const record of records) {
      if (record.account !== signedIn) continue;
      const { id, pack, addedAt, changedAt, by, lastChange, through, account } = record;
      out[id] = { at: changedAt, value: { id, pack, addedAt, changedAt, by, lastChange: lastChange ?? null, through: through ?? 0, account, changes: lineageOf(record), edits: record.edits ?? 0, ...(record.audio ? { audio: { manifest: record.audio.manifest } } : {}) } };
    }
    return out;
  },
  check(record, key) {
    if (!isPackId(key)) return false;
    if (record.gone) {
      const about = record.about;
      return Boolean(about) && Object.keys(about).length === 3 && lineageOk(about.changes) && editsOk(about.edits) && throughOk(about.through);
    }
    const value = syncedRecord(record.value, key);
    return Boolean(value) && record.at === value.changedAt;
  },
  prefer: preferPack,
  async apply(newer) {
    const was = applying;
    applying = true;
    try {
      return await applySynced(newer);
    } finally {
      applying = was;
    }
  },
  // What a sync brought in doesn't ask for another sync.
  onChange: (fn) => onPacksChange(() => applying || fn()),
});

// The recordings of your packs, in your own storage as files of their own (sync.js blobs): every clip a pack of yours
// names, written there by a device that has it and read by one that hasn't (a new device, one that missed the relay's
// days, one whose browser let its kept copies go), kept only when its bytes hash to its name (clips.js keepClip).
// A clip arriving (from the relay, your storage or another tab) changes what a pack of yours offers.
onClipsChange(() => changed());
registerBlobs({
  id: "clip",
  names: /^[0-9a-f]{16}\.(?:mp3|m4a)$/,
  maxBytes: CLIP_BYTES,
  refresh: loadClips,
  wanted: () => records.filter((r) => signedIn && r.account === signedIn && r.audio).flatMap((r) => clipsOf(r.audio.manifest)),
  has: hasClip,
  read: clipBlob,
  check: isClip,
  keep: keepClip,
});
