// Japanese typed in romaji (lang/romaji.js, through speech/match.js): turned into kana before it's graded, for a learner with no Japanese keyboard.
// The table by cases (っ from a doubled consonant and tch; ん at the end, before a consonant, as n' and before n and a vowel; n before a vowel or y
// as な-row; long vowels written out, as a macron, as a dash; particles alone; the keyboard's spellings); both ways over the real packs: every
// letter of kana-ja (its Hepburn back to its kana, katakana compared as hiragana) and every sentence of starter-ja, spelled in Hepburn from its
// words (an inverse here) and typed, graded right by study/typed.js, the same typed in kana right too (今、テレビを見ています。 wasn't: the readings
// swap read 今's いま into 見ています, match.js); and what
// stays wrong: a missing っ, ん for な, the wrong particle, another word; Dutch typing and Chinese untouched. Another copy's dir to see it fail.
//   node scripts/test-romaji.mjs [<app dir>]   (exit 0 = pass)
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.argv[2] ? resolve(process.argv[2]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);
await from("scripts/fixtures/library-grammar.mjs");
const romaji = existsSync(join(APP, "public/js/lang/romaji.js")) ? await from("public/js/lang/romaji.js") : {};
const { match } = await from("public/js/speech/match.js");
const { savePack } = await from("public/js/study/packs.js");
const { setLearning } = await from("public/js/study/learning.js");
const content = await from("public/js/study/content.js");
const { typedResult } = await from("public/js/study/typed.js");
const { typedRight } = await from("public/js/study/attribute.js");

