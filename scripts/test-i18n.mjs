// The interface's words (public/js/lx/i18n.js, the catalogs in public/js/i18n/en/, scripts/fixtures/i18n-areas.json):
// the message format in several locales' plural rules, values and nodes put in, the pseudo locale, the marks the capture
// walk reads, a locale's strings file (stale and broken entries left out), the freeze's rules and its script
// (i18n-freeze.mjs refusing an incomplete locale), the English catalogs (every key well formed,
// in its area, described, used; every t() key there), no word a person sees left outside t() in a file that has moved,
// and the shell list holding the catalogs. Each check is run once on something planted that it must refuse.
// In Node: `node scripts/test-i18n.mjs` (exit 0 = pass).

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as i18n from "../public/js/lx/i18n.js";
import { uiLiterals } from "./i18n-literals.mjs";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const AREAS = JSON.parse(readFileSync(join(APP, "scripts/fixtures/i18n-areas.json"), "utf8"));
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failed++;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- the message format ----------

const { formatMessage: f, setLocale, t } = i18n;
setLocale("en");
check("a value, a number in the locale's digits", f("{a} has {n} words", { a: "Dutch", n: 12000 }) === "Dutch has 12,000 words", f("{a} has {n} words", { a: "Dutch", n: 12000 }));
check("percent and integer", f("{s, number, percent} read", { s: 0.42 }) === "42% read" && f("{n, number, integer}", { n: 3.7 }) === "4");
check("lower: a title inside a sentence", f("Close {l, lower}", { l: "Add a Language" }) === "Close add a language");
check("apostrophes: one is itself, two are one, quoted braces", f("What's in it, can''t, '{literal}'", {}) === "What's in it, can't, {literal}", f("What's in it, can''t, '{literal}'", {}));
const plural = "{n, plural, =0 {none} one {# word} two {# two-word} few {# few} many {# many} other {# other}}";
const plurals = (code, ns) => {
  setLocale(code, { strings: new Map() });
  const out = ns.map((n) => f(plural, { n }));
  setLocale("en");
  return out;
};
check("English plurals: one, other, =0", same(plurals("en", [0, 1, 2, 5]), ["none", "1 word", "2 other", "5 other"]), plurals("en", [0, 1, 2, 5]).join(" | "));
check("Polish plurals: one, few, many", same(plurals("pl", [1, 3, 5, 22, 25]), ["1 word", "3 few", "5 many", "22 few", "25 many"]), plurals("pl", [1, 3, 5, 22, 25]).join(" | "));
check("Arabic plurals: one, two, few, many, other", same(plurals("ar", [1, 2, 3, 11, 100]).map((s) => s.replace(/[\d٠-٩]+\s*/g, "")), ["word", "two-word", "few", "many", "other"]), plurals("ar", [1, 2, 3, 11, 100]).join(" | "));
check("Spanish plurals: one, many (a million), other", same(plurals("es", [1, 2, 1000000]).map((s) => s.replace(/^[\d.,\s ]+/, "")), ["word", "other", "many"]), plurals("es", [1, 2, 1000000]).join(" | "));
const ordinals = [1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map((n) => f("{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}", { n }));
check("English ordinals: 1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 101st", same(ordinals, ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]), ordinals.join(" "));
check("PLANT an ordinal without its few: lacking, by the ordinal rules", same(i18n.pluralLacking("{n, selectordinal, one {#st} two {#nd} other {#th}}", "en"), ["few (ordinal)"]));
check("an ordinal must stay an ordinal in a translation", i18n.messageProblem("{n}.", "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}") === "{n} must be a selectordinal");
check("each locale's categories", same(i18n.pluralCategories("pl"), ["one", "few", "many", "other"]) && i18n.pluralCategories("ar").length === 6);
check("select, with other", f("{k, select, ai {by your AI} other {by you}}", { k: "ai" }) === "by your AI" && f("{k, select, ai {by your AI} other {by you}}", { k: "x" }) === "by you");
const node = { nodeType: 1, tag: "chip" };
const withNode = f("Where does {word} go?", { word: node });
check("a node put in comes back in an array, where the message puts it", Array.isArray(withNode) && withNode[0] === "Where does " && withNode[1] === node && withNode[2] === " go?", JSON.stringify(withNode));
const before = i18n.i18nProblems().length;
check("a missing value shows as {name} and is told", f("Learning {language}", {}) === "Learning {language}" && i18n.i18nProblems().length === before + 1);
check("a key the English doesn't have shows as ⟦key⟧, never as nothing", t("core.noSuchKey") === "⟦core.noSuchKey⟧");

