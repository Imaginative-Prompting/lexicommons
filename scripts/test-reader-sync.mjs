// The reader's data through your own storage (public/js/sync.js), in Node against a storage kept in memory, on devices
// that are each their own copy of the modules (and their own localStorage): where you are in each text (read/store.js,
// "reading-place"), your highlights and notes (read/highlights.js, "highlights": a removed one stays removed, also for
// a device that was away, and one a deletion took is kept to restore for 30 days, then let go), and your words
// (read/bank.js, "word-bank": a word taken out and added again), and your texts (read/store.js, "texts", 12 Nov 2026: your own whole with
// your AI's weave and cover, a shelf book as its entry alone, a removal staying removed and Undo bringing it back, Delete everywhere and
// Bring back, another account's text never sent, a crafted text or weave turned down, a file per text and per weave, a weave not
// counted as a text). Each kind's check against what a file could carry:
// keys of the wrong shape ("__proto__" too), fields of the wrong type, fields too many. `node scripts/test-reader-sync.mjs`
// (exit 0 = pass).

import { registerHooks } from "node:module";

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
// No IndexedDB here (store.js and highlights.js keep things in memory), no other tabs, and each device its own
// localStorage (the word bank lives there): the device whose turn it is.
globalThis.IDBRequest ??= class {};
globalThis.IDBObjectStore ??= class {};
globalThis.BroadcastChannel = undefined;
globalThis.addEventListener ??= () => {};
let current = null;
globalThis.localStorage = {
  getItem: (k) => current.storage.get(k) ?? null,
  setItem: (k, v) => current.storage.set(k, String(v)),
  removeItem: (k) => current.storage.delete(k),
};

const moduleOf = (path, device) => new URL(`../public/js/${path}?device=${device}`, import.meta.url).href;
const TAG = "0a1b2c3d";
const DAY = 86_400_000;
/** A device: its modules, its localStorage, its id in the files' names, and what it remembers between syncs. */
async function device(name, id) {
  const dev = { name, id, storage: new Map(), remembered: {} };
  current = dev;
  dev.store = await import(moduleOf("read/store.js", name));
  dev.marks = await import(moduleOf("read/highlights.js", name));
  dev.bank = await import(moduleOf("read/bank.js", name));
  dev.sync = await import(moduleOf("sync.js", name));
  dev.kinds = [dev.store.placeSync, dev.marks.highlightSync, dev.bank.bankSync, dev.store.textSync];
  dev.store.setReadAccount("acct-1");
  return dev;
}
/** Runs fn as device dev (its localStorage). */
const on = async (dev, fn) => {
  current = dev;
  return fn(dev);
};

/** A storage in memory: files with versions; a write given { version } happens only at that version. */
function memoryStore() {
  const files = new Map();
  let n = 0;
  return {
    files,
    async list() {
      return [...files].map(([name, f]) => ({ name, version: f.version, size: f.text.length }));
    },
    async read(name) {
      return files.get(name).text;
    },
    async write(name, text, { version } = {}) {
      const f = files.get(name);
      if (version !== undefined && (version === null ? f : f?.version !== version)) {
        const error = new Error("conflict");
        error.conflict = true;
        throw error;
      }
      files.set(name, { text, version: `v${++n}` });
      return { version: `v${n}` };
    },
  };
}
const STORE = memoryStore();
const sync = (dev) => on(dev, (d) => d.sync.syncWith(STORE, TAG, d.id, d.remembered, d.kinds));
const later = () => new Promise((r) => setTimeout(r, 4));

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

const A = await device("a", "aaaaaaaa");
const B = await device("b", "bbbbbbbb");
const C = await device("c", "cccccccc");
const BOOK = "storyweaver-1-een-boek";
const VERSION = "0123456789abcdef";

// ---------- where you are ----------

