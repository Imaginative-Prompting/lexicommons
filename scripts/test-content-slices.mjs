// What studying draws on, worked out a piece at a time while a sync brings new packs (study/content.js prepare, study/packs.js ensure and
// syncNow, know/slices.js), on the real path-nl and every Dutch word band, served as the library serves them: the view the slices build is
// the view built at once, export by export; each pack's check in slices is checkPack's, byte for byte (and a planted bad pack refused the
// same); nothing reads half a view while it's worked out (and a half view planted is caught); a change while it's worked out drops it and
// the view is the newer one; a batch of packs (packsBatch, the relay's round) told once, its view worked out in slices; a pack turned on or
// off, or another language, still changes the view at once; and the sync's longest task
// beside the longest a whole view takes here. A sync writes each pack's record from a worker as the bytes it hashed (packs.js putLibrary,
// pack-put-worker.js): no record over 64 KB put from the page, what's stored the pack itself (with no worker, the page's puts caught: the
// control), and a reload straight after a sync reading the new record (a worker that answers before it writes: the control, read too early).
// In Node, the catalog and its files stood in, and IndexedDB and the workers (fixtures/stand-in-idb.mjs).  node scripts/test-content-slices.mjs (exit 0 = pass)
import "./fixtures/library-grammar.mjs";
import { standInIndexedDB } from "./fixtures/stand-in-idb.mjs";
import { isDeepStrictEqual } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const memory = new Map();
globalThis.localStorage ??= { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };

const HERE = dirname(fileURLToPath(import.meta.url));
// IndexedDB as a browser has it (a put serializes where it's called: who wrote what is told), before packs.js first opens it, and the page's
// workers run here on the same store: the put worker writing as the worker, the hash worker reading. putMode "early": the put worker answers
// at once and writes only when the test lets it (a sync that would say it's done too soon: the reload test's control).
const puts = [];
const idb = standInIndexedDB({ onPut: (put) => puts.push(put) });
globalThis.indexedDB = idb.page;
const { putRecord } = await import("../public/js/study/pack-put-worker.js");
const { hashRecords } = await import("../public/js/study/pack-hash-worker.js");
let putMode = "write";
const lateWrites = [];
class StandInWorker {
  constructor(url) {
    this.url = String(url);
  }
  postMessage(data, transfer = []) {
    // As a worker gets it: a copy, with what's transferred taken from the page.
    const message = structuredClone(data, { transfer });
    const reply = (answer) => setTimeout(() => this.onmessage?.({ data: answer }), 0);
    if (this.url.includes("pack-put-worker")) {
      const write = () => putRecord(message, idb.worker).then((answer) => ({ seq: message.seq, ...answer }), (error) => ({ seq: message.seq, error: String(error) }));
      if (putMode === "early") {
        // Held until the test lets it go (lateWrites), so nothing the sync does afterwards can outlast it.
        reply({ seq: message.seq, ok: true });
        lateWrites.push(write);
      } else write().then(reply);
    } else if (this.url.includes("pack-hash-worker")) hashRecords(message).then(reply, () => this.onerror?.(new Error("worker failed")));
    else setTimeout(() => this.onerror?.(new Error(`no stand-in for ${this.url}`)), 0);
  }
  terminate() {}
}
globalThis.Worker = StandInWorker;
const { BUILT_IN } = await import("../public/js/packs/index.js");
const format = await import("../public/js/study/pack-format.js");
const { catalogueEntry, checkPack, checkPackSteps, packText, packUrl, packVersion, withPackEntry } = format;
const packs = await import("../public/js/study/packs.js");
const { setLearning } = await import("../public/js/study/learning.js");
// Read through the module, never a copy: each change puts a whole new view in place.
const content = await import("../public/js/study/content.js");
const { whole } = await import("../public/js/know/slices.js");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
const same = (a, b, what) => {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  ok(x === y, `${what}: ${x.length} chars ≠ ${y.length} chars${x.length < 400 ? ` (${x} ≠ ${y})` : ""}`);
};

