// Irish, as the official standard (An Caighdeán Oifigiúil) writes it (lang/index.js has what each field means). A word
// that changes its first sound (mháthair, dteach, t-uisce) is written as said, under its dictionary form, the radical
// (máthair, teach, uisce); docs/languages/mutations-and-cases.md.

export default {
  name: "Irish",
  locale: "ga-IE",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["m.sh.", "lch.", "uimh.", "dr.", "uas.", "r.", "c."],
  stray: ["tá", "is", "ag", "mé", "go"],
  patterns: {
    "verb-first": { name: "The verb comes first", about: "A plain Irish sentence starts with its verb, then who: Tá an t-uisce fuar (is the water cold).", after: [] },
    "ta-is": { name: "Two verbs for be: tá and is", about: "tá says where or how someone is (Tá mé tuirseach: am I tired), and is says who or what someone is: Is múinteoir í (is teacher she: she's a teacher).", after: ["verb-first"] },
    lenition: { name: "Lenition: an h after the first letter", about: "After mo (my), do (your), a meaning his, ní and some other words, many first consonants soften, usually written with an h: máthair → mo mháthair (my mother), tuigim → ní thuigim (not I-understand).", after: [] },
    eclipsis: { name: "Eclipsis: a new first sound", about: "After ár (our), a meaning their, i (in), an (whether) and cá (where), a new sound covers the first one: teach → ár dteach (our house), Gaillimh → i nGaillimh (in Galway), fuil → an bhfuil? (is?).", after: ["lenition"] },
    possessive: { name: "a: his, her or their", about: "a means his, her or their, and only the change after it says which: a theach (his house), a teach (her house), a dteach (their house).", after: ["lenition", "eclipsis"] },
    article: { name: "the: an and na", about: "an normally means the with one thing and na with more than one, but na is also used with some singular of-the phrases; the article changes some first sounds: an t-uisce (the water), an fhuinneog (the window), na heochracha (the keys).", after: ["lenition"] },
    "adjective-after": { name: "Describing words after the noun", about: "Most describing words come after the noun: teach mór (house big), fíon dearg (wine red).", after: [] },
    "prepositional-pronouns": { name: "Prepositions join with pronouns", about: "Many Irish prepositions join to a pronoun: ag + mé becomes agam (at me), ar + tú becomes ort (on you), and le + mé becomes liom (with me).", after: [] },
    "ag-have": { name: "Having: tá … agam", about: "Irish says something is at you: Tá carr agam (is car at-me: I have a car), Níl am agam (isn't time at-me).", after: ["verb-first", "prepositional-pronouns"] },
    "feelings-on": { name: "Feelings: tá … orm", about: "Hunger, thirst and tiredness are on you: Tá ocras orm (is hunger on-me: I'm hungry), An bhfuil tart ort? (is thirst on-you?).", after: ["verb-first", "prepositional-pronouns"] },
    liking: { name: "Liking: is maith liom", about: "Irish says it's good with you: Is maith liom tae (is good with-me tea: I like tea), Ba mhaith liom… (would-be good with-me: I'd like…).", after: ["ta-is", "prepositional-pronouns"] },
    "ag-ing": { name: "ag: in the middle of", about: "tá with ag and the verb's noun says what's going on: Tá mé ag obair (am I at working: I'm working).", after: ["verb-first"] },
    negation: { name: "Not: níl, ní", about: "níl is isn't (Níl mé ag obair: isn't I at working), and ní comes before other verbs, softening them: Ní thuigim (not I-understand).", after: ["ta-is", "lenition"] },
    question: { name: "Questions", about: "An starts many present and future yes-or-no questions and eclipses the verb (An bhfuil tú…? whether / is / you…?); ar starts past or would questions and usually softens what follows (Ar mhaith leat…? would-be / good / with-you…?); a question word comes first: Cá bhfuil an stáisiún? (where / is / the station?).", after: ["lenition", "eclipsis"] },
    past: { name: "The past", about: "The past often softens the verb or adds d' before a vowel, while common verbs also have special forms: Bhí mé (was / I), Chuaigh mé (went / I), D'ith mé (ate / I).", after: ["verb-first", "lenition"] },
    future: { name: "The future", about: "-fidh and other endings say what will happen: Feicfidh mé thú (will-see I you), Beidh mé (will-be I), Rachaidh muid (will-go we).", after: ["verb-first"] },
  },
};
