// Belarusian, in the official spelling (the 2008 rules; lang/index.js has what each field means). Pattern ids follow
// uk.js and hr.js where they mean the same thing.

export default {
  name: "Belarusian",
  locale: "be-BY",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["напр.", "вул.", "д.", "кв.", "г.", "ст.", "гл.", "праф.", "тэл."],
  stray: ["які", "каб", "чым", "хоць"],
  patterns: {
    question: { name: "Questions: a rising voice, ці or a question word", about: "A yes-or-no question often keeps a statement's order with the voice rising (Ты гаворыш па-англійску?), or starts with ці; a question word often comes first: Дзе вакзал? (where station?).", after: [] },
    "no-be": { name: "Usually no am, is or are in the present", about: "Belarusian usually leaves out am, is and are in the present: Я з Амерыкі (I from America), Дзе мае ключы? (where my keys?), Сёння холадна (today cold); ёсць says there is, or stresses that something is.", after: [] },
    have: { name: "Having: у мяне ёсць", about: "Having is usually said as at me there is: У мяне ёсць брат (at me is brother: I have a brother), У нас ёсць вялікая кухня (we have a big kitchen).", after: ["genitive"] },
    present: { name: "Present tense endings", about: "The verb's ending changes with who does it: я раблю, ты робіш, ён робіць, мы робім, яны робяць.", after: [] },
    infinitive: { name: "The next verb stays in its dictionary form", about: "After магу (I can), хачу (I want), трэба (need to) and the like, the next verb stays in its dictionary form, ending in -ць, -ці or -чы: Можаш зачыніць акно? (can-you close window?), Мне трэба ісці (to-me need go).", after: ["present"] },
    gender: { name: "Masculine, feminine, neuter", about: "A noun with a singular form is masculine, feminine or neuter, mostly told by its ending, and my, your, describing words and the past match it: мой брат, мая сястра, маё акно.", after: [] },
    adjective: { name: "Describing words match", about: "A describing word takes its noun's gender, number and case: высокая (tall, of a woman), у маленькай кватэры (in a small apartment), мае ключы (my keys).", after: ["gender"] },
    accusative: { name: "The object, and where you go: the accusative", about: "A person or thing a verb acts on directly often takes the accusative, which turns feminine -а into -у (кава → Я п'ю каву: I drink coffee); so does where you're going after у or на: у краму (to the store), на працу (to work).", after: ["gender"] },
    genitive: { name: "Of, from, without: the genitive", about: "The genitive means of and follows з (from), без (without), да (to someone's) and numbers such as пяць and дзесяць: шклянка вады (glass of-water), без цукру (without sugar), дзесяць хвілін (ten minutes).", after: ["gender"] },
    "genitive-negation": { name: "няма + genitive", about: "To say there isn't something, use няма and the genitive: Няма хлеба (there-isn't of-bread), У мяне няма часу (at me there-isn't of-time).", after: ["genitive", "have"] },
    locative: { name: "Where: у or на + locative", about: "After у (ў after a vowel) or на, a place where something is takes the locative, often ending in -е or -у: у Мінску (in Minsk), на стале (on the table), на вакзале (at the station).", after: ["gender"] },
    dative: { name: "To someone, and feeling: the dative", about: "The dative is to or for someone (Я пазваню табе: I'll call to-you), and the one who likes or feels something: Мне падабаецца (to-me pleases: I like it), Мне холадна (to-me cold: I'm cold).", after: ["gender"] },
    instrumental: { name: "With and by: the instrumental", about: "з (with) takes the instrumental, and so does how you travel or pay, with no word for by: з малаком (with milk), аўтобусам (by bus), картай (by card).", after: ["gender"] },
    ne: { name: "не before what it denies", about: "не (not) goes right before the word it denies, usually the verb: Я не ведаю (I not know).", after: [] },
    past: { name: "Past tense by gender", about: "The past says the gender in the singular, not the person: тата працаваў (dad worked), бабуля спякла (grandma baked), мы былі (we were).", after: ["gender"] },
    future: { name: "Talking about the future", about: "буду, будзеш, будзе… says what will be (Заўтра будзе дождж: tomorrow will-be rain) or goes with a verb (Што ты будзеш есці?), and a verb for a completed action has a future of its own: Я пазваню (I'll call).", after: ["present"] },
    imperative: { name: "Telling someone to do something", about: "The command form usually leaves out its subject: Пачакай! (wait!), Ідзі сюды! (come here!), Дай мне ведаць! (let me know!).", after: ["present"] },
  },
};
