// Files the speech engine downloads once and keeps on the device: the Whisper models and the WebAssembly runtime
// that runs them. Each is a pack: /models/<pack>/manifest.json lists its files, and each file is served in chunks
// of under 25 MiB (scripts/speech-build.mjs makes them). Chunks are named by their content, checked against their
// SHA-256 as they arrive, and kept in Cache Storage under CACHE, which the service worker leaves alone.
// No DOM here: the Whisper worker reads files through this module too.

import { holdReload } from "../lx/reload-holds.js";

export const CACHE = "lx-speech-v1";
const BASE = "/models/";

export class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}

const absolute = (path) => new URL(path, self.location.origin).href;
const manifestUrl = (pack) => absolute(`${BASE}${pack}/manifest.json`);
const chunkUrl = (pack, chunk) => absolute(`${BASE}${pack}/c/${chunk.name}`);

async function open() {
  if (!self.caches) throw new StoreError("storage", "This browser can't keep files on the device.");
  return caches.open(CACHE);
}

const manifests = new Map();

/**
 * Whether this site serves the speech models at all. Someone's own copy may not (they're a separate 1 GB fetch: docs/self-host.md).
 * Asked once. Only a clear "not found" says no: offline, or any other answer, doesn't take Whisper away.
 */
let modelsHere = null;
export function siteHasModels(pack) {
  modelsHere ??= fetch(manifestUrl(pack), { method: "HEAD", cache: "no-store" }).then(
    (response) => response.status !== 404,
    () => true,
  );
  return modelsHere;
}

/** A pack's manifest: from the site when online (so an update shows), else the copy kept with its files. */
export async function manifest(pack) {
  if (manifests.has(pack)) return manifests.get(pack);
  const cache = await open();
  let response = null;
  try {
    response = await fetch(manifestUrl(pack), { cache: "no-store" });
    if (!response.ok) response = null;
  } catch {
    response = null;
  }
  if (!response) response = await cache.match(manifestUrl(pack));
  if (!response) throw new StoreError("offline", "Can't reach the site to download this. Check your connection.");
  const data = await response.json();
  if (data.format !== "lexicommons-speech-pack" || data.version !== 1) throw new StoreError("bad-pack", "This download's list of files isn't one the app can read.");
  manifests.set(pack, data);
  return data;
}

/** How much of a pack is on the device: { state: "absent" | "partial" | "ready", have, total } in bytes. */
export async function packState(pack) {
  const data = await manifest(pack);
  const cache = await open();
  const keys = new Set((await cache.keys()).map((request) => request.url));
  let have = 0;
  for (const file of data.files) for (const chunk of file.chunks) if (keys.has(chunkUrl(pack, chunk))) have += chunk.bytes;
  return { state: have === 0 ? "absent" : have >= data.bytes ? "ready" : "partial", have, total: data.bytes };
}

async function sha256(buffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// One chunk, streamed so progress moves while it arrives, then checked. Three tries, as phones drop connections.
async function fetchChunk(url, chunk, { signal, onBytes }) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new StoreError("aborted", "The download was stopped.");
    let counted = 0;
    try {
      // no-store: the browser's own HTTP cache would keep a second copy of every chunk.
      const response = await fetch(url, { cache: "no-store", signal });
      if (!response.ok) throw new StoreError("server", `The site answered ${response.status} for part of the download.`);
      const parts = [];
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        counted += value.byteLength;
        onBytes(value.byteLength);
      }
      const blob = new Blob(parts);
      if (blob.size !== chunk.bytes) throw new StoreError("corrupt", "Part of the download arrived incomplete.");
      if ((await sha256(await blob.arrayBuffer())) !== chunk.sha256) throw new StoreError("corrupt", "Part of the download arrived damaged.");
      return blob;
    } catch (error) {
      onBytes(-counted);
      if (signal?.aborted || error?.name === "AbortError") throw new StoreError("aborted", "The download was stopped.");
      lastError = error;
    }
  }
  if (lastError instanceof StoreError) throw lastError;
  throw new StoreError("offline", "The download stopped. Check your connection and try again; what's done is kept.");
}

