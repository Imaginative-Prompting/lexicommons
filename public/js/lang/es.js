// Spanish (lang/index.js has what each field means).

export default {
  name: "Spanish",
  locale: "es-US",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["sr.", "sra.", "srta.", "sres.", "dr.", "dra.", "d.", "dña.", "ud.", "uds.", "pág.", "núm.", "tel.", "av.", "aprox.", "etc.", "p.ej.", "ej."],
  stray: ["no", "lo", "se", "que", "de", "ya"],
  // Words a woven line shows side by side, written as Spanish writes them: a el is al, de el is del (never before a
  // capitalized El, a name's: de El Salvador; él, he, has its accent and never joins).
  joins: { contract: { "a el": "al", "de el": "del" }, articles: ["el"] },
  patterns: {
    present: { name: "Present-tense endings", about: "A verb's ending changes with who does it: hablo (I speak), hablas (you speak), habla (he or she speaks).", after: [] },
    "no-subject": { name: "No subject needed", about: "Spanish often leaves out subject words when the verb's ending makes the person clear, and weather verbs have no word for it: Hablo (I speak), Llueve (rains).", after: ["present"] },
    gender: { name: "Gender and agreement", about: "Every noun is masculine or feminine, and the words with it match it: el libro nuevo, la casa nueva, las casas nuevas.", after: [] },
    "adjective-after": { name: "Adjectives after the noun", about: "Most describing words come after the noun: una casa pequeña (a house small).", after: ["gender"] },
    negation: { name: "no before the verb", about: "no goes right before the verb, and before any little pronoun in front of it: No lo sé (not it I know).", after: [] },
    question: { name: "Questions", about: "A question opens with ¿ and closes with ?, and after a question word the subject usually follows the verb: ¿Dónde vive tu hermano? (where lives your brother).", after: [] },
    "ser-estar": { name: "ser and estar", about: "Spanish has two verbs for to be: ser for what someone or something is (and where an event takes place), estar for where a person or thing is and how they are: Es mi hermana (she is my sister), Está en casa (she is at home).", after: [] },
    hay: { name: "hay: there is, there are", about: "One word, hay, says both there is and there are: Hay dos baños (there are two bathrooms).", after: [] },
    "object-pronoun": { name: "Pronouns before the verb", about: "Little words for it, him, her, me, you and us (lo, la, me, te, nos) go before the verb: Lo veo (it I see).", after: ["no-subject"] },
    "personal-a": { name: "a before a person", about: "When the verb acts on a specific person (or a pet), a goes in front of them: Veo a mis padres (I see to my parents).", after: [] },
    gustar: { name: "gustar: liking", about: "To like something, you say it pleases you: Me gusta el café (to me pleases the coffee), so the verb matches the thing you like.", after: ["object-pronoun"] },
    reflexive: { name: "Reflexive verbs", about: "Some verbs come with me, te, se or nos before the verb, pointing back to whoever does it: Me levanto (myself I raise: I get up).", after: ["object-pronoun"] },
    modal: { name: "Verb + infinitive", about: "After querer, poder, necesitar and tener que, the next verb is in its basic form, the infinitive: Quiero comer (I want to eat).", after: [] },
    "ir-a": { name: "ir a: going to", about: "voy a, vas a, va a and an infinitive say what's going to happen: Voy a comer (I go to eat).", after: ["modal"] },
    "pronoun-attached": { name: "Pronouns joined to the infinitive", about: "With an infinitive, the little pronoun can join its end as one word: Quiero verte (I want to see-you).", after: ["object-pronoun", "modal"] },
    progressive: { name: "estar + -ando, -iendo: right now", about: "estar with a verb ending in -ando or -iendo says what's happening right now: Estoy comiendo (I am eating).", after: ["ser-estar"] },
    perfect: { name: "Present perfect: haber + participle", about: "The present perfect puts a form of haber before the participle, and any little pronoun goes before haber: Lo he visto (it I have seen).", after: ["object-pronoun"] },
    past: { name: "Simple past", about: "One word with its own ending says what happened and is over: Ayer comí paella (yesterday I ate paella).", after: [] },
    tener: { name: "tener: I have hunger", about: "Where English says I'm hungry or I'm twenty, Spanish says I have: Tengo hambre (I have hunger), Tengo veinte años (I have twenty years).", after: [] },
    de: { name: "de: of", about: "Spanish joins nouns with de where English puts one before the other: la estación de tren (the station of train), la casa de mis abuelos (the house of my grandparents).", after: [] },
  },
};
