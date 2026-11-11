// A word as a game shows it, said by its recordings (study/voice.js wordRecording, speakWord, speakTapped, hearsWord): a pack records its
// words by their dictionary form ("koffie"), and the games show a noun with its article ("de koffie"), so the one-word games (Tap the picture,
// Pick the word, Type the word, Say and Repeat the word) went to this device's voice, which an iPhone's silent switch silences while a recording
// plays. Here, with an <audio> element, speechSynthesis, fetch and the page stood in (nothing played): a word's own clip, as written or in small
// letters; a noun with its article as the two clips in one voice; a pair with a word not recorded, and a word with no clip, read by the
// device's voice whole; a clip that fails mid-pair leaving only what's left to the device's voice; stop() between the two; hearsWord with no
// device voice. Then, the second element unlocked (a press) and each clip's sound read from its samples (an OfflineAudioContext stood in):
// the pair joined, the article from its first sound, the noun set at its first sound on the second element and started before the article's
// last sound, the article stopped there, the join's gap measured small; a clip whose sound can't be read played in turn; stop() during the
// article. Another copy's dir to see it fail on one from before.
//   node scripts/test-word-recordings.mjs [<app dir>]   (exit 0 = pass)

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP = resolve(process.argv[2] ?? new URL("..", import.meta.url).pathname);
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, visibilityState: "visible" };
globalThis.location = { origin: "http://lx.test", href: "http://lx.test/app/" };
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 4);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
store.set("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));

// What was asked for, in order: ["clip", path] for an <audio> play, ["speak", text] for the device's voice.
const heard = []; // ["clip", path, where it started] for each play, ["speak", text] for the device's voice
const paused = []; // [path, where] for each pause of a playing clip
const BROKEN = new Set();
const CLIP_SECONDS = 0.2;
// An <audio> element that keeps time: loads (loadedmetadata), seeks (seeked), plays its clip from where it's set at real speed, ends at its
// end; a src in BROKEN fails as a file that won't load does.
class StandInAudio {
  constructor() {
    this.listeners = new Map();
    this._src = "";
    this.at = 0;
    this.since = null;
    this.duration = CLIP_SECONDS;
    this.readyState = 0;
    this.playbackRate = 1;
    this.timer = null;
  }
  get src() {
    return this._src;
  }
  set src(value) {
    this._src = new URL(value, location.origin).href;
    this.pause();
    this.at = 0;
    this.readyState = 0;
    const path = new URL(this._src).pathname;
    setTimeout(() => {
      if (BROKEN.has(path)) return this.fire("error");
      this.readyState = 1;
      this.fire("loadedmetadata");
    }, 2);
  }
  get currentSrc() {
    return this._src;
  }
  get paused() {
    return this.since === null;
  }
  get currentTime() {
    return this.since === null ? this.at : Math.min(this.duration, this.at + ((performance.now() - this.since) / 1000) * this.playbackRate);
  }
  set currentTime(value) {
    this.at = value;
    if (this.since !== null) this.since = performance.now();
    if (this.readyState >= 1) setTimeout(() => this.fire("seeked"), 1);
  }
  load() {}
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }
  fire(type) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ type });
  }
  play() {
    const path = new URL(this._src).pathname;
    if (path === "/audio/silence.mp3") return Promise.resolve();
    heard.push(["clip", path, Math.round(this.currentTime * 1000) / 1000]);
    if (BROKEN.has(path)) {
      setTimeout(() => this.fire("error"), 5);
      return Promise.resolve();
    }
    this.since = performance.now();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.at = this.duration;
      this.since = null;
      this.fire("ended");
    }, ((this.duration - this.at) / this.playbackRate) * 1000);
    return Promise.resolve();
  }
  pause() {
    if (this.since !== null) {
      this.at = this.currentTime;
      paused.push([new URL(this._src).pathname, Math.round(this.at * 1000) / 1000]);
    }
    this.since = null;
    clearTimeout(this.timer);
  }
}
globalThis.Audio = StandInAudio;

// This device's voices: Dutch's two, or none.
let deviceVoices = [{ name: "Xander", lang: "nl-NL", voiceURI: "xander", localService: true }, { name: "Ellen", lang: "nl-BE", voiceURI: "ellen", localService: true }];
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};
globalThis.speechSynthesis = {
  getVoices: () => deviceVoices,
  addEventListener: () => {},
  speaking: false,
  cancel() {},
  speak(utterance) {
    if (!utterance.text) return;
    heard.push(["speak", utterance.text]);
    setTimeout(() => utterance.onstart?.(), 2);
    setTimeout(() => utterance.onend?.(), 15);
  },
};

