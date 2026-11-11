// The recordings kept for offline (public/js/study/keep-clips.js), against a cache and a network played in memory:
// every clip once, in order, with its type and length; ones already kept counted and never fetched again; the budget
// (the kept ones counted first); none while the device asks to save data; the network failing (what's kept stays,
// the rest wait); one the library hasn't got left out; stopped (the language changed); what it says as it goes
// (onProgress: the pack pages' download bar); a download breaking partway or storage full ending it with its reason, never
// rejecting; kept clips anywhere in the list counted before anything's fetched. In Node:
// `node scripts/test-keep-clips.mjs` (exit 0 = pass).

import { BUDGET, CLIPS, keepClips } from "../public/js/study/keep-clips.js";

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
const eq = (actual, expected, what = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? `${what}: ` : ""}${a} ≠ ${e}`);
};

const U = (n) => `/library/audio/${String(n).padStart(16, "0")}.mp3`;
// A cache in memory, with { url: bytes } already kept (as voice.js keeps a played clip: the network's response).
const memoryCache = (kept = {}) => {
  const map = new Map(Object.entries(kept).map(([url, bytes]) => [url, new Response(new Uint8Array(bytes), { headers: { "Content-Type": "audio/mpeg" } })]));
  return { map, match: async (url) => map.get(url)?.clone(), put: async (url, response) => void map.set(url, response) };
};
// The library, played: { url: bytes } (1000 for any other), failing from the nth request on, or missing some.
const library = (sizes = {}, { failFrom = null, missing = [] } = {}) => {
  const asked = [];
  const fetcher = async (url) => {
    asked.push(url);
    if (failFrom !== null && asked.length >= failFrom) throw new TypeError("Failed to fetch");
    if (missing.includes(url)) return new Response("not here", { status: 404 });
    return new Response(new Uint8Array(sizes[url] ?? 1000), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  };
  return { fetcher, asked };
};

await test("every clip once, in order, kept with its type and length", async () => {
  const cache = memoryCache();
  const net = library({ [U(1)]: 1000, [U(2)]: 2000, [U(3)]: 3000 });
  const r = await keepClips([U(1), U(2), U(1), U(3)], { cache, fetcher: net.fetcher });
  eq(r, { kept: 3, already: 0, bytes: 6000, stoppedBy: null });
  eq(net.asked, [U(1), U(2), U(3)], "asked");
  const two = await cache.match(U(2));
  eq([two.status, two.headers.get("content-type"), two.headers.get("content-length"), (await two.blob()).size], [200, "audio/mpeg", "2000", 2000]);
});

await test("ones already kept (played before) are counted and never fetched again", async () => {
  const cache = memoryCache({ [U(1)]: 1500 });
  const net = library({ [U(2)]: 2000, [U(3)]: 3000 });
  const r = await keepClips([U(1), U(2), U(3)], { cache, fetcher: net.fetcher });
  eq(r, { kept: 2, already: 1, bytes: 6500, stoppedBy: null });
  eq(net.asked, [U(2), U(3)], "asked");
});

await test("the budget: the kept ones count first; a clip that would pass it isn't kept, nor any after it", async () => {
  const cache = memoryCache({ [U(1)]: 1500 });
  const net = library({ [U(2)]: 2000, [U(3)]: 3000, [U(4)]: 10 });
  const r = await keepClips([U(1), U(2), U(3), U(4)], { cache, fetcher: net.fetcher, budget: 5000 });
  eq(r, { kept: 1, already: 1, bytes: 3500, stoppedBy: "budget" });
  eq([...cache.map.keys()], [U(1), U(2)], "kept");
  eq(net.asked, [U(2), U(3)], "asked");
  const full = memoryCache({ [U(1)]: 6000 });
  const net2 = library();
  eq((await keepClips([U(1), U(2)], { cache: full, fetcher: net2.fetcher, budget: 5000 })).stoppedBy, "budget");
  eq(net2.asked, [], "nothing fetched past the budget");
});

await test("a device asking to save data: nothing fetched (a clip is kept once it plays, as before)", async () => {
  const net = library();
  eq(await keepClips([U(1), U(2)], { cache: memoryCache(), fetcher: net.fetcher, saveData: true }), { kept: 0, already: 0, bytes: 0, stoppedBy: "save-data" });
  eq(net.asked, []);
});

await test("the network failing: what's kept stays, the rest wait for the next sync", async () => {
  const cache = memoryCache();
  const net = library({}, { failFrom: 2 });
  eq(await keepClips([U(1), U(2), U(3)], { cache, fetcher: net.fetcher }), { kept: 1, already: 0, bytes: 1000, stoppedBy: "offline" });
  eq([...cache.map.keys()], [U(1)]);
});

await test("one the library hasn't got is left out, and the rest are kept", async () => {
  const cache = memoryCache();
  const net = library({}, { missing: [U(2)] });
  eq(await keepClips([U(1), U(2), U(3)], { cache, fetcher: net.fetcher }), { kept: 2, already: 0, bytes: 2000, stoppedBy: null });
  eq([...cache.map.keys()], [U(1), U(3)]);
});

await test("stopped when told (the language changed)", async () => {
  const net = library();
  const r = await keepClips([U(1), U(2), U(3)], { cache: memoryCache(), fetcher: net.fetcher, stop: () => net.asked.length >= 1 });
  eq(r, { kept: 1, already: 0, bytes: 1000, stoppedBy: "stopped" });
});

await test("it says how it's going: had, then fetching and kept (or missing), each clip once, in order", async () => {
  const net = library({}, { missing: [U(4)] });
  const said = [];
  const r = await keepClips([U(1), U(2), U(2), U(3), U(4)], { cache: memoryCache({ [U(1)]: 700 }), fetcher: net.fetcher, onProgress: (url, what) => said.push([url, what]) });
  eq(r, { kept: 2, already: 1, bytes: 2700, stoppedBy: null });
  eq(said, [[U(1), "had"], [U(2), "fetching"], [U(2), "kept"], [U(3), "fetching"], [U(3), "kept"], [U(4), "fetching"], [U(4), "missing"]]);
});

await test("the budget counts every kept clip first, wherever it is in the list: missing ones before it don't pass it", async () => {
  // 4,000 bytes kept at the end, two missing clips of 2,000 before them, a budget of 5,000.
  const cache = memoryCache({ [U(3)]: 4000 });
  const net = library({ [U(1)]: 2000, [U(2)]: 2000 });
  const r = await keepClips([U(1), U(2), U(3)], { cache, fetcher: net.fetcher, budget: 5000 });
  if (r.bytes > 5000) throw new Error(`kept ${r.bytes} bytes against a budget of 5000 (the kept one counted last)`);
  eq(r, { kept: 0, already: 0, bytes: 4000, stoppedBy: "budget" });
  eq([...cache.map.keys()], [U(3)], "kept");
});

await test("a clip whose download breaks partway, and a device that won't keep one: it ends and says so, never left hanging", async () => {
  const broken = async (url) =>
    url === U(2)
      ? new Response(new ReadableStream({ start: (c) => c.error(new TypeError("network connection was lost")) }), { status: 200, headers: { "Content-Type": "audio/mpeg" } })
      : new Response(new Uint8Array(1000), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  const cache = memoryCache();
  const r = await keepClips([U(1), U(2), U(3)], { cache, fetcher: broken }).catch((error) => ({ rejected: String(error) }));
  eq(r, { kept: 1, already: 0, bytes: 1000, stoppedBy: "offline" }, "the body breaking");
  const full = memoryCache();
  full.put = async () => {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  };
  const r2 = await keepClips([U(1), U(2)], { cache: full, fetcher: library().fetcher }).catch((error) => ({ rejected: String(error) }));
  eq(r2, { kept: 0, already: 0, bytes: 0, stoppedBy: "storage" }, "storage full");
});

await test("kept where voice.js plays from, 50 MB a language", () => {
  eq([CLIPS, BUDGET], ["lx-audio-v1", 50_000_000]);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