/**
 * Downloads whatever of these packs isn't on the device yet. onProgress({ have, total }) in bytes, across all of
 * them. Stopping (signal) keeps the finished chunks, so the next try carries on from there.
 */
export async function download(packs, options = {}) {
  // A download the person started: the app doesn't reload into a new version by itself while it runs (shell/new-version.js).
  const release = holdReload("Whisper");
  try {
    return await downloadNow(packs, options);
  } finally {
    release();
  }
}
async function downloadNow(packs, { onProgress, signal } = {}) {
  const cache = await open();
  const datas = await Promise.all(packs.map((pack) => manifest(pack)));
  const keys = new Set((await cache.keys()).map((request) => request.url));
  const todo = [];
  let have = 0;
  let total = 0;
  datas.forEach((data, index) => {
    total += data.bytes;
    for (const file of data.files) {
      for (const chunk of file.chunks) {
        const url = chunkUrl(packs[index], chunk);
        if (keys.has(url)) have += chunk.bytes;
        else todo.push({ url, chunk });
      }
    }
  });
  // Progress about 7 times a second (a chunk arrives in many small reads), and always the last one.
  let reported = 0;
  const report = (force = false) => {
    const now = performance.now();
    if (!force && now - reported < 150) return;
    reported = now;
    onProgress?.({ have, total });
  };
  report(true);
  if (!todo.length) return { have, total };

  // Ask to be kept (so the browser won't clear it to free space), and check there's room.
  try {
    await navigator.storage?.persist?.();
  } catch {}
  try {
    const estimate = await navigator.storage?.estimate?.();
    const needed = todo.reduce((sum, item) => sum + item.chunk.bytes, 0);
    if (estimate?.quota && estimate.quota - (estimate.usage ?? 0) < needed * 1.1) {
      throw new StoreError("space", `This needs ${megabytes(needed)} free, and the browser has ${megabytes(estimate.quota - (estimate.usage ?? 0))} left for this site.`);
    }
  } catch (error) {
    if (error instanceof StoreError) throw error;
  }

  // Two chunks at a time.
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const { url, chunk } = todo[next++];
      const blob = await fetchChunk(url, chunk, {
        signal,
        onBytes: (bytes) => {
          have += bytes;
          report();
        },
      });
      try {
        await cache.put(url, new Response(blob, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(blob.size) } }));
      } catch (error) {
        if (error?.name === "QuotaExceededError") throw new StoreError("space", "The device ran out of room for the download.");
        throw error;
      }
    }
  };
  await Promise.all([worker(), worker()]);
  report(true);
  // Keep the manifest with the files, for loading offline.
  for (const pack of packs) {
    const response = await fetch(manifestUrl(pack), { cache: "no-store" }).catch(() => null);
    if (response?.ok) await cache.put(manifestUrl(pack), response);
  }
  return { have, total };
}

/** One file of a pack, put back together from its chunks, as a Response (for transformers.js). */
export async function fileResponse(pack, name) {
  const data = await manifest(pack);
  const file = data.files.find((f) => f.name === name);
  if (!file) return null;
  const cache = await open();
  const parts = [];
  for (const chunk of file.chunks) {
    const response = await cache.match(chunkUrl(pack, chunk));
    if (!response) throw new StoreError("model-missing", "Part of the speech model isn't on this device. Download it again.");
    parts.push(await response.blob());
  }
  const blob = new Blob(parts);
  return new Response(blob, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(blob.size) } });
}

/** Fetches files (the libraries) into the speech cache, so they're there offline. */
export async function keep(paths) {
  const cache = await open();
  for (const path of paths) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new StoreError("server", `The site answered ${response.status} for part of the download.`);
    await cache.put(absolute(path), response);
  }
}

/** Lets go of files kept with keep(). */
export async function forget(paths) {
  const cache = await open();
  for (const path of paths) await cache.delete(absolute(path));
}

/** Removes everything of a pack from the device, including chunks of an older version of it. */
export async function remove(pack) {
  const cache = await open();
  const prefix = absolute(`${BASE}${pack}/`);
  for (const request of await cache.keys()) if (request.url.startsWith(prefix)) await cache.delete(request);
  manifests.delete(pack);
}

export function megabytes(bytes) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}
