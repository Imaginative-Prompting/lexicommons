// Syncing through your own storage (public/js/sync.js), in Node against a storage kept in memory. The engine: the
// merge; devices coming together through files of their own; nothing lost when devices write at once; a device that's
// gone leaving its copy; a deletion staying deleted (also on a device away for months); files nobody changed skipped;
// records a device turns down kept out of its merge and its file; limits on what's read; "__proto__" as a plain key.
// Study progress (public/js/study/progress.js) on two devices, each its own copy of the modules: their rows come
// together in the same order and the scheduler replays every unit the same on both; clearing everywhere covers rows
// the clearing device never saw, stays cleared, keeps later answers, and Undo on the other device brings it all back;
// rows from elsewhere checked field by field. Your packs (public/js/study/packs.js): the copy further along the
// changes from your AI wins whatever the clocks say, a delete beats an older copy, a pack made again beats its delete,
// and a copy past the relay's furthest change isn't taken. Blobs (files of their own, named by their content): written
// once by a device that has one, read by one that hasn't, kept only if its bytes check; your packs' recordings reaching
// a device that never had them through your storage alone. `node scripts/test-sync.mjs` (exit 0 = pass).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

// Each device is its own copy of the app's modules: an import from a module loaded as ?device=x is ?device=x too.
registerHooks({
  resolve(specifier, context, next) {
    const resolved = next(specifier, context);
    const device = context.parentURL?.startsWith("file:") ? new URL(context.parentURL).searchParams.get("device") : null;
    if (!device || !resolved.url.startsWith("file:") || !resolved.url.includes("/public/js/")) return resolved;
    const url = new URL(resolved.url);
    url.searchParams.set("device", device);
    return { ...resolved, url: url.href };
  },
});
// No IndexedDB or other tabs here (progress.js and packs.js keep things in memory), and one localStorage for every
// device: only the language, the study settings and which packs are off read it.
globalThis.BroadcastChannel = undefined;
const stored = new Map();
globalThis.localStorage = { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, String(v)), removeItem: (k) => stored.delete(k) };

// The account's side of clears (src/progress-clears.ts) on the real migrations in Node's SQLite, answering the app's
// fetches as /api/progress/clears would; down: no connection.
const { env, sqlite } = workerEnv();
const clearsApi = await import(join(APP, "src/progress-clears.ts"));
const USER = "user-sync";
sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(USER, "Sync test", Date.now());
const account = { down: false, stale: null };
// What the server answers at other addresses (a change's clips): path → { status, bytes }.
const served = new Map();
globalThis.fetch = async (url, init = {}) => {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (account.down) throw new TypeError("Failed to fetch");
  const path = String(url);
  if (served.has(path)) return new Response(served.get(path).bytes ?? null, { status: served.get(path).status });
  // An answer that left before the latest change (a slow GET): what the account said then.
  if (account.stale && path === "/api/progress/clears" && init.method !== "POST") {
    const stale = account.stale;
    account.stale = null;
    return json(200, stale);
  }
  try {
    if (path === "/api/progress/clears") return json(200, init.method === "POST" ? await clearsApi.addClear(env, USER, JSON.parse(init.body)) : await clearsApi.listClears(env, USER));
    const undo = /^\/api\/progress\/clears\/([^/]+)\/undo$/.exec(path);
    if (undo && init.method === "POST") return json(200, await clearsApi.undoClear(env, USER, undo[1]));
  } catch (error) {
    return json(400, { error: error.message });
  }
  return json(404, { error: `not here: ${path}` });
};

const moduleOf = (path, device) => new URL(`../public/js/${path}?device=${device}`, import.meta.url).href;
const device = async (name) => ({
  name,
  progress: await import(moduleOf("study/progress.js", name)),
  packs: await import(moduleOf("study/packs.js", name)),
  sync: await import(moduleOf("sync.js", name)),
});
const engine = await import(moduleOf("sync.js", "engine"));
const { canonical, mergeRecords, SYNC_LIMITS, syncWith, winner } = engine;

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.stack ?? error.message}`);
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const eq = (actual, expected, what = "") => {
  const a = canonical(actual);
  const e = canonical(expected);
  if (a !== e) throw new Error(`${what}${what ? ": " : ""}${a.slice(0, 400)} ≠ ${e.slice(0, 400)}`);
};
const plain = (records) => JSON.parse(JSON.stringify(records));

/** A storage in memory: files with versions and sizes; a write given { version } happens only at that version. */
function memoryStore() {
  const files = new Map();
  let n = 0;
  const store = {
    files,
    reads: 0,
    writes: 0,
    async list() {
      return [...files].map(([name, f]) => ({ name, version: f.version, size: f.size ?? f.text.length }));
    },
    async read(name) {
      store.reads++;
      const f = files.get(name);
      if (!f) throw new Error(`${name} isn't there`);
      return f.text;
    },
    beforeWrite: null, // runs once, before the next write (another writer getting in first)
    async write(name, text, { version } = {}) {
      const hook = store.beforeWrite;
      store.beforeWrite = null;
      await hook?.(name);
      const f = files.get(name);
      if (version !== undefined && (version === null ? f : f?.version !== version)) {
        const error = new Error("conflict");
        error.conflict = true;
        throw error;
      }
      store.writes++;
      files.set(name, { text, version: `v${++n}` });
      return { version: `v${n}` };
    },
  };
  return store;
}
const recordsIn = (store, name) => JSON.parse(store.files.get(name).text).records;

/** A kind for the engine's tests: its records in memory, apply takes what's newer (turnDown: keys it refuses). */
function thing(local = {}, { id = "things", check, shard, shards, turnDown = [] } = {}) {
  const kind = {
    id,
    label: id,
    local,
    check,
    shard,
    shards,
    records: () => ({ ...kind.local }),
    apply(newer) {
      // (Defined, not assigned: a key such as "__proto__" is a key like any other.)
      for (const key of Object.keys(newer)) if (!turnDown.includes(key)) Object.defineProperty(kind.local, key, { value: newer[key], enumerable: true, writable: true, configurable: true });
      return turnDown.filter((key) => key in newer);
    },
  };
  return kind;
}
const TAG = "0a1b2c3d";
const [DA, DB, DC] = ["aaaaaaaa", "bbbbbbbb", "cccccccc"];
const own = (device, kind = "things", shard = "") => `lexicommons-${kind}${shard ? `.${shard}` : ""}.${TAG}.${device}.json`;
const NOW = Date.now();
const at = (t, value) => ({ at: NOW + t, value });
const gone = (t) => ({ at: NOW + t, gone: true });
/** Syncs a device's kind with a store, keeping what it remembers between syncs. */
const syncer = (store, dev, kind, remembered = {}) => () => syncWith(store, TAG, dev, remembered, [kind]);

// ---------- the engine ----------

await test("merge: the newer wins, then a deletion, then the larger JSON; a kind may order its own", () => {
  eq(winner(at(5, "a"), at(9, "b")), at(9, "b"), "newer");
  eq(winner(at(5, "a"), gone(5)), gone(5), "a tie goes to the deletion");
  eq(winner(at(5, "a"), at(5, "b")), at(5, "b"), "then the larger JSON");
  eq(winner(at(5, "b"), at(5, "a")), at(5, "b"), "whichever way round");
  eq(plain(mergeRecords({ x: at(1, 1), y: at(4, 1) }, { y: at(3, 2), z: gone(2) })), { x: at(1, 1), y: at(4, 1), z: gone(2) });
  const oldest = { prefer: (a, b) => (a.at <= b.at ? a : b) };
  eq(plain(mergeRecords({ y: at(4, 1) }, { y: at(3, 2) }, oldest)), { y: at(3, 2) }, "a kind's own order");
});

await test("devices come together, each writing only its own file", async () => {
  const store = memoryStore();
  const a = thing({ x: at(1, "from a") });
  const b = thing({ y: at(2, "from b") });
  const [sa, sb] = [syncer(store, DA, a), syncer(store, DB, b)];
  await sa();
  await sb();
  await sa();
  eq(a.local, b.local, "a and b");
  eq([...store.files.keys()].sort(), [own(DA), own(DB)], "one file each");
  eq(recordsIn(store, own(DB)), { x: at(1, "from a"), y: at(2, "from b") }, "b's file has everything b has");
});

await test("devices syncing at the same moment lose nothing (no file has two writers)", async () => {
  const store = memoryStore();
  const a = thing({ x: at(1, "x") });
  const b = thing({ y: at(2, "y") });
  const [sa, sb] = [syncer(store, DA, a), syncer(store, DB, b)];
  // Both list the storage before either writes.
  await Promise.all([sa(), sb()]);
  a.local.w = at(3, "w");
  b.local.v = at(4, "v");
  await Promise.all([sa(), sb()]);
  await Promise.all([sa(), sb()]);
  eq(Object.keys(a.local).sort(), ["v", "w", "x", "y"], "a has everything");
  eq(a.local, b.local, "a and b");
});

await test("a device that's gone leaves its copy for the others", async () => {
  const store = memoryStore();
  const a = thing({ x: at(1, "x"), y: at(2, "y") });
  await syncer(store, DA, a)();
  // a is never seen again; c is a new device.
  const c = thing();
  await syncer(store, DC, c)();
  eq(c.local, a.local, "c has what a had");
});

await test("a deletion on one device stays deleted after the other syncs, more syncs on, and on a device back after months", async () => {
  const store = memoryStore();
  const a = thing({ x: at(1, "x"), y: at(1, "y") });
  const b = thing();
  const [sa, sb] = [syncer(store, DA, a), syncer(store, DB, b)];
  await sa();
  await sb();
  eq(b.local, a.local, "b has both");
  a.local.x = gone(5);
  await sa();
  await sb();
  eq(b.local.x, gone(5), "b took the deletion");
  for (let i = 0; i < 3; i++) {
    await sb();
    await sa();
  }
  eq([a.local.x, b.local.x], [gone(5), gone(5)], "still deleted on both");
  // A device away since before the deletion (deletions never expire), still holding the old x.
  const c = thing({ x: at(1, "x") });
  await syncer(store, DC, c)();
  eq(c.local.x, gone(5), "the old copy is deleted there");
  ok(recordsIn(store, own(DC)).x?.gone === true, "and its own file says so");
});

await test("a file nobody changed isn't read again; a change in another device's file is", async () => {
  const store = memoryStore();
  const a = thing({ x: at(1, "x") });
  const b = thing({ y: at(2, "y") });
  const [sa, sb] = [syncer(store, DA, a), syncer(store, DB, b)];
  await sa();
  await sb();
  await sa();
  const reads = store.reads;
  const writes = store.writes;
  await sa();
  await sa();
  eq(store.reads - reads, 0, "reads when nothing changed");
  eq(store.writes - writes, 0, "writes when nothing changed");
  b.local.z = at(3, "z");
  await sb();
  await sa();
  eq(Object.keys(a.local).sort(), ["x", "y", "z"], "a has b's change");
  // b reads a's file once more (a wrote what it took), then nothing is read or written.
  await sb();
  const settled = [store.reads, store.writes];
  await sa();
  await sb();
  eq([store.reads, store.writes], settled, "settled");
});

await test("a record dated more than a day ahead waits until it isn't", async () => {
  const store = memoryStore();
  await syncer(store, DC, thing({ later: at(2 * SYNC_LIMITS.ahead, "from the future"), now: at(1, "now") }))();
  const a = thing();
  const remembered = {};
  await syncWith(store, TAG, DA, remembered, [a]);
  eq(Object.keys(a.local), ["now"], "only the record that's due");
  await syncWith(store, TAG, DA, remembered, [a], NOW + 2 * SYNC_LIMITS.ahead);
  eq(Object.keys(a.local).sort(), ["later", "now"], "taken once it's due");
});

