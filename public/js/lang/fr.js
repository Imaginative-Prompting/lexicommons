// French (lang/index.js has what each field means).

export default {
  name: "French",
  locale: "fr-FR",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["m.", "mm.", "mme.", "mlle.", "dr.", "st.", "ste.", "p.ex.", "p.", "ex.", "c.-à-d.", "env.", "n°.", "av.", "bd.", "tél.", "etc.", "cf."],
  stray: ["ne", "pas", "le", "de", "que", "y"],
  // France's typography: a narrow no-break space before ? ! ; and a no-break space before : (shown, never stored).
  spaceBefore: { "?": "\u202f", "!": "\u202f", ";": "\u202f", ":": "\u00a0" },
  // Words a woven line shows side by side, written as French writes them: de le is du, que elle is qu'elle, ce est
  // is c'est (and c'était, c'eût), si il is s'il; no elision before an aspirated h (le hibou; muteH: word beginnings the list would catch
  // that do elide, l'hallucination) or the whole words onze, oui. lex-lang-eu reviewed the table (27 Oct).
  joins: {
    contract: { "de le": "du", "de les": "des", "à le": "au", "à les": "aux" },
    // The lemmas the article takes (a pronoun le, him, has il and never contracts).
    articles: ["le", "les"],
    // (me, te and se aren't here: in English order an object pronoun comes after its verb, and a reflexive one is in its
    // verb's own gloss, s'assit.)
    elide: { je: "j", le: "l", la: "l", ne: "n", de: "d", que: "qu", jusque: "jusqu", lorsque: "lorsqu", puisque: "puisqu", ce: "c", si: "s" },
    // (Not before en: en can open a phrase, en réalité; c'en est only goes unjoined.)
    elideOnlyBefore: { ce: ["est", "était", "étaient", "eût", "eut"], si: ["il", "ils"] },
    // le and la elide only as articles, je only before an inflected verb (its lemma ends as a verb's: verbEndings), and
    // not after an auxiliary in its clause: English order puts a pronoun after its verb (fais le entrer, suis je
    // heureuse, puis je entrer).
    articleOnly: ["le", "la"],
    beforeInflected: ["je"],
    verbEndings: ["er", "ir", "re"],
    // By the book's language, the words that put I after them in a question (Am I …?), where je follows its verb and
    // never elides; from a book language not here, je never elides. (As the book writes them, letters only: haven't
    // is havent.)
    invertedAfter: { en: ["am", "are", "is", "was", "were", "can", "could", "do", "does", "did", "have", "has", "had", "may", "might", "must", "shall", "should", "will", "would",
      "aint", "arent", "isnt", "wasnt", "werent", "cant", "couldnt", "dont", "doesnt", "didnt", "havent", "hasnt", "hadnt", "maynt", "mightnt", "mustnt", "shant", "shouldnt", "wont", "wouldnt"] },
    aspirated: ["hâbl", "hach", "hagard", "haï", "hais", "hait", "haie", "haillon", "haine", "hâl", "halet", "halèt", "hall", "halo", "halte", "hamac", "hamburger", "hameau", "hamp", "hamster", "hanche", "handicap", "hangar", "hanneton", "hant", "happ", "harangu", "haras", "harass", "harcel", "harcèl", "hard", "harem", "harfang", "hareng", "hargn", "haricot", "harnach", "harnais", "harp", "hasard", "hât", "haubert", "hauss", "haut", "havre", "heaum", "héla", "hélai", "hélâ", "hélass", "hélèr", "hélé", "héler", "hélez", "héliez", "hélions", "hélons", "hèle", "henn", "hérau", "hériss", "hernie", "hers", "héron", "héros", "hêtre", "heurt", "hibou", "hideu", "hiérarch", "hippie", "hiss", "hobby", "hoch", "hockey", "hold-up", "holland", "homard", "hongr", "honni", "honte", "honteu", "hooligan", "hoquet", "hord", "hors", "hot-dog", "hotdog", "hotte", "houblon", "houe", "houill", "houl", "houpp", "hourra", "houspill", "housse", "houx", "hublot", "huche", "hua", "hue", "huer", "humer", "huée", "huez", "huons", "huguenot", "huit", "hulotte", "hulul", "hune", "hupp", "hure", "hurl", "hussard", "hutte"],
    muteH: ["hallucin", "halog", "haïti", "huitr"],
    // Whole words, where a beginning would catch mute ones too (humer's present and past; humeur, humain, humérus are
    // mute); its future and conditional are under humer above.
    aspiratedWords: ["hume", "humes", "hument", "humé", "humée", "humés", "humées", "humons", "humez", "humais", "humait", "humaient", "huma", "humant"],
    // y before a vowel elides only in these (j'y, d'yeux); le yaourt, le yoga. Before a consonant it does (d'Yves).
    elideBeforeY: ["y", "yeux"],
    noElision: ["onze", "onzième", "onzièmes", "oui", "ouis", "ouistiti", "ouistitis"],
  },
  patterns: {
    present: { name: "Present-tense forms", about: "The verb changes with who does it: je parle (I speak), tu parles (you speak), il or elle parle (he or she speaks), nous parlons (we speak), vous parlez (you speak), ils or elles parlent (they speak).", after: [] },
    gender: { name: "Gender and agreement", about: "Every noun is masculine or feminine, and le or la, un or une and the adjectives with it match it: un petit chat, une petite maison.", after: [] },
    "adjective-after": { name: "Adjectives after the noun", about: "Most adjectives come after the noun: une maison bleue (a house blue). A few short, common ones such as petit, grand, bon and beau come before it.", after: ["gender"] },
    negation: { name: "ne … pas around the verb", about: "ne goes before the verb and pas after it: Je ne sais pas (I not know not); in the passé composé they go around avoir or être (Je n'ai pas mangé), and everyday speech often drops ne.", after: [] },
    question: { name: "Questions", about: "Ask by raising your voice at the end, or start with est-ce que (is it that). After a question word, the verb can come before the subject: À quelle heure part le train (at what hour leaves the train).", after: [] },
    "object-pronoun": { name: "Pronouns before the verb", about: "le, la and les (him, her, it, them), me, te and lui (to him or her) go before the verb, or before the infinitive of a second verb: Je le vois (I it see), Je veux te voir (I want you see).", after: [] },
    perfect: { name: "passé composé with avoir", about: "Most past events use avoir and the past participle: J'ai mangé (I have eaten), for both I ate and I have eaten.", after: [] },
    "etre-perfect": { name: "passé composé with être", about: "A small group of verbs, including aller, venir, partir, arriver and rester, use être instead, and the participle matches the subject: Elle est partie (she is gone: she left).", after: ["perfect", "gender"] },
    aller: { name: "aller + infinitive: going to", about: "Je vais, tu vas, il va and an infinitive say what's going to happen, with no word for to: Je vais manger (I go eat).", after: [] },
    modal: { name: "Verb + infinitive", about: "After vouloir, pouvoir, devoir and aimer, the next verb stays in the infinitive, with no word for to: Je veux partir (I want leave).", after: [] },
    partitive: { name: "du, de la, des: some", about: "du or de la is some of something you don't count (du café) and des is some of things you do (des tomates); after a negative verb they usually become de (pas de café), while aimer in a general sense takes le, la or les (j'aime le café).", after: ["gender"] },
    contraction: { name: "au and du", about: "à le becomes au and de le becomes du: au marché (to-the market), du travail (from-the work). à la and de la stay as they are.", after: ["gender"] },
    de: { name: "de: of", about: "French joins nouns with de where English uses 's: la voiture de mon père (the car of my father).", after: [] },
    "il-y-a": { name: "il y a: there is, there are", about: "il y a says both there is and there are: Il y a un problème (it there has a problem).", after: [] },
    avoir: { name: "avoir: I have hunger", about: "Where English says I'm hungry, thirsty or twenty, French says I have: J'ai faim (I have hunger), J'ai vingt ans (I have twenty years).", after: [] },
    reflexive: { name: "Reflexive verbs", about: "With reflexive verbs, me, te, se or nous goes before the verb and points back to whoever does it, or means each other: Je me lève (I myself raise: I get up), On se voit (one each other sees: we meet).", after: ["object-pronoun"] },
    "y-en": { name: "y and en", about: "y means there or to it, en means some, of it or of them, and both go before the verb: J'y vais (I there go), J'en veux deux (I of-them want two).", after: ["object-pronoun"] },
    "il-fait": { name: "il fait: the weather", about: "French talks about the weather with faire: Il fait beau (it makes beautiful: it's nice out), Il fait froid (it's cold).", after: [] },
    on: { name: "on: we", about: "In everyday French, on (one) usually means we, with the verb's il form: On y va (one there goes: let's go).", after: [] },
  },
};
