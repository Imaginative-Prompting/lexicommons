// Reading an Anki file: a zip, read from its Blob a piece at a time, so a big deck never sits in memory whole. Nothing here
// believes what the file says about itself: a size in its directory is only a claim, so every entry is counted as it's
// unpacked, and it stops at its cap (a zip bomb stops there). Also the two compressed forms inside the file: zstd with
// fzstd (MIT, public/vendor/anki/), each frame's own header checked before any memory is set aside for it.

import { Decompress } from "../../vendor/anki/fzstd.mjs";

export const CAPS = {
  fileBytes: 1_500_000_000, // the file you pick
  entries: 200_000, // files inside it
  directoryBytes: 64_000_000, // its zip directory
  collectionBytes: 200_000_000, // its database, unpacked
  mediaMapBytes: 32_000_000, // its list of sounds and pictures, unpacked
  jsonBytes: 16_000_000, // a note type or deck list in an old file
  soundBytes: 2 * 1024 * 1024, // one sound (as study/clips.js keeps them)
  keptSoundBytes: 150_000_000, // every sound of one deck
  unpackedBytes: 600_000_000, // everything unpacked from one file
  zstdWindow: 128 * 1024 * 1024, // what a zstd frame may ask to keep in memory
  notes: 200_000, // notes in its database: more than this and it's refused
  fieldChars: 64_000, // one field: more than this and its card is left out
};

/** Why a file can't be read, in words for the person holding it. code says which, for what shows it and for the checks. */
export class DeckError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const sizeText = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);
const notAZip = () => new DeckError("not-anki", "That doesn't look like an Anki file. Anki decks end in .apkg, and whole collections in .colpkg.");
const tooBig = () => new DeckError("too-big", "This deck unpacks to more than Lexicommons can hold on a device, so it wasn't added.");

const bytesOf = async (blob, start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer());

function eocdAt(tail) {
  for (let i = tail.length - 22; i >= 0; i--) if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) return i;
  return -1;
}

/** The files in a zip: Map(name → { name, method, offset, compressed, size }). Throws DeckError for anything else. */
export async function readZip(blob) {
  if (blob.size > CAPS.fileBytes) throw new DeckError("file-too-big", `That file is ${sizeText(blob.size)}; the most Lexicommons can read is ${sizeText(CAPS.fileBytes)}.`);
  if (blob.size < 22) throw notAZip();
  const tailStart = Math.max(0, blob.size - 65_557);
  const tail = await bytesOf(blob, tailStart, blob.size);
  const at = eocdAt(tail);
  if (at < 0) throw notAZip();
  const eocd = new DataView(tail.buffer, tail.byteOffset + at);
  let count = eocd.getUint16(10, true);
  let dirSize = eocd.getUint32(12, true);
  let dirStart = eocd.getUint32(16, true);
  // A big zip keeps these in its 64-bit record, named just before.
  if (count === 0xffff || dirSize === 0xffffffff || dirStart === 0xffffffff) {
    const locatorAt = tailStart + at - 20;
    if (locatorAt < 0) throw notAZip();
    const locator = new DataView((await bytesOf(blob, locatorAt, locatorAt + 20)).buffer);
    if (locator.getUint32(0, true) !== 0x07064b50) throw notAZip();
    const recordAt = Number(locator.getBigUint64(8, true));
    if (!Number.isSafeInteger(recordAt) || recordAt < 0 || recordAt + 56 > blob.size) throw notAZip();
    const record = new DataView((await bytesOf(blob, recordAt, recordAt + 56)).buffer);
    if (record.getUint32(0, true) !== 0x06064b50) throw notAZip();
    count = Number(record.getBigUint64(32, true));
    dirSize = Number(record.getBigUint64(40, true));
    dirStart = Number(record.getBigUint64(48, true));
  }
  if (count > CAPS.entries) throw new DeckError("too-big", "This file holds more files than Lexicommons can go through, so it wasn't added.");
  if (dirSize > CAPS.directoryBytes || dirStart < 0 || dirStart + dirSize > blob.size) throw notAZip();
  const dir = await bytesOf(blob, dirStart, dirStart + dirSize);
  const view = new DataView(dir.buffer);
  const decoder = new TextDecoder();
  const entries = new Map();
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > dir.length || view.getUint32(p, true) !== 0x02014b50) throw notAZip();
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    let compressed = view.getUint32(p + 20, true);
    let size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    let offset = view.getUint32(p + 42, true);
    if (p + 46 + nameLength + extraLength + commentLength > dir.length) throw notAZip();
    const name = decoder.decode(dir.subarray(p + 46, p + 46 + nameLength));
    // The 64-bit sizes, when the plain ones say to look there.
    if (compressed === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) {
      let q = p + 46 + nameLength;
      const stop = q + extraLength;
      while (q + 4 <= stop) {
        const id = view.getUint16(q, true);
        const length = view.getUint16(q + 2, true);
        if (id === 1) {
          let r = q + 4;
          if (size === 0xffffffff && r + 8 <= stop) (size = Number(view.getBigUint64(r, true))), (r += 8);
          if (compressed === 0xffffffff && r + 8 <= stop) (compressed = Number(view.getBigUint64(r, true))), (r += 8);
          if (offset === 0xffffffff && r + 8 <= stop) offset = Number(view.getBigUint64(r, true));
        }
        q += 4 + length;
      }
    }
    p += 46 + nameLength + extraLength + commentLength;
    if (flags & 1) throw new DeckError("encrypted", "This file is locked with a password, so it can't be read.");
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(compressed) || offset < 0 || compressed < 0 || offset + compressed > blob.size) throw notAZip();
    if (!entries.has(name)) entries.set(name, { name, method, offset, compressed, size });
  }
  return entries;
}

