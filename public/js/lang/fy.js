// West Frisian, in the standard spelling (the Frysk Standertwurdlist; lang/index.js has what each field means). A verb
// with do built into it (hasto, kinsto) is headworded under the verb (hawwe, kinne).

export default {
  name: "West Frisian",
  locale: "fy-NL",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["bgl.", "ensfh.", "nr.", "dr.", "mr.", "st."],
  stray: ["net", "ek", "it", "noch", "de", "te"],
  patterns: {
    present: { name: "Verb endings with ik, do, hy and the rest", about: "A verb's ending changes with who does it: ik wurkje (I work), do wurkest (you work), hy wurket (he works), wy wurkje (we work).", after: [] },
    v2: { name: "Verb second", about: "In a statement the verb comes second. Start with a time word, and the subject moves after the verb: Moarn gean ik nei de stêd (tomorrow go I to the town).", after: ["present"] },
    question: { name: "Questions: verb first", about: "A yes-or-no question starts with its verb, and after a question word the verb comes next; do can join the verb as -sto, -ste or -st: Hasto bern? (have-you children?), Hoe hjitsto? (how are-called-you?).", after: ["v2"] },
    gender: { name: "de and it", about: "A singular noun takes de or it for the, every plural takes de, and a is in: de kat (the cat), it hûs (the house), in hûs (a house).", after: [] },
    possessive: { name: "myn, dyn, ús: my, your, our", about: "my is myn, your dyn and our ús, the same before every noun: myn mem (my mom), ús hûs (our house).", after: [] },
    jo: { name: "jo: you, politely", about: "To someone you don't know, you is jo, with the verb's plural form: Wêr wenje jo? (where live you?).", after: ["present"] },
    net: { name: "Where net goes", about: "net (not) usually comes near the end, after the object and the time words: Ik begryp it net (I understand it not).", after: ["v2"] },
    gjin: { name: "gjin: no, not a", about: "Before a noun, Frisian says gjin (no) where English says not a or not any: Ik haw gjin auto (I have no car).", after: [] },
    der: { name: "der is, der binne: there is", about: "der is says there is and der binne there are: Der is gjin molke mear (there is no milk more: there's no more milk).", after: ["v2"] },
    graach: { name: "graach: liking to do", about: "To say you like doing something, put graach (gladly) after the verb: Ik drink graach kofje (I drink gladly coffee); Ik woe graach (I would gladly) is I'd like.", after: ["v2"] },
    modal: { name: "wolle, kinne, moatte: second verb last", about: "With wolle (want), kinne (can) or moatte (must), the second verb goes to the end, with no word for to: Ik wol Frysk leare (I want Frisian learn).", after: ["v2"] },
    "te-en": { name: "te and the verb's -n form", about: "After te (to), a verb takes its form ending in -n: Ik besykje Frysk te learen (I try Frisian to learn), om te iten (for to eat); after wolle, kinne and moatte it takes its plain form: Ik wol leare.", after: ["modal"] },
    separable: { name: "Verbs that split", about: "Verbs like opstean (get up) split: the verb comes second and the little word goes to the end: Ik stean om sân oere op (I stand at seven o'clock up).", after: ["v2"] },
    perfect: { name: "The past with hawwe", about: "For most verbs, use hawwe (have) and put the main verb's past form at the end: Ik haw de keuken skjinmakke (I have the kitchen cleaned).", after: ["v2"] },
    "weze-perfect": { name: "The past with wêze", about: "gean (go) and some other verbs of moving or changing take wêze (be) instead of hawwe: Ik bin nei Ljouwert gien (I am to Leeuwarden gone).", after: ["perfect"] },
  },
};
