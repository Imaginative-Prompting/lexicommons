// The AI guides hold true (src/pack-guide.ts, src/text-guide.ts, src/weave-guide.ts), on the real migrations in Node's SQLite with uploads in memory
// (scripts/fixtures/worker-env.mjs), every tool called through its own schema as an AI calls it:
// - each guide as its tool serves it: whole, every example and every listed refusal in it, each example shown as JSON that parses back to it;
// - the pack guide's examples through the real tools: its whole new pack (create_pack), its smallest sentence (add_items), the other gender's
//   and a language with readings (check_items), each kept with no problem and no warning;
// - the text guide's example the way it says: request_text_upload, the file PUT to its signed link (library.ts receiveUpload), add_text; made into
//   a book of the chapters it names; a text in a language written without spaces, as plain text and as the guide's book of split words;
// - the weave guide's: the text made into a book as the app makes one, numbered as get_text hands it over (the guide's to_weave), its weave in the
//   guide's form through add_weave (a request's text as the app sends it), and what the guide says the learner reads at each level the reader's own
//   render (read/woven-text.js wovenParagraphs), its FLIP_AT the reader's;
// - every refusal each guide lists planted, each refused with the words the guide says it comes with (… the part that changes); a listed refusal
//   with no plant, or a plant the guide doesn't list, fails; the controls show the matching can fail.
// `node scripts/test-guides.mjs` (exit 0 = pass).

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

// mcp-texts.ts reaches the practice room's class (cloudflare:workers): only DurableObject, as test-practice-room.mjs stands it in.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }", shortCircuit: true };
    return next(specifier, context);
  },
});

const { env, sqlite } = workerEnv();
env.UPLOAD_SIGNING_SECRET = "test-guides-signing";
env.PUBLIC_ORIGIN = "https://lexicommons.test";
const USER = "user-guides";
const DEVICE = "device-guides-1";
const now = Date.now();
sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(USER, USER, now);
sqlite.prepare("INSERT INTO pack_devices (user_id, device_id, label, packs, added_at, seen_at) VALUES (?, ?, 'Guide phone', '[]', ?, ?)").run(USER, DEVICE, now, now);

