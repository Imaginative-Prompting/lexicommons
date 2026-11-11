// Welsh (lang/index.js has what each field means). A word that changes its first sound (dad, nhad, thad for tad) is
// written as it's said, under its dictionary form, the radical (tad); docs/languages/mutations-and-cases.md.

export default {
  name: "Welsh",
  locale: "cy-GB",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["e.e.", "h.y.", "ayyb.", "etc.", "rhif.", "t.", "tt.", "dr.", "mr.", "mrs."],
  stray: ["yn", "y", "mae", "ddim", "i", "a"],
  patterns: {
    "verb-first": { name: "The verb comes first", about: "A plain Welsh sentence starts with its verb, then who: Mae'r bws yn hwyr (is the bus late).", after: [] },
    "bod-present": { name: "Am, are, is: dw, wyt, mae", about: "A form of bod (be) starts most present sentences: dw i (am I), rwyt ti (are you), mae e, o or hi (is he, she, it), while a question uses a form such as Wyt ti…? (are you…?).", after: ["verb-first"] },
    "yn-linker": { name: "yn: the link after bod", about: "After bod, yn (just 'n after a vowel) joins the action or description: Dw i'n byw (am I living), Mae hi'n oer (is it cold); after wedi there's no yn.", after: ["bod-present"] },
    article: { name: "the: y, yr, 'r", about: "the is y before other consonants, yr before a vowel or h, and 'r after a vowel: y bwrdd (the table), yr oergell (the fridge), Mae'r bws (is the bus).", after: [] },
    "adjective-after": { name: "Describing words after the noun", about: "Most describing words come after the noun: tŷ bach (house small), gwin coch (wine red).", after: [] },
    "soft-mutation": { name: "Soft mutation: c to g, b to f…", about: "Many words soften their first sound after certain words: dy (your), i (to), o (from), a feminine singular noun after y, the thing after gen i: tad → dy dad (your dad), cegin → y gegin (the kitchen).", after: [] },
    "nasal-mutation": { name: "Nasal mutation after fy and yn", about: "After fy (my) and yn (in), t, c, p, d, g and b become nh, ngh, mh, n, ng and m: tad → fy nhad (my dad), Caerdydd → yng Nghaerdydd (in Cardiff).", after: ["soft-mutation"] },
    "aspirate-mutation": { name: "Aspirate mutation after ei (her) and a (and)", about: "After ei meaning her, and after a (and), t, c and p become th, ch and ph: ei thad hi (her father), coffi a the (coffee and tea); ei with a soft mutation means his: ei dad e.", after: ["soft-mutation"] },
    negation: { name: "ddim: not", about: "ddim (not) goes after who: Dw i ddim yn gwybod (am I not knowing); there isn't is does dim: Does dim llaeth (isn't any milk).", after: ["bod-present"] },
    question: { name: "Questions", about: "A yes-or-no question starts with bod's question form (Wyt ti'n siarad Cymraeg? are you speaking Welsh?); a question word comes first: Ble mae'r orsaf? (where is the station?).", after: ["bod-present"] },
    eisiau: { name: "eisiau: want, with no yn", about: "eisiau (want) follows bod with no yn; when the same person wants and acts, the action follows eisiau with no i: Dw i eisiau coffi (am I wanting coffee), Wyt ti eisiau dod? (are you wanting come?).", after: ["bod-present"] },
    wedi: { name: "wedi: have done", about: "wedi (after) in place of yn says it has happened: Dw i wedi bwyta (am I after eating: I've eaten).", after: ["yn-linker"] },
    "mynd-i": { name: "mynd i: going to", about: "Dw i'n mynd i (am I going to) + a softened action says what's going to happen: Dw i'n mynd i ddal y trên (am I going to catch the train).", after: ["yn-linker", "soft-mutation"] },
    have: { name: "Having: mae gen i", about: "Welsh says something is with you: Mae gen i gar (is with me car: I have a car), and the thing softens after gen i; does gen i ddim is I don't have.", after: ["bod-present", "soft-mutation"] },
    past: { name: "The past", about: "es i (went I), ces i (had I) and other short forms say what happened, and roedd says what was: Es i adref (went I home), Roedd hi'n braf (was it fine).", after: ["verb-first"] },
    future: { name: "The future: bydd", about: "bydd (will be) and its forms say what will be: Bydda i adref (will-be I home), Bydd hi'n bwrw glaw (will-be it raining).", after: ["bod-present"] },
  },
};
