# The content's license

The code in this repository is under the GNU AGPL, version 3 ([LICENSE](LICENSE)). The learning content is under
**Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**:
https://creativecommons.org/licenses/by-sa/4.0/ (the legal code: https://creativecommons.org/licenses/by-sa/4.0/legalcode).

You may copy, change and share it, for any purpose, as long as you credit it and share what you make from it under the same
license.

## What's under CC BY-SA 4.0

| What | Where |
|---|---|
| Language packs: the starters, the eight courses' lessons (Dutch, Spanish, French, German, Portuguese, Italian, Russian, Japanese), Dutch's word packs and topic packs, and Japanese's kana | `packs/` |
| Each language's shared grammar, and the packs' notes | `library/grammar/`, `library/notes/` |
| The word-frequency list | `library/lists/` (built on FrequencyWords, CC BY-SA 4.0; its attribution is in the file) |
| The word pictures | `public/pictures/` |
| The help in English and the woven layers the library adds to its books, made for Lexicommons with an AI model and checked sentence by sentence | `library/books/<book>/<version>/` (`help.*.json`, `weave.*.json`); each one's catalog entry names the model |
| What learners share in Explore, once sharing is open | not in this repo; CC BY-SA 4.0, as the app says before anything is shared |

Credit it as **"Lexicommons and its contributors (https://lexicommons.com)"**, together with the sources the README lists
under "Credits for the open content". The word packs and the frequency list build on FrequencyWords and Wiktionary, both
CC BY-SA, so their credits travel with them.

## What keeps its own license

| What | Where | License |
|---|---|---|
| The open library's books | `library/books/` | each book's own (CC BY 4.0, CC BY 3.0, CC BY-SA, CC0 or the public domain), with its full credit in the catalog (`library/catalogue-seed.json`) and on its page in the app |
| Those books' pictures | `library/pictures/` | their book's license, their illustrators' (credited in their book's entry) |
| The Dutch starter's recordings | `public/audio/starter-word-order/` | CC BY 4.0: "Emma (or Ido), a synthetic voice made with ElevenLabs for Lexicommons" |
| Sound effects | `public/audio/fx/` | as `public/audio/fx/LICENSES.md` says |
| Fonts, flags, vendored libraries | `public/fonts/`, `public/flags/`, `public/vendor/` | their own, in the files beside them |

Everything else in this repository is code, under the AGPL.
