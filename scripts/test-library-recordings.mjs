// A library pack's recordings across a new version (study/packs.js syncLibraryPacks → syncAudio), in Node with the
// library's files served from memory: the recordings of the sentences a new version still says word for word stay
// with it until its own are published (a version is published before its recordings, so the catalog lists it without
// them for a while), and stay when its own can't be fetched; its own replace them when they come; recordings taken off
// a version on purpose go. Built from a slice of packs/path-nl.json and its real recordings manifest.
//   node scripts/test-library-recordings.mjs <path-nl's recordings manifest.json>   (exit 0 = pass)

// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setLearning } from "../public/js/study/learning.js";
import { packAudio, syncLibraryPacks } from "../public/js/study/packs.js";
import { checkPack, packUrl, packVersion } from "../public/js/study/pack-format.js";
import { audioUrl, audioVersion, fitAudio } from "../public/js/study/pack-audio.js";

const manifestAt = process.argv[2];
if (!manifestAt) {
  console.error("Usage: node scripts/test-library-recordings.mjs <path-nl's recordings manifest.json>");
  process.exit(2);
}
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const full = JSON.parse(readFileSync(join(APP, "packs/path-nl.json"), "utf8"));
const MANIFEST = JSON.parse(readFileSync(manifestAt, "utf8"));

// The first two lessons' sentences, as a pack of their own (no lessons): every one of them recorded.
const slice = (pack) => {
  const ids = new Set(full.lessons.slice(0, 3).flatMap((lesson) => lesson.items));
  const { lessons, units, ...rest } = pack;
  return { ...rest, items: pack.items.filter((item) => ids.has(item.id)) };
};
const V1 = slice(full);
// The next version says one recorded sentence differently ("Ja, graag." → "Ja, graag hoor."), and nothing else.
const V2 = structuredClone(V1);
const changed = V2.items.find((item) => item.id === "l002-n1");
changed.words = [...changed.words, ["hoor"]];
delete changed.text;
const checked1 = checkPack(V1).pack;
const checked2 = checkPack(V2).pack;
if (!checked1 || !checked2) throw new Error(`the slice doesn't pass: ${JSON.stringify((checked1 ? checkPack(V2) : checkPack(V1)).errors.slice(0, 2))}`);
const v1 = await packVersion(checked1);
const v2 = await packVersion(checked2);
const A1 = fitAudio(MANIFEST, checked1, { forLibrary: true });
// The second version's own recordings: the first's, with "Ja, graag hoor." recorded anew (the same clip, a third word timed).
const A2 = structuredClone(fitAudio(MANIFEST, checked2, { forLibrary: true }));
for (const [slug, voice] of Object.entries(A2.voices)) {
  const was = A1.voices[slug].items["l002-n1"];
  voice.items["l002-n1"] = { ...was, words: [...was.words, [was.seconds - 0.1, was.seconds]] };
}
const url1 = audioUrl("path-nl", v1, await audioVersion(A1));
const url2 = audioUrl("path-nl", v2, await audioVersion(A2));

// The library, as the catalog says now.
const files = new Map([
  [packUrl("path-nl", v1), V1],
  [packUrl("path-nl", v2), V2],
  [url1, A1],
  [url2, A2],
]);
let entry = null;
const failing = new Set();
globalThis.fetch = async (url) => {
  const path = String(url);
  const body = path === "/library/catalogue.json" ? { format: "lexicommons-catalogue", v: 1, books: [], lists: {}, packs: { nl: entry ? [entry] : [] } } : files.get(path);
  if (!body || failing.has(path)) return new Response("Not found", { status: failing.has(path) ? 500 : 404 });
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
};
const list = (version, audio) => ({ id: "path-nl", version, url: packUrl("path-nl", version), name: full.name, about: full.about, sentences: (version === v1 ? V1 : V2).items.length, ...(audio ? { audio } : {}) });
const recorded = () => {
  const audio = packAudio("path-nl");
  return audio ? Object.fromEntries(Object.entries(audio.voices).map(([slug, voice]) => [slug, Object.keys(voice.items).sort()])) : null;
};

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
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
const sync = async () => {
  const result = await syncLibraryPacks();
  ok(result.ok, `the sync: ${JSON.stringify(result)}`);
  return result;
};

setLearning("nl");
const ids1 = A1.voices.emma ? Object.keys(A1.voices.emma.items).sort() : [];

await test("the first version arrives with its recordings", async () => {
  entry = list(v1, url1);
  await sync();
  const now = recorded();
  ok(now && JSON.stringify(now.emma) === JSON.stringify(ids1), `recorded: ${JSON.stringify(now)}`);
  return `${ids1.length} sentences, voices ${Object.keys(now)}`;
});

await test("a new version listed before its recordings keeps those of every sentence it still says word for word (all but the one it changed)", async () => {
  entry = list(v2, null);
  await sync();
  const now = recorded();
  ok(now, "no recordings at all: every line goes to the device's voice");
  for (const [slug, ids] of Object.entries(now)) {
    ok(!ids.includes("l002-n1"), `${slug} still has the changed sentence's clip, whose timings are for other words`);
    ok(ids.length === ids1.length - 1, `${slug}: ${ids.length} of ${ids1.length - 1}`);
  }
  return `${now.emma.length} kept, l002-n1 left to the device`;
});

await test("its own recordings, when they can't be fetched, leave the kept ones as they are", async () => {
  failing.add(url2);
  entry = list(v2, url2);
  await sync();
  failing.delete(url2);
  const now = recorded();
  ok(now && now.emma.length === ids1.length - 1, `recorded: ${JSON.stringify(now && Object.fromEntries(Object.entries(now).map(([s, i]) => [s, i.length])))}`);
});

await test("its own recordings replace the kept ones when they come, the changed sentence's too", async () => {
  entry = list(v2, url2);
  await sync();
  const now = recorded();
  ok(now && now.emma.includes("l002-n1") && now.emma.length === ids1.length, `recorded: ${JSON.stringify(now && now.emma.length)}`);
});

await test("recordings taken off the version they were published for go", async () => {
  entry = list(v2, null);
  await sync();
  ok(recorded() === null, `still recorded: ${JSON.stringify(recorded())}`);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
