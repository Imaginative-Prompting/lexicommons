# Speaking: the speech engine

Say a sentence, and the app checks it word by word. Two recognizers, and neither runs on our server or costs anything
per use:

- **The browser's own** (the Web Speech API). Chrome sends the audio to Google, unless Chrome has the language on
  the device; Safari sends it to Apple; Edge to Microsoft.
- **Whisper, in the app**, on the device's GPU through WebGPU (on the processor, through WebAssembly, where there's
  no WebGPU). Its model is downloaded once from this site and kept on the device. Nothing you say leaves the device.

The games call `public/js/speech/speech.js`; its header lists the API, the result, the states and the errors. Settings
→ Study → Say it chooses the recognizer and the model; `/design` → Recognizers shows all of it live.

## Files

| File | What it does |
|---|---|
| `public/js/speech/speech.js` | The API: `support`, `recommendedModel`, `modelState`, `downloadModel`, `deleteModel`, `prepare`, `wake`, `listen`, `unload`, `match` |
| `public/js/speech/match.js` | What was said against what was expected, word by word (pure; Node runs its tests) |
| `public/js/speech/browser.js` | The browser's recognizer |
| `public/js/speech/mic.js` + `capture-worklet.js` | The microphone: permission, recording until you pause, 16 kHz samples, a level meter |
| `public/js/speech/whisper.js` + `whisper-worker.js` | Whisper in a module worker (transformers.js), unloaded after 5 minutes unused |
| `public/js/speech/store.js` | Downloads in checked chunks, kept in Cache Storage (`lx-speech-v1`) |
| `public/js/speech/models.js` | The models and the runtime, pinned; read by the app and by `scripts/speech-build.mjs` |
| `public/js/speech/errors.js` | `SpeechError`: a code for the game, a sentence for people |
| `public/js/speech/guard.js` | What stops Whisper taking the app down twice, and whether this is a phone |
| `public/js/design-speech.js` | The `/design` section |
| `public/vendor/transformers/`, `public/vendor/ort/` | transformers.js 4.3.1 (Apache-2.0) and ONNX Runtime Web's WebAssembly loaders (MIT), vendored |
| `public/models/` | The models and runtime as chunks (gitignored, about 1.1 GB; `node scripts/speech-build.mjs` makes it) |

## The models

OpenAI's Whisper (MIT), as converted to ONNX by onnx-community on Hugging Face, each pinned to a revision.

| Model | Pack | Runs on | Graphs |
|---|---|---|---|
| `whisper-turbo` (large-v3-turbo) "Best" | 566 MB | WebGPU with 16-bit maths (`shader-f16`) | encoder q4f16, decoder q4f16 |
| `whisper-small` "Smaller" | 302 MB | WebGPU | encoder q4, decoder q4 |
| `whisper-base` "Basic" | 209 MB | WebGPU or WebAssembly | encoder fp32, decoder q4 |

Plus the runtime's WebAssembly: 27 MB (or a 14 MB build for Safari before 26 without WebGPU), downloaded with the
first model. `recommendedModel()` picks turbo on a computer where WebGPU has 16-bit maths (and the device doesn't
report 4 GB of memory or less), small on phones and tablets and on other WebGPU, base without WebGPU. Turbo's first
load froze an iPhone's home-screen app (26 Oct). The app's own pick (`study/speaking.js` `pickModel`) is your choice,
else the best model already downloaded, else the recommended one. The games and Settings → Speaking load Whisper
(`prepare`) before calling `listen()`, so the load never runs alongside the microphone prompt; they warm it up as a
speaking step or the Speaking page opens, and show a seconds count while it loads.

**Measured** (26 October 2026, Chrome 155 on an M-series Mac, WebGPU, before the fit rescue below). Recordings: the
starter deck's 13 sentences in two ElevenLabs voices, 28 single words, 26 wrong word orders (ElevenLabs), and the 13
sentences in macOS's Dutch voice.

| | turbo | small | base |
|---|---|---|---|
| Right sentences passed (26) | 26 | 25 | 21 |
| Single words passed (28) | 26 | 17 | 12 |
| Wrong orders written down as said (26) | 26 | 25 | 17 |
| Wrong orders passed as right (26) | 0 | 1 | 0 |
| macOS voice sentences passed (13) | 13 | 13 | 10 |
| Time per sentence, warm | 0.9 s | 0.45 s | 0.2 s (2.3 s on WebAssembly) |

