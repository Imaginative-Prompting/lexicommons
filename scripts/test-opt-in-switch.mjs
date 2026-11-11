// A default pack the catalog makes opt-in (study/packs.js syncNow; 5 Nov 2026: Dutch's word bands, once its category
// packs are out, so a new learner adds only what they want): a device that has it keeps it, its sentences under the same
// ids (so what was learned on them stays), and follows it for the account; once the account's follows list it, it's a
// followed pack like any other. Signed out (no follows), it stays as it was. A pack the device never had stays opt-in:
// not brought. In Node, with the catalog and the account stood in. `node scripts/test-opt-in-switch.mjs` (exit 0 = pass).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const memory = new Map();
globalThis.localStorage ??= { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };

const HERE = dirname(fileURLToPath(import.meta.url));
const { BUILT_IN } = await import("../public/js/packs/index.js");
const { catalogueEntry, checkPack, packText, packUrl, packVersion, withPackEntry } = await import("../public/js/study/pack-format.js");
const packs = await import("../public/js/study/packs.js");
const { setLearning } = await import("../public/js/study/learning.js");
// content.js puts a whole new view in place at each change: read its exports through the module, never a copy taken once.
const content = await import("../public/js/study/content.js");

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
const eq = (a, b, what = "") => ok(JSON.stringify(a) === JSON.stringify(b), `${what ? `${what}: ` : ""}${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

// Two of Lexicommons' packs: a band this device has from before, and one it never had. Both checked as the library keeps them.
const builtIn = BUILT_IN.map((pack) => ({ ...pack, builtIn: true }));
const raw = JSON.parse(readFileSync(join(HERE, "fixtures/packs/check-nl.json"), "utf8"));
const band = checkPack(raw, { installed: builtIn }).pack;
const other = checkPack({ ...raw, id: "check-nl-other", name: "Another" }, { installed: builtIn }).pack;
const served = new Map();
const refOf = async (pack, optIn) => {
  const version = await packVersion(pack);
  served.set(packUrl(pack.id, version), packText(pack));
  return catalogueEntry(pack, version, { optIn });
};
let catalogue = withPackEntry(withPackEntry({ format: "lexicommons-catalogue", packs: {} }, "nl", await refOf(band, false)), "nl", await refOf(other, true));
globalThis.fetch = async (url) => {
  const at = String(url);
  if (at === "/library/catalogue.json") return new Response(JSON.stringify(catalogue), { status: 200 });
  if (served.has(at)) return new Response(served.get(at), { status: 200 });
  return new Response("not here", { status: 404 });
};
// The account: what it follows, and the follows a sync adds (as Explore's Add does).
let follows = [];
const added = [];
packs.setFollowsSource(async () => (follows === null ? Promise.reject(new Error("signed out")) : follows));
packs.setFollowAdder?.(async (id) => void added.push(id));

setLearning("nl");
await packs.loadPacks();
const bandIds = () => content.ITEMS.filter((item) => item.pack === band.id).map((item) => item.id);
const kindOf = (id) => packs.libraryPacks().find((pack) => pack.id === id)?.kind;

await test("before: the band is a default here, its sentences in Study; the opt-in pack isn't here", async () => {
  await packs.syncLibraryPacks();
  eq(kindOf(band.id), "default");
  eq(bandIds(), ["check-nl/balletje", "check-nl/eet-smakelijk", "check-nl/oma-gebeld"]);
  eq(kindOf(other.id), undefined);
});

await test("the catalog makes the band opt-in: this device keeps it, its sentences under the same ids, and follows it for the account", async () => {
  catalogue = withPackEntry(catalogue, "nl", await refOf(band, true));
  ok(catalogue.packs.nl.find((entry) => entry.id === band.id).optIn === true, "the band is opt-in in the catalog");
  await packs.syncLibraryPacks();
  eq(kindOf(band.id), "default", "kept");
  eq(bandIds(), ["check-nl/balletje", "check-nl/eet-smakelijk", "check-nl/oma-gebeld"]);
  eq(added, [band.id], "followed once");
  eq(kindOf(other.id), undefined, "the pack it never had isn't brought");
});

await test("once the account's follows list it: a followed pack of Lexicommons' own, nothing lost, nothing followed again", async () => {
  const entry = catalogue.packs.nl.find((one) => one.id === band.id);
  follows = [{ id: band.id, version: entry.version, url: entry.url, corrections: "published" }];
  await packs.syncLibraryPacks();
  eq(kindOf(band.id), "follow");
  eq(bandIds(), ["check-nl/balletje", "check-nl/eet-smakelijk", "check-nl/oma-gebeld"]);
  eq(added, [band.id], "not followed again");
});

await test("signed out (no follows to read): a default that turned opt-in stays as it was, and nothing is followed", async () => {
  // Back to a default, then opt-in again, with the account unreachable.
  follows = [];
  catalogue = withPackEntry(catalogue, "nl", await refOf(band, false));
  await packs.syncLibraryPacks();
  eq(kindOf(band.id), "default");
  catalogue = withPackEntry(catalogue, "nl", await refOf(band, true));
  follows = null;
  added.length = 0;
  await packs.syncLibraryPacks();
  eq(kindOf(band.id), "default", "kept");
  eq(bandIds().length, 3);
  eq(added, [], "nothing followed while signed out");
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
