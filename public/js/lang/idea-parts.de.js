// German ideas whose whole rule needs words the path brings later. Each part says only what its words let a learner see, and an
// idea's card says the parts whose words you know, so it never names a word you haven't met. A lesson that brings a part's last
// word shows that part as a step of its own (study/idea-parts.js, study/lesson.js). words: lemmas, as the packs name them; name: the
// card's title once that part is known (the grammar's name lists every word, so it would name some before they're met).
export default {
  possessive: [
    { words: ["mein"], name: "mein, meine: my", line: "mein, meine: my (mein with der and das words, meine with die words)" },
    { words: ["dein"], name: "mein, dein: my and your", line: "dein, deine: your (to someone you say du to)" },
  ],
  demonstrative: [{ words: ["dieser"], name: "dieses, diese: this", line: "dieses with das words, diese with die words: this; on its own, das is that" }],
  destination: [
    { words: ["zur", "Tür"], name: "Going to the door", line: "zur Tür means to the door; nach Hause means home when going there." },
  ],
  perfect: [
    { words: ["verlieren"], name: "Past with haben", line: "habe … verloren: Ich habe deinen Schlüssel verloren (I have lost your key)." },
  ],
  "time-place": [
    { words: ["um", "zwei", "Uhr"], name: "Time before place", line: "Time often comes before place: Wir gehen um zwei Uhr nach Hause. Other orders can also be right." },
  ],
  "es-gibt": [
    { words: ["es", "geben", "Sofa"], name: "es gibt: there is", line: "Hier gibt es ein Sofa means there is a sofa here. es gibt introduces something that exists or is available." },
  ],
  separable: [
    { words: ["anrufen"], name: "Separable verbs", line: "Ruf … an splits in a command; after a modal, anrufen stays together: Willst du meine Mutter anrufen?" },
  ],
};
