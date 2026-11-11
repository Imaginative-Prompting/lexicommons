// Uzbek, in the Latin alphabet of 1995 (lang/index.js has what each field means). Its oʻ and gʻ are written with ʻ
// (U+02BB) and its tutuq belgisi with ʼ (U+02BC), letters a keyboard types as an apostrophe (apostropheLetter). Verbs are
// headworded in the -moq form (bormoq for boraman, oʻqimoq for oʻqidim).

export default {
  name: "Uzbek",
  locale: "uz-UZ",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  apostropheLetter: "ʻ",
  abbreviations: ["sh.", "koʻch."],
  stray: ["ham", "esa", "axir", "hali"],
  patterns: {
    copula: { name: "Am, are, is: endings", about: "After a noun or a place, -man, -san, -miz and -siz say I am, you are, we are and you are (polite): Men talabaman (I student-am), Siz talabasiz (you student-are); is usually has none (U talaba: he or she student), and -dir is formal or for emphasis.", after: [] },
    "verb-last": { name: "The verb usually comes last", about: "The verb normally follows its object and place: Men choy ichaman (I tea drink), Akam Toshkentda yashaydi (my-brother in-Tashkent lives).", after: [] },
    "present-future": { name: "Usually and will: -a, -y", about: "-a or -y with the person's ending says what you usually do, or will do: Men choy ichaman (I tea drink), Ertaga boramiz (tomorrow we-go).", after: ["copula"] },
    "present-continuous": { name: "Right now: -yap", about: "-yap (or -ayap after a consonant) with the person's ending says what's happening now: Men kitob oʻqiyapman (I book am-reading), Bolalar oʻynayapti (the children are playing).", after: ["present-future"] },
    past: { name: "The past: -di", about: "-di with the person's ending says what happened: Men kecha keldim (I yesterday came), Biz ovqatlandik (we ate).", after: ["copula"] },
    negation: { name: "Not: -ma- and emas", about: "-ma- in the verb says not (Men goʻsht yemayman: I meat don't-eat), and emas after a word says isn't: Bu mening kitobim emas (this my book-my isn't).", after: ["present-future"] },
    question: { name: "Questions: -mi and the question word in place", about: "-mi on a word makes a yes-or-no question (Inglizcha gapirasizmi?: English-ly do-you-speak?), and a question word stays where its answer goes: Siz qayerda yashaysiz? (you where live?).", after: [] },
    "bor-yoq": { name: "There is, have: bor, yoʻq", about: "bor says there is and yoʻq there isn't; with a my-word they say have: Mening akam bor (my older-brother-my there-is: I have an older brother), Sut yoʻq (milk there-isn't).", after: ["possessive"] },
    possessive: { name: "My, your: endings on the noun", about: "My and your are endings, often with mening or sening before the noun: mening ismim (my name-my), sening uying (your house-your), uning qizi (her daughter-her).", after: [] },
    plural: { name: "More than one: -lar", about: "-lar makes more than one: bola → bolalar (children), kitob → kitoblar (books); after a number the noun stays one: ikki akam (two brothers-my).", after: [] },
    locative: { name: "In, at: -da", about: "-da on the end says in or at: Toshkentda (in Tashkent), uyda (at home), maktabda (at school).", after: [] },
    dative: { name: "To: -ga", about: "-ga (-ka after k, -qa after q) on the end says to: Toshkentga (to Tashkent), ishga (to work), menga (to me).", after: [] },
    ablative: { name: "From: -dan", about: "-dan on the end says from: Amerikadan (from America), ishdan (from work).", after: [] },
    accusative: { name: "The object: -ni", about: "A definite object takes -ni: Kitobni oʻqidim (the book I-read), Derazani yoping (the window close).", after: [] },
    genitive: { name: "Of: -ning", about: "-ning marks the owner, and the owned noun takes the matching possessive ending: mening uyim (my house-my), sening uying (your house-your), otamning mashinasi (my-father's car-his).", after: ["possessive"] },
    instrumental: { name: "With, by: bilan", about: "bilan after a word says with or by: avtobus bilan (by bus), doʻstim bilan (with my friend).", after: [] },
    ability: { name: "Can: -a olmoq", about: "The verb's -a or -y form with olmoq says can: Men suza olaman (I swim can), Yordam bera olasizmi? (help give can-you?).", after: ["present-future"] },
    want: { name: "Want to: -moqchi", about: "-moqchi with the person's ending says want to, or plan to: Choy ichmoqchiman (tea I-want-to-drink), Ertaga bormoqchimiz (tomorrow we-plan-to-go).", after: ["copula"] },
  },
};