await test("where you are: a place reaches the other device; the later one wins either way; one for a text it doesn't have waits there", async () => {
  await on(A, (d) => d.store.setPosition(BOOK, 120, VERSION));
  await sync(A);
  await sync(B);
  const b1 = await on(B, (d) => d.store.getPosition(BOOK));
  ok(b1?.word === 120 && b1.version === VERSION, `B has A's place: ${JSON.stringify(b1)}`);
  await later();
  await on(B, (d) => d.store.setPosition(BOOK, 300, VERSION));
  await sync(B);
  await sync(A);
  const a1 = await on(A, (d) => d.store.getPosition(BOOK));
  ok(a1?.word === 300, `A has B's later place: ${JSON.stringify(a1)}`);
  // An older place from a device that was away doesn't win.
  await on(C, (d) => d.store.setPosition("text-0aa0f4e1-5d3b-4a43-9a91-2b6c3f1e0d77", 5, null));
  const old = { at: a1.at - 60_000, value: { word: 10, version: VERSION } };
  STORE.files.set(`lexicommons-reading-place.${TAG}.dddddddd.json`, { text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "reading-place", account: TAG, records: { [BOOK]: old } }), version: "vx" });
  await sync(A);
  ok((await on(A, (d) => d.store.getPosition(BOOK))).word === 300, "an older place stays behind");
  STORE.files.delete(`lexicommons-reading-place.${TAG}.dddddddd.json`);
  await sync(C);
  await sync(A);
  ok((await on(A, (d) => d.store.getPosition("text-0aa0f4e1-5d3b-4a43-9a91-2b6c3f1e0d77")))?.word === 5, "C's own text's place waits on A");
  return "120 → B, 300 → A, an older one refused, C's text's place kept";
});

await test("where you are: the check takes only a text id and { word, version }", () => {
  const { check } = A.store.placeSync;
  const value = { word: 4, version: VERSION };
  ok(check({ at: 1, value }, BOOK), "a good one");
  ok(check({ at: 1, value: { word: 0, version: null } }, "text-0aa0f4e1-5d3b-4a43-9a91-2b6c3f1e0d77"), "your own text's, no version");
  for (const [key, record, why] of [
    ["__proto__", { at: 1, value }, "a key that isn't an id"],
    ["Book", { at: 1, value }, "capitals"],
    [BOOK, { at: 1, gone: true }, "a deletion"],
    [BOOK, { at: 1, value: { word: -1, version: VERSION } }, "a negative word"],
    [BOOK, { at: 1, value: { word: 1.5, version: VERSION } }, "half a word"],
    [BOOK, { at: 1, value: { word: 4, version: "abc" } }, "a version of the wrong shape"],
    [BOOK, { at: 1, value: { word: 4, version: VERSION, extra: 1 } }, "a field too many"],
    [BOOK, { at: 1, value: [4] }, "a list"],
  ]) ok(!check(record, key), `refused: ${why}`);
  return "8 refusals";
});

// ---------- highlights ----------

let made = null;
await test("highlights: one made here reaches the other device; a note added there comes back", async () => {
  made = A.marks.newHighlight({ book: BOOK, version: VERSION, start: 3, end: 7, quote: "vijf woorden van het boek", note: "" });
  await on(A, (d) => d.marks.saveHighlight(made));
  await sync(A);
  await sync(B);
  await sync(C);
  const onB = (await on(B, (d) => d.marks.highlightsOf(BOOK))).find((h) => h.id === made.id);
  ok(onB && onB.start === 3 && onB.end === 7 && onB.quote === made.quote, `B has it: ${JSON.stringify(onB)}`);
  await later();
  await on(B, (d) => d.marks.saveHighlight({ ...onB, note: "een notitie" }));
  await sync(B);
  await sync(A);
  const onA = (await on(A, (d) => d.marks.highlightsOf(BOOK))).find((h) => h.id === made.id);
  ok(onA?.note === "een notitie", `A has B's note: ${JSON.stringify(onA)}`);
  return made.id;
});

await test("highlights: taken out on one device, it's out on the other, kept there to restore; not on the device that took it out", async () => {
  await later();
  await on(A, (d) => d.marks.removeHighlight(made.id));
  ok(!(await on(A, (d) => d.marks.allHighlights())).some((h) => h.id === made.id), "out on A");
  ok(!(await on(A, (d) => d.marks.removedHighlightsOf(BOOK))).length, "A took it out itself: nothing to restore there");
  await sync(A);
  await sync(B);
  ok(!(await on(B, (d) => d.marks.allHighlights())).some((h) => h.id === made.id), "out on B");
  const kept = await on(B, (d) => d.marks.removedHighlightsOf(BOOK));
  ok(kept.length === 1 && kept[0].row.note === "een notitie" && kept[0].until - kept[0].at > 29 * DAY, `kept on B to restore: ${JSON.stringify(kept)}`);
  return `restorable until ${new Date(kept[0].until).toISOString().slice(0, 10)}`;
});