// Every export of the view, as it reads now (Maps and Sets as their entries, in order).
const EXPORTS = ["PACKS", "ITEMS", "LESSONS", "WORD_PACKS", "PATTERNS", "PATTERNS_IN_USE", "WORDS", "READINGS", "CHUNKS", "TOPICS", "itemById"];
const plain = (value) => (value instanceof Map ? [...value] : value instanceof Set ? [...value] : value);
const viewNow = () => ({ language: content.contentLanguage(), ...Object.fromEntries(EXPORTS.map((name) => [name, plain(content[name])])), describe: content.describe("p:verb-second"), stored: content.ITEMS.slice(0, 50).map((item) => content.storedSentence(item)) });
// A view's shape in a few numbers, and whether its parts belong together: what a reader between two slices would see.
const shapeOf = () => ({
  packs: content.PACKS.map((pack) => pack.id).join(","),
  items: content.ITEMS.length,
  lessons: content.LESSONS.length,
  words: Object.keys(content.WORDS).length,
  byId: content.itemById.size,
  inUse: content.PATTERNS_IN_USE.size,
  wordPacks: content.WORD_PACKS.length,
});
const whole_ = (shape) => shape.items === shape.byId && shape.packs.length > 0;

// The library: Dutch's word bands and its lessons, each checked as the library keeps it, at its version.
const read = (name) => JSON.parse(readFileSync(join(HERE, "../packs", name), "utf8"));
const bandNames = readdirSync(join(HERE, "../packs")).filter((name) => /^words-nl-\d+\.json$/.test(name)).sort();
const raws = [...bandNames.map(read), read("path-nl.json")];
const builtIn = BUILT_IN.map((pack) => ({ ...pack, builtIn: true }));
const served = new Map();
const checked = [];
let catalogue = { format: "lexicommons-catalogue", packs: {} };
for (const raw of raws) {
  const { pack, errors } = checkPack(raw, { installed: [...builtIn, ...checked.map((p) => ({ ...p, builtIn: true }))] });
  if (!pack) throw new Error(`${raw.id} doesn't pass the check: ${errors[0]?.message}`);
  checked.push(pack);
}
const publish = async (pack) => {
  const version = await packVersion(pack);
  served.set(packUrl(pack.id, version), packText(pack));
  catalogue = withPackEntry(catalogue, "nl", catalogueEntry(pack, version, {}));
  return version;
};
for (const pack of checked) await publish(pack);
let hold = null; // a file the library is slow to send: { url part, promise }
globalThis.fetch = async (url) => {
  const at = String(url);
  if (at === "/library/catalogue.json") return new Response(JSON.stringify(catalogue), { status: 200 });
  if (hold && at.includes(hold.part)) await hold.promise;
  if (served.has(at)) return new Response(served.get(at), { status: 200 });
  return new Response("not here", { status: 404 });
};
packs.setFollowsSource(async () => []);

// The longest the event loop was held while fn ran: a task of its own every ms, and the gaps between them.
async function longestHold(fn) {
  let last = performance.now();
  let worst = 0;
  let going = true;
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
    if (going) setTimeout(() => channel.port2.postMessage(0), 1);
  };
  channel.port2.postMessage(0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  try {
    await fn();
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 5));
    going = false;
    channel.port1.close();
  }
  return worst;
}

setLearning("nl");
await packs.loadPacks();

await test("each pack's check in slices is checkPack's, byte for byte: path-nl and every band, and planted bad ones", () => {
  for (const [i, raw] of raws.entries()) {
    const installed = [...builtIn, ...checked.slice(0, i).map((p) => ({ ...p, builtIn: true }))];
    same(whole(checkPackSteps(raw, { installed })), checkPack(raw, { installed }), raw.id);
  }
  const path = raws.at(-1);
  const others = checked.slice(0, -1).map((p) => ({ ...p, builtIn: true }));
  for (const [label, bad] of Object.entries({
    "a sentence twice": { ...path, items: [...path.items, { ...path.items[3], id: "twice" }] },
    "a pattern no one has": { ...path, items: path.items.map((item, i) => (i === 5 ? { ...item, concepts: ["no-such-pattern"] } : item)) },
    "not a pack": "a pack",
  })) {
    const a = checkPack(bad, { installed: others });
    ok(a.errors.length || a.warnings.length, `the plant "${label}" is refused or warned of`);
    same(whole(checkPackSteps(bad, { installed: others })), a, label);
  }
});

