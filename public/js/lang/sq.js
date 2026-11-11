// Albanian, as the unified standard writes it (lang/index.js has what each field means). Verbs are headworded in the
// first person present, as Albanian dictionaries list them (kam, jam, dua), describing words with their article (i vogël).

export default {
  name: "Albanian",
  locale: "sq-AL",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["etj.", "p.sh.", "sh.", "z.", "znj.", "nr.", "fq.", "dr."],
  stray: ["të", "nuk", "e", "i", "në", "po"],
  patterns: {
    present: { name: "Present tense endings", about: "A verb's ending says who does it, so unë (I) and ti (you) are usually left out: jetoj (I live), jeton (you live), jetojmë (we live).", after: [] },
    "jam-kam": { name: "jam and kam: be and have", about: "jam (I am), je, është… and kam (I have), ke, ka…; Albanian has hunger and cold where English is hungry and cold: Kam uri (I-have hunger), Kam ftohtë (I-have cold).", after: ["present"] },
    definite: { name: "the at the end", about: "the joins the end of the noun: libër → libri (the book), motër → motra (the sister), fëmijë → fëmijët (the children).", after: [] },
    gender: { name: "Masculine and feminine", about: "A noun is masculine or feminine, and the words with it match: shoku im (friend-the my, a man), shoqja ime (friend-the my, a woman), supa e shijshme (soup-the the tasty).", after: ["definite"] },
    "adjective-article": { name: "Describing words with their own little article", about: "Most describing words come after the noun with a little word of their own (i, e, të or së) that matches it: një shtëpi e madhe (a house the big), një qen të zi (a dog the black, as the object).", after: ["gender"] },
    possessive: { name: "im, ime: my, after the noun", about: "my comes after the noun and matches it: shoku im (friend-the my), motra ime (sister-the my), prindërit e mi (parents-the the my).", after: ["gender"] },
    genitive: { name: "Of: i, e, të, së + the owner", about: "The owner follows the thing with i, e, të or së and changes form: makina e babait (car-the of dad-the), stacioni i trenit (station-the of train-the).", after: ["definite", "gender"] },
    accusative: { name: "The object: -n", about: "What a verb acts on takes its object form, often ending in -n: darka → darkën (the dinner, as the object), autobusi → autobusin.", after: ["definite"] },
    "object-pronoun": { name: "e: it, before the verb", about: "e (it, him, her) goes before the verb, and also doubles a named object: E di (it I-know), E pi kafen (it I-drink coffee-the).", after: ["accusative"] },
    negation: { name: "nuk: not", about: "nuk goes before the verb and any little pronoun in front of it: Nuk e di (not it I-know).", after: ["present"] },
    question: { name: "Questions", about: "A often starts a yes-or-no question (A ke fëmijë? whether you-have children?), and a question word comes first: Ku është banjoja? (where is bathroom-the?).", after: [] },
    "te-subjunctive": { name: "të + verb: to", about: "After dua (want), mund (can), duhet (must) and shpresoj (hope), the next verb follows të with its own ending: Dua të pi (I-want that I-drink).", after: ["present"] },
    future: { name: "Future: do të", about: "do të followed by the same verb form used after të says what will happen: Do të shkoj (will that I-go).", after: ["te-subjunctive"] },
    past: { name: "The past", about: "The simple past has endings of its own: lexova (I read), hëngra (I ate), fjeta (I slept).", after: ["present"] },
    plural: { name: "More than one", about: "Nouns change for more than one, and the words with them follow: një vëlla (one brother), dy vëllezër (two brothers), fëmijët (the children).", after: ["definite"] },
    "ka-existential": { name: "ka: there is", about: "ka (has) also says there is or there are: Ka bukë? (has bread?), Nuk ka qumësht (not has milk).", after: ["jam-kam"] },
    imperative: { name: "Commands", about: "A command to ti uses a command form: Eja! (come!), Shko! (go!), Prit! (wait!).", after: ["present"] },
    po: { name: "po: right now", about: "po before the verb says it's going on right now: Po shkoj (now I-go: I'm going), Po bie shi (now falls rain: it's raining).", after: ["present"] },
  },
};