const T = await import(join(APP, "src/texts.ts"));
const { receiveUpload } = await import(join(APP, "src/library.ts"));
const { SMALLEST, FULL, OTHER_GENDER, READINGS, REFUSALS } = await import(join(APP, "src/pack-guide.ts"));
const { TEXT_EXAMPLE, TEXT_REFUSALS, BOOK_EXAMPLE } = await import(join(APP, "src/text-guide.ts"));
const { WEAVE_EXAMPLE, WEAVE_MORE, WEAVE_REFUSALS, FLIP_AT } = await import(join(APP, "src/weave-guide.ts"));
const { bookFromText } = await import(join(APP, "public/js/read/import-text.js"));
const { shownJson } = await import(join(APP, "src/guide-json.ts"));
const { numberedSentences } = await import(join(APP, "src/weave-answer.ts"));
const woven = await import(join(APP, "public/js/read/woven-text.js"));

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(error?.stack ?? error).split("\n").slice(0, 8).join("\n      ")}`);
  }
}
const clone = (value) => structuredClone(value);
const ok = (cond, what) => assert.ok(cond, what);

/** A module's tools as an AI calls them: each argument through its tool's own schema, then the tool; { ok, value, text }. */
async function toolsOf(path, register) {
  const tools = {};
  const prompts = {};
  const mod = await import(join(APP, path));
  mod[register]({ registerTool: (name, config, run) => (tools[name] = { config, run }), registerPrompt: (name, config, run) => (prompts[name] = { config, run }) }, env, {
    caller: () => ({ userId: USER, clientName: "Claude", via: "oauth" }),
    sourceLabel: () => "oauth:Claude",
    ok: (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }] }),
    guarded: async (run) => {
      try {
        return await run();
      } catch (error) {
        return { content: [{ type: "text", text: String(error?.message ?? error) }], isError: true };
      }
    },
  });
  return async (name, args = {}) => {
    const { config, run } = tools[name];
    const parsed = config.inputSchema ? config.inputSchema.safeParse(args) : { success: true, data: args };
    if (!parsed.success) return { ok: false, text: `invalid arguments: ${JSON.stringify(parsed.error.issues)}` };
    const result = await run(parsed.data);
    const text = result.content[0].text;
    let value = null;
    try {
      value = JSON.parse(text);
    } catch {}
    // check_items answers a refusal as { ok: false, errors } rather than as an error.
    return { ok: !result.isError && value?.ok !== false, value, text };
  };
}
const packs = await toolsOf("src/mcp-packs.ts", "registerPackTools");
const texts = await toolsOf("src/mcp-texts.ts", "registerTextTools");
const passes = (result, what) => {
  assert.ok(result.ok, `${what} was refused: ${result.text.slice(0, 600)}`);
  assert.ok(!result.value?.warnings?.length, `${what} came with warnings: ${JSON.stringify(result.value?.warnings ?? []).slice(0, 400)}`);
  if ("errors" in (result.value ?? {})) assert.deepEqual(result.value.errors, [], what);
  return result.value;
};
/** What a guide says a refusal says, as a pattern: … is the part that changes. */
const saying = (says) => new RegExp(says.split("…").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]*?"));
/** A guide shows each refusal on a line of its own: what it says, then what to do. */
const listsRefusals = (guide, refusals) => refusals.filter(({ says, fix }) => !guide.includes(`- ${says}: ${fix}`)).map(({ id }) => id);
/** Each listed refusal planted: refused, saying what the guide says it says. */
async function plantedAll(refusals, plants) {
  const listed = refusals.map((r) => r.id);
  assert.deepEqual(listed.filter((id) => !plants[id]), [], "listed refusals with no plant");
  assert.deepEqual(Object.keys(plants).filter((id) => !listed.includes(id)), [], "plants the guide doesn't list");
  const wrong = [];
  for (const { id, says } of refusals) {
    const result = await plants[id]();
    // What the AI reads: a refusal's messages (check_items' and the pack tools' errors), else the error's own words.
    const said = Array.isArray(result.value?.errors) ? result.value.errors.map((e) => e.message).join("\n") : result.text;
    if (result.ok) wrong.push(`${id}: not refused`);
    else if (!saying(says).test(said)) wrong.push(`${id}: said ${JSON.stringify(said.slice(0, 300))}, not "${says}"`);
  }
  assert.deepEqual(wrong, []);
  return `${refusals.length} refusals, each said`;
}

await test("the controls: a refusal saying something else, and a guide missing a refusal's line, are both caught", async () => {
  assert.ok(saying('topic "…" isn\'t one of the pack\'s topics').test('items[0] (x): topic "beach" isn\'t one of the pack\'s topics.'));
  assert.ok(!saying('topic "…" isn\'t one of the pack\'s topics').test('items[0] (x): pattern "beach" isn\'t in the language\'s catalog'));
  assert.ok(!saying("words has … entries; keep it to").test("items[0].words has 17 entries."));
  assert.deepEqual(listsRefusals("- a: b\n", [{ id: "one", says: "a", fix: "b" }, { id: "two", says: "c", fix: "d" }]), ["two"]);
  let caught = null;
  try {
    await plantedAll([{ id: "p", says: "something it never says", fix: "x" }], { p: async () => ({ ok: false, text: "what it does say" }) });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "a refusal with other words passed");
});

// ---------- the pack guide ----------

await test("get_pack_guide: the whole guide, every example and every refusal in it", async () => {
  const { guide, examples } = passes(await packs("get_pack_guide"), "get_pack_guide");
  assert.doesNotMatch(guide, /@@/);
  for (const example of [SMALLEST, FULL, OTHER_GENDER, READINGS]) {
    assert.ok(guide.includes(shownJson(example)), "an example missing from the guide");
    assert.deepEqual(JSON.parse(shownJson(example)), example, "an example as shown isn't the example");
  }
  assert.deepEqual(listsRefusals(guide, REFUSALS), [], "refusals missing from the guide");
  assert.deepEqual(examples, { smallest: SMALLEST, full: FULL, otherGender: OTHER_GENDER, readings: READINGS });
  return `${guide.length.toLocaleString("en")} characters`;
});

await test("get_pack_guide with a language: that language's pattern ids at its end, every one the guide's examples use among them; another language's refused in words", async () => {
  const served = passes(await packs("get_pack_guide", { language: "nl" }), "get_pack_guide (nl)");
  const at = served.guide.indexOf("## Pattern ids for Dutch");
  ok(at > 0, "no pattern ids for Dutch");
  const listed = [...served.guide.slice(at).matchAll(/^- ([a-z0-9-]+): /gm)].map((m) => m[1]);
  const shared = [...SMALLEST.items, ...FULL.items].flatMap((item) => item.patterns ?? []).filter((id) => !Object.hasOwn(FULL.patterns, id));
  assert.deepEqual([...new Set(shared)].filter((id) => !listed.includes(id)), [], "a pattern an example uses isn't listed");
  const refused = await packs("get_pack_guide", { language: "xx" });
  ok(!refused.ok && refused.text.includes("language must be one of"), refused.text.slice(0, 200));
  return `${listed.length} Dutch pattern ids`;
});

await test("the pack guide's examples through the real tools: the whole new pack, the smallest sentence, the other gender and readings, each kept with no warning", async () => {
  const full = passes(await packs("create_pack", FULL), "create_pack (the whole pack)");
  assert.equal(full.pack_id, FULL.pack_id);
  assert.equal(full.sentences, FULL.items.length);
  passes(await packs("create_pack", { name: "My Dutch", language: "nl", pack_id: SMALLEST.pack_id }), "create_pack (an empty one to add to)");
  const added = passes(await packs("add_items", SMALLEST), "add_items (the smallest)");
  assert.equal(added.sentences, 1);
  const got = passes(await packs("get_pack", { pack_id: FULL.pack_id }), "get_pack");
  assert.deepEqual(got.items.map((item) => item.id), FULL.items.map((item) => item.id));
  // The pack's own pattern, kept under the pack's id as the guide says.
  assert.ok(Object.keys(got.patterns ?? {}).some((id) => id === `${FULL.pack_id}.graag`), JSON.stringify(Object.keys(got.patterns ?? {})));
  passes(await packs("check_items", OTHER_GENDER), "check_items (the other gender)");
  passes(await packs("check_items", READINGS), "check_items (readings)");
  return `${FULL.items.length} + 1 kept, 2 checked`;
});

await test("every refusal the pack guide lists: planted, refused, saying what the guide says", async () => {
  const item = () => clone(FULL.items[0]);
  const check = (change, extra = {}) => packs("check_items", { language: "nl", topics: FULL.topics, words: FULL.words, chunks: FULL.chunks, patterns: FULL.patterns, items: [change(item())], ...extra });
  const without = (field) => check((it) => (delete it[field], it));
  const ja = (change) => packs("check_items", { ...clone(READINGS), items: [change(clone(READINGS.items[0]))] });
  const es = (change) => packs("check_items", { ...clone(OTHER_GENDER), items: [change(clone(OTHER_GENDER.items[0]))] });
  const plants = {
    sentence: () => without("sentence"),
    literal: () => without("literal"),
    natural: () => without("natural"),
    wrong: () => without("wrong"),
    gap: () => without("gap"),
    units: () => check((it) => (delete it.patterns, it)),
    "gap-word": () => check((it) => ((it.gap.word = "vertrok"), it)),
    "gap-options": () => check((it) => ((it.gap.options = ["vertrekken", "vertrek"]), it)),
    "gap-distinct": () => check((it) => ((it.gap.options = ["vertrekt", "vertrek", "vertrek"]), it)),
    "gap-at": () => check((it) => ((it.gap.at = 40), it)),
    "wrong-same": () => check((it) => ((it.wrong = [it.sentence]), it)),
    "wrong-distinct": () => check((it) => ((it.wrong = [it.wrong[0], it.wrong[0]]), it)),
    "lemmas-word": () => check((it) => ((it.lemmas.gisteren = "gisteren"), it)),
    "lemmas-times": () => packs("check_items", { language: "nl", items: [{ ...clone(SMALLEST.items[0]), sentence: "Ik drink koffie en ik drink thee.", lemmas: { Ik: ["ik", "ik", "ik"], drink: "drinken", koffie: "koffie" } }] }),
    english: () => check((it) => ((it.english = [0, 1, 2]), it)),
    moved: () => check((it) => ((it.moved = ["vertrok"]), it)),
    topic: () => check((it) => ((it.topic = "beach"), it)),
    pattern: () => check((it) => ((it.patterns = ["no-such-pattern"]), it)),
    chunk: () => check((it) => ((it.chunks = ["no-such-phrase"]), it)),
    "same-sentence": () => packs("check_items", { ...clone(SMALLEST), pack_id: undefined, language: "nl", items: [clone(SMALLEST.items[0]), { ...clone(SMALLEST.items[0]), id: "another-id" }] }),
    "same-id": () => packs("check_items", { language: "nl", items: [clone(SMALLEST.items[0]), { ...clone(SMALLEST.items[0]), sentence: "Ik drink thee.", lemmas: { Ik: "ik", drink: "drinken" } }].map((one) => ({ ...one, id: "same" })) }),
    "other-who": () => es((it) => ((it.otherGender.who = "both"), it)),
    "other-same": () => es((it) => ((it.otherGender.text = it.sentence), it)),
    "words-missing": () => ja((it) => (delete it.words, it)),
    "words-join": () => ja((it) => ((it.words = ["私", "は", "駅", "へ", "行きます"]), it)),
    "words-spaced": () => check((it) => ((it.words = ["Morgen", "vertrekt"]), it)),
    reading: () => ja((it) => ((it.readings["駅"] = "eki"), it)),
    language: () => packs("create_pack", { ...clone(FULL), pack_id: "elsewhere", language: "xx" }),
    "too-many-words": () => packs("check_items", { language: "nl", items: [{ ...clone(SMALLEST.items[0]), sentence: "Ik drink koffie en thee en water en melk en sap en bier en wijn en limonade." }] }),
    "pack-id": () => packs("create_pack", { ...clone(FULL), name: "Trip again" }),
  };
  return plantedAll(REFUSALS, plants);
});

// ---------- the text guide ----------

/** request_text_upload, then the file PUT to its signed link as its curl command would; the upload's id. */
async function uploaded(format, filename, bytes, contentType) {
  const ticket = await texts("request_text_upload", { format, filename });
  assert.ok(ticket.ok, ticket.text);
  const { upload_id, upload_url, method, content_type, max_bytes, expires, curl } = ticket.value;
  assert.deepEqual([method, typeof max_bytes, typeof expires, typeof curl], ["PUT", "number", "string", "string"], "the answer the guide describes");
  const url = new URL(upload_url);
  const response = await receiveUpload(new Request(url, { method: "PUT", headers: { "Content-Type": contentType ?? content_type }, body: bytes }), env, url.pathname.split("/").pop(), url);
  return { upload_id, status: response.status, said: (await response.json()).error ?? null };
}
const utf8 = (text) => new TextEncoder().encode(text);

await test("get_text_guide: the whole guide, its example and every refusal in it", async () => {
  const { guide } = passes(await texts("get_text_guide"), "get_text_guide");
  assert.ok(guide.includes(TEXT_EXAMPLE.text));
  assert.deepEqual(listsRefusals(guide, TEXT_REFUSALS), [], "refusals missing from the guide");
  return `${guide.length.toLocaleString("en")} characters`;
});

await test("the text guide's example as it says: request_text_upload, the PUT, add_text; a book of the chapters it names, on its way to their device", async () => {
  const { upload_id, status } = await uploaded("text", TEXT_EXAMPLE.filename, utf8(TEXT_EXAMPLE.text));
  assert.equal(status, 200);
  const added = passes(await texts("add_text", { upload_id, language: TEXT_EXAMPLE.language, title: TEXT_EXAMPLE.title }), "add_text");
  for (const field of ["text_id", "change_id", "title", "words", "devices"]) assert.ok(field in added, `add_text's answer has no ${field}: ${JSON.stringify(added).slice(0, 300)}`);
  assert.deepEqual(added.devices, ["Guide phone"]);
  assert.equal(added.title, TEXT_EXAMPLE.title);
  const book = await bookFromText(TEXT_EXAMPLE.text, { lang: TEXT_EXAMPLE.language, title: TEXT_EXAMPLE.title });
  assert.deepEqual(book.chapters.map((c) => c.title), TEXT_EXAMPLE.chapters);
  const where = passes(await texts("get_text", { text_id: added.text_id }), "get_text");
  assert.ok(JSON.stringify(where).includes(added.change_id));
  return `${added.words} words, chapters ${book.chapters.map((c) => c.title).join(" / ")}`;
});

