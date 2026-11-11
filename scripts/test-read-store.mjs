// The reading library on a browser two accounts sign in to (public/js/read/store.js, its in-memory store): texts your AI
// added for one account aren't listed, opened, removed or cleared by the other; your own texts are the device's, as
// always; a cover two texts share stays while either has it; and your highlights go with their text (removed, kept
// for Undo, cleared and exported with it); definitions kept with their layer. Runs in Node: `node scripts/test-read-store.mjs`
// (exit 0 = pass).

// Node has no IndexedDB, so store.js keeps everything in memory; these are the names it checks results against.
globalThis.IDBRequest ??= class {};
globalThis.IDBObjectStore ??= class {};

const store = await import("../public/js/read/store.js");
const marks = await import("../public/js/read/highlights.js");
const { bookFromText } = await import("../public/js/read/import-text.js");

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};

const COVER = { file: "0123456789abcdef.svg", blob: new Blob(["<svg/>"], { type: "image/svg+xml" }) };
async function book(id, title, source) {
  const made = await bookFromText(`${title}\n\nOma heeft een rode jas. De jas hangt aan de deur.`, { lang: "nl", title });
  return { ...made, id, source };
}
const ids = async () => (await store.listBooks()).map((b) => b.id).sort().join(" ");

/** Each test's start: account A's text from its AI, account B's (with the same cover), a text added by hand; B signed in. */
async function setup() {
  for (const account of ["acct-a", "acct-b"]) {
    store.setReadAccount(account);
    await store.clearReading();
  }
  store.setReadAccount("acct-a");
  await store.addBook(await book("ai-aaaaaaaaaaaaaaaa", "Voor A", { kind: "ai", ref: "Claude", account: "acct-a" }), {}, { cover: COVER });
  store.setReadAccount("acct-b");
  await store.addBook(await book("ai-bbbbbbbbbbbbbbbb", "Voor B", { kind: "ai", ref: "Claude", account: "acct-b" }), {}, { cover: COVER });
  await store.addBook(await book("text-mine", "Van mij", { kind: "file" }));
  ok((await ids()) === "ai-bbbbbbbbbbbbbbbb text-mine", `set up: ${await ids()}`);
}

await test("each account's Read lists its own AI's texts and the device's own texts, never the other account's", async () => {
  await setup();
  ok((await ids()) === "ai-bbbbbbbbbbbbbbbb text-mine", `B sees: ${await ids()}`);
  ok((await store.getBook("ai-aaaaaaaaaaaaaaaa")) === null && (await store.getBook("ai-bbbbbbbbbbbbbbbb")) !== null, "B can't open A's");
  store.setReadAccount("acct-a");
  ok((await ids()) === "ai-aaaaaaaaaaaaaaaa text-mine", `A sees: ${await ids()}`);
});

await test("Codex's second review: one account can't remove the other's text from its AI", async () => {
  await setup();
  await store.removeBook("ai-aaaaaaaaaaaaaaaa");
  store.setReadAccount("acct-a");
  ok((await store.getBook("ai-aaaaaaaaaaaaaaaa")) !== null, "A's text is still there");
});

await test("Codex's second review: removing B's text keeps the cover A's text shares", async () => {
  await setup();
  await store.removeBook("ai-bbbbbbbbbbbbbbbb");
  ok((await store.getPicture(COVER.file)) !== null, "A's cover is gone with B's text");
  ok((await ids()) === "text-mine", `B sees: ${await ids()}`);
});

await test("Codex's second review: B deleting its texts leaves A's text from its AI and its cover", async () => {
  await setup();
  await store.clearReading();
  ok((await ids()) === "", `B sees after deleting: ${await ids()}`);
  store.setReadAccount("acct-a");
  ok((await ids()) === "ai-aaaaaaaaaaaaaaaa", `A sees: ${await ids()}`);
  ok((await store.getPicture(COVER.file)) !== null, "A's cover");
});

await test("on a device with one account, deleting your texts deletes everything in Read (as always)", async () => {
  await setup();
  await store.removeBook("ai-bbbbbbbbbbbbbbbb");
  store.setReadAccount("acct-a");
  await store.removeBook("ai-aaaaaaaaaaaaaaaa");
  await store.clearReading();
  ok((await ids()) === "" && (await store.getPicture(COVER.file)) === null, `left: ${await ids()}`);
});

/** A highlight in a text (words 1..3), with a note or not. */
async function highlight(bookId, note = "") {
  const found = await store.getBook(bookId);
  const row = marks.newHighlight({ book: bookId, version: found.text.version, start: 1, end: 3, quote: found.text.words.slice(1, 4).join(" "), note });
  await marks.saveHighlight(row);
  return row;
}

