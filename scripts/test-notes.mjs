// A pack's notes (study/pack-notes.js, study/notes.js): the format's every refusal, against its pack; the same bytes for the same input; a note that no longer fits its sentence showing nowhere, and a new version
// of the pack keeping the rest; a sentence's marks; the catalog's entry; the device's side with a stand-in library: taken, kept, a changed file refused, nothing fetched twice. The notes'
// own worker (notes-worker.js) on its own, and the page with one: every file taken and read back there, none fetched, checked or read from Cache Storage on the page; a refusal said; a
// worker that fails leaving it to the page. In Node (exit 0 = pass).
//   node scripts/test-notes.mjs [<app dir>]   (another copy's notes.js, to see it fail on one from before)
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { withoutNotes, checkForms, checkNotes, formLine, formLines, formsCatalogueProblems, formsKey, formsRef, formsUrl, notesCatalogueProblems, notesFor, notesKey, notesRef, notesText, notesUrl, notesVersion, withFormsEntry, withNotesEntry, FORMS_LIMITS, NOTES_LIMITS } from "../public/js/study/pack-notes.js";
import { CACHE, answer, packed, read, take } from "../public/js/study/notes-worker.js";

const NOTES_JS = pathToFileURL(join(process.argv[2] ? resolve(process.argv[2]) : new URL("..", import.meta.url).pathname, "public/js/study/notes.js")).href;
const { formNow, formOfWord, notesNow, notesOfItem, notesReady, syncForms, syncNotes } = await import(NOTES_JS);

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
const eq = (a, b, what = "") => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what ? `${what}: ` : ""}${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
};
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
const PACK = {
  id: "path-xx",
  language: "nl",
  items: [
    { id: "s1", text: "Morgen ga ik.", means: "Tomorrow I'm going.", words: [["Morgen", "morgen"], ["ga", "gaan"], ["ik", "ik"]], punct: ".", concepts: ["v2"] },
    { id: "s2", text: "Ik drink koffie.", means: "I drink coffee.", words: [["Ik", "ik"], ["drink", "drinken"], ["koffie", "koffie"]], punct: ".", concepts: ["present"] },
    { id: "plain", text: "de zolder", means: "the attic" },
  ],
};
const NOTES = {
  format: "lexicommons-notes",
  version: 1,
  pack: "path-xx",
  language: "nl",
  source: { by: "Lexicommons", drafted: "gpt-6.1-sol", reviewed: "2 rounds", at: "2026-11-05" },
  items: {
    s1: { text: "Morgen ga ik.", words: [{ role: "time word" }, { role: "main verb", form: "form of gaan used with ik", why: "With Morgen first, ga comes next.", concept: "v2", differs: "English keeps I first" }, { role: "who does it", concept: "v2" }] },
    s2: { text: "Ik drink koffie.", words: [{ role: "who does it" }, { role: "main verb", concept: "present" }, { role: "what's being drunk" }] },
  },
};
const copy = (value) => JSON.parse(JSON.stringify(value));
const errorsOf = (value, pack = PACK) => checkNotes(value, pack).errors.map((e) => e.at);

await test("good notes pass, against the pack and without it, the same bytes either way; null fields go", () => {
  const raw = copy(NOTES);
  raw.items.s2.words[0].why = null;
  const { notes, errors, warnings } = checkNotes(raw, PACK);
  eq(errors, []);
  eq(warnings, []);
  eq(notesText(notes), notesText(checkNotes(NOTES).notes), "same input, same bytes");
  eq(Object.keys(notes.items.s2.words[0]), ["role"]);
});

