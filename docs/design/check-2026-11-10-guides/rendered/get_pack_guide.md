# Making study material for the person

What they study in Lexicommons comes in packs: sentences in the language they're learning, each one playable in every game the app has. You write the sentences; the app teaches their words and plays them, and every answer they give counts in their progress.

You make sentences, not lessons: each sentence is written for one word (the word in its gap), and the app makes the lessons from those words. There's no lessons or units field to fill in: the hand-built lessons of Lexicommons' own courses aren't something you make here.

## The steps
1. get_learner: their language, their level, what's due and weak. It's empty until their app has opened Practice with you: then list_packs says which language they're learning (the language of Lexicommons' own packs on their devices), study_summary what they've studied once their app has opened with you connected, and if both are empty, ask them, and write as for a beginner.
2. get_pack_guide with language (nl, es…): this guide with that language's pattern ids at the end, what each sentence is tagged with.
3. list_packs: their packs, Lexicommons' own among them. To add to a pack: get_pack, so you add new sentences rather than repeat them.
4. Write the sentences (below). check_items checks them as add_items or create_pack would, and keeps nothing: use it while you work.
5. add_items to a pack of theirs, or create_pack for a new one. Every problem comes back at once; fix them all and send it again.
6. list_pack_changes: how each of their devices took it. undo_pack_change undoes it.
7. Tell them where it is: after the unit they're in on their path (a new learner: after the first unit), and in Study → Study a topic now.

## One pack, or a separate one
- Most people keep one pack and you keep adding to it (add_items), a handful of new words at a time. That's the default: make one pack for the language, then add to it as they learn.
- Make a separate pack (create_pack) for something they'll want to study on its own, such as a trip ("I'm going to the Netherlands: just the travel things for now"). In the app each pack can be turned on or off for studying, so a trip pack can be studied alone and turned off afterward without losing what they learned.
- Ask them if it isn't clear which they want.

## Shaping a pack
- One new word a sentence, in its gap. For a vocabulary pack, write two or three sentences for each new word (with only one, a lesson asks that one sentence again and again), each with the word in the gap and other words of the same kind as its options (nouns for a noun: "kaartje", "brood", "boek"). A gap on a verb's form ("vertrekt", "vertrekken", "vertrok") teaches the form instead.
- Keep each sentence's other words ones they know (get_learner's words) or the pack's other gap words. A word they don't know yet still works: until it's taught, the sentence shows it marked, its meaning a tap away, and a later lesson of the pack teaches it. But each one makes the pack longer and its first sentences harder.
- Short sentences at first (4 to 8 words); longer as they cope.
- Use each new word in 2 or 3 sentences: a word met in several sentences sticks, and the app spreads them over its games.
- Size: a handful at a time. A first pack of 10 to 30 sentences (5 to 15 new words), then more in handfuls like it as they learn, never 200 at once: everything you add comes next on their path, ahead of the course (below). Ask them before adding a lot. (add_items takes up to 100 sentences a call.)
- The order: the pack's first two lessons teach its gap words, commonest first (by how often the language uses them), four to a lesson; after that its lessons take turns: the other new words its sentences need, then more gap words. The order of items doesn't set it. Sentences you add later are taught next.
- Tag what each sentence shows. Every sentence shows some grammar: its verb's tense (present), a noun's article (de-het), its word order (v2, question). Tag the one or two it really shows, from the language's pattern ids (get_pack_guide with language), and never one it doesn't. A pattern the grammar lacks: declare it in patterns.
- Wrong versions are the mistakes a learner makes with this sentence: the wrong order (Waar het perron is?), the wrong form (Ik koopt een kaartje.), the wrong article (Waar is de perron?), the wrong number (Ik koop een kaartjes.). Never nonsense, and never another right sentence.
- A bad sentence, and its fix. Bad: "Ik koop morgenvroeg een retourtje naar Utrecht Centraal bij het loket." with the gap on retourtje and the wrong version "Ik koop een kaartje.": four new words (morgenvroeg, retourtje, Centraal, loket) in one long sentence, and a "wrong version" that's another right sentence. Fix: one new word each, "Ik koop een retourtje." (wrong: "Ik koop een retourtjes.") and "Het loket is dicht." (wrong: "De loket is dicht."), each with its own gap.