await test("highlights: a device that was away (C, with the old highlight) doesn't bring it back", async () => {
  ok((await on(C, (d) => d.marks.allHighlights())).some((h) => h.id === made.id), "C still had it");
  await sync(C);
  ok(!(await on(C, (d) => d.marks.allHighlights())).some((h) => h.id === made.id), "out on C");
  await sync(A);
  await sync(B);
  ok(!(await on(A, (d) => d.marks.allHighlights())).some((h) => h.id === made.id) && !(await on(B, (d) => d.marks.allHighlights())).some((h) => h.id === made.id), "and still out on A and B");
});

await test("highlights: restored on B, it's back everywhere, with its note", async () => {
  await later();
  const row = await on(B, (d) => d.marks.restoreRemoved(made.id));
  ok(row?.note === "een notitie", `restored: ${JSON.stringify(row)}`);
  ok(!(await on(B, (d) => d.marks.removedHighlightsOf(BOOK))).length, "no longer in the restore list");
  await sync(B);
  for (const dev of [A, C]) {
    await sync(dev);
    const back = (await on(dev, (d) => d.marks.allHighlights())).find((h) => h.id === made.id);
    ok(back?.note === "een notitie", `${dev.name} has it again: ${JSON.stringify(back)}`);
  }
});

await test("highlights: a copy kept to restore is let go after 30 days; the deletion stays", async () => {
  const other = A.marks.newHighlight({ book: BOOK, version: VERSION, start: 9, end: 9, quote: "woord" });
  await on(A, (d) => d.marks.saveHighlight(other));
  await sync(A);
  await sync(B);
  await later();
  await on(A, (d) => d.marks.removeHighlight(other.id));
  await sync(A);
  await sync(B);
  ok((await on(B, (d) => d.marks.removedHighlightsOf(BOOK))).some((r) => r.id === other.id), "kept on B");
  const realNow = Date.now;
  Date.now = () => realNow() + 31 * DAY;
  try {
    await on(B, (d) => d.marks.highlightSync.prepare());
    ok(!(await on(B, (d) => d.marks.removedHighlightsOf(BOOK))).some((r) => r.id === other.id), "let go after 30 days");
  } finally {
    Date.now = realNow;
  }
  const records = await on(B, (d) => d.marks.highlightSync.records());
  ok(records[other.id]?.gone === true, `the deletion stays: ${JSON.stringify(records[other.id])}`);
});

await test("highlights: a text taken off one device keeps its highlights on the others", async () => {
  await on(A, (d) => d.marks.removeHighlightsOf(BOOK));
  await sync(A);
  await sync(B);
  ok((await on(B, (d) => d.marks.allHighlights())).some((h) => h.id === made.id), "still on B");
});

await test("highlights: the check takes only an id and a highlight's own fields", () => {
  const { check } = A.marks.highlightSync;
  const value = { book: BOOK, version: VERSION, start: 1, end: 2, quote: "twee woorden", note: "", at: 10 };
  ok(check({ at: 20, value }, made.id), "a good one");
  ok(check({ at: 20, gone: true }, made.id), "a deletion");
  for (const [key, record, why] of [
    ["__proto__", { at: 20, value }, "a key that isn't an id"],
    [made.id, { at: 20, gone: true, about: {} }, "a deletion with more to say"],
    [made.id, { at: 20, value: { ...value, start: 3 } }, "starting after it ends"],
    [made.id, { at: 20, value: { ...value, book: "../etc" } }, "a book id of the wrong shape"],
    [made.id, { at: 20, value: { ...value, quote: "x".repeat(500) } }, "a quote too long"],
    [made.id, { at: 20, value: { ...value, note: 4 } }, "a note that isn't text"],
    [made.id, { at: 5, value }, "made after its own last change"],
    [made.id, { at: 20, value: { ...value, id: made.id } }, "a field too many"],
  ]) ok(!check(record, key), `refused: ${why}`);
  return "8 refusals";
});

