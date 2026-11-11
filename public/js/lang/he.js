// Hebrew (lang/index.js has what each field means), written right to left and mostly without its vowels: a pack gives
// each word its vowel points (niqqud) as its reading (lang/readings.js "vowels"), shown on the word until you know it.
// Words are written in their everyday full spelling (כתיב מלא), the points added to it. The little words ו, ה, ב, כ,
// ל, מ and ש join the front of the next word, and a word is headworded without them, as dictionaries list it (בבית under
// בית); verbs are headworded by their infinitive, as learners' dictionaries list them (ללכת for הולך, הלך, נלך), and a pronoun ending under its
// word (לי under ל, שלי under של). Hebrew abbreviations are marked with ׳ or ״, never a full stop, so none are listed.

export default {
  name: "Hebrew",
  locale: "he-IL",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  direction: "rtl",
  readings: "vowels",
  abbreviations: [],
  stray: ["כלפי"],
  patterns: {
    "no-copula": { name: "No am, is or are", about: "In simple present-tense sentences, Hebrew often leaves out English am, is and are: אָחִי סְטוּדֶנְט (my brother is a student); קַר הַיּוֹם (it's cold today).", after: [] },
    ha: { name: "הַ: the", about: "הַ joined to the front of a word means the, and Hebrew has no word for a: בַּיִת (a house), הַבַּיִת (the house).", after: [] },
    gender: { name: "Masculine and feminine", about: "Every noun is masculine or feminine (many feminine ones end in ה or ת), and the words with it agree: אוֹטוֹ חָדָשׁ (a new car), דִּירָה קְטַנָּה (a small apartment); Hebrew uses אַתָּה for ‘you’ when speaking to a man and אַתְּ when speaking to a woman.", after: [] },
    adjective: { name: "Describing words come after", about: "An adjective follows its noun and agrees in gender and number: מִטְבָּח גָּדוֹל means a big kitchen and הַמִּטְבָּח הַגָּדוֹל means the big kitchen, but הַמִּטְבָּח גָּדוֹל means the kitchen is big, so the last adjective has no הַ.", after: ["ha", "gender"] },
    plural: { name: "More than one: ־ִים and ־וֹת", about: "Most masculine nouns add ־ִים and most feminine ones ־וֹת, and their adjectives agree: סְפָרִים (books), חוּלְצוֹת חֲדָשׁוֹת (new shirts); some take the other ending: בֵּיצָה, בֵּיצִים (eggs).", after: ["gender"] },
    present: { name: "The present: four forms", about: "A present-tense verb has four forms for gender and number, regardless of person: אֲנִי גָּר or גָּרָה (I live, said by a man or a woman), אֲנַחְנוּ גָּרִים, הֵן גָּרוֹת.", after: ["gender"] },
    past: { name: "The past: an ending for who", about: "Past-tense endings show who did something, so I and we can be left out (קָנִיתִי, I bought; אָכַלְנוּ, we ate); the he-form has no person ending (הוּא אָכַל), and the she-form commonly ends in ה or תה (אִיחֲרָה, קָנְתָה).", after: ["gender"] },
    future: { name: "The future: a letter in front", about: "The future usually starts with א, ת, נ or י to mark who will do it, and some forms also add an ending: אֶסַּע (I'll go), תָּבוֹא (you'll come), נֵלֵךְ (we'll go), יֵרֵד גֶּשֶׁם (it'll rain).", after: ["gender"] },
    imperative: { name: "Asking someone to do something", about: "A command has its own short form (בּוֹא: come), and everyday Hebrew often asks with the future instead: תִּסְגּוֹר אֶת הַחַלּוֹן, בְּבַקָּשָׁה; תַּגִּיד לִי.", after: ["future"] },
    infinitive: { name: "To + a verb: ל־", about: "The infinitive starts with ל־, whose vowel changes with the verb: לֶאֱכוֹל (to eat), לָלֶכֶת (to go), לִקְנוֹת (to buy); it follows words like רוֹצֶה, צָרִיךְ and אֶפְשָׁר: אֶפְשָׁר לִנְסוֹעַ בְּמוֹנִית.", after: [] },
    modal: { name: "Want, need, can", about: "רוֹצֶה (want) and צָרִיךְ (need, have to) agree like present verbs; before another action they take an infinitive. אֶפְשָׁר (can, it is possible) does not change: אֲנִי צְרִיכָה לָלֶכֶת; אֶפְשָׁר לִנְסוֹעַ בְּמוֹנִית.", after: ["present", "infinitive"] },
    et: { name: "אֶת before a definite object", about: "A definite direct object (with הַ, a name or another marker of definiteness) takes אֶת before it, a word with no English: אֲנִי מְחַפֵּשׂ אֶת הַמַּפְתְּחוֹת; an indefinite direct object doesn't: אֲנִי רוֹצֶה כּוֹס מַיִם.", after: ["ha"] },
    prefixes: { name: "Little words joined on: וְ, בְּ, כְּ, לְ, מִ, שֶׁ", about: "וְ (and), בְּ (in, at, by), כְּ (like, as), לְ (to, for), מִ (from) and שֶׁ (that) join the front of the next word: וְאָחוֹת, בְּחֵיפָה, לָעֲבוֹדָה. Before a definite noun, בְּ, כְּ and לְ replace הַ, so בַּמְּקָרֵר means in the fridge.", after: ["ha"] },
    "yesh-ein": { name: "There is, and having: יֵשׁ, אֵין", about: "יֵשׁ says there is and אֵין there isn't, and with לְ they say have: יֵשׁ לִי אָח (I have a brother); אֵין לִי זְמַן (I don't have time).", after: [] },
    "pronoun-endings": { name: "Endings for me, you, us", about: "Little words take an ending for the person: לִי (to me), לָנוּ (to us), אִיתִּי (with me), שֶׁלִּי (mine), and a few nouns do too: אָחִי (my brother).", after: [] },
    shel: { name: "Possession, of: שֶׁל", about: "שֶׁל (of) says whose and comes after the noun: הָאוֹטוֹ שֶׁל אַבָּא שֶׁלִּי (my dad's car); with an ending it's my, your: הַמַּפְתְּחוֹת שֶׁלִּי (my keys).", after: ["pronoun-endings"] },
    smikhut: { name: "Two nouns as one", about: "Two nouns side by side make one thing, the first often shortened: כּוֹס מַיִם (a glass of water), אֲרוּחַת עֶרֶב (dinner, a meal of evening); the הַ goes on the second: בֵּית הַסֵּפֶר (the school).", after: ["ha"] },
    negation: { name: "Not: לֹא", about: "לֹא (not, no) comes just before the word it denies: אֲנִי לֹא יוֹדֵעַ (I don't know); אֲנִי לֹא שׁוֹתֶה קָפֶה.", after: [] },
    question: { name: "Questions", about: "A yes/no question keeps a statement's order and only the voice rises (אַתָּה מְדַבֵּר אַנְגְּלִית?); a question word like מָה, אֵיפֹה, מָתַי, אֵיךְ or כַּמָּה comes first: אֵיפֹה הַתַּחֲנָה?", after: [] },
    zeh: { name: "This, these: זֶה, זֹאת, אֵלֶּה", about: "זֶה (masculine), זֹאת (feminine) and אֵלֶּה (plural) mean this or these. When they stand on their own, Hebrew needs no present-tense is: אֵלֶּה הַחֲבֵרִים שֶׁלִּי means these are my friends. After a definite noun the demonstrative also takes הַ: הַסֵּפֶר הַזֶּה, הַדִּירָה הַזֹּאת.", after: ["no-copula", "ha", "gender"] },
  },
};
