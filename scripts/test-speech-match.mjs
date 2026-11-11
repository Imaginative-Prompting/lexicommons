// The speech matcher's rules, case by case (public/js/speech/match.js). Exit 0 = pass.
//   node scripts/test-speech-match.mjs

import { cardinal, match, ordinal, words } from "../public/js/speech/match.js";
import { withoutAccents } from "../public/js/lang/index.js";
import { readFileSync } from "node:fs";

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}
// A result as one line: word:result, with what was heard when it isn't simply right.
const brief = (r) => [r.ok, r.words.map((w) => `${w.text}:${w.result}${w.heard && w.result !== "right" ? `(${w.heard})` : ""}`).join(" "), r.extra.join(" ")];

const E = "Ik heb gisteren een boek gelezen.";
const allRight = "Ik:right heb:right gisteren:right een:right boek:right gelezen:right";

check("exact", brief(match(E, "ik heb gisteren een boek gelezen")), [true, allRight, ""]);
check("case, punctuation, accents", brief(match(E, "Ik heb gisteren één boek gelezen!")), [true, allRight, ""]);
check("fillers ignored", brief(match(E, "Ik heb eh gisteren een boek ehm gelezen")), [true, allRight, ""]);
check("one sound off is close", brief(match(E, "Ik heb gisteren een boek gelese")), [true, "Ik:right heb:right gisteren:right een:right boek:right gelezen:close(gelese)", ""]);
check("a different word is wrong", brief(match(E, "Ik heb gisteren een krant gelezen")), [false, "Ik:right heb:right gisteren:right een:right boek:wrong(krant) gelezen:right", ""]);
check("a word left out is missing", brief(match(E, "Ik heb gisteren een boek")), [false, "Ik:right heb:right gisteren:right een:right boek:right gelezen:missing", ""]);
check("a word added is extra", brief(match(E, "Ik heb gisteren een mooi boek gelezen")), [false, allRight, "mooi"]);
check("nothing heard", brief(match(E, "")), [false, "Ik:missing heb:missing gisteren:missing een:missing boek:missing gelezen:missing", ""]);
check("participle too early is an order slip", brief(match(E, "Ik heb gelezen gisteren een boek")), [false, "Ik:right heb:right gisteren:right een:right boek:right gelezen:order(gelezen)", ""]);
check("verb third is an order slip", brief(match(E, "Ik gisteren heb een boek gelezen")), [false, "Ik:right heb:order(heb) gisteren:right een:right boek:right gelezen:right", ""]);
check("separable verb kept together", brief(match("Ik bel je morgen op.", "Ik opbel je morgen")), [false, "Ik:right bel:order(opbel) je:right morgen:right op:order(opbel)", ""]);
check("separable verb kept together, a sound off", brief(match("Ik bel je morgen op.", "Ik opbell je morgen")), [false, "Ik:right bel:order(opbell) je:right morgen:right op:order(opbell)", ""]);
check("compound said as two words, too early", brief(match("Kun je het raam opendoen?", "Kun je open doen het raam")), [false, "Kun:right je:right het:right raam:right opendoen:order(open doen)", ""]);
check("two words run together in place are close", brief(match("Morgen gaan we naar oma.", "Morgan ganwe naroma")), [true, "Morgen:close(morgan) gaan:close(ganwe) we:close(ganwe) naar:close(naroma) oma:close(naroma)", ""]);
check("two words run together out of place are an order slip", brief(match("Morgen gaan we naar oma.", "Morgen naroma gaanwe")), [false, "Morgen:right gaan:right we:right naar:order(naroma) oma:order(naroma)", ""]);
check("separable particle too early", brief(match("Ik bel je morgen op.", "Ik bel op je morgen")), [false, "Ik:right bel:right je:right morgen:right op:order(op)", ""]);
check("niet before the object", brief(match("Ik zie hem niet.", "Ik zie niet hem")), [false, "Ik:right zie:right hem:order(hem) niet:right", ""]);
check("verb not at the end after dat", brief(match("Ik weet dat hij morgen komt.", "Ik weet dat komt hij morgen")), [false, "Ik:right weet:right dat:right hij:right morgen:right komt:order(komt)", ""]);
check("compound heard as two words", brief(match("Kun je het raam opendoen?", "Kun je het raam open doen")), [true, "Kun:right je:right het:right raam:right opendoen:right", ""]);
check("short forms count", brief(match("Wij hebben het raam niet gezien.", "We hebben 't raam niet gezien")), [true, "Wij:right hebben:right het:right raam:right niet:right gezien:right", ""]);
check("accepted alternative", match("Kun je het raam opendoen?", "kan je het raam opendoen", { accept: ["Kan je het raam opendoen?"] }).words[0].result, "right");
check("without the alternative, one sound off", match("Kun je het raam opendoen?", "kan je het raam opendoen").words[0].result, "close");
check("best of several guesses", brief(match(E, ["ik heb gisteren een boek gelegd", "ik heb gisteren een boek gelezen"])), [true, allRight, ""]);
check("digits against words", brief(match("Ik heb 3 boeken.", "ik heb drie boeken")), [true, "Ik:right heb:right 3:right boeken:right", ""]);
check("words against digits", brief(match("Er zijn drieëntwintig mensen.", "Er zijn 23 mensen")), [true, "Er:right zijn:right drieëntwintig:right mensen:right", ""]);
// Several guesses: the same words in another order is what was said, even when another guess is right.
const HOE = "Hoe gaat het met je?";
check("a right guess doesn't hide the same words reordered", match(HOE, ["hoe het gaat met je", "Hoe gaat het met je", "het gaat met je"]).ok, false);
check("and it's named as an order slip", match(HOE, ["hoe het gaat met je", "Hoe gaat het met je"]).words.some((w) => w.result === "order"), true);
check("wherever the reordered guess comes", match(HOE, ["Hoe gaat het met je", "hoe het gaat met je"]).ok, false);
check("a guess with other words doesn't count as reordered", match(HOE, ["Hoe gaat het met je", "het gaat met je", "Who het gaat met je"]).ok, true);
check("an accepted sentence's own order is right", match("Ik ga morgen naar huis.", ["ik ga morgen naar huis", "morgen ga ik naar huis"], { accept: ["Morgen ga ik naar huis."] }).ok, true);
check("a single guess is judged as it was", match(HOE, "hoe gaat het met je").ok, true);
check("a language without spaces isn't reordered by characters", match("私は行きます", ["私は行きます", "行きます私は"], { lang: "ja" }).ok, true);
// On what Chrome really guessed (scripts/fixtures/chrome-guesses.json): no right answer lost, and the wrong orders it can tell.
const chrome = JSON.parse(readFileSync(new URL("./fixtures/chrome-guesses.json", import.meta.url), "utf8")).clips;
const passing = (kind) => chrome.filter((c) => c.kind === kind && match(c.expected, c.guesses, { lang: "nl" }).ok).length;
check("Chrome's guesses: wrong orders passed", passing("order"), 4);
check("Chrome's guesses: right sentences passed", passing("right"), 138);
check("Chrome's guesses: accented sentences passed", passing("accent"), 25);
check("expected as a word list keeps its indexes", match(["Ik", "heb", "gisteren", "een", "boek", "gelezen"], "ik heb gisteren een boek gelezen").words.length, 6);
check("score: all right", match(E, "ik heb gisteren een boek gelezen").score, 1);
check("score: one order slip", match(E, "Ik heb gelezen gisteren een boek").score, 0.917);