// The interface's locales (lx/locales.js): which have shipped, and a shipped one's words read from its file, through a
// stand-in fetch with a planted Dutch file (one entry from the English as it is, one from older English).
{
  const { makeLocales, shippedLocales } = await import("../public/js/lx/locales.js");
  const [fresh, old] = i18n.englishEntries();
  const nl = { format: i18n.STRINGS_FORMAT, version: i18n.STRINGS_VERSION, locale: "nl", strings: { [fresh.key]: { text: "Goed", from: i18n.textHash(fresh.text) }, [old.key]: { text: "Oud", from: "0" } } };
  const asked = [];
  let down = true;
  const get = async (url) => {
    asked.push(url);
    if (url === "/i18n/nl.json") return down ? { ok: false } : { ok: true, json: async () => nl };
    if (url === "/i18n/de.json") return { ok: true, json: async () => ({ ...nl, locale: "fr" }) };
    return { ok: false };
  };
  const here = makeLocales(["en", "nl", "de"], get);
  check("shipped locales: English first, each once", same(here.shippedLocales(), ["en", "nl", "de"]) && same(shippedLocales(), ["en"]), here.shippedLocales().join(","));
  const first = await here.loadLocale("nl");
  down = false;
  const second = await here.loadLocale("nl");
  const third = await here.loadLocale("nl");
  check("a shipped locale's words: a miss asked again, then read once and kept", first === null && second?.get(fresh.key) === "Goed" && third === second && asked.filter((u) => u === "/i18n/nl.json").length === 2, asked.join(" "));
  check("an entry from older English left out (its English shows)", second && !second.has(old.key));
  check("English, a locale not shipped, a file for another locale: null, nothing asked for the first two", (await here.loadLocale("en")) === null && (await here.loadLocale("pt")) === null && (await here.loadLocale("de")) === null && !asked.includes("/i18n/pt.json"));
}

// What's shipped is what's there: every code in i18n/shipped.js but "en" has public/i18n/<code>.json and both are in sw.js SHELL;
// every file there is shipped. Checked on the app, then on a PLANT that breaks each.
const shippedProblems = (shipped, files, shell) => {
  const out = [];
  for (const code of shipped.filter((c) => c !== "en")) {
    if (!files.includes(`${code}.json`)) out.push(`${code}: no public/i18n/${code}.json`);
    if (!shell.includes(`/i18n/${code}.json`)) out.push(`${code}: /i18n/${code}.json not in SHELL`);
  }
  for (const file of files) if (!shipped.includes(file.replace(/\.json$/, ""))) out.push(`${file}: not in i18n/shipped.js`);
  if (!shell.includes("/js/i18n/shipped.js") || !shell.includes("/js/lx/locales.js")) out.push("SHELL lacks /js/i18n/shipped.js or /js/lx/locales.js");
  return out;
};
{
  const { SHIPPED } = await import("../public/js/i18n/shipped.js");
  const dir = join(APP, "public/i18n");
  const files = (() => { try { return readdirSync(dir).filter((n) => n.endsWith(".json")); } catch { return []; } })();
  const shell = readFileSync(join(APP, "public/sw.js"), "utf8");
  const found = shippedProblems(SHIPPED, files, shell);
  check("i18n/shipped.js, public/i18n/ and SHELL agree", !found.length, found.join("; "));
  const plant = shippedProblems(["en", "nl"], ["nl.json", "es.json"], '"/js/i18n/shipped.js", "/js/lx/locales.js"');
  check("PLANT nl shipped with no SHELL line, es there and not shipped: both said", plant.length === 2 && plant.some((p) => p.startsWith("nl:")) && plant.some((p) => p.startsWith("es.json")), plant.join("; "));
}

