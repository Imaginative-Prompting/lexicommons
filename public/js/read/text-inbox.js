// Texts your AI adds to your reading library, on this device: the relay's other half (src/texts.ts). In the same round
// as your AI's packs (study/pack-inbox.js runs it, so there's one poll), this device:
// - says which texts your AI added for this account it has (with pack-inbox's "I'm here"), for list_texts; a text you
//   added yourself is never reported, and one added for another account signed in on this browser is neither reported
//   to this one nor listed in its Read (store.js setReadAccount);
// - takes each text change waiting for it, in order, and reports how it went:
//   add     fetches the change's file, makes the book (a book is checked again; an EPUB is made into one by
//           bookFromEpub, then checked) under the relay's id, cleans its cover again (cover-svg.js), and keeps it;
//           a file that won't make a book becomes a row in failedTexts(), and the account hears why
//   remove  takes the text out, keeping all of it (where you were, its weaves, its cover) for 7 days so Undo can bring it
//           back; nothing is taken out unless that's kept first
//   undo    undoes the change it names: an add's text goes, a remove's comes back (only from what that very remove kept)
//   weave   a layer your AI wove for a text of yours (a "weave" request): checked again against the text here and kept beside it
//           (store.keepWeave); a device without that text reports "missing", which is no failure (your own texts stay on their device)
//   A change keeps its id everywhere, so one taken twice changes nothing.
// - runs Remove (for a text your AI added) and Undo through the relay, so every device does them.
// A text you add yourself stays on this device and never goes through the relay, unless you ask your AI to weave it (then that
// request carries it: reader.js offerWeave).
// It remembers (localStorage "lx.text-inbox.v1", per account) the changes it took and the texts that failed, and keeps
// removed texts in IndexedDB "lexicommons-texts" ("removed": { id: "<account>:<text>", snapshot, removedAt, change }).

import * as store from "./store.js";
import { validateBook, validateWeave } from "./book-format.js";
import { bookFromEpub } from "./import-epub.js";
import { cleanCover, coverFile } from "./cover-svg.js";
import { deviceLabel } from "../lx/look-sync.js";

const KEY = "lx.text-inbox.v1";
const KEEP_REMOVED = 7 * 86_400_000;
const listeners = new Set();
let account = null;

const changed = () => {
  for (const fn of listeners) fn();
};

/** Calls fn when a change from the relay added, removed or brought back a text here. Returns a function to stop. */
export function onTextsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- what this device remembers ----------

