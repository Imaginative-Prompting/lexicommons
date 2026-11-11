// Galician, as the Royal Galician Academy's standard writes it (lang/index.js has what each field means).

export default {
  name: "Galician",
  locale: "gl-ES",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["sr.", "sra.", "srta.", "dr.", "dra.", "prof.", "av.", "páx.", "núm.", "tel.", "etc.", "p.", "ex.", "aprox."],
  stray: ["non", "o", "se", "que", "de", "me"],
  patterns: {
    present: { name: "Present-tense endings", about: "The verb's ending says who does it, so Galician usually leaves eu and ti out: falo (I speak), falas (you speak), falamos (we speak).", after: [] },
    gender: { name: "Gender and agreement", about: "Every noun is masculine or feminine, and o or a, un or unha and the adjectives with it match it: o coche novo, a casa nova, as casas novas.", after: [] },
    possessive: { name: "o meu, a miña: my", about: "meu, miña, teu, túa match the thing owned, and usually come after o or a: a miña irmá (the my sister), o teu móbil (the your phone).", after: ["gender"] },
    "adjective-after": { name: "Adjectives after the noun", about: "Most describing words come after the noun: unha casa amarela (a house yellow).", after: ["gender"] },
    negation: { name: "non before the verb", about: "non comes before the verb, and pulls a little pronoun in front of the verb with it: Non sei (not I-know), Non me gusta (not to-me pleases).", after: [] },
    question: { name: "Questions", about: "A yes-or-no question can keep a statement's order (Falas inglés? you-speak English?), and a question word starts the question after any preposition it needs: Onde está a estación? (where is the station?), A que te dedicas? (to what yourself you-devote?).", after: [] },
    "ser-estar": { name: "ser and estar", about: "ser says who or what someone or something is, estar where it is and how it is just now: A miña irmá é médica (the my sister is doctor), Está na casa (is in-the house).", after: [] },
    "pronoun-after": { name: "Little pronouns after the verb", about: "In a plain statement, me, te, se, lle and the rest join the end of the verb (Chámome… I-call-myself…, Gústame: pleases-to-me); after non, a question word or que they go before it: Como te chamas? (how yourself you-call?).", after: ["negation", "question"] },
    gustar: { name: "gustar: liking", about: "Galician says what you like pleases you, with the one who likes as a little pronoun: Gústame o café (pleases-to-me the coffee), Gústanme as froitas (please-to-me the fruits).", after: ["pronoun-after"] },
    modal: { name: "Verb + infinitive", about: "After querer, poder and ter que, the next verb is in its basic form, the infinitive, with no word for to: Quero comer (I-want eat), Teño que traballar (I-have that work: I have to work).", after: [] },
    "ir-inf": { name: "ir + infinitive: going to", about: "vou, vas, imos and an infinitive say what's going to happen: Vou chamar (I-go call: I'm going to call).", after: ["modal"] },
    progressive: { name: "estar + -ndo: right now", about: "estar with a verb ending in -ando, -endo or -indo says what's happening right now: Estou lendo (I-am reading).", after: ["ser-estar"] },
    past: { name: "Past in one word", about: "For a completed past event, standard Galician uses one past-tense verb where English may use have + a past form: Comín (I-ate), Xa comín (already I-ate: I've already eaten).", after: [] },
    contraction: { name: "no, da, ao, coa: a little word + the", about: "en, de, a, con and por join the word for the after them: na casa (in-the house), do meu pai (of-the my father), ao cine (to-the movies), coa miña nai (with-the my mother).", after: ["gender"] },
    hai: { name: "hai: there is", about: "hai has the same form with one or many: Hai pan (there-is bread: there's bread), Hai dous cuartos (there-is two rooms: there are two rooms).", after: [] },
    "ter-fame": { name: "ter fame: I'm hungry", about: "Where English says I'm hungry, thirsty or cold, Galician says I have: Teño fame (I-have hunger), Teño frío (I-have cold).", after: [] },
  },
};
