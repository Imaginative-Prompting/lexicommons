// Hawaiian, with its ʻokina (U+02BB, a letter: a keyboard types it as an apostrophe, apostropheLetter) and kahakō (the
// long vowels ā ē ī ō ū), as Pukui and Elbert's dictionary writes it (lang/index.js has what each field means).

export default {
  name: "Hawaiian",
  locale: "haw-US",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  apostropheLetter: "ʻ",
  abbreviations: [],
  stray: ["nō", "hoʻi", "paha", "nei"],
  patterns: {
    "verb-first": { name: "The action or description comes first", about: "A sentence usually starts with its action or description, then who or what it's about: Hele au i ke kula (go I to the school: I go to school), Liʻiliʻi ka hale (small the house: the house is small).", after: [] },
    "e-command": { name: "Commands and let's: e", about: "e right before a verb can make a command (E noho!: sit!), with kāua or kākou a let's (E hele kākou!: let's go, all of us), and with au, māua or mākou the future (E hele au i ke kula: I'll go to school).", after: ["verb-first"] },
    ua: { name: "Done: ua", about: "ua before the verb says it's done, often the past: Ua ʻai au (did eat I: I ate), Ua pau (is finished).", after: ["verb-first"] },
    "ke-nei": { name: "Right now: ke … nei", about: "ke before the verb and nei after it say it's happening now: Ke ʻai nei au (eating now I: I'm eating).", after: ["verb-first"] },
    "e-ana": { name: "Going on, or will: e … ana", about: "e before the verb and ana after it say it's going on, or will: E hele ana au i ke kula (going I to the school: I'll go to school).", after: ["verb-first"] },
    article: { name: "The: ka, ke", about: "The is ke before most words starting with k, e, a or o (ke kula, ke kai) and a few others (ke pākaukau: the table), and ka before most of the rest: ka hale (the house).", after: [] },
    na: { name: "More than one: nā", about: "nā takes the place of ka or ke for more than one: ka hale → nā hale (the houses), ke keiki → nā keiki (the children).", after: ["article"] },
    he: { name: "A, is a: he", about: "he says a, and starts a sentence that says what something is: He kumu ʻo ia (a teacher she: she's a teacher), He hale nui (a big house).", after: ["article"] },
    o: { name: "Naming the one: ʻo", about: "ʻo marks a name, or the one a sentence is about: ʻO wai kou inoa? (who your name?: what is your name?), He kumu ʻo ia (a teacher she).", after: [] },
    possessive: { name: "My, your: koʻu and kaʻu", about: "My is koʻu mainly for bonds you don't control and for what holds, clothes or carries you (koʻu makuahine: my mother, koʻu hoaloha: my friend, koʻu hale: my house), and kaʻu for what you control, get or make and bonds you cause (kaʻu kope: my coffee, kaʻu keiki: my child); your is kou or kāu.", after: [] },
    we: { name: "We, with you or not: kākou, mākou", about: "We is kākou or kāua when it takes in the one you're talking to, and mākou or māua when it doesn't: E hele kākou (let's go, all of us), Ua ʻai mākou (we ate, not you).", after: [] },
    negation: { name: "Not: ʻaʻole", about: "ʻaʻole starts the sentence and the pronoun moves before the verb, with ua becoming i: ʻAʻole au i ʻai (not I did eat: I didn't eat), ʻAʻole au e hele (I won't go).", after: ["ua"] },
    prepositions: { name: "To, at, from, with: i, ma, mai, me", about: "i says to or at (i ke kula: to the school) and comes before what many verbs act on (Inu au i ke kope: drink I the coffee), ma at or in (ma ka hale: at the house), mai from (mai Kaleponi mai: from California) and me with (me ka waiū: with milk).", after: ["article"] },
    aia: { name: "Is there, where it is: aia", about: "aia says where something is: Aia ka puke ma luna o ke pākaukau (there-is the book on top of the table), Aia i hea ka hale lua? (is-at where the bathroom?).", after: ["prepositions"] },
    have: { name: "Have: he … kaʻu, koʻu", about: "Have is said as a … mine: He ʻīlio kaʻu (a dog mine: I have a dog), He hale koʻu (a house mine: I have a house).", after: ["he", "possessive"] },
    makemake: { name: "Want: makemake", about: "makemake says want, with i before a thing and e before a verb: Makemake au i ke kope (want I the coffee), Makemake au e ʻai (want I to eat).", after: ["verb-first"] },
    question: { name: "How, what, where: pehea, he aha, hea", about: "pehea is how, he aha what, i hea or ma hea where, and ʻehia how many or how much: Pehea ʻoe? (how you?), He aha kēia? (what this?), Aia i hea ʻoe? (is at-where you?), ʻEhia kālā? (how many dollars?).", after: [] },
  },
};