## The smallest sentence
Check it first: check_items with the items and words below, and pack_id (a pack of theirs) or language (for a new pack); it answers { ok, errors, warnings } and keeps nothing. Then add_items, with every field a sentence needs and none it doesn't:
{
  "pack_id": "my-dutch",
  "items": [
    {
      "sentence": "Ik drink koffie.",
      "lemmas": { "Ik": "ik", "drink": "drinken", "koffie": "koffie" },
      "literal": ["I", "drink", "coffee"],
      "natural": "I drink coffee.",
      "wrong": ["Ik koffie drink."],
      "gap": { "word": "drink", "options": ["drink", "drinkt", "drinken"] },
      "patterns": ["present"]
    }
  ],
  "words": { "ik": "I", "drinken": "to drink", "koffie": "coffee" }
}
- words (beside items): { lemma: English gloss } for each word the sentence teaches, so the word games and a word's page can show its meaning. Without it the sentence is still kept, with a warning.
- patterns: the language's pattern ids (get_pack_guide with language lists them; get_learner too, once it has their study, as { "id": "p:present", … }): write "present" or "p:present".

## A whole new pack
create_pack, with topics, glosses, a fixed phrase, a pattern of its own and each kind of sentence (a moved verb, a frame, a question, the pack's own pattern):
{
  "name": "Trip to Utrecht",
  "about": "What I'll need at the station, on the train and in town.",
  "language": "nl",
  "pack_id": "trip-utrecht",
  "topics": { "travel": "Travel", "city": "In town" },
  "words": {
    "morgen": "tomorrow",
    "vertrekken": "to leave, to depart",
    "ons": "our",
    "trein": "train",
    "om": "at (a time)",
    "negen": "nine",
    "uur": "o'clock; hour",
    "ik": "I",
    "hebben": "to have",
    "een": "a, an",
    "kamer": "room",
    "reserveren": "to book, to reserve",
    "hoe": "how",
    "laat": "late",
    "de": "the",
    "bus": "bus",
    "fietsen": "to cycle",
    "graag": "gladly; like to (after a verb)",
    "door": "through",
    "stad": "town, city",
    "waar": "where",
    "zijn": "to be",
    "het": "the (with het-words); it",
    "perron": "platform",
    "kopen": "to buy",
    "kaartje": "ticket"
  },
  "chunks": { "hoe-laat": { "text": "hoe laat", "en": "what time", "about": "Asks for a time: Hoe laat is het? (What time is it?)" } },
  "patterns": {
    "graag": {
      "name": "graag: liking to do something",
      "about": "graag after the verb says you like doing it: Ik fiets graag (I cycle gladly), I like cycling."
    }
  },
  "items": [
    {
      "id": "trein-vertrekt",
      "sentence": "Morgen vertrekt onze trein om negen uur.",
      "lemmas": {
        "Morgen": "morgen",
        "vertrekt": "vertrekken",
        "onze": "ons",
        "trein": "trein",
        "om": "om",
        "negen": "negen",
        "uur": "uur"
      },
      "literal": ["Tomorrow", "*leaves*", "our train", "at", "nine", "o'clock"],
      "english": [0, 2, 1, 3, 4, 5],
      "moved": ["vertrekt"],
      "natural": "Our train leaves at nine tomorrow.",
      "wrong": ["Morgen onze trein vertrekt om negen uur.", "Morgen vertrekt onze treinen om negen uur."],
      "gap": { "word": "trein", "options": ["trein", "bus", "boot"] },
      "topic": "travel",
      "patterns": ["v2"],
      "shapes": {
        "v2": [
          {
            "shape": "places",
            "parts": [["Morgen"], ["vertrekt"], ["onze", "trein"], ["om", "negen", "uur"]],
            "mark": 1,
            "place": "second",
            "note": "The verb comes second, after Morgen."
          }
        ]
      }
    },
    {
      "id": "kamer-gereserveerd",
      "sentence": "Ik heb een kamer gereserveerd.",
      "lemmas": { "Ik": "ik", "heb": "hebben", "een": "een", "kamer": "kamer", "gereserveerd": "reserveren" },
      "literal": ["I have", "a room", "*booked*"],
      "english": [0, 2, 1],
      "moved": ["gereserveerd"],
      "natural": "I've booked a room.",
      "wrong": ["Ik heb gereserveerd een kamer.", "Ik heb een kamer reserveren."],
      "gap": { "word": "kamer", "options": ["kamer", "tafel", "fiets"] },
      "topic": "travel",
      "patterns": ["perfect"],
      "shapes": {
        "perfect": [{ "shape": "frame", "from": "heb", "to": "gereserveerd", "note": "heb … gereserveerd: the participle goes to the end." }]
      }
    },
    {
      "id": "waar-perron",
      "sentence": "Waar is het perron?",
      "lemmas": { "Waar": "waar", "is": "zijn", "het": "het", "perron": "perron" },
      "literal": ["Where", "is", "the platform"],
      "english": [0, 1, 2],
      "natural": "Where is the platform?",
      "wrong": ["Waar is de perron?", "Waar het perron is?"],
      "gap": { "word": "perron", "options": ["perron", "station", "loket"] },
      "topic": "travel",
      "patterns": ["question", "de-het"]
    },
    {
      "id": "koop-kaartje",
      "sentence": "Ik koop een kaartje.",
      "lemmas": { "Ik": "ik", "koop": "kopen", "een": "een", "kaartje": "kaartje" },
      "literal": ["I", "buy", "a ticket"],
      "natural": "I'm buying a ticket.",
      "wrong": ["Ik koop een kaartjes.", "Ik koopt een kaartje."],
      "gap": { "word": "kaartje", "options": ["kaartje", "brood", "boek"] },
      "topic": "travel",
      "patterns": ["present"]
    },
    {
      "id": "hoe-laat-bus",
      "sentence": "Hoe laat vertrekt de bus?",
      "lemmas": { "Hoe": "hoe", "laat": "laat", "vertrekt": "vertrekken", "de": "de", "bus": "bus" },
      "literal": ["What time", "leaves", "the bus"],
      "english": null,
      "natural": "What time does the bus leave?",
      "wrong": ["Hoe laat de bus vertrekt?", "Hoe laat vertrekken de bus?"],
      "gap": { "word": "vertrekt", "options": ["vertrekt", "vertrekken", "vertrok"] },
      "topic": "travel",
      "patterns": ["question"],
      "chunks": ["hoe-laat"]
    },
    {
      "id": "fiets-graag",
      "sentence": "Ik fiets graag door de stad.",
      "lemmas": { "Ik": "ik", "fiets": "fietsen", "graag": "graag", "door": "door", "de": "de", "stad": "stad" },
      "literal": ["I", "cycle", "gladly", "through the city"],
      "natural": "I like cycling through the city.",
      "wrong": ["Ik graag fiets door de stad.", "Ik fiets door de stad graag."],
      "gap": { "word": "graag", "options": ["graag", "goed", "leuk"] },
      "topic": "city",
      "patterns": ["graag"]
    }
  ]
}
(Dutch, as most examples here; the fields are the same in every language. Two more below: the other gender, and a language with readings.)

## Every field of a sentence
Needed:
- sentence: as written, end punctuation included. 16 words at most, 40 characters a word, 400 characters in all; natural and everyday, at their level, one new thing at a time.
- literal: the sentence in English words, chunk by chunk, in the sentence's own order. This is the heart of the app: it teaches them to think in the language's order. Put a chunk the sentence moves (where English wouldn't put it) between asterisks: "*yesterday*". 1 to 24 chunks, 60 characters each.
- natural: the sentence in natural English.
- wrong: 1 to 3 plausible wrong versions for Choose: the mistake a learner would make, usually the same words in a wrong order or a wrong form. Never the sentence itself, and each different.
- gap: { word, options }: the word to fill in or type, as written, with 2 to 5 options it's among, the word itself included (forms of the same word work best). Write each option as the sentence would write it there: a word after Spanish's ¿ or ¡ carries it in every option ("¿Estás", "¿Eres"), and the app shows the mark outside the choices. The gap's word is the word the sentence is written for: the app teaches it with this sentence. If the word is in the sentence twice, add at: its position (0 = the first word).
- patterns or chunks, at least one, up to 4 each: what it's an example of. patterns: the language's pattern ids (perfect, v2…; get_pack_guide with language lists them) or a pattern the pack declares. chunks: a fixed phrase the pack declares.
Worth giving:
- lemmas: { "word as written": "dictionary form" } for the words worth learning. A dictionary form is lower case, except where the language writes it otherwise (German nouns keep their capital: { "Buch": "Buch" }). A word written more than once in the sentence takes one form for every time; where the times differ, give a list, one entry per time in order, null for a time that's no word to learn: { "je": ["jij", "je"] } in "Woon je hier met je moeder?"; German's { "zu": [null, "zu"] } in "zu Hause zu arbeiten" (zu Hause a phrase, then the infinitive's zu). get_pack shows a sentence's lemmas this way too. The gap's word needs its lemma: it's the word the sentence teaches.
- english: literal's chunk indexes in English order ([0, 2, 1] turns "I have", "a room", "*booked*" into "I have booked a room"), so the app can slide the line from one order into the other. Only when the chunks map one to one; else null.
- moved: the sentence's words, as written, that sit where English wouldn't put them (the app highlights them), 8 at most.
- topic: one of the pack's topics (declare it in topics, in the same call).
- id: made from the sentence when you leave it out. It stays with the sentence for good, since their progress points to it; update_items needs it.
- otherGender: where the sentence is said differently by the other gender, or to them (Portuguese Obrigado / Obrigada; Spanish ¿Estás listo? / ¿Estás lista?): { "text": that sentence, "gender": "f" or "m" (whose it is), "who": "speaker" (they say it) or "listener" (it's said to them) }. From the English, it's right too, and the answer names it:
{
  "language": "es",
  "items": [
    {
      "sentence": "¿Estás listo para el viaje?",
      "lemmas": { "Estás": "estar", "listo": "listo", "para": "para", "el": "el", "viaje": "viaje" },
      "literal": ["Are you", "ready", "for the trip"],
      "natural": "Are you ready for the trip?",
      "wrong": ["¿Eres listo para el viaje?", "¿Estás listo por el viaje?"],
      "gap": { "word": "¿Estás", "options": ["¿Estás", "¿Eres", "¿Estoy"] },
      "patterns": ["ser-estar"],
      "otherGender": { "text": "¿Estás lista para el viaje?", "gender": "f", "who": "listener" }
    }
  ],
  "words": { "estar": "to be (a state)", "listo": "ready", "para": "for", "el": "the", "viaje": "trip" }
}
- shapes: how its rule is drawn (below).
- copyOf (Lexicommons' own packs carry it): the id of the pack this item is a copy from, unchanged, so what they learned on it there counts here too, and it shows once when both packs are on. Don't add it to anything you write; a copy you change becomes a sentence of its own, and loses it.

## Japanese and Chinese (written without spaces), and Korean
- words: the sentence's words in order, as you split them. Joined, they're the sentence without its end punctuation. The split is kept exactly, so make it the one a learner should see: content words with their endings on (食べました, 喜欢), particles on their own (は, を, に, 的, 了, 吗), です on its own.
- readings: { "word as written": "reading" } for every word with kanji or hanzi. Japanese: hiragana for the whole word, its kana included ({ "食べました": "たべました" }); a word in kana has none. Chinese: pinyin with tone marks, one syllable per character, separated by spaces ({ "我们": "wǒ men" }); the neutral tone has no mark. Each is checked against its word.
- The pack's readings too: { lemma: reading } for each dictionary form with kanji or hanzi ({ "食べる": "たべる" }), for Match and a word's page. Pass it like words (readings in add_items or update_pack).
- Readings show over a word until the learner knows it, so give every such word its lemma. A word written the same way more than once in a sentence and said differently takes a list, one reading per time in order (null for a time with none), as lemmas do: { "方": ["かた", "ほう"] } in あの方の方が上手です. get_pack shows it this way too.
- The literal line: a particle with an English word goes into its chunk ("to Tokyo"); particles English has no word for (は, が, を, 的) add nothing.
- Korean is written with spaces: a word is what's between two spaces (학교에), its lemma the content word's dictionary form (학교, 먹다), and particles are patterns, never words.

- Example (check_items with language "ja": a new Japanese pack's sentence):
{
  "language": "ja",
  "items": [
    {
      "sentence": "私は駅に行きます。",
      "words": ["私", "は", "駅", "に", "行きます"],
      "lemmas": { "私": "私", "駅": "駅", "行きます": "行く" },
      "readings": { "私": "わたし", "駅": "えき", "行きます": "いきます" },
      "literal": ["I", "to the station", "*go*"],
      "english": [0, 2, 1],
      "moved": ["行きます"],
      "natural": "I'm going to the station.",
      "wrong": ["私は行きます駅に。", "私を駅に行きます。"],
      "gap": { "word": "に", "options": ["に", "を", "で"] },
      "patterns": ["particle-ni", "verb-last"]
    }
  ],
  "words": { "私": "I", "駅": "station", "行く": "to go" },
  "readings": { "私": "わたし", "駅": "えき", "行く": "いく" }
}

## Vowel marks: Arabic, Hebrew, Latin's long vowels, and Russian's stress
- readings: { "word as written": "reading" }, the word with every vowel mark it's read with: the same letters in the same order, with marks added. Each is checked against its word.
- Hebrew: every word, its points added to its everyday full spelling ({ "מאוד": "מְאוֹד" }).
- Arabic: every word, with its tashkeel ({ "كتب": "كَتَبَ" }). A hamza or madda is part of its letter (أ, إ, آ), so write the word with it too, and alef is plain ا, never ٱ.
- Latin: only a word with a long vowel, its macrons added ({ "amo": "amō" }); a word with none (puella) has no reading.
- Russian: every word of two syllables or more, its stress mark: one acute (U+0301) right after the stressed vowel, the word's letters otherwise as written ({ "молоко": "молоко́" }). A word of one syllable (дом) has none, and neither does a word written with ё (всё), which is always stressed.
- The pack's readings too: { lemma: reading } for each dictionary form. The marks show on the word until the learner knows it, so give every such word its lemma.
- A word written the same way more than once in a sentence and read differently takes a list, one reading per time in order (null for a time with none), as lemmas do.
- gap's options too: each { text, reading } (gap: { word: "أذهب", options: [{ "text": "أذهب", "reading": "أَذْهَبُ" }, { "text": "ذهبت", "reading": "ذَهَبْتُ" }] }), the right one with its reading in the sentence. Fill shows the choices with their marks until the learner knows the word; give every choice its reading, or none.

## Shapes (optional): how a sentence's rule is drawn
On a pattern's sheet, the app draws the person's own sentence with the rule's words lit and the rule's shape on them. shapes says exactly what to draw, per pattern the sentence is an example of. Leave it out and the app draws only what it can work out itself (often just the marked words lit): never guess a mark, and give only marks that show what the pattern is about. Up to 8 marks per pattern.
- Name a word as written, the way gap does ("hablo", its punctuation optional), or { "word": "de", "at": 3 } when the sentence has it more than once (0 = the first word).
- lit: the words the rule is about. { "shape": "lit", "words": ["hablo"] }
- frame: a bracket under the words from one to another, when two parts hold the rest between them. { "shape": "frame", "from": "heb", "to": "gelezen" }
- link: an arc from a word to the word it goes with, either way; an end can sit on letters. { "shape": "link", "from": "yo", "to": "hablo", "toLetters": "o" }
- affix: the letters that change, wherever they are: an ending, a prefix, an infix, a root pattern, in order. { "shape": "affix", "word": "يكتبون", "letters": ["ي", "ون"] }. If a letter is in the word more than once after the one before it, give chars instead: [start, end) character spans in the word as written ("staat": "chars": [[4, 5]] is its last t).
- box: words that go together, side by side (2 to 4). { "shape": "box", "from": "la", "to": "casa" }
- places: a clause's parts in order, one ringed, and where it comes. { "shape": "places", "parts": [["Op", "de", "bank"], ["ligt"], ["een", "boek"]], "mark": 1, "place": "second" } (place: first, second or last).
- tag: a short label over a word (16 characters at most), in the language of natural, for what a particle does. { "shape": "tag", "word": "は", "text": "topic" }
- note (on any mark): one line under the picture, 80 characters at most, in the language of natural. "The -o is for yo: hablo, I speak."
- A mark that doesn't fit is left out with a warning; the sentence is kept.
- Example: "patterns": ["present"], "shapes": { "present": [ { "shape": "lit", "words": ["hablo"] }, { "shape": "affix", "word": "hablo", "letters": ["o"] }, { "shape": "link", "from": "yo", "to": "hablo", "toLetters": "o", "note": "The -o is for yo: hablo, I speak." } ] }
- A pack in the open library: don't add shapes, or a shape newer than the app's, until the app that knows them is live; a device whose app doesn't know them refuses the new version.

## What a pack names
- topics: { id: name }, what its sentences are about ({ "travel": "Travel" }), 40 at most.
- words: { lemma: gloss }, the English meaning of each word it teaches (80 characters), so the word games and the word's page can show it. A lemma without a gloss is a warning.
- readings (Japanese, Chinese; Arabic, Hebrew, Latin, Russian): { lemma: reading }, how each dictionary form with kanji or hanzi is said, or each written with its vowel marks or stress mark.
- chunks: { id: { text, en, about? } }, fixed phrases learned whole ({ "hoe-laat": { "text": "hoe laat", "en": "what time" } }).
- patterns: { id: { name, about } }, grammar the language's shared grammar doesn't have yet. Use the shared grammar's own whenever one fits: it's what every pack of the language shares, so evidence for it counts as one. When a pattern of the pack's own is one every learner of the language should have, and the person wants it shared, suggest it for the shared grammar (suggest_pattern); an admin accepts or declines it. A new pattern of the pack's own is kept as <pack id>.<id> (get_pack shows it), so it never collides with another pack's; name it by its bare id or by that. Once the shared grammar has the same pattern, set same: "<its id>" on the pack's own: its sentences count for the shared one, and what the person learned under either is one.
- add_items, update_items and update_pack take topics, words, readings, chunks and patterns too, merged into the pack's (an id set to null is taken out).
- create_pack's own: name (80 characters), about (a line on what it's for, 400), language (the code of the language it teaches), pack_id (2 to 48 lowercase letters, digits and dashes; made from the name when left out, and never one a pack of theirs or a public pack has).

## Limits
- 100 sentences a call; 5000 in a pack; the pack 2 MB as JSON.
- A sentence: 16 words, 400 characters; 3 wrong versions; 5 options; 4 patterns and 4 chunks; 24 literal chunks.
- A pack: 40 topics, 5000 words, 500 chunks, 100 patterns of its own; a lemma 48 characters, a reading 120.
- A value past a tool's own limit (a fourth wrong version, a sixth option) is refused before the check, as an invalid argument.

## When it's refused
Nothing is kept until everything passes. Each problem comes back with where it is (items[2].gap.word) and what's wrong; warnings are kept with the change, but worth fixing. What each one says (… is the part that changes), and what to do:
- sentence is missing: Give sentence: the sentence as written, its end punctuation included.
- literal is missing: Give literal: the English, chunk by chunk, in the sentence's order.
- natural is missing: Give natural: the sentence in natural English.
- wrong is missing: Give 1 to 3 wrong versions.
- gap must be { word, options }: Give gap: { word, options }.
- needs at least one pattern or chunk (what the sentence is an example of): Tag it with a pattern (get_learner's, or one the pack declares) or a fixed phrase the pack declares.
- gap.word "…" isn't one of the sentence's words: gap.word is a word of the sentence exactly as written there (its punctuation may be left off).
- gap.options must include the word as written: Put the word itself among the options, exactly as the sentence writes it, an opening mark included (¿Estás).
- gap.options must all be different: Make every option a different word.
- gap.at must be a word's position: at counts the sentence's words from 0; leave it out unless the word is in the sentence twice.
- a wrong version is the sentence itself: A wrong version must differ from the sentence (case and the space before punctuation don't count).
- the wrong versions must all be different: Make each wrong version a different mistake.
- lemmas: "…" isn't one of the sentence's words: Each key of lemmas (and of readings) is one of the sentence's words as written.
- "…" is written … times, so its list needs … entries: A word written more than once with different lemmas takes a list, one entry per time it's written, null for a time that's no word to learn.
- english must list each literal chunk's index once: english is a reordering of literal's indexes (each once), or null when the chunks don't map one to one.
- moved "…" isn't one of the sentence's words as written: moved lists words of the sentence exactly as written (with their capitals).
- topic "…" isn't one of the pack's topics: Declare the topic in topics ({ id: name }) in the same call.
- pattern "…" isn't in the language's catalog or the pack's patterns: Use one of the language's ids (get_pack_guide with language), or declare the pattern in patterns in the same call.
- phrase "…" isn't one of the pack's chunks: Declare the phrase in chunks ({ id: { text, en } }) in the same call.
- the same sentence as items[…]: Each sentence once in a pack.
- another item in the pack has this id: Give each sentence its own id, or leave id out.
- otherGender.who must be: who is "speaker" (they say it) or "listener" (it's said to them).
- otherGender.text is the sentence itself: otherGender.text is the other gender's sentence, which differs.
- is written without spaces, so give the sentence's words: In Japanese, Chinese and the like, give words: the sentence's words in order.
- words, joined, give: Joined with nothing between them, words must be the sentence without its end punctuation.
- words is only for a language written without spaces: Leave words out: the sentence is split at its spaces.
- the reading "…" must be: A reading must fit its word: kana for the word's kanji (its own kana kept), pinyin a syllable per character; the message says which.
- language must be one of: language is the code of the language it teaches (nl, de, es…), one of those listed.
- words has … entries; keep it to: Keep a sentence to 16 words.
- "…" is taken (a pack of theirs, or a public one): Leave pack_id out (one is made from the name), or choose another.
Warnings (it's kept): "No gloss for …" (add those lemmas to words); "you already have this sentence, in …" (they have it in another pack: write another); "No reading for …" (add the readings); a shape that doesn't fit (it's left out; the sentence is kept).

## How a change reaches them
- Every change is checked here first, then it's on its way to each of their devices. A device that's open takes it within seconds; one that's closed takes it the next time Lexicommons opens. Each checks it again, applies it, and reports back. A change waits 7 days for every device.
- list_pack_changes shows how each device took a change (applied, refused with why, or missing: a device that doesn't have that pack).
- Every change can be undone: undo_pack_change (the latest change to a pack first), or Undo in the app.

## What they see
- A pack you make comes on their path after the unit they're in, under its own name ("Trip to Utrecht 1"): a new learner meets it after the first unit; one further on, next. Until then, Study → Study a topic lists it and plays it now (its next lesson; once its lessons are done, a practice of its words). Tell them both, so they know it's there.
- Its lessons teach four words each: first the words its sentences are written for (their gaps' words), then the other new words its sentences need, taking turns. Words they know already aren't taught again, and the course goes on where it was once its lessons are done.
- When they reach it, Home's "Learn something new" and Study's next lesson are its lesson, and Where you are says "Trip to Utrecht 1 · Lesson 1". Their path page shows it as a unit of its own.
- A pack's lessons come before the course goes on, so a big pack holds the course back by its lessons. Several packs come one after another, in the order you made them. To go back to the course, they turn a pack off in Study → Your packs; what they learned stays.
- Once every word of a sentence is taught, the sentence comes into Practice and every game: read it, hear it, put it in order, choose the right version, fill the gap, type it, say it.
- Sentences you add later are taught next the same way, never skipped.

## Sharing in Explore
- Sharing a pack of theirs in Explore (share_upload, then share_pack) is open only to Lexicommons' admins for now: if those tools aren't among yours, it isn't open to this person yet.
- request_upload and list_uploads are a connection test, not a way to add a pack: packs go in with create_pack and add_items.

## Good sentences
- Real, everyday, the kind people say. Short at first; longer as they cope.
- Aim at what's due and weak (get_learner), and at what they asked for.
- The literal line must be exact: the same meaning, chunk by chunk, in the sentence's order, with the moved chunks marked.
- Wrong versions should tempt: the mistake a learner would make, not nonsense.
