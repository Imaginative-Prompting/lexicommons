// Marathi (lang/index.js has what each field means).
// Written in Devanagari with spaces between words; modern Marathi ends statements with "." (questions with "?"), so
// it needs no language-specific `ends`. Standard spelling follows the [Maharashtra government-approved rules](https://rmvs.marathi.gov.in/%E0%A4%AE%E0%A4%B0%E0%A4%BE%E0%A4%A0%E0%A5%80-%E0%A4%B6%E0%A5%81%E0%A4%A6%E0%A5%8D%E0%A4%A7%E0%A4%B2%E0%A5%87%E0%A4%96%E0%A4%A8); this module uses
// Pune-based standard forms, including ळ, standard anusvara, and the schwa spellings of formal prose rather than
// colloquial neuter endings in -ं. Devanagari has no capitals, and its vowel signs are combining marks, part of a word.

export default {
  name: "Marathi",
  locale: "mr-IN",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  abbreviations: ["डॉ.", "प्रा.", "श्री.", "सौ.", "कु.", "उदा.", "क्र.", "नं."],
  stray: ["जरी", "कारण"],
  patterns: {
    "verb-last": { name: "The verb goes last", about: "A plain Marathi sentence normally puts the object, place and time before the verb: मी चहा पितो (I tea drink).", after: [] },
    gender: { name: "Gender and agreement", about: "Nouns are masculine, feminine or neuter, and many possessives, adjectives and verbs agree with them: माझा भाऊ, माझी बहीण; a man says मी खातो and a woman मी खाते.", after: [] },
    neuter: { name: "Neuter words", about: "Neuter singular words take forms such as माझे and हवे: माझे नाव, मला पाणी हवे आहे. Standard writing uses full forms such as मोठे, not colloquial मोठं.", after: ["gender"] },
    plural: { name: "More than one", about: "Nouns can change in the plural: खोली becomes खोल्या and कुत्रा becomes कुत्रे; a plural subject uses forms such as मित्र आहेत.", after: ["gender", "copula"] },
    we: { name: "We: आम्ही and आपण", about: "आम्ही excludes the listener, while आपण includes the listener and can also be a respectful you.", after: [] },
    postpositions: { name: "Postpositions join the word", about: "Marathi puts its short case endings and postpositions after a noun or pronoun and writes them joined: घरात (in the house), टेबलावर (on the table), मला (to me), माझ्याबरोबर (with me).", after: [] },
    oblique: { name: "The form before a postposition", about: "Before a joined ending, some words change to a linking form: पुणे becomes पुण्या- in पुण्याला, मी becomes माझ्या- in माझ्याबरोबर, and मित्र becomes मित्रा- in मित्राला.", after: ["postpositions"] },
    copula: { name: "To be: आहे, आहेस, आहात, आहोत, आहेत", about: "असणे has मी आहे, तू आहेस, तुम्ही आहात, आम्ही आहोत, and singular तो/ती/ते आहे versus plural ते/त्या/ती आहेत; the common negatives are नाही, नाहीस and नाहीत.", after: [] },
    present: { name: "The present: खातो, खाते, खातात", about: "For habits and general facts, the verb ending follows person, number and often gender: मी खातो (a man), मी खाते (a woman), ते खातात (they eat).", after: ["gender"] },
    progressive: { name: "Happening now: खात आहे", about: "For an action happening now, use the verb's -त form with असणे: मी खात आहे, ती वाचत आहे, मुले खेळत आहेत.", after: ["present","copula"] },
    past: { name: "The past and agreement", about: "A completed action uses a past form that agrees where Marathi requires it: मी भात खाल्ला, मी पोळी खाल्ली, मी तिकीट घेतले.", after: ["gender"] },
    "ergative-ne": { name: "A past doer: -ने and -नी", about: "With a completed transitive action, a singular noun or third-person pronoun normally takes a -ने form, while a plural noun or third-person pronoun takes a -नी form; the verb agrees with the object: मुलाने/त्याने आंबा खाल्ला, मुलांनी/त्यांनी आंबे खाल्ले, तिने पोळी खाल्ली.", after: ["past", "gender", "postpositions"] },
    future: { name: "The future: जाईन, जाऊ, येशील", about: "Personal future endings give forms such as मी जाईन, आम्ही जाऊ and तू येशील; -णार is another common future form and does not change with the subject, as in पाऊस पडणार आहे.", after: [] },
    negation: { name: "Not and don't: नाही, नको", about: "नाही negates a statement: दूध नाही, येऊ शकत नाही. नको says something is not wanted; नका is its polite or plural form in a negative request.", after: ["copula"] },
    requests: { name: "Requests: उघड, उघडा", about: "Use the short imperative with familiar तू and the respectful or plural form with तुम्ही: दिवा लाव, खिडकी उघडा. कृपया makes either request more polite.", after: ["address"] },
    address: { name: "You: तू and तुम्ही", about: "तू is familiar singular; तुम्ही is polite singular or plural. Their verbs differ: तू येशील, तुम्ही याल; तू बस, तुम्ही बसा.", after: ["copula"] },
    "question-ka": { name: "Yes/no questions end in का", about: "Put का at the end to ask a yes/no question without changing the rest of the order: तुम्ही मराठी बोलता का?", after: ["verb-last"] },
    "question-word": { name: "Question words stay in place", about: "काय, कोण, कुठे and केव्हा go where the answer would go, usually before the final verb: तुमचे नाव काय आहे? बस केव्हा येईल?", after: ["verb-last"] },
    possessive: { name: "My and your agree", about: "माझा, तुझा and तुमचा agree with the thing owned, not its owner: माझा भाऊ, माझी बहीण, माझे नाव. Joined -चा, -ची and -चे work the same way: बसचा थांबा.", after: ["gender"] },
    have: { name: "Having: माझ्याकडे … आहे", about: "Marathi expresses possession as something being with a person: माझ्याकडे फोन आहे (I have a phone), तिच्याकडे दोन कुत्रे आहेत, माझ्याकडे वेळ नाही.", after: ["possessive", "copula", "postpositions"] },
    "there-is": { name: "There is: आहे", about: "Put the place first and आहे or आहेत last: घरात दोन खोल्या आहेत. Use नाही when the thing is absent: फ्रिजमध्ये दूध नाही.", after: ["copula", "postpositions"] },
    "want-need": { name: "Like, want and need: -ला", about: "Marathi marks the person with -ला in these constructions: मित्राला चहा आवडतो, मला चहा हवा आहे, मला काम करायचे आहे, and मला निघायला पाहिजे.", after: ["postpositions", "gender", "copula"] },
    can: { name: "Can: -ऊ शकणे", about: "Use the verb's -ऊ form before शकणे: मी येऊ शकतो, तुम्ही मदत करू शकता. The form of शकणे agrees with the person and sometimes gender.", after: ["present"] },
  },
};
