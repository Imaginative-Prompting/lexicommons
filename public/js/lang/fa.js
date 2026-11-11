// Persian (lang/index.js has what each field means): standard written Persian, the Persian that's written and that
// device voices read, right to left and without its short vowels. A pack gives a word its vowel marks (zabar, zir, pish,
// tashdid, and the ezafe's zir) as its reading (lang/readings.js "vowels"), shown on the word until you know it; a word
// whose letters already say how it's read (را, این, آب) carries none. Persian's own letters are used (ی, ک), and the
// zero-width non-joiner keeps a word's parts apart without a space (می‌روم, کتاب‌ها). Verbs are headworded by their
// infinitive (رفتن for می‌روم, رفتم), and a pronoun ending under its word (حالت under حال, کتابم under کتاب).

export default {
  name: "Persian",
  locale: "fa-IR",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  direction: "rtl",
  readings: "vowels",
  vowelsWhereNeeded: true,
  ends: ["؟"],
  abbreviations: [],
  stray: ["اگر"],
  patterns: {
    "verb-last": { name: "The verb comes last", about: "A Persian sentence usually ends with its verb, with the object before it: مَن قَهوه می‌نوشَم (I drink coffee); فَردا بِه سَرِ کار می‌رَوَم.", after: [] },
    ezafe: { name: "Joining words: the ezafe", about: "The ezafe is an e or ye that links a noun, adjective, or word such as روی or بِدون to what follows; it is usually unwritten, but the app's readings show it as ِ or ـهٔ: اِسمِ مَن, خانهٔ بُزُرگ, رویِ میز, بِدونِ شِکَر, مُنتَظِرِ ما.", after: [] },
    ra: { name: "را: the one it's done to", about: "را after an object says it's a particular one (کِلیدهایَم را پِیدا نِمی‌کُنَم: I can't find my keys); a general object takes none: قَهوه می‌نوشَم.", after: ["verb-last"] },
    "no-articles": { name: "No “the”; یِک or ـی for “a”", about: "Persian has no word for the; a bare noun can be definite from context (کِتاب رویِ میز اَست), یِک means one or a, and the suffix ـی means a or some: یِک کِتاب, کِتابی.", after: [] },
    present: { name: "The present: می, the stem, an ending", about: "Most present-tense verbs are می, the present stem and an ending for who: می‌رَوَم, می‌رَوی, می‌رَوَد, می‌رَویم; context lets the same form mean go, am going, or, with a future time word, will go.", after: [] },
    past: { name: "The past: the past stem and an ending", about: "The past is the past stem (the infinitive without ن) and an ending for who; he or she has none: رَفتَم (I went), خُوردیم (we ate), دیر کَرد (it was late).", after: ["present"] },
    "present-future": { name: "Later: the present with a time word", about: "Everyday Persian says what will happen with the present and a word for when: فَردا می‌رَوَم (I'll go tomorrow); آخَرِ هَفته بِه دَریا می‌رَویم.", after: ["present"] },
    subjunctive: { name: "Want, must, can, purpose: بـ and the stem", about: "After می‌خواهَم, بایَد and می‌تَوانَم, and in many clauses English makes with “to,” Persian normally uses the present subjunctive: بـ + the present stem + an ending, written بـ and read بِـ in بِرَوَم and بِخَرَم but بُـ in بُخورَم (تا نان بِخَرَم); in a compound verb the light verb changes and بـ is often absent (تَمیز کُنَم).", after: ["present"] },
    negation: { name: "Not: نَـ", about: "نَـ joined to the front of a verb says not, and می becomes نِمی: نِمی‌دانَم (I don't know), نَرَفتَم (I didn't go); is not is نیست.", after: ["present"] },
    question: { name: "Questions", about: "A yes/no question keeps a statement's order and only the voice rises (اِنگِلیسی صُحبَت می‌کُنی؟), and formal آیا may begin it; a question word stays where the answer would be: کُجا زِندِگی می‌کُنی؟", after: [] },
    "pronoun-endings": { name: "Endings for my, your, his or her: ـَم, ـَت, ـَش", about: "My, your, and his or her can be the endings ـَم (-am), ـَت (-at), and ـَش (-ash) on a noun (کِتابَم, اِسمَت, ماشینَش); the same endings can stand for an object: دیدَمَش (I saw him or her).", after: [] },
    "copula-ast": { name: "Is: اَست, and endings for am and are", about: "اَست means is; short forms for am and are can attach to the preceding word (خَسته‌اَم: I am tired; خوابَند: they are asleep), while full forms also occur (دانِشجو هَستَم). After a vowel, اَست often contracts, as in کُجاست.", after: [] },
    plural: { name: "More than one: ها", about: "ها makes most nouns plural (کِتاب‌ها), and ان some words for people (دوستان); after a number the noun stays singular (دُو بَرادَر), and an inanimate plural often takes a singular verb, although plural agreement also occurs.", after: [] },
    have: { name: "Having: داشتَن", about: "داشتَن (to have) takes the endings like other verbs, without می in the present: دارَم (I have), داریم (we have), نَدارَم (I don't have).", after: ["present"] },
    adjective: { name: "Describing words come after", about: "An adjective comes after its noun, joined by the ezafe, and never changes: آپارتِمانِ کوچَک (a small apartment), کَفش‌هایِ نَو (new shoes).", after: ["ezafe"] },
    imperative: { name: "Asking someone to do something", about: "A request normally uses بـ with the present stem; its vowel follows the verb (بِبَند، بُخور), and some common verbs are irregular (بیا).", after: ["present"] },
    "compound-verbs": { name: "Verbs of two words", about: "Many Persian verbs are a noun or adjective with کَردَن (to do), زَدَن (to hit) or شُدَن (to become): کار کَردَن (to work), زَنگ زَدَن (to call), صُحبَت کَردَن (to speak).", after: ["present"] },
    demonstrative: { name: "This and that: این, آن", about: "این (this) and آن (that) stay unchanged before a noun, even a plural (این آپارتِمان, این کِتاب‌ها); used alone, they can take ها: این‌ها (these), آن‌ها (those or they).", after: [] },
    prepositions: { name: "بِه، دَر، اَز، با", about: "Little words come before what they're about: بِه (to), دَر (in), اَز (from), با (with); some fixed place expressions omit a preposition, as in سَرِ کار می‌رَوَم.", after: [] },
    "subject-omission": { name: "The verb says who", about: "Verb endings show the subject, so Persian often leaves its pronoun out: می‌رَوَم means I go and می‌رَویم means we go.", after: ["present"] },
    existential: { name: "There is and there are", about: "Persian can put a place first and then the thing with اَست, هَست or نیست: دَر یَخچال شیر نیست; اینجا یِک داروخانه هَست؟", after: ["copula-ast", "prepositions"] },
    duration: { name: "How long something has been happening", about: "یِک سال اَست کِه فارسی یاد می‌گیرَم literally says it is one year that I learn Persian, for I've been learning Persian for a year.", after: ["present", "copula-ast"] },
    zwnj: { name: "Writing one word with a half-space", about: "A zero-width non-joiner keeps parts of one written word visually separate without making a space: می‌رَوَم, کِتاب‌ها, خَسته‌اَم, صورَت‌حِساب.", after: ["present", "plural"] },
  },
};
