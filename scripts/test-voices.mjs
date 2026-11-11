// This device's voices for each language (public/js/study/voice.js), through a stand-in speechSynthesis with a phone's
// Chinese voices on it: Mandarin (zh) never takes a Chinese voice from Hong Kong or Macau, which speaks Cantonese
// (Apple's Sinji, Google's 粵語), not even one picked before; Tagalog takes Filipino's (fil-PH), Hebrew iw's, Indonesian
// in's and Norwegian no's; a language's main country comes first. The rule is lang/index.js voiceSpeaks, which a recording's
// locale follows too (test-pack-audio.mjs). Nothing is spoken. Exit 0 = pass.
//   node scripts/test-voices.mjs

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.addEventListener = () => {};
globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, visibilityState: "visible" };
const voice = (name, lang, localService = true) => ({ name, lang, voiceURI: name.toLowerCase().replace(/\W+/g, "-"), localService });
const VOICES = [
  voice("Sinji", "zh-HK"),
  voice("Google 粵語（香港）", "zh-HK", false),
  voice("Macau", "zh_MO"),
  voice("Wan", "yue-HK"),
  voice("Meijia", "zh-TW"),
  voice("Tingting", "zh-CN"),
  voice("Google 普通话（中国大陆）", "zh-CN", false),
  voice("Ellen", "nl-BE"),
  voice("Xander", "nl-NL"),
  voice("Rosa", "fil-PH"),
  voice("Carmit", "iw-IL"),
  voice("Nora", "no-NO"),
  voice("Damayanti", "in-ID"),
  voice("Rêber", "ku-TR"),
  voice("Samantha", "en-US"),
];
globalThis.speechSynthesis = { getVoices: () => VOICES, addEventListener: () => {}, speak() {}, cancel() {} };
// Learning Chinese, with a Cantonese voice picked before (a voice the list offered then).
store.set("lx.learning.v1", JSON.stringify({ lang: "zh", from: "en" }));
store.set("lx.study.v1", JSON.stringify({ listening: { device: "sinji" } }));

const { voicesFor, voiceChoices, currentDeviceVoiceId } = await import("../public/js/study/voice.js");
const { voiceSpeaks } = await import("../public/js/lang/index.js");

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}
const names = (list) => list.map((v) => v.name);

check("Chinese (Mandarin): China's and Taiwan's voices, none from Hong Kong or Macau", names(voicesFor("zh")).sort(), ["Google 普通话（中国大陆）", "Meijia", "Tingting"].sort());
check("its voice choices: China's first, then Taiwan's; no Cantonese voice offered", voiceChoices().map((c) => c.name), ["Tingting", "Google 普通话（中国大陆）", "Meijia"]);
check("a Cantonese voice picked before isn't used for Chinese: China's is", currentDeviceVoiceId(), "device:tingting");
check("Cantonese takes exactly the Chinese voices Mandarin leaves out, and its own yue ones", names(voicesFor("yue")).sort(), ["Google 粵語（香港）", "Macau", "Sinji", "Wan"].sort());
check("Tagalog takes Filipino's voices (fil-PH)", names(voicesFor("tl")), ["Rosa"]);
check("Dutch takes Belgium's and the Netherlands'", names(voicesFor("nl")).sort(), ["Ellen", "Xander"]);
check("Hebrew and Indonesian take Android's older iw and in voices, Norwegian (nb) no-NO's", [names(voicesFor("he")), names(voicesFor("id")), names(voicesFor("nb"))], [["Carmit"], ["Damayanti"], ["Nora"]]);
check("Kurmanji (kmr) takes a Kurdish voice tagged ku-TR; Sorani (ckb) doesn't", [names(voicesFor("kmr")), names(voicesFor("ckb"))], [["Rêber"], []]);
check(
  "the rule (lang/index.js voiceSpeaks), tag by tag",
  [["zh", "zh-CN"], ["zh", "zh_TW"], ["zh", "zh-SG"], ["zh", "zh-HK"], ["zh", "zh_HK"], ["zh", "ZH-mo"], ["zh", "zh-Hant-HK"], ["zh", "zh-Hans-CN"], ["zh", "yue-HK"], ["yue", "yue-HK"], ["yue", "zh-HK"], ["yue", "zh-Hant-HK"], ["yue", "zh-CN"], ["yue", "zh-TW"], ["tl", "fil-PH"], ["tl", "tl"], ["nl", "nl-BE"], ["nl", "de-DE"], ["nl", null]].map(([code, tag]) => voiceSpeaks(code, tag)),
  [true, true, true, false, false, false, false, true, false, true, true, true, false, false, true, true, true, false, false],
);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
