// A pack that teaches how a script is read (pack-format.js teaches: "script"; study/deck.js): Japanese's kana (packs/kana-ja.json), played as a
// deck whose games ask how each letter is said. The pack's check keeping the field and refusing it every way it can be wrong (another value, a
// sentence, a gap, lessons), a pack without it unchanged; kana-ja's cards in learning order (hiragana's 46, its voiced and combined, then
// katakana the same), each sound once a script, katakana's sounds hiragana's, を ぢ づ with the spelling a keyboard uses; its deck's games (the
// card, Choose, Type for the sound, Match; Listening only where the device can say a letter), new letters met in order then asked, Type
// recorded as reading; wrong choices never said alike (hearing "o", お and を are both right; か and カ), of the letter's own script first; Type
// right on any of a letter's spellings, nothing else; the letters offered beside lesson 1 (deck.js scriptFirst: Home's first card and Study's
// row) only while nothing's taught and some letters are still new (a letter shown but not yet asked is), never for a deck that isn't a script. Another copy's dir to see it fail on one
// from before.
//   node scripts/test-script-pack.mjs [<app dir>]   (exit 0 = pass)
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.argv[2] ? resolve(process.argv[2]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);
await from("scripts/fixtures/library-grammar.mjs");
const { checkPack } = await from("public/js/study/pack-format.js");
const { savePack, setPackOn } = await from("public/js/study/packs.js");
const { setLearning } = await from("public/js/study/learning.js");
const progress = await from("public/js/study/progress.js");
const deck = await from("public/js/study/deck.js");

// kana-ja is read from the copy that has it (this one), so a copy from before is tested on the same letters.
const KANA = JSON.parse(readFileSync(join(HERE, "packs/kana-ja.json"), "utf8"));

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

await test("the pack's check keeps teaches: \"script\" on kana-ja, and refuses another value, a sentence, a gap or lessons in a script pack", () => {
  const kept = checkPack(structuredClone(KANA), { installed: [] });
  assert(kept.pack && !kept.errors.length && !kept.warnings.length, `kana-ja: ${JSON.stringify([...kept.errors, ...kept.warnings].slice(0, 2))}`);
  assert(kept.pack.teaches === "script" && kept.pack.items.length === 208, `teaches ${kept.pack.teaches}, ${kept.pack.items.length} cards`);
  const refused = (change, why) => {
    const pack = structuredClone(KANA);
    change(pack);
    const out = checkPack(pack, { installed: [] });
    assert(!out.pack && out.errors.some((e) => why.test(e.message)), `${why}: ${JSON.stringify(out.errors.slice(0, 1))}`);
  };
  refused((p) => (p.teaches = "letters"), /teaches is "script"/);
  refused((p) => (p.items[3] = { id: "gap", text: "あいう", cloze: { at: 1, answer: "い" } }), /only cards of a letter/);
  const starter = JSON.parse(readFileSync(join(APP, "packs/starter-ja.json"), "utf8"));
  const sentences = checkPack({ ...structuredClone(starter), teaches: "script" }, { installed: [] });
  assert(!sentences.pack && sentences.errors.some((e) => /only cards of a letter/.test(e.message)) && sentences.errors.some((e) => /no lessons/.test(e.message)), "starter-ja as a script pack taken");
  const plain = checkPack(structuredClone(starter), { installed: [] });
  assert(plain.pack && plain.pack.teaches === undefined, "starter-ja, the control, changed");
});

await test("kana-ja's letters: hiragana's 46, its 25 voiced and 33 combined, then katakana the same; each sound once a script; を ぢ づ with a keyboard's spelling", () => {
  const cards = KANA.items;
  const hira = cards.slice(0, 104);
  const kata = cards.slice(104);
  assert(hira.every((c) => /^\p{Script=Hiragana}+$/u.test(c.text)) && kata.every((c) => /^\p{Script=Katakana}+$/u.test(c.text)), "a letter in the other script's half");
  assert(hira.slice(0, 5).map((c) => c.text).join("") === "あいうえお" && hira[45].text === "ん" && hira[46].text === "が" && hira[71].text === "きゃ", `the order: ${hira.slice(0, 5).map((c) => c.text).join("")} … ${hira[45].text} ${hira[46].text} ${hira[71].text}`);
  assert(kata.every((c, i) => c.means === hira[i].means), "a katakana letter said otherwise than its hiragana twin");
  for (const half of [hira, kata]) {
    const sounds = half.flatMap((c) => deck.soundsOf(c.means));
    const twice = sounds.filter((s, i) => sounds.indexOf(s) !== i);
    // お and を share o, じ and ぢ ji, ず and づ zu: said alike, told apart by the keyboard's spelling, and never each other's wrong choice.
    assert(JSON.stringify([...new Set(twice)].sort()) === JSON.stringify(["ji", "o", "zu"]), `sounds twice in a script: ${[...new Set(twice)]}`);
  }
  const byText = Object.fromEntries(cards.map((c) => [c.text, c.means]));
  assert(byText["を"] === "o (wo)" && byText["ぢ"] === "ji (di)" && byText["づ"] === "zu (du)" && byText["し"] === "shi" && byText["ん"] === "n", JSON.stringify([byText["を"], byText["ぢ"], byText["づ"]]));
  return `${hira.length} hiragana, ${kata.length} katakana`;
});