// The chooser (Grow: a key shown from the language you're learning): a strings map is counted in the interface's locale, and
// { locale, strings } in its own, so a Polish message keeps Polish plurals inside an English app. The map form is the control:
// the same message under English rules picks "other" for 5, where Polish picks "many".
{
  const key = i18n.englishEntries()[0].key;
  const baseline = t(key);
  const files = new Map([[key, "{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}"]]);
  setLocale("en");
  i18n.setChooser(() => ({ locale: "pl", strings: files }));
  const own = [1, 3, 5].map((n) => t(key, { n }));
  i18n.setChooser(() => files);
  const asInterface = [1, 3, 5].map((n) => t(key, { n }));
  i18n.setChooser(() => ({ locale: "de", strings: new Map([[key, "{n} Wörter"]]) }));
  const german = t(key, { n: 1234.5 });
  i18n.setChooser(() => ({ locale: "not a tag!", strings: new Map([[key, "{n} x"]]) }));
  let bad;
  try {
    bad = t(key, { n: 1234 });
  } catch (error) {
    bad = `threw ${error.message}`;
  }
  i18n.setChooser(() => null);
  const none = t(key);
  i18n.setChooser(null);
  check("the chooser's { locale, strings }: counted in its own locale (Polish one, few, many)", same(own, ["1 plik", "3 pliki", "5 plików"]), own.join(" | "));
  check("CONTROL the chooser's map alone: counted in the interface's locale (English: 5 is other)", same(asInterface, ["1 plik", "3 pliku", "5 pliku"]), asInterface.join(" | "));
  check("the chooser's locale formats its numbers too (German 1.234,5)", german === "1.234,5 Wörter", german);
  check("a chooser's locale Intl can't use: the interface's, never a throw", bad === "1,234 x", bad);
  check("a chooser saying null: the interface's own words", none === baseline, `${none} / ${baseline}`);
}
for (const bad of ["{a", "a}", "{n, plural, one {x}}", "{n, plural, other {x} other {y}}", "{n, frob}", "{n, number, money}", "{n, select, a {x}"]) {
  let threw = false;
  try {
    i18n.parseMessage(bad);
  } catch {
    threw = true;
  }
  check(`a message that doesn't read is refused: ${bad}`, threw);
}

// ---------- the pseudo locale, and the marks ----------

setLocale("en-XA");
const pseudo = t("core.learning", { language: "Nederlands" });
check("the pseudo locale accents the message, keeps a value as given, grows it and brackets it", /^\[Ļéåŕñîñĝ Nederlands .+\]$/.test(pseudo), pseudo);
check("the pseudo locale formats numbers as English", t("core.strength", { level: 2, levels: 4 }).startsWith("[Šţŕéñĝţĥ 2 öƒ 4"), t("core.strength", { level: 2, levels: 4 }));
setLocale("en");
check("English is English again", t("core.learning", { language: "Dutch" }) === "Learning Dutch");
i18n.setMarking(true);
const marked = t("core.learning", { language: i18n.languageLabel("nl") });
i18n.setMarking(false);
const decoded = i18n.decodeMarks(marked);
check("marks: the text reads the same with them gone", decoded.text === "Learning Dutch", JSON.stringify(decoded.text));
check("marks: both keys, outer first", same(decoded.keys.map((k) => k.key), ["core.learning", "language.nl"]) && decoded.keys[1].text === "Dutch", JSON.stringify(decoded.keys));
check("marks draw nothing, join nothing, break no line: only U+2061–U+2064", [...marked.replace("Learning Dutch".split("").reduce((s, c) => s, ""), "")].filter((c) => !/[A-Za-z ]/.test(c)).every((c) => c >= "⁡" && c <= "⁤"));
check("the English is unmarked with marking off", t("core.learning", { language: "Dutch" }) === "Learning Dutch");

// ---------- a locale's strings file ----------