// ---------- your words ----------

await test("your words: added here, they reach the other device; taken out there, they're out here; added again, they're back", async () => {
  await on(A, (d) => {
    d.bank.addWord("nl", "kat", { at: 12, book: BOOK });
    d.bank.addWord("nl", "boom");
  });
  await sync(A);
  await sync(B);
  ok(await on(B, (d) => d.bank.inBank("nl", "kat") && d.bank.inBank("nl", "boom")), "B has both");
  ok((await on(B, (d) => d.bank.bankEntry("nl", "kat")))?.at === 12, "with where it was added");
  await later();
  await on(B, (d) => d.bank.removeWord("nl", "kat"));
  await sync(B);
  await sync(A);
  ok(await on(A, (d) => !d.bank.inBank("nl", "kat") && d.bank.inBank("nl", "boom")), "kat out on A, boom still in");
  await later();
  await on(A, (d) => d.bank.addWord("nl", "kat"));
  await sync(A);
  await sync(B);
  ok(await on(B, (d) => d.bank.inBank("nl", "kat")), "kat back on B");
});

await test("your words: what a sync brings in reaches the reader (the bank's listeners), but doesn't ask for another sync", async () => {
  let heard = 0;
  let asked = 0;
  const stopHearing = await on(B, (d) => d.bank.onBankChange(() => heard++));
  await on(B, (d) => d.bank.bankSync.onChange(() => asked++));
  await later();
  await on(A, (d) => d.bank.addWord("nl", "vogel"));
  await sync(A);
  await sync(B);
  ok(heard === 1 && asked === 0, `from the sync: heard ${heard}, asked ${asked}`);
  await on(B, (d) => d.bank.addWord("nl", "huis"));
  ok(heard === 2 && asked === 1, `from B itself: heard ${heard}, asked ${asked}`);
  stopHearing();
});

await test("your words: the check takes only a known language, a word as the bank keys it, and { at, book }", () => {
  const { check } = A.bank.bankSync;
  const value = { at: 3, book: BOOK };
  ok(check({ at: 1, value }, "nl:kat"), "a good one");
  ok(check({ at: 1, value: { at: null, book: null } }, "nl:'s morgens"), "with an apostrophe, nowhere in particular");
  ok(check({ at: 1, gone: true }, "nl:kat"), "a deletion");
  for (const [key, record, why] of [
    ["nl:__proto__", { at: 1, value }, "__proto__"],
    ["__proto__:kat", { at: 1, value }, "a language that's __proto__"],
    ["xx:kat", { at: 1, value }, "a language that isn't one"],
    ["nl:Kat", { at: 1, value }, "a capital"],
    ["nl:", { at: 1, value }, "no word"],
    ["kat", { at: 1, value }, "no language"],
    ["nl:kat\u0000", { at: 1, value }, "a control character"],
    ["nl:kat", { at: 1, value: { at: -1, book: null } }, "a negative place"],
    ["nl:kat", { at: 1, value: { at: 1, book: "Een Boek" } }, "a book id of the wrong shape"],
    ["nl:kat", { at: 1, value: { at: 1, book: null, gone: true } }, "a field too many"],
  ]) ok(!check(record, key), `refused: ${why}`);
  return "10 refusals";
});

await test("the files: one per kind and device, named for the account, never more", async () => {
  // C hasn't synced since the words came: a device writes a kind's file once it has something of it.
  await sync(C);
  ok(await on(C, (d) => d.bank.inBank("nl", "vogel")), "C has the words now");
  const names = [...STORE.files.keys()].sort();
  for (const kind of ["reading-place", "highlights", "word-bank"]) {
    for (const dev of [A, B, C]) ok(names.includes(`lexicommons-${kind}.${TAG}.${dev.id}.json`), `${kind} of ${dev.name}: ${names}`);
  }
  return `${names.length} files`;
});


// ---------- your texts ----------

