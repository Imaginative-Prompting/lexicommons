// A copy of another pack's item (copyOf, study/pack-format.js) found by its source where the app looks an item up by its
// pack: its recordings (study/voice.js hearsItem: the starter's own, inside the app, for a copy of a starter sentence) and
// a deck's card by its id (study/content.js cardById: a copied card named by its source, which isn't here). Each with a
// control that isn't a copy. In Node, the app's recordings served from public/. `node scripts/test-copy-lookups.mjs` (exit 0 = pass).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "../public");
const memory = new Map();
globalThis.localStorage ??= { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
// voice.js runs in Node on stand-ins, as test-speech-track.mjs has it: no page, no speech engine.
globalThis.addEventListener ??= () => {};
globalThis.window ??= globalThis;
globalThis.document ??= { addEventListener: () => {}, visibilityState: "visible" };
globalThis.fetch = async (url) => {
  const at = String(url);
  try {
    if (at.startsWith("/audio/")) return new Response(readFileSync(join(PUBLIC, at)), { status: 200 });
  } catch {}
  return new Response("not here", { status: 404 });
};

const { setLearning } = await import("../public/js/study/learning.js");
const voice = await import("../public/js/study/voice.js");
const { savePack } = await import("../public/js/study/packs.js");
const { cardById } = await import("../public/js/study/content.js");

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

setLearning("nl");
await voice.loadAudio();
const manifest = JSON.parse(readFileSync(join(PUBLIC, "audio/starter-word-order/manifest.json"), "utf8"));
const recorded = Object.keys(Object.values(manifest.voices)[0].items)[0];

await test("a copy of a starter sentence is said by the starter's recordings; the same id in another pack, not a copy, isn't", () => {
  // No device voice here (no speechSynthesis in Node), so only a recording can say it.
  ok(voice.hearsItem({ id: recorded, pack: "starter-word-order" }), `the starter's own ${recorded}`);
  ok(voice.hearsItem({ id: recorded, pack: "nl-food-1", copyOf: "starter-word-order" }), "a copy of it in a category pack");
  ok(!voice.hearsItem({ id: `nl-food-1/${recorded}`, pack: "nl-food-1" }), "the category pack's own item of that id");
});

await test("a copied card is found by its source's id, whose pack isn't here; a card of the pack's own by its own", async () => {
  const saved = await savePack({
    format: "lexicommons-pack",
    version: 2,
    id: "copies-xx",
    name: "Copies",
    language: "nl",
    from: "en",
    items: [
      { id: "zolder", copyOf: "an-anki-deck", text: "de zolder", means: "the attic" },
      { id: "kelder", text: "de kelder", means: "the cellar" },
    ],
  });
  ok(saved.ok, JSON.stringify(saved.errors));
  ok(cardById("an-anki-deck/zolder")?.means === "the attic", "the copy, by its source's id");
  ok(cardById("copies-xx/kelder")?.means === "the cellar", "the pack's own card");
  ok(cardById("an-anki-deck/kelder") === null, "not a copy: never found under another pack's id");
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
