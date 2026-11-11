// Makes a pack's spoken audio with ElevenLabs: every sentence (with each word's timing, so the app can highlight words
// as they're spoken and replay one word) and every word's dictionary form. Writes mp3s plus a manifest the app reads,
// public/audio/<pack>/manifest.json, which can hold several voices. Dutch is forced with language_code, so a word
// that's also English ("kind", "dag") is never read the English way.
//
//   ELEVENLABS_API_KEY=… node scripts/voice-pack.mjs --voice <voice id> --slug <short-name> --name <shown name>
//       [--about "<one line>"] [--model eleven_v4] [--force]
//   ELEVENLABS_API_KEY=… node scripts/voice-pack.mjs --audition <id:name,id:name,…> --out <dir> "<sentence>" ["<sentence>" …]
//
//   ELEVENLABS_API_KEY=… node scripts/voice-pack.mjs --pack <pack.json> --through <lesson id> --max-chars <n> --out <folder>
//       --voice <voice id> --slug <short-name> --name <shown name> [--dry] [--again <id,id> --seed <n>]
//
// The first form voices the built-in starter deck (public/js/study/content.js). The --pack form voices a pack's lessons up to
// one of them, their sentences and their words, into a folder of its own (a version 1 folder: scripts/packs/audio-v2.mjs makes it
// what the library takes). It keeps what it has spent in <folder>/spent.json, every request and retry counted, and refuses before
// a request that would go past --max-chars, across all of that folder's voices; --dry says what a run would spend, and spends nothing.
// A clip is only made again when its text, voice or model changes (or with --force). The key is read from the environment and never printed.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "public");
const FORMAT = "mp3_44100_96";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    voice: { type: "string" },
    slug: { type: "string" },
    name: { type: "string" },
    about: { type: "string", default: "" },
    model: { type: "string", default: "eleven_v4" },
    force: { type: "boolean", default: false },
    audition: { type: "string" },
    out: { type: "string" },
    pack: { type: "string" },
    through: { type: "string" },
    "max-chars": { type: "string" },
    dry: { type: "boolean", default: false },
    again: { type: "string" },
    seed: { type: "string", default: "7" },
  },
});

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY && !values.dry) {
  console.error("Set ELEVENLABS_API_KEY.");
  process.exit(2);
}

// What a folder has spent: every character sent, retries too. Nothing is sent past the cap.
const ledger = { file: null, cap: Infinity, spent: 0 };
function charge(text) {
  if (ledger.spent + text.length > ledger.cap) throw new Error(`The cap: ${ledger.spent} characters spent, ${text.length} more would pass ${ledger.cap}. Nothing sent.`);
  ledger.spent += text.length;
  if (ledger.file) writeFileSync(ledger.file, JSON.stringify({ spent: ledger.spent, cap: ledger.cap }) + "\n");
}