// Where an entry's data starts: after its own header, whose lengths can differ from the directory's.
async function dataStart(blob, entry) {
  const head = await bytesOf(blob, entry.offset, entry.offset + 30);
  if (head.length < 30) throw notAZip();
  const view = new DataView(head.buffer);
  if (view.getUint32(0, true) !== 0x04034b50) throw notAZip();
  return entry.offset + 30 + view.getUint16(26, true) + view.getUint16(28, true);
}

/** Counts everything unpacked from one file, whatever each piece claims. */
export function budget(total = CAPS.unpackedBytes) {
  let left = total;
  return {
    spend(bytes) {
      left -= bytes;
      if (left < 0) throw tooBig();
    },
  };
}

/** One entry's bytes, unpacked and counted; over `max` it stops there and throws too-big. */
export async function readEntry(blob, entry, { max, spending = budget() } = {}) {
  const start = await dataStart(blob, entry);
  const end = start + entry.compressed;
  if (end > blob.size) throw notAZip();
  if (entry.method === 0) {
    if (entry.compressed > max) throw tooBig();
    spending.spend(entry.compressed);
    return bytesOf(blob, start, end);
  }
  if (entry.method !== 8) throw new DeckError("not-anki", "This file is packed in a way Lexicommons can't read.");
  if (typeof DecompressionStream !== "function") throw new DeckError("old-browser", "This browser can't unpack Anki files. Updating it should fix that.");
  const reader = blob.slice(start, end).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) throw tooBig();
      spending.spend(value.length);
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DeckError) {
      reader.cancel().catch(() => {});
      throw error;
    }
    throw new DeckError("broken", "This file is damaged, so it can't be read.");
  }
  return join(chunks, total);
}

function join(chunks, total) {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let p = 0;
  for (const chunk of chunks) {
    out.set(chunk, p);
    p += chunk.length;
  }
  return out;
}

const isZstd = (b) => b.length >= 4 && b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;
export { isZstd };

// Every frame's header and blocks, before anything's unpacked: refuses a frame asking for a huge window or naming a size
// past the cap, or more bytes of plain repeats than the cap (which cost no space in the file at all).
function checkZstd(b, max) {
  let p = 0;
  let certain = 0;
  while (p < b.length) {
    if (p + 4 > b.length) throw new DeckError("broken", "This file is damaged, so it can't be read.");
    const magic = (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
    if ((magic & 0xfffffff0) >>> 0 === 0x184d2a50) {
      if (p + 8 > b.length) throw new DeckError("broken", "This file is damaged, so it can't be read.");
      p += 8 + ((b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16) | (b[p + 7] << 24)) >>> 0);
      continue;
    }
    if (magic !== 0xfd2fb528) throw new DeckError("broken", "This file is damaged, so it can't be read.");
    const flags = b[p + 4];
    p += 5;
    const contentFlag = flags >> 6;
    const single = (flags >> 5) & 1;
    const checksum = (flags >> 2) & 1;
    const dictionaryBytes = [0, 1, 2, 4][flags & 3];
    let window = 0;
    if (!single) {
      const descriptor = b[p++];
      const base = 2 ** (10 + (descriptor >> 3));
      window = base + (base / 8) * (descriptor & 7);
    }
    if (dictionaryBytes) throw new DeckError("broken", "This file is packed in a way Lexicommons can't read.");
    const sizeBytes = contentFlag === 0 ? (single ? 1 : 0) : [0, 2, 4, 8][contentFlag];
    let size = 0;
    for (let i = sizeBytes - 1; i >= 0; i--) size = size * 256 + (b[p + i] ?? 0);
    if (sizeBytes === 2) size += 256;
    p += sizeBytes;
    if (single) window = size;
    if (window > CAPS.zstdWindow || size > max) throw tooBig();
    for (;;) {
      if (p + 3 > b.length) throw new DeckError("broken", "This file is damaged, so it can't be read.");
      const header = b[p] | (b[p + 1] << 8) | (b[p + 2] << 16);
      const type = (header >> 1) & 3;
      const blockSize = header >> 3;
      p += 3;
      if (type === 3) throw new DeckError("broken", "This file is damaged, so it can't be read.");
      p += type === 1 ? 1 : blockSize;
      if (type !== 2) certain += blockSize;
      if (certain > max) throw tooBig();
      if (header & 1) break;
    }
    if (checksum) p += 4;
  }
}

/** zstd's bytes unpacked and counted; over `max` it stops and throws too-big. */
export function unzstd(bytes, { max, spending = budget() } = {}) {
  checkZstd(bytes, max);
  const chunks = [];
  let total = 0;
  const stream = new Decompress((chunk) => {
    total += chunk.length;
    if (total > max) throw tooBig();
    spending.spend(chunk.length);
    chunks.push(chunk);
  });
  try {
    stream.push(bytes, true);
  } catch (error) {
    if (error instanceof DeckError) throw error;
    throw new DeckError("broken", "This file is damaged, so it can't be read.");
  }
  return join(chunks, total);
}