- Small's one wrong order passed: it wrote "Hoe het gaat met je?" as "Hoe gaat het met je?". Its language model is
  strong enough to correct the order, even when scoring the sentence against the audio. Turbo writes it as said.
- **Wrong orders, measured again on 4 Nov 2026, with common short phrases said wrong** (`docs/design/retention/check-2026-11-04-word-order/`
  in the project): Chrome's recognizer, which everyone there gets by default, passed 9 of 86; small 3 of 146; turbo 0 of 120. Safari's isn't measured.
  Five of Chrome's nine passed only because the closest of its guesses was taken, so `match()` now treats any guess with exactly the
  sentence's words in another order as what was said (0 of 163 right or accented answers refused; `scripts/fixtures/chrome-guesses.json`).
  The rest can't be seen from here: the recognizer itself writes the right order. So a slip can still pass in Say it, and Speaking's settings say so.
- **A right sentence small refuses, left as it is:** `emma-zie-niet`, "Ik zie hem niet." comes out as "Ik zie er niet." in one recording, 0 of 10 runs (the
  other voice's passes 10 of 10). `speech-check` lists it as a failure on the full set.
- Single words are hard for Whisper in general: isolated, it often guesses ("Buk" for boek). A sentence, or the
  browser's recognizer, does better there.
- small on WebAssembly took 9.6 s per sentence, so without WebGPU only base is offered.

## How a recording is checked

1. **Recording** (Whisper): the microphone is opened without the browser's noise suppression, echo cancellation and
   gain control (Whisper was trained on unprocessed audio; with them on, it misheard one wrong-order recording it
   otherwise heard right, and nothing improved), and runs through an AudioWorklet. Speech starts at three loud blocks in a row
   (about 130 ms above three times the room's noise floor), and ends after 0.9 s of quiet. 300 ms either side are
   kept. A watchdog ends it on time even if the microphone stops sending.
2. **Recognizing** (Whisper): the audio is encoded once. The transcript is generated from that encoding, and the
   expected sentence is scored against the same encoding by teacher forcing: the log-probability of each of its
   tokens given the audio. It's scored as written, and with Whisper's capitals where the words agree ("Oma").
3. **Matching** (`match.js`, both recognizers): case, punctuation, accents, fillers (eh, ehm), numbers in digits
   ("23" = "drieëntwintig"), times, money and short forms ('t, m'n, we/wij) don't count, nor does which of a word's
   spellings was written: Cantonese's 畀/俾/比, 咗/左, 呀/啊 and 而家/依家 (`match.js` `SAME_WORD`, same word and sound
   only; Chrome wrote 畀 as 比 on 28 Oct), never a standard written Chinese word for a Cantonese one (他 for 佢). Words line up by edit
   distance, allowing a word heard as two ("open doen") or two as one. Each expected word comes out:
   - right;
   - close (one sound off in a short word, two in a long one);
   - order (said, but elsewhere: a word-order slip, including a separable verb kept together, "opbel" for "bel … op");
   - wrong (something else said in its place);
   - missing.
   It passes when every word is right or close and nothing extra was said. The browser's recognizer gives several
   guesses; the closest one counts.
4. **The fit rescue** (Whisper only): when the transcript doesn't pass, has no order slip, and the expected sentence is
   at most 1.5 (natural log) less likely than what Whisper wrote, with no doubted word's least likely token below
   -3.5, the sentence passes with the doubted words marked close (`match.how = "fit"`). This is for accents: Whisper
   writes "Ho God had met je" for an English-accented "Hoe gaat het met je", yet finds the real sentence just as
   likely. On the recordings above, no wrong word and no wrong order passes these thresholds on either model.
   Order slips are never rescued: a word-order mistake is always reported as said.

## Serving, storage and headers

- **`/models/` is served straight from static assets**: `run_worker_first` skips `/models/*` in `wrangler.jsonc`.
  Requests for static assets are free and unlimited, so a download never runs the Worker and costs nothing per use.
  It also means `/models/` isn't behind the site gate; it only holds public, MIT-licensed weights.
- **Chunks under 25 MiB** (Cloudflare's limit for one static file): 20 MiB pieces named by their SHA-256. Wrangler
  uploads only the ones Cloudflare doesn't have. Each pack's `manifest.json` lists its files and their chunks.
- **On the device:** chunks are fetched with `cache: "no-store"` (so the HTTP cache holds no second copy), two at a
  time with three tries each, and checked against their SHA-256. They're kept in Cache Storage `lx-speech-v1`, with
  `navigator.storage.persist()` asked first and the free space checked. Stopping keeps finished chunks. The worker
  rebuilds each file from its chunks and hands transformers.js the bytes through `env.fetch`; nothing is requested
  from anywhere else.
- **Service worker** (`public/sw.js`): never caches `/models/`, files `/vendor/transformers/` and `/vendor/ort/` in
  `lx-speech-v1` beside the model, and on activate deletes only older `shell-*` caches. The model and the libraries
  stay through app updates and work offline.
- **CSP:** `script-src 'self' 'wasm-unsafe-eval'`, which lets WebAssembly compile but allows no eval of JavaScript.
  The runtime's WebAssembly is handed over as bytes, and its loader is a same-origin module. HTML pages also send
  `Permissions-Policy: microphone=(self)`.

## Devices

- **iPhone:** an AudioContext only starts inside a press, so call `wake()` first thing in the handler, before any
  await. The microphone is let go after each recording (the indicator goes off, and iOS returns the speaker to full
  volume), unless `listen({ holdMic: true })`. While recording, Safari's audio session is set to play-and-record, then
  back to auto (`lx/audio-session.js`, the one place that sets it). Safari's own recognizer works in an app added to the home screen: the owner's phone used it for conversations there on 4 Nov 2026, against
  a 2021 report (WebKit bug 225298) the app had believed; bug 321436 reports it working on iOS 26.6 too. If it refuses, the error says so and the next press tries it again.
  It can also go quiet for good with no error and no end, after a sound has played or on a later dictation, until the app is reopened (bug 321436, iOS 26.6 to 27.2): so `browserListen` stops
  waiting after 20 s with nothing heard, or 3 s after a press to stop, keeps anything it had heard, and says to reopen the app (`deaf` in errors.js). Safari 26 has WebGPU.
- **Chrome:** the recognizer is handed our own microphone track (`start(track)`), so it gets the same permission
  errors and a level meter. Dutch on Chrome 155 on a Mac runs on Google's servers (on-device is "unavailable" for
  nl-NL). It's also what makes it testable: started plainly, Chrome's recognizer captures audio itself and never
  hears `--use-file-for-fake-audio-capture` (it reports no-speech after 8 s).
- **A language's tag:** the browser's recognizer is given the language's locale, except Tagalog: `fil-PH`, as Google
  and Microsoft document Filipino (`browser.js` `recognizerLang`). Chrome transcribed six Tagalog sentences the same
  under `tl-PH` and `fil-PH` (27 Oct, a synthetic voice), so the alias is for recognizers that know only `fil-PH`.
  Apple's recognizer has no Tagalog at all, so on Apple devices it's Whisper, which takes `tl`. Chrome's
  `available()` answers "available" for any tag, even a made-up one, so it can't tell which tag works. A locale is
  its registry language (`speech.js` `languageCode`): zh-TW is Traditional Chinese (zh-Hant), which Whisper isn't
  offered for, since it writes Simplified; the browser's recognizer (zh-TW) writes Traditional.
- **Chrome's languages:** for a tag Google's recognizer doesn't know, Chrome raises no error. It writes what it hears
  as English, so Say it would mark every answer wrong and record that as evidence. So Chrome is offered only for
  the languages in `browser.js` `GOOGLE_KNOWS`. Those were measured on 28 Oct 2026 by playing one Tagalog and one Dutch
  recording under every locale (the project's docs/speech-2026-10-28-recognizer-languages). Off the list then: Belarusian,
  Breton, Welsh, Esperanto, West Frisian, Irish, Scottish Gaelic, Hawaiian, Haitian Creole, Latin, Luxembourgish and
  Maltese, plus any language added since, until it's measured.
  - For those, on Chrome only (a recognizer with `available()`, not Edge), `browserSupport` says `none` with
    `unknownLanguage`.
  - Say it then uses Whisper if it's already downloaded. It never asks for a download for them (it says it's
    unavailable instead; the interim rule until the owner decides on Whisper's weaker languages).
  - Safari and Edge are as before: their own lists aren't measured yet.
- **Whisper's languages:** the 99 transformers.js lists (`speech.js` `WHISPER_LANGUAGES`, held to the vendored library
  by `test-speech-support.mjs`); it refuses to start in any other. For a language outside them (Irish, Scottish
  Gaelic, West Frisian and Esperanto among Lexicommons' as of 27 Oct), `support()` says Whisper is `none` with
  `unknownLanguage`, so the browser's recognizer takes over even when Whisper was chosen and downloaded, and with no
  recognizer either Say it says neither knows the language (`chooseEngine`'s `why`). Before, Whisper was judged by the
  device alone: chosen, it failed in the worker, and with no model it asked for a download that couldn't help.
- **GPU memory is released by hand:** a decoder pass's tensors stay on the GPU until they're disposed, and nothing collects them. Each pass left about 90 MB on Smaller, every spoken answer made two or three, and only the worker's 5-minute idle unload freed them; a long bench reached 59 GB of swap on a Mac before the GPU process died. `whisper-worker.js` `release` frees each pass's outputs and the encoder's, and `whisper-memory-check.mjs` holds it.
- **Memory, and what stops a crash twice:** Whisper small takes the page's own process from about 390 MB (Today with Translate's index) to about 2.1 GB once it's loaded, 2.2–2.5 GB at its peak, and back to about 400 MB when it's let go. Detecting a language and scoring add nothing to that, only time: 0.83 s a phrase in one language, 1.07 s detecting. Basic is about 1.6 GB, 1.8 GB at its peak, so a smaller model isn't the way out, and neither are the runtime's memory options tried (no CPU arena, no memory pattern, initializers on the device's allocator: no change). (4 Nov 2026, a Mac in Chrome, macOS's physical footprint; `../docs/design/retention/check-2026-11-04-translate-speech/` in the project.) A WebKit maintainer puts an iPhone's soft limit for a page at about 1.5 GB, past which the system may kill it when memory is short (WebKit bug 277848), and a page killed that way just reloads. So Whisper is what someone chooses in Settings, never the default on a phone. `guard.js` notes that it's in memory from before it loads until it's let go: if the app opens with the note still there, nothing starts Whisper by itself again on this device, and Settings → Study → Speaking says so, with Try Whisper again. A phone also lets it go after a minute unused, as the app leaves the screen, and in Translate after each phrase. A Whisper a phone had chosen before 4 Nov 2026 went back to the browser's once (`speaking.js`, `lx.whisper.phone-choice.v1`). **Not measured on a phone:** the iOS 26.4 Simulator's `requestAdapter()` answers null, so it can't run WebGPU either.

## Checks

```sh
node scripts/test-speech-match.mjs        # the matcher, case by case (exit 0 = pass)
node scripts/test-speech-browser.mjs      # the tag the browser's recognizer is given, per language, and the languages
                                          # Chrome's is offered for (GOOGLE_KNOWS) (exit 0 = pass)
node scripts/test-speech-support.mjs      # which recognizer Say it gets per language, Whisper's list (exit 0 = pass)
node scripts/speech-build.mjs             # vendor the libraries, fetch and chunk the models (needs npm and huggingface.co)
# End to end in headless Chrome, through the channel's GPU queue (from the channel repo root). Chrome's fake microphone
# plays each recording into getUserMedia (never out loud); every listen starts from a real click.
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "speech check" --kind stills -- \
  node 08-lexicommons/app/scripts/speech-check.mjs <baseUrl> <outDir> --models whisper-turbo,whisper-small --browser --set full
```

`speech-check.mjs`:
- downloads each model into a fresh profile and checks where its chunks landed;
- listens to every recording with each recognizer: right sentences must pass, and a wrong sentence must never pass
  (whether the order slip is named is reported);
- drives the `/design` demo by its buttons, with screenshots;
- fails on any console error or CSP violation.

It signs nobody in and writes nothing to the server, so it can run against the live site too.
