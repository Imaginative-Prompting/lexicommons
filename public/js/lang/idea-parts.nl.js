// Dutch ideas whose whole rule needs words the path brings later. Each part says only what its words let a learner see, and an
// idea's card says the parts whose words you know, so it never names a word you haven't met. A lesson that brings a part's last
// word shows that part as a step of its own (study/idea-parts.js, study/lesson.js). words: lemmas, as the packs name them; name: the
// card's title once that part is known (the grammar's name lists every word, so it would name some before they're met).
export default {
  possessive: [
    { words: ["mijn"], name: "mijn: words for belonging", line: "mijn: my" },
    { words: ["je"], name: "mijn, je: words for belonging", line: "je: your" },
    { words: ["ons"], name: "mijn, je, ons: words for belonging", line: "ons: our" },
  ],
  demonstrative: [
    { words: ["dit", "dat"], name: "dit, dat: this and that", line: "dit and dat: this and that with het-words" },
    { words: ["deze", "die"], name: "dit, dat, deze, die: this and that", line: "deze and die: with de-words" },
  ],
};