await test("a record the device turns down takes no part in its merge and never reaches its own file", async () => {
  const store = memoryStore();
  const check = (record) => record.gone || typeof record.value === "string";
  // Another device's file with a newer x, in a shape this device refuses.
  await syncer(store, DC, thing({ x: { at: NOW + 5000, value: { forged: true } }, y: at(1, "fine") }))();
  const a = thing({ x: at(1, "mine") }, { check });
  const report = await syncer(store, DA, a)();
  eq(a.local, { x: at(1, "mine"), y: at(1, "fine") }, "kept its own x, took y");
  eq(report.things.refused, 1, "one refused");
  eq(recordsIn(store, own(DA)), { x: at(1, "mine"), y: at(1, "fine") }, "its file has its own x");
});

await test("what the kind turns down isn't counted as taken, and its file is read again next time", async () => {
  const store = memoryStore();
  await syncer(store, DC, thing({ x: at(1, "x"), y: at(1, "y") }))();
  const a = thing({}, { turnDown: ["y"] });
  const sa = syncer(store, DA, a);
  const report = await sa();
  eq(report.things.took, 1, "took");
  eq(Object.keys(a.local), ["x"], "kept");
  const reads = store.reads;
  await sa();
  eq(store.reads - reads, 1, "read again");
});

await test("shards: a file per shard and device, and only a changed one is read", async () => {
  const store = memoryStore();
  const options = { shard: (key) => key.slice(0, 7), shards: /^\d{4}-\d{2}$/ };
  const a = thing({ "2026-09:a": at(1, "a"), "2026-10:b": at(2, "b") }, options);
  const sa = syncer(store, DA, a);
  await sa();
  eq([...store.files.keys()].sort(), [own(DA, "things", "2026-09"), own(DA, "things", "2026-10")]);
  const b = thing({}, options);
  const sb = syncer(store, DB, b);
  await sb();
  eq(b.local, a.local, "a new device gets every shard");
  a.local["2026-10:c"] = at(3, "c");
  await sa();
  const reads = store.reads;
  await sb();
  eq(store.reads - reads, 1, "one file read");
  eq(b.local["2026-10:c"], at(3, "c"), "the change");
});

await test("names: another account's files, another kind's, and a shard the kind doesn't have aren't read", async () => {
  const store = memoryStore();
  await syncWith(store, "ffffffff", DC, {}, [thing({ secret: at(1, "theirs") })]);
  await syncWith(store, TAG, DC, {}, [thing({ other: at(1, "x") }, { id: "things-more" })]);
  store.files.set(`lexicommons-things.place.${TAG}.${DC}.json`, { version: "v0", text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "things", account: TAG, records: { odd: at(1, 1) } }) });
  const a = thing();
  await syncWith(store, TAG, DA, {}, [a]);
  eq(a.local, {}, "nothing taken");
});

await test("limits: a file too big, a value nested too deep, a file with too many records: not taken", async () => {
  const store = memoryStore();
  const file = (records) => JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "things", account: TAG, records });
  let deep = "leaf";
  for (let i = 0; i < SYNC_LIMITS.depth + 5; i++) deep = { deep };
  store.files.set(own(DB), { version: "v0", text: file({ deep: at(1, deep), fine: at(1, "fine") }) });
  store.files.set(own(DC), { version: "v0", text: file({ x: at(1, "x") }), size: SYNC_LIMITS.fileBytes + 1 });
  const many = Object.fromEntries(Array.from({ length: SYNC_LIMITS.records + 1 }, (_, i) => [`k${i}`, at(1, i)]));
  store.files.set(own("dddddddd"), { version: "v0", text: file(many) });
  const a = thing();
  const report = await syncWith(store, TAG, DA, {}, [a]);
  eq(Object.keys(a.local), ["fine"], "only the plain record");
  ok(/too big/.test(report.things.error ?? ""), `the big file is reported: ${report.things.error}`);
  ok(report.things.dropped >= 3, `dropped: ${report.things.dropped}`);
});

await test('"__proto__" is a key like any other', async () => {
  const store = memoryStore();
  store.files.set(own(DB), { version: "v0", text: `{"format":"lexicommons-sync","version":1,"kind":"things","account":"${TAG}","records":{"__proto__":{"at":${NOW},"value":"plain"}}}` });
  const a = thing();
  await syncWith(store, TAG, DA, {}, [a]);
  ok(Object.hasOwn(a.local, "__proto__") && a.local.__proto__.value === "plain", "taken as a key");
  ok(Object.getPrototypeOf({}) === Object.prototype && !("value" in {}), "nothing else changed");
});

await test("a clash on this device's own file (another browser with its id): what was written there is read, not lost", async () => {
  const store = memoryStore();
  const a = thing({ x: at(1, "x") });
  const sa = syncer(store, DA, a);
  await sa();
  a.local.y = at(2, "y");
  store.beforeWrite = (name) => {
    const file = JSON.parse(store.files.get(name).text);
    file.records.z = at(3, "from the other browser");
    store.files.set(name, { text: JSON.stringify(file), version: "v-other" });
  };
  const report = await sa();
  eq(report.things.error, null, "no error");
  eq(Object.keys(recordsIn(store, own(DA))).sort(), ["x", "y", "z"], "the file has both");
  eq(a.local.z, at(3, "from the other browser"), "and so does the device");
});

await test("this device's own file written again when it's gone from the storage", async () => {
  const store = memoryStore();
  const a = thing({ x: at(1, "x") });
  const sa = syncer(store, DA, a);
  await sa();
  store.files.delete(own(DA));
  await sa();
  eq(recordsIn(store, own(DA)), { x: at(1, "x") }, "written again");
});

// ---------- study progress on two devices ----------

const A = await device("a");
const B = await device("b");
await A.progress.loadProgress();
await B.progress.loadProgress();
const store = memoryStore();
const remembered = { a: {}, b: {} };
const syncA = () => A.sync.syncWith(store, TAG, DA, remembered.a, undefined);
const syncB = () => B.sync.syncWith(store, TAG, DB, remembered.b, undefined);
const realNow = Date.now;
// Runs fn as if it were time t (until its promise settles, for an async one).
const at$ = (t, fn) => {
  Date.now = () => t;
  let result;
  try {
    result = fn();
  } catch (error) {
    Date.now = realNow;
    throw error;
  }
  if (typeof result?.then === "function") return result.finally(() => (Date.now = realNow));
  Date.now = realNow;
  return result;
};
const T0 = Date.UTC(2026, 8, 20, 9); // September, so progress spans two monthly files
const DAY = 86_400_000;
const answer = (dev, t, concept, outcome = "right", skill = "read") => at$(t, () => dev.progress.record([{ concept, skill, outcome, test: "recall", activity: "test", lang: "nl" }]));

// Every unit's whole state on a device, at one moment.
function picture(dev, now) {
  const p = dev.progress;
  const units = p.studiedUnits("nl").sort();
  return { rows: p.allEvidence().map(({ id: _id, ...row }) => row), units: units.map((u) => p.unitState(u, { lang: "nl", now })), calibration: p.calibration({ stored: false }) };
}

await test("progress: two devices' answers come together, in the same order, and replay the same", async () => {
  const words = ["w:huis", "w:boek", "w:lezen", "p:verb-second", "c:goedemorgen"];
  for (let d = 0; d < 6; d++) {
    for (const [i, unit] of words.entries()) {
      answer(A, T0 + d * 4 * DAY + i * 60_000, unit, i % 3 ? "right" : "wrong");
      answer(B, T0 + d * 4 * DAY + i * 60_000 + 7_000, unit, (i + d) % 4 ? "right" : "wrong", d % 2 ? "hear" : "say");
    }
  }
  // One answer at the very same moment on both devices, for the same unit and strength, graded differently.
  const SAME = T0 + 30 * DAY;
  answer(A, SAME, "w:huis", "right");
  answer(B, SAME, "w:huis", "wrong");
  // A row from before rows had ids, as an older device's file would carry it.
  const old = { at: T0 - DAY, concept: "w:huis", skill: "reading", outcome: "right", test: "recall", activity: "test" };
  const oldKey = A.progress.evidenceKey(old);
  ok(/^2026-09:c[0-9a-f]{14}$/.test(oldKey), `an old row's key is its month and content: ${oldKey}`);
  store.files.set(`lexicommons-progress.2026-09.${TAG}.${DC}.json`, { version: "v0", text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "progress", account: TAG, records: { [oldKey]: { at: old.at, value: old } } }) });
  await syncA();
  await syncB();
  await syncA();
  const now = SAME + DAY;
  const [pa, pb] = [picture(A, now), picture(B, now)];
  eq(pa.rows.length, 6 * 5 * 2 + 2 + 1, "rows on A");
  eq(pa.rows, pb.rows, "the same rows in the same order");
  eq(pa.units, pb.units, "every unit's state");
  eq(pa.calibration, pb.calibration, "calibration");
  eq(A.progress.unitState("w:huis", { lang: "nl", now }).strengths.read.lastAt, SAME, "the shared moment is the last read review");
  ok([...store.files.keys()].some((n) => n.includes(".2026-09.")) && [...store.files.keys()].some((n) => n.includes(".2026-10.")), "a file per month");
  return `${pa.rows.length} rows, ${pa.units.length} units identical`;
});

await test("progress: a failed save is retried before later changes, warns before leaving, and survives a reload", async () => {
  const original = { indexedDB: globalThis.indexedDB, BroadcastChannel: globalThis.BroadcastChannel, addEventListener: globalThis.addEventListener, setTimeout: globalThis.setTimeout, warn: console.warn };
  const rows = [];
  const messages = [];
  const retries = [];
  const listeners = new Map();
  let failing = true;
  let attempts = 0;
  const request = (result) => {
    const r = { result };
    queueMicrotask(() => r.onsuccess?.({ target: r }));
    return r;
  };
  globalThis.indexedDB = { open() {
    return request({ transaction(names, mode) {
      const fail = mode === "readwrite" && failing;
      if (mode === "readwrite") attempts++;
      const tx = { objectStore(name) {
        return {
          getAll: () => request(name === "evidence" ? structuredClone(rows) : []),
          index: () => ({ getKey: (uid) => request(rows.find((r) => r.uid === uid)?.id) }),
          add(row) {
            const id = rows.length + 1;
            if (!fail) rows.push({ ...row, id });
            return request(id);
          },
          clear: () => { if (!fail) rows.length = 0; },
          openCursor: () => request(null),
        };
      } };
      setImmediate(() => {
        if (fail) {
          tx.error = new DOMException("Storage is full", "QuotaExceededError");
          tx.onabort?.();
        } else tx.oncomplete?.();
      });
      return tx;
    } });
  } };
  globalThis.BroadcastChannel = class { postMessage(value) { messages.push(value); } };
  globalThis.addEventListener = (name, fn) => listeners.set(name, fn);
  globalThis.setTimeout = (fn) => { retries.push(fn); };
  console.warn = () => {};
  const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
  const leaving = () => {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    listeners.get("beforeunload")?.(event);
    return event.prevented;
  };
  try {
    const p = await import(moduleOf("study/progress.js", "failed-write"));
    await p.loadProgress();
    p.record([{ concept: "w:huis", outcome: "right", lang: "nl" }]);
    await flush();
    eq(rows.length, 0, "the transaction failed");
    eq(p.allEvidence().length, 1, "the answer is still here");
    eq(messages.length, 0, "an unsaved answer isn't broadcast as saved");
    ok(leaving(), "leaving with unsaved progress warns");
    eq(retries.length, 1, "the save will be retried");
    failing = false;
    retries.shift()();
    await flush();
    eq(rows.length, 1, "the retry saved the answer without another answer or sync");
    eq(messages.length, 1, "the saved answer is broadcast once");
    ok(!leaving(), "saved progress needs no warning");
    const reloaded = await import(moduleOf("study/progress.js", "failed-write-reload"));
    await reloaded.loadProgress();
    eq(reloaded.allEvidence().map((r) => r.concept), ["w:huis"], "the answer survives a reload");
    failing = true;
    p.record([{ concept: "w:boek", outcome: "right", lang: "nl" }]);
    await flush();
    const before = attempts;
    const cleared = p.clearProgress();
    await flush();
    eq(attempts, before, "the clear waits behind the failed answer");
    eq(await Promise.race([Promise.resolve(cleared).then(() => "released"), new Promise((resolve) => setImmediate(() => resolve("held")))]), "released", "a caller isn't held up behind a stuck save (a session, an undo, a sync)");
    failing = false;
    retries.shift()();
    await flush();
    eq(rows.length, 0, "the retry cannot bring back an answer after the clear");
    ok(!leaving(), "all changes saved");
  } finally {
    for (const fn of retries.splice(0)) fn();
    Object.assign(globalThis, { indexedDB: original.indexedDB, BroadcastChannel: original.BroadcastChannel, addEventListener: original.addEventListener, setTimeout: original.setTimeout });
    console.warn = original.warn;
  }
});

