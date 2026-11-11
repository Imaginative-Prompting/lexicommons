# One message weaves a text (11 Nov 2026)

Reading your own text woven is the reader's main use: the open shelf can't carry the books people want to read, because they're under
copyright. Until now a weave needed a press in the app ("Weave it with your AI" in Read). Now one message to your AI does all of it.

## What a learner does, and sees

1. In their AI app, connected to Lexicommons, one message: "Weave this into Dutch for me in Lexicommons:" with the text pasted, a link the AI
   can open, or a file. Long texts go a chapter at a time.
2. Their AI reads `get_weave_guide`, adds the text (`request_text_upload`, its PUT, `add_text`), takes its sentences (`get_text` by its
   text_id), weaves every sentence and sends it (`add_weave` with text_id and language). It takes a while and uses a lot of the AI's usage
   (every sentence is written three ways and checked); the guide says so, and tells the AI to say so before a long text.
3. On their phone: a notification "Your AI wove your text" if they allow them; in Read → Your library the text's card says
   "Woven into Dutch" (`read-card-woven-390.png`).
4. Open it: English at first (`reader-woven-390.png`, a new learner with no Dutch yet). As they learn its words, the Dutch shows in their
   places, and a sentence they know 90% of turns into Dutch whole, with the Dutch-order line under it.

`one-message.mjs` plays exactly that on a local copy: a phone signs up and makes a personal token, then each tool as an AI calls it, then the
phone takes the text and its weave through the relay (`results/one-message.json`: every call's answer, the card's words).

## What changed

- `src/texts.ts`: `add_text` keeps the book it made (plain text or a lexicommons-book: the add's own file, at its version) as the text's copy
  for weaving, `text-book:<text id>`, for 90 days. It isn't one of the account's 200 uploads, the tidy sweeps it after its days, the export
  lists it with every upload (`/api/me/export` reads every upload row), and deleting the account takes it (every upload row and its file).
  `textSource` reads it for `add_weave` and `get_text`. It refuses, in words, a text the AI didn't add (theirs comes through their press), an
  EPUB (made into a book on each device, so there's no copy here), a removed text, and one past its days.
- `src/mcp-texts.ts`: `add_weave` takes `text_id` with `language`, or `request_id` with `seat` (their press), one of them. `get_text` by
  text_id hands over `to_weave` for a text the AI added, or says why not. `add_text`'s next step points on to weaving.
- `src/weave-guide.ts`: the guide opens with their one message (what to ask for, the time and the usage, a chapter at a time with the real
  limits: a text up to 8 MB, a weave inline under about 1 MB and up to 8 MB as a file, the copy's 90 days), then the steps by text_id, then
  "Before you send": lx-books' finding (Alice's 22 sentences woven by hand into Spanish passed every check, and a trusted judge still found 5
  that mislead), the three places it clusters (a two-word negative, a verb carrying a pronoun or particle, a fixed phrase without its
  upgrade) and a last read as a half-knowing learner. The person's press is kept as the other way in. Six new refusals, each planted.
- `public/js/read/library.js` (pick 4): a text woven into the language you learn says "Woven into …" on its card in Read.

## Checks

test-guides 15/15 (`results/test-guides.txt`: the one-message flow end to end, every refusal planted, 25 for the weave guide);
test-text-relay 19/19 (`results/test-text-relay.txt`: the copy's life, the real `deleteAccount`); test-weave-texts 11/11, test-texts 10/10,
test-read-store 10/10, test-sync 50/50, the typecheck, test-owner-words and test-owner-name. Through check-gate: reader-check 58/58 (for library.js).
privacy-check 9/9 on a fresh state with sharing for everyone and the server's log: every table's rows in the export, deleting the account
leaving what the policy says, and MCP's guides (this one too) naming no plan or payment.
