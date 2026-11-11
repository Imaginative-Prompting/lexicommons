// Recordings of your own packs on this device (packs.js audio: the ones your AI makes, through the relay). Each clip is
// named by its bytes, so it's kept once, in Cache Storage ("lx-audio-v1", under /api/packs/audio/<clip>), and only
// after its bytes hash to its name and are audio (audio-bytes.js), up to 2 MB. The server holds a clip only while a
// change carrying it is on its way to your devices; after that this device's copy, and your own storage (sync.js), are
// where it lives. Which clips are here is known at once (loadClips at start, again before each sync), so packs.js
// offers only those, and the device's own voice reads the rest. A clip nothing on this device names any more goes
// (pruneClips): recordings are personal, so none is kept for nothing.

import { sha256Hex } from "../storage.js";
import { soundsRight } from "./audio-bytes.js";

const CLIPS = "lx-audio-v1";
const CLIP_NAME = /^[0-9a-f]{16}\.(mp3|m4a)$/;
const PREFIX = "/api/packs/audio/";
const TYPE = { mp3: "audio/mpeg", m4a: "audio/mp4" };
/** The most a recording of yours can be (as the server takes them). */
export const CLIP_BYTES = 2 * 1024 * 1024;
const KEPT_AT = "X-Lexicommons-Kept-At";
/** A clip kept this recently is never pruned: a change taking it may not have kept its recordings yet. */
const GRACE = 3_600_000;
/** The address a clip of yours is kept (and played) under. */
export const yourClipUrl = (clip) => `${PREFIX}${clip}`;
/** Whether an address is a clip of yours. */
export const isYourClip = (src) => typeof src === "string" && src.startsWith(PREFIX);

let here = new Set();
const listeners = new Set();
const tell = () => listeners.forEach((fn) => fn());
const cache = () => caches.open(CLIPS);

// The device's other tabs keep and prune clips too: each is said on a channel, and a tab hearing one looks in Cache
// Storage before it believes it.
let channel = null;
function listen() {
  if (channel || typeof BroadcastChannel !== "function") return channel;
  channel = new BroadcastChannel("lx-clips");
  channel.onmessage = ({ data }) => {
    const clip = typeof data?.kept === "string" ? data.kept : typeof data?.gone === "string" ? data.gone : null;
    if (clip && CLIP_NAME.test(clip)) confirmClip(clip).catch(() => {});
  };
  return channel;
}

/** Learns which clips are here (at start, and before each sync: Cache Storage can lose them). */
export async function loadClips() {
  listen();
  if (typeof caches === "undefined") return 0;
  try {
    const keys = await (await cache()).keys();
    const now = new Set(keys.map((request) => new URL(request.url).pathname).filter(isYourClip).map((path) => path.slice(PREFIX.length)).filter((clip) => CLIP_NAME.test(clip)));
    const changed = now.size !== here.size || [...now].some((clip) => !here.has(clip));
    here = now;
    if (changed) tell();
  } catch {}
  return here.size;
}

/** Whether a clip is on this device, as last known (confirmClip looks). */
export const hasClip = (clip) => here.has(clip);

/** The clips on this device. */
export const clipsHere = () => [...here];

/** Whether a clip's bytes are really here; what's known is put right either way. */
export async function confirmClip(clip) {
  let hit = null;
  if (typeof caches !== "undefined") {
    try {
      hit = await (await cache()).match(yourClipUrl(clip));
    } catch {}
  }
  if (Boolean(hit) === here.has(clip)) return Boolean(hit);
  if (hit) here.add(clip);
  else here.delete(clip);
  tell();
  return Boolean(hit);
}

/** Whether bytes are the clip they're named as: their sha256 is the name, they're audio of its kind, up to 2 MB. */
export async function isClip(clip, blob) {
  if (!CLIP_NAME.test(clip ?? "") || !(blob instanceof Blob) || blob.size > CLIP_BYTES) return false;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return (await sha256Hex(bytes)).slice(0, 16) === clip.slice(0, 16) && soundsRight(TYPE[clip.slice(-3)], bytes);
}

// A checked clip into Cache Storage, told here and to the other tabs. Resolves to whether it's kept (quota, say).
async function store(clip, blob) {
  try {
    const headers = { "Content-Type": TYPE[clip.slice(-3)], "Content-Length": String(blob.size), [KEPT_AT]: String(Date.now()) };
    await (await cache()).put(yourClipUrl(clip), new Response(blob, { headers }));
  } catch {
    return false;
  }
  if (!here.has(clip)) {
    here.add(clip);
    tell();
  }
  listen()?.postMessage({ kept: clip });
  return true;
}

/** Keeps a clip's bytes, if they're the clip (isClip). Resolves to whether it's kept. */
export async function keepClip(clip, blob) {
  return typeof caches !== "undefined" && (await isClip(clip, blob)) && store(clip, blob);
}

/** A clip's bytes as kept here, or null (and then it isn't counted as here). */
export async function clipBlob(clip) {
  if (!here.has(clip) || typeof caches === "undefined") return null;
  try {
    const hit = await (await cache()).match(yourClipUrl(clip));
    if (hit) return await hit.blob();
  } catch {
    return null;
  }
  await confirmClip(clip);
  return null;
}

/**
 * Makes sure a clip is here, fetching it from where a change on its way serves it: "here" (kept, or already here),
 * "gone" (the server hasn't it, or what it sent isn't the clip: asking again won't help), or "failed" (no connection,
 * the server's trouble, or no room to keep it: try again later).
 */
export async function fetchClip(clip, url) {
  if (await confirmClip(clip)) return "here";
  if (typeof caches === "undefined") return "failed";
  let blob;
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    if (response.status === 404) return "gone";
    if (!response.ok) return "failed";
    blob = await response.blob();
  } catch {
    return "failed";
  }
  if (!(await isClip(clip, blob))) return "gone";
  return (await store(clip, blob)) ? "here" : "failed";
}

/**
 * Takes away the clips no longer named (keep: the clips packs, deletions you can still restore, and Undo here name);
 * one kept within the hour stays, unless all is set (the account and its packs going). Resolves to how many went.
 */
export async function pruneClips(keep, { all = false, now = Date.now() } = {}) {
  if (typeof caches === "undefined") return 0;
  let gone = 0;
  try {
    const kept = await cache();
    for (const request of await kept.keys()) {
      const path = new URL(request.url).pathname;
      if (!isYourClip(path)) continue;
      const clip = path.slice(PREFIX.length);
      if (keep.has(clip)) continue;
      if (!all && !(Number((await kept.match(request))?.headers.get(KEPT_AT)) < now - GRACE)) continue;
      await kept.delete(request);
      here.delete(clip);
      listen()?.postMessage({ gone: clip });
      gone++;
    }
  } catch {}
  if (gone) tell();
  return gone;
}

/** Calls fn when clips arrive here or go. Returns a function to stop. */
export function onClipsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
