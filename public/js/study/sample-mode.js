// The sample learner: an admin's look at the app with a made-up learner's progress in place of their own, on this device only, to see the
// screens that read progress with months of it rather than a few days' (Settings → About, for an admin; study/sample-learner.js makes the
// learner, study/sample-start.js puts it on the device). While it's on:
//   - everything that reads or writes progress uses stores of its own (sampleKey, sampleDb): the evidence, the done log, the pile, the path's
//     place, the language you learn, the reader's word bank and highlights, practices, a session's concepts. Yours are never opened for
//     writing while it's on: Off is going back to them, exactly as they were;
//   - nothing goes out (sampleOn): no sync with your storage, no study record for your AI, no reminders report, no error report, no
//     practices collected from the server, no practice with your AI, no clear on your account; a reading place stays where it was.
// Which stores a page uses is fixed at its start (a switch reloads); every guard also reads the switch as it stands, so a tab started
// before it was turned on in another stops sending too. Sign out turns it off, and a start with it off clears what a sample left behind.
// No imports: lx/error-report.js reads it before anything else loads.

export const SAMPLE_FLAG = "lx.sample.v1";
/** A sample store's localStorage key is the store's own after this. */
export const SAMPLE_PREFIX = "lx.sample:";
/** A sample IndexedDB database, or BroadcastChannel, is the store's own name with this after it. */
export const SAMPLE_DB_SUFFIX = ".sample";
/** The IndexedDB databases a sample has (the stores that are its own in IndexedDB). */
export const SAMPLE_DBS = ["lexicommons-study", "lexicommons-practice", "lexicommons-highlights", "lexicommons-word-index", "lexicommons-plan"];

/** The switch as it stands: { preset, at } or null. */
export function readSample() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(SAMPLE_FLAG) ?? "null");
    return value && typeof value === "object" && typeof value.preset === "string" && Number.isFinite(value.at) ? { preset: value.preset, at: value.at } : null;
  } catch {
    return null;
  }
}

const atStart = readSample();

/** The sample this page started with ({ preset, at }), or null: which stores it uses. */
export const sampleAtStart = () => atStart;

/** Whether the sample learner is on, here or since this page started: nothing goes out while it is. */
export const sampleOn = () => Boolean(atStart || readSample());

/** A store's localStorage key on this page: the sample's own while it's on. */
export const sampleKey = (key) => (atStart ? `${SAMPLE_PREFIX}${key}` : key);

/** An IndexedDB database's name (or a BroadcastChannel's) on this page: the sample's own while it's on. */
export const sampleDb = (name) => (atStart ? `${name}${SAMPLE_DB_SUFFIX}` : name);

/** Everything a sample keeps on this device: its localStorage keys, then its databases (each deleted; a database open elsewhere goes once it closes). */
export function clearSampleStores() {
  try {
    for (const key of Object.keys(globalThis.localStorage ?? {})) if (key.startsWith(SAMPLE_PREFIX)) localStorage.removeItem(key);
  } catch {}
  return Promise.all(
    SAMPLE_DBS.map(
      (name) =>
        new Promise((resolve) => {
          try {
            const request = globalThis.indexedDB.deleteDatabase(`${name}${SAMPLE_DB_SUFFIX}`);
            request.onsuccess = request.onerror = () => resolve();
            // Open in another tab: it goes when that closes; nothing here waits for it.
            request.onblocked = () => resolve();
          } catch {
            resolve();
          }
        }),
    ),
  );
}

/** Turns the sample learner off on this device: the switch first (the next start is yours), then its stores. */
export function turnSampleOff() {
  try {
    globalThis.localStorage?.removeItem(SAMPLE_FLAG);
  } catch {}
  return clearSampleStores();
}

// A start with it off: what a sample left (its stores, when they couldn't go at once) goes now. Only when there's a sample key to see,
// or the browser can say a sample database is here: nothing is asked of IndexedDB otherwise.
if (!atStart && globalThis.localStorage && globalThis.indexedDB) {
  let left = false;
  try {
    left = Object.keys(localStorage).some((key) => key.startsWith(SAMPLE_PREFIX));
  } catch {}
  if (left) clearSampleStores();
  else
    globalThis.indexedDB
      .databases?.()
      .then((dbs) => {
        if (dbs.some((db) => SAMPLE_DBS.some((name) => db.name === `${name}${SAMPLE_DB_SUFFIX}`))) clearSampleStores();
      })
      .catch(() => {});
}
