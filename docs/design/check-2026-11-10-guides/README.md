# Your AI's guides, and the path for a pack it makes (10 Nov 2026)

The guides an AI reads before it makes study material, adds a text, or weaves one: `get_pack_guide`, `get_text_guide`, `get_weave_guide`
(src/pack-guide.ts, src/text-guide.ts, src/weave-guide.ts), rewritten for an AI that has never seen Lexicommons: numbered steps, the
smallest example and a whole one, every field with its rule, every refusal with its fix, limits, and what the learner sees. Each was then
followed cold by another session over MCP on a fresh local copy, and what it hit was fixed.

`scripts/test-guides.mjs` holds them true: every example through the real tools as an AI calls them (each argument through its tool's own
schema), and every refusal a guide lists planted and said in the guide's words. `scripts/test-ai-pack-path.mjs` holds the path to them.

## What changed besides the words

- **add_weave takes the guide's own form** (`src/weave-answer.ts`): each sentence by its number, its parts as objects. Each sentence's place
  in the text and its hash are worked out here, as the books pipeline works out its model's answers. Checked equal to the pipeline's own
  conversion on 131 judged layers (26,612 sentences in nl, de, es, fr, ar, hi, ja): `results/parity-results.json`, `scripts/parity.ts`.
  `get_text` with a request hands over each sentence's words, numbered (`to_weave`).
- **The language's grammar as it is now** is installed before a weave's patterns are checked (it was revision 1's on a fresh isolate), and
  get_weave_guide is one text: its rules inside, their pattern list the grammar's now.
- **A possessive "her"** (haar, its own lemma, as the rules have it) is no longer refused as an object pronoun shown alone. Of the 1,137 "her"
  findings the mix check makes on the 43 judged Dutch layers, 591 carry the lemma haar and are let through; nothing is newly refused
  (`results/survey-pronouns.txt`). The books pipeline's own check (lib/split-forms.ts) has the same rule; that's its own lane's.
- **A book an AI sends** has its id, sentences and version worked out here: a book is its words and paragraphs. Japanese, Chinese, Cantonese
  and Thai texts can come with their own word split; plain text in them is split by the runtime's word breaker (checked in workerd).
- **A sentence the AI's form couldn't make** says only its own problem (the check no longer adds errors about its stand-in), and a refused
  words list no longer brings a text and a gap error with it (pack-format.js; no PACK_CHECKS bump: it accepts nothing new).
- **A pack your AI makes comes on the path** (study/path.js, content.js, packs.js): one of yours that came through the relay is laid out as
  a category pack is, after the unit the learner is in, under its own name; Study a topic plays it at once; a chosen pack's lesson is done
  by its words, so one that grows never hides a new word (plan.js lessonDone). Before, its words waited for the word series: an 8-sentence
  trip pack's words were first taught at lessons #198 to #3049 (`results/probe-ai-pack-results.json`). A pack's lesson studied by itself no
  longer marks the course's lessons Skipped (plan.js pathOverview, lessonsSkippedBy). Followed community packs and opt-in series wait with
  the series, as before.
- **The AI section** says how your AI picks a request up and where what it makes lands, and where weaving starts.

## Evidence

- `stills/`: the app at 390, dark, on a local copy of the candidate. A learner who signed up with a passkey, whose AI made the guide's trip
  pack over MCP, and who played the whole first unit: Home's "Learn something new" and Study's next lesson are the pack's, Where you are
  names it, Study a topic lists it (`home-390-dark.png`, `study-390-dark.png`, `study-a-topic-390-dark.png`). After a pack lesson from
  Study a topic, the path page has no Skipped and shows the pack as a unit of its own (`path-*.png`). The AI section before and after.
- `results/`: the suites run against each landing, the path probes, the parity and pronoun surveys, the reload probe (evidence and Home's
  card after a reload 0, 0.5, 1.5 and 3 s after marking lessons done).
- `rendered/`: the three guides as served.
- `scripts/`: the probes that made these (they were run from a scratch folder beside a copy of the app; paths are relative to it).
