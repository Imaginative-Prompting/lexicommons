// Working out which language a deck teaches, from what it says about itself and what's in it. In order of trust: a
// template that reads a field aloud in a locale, a field or deck named for a language, the script, then the letters and
// common words. It answers with how sure it is: unsure, the page asks. Data is short and local, because this runs in the
// parser's worker, which never loads the language registry. test-anki.mjs holds every code here to the registry's.

// code: [its names, in English and in itself], its special letters, its common little words.
const TABLE = {
  en: ["english", "", "the a an of to and in is that it you for with on are this be have not was at by from they we or his her what your my i he she does how where who when why there can would"],
  nl: ["dutch nederlands flemish vlaams", "ĳ", "de het een en van ik je dat is niet op te zijn er maar met voor aan hij ze wat om ook naar dit bij"],
  de: ["german deutsch", "ßäöü", "der die das und ist nicht ich du er sie es ein eine zu mit auf für von den dem im wir aber auch wie"],
  fr: ["french français francais", "çœéèêàù", "le la les un une et des de du est que je tu il elle nous vous pas pour dans sur avec ce qui au"],
  es: ["spanish español espanol castellano", "ñ¿¡áéíóú", "el la los las un una y de que en es no por con para se lo como su pero más yo tú"],
  it: ["italian italiano", "àèéìòù", "il lo la i gli le un una e di che è in non per con si come ma più sono ho del della"],
  pt: ["portuguese português portugues brazilian", "ãõçáâêó", "o a os as um uma e de que em é não para com se por do da mais como mas você eu"],
  sv: ["swedish svenska", "åäö", "och att det en ett är jag du han hon vi de inte på med för som av till den har kan"],
  nb: ["norwegian norsk bokmål bokmal", "æøå", "og i det er en et jeg du han hun vi ikke på med for som av til den har kan å"],
  da: ["danish dansk", "æøå", "og i det er en et jeg du han hun vi ikke på med for som af til den har kan at"],
  fi: ["finnish suomi", "äö", "ja on ei että se minä sinä hän me he olen olet oli mitä kuin mutta tämä tuo myös niin"],
  pl: ["polish polski polskie", "ąćęłńóśźż", "i w nie na to że się jest z do jak a ja ty on ona my co ale tak po"],
  cs: ["czech čeština cestina česky", "čďěňřšťůž", "a je to se v na že jsem jsi ale jak co tak ne by s do pro"],
  sk: ["slovak slovenčina slovencina", "ľĺŕäôčďňšťž", "a je to sa v na že som si ale ako čo tak nie by s do pre"],
  hu: ["hungarian magyar", "őűáéíóöúü", "a az és hogy nem is egy van ez én te ő mi ti de meg csak"],
  ro: ["romanian română romana", "ăâîșț", "și în de la nu un o că este eu tu el ea pe cu mai ce sunt"],
  tr: ["turkish türkçe turkce", "ğışçöü", "ve bir bu için ile ben sen o biz siz ne gibi çok var yok ama da de"],
  id: ["indonesian bahasa indonesia", "", "yang dan di itu dengan untuk tidak ini dari saya kamu dia ada ke akan pada juga"],
  ms: ["malay melayu", "", "yang dan di itu dengan untuk tidak ini dari saya awak dia ada ke akan pada juga"],
  vi: ["vietnamese tiếng việt tieng viet", "ăâđêôơư", "và của là có không một cho này tôi bạn anh em những được"],
  tl: ["tagalog filipino", "", "ang ng sa na at ay ako ikaw siya kami tayo hindi may mga ito"],
  la: ["latin latina", "", "et in est non ad ut cum sed qui quod hic ille ego tu"],
  ca: ["catalan català catala", "çàèéíòóú", "el la els les un una i de que en és no per amb es com però jo"],
  eu: ["basque euskara", "", "eta da ez bat du dut naiz zara hau hori ere baina"],
  gl: ["galician galego", "ñáéíóú", "o a os as un unha e de que en é non para con se por do da"],
  hr: ["croatian hrvatski", "čćđšž", "i u je na da se ne za s što ali kako ja ti on ona mi"],
  bs: ["bosnian bosanski", "čćđšž", "i u je na da se ne za s što ali kako ja ti on ona mi"],
  sl: ["slovenian slovene slovenščina", "čšž", "in v je na da se ne za s kaj ali kako jaz ti on ona mi"],
  et: ["estonian eesti", "äõöü", "ja on ei see et ma sa ta me te nad kui aga ka mis"],
  lv: ["latvian latviešu", "āčēģīķļņšūž", "un ir ne tas es tu viņš viņa mēs jūs ar uz par kā"],
  lt: ["lithuanian lietuvių", "ąčęėįšųūž", "ir yra ne tai aš tu jis ji mes jūs su į kad kaip"],
  sq: ["albanian shqip", "çë", "dhe në është një të për me unë ti ai ajo ne nuk që"],
  is: ["icelandic íslenska", "ðþæö", "og að er í á það ég þú hann hún við ekki með fyrir"],
  ga: ["irish gaeilge", "", "agus an na is ar i tá sé sí mé tú le go ní"],
  cy: ["welsh cymraeg", "ŵŷ", "a ac yn y yr mae i o ar dw i ti fe hi ni chi"],
  gd: ["scottish gaelic gàidhlig", "àèìòù", "agus an na is air tha e i mi thu le gu chan"],
  af: ["afrikaans", "ê", "die en van is in dat nie ek jy hy sy ons met vir op te"],
  eo: ["esperanto", "ĉĝĥĵŝŭ", "la kaj de en estas mi vi li ŝi ni ne al por kun"],
  sw: ["swahili kiswahili", "", "na ya wa kwa ni la za katika mimi wewe yeye sisi hii"],
  mt: ["maltese malti", "ċġħż", "u ta il li f jien int hu hi aħna ma biex"],
  lb: ["luxembourgish lëtzebuergesch", "ëéä", "an de d' vun ass net ech du hien si mir mat fir"],
  fy: ["frisian frysk", "âêôûú", "de it in en fan is net ik do hy sy wy mei foar"],
  br: ["breton brezhoneg", "ñù", "ha an ar eo e da war gant me te hi ni"],
  ht: ["haitian creole kreyòl kreyol", "òè", "ak nan yon li pou mwen ou nou yo pa se sa"],
  az: ["azerbaijani azərbaycan", "əğışçöü", "və bir bu üçün ilə mən sən o biz siz nə çox var"],
  uz: ["uzbek o'zbek", "", "va bir bu uchun bilan men sen u biz siz nima juda bor"],
  haw: ["hawaiian ʻōlelo hawaiʻi", "ʻāēīōū", "ka ke ā me i o he ua au oe ia"],
  kmr: ["kurdish kurmanji kurdî", "êîûşç", "û di de ez tu ew em hûn ji bi ku ne"],
  ru: ["russian русский", "ыэё", "и в не на я что он она с как это мы вы они а"],
  uk: ["ukrainian українська", "іїєґ", "і в не на я що він вона з як це ми ви вони а"],
  bg: ["bulgarian български", "ъ", "и в не на аз че той тя с как това ние вие те а"],
  be: ["belarusian беларуская", "ўі", "і ў не на я што ён яна з як гэта мы вы яны а"],
  mk: ["macedonian македонски", "ќѓѕјљњ", "и во не на јас дека тој таа со како ова ние вие"],
  sr: ["serbian српски srpski", "ђћљњџј", "и у је на да се не за с што али како ја ти он"],
  kk: ["kazakh қазақша", "әғқңөұүһ", "және бұл мен сен ол біз сіз не бар жоқ"],
  ar: ["arabic العربية عربي", "", "في من على إلى أن هذا ما لا هو هي"],
  fa: ["persian farsi فارسی", "پچژگی", "در از به که این را با است من تو"],
  ur: ["urdu اردو", "ٹڈڑںےھ", "میں کا کی کے ہے اور سے کو یہ وہ"],
  ps: ["pashto پښتو", "ټډړږښ", "په د او چې دا زه ته هغه"],
  ckb: ["sorani kurdish کوردی", "ڕڵێۆە", "لە و بە ئەم من تۆ"],
  he: ["hebrew עברית", "", "של את על זה אני אתה הוא היא לא כן"],
  yi: ["yiddish ייִדיש", "װײױ", "דער די דאס און איז אין ניט איך"],
  hi: ["hindi हिन्दी हिंदी", "", "है में की के और का को से यह वह नहीं"],
  mr: ["marathi मराठी", "ळ", "आहे आणि मी तू तो ती हे ते नाही"],
  ne: ["nepali नेपाली", "", "छ र म तिमी ऊ यो त्यो होइन"],
  gu: ["gujarati ગુજરાતી", "", ""],
  pa: ["punjabi panjabi ਪੰਜਾਬੀ", "", ""],
  el: ["greek ελληνικά", "", "και το η ο να είναι δεν για με θα"],
  hy: ["armenian հայերեն", "", ""],
  ka: ["georgian ქართული", "", ""],
  th: ["thai ไทย ภาษาไทย", "", ""],
  ko: ["korean 한국어 조선말", "", ""],
  ja: ["japanese 日本語 nihongo", "", ""],
  zh: ["chinese mandarin 中文 汉语 普通话", "", ""],
  "zh-Hant": ["traditional chinese 繁體 繁体 taiwanese", "", ""],
  yue: ["cantonese 粵語 粤语 廣東話", "", ""],
};

