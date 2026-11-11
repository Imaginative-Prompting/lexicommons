// Weaving a text of yours with your AI, the server's side (src/texts.ts) on the real migrations in SQLite, uploads in memory:
// - the copy the app sends (storeWeaveText): checked as a book, one of the account's uploads (the limit counted), a new one for the
//   same text replacing one no request has named;
// - a weave request being made (claimWeaveText): only the account's own copy, of that text, within the hour, never two requests'
//   at once; tie keeps it for the request, release puts it back;
// - add_weave (addWeave): a language not open to a person's own weave (weave-languages.generated.js), a weave into another language, one that fails
//   the format's checks and one that fails the pipeline's split-forms check (Alice's accepted Dutch layer predates that rule, so it's
//   the control that the check is wired) all refused with nothing written; a clean one relayed as a change of kind "weave" with its
//   file served to the device as part "weave";
// - the copy deleted when the request finishes (dropWeaveText), and the tidy's sweep of copies past their time;
// - a weave of your own text never making it a text your AI may remove, and a weave never undone.
// `node scripts/test-weave-texts.mjs` (exit 0 = pass). The Worker's TypeScript loads through Node's own transform.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite, row } = workerEnv();
const T = await import(join(APP, "src/texts.ts"));
const { bookFromText } = await import(join(APP, "public/js/read/import-text.js"));
const { sentenceHash } = await import(join(APP, "public/js/read/book-format.js"));
const objects = env.UPLOADS.objects;