await test("a text in a language written without spaces, as the guide says: plain text split here, and a book of split words and paragraphs (its Japanese example; Chinese, Cantonese and Thai too) added, its sentences worked out here", async () => {
  const guide = (await texts("get_text_guide")).value.guide;
  assert.ok(guide.includes(shownJson(BOOK_EXAMPLE)) && JSON.stringify(JSON.parse(shownJson(BOOK_EXAMPLE))) === JSON.stringify(BOOK_EXAMPLE), "the example as shown");
  const books = [
    BOOK_EXAMPLE,
    { format: "lexicommons-book", v: 1, lang: "zh", title: "去车站", words: ["我", "去", "火车站。", "火车", "九点", "来。"], paras: [{ k: "p", s: 0, e: 6 }] },
    { format: "lexicommons-book", v: 1, lang: "yue", title: "去車站", words: ["我", "去", "車站。", "架", "車", "九點", "嚟。"], paras: [{ k: "p", s: 0, e: 7 }] },
    { format: "lexicommons-book", v: 1, lang: "th", title: "ไปสถานี", words: ["ฉัน", "ไป", "สถานี", "รถไฟ"], paras: [{ k: "p", s: 0, e: 4 }] },
  ];
  const said = [];
  // Plain text too, split by the engine's word breaker (Node's ICU here; the Worker's workerd has Intl.Segmenter with the same languages).
  for (const [lang, text] of [["ja", "私は駅に行きます。"], ["zh", "我去火车站。"], ["yue", "我去車站。"], ["th", "ฉันไปสถานีรถไฟ"]]) {
    const added = passes(await texts("add_text", { upload_id: (await uploaded("text", `${lang}.txt`, utf8(text))).upload_id, language: lang }), `add_text (${lang} plain text)`);
    said.push(`${lang} text ${added.words} words`);
  }
  for (const book of books) {
    const { upload_id, status } = await uploaded("book", `${book.lang}.json`, utf8(JSON.stringify(book)), "application/json");
    assert.equal(status, 200);
    const added = passes(await texts("add_text", { upload_id, language: book.lang }), `add_text (${book.lang})`);
    assert.equal(added.words, book.words.length, book.lang);
    said.push(`${book.lang} ${added.words} words`);
  }
  return said.join(", ");
});

