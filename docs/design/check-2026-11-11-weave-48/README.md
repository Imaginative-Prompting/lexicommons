# A person's own weave, in 48 languages (11 Nov 2026)

The director's ruling, applied: weave-accepted.json is the shelf's judged layers, and an entry marked `"shelf": true` opens no language for a
person's own weave and tunes nothing. A language opens for your own weave when it has an accepted rules entry (weaveRules answers) and its
woven words need no reading the reader can't yet draw (its registry entry has no readings), and Russian and Latin by the director's word (a
missing stress or long-vowel mark is a gap, not a false form). Tuned means a worked example of its own in the guide and the mix check's data:
Dutch and Spanish.

## Which languages

Open (48): Afrikaans, Basque, Belarusian, Bosnian, Breton, Bulgarian, Catalan, Croatian, Czech, Danish, Dutch, Esperanto, Estonian, Finnish,
French, Galician, Georgian, German, Greek, Hindi, Hungarian, Icelandic, Indonesian, Italian, Korean, Latin, Latvian, Lithuanian, Luxembourgish,
Macedonian, Maltese, Norwegian, Polish, Portuguese, Romanian, Russian, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Tagalog,
Turkish, Ukrainian, Uzbek, Vietnamese and Welsh. Tuned: Dutch, Spanish. Each checked against the app's own registry (public/js/lang/index.js):
a name, rules, an object-pronoun list, and no readings field but Russian's and Latin's.

Still shut, for the reader's readings fix and a woven page seen: Arabic, Sorani Kurdish, Hebrew, Japanese, Urdu, Yiddish, Cantonese, Chinese.

## What changed

- `pipelines/books/export-weave-rules.ts` and `pipelines/books/test.ts` skip `"shelf": true` entries; `weave-own.json` lists the 47 besides
  Dutch (open through its accepted entry), every asOf 11:23 (the export's own time: v652 shipped 11:30, a time not yet come).
- Every language's object pronouns (lx-books): an empty list (German, Russian, Polish and most) means no pronoun is counted as left alone
  after an English verb; French, Hindi, Catalan, Greek, Galician, Romanian, Bulgarian, Macedonian, Italian, Portuguese, Spanish and Dutch
  have their clitics.
- `src/weave-guide.ts`, Which languages: the count and every name by name, tuned Dutch and Spanish, "for the others you follow the general
  rules"; a general language's advice (where a note seems wrong, follow the language and say which); an empty pronoun list's sentence (the
  pronoun check doesn't apply); a tuned language's worked example named as its own.
- `src/mcp-texts.ts`: get_weave_guide's refusal for a shut language points to Which languages.
- No screen lists the languages: the reader's offer and the AI section's Weave a text row are for the language you learn, so a learner of
  41 more languages now has them.

## Checks

Node: test-guides 17/17 (every one of the 48 guides: its footing, its pronoun sentence by its list both ways, no placeholder, nothing said
twice), test-weave-texts 12/12 (an empty pronoun list counts none; no list any; Dutch's its own, the control), test-texts 10/10,
test-requests 11/11, test-text-relay 19/19, the typecheck, test-owner-words and test-owner-name. The books pipeline's weaving check's
assertions against this copy pass (its suite reads app/ and passes once this lands). Through check-gate: reader-check 58/58.

The look (`look-stills.mjs`, a fresh account per phone, every text and weave through the real MCP calls an AI makes, nothing pressed for
the weave): a Polish learner's AI section with Weave a text, and the reader's offer on an English text of theirs; a Hindi and a Georgian
learner's text woven by add_weave with its nouns known, open in the reader (`*-390.png`). add_weave refused the first Hindi weave written
for it, rightly: the English-order line keeps the English word's punctuation ("पानी.", not "पानी।"); the Hindi line has its danda.