check("numbers", [0, 1, 13, 21, 22, 23, 99, 100, 101, 1000, 2026].map((n) => cardinal(n)), ["nul", "een", "dertien", "eenentwintig", "tweeëntwintig", "drieëntwintig", "negenennegentig", "honderd", "honderdeen", "duizend", "tweeduizendzesentwintig"]);
check("ordinals", [1, 2, 3, 8, 12, 20, 21].map((n) => ordinal(n)), ["eerste", "tweede", "derde", "achtste", "twaalfde", "twintigste", "eenentwintigste"]);
check("English numbers", [1, 21, 40].map((n) => cardinal(n, "en")), ["one", "twenty one", "forty"]);
check("times, decimals, money, percent", words("Om 8.30 uur, 2,5 kilo, €5 en 50%"), ["om", "acht", "uur", "dertig", "twee", "komma", "vijf", "kilo", "vijf", "euro", "en", "vijftig", "procent"]);
check("apostrophes", words("’s Ochtends m’n fiets, auto's"), ["'s", "ochtends", "m'n", "fiets", "auto's"]);
// A language without number words here keeps digits as digits, on both sides: never another language's words.
check("German: digits stay digits", words("Ich habe 3 Bücher, 2,5 Kilo.", "de"), ["ich", "habe", "3", "bücher", "2", "5", "kilo"]);
check("German: the same digits match", match("Ich habe 3 Bücher.", "ich habe 3 bücher", { lang: "de" }).ok, true);

