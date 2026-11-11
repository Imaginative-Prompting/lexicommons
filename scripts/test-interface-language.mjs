// The rules of the app's own language (public/js/shell/interface-rules.js; Settings → Language, the first run, Grow): the device's languages
// as Lexicommons knows them, never assuming one; the settings as kept and what they decide (the locale shown, falling back to English for a
// language the app hasn't got, App language only a shipped one, Grow only into a shipped language you don't speak); Grow's words and which
// messages have grown, a counting one only where both languages count alike. Each part with a control that shows it can fail.
// node scripts/test-interface-language.mjs [<app dir>]   (exit 0 = pass)
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP = resolve(process.argv[2] ?? new URL("..", import.meta.url).pathname);
const file = join(APP, "public/js/shell/interface-rules.js");
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (!existsSync(file)) {
  console.log(`FAIL  ${file} isn't there: this app has no rules for the language of its own words`);
  process.exit(1);
}
const R = await import(pathToFileURL(file).href);
const { LANGUAGES } = await import(pathToFileURL(join(APP, "public/js/lang/index.js")).href);

// ---------- the device's languages ----------
const tags = { "en-GB": "en", "en-US": "en", "pt-BR": "pt", nl: "nl", "nl-BE": "nl", "zh-TW": "zh-Hant", "zh-HK": "zh-Hant", "zh-Hant": "zh-Hant", "zh-CN": "zh", zh: "zh", "fil-PH": "tl", iw: "he", "no-NO": "nb", "yue-HK": "yue", "sr-Latn-RS": "sr", "xx-YY": null, "": null, "not a tag!": null };
const tagMiss = Object.entries(tags).filter(([tag, code]) => R.languageOfTag(tag) !== code).map(([tag, code]) => `${tag} → ${R.languageOfTag(tag)}, wanted ${code}`);
check("a device's language tag as Lexicommons' language (regions, Traditional Chinese, older codes, unknown ones none)", tagMiss.length === 0, tagMiss.join("; "));
check("control: a code Lexicommons hasn't got is none, never a near one", R.languageOfTag("xh-ZA") === (Object.hasOwn(LANGUAGES, "xh") ? "xh" : null));
check("the device's languages: known ones once each, in its order", same(R.deviceLanguagesOf(["en-GB", "xx", "nl-NL", "en-US", "zh-TW"]), ["en", "nl", "zh-Hant"]));
check("a device with no language Lexicommons knows offers none (never English by default)", same(R.deviceLanguagesOf(["xx-YY"]), []) && same(R.deviceLanguagesOf([]), []) && same(R.deviceLanguagesOf(undefined), []));

// ---------- the settings as kept ----------
const blank = { speak: null, app: null, grow: false };
const junk = [null, 7, "nl", [], { speak: "klingon", app: 3, grow: "true" }, { speak: { toString: null } }, { grow: 1 }];
const junkMiss = junk.filter((value) => !same(R.settingOf(value), blank));
check("anything kept that isn't the settings reads as nothing set", junkMiss.length === 0, junkMiss.map((v) => JSON.stringify(v)).join("; "));
check("the settings as set read back", same(R.settingOf({ speak: "tr", app: "nl", grow: true }), { speak: "tr", app: "nl", grow: true }));
check("the language you speak: as set, else the device's first, else none", R.speakerOf({ ...blank, speak: "tr" }, ["en"]) === "tr" && R.speakerOf(blank, ["nl", "en"]) === "nl" && R.speakerOf(blank, []) === null);

