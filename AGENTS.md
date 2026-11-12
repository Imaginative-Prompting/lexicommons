# Lexicommons app: agent instructions

**Running your own copy? Read `docs/self-host.md`: `npm run local`. `wrangler.jsonc` and `npm run deploy` are the main site's; never use them for a copy.**

The Lexicommons web app: a Cloudflare Worker serving the PWA, passkey accounts, the OAuth-protected MCP endpoint, a
REST API for personal tokens, and signed uploads. Live at https://lexicommons.com (`lexicommons.app` redirects).
Planning and the owner's words live outside this repo in `../` (`../brief.md`, `../docs/plan.md`); those messages never
go into this repo, because it will be published open source.

**Phase: the app shell (26 Oct 2026).**
- Bones and piping are proven (`../docs/piping-2026-10-25/README.md`).
- The design system and its living page `/design` are built (`docs/design-system.md`).
- `/app/` is the real shell: four tabs, symbols only (Home, Study, Knowledge, Explore; once an AI is connected Settings → Appearance's switch can add AI before Explore). Read has no tab
  for now: it's Home's book card under Reading, whose heading's All books opens Read (`know/home-cards.js`: the book you're reading, opening as you scroll to it, else Read's own), as AI is a card there, under Your AI, when it has no tab; Knowledge's tab is What you know (`#know`), also behind Home's "All of it"; Practice lives in the AI section), with Study on the packs, Home and the Knowledge page built on the scheduler, and Explore the
  community section. Home's route stays `#today`.
- Settings is a menu of pages (`#settings/<page>[/<sub>]`): Settings → Study and Games, where each way of studying
  has its own settings (`public/js/study/settings.js`), Sound and speech (`#settings/voice`), and the rest. A first run (`shell/welcome.js`) asks
  which language you speak (the phone's own first, none assumed), then what you want to learn, before anything else; both are kept per
  device. The language you speak sets the app's words where the app has that language (Settings → Language: I speak, App language, Grow;
  `shell/interface-language.js` keeps and applies them, `shell/interface-rules.js` is their rules, pure).

## Commands

```sh
npm run local [-- --detach | --port <n> | stop | admin [--user <id>] | speech | remove [--yes]]
                                          # a copy on this computer (scripts/local.mjs; docs/self-host.md): its state in .state-local/, all
                                          # storage through wrangler --local
node scripts/test-local-copy.mjs          # its rules: it can reach only this computer's storage, row changes, the merge keeping an admin's
                                          # changes, and library/ + packs/ through the app's own checks (exit 0 = pass)
node scripts/local-copy-check.mjs http://localhost:<port> <outDir> [--admin-command "npm run local -- admin"]
                                          # a running copy as a new learner, in Chrome on a phone screen: sign-in offers only what works,
                                          # lesson 1's first step, Translate, Read's books and pictures, Explore, no store to connect, its
                                          # own MCP address (exit 0 = pass)
node scripts/storage-rows-check.mjs http://localhost:<port> <outDir> --expect "Google Drive,Dropbox,OneDrive"
                                          # Settings → Sync across devices on the main config: the same rows at the first frame and every frame on a slow
                                          # connection, with a control that can fail (exit 0 = pass)
node scripts/test-owner-name.mjs        # the owner's name is in no text file of this repo, tracked or about to be (exit 0 = pass)
node scripts/test-owner-words.mjs [--require-brief]   # the owner's words aren't either: no run of 8+ words shared with ../brief.md (less
                                          # ../docs/self-host/history-rewrite/allowed-runs.txt), and no comment or Markdown line attributing words
                                          # to the owner; each part with planted controls; a copy with no brief runs the second part only, unless
                                          # --require-brief (the freeze passes it) (exit 0 = pass)
node scripts/whisper-memory-check.mjs http://localhost:<port> <outDir> [--model whisper-small] [--answers 20]   # Whisper's live GPU bytes across answers (transcribing, detecting a language, scored) must stop growing, and answers must stay the same; through gpu.py's queue; refuses under 50 GB free; deletes its profile (exit 0 = pass)
node scripts/no-ai-check.mjs http://localhost:<port> <outDir>   # the app with no AI, in Chrome on a phone screen: a fresh account has no
                                          # AI tab, and every link outside the AI section, a whole session, Home, Know, Read and every
                                          # pack off name no AI and offer no ask menu. Then the AI section: calm with nothing connected,
                                          # the tab and the request kinds once an AI is. One part outside the section may name an AI to
                                          # everyone: Read's Weave your own ([data-part="weave-your-own"], read/weave-own.js: the reader's
                                          # main use needs one), its own lines whole and only there, with planted lines both ways. On a server with the catalog seeded, so the walk
                                          # reaches packs and books (`docs/design/ai-section/`, exit 0 = pass)
node scripts/everyone-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # community actions by ordinary accounts, in Chrome:
                                          # Ask for it through the terms, Share, Suggest a fix, Flag it, Answer, Suggest a pattern; what the
                                          # admin sees before and after a report over MCP, and what's readable with no account. LOCAL only,
                                          # a fresh state, --var COMMUNITY_SHARING:everyone (wrangler.jsonc's own is "admins") (exit 0 = pass)
node scripts/test-sharing-switch.mjs      # COMMUNITY_SHARING, the one switch for what a learner puts in front of others (community.ts sharingOpenFor), on the
                                          # real migrations: each call that publishes (a pack or a book shared or updated, a request posted, answered, opened
                                          # again, "me too", a fix, a flag, a grammar suggestion) refused for a learner at "admins" with nothing written, an
                                          # admin's going through, the learner's same call going through at "everyone"; what stays open at "admins" (likes,
                                          # adding, reports, withdrawing, closing, the terms); /api/me's mayShare; MCP's list (exit 0 = pass)
node scripts/sharing-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --sharing admins|everyone
                                          # the same over HTTP and MCP on a server started with that value (wrangler.jsonc's own, "admins", with no --var):
                                          # every route that publishes a 403 in words for a learner with D1 unchanged and an admin's 200 (or the learner's
                                          # 200 at "everyone"), what stays open, /api/me's mayShare, tools/list for a learner's and an admin's token, a call
                                          # to a tool that isn't listed refused; LOCAL only, a fresh state (exit 0 = pass)
node scripts/test-feature-flags.mjs       # the site's switches (src/flags.ts) on the real migrations: for each, a learner and a moderator refused, an admin's
                                          # change in the env every request runs on (sharing, the plan, a key of your own, Apple) and back to the default; the
                                          # plan and Apple refusing to turn on without their secrets, and a stored on staying off once they go; wrong values and
                                          # names; the value in effect changing and logging nothing; the admin log; another isolate's write within FLAG_TTL, D1
                                          # failing keeping the last values for FLAG_STALE then the deploy's (closed), but SIGNUPS' "paused" held while D1 can't be
                                          # read (holdWhileUnread; sharing's fallback its control), asked once a FLAG_TTL, and an admin's
                                          # change on values it couldn't read failing, never "already that"; an admin's previews (withPreviews): a learner's cookie ignored, an admin's
                                          # changing their own request alone (the plan shown, never offered), nothing stored or logged, the page's words
                                          # plain (exit 0 = pass)
node scripts/flags-check.mjs http://localhost:<port> <outDir> --persist-to <dir>
                                          # the same over HTTP and MCP on a server with wrangler.jsonc's own values: a learner refused everywhere and their
                                          # preview cookie ignored; the app's site-wide write gone; an admin's previews (sharing, the plan's pages with Checkout
                                          # refused, a key of their own) changing their own requests and no one else's, Apple refused in plain words, all off at
                                          # once; the director's switches over MCP and REST reaching a learner (at once on its one isolate; every isolate within
                                          # FLAG_TTL, a minute); the admin log; LOCAL only (exit 0 = pass)
npm install
npm run typecheck                         # tsc --noEmit; must exit 0 before any deploy
npm run deploy                            # typecheck, then wrangler deploy (sandbox off; CLOUDFLARE_ACCOUNT_ID=3eab77e293bf5fdf0baadff8d90377a5)
npm run db:migrate                        # apply migrations/ to the remote D1 (never edit an applied migration; add a new one)
scripts/build-static.sh                   # re-vendor the passkey library, copy fonts, render icons into public/
node scripts/build-icons.mjs              # the icons from their SVG sources in public/icons/ (the ink drop's: app-icon, maskable,
                                          # icon.svg the tab icon, badge, startup) and the iOS launch images with their tags in
                                          # index.html and app/index.html (build-static.sh runs it; needs rsvg-convert, magick).
                                          # startup.svg is the splash's first frame, written by the rig's splash/app-frames.mjs
node scripts/icons-check.mjs              # every page's icon links (existing, through the gate), the manifest's icons and the
                                          # maskable safe zone, the alpha-only badge, every launch image at its size with two tags (exact, then
                                          # iOS 27's fallback: WebKit bug 326500 reads device-height as Safari's window height), each device taking
                                          # only its own image on a correct engine and at iOS 27's window heights, where the exact tags alone take
                                          # none (exit 0 = pass)
scripts/smoke.sh                          # live checks: gate, .app redirect, MCP discovery, OAuth metadata (exit 0 = pass)
node scripts/test-css-safety.mjs          # custom-CSS safety check vs 30 bypass attempts (exit 0 = pass)
node scripts/test-look-rules.mjs          # the look rules the app, server and MCP share (exit 0 = pass)
node scripts/test-speech-match.mjs        # the speech matcher, case by case, and forgiving typing (lang/index.js withoutAccents:
                                          # accents and the letters a keyboard may lack, đ ø ß ł) (exit 0 = pass)
node scripts/test-hesitations.mjs [<app dir>]   # a word the sentence says is never dropped as a hesitation (speech/match.js FILLERS: um, uh, oh
                                          # and the like dropped only beyond the sentence's own uses of each, the last ones heard kept): every pack's
                                          # sentences with such a word (Portuguese's um, German's um, Dutch's Oh,) right typed and said exactly; a hesitation
                                          # the sentence hasn't got still dropped, a doubled one dropped to its count, the word left out still missing; another
                                          # copy's dir to see it fail on one from before (exit 0 = pass)
node scripts/test-speech-browser.mjs      # the tag the browser's recognizer is given per language (Tagalog as fil-PH,
                                          # every other its own locale), and Chrome's only for the languages Google
                                          # really knows (browser.js GOOGLE_KNOWS, measured; a new language isn't on it
                                          # until measured: ../docs/speech-2026-10-28-recognizer-languages) (exit 0 = pass)
node scripts/test-recognizer-mic.mjs [<app dir>]   # who opens the microphone for the browser's recognizer (speech/browser.js takesTrack; speech.js listen),
                                          # all stood in: a computer's Chrome on our track with the meter; Android's Chrome never (it recognizes through Android's
                                          # own service: with our microphone open beside it a learner's meter moved and nothing was heard), started plain, its bars
                                          # drawn from what the recognizer says it has (speech.js heardBars), flat until then; a listen on our track ending
                                          # no-speech with a voice on our meter making the device open none from then on (a quiet room its control); Safari as
                                          # ever; another copy's dir to see it fail on one from before. Only a real Android phone shows that it then hears (exit 0 = pass)
node scripts/test-speech-support.mjs      # which recognizer Say it gets per language (speaking.js chooseEngine): Whisper only
                                          # for the languages it knows (speech.js WHISPER_LANGUAGES, held to the vendored
                                          # transformers.js list), else the browser's, else "unsupported" and why; Translate's
                                          # (chooseDictation) by device, what's downloaded and what's chosen; Whisper stopped (exit 0 = pass)
node scripts/test-speech-track.mjs        # Tinta's mouth on what the app says: every starter's words as mouth shapes (by their
                                          # readings), the track at the recordings' word times (and a late one failing),
                                          # a recording's loudness, a device voice's estimate and boundaries, voice.js
                                          # announcing a sound to character/speaking.js (exit 0 = pass)
node scripts/test-voices.mjs              # this device's voices per language (study/voice.js, a stand-in speechSynthesis):
                                          # Mandarin never takes Hong Kong's or Macau's Chinese voices (Cantonese), Tagalog
                                          # takes fil-PH's; the rule is lang/index.js voiceSpeaks (exit 0 = pass)
node scripts/test-word-recordings.mjs [<app dir>]   # a word as a game shows it said by its recordings (study/voice.js wordRecording, speakWord,
                                          # speakTapped, hearsWord, joinState), nothing played: a pack records words by their dictionary form, and a noun
                                          # shown with its article plays the article's clip then the noun's, in one voice; a word in capitals its clip in
                                          # small letters; anything else the device's voice, whole (an iPhone's silent switch silences that voice, not a
                                          # recording); a clip failing mid-pair leaves only the rest to the device; stop() between the two. With the second
                                          # element unlocked and each clip's sound read from its samples, the two joined as said together: the article
                                          # from its first sound, the noun waiting at its first sound and started just before the article's last ends
                                          # (the join's gap measured, joinState), in turn when a clip's sound can't be read; another copy's dir to see it
                                          # fail on one from before (exit 0 = pass)
node scripts/test-audio-session.mjs [<app dir>]   # the page's audio session has one owner, lx/audio-session.js: no other file under public/
                                          # names navigator.audioSession (its scan has a control), and its uses (the microphone:
                                          # play-and-record; else auto); another copy's dir to see it fail on one from before (exit 0 = pass)
node scripts/test-mic-grant.mjs [<app dir>]   # how often the microphone asks in one launch (speech/mic.js), an iPhone's WebKit played as measured on
                                          # an iOS 26.4 Simulator: the Home Screen app asks again on every launch (WebKit keeps no grant across them,
                                          # bug 327237), and some launches forget it between recordings; once a launch shows that ("prompt" after a yes,
                                          # or a getUserMedia slow enough to have asked), its stream is kept with its tracks off until the app is hidden;
                                          # a launch that keeps its grant, a Safari tab and Chrome stop every recording's tracks as before; another copy's
                                          # dir to see it fail on one from before (exit 0 = pass)
node scripts/audio-session-check.mjs <outDir> [--engines chromium,webkit]   # after a celebration, in Chromium and WebKit with a stand-in
                                          # audioSession: the summary's sound plays (lx/sound.js, after a press), then voice.js's element and the device's voice never start
                                          # under "ambient"; the microphone play-and-record while open, auto after; serves the app's files
                                          # itself, muted; through gpu.py's parallel lane (exit 0 = pass, 2 = a stage not reached)
node scripts/test-sound.mjs               # sound effects (lx/sound.js, lx/sound-kit.js) with Web Audio, fetch and the page stood in, nothing played:
                                          # the kit table (Match's steps, tiles in turn), where a sound starts and when it has passed, nothing before
                                          # the kit or a press, the context made ahead outside any press (in the app's first frame after it's ready,
                                          # not waiting for the kit) and a press only waking it (resume() inside it; a press before that makes it), the duck under speech (30 %, 60 ms down, 200 ms up), a celebration waiting for words
                                          # being said, the switch and its sync kind, the old celebration switch carried over (exit 0 = pass)
node scripts/sound-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit]   # sound effects in the real app, muted, a new
                                          # account on a phone screen: the Sound effects switch (on by default, saved as a choice to sync), every
                                          # role's request told; before the kit none plays and no file is asked for, with it every file is fetched
                                          # once and decodes in this engine; LOCAL only; through gpu.py's parallel lane (exit 0 = pass)
node scripts/test-sample-learner.mjs --list <frequency.nl.json>   # the sample learner (Settings → Admin, an admin's; study/sample-mode.js): each preset's
                                          # learner from the real path and word packs (the same preset the same learner; every row and record the app's; days
                                          # with gaps, sessions of many sizes, reading, listening and talking; the done log matching the evidence; read back by
                                          # summary.js: about its words known, some slipping, the streak alive, an idea answered 50 times at 85% Strong or Solid,
                                          # answer by answer as its control); the mode in a child process with every store and
                                          # the network stood in (only the sample's stores written, nothing sent: sync, the study record, reminders, errors, the
                                          # practice room, clears), its control with the switch off and four planted guards caught; no module naming one of its
                                          # stores but through sampleKey/sampleDb (one exact line excepted, its reason beside it: NAMED_LINE); Off leaving the
                                          # person's keys as they were (exit 0 = pass). A change that reads or writes a localStorage key runs it before landing
node scripts/test-try-stores.mjs [<app dir>]   # the try-out's stores (study/sample-mode.js demoPage, sampleKey, sampleDb): the page's address alone decides,
                                          # never a stored switch: /try/ its own (lx.try:…, ….try) whatever the sample learner's switch says, /app/ never, an address
                                          # that only starts like it not it; clearDemoStores exactly its own, and any other page's start clearing what a try-out left;
                                          # error reports out from it (not from the sample learner); the first run's done and language through sampleKey; another
                                          # copy's dir to see it fail on one from before (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "try check" --kind parallel -- \
  node 08-lexicommons/app/scripts/try-check.mjs http://localhost:<port> <outDir> [--only <regex>]
  # trying Lexicommons with no account (/try/: try/main.js, session.js tryOut, packs.js on /try/), by real presses: a visitor on a phone (the
  # quiet band, the first run's chooser, Dutch's lessons 1 and 2 with summaries that promise nothing more, the end card's two buttons one width;
  # nothing asked of /api/ but error reports, nothing of /login; only the lessons' packs fetched; only the try-out's own stores kept, a planted
  # real key caught first); a signed-in learner on the same browser (every progress store as it was, "Go to your app", the try-out's keys gone at
  # the app's start); a computer (the chooser's columns, the cross partway bringing the end card); each full course's lesson 1. LOCAL only (exit 0 = pass)
node scripts/sample-learner-check.mjs http://localhost:<port> <outDir> [--admin-command "node scripts/local.mjs admin"]   # the sample learner in the
                                          # real app on a phone, as an admin with studying of their own: Admin's row and sheet, each preset by a real tap (timed),
                                          # pictures of Home, Knowledge's cards, Study and the path at 390, the mark on every header and at 320, a reload keeping
                                          # it, no request out while it's on, Off putting every IndexedDB store and progress key back to its hash from before, Sign
                                          # out turning it off; LOCAL only, a copy with Dutch's lessons, word packs and frequency list (npm run local); through
                                          # gpu.py's parallel lane (exit 0 = pass)
node scripts/test-themes.mjs              # the ready-made themes (lx/theme-presets.js: general, a language's motif, its flag), by the numbers: each one's contrast pairs
                                          # (the inks on every surface and on its own backdrop, the way forward, the tab, right/wrong/slipping on the canvas and their
                                          # tints, the focus ring), Tinta's ink (his edge and his eyes, in one of its accents' hues) and progress's (3:1 on its three grounds, in his hue), right and wrong at least 0.12 apart in each kind of color blindness, wrong at least 0.1 (OKLab) from the way forward and from slipping, a red
                                          # way forward with white words at 4.5:1 in its accent's hue, studied by lightness alone, a
                                          # flag theme for every flag lang/flags.js names, one per flag (build-flag-themes.mjs --check), a tile's stand-in the theme's own
                                          # canvas, hairline and backdrop, ids and names, every offered theme's tile picture, an avatar's ring (--ink-2) on a lit or pressed
                                          # row (--fill-active) at 3:1, the sidebar's lit tab on that fill (its words' and symbol's tokens read off lx/redesign.css: words
                                          # 4.5:1, symbol 3:1); each rule catches a plant first (exit 0 = pass)
node scripts/test-woven-tint.mjs          # the reader's tint on woven words (reader.css --reader-woven): the theme's --go toward its ink, 4.5:1 on the
                                          # canvas in Graphite and every ready-made theme, with an unmixed control that fails (exit 0 = pass)
node scripts/build-motif-themes.mjs [--check]  # where each motif theme's scene is cut from its picture (public/themes/motifs/<id>.webp, 1290 × 2796, its
                                          # top its palette's canvas exactly): the nearest row with no art 12 px above where its art begins, into
                                          # public/js/lx/theme-motifs.js; run it after a picture changes
node scripts/build-flag-themes.mjs [--check]   # each language's flag's colors and their shares, read off public/flags/4x3/<code>.svg (sharp), and each
                                          # flag's palette (theme-presets.js flagPalette), into public/js/lx/theme-flags.js: run it after a flag,
                                          # lang/flags.js or flagPalette changes
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "theme tiles" --kind parallel -- \
  node 08-lexicommons/app/scripts/build-theme-tiles.mjs http://localhost:<port> [--only <id,id>]   # each ready-made theme's tile for Settings → Appearance:
                                          # the app's own Home in it, cropped to its top (header, Translate, the Practice card), the date and the header's language hidden (a
                                          # motif theme's Home at its end, cut to its scene's foot, the tab bar hidden), into
                                          # public/themes/tiles/<id>.webp and tiles.json; run it after adding a theme or changing Home's top; LOCAL only
node scripts/test-quiet-browser.mjs [--browser]
                                          # no check makes a sound or launches the owner's Chrome: every script's browser comes
                                          # from quiet-browser.mjs (Chrome for Testing, muted, speechSynthesis silenced, Web Audio
                                          # at zero volume); a launch that would reach the machine owner's own Chrome fails with nothing started;
                                          # --browser proves it with a real launch and what macOS lists (through gpu.py's
                                          # parallel lane) (exit 0 = pass)
node scripts/install-check-chrome.mjs     # the one Chrome checks run on: Chrome for Testing at the pinned version, under
                                          # ~/.local/share/chrome-for-testing/ (sandbox off; downloads Google's zip and checks
                                          # its pinned hash)
node scripts/test-practice.mjs            # Practice with your AI: the protocol, grades → evidence (exit 0 = pass)
node scripts/test-practice-room.mjs       # the practice room (src/practice.ts) in plain Node, cloudflare:workers stood in and its SQLite on node:sqlite:
                                          # an in-app practice can't be ended or summarized over MCP, a practice request isn't taken while one goes
                                          # on; an AI's own practice ended, and a request taken with nothing going on, as controls (exit 0 = pass)
node scripts/test-billing.mjs             # the paid plan's server side (src/billing.ts) on the real migrations, Stripe played in memory: the webhook's
                                          # signature (every way wrong; a right one passes), Checkout with no trial (promotion codes, the card always taken), a
                                          # trial set by hand once per account and once per card (a reused card's subscription canceled before any charge), each
                                          # event once, a subscription always read from Stripe (a late
                                          # event takes nothing back), failed payments, the read-only month, refunds, disputes, other accounts' customers
                                          # refused, a Stripe failure handled on the next delivery, deletion ending the plan first, the export (exit 0 = pass)
STRIPE_SECRET_KEY=… node scripts/billing-promo.mjs create <CODE> --max <n> [--expires YYYY-MM-DD] | list | stop <CODE> [--live]
                                          # first-month-free promotion codes for the plan (one "First month free" coupon, 100% off once; each code with
                                          # a redemption limit, new customers only), entered at Checkout; the key from the environment only, a live key
                                          # only with --live
node scripts/test-ai-hosted.mjs           # the in-app AI on the plan (src/ai-hosted.ts) on the real migrations, OpenRouter played in memory: who may call it
                                          # (not offered, no plan, held, the trial's allowance), what a request carries (ZDR, no data collection, low effort,
                                          # an opaque tag, nothing the device sends but which practice), the stream metered even when the device leaves, the
                                          # month's allowance, one call at a time, a stale turn, a cost from OpenRouter's record or the worst case, a refusal
                                          # costing nothing, a dead call charged then put right, the month's end, no words in the ledger (exit 0 = pass)
node scripts/test-inapp-ai.mjs            # the in-app AI's pure parts (ai/inapp.js; practice/guide.js, the one guide your own AI and the in-app AI
                                          # read): what a request carries and never carries, a stream split anywhere, lines shown the moment they're
                                          # whole, a reply checked as your AI's is, Translate with AI's request and check; each with a control (exit 0 = pass)
node scripts/test-evidence.mjs            # the evidence rules: grades, exposure, which units an answer counts for (exit 0 = pass)
node scripts/test-activity-names.mjs      # what a word's History calls each activity a session records (know/activity-names.js): every kind progress.js
                                          # TESTS lists, the reader and each talk with your AI named, never its id; a game by plan.js GAMES' own name; every
                                          # string an `activity:` is given under public/js named; the names from before, a kind with no name and a planted
                                          # literal its controls. A new game or activity names itself here in the same landing (exit 0 = pass)
node scripts/test-study-settings.mjs [<app dir>]   # how you like to study as a device reads it back (study/settings.js load): What does it say?'s
                                          # word-for-word line with the answer on by default from version 2 (9 Nov 2026), its hint off; a device that saved
                                          # before then (the line off with every save, though no one chose it) has it on once, its other settings and its hint
                                          # as they were; turned off from version 2 on, it stays off through a reload; another copy's dir to see it fail on one
                                          # from before (exit 0 = pass)
node scripts/test-back-buttons.mjs [<app dir>]   # every way back is the one floating glass back (ui.backButton): the back chevron drawn
                                          # anywhere else, a button or row given it, or an app-back built by hand fails; another copy's dir to see it
                                          # fail on one from before (exit 0 = pass)
node scripts/test-parts-listed.mjs [<app dir>]   # every part the app builds is on the theming surface (lx/parts.js PARTS), read from the code (el()'s
                                          # part, "data-part", dataset.part, setAttribute, markup, an options default; the rig's motion parts aside, comments
                                          # not counting), so a part on a screen /design doesn't draw can't go out unlisted (v675's reader-turn-button did);
                                          # design-check then holds every listed part to /design. A part a stylesheet styles is built or listed. Its OWED and
                                          # OWED_DEAD lists (11 Nov 2026) only shrink; planted parts first; another copy's dir to see it fail (exit 0 = pass)
node scripts/test-history.mjs [<app dir>]   # the browser's history has one owner, the router (shell/main.js, "back: one rule"): no other file
                                          # under public/ pushes, goes back or forward, or replaces an address without keeping history.state (an entry
                                          # replaced with null was taken for a new one when a back reached it); planted controls; another copy's dir to
                                          # see it fail on one from before (exit 0 = pass)
node scripts/test-no-stray-text.mjs       # no "null" on a screen: read by TypeScript's parser, no append, prepend, replaceChildren, before, after or replaceWith
                                          # on a node is handed what can be null, undefined or false, and no el() child can print a 0 (exit 0 = pass)
node scripts/test-typing-fields.mjs        # fields where the keyboard must leave what's typed alone: every el("input" | "textarea") under public/js with a `lang`
                                          # (words in a language) or type "search" sets autocorrect "off", spellcheck "false" and autocapitalize "off" ("sentences"
                                          # for a whole sentence); iOS offered "kiddie" for "koffie" with spellcheck alone; plants first (exit 0 = pass)
node scripts/test-refusal-words.mjs       # what the sign-in pages say when the server refuses (public/js/refusal-words.js; login.js, login-recover.js): its
                                          # words, never a bare code (cross_site showed on an iPhone); every code src/ sends, the old rule as the plant (exit 0 = pass)
node scripts/test-pile-drop.mjs [<app dir>]   # the Words card's pile (know/pile.js layOut, as know/cards.js drops it in each visit): at 50 to 2,500
                                          # words, a pile laid out with a seed of its own never has two tiles overlapping (each a turned rectangle) nor one
                                          # past its walls or floor; two seeds two piles, the same seed the same; 2,500 laid out in a few ms; no tilt: nothing
                                          # under public/ listening to the phone's tilt or motion or asking to, no physics engine shipped (a planted listener
                                          # caught first; the app from before fails it) (exit 0 = pass)
node scripts/test-word-index.mjs --list <frequency.nl.json>   # the word index (know/word-index.js) on the sample learner's year: what it says
                                          # (understood, started, first met, levels, Over time's stretches) equal to the evidence worked out from scratch,
                                          # now and months on, after answers (only the units touched worked out again), a sync's rows from before, a clear
                                          # and its Undo, and from a kept snapshot (a stale one never used); knownUntil to the millisecond; a stretch planted
                                          # a millisecond off caught; reads under 5 ms, an answer's update under 2 ms (exit 0 = pass)
node scripts/test-pack-known.mjs          # how much of a pack you know, for Explore's bar (study/pack-known.js packKnown, study/pack-words.js): its own
                                          # words (a word pack's gap words, a pack with lessons its lessons' words), known by know/word-index.js isUnderstood (exit 0 = pass)
node scripts/test-learn-senses.mjs        # which of a word's senses a sentence uses (study/learn-senses.js), for the sentence's words in an answer's drawer: the
                                          # senses of its gloss its word-for-word line has (naar in "Tomorrow go we to grandma" is "to, toward"), a word another
                                          # word's one sense takes not counted twice, the longer of two the line has; cases each with a control, then the real
                                          # Dutch packs: one sense at least 85 times in 100, none under 8, never a sense not its own; a lesson's drawing
                                          # (pictureFits) fitting its own sentences and not a word pack's card of another sense (halen, stuk, band,
                                          # kaart), nor a card whose word has a one-sense gloss of another sense than the lesson's (de zu "to", es
                                          # que "that"); a lesson whose English is HAVE, BE or "no" alone (the word-for-word line writes their every
                                          # use alike: learn-senses.js usesIn) only beside a sentence whose English uses it as the lesson's own do,
                                          # real sentences of each kind (possession shown; the perfect, age, hunger, a must, there is, ru нет's
                                          # "there isn't", быть's was/will hidden), each one today's gate shows (exit 0 = pass)
node scripts/test-reword.mjs              # whether a sentence's English rewords it (study/reword.js rewordingOf): another word ("like" for
                                          # "graag") is one, with the word-for-word line in English order and the note on how English differs;
                                          # order, the little words English adds, contractions and endings aren't; the path's share (exit 0 = pass)
node scripts/literal-ok.mjs [--check]     # public/js/lang/literal-ok.nl.js (the word-for-word lines a game takes too) from the judged lines,
                                          # scripts/fixtures/literal-judged.nl.json; --check: exit 0 when it's what they give
node scripts/test-gap-marks.mjs           # a gap's marks (study/gap-marks.js): a closing mark after the gap and an opening one (Spanish's ¿ ¡) before
                                          # it, neither in a choice, Dutch's 's whole; every pack's gaps round trip, none with an opening mark in Dutch, the
                                          # session player's choice (fixtures/step-text.mjs fillChoice) the game's; the rule from before (closing marks only)
                                          # its control (exit 0 = pass)
node scripts/test-literal-line.mjs        # a literal line's capitals in English order (lx/literal-case.js): the chunk that
                                          # leads takes the capital, the old first gives it up unless "I" or a name (exit 0 = pass)
node scripts/test-streak.mjs              # the streak (know/streak.js): 4 am days, rest days, mending, pauses, days from
                                          # before the log, the synced records; the log (study/done.js): a session, 5
                                          # minutes of reading, a conversation, another device's records; what a finished
                                          # session celebrates (know/celebrate.js): today counting, day 1, mending, a rest
                                          # day, milestones, never a loss word (exit 0 = pass)
node scripts/test-streak-days.mjs         # the streak page's year and a day of it (know/streak-days.js): the months from the first day known, a year at
                                          # most, newest first, Monday first; a mended day a rest day, a missed day plain (never "missed"); a day from 4 am;
                                          # a day's words and ideas only those known well at its end and not its start, with evidence that day, in its
                                          # language (a control that a rule asking only about the end fails); lessons by title, sessions, minutes, talks; the
                                          # parts the page slices it into adding up to the same, each unit's start asked first (exit 0 = pass)
node scripts/test-install.mjs             # (also where progress is kept, shell/keep-rules.js: the lines an iPhone's browser, another app's browser and
                                          # the Home Screen app opening empty get, once, in the first run and on the first summary; apps' own
                                          # browsers by their user agents, an iPhone app's plain web view by its missing "Safari/"; and that
                                          # those lines are gone once the server keeps an account's progress, /api/account/sync)
node scripts/test-install.mjs             # Add to Home Screen (shell/install-guide.js): which device and browser a real user
                                          # agent is (iPhone/iPad Safari before and after iOS 26, Chrome, Firefox, Edge, apps'
                                          # own browsers, Android's, a computer's), and every device's steps (exit 0 = pass)
node scripts/test-tinta-ink.mjs           # Tinta's ink as a theme's (character/ink.js; the --tinta-* tokens): with none set every palette today's, color for
                                          # color (by hand, its control) and the rig's own object; --tinta-ink alone making the whole ink by today's offsets in
                                          # OKLCH, a token beside it winning, two inks mixed in OKLCH; no Tinta file naming an ink color but the rig's palettes
                                          # and splash.css's splash and fallbacks (planted ones caught first); firsts.js's key the scheme alone with none set;
                                          # publishInk only while one is (exit 0 = pass)
node scripts/test-tinta-sharpen.mjs       # a breathing Tinta's sharpening track (character/sharpen.js): shown at 1 at its start, its end (finish(), a
                                          # seek past it) and every point up to 30 years in, 1.5 among its keyframes (Chromium rasters him at it),
                                          # made only by character.js's sharpen(this), never handed to lx/motion.js, Chromium's alone; each rule
                                          # catches a plant first (the keyframes from before end at 1.5) (exit 0 = pass)
node scripts/test-empty-states.mjs        # every empty state shows Tinta in a pose for its words (ui.emptyState), but
                                          # loading, error messages and the reader's; every empty plan names its pose (exit 0 = pass)
node scripts/test-check-waits.mjs         # every check can fail where it waits: no waitForFunction with an async predicate, or one
                                          # handing back a promise (import(…).then, fetch, caches), in scripts/ (Playwright resolves
                                          # it at once; poll inside page.evaluate); a plant of each form first (exit 0 = pass)
node scripts/test-play-session.mjs        # the one session player every check plays sessions with (scripts/fixtures/play-session.mjs: each step by
                                          # its kind as the session records it, never its words): a handler for every game in plan.js's GAMES, every kind
                                          # of step session.js draws and every game a deck's card is played as, so a new game fails here, not in five checks
                                          # quietly; give it its handler in the same landing; each rule catches a plant first (exit 0 = pass). A check that
                                          # presses a summary's Done calls its pastReminderAsk next: an account's first Done brings "Want a reminder?" as a step
                                          # of its own, once, and that presses its Not now
node scripts/test-anki.mjs [--decks <dir>]  # reading Anki files (public/js/anki/), on files scripts/fixtures/anki-decks.mjs writes: every generation of the
                                          # format (collection.anki2, .anki21, zstd .anki21b, .colpkg), cloze, sound, which side is which, the games each card
                                          # carries, the pack check's every refusal; script and markup in every field and template, a deflate bomb, a zstd bomb,
                                          # a frame asking for 2 GB, a damaged database, notes as a view that never ends, a deck too huge; --decks: real
                                          # decks from a folder kept out of the repo (exit 0 = pass)
# public/sound-test/ (with its row in Settings → Admin, for an admin) is temporary too: which of the app's sounds an iPhone plays with its silent switch on, in
# the Home Screen app, and which stop other apps' music; each answer goes to /api/notes ("sound-test <run> <test> heard=… music=…"). It comes out once it has answered.
node scripts/sound-test-check.mjs <outDir> [--engines chromium,webkit]   # that page, muted: every test plays to its end with no error, and each answer
                                          # reaches /api/notes in that form (exit 0 = pass)
node scripts/test-site-pages.mjs          # the public home page's words (public/index.html) against its catalog (js/i18n/en/site.js): every piece
                                          # of text keyed (data-t, data-t-alt, data-t-content, data-t-label for a video's or button's aria-label) and saying its
                                          # key's English, its numbers as js/site-facts.js has them, every key on the page; js/site.js puts a shipped locale's
                                          # words in by key; each rule refuses a plant (exit 0 = pass)
node scripts/site-facts.mjs [--check | --compare]   # the home page's numbers (languages, each path's lessons and a full course's, pictures: public/js/site-facts.js,
                                          # the one place they're kept) written into its words; --check exit 1 while they disagree; --compare this
                                          # repo's own counts beside them. Set the facts at a release, then run it
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "site clips check" --kind parallel -- \
  node 08-lexicommons/app/scripts/site-clips-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit]
                                          # the home page's phones (public/icons/site/clips/, js/site.js), muted, in Chromium and WebKit: a clip plays only
                                          # in view, from a blob (the static files answer Range whole, and Safari plays no video so), from its poster's
                                          # moment, looping; one far down isn't fetched until wanted; the pause button pauses all, kept for the visit;
                                          # under reduced motion none is fetched or plays (exit 0 = pass)
node scripts/test-items.mjs               # one kind of item: the smallest and the fullest, what each is read as, and what was kept from before version 2 reading as version 2 without being checked again
node scripts/test-find.mjs                # finding a pack from what you typed (src/find.ts): what's filed, what's found, what never is (not live, an old
                                          # version), nothing typed kept, packs written for a word before those that only say it (and rows from before
                                          # that, written again), and the real Dutch packs' size
node scripts/test-explore-owner.mjs       # who may change a shared pack (community.ts ownedItem): its owner, or an admin acting with admin access;
                                          # an admin's token made without it changes nobody else's (exit 0 = pass)
node scripts/test-explore-versions.mjs    # a shared pack's versions (community.ts): a new one keeps the pack's languages; sizes and the account's room
                                          # in the UTF-8 bytes its file takes, never its UTF-16 length (exit 0 = pass)
node scripts/test-anki-server.mjs         # a pack with plain cards everywhere the server reads packs, on the real migrations: shared (two decks told apart,
                                          # the same one refused), its page and search, followed, a new version, reported with every card's words in the
                                          # case, Translate's index, your AI's get_pack, list_packs, add_items, edit and remove leaving them, the export (exit 0 = pass)
node scripts/test-sw-shell.mjs            # the service worker's shell list (public/sw.js SHELL): no file named twice
                                          # (Cache.addAll refuses duplicates, and the worker never installs), every file
                                          # there in public/, every starter recording its manifests name (exit 0 = pass)
node scripts/test-webpush.mjs             # Web Push from the Worker (src/webpush.ts): RFC 8291's worked example byte for byte,
                                          # a message a device opens, VAPID's claims and signature, a send's headers, 404/410
                                          # ending a subscription, which endpoints are allowed (exit 0 = pass)
node scripts/test-reminder-turn-on.mjs [<app dir>]   # turning reminders on is one thing at a time (push.js turnOn), the phone's prompt and the server stood
                                          # in: six presses while the prompt is up ask once and tell the server once, each with the same answer; a press
                                          # after it answered is a new one; a failure is everyone's and the next press tries again; another copy's dir to
                                          # see it fail on one from before (exit 0 = pass). test-reminders holds the server's side: a subscribe whose
                                          # report can't be written (the state changing under every try) still answers on
node scripts/test-reminders.mjs           # reminders (src/reminders.ts) on a fake clock: one a day at your time, studied days,
                                          # pauses, quiet hours, backing off and stopping, the cap, your AI's notes batched,
                                          # the week, the words; then the cron on the real migrations with a push service
                                          # played, Send a test (sendTest), and everything deleted when they're off; a big evening (1,200 due at once:
                                          # every one in one run, 6 at a time, a few queries a batch; a run held to the old 500 its control), a run out of
                                          # time leaving the rest due and sending nothing twice, an unreachable push service, and a new account's time the
                                          # device's (a new learner's first session's hour), never moved by a second device (exit 0 = pass)
node scripts/vapid-keys.mjs --local <file> | --put [--replace]
                                          # the VAPID pair: for a local server (a file, never printed: <file> is .dev.vars
                                          # where wrangler dev runs, which reads it itself; delete it after), or set on the
                                          # live Worker with wrangler secret put (refuses to replace keys without --replace)
node scripts/test-scheduler.mjs [--list <frequency.nl.json>]
                                          # the scheduler (FSRS per unit and strength; an idea on its rate: a year of 17 answers a day at 95% right Solid,
                                          # with the old answer-by-answer rule as its control; never Strong or Solid on a handful of answers, under 15 or on
                                          # under 5 days (scheduler.js IDEA_FIRM), however right, a word's same answers Solid; coming back worked out from the
                                          # recent days the same as from every day, on 400 histories either side of 4 am and the clocks changing), the session plan on it, and how each game is answered (plan.js GAMES mode:
                                          # tapping, typing or speaking, Study's groups) (exit 0 = pass)
node scripts/test-study.mjs --list <frequency.nl.json>   # Practice and lessons, on the real path and word packs (exit 0 = pass): a lesson's questions, as measured, a question never offering the same choice twice (past 80 things known too), what's on offer as a
                                          # wrong choice, no voice, pictures, what you've been taught, the suggestion, an old account, 40 lessons in, a starter-only language,
                                          # a reworded sentence's word-for-word answer (every reworded line judged), an idea told in parts,
                                          # the practice right after any lesson with an idea (of one idea, or with its words) opening on it,
                                          # a topic pack (cards first, little words just in time, right after your unit, only what you don't
                                          # know), worked-out units named by topic, a quick session with one game on and nothing studied planning only whole steps; the typing
                                          # games (Type the word with its picture, the word as taught; Type in the gap and Type what it says on a gap word you know, none with
                                          # no voice), each a session of its own, in Practice and alone; Pick the word's picture; a typed word graded as a typed sentence is
                                          # (study/typed.js: case aside, accents forgiving unless strict, a noun's article needed, a near miss wrong); the speaking twins
                                          # (Say the word from its English, Repeat the word from its sound, only on words with a drawing, none with no voice), each a session of its own with its picture;
                                          # in Practice a word Repeat the word can't ask is asked the next way; a newcomer's one-word game and Match asking themselves
                                          # (the path's first new things met as a lesson meets them, then asked by that game); a listening game alone (Listening, What does
                                          # it say?, Repeat after, Type what it says, Repeat the word) taking recorded sentences and words first; Where does it go?,
                                          # Which one is it? and Put it in order only on a sentence each can play (plan.js sentenceCanPlay), alone and in Practice;
                                          # before the first words, the whole-sentence games (plan.js SENTENCE_GAMES, beforeFirstWords: Study's tile quieter, a press
                                          # the first lesson) exactly those a newcomer's plan can't ask, each asking itself after lesson 1
node scripts/test-plan-speed.mjs --list <frequency.nl.json>   # Home's plan on the sample learner's year: each unit's state as the plan reads it (plan.js
                                          # planView, from the word index) unitState's in every field a plan reads (a planted 1% off caught), what's due and its
                                          # order the same, an answer's re-plan under 60 ms and a start's under 250 ms CPU (the plan that replayed: 183 and 380); what's
                                          # kept on the device (study/plan-kept.js) read back equal to a fresh build, lesson by lesson and word by word, never read under
                                          # another key, and a start with it under 120 ms; after a pack change the plan worked out a piece at a time (plan.js warmPlan,
                                          # for know/slices.js) with every piece under 12 ms and Home's draw then under 8 ms, the same as worked out at once; coming
                                          # back (comebackNow) read from the recent days alone, under 3 ms, and which day back it is (comebackDays, Tinta's wave) building none of the
                                          # plan; what Your progress reads (summary.js knowledge) worked out a piece at a time (warmKnowledge), each under 12 ms and
                                          # the same; the words a session keeps from its start for the words milestone (summary.js wordsKnownNow)
                                          # knowledge()'s count, training every strength and reading alone, with a control that differs;
                                          # the words' order (sorted on one number each) the order the
                                          # comparisons give (exit 0 = pass)
node scripts/test-ai-pack-path.mjs --list <frequency.nl.json>   # a pack your AI makes comes next on your path (study/path.js chosen; content.js own: a pack
                                          # of yours that came through the relay, packs.js allPacks relayed), on the real Dutch path and series: a new learner's
                                          # and one 40 lessons in, under its name, its gap words and its sentences' other new words, every sentence playable after,
                                          # Study a topic playing it; three at once in the order they came; one that grows after its lessons, its new words next and
                                          # nothing taught twice (plan.js lessonDone: a chosen pack's lesson is its words); off or removed leaving the path as it
                                          # was; a copy kept as yours and plain cards never laid out so; five laid out in little more time (exit 0 = pass)
node scripts/test-card-say.mjs [<app dir>]   # Say it on a pack's plain card (pack-items.js gamesOf's `says`; study/deck.js saidAloud, saidNoun, setSpeechHearing): only a card
                                          # whose text is the side in the pack's language (by its script; between two languages of one script, left out when the
                                          # text leans to the language learned from and its meaning doesn't: anki/language.js leansTo), with a meaning, at most 60
                                          # characters, where something can listen; never a cloze, a script's letter, a reversed card or an English prompt; a noun
                                          # right without its article, a reading matched; in the deck's plan once its saying is due, on the card's own unit, another
                                          # game with Can't speak now; another copy's dir to see it fail on one from before (exit 0 = pass)
node scripts/test-plain-day.mjs           # a pack's plain items in the day (study/deck.js plainOfDay, plan.js), on the real path: what's due of any pack that's on, what's new only from
                                          # a pack you made or copied, met then asked, never ahead of a first lesson; an imported deck's new ones stay out; a big deck's share and cost (exit 0 = pass)
node scripts/test-first-words.mjs --list <frequency.nl.json>
                                          # how a new word is met (study/new-words.js, plan.js) on the real Dutch word packs: the
                                          # commonest first, every whole-sentence step readable when it runs, no flagged sentence
                                          # (lang/not-first.nl.js) a new word's card or question under 2,000 known words (with a
                                          # control that shows it can fail), a form's meaning, the wrong choices, a due word back
                                          # in a sentence you haven't had, the data against the packs; the pick (sentenceForWord) the plain
                                          # rule's (every key whole, the lowest first) on 14,400 cases, ties to the later sentence its control (exit 0 = pass)
node scripts/test-book-format.mjs         # the book and weave contract (public/js/read/book-format.js) (exit 0 = pass)
node scripts/test-node-imports.mjs        # the study modules Node's tests load (plan.js and what it imports) load in plain Node, with no DOM: a module that
                                          # draws on the page (lx/ui.js) imported by the plan once broke every test of it (exit 0 = pass)
node scripts/test-pack-edit.mjs           # a person's edits to an item (pack-authoring.js editItem, simpleItem, inverseOf, withInverse) on real items and the pack's check:
                                          # everything else stays, a spelling fix carries, a rewrite is said and comes out simple, an Undo puts back exactly (exit 0 = pass)
node scripts/test-packs.mjs               # the language registry, the pack format's check (every refusal), the view, public
                                          # packs' versions and catalog entries, your AI's form and its changes
                                          # (pack-authoring.js): a word written more than once, a list of its forms with null for a time
                                          # that's none (a phrase's: pt's a gente beside the article a, de's zu Hause and zu Fuß beside the
                                          # infinitive's zu, as first written), and of its readings the same (ru до́ма then дома́, ja 方 かた
                                          # then ほう, planted, each kept by its starter's check); the form from before fails them; every pack in
                                          # packs/ there and back unchanged (exit 0 = pass)
node scripts/test-copy-lookups.mjs        # a copy of another pack's item (copyOf, pack-format.js) found by its source: its recordings
                                          # (voice.js hearsItem) and a deck's card by its id (content.js cardById), each with a control (exit 0 = pass)
node scripts/test-opt-in-switch.mjs       # a default pack the catalog makes opt-in (packs.js syncNow): a device that has it keeps it, its
                                          # sentences under the same ids, and follows it for the account; signed out it stays as it was (exit 0 = pass)
node scripts/test-typeset.mjs             # a language's typography as shown (lang/index.js typeset: French's spacing before ? ! ; :)
                                          # and items as the screens show them (pack-format.js shownItem) (exit 0 = pass)
node scripts/test-written.mjs             # a word as the language writes it (study/written.js; content.js shownName, writtenName): on the real Dutch packs,
                                          # Engels, Nederlands, Parijs, T-shirt and everyday words as their keys; a sentence's start and a word in capitals
                                          # never count; one lowercase place mid-sentence keeps the key; IJ; German's nouns; no case; a woven book's capitals
                                          # not counting, its lowercase vetoing; books kept on the device, forgotten; on every Dutch pack the decision from the
                                          # capitalized candidates a full sweep's, under 0.5 ms; onWritten told after the task, only when a form changes;
                                          # each with a control (exit 0 = pass)
node scripts/test-i18n.mjs                # the interface's words (lx/i18n.js): the message format in several locales' plurals, values and
                                          # nodes put in, the pseudo locale and the capture marks, a locale's strings file (stale and broken
                                          # entries left out), the English catalogs (each key in its area, described, used), no word outside
                                          # t() in a moved file (scripts/fixtures/i18n-areas.json), the shell list, the freeze's rules and
                                          # i18n-freeze.mjs refusing a planted locale; the shipped locales (lx/locales.js: a planted one's
                                          # file read, a stale entry left out, a miss asked again; i18n/shipped.js against public/i18n/ and
                                          # SHELL); the chooser's { locale, strings } counted in its own locale, with a map's as the control;
                                          # each refusing a plant (exit 0 = pass)
node scripts/test-interface-language.mjs [<app dir>]   # the app's own language (shell/interface-rules.js): the phone's language tags as Lexicommons'
                                          # languages (Traditional Chinese, older codes, none assumed), the settings as kept and what they decide (English
                                          # for a language the app hasn't got, App language only a shipped one, Grow only into a shipped language you don't
                                          # speak), Grow's words and which messages have grown (every word of it known); each with a control; another copy's
                                          # dir to see it fail on one from before (exit 0 = pass)
node scripts/i18n-move.mjs plan <area> <file…> --out <plan.json> [--label <name>]; node scripts/i18n-move.mjs apply <plan.json> [--overrides <file>]
                                          # moving an area's words into t(), the mechanical part: each literal that reads as words becomes a
                                          # key in js/i18n/en/<area>.js and a t() call (a template's ${…} a named {value}); what it can't do by
                                          # rule (an object key, a case, a comparison, a log, an error thrown) is listed for a person, and so
                                          # are counts, dates, numbers and glued pieces (plurals, formatDate, formatNumber, formatList by hand)
node scripts/i18n-freeze.mjs [--todo <file>] [--context <capture outDir>]
                                          # THE FREEZE RUNS THIS, NEVER A LANDING: every shipped locale (public/i18n/<locale>.json) has every
                                          # English key, translated from the English as it is now, readable, with every value and every plural
                                          # category its language needs; --todo writes what each locale needs translated, and with --context
                                          # whether its context was captured (exit 0 = every shipped locale complete; none shipped passes)
node scripts/test-pack-load.mjs           # a start with ten public packs of 2,000 sentences stored (study/packs.js
                                          # loadPacks): each used on its full check's proof, its content hashed against its
                                          # version, in under 0.1 s; that hashing a worker's (study/pack-hash-worker.js) reading
                                          # the same records, run here on a stand-in IndexedDB: none on the page, a hash used only
                                          # for the record it was made of (one written since is hashed on the page), content changed
                                          # under its version checked in full, a control where the worker's wrong hash decides, no
                                          # worker hashing on the page as before; a load under way (allPacks() meanwhile without the library's packs)
                                          # waited out by packsSettled(), as Translate's index does (exit 0 = pass)
node scripts/test-content-slices.mjs      # what studying draws on, worked out a few ms at a time while a sync brings packs (study/content.js
                                          # prepare, packs.js ensure and syncNow, know/slices.js), on path-nl and every word band served as the
                                          # library serves them: each pack's check in slices checkPack's byte for byte (planted bad ones too), the
                                          # view the slices build the view built at once export by export, nothing reading half a view meanwhile
                                          # (a planted half one caught; readers counted while it's worked out, 3 at least), a change meanwhile dropping it for the newer view, a
                                          # batch of packs (packs.js packsBatch, the relay's round) told once with its view worked out in slices (two saved one by
                                          # one tell twice), on/off and another language at once as before, the sync's longest task under half a view built at once; a first sync's view worked
                                          # out twice, once the lessons are in and then with every band; each pack's record written by a worker from the bytes
                                          # it hashed (packs.js putLibrary, pack-put-worker.js): no record over 64 KB put from the page during a sync (with no worker,
                                          # the page's puts caught: the control), what's stored the pack itself, and a reload straight after a sync reading the new
                                          # record (a worker that answers before it writes, the control, read too early); IndexedDB and the workers stood in
                                          # (fixtures/stand-in-idb.mjs); a hold (slices.js holdSlices: Translate's key until its answer is drawn) starting no
                                          # slice until it's let go, and letting go by itself after HOLD_MOST, with none the slices going on (the control) (exit 0 = pass)
node scripts/test-lessons-first.mjs       # a newcomer's first lesson is the path's (packs.js lessonsComing, onLessonsComing; the sync's order), each a fresh
                                          # device on path-nl and two bands with the catalog listing path-nl last: coming before any sync; the pack the
                                          # catalog says carries the lessons (catalogueEntry's lessons count; path-<lang> on a catalog from before) fetched
                                          # first, studying having it before any band, lessonsComing false where onContentChange and onLessonsComing hear
                                          # it, told once, the packs in the catalog's order; none listed, the catalog unreachable, the file refused: not
                                          # coming, told; LESSONS_WAIT given up; a device whose catalog listed none never held; the wait counting from the
                                          # language's sync, never a look before it (a 20 s first run still coming; a second language's own wait from its
                                          # own sync); the packs.js from before fails it (exit 0 = pass)
node scripts/test-match-pairs.mjs --list <frequency.nl.json> [<app dir>]   # Match never pairs a word with itself: a word whose tile and English are
                                          # spelled the same, case and accents aside (lesson 1's water), out of every round (new-words.js pairsWithItself,
                                          # lang/index.js spelledAlike: a lesson's, Practice's, the word games', a deck's) and asked by another game; path-nl's
                                          # lesson 1 and a week of Practice; and no round with two tiles of the same English (new-words.js oneEnglishEach, matchEnglish: je and
                                          # jouw both "your"), every path lesson's rounds, a week of Practice and Match alone 20 lessons in; another copy's dir to see it
                                          # fail (exit 0 = pass)
node scripts/test-taught-form.mjs [<app dir>]   # the form a lesson teaches a word in (study/path.js taughtForm), what Which word is it?,
                                          # Match's tile and Explore's lesson list show: a word line's notes never in it (gern's "like to (after the
                                          # verb: trinke gern = like to drink)", spijt's), its own x = y still the form; every path pack's lesson words
                                          # taught as themselves (no bracket or colon); another copy's dir to see it fail on one from before (exit 0 = pass)
node scripts/test-subjects.mjs [<app dir>]   # a sentence typed or said from its English where the language leaves its subject to the verb
                                          # (study/subjects.js, lang/subjects.js: es, it, pt): right with its I, you, he, she or we said or left out at a clause's
                                          # start, as the verb's own person the English names, through Type it's grading on path-es and the Italian and Portuguese
                                          # starters; the result on the sentence as written (a pronoun left out in its place, no evidence for it); the controls
                                          # that stay wrong: another person, a polite form left out, a pronoun dropped mid-sentence, dictation, a subject the
                                          # sentence says later said again at its start (Tu vieni anche tu?); Say it's matcher the same; and another sentence of the learner's with the same English, typed exactly from it, right too (path-nl's
                                          # five je/uw, vind/denk and word-order pairs both ways; a near miss of it, or by dictation, wrong; no evidence for a
                                          # word the other hasn't got); another copy's dir to see it fail on one from before (exit 0 = pass)
node scripts/test-other-gender.mjs [<app dir>]   # the same sentence for the other gender (a pack item's otherGender { text, gender, who }: Obrigado /
                                          # Obrigada, ¿Estás listo? / ¿Estás lista?): the pack's check keeping it and refusing it every way it can be wrong; your AI's
                                          # form (pack-authoring.js) carrying it there and back; from the
                                          # English, typed or said (study/subjects.js genderVariants, asWritten), right too, exactly so, shown as the learner gave it,
                                          # every word of the sentence known; from what's heard, still the very sentence; Thai, written without spaces, the same, and
                                          # its two Hello. sentences each right from the other's English; no game making tiles or choices of it (a scan of public/js,
                                          # then every lesson, Practice and game a starter plans); another copy's dir to see it fail on one from before (exit 0 = pass)
node scripts/test-russian-stress.mjs [<app dir>]   # Russian's stress marks (lang/ru.js readings "vowels", lang/readings.js stressProblem): a word's reading
                                          # the word exactly with one acute after its stressed vowel (молоко́, мо́йка), refused with none, two, on a
                                          # consonant, on a word of one syllable or written with ё, with other letters (a Latin o) or other marks (й kept as
                                          # it is); the pack's check keeping a sentence's word readings and its { lemma: reading }; shown in the word's place
                                          # (vowelled), never over it; typed without it, and ё typed as е, still right; Latin's and Arabic's readings as
                                          # before, the control; another copy's dir to see it fail on one from before (exit 0 = pass)
node scripts/test-reading-hides.mjs [<app dir>]   # when a word's reading goes (study/progress.js readingHides): kana or pinyin over it, vowel marks,
                                          # Latin's long vowels, Russian's stress, a romanization, all shown until the word's read strength is Strong
                                          # (READING_HIDES_AT, level 3), never on `known`, which one right answer gives a new word: on the real
                                          # scheduler a first right answer (picked or recalled), a lesson's answers and level 2 keep it, Strong and
                                          # Solid hide it, a Strong word missed shows it again, in every reading language; today's rule (knows) planted
                                          # first and caught; content.js shownName the same on starter-ja's and starter-ar's words; no file under
                                          # public/js deciding a reading by knows() (Study, Explore's previews, the reader: a planted one caught), a
                                          # spoken word's tap still ui.showReading; a stray tile (Put it in order's, Listening's) with its reading as the
                                          # sentence's words have theirs (new-words.js strayTile: молоко́, Ма́ма in its own case; お水's おみず), the tile as
                                          # its text alone caught; an idea's card (One idea, an answer's sheet) drawing its sentence, its picture and its
                                          # More like it lines, a part's chip and its note line with readings by the same rule (new-words.js readingsOfText
                                          # for a rule's own example, readingsInText for a note's line: Мы
                                          # гото́вы., お水(おみず)を飲みます(のみます)。; concept-picture.js wordBody, after-answer.js withReadings), bare lines
                                          # caught; a rule's own words (its name, short line, why, explanation, contrasts, mistakes; the drawer's idea row)
                                          # with their forms' readings never hidden, the grammar's and longer file's own readings only, never a pack's
                                          # (new-words.js readingsOfRuleText, after-answer.js ruleText), each form with the kana touching it one quote so its reading
                                          # hangs over them (new-words.js ruleQuotes, ui.quotedText); another copy's dir to see it fail on one from before (exit 0 = pass)
node scripts/test-script-pack.mjs [<app dir>]   # a pack that teaches how a script is read (pack-format.js teaches: "script"; study/deck.js): Japanese's
                                          # kana (packs/kana-ja.json, a default pack) played as a deck asking how each letter is said: the check keeping the field
                                          # and refusing another value, a sentence, a gap or lessons; kana-ja's 208 letters in learning order (hiragana's 46, voiced,
                                          # combined, then katakana), each sound once a script but お/を, じ/ぢ, ず/づ, told by a keyboard's spelling (o (wo));
                                          # its games (the card, Type for the sound recorded as reading, Match, Choose; Listening only where the device can say a
                                          # letter), new letters met in order then asked; wrong choices never said alike (を never offers o; か never カ), its own
                                          # script first; Type right on any spelling; offered beside lesson 1 (deck.js scriptFirst: Home's first card's second
                                          # link, Study's row) only while nothing's taught and letters are still new; the catalog's entry saying teaches (packs.js
                                          # scriptPacksListed), so Home holds the link's place while the pack comes, decided once a visit, never growing the card;
                                          # another copy's dir to see it fail (exit 0 = pass)
node scripts/test-romaji.mjs [<app dir>]   # Japanese typed in romaji (lang/romaji.js, through speech/match.js), turned into kana before it's graded, for a
                                          # learner with no Japanese keyboard (its fields say Kana or romaji): the table by cases (っ from a doubled consonant and
                                          # tch; ん at the end, before a consonant, as n' and before n and a vowel; long vowels written out, as a macron, as a dash;
                                          # particles alone; the keyboard's spellings); both ways: kana-ja's 208 letters back to their kana, every starter-ja sentence
                                          # spelled in Hepburn and typed right, and typed in kana right (the readings swap read 今's いま into 見ています before);
                                          # a missing っ, ん for な, the wrong particle or word still wrong; katakana compared as hiragana (ー as its vowel); Dutch and
                                          # Chinese untouched; another copy's dir to see it fail (exit 0 = pass)
node scripts/test-rule-examples.mjs [<app dir>]   # an idea's card never shows its own sentence again beside it (study/rule-examples.js examplesBeside,
                                          # after-answer.js conceptBody's More like it and More examples): the card's sentence left out of the rule's examples
                                          # as the language writes it, case and marks aside; every path pack's sentences against their idea's examples none
                                          # shown twice; after-answer.js taking them from it; another copy's dir to see it fail on one from before (exit 0 = pass)
node scripts/test-stray-english.mjs [<app dir>]   # What does it say?'s stray English tiles (study/lesson.js strayEnglish) never a word of the language
                                          # being learned: a lesson word's English read only after its " = " and before any colon (French's "d'eau = water"
                                          # offered d'eau); every path pack's lesson words, each alone in the picker's pool under 60 seeds; a planted note after a
                                          # colon first; another copy's dir to see it fail on one from before (exit 0 = pass)
node scripts/test-fill-speed.mjs --list <frequency.nl.json> [<app dir>]   # Fill for a learner who knows every word of the path and the ten bands:
                                          # its plan under 1 s of CPU and under twice Choose's (a game's test asked only of the sentences in the
                                          # running, in order: plan.js firstFresh); a gap's wrong choices from the words you know (new-words.js
                                          # fillChoices, walked in a seeded order): two known words' forms, never the answer's word or a heavy one,
                                          # only seen forms where seen is given, the same each time, ten times quicker than gathering every form
                                          # (the control), null when fewer than two will do; another copy's dir to see it fail (exit 0 = pass)
node scripts/test-new-ideas.mjs --list <frequency.nl.json> [<app dir>]   # a lesson of one idea put into the path behind a learner (study/path.js
                                          # withNewIdeas; path-place.js seenOn and its "lesson:<id>" anchors), the path laid out without Dutch's seven new
                                          # idea lessons first, then with them (and a new lesson that teaches an idea with its words: idea-conditional):
                                          # past where one goes, it comes up next, ahead, the place unchanged; past
                                          # several, one at a time with a lesson of words between, in written order; not past, where it's written; a place
                                          # you jumped to counting; laid out again, it stays; another device's record counting; a device that never laid
                                          # the path out has it written, open, never skipped; another copy's dir to see it fail (exit 0 = pass)
node scripts/test-pack-audio.mjs          # a pack's recorded audio (study/pack-audio.js): the starter's recordings pass,
                                          # every refusal, the library's license and credit, names and places (exit 0 = pass)
node scripts/test-library-recordings.mjs <path-nl's recordings manifest.json>
                                          # a library pack's recordings across a new version (packs.js), the library played from memory: kept
                                          # for every sentence it says word for word while it's listed without them, kept when its own can't
                                          # be fetched, replaced by its own, gone when taken off on purpose (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "recordings check" --kind parallel -- \
  node 08-lexicommons/app/scripts/recordings-check.mjs http://localhost:<port> <outDir> [chromium|webkit]
                                          # the same on a phone, muted: a phone that started while a new version had no recordings hears
                                          # them once the app comes back into view, and one with the version before keeps the clips of every
                                          # sentence still the same; LOCAL only, path-nl seeded with its recordings (seed-local.mjs --audio)
node scripts/test-art.mjs                 # our drawings (word pictures, lx/art-rules.js; symbols, lx/symbols.js): plain shapes in our
                                          # palette and nothing else: 53 things refused (a script, anything reaching outside, a font, a
                                          # fixed color), the manifest against the files and their hashes, art.css against the palette,
                                          # the shell without word pictures; every ready-made pack drawn, a topic's tile and its packs never the
                                          # same picture, learners' covers (TOPIC_DRAWINGS) drawn and never a topic's own (exit 0 = pass)
node scripts/stamp-pictures.mjs           # writes each drawing's hash into public/pictures/manifest.json: run after adding or changing one
node scripts/picture-audit.mjs [<app dir>] [--lang nl,es] [--record <file>] [--all] [--save]
                                          # every word a language pictures (its words.<lang>.json line, read in every pack of the language,
                                          # or a lesson word's picture field, read in that lesson) with the sentences that use it, and those
                                          # new since the last audit (a pack and id not seen, its words changed, or the line naming another
                                          # drawing). Run it on every new batch of lessons or sentences: read each new one against its word's
                                          # picture (a later sentence can use the word in a sense the drawing isn't), take a misleading line
                                          # out or move it to its lesson's field, then --save. The record is kept outside the repo (default
                                          # ../docs/design/pictures/picture-audit.json) (exit 1 = something new, 0 = nothing)
node scripts/test-picture-audit.mjs       # that audit on a small app of its own: a map line's sentences from every pack (a word by its lemma,
                                          # with a reading or not), a field's from its lesson only, what's new after a sentence is added or
                                          # changed and nothing else, the record kept per language, the exits (exit 0 = pass)
node scripts/test-reactions.mjs           # a word picture's stories (public/js/study/reactions/): drawn over the still the manifest has, every frame a pure function of time and
                                          # allowed by the art rules, each end holding; made-up broken ones refused (exit 0 = pass)
node scripts/test-keep-clips.mjs          # the recordings kept for offline (study/keep-clips.js): every clip once, in order;
                                          # kept ones never fetched again; 50 MB a language; none while saving data; the
                                          # network failing; a missing one left out (exit 0 = pass)
node scripts/test-audio-bytes.mjs        # a recording's bytes as the library takes them (src/audio-bytes.ts): the starter's
                                          # real clips and an MP4 pass, text dressed as audio is refused (exit 0 = pass)
node scripts/test-requests.mjs            # requests for your AI (ai/requests.js): each kind, a question's context, finishing,
                                          # an answer's marked words, nothing coerced (exit 0 = pass)
node scripts/test-cover-svg.mjs           # a text's cover (read/cover-svg.js) against the ways an SVG carries more than a
                                          # picture, the limits, slow patterns, and every output read back (exit 0 = pass)
node scripts/test-texts.mjs               # a text's files as the server checks them (src/text-files.ts): plain text made into
                                          # a book, a book checked (its id, sentences and version worked out here, never asked of its sender),
                                          # an EPUB told apart, a cover cleaned (exit 0 = pass)
node scripts/test-guides.mjs              # the AI guides hold true (src/text-guide.ts, src/weave-guide.ts): every example through the real tools as
                                          # an AI calls them (a text's upload, PUT and add_text, Japanese, Chinese, Cantonese and Thai too; a weave in the
                                          # guide's form through add_weave, read at each level as the guide says; their one message: add_text, get_text's
                                          # to_weave by text_id, add_weave with text_id and language, nothing pressed; every language a text can be woven into,
                                          # its footing said: tuned or the general rules, and what the mix check does by its pronoun list; no placeholder left and
                                          # nothing said twice in any; Spanish's own example into Spanish), and every refusal a guide lists planted
                                          # and said in its words; change a guide or what it describes and run it (exit 0 = pass)
node scripts/test-text-relay.mjs          # the text relay (src/texts.ts) on the real migrations in Node's SQLite: a queued
                                          # change never taken back, Undo's 7 days, expiry, one upload per text; a text your AI adds kept for weaving
                                          # (text-book:<id>: the add's own book, not counted, swept after 90 days, none for an EPUB, gone with the account) (exit 0 = pass)
node scripts/test-weave-texts.mjs         # weaving a text of yours with your AI (src/texts.ts) on the real migrations: the copy the app sends (checked as
                                          # a book, one of the account's uploads, the same text replacing an unused one), a request's claim (the account's own,
                                          # that text, within the hour, never two requests'), add_weave refusing with nothing written (a language not accepted, a
                                          # weave into another, the format's checks, the pipeline's split-forms check, with Alice's accepted layer as its control)
                                          # and relaying a clean one as a change of kind weave served as part weave; the copy gone with the request, the tidy's
                                          # sweep; a weave never making your text one your AI may remove, never undone; the mix check's object pronouns as the
                                          # pipeline gives them (WEAVE_SPLIT: an empty list, German's and Russian's, counts none left alone; no list counts any;
                                          # Dutch's its own, the control) (exit 0 = pass)
node scripts/test-read-store.mjs          # the reading library with two accounts on one browser (read/store.js): listing,
                                          # opening, removing, deleting, shared covers, highlights going with their text
                                          # (exit 0 = pass)
node scripts/test-search.mjs              # search in a text (read/search.js): case and accents, across words, the limit,
                                          # snippets (exit 0 = pass)
node scripts/test-reader-sync.mjs         # the reader's data through your own storage on three devices in Node: where you
                                          # are, highlights (removed stays removed; kept 30 days to restore), your words;
                                          # each kind's check (exit 0 = pass)
node scripts/test-own-language.mjs        # a pack in a language Lexicommons doesn't list (src/packs.ts, lang/index.js own languages) on the real migrations:
                                          # made with its definition, spaced and right to left unspaced; check_items; a device's copy; sentences added; refused
                                          # in words (no definition, a wrong one, ours given one, a region tag, a second pack saying another definition), nothing
                                          # queued; every D1 statement with no learner's language in the registry; a study record in it (exit 0 = pass)
node scripts/test-pack-relay.mjs          # the pack relay (src/packs.ts) in Node's SQLite: corrections accepted in Explore
                                          # reaching the pack the author shared (queueOwnerChange); your AI's add_items, get_pack and update_items
                                          # called through their own schemas (mcp-packs.ts), a word written twice kept as it was there and back:
                                          # te laat's te then om te gaan's, and in Russian and Japanese each time's reading (exit 0 = pass)
node scripts/test-account-sync.mjs        # an account's own copy of your progress and packs (src/account-sync.ts) on the real migrations, R2 in memory: only
                                          # progress kinds' and packs' files (a file per pack; never a recording's or a book's), the app's ACCOUNT_KINDS the
                                          # same list, a write only on the version it read (a clash told), the limits, another account's never read, the
                                          # export with its packs, deleteAccount taking the rows and bytes (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "account progress check" --kind parallel -- \
  node 08-lexicommons/app/scripts/account-progress-check.mjs http://localhost:<port> <outDir>
  # the same in the app, on phones: nothing asked of the store before sign-in; lesson 1 on one device is on a second, empty one signed in to
  # the account (not asked what to learn; the store down as its control); another account sees none; two devices merge; a device's progress
  # belongs to one account (sync.js deviceOwner; shell/other-owner.js): another account signing in is told once and nothing merges or uploads
  # either way (a planted merge caught), Use my progress on this device replaces it and leaves the first account's copy, what lives only on
  # the device named first with Keep it; your own packs kept there too, a file per pack: two your AI made reaching a phone signed in after the
  # relay let them go (its control: that phone kept from the packs' files has none), one deleted staying deleted through a reload, and the
  # one-file form from before planted beside them read with nothing lost or brought back and never written; deleting the account empties its
  # store. LOCAL only, a copy with Dutch's lessons (npm run local) (exit 0 = pass)
node scripts/test-sync.mjs                # syncing through your own storage (sync.js) against one in memory: the merge,
                                          # a file per device, deletions staying deleted, limits, crafted files; study
                                          # progress on two devices replaying the same, clear everywhere and Undo; your
                                          # packs ordered by your AI's changes and bounded by the relay, a file per pack (twenty big decks twenty readable
                                          # files), the one-file form from before read and merged but never written, a file past the read limit never
                                          # replacing a readable one; a sync's count of a kind (what Settings shows)
                                          # from what it merged, the device's own count after it, a relay change mid-read and a clear's covered rows
                                          # included; a quiet sync passing by a kind with nothing new here or on the storage (a change told, another
                                          # device's file, its own file gone each bringing it back; no onChange or Sync now never passed by), and a
                                          # file's text and hash written a piece at a time the same as at once; a quiet sync after a clean one on the
                                          # page going through only the shards changed since, here (a change says its shards: study progress its
                                          # months) or on the storage (a file new, changed or gone; another device's past month the control), its
                                          # count shard by shard, a change with no shards or a sync stopped part way going through all, and what the
                                          # quiet syncs leave what a full one would. sync.js does its work a few ms at a
                                          # time and a quiet sync waits for a still page: home-recompute-check and pile-drop-check hold it (exit 0 = pass)
node scripts/test-translate.mjs           # Translate's engine (translate/engine.js) on the starter, a test pack and books'
                                          # layers: both ways, word forms, phrases, credits, merging; a word's own sentence
                                          # first and 6 sentences for one thing typed, merged too; on the Dutch word packs, a
                                          # form's most used dictionary word, the next guesses, the main words and the best
                                          # guess; a pack sent to the index's worker a part at a time (translate.js make, worker.js
                                          # more) answering as the pack sent whole, a part left out as the control; the index a worker keeps on the
                                          # device (worker.js, on a stand-in IndexedDB) read back by a worker started again and answering the same, another
                                          # key or nothing kept reading nothing back (a key that's changed never reading the index itself), two builds in a row
                                          # keeping only the last, once (worker.js KEEP_AFTER); the worker from before fails it; the index made a piece at a time
                                          # (engine.js buildIndexSteps, worker.js): a look sent meanwhile answered once it's built, as from one made at once, no hold
                                          # near a whole build's (the worker from before fails it), a newer build or a new set dropping the one under way; the index kept only once
                                          # looks have stopped (worker.js KEEP_QUIET: looks every 250 ms past KEEP_AFTER write nothing; the worker from before writes) (exit 0 = pass)
node scripts/test-translator.mjs          # the full translator's files (translate/models.js): the open shelf's book languages each with it, both ways of each language, each file named by
                                          # its sha256 at a key the library serves as bytes (src/books.ts), each once in a download and what it
                                          # adds up to, and models-r2.mjs refusing a file that isn't the one listed (exit 0 = pass)
node scripts/translate/models-r2.mjs --from <folder> (--local <persist dir> | --remote) [--only <lang>]
                                          # the full translator's files into the library bucket at the keys models.js names, each checked
                                          # against its sha256 first; --remote is the live bucket (the director, at a freeze; sandbox off)
node scripts/packs/audio-v2.mjs <v1 folder> --pack <pack> --out <empty folder> [--license …] [--credit …]
                                          # a pack's recordings as the library takes them: a checked version 2 manifest and
                                          # clips named by their bytes, for an admin to stage and publish (never into public/)
node scripts/packs/seed-local.mjs <pack.js|pack.json> --persist-to <dir> [--confirm-removed]
    [--audio <manifest> --clips <dir> | --drop-audio] [--opt-in | --default]
                                          # a pack as one of Lexicommons' own in a LOCAL library (checks and testing only;
                                          # never the live bucket), with its recordings as library_publish { audio } puts
                                          # them; --remove <id> --language <code> takes one out. The pack's language's grammar as
                                          # library/catalogue-seed.json names it goes in first when the local library's is older (a pack
                                          # may use a later revision's patterns). One process: every object through one local bucket (wrangler's
                                          # miniflare, opened as `wrangler r2 object --local` opens it), an object already there unchanged left as
                                          # it is; about 2 s a pack with its recordings (it was a wrangler launch per object: 4 minutes and 378 processes)
node scripts/test-local-r2.mjs            # scripts/fixtures/local-r2.mjs, the one local bucket every seed script and check writes through (one process,
                                          # wrangler's miniflare), against `wrangler r2 object --local` on two clones of one state: every object (key,
                                          # sha256, size, metadata) and D1 row the same, each read answered alike, the catalog's version changing on an
                                          # identical rewrite (the server's revisions) and another file's not; a changed content type caught (sandbox off) (exit 0 = pass)
node scripts/test-catalogue.mjs           # the open library's catalog rules (public/js/read/catalogue.js) (exit 0 = pass)
node scripts/test-readable.mjs            # which open books a learner can read (read/readable.js), the one answer Home's count, Read's search and
                                          # kinds and Find a book's count and search all ask, on a catalog where it and the whole count differ (exit 0 = pass)
node scripts/test-grammar.mjs             # a language's shared grammar (public/js/lang/grammar.js): every language's revision 1
                                          # passing, every id ever published still there (scripts/fixtures/pattern-ids.json:
                                          # add a new id there; the list only grows), the check's every refusal, the rule
                                          # between revisions, versions, the catalog's entry, a restore never taking one back,
                                          # installing only forward, packs checked against it, the Worker's side (src/grammar.ts); a grammar's
                                          # and its longer file's readings for their own words' forms (kept, installed, in the version; refused
                                          # where they can't be) (exit 0 = pass)
node scripts/test-concept-shape.mjs       # what a rule's picture shows (public/js/study/concept-shape.js) on real path-nl sentences: brackets only
                                          # for real frames, a word's place only first/second/last in its own clause, pairs, endings by
                                          # the word's spelling, nothing guessed where the roles don't say (exit 0 = pass)
node scripts/test-own-patterns.mjs        # a pack's own patterns among many authors: your AI's new ones kept as <pack id>.<id>
                                          # (pack-authoring.js ownPatternIds), the format and practice taking them, `same` (a
                                          # pack's own that's the shared grammar's): the view counting its sentences for the shared
                                          # one, the evidence one unit (progress.js setUnitAliases), split again (exit 0 = pass)
node scripts/test-notes.mjs [<app dir>]   # a pack's notes (study/pack-notes.js, study/notes.js): every refusal, against the pack; the same bytes for the same input; a note that no longer fits its sentence showing nowhere; the catalog's entry; the device taking them;
                                          # the notes' own worker (study/notes-worker.js) taking and reading back every notes and forms file, none fetched, checked or read from Cache Storage on the page (a file's
                                          # check held a phone's main thread 64–86 ms at 4×), a refusal said, a worker that fails leaving it to the page; another copy's dir to see it fail on one from before (exit 0 = pass)
node scripts/test-grammar-review.mjs      # an admin's review of grammar suggestions against what happens while it publishes (grammar-suggestions.ts): one hidden
                                          # after its claim publishes nothing; a fix made against the new revision isn't superseded; with nothing between, the
                                          # next revision and an older fix superseded (exit 0 = pass)
node scripts/test-grammar-suggestions.mjs  # suggestions to a grammar: the explanation's rule (an example with its literal gloss,
                                          # 1–3 sentences), every refusal, the next revision from accepted ones (sources never
                                          # naming a person); the server (src/grammar-suggestions.ts) on the real migrations:
                                          # who may suggest, listing, likes, withdrawing, reports, declining, the day's limit,
                                          # an account going (exit 0 = pass)
node scripts/grammar-suggest-check.mjs http://localhost:<port> <outDir> --persist-to <dir>
                                          # suggestions end to end (headless Chrome through gpu.py's parallel lane): Explore's
                                          # grammar pages, Knowledge's way in (an idea's sheet's Suggest a better explanation, none with
                                          # sharing closed), suggesting in the app and over MCP, liking, reporting and the queue,
                                          # an admin's review publishing the next revision, the device taking it, Yours,
                                          # withdrawing; LOCAL only, a fresh state, --var COMMUNITY_SHARING:everyone (exit 0 = pass)
node scripts/grammar-check.mjs http://localhost:<port> <outDir> --persist-to <dir>
                                          # the shared grammar end to end (headless Chrome through gpu.py's parallel lane): an
                                          # admin's next revision over MCP (refusals, published, served), your AI's pack checked
                                          # against it at once, a device with an older grammar taking that pack through the relay,
                                          # Study, a restart with the library unreachable, a restore, another tab; LOCAL only, a
                                          # fresh state (exit 0 = pass)
node scripts/test-library-keys.mjs        # the library's keys as read/catalogue.js builds them and src/books.ts serves them,
                                          # for every language and a code with a script (zh-Hant: lang/index.js
                                          # LANGUAGE_CODE) (exit 0 = pass)
node scripts/test-pack-corrections.mjs    # corrections to a pack (study/pack-corrections.js): paths, a piece's value, a
                                          # fix checked as a version is, several at once, what a new version supersedes,
                                          # the community overlay (exit 0 = pass)
node scripts/admin-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--work <books work dir>]
                                          # admin and the open library through MCP and REST, end to end, with the books
                                          # pipeline's real files and the starter's real recordings (published as a default
                                          # pack's audio); LOCAL only, on a fresh state (sandbox off) (exit 0 = pass)
node scripts/test-limits.mjs              # request bodies read only up to their limit, chunked or not (src/util.ts) (exit 0 = pass)
node scripts/test-audio-entry.mjs         # what an audio publish writes into the catalog (library-admin.ts audioChange): the entry as the catalog has it
                                          # when it's written (an opt-in set or taken off meanwhile kept), a pack moved to another version refused (exit 0 = pass)
node scripts/test-library-id.mjs          # a library pack's id is its own (library-admin.ts): one a learner's shared pack has is refused (exit 0 = pass)
node scripts/test-safe-next.mjs           # where sign-in, getting back in and the gate send you next (util.ts safeNextPath): only a path on this
                                          # site, read as a browser reads a Location (a tab or newline dropped, a backslash a slash); with a
                                          # control that the old check's answer lands elsewhere (exit 0 = pass)
node scripts/test-cross-site.mjs          # what a browser marks as another site (util.ts crossSite): another origin, "null", a neighbor port,
                                          # Fetch Metadata; this site's own, a navigation and no browser headers go on (exit 0 = pass)
node scripts/origin-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # a cookie session's change only from this site, over HTTP:
                                          # another site's refused with nothing written (a text/plain form too), getting back in refused from another
                                          # site, this site's own and a non-browser's go on; LOCAL only (exit 0 = pass)
node scripts/test-library-admin-input.mjs # what an admin's call hands the library (library-admin.ts): staging only its own types (never "constructor"),
                                          # a REST publish keeping every field a publish reads, each as its type (exit 0 = pass)
node scripts/test-challenge-once.mjs      # a passkey challenge used once (challenges.ts takeChallenge), even by two requests at once (exit 0 = pass)
node scripts/test-storage-routes.mjs      # the routes adding a client secret to a storage sign-in (storage.ts), Google's and OneDrive's: a body to its limit,
                                          # each field text of a sane length (Microsoft's 8,192), nothing odd sent on; a right one goes with the secret, the
                                          # control; OneDrive's refused with nothing sent while there's no ONEDRIVE_CLIENT_SECRET, the config saying which way
                                          # and never the secret; invalid_grant passed back (a sign-in that ended), invalid_client or Microsoft down a 502
                                          # counted in the error reports; the secret in no answer or report, the stand-in only on localhost (exit 0 = pass)
node scripts/onedrive-check.mjs http://localhost:<port> <outDir> --mode server|browser --standin <port> --secret <it> --persist-to <dir> [--server-log <file>]
                                          # OneDrive's sign-in end to end in Chrome, Microsoft played (its authorize page, its token endpoint for the browser
                                          # and, through AUTH_STANDIN, for the server; Graph's app folder) by its rules for each kind of client: server mode
                                          # (ONEDRIVE_CLIENT_SECRET set) Connect through the Web redirect and the server, Check, a refresh through the server,
                                          # a sign-in Microsoft won't renew said once beside Connect and never asked again, an old single-page sign-in renewed
                                          # by the browser while its day lasts then ended once, the secret refused never asking to reconnect; browser mode
                                          # (none, the control) as it always was. The secret in nothing the browser sees, the server's log or the error
                                          # reports. LOCAL only; the server started with --var STORAGE_REDIRECT_URI:http://localhost:<port>/app/storage/callback
                                          # --var AUTH_STANDIN:http://localhost:<standin port> (and the secret, a stand-in value); through gpu.py's parallel
                                          # lane (exit 0 = pass)
node scripts/test-board-ban.mjs           # a request's author opening it again only while they may post on the board (board.ts closeRequest) (exit 0 = pass)
node scripts/test-staged-sweep.mjs        # the cron's sweep of staged files past their day, every account's (library-admin.ts), at most a batch a run (exit 0 = pass)
node scripts/test-account-limits.mjs      # an account's notes, uploads and tokens limits (library.ts) hold when requests come at once: each counted
                                          # in its own write (exit 0 = pass)
node scripts/test-sessions.mjs            # the cookie session (sessions.ts): slid to 90 days past half its life only where the answer renews the
                                          # cookie too (the /api/* middleware, /app/); a plain lookup changes nothing (exit 0 = pass)
node scripts/test-session-cache.mjs       # the session cache (sessions.ts sessionOf { cached }; app.ts CACHED_SESSION_ROUTES): Translate's three routes, which read
                                          # only public packs, answer from a session this isolate's D1 lookup found in the last 30 s (no statement, no SESSION_LIMITER
                                          # count, no slide); every other route reads D1 every time; an entry ends at 30 s or with its session, a cookie that found
                                          # nothing is never kept, sign-out and account deletion drop theirs, 10,000 at most; planted rules caught (exit 0 = pass)
node scripts/test-local-cookies.mjs       # a copy's cookies over plain http (util.ts localHttpCookies, withLocalCookies; index.ts's fetch): Safari drops a
                                          # Secure cookie http://localhost sets, so a copy (PUBLIC_ORIGIN http://localhost or 127.0.0.1) takes Secure off each
                                          # cookie for a plain-http request there and changes nothing else; the live config (wrangler.jsonc, every deploy it
                                          # names) keeps Secure on every cookie at any address; every cookie src/ defines; planted rules caught (exit 0 = pass)
node scripts/gate-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --state gated|pages|public [--plan] [--password <it>] [--cookie-file <file>] [--sharing everyone|admins]
                                          # going public, as one switch (src/gate.ts), on a server started in that state: gated (only the bypass list
                                          # answers; the password; a cookie from before the switch), pages (GATE_PUBLIC_PAGES: exactly the three pages,
                                          # and /pricing with --plan, for reading, still out of search; without the plan no spelling of /pricing is the
                                          # page, gated or open), public (every route the code has, walked with no account against private
                                          # data it writes first; robots.txt, what may be indexed (the try-out, /try/, open to anyone and never indexed), the share card as card fetchers get it, the cookie table,
                                          # what a visitor can open loads only from this site, in Chrome; the public pages served whole, naming no payment, plan or
                                          # in-app AI without --plan, and the plan's parts with it); a new route fails until it refuses or goes on its
                                          # list; through gpu.py's parallel lane; LOCAL only (exit 0 = pass)
node scripts/gate-check.mjs https://lexicommons.com <outDir> --state public --live
                                          # the live site once it's public, READ ONLY: robots.txt, what may be indexed, no pricing page, the public
                                          # pages' words, the share card, the gate gone, the cookie table, redirects, a visitor's walk in Chrome; no
                                          # account made, only GETs; the stages that write first are skipped and say so (exit 0 = pass)
node scripts/privacy-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--server-log <file>] [--plan]
                                          # with the plan off, no screen (a learner's, an admin's) and nothing over MCP names payments, a plan or the in-app AI
                                          # (--plan, on a server that offers it: Settings → Email names receipts, the control);
                                          # what privacy.html and terms.html say, against the app: a row of an account in every table in its export (a new
                                          # table fails until it's there or has its reason), what deleting leaves, what a copyright notice's pack owner is
                                          # told, no pictures in what's shared, what's typed in Translate in no URL and no server log, a signed-in walk
                                          # loading nothing from elsewhere; through gpu.py's parallel lane; LOCAL only, a fresh state, --var
                                          # COMMUNITY_SHARING:everyone (exit 0 = pass)
node scripts/test-coach.mjs                # your study as your AI reads it (src/coach.ts): the summary, one lesson, one concept, misses, by name or id; a record's check (exit 0 = pass)
node scripts/coach-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--no-model]
                                          # coaching from your own study, end to end, on a phone in Chrome through gpu.py's parallel lane: with no AI, nothing leaves the device and the
                                          # server refuses it; connected, the device sends the record and keeps it fresh after a session; what your AI reads over MCP, from real
                                          # mistakes in a real session; an older device can't overwrite it; disconnecting takes it; a heavy learner's stays under its limit with no long
                                          # task; the export; the AI section says so; then real `codex exec` over MCP answering "what am I struggling with?" and "why is the verb
                                          # there?" from those mistakes, with no tool named. LOCAL only, path-nl and the Dutch word packs seeded (exit 0 = pass)
node scripts/test-restore-race.mjs        # a moderator's restore decides on the reports it read (moderation.ts modRestore, modRestoreShown): a report filed
                                          # or acted on between its read and its write makes it write nothing (look again); with nothing between, it restores (exit 0 = pass)
node scripts/test-admin-alerts.mjs        # what reaches an admin about moderation (src/admin-alerts.ts) on a fake clock and the real migrations, a push
                                          # service played: a serious report at once, other cases within the hour, a stuck queue daily, never twice,
                                          # a failed delivery again, no device, no keys, nothing private in a push (exit 0 = pass)
node scripts/test-errors.mjs              # error reports (src/errors.ts, lx/error-clean.js): planted words, addresses, links and keys never survive cleaning;
                                          # stacks in every engine's format keep only our frames, and a report cleaned on the device then again on the server
                                          # comes out the same (function names kept: two functions, two groups; the reader from before fails it); grouping, the
                                          # per-isolate limit, the cap, the sweep, clearing;
                                          # a server error by its route's pattern; the spike alert and the cron's push; when the app started again
                                          # by itself (a reload of the phone's Home Screen app it didn't make, not after being hidden) and what
                                          # that report keeps (its screen and version alone) (exit 0 = pass)
node scripts/test-probe-guard.mjs [<app dir>]   # the native probes' marks (speech/probe-guard.js): there while one runs, cleared when it answers, throws,
                                          # the page is closed (pagehide) or hidden (set again if it comes back with the probe still running); one left at
                                          # a start told once by name and that probe never run on the device again (speech/browser.js's on-device question
                                          # too, and skipped where not wanted); the "probe-crash" report (error-clean.js) the probe in fixed words, its
                                          # screen and version, cleaned again on the server the same, none for a name that's no probe's; another copy's
                                          # dir to see it fail on one from before (exit 0 = pass)
node scripts/test-bug-reports.mjs         # bug reports (src/bug-reports.ts, lx/bug-rules.js) on the real migrations, R2 in memory: every refusal writing
                                          # nothing (not a form, too big, nothing written, past 2,000 characters, a screenshot that isn't a PNG, JPEG or
                                          # WebP by its own bytes, one too big); what's kept (what came along cleaned to route names, version, device,
                                          # languages, the browser from the request; planted secrets not); an account's day and every signed-out report's
                                          # day together, held when sent at once; the export and the screenshot for its owner only; deleteAccount taking
                                          # its reports and screenshots and no one else's; the 90 days' sweep; the admin's tools through their own schemas
                                          # (bug_reports, bug_report with its screenshot, bug_reports_close, a learner refused); the push batched (exit 0 = pass)
node scripts/errors-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # error reports end to end in Chrome on a server started
                                          # with --test-scheduled: the app's errors sent once, 10 a page at most, cleaned before they leave (every request
                                          # read); kept cleaned in D1; refused from elsewhere; a 500, an MCP tool's failure and the cron's counted (it drops
                                          # tables in ITS OWN state, so LOCAL only); error_reports over MCP for an admin only; the Home Screen app on a
                                          # stand-in phone starting again by itself told once with its screen and version, never for a first open, the
                                          # app's own Reload, a page last hidden, a browser tab or a computer (exit 0 = pass)
node scripts/build-share-card.mjs         # public/icons/share-card.png, what a link to the home page shows (through gpu.py's parallel lane)
node scripts/upload-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --gate-password <it>
                                          # signed uploads and the gate's form against bodies that lie about their size, one
                                          # link sent twice at once, an account's files on delete; LOCAL only, the gate on
node scripts/community-check.mjs http://localhost:<port> <outDir> --persist-to <dir>
                                          # Explore over HTTP: the terms, who may share, sharing (app and MCP), duplicates,
                                          # browsing, follows, likes, versions, withdrawing, curation, an account going;
                                          # LOCAL only, on a fresh state (exit 0 = pass)
node scripts/test-shared-books.mjs        # books in Explore (src/community-books.ts) on the real migrations with the shelf's own books and layers: every
                                          # refusal writing nothing (rights, source, pictures, a layer's check or audit, sizes, the same text, the terms, a
                                          # ban, the day's limit), live from a known source and pending from another (an admin opens or declines), files as a
                                          # device reads them and only while live, versions and layers, follows, likes, reports, notices, strikes, withdrawn,
                                          # an account going, the export (exit 0 = pass)
node scripts/books-check.mjs http://localhost:<port> <outDir> --persist-to <dir>
                                          # the same over HTTP and MCP: an AI shares a book with its layer (share_upload, share_book), a second account's AI
                                          # adds it and its files arrive intact (signed out: 401), a layer dropped and back, crafted bodies, a copyright
                                          # notice taking it down and an admin upholding it, an account deleted; LOCAL only, a fresh state, --var
                                          # COMMUNITY_SHARING:everyone (exit 0 = pass)
node scripts/moderation-check.mjs http://localhost:<port> <outDir> --persist-to <dir>
                                          # moderation over HTTP and MCP: who gets which tools, the hide rules, hidden and
                                          # removed, the queue, resolving, counter-notices, strikes, bans, limits (also
                                          # sent at once), two decisions at once, the library's own packs, the policy, the
                                          # admin log; LOCAL only, a fresh state, --var COMMUNITY_SHARING:everyone (exit 0 = pass)
node scripts/corrections-check.mjs http://localhost:<port> <outDir> --persist-to <dir>
                                          # corrections over HTTP and MCP: suggesting (every refusal), likes, the open
                                          # fixes, accepting and declining, superseding, an admin on any pack and on the
                                          # library's own, claims (in flight, stale, superseded), confirm_reverts, races,
                                          # the library's index, reports on corrections (the hide rules, the queue, decided,
                                          # a moderator's hide), crafted bodies on every Explore and library route; LOCAL
                                          # only, a fresh state, --var COMMUNITY_SHARING:everyone (exit 0 = pass)
node scripts/requests-check.mjs http://localhost:<port> <outDir> --persist-to <dir>
                                          # requests in Explore over HTTP and MCP: who sees which tools, posting (every
                                          # refusal), the board, "me too", answers (an admin's too), done and closed, book
                                          # requests (on the shelf, and pending for an admin), reports on them, the limits
                                          # (also sent at once), crafted bodies, the export, an account going; LOCAL only,
                                          # a fresh state of its own (it writes the local catalog), --var
                                          # COMMUNITY_SHARING:everyone (exit 0 = pass)
node scripts/books/weave-audit.mjs --book <book.json> --weave <weave.json> [--keep <glossary.json>] [--lexicon <lexicon.json>]
                                          # a weave rendered at five bank sizes; exit 0 = its invariants hold
node scripts/speech-build.mjs             # vendor transformers.js + ONNX Runtime, fetch and chunk the Whisper models into
                                          # public/models/ (gitignored, ~1.1 GB): run it before deploying from a fresh copy
# Headless Chrome goes through gpu.py's parallel lane (beside the GPU queue, up to 4 at once), from the channel repo root:
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "piping test" --kind parallel -- \
  node 08-lexicommons/app/scripts/piping-test.mjs <outDir> <dutch-clip.m4a>
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "design check" --kind parallel -- \
  node 08-lexicommons/app/scripts/design-check.mjs <baseUrl> <outDir>   # /design end to end, 19 stages, exit 0 = pass
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta speech check" --kind parallel -- \
  node 08-lexicommons/app/scripts/tinta-speech-check.mjs <baseUrl> <outDir>   # Tinta speaking on /design's demo
  # through voice.js: a recording (every word opens the mouth at the manifest's times, the loudness from the file, at
  # rest after; the control fails), a press that stops the sound closing it at once, a device voice whose boundaries
  # put its clock right, animations off holding the still; exit 0 = pass
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta cards check" --kind parallel -- \
  node 08-lexicommons/app/scripts/tinta-cards-check.mjs http://localhost:<port> <outDir>   # Tinta on the questions in a
  # real session: beside the instruction in every game (clear of every word and control, hidden, no presses), speaking
  # the sentence, reacting to right and wrong (nothing for I don't know), pointing only at the hint's marked words in
  # turn (a press ends it), its eyes on the tile you touch, its still with animations off; all of it on both libraries a
  # learner can meet, with the lessons and the starter alone; then at 320 × 568 slowed 4×, lesson 1's first picture answered
  # (its fit taking the instruction out): Tinta leaving with it over frames, his copy rising with it, never gone in one frame,
  # and none of him on a press where the fit had him out already (the server needs path-nl seeded, else exit 2); LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta acts check" --kind parallel -- \
  node 08-lexicommons/app/scripts/tinta-acts-check.mjs http://localhost:<port> <outDir> --persist-to <dir> \
  [--only design,whisper,book,recordings,error,metoo,plane,theme] [--require-all]   # Tinta's acts in the app (docs/design-system.md,
  # "Tinta's acts in the app"): a download's bar on /design (Tinta pouring in as the fill, out of the far end at the
  # end, a press ending it while the bar goes on, still with animations off, no presses), Whisper's download (the same
  # bar through every redraw; Stop), a shelf book opening (the plain bar, no Tinta; none in the reader) and a library
  # pack's recordings kept (it seeds its own into the local library), each download slowed in the browser; something
  # that didn't go (/design's demo: Tinta slumping beside the words, Retry pressed mid-puddle; Explain this offline;
  # a request's Me too offline, made by another account it writes into local D1); Me too (/design's demo: counted at
  # once, the seal on the button's corner, dried by 3 s, nothing on taking it back; a request's page: the seal through
  # the page's redraw, the same Tinta kept; a failure acted by that Tinta, the only one); the paper plane (/design's
  # demo: off and round, in from far off; a pack shared from its page; your request with a new answer, once); a new
  # theme (Settings → Appearance: on the press, a picture of the old one taking no presses with a hole opening frame
  # by frame from under Tinta as it shakes, never a second page; a press ending it; none with animations off); LOCAL
  # only, --var
  # COMMUNITY_SHARING:everyone; a stage the server
  # or browser can't serve (no open library, no Whisper on offer) is skipped unless --require-all
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "theme wipe check" --kind parallel -- \
  node 08-lexicommons/app/scripts/theme-wipe-check.mjs http://localhost:<port> <outDir> [--late <frames>] [--swap <path>=<old file>]   # a new theme's
  # picture of the old one (character/theme-wipe.js) never shown before it's drawn in the app's styles (its Tinta and the page's title where the
  # page's are, every frame), with the picture's rules held back --late frames as WebKit did on an iPhone (5 by default; unstyled, Tinta's drawing
  # filled half the screen); the wipe plays and the page's parts stay put; four taps in a row: one picture at most, settling on the last; rules that
  # never come: the theme just changes; none with animations off; Tinta off the screen: the theme just changes, nothing left over it; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta whole check" --kind parallel -- \
  node 08-lexicommons/app/scripts/tinta-whole-check.mjs http://localhost:<port> <outDir>   # Tinta stays whole: every frame of
  # its acts, stepped in place at 8 sizes and every fit level, against all that clips it; at the highest frame, in both
  # themes, the pixels it shows against the same frame alone; the page doesn't move for it; pictures of the page (a step or
  # session leaving, a swipe back, the theme's old look) have it as one drawing, whole; on a short screen one size through a
  # question. tinta-tabs-check and tinta-acts-check
  # watch every Tinta they meet the same way (scripts/tinta-whole.mjs: a frame around a scroller that can still bring it into view doesn't cut it,
  # as the window doesn't; a frame cuts only along the axes it clips, so the app's overflow-x: clip leaves its foot open to a session's cover
  # rising from below; its first stage proves both rules on planted parts, both ways)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta arrive check" --kind parallel -- \
  node 08-lexicommons/app/scripts/tinta-arrive-check.mjs http://localhost:<port> <outDir> [--cpu 4] [--preset weeks] [--only <regex>]   # Tinta in the
  # first frame of every page that has one, every frame recorded, the processor slowed 4×: a start into Home, the path and the AI tab with the
  # worker on, and a start into Settings then a first visit to each, every Tinta drawn in every frame it's seen; its code held back past the
  # start's wait, each Tinta holding its kept first frame (character/firsts.js) and the live one taking over with the same picture; with
  # nothing kept, a fade in, never a pop; Animations Off's still the same. The app from before fails the first two; LOCAL only (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta tabs check" --kind parallel -- \
  node 08-lexicommons/app/scripts/tinta-tabs-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # Tinta on
  # the main tabs: Home's streak spot (ready with its drip; on the day's first finished thing it throws the drip into
  # today's square, which stays open until the ink lands; once a day; a press ends it with the square shown), Study's
  # place on the path strip (after a lesson he hops onto the new place from the stop before, standing there from the strip's first frame on the
  # old progress, the new segment inking in under him and landing with him, then doors.js's own drawing; a press mid-hop puts both at your place
  # in that frame; once a place; none with less motion), Knowledge's This week (idle on a first look; after a session the drip thrown into today's glass, which rises
  # only from the ink's landing; no second throw that day), the AI tab (beside your AI, scribbling while it works on a request taken over
  # MCP, catching the answer); hidden, clear of every word; a tap on his ink a poke (character.js poke(), the rig's poke.js): the link
  # around him neither opening nor looking pressed; a tap in his box beside his drop the link's (pressed while it's down, then opening:
  # the streak spot, the path strip), taps a beat apart the next in turn (splat, tickle, slide, splat, squirt), a sooner
  # one dropped, a tap on him never ending it and a press elsewhere doing so, none while he scribbles; stills, no throw and a tap doing
  # nothing with animations off; a breathing Tinta's sharpening track (character/sharpen.js) never showing him larger after a press, finishAll(),
  # a theme change, a tab switch or its own finish (the keyframes from before, the control, end at 1.5), and started again once ended; a real
  # new account's Home, then after lesson 1 the streak spot in the first view and its throw with no scrolling (under the tab bar it waits); LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "rtl check" --kind parallel -- \
  node 08-lexicommons/app/scripts/rtl-check.mjs <baseUrl> <outDir>   # right-to-left layout on /design, with a test
  # language registered in the page only: the literal line in both orders and the flip between them, Arrange's rows,
  # drop slot and right order, English tiles inside them, the fonts (Armenian's and Georgian's fetched only for their
  # own letters) and Arabic's mark, a word's vowel marks (shown until it's known well, then as written, a tap bringing them
  # back); the reader on a right-to-left
  # book (its page, taps, keys and drag turning the other way, a held run copied in order, a spread's first page on
  # the right, the chevron top left) and woven words running the other way from their page, each its own isolate with
  # the space outside; Hebrew listed inside English (a chip, a gloss) in its own order; Fill's choices from the right,
  # with their vowel marks while the word is new; Yiddish's romanization over its word; by rectangles (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "b4 check" --kind parallel -- \
  node 08-lexicommons/app/scripts/b4-check.mjs http://localhost:<port> <outDir>   # the reader in Japanese and
  # Chinese: readings over the words (hidden once known well, a tap shows them), a just-added word's English under it, the
  # language's order run together, the underline switch, the 24px default with the weave on and off (a picked size
  # stays), a book with help, no word past the text's edge; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "words check" --kind parallel -- \
  node 08-lexicommons/app/scripts/words-check.mjs http://localhost:<port> <outDir> --persist-to <dir> \
    --pack packs/words-nl-01.json [--pack packs/words-nl-02.json …] --opt-in packs/words-nl-strong.json
  # Translate with the Dutch word packs on a phone, one --pack per default pack: first a first open while the packs
  # download (held) with the server's Translate slow (3 s): a result or Tinta looking within 1 s of typing, a line saying
  # the word packs are coming, hi found online meanwhile, then searched again on the device once they're here (the server
  # gone); then an English word (hi, also a
  # Dutch word: both readings, Dutch first) gives its Dutch words, then 6 sentences with each word's own first; a Dutch
  # word and a form of one back; a word from each pack, shown as the language writes it (study/written.js: IJslands), its own sentence first; me, him, her, us and them each finding
  # their Dutch word; several words, up to 4 main words with 2 sentences each; offline, the device's copy; the opt-in pack not on the device until it's added
  # in Explore (Add pack), found online all the same, then offline, credited to Lexicommons; what it expects read from
  # the pack files; a word of a later band, which the server leaves to the device: "Not found yet" before the packs come, found after, and what
  # the server read and named; LOCAL only, every pack seeded (scripts/packs/seed-local.mjs --default, the opt-in one --opt-in)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "quick play check" --kind parallel -- \
  node 08-lexicommons/app/scripts/quick-play-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>]
  # Study's games (study/quick-play.js): every game a large button on Study in its section by how it's answered (Tapping, Typing, Speaking: study/game-modes.js,
  # plan.js's modes), three to a row at 390 and 320 in dark and light, filled with a hard edge, its own drawing
  # (lx/game-art.js, loaded apart from the first load), nothing cut off, no gap above; each game's plan only that game, six questions (Match three rounds); a press played
  # to the end and back (walk.mp4); a game that can't play here (no voice, no recognizer) quieter and saying why, starting nothing; Choose the games a drawer with no page
  # arrow; Study cards one of the games and More ways gone; every game's own page in Settings → Study and Games opening with its name and its switch, no
  # error (a game with no settings of its own has no hint or word-for-word line); LOCAL only, path-nl seeded (seed-local.mjs --default)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "home recompute check" --kind parallel -- \
  node 08-lexicommons/app/scripts/home-recompute-check.mjs http://localhost:<port> <outDir> [--only <regex>] [--profile]
  # Home after a pack change on a phone slowed 4×, a learner months in (the sample learner's months as its own evidence) on its first day back after four away: a word band switched off on
  # Study, then Home tapped just after and a minute on; every long task from the change's own on read against Chrome's CPU profile of the same time
  # (lined up by clock marks in the page, and a planted 150 ms task first, which it must name): the plan (study/plan.js, path.js, new-words.js),
  # sync.js (its count after a change), Home's whole redraw (today.js drawAll) and Your progress (summary.js) each under 10 ms of any, what else made one long reported by its
  # functions; Home's card in every frame. --profile keeps each round's .cpuprofile; LOCAL only,
  # path-nl seeded (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "typing games check" --kind parallel -- \
  node 08-lexicommons/app/scripts/typing-games-check.mjs http://localhost:<port> <outDir> [--only <regex>]
  # the typing games on a phone by the keyboard, a learner six lessons in: Type the word, Type in the gap and Type what it says each its own session, a right
  # answer and a wrong one said and recorded as the game's own evidence (recall; said, or heard), your typing against the word when it's wrong; Can't listen now
  # turning Type what it says into a game with no sound on the same sentence; Pick the word's and Type the word's drawing under the English (none where there's
  # none); strict accents taking een for één as wrong, forgiving as right; a wrong answer in a gap game moving nothing in one frame (frame-watch.mjs, a planted
  # jump caught first), the typed gap's sentence not at all unless the result needs its room, then on the result's curve as Fill's is (both ways on set
  # sentences found at run time, the learner's tried in turn: one whose result leaves the room clear stays, one whose result needs it moves until it's clear); last, an iPhone SE's screen (375 × 667) with a stand-in keyboard of 300 px
  # up in Type the word: its drawing smaller or not drawn (session.js fit, data-keys-fit), never under the session's bar, the field and Check above the keys,
  # the drawing back when they go; then Type it's marked line (ui.typedLine) under a result with an explanation in view and clear of the result and the session's
  # bar at 320 × 568 and on an SE's screen once the keys go after Check, and on the path's longest sentence its field folding instead of it (session.js unhold,
  # study-screens.css); Type it on a sentence with several ideas and no marks (a word pack's Het boek ligt op tafel., ligt left out) naming no idea, each idea
  # still a chip under the sentence (session.js typedAbout); LOCAL only, path-nl and the Dutch word packs seeded (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "speaking words check" --kind parallel -- \
  node 08-lexicommons/app/scripts/speaking-words-check.mjs http://localhost:<port> <outDir> [--only <regex>]
  # Say the word and Repeat the word on a phone, a learner six lessons in, the speech module a stand-in that hears what the check says (graded by
  # speech/match.js; no microphone, nothing heard or played): its English (or Play again) with the word not shown; said right, Right and recorded as
  # the game's own evidence (say-word recall/say, repeat-word recall/sound); a noun said without its article right; said wrong, two more tries, then
  # the answer, one row with what was heard, the word never written out before it; the word's drawing under the step; Can't speak now and Can't
  # listen now asking the same word another way there and then; every frame of a try on a drawn word (frame-watch.mjs, a planted jump caught first):
  # a wrong try moving nothing, the microphone where it was, and the answer moving nothing in one frame; then a deck's plain card said aloud (a
  # deck of its own): offered on the cards in the pack's language and not a reversed one, asked from its meaning with its text not shown, right and
  # recorded on its own unit (say, recall, say), a noun without its article, three wrong tries one row, Can't speak now another of its games,
  # every frame of a try, none offered where nothing listens; LOCAL only, path-nl seeded (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "say whisper check" --kind parallel -- \
  node 08-lexicommons/app/scripts/say-whisper-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]
  # Say it where Whisper is the recognizer (Firefox, any browser with no recognizer of its own), a stand-in speech module (no microphone, no model,
  # Whisper 2.6 s to load) on a phone: while the sentence is read Whisper is got ready, a load over a second says so and then the step's own line;
  # pressed, it listens with Whisper and the answer is taken; no page error. --from <copy> serves another copy's files (the app from before 12 Nov
  # 2026 fails it: the step's draw threw "can't access lexical declaration 'shown'"). LOCAL only, a copy with Dutch's lessons (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "probe guard check" --kind parallel -- \
  node 08-lexicommons/app/scripts/probe-guard-check.mjs http://localhost:<port> <outDir> [--from <copy dir>] [--persist-to <dir>]
  # the device's native probes (speech/probe-guard.js) on an Android phone's browser (Samsung Internet 30's user agent), the GPU's requestAdapter and
  # the recognizer's available() counted: opening Study asks neither (game-modes.js askSpeaking's light check), Say it asks both, their marks cleared;
  # a mark planted as if the page ended inside the GPU's probe told once at the next start (/api/errors, kind "probe-crash"), the GPU never asked
  # again and the recognizer still, nothing more told after; with --persist-to (the server's local state) the report goes on to the server and
  # its row is read back: one more probe-crash, the browser ("Samsung Internet 30 · Android"), screen and version (a server that drops it
  # fails). --from <copy> serves another copy's files (the app from before 12 Nov 2026 fails it).
  # LOCAL only, a copy with Dutch's lessons (exit 0 = pass). A new native probe goes through probe-guard.js guarded() with a name in PROBES
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "result layout check" --kind parallel -- \
  node 08-lexicommons/app/scripts/result-layout-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--files <copy>] [--only right]
  # a game's result on a small phone (study/session.js setBar, components.css's answer bar), muted: a planted line over the title caught first; Fill the
  # gap's wrong answers at 320 × 568 until a result has More and its sentence on two lines, then at 390 × 844; on every result no line of text over
  # another (as far as what clips it shows it), the title 12 px after the mark, More under the explanation in its column. Then right answers (Settings →
  # Games → Word for word on right answers), at 320 and 390 on a set plan: path-nl l018-1 right in Which is right? shows one word-for-word line, slid
  # into Dutch order, labeled Word for word with "search" marked and its order switch, no English-order line, fitting as an answered step; the switch
  # off, the English-order line alone; a miss as ever; a sentence whose word for word is its English, none; l018-1's Not word for word tag clear of
  # its card's words, answered; the same sentence in What does it say?: right, the same one Dutch-order line (on by default since 9 Nov 2026),
  # the switch off none, a miss its line, no hint offered before answering; every result's controls (buttons, links, the order switch, an idea's
  # row) drawn whole above Continue and any capped body's fade, by what each draws, never its 44 px box (data-fold folds Which is right?'s
  # choices and What does it say?'s card, then its explanation, whose idea's row opens it, checked) (--only right: these alone). --files <copy> serves that copy's /js and
  # /css (the app from before fails it). LOCAL only, path-nl seeded (exit 0 = pass, 2 = not reached)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "delete device check" --kind parallel -- \
  node 08-lexicommons/app/scripts/delete-device-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]
  # what deleting an account and clearing this device's progress leave on the device, by the real presses on a phone: after Delete my account no
  # IndexedDB store of the app's holds a row and no lx.* key is left, the kept word index and the plan's kept parts included (worked out from the
  # progress and the packs: know/word-index.js forgetWordIndex, study/plan-kept.js forgetPlanKept); Clear study progress on this device leaves no
  # answer and no unit in the kept index; a planted row and a planted unit found first. --from <copy> serves another copy's files (the app from
  # before 10 Nov 2026 fails it both ways). A new store of anything worked out from progress is cleared in settings.js forgetDerived. LOCAL only (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "settings values check" --kind parallel -- \
  node 08-lexicommons/app/scripts/settings-values-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]
  # a Settings row's value is never cut (shell.css: one wider than its room wraps): every page of Settings at 320 and 390, each value's words against the
  # box that clips them; a planted value held to one line and too long caught first. --from <copy> serves another copy's files (the app from before
  # 10 Nov 2026 fails it at 320: Sound and speech's Voices lost its start). LOCAL only (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "idea picture check" --kind parallel -- \
  node 08-lexicommons/app/scripts/idea-picture-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]
  # an idea's picture (study/concept-picture.js rulePicture) is the same whenever it reaches the page: each one built in place, then built off
  # the page and put on it 1, 3 and 30 frames later in the same spot, as a card on Knowledge's tab and on an idea's sheet, on a phone and a
  # computer: its sentence's size, box, lines and every stroke and label the same; one read before any frame told apart first. --from <copy>
  # serves another copy's files (the app from before 11 Nov 2026 fails it: a late picture was never fitted or drawn). On /design, no account.
  # Run it after a change to concept-picture.js (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "idea cards check" --kind parallel -- \
  node 08-lexicommons/app/scripts/idea-cards-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]
  # Knowledge's idea cards show their idea (know/cards-more.js sentenceOf, ideasNotes), the sample learner weeks in on a phone: each idea drawn on
  # a sentence of theirs that shows it (its pack's notes mark the idea's words, or it has its own shape), those words lit; one none of theirs shows
  # drawn plain, never every word dimmed; the tab's cards the Ideas page's first, on the same sentences; a card's sheet on its sentence; opened
  # straight at the Ideas page its cards there in the first frame. The ideas with such a sentence are counted from the sentences and notes, not the
  # cards. --from <copy> serves another copy's files (the app from before 11 Nov 2026 fails it). LOCAL only, a copy with Dutch's lessons (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "woven why check" --kind parallel -- \
  node 08-lexicommons/app/scripts/woven-why-check.mjs http://localhost:<port> <outDir>
  # a woven text says why it reads in English (read/reader.js whyEnglish; read/library.js; shelf.js wovenShare), new learners of Dutch on a phone:
  # Read's woven story row says "Woven · 0% in Dutch for you"; opened, the page is woven with no Dutch word and one card at the foot says why,
  # never two (a planted second card counted first); its cross puts it away for good on that text; a learner who knows a tenth of it or more
  # never sees it, and the row says their share. LOCAL only, a copy whose shelf has a woven story (npm run local) (exit 0 = pass, 2 = no story)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "leave copy check" --kind parallel -- \
  node 08-lexicommons/app/scripts/leave-copy-check.mjs http://localhost:<port> <outDir> [--from <copy dir>] [--cpu 1,4]
  # a copy of something leaving never shows what the original hid (lx/motion.js copyInside): every frame of every step's, result's and summary's leave
  # in a real lesson and a Practice, then each game they needn't bring alone, Japanese's first lesson (its idea's own step) and the kana deck, at normal
  # speed and slowed 4×; each part the page hid by opacity 0 (an unchosen tile's or choice's mark) marked
  # before the press, no copy of one seen in any frame after; a planted copy that shows one caught first. --from <copy> serves another copy's /js and
  # /css (the app from before 10 Nov 2026 fails it: the marks of the tiles you didn't pick flashed for 8 frames as a picture step left). Run it after
  # a change to motion.js's copies. LOCAL only, a copy with Dutch's lessons (npm run local) (exit 0 = pass, 2 = not reached)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tap speech check" --kind parallel -- \
  node 08-lexicommons/app/scripts/tap-speech-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>]
  # a word you tap in a game is said as you tap it (Settings → Sound and speech → Say the words you tap; voice.js speakTapped, session.js sayTapped), muted: what the page asks
  # to be said (speak()'s text, the clip an <audio> plays, a stop), never a sound. Put it in order's tiles at once as they go in (a recorded word as its clip,
  # another by the device's voice), a second tap at once stopping the first, a tile sent back and English tiles saying nothing; Listening's order (a tile tapped
  # while its sentence plays says nothing and stops nothing; once it's over, each said); a tap that
  # answers (Fill, Pick the word, Choose) saying no word alone with Answers on, the word tapped with it off; Match's words, not their English; a word tapped for
  # its meaning; the games' effects asked for (lx-sound events: tiles, right or wrong before the word, none on a skip, Match's steps, none at its end); the switch
  # off, Match off from before and Can't listen now saying nothing; Voices with one switch and no Match (a 390 still). LOCAL only, path-nl seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "concepts check" --kind parallel -- \
  node 08-lexicommons/app/scripts/concepts-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>]
  # Choose your concepts (study/concept-focus.js): the drawer lists All concepts (chosen while none is picked), then the concepts you've met with their sentences,
  # one with fewer than 6 (a small pack of its own plants one, whatever the server has) can't be picked and says why; a picked one bold with a check;
  # picked, Practice's own line on Study says so with the doors where they were, and the row names it; Practice, reviews, a quick session and every game keep to
  # its sentences and words, a lesson doesn't change; All concepts puts it back; nothing to ask says so; Practice's line at 390 and 320 in dark and light;
  # walk.mp4. LOCAL only, path-nl seeded (seed-local.mjs --default)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "learn more check" --kind parallel -- \
  node 08-lexicommons/app/scripts/learn-more-check.mjs http://localhost:<port> <outDir> [--only <regex>] [--from <copy dir>]
  # something to learn after every answer (study/learn-more.js), on a phone: one "?" on a right result and a wrong one in every game (each of plan.js's
  # GAMES alone; I don't know where nobody speaks) and on a shown Study card, 44 px, on the screen, clear of the result's words, named; its drawer the
  # data's own (a word as a dictionary has it with its meaning; a sentence's words as the language writes them, each only its senses here or how many
  # it has; Match's round, misses first), nothing recorded, Escape closing only it; inside, a word and an idea with the floating back; a word's forms,
  # lines, sentences and rank the data's, the word list's credit linked; a deck's card with every field filled carrying them all, one with none none;
  # a lesson's right answer with it, its idea in the lesson's words; a sentence with the other gender's form (otherGender) naming it in one line (A woman
  # says, A man says, To a woman, To a man, in the sentence's language), none without; a word's drawing from the lesson that first taught it beside that
  # lesson's own sentence, none beside a word pack's card of another sense (halen, stuk, band, kaart), its drawing alone; 320 × 568 light, nothing wider
  # than the screen. --from <copy> serves another
  # copy's /js and /css (the app from before fails it). LOCAL only, path-nl and the word packs seeded (npm run local) (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "desk check" --kind parallel -- \
  node 08-lexicommons/app/scripts/desk-check.mjs http://localhost:<port> <outDir> --base <copy dir> [--only <regex>] [--from <copy dir>] [--screens <regex>]
  # tablets and computers (docs/design-system.md, "Tablets and computers"): Settings from the sidebar with no way back (1024, 1180 by touch, 1440;
  # a page inside it back to Settings, at 1440 none beside the menu and a page further in back to its own; at 820 the menu back to its tab); split
  # (1280 and 1440 by mouse: Settings' menu in a 320 px pane beside its page, Settings itself opening Account, the page's row lit as the sidebar's tab
  # is with its avatar ringed, the pane kept from page to page and level with the page, the page 720 at 1440, gone on leaving; at 1024 the menu alone); Translate keeping the sidebar and the column, its box as tall as its
  # text (two lines to 40% of the screen, then scrolling), the language bar right under the box where its text starts, a toolbar's size, flat, its row language, swap, language, speak by eye and by Tab, the box a plain box, the swap still swapping, the answer under it, a sidebar tab leaving it; games
  # (744, 820 and 1180 by touch, 1024, 1440, 1920 by mouse; six games): the step and its bar one block in the screen's middle, the game right
  # under its question, Continue right under the game, the step still as the result comes, numbers on the choices with a mouse only; hover
  # (Home, Study, Explore, Knowledge at 1280 and 1440 by mouse, a learner weeks in: every link and button changes its look with the mouse on it); keys
  # (Tab from each tab's start: at 1024 and 1440 the sidebar first, then the header and the page in the order it's seen; at 820 the tab bar last); targets
  # (744, 820 and 1180 by touch, where component-check's walk doesn't go: sign-in, a learner's Home, Study and Knowledge, every game's question and
  # result, Study cards, a book in the reader: every control reaching 44 × 44, component-check's measure, running text and a typed gap exempt); tablet
  # (744 and 820 portrait by touch: Translate's box as tall as its text with the answer above the floating bar, Your words three to a shelf, the reader's
  # single page's text at most 640 px and centered, its picture wider); measure (1024, 1280 and 1440 by mouse: Study's packs, a pack's page, an Explore
  # item, Everyday's words, Translate's sources, Terms, Privacy, and in the wide column Study, Explore, Knowledge, Your words and the topics: no line of
  # reading text over 72 characters, counted as read; a page's line under its title where its column starts); wide (1280 and 1440 by mouse: the grid
  # pages, Study's, Explore's and Knowledge's own, Your words, the topics and Read, in a 960 column, games 4 a row, topics 6, words 4 a shelf; their lists
  # and forms, Home and Settings at 720 at the one frame's start, every page's title at one place; every block button in a page and its cards 240–360
  # at its box's start edge or centered in it (BUTTON_RULE); its rows and lists to the column's edge); the AI section (1024 to 1920 by mouse, an AI connected over MCP, four requests, one answered: from 1280 its own page the frame's width in two columns, Practice and what to ask for
  # beside an aside with the connection's card and the three newest unfinished requests, Your requests and Connection gone from the foot; at 1024 one 720 column with them at its foot;
  # narrowed and widened, the aside goes and comes back; not connected, the page's 720); settings and AI (1280 and 1440 by mouse, an AI connected: Report a bug's values within 220 px of their names,
  # Appearance's themes five to a row, an AI request's choices' marks right before their words, and Translate's language button, swap, bar and speaker, Read's
  # Add a book or text and See how it reads and a theme's tile each changing with the mouse on it); reading lines (1024, 1280 and 1440 by mouse, an AI connected, every part opened: on Your AI in Settings and in the AI section, a request's page and Appearance → CSS,
  # no line of reading text wider than its own --measure, commands to copy left out); first run (1024, 1280 and 1440 by mouse, opened at #welcome: the list the frame's width, the full courses and the
  # first lessons each in four balanced columns under headings across all four, First lessons' heading in the first view, the search 360 wide, a search
  # narrowing it to its match and a click picking it); read (a new learner by mouse: at 1024 the book up front beside its name and its way in, 380 × 240 at most; at 1280 and 1440, in the frame,
  # the book (its picture 560 × 300 at most, its name under it) and Weave your own as a card 360–400 wide side by side, Find a book under both the frame's
  # width; Weave your own in the first view, the lead shelf's covers one height, Your library's covers one height, 160, on Read's row and on its own page, a picture book's beside a title cover, bottoms level, no title's word broken); reader (1280, 1440 and 1920 by mouse, a text book from the shelf: its two pages' first line and its chapter's
  # heading under the top bar and where they were with the bar put away, the way back, the chevron, the page number and the gear at the book's edges, reading
  # settings a panel over the gear and Contents one under its button, 400 px at most, no handle, Escape and a press on the page closing them, an arrow in
  # the margin either side turning the page and nothing else, the one back dimmed on the first page, a picture book 1400 across at 1920 and 1100 under 1600); phones
  # (390 and 320: Home, Settings, Translate typed, two games asked and answered, Your words, the Knowledge tab (its top without the pile's tiles, which every visit lays out anew, This week and its idea cards) and the Ideas page, Explore (its home, the topics, a pack's page, Add your own), Study's packs, Everyday's words, Read, a book in the reader) pixel for pixel as --base's files draw them, both sides served
  # from files, animations off, the clock and Math.random fixed, Tinta hidden, a pixel changed past raster rounding (8 of 255); a book's photo (on Read's
  # shelf and in the reader) by its place, its size and its file's size, its own pixels left out (one photo scaled twice comes out a few hundred dots apart with the same files
  # both sides), with a word and a photo each moved one pixel caught first.
  # --from <copy> serves another copy's /js and /css (the app from before fails it); --screens <regex> compares only those of the phones' screens (to prove
  # one: --only '^phones' --screens reader). LOCAL only (exit 0 = pass)
  # Its files (11 Nov 2026, so the desktop lanes stop colliding in one file): scripts/desk-check.mjs only runs; scripts/desk/common.mjs holds the
  # arguments, the browser, stage() and every helper, with three registries (PHONE_SCREENS, WIDE_GRIDS, NARROW); scripts/desk/frame.mjs the
  # frame's stages (hover, keys, targets, tablet, measure, wide, split, phones: lx-app's); study.mjs, know.mjs and read.mjs each lane's own
  # stages ({ order, run }), phone screens (PHONE_SCREENS.push({ order, screens })) and grid and list pages (WIDE_GRIDS.push, NARROW.push).
  # Orders are tens apart and run in turn across the files; a page's check goes in its lane's file, a shared rule in common or frame.
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "know grammar check" --kind parallel -- \
  node 08-lexicommons/app/scripts/know-grammar-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>]
  # the Knowledge tab's ideas (know/cards-more.js ideasCard): none before you've met one; then "Ideas you've met" after your words, a card per pattern met with its
  # picture and how well ("Getting there · 3 of 4 right"), the least known first, each opening the sheet an answer does (study/after-answer.js conceptSheet) with your
  # own sentence; past four, the first four and See all N ideas, which opens the Ideas page (#know/ideas) with every one, its way back Knowledge; 390 and 320 in dark and
  # light; walk.mp4. LOCAL only, path-nl seeded (seed-local.mjs --default)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "knowledge cards check" --kind parallel -- \
  node 08-lexicommons/app/scripts/knowledge-cards-check.mjs http://localhost:<port> <outDir> [--theme paper]   # the Knowledge page as big cards (know/cards.js), as a
  # learner four weeks in: your words, the map, this week, the ideas, over time, in order, and no row leading to another page; every word started a chip in one of
  # four inks, the number Home's tile shows, a tap opening it in a sheet; Everyday's 1,000 commonest words as ten hundreds (each bar filled as far as its words
  # are yours, the one you're on outlined) and that hundred as a page, yours in ink, moving on once eight in ten are yours (79 of the first stays on Words
  # 1–100, 80 is Words 101–200, by words put in the word bank and taken out after); this week's number Home's own and Home's tile opening the page at it; each idea's picture lighting its words; over time's chart, bars and week
  # ahead; every control 44 px; a new account's way to start and an unlit map. LOCAL only, path-nl seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "pile drop check" --kind parallel -- \
  node 08-lexicommons/app/scripts/pile-drop-check.mjs http://localhost:<port> <outDir> [--proof 150] [--big 2500]   # the Words card's pile dropped in
  # on each visit (know/cards.js pileIn) on a 390 phone, new accounts with N words started: two visits in a row two different piles, every word falling
  # in from above the card; at rest no two tiles overlapping and none under the floor; 2,500 words slowed 4×: no long task, no frame gap over 100 ms,
  # at rest within 3 s; animations off: still, at random, two loads two piles; a frame strip of each visit, a video of the proof run and the still.
  # LOCAL only (exit 0 = pass)
  # A new theme: after one is chosen in Settings with Knowledge kept off the screen, and with Knowledge on the screen, no tile of the pile is
  # still on the old theme's ground, counted on its own canvas (--files <copy>: the app from before 11 Nov 2026 fails it).
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "home numbers check" --kind parallel -- \
  node 08-lexicommons/app/scripts/home-numbers-check.mjs http://localhost:<port> <outDir> [--widths 390,320]   # Home's two numbers against Knowledge's
  # (know/today.js, know/cards.js, know/cards-more.js) on a phone, each width its own device: day one played for real (lesson 1, a Practice, three games by
  # the shared player) has the done-log's lesson, practice and three games as games (study/done.js finishedGame), Home's words tile the words started (never
  # "0 words you know well") and Knowledge's Your words the same, Home's things done this week This week's number, saying what it came from and what one is;
  # a week in (right answers days apart) both turn to the words you know well, the same number; stills of each. LOCAL only, path-nl seeded (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "pack edit check" --kind parallel -- \
  node 08-lexicommons/app/scripts/pack-edit-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--only <regex>]
  # editing a pack of yours on a phone from a new account with no AI: a copy for anyone, its original read-only and off; list and search; what it means, a spelling fix, a rewrite
  # said first, everything else kept; delete and add; Undo exactly, holding only what changed; offline with nothing uploaded; what it promises; a deck's card; a pack on the
  # account, through the relay to a second device and an AI's list and Undo; dark, light, 390 and 320 wide; no word of an AI; LOCAL only, words-nl-01 seeded with seed-local.mjs --default;
  # any COMMUNITY_SHARING (its pack sharer is an admin, so wrangler.jsonc's own "admins" works as at launch)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "pack order check" --kind parallel -- \
  node 08-lexicommons/app/scripts/pack-order-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --pack packs/words-nl-01.json --pack … [--list <frequency.json>]
  # a device's default packs stay in the catalog's order: a band republished and synced, and the order, what's taught and what Translate says stay;
  # a device already in the wrong order put right; the catalog's order over the ids; the lists a person reads with the lessons first (it publishes
  # path-nl last if the catalog hasn't it behind other packs); LOCAL only, the packs seeded with seed-local.mjs --default
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "lessons first check" --kind parallel -- \
  node 08-lexicommons/app/scripts/lessons-first-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit] [--hold 5000] [--rounds 3]
  # a brand-new learner's first lesson is the path's lesson 1, never the starter's, on a phone in Chromium and WebKit with path-nl's file held 5 s:
  # each round a new account through the real first run; Home's Start 1.0 s after picking Dutch (or, while Home holds its card, the address it
  # opens) and Study's lesson door at 1.4 s (held while path-nl is: no link, so its address), open path-nl's lesson 1 once it's here (study/session.js waits:
  # packs.js lessonsComing); the path page while it's held offers no stop; after a first run of 20 s (--dwell), Home's Start and Study's door
  # path-nl's lesson 1 all the same (the wait counts from the sync); Study's Tap the picture pressed 1.4 s after, after a quick first run and a
  # slow one, waiting the same (a newcomer's game: session.js), its first word lesson 1's; path-nl asked for before any band; today's app fails it. LOCAL only,
  # path-nl and the Dutch word bands seeded (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "translate check" --kind parallel -- \
  node 08-lexicommons/app/scripts/translate-check.mjs http://localhost:<port> <outDir> --pack packs/words-nl-01.json [--pack …]
  # Translate's page on a phone, with its keyboard stand-in: the first key taking everything else away in that frame, the same
  # field keeping its focus; every way back (Back, the phone's back, Clear, deleting all, a reload, an empty cold open, a
  # page it opened); a press 3 ms into the move, and none with less motion; the best guess (a pack's sentence both ways, a
  # word, the word-by-word line, labeled, with what's not found marked, nothing); a word on both sides, one reading with the other under
  # the answer; what your packs have under the answer, in place (its sentences and other words, the credits folded; no button, no sheet; a key that
  # changes nothing it shows drawing none of it again); the main words (little ones out, each sentence really using its word, what you've
  # studied first); a word the language always capitalizes (study/written.js: Engels) shown as written, never as its key, in the best guess from English,
  # everything shown for the key typed and the word-by-word line (the page before shows the key), and the answer up following a changed decision with
  # nothing typed, both ways (a book on the device writing it lowercase: written.js onWritten; the page before keeps what it drew); speed with the processor slowed 4×, judged on the CPU Chrome's trace gives each task (its thread time: the 4× counts in it, a busy
  # machine hardly does; scripts/fixtures/trace-cpu.mjs): no script of the app's own, nor the page's style and layout, of 50 ms of CPU or more while the
  # last pack a sync fetches (the catalog's last band; the lessons pack comes first), held back until Translate is open, arrives, is checked and worked into the view (each named by the Long Animation Frames
  # API), a planted 80 ms task of the app's own caught as the control; Translate's open, the app's handling of the tap that opens it, under 35 ms
  # of CPU with under 5 of style and layout forced in it (the opened page laid out and placed in its frame: translate/page.js openWatch, shell/main.js focusin), the tap's whole input work
  # and the tap to the opened page's commit reported beside it; a key to its result under 100 ms from this device's first index on (before it,
  # the server's: the phrase stages), a key unanswered before the next one counting as slow and one this device knows nothing of left out, a slow one split into the app's CPU (the page and
  # the index's worker) and what it waited, set aside only when a probe's round trip measured the machine busy, which is NOT REACHED (exit 2, said in the
  # last line: run it again; a Translate landing doesn't count until it passes); what Home pays to catch up as Translate closes, reported; LX_PROFILE
  # and LX_TRACE write a CPU profile and Chrome's trace of the typing; a first query after a start answered
  # by the server while this device's index is still being made (its worker held 15 s); a phrase typed while this device can't answer for
  # itself yet, slowed 4× (translate.js coldAsk: the server asked at once, then one at a time, at most once in 300 ms, sooner only after an answer
  # that found nothing): right after a start with every message from the index's worker held (phrase), the same over a 500 ms round trip
  # (phrase-slow: answers keep arriving while typing), and a new device whose packs are all still coming (phrase-new); phrase and phrase-new
  # judged on the page's own share (a request out within 100 ms of when it was due, a reply drawn within 150, at 4×), then the screen's limits: a miss with a
  # server reply over 120 ms NOT REACHED (exit 2: run it again; the local server's slow replies under load failed them, 8 Nov), else FAIL; a page 600 ms late with each request
  # failed as phrase's control; an answer to its start
  # within 400 ms of the first key, in every frame after it and never 500 ms behind the typing, requests per key reported, the answer's box
  # unmoved as this device's own comes in; Translate left, its index's worker gone about a
  # minute on (translate.js LEFT), and opened again, the index kept on the device read back with no pack sent across, timed at 4× against the first build; a book
  # open in the reader holding the index past the minute (holdTranslateIndex), Read left for Study and the worker gone a minute on, a word looked up in the book
  # again answering from the index read back; an answer on the screen the same in every frame through a burst's new index and the look again
  # after it (the rebuild waits for typing to stop: translate.js TYPING_QUIET), a planted rebuild that resets the view caught (hold); packs
  # arriving in a burst (four packs and a 3,000-card deck, as G10's measure saves them) making one new index once
  # they're quiet (translate.js QUIET), keys typed while it's made answered before it (online, the server's way: translate.js rebuilding; the
  # old index is let go first, G10), its answers the same as an index made fresh, and with Translate left (another tab taken while it's
  # open: no page in view holds the index) none until it's used again, which makes one that has the new pack; Tinta only while there's nothing
  # to show (it comes in 600 ms after the last key: page.js LOOK_AFTER), and an answer coming while it looks (the server held, this device's
  # index held back) drawn at 4× in a task that forces under 5 ms of style and layout (Tinta's box read before the answer's writes) with what
  # your packs have made after the answer's frame, in a task of its own (draw; the code before: 32 ms, 11 forced, one task); Swap never bringing back an earlier query's answer (a cleared field, a new query not yet answered); a page rebuilt
  # for another language keeping none of the old one's resize listeners or observers; a server that's down never makes a false no, and Find a pack's Retry; the voice asked for each side in its own language, or saying there's none, with no
  # sound; 320–390 wide with a 400-character phrase, judged once the answer for what's typed is up (answered: the results' data-query); no worker;
  # Home's box under real taps at 390 and 320, at 1× and slowed 4×: anywhere but the way chip and the mic opens Translate, the box's middle too,
  # and the chip (a control of its own, 44 px, 16 px and more right of the middle) flips the way and opens nothing. With --persist-to <its state dir>, a book's sentences too (it seeds
  # scripts/books/seed-check-book.mjs and puts the catalog back), and Tinta's timing against a word only the book has: none for an answer the
  # server gives quickly, and for a slow one (the server held 1.5 s) the answer the frame it arrives while Tinta leaves over several frames (never
  # one), the answer staying put; the page before this fails it. What it expects read from the pack files and the server's other default packs
  # (path-nl, when the local library has it); a read waits for the answer to what's typed (the results' data-query); LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "translator check" --kind parallel -- \
  node 08-lexicommons/app/scripts/translator-check.mjs http://localhost:<port> <outDir> [--packs]
  # the full translator on a phone, as a new account: a limited answer offering it with the download's real size, last in the foot;
  # Not now kept through a reload; Stop going back to the offer, never remembered as Not now; a file that isn't the one listed
  # refused and never kept (a PLANT), Retry, and what was typed meanwhile answered once it's here; then its answer as the best guess
  # both ways, which way said by it where the packs can't (never an answer the wrong way first), offline too; Settings → Translate
  # listing it with Remove, every file gone, the offer back; downloading in place there (Stop pressed by a finger and by a mouse held while the download moves on under it, and carried
  # to done; the files slowed by context.route, which reaches the translator's worker where a CDP throttle doesn't); the translator
  # never failing to answer; Swap going the way the translator read when the packs can't tell (offline); a new account whose word packs are still coming (a slowed connection): the offer at once under their
  # line, a Download waiting for them with nothing asked for until they're in, Stop, then starting by itself (--packs: the server
  # has default packs, and this stage must run); pictures of each state at 390 in Graphite and Paper. LOCAL only, the files seeded
  # (models-r2.mjs --local <its state dir>)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "dictation check" --kind parallel -- \
  node 08-lexicommons/app/scripts/dictation-check.mjs http://localhost:<port> <outDir>   # which recognizer Translate's microphone gets, on a
  # stand-in iPhone Home Screen app, Android and a computer (the browser's first, a model on the device changing nothing, Whisper only for who chose it on a
  # phone, a recognizer that really refuses), and what stops Whisper taking the app down twice (speech/guard.js): the page's process killed with SIGKILL while
  # Whisper loads, is held and is writing, the next press and Say it on the browser's, Settings saying so, Try Whisper again, and no false alarm from a reload, a
  # closed page or a second tab. Whisper's worker is a stand-in, so nothing heavy runs; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "app check" --kind parallel -- \
  node 08-lexicommons/app/scripts/app-check.mjs http://localhost:<port> <outDir>   # the app, 27 stages; LOCAL only, on the main config or a
  # self-host copy (npm run local): Settings' Sync across devices row expected only where /api/me offers a store, and an answer's sentence
  # said as itself, by its recording or the device's voice (what's said, never playbackState's last clip)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "frame check" --kind parallel -- \
  node 08-lexicommons/app/scripts/frame-check.mjs http://localhost:<port> <outDir> [--plant] [--only sessions,lesson,press,order,ghost,interrupt,around,pages,sheets,text] [--games a,b] \
    [--vw 390 --vh 844] [--motion off] [--theme <id>] [--custom] [--lang <code>] [--slow-net <ms>] [--engine webkit] [--expect scripts/fixtures/frame-expect.json] \
    [--crawl-minutes <n>] [--routes '#a,#b'] [--swap <path>=<old file>]
  # what a person sees move: scripts/frame-watch.mjs records every frame while this plays the app by real touch (a ghost joined to what it stands for), and finds teleports,
  # parts of one group moving at different times, things unseen for a few frames, words on screen falling away, size jumps, a press landing elsewhere, scroll jumps, focus
  # lost, and at rest what's off the screen, covered or cut off. Candidates with the frames around them, to look at; --plant first proves it catches each planted glitch
  # (exit 3 if not). press: a tap whose click never comes (iOS), a rolling finger, two fingers, a drag. order: Hint and the toggle only where there's something to show.
  # interrupt: the next press at 0–250 ms into the last one's move. text (only when named, it takes a while): every route, every control and what it opens, each field, as a
  # new account, as someone who has studied, offline and with the server failing, for the words only code prints (null, undefined, NaN, [object Object], Invalid Date, a whole
  # true or false; every group finds them in its own scenes too). --expect fails on any class that's back. LOCAL only, the Dutch word packs and path-nl seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "frame watch check" --kind parallel -- \
  node 08-lexicommons/app/scripts/frame-watch-check.mjs <outDir>
  # frame-watch.mjs itself on scenes of its own (no server): a sheet sliding off the screen's foot, or coming up from below it and turned back, is no
  # teleport (a row coming onto the screen or going off it isn't seen still), a full-screen layer fading in over a page is no blank-flash (it hides what's
  # under it once its fade is half way), a page slid off the screen being scrolled is no scroll-jump, and the page's words gone under a picture of a page
  # showing its own (page-slide.js's, read through lxRoot) is no blank-flash, nor a session's cover held below the screen then rising (a layer hides
  # only what's under its own box), and a part fitted by a ResizeObserver in the frame it comes in is no teleport (each frame is read once it's
  # rendered, from a message posted in its rAF), nor a layer slid by a transform animation sampled through a 150 ms stall (a part in such a layer
  # is judged against the layer's own move); still caught: a part jumping inside a sliding layer, a tile at the foot jumping and staying, one mid-screen, the
  # layer's words hidden for 2 frames, a page on the screen scrolled 300 px with nothing pressed. Tabs pressed three frames apart (pages kept as shell/main.js
  # keeps them, out of the document while another shows): a page's parts leaving with their page and back with it no disappear, each tab's state following the
  # page shown no state-flicker; still caught: a word hidden three frames on the page that stays, a tab's state flicking with no page coming in (exit 0 = pass)
ELEVENLABS_API_KEY=… node scripts/voice-pack.mjs --voice <id> --slug <name> --name <Shown name> [--about "…"]
                                          # voice the starter deck (sentences with word timings + words) into public/audio/
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "anki check" --kind parallel -- \
  node 08-lexicommons/app/scripts/anki-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--deck <real.apkg>]…
  # adding an Anki deck through the real page on a phone: the parser nowhere until asked for; every generation of the file; a plain report of what it got and
  # what it asks when it's unsure; a session played with its evidence on the card's own unit; only the games a card can carry; its sound kept
  # on the device; hostile decks that run nothing and fail in words with the page answering; a big deck's cap on a slowed phone; long cards on a small phone;
  # sharing one (only the words go up), someone else adding and studying it, Explore's tools, a report and the moderator's case; deleting it; offline;
  # LOCAL only, a fresh state, --var COMMUNITY_SHARING:everyone
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "recheck" --kind parallel -- \
  node 08-lexicommons/app/scripts/pack-recheck-check.mjs http://localhost:<port> <outDir> [--cpu <rate>]
  # what a change to the pack check costs a returning learner with every word band stored, on a slowed phone: proofs from before plain cards still trusted,
  # the app ready as soon, and the control (every band checked in full) for scale; every band hashed in the worker (study/pack-hash-worker.js), none on
  # the page, the start waiting under 250 ms for it; LOCAL only, the word bands seeded as default packs
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "lessons end" --kind parallel -- \
  node 08-lexicommons/app/scripts/lessons-end-check.mjs http://localhost:<port> <outDir>   # where a language's lessons run out, on a phone, in Swahili and Arabic: Study's row,
  # the page, asking through the real sheet, the next person joining that request, Explore's invitation, Yours; LOCAL only, those starters seeded, --var COMMUNITY_SHARING:everyone
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "study check" --kind parallel -- \
  node 08-lexicommons/app/scripts/study-check.mjs http://localhost:<port> <outDir> [--list <frequency.nl.json>] [--only <regex>]   # Study on a phone, from a brand-new account: a first lesson
  # as the one thing, a lesson asking from its first question, a miss coming back, what it taught; Practice as the card, only on what's been taught, the suggestion every third;
  # the path, a lesson's bubble up through a scroll the app makes and gone on your own (a wheel, a finger), jumping ahead saying no and yes, the end of the written lessons, Choose the games, Study cards among the games and no More ways; no drawings, no voice, a light theme, an old account; Can't listen now and Can't speak now swapping a
  # question in place; Choose the games from inside a session, and its floor; Study a topic's sheet (none: the way to Explore; a topic pack the
  # library offers: how far its lessons are, pressed into its session, needs seed-local.mjs --opt-in packs/nl-food-1.json); LOCAL only, path-nl and the word packs seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "concept lesson check" --kind parallel -- \
  node 08-lexicommons/app/scripts/concept-lesson-check.mjs http://localhost:<port> <outDir> [--theme paper]   # a lesson's idea and its English on a phone
  # (study/session.js, after-answer.js conceptView, reword.js): the "One idea" step is the idea's card, its picture on the sentence; no Idea button before it, one
  # on every step the planner marks after it (step.idea), opening the card over the step with nothing graded and Escape closing it, saying the lesson's own line
  # for the idea and never the catalog's Why (after-answer.js lessonLine: a Why can name what the lesson hasn't met); a lesson with none has none;
  # a reworded sentence tagged Not word for word on its card, its word-for-word English right too where the planner allows it (step.also), its answer giving word for
  # word and why before any idea's row, one that isn't neither; a translate step's answer its English; Study cards the same (none with the card's English off). Where the planner sets no step.idea or step.also yet it
  # sets them itself and says so; LOCAL only, path-nl seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "notes check" --kind parallel -- \
  node 08-lexicommons/app/scripts/notes-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # a default pack's notes: an admin's refusals and publish over MCP, served; a device taking them with its packs, a start offline
  # with the app's worker, saving data, a new version of the pack keeping them and a changed sentence having none; LOCAL only, path-nl seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "plain day check" --kind parallel -- \
  node 08-lexicommons/app/scripts/plain-day-check.mjs http://localhost:<port> <outDir>   # plain items in Practice and Reviews on a phone, from a new account: a pack of yours after the first
  # lesson (met, asked, a miss back, named at the end), an imported deck's new cards out and what you played of it back when due, its count, a round of Match taking one and a miss named,
  # Choose the games swapping a plain card's game, a language with only your own items (one the library and the device have no pack for: `npm run local`
  # seeds every starter, and Finnish's has lessons); LOCAL only, path-nl seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "session record check" --kind parallel -- \
  node 08-lexicommons/app/scripts/session-record-check.mjs http://localhost:<port> <outDir> [--only <regex>]   # what a session records, where it
  # went wrong before (study/session.js), each stage a new account that knows its words: Choose the games closed on a finished session's summary
  # never counts it again; a word missed in Match is recorded wrong even when its tile shows another form (ga for gaan); pairs answered in a round
  # left before its end are kept; a microphone still being set up when the session closes never starts (the speech module held, and that hold
  # counted); Escape and Enter with Choose the games open are the sheet's, not the session's. Each stage fails on the session.js from before;
  # LOCAL only, path-nl seeded (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "first session check" --kind parallel -- \
  node 08-lexicommons/app/scripts/first-session-check.mjs http://localhost:<port> <outDir> [--list <frequency.nl.json>]   # a
  # brand-new learner's first session on a phone: new words on one-word cards, a tap on any word showing its meaning and
  # recording nothing, no grade on first sight, Match and What does it mean? on words it taught, only those graded; with words
  # known, whole-sentence games on what they can read and a due word in a sentence not had yet; Fill's sentence, an answer's
  # line and the Words sheet free; no flagged sentence a new word's start; LOCAL only, the Dutch word packs seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "picture check" --kind parallel -- \
  node 08-lexicommons/app/scripts/picture-check.mjs http://localhost:<port> <outDir> [chromium|webkit]   # word pictures and
  # symbols in the real app, Chrome and WebKit: inline under the real CSP and worker, in color and in the theme's ink, any
  # number on a screen (with a control that a collision would fail), refusals, kept offline, a redraw replacing what's kept; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "reaction check" --kind parallel -- \
  node 08-lexicommons/app/scripts/reaction-check.mjs http://localhost:<port> <outDir> [chromium|webkit]   # a picture's reaction in the real game on a phone screen: the story from the still
  # after the card's pop or shake, its last pose held; a wrong tap's right tile too; Continue mid-story leaving nothing running; a press finishing it; only the still with animations off, no
  # story file or a redrawn still; no pictures at all; a small phone; no ids colliding; nothing still running once the longest story among a question's
  # pictures has had its time (a wrong tap plays the right tile's happy beside it); ONLY=<words of a stage's name> runs just those stages; LOCAL only, path-nl seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "knowledge check" --kind parallel -- \
  node 08-lexicommons/app/scripts/knowledge-check.mjs http://localhost:<port> <outDir> [--list <frequency.nl.json>]   # the scheduler on a signed-in
  # device: past evidence → what's due and what a session picks, predictions kept, Remembering, get_learner; the Knowledge page's cards on that
  # evidence (the cards drawn in order, Everyday's share and credit, Over time's gain and read · by ear · say, the ideas, Everyday's thousand with a
  # word from your reading, this week, the week ahead, search, what's slipping); LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "streak check" --kind parallel -- \
  node 08-lexicommons/app/scripts/streak-check.mjs http://localhost:<port> <outDir>   # the streak on Home: a fresh
  # account, past sessions, a real session making today count, a rest day, mending, a pause, days from the evidence,
  # Settings → Streak from Home's streak (a week paused and ended, picked days, a backwards pause refused),
  # Welcome back after days away (today's share of the pile), the summary celebrating (the seventh day's milestone, its
  # sound asked for through lx/sound.js while muted, its share card shared or saved at 1080 × 1350 with Tinta above the number and
  # the words under it, centered with no Tinta; Day 1 with the sound off; nothing
  # on a second session the same day; Tinta above the number, hidden and taking no presses: a heart at the milestone,
  # a hop on day 1, nothing on the second session), the log gone with the account; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "streak page check" --kind parallel -- \
  node 08-lexicommons/app/scripts/streak-page-check.mjs http://localhost:<port> <outDir>   # the streak's page from a new account given a year of
  # studying: Home's streak, all of it (the number, the week row), opening it, one link with none inside, Back to Home; twelve months newest first,
  # the weekdays over each; today chosen and ringed; a tap on a past day saying the word known well that day, its lesson by title, the minutes
  # read; a tap on a heavy day (three words with 2,880 answers each, the processor slowed 4×) moving the ring under 50 ms and its words coming after
  # with no task over 120 ms; a plain day said plainly, "missed" nowhere; each month's days one control of 44 px and more, the arrows moving the
  # day; pictures at 390. Today's app fails it; LOCAL only, path-nl seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "install check" --kind parallel -- \
  node 08-lexicommons/app/scripts/install-check.mjs http://localhost:<port> <outDir>   # Add to Home Screen as each
  # device by its user agent: Home's row (phones, once something's finished; Not now remembered), Safari's steps,
  # Find your device's steps, Android Chrome's, another app's browser, a computer's own install prompt, About's row,
  # the app already added; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "home cards check" --kind parallel -- \
  node 08-lexicommons/app/scripts/home-cards-check.mjs http://localhost:<port> <outDir> [--book <shelf title>]   # Home's cards (know/home-cards.js;
  # the bible's "Home's cards") as an iPhone learner a few days in, an AI connected, reminders paused: no Last 4 weeks yet and no More to do; the
  # notices as doors (Reminders never says what went unanswered, Not now the cross); Read's own book with no book; with one, the Reading heading's
  # All books and the book on its teal tile (no border, a hard edge in its deep tone, its name on the cover), shut coming up the screen, open a
  # quarter down, shut again, open at once with animations off; Your AI under its own heading, its exchange drawn, Tinta clear of both lines (a tap on his ink a poke, his alone; beside his drop, the card's: it sinks and opens), Your
  # turn; at 320 every title whole. The layout before (filled cards under More to do) fails it. LOCAL only, with the open library (npm run local)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "sw check" --kind parallel -- \
  node 08-lexicommons/app/scripts/sw-check.mjs http://localhost:<port> <outDir>   # the service worker in Chrome: it
  # installs, activates and takes the page, its cache holds every file in SHELL, with the network off the page and
  # every file it asks for come from its copy, back online from the network through it; a first open, then a cold
  # start with the network off (Home, Study, a session's first step, every file from the worker), a recording played
  # offline and one with no copy read by the device's voice (the app's own recordings as a 206 from the worker; on a
  # server whose library has the starter's recordings, the library's: every clip kept after the sync, played from the
  # device's copy, none kept while saving data), a 401 and Sign out forgetting who you are; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "update check" --kind parallel -- \
  node 08-lexicommons/app/scripts/update-check.mjs http://localhost:<port> <outDir>   # a new version while the app
  # is open, on a phone with the real worker: the check deploys one itself (it rewrites the served copy's sw.js VERSION
  # and puts it back after), but only once the worker is quiet and a revalidation gets the new file. Before that,
  # wrangler dev still answers the old ETag with a 304, and Chrome's own look after a reload, held while the worker is
  # busy, finds the new version even for an app that never looks. A first open and a look with nothing new show
  # nothing; one deployed mid-session is found when the app comes back into view, shows nothing until you leave the
  # session, then Reload is the new version with the history and its place kept; one shown before a session starts is gone
  # through the session and back after; a page left open from its first open is offered the next one; Later keeps it hidden. LOCAL only,
  # one at a time on a copy (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "push check" --kind parallel -- \
  node 08-lexicommons/app/scripts/push-check.mjs http://localhost:<port> <outDir>   # reminders in Chrome: the ask after
  # a first session as a step of its own after the summary's Done (the summary itself without it), its time that session's hour, Not now and Turn on
  # in the bar, shown once (Done the next time goes straight out), a double click on Done asking nothing (the forward button's double-tap guard, where
  # Done was); one Tinta, beside its title, clear of the words; the step and its controls whole
  # at rest at 390 × 844, 375 × 667 and 320 × 568, as is the iPhone tab's (Not now and Show me how), Settings → Reminders (turning on with a
  # stand-in subscription, the account's time that same hour, each switch,
  # the time and quiet hours at 16px, saved in order with the first held back, Send a test with the server's answer played and a save answered after it never saying Saved. over
  # that answer, off), a push shown by the service
  # worker, an iPhone browser tab sent to the Home Screen; LOCAL only, the server started with a local VAPID pair in
  # .dev.vars (`node scripts/vapid-keys.mjs --local .dev.vars` where wrangler dev runs; delete it after)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "packs check" --kind parallel -- \
  node 08-lexicommons/app/scripts/packs-check.mjs http://localhost:<port> <outDir> --persist-to <its state dir>   # packs on
  # a signed-in device: saved and checked, what studying draws on, one pack alone, nothing on, German apart, public packs
  # from the library (their recordings played from the library, kept for offline and credited; a new version keeps
  # progress, a bad file refused, follow, offline start), the packs and language
  # pages (on and off, a pack's page, its voices, actions from elsewhere, German picked there renaming every screen),
  # a practice in German with its AI played over MCP (the language reaching every side, its evidence German), your
  # AI's packs over MCP on two devices (refused when wrong, taken by the device's own poll with Undo, add, change,
  # take out, rename, undo from the AI and the app, a pack one device never had, a delete reaching both; recordings your
  # AI makes for a pack of yours on both devices, gone from the server once both have them, played from each), export
  # and delete; LOCAL only, and it puts the local library's catalog back as it found it
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "poll pace check" --kind parallel -- \
  node 08-lexicommons/app/scripts/poll-pace-check.mjs http://localhost:<port> <outDir>   # the pace of the app's two polls (lx/look-sync.js,
  # study/pack-inbox.js) on a phone, a new account: with no AI connected each asks once a minute while the app is in use (every 4 and 5 s was most of
  # D1's load at a launch's busiest hour), each wait 54-66 s so two apps started together drift apart, never in lockstep (lx/retry.js jittered); a
  # look changed on another device arriving within a minute and at once on coming back into view; your
  # AI's pack on a device not yet told of it the same; told of it (as ai/connection.js does), both back to the AI's pace, the control; the app from
  # before fails its quiet stage. A check that makes a token behind the app's back tells the device as the AI section's page does; LOCAL only (exit 0 = pass)
node scripts/test-retry.mjs               # the server's overload tried again, and a connection's return spread out (lx/retry.js), with fetch, the clock and the
                                          # window's events stood in: only a 503 with Retry-After and code "overloaded" tried again (a gate's 503, an OAuth endpoint's,
                                          # a 500 and a 429 not); a read, an idempotent write (the device's state, a look's image, the AI's record) and any other write
                                          # only when the server says it wasn't applied; at most 3 more tries, each its Retry-After plus a random part of 0.5, 1 and 2 s,
                                          # the waits filling their windows; never offline, past 5 s, a body that can't be sent twice or a stopped request; onReconnect's
                                          # 0-30 s once per return, offline again cancelling it; the start's calls and the polls through fetchRetrying, the
                                          # background's online listeners through onReconnect; each rule catches a plant first (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "overload check" --kind parallel -- \
  node 08-lexicommons/app/scripts/overload-check.mjs http://localhost:<port> <outDir> --upstream <the copy's port>   # the app when the server is
  # overloaded, on a phone, a new account, through scripts/fixtures/overload-server.mjs in front of a copy (503, Retry-After: 1, code "overloaded", as
  # app.ts answers a D1 overload; the copy's origin the front's: wrangler dev --var PUBLIC_ORIGIN:http://localhost:<port> --local-upstream
  # localhost:<port>): a sign-up and its first start, then a return start, every request to /api/ and /library/packs/ refused once, each answered after
  # its Retry-After with nothing on the screen; 90 s in use at the AI's pace with 40% refused at random, every call answered, each wait in its window,
  # the polls on pace; a write not said unapplied sent once (its caller given the server's words), one said unapplied sent again; back online, the polls
  # spread over 0-30 s. Each call's tries told apart by a tag on the page's fetch. The app from before fails all five; LOCAL only (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "sync check" --kind parallel -- \
  node 08-lexicommons/app/scripts/sync-check.mjs http://localhost:<port> <outDir>   # two devices of one account
  # syncing through a Dropbox played from memory, beside the account's own copy: Settings → Sync across devices (through your account
  # with no storage of your own), progress and packs (a file per pack) replaying the same on both, a clash, a delete staying deleted, the
  # relay after a synced copy, your AI's recordings reaching a device through the storage alone, clear everywhere and Undo, two tabs,
  # with the account's copy refused at the browser (off or full) Dropbox alone carrying answers, a new pack and a deletion (and with Dropbox
  # out of reach too, nothing: its control), disconnect (on through your account). LOCAL only, on the main config's values (npx wrangler dev --persist-to <state> --var
  # GATE_ENABLED:false --var PUBLIC_ORIGIN:http://localhost:<port> --var RP_ID:localhost …): npm run local's copy offers no storage, so
  # every stage would time out there
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "lang check" --kind parallel -- \
  node 08-lexicommons/app/scripts/lang-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --langs sv,nb,da
  # new languages end to end: each packs/starter-<code>.json published through the admin tools (a test admin written
  # into local D1), found and added from Explore with its flag, picked in Settings → Language, every screen naming it,
  # every game played with its evidence in the language, the device voice asked for its locale (a recording fake,
  # nothing heard); LOCAL only, and it puts the catalog, Explore's index and D1 back as it found them
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "auth check" --kind parallel -- \
  node 08-lexicommons/app/scripts/auth-check.mjs http://localhost:<port> <outDir> [--standin-port 8828] [--apple-key <file>]
  # signing in end to end, with stand-ins for Google, GitHub and Apple (scripts/auth-standin.mjs, started by the check);
  # --apple-key <file> (a test key: auth-standin.mjs apple-key <file>) expects Apple on and runs its stages: its colors, a
  # sign-up, signing back in, a cancel, tampered answers and a client secret checked against another key refused; without
  # it, no Apple. LOCAL only, and the local server needs the stand-in vars from the script's header
node scripts/test-account-email.mjs       # an email on the account (src/account-email.ts) on the real migrations, Email Sending played in memory: an
                                          # address; codes (six digits, every one as likely, only the hash kept, 15 minutes, 5 tries, used once even by two
                                          # right answers at once, 5 an hour per account and per address, also asked for at once); adding, replacing (the old
                                          # one told), one on another account; getting back in answering alike for any address; no email with a link; a site
                                          # without it offering none (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "account email check" --kind parallel -- \
  node 08-lexicommons/app/scripts/account-email-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --server-log <file> [--off]
  # an email on the account on a phone: Settings → Account → Email adding one by its code (read from the server's log: wrangler dev writes
  # each email there and sends none), Remove asking twice; a phone that lost its passkey getting back in from sign-in, then a passkey on it and
  # signing in with it; an address on no account answered alike with no email; five wrong codes; 16px fields; the export; the account deleted
  # taking it; pictures. --off: a server with EMAIL_FROM empty shows none of it and its routes refuse. LOCAL only (exit 0 = pass)
node scripts/scopes-check.mjs http://localhost:<port> <outDir> --persist-to <dir>
                                          # what an AI app's token may do is what the consent page said, over HTTP as an AI app: learn:read
                                          # alone lists and runs only the read-only tools (a write refused, nothing in D1); no scope named
                                          # shows reading and writing, and gets both; both scopes and a personal token write; a consent page opened as one
                                          # account and approved after switching to another grants neither (app.ts consentMark); LOCAL only (exit 0 = pass)
node scripts/register-check.mjs http://localhost:<port> <outDir>   # registering an AI app (index.ts, before the provider): a real client's works;
                                          # one past 16 KB refused; a burst from one connection meets AUTH_LIMITER (429, Retry-After); LOCAL only (exit 0 = pass)
node scripts/auth-limit-check.mjs http://localhost:<port> <outDir>   # AUTH_LIMITER on a passkey ceremony (accounts.ts limited, wrangler.jsonc): only
                                          # the options call counts, 60 a minute per connection (a school or an office behind one address): a flood's first
                                          # refusal no sooner than the 61st start, in words; a verify not counted with the starts; a sign-in's start sharing the
                                          # count; made-up verifies (each a D1 write) held to 60 a minute on a count of their own; the app from before (30,
                                          # verify counted) fails it; LOCAL only (exit 0 = pass)
node scripts/auth-body-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # a passkey ceremony's answer that isn't one (accounts.ts
                                          # ceremonyAnswer): each verify route (sign-up, sign-in, a new passkey) given a fresh challenge, then a body no
                                          # browser sends (not JSON, empty, an array, null, a number, a string, a sign-in's id not text): a 400 in words
                                          # every time, error_groups and error_hours unchanged; the app before (500s, each reported) fails it; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "signups check" --kind parallel -- \
  node 08-lexicommons/app/scripts/signups-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--standin-port 8829] [--server-log <file>]
  # new accounts paused (SIGNUPS, src/signups.ts) on a phone with a virtual passkey and the stand-in providers, the switch set over REST: the sign-in
  # page and ?new=1 saying so in place of the create form (light, dark, 390, 320); a passkey sign-up's first step 503 in words (signups_paused,
  # Retry-After) with nothing counted or written; a page loaded before the pause showing the words with no passkey made; one whose options came
  # before the pause finishing; a new Google sign-in told with nothing written, a linked one signing in; an existing passkey signing in; a create
  # step from before saying so and finishing once open; open again, a sign-up; with --server-log (LOGLEVEL=log), the watch's lines counted. LOCAL
  # only, auth-check's stand-in vars (exit 0 = pass)
node scripts/session-limit-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--db <name>] [--origin <PUBLIC_ORIGIN>]
                                          # what one connection can make D1 do with no account (SESSION_LIMITER, ERRORS_LIMITER): a school's class behind one
                                          # address (120 real sessions, a start's calls and two polls each) never refused; a flood of made-up session cookies
                                          # refused past 1,200 a minute (the refusing minute let exactly 1,200 through: wrangler's limiter counts by the wall clock's
                                          # minute, so the class starts at the top of one and nothing else may talk to the server), 429 in words with Retry-After
                                          # (code "rate_limited", never retried), a page's refusal as text; a preview cookie on a public file still served; error
                                          # reports past theirs dropped, still 204. On a lever copy (x-d1-sql) it also shows a refused cookie never looked up. The
                                          # app before the limiters fails it; LOCAL only (exit 0 = pass)
node scripts/test-revoked-grants.mjs      # a revoked connection stays revoked (src/revoked.ts) on the real provider, KV in memory, D1 as SQLite: a
                                          # revoke landing inside a refresh (with no guard, the control, the grant comes back; through /token, refused and
                                          # nothing left), a kept answer after a revoke, MCP's check, a marker D1 can't read (503), the sweep (exit 0 = pass)
node scripts/revoke-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # the same over HTTP: Settings' disconnect marks it (MCP 401,
                                          # /token 400); a grant marked while KV still holds it refused on both, one not marked going on; deleting the
                                          # account marking every connection, the marker naming no one; LOCAL only (exit 0 = pass)
node scripts/test-refresh-once.mjs        # the refresh guard (src/refresh-once.ts) on the real provider, KV in memory, D1
                                          # as SQLite: answers that can't be kept, stalls, made-up tokens, clients that
                                          # change, Basic, CORS (exit 0 = pass)
node scripts/refresh-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--standin-port 8828] [--reproduce]
                                          # a refresh token used twice gets one answer (src/refresh-once.ts), over HTTP as an
                                          # AI app: Claude Code's race, refreshes at once, other clients, forged tokens, the
                                          # window, D1's rows; --reproduce shows the race on a server without it; LOCAL only,
                                          # auth-check's server vars (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "theme check" --kind parallel -- \
  node 08-lexicommons/app/scripts/theme-check.mjs http://localhost:<port> <outDir>   # theming + the look on the account + MCP; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "speech check" --kind parallel -- \
  node 08-lexicommons/app/scripts/speech-check.mjs <baseUrl> <outDir> --models whisper-turbo,whisper-small --browser --set full
  # both recognizers through Chrome's fake microphone (never out loud), and the /design demo; exit 0 = pass
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "practice check" --kind parallel -- \
  node 08-lexicommons/app/scripts/practice-check.mjs http://localhost:<port> <outDir>   # Practice with your AI end to
  # end, its AI played over MCP; LOCAL only. practice-live.mjs: against a real AI (docs/practice.md)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "ai check" --kind parallel -- \
  node 08-lexicommons/app/scripts/ai-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # requests for your
  # AI (each kind from the app, its AI played over MCP: taken, answered, a pack made over the relay, couldn't, canceled,
  # a practice started), the AI tab (Practice with me the one card, its bubbles sentences you know each on one line; the kinds as rows;
  # who's there and when at the foot; your requests' page with every state, an answer's page, a pack sent and canceled; Practice under
  # it) and Translate (online, offline, a kept book); LOCAL only; it puts the local catalog back
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "own key check" --kind parallel -- \
  node 08-lexicommons/app/scripts/own-key-check.mjs http://localhost:<port> <outDir> [--off]   # a key of your own for the in-app AI
  # (ai/own-key.js), with a FAKE key and a stand-in OpenRouter: Connect (PKCE, a wrong verifier refused) and a pasted key checked
  # first; the key sealed (not as text in IndexedDB, either storage or the page; its sealing key not extractable); a practice
  # run here on it (the AI opening, a turn graded into evidence, the summary; every provider request with ZDR, no data
  # collection, nothing of the account); the key in no request to this server (a planted leak caught); the CSP refusing an
  # unlisted provider; a hostile look reaching nothing; sign-out taking every key. --off: a server without OWN_KEY_ENABLED shows
  # none of it and refuses it. LOCAL only (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "hosted ai check" --kind parallel -- \
  node 08-lexicommons/app/scripts/hosted-ai-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--standin-port 8829] [--real]
  # the in-app AI on the plan, on a phone: no plan, none of it; on it (a subscription row in local D1), the AI page's Practice row, the choice
  # drawn in place, a practice on Lexicommons' key (the server's request ZDR and low effort, the device sending only which practice, nothing
  # from the page to a provider), a turn graded, the meter by OpenRouter's cost and no words kept, used up and back, the summary, Translate
  # with AI's call, the plan ending. OpenRouter and Stripe a stand-in it serves (the server's vars are in its header); --real: the real
  # OpenRouter on the server's own key, every call's cost in <outDir>/spend.jsonl. LOCAL only (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "ask check" --kind parallel -- \
  node 08-lexicommons/app/scripts/ask-check.mjs http://localhost:<port> <outDir>   # Ask anything: the "…" on Study's
  # result, a concept's page and a word in the reader; its menu and keys, Explain this (what it
  # carries, Undo), the sheet, Copy the question, no key reaching the session; LOCAL only (the reader's stage needs
  # the live library in the local state)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "sheet check" --kind parallel -- \
  node 08-lexicommons/app/scripts/sheet-check.mjs http://localhost:<port> <outDir>   # the drawer on a touch phone, real
  # touch input: over the tabs with the page shaded, sliding in, following the finger, springing back, sliding away past
  # a quarter or flicked (on a busy phone too, its handlers late), its content scrolling with a pull at its top taking
  # the sheet, the shade (mid-slide too) and Escape, Read's Add a book opened twice, a reader's drawer, one sheet at a
  # time (a sheet coming up closes the one that's up, through its owner); LOCAL only (the reader's stage needs the live
  # library)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "drawer open check" --kind parallel -- \
  node 08-lexicommons/app/scripts/drawer-open-check.mjs http://localhost:<port> <outDir> [--swap <path>=<old file>]   # a drawer comes up whole
  # (ui.sheet): Choose the games, Choose your concepts, Read's Add, Settings → Language's row and Translate's Find a pack, each opened twice by a
  # real tap on a touch phone, every frame: laid out at its start below the screen in a frame before its slide begins (WebKit times a slide started in
  # the frame that lays it out from before that frame, and an iPhone showed each drawer arriving a quarter to most of the way up), its first sliding
  # frame at its start, the same height all the way up (the library's catalog held 250 ms away); --swap the old ui.js to see it fail; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "outline check" --kind parallel -- \
  node 08-lexicommons/app/scripts/outline-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit] [--swap <path>=<old file>]   # a card's
  # drawn outline (lx/edge.js: Study's ticket and notch) on it in every frame, pictures of a page included: Study → the path, the lesson Study
  # names finished there as a session does (held until Study names the next), then back by the header, the app's swipe and the phone's back,
  # Chromium and WebKit; a picture (shell/page-slide.js copyOf) has edge.js draw its outlines first (drawOutlines), or a new lesson's ticket and
  # the Practice card's notch had no line all through the slide; --swap the old edge.js and page-slide.js to see it fail; LOCAL only (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tab check" --kind parallel -- \
  node 08-lexicommons/app/scripts/tab-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # switching tabs
  # on a phone: each tab's page kept (the same page back at once, where it was scrolled to, no layout shift as it comes
  # in), brought up to date quietly (Home after studying elsewhere) and drawing nothing again when nothing changed (Read,
  # the AI tab), a page under a tab built fresh, the tab you're on tapped (to the top, then to the tab's own page);
  # Explore's home from the device after a restart (the server slow, or unreachable) and its featured pack arriving
  # whole; LOCAL only
  # (it shares a check pack as an admin it writes into local D1, and deletes it)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "fresh page check" --kind parallel -- \
  node 08-lexicommons/app/scripts/fresh-page-check.mjs http://localhost:<port> <outDir> [--cpu 4] [--tries 4]
  # what arrives between a page's reveal and its first frame is in that frame (shell/main.js shown marks the page data-fresh until its first
  # frame is drawn; lx/ui.js onScreenNow takes a fresh page as not on the screen, so ui.arrive puts what comes in with no fade): Explore's topic
  # page opened from Home (the router reveals it, no slide) with its answers held, page side, until the page is shown and then landing in that
  # same task, the processor slowed 4×: its first frame shows the cards' held place or the cards whole, never neither, and nothing comes late
  # (transition-check's rule); a try whose cards miss the gap is tried again, none reached exit 2. The app from before fails it (an empty first
  # frame, the cards fading up from nothing). LOCAL only, path-nl and Explore's topic packs seeded (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "transition check" --kind parallel -- \
  node 08-lexicommons/app/scripts/transition-check.mjs http://localhost:<port> <outDir> [--max-routes 60] [--only '#a,from>#b'] [--no-swipe] [--width 320] [--engine webkit] [--books 960]
  # THE GATE for screen changes (run it on every landing that touches the shell or a page's first draw): every route from the tabs and Settings,
  # reached by a real tap on its link and left by the app's swipe back, every frame for 1.5 s: nothing in the arriving page first seen after its
  # first frame unless a held place (data-part="skeleton", ui.held) had its box from that frame; no Tinta box without its drawing, no picture
  # not loaded; frame-watch's teleports, scroll jumps and blank flashes. A PLANT first (a part put in 300 ms late must be caught, else exit 3).
  # A page composes before it's shown: its view.ready resolves once what the device has is drawn, and view.place() puts it where it opens (a
  # card it was opened at) before its first frame (shell/main.js build()); it waits for its view.ready and its Tintas (and, where it doesn't
  # slide in, the pictures on the screen), 400 ms at most, the page that left held as a picture till then, and comes in at once in a single
  # frame (only the app's first page fades).
  # --only: those routes, each found where a person would (Home, its tab, the pages above it, Settings, every tab), or from the page named in
  # 'from>route'. --engine webkit: taps only (WebKit has no touch moves), the account signed up in Chromium. The learner has four texts of its
  # own in Read (one past its first page: the Continue card, Your library's All); a link's query is kept only where it makes another page
  # (PAGE_QUERY: Find a book's ?kind=), so each kind is walked; then back from a book (the Continue card, a shelf cover) to Read, as it'll stay
  # from its first frame. --books 960: the catalog grown to 960 (fixtures/read-catalog.mjs), so every kind has its All to tap (the live 7 have
  # none). Read's pages: --only '#read' --max-routes 20 --books 960, at 390 and 320. LOCAL only, path-nl and the Dutch word packs seeded
  # (exit 0 = pass; an --only run passes on the routes it names)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "app feel check" --kind parallel -- \
  node 08-lexicommons/app/scripts/app-feel-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit] [--widths 390,320]   # an app, not a
  # web page, on every route reached from the tabs, Settings and Translate, at 390 and 320, in Chromium and WebKit: a sideways swipe moves nothing
  # (a PLANT 900 px block first; what reaches past the edge listed), no word selectable but in a field, a double press selects nothing, a held
  # finger's menu stopped (main.js), the iPhone's link preview off (shell.css); LOCAL only (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "component check" --kind parallel -- \
  node 08-lexicommons/app/scripts/component-check.mjs http://localhost:<port> <outDir> [--width 390 | --tablet <w>x<h>] [--theme <id>] [--walk [--max-routes 150] \
    [--per-family 2]] [--pages-only]   # every control on /design and
  # on each tab and Settings page, brought to the middle of a touch phone's screen (--tablet: an iPad by touch at that size, 744x1133, 820x1180,
  # 1180x820, the pages only; every walked route passed at all three on 8 Nov), answers a tap over 44 × 44 px (its
  # reach hit-tested, so a ::before reach counts and anything over it doesn't; words and links in a sentence exempt);
  # no text under 12 px (ruby readings and a drawn cover excepted) or quieted by opacity (a disabled or inactive control,
  # a fade in progress excepted); every control showing it's pressed (:active forced on the same element it reads, kept on the page, so /design's
  # demos adding controls as they play can't shift one onto another; two planted controls first, one with no press look and one with its own,
  # told apart; fields, sliders, links in a
  # line, disabled controls and answered game pieces exempt); a row wrapping small controls keeping its lines' reaches apart (components.css "rows
  # of small controls": 12 px for 32 px controls, 6 for segments; wrapped or not; a planted 8 px row caught first); each page error with the page it came from. --width and --theme (a theme the
  # account uses, as a person picks one) for the pages; --walk every route a link leads to from the tabs and Settings past the named pages
  # (transition-check's skips; a shared item, a topic and a pack's settings --per-family each; routes.txt); --pages-only without the small
  # phone's stages. The launch sweep: 390 and 320, Graphite and Paper, with --walk; a Fill game's choices in their sentence's face, 16px at
  # least, in the full ink (/design);
  # every starter's longest sentence (packs/ and Dutch's)
  # on a 375 × 667 phone through Arrange (start, its instruction's face arriving late; every tile placed; checked), Place,
  # Match and Fill, nothing scrolling, off
  # the screen or wider than it (a long language name: only the Hint ellipsizes, never I don't know); the session's summary there keeping a word's long gloss (Hebrew's, and the longest) in its own column,
  # and a word's reading (Hebrew's marks, Japanese's kana at 12 px) while it's new, as written once known well; LOCAL only.
  # --fit-only [--langs vi,ja] runs those two stages alone; --cpu <rate> slows the phone's pages (CDP); --small <w>x<h> the small phone (375x667
  # unless said); --pack <file> (again for more) a pack measured beside the starters (a language's path); --order-may-swap (with --small 320x568) only
  # the order steps, Put it in order, Listening's order and What does it say?, on each pack's longest sentence and one of five words, each played
  # exactly (session.js's still plan, with the planner's instead): shown, it fits at the start, placed and checked; too tall at its last squeeze
  # (data-order-fit), it's asked another way with no tiles, that game fitting at its start, its evidence its own, and after I don't know, a wrong
  # answer and a right one the step not scrolling, the right sentence whole and in view (over a held result's fade, nothing scrolled: answerFirst)
  # and Continue on the screen (a held result's chips below its foot allowed: it scrolls); served without the swap (planted) the order step is shown
  # and doesn't fit; --order-must-show the same where none may be asked another way (390x844, the control)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "a11y check" --kind parallel -- \
  node 08-lexicommons/app/scripts/a11y-check.mjs http://localhost:<port> <outDir> [--only names,text,contrast,focus,motion] [--width 320] [--themes <ids|general,flags,motifs,ready>]   # what VoiceOver
  # and TalkBack are given and what large text does, on a touch phone across the tabs, Translate, the path, Read, Explore and a topic's page, Knowledge and every
  # Settings page: every control in Chrome's accessibility tree has a name, nothing focusable inside aria-hidden, every image said or hidden; every
  # text at twice its size (a phone's 200%) cut off nowhere and no page wider than the screen (previews that end in an ellipsis by design, the whole
  # a tap away, shown apart); text at 4.5:1 (3:1 large) in Graphite, Paper, High contrast and Sepia (--themes: in ready-made themes instead, contrast.txt); the keyboard's order down each page; a device
  # asking for less motion getting a drawer and a page with nothing animating; each part first catches a plant; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "failure check" --kind parallel -- \
  node 08-lexicommons/app/scripts/failure-check.mjs http://localhost:<port> <outDir> [--theme paper]   # when something fails
  # (docs/design-bible.md): every main page offline and with the server failing, and presses that need the server; fails on a blank
  # page, on code's or a browser's words on any screen (server_error, Failed to fetch, undefined, null), on a page error; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "sheet row check" --kind parallel -- \
  node 08-lexicommons/app/scripts/sheet-row-check.mjs http://localhost:<port> <outDir>   # a row says where it goes: every page
  # reached from the tabs and Settings, every row pressed (Sign out and deleting the account aren't), on the page drawn fresh: a
  # row that opens a sheet is ui.listRow({ opens: "sheet" }) (a button, aria-haspopup, no chevron), a row with the chevron opens a
  # page; rows.md lists every row and what it did; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "page check" --kind parallel -- \
  node 08-lexicommons/app/scripts/page-check.mjs http://localhost:<port> <outDir>   # moving between a tab's pages on a
  # phone, by real touch: deeper slides in from the right (350 ms, the page leaving a third left), back slides out (the
  # header's Back going back in history, the browser's back, a page opened cold going to its parent), a press during
  # a slide landing on the arriving page, each page's scroll back as you left it, the swipe from the left edge (follows
  # the finger, springs back, goes past half or flicked), no slide between tabs, nothing with animations off, the header's band
  # over nothing at rest (it grows past the header only as the page scrolls: shell.css, main.js --page-scroll); LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "back check" --kind parallel -- \
  node 08-lexicommons/app/scripts/back-check.mjs http://localhost:<port> <outDir> [--seeds 1,2,3] [--steps 200]   # back, every way at once, on a
  # touch phone with the Home Screen app's swipe on: the app's swipe (real touch), the header's Back and the phone's own back (history.back, as an
  # iPhone's Home Screen app or Safari has); a swipe that is both the app's and the phone's (on an iPhone it went two steps and left the screen
  # black) on the path Home → things done this week → back → words you'd recall → Read, hear, say; then seeded walks over the real links, tabs,
  # Settings and every back: after each step the page in place, the tab lit the page's, a back one step at most and in its tab or to the page that
  # opened it, nothing behind a tab's own page reached from another tab, and the router's record (globalThis.__lxNav) the browser's; a failure
  # prints its seed and steps; LOCAL only, path-nl and the Dutch word packs seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "keyboard check" --kind parallel -- \
  node 08-lexicommons/app/scripts/keyboard-check.mjs http://localhost:<port> <outDir>   # the keyboard on a phone,
  # through a stand-in visualViewport that a keyboard opening shortens (headless Chrome has none): typing on a page,
  # the app takes the screen above the keys with the header where it was and the tab bar away; a request's page in the AI
  # section, its field clear of the keys and its pinned Send on them; a sheet keeps its height and place, and a field low in it
  # scrolls clear of the keys; Translate on an iPhone SE (375 × 667) with 216–320 px of keys, and 390 × 844 with 260–360: the answer and its
  # speaker whole above the floating language bar and under the box at every height (translate/page.js data-snug; the page before covered
  # it from 304 px of keys), and the typed line whole in its box, unscrolled and unfaded (data-floor; the page before cut it from 304 px), each
  # part's place in translate-geometry.json; LOCAL only, the Dutch packs seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "first draw check" --kind parallel -- \
  node 08-lexicommons/app/scripts/first-draw-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--lang <code>] [--only <regex>]
  # each tab's first draw: a start shows the app's frame at once ("Loading" only after a second); a first visit and a
  # start into each tab move nothing (every layout shift counted); slow device storage holds Home's and Read's places and
  # Home never shows a guess; the AI tab after a restart says what it said last (never "No AI connected yet" for an AI
  # that is); Explore's first visit holds its places while the server is slow; Read's shelf comes in whole, its books
  # or, on a server without the open library, its empty shelf; with --lang (its starter in the open library), a session
  # started with nothing cached in that language, its script's font arriving after the first paint, moves nothing; the
  # installed app's first open of the day: the splash's first frame is the first paint, the app's frame under it, and
  # nothing moves; a new device with lessons done and its path still coming never shows "Your first lesson"; a brand-new learner while
  # path-nl is held 5 s: Home's card and Study's first-lesson door held in the shape they come in (no link), never the app's starter, then
  # lesson 1 in place; path-nl failing: what the device has at once, said plainly; path-nl taking 20 s: held to the 15 s wait (study/packs.js
  # lessonsComing), what the device has said plainly (lessonsMissing), then lesson 1; a returning learner on a new phone (lessons done, no packs,
  # nothing kept) while path-nl is held 5 s: Home's card held in Practice's shape, then Practice in that box, at 390 and 320; LOCAL only (as
  # tab-check), path-nl seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "splash check" --kind parallel -- \
  node 08-lexicommons/app/scripts/splash-check.mjs http://localhost:<port> <outDir> [--swap <path>=<old file>]   # the first frame
  # (every start of the installed app holds it until the app has drawn) and the splash (its first open of the day): it holds, then plays
  # over the app and is gone on time; with the processor slowed 4× no long task while it plays, and its clock stays with its frames; an app
  # that took over 5 s to draw gets no splash; never on a reload or in a browser tab (but a newcomer's first run: signin-check); a press (real touch) or a key ends it at once and never
  # reaches the app; before the app's code arrives, theme-boot.js keeps those promises and one never started steps aside, fading, once the app has drawn after 6 s (12 s at most); with
  # the main thread held 400 ms as it fades into the app, the fade starts from the whole frame and plays out before it goes (never a cut); Animations
  # Off and reduced motion show its last frame for half a second; the first paint matches the launch image, below its status bar; --swap a .js or
  # .css; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "i18n walk" --kind parallel -- \
  node 08-lexicommons/app/scripts/i18n-walk.mjs http://localhost:<port> <outDir> --mode pseudo|capture|text|fit [--locale <code>] [--plant] [--against <dir>] [--states a,b] [--source <app dir>]
  # the interface's words on screen, as a new account on a phone, in the states i18n-areas.json names: pseudo (the en-XA locale: in a
  # moved area, a word from the code that didn't come through t() fails; an app from before the move is its control), capture (each
  # key's context for whoever translates it: route, part, box, the room it has, font, lines, cut off, the words around it, the screen
  # with it outlined and it alone, at 390 and 320; an area marked complete fails on a key no state showed), text (every word of each
  # state in English, in order; --against another run's outDir fails on any difference: a move must read the same), fit (--locale en, the
  # pseudo en-XA or a shipped locale's file, at 390 and 320: a word off the screen or out of its box, cut off, or wrapping in a one-line
  # part (i18n-areas.json fit.oneLine), a page scrolling sideways, each with its key and a picture; --plant squeezes buttons and cuts
  # off the language list, which it must name). A state may `clear` localStorage keys before it loads and `press` through a step to
  # reach the next (the walk's header lists a state's fields); LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "first run check" --kind parallel -- \
  node 08-lexicommons/app/scripts/first-run-check.mjs http://localhost:<port> <outDir>   # a first run on a phone: a brand-new account asked one thing, what it wants to
  # learn, over everything (never which language it speaks, nothing kept or assumed about that: the app teaches from English alone, so the question went on
  # 11 Nov 2026; interface-language.js speaks); a phone set to Spanish or to a language nobody knows given the same list; a device that said which it speaks,
  # when that was asked, keeping its answer (not offered that language); the list and its search; a press mid-wave choosing the language, Home in it, never
  # asked again; the language you learn from (study/learning.js fromFor): from English for a new learner whatever the phone's language, English from Spanish
  # for a device that said Spanish, never the one before;
  # every other check starts past it (quiet-browser.mjs marks it done unless LX_FIRST_RUN is set); LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "language check" --kind parallel -- \
  node 08-lexicommons/app/scripts/language-check.mjs http://localhost:<port> <outDir>   # Settings → Language on a phone: with only English shipped, I speak from
  # the phone, a language the app hasn't got kept and said plainly, App language offering only what's shipped, Grow saying it isn't ready; with Dutch planted as a
  # shipped locale the way one arrives (/js/i18n/shipped.js and /i18n/nl.json routed, built from this copy's English, one entry stale as a control): App
  # language's Dutch, the app's words and <html lang> in it at once and after a reload, back again; Grow off until turned on, a message turning Dutch once
  # every word of it is known and one with a word that isn't staying English, a word learned growing its message on the next draw; LOCAL only, path-nl seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "text check" --kind parallel -- \
  node 08-lexicommons/app/scripts/text-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # texts your AI
  # adds, on two devices over MCP: a text with a cover, a real EPUB, a broken one (why, on each device and in get_text),
  # a book, refusals, remove and undo from the AI and the app, your own texts outside the relay, the request, export
  # and delete; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "weave ai check" --kind parallel -- \
  node 08-lexicommons/app/scripts/weave-ai-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # weaving a text of yours with your AI,
  # end to end on a phone, the AI played over MCP with a personal token: the device's text going up and the request naming it (a language the
  # pipeline's judges haven't accepted refused when asked; the AI never shown the copy's id), take_request, get_text with the request, get_weave_guide
  # (dated), a broken weave refused with the request still the AI's, a clean one relayed and the request done with its copy gone at once, the device
  # keeping it and the reader opening the text woven, a second request canceled in the app taking its copy with it (D1 read); LOCAL only, path-nl seeded
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "weave check" --kind parallel -- \
  node 08-lexicommons/app/scripts/weave-check.mjs http://localhost:<port> <outDir> [--standin]   # (the reader's foot card never stale: once sent, that
  # it's read woven from here, the same after a reload; on arrival Woven into Dutch with Read it woven, the page not woven by itself, its press as
  # Contents'; gone once it's read woven; the app from before 11 Nov 2026 fails it) weaving a text of yours with your AI, the
  # app's side (read/reader.js offerWeave, ai/client.js askToWeave, a "weave" request, text-inbox.js's "weave" change), a learner weeks into Dutch:
  # no AI, nothing; an AI connected, the offer once at the reader's foot, stepping aside while a sheet is up (what's under it pressable), none
  # for a shelf book or a Dutch text, Not now kept per text; the press
  # sending the text as the device keeps it, then the request; Contents waiting and working live as the AI takes it over MCP; back woven through
  # the relay, checked again here, Read it woven at the same word; Read's Continue card and Your requests; an AI that couldn't, with Ask again.
  # --standin plays the server's side with routes (the shelf's Alice and its weave; a change for a text not here "missing" with no row or toast,
  # a weave failing the check here never listed as a text that couldn't be added); without it, add_weave and the relay are the server's own,
  # weaving a short text word for word (the rules refuse the shelf's Alice as woven before them); LOCAL only (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "body check" --kind parallel -- \
  node 08-lexicommons/app/scripts/body-check.mjs http://localhost:<port> <outDir>   # every route that reads a body
  # refuses a crafted one in words (an object whose toString is null, not JSON, past its limit): a 400, never a 500;
  # the biggest look the rules allow still saves; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "admin ui check" --kind parallel -- \
  node 08-lexicommons/app/scripts/admin-ui-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # Settings'
  # admin access on a token, admin and learner; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "shelf sections" --kind parallel -- \
  node 08-lexicommons/app/scripts/books/shelf-sections-check.mjs <baseUrl> <outDir>   # the shelf's curated sections, then
  # a shelf per kind of book (picture, woven, with help, other languages): the first a grid of covers, every other its covers in a row,
  # each with its "All N" and its page when it holds more than it shows, a kind's All the whole kind at 960 books; the layout before
  # (every shelf after the first a count row) fails it
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "read scale check" --kind parallel -- \
  node 08-lexicommons/app/scripts/read-scale-check.mjs http://localhost:<port> <outDir>   # Read at scale on a phone, from a new
  # account: Find a book on the server's catalog and on 960 (scripts/fixtures/read-catalog.mjs served in its place): the first 40 and
  # every next 40, searching past case and accents, the Level and Kind sheets in place, covers never repeating a picture (with a
  # control), the kinds' All; Your library from nothing to 31 books, its search and orders; offline on the kept catalog, saying what
  # needs a connection; what it expects worked out from the catalog and the device's records; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "reader edges check" --kind parallel -- \
  node 08-lexicommons/app/scripts/reader-edges-check.mjs http://localhost:<port> <outDir>   # the reader's edge cases on a phone (read/demo-sample.js
  # mounted with openReader; a real text for the note): a note being written kept through the browser's Back; a page drag's window listeners
  # gone with the reader; a place in a flipped sentence opened in scroll at it; a flipped sentence taller than a page read whole across
  # pages; text before the first chapter reachable; a picture-only page drawn, opening on itself and kept (its text page too) through a
  # layout; More on the word tapped in a flipped sentence; a highlight inside one painted with its ✦. Each failed before its fix; LOCAL only
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "explore check" --kind parallel -- \
  node 08-lexicommons/app/scripts/explore-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # Explore in
  # Chrome: the home (languages and flags; no pack to add next until lesson 1 is done, none drawn in under the eye as it's done, there on
  # coming back to the kept page; its cover a drawing, never a held place left blank, also for a learner whose lesson 1 is a real session
  # played while Explore is a kept tab, where the home is drawn again off the page: that learner's home is given the live one's shape, the
  # pick on no shelf before lesson 1, and a planted held cover is caught first), filters, search, an item, Add pack, Like, Make my own copy, another
  # language, the terms, Report, a taken-down pack of yours with its counter-notice, Yours, Share in Explore from a
  # pack's page, corrections on a pack's page (suggest, flag, like, report, accept, decline) and the community
  # corrections switch, requests (the home's way in, the board, asking for a pack and for a book, "me too", answering
  # with a pack of yours, new answers in Yours, done), preview sentences' readings, a library pack's recordings and their
  # credit; sharing off for a learner (/api/me's mayShare false): no way to publish anywhere (Explore's rows, a sentence's menu, an empty
  # search, the board, the share route, the end of the lessons), reading and adding kept; LOCAL only, a fresh state with the migrations and
  # nothing else (npx wrangler d1 migrations apply lexicommons --local --persist-to <dir>, not npm run local's copy) and --var
  # COMMUNITY_SHARING:everyone (either missing: exit 2, said); a failure with a sheet up closes it, so the stages after it still run
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "explore browse check" --kind parallel -- \
  node 08-lexicommons/app/scripts/explore-browse-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # Explore found by browsing,
  # by a word, and shared into, from a new Dutch account: the home (the search, then the first six topics as cards, each its drawing large with its
  # hard edge, its name whole at 16 px and the server's count of what's about it, All N to the rest; then the pack to start face-out), a topic's page started the way Home is (only what's
  # about it, no general pack; its first pack's card led by its first sentence, Add pack there; its second the stub; learners' packs as rows; Back one
  # step), search finding the packs that teach a word (its sentence with the word marked) and a topic by name first, sharing a pack of yours as a page
  # (the terms as four plain lines, Back one step; the form: the level a row, its topics chips, its cover one of their drawings, kept; Done becoming
  # the shared pack, its Back one step to the pack), the pack to start the suggested topic pack this person hasn't added whose words are the commonest (worked out from
  # the frequency list and the pack files), never a learner's, and learners'
  # covers in the app's art, none twice on a shelf. Fails on Explore before (small tiles or books, a grid, pills, boxed terms). LOCAL only, path-nl seeded and an
  # opt-in pack about one topic, suggested (seed-local.mjs --opt-in --suggest), --var COMMUNITY_SHARING:everyone (its learner shares a pack). It reads
  # Explore's home on its second visit after a change: the kept page's refresh holds new rows for the next visit, by design
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "explore arrive check" --kind parallel -- \
  node 08-lexicommons/app/scripts/explore-arrive-check.mjs http://localhost:<port> <outDir> [--hold 1500] [--home-hold 2000] [--topic feelings] [--cpu 4] [--width 390]
  # Explore's drawn places arrive once (explore.js drawnWhole: a topic's tile, a pack's cover, its paint chosen from its drawing), from a new Dutch
  # account with a pack of its own whose paint by id is its drawing's ground: #explore, #explore/topics, #explore/browse and #explore/yours each tapped
  # with none of its drawings on the device, the processor slowed 4× and every drawing held back 1.5 s, every frame read: no place's paint changing
  # once it shows, none shown bare and then drawn, none put where one went in another paint (a held place aside), all whole at the end, no learner's
  # cover in its drawing's ground; #explore again with its drawings in memory whole from its first frame, none held; a device's first visit (no
  # home or heights kept) with the home's answer held 2 s: the lessons' card in its first frame and the rest of the home into the place held from it
  # (explore.js heldHome; transition-check's late rule); a topic's page (feelings: a card taller than a one-line card's 262 px) by its tile, its
  # answer held 2 s: its cards into the place held from its first frame (heldToFoot); stills of #explore held and arrived, of that first visit
  # and of the topic's page. The app from before fails it (a tile's edge and a learner's cover changed paint as their drawing came; a first
  # visit's home outside its 330/230 px; the taller card past its 262 px). LOCAL only, path-nl seeded,
  # --var COMMUNITY_SHARING:everyone (else exit 2) (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "signin check" --kind parallel -- \
  node 08-lexicommons/app/scripts/signin-check.mjs http://localhost:<port> <outDir>   # signing in from the public page (src/pages.ts
  # loginPage, login.js), every frame recorded (frame-watch.mjs, a planted jump caught first): Start learning opening the newcomer's page
  # (/login?new=1: Create your account its heading under a smaller drop, no headline again over it, Create account with a passkey right under
  # the name field (iOS centers a focused field above the keys: the button clears them and Safari's pill on an SE), no fold, Already have an
  # account? Sign in with a passkey under it) in the phone's own light or dark, and a saved look never reaching the site's pages; opening
  # the sign-in page's fold by a tap moving nothing above it in any frame (Chromium and WebKit, 390 and 320), its field brought into view; a
  # message appearing moving nothing; the fold still signing up; a light phone from Start learning to the first run in Chrome's screencast:
  # sign-in light in every frame, the app never light nor blank (a newcomer's held start shows the splash's first frame, Tinta on Graphite, from
  # the app's first frame, still until it fades into the first run over several frames: lx/theme-boot.js), the first run put on the page before
  # the app's frame with its first flags drawn, and steady once it shows; today's app before it fails on its blank frames. LOCAL only (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "explore books check" --kind parallel -- \
  node 08-lexicommons/app/scripts/explore-books-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # books in Explore
  # (explore/books.js, docs/explore-books.md) on a phone: with no book shared (the site at launch), no Books shelf on the home and no held
  # place for one, nothing shifting on a first visit at 390 and 320 (the lessons card's place held at its own height while the lessons download)
  # or drawn from what's kept, no books groups in Yours; then two books shared over HTTP: the home's shelf and each cover's line, Books, a
  # book's page with its first lines woven by the reader's weaveSentence (the text's commonest words for a learner who knows none, said in the
  # heading; then the learner's own bank words, in the woven tint), no chapter marker, About's source and license; Add to my library (followed,
  # on the device with its layer, then Read it); sharing a text of yours (whether it's free first, Neither leaving Share off, a link that isn't
  # one, the terms, pending from an unknown source on its page and in Yours); the same text from another account refused in words with no id;
  # sharing closed (/api/me mayShare false): no texts to share, the share route to Yours, books still found and added. LOCAL only, a fresh
  # state with path-nl seeded and no book shared (exit 2 otherwise), --var COMMUNITY_SHARING:everyone (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "own pack check" --kind parallel -- \
  node 08-lexicommons/app/scripts/own-pack-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # Add your own pack, the learner view
  # and Feature flags, from a new Dutch account on a phone (/api/me's sharing, mayShare and AI played): Explore's home offers Add your own pack to everyone,
  # Ask for it and Share only once sharing is "everyone"; the page with no AI names none (an Anki deck, whose Back comes back; one started by hand: no name
  # said in words, a name making an empty pack of yours and opening its editor); with an AI, the words to send it following what it's about and the level,
  # Copy copying them; nothing wider than 320; an admin seeing the app as a learner until it's turned off on the device (then Ask for it and Share in
  # Settings → Admin, still not on Explore's face at "admins"), kept through a reload; Feature flags as previews on this device, on a stand-in of
  # /api/admin/flags (order, what everyone has, one that can't be previewed disabled with why, a press sending only this device's preview with no
  # sheet, sharing previewed with the learner view on showing a learner's Explore with sharing open, every preview off); then the server's own: a sharing
  # preview for this device, /api/me following and back, the site-wide PUT gone. LOCAL only, COMMUNITY_SHARING "admins" (no --var) (exit 0 = pass)
python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "explore pack check" --kind parallel -- \
  node 08-lexicommons/app/scripts/explore-pack-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   # a pack's page in Explore, on
  # Dutch's lessons from a new account: its units (explore.js lessonsOf): one open, every other a closed row with how many lessons, how far
  # you've got and what they teach; a press opens one in place under its row (no page, no page chevron) and closes it; a pack you haven't started
  # opens its first unit, a learner partway the one they're on, kept up to date as they finish one unless they've opened or closed one themselves;
  # fails if every unit is drawn open, or none. Its sentences (ui.sentenceRow), the sample and all 1,654: none shows the same English twice (a
  # word-for-word line that says what the translation says isn't drawn), every other word-for-word line is; LOCAL only, path-nl seeded
  # (seed-local.mjs --default)
# app-check and theme-check sign up and delete a test account, so they refuse any non-local URL. Local server for them
# (its own D1 state in <dir>, so other sessions' local data isn't touched):
#   npx wrangler d1 migrations apply lexicommons --local --persist-to <dir>
#   npx wrangler dev --port <port> --local-upstream localhost:<port> --persist-to <dir> --var GATE_ENABLED:false \
#     --var PUBLIC_ORIGIN:http://localhost:<port> --var RP_ID:localhost --var UPLOAD_SIGNING_SECRET:<any local value>
# --local-upstream makes the Worker see localhost (not the route's host), so /mcp accepts a local personal token;
# the MCP resource follows PUBLIC_ORIGIN (src/index.ts) and is exactly https://lexicommons.com/mcp in production.
# Local: npx wrangler dev --port <free port> --var GATE_ENABLED:false (sandbox off; check the port is free first)
# A fresh local server's open-books shelf is empty (/library/catalogue.json answers an empty catalog). To show the
# live books locally: CLOUDFLARE_ACCOUNT_ID=… scripts/books/seed-local-library.sh <persist dir> (sandbox off; copies the
# live lexicommons-library bucket into that state; read-only on the live side)
```

## Layout

```
library/          What a copy's library starts from, beside packs/ (library/README.md); never served as it stands
scripts/local/    The local copy's library seed (seed.mjs: the same pure code as a publish, run in Node)
src/index.ts      Worker entry: .app → .com redirect, then workers-oauth-provider (OAuth endpoints, token check on /mcp);
                  POST /token goes through src/refresh-once.ts (a refresh token used twice gets one answer), and its answer through
                  src/revoked.ts (a revoked connection is never handed tokens: migration 0027's markers, also read by every MCP request)
src/app.ts        Hono router: site gate, sign-in page, consent (/authorize), the app's API, REST /api/v1, uploads, static
src/gate.ts       The site password gate (NeedWright preview-gate pattern) and its bypass list; going public: GATE_ENABLED is the one
                  switch (the gate, robots.txt, what may be indexed), GATE_PUBLIC_PAGES opens only the public pages while the gate is on (the
                  three, and /pricing where the plan is offered; anywhere else app.ts answers it 404)
src/accounts.ts   Passkey sign-up/sign-in/add (the cookie session itself is src/sessions.ts)
src/sessions.ts   The cookie session: only token hashes stored; slid forward with its cookie where an answer can carry it (sessionOf)
src/challenges.ts A passkey ceremony's challenge, taken once (one DELETE … RETURNING), apart from accounts.ts so Node's tests load it
src/signin.ts     Sign in with Google, GitHub and Apple (a server-side code flow: PKCE for Google and GitHub, state, a nonce for
                  Google's and Apple's ID tokens, Apple's client secret signed per sign-in), the create step
                  (/login/new) and its "add it to my account", and the account's ways to sign in (/api/auth/ways)
src/account-email.ts  An email on the account, for getting back in and receipts (migration 0020): adding one by a 6-digit code, and getting
                  back in by one from the sign-in page (/login/recover, public/js/login-recover.js; then a passkey for that device);
                  shell/settings-email.js is Settings → Account → Email
src/library.ts    Notes, signed uploads, personal tokens: every route calls these, so checks live in one place
src/books.ts      The open library's files (/library/: catalog, books, weaves, pictures, word-frequency lists,
                  packs) from the LIBRARY bucket, read-only; they're published by the books pipeline (outside this
                  repo) or by an admin through src/library-admin.ts, never uploaded through the app
src/roles.ts      Roles (admin, moderator: user_roles, set only with SQL on D1) and the admin log
src/flags.ts      The site's switches (migration 0029): COMMUNITY_SHARING, PLAN_ENABLED, OWN_KEY_ENABLED, APPLE_SIGNIN. wrangler.jsonc's values are
                  the defaults; the director changes them for everyone over MCP (feature_flags, set_feature_flag) or /api/v1/admin/flags, and
                  index.ts lays them over env (withFlags) for every request and the cron. The app's Feature flags page (/api/admin/flags, an
                  admin's) only previews: a flag on for that admin's own device (the lc_preview cookie, withPreviews), nobody else's
src/library-admin.ts  The open library managed by an admin: staged uploads (signed, checked by hash; a recording's
                  bytes must be audio), check, publish (a book, a list, a default pack, a default pack's recorded
                  audio, or a language's shared grammar), unpublish, the catalog's revisions and restore, the shelf's
                  sections; src/mcp-admin.ts its MCP tools
                  (library_*, admin_guide, admin_log), and /api/v1/admin/… in app.ts the same calls over REST;
                  src/audio-bytes.ts checks a recording's bytes by their structure when they arrive
src/community.ts  Explore, the community section: items (shared packs, and the library's default packs indexed beside them),
                  listing and search, follows (the refs study/packs.js loads), likes, the sharing terms, sharing and new
                  versions, curated sections and topics; src/mcp-community.ts its MCP tools; /api/community/… in app.ts
src/community-books.ts  Books in Explore (migration 0028): a book's text and its weave layers shared the way packs are, under the rights gate
                  (public domain in the US and the EU, or CC0 / CC BY / CC BY-SA with its credit; a source link; no pictures yet), each layer
                  checked and audited; live from a known open source (KNOWN_SOURCES), else pending for an admin (decide_shared_book);
                  versions and layers, follows (a reading library's), likes, its files at /api/community/books/:id/:version/:file only while
                  live; moderated in moderation.ts with packs (WORKS: target_kind 'book'). docs/explore-books.md is the app's contract
src/admin-alerts.ts  What reaches an admin about moderation, by push from the cron: a serious report, a case only an admin can settle, a stuck queue,
                  errors spiking; worked out from the rows, and what was sent is in the admin log
src/bug-reports.ts  Bug reports (migration 0030): Settings → Report a bug (shell/settings-report.js) or, signed out, the sign-in pages' Report a
                  bug (/report: pages.ts reportPage, report.js), both through lx/report-form.js and lx/bug-rules.js (the limits, a screenshot's
                  own bytes, what goes along and how it's cleaned, the same on both sides). Linked to the account (export, deleteAccount) or to
                  no one; BUGS_LIMITER per account or connection, the day's limits in the write; 90 days, swept by the cron; bug_reports,
                  bug_report, bug_reports_close for an admin (mcp-admin.ts); a push when new ones come in (admin-alerts.ts "bugs")
src/errors.ts     Error reports, in our own D1 only: the app's (POST /api/errors from lx/error-report.js, which main.js imports first; with the
                  "reload" kind, a start of the Home Screen app on a phone after its page ended unseen, error-clean.js startedAgainByItself:
                  only its screen and the app's version) and the
                  Worker's (app.onError by route pattern, MCP tools, the cron); cleaned by lx/error-clean.js on both sides, grouped and counted
                  by the hour; error_reports / error_reports_clear for an admin (mcp-admin.ts); swept by the cron (30 days, hours 14)
src/moderation.ts Moderation in Explore: reports and the hide rules, counter-notices, the moderator's queue and decisions,
                  copyright strikes, bans, daily limits, the policy; reports on corrections and requests (the same rules,
                  on their own `shown`); src/mcp-moderation.ts its MCP tools (report for everyone, on a pack, a
                  correction or a request; mod_* for a moderator or an admin); /api/community/items/:id/report, /counter-notice,
                  /api/community/corrections/:cid/report and GET /api/v1/mod/pending (the zero-token check) in app.ts.
                  The monitoring agent that works the queue runs outside this app, as its own moderator account over an
                  admin-access token (../tools/mod-agent/README.md)
src/corrections.ts  Corrections in Explore, Wikipedia style: a fix to one piece of a pack (checked as a version is) or a
                  flag; the author (an admin on any pack, and only an admin on the library's own) accepts them into one
                  new version or declines them; likes; the open fixes a follow with community corrections plays
                  (study/pack-corrections.js, pure, the pieces and fixes; study/packs.js the device's overlay; for
                  community packs only: a follow of Lexicommons' own is kept as published); src/mcp-corrections.ts its
                  MCP tools; /api/community/items/:id/corrections… in app.ts; Explore's screens in explore.js
src/grammar-suggestions.ts  Suggestions to a language's shared grammar (migration 0016): a new pattern, a fix to one or
                  retiring one, from Explore or your AI (suggest_pattern), checked at once (lang/grammar.js checkSuggestion);
                  likes, reports (moderation.ts, on their own `shown`), withdrawing; an admin's review (mayReview: admins now,
                  a language's named maintainers later) accepting some into the next revision (claimed, published through
                  library-admin.ts, marked) and declining others; src/mcp-grammar.ts its MCP tools; /api/community/grammar…
                  in app.ts; Explore's pages in public/js/explore/grammar.js
src/board.ts      Requests in Explore (the board): someone asks for a pack (a language, a level, a topic) or a book woven into
                  a language, and others answer: a pack request with a pack they shared (an admin, any live pack), a
                  shelf book's request by its layer going on the shelf (done when read); a book not on the shelf waits
                  for an admin (pending: decide_book_request). "Me too" likes, reports as corrections'. Text requests come
                  with piece 5. src/mcp-board.ts its MCP tools (explore_requests, post_/answer_/close_explore_request,
                  the contribute prompt: list_requests is your requests for your AI); /api/community/requests… in app.ts
src/mcp.ts        The MCP server (stateless createMcpHandler): the look tools, the restyle prompt, test tools, resource
src/looks.ts      The account's look and saved themes: revisions (compare-and-set), the theme in use written through to
                  its theme, switching, images by hash, history, a device's reports
src/theming.ts    get_theming_guide, built from parts.js, look-rules.js and the deployed tokens.css
src/coach.ts      Your study as your AI reads it: the record a device sends (public/js/ai/study-record.js, only while an AI is connected) taken apart into a summary, one
                  lesson, one concept, misses; src/mcp-coach.ts its MCP tools (study_summary, study_concept, study_lesson, study_misses), src/coach-guide.ts get_coaching_guide; /api/ai/record in app.ts
src/practice.ts   Practice with your AI: the account's practice room (Durable Object PRACTICE); src/mcp-practice.ts its
                  MCP tools, src/practice-guide.ts get_practice_guide; public/js/practice/ the section. docs/practice.md.
                  The same room keeps your requests for your AI (public/js/ai/requests.js what one is, ai/client.js the
                  app's side over /api/ai/requests, ai/tab.js the AI tab's pages; src/mcp-requests.ts the AI's tools:
                  list, take, finish, wait)
src/texts.ts      Texts your AI adds to your reading library: add_text's checks (src/text-files.ts: plain text made into a
                  book, a book checked, an EPUB told apart, a cover cleaned), the relay to your devices (migration 0009,
                  in the same poll as packs), a change's files as uploads marked text-in:<change>; src/mcp-texts.ts its
                  MCP tools and the add_text prompt, src/text-guide.ts get_text_guide; public/js/read/text-inbox.js the
                  device's side, public/js/read/cover-svg.js the cover's check. Weaving a text of yours (a request of kind
                  weave): the app's copy of the text (POST /api/ai/weave-texts) kept only for its request; get_text { request_id },
                  get_weave_guide (the books pipeline's rules, src/weave-rules.generated.ts) and add_weave, which checks the layer
                  (book-format.js validateWeave, src/split-forms.generated.ts) and relays it as a change of kind weave, then finishes
                  the request; the two generated files are the books pipeline's (pipelines/books/test.ts holds them to it): never
                  edit them here
src/translate.ts  Translate, online (/api/translate): translate/engine.js over Lexicommons' own packs, Explore's live
                  shared packs and the library's books with an English layer; public/js/translate/translate.js is the
                  device's side (its packs and books, offline too), merging the server's in after its own
src/packs.ts      Your AI's packs: the relay to your devices (each change checked here, then fanned out to every
                  registered device, which applies it and reports back), the devices, and the account's latest copy of
                  each pack for the AI; src/mcp-packs.ts its MCP tools, src/pack-guide.ts get_pack_guide
src/storage.ts    Bring-your-own-storage: config + Google's and (with ONEDRIVE_CLIENT_SECRET) OneDrive's code/refresh exchange (adds the secret, stores nothing)
src/webpush.ts    Web Push with Web Crypto only: RFC 8291 encryption, RFC 8292 VAPID, the send (TTL, Urgency, Topic), Declarative
                  Web Push's JSON, which endpoints a subscription may name
src/reminders.ts  Reminders (migration 0015): subscriptions (one per device), settings, a device's report, the rules (decide:
                  pure), the queue of notes (enqueue: your AI finished, community), the cron's run (index.ts scheduled,
                  every 15 minutes); public/js/push.js the device's side, shell/settings-reminders.js Settings → Reminders
                  and the ask after a first session, sw.js the push and notificationclick handlers
src/progress-clears.ts  Clears of study progress everywhere (migration 0011): the account's record of when (never what),
                  which every device using your storage applies; /api/progress/clears
public/js/storage.js  Google Drive / Dropbox / OneDrive from the device: PKCE connect, device-held tokens (each OneDrive sign-in renewed the way it was made), files
                  (versioned; writes only at a version where the provider checks it)
public/js/sync.js What's yours kept the same on every device through the storage you connect: kinds register
                  (registerSync), records merge by key (time, deletions, or the kind's own order), a file per kind,
                  shard, account and device
src/startup-images.ts  iOS launch images: the devices (CSS size, pixel ratio; iPads both ways) and their <link> tags,
                  one list for pages.ts and scripts/build-icons.mjs (which renders public/icons/startup/ from startup.svg)
src/pages.ts      Server-rendered HTML, everything escaped: the gate; sign-in, the create step, consent and messages on
                  the design system (public/css/signin.css, the sign-in-button part from public/js/lx/brands.js)
public/           The PWA (app/), css, js, manifest, service worker, icons, fonts, vendored passkey lib; the public
                  pages (index.html, privacy.html, terms.html, pricing.html where the plan is offered, css/site.css)
public/css/lx/, public/js/lx/   The design system: tokens, base, components, presets; ui.js builders, icons, parts.js
                  (the theming surface), theme.js + theme-boot.js (theme engine), css-safety.js + look-rules.js (the
                  checks the server shares), look-sync.js (the themes and the look on the account), appearance.js (the
                  editors and the theme picker)
                  (docs/design-system.md)
public/design/    The living design-system page (/design), with js/design.js and css/design.css
public/js/character/  Tinta, the character (part character, ui.character): character.js runs it on a page (<lx-tinta>),
                  its states read from the rig's own (held or reaction), and plays the acts other parts hand it
                  (ui.performCharacter; docs/design-system.md, "Tinta acts"); the start loads it (shell/main.js), and firsts.js keeps each
                  kind's first frame, which a Tinta made before it had come holds until the live one takes over from it;
                  rig/ is its art, generated from ../docs/design/character/rig by its export-app.mjs: never edit it here.
                  speaking.js is what's being said now: study/voice.js announces each sound there, and a Tinta that
                  speaks moves its mouth with it (docs/design-system.md, "Tinta speaks").
                  stand.js stands a Tinta on a drawing's own top edge (Study's path: your place's lesson).
                  The splash (docs/design-system.md): theme-boot.js decides it before the first paint, its first and last
                  frames are static markup in app/index.html with css/splash.css (both written by the rig's
                  splash/app-frames.mjs: never edit them here), splash-run.js plays it
public/app/       The app (/app/): js/shell/ (main.js router, layout.js which page has the third tab, study.js,
                  settings.js, todo.js, api.js, look-watch.js the look's safety net and Undo toasts), css/shell.css;
                  shell/install-guide.js (which device and browser this is, and each one's steps to add Lexicommons to its
                  Home Screen: pure, from each maker's own help) and shell/settings-install.js (Settings → Add to Home
                  Screen, About's row, Home's row)
public/flags/     flag-icons' SVGs (MIT: public/flags/LICENSE), a language's flag beside its name (ui.languageFlag; which
                  country marks which language: public/js/lang/flags.js)
public/js/explore/  Explore (explore.js): the home, browse and search, an item's page, the sharing terms, Report, Yours
                  (what you've shared, and a taken-down pack's counter-notice), Share in Explore on a pack's page,
                  corrections (a sentence's Suggest a fix and Flag it, a pack's Corrections, Use community corrections);
                  requests.js the request board (src/board.ts): the board, a request's page, asking, answering, Yours'
                  requests, the home's row. Preview sentences show their readings by Study's rule (previewWords: marked
                  while new, as written once known; in a language you aren't learning, all of them), from the version's
                  sample (community.ts sampleOf: words [text, lemma, reading] when any has a reading)
public/js/translate/  Translate on the device: translate.js (its side of the worker, the server, the merge), worker.js, page.js (the
                  page; its parts' builders in know/ui.js), engine.js (pure: search, best guess, main words, shared with src/translate.ts);
                  the full translator: models.js (its files, pure data), translator.js (the one place the page and Settings ask about
                  it), model-worker.js (downloads, checks and runs it); shell/settings-translate.js is Settings → Translate;
                  public/vendor/bergamot/ its runtime (MPL-2.0)
public/js/know/   Home (today.js), the Knowledge page (page.js) as big cards you scroll through: Your words (cards.js: every word you'd recall a
                  tile in one pile, dropped in from above the card on every visit, laid out anew each time with a seed of its own (pile.js
                  layOut), nothing of it kept but which words were outlines, the card a fixed size with the view pulling back as it grows; its
                  card opens Your words at #know/words, words-page.js), then This week, the ideas you've met, Everyday Dutch and
                  Over time (cards-more.js); Everyday's card opens the 1,000 commonest words (#know/everyday/words, everyday-page.js), Over time's
                  its page in full (#know/time/more, time-page.js: a month, three months or all; read, by ear, aloud; ideas; the week ahead). A
                  word is yours by one rule everywhere: know/word-index.js, the word index (read known and level 3 or more, or in your word bank; summary.js
                  understood() reads it): every word and phrase you've met with when you first met it, its level and the stretches it was known well, kept
                  up to date as you answer and kept in IndexedDB, so the pile, Your words, Home's number, This week, Everyday, Over time and Explore's bar
                  ask it in a moment;
                  #know/<card> opens the page at one; a concept's page
                  (concept.js, also in a sheet over the cards), their sums
                  over the scheduler (summary.js) and their parts' builders (ui.js; css/lx/know.css, /design's
                  design-know.js); streak.js the streak's rules (pure), study/done.js the things you finished each day
                  and your pauses (synced, kind "streak") that it counts; shell/settings-streak.js is Settings → Streak
                  (opened from Home's streak, all of it: the number, its best, its year two months across with the chosen day ringed, that day in
                  words, worked out in slices after the tap so the ring moves at once, then how it counts and pausing it; know/streak-days.js the months and a
                  day's doings); celebrate.js what a finished session celebrates
                  (pure), celebration-ui.js its moment on the session's summary (Tinta above the number: a hop when
                  today counts, a heart at a milestone, calm on a mended day), share-card.js a milestone's card (drawn on the device, shared or
                  saved; Tinta's `right` still in its box above the words, the words centered when it can't be had);
                  the summary's one sound through lx/sound.js (the whole unit or a milestone: unit-done; today counted: day-counted; else session-done)
public/js/anki/   Adding an Anki deck: page.js (the page), import.js (the worker's keeper: quiet and whole-time limits, ends it outright), worker.js and read.js (the
                  worker), zip.js (the file, read a piece at a time; caps; zstd through fzstd), collection.js (its three generations of
                  database, through sql.js; protobuf), text.js (a field as plain text, by walking it: no DOM, never rendered; templates read for which fields
                  they name), deck.js (a note's roles and cards, what's left out and why, the pack), language.js (which language, how sure).
                  Loaded only when someone opens the page, as public/vendor/anki/ (sql.js and fzstd, MIT): none of it in SHELL
public/js/lang/   The languages, as data: one module each (name, locale, segmenter, lemma case, abbreviations, stray
                  words for Arrange, the pattern catalog); index.js is the registry the app, the Worker,
                  book-format.js and the books pipeline share. grammar.js: each language's shared grammar as data (pure;
                  the app's own patterns are revision 1, the open library holds the ones after at grammar/<lang>/
                  <version>.json, named in catalogue.grammar), its check and the install into the registry;
                  study/grammar.js is the device's copy (synced with the packs, kept for offline), src/grammar.ts the
                  Worker's
public/js/packs/  The starter deck as a pack, inside the app for a first start offline; Lexicommons' own packs are public
                  packs in the open library (/library/packs/<id>/<version>/pack.json, listed in catalogue.packs)
packs/            Lexicommons' own default packs, one file each (packs/<id>.json, a language's starter is starter-<code>):
                  the files an admin stages with library_upload and publishes as default packs. scripts/test-packs.mjs
                  checks every one (its own checked form, no warnings, ≥3 sentences for each pattern of the language's
                  grammar they use); never served.
                  words-nl-NN: Dutch's word series, one sentence written for each of the frequency list's words (its gap
                  is that word), 2,000 words a pack by rank; made by ../pipelines/words (its README: the method).
                  words-nl-strong: the series' strong language (swear words, insults, vulgar words), an opt-in pack
public/js/study/  Studying: pack-format.js (the pack format, its check and the merged view; pure, shared with the
                  Worker), packs.js (the packs on this device: yours, and copies of the public ones you have, synced
                  from the library and checked against their version; each on or off), learning.js
                  (the language you're learning: every screen names it, lx/ui.js gives its text that lang, the voice and
                  the recognizers follow it), content.js (what studying draws on: the packs that are on, live),
                  pack-audio.js (a pack's recorded audio: the manifest, its check, clips named by their bytes; pure,
                  shared with the Worker), keep-clips.js (a library pack's clips kept for offline after a sync), pack-actions.js (what other parts of the app add to a pack's page),
                  pack-authoring.js (the form your AI writes items in, and a change applied to a pack; pure, shared
                  with the Worker), pack-inbox.js
                  (this device's side of the relay: takes your AI's changes, reports back, Undo and delete everywhere),
                  clips.js (the recordings of your own packs kept on this device, by their bytes),
                  pack-items.js (one kind of item: what makes one a sentence, what a plain item may carry, which games it can play; pure, no language data),
                  path-page.js and path-layout.js (Where you are: every lesson a solid icon from lx/stop-art.js that is its own button, wandering slowly from side to side as the drafts did, no line; the layout pure and worked out from pathOverview; a lesson's bubble in the page, its words in a sheet),
                  deck.js (a session on a pack's cards: each its own unit, k:<pack>/<card>, on the scheduler), deck-steps.js (its games on the session screen),
                  progress.js (evidence on the device, its format, gradeOf,
                  and what you know: unitState, conceptState, knows), scheduler.js (FSRS per unit and strength, through
                  the vendored ts-fsrs, replayed from the evidence), frequency.js (a language's word-frequency list from
                  the open library), attribute.js (which units a word-by-word answer is evidence for), plan.js
                  (which steps a session gets), session.js (the session screen), settings.js (study settings, per
                  way of studying, on the device), voice.js (hearing the language: recorded clips with word timings, or the
                  device's voices; a pack's recorded voices take turns unless the pack pins one), speaking.js (picks
                  the recognizer); shell/settings-voice.js is Settings → Sound and speech's Voices and Speaking, and Say it's own page;
                  shell/settings-packs.js is Settings → Language, Study → Your packs and each pack's page, shell/settings-pack-edit.js editing a pack of yours
public/audio/     The starter's recorded audio inside the app: <pack>/manifest.json (lexicommons-audio version 1, clips by
                  path) + <voice>/<item>.mp3, made by scripts/voice-pack.mjs (ElevenLabs, Dutch forced with
                  language_code). Public packs' recordings live in the open library (pack-audio.js, version 2)
public/js/speech/ Speech recognition for Say it: the browser's recognizer and Whisper on the device (WebGPU/WASM);
                  speech.js is the API, match.js the matcher; models in public/models/ as checked chunks
                  (gitignored, rebuilt by scripts/speech-build.mjs). docs/speech.md
public/js/read/book-format.js   The book and weave formats (lexicommons-book, lexicommons-weave): the tokenizer, sentence
                  breaks, version hashes, the hard checks and the reader's render (weaveSentence); a picture book's pages,
                  pictures and line breaks (picturePath: the shared /library/pictures/<hash>); and the word-frequency
                  list (lexicommons-frequency: validateFrequency, everydayShare, frequencyRanks); rightsProblems, whether
                  a book may be shared. Pure: the app, the Worker, the books pipeline and the tests all run it.
                  read/weave-audit.js: the weave audit (pure; scripts/books/weave-audit.mjs is its command line).
                  read/catalogue.js: the catalog's entries and rules, as the books pipeline's publish builds them.
                  public/js/read/shelf.js: the open books shelf (curated sections first, when the catalog has them, then a
                  shelf per kind of book; the first as covers, every other a row to its page), the catalog kept for offline
                  (Cache lx-read-catalog-v1, public data only);
                  read/find.js Find a book (#read/find?q&level&kind: search, the Level and Kind sheets, 40 at a time, changed
                  in place); Your library's page (#read/library) is in read/library.js
migrations/       D1 schema
```

## Rules

- **One local server per session, stopped when its check ends (6 Nov 2026).** 26 `wrangler dev` servers left running across sessions took this machine to a load average over 400, and every browser check starved. Stop yours by its own pid tree the moment a run is done; never pattern-kill others'.
- **No new or changed screen lands or deploys until the director has looked at it at 390, beside the top of Home, line by line against
  `docs/design-bible.md`.** New UI is mockup first, with options beside the bare version. A green check never stands in (6 Nov 2026: Knowledge
  and Home's cards shipped on green checks, far below the bible).
- **The sample learner (an admin's, Settings → Admin; `study/sample-mode.js`) never touches a person's own progress.** While it's on, every store
  of progress is the sample's own: a module keeping progress names its localStorage key through `sampleKey()` and its IndexedDB database (or
  BroadcastChannel) through `sampleDb()`, and anything that sends study data out (sync, the study record, reminders, error reports, the practice
  room) returns early on `sampleOn()`. Run `test-sample-learner.mjs` after adding either: it fails on a store named any other way.
- **D1 refuses a compound SELECT of more than five terms** (UNION, INTERSECT, EXCEPT; SQLite's own default is 500). The moderator's queue is at
  five, so a pack's reports and a book's share one term. `scripts/fixtures/worker-env.mjs` refuses six as D1 does (6 Nov 2026: a six-term
  queue passed every Node test and failed on D1 at once).
- **A connection is revoked only through `revoked.ts revokeConnection`** (the marker, then the library's delete), never `OAUTH_PROVIDER.revokeGrant`
  alone: a refresh under way writes a grant revoked that way back into KV (6 Nov 2026). Run `test-revoked-grants.mjs` after touching either.
- **Ready-made themes are made, not hand-set** (`lx/theme-presets.js`): a theme is a short palette and a backdrop, and `themeTokens` works out
  every token, fitting each color in lightness until it reads. A new one goes in the module (never as a CSS block in tokens.css), then
  `test-themes.mjs` and `build-theme-tiles.mjs`. One sits on its base (Graphite or Paper) as `data-theme`, with `data-ready` naming it and its
  tokens in a sheet under the look's own (theme.js; theme-boot.js puts the copy theme.js saved on before the first paint).
  A flag's theme is one per flag (India's stands for four languages), from `theme-flags.js` (`build-flag-themes.mjs`), named for its place
  (Intl.DisplayNames; the ten that aren't countries' through t()); a language with no country's flag may have its own (public/flags/SOURCES.md:
  public domain drawings cut to 4:3), else a mark of its script. A flag's theme is a clean one, its flag's colors its accents, and no flag behind
  the page: the flag is only its tile's mark, in the corner where Home has the flag of the language you're learning. Appearance shows the
  language you're learning's flag under "For <language>", the All flags row to `#settings/appearance/flags`, then More themes. A tile is a small
  Home in its theme, held in its box by a stand-in drawn from the theme's tokens until its picture fades in. The top bar is the same solid band
  on every theme, a look with its own picture too (shell.css): the picture stays under the page. Every ready-made theme colors Tinta
  (`--tinta-ink`, theme-presets.js tintaOf): its accent fitted in lightness, or its other accent where the first would move more than 0.1 (a
  yellow), his edge 3:1 on the canvas and his white eyes 3:1 on him, its lightness 0.3–0.85 so his shade and shine show; the streak's drop, the
  week's splats, the streak page's studied days and Study's path strip take his ink with him (know.css, on character/ink.js's data-tinta-themed).
  Progress in the interface (the week's bars, the hundreds, the days of growth, a session's steps) takes `--progress-ink`: his ink's hue at 3:1 on
  the canvas, a step to come and a bar's line (progressInk); drawings keep the art's palette. A language's motif theme (MOTIFS: a palette from
  lex-art's picture) has no picture behind its page: every word sits on its plain canvas, and its scene (sceneTokens, cut by
  build-motif-themes.mjs) comes after each page's content (components.css `.lx-view::after`), the screen's width, nothing ever over it; on a page
  shorter than the screen it takes the foot above the tab bar. Its box holds from the first frame (--scene-ratio) and its picture fades in once
  decoded (theme.js holdPicture, theme-boot.js); all of it from tokens, so a slide's picture of a page has it too. "For <language>" shows the
  motif beside the flag.
