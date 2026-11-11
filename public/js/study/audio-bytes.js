// A recording's bytes checked by their structure: when an admin's upload arrives (src/library-admin.ts receiveStaged),
// when your AI's recording for a pack of yours does (src/packs.ts setPackAudio), and on the device before it keeps one
// from your own storage (study/clips.js). An MP3 is MPEG audio frames, an MP4 has a sound track. Pure and
// dependency-free, shared by the Worker (src/audio-bytes.ts) and the app; scripts/test-audio-bytes.mjs runs it.

const decoder = new TextDecoder();

/**
 * Whether a recording's bytes are what they're declared as, by their structure, not a prefix: an MP3 is MPEG audio
 * frames (after any ID3 tag): a valid frame header, and another where the first one says it ends; an MP4 is a box
 * tree whose movie has a track with a sound handler (moov/trak/mdia/hdlr "soun"). Anything else is refused when it
 * arrives.
 */
export function soundsRight(type, bytes) {
  if (type === "audio/mpeg") return isMpegAudio(bytes);
  if (type === "audio/mp4") return isMp4Audio(bytes);
  return true;
}

// MPEG audio frame headers (ISO 11172-3, 13818-3): kbps by [version 1 or 2/2.5][layer I, II, III][index], and Hz.
const BITRATES = [
  [
    [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  ],
  [
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  ],
];
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** The length of the MPEG audio frame whose header starts at at, or 0 when there's no valid header there. */
export function mpegFrameLength(bytes, at) {
  if (at + 4 > bytes.length || bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) return 0;
  const version = (bytes[at + 1] >> 3) & 3; // 3: MPEG 1, 2: MPEG 2, 0: MPEG 2.5, 1: reserved
  const layer = (bytes[at + 1] >> 1) & 3; // 3: I, 2: II, 1: III, 0: reserved
  const bitrateIndex = bytes[at + 2] >> 4;
  const rateIndex = (bytes[at + 2] >> 2) & 3;
  if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return 0;
  const kbps = BITRATES[version === 3 ? 0 : 1][3 - layer][bitrateIndex];
  const rate = SAMPLE_RATES[version][rateIndex];
  const padding = (bytes[at + 2] >> 1) & 1;
  if (layer === 3) return Math.floor((12 * kbps * 1000) / rate + padding) * 4;
  const perFrame = layer === 1 && version !== 3 ? 72 : 144;
  return Math.floor((perFrame * kbps * 1000) / rate) + padding;
}

export function isMpegAudio(bytes) {
  let at = 0;
  // An ID3v2 tag first: "ID3", version, flags, then its size as four 7-bit bytes (plus a footer, when flagged).
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    if (bytes.length < 10 || [6, 7, 8, 9].some((i) => bytes[i] & 0x80)) return false;
    at = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]) + (bytes[5] & 0x10 ? 10 : 0);
  }
  const first = mpegFrameLength(bytes, at);
  // A first frame that runs past the end is a header with no audio behind it.
  if (!first || at + first > bytes.length) return false;
  // A second frame where the first ends (a one-frame file, ending exactly there, is still audio).
  return at + first === bytes.length || mpegFrameLength(bytes, at + first) > 0;
}

/** The boxes in bytes[start, end): type, payload start, and end; null when they don't tile the range exactly. */
function mp4Boxes(bytes, start, end) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = [];
  let at = start;
  while (at < end) {
    if (at + 8 > end) return null;
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) return null;
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) size = end - at;
    if (size < header || at + size > end) return null;
    boxes.push({ type: decoder.decode(bytes.subarray(at + 4, at + 8)), from: at + header, to: at + size });
    at += size;
  }
  return boxes;
}

export function isMp4Audio(bytes) {
  const top = mp4Boxes(bytes, 0, bytes.length);
  if (!top || top[0]?.type !== "ftyp") return false;
  const child = (box, type) => (mp4Boxes(bytes, box.from, box.to) ?? []).filter((b) => b.type === type);
  for (const moov of top.filter((b) => b.type === "moov")) {
    for (const trak of child(moov, "trak")) {
      for (const mdia of child(trak, "mdia")) {
        // hdlr: version and flags (4), pre_defined (4), then the handler type.
        if (child(mdia, "hdlr").some((hdlr) => hdlr.to - hdlr.from >= 12 && decoder.decode(bytes.subarray(hdlr.from + 8, hdlr.from + 12)) === "soun")) return true;
      }
    }
  }
  return false;
}
