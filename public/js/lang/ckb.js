// Sorani Kurdish (Central Kurdish; lang/index.js has what each field means): standard written Sorani as used in the
// Kurdistan Region of Iraq, right to left in the Kurdish Arabic-script alphabet. Its vowels ا، ە، ێ، ۆ، و، وو، ی are
// letters; only the short i (bizroke) is never written, so a word with one carries its pronunciation in the Kurdish
// Latin alphabet as its reading (lang/readings.js "roman": مرۆڤ, mirov), over the word until you know it, and every
// other word carries none. Kurdish ە is always the vowel and ه
// the consonant h, and Kurdish ێ، ۆ، ڵ، ڕ، ڤ، ک، ی، گ، چ، پ، ژ are used instead of Arabic or Persian look-alikes.
// Prefixes and suffixes join their host (دەچم، ناوت، کتێبەکە); independent لە، بە and بۆ are separate, لەگەڵ is one
// word, and لە … دا is split around its noun. A ZWNJ (U+200C) is retained only where standard digital spelling calls
// for a half-space; none of the ordinary joins in this starter needs one. Izafe is written -ی after a bare noun,
// -ێکی with an indefinite noun, and in its -ە forms through definite and demonstrative groups. Verbs are headworded
// by the infinitive, nouns by the bare singular, and adjectives by their base form.

export default {
  name: "Sorani Kurdish",
  locale: "ckb-IQ",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  direction: "rtl",
  readings: "roman",
  ends: ["؟"],
  abbreviations: ["د.","پ.د.","پ.ی.د."],
  stray: [],
  patterns: {
    "verb-last": { name: "The verb usually comes last", about: "The object and other details normally come before the verb: من قاوە ناخۆمەوە (I don't drink coffee); بۆ بازاڕ دەچم (I'm going to the market).", after: [] },
    izafe: { name: "Joining a noun to what follows", about: "Izafe links a noun to an adjective or owner: ئاوی سارد (cold water), هاوڕێی من (my friend). It appears as -ێکی in ماڵێکی بچووک and has -ە forms in definite groups.", after: [] },
    indefinite: { name: "A or one: -ێک", about: "The ending -ێک makes a noun indefinite or says one: گڵاسێک (a glass). Before a description it becomes -ێکی, as in ماڵێکی بچووک (a small house).", after: [] },
    definite: { name: "The: -ەکە", about: "The ending -ەکە points to a particular singular thing: کتێبەکە (the book), دەرگاکە (the door). After a noun ending in a vowel, it appears as -کە: پەنجەرەکە (the window).", after: [] },
    plural: { name: "More than one: -ان and -ەکان", about: "The common plural endings are -ان for a general plural and -ەکان for a definite plural: منداڵان (children), کلیلەکان (the keys). In a described definite group, the ending comes at the end: پێڵاوە نوێکان.", after: [] },
    possessive: { name: "My, your, their: person endings", about: "A person ending attaches to a noun: ناوم (my name), ناوت (your name), کلیلەکانم (my keys). The full set is -م، -ت، -ی، -مان، -تان، -یان.", after: [] },
    copula: { name: "Am, is and are as endings", about: "Sorani usually attaches the present copula to the word before it: برسیم (I'm hungry), خەڵکی کوێیت (where are you from?), خۆشە (it is good), کوردین (we are Kurds), گرانن (they are expensive).", after: [] },
    present: { name: "The present: دە- and an ending", about: "Most present verbs use دە- before the present stem and an ending for the subject: دەکڕم (I buy), دەچیت (you go), دەکەن (they do).", after: [] },
    "compound-verbs": { name: "Verbs made from two words", about: "Many everyday verbs use a noun or adjective with کردن or دان: قسە کردن means to speak, یاری کردن means to play, and پیشان دان means to show.", after: ["present"] },
    past: { name: "The past", about: "An intransitive past uses the past stem and a person ending: نەچووم means I did not go. Past transitive verbs follow their own clitic pattern.", after: ["present"] },
    "past-transitive": { name: "Past actions and their doer", about: "With a past transitive verb, the doer is commonly shown by a person clitic on an earlier word while the verb stays in its past-stem form: دوو سێوم کڕی (I bought two apples); ئەوان منیان بینی (they saw me).", after: ["past", "clitics"] },
    negation: { name: "Not: نا-، نە- and نییە", about: "Present indicative verbs normally take نا- (ناخۆمەوە), while a past or subjunctive form takes نە- (نەچووم). نییە means is not or there is not.", after: ["present", "copula"] },
    "future-time": { name: "Future time: a present form plus a time word", about: "Everyday Sorani commonly uses a present form with a clear future time: سبەی کار دەکەم (I'll work tomorrow); ئەمشەو لە ماڵ دەمێنمەوە (I'm staying home tonight).", after: ["present"] },
    subjunctive: { name: "Want, can and must: بـ", about: "After wanting, being able, or having to, the next verb normally uses the subjunctive, often with بـ: دەمەوێت ببم (I want to become), دەتوانم بخۆم (I can eat), دەبێت بدەم (I must give).", after: ["present"] },
    imperative: { name: "Requests and commands", about: "A positive request commonly uses بـ or the verb's imperative stem: بهێنە (bring), بخۆرەوە (drink), دانیشە (sit). A negative request normally begins with مە-.", after: ["subjunctive"] },
    prepositions: { name: "Prepositions come first", about: "These little words come before what they relate to: لە هەولێر (in Erbil), بە پاس (by bus), بۆ سلێمانی (to Sulaymaniyah), لەگەڵ تۆ (with you), لەسەر مێز (on the table).", after: [] },
    "postposition-da": { name: "Inside a place: لە … دا", about: "A place can be enclosed by لە before it and دا attached at its end: لە ژوورەکەدا (in the room), لە دووکانێکدا (in a store).", after: ["prepositions"] },
    questions: { name: "Questions: ئایا and question words", about: "ئایا can introduce a yes-or-no question and has no English word of its own. Question words stay where Sorani puts the answer: چی (what), کێ (who), کوێ (where), کەی (when), چۆن (how), چەند (how much or how many).", after: [] },
    existential: { name: "Having and existing: هەیە، نییە", about: "هەیە says that something exists; with a person ending on the thing it also expresses having: دوو خوشکم هەیە (I have two sisters). نییە is its negative.", after: ["copula"] },
    demonstrative: { name: "This and that: ئەم … ە، ئەو … ە", about: "Before a noun, ئەم (this) or ئەو (that) pairs with a final -ە on the noun: ئەم ژوورە (this room), ئەو ژوورە (that room). ئەمە and ئەوە stand alone.", after: [] },
    clitics: { name: "Pronouns joined to another word", about: "A short pronoun can join a verb, noun, or preposition: دەتبینم contains you and I (I see you), لەگەڵم means with me, and یارمەتیم means help to me.", after: [] },
    "subject-omission": { name: "The verb says who", about: "Verb and copula endings identify the subject, so Sorani often leaves out the separate pronoun: دەژیم means I live, دەچیت means you go, and دەگەڕێینەوە means we return.", after: ["present", "copula"] },
    adjectives: { name: "Describing words follow nouns", about: "A describing adjective follows its noun and is linked by izafe: ئاوی سارد (cold water), ماڵێکی بچووک (a small house). As a predicate it takes the copula: گەورەیە (it is big).", after: ["izafe"] },
  },
};
