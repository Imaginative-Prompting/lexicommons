// Breton, in the unified spelling (peurunvan; lang/index.js has what each field means). A word that changes its first
// sound (zad, vreur, c'hazh) is written as said, under its dictionary form, the radical (tad, breur, kazh); a verb under
// its infinitive (komz, ober, bezañ); docs/languages/mutations-and-cases.md.

export default {
  name: "Breton",
  locale: "br-FR",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["h.a.", "sk.", "niv.", "d.", "dr.", "a.c'h."],
  stray: ["a", "e", "o", "ket", "ne"],
  patterns: {
    article: { name: "the: ar, an, al; a: ur, un, ul", about: "the is an before a vowel or d, h, n and t, al before l, and ar elsewhere (a is un, ul, ur the same way); a feminine singular noun usually softens after it (plac'h, girl, doesn't), and a masculine singular one starting with k takes c'h: ar gegin (the kitchen, from kegin), ar c'hafe (the coffee, from kafe).", after: [] },
    "soft-mutation": { name: "Softening: k → g, t → d, b → v …", about: "After da (your, or to), e (his), ne (not), the particle a, and the article before a feminine singular noun, a first sound often softens: k → g, t → d, p → b, b → v, d → z, m → v: komz → ne gomzan (not I-speak), breur → da vreur (your brother).", after: [] },
    spirant: { name: "After ma, he and o: k → c'h, t → z, p → f", about: "After ma (my), he (her) and o (their), k becomes c'h, t becomes z and p becomes f: tad → ma zad (my father), ti → he zi (her house), kazh → ma c'hazh (my cat).", after: [] },
    possessive: { name: "ma, da, e, he: my, your, his, her", about: "Each one changes the next word its own way, and his and her differ only by that: e di (his house: softened), he zi (her house: t → z), da vreur (your brother).", after: ["soft-mutation", "spirant"] },
    "adjective-after": { name: "Describing words after the noun", about: "Most describing words come after the noun, and soften after a feminine one: un ti bras (a house big), ur plac'h vihan (a girl little, from bihan).", after: ["soft-mutation"] },
    present: { name: "Present endings: -an, -ez …", about: "A present verb's ending says who does it: komzan (I speak), komzez (you speak), komz (he or she speaks); after a subject put first, the verb takes its he-or-she form: Ma zad a gomz brezhoneg (my dad speaks Breton).", after: [] },
    "focus-first": { name: "What matters first, then a or e", about: "Breton puts first what matters most, then the particle a after the subject or object, or e after anything else, then the verb: Kafe a evan (coffee I-drink), Warc'hoazh e labourin (tomorrow I'll-work). After a subject put first, the verb has no person ending: Ma zad a gomz brezhoneg (my dad speaks Breton).", after: ["present"] },
    ober: { name: "Verb + a ran: I do", about: "The everyday present puts the verb first, then a and a form of ober (do) that says who: Komz a ran (speak I-do: I speak), Glav a ra (rain it-does: it's raining).", after: ["focus-first"] },
    bezan: { name: "Being: eo, emañ, on", about: "Use eo after what something is (Bras eo an ti: big is the house), emañ (emaon for I) for where someone or something is and before o for what's going on (Emañ ar c'hazh war an daol: is the cat on the table), and on for I am: Skuizh on (tired I-am).", after: [] },
    kaout: { name: "Having: am eus", about: "am eus is I have, en deus he has, he deus she has, o deus they have; what's had usually comes first: Ur c'harr am eus (a car I-have), Naon am eus (hunger I-have: I'm hungry).", after: ["focus-first"] },
    "ez-eus": { name: "There is: ez eus", about: "ez eus says there is or there are, and n'eus ket a says there isn't any: Ez eus kalz a dud (there is a lot of people), N'eus ket a laezh (not-is not of milk: there's no milk).", after: ["bezan"] },
    negation: { name: "ne … ket: not", about: "Not wraps the verb, with ne before it (n' before a vowel), softening it, and ket after it: Ne gomzan ket galleg (not I-speak not French), N'ouzon ket (not I-know not).", after: ["soft-mutation"] },
    question: { name: "Questions", about: "Ha starts a yes-or-no question (Ha komz a rit saozneg? whether speak you-do English?), and a question word comes first: Pelec'h emañ an ti-bihan? (where is the toilet?).", after: ["focus-first"] },
    progressive: { name: "o: in the middle of", about: "A form of bezañ with o and the verb says what's going on, and o can change the next first sound: Emaon o labourat (I-am at working), Emaomp o c'hortoz ar bus (we-are at waiting the bus, from gortoz).", after: ["bezan"] },
    perfect: { name: "The past: the verb's past form + em eus or on", about: "To say what happened, put the verb's past form first with em eus (Debret em eus: eaten I-have), or on for going and coming (Aet on da Gemper: gone I-am to Quimper); with the object first, it's am eus: Bara am eus prenet (bread I-have bought).", after: ["kaout", "bezan"] },
    future: { name: "The future: -in, -o", about: "The future has its own endings: lennin (I'll read), labourin (I'll work), a rin (I'll do), e vo (it will be): Brav e vo an amzer (fine it-will-be the weather).", after: ["ober"] },
  },
};
