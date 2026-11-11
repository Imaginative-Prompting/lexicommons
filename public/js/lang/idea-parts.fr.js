// French ideas whose whole rule needs words the path brings later. Each part says only what its words let a learner see, and an
// idea's card says the parts whose words you know, so it never names a word you haven't met. A lesson that brings a part's last
// word shows that part as a step of its own (study/idea-parts.js, study/lesson.js). words: lemmas, as the packs name them; name: the
// card's title once that part is known (the grammar's name lists every word, so it would name some before they're met).
export default {
  possessive: [
    { words: ["mon"], name: "mon, ma: words for belonging", line: "mon, ma: my (mon with le words, ma with la words)" },
    { words: ["ton"], name: "mon, ma, ton, ta: my and your", line: "ton, ta: your (to someone you say tu to)" },
  ],
  demonstrative: [{ words: ["ce"], name: "ce, cette: this and that", line: "ce with le words, cette with la words: this or that; cet before a le word that starts with a vowel" }],
  "question-word": [
    { words: ["comment"], name: "Question words", line: "qui asks who, où where and comment how; Qu'est-ce que introduces what." },
    { words: ["quand"], name: "Who, what, where, when?", line: "quand asks when: Tu viens quand?" },
    { words: ["combien"], name: "Question words", line: "combien asks how much: Je dois payer combien?" },
    { words: ["quoi"], name: "Who, what, where?", line: "quoi can ask what at the end: Tu vois quoi?" },
  ],
  "object-pronoun": [
    { words: ["te", "poser"], name: "You before the verb", line: "te goes before its verb: Je te pose une question; before a vowel, t': Je peux t'aider." },
    { words: ["me", "entendre"], name: "Me and you before the verb", line: "me works the same way: Tu m'entends? Tu peux m'aider? me becomes m' before a vowel." },
  ],
  "il-y-a": [
    { words: ["porte", "ouvert"], name: "There is: il y a", line: "Il y a une porte ouverte: there is a door open. Learn il y a together." },
  ],
  "adjective-after": [
    { words: ["porte", "ouvert"], name: "Describing the noun", line: "ouverte comes after porte: la porte ouverte, the open door. It matches the feminine noun." },
  ],
  perfect: [
    { words: ["perdre"], name: "I have lost: passé composé", line: "J'ai perdu ta clé: I've lost your key. Use avoir plus perdu; avoir changes for the person." },
  ],
  on: [
    { words: ["on", "faire"], name: "Everyday we: on", line: "on can mean we, with the il form of the verb: On fait du café, we make coffee." },
  ],
  avoir: [
    { words: ["besoin", "aide"], name: "To need: avoir besoin de", line: "Tu as besoin d'aide? means Do you need help? French says have need of." },
  ],
  contraction: [
    { words: ["bureau"], name: "au: at the, to the", line: "à and le join as au: au bureau, at the office or to the office. à la maison keeps à la." },
  ],
};
