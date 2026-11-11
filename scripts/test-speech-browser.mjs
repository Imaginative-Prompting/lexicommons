// The tag the browser's recognizer is given for each language (public/js/speech/browser.js), through a stand-in
// SpeechRecognition that records what it's asked: rec.lang, available() and install(); and which languages Chrome's
// is offered for (GOOGLE_KNOWS). Exit 0 = pass.
//   node scripts/test-speech-browser.mjs

import { browserListen, browserSupport, GOOGLE_KNOWS, installLanguage, recognizerLang } from "../public/js/speech/browser.js";
import { LANGUAGES } from "../public/js/lang/index.js";

// Chrome on 28 Oct 2026, one Tagalog and one Dutch recording under each locale (the project's
// docs/speech-2026-10-28-recognizer-languages): these came back as English, and these in their own language.
const MEASURED_UNKNOWN = ["be", "br", "cy", "eo", "fy", "ga", "gd", "haw", "ht", "la", "lb", "mt", "ps"];
const MEASURED_KNOWN = ["en", "nl", "de", "da", "tl", "uz", "hr", "sr", "bs", "ar", "fi", "uk", "zh", "yue", "mr", "ne", "pa", "gu"];

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}

// Chrome's recognizer as far as browser.js uses it: available() and install() as statics, lang and start() on each one.
const asked = { available: [], install: [], lang: [] };
globalThis.SpeechRecognition = class {
  static async available({ langs, processLocally }) {
    asked.available.push([...langs, processLocally ? "local" : "remote"]);
    return processLocally ? "unavailable" : "available";
  }
  static async install({ langs }) {
    asked.install.push(...langs);
    return true;
  }
  start() {
    asked.lang.push(this.lang);
  }
  stop() {}
  abort() {}
};
const reset = () => Object.values(asked).forEach((list) => (list.length = 0));
// Starts listening (the stand-in records the tag), then cancels, which ends it as "aborted".
function listenTo(lang) {
  const listener = browserListen({ lang });
  listener.done.catch(() => {});
  listener.cancel();
}

// Tagalog: Google and Microsoft know it as Filipino, fil-PH.
check("Tagalog's locale is tl-PH", LANGUAGES.tl.locale, "tl-PH");
reset();
listenTo(LANGUAGES.tl.locale);
check("Tagalog: the recognizer listens for fil-PH", asked.lang, ["fil-PH"]);
check("Tagalog: support asks for fil-PH", [await browserSupport(LANGUAGES.tl.locale), asked.available], [{ state: "server" }, [["fil-PH", "local"], ["fil-PH", "remote"]]]);
reset();
await installLanguage(LANGUAGES.tl.locale);
check("Tagalog: install asks for fil-PH", asked.install, ["fil-PH"]);
check("tl alone is fil, and the case of the code doesn't matter", ["tl", "TL-PH"].map(recognizerLang), ["fil", "fil-PH"]);

// Every other language: its locale as it is.
reset();
for (const [code, language] of Object.entries(LANGUAGES)) if (code !== "tl") listenTo(language.locale);
const others = Object.entries(LANGUAGES).filter(([code]) => code !== "tl").map(([, language]) => language.locale);
check(`the other ${others.length} languages: the recognizer listens for their own locale`, asked.lang, others);
check("a locale with a script keeps it", recognizerLang("zh-Hant-TW"), "zh-Hant-TW");

// Chrome (a recognizer with available(), not Edge) only for the languages Google's recognizer knows (GOOGLE_KNOWS,
// measured): for any other it writes English, and every answer would be marked wrong.
const chromeSays = async (code) => browserSupport(LANGUAGES[code].locale);
const offChrome = (code) => ({ state: "none", why: `Chrome's recognizer doesn't know ${LANGUAGES[code].name}.`, unknownLanguage: true });
const wrong = [];
for (const code of Object.keys(LANGUAGES)) {
  const said = await chromeSays(code);
  const want = GOOGLE_KNOWS.has(code.split("-")[0]) ? { state: "server" } : offChrome(code);
  if (JSON.stringify(said) !== JSON.stringify(want)) wrong.push(`${code}: ${JSON.stringify(said)}`);
}
check(`Chrome: each of the ${Object.keys(LANGUAGES).length} languages offered exactly when Google knows it`, wrong, []);
// What the 28 Oct measurement found, held here apart from the list itself.
check("Chrome: the languages Google wrote as English aren't offered", await Promise.all(MEASURED_UNKNOWN.filter((code) => LANGUAGES[code]).map(async (code) => (await chromeSays(code)).state)), MEASURED_UNKNOWN.filter((code) => LANGUAGES[code]).map(() => "none"));
check("Chrome: the languages Google wrote in their own language are", await Promise.all(MEASURED_KNOWN.map(async (code) => (await chromeSays(code)).state)), MEASURED_KNOWN.map(() => "server"));
check("Chrome: a language added since, not yet measured, isn't offered", (await browserSupport("zz-ZZ")).state, "none");
// Edge has available() too, with Microsoft behind it; a browser without available() (Safari) is left to try.
Object.defineProperty(globalThis.navigator, "userAgent", { value: "Mozilla/5.0 Chrome/141.0 Safari/537.36 Edg/141.0", configurable: true });
check("Edge: Google's list isn't Edge's", (await chromeSays("ga")).state, "server");
Object.defineProperty(globalThis.navigator, "userAgent", { value: "Mozilla/5.0 Node", configurable: true });
const available = globalThis.SpeechRecognition.available;
delete globalThis.SpeechRecognition.available;
check("no available() (Safari): left to try", (await chromeSays("ga")).state, "unknown");
globalThis.SpeechRecognition.available = available;

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
