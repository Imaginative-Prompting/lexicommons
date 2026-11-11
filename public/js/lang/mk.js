// Macedonian (lang/index.js has what each field means). Verbs are headworded in the third person present, as
// Macedonian dictionaries list them (чита, живее); the article joins the end of the word, in three kinds.

export default {
  name: "Macedonian",
  locale: "mk-MK",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["итн.", "т.е.", "г.", "гр.", "бр.", "стр.", "проф.", "др.", "ул.", "доц.", "акад."],
  stray: ["не", "се", "да", "ќе", "на", "го"],
  patterns: {
    present: { name: "Present tense endings", about: "A verb's ending says who does it, so јас (I) and ти (you) are usually left out: живеам (I live), живееш (you live), живее (lives).", after: [] },
    sum: { name: "сум: to be", about: "сум (am), си (are), е (is), сме, сте, се (are) say what someone or something is, where it is, or where it is from: Јас сум од Америка (I am from America).", after: ["present"] },
    definite: { name: "the at the end", about: "the joins the end of the first word of the phrase: -от, -та, -то or -те: автобусот (bus-the), куќата (house-the), децата (children-the).", after: ["gender"] },
    "near-far": { name: "This and that at the end", about: "Macedonian also uses -ов/-ва/-во/-ве for something near and -он/-на/-но/-не for something far: куќава (house-this), куќана (house-that), викендов (weekend-this).", after: ["definite"] },
    gender: { name: "Masculine, feminine, neuter", about: "A noun is masculine (лебот), feminine (куќата) or neuter (кафето), and the words with it match: мал, мала, мало (small).", after: [] },
    adjective: { name: "Describing words match", about: "A describing word comes before its noun and takes its gender and number: мала куќа (small house), црно куче (black dog).", after: ["gender"] },
    possessive: { name: "My and mine: ми with family, мој elsewhere", about: "With close family, short ми follows the noun (сестра ми: sister my); elsewhere, forms of мој can come before a noun (мојот пријател: my friend) or stand alone (книгава е моја: book-this is mine).", after: ["definite"] },
    prepositions: { name: "Most nouns stay the same after a preposition", about: "Most nouns keep the same form after a preposition, and на or sometimes од can say whose: во куќата (in house-the), колата на татко ми (car-the of father my).", after: ["definite"] },
    negation: { name: "не: not", about: "не goes before the verb and any short pronoun with it: Не разбирам (not I-understand).", after: ["present"] },
    question: { name: "Yes-or-no and question-word questions", about: "A yes-or-no question can start with дали (Дали имаш деца?: whether / you-have / children), put ли after the part being asked about, often the verb (Има ли леб?: there-is / (question) / bread), or use question intonation alone; a question word such as каде usually comes first.", after: [] },
    da: { name: "да + verb: to", about: "After сака (want), може (can), мора (must), the next verb follows да with its own ending: Сакам да пијам (I-want that I-drink).", after: ["present"] },
    future: { name: "Future: ќе", about: "ќе before the verb says what will happen: Ќе одам (will I-go), Утре ќе врне (tomorrow will it-rain).", after: ["present"] },
    past: { name: "The past", about: "A finished event has its own past form: прочитав (I read), легнав (I lay down); the form doesn't change for a man or a woman.", after: ["present"] },
    plural: { name: "More than one", about: "A noun changes for more than one, and the verb's ending matches: клучот (key-the), клучевите (keys-the); децата спијат (children-the sleep).", after: ["definite"] },
    "ima-nema": { name: "има, нема: there is, there isn't", about: "има (has) also means there is or there are, and нема means there isn't or there aren't: Има ли леб? (there-is / (question) / bread), Нема млеко (there-isn't / milk).", after: [] },
    se: { name: "Verbs with се", about: "Some verbs are learned with се even when English has no matching word: Како се викаш? (how / yourself / you-call?), Се надевам (myself / I-hope); се can also mean each other: Се гледаме (each other / we-see).", after: ["present"] },
    doubling: { name: "A short pronoun doubles the object", about: "When the object has the, a short го, ја or ги (it, them) goes before the verb too: Го читам весникот (it I-read newspaper-the).", after: ["definite"] },
  },
};