// Languages written without spaces: compared character by character against the words as the pack splits them.
const HI = "यह मेरे पापा की गाड़ी है।";
check("Hindi: exact, the danda off", brief(match(HI, "यह मेरे पापा की गाड़ी है", { lang: "hi" })), [true, "यह:right मेरे:right पापा:right की:right गाड़ी:right है:right", ""]);
check("Hindi: a vowel sign is part of the word (का for की is wrong)", brief(match(HI, "यह मेरे पापा का गाड़ी है", { lang: "hi" })), [false, "यह:right मेरे:right पापा:right की:wrong(का) गाड़ी:right है:right", ""]);
check("Hindi: a word's last vowel slipped is close, not right", brief(match("मेरी बहन दिल्ली में रहती है।", "मेरी बहन दिल्ली में रहता है", { lang: "hi" })), [true, "मेरी:right बहन:right दिल्ली:right में:right रहती:close(रहता) है:right", ""]);

check("Hawaiian: a typed apostrophe is the ʻokina, at a word's start too", words("Hawai'i 'āina ʻO", "haw"), ["hawaiʻi", "ʻāina", "ʻo"]);
check("Hawaiian: typed with apostrophes, the sentence counts", brief(match("ʻO wai kou inoa?", "'O wai kou inoa", { lang: "haw" })), [true, "ʻO:right wai:right kou:right inoa:right", ""]);
check("Uzbek: o' and g' typed with any apostrophe are oʻ and gʻ", brief(match("Oʻzbek tilini oʻrganmoqchiman.", "O’zbek tilini o`rganmoqchiman", { lang: "uz" })), [true, "Oʻzbek:right tilini:right oʻrganmoqchiman:right", ""]);
check("elsewhere an apostrophe stays an apostrophe", words("Hawai'i", "en"), ["hawai'i"]);
check("Persian: a word joined by a zero-width non-joiner stays one word", words("من به خانه می\u200Cروم.", "nl"), ["من", "به", "خانه", "می\u200Cروم"]);
check("Armenian: the question mark inside a word leaves it one word, and the full stop goes", words("Ինչպե՞ս ես։ Վա՜յ, շա՛տ լավ է։", "hy"), ["ինչպես", "ես", "վայ", "շատ", "լավ", "է"]);
check("Armenian: its apostrophe ՚ is an apostrophe inside a word, and the abbreviation mark ՟ comes off", words("Ա՚պա ընկ՟ եմ։", "hy"), ["ա'պա", "ընկ", "եմ"]);
check("Armenian: said or typed without ՞, the word still counts", brief(match("Դուք անգլերեն խոսո՞ւմ եք։", "Դուք անգլերեն խոսում եք", { lang: "hy" })), [true, "Դուք:right անգլերեն:right խոսո՞ւմ:right եք:right", ""]);
check("Persian: said without its non-joiner, the word still counts, as without an accent", brief(match("من به خانه می\u200Cروم.", "من به خانه میروم", { lang: "nl" })), [true, "من:right به:right خانه:right می\u200Cروم:right", ""]);