// ---------- what they decide ----------
const cases = [
  ["nothing set, a device Lexicommons doesn't know: English, not a fallback", blank, { device: [], shipped: ["en"], learning: "nl" }, { code: "en", wanted: "en", fallback: false, canGrow: false, growInto: null }],
  ["you speak Turkish, which the app hasn't got: English, said as a fallback", { ...blank, speak: "tr" }, { device: ["en"], shipped: ["en"], learning: "nl" }, { code: "en", wanted: "tr", fallback: true, canGrow: false, growInto: null }],
  ["you speak Dutch, which the app has: Dutch", { ...blank, speak: "nl" }, { device: ["en"], shipped: ["en", "nl"], learning: "de" }, { code: "nl", wanted: "nl", fallback: false, canGrow: false, growInto: null }],
  ["the device's language before you've said: it, when shipped", blank, { device: ["nl"], shipped: ["en", "nl"], learning: "de" }, { code: "nl", wanted: "nl", fallback: false, canGrow: false, growInto: null }],
  ["Grow on, learning a shipped language you don't speak: it grows into it", { ...blank, speak: "en", grow: true }, { device: [], shipped: ["en", "nl"], learning: "nl" }, { code: "en", wanted: "en", fallback: false, canGrow: true, growInto: "nl" }],
  ["Grow off: nothing grows, though it could", { ...blank, speak: "en" }, { device: [], shipped: ["en", "nl"], learning: "nl" }, { code: "en", wanted: "en", fallback: false, canGrow: true, growInto: null }],
  ["Grow on, the language you're learning not shipped: nothing grows", { ...blank, speak: "en", grow: true }, { device: [], shipped: ["en"], learning: "nl" }, { code: "en", wanted: "en", fallback: false, canGrow: false, growInto: null }],
  ["Grow on with an App language: the app is in that language whole, nothing grows", { speak: "en", app: "nl", grow: true }, { device: [], shipped: ["en", "nl"], learning: "nl" }, { code: "nl", wanted: "nl", fallback: false, canGrow: false, growInto: null }],
  ["learning the language you speak: nothing to grow into", { ...blank, speak: "nl", grow: true }, { device: [], shipped: ["en", "nl"], learning: "nl" }, { code: "nl", wanted: "nl", fallback: false, canGrow: false, growInto: null }],
  ["you speak Turkish (English shown), learning English: nothing to grow into", { ...blank, speak: "tr", grow: true }, { device: [], shipped: ["en"], learning: "en" }, { code: "en", wanted: "tr", fallback: true, canGrow: false, growInto: null }],
];
for (const [name, setting, given, want] of cases) {
  const got = R.decide(setting, given);
  check(name, same(got, want), same(got, want) ? "" : `got ${JSON.stringify(got)}`);
}
check("control: a decision that disagrees is caught", !same(R.decide({ ...blank, speak: "tr" }, { device: [], shipped: ["en"], learning: "nl" }), { code: "tr", wanted: "tr", fallback: false, canGrow: false, growInto: null }));
check("App language: only a shipped one, never the language you speak", R.appLanguageFor("nl", { shipped: ["en", "nl"], speak: "en" }) === "nl" && R.appLanguageFor("tr", { shipped: ["en", "nl"], speak: "en" }) === null && R.appLanguageFor("en", { shipped: ["en", "nl"], speak: "en" }) === null && R.appLanguageFor(null, { shipped: ["en"], speak: "en" }) === null);

// ---------- Grow's words ----------
check("a message's words: every option of a plural, no values, no numbers or signs", same(R.wordsOfMessage("{count, plural, one {# dag} other {# dagen}} — {name}!", "nl"), ["dag", "dagen"]));
check("a message's words, lowercase and without punctuation around them", same(R.wordsOfMessage("Je voortgang: Alles.", "nl"), ["je", "voortgang", "alles"]));
check("a language written without spaces is split by its words", R.wordsOfMessage("今日の練習", "ja").length >= 2 && R.wordsOfMessage("今日の練習", "ja").includes("練習"));
check("a message with only a value has no words", same(R.wordsOfMessage("{language}", "nl"), []));
let threw = false;
try {
  R.wordsOfMessage("{count, plural, one {# dag", "nl");
} catch {
  threw = true;
}
check("a message that doesn't read throws (grownKeys leaves it out)", threw);

// ---------- which messages have grown ----------
const nl = new Map([
  ["home.practice", "Oefenen"],
  ["home.progress", "Je voortgang"],
  ["home.days", "{count, plural, one {# dag} other {# dagen}}"],
  ["home.place", "{n, selectordinal, other {#e}} plaats"],
  ["home.language", "{language}"],
  ["home.broken", "{count, plural, one {# dag"],
  ["home.read", "Lezen"],
]);
const forms = { oefenen: "oefenen", je: "je", voortgang: "voortgang", dag: "dag", dagen: "dag", plaats: "plaats", lezen: "lezen" };
const grown = (known, { lang = "nl", strings = nl } = {}) =>
  [...R.grownKeys(strings, { lang, lemmaOf: (form) => forms[form], known: (lemma) => known.includes(lemma) })].sort();
check("nothing known: nothing grown", same(grown([]), []));
check("a message grows once every word of it is known, not before", same(grown(["oefenen", "je"]), ["home.practice"]) && same(grown(["oefenen", "je", "voortgang"]), ["home.practice", "home.progress"]));
check("a counting message grows by its words' dictionary form (dag and dagen are dag), every option's", same(grown(["dag"]), ["home.days"]));
check("a message with a piece no pack has as a word (an ordinal's ending, #e) stays English", !grown(["plaats"]).includes("home.place"));
check("a message with no words of its own, or one that doesn't read, never grows", !grown(Object.values(forms)).some((key) => key === "home.language" || key === "home.broken"));
check("a word no pack has (no dictionary form) keeps its message English", same(R.grownKeys(new Map([["x", "Oefenen vandaag"]]), { lang: "nl", lemmaOf: (form) => forms[form], known: () => true }), new Set()));
const fr = new Map([["home.days", "{count, plural, one {# jour} other {# jours}}"], ["home.read", "Lire"]]);
const frForms = { jour: "jour", jours: "jour", lire: "lire" };
const frGrown = [...R.grownKeys(fr, { lang: "fr", lemmaOf: (form) => frForms[form], known: () => true })].sort();
check("into French, a counting message grows too (t() counts it in French: 0 jour, 2 jours)", same(frGrown, ["home.days", "home.read"]), frGrown.join(","));
check("control: everything known grows what can", same(grown(Object.values(forms)), ["home.days", "home.practice", "home.progress", "home.read"]));

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
