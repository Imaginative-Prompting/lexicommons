# Weaving a text into Dutch

A weave puts Dutch into a text of theirs at their level: the words they've learned show in Dutch in the English sentence, and a sentence they know nearly all of shows in Dutch whole. You write the weave, sentence by sentence, by the rules the books pipeline holds its own woven books to; it's checked here before it reaches them.

## Where a weave comes from
A weave starts with the person, in Read: on a text of theirs (one they pasted or uploaded, or one you added with add_text) in a language other than the one they learn, the reader offers "Weave it with your AI" at the text's end the first time, and after that in its Contents ("Weave it into Dutch", with a Weave it button). Their press sends you a weave request with the text. So to weave a text of your own: add it with add_text, then ask them to open it in Read and press Weave it with your AI.

## Which languages
Weaving goes into Dutch only, for now: the one language whose woven books the books pipeline's judges have accepted. More come as theirs are. The rules are written for a text in English, a language they know; the weave is checked the same way whatever the text's language.

## The steps
1. list_requests (or wait_for_request): a request of kind weave, with its title and language.
2. take_request with its request_id: it's yours now, and the app shows you're on it. Keep the seat it gives: add_weave needs it, and take_request with it gives the request back to you later.
3. get_weave_guide with language, the request's ("nl"): you're reading it. Read it once for each language you weave into; the rules at its end are the books pipeline's.
4. get_text with the request_id: its title, language, and to_weave: every sentence's words, numbered as the rules number them ([0] is a sentence's first word).
5. Weave every sentence by the rules into the form below.
6. add_weave with the request_id, your seat and the weave. A long text's weave (past about 1 MB) goes up as a file instead: request_text_upload with format weave (8 MB at most), send it with the curl command it gives, then add_weave with upload_id in place of weave.
7. It's checked at once, as the pipeline's judges check a layer: every sentence and word, then the two mixes they count (a verb's form split from the rest of it, an object pronoun shown alone). Every problem comes back at once, nothing is kept: fix them all and send it again with the same seat.
8. Once it passes, it's on its way to each of their devices and the request is finished: the app's AI section shows it done, a notification comes if they allow them, and in Read the text's Contents says "Woven into Dutch". Tell them what to expect: the text reads in English at first, and Dutch comes into it as they learn its words (a sentence they know nearly all of shows in Dutch whole). get_text with the text_id it gives says where it arrived.
9. If you can't weave it, finish_request with couldnt and why: they see it, and can ask again.

## The weave you send
{ "sentences": [ one entry per sentence of the text ] }, each:
- x: the sentence's number (get_text's to_weave).
- t: one { "w", "target", "lemma" } for each word of the sentence, in order. w: the word exactly as get_text gives it. target: how it shows woven into the English sentence, keeping the word's own punctuation ("end!" → "einde!"). lemma: the dictionary form of the language they learn, the word-bank key, or null for a word to learn nothing from (a name, a number, punctuation).
- text: the natural sentence in the language they learn.
- m: the literal line: one { "target", "cue", "sources", "lemma" } for each word of text, in text's order. target: that word of text (joined with single spaces, the targets are text exactly). cue: the English words it carries. sources: their numbers ([k]). lemma: that Dutch word's own dictionary form (zal is zullen), even inside a verb group, where t gives every word of the group the verb's lemma; or null. (A lemma's curly apostrophe is made straight here: zo’n is zo'n.)
- u: idiom upgrades, { "k", "len", "target" }: the run of len words from [k] shown as target once every word in it with a lemma is known. Its target keeps the punctuation at the run's edges, as a t target does ("by this time?”" → "inmiddels?”"). Often none.
- c: the ids of the patterns this sentence shows (the rules' list, at the end). Often none.
The rules below say how to choose each one. Nothing else goes in: where each sentence sits in the text and its hash are worked out here.

## A worked example
The start of a paragraph of Alice's Adventures in Wonderland, pasted by the person. get_text gives its sentences as:
[
  { "x": 0, "words": ["Down,", "down,", "down."] },
  { "x": 1, "words": ["Would", "the", "fall", "never", "come", "to", "an", "end!"] },
  { "x": 2, "words": ["“I", "wonder", "how", "many", "miles", "I’ve", "fallen", "by", "this", "time?”", "she", "said", "aloud."] }
]
Its weave into Dutch, as add_weave takes it (Lexicommons' own woven Alice, which the pipeline's judges passed):
{
  "sentences": [
    {
      "x": 0,
      "t": [
        { "w": "Down,", "target": "Omlaag,", "lemma": "omlaag" },
        { "w": "down,", "target": "omlaag,", "lemma": "omlaag" },
        { "w": "down.", "target": "omlaag.", "lemma": "omlaag" }
      ],
      "text": "Omlaag, omlaag, omlaag.",
      "m": [
        { "target": "Omlaag,", "cue": "Down", "sources": [0], "lemma": "omlaag" },
        { "target": "omlaag,", "cue": "down", "sources": [1], "lemma": "omlaag" },
        { "target": "omlaag.", "cue": "down", "sources": [2], "lemma": "omlaag" }
      ],
      "u": [],
      "c": []
    },
    {
      "x": 1,
      "t": [
        { "w": "Would", "target": "Zou", "lemma": "zullen" },
        { "w": "the", "target": "de", "lemma": "de" },
        { "w": "fall", "target": "val", "lemma": "val" },
        { "w": "never", "target": "nooit", "lemma": "nooit" },
        { "w": "come", "target": "komen", "lemma": "komen" },
        { "w": "to", "target": "tot", "lemma": "tot" },
        { "w": "an", "target": "een", "lemma": "een" },
        { "w": "end!", "target": "einde!", "lemma": "einde" }
      ],
      "text": "Zou de val nooit tot een einde komen!",
      "m": [
        { "target": "Zou", "cue": "Would", "sources": [0], "lemma": "zullen" },
        { "target": "de", "cue": "the", "sources": [1], "lemma": "de" },
        { "target": "val", "cue": "fall", "sources": [2], "lemma": "val" },
        { "target": "nooit", "cue": "never", "sources": [3], "lemma": "nooit" },
        { "target": "tot", "cue": "to", "sources": [5], "lemma": "tot" },
        { "target": "een", "cue": "an", "sources": [6], "lemma": "een" },
        { "target": "einde", "cue": "end", "sources": [7], "lemma": "einde" },
        { "target": "komen!", "cue": "come", "sources": [4], "lemma": "komen" }
      ],
      "u": [],
      "c": ["modal", "question"]
    },
    {
      "x": 2,
      "t": [
        { "w": "“I", "target": "“Ik", "lemma": "ik" },
        { "w": "wonder", "target": "vraag me af", "lemma": "afvragen" },
        { "w": "how", "target": "hoe", "lemma": "hoe" },
        { "w": "many", "target": "veel", "lemma": "veel" },
        { "w": "miles", "target": "mijl", "lemma": "mijl" },
        { "w": "I’ve", "target": "ik ben", "lemma": "zijn" },
        { "w": "fallen", "target": "gevallen", "lemma": "vallen" },
        { "w": "by", "target": "tegen", "lemma": "tegen" },
        { "w": "this", "target": "deze", "lemma": "deze" },
        { "w": "time?”", "target": "tijd?”", "lemma": "tijd" },
        { "w": "she", "target": "ze", "lemma": "zij" },
        { "w": "said", "target": "zei", "lemma": "zeggen" },
        { "w": "aloud.", "target": "hardop.", "lemma": "hardop" }
      ],
      "text": "“Ik vraag me af hoeveel mijl ik inmiddels gevallen ben?” zei ze hardop.",
      "m": [
        { "target": "“Ik", "cue": "I", "sources": [0], "lemma": "ik" },
        { "target": "vraag", "cue": "wonder", "sources": [1], "lemma": "afvragen" },
        { "target": "me", "cue": "myself", "sources": [1], "lemma": "me" },
        { "target": "af", "cue": "off", "sources": [1], "lemma": "afvragen" },
        { "target": "hoeveel", "cue": "how many", "sources": [2, 3], "lemma": "hoeveel" },
        { "target": "mijl", "cue": "miles", "sources": [4], "lemma": "mijl" },
        { "target": "ik", "cue": "I", "sources": [5], "lemma": "ik" },
        { "target": "inmiddels", "cue": "by this time", "sources": [7, 8, 9], "lemma": "inmiddels" },
        { "target": "gevallen", "cue": "fallen", "sources": [6], "lemma": "vallen" },
        { "target": "ben?”", "cue": "am", "sources": [5], "lemma": "zijn" },
        { "target": "zei", "cue": "said", "sources": [11], "lemma": "zeggen" },
        { "target": "ze", "cue": "she", "sources": [10], "lemma": "zij" },
        { "target": "hardop.", "cue": "aloud", "sources": [12], "lemma": "hardop" }
      ],
      "u": [{ "k": 2, "len": 2, "target": "hoeveel" }, { "k": 7, "len": 3, "target": "inmiddels?”" }],
      "c": ["v2", "perfect", "separable"]
    }
  ]
}
What they read:
- Knowing omlaag, zullen, de, val, nooit, komen: Omlaag, omlaag, omlaag. Zou de val nooit komen to an end! “I wonder how many miles I’ve fallen by this time?” she said aloud.
- Knowing omlaag, zullen, de, val, nooit, komen, tot, een, einde, ik, afvragen, hoe, veel: Omlaag, omlaag, omlaag. Zou de val nooit tot een einde komen! “Ik vraag me af hoeveel miles I’ve fallen by this time?” she said aloud.
- Knowing every word: Omlaag, omlaag, omlaag. Zou de val nooit tot een einde komen! “Ik vraag me af hoeveel mijl ik inmiddels gevallen ben?” zei ze hardop.
Note what the rules ask for: "wonder" is the separable "vraag me af" (one lemma, afvragen, for all three words in m, and "me" its own), "how many" is one word of text (hoeveel, sources [2, 3]) with an idiom upgrade over the two, "by this time" is "inmiddels", and sentence 1 is tagged question: Carroll's "!" closes a question in form, verb first.

## Two more sentences
Each a text of its own, woven the same way:
### I shall never get to twenty at that rate!
A verb group: shall, never and get take the verb's lemma (komen) in t, with one idiom upgrade over the three (zal nooit komen); never joins the group because it's inside the run. In m each Dutch word has its own dictionary form: zal is zullen, nooit is nooit.
{
  "sentences": [
    {
      "x": 0,
      "t": [
        { "w": "I", "target": "Ik", "lemma": "ik" },
        { "w": "shall", "target": "zal", "lemma": "komen" },
        { "w": "never", "target": "nooit", "lemma": "komen" },
        { "w": "get", "target": "komen", "lemma": "komen" },
        { "w": "to", "target": "bij", "lemma": "bij" },
        { "w": "twenty", "target": "twintig", "lemma": "twintig" },
        { "w": "at", "target": "in", "lemma": "in" },
        { "w": "that", "target": "dat", "lemma": "dat" },
        { "w": "rate!", "target": "tempo!", "lemma": "tempo" }
      ],
      "text": "In dat tempo zal ik nooit bij twintig komen!",
      "m": [
        { "target": "In", "cue": "at", "sources": [6], "lemma": "in" },
        { "target": "dat", "cue": "that", "sources": [7], "lemma": "dat" },
        { "target": "tempo", "cue": "rate", "sources": [8], "lemma": "tempo" },
        { "target": "zal", "cue": "shall", "sources": [1], "lemma": "zullen" },
        { "target": "ik", "cue": "I", "sources": [0], "lemma": "ik" },
        { "target": "nooit", "cue": "never", "sources": [2], "lemma": "nooit" },
        { "target": "bij", "cue": "to", "sources": [4], "lemma": "bij" },
        { "target": "twintig", "cue": "twenty", "sources": [5], "lemma": "twintig" },
        { "target": "komen!", "cue": "get", "sources": [3], "lemma": "komen" }
      ],
      "u": [{ "k": 1, "len": 3, "target": "zal nooit komen" }],
      "c": ["v2", "future", "demonstrative", "modal"]
    }
  ]
}

### We have already eaten the cake.
A perfect with an adverb inside: already stands between have and eaten, so the group ends before it (only not and never join one). have is its own word with its own lemma (hebben), already is al, eaten is gegeten (lemma eten), and there's no idiom upgrade.
{
  "sentences": [
    {
      "x": 0,
      "t": [
        { "w": "We", "target": "We", "lemma": "wij" },
        { "w": "have", "target": "hebben", "lemma": "hebben" },
        { "w": "already", "target": "al", "lemma": "al" },
        { "w": "eaten", "target": "gegeten", "lemma": "eten" },
        { "w": "the", "target": "de", "lemma": "de" },
        { "w": "cake.", "target": "taart.", "lemma": "taart" }
      ],
      "text": "We hebben de taart al gegeten.",
      "m": [
        { "target": "We", "cue": "We", "sources": [0], "lemma": "wij" },
        { "target": "hebben", "cue": "have", "sources": [1], "lemma": "hebben" },
        { "target": "de", "cue": "the", "sources": [4], "lemma": "de" },
        { "target": "taart", "cue": "cake", "sources": [5], "lemma": "taart" },
        { "target": "al", "cue": "already", "sources": [2], "lemma": "al" },
        { "target": "gegeten.", "cue": "eaten", "sources": [3], "lemma": "eten" }
      ],
      "u": [],
      "c": ["perfect"]
    }
  ]
}

## When it's refused
Each problem says which sentence and word. What each one says (… is the part that changes), and what to do:
- Every sentence needs its entry: One entry for every sentence get_text lists, each with its x.
- is given twice: Each sentence once.
- x must be the sentence's number: x is the sentence's number from get_text (0 is the first).
- t must hold one { w, target, lemma } for each of its … words: One t entry for every word of the sentence, punctuation-only words included, in order.
- t entry … is for "…", but word […] is "…": Each t entry's w is that word exactly as get_text gives it: you've skipped or added a word.
- must be { w, target, lemma }: w and target are text; lemma is text or null.
- must be { target, cue, sources, lemma }: target and cue are text, sources a list of word numbers, lemma text or null.
- must keep the word's punctuation: A target keeps the word's own punctuation around it: “I → “Ik, end! → einde!
- is only punctuation: it keeps its text exactly: A word that's only punctuation (a dash) is its own target, with lemma null.
- m's targets, joined by " ", must be exactly text: m's targets, joined with single spaces, must be text exactly, every word and mark.
- sources must list distinct word indices: sources are the [k] numbers (from 0) of the words that m entry carries, each once.
- must be a lowercase dictionary form: letters: A lemma is the lowercase dictionary form, letters only (the infinitive, the singular), or null.
- c must list distinct pattern ids: c takes ids from patterns (below), each once; leave it empty when none fits.
- it must cover at least one word with a lemma: An idiom upgrade covers words with lemmas: it shows once they're all known.
- it covers at least two words: An idiom upgrade covers two words or more (len ≥ 2) inside the sentence.
- a verb's form split from the rest of it: Gloss the words of one verb form (had … gone) as the rules' groups say: one lemma, the verb's, and an idiom upgrade over them.
- an object pronoun shown alone: An object pronoun of a verb (hem, haar, het, ze, me…) goes in its verb's group: the verb's lemma on both, and an idiom upgrade over the run. A possessive (her coat → haar jas) is a word of its own with its own lemma (haar), and is never refused for this.
- Weaving into … isn't ready yet: Only the languages listed can be woven into.
- That request's text isn't here any more: The request finished or was canceled (its text goes with it): look at list_requests.

## Limits
- A weave inline in add_weave up to about 1 MB; past that, upload it (format weave, 8 MB).
- The text itself came from the app (8 MB at most as a book): every sentence of it is woven, none left out.

## What they see
- The text in Read, its Contents saying "Woven into Dutch", and woven: the words they know show in the language they learn, in the English sentence, as they learn them; once they know 95% of a sentence's words (the reader's default; a setting there changes it), the whole sentence shows in natural Dutch: its text.
- A weave isn't undone: it stays with the text on their devices.

