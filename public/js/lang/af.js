// Afrikaans (lang/index.js has what each field means). Its article 'n is written with an apostrophe, and a sentence
// may start with it: 'n Boek lê op die tafel.

export default {
  name: "Afrikaans",
  locale: "af-ZA",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["mnr.", "mev.", "dr.", "prof.", "bv.", "d.w.s.", "nr.", "ds.", "me.", "mej.", "m.a.w.", "a.g.v.", "nl.", "bl."],
  stray: ["wie"],
  patterns: {
    daar: { name: "There is: daar is", about: "daar is (there is, there are) says what there is: Daar is 'n boek op die tafel; Daar is nie melk in die yskas nie.", after: ["present"] },
    graag: { name: "Liking to do: graag", about: "graag after the verb says you like doing it: Ek kook graag (I like cooking); Ons speel graag sokker.", after: ["present"] },
    pronouns: { name: "I, me and my; you and your: ek and my, jy and jou", about: "ek and jy are I and you as the subject, my and jou are me and you after a verb or a word like vir, and my and jou before a noun are my and your: Praat jy Engels?; Wag vir my!; Wat is jou naam?", after: [] },
    question: { name: "Questions: the verb first", about: "A yes/no question puts the verb first (Praat jy Engels? Do you speak English?), and a question word like waar, wat or hoe comes before the verb; Afrikaans adds no do.", after: ["present"] },
    present: { name: "The present: one form for everyone", about: "A present-tense verb has one form for every person. It can say what's usual, what's happening now, or, when the context points ahead, what is planned for later: ek woon, jy woon; Ouma wag; Môre gaan ek met die bus werk toe. To be is is for everyone: ek is, hulle is.", after: [] },
    "verb-second": { name: "The verb comes second", about: "In a main sentence the verb comes second, so when something else starts it, the subject goes after the verb: Gister was ek by die huis; Nou moet ek gaan.", after: ["present"] },
    "verb-last": { name: "Verbs at the end", about: "In a main sentence, a helper verb like het, sal, kan or moet leaves the other verb at the end (Ek het nuwe skoene gekoop; Kan ek 'n glas water kry?), and in standard Afrikaans a dependent clause introduced by as, waar or dat puts its whole verb group at the end of that clause, before a closing nie if there is one: Ek weet nie waar hy woon nie.", after: ["verb-second"] },
    "double-negation": { name: "Not twice: nie … nie", about: "Most negative clauses end in a closing nie: Ek drink nie koffie nie. A negative word such as nooit normally still takes that closing nie: Ek was nog nooit in Durban nie. When the first nie is already clause-final, the two positions coincide and only one nie appears: Ek weet nie.", after: ["present"] },
    past: { name: "The past: het + a participle", about: "In a main sentence, most pasts use het and put the verb's participle at the end; the participle often starts with ge- (Ons het pizza geëet; Ek het nuwe skoene gekoop), but not always: Ek het vergeet.", after: ["verb-last"] },
    was: { name: "Pasts without het: was, kon, wou, moes", about: "A few verbs keep a past of their own: was (was, were), kon (could), wou (wanted), moes (had to): Die trein was laat; Ek was nog nooit in Durban nie.", after: ["present"] },
    future: { name: "Later: sal or gaan", about: "sal (will) or gaan (going to) with the main verb at the end says what will happen: Ek sal jou môre bel; Môre gaan dit reën; and when gaan is itself the movement verb, it does not form this future construction, even if the trip is later: Saterdag gaan ons na Ouma toe.", after: ["verb-last"] },
    articles: { name: "die and 'n", about: "die is the (for every noun, one or many), and 'n is a or an: die stasie, die skoene, 'n boek.", after: [] },
    se: { name: "Whose: se", about: "se after a noun says whose, like English 's: my pa se kar (my dad's car), my suster se man.", after: ["articles"] },
    adjective: { name: "Adjectives: before a noun, and on their own", about: "Before a noun some adjectives take -e (nuut: nuwe skoene) while others normally stay unchanged ('n klein woonstel, 'n groot kombuis); on their own, after is, they take none (Dit is koud); after iets, standard Afrikaans normally adds -s (iets soets), although some speakers leave it off (iets soet).", after: [] },
    plural: { name: "More than one: -e or -s", about: "Most plurals end in -e or -s: skoen, skoene; broer, broers; sleutel, sleutels; eier, eiers.", after: [] },
    separable: { name: "Verbs that split", about: "Some verbs start with a small word that goes to the end in a plain main sentence (toemaak, to close: Maak die deur toe; saamkom, to come along: Kom jy saam?), but stays joined after kan, wil or moet: Kan jy die venster toemaak?", after: ["verb-second"] },
    toe: { name: "Going somewhere: … toe", about: "Where you're going can take toe after it, with no word before (winkel toe: to the store; werk toe; strand toe), or na before it as well: na Ouma toe.", after: [] },
    "om-te": { name: "The infinitive: om … te", about: "om starts a to-phrase and te comes before its verb, so together they're English to, whether giving a purpose or finishing a thought: om brood te koop (to buy bread); Ek is bly om jou te ontmoet (glad to meet you).", after: ["verb-last"] },
    modal: { name: "can, want, must", about: "kan (can), wil (want) and moet (must, have to) take the main verb at the end, with no to: Ek wil iets soets eet; Nou moet ek gaan; Ons kan 'n taxi neem.", after: ["verb-last"] },
    imperative: { name: "Telling someone to do something", about: "A command is the plain verb, the same to one person or more: Wag vir my!; Maak die deur toe; Laat weet my!", after: ["present"] },
  },
};
