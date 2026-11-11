// Pashto (lang/index.js has what each field means): standard written Afghan Pashto, right to left, with the five
// Pashto yeh forms and Pashto letters such as ټ, ډ, ړ, ښ, ږ, ځ, څ, ګ and ڼ. Readings follow conservative Kandahari
// pronunciation: ښ is the voiceless retroflex [ʂ] and ږ its voiced partner [ʐ]. A pack adds zabar, zer, pesh,
// zwarakay ٙ and tashdid only where the letters do not settle a word's reading; it never adds sukun. Statements end
// with . and questions with ؟. Verbs are headworded by the infinitive, nouns by the direct singular, and adjectives
// by the masculine direct singular.

export default {
  name: "Pashto",
  locale: "ps-AF",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  direction: "rtl",
  readings: "vowels",
  vowelsWhereNeeded: true,
  ends: ["؟"],
  abbreviations: [],
  stray: ["که"],
  patterns: {
    "verb-last": { name: "The verb comes last", about: "A Pashto sentence normally puts its object and other details before the verb: زٙه چای څښٙم (I drink tea); موږ کار تَه ځو (we go to work).", after: [] },
    gender: { name: "Masculine and feminine", about: "Every noun is masculine or feminine, and adjectives and the third-person singular copula agree: کور لوی دی (the house is big), but کوټَه وَړَه دَه (the room is small).", after: [] },
    adjective: { name: "Describing words come before nouns", about: "An adjective comes before the noun it describes and agrees with it: نَوَی کِتاب (a new book), نَوي بوټان (new shoes).", after: ["gender"] },
    "direct-oblique": { name: "Direct and oblique forms", about: "A noun or pronoun normally has a direct form, but many change inside a little-word phrase or as the doer of a past transitive verb: زٙه ځٙم, but ما ډوډۍ وٙخوَړَه; مَلګٙري, but لٙه مَلګٙرو سَرَه.", after: ["gender"] },
    copula: { name: "Am, are and is", about: "Use یٙم with زٙه, یې with تٙه, یو with موږ, and یٙئ with تاسو; دی is masculine is, دَه feminine is, and دي plural are.", after: ["gender"] },
    present: { name: "The present", about: "The present stem takes an ending for who acts: زٙه کَوٙم, تٙه کَوې, موږ کَوُو. It can describe what happens generally or what is happening now.", after: ["verb-last"] },
    "compound-verbs": { name: "Actions with کَوٙل", about: "Pashto often makes an action from a noun or adjective plus کَوٙل (do or make): خَبَرې کَوٙل means to talk, زدَه کَوٙل to learn, and مرَستَه کَوٙل to help.", after: ["present"] },
    "perfective-wa": { name: "A whole action, often with وٙ-", about: "When an action is viewed as a whole, Pashto uses its perfective stem, often with وٙ-: خوَرٙم becomes وٙخوَرٙم and لولٙم becomes وٙلولٙم; common verbs such as تلٙل have an irregular form, لاړ شٙم.", after: ["present"] },
    "past-ergative": { name: "Past transitive: the verb agrees with the object", about: "With a transitive verb in the past, the doer is oblique and the verb agrees with the object: ما کِتاب واخیست, but ما وریجې وٙخوَړې.", after: ["direct-oblique", "perfective-wa"] },
    negation: { name: "Not: نَه and مَه", about: "نَه negates statements and abilities (زٙه قَهوَه نَه څښٙم; نَه شٙم راتلای), while مَه makes a negative request (دَروازَه مَه بَندَوَه). نٙشتَه means there is not.", after: ["present"] },
    "future-ba": { name: "Later: بَه", about: "بَه normally comes near the beginning to mark the future: a whole action uses the subjunctive-based form (زٙه بَه سَبا راشٙم), while a future state uses a form of “be” (سَبا بَه باران وي; تاسو بَه وُزګار یٙئ).", after: ["subjunctive", "copula"] },
    subjunctive: { name: "Wanted or necessary actions", about: "For wanted, intended, possible or necessary actions, Pashto often uses the perfective-based subjunctive, as after غواړٙم چې or بایَد: وٙڅښٙم، وٙلولې، لاړ شو.", after: ["perfective-wa"] },
    want: { name: "Want: غوښتٙل", about: "Put a wanted thing or infinitive before غواړٙم, or use غواړٙم چې with a subjunctive clause: زٙه ډوډۍ غواړٙم; غواړٙم چې اوبٙه وٙڅښٙم.", after: ["present", "subjunctive"] },
    ability: { name: "Can: کَوٙلای شٙم", about: "Pashto says can with کَوٙلای شٙم چې plus a subjunctive (زٙه کَوٙلای شٙم چې لاړ شٙم), or with a direct ability form ending in ـای and شٙم (زٙه نَه شٙم راتلای).", after: ["subjunctive"] },
    must: { name: "Must: بایَد", about: "بایَد comes before the action that is necessary, and that action is subjunctive: موږ بایَد لاړ شو; تٙه بایَد کِتاب وٙلولې.", after: ["subjunctive"] },
    imperative: { name: "Requests and commands", about: "A singular request often ends in ـه and a polite or plural one in ـئ: وٙتَړَه (close it), وٙکړئ (please do), راوړئ (bring it).", after: ["perfective-wa"] },
    possessive: { name: "Possessors before nouns", about: "A possessor comes before the noun: زما نوم (my name), ستا کِتاب (your book), زموږ کور (our house), and خپٙلَه کوټَه (one’s own room).", after: [] },
    sandwiches: { name: "Little words around a noun", about: "Pashto often puts a noun inside or beside little words: پٙه کور کې (in the house), لٙه مَلګٙرو سَرَه (with friends), دٙ مېلمَنو لَپارَه (for the guests), بازار تَه (to the market).", after: ["direct-oblique"] },
    question: { name: "Questions", about: "آیا may begin a yes/no question, while څٙه, څوک, چېرتَه and کَلَه stay where their answer belongs: ستا نوم څٙه دی؟ غوٙنډَه کَلَه پیلېږي؟", after: [] },
    have: { name: "Having: لَرٙل", about: "لَرٙل works like an ordinary verb and agrees with the person who has something: زٙه وَخت لَرٙم, موږ وَخت لَرو, هَغَه وَخت لَري.", after: ["present"] },
    existential: { name: "There is: شتَه and نٙشتَه", about: "شتَه says that something exists or is available, and نٙشتَه says it is absent: پٙه کور کې اوبٙه شتَه; دَلتَه دَرمَلتون نٙشتَه.", after: ["sandwiches"] },
    demonstrative: { name: "This and that: دا، هَغَه", about: "دا points to this or these, and هَغَه to that or those: دا کور, دا مَلګٙري, هَغَه کِتاب, هَغَه دوکان.", after: [] },
    plural: { name: "More than one", about: "Pashto plurals take several forms, including کِتابونَه, مَلګٙري, مَڼې and وروڼَه; a plural subject usually takes دي or a plural verb ending, except that a past transitive verb agrees with its object.", after: ["gender"] },
    "no-articles": { name: "How Pashto handles a and the", about: "Pashto has no dedicated articles: context often supplies English a, an or the, while یَو (one) can make a noun indefinite.", after: [] },
  },
};