await test("every refusal, in words", () => {
  eq(checkNotes(null).notes, null);
  eq(errorsOf({ ...copy(NOTES), format: "x" }), ["format"]);
  eq(errorsOf({ ...copy(NOTES), version: 2 }), ["version"]);
  eq(errorsOf({ ...copy(NOTES), pack: "other-pack" }), ["pack"]);
  eq(errorsOf({ ...copy(NOTES), language: "de" }), ["language"]);
  eq(errorsOf({ ...copy(NOTES), source: {} }), ["source"]);
  eq(errorsOf({ ...copy(NOTES), items: [] }), ["items"]);
  const wrongCount = copy(NOTES);
  wrongCount.items.s1.words.pop();
  eq(errorsOf(wrongCount), ["items.s1.words"], "a word short");
  const wrongConcept = copy(NOTES);
  wrongConcept.items.s1.words[1].concept = "present";
  eq(errorsOf(wrongConcept), ["items.s1.words[1].concept"], "a concept the sentence doesn't name");
  const long = copy(NOTES);
  long.items.s1.words[1].why = "x".repeat(NOTES_LIMITS.why + 1);
  eq(errorsOf(long), ["items.s1.words[1].why"]);
  const empty = copy(NOTES);
  empty.items.s1.words[1].why = "   ";
  eq(errorsOf(empty), ["items.s1.words[1].why"]);
  const kind = copy(NOTES);
  kind.items.s1.words[1] = "not an object";
  eq(errorsOf(kind), ["items.s1.words[1]"]);
  const crafted = copy(NOTES);
  crafted.items.s1.words[1].why = { toString: null };
  ok(errorsOf(crafted).length === 1, "an object for text isn't coerced");
});

await test("a note for a sentence that's gone or changed is a warning, stays in the file, and shows nowhere", () => {
  const next = copy(PACK);
  next.items[0] = { ...next.items[0], text: "Morgen ga ik weg.", words: [["Morgen", "morgen"], ["ga", "gaan"], ["ik", "ik"], ["weg.", "weg"]] };
  next.items.splice(1, 1);
  const { notes, errors, warnings } = checkNotes(NOTES, next);
  eq(errors, [], "a wrong count on a changed sentence isn't an error");
  eq(warnings.length, 2);
  ok(notes.items.s2, "it stays in the file");
  eq(notesFor(notes, next.items[0]), null, "changed");
  eq(notesFor(notes, { id: "gone", text: "x", words: [["x"]] }), null, "gone");
  ok(notesFor(notes, PACK.items[1]), "the one that's the same, on the old version");
});

await test("a sentence's notes: by its id as the view has it, with each concept's words marked; none for a plain item", () => {
  const { notes } = checkNotes(NOTES, PACK);
  const view = { ...PACK.items[0], id: "path-xx/s1", pack: "path-xx" };
  const got = notesFor(notes, view);
  eq(got.marks, { v2: [1, 2] });
  eq(got.words[1].role, "main verb");
  eq(notesFor(notes, PACK.items[2]), null);
  eq(notesFor(null, view), null);
  eq(notesFor(notes, null), null);
  ok(notesFor(notes, { ...view, id: "__proto__" }) === null, "an id off the prototype");
});

await test("the catalog: its entry names exactly where the version lives, and others aren't believed", async () => {
  const { notes } = checkNotes(NOTES, PACK);
  const v = await notesVersion(notes);
  eq(notesUrl("path-xx", v), `/library/${notesKey("path-xx", v)}`);
  const entry = { version: v, url: notesUrl("path-xx", v), sentences: 2 };
  const catalogue = withNotesEntry({ packs: {} }, "path-xx", entry);
  eq(notesRef(catalogue, "path-xx"), entry);
  eq(notesCatalogueProblems(catalogue), []);
  eq(notesCatalogueProblems({}), []);
  eq(notesRef(withNotesEntry({}, "path-xx", { ...entry, url: "/elsewhere.json" }), "path-xx"), null);
  eq(notesCatalogueProblems(withNotesEntry({}, "path-xx", { ...entry, url: "/elsewhere.json" })).length, 1);
  eq(notesCatalogueProblems({ notes: [] }).length, 1);
  eq(notesRef(catalogue, "__proto__"), null);
  eq(notesRef(withoutNotes(catalogue, "path-xx"), "path-xx"), null, "a pack taken off takes them");
  eq(withoutNotes(catalogue, "another"), catalogue);
  eq(withoutNotes({ packs: {} }, "path-xx"), { packs: {} });
});

