# Lexicommons

A free language-learning app. Pick a language and it gives you one simple thing to do each day: short lessons that teach a few words at a time, then bring them back as you start to forget them.

There are eight full courses, 200 lessons each: Dutch, Spanish, French, German, Portuguese, Italian, Russian and Japanese. 75 languages have a starter pack. Dutch still has the most around it, with word packs for its most common words.

- **Study:** one daily session, with new words one at a time, games and spaced repetition.
- **Translate:** look up a word or sentence and see real examples.
- **Read:** what you want to read, woven. Ask your own AI to weave a text into the language you're learning (Dutch, for now) and read it here: the words you know show in that language in the English sentence, and a sentence you know most of turns into it whole. The opening of *Alice's Adventures in Wonderland* is woven as an example. The picture books, in 33 languages, nearly all have English beside them for when you need it. The library can't carry the books most people want to read, because they're under copyright: that's what weaving your own is for.
- **Explore:** ready-made topic packs and lessons to add to what you study. Packs you make yourself (by hand, from an Anki deck, or with your AI) stay yours.
- **Your data stays yours:** no ads and no tracking. Your progress lives on your device, and you can keep it in step between devices through your own cloud storage.

It works in a browser and installs like an app. **The app:** https://lexicommons.com

## Your own AI, if you want one

Nothing in Lexicommons needs an AI. If you use one already (Claude, Codex, or any app that speaks [MCP](https://modelcontextprotocol.io)), you can connect it to your account at `https://lexicommons.com/mcp`. The AI section's Connection page shows how for Claude and Codex, and what any other app needs. Then it can:

- coach you from your own mistakes, reading what you've studied, and practice with you;
- make packs for what you want to learn, which come onto your path after the unit you're in;
- add texts to your reading library, and weave them;
- restyle the app.

For each, the tools hand your AI a guide first (`get_coaching_guide`, `get_practice_guide`, `get_pack_guide`, `get_text_guide`, `get_weave_guide`, `get_theming_guide`): the format, worked examples, and every check what it sends goes through. It works through your own AI app and your own account with it: Lexicommons runs no AI of its own and sees no conversation you don't send it.

## Run your own copy

You can run all of it on your own computer, so nothing goes through anyone else. From a clone, with Node 24:

```sh
npm run local
```

[docs/self-host.md](docs/self-host.md) covers updating, removing, and what's different on a copy. You can also host it yourself, though we don't support or test that.

## Working on it

It's a Cloudflare Worker with D1, KV and R2, serving a web app with no build step. `AGENTS.md` has the commands, the checks and the rules. [CONTRIBUTING.md](CONTRIBUTING.md) says how changes come in, and [SECURITY.md](SECURITY.md) how to report a security problem.

Some comments and docs point at files in `../`, such as `../brief.md` or `../docs/…`. Those are the project's planning notes, which are kept outside this repo and aren't published.

## License

Lexicommons is free software under the GNU Affero General Public License, version 3 ([LICENSE](LICENSE)). If you run a changed copy for other people to use, the AGPL asks you to offer them its source.

- **The content** (language packs, lessons, word packs, grammar, pack notes and the word pictures) is under Creative Commons Attribution-ShareAlike 4.0 ([CONTENT-LICENSE.md](CONTENT-LICENSE.md)). When learners can share packs in Explore, what they share is CC BY-SA 4.0 too, and the app says so before anything is shared.
- Third-party parts keep their own licenses, in files beside them: the fonts (SIL OFL 1.1, `public/fonts/`), the flags (MIT, `public/flags/LICENSE`), the sound effects (`public/audio/fx/LICENSES.md`) and the libraries in `public/vendor/`.
- The Google and GitHub marks on the sign-in buttons belong to those companies, and this license doesn't cover them.

## Credits for the open content

- **How common each word is:** [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by Hermit Dave (CC BY-SA 4.0), counted from the subtitles of [OpenSubtitles](http://www.opensubtitles.org/), through OPUS's OpenSubtitles2018 (P. Lison and J. Tiedemann, 2016, "OpenSubtitles2016: Extracting Large Parallel Corpora from Movie and TV Subtitles", LREC 2016). The Knowledge page credits it where its numbers appear.
- **Word forms and lemmas:** [Wiktionary](https://en.wiktionary.org/) contributors (CC BY-SA 4.0), through kaikki.org's Wiktextract (Tatu Ylonen, 2022). Which lemma a form that can be two is: [UD Dutch Alpino 2.18](https://universaldependencies.org/) by Gosse Bouma, Gertjan van Noord and the Universal Dependencies contributors (CC BY-SA 4.0).
- **Books in the open library:** open books from [StoryWeaver](https://storyweaver.org.in/) (Pratham Books), [Global Storybooks](https://globalstorybooks.net/) and [African Storybook](https://www.africanstorybook.org/), [Bloom Library](https://bloomlibrary.org/), [Dutch Wikibooks](https://nl.wikibooks.org/)' Wikijunior and [Standard Ebooks](https://standardebooks.org/), each under its own license: CC BY 4.0, CC BY 3.0, CC BY-SA 4.0, CC0 or the public domain. The shelf keeps growing. Each book's full credit (author, illustrator, translator, license, source and any corrections) is in the library's catalog, and on the book's page in the app; the books a copy of this repo starts with are in `library/catalogue-seed.json`. For example, *Alice's Adventures in Wonderland* (the opening), by Lewis Carroll, is public domain, and its text is [Standard Ebooks](https://standardebooks.org/)' production, dedicated to the public domain (CC0 1.0); *The Tale of Peter Rabbit*, by Beatrix Potter, text and pictures, is public domain, from Frederick Warne & Co.'s first edition. A book's pictures are its illustrators', under the book's license. The help in English and the woven layers the library adds to its books are made for Lexicommons with an AI model and checked sentence by sentence, under CC BY-SA 4.0; each one's entry in the catalog names the model.
- **Recordings** of the Dutch starter (`public/audio/starter-word-order/`) and of Dutch's lessons (in the library): Emma and Ido, synthetic voices made with ElevenLabs for Lexicommons, CC BY 4.0.
- **The full translator:** Mozilla's translation models, the ones Firefox Translations uses, and bergamot, the runtime that runs them (`public/vendor/bergamot/`), under the Mozilla Public License 2.0. The models are in the library; Translate offers them as a download.
- **Speech on your device:** OpenAI's Whisper models (MIT), as Hugging Face's onnx-community converted them, run by transformers.js and ONNX Runtime Web (`public/vendor/`). They aren't in this repo: `npm run local -- speech` fetches them.
