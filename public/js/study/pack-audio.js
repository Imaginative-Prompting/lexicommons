// Recorded audio for a pack: which voices read it, and for each, a clip per sentence (with every word's timing, so the
// words light up as they're spoken) and per word worth learning. Pure, like pack-format.js: the Worker checks a
// manifest before the library publishes it or the relay passes it on, and the device checks it again when it arrives.
// Clips are named by their content and pooled: the library keeps them at audio/<clip>, shared by every pack.
//
// A manifest (format lexicommons-audio, version 2):
//   pack       the pack's id; language: its language
//   voices     { slug: voice }, 1 to 8, each:
//     name       what it's called ("Emma"); about: a line on how it sounds (optional)
//     locale     the voice's BCP 47 tag (nl-NL), in the pack's language
//     provider, voiceId, model, made (optional): where it came from (elevenlabs, eleven_v4, 2026-10-26)
//     license    the terms the recordings are under; credit: whose voice it is, as shown with the pack. Both are
//                required for the open library (checkAudio's { forLibrary }): recordings are not the pack's text, and
//                their rights are their own
//     items      { item id: { clip, seconds, words: [[start, end], …] } }: a sentence of the pack, read; one timing per
//                word of its sentence, in seconds from the clip's start, in order
//     words      { lemma: { clip, seconds } }: a word the pack teaches, said on its own
//   clip       "<the first 16 hex of the clip's sha256>.<mp3|m4a>"
// A voice needn't read every sentence (the device's own voice reads the rest); a warning says how many it leaves out.
// Version 1 (the starter's recordings inside the app) names each clip by its path in the pack's folder instead;
// readAudio() plays both.

import { sentencesOf } from "./pack-items.js";
import { cleanText } from "./pack-format.js";
import { LANGUAGES, voiceSpeaks } from "../lang/index.js";

export const AUDIO_FORMAT = "lexicommons-audio";
export const AUDIO_VERSION = 2;