- **The owner's name stays out of this repo:** it will be published open source. Say "the owner", or reword. `test-owner-name.mjs` fails on it
  in any text file that's tracked or would be, as a whole word in any case. Nor do the owner's words go in, quoted or marked as theirs in a comment:
  describe what was decided, not who said it. `test-owner-words.mjs` fails on either.
- **No check launches the owner's Chrome (4 Nov 2026).** A headless Chrome from `/Applications/Google Chrome.app` registers with macOS under his
  Chrome's bundle id, as a background app, and he couldn't open Chrome at all while checks ran; that's the likely cause, not a proven one.
  `scripts/quiet-browser.mjs` replaces whatever channel or path a script passes with Chrome for Testing (`scripts/install-check-chrome.mjs`), a separate
  app with its own bundle id, and refuses if that's missing; it never falls back. A copy of the app is covered only once it has the new
  `quiet-browser.mjs`. `test-quiet-browser.mjs` fails on a launch that would reach the machine owner's own Chrome.
- **Explore never suggests an opt-in pack** (`optIn` in the catalog, such as Dutch's strong language) unless the catalog also marks it `suggest`
  (a pack about one topic, published `library_publish { opt_in: true, suggest: true }`, seeded `seed-local.mjs --opt-in --suggest`): not the featured
  slot, a curated section or a home shelf. Leaving `suggest` out hides a pack rather than pushing one. It stays findable by search and in the pack list, after the others (`community.ts exploreHome`, `listItems`). Explore's home leads with the language's lessons (`path-<lang>`) as its main card, shown though they're on the device,
  with where you are and Start or Continue (`explore.js lessonsCard`, as Home's next lesson). The one pack to add next (face-out under them) is a curated section's first; else the most added once it has `MOST_ADDED_AT` adds; else, for someone signed in, the pack published
  to be suggested that they haven't added whose words are the commonest (the defaults are on their devices already; `community.ts featureOf`: the lowest
  `badges.meanRank`, each item's own word's mean place on the language's frequency list, `meanRankOf`, written at index time; `library_index.format`
  makes the next sync, the cron's within 15 minutes, rewrite rows indexed an older way); else the language's lessons, or with none
  its first pack of Lexicommons' own; the app skips any pack the device already has (`explore.js pickOf`). A topic's page and its count list only what's
  about the topic (`ABOUT_ONE_TOPIC`: a learner's pack with it, or one of Lexicommons' own about it alone); the general packs are on the home. With no adds yet, shelves list the lessons, then Lexicommons' own in the order they were published.
- **The app works in full with no AI (3 Nov 2026).** Most people will use the packs that are there and never connect one, so
  outside the AI section (`#ai`, `#practice`, `#settings/appearance/ai`) the app never offers an AI: no prompt, no button,
  no empty state that points to one. It may report what an AI already did for this person (Changed by Claude, Undo after a change), which
  only ever shows for someone who connected one. Prompts go for everyone, connected or not, and the AI tab comes only once connected
  (`/api/me`'s `aiConnected`, kept in `lx.me.v1`), by the switch that puts it in the tab bar; until then it's a card on Home (your last exchange with it). The "…" ask menu is off unless an AI is connected and the "Ask from anywhere" switch is on (Settings → Appearance → Layout, shown only with an AI connected; `lx.ai.ask-anywhere.v1`, on this device). Connecting is offered only on `#ai/connect` (`ai/connection.js`; `#settings/ai` opens it). Review a new screen on a
  fresh account; `no-ai-check.mjs` holds this at zero. A feature that only works through an AI moves into the section, or gets a version
  that needs none.
- **Storage apps** (all owned by imaginativeprompting@gmail.com):
  - Google Cloud project `lexicommons` (OAuth client "Lexicommons web app", testing mode);
  - Dropbox app "Lexicommons" (key `orjc5sbwlct9zh1`);
  - Entra app "Lexicommons" in its Default Directory (client `12fe23ca-…`): a Single-page application redirect,
    `/app/storage/callback`, and a Web one, `/app/storage/onedrive`, used once `ONEDRIVE_CLIENT_SECRET` is set. Microsoft ends a
    single-page app's refresh tokens 24 hours after the sign-in, a web app's after 90 days unused
    (https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens), and picks which by the platform the redirect is
    registered under, so the two are separate paths. A sign-in remembers its way (`via`) and is renewed that way; one Microsoft
    won't renew any more ends once (Settings: its line and Connect), never asked again. The secret expires (24 months at most):
    renew it before then, or OneDrive is back to a day.
  - The public IDs are in `wrangler.jsonc` vars. Callback: `https://lexicommons.com/app/storage/callback` (OneDrive's through the
    server: `https://lexicommons.com/app/storage/onedrive`).
- **After changing the app's files, bump their `?v=`** in `public/app/index.html` and the `SHELL` list in `public/sw.js`,
  and the service worker `VERSION` (static files are network-first, so this is for the offline copy).
  - **The app starts offline.** Who you are (`/api/me`) is kept on the device, its last answer (`api.js` `whoAmI`), and
    the app starts from it when the network or the server fails; a 401 (any call) and Sign out forget it, deleting
    the account clears it with every `lx.*` key. A first open hands the worker what the page loaded before it took
    over (`main.js` → `sw.js`'s message: the language's flag, a script's font), so the app opens offline as it looked.
    The starter's recordings (`public/audio/`) are kept whole at install, every clip its manifests in `SHELL` name, and
    offline a range request gets the part asked for (a 206 `sw.js` builds: an audio element asks for ranges, and Safari
    plays nothing without one). A recording that can't play is read by the device's voice, in the same sound
    (`voice.js` `playClipOr`), so nothing goes silent. `sw-check.mjs` starts the app cold with the network off after
    one open, and plays a recording offline.
  - **A file goes in `SHELL` once.** `Cache.addAll` refuses a list naming a file twice, and then the worker never
    installs: no offline copy, no push. From v41 to v57 sixteen language files were listed twice, and no device ever
    had the worker. `test-sw-shell.mjs` fails on a duplicate or a missing file.
  - **A new version, with nothing on screen about it** (`shell/new-version.js`, 11 Nov 2026; a toast offered Reload and Later before):
    no toast, banner, prompt, badge or dot for a new version, anywhere. A fresh open is the newest already (network first). A page left
    open asks the worker to look as it goes out of view and comes back (at most once a minute); the new worker takes it and the page goes
    on as it was. Settings → About's Version row then has "A new version is ready" with Reload under it, and only there. The one reload
    the app does by itself: coming back after 30 minutes or more out of view with a new version already ready, and nothing lost
    (`reloadBlocked`: no session or practice, nothing typed and not sent, no download the person started, which
    holds it through `lx/reload-holds.js`, and the network answering). A page in view is never reloaded. Reload is `location.reload()`
    and nothing else: it keeps the history and each entry's place, which the router owns (`test-history.mjs`). Run `update-check.mjs`
    after changing either file, a download that should hold the reload, or how `sw.js` installs.
- **Sign-in apps** (owned by imaginativeprompting@gmail.com and the Imaginative-Prompting GitHub account):
  - Google Cloud project `lexicommons-sign-in` (client "Lexicommons sign-in (web)", scopes `openid profile` only),
    apart from Drive's project so Drive's verification never holds sign-in back;
  - GitHub OAuth app "Lexicommons" (no scopes).
  - Sign in with Apple (built 6 Nov 2026, off until the Apple Developer account has it): a Services ID, its team and a Sign in
    with Apple key; no scope (no name, no email), answered by query, no PKCE on Apple's web flow. The client secret is a
    five-minute ES256 JWT signed for each sign-in with `APPLE_PRIVATE_KEY`. Off unless all of `APPLE_SERVICES_ID`,
    `APPLE_TEAM_ID`, `APPLE_KEY_ID` and that secret are set. The setup is in `../docs/design/sign-in-setup.md`; the privacy
    page names Apple only once it's on. The sign-in pages draw its button like GitHub's (decided 6 Nov 2026), outside Apple's
    listed styles on a dark page (white there); `components.css` keeps Apple's own colors for a flip (its comment says how).
  - Callbacks are exactly `https://lexicommons.com/login/<google|github|apple>/callback`; the public IDs are in
    `wrangler.jsonc` vars.
- **Sign-in identities:**
  - An identity is the provider's id for a person, never an email or a username.
  - No email is asked for to sign in, and nothing links accounts by email. An account may keep one email (decided 5 Nov 2026), only for getting
    back in when a passkey is lost and for receipts (`src/account-email.ts`): never a way to sign in by itself, never shown to anyone, kept only
    once a code sent to it comes back, one account per address, and nothing else is ever sent to it. A code is 6 digits, only its hash kept,
    15 minutes, 5 tries (each taken before the code is compared, so answers sent at once can't all be), used once (taken in one statement), 5 an
    hour per account and per address, any purpose (counted in the write, in `email_sends`, which removing an address, confirming one, a used
    code or a deleted account never empties: 6 Nov 2026, add-and-remove emailed an inbox without end); asking
    to get back in answers alike for any address and sends only to one on an account, after the answer; no email carries a link. Sending is
    Cloudflare's Email Sending (the `EMAIL` binding, from `EMAIL_FROM`; enabled for lexicommons.com); an empty `EMAIL_FROM` (a local copy)
    turns all of it off. Run `test-account-email.mjs`, `account-email-check.mjs` (and `--off`), `privacy-check` and `gate-check` after any
    change there.
  - A provider's token is used once, to read who it is, then dropped.
  - An account always keeps one way to sign in (`/api/auth/ways` refuses to remove the last).
- **Secrets** (`GATE_PASSWORD`, `GATE_SESSION_SECRET`, `UPLOAD_SIGNING_SECRET`, `GOOGLE_CLIENT_SECRET`, `ONEDRIVE_CLIENT_SECRET`,
  `GOOGLE_SIGNIN_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`, `APPLE_PRIVATE_KEY`, `VAPID_PRIVATE_JWK`, `VAPID_PUBLIC_KEY`) live only in Cloudflare
  (`wrangler secret put`, piped from stdin) and, for the gate password, the macOS Keychain (server `lexicommons.com`,
  account `site-gate`). Never print, log or commit them.
- **A cookie session's change comes only from this site (6 Nov 2026):** app.ts refuses an unsafe `/api/*` request a browser marks as
  another site's (`util.ts crossSite`: Origin, Sec-Fetch-Site), since bodies parse as JSON whatever their type and a form can post
  them. Exempt: `/api/v1/` (a token's), Stripe's webhook (signed), `/api/errors` (its own rule). Run `origin-check.mjs` after a change.
- **The gate bypass list** in `src/gate.ts` is security-critical: only token- or signature-authed paths go on it,
  plus the public files the gate page itself needs (`/css/app.css`, `/fonts/`, `/icons/`). `gate-check.mjs` holds it, in each state.
  - **Going public is one switch:** `GATE_ENABLED` in `wrangler.jsonc`. Off, robots.txt lists what's private instead of refusing everything and only `/`,
    `/privacy` and `/terms` lose noindex, and `/pricing` where the plan is offered (`indexable`, `robotsTxt`); nothing else changes, because every route
    checks who's asking itself, so a new route must too. Keep the secrets when it's off: on again, old cookies still work. `GATE_PUBLIC_PAGES` opens only
    those pages (and their stylesheet), for reading, while the gate is on. Where the plan isn't offered, `/pricing` doesn't exist (`app.ts PRICING_NAMES`:
    every spelling 404); run gate-check with and without `--plan` after a change there. Steps and the way back: `../docs/launch-switch.md`.
  - `/models/*` never reaches the Worker (`run_worker_first` in `wrangler.jsonc`), so it's outside the gate too: the
    public Whisper weights, served free per request. Never put anything else under `/models/`.
- **Speech models never go in the service worker's precache or shell cache**: `store.js` keeps them in
  `lx-speech-v1`, and `sw.js` skips `/models/` and deletes only `shell-*` caches.
- **An OAuth token does only what it was granted (6 Nov 2026):** workers-oauth-provider puts the scopes on `ctx.auth` but never enforces
  `requiredScopes`, so `src/mcp.ts` does. Without `learn:write` only tools marked `readOnlyHint: true` are registered: a new tool that
  changes anything must leave that mark off. The consent page lists exactly what's granted (`DEFAULT_SCOPES`, `src/env.ts`, for a
  request naming none). Run `scopes-check.mjs` after a change there.
- **Tokens are only accepted for `https://lexicommons.com/mcp`** (`MCP_RESOURCE`; under `wrangler dev`, the local
  server's own `/mcp`, from `PUBLIC_ORIGIN`). Keep CIMD and DCR both on; keep
  S256, `iss`, and `none` in the token endpoint auth methods (Claude needs it to pick CIMD).
  - **A refresh token used twice gets one answer** (`src/refresh-once.ts`, table `refresh_once`): a public client's
    refresh takes its grant's lock, and a repeat within 10 minutes gets the first answer (sealed with a key from the
    token) only while the grant hasn't moved since. The library rotates on every refresh, and Claude Code's sessions
    share one token: two refreshing at once would split it, and the copy saved last would be dead, signing every session
    out. A guard against a real case (reproduced locally), not one seen live. After any change to /token or the
    provider's options, run `test-refresh-once.mjs` and `refresh-check.mjs`.
  - **Before blaming the server for an AI app's sign-outs, read the client's own logs** (Claude Code:
    `mcp-logs-<server>/` and `~/.claude/history.jsonl`; on a Mac the logs are under
    `~/Library/Caches/claude-cli-nodejs/<project>/`). The sign-outs of 27 Oct were Claude Code's `/logout`, which
    deletes every MCP sign-in it holds, and no refresh was ever refused; the guard above was built for the wrong cause.
- **Roles are rows in `user_roles`, set only with SQL on D1** (never from a route, a tool or a screen). Admin tools are
  registered only for an admin's connection and every one calls `requireRole` (roles.ts), which reads D1 again; a
  personal token reaches them only if it was made with admin access. Every admin action goes through `logAdmin`.
- **The open library** (`/library/`, the `lexicommons-library` bucket) holds only what the books pipeline or an admin's
  library tools publish, both through the same checks (book-format.js, weave-audit.js, catalogue.js):
  content-addressed files, never overwritten, books public domain in the US and the EU (or openly licensed, with
  their attribution). The catalog changes by compare-and-set on its etag, and every change is a revision in
  `library_revisions`. Checking a whole book in the Worker costs about a second of CPU: that assumes Workers Paid
  (30 s per request), which the account is on; never move that work to a plan with a smaller CPU limit. Never put book, weave or list files in `public/`, and never change a format without
  `scripts/test-book-format.mjs` covering it.
  - An openly licensed book (StoryWeaver's, CC BY 4.0) shows its `rights.attributionText`, each role in
    `rights.attribution`, every picture's `credit` and `rights.licenceUrl` in the book; its pictures' `alt` is their
    `alt` text. `scripts/books/shelf-check.mjs <baseUrl> <outDir> [--book <id>] [--learning <lang>]` checks the shelf, a
    book's layers and its pictures in Chrome (through the GPU queue), for a learner of `<lang>` (Dutch by default).
  - A frequency list's numbers ("you'd know N% of everyday Dutch", a word's rank) are shown with its `attribution`,
    and OpenSubtitles asks for a link to http://www.opensubtitles.org/ wherever its data is used. The catalog
    lists it under `lists.frequency.<lang>`; read it from there, never from a hard-coded file name.
- **Audio and files never travel in tool arguments:** `request_upload` hands out a signed URL and the client PUTs the
  file (`request_look_image_upload` too, for the look's images).
  - A request body is read with `readBytesLimited` / `readTextLimited` (src/util.ts), never `arrayBuffer()` on its own:
    a chunked body has no Content-Length to refuse it by. A JSON body goes through `jsonBody` / `objectBody` in app.ts
    with its limit (a look's follows `LOOK_LIMITS`), and a field is read only when it's the type expected
    (`body-check.mjs` sends every route a crafted one; Explore's and the library's, `corrections-check.mjs`).
  - **A stored file someone uploaded or made is served so it can never run as a page here** (`fileSafetyHeaders` in
    src/util.ts: `Content-Security-Policy: default-src 'none'; sandbox`, nosniff, and anything but audio or a raster
    image as a download). Uploads, the look's images and the library's files all do; a new route serving one must too
    (upload-check's serving stage).
  - A stored file's key is fixed by its id or hash, it's created only if absent, and its row is set only while still
    pending. Deleting an account takes the rows in one batch (`RETURNING`) and then their keys, so a file arriving
    mid-delete keeps nothing.
- **Every check script resolves its outDir to an absolute path first** (`const OUT = outArg && resolve(outArg)`): it
  runs children in app/, where a relative one lands.
- **What the policy says is held by a check:** `privacy-check.mjs` fails on a table with an account's rows that isn't in `/api/me/export` or on its list
  with a reason, and `gate-check.mjs` on a cookie that isn't in privacy.html's table. A change to what's kept, who sees it or how long changes
  public/privacy.html (and its date) in the same landing.
- **A launch switch is a flag** (src/flags.ts): read it from env as before (index.ts lays the director's stored value over wrangler.jsonc's,
  then an admin's previews for that admin's own request), and add it to FLAGS: `missing` when it needs secrets (it never turns on without
  them), `apply` as the vars it means, `preview` what an admin's device sees (never money: the plan is shown with planShown, offered only
  with planOffered). Never read feature_flags anywhere else, and never cache env past a request. The app never changes what everyone has; the
  gate's switches stay a deploy's. Words the app shows are plain: no secrets' names, no docs.
- **What's shared in Explore is CC BY-SA 4.0, accepted once in the app** (`sharing_terms`; no MCP tool accepts
  them). `COMMUNITY_SHARING` is the one switch for everything a learner puts in front of others (community.ts `sharingOpenFor`: sharing a
  pack or a book, requests and "me too", corrections and flags, grammar suggestions); "admins" (wrangler.jsonc's, at launch) keeps it to
  admins, "everyone" opens it. A new way to publish calls `mayShare` (or `sharingOpen` where no terms are asked), its MCP tool sits behind
  `sharingListed`, and the app hides it on /api/me's `mayShare`; likes, adding, reports, counter-notices, withdrawing and closing stay open. A
  shared pack is checked with `checkPack` against the language's default packs, its file is `packText(checked)` at
  `packKey(id, version)` (created only if absent), the same layout as the library's own, and the same content twice
  is refused. Likes come from the app only (no MCP tool likes anything). Shared content carries no uploaded pictures.
- **Explore's index of the library's default packs follows the catalog** (`community.ts syncLibraryIndex`, after
  every catalog write): the catalog is the source of truth. So a report never hides one of them (`curated`); it
  goes to an admin, who takes it off with `library_unpublish`.
- **Moderation decisions are one batch, conditional on what they read** (`moderation.ts`). Two moderators, or a
  decision and a new report, can act at once. A write whose condition no longer holds changes nothing and answers
  "look again". An automatic return (a dismissal, a counter-notice upheld) happens only while nothing else holds
  the item down (`HELD`). Daily limits go inside the write they limit (`limitGuard`), so requests sent at once
  can't all pass a count taken first. Run `moderation-check.mjs` after any change there.
- **An accepted correction goes in with its version, in one batch** (`corrections.ts`, `community.ts versionStatements`):
  an accept claims its corrections (`accepting`, the claim naming the version it makes), and the batch that makes
  that version accepts them and supersedes the open ones on every piece it changed. On the library's own packs,
  indexed after their catalog write, a claim whose version was published (its admin log entry) is accepted; Explore's
  index of them is written by one sync at a time (`library_index`: the newest catalog revision's, its writes checking
  its token), and a catalog revision is named by R2's object version, never its etag (`library_revisions.r2_version`).
  A result is read from the rows' states, never guessed from the head; a claim left by a request that died is settled
  by the next request after 30 minutes. A version that undoes accepted corrections (update_shared, library_publish)
  asks `confirm_reverts`. Run `corrections-check.mjs` after any change there.
- **Hidden and removed packs aren't served** (`books.ts`: a community pack's file is 404 unless its version is on
  record in `item_versions` and its item is live, or withdrawn with no report taking it down; cached `private`).
  They aren't listed, and they drop out of followers' lists (Explore's home says why). Their owner still sees them,
  and why. A file whose records never came (a share refused at its limit) is never served; with no item at all, a
  pack file is served only if the catalog lists it. A pack identical to one taken down can't be shared again.
- **A moderator hides only a reported pack (or correction), and the hide lasts while a report on it is open.**
  Anything involving minors or illegal content, anything escalated, and a counter-notice (or the report it answers)
  is an admin's. A pack's owner is told the work a copyright notice names, and never who sent it (`noticedWork`).
- **The look is checked on both sides with the same code:** the server imports `public/js/lx/look-rules.js` and
  `css-safety.js` (`tsconfig` `allowJs`). Change a rule there and both follow; run `test-look-rules.mjs` and
  `test-css-safety.mjs`. A look that hides the app is undone on the device (`theme.addUsabilityCheck`); `/app/?safe`
  opens with the look off.
- **No inline scripts or styles:** the CSP is `script-src 'self'`. Every server value goes into the DOM as text.
- **Every word a person sees goes through `t()`** (`lx/i18n.js`; the plan is ../docs/plan-localization.md): a key in its area's English
  catalog (`public/js/i18n/en/<area>.js`, each `[English, about]`: what it is, where it shows, how much room it has), never a literal on a
  screen. A value goes in as `{name}` (a node too, so a flag or a chip sits where a translation puts it), a count as a plural, never pieces
  glued in English order; a language's name is `languageLabel(code)`. A key keeps its meaning for good: new words, new key. Areas move one
  at a time (`scripts/fixtures/i18n-areas.json`): a moved file holds no word outside `t()` (`test-i18n.mjs`), and its screens are among
  the walk's states (`i18n-walk.mjs`). Another locale's words are a strings file (`lexicommons-strings`) whose entries carry the hash of
  the English they were translated from, so an English string that changes is stale in every locale until it's translated again.
  **A locale ships as `public/i18n/<code>.json`, named in `public/js/i18n/shipped.js`, both in `SHELL`** (so it works offline);
  `lx/locales.js` says which have shipped and reads one's words (`loadLocale`), and the interface takes them through `setLocale`. A
  chooser (`setChooser`, the app shown in the language you're learning as you learn it) returns `{ locale, strings }`, and a message it
  picks is counted and formatted in that locale's own plurals and numbers.
  **A freeze localizes and refuses; a landing never waits on it:** between freezes a locale shows English for what it hasn't got. The freeze
  runs `scripts/i18n-freeze.mjs` (never a `test-*.mjs`, which every landing runs): while a shipped locale lacks a key, has one translated
  from older English, one that drops a value, or a plural short of a category its language has, the freeze is refused. Its `--todo` is the
  localize step's work list; each locale's words are fit-checked on screen (`i18n-walk.mjs --mode fit`) before it ships.
- **Your AI can coach you from your own study, and only then does your study leave the device** (`ai/study-record.js`, `src/coach.ts`): with an AI connected, the device sends a record for the language
  you're learning after you study: the path, each lesson, every unit's strength, what you struggle with, the sentences you missed. With none connected the app sends nothing and the server refuses it, and what's
  there goes with your last AI. An AI reaches for it unprompted through the server's instructions and `get_coaching_guide`. Outside the AI section nothing mentions it. `coach-check.mjs` holds all this, with real
  `codex exec` over MCP; `test-coach.mjs` the parts. A record is data: it holds shared packs' sentences, and the guide says so.
- **Who has the paid plan is Stripe's webhook, read again from Stripe** (`src/billing.ts`; off unless `PLAN_ENABLED` is "true" and Stripe's
  keys and prices are set, so a copy has none of it): `/api/billing/stripe` is outside the gate and refused without a valid signature
  (HMAC-SHA256, 300 s); each event once (`billing_events`); a subscription is written as Stripe says it is now, never from the event.
  There's no trial by default: the app is free, and a first month free comes only from a promotion code at Checkout (`billing-promo.mjs`).
  A trial set by hand in Stripe is once per account and once per card (`billing_trials` holds Stripe's fingerprint with no account); deleting an account
  ends its plan at Stripe first. Run `test-billing.mjs`, and `gate-check` and `privacy-check` after any change there.
- **Off at launch, the plan is never named** (`PLAN_ENABLED` "false" in wrangler.jsonc; `src/offered.ts planOffered`): no screen, public page
  or MCP text says payments, a plan, prices, Stripe, a trial, receipts or the in-app AI (`scripts/fixtures/plan-words.mjs`). On the public
  pages a part about the plan is marked `data-plan` (its plan-off wording `data-no-plan`; a key of your own `data-own-key`), and app.ts
  takes out what isn't offered as it serves them; anywhere else, words about it are drawn only where `/api/me`'s `features.plan` is true.
  `gate-check` (the pages) and `privacy-check` (every screen, MCP) fail on one, with `--plan` as their controls. Switching it on:
  ../docs/plan-paid.md, "Switching the plan on".
- **A key of your own for the in-app AI never leaves the device but to its provider** (`ai/own-key.js`, `practice/inapp-run.js`; off unless
  `OWN_KEY_ENABLED` is "true", which a local copy sets): sealed in IndexedDB under a non-extractable key, never in an attribute or any
  text on a page, never synced, exported or sent to this server; a provider is called only at an address in `ai/inapp.js PROVIDERS`,
  each in the CSP's `connect-src` (never `https:`), with ZDR and no data collection. Signing out and deleting the account forget it.
  An in-app practice is the room's `inapp` mode: the device makes the reply, the room checks it as your AI's (`appReply`), and no AI
  over MCP can join one. Run `own-key-check.mjs` (both ways) after any change there.
- **The in-app AI on the plan runs on Lexicommons' own key, metered** (`src/ai-hosted.ts`, `ai/hosted.js`; off unless the plan is and
  `OPENROUTER_API_KEY` is set): conversations (every kind of Practice) and Translate with AI, never packs, texts or looks. The server builds
  every request from what the practice room holds (the device sends only which practice and the last turn it saw), with ZDR, no data
  collection and an opaque tag for the account. A call reserves its worst case in one conditional write, one at a time an account, inside
  the month's allowance (`billing.ts PLAN.allowance`), and settles at OpenRouter's own `usage.cost`; the ledger (`ai_usage`) keeps tokens
  and cost, never words. Run `test-ai-hosted.mjs` and `hosted-ai-check.mjs` after any change there.
- **Requests for your AI are data, checked on both sides** (`ai/requests.js`): nothing in one runs. A field is read
  only when it's the type expected, never coerced (JSON can carry `{"toString": null}`, which `String()` throws on).
  An answer is plain text with the language's words marked `[[…]]` (`answerParts`); the screen puts it in as text.
- **How things look follows `docs/design-bible.md`, and the games `docs/games-bible.md`.** A new screen is designed from them and shown before it lands. A screen that hasn't been chosen
  keeps its content under the new bar, and has to look right with content running under it.
- **Motion never blocks a press** (a hard rule for every animation; `public/js/lx/motion.js` enforces it):
  - State and layout change first; never `await` an animation or disable a control while something moves.
  - Anything pressable that moves, shakes or pops is drawn by a ghost (`motion.fly`/`decorate`/`leave`) while the
    real element already sits at its destination, pressable. The one exception is something a finger moves: a sheet,
    and a page under a swipe back, which move themselves (`motion.slide`) as they follow the finger and settle. A press
    finishes their slide at once, and a closing sheet takes no presses. `sheet-check.mjs` holds the drawer's behaviors
    with real touch input, `page-check.mjs` the pages'.
  - One sheet at a time (`ui.sheet`): a sheet coming up closes the one that's up. A choice inside a sheet (a picker
    for a form) is shown in that sheet, in the form's place with its way back (`ui.backButton`), never as a sheet of its
    own, which would close the form and lose what was typed.
  - Interactive things appear by opacity and blur only (`motion.appear` enforces it).
  - Any press or key finishes every animation.
  - **A touch that ends as a tap always gets its click** (`motion.js`): iOS sends none for a tap within a few hundred ms of the last one or overlapping another finger (measured on
    an iPhone Simulator: pointerdown and pointerup come, and no click), and the control shows it's pressed and does nothing. It goes at once when the last tap was that recent, else
    a moment later if the browser's hasn't come; the browser's, if it comes after all, goes nowhere. So a game's piece keeps a plain click, and something following a finger
    follows that pointer's id alone, a drag starting past 12 px. `frame-check.mjs --only press` holds it; only a real tap recognizer shows the bug itself.
  - A ghost stays over its real element if the layout moves under it (`syncGhosts`), and keeps what its parts computed (a rule that depends on where the original stood doesn't
    reach a copy on the ghost layer).
  - Settings → Animations Off (or a device asking for reduced motion, under "Match device") means none at all.
  - Never call `element.animate` on a pressable element directly. `design-check.mjs` presses a destination 3 ms
    into a 3-second flight, and `app-check.mjs` does the same in real games.
  - Tinta (the character) is decoration: it takes no presses and nothing waits for it; its reactions register as below.
  - An animation that draws its own frames (requestAnimationFrame: the character, the splash) registers with
    `motion.registerTicker(finish)`, so a press finishes it as it finishes a ghost (`finish` jumps to its end state and
    stops its frames); with Animations Off it finishes at once and never runs. design-check presses 3 ms into one.
- **Touch:**
  - Hover styles only inside `@media (hover: hover)`, so a tap never leaves a highlight; a pressed state uses
    `:active`, and every control has one (HIG: "Always include a press state"): the press fill on a plain surface,
    `filter: brightness(0.88)` on one already filled (selected, on, playing) or a picture, the full ink on a link in a
    line. `:active` reaches every ancestor of what's pressed, so give it to the control, never to a card holding
    controls. component-check forces `:active` on every control (Chrome's CSS.forcePseudoState) and fails on one that
    looks the same.
  - Every control answers a tap over 44 × 44 px at least (Apple's minimum; Material's is 48). One drawn smaller
    reaches past its edges with the shared `::before` in components.css (`inset: min(0px, calc((100% - 44px) / 2))`:
    as far as it's short, no further); a part whose `::before` is taken uses `::after`; a scroller clips reaches, so
    give it the room. Controls sit 8 px apart. No text under 12 px. `component-check.mjs` holds both.
  - Quiet text is quiet by its ink (`--ink-2`, `--ink-3`; a fill by `--ink-4`), never by opacity, which takes its
    contrast from whatever is under it, theme by theme. Opacity is for motion (fades), a disabled or inactive control
    (WCAG exempts them), and pictures. component-check fails on text whose opacity, all the way up, is under 1.
  - Every input, textarea and select is at least 16px on touch screens (smaller makes an iPhone zoom in when it's
    focused). app-check's phone stage visits every page with fields (every Settings page, every request page, a
    session's typing, the ask sheet, signing in, /design) on a touch phone and fails on any under 16px.
  - The app never zooms: the viewport of /app/ and the sign-in pages says `maximum-scale=1, user-scalable=no`,
    `touch-action: manipulation` (base.css, app.css for the gate) stops double-tap zoom, and theme-boot.js refuses
    iOS's gesture events, which ignore the viewport. Text gets bigger through Settings' text size. /design and the
    public pages can still zoom.
  - Never `background-attachment: fixed`.
  - A full-screen layer sets `data-scroll-lock` on `<html>` while open.
  - **The keyboard** (`shell/main.js` `followKeyboard`): the top of the screen stays at the top on every screen, and something moves up only if the keys would cover it, and
    only as far as that takes. While you type with it open, `<html>` has `data-keyboard`, the app takes the screen above the keys (`--lx-vv-height`, shell.css) and the tab
    bar steps aside (other apps don't ride the bottom bar up on the keys). The keys are the visual viewport's height against the screen's as it was without them: `innerHeight`
    won't do, since on iOS 26 it falls with them. iOS scrolls the whole page to reveal a field, the app's frame with it, so a press on a field focuses it with `preventScroll` (a
    touchend, which still brings the keys), and any scroll of the document that gets through is put back. The layout moves only on a timer after focus leaves: a press on a button
    takes the focus before its own click, and the click would land on nothing. A session's step glides with the keys, and an answer takes them away. A sheet keeps its height and
    place, its content making room at its foot (`--lx-kb`, ui.js), and `ui.reveal` scrolls a field into the part of the screen the keys leave. keyboard-check.mjs holds the app's
    side with iOS's own numbers; the real thing is on an iPhone Simulator (`xcrun simctl`, real touches by AXe, a real on-screen keyboard: never `axe type`, which turns the on-screen
    keyboard off for that device until it's erased), or a phone. Shut a simulator down when you're not using it: a booted one is hundreds of processes.
- **A word named anywhere follows the study rule** (`content.js` `shownName`): in a language that shows readings, a
  chip, a list's row or a heading shows a word with its reading while it's new and as written once you know it, as a
  study card does. Name a word through `shownName` and draw it with `ui.conceptTag` or `ui.wordLabel`, never as bare
  text (docs/design-system.md).
- **Practice is the default, and learning is a choice** (`plan.js` practiceOf, `study/lesson.js`, `shell/study.js`, `study/path.js`; ../docs/design/lessons/duolingo-reference.md): one card
  and a few rows. Practice is about 5 minutes on what you've been taught, mixed, by the scheduler's evidence, in no order, shorter while there's less to ask about; only sentences whose every word
  and phrase you've been taught. Learn something new, a row under it, opens the next lesson; with nothing taught, the first lesson is the card. Every few practices (`practice.suggestEvery`) a practice's
  summary suggests the next lesson: that's the only nudge, and it blocks nothing. A lesson is about 15 questions, 5 to 7 new things, and nothing teaches before it asks: a new thing's first
  appearance is a question, shown and heard, its meaning a free tap; sentences by the fourth or fifth; each new thing back about 5 times; a lesson's idea after its first sentence. A miss comes back
  before the end. **Every wrong choice is something you've been taught or something in this lesson, never further on, never on the not-a-choice list** (lesson.js, new-words.js fillChoices, heardChoices).
  Lessons are data on a pack (`lessons`, pack-format.js) and worked out from the packs past them or where there are none, so every language has the same. **A pack written for its
  words teaches its own words** (content.js WORD_PACKS, pack-words.js: no lessons of its own and a gap in every sentence, as the word series and the category packs). A topic pack
  you chose (copies, not a default: path.js topicPlan) comes next on the path, right after the unit you were in when it came; it opens on its own words as cards, commonest first
  (OPENING lessons), then, turn about, teaches the little words its next sentences need, just in time in the lesson that first asks them, and its next own words; units "Nature and
  weather 1", each stop called by its words. The word series and every other pack's words come after the written path, by how common they are, each unit named by the topic most of
  its words are about ("Food & drink 2"), never "More words". A word is taught once; a worked-out lesson is behind you once none of its words is new (plan.js lessonDone), so
  what you know of a pack is skipped and the rest taught. Where you are comes from what each path has taught: a place on a worked-out lesson (a jump made
  with only a pack on) never carries you past written lessons you haven't done (plan.js nextLesson). A word no lesson teaches comes along in its sentence (marked, the meaning a tap, never counted as learned). The only stored things are where you've put
  yourself (`path-place.js`) and what you've finished (`done.js`: lesson, practice), both synced. Say nothing about what you'd lose, and don't show tomorrow's count.
- **Pictures** (`study/pictures.js`, `public/pictures/manifest.json`: `{ version, pictures: { <concept>: { file, h, alt, keep? } } }`): a drawing is a concept id, the same in every
  language. A lesson word names one (`picture`); every other word gets its language's, from `public/pictures/words.<language>.json` (`{ language, words: { lemma: concept } }`, naming only
  what's drawn: `loadWordPictures(language)`, then `pictureOfWord(lemma)`), so any pack in the language has them. Offline keeps the drawings a language's words name, plus `keep`.
  `alt` is one plain English line per drawing, never the word it's for (test-art). Loaded lazily as `<img>`, never in `SHELL`. A picture question needs 3 drawings on the screen; with fewer it's asked in words, and nothing shows a blank. A drawing fills its card, and right or wrong is the card's edge and mark.
  **A picture reacts to the answer** (`study/reactions.js`, a story per picture in `study/reactions/`, generated from the rig's `art/react/export-app.mjs`: fix it there): the tile you tapped goes happy or sad, a wrong tap's right tile goes happy too, and its last pose stays until the next question. It's decoration: it starts as the card's pop or shake lands, a press finishes it, and with animations off only the still shows. A story is safe to be missing, and plays only over the still it was drawn from (its `STILL_HASH` against the manifest's), so redrawing a still means redrawing its story.
- **A form shows only the senses it can carry** (`lang/form-senses.<code>.js`, `new-words.js` glossOfForm; a person's calls in
  ../docs/languages/nl-words/form-senses.md): ben is "to be", never "his, its". A form not in the table shows its word's whole gloss.
- **A wrong answer never names something heavy** (`lang/not-a-choice.<code>.js`, judged by `../pipelines/words/not-a-choice.ts`; the list in
  ../docs/languages/nl-words/not-a-choice.md): "to kill" doesn't stand beside the meaning of "nemen". Run it again when a pack adds common words.
- **A new word is met one at a time** (`study/new-words.js`, `plan.js`; ../docs/design/lessons/README.md): most common first, on a card about that
  word alone, with every other word's meaning a tap away. A tap on a word in Study is never a miss or a grade, on any step; a word that is itself the answer
  (a tile, a choice) keeps its press, and the Words action lists those. A step about a whole sentence runs only when at most one word in it is new, or on a
  sentence you've played. A word's first card isn't graded. A due word comes back in a sentence you haven't had when one will do.
- **A word you tap in a game is said as you tap it** (Settings → Sound and speech → Say the words you tap, `listening.tapWords`, which took over Match's `matchWords`;
  `voice.js speakTapped`, `session.js sayTapped`): a pack's recording of that word where there is one, else the device's voice, at once, and a tap stops a
  word still playing. **A tapped word never cuts off a sentence the learner is listening to:** while a sentence or a card plays (`sentencePlaying`, speakItem's
  and speakCard's sounds) a tap says nothing, and isn't queued for after. voice.js is the only thing that speaks, and it announces every sound to `character/speaking.js`; sound effects follow `onSpeech` and duck
  under any speech, never starting at full over a word. A tap that answers says no word alone while Answers will say the sentence, and what an answer says
  waits for the answer's sound to clear (`current.answerClear`: finishStep plays right or wrong through lx/sound.js, none on a skip or at Match's end).
  The games ask lx/sound.js for each effect: tile-in (ducked when its word is said) and tile-out in every word-order game, Match's `match` a step per
  pair, `match-last`, `match-miss`. Can't listen now ends the words for the session.
  `tap-speech-check.mjs` holds it, muted: what the page asks to be said, never a sound.
- **Some sentences don't start a learner** (`lang/not-first.<code>.js`, per pack: judged by `../pipelines/words/not-first.ts`, a person's calls in
  `../docs/languages/nl-words/not-first/accept.json`): under 2,000 known words none of them is a new word's card or question, nor a wrong choice in a game.
  **A words pack that's new or whose sentences changed needs `not-first.ts --previous` before it lands;** `test-first-words.mjs` fails otherwise.
- **A reworded sentence's word-for-word English is right too where it's acceptable English** (`lang/literal-ok.<code>.js`, `lesson.js` `alsoAnswer`):
  "Ik drink een koffie." is "I'm having a coffee", and "I drink a coffee" builds too (`step.also`, its words among the tiles). Each line is judged
  by its exact text in `scripts/fixtures/literal-judged.<code>.json` (every yes and no), and `node scripts/literal-ok.mjs` writes the game's file from it, so
  a sentence whose line changes is judged again: **a pack version that brings a reworded line not judged fails `test-study.mjs`.**
- **An idea's card never names a word you haven't met** (`lang/idea-parts.<code>.js`, `study/idea-parts.js`): an idea whose rule needs words the path
  brings later is told in parts, its card's name and words saying the parts whose words you know; the lesson that brings a later part's words shows that part
  as a step of its own, after a sentence with them. Any other idea keeps its lesson's line and the grammar's name.
- **The plan reads the word index, never a replay** (plan.js planState, viewOf): a unit's state from know/word-index.js stateOf with each strength's
  recall from its kept curve; new-words.js and path.js work their parts out when first read (a worked-out lesson's things and teaching too). Home's
  first draw on a year's learner read 16,000 sentences and replayed 20,000 units (2.8 s on a phone slowed 4×). What new-words.js and path.js work out
  is kept on the device (study/plan-kept.js, IndexedDB "lexicommons-plan" through sampleDb), each part under the key it was made for (planKey: the
  app's version, the language's packs with their versions and switches, the frequency list, the grammar's revision, the path's anchors): anything
  a part is made from that isn't in its key makes a kept part wrong, so a new input goes in planKey (and bump its SCHEMA when a part's shape
  changes). Run test-plan-speed.mjs after a change there.
- **What you know is derived, never stored:** `scheduler.js` replays the evidence (FSRS per unit and strength, keyed
  by language), and everything reads it through `progress.js` (`unitState`, `conceptState`, `knows`). Change how
  strength works there and in `scripts/test-scheduler.mjs`, never in a screen. An idea (a pattern) is in most sentences, so it's scheduled on
  its rate (`nextMemory`, POOLED_KINDS): its answers between reviews pooled, the first once it's due graded by their share right, 6 misses of its
  last 10 counting at once, every answer on the day it's met; one moving the card per answer kept every idea "Just started" a year in (6 Nov
  2026). The sample learner studies by `nextMemory` too; `test-sample-learner.mjs` checks its ideas a year in.
- **An Anki file is untrusted data** (`public/js/anki/`): its fields and templates can hold any HTML or script, and none of it ever runs or renders. Field text is
  walked as text to plain text in a worker with no DOM, linear in its length (`text.js`); a template is read only for which fields it names; only named tables are read, and a
  view or trigger in a crafted database is never reached. Everything's capped (`zip.js` CAPS) and counted as it's unpacked, whatever the file claims, and the page ends a worker
  that goes quiet (`import.js`). Run `test-anki.mjs` and `anki-check.mjs` after any change there.
- **One kind of item (pack version 2):** `pack.items` holds every item, sentence or plain. Only `id`, `text` and `means` are required (a cloze may skip `means`); `words` is the sentence's words, `concepts` the grammar it shows, and a `text` that disagrees with its `words` is refused. Anything that walks sentences uses `sentencesOf(pack)` (`study/pack-items.js`); `view.items`, so `ITEMS`, holds only sentences. `upgradePack`, `upgradeItem` and `upgradeChange` are the only place the old names (`nl`, `natural`, `patterns` on an item, `cards`) live, for what was kept from before: every read of a pack that didn't just come from `checkPack` goes through them (R2, D1 copies and queued changes, a device's records). A public pack from before stays stored as published, as its version hashes those bytes (`published` in packs.js). Your AI's form keeps `sentence`, `natural`, `patterns`.
- **A pack's plain items are in the day** (`study/deck.js plainOfDay`, `plan.js` Practice and Reviews): what's due of any pack that's on, its share of what's due, at least 2 and at most half a practice unless nothing else can be asked; and what's new only from a pack you made or copied, two at a time, met first and then asked, once there's something else to practice or no lesson to start with. An imported deck (`isImportedDeck`: `anki-…` with no `copiedFrom`) or a pack you follow brings new ones only when you open it. A round of Match takes due items that weren't asked by themselves. Today's count includes them. Only what has evidence gets a state worked out, so a 5,000-card deck adds tens of milliseconds to a start (`test-plain-day.mjs`).
  A plain item that exactly is a word the packs teach counts toward it (`deck.js wordOfCard`, `cardRows`): the word itself, with "the" before it if a deck writes it so, and a meaning that's among the word's own senses, every part of it. It's worked out from the glossary as it's played, so nothing's stored; anything unclear stays its own item.
- **A pack's notes are a file beside it** (`study/pack-notes.js`, `study/notes.js`; format `lexicommons-notes`): why each word of a sentence is there, at `notes/<pack>/<version>.json`, named in the catalog's `notes.<pack>`, published on its own (`library_publish { notes }`) and written by `../tools/packs/build-notes.mjs`. It isn't in the pack's file, so a start never reads it, and it's not under `PACK_CHECKS`. Each note carries the sentence it was written for: a new version of the pack keeps its notes, and a sentence that changed has none until it's written again. A device takes them with its packs (Cache Storage `lx-notes-v1`, none while saving data); `notesOfItem(item)` reads a sentence's, `notesNow(item)` once `notesReady(packIds)` has read them. A screen with none shows none.
  Your AI reads the same files on request (`src/coach-library.ts`): `study_concept` on a pattern adds its `chip`, `short` and `more`, `study_sentence` gives a sentence's notes word by word, and a form in `formOf`. They're read from the library when asked for, so the study record's limit never meets them.
  A language's word forms are the same kind of file (`checkForms`; `forms/<lang>/<version>.json`, the catalog's `forms.<lang>`, `library_publish { forms }`): one line per written form that isn't its dictionary form, true wherever it appears, for a word a sentence has no note on (`formOfWord(lang, lemma, text)`, `formNow`, `formsReady`).
- **What else a deck carried comes across as text** (`anki/deck.js`, `pack-items.js`): every other field with its name as `extras`, the note's tags as `tags` (without Anki's own `leech` and `marked`), shown only under More on this card, a press away and graded by nothing (`deck-steps.js`). They take what room the cards leave and never cost a card. They go with a shared pack like its sides, so a moderator's case shows them too (`moderation.ts`). Pictures in a deck still don't come across.
- **A pack's plain items aren't sentences** (`study/pack-items.js`; from an imported deck): they get no grammar point, wrong version or gap nobody wrote, each is its own unit
  (`k:<pack>/<card>`, its evidence through `TESTS` as any game's), and it plays only the games `gamesOf` says its content can carry. A deck's sounds stay on the device that
  read them (`record.sounds`, clips.js): not in the pack, not synced, not shared. A pack with no cards keeps its proof from before them (`proofHolds`), so the check's
  growth cost a returning learner no full check of their word bands (`pack-recheck-check.mjs`).
- **You can edit a pack of yours, and a change runs where the pack lives** (`shell/settings-pack-edit.js`, `pack-inbox.js changePack`, `pack-authoring.js editItem`): on the device, with
  the same `applyChange` and `checkPack`, offline, with nothing uploaded, for a pack the account has no copy of; through the relay for one it has (`copyGoes`), which needs a connection. Lexicommons'
  own and followed packs are read-only, and a copy is how you change them (it turns the original off, or every sentence plays twice). A person changes a text, what it means and how it's said; everything else
  on an item stays, and nobody is asked to fill it in. A spelling fix carries through a sentence's detail; anything more says so first and makes it a simple item, since `literal`, `wrong` and `gap` describe the old
  sentence. History keeps only the items a change touched (`inverseOf`), not the pack. What a page says about reaching other devices must be what that pack's route does: storage sync merges whole packs, so two devices
  editing one pack before they sync lose one side's edits. `pack-edit-check.mjs` and `test-pack-edit.mjs` hold this.
- **The account keeps a copy of a pack of yours only when something needs it** (`pack-inbox.js copyGoes`): an AI is connected (it works from that copy), a change from
  one made or touched the pack, or you've shared it (a fix you accept reaches your copy through it). A deck you added or your own copy of a shared pack otherwise stays on
  the device. `privacy-check.mjs` holds this, and the privacy page says it.
- **Packs are data, checked on both sides with the same code** (`study/pack-format.js`, `scripts/test-packs.mjs`):
  nothing in a pack runs, and the app shows all of it as text. A built-in pack never changes under anyone (its item ids
  are what evidence and recorded audio point to). A language is a module in `public/js/lang/`; **a pattern id is never
  renamed or removed** once anything uses it (published weaves do).
  - **Anyone may suggest a change to a language's grammar; only an admin accepts it** (src/grammar-suggestions.ts): a
    suggestion is checked when it's made (an explanation shown after every answer has an example with its literal gloss,
    in one to three sentences), waits as `open`, and an admin's review publishes the accepted ones as one next revision,
    claimed first (`accepting`, the claim's token at the start of the publish's note) so two reviews never put one in
    twice and a hide lets go. The published grammar never names a person: a source says how its suggester knows the
    language ("a native speaker, in Explore"), and the suggestion's row, which goes with their account, says who.
    Contributing follows `COMMUNITY_SHARING` and the sharing terms, like every contribution to Explore.
  - **A language's grammar is data** (lang/grammar.js; ../docs/design/grammar-as-data/README.md): the patterns every
    pack, weave and grade of the language shares. Revision 1 is the app's own (lang/<code>.js `patterns`); a change
    after it is the next revision, published by an admin (`library_publish { grammar }`), never a deploy: the whole
    grammar, every pattern with its source, every id of the one before kept (retire one: `retired: true`). Before
    anything is checked against a language's patterns the Worker installs the catalog's revision (src/grammar.ts
    `grammarReady`, in defaultsFor, installedFor, the library's publish and a question's check), and a device syncs it
    with its packs (study/grammar.js), keeps it for offline and installs it before any pack is checked; a change from
    your AI refused for a pattern the device doesn't have yet is tried again once the newer grammar is in. Installing
    only moves forward, and a restore of the catalog never takes a grammar back. A new id goes on
    scripts/fixtures/pattern-ids.json, a library revision's too (test-grammar reads library/grammar/<code>/ beside revision 1). A Node test
    that loads packs/ imports scripts/fixtures/library-grammar.mjs first: the library's newest grammar installed, as a device does before
    checking a pack (path-nl uses revision 5's patterns). A pattern no sentence shows isn't offered (content.js PATTERNS_IN_USE).
  - **A pattern opens to more than its name** (lang/grammar.js): `chip` (a short name for a small label) and `short` (the rule in one sentence) are in the grammar, so they're there at every start;
    what's longer (`explain`, `examples` with the words that show the rule marked, `contrasts`, `mistakes`, each concept with its own `source`) is a file of its own, format `lexicommons-grammar-more`, at
    `grammar/<lang>/more.<version>.json`, named in the catalog's entry as `more`. It's published on its own (`library_publish { grammar_more }`), a new revision keeps it, and a device keeps it beside the grammar
    (`lx.grammar.more.v1`; `study/grammar.js patternMore(lang, id)`, null when it has nothing for that pattern). A screen falls back: `chip ?? name`, `short ?? about`. Every pattern a language's pack can use needn't have one.
    `../tools/packs/build-concepts.mjs` makes both files from a judged concepts file. Deploy code that knows the fields before publishing them: an older device's check leaves them out, finds the version doesn't match, and stays on the grammar it has.
  - **A pack's own pattern is `<pack id>.<id>`** (since 2 Nov 2026; bare ones from before stay valid): your AI's new
    ones are made so on the server before the change is queued (pack-authoring.js `ownPatternIds`), so two authors
    never collide and the shared grammar never takes one over; a copy keeps them (the two share evidence). `same:
    "<shared id>"` on one makes it the shared grammar's: the view names the shared id on its sentences, and progress.js
    counts both ids' evidence as one unit (`setUnitAliases`, from content.js); the rows keep what they were recorded as.
  - **Your AI's changes reach your packs only through the relay** (`src/packs.ts`, `study/pack-inbox.js`). Each is
    checked on the server with `pack-authoring.js` and `checkPack`, against the account's copy with what's on its way
    applied, then checked again on every device that applies it. It keeps its id everywhere (taking it twice changes
    nothing), and its content goes once every registered device has reported, or after 7 days. Deleting a pack, or
    Undo, in the app goes through the relay too. The account's copies are for the AI and the server's check only:
    never serve one to a device.
  - **Corrections an author accepts in Explore reach the pack they shared it from through the same relay**
    (`queueOwnerChange`, called by corrections.ts): applied to that pack as it will be, sending only the items and
    dictionary entries they change (so the author's own edits stay), checked the same way, named for Explore, with
    Undo. No copy on the server yet: `no_copy`, and the author is told instead. Relay tests run in Node on the real
    migrations (`scripts/fixtures/worker-env.mjs`: D1 as SQLite, R2 in memory, faults on cue).
  - **Your AI's texts reach your devices only through the text relay** (`src/texts.ts`, `read/text-inbox.js`): checked on
    the server, then again on each device (an EPUB is made into a book there, by `bookFromEpub`), under the relay's id.
    A text you add yourself stays on its device and never goes through it. **Covers are personal**: one is SVG your AI
    drew, cleaned by `cover-svg.js` on both sides (an allowlist, written out again from what's kept, never passed
    through; run `test-cover-svg.mjs` after any change, and have its bypasses reviewed), kept with the device's
    pictures and shown only as `<img>`; nothing shared ever carries one (a pack with a cover is refused).
  - **Translate finds only what packs and books say, and credits each one** (`translate/engine.js`, the same on the
    device and the server): no outside service, and no model but the full translator on the device (below). A pack's sentence whose gap is a word is that word's own:
    the words' own sentences come first, and one thing typed (a word, or a phrase or gloss of several) shows up to
    `TRANSLATE_LIMITS.examplesOne` sentences, anything else `examples`. One word that is a word both ways (hi: Dutch
    says hi too), typed with no direction, shows the reading for the language you were last in, with the other under the wide button (`search`'s `both`). The server
    never searches anyone's own packs or texts (those stay on their devices); a source past `TRANSLATE_SERVER`'s limits
    isn't searched.
    - **The server reads only a language's first default packs (`ownDefaults`) and its opt-in ones** (`src/translate.ts`): on this traffic an
      isolate rarely outlives a minute's quiet, so nearly every first search builds its index again (4 Nov 2026, seven word bands: 1.3–2.9 s
      cold, 72 MB of a 128 MB isolate). Every device has the rest soon after a first open and searches them itself. A result names them in
      `notSearched`, so a device without them says "Not found yet", never "Not in Lexicommons yet". `Server-Timing` shows the bytes read.
    - **The full translator runs on the device, and only once someone chose it** (`translate/translator.js`, `models.js`,
      `model-worker.js`; Mozilla's Firefox Translations models and bergamot, MPL-2.0, credited in Settings → Translate): what's typed
      never leaves the device for it. A language has it when both its ways with English are in `models.js` (one download, both ways):
      Dutch, and from 8 Nov 2026 the open shelf's other languages, es fr de pt it pl ru at about 73 MB each and tr at 44 MB (Mozilla
      has only its older tiny models for Turkish, noticeably weaker; English to Russian is Mozilla's Android build, the phone-sized one);
      a pair through English isn't offered until it's measured. The packs answer first, always, and its answer joins as the best guess
      when it's here; with nothing in the packs to say which way something goes, it says, asked both ways (what's already in the other
      language comes back nearly as typed), and shows no answer until both are in. Translate's page offers it quietly, last, only under
      a word-by-word or empty answer, online, with its real size, never waiting for the word packs; Not now is per language and
      device. A download pressed while this device is getting its word packs waits for them (never sharing the connection), says
      so, and Stop ends the wait; so does the background one. Nothing downloads without a press
      but the language you're learning, once, where the browser says it's on Wi-Fi and not saving data, with room (iOS never says, so an
      iPhone is always asked). Every file is checked against its sha256 before it's kept (Cache Storage `lx-translator-v1`, never in
      `SHELL` but the runtime's script), and lives in the library at `translate/<hash>.<bin|spm>`, uploaded with `models-r2.mjs`. Never
      "model", "Mozilla" or "AI" on Translate's page. On the owner's iPhone (5 Nov 2026): Dutch's both ways 73 MB, a sentence in 11–12 ms,
      about 300 MB of memory with both ways loaded. `test-translator.mjs` and `translator-check.mjs` hold it.
    - **Translate's page is Home's own** (`translate/page.js`, route `#today/translate`, as a session shares Study's key): the
      first key hides the rest in that frame and it stays the same field, so a phone's keyboard never drops.
    - **What's typed goes in a POST's body, never a URL** (`POST /api/translate`; there's no GET): people type private things here, and the host's logs
      keep URLs. privacy-check holds it, in the browser's requests and the server's log. Nothing on the server logs or keeps it.
    - **The device answers first, and nothing waits on the server:** its index and search run in a worker
      (`translate/worker.js`, on the page's thread where one can't start), got ready when the box gets focus, let go
      after 5 minutes unused; a key is answered at once and the server asked after a 300 ms pause, once per query.
    - **Never blank, never a false no:** Tinta (`ui.lookingUp`) once a wait has lasted 150 ms, and a line while packs
      download (`packs.js` `packDownloads`), the search running again once they're here. "Not in your packs" only once it's looked:
      "Not found yet" while packs are coming or the server's still out. On 3 Nov 2026 a first open sat blank for
      about 15 s after bands 1–7 were published.
    - **Dictation** (`study/speaking.js chooseDictation`, `practice/listen.js microphone`): the same order as a conversation: what you chose in
      Settings, else the browser's recognizer, one language at a time with a press to switch, so it works at once with no download. Whisper, for who
      chose it, is written down in both languages (speech.js `detect`, whisper-worker.js), the better per-word score plus how many of its words this
      device knows wins, and the other is one tap away, since Whisper alone leans hard to English on a short word
      (../docs/design/translate-v2/dictation.md).
      **On a phone Whisper is never offered and never automatic, and a model already on it changes nothing** (4 Nov 2026: it took the page down on the owner's
      phone, and the Home Screen rule that sent him to it was from a 2021 report his phone disproved). A computer with no recognizer uses Whisper if it's here,
      else its first press offers the download in place, with its size. A recognizer that fails outright says so, and on a computer the next press tries the other.
    - **No AI on it:** the page does its whole job with none connected, and nothing on it mentions one. The wide button under the answer opens what your packs have with this in it; with nothing there it says
      Find a pack, and only that press looks and only Add adds (`findPacksHolding`). Offline it isn't there.
    - **The full translator goes through `translate/translator.js`** (`translatorState`, `translateWith`, `onTranslatorChange`), the one place the page asks. It isn't built yet, so it answers
      "absent" and the packs answer alone. Its answer, its download and its absence are drawn on the page; the words "model", "Mozilla" and "AI" aren't.
    - **A word spelled the same on both sides never leads with what was typed** (`engine.js readSides`): the commonest word
      for it leads (hi: hoi), or it says it's one word in both (water), or one reading leads with the other under the button (room: cream; kamer).
      `scripts/fixtures/translate-same-spelling.json` is translate-check's table of them. The language calls are data:
      `translate/readings.js` (loanwords that are the same word; what comes first among a word's guesses; the particles that, typed
      alone, aren't a separated verb).
    - **A form's dictionary word is the one the packs use it as most** (`uses`: loopt is lopen, not aflopen, seen first).
    - **How common a word is comes only from a word series** (`buildIndex`, `pack:words-*` credited Lexicommons), which is in frequency order: never a lesson pack, whose order is about teaching and changes when lessons are rebuilt, or a shared pack, whatever it's named. A language with no series goes by its other packs, lessons left out. Where rank alone leads with a commoner word further from the meaning, the language call is `lead` in `translate/readings.js`, and each entry's own gloss must say it (test-translate); a word whose gloss doesn't goes to the language's maintainer first, never pinned without one.
  - **A pack's recorded audio is a manifest beside its version** (`study/pack-audio.js`, `checkAudio` on both sides):
    clips are named by their bytes and pooled at `audio/<16 hex>.<mp3|m4a>`, served in byte ranges (an iPhone needs
    them); the manifest at `packs/<id>/<version>/audio.<12 hex>.json`, named in the catalog entry's `audio`. In the
    library every voice carries its license and credit (recordings are not the pack's text, and their rights are
    their own), shown with the pack in Explore. An admin publishes it with `library_publish { audio: { pack,
    manifest } }` against the version on the catalog. **A version never goes out without the recordings that still fit
    it** (5 Nov 2026: one did for 82 s, a phone that started then kept no recordings, and on silent its device voice said
    nothing): a new version carries the recordings of every sentence it says word for word in the same catalog change
    (`library-admin.ts`, `pack-audio.js fitAudio`/`unchangedItems`), its check warning on each recorded sentence it changed
    or dropped; a device brings them across versions itself (`packs.js ensure`, `syncAudio` drops only what no longer
    fits), and looks for a version's own recordings whenever the app comes back into view (`syncRecordings`, at most a
    minute apart). `test-library-recordings.mjs` and `recordings-check.mjs` hold the device's side, admin-check the
    library's. Shared (community) packs carry no recordings. On the device (`packs.js` syncs the entry's
    `audio` with the pack, checked with the library's rules; `voice.js` plays it): each sentence plays its own pack's
    voices, a pin is per pack, and a pack's page shows each voice's credit and license. Clips are kept in Cache Storage
    (`lx-audio-v1`) and play from there offline: every clip of the packs that are on in the language you're learning,
    in the background after each sync (`study/keep-clips.js`: every voice, 50 MB a language, none while the device
    asks to save data), and any other once it has played. The starter's recordings inside the app play until its
    library copy brings its own.
  - **Your AI's recordings for a pack of yours are on the server only in transit** (`src/packs.ts` setPackAudio,
    `study/clips.js`). Each clip is uploaded (purpose `pack-audio:<mp3|m4a>`, 2 MB), checked by its bytes and named by
    them; set_pack_audio queues a change of kind `audio` (only what it sets, merged into the recordings as they will be
    and checked against the pack as it will be). Its clips are that change's files (`pack-audio-in:<change>`), served
    only to your devices while it's on its way, and deleted once every device has reported or after 7 days (200 MB in
    transit per account). Their home is each device (Cache `lx-audio-v1` under `/api/packs/audio/<clip>`, played only
    from there; a device takes the change only once every clip it carries is kept) and your own storage (sync.js blobs).
    The server keeps only the manifest (`pack_audio`, as of the copy's `through`). Never serve a clip of yours any other
    way, and never delete an upload a claim may hold: tidy marks one `pack-audio-going` first.
  - **An opt-in pack is one of Lexicommons' own that no device has until its learner adds it** (a catalog entry's
    `optIn: true`, pack-format.js; Dutch's strong language): packs.js never takes it as a default, Explore lists it as
    the library's and Add pack follows it (kept as Lexicommons' own: origin.own, credited so in Translate), and Translate
    online searches it like any of Lexicommons' packs. library_publish's `opt_in` (REST `optIn`, seed-local `--opt-in`)
    sets it; left out, a new version keeps what the catalog has, and a pack's recordings never change it.
  - **A public pack's full check is trusted at a start through its proof** (pack-format.js `checkedProof`,
    `proofHolds`; packs.js `loadPacks`): one fully checked when it arrived, whose content still hashes to its version,
    under the same `PACK_CHECKS` and its language's same rules, isn't checked in full again (ten word-series packs made a
    phone's start seconds slower). Anything else is: a changed pack, your own packs, a corrections overlay. **Change
    the check, and bump `PACK_CHECKS`**: test-packs fingerprints the check's code (`scripts/fixtures/pack-checks.json`)
    and fails until both are updated, and every stored pack is then checked in full at its next start.
  - **A device's default packs stay in the catalog's order** (`packs.js` `inCatalogOrder`; kept at each sync in `lx.packs.order.v1`, the ids until one has happened): a new
    version takes the old one's place. Translate's ranks and credits and the plan's tie-breaks follow that order (`pack-order-check.mjs`). On 4 Nov 2026 a republished band 1 went last.
    Publishing keeps a pack's place and adds a new one at the end, so the lists a person reads (`content.js` `PACKS`: Study → Your packs) put the
    language's lessons first, as Explore does; nothing else moves (on 5 Nov 2026 bands 09 and 10 came after path-nl, and the lessons showed between 08 and 09).
  - **A public pack goes public only through an admin's library tools**, with pack-format.js's helpers (`packVersion`,
    `catalogueEntry`, `withPackEntry`, `defaultInstalled`, `compareVersions`), so every publisher writes the same; a
    version is its content, never overwritten, and an item keeps its id from one version to the next (evidence points
    to it). `scripts/packs/seed-local.mjs` does the same into a local library only.
- **What a wrong answer says about each pattern** (`attribute.js patternOutcomes`, `lang/form-concepts.js conceptKind`): a word-order slip never counts against a concept about a word's form, a wrong form says nothing about the order, and a concept that's really both (Dutch's `perfect`, `relative`, `omte`, `modal`, `future`, `aan-het`) can take either. With a sentence's notes, a slip counts only against a concept on the words it touched; if that blames nothing about the order, all of them. With no slip known (gave up), or a language with no list, it's as it always was. A slip blaming no pattern at all marks its row `slip`: the scheduler ignores it, and your AI still reads a miss.
- **Evidence** follows `progress.js`'s format: one row per unit an activity tested or met, in a language (`lang`), with
  its skill (read · hear · say · sound), outcome (right · wrong · met), test strength and help. `gradeOf` is the only
  place a row becomes a review grade; exposure (met) and pronunciation (sound) never count as reviews. A game records
  through `TESTS` and `attribute.js`, so the same answer counts the same everywhere (`test-evidence.mjs`).
  Every row has a `uid` and every change goes through progress.js's `commit` (memory, IndexedDB, the other tabs), so
  the rows sync (`sync.js`) and stay in one order on every device; never write the evidence store another way.
- **Sync** (`sync.js`): data that's yours registers a kind with records keyed for every device ({ at, value } or a
  deletion { at, gone: true, about? }); a deletion must be recorded and is kept for good, or a sync brings it back.
  Every device writes only its own file in your storage and reads the others', so no write is lost. What arrives is
  untrusted: a kind's `check` takes the whole record and its key (never assign an arriving key into a plain object),
  `apply` turns down what can only be taken later, and nothing in a record runs (`test-sync.mjs`, `sync-check.mjs`).
  Anything that removes data for good goes through the account (study progress's clears) or stays restorable on the
  device (a pack a file deleted, 30 days): a file in the storage can change what syncs, never destroy it unseen.
  Blobs (`registerBlobs`: your packs' recordings) are files of their own named by their content
  (`lexicommons-<kind>.<account>.<name>`), written once, and kept only when the kind's `keep` checks the bytes.
- **Sound:** one thing plays at a time (`voice.js`); a speak button never disables, and pressing it again stops it.
  **Sound effects** (`lx/sound.js`; the kit as data in `lx/sound-kit.js`, its files in `public/audio/fx/` with `LICENSES.md`): the short
  sounds of right and wrong, tiles, Match's pairs, a session's end, the path. One kit in one key, leveled against each other and under
  speech; played through Web Audio, decoded ahead (an OfflineAudioContext, no press needed). The context is made ahead too, once the
  kit is in and the page is idle (`prepareSound`; making one opens the audio device, a long task that held back the first tap's frame),
  never in a press that comes after that: a press only wakes it (resume() inside the handler, as an iPhone requires), and nothing plays
  before one (`why: "no-press"`). With effects off none is made. Every
  word said goes through voice.js, which announces it to `character/speaking.js`; while words are said, effects play at 30 %
  (`DUCK`). An answer's effect plays first and speech after it waits for its `clear`; a celebration waits for a sentence still being
  said. Settings → Sound and speech → Sound effects turns them all off (on by default; `sound.effects` in study settings, synced as
  kind "sound"; it replaced "A sound when you celebrate", whose off carries over). Every request dispatches `lx-sound` on window
  ({ role, step, played, why, duck, afterSpeech, ducked }: duck and afterSpeech as asked for, played or not): a check asserts what was
  asked for and when, never by listening. A role with no files is silent on purpose (`why: "none"`). The summary plays one sound
  (`know/celebration-ui.js`), and the path a press as a stop's bubble opens; the gold ring on the path lights on every visit, so
  the unit's sound is its summary's. The kit's files are made outside this repo from the kit picked by ear; LICENSES.md beside them
  says where each came from.
  **The page's audio session has one owner, `lx/audio-session.js`** (Safari's `navigator.audioSession`; the type is the
  whole page's): "auto", so speech plays as media plays (through an iPhone's silent switch) and Web Audio effects as
  ambient (following the switch, mixing with other apps' music); "play-and-record" only while the microphone is open. On
  5 Nov 2026 the chime set "ambient" and left it, and every recording after a first finished lesson followed the switch.
  `test-audio-session.mjs` fails on any other file that names it; `audio-session-check.mjs` plays a celebration, then a sentence.
  No check ever plays audio out loud. Checks run on the owner's own Mac. **Every script gets its browser from
  `scripts/quiet-browser.mjs`, never from playwright directly.** It adds `--mute-audio`, and it silences
  `speechSynthesis` before the app's code runs: speak() keeps its timing and events but makes no sound. Web Audio plays
  into a node at zero volume (WebKit has no `--mute-audio`). That second part
  matters because on macOS the system's synthesizer speaks outside Chrome's mute. On 1 Nov 2026 component-check spoke
  Match's words, one language after another, out of his speakers. `test-quiet-browser.mjs` fails on a script that
  bypasses the module, and with `--browser` on a speak() that reaches the real synthesizer. A speaking test feeds a WAV
  as the microphone (`--use-file-for-fake-audio-capture`); practice-check's microphone (`CUE_MIC`) starts the sentence
  on the app's "listening" cue instead, on its own clock (a MediaStreamTrackGenerator), so speech after the cue must
  be heard whole: a file starting when the microphone opens passes only while the recorder starts within its lead-in.
  The ElevenLabs key comes from `ELEVENLABS_API_KEY`; never commit it.
- **The app never starts Whisper again once it has died with it in memory** (`speech/guard.js`, 4 Nov 2026): a phone can kill the page for Whisper's memory with no
  error to catch, so a mark goes down before it loads and comes up when it's let go, and leaving the screen lifts it. A mark still there when the app opens means the page
  died: every chooser then skips Whisper on this device, Settings → Study → Speaking says so plainly, and only its Try Whisper again press undoes that. A phone also lets
  Whisper go after a minute unused, as the app leaves the screen, and in Translate after each phrase. `dictation-check.mjs` holds all of it, with a real SIGKILL of the
  page's process. A phone's real limit and Safari's real recognizer can't be shown from here.
- **The microphone says "listening" only once the recording has its first audio** (speech.js, mic.js `record`'s
  `onStart`): anything said after the cue is in the recording. A context's first recording starts slowly (its worklet
  moves the audio onto a thread of its own, and Chrome restarts the audio output: 0.85–0.92 s with Bluetooth
  headphones, 33 ms on a fake output), so `wake()` starts the worklet inside the press (`loadCapture`), and Whisper's
  `listen` does too, beside the microphone's start, when nothing woke it. On 3 Nov 2026 the cue came first and a
  learner's first word was lost on every first press with AirPods (practice-check, and speech-check's Whisper cases).
- **The streak never pressures** (chosen 1 Nov 2026): no warning, countdown,
  loss count, purchase or sad character, anywhere. A day counts with one finished thing (study/done.js), starts at 4 am,
  and is held by an earned rest day, mending (two things the next day) or a pause; a break is day 1 again. Its rules
  live only in know/streak.js and `test-streak.mjs`.
- **Reminder settings are never lost:** Settings → Reminders saves one change at a time, in order; the server's
  report() writes only the state and setSettings() only the settings (and the unanswered count, in the same
  statement), so neither undoes the other (test-reminders interleaves them; push-check holds the first save back).
  The state is written only by compare-and-set on `updated_at` (src/reminders.ts `changeState`; every write moves it
  forward): a report or a subscription works itself out again on a conflict, and a cron run, whose notifications
  have gone, lays what it changed over the state as it is now (`overlayState`). So a studied day and a sent reminder
  are never lost to each other (test-reminders interleaves both ways).
- **Reminders never pressure** (src/reminders.ts, chosen 1 Nov 2026): at most 1 study reminder and 2 notifications a
  day, none in quiet hours, none on a studied or paused day, no second late reminder; they back off after 3 unanswered
  and stop after 7 with no goodbye; the words say what's waiting, never a loss or a threat (test-reminders.mjs holds
  each). The server learns only study days, pauses, due counts, a time zone and the week's counts, never what was
  studied, and forgets all of it when reminders go off on the last device. Every push shows a notification (Safari ends
  a subscription that doesn't); the app badge counts unread notifications only (Apple's HIG), never what's due.
- **A big evening's reminders all go on time** (launch capacity, 7 Nov 2026): a new learner's time is the hour their first
  session ended (push.js startTime, kept between 8:00 and 21:00), not one 7 pm for everyone; a cron run takes the due accounts
  in batches (src/reminders.ts RUN), reads each batch's notes and devices in two queries, sends 6 at a time, and writes 50 accounts
  in one D1 batch (a run may make 1,000 queries), for up to 10 of its 15 minutes; the scheduled handler waits for its jobs, so
  they have the cron's time, not a waitUntil's 30 s.
- **A start costs D1 as few round trips as it can** (the load rehearsal, 7 Nov 2026: D1's limit is round trips, ~406 a second
  for a launch mix, not SQL time; docs/launch-capacity.md, "Measured under load"). The device route (src/packs.ts putDevice) reads
  the device and whether any housekeeping has work in one batch, then writes with its answer's two reads in another: 2 round trips
  besides the session's. Its checks (housekeepingWork, texts.ts textHousekeepingWork) are the tidy statements' own WHEREs: change a
  tidy statement and its line there together. test-pack-relay and test-text-relay hold each piece of work and the count. GET /api/me
  reads in one batch (each module's statement: rolesStatement, accountEmailStatement, signInsStatement), the inbox poll asks both relays
  in one statement (packs.ts PACKS_WAITING, texts.ts TEXTS_WAITING), and a start's GET /api/look is one (looks.ts getLookOrLibrary).
- **D1 overloaded is a 503, never a 500, and never written into D1** (the load rehearsal, 7 Nov 2026). app.onError answers D1's
  "D1 DB is overloaded" (errors.ts isD1Overloaded) with 503, `Retry-After: 1` and `{ error: <words>, code: "overloaded" }`, plus
  `applied: false` only when it came before the route ran (the /api/* middleware's session lookup), so a write can be sent again.
  Its report is held in the isolate (holdOverload) and written as one counted group once D1 answers again (flushOverloads, from that
  middleware, OVERLOAD.quiet after the last). A retry is for `code: "overloaded"` alone: other 503s (the gate's, an OAuth refresh's)
  aren't this. test-errors holds the store's side. It's an overload only when the D1 binding threw it (`D1_ERROR: ` and D1's own
  error as its cause), never on words alone: a message that only says so is an ordinary 500 (test-errors plants them).
- **New accounts can be paused, nothing else** (SIGNUPS, src/signups.ts; launch day's SHED step 1, docs/launch-day-site.md): an account
  is made only in accounts.ts register/verify and signin.ts /login/new, and paused refuses at their doors: register/options (503,
  code "signups_paused", before the limiter: no passkey asked for), a provider's sign-in nobody uses yet (the words, no pending row),
  /login/new; register/verify is never refused (its passkey already exists). Signing in, adding a way in and every signed-in route go on.
  A new way to make an account checks signupsOpen at its door, and logs watchLine("signup") when it makes one (the watch counts them).
  "paused" holds while D1 can't be read (flags.ts holdWhileUnread); wrangler.jsonc's SIGNUPS is the deploy's value and the backstop.
- **A cookie costs D1 a read only within SESSION_LIMITER** (the launch's security pass, 7 Nov 2026): sessions.ts sessionOf counts
  each request that carries a session cookie once (a WeakMap on the Request: the preview overlay, the /api/* middleware and a page
  share it), per connection, before the lookup: 1,200 a minute (a class of 120 starting at once is 960), wrangler.jsonc. Past it,
  `SessionsLimited`, answered 429 with `Retry-After: 60` and words (code "rate_limited", which lx/retry.js never retries; a page's
  as text); the preview overlay just drops the preview. Error reports have ERRORS_LIMITER (30 a minute per connection), past which
  they're dropped and still answered 204. A new caller of sessionOf outside Hono must catch SessionsLimited. test-sessions,
  session-limit-check.
- **Tinta in an empty state, in a pose for its words** (docs/design/retention/tinta-places.md): every empty state goes
  through `ui.emptyState(words, { pose })`, its pose one of lex-retention's states (rig/inkdrop/states-retention.js:
  lounge, page, box, shrug, off, doze), never one pose everywhere. Loading (lex-character's), error messages
  (lex-mascots') and the reader (no Tinta in a book) are the bare ones left. `test-empty-states.mjs` holds this. Home
  has two Tintas: at the streak spot, and on the AI card beside your answer, reading your AI's line once it's seen
  (know/home-cards.js aiCardReads). On the first day back the streak spot's waves once (know/today.js waveWhenSeen; Welcome
  back's card and the paused reminders card have none), and know/today-pose.js chooses its calm pose (rest, mended) and
  the square it rings. Every other tab has one Tinta at most (a submenu only where he's needed).
- **Sentence case everywhere:** no uppercase labels.
- **Tabs keep their pages** (`shell/main.js` `views`): a tab's own page is built once and kept while you're
  elsewhere, then shown again as it was, scrolled where you left it. A page draws only into the host it's given. If
  it can go stale, its view returns `refresh()` (called each time it's shown again; it updates in place and never
  blanks what's there) and, for anything it follows live, `hide()`. A tab whose page has no `refresh` isn't kept
  (`KEPT_TABS`). Tapping the tab you're on scrolls its page back to the top; at the top already, a page under the
  tab goes to the tab's own page (`followTabTaps`, as iOS does). `tab-check.mjs` holds this.
- **Moving between a tab's pages is an iPhone's** (`shell/page-slide.js`, `shell/main.js` `nav`): going deeper, the
  page slides in from the right over the one leaving (which moves a third left under a 0.1 shade); back is the reverse
  (350 ms, `--dur-page` on `--ease-sheet`; Ionic's iOS is 540, wegoplace's 220). Pictures of the pages move (copies
  of the page in a closed shadow root with the app's rules, fixed on its box, clipped where they meet, no background,
  so a theme's backdrop shows through), and the arriving page is in place and pressable from the first frame. A copy
  of a page never goes into the document itself: the app's code and every check would find each part twice. Each history entry carries its index
  (`history.state.lx.i`): a new entry is a push, an earlier one a pop. Back (the header's, a tab tap at the top) goes
  through `goBackTo`: back in the app's history to that page when it's there, else in this entry's place, so back
  never leaves the app. Each entry keeps its scroll and a picture of its page. In the installed app, a swipe from the
  left edge goes back (Ionic's numbers: 50 px edge, past half or 0.2 px/ms). Tab switches don't slide; Animations off
  means nothing moves. `page-check.mjs` holds this.
- **A session's result bar slides** (`study/session.js` `setBar`): a result comes up from the screen's edge over what's there, and goes back down on the next step; its contents are in
  their place and pressable from the first frame, the move drawn by ghosts. The step doesn't move while the bar can lie over its empty space (a negative margin keeps its box); only when
  the bar would cover something does it make room, on the bar's curve. Every game's bar goes through `setBar`, so never set the bar's children directly. `frame-check.mjs` holds this.
- **Hint and the order toggle only where there's something to show** (`lx/literal-case.js`): `flipsOrder` (a literal line's chunks really change places: `lxCanFlip`, and every toggle and
  morph follows it) and `orderDiffers` (the order differs from the natural English, by the chunks, a `moved` mark or the words the two lines share: every "Hint: <language> order").
- **A session's step fits the screen** (`study/session.js` `fit`): on a small phone or with a long sentence it's
  drawn tighter a level at a time (`data-fit` 1–4 on the session, 5–7 once answered; components.css) until nothing in it
  scrolls: the quiet actions on one line, tighter spacing, tiles 40 then 36 px (a set with a reading keeps its 24 px),
  then once answered the instruction, the right order and last your order's readings left out (the heard line below
  shows them), the explanation in three lines with More. Within a step it only tightens; a new step starts loose.
  Arrange's order holds the tray's height (`lxReserve`), and every change to it refits (`lxOnChange`), as does each face
  arriving (`loadingdone`: a late instruction face is a line longer). `component-check.mjs` runs every starter's longest
  sentence at 375 × 667, Arrange's start with the instruction's face held back until the step is drawn.
  On a screen under 700 px tall the session bar and the sentence's card keep one size for the whole session, and the picture grid narrows and centers (`lxReserve`, 200 px at the
  least) until its last row clears the bar.
- **The DOM prints what `el()` leaves out:** `el()` skips null, undefined and false among its children, but `append`, `prepend`, `replaceChildren`, `before`, `after` and `replaceWith` print them as
  words, and `el()` itself prints a 0 (`xs.length && node`). Spread what may not be there: `...(cond ? [node] : [])` or `...[a, b].filter(Boolean)`. `test-no-stray-text.mjs` holds every call, and
  `frame-check.mjs` any such word that reaches a screen by a template string (`${count} cards`).
- **A first draw comes in whole, and nothing moves:** a page that shows something from this device returns `ready`
  (a Promise), and the shell holds it unseen until then (400 ms at most). A slot whose data comes later holds its
  place with `heldPlace(name)` and keeps its height with `keepHeight(name, node)` (`lx/shapes.js`, part `skeleton`).
  Never draw a guess that changes when the data comes. `first-draw-check.mjs` holds this.
- **The design system (`docs/design-system.md`):** build every screen from `public/js/lx/ui.js`; target `data-part`,
  never classes. A new component = `components.css` rules + a `PARTS` entry + a builder + a `/design` demo with every
  state. Meaning never rests on color (an icon, word or mark too); after changing a meaning color run
  `scripts/check-palette.py`. Renaming a part or token bumps `THEMING_SURFACE_VERSION`. Before deploying a change to
  it: `test-css-safety.mjs` and `design-check.mjs` exit 0. After changing design-system files, bump their `?v=` in
  `public/design/index.html`.
- **Pins:** `agents` 0.30.1 requires `@modelcontextprotocol/server` 2.3.1 exactly.
- **Git:** this folder is a git repo (since 27 Oct 2026), private on GitHub at Imaginative-Prompting/lexicommons,
  committing as that account's noreply identity (set repo-locally; never a personal account). The director commits
  app/ at each deploy freeze, tags each deploy `vNN` and pushes. Every other session lands files as before and never runs a
  git command that changes the repo (commit, add, stash, reset, checkout, branch, rebase); `git diff`, `git log`
  and `git show` are fine for reading what changed. A copy of app/ (`cp -c -R`) carries `.git`: never commit there.
- **Landing into app/:** a three-way merge whose base is each file exactly as your copy started: a pristine clone
  taken with the copy (`cp -c -R`, at the same moment), never a file copied from app/ later. Refuse when the two
  differ. On 27 Oct a base copied from app/ after another session's landing let a whole-file overwrite through and
  dropped that session's lines.
  - Merge against app/ at the moment of landing, never earlier: refuse unless `git merge-file` of yours, the base and
    app/ as it is right now is byte-identical to the checked candidate, then read each file back. A snapshot of app/
    taken at any other moment checks nothing: on 27 Oct a merge run 8 s before another session's landing was checked
    against a snapshot taken after it, and dropped that session's reader.js lines.
  - Documentation nothing runs (AGENTS.md, docs/, `*.md`) is the one exception: at landing its three-way merge must be
    clean and read back, but it needn't match the candidate, since no check reads it. Everything else must match.
- **Checks pass on a fresh state.** A stage that reads the open library (the word list, books, packs) branches on
  whether the local server has it, as knowledge-check's `hasList` does. On 27 Oct knowledge-check and first-draw-check
  each timed out on a server without the library, though the app was fine.