const JA = ["私", "は", "学生", "です。"];
const JA_READINGS = [["私", "わたし"], ["学生", "がくせい"]];
check("Japanese: exact", brief(match(JA, "私は学生です", { lang: "ja" })), [true, "私:right は:right 学生:right です:right", ""]);
check("Japanese: a word with kanji said or typed in its reading counts", brief(match(JA, "わたしはがくせいです", { lang: "ja", readings: JA_READINGS })), [true, "私:right は:right 学生:right です:right", ""]);
check("Japanese: kanji and kana mixed", brief(match(JA, "私はがくせいです。", { lang: "ja", readings: JA_READINGS })), [true, "私:right は:right 学生:right です:right", ""]);
check("Japanese: without the readings, kana for kanji isn't the word", match(JA, "わたしはがくせいです", { lang: "ja" }).ok, false);
check("Japanese: a wrong particle is wrong", brief(match(JA, "私を学生です", { lang: "ja" })), [false, "私:right は:wrong(を) 学生:right です:right", ""]);
check("Japanese: a different word is wrong, even with a character in common", brief(match(JA, "私は先生です", { lang: "ja" })), [false, "私:right は:right 学生:wrong(先生) です:right", ""]);
check("Japanese: another ending (the wrong tense) is wrong", brief(match(["昨日", "ラーメン", "を", "食べました。"], "昨日ラーメンを食べます", { lang: "ja" })), [false, "昨日:right ラーメン:right を:right 食べました:wrong(食べます)", ""]);
check("Japanese: digits count as the kanji number", brief(match(["七時", "に", "起きます。"], "7時に起きます", { lang: "ja" })), [true, "七時:right に:right 起きます:right", ""]);
check("Japanese: full-width digits too", match(["十二時", "です。"], "１２時です", { lang: "ja" }).ok, true);
check("Japanese: one character slipped in a long word is close", brief(match(["写真", "を", "撮りました。"], "写真を撮りまた", { lang: "ja" })), [true, "写真:right を:right 撮りました:close(撮りまた)", ""]);
check("Japanese: kana voicing marks count (か is not が)", match(["猫", "が", "います。"], "猫かいます", { lang: "ja" }).ok, false);
check("Japanese: words as characters", words("私は、学生です。", "ja"), ["私", "は", "学", "生", "で", "す"]);
check("Chinese: exact", brief(match(["我们", "是", "学生。"], "我们是学生", { lang: "zh" })), [true, "我们:right 是:right 学生:right", ""]);
check("Chinese: a different word is wrong", brief(match(["我们", "是", "学生。"], "我们是老师", { lang: "zh" })), [false, "我们:right 是:right 学生:wrong(老师)", ""]);
check("Chinese: a word in the wrong place is an order slip", brief(match(["我", "明天", "去", "北京。"], "我去北京明天", { lang: "zh" })), [false, "我:right 明天:order(明天) 去:right 北京:right", ""]);
check("Chinese: an extra word is extra", brief(match(["我们", "是", "学生。"], "我们都是学生", { lang: "zh" })), [false, "我们:right 是:right 学生:right", "都"]);
check("Chinese: a word left out is missing", brief(match(["我们", "是", "学生。"], "我们学生", { lang: "zh" })), [false, "我们:right 是:missing 学生:right", ""]);
check("Chinese: the expected sentence comes back joined", match(["我们", "是", "学生。"], "我们是学生", { lang: "zh" }).expected, "我们是学生。");
// Cantonese (packs/starter-yue.json): a word written two ways is one word (match.js SAME_WORD), as Chrome's recognizer
// wrote Sinji's 唔該畀杯水我 (docs/speech-2026-10-28-cantonese); a standard written Chinese word never counts.
const WATER = ["唔該", "畀", "杯", "水", "我。"];
check("Cantonese: exact", brief(match(WATER, "唔該畀杯水我", { lang: "yue" })), [true, "唔該:right 畀:right 杯:right 水:right 我:right", ""]);
check("Cantonese: 比 for 畀 (give) counts, as Chrome heard it", brief(match(WATER, "唔該比杯水我", { lang: "yue" })), [true, "唔該:right 畀:right 杯:right 水:right 我:right", ""]);
check("Cantonese: 俾 for 畀 counts", match(WATER, "唔該俾杯水我", { lang: "yue" }).ok, true);
check("Cantonese: 左 for the aspect 咗 and 啊 for the particle 呀 count", brief(match(["你", "食", "咗", "飯", "未", "呀？"], "你食左飯未啊", { lang: "yue" })), [true, "你:right 食:right 咗:right 飯:right 未:right 呀:right", ""]);
check("Cantonese: 依家 for 而家 (now) counts", brief(match(["佢", "而家", "睇", "緊", "電視。"], "佢依家睇緊電視", { lang: "yue" })), [true, "佢:right 而家:right 睇:right 緊:right 電視:right", ""]);
check("Cantonese: standard written Chinese 他 for 佢 is another word", brief(match(["佢", "而家", "睇", "緊", "電視。"], "他而家睇緊電視", { lang: "yue" })), [false, "佢:wrong(他) 而家:right 睇:right 緊:right 電視:right", ""]);
check("Cantonese: 依 without 家 stays 依", match(["依然"], "而然", { lang: "yue" }).ok, false);
check("Cantonese: 依家 across two expected words, or heard with a space, is still 而家", [match(["依", "家"], "依家", { lang: "yue" }).ok, match(["依家"], "依 家", { lang: "yue" }).ok, match(["而家"], "依 家", { lang: "yue" }).ok], [true, true, true]);
check("Mandarin keeps 比: the spellings are Cantonese's", match(["他", "给", "我。"], "他比我", { lang: "zh" }).ok, false);

