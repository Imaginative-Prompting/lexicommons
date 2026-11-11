// The start's hashing of the library's packs on this device, off the page's main thread (study/packs.js loadPacks). A start trusts a
// public pack's full check from before only while its content still hashes to its version (pack-format.js packVersion); making a dozen
// word bands' text and hashing it held a phone's main thread a third of a second at 4× (6 Nov 2026). Here the same records are read
// from the same store, one at a time, and each is hashed the same way. The answer says which record each hash is of (its id, when it
// was last written, the version it says), so the page uses a hash only for the very record it read itself, and hashes any other there.
//
// hashRecords({ db, version, store, prefix }) → { hashes: [{ id, changedAt, version, hash }] }: the store's records whose id starts with
// prefix. The page names the database and store (packs.js), so nothing here has its own idea of them. It never makes or upgrades a
// database: one that isn't there yet gives no hashes.

import { packVersion } from "./pack-format.js";

function open(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    // A device without the store yet: the page makes it, never this.
    request.onupgradeneeded = () => request.transaction.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("blocked"));
  });
}

/** Every record of the store whose id starts with `prefix`, each its own request in one transaction (as packs.js readEach). */
function readEach(database, store, prefix) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, "readonly");
    const source = tx.objectStore(store);
    const out = [];
    const keys = source.getAllKeys();
    keys.onsuccess = () => {
      const list = (keys.result ?? []).filter((key) => typeof key === "string" && key.startsWith(prefix));
      const next = (i) => {
        if (i >= list.length) return;
        const request = source.get(list[i]);
        request.onsuccess = () => {
          if (request.result !== undefined) out.push(request.result);
          next(i + 1);
        };
      };
      next(0);
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export async function hashRecords({ db, version, store, prefix }) {
  const t0 = performance.now();
  const database = await open(db, version);
  const opened = performance.now();
  let records;
  try {
    records = await readEach(database, store, prefix);
  } finally {
    database.close();
  }
  const read = performance.now();
  const hashes = [];
  for (const record of records) {
    if (typeof record?.id !== "string" || !record.pack) continue;
    hashes.push({ id: record.id, changedAt: record.changedAt ?? null, version: record.source?.version ?? null, hash: await packVersion(record.pack).catch(() => null) });
  }
  // How long each part took here (ms), for whoever measures a start (packs.js lastPackLoad).
  return { hashes, took: { open: Math.round(opened - t0), read: Math.round(read - opened), hash: Math.round(performance.now() - read) } };
}

// As a worker: one question, one answer (packs.js ends it after).
if (typeof WorkerGlobalScope === "function" && globalThis instanceof WorkerGlobalScope) {
  addEventListener("message", async ({ data }) => {
    try {
      postMessage(await hashRecords(data));
    } catch (error) {
      postMessage({ hashes: [], error: String(error?.name ?? error) });
    }
  });
}
