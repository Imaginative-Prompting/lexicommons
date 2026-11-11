// Azerbaijani, in the Latin alphabet of Azerbaijan (lang/index.js has what each field means). Pattern ids follow tr.js
// where they mean the same thing. Verbs are headworded in the -maq/-mək form, as Azerbaijani dictionaries list them.

export default {
  name: "Azerbaijani",
  locale: "az-AZ",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["məs.", "və s.", "s.", "səh.", "dr.", "prof.", "küç.", "mən.", "nöm."],
  stray: ["da", "də", "ki", "bir"],
  patterns: {
    endings: { name: "Who it is: endings on the verb", about: "A verb's ending says who does it, so mən (I), sən (you) and biz (we) are often left out: içirəm (I drink), içirsən (you drink), içirik (we drink).", after: [] },
    "vowel-harmony": { name: "Vowel harmony", about: "Endings change their vowel to match the word's last vowel: evdə (at home) but parkda (in the park), böyükdür (it's big) but soyuqdur (it's cold).", after: [] },
    present: { name: "Now and usually: -ir", about: "-ır, -ir, -ur or -ür marks what's happening now or usually, with a person ending where needed: işləyir (works), içirəm (I drink), oynayırlar (they play).", after: ["endings", "vowel-harmony"] },
    past: { name: "The past: -dı", about: "-dı, -di, -du or -dü and a person ending is the past: gəldim (I came), getdik (we went).", after: ["endings", "vowel-harmony"] },
    future: { name: "The future: -acaq", about: "-acaq or -əcək is the future: yağacaq (it will rain), zəng edəcəyəm (call I'll-make), gedəcəyik (we'll go).", after: ["endings", "vowel-harmony"] },
    negation: { name: "Not: -ma and deyil", about: "-ma or -mə inside a verb makes it negative (danışmır: doesn't speak, bilmirəm: I don't know); with a noun or describing word, deyil means not: həkim deyiləm (doctor not-I-am).", after: ["endings", "vowel-harmony", "present"] },
    "question-word": { name: "Questions keep their word order", about: "A question word stays where its answer would go, and a yes-or-no question can keep a statement's order with the voice rising: Adın nədir? (your-name what-is?), Sən ingiliscə danışırsan? (you in-English speak-you?).", after: [] },
    copula: { name: "Am, is: an ending", about: "Is is the ending -dır or -dir (and its harmony forms), and I am is -am or -əm: Anam müəllimdir (my-mom teacher-is), Mən Amerikadanam (I from-America-am).", after: ["vowel-harmony"] },
    "var-yox": { name: "There is: var and yox", about: "var says there is and yoxdur there isn't; with a possessed noun, it's having: Bir qardaşım var (a my-brother there-is: I have a brother), Süd yoxdur (milk there-isn't).", after: [] },
    possessive: { name: "My, your: endings on the noun", about: "Whose something is is an ending: anam (my mom), adın (your name), evimiz (our house), uşaqlarınız (your children).", after: ["vowel-harmony"] },
    plural: { name: "More than one: -lar", about: "-lar or -lər is more than one (açarlar: keys, uşaqlar: children), but a noun stays singular after a number: on dəqiqə (ten minutes), iki bilet (two tickets).", after: ["vowel-harmony"] },
    locative: { name: "In, at: -da", about: "-da or -də is in or at: evdə (at home), Bakıda (in Baku), soyuducuda (in the fridge).", after: ["vowel-harmony"] },
    dative: { name: "To: -a", about: "-a or -ə (-ya, -yə after a vowel) is to, and some verbs take it: işə (to work), Bakıya (to Baku), Sənə zəng edəcəyəm (to-you call I'll-make).", after: ["vowel-harmony"] },
    ablative: { name: "From: -dan", about: "-dan or -dən is from: Bakıdan (from Baku), işdən (from work).", after: ["vowel-harmony"] },
    accusative: { name: "The object: -ı", about: "A definite object takes -ı, -i, -u or -ü (-nı, -ni after a vowel): pəncərəni (the window), balığı (the fish); an indefinite one takes nothing: Çay içirəm (tea I-drink).", after: ["vowel-harmony"] },
    "adjective-bir": { name: "Describing words and bir", about: "A describing word comes before its noun and doesn't change, and bir (a) usually comes after it: kiçik bir mənzil (small a apartment).", after: [] },
    ability: { name: "Can: -a bilər", about: "The verb with -a or -ə, then bilmək (be able) with its ending, says can: Pəncərəni bağlaya bilərsən? (the-window close can-you?), üzə bilərəm (swim can-I).", after: ["endings", "vowel-harmony"] },
    necessity: { name: "Must: -malı", about: "-malı or -məli and a person ending says must or should: getməliyəm (I have to go), oxumalısan (you should read).", after: ["endings", "vowel-harmony"] },
    postposition: { name: "With, by: -la", about: "ilə (with, by) usually joins the word before it as -la or -lə: südlə (with milk), avtobusla (by bus), kartla (by card).", after: ["vowel-harmony"] },
    infinitive: { name: "The -maq form: want to, in order to", about: "The -maq or -mək form is the dictionary form and works like English to: Çay içmək istəyirəm (tea to-drink I-want), çörək almaq üçün (bread to-buy for).", after: ["vowel-harmony"] },
  },
};
