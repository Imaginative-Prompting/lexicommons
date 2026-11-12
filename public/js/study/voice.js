// Hearing the language you're learning (learning.js). Two kinds of voice:
// - recorded: a pack's clips, listed in its audio manifest with every word's timing, so the words light up as they're
//   spoken. A pack from the open library brings its own (packs.js packAudio: clips at /library/audio/<16 hex>, each
//   kept on the device once it has played, so it plays offline after), and a pack of yours the ones your AI made for it
//   (clips.js: kept on the device as they arrive, played from there); the starter's are inside the app too
//   (/audio/<pack>/, made with ElevenLabs by scripts/voice-pack.mjs), used until its library copy brings them;
// - this device's own voices for the language, through the browser's speech synthesis: any sentence, nothing to
//   download, the quality the device has.
// A pack's recorded voices belong to the pack: its sentences take turns between them (each sentence's voice changes
// from day to day, so your ear gets used to more than one speaker), unless the pack pins one. Settings → Study →
// Voices holds only what's yours on every pack: recordings first or not, your device voice, the speed, and what plays
// by itself. One thing plays at a time: a new sound stops the last. Playing never disables anything; pressing a speak
// button again stops it.
// Every sound that says words is announced to Tinta's mouth (character/speaking.js): a recording with its words' times
// and its file, a device voice with its words' times estimated (the rig's estimateWords) and put right at each word
// boundary the voice reports.

import { PACK } from "./content.js";
import { allPacks, isPackOn, onPacksChange, packAudio } from "./packs.js";
import { readAudio } from "./pack-audio.js";
import { getStudySettings, onStudySettingsChange } from "./settings.js";
import { learning } from "./learning.js";
import { LANGUAGES, languageName, voiceSpeaks } from "../lang/index.js";
import { separatorOf } from "./pack-format.js";
import { isYourClip, yourClipUrl } from "./clips.js";
import { CLIPS } from "./keep-clips.js";
import { boundaryClock, startSpeech } from "../character/speaking.js";
import { estimateWords } from "../character/rig/kit/speech.js";

const PACK_DIR = `/audio/${PACK.id}`;
const SILENCE = "/audio/silence.mp3";
/** The sentence every voice reads on the Voices page. */
export const SAMPLE_ITEM = "morgen-oma";
const RATE = { normal: 1, slower: 0.8 };

let builtIn = null; // the starter's recordings inside the app, as readAudio gives them
let loading = null;

/** Loads the starter's recordings inside the app (once). Resolves to them, or null when there are none. */
export function loadAudio() {
  loading ??= fetch(`${PACK_DIR}/manifest.json`)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((data) => (builtIn = readAudio(data, { base: PACK_DIR })));
  return loading;
}
loadAudio();

/** A pack's recordings ({ voices }), or null: its library copy's, else (the starter) the ones inside the app. */
function audioOf(packId) {
  return packAudio(packId) ?? (packId === PACK.id ? builtIn : null);
}

/** The language a pack is in (recordings speak only their pack's language: a German "in" isn't a Dutch one). */
function languageOf(packId) {
  return packId === PACK.id ? PACK.language : (allPacks().find((pack) => pack.id === packId)?.language ?? null);
}

/** The packs that can speak a language here, the starter first: [pack id], each with recordings. */
function recordedPacks(lang) {
  const ids = [...new Set([PACK.id, ...allPacks().filter((pack) => pack.language === lang && isPackOn(pack.id)).map((pack) => pack.id)])];
  return ids.filter((id) => languageOf(id) === lang && audioOf(id) && Object.keys(audioOf(id).voices).length);
}

// ---------- this device's voices ----------

const listeners = new Set();
const synth = typeof speechSynthesis === "undefined" ? null : speechSynthesis;
// The device's voices as a list, whatever the synth hands back. One iPhone's Safari (11 Nov 2026, iOS 27) had a speechSynthesis whose
// getVoices() answered undefined, and voicesFor's .filter on it threw while this module loaded, so the app never started. A list, a
// list-like, or nothing at all: never a throw.
function deviceVoiceList() {
  try {
    const list = synth?.getVoices?.();
    if (Array.isArray(list)) return list;
    return list && typeof list.length === "number" ? Array.from(list) : [];
  } catch {
    return [];
  }
}

// Apple's novelty and old robotic voices: listed as ordinary English voices, but sound effects rather than speech.
const NOVELTY = new Set(
  "albert,bad news,bahh,bells,boing,bubbles,cellos,deranged,good news,hysterical,jester,organ,pipe organ,superstar,trinoids,whisper,wobble,zarvox,fred,junior,kathy,ralph,agnes,bruce,princess,vicki,victoria".split(","),
);
// The Eloquence voices (Apple's older synthesizer, kept for screen readers): real speech, but flat and robotic.
const ELOQUENCE = new Set("eddy,flo,grandma,grandpa,reed,rocko,sandy,shelley".split(","));
const baseName = (voice) => String(voice.name ?? "").replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
// A voice's language and region, from its tag ("nl-NL", "en_GB").
const tagOf = (voice) => voice.lang.replace("_", "-").toLowerCase().split("-");
/** Whether a voice speaks a language (lang/index.js voiceSpeaks: "tl" takes fil-PH voices too; "zh" never Hong Kong's). */
const speaks = (lang) => (voice) => voiceSpeaks(lang, voice.lang);

