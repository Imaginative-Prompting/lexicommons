// Latin, classical (lang/index.js has what each field means). Written as Latin texts are, without macrons; a word with a
// long vowel carries its macrons as a reading (amo: amō), shown until you know the word (lang/readings.js, "vowels").
// Verbs are headworded in the I form (amo), nouns in the nominative, describing words in the masculine (magnus), as
// Latin dictionaries list them.

export default {
  name: "Latin",
  locale: "la",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  readings: "vowels",
  abbreviations: ["cf.", "e.g.", "i.e.", "etc.", "a.d.", "a.u.c.", "p.", "v."],
  stray: ["est", "et", "in", "non", "sed"],
  patterns: {
    endings: { name: "Who it is: endings on the verb", about: "A verb's ending says who does it, so ego (I) and tu (you) are usually left out: amo (I love), amas (you love), amat (he or she loves), amamus (we love).", after: [] },
    "word-order": { name: "The verb usually goes last", about: "The endings say who does what, so the order is free, but the verb usually comes last: Mater cenam parat (mother dinner makes).", after: ["endings"] },
    accusative: { name: "The object: -m", about: "What a verb acts on takes its object form, often ending in -m: puella → puellam, frater → fratrem, liber → librum (Librum lego: book I-read).", after: [] },
    genitive: { name: "Of: the genitive", about: "Of is an ending, and the owner usually follows the thing: liber puellae (book of-the-girl: the girl's book), nomen patris mei (name of-father my: my father's name).", after: [] },
    dative: { name: "To, for: the dative", about: "To or for someone is an ending: mihi (to me), tibi (to you): Da mihi aquam (give to-me water), Gratias tibi ago (thanks to-you I-do).", after: [] },
    ablative: { name: "In, from, with: the ablative", about: "in for where something is, ex for where it comes from, and cum for company all take the ablative: in urbe (in the city), ex urbe (from the city), cum amico (with a friend).", after: [] },
    motion: { name: "Going somewhere: the accusative", about: "Where you're going takes the accusative: in urbem (into the city), and a city's name alone with no in: Romam (to Rome).", after: ["accusative", "ablative"] },
    locative: { name: "At home, in Rome", about: "A few words, home and the names of cities, say where with an ending of their own and no in: domi (at home), Romae (in Rome).", after: ["ablative"] },
    agreement: { name: "Describing words match", about: "A describing word takes its noun's gender, number and case: domus magna (house big), cibus bonus (food good), clavis mea (key my); with no person or thing named, it's neuter: frigidum est (cold it-is: it's cold).", after: [] },
    esse: { name: "sum, es, est: be", about: "sum (I am), es (you are), est (is), sumus (we are), estis (you all are), sunt (they are); est usually comes last: Domus nostra magna est (house our big is).", after: ["endings"] },
    negation: { name: "non: not", about: "non goes before what it denies, usually right before the verb: Vinum non bibo (wine not I-drink).", after: [] },
    question: { name: "Questions", about: "A question word usually comes first (Ubi habitas? where you-live?, Quo vadis? where-to you-go?), and -ne joins the word being asked about, often the first, to ask yes or no: Possumusne…? (can-we…?).", after: [] },
    perfect: { name: "The past: the perfect", about: "The perfect says what happened, with its own stem and endings: veni (I came), legi (I read), cenavimus (we dined).", after: ["endings"] },
    future: { name: "The future: -bo, -am", about: "Most verbs make their future with -bo, -bis, -bit (laborabo: I'll work, cenabimus: we'll dine), some with -am, -es, -et (venient: they'll come), and eo (go) has ibo, ibimus.", after: ["endings"] },
    infinitive: { name: "volo, possum + the -re form", about: "After volo (I want) and possum (I can), the next verb is in its -re form, the infinitive: Aquam bibere volo (water to-drink I-want), Possumusne hic manere? (can-we here stay?).", after: ["endings"] },
    imperative: { name: "Telling someone to do something", about: "To tell one person to do something, use the command form, usually the infinitive without -re: venire → veni, dare → da, cavere → cave, claudere → claude.", after: [] },
  },
};