const BF = await import("../public/js/read/book-format.js");
/** A valid text, as book-format.js checks one (test-book-format's), with a source of its own. */
async function makeText(id, text, source, lang = "en") {
  const words = BF.tokenize(text, lang);
  const paras = [{ k: "p", s: 0, e: words.length }];
  const book = {
    format: "lexicommons-book", v: 1, id, version: "", title: `Text ${id}`, authors: [], lang, source,
    rights: { us: true, eu: true, basis: "made for the test", licence: "CC0-1.0" },
    words, italic: [], paras, chapters: [{ title: "One", para: 0 }], sentences: BF.segmentSentences(words, paras, lang),
  };
  book.version = await BF.bookVersion(book);
  return book;
}
/** A valid weave of "Alice was tired. She sat down." into Dutch (test-book-format's). */
async function makeWeave(book) {
  const data = [
    { t: [["Alice", null], ["was", "zijn"], ["moe.", "moe"]], text: "Alice was moe.", m: [["Alice", "Alice", [0], null], ["was", "was", [1], "zijn"], ["moe.", "tired", [2], "moe"]], c: [] },
    { t: [["Ze", "zij"], ["ging zitten", "gaan"], ["neer.", "neer"]], text: "Ze ging zitten.", m: [["Ze", "She", [0], "zij"], ["ging", "sat", [1], "gaan"], ["zitten.", "down", [1, 2], "zitten"]], u: [[1, 2, "ging zitten."]] },
  ];
  const sentences = [];
  for (const [x, [s, e]] of book.sentences.entries()) sentences.push({ s, e, h: await BF.sentenceHash(book.words, s, e), ...data[x] });
  return { format: "lexicommons-weave", v: 1, kind: "weave", book: book.id, bookVersion: book.version, from: "en", to: "nl", variant: "nl-NL", licence: "CC BY-SA 4.0", made: { pipeline: "test" }, sentences };
}
const COVER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 14"><rect width="10" height="14" fill="#336"/></svg>';
const textsOn = (dev) => on(dev, async (d) => (await d.store.listBooks()).map((b) => b.id).sort());
const textFiles = () => [...STORE.files.keys()].filter((n) => n.startsWith("lexicommons-texts."));

await test("your texts: a pasted one and your AI's (its cover and its weave) reach the other device whole; a shelf book as its entry alone, fetched again where it's opened", async () => {
  const pasted = await makeText("text-pasted-1", "Alice was tired. She sat down.", { kind: "paste" });
  const ai = await makeText("ai-0123456789abcdef", "Alice was tired. She sat down.", { kind: "ai", ref: "Claude", account: "acct-1" });
  const shelf = await makeText("storyweaver-2-de-kat", "Alice was tired. She sat down.", { kind: "storyweaver", ref: "https://example.org/book" });
  const { cleanCover, coverFile } = await import(moduleOf("read/cover-svg.js", "a"));
  const { svg } = cleanCover(COVER_SVG);
  await on(A, async (d) => {
    await d.store.addBook(pasted);
    await d.store.addBook(ai, {}, { cover: { file: await coverFile(svg), blob: new Blob([svg], { type: "image/svg+xml" }) } });
    await d.store.keepWeave(ai.id, "nl", await makeWeave(ai));
    await d.store.addBook(shelf, {}, { from: "shelf" });
  });
  const before = textFiles().length;
  await sync(A);
  // A file per text and per weave: the pasted one, your AI's, its weave, the shelf book's entry.
  ok(textFiles().length - before === 4, `files written: ${textFiles().slice(before)}`);
  await sync(B);
  ok(JSON.stringify(await textsOn(B)) === JSON.stringify([ai.id, shelf.id, pasted.id].sort()), `B's texts: ${await textsOn(B)}`);
  const onB = await on(B, async (d) => ({
    pasted: await d.store.getBook(pasted.id),
    ai: await d.store.getBook(ai.id),
    weave: await d.store.getWeave(ai.id, "nl"),
    shelf: await d.store.getBook(shelf.id),
    shelfEntry: await d.store.getEntry(shelf.id),
    cover: (await d.store.getEntry(ai.id))?.cover?.file,
  }));
  ok(onB.pasted?.text.version === pasted.version && JSON.stringify(onB.pasted.text.words) === JSON.stringify(pasted.words), "the pasted text, whole");
  ok(onB.ai?.text.version === ai.version && onB.cover && (await on(B, (d) => d.store.getPicture(onB.cover))), "your AI's text with its cover");
  ok(onB.weave?.to === "nl" && onB.weave.sentences.length === 2, "and its weave");
  ok(!onB.shelf && onB.shelfEntry?.from === "shelf" && onB.shelfEntry.title === shelf.title, `the shelf book as its entry alone: ${JSON.stringify(onB.shelfEntry)?.slice(0, 120)}`);
  // Counted as texts, its weave not one.
  const count = await on(B, (d) => d.sync.localCount("texts"));
  ok(count === 3, `B counts ${count} texts`);
  return `3 texts and a weave in 4 files; on B whole, the shelf book listed to fetch again`;
});

