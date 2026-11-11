// Georgian, in Mkhedruli, the alphabet everyday Georgian is written in, without capitals (lang/index.js has what each
// field means). Verbs are headworded by their verbal noun (ცხოვრება for ვცხოვრობ), with the prefix the form carries
// (წასვლა for წავედი, დარეკვა for დავრეკავ); nouns and describing words in the -ი form, or bare when they end in a vowel.

export default {
  name: "Georgian",
  locale: "ka-GE",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["მაგ.", "ქ.", "წ.", "გვ."],
  stray: ["კი", "რომ", "ხომ", "თუ"],
  patterns: {
    copula: { name: "Am, are, is: ვარ, ხარ, არის, -ა", about: "ვარ is am, ხარ are (to one person), არის is, and is can join the word before it as -ა: მე სტუდენტი ვარ (I student am), ეს ჩემი სახლია (this my house-is).", after: [] },
    person: { name: "Who: ვ-, -ს and -თ on the verb", about: "The verb often shows who: ვ- marks I (ვცხოვრობ: I live), ვ- with -თ we (ვცხოვრობთ), -ს he or she (ცხოვრობს), and -თ without ვ- you, to more than one or politely (ცხოვრობთ).", after: [] },
    question: { name: "Questions: რა, სად, როგორ", about: "A question word goes just before the verb, and a yes-or-no question keeps its order and rises at the end: სად ცხოვრობ? (where you-live?), ქართული იცი? (Georgian you-know?).", after: [] },
    negation: { name: "Not: არ, ვერ", about: "არ before the verb is not, and ვერ is can't: არ ვიცი (not I-know: I don't know), ვერ გავიგე (couldn't I-understood: I didn't catch that).", after: ["person"] },
    possessive: { name: "My, your: ჩემი, შენი", about: "ჩემი (my), შენი (your), მისი (his, her), ჩვენი (our) and თქვენი (your, polite) go before the noun; mom and dad often take my on the end: დედაჩემი (my mom).", after: [] },
    plural: { name: "More than one: -ები", about: "-ები makes more than one: წიგნი → წიგნები (books); after a number the noun stays one: ორი ძმა (two brother).", after: [] },
    shi: { name: "In: -ში", about: "-ში on the end says in, and a final -ი goes: თბილისი → თბილისში (in Tbilisi), სახლი → სახლში (in the house, at home).", after: [] },
    ze: { name: "On, about: -ზე", about: "-ზე on the end says on or about: მაგიდაზე (on the table), ფილმზე (about the movie).", after: [] },
    dan: { name: "From: -დან", about: "-დან on the end says from, with -ი- after a consonant or in place of a final -ა: ამერიკა → ამერიკიდან (from America), სახლიდან (from home), აქედან (from here).", after: [] },
    tan: { name: "At, by, with: -თან", about: "-თან on the end says with a person, or at or by a person, place or thing: ექიმთან (at the doctor's), მეგობართან (with a friend), ბანკთან (by the bank).", after: [] },
    genitive: { name: "Of: -ის, first", about: "-ის on the end says of, and that word comes first: მამის მანქანა (dad's car), ქალაქის ცენტრი (the city's center).", after: [] },
    instrumental: { name: "By, with: -ით", about: "-ით on the end says by or with: ავტობუსით (by bus), ბარათით (by card), რძით (with milk).", after: [] },
    adverbial: { name: "In a language: -ად", about: "-ად on the end says in a language, or as: ქართულად (in Georgian), ინგლისურად (in English).", after: [] },
    have: { name: "Having: მაქვს, მყავს", about: "მაქვს is I have a thing and მყავს I have a person or a pet, with the one you have as it is: მანქანა მაქვს (car I-have), ძმა მყავს (brother I-have); for you, გაქვს and გყავს.", after: [] },
    "like-want": { name: "Liking, wanting: მომწონს, მინდა", about: "Liking, loving and wanting mark the person on the verb, and what's liked stays as it is: მომწონს (I like), მიყვარს (I love), მინდა (I want): ყავა მიყვარს (coffee I-love).", after: ["person"] },
    object: { name: "Objects now and in a completed past: -ს, or as it is", about: "With many action verbs, the thing acted on takes -ს now but stays as it is after a completed past action: ყავას ვსვამ (coffee I-drink), ფეხსაცმელი ვიყიდე (shoes I-bought).", after: ["past"] },
    past: { name: "The past: ვნახე, წავედი", about: "The past has forms of its own, often with a prefix: ვნახე (I saw), წავედი (I went), ვიყიდე (I bought).", after: ["person"] },
    narrative: { name: "The doer in a completed past: -მა, -მ", about: "With many completed past actions done to something, the doer takes -მა after a consonant or -მ after a vowel: მეგობარმა ბილეთები იყიდა (friend tickets bought), დედამ სადილი მოამზადა (mom lunch made).", after: ["past", "object"] },
    future: { name: "The future: a prefix in front", about: "Many verbs make the future with a prefix, some changing their stem too: ვაკეთებ (I do) → გავაკეთებ (I'll do), ვრეკავ (I call) → დავრეკავ (I'll call); I'll go is წავალ.", after: ["person"] },
  },
};