export const DETECTABLE = Object.keys(TABLE);

const WORDS = new Map(Object.entries(TABLE).map(([code, [, , words]]) => [code, new Set(words.split(" ").filter(Boolean))]));

const SCRIPTS = [
  [/[぀-ヿ]/u, "kana"],
  [/[가-힯ᄀ-ᇿ]/u, "hangul"],
  [/[一-鿿㐀-䶿]/u, "han"],
  [/[Ѐ-ӿ]/u, "cyrillic"],
  [/[؀-ۿݐ-ݿ]/u, "arabic"],
  [/[֐-׿]/u, "hebrew"],
  [/[ऀ-ॿ]/u, "devanagari"],
  [/[઀-૿]/u, "gujarati"],
  [/[਀-੿]/u, "gurmukhi"],
  [/[฀-๿]/u, "thai"],
  [/[Ͱ-Ͽἀ-῿]/u, "greek"],
  [/[԰-֏]/u, "armenian"],
  [/[Ⴀ-ჿ]/u, "georgian"],
  [/\p{Script=Latin}/u, "latin"],
];

// A script with one language: certain. Those with several: decided below.
const ONE = { kana: "ja", hangul: "ko", gujarati: "gu", gurmukhi: "pa", thai: "th", greek: "el", armenian: "hy", georgian: "ka" };

