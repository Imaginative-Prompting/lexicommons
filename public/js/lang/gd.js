// Scottish Gaelic, in the Gaelic Orthographic Conventions' spelling (lang/index.js has what each field means). A word
// that changes its first sound (mhàthair, t-uisge) is written as said, under its dictionary form, the radical (màthair,
// uisge); docs/languages/mutations-and-cases.md.

export default {
  name: "Scottish Gaelic",
  locale: "gd-GB",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["msaa.", "m.e.", "msgr.", "dr.", "td.", "àir."],
  stray: ["tha", "is", "ag", "mi", "gu"],
  patterns: {
    "verb-first": { name: "The verb comes first", about: "A plain Gaelic sentence starts with its verb, then who or what: Tha an cofaidh fuar (is the coffee cold).", after: [] },
    "bi-is": { name: "Two verbs for be: tha and is", about: "tha says where someone or something is, or what they're like (Tha mi sgìth: am I tired), while is says who or what someone or something is, often as 'S e … a th' ann: 'S e tidsear a th' innte (it's a teacher that is in her).", after: ["verb-first"] },
    lenition: { name: "Lenition: an h after the first letter", about: "After mo (my), do (your), a meaning his, cha, the past marker do and some other words, many first consonants soften, written with an h: màthair → mo mhàthair (my mother), ceannaich → cha do cheannaich (not did buy).", after: [] },
    article: { name: "the: an, am, a', na", about: "the is an with most words, am before b, f, m and p (am bus), a' with a softened first sound on many feminine words (a' bhùth: the shop), an t- before a vowel on masculine words (an t-uisge: the water), and na with more than one.", after: ["lenition"] },
    "adjective-after": { name: "Describing words after the noun", about: "Most describing words come after the noun, and soften after a feminine one: taigh mòr (house big), caileag bheag (girl small).", after: ["lenition"] },
    possessive: { name: "my and your: mo, do, or … agam", about: "mo (my) and do (your) soften the next word and go with family and the body (mo mhàthair: my mother); for most things Gaelic says the thing at you: an càr agam (the car at-me: my car).", after: ["lenition"] },
    "his-her": { name: "a: his or her", about: "a means his or her, and only what follows says which: a chù (his dog: softened), a cù (her dog), a h-athair (her father).", after: ["lenition"] },
    "prepositional-pronouns": { name: "Prepositions join with pronouns", about: "aig, air and le join a pronoun: aig + mi is agam (at me), air + thu is ort (on you), le + mi is leam (with me).", after: [] },
    "aig-have": { name: "Having: tha … agam", about: "Gaelic says something is at you: Tha càr agam (is car at-me: I have a car), A bheil Gàidhlig agad? (is Gaelic at-you: do you speak Gaelic?).", after: ["verb-first", "prepositional-pronouns"] },
    "feelings-on": { name: "Feelings: tha … orm", about: "Hunger, thirst and a cold are on you: Tha an t-acras orm (is the hunger on-me: I'm hungry), A bheil am pathadh ort? (is the thirst on-you?).", after: ["verb-first", "prepositional-pronouns"] },
    liking: { name: "Liking: is toil leam", about: "Gaelic says it's a pleasure with you: Is toil leam cofaidh (is pleasure with-me coffee: I like coffee), Bu toil leam… (would-be pleasure with-me: I'd like…).", after: ["bi-is", "prepositional-pronouns"] },
    "ag-ing": { name: "Ongoing actions and habits: ag, a'", about: "A form of bi with ag (before a vowel) or a' (before a consonant) and the verb's noun says what someone is doing or regularly does: Tha mi ag obair (am I at working), Bidh sinn ag ithe aig seachd uairean (will-be we at eating at seven hours).", after: ["verb-first"] },
    negation: { name: "Not: chan eil, cha", about: "chan eil is isn't (Chan eil mi sgìth: not am I tired), and cha (chan before a vowel) comes before other verbs, softening most: Chan ith mi feòil (not eat I meat), Cha do cheannaich mi (not did buy I).", after: ["bi-is", "lenition"] },
    question: { name: "Questions", about: "A bheil starts a present yes-or-no question (A bheil thu sgìth?: whether are you tired?), and a question word comes first (Càite a bheil an taigh-beag?: where that is the toilet?). Gaelic has no one word for yes or no: you answer with the question's verb, so A bheil…? takes Tha (is) or Chan eil (isn't).", after: ["verb-first", "negation"] },
    past: { name: "The past: a softened first sound", about: "Most verbs soften in the past, with dh' before a vowel: Cheannaich mi (bought I), Dh'òl mi (drank I); common verbs have their own: Chaidh mi (went I), Bha mi (was I).", after: ["verb-first", "lenition"] },
    future: { name: "The future and habits: -idh or -aidh", about: "-idh or -aidh says what will happen (or always does): Glanaidh mi (will-clean I), Bidh mi (will-be I); common verbs have their own: Thèid mi (will-go I), Chì mi (will-see I).", after: ["verb-first"] },
  },
};