await test("a failed PUT leaves its link to send again (the guide's retry); a link sent once can't be sent twice", async () => {
  const ticket = (await texts("request_text_upload", { format: "text", filename: "retry.txt" })).value;
  const url = new URL(ticket.upload_url);
  const put = (body, type = "text/plain") => receiveUpload(new Request(url, { method: "PUT", headers: { "Content-Type": type }, body }), env, url.pathname.split("/").pop(), url);
  assert.equal((await put(utf8("Hallo."), "application/json")).status, 415);
  assert.equal((await put(utf8("Hallo."))).status, 200);
  assert.equal((await put(utf8("Hallo."))).status, 409);
});

await test("every refusal the text guide lists: planted, refused, saying what the guide says", async () => {
  const text = async (bytes, args = {}, format = "text", type) => texts("add_text", { upload_id: (await uploaded(format, "f", bytes, type)).upload_id, language: "nl", ...args });
  const pending = (await texts("request_text_upload", { format: "text", filename: "never-sent.txt" })).value.upload_id;
  const book = await bookFromText("De kat slaapt.", { lang: "nl", title: "Kat" });
  const plants = {
    "upload-id": () => texts("add_text", { upload_id: "not an id!", language: "nl" }),
    "no-upload": () => texts("add_text", { upload_id: "upl_nothing_here", language: "nl" }),
    "not-sent": () => texts("add_text", { upload_id: pending, language: "nl" }),
    empty: () => text(utf8("   \n\n  ")),
    utf8: () => text(new Uint8Array([0xff, 0xfe, 0x41])),
    json: () => text(utf8("not json"), {}, "book", "application/json"),
    "book-lang": () => text(utf8(JSON.stringify(book)), { language: "de" }, "book", "application/json"),
    "book-cover": () => text(utf8(JSON.stringify({ ...book, cover: 0 })), {}, "book", "application/json"),
    epub: () => text(utf8("not an epub"), {}, "epub", "application/epub+zip"),
    cover: async () => texts("add_text", { upload_id: (await uploaded("text", "f", utf8("Hallo."))).upload_id, language: "nl", cover_upload_id: (await uploaded("cover", "c.svg", utf8("<svg><script/></svg>"), "image/svg+xml")).upload_id }),
  };
  return plantedAll(TEXT_REFUSALS, plants);
});