const scriptOf = (text) => {
  // Kana first, since Japanese is written with Chinese characters too.
  for (const [pattern, name] of SCRIPTS) if (pattern.test(text)) return name;
  return "";
};

const SIMPLIFIED = /[这们说国来时对个门见关现经发东车书学习话语长马鸟鱼]/;
const TRADITIONAL = /[這們說國來時對個門見關現經發東車書學習話語長馬鳥魚]/;
const CANTONESE = /[係嘅咗唔佢哋喺冇嗰啲]/;

const tokensOf = (text) => text.toLowerCase().split(/[\s.,;:!?¿¡"'“”‘’()\[\]{}…/\\-]+/).filter(Boolean);

/** What a side's sample looks like: { code, sure, score, second }, code null when it can't be told at all. */
export function languageOfSample(texts) {
  const sample = texts.filter(Boolean);
  if (!sample.length) return { code: null, sure: false, score: 0 };
  const counts = new Map();
  for (const text of sample) {
    const script = scriptOf(text);
    if (script) counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { code: null, sure: false, score: 0 };
  const hasKana = counts.has("kana");
  const script = hasKana && counts.get("kana") >= sample.length * 0.05 ? "kana" : ranked[0][0];
  if (ONE[script]) return { code: ONE[script], sure: true, score: 1 };
  const all = sample.join("\n");
  if (script === "han") {
    if (CANTONESE.test(all)) return { code: "yue", sure: false, score: 0.6 };
    const simple = (all.match(new RegExp(SIMPLIFIED.source, "g")) ?? []).length;
    const traditional = (all.match(new RegExp(TRADITIONAL.source, "g")) ?? []).length;
    if (simple > traditional * 3 && simple >= 2) return { code: "zh", sure: true, score: 0.9 };
    if (traditional > simple * 3 && traditional >= 2) return { code: "zh-Hant", sure: true, score: 0.9 };
    return { code: "zh", sure: false, score: 0.5 };
  }
  // Word and letter counts over this script's languages.
  const candidates = {
    cyrillic: ["ru", "uk", "bg", "be", "mk", "sr", "kk"],
    arabic: ["ar", "fa", "ur", "ps", "ckb"],
    hebrew: ["he", "yi"],
    devanagari: ["hi", "mr", "ne"],
    latin: Object.keys(TABLE).filter((code) => TABLE[code][2] && /\p{Script=Latin}/u.test(TABLE[code][2])),
  }[script];
  if (!candidates) return { code: null, sure: false, score: 0 };
  const tokens = sample.flatMap(tokensOf);
  const scores = candidates.map((code) => {
    const words = WORDS.get(code);
    const hits = tokens.filter((token) => words.has(token)).length;
    const letters = TABLE[code][1];
    let marks = 0;
    if (letters) for (const c of all.toLowerCase()) if (letters.includes(c)) marks++;
    return { code, score: hits / Math.max(1, tokens.length) + (0.3 * marks) / Math.max(1, all.length) };
  });
  scores.sort((a, b) => b.score - a.score);
  const [first, second] = scores;
  if (first.score <= 0) return { code: null, sure: false, score: 0 };
  // Sure only with a real count and a clear lead: a list of nouns often has neither.
  const sure = tokens.length >= 20 && first.score >= 0.06 && first.score >= second.score * 2;
  return { code: first.code, sure, score: first.score, second: second?.code };
}

/**
 * How much a short text shows itself to be in a language: how many of that language's common little words are in it, and one more when it has
 * one of the language's own letters. 0 says nothing (a noun alone shows neither); it's for telling a card's two sides apart by comparing two
 * languages on the same text, never for naming a text's language.
 */
export function leansTo(text, code) {
  const row = TABLE[code];
  if (!row || typeof text !== "string") return 0;
  const words = WORDS.get(code);
  const hits = tokensOf(text).filter((token) => words.has(token)).length;
  return hits + (row[1] && [...text.toLowerCase()].some((c) => row[1].includes(c)) ? 1 : 0);
}

const NAME_TO_CODE = (() => {
  const out = [];
  for (const [code, [names]] of Object.entries(TABLE)) {
    // Two-word names first ("traditional chinese", "scottish gaelic"), so the longer one wins.
    for (const name of names.match(/traditional chinese|scottish gaelic|haitian creole|sorani kurdish|bahasa indonesia|tiếng việt|tieng viet|ʻōlelo hawaiʻi|\S+/g) ?? []) if (name.length >= 2) out.push([name, code]);
  }
  return out.sort((a, b) => b[0].length - a[0].length);
})();

const CODE_OF_LOCALE = { nl: "nl", de: "de", en: "en", fr: "fr", es: "es", it: "it", pt: "pt", sv: "sv", nb: "nb", no: "nb", nn: "nb", da: "da", fi: "fi", pl: "pl", cs: "cs", sk: "sk", hu: "hu", ro: "ro", tr: "tr", id: "id", ms: "ms", vi: "vi", tl: "tl", fil: "tl", ca: "ca", eu: "eu", gl: "gl", hr: "hr", bs: "bs", sl: "sl", et: "et", lv: "lv", lt: "lt", sq: "sq", is: "is", ga: "ga", cy: "cy", af: "af", sw: "sw", ru: "ru", uk: "uk", bg: "bg", be: "be", mk: "mk", sr: "sr", kk: "kk", ar: "ar", fa: "fa", ur: "ur", ps: "ps", he: "he", iw: "he", yi: "yi", hi: "hi", mr: "mr", ne: "ne", gu: "gu", pa: "pa", el: "el", hy: "hy", ka: "ka", th: "th", ko: "ko", ja: "ja", zh: "zh", yue: "yue" };

/** A template's TTS locale ("nl_NL", "zh-TW") as a language code, or null. */
export function codeOfLocale(locale) {
  if (typeof locale !== "string") return null;
  const lower = locale.toLowerCase().replace("-", "_");
  if (lower === "zh_tw" || lower === "zh_hk") return lower === "zh_hk" ? "yue" : "zh-Hant";
  return CODE_OF_LOCALE[lower.split("_")[0]] ?? null;
}

/** Languages a name mentions, as whole words (a deck's or a field's), in the order it names them. */
export function languagesNamed(text) {
  if (typeof text !== "string" || !text) return [];
  const lower = text.toLowerCase();
  const found = [];
  for (const [name, code] of NAME_TO_CODE) {
    // Han, kana and Hangul have no spaces to mark a word; the others need a word's edges.
    const at = /[぀-鿿가-힯]/.test(name) ? lower.indexOf(name) : lower.search(new RegExp(`(?<![\\p{L}\\p{M}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{M}])`, "u"));
    if (at >= 0 && !found.some((entry) => entry.code === code)) found.push({ code, at });
  }
  return found.sort((a, b) => a.at - b.at).map((entry) => entry.code);
}

/**
 * Which language a deck teaches, and which side is which:
 *   { language, from, swap, sure, unsureAbout } swap: its fronts are in `from`, so its sides change places; language
 *   null when it can't be told; unsureAbout: "language" or "side", what to ask.
 * sides: { fronts, backs } text samples; hints: { frontTts, backTts, frontNames, backNames, deckNames }, what its
 * templates and names say.
 */
export function detectLanguage({ fronts, backs }, { frontTts = null, backTts = null, frontNames = [], backNames = [], deckNames = [] } = {}) {
  const front = languageOfSample(fronts);
  const back = languageOfSample(backs);
  const told = (tts, names, seen) => tts ?? names[0] ?? (seen.sure ? seen.code : null);
  const f = told(frontTts, frontNames, front);
  const b = told(backTts, backNames, back);
  const named = deckNames.filter((code) => code !== "en");
  const done = (language, from, swap, sure, unsureAbout = null) => ({ language, from: from && from !== language ? from : language === "en" ? null : "en", swap, sure, unsureAbout });
  // Both sides told apart: the one that isn't English is the one being learned, or the one the deck is named for.
  if (f && b && f !== b) {
    if (b === "en") return done(f, "en", false, true);
    if (f === "en") return done(b, "en", true, true);
    if (named.includes(b) && !named.includes(f)) return done(b, f, true, true);
    if (named.includes(f) && !named.includes(b)) return done(f, b, false, true);
    // Two languages and nothing to say which: a deck's fronts are what it asks about.
    return done(f, b, false, false, "side");
  }
  // One side told: the other's taken from the deck's name or its likeliest reading.
  if (f && f !== "en") return done(f, back.code && back.code !== f ? back.code : "en", false, Boolean(back.code === "en" || frontTts || frontNames.length));
  if (b && b !== "en") return done(b, front.code && front.code !== b ? front.code : "en", true, Boolean(front.code === "en" || backTts || backNames.length));
  // English on the side we can tell: the other side, by its name or its likeliest guess.
  const other = f === "en" ? back : b === "en" ? front : null;
  const swap = f === "en";
  if (other) {
    if (named[0]) return done(named[0], "en", swap, true);
    if (other.code && other.code !== "en") return done(other.code, "en", swap, false, "language");
    return { language: null, from: "en", swap, sure: false, unsureAbout: "language" };
  }
  // Neither side told: the deck's own name is the next best word, with its sides as they are unless the back reads like it.
  if (named[0]) return done(named[0], "en", back.code === named[0] && front.code !== named[0], true);
  const guess = front.code && front.code !== "en" ? front.code : back.code && back.code !== "en" ? back.code : null;
  return guess ? done(guess, "en", guess !== front.code, false, "language") : { language: null, from: "en", swap: false, sure: false, unsureAbout: "language" };
}
