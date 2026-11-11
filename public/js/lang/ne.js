// Nepali (lang/index.js has what each field means).
// Written in Devanagari with spaces between words; a sentence ends in । (a question in ?). This is standard written
// Nepali as taught in Nepal's schools. Verbs use the -नु dictionary form, nouns the singular, and adjectives their base
// form. Devanagari has no capitals, so lemmas are "any"; Nepali needs no reading line.

export default {
  name: "Nepali",
  locale: "ne-NP",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  abbreviations: ["डा.", "प्रा."],
  stray: ["यदि", "ताकि"],
  ends: ["।"],
  patterns: {
    "verb-last": { name: "The verb goes last", about: "In a plain Nepali sentence, the object, place and time usually come before the verb: म चिया पिउँछु (I tea drink).", after: [] },
    honorifics: { name: "Respect levels", about: "Nepali marks respect in pronouns and verbs: for ‘you’, तपाईं is respectful, तिमी familiar and तँ very intimate and sometimes rude; for ‘he/she’, ऊ is familiar, उनी more polite and उहाँ respectful; the verb changes too: तपाईं खानुहुन्छ, तिमी खान्छौ, तँ खान्छस्, उहाँ जानुहुन्छ.", after: [] },
    "copula-cha": { name: "States and places: छ", about: "छ says that something exists, is somewhere or is in a state. It changes as म छु, तिमी छौ, ऊ छ and उनीहरू छन्; respectful तपाईं usually takes हुनुहुन्छ.", after: ["verb-last", "honorifics"] },
    "copula-ho": { name: "Identity: हो", about: "हो identifies or classifies something: ऊ शिक्षक हो. Its common forms are म हुँ, तिमी हौ, ऊ हो and उनीहरू हुन्; respectful तपाईं takes हुनुहुन्छ.", after: ["verb-last", "honorifics"] },
    agreement: { name: "Forms that match", about: "In careful standard Nepali, some possessives and adjectives match the noun, and some third-person past verbs match the subject: मेरो कोठा, मेरी बहिनी, मेरा दाजु; सानो केटा, सानी केटी, साना केटाहरू; ऊ गयो, ऊ गई; everyday speech often uses the basic -ो form instead.", after: [] },
    present: { name: "The present: -न्छ", about: "The simple present describes habits, facts and regular actions: म खान्छु, तिमी खान्छौ, ऊ खान्छ, हामी खान्छौँ. Respectful forms use -नुहुन्छ: तपाईं खानुहुन्छ. With a future time word or clear context, it is also the everyday way to talk about the future: म भोलि जान्छु.", after: ["verb-last", "honorifics"] },
    progressive: { name: "Happening now: -दै", about: "The verb form in -दै followed by a form of छ describes an action in progress: म सिक्दै छु, बच्चाहरू खेल्दै छन्.", after: ["present", "copula-cha"] },
    past: { name: "The past", about: "Completed past forms include मैले खाएँ (I ate), ऊ गयो (he went) and हामी गयौँ (we went). The ending changes with the subject and sometimes gender.", after: ["verb-last", "agreement"] },
    "le-past": { name: "The past doer takes ले", about: "With a completed action done to something, the doer commonly takes ले: मैले खाना खाएँ, उसले चिया पियो. An intransitive action such as ऊ गयो normally has no ले.", after: ["past", "postpositions"] },
    future: { name: "Talking about the future", about: "With a future time word or clear context, everyday Nepali usually uses the present form: म भोलि जान्छु, तिमी कहिले आउँछौ? Forms in -नेछ- are formal or written; -ला often expresses a prediction, possibility or tentative intention: पानी पर्ला.", after: ["present", "verb-last", "honorifics"] },
    negation: { name: "Not: छैन, होइन, न-", about: "छैन negates छ, and होइन negates हो. Other verbs use negative forms such as म खाँदिनँ and the negative prefix न- in requests such as नजानुहोस्.", after: ["copula-cha", "copula-ho", "present"] },
    postpositions: { name: "Postpositions follow the word", about: "Nepali puts relationship endings after the noun or pronoun: घरमा (at home), मलाई (to me), भक्तपुरबाट (from Bhaktapur), मसँग (with me). को, का and की mark possession.", after: [] },
    possessive: { name: "My and your: मेरो, तपाईंको", about: "मेरो and तपाईंको mean ‘my’ and respectful ‘your’. They change when the noun requires agreement: मेरी बहिनी, मेरा दाजु, तपाईंकी बहिनी, तपाईंका किताबहरू.", after: ["postpositions", "agreement"] },
    have: { name: "Having: … छ", about: "Nepali has no separate verb ‘have’: possession is commonly expressed with a possessive plus छ/छन् (मेरो किताब छ, मेरा दुई दाजु छन्) or with सँग plus छ/छन् for something available with someone (मसँग किताब छ).", after: ["postpositions", "possessive", "copula-cha"] },
    infinitive: { name: "The dictionary form: -नु", about: "A verb's dictionary form ends in -नु, such as खानु and जानु. Before another verb it often appears as खान, बोल्न or पकाउन: म खान चाहन्छु, म पकाउन सक्छु.", after: [] },
    imperative: { name: "Commands", about: "Commands reflect respect: तँ गर्, तिमी गर, तपाईं गर्नुहोस्. The pronoun is often omitted, but the command form still shows the level.", after: ["honorifics"] },
    "polite-request": { name: "Polite requests: -नुहोस्", about: "Use -नुहोस् with तपाईं: बस्नुहोस् (please sit), दिनुहोस् (please give). कृपया can be added for please: कृपया झ्याल खोल्नुहोस्.", after: ["imperative", "honorifics"] },
    "yesno-question": { name: "Yes-or-no questions", about: "A yes-or-no question may start with के: के तपाईं मासु खानुहुन्छ? In conversation, the same word order with questioning intonation also works: तपाईं सन्चै हुनुहुन्छ?", after: ["verb-last"] },
    "question-word": { name: "Question words stay in place", about: "को, के, कहाँ, कहिले, किन and कति normally stand where their answer would, before the final verb: तिमी कहाँ बस्छौ? टिकट कति पर्छ?", after: ["verb-last"] },
    "want-need": { name: "Want and need", about: "मलाई … चाहिन्छ means I need something: मलाई पानी चाहिन्छ. चाहनु expresses wanting, while a joined form in -नुपर्छ expresses necessity: मलाई जानुपर्छ.", after: ["postpositions", "infinitive"] },
    can: { name: "Can: सक्नु", about: "Put a dependent verb form before सक्नु: म पकाउन सक्छु, तपाईं बोल्न सक्नुहुन्छ. The ending of सक्नु agrees with the person and respect level.", after: ["infinitive", "honorifics"] },
    plural: { name: "More than one: -हरू", about: "The suffix -हरू can make a noun or pronoun plural: बच्चाहरू, मानिसहरू, उनीहरू. It is often omitted when a number or the context already makes the plural clear.", after: [] },
    classifiers: { name: "Counting with वटा and जना", about: "Use एउटा and forms with वटा for ordinary things: एउटा किताब, दुईवटा टिकट. जना counts people: दुई जना दाजु.", after: ["plural"] },
  },
};