// ---------- the weave guide ----------

/** A request's text as the app sends it: its copy stored, claimed and tied to the request. */
async function requested(book, requestId) {
  const { upload } = await T.storeWeaveText(env, USER, { book });
  const claim = await T.claimWeaveText(env, USER, upload, book.id);
  await claim.tie(requestId);
}
const exampleBook = await bookFromText(WEAVE_EXAMPLE.text, { lang: "en", title: WEAVE_EXAMPLE.title });
const weaveInput = (over = {}) => ({ requestId: "req-guide", title: WEAVE_EXAMPLE.title, language: WEAVE_EXAMPLE.language, weave: clone(WEAVE_EXAMPLE.weave), ...over });

await test("get_weave_guide: the whole guide, its example, every refusal and the patterns the example's c uses", async () => {
  const served = passes(await texts("get_weave_guide", { language: "nl" }), "get_weave_guide");
  for (const shown of [WEAVE_EXAMPLE.weave, WEAVE_EXAMPLE.to_weave]) {
    assert.ok(served.guide.includes(shownJson(shown)), "the example isn't in the guide");
    assert.deepEqual(JSON.parse(shownJson(shown)), shown);
  }
  assert.deepEqual(listsRefusals(served.guide, WEAVE_REFUSALS), [], "refusals missing from the guide");
  for (const level of WEAVE_EXAMPLE.shown) assert.ok(served.guide.includes(level.reads));
  // One text: the rules in the guide, their pattern list the grammar's now (one list, every id the example uses in it, none twice).
  assert.deepEqual(Object.keys(served).sort(), ["guide", "language", "rules_as_of"], "the guide served as one text");
  const rules = served.guide.slice(served.guide.indexOf("## The rules"));
  assert.ok(rules.length > 10_000 && rules.includes("\nt: ") && rules.includes("\nm: "), "the rules aren't in the guide");
  const listed = [...rules.matchAll(/^ {2}([a-z0-9-]+): /gm)].map((m) => m[1]);
  const used = [...new Set(WEAVE_EXAMPLE.weave.sentences.flatMap((s) => s.c))];
  assert.deepEqual(used.filter((id) => !listed.includes(id)), [], "a pattern the example uses isn't in the rules' list");
  assert.equal(new Set(listed).size, listed.length, "a pattern listed twice");
  assert.equal(FLIP_AT, woven.FLIP_AT, "the guide's FLIP_AT isn't the reader's");
  const refused = await texts("get_weave_guide", { language: "de" });
  assert.ok(!refused.ok && refused.text.includes("isn't ready yet"));
  return `${served.guide.length.toLocaleString("en")} characters, rules as of ${served.rules_as_of}`;
});

