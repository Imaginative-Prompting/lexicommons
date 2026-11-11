// Armenian, Eastern, in the reformed spelling of the Republic of Armenia (lang/index.js has what each field means). A
// question puts ՞ on the word it asks about, inside the word (Ինչպե՞ս, Ո՞ւր), and a sentence ends with ։ (its full
// stop), a question too. Verbs are headworded in the infinitive (գրել), the forms of be (եմ, է, չեմ…) under լինել.

export default {
  name: "Armenian",
  locale: "hy-AM",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  ends: ["։"],
  questionMarks: ["՞"],
  abbreviations: ["օր.", "պրն.", "տկն.", "փ.", "թ.", "դ."],
  stray: ["եմ", "է", "չի", "որ", "էլ"],
  patterns: {
    aux: { name: "Am, is, are: եմ, ես, է", about: "Be is a short word that changes with who: եմ (am), ես (are, to a friend), է (is), ենք (we are), եք (you are), են (they are): Ես բժիշկ եմ (I doctor am), Տունը մեծ է (house-the big is).", after: [] },
    present: { name: "Now and usually: -ում with be", about: "The present pairs the verb's -ում form with a form of be, which goes after the verb or before it, after the word in focus: գրում եմ (writing am-I), Ես սուրճ եմ խմում (I coffee am drinking).", after: ["aux"] },
    negation: { name: "Not: չ- on be or the verb", about: "Not is չ- joined to the form of be, which then comes before the verb (Ես չեմ հասկանում: I not-am understanding), or to the verb itself: չգիտեմ (I don't know), չունեմ (I don't have).", after: ["aux", "present"] },
    question: { name: "Questions: ՞ on the word asked about", about: "A question keeps its order and puts ՞ on the word it asks about, over its last vowel: Ինչպե՞ս ես։ (how are-you?), Դուք անգլերեն խոսո՞ւմ եք։ (you English speaking are?).", after: [] },
    article: { name: "The: -ը or -ն on the end", about: "The joins the end of the noun: -ը after a consonant, -ն after a vowel or before a word that starts with one: տունը (the house), կայարանը (the station), Սա իմ տունն է (this my house-the is).", after: [] },
    possessive: { name: "My, your: -ս, -դ, or իմ, քո", about: "My and your can be an ending (մայրս: my mom, եղբայրդ: your brother) or a word before the noun, which then takes the: իմ քույրը (my sister-the).", after: ["article"] },
    plural: { name: "More than one: -եր, -ներ", about: "Most one-syllable nouns add -եր and most longer nouns add -ներ: գիրք → գրքեր (books), երեխա → երեխաներ (children).", after: [] },
    locative: { name: "In: -ում", about: "-ում on the end of a place says in or at: Երևանում (in Yerevan), սառնարանում (in the fridge); at home is տանը.", after: [] },
    ablative: { name: "From: -ից", about: "-ից on the end says from: Ամերիկայից (from America), աշխատանքից (from work), որտեղի՞ց (where from?).", after: [] },
    instrumental: { name: "With, by: -ով", about: "-ով on the end says with or by: կաթով (with milk), ավտոբուսով (by bus), քարտով (by card).", after: [] },
    dative: { name: "To me, to you: ինձ, քեզ, -ին", about: "ինձ and քեզ mean to me and to you, and a noun says to with a form often marked by -ի or -ին: Ինձ դուր է գալիս (to-me pleases: I like it), Զանգիր մայրիկիդ (call to-your-mom).", after: [] },
    postposition: { name: "On, with, without: words around the noun", about: "Words like on and with follow the noun's form for of (սեղանի վրա: table's on, ընկերոջս հետ: my-friend's with), and առանց (without) comes before it: առանց շաքարի (without sugar).", after: [] },
    infinitive: { name: "The to-form: -ել, -ալ", about: "The to-form ends in -ել or -ալ and follows want and can: Ուզում եմ հայերեն սովորել (wanting I-am Armenian to-learn), Կարո՞ղ եմ քարտով վճարել։ (able am-I by-card to-pay?).", after: ["present"] },
    imperative: { name: "Commands and requests: զանգիր, տվեք", about: "A command has its own form: -իր or -ա to a friend (զանգիր: call, կարդա: read) and -եք or -ացեք to a stranger or more than one (խոսեք: speak, կարդացեք: read); give is տուր, տվեք.", after: ["infinitive"] },
    past: { name: "The past: -եցի, -ացի", about: "The past has endings of its own: ճաշեցինք (we had lunch), գնացի (I went), եկա (I came); be's past is էի, էր, էինք…: Սևանում էինք (at-Sevan we-were).", after: [] },
    future: { name: "The future: կ- in front", about: "կ- in front of the verb's form says will: կզանգեմ (I'll call), կճաշենք (we'll have lunch), կգա (will come).", after: [] },
    have: { name: "Having: ունեմ", about: "ունեմ is I have, ունես you have, ունի has, and չունեմ I don't have: Ես մի եղբայր ունեմ (I a brother have).", after: [] },
    "ka-chka": { name: "There is: կա, չկա", about: "կա says there is and չկա there isn't: Այստեղ բանկ կա՞։ (here bank there-is?), Կաթ չկա (milk there-isn't).", after: [] },
  },
};
