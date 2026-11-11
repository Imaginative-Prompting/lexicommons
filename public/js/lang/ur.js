// Urdu (lang/index.js has what each field means), written right to left in Nastaliq and without its short vowels. A
// pack gives a word its vowel marks (zabar, zer, pesh, tashdid) as its reading (lang/readings.js "vowels"), shown on the
// word until you know it; a word whose letters already say how it's read (کا, ہے) carries none. Urdu's own letters
// are used (ی, ے, ک, ہ, ھ, ں, ٹ, ڈ, ڑ), and a sentence ends with ۔ or ؟. Verbs are headworded by their infinitive
// (جانا for جاتا ہوں, گیا), nouns and adjectives by their masculine singular, and a possessive like میرا under its own
// headword (میرا for میری, میرے).

export default {
  name: "Urdu",
  locale: "ur-PK",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  direction: "rtl",
  readings: "vowels",
  vowelsWhereNeeded: true,
  ends: ["؟", "۔"],
  abbreviations: [],
  stray: ["تاکہ"],
  patterns: {
    "verb-last": { name: "The verb comes last", about: "An Urdu sentence usually ends with its verb, with the object before it: مَیں چائے پِیتا ہوں (I drink tea); کَل مَیں بَس سے کام پَر جاؤں گا.", after: [] },
    postpositions: { name: "Little words come after: میں, پَر, سے", about: "Where English has in, on, from and with before a word, Urdu puts them after it: گَھر میں (in the house), میز پَر (on the table), بَس سے (by bus); some take کے before them, while a pronoun uses its matching possessive form: چِینی کے بَغَیر (without sugar), میرے ساتھ (with me).", after: [] },
    "ka-ki-ke": { name: "Of and 's: کا, کی, کے", about: "کا, کی or کے links one noun or phrase to another, often like English 's or of, and agrees with what follows: اَبُّو کی گاڑی (Dad's car; گاڑی is feminine), رات کا کھانا (dinner), چُھٹّی کے دِن (on a day off).", after: ["gender"] },
    gender: { name: "Masculine and feminine", about: "Every noun is masculine or feminine, and many adjectives and verb forms agree with it: بَڑا باوَرچی خانہ, نَئی گاڑی; a man says مَیں جاتا ہوں and a woman says مَیں جاتی ہوں.", after: [] },
    hona: { name: "Am, is and are: ہوں, ہو, ہے, ہیں", about: "ہوں goes with مَیں, ہو with تُم, ہے with a singular subject, and ہیں with a plural subject or one respected person; they normally come last: مَیں طالِبِ عِلم ہوں; تُم کَیسے ہو؟; مَوسَم ٹَھنڈا ہے; اَبُّو اِنجِینِئَر ہیں.", after: ["verb-last"] },
    present: { name: "The present: -تا ہے", about: "The -تا, -تی or -تے form with ہوں, ہو, ہے or ہیں describes habits, repeated actions and general states: مَیں چائے پِیتا ہوں; اَمّی ہَسپَتال میں کام کَرتی ہیں. An action happening right now uses رَہا, رَہی or رَہے instead.", after: ["hona", "gender"] },
    progressive: { name: "Going on now: رَہا ہے", about: "Something happening right now is the stem with رَہا, رَہی or رَہے and ہوں, ہے or ہیں: مَیں چابیاں ڈُھونڈ رَہا ہوں (I'm looking for the keys).", after: ["present"] },
    past: { name: "The past: گَیا, کھایا", about: "Completed actions use a perfective form that often agrees with a masculine or feminine singular or plural noun: کھایا, دیکھی, خَرِیدے; common verbs may be irregular, such as گَیا. تھا, تھی, تھے and تھیں are the past forms of ہونا.", after: ["gender"] },
    ne: { name: "نے: who did it, in the past", about: "With many completed transitive verbs, the doer takes نے; the verb agrees with an unmarked object, but normally defaults to masculine singular when the object takes کو.", after: ["past"] },
    future: { name: "Later: -گا, -گی, -گے", about: "The future uses a future stem followed by گا, گی or گے, agreeing with the subject: مَیں جاؤں گا; بارِش ہو گی; ہَم جائیں گے.", after: ["gender"] },
    negation: { name: "Not: نَہِیں", about: "نَہِیں comes just before the verb (مَیں کافی نَہِیں پِیتا), and the final ہوں, ہو, ہے or ہیں is often omitted after it; مَت or نَہ is used for don't in a request.", after: ["verb-last"] },
    question: { name: "Questions: کیا, or a question word in place", about: "A yes/no question can start with کیا and keeps a statement's order (کیا آپ اَنگریزی بولتے ہیں؟); a question word sits where its answer would: آپ کہاں رَہتے ہیں؟", after: [] },
    aap: { name: "You, politely: آپ", about: "آپ is polite you for someone you do not know well or someone you respect; when آپ itself is the subject, its verb is plural: آپ کَیسے ہیں؟ آپ اَنگریزی بولتے ہیں؟; تُم is for friends.", after: ["hona"] },
    ko: { name: "کو: to, and a particular one", about: "کو after a person says to or for (مُجھ کو, مُجھے: to me), marks some animate or specific objects (عَلی کو بُلائیں: call Ali), and says on for a day or time: ہَفتے کو (on Saturday). Urdu also uses this form where English has a subject: مُجھے مَعلُوم ہے (I know), مُجھے پانی چاہِیے (I need water).", after: ["postpositions"] },
    possessive: { name: "My, your, one's own: میرا, آپ کا, اَپنا", about: "میرا (my), ہَمارا (our) and آپ کا (your) come first and agree with what's owned, like کا: میرا بھائی, میری بَہَن, میرے دوست. اَپنا means one's own and refers back to the subject: مَیں اَپنی چابیاں ڈُھونڈ رَہا ہوں.", after: ["ka-ki-ke"] },
    having: { name: "Having: کے پاس, ہے/ہیں", about: "Use کے پاس for having a thing: میرے پاس وَقت ہے (I have time). Family and other close relationships commonly use a possessive with ہے or ہیں: میرے دو بھائی ہیں (I have two brothers).", after: ["possessive", "postpositions", "hona"] },
    "need-must": { name: "Need to, have to: چاہِیے, -نا ہے", about: "چاہِیے after a noun or verb says need or should (مُجھے جانا چاہِیے: I should go), and an infinitive with ہے says have to: مُجھے کِچَن صاف کَرنا ہے.", after: ["ko"] },
    sakna: { name: "Can: سَکنا", about: "The verb's stem with سَکنا says can, and سَکنا takes the endings: ہَم ٹَیکسی لے سَکتے ہیں (we can take a taxi).", after: ["present"] },
    imperative: { name: "Asking someone to do something", about: "A polite request is the stem with -یں or -یے (بَند کَریں, لائیں, بَتائیے), a friendly one with -و (آؤ: come); بَراہِ کَرَم says please.", after: ["aap"] },
    "compound-verbs": { name: "Verbs of two words", about: "Many verbs are a noun or adjective with کَرنا (to do) or ہونا (to be): کام کَرنا (to work), فون کَرنا (to call), صاف کَرنا (to clean).", after: ["present"] },
    oblique: { name: "Before a postposition: a changed form", about: "Before a postposition, and when an infinitive gives a purpose, some nouns, adjectives, possessives and infinitives change form: چھوٹا فلَیٹ → چھوٹے فلَیٹ میں; ہَفتہ → ہَفتے کو; میرا → میرے ساتھ; کھانا → کھانے کا وَقت; خَرِیدنا → خَرِیدنے بازار جانا.", after: ["gender", "postpositions"] },
    respect: { name: "Respect: ہیں for one person", about: "One respected person commonly takes ہیں rather than ہے: اَبُّو اِنجِینِئَر ہیں; اَمّی کام کَرتی ہیں; دادی اِنتِظار کَر رَہی ہیں.", after: ["hona"] },
    "no-articles": { name: "No a or the", about: "Urdu has no separate words for a, an or the; context supplies them: مَیں طالِبِ عِلم ہوں (I'm a student); میز پَر کِتابیں ہیں.", after: [] },
    plural: { name: "More than one", about: "A regular masculine noun ending in -ا changes it to -ے (جُوتا, جُوتے; اَنڈا, اَنڈے), a regular feminine noun ending in ی changes it to یاں (چابی, چابیاں), and other plurals may add -یں or stay unchanged: کِتابیں, دوست.", after: ["gender"] },
    adjective: { name: "Adjectives before nouns and before ہے", about: "An adjective comes before a noun it directly describes (چھوٹا فلَیٹ); as a predicate it comes before the final copula (فلَیٹ مَہنگا ہے). Regular adjectives ending in -ا agree: چھوٹا, چھوٹی, چھوٹے.", after: ["gender"] },
  },
};
