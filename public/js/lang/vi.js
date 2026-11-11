// Vietnamese (lang/index.js has what each field means). Words are written syllable by syllable, so a word of two
// syllables (cà phê) is two tokens, both carrying its dictionary form, as a Dutch separable verb's two parts do.

export default {
  name: "Vietnamese",
  locale: "vi-VN",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["tp.", "q.", "p.", "tr.", "v.v.", "ts.", "ths.", "gs."],
  stray: ["không", "là", "có", "thì", "của", "đã"],
  patterns: {
    "tense-markers": { name: "Time markers, not verb endings", about: "A verb never changes: đã before it puts the action before now, đang shows it happening right now, sẽ puts it in the future, and a time phrase can say when: Tôi đã ăn (I did eat), Tôi sẽ đi (I will go).", after: [] },
    "no-copula": { name: "No là before a describing word", about: "Before a describing word, Vietnamese uses no là: Tôi mệt (I tired), Nhà tôi nhỏ (house my small).", after: [] },
    la: { name: "là: is, before a noun", about: "là links two nouns, like is: Mẹ tôi là giáo viên (mom my is teacher); to say it isn't, use không phải là.", after: ["no-copula"] },
    "adjective-after": { name: "Describing words after the noun", about: "A describing word, or a noun that describes, comes after the noun: nhà lớn (house big), cà phê sữa (coffee milk).", after: [] },
    possessive: { name: "my after the noun", about: "The owner comes after the thing, often with nothing between: mẹ tôi (mom my), and của (of) can stand between them: nhà của tôi (house of me).", after: ["adjective-after"] },
    demonstrative: { name: "này, đó: this, that", about: "này (this) and đó (that) come last in the noun's group: cái áo này (shirt this), cuối tuần này (weekend this).", after: ["adjective-after"] },
    classifier: { name: "Counting words", about: "After a number or một (a), a counting word comes before the noun: con for animals, quyển for books, ngôi for houses: hai con mèo (two cats).", after: [] },
    plural: { name: "More than one", about: "A noun does not change after a number: một quyển sách (one book), hai quyển sách (two books); các and những can mark a plural group before its classifier or noun: các con ((plural) child), những quyển sách ((plural) (volume) book).", after: ["classifier"] },
    negation: { name: "không: not", about: "không goes before a verb or a describing word: Tôi không biết (I not know); before a noun, say không phải là: không phải là bác sĩ (not is doctor).", after: [] },
    "question-word": { name: "Question words stay in place", about: "A question word sits where its answer would go, often at the end: Bạn tên là gì? (you name is what?), Ga tàu ở đâu? (station train is-at where?).", after: [] },
    "question-khong": { name: "Yes-or-no questions with không", about: "A yes-or-no question ends with không (or not), often with có before the verb or describing word: Bạn có khát không? (you do thirsty or not?).", after: ["negation"] },
    co: { name: "có: have, there is", about: "có means have, and with a place before it, there is: Tôi có hai con mèo (I have two cats), Ở chợ có nhiều hoa quả (at market have much fruit).", after: [] },
    o: { name: "ở: at, to be somewhere", about: "ở means at or in, and on its own it means to be somewhere: ở nhà (at home), Chìa khóa ở trên bàn (key is-at on table).", after: [] },
    modal: { name: "muốn, có thể, phải + verb", about: "After muốn (want), có thể (can) and phải (must), the next verb follows with no word for to: Tôi muốn ăn (I want eat).", after: [] },
    di: { name: "đi + place or activity: no word for to", about: "đi takes a destination or activity directly after it: đi chợ (go market), đi làm (go work), đi Đà Nẵng (go Da Nang).", after: [] },
    chua: { name: "chưa: not yet, and …yet?", about: "chưa is not yet, and at the end of a question it asks whether something has happened yet: Bạn ăn cơm chưa? (you eat rice yet?).", after: ["tense-markers"] },
    particles: { name: "Friendly and polite sentence endings", about: "Words at the end set the tone: ạ adds respect, nhé makes a friendly suggestion, thôi gives a friendly push, and đấy makes a question conversational.", after: [] },
    pronouns: { name: "Family words as I and you", about: "Vietnamese says you and I with family words, by age: chị (older sister) for an older woman, anh (older brother) for an older man, em (younger sibling) for yourself when they're older: Chị ơi, cho em hỏi (sister, let younger-me ask).", after: [] },
  },
};
