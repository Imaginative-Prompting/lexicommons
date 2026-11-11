// A library pack's record written off the page's main thread (study/packs.js ensure). IndexedDB's put serializes the whole record where it's
// called, and a word band's record held a phone's main thread 44–52 ms at 4× each time a sync brought a new version (7 Nov 2026, Chrome's
// trace). The page has the pack's bytes already (the text it hashed against the version: pack-format.js packBytesSteps, exactly what's kept),
// so it hands them over at no cost (transferred) with the rest of the record, and the pack is made from them here and written whole.
//
// putRecord({ db, version, store, record, bytes }) → { ok: true } once the write's transaction is complete (whatever reads the store after,
// a load, the hash worker, another tab, finds it), else { error }. The page names the database and store (packs.js), so nothing here has its
// own idea of them; it never makes or upgrades a database. `indexedDB` is the factory to use (a test's stand-in; a worker's own by default).

export function putRecord({ db, version, store, record, bytes }, factory = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    let pack;
    try {
      pack = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      reject(error);
      return;
    }
    const request = factory.open(db, version);
    // A device without the store yet: the page makes it, never this.
    request.onupgradeneeded = () => request.transaction.abort();
    request.onblocked = () => reject(new Error("blocked"));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      let tx;
      try {
        tx = database.transaction(store, "readwrite");
        tx.objectStore(store).put({ ...record, pack });
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      tx.oncomplete = () => {
        database.close();
        resolve({ ok: true });
      };
      tx.onerror = tx.onabort = () => {
        database.close();
        reject(tx.error ?? new Error("aborted"));
      };
    };
  });
}

// As a worker: each message one record, written strictly in turn (a later write of the same record stays) and answered by the number it came
// with (seq).
if (typeof WorkerGlobalScope === "function" && globalThis instanceof WorkerGlobalScope) {
  let turn = Promise.resolve();
  addEventListener("message", ({ data }) => {
    turn = turn.then(() =>
      putRecord(data).then(
        (answer) => postMessage({ seq: data?.seq, ...answer }),
        (error) => postMessage({ seq: data?.seq, error: String(error?.name ?? error) }),
      ),
    );
  });
}
