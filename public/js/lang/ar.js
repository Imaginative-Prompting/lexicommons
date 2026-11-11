// Arabic (lang/index.js has what each field means): Modern Standard Arabic, the Arabic that's written and that device
// voices speak, right to left and mostly without its short vowels. A pack gives each word its vowel marks (tashkeel) as
// its reading (lang/readings.js "vowels"), shown on the word until you know it. The little words و, ف, ب, ل and ال join
// the front of the next word, and a word is headworded without them, as dictionaries list it: a verb by its he-form in
// the past (كتب for يكتب, سأكتب), a noun in the singular without ال (بيت for البيت, بيوت), an adjective in the
// masculine singular, and a pronoun ending under its word (لي under ل, كتابي under كتاب). Its locale is plain ar:
// Modern Standard Arabic is no one country's.

export default {
  name: "Arabic",
  locale: "ar",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  direction: "rtl",
  readings: "vowels",
  ends: ["؟"],
  abbreviations: ["د.", "أ.", "أ.د."],
  stray: ["الذين"],
  patterns: {
    "no-copula": { name: "No am, is or are", about: "A sentence about something now needs no word for am, is or are: الْبَيْتُ كَبِيرٌ (the house is big); أَنَا طَالِبٌ (I'm a student).", after: [] },
    al: { name: "الْ: the", about: "الْ joined to the front of a word means the, and Arabic has no word for a: بَيْت (a house), الْبَيْت (the house); it also marks things in general: أَشْرَبُ الْقَهْوَةَ (I drink coffee). Before some letters (t, d, s, sh, n, r and others) its لْ isn't said: the next letter is doubled instead, الشَّاي.", after: [] },
    gender: { name: "Masculine and feminine", about: "Every noun is masculine or feminine (most feminine ones end in ـَة), and the words with it agree: بَيْتٌ كَبِيرٌ (a big house), سَيَّارَةٌ كَبِيرَةٌ (a big car).", after: [] },
    adjective: { name: "Describing words come after", about: "An adjective comes after its noun and matches its gender and number: بَيْتٌ جَدِيدٌ means a new house; it takes الْ when it means the new house (الْبَيْتُ الْجَدِيدُ), but not when it means the house is new (الْبَيْتُ جَدِيدٌ).", after: ["al", "gender"] },
    idafa: { name: "Two nouns as one: the idafa", about: "Two nouns side by side make one thing, the second saying of what or whose; the first never takes الْ: كُوبُ مَاءٍ (a glass of water), بَيْتُ جَدَّتِي (my grandmother's house).", after: ["al"] },
    plural: { name: "More than one", about: "Some plurals add an ending (مُهَنْدِسُونَ: engineers; سَيَّارَات: cars), and many change the word inside (كِتَاب, كُتُب: books); a plural of things takes a feminine singular adjective: كُتُبٌ جَدِيدَةٌ.", after: ["gender"] },
    present: { name: "The present: a letter in front for who", about: "A present-tense verb usually starts with a letter that helps show who does it: أَسْكُنُ (I live), تَسْكُنُ (you live or she lives), يَسْكُنُ (he lives), نَسْكُنُ (we live). The prefix vowel depends on the verb (compare أُرِيدُ and نُسَافِرُ), and some forms add an ending too.", after: [] },
    past: { name: "The past: endings show who did it", about: "The past adds endings for the doer, so the subject pronoun is usually left out: أَكَلْتُ (I ate), أَكَلْنَا (we ate), أَكَلَ (he ate), أَكَلَتْ (she ate). Verbs are listed by this he-form: أَكَلَ, literally he ate, stands for to eat.", after: [] },
    future: { name: "Later: سَـ and سَوْفَ", about: "سَـ joined to a present verb, or سَوْفَ before it, says what will happen: سَأَتَّصِلُ بِكَ (I'll call you); سَوْفَ نَذْهَبُ (we'll go).", after: ["present"] },
    negation: { name: "Not: لَا, لَمْ, لَنْ, لَيْسَ", about: "لَا before a present verb says not (لَا أَشْرَبُ الْقَهْوَةَ); لَمْ before a present form says didn't (لَمْ آكُلْ); لَنْ before a present form says won't (لَنْ أَذْهَبَ); and لَيْسَ negates a present sentence with no ordinary verb: لَيْسَ عِنْدِي وَقْتٌ.", after: ["present", "no-copula"] },
    question: { name: "Questions", about: "A yes/no question can start with هَلْ and keeps a statement's order (هَلْ تَتَكَلَّمُ الْإِنْجِلِيزِيَّةَ؟); in a direct question a word like مَاذَا, أَيْنَ, مَتَى, كَيْفَ or كَمْ comes first (أَيْنَ الْمَحَطَّةُ؟), and the same words can introduce an indirect question: لَا أَعْرِفُ أَيْنَ يَسْكُنُ.", after: [] },
    "pronoun-endings": { name: "Endings for my, me, us", about: "A pronoun joins the end of a noun, a verb or a little word: كِتَابِي (my book), اسْمُكَ (your name), لِي (to me), مَعَنَا (with us), انْتَظِرْنِي (wait for me).", after: [] },
    prefixes: { name: "Little words joined on: وَ, فَ, بِ, لِ", about: "وَ (and), فَ (so), بِ (with, by, in) and لِ (to, for) join the front of the next word: وَأُخْتٌ, بِالْحَافِلَةِ, لِلْعَمَلِ.", after: ["al"] },
    "verb-first": { name: "The verb often comes first", about: "Arabic often puts the verb before its subject, and a verb before a plural subject stays singular: وَصَلَ الْقِطَارُ (the train arrived); يَعْمَلُ أَبِي فِي مُسْتَشْفًى.", after: ["present", "past"] },
    inda: { name: "Having: عِنْدِي", about: "عِنْد (at) with a pronoun ending says have: عِنْدِي أَخٌ (I have a brother), عِنْدَنَا مَطْبَخٌ كَبِيرٌ (we have a big kitchen).", after: ["pronoun-endings"] },
    hunaka: { name: "There is: هُنَاكَ", about: "هُنَاكَ says there is or there are: هُنَاكَ كُتُبٌ عَلَى الطَّاوِلَةِ; Arabic commonly uses لَا يُوجَدُ or لَا تُوجَدُ for there isn't or there aren't: لَا يُوجَدُ حَلِيبٌ.", after: [] },
    an: { name: "To + a verb: أَنْ", about: "After verbs such as أُرِيدُ and يَجِبُ, أَنْ comes before a present verb and puts it in the subjunctive: أُرِيدُ أَنْ أَشْرَبَ; يَجِبُ أَنْ أَذْهَبَ.", after: ["present"] },
    demonstrative: { name: "This: هَٰذَا, هَٰذِهِ, هَٰؤُلَاءِ", about: "هَٰذَا (this, masculine), هَٰذِهِ (feminine, and plurals of things) and هَٰؤُلَاءِ (these people) point; before a noun with الْ they mean this: هَٰذَا الْكِتَابُ, هَٰذِهِ الشَّقَّةُ.", after: ["al", "gender"] },
    imperative: { name: "Asking someone to do something", about: "A command has its own form (افْتَحْ: open; انْتَظِرْ: wait), and مِنْ فَضْلِكَ makes it polite: افْتَحِ النَّافِذَةَ مِنْ فَضْلِكَ.", after: ["present"] },
    "case-endings": { name: "Case endings: -u, -a, -i", about: "In fully read MSA, nouns and adjectives usually take -u/-un in the nominative, -a/-an in the accusative, and -i/-in in the genitive: a subject is normally nominative, a direct object or the predicate of كَانَ accusative, and a word after a preposition or second in an idafa genitive: أَسْكُنُ فِي شَقَّةٍ صَغِيرَةٍ; أُرِيدُ شَيْئًا حُلْوًا.", after: ["al", "idafa", "adjective"] },
    "feminine-you": { name: "Talking to a woman", about: "When speaking to one woman, many forms use ـِينَ or ـِي, and attached ـكَ becomes ـكِ: تَرْجِعِينَ, تَعَالَيْ, اسْمُكِ.", after: ["present", "imperative", "pronoun-endings"] },
    dual: { name: "Exactly two", about: "For exactly two, nouns and adjectives take ـَانِ in the nominative and ـَيْنِ in the accusative or genitive: عِنْدِي أُخْتَانِ; اشْتَرَيْتُ كِتَابَيْنِ.", after: ["plural", "case-endings"] },
    kana: { name: "Was: كَانَ", about: "كَانَ and its forms (كَانَتْ, كُنْتُ) put a present-time sentence in the past, and a predicate adjective is accusative: كَانَ الْجَوُّ بَارِدًا; كَانَتِ الرِّحْلَةُ جَمِيلَةً.", after: ["past", "no-copula", "case-endings"] },
  },
};
