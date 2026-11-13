// Each language's common little words and its own letters, by code, and how much a short text leans to a language (leansTo). Pure, with no
// registry: the study path reads them to tell a plain card's two sides apart (study/deck.js), and the Anki import's worker to work out which
// language a deck teaches (anki/language.js). Moved here from anki/language.js on 12 Nov 2026, so the app's shell carries no file of the
// importer's (anki-check). test-anki.mjs holds every code here to the registry's.

// code: [its names, in English and in itself], its special letters, its common little words.
export const TABLE = {
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

export const WORDS = new Map(Object.entries(TABLE).map(([code, [, , words]]) => [code, new Set(words.split(" ").filter(Boolean))]));

export const tokensOf = (text) => text.toLowerCase().split(/[\s.,;:!?¿¡"'“”‘’()\[\]{}…/\\-]+/).filter(Boolean);

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