await test("your texts: one removed stays removed everywhere (a device away too), Undo brings it back everywhere; another account's text never leaves its device", async () => {
  const snap = await on(A, (d) => d.store.snapshotBook("text-pasted-1"));
  await on(A, (d) => d.store.removeBook("text-pasted-1"));
  await sync(A);
  await sync(B);
  ok(!(await textsOn(B)).includes("text-pasted-1"), "removed on B");
  // C was away: it never had it, and doesn't get it.
  await sync(C);
  ok(!(await textsOn(C)).includes("text-pasted-1"), "C never gets it");
  // An old copy from a device that was away (B's file from before, put back): it stays removed.
  for (let i = 0; i < 2; i++) for (const d of [A, B, C]) await sync(d);
  ok(!(await textsOn(A)).includes("text-pasted-1") && !(await textsOn(B)).includes("text-pasted-1"), "still removed after more syncs");
  await later();
  await on(A, (d) => d.store.restoreBook(snap));
  await sync(A);
  await sync(B);
  await sync(C);
  ok((await textsOn(B)).includes("text-pasted-1") && (await textsOn(C)).includes("text-pasted-1"), "Undo brought it back everywhere");
  // A text your AI added for another account on A: never in A's records.
  const theirs = await makeText("ai-fedcba9876543210", "Alice was tired. She sat down.", { kind: "ai", ref: "Claude", account: "acct-2" });
  await on(A, (d) => d.store.addBook(theirs));
  await sync(A);
  await sync(B);
  ok(!(await textsOn(B)).includes(theirs.id), "another account's text reached B");
  ok(!textFiles().some((n) => STORE.files.get(n).text.includes(theirs.id)), "another account's text is in a file");
  return "removed everywhere, still removed, back with Undo; another account's text stayed";
});

await test("your texts: a crafted text or weave is turned down (and listed), and taken once a right one comes", async () => {
  const good = await makeText("text-crafted-1", "Alice was tired. She sat down.", { kind: "upload", ref: "story.txt" });
  const bad = { ...good, words: [...good.words.slice(0, -1), "<script>"] };
  const entry = { id: good.id, title: good.title, authors: [], lang: "en", source: good.source, version: good.version, addedAt: Date.now(), words: good.words.length, chapters: 1 };
  const crafted = `lexicommons-texts.t${(await import(moduleOf("sync.js", "engine"))).hashText(good.id)}.${TAG}.eeeeeeee.json`;
  STORE.files.set(crafted, { text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "texts", account: TAG, records: { [good.id]: { at: Date.now(), value: { entry, text: bad } } } }), version: "v-crafted-1" });
  await sync(B);
  ok(!(await textsOn(B)).includes(good.id), "the crafted text was taken");
  const listed = await on(B, (d) => d.store.textsTurnedDown());
  ok(listed.some((t) => t.key === good.id), `it's listed as turned down: ${JSON.stringify(listed)}`);
  STORE.files.set(crafted, { text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "texts", account: TAG, records: { [good.id]: { at: Date.now() + 1, value: { entry, text: good } } } }), version: "v-crafted-2" });
  await sync(B);
  ok((await textsOn(B)).includes(good.id), "the right one is taken");
  ok(!(await on(B, (d) => d.store.textsTurnedDown())).some((t) => t.key === good.id), "and no longer listed");
  STORE.files.delete(crafted);
  // A text whose words pass but whose version is made up: its own check, not only the entry's.
  const forged = { ...good, id: "text-crafted-2", version: "0000000000000000" };
  const forgedFile = `lexicommons-texts.t${(await import(moduleOf("sync.js", "engine"))).hashText(forged.id)}.${TAG}.eeeeeeee.json`;
  STORE.files.set(forgedFile, { text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "texts", account: TAG, records: { [forged.id]: { at: Date.now(), value: { entry: { ...entry, id: forged.id, version: forged.version }, text: forged } } } }), version: "v-forged" });
  await sync(B);
  ok(!(await textsOn(B)).includes(forged.id), "a text with a made-up version was taken");
  STORE.files.delete(forgedFile);
  // A weave of a text B has, made for another version of it: turned down and listed.
  const weave = { ...(await makeWeave(good)), bookVersion: "0000000000000000" };
  const weaveKey = `${good.id}:nl`;
  const weaveFile = `lexicommons-texts.t${(await import(moduleOf("sync.js", "engine"))).hashText(weaveKey)}.${TAG}.eeeeeeee.json`;
  STORE.files.set(weaveFile, { text: JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "texts", account: TAG, records: { [weaveKey]: { at: Date.now(), value: { weave } } } }), version: "v-weave" });
  await sync(B);
  ok(!(await on(B, (d) => d.store.getWeave(good.id, "nl"))), "the crafted weave was taken");
  ok((await on(B, (d) => d.store.textsTurnedDown())).some((t) => t.key === weaveKey), "and it's listed as turned down");
  STORE.files.delete(weaveFile);
  return "a crafted text, a made-up version and a crafted weave turned down and listed; the right text taken";
});

