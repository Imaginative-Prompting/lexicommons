// Swahili (lang/index.js has what each field means). Standard Swahili (Kiswahili sanifu), whose norm grew from
// Zanzibar's speech, so its locale and flag are Tanzania's. Words are headworded as dictionaries list them: a verb by
// its stem (soma, not kusoma), an adjective by its stem (zuri), a noun in the singular (kiatu for viatu).

export default {
  name: "Swahili",
  locale: "sw-TZ",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["k.m.", "k.v.", "bw.", "bi.", "dkt.", "prof.", "s.l.p."],
  stray: ["ambaye"],
  patterns: {
    "noun-classes": { name: "Noun classes", about: "Every noun belongs to a class, and many classes come in pairs, one prefix for one and another for more than one: mtu, watu (person, people); kitabu, vitabu (book, books); kiatu, viatu (shoe, shoes).", after: [] },
    agreement: { name: "Words agree with their noun", about: "Adjectives, this and that, and numbers usually follow their noun and show its class (viatu vipya; filamu hii; viatu viwili), while verbs show their subject's class (treni ilichelewa), but people take human agreement even when the noun looks different: dada mmoja, kaka wawili, kaka anasoma.", after: ["noun-classes"] },
    "subject-prefix": { name: "Who or what: the verb's first part", about: "A verb starts with who or what does it: ni- (I), u- (you), a- (he, she), tu- (we), m- (you all), wa- (they), and a thing's class (i- for treni), so mimi or wewe is often left out: ninasoma, unasoma, anasoma.", after: [] },
    present: { name: "Now: -na-", about: "-na- after the subject marker says it's happening now or usually (ninasoma: I read, I'm reading; anaishi: she lives), and with I, everyday forms often start with na- in place of nina-: napenda, nataka, naomba, natumaini.", after: ["subject-prefix"] },
    "locative-copula": { name: "Being somewhere: -ko", about: "To say where someone or something is, Swahili joins its subject marker to -ko: niko (I am somewhere), yuko (he or she is somewhere), kiko (a kitu-class thing is somewhere), and ziko (funguo-class things are somewhere).", after: ["subject-prefix", "agreement"] },
    past: { name: "Before: -li-", about: "-li- after the subject marker says it happened: nilikuwa (I was), tulikula (we ate), ilichelewa (it was late).", after: ["subject-prefix"] },
    future: { name: "Later: -ta-", about: "-ta- after the subject marker says it will happen: nitaenda (I'll go), tutaonana (we'll see each other), and kutanyesha (it'll rain), where ku- is the weather 'it', not the ku- meaning 'to'.", after: ["subject-prefix"] },
    perfect: { name: "Done: -me-", about: "-me- says something is done, or still holds as a result: nimenunua (I've bought), nimechoka (I'm tired); not yet is -ja- in the negative, and never is -jawahi: sijala (I haven't eaten), sijawahi kwenda (I've never been).", after: ["subject-prefix"] },
    negation: { name: "Not: a new first part", about: "Not changes the start of the verb (si- for I, hu- for you, ha- for he or she: sijui, hujui, hajui), and in the present the end too, -a becomes -i: sinywi (I don't drink); hakuna is there isn't, sina I don't have.", after: ["subject-prefix"] },
    "object-infix": { name: "Who or what it's done to: inside the verb", about: "Who or what it's done to goes inside the verb, right before its stem: nitakupigia (I'll call you), anatusubiri (she's waiting for us), nisubiri (wait for me).", after: ["subject-prefix"] },
    locative: { name: "Where: -ni", about: "-ni on a noun says where: nyumbani (at home), dukani (to the store), mezani (on the table), kituoni (at the station).", after: [] },
    kuna: { name: "There is: kuna", about: "kuna is there is (Kuna kitabu mezani), hakuna there isn't (Hakuna maziwa), and they also say how it is: Leo kuna baridi (it's cold today).", after: [] },
    "na-have": { name: "Having: nina", about: "Having is who plus na: nina (I have), una (you have), tuna (we have), and not having sina: Nina dada mmoja; Leo sina muda.", after: ["subject-prefix"] },
    of: { name: "Of: -a after the noun's class", about: "Of is -a with the first noun's class before it: gari la baba (Dad's car), glasi ya maji (a glass of water), kituo cha basi (the bus stop).", after: ["agreement"] },
    possessive: { name: "My, your: after the noun", about: "My (-angu) and your (-ako) come after the noun and take its class (jina lako: your name; viatu vyangu; funguo zangu: my keys), and many family words take y-: mama yangu, kaka yangu.", after: ["agreement"] },
    question: { name: "Questions: statement order", about: "A yes/no question keeps a statement's order and changes only its intonation, and a question word stays where its answer would be: Unaenda wapi? (Where are you going?); Utafanya nini wikendi?", after: [] },
    imperative: { name: "Telling someone to do something", about: "A command to one person is usually the verb's stem (Funga: close; Subiri: wait); for more than one, a final -a becomes -eni and other final vowels take -ni (Fungeni, Subirini), and a few are their own: Lete (bring), Nenda (go), Njoo (come).", after: [] },
    infinitive: { name: "To do: ku-", about: "ku- before the stem is to do, after verbs like weza (can), penda (like) and taka (want): Unaweza kufunga dirisha?; Napenda kupika.", after: [] },
    subjunctive: { name: "That I do: -e", about: "Swahili uses the subjunctive after lazima for an obligation, in let's commands, and in commands that put the person or thing acted on inside the verb; final -a becomes -e, while other final vowels stay: Lazima niende; Twende; Nisubiri; Nijulishe.", after: ["subject-prefix"] },
    "copula-ni": { name: "Am, is, are: ni", about: "ni links someone or something to a name, kind, or description and never changes for am, is or are; its negative is si (Mimi ni mwalimu; Mimi si mwalimu), while location uses -ko forms instead.", after: [] },
    "ki-when": { name: "When or if: -ki-", about: "-ki- after the subject marker says when, if or while something happens: Nikifika nyumbani, nitapika (When I get home, I'll cook); Ukiwa tayari, twende; Mvua ikinyesha, tutabaki nyumbani.", after: ["subject-prefix"] },
    "short-verbs": { name: "Short verbs keep ku-", about: "A few one-syllable verbs keep ku- in many forms (ninakunywa: I drink; tulikula: we ate; utakuja: you'll come), but drop it in others: sinywi (I don't drink).", after: ["subject-prefix"] },
    "no-articles": { name: "No a or the", about: "Swahili has no words for a, an or the: Mimi ni mwalimu (I'm a teacher); Kuna kitabu mezani.", after: [] },
  },
};