await test("progress: the scheduler replays a moment's answers the same whatever order they come in", async () => {
  const { replay } = await import(new URL("../public/js/study/scheduler.js", import.meta.url).href);
  const reviews = [
    { at: T0, skill: "read", grade: "good", spoken: false },
    { at: T0, skill: "read", grade: "again", spoken: false },
    { at: T0, skill: "say", grade: "good", spoken: true },
    { at: T0 + 2 * DAY, skill: "read", grade: "hard", spoken: false },
    { at: T0 + 2 * DAY, skill: "hear", grade: "good", spoken: false },
  ];
  const strengths = (list) => replay("w:huis", list).strengths;
  const base = strengths(reviews);
  for (const order of [[1, 0, 2, 3, 4], [2, 1, 0, 4, 3], [4, 3, 2, 1, 0]]) eq(strengths(order.map((i) => reviews[i])), base, `order ${order}`);
});

await test("progress: a row from elsewhere is checked field by field; a uid can't be another row's", async () => {
  const good = { at: T0 + 2000, v: 2, lang: "nl", concept: "w:kaas", skill: "read", outcome: "right", test: "recall", help: "none", activity: "test", uid: "00112233445566aa" };
  ok(A.progress.cleanRow(good), "a whole row");
  ok(A.progress.cleanRow({ ...good, note: "a note", said: "Ik eet kaas.", practice: "pr_1", source: "ai", how: "spoken", marked: false, p: 0.5 }), "a practice row");
  ok(A.progress.cleanRow({ at: T0, concept: "w:oud", skill: "reading", outcome: "hint", source: "ai", extra: 1 }), "an old row with a field this app doesn't know");
  for (const [what, row] of [
    ["p below 0", { ...good, p: -1 }],
    ["p above 1", { ...good, p: 2 }],
    ["an unknown skill", { ...good, skill: "dance" }],
    ["an unknown outcome", { ...good, outcome: "maybe" }],
    ["a bad uid", { ...good, uid: "x" }],
    ["a nested field", { ...good, item: { a: 1 } }],
    ["no concept", { at: T0 }],
    ["a long note", { ...good, note: "x".repeat(1201) }],
  ]) ok(!A.progress.cleanRow(row), `refused: ${what}`);
  // A row reusing a uid A has, under another month: turned down.
  const theirs = A.progress.allEvidence().find((r) => r.uid);
  const clash = { ...theirs, at: theirs.at - 40 * DAY };
  const key = A.progress.evidenceKey(clash);
  const crafted = memoryStore();
  crafted.files.set(`lexicommons-progress.${key.slice(0, 7)}.${TAG}.dddddddd.json`, { version: "v0", text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "progress", account: TAG, records: { [key]: { at: clash.at, value: clash } } }) });
  const before = A.progress.allEvidence().length;
  const report = await A.sync.syncWith(crafted, TAG, DA, {}, undefined);
  eq(report.progress.took, 0, "not taken");
  eq(A.progress.allEvidence().length, before, "nothing added");
});

await test("progress: two rows of one batch with the same uid: one is taken, and only it reaches this device's file", async () => {
  const twin = { at: T0 + 3 * DAY, v: 2, lang: "nl", concept: "w:twee", skill: "read", outcome: "right", test: "recall", help: "none", activity: "test", uid: "0123012301230123" };
  const other = { ...twin, at: T0 + 33 * DAY };
  const [k1, k2] = [A.progress.evidenceKey(twin), A.progress.evidenceKey(other)];
  const crafted = memoryStore();
  for (const [key, row] of [[k1, twin], [k2, other]]) {
    crafted.files.set(`lexicommons-progress.${key.slice(0, 7)}.${TAG}.dddddddd.json`, { version: "v0", text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "progress", account: TAG, records: { [key]: { at: row.at, value: row } } }) });
  }
  const before = A.progress.allEvidence().length;
  const report = await A.sync.syncWith(crafted, TAG, DA, {}, undefined);
  eq(report.progress.took, 1, "one taken");
  eq(A.progress.allEvidence().length, before + 1, "one row here");
  const mine = [...crafted.files.keys()].filter((n) => n.endsWith(`.${DA}.json`)).flatMap((n) => Object.values(recordsIn(crafted, n)));
  eq(mine.filter((r) => r.value.uid === twin.uid).length, 1, "one in its files");
});

await test("progress: a clear in a file clears nothing (only your account's clears do), and clearing everywhere needs the account", async () => {
  const before = A.progress.allEvidence().length;
  const crafted = memoryStore();
  crafted.files.set(`lexicommons-progress.clears.${TAG}.dddddddd.json`, { version: "v0", text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "progress", account: TAG, records: { "clear:00000000aaaaaaaa": { at: NOW, value: { before: NOW, undone: false } } } }) });
  await A.sync.syncWith(crafted, TAG, DA, {}, undefined);
  eq(A.progress.allEvidence().length, before, "nothing cleared");
  account.down = true;
  try {
    await A.progress.clearProgress({ everywhere: true }).then(
      () => ok(false, "cleared without the account"),
      (error) => ok(/fetch/i.test(error.message), error.message),
    );
  } finally {
    account.down = false;
  }
  eq(A.progress.allEvidence().length, before, "nothing cleared without it");
});

let cleared = 0;
await test("progress: clearing everywhere covers what the clearing device never saw, keeps later answers, and stays cleared", async () => {
  await syncA();
  await syncB();
  const CLEAR = T0 + 40 * DAY;
  // B answers while away: A never sees it before the clear.
  answer(B, CLEAR - 60_000, "w:offline");
  cleared = A.progress.allEvidence().length + 1;
  await at$(CLEAR, () => A.progress.clearProgress({ everywhere: true }));
  eq(A.progress.allEvidence().length, 0, "A is empty");
  await at$(CLEAR + 1000, syncA);
  await at$(CLEAR + 2000, syncB);
  eq(B.progress.allEvidence().length, 0, "B cleared, its answer from while it was away too");
  // B answers after the clear; more syncs both ways.
  answer(B, CLEAR + 3000, "w:fiets");
  for (let i = 0; i < 3; i++) {
    await at$(CLEAR + 4000 + i, syncB);
    await at$(CLEAR + 5000 + i, syncA);
  }
  eq(A.progress.allEvidence().map((r) => r.concept), ["w:fiets"], "A: only the later answer");
  eq(B.progress.allEvidence().map((r) => r.concept), ["w:fiets"], "B: only the later answer");
  eq(recordsIn(store, `lexicommons-progress.2026-09.${TAG}.${DA}.json`), {}, "A's September file is empty");
  // A device that starts after the clear takes none of what it covers, from any file (the old device's included).
  const E = await device("e");
  await E.progress.loadProgress();
  const eReport = await at$(CLEAR + 5500, () => E.sync.syncWith(store, TAG, "eeeeeeee", {}, undefined));
  eq(E.progress.allEvidence().map((r) => r.concept), ["w:fiets"], "a new device: only the later answer");
  // Its count, from what the sync merged as progress settles it (what the clear covers left out), is the device's own: 1, not every row it read.
  eq([eReport.progress.count, await E.sync.localCount("progress")], [1, 1], "the sync's count of E's answers");
  const eFiles = [...store.files.keys()].filter((n) => n.endsWith(".eeeeeeee.json") && !n.includes(".clears."));
  eq(eFiles.flatMap((n) => Object.values(recordsIn(store, n)).map((r) => r.value.concept)), ["w:fiets"], "and its own files carry nothing it covers");
  const [onB] = at$(CLEAR + 6000, () => B.progress.clearedProgress());
  eq(onB?.rows, cleared, "B can undo the whole clear (its own away answer too)");
  eq(onB?.until, onB.at + 7 * DAY, "for 7 days");
});

await test("progress: Undo on the other device brings it all back everywhere, replayed the same on both", async () => {
  const CLEAR = T0 + 40 * DAY;
  const [onB] = at$(CLEAR + 7000, () => B.progress.clearedProgress());
  const back = await at$(CLEAR + 7000, () => B.progress.undoClear(onB.id));
  eq(back, cleared, "all back on B");
  await at$(CLEAR + 8000, syncB);
  await at$(CLEAR + 9000, syncA);
  const [pa, pb] = [picture(A, CLEAR + DAY), picture(B, CLEAR + DAY)];
  eq(pa.rows.length, cleared + 1, "A has them all, with the later answer");
  eq(pa.rows, pb.rows, "the same rows on both");
  eq(pa.units, pb.units, "replayed the same on both");
  ok(pa.rows.some((r) => r.concept === "w:offline"), "B's away answer reached A");
  eq(at$(CLEAR + 10000, () => A.progress.clearedProgress()), [], "nothing left to undo");
});

await test("progress: Undo brings back a row the clearing device only met in a file nobody changed since", async () => {
  const CLEAR = T0 + 45 * DAY;
  // A device that's gone left a row in its file; F has never synced.
  const s = memoryStore();
  const gone$ = { at: CLEAR - DAY, v: 2, lang: "nl", concept: "w:verloren", skill: "read", outcome: "right", test: "recall", help: "none", activity: "test", uid: "abcdabcdabcdabcd" };
  const key = A.progress.evidenceKey(gone$);
  s.files.set(`lexicommons-progress.${key.slice(0, 7)}.${TAG}.dddddddd.json`, { version: "v0", text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "progress", account: TAG, records: { [key]: { at: gone$.at, value: gone$ } } }) });
  const F = await device("f");
  await F.progress.loadProgress();
  answer(F, CLEAR - 2 * DAY, "w:eigen");
  await at$(CLEAR, () => F.progress.clearProgress({ everywhere: true }));
  const remembered = {};
  await at$(CLEAR + 1000, () => F.sync.syncWith(s, TAG, "ffffffff", remembered, undefined));
  eq(F.progress.allEvidence().length, 0, "cleared, the gone device's row too");
  const [batch] = at$(CLEAR + 2000, () => F.progress.clearedProgress()).filter((b) => b.rows === 2);
  ok(batch, "both rows kept for Undo");
  await at$(CLEAR + 3000, () => F.progress.undoClear(batch.id));
  await at$(CLEAR + 4000, () => F.sync.syncWith(s, TAG, "ffffffff", remembered, undefined));
  eq(F.progress.allEvidence().map((r) => r.concept).sort(), ["w:eigen", "w:verloren"], "both back, though that file never changed");
});

