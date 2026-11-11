// A pack's recorded audio (public/js/study/pack-audio.js), case by case: the starter's own recordings, turned into
// version 2 with each clip named by its bytes, pass the check against the starter; the open library's rules (every
// voice's license and credit); every way a manifest can be wrong, each refused with where and why, all at once; the
// names and places of clips and manifests; and what the device plays from either version. Pure, so it runs in Node:
// `node scripts/test-pack-audio.mjs` (exit 0 = pass).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILT_IN } from "../public/js/packs/index.js";
import { catalogueEntry, checkPack, packUrl, packVersion } from "../public/js/study/pack-format.js";
import { AUDIO_LIMITS, audioKey, audioUrl, audioVersion, checkAudio, clipKey, clipName, clipUrl, clipsOf, fitAudio, fromVersion1, mergeAudio, readAudio, unchangedItems, withoutItems } from "../public/js/study/pack-audio.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FOLDER = join(HERE, "../public/audio/starter-word-order");
const STARTER = checkPack(BUILT_IN[0]).pack;
const V1 = JSON.parse(readFileSync(join(FOLDER, "manifest.json"), "utf8"));
const clipOf = (src) => clipName(createHash("sha256").update(readFileSync(join(FOLDER, src))).digest("hex"), src.endsWith(".m4a") ? "m4a" : "mp3");
const V2 = fromVersion1(V1, clipOf);

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const eq = (actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${a} ≠ ${e}`);
};
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const copy = (value) => structuredClone(value);
const ats = (value, options) => checkAudio(value, STARTER, options).errors.map((e) => e.at);
const licensed = (audio) => {
  const out = copy(audio);
  for (const voice of Object.values(out.voices)) Object.assign(voice, { license: "Licensed for Lexicommons", credit: `${voice.name}, a synthetic voice (ElevenLabs)` });
  return out;
};

test("the starter's recordings, as version 2 with each clip named by its bytes, pass against the starter", () => {
  const { audio, errors, warnings } = checkAudio(V2, STARTER);
  ok(audio, JSON.stringify(errors).slice(0, 300));
  eq(Object.keys(audio.voices), ["emma", "ido"]);
  eq(warnings, []);
  for (const voice of Object.values(audio.voices)) eq(Object.keys(voice.items).length, STARTER.items.length);
  // Every clip is a distinct recording, named by its bytes.
  const clips = clipsOf(audio);
  const sources = Object.values(V1.voices).flatMap((v) => [...Object.values(v.items), ...Object.values(v.words)]).length;
  eq(clips.length, sources);
  ok(clips.every((c) => /^[0-9a-f]{16}\.mp3$/.test(c)), clips[0]);
});

test("the open library also needs every voice's license and credit", () => {
  eq(ats(V2, { forLibrary: true }), ["voices.emma.license", "voices.emma.credit", "voices.ido.license", "voices.ido.credit"]);
  const { audio } = checkAudio(licensed(V2), STARTER, { forLibrary: true });
  ok(audio?.voices.emma.license && audio.voices.emma.credit, "kept");
});

test("a sentence: in the pack, a clip named by its bytes, a length, one timing per word, in order", () => {
  const bad = copy(V2);
  const emma = bad.voices.emma;
  const [first, second, third, fourth, fifth] = STARTER.items.map((i) => i.id);
  emma.items.nope = emma.items[first];
  emma.items[first] = { ...emma.items[first], clip: "emma/boek.mp3" };
  emma.items[second] = { ...emma.items[second], seconds: 0 };
  emma.items[third] = { ...emma.items[third], words: emma.items[third].words.slice(1) };
  emma.items[fourth] = { ...emma.items[fourth], words: [...emma.items[fourth].words].reverse() };
  emma.items[fifth] = { ...emma.items[fifth], seconds: AUDIO_LIMITS.sentenceSeconds + 1 };
  eq(ats(bad).sort(), [`voices.emma.items.${first}`, `voices.emma.items.${second}.seconds`, `voices.emma.items.${third}.words`, `voices.emma.items.${fourth}.words`, `voices.emma.items.${fifth}.seconds`, "voices.emma.items.nope"].sort());
});

test("a word: one the pack teaches, with its clip and length", () => {
  const bad = copy(V2);
  const [lemma] = Object.keys(bad.voices.ido.words);
  bad.voices.ido.words.verzonnen = bad.voices.ido.words[lemma];
  bad.voices.ido.words[lemma] = { ...bad.voices.ido.words[lemma], seconds: AUDIO_LIMITS.wordSeconds + 1 };
  eq(ats(bad).sort(), [`voices.ido.words.${lemma}.seconds`, "voices.ido.words.verzonnen"].sort());
});

test("a voice in the pack's language by lang/index.js voiceSpeaks: a Chinese pack's voice from Hong Kong or Macau speaks Cantonese, and is refused; a Cantonese pack takes it", () => {
  // The starter as a Chinese pack, for the locale alone: its other checks don't read the words' language.
  const zh = { ...STARTER, language: "zh" };
  const at = (locale) => {
    const audio = copy(V2);
    audio.language = "zh";
    audio.voices.emma.locale = "zh-CN";
    audio.voices.ido.locale = locale;
    return checkAudio(audio, zh).errors.filter((e) => e.at.endsWith(".locale"));
  };
  for (const locale of ["zh-CN", "zh-TW", "zh-SG"]) eq(at(locale), []);
  for (const locale of ["zh-HK", "zh-MO"]) {
    eq(at(locale).map((e) => e.at), ["voices.ido.locale"]);
    ok(/speaks Cantonese/.test(at(locale)[0].message), at(locale)[0].message);
  }
  // A Cantonese pack takes Hong Kong's and Macau's Chinese voices and its own (yue-HK), never Mandarin's.
  const yue = { ...STARTER, language: "yue" };
  const cantonese = (locale) => {
    const audio = copy(V2);
    audio.language = "yue";
    audio.voices.emma.locale = "yue-HK";
    audio.voices.ido.locale = locale;
    return checkAudio(audio, yue).errors.filter((e) => e.at.endsWith(".locale"));
  };
  for (const locale of ["zh-HK", "zh-MO", "yue-HK"]) eq(cantonese(locale), []);
  for (const locale of ["zh-CN", "zh-TW"]) {
    eq(cantonese(locale).map((e) => e.at), ["voices.ido.locale"]);
    ok(/isn't in the pack's language \(yue\)/.test(cantonese(locale)[0].message), cantonese(locale)[0].message);
  }
  // A Tagalog pack takes a Filipino voice (fil-PH), as a device's voices do; another language's it doesn't.
  const tl = { ...STARTER, language: "tl" };
  const tagalog = (locale) => {
    const audio = copy(V2);
    audio.language = "tl";
    audio.voices.emma.locale = "tl-PH";
    audio.voices.ido.locale = locale;
    return checkAudio(audio, tl).errors.filter((e) => e.at.endsWith(".locale"));
  };
  eq(tagalog("fil-PH"), []);
  eq(tagalog("es-ES").map((e) => e.at), ["voices.ido.locale"]);
  ok(/isn't in the pack's language \(tl\)/.test(tagalog("es-ES")[0].message), tagalog("es-ES")[0].message);
});

test("the manifest and its voices: format, version, the pack it reads, a voice in its language that reads something", () => {
  eq(ats({ ...copy(V2), format: "x", version: 1 }), ["format", "version"]);
  eq(ats({ ...copy(V2), pack: "other", language: "de" }), ["pack", "language"]);
  const bad = copy(V2);
  bad.voices.ido.locale = "de-DE";
  bad.voices["Bad Slug"] = bad.voices.emma;
  bad.voices.empty = { name: "Empty", locale: "nl-NL", items: {}, words: {} };
  bad.voices.emma.made = "yesterday";
  eq(ats(bad).sort(), ["voices.Bad Slug", "voices.emma.made", "voices.empty", "voices.ido.locale"].sort());
  eq(ats({ ...copy(V2), voices: {} }), ["voices"]);
  const many = copy(V2);
  for (let n = 0; n < AUDIO_LIMITS.voices; n++) many.voices[`v${n}`] = many.voices.emma;
  ok(ats(many).includes("voices"), "too many voices");
});

test("a field of the wrong type is refused, never coerced (JSON can carry an object whose toString is null)", () => {
  const trap = JSON.parse('{"toString": null}');
  const bad = copy(V2);
  const [id] = Object.keys(bad.voices.emma.items);
  const [lemma] = Object.keys(bad.voices.ido.words);
  for (const key of ["locale", "name", "about", "license", "credit", "provider", "voiceId", "model", "made"]) bad.voices.emma[key] = trap;
  bad.voices.emma.items[id] = { ...bad.voices.emma.items[id], clip: trap };
  bad.voices.ido.words[lemma] = { ...bad.voices.ido.words[lemma], seconds: trap };
  let result;
  try {
    result = checkAudio(bad, STARTER, { forLibrary: true });
  } catch (error) {
    throw new Error(`threw instead of refusing: ${error.message}`);
  }
  const at = (key) => `voices.emma.${key}`;
  eq(result.audio, null);
  for (const key of ["locale", "name", "about", "license", "credit", "provider", "voiceId", "model", "made"]) ok(result.errors.some((e) => e.at === at(key)), `${key} refused: ${JSON.stringify(result.errors.map((e) => e.at))}`);
  ok(result.errors.some((e) => e.at === `voices.emma.items.${id}`), "a clip that isn't text refused");
  ok(result.errors.some((e) => e.at === `voices.ido.words.${lemma}.seconds`), "a length that isn't a number refused");
});

test("what isn't refused is said: a voice that leaves sentences to the device, a field that isn't a voice's", () => {
  const partial = copy(V2);
  const [first] = STARTER.items;
  partial.voices.emma.items = { [first.id]: partial.voices.emma.items[first.id] };
  partial.voices.emma.mood = "warm";
  const { audio, warnings } = checkAudio(partial, STARTER);
  ok(audio && !("mood" in audio.voices.emma), "kept, without the stray field");
  eq(warnings.map((w) => w.at), ["voices.emma.mood", "voices.emma.items"]);
  ok(/reads 1 of the pack's 13 sentences/.test(warnings[1].message), warnings[1].message);
});

test("names and places: a clip by its bytes, a manifest by its content, both under the library", () => {
  eq(clipName("29b62882ea34206fabcdef", "audio/mpeg"), "29b62882ea34206f.mp3");
  eq(clipName("29b62882ea34206fabcdef", "audio/mp4"), "29b62882ea34206f.m4a");
  eq([clipKey("29b62882ea34206f.mp3"), clipUrl("29b62882ea34206f.mp3")], ["audio/29b62882ea34206f.mp3", "/library/audio/29b62882ea34206f.mp3"]);
  eq(audioKey("starter-word-order", "6a8619bea57c", "0123456789ab"), "packs/starter-word-order/6a8619bea57c/audio.0123456789ab.json");
  eq(audioUrl("starter-word-order", "6a8619bea57c", "0123456789ab"), "/library/packs/starter-word-order/6a8619bea57c/audio.0123456789ab.json");
});

test("what the device plays: version 1 by its paths, version 2 by its clips, the same timings", () => {
  const [id] = Object.keys(V1.voices.emma.items);
  const one = readAudio(V1, { base: "/audio/starter-word-order" });
  const two = readAudio(checkAudio(V2, STARTER).audio, { clipBase: "/library/audio" });
  eq(one.voices.emma.items[id].url, `/audio/starter-word-order/${V1.voices.emma.items[id].src}`);
  eq(two.voices.emma.items[id].url, `/library/audio/${V2.voices.emma.items[id].clip}`);
  eq(one.voices.emma.items[id].words, two.voices.emma.items[id].words);
  eq(readAudio({ format: "other" }), null);
});

const versions = await Promise.all([audioVersion(checkAudio(V2, STARTER).audio), audioVersion(checkAudio(copy(V2), STARTER).audio)]);
test("fitted to a pack that changed: sentences it lost or changed and words it no longer teaches go; what's left passes", () => {
  const whole = checkAudio(V2, STARTER).audio;
  ok(whole, "the starter's recordings pass");
  // The same pack: all of it stays.
  eq(fitAudio(whole, STARTER), whole);
  // A sentence taken out, one changed (its words differ now), and a word no longer taught.
  const [gone, changed, ...rest] = STARTER.items;
  const lemma = Object.keys(STARTER.words)[0];
  const smaller = checkPack({ ...structuredClone(STARTER), items: structuredClone(rest) }).pack;
  const fitted = fitAudio(whole, smaller, { still: new Set(rest.map((i) => i.id)) });
  ok(fitted, "what's left passes");
  for (const voice of Object.values(fitted.voices)) {
    ok(!(gone.id in voice.items) && !(changed.id in voice.items), "the sentences it lost are left out");
    ok(Object.keys(voice.items).every((id) => smaller.items.some((i) => i.id === id)), "only sentences it has");
  }
  const keepOnly = fitAudio(whole, STARTER, { still: new Set([rest[0].id]) });
  ok(Object.values(keepOnly.voices).every((v) => Object.keys(v.items).join() === rest[0].id), "only the sentences still the same");
  ok(lemma, "a word");
  // Nothing left of it: none.
  eq(fitAudio(whole, STARTER, { still: new Set() }) && Object.values(fitAudio(whole, STARTER, { still: new Set() }).voices).every((v) => !Object.keys(v.items).length), true);
  eq(fitAudio(null, STARTER), null);
});

const reloaded = await (async () => {
  const { loadPacks, packAudio, syncLibraryPacks } = await import("../public/js/study/packs.js");
  const first = STARTER;
  const next = checkPack({ ...copy(first), name: `${first.name} (updated)` }).pack;
  const v1 = await packVersion(first);
  const v2 = await packVersion(next);
  const manifest = licensed(V2);
  const url = audioUrl(first.id, v1, await audioVersion(manifest));
  const files = new Map([[packUrl(first.id, v1), first], [packUrl(next.id, v2), next], [url, manifest]]);
  let entry = catalogueEntry(first, v1, { audio: url });
  const fetch = globalThis.fetch;
  globalThis.fetch = async (at) => {
    const body = at === "/library/catalogue.json" ? { format: "lexicommons-catalogue", packs: { nl: [entry] } } : files.get(String(at));
    return body ? new Response(JSON.stringify(body)) : new Response("Not found", { status: 404 });
  };
  try {
    const installed = await syncLibraryPacks();
    const original = packAudio(first.id);
    entry = catalogueEntry(next, v2);
    const updated = await syncLibraryPacks();
    const before = packAudio(first.id);
    await loadPacks();
    return { installed, updated, original, before, after: packAudio(first.id) };
  } finally {
    globalThis.fetch = fetch;
  }
})();
test("a reload keeps recordings brought from an earlier pack version after a name-only update", () => {
  for (const result of [reloaded.installed, reloaded.updated]) ok(result.ok && !result.problems.length, JSON.stringify(result));
  ok(reloaded.original, "the first version has recordings");
  eq(reloaded.before, reloaded.original);
  ok(reloaded.after, "loadPacks dropped the recordings retained by ensure");
  eq(reloaded.after, reloaded.before);
});

test("your AI's change to a pack's recordings, merged into what it has: entries by id, null takes one away, a voice, or all", () => {
  const whole = checkAudio(V2, STARTER).audio;
  const [slug] = Object.keys(whole.voices);
  const voice = whole.voices[slug];
  const [first, second] = Object.keys(voice.items);
  const [lemma] = Object.keys(voice.words);
  const clip = "0123456789abcdef.mp3";
  const entry = { clip, seconds: 1.5, words: STARTER.items.find((i) => i.id === first).words.map((_, n) => [n * 0.2, n * 0.2 + 0.1]) };
  // One sentence re-recorded, one taken away, a word taken away, the about changed: the rest as it was.
  const merged = mergeAudio(whole, { voices: { [slug]: { about: "Calm.", items: { [first]: entry, [second]: null }, words: { [lemma]: null } } } }, STARTER);
  const checked = checkAudio(merged, STARTER);
  ok(checked.audio, `the merge passes: ${JSON.stringify(checked.errors.slice(0, 2))}`);
  const after = checked.audio.voices[slug];
  eq(after.items[first], entry);
  ok(!(second in after.items) && !(lemma in after.words), "null takes a sentence's and a word's recording away");
  eq(Object.keys(after.items).length, Object.keys(voice.items).length - 1);
  eq([after.about, after.name, after.locale], ["Calm.", voice.name, voice.locale]);
  ok(whole.voices[slug].items[first].clip !== clip && second in whole.voices[slug].items, "what it was merged into is left as it was");
  // A new voice beside it, from nothing: its name and locale are needed.
  const fresh = mergeAudio(null, { voices: { anna: { name: "Anna", locale: "nl-NL", items: { [first]: entry } } } }, STARTER);
  eq(checkAudio(fresh, STARTER).errors, []);
  eq([fresh.format, fresh.version, fresh.pack, fresh.language], ["lexicommons-audio", 2, STARTER.id, STARTER.language]);
  ok(checkAudio(mergeAudio(null, { voices: { anna: { items: { [first]: entry } } } }, STARTER), STARTER).errors.some((e) => /name is missing/.test(e.message)), "a new voice without its name is refused");
  // A detail set to null goes; a voice set to null goes; a voice left reading nothing goes; voices null: none.
  ok(!("about" in mergeAudio(merged, { voices: { [slug]: { about: null } } }, STARTER).voices[slug]), "about: null takes it away");
  const two = mergeAudio(whole, { voices: { anna: { name: "Anna", locale: "nl-NL", items: { [first]: entry } } } }, STARTER);
  eq(Object.keys(mergeAudio(two, { voices: { anna: null } }, STARTER).voices), Object.keys(whole.voices));
  eq(Object.keys(mergeAudio(two, { voices: { anna: { items: { [first]: null } } } }, STARTER).voices), Object.keys(whole.voices));
  eq(mergeAudio(two, { voices: null }, STARTER), null);
  eq(mergeAudio(null, { voices: { anna: null } }, STARTER), null);
  // Untrusted keys stay keys: "__proto__" never reaches a prototype (and checkAudio refuses it as a sentence).
  const crafted = JSON.parse(`{"voices":{"${slug}":{"items":{"__proto__":{"clip":"${clip}","seconds":1,"words":[]}}},"__proto__":{"name":"x"}}}`);
  const out = mergeAudio(whole, crafted, STARTER);
  ok(Object.getPrototypeOf(out.voices) === Object.prototype && Object.getPrototypeOf(out.voices[slug].items) === Object.prototype && !({}).clip, "no prototype touched");
  ok(Object.hasOwn(out.voices[slug].items, "__proto__"), "kept as a key");
  ok(checkAudio(out, STARTER).errors.some((e) => /no sentence "__proto__"/.test(e.message)), "and refused by the check");
  // Not a change at all: none. Not an object where a voice goes: that voice goes.
  eq(mergeAudio(whole, null, STARTER), null);
  eq(Object.keys(mergeAudio(whole, { voices: { [slug]: "emma" } }, STARTER).voices), Object.keys(whole.voices).filter((s) => s !== slug));
});

test("a manifest without the recordings of sentences that changed: the rest stays, and a voice left with nothing goes", () => {
  const whole = checkAudio(V2, STARTER).audio;
  const ids = STARTER.items.map((i) => i.id);
  const less = withoutItems(whole, ids.slice(0, 2));
  for (const [slug, voice] of Object.entries(less.voices)) {
    ok(!(ids[0] in voice.items) && !(ids[1] in voice.items), "the two are gone");
    eq(Object.keys(voice.items).length, Object.keys(whole.voices[slug].items).filter((id) => !ids.slice(0, 2).includes(id)).length);
    eq(voice.words, whole.voices[slug].words);
  }
  // Every sentence gone: a voice that still says words stays; one that only read sentences goes.
  const sentencesOnly = { ...whole, voices: Object.fromEntries(Object.entries(whole.voices).map(([s, v]) => [s, { ...v, words: {} }])) };
  eq(withoutItems(sentencesOnly, ids), null);
  ok(Object.values(withoutItems(whole, ids).voices).every((v) => !Object.keys(v.items).length && Object.keys(v.words).length), "words stay");
  eq(withoutItems(null, ids), null);
});

test("a manifest's version is its content: the same audio, the same version", () => {
  ok(/^[0-9a-f]{12}$/.test(versions[0]) && versions[0] === versions[1], versions.join(" "));
});

test("the sentences a new version says word for word (their recordings still fit): one whose words changed and one taken out aren't; then fitted, the rest keep their clips", () => {
  const [gone, changed, ...rest] = STARTER.items;
  const after = structuredClone({ ...STARTER, items: [structuredClone(changed), ...structuredClone(rest)] });
  after.items[0].words = [...after.items[0].words, ["toch"]];
  delete after.items[0].text;
  const same = unchangedItems(STARTER, after);
  eq([...same].sort(), rest.map((i) => i.id).sort());
  ok(!same.has(gone.id) && !same.has(changed.id), "the changed and the gone ones aren't the same");
  eq([...unchangedItems(STARTER, STARTER)].sort(), STARTER.items.map((i) => i.id).sort());
  eq(unchangedItems(null, STARTER).size, 0);
  const next = checkPack(after).pack;
  ok(next, `the next version passes: ${JSON.stringify(checkPack(after).errors.slice(0, 1))}`);
  const kept = fitAudio(checkAudio(V2, STARTER).audio, next, { still: same, forLibrary: false });
  for (const voice of Object.values(kept.voices)) eq(Object.keys(voice.items).sort(), rest.map((i) => i.id).filter((id) => id in V2.voices[Object.keys(V2.voices)[0]].items).sort());
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
