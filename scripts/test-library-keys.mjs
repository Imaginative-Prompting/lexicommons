// The open library's keys as they're built (read/catalogue.js: a book's layers and definitions, a frequency list;
// lang/grammar.js: a language's shared grammar) and as
// they're served (src/books.ts serveLibrary, on R2 in memory: scripts/fixtures/worker-env.mjs), for every registered
// language and for a code with a script (zh-Hant, lang/index.js LANGUAGE_CODE): each one built is one served, and a
// code of any other shape isn't. Exit 0 = pass.
//   node scripts/test-library-keys.mjs

// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env } = workerEnv();
const { serveLibrary } = await import(join(APP, "src/books.ts"));
const { definitionsKey, layerKey, listKey } = await import(join(APP, "public/js/read/catalogue.js"));
const { grammarKey } = await import(join(APP, "public/js/lang/grammar.js"));
const { formsKey, notesKey } = await import(join(APP, "public/js/study/pack-notes.js"));
const { LANGUAGES, LANGUAGE_CODE } = await import(join(APP, "public/js/lang/index.js"));

let failed = 0;
let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(
      () => (passed++, console.log(`ok    ${name}`)),
      (error) => (failed++, console.log(`FAIL  ${name}\n      ${error?.message ?? error}`)),
    );
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};

const book = { id: "check-book", version: "0123456789abcdef" };
const sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
// Every key the catalog builds for a language's files.
const keysFor = (code) => [
  layerKey(book, { kind: "weave", to: code }, sha),
  layerKey(book, { kind: "help", to: code }, sha),
  layerKey(book, { kind: "parallel", to: code }, sha),
  definitionsKey(book, { lang: code }, sha),
  listKey({ lang: code }, sha),
  grammarKey(code, sha.slice(0, 12)),
  formsKey(code, sha.slice(0, 12)),
];
// Served: the file put at the key comes back whole; otherwise a 404.
async function served(key) {
  await env.LIBRARY.put(key, `{"key":${JSON.stringify(key)}}`);
  const response = await serveLibrary(new Request(`http://localhost/library/${key}`), env, `/library/${key}`);
  const body = response.status === 200 ? await response.text() : "";
  return response.status === 200 && body.includes(key);
}

await test("a language's code: two or three letters, and a script after it in BCP 47's casing (zh-Hant)", () => {
  for (const code of ["nl", "fil", "zh", "zh-Hant", "sr-Latn"]) ok(LANGUAGE_CODE.test(code), `${code} refused`);
  for (const code of ["", "n", "dutch", "zh-hant", "zh-HANT", "zh-TW", "zh_Hant", "zh-Hant-TW", "zh-Hans-CN", "__proto__", "zh-Hant\n"]) ok(!LANGUAGE_CODE.test(code), `${JSON.stringify(code)} taken`);
});

await test("every registered language's code has that shape", () => {
  const bad = Object.keys(LANGUAGES).filter((code) => !LANGUAGE_CODE.test(code));
  ok(!bad.length, `not the shape: ${bad.join(", ")}`);
});

await test("every key the catalog builds for each registered language is served", async () => {
  const missing = [];
  for (const code of Object.keys(LANGUAGES)) for (const key of keysFor(code)) if (!(await served(key))) missing.push(key);
  ok(!missing.length, `404: ${missing.join(", ")}`);
});

await test("a code with a script (zh-Hant): its weave, help layer, definitions and frequency list are served", async () => {
  const missing = [];
  for (const key of keysFor("zh-Hant")) if (!(await served(key))) missing.push(key);
  ok(!missing.length, `404: ${missing.join(", ")}`);
});

await test("a pack's notes: served at the key their version gives, and nothing of another shape", async () => {
  const v = sha.slice(0, 12);
  ok(await served(notesKey("path-nl", v)), "path-nl's notes");
  for (const key of ["notes/path-nl.json", `notes/${v}.json`, `notes/Path-NL/${v}.json`, `notes/path-nl/${sha}.json`, `notes/path-nl/${v}.mp3`, `notes/../catalogue.json`, `notes/path-nl/sub/${v}.json`]) ok(!(await served(key)), `served ${key}`);
});

await test("a code of any other shape isn't (zh-hant, zh-Hans-CN, zh_Hant, a country instead of a script)", async () => {
  const taken = [];
  for (const code of ["zh-hant", "zh-Hans-CN", "zh_Hant", "zh-TW", "dutch"]) for (const key of keysFor(code)) if (await served(key)) taken.push(key);
  ok(!taken.length, `served: ${taken.join(", ")}`);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