let failed = 0;
async function test(name, fn) {
  try {
    const said = await fn();
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(error.message ?? error).split("\n").join("\n      ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const STARTER = JSON.parse(readFileSync(join(HERE, "packs/starter-ja.json"), "utf8"));
const KANA = existsSync(join(HERE, "packs/kana-ja.json")) ? JSON.parse(readFileSync(join(HERE, "packs/kana-ja.json"), "utf8")) : null;

await test("the table, by cases: っ, ん, な-row after n, long vowels three ways, particles, the keyboard's spellings", () => {
  assert(typeof romaji.toKana === "function", "lang/romaji.js has no toKana");
  const cases = {
    kitte: "きって", zasshi: "ざっし", matcha: "まっちゃ", "kin'en": "きんえん", kinen: "きねん", "kon'ya": "こんや", konya: "こにゃ", konnichiwa: "こんにちわ",
    shinbun: "しんぶん", onna: "おんな", hon: "ほん", toukyou: "とうきょう", koohii: "こおひい", "ko-hi-": "こーひー", si: "し", ti: "ち", tu: "つ", hu: "ふ",
    zi: "じ", di: "ぢ", du: "づ", wo: "を", sha: "しゃ", sya: "しゃ", ja: "じゃ", jya: "じゃ", chotto: "ちょっと", gakkou: "がっこう", "ten'in": "てんいん",
  };
  const wrong = Object.entries(cases).filter(([typed, kana]) => romaji.toKana(typed) !== kana).map(([typed, kana]) => `${typed}: ${romaji.toKana(typed)} (not ${kana})`);
  assert(!wrong.length, wrong.join("; "));
  const tokyo = romaji.romajiGuesses("tōkyō");
  assert(tokyo.includes("とうきょう") && tokyo.includes("とおきょお"), `ō as ou and oo: ${tokyo}`);
  const particles = romaji.romajiGuesses("watashi wa koohii o nomimasu");
  assert(particles.includes("わたしはこおひいをのみます"), `particles alone: ${particles}`);
  assert(romaji.romajiGuesses("konnichiwa").includes("こんにちは"), "a word's last wa as は");
  assert(romaji.romajiGuesses("ありがとう").length === 0, "kana taken as romaji");
  assert(romaji.foldKana("コーヒー") === "こおひい" && romaji.foldKana("ラーメン") === "らあめん", `katakana folded: ${romaji.foldKana("コーヒー")}`);
  return `${Object.keys(cases).length} cases`;
});

// Hepburn from kana: the inverse of the table, Hepburn's own spelling first (shi, chi, tsu, fu, ji), っ doubling the next consonant, ん as n (n'
// before a vowel or y), ー as a dash; for spelling the packs' kana to type them.
const HEPBURN = ["a", "i", "u", "e", "o", "shi", "chi", "tsu", "fu", "ji", "sha", "shu", "sho", "cha", "chu", "cho", "ja", "ju", "jo", "di", "du", "wo"];
function hepburn(kana) {
  const table = Object.entries(romaji.ROMAJI).sort(([a], [b]) => (HEPBURN.includes(a) ? -1 : 0) - (HEPBURN.includes(b) ? -1 : 0));
  const back = new Map();
  for (const [latin, k] of table) if (!back.has(k) && !/^[xlcq]/.test(latin) && !/^(si|ti|tu|hu|zi|sya|syu|syo|tya|tyu|tyo|cya|cyu|cyo|jya|jyu|jyo|zya|zyu|zyo)$/.test(latin)) back.set(k, latin);
  const text = romaji.foldKana(kana);
  let out = "";
  for (let i = 0; i < text.length; ) {
    if (text[i] === "っ") {
      const next = hepburn(text.slice(i + 1, i + 3)) || hepburn(text.slice(i + 1, i + 2));
      out += next.startsWith("ch") ? "t" : next[0];
      i++;
      continue;
    }
    if (text[i] === "ん") {
      const next = text[i + 1] ? hepburn(text[i + 1]) : "";
      out += /^[aiueoy]/.test(next) ? "n'" : "n";
      i++;
      continue;
    }
    const two = back.get(text.slice(i, i + 2));
    if (two) {
      out += two;
      i += 2;
      continue;
    }
    out += back.get(text[i]) ?? text[i];
    i++;
  }
  return out;
}

await test("both ways, kana-ja: every letter's Hepburn turned back into its kana (katakana as hiragana)", () => {
  assert(KANA, "packs/kana-ja.json isn't here");
  // The spelling a keyboard uses where the card names one (を "o (wo)": wo), else its Hepburn.
  const typedFor = (means) => /\(([^)]+)\)/.exec(means)?.[1] ?? means;
  const wrong = KANA.items.filter((card) => !romaji.romajiGuesses(typedFor(card.means)).some((kana) => kana === romaji.foldKana(card.text))).map((c) => `${c.text} ${c.means}`);
  assert(!wrong.length, wrong.slice(0, 8).join("; "));
  return `${KANA.items.length} letters`;
});

let starterItems = [];
await test("both ways, starter-ja: every sentence spelled in Hepburn and typed is right; typed in kana, right too", async () => {
  const saved = await savePack(structuredClone(STARTER));
  assert(saved.ok, `starter-ja not saved: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
  setLearning("ja");
  await new Promise((done) => setTimeout(done, 20));
  starterItems = content.ITEMS.filter((item) => item.id.startsWith("starter-ja/") || STARTER.items.some((s) => s.id === item.id));
  assert(starterItems.length >= 100, `${starterItems.length} of starter-ja's sentences on the device`);
  const wrong = [];
  for (const item of starterItems) {
    const said = item.words.map(([text, lemma, reading]) => (["は", "へ", "を"].includes(text) && lemma === text ? { は: "wa", へ: "e", を: "o" }[text] : hepburn(reading ?? text.replace(/[。、！？!?.,]/g, ""))));
    const typed = said.join(" ");
    const kana = item.words.map(([text, , reading]) => reading ?? text).join("");
    if (!typedRight(typedResult(item, typed, true))) wrong.push(`${item.text} typed "${typed}"`);
    if (!typedRight(typedResult(item, kana, true))) wrong.push(`${item.text} typed in kana "${kana}"`);
  }
  assert(!wrong.length, `${wrong.length} wrong: ${wrong.slice(0, 6).join("; ")}`);
  return `${starterItems.length} sentences, each in romaji and in kana`;
});

await test("what stays wrong: a missing っ, ん for な, the wrong particle, another word", () => {
  const item = starterItems.find((one) => one.text === "コーヒーを飲みます。");
  assert(item, "コーヒーを飲みます。 isn't in starter-ja");
  const typedIn = typedResult(item, "koohii o nomimasu", true);
  assert(typedRight(typedIn), "koohii o nomimasu, the control, wrong");
  // A word right is shown as written: コーヒー, never the kana it was compared as (こおひい).
  assert(typedIn.words[0].heard === "コーヒー", `shown as ${typedIn.words[0].heard}`);
  for (const typed of ["koohii wa nomimasu", "ocha o nomimasu", "koohii o nomimashita", "koohii o nonmasu", "kohi o nomimasu"]) assert(!typedRight(typedResult(item, typed, true)), `"${typed}" right`);
  const motto = starterItems.find((one) => /っ/.test(one.words.map(([t, , r]) => r ?? t).join("")));
  if (motto) {
    const full = motto.words.map(([t, , r]) => hepburn(r ?? t.replace(/[。、！？!?.,]/g, ""))).join(" ");
    const single = full.replace(/([bcdfghjkmprstwz])\1/, "$1");
    assert(!typedRight(typedResult(motto, single, true)), `${motto.text} with its っ left out ("${single}") right`);
  }
  return motto ? `っ on ${motto.text}` : "no sentence with っ in starter-ja";
});

await test("other languages untouched: Dutch typed as before, Latin letters in Chinese never read as romaji", () => {
  assert(match("Ik drink koffie.", "ik drink koffie", { lang: "nl" }).ok, "Dutch typed wrong");
  assert(!match("Ik drink koffie.", "ik drink thee", { lang: "nl" }).ok, "Dutch's wrong word right");
  assert(!match("我喝咖啡。", "wo he kafei", { lang: "zh" }).ok, "pinyin typed for Chinese taken as right");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
