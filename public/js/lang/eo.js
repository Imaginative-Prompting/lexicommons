// Esperanto (lang/index.js has what each field means). Its endings say what a word does (-o a noun, -a a describing
// word, -n the object), so word order is free, and a wrong version is a wrong ending, never a different order.

export default {
  name: "Esperanto",
  locale: "eo",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["k.t.p.", "ktp.", "ekz.", "t.e.", "k.a.", "p.s.", "n-ro."],
  stray: ["la", "de", "kaj", "ne", "estas", "en"],
  patterns: {
    endings: { name: "Endings tell you the word's job", about: "The endings -o, -a, -e and -i can make domo a noun (house), granda a describing word (big), rapide a how-word (quickly) and manĝi a basic verb (to eat).", after: [] },
    article: { name: "la: the, and no a", about: "la means the, for one or many, and there's no word for a: la domo (the house), domo (a house).", after: ["endings"] },
    plural: { name: "More than one: -j", about: "-j makes the plural, on the noun and on every describing word with it: belaj domoj (beautiful-s houses).", after: ["endings"] },
    accusative: { name: "The object: -n", about: "-n marks what a verb acts on, on the noun and its describing words, so the order can change: Mi legas libron (I read book-n), Libron mi legas (book-n I read).", after: ["endings", "plural"] },
    tenses: { name: "Tenses: -as, -is, -os", about: "A verb ends in -as now, -is in the past and -os in the future, the same for everyone: mi manĝas (I eat), vi manĝis (you ate), ili manĝos (they will eat).", after: ["endings"] },
    esti: { name: "esti: to be", about: "estas (am, is, are) never changes with who: Mi estas laca (I am tired), Ili estas hejme (they are at-home).", after: ["tenses"] },
    negation: { name: "ne: not", about: "ne goes right before what it denies, usually the verb: Mi ne scias (I not know).", after: [] },
    question: { name: "Questions: ĉu and ki- words", about: "ĉu (whether) marks a yes-or-no question: Ĉu vi parolas angle? (whether you speak English-ly?); a ki- word asks for missing information and normally comes early: Kie vi loĝas? (where you live?).", after: [] },
    correlatives: { name: "The ki-, ti-, i-, ĉi- and neni- words", about: "Words for questions, that, some, every and no come in families: kie (where), tie (there), ie (somewhere), ĉie (everywhere), nenie (nowhere); the separate ĉi in ĉi tie means nearby.", after: ["question"] },
    possessive: { name: "mia, via: my, your", about: "mia (my), via (your), lia (his), ŝia (her) end in -a and take -j and -n like describing words: miaj amikoj (my-s friends), mian libron (my-n book-n).", after: ["plural", "accusative"] },
    direction: { name: "Going to: -n for direction", about: "-n on a place shows movement toward it, as in hejmen (to home) and en la domon (into the house); without -n, en la domo is in the house.", after: ["accusative"] },
    mal: { name: "mal-: the opposite", about: "mal- before a word makes its opposite: bona (good) → malbona (bad), granda (big) → malgranda (small), varma (warm) → malvarma (cold).", after: ["endings"] },
    "word-building": { name: "Building words: -ej-, -ist-, -in-", about: "Pieces inside a word build new words from it: lerni (learn) → lernejo (school: place for learning), kuiri (cook) → kuiristo (a cook), frato (brother) → fratino (sister).", after: ["endings"] },
    modal: { name: "Two verbs: the second ends in -i", about: "After povi (can), devi (must), voli (want) and ŝati (like), the next verb ends in -i: Mi volas manĝi (I want eat-i).", after: ["tenses"] },
    weather: { name: "Weather has no it", about: "Esperanto leaves out English it in weather sentences: Morgaŭ pluvos (tomorrow will-rain), Estas varme (is warm-ly).", after: ["esti"] },
    imperative: { name: "Asking and telling: -u", about: "-u says do it, or let's: Venu! (come-u: come!), Ni iru (we go-u: let's go).", after: ["tenses"] },
  },
};
