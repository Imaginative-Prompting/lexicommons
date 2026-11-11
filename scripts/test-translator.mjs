// The full translator's files (public/js/translate/models.js): every language listed has both its ways with English, each
// way its model, shortlist and vocabulary, each file named by its own sha256 at a key the library serves (src/books.ts
// serveLibrary, on R2 in memory) as bytes and nothing of another shape; a language's files once each (a vocabulary both
// ways share is one download), and what the download says it is (translate/translator.js translatorSize); then
// scripts/translate/models-r2.mjs refusing a file that isn't the one listed, before anything goes up. Exit 0 = pass.
//   node scripts/test-translator.mjs

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env } = workerEnv();
const { serveLibrary } = await import(join(APP, "src/books.ts"));
const { LANGUAGES_WITH, RUNTIME, WAYS, filesOf } = await import(join(APP, "public/js/translate/models.js"));
const { translatorSize } = await import(join(APP, "public/js/translate/translator.js"));
const { LANGUAGES } = await import(join(APP, "public/js/lang/index.js"));

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
const allFiles = () => Object.values(WAYS).flatMap((way) => [way.model, way.lex, way.vocab]);

// The open shelf's book languages (8 Nov 2026): a word the packs don't have is the full translator's to answer in each (read/reader.js).
const SHELF = ["nl", "es", "fr", "de", "pt", "it", "tr", "pl", "ru"];
await test(`the open shelf's book languages each have the full translator, both ways (${SHELF.join(" ")})`, () => {
  const missing = SHELF.filter((lang) => !LANGUAGES_WITH.includes(lang));
  ok(!missing.length, `no full translator for ${missing.join(", ")}`);
});

await test("every language listed is a registered language with both its ways with English, and every way is one of theirs", () => {
  ok(LANGUAGES_WITH.length > 0, "no language listed");
  for (const lang of LANGUAGES_WITH) {
    ok(LANGUAGES[lang], `${lang} isn't a registered language`);
    ok(WAYS[`${lang}>en`] && WAYS[`en>${lang}`], `${lang} lacks a way`);
  }
  for (const way of Object.keys(WAYS)) {
    const [from, to] = way.split(">");
    ok((from === "en") !== (to === "en"), `${way} isn't a language and English`);
    ok(LANGUAGES_WITH.includes(from === "en" ? to : from), `${way} belongs to no listed language (a way alone is never offered)`);
  }
});

await test("every file: a sha256, a size, and its key in the library is its hash's first 16 hex with its kind", () => {
  for (const file of allFiles()) {
    ok(/^[0-9a-f]{64}$/.test(file.sha256), `${file.name}: ${file.sha256}`);
    ok(Number.isInteger(file.size) && file.size > 0, `${file.name}: size ${file.size}`);
    ok(file.url === `/library/translate/${file.sha256.slice(0, 16)}.${file.name.endsWith(".spm") ? "spm" : "bin"}`, `${file.name}: ${file.url}`);
  }
  ok(/^[0-9a-f]{64}$/.test(RUNTIME.wasm.sha256) && RUNTIME.wasm.size > 0 && RUNTIME.wasm.url.startsWith("/vendor/bergamot/"), "the runtime's file");
  ok(existsSync(join(APP, "public", RUNTIME.script)) && existsSync(join(APP, "public", RUNTIME.wasm.url)), "the runtime isn't in public/vendor/bergamot/");
});

await test("two files with one key are one file (the same hash, the same size), never two files sharing a key", () => {
  const byUrl = new Map();
  for (const file of allFiles()) {
    const was = byUrl.get(file.url);
    ok(!was || (was.sha256 === file.sha256 && was.size === file.size), `${file.url}: ${was?.name} and ${file.name} differ`);
    byUrl.set(file.url, file);
  }
});

await test("a language's files are each once, both ways, and the download is what they add up to (with the runtime when it isn't here)", () => {
  for (const lang of LANGUAGES_WITH) {
    const files = filesOf(lang);
    const urls = files.map((file) => file.url);
    ok(new Set(urls).size === urls.length, `${lang}: a file twice`);
    for (const way of [`${lang}>en`, `en>${lang}`]) for (const kind of ["model", "lex", "vocab"]) ok(urls.includes(WAYS[way][kind].url), `${lang}: ${way}'s ${kind} missing`);
    const sum = files.reduce((total, file) => total + file.size, 0);
    ok(translatorSize(lang, { runtimeHere: true }) === sum, `${lang}: ${translatorSize(lang, { runtimeHere: true })} ≠ ${sum}`);
    ok(translatorSize(lang, { runtimeHere: false }) === sum + RUNTIME.wasm.size, `${lang}: the runtime isn't counted`);
  }
  ok(filesOf("xx").length === 0, "a language with none has files");
});

// Served: the bytes put at the key come back whole, as bytes; otherwise a 404.
async function served(key) {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252]);
  await env.LIBRARY.put(key, bytes);
  const response = await serveLibrary(new Request(`http://localhost/library/${key}`), env, `/library/${key}`);
  if (response.status !== 200) return null;
  return { type: response.headers.get("Content-Type"), same: Buffer.from(await response.arrayBuffer()).equals(Buffer.from(bytes)), cache: response.headers.get("Cache-Control") };
}

await test("the library serves every file at its key, as bytes, for good; and nothing of another shape", async () => {
  for (const file of allFiles()) {
    const got = await served(file.url.replace(/^\/library\//, ""));
    ok(got, `404: ${file.url}`);
    ok(got.same && got.type === "application/octet-stream" && /immutable/.test(got.cache), `${file.url}: ${JSON.stringify(got)}`);
  }
  const h = "0123456789abcdef";
  for (const key of [`translate/${h}.json`, `translate/${h}.wasm`, `translate/${h}0.bin`, `translate/${h.slice(1)}.bin`, `translate/${h.toUpperCase()}.bin`, `translate/x/${h}.bin`, `translate/model.nlen.intgemm.alphas.bin`, `translate/../catalogue.json`, `translate/${h}.bin/`]) {
    ok(!(await served(key)), `served ${key}`);
  }
});

await test("models-r2.mjs refuses a file that isn't the one listed, naming it, before anything goes up (a PLANT)", () => {
  const lang = LANGUAGES_WITH[0];
  const dir = mkdtempSync(join(tmpdir(), "lx-translator-"));
  const state = join(dir, "state");
  try {
    for (const file of filesOf(lang)) writeFileSync(join(dir, file.name), "not the model at all");
    let said = "";
    let code = 0;
    try {
      execFileSync(process.execPath, [join(APP, "scripts/translate/models-r2.mjs"), "--from", dir, "--local", state, "--only", lang], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      code = error.status;
      said = `${error.stdout}${error.stderr}`;
    }
    ok(code !== 0, "it went ahead");
    ok(/isn't the file models\.js lists/.test(said), `it said: ${said.slice(0, 300)}`);
    ok(!/^put /m.test(said) && !existsSync(state), "something went up");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