await test("the device: taken and kept, not fetched again; a changed file refused and the old one staying; a new one replacing it", async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const { notes } = checkNotes(NOTES, PACK);
  const version = await notesVersion(notes);
  const url = notesUrl("path-xx", version);
  let asked = 0;
  let serve = notesText(notes);
  globalThis.fetch = async (at) => {
    asked++;
    ok(at === url || at.startsWith("/library/notes/path-xx/"), `fetched ${at}`);
    return new Response(serve, { status: 200 });
  };
  const catalogue = withNotesEntry({}, "path-xx", { version, url, sentences: 2 });
  const view = { ...PACK.items[0], id: "path-xx/s1", pack: "path-xx" };
  eq(notesNow(view), null, "before");
  eq(await syncNotes(catalogue, ["path-xx"]), []);
  eq(asked, 1);
  ok(notesNow(view)?.marks?.v2, "at once, after a sync");
  ok((await notesOfItem(view))?.words?.length === 3, "and asked for");
  // A copy (copyOf, pack-format.js) of that sentence, in a pack with no notes of its own: its source's, at once and asked for.
  const copied = { ...PACK.items[0], id: "path-xx/s1", pack: "nl-food-1", copyOf: "path-xx" };
  ok(notesNow(copied)?.marks?.v2, "a copy's, at once: its source's");
  ok((await notesOfItem(copied))?.words?.length === 3, "a copy's, asked for: its source's");
  eq(await syncNotes(catalogue, ["path-xx"]), []);
  eq(asked, 1, "the same version isn't fetched again");
  eq(await syncNotes({}, ["path-xx"]), [], "a catalog with none");
  eq(await syncNotes(catalogue, ["another-pack"]), [], "a pack the catalog has no notes for");
  eq(asked, 1);
  // A file that doesn't match what the catalog says: refused, and the one here stays.
  const other = copy(NOTES);
  other.items.s1.words[0].role = "a changed role";
  const otherNotes = checkNotes(other, PACK).notes;
  const otherVersion = await notesVersion(otherNotes);
  const next = withNotesEntry({}, "path-xx", { version: otherVersion, url: notesUrl("path-xx", otherVersion), sentences: 2 });
  const refused = await syncNotes(next, ["path-xx"]);
  eq(refused.length, 1, "its content doesn't match");
  ok(/match/.test(refused[0].message), refused[0].message);
  eq(notesNow(view).words[0].role, "time word", "the one here stays");
  serve = notesText(otherNotes);
  eq(await syncNotes(next, ["path-xx"]), []);
  eq(notesNow(view).words[0].role, "a changed role", "the new one");
  // Offline: said, and nothing lost.
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  const third = withNotesEntry({}, "path-xx", { version: "0123456789ab", url: notesUrl("path-xx", "0123456789ab"), sentences: 2 });
  eq((await syncNotes(third, ["path-xx"])).length, 1);
  eq(notesNow(view).words[0].role, "a changed role");
  await notesReady(["path-xx", "unknown-pack"]);
  eq(await notesOfItem({ id: "x", text: "x" }), null, "no pack");
});

const FORMS = { format: "lexicommons-forms", version: 1, language: "nl", source: { by: "Lexicommons", drafted: "gpt-6.1-sol" }, forms: { huis: { huizen: "plural of huis" }, gaan: { ga: "gaan with ik; with jij or je after the verb; also a command", gaat: "gaan with -t" } } };

await test("a language's forms: every refusal; the same bytes for the same input; a line by the word as it's written, with its punctuation and capital off", () => {
  const { forms, errors } = checkForms(FORMS);
  eq(errors, []);
  eq(notesText(forms), notesText(checkForms(copy(FORMS)).forms));
  eq(formLines(forms), 3);
  eq(formLine(forms, "gaan", "Ga"), FORMS.forms.gaan.ga);
  eq(formLine(forms, "huis", "huizen,"), "plural of huis");
  eq(formLine(forms, "huis", "huis"), null, "the dictionary form says nothing");
  eq(formLine(forms, "nope", "huizen"), null);
  eq(formLine(null, "huis", "huizen"), null);
  eq(formLine(forms, "__proto__", "x"), null);
  eq(formLine(forms, "huis", "__proto__"), null);
  const at = (value) => checkForms(value).errors.map((e) => e.at);
  eq(checkForms(null).forms, null);
  eq(at({ ...copy(FORMS), format: "x" }), ["format"]);
  eq(at({ ...copy(FORMS), version: 2 }), ["version"]);
  eq(at({ ...copy(FORMS), language: "dutch" }), ["language"]);
  eq(at({ ...copy(FORMS), source: {} }), ["source"]);
  eq(at({ ...copy(FORMS), forms: [] }), ["forms"]);
  eq(at({ ...copy(FORMS), forms: { huis: "x" } }), ["forms.huis"]);
  eq(at({ ...copy(FORMS), forms: { huis: { huizen: "" } } }), ["forms.huis.huizen"]);
  eq(at({ ...copy(FORMS), forms: { huis: { huizen: "x".repeat(FORMS_LIMITS.line + 1) } } }), ["forms.huis.huizen"]);
  eq(at({ ...copy(FORMS), forms: { huis: { huizen: { toString: null } } } }), ["forms.huis.huizen"], "an object for text isn't coerced");
});