const USER = "user-weave";
const OTHER = "user-other";
const DEVICE = "device-weave-1";
const now = Date.now();
for (const id of [USER, OTHER]) sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, id, now);
sqlite.prepare("INSERT INTO pack_devices (user_id, device_id, label, packs, added_at, seen_at) VALUES (?, ?, 'Weave phone', '[]', ?, ?)").run(USER, DEVICE, now, now);

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(error?.stack ?? error).split("\n").slice(0, 6).join("\n      ")}`);
  }
}
async function refused(fn, pattern) {
  let error = null;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  assert.ok(error, "it wasn't refused");
  if (pattern) assert.match(String(error.message), pattern);
  return error.message;
}
const uploadsOf = (user, like = "%") => sqlite.prepare("SELECT id, purpose, source, r2_key FROM uploads WHERE user_id = ? AND purpose LIKE ? ORDER BY created_at").all(user, like);
const changes = () => sqlite.prepare("SELECT id, kind, text_id, body FROM text_changes WHERE user_id = ? ORDER BY seq").all(USER);

// ---------- a text of yours, and a weave of it ----------

/** A short text as the device keeps one you added (an id of its own), and a weave of it into Dutch that passes every check. */
async function textAndWeave(id = "you-cat-and-dog") {
  const book = await bookFromText("The cat sleeps. The dog barks.", { title: "Cat and dog", lang: "en" });
  book.id = id;
  const NL = { The: ["De", "de"], cat: ["kat", "kat"], "sleeps.": ["slaapt.", "slapen"], dog: ["hond", "hond"], "barks.": ["blaft.", "blaffen"] };
  const sentences = [];
  for (const [s, e] of book.sentences) {
    const words = book.words.slice(s, e);
    const t = words.map((w) => NL[w]);
    sentences.push({ s, e, h: await sentenceHash(book.words, s, e), t, text: t.map((x) => x[0]).join(" "), m: t.map((x, i) => [x[0], words[i], [i], null]) });
  }
  return { book, weave: { format: "lexicommons-weave", v: 1, kind: "weave", book: book.id, bookVersion: book.version, from: "en", to: "nl", sentences } };
}
const { book: BOOK, weave: WEAVE } = await textAndWeave();
const ALICE_DIR = join(APP, "library/books/carroll-alice-wonderland-opening/d6dba2b5a24f054f");
const ALICE = JSON.parse(readFileSync(join(ALICE_DIR, "book.json"), "utf8"));
const ALICE_NL = JSON.parse(readFileSync(join(ALICE_DIR, "weave.nl.eadf6e578bf6.json"), "utf8"));

/** A request for the text, as the app makes one: its copy sent, then claimed and tied to the request. */
async function requested(book, requestId) {
  const { upload } = await T.storeWeaveText(env, USER, { book });
  const claim = await T.claimWeaveText(env, USER, upload, book.id);
  await claim.tie(requestId);
  return upload;
}

// ---------- the copy the app sends ----------

await test("the copy: checked as a book, kept as one of the account's uploads (weave-in:<text>), the same text again replacing it", async () => {
  await refused(() => T.storeWeaveText(env, USER, { book: { ...BOOK, words: [] } }), /isn't a book this app reads/);
  await refused(() => T.storeWeaveText(env, USER, { text: "not a book" }), /\{ book \}/);
  assert.equal(uploadsOf(USER).length, 0, "a refused copy left a row");
  const first = await T.storeWeaveText(env, USER, { book: BOOK });
  assert.ok(first.upload && first.expiresAt > Date.now());
  const [row1] = uploadsOf(USER);
  assert.deepEqual([row1.purpose, row1.source], [`weave-in:${BOOK.id}`, "device"]);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(objects.get(row1.r2_key).bytes ?? (await env.UPLOADS.get(row1.r2_key).then((o) => o.arrayBuffer())))).id, BOOK.id);
  const second = await T.storeWeaveText(env, USER, { book: BOOK });
  const rows = uploadsOf(USER);
  assert.deepEqual(rows.map((r) => r.id), [second.upload], "the first copy should be replaced by the second");
  assert.ok(!objects.has(row1.r2_key), "the first copy's file is still stored");
});

await test("the copy takes one of the account's uploads: refused at the limit, the count made in the write", async () => {
  const filler = sqlite.prepare("INSERT INTO uploads (id, user_id, filename, content_type, status, source, created_at, expires_at, purpose) VALUES (?, ?, 'f', 'application/json', 'pending', 'pat:x', ?, ?, 'text:book')");
  for (let i = 0; i < 200; i++) filler.run(`fill${String(i).padStart(6, "0")}`, OTHER, now, now + 1);
  await refused(() => T.storeWeaveText(env, OTHER, { book: BOOK }), /already has 200 uploads/);
  sqlite.prepare("DELETE FROM uploads WHERE id = ?").run(`fill${"0".padStart(6, "0")}`);
  await T.storeWeaveText(env, OTHER, { book: BOOK });
  sqlite.prepare("DELETE FROM uploads WHERE user_id = ?").run(OTHER);
});

// ---------- making a request ----------

await test("a request's claim: only this account's copy, of that text, sent within the hour, never two requests' at once; release and tie", async () => {
  const { upload } = await T.storeWeaveText(env, USER, { book: BOOK });
  await refused(() => T.claimWeaveText(env, OTHER, upload, BOOK.id), /isn't here any more/);
  await refused(() => T.claimWeaveText(env, USER, upload, "another-text"), /isn't here any more/);
  const claim = await T.claimWeaveText(env, USER, upload, BOOK.id);
  await refused(() => T.claimWeaveText(env, USER, upload, BOOK.id), /isn't here any more/);
  await claim.release();
  const again = await T.claimWeaveText(env, USER, upload, BOOK.id);
  await again.tie("req-tied-1");
  assert.equal(uploadsOf(USER, "weave-for:%")[0]?.purpose, "weave-for:req-tied-1");
  const old = await T.storeWeaveText(env, USER, { book: BOOK });
  sqlite.prepare("UPDATE uploads SET created_at = ? WHERE id = ?").run(Date.now() - T.WEAVE_TEXT.unused - 1000, old.upload);
  await refused(() => T.claimWeaveText(env, USER, old.upload, BOOK.id), /isn't here any more/);
  await T.dropWeaveText(env, USER, "req-tied-1");
  assert.equal(uploadsOf(USER, "weave-for:req-tied-1").length, 0);
});

// ---------- add_weave ----------

await test("get_text's request: the text as the app sent it; a request with no copy said plainly", async () => {
  await requested(BOOK, "req-source");
  const book = await T.weaveSource(env, USER, "req-source");
  assert.deepEqual([book.id, book.version, book.words.length], [BOOK.id, BOOK.version, BOOK.words.length]);
  await refused(() => T.weaveSource(env, USER, "req-none"), /isn't here any more/);
  await refused(() => T.weaveSource(env, OTHER, "req-source"), /isn't here any more/);
});

const input = (over = {}) => ({ requestId: "req-source", title: "Cat and dog", language: "nl", weave: WEAVE, ...over });
const nothingWritten = (before) => {
  assert.equal(changes().length, before.changes, "a change was queued");
  assert.equal(uploadsOf(USER, "text-in:%").length, before.files, "a change's file was kept");
};
const state = () => ({ changes: changes().length, files: uploadsOf(USER, "text-in:%").length });

await test("add_weave refuses, writing nothing: a language not open to a weave, a weave into another language, one failing the format's checks", async () => {
  const before = state();
  // Japanese stays shut for a person's own weave (11 Nov 2026: its readings in a weave not yet seen in the reader).
  await refused(() => T.addWeave(env, USER, "oauth:Claude", input({ language: "ja" })), /isn't ready yet/);
  await refused(() => T.addWeave(env, USER, "oauth:Claude", input({ weave: { ...WEAVE, to: "de" } })), /to must be "nl"/);
  // A text of yours is woven, never given help or a parallel layer.
  for (const kind of ["help", "parallel"]) await refused(() => T.addWeave(env, USER, "oauth:Claude", input({ weave: { ...WEAVE, kind } })), /weave\.kind must be "weave"/);
  const broken = structuredClone(WEAVE);
  broken.sentences[1].t.pop(); // a word of the text with no entry
  const message = await refused(() => T.addWeave(env, USER, "oauth:Claude", input({ weave: broken })), /doesn't pass yet/);
  const short = structuredClone(WEAVE);
  short.sentences.pop();
  await refused(() => T.addWeave(env, USER, "oauth:Claude", input({ weave: short })), /one entry for each/);
  nothingWritten(before);
  return message;
});

await test("add_weave holds a weave to the pipeline's split-forms check: Alice's accepted Dutch layer (from before that rule) refused, saying where", async () => {
  await requested(ALICE, "req-alice");
  try {
    const before = state();
    const message = await refused(() => T.addWeave(env, USER, "oauth:Claude", input({ requestId: "req-alice", title: "Alice", weave: ALICE_NL })), /split from the rest of it|shown alone/);
    assert.match(message, /Sentence \d+, /, "it didn't say which sentence");
    assert.doesNotMatch(message, /shown as “[^”]*,/, "a gloss shown with its lemma");
    nothingWritten(before);
  } finally {
    await T.dropWeaveText(env, USER, "req-alice");
  }
});

let relayed;
await test("a clean weave: relayed as a change of kind weave (its title, language, the text's version, the request), its file served as part weave", async () => {
  relayed = await T.addWeave(env, USER, "oauth:Claude", input());
  assert.match(relayed.change_id, /^txc_/);
  assert.equal(relayed.text_id, BOOK.id);
  assert.deepEqual(relayed.devices, ["Weave phone"]);
  const [change] = changes().filter((c) => c.id === relayed.change_id);
  assert.equal(change.kind, "weave");
  assert.deepEqual(JSON.parse(change.body), { title: "Cat and dog", to: "nl", bookVersion: BOOK.version, request: "req-source" });
  const inbox = await T.textInbox(env, USER, DEVICE);
  assert.deepEqual(inbox.map((c) => [c.kind, c.textId]), [["weave", BOOK.id]], JSON.stringify(inbox.map((c) => [c.kind, c.textId, c.id])));
  const file = await T.serveTextFile(env, USER, relayed.change_id, "weave");
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("X-Lexicommons-Type"), "application/json");
  assert.deepEqual(JSON.parse(await file.text()), WEAVE);
  assert.equal((await T.serveTextFile(env, OTHER, relayed.change_id, "weave")).status, 404, "another account got the file");
});

await test("the request done: its copy goes; the device without the text says missing, and once every device has said, the weave's file goes", async () => {
  await T.dropWeaveText(env, USER, "req-source");
  assert.equal(uploadsOf(USER, "weave-for:%").length, 0, "the copy stayed");
  await T.reportText(env, USER, DEVICE, relayed.change_id, { state: "missing" });
  assert.equal(uploadsOf(USER, `text-in:${relayed.change_id}`).length, 0, "the weave's file stayed after every device said");
});

// ---------- a weave in a text's history ----------

await test("a weave of your own text never makes it one your AI may remove, and a weave is never undone", async () => {
  await refused(() => T.removeText(env, USER, "oauth:Claude", { text_id: BOOK.id }), /stay theirs/);
  await refused(() => T.undoTextChange(env, USER, "oauth:Claude", relayed.change_id), /can't be undone/);
  // The control: a text your AI added, then woven, can still be removed.
  sqlite.prepare("INSERT INTO text_changes (id, user_id, text_id, kind, body, said, source, undoes, created_at, expires_at) VALUES ('txc_addcontrol01', ?, 'ai-added-text', 'add', NULL, 'added “A text”', 'oauth:Claude', NULL, ?, ?)").run(USER, now, now);
  const { book: aiBook, weave: aiWeave } = await textAndWeave("ai-added-text");
  await requested(aiBook, "req-ai-text");
  await T.addWeave(env, USER, "oauth:Claude", input({ requestId: "req-ai-text", weave: aiWeave }));
  const removed = await T.removeText(env, USER, "oauth:Claude", { text_id: "ai-added-text", title: "A text" });
  assert.match(removed.said, /removed/);
  await refused(() => T.undoTextChange(env, USER, "oauth:Claude", "txc_addcontrol01"), /remove the text instead|undo that one first/);
  await T.dropWeaveText(env, USER, "req-ai-text");
});

// ---------- the sweep ----------

await test("the tidy: a copy no request named after an hour, a claim never finished, and a request's copy past 15 days go; fresh ones stay", async () => {
  const unused = await T.storeWeaveText(env, USER, { book: BOOK });
  const fresh = await requested((await textAndWeave("you-fresh")).book, "req-fresh");
  const stale = await requested((await textAndWeave("you-stale")).book, "req-stale");
  const claimed = await T.storeWeaveText(env, USER, { book: (await textAndWeave("you-claimed")).book });
  await T.claimWeaveText(env, USER, claimed.upload, "you-claimed");
  const old = Date.now() - T.WEAVE_TEXT.unused - 1000;
  sqlite.prepare("UPDATE uploads SET created_at = ? WHERE id IN (?, ?)").run(old, unused.upload, claimed.upload);
  sqlite.prepare("UPDATE uploads SET created_at = ? WHERE id = ?").run(Date.now() - T.WEAVE_TEXT.kept - 1000, stale);
  sqlite.prepare("UPDATE uploads SET created_at = ? WHERE id = ?").run(old, fresh); // a request's copy an hour old stays: its request is open
  await T.tidy(env, USER, Date.now());
  const left = uploadsOf(USER, "weave-%").map((r) => r.id);
  assert.deepEqual(left, [fresh], `left: ${JSON.stringify(uploadsOf(USER, "weave-%"))}`);
});

// A sentence in the weave guide's form (src/weave-answer.ts), from [English, Dutch, lemma] per word and the literal line's [target, cue, sources, lemma].
const answerOf = (t, text, m) => ({ sentences: [{ x: 0, t: t.map(([w, target, lemma]) => ({ w, target, lemma })), text, m: m.map(([target, cue, sources, lemma]) => ({ target, cue, sources, lemma })) }] });
// lx-audit's two sentences (10 Nov, cold from the guide): "her" the possessive, glossed haar with its own lemma as the rules say ("a possessive
// (haar, zijn, mijn) … is its own lemma"), after a separable verb the check reads it as the object of.
const POSSESSIVES = [
  {
    text: "She called her brother up before breakfast.",
    t: (her) => [["She", "Ze", "zij"], ["called", "belde", "opbellen"], ["her", "haar", her], ["brother", "broer", "broer"], ["up", "op", "opbellen"], ["before", "voor", "voor"], ["breakfast.", "het ontbijt.", "ontbijt"]],
    nl: "Ze belde haar broer op voor het ontbijt.",
    m: (her) => [["Ze", "She", [0], "zij"], ["belde", "called", [1], "opbellen"], ["haar", "her", [2], her], ["broer", "brother", [3], "broer"], ["op", "up", [4], "opbellen"], ["voor", "before", [5], "voor"], ["het", "the", [], "het"], ["ontbijt.", "breakfast", [6], "ontbijt"]],
  },
  {
    text: "Anna put her coat on and walked to the cheese stall.",
    t: (her) => [["Anna", "Anna", null], ["put", "trok", "aantrekken"], ["her", "haar", her], ["coat", "jas", "jas"], ["on", "aan", "aantrekken"], ["and", "en", "en"], ["walked", "liep", "lopen"], ["to", "naar", "naar"], ["the", "de", "de"], ["cheese", "kaas", "kaas"], ["stall.", "kraam.", "kraam"]],
    nl: "Anna trok haar jas aan en liep naar de kaaskraam.",
    m: (her) => [["Anna", "Anna", [0], null], ["trok", "put", [1], "aantrekken"], ["haar", "her", [2], her], ["jas", "coat", [3], "jas"], ["aan", "on", [4], "aantrekken"], ["en", "and", [5], "en"], ["liep", "walked", [6], "lopen"], ["naar", "to", [7], "naar"], ["de", "the", [8], "de"], ["kaaskraam.", "cheese stall", [9, 10], "kaaskraam"]],
  },
];

await test("a possessive her (haar, its own lemma) after a verb is never taken for an object pronoun shown alone; her as the object (lemma zij) still is", async () => {
  for (const [n, one] of POSSESSIVES.entries()) {
    const book = await bookFromText(one.text, { title: `possessive ${n}`, lang: "en" });
    book.id = `you-possessive-${n}`;
    // The control first: the same weave with "her" read as the object (the subject form's lemma): refused, as before.
    await requested(book, `req-object-${n}`);
    const before = state();
    await refused(() => T.addWeave(env, USER, "oauth:Claude", input({ requestId: `req-object-${n}`, title: one.text, weave: answerOf(one.t("zij"), one.nl, one.m("zij")) })), /an object pronoun shown alone/);
    nothingWritten(before);
    await T.dropWeaveText(env, USER, `req-object-${n}`);
    // The possessive, as the rules have it: kept and relayed.
    await requested(book, `req-possessive-${n}`);
    const kept = await T.addWeave(env, USER, "oauth:Claude", input({ requestId: `req-possessive-${n}`, title: one.text, weave: answerOf(one.t("haar"), one.nl, one.m("haar")) }));
    assert.match(kept.change_id, /^txc_/);
    await T.dropWeaveText(env, USER, `req-possessive-${n}`);
  }
});

await test("the mix check's pronoun list as the pipeline gives it: an empty list (German's, Russian's) counts no pronoun left alone, no list counts any, a list counts its own", async () => {
  const { splitForms } = await import(join(APP, "src/split-forms.generated.ts"));
  const { WEAVE_SPLIT } = await import(join(APP, "src/weave-rules.generated.ts"));
  const { weaveFromAnswer } = await import(join(APP, "src/weave-answer.ts"));
  // German and Russian arrive with a list, empty: never left out (no list means any pronoun counts).
  for (const code of ["de", "ru"]) {
    assert.ok(Array.isArray(WEAVE_SPLIT[code]?.objectPronouns), `${code}: no pronoun list reached the app: ${JSON.stringify(WEAVE_SPLIT[code])}`);
    assert.equal(WEAVE_SPLIT[code].objectPronouns.length, 0, `${code}: its list isn't empty: ${JSON.stringify(WEAVE_SPLIT[code])}`);
  }
  // One sentence with "her" as the object (lemma zij) shown alone after an English verb, read with each kind of list.
  const one = POSSESSIVES[0];
  const book = await bookFromText(one.text, { title: "pronoun lists", lang: "en" });
  const made = await weaveFromAnswer(book, "nl", answerOf(one.t("zij"), one.nl, one.m("zij")));
  assert.ok(made.weave, `the planted weave wasn't made: ${made.problems.join("; ")}`);
  const alone = (rules) => splitForms(book, made.weave, rules).filter((f) => f.kind === "word:pronoun-alone").length;
  assert.ok(alone(WEAVE_SPLIT.nl) > 0, "the control: Dutch's own list doesn't count its pronoun left alone");
  assert.ok(alone({}) > 0, "no list doesn't count a pronoun left alone");
  assert.equal(alone({ objectPronouns: [] }), 0, "an empty list counts a pronoun left alone");
  assert.equal(alone(WEAVE_SPLIT.de), 0, "German's rules count a pronoun left alone");
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
