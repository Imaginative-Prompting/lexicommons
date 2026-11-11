// Gujarati (lang/index.js has what each field means).
// Written in the Gujarati script with spaces between words; modern Gujarati ends a sentence with . (a question with ?).
// Vowel signs and anusvara are combining marks (\p{M}), part of the word wherever words are compared. The script is
// read as written, so the app shows no separate readings; lemmas are "any".

export default {
  name: "Gujarati",
  locale: "gu-IN",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  abbreviations: ["ડૉ.", "પ્રો.", "શ્રી.", "કુ.", "તા.", "નં."],
  stray: ["પ્રત્યે", "મુજબ"],
  patterns: {
    "verb-last": { name: "The verb usually goes last", about: "A plain Gujarati sentence usually puts the verb at the end: હું ચા પીઉં છું (I tea drink).", after: [] },
    copula: { name: "Am, is, are: છું, છે, છીએ, છો", about: "હોવું changes with the subject: હું છું (I am), તે છે (he, she or it is), અમે છીએ (we are), તમે છો (you are).", after: [] },
    "no-articles": { name: "No a or the", about: "Gujarati has no separate words matching English a, an or the; context usually supplies the meaning, while એક can mean one and sometimes a.", after: [] },
    gender: { name: "Masculine, feminine and neuter", about: "Gujarati has three genders. An adjective in -ો changes to -ી or -ું to agree: નાનો ઓરડો, મોટી બારી, નાનું ઘર.", after: [] },
    plural: { name: "More than one: -ઓ", about: "Many count nouns take -ઓ: બહેન becomes બહેનો and પુસ્તક becomes પુસ્તકો. After a number, some nouns stay singular: બે રાત.", after: ["gender"] },
    "inclusive-we": { name: "We: અમે and આપણે", about: "અમે excludes the person spoken to, while આપણે includes that person.", after: [] },
    postposition: { name: "Endings and postpositions", about: "Some relations attach to the noun, as in ઘરમાં, બસથી and રવિવારે; others are separate, as in ટેબલ પર and મારી સાથે.", after: [] },
    dative: { name: "To someone: -ને", about: "-ને attaches to a person who receives or experiences something: મને (to me), તમને (to you), રવિને (to Ravi). મને આ ગીત ગમે છે is literally this song is pleasing to me.", after: ["postposition"] },
    genitive: { name: "Possession: my મારો, મારી, મારું, મારા, મારાં; of/’s -નો, -ની, -નું, -ના, -નાં", about: "The possessive agrees with the thing owned: મારો ભાઈ, મારી બહેન, મારું ઘર, મારા મિત્રો, and મારાં with a neuter plural (મારાં બાળકો). A noun can take the same endings.", after: ["gender"] },
    "light-verb": { name: "Making verbs with કરવું", about: "Gujarati often makes a verb by pairing a noun or adjective with કરવું: મદદ કરવી means to help, ફોન કરવો means to call and બંધ કરવું means to close.", after: ["gender", "verb-last"] },
    have: { name: "Having: પાસે … છે", about: "Gujarati expresses have with પાસે and the copula: મારી પાસે ચાવી છે is literally near me a key is. Use નથી when the thing is not there.", after: ["genitive", "postposition", "copula"] },
    present: { name: "The present", about: "For habits and general facts, Gujarati uses forms such as હું કરું છું, તમે કરો છો and તે કરે છે; before નથી, it often uses an agreeing -તો, -તી or -તું form, as in રવિ કૉફી પીતો નથી.", after: ["verb-last", "copula"] },
    progressive: { name: "Right now: રહ્યો, રહી, રહ્યું", about: "The verb with રહ્યો, રહી or રહ્યું describes an action in progress: રવિ શીખી રહ્યો છે; મા ચા બનાવી રહી છે.", after: ["present", "gender"] },
    past: { name: "The past and agreement", about: "Past forms often agree in gender and number: ટ્રેન મોડી આવી, ભોજન સ્વાદિષ્ટ હતું. A completed intransitive action normally agrees with its subject.", after: ["gender", "verb-last"] },
    "past-doer": { name: "A past doer: મેં, તેણે, -એ", about: "A completed transitive action marks its doer as મેં, તેણે or a noun with -એ. The verb agrees with an unmarked object: મેં નાસ્તો કર્યો; તેણે ચા પીધી.", after: ["past", "gender"] },
    future: { name: "The future: -ીશ, -શે, -શો, -ીશું", about: "Future endings show the subject: હું કરીશ, તે કરશે, તમે કરશો, અમે કરીશું. The verb still comes last.", after: ["verb-last"] },
    negation: { name: "Not: નથી, ન, નહીં", about: "નથી replaces or negates the copula, ન goes before a negative command, and નહીં commonly negates a future or adds emphasis: ચાવી નથી; ન જશો; નહીં થાઉં.", after: ["copula"] },
    "yes-no": { name: "Yes/no questions: શું", about: "શું often starts a yes/no question and acts as a question marker: શું તમે ગુજરાતી બોલો છો? In conversation, intonation alone can also make a yes/no question.", after: ["verb-last"] },
    "question-word": { name: "Question words stay in place", about: "Gujarati normally leaves a question word where its answer would go: બસ સ્ટોપ ક્યાં છે? and તમને કોણ મદદ કરે છે?", after: ["verb-last"] },
    infinitive: { name: "The dictionary form: -વું", about: "Most Gujarati verb headwords end in -વું, as in જવું and ખાવું; when an infinitive acts like an adjective, its ending can agree, as in રોટલી ખાવી.", after: ["gender"] },
    "want-need": { name: "Want and need: મારે … જોઈએ છે", about: "Use મને or મારે with જોઈએ છે for something wanted or needed, and use મારે with an infinitive plus છે for something one has to do: મને પાણી જોઈએ છે; મારે ચા જોઈએ છે; મારે જવું છે.", after: ["dative", "infinitive"] },
    can: { name: "Can: શકવું", about: "Before શકવું, the main verb takes a form such as આવી, જઈ or પી: આવી શકું છું means I can come and જઈ શકો છો means you can go.", after: ["infinitive", "present"] },
    imperative: { name: "Asking and telling", about: "A polite command commonly ends in -ઓ: બેસો, કરો, આપો. Put ન before it for a negative request: ન જશો.", after: ["verb-last"] },
    "polite-you": { name: "Polite you: તમે", about: "તમે means plural you and also polite singular you. It takes છો, future -શો and polite commands such as બેસો.", after: ["copula", "imperative"] },
  },
};
