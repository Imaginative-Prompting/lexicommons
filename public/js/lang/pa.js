// Punjabi (lang/index.js has what each field means).
// Eastern Punjabi is written left to right in Gurmukhi, with spaces between words; a sentence ends in । and a
// question in ?. Pakistan's Punjabi is normally written in Shahmukhi; this module and pack use the Gurmukhi standard
// taught in Indian Punjab's schools. Gurmukhi has no capitals, so lemmas are "any". Its vowel signs, tippi, bindi and
// addak are combining marks, part of the word. Gurmukhi shows tone only through ਘ ਝ ਢ ਧ ਭ and ਹ, so a word with a high
// or low tone, or a silent ਹ, carries its pronunciation in Latin letters (readings "roman") until it's known well. The
// reading scheme: a i u are short; ā ī ū e o are long; ai and au are single long vowels; a tilde or ñ after a vowel
// marks nasalization; y is as in *yes* and v represents ਵ; doubled consonants are held; t d n are dental; ṭ ḍ ṇ are
// retroflex and ṛ is a retroflex flap; ch and j are affricates; kh, chh, ṭh, th and ph are aspirated; acute marks high
// tone and grave marks low tone on the vowel carrying it; level is unmarked, and silent ਹ is omitted. Readings are
// lowercase except for a name's initial capital.