await test("forms in the catalog, and the device: taken, kept, a changed file refused, another language's not used", async () => {
  const { forms } = checkForms(FORMS);
  const version = await notesVersion(forms);
  const url = formsUrl("nl", version);
  eq(url, `/library/${formsKey("nl", version)}`);
  const catalogue = withFormsEntry({}, "nl", { version, url, lines: 3 });
  eq(formsRef(catalogue, "nl"), { version, url, lines: 3 });
  eq(formsCatalogueProblems(catalogue), []);
  eq(formsCatalogueProblems({}), []);
  eq(formsCatalogueProblems({ forms: [] }).length, 1);
  eq(formsRef(withFormsEntry({}, "nl", { version, url: "/elsewhere.json" }), "nl"), null);
  eq(formsRef(catalogue, "__proto__"), null);
  let asked = 0;
  let serve = notesText(forms);
  globalThis.fetch = async () => {
    asked++;
    return new Response(serve, { status: 200 });
  };
  eq(formNow("nl", "huis", "huizen"), null, "before");
  eq(await syncForms(catalogue, "nl"), []);
  eq(asked, 1);
  eq(formNow("nl", "huis", "Huizen."), "plural of huis");
  eq(await formOfWord("nl", "gaan", "gaat"), "gaan with -t");
  eq(await syncForms(catalogue, "nl"), []);
  eq(asked, 1, "the same version isn't fetched again");
  eq(await syncForms(catalogue, "de"), [], "none for German");
  eq(formNow("de", "huis", "huizen"), null);
  // A file that isn't what the catalog says: said, and the one here stays.
  const next = withFormsEntry({}, "nl", { version: "0123456789ab", url: formsUrl("nl", "0123456789ab"), lines: 3 });
  serve = notesText(checkForms({ ...copy(FORMS), forms: { huis: { huizen: "changed on the way" } } }).forms);
  eq((await syncForms(next, "nl")).length, 1);
  eq(formNow("nl", "huis", "huizen"), "plural of huis");
});

// ---------- the notes' own worker (notes-worker.js) ----------

/** Cache Storage as a worker has it: named caches of url → the body's text. */
function standInCaches() {
  const named = new Map();
  return {
    named,
    open: async (name) => {
      if (!named.has(name)) named.set(name, new Map());
      const store = named.get(name);
      return {
        put: async (url, response) => void store.set(String(url), await response.text()),
        match: async (url) => (store.has(String(url)) ? new Response(store.get(String(url))) : undefined),
        delete: async (url) => store.delete(String(url)),
      };
    },
  };
}
const answering = (body, status = 200) => async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

