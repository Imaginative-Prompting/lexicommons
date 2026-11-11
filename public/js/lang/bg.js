// Bulgarian (lang/index.js has what each field means).
// A verb's dictionary form is its I form (пия, живея, мога), as Bulgarian dictionaries give it: Bulgarian has no
// infinitive.

export default {
  name: "Bulgarian",
  locale: "bg-BG",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["напр.", "т.е.", "ул.", "бл.", "стр.", "тел.", "проф.", "доц.", "акад.", "вж.", "гр.", "бул.", "пл.", "ж.к.", "кв.", "т.нар.", "с.", "срв."],
  stray: ["който"],
  patterns: {
    question: { name: "Questions: ли or a question word", about: "A yes/no question often puts ли right after the word or phrase it asks about, usually the verb (Говориш ли английски?), and a question word like къде, какво or как usually comes early; Bulgarian adds no do.", after: ["present"] },
    "no-pronoun": { name: "Subject pronouns often left out", about: "A Bulgarian verb usually marks the person, so аз (I), ти (you), той, тя (he, she) and ние (we) are often left out: Живея в малък апартамент (I live in a small apartment).", after: ["present"] },
    present: { name: "Present tense endings", about: "The verb's ending marks the person: (аз) живея, (ти) живееш, (той, тя) живее, (ние) живеем, (вие) живеете, (те) живеят. To be is irregular: съм, си, е, сме, сте, са.", after: [] },
    definite: { name: "The: an ending, not a word", about: "the is an ending on the noun, or on the first adjective: кола, колата; новите обувки. In a masculine singular phrase, the word carrying it takes the full -ът or -ят as the subject or when it says what the subject is, and the short -а or -я elsewhere: Влакът закъсня; Той е учителят; до магазина.", after: ["gender"] },
    gender: { name: "Masculine, feminine, neuter", about: "Nouns are masculine (often a consonant: апартамент), feminine (often -а or -я: кухня) or neuter (often -о or -е: мляко, яке), and adjectives match: малък апартамент, голяма кухня, ново яке.", after: [] },
    adjective: { name: "Adjectives match", about: "An adjective matches its noun's gender and number: малък балкон, голяма кухня, ново яке, малки обувки.", after: ["gender"] },
    prepositions: { name: "Nouns use prepositions", about: "Except for the masculine singular definite endings (-ът or -ят, against -а or -я), nouns have no separate subject and object forms; prepositions show how they fit: на for of, on, at or to, в for in, с for with or by, до for to, as far as or next to, при for at or to someone's, без for without; pronouns do change (ние, but с нас), and a glass of water is simply чаша вода.", after: [] },
    possessive: { name: "My, your: a short word after", about: "Short possessives usually follow the definite noun (ключовете ми: my keys); some family words take no definite ending (брат ми, майка ми), while others keep it (синът ми), and after an adjective the possessive follows the adjective: новата ми кола.", after: ["definite"] },
    da: { name: "No infinitive: да + the present", about: "Where English says to do, Bulgarian says да with a present-form verb whose ending still marks who does it: Искам да хапна (I want to eat); Можеш ли да затвориш? Обичам да готвя.", after: ["present"] },
    condition: { name: "If and when: ако and като", about: "ако sets a condition (Ако не вали…), and като with a present-form verb can mean when, for a future event: Като се прибера, ще сготвя вечеря.", after: ["future"] },
    future: { name: "Future: ще", about: "ще before the present makes the future: Утре ще вали (it'll rain tomorrow); Ще отидем на плаж; Ще ти се обадя.", after: ["present"] },
    past: { name: "Past events and experience", about: "A finished event often uses the aorist: купих (I bought), ядохме (we ate); бях is the past of съм; and experience is съм with an -л form that shows gender in the singular: не съм бил (a man), не съм била (a woman), не сме били.", after: ["present"] },
    aspect: { name: "Two verbs for one action", about: "Many verbs come in pairs: one shows an action as going on or repeated (купувам, вземам), the other as one whole event (купя, взема); either can follow да or ще, and the meaning decides: можем да вземем такси.", after: ["da"] },
    ne: { name: "Not: не", about: "не goes right before the verb (Не знам: I don't know; Не пия кафе), and short words like ми or съм follow it: не съм бил.", after: [] },
    "ima-nyama": { name: "There is and to have: има, няма, имам, нямам", about: "има and няма mean there is and there isn't (На масата има книга; В хладилника няма мляко), and the related personal verbs имам and нямам mean have and not have: Имам сестра; Нямам време.", after: ["present"] },
    clitic: { name: "Short pronouns", about: "Short pronouns like ми, ти, ни, го and се sit next to the verb, usually before it but never first in the sentence: Харесва ми този филм; На гарата ни чака баба; Ще ти се обадя; Кажи ми!", after: ["present"] },
    se: { name: "Verbs with се and си", about: "Some verbs are learned with се or си, often with nothing to match it in English: Как се казваш?; Надявам се; Купих си яке (I bought myself a jacket).", after: ["clitic"] },
    plural: { name: "More than one", about: "Plurals mostly end in -и or -ове (обувки, ключове), and two men or boys are двама: двама братя.", after: ["gender"] },
    imperative: { name: "Telling someone to do something", about: "A command uses a special verb form and no subject: Затвори, Кажи and Ела are to one person you know well; Затворете, Кажете and Елате are to more than one, or polite (вие).", after: ["present"] },
    "dummy-subject": { name: "No empty it or there", about: "Bulgarian adds no it or there for the weather, a feeling or what there is, and says how it is with е and a word like студено or хубаво: Утре ще вали; Днес е студено; Студено ми е (I'm cold); На масата има книга.", after: ["present"] },
  },
};
