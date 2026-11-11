// Reading a ZIP file in the browser (an EPUB is one): its central directory, then any entry's bytes, inflated by the
// platform's own DecompressionStream. Stored and deflated entries, which is all an EPUB uses. No ZIP64: an EPUB never
// needs it, and one that big is refused with a message. An entry is never read past what the directory says it holds,
// and the directory may say only so much (ZIP_LIMITS, the same as the server's EPUB_LIMITS), so a small file can't
// inflate into more than the device can hold.

export class ZipError extends Error {}

export const ZIP_LIMITS = { entries: 3000, entry: 32 * 1024 * 1024, total: 128 * 1024 * 1024 };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Opens a ZIP Blob (or File). Returns { names, has(name), bytes(name), text(name) }. */
export async function openZip(blob) {
  // The end of the central directory: within the last 64 KiB (its comment) and 22 bytes.
  const tailStart = Math.max(0, blob.size - 65557);
  const tail = new DataView(await blob.slice(tailStart).arrayBuffer());
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError("That file isn't an EPUB (it isn't a ZIP archive).");
  const count = tail.getUint16(end + 10, true);
  if (count > ZIP_LIMITS.entries) throw new ZipError(`That EPUB holds ${count} files; one here may hold ${ZIP_LIMITS.entries}.`);
  const size = tail.getUint32(end + 12, true);
  const offset = tail.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff || size === 0xffffffff) throw new ZipError("That file is too big to open here.");
  const directory = new DataView(await blob.slice(offset, offset + size).arrayBuffer());
  const utf8 = new TextDecoder("utf-8");
  const entries = new Map();
  let total = 0;
  let p = 0;
  for (let k = 0; k < count; k++) {
    if (p + 46 > directory.byteLength || directory.getUint32(p, true) !== CENTRAL) throw new ZipError("That EPUB is damaged (its file list doesn't read).");
    const flags = directory.getUint16(p + 8, true);
    const method = directory.getUint16(p + 10, true);
    const packed = directory.getUint32(p + 20, true);
    const unpacked = directory.getUint32(p + 24, true);
    if (unpacked > ZIP_LIMITS.entry) throw new ZipError(`That EPUB has a file of ${Math.round(unpacked / 1e6)} MB once unpacked; each may be ${ZIP_LIMITS.entry / 1024 / 1024} MB.`);
    total += unpacked;
    if (total > ZIP_LIMITS.total) throw new ZipError(`That EPUB is more than ${ZIP_LIMITS.total / 1024 / 1024} MB once unpacked.`);
    const nameLength = directory.getUint16(p + 28, true);
    const extraLength = directory.getUint16(p + 30, true);
    const commentLength = directory.getUint16(p + 32, true);
    const local = directory.getUint32(p + 42, true);
    const name = utf8.decode(new Uint8Array(directory.buffer, directory.byteOffset + p + 46, nameLength));
    entries.set(name, { method, packed, unpacked, local, locked: (flags & 1) === 1 });
    p += 46 + nameLength + extraLength + commentLength;
  }

  async function bytes(name) {
    const entry = entries.get(name);
    if (!entry) return null;
    if (entry.locked) throw new ZipError("That EPUB is password-protected.");
    const head = new DataView(await blob.slice(entry.local, entry.local + 30).arrayBuffer());
    if (head.getUint32(0, true) !== LOCAL) throw new ZipError("That EPUB is damaged.");
    const start = entry.local + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    const data = blob.slice(start, start + entry.packed);
    if (entry.method === 0) {
      if (entry.packed !== entry.unpacked) throw new ZipError("That EPUB is damaged.");
      return new Uint8Array(await data.arrayBuffer());
    }
    if (entry.method === 8) return inflate(data, entry.unpacked);
    throw new ZipError("That EPUB is packed in a way this can't read.");
  }

  /** A deflated entry, inflated only up to the size its directory says (more than that: it's damaged, or a bomb). */
  async function inflate(data, size) {
    const reader = data.stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const out = new Uint8Array(size);
    let at = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (at + value.length > size) {
        await reader.cancel().catch(() => {});
        throw new ZipError("That EPUB is damaged: a file in it holds more than it says.");
      }
      out.set(value, at);
      at += value.length;
    }
    if (at !== size) throw new ZipError("That EPUB is damaged: a file in it holds less than it says.");
    return out;
  }

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    bytes,
    async text(name) {
      const b = await bytes(name);
      return b === null ? null : utf8.decode(b);
    },
  };
}