// Forgiving typing (Study's Type it, Practice's cards) compares both sides without accents (lang/index.js
// withoutAccents), and the letters a keyboard may lack count the same way: "di" for "đi" as "cafe" for "café".
const typed = (expected, text, lang) => brief(match(withoutAccents(expected), withoutAccents(text), { lang }));
check("forgiving: the plain letters", withoutAccents("đĐøØæÆłŁßẞœŒıðÐþÞ"), "dDoOaeAelLssSSoeOeidDthTh");
check("forgiving: Vietnamese tones and đ", typed("Tôi đi chợ.", "Toi di cho", "vi"), [true, "Toi:right di:right cho:right", ""]);
check("forgiving: Croatian đ", typed("Dođi sutra.", "Dodi sutra", "hr"), [true, "Dodi:right sutra:right", ""]);
check("forgiving: German ß", typed("Ich heiße Anna.", "Ich heisse Anna", "de"), [true, "Ich:right heisse:right Anna:right", ""]);
check("forgiving: Danish ø and æ", typed("Jeg spiser smørrebrød og æbler.", "Jeg spiser smorrebrod og aebler", "da"), [true, "Jeg:right spiser:right smorrebrod:right og:right aebler:right", ""]);
check("forgiving: Polish ł", typed("Łódź jest duża.", "Lodz jest duza", "pl"), [true, "Lodz:right jest:right duza:right", ""]);
check("forgiving: French œ", typed("Je mange un œuf.", "Je mange un oeuf", "fr"), [true, "Je:right mange:right un:right oeuf:right", ""]);
check("forgiving: Turkish ı", typed("Elma kırmızı.", "Elma kirmizi", "tr"), [true, "Elma:right kirmizi:right", ""]);
check("forgiving: Icelandic ð and þ", typed("Það er gott veður.", "Thad er gott vedur", "is"), [true, "Thad:right er:right gott:right vedur:right", ""]);
check("forgiving: Arabic tashkeel, the superscript alef and tatweel go", [withoutAccents("كَتَبَ"), withoutAccents("مَـدرسة"), withoutAccents("عِلْمٰ")], ["كتب", "مدرسة", "علم"]);
check("forgiving: Hebrew niqqud goes, the maqaf and sof pasuq stay", [withoutAccents("סֵפֶר"), withoutAccents("וְ־הוּא׃")], ["ספר", "ו־הוא׃"]);
check("forgiving: Persian's ZWNJ goes, as an accent does", withoutAccents("می‌روم"), "میروم");
check("forgiving: a script's own marks stay (virama, nukta, Thai tones, kana voicing and long marks)", ["क्या", "पिज़्ज़ा", "ไม่", "ベッド", "コーヒー"].map(withoutAccents), ["क्या", "पिज़्ज़ा", "ไม่", "ベッド", "コーヒー"]);
check("forgiving: Catalan's middle dot, Greek's tonos, Russian's ё", ["col·legi", "Ελλάδα", "ёлка"].map(withoutAccents), ["collegi", "Ελλαδα", "елка"]);
check("forgiving: another word is still wrong", typed("Tôi đi chợ.", "Toi an cho", "vi"), [false, "Toi:right di:wrong(an) cho:right", ""]);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
