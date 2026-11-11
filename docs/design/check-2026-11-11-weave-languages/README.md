# A person's own weave, into more languages (11 Nov 2026)

Weaving your own text with your own AI is the reader's main use, so it has to be true for more than Dutch learners. The director's call: a
person's own weave by their own AI is theirs, not the shelf's, so its gate is the format's checks plus the language's rules where they exist,
not the judged bar the shelf's books meet; and the guide says plainly, per language, whether Lexicommons' rules are tuned for it.

## Which languages, and on what footing

| Language | Footing | Why |
|---|---|---|
| Dutch | tuned | the shelf's judged list (weave-accepted.json): 22 notes, the mix check's data, judged books |
| Spanish | tuned | 10 notes, the mix check's data, and a judged pass (Peter Rabbit, stories-es-2/set2: 0 of 62 misleading) |
| German, Russian | general rules | notes (8, 12); no list of object pronouns, so the mix check reads any word glossed as a pronoun right after an English verb as one shown alone, and the guide says so |
| Portuguese, Italian | general rules | lx-books' entries from this morning (pipelines/books/languages/pt.json, it.json), each with object pronouns and verb forms for the mix check |
| French | not yet | 2 notes; lx-books adds them once its run on fr ends (it owns languages.ts, and a chain is reading it) |
| Japanese | shut | the reader's showing of woven Japanese with its readings inside an English sentence isn't seen yet; its one judged run missed the bar (6.5%) |
| Hindi | shut | no run met the bar here; not a path language |

## How

- `pipelines/books/weave-own.json` (new, with lx-books' yes): the languages a person's own weave may go into beyond the accepted ones, each
  with when its rules were taken and whether they're tuned.
- `pipelines/books/export-weave-rules.ts` writes rules and mix-check data for the accepted ones and those, into `src/weave-rules.generated.ts`
  and `src/split-forms.generated.ts`, and the page's `WEAVE_LANGUAGES` (every language a text of yours can be woven into: add_weave,
  get_weave_guide, the reader's offer, the AI section, Read's "Weave your own") with `WEAVE_TUNED` (`public/js/read/weave-languages.generated.js`).
- `src/weave-guide.ts`: "Which languages" names this language's footing. Spanish has its own worked example: Peter Rabbit's sentences 1 and
  8 from the judged layer (`es-example.mjs` makes it, and checks the app numbers them as the layer did). Dutch keeps Alice and its two more
  sentences; German, Russian, Portuguese and Italian show Dutch's, said so, to show the form.
- The 90 days, as what they are: the server keeps its copy of a text your AI added for 90 days so your AI can weave it; the text and its
  weave stay on their devices; after that, weave it from Read.
- `public/js/ai/requests.js`: a weave request's line, "read it woven in Read" (it said the text "opens woven").

## Checks

test-guides 17/17 (every open language's guide and its footing; Spanish's example through the one-message flow into Spanish; Japanese now
the shut language a refusal is planted with), test-weave-texts 11/11, test-requests 11/11, test-texts 10/10, test-text-relay 19/19, the
typecheck, test-owner-words and test-owner-name. Through check-gate: reader-check 58/58 (for the page's language list).
