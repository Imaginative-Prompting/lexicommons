// A start with ten big public packs on the device (study/packs.js loadPacks), in Node: ten packs of 2,000 sentences each
// (the size of the Dutch word series' bands, made from the starter's sentences), installed from a library played by a
// stand-in fetch, each fully checked as it arrives and kept with its proof. A start then uses every one on its proof,
// hashing its content against its version instead of checking it in full again, and is fast. That hashing is a worker's
// (study/pack-hash-worker.js), reading the same records from the same store: here the worker runs in this process on a
// stand-in IndexedDB, and its hash is used only for the very record the page read. Pure, so it runs in Node:
// `node scripts/test-pack-load.mjs` (exit 0 = pass).

import { BUILT_IN } from "../public/js/packs/index.js";
import { catalogueEntry, checkPack, packText, packUrl, packVersion } from "../public/js/study/pack-format.js";

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};

// Ten packs of 2,000 sentences: the starter's, each copy its own sentence (one more word at its end) and English.
const base = BUILT_IN[0];
const band = (k) => {
  const items = [];
  for (let n = 0; items.length < 2000; n++) for (const item of base.items) items.push({ ...item, id: `${item.id}-${n}`, text: undefined, words: [...item.words, [`x${k}y${n}`]], means: `${item.means.replace(/[.?!]$/, "")} (${k}.${n}).` });
  const { builtIn: _b, ...plain } = base;
  const { pack, errors } = checkPack({ ...plain, id: `big-band-${k}`, name: `A big band ${k} (check)`, items: items.slice(0, 2000) });
  if (!pack) throw new Error(`the check pack ${k} is refused: ${JSON.stringify(errors.slice(0, 3))}`);
  return pack;
};
const packs = Array.from({ length: 10 }, (_, k) => band(k + 1));
const files = new Map();
const entries = [];
for (const pack of packs) {
  const version = await packVersion(pack);
  files.set(packUrl(pack.id, version), packText(pack));
  entries.push(catalogueEntry(pack, version));
}
const catalogue = { format: "lexicommons-catalogue", v: 1, books: [], lists: {}, packs: { nl: entries } };
globalThis.fetch = async (url) => {
  const path = String(url);
  if (path === "/library/catalogue.json") return new Response(JSON.stringify(catalogue));
  if (files.has(path)) return new Response(files.get(path));
  return new Response("not found", { status: 404 });
};

