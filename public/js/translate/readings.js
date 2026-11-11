// Language calls on words spelled the same on both sides, as data, so they can be read and judged (translate/engine.js readSides).
// Per language:
//   same         loanwords the language uses every day: one word in both, though its packs have a commoner word for the meaning
//   lead         the word that leads for an English word, where frequency favors a rarer sense (order: bestelling, not orde)
//   two          spelled the same, two words, where the glosses don't show it: { means: what it means in the language, to: the
//                language's word for the English one }
//   firstGuess   what comes first among a word's next guesses: a word, or { lemma, en } to say which of its meanings (or for a
//                word no pack has yet)
//   particles    the words that also stand alone as a separable verb's prefix: one of these typed alone isn't that verb
// The rule for `same`: an English speaker typing it would be understood using the word itself in everyday speech. A word whose
// common English use is something else (a verb, usually: hit, close, set) isn't on it.

export const READINGS = {
  nl: {
    same: [
      "absurd", "account", "alcohol", "alien", "babysitter", "bacon", "brochure", "canvas", "cartoon", "cash", "comfort", "component",
      "console", "consistent", "contrast", "crash", "cult", "dandy", "dart", "deodorant", "design", "designer", "dessert", "detective", "diagram", "dressing", "drone",
      "ecstasy", "fax", "filter", "fit", "focus", "frame", "gate", "grip", "horizon", "huh", "impact", "import", "intact", "item", "job", "joker", "magazine", "maximum", "meeting",
      "minus", "mix", "object", "planner", "pose", "privilege", "prominent", "racist", "racket", "ram", "receptionist", "record", "romance", "sabotage", "score", "service",
      "single", "sinister", "sketch", "sofa", "speech", "spray", "steak", "student", "supporter", "tact", "tattoo", "ticket", "token", "tool", "tractor", "transfer", "transport",
      "tweet", "type", "upgrade", "urgent", "wow",
    ],
    lead: {
      arrangement: "regeling", business: "bedrijf", cake: "taart", check: "controleren", foundation: "stichting", game: "spel", order: "bestelling", party: "feest",
      reserve: "reserveren", rock: "rots", set: "zetten", song: "liedje", sound: "geluid", start: "beginnen", stock: "voorraad", strike: "staking", trip: "reis",
      // Where rank alone would lead with a commoner word that's further from what's meant (4 Nov 2026). Each one's own gloss says it (test-translate).
      at: "bij", by: "door", cause: "veroorzaken", certainly: "zeker", date: "datum", done: "klaar", easily: "makkelijk", edge: "rand", exactly: "precies", finished: "klaar",
      goods: "goed", her: "haar", hope: "hopen", indeed: "inderdaad", last: "laatst", live: "wonen", lost: "kwijt", mom: "mama", myself: "mezelf", only: "alleen", poor: "arm",
      precisely: "precies", seat: "stoel", share: "delen", some: "sommig", spot: "plek", to: "naar", too: "ook", touch: "aanraken", when: "wanneer", which: "welk", wonderful: "geweldig",
    },
    two: {
      file: { means: "traffic jam", to: "bestand" },
      pop: { means: "doll; pop music", to: "knallen" },
    },
    firstGuess: {
      arrangement: ["arrangement"],
      business: ["zaak"],
      cake: ["cake"],
      check: ["controle", "checken"],
      file: ["dossier"],
      fit: ["passen"],
      foundation: ["fundament", "fundering", "basis"],
      game: ["game"],
      order: ["volgorde", "bevel", "orde"],
      party: ["feestje", "party"],
      record: ["opnemen", "plaat"],
      rock: ["steen"],
      set: ["stellen", "set"],
      single: ["enkel", "vrijgezel"],
      song: ["lied", "song"],
      sound: ["klinken"],
      start: ["starten", "start"],
      stem: [{ lemma: "stengel", en: "stem (of a plant)" }],
      stock: ["aandeel"],
      strike: ["staken", "slaan"],
      student: ["leerling"],
      trip: ["trip", "uitstapje"],
      type: ["soort", "typen"],
      was: [{ lemma: "was", en: "laundry" }],
      wow: ["jee"],
    },
    particles: ["aan", "af", "bij", "binnen", "buiten", "door", "in", "langs", "los", "mee", "mis", "na", "neer", "om", "onder", "op", "open", "over", "rond", "samen", "tegen", "terug", "thuis", "toe", "uit", "vast", "voor", "voorbij", "weg"],
  },
};
