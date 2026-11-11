// The recordings of the packs you study, kept on this device so they play offline (2 Nov 2026): after the packs sync,
// in the background, the clips of every voice of the packs that are on in the language you're learning go into Cache
// Storage (CLIPS), where voice.js plays a library clip from when there's no connection. Never while the device asks
// to save data (navigator.connection.saveData): then a clip is kept once it has played, as before. At most BUDGET
// bytes a language (the kept ones counted first, in the same order each time); past that, kept once played too.
// The cache and the network are handed in, so scripts/test-keep-clips.mjs runs it in Node.

/** Where a library clip is kept (voice.js plays it from here offline). */
export const CLIPS = "lx-audio-v1";
/** How much a language's recordings may take on the device. */
export const BUDGET = 50_000_000;

const sizeOf = async (response) => Number(response.headers.get("content-length")) || (await response.clone().blob()).size;

/**
 * Keeps urls (in order, each once) in cache, fetching the ones it hasn't got, until the budget is reached.
 * Returns { kept, already, bytes, stoppedBy }: stoppedBy is null when every one is kept, else "save-data", "budget",
 * "offline" (the network failed, before a clip's answer or partway through it: the rest wait for the next sync), "storage"
 * (the device wouldn't keep one: full, or storage refused) or "stopped" (stop() said so). It never rejects, so whoever
 * shows its progress always hears how it ended.
 * onProgress(url, what) as it goes: "had" (kept already), "fetching", then "kept" or "missing" (the library hasn't it).
 */
export async function keepClips(urls, { cache, fetcher = fetch, budget = BUDGET, saveData = false, stop = () => false, onProgress = () => {} }) {
  const result = { kept: 0, already: 0, bytes: 0, stoppedBy: null };
  if (saveData) return { ...result, stoppedBy: "save-data" };
  const list = [...new Set(urls)];
  // The kept ones count first, wherever they are in the list: before, a kept clip after missing ones was counted only once
  // those were fetched, and a language passed its budget (60 MB of 50).
  const had = new Set();
  try {
    for (const url of list) {
      const hit = await cache.match(url);
      if (!hit) continue;
      had.add(url);
      result.bytes += await sizeOf(hit);
    }
  } catch {
    return { ...result, stoppedBy: "storage" };
  }
  for (const url of list) {
    if (stop()) return { ...result, stoppedBy: "stopped" };
    if (had.has(url)) {
      result.already++;
      onProgress(url, "had");
      continue;
    }
    if (result.bytes >= budget) return { ...result, stoppedBy: "budget" };
    let response;
    onProgress(url, "fetching");
    try {
      response = await fetcher(url, { credentials: "same-origin" });
    } catch {
      return { ...result, stoppedBy: "offline" };
    }
    // One the library hasn't got is left out; the device's voice reads its sentence.
    if (!response.ok || response.status !== 200) {
      onProgress(url, "missing");
      continue;
    }
    let blob;
    try {
      blob = await response.blob();
    } catch {
      return { ...result, stoppedBy: "offline" };
    }
    if (result.bytes + blob.size > budget) return { ...result, stoppedBy: "budget" };
    try {
      await cache.put(url, new Response(blob, { status: 200, headers: { "Content-Type": response.headers.get("content-type") || "audio/mpeg", "Content-Length": String(blob.size) } }));
    } catch {
      return { ...result, stoppedBy: "storage" };
    }
    result.kept++;
    result.bytes += blob.size;
    onProgress(url, "kept");
  }
  return result;
}
