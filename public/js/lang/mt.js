// Maltese (lang/index.js has what each field means). Verbs are headworded in the past tense's he form, as Maltese
// dictionaries list them (kiteb, mar); a word joined to the article (il-ktieb, fid-dar) is one word, headworded bare
// (ktieb, dar), and so is a word with a person's ending (ommi under omm, għandi under għand). A headword can end in an
// apostrophe, as Maltese dictionaries write ta', seta' and sema' (lemmaFinalApostrophe).

export default {
  name: "Maltese",
  locale: "mt-MT",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  lemmaFinalApostrophe: true,
  abbreviations: ["eż.", "eċċ.", "nru.", "pġ.", "dr.", "prof.", "art."],
  stray: ["ma", "qed", "se", "hu", "li", "u"],
  patterns: {
    article: { name: "il-: the, joined to the word", about: "il- (the) joins the next word: before ċ, d, n, r, s, t, x, ż or z its l turns into that letter (ix-xemx: the sun), before a vowel it's l- (l-ilma: the water), before għ or h it may drop its i (l-għaġin: the pasta), and after a vowel its i drops (Fejn hi d-dar?: where she the house?).", after: [] },
    gender: { name: "Masculine, feminine and plural", about: "A noun is masculine or feminine, often -a for feminine, and its describing words match it, in the plural too: tifel twil (boy tall), tifla twila (girl tall), tfal twal (children tall).", after: [] },
    "adjective-after": { name: "Describing words after the noun", about: "A describing word usually comes after the noun, and takes the article too when the noun has it: dar kbira (house big), id-dar il-kbira (the house the big).", after: ["article", "gender"] },
    copula: { name: "Is without a word", about: "Maltese often needs no word for is, or uses hu (he) and hi (she), matching the thing described: Il-kafè sħun (the coffee hot), Fejn hi d-dar? (where she the house?).", after: ["gender"] },
    present: { name: "The present: a letter in front, -u or -w in the plural", about: "The present marks who with a letter in front of the verb and, in the plural, -u or -w at its end: nikteb (I write), tikteb (you write), jikteb (he writes), niktbu (we write), naraw (we see).", after: [] },
    past: { name: "The past: endings", about: "The past marks who with endings on the verb: ktibt (I wrote), kiteb (he wrote), kitbet (she wrote), ktibna (we wrote).", after: [] },
    negation: { name: "ma … -x: not", about: "Not wraps the verb, with ma before it (which may shorten to m' before a vowel or a silent għ or h) and -x on its end: Ma nafx (not I-know-not), Ma nikolx laħam (not I-eat-not meat), M'għandix ħin (not-at-me-not time).", after: ["present"] },
    question: { name: "Questions", about: "A yes-or-no question keeps a statement's order (Titkellem bl-Ingliż? you-speak in-the English?), and a question word comes first: Fejn hu s-suq? (where he the market?).", after: [] },
    possessive: { name: "Possession: an ending, tiegħi, or ta'", about: "Close family takes an ending (omm → ommi: my mom, ħu → ħija: my brother); other things take tiegħi (of mine) after them: il-karozza tiegħi (the car of mine); of is ta': il-karozza ta' missieri (the car of my-dad).", after: ["article"] },
    ghandi: { name: "Having: għandi", about: "Maltese says something is at you: Għandi karozza (at-me car: I have a car), M'għandix ħin (not-at-me-not time).", after: [] },
    hemm: { name: "There is: hemm", about: "hemm (there) also says there is or there are: Hemm ħobż? (there bread?), M'hemmx ħalib (not-there-not milk).", after: [] },
    qed: { name: "qed: right now", about: "qed before a present verb says it's going on right now: Qed nikteb (now I-write: I'm writing).", after: ["present"] },
    "se-future": { name: "se: going to", about: "se before a present verb says what's going to happen: Se nikteb (going-to I-write: I'm going to write).", after: ["present"] },
    modal: { name: "Want, can, should + a present verb", about: "After irrid (I want), nista' (I can) and għandi (I should, I have to), the next verb is a present one with its own person, and there's no word for to: Irrid nixrob (I-want I-drink).", after: ["present"] },
    "prep-article": { name: "in-the, with-the: joined little words", about: "A little word for in, with or to joins the article: fid-dar (in-the house), bil-karozza (with-the car: by car), għall-festa (to-the party), and before a vowel fl-ilma (in-the water).", after: ["article"] },
  },
};