await test("your texts: one too big for the storage's files stays on its device, said, and the others go on (your account keeps 12 MB a file)", async () => {
  const words = Array.from({ length: 4000 }, (_, i) => (i % 6 === 5 ? "down." : ["Alice", "was", "tired", "and", "sat"][i % 5])).join(" ");
  const big = await makeText("text-too-big-1", words, { kind: "paste" });
  const small = await makeText("text-small-1", "Alice was tired. She sat down.", { kind: "paste" });
  ok(JSON.stringify(big).length > 20_000 && JSON.stringify(small).length < 5_000, "a big text and a small one");
  await on(A, async (d) => {
    await d.store.addBook(big);
    await d.store.addBook(small);
  });
  STORE.maxFileBytes = 20_000;
  try {
    const report = await sync(A);
    ok(report.texts.notKept?.[big.id] === "big" && !(small.id in (report.texts.notKept ?? {})) && report.texts.error === null, `A's sync: ${JSON.stringify({ notKept: report.texts.notKept, error: report.texts.error })}`);
    ok(!textFiles().some((n) => STORE.files.get(n).text.includes(`"${big.id}"`)), "a file holds the big text");
    await sync(B);
    const onB = await textsOn(B);
    ok(onB.includes(small.id) && !onB.includes(big.id), `B has the small one alone: ${onB}`);
    ok(await on(A, (d) => d.store.getBook(big.id)), "the big one is still on A");
  } finally {
    delete STORE.maxFileBytes;
  }
  await on(A, async (d) => {
    await d.store.removeBook(big.id);
    await d.store.removeBook(small.id);
  });
  await sync(A);
  await sync(B);
  return "the big text kept on A and said, the small one on B";
});

await test("your texts: Delete everywhere takes every text from every device, and Bring back brings them all back everywhere", async () => {
  await sync(A);
  await sync(B);
  const was = await textsOn(B);
  const n = await on(A, (d) => d.store.deleteTextsEverywhere());
  ok(n >= 3, `deleted ${n}`);
  await sync(A);
  await sync(B);
  ok((await textsOn(B)).length === 0, `B still has ${await textsOn(B)}`);
  const kept = await on(A, (d) => d.store.textsToBringBack());
  ok(kept.length === n && kept.every((t) => t.until > Date.now() + 6 * DAY), `kept to bring back: ${kept.length}`);
  await later();
  const back = await on(A, (d) => d.store.bringBackTexts());
  await sync(A);
  await sync(B);
  ok(back === n && JSON.stringify(await textsOn(B)) === JSON.stringify(was), `B after Bring back: ${await textsOn(B)} (was ${was})`);
  ok((await on(A, (d) => d.store.textsToBringBack())).length === 0, "nothing left to bring back");
  return `${n} deleted everywhere and brought back`;
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