/** One clip: the mp3 bytes and, when asked, the start and end time of every character. */
async function speak(voice, text, model, { timings = false } = {}) {
  const path = timings ? `/v1/text-to-speech/${voice}/with-timestamps` : `/v1/text-to-speech/${voice}`;
  for (let attempt = 1; ; attempt++) {
    charge(text);
    const res = await fetch(`https://api.elevenlabs.io${path}?output_format=${FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: model, language_code: "nl", seed: Number(values.seed) }),
    });
    if (res.ok) {
      if (!timings) return { audio: Buffer.from(await res.arrayBuffer()) };
      const body = await res.json();
      return { audio: Buffer.from(body.audio_base64, "base64"), alignment: body.alignment };
    }
    const detail = (await res.text()).slice(0, 300);
    if (attempt >= 3 || (res.status !== 429 && res.status < 500)) throw new Error(`ElevenLabs ${res.status} for "${text}": ${detail}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const seconds = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());

const round = (n) => Math.round(n * 1000) / 1000;
const hashOf = (...parts) => createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 16);

if (values.audition) {
  // A few voices reading the same sentences, for choosing a voice by ear.
  const out = values.out;
  if (!out) throw new Error("--audition needs --out");
  mkdirSync(out, { recursive: true });
  const list = [];
  for (const entry of values.audition.split(",")) {
    const [id, name] = entry.split(":");
    for (const [i, text] of positionals.entries()) {
      const file = `${name.toLowerCase()}-${i + 1}.mp3`;
      const { audio } = await speak(id, text, values.model);
      writeFileSync(join(out, file), audio);
      list.push({ voice: name, voiceId: id, text, file, seconds: round(seconds(join(out, file))) });
      console.log(`${name}: ${file}`);
    }
  }
  writeFileSync(join(out, "audition.json"), JSON.stringify({ model: values.model, clips: list }, null, 2) + "\n");
  process.exit(0);
}

if (!values.voice || !values.slug || !values.name) {
  console.error("usage: voice-pack.mjs --voice <id> --slug <short-name> --name <shown name> [--about …] [--model …] [--force]");
  process.exit(2);
}
if (!/^[a-z][a-z0-9-]{0,31}$/.test(values.slug)) throw new Error("--slug: lowercase letters, digits and dashes");

let PACK, ITEMS, WORDS, sentence, packDir;
if (values.pack) {
  // A pack's lessons up to one of them: their sentences, and the words they teach.
  if (!values.through || !values["max-chars"] || !values.out) throw new Error("--pack needs --through, --max-chars and --out");
  if (!relative(join(PUBLIC), resolve(values.out)).startsWith("..")) throw new Error("--out must be outside the app's public folder: these go to the library.");
  const { checkPack, itemSentence } = await import(join(PUBLIC, "js/study/pack-format.js"));
  const { pack, errors } = checkPack(JSON.parse(readFileSync(values.pack, "utf8")));
  if (!pack) throw new Error(`The pack doesn't pass the check: ${JSON.stringify(errors.slice(0, 3))}`);
  const end = pack.lessons.findIndex((lesson) => lesson.id === values.through);
  if (end < 0) throw new Error(`No lesson ${values.through} in ${pack.id}.`);
  const lessons = pack.lessons.slice(0, end + 1);
  const ids = new Set(lessons.flatMap((lesson) => lesson.items));
  PACK = pack;
  ITEMS = pack.items.filter((item) => ids.has(item.id));
  WORDS = Object.fromEntries(lessons.flatMap((lesson) => lesson.words).map((word) => [word.lemma, true]));
  sentence = (item) => itemSentence(item, pack.language);
  packDir = resolve(values.out);
  mkdirSync(packDir, { recursive: true });
  ledger.file = join(packDir, "spent.json");
  ledger.cap = Number(values["max-chars"]);
  if (existsSync(ledger.file)) ledger.spent = JSON.parse(readFileSync(ledger.file, "utf8")).spent;
} else {
  ({ PACK, ITEMS, WORDS, sentence } = await import(join(PUBLIC, "js/study/content.js")));
  packDir = join(PUBLIC, "audio", PACK.id);
}
const voiceDir = join(packDir, values.slug);
mkdirSync(voiceDir, { recursive: true });
const manifestFile = join(packDir, "manifest.json");
if (values.dry) {
  const texts = [...ITEMS.map((item) => sentence(item)), ...Object.keys(WORDS)];
  const chars = texts.reduce((sum, text) => sum + text.length, 0);
  console.log(`${ITEMS.length} sentences, ${Object.keys(WORDS).length} words: ${chars} characters for one voice; ${ledger.spent} spent of ${ledger.cap} so far. Nothing sent.`);
  process.exit(0);
}
const manifest = existsSync(manifestFile)
  ? JSON.parse(readFileSync(manifestFile, "utf8"))
  : { format: "lexicommons-audio", version: 1, pack: PACK.id, language: PACK.language, voices: {} };
const previous = manifest.voices[values.slug] ?? { items: {}, words: {} };
const voice = {
  name: values.name,
  about: values.about,
  provider: "elevenlabs",
  voiceId: values.voice,
  model: values.model,
  locale: "nl-NL",
  made: new Date().toISOString().slice(0, 10),
  items: {},
  words: {},
};

// --again <id,id>: these sentences once more, with another --seed, whatever's there.
const again = new Set((values.again ?? "").split(",").filter(Boolean));
let made = 0;
for (const item of ITEMS) {
  const text = sentence(item);
  const hash = hashOf(text, values.voice, values.model);
  const file = `${values.slug}/${item.id}.mp3`;
  const old = previous.items[item.id];
  if (!values.force && !again.has(item.id) && old?.hash === hash && existsSync(join(packDir, file))) {
    voice.items[item.id] = old;
    continue;
  }
  const { audio, alignment } = await speak(values.voice, text, values.model, { timings: true });
  writeFileSync(join(packDir, file), audio);
  // Each word's span: from its first character's start to its last character's end (the punctuation belongs to the
  // last word's text but not its timing).
  const words = [];
  let at = 0;
  for (const [token] of item.words) {
    const start = text.indexOf(token, at);
    const end = start + token.length - 1;
    at = end + 1;
    words.push([round(alignment.character_start_times_seconds[start]), round(alignment.character_end_times_seconds[end])]);
  }
  voice.items[item.id] = { src: file, text, seconds: round(seconds(join(packDir, file))), words, hash };
  made++;
  console.log(`${item.id}: ${text}`);
}
for (const word of Object.keys(WORDS)) {
  const hash = hashOf(word, values.voice, values.model);
  const file = `${values.slug}/w-${word}.mp3`;
  const old = previous.words[word];
  if (!values.force && old?.hash === hash && existsSync(join(packDir, file))) {
    voice.words[word] = old;
    continue;
  }
  const { audio } = await speak(values.voice, word, values.model);
  writeFileSync(join(packDir, file), audio);
  voice.words[word] = { src: file, text: word, seconds: round(seconds(join(packDir, file))), hash };
  made++;
  console.log(`word: ${word}`);
}

manifest.voices[values.slug] = voice;
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`${values.name}: ${made} clip(s) made, ${Object.keys(voice.items).length} sentences and ${Object.keys(voice.words).length} words in ${manifestFile}`);