/**
 * This device's voices for a language ("en", "nl"), the natural ones first: Premium and Enhanced, then the rest, with
 * the robotic ones last and the novelty voices left out. preferRegion ranks those regions first (["US", "GB"]).
 */
export function deviceVoices(lang, { preferRegion = [] } = {}) {
  if (!synth) return [];
  const code = lang.toLowerCase();
  const region = (voice) => voice.lang.replace("_", "-").split("-")[1]?.toUpperCase() ?? "";
  const rank = (voice) =>
    (/\b(premium)\b/i.test(voice.name) ? 0 : /\b(enhanced|neural|natural)\b/i.test(voice.name) ? 1 : 2) +
    (ELOQUENCE.has(baseName(voice)) ? 4 : 0) +
    (voice.localService ? 0 : 0.5) +
    (preferRegion.length && !preferRegion.includes(region(voice)) ? 0.25 : 0);
  return deviceVoiceList()
    .filter((voice) => voice?.lang && speaks(code)(voice) && !NOVELTY.has(baseName(voice)))
    .sort((a, b) => rank(a) - rank(b) || String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

/** This device's voices for a language ("nl") (the list fills in a moment after the page loads, and can change). */
export function voicesFor(code) {
  if (!synth) return [];
  return deviceVoiceList().filter((voice) => voice?.lang && speaks(code)(voice));
}

/** This device's voices for the language you're learning. */
export const targetVoices = () => voicesFor(learning());

/** This device's Dutch voices (the reader's woven Dutch). */
export const dutchVoices = () => voicesFor("nl");

if (synth) {
  // Nothing here may throw while the module loads: every page that can speak imports it, Study's session among them, and the app's
  // start with it.
  try {
    synth.addEventListener?.("voiceschanged", () => listeners.forEach((fn) => fn()));
  } catch {}
  // Some browsers never fire voiceschanged; look again a few times while the list is still empty.
  let tries = 0;
  const poll = () => {
    if (targetVoices().length || ++tries > 20) return listeners.forEach((fn) => fn());
    setTimeout(poll, 250);
  };
  poll();
}
loadAudio().then(() => listeners.forEach((fn) => fn()));
onStudySettingsChange(() => listeners.forEach((fn) => fn()));
onPacksChange(() => listeners.forEach((fn) => fn()));

/** Calls fn when the voices on offer change (device voices arrive, recordings load or arrive, the setting changes). */
export function onVoicesChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Where a voice is from, in a word or two: Flemish for Belgian Dutch (what it's called), else the country's name, else
// the language's.
const REGIONS = typeof Intl !== "undefined" && Intl.DisplayNames ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
function region(tag) {
  const [lang, country = ""] = tag.replace("_", "-").split("-");
  if (lang.toLowerCase() === "nl" && country.toUpperCase() === "BE") return "Flemish";
  if (!country) return languageName(lang.toLowerCase());
  try {
    return REGIONS?.of(country.toUpperCase()) ?? country;
  } catch {
    return country;
  }
}
// A language's main region (its locale: the Netherlands for Dutch), whose voices come first.
const inMainRegion = (lang) => {
  const main = (LANGUAGES[lang]?.locale ?? lang).toLowerCase().split("-")[1];
  return (voice) => speaks(lang)(voice) && tagOf(voice)[1] === main;
};

/**
 * This device's voices for the language you're learning, its main region's first: { id: "device:<voiceURI>", kind:
 * "device", name, about }.
 */
export function voiceChoices() {
  const main = inMainRegion(learning());
  return [...targetVoices()]
    .sort((a, b) => Number(main(b)) - Number(main(a)))
    .map((voice) => ({
      id: `device:${voice.voiceURI}`,
      kind: "device",
      // "Xander (Enhanced)" stays as it is; Chrome's "Google Nederlands" too.
      name: voice.name,
      about: `${region(voice.lang)}${voice.localService ? "" : " · needs a connection"}`,
    }));
}

/**
 * A pack's recorded voices (the starter's unless said), for its own page (where one can be pinned): [{ slug, name,
 * about, license?, credit? }] (a library pack's voices carry their license and credit, shown with them).
 */
export function packVoices(packId = PACK.id) {
  return Object.entries(audioOf(packId)?.voices ?? {}).map(([slug, voice]) => ({ slug, name: voice.name, about: voice.about, ...(voice.license ? { license: voice.license } : {}), ...(voice.credit ? { credit: voice.credit } : {}) }));
}

/** Whether anything here can speak at all (a recorded voice or a device voice). */
export const canSpeak = () => Boolean(synth) || recordedPacks(learning()).length > 0;

// This device's voice for a language (the one you're learning unless said): the chosen one if it's a voice for it,
// else one from its main region, else any for it.
function deviceVoice(uri = getStudySettings().listening.device, lang = learning()) {
  const devices = voicesFor(lang);
  return devices.find((v) => v.voiceURI === uri) ?? devices.find(inMainRegion(lang)) ?? devices[0] ?? null;
}

const hash = (text) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const today = () => Math.floor(Date.now() / 86400000);

/**
 * The recorded voice for a sentence or word (by its key) of a pack (the starter unless said), in a language (the one
 * you're learning unless said): the pack's pinned voice, else one of its voices in turn, picked by the key and the day,
 * so neighboring sentences differ and each one changes voice from day to day. Null when recordings are off, the pack
 * has none, or they're in another language.
 */
export function recordedVoiceFor(key, lang = learning(), packId = PACK.id) {
  return voicesInTurn(key, lang, packId)[0] ?? null;
}

// The recorded voices that may say something of a pack, in turn ([{ slug, voice }]): the pack's pinned voice alone; else the one whose turn
// it is (by the key and the day, recordedVoiceFor's), then the others in order. None when recordings are off, the pack has none, or they're
// in another language.
function voicesInTurn(key, lang, packId) {
  const listening = getStudySettings().listening;
  const audio = audioOf(packId);
  if (!listening.recorded || !audio || languageOf(packId) !== lang) return [];
  const slugs = Object.keys(audio.voices);
  if (!slugs.length) return [];
  const pinned = listening.pins?.[packId];
  if (slugs.includes(pinned)) return [{ slug: pinned, voice: audio.voices[pinned] }];
  const first = (hash(key) + today()) % slugs.length;
  return slugs.map((_, i) => slugs[(first + i) % slugs.length]).map((slug) => ({ slug, voice: audio.voices[slug] }));
}

/**
 * What says a word, or a word with its article, as a game shows it ("koffie", "de koffie", "Ja"), from the recordings of the language's
 * packs (the starter first): [{ url, word }], one clip, or two to play in turn; null when none can (this device's voice reads it then).
 * - its own clip: a pack's recording of exactly what's shown, as written, else in small letters (a sentence's first word, "Ja");
 * - else, for two words (a noun with its article: the games show nouns so), each word's own clip in one voice, the first then the second.
 * A pack records its words by their dictionary form, so a noun shown with its article found no clip and went to the device's voice; on an
 * iPhone with the silent switch on that voice is silent while a recording plays (8 Nov 2026: the picture game's nouns said nothing).
 */
export function wordRecording(text, lang = learning()) {
  const shown = String(text ?? "").trim();
  if (!shown) return null;
  const locale = LANGUAGES[lang]?.locale ?? lang;
  const packs = recordedPacks(lang);
  for (const form of new Set([shown, shown.toLocaleLowerCase(locale)])) {
    for (const packId of packs) {
      const clip = recordedVoiceFor(`w:${form}`, lang, packId)?.voice.words[form];
      if (clip) return [{ url: clip.url, word: shown }];
    }
  }
  const parts = shown.split(/\s+/);
  if (parts.length !== 2) return null;
  const own = (voice, part) => voice.words[part] ?? voice.words[part.toLocaleLowerCase(locale)];
  for (const packId of packs) {
    for (const { voice } of voicesInTurn(`w:${shown}`, lang, packId)) {
      const clips = parts.map((part) => own(voice, part));
      if (clips.every(Boolean)) return clips.map((clip, i) => ({ url: clip.url, word: parts[i] }));
    }
  }
  return null;
}

/** The id ("device:<voiceURI>") of the device voice that speaks here: the chosen one, or the one picked for you. */
export function currentDeviceVoiceId() {
  const voice = deviceVoice();
  return voice ? `device:${voice.voiceURI}` : null;
}

// The packs whose recordings may say an item, in turn: a copy's (copyOf, pack-format.js) source first, then the pack it came
// in; anything else, its own. And its id there, which is the same in both (the view calls it "<pack>/<item>", a copy by
// its source, for any pack but the starter).
const packsSaying = (item) => [...new Set([item.copyOf, typeof item.pack === "string" ? item.pack : PACK.id].filter((id) => typeof id === "string"))];
const ownIdOf = (item) => {
  const source = typeof item.copyOf === "string" ? item.copyOf : typeof item.pack === "string" ? item.pack : PACK.id;
  return item.id.startsWith(`${source}/`) ? item.id.slice(source.length + 1) : item.id;
};

/** Whether anything here can say this sentence: its recording, or this device's voice for its language. */
export function hearsItem(item, { lang } = {}) {
  const language = lang ?? learning();
  const own = ownIdOf(item);
  return packsSaying(item).some((packId) => Boolean(recordedVoiceFor(item.id, language, packId)?.voice.items[own])) || Boolean(deviceVoice(undefined, language));
}

/** Whether a sentence has a recording here (its pack's, or a copy's source's), not only this device's voice: what an iPhone's silent switch never silences. */
export function recordedItem(item, { lang } = {}) {
  const language = lang ?? learning();
  const own = ownIdOf(item);
  return packsSaying(item).some((packId) => Boolean(recordedVoiceFor(item.id, language, packId)?.voice.items[own]));
}

/** Whether anything here can say a word by itself, as it's shown (a Meet with no sentence, a game's word): its recording, or this device's voice. */
export function hearsWord(word, { lang } = {}) {
  const language = lang ?? learning();
  return Boolean(wordRecording(word, language)) || Boolean(deviceVoice(undefined, language));
}

/** Whether anything here can say anything in the language you're learning: a recording of some of it, or a voice. */
export const hearsAnything = () => recordedPacks(learning()).length > 0 || Boolean(deviceVoice());

/** What the Study menu's Voices row shows: "Recorded, then Xander" or the device voice alone. */
export function currentVoiceName() {
  const device = deviceVoice()?.name ?? null;
  const recorded = getStudySettings().listening.recorded && recordedPacks(learning()).length > 0;
  return recorded ? (device ? `Recorded, then ${device}` : "Recorded") : device;
}

// ---------- playing ----------

// One audio element plays every recorded clip. iPhone only lets a page play sound that a press started; once this
// element has played inside a press, it may play again later without one (a card's sentence playing by itself).
let element = null;
const audioElement = () => (element ??= Object.assign(new Audio(), { preload: "auto" }));
// A second element, for a noun said with its article (playJoined): the noun waits on it, loaded at its first sound, while the article plays on
// the first. It's unlocked in the same press as the first; until its silence has played, a pair plays on the first element in turn.
let second = null;
let secondReady = false;
const secondElement = () => (second ??= Object.assign(new Audio(), { preload: "auto" }));

let current = null;

/** Stops whatever is playing. */
export function stopSpeaking() {
  current?.stop();
}

/** Call inside a press: lets later sounds play without one on iPhone. The first click or key anywhere does it. */
export function unlockAudio() {
  const a = audioElement();
  if (!a.src) {
    a.src = SILENCE;
    a.play().catch(() => {});
  }
  const b = secondElement();
  if (!secondReady && !b.lxUnlocking) {
    b.lxUnlocking = true;
    b.src = SILENCE;
    b.play().then(
      () => (secondReady = true),
      () => (b.lxUnlocking = false),
    );
  }
  if (synth && !unlockAudio.spoke) {
    unlockAudio.spoke = true;
    try {
      synth.speak(new SpeechSynthesisUtterance(""));
    } catch {}
  }
}

const PRESSES = ["click", "touchend", "keydown"];
function unlockOnFirstPress() {
  unlockAudio();
  for (const type of PRESSES) removeEventListener(type, unlockOnFirstPress, true);
}
for (const type of PRESSES) addEventListener(type, unlockOnFirstPress, true);

// A controller for one sound: { stop(), done } where done resolves to "ended", "stopped" or "failed". onWord(i) is
// called with the index of the word being spoken, and -1 when none is. One that isn't the owner plays inside another
// sound (an offline clip, a recording before its fallback): its own finish, without taking over `current`.
function controller(start, { owner = true } = {}) {
  let resolve;
  let finished = false;
  let cleanup = () => {};
  const done = new Promise((r) => (resolve = r));
  const ctl = {
    done,
    stop: () => finish("stopped"),
  };
  function finish(how) {
    if (finished) return;
    finished = true;
    cleanup(how);
    if (current === ctl) current = null;
    resolve(how);
  }
  if (owner) {
    current?.stop();
    current = ctl;
  }
  cleanup = start(finish) ?? cleanup;
  return ctl;
}

// A library clip is named by its bytes, so it never changes: each one is kept (Cache Storage, CLIPS) once it has
// played, or before, in the background after the packs sync (packs.js keepRecordingsForOffline), and played from there
// when there's no connection. Online the address itself plays (an iPhone wants byte ranges).
const isLibraryClip = (src) => src.startsWith("/library/audio/");
function keepClip(src) {
  if (typeof caches === "undefined") return;
  caches
    .open(CLIPS)
    .then(async (cache) => {
      if (await cache.match(src)) return;
      const response = await fetch(src, { credentials: "same-origin" });
      if (response.ok && response.status === 200) await cache.put(src, response);
    })
    .catch(() => {});
}
// A kept clip's bytes, by the blob: address made for them: Tinta's mouth reads its loudness from them (the page may
// not fetch a blob: address; the CSP's connect-src is the app's own and its storage providers').
const keptBytes = new Map();
async function keptClip(src) {
  if (typeof caches === "undefined") return null;
  try {
    const hit = await (await caches.open(CLIPS)).match(src);
    if (!hit) return null;
    const blob = await hit.blob();
    const url = URL.createObjectURL(blob);
    keptBytes.set(url, blob);
    return url;
  } catch {
    return null;
  }
}

// A library clip, as one sound: online the address plays (and the clip is kept); offline, or when the network fails while
// it plays, the copy kept here plays instead. A clip of yours always plays from the copy kept here. Stopped at any point
// (another sound, or a press), nothing more starts.
function playClip(src, options) {
  if (!isLibraryClip(src) && !isYourClip(src)) return playFrom(src, options);
  return controller((finish) => {
    let inner = null;
    let url = null;
    let over = false;
    const fromKept = async () => {
      const kept = await keptClip(src);
      if (over) {
        if (kept) URL.revokeObjectURL(kept);
        return;
      }
      if (!kept) return finish("failed");
      url = kept;
      inner = playFrom(kept, { ...options, owner: false });
      inner.done.then((how) => finish(how));
    };
    // A clip of yours plays from this device's copy (the server holds it only in transit); a library clip offline too.
    if (isYourClip(src) || (typeof navigator !== "undefined" && navigator.onLine === false)) fromKept();
    else {
      keepClip(src);
      inner = playFrom(src, { ...options, owner: false });
      inner.done.then((how) => (how === "failed" && !over ? fromKept() : finish(how)));
    }
    return () => {
      over = true;
      inner?.stop();
      if (url) {
        URL.revokeObjectURL(url);
        keptBytes.delete(url);
      }
    };
  }, { owner: options.owner ?? true });
}

// A recording, and when it can't play (offline with no copy kept, a file that won't load), this device's voice reading
// the same words: one sound either way (one stop(), one done), so nothing goes silent.
function playClipOr(src, options, fallback) {
  if (!fallback) return playClip(src, options);
  return controller((finish) => {
    let over = false;
    let spoken = null;
    const clip = playClip(src, { ...options, owner: false });
    clip.done.then((how) => {
      if (over) return;
      if (how !== "failed") return finish(how);
      spoken = deviceSpeech(finish, { ...fallback, rate: options.rate, onWord: options.onWord });
    });
    return (how) => {
      over = true;
      clip.stop();
      spoken?.(how);
    };
  });
}

// A word's recordings (wordRecording: one clip, or a noun's article and the noun) as one sound: one stop(), one done. Two are joined as said
// together (playJoined); where they can't be, they play in turn (playInTurn).
function playWordClips(clips, options, fallback) {
  if (clips.length === 1) return playClipOr(clips[0].url, { ...options, said: [clips[0].word] }, fallback);
  return playJoined(clips, options, fallback);
}

// Where a clip speaks: [first sound, last sound] in seconds, read once from its decoded samples (5 ms windows over 1% of its loudest, -40 dB);
// null when its bytes can't be had or decoded. A word's clip carries about a quarter second of quiet after it and a little before: played
// whole and in turn, "de" and "koffie" were two words with a third of a second between them. A clip never changes, so each is read once.
const soundOf = new Map();
const SOUND_FLOOR = 0.01;
function soundSpan(src) {
  if (!soundOf.has(src)) soundOf.set(src, readSoundSpan(src).catch(() => null));
  return soundOf.get(src);
}
async function readSoundSpan(src) {
  const Offline = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
  if (!Offline) return null;
  let response = typeof caches === "undefined" ? null : await (await caches.open(CLIPS)).match(src).catch(() => null);
  if (!response && !isYourClip(src)) response = await fetch(src, { credentials: "same-origin" });
  if (!response?.ok) return null;
  const buffer = await new Offline(1, 1, 44100).decodeAudioData(await response.arrayBuffer());
  const samples = buffer.getChannelData(0);
  const step = Math.max(1, Math.round(buffer.sampleRate * 0.005));
  const loud = [];
  for (let i = 0; i + step <= samples.length; i += step) {
    let sum = 0;
    for (let k = i; k < i + step; k++) sum += samples[k] * samples[k];
    loud.push(Math.sqrt(sum / step));
  }
  const peak = Math.max(0, ...loud);
  const first = loud.findIndex((level) => level > peak * SOUND_FLOOR);
  if (!peak || first < 0) return null;
  const last = loud.length - 1 - [...loud].reverse().findIndex((level) => level > peak * SOUND_FLOOR);
  return [(first * step) / buffer.sampleRate, ((last + 1) * step) / buffer.sampleRate];
}

// How early the second clip is started, in seconds before the first one's last sound: what its element takes to begin (play() on a loaded
// element, measured on an iOS 26.4 Simulator: 50–80 ms late started at the end, 6–18 ms started 30 ms early). Each join measures its own
// gap and moves it a half step toward a join 5 ms apart, between 0 and 80 ms, so each device learns its own.
let joinLead = 0.03;
const JOIN_GAP = 0.005;
const LOAD_WAIT = 4000; // ms a clip may take to load before the join is given up
/** The last join's gap in ms (the second clip's first sound after the first's last), and the lead now: for checks. */
export const joinState = { gap: null, lead: joinLead };

// The article and the noun as one word: the article from its first sound on the first element; the noun on the second, loaded and set at its
// first sound, started joinLead before the article's last sound, the article stopped there. Online the addresses play (a library clip kept
// for offline as it plays); offline, or a clip of yours, the copies kept here. If the second element isn't unlocked yet or a clip's sound
// can't be read, the clips play in turn instead; if a clip won't play, this device's voice says what's left.
function playJoined(clips, options, fallback) {
  return controller((finish) => {
    const a = audioElement();
    const b = secondElement();
    const rate = options.rate ?? 1;
    let over = false;
    let inner = null;
    let spoken = null;
    let frame = 0;
    const blobs = [];
    const ends = [];
    let started = false;
    let handedOver = false;
    let firstDone = 0;
    const listen = (el, type, fn) => {
      el.addEventListener(type, fn);
      ends.push(() => el.removeEventListener(type, fn));
    };
    const failRest = (from) => {
      if (over) return;
      cancelAnimationFrame(frame);
      for (const el of [a, b]) el.pause();
      if (!fallback) return finish("failed");
      const rest = clips.slice(from).map((clip) => clip.word);
      spoken = deviceSpeech(finish, { ...fallback, text: rest.join(" "), said: rest, rate, onWord: options.onWord });
    };
    const inTurn = () => {
      if (over) return;
      inner = playInTurn(clips, { ...options, owner: false }, fallback);
      inner.done.then((how) => !over && finish(how));
    };
    const sourceOf = async (src) => {
      if (isYourClip(src) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
        const kept = await keptClip(src);
        if (kept) blobs.push(kept);
        return kept;
      }
      if (isLibraryClip(src)) keepClip(src);
      return src;
    };
    // An element loaded with a source and set at a time: resolves once it's there (seeked), false if it fails to load.
    const ready = (el, src, at) =>
      new Promise((done) => {
        const url = new URL(src, location.origin).href;
        const seek = () => {
          if (Math.abs(el.currentTime - at) < 0.002) return done(true);
          listen(el, "seeked", () => done(true));
          el.currentTime = at;
        };
        listen(el, "error", () => done(false));
        const wait = setTimeout(() => done(false), LOAD_WAIT);
        ends.push(() => clearTimeout(wait));
        el.defaultPlaybackRate = rate;
        el.playbackRate = rate;
        el.preservesPitch = true;
        if (el.src === url && el.readyState >= 1) return seek();
        listen(el, "loadedmetadata", seek);
        el.src = url;
        el.load?.();
      });
    (async () => {
      const spans = secondReady ? await Promise.all(clips.map((clip) => soundSpan(clip.url))) : [];
      if (over) return;
      if (!secondReady || spans.length !== 2 || !spans.every(Boolean)) return inTurn();
      const [[firstFrom, firstEnd], [secondFrom]] = spans;
      const sources = await Promise.all(clips.map((clip) => sourceOf(clip.url)));
      if (over) return;
      if (!sources.every(Boolean)) return failRest(0);
      const loaded = await Promise.all([ready(a, sources[0], Math.max(0, firstFrom - 0.01)), ready(b, sources[1], Math.max(0, secondFrom - 0.01))]);
      if (over) return;
      if (!loaded[0]) return failRest(0);
      if (!loaded[1]) return inTurn();
      // Tinta's mouth, each word on its element's clock.
      const say = (el, src, word, from, to) => {
        const blob = src.startsWith("blob:");
        const end = startSpeech({ kind: "recording", lang: options.lang ?? null, words: [{ text: word, start: from, end: to }], clock: () => el.currentTime, src: blob ? null : el.currentSrc || el.src, bytes: blob ? keptBytes.get(src) ?? null : null });
        ends.push(end);
      };
      listen(b, "ended", () => finish("ended"));
      // A file that fails while it plays: the device's voice says what's left (the noun alone once the article has been said).
      listen(a, "error", () => !started && failRest(0));
      listen(b, "error", () => failRest(1));
      try {
        await a.play();
      } catch {
        return failRest(0);
      }
      if (over) return;
      say(a, sources[0], clips[0].word, firstFrom, firstEnd);
      const tick = () => {
        if (over || handedOver) return;
        if (!started && a.currentTime >= firstEnd - joinLead * rate) {
          started = true;
          b.play().then(
            () => !over && say(b, sources[1], clips[1].word, secondFrom, b.duration || secondFrom + 1),
            () => {
              if (over) return;
              // Not allowed after all (never unlocked as thought): the noun on the first element, as in turn, its clock no longer watched.
              secondReady = false;
              handedOver = true;
              cancelAnimationFrame(frame);
              a.pause();
              inner = playClipOr(clips[1].url, { ...options, from: Math.max(0, secondFrom - 0.01), said: [clips[1].word], owner: false }, fallback && { ...fallback, text: clips[1].word, said: [clips[1].word] });
              inner.done.then((how) => !over && finish(how));
            },
          );
        }
        if (started && !firstDone && a.currentTime >= firstEnd) {
          firstDone = performance.now() - ((a.currentTime - firstEnd) / rate) * 1000;
          a.pause();
        }
        // The join's gap: from the first clip's last sound to the second's first, as the elements' clocks show it.
        if (firstDone && b.currentTime > secondFrom) {
          const gap = (performance.now() - ((b.currentTime - secondFrom) / rate) * 1000 - firstDone) / 1000;
          joinState.gap = Math.round(gap * 1000);
          joinLead = Math.min(0.08, Math.max(0, joinLead + (gap - JOIN_GAP) / 2));
          joinState.lead = joinLead;
          return;
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    })().catch(() => failRest(0));
    return (how) => {
      over = true;
      cancelAnimationFrame(frame);
      inner?.stop();
      spoken?.(how);
      a.pause();
      b.pause();
      for (const end of ends.splice(0)) end?.();
      for (const url of blobs) {
        URL.revokeObjectURL(url);
        keptBytes.delete(url);
      }
    };
  });
}

// Clips one after another as one sound. If one can't play (offline with no copy kept, a file that won't load), this device's voice reads
// what's left from there, so nothing goes silent and nothing is said twice.
function playInTurn(clips, options, fallback) {
  return controller((finish) => {
    let over = false;
    let inner = null;
    let spoken = null;
    const play = (i) => {
      if (i === clips.length) return finish("ended");
      inner = playClip(clips[i].url, { ...options, said: [clips[i].word], owner: false });
      inner.done.then((how) => {
        if (over) return;
        if (how === "ended") return play(i + 1);
        if (how !== "failed" || !fallback) return finish(how);
        const rest = clips.slice(i).map((clip) => clip.word);
        spoken = deviceSpeech(finish, { ...fallback, text: rest.join(" "), said: rest, rate: options.rate, onWord: options.onWord });
      });
    };
    play(0);
    return (how) => {
      over = true;
      inner?.stop();
      spoken?.(how);
    };
  }, { owner: options.owner ?? true });
}

function playFrom(src, { from = 0, to = null, spans = null, rate = 1, onWord, owner = true, said = null, lang = null }) {
  return controller((finish) => {
    const a = audioElement();
    let frame = 0;
    let word = -1;
    let endSpeech = null;
    // What it says, for Tinta's mouth: each word at its time in the manifest; a word or a sentence without them spread
    // over the clip (its loudness, read from the file, still opens and closes the mouth with the real rhythm).
    const announce = () => {
      if (!said?.length) return;
      const end = to ?? (Number.isFinite(a.duration) ? a.duration : from + estimateWords(said).at(-1).end);
      const words = spans?.length === said.length ? said.map((text, i) => ({ text, start: spans[i][0], end: spans[i][1] })) : [{ text: said.join(" "), start: from, end }];
      // Its loudness comes from the file: by its address, or a kept clip's from its bytes (a blob: address is never fetched).
      const played = a.currentSrc || a.src;
      const blob = played.startsWith("blob:");
      endSpeech = startSpeech({ kind: "recording", lang, words, clock: () => a.currentTime, src: blob ? null : played, bytes: blob ? keptBytes.get(played) ?? null : null });
    };
    const setWord = (i) => {
      if (i === word) return;
      word = i;
      onWord?.(i);
    };
    const tick = () => {
      const t = a.currentTime;
      if (to !== null && t >= to) return finish("ended");
      if (spans) {
        let i = -1;
        for (let k = 0; k < spans.length; k++) if (t >= spans[k][0] - 0.02) i = k;
        setWord(i);
      }
      frame = requestAnimationFrame(tick);
    };
    const ended = () => finish("ended");
    const failed = () => finish("failed");
    const url = new URL(src, location.origin).href;
    if (a.src !== url) a.src = url;
    a.defaultPlaybackRate = rate;
    a.playbackRate = rate;
    a.preservesPitch = true;
    try {
      a.currentTime = from;
    } catch {}
    a.addEventListener("ended", ended);
    a.addEventListener("error", failed);
    a.play()
      .then(() => {
        announce();
        frame = requestAnimationFrame(tick);
      })
      .catch(failed);
    return (how) => {
      cancelAnimationFrame(frame);
      a.removeEventListener("ended", ended);
      a.removeEventListener("error", failed);
      if (how !== "ended" || to !== null) a.pause();
      setWord(-1);
      endSpeech?.();
    };
  }, { owner });
}

function playDevice(text, { voice, rate = 1, words = null, onWord, said = null, lang = null }) {
  return controller((finish) => deviceSpeech(finish, { text, voice, rate, words, onWord, said, lang }));
}

// A word shown with both its forms (obrigado / obrigada, mooi/mooie) is said as the two with a pause between, not with the slash a
// voice would read out; a slash between digits (24/7) stays.
const BOTH_FORMS = /(\p{L}\p{M}*)\s*\/\s*(?=\p{L})/gu;
const spokenText = (text) => String(text).replace(BOTH_FORMS, "$1, ");

// This device's voice reading text, inside a sound's start: returns its cleanup.
function deviceSpeech(finish, { text, voice, rate = 1, words = null, onWord, said = null, lang = null }) {
  synth.cancel();
  // What it says, for Tinta's mouth: each word's time estimated from its length, put right at each word boundary.
  const sayWords = said?.length ? estimateWords(said.map(spokenText), { rate }) : null;
  const now = () => performance.now() / 1000;
  const clock = sayWords && boundaryClock(sayWords, now());
  const endSpeech = sayWords ? startSpeech({ kind: "device", lang, words: sayWords, clock: () => clock.at(now()), src: null }) : null;
  const spoken = spokenText(text);
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = rate;
  // Where each word starts in the text, to light it up when the voice reaches it (where the browser says so).
  const starts = [];
  if (words) {
    let at = 0;
    for (const w of words.map(spokenText)) {
      const i = spoken.indexOf(w, at);
      starts.push(i);
      at = i + w.length;
    }
  }
  utterance.onboundary = (event) => {
    if (!starts.length || (event.name && event.name !== "word")) return;
    let i = -1;
    for (let k = 0; k < starts.length; k++) if (starts[k] <= event.charIndex) i = k;
    if (i >= 0) clock?.reach(i, now());
    onWord?.(i);
  };
  // The voice starts when it starts (a voice may take a moment to load): the estimate runs from there.
  utterance.onstart = () => clock?.start(now());
  utterance.onend = () => finish("ended");
  utterance.onerror = (event) => finish(event.error === "interrupted" || event.error === "canceled" ? "stopped" : "failed");
  // Some voices never report the end; give up well after it should have finished.
  const watchdog = setTimeout(() => finish("ended"), (text.length * 0.12) / rate * 1000 + 4000);
  synth.speak(utterance);
  return (how) => {
    clearTimeout(watchdog);
    if (how !== "ended") synth.cancel();
    onWord?.(-1);
    endSpeech?.();
  };
}

const rate = () => RATE[getStudySettings().listening.speed] ?? 1;

/** What's playing, for automated checks: the recorded clip's address, speed, position, and whether a device voice speaks. */
export const playbackState = () => ({
  src: element?.src ?? "",
  rate: element?.playbackRate ?? 1,
  time: element?.currentTime ?? 0,
  paused: element?.paused ?? true,
  device: Boolean(synth?.speaking),
});

/**
 * Speaks an item's sentence: its recording (a pack voice, in turn) when there is one and recordings are on, else this
 * device's voice. onWord(i) as each word is reached (recordings always; device voices where the browser reports it).
 * choice: "device:<voiceURI>" to use that device voice, or "rec:<slug>" for that recorded voice. rate: a speed for
 * this one play (Listening's Slower), instead of the setting. lang: the language it's in when that isn't the one you're
 * learning (a past practice in another): a device voice for it. Returns { stop(), done }, or null when nothing here
 * can speak.
 */
export function speakItem(item, { onWord, choice, rate: speed, lang } = {}) {
  const words = item.words.map(([text]) => text);
  // What's said, for Tinta's mouth: a word's reading where the language shows one (Japanese kana), else the word.
  const said = item.words.map(([text, , reading]) => reading ?? text);
  const language = lang ?? learning();
  // Joined as the language joins them: a space makes a Japanese or Chinese voice pause.
  const text = words.join(separatorOf(lang ?? learning())) + item.punct;
  // Its own pack's recordings, under its id there; a copy's, its source's where that one has a clip for it (packsSaying).
  const own = ownIdOf(item);
  const saying = packsSaying(item);
  const packId = saying.find((id) => (choice?.startsWith("rec:") ? audioOf(id)?.voices?.[choice.slice(4)]?.items?.[own] : recordedVoiceFor(item.id, lang ?? learning(), id)?.voice.items[own])) ?? saying.at(-1);
  const forced = choice?.startsWith("rec:") ? audioOf(packId)?.voices?.[choice.slice(4)] : null;
  const recorded = choice?.startsWith("device:") ? null : forced ? { voice: forced } : recordedVoiceFor(item.id, lang ?? learning(), packId);
  const clip = recorded?.voice.items[own];
  if (clip) {
    // If the recording can't play, this device's voice reads the sentence instead.
    const fallback = deviceVoice(undefined, lang);
    return asSentence(playClipOr(clip.url, { spans: clip.words, rate: speed ?? rate(), onWord, said, lang: language }, fallback && { voice: fallback, text, words, said, lang: language }));
  }
  const device = deviceVoice(choice?.startsWith("device:") ? choice.slice(7) : undefined, lang);
  return asSentence(device ? playDevice(text, { voice: device, rate: speed ?? rate(), words, onWord, said, lang: language }) : null);
}

// A sentence (or a card) being listened to: a word you tap never cuts it off (speakTapped).
const asSentence = (sound) => {
  if (sound) sound.sentence = true;
  return sound;
};
/** Whether a sentence or a card is playing now (not a word by itself). */
export const sentencePlaying = () => Boolean(current?.sentence);

/** Plays a plain card: its own sound on this device, else the device's voice reading its text. Returns { stop(), done } or null. */
export function speakCard({ text, clip, lang }, { rate: speed, onWord } = {}) {
  const language = lang ?? learning();
  const device = deviceVoice(undefined, language);
  if (clip) return asSentence(playClipOr(yourClipUrl(clip), { rate: speed ?? rate(), said: [text], onWord, lang: language }, device && { voice: device, text, said: [text], lang: language }));
  return asSentence(device ? playDevice(text, { voice: device, rate: speed ?? rate(), said: [text], onWord, lang: language }) : null);
}

/**
 * Says a word you tapped in a game (a tile, a choice), as it's written there: a pack's recording of that word where one has it (as
 * written, else in small letters: a sentence's first word), else this device's voice reading it. It stops a word that was playing, so a
 * second tap cuts the first off, and nothing queues. While a sentence or a card is playing it says nothing at all: the sentence is
 * what you're listening to, and a word said after it no longer belongs to the tap. Returns { stop(), done } or null.
 */
export function speakTapped(text, { lang } = {}) {
  const said = String(text ?? "").trim();
  if (!said || sentencePlaying()) return null;
  return sayWord(said, lang);
}

/**
 * Speaks a word, or a word with its article, as it's shown ("lezen", "de koffie", lang as speakItem's): its recordings (wordRecording), else
 * this device's voice. Every game about one word says it so (Tap the picture, Pick the word, Type the word, Say and Repeat the word), Match,
 * Translate. Returns { stop(), done } or null.
 */
export function speakWord(word, { lang } = {}) {
  const said = String(word ?? "").trim();
  return said ? sayWord(said, lang) : null;
}

function sayWord(said, lang) {
  const language = lang ?? learning();
  const device = deviceVoice(undefined, lang);
  const clips = wordRecording(said, language);
  if (clips) return playWordClips(clips, { rate: rate(), lang: language }, device && { voice: device, text: said, said: [said], lang: language });
  return device ? playDevice(said, { voice: device, rate: rate(), said: [said], lang: language }) : null;
}