let first;
await test("a first sync: every pack checked in slices, the view worked out in slices and put in place whole (once the lessons are in, then with every band: packs.js lessonsComing), the same as the view built at once", async () => {
  const before = content.contentBuilds();
  await packs.syncLibraryPacks();
  const after = content.contentBuilds();
  ok(after.prepared === before.prepared + 2 && after.whole === before.whole, `the sync's views were worked out in slices first, the lessons' then every band's (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
  ok(content.ITEMS.length > 15000 && content.PACKS.some((pack) => pack.id === "path-nl"), `the packs are in the view (${content.ITEMS.length} sentences)`);
  first = viewNow();
  // The same packs, the view built at once: a pack turned off and on again (each a change told at once).
  packs.setPackOn("words-nl-03", false);
  ok(!content.ITEMS.some((item) => item.pack === "words-nl-03"), "turned off: gone from the view at once");
  packs.setPackOn("words-nl-03", true);
  ok(content.contentBuilds().whole === after.whole + 2, "both built at once");
  same(viewNow(), first, "the view the slices built, against the one built at once");
});

await test("each pack as the sync keeps it is checkPack's answer for it", () => {
  const kept = new Map(packs.allPacks().map((pack) => [pack.id, pack]));
  for (const pack of checked) {
    const { builtIn: _b, origin: _o, ...here } = kept.get(pack.id);
    same(here, pack, pack.id);
  }
});

await test("a new version of path-nl: nothing reads half a view while it's worked out, then the new one whole, the same as built at once", async () => {
  const path = checked.at(-1);
  const next = { ...path, items: path.items.map((item, i) => (i === 0 ? { ...item, means: `${item.means} (new)` } : item)), about: `${path.about ?? ""} New.` };
  const { pack } = checkPack(next, { installed: checked.slice(0, -1).map((p) => ({ ...p, builtIn: true })) });
  await publish(pack);
  const old = shapeOf();
  const seen = [];
  let going = true;
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    seen.push({ shape: shapeOf(), working: content.contentBuilds().working });
    if (going) setTimeout(() => channel.port2.postMessage(0), 0);
  };
  channel.port2.postMessage(0);
  await packs.syncLibraryPacks();
  going = false;
  channel.port1.close();
  const now = shapeOf();
  // What it needs: readers while the view was being worked out, between its slices (how many turns a busy machine gives the readers in all
  // varies: 16 to 20 of the 20 this once asked for, and it failed on code that was fine).
  const during = seen.filter((s) => s.working).length;
  ok(during >= 3, `readers came between the slices while the view was worked out: ${during} of ${seen.length} reads (3 at least)`);
  const shapes = seen.map((s) => s.shape);
  const mixed = shapes.filter((shape) => JSON.stringify(shape) !== JSON.stringify(old) && JSON.stringify(shape) !== JSON.stringify(now));
  ok(!mixed.length && shapes.every(whole_), `every reader saw the old view or the new, whole: ${JSON.stringify(mixed[0] ?? shapes.find((s) => !whole_(s)))}`);
  ok(content.ITEMS.find((item) => item.id === `path-nl/${path.items[0].id}`)?.means.endsWith("(new)"), "the new version is what's studied");
  const sliced = viewNow();
  packs.setPackOn("words-nl-03", false);
  packs.setPackOn("words-nl-03", true);
  same(viewNow(), sliced, "the new view, against the one built at once");
});

await test("the reader's check catches a half view (a control): the new view's sentences with the old one's index", () => {
  ok(!whole_({ ...shapeOf(), byId: shapeOf().byId - 1 }), "a view whose index misses a sentence isn't whole");
  ok(JSON.stringify({ ...shapeOf(), lessons: 0 }) !== JSON.stringify(shapeOf()), "a view with another's lessons is neither");
});

await test("a change while the view is worked out drops it: the view is the newer one, at once", async () => {
  const band = checked[1];
  const next = { ...band, about: `${band.about ?? ""} Again.` };
  const { pack } = checkPack(next, { installed: [builtIn, checked[0]].flat().map((p) => ({ ...p, builtIn: true })) });
  await publish(pack);
  const before = content.contentBuilds();
  const sync = packs.syncLibraryPacks();
  // While the new band's view is being worked out: a pack turned off.
  for (let i = 0; i < 2000 && !content.contentBuilds().working; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  ok(content.contentBuilds().working, "the view is being worked out in slices");
  packs.setPackOn("words-nl-05", false);
  ok(!content.ITEMS.some((item) => item.pack === "words-nl-05"), "turned off at once, mid-sync");
  await sync;
  const after = content.contentBuilds();
  ok(after.dropped > before.dropped, `the view worked out for the packs before it was dropped (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
  ok(!content.ITEMS.some((item) => item.pack === "words-nl-05"), "the band turned off stays off: the view is the newer one");
  ok(content.PACKS.find((p) => p.id === band.id)?.about === pack.about, "and the new band's version is in it");
  packs.setPackOn("words-nl-05", true);
});

await test("a batch (packs.js packsBatch: the relay's round, an AI's packs arriving together) is told once, its view worked out in slices first and having every pack; a pack saved alone still tells at once, and two saved one by one tell twice (the control)", async () => {
  const { builtIn: _builtIn, ...starter } = BUILT_IN.find((pack) => pack.language === "nl");
  const copy = (id) => ({ ...structuredClone(starter), id, name: id });
  const ids = ["alone-0", "alone-1", "batch-0", "batch-1", "batch-2", "batch-3"];
  let told = 0;
  const off = packs.onPacksChange(() => told++);
  try {
    // The control: one by one, each told and each a whole view, at once.
    let before = content.contentBuilds();
    for (const id of ids.slice(0, 2)) ok((await packs.savePack(copy(id), { by: "Claude" })).ok, `${id} saved`);
    let after = content.contentBuilds();
    ok(told === 2 && after.whole === before.whole + 2, `saved one by one: told ${told} times, ${after.whole - before.whole} whole views`);
    ok(content.PACKS.some((pack) => pack.id === "alone-1"), "a pack saved alone is in the view at once");
    // The batch: nothing told while it runs, then once, its view worked out in slices.
    told = 0;
    before = content.contentBuilds();
    await packs.packsBatch(async () => {
      for (const id of ids.slice(2)) ok((await packs.savePack(copy(id), { by: "Claude" })).ok, `${id} saved`);
      ok(told === 0 && !content.PACKS.some((pack) => pack.id.startsWith("batch-")), `told ${told} times while the batch ran`);
    });
    after = content.contentBuilds();
    ok(told === 1, `the batch told ${told} times, not once`);
    ok(after.prepared === before.prepared + 1 && after.whole === before.whole, `its view worked out in slices, once (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
    ok(ids.slice(2).every((id) => content.PACKS.some((pack) => pack.id === id)), "every pack of the batch in the view");
    const batched = viewNow();
    packs.setPackOn("batch-0", false);
    packs.setPackOn("batch-0", true);
    same(viewNow(), batched, "the batch's view, against the one built at once");
  } finally {
    off();
    for (const id of ids) await packs.deletePack(id).catch(() => {});
  }
});

await test("another language, and back: the view at once, as before", () => {
  setLearning("de");
  ok(content.contentLanguage() === "de" && !content.ITEMS.some((item) => item.pack.startsWith("words-nl")), "German's view, at once");
  setLearning("nl");
  ok(content.contentLanguage() === "nl" && content.ITEMS.some((item) => item.pack === "words-nl-01"), "Dutch's again, at once");
});

// A new version of every pack the library has here, as the sync after it will bring.
const republish = async (words) => {
  const next = [];
  for (const [i, pack] of checked.entries()) {
    const { pack: one } = checkPack({ ...pack, about: `${pack.about ?? ""} ${words}` }, { installed: [...builtIn, ...checked.slice(0, i).map((p) => ({ ...p, builtIn: true }))] });
    await publish(one);
    next.push(one);
  }
  return next;
};
const KB64 = 64 * 1024;
const big = (who) => puts.filter((put) => put.who === who && put.bytes > KB64);

await test("a sync writes each pack's record from the worker, as the bytes it hashed: no record over 64 KB put from the page, and what's stored is the pack itself; with no worker the same sync puts them from the page, and the rule sees it (the control)", async () => {
  const next = await republish("Written away.");
  puts.length = 0;
  const synced = await packs.syncLibraryPacks();
  ok(synced.ok && !synced.problems?.length, JSON.stringify(synced).slice(0, 300));
  ok(!big("page").length, `records over 64 KB put from the page during a sync: ${big("page").map((p) => `${p.id} ${Math.round(p.bytes / 1024)} KB`).join(", ")}`);
  ok(big("worker").length === next.length, `${big("worker").length} pack records written by the worker, not ${next.length}`);
  for (const pack of next) {
    const record = idb.stored.get(`library:${pack.id}`);
    ok(record && isDeepStrictEqual(record.pack, pack), `${pack.id} as stored isn't the pack the library sent`);
    ok(record.source?.version === (await packVersion(pack)), `${pack.id} is stored at ${record.source?.version}`);
  }
  // The control: no worker on this device.
  const keep = globalThis.Worker;
  globalThis.Worker = undefined;
  try {
    await republish("Written here.");
    puts.length = 0;
    ok((await packs.syncLibraryPacks()).ok, "the control's sync");
    ok(big("page").length === next.length, `the control: with no worker, ${big("page").length} records over 64 KB put from the page, not ${next.length}: the rule can't see what it guards`);
  } finally {
    globalThis.Worker = keep;
  }
});

await test("a hold (Translate's key until its answer is drawn: slices.js holdSlices) starts no slice until it's let go, and lets go by itself after HOLD_MOST; with none the slices go on (the control)", async () => {
  const { inSlices, holdSlices, HOLD_MOST } = await import("../public/js/know/slices.js");
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let steps = 0;
  const job = function* () {
    for (let i = 0; i < 120; i++) {
      const t = performance.now();
      while (performance.now() - t < 1) {}
      steps++;
      yield;
    }
  };
  // The control: nothing held, the job's slices go on.
  const free = inSlices(job());
  await sleep(40);
  ok(steps > 0, "with nothing held, no slice ran in 40 ms");
  await free;
  // Held, nothing runs; let go, it finishes.
  steps = 0;
  const letGo = holdSlices();
  const held = inSlices(job());
  await sleep(80);
  ok(steps === 0, `held, ${steps} steps ran`);
  letGo();
  await held;
  ok(steps === 120, `let go, the job ran ${steps} of its 120 steps`);
  // A hold never let go lets go by itself.
  steps = 0;
  holdSlices();
  const t0 = performance.now();
  const late = inSlices(job());
  while (!steps && performance.now() - t0 < HOLD_MOST + 2000) await sleep(5);
  const waited = performance.now() - t0;
  ok(waited >= HOLD_MOST - 10 && waited < HOLD_MOST + 250, `a hold never let go held the slices ${Math.round(waited)} ms, not about ${HOLD_MOST}`);
  await late;
});

await test("the sync's longest task, beside the longest a view built at once takes here", async () => {
  // A new version of every band and of path-nl: the sync checks each and works out the view, a piece at a time.
  for (const [i, pack] of checked.entries()) {
    const { pack: next } = checkPack({ ...pack, about: `${pack.about ?? ""} Once more.` }, { installed: [...builtIn, ...checked.slice(0, i).map((p) => ({ ...p, builtIn: true }))] });
    await publish(next);
  }
  // The page's own tasks: the stand-in workers run in this event loop, where a browser's run on threads of their own, so their writes are held
  // while it's measured and made after (each is tested above).
  putMode = "early";
  let synced;
  try {
    synced = await longestHold(() => packs.syncLibraryPacks());
  } finally {
    putMode = "write";
    for (const write of lateWrites.splice(0)) await write();
  }
  const once = await longestHold(async () => {
    packs.setPackOn("words-nl-03", false);
    packs.setPackOn("words-nl-03", true);
  });
  console.log(`      the sync held the event loop ${synced.toFixed(0)} ms at most; a view built at once (twice) ${once.toFixed(0)} ms`);
  ok(synced < once / 2, `the sync's longest task (${synced.toFixed(0)} ms) is under half a view built at once (${once.toFixed(0)} ms)`);
});

let reloads = 0;
// The device started again: packs.js as a fresh module reading the same store. Last, as each fresh one stays (it hears every change another
// tab's packs.js makes, and loads again).
const reloaded = async () => {
  const fresh = await import(`../public/js/study/packs.js?reload-${++reloads}`);
  await fresh.loadPacks();
  return new Map(fresh.libraryPacks().map((p) => [p.id, p.version]));
};

await test("a reload straight after a sync reads the record the sync brought (packs.js waits for the worker's write to complete); a worker that answers before it writes makes the same reload read the one before (the control)", async () => {
  const path = checked.at(-1).id;
  const [now] = (await republish("Read straight after.")).slice(-1);
  const version = await packVersion(now);
  ok((await packs.syncLibraryPacks()).ok, "the sync");
  const read = await reloaded();
  ok(read.get(path) === version, `a reload straight after the sync read ${path} at ${read.get(path)}, not ${version}`);
  // The control: the worker says it's written before it is.
  putMode = "early";
  let laterVersion = null;
  try {
    const [later] = (await republish("Answered too soon.")).slice(-1);
    laterVersion = await packVersion(later);
    ok((await packs.syncLibraryPacks()).ok, "the control's sync");
    const tooSoon = await reloaded();
    ok(tooSoon.get(path) === version && laterVersion !== version, `the control: read before the write landed, ${path} was ${tooSoon.get(path)}, not the earlier ${version}: the reload can't tell a write still to come`);
  } finally {
    putMode = "write";
    for (const write of lateWrites.splice(0)) await write();
  }
  const settled = await reloaded();
  ok(settled.get(path) === laterVersion, `once the control's late writes land, a reload reads ${path} at ${settled.get(path)}, not ${laterVersion}`);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