const english = new Map(i18n.englishEntries().map((e) => [e.key, e.text]));
const file = (strings) => ({ format: "lexicommons-strings", version: 1, locale: "es", strings });
const entry = (key, text, from = i18n.textHash(english.get(key))) => ({ text, from });
const readOk = i18n.readStrings(file({ "core.learning": entry("core.learning", "Aprendiendo {language}"), "core.check": entry("core.check", "Comprobar") }));
check("a strings file: its entries read", readOk.errors.length === 0 && readOk.strings.get("core.check") === "Comprobar" && readOk.strings.size === 2);
setLocale("es", { strings: readOk.strings });
check("a locale's words, and English where it has none", t("core.check") === "Comprobar" && t("core.learning", { language: "neerlandés" }) === "Aprendiendo neerlandés" && t("core.retry") === "Retry");
setLocale("en");
const stale = i18n.readStrings(file({ "core.check": entry("core.check", "Comprobar", i18n.textHash("Check it")) }));
check("PLANT an entry translated from English that has since changed: stale, left out", same(stale.stale, ["core.check"]) && stale.strings.size === 0);
const dropped = i18n.readStrings(file({ "core.learning": entry("core.learning", "Aprendiendo") }));
check("PLANT a translation that leaves out {language}: refused", dropped.errors.some((e) => e.includes("{language} is left out")), dropped.errors.join("; "));
const invented = i18n.readStrings(file({ "core.learning": entry("core.learning", "Aprendiendo {idioma}") }));
check("PLANT a translation naming a value the English doesn't give: refused", invented.errors.some((e) => e.includes("{idioma}")), invented.errors.join("; "));
check("PLANT a key the English doesn't have: listed, left out", same(i18n.readStrings(file({ "core.nothing": { text: "x", from: "0" } })).unknown, ["core.nothing"]));
check("PLANT a file in another format: refused", i18n.readStrings({ format: "other", version: 1, locale: "es", strings: {} }).errors.length === 1);
check("a plural must stay a plural in a translation", i18n.messageProblem("{n} palabras", "{n, plural, one {# word} other {# words}}") === "{n} must be a plural");

// ---------- the freeze (scripts/i18n-freeze.mjs; its rules are lx/i18n.js localeProblems) ----------

