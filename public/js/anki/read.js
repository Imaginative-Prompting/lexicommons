// The worker's side of reading a deck (worker.js starts it). Told { open: File }: reads the file and says how far it's got,
// then gives back the deck as plain data. Told { sounds: [{ card, names }] }: unpacks each card's sound, hands each one over and
// waits for the page to say it's kept, so no more than one is ever held here.

import { allowUnicase, collectionBytes, mediaMap, readCollection } from "./collection.js";
import { deckFrom } from "./deck.js";
import { CAPS, DeckError, budget, isZstd, readEntry, readZip, unzstd } from "./zip.js";

let file = null;
let entries = null;
let media = null;
let spending = null;
let waiting = null;

const SOUND_FILE = /\.(mp3|m4a)$/i;

/** Anything that goes wrong, as words for the person holding the file. */
export function politeError(error) {
  if (error instanceof DeckError) return { code: error.code, message: error.message };
  // Out of memory in the database's own space, or a file it can't make sense of.
  return { code: "broken", message: "This file is damaged, or not one Lexicommons can read, so nothing was added." };
}

/** Reads a file to a deck. openDatabase(bytes): a database over those bytes (sql.js here, the same in the tests). */
export async function readDeck(blob, openDatabase, { fileName = "", onProgress = () => {} } = {}) {
  onProgress("opening", 0, 0);
  const zipEntries = await readZip(blob);
  const spend = budget();
  const bytes = await collectionBytes(blob, zipEntries, spend);
  const files = await mediaMap(blob, zipEntries, spend);
  onProgress("reading", 0, 0);
  const db = await openDatabase(allowUnicase(bytes));
  try {
    const collection = readCollection(db);
    const deck = deckFrom(collection, { fileName, onProgress: (done, total) => onProgress("reading", done, total) });
    // A card keeps only the sounds that are really in the file and can be kept here; any others are counted, to say so.
    let soundsOther = 0;
    for (const card of deck.cards) {
      const named = card.sounds;
      card.sounds = named.filter((name) => SOUND_FILE.test(name) && files.has(name.normalize("NFC")));
      if (!card.sounds.length && named.some((name) => files.has(name.normalize("NFC")))) soundsOther++;
    }
    const soundsHere = deck.cards.filter((card) => card.sounds.length).length;
    return { deck: { ...deck, soundsHere, soundsOther }, entries: zipEntries, media: files, spending: spend };
  } finally {
    db.close();
  }
}

/** One card's sound, unpacked: its bytes and kind, or null when it has none that can come across. */
export async function soundOf(blob, zipEntries, files, names, spend) {
  for (const name of names) {
    if (!SOUND_FILE.test(name)) continue;
    const entry = zipEntries.get(files.get(name.normalize("NFC")));
    if (!entry) continue;
    let bytes = await readEntry(blob, entry, { max: CAPS.soundBytes, spending: spend }).catch((error) => {
      if (error instanceof DeckError && error.code === "too-big") return null;
      throw error;
    });
    if (!bytes) continue;
    if (isZstd(bytes)) {
      try {
        bytes = unzstd(bytes, { max: CAPS.soundBytes, spending: spend });
      } catch (error) {
        if (error instanceof DeckError && error.code === "too-big") continue;
        throw error;
      }
    }
    return { bytes, kind: name.slice(-3).toLowerCase() };
  }
  return null;
}

export async function handle(message, port, initSqlJs) {
  if (message.kept !== undefined) {
    waiting?.(message.kept);
    waiting = null;
    return;
  }
  try {
    if (message.open) {
      file = message.open;
      const SQL = await initSqlJs({ locateFile: () => "/vendor/anki/sql-wasm.wasm" });
      const result = await readDeck(file, (bytes) => new SQL.Database(bytes), { fileName: file.name, onProgress: (stage, done, total) => port.postMessage({ progress: { stage, done, total } }) });
      ({ entries, media, spending } = result);
      port.postMessage({ deck: result.deck });
      return;
    }
    if (message.sounds) {
      let kept = 0;
      let bytesKept = 0;
      let skipped = 0;
      let stopped = 0;
      for (const [at, { card, names }] of message.sounds.entries()) {
        port.postMessage({ progress: { stage: "sounds", done: at, total: message.sounds.length } });
        if (bytesKept >= CAPS.keptSoundBytes) {
          stopped++;
          continue;
        }
        let sound;
        try {
          sound = await soundOf(file, entries, media, names, spending);
        } catch (error) {
          // The file's budget ran out, or one entry is damaged: the sounds so far stay and the cards are fine without.
          if (error instanceof DeckError && error.code === "too-big") {
            stopped += message.sounds.length - at;
            break;
          }
          skipped++;
          continue;
        }
        if (!sound) {
          skipped++;
          continue;
        }
        const taken = new Promise((resolve) => (waiting = resolve));
        const size = sound.bytes.length;
        const buffer = sound.bytes.buffer.slice(sound.bytes.byteOffset, sound.bytes.byteOffset + size);
        port.postMessage({ sound: { card, kind: sound.kind, bytes: buffer } }, [buffer]);
        if (await taken) {
          kept++;
          bytesKept += size;
        } else skipped++;
      }
      port.postMessage({ soundsDone: { kept, skipped, stopped } });
    }
  } catch (error) {
    // The file's words for the person; the cause for whoever's looking at the console.
    if (!(error instanceof DeckError)) console.warn("Lexicommons: reading this deck failed:", error);
    port.postMessage({ error: politeError(error) });
  }
}
