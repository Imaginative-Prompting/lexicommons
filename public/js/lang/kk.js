// Kazakh, in the Cyrillic alphabet written in Kazakhstan today (lang/index.js has what each field means). Verbs are
// headworded in their -у form (бару for барамын, оқу for оқыдым), so the verb бару (go) and бар (there is) stay apart.

export default {
  name: "Kazakh",
  locale: "kk-KZ",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["мыс.", "көш.", "қ."],
  stray: ["да", "ғой", "екен", "ше"],
  patterns: {
    "vowel-harmony": { name: "Vowel harmony", about: "An ending takes back vowels (а, о, ұ, ы) after a word with them and front vowels (ә, ө, ү, і, е) after one with those: Алматыда (in Almaty), үйде (at home).", after: [] },
    copula: { name: "Am, are: an ending, and none for is", about: "Am and are are endings on the word (Мен дәрігермін: I doctor-am, Сен студентсің: you student-are), and is has none: Ол мұғалім (he or she teacher).", after: ["vowel-harmony"] },
    "consonant-agreement": { name: "Endings fit the last sound", about: "Many endings, and the question's ма, change their first consonant to fit the sound before them: әкемнің, үстелдің, кітаптың; үйге, кітапқа; сүтпен; бар ма, сіз бе, кітап па.", after: ["vowel-harmony"] },
    "present-future": { name: "Usually and will: -а, -е, -й", about: "-а, -е or -й with the person's ending says what you usually do, or will do: Мен шай ішемін (I tea drink), Ертең барамыз (tomorrow we-go).", after: ["copula"] },
    "present-continuous": { name: "Right now: -ып жатыр", about: "-ып, -іп or -п with жатыр says what's happening now: Мен кітап оқып жатырмын (I book reading am), Балалар ойнап жатыр (the children are playing).", after: ["present-future"] },
    past: { name: "The past: -ды, -ді", about: "-ды, -ді, -ты or -ті with the person's ending says what happened: Мен кеше келдім (I yesterday came), Біз тамақтандық (we ate).", after: ["copula", "consonant-agreement"] },
    negation: { name: "Not: -ма, -ме and емес", about: "-ма, -ме, -ба, -бе, -па or -пе on the verb says not (Мен ет жемеймін: I meat don't-eat), and емес after a word says isn't: Бұл менің кітабым емес (this my book isn't).", after: ["present-future", "consonant-agreement"] },
    question: { name: "Questions: ма, ме and the question word in place", about: "ма, ме, ба, бе, па or пе after a word makes a yes-or-no question (Ағылшынша сөйлейсің бе?: English-ly you-speak?), and after a third-person -а, -е or -й verb the -ды, -ді goes (Ол барады → Ол бара ма?); a question word stays where its answer goes: Сен қайда тұрасың? (you where live?).", after: ["vowel-harmony", "consonant-agreement", "present-future"] },
    "bar-zhoq": { name: "There is, have: бар, жоқ", about: "бар says there is and жоқ there isn't; with a my-word, or a person with -да, they say have: Менің ағам бар (my older-brother-my there-is: I have an older brother), Сізде су бар ма? (at-you water there-is?: do you have water?), Сүт жоқ (milk there-isn't).", after: ["possessive", "locative"] },
    possessive: { name: "My, your: endings on the noun", about: "My and your are endings, often with менің or сенің before the noun: менің атым (my name-my), сенің үйің (your house-your), оның қызы (his or her daughter-his or hers).", after: ["vowel-harmony"] },
    plural: { name: "More than one: -лар, -лер", about: "-лар, -лер, -дар, -дер, -тар or -тер make more than one: бала → балалар (children), кітап → кітаптар (books); after a number the noun stays one: екі ағам (two brothers-my).", after: ["vowel-harmony", "consonant-agreement"] },
    locative: { name: "In, at: -да, -де", about: "-да, -де, -та or -те on the end says in or at: Алматыда (in Almaty), үйде (at home), мектепте (at school).", after: ["vowel-harmony", "consonant-agreement"] },
    dative: { name: "To: -ға, -ге", about: "-ға, -ге, -қа or -ке on the end says to: Алматыға (to Almaty), жұмысқа (to work), маған (to me); after my, or your to a friend, it's -а, -е (үйіме, үйіңе: to my house, to your house) and after his, her, its or their -на, -не (үйіне).", after: ["vowel-harmony", "consonant-agreement", "possessive"] },
    ablative: { name: "From: -дан, -ден", about: "-дан, -ден, -тан, -тен, -нан or -нен on the end says from: Америкадан (from America), жұмыстан (from work).", after: ["vowel-harmony", "consonant-agreement"] },
    accusative: { name: "The object: -ды, -ді, -ны, -ні", about: "A definite object takes -ды, -ді, -ны, -ні, -ты or -ті (and -н after his, her, its or their ending): Кітапты оқыдым (the book I-read), Терезені жапшы (the window close).", after: ["vowel-harmony", "consonant-agreement", "possessive"] },
    genitive: { name: "Of: -ның, -нің", about: "-ның, -нің, -дың, -дің, -тың or -тің marks the owner, and the owned noun takes the matching possessive ending: менің досым (my friend-my), әкемнің көлігі (my-father's car-his).", after: ["possessive", "consonant-agreement"] },
    instrumental: { name: "With, by: -мен, -пен, -бен", about: "-мен, -пен or -бен on the end says with or by: автобуспен (by bus), сүтпен (with milk), досыммен (with my friend).", after: ["consonant-agreement"] },
    ability: { name: "Can: -а алу", about: "The verb's -а, -е or -й form with алу says can: Мен жүзе аламын (I swim can), Көмектесе аласыз ба? (help can-you?).", after: ["present-future"] },
    want: { name: "Want to: -ғым келеді", about: "The verb with -ғы, -гі, -қы or -кі, its my-ending and келеді says want to: Шай ішкім келеді (tea to-drink-my comes: I want to drink tea).", after: ["possessive", "consonant-agreement"] },
  },
};