// The starter's recordings, as a version 1 manifest: two voices, each with its words by their dictionary form, as voice-pack.mjs records
// them; "huis" only in one voice; no "drink" anywhere.
const words = (slug, list) => Object.fromEntries(list.map((w) => [w, { src: `${slug}/w-${w}.mp3`, text: w, seconds: 0.6, hash: "0" }]));
const MANIFEST = {
  format: "lexicommons-audio",
  version: 1,
  pack: "starter-word-order",
  language: "nl",
  voices: {
    emma: { name: "Emma", locale: "nl-NL", items: {}, words: words("emma", ["de", "het", "koffie", "melk", "ja", "huis"]) },
    ido: { name: "Ido", locale: "nl-NL", items: {}, words: words("ido", ["de", "het", "koffie", "melk", "ja"]) },
  },
};
globalThis.fetch = async (url) => {
  const path = String(url);
  if (path.endsWith("/manifest.json")) return new Response(JSON.stringify(MANIFEST), { status: 200, headers: { "content-type": "application/json" } });
  if (path.endsWith(".mp3")) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
  return new Response("", { status: 404 });
};

const voice = await import(pathToFileURL(resolve(APP, "public/js/study/voice.js")).href);
const { PACK } = await import(pathToFileURL(resolve(APP, "public/js/study/content.js")).href);
await voice.loadAudio();
const DIR = `/audio/${PACK.id}`;

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}
// Says something, waits for it to finish, and returns what was asked for and how it ended.
async function say(fn) {
  heard.length = 0;
  const sound = fn();
  const how = sound ? await Promise.race([sound.done, new Promise((r) => setTimeout(() => r("timed out"), 2000))]) : null;
  return { heard: [...heard], how };
}
const voiceOf = (path) => path.split("/").at(-2);
const word = (path) => path.split("/").at(-1);

// The starter's recordings loaded: a word by its dictionary form plays its clip, as before.
const plain = await say(() => voice.speakWord("koffie"));
check("a word as its dictionary form plays its own clip", [plain.heard.map(([kind, p]) => (kind === "clip" ? word(p) : p)), plain.how], [["w-koffie.mp3"], "ended"]);

// A noun with its article, as the games show it: the article's clip, then the noun's, in one voice; the device's voice never.
const noun = await say(() => voice.speakWord("de koffie"));
check("a noun with its article (\"de koffie\") plays the article's clip, then the noun's", [noun.heard.map(([kind, p]) => (kind === "clip" ? word(p) : `speak:${p}`)), noun.how], [["w-de.mp3", "w-koffie.mp3"], "ended"]);
check("…both in one voice", new Set(noun.heard.map(([, p]) => voiceOf(p))).size, 1);
check("…and each from the starter's folder", noun.heard.every(([kind, p]) => kind === "clip" && p.startsWith(`${DIR}/`)), true);
check("wordRecording says the same: two clips, the article first", voice.wordRecording?.("het huis", "nl")?.map((c) => word(new URL(c.url, location.origin).pathname)) ?? null, ["w-het.mp3", "w-huis.mp3"]);

// A word in capitals at a sentence's start ("Ja") plays the clip it has in small letters.
const capital = await say(() => voice.speakWord("Ja"));
check("a word with a capital (\"Ja\") plays its clip in small letters", capital.heard.map(([kind, p]) => (kind === "clip" ? word(p) : `speak:${p}`)), ["w-ja.mp3"]);

// Only one voice has "huis": a pair whose voice has both is played in it; one that hasn't a word at all is read whole by the device.
const both = await say(() => voice.speakWord("het huis"));
check("a pair takes the voice that has both of its words (only Emma has huis)", both.heard.map(([kind, p]) => (kind === "clip" ? `${voiceOf(p)}/${word(p)}` : `speak:${p}`)), ["emma/w-het.mp3", "emma/w-huis.mp3"]);
const unrecorded = await say(() => voice.speakWord("de thee"));
check("a pair with a word no voice has is read whole by the device's voice, no clip of it played", unrecorded.heard, [["speak", "de thee"]]);
const form = await say(() => voice.speakWord("drink"));
check("a form with no clip (\"drink\") is the device's voice, as before", form.heard, [["speak", "drink"]]);
const three = await say(() => voice.speakWord("de koffie melk"));
check("three words are no noun and its article: the device's voice", three.heard, [["speak", "de koffie melk"]]);

// The noun's clip can't be had (offline with no copy): the article was said, so the device says only what's left.
BROKEN.add(`${DIR}/emma/w-koffie.mp3`);
BROKEN.add(`${DIR}/ido/w-koffie.mp3`);
const broken = await say(() => voice.speakWord("de koffie"));
check("a pair's second clip failing: the device's voice says the rest, nothing twice", [broken.heard.map(([kind, p]) => (kind === "clip" ? word(p) : `speak:${p}`)), broken.how], [["w-de.mp3", "w-koffie.mp3", "speak:koffie"], "ended"]);
BROKEN.clear();

// Stopped while the article plays: the noun never starts, and it ends as stopped.
heard.length = 0;
const stopped = voice.speakWord("de melk");
await new Promise((r) => setTimeout(r, 8));
stopped?.stop();
const how = stopped ? await stopped.done : null;
await new Promise((r) => setTimeout(r, 60));
check("stop() during the article: the noun never plays", [heard.map(([kind, p]) => (kind === "clip" ? word(p) : `speak:${p}`)), how], [["w-de.mp3"], "stopped"]);