function readAll() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved && typeof saved.accounts === "object") return saved;
  } catch {}
  return { accounts: {} };
}
function stateOf() {
  const saved = readAll().accounts[account] ?? {};
  return {
    taken: saved.taken && typeof saved.taken === "object" ? saved.taken : {},
    failed: Array.isArray(saved.failed) ? saved.failed.filter((f) => typeof f?.changeId === "string") : [],
  };
}
function keep(state) {
  try {
    const all = readAll();
    all.accounts[account] = state;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

// Removed texts, kept 7 days for Undo.
let opening = null;
function removedDb() {
  return (opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("lexicommons-texts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("removed", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
async function removedStore(mode, action) {
  const db = await removedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("removed", mode);
    const request = action(tx.objectStore("removed"));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
async function forgetOldRemoved() {
  const all = (await removedStore("readonly", (s) => s.getAll()).catch(() => [])) ?? [];
  for (const old of all.filter((r) => Date.now() - r.removedAt > KEEP_REMOVED)) await removedStore("readwrite", (s) => s.delete(old.id)).catch(() => {});
}

// ---------- the relay ----------

const ours = (book) => book?.source?.kind === "ai" && book.source.account === account;

/** What this device tells the account it has: the texts your AI added for it, [{ id, title, language, words, by, addedAt }]. */
export async function textsHere() {
  return (await store.listBooks()).filter(ours).map((b) => ({ id: b.id, title: b.title, language: b.lang, words: b.words, by: "ai", addedAt: b.addedAt }));
}

class Failed extends Error {}

async function file(relayed, part) {
  const response = await fetch(`/api/texts/files/${encodeURIComponent(relayed.id)}?part=${part}`, { credentials: "same-origin", cache: "no-store" });
  if (response.status === 404) throw new Failed("Its file is gone from the account (it expired before this device opened).");
  if (!response.ok) throw new Error(`file: ${response.status}`);
  return response;
}

/**
 * A weave: the layer your AI made of a text of yours (a "weave" request, ai/requests.js), checked here again against the text this
 * device has and kept beside it. A device without that text says "missing", which is no failure: a text you added yourself is
 * often on one device only. Resolves to a report; throws Failed with why.
 */
async function weaveIn(relayed) {
  const { body } = relayed;
  const found = await store.getBook(relayed.textId);
  if (!found) return { state: "missing" };
  const book = found.text;
  if (body.bookVersion !== book.version) throw new Failed("The text on this device isn't the one your AI wove.");
  const response = await file(relayed, "weave");
  let weave;
  try {
    weave = JSON.parse(await response.text());
  } catch {
    throw new Failed("The woven layer isn't JSON.");
  }
  if (weave?.kind !== "weave" || weave.to !== body.to) throw new Failed(`The layer isn't a weave into ${body.to}.`);
  const problems = await validateWeave(weave, book);
  if (problems.length) throw new Failed(`The woven layer doesn't pass the check here: ${problems[0]}`);
  await store.keepWeave(book.id, body.to, weave);
  return { state: "applied" };
}

/** An add: the book made and checked here, its cover cleaned here. Resolves to { book, cover? }; throws Failed with why. */
async function make(relayed) {
  const { body } = relayed;
  const response = await file(relayed, "text");
  let book;
  if (body.format === "epub") {
    const blob = await response.blob();
    try {
      book = await bookFromEpub(new File([blob], `${body.title || "book"}.epub`, { type: "application/epub+zip" }));
    } catch (error) {
      throw new Failed(`The EPUB couldn't be read: ${error.message}`);
    }
    if (body.language && book.lang !== body.language) throw new Failed(`The EPUB is in ${book.lang}, not ${body.language} as your AI said.`);
    if (body.retitle && body.title) book.title = body.title;
    if (Array.isArray(body.authors) && body.authors.length) book.authors = body.authors.map((name) => ({ name, role: "author" }));
  } else {
    try {
      book = JSON.parse(await response.text());
    } catch {
      throw new Failed("The book isn't JSON.");
    }
  }
  book.id = relayed.textId;
  book.source = { kind: "ai", ref: whoMade(relayed.source), account };
  const problems = await validateBook(book);
  if (problems.length) throw new Failed(`The book doesn't pass the check here: ${problems[0]}`);
  let cover;
  if (body.cover) {
    const raw = await (await file(relayed, "cover")).text();
    try {
      const { svg } = cleanCover(raw);
      cover = { file: await coverFile(svg), blob: new Blob([svg], { type: "image/svg+xml" }) };
    } catch {
      cover = undefined; // A cover this device won't show is left out; the text still comes.
    }
  }
  return { book, cover };
}

const keyOf = (textId) => `${account}:${textId}`;

/**
 * Takes a text your AI added for this account out, keeping all of it first (if that can't be kept, nothing is taken
 * out: the change is tried again next round). A text that isn't here, or isn't this account's, is missing.
 */
async function takeAway(relayed) {
  const here = await store.getBook(relayed.textId);
  if (!here || !ours(here.book)) return "missing";
  const snapshot = await store.snapshotBook(relayed.textId);
  if (!snapshot) return "missing";
  await removedStore("readwrite", (s) => s.put({ id: keyOf(relayed.textId), snapshot, removedAt: Date.now(), change: relayed.id }));
  await store.removeBook(relayed.textId);
  return "applied";
}

/** Brings back what the remove that's being undone took out, as it was; nothing else (a later or earlier remove's). */
async function bringBack(relayed) {
  const kept = await removedStore("readonly", (s) => s.get(keyOf(relayed.textId))).catch(() => null);
  if (!kept || kept.change !== relayed.body.change) return "missing";
  await store.restoreBook(kept.snapshot);
  await removedStore("readwrite", (s) => s.delete(keyOf(relayed.textId)));
  return "applied";
}

/** Who made a change, in words (as pack-inbox.js says it). */
function whoMade(source) {
  const [via, ...rest] = String(source ?? "").split(":");
  const name = rest.join(":");
  if (via === "oauth") return name || "Your AI";
  if (via === "pat") return name ? `Your token “${name}”` : "A token";
  if (via === "device") return name ? `Your ${name}` : "Another device";
  return "Your AI";
}

/**
 * Takes one text change (from pack-inbox's round): applies it, reports how it went, and says so. ctx: { device, send,
 * notify }, pack-inbox's own (send(method, path, body) → Response).
 */
export async function takeText(relayed, { device, send, notify }) {
  const state = stateOf();
  let receipt = state.taken[relayed.id];
  const fresh = !receipt;
  let report = { state: "applied" };
  if (fresh) {
    try {
      if (relayed.kind === "add") {
        if (await store.getBook(relayed.textId)) report = { state: "applied" };
        else {
          const { book, cover } = await make(relayed);
          await store.addBook(book, {}, cover ? { cover } : {});
          report = { state: "applied", words: book.words.length };
        }
      } else if (relayed.kind === "weave") report = await weaveIn(relayed);
      else if (relayed.kind === "remove") report = { state: await takeAway(relayed) };
      else if (relayed.kind === "undo") report = { state: relayed.body.undoes === "remove" ? await bringBack(relayed) : await takeAway(relayed) };
      else report = { state: "failed", error: `This device doesn't know a "${relayed.kind}" change.` };
    } catch (error) {
      if (!(error instanceof Failed)) throw error; // Offline or the account busy: tried again next round.
      report = { state: "failed", error: error.message };
    }
    receipt = { outcome: report.state, textId: relayed.textId, at: Date.now(), ...(report.error ? { error: report.error } : {}), ...(report.words ? { words: report.words } : {}) };
    state.taken[relayed.id] = receipt;
    // A weave that couldn't be kept isn't a text that couldn't be added: its request says why (Read's list is for texts).
    if (report.state === "failed" && relayed.kind !== "weave") state.failed = [...state.failed.filter((f) => f.changeId !== relayed.id), { changeId: relayed.id, textId: relayed.textId, title: relayed.body.title, why: report.error, at: Date.now() }];
    keep(state);
    if (report.state === "applied") changed();
  }
  const response = await send("POST", `/api/texts/changes/${encodeURIComponent(relayed.id)}/report`, { device, state: receipt.outcome, ...(receipt.error ? { error: receipt.error } : {}), ...(receipt.words ? { words: receipt.words } : {}) });
  if (!response.ok && !(response.status >= 400 && response.status < 500)) throw new Error(`text report: ${response.status}`);
  // A toast for what your AI did (what you did in the app says so where you did it).
  if (!fresh || relayed.source.startsWith("device:")) return;
  const who = whoMade(relayed.source);
  // A weave has no Undo yet: the text is as it was, with its layer beside it.
  if (receipt.outcome === "applied" && relayed.kind !== "undo" && relayed.kind !== "weave") notify("right", `${who} ${relayed.said}`, () => undoTextChange(relayed.id));
  else if (receipt.outcome === "applied") notify("right", `${who} ${relayed.said}`);
  else if (receipt.outcome === "failed" && relayed.kind === "weave") notify("wrong", `${who} wove “${relayed.body.title}”, but it couldn't be kept here: ${receipt.error}`);
  else if (receipt.outcome === "failed") notify("wrong", `${who} added “${relayed.body.title}”, but it couldn't be read here: ${receipt.error}`);
}

// ---------- from the app ----------

/** Texts your AI added that this device couldn't read: [{ changeId, textId, title, why, at }], for Read to show. */
export const failedTexts = () => (account ? stateOf().failed.map((f) => ({ ...f })) : []);

/** Takes a failed text's row away (Remove on it). */
export function dismissFailedText(changeId) {
  const state = stateOf();
  state.failed = state.failed.filter((f) => f.changeId !== changeId);
  keep(state);
  changed();
}

let checkNow = async () => 0;

/**
 * Removes a text. One your AI added goes from every device through the relay (this one takes it like the rest, so it
 * can be undone everywhere); it's never taken out here on its own once the relay has it, so if this round didn't take
 * it yet, the next one does. One you added yourself goes everywhere as its deletion (read/store.js removeBook, the texts sync
 * kind). Offline, a text your AI added goes from this device, and to the others at its next sync. Resolves to { everywhere, error? }.
 */
export async function removeText(id) {
  const here = await store.getBook(id);
  if (ours(here?.book)) {
    let response;
    try {
      response = await fetch("/api/texts/changes", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: deviceLabel(), kind: "remove", textId: id, title: here.book.title }) });
    } catch {
      response = null;
    }
    if (response?.ok) {
      await checkNow();
      return { everywhere: true };
    }
    if (response) return { everywhere: false, error: (await response.json().catch(() => ({}))).error ?? `${response.status}` };
  }
  await store.removeBook(id);
  changed();
  return { everywhere: false };
}

/** Undoes a text change on every device, this one included. Resolves to { ok, error? }. */
export async function undoTextChange(id) {
  let response;
  try {
    response = await fetch("/api/texts/changes", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: deviceLabel(), kind: "undo", change: id }) });
  } catch {
    return { ok: false, error: "Undo needs a connection, so your other devices undo it too." };
  }
  if (!response.ok) return { ok: false, error: (await response.json().catch(() => ({}))).error ?? `${response.status}` };
  await checkNow();
  return { ok: true };
}

/**
 * Forgets the removed texts kept for Undo on this device for this account (Settings: deleting your texts, or your
 * account); another account's on this browser stay.
 */
export async function clearRemovedTexts() {
  if (!account) return;
  await removedStore("readwrite", (s) => s.delete(IDBKeyRange.bound(`${account}:`, `${account}:\uffff`))).catch(() => {});
}

/** For pack-inbox: the account the relay runs for, and how to run a round now. */
export function startTexts({ account: id, check }) {
  account = id;
  checkNow = check;
  store.setReadAccount(id);
  forgetOldRemoved();
}