await test("highlights go with their text: removing it removes them, the other texts' stay", async () => {
  await setup();
  await marks.clearHighlights();
  await highlight("text-mine", "mijn notitie");
  await highlight("ai-bbbbbbbbbbbbbbbb");
  await store.removeBook("text-mine");
  const left = await marks.allHighlights();
  ok(left.length === 1 && left[0].book === "ai-bbbbbbbbbbbbbbbb", `left: ${JSON.stringify(left.map((h) => h.book))}`);
});

await test("a removed text's snapshot keeps its highlights, and putting it back brings them back as they were", async () => {
  await setup();
  await marks.clearHighlights();
  const made = await highlight("ai-bbbbbbbbbbbbbbbb", "voor later");
  const snapshot = await store.snapshotBook("ai-bbbbbbbbbbbbbbbb");
  await store.removeBook("ai-bbbbbbbbbbbbbbbb");
  ok((await marks.highlightsOf("ai-bbbbbbbbbbbbbbbb")).length === 0, "gone with it");
  await store.restoreBook(snapshot);
  const back = await marks.highlightsOf("ai-bbbbbbbbbbbbbbbb");
  ok(back.length === 1 && back[0].id === made.id && back[0].note === "voor later" && back[0].at === made.at, `back: ${JSON.stringify(back)}`);
});

await test("the export lists each text's highlights with their words and notes; deleting your texts deletes them", async () => {
  await setup();
  await marks.clearHighlights();
  const made = await highlight("text-mine", "een notitie");
  const exported = await store.readingExport();
  const mine = exported.find((t) => t.id === "text-mine");
  ok(mine?.highlights?.length === 1 && mine.highlights[0].quote === made.quote && mine.highlights[0].note === "een notitie" && !("book" in mine.highlights[0]), `exported: ${JSON.stringify(mine?.highlights)}`);
  ok(exported.find((t) => t.id === "ai-bbbbbbbbbbbbbbbb")?.highlights.length === 0, "none on the other");
  store.setReadAccount("acct-a");
  await store.removeBook("ai-aaaaaaaaaaaaaaaa");
  store.setReadAccount("acct-b");
  await store.removeBook("ai-bbbbbbbbbbbbbbbb");
  await store.clearReading();
  ok((await marks.allHighlights()).length === 0, "deleted with the texts");
});

await test("definitions are kept with their layer (a book's own apart), newer ones replace them, and they go with the text", async () => {
  await setup();
  const made = await book("text-defs", "Met uitleg", { kind: "file" });
  const layerDefs = { url: "/library/books/x/1/defs.nl.aaaaaaaaaaaa.json", file: { format: "lexicommons-definitions", entries: {} } };
  const ownDefs = { url: "/library/books/x/1/defs.en.bbbbbbbbbbbb.json", file: { format: "lexicommons-definitions", entries: {} } };
  await store.addBook(made, { en: { kind: "help", to: "en" } }, { definitions: { en: layerDefs, book: ownDefs } });
  ok((await store.getDefinitions("text-defs", "en"))?.url === layerDefs.url, "with its layer");
  ok((await store.getDefinitions("text-defs", "book"))?.url === ownDefs.url, "the book's own");
  const languages = (await store.weaveLanguages()).get("text-defs");
  ok(JSON.stringify(languages) === '["en"]', `its languages, the book's own definitions not one of them: ${JSON.stringify(languages)}`);
  const newer = { url: "/library/books/x/1/defs.nl.cccccccccccc.json", file: { format: "lexicommons-definitions", entries: {} } };
  await store.keepDefinitions("text-defs", "en", newer);
  ok((await store.getDefinitions("text-defs", "en"))?.url === newer.url && (await store.getWeave("text-defs", "en"))?.kind === "help", "newer ones kept, the layer as it was");
  await store.removeBook("text-defs");
  ok((await store.getDefinitions("text-defs", "en")) === null && (await store.getDefinitions("text-defs", "book")) === null, "gone with the text");
});

await test("a long highlight keeps its first words, cut at a word, with …", async () => {
  const long = Array.from({ length: 80 }, (_, k) => `woord${k}`).join(" ");
  const quote = marks.quoteOf(long);
  ok(quote.length <= marks.QUOTE_MAX + 1 && quote.endsWith("…") && /woord\d+…$/.test(quote) && long.startsWith(quote.slice(0, -1)), quote);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