// A word tapped in a game (speakTapped) goes the same way.
const tapped = await say(() => voice.speakTapped("de koffie"));
check("a tapped noun with its article plays the two clips", tapped.heard.map(([kind, p]) => (kind === "clip" ? word(p) : `speak:${p}`)), ["w-de.mp3", "w-koffie.mp3"]);

// The second element unlocked (a press does it: voice.js unlockAudio) and each clip's sound read from its samples: a stand-in decoder
// gives every clip a first sound at 20 ms and a last at 150 ms, of its 200 ms; one path in UNREADABLE can't be decoded.
const FIRST = 0.02;
const LAST = 0.15;
const UNREADABLE = new Set();
let decoding = null;
globalThis.OfflineAudioContext = class {
  async decodeAudioData() {
    const path = decoding;
    if (UNREADABLE.has(path)) throw new Error("can't decode");
    const rate = 1000;
    const data = new Float32Array(CLIP_SECONDS * rate);
    for (let i = FIRST * rate; i < LAST * rate; i++) data[i] = 0.5;
    return { sampleRate: rate, duration: CLIP_SECONDS, getChannelData: () => data };
  }
};
// (The decoder is told which clip it has by the fetch that brought its bytes.)
const plainFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  decoding = new URL(String(url), location.origin).pathname;
  return plainFetch(url, init);
};
voice.unlockAudio();
await new Promise((r) => setTimeout(r, 20));
paused.length = 0;
const joined = await say(() => voice.speakWord("de koffie"));
const clipsOf = (list) => list.filter(([kind]) => kind === "clip").map(([, p, at]) => [word(p), at]);
check(
  "joined: the article from its first sound, the noun set at its first sound (each 10 ms before), and no device voice",
  [clipsOf(joined.heard), joined.heard.some(([kind]) => kind === "speak"), joined.how],
  [[["w-de.mp3", FIRST - 0.01], ["w-koffie.mp3", FIRST - 0.01]], false, "ended"],
);
const articleStop = paused.find(([p]) => p.endsWith("/w-de.mp3"));
check("joined: the article stopped at its last sound, not played to its end", Boolean(articleStop) && articleStop[1] >= LAST && articleStop[1] < LAST + 0.03, true);
check("joined: the join's gap measured, within 25 ms either way", typeof voice.joinState?.gap === "number" && Math.abs(voice.joinState.gap) <= 25, true);

UNREADABLE.add(`${DIR}/emma/w-melk.mp3`);
UNREADABLE.add(`${DIR}/ido/w-melk.mp3`);
paused.length = 0;
const unread = await say(() => voice.speakWord("de melk"));
check("a clip whose sound can't be read: the pair plays in turn, each whole", [clipsOf(unread.heard), unread.how], [[["w-de.mp3", 0], ["w-melk.mp3", 0]], "ended"]);

heard.length = 0;
paused.length = 0;
const cut = voice.speakWord("het huis");
await new Promise((r) => setTimeout(r, 60));
cut?.stop();
const cutHow = cut ? await cut.done : null;
await new Promise((r) => setTimeout(r, 250));
check("joined, stop() during the article: the noun never plays", [heard.filter(([kind]) => kind === "clip").map(([, p]) => word(p)), cutHow], [["w-het.mp3"], "stopped"]);

// A word shown with both its forms is said as the two with a pause, never with its slash (the device's voice reads it out): Portuguese's
// phrase card, Dutch's mooi/mooie, a tapped tile; a slash between digits stays. The voice.js from before says the slash.
check("a phrase shown with both its forms: said without the slash", (await say(() => voice.speakWord("obrigado / obrigada", { lang: "nl" }))).heard, [["speak", "obrigado, obrigada"]]);
check("a word's two forms written mooi/mooie: said without the slash", (await say(() => voice.speakWord("mooi/mooie", { lang: "nl" }))).heard, [["speak", "mooi, mooie"]]);
check("a tapped tile with both forms: said without the slash", (await say(() => voice.speakTapped("mooi/mooie", { lang: "nl" }))).heard, [["speak", "mooi, mooie"]]);
check("a card's text with both forms: said without the slash", (await say(() => voice.speakCard({ text: "obrigado / obrigada", lang: "nl" }))).heard, [["speak", "obrigado, obrigada"]]);
check("a slash between digits stays (the control)", (await say(() => voice.speakWord("24/7", { lang: "nl" }))).heard, [["speak", "24/7"]]);

// With no device voice for the language, what's recorded can still be heard, what isn't can't.
deviceVoices = [];
check("hearsWord with no device voice: a noun with its article (recorded in two clips) can be heard", voice.hearsWord("de koffie", { lang: "nl" }), true);
check("hearsWord with no device voice: a form with no clip can't", voice.hearsWord("drink", { lang: "nl" }), false);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
