// A book from the open shelf or Explore that another device listed here (read/store.js, the texts kind, carries only its entry): its text
// fetched again when it's opened, as the shelf or Explore fetches one the first time (shelf.js fetchOpenBook), and kept with its entry as it
// was (store.addBook keeps when it was added and opened).
import { fetchOpenBook, loadCatalog, OFFLINE_OPEN } from "./shelf.js";
import * as store from "./store.js";

/** Where a listed book is now: the open shelf's catalog, else Explore (while it's live there). { meta, from } or null. */
async function findIt(entry) {
  if (entry.from !== "explore") {
    const catalog = await loadCatalog().catch(() => null);
    const meta = catalog?.books?.find((book) => book.id === entry.id) ?? null;
    if (meta) return { meta, from: "shelf" };
  }
  if (entry.from !== "shelf") {
    const response = await fetch(`/api/community/books/${encodeURIComponent(entry.id)}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    const meta = response?.ok ? ((await response.json().catch(() => null))?.meta ?? null) : null;
    if (meta) return { meta, from: "explore" };
  }
  return null;
}

/**
 * Fetches a listed book's text (and its layers) again and keeps it here. Resolves when it's kept; throws with words a person can read.
 * onProgress (0–1), as fetchOpenBook's.
 */
export async function fetchAgain(entry, { onProgress = null } = {}) {
  const found = await findIt(entry);
  if (!found) throw new Error(navigator.onLine === false ? OFFLINE_OPEN : `${entry.title} isn't in the library any more, so it can't be fetched here.`);
  const record = await fetchOpenBook(found.meta, { onProgress });
  await store.addBook(record.book, record.weaves, { definitions: record.definitions, from: found.from });
}
