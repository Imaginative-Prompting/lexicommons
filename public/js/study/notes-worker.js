// A pack's notes and a language's word forms (notes.js) taken and read off the page's main thread. Each file is checked word by word
// (pack-notes.js checkNotes, checkForms) and its JSON parsed, versioned and kept: path-nl's notes (760 KB) took 31–137 ms on a computer, and a
// phone's main thread slowed 4× 64–86 ms in one task while Translate was typed (8 Nov 2026, translate-check's speed stage). Here the page pays
// none of that, only reading an entry when it's asked for (below).
//
// take({ kind, url, owner, version, old }) → { value }: the file at url fetched, checked (kind "notes": a pack's, owner its id; "forms": a
// language's, owner its code), its content matching version, and kept in Cache Storage under url (old, the one kept before, deleted when it's
// another); it throws, in words, when any of that fails, and nothing is kept. read({ kind, url, owner }) → { value }: the kept copy, checked
// again (it's the device's own, but storage can be changed under it), or { value: null }. Neither touches localStorage, which a worker hasn't
// got: what names the kept files is the page's (notes.js). The page runs these same functions itself when it has no worker. fetch and caches
// are the worker's own unless given (a test's stand-ins).
//
// What goes back to the page is packed: each entry (a sentence's notes, a word's forms) as its own JSON, which the page reads only when that
// sentence or word is asked for. The checked file handed back whole held the page 50 ms at 4× just being read out of the message (8 Nov 2026,
// path-nl's notes: a structured clone of every note); a string comes across as one copy.

import { fetchRetrying } from "../lx/retry.js";
import { checkForms, checkNotes, notesText, notesVersion } from "./pack-notes.js";

export const CACHE = "lx-notes-v1";

const openCache = (store) => (store ? store.open(CACHE).catch(() => null) : Promise.resolve(null));

/** The file checked as its kind, and its owner's: { value } or { error } in words. */
function checked(kind, value, owner) {
  if (kind === "notes") {
    const { notes, errors } = checkNotes(value);
    if (!notes) return { error: errors[0]?.message ?? "they don't pass the check" };
    if (notes.pack !== owner) return { error: `they're ${notes.pack}'s` };
    return { value: notes };
  }
  if (kind === "forms") {
    const { forms, errors } = checkForms(value);
    if (!forms) return { error: errors[0]?.message ?? "they don't pass the check" };
    if (forms.language !== owner) return { error: `they're ${forms.language}'s` };
    return { value: forms };
  }
  return { error: `there's no kind ${String(kind).slice(0, 20)}` };
}

/** A checked file as the page keeps it: its entries (notes' items, forms' words) each as its own JSON, every other field as it is. */
export function packed(kind, value) {
  if (!value) return value;
  const field = kind === "notes" ? "items" : "forms";
  return { ...value, [field]: Object.fromEntries(Object.entries(value[field]).map(([key, entry]) => [key, JSON.stringify(entry)])) };
}

export async function take({ kind, url, owner, version, old }, { fetch: get = fetchRetrying, caches: store = globalThis.caches } = {}) {
  const response = await get(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`${response.status}`);
  const { value, error } = checked(kind, await response.json(), owner);
  if (error) throw new Error(error);
  if ((await notesVersion(value)) !== version) throw new Error(`their content doesn't match their version (${version})`);
  const cache = await openCache(store);
  if (cache) {
    await cache.put(url, new Response(notesText(value), { headers: { "Content-Type": "application/json" } }));
    if (old && old !== url) await cache.delete(old);
  }
  return { value };
}

export async function read({ kind, url, owner }, { caches: store = globalThis.caches } = {}) {
  const response = await (await openCache(store))?.match(url);
  if (!response) return { value: null };
  return { value: checked(kind, await response.json(), owner).value ?? null };
}

/** A message's answer as the worker posts it: by the number it came with (seq), { value } packed, or { error } in words. */
export async function answer(data, given) {
  try {
    const work = data?.op === "take" ? take(data, given) : data?.op === "read" ? read(data, given) : null;
    if (!work) throw new Error("no such work");
    return { seq: data.seq, value: packed(data.kind, (await work).value) };
  } catch (error) {
    return { seq: data?.seq, error: String(error?.message ?? error) };
  }
}

// As a worker. Messages don't wait for each other: a read names the copy the page has kept, which a take never deletes until the page has
// moved on from it.
if (typeof WorkerGlobalScope === "function" && globalThis instanceof WorkerGlobalScope) {
  addEventListener("message", ({ data }) => void answer(data).then((reply) => postMessage(reply)));
}