await test("the notes' worker: a file taken, checked, versioned and kept, the one before deleted; every refusal said with nothing kept; a kept copy read back and checked again", async () => {
  const { notes } = checkNotes(NOTES, PACK);
  const version = await notesVersion(notes);
  const url = notesUrl("path-xx", version);
  const caches = standInCaches();
  const before = notesUrl("path-xx", "000000000000");
  await (await caches.open(CACHE)).put(before, new Response("{}"));
  const got = await take({ kind: "notes", url, owner: "path-xx", version, old: before }, { fetch: answering(notesText(notes)), caches });
  eq(notesText(got.value), notesText(notes), "the checked notes handed back");
  const kept = caches.named.get(CACHE);
  eq([...kept.keys()], [url], "kept under its url, the one before gone");
  eq(kept.get(url), notesText(notes), "kept as checked");
  eq(notesText((await read({ kind: "notes", url, owner: "path-xx" }, { caches })).value), notesText(notes), "read back");
  eq((await read({ kind: "notes", url, owner: "path-yy" }, { caches })).value, null, "as another pack's: none");
  eq((await read({ kind: "notes", url: notesUrl("path-xx", "ffffffffffff"), owner: "path-xx" }, { caches })).value, null, "not kept: none");
  eq((await read({ kind: "notes", url, owner: "path-xx" }, {})).value, null, "no Cache Storage: none");
  const refused = async (message, fetch, what) => {
    const was = [...kept.keys()];
    let said = null;
    try {
      await take(message, { fetch, caches });
    } catch (error) {
      said = error.message;
    }
    ok(said !== null && what.test(said), `${what}: ${said}`);
    eq([...kept.keys()], was, `${what}: nothing kept`);
  };
  const next = { kind: "notes", url: notesUrl("path-xx", "0123456789ab"), owner: "path-xx", version: "0123456789ab", old: url };
  await refused(next, answering("", 404), /^404$/);
  await refused(next, answering("not json"), /JSON/);
  await refused(next, answering({ ...copy(NOTES), format: "x" }), /format/);
  await refused(next, answering(notesText(notes)), /doesn't match their version \(0123456789ab\)/);
  await refused({ ...next, version, owner: "path-yy" }, answering(notesText(notes)), /they're path-xx's/);
  await refused({ ...next, kind: "words" }, answering(notesText(notes)), /no kind/);
  kept.set(url, JSON.stringify({ ...copy(NOTES), format: "changed under it" }));
  eq((await read({ kind: "notes", url, owner: "path-xx" }, { caches })).value, null, "a kept copy changed under it: none");
  // A language's forms the same way.
  const { forms } = checkForms(FORMS);
  const formsVersion = await notesVersion(forms);
  const formsAt = formsUrl("nl", formsVersion);
  eq(notesText((await take({ kind: "forms", url: formsAt, owner: "nl", version: formsVersion }, { fetch: answering(notesText(forms)), caches })).value), notesText(forms));
  eq(formLine((await read({ kind: "forms", url: formsAt, owner: "nl" }, { caches })).value, "huis", "huizen"), "plural of huis");
  eq((await read({ kind: "forms", url: formsAt, owner: "de" }, { caches })).value, null, "as another language's: none");
  await refused({ kind: "forms", url: formsUrl("de", formsVersion), owner: "de", version: formsVersion }, answering(notesText(forms)), /they're nl's/);
  // As the worker answers: packed, or the refusal in words, by the number it came with.
  const reply = await answer({ op: "read", kind: "forms", url: formsAt, owner: "nl", seq: 7 }, { caches });
  eq(reply, { seq: 7, value: packed("forms", forms) });
  eq(Object.keys(reply.value.forms), Object.keys(forms.forms));
  eq((await answer({ op: "take", kind: "forms", url: formsUrl("de", formsVersion), owner: "de", version: formsVersion, seq: 8 }, { fetch: answering(notesText(forms)), caches })), { seq: 8, error: "they're nl's" });
  eq((await answer({ op: "sweep", seq: 9 }, { caches })), { seq: 9, error: "no such work" });
  eq(packed("notes", null), null);
});

await test("the page with a worker: every notes and forms file taken and read back in the worker, none fetched, checked or read from Cache Storage on the page; a refusal said; a worker that fails leaving it to the page", async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const { notes } = checkNotes(NOTES, PACK);
  const version = await notesVersion(notes);
  const { forms } = checkForms(FORMS);
  const formsVersion = await notesVersion(forms);
  const catalogue = withFormsEntry(withNotesEntry({}, "path-xx", { version, url: notesUrl("path-xx", version), sentences: 2 }), "nl", { version: formsVersion, url: formsUrl("nl", formsVersion), lines: 3 });
  // The library as the worker reaches it; the page's own fetch and Cache Storage counted, and refusing.
  const files = new Map([[notesUrl("path-xx", version), notesText(notes)], [formsUrl("nl", formsVersion), notesText(forms)]]);
  const workerCaches = standInCaches();
  let workerFetches = 0;
  const workerFetch = async (url) => (workerFetches++, files.has(url) ? new Response(files.get(url)) : new Response("", { status: 404 }));
  let onPage = 0;
  const keep = { fetch: globalThis.fetch, caches: globalThis.caches, Worker: globalThis.Worker };
  globalThis.fetch = async () => {
    onPage++;
    throw new Error("the page fetched");
  };
  globalThis.caches = {
    open: async () => {
      onPage++;
      throw new Error("the page opened Cache Storage");
    },
  };
  const made = [];
  const posted = [];
  let fails = false;
  globalThis.Worker = class {
    constructor(url, options) {
      made.push({ url: String(url), type: options?.type });
    }
    postMessage(data) {
      // As a worker gets it and answers: copies both ways.
      const message = structuredClone(data);
      if (fails) return void setTimeout(() => this.onerror?.(new Error("the worker failed")), 0);
      answer(message, { fetch: workerFetch, caches: workerCaches }).then((reply) => {
        posted.push(reply);
        setTimeout(() => this.onmessage?.({ data: structuredClone(reply) }), 0);
      });
    }
    terminate() {}
  };
  try {
    const page = await import(`${NOTES_JS}?with-a-worker`);
    const view = { ...PACK.items[0], id: "path-xx/s1", pack: "path-xx" };
    eq(await page.syncNotes(catalogue, ["path-xx"]), [], "the notes taken");
    eq(await page.syncForms(catalogue, "nl"), [], "the forms taken");
    eq(onPage, 0, "nothing fetched or read from Cache Storage on the page");
    eq(workerFetches, 2, "both fetched by the worker");
    // What came across: each entry its own JSON (a whole checked file read out of a message held the page 50 ms at 4×), every other field as is.
    const [notesPosted, formsPosted] = posted;
    ok(Object.values(notesPosted.value.items).every((entry) => typeof entry === "string") && Object.values(formsPosted.value.forms).every((entry) => typeof entry === "string"), "every entry a string");
    eq(JSON.parse(notesPosted.value.items.s1), notes.items.s1, "a sentence's notes as checked");
    eq({ ...notesPosted.value, items: null }, { ...notes, items: null }, "the rest as checked");
    eq(JSON.parse(formsPosted.value.forms.gaan), forms.forms.gaan, "a word's forms as checked");
    ok(made.length >= 1 && made.every((one) => one.url.endsWith("/study/notes-worker.js") && one.type === "module"), `the worker made: ${JSON.stringify(made)}`);
    ok(page.notesNow(view)?.marks?.v2, "the notes at once, after a sync");
    eq(page.formNow("nl", "huis", "huizen"), "plural of huis", "the forms at once, after a sync");
    // The next start: read back through the worker.
    const next = await import(`${NOTES_JS}?the-next-start`);
    eq(next.notesNow(view), null, "not before they're read");
    await next.notesReady(["path-xx"]);
    await next.formsReady("nl");
    ok(next.notesNow(view)?.marks?.v2, "read back");
    eq(next.formNow("nl", "gaan", "Gaat"), "gaan with -t", "the forms read back");
    eq((await next.notesOfItem(view))?.words?.length, 3, "asked for");
    eq(onPage, 0, "nothing on the page");
    // A file that isn't what the catalog says: the worker's refusal said, the page fetching nothing, the one here staying.
    const otherVersion = "0123456789ab";
    const other = withNotesEntry({}, "path-xx", { version: otherVersion, url: notesUrl("path-xx", otherVersion), sentences: 2 });
    files.set(notesUrl("path-xx", otherVersion), notesText(notes));
    const refused = await page.syncNotes(other, ["path-xx"]);
    eq(refused.length, 1, "refused");
    ok(/doesn't match their version/.test(refused[0].message), refused[0].message);
    eq(onPage, 0, "the page took nothing itself");
    ok(page.notesNow(view)?.marks?.v2, "the one here stays");
    // A worker that fails: the page takes it itself.
    fails = true;
    const changed = copy(NOTES);
    changed.items.s1.words[0].role = "a changed role";
    const changedNotes = checkNotes(changed, PACK).notes;
    const changedVersion = await notesVersion(changedNotes);
    globalThis.fetch = async () => (onPage++, new Response(notesText(changedNotes)));
    globalThis.caches = undefined;
    eq(await page.syncNotes(withNotesEntry({}, "path-xx", { version: changedVersion, url: notesUrl("path-xx", changedVersion), sentences: 2 }), ["path-xx"]), []);
    eq(onPage, 1, "taken on the page");
    eq(page.notesNow(view).words[0].role, "a changed role");
  } finally {
    Object.assign(globalThis, keep);
  }
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
