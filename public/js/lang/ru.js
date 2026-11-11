// Russian (lang/index.js has what each field means).
// Stress: Russian is written without it, but a learner needs it, so a word of two syllables or more carries its stress mark as a
// reading (molokó: молоко́), shown in its place until the word is known well (readings "vowels", as Latin's long vowels); a word of one
// syllable carries none, and neither does a word with ё, always stressed (lang/readings.js). Typing and what's said never need it.

export default {
  name: "Russian",
  locale: "ru-RU",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  readings: "vowels",
  abbreviations: ["т.е.", "т.к.", "т.н.", "е.", "к.", "н.", "напр.", "ул.", "кв.", "стр.", "см.", "им.", "проф.", "п."],
  stray: ["который", "чтобы", "чем", "либо"],
  patterns: {
    question: { name: "Questions: a rising voice or a question word", about: "A yes/no question keeps the order of a statement, with the voice rising on the word asked about (Ты говоришь по-английски?), a question word like как, где or что often comes first, and Russian adds no do.", after: [] },
    "no-be": { name: "No am, is or are in the present", about: "Russian leaves out am, is and are in the present: Я студент (I'm a student); Где мои ключи? (Where are my keys?).", after: [] },
    have: { name: "Having: у меня есть", about: "To say you have something, Russian says it is at you: У меня есть брат (I have a brother); when what matters is what it's like, not whether it's there, есть is often left out: У меня большая комната.", after: ["genitive"] },
    present: { name: "Present tense endings", about: "The verb changes for each person: я живу, ты живёшь, он живёт, мы живём, они живут.", after: [] },
    infinitive: { name: "When the next verb is an infinitive", about: "After words like можешь, хочу, люблю, дай and пора, the next verb stays in its dictionary form: можешь закрыть, хочу съесть, дай знать, пора идти.", after: ["present"] },
    plural: { name: "Plurals", about: "In their basic (nominative) form, plural nouns mostly end in -ы or -и, or -а or -я (ключи, дела); adjectives and possessives such as мой take plural forms too (новые, мои), and some meanings are normally plural (выходные, the weekend).", after: ["gender"] },
    gender: { name: "Masculine, feminine, neuter", about: "Most nouns ending in a consonant are masculine, most in -а or -я feminine and most in -о or -е neuter (though words for men stay masculine: папа), and adjectives, possessives such as мой and a singular past-tense verb agree with them.", after: [] },
    adjective: { name: "Adjectives match", about: "An adjective matches its noun's gender, number and case: новый дом, новая куртка, новые ботинки, в маленькой квартире.", after: ["gender"] },
    accusative: { name: "The accusative: objects, where you go, when", about: "A direct object often takes the accusative (Мы ели пиццу); so does where you're going after в or на (в магазин, на работу), and many expressions of time (в субботу).", after: ["gender"] },
    genitive: { name: "Of, without: the genitive", about: "The genitive can mean of (машина папы, чашка чая), follows без, из and у, and comes after many amounts and numbers: без сахара, десять минут.", after: ["gender"] },
    "genitive-negation": { name: "нет + genitive", about: "To say there isn't something, use нет and the genitive: нет молока, У меня нет времени; and не будет for the future.", after: ["genitive", "have"] },
    prepositional: { name: "Where and how: в or на + prepositional", about: "With в or на, where something is takes the prepositional, usually ending in -е: в Москве, на столе, в холодильнике; and how you travel: на автобусе.", after: ["gender"] },
    dative: { name: "To someone: the dative", about: "The dative is to or for someone: Я позвоню тебе; and the one who feels or likes: Мне холодно (I'm cold), Мне нравится (I like it).", after: ["gender"] },
    instrumental: { name: "With, as, and за", about: "The instrumental follows с (with: с мамой), says what you work as (Я работаю врачом), and follows за for going to get something (за хлебом).", after: ["gender"] },
    direction: { name: "Where you are, where you go", about: "Going and being somewhere differ: куда and где, домой and дома, сюда and здесь; в магазин (to the store) but в магазине (in the store).", after: ["accusative", "prepositional"] },
    ne: { name: "не before what it denies", about: "не (not) goes right before the word it denies, and stays even with никогда (never): Я не знаю; Я никогда не был.", after: [] },
    past: { name: "Past tense by gender", about: "The past says the gender in the singular, not the person (он был, она была, они были; a woman says я купила, a man я купил), and some pasts describe how things are now: ты устал (you're tired).", after: ["present", "gender"] },
    future: { name: "Talking about the future", about: "Use буду and an imperfective infinitive for an action seen as ongoing, repeated or not about finishing it (never буду купить); the present for a plan (Завтра я еду на работу); будет for what there will be (Завтра будет дождь); a present-looking perfective for one whole action (Я позвоню); and the future after если too (Если не будет дождя, мы пойдём на пляж).", after: ["present", "aspect"] },
    aspect: { name: "Two verbs for one action", about: "Many verbs come in pairs: one for an action going on or repeated (покупать, звонить), one for the action as one finished whole (купить, позвонить).", after: ["present"] },
    motion: { name: "Going: идти or ехать", about: "For one trip, going now or planned, идти is going on foot (and coming or leaving: Иди сюда; Мне пора идти) and ехать going by car, bus or train; ходить and ездить are for regular trips, or there and back; пойти and поехать set off on one trip.", after: ["present", "aspect"] },
    "new-last": { name: "What's new goes last", about: "Russian order is free-ish, and the new information often comes late, so the subject can follow the verb: На столе лежит книга (on the table lies a book).", after: [] },
    address: { name: "Informal ты, polite вы", about: "ты and its verb forms speak to one person you know well, and вы and its forms to several people or politely to one, such as a waiter, a stranger or an older adult (Принесите, пожалуйста; Извините), so use вы with an adult you don't know until they offer ты.", after: ["present"] },
    imperative: { name: "Telling someone to do something", about: "The command form has its own ending and no subject: Закрой дверь! Иди сюда! Дай мне знать! (-те for more people or politely: Принесите.)", after: ["present"] },
  },
};
