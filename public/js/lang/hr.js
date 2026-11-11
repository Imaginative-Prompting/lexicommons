// Croatian (lang/index.js has what each field means). Standard Croatian (ijekavian, as Zagreb writes it); pattern ids
// follow the other Slavic catalogs (pl.js, ru.js, uk.js) where they mean the same thing.

export default {
  name: "Croatian",
  locale: "hr-HR",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["npr.", "tj.", "itd.", "sl.", "dr.", "prof.", "g.", "ul.", "br.", "str.", "god.", "min."],
  stray: ["je", "se", "li", "u", "na", "ne"],
  patterns: {
    present: { name: "Present tense endings", about: "A verb's ending says who does it: radim (I work), radiš (you work), radi (she works), radimo (we work), rade (they work).", after: [] },
    "no-pronoun": { name: "No subject pronoun, or English it or there, needed", about: "Croatian usually leaves out a subject pronoun when the verb or context identifies it, and it uses no dummy word for the it in “It’s raining” or the there in “There’s no milk”: Radim (I-work), Pada kiša (falls rain: it’s raining).", after: ["present"] },
    biti: { name: "Am, is, are: sam, si, je", about: "biti has short forms sam, si, je, smo, ste, and su; its negative forms include nisam (I am not), nisi (you are not), and nije (he, she, or it is not).", after: [] },
    clitics: { name: "Short words go second", about: "Short forms such as sam, se, mi, te, and ću normally form a cluster after the first word or phrase: Kako se zoveš? (how / yourself / you-call?), Nazvat ću te (call / I-will / you); in questions, li follows the first verb (Je li…?, Govoriš li…?).", after: ["biti"] },
    gender: { name: "Masculine, feminine, neuter", about: "Every noun is masculine (stol), feminine (torba) or neuter (mlijeko), mostly told by its ending, and the words with it match: moj stol, moja torba, moje mlijeko.", after: [] },
    adjective: { name: "Adjectives match", about: "An adjective takes the gender, number and case of its noun: mali stan (small apartment), u malom stanu (in a small apartment), velika kuhinja (big kitchen).", after: ["gender"] },
    accusative: { name: "The object: accusative", about: "What a verb acts on takes the accusative, which changes feminine -a to -u (Pijem kavu: I-drink coffee); u or na + accusative is where you go: Idem u dućan (I-go into store).", after: ["gender"] },
    locative: { name: "Where: u or na + locative", about: "Where something is takes u (in) or na (on, at) with the locative, often ending in -u or -i: u Zagrebu (in Zagreb), na stolu (on the table).", after: ["accusative"] },
    genitive: { name: "Of, from, and after amounts: the genitive", about: "The genitive says of and from, and follows amounts and words like iz, bez and kod: čaša vode (glass of-water), iz Amerike (from America), deset minuta (ten minutes).", after: ["gender"] },
    "genitive-negation": { name: "nema + genitive", about: "nema (there isn't) puts what's missing in the genitive: Nema mlijeka (there-isn't of-milk).", after: ["genitive"] },
    dative: { name: "To someone, and liking: the dative", about: "The dative is to or for someone, and with sviđa se it says who likes something: Sviđa mi se film (pleases to-me itself the film: I like the film), Hladno mi je (cold to-me is: I'm cold).", after: [] },
    instrumental: { name: "With and by: the instrumental", about: "s (with) takes the instrumental, and so does the way you travel or pay, with no word for by: kava s mlijekom (coffee with milk), autobusom (by bus).", after: ["gender"] },
    ne: { name: "ne before the verb", about: "ne goes right before the verb (Ne znam: not I-know), and joins biti, imati and htjeti into one word: nisam (I'm not), nemam (I don't have), neću (I won't).", after: [] },
    question: { name: "Questions: li, je li, or a question word", about: "A yes-or-no question puts li after the verb (Govoriš li engleski? you-speak (question) English?) or starts with je li; a question word comes first: Gdje je kolodvor? (where is station?).", after: ["clitics"] },
    past: { name: "Past tense by gender", about: "The past is sam, si, je… with a form of the verb that ends -o for a man and -la for a woman: Tata je radio (dad is worked), Baka je pekla (grandma is baked).", after: ["biti", "gender"] },
    future: { name: "Future: ću + infinitive", about: "ću, ćeš, će… with the infinitive says what will happen: Sutra ću raditi (tomorrow I-will work); when a -ti infinitive comes first it drops its final -i (Radit ću), while a -ći infinitive keeps it (Ići ću).", after: ["clitics"] },
    modal: { name: "moram, mogu, želim + infinitive", about: "After moram (I must), mogu (I can) and želim (I want), the next verb is an infinitive, usually ending -ti or -ći: Moram ići (I-must go).", after: ["present"] },
    imperative: { name: "Commands and requests", about: "Use the imperative to tell or ask someone to do something: Javi mi! (let-know to-me), Dođi ovamo! (come here).", after: ["present"] },
    se: { name: "Verbs with se", about: "Some verbs use se: zvati se means to be called, vidjeti se can mean to see each other, and nadati se means to hope.", after: ["clitics"] },
  },
};
