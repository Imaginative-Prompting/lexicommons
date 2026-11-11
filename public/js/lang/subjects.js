// The subject pronouns a language may say or leave out, its verb's ending saying who (study/subjects.js): a sentence typed or said from its
// English is right with its subject said or left out, as the language allows. Each pronoun with the English subject it stands for. A polite
// form isn't here: it's never optional (Spanish's usted, Portuguese's o senhor and a senhora, Italian's Lei, whose English is "you", never
// lei's "she"). negation: the words a subject's verb may wait behind (no tomo, non bevo, não tomo).
// before: an adverb a subject may stand before or be left out of (Tú también quieres · También quieres; Yo todavía tengo · Todavía
// tengo). Italian's anche isn't one: it binds to its pronoun (anche io: never Anche vengo). openers: a word that starts the clause, the
// subject after it or before it (Entonces voy · Entonces yo voy · Yo entonces voy).
// A verb form's person: forms (irregular ones, as written) first, then endings (present tense, tried in order, the first that fits),
// besides whatever pronoun the language's own sentences put before that form. Whichever it is, the English's subject has to agree, so a
// form whose person these get wrong is never given a pronoun the English doesn't name (Me gusta el café, "I like coffee", never Yo).
// A language not here keeps its typed and spoken answers word for word.
const THIRD = { es: ["él", "ella"], it: ["lui", "lei"], pt: ["você", "ele", "ela"] };
export const SUBJECTS = {
  es: {
    pronouns: { yo: "I", tú: "you", él: "he", ella: "she", nosotros: "we", nosotras: "we" },
    negation: ["no"],
    before: ["también", "todavía"],
    openers: ["entonces"],
    forms: { es: THIRD.es, sé: ["yo"], he: ["yo"], ha: THIRD.es, has: ["tú"], eres: ["tú"], soy: ["yo"], voy: ["yo"], estoy: ["yo"], doy: ["yo"] },
    endings: [
      [/mos$/u, ["nosotros", "nosotras"]],
      [/(?:as|ás|es|és)$/u, ["tú"]],
      [/o$/u, ["yo"]],
      [/(?:a|á|e|é)$/u, THIRD.es],
    ],
  },
  it: {
    pronouns: { io: "I", tu: "you", lui: "he", lei: "she", noi: "we" },
    negation: ["non"],
    before: [],
    openers: ["allora"],
    forms: { è: THIRD.it, ho: ["io"], hai: ["tu"], ha: THIRD.it, sono: ["io"], sei: ["tu"], so: ["io"], sa: THIRD.it, può: THIRD.it, fa: THIRD.it, va: THIRD.it, sta: THIRD.it, dà: THIRD.it },
    endings: [
      [/iamo$/u, ["noi"]],
      [/o$/u, ["io"]],
      [/i$/u, ["tu"]],
      [/(?:a|e|à|è|ò)$/u, THIRD.it],
    ],
  },
  pt: {
    pronouns: { eu: "I", você: "you", ele: "he", ela: "she", nós: "we" },
    negation: ["não"],
    before: ["também", "ainda"],
    openers: ["então"],
    forms: { é: THIRD.pt, sei: ["eu"], sou: ["eu"], estou: ["eu"], vou: ["eu"], dou: ["eu"], tem: THIRD.pt, vem: THIRD.pt, quer: THIRD.pt, diz: THIRD.pt, faz: THIRD.pt, vai: THIRD.pt, dá: THIRD.pt, está: THIRD.pt },
    endings: [
      [/mos$/u, ["nós"]],
      [/o$/u, ["eu"]],
      [/(?:a|á|e|ê)$/u, THIRD.pt],
    ],
  },
};
