// Dutch (lang/index.js has what each field means).

// Who drafted and reviewed the series' patterns below (lang/grammar.js: every pattern says where it's from).
const SERIES = { by: "Lexicommons' Dutch word series", drafted: "gpt-6.1-sol", reviewed: "3 rounds by gpt-6-astra, as a native-speaker teacher", at: "2026-11-02" };

export default {
  name: "Dutch",
  locale: "nl-NL",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["dhr.", "mevr.", "mw.", "dr.", "drs.", "ir.", "mr.", "prof.", "st.", "bijv.", "bv.", "d.w.z.", "m.a.w.", "o.a.", "a.u.b.", "z.g.a.n.", "nr.", "blz.", "jl.", "vs."],
  stray: ["niet", "ook", "er", "nog", "het", "de"],
  patterns: {
    v2: { name: "Verb second", about: "In a main clause the verb comes second. Start with a time word, and the subject moves after the verb.", after: [] },
    perfect: { name: "Perfect tense: verb last", about: "With hebben or zijn, the past participle goes to the end.", after: ["v2"] },
    dat: { name: "dat: verb to the end", about: "After dat (that), the verb goes to the end of its clause.", after: ["modal", "perfect"] },
    separable: { name: "Separable verbs", about: "Verbs like opbellen split: the verb comes second and the little word (op) goes to the end.", after: ["v2"] },
    modal: { name: "Modal + infinitive last", about: "With willen, kunnen or moeten, the second verb goes to the end.", after: ["v2"] },
    niet: { name: "Where niet goes", about: "niet usually comes after the object, near the end.", after: ["v2"] },
    omte: { name: "om … te", about: "In order to: om, then the object, then te and the verb at the end.", after: ["modal"] },
    question: { name: "Questions: verb first", about: "In a question the verb comes before the subject (after a question word, if there is one).", after: ["v2"] },
    // The beginner grammar the frequency series' sentences show (pipelines/words, 2 Nov 2026), with who drafted and
    // reviewed it: docs/languages/nl-words/patterns.nl.json outside the app, each round's findings in the pipeline.
    present: { name: "Present tense: ik werk, jij werkt, wij werken", about: "Most verbs use the ik form plus -t with jij/u/hij/zij/het (unless it ends in t), and the -en form with wij/jullie/zij; when jij follows the verb, use the ik form: ik werk (I work), werk jij? (work you?).", after: [], source: SERIES },
    "de-het": { name: "de and het: the", about: "Learn each noun with de or het, both meaning the. Plurals use de: het huis (the house), de huizen (the houses).", after: [], source: SERIES },
    plural: { name: "Plurals with -en and -s", about: "Most nouns add -en or -s for the plural, sometimes with spelling changes before -en: huis → huizen (house → houses), boom → bomen (tree → trees).", after: ["de-het"], source: SERIES },
    geen: { name: "geen: no, not a", about: "Use geen for no, not a or not any, replacing een or going before a noun used without words like de, het or mijn: Ik heb geen auto (I have no car), we hebben geen tijd (we have no time).", after: ["de-het"], source: SERIES },
    "er-is": { name: "er is and er zijn: there is and there are", about: "Use er is (there is) with a noun that is not plural, and er zijn (there are) with a plural: Er is koffie (there is coffee), er zijn stoelen (there are chairs).", after: ["zijn-hebben"], source: SERIES },
    adjective: { name: "Adjectives with and without -e", about: "Before a noun, an adjective usually adds -e, except with a het noun after een, geen or no word. When it describes the subject after zijn, it usually has no -e: een groot huis (a big house), het huis is groot (the house is big).", after: ["de-het"], source: SERIES },
    diminutive: { name: "-je and -tje: small or friendly", about: "Use -je, -tje, -pje, -etje or -kje to make a noun sound small or friendly. The ending depends on the noun; use het unless the noun is plural: het huisje (the little house), het boompje (the little tree).", after: ["de-het"], source: SERIES },
    past: { name: "Past tense: werkte, woonde, ging", about: "For many verbs, add -te or -de to the ik form for the past, with another -n for wij/jullie/zij. Other verbs change more: Ik werkte hier (I worked here), wij gingen weg (we went away).", after: ["present"], source: SERIES },
    omdat: { name: "omdat, als and more: verb last", about: "After words such as omdat (because), als (if/when), wanneer (when), toen (when in the past), terwijl (while), voordat (before) and of (whether), put the verb at the end of that part of the sentence: Ik blijf thuis omdat ik moe ben (I stay home because I tired am).", after: ["dat"], source: SERIES },
    relative: { name: "die and dat: who, which, that", about: "To add who, which or that after a noun, use die with nouns that take de and dat with nouns that take het; put the verb last in that part of the sentence: de man die hier woont (the man who here lives), het boek dat ik lees (the book that I read).", after: ["dat", "de-het"], source: SERIES },
    imperative: { name: "Commands: kom hier", about: "Commands usually use the ik form without ik: Kom hier (come here), doe de deur dicht (do the door shut).", after: ["present"], source: SERIES },
    reflexive: { name: "Verbs with me, je, zich and ons", about: "Some verbs, including those for hurrying and remembering, need me with ik, je with jij/jullie, zich with hij/zij/het/u or plural zij, and ons with wij: Ik verveel me (I bore myself), ik herinner me dat (I remember myself that).", after: ["present"], source: SERIES },
    comparative: { name: "Comparisons: -er, meer, het -st, het meest", about: "Usually add -er for more; with zijn and no following noun, use het …-st for most. Some words use meer/het meest, dan means than, and a few change form: goed → beter → best (good → better → best), dit is groter dan dat (this is bigger than that).", after: ["adjective"], source: SERIES },
    future: { name: "gaan and zullen: talking about the future", about: "With another verb at the end, gaan can express a plan and zullen a promise or prediction: Ik ga morgen koken (I go tomorrow cook), ik zal je helpen (I will you help).", after: ["modal"], source: SERIES },
    object: { name: "me, je, hem: object words", about: "Object words include me/mij, je/jou, hem, haar, het, ons, jullie and ze. In a sentence starting with the subject, they usually follow the first verb: Ik zie hem (I see him), ik geef ze geld (I give them money).", after: ["present"], source: SERIES },
    possessive: { name: "mijn, jouw, ons: words for belonging", about: "Use mijn (my), jouw/je (your), zijn (his/its), haar (her), ons/onze (our), jullie (your, plural), hun (their) and uw (your, polite). Use ons with a noun that takes het, and onze with de or plurals: ons huis (our house), onze fietsen (our bikes).", after: ["de-het"], source: SERIES },
    "aan-het": { name: "zijn + aan het: happening right now", about: "To say what is happening right now, use a form of zijn + aan het + the full verb: Ik ben aan het koken (I am at the cooking), ze zijn aan het eten (they are at the eating).", after: ["zijn-hebben"], source: SERIES },
    "time-place": { name: "Time, then how, then where", about: "When time, how and place appear together, the usual order is time, how, place; English often puts time last: Ik ga morgen met de trein naar Utrecht (I go tomorrow with the train to Utrecht).", after: ["v2"], source: SERIES },
    "zijn-hebben": { name: "zijn and hebben: ik ben, ik heb", about: "The two most used verbs have their own forms: ik ben, jij bent, hij is, wij zijn; ik heb, jij hebt, hij heeft, wij hebben (u bent; u hebt or u heeft): Ik ben moe (I am tired), ze heeft een auto (she has a car).", after: ["present"], source: SERIES },
    demonstrative: { name: "deze, die, dit, dat: this and that", about: "Use deze (this/these) and die (that/those) with nouns that take de or are plural, and dit (this) and dat (that) with nouns that take het: dit huis (this house), die boeken (those books).", after: ["de-het"], source: SERIES },
    want: { name: "want: because, usual order", about: "To join sentences that have the verb second, use en (and), maar (but) or want (because). Each part keeps that order: Ik blijf thuis, want ik ben moe (I stay home, because I am tired).", after: ["omdat"], source: SERIES },
  },
};