const allEnglish = i18n.englishEntries();
const completeFile = (locale) => ({ format: "lexicommons-strings", version: 1, locale, strings: Object.fromEntries(allEnglish.map((e) => [e.key, { text: e.text, from: i18n.textHash(e.text) }])) });
// Japanese has one plural category (other), so the English, used as its text, is complete: a test of the rules, not of a translation.
const whole = i18n.localeProblems(completeFile("ja"));
check("a locale with every key, current and readable, is complete", whole.ok.length === allEnglish.length && !whole.errors.length && !whole.missing.length && !whole.stale.length && !whole.broken.length && !whole.plurals.length && !whole.unknown.length, `${whole.ok.length} of ${allEnglish.length}`);
const plantFile = () => {
  const file = completeFile("ja");
  delete file.strings["core.retry"]; // missing
  file.strings["core.check"].from = i18n.textHash("Check it"); // stale
  file.strings["core.learning"] = { text: "Aprendiendo", from: i18n.textHash(english.get("core.learning")) }; // broken: drops {language}
  file.strings["core.leftOver"] = { text: "x", from: "0" }; // unknown
  return file;
};
const planted = i18n.localeProblems(plantFile());
check("PLANT a missing, a stale, a broken and a left-over entry: each named", same(planted.missing, ["core.retry"]) && same(planted.stale, ["core.check"]) && planted.broken.length === 1 && planted.broken[0].key === "core.learning" && same(planted.unknown, ["core.leftOver"]), JSON.stringify({ missing: planted.missing, stale: planted.stale, broken: planted.broken, unknown: planted.unknown }));
check("PLANT a Polish plural with only one and other: few and many are lacking", same(i18n.pluralLacking("{n, plural, one {# słowo} other {# słów}}", "pl").sort(), ["few", "many"]));
check("a Polish plural with every category lacks nothing; Japanese needs only other", i18n.pluralLacking("{n, plural, one {a} few {b} many {c} other {d}}", "pl").length === 0 && i18n.pluralLacking("{n, plural, other {# 語}}", "ja").length === 0);
check("a plural inside a select is held to it too", same(i18n.pluralLacking("{k, select, a {{n, plural, one {x} other {y}}} other {z}}", "pl").sort(), ["few", "many"]));
// The script itself, on folders of planted files.
const freeze = (dir, extra = []) => spawnSync(process.execPath, [join(APP, "scripts/i18n-freeze.mjs"), "--dir", dir, ...extra], { encoding: "utf8" });
const scratch = mkdtempSync(join(tmpdir(), "i18n-freeze-"));
const folder = (name, files) => {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, body] of Object.entries(files)) writeFileSync(join(dir, file), typeof body === "string" ? body : JSON.stringify(body));
  return dir;
};
const none = freeze(folder("none", {}));
check("the freeze with no shipped locale passes, and says so", none.status === 0 && /no locale is shipped yet/.test(none.stdout), none.stdout.trim().split("\n")[0]);
const ready = freeze(folder("ready", { "ja.json": completeFile("ja") }));
check("the freeze with a complete locale passes", ready.status === 0, ready.stdout.trim().split("\n").slice(-1)[0]);
const refused = freeze(folder("refused", { "ja.json": plantFile() }), ["--todo", join(scratch, "todo.json")]);
check("PLANT the freeze with a missing, a stale, a broken and a left-over entry: refused, each said", refused.status === 1 && ["core.retry", "core.check", "core.learning", "core.leftOver", "the freeze is refused"].every((w) => refused.stdout.includes(w)), refused.stdout.slice(0, 300));
const todoFile = JSON.parse(readFileSync(join(scratch, "todo.json"), "utf8"));
check("--todo lists what a locale needs translated, with its English and about", same(todoFile.keys.map((k) => k.key).sort(), ["core.check", "core.learning", "core.retry"]) && todoFile.keys.every((k) => k.english && k.about && same(k.locales, ["ja"])), JSON.stringify(todoFile.keys.map((k) => k.key)));
const misnamed = freeze(folder("misnamed", { "es.json": completeFile("fr") }));
check("PLANT a file named for one locale holding another: refused", misnamed.status === 1 && /named es\.json but says it's fr/.test(misnamed.stdout));
const unknownLanguage = freeze(folder("unknown", { "xx.json": completeFile("xx") }));
check("PLANT a locale the app doesn't know: refused", unknownLanguage.status === 1 && /isn't a language the app knows/.test(unknownLanguage.stdout));
const notJson = freeze(folder("notjson", { "es.json": "{ not json" }));
check("PLANT a file that isn't JSON: refused", notJson.status === 1);
rmSync(scratch, { recursive: true, force: true });

// ---------- the English catalogs ----------

const entries = i18n.englishEntries();
const catalogProblems = (list, duplicates) => {
  const out = [];
  for (const { key, text, about, area } of list) {
    if (!i18n.isKey(key)) out.push(`${key}: not a key (area.name)`);
    if (area !== "language" && !key.startsWith(`${area}.`)) out.push(`${key}: not in its area's file (${area})`);
    if (area !== "language" && (typeof about !== "string" || about.trim().length < 20)) out.push(`${key}: no about (what it is, where it shows, its room)`);
    try {
      i18n.parseMessage(text);
    } catch (error) {
      out.push(`${key}: ${error.message}`);
    }
  }
  for (const key of duplicates) out.push(`${key}: in two areas`);
  return out;
};
const realCatalog = catalogProblems(entries, i18n.duplicateKeys());
check("every English entry: a key in its area, described, readable, once", realCatalog.length === 0, realCatalog.slice(0, 5).join("; "));
check(
  "PLANT an entry with no about, one in the wrong area, one that doesn't read, one in two areas",
  catalogProblems([{ key: "core.x", text: "X", about: "", area: "core" }, { key: "welcome.y", text: "Y", about: "a long enough about for this entry", area: "core" }, { key: "core.z", text: "{a", about: "a long enough about for this entry", area: "core" }], ["core.w"]).length === 4,
);
check("the language family: every language has its name", i18n.languageLabel("nl") === "Dutch" && i18n.languageLabel("zh-Hant").length > 0 && entries.filter((e) => e.area === "language").length >= 70);

// Every t("…") key in the app has English; every English key is used somewhere.
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : []));
// The public home page uses its keys as data-t="<key>" (public/js/site.js puts a locale's words in; test-site-pages.mjs holds its English).
// The server's own pages (src/pages.ts: the sign-in pages, Report a bug, the not-found page) take their words from the same English catalogs.
const sources = [...walk(join(APP, "public/js")).filter((path) => !path.includes("/vendor/")), join(APP, "public/index.html"), ...readdirSync(join(APP, "src")).filter((name) => name.endsWith(".ts")).map((name) => join(APP, "src", name))];
const keyUses = (files) => {
  const used = new Set();
  const calls = [];
  for (const path of files) {
    const text = typeof path === "string" ? readFileSync(path, "utf8") : path.text;
    const name = typeof path === "string" ? relative(APP, path) : path.name;
    if (name.includes("public/js/i18n/")) continue;
    for (const m of text.matchAll(/\bt\(\s*"([^"]+)"/g)) calls.push({ key: m[1], at: name });
    for (const m of text.matchAll(/"([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9-]+)+)"/g)) used.add(m[1]);
  }
  return { used, calls };
};
const usesProblems = ({ used, calls }) => [
  ...calls.filter((c) => !english.has(c.key)).map((c) => `t("${c.key}") in ${c.at}: no English`),
  ...entries.filter((e) => e.area !== "language" && !used.has(e.key)).map((e) => `${e.key}: used nowhere`),
];
const realUses = usesProblems(keyUses(sources));
check("every t() key has English, and every English key is used", realUses.length === 0, realUses.slice(0, 6).join("; "));
const plantedUses = usesProblems(keyUses([...sources, { name: "public/js/planted.js", text: 'const a = t("core.notThere");' }]));
check("PLANT a t() of a key with no English", plantedUses.some((p) => p.includes("core.notThere")), plantedUses.join("; "));

// ---------- no word left outside t() in a moved file ----------

const movedProblems = (files) => {
  const out = [];
  for (const [area, spec] of Object.entries(AREAS.areas)) {
    for (const file of spec.files) {
      const text = files[file] ?? readFileSync(join(APP, file), "utf8");
      const allowed = new Set((spec.allow?.[file] ?? []).map((a) => a.text));
      for (const literal of uiLiterals(text)) if (!allowed.has(literal.text)) out.push(`${file}:${literal.line} (${area}) "${literal.text}"`);
    }
  }
  return out;
};
const moved = movedProblems({});
check(`no word a person sees outside t() in a moved file (${Object.values(AREAS.areas).flatMap((a) => a.files).join(", ")})`, moved.length === 0, moved.slice(0, 8).join("; "));
const welcomeText = readFileSync(join(APP, "public/js/shell/welcome.js"), "utf8");
const plantedMoved = movedProblems({ "public/js/shell/welcome.js": welcomeText.replace('t("welcome.noMatch")', '"Nothing found yet."') });
check("PLANT a literal back in a moved file", plantedMoved.some((p) => p.includes("Nothing found yet.")), plantedMoved.join("; "));
for (const [area, spec] of Object.entries(AREAS.areas)) {
  for (const allowed of Object.values(spec.allow ?? {}).flat()) check(`${area}: an allowed literal says why`, typeof allowed.why === "string" && allowed.why.length > 10, allowed.text);
}

// ---------- the shell list ----------

const sw = readFileSync(join(APP, "public/sw.js"), "utf8");
const shell = new Set([...sw.slice(sw.indexOf("const SHELL = ["), sw.indexOf("];", sw.indexOf("const SHELL = ["))).matchAll(/"([^"]+)"/g)].map((m) => m[1].split("?")[0]));
const catalogs = ["/js/lx/i18n.js", ...readdirSync(join(APP, "public/js/i18n/en")).map((name) => `/js/i18n/en/${name}`)];
const missing = catalogs.filter((url) => !shell.has(url));
check("the shell list has i18n.js and every English catalog (an offline start needs them)", missing.length === 0, missing.join(", "));

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