export const AUDIO_LIMITS = {
  voices: 8,
  sentenceSeconds: 30,
  wordSeconds: 10,
  name: 60,
  about: 200,
  license: 120,
  credit: 200,
  meta: 80, // provider, voiceId, model
  bytes: 4_000_000, // the manifest as JSON
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const CLIP = /^[0-9a-f]{16}\.(mp3|m4a)$/;
const LOCALE = /^([a-z]{2,3})(-[A-Z]{2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const VOICE_FIELDS = new Set(["name", "about", "locale", "provider", "voiceId", "model", "made", "license", "credit", "items", "words"]);

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isTime = (value, max) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;

/** A clip's name from its bytes' sha256 (hex) and its type. */
export const clipName = (sha256, type) => `${sha256.slice(0, 16)}.${type === "audio/mp4" || type === "m4a" ? "m4a" : "mp3"}`;
/** Where the library keeps a clip, and its URL. */
export const clipKey = (clip) => `audio/${clip}`;
export const clipUrl = (clip) => `/library/${clipKey(clip)}`;
/** Where the library keeps a pack version's audio (audioVersion: its manifest's version), and its URL. */
export const audioKey = (packId, packVersion, audioVersion) => `packs/${packId}/${packVersion}/audio.${audioVersion}.json`;
export const audioUrl = (packId, packVersion, audioVersion) => `/library/${audioKey(packId, packVersion, audioVersion)}`;

/** The text a manifest is stored as, and versioned by: the checked manifest's JSON. */
export const audioText = (audio) => JSON.stringify(audio);

/** A checked manifest's version: the first 12 hex of its JSON's sha256. */
export async function audioVersion(audio) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(audioText(audio)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

/** Every clip a manifest uses, once each. */
export function clipsOf(audio) {
  const clips = new Set();
  for (const voice of Object.values(audio?.voices ?? {})) {
    for (const entry of [...Object.values(voice.items ?? {}), ...Object.values(voice.words ?? {})]) if (entry?.clip) clips.add(entry.clip);
  }
  return [...clips];
}

/**
 * Checks a pack's audio against the pack (the checked pack it reads). Returns { audio, errors, warnings } like
 * checkPack: the manifest as it would be kept (null when there are errors), and every problem at once, each
 * { at, message }. forLibrary: the open library's rules too (every voice's license and credit).
 */
export function checkAudio(value, pack, { forLibrary = false } = {}) {
  const errors = [];
  const warnings = [];
  const error = (at, message) => void errors.push({ at, message });
  const warn = (at, message) => void warnings.push({ at, message });
  const done = (audio) => ({ audio: errors.length ? null : audio, errors, warnings });
  if (!isObject(value)) return error("audio", "The audio must be an object."), done(null);
  if (value.format !== AUDIO_FORMAT) error("format", `format must be "${AUDIO_FORMAT}".`);
  if (value.version !== AUDIO_VERSION) error("version", `version must be ${AUDIO_VERSION}.`);
  let size = 0;
  try {
    size = JSON.stringify(value).length;
  } catch {
    return error("audio", "The audio can't be written as JSON."), done(null);
  }
  if (size > AUDIO_LIMITS.bytes) return error("audio", `The manifest is ${size} bytes; keep it under ${AUDIO_LIMITS.bytes}.`), done(null);
  if (!pack) return error("pack", "There's no pack to check the audio against."), done(null);
  if (value.pack !== pack.id) error("pack", `pack must be "${pack.id}", the pack it reads.`);
  if (value.language !== pack.language) error("language", `language must be "${pack.language}", the pack's.`);

  const text = (raw, at, max, required) => {
    if (raw === undefined || raw === null || raw === "") return required ? void error(at, `${at} is missing.`) : undefined;
    if (typeof raw !== "string") return void error(at, `${at} must be text.`);
    const out = cleanText(raw);
    if (!out) return required ? void error(at, `${at} is empty.`) : undefined;
    if (out.length > max) return void error(at, `${at} is ${out.length} characters; keep it to ${max}.`);
    return out;
  };
  const words = new Map(pack.items.map((item) => [item.id, item.words?.length ?? 0]));
  const lemmas = new Set([...Object.keys(pack.words ?? {}), ...pack.items.flatMap((item) => (item.words ?? []).map(([, lemma]) => lemma).filter(Boolean))]);

  const voices = {};
  const entries = isObject(value.voices) ? Object.entries(value.voices) : [];
  if (!isObject(value.voices) || !entries.length) error("voices", "voices must name at least one voice: { slug: { name, locale, items, words } }.");
  if (entries.length > AUDIO_LIMITS.voices) error("voices", `voices has ${entries.length}; keep it to ${AUDIO_LIMITS.voices}.`);
  for (const [slug, raw] of entries.slice(0, AUDIO_LIMITS.voices)) {
    const at = `voices.${slug.slice(0, 40)}`;
    if (!SLUG.test(slug)) {
      error(at, `${at}: a voice's slug is lowercase letters, digits and dashes (emma).`);
      continue;
    }
    if (!isObject(raw)) {
      error(at, `${at} must be { name, locale, items, words }.`);
      continue;
    }
    for (const key of Object.keys(raw)) if (!VOICE_FIELDS.has(key)) warn(`${at}.${key}`, `${at}.${key} isn't part of a voice; it was left out.`);
    const voice = { name: text(raw.name, `${at}.name`, AUDIO_LIMITS.name, true) };
    const about = text(raw.about, `${at}.about`, AUDIO_LIMITS.about, false);
    if (about) voice.about = about;
    // Never coerced: JSON can carry an object whose toString is null, which String() throws on.
    const locale = typeof raw.locale === "string" ? raw.locale : "";
    const match = locale.match(LOCALE);
    if (!match) error(`${at}.locale`, `${at}.locale must be a language tag like nl-NL.`);
    // The same rule as a device's voices (lang/index.js voiceSpeaks): the pack's language (a Tagalog pack takes fil-PH),
    // and never a Chinese voice from Hong Kong or Macau for Mandarin, since it speaks Cantonese.
    else if (!Object.hasOwn(LANGUAGES, pack.language) || !voiceSpeaks(pack.language, locale)) {
      const cantonese = Object.hasOwn(LANGUAGES, pack.language) && match[1] === String(pack.language).split("-")[0];
      error(`${at}.locale`, cantonese ? `${at}.locale "${locale}" is a voice that speaks Cantonese, not the pack's ${LANGUAGES[pack.language].name} (${pack.language}).` : `${at}.locale "${locale}" isn't in the pack's language (${pack.language}).`);
    } else voice.locale = locale;
    for (const key of ["provider", "voiceId", "model"]) {
      const out = text(raw[key], `${at}.${key}`, AUDIO_LIMITS.meta, false);
      if (out) voice[key] = out;
    }
    if (raw.made !== undefined) {
      if (typeof raw.made === "string" && DAY.test(raw.made)) voice.made = raw.made;
      else error(`${at}.made`, `${at}.made must be a day, as 2026-10-27.`);
    }
    const license = text(raw.license, `${at}.license`, AUDIO_LIMITS.license, forLibrary);
    const credit = text(raw.credit, `${at}.credit`, AUDIO_LIMITS.credit, forLibrary);
    if (license) voice.license = license;
    if (credit) voice.credit = credit;

    voice.items = {};
    for (const [id, clip] of isObject(raw.items) ? Object.entries(raw.items) : []) {
      const cat = `${at}.items.${id.slice(0, 50)}`;
      if (!words.has(id)) {
        error(cat, `${cat}: the pack has no sentence "${id.slice(0, 50)}".`);
        continue;
      }
      if (!isObject(clip) || typeof clip.clip !== "string" || !CLIP.test(clip.clip)) {
        error(cat, `${cat}.clip must be "<16 hex of its sha256>.mp3" (or .m4a).`);
        continue;
      }
      if (!isTime(clip.seconds, AUDIO_LIMITS.sentenceSeconds) || clip.seconds === 0) {
        error(`${cat}.seconds`, `${cat}.seconds must be the clip's length, more than 0 and up to ${AUDIO_LIMITS.sentenceSeconds}.`);
        continue;
      }
      const timings = Array.isArray(clip.words) ? clip.words : null;
      if (!timings || timings.length !== words.get(id)) {
        error(`${cat}.words`, `${cat}.words must give each of the sentence's ${words.get(id)} words its [start, end].`);
        continue;
      }
      let last = 0;
      const ok = timings.every((pair) => {
        const good = Array.isArray(pair) && pair.length === 2 && isTime(pair[0], clip.seconds + 0.5) && isTime(pair[1], clip.seconds + 0.5) && pair[0] <= pair[1] && pair[0] >= last;
        if (good) last = pair[0];
        return good;
      });
      if (!ok) {
        error(`${cat}.words`, `${cat}.words: each word's [start, end] is within the clip, start ≤ end, and in order.`);
        continue;
      }
      voice.items[id] = { clip: clip.clip, seconds: clip.seconds, words: timings.map(([start, end]) => [start, end]) };
    }
    voice.words = {};
    for (const [lemma, clip] of isObject(raw.words) ? Object.entries(raw.words) : []) {
      const cat = `${at}.words.${lemma.slice(0, 50)}`;
      if (!lemmas.has(lemma)) {
        error(cat, `${cat}: the pack doesn't teach "${lemma.slice(0, 50)}".`);
        continue;
      }
      if (!isObject(clip) || typeof clip.clip !== "string" || !CLIP.test(clip.clip)) {
        error(cat, `${cat}.clip must be "<16 hex of its sha256>.mp3" (or .m4a).`);
        continue;
      }
      if (!isTime(clip.seconds, AUDIO_LIMITS.wordSeconds) || clip.seconds === 0) {
        error(`${cat}.seconds`, `${cat}.seconds must be the clip's length, more than 0 and up to ${AUDIO_LIMITS.wordSeconds}.`);
        continue;
      }
      voice.words[lemma] = { clip: clip.clip, seconds: clip.seconds };
    }
    const read = Object.keys(voice.items).length;
    if (!read && !Object.keys(voice.words).length) error(at, `${at} reads nothing: give it items or words.`);
    else if (read < sentencesOf(pack).length) warn(`${at}.items`, `${at} reads ${read} of the pack's ${sentencesOf(pack).length} sentences; the device's own voice reads the rest.`);
    voices[slug] = voice;
  }

  return done({ format: AUDIO_FORMAT, version: AUDIO_VERSION, pack: pack.id, language: pack.language, voices });
}

/**
 * The ids of the sentences two versions of a pack both have, word for word: a recording reads its sentence's words, so
 * these are the ones whose recordings still fit the later version (fitAudio's `still`). Pure: the device and the
 * library's publish both use it.
 */
export function unchangedItems(before, after) {
  const was = new Map((before?.items ?? []).map((item) => [item.id, JSON.stringify(item.words)]));
  return new Set((after?.items ?? []).filter((item) => was.get(item.id) === JSON.stringify(item.words)).map((item) => item.id));
}

/**
 * A manifest kept to what a pack has now (a pack of yours changes, and its recordings stay where they still fit): each
 * voice keeps the sentences the pack still has, with as many words, and (with `still`, a Set of item ids) only those
 * whose words haven't changed; and the words the pack still teaches. A voice left reading nothing goes. Returns the
 * manifest checked against the pack (checkAudio), or null when nothing is left or it doesn't pass.
 */
export function fitAudio(value, pack, { still = null, forLibrary = false } = {}) {
  if (!isObject(value) || !isObject(value.voices) || !pack) return null;
  const words = new Map(pack.items.map((item) => [item.id, item.words?.length ?? 0]));
  const lemmas = new Set([...Object.keys(pack.words ?? {}), ...pack.items.flatMap((item) => (item.words ?? []).map(([, lemma]) => lemma).filter(Boolean))]);
  const voices = {};
  for (const [slug, voice] of Object.entries(value.voices)) {
    if (!isObject(voice)) continue;
    const items = Object.fromEntries(
      Object.entries(isObject(voice.items) ? voice.items : {}).filter(([id, clip]) => words.has(id) && (!still || still.has(id)) && Array.isArray(clip?.words) && clip.words.length === words.get(id)),
    );
    const said = Object.fromEntries(Object.entries(isObject(voice.words) ? voice.words : {}).filter(([lemma]) => lemmas.has(lemma)));
    if (Object.keys(items).length || Object.keys(said).length) voices[slug] = { ...voice, items, words: said };
  }
  if (!Object.keys(voices).length) return null;
  return checkAudio({ ...value, voices }, pack, { forLibrary }).audio;
}

/**
 * A change to a pack of yours's recordings (your AI's, through the relay: { voices: { slug: voice | null } | null })
 * applied to the recordings it has (a manifest, or null): null for voices takes them all away; a voice set to null goes;
 * otherwise a voice's details are set as given (null takes one out) and its items and words merged by id (an entry set
 * to null goes). A voice left reading nothing goes. Returns the manifest for the pack, not yet checked (checkAudio, or
 * fitAudio where what no longer fits should just be left out), or null for none. Nothing in it runs: the keys are read
 * into Maps, so an arriving "__proto__" is only a key.
 */
export function mergeAudio(base, change, pack) {
  if (!isObject(change) || change.voices === null || !pack) return null;
  const voices = new Map();
  for (const [slug, voice] of Object.entries(isObject(base?.voices) ? base.voices : {})) {
    if (isObject(voice)) voices.set(slug, { ...voice, items: new Map(Object.entries(isObject(voice.items) ? voice.items : {})), words: new Map(Object.entries(isObject(voice.words) ? voice.words : {})) });
  }
  for (const [slug, raw] of Object.entries(isObject(change.voices) ? change.voices : {})) {
    if (raw === null || !isObject(raw)) {
      voices.delete(slug);
      continue;
    }
    const voice = voices.get(slug) ?? { items: new Map(), words: new Map() };
    for (const key of VOICE_FIELDS) {
      if (key === "items" || key === "words" || !Object.hasOwn(raw, key)) continue;
      if (raw[key] === null) delete voice[key];
      else voice[key] = raw[key];
    }
    for (const part of ["items", "words"]) {
      for (const [id, entry] of Object.entries(isObject(raw[part]) ? raw[part] : {})) {
        if (entry === null) voice[part].delete(id);
        else voice[part].set(id, entry);
      }
    }
    voices.set(slug, voice);
  }
  const kept = [...voices].filter(([, voice]) => voice.items.size || voice.words.size);
  if (!kept.length) return null;
  return {
    format: AUDIO_FORMAT,
    version: AUDIO_VERSION,
    pack: pack.id,
    language: pack.language,
    voices: Object.fromEntries(kept.map(([slug, voice]) => [slug, { ...voice, items: Object.fromEntries(voice.items), words: Object.fromEntries(voice.words) }])),
  };
}

/** A manifest without the recordings of some sentences (ones whose words changed since), or null when nothing's left. */
export function withoutItems(audio, ids) {
  if (!isObject(audio?.voices)) return null;
  const gone = new Set(ids);
  const voices = Object.entries(audio.voices)
    .filter(([, voice]) => isObject(voice))
    .map(([slug, voice]) => [slug, { ...voice, items: Object.fromEntries(Object.entries(isObject(voice.items) ? voice.items : {}).filter(([id]) => !gone.has(id))) }])
    .filter(([, voice]) => Object.keys(voice.items).length || Object.keys(isObject(voice.words) ? voice.words : {}).length);
  return voices.length ? { ...audio, voices: Object.fromEntries(voices) } : null;
}

/**
 * A version 1 manifest (each clip by its path in the pack's folder) as version 2. clipOf(src) gives the clip's name from
 * its bytes (clipName of its sha256), which only whoever has the files can work out. License and credit are left for
 * whoever publishes it to add.
 */
export function fromVersion1(v1, clipOf) {
  const voices = {};
  for (const [slug, voice] of Object.entries(v1?.voices ?? {})) {
    const { items = {}, words = {}, ...meta } = voice;
    voices[slug] = {
      ...meta,
      items: Object.fromEntries(Object.entries(items).map(([id, e]) => [id, { clip: clipOf(e.src), seconds: e.seconds, words: e.words }])),
      words: Object.fromEntries(Object.entries(words).map(([lemma, e]) => [lemma, { clip: clipOf(e.src), seconds: e.seconds }])),
    };
  }
  return { format: AUDIO_FORMAT, version: AUDIO_VERSION, pack: v1?.pack, language: v1?.language, voices };
}

/**
 * A manifest as the device plays it, either version: { voices: { slug: { name, about, license, credit, items: { id:
 * { url, seconds, words } }, words: { lemma: { url, seconds } } } } }. base: where a version 1 manifest's paths are
 * (/audio/<pack>); clipBase: where version 2's clips are (/library/audio; for a pack of yours, /api/packs/audio, the copies this device keeps).
 */
export function readAudio(manifest, { base = "", clipBase = "/library/audio" } = {}) {
  if (!isObject(manifest) || manifest.format !== AUDIO_FORMAT || !isObject(manifest.voices)) return null;
  const urlOf = (entry) => (manifest.version === 1 ? `${base}/${entry.src}` : `${clipBase}/${entry.clip}`);
  const voices = {};
  for (const [slug, voice] of Object.entries(manifest.voices)) {
    const items = Object.fromEntries(Object.entries(voice.items ?? {}).map(([id, e]) => [id, { url: urlOf(e), seconds: e.seconds, words: e.words }]));
    const words = Object.fromEntries(Object.entries(voice.words ?? {}).map(([lemma, e]) => [lemma, { url: urlOf(e), seconds: e.seconds }]));
    voices[slug] = { name: voice.name, about: voice.about, license: voice.license, credit: voice.credit, items, words };
  }
  return { voices };
}