await test("progress: a later clear keeps what it covers for its own 7 days; a late answer can't undo an Undo", async () => {
  const G = await device("g");
  await G.progress.loadProgress();
  const C1 = T0 + 60 * DAY;
  answer(G, C1 - DAY, "w:een");
  await at$(C1, () => G.progress.clearProgress({ everywhere: true }));
  answer(G, C1 + DAY, "w:twee");
  // Day 6: another device clears everywhere; G hears of it only from the account, on day 8, when the first clear's 7
  // days are up and the second's aren't: what both cover is the second's now, so nothing goes.
  await at$(C1 + 6 * DAY, () => clearsApi.addClear(env, USER, { id: "6666666666666666", before: C1 + 6 * DAY }));
  await at$(C1 + 8 * DAY, () => G.progress.refreshClears());
  const [second] = at$(C1 + 8 * DAY, () => G.progress.clearedProgress());
  eq(second?.rows, 2, "both answers kept, under the later clear");
  // A slow answer from the account, from before an Undo, arrives after it: the Undo stands.
  const listed = await clearsApi.listClears(env, USER);
  await at$(C1 + 8 * DAY, () => G.progress.undoClear(second.id));
  eq(G.progress.allEvidence().map((r) => r.concept), ["w:twee"], "the second clear undone (the first still covers its own)");
  account.stale = listed;
  await at$(C1 + 8 * DAY + 1000, () => G.progress.refreshClears());
  eq(G.progress.allEvidence().map((r) => r.concept), ["w:twee"], "a late answer didn't bring the clear back");
});

await test("progress: kept rows go only once the account says the clear is final (no Undo can still land)", async () => {
  const H = await device("h");
  await H.progress.loadProgress();
  const C = T0 + 80 * DAY;
  answer(H, C - DAY, "w:laat");
  await at$(C, () => H.progress.clearProgress({ everywhere: true }));
  const [batch] = at$(C + 1000, () => H.progress.clearedProgress());
  // Just past Undo's 7 days (an Undo sent a moment ago may still be landing): nothing goes yet.
  await at$(C + 7 * DAY + 60_000, () => H.progress.refreshClears());
  eq(H.progress.clearedProgress(C + 1000)[0]?.rows, 1, "still kept");
  await at$(C + 7 * DAY + 60_000, () => clearsApi.undoClear(env, USER, batch.id)).then(
    () => ok(false, "an Undo past its days was taken"),
    (error) => ok(/7 days/.test(error.message), error.message),
  );
  // Undo's days are judged when the account writes it, not only when it reads.
  const listed = (await clearsApi.listClears(env, USER)).find((c) => c.id === batch.id);
  eq([listed.undone, listed.final], [false, false], "in force, not yet final");
  await at$(C + 7 * DAY + 60_000, () => H.progress.undoClear(batch.id)).catch(() => {});
  await at$(C + 8 * DAY, () => H.progress.refreshClears());
  eq(H.progress.clearedProgress(C + 1000), [], "final: the kept rows are gone");
});

await test("progress: past 7 days a clear can't be undone, and it stays in force", async () => {
  const CLEAR = T0 + 50 * DAY;
  answer(A, CLEAR - 1000, "w:kat");
  await at$(CLEAR, () => A.progress.clearProgress({ everywhere: true }));
  eq(at$(CLEAR + 6 * DAY, () => A.progress.clearedProgress()).length, 1, "within 7 days");
  eq(at$(CLEAR + 8 * DAY, () => A.progress.clearedProgress()).length, 0, "after 7 days");
  eq(A.progress.allEvidence().length, 0, "cleared");
});

// ---------- your packs ----------

const NL = JSON.parse(readFileSync(new URL("./fixtures/packs/check-nl.json", import.meta.url), "utf8"));
const PA = await device("pa");
const PB = await device("pb");
for (const d of [PA, PB]) {
  await d.packs.loadPacks();
  d.packs.setPacksAccount("acct-1");
  d.packs.setRelayLatest(100);
}
const packStore = memoryStore();
const packRemembered = { a: {}, b: {} };
const syncPA = () => PA.sync.syncWith(packStore, TAG, DA, packRemembered.a, undefined);
const syncPB = () => PB.sync.syncWith(packStore, TAG, DB, packRemembered.b, undefined);
const packOf = (d) => d.packs.yourPack("check-nl");

await test("packs: one order: the copy further along the relay wins whatever the clocks say, then more edits since; any merge order ends the same", async () => {
  const { preferPack } = PA.packs;
  const copy = (through, edits, t, changes = []) => ({ at: t, value: { through, edits, changes } });
  const ahead = copy(9, 0, 1000);
  const behind = copy(7, 0, 9000);
  eq(preferPack(ahead, behind), ahead, "further along, though older by the clock");
  eq(preferPack(behind, ahead), ahead, "either way round");
  const deleted = { at: 500, gone: true, about: { changes: [], edits: 1, through: 7 } };
  eq(preferPack(deleted, behind), deleted, "a delete made here beats the copy it deleted, though older by the clock");
  const again = copy(7, 2, 400);
  eq(preferPack(again, deleted), again, "made again after the delete");
  // Codex's case: any three, merged in any order, give one winner.
  const three = [copy(5, 0, 100, ["chg_a"]), copy(6, 0, 1, ["chg_a", "chg_b"]), copy(5, 0, 50, ["chg_c"]), { at: 70, gone: true, about: { changes: [], edits: 0, through: 6 } }];
  const fold = (list) => list.reduce((x, y) => preferPack(x, y));
  const winners = new Set();
  const permute = (list, done = []) => (list.length ? list.forEach((x, i) => permute([...list.slice(0, i), ...list.slice(i + 1)], [...done, x])) : winners.add(canonical(fold(done))));
  permute(three);
  eq(winners.size, 1, "one winner over every order");
});

await test("packs: a pack reaches the other device; deleted on one, it stays deleted; made again, it comes back", async () => {
  const saved = await PA.packs.savePack(NL, { by: "test", change: "chg_aaaa", through: 7, applied: "chg_aaaa" });
  ok(saved.ok, JSON.stringify(saved.errors));
  await syncPA();
  await syncPB();
  eq(packOf(PB), packOf(PA), "B has A's copy");
  // A deletes it while the relay can't be reached (an edit made here).
  await PA.packs.deletePack("check-nl");
  await syncPA();
  await syncPB();
  ok(!packOf(PB), "gone from B");
  for (let i = 0; i < 2; i++) {
    await syncPB();
    await syncPA();
  }
  ok(!packOf(PA) && !packOf(PB), "still gone on both");
  // Made again on B (a copy from Explore): it follows the delete, so it wins it.
  ok((await PB.packs.savePack(NL, { by: "copied" })).ok, "made again");
  await syncPB();
  await syncPA();
  ok(packOf(PA) && packOf(PB), "back on both");
  eq(packOf(PA).edits, 2, "two edits since the relay's change");
});

await test("packs: individually valid decks cannot overwrite a readable sync file with one past the read limit", async () => {
  const [QA, QB] = [await device("size-a"), await device("size-b")];
  for (const d of [QA, QB]) {
    await d.packs.loadPacks();
    d.packs.setPacksAccount("acct-1");
    d.packs.setRelayLatest(100);
  }
  const s = memoryStore();
  const remembered = {};
  const sync = () => QA.sync.syncWith(s, TAG, DA, remembered, undefined);
  const items = Array.from({ length: 1500 }, (_, i) => ({ id: `n${i}`, text: "é".repeat(400), means: "x".repeat(400) }));
  let previous;
  for (let i = 0; i < 20; i++) {
    const deck = { ...NL, id: `anki-size-${i}`, name: `Deck ${i}`, words: {}, topics: {}, chunks: {}, patterns: {}, items };
    const saved = await QA.packs.savePack(deck, { by: "An Anki deck" });
    ok(saved.ok, JSON.stringify(saved.errors));
    if (i === 0) {
      eq((await sync()).packs.error, null, "one deck fits");
      previous = s.files.get(own(DA, "packs"));
    }
  }
  const report = await sync();
  const uploaded = s.files.get(own(DA, "packs"));
  // Storage lists bytes, not characters: the accented text makes the difference matter.
  uploaded.size = new Blob([uploaded.text]).size;
  const received = await QB.sync.syncWith(s, TAG, DB, {}, undefined);
  ok(uploaded.size <= SYNC_LIMITS.fileBytes, `uploaded ${uploaded.size} bytes; a fresh device took ${received.packs.took} packs`);
  ok(/too big/.test(report.packs.error ?? ""), `the oversized file is reported: ${report.packs.error}`);
  eq(report.packs.sent, 0, "nothing sent");
  ok(uploaded === previous, "the previous readable file stays");
  eq(received.packs.took, 1, "a fresh device can still take the previous file");
  for (let i = 0; i < 20; i++) ok(QA.packs.yourPack(`anki-size-${i}`), `deck ${i} stays on the writer`);
  const empty = memoryStore();
  const first = await QA.sync.syncWith(empty, TAG, DA, {}, undefined);
  ok(first.packs.error && first.packs.sent === 0 && empty.writes === 0, "an oversized first upload is refused too");
  for (let i = 1; i < 20; i++) await QA.packs.deletePack(`anki-size-${i}`);
  eq((await sync()).packs.error, null, "sync can write again once the file fits");
  await QB.sync.syncWith(s, TAG, DB, {}, undefined);
  ok(QB.packs.yourPack("anki-size-0") && !QB.packs.yourPack("anki-size-1"), "the smaller file reaches the other device");
});

await test("packs: a copy past the relay's furthest change isn't taken, and a crafted one can't hold a pack", async () => {
  const mine = packOf(PB);
  const crafted = { ...packOf(PA), through: 1_000_000_000, changes: [...packOf(PA).changes, "chg_forged"], changedAt: mine.changedAt + 1 };
  const craftedFile = (value) => JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "packs", account: TAG, records: { "check-nl": { at: value.changedAt, value } } });
  packStore.files.set(`lexicommons-packs.${TAG}.dddddddd.json`, { version: "v0", text: craftedFile(crafted) });
  const report = await syncPB();
  eq(report.packs.took, 0, "not taken");
  eq(packOf(PB), mine, "B's copy is its own");
  ok(!JSON.stringify(recordsIn(packStore, `lexicommons-packs.${TAG}.${DB}.json`)).includes("chg_forged"), "and so is its file");
  // Dated far ahead, it waits; it can't win by its time.
  packStore.files.set(`lexicommons-packs.${TAG}.dddddddd.json`, { version: "v1", text: craftedFile({ ...crafted, through: 5, changedAt: NOW + 1e10 }) });
  eq((await syncPB()).packs.took, 0, "a copy from the future isn't taken");
  // A real change from your AI on A reaches B, past the crafted copies.
  const real = await PA.packs.savePack({ ...NL, name: "Renamed" }, { by: "test", change: "chg_real", through: 9, applied: "chg_real" });
  ok(real.ok, "a real change");
  await syncPA();
  await syncPB();
  eq(packOf(PB).pack.name, "Renamed", "the real change is on B");
  eq(packOf(PA).pack.name, "Renamed", "and stays on A");
});

await test("packs: a copy the device can't take yet (the relay's furthest change not heard of) is taken once it is", async () => {
  const PC = await device("pc");
  await PC.packs.loadPacks();
  PC.packs.setPacksAccount("acct-1");
  const remembered = {};
  let asked = 0;
  PC.packs.setRelayAsk(() => asked++);
  await PC.sync.syncWith(packStore, TAG, DC, remembered, undefined);
  ok(!PC.packs.yourPack("check-nl"), "not before the relay says how far it's got");
  eq(asked, 1, "it asked the account");
  PC.packs.setRelayLatest(100);
  await PC.sync.syncWith(packStore, TAG, DC, remembered, undefined);
  eq(PC.packs.yourPack("check-nl")?.pack.name, "Renamed", "taken after");
});