await test("the weave guide's example: the text numbered as get_text hands it over, its weave through add_weave, read at each level as the guide says", async () => {
  assert.deepEqual(numberedSentences(exampleBook), WEAVE_EXAMPLE.to_weave);
  await requested(exampleBook, "req-guide");
  const relayed = await T.addWeave(env, USER, "oauth:Claude", weaveInput());
  const stored = JSON.parse(await (await T.serveTextFile(env, USER, relayed.change_id, "weave")).text());
  const every = new Set(stored.sentences.flatMap((s) => s.t.map(([, lemma]) => lemma).filter(Boolean)));
  const reads = (known) =>
    woven
      .wovenParagraphs(exampleBook, stored, known)
      .flatMap((p) => p.sentences.flatMap((s) => s.pieces.map((piece) => piece.text)))
      .join(" ");
  for (const level of WEAVE_EXAMPLE.shown) assert.equal(reads(level.knows === "every word" ? every : new Set(level.knows)), level.reads);
  return `${stored.sentences.length} sentences kept and relayed as ${relayed.change_id}`;
});

await test("the weave guide's two more sentences (a verb group; an adverb inside a perfect): in the guide, numbered as written, each through add_weave", async () => {
  const guide = (await texts("get_weave_guide", { language: "nl" })).value.guide;
  const said = [];
  for (const [n, one] of WEAVE_MORE.entries()) {
    ok(guide.includes(shownJson(one.weave)) && guide.includes(one.note), `${one.title} isn't in the guide`);
    const book = await bookFromText(one.text, { lang: "en", title: one.title });
    assert.deepEqual(numberedSentences(book)[0].words, one.weave.sentences[0].t.map((entry) => entry.w), one.title);
    await requested(book, `req-more-${n}`);
    const relayed = await T.addWeave(env, USER, "oauth:Claude", weaveInput({ requestId: `req-more-${n}`, title: one.title, weave: clone(one.weave) }));
    said.push(`${one.title}: ${relayed.change_id}`);
  }
  return said.join(", ");
});