await test("a letter's sounds and Type: any of its spellings right (o or wo for を, shi for し), case and spaces aside; anything else wrong", () => {
  assert(JSON.stringify(deck.soundsOf("o (wo)")) === JSON.stringify(["o", "wo"]), JSON.stringify(deck.soundsOf("o (wo)")));
  const card = (text, means) => ({ id: text, text, means });
  const right = [[card("を", "o (wo)"), "o"], [card("を", "o (wo)"), "WO"], [card("し", "shi"), " shi "], [card("きゃ", "kya"), "Kya"]];
  const wrong = [[card("を", "o (wo)"), "wo o"], [card("し", "shi"), "si"], [card("し", "shi"), "sh"], [card("し", "shi"), ""], [card("ん", "n"), "nn"]];
  for (const [c, typed] of right) assert(deck.soundTyped(c, typed), `${c.text} typed "${typed}" wrong`);
  for (const [c, typed] of wrong) assert(!deck.soundTyped(c, typed), `${c.text} typed "${typed}" right`);
  assert(progress.TESTS["type-sound"]?.skill === "read" && progress.TESTS["type-sound"]?.test === "recall", JSON.stringify(progress.TESTS["type-sound"]));
});

await test("wrong choices: never a letter said alike (を never offers o or お; か never カ), the letter's own script first", () => {
  const cards = KANA.items;
  const of = (text) => cards.find((c) => c.text === text);
  for (let seed = 0; seed < 40; seed++) {
    const wo = deck.scriptChoices(of("を"), cards, "means", 3, `s${seed}`);
    assert(wo.length === 3 && !wo.some((m) => deck.saidAlike(m, "o (wo)")), `を's sounds: ${wo}`);
    const ka = deck.scriptChoices(of("か"), cards, "text", 3, `s${seed}`);
    assert(ka.length === 3 && !ka.includes("カ") && ka.every((t) => /^\p{Script=Hiragana}+$/u.test(t)), `か heard: ${ka}`);
    const o = deck.scriptChoices(of("オ"), cards, "text", 3, `s${seed}`);
    assert(!o.includes("ヲ") && !o.includes("お") && !o.includes("を") && o.every((t) => /^\p{Script=Katakana}+$/u.test(t)), `オ heard: ${o}`);
  }
  return "40 seeds each";
});

