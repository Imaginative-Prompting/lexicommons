#!/usr/bin/env node
// A recording's bytes as the library takes them (src/audio-bytes.ts): every one of the starter's real clips and a real
// MP4 pass; text behind an ID3 tag or an ftyp box, a clip with junk after its first frame, a movie with no sound track,
// and each format sent as the other are refused.
//
//   node scripts/test-audio-bytes.mjs        (exit 0 = pass)

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isMp4Audio, isMpegAudio, mpegFrameLength, soundsRight } from "../src/audio-bytes.ts";

const APP = join(dirname(new URL(import.meta.url).pathname), "..");
let failed = 0;
let passed = 0;
const check = (cond, name) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  FAIL  ${name}`);
  }
};
const bytes = (path) => new Uint8Array(readFileSync(path));
const text = (s) => new TextEncoder().encode(s);
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) out.set(p, (at += p.length) - p.length);
  return out;
};
/** An MP4 box: a 32-bit size, the type, the payload. */
const box = (type, ...payload) => {
  const body = concat(...payload);
  const head = new Uint8Array(8);
  new DataView(head.buffer).setUint32(0, 8 + body.length);
  head.set(text(type), 4);
  return concat(head, body);
};
const hdlr = (handler) => box("hdlr", new Uint8Array(8), text(handler), new Uint8Array(12));
const movie = (handler) => concat(box("ftyp", text("M4A "), new Uint8Array(4), text("isom")), box("moov", box("trak", box("mdia", hdlr(handler)))));

// The starter's recordings, every clip: real MP3s from the voice pipeline.
const STARTER = join(APP, "public/audio/starter-word-order");
const clips = readdirSync(STARTER, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((voice) => readdirSync(join(STARTER, voice.name)).filter((f) => f.endsWith(".mp3")).map((f) => join(STARTER, voice.name, f)));
check(clips.length >= 80, `the starter has its clips (${clips.length})`);
for (const clip of clips) check(soundsRight("audio/mpeg", bytes(clip)), `a real clip passes: ${clip.slice(STARTER.length + 1)}`);
check(soundsRight("audio/mpeg", bytes(join(APP, "public/audio/silence.mp3"))), "the app's silence.mp3 passes");
check(soundsRight("audio/mp4", bytes(join(APP, "scripts/fixtures/audio/silence.m4a"))), "a real MP4 audio file passes (afconvert's AAC)");
check(isMp4Audio(movie("soun")), "a box tree with a sound track passes");

// Refused.
check(!soundsRight("audio/mpeg", text("ID3plain text")), "text behind an ID3 tag");
check(!soundsRight("audio/mpeg", text("This is text, not an MP3.")), "plain text as an MP3");
check(!soundsRight("audio/mp4", text("0000ftypplain text")), "text behind an ftyp");
check(!isMp4Audio(movie("vide")), "a movie with only a video track");
check(!isMp4Audio(concat(movie("soun"), new Uint8Array([0, 0, 0]))), "boxes that don't tile the file");
const real = bytes(clips[0]);
check(!isMpegAudio(concat(real.subarray(0, firstFrameEnd(real)), text("junk after the first frame"))), "a clip with junk after its first frame");
check(!soundsRight("audio/mp4", real), "an MP3 sent as an MP4");
check(!soundsRight("audio/mpeg", bytes(join(APP, "scripts/fixtures/audio/silence.m4a"))), "an MP4 sent as an MP3");
check(!isMpegAudio(new Uint8Array(0)), "nothing");
check(!isMpegAudio(new Uint8Array([0xff, 0xfb, 0x90, 0x00])), "a frame header alone (its frame runs past the end)");
const firstEnd = firstFrameEnd(real);
check(!isMpegAudio(real.subarray(0, firstEnd - 1)), "a clip cut inside its first frame");
check(isMpegAudio(real.subarray(0, firstEnd)), "a clip of exactly one whole frame");

/** Where a real clip's first MPEG frame ends: after its ID3 tag, by the frame's own header. */
function firstFrameEnd(b) {
  const at = b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33 ? 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]) : 0;
  return at + mpegFrameLength(b, at);
}

console.log(`audio bytes: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