await test("every refusal the weave guide lists: planted, refused, saying what the guide says", async () => {
  const weave = (change, over = {}) => async () => {
    try {
      const value = clone(WEAVE_EXAMPLE.weave);
      change(value.sentences);
      return { ok: true, value: await T.addWeave(env, USER, "oauth:Claude", weaveInput({ weave: value, ...over })) };
    } catch (error) {
      return { ok: false, text: String(error.message) };
    }
  };
  // Small texts of their own, for what the example has no words for: a mark alone, a verb's form split, a pronoun alone.
  const small = async (text, id, answer) => {
    const book = await bookFromText(text, { lang: "en", title: id });
    await requested(book, id);
    try {
      return { ok: true, value: await T.addWeave(env, USER, "oauth:Claude", weaveInput({ requestId: id, weave: answer })) };
    } catch (error) {
      return { ok: false, text: String(error.message) };
    }
  };
  const plants = {
    missing: weave((s) => s.pop()),
    twice: weave((s) => s.push(clone(s[0]))),
    x: weave((s) => (s[0].x = 7)),
    "t-count": weave((s) => s[1].t.pop()),
    "t-w": weave((s) => (s[1].t[2].w = "falls")),
    "t-shape": weave((s) => (s[0].t[0].target = 5)),
    "m-shape": weave((s) => (s[0].m[0].sources = "0")),
    punctuation: weave((s) => (s[1].t[7].target = "einde")),
    tiling: weave((s) => (s[1].text = "Zou de val nooit tot een eind komen!")),
    sources: weave((s) => (s[0].m[0].sources = [99])),
    lemma: weave((s) => (s[1].t[2].lemma = "Val")),
    patterns: weave((s) => (s[1].c = ["no-such-pattern"])),
    "idiom-lemma": weave((s) => {
      s[1].t[0].lemma = null;
      s[1].t[1].lemma = null;
      s[1].u = [{ k: 0, len: 2, target: "Zou de" }];
    }),
    "idiom-len": weave((s) => (s[1].u = [{ k: 0, len: 1, target: "Zou" }])),
    "only-punctuation": () =>
      small("Wait — now.", "req-mark", {
        sentences: [{ x: 0, t: [{ w: "Wait", target: "Wacht", lemma: "wachten" }, { w: "—", target: "-", lemma: null }, { w: "now.", target: "nu.", lemma: "nu" }], text: "Wacht - nu.", m: [{ target: "Wacht", cue: "Wait", sources: [0], lemma: "wachten" }, { target: "-", cue: "—", sources: [1], lemma: null }, { target: "nu.", cue: "now", sources: [2], lemma: "nu" }] }],
      }),
    "split-form": () =>
      small("I will go.", "req-split", {
        sentences: [{ x: 0, t: [{ w: "I", target: "Ik", lemma: "ik" }, { w: "will", target: "zal", lemma: null }, { w: "go.", target: "ga.", lemma: "gaan" }], text: "Ik ga.", m: [{ target: "Ik", cue: "I", sources: [0], lemma: "ik" }, { target: "ga.", cue: "will go", sources: [1, 2], lemma: "gaan" }] }],
      }),
    "pronoun-alone": () =>
      small("I saw him.", "req-pronoun", {
        sentences: [{ x: 0, t: [{ w: "I", target: "Ik", lemma: "ik" }, { w: "saw", target: "zag", lemma: "zien" }, { w: "him.", target: "hem.", lemma: "hem" }], text: "Ik zag hem.", m: [{ target: "Ik", cue: "I", sources: [0], lemma: "ik" }, { target: "zag", cue: "saw", sources: [1], lemma: "zien" }, { target: "hem.", cue: "him", sources: [2], lemma: "hem" }] }],
      }),
    language: weave(() => {}, { language: "de" }),
    gone: weave(() => {}, { requestId: "req-none" }),
  };
  return plantedAll(WEAVE_REFUSALS, plants);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