export default {
  name: "Punjabi",
  locale: "pa-IN",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  readings: "roman",
  abbreviations: ["ਡਾ.", "ਪ੍ਰੋ."],
  stray: ["ਕਿਉਂਕਿ", "ਜਦਕਿ"],
  ends: ["।"],
  patterns: {
    "verb-last": { name: "The verb usually goes last", about: "In a plain Punjabi sentence, the object and place normally come before the verb: ਮੈਂ ਚਾਹ ਪੀਂਦਾ ਹਾਂ (I tea drink).", after: [] },
    gender: { name: "Masculine and feminine", about: "Nouns are masculine or feminine, and many adjectives and verb forms agree with them: ਛੋਟਾ ਕਮਰਾ, ਵੱਡੀ ਰਸੋਈ; ਉਹ ਰਹਿੰਦਾ ਹੈ or ਰਹਿੰਦੀ ਹੈ.", after: [] },
    copula: { name: "Am, is, are: ਹਾਂ, ਹੈਂ, ਹੈ, ਹੋ, ਹਨ", about: "ਹੋਣਾ changes with the subject: ਮੈਂ ਹਾਂ, ਤੂੰ ਹੈਂ, ਉਹ ਹੈ, ਤੁਸੀਂ ਹੋ, ਅਸੀਂ ਹਾਂ and ਉਹ ਹਨ. ਸੀ means was; ਸਨ is its plural or respectful form.", after: [] },
    negation: { name: "Not: ਨਹੀਂ and ਨਾ", about: "ਨਹੀਂ normally comes before the verb or predicate: ਮੈਂ ਕੌਫ਼ੀ ਨਹੀਂ ਪੀਂਦੀ. A negative request or command uses ਨਾ: ਦਰਵਾਜ਼ਾ ਨਾ ਖੋਲ੍ਹੋ.", after: ["verb-last"] },
    present: { name: "Habits: -ਦਾ ਹਾਂ", about: "For habits and general facts, use -ਦਾ, -ਦੀ or -ਦੇ, normally with ਹੋਣਾ: ਮੈਂ ਚਾਹ ਪੀਂਦਾ ਹਾਂ; ਬੱਸ ਅੰਮ੍ਰਿਤਸਰ ਨੂੰ ਜਾਂਦੀ ਹੈ. In a present negative, the final copula normally drops: ਮੈਂ ਕੌਫ਼ੀ ਨਹੀਂ ਪੀਂਦੀ.", after: ["copula", "gender"] },
    progressive: { name: "Right now: ਰਿਹਾ ਹਾਂ", about: "A verb stem with ਰਿਹਾ, ਰਹੀ or ਰਹੇ describes what is happening now, normally with ਹੋਣਾ: ਮਾਂ ਚਾਹ ਬਣਾ ਰਹੀ ਹੈ. In a present negative, the final copula normally drops: ਅੱਜ ਮੀਂਹ ਨਹੀਂ ਪੈ ਰਿਹਾ.", after: ["copula", "gender"] },
    past: { name: "Completed actions and ਸੀ", about: "A completed verb often agrees in gender and number: ਰੇਲਗੱਡੀ ਆਈ, ਅਸੀਂ ਪੀਜ਼ਾ ਖਾਧਾ. ਸੀ and ਸਨ are the past forms of the copula.", after: ["gender", "copula"] },
    ne: { name: "A past doer: ਨੇ", about: "With many completed transitive actions, a named or noun doer takes ਨੇ; ਉਹ and ਇਹ use ਉਹਨੇ/ਇਹਨੇ (or formal ਉਸ ਨੇ/ਇਸ ਨੇ). ਮੈਂ, ਅਸੀਂ, ਤੂੰ and ਤੁਸੀਂ do not take ਨੇ. The verb agrees with an unmarked object.", after: ["past", "postpositions"] },
    future: { name: "Future: -ਗਾ, -ਗੀ, -ਗੇ", about: "Future forms agree with person, gender and number: ਮੈਂ ਆਵਾਂਗਾ, ਉਹ ਆਵੇਗੀ, ਤੁਸੀਂ ਆਓਗੇ and ਅਸੀਂ ਆਵਾਂਗੇ.", after: ["gender"] },
    postpositions: { name: "Postpositions follow the noun", about: "Punjabi puts ਵਿੱਚ, ਉੱਤੇ or ਤੇ, ਤੋਂ, ਨੂੰ and ਨਾਲ after the word they belong to: ਘਰ ਵਿੱਚ, ਮੇਜ਼ ਉੱਤੇ, ਦਿੱਲੀ ਤੋਂ, ਅਮਨ ਨੂੰ, ਬੱਸ ਨਾਲ.", after: ["verb-last"] },
    oblique: { name: "The form before a postposition", about: "A masculine noun in -ਆ, and words agreeing with it, usually change before a postposition: ਮੁੰਡਾ becomes ਮੁੰਡੇ ਨੂੰ; ਛੋਟਾ ਕਮਰਾ becomes ਛੋਟੇ ਕਮਰੇ ਵਿੱਚ. Pronouns have their own forms too, such as ਮੈਂ → ਮੈਨੂੰ and ਅਸੀਂ → ਸਾਨੂੰ.", after: ["postpositions", "gender"] },
    possessive: { name: "Of and my: ਦਾ, ਦੀ, ਦੇ", about: "ਦਾ, ਦੀ and ਦੇ agree with the thing owned: ਮੁੰਡੇ ਦਾ ਬੈਗ, ਮਾਂ ਦੀ ਚਾਹ. ਮੇਰਾ, ਤੁਹਾਡਾ and ਸਾਡਾ change in the same way.", after: ["gender", "postpositions"] },
    have: { name: "Having: ਮੇਰੇ ਕੋਲ", about: "Punjabi usually expresses possession with ਕੋਲ and the copula: ਮੇਰੇ ਕੋਲ ਕਿਤਾਬ ਹੈ, literally near me a book is. Homes can use ਘਰ ਵਿੱਚ in the same way. With close family, ਮੇਰੇ ਦੋ ਭਰਾ ਹਨ—literally ‘my two brothers are’—is a natural way to say ‘I have two brothers.’", after: ["possessive", "copula"] },
    "there-is": { name: "There is: place first", about: "For English there is or there are, Punjabi normally puts the place first and ਹੈ or ਹਨ last: ਮੇਜ਼ ਉੱਤੇ ਕਿਤਾਬ ਹੈ; ਫ਼ਰਿੱਜ ਵਿੱਚ ਦੁੱਧ ਨਹੀਂ ਹੈ. A locative statement can instead start with the thing: ਚਾਬੀਆਂ ਮੇਜ਼ ਉੱਤੇ ਹਨ.", after: ["postpositions", "copula"] },
    polite: { name: "You politely: ਤੁਸੀਂ and ਜੀ", about: "ਤੂੰ is intimate singular and takes ਹੈਂ. ਤੁਸੀਂ is polite or plural and takes plural-style forms such as ਹੋ and ਸਕਦੇ; ਜੀ adds respect to a greeting, answer or request.", after: ["copula"] },
    imperative: { name: "Requests: ਬੈਠੋ", about: "A direct familiar command can use the bare stem, while -ਓ makes it plural or polite: ਬੈਠੋ, ਖੋਲ੍ਹੋ, ਕਰੋ. ਕਿਰਪਾ ਕਰਕੇ makes a request explicitly polite.", after: ["polite"] },
    "karna-compounds": { name: "Verbs with ਕਰਨਾ", about: "Punjabi often makes a verb from a noun or adjective with ਕਰਨਾ: ਮਦਦ ਕਰਨਾ means to help, ਫ਼ੋਨ ਕਰਨਾ to call and ਬੰਦ ਕਰਨਾ to close; only ਕਰਨਾ changes.", after: ["verb-last"] },
    "yes-no-question": { name: "Yes/no questions: ਕੀ", about: "ਕੀ at the beginning introduces a yes/no question, while the rest keeps Punjabi order: ਕੀ ਤੁਸੀਂ ਪੰਜਾਬੀ ਬੋਲਦੇ ਹੋ?", after: ["verb-last"] },
    "question-words": { name: "Question words stay in place", about: "ਕੀ, ਕੌਣ, ਕਿੱਥੇ, ਕਦੋਂ, ਕਿਉਂ and ਕਿੰਨਾ usually stand where the answer would, often just before the final verb: ਬੱਸ ਅੱਡਾ ਕਿੱਥੇ ਹੈ?", after: ["verb-last"] },
    "want-need": { name: "Want, need and have to", about: "ਚਾਹੁਣਾ means to want: ਮੈਂ ਜਾਣਾ ਚਾਹੁੰਦਾ ਹਾਂ. For need, the person takes ਨੂੰ and ਚਾਹੀਦਾ agrees with the needed thing: ਮੈਨੂੰ ਪਾਣੀ ਚਾਹੀਦਾ ਹੈ; ਮੈਨੂੰ ਚਾਹ ਚਾਹੀਦੀ ਹੈ. To say someone has to do something, the person takes ਨੂੰ before an infinitive and ਹੈ: ਮੈਨੂੰ ਹੁਣ ਜਾਣਾ ਹੈ.", after: ["postpositions", "gender", "copula", "infinitive"] },
    infinitive: { name: "The infinitive: -ਣਾ", about: "Dictionary verb forms normally end in -ਣਾ: ਖਾਣਾ, ਜਾਣਾ, ਕਰਨਾ. Before a purpose phrase, the ending is often -ਣ: ਦੁੱਧ ਖਰੀਦਣ ਦੁਕਾਨ ਜਾਣਾ.", after: ["verb-last"] },
    can: { name: "Can: ਸਕਣਾ", about: "A verb stem followed by a form of ਸਕਣਾ expresses ability: ਮੈਂ ਜਾ ਸਕਦਾ ਹਾਂ; ਤੁਸੀਂ ਮਦਦ ਕਰ ਸਕਦੇ ਹੋ.", after: ["infinitive", "copula", "gender"] },
    plural: { name: "More than one", about: "A masculine noun in -ਆ often changes to -ੇ; a feminine noun in -ੀ often changes to -ੀਆਂ, and many other feminine nouns take -ਾਂ: ਮੁੰਡਾ→ਮੁੰਡੇ, ਚਾਬੀ→ਚਾਬੀਆਂ, ਪਲੇਟ→ਪਲੇਟਾਂ. A third-person plural noun subject normally takes ਹਨ; ਅਸੀਂ takes ਹਾਂ and ਤੁਸੀਂ takes ਹੋ.", after: ["gender", "copula"] },
    "no-articles": { name: "No a, an or the", about: "Punjabi normally has no articles: ਕਿਤਾਬ can mean a book or the book from context.", after: [] },
  },
};
