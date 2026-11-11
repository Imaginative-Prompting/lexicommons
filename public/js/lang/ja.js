// Japanese (lang/index.js has what each field means).
// Written without spaces, so a sentence's words are split once, by whoever writes it, and kept as written (segmenter
// "fixed", separator ""). A word is a content word with its endings attached (食べました, 高い) or a particle on its own
// (は, を, に); です is a word of its own. A word's lemma is its dictionary form in standard kanji and kana (食べる,
// 行く, 高い, です); particles have none, since they're patterns here. A word written with kanji carries its reading in
// hiragana (lang/readings.js), shown over it until you know it. A pack's literal line gives each chunk's English in
// Japanese order: a particle with an English word goes into its chunk ("to Tokyo"); は, が, を and か, which English has
// no word for, add nothing, and neither does the I or you Japanese leaves unsaid. (A woven book's literal line is made
// word by word, so it keeps those particles, in kana.) Polite です/ます speech throughout.

export default {
  name: "Japanese",
  locale: "ja-JP",
  segmenter: "fixed",
  separator: "",
  lemmaCase: "any",
  readings: "kana",
  ends: ["。", "？", "！"],
  abbreviations: [],
  // Particles: a tile of one fits a sentence only where its noun needs it.
  stray: ["は", "を", "が", "に", "で", "も"],
  patterns: {
    "verb-last": { name: "The predicate comes last", about: "The verb, adjective or です comes at the end, before only a final particle like か; who, what, where and when all come before it.", after: [] },
    "topic-wa": { name: "は: the topic", about: "は (said wa) after a word makes it what the sentence is about; English has no word for it.", after: ["verb-last"] },
    desu: { name: "です: polite noun and adjective sentences", about: "です after a noun says what something is (学生です, I'm a student), and after an adjective makes it polite (高いです).", after: ["topic-wa"] },
    masu: { name: "Polite verbs in -ます", about: "Everyday polite verbs end in -ます, for what you do and what you will do: 行きます, I go, I'll go.", after: ["verb-last"] },
    masen: { name: "-ません: not", about: "-ません instead of -ます makes a polite verb negative: 行きません, I don't go.", after: ["masu"] },
    mashita: { name: "Polite past: -ました, でした", about: "-ました makes a polite verb past (-ませんでした, didn't), and です becomes でした: 雨でした, it was rainy.", after: ["masu"] },
    "object-o": { name: "を: the object", about: "を (said o) marks what the verb acts on, and comes before the verb: コーヒーを飲みます.", after: ["verb-last"] },
    "particle-ni": { name: "に: to, at, on", about: "に marks where you go, where something is, and the time something happens: 七時に, at seven.", after: ["verb-last"] },
    "particle-de": { name: "で: at, by, with", about: "で marks where an action happens, or what you do it by or with: 駅で, at the station; バスで, by bus.", after: ["particle-ni"] },
    "question-ka": { name: "か: questions", about: "か at the end makes a question, and the order stays the same; a question word sits where its answer would.", after: ["verb-last"] },
    "possessive-no": { name: "の: 's and of", about: "の joins two nouns, the owner or the kind first: 私の本, my book. On its own after a noun it means the one of: 私のです, it's mine.", after: [] },
    "subject-ga": { name: "が: the subject", about: "が marks who or what does something or is there, often something new, and the thing you like with 好きです.", after: ["topic-wa"] },
    "aru-iru": { name: "あります / います: there is, have", about: "あります is there is for things, います for people and animals; what's there takes が, where takes に. It often means have: 時間があります.", after: ["subject-ga", "particle-ni"] },
    adjectives: { name: "Adjectives", about: "い adjectives end in い and take です (高いです), and their past ends in -かったです (忙しかったです); な adjectives take な before a noun (静かな町).", after: ["desu"] },
    mo: { name: "も: too, also", about: "も takes the place of は, が or を and adds too: 私も, me too.", after: ["topic-wa"] },
    "want-tai": { name: "-たい: want to", about: "A verb's -ます stem with たいです says what you want to do: 食べたいです, I want to eat.", after: ["masu"] },
    "te-kudasai": { name: "-て/-でください: please", about: "A verb's て form (-て or -で) with ください asks someone to do something: 待ってください, please wait.", after: ["masu"] },
    mashou: { name: "-ましょう, -ませんか: let's", about: "-ましょう says let's; -ませんか invites: 行きませんか, won't you come?", after: ["masen"] },
    "te-iru": { name: "-ています, -でいます: going on, or a state", about: "A verb's て form (-て or -で) with います says it's going on now (見ています, I'm watching) or a state that holds (住んでいます, I live).", after: ["masu"] },
    counters: { name: "Counters", about: "A number takes a counter for what's counted, after the thing: 猫が一匹, one cat; 本が二冊, two books. Some readings change: 一人 is ひとり.", after: ["subject-ga"] },
    "kara-made": { name: "から and まで: from, to", about: "から marks where or when something starts, まで where or when it ends: 九時から五時まで, from nine to five.", after: ["particle-ni"] },
    "to-and": { name: "と: and, with", about: "と joins nouns (パンと牛乳, bread and milk), and after a person it means with: 友達と映画を見ました, I watched a movie with a friend.", after: ["object-o"] },
    "te-form": { name: "The て form: and then", about: "A verb's て form (-て or -で) joins actions, often in the order they happen, and only the last verb shows the tense and politeness: シャワーを浴びて寝ました, I took a shower and went to bed.", after: ["masu", "te-iru"] },
    "ageru-kureru": { name: "あげる and くれる: giving", about: "When I give something to someone else, it's あげます (妹に本をあげました, I gave my younger sister a book). When someone gives something to me, it's くれます (友達がお土産をくれました, a friend gave me a souvenir), and to someone in my family or group too. Who gets it takes に, when it's said.", after: ["particle-ni", "subject-ga"] },
  },
};