## The rules
The books pipeline's, as of 2026-11-07T16:31: the same ones its judges hold its own woven books to. Their list of patterns (c) is the language's grammar as it is now.

You are making the Dutch layer of a language-learning edition of an English book.

How it's read: the learner reads the English. Each English word whose Dutch they've learned shows in Dutch, in its place,
and the sentence keeps English word order; partly learned sentences are a mix. Once they know enough of a sentence, the
whole sentence shows in natural Dutch, with the literal line under it: the Dutch order, in English words. So every word's
Dutch has to be true on its own, in English order, and the natural sentence and the literal line have to agree with it.

Dutch: Standard Netherlands Dutch (Nederlands-Nederlands): natural and current, never Flemish idiom, never archaic or textbook-stilted forms.
Register: je/jij between familiars and equals, u where the English is deferential or formal; follow the English tone and keep each speaker consistent.

NAMES: a person's or a place's name in the English stays exactly as written (target = the word itself, lemma null).

For each sentence below (its words are numbered [k]), produce all of these in one go, so they agree:

t: one entry per English word, in order, for every word: never merge two words, never leave one out.
- w: the English word exactly as given.
- target: the Dutch for that one word as it's used here, inflected (tense, number and agreement; de or het by the Dutch noun an article or adjective goes with), with the word's own punctuation kept
  exactly before and after it (quotes, brackets, commas, dashes, full stops) and nothing added. An abbreviation's own full stop (Mr., Mrs., Ms.) is part of the abbreviation, not punctuation: its Dutch is written as
  it's written there, with a full stop only where its own spelling has one or where the word also ends the sentence.