await test("pack inbox: a storage copy past 50 changes keeps its latest title when the backlog arrives", async () => {
  const [A, B] = [await device("backlog-a"), await device("backlog-b")];
  const { applyChange } = await import(moduleOf("study/pack-authoring.js", A.name));
  for (const d of [A, B]) {
    await d.packs.loadPacks();
    d.packs.setPacksAccount("acct-1");
    d.packs.setRelayLatest(60);
  }
  ok((await A.packs.savePack(NL)).ok, "A has the pack");
  const changes = [];
  for (let seq = 1; seq <= 60; seq++) {
    const change = seq === 1 || seq === 60
      ? { kind: "edit", name: seq === 1 ? "Old title" : "Latest title" }
      : { kind: "add", items: [{ id: `backlog-${seq}`, text: `kaart ${seq}`, means: `card ${seq}` }] };
    const id = `chg_backlog${seq}`;
    const next = applyChange(A.packs.yourPack(NL.id).pack, change);
    ok(next.pack, JSON.stringify(next.problems));
    const saved = await A.packs.savePack(next.pack, { by: "test", change: id, through: seq, applied: id });
    ok(saved.ok, JSON.stringify(saved.errors));
    changes.push({ id, seq, packId: NL.id, kind: change.kind, change, source: "device:A", said: "changed the pack" });
  }
  // B gets A's latest copy through storage before taking any of the relay's backlog.
  const store = memoryStore();
  await A.sync.syncWith(store, TAG, DA, {}, undefined);
  await B.sync.syncWith(store, TAG, DB, {}, undefined);
  const copy = plain(B.packs.yourPack(NL.id));
  eq(copy.changes.length, 50, "only the last 50 ids remain");
  ok(!copy.changes.includes(changes[0].id), "the first change's id is gone");
  eq([copy.pack.name, copy.through], ["Latest title", 60], "B has the latest copy");
  const globals = Object.fromEntries(["fetch", "document", "addEventListener", "matchMedia", "lxThemeSheets", "CSSStyleSheet", "setTimeout", "clearTimeout"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const reports = [];
  let waiting = changes;
  try {
    globalThis.document = { hidden: true, documentElement: {}, addEventListener() {} };
    globalThis.addEventListener = () => {};
    globalThis.matchMedia = () => ({ matches: false });
    globalThis.lxThemeSheets = {};
    // theme.js makes its stylesheets when it loads; Node has none, and this test never draws one.
    globalThis.CSSStyleSheet = class { replaceSync() {} };
    globalThis.setTimeout = () => 0;
    globalThis.clearTimeout = () => {};
    globalThis.fetch = async (url, init = {}) => {
      const path = String(url);
      let body = {};
      if (path === "/api/packs/device") body = { latest: 60 };
      else if (path.startsWith("/api/packs/inbox?")) {
        body = { changes: waiting };
        waiting = [];
      } else if (/^\/api\/packs\/changes\/[^/]+\/report$/.test(path)) reports.push(JSON.parse(init.body));
      else if (!path.startsWith("/api/packs/copies/")) throw new Error(`not here: ${path}`);
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const inbox = await import(moduleOf("study/pack-inbox.js", B.name));
    inbox.startPackInbox({ account: "acct-1" });
    await inbox.checkPackInbox();
    ok(inbox.packInboxStatus().ok, inbox.packInboxStatus().error);
    eq(B.packs.yourPack(NL.id).pack.name, "Latest title", "the backlog must not overwrite the latest title");
    eq(B.packs.yourPack(NL.id), copy, "the storage copy stays as it was");
    eq(reports.map((r) => r.state), changes.map(() => "applied"), "every change already covered is reported applied");
  } finally {
    for (const [key, descriptor] of Object.entries(globals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

await test("packs: a relay change arriving during a storage read stays on the device and in its file", async () => {
  const [SA, SB] = [await device("slow-a"), await device("slow-b")];
  for (const d of [SA, SB]) {
    await d.packs.loadPacks();
    d.packs.setPacksAccount("acct-1");
    d.packs.setRelayLatest(3);
  }
  ok((await SA.packs.savePack(NL, { by: "test", change: "chg_one", through: 1, applied: "chg_one" })).ok, "A has sequence 1");
  ok((await SB.packs.savePack({ ...NL, name: "Sequence two" }, { by: "test", change: "chg_two", through: 2, applied: "chg_two" })).ok, "B has sequence 2");
  const s = memoryStore();
  await SB.sync.syncWith(s, TAG, DB, {}, undefined);
  const read = s.read;
  s.read = async (name) => {
    const text = await read(name);
    if (name === own(DB, "packs")) {
      s.read = read;
      eq(packOf(SA).through, 1, "A still has sequence 1 when the download starts");
      // The inbox saves a later change while the storage's older copy is still on its way.
      ok((await SA.packs.savePack({ ...NL, name: "Sequence three" }, { by: "test", change: "chg_three", through: 3, applied: "chg_three" })).ok, "the relay reached sequence 3");
    }
    return text;
  };
  const remembered = {};
  const report = await SA.sync.syncWith(s, TAG, DA, remembered, undefined);
  eq(report.packs.error, null, "the sync finished");
  eq(packOf(SA).through, 3, "the storage read must not roll sequence 3 back to 2");
  eq(packOf(SA).pack.name, "Sequence three", "the relay's content stays");
  eq(recordsIn(s, own(DA, "packs"))["check-nl"].value.through, 3, "A's file has sequence 3 too");
  // The count Settings shows comes from what the sync merged, never what it read before the download: it's the device's own count now.
  eq(report.packs.count, await SA.sync.localCount("packs"), "the sync's count of A's packs");
  await SA.sync.syncWith(s, TAG, DA, remembered, undefined);
  eq(packOf(SA).through, 3, "still sequence 3 after another sync");
});

await test("packs: a pack a deletion from your storage took is kept 30 days and can be restored everywhere", async () => {
  // A crafted deletion of check-nl in a file, past what either device has.
  const here = packOf(PB);
  ok(here, "B has it");
  packStore.files.set(`lexicommons-packs.${TAG}.eeeeeeee.json`, { version: "v0", text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "packs", account: TAG, records: { "check-nl": { at: here.changedAt + 1, gone: true, about: { changes: here.changes, edits: here.edits + 5, through: here.through } } } }) });
  await syncPB();
  ok(!packOf(PB), "deleted on B");
  const [kept] = PB.packs.deletedElsewhere();
  eq([kept?.id, kept?.name], ["check-nl", here.pack.name], "kept to restore");
  ok(kept.until - kept.at >= 29 * DAY, "for 30 days");
  ok((await PB.packs.restorePack("check-nl")).ok, "restored");
  await syncPB();
  await syncPA();
  ok(packOf(PA) && packOf(PB), "back on both");
  eq(PB.packs.deletedElsewhere(), [], "nothing left to restore");
});

await test("packs: a pack the relay deleted, restored from a storage copy before the relay reached this device, goes when it does", async () => {
  const [RA, RB] = [await device("ra"), await device("rb")];
  for (const d of [RA, RB]) {
    await d.packs.loadPacks();
    d.packs.setPacksAccount("acct-1");
    d.packs.setRelayLatest(100);
  }
  const s = memoryStore();
  const r = { a: {}, b: {} };
  const [sa, sb] = [() => RA.sync.syncWith(s, TAG, DA, r.a, undefined), () => RB.sync.syncWith(s, TAG, DB, r.b, undefined)];
  for (const d of [RA, RB]) ok((await d.packs.savePack(NL, { by: "test", change: "chg_make", through: 10, applied: "chg_make" })).ok, "made through the relay");
  // The relay deletes it; A takes that first and syncs.
  await RA.packs.deletePack("check-nl", { through: 11, applied: "chg_gone" });
  await sa();
  await sb();
  ok(!RB.packs.yourPack("check-nl") && RB.packs.deletedElsewhere().length === 1, "gone from B, offered to restore");
  ok((await RB.packs.restorePack("check-nl")).ok, "restored on B");
  await sb();
  await sa();
  ok(RA.packs.yourPack("check-nl"), "the restore reached A");
  // B takes the relay's delete, as pack-inbox.js does.
  await RB.packs.deletePack("check-nl", { through: 11, applied: "chg_gone" });
  await sb();
  await sa();
  await sb();
  ok(!RA.packs.yourPack("check-nl") && !RB.packs.yourPack("check-nl"), "gone on both");
  eq(RB.packs.deletedElsewhere(), [], "nothing to restore on B");
  // A device that took the relay's deletion while the pack wasn't there: an older copy and another device's deletion
  // arriving later through the storage don't bring it back or offer to restore it.
  const RC = await device("rc");
  await RC.packs.loadPacks();
  RC.packs.setPacksAccount("acct-1");
  RC.packs.setRelayLatest(100);
  await RC.packs.deletePack("check-nl", { through: 11, applied: "chg_gone" });
  const s2 = memoryStore();
  const older = await device("rd");
  await older.packs.loadPacks();
  older.packs.setPacksAccount("acct-1");
  older.packs.setRelayLatest(100);
  ok((await older.packs.savePack(NL, { by: "test", change: "chg_make", through: 10, applied: "chg_make" })).ok, "an older copy elsewhere");
  await older.sync.syncWith(s2, TAG, "dddddddd", {}, undefined);
  await RC.sync.syncWith(s2, TAG, DC, {}, undefined);
  ok(!RC.packs.yourPack("check-nl"), "the older copy doesn't bring it back");
  await older.packs.deletePack("check-nl");
  await older.sync.syncWith(s2, TAG, "dddddddd", {}, undefined);
  await RC.sync.syncWith(s2, TAG, DC, {}, undefined);
  eq(RC.packs.deletedElsewhere(), [], "nothing offered to restore");
  ok(!(await RC.packs.restorePack("check-nl")).ok, "and none can be");
  // Another device restores it before the relay reaches it (so its copy wins here for now), then deletes it again:
  // still not offered here, since this device saw the relay delete it.
  const X = await device("rx");
  await X.packs.loadPacks();
  X.packs.setPacksAccount("acct-1");
  X.packs.setRelayLatest(100);
  ok((await X.packs.savePack(NL, { by: "test", change: "chg_make", through: 10, applied: "chg_make" })).ok, "X has it");
  const s3 = memoryStore();
  await RC.sync.syncWith(s3, TAG, DC, {}, undefined);
  await X.sync.syncWith(s3, TAG, "abababab", (X.r = {}), undefined);
  ok(X.packs.deletedElsewhere().length === 1 && (await X.packs.restorePack("check-nl")).ok, "X restored it");
  await X.sync.syncWith(s3, TAG, "abababab", X.r, undefined);
  await RC.sync.syncWith(s3, TAG, DC, (RC.r = {}), undefined);
  ok(RC.packs.yourPack("check-nl"), "X's restore reached this device");
  await X.packs.deletePack("check-nl");
  await X.sync.syncWith(s3, TAG, "abababab", X.r, undefined);
  await RC.sync.syncWith(s3, TAG, DC, RC.r, undefined);
  ok(!RC.packs.yourPack("check-nl"), "deleted again");
  eq(RC.packs.deletedElsewhere(), [], "and not offered to restore here");
});

await test("packs: a pack the relay deleted, made again by a later change that arrives through the storage, is an ordinary pack again", async () => {
  const [MA, MB] = [await device("ma"), await device("mb")];
  for (const d of [MA, MB]) {
    await d.packs.loadPacks();
    d.packs.setPacksAccount("acct-1");
    d.packs.setRelayLatest(100);
  }
  await MA.packs.deletePack("check-nl", { through: 11, applied: "chg_gone" });
  ok((await MB.packs.savePack(NL, { by: "test", change: "chg_again", through: 12, applied: "chg_again" })).ok, "made again at 12, on B");
  const s = memoryStore();
  const r = { a: {}, b: {} };
  await MB.sync.syncWith(s, TAG, DB, r.b, undefined);
  await MA.sync.syncWith(s, TAG, DA, r.a, undefined);
  ok(MA.packs.yourPack("check-nl"), "A took B's copy");
  // Deleted through the storage now (not the relay): A keeps it to restore.
  await MB.packs.deletePack("check-nl");
  await MB.sync.syncWith(s, TAG, DB, r.b, undefined);
  await MA.sync.syncWith(s, TAG, DA, r.a, undefined);
  eq(MA.packs.deletedElsewhere().map((p) => p.id), ["check-nl"], "restorable on A");
  ok((await MA.packs.restorePack("check-nl")).ok, "and restored");
});

await test("pack inbox: its next round isn't scheduled once the page is gone (no error from a timer after a test)", async () => {
  const real = { fetch: globalThis.fetch, document: globalThis.document, addEventListener: globalThis.addEventListener, matchMedia: globalThis.matchMedia };
  const errors = [];
  const caught = (error) => errors.push(String(error?.message ?? error));
  process.on("unhandledRejection", caught);
  // Only the browser's device label is stood in, as in the inbox test below.
  const label = registerHooks({
    load(url, context, next) {
      if (url === moduleOf("lx/look-sync.js", "inbox-page-gone")) return { format: "module", source: 'export const deviceLabel = () => "P, browser";', shortCircuit: true };
      return next(url, context);
    },
  });
  try {
    globalThis.document = { hidden: true, documentElement: {}, addEventListener() {} };
    globalThis.addEventListener = () => {};
    globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    globalThis.fetch = async () => Response.json({ changes: [] });
    const inbox = await import(moduleOf("study/pack-inbox.js", "inbox-page-gone"));
    inbox.startPackInbox({ account: "acct-page-gone" });
    // The page goes while its first round is still out.
    delete globalThis.document;
    await new Promise((resolve) => setTimeout(resolve, 200));
    eq(errors.filter((message) => /document/.test(message)), [], "the round's end schedules nothing without a page");
  } finally {
    label.deregister();
    process.off("unhandledRejection", caught);
    for (const [key, value] of Object.entries(real)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

await test("pack inbox: a missing pack doesn't delete another device's valid account copy", async () => {
  const relay = await import(join(APP, "src/packs.ts"));
  const { env, sqlite, row } = workerEnv();
  const user = "user-inbox";
  const [a, b] = ["device-inbox-a", "device-inbox-b"];
  sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(user, "Inbox", Date.now());
  for (const id of [a, b]) await relay.putDevice(env, user, id, id, []);
  await relay.putCopy(env, user, a, NL.id, { through: 0, pack: NL });
  const edited = await relay.editPack(env, user, "oauth:Test", { pack_id: NL.id, name: "Renamed" });
  ok(edited.ok, JSON.stringify(edited));
  const [change] = await relay.inbox(env, user, a);
  const A = await device("inbox-a");
  await A.packs.loadPacks();
  A.packs.setPacksAccount(user);
  // A applied the change and sent its copy before B, which has never had this pack, opens its inbox.
  ok((await A.packs.savePack({ ...NL, name: "Renamed" }, { by: "test", change: change.id, through: change.seq, account: user, applied: change.id })).ok, "applied on A");
  await relay.putCopy(env, user, a, NL.id, { through: change.seq, pack: A.packs.yourPack(NL.id).pack });
  await relay.report(env, user, a, change.id, { state: "applied" });
  const copy = row("SELECT pack, through FROM pack_copies WHERE user_id = ? AND pack_id = ?", user, NL.id);
  const real = { fetch, document: globalThis.document, addEventListener: globalThis.addEventListener, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const saved = stored.get("lx.pack-inbox.v1");
  // Only the browser's device label is stood in; the inbox and the relay run their own code.
  const label = registerHooks({
    load(url, context, next) {
      if (url === moduleOf("lx/look-sync.js", "inbox-b")) return { format: "module", source: 'export const deviceLabel = () => "B, browser";', shortCircuit: true };
      return next(url, context);
    },
  });
  try {
    stored.set("lx.pack-inbox.v1", JSON.stringify({ accounts: { [user]: { device: b } } }));
    globalThis.document = { hidden: true, addEventListener() {} };
    globalThis.addEventListener = () => {};
    // No timer of B's inbox may outlive the test: a pack change sets one for its next round, which would run against
    // a later test's stand-in server and report there (the grammar test's "no refusal was reported" failed that way).
    globalThis.setTimeout = () => 0;
    globalThis.clearTimeout = () => {};
    globalThis.fetch = async (url, init = {}) => {
      const path = new URL(url, "https://local.invalid");
      const body = init.body ? JSON.parse(init.body) : {};
      let answer;
      if (path.pathname === "/api/packs/device") answer = await relay.putDevice(env, user, body.device, body.label, body.packs, body.texts);
      else if (path.pathname === "/api/packs/inbox") answer = { changes: await relay.inbox(env, user, path.searchParams.get("device")) };
      else if (path.pathname === `/api/packs/copies/${NL.id}` && init.method === "DELETE") answer = await relay.deleteCopy(env, user, path.searchParams.get("device"), NL.id, Number(path.searchParams.get("through")));
      else if (path.pathname === `/api/packs/changes/${change.id}/report`) answer = await relay.report(env, user, body.device, change.id, body);
      else throw new Error(`unexpected request: ${init.method ?? "GET"} ${url}`);
      return Response.json(answer);
    };
    const inbox = await import(moduleOf("study/pack-inbox.js", "inbox-b"));
    inbox.startPackInbox({ account: user });
    await inbox.checkPackInbox();
    ok(inbox.packInboxStatus().ok, JSON.stringify(inbox.packInboxStatus()));
    eq(inbox.missingPacks().map((p) => p.id), [NL.id], "missing on B");
    eq(row("SELECT state FROM pack_deliveries WHERE change_seq = ? AND device_id = ?", change.seq, b).state, "missing", "B reported missing");
    eq(row("SELECT body FROM pack_changes WHERE id = ?", change.id).body, null, "the completed change's content is gone");
    eq(row("SELECT pack, through FROM pack_copies WHERE user_id = ? AND pack_id = ?", user, NL.id), copy, "A's account copy survives B's missing report");
    ok((await relay.editPack(env, user, "oauth:Test", { pack_id: NL.id, name: "Renamed again" })).ok, "a later AI edit still has its base");
  } finally {
    label.deregister();
    for (const [key, value] of Object.entries(real)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    if (saved === undefined) stored.delete("lx.pack-inbox.v1");
    else stored.set("lx.pack-inbox.v1", saved);
  }
});

await test("the account's clears: the limit holds for clears sent at once, and a clear sent again is the one recorded", async () => {
  const OTHER = "user-clears";
  sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(OTHER, "Clears", Date.now());
  const insert = sqlite.prepare("INSERT INTO progress_clears (user_id, id, before_at, at, undone) VALUES (?, ?, ?, ?, 0)");
  for (let i = 0; i < clearsApi.CLEAR_LIMITS.perAccount - 1; i++) insert.run(OTHER, i.toString(16).padStart(16, "0"), 1000, 1000);
  const ids = ["aaaaaaaaaaaaaaa1", "aaaaaaaaaaaaaaa2"];
  const results = await Promise.allSettled(ids.map((id) => clearsApi.addClear(env, OTHER, { id, before: Date.now() })));
  const n = sqlite.prepare("SELECT COUNT(*) AS n FROM progress_clears WHERE user_id = ?").get(OTHER).n;
  eq(n, clearsApi.CLEAR_LIMITS.perAccount, "no more than the limit");
  eq(results.filter((r) => r.status === "fulfilled").length, 1, "one of the two recorded");
  const recorded = results.find((r) => r.status === "fulfilled").value;
  eq(await clearsApi.addClear(env, OTHER, { id: recorded.id, before: 1 }), recorded, "sent again at the limit: the one recorded");
  await clearsApi.addClear(env, OTHER, { id: "bbbbbbbbbbbbbbbb", before: Date.now() + 2 * DAY }).then(
    () => ok(false, "a clear two days ahead was kept"),
    (error) => ok(/no later than a day/.test(error.message), error.message),
  );
});

await test("packs: a delete beats a copy of the same change from a device whose clock ran ahead", async () => {
  const [QA, QB] = [await device("qa"), await device("qb")];
  for (const d of [QA, QB]) {
    await d.packs.loadPacks();
    d.packs.setPacksAccount("acct-1");
    d.packs.setRelayLatest(100);
  }
  const s = memoryStore();
  const [sa, sb] = [() => QA.sync.syncWith(s, TAG, DA, (sa.r ??= {}), undefined), () => QB.sync.syncWith(s, TAG, DB, (sb.r ??= {}), undefined)];
  // Both take your AI's change; B's clock is ten minutes ahead.
  ok((await QA.packs.savePack(NL, { by: "test", change: "chg_both", through: 7, applied: "chg_both" })).ok, "A took it");
  ok((await at$(Date.now() + 600_000, () => QB.packs.savePack(NL, { by: "test", change: "chg_both", through: 7, applied: "chg_both" }))).ok, "B took it");
  // A deletes it (the relay out of reach), before B's copy's time.
  await QA.packs.deletePack("check-nl");
  await sa();
  await sb();
  await sa();
  ok(!QA.packs.yourPack("check-nl") && !QB.packs.yourPack("check-nl"), "gone on both");
});

await test("pack inbox: a grammar download's 503 leaves a valid update to retry after the grammar arrives", async () => {
  const d = await device("inbox-grammar");
  await d.packs.loadPacks();
  d.packs.setPacksAccount("acct-inbox");
  ok((await d.packs.savePack(NL, { by: "test" })).ok, "the pack is here");
  const grammar = await import(moduleOf("lang/grammar.js", d.name));
  const format = await import(moduleOf("study/pack-format.js", d.name));
  const next = structuredClone(grammar.seedGrammar("nl"));
  next.revision = 2;
  next.patterns["test-added"] = { name: "A new pattern", about: "A pattern published after this device's grammar.", after: [], source: { by: "A test", at: "2026-11-06" } };
  const checked = grammar.checkGrammar(next);
  ok(checked.grammar, JSON.stringify(checked.errors));
  const version = await grammar.grammarVersion(checked.grammar);
  const entry = grammar.grammarEntry(checked.grammar, version);
  const pack = d.packs.yourPack(NL.id).pack;
  const item = { ...pack.items[0], concepts: ["test-added"] };
  const updated = { ...pack, items: [item, ...pack.items.slice(1)] };
  const installed = d.packs.allPacks();
  ok(!format.checkPack(updated, { installed }).pack, "the old grammar doesn't know the pattern");
  const relayed = { id: "chg_grammar", packId: NL.id, kind: "update", seq: 1, source: "oauth:Test", said: "updated a sentence", change: { kind: "update", items: [item] } };
  const saved = Object.fromEntries(["fetch", "document", "addEventListener", "matchMedia", "setTimeout", "lxThemeSheets", "CSSStyleSheet"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const keptGrammar = stored.get("lx.grammar.v1");
  const reports = [];
  let downloads = 0;
  try {
    // Only the inbox runs: no page is drawn and no background poll is scheduled.
    globalThis.document = { hidden: true, documentElement: {}, addEventListener() {} };
    globalThis.addEventListener = () => {};
    globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
    globalThis.setTimeout = () => 0;
    globalThis.lxThemeSheets = {};
    // theme.js makes its stylesheets when it loads; Node has none, and this test never draws one.
    globalThis.CSSStyleSheet = class { replaceSync() {} };
    globalThis.fetch = async (url, init = {}) => {
      const path = String(url);
      const json = (body) => Response.json(body);
      if (path === "/library/catalogue.json") return json({ grammar: { nl: entry } });
      if (path === entry.url) return downloads++, new Response(null, { status: 503 });
      if (path === "/api/packs/device") return json({ latest: 1 });
      if (path.startsWith("/api/packs/inbox?")) return json({ changes: [relayed] });
      if (path === `/api/packs/copies/${NL.id}`) return json({ ok: true });
      if (path === `/api/packs/changes/${relayed.id}/report`) return reports.push(JSON.parse(init.body)), json({ ok: true });
      throw new Error(`not here: ${path}`);
    };
    const inbox = await import(moduleOf("study/pack-inbox.js", d.name));
    inbox.startPackInbox({ account: "acct-inbox" });
    await inbox.checkPackInbox();
    const before = await d.packs.keptChange(relayed.id);
    const reportsBefore = reports.length;
    ok(downloads > 0, "the grammar download failed with 503");
    ok(grammar.useGrammar(checked.grammar, version), "the grammar arrives later");
    const valid = format.checkPack(updated, { installed });
    ok(valid.pack, `the update now passes validation: ${JSON.stringify(valid.errors)}`);
    await inbox.checkPackInbox();
    eq(d.packs.yourPack(NL.id).pack.items[0].concepts, ["test-added"], "redelivery applies the update after the grammar arrives");
    eq(before.outcome, null, "the failed download left no final receipt");
    eq(reportsBefore, 0, "no refusal was reported to the relay");
    eq((await d.packs.keptChange(relayed.id)).outcome, "applied", "the retry is kept as applied");
    eq(reports.map((report) => report.state), ["applied"], "only the applied result is reported");
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    if (keptGrammar === undefined) stored.delete("lx.grammar.v1");
    else stored.set("lx.grammar.v1", keptGrammar);
  }
});

// ---------- blobs: files of their own, named by their content ----------

const MP3 = ["boek-gelezen.mp3", "morgen-oma.mp3", "denk-regent.mp3"].map((name) => new Uint8Array(readFileSync(join(APP, "public/audio/starter-word-order/emma", name))));
const clipOf = (bytes) => `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.mp3`;
/** A storage in memory that also keeps blobs (storage.js's readFile/writeFile for files that aren't JSON). */
function blobStore() {
  const store = memoryStore();
  let n = 0;
  store.writeBlob = async (name, blob, { version } = {}) => {
    const hook = store.beforeWrite;
    store.beforeWrite = null;
    await hook?.(name);
    const there = store.files.get(name);
    if (version !== undefined && (version === null ? there : there?.version !== version)) {
      const error = new Error("conflict");
      error.conflict = true;
      throw error;
    }
    store.writes++;
    store.files.set(name, { blob, size: blob.size, version: `b${++n}` });
    return { version: `b${n}` };
  };
  store.readBlob = async (name) => {
    store.reads++;
    return store.files.get(name).blob;
  };
  return store;
}
/** A blob kind in memory: what it has (name → Blob) and wants; check and keep take only bytes that hash to their name. */
function clipKind(have = new Map(), want = []) {
  const kind = {
    id: "clip",
    names: /^[0-9a-f]{16}\.(?:mp3|m4a)$/,
    have,
    want,
    refreshed: 0,
    refresh: async () => void kind.refreshed++,
    wanted: () => want,
    has: (name) => have.has(name),
    read: async (name) => have.get(name) ?? null,
    check: async (name, blob) => clipOf(new Uint8Array(await blob.arrayBuffer())) === name,
    keep: async (name, blob) => {
      if (!(await kind.check(name, blob))) return false;
      have.set(name, blob);
      return true;
    },
  };
  return kind;
}
const none = { up: 0, down: 0, repaired: 0, refused: 0, error: null };
const blobFile = (name, tag = TAG) => `lexicommons-clip.${tag}.${name}`;

await test("blobs: written once by a device that has one, read by one that hasn't, kept only when its bytes are its name", async () => {
  const store = blobStore();
  const [x, y, z] = MP3.map(clipOf);
  // A name that isn't a clip's (a path, say) is never written or read, even one the device holds.
  const a = clipKind(new Map([[x, new Blob([MP3[0]])], [y, new Blob([MP3[1]])], ["../escape.mp3", new Blob([MP3[2]])]]), [x, y, z, "../escape.mp3", x]);
  const report = await syncWith(store, TAG, DA, {}, [], NOW, [a]);
  eq(report["blobs:clip"], { ...none, up: 2 });
  eq(a.refreshed, 1, "what's here is learned again first");
  eq([...store.files.keys()].sort(), [blobFile(x), blobFile(y)].sort());
  // Nothing new: nothing written again.
  const writes = store.writes;
  await syncWith(store, TAG, DA, {}, [], NOW, [a]);
  eq(store.writes, writes, "written once");
  // Another device wants them: read and kept, the same bytes.
  const b = clipKind(new Map(), [x, y, z]);
  const rememberedB = {};
  eq((await syncWith(store, TAG, DB, rememberedB, [], NOW, [b]))["blobs:clip"], { ...none, down: 2 });
  eq(new Uint8Array(await b.have.get(y).arrayBuffer()), MP3[1]);
  ok(!b.have.has(z), "one nobody has stays missing");
  // A file whose bytes aren't its name (written by anyone with the storage) is never kept, nor read again until it changes.
  store.files.set(blobFile(z), { blob: new Blob([MP3[0]]), size: MP3[0].byteLength, version: "crafted" });
  eq((await syncWith(store, TAG, DB, rememberedB, [], NOW, [b]))["blobs:clip"].refused, 1);
  ok(!b.have.has(z), "not kept");
  const before = store.reads;
  eq((await syncWith(store, TAG, DB, rememberedB, [], NOW, [b]))["blobs:clip"], none);
  eq(store.reads, before, "not read again");
  // Too big to read: refused without reading it.
  const big = "ffffffffffffffff.mp3";
  store.files.set(blobFile(big), { blob: new Blob([MP3[0]]), size: SYNC_LIMITS.blobBytes + 1, version: "big" });
  const reads = store.reads;
  const c = clipKind(new Map(), [big]);
  eq((await syncWith(store, TAG, DC, {}, [], NOW, [c]))["blobs:clip"].refused, 1);
  eq(store.reads, reads, "not read");
  // Another account's file of the same name is never read.
  const other = blobStore();
  other.files.set(blobFile(x, "ffffffff"), { blob: new Blob([MP3[0]]), size: MP3[0].byteLength, version: "o" });
  const d = clipKind(new Map(), [x]);
  eq((await syncWith(other, TAG, DC, {}, [], NOW, [d]))["blobs:clip"], none);
  // Two devices writing the same one at once: the second finds it there, and that's no error.
  const both = blobStore();
  const e = clipKind(new Map([[x, new Blob([MP3[0]])]]), [x]);
  both.beforeWrite = (name) => both.files.set(name, { blob: new Blob([MP3[0]]), size: MP3[0].byteLength, version: "first" });
  eq((await syncWith(both, TAG, DA, {}, [], NOW, [e]))["blobs:clip"], none);
  // A storage that fails says so, for that kind alone.
  const down = blobStore();
  down.writeBlob = async () => {
    throw new Error("the storage is down");
  };
  eq((await syncWith(down, TAG, DA, {}, [], NOW, [e]))["blobs:clip"].error, "the storage is down");
});

await test("blobs: a file that isn't what its name says is put right by a device that has it, read at most once a version", async () => {
  const store = blobStore();
  const [x, y] = MP3.map(clipOf);
  const holder = clipKind(new Map([[x, new Blob([MP3[0]])], [y, new Blob([MP3[1]])]]), [x, y]);
  const remembered = {};
  // Another size than the clip here: put right without reading it. The same size: read, found wrong, put right.
  store.files.set(blobFile(x), { blob: new Blob([MP3[2]]), size: MP3[2].byteLength, version: "bad-1" });
  const sameSize = new Uint8Array(MP3[1]);
  sameSize[sameSize.length - 1] ^= 0xff;
  store.files.set(blobFile(y), { blob: new Blob([sameSize]), size: sameSize.byteLength, version: "bad-2" });
  let reads = store.reads;
  eq((await syncWith(store, TAG, DA, remembered, [], NOW, [holder]))["blobs:clip"], { ...none, repaired: 2 });
  eq(store.reads - reads, 1, "only the one of the same size was read");
  for (const [name, bytes] of [[x, MP3[0]], [y, MP3[1]]]) eq(new Uint8Array(await store.files.get(blobFile(name)).blob.arrayBuffer()), bytes, `${name} put right`);
  // Checked or written here: not read again. One another device wrote is read once, then remembered.
  reads = store.reads;
  await syncWith(store, TAG, DA, remembered, [], NOW, [holder]);
  eq(store.reads, reads, "nothing read again");
  store.files.set(blobFile(x), { blob: new Blob([MP3[0]]), size: MP3[0].byteLength, version: "by-another-device" });
  await syncWith(store, TAG, DA, remembered, [], NOW, [holder]);
  await syncWith(store, TAG, DA, remembered, [], NOW, [holder]);
  eq(store.reads - reads, 1, "read once");
  // What's remembered of a blob no longer wanted goes.
  holder.want = [y];
  holder.wanted = () => holder.want;
  await syncWith(store, TAG, DA, remembered, [], NOW, [holder]);
  eq(Object.keys(remembered).filter((f) => f.startsWith("lexicommons-clip.")), [blobFile(y)]);
});

await test("blobs: no more read in one sync than the limit, the rest at the next; one over the kind's size refused unread", async () => {
  const store = blobStore();
  const names = MP3.map(clipOf);
  for (const [n, name] of names.entries()) store.files.set(blobFile(name), { blob: new Blob([MP3[n]]), size: MP3[n].byteLength, version: `v${n}` });
  const reader = clipKind(new Map(), names);
  const limit = SYNC_LIMITS.blobReads;
  try {
    SYNC_LIMITS.blobReads = 2;
    const remembered = {};
    eq((await syncWith(store, TAG, DB, remembered, [], NOW, [reader]))["blobs:clip"].down, 2);
    eq((await syncWith(store, TAG, DB, remembered, [], NOW, [reader]))["blobs:clip"].down, 1);
  } finally {
    SYNC_LIMITS.blobReads = limit;
  }
  // Right, but not kept here for a moment (Cache Storage full, say): read again at the next sync, and kept then.
  const full = clipKind(new Map(), [names[0]]);
  const keep = full.keep;
  full.keep = async () => false;
  const rememberedFull = {};
  eq((await syncWith(store, TAG, DA, rememberedFull, [], NOW, [full]))["blobs:clip"], none);
  full.keep = keep;
  eq((await syncWith(store, TAG, DA, rememberedFull, [], NOW, [full]))["blobs:clip"].down, 1);
  ok(full.have.has(names[0]), "kept the second time");
  const small = { ...clipKind(new Map(), [names[0]]), maxBytes: 10 };
  const reads = store.reads;
  eq((await syncWith(store, TAG, DC, {}, [], NOW, [small]))["blobs:clip"].refused, 1);
  eq(store.reads, reads, "not read");
});

/** Cache Storage in memory, one per device (each device's clips are its own). */
function cacheStorage() {
  const caches = new Map();
  return {
    async open(name) {
      if (!caches.has(name)) {
        // Keyed by path, as the app's addresses are; a Request (from keys) by its URL's path.
        const entries = new Map();
        const key = (url) => (typeof url === "string" ? url : new URL(url.url).pathname);
        caches.set(name, {
          keys: async () => [...entries.keys()].map((path) => new Request(`http://localhost${path}`)),
          put: async (url, response) => void entries.set(key(url), { blob: await response.blob(), headers: [...response.headers] }),
          match: async (url) => (entries.has(key(url)) ? new Response(entries.get(key(url)).blob, { headers: entries.get(key(url)).headers }) : undefined),
          delete: async (url) => entries.delete(key(url)),
        });
      }
      return caches.get(name);
    },
  };
}
const QA = { ...(await device("qa")), caches: cacheStorage() };
const QB = { ...(await device("qb")), caches: cacheStorage() };
for (const d of [QA, QB]) {
  d.clips = await import(moduleOf("study/clips.js", d.name));
  await d.packs.loadPacks();
  d.packs.setPacksAccount("acct-1");
  d.packs.setRelayLatest(100);
}
/** Runs fn as the device: its own Cache Storage. */
async function as(d, fn) {
  globalThis.caches = d.caches;
  try {
    return await fn();
  } finally {
    delete globalThis.caches;
  }
}
const clipStore = blobStore();
const clipRemembered = { a: {}, b: {} };

await test("your packs' recordings: a device that never had them gets them from your storage alone, checked, and offers only those it has", async () => {
  const [item] = NL.items;
  const clip = clipOf(MP3[0]);
  const audio = {
    format: "lexicommons-audio",
    version: 2,
    pack: NL.id,
    language: NL.language,
    voices: {
      emma: {
        name: "Emma",
        locale: "nl-NL",
        items: { [item.id]: { clip, seconds: 2, words: item.words.map((_, n) => [n * 0.3, n * 0.3 + 0.2]) } },
        words: { [item.words.find(([, lemma]) => lemma)[1]]: { clip: clipOf(MP3[1]), seconds: 0.8 } },
      },
    },
  };
  await as(QA, async () => {
    ok((await QA.packs.savePack(NL, { by: "test", change: "chg_rec1", through: 9, applied: "chg_rec1", audio })).ok, "saved with its recordings");
    // A keeps one of the two (the other never arrived here): only that one is offered.
    ok(!(await QA.clips.keepClip(clip, new Blob([MP3[1]]))), "bytes that aren't its name aren't kept");
    ok(await QA.clips.keepClip(clip, new Blob([MP3[0]])), "kept");
    const offered = QA.packs.packAudio(NL.id);
    ok(offered, "offered");
    eq(JSON.stringify(offered).includes(clipOf(MP3[1])), false, "the clip not here isn't offered");
    eq(JSON.stringify(offered).includes(clip), true, "the one here is");
    await QA.sync.syncWith(clipStore, TAG, DA, clipRemembered.a, undefined);
  });
  ok(clipStore.files.has(blobFile(clip)) && !clipStore.files.has(blobFile(clipOf(MP3[1]))), "only what A has is in your storage");
  await as(QB, async () => {
    await QB.clips.loadClips();
    ok(!QB.packs.packAudio(NL.id), "nothing on B yet");
    await QB.sync.syncWith(clipStore, TAG, DB, clipRemembered.b, undefined);
    eq(QB.packs.yourPack(NL.id)?.audio?.manifest?.voices?.emma?.name, "Emma", "B has the pack with its recordings");
    ok(QB.clips.hasClip(clip), "and the clip, from your storage");
    eq(new Uint8Array(await (await QB.clips.clipBlob(clip)).arrayBuffer()), MP3[0]);
    ok(JSON.stringify(QB.packs.packAudio(NL.id)).includes(clip), "offered on B");
    // Its Cache Storage says so after a restart too.
    eq(await QB.clips.loadClips(), 1);
    ok(QB.clips.hasClip(clip), "still here");
  });
  // A clip written into your storage under its name with other bytes never reaches B.
  const other = clipOf(MP3[1]);
  clipStore.files.set(blobFile(other), { blob: new Blob([MP3[2]]), size: MP3[2].byteLength, version: "crafted" });
  await as(QB, async () => {
    const report = await QB.sync.syncWith(clipStore, TAG, DB, clipRemembered.b, undefined);
    eq(report["blobs:clip"].refused, 1);
    ok(!QB.clips.hasClip(other), "not kept");
  });
});

await test("your recordings on a device: only audio is kept, a lost one is noticed, fetching says here, gone or failed, unnamed ones go after an hour, all with the packs", async () => {
  const C = QA.clips;
  await as(QA, async () => {
    // Bytes named by their own hash, but not audio: never kept.
    const words = new TextEncoder().encode("not a recording at all, only words. ".repeat(50));
    ok(!(await C.keepClip(clipOf(words), new Blob([words]))), "words aren't kept as a recording");
    // A clip Cache Storage loses is noticed when it's looked for, and isn't offered after.
    const lost = clipOf(MP3[2]);
    ok(await C.keepClip(lost, new Blob([MP3[2]])), "kept");
    await (await caches.open("lx-audio-v1")).delete(`/api/packs/audio/${lost}`);
    ok(C.hasClip(lost), "still thought here");
    ok(!(await C.confirmClip(lost)) && !C.hasClip(lost), "found gone");
    // Fetching from where a change serves it: here, gone (a 404, or the wrong bytes), failed (no connection, a 500).
    const at = (clip) => `/api/packs/changes/chg_test/clips/${clip}`;
    served.set(at(lost), { status: 200, bytes: MP3[2] });
    eq(await C.fetchClip(lost, at(lost)), "here");
    eq(await C.fetchClip(lost, "/nowhere"), "here", "already here: not fetched");
    const missing = clipOf(MP3[1]);
    await (await caches.open("lx-audio-v1")).delete(`/api/packs/audio/${missing}`);
    await C.loadClips();
    eq(await C.fetchClip(missing, at(missing)), "gone", "a 404");
    served.set(at(missing), { status: 200, bytes: MP3[0] });
    eq(await C.fetchClip(missing, at(missing)), "gone", "the wrong bytes");
    served.set(at(missing), { status: 500 });
    eq(await C.fetchClip(missing, at(missing)), "failed", "the server's trouble");
    account.down = true;
    try {
      eq(await C.fetchClip(missing, at(missing)), "failed", "no connection");
    } finally {
      account.down = false;
    }
    // A clip nothing names goes, but not within the hour it was kept; one named stays.
    const named = clipOf(MP3[0]);
    ok(C.hasClip(named) && C.hasClip(lost), "both here");
    eq(await C.pruneClips(new Set([named])), 0, "kept within the hour");
    eq(await C.pruneClips(new Set([named]), { now: Date.now() + 2 * 3_600_000 }), 1);
    ok(C.hasClip(named) && !C.hasClip(lost) && !(await (await caches.open("lx-audio-v1")).match(`/api/packs/audio/${lost}`)), "the unnamed one is gone");
    // Clearing your packs (the account deleted) takes every recording of yours.
    await QA.packs.clearPacks();
    ok(!C.hasClip(named) && !(await (await caches.open("lx-audio-v1")).keys()).length, "none left");
  });
});

await test("your recordings in a deletion you can restore stay as long as it can be restored, and go with it after 30 days", async () => {
  const [item] = NL.items;
  const clip = clipOf(MP3[0]);
  const audio = { format: "lexicommons-audio", version: 2, pack: NL.id, language: NL.language, voices: { emma: { name: "Emma", locale: "nl-NL", items: { [item.id]: { clip, seconds: 2, words: item.words.map((_, n) => [n * 0.3, n * 0.3 + 0.2]) } }, words: {} } } };
  const store = blobStore();
  const realNow = Date.now;
  await as(QA, async () => {
    ok((await QA.packs.savePack(NL, { by: "test", change: "chg_rec9", through: 9, applied: "chg_rec9", audio })).ok, "saved");
    ok(await QA.clips.keepClip(clip, new Blob([MP3[0]])), "kept");
    // A deletion from the storage, past what A has: kept to restore, with its recordings.
    const here = QA.packs.yourPack(NL.id);
    store.files.set(`lexicommons-packs.${TAG}.eeeeeeee.json`, { version: "v0", text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "packs", account: TAG, records: { [NL.id]: { at: here.changedAt + 1, gone: true, about: { changes: here.changes, edits: here.edits + 5, through: here.through } } } }) });
    await QA.sync.syncWith(store, TAG, DA, {}, undefined);
    ok(!QA.packs.yourPack(NL.id) && QA.packs.deletedElsewhere().length === 1, "deleted, and restorable");
    const later = realNow() + 2 * 3_600_000;
    eq(await QA.packs.pruneRecordings({ now: later }), 0, "its recordings stay while it can be restored");
    ok(QA.clips.hasClip(clip), "still here");
    // 31 days on: no longer restorable, and its recordings go.
    const away = realNow() + 31 * DAY;
    Date.now = () => away;
    try {
      // Before the page trims what it keeps of the deletion, and after.
      eq(QA.packs.deletedElsewhere(away), [], "no longer restorable");
      eq(await QA.packs.pruneRecordings({ now: away }), 1);
      ok(!QA.clips.hasClip(clip), "gone");
      await QA.packs.loadPacks();
      ok(await QA.clips.keepClip(clip, new Blob([MP3[0]])), "kept again");
      eq(await QA.packs.pruneRecordings({ now: away + 2 * 3_600_000 }), 1, "and once trimmed, the deletion names it no more");
    } finally {
      Date.now = realNow;
    }
  });
});

await test("Undo's recordings stay while their pack is here, and go with a pack the relay deleted (nothing left to undo)", async () => {
  const [item] = NL.items;
  const manifest = (clip) => ({ format: "lexicommons-audio", version: 2, pack: NL.id, language: NL.language, voices: { emma: { name: "Emma", locale: "nl-NL", items: { [item.id]: { clip, seconds: 2, words: item.words.map((_, n) => [n * 0.3, n * 0.3 + 0.2]) } }, words: {} } } });
  const [now, before] = [clipOf(MP3[0]), clipOf(MP3[1])];
  const later = Date.now() + 2 * 3_600_000;
  await as(QA, async () => {
    ok((await QA.packs.savePack(NL, { by: "test", change: "chg_rec20", through: 20, applied: "chg_rec20", audio: manifest(now) })).ok, "saved");
    // The change that set these recordings, as the inbox keeps it: Undo puts back the ones before.
    await QA.packs.keepChange({ id: "chg_rec20", packId: NL.id, kind: "audio", said: "recorded", source: "oauth:Claude", seq: 20, at: Date.now(), outcome: "applied", state: "applied", before: NL, beforeAudio: manifest(before), previous: null, errors: [], warnings: [] });
    ok((await QA.clips.keepClip(now, new Blob([MP3[0]]))) && (await QA.clips.keepClip(before, new Blob([MP3[1]]))), "both kept");
    eq(await QA.packs.pruneRecordings({ now: later }), 0, "the pack's and its Undo's stay");
    // The relay deletes the pack: not restorable, nothing to undo, so both go.
    await QA.packs.deletePack(NL.id, { through: 21, applied: "chg_rec21" });
    eq(QA.packs.deletedElsewhere(), [], "not restorable");
    eq(await QA.packs.pruneRecordings({ now: later }), 2);
    ok(!QA.clips.hasClip(now) && !QA.clips.hasClip(before), "both gone");
  });
});

await test("packs: a deck's cards reach the other device through your storage, and its sounds never leave the one that read it", async () => {
  const cards = [{ id: "n1", text: "het huis", means: "the house" }, { id: "n2", text: "de hond", means: "the dog" }];
  const deck = { ...structuredClone(NL), id: "anki-deck", name: "A deck", words: {}, topics: {}, chunks: {}, patterns: {}, items: cards };
  const saved = await PA.packs.savePack(deck, { by: "An Anki deck", sounds: { n1: "0123456789abcdef.mp3" } });
  ok(saved.ok, JSON.stringify(saved.errors));
  eq(PA.packs.packSounds("anki-deck")?.n1, "0123456789abcdef.mp3", "kept here");
  await syncPA();
  await syncPB();
  eq(PB.packs.yourPack("anki-deck")?.pack.items.length, 2, "the cards reached the other device");
  eq(PB.packs.packSounds("anki-deck"), null, "no sounds there");
  ok(![...packStore.files.values()].some((file) => String(file.text).includes("0123456789abcdef")), "no sound's name in your storage");
  // A newer copy coming back doesn't take the sounds from the device that has them.
  const renamed = { ...PB.packs.yourPack("anki-deck").pack, name: "A renamed deck" };
  ok((await PB.packs.savePack(renamed, { by: "An Anki deck" })).ok, "changed there");
  await syncPB();
  await syncPA();
  eq(PA.packs.yourPack("anki-deck")?.pack.name, "A renamed deck", "the change came back");
  eq(PA.packs.packSounds("anki-deck")?.n1, "0123456789abcdef.mp3", "and the sounds stayed");
  await PA.packs.deletePack("anki-deck");
  await syncPA();
  await syncPB();
  eq(PB.packs.yourPack("anki-deck"), null, "deleted there too");
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