// A stand-in IndexedDB on a Map of records: writes commit together, or abort without changing what the next read sees.
function standInDb(stored, { aborting = () => false, failure = new Error("aborted") } = {}) {
  return {
    open() {
      const request = {};
      request.result = {
        close() {},
        transaction(_store, mode) {
          const next = new Map(stored);
          // As IndexedDB does it: each request answers in its own turn (onsuccess), a request made in an answer keeps the transaction
          // going, and it completes (or aborts) once none is left.
          let pending = 0;
          const settle = () => {
            if (pending) return;
            if (mode === "readwrite" && aborting()) {
              tx.error = failure;
              tx.onabort();
            } else {
              if (mode === "readwrite") {
                stored.clear();
                for (const [id, record] of next) stored.set(id, record);
              }
              tx.oncomplete();
            }
          };
          const request = (value) => {
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
          const tx = {
            objectStore: () => ({
              getAll: () => request(() => structuredClone([...stored.values()])),
              getAllKeys: () => request(() => [...stored.keys()].sort()),
              get: (id) => request(() => (stored.has(id) ? structuredClone(stored.get(id)) : undefined)),
              put: (record) => request(() => (next.set(record.id, structuredClone(record)), record.id)),
              delete: (id) => request(() => (next.delete(id), undefined)),
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
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
}

const packsModule = await import("../public/js/study/packs.js");
const { syncLibraryPacks, loadPacks, libraryPacks } = packsModule;

await test("ten packs of 2,000 sentences arrive from the library, each checked in full as it comes", async () => {
  const synced = await syncLibraryPacks();
  ok(synced.ok && synced.defaults === 10 && !synced.problems.length, JSON.stringify(synced).slice(0, 300));
  ok(libraryPacks().length === 10, `${libraryPacks().length} on the device`);
});

await test("a start with them: each used on its proof (no full check again), in under a tenth of a second (today's code: about 0.3 s here, several times that on a phone)", async () => {
  await loadPacks();
  const times = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await loadPacks();
    times.push(performance.now() - t);
  }
  const best = Math.min(...times);
  const load = packsModule.lastPackLoad?.() ?? null;
  ok(best < 100, `a start took ${Math.round(best)} ms (${times.map(Math.round).join(", ")}); ${JSON.stringify(load)}`);
  ok(load && load.trusted === 10 && load.checked === 0, `what the start did: ${JSON.stringify(load)}`);
  return `${Math.round(best)} ms, ${load.trusted} on their proof`;
});

// A load works its lists out in place (packs.js: the library emptied, then filled a pack at a time across awaits): what's read meanwhile
// is part of them, the bundled packs alone at first. packsSettled() waits it out; Translate's index waits on it (translate.js ensureIndex),
// so an index made in a load's middle never holds the starter alone (and is then kept while typing, the newer one waiting for typing to stop).
await test("a load under way: allPacks() meanwhile has none of the library's packs; packsSettled() resolves only once every one is back (the packs.js from before has no packsSettled)", async () => {
  ok(typeof packsModule.packsSettled === "function", "packs.js has no packsSettled: a reader can't wait out a load");
  const ids = new Set(libraryPacks().map((p) => p.id));
  ok(ids.size === 10, `${ids.size} library packs before the load`);
  const inAll = () => packsModule.allPacks().filter((p) => ids.has(p.id)).length;
  const loading = loadPacks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const during = inAll();
  let settledWith = null;
  const settled = packsModule.packsSettled().then(() => (settledWith = inAll()));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const beforeEnd = settledWith;
  await loading;
  await settled;
  ok(during < 10, `mid-load allPacks() had all ${during} library packs: nothing here to wait out (the hazard this guards wasn't reproduced)`);
  ok(beforeEnd === null, `packsSettled() resolved while the load was still under way (with ${beforeEnd})`);
  ok(settledWith === 10, `packsSettled() resolved with ${settledWith} of the 10 library packs in allPacks()`);
  ok((await Promise.race([packsModule.packsSettled().then(() => "now"), new Promise((r) => setTimeout(() => r("waiting"), 50))])) === "now", "packsSettled() with no load under way didn't resolve at once");
  return `mid-load: ${during} of 10 in allPacks(); settled: ${settledWith} of 10`;
});

await test("an aborted pack write rejects without taking the relay change, and can be retried after a load", async () => {
  const previous = globalThis.indexedDB;
  const stored = new Map();
  const failure = new Error("pack transaction aborted");
  let abort = false;
  // Writes commit together, or abort without changing what the next load reads.
  globalThis.indexedDB = standInDb(stored, { aborting: () => abort, failure });
  try {
    const { savePack, deletePack, loadPacks, yourPack, setPacksAccount } = await import("../public/js/study/packs.js?aborted-write");
    setPacksAccount("pack-write-test");
    const pack = { ...base, id: "aborted-write", name: "Before the change" };
    ok((await savePack(pack, { change: "chg_before", applied: "chg_before", through: 1 })).ok, "the first write passes");
    const before = structuredClone(yourPack(pack.id));
    const next = { ...pack, name: "After the change" };
    const rejects = async (fn) => {
      let caught;
      try {
        await fn();
      } catch (error) {
        caught = error;
      }
      ok(caught === failure, "an aborted transaction was acknowledged as successful");
      ok(JSON.stringify(yourPack(pack.id)) === JSON.stringify(before), "the failed write changed the pack or its relay history");
      await loadPacks();
      ok(JSON.stringify(yourPack(pack.id)) === JSON.stringify(before), "a load changed the pack after the failed write");
    };
    abort = true;
    await rejects(() => savePack(next, { change: "chg_after", applied: "chg_after", through: 2 }));
    await rejects(() => deletePack(pack.id, { applied: "chg_delete", through: 3 }));
    abort = false;
    ok((await savePack(next, { change: "chg_after", applied: "chg_after", through: 2 })).ok, "the retry passes");
    await loadPacks();
    const saved = yourPack(pack.id);
    ok(saved?.pack.name === next.name && saved.through === 2 && saved.changes.includes("chg_after"), "the retried relay change survives a load");
    await deletePack(pack.id, { applied: "chg_delete", through: 3 });
    await loadPacks();
    ok(!yourPack(pack.id), "the retried deletion survives a load");
  } finally {
    if (previous === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previous;
  }
});

await test("a proof from before plain cards came in (rules 3 and 4) still holds for a pack with none, so a returning learner isn't checked in full; never for a pack with cards", async () => {
  const { proofHolds, checkedProof, PACK_CHECKS } = await import("../public/js/study/pack-format.js");
  const pack = base;
  const now = checkedProof(pack, "abc");
  ok(PACK_CHECKS === 15, `PACK_CHECKS is ${PACK_CHECKS}: these exceptions are for 15 alone`);
  ok(proofHolds(now, pack, "abc"), "today's");
  ok(proofHolds({ ...now, checks: 4 }, pack, "abc"), "rules 4, no cards");
  ok(proofHolds({ ...now, checks: 3 }, pack, "abc"), "rules 3, no cards or lessons");
  ok(!proofHolds({ ...now, checks: 2 }, pack, "abc"), "rules 2");
  ok(!proofHolds({ ...now, checks: 4 }, { ...pack, cards: [] }, "abc"), "rules 4, with cards");
  ok(!proofHolds({ ...now, checks: 3 }, { ...pack, cards: [] }, "abc"), "rules 3, with cards");
  ok(!proofHolds({ ...now, checks: 3 }, { ...pack, lessons: [] }, "abc"), "rules 3, with lessons");
  ok(!proofHolds({ ...now, checks: 4 }, { ...pack, lessons: [] }, "abc"), "rules 4 didn't know a word's picture");
  ok(proofHolds({ ...now, checks: 5 }, pack, "abc"), "rules 5, no lessons");
  ok(proofHolds({ ...now, checks: 5 }, { ...pack, cards: [] }, "abc"), "rules 5 knew cards");
  ok(!proofHolds({ ...now, checks: 5 }, { ...pack, lessons: [] }, "abc"), "rules 5, with lessons");
  ok(proofHolds({ ...now, checks: 6 }, pack, "abc"), "rules 6, no lessons");
  ok(!proofHolds({ ...now, checks: 6 }, { ...pack, lessons: [] }, "abc"), "rules 6, with lessons");
  ok(!proofHolds({ ...now, checks: 3, rules: "other" }, pack, "abc"), "another language's rules");
  // Rules 9 only add extras and tags, which a pack from before can't have: any pack on a proof under 8 or 7 is trusted, lessons and cards too.
  ok(proofHolds({ ...now, checks: 8 }, { ...pack, lessons: [], cards: [] }, "abc"), "rules 8");
  ok(proofHolds({ ...now, checks: 7 }, { ...pack, lessons: [] }, "abc"), "rules 7");
  // Rules 10 only add an item's shapes, which a pack checked before can't have (the field was dropped): a proof under 9 is trusted too.
  ok(proofHolds({ ...now, checks: 9 }, { ...pack, lessons: [], cards: [] }, "abc"), "rules 9");
  // Rules 11 only add an item's copyOf, which a pack checked before can't have (the field was dropped): a proof under 10 is trusted too.
  ok(proofHolds({ ...now, checks: 10 }, { ...pack, lessons: [], cards: [] }, "abc"), "rules 10");
  // Rules 12 only take a copy they refused before (into another learner language, with its own means): a proof under 11 is trusted too.
  ok(proofHolds({ ...now, checks: 11 }, { ...pack, lessons: [], cards: [] }, "abc"), "rules 11");
  // Rules 13 only add an item's otherGender, which a pack checked before can't have (the field was dropped): a proof under 12 is trusted too.
  ok(proofHolds({ ...now, checks: 12 }, { ...pack, lessons: [], cards: [] }, "abc"), "rules 12");
  // Rules 14 only let a Russian word carry its stress mark, which a pack checked before can't have (a reading was refused): a proof under 13 is
  // trusted too, but never a Russian pack's, whose proof names Russian's rules from before readings.
  ok(proofHolds({ ...now, checks: 13 }, { ...pack, lessons: [], cards: [] }, "abc"), "rules 13");
  // Rules 15 only add a pack's teaches, which a pack checked before can't have (the field was dropped): a proof under 14 is trusted too.
  ok(proofHolds({ ...now, checks: 14 }, { ...pack, lessons: [], cards: [] }, "abc"), "rules 14");
  const ru = { ...pack, language: "ru" };
  const ruBefore = JSON.stringify([" ", "lower", [], null]);
  ok(checkedProof(ru, "abc").rules !== ruBefore, `Russian's rules unchanged: ${checkedProof(ru, "abc").rules}`);
  ok(!proofHolds({ ...checkedProof(ru, "abc"), checks: 13, rules: ruBefore }, ru, "abc"), "a Russian pack's proof from before readings");
});


// ---------- the start's hashing in a worker (pack-hash-worker.js) ----------
const { hashRecords } = await import("../public/js/study/pack-hash-worker.js");
const asked = [];
let answerWith = (answer) => answer; // what the stand-in worker does to its answer before it's posted (a planted change)
/** The worker, in this process: the page's question answered by hashRecords on the same stand-in IndexedDB. */
class StandInWorker {
  constructor(url, options) {
    this.url = String(url);
    this.options = options;
  }
  postMessage(data) {
    asked.push({ url: this.url, type: this.options?.type, data });
    hashRecords(data)
      .then((answer) => this.onmessage?.({ data: answerWith(answer) }))
      .catch(() => this.onerror?.(new Error("worker failed")));
  }
  terminate() {}
}
const previousDb = globalThis.indexedDB;
const previousWorker = globalThis.Worker;
const stored = new Map();
globalThis.indexedDB = standInDb(stored);
globalThis.Worker = StandInWorker;
try {
  const fresh = await import("../public/js/study/packs.js?worker-hash");
  await test("the ten packs stored on a device with IndexedDB, each checked in full as it comes", async () => {
    const synced = await fresh.syncLibraryPacks();
    ok(synced.ok && synced.defaults === 10, JSON.stringify(synced).slice(0, 300));
    ok([...stored.keys()].filter((k) => k.startsWith("library:")).length === 10, `${stored.size} records stored`);
  });
  await test("a start hashes them in a worker reading the same records from the same store, none on the page, each used on its proof", async () => {
    asked.length = 0;
    await fresh.loadPacks();
    const load = fresh.lastPackLoad();
    ok(load.trusted === 10 && load.checked === 0, `what the start did: ${JSON.stringify(load)}`);
    ok(load.hashedAway === 10 && load.hashedHere === 0, `hashed in the worker ${load.hashedAway}, on the page ${load.hashedHere}`);
    // One question a load (a sync's own loads ask too), each about the page's own store.
    ok(asked.length >= 1 && asked.every((a) => a.type === "module" && a.url.endsWith("/study/pack-hash-worker.js")), `the worker asked: ${JSON.stringify(asked)}`);
    ok(asked.every((a) => a.data.db === "lexicommons-packs" && a.data.version === 1 && a.data.store === "packs" && a.data.prefix === "library:"), `asked about ${JSON.stringify(asked.map((a) => a.data))}`);
    return `${load.hashedAway} hashed in the worker, ${load.trusted} on their proof`;
  });
  await test("the worker's hash decides (a CONTROL: one it got wrong for a record as stored makes that pack checked in full)", async () => {
    answerWith = (answer) => ({ hashes: answer.hashes.map((h) => (h.id === "library:big-band-2" ? { ...h, hash: "000000000000" } : h)) });
    await fresh.loadPacks();
    const load = fresh.lastPackLoad();
    ok(load.trusted === 9 && load.checked === 1 && load.hashedHere === 0, JSON.stringify(load));
    return `${load.trusted} on their proof, ${load.checked} checked in full`;
  });
  await test("a record written after the worker read it (another moment, the same version) is hashed on the page, never on the worker's word", async () => {
    answerWith = (answer) => ({ hashes: answer.hashes.map((h) => (h.id === "library:big-band-4" ? { ...h, changedAt: (h.changedAt ?? 0) - 1, hash: "000000000000" } : h)) });
    await fresh.loadPacks();
    const load = fresh.lastPackLoad();
    ok(load.hashedHere === 1 && load.hashedAway === 9 && load.trusted === 10, JSON.stringify(load));
    return `${load.hashedAway} from the worker, ${load.hashedHere} hashed here, all ${load.trusted} on their proof`;
  });
  await test("a pack whose stored content changed under its version: the worker's hash says so and it's checked in full", async () => {
    answerWith = (answer) => answer;
    const record = stored.get("library:big-band-3");
    stored.set(record.id, { ...record, pack: { ...record.pack, name: "Changed under its version" } });
    try {
      await fresh.loadPacks();
      const load = fresh.lastPackLoad();
      ok(load.trusted === 9 && load.checked === 1 && load.hashedAway === 10, JSON.stringify(load));
      return `${load.trusted} on their proof, ${load.checked} checked in full`;
    } finally {
      stored.set(record.id, record);
    }
  });
  await test("no worker (a browser without module workers): each hashed on the page, as before", async () => {
    globalThis.Worker = undefined;
    try {
      await fresh.loadPacks();
      const load = fresh.lastPackLoad();
      ok(load.hashedHere === 10 && load.hashedAway === 0 && load.trusted === 10, JSON.stringify(load));
    } finally {
      globalThis.Worker = StandInWorker;
    }
  });
} finally {
  if (previousDb === undefined) delete globalThis.indexedDB;
  else globalThis.indexedDB = previousDb;
  if (previousWorker === undefined) delete globalThis.Worker;
  else globalThis.Worker = previousWorker;
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