- lemma: the dictionary form of target, lowercase: the infinitive for a verb (schreef → schrijven), the singular for a noun (kinderen → kind), the uninflected adjective (grote → groot), the subject form for a personal pronoun (hem → hij, me → ik, je → jij) — except a possessive (haar, zijn, mijn) or a reflexive (zich, zichzelf) is its own lemma; de, het and een are each their own lemma. It's the learner's word-bank key: once they know it, this word
  shows as target. null only for a name that stays, a word that's only punctuation or a numeral in digits, or an
  English word Dutch doesn't express at all (nothing in the natural sentence carries it); a null-lemma word keeps its
  English text as target. A word Dutch says inside another word's form is never null: it's in that word's group (GROUPS
  below). A number written in letters is a word to learn like any other.
- Word order never makes a word unglossable: the text keeps English order, so a phrase Dutch would reorder still
  glosses word by word, each word getting the Dutch it contributes. Pick each word's Dutch so the phrase is faithful when
  read in English order. A gloss can look odd before the whole sentence is known (an article agreeing with a noun
  that's still in English is right); it must never be false.
- Sense: the meaning this context demands, not the most common one. A learner who knows only this lemma learns what
  this English word means from it.
- A separable verb's particle glosses on the English particle and its verb on the English verb, and both take the whole verb as their lemma ('switch off': switch → zetten, off → uit, both under uitzetten), so the particle is learned as part of its verb.
- A contraction glosses as both words with one lemma, its verb's: 'we’ll' → we zullen (lemma zullen), 'we’d' → we zouden (lemma zullen).
- Dutch doesn't use English do-support: the 'did' of 'did you swim' or 'did not swim' joins its verb's group (one lemma, the verb's, and an idiom upgrade over the run), so it never stays English beside a form that already says it.
- An object or reflexive pronoun of a verb (hem, haar, het, ze, zich, me, ons, hen, hun) is in that verb's group: it takes the verb's lemma and the group's idiom upgrade puts it where Dutch does, so it never shows beside an English verb. A possessive (haar boek) and a pronoun after a preposition (naar haar, met hem) are words of their own.
- English -ing forms gloss as whatever Dutch uses for that meaning here (an infinitive, a te-infinitive, aan het + infinitive, a participle), never a calque.
- Existential there (saying something exists) is er; there as a place is daar.
- A pronoun for a thing (it, its) agrees with the Dutch noun it stands for: hem or zijn for a de-word, het or zijn for a het-word.
- After a preposition, it for a thing is er (Dutch joins them: erin, erover, ernaar), so that it glosses as er, never het or hem; for a person it stays hem or haar.
- An English expression Dutch says as a whole doesn't hand its whole meaning to one of its words: each English word glosses as what it means on its own (or stays English, lemma null), and the whole goes on an idiom (u) over its run. 'Kick the bucket': kick → schoppen, never kick → doodgaan.
- A verb that is reflexive in this sense keeps its reflexive pronoun, matched to the subject, in its gloss and in text (zich voelen, zich herinneren, zich haasten, zich vergissen, zich voorstellen); the lemma stays the verb: 'we hurried' → hurried → haastten ons (haasten).
- A lemma is one dictionary headword, never a phrase: not 'nog een', 'om te' or 'gaan zitten'. Words written apart are lemmas apart ('stand up straight' → rechtop (rechtop) + staan (staan)), and a one-word conjunction or adverb (alsof, zolang, tenminste) is never split as if it were separable.
- A contraction glosses as both its words under the auxiliary's lemma, and the verb after it then fits that auxiliary: 'they’re running' → ze zijn (zijn) aan het rennen (rennen); 'she’ll stay' → ze zal (zullen) blijven (blijven).
- An -ing participle that says how or while something happens ('he waved, smiling') glosses as the Dutch present participle (smiling → glimlachend, lemma glimlachen), never as a finite past. English 'was …ing' is aan het + infinitive, or the finite form in one group with 'was' (one lemma, the verb's, and an idiom upgrade over 'was …ing' showing the finite form), so 'was' never stays English beside it; never two finite verbs, never zijn + -end.
- The natural sentence is the Dutch a Dutch writer would use, never English phrasing copied word for word: rephrase into the normal Dutch idiom ('it made sense' → het was logisch, never het maakte zin).
- Current Netherlands Dutch only: no archaic address, relatives or words (uw edelheid, wier, in welke, believen); a prepositional relative is waarin, waarvan, waarop.
- The lemma is the base form: an adjective's positive (beste → goed, meer → veel, liever → graag), a participle's infinitive (gebroken → breken). A diminutive Dutch uses as a word of its own is its own lemma (meisje, plaatje, koekje, kopje); any other diminutive's lemma is its noun (huisje → huis).
- After om, and after a verb that takes te + infinitive (proberen, vergeten, beginnen), te is in the gloss and in text: 'to buy milk' → om melk te kopen; with a separable verb te goes between particle and stem (op te bellen).
- A verb that takes a fixed preposition in this sense keeps it, in its gloss and in text: doorgaan met, ophouden met, denken aan, wachten op.
- Where Dutch needs no article (after alle or beide; per uur), the English article keeps its English with lemma null: 'all the cups' → alle kopjes, the → the (null).
- alsof, omdat and nadat open a finite clause with a subject and a conjugated verb; before a bare infinitive use na or om: 'after reading' → na het lezen, never nadat lezen.
- English 's is van + the noun with its article, or a possessive pronoun, never a bare noun: 'the baker’s cart' → de kar van de bakker.
- A person is never er: after a preposition, a person stays hem or haar (met hem), and it for a thing agrees with its Dutch noun (de-woord: hij, hem, die; het-woord: het, dat).
- GROUPS: a partly known sentence must never show a Dutch form beside an English word that form already says, nor a
  Dutch pronoun beside an English verb. So a verb is glossed as one group with: its auxiliaries and modals, an infinitive
  'to', and an empty 'there' or 'it' that its Dutch form carries ('will paint', 'had sold', 'did not swim', 'there
  stood'); a 'not' or 'never' inside that run; and a pronoun that is the verb's own object or reflexive, which Dutch
  places by the verb or joins to it. Never a pronoun after a preposition (at her, to him): that preposition and its
  pronoun are words of their own, glossed as themselves. Every word of the group takes the lemma of its Dutch verb, and the group gets an idiom upgrade (u): k its
  first word, len to its last, target the run in natural Dutch order and form. A word between joins the group (its
  lemma too) only where Dutch says it inside the run itself, as a subject pronoun after an inverted verb ('did you
  skate'), or is a name that stays; never a prepositional phrase, a noun, an adjective or an adverb of its own: where one of those stands between,
  the group ends before it, and the words after it are glossed as themselves. Each word's target is the Dutch that carries it in that rendering (a
  word the verb's form carries repeats that form). So the group shows all at once in Dutch, or stays all in English.
  Two things are never one group. A contraction of a subject and an auxiliary (I'll, you'd, we've, she's) glosses as
  both its words under the auxiliary's own lemma, and the verb after it heads its own group. And a second verb that
  isn't an auxiliary or a modal (want, try, hope, seem, start, keep on) heads its own group: 'hoped to whistle' is two
  groups, hoped and to whistle, each under its own verb's lemma; never one lemma for two verbs, and never a lemma made
  up for them together.
  This wins over any note above that leaves such a word in English with lemma null.

text: the whole sentence in natural Dutch: free word order, fluent, complete, with the English sentence's opening and
closing punctuation (quotes, brackets, dashes) kept. Headings are translated as headings. Only here does Dutch order
happen.

m: the literal line. text split at its spaces, one entry per Dutch word, in order, covering text exactly.
- target: that word of text, with its punctuation exactly as in text.
- cue: the English it carries here, short (1–3 words), so reading the cues in order gives the sentence in Dutch order
  in English words.
- sources: the [k] of the English words it carries. Several when one Dutch word carries several English words; the same
  [k] on several Dutch words when one English word becomes several; empty only for a Dutch word that carries no English
  word at all (its cue is then the closest English).
- lemma: target's dictionary form, as in t (null for names, punctuation and numbers).

u: idiom upgrades: one for every GROUP (above), and otherwise usually none. Where a run of two or more words has a
natural Dutch rendering different from its word-by-word glosses, add { k: its first word, len: how many words, target:
the natural rendering, keeping the run's punctuation }. It shows only once every word in the run is known, so it
never holds a word back. Never use it instead of glossing each word.

c: the ids of the patterns from this list that this sentence's text shows (often none):
  v2: Verb second. In a main clause the verb comes second. Start with a time word, and the subject moves after the verb.
  perfect: Perfect tense: verb last. With hebben or zijn, the past participle goes to the end.
  dat: dat: verb to the end. After dat (that), the verb goes to the end of its clause.
  separable: Separable verbs. Verbs like opbellen split: the verb comes second and the little word (op) goes to the end.
  modal: Modal + infinitive last. With willen, kunnen or moeten, the second verb goes to the end.
  niet: Where niet goes. niet usually comes after the object, near the end.
  omte: om … te. In order to: om, then the object, then te and the verb at the end.
  question: Questions: verb first. In a question the verb comes before the subject (after a question word, if there is one).
  present: Present tense: ik werk, jij werkt, wij werken. Most verbs use the ik form plus -t with jij/u/hij/zij/het (unless it ends in t), and the -en form with wij/jullie/zij; when jij follows the verb, use the ik form: ik werk (I work), werk jij? (work you?).
  de-het: de or het: two words for the. Learn each noun with de or het, both meaning the. Plurals use de: het huis (the house), de huizen (the houses).
  plural: Plurals with -en and -s. Most nouns add -en or -s for the plural, sometimes with spelling changes before -en: huis → huizen (house → houses), boom → bomen (tree → trees).
  geen: geen: no, not any. Use geen for no, not a or not any, replacing een or going before a noun used without words like de, het or mijn: Ik heb geen auto (I have no car), we hebben geen tijd (we have no time).
  er-is: er is and er zijn: there is and there are. Use er is (there is) with a noun that is not plural, and er zijn (there are) with a plural: Er is koffie (there is coffee), er zijn stoelen (there are chairs).
  adjective: Adjectives with and without -e. Before a noun, an adjective usually adds -e, except with a het noun after een, geen or no word. When it describes the subject after zijn, it usually has no -e: een groot huis (a big house), het huis is groot (the house is big).
  diminutive: -je and -tje: small or friendly. Use -je, -tje, -pje, -etje or -kje to make a noun sound small or friendly. The ending depends on the noun; use het unless the noun is plural: het huisje (the little house), het boompje (the little tree).
  past: Past tense: werkte, woonde, ging. For many verbs, add -te or -de to the ik form for the past, with another -n for wij/jullie/zij. Other verbs change more: Ik werkte hier (I worked here), wij gingen weg (we went away).
  omdat: omdat, als and more: verb last. After words such as omdat (because), als (if/when), wanneer (when), toen (when in the past), terwijl (while), voordat (before) and of (whether), put the verb at the end of that part of the sentence: Ik blijf thuis omdat ik moe ben (I stay home because I tired am).
  relative: die and dat: who, which, that. To add who, which or that after a noun, use die with nouns that take de and dat with nouns that take het; put the verb last in that part of the sentence: de man die hier woont (the man who here lives), het boek dat ik lees (the book that I read).
  imperative: Commands: kom hier. Commands usually use the ik form without ik: Kom hier (come here), doe de deur dicht (do the door shut).
  reflexive: Verbs with me, je, zich and ons. Some verbs, including those for hurrying and remembering, need me with ik, je with jij/jullie, zich with hij/zij/het/u or plural zij, and ons with wij: Ik verveel me (I bore myself), ik herinner me dat (I remember myself that).
  comparative: Comparisons: -er, meer, het -st, het meest. Usually add -er for more; with zijn and no following noun, use het …-st for most. Some words use meer/het meest, dan means than, and a few change form: goed → beter → best (good → better → best), dit is groter dan dat (this is bigger than that).
  future: gaan and zullen: talking about the future. With another verb at the end, gaan can express a plan and zullen a promise or prediction: Ik ga morgen koken (I go tomorrow cook), ik zal je helpen (I will you help).
  object: me, je, hem: object words. Object words include me/mij, je/jou, hem, haar, het, ons, jullie and ze. In a sentence starting with the subject, they usually follow the first verb: Ik zie hem (I see him), ik geef ze geld (I give them money).
  possessive: mijn, jouw, ons: words for belonging. Use mijn (my), jouw/je (your), zijn (his/its), haar (her), ons/onze (our), jullie (your, plural), hun (their) and uw (your, polite). Use ons with a noun that takes het, and onze with de or plurals: ons huis (our house), onze fietsen (our bikes).
  aan-het: zijn + aan het: happening right now. To say what is happening right now, use a form of zijn + aan het + the full verb: Ik ben aan het koken (I am at the cooking), ze zijn aan het eten (they are at the eating).
  time-place: Time, then how, then where. When time, how and place appear together, the usual order is time, how, place; English often puts time last: Ik ga morgen met de trein naar Utrecht (I go tomorrow with the train to Utrecht).
  zijn-hebben: zijn and hebben: ik ben, ik heb. The two most used verbs have their own forms: ik ben, jij bent, hij is, wij zijn; ik heb, jij hebt, hij heeft, wij hebben (u bent; u hebt or u heeft): Ik ben moe (I am tired), ze heeft een auto (she has a car).
  demonstrative: deze, die, dit, dat: this and that. Use deze (this/these) and die (that/those) with nouns that take de or are plural, and dit (this) and dat (that) with nouns that take het: dit huis (this house), die boeken (those books).
  want: want: because, with the usual order. To join sentences that have the verb second, use en (and), maar (but) or want (because). Each part keeps that order: Ik blijf thuis, want ik ben moe (I stay home, because I am tired).
  question-word: Waar, wat, hoe: questions with a question word. Start with the question word or question phrase, then put the verb before the subject: Waar woon je? [Where do you live?]
  particles: Even, toch, nou, maar, wel: little words for tone. Little words can make a request softer or show what you expect or feel: Kun je even helpen? [Can you just help?]
  pronoun-forms: Jij or je: pronouns with and without stress. Use short forms when the person is not the focus and full forms to stress or contrast people: Drink jij koffie? [Do YOU drink coffee?]
  te-infinitive: Te + verb: probeer te slapen. Some verbs and adjectives take te before the full verb, without om: Ik probeer te slapen. [I'm trying to sleep.]
  verb-preposition: Wachten op, denken aan: verbs with prepositions. Learn common verbs together with the preposition used for their meaning: Ik wacht op de bus. [I'm waiting for the bus.]
  er-preposition: Erop, eraan, ermee: it with a preposition. When a preposition refers to a thing or situation, Dutch often combines it with er instead of het. The parts can split: Ik denk er vaak aan. [I often think about it.]
  clause-first: A clause first: the main verb comes next. A whole opening clause counts as the first part of the main sentence, so the main verb follows it: Als het regent, blijf ik thuis. [If it rains, I stay home.]
  modal-perfect: Perfect with two full verbs: heb kunnen vinden. In the perfect tense, kunnen, moeten, willen, mogen, zien, horen and laten use their full form when followed by another verb: Ik heb het niet kunnen vinden (I couldn't find it). Both full verbs go together at the end.
  indirect-question: Questions inside sentences: of, waar, hoe. A question inside a sentence starts with of (whether) or a question word, and its verb goes to the end: Ik weet niet of hij komt (I don't know whether he's coming).
  position-te: Zitten te, staan te: busy doing something. Use zitten, staan, liggen or lopen with te and a full verb to describe an activity, often showing someone's position: Ik zit te lezen (I'm sitting reading).
  er-quantity: Er with numbers: ik heb er twee. Use er with a number or an amount word when you leave out a noun that is already understood: Ik heb er twee (I have two of them).
  passive: Worden and zijn: what happens to something. Use worden with a past participle to say what is done to someone or something, and door to name who does it: De brief wordt door mijn moeder geschreven (The letter is being written by my mother). Use is or zijn with the participle to describe a completed action or its result.
  past-perfect: Had and was: what had already happened. Use had or was with a past participle to describe something that happened before another past moment: Ik had al gegeten toen hij kwam (I had already eaten when he arrived).
  conditional: Zou and zouden: would and polite requests. Use zou or zouden with a full verb at the end to say what would happen or to make a polite request: Zou je me kunnen helpen? (Could you help me?).
  time-telling: Telling the time: half drie, kwart over vijf. Dutch counts a half hour toward the next hour: half drie is 2:30. Kwart over and kwart voor work as in English, and om gives the time of something: om half acht (at 7:30).

