// Tinta's mouth on what the app says (the speech drivers: docs/design-system.md, "Tinta speaks"), in Node:
// - a word's letters as mouth shapes (the rig's kit/speech.js shapesOf), for every word of every starter, in every
//   writing system the app has: each word with letters gives shapes, by its reading where the language shows one;
// - the track (speechTrack) on the Dutch starter's recordings: the mouth opens inside every word at the manifest's
//   times, and rests before and after the sentence; the control, the same track half a second late, fails it;
// - a recording's loudness (loudness) on a made-up sound: silence closed, a tone open;
// - a device voice's words: estimated from their length (estimateWords), and its clock put right at each boundary
//   (speaking.js boundaryClock);
// - study/voice.js announcing a device voice to the channel (speaking.js): its words (a Japanese sentence by its
//   readings), its clock running from the voice's start and jumping to each word it reports, and ending with it.
// Nothing is spoken. Exit 0 = pass.
//   node scripts/test-speech-track.mjs

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

// voice.js runs in Node on stand-ins (as test-voices.mjs): a store, and a speech engine whose events this test fires.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.addEventListener = () => {};
globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, visibilityState: "visible" };
const VOICES = [
  { name: "Xander", lang: "nl-NL", voiceURI: "xander", localService: true },
  { name: "Kyoko", lang: "ja-JP", voiceURI: "kyoko", localService: true },
];
let spoken = null;
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    Object.assign(this, { text, lang: "", voice: null, rate: 1 });
  }
};
globalThis.speechSynthesis = { getVoices: () => VOICES, addEventListener: () => {}, speak: (u) => (spoken = u), cancel() {} };
store.set("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));

const { VISEMES, shapesOf, speechTrack, loudness, estimateWords } = await import("../public/js/character/rig/kit/speech.js");
const { onSpeech, startSpeech, boundaryClock } = await import("../public/js/character/speaking.js");
const voice = await import("../public/js/study/voice.js");

let failed = 0;
function ok(name, pass, detail = "") {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
}

// ---- letters to shapes, every starter ---------------------------------------------------------------------------------
{
  const packs = readdirSync(join(APP, "packs")).filter((f) => /^starter-.+\.json$/.test(f));
  const dutch = JSON.parse(readFileSync(join(APP, "public/audio/starter-word-order/manifest.json"), "utf8"));
  const empty = [];
  let words = 0;
  const langs = new Set();
  for (const file of packs) {
    const pack = JSON.parse(readFileSync(join(APP, "packs", file), "utf8"));
    const lang = pack.language ?? file.slice(8, -5);
    langs.add(lang);
    for (const item of pack.items) {
      for (const [text, , reading] of item.words) {
        const said = reading ?? text;
        if (!/\p{L}/u.test(said)) continue;
        words++;
        const shapes = shapesOf(said, lang);
        if (!shapes.length || shapes.some((s) => !VISEMES[s.v])) empty.push(`${lang} ${said}`);
      }
    }
  }
  for (const v of Object.values(dutch.voices)) for (const it of Object.values(v.items)) for (const w of it.text.split(/\s+/)) if (/\p{L}/u.test(w) && !shapesOf(w, "nl").length) empty.push(`nl ${w}`);
  ok(`every word of every starter gives mouth shapes (${words} words, ${langs.size + 1} languages)`, empty.length === 0, empty.slice(0, 8).join(", "));
}

// ---- the track against the recordings' own times ----------------------------------------------------------------------
{
  const manifest = JSON.parse(readFileSync(join(APP, "public/audio/starter-word-order/manifest.json"), "utf8"));
  const sentences = [];
  for (const v of Object.values(manifest.voices)) {
    for (const it of Object.values(v.items)) {
      const said = it.text.replace(/[.,!?;:¿¡]/g, "").split(/\s+/).filter(Boolean);
      if (said.length === it.words.length) sentences.push(said.map((text, i) => ({ text, start: it.words[i][0], end: it.words[i][1] })));
    }
  }
  // Every word opens the mouth, on frames a 30-a-second loop draws (the mouth leads the sound by 35 ms, as lip sync
  // does, so a word's frames start that much early); before the sentence and after it, it rests.
  const opensInEveryWord = (words, track) =>
    words.every((w) => {
      let most = 0;
      for (let phase = 0; phase < 1; phase += 0.25) {
        let seen = 0;
        for (let t = w.start - 0.035 + phase / 30; t < w.end; t += 1 / 30) seen = Math.max(seen, track.at(t).open);
        most = phase === 0 ? seen : Math.min(most, seen);
      }
      return most > 0.15;
    });
  const restsOutside = (words, track) => track.at(words[0].start - 0.25).open < 0.02 && track.at(words.at(-1).end + 0.25).open < 0.02;
  const opened = sentences.filter((words) => opensInEveryWord(words, speechTrack(words, { lang: "nl" })));
  const rested = sentences.filter((words) => restsOutside(words, speechTrack(words, { lang: "nl" })));
  ok(`every word opens the mouth at the manifest's times, whatever frames a 30-a-second loop lands on (${sentences.length} recordings)`, sentences.length > 10 && opened.length === sentences.length, `${opened.length}/${sentences.length}`);
  ok("it rests before and after each sentence", rested.length === sentences.length, `${rested.length}/${sentences.length}`);
  // Control: the same measure on a track half a second late must fail on most recordings (the check sees timing).
  const late = sentences.filter((words) => {
    const track = speechTrack(words.map((w) => ({ ...w, start: w.start + 0.5, end: w.end + 0.5 })), { lang: "nl" });
    return opensInEveryWord(words, track) && restsOutside(words, track);
  });
  ok("control: a track half a second late fails the same measure", late.length < sentences.length / 4, `${late.length}/${sentences.length} still passed`);
}

// ---- a recording's loudness ------------------------------------------------------------------------------------------
{
  const rate = 22050;
  const samples = new Float32Array(rate * 1.5);
  for (let i = rate * 0.5; i < rate; i++) samples[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / rate);
  const env = loudness(samples, rate, 100);
  const mean = (a, b) => env.slice(a, b).reduce((s, v) => s + v, 0) / (b - a);
  ok("loudness: 100 samples a second", Math.abs(env.length - 150) <= 1, `${env.length}`);
  ok("loudness: silence closed, a tone open, silence closed", mean(5, 45) < 0.05 && mean(55, 95) > 0.8 && mean(105, 145) < 0.05, [mean(5, 45), mean(55, 95), mean(105, 145)].map((v) => v.toFixed(2)).join(" "));
  // With it, the mouth closes in the silence even inside a word's span.
  const track = speechTrack([{ text: "aaa", start: 0, end: 1.5 }], { lang: "nl", envelope: env, rate: 100 });
  ok("a recording's silence closes the mouth inside a word", track.at(0.25).open < 0.05 && track.at(0.75).open > 0.3, `${track.at(0.25).open.toFixed(2)} / ${track.at(0.75).open.toFixed(2)}`);
}

// ---- a device voice: the estimate and the boundaries ------------------------------------------------------------------
{
  const words = estimateWords(["morgen", "gaan", "we"]);
  ok("estimated words run in order, each with a length", words.every((w, i) => w.end > w.start && (i === 0 || w.start > words[i - 1].end)));
  const fast = estimateWords(["morgen", "gaan", "we"], { rate: 2 });
  ok("at twice the rate, half the time", Math.abs(fast.at(-1).end * 2 - words.at(-1).end) < 1e-9);
  const clock = boundaryClock(words, 10);
  const linear = Math.abs(clock.at(10.3) - 0.3) < 1e-9;
  clock.reach(2, 11);
  const jumped = Math.abs(clock.at(11) - words[2].start) < 1e-9;
  const held = Math.abs(clock.at(20) - words[2].end) < 1e-9;
  ok("its clock runs on the estimate, jumps to a word the voice reports, and waits at that word's end", linear && jumped && held, `${clock.at(11)} ${clock.at(20)}`);
}

// ---- the channel ------------------------------------------------------------------------------------------------------
{
  const seen = [];
  const off = onSpeech((s) => seen.push(s?.kind ?? null));
  const endA = startSpeech({ kind: "recording", words: [], clock: () => 0 });
  const endB = startSpeech({ kind: "device", words: [], clock: () => 0 });
  endA();
  endB();
  off();
  ok("the channel: one sound at a time, a replaced one's end changes nothing", JSON.stringify(seen) === JSON.stringify([null, "recording", "device", null]), JSON.stringify(seen));
}

// ---- voice.js announcing a device voice -------------------------------------------------------------------------------
{
  const log = [];
  let speech = null;
  const off = onSpeech((s) => {
    speech = s;
    log.push(s ? `${s.kind}:${s.words.map((w) => w.text).join(" ")}` : "end");
  });
  const item = { id: "ja-test", words: [["私", "私", "わたし"], ["は", "は"], ["学生", "学生", "がくせい"], ["です", "です"]], punct: "。" };
  const sound = voice.speakItem(item, { lang: "ja", choice: "device:kyoko" });
  const said = log.at(-1);
  const started = Boolean(speech && spoken);
  const words = speech?.words ?? [];
  spoken?.onstart?.();
  const t0 = speech?.clock() ?? -1;
  // The voice reaches 学生 (its third word): the clock jumps to that word's estimated start.
  spoken?.onboundary?.({ name: "word", charIndex: spoken.text.indexOf("学生") });
  const atWord = speech?.clock() ?? -1;
  spoken?.onend?.();
  await sound?.done;
  off();
  ok("voice.js announces a device voice, its words by their readings", started && said === "device:わたし は がくせい です", said);
  ok("its clock starts with the voice and jumps to the word it reports", t0 >= 0 && t0 < 0.05 && Math.abs(atWord - words[2]?.start) < 0.02, `${t0.toFixed(3)} → ${atWord.toFixed(3)} (word 3 at ${words[2]?.start?.toFixed(3)})`);
  ok("the speaking ends with the voice", speech === null && log.at(-1) === "end", log.at(-1));
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
