// A stand-in IndexedDB for Node's tests of study/packs.js and the workers that share its store (pack-put-worker.js, pack-hash-worker.js),
// close to a browser's where the tests look: a put serializes its record where it's called (so a test can see what a page's write costs, and
// who made it), each request answers in a turn of its own, a request made in an answer keeps its transaction going, and a readwrite
// transaction's changes land when it completes, applied over what's stored then (two writers' transactions never drop each other's records).
// standInIndexedDB({ stored, onPut }) → { stored, page, worker }: two factories over one store, the page's (globalThis.indexedDB) and a
// worker's (handed to the worker's code), each put told to onPut({ id, bytes, who }) with its serialized size.
import v8 from "node:v8";

export function standInIndexedDB({ stored = new Map(), onPut = () => {} } = {}) {
  const factory = (who) => ({
    open() {
      const request = {};
      request.result = {
        close() {},
        transaction(_store, mode) {
          const ops = []; // [{ id, value } | { id, gone: true } | { clear: true }], in order
          let pending = 0;
          let done = false;
          const live = () => {
            const now = new Map(stored);
            for (const op of ops) {
              if (op.clear) now.clear();
              else if (op.gone) now.delete(op.id);
              else now.set(op.id, op.value);
            }
            return now;
          };
          const settle = () => {
            if (pending || done) return;
            done = true;
            if (mode === "readwrite") {
              for (const op of ops) {
                if (op.clear) stored.clear();
                else if (op.gone) stored.delete(op.id);
                else stored.set(op.id, op.value);
              }
            }
            tx.oncomplete?.();
          };
          const answer = (value) => {
            const r = {};
            pending++;
            setTimeout(() => {
              r.result = value();
              r.onsuccess?.();
              pending--;
              queueMicrotask(settle);
            }, 0);
            return r;
          };
          const copy = (value) => (value === undefined ? undefined : v8.deserialize(v8.serialize(value)));
          const tx = {
            objectStore: () => ({
              get: (id) => answer(() => copy(live().get(id))),
              getAll: () => answer(() => [...live().values()].map(copy)),
              getAllKeys: () => answer(() => [...live().keys()].sort()),
              put(record) {
                const bytes = v8.serialize(record);
                onPut({ id: record.id, bytes: bytes.length, who });
                ops.push({ id: record.id, value: v8.deserialize(bytes) });
                return answer(() => record.id);
              },
              delete(id) {
                ops.push({ id, gone: true });
                return answer(() => undefined);
              },
              clear() {
                ops.push({ clear: true });
                return answer(() => undefined);
              },
            }),
          };
          pending++;
          setTimeout(() => {
            pending--;
            settle();
          }, 0);
          return tx;
        },
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return { stored, page: factory("page"), worker: factory("worker") };
}