await test("its deck: the card, Type for the sound, Match and Choose, Listening only where the device can say a letter; new letters met in order, asked by Choose first", async () => {
  const saved = await savePack(structuredClone(KANA));
  assert(saved.ok, `not saved: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
  setLearning("ja");
  setPackOn?.("kana-ja", true);
  await new Promise((done) => setTimeout(done, 20));
  const pack = deck.decksHere().find((p) => p.id === "kana-ja");
  assert(pack && deck.teachesScript(pack), `kana-ja on this device as a script: ${JSON.stringify(deck.decksHere().map((p) => [p.id, p.teaches]))}`);
  const quiet = deck.cardsOf(pack);
  assert(quiet.every((e) => e.script && JSON.stringify(e.games) === JSON.stringify(["card", "type", "match", "choose"])), `with no voice: ${JSON.stringify(quiet[0].games)}`);
  deck.setLetterHearing(() => true);
  const heard = deck.cardsOf(pack);
  assert(heard.every((e) => e.games.includes("listen")), `with a voice: ${JSON.stringify(heard[0].games)}`);
  const session = deck.deckSession("kana-ja");
  const meets = session.steps.filter((s) => s.game === "card" && s.meaning === "new").map((s) => s.card.text);
  const asks = session.steps.filter((s) => s.meaning === "new" && s.game !== "card" && s.game !== "match");
  assert(meets.length >= 3 && meets.join("") === "あいうえお".slice(0, meets.length), `met first: ${meets.join(" ")}`);
  assert(asks.length === meets.length && asks.every((s) => s.game === "choose" && s.skill === "read"), `asked: ${asks.map((s) => `${s.card.text} ${s.game}`).join(", ")}`);
  const typed = deck.deckInstead({ ...asks[0], entry: { ...asks[0].entry, games: ["type"] } }, new Set(["choose"]));
  assert(typed?.game === "type" && typed.skill === "read", `Type in Choose's place: ${JSON.stringify(typed && [typed.game, typed.skill])}`);
  deck.setLetterHearing(null);
  return `first session: ${meets.join(" ")} met, then asked by ${asks[0].game}`;
});

await test("offered beside lesson 1 (scriptFirst) only while nothing's taught and some letters are still new; never for a deck that isn't a script", () => {
  const first = deck.scriptFirst(true);
  assert(first?.pack.id === "kana-ja" && first.total === 208 && first.fresh === 208, JSON.stringify(first && { id: first.pack.id, total: first.total, fresh: first.fresh }));
  assert(deck.scriptFirst(false) === null, "offered with something taught");
  const lang = "ja";
  // Met (shown) isn't learned: a letter shown is asked next, so it's still new.
  progress.record([{ concept: deck.deckUnit("kana-ja", KANA.items[0].id), lang, outcome: "met", test: "self", skill: "read" }]);
  assert(deck.scriptFirst(true)?.fresh === 208, `a letter only shown taken as learned: ${deck.scriptFirst(true)?.fresh}`);
  for (const card of KANA.items) progress.record([{ concept: deck.deckUnit("kana-ja", card.id), lang, outcome: "right", test: "pick", skill: "read" }]);
  assert(deck.scriptFirst(true) === null, `offered with every letter asked: ${JSON.stringify(deck.scriptFirst(true)?.fresh)}`);
  const other = { ...structuredClone(KANA), id: "letters-not-a-script", teaches: undefined };
  assert(!deck.teachesScript(other), "a deck without teaches taken for a script");
});

await test("the catalog says a pack teaches a script (catalogueEntry, packRefs), so Home can hold its link before the pack is here", async () => {
  const { catalogueEntry, packRefs } = await from("public/js/study/pack-format.js");
  const entry = catalogueEntry(KANA, "0123456789ab");
  assert(entry.teaches === "script", `kana-ja's entry: ${JSON.stringify(entry)}`);
  const starter = JSON.parse(readFileSync(join(APP, "packs/starter-ja.json"), "utf8"));
  assert(catalogueEntry(starter, "0123456789ab").teaches === undefined, "starter-ja's entry says it teaches a script");
  const refs = packRefs({ packs: { ja: [entry, catalogueEntry(starter, "ba9876543210")] } }, "ja");
  assert(refs[0].teaches === "script" && refs[1].teaches === undefined, `refs: ${JSON.stringify(refs.map((r) => [r.id, r.teaches]))}`);
});

await test("Home holds the link: decided once a visit (a held card that can't know leaves it to the card in its place), its place held while the pack comes", () => {
  const today = readFileSync(join(APP, "public/js/know/today.js"), "utf8");
  const packsJs = readFileSync(join(APP, "public/js/study/packs.js"), "utf8");
  assert(/if \(letters\) return letters === "on";/.test(today) && /if \(on \|\| !held\) letters = on \? "on" : "off";/.test(today), "decided once a visit");
  assert(/heldFirstLesson\(\{ letters: lettersOn\(\{ held: true \}\) \}\)/.test(today) && /\.\.\.\(letters \? \{ secondary: \{ held: true \} \} : \{\}\)/.test(today), "the held card's place for it");
  assert(/lettersHeld \? \{ secondary: \{ held: true \} \}/.test(today) && /const lettersExpected = \(now\) => Boolean\(scriptFirst\(true, now\)\) \|\| lettersComing\(\);/.test(today), "its place held while the pack comes");
  assert(/rememberScriptPacks\(language, defaults\.filter\(\(ref\) => ref\.teaches === "script"\)/.test(packsJs) && /export const scriptPacksListed/.test(packsJs), "packs.js keeps what the catalog said");
  return "seen moving in the browser by lx-langs' kana-hold-check (A, B and a planted grow)";
});

await test("Home's first card and Study's rows offer it through scriptFirst, beside lesson 1's Start and door", () => {
  const today = readFileSync(join(APP, "public/js/know/today.js"), "utf8");
  const study = readFileSync(join(APP, "public/js/shell/study.js"), "utf8");
  const home = readFileSync(join(APP, "public/js/i18n/en/home.js"), "utf8");
  assert(/const script = letters === "on" \? scriptFirst\(true, now\) : null;/.test(today) && /secondary: \{ text: t\("home\.lettersFirst"/.test(today) && /href: "#study\/session\/lesson\?from=today"/.test(today), "Home's first card");
  assert(/"home\.lettersFirst": \["First, the letters: \{name\}"/.test(home), "its words");
  assert(/scriptFirst\(study\.firstTime\)/.test(study), "Study's rows");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
