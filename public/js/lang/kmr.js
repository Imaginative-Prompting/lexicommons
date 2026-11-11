// Kurmanji Kurdish (lang/index.js has what each field means). Standard written Kurmanji in the Bedirxan/Hawar Latin
// alphabet (ç ê î û ş x w q). Headwords follow Kurmanji dictionaries: verbs use the infinitive, nouns the absolute
// singular, and adjectives their base form. This module follows the textbook norm for gender and ezafe (-ê masculine,
// -a feminine, -ên plural, -ekî/-eke indefinite), the oblique case, and the ergative past with its doer in the oblique.

export default {
  name: "Kurmanji Kurdish",
  locale: "kmr-TR",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["bnr.", "dr.", "hwd.", "prof.", "r."],
  stray: ["heke"],
  patterns: {
    "verb-last": { name: "The verb near the end", about: "The usual order is subject–object–verb: Ez çay vedixwim (I drink tea). A destination may follow a motion verb: Ez diçim sûkê (I'm going to the market).", after: [] },
    gender: { name: "Masculine and feminine", about: "Every singular noun is masculine or feminine, and its gender appears in ezafe and the oblique: birayê min (my brother), mala min (my house), pencereyê (the window as an object).", after: [] },
    plural: { name: "More than one", about: "An absolute noun often looks the same for one and more than one, but the oblique plural takes -an and the ezafe plural takes -ên: pêlav, van pêlavan, xwişkên min.", after: [] },
    indefinite: { name: "A or one: -ek", about: "-ek makes a noun indefinite: bilêtek, a ticket. Before a modifier it becomes -ekî for a masculine noun and -eke for a feminine noun: xwendekarekî baş, maseyeke biçûk.", after: ["gender"] },
    "no-articles": { name: "No word for the", about: "Kurmanji has no separate word for the. A bare noun can be definite or general: Pirtûk li ser masê ye; Ez çay vedixwim.", after: [] },
    oblique: { name: "The oblique case", about: "Direct objects of verbs built on the present stem, possessors, complements of prepositions and circumpositions, and past transitive doers use oblique forms. Pronouns include min, te, wî, wê; feminine nouns take -ê, plurals -an, while an unmodified masculine noun is often unchanged.", after: ["gender", "plural"] },
    ezafe: { name: "Ezafe links a noun", about: "A noun takes -ê if masculine, -a if feminine, and -ên if plural before its owner or description: navê te, mala min, xwişkên min. Indefinite links are -ekî and -eke.", after: ["gender", "plural", "indefinite"] },
    possession: { name: "My and your", about: "The possessed noun takes ezafe and the owner is an oblique pronoun: mala min (my house), pirtûka te (your book), xaniyê me (our house).", after: ["ezafe", "oblique"] },
    reflexive: { name: "One’s own: xwe", about: "xwe refers back to the subject and stays the same for every person: Ez bi hevala xwe re dimeşim means I walk with my friend.", after: ["possession"] },
    copula: { name: "Am, is, are", about: "After a consonant the copula is im, î, e, or in; after a vowel it is me, yî, ye, or ne: ez baş im, tu çawa yî, ew li ku ye, em li vir in.", after: [] },
    present: { name: "The present: di-", about: "The present usually has di- plus the present stem and a person ending: diaxivî, dixwin, dimînim. A preverb stays in front of di-, as in vedixwim.", after: ["verb-last"] },
    negation: { name: "Not: na-, ne-, tune", about: "na- normally replaces di- in a present verb (venaxwim); karîn and zanîn use ni- (nikarim, nizanim). ne- negates subjunctives, imperatives, and past verbs (veneke), while ne before a copular predicate means not; tune or nîne means there is not or none.", after: ["present", "copula"] },
    question: { name: "Questions", about: "ma may introduce a yes/no question, while çi, kî, ku, kengî, çawa, and çiqas ask for missing information: Navê te çi ye? Tu ji ku derê yî?", after: ["copula", "present"] },
    demonstratives: { name: "This and that", about: "ev and ew mean this/these and that/those. In the oblique they become vî or vê, wî or wê, and plural van or wan, with the noun marked too: vê rêyê, van pêlavan.", after: ["oblique", "gender", "plural"] },
    circumpositions: { name: "Words around a noun", about: "Prepositions take an oblique complement and may stand alone (ji Amedê, bi otobêsê, li Hewlêrê) or frame it with a postposition (di sarincê de, bi hevala xwe re, ji kerema xwe re), while third-person combinations contract to pê, jê, tê, and lê.", after: ["oblique"] },
    "have-exist": { name: "Having and there is", about: "heye and hene mean there is and there are. To say have, Kurmanji uses a possessive phrase plus existence: Du xwişkên min hene, literally two sisters of mine exist; tune is the negative.", after: ["possession", "plural"] },
    "past-intransitive": { name: "Past without an object", about: "An intransitive past agrees with its subject: ez hatim, em çûn, trên hat. The past stem normally drops final -(i)n from the infinitive: hatin → hat-, tirsîn → tirsî-, çûn → çû-.", after: ["verb-last"] },
    "past-ergative": { name: "Past with an object", about: "With a past transitive verb, the doer is oblique and the verb agrees with the object: Min ew dîtin (I saw them); Wê du sêv xwarin (She ate two apples).", after: ["oblique", "past-intransitive"] },
    subjunctive: { name: "That I do: bi-", about: "The subjunctive normally uses bi- plus the present stem and its ending (biçim, bikî, biaxivim), while prefixed verbs often omit bi- (vegerî) and some verbs are irregular (bêm from hatin).", after: ["present"] },
    "modal-verbs": { name: "Want, can, must", about: "xwestin and karîn take a subjunctive verb: dixwazim bibim, dikarî bikî. Impersonal divê also takes the subjunctive: Divê ez biçim.", after: ["present", "subjunctive"] },
    future: { name: "Future: dê or ê", about: "dê or the shorter ê follows the subject, and the main verb is subjunctive: Ez dê biçim; Em ê bibînin. With a noun subject, dê follows that noun.", after: ["subjunctive"] },
    imperative: { name: "Requests and commands", about: "A request uses the imperative, often built like the subjunctive: veke (open), bîne (bring), here (go). ne- makes it negative: veneke (don't open).", after: ["subjunctive"] },
  },
};
