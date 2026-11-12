# The Lexicommons design system

Everything on screen is built from one design system, and the system is built to be re-themed. A person can change the
theme, the layout presets, any token, their own CSS and images, and share the result as one file. All of it stays on
their device. The living reference is **`/design`** on the site: every token, component and state, under your current
appearance, with the Appearance panel beside it.

**How it looks, and why, is in [design-bible.md](design-bible.md), and the games in [games-bible.md](games-bible.md). Design from those; this file is how it's built.**
In short: the page stays quiet, each thing's form says what it does, and color lives in the art and the way forward (`--go`, Tinta's ink). The tokens grew out of NeedWright's design
system (Graphite on black, Instrument Sans for UI, Onest for headings and numbers), with the art's palette in `css/lx/art.css` and **meaning colors** on top.

## Files

| File | What it holds |
|---|---|
| `public/css/lx/tokens.css` | The layer order, fonts, every token, and the built-in themes. Load it first. |
| `public/css/lx/base.css` | Reset, body, icons, type roles (`.lx-h1`, `.lx-small`, `.lx-muted`, …) and layout helpers (`.lx-stack`, `.lx-row`, `.lx-spread`) |
| `public/css/lx/components.css` | Every component, selected by `data-part` |
| `public/css/lx/presets.css` | Layout presets, keyed on attributes of `<html>` |
| `public/css/lx/redesign.css` | The look as it's been chosen, screen by screen: Home and the floating tab bar so far. Loaded after `know.css`, in `lx.page`. |
| `public/css/lx/settings-wide.css` | On a computer (1024 px and up): the first run, Settings' pages and the AI section, whose own rules are in `shell.css` and `explore.css`. Wide-screen media queries only, keyed to those pages. Loaded after `shell.css`, in `lx.page`. |
| `public/js/lx/ui.js` | DOM builders for every component. Screens are built from these. |
| `public/js/lx/icons.js` | The icons, plus `MEANING_ICON` (one icon per meaning) |
| `public/js/lx/brands.js` | The marks of the ways to sign in (Google's G, GitHub's mark) and the `sign-in-button` part as markup, shared by the server's sign-in pages (`src/pages.ts`) and `ui.signInButton` |
| `public/js/lx/parts.js` | The theming surface registry, and `checkSurface()` |
| `public/js/lx/edge.js` | A card's outline when it isn't a plain box: one drawn path in a solid line color, fitted to the card (`design-bible.md`, Off shapes) |
| `public/js/lx/motion.js` | Motion: every animation goes through it, and none can block a press |
| `public/js/lx/appearance.js` + `public/css/lx/appearance.css` | The Appearance controls, shared by Settings and `/design` |
| `public/js/lx/theme.js` | The theme engine |
| `public/js/lx/theme-boot.js` | A classic script in `<head>` that applies the saved appearance before the first paint |
| `public/js/lx/css-safety.js` | The check custom CSS goes through (pure, so the server reuses it) |
| `public/js/lx/look-rules.js` | The rules every look follows: checking, an AI's change (`patchLook`), merging two devices' changes, comparing (pure; the server imports it) |
| `public/js/lx/look-sync.js` | Keeps the device's look and the account's in step (the app only) |
| `public/js/shell/look-watch.js` | The app's safety net (undo a look that hides the app), Undo toasts, safe mode's banner; starts the sync |
| `public/design/`, `public/js/design.js`, `public/css/design.css` | The `/design` page |

A page loads `theme-boot.js`, then the four `lx` stylesheets in the order above (plus `appearance.css` if it shows
the Appearance controls), then its own CSS and modules (`public/app/index.html` and `public/design/index.html`).

**Rows:** `ui.listRow({ symbol })` puts a quiet symbol from `lx/symbols.js` where a row's icon goes, with no tile, falling back to `icon` if the name isn't there. Settings' own CSS is the block at the end of `shell.css`, under `[data-settings]`.

## Layers: why your CSS always wins

The app's CSS sits in cascade layers, `lx.tokens, lx.base, lx.components, lx.presets, lx.page`, declared at the top
of `tokens.css`. A person's token edits and custom CSS are unlayered, and unlayered CSS beats any layer whatever its
specificity. So `:root { --m-right: … }` or `[data-part="study-card"] { … }` just works. Nobody has to out-specify
`:root[data-theme="graphite"]`.

## Meaning

Six signals that mean the same thing in every activity: a game, a study card, the reader, or a conversation graded
through MCP.

| Meaning | Token | Shape that goes with it |
|---|---|---|
| right | `--m-right` (blue) | check icon or mark |
| wrong | `--m-wrong` (vermillion) | cross icon or mark, wavy underline on words |
| slipping | `--m-slipping` (amber) | clock icon, solid underline |
| new | `--m-new` (no hue: bright ink) | sparkle icon, dashed underline |
| hint | `--m-hint` (no hue: dim ink) | bulb icon, dashed edge |
| moved | `--m-moved-mark`, `--m-moved-line` | highlighter mark plus a dotted underline (the literal line's moved words) |

- **Meaning never rests on color.** Every signal has an icon, a word or a shape too. Parts with no icon of their
  own (tiles, matches, gaps, words) draw `--mark-right` / `--mark-wrong` as a small mask, and missed session steps are
  striped.
- Each color has `-bg` and `-edge` partners. `theme.meaningTokens("right", colour)` sets all three at once, mixing the
  tint and edge from the color.
- `scripts/check-palette.py` checks the pairs under protanopia, deuteranopia and tritanopia. Run it after changing any
  meaning color in `tokens.css`.

## Tokens

All of these are CSS variables, and any of them can be overridden. `/design` shows the current value of each.

- **Surfaces:** `--canvas --chrome --well --fill --fill-hover --fill-active`
- **Lines:** `--hair --edge --edge-strong --ring`
- **Ink:** `--ink-1` to `--ink-4`, `--solid --solid-hover --on-solid --selection --backdrop --shadow-pop`
- **Highlights** (yours, in the reader): `--highlight` (the wash), `--highlight-edge` (its line), `--highlight-mark` (the ✦)
- **Meaning:** `--m-<meaning>`, `--m-<meaning>-bg`, `--m-<meaning>-edge`, `--m-moved-mark --m-moved-ink --m-moved-line`,
  `--mark-right --mark-wrong`
- **Strength** (how well something is known, one ink in steps): `--strength-0` to `--strength-4`
- **Type:** `--type-ui --type-head --type-mono --type-read`; sizes `--size-12 --size-14 --size-16 --size-20 --size-28`,
  `--size-read` (long reading), `--size-target` (the sentence being studied), `--track-head`
- **Shape and space:** `--radius-8 --radius-12 --radius-16 --radius-24 --radius-full`, `--control-32 --control-44
  --control`, `--density`, `--space-1` to `--space-7` (multiplied by `--density`), `--page-width`
- **Motion:** `--ease-standard --ease-spring --dur-150 --dur-200 --dur-320`
- **Image slots:** `--image-background`, `--image-mark`, plus any `--image-<name>` a look adds
- **The background image:** `--image-background-size` (`cover`, `contain`, `auto` for tiles), `-repeat`, `-position`,
  `-dim` (how much of the page color lies over it, `0%` to `90%`) and `-blur` (px). The page and the session screen
  draw it on their own fixed layer (`body::before`, `[data-part="session"]::before`).
- **A background per section** (see Sections below): `--image-background-<section>` and
  `--image-background-<section>-size`, `-repeat`, `-position`, `-dim`, `-blur`.

Built-in themes: `graphite` (default), `paper`, `auto` (follows the device), `contrast`, `sepia`. They never change: a
look that changes anything is a theme of the person's own (see Themes below).

## Sections

The app marks the section it shows as `data-section` on `<html>`: `today`, `study`, `read`, `know`, `explore` or
`settings` (`SECTIONS` in `look-rules.js`; `session` only while Settings previews a session's background, since a
study session is `[data-part="session"]` over Study). Each section can have a background of its own:

- **The image:** slot `background-<section>` (built in, like `background` and `mark`). Where it's set, it shows in
  that section in place of the main background. A study session with none of its own shows Study's
  (`SECTION_FALLBACK`), then the main one.
- **How it sits:** `--image-background-<section>-size`, `-repeat`, `-position`, `-dim` and `-blur`. Any that aren't set
  follow the main `--image-background-*` ones (a session's follow Study's first). Removing a section's image in the
  app takes its settings with it (`theme.removeImage`).
- **How it's drawn:** `base.css` resolves the section's values into `--lx-bg-image`, `--lx-bg-size`, … and
  `--lx-backdrop` on `:root[data-section=…]`, and the session screen resolves its own on itself, so a session closing
  over Study keeps its background until it's gone. These `--lx-*` names are internal: themes set the
  `--image-background-*` ones.
- **Changing section:** `theme.setSection(name)` (called by the shell on every route) sets the attribute, and when that
  changes the background, the old one fades out over the new one for `--dur-320` on a layer the pointer passes
  through (`.lx-backdrop-fade`, through `motion.animate`, so a press finishes it and Animations Off means none).
- **Settings → Appearance → Images** lists every section with what shows behind it. Each opens its own page
  (`#settings/appearance/images/<section>`) with the image and its fit, dim, blur and position, each starting at
  "Same". While that page is open, the section's background shows behind it.
- **Slot names** can't be a setting's token name (`background-read-size` and the like), so an image can't land on a
  setting.

## The theming surface (version 2)

What themes and custom CSS can rely on. **Target `data-part` names and their attributes, never class names.**

- Every component carries `data-part="<name>"`, and varies by `data-state`, `data-meaning`
  (`right · wrong · slipping · new · hint · moved`), `data-variant`, `data-size` and `data-level` (`0–4`).
- The full list, with each part's states, is `PARTS` in `public/js/lx/parts.js`, shown as a table on `/design`.
- Renaming or removing a part, state or token is a breaking change. Bump `THEMING_SURFACE_VERSION` and keep the old name
  working for a release. Theme files record the version they were made for.
- `/design` checks itself with `checkSurface()`: every listed part must be shown there, and no unlisted part may appear.
- Every part the code builds is listed, wherever it's drawn: `scripts/test-parts-listed.mjs` reads them from the code (el()'s `part`,
  `"data-part"`, `dataset.part`, `setAttribute`, markup, an options default) and fails on one not in `PARTS`, and on a part a stylesheet
  styles that nothing builds or lists. The landing gate runs it for every change under `public/`, so a new part comes with its row in
  `parts.js` and its demo on `/design` (design-check) in the same landing. What was missing when it came (11 Nov 2026) is its OWED list,
  which only shrinks.

## Motion

One exception to the ghosts below: a sheet moves itself (`motion.slide`; see `ui.sheet`), as any drawer does.

Animations are clean, quick and meaningful, and they never get in the way. Every animation is drawn over a page that
has already changed, so none can block anything. `motion.js` enforces this in every helper, so no screen has to
remember to:

1. **State and layout change first, instantly.** Nothing waits for an animation: no awaiting one before the next
   step, no control disabled while something moves.
2. **Pressable things never move under the pointer.** A move, shake or pop of anything you can press is drawn by a
   ghost, a copy on a layer the pointer passes through. Meanwhile the real element already sits where it ends up,
   pressable, and is unseen only until its ghost lands. Press where something is going and you press it.
3. **Pressable things appear by fading and sharpening** (opacity and blur), never by sliding or growing, which would
   move or shrink where a press lands. `motion.appear` enforces this.
4. **Any press or key finishes every running animation at once.** One exception: a tap on Tinta's ink where he can be poked is
   the poke, so it never finishes his poke (it finishes everything else). `registerTicker`'s `spares` is how.
5. **Settings → Animations: Match device / On / Off.** Off (or a device asking for reduced motion, under Match
   device) means nothing animates at all; CSS transitions go to zero too.

Durations and easings are tokens (`--dur-150/200/320/640`, `--ease-standard/out/spring`), so a theme can change the
pace.

| Helper | What it draws |
|---|---|
| `fly(node, fromRect, { ghostOf, arc })` | A move: a word flying into a gap, a tile into place |
| `glide(nodes, change)` | A layout change (tiles closing up after one leaves) |
| `decorate` / `shake` / `pop` | An effect on the spot, by ghost when the thing is pressable |
| `appear` / `leave` | Arriving (fade and blur) and leaving (a ghost slides off) |
| `measure` / `glideFrom` | A layout change that's already happened: everything that moved since `measure` travels from where it was, on one curve |
| `syncGhosts` | Every ghost put back over its real element, for the same frame, after changing the layout (they also follow it each frame) |
| `draw(svg)` | An icon written on: a check, a cross |
| `countUp` | A number counting up |
| `morphToDutch(line, englishOrder)` | The signature move: a literal line starts in English order, holds, then its words slide into Dutch order. Moved words arc off the line (leftward over, rightward under) and the highlighter goes on as they land |

`design-check.mjs` proves the rule on a deliberately slow 3-second flight: it presses the destination at once and the
press lands. As a control, the same press against a naive transform animation must miss.

## Tinta (the character)

Tinta is Lexicommons' character: an ink drop that's always liquid (part `character`, `ui.character({ state, size,
still, hidden })`). It's drawn live from its rig: the art lives in `../docs/design/character/rig/`, and its runtime is
exported into `public/js/character/rig/` by the rig's `export-app.mjs` (never edited here).
`public/js/character/character.js` runs it on the page as `<lx-tinta>`.

- **Decoration:** it takes no presses, and nothing waits for it. Screen readers hear "Tinta" unless `hidden` (use that
  where it repeats).
- **Poke him where he stands on a tab** (`ui.character({ pokeable: true })`: Home's streak spot and its Your AI card, Study's strip,
  Knowledge's This week, the AI tab's two; never inside a session or on an empty state, and never on the path page). His box takes a tap (his drawing never does), and a
  tap on his ink (his body as drawn, a finger's 4 px around it: character.js `inkAt`) is his alone: the link or card around him neither opens nor looks pressed
  (`data-poking` while it's down). A tap in his box beside his ink isn't his: the link or card around him takes it, pressed look and all. The path page's
  Tinta is deliberately not pokeable: he stands on your place and covers much of its stop, and opening that lesson is the page's main
  action, so every tap there is the lesson's (path-page.css `.lx-ps-tinta { pointer-events: none }`, which wins over `data-pokeable`;
  keep it). He splats into a puddle and pulls himself back up
  with a wobble; taps in a row are the next in turn (a ticklish shiver, the puddle sliding a step away from your finger and back,
  a splat, and every fifth a grumpy little squirt), each from where he is, at most one a beat (0.3 s: a sooner one is dropped). A
  run starts over after 4 s alone. A tap on his ink never ends his poke; a press anywhere else (beside his ink too) does, as it ends every animation
  (motion.js, rule 4's one exception: `registerTicker`'s `spares`). With Animations Off the tap does nothing; in a state he's busy
  in (scribbling) it does nothing either. The moves are the rig's `inkdrop/poke.js`, layered on the state he stands in (its
  `at(T)`), so each starts and ends exactly in it, and what he holds (ready's drip, rest's umbrella, mended's patch) is drawn up
  into him as he's hit and grows back; the rig's `tests/poke.mjs` holds them, tinta-tabs-check the app.
- **States:** a held state loops: idle, loading, and the ones drafted on the rig for their places (lex-retention's
  lounge, sleepy, rest, mended, page, box, shrug, off, doze: `ui.character({ state })`). A reaction (right, wrong,
  heart, wave: `ui.playCharacter(node, name)`) plays once and goes back to the state; it registers with
  `motion.registerTicker`, so a press finishes it. Which is which is the rig's state itself (`loop`, or a `dur`), so a
  state drafted on the rig needs nothing here; list it in parts.js's `character` states (design-check fails on one
  that isn't).
- **Animations Off** (or reduced motion): a still for each state, never a frozen moment. `still: true` asks for the
  still anywhere.
- **Smooth when still:** every still (Animations Off, the share card, the app icon, the splash's frames) is smooth
  vectors at full detail with no ripple. In motion its ink ripples only from what moves it (a landing, a splat, a
  shiver) and settles to none at rest. The rig's `tests/smooth.mjs` holds this.
- **Standing on something drawn** (a lesson on Study's path, your dot on its strip): `ui.character({ ground: false })` draws it with
  no puddle of its own under it, only its wet foot (the rig's `tinta({ ground: false })`). Where it stands on a drawing whose top isn't
  its box's (a cup's rim), `character/stand.js` `standOn(tinta, drawing)` puts its feet on the drawing's own top edge under its middle,
  found from the drawing's shapes once both are on the screen (path-page.js does it as your place comes into view).
- **Sizes:** `size` is its box's height (24 inline, 48, 72 on a card's corner, 160 on a screen of its own). The drop
  at rest fills the box; a hop, a splash or thrown ink draws past it, so give it room. Loading's box runs on to the
  right for its ellipsis.
- **In the first frame:** a page's Tinta is there in the frame the page is first seen, never an empty box it pops into a moment later (a
  start drew its first page before Tinta's code had come: 3 to 9 frames with nothing drawn on a phone at 4×, 6 Nov). The start loads Tinta's
  code beside the evidence (`shell/main.js`, 3 s at most), so from then on a Tinta is drawn in the frame it's put on the page; and a page's
  slide waits for `ui.charactersReady(host)` beside its view's ready. One made before the code has come holds its kind's first frame, kept
  from an earlier start (`character/firsts.js`: its state, size, ground, the theme's ink and moving or still, per build of the app), and
  the live Tinta takes over from that very frame, its loop on its own clock from there, so nothing changes on the screen. With none kept
  (a first open) it fades in when it comes (240 ms). `scripts/tinta-arrive-check.mjs` holds this.
- **Cost:** one frame loop for all of them: 30 frames a second under 120 px, 60 above. None off screen or while the
  page is hidden. Smaller boxes compute a coarser outline (the rig's `detail`) that looks the same at their size.
  Idle breathes on the compositor: its breath, sway and lean are one transform track on his drawing (the rig's `idle.motion`, a 31.2 s
  loop, about his ground point: `[data-breathing] > svg`), and the drawing is redrawn only for a blink, a glance and a shiver; a loop
  with nothing to draw sleeps until the next. So do the places' held states, each on its own track (the rig's heldMotion): Home's
  ready and counted, drawn only for a blink, the drip's swell, snap and regrow and the bounce, and the AI tab's beside, for its nods,
  its look at you and its thinking. So do the empty states' lounge, box, off and doze, mended on Home and sleepy on the paused reminders' row;
  a prop beside him (the box, the switch) is on a track of
  its own that holds it still against his breath, doze's cloud on one that drifts and sleepy's z's on ones that rise and fade (the rig's
  `tracks`, a matrix and, for a part that fades, an opacity, played on the parts his drawing
  marks `data-track`, on his breath's clock, and baked into his kept first frame). shrug and page act most of their loops, and rest's curl
  sways its umbrella all the time, so they're drawn every frame. Any held state that gives `rest`, `busy`, `next` and `motion` (and `tracks`, if it has parts of its own) plays this way, with no change
  here. Chromium samples a layer's texture under its transform, so a breathing Tinta also gets a
  track on his own `scale` that holds 1 for 31 years and reaches 1.5 only for an instant just before its end (`character/sharpen.js`):
  Chromium rasters him that much finer, and he is as sharp as drawn at 1×, 2× and 3× (8–15% softer without it). Nothing that ends it can
  show him larger: its first and last keyframes are 1, so finish(), a seek past its end and cancel all land on 1; it's made with his own
  animate(), never through motion.js (a press's finishAll() never sees it), and one ended is started again at his next drawing.
  `scripts/test-tinta-sharpen.mjs` and tinta-tabs-check's sharpening stage hold this. WebKit's layer is as sharp without it, so it's
  Chromium's alone.
- **Color:** its ink follows the theme, the light one on a light theme. It's the one color on the screen besides the
  meaning colors. Tinta is ink, so a theme may color it: `--tinta-ink` (its body), and if it wants, `--tinta-ink-shade`, `-light`,
  `-deep` (a prop's inside), `-brow` and `-gloss` (running ink's shine). `character/ink.js` reads them into a palette of the rig's shape,
  which every Tinta draws with (the stand, poses, acts, empty states, theme-wipe's wet edge); one it doesn't set keeps today's offset from
  the body in OKLCH, so `--tinta-ink` alone makes the whole ink. With none set it's the rig's own palette, every drawing as before. The
  eyes, mouth and a prop's paper, rim and grip keep their own colors. The splash keeps the default ink (it's iOS's launch image, which a
  theme can't change) and eases into the theme's in OKLCH as it hands over to the app (the live splash from the splat to the end; a held
  first frame as it fades), never in one frame; the shell's loading Tinta takes the tokens in CSS (`splash.css`), and the share card keeps
  its own ink. `scripts/test-tinta-ink.mjs` holds this.

### Tinta speaks

A Tinta that speaks (`ui.character({ speaks: true })`, one per screen) says what the app says: every sentence and word
`study/voice.js` plays, its mouth on the words while the sound plays.

- **The drivers:** voice.js announces each sound to `js/character/speaking.js`.
  - A recording comes with its words' times from the manifest, and its loudness is read from the file itself (decoded on
    the device, never played), so the mouth opens and closes with the real rhythm.
  - A device voice comes with its words' times estimated from their length (the rig's `estimateWords`), put right at
    each word boundary the voice reports; a voice that reports none runs on the estimate.
  - What's said is a word's reading where the language shows one (Japanese kana), so the shapes follow the sound.
- **The mouth:** the rig's `speechTrack` turns the words into mouth shapes by their letters, per writing system, a frame
  ahead of the sound as lip sync is. Closed lips and F/V hold two frames and a vowel at least one, so a quick word
  still shows. Tinta faces you while it talks, with a small bob on the loudness.
- **It follows the sound, so a press doesn't finish it:** it ends when the sound does, and a press that stops the sound
  closes the mouth at once. Not while a reaction plays (the reaction wins), not while it's loading.
- **Animations Off** (or reduced motion): its still; the sound plays as always.
- `test-speech-track.mjs` holds the shapes, the track, the loudness and the channel in Node; `tinta-speech-check.mjs`
  holds the mouth on /design's demo in Chrome.

### Tinta on a question

Every question in a session has Tinta beside its instruction, top right, 64 px (study/session.js; the pick of the two
places, 2 Nov 2026). One Tinta for the whole session, moved into each step's prompt; the instruction keeps clear of it,
so it never covers a word. Fitted tightest (data-fit 5–7, the instruction left out) it steps aside too, leaving with the
instruction: one of the parts that go with it (session.js `stepParts`, `WRAPS`), so its copy fades and rises with the
instruction's (motion.js `glideFrom`), never gone from one frame to the next; where the fit had it out already, nothing of
it shows (tinta-cards-check's 320 stage). On a screen 640 px
tall or less it's 44 px from the step's start, since a step there tightens the moment the answer bar needs room: one size
through a question.

- **It speaks** (`speaks: true`): each sentence the session plays, a card's, Listening's, the answer's.
- **Its eyes follow what you touch** (`node.watch(container)`): the control you press or focus, your finger as it drags;
  2.5 s after the last touch they're its own again, eased both ways.
- **It answers your answer:** right (a hop) or wrong (curious, never sad); nothing when you say you don't know. The
  answer's sentence plays at once, and a reaction carries the speaking mouth, so it says the words mid-hop.
- **A hint:** it points its curl at each word the hint marks, in turn, the one it's on ringed (`data-pointed`), then
  looks back at you (`ui.pointCharacter(node, elements)`). Hand it only clue words, never an answer. A press ends it.
- **Animations Off:** its still; no pointing, no moves.
- `tinta-cards-check.mjs` holds all of this in a real session; design-check's Tinta stages hold the part's behaviors.

### Tinta stays whole

Whatever scrolls cuts what's drawn past its start, and Tinta's acts draw well past its box, so a spot right under an edge
loses its head. It stays whole through its full motion, at every spot and size (`scripts/tinta-whole-check.mjs`; the
director's note of 4 Nov):

- **On a question,** the session's step starts under its bar, by `--step-room` (24 px), with the same again in padding: nothing
  in the step moves, and what fits still fits. The bar lies over that room, solid and taking its own presses; what scrolls
  goes under it. Tinta alone is over the bar, and only at the step's start: at rest it stands just under the bar's line,
  its hop goes over it, clear of the bar's words. Scrolled on, it goes under with the rest. Fit 2–4 draw it at 44 px, clear
  of the words above and under it; fit 5–7 don't draw it.
- **A picture of the page** (a step or a session leaving, the page under a swipe back, the theme's old look) has Tinta as it
  was. A copy keeps the drawing it was cloned with, and never draws a second one (`character.js`); and whatever makes the
  picture leaves an SVG's own ids alone (`[id]:not(svg *)`): its clips and outlines refer to them, and without them it's a
  solid block with eyes.
- **New spot, new act:** the check's watcher (`scripts/tinta-whole.mjs`, in tinta-tabs-check and tinta-acts-check) measures
  every Tinta on every frame of their runs. An act made to come in from off the page says so there (catch's stack until it
  lands, the paper plane), and nothing else may be cut.

### Tinta acts (perform)

Another part of the app can hand Tinta an act on its own elements (lex-mascots' acts in the rig's `splat/acts.js`: a
download's pour, an error's slump, Me too's stamp): `ui.performCharacter(node, make, targets)`, or `node.perform(make,
targets)` on a defined one.

- **The act:** `make({ palette, size })` returns `{ name, dur, exit, frame(t, T, { rects, data, speak, endedAt }) }`;
  frame returns SVG in the rig's VIEW units (its origin the middle of its ground, y down), and may draw past its box.
  It's made again when the theme changes, so its ink follows mid-act.
- **Its targets:** `rects` holds each target's box `[x0, y0, x1, y1]` in those units, measured every frame (it follows
  a target that moves), `null` for one that has left the page.
- **The handle:** `{ set(data), end() }` comes back at once. `set` hands the act its data (a download's
  `{ progress }`); `end` plays its exit: `endedAt` reaches frame, and it settles at `endedAt + exit`, or at `dur`
  (`Infinity` for an act that runs until `end`). Once it's over, or another move has taken its place, the handle does
  nothing. Through `ui.performCharacter`, data set before Tinta's drawing has loaded is passed on, and an act ended
  before it could start never plays (the page already shows the result).
- **A move:** its first frame is drawn at once; `data-state` is the act's name while it plays; a press finishes it.
  Moved on the page (taken out and put back in the same task) it carries on; taken off for good, it lets go.
- **Animations Off** (or a still, or a Tinta not on the page): nothing plays, `make` is never called, and the handle
  does nothing. Show the result in the page itself, never only in the act.
- **An act that goes wrong** (frame throws or returns no SVG) is reported (`reportError`) and Tinta settles; every
  other Tinta draws on.
- design-check's hooks stage holds all of this with a test act.

### Tinta's acts in the app

Where the app does something, Tinta acts it out with one of the rig's acts (`splat/acts.js`), each its own idea.
They're decoration on a screen that's already done: the page shows the result itself, a press ends the act, and with
Animations Off nothing moves. /design's "Tinta's acts in the app" (`#tinta-acts`) has each live;
`scripts/tinta-acts-check.mjs` holds them on /design and in their real places.

- **A download** (part `download-bar`, `ui.downloadBar({ label })`): the bar's own fill shows how much has come
  (`set(share)`, 0 to 1), whatever Tinta does. Tinta (32 px) stands on its near end; while it downloads it pours
  itself in and is the fill, its eyes on the front (act `pour`); `done()` fills it, and Tinta's ink runs to the far
  end and rises out of it as itself, hops, and stands there (its box moves there, so it settles where it came out);
  `stop()` leaves it where it got to. Keep one bar for a download and move it into each redraw (it keeps its act):
  build the row holding it after the last `await`, so it's never off the page across one. Used by Whisper's download
  (Settings → Study → Speaking: it stays, full, until you leave the page) and a library pack's recordings kept for
  offline (its page, only while they're coming: `packs.js` `keepingNow`/`onKeeping`; once they're all here it says
  so until you leave). A book from the shelf opening has the bar alone (`tinta: false`, variant `plain`) over the foot
  of its cover, measured from its files as they come (up to 90%; the book opens at the end): opening a book is the step
  into reading, and Tinta isn't in the reader.
- **Something that didn't go** (part `retry-line`, `ui.retryLine(text, retry)`, `askStatus().fail(text, retry)`): the
  app's own words, Retry (it does the same again, and is never disabled: a press while one is out does nothing more)
  and Tinta beside the words (32 px), which notices, slumps into a puddle of itself, peeks at Retry and pulls itself
  back up (act `slump`, `ui.slumpCharacter`). Where a screen already has a Tinta, that one acts it (`{ tinta }`): one
  Tinta a screen. Used by Explain this, Undo and the Ask your AI sheet (ai/ask.js), a request's Me too, Mark done, Open
  again, Close and answering it (explore/requests.js), and beside the practice room's "Couldn't send. Try again".
- **Me too** (`ui.stampCharacter(tinta, button)`, act `stamp`): on a request you can say "Me too" to, Tinta (36 px)
  stands at the start of the page's actions (`.lx-pinned-buttons`, its own column; the main action still the wide one).
  The press counts as it always has; Tinta throws a drop that lands on the button's near top corner as a seal (never on
  its words), holds a moment and dries away. Taking it back throws nothing. The page is drawn again when the server
  answers, and the same Tinta is moved into the new actions, so its act carries on. A failure there is acted by that
  Tinta, not a second one in the line. A Tinta at the start of the actions paints over the buttons after it.
- **The paper plane** (`ui.planeCharacter(tinta, "off" | "in")`, acts `planeOff`, `planeIn`): a pack shared from this
  device (Share in Explore, or Share this update) opens its item's page with Tinta at the start of the actions folding
  into a paper plane of ink and flying off, round and back to its spot, once (explore.js `justShared`). Your own request
  with an answer new since you last looked: a paper plane glides in from high on the right and unfolds into Tinta at
  the start of its actions, once, and it stays for the page's life. An arriving Tinta stays unseen (`data-arriving`)
  until its plane is on its way, so it never shows at its spot first.
- **A new theme** (Settings → Appearance; `themePicker({ tinta })`, `character/theme-wipe.js` `wipeTheme`, act
  `shake`): Tinta (48 px) stands at the end of the Theme label. A press on a theme changes it at once, as ever. The
  old theme stays a moment as a picture of the app (a copy in a closed shadow root with the app's rules and the old
  theme's colors pinned on it, as page-slide's pictures: never a second page in the document, and it takes no presses)
  while a hole in it opens from under Tinta, which shakes itself like something wet; the hole is the rig's splat,
  contoured each frame, with a wet edge of the old theme's ink, and runs past the screen's corners in about 0.7 s. A
  press ends it at once (a swatch under the picture still takes the press). With animations off, or before
  theme-wipe.js has loaded, the theme just changes. A Tinta in the picture is its drawing as it was (a still, never a
  second live one), its style copied through the CSSOM (the CSP refuses a style attribute).

### Tinta on the main tabs

Each main tab has Tinta in a place of its own, with its own pose and act (never the idle everywhere). The poses are
the rig's states (`rig/inkdrop/states-places.js`), each built into its part through the part's builder:

- **Home** (`know/ui.js` `streakSpot`, part `streak-spot`): right under Your progress, once something's been studied
  (in a phone's first view), at the left of the streak's line and the week strip, 64
  px. `ready` (a drip of ink hanging from its curl) until today counts, then `counted` (sitting back, content); a rest
  day or a mended one, lex-retention's calm poses (`know/today-pose.js`). The first time Home shows the day counting,
  once the spot is on the screen and clear of the tab bar, it throws the drip into today's square (`rig/inkdrop/today-throw.js` through
  `perform`): the square keeps its open look (`data-ink`) until the ink lands, at `THROW_IMPACT`, and the act's end or
  a press shows it at once. The throw ends straight into the pose the spot holds next (`counted`, or `mended` on a
  mending day), blended over its last 0.7 s, the state's props (the patch) fading in. Once a day (`lx.today.thrown`);
  with animations off, no throw.
- **Knowledge** (`know/week-tinta.js` on This week's card, `know/cards-more.js` `weekCard`'s `tinta` hook; part `week-tinta`, its place
  held 64 × 64 in the stat block from the card's first frame): idle beside the week's number. When the number has grown since this
  device last saw it (per language; `lx.know.weekSeen`), at most once a day, he holds his drip (`ready`) and, the moment the glasses come
  into view (the card's own observer calls `arrive()`), throws it into today's glass: the rig's `today-throw.js` with `mark: "into"` (the
  drop falls to the glass's floor and is gone, no splat), settling into idle. `arrive()` hands the card the landing (`THROW_IMPACT`), and
  the glasses move from then, each only as far as its day changed. A press ends the throw and the glasses move at once; the card never
  waits past 2.5 s. A redraw in place with the same number, a first look and animations off: no throw.
- **Study** (`pathStrip`, study/doors.js): 40 px, standing over your stop on the path strip, when a lesson is next. The first time the strip
  shows a new place (your place moved on since this device last saw it, per language and path; `study/strip-hop.js`), he stands over the stop
  before it from the strip's first frame (`performOnArrival`, so his first drawing is the act's) and, once the strip is on the screen clear of the
  tab bar, hops onto your place: the rig's `inkdrop/hop-to.js`, a crouch, an arc across, a landing squash, then idle. He's ink, so the strip
  starts at the old progress (the line to the stop he stands on, that stop your place's ring, yours a plain stop) and the new segment inks in
  under him as he flies, landing with him: the stop he leaves fills to a blot as he takes off, yours rings up as he lands (`inkStrip`, drawn in
  his own frames at the act's time; doors.js's drawing put back exactly once he's landed). Once a place; never on a
  strip held while a newcomer's lessons are coming (`held`), never with animations off; a press ends it with him and the strip at your place. `peek`, over a card's top edge (`PEEK_EDGE`), is kept in the rig and shown only on /design's Tinta section, on a card of its own: no screen draws it.
- **The AI tab** (`ui.aiStatus({ character })`): in the card's top corner, 56 px: `beside` your AI (listening),
  `scribble` while your AI is working on a request (`taken`), and `catch` (a reaction) when one is done while you're
  here, or since you were.
- **Reading your AI's line** (`rig/inkdrop/read-line.js`, act `read`, made for Home's AI card): Tinta, holding `beside`
  next to your AI's last line, reads it through `perform`: `node.perform((o) => readLine({ ...o, ask, rtl, lineHeight }),
  [line])`, where `line` is the element holding your AI's words in the language. Its eyes hop along each row in the text's
  direction (`rtl`; `lineHeight` in px says how many rows), then it reacts. With `ask` (your AI asked, or had the last
  word), it gives you a curious look and nods toward the line. Otherwise its eyes shut happily. It starts from `beside`
  as it is and ends in it (blended, `beside.at(T)`), about 3 to 4 s, its length set by the line. A press ends it, and
  with Animations Off it's `beside`'s still. `docs/design/character/rig/tests/read-line.mjs` holds it.
- **Loading** (`ui.loadingState(words)`, part `empty-state`, state `loading`): `writing`, 56 px, above the words: it
  writes loops of ink that run off to its right and dry. It's shown once the wait has lasted 0.4 s (components.css), so
  a quick load never flashes it, and whatever replaces the words takes it away. The shell's "Loading Lexicommons…"
  (app/index.html, shown only when starting takes more than a second, before any of the app's code) has `writing`'s
  still above it, its line of loops drawing itself in CSS; the rig's `splash/app-frames.mjs` writes it (never edit it
  here). An open book's own loading keeps no Tinta (the reader stays minimal).
- **Looking it up** (`ui.lookingUp(words, { size })`, part `looking-up`; Translate's wait): `lookup`, 40 px beside
  its words (32 beside a secondary line): a magnifier in its curl swept along a line, a peer through it now and then.
  Its glass stays inside its box, so the words are never covered; it fades in (160 ms) and goes with the words, so a
  page can show and take it away at any moment (tinta-tabs-check removes it 50 ms in).
- Every place: hidden from screen readers, a tap on his ink a poke and nothing else's (beside it, the link's), clear of every word (the words keep their
  padding), a still with animations off. `ui.holdCharacter(node, state)` sets a place's pose, before its drawing has loaded too,
  and leaves a running act or reaction alone. `tinta-tabs-check.mjs` holds all of this in the app.

### The tab bar's lens

The tab you're on is a lens (`ui.tabBar`, `tabLens`): the links are a gray row, and over them, taking no presses, a copy in `--tab-on` shows only through a bubble, so as the bubble
crosses a tab the part of it inside turns purple. The bubble runs on two springs, one per edge, the leading one quicker: it stretches, thins, travels and settles with a few pixels of
overshoot. Nothing here waits: the links never move, and a press on another tab turns it from wherever it is. With animations off it's just there. Not in the wide-screen sidebar, whose
current row is filled (`--fill-active`), its symbol in `--tab-on` and its words in `--ink-1`: the purple on that fill holds as a graphic (3:1) in every ready-made theme, not as
words (4.5:1), so only the symbol keeps it (`lx/redesign.css`; test-themes reads both tokens from there and measures them). tinta-tabs-check holds it.

### The first frame and the splash

**The first frame** is the plain ink drop on the app's black. On an iPhone it's what every start of the installed app shows: iOS's launch image, then the same picture as the first paint, held until the app has drawn. It has to look finished by itself, since on a slow phone it's there for seconds. **The splash** is what the day's first open adds: the drop falls, splats on the ground and bounces up as Tinta (2 s). Never on a reload (the day starts at 4 am, as the streak's does), never in a browser tab, never off `/app/`.

- **The launch image, the first paint and the live frames match.** `theme-boot.js` decides before the first paint (`<html data-splash="hold" | "play" | "still">`, `lx.splash.day`). The first and last frames are static SVG in `app/index.html`, colored per theme by `css/splash.css`, written by the rig's `splash/app-frames.mjs` with `icons/startup.svg`. `scripts/build-icons.mjs` places the launch images in what's below each device's status bar (`src/startup-images.ts`), because with the black status bar that's where the page is.
- **iOS keeps the launch image it took when the app was added to the Home Screen.** A new one only reaches a phone when the app is added again.
- **iOS starts the page a screen tall** and takes the status bar off it about 90 ms later, so a first paint fitted to the page would jump. `theme-boot.js` keeps the height the page settled at (`lx.splash.heights`) and holds the first frame to it from the first paint.
- **Nothing waits for it, and it doesn't play on a busy main thread.** The app starts under it at once. `shell/main.js` marks `<html data-app-drawn>` when the first page is whole. On a later start the first frame then fades over 250 ms (`theme-boot.js`). Every fade into the app (`fadeAway`, in `theme-boot.js` and `splash-run.js`) sets the overlay's opacity a frame at a time on a clock that moves at most 34 ms a frame, so a busy main thread holds it where it is instead of skipping it, and the overlay goes on the frame after it's clear: on an iPhone, a CSS transition with a timer showed its first frame half way through, or none at all (a cut to the app). The overlay has its own layer from the first paint (`will-change: opacity`), and a press still ends it at once (`data-ended`'s opacity is `!important`). A splash the app's code never starts steps aside the same way, once the app has drawn after 6 s (never into a page half drawn: a slow start on a phone drew Home after 8 s), and at 12 s whatever the app has done. On the day's first, `js/character/splash-run.js` lets the drop fall by transform alone (`fallFrames`, which needs nothing of the main thread once begun), and from the hit draws live frames, on a clock that never runs ahead of them. If the app took over 5 s to draw there's no splash: it fades straight in.
- **A press or a key ends it at once,** and that press never reaches the app: the overlay stays, invisible, until the press is over. It registers with `motion.registerTicker`, so `finishAll` ends it. Until `splash-run.js` takes over (`data-run`), `theme-boot.js` keeps those promises itself, and one the app's code hasn't ended or started within 6 s steps aside once the app has drawn (12 s at most).
- **Animations Off** (or reduced motion under Match device): on the day's first open, its last frame, Tinta on its splat, for half a second from the first paint. `theme-boot.js` does that alone; no animation code loads. On a later start the first frame goes without a fade.
- `splash-check.mjs` holds all of this, and first-draw-check's splash stage holds its first paint.

## Art: word pictures and symbols

Our own drawings, never an icon font or an outside file. No outlines, a few colors, light from the top left, a hard shade on the far side.

- **Colors come from the art tokens** (`css/lx/art.css`, `--art-sky`, `--art-sky-deep` and so on). A drawing's every fill is `var(--art-sky,#58ADEB)`, the token with its designed color as the fallback. In color by default. `data-art="theme"`, on the root or on any part of a page, draws them from the theme's lightest to its darkest, so a monochrome or custom theme's art is its own. A look can also set any `--art-*` token, or `--art-light` and `--art-dark`.
- **The rules** (`lx/art-rules.js`, read by the loader and by `scripts/test-art.mjs`): plain shapes only, in those tokens. No scripts, style, text, fonts, images, `use` or URLs. A drawing is drawn inline, so these rules are what makes that safe.
- **Word pictures** (`public/pictures/<concept>.svg`, `manifest.json`; `study/pictures.js`): one file per meaning, the same in every language, with alt text and each language's words. A lesson or pack names only a concept id. `await loadPictures(ids)` says whether all are ready; `pictureNode(id, { alt })` is the part `picture`, its tile included, sized by what holds it. They're fetched when asked for and kept on the device in their own cache under names carrying their hashes, so they survive a deploy and a redraw replaces them. After changing one: `node scripts/stamp-pictures.mjs`.
- **Symbols** (`lx/symbols.js`): `symbol(name, { size, label })` returns an inline `<svg>`, its own copy with its own ids. They ship with the shell and draw at once. A moving part has a class; what moves it is the page's, finite and never blocking a press.
- **Drawn to hold on a bare page:** a symbol's silhouette is in mid-tones, and paper-colored parts sit on a colored body, so it reads on dark and light with no tile.

## Layout presets

Personal settings, each one an attribute on `<html>` (the first value is the default):

| Attribute | Values |
|---|---|
| `data-density` | `comfortable`, `compact`, `spacious` |
| `data-text` | `m`, `s`, `l`, `xl` |
| `data-literal` | `below`, `above`, `tap` (behind the card's "Dutch order" button), `off` |
| `data-card` | `filled`, `outlined`, `flat` |
| `data-reader` | `scroll`, `pages` (columns you swipe between) |
| `data-motion` | `system` (match device), `on`, `off`: Settings → Animations |
| `data-art` | `color`, `theme` (the drawings, the way forward and the tab you're on in the theme's own ink): Settings → Appearance → Drawings |

## Themes

Every look that changes anything is a **theme of the person's own**, kept with a name, and they pick between theirs and
the built-in ones in one place (Settings → Appearance → Theme). Switching never loses one.

- **The look in use** is a saved theme (`look.theme` is its id, `look.name` its name) or a built-in theme as it comes
  (`look.theme` null, no tokens, CSS or images; `base` says which). `theme.themeInUse()` says which, in words.
- **Every change to the look in use is written to its theme** (`writeThrough`, on every save), so switching away and
  back finds it exactly as it was.
- **Changing a built-in theme starts a new theme** of yours from it, named "Graphite, edited" (or the name you give it),
  and says so in a toast whose Undo goes back to the built-in theme and drops the new one. The built-in theme never
  changes. Your AI's changes follow the same rule on the server.
- **Switching** (`useTheme(id)`, a built-in id or one of yours) replaces the whole look through the safety net, keeps
  the look it leaves in Recent looks, and shows "Now using …" with Undo. No theme's content changes.
- **A theme's base** (`setBase`, "Starts from") is the built-in theme under its colors, CSS and images.
- **The library** lives in IndexedDB (store `themes`), mirrored in memory: each entry is `{ id, look, rev, synced,
  deleted, syncedDeleted, account, createdBy, createdAt, updatedAt }`, `look` being its content (`{ name, base, tokens,
  css, images }`) and the rest what `look-sync.js` needs. Other tabs hear of changes on a `BroadcastChannel`.
- **Duplicate, rename, delete:** `duplicateTheme(id)` ("Delft copy", not in use), `renameTheme(id, name)` (a name another
  theme of yours has gets a number), `deleteTheme(id)` (the theme in use switches to its base first; returns `undo`,
  and the account keeps a deleted theme 30 days). `resetLook()` clears the theme in use's tokens, CSS and images; it
  stays a theme of yours.
- **A look from before themes** (changes, but no theme) becomes one: on a device that has never synced, at once
  (`adoptOrphanLook`); otherwise the account's (migration `0003_themes.sql` made every account's look a theme) is
  adopted on the first sync.
- **Ids** are 16 lowercase letters and digits (`newThemeId`), made on the device or the server; names are made unique
  among yours (`uniqueName`, `editedName`, `copyName` in `look-rules.js`).

## The theme engine (`theme.js`)

- **Storage:** settings in `localStorage["lx.appearance.v1"]` (`{ version: 1, theme, presets, look: { theme, name,
  tokens, css, images } }`, where the top-level `theme` is the base). Images live in IndexedDB (`lexicommons-appearance`
  v3, store `blobs`), keyed by the SHA-256 of their bytes; `look.images[slot]` is `{ hash, type, size, name }`. Recent
  looks are in store `history`, your themes in `themes`. Images saved by v1 (store `images`, keyed by slot) move over on
  the first load. An image the look uses that isn't on the device yet (look-sync is fetching it) stays in the look and
  shows once it lands. If the browser won't save (private browsing), `isPersisted()` is false and changes last for the
  visit only. If an open tab from an older version holds the database, the page carries on without it after 2 s.
- **Applying:** the theme and presets become attributes. Token edits and custom CSS become two constructable
  stylesheets in `document.adoptedStyleSheets`, so the CSP needs no inline styles. Images become `blob:` URLs in
  `--image-<slot>`. Other open tabs follow along through the `storage` event.
- **No flash:** `theme-boot.js` applies the saved attributes, tokens and CSS synchronously in `<head>`, and `theme.js`
  takes over from it.
- **Big photos:** `setImage` scales anything over 4 MB or 2560 px a side down and re-encodes it (WebP, or JPEG where the
  browser can't write WebP); HEIC is converted where the browser can read it. GIF and SVG are kept as they are.
- **Recent looks:** before each change, the look it replaces is kept in IndexedDB (store `history`), the last 20 (and
  up to 64 MB of images between them). Small edits within a minute (colors, the theme, the name) share one. Every
  change's `onChange` event carries `undo`, the id to `restoreLook()`; a restore is kept too, so it can be undone.
- **The safety net:** a page registers `addUsabilityCheck(fn)` (fn returns null, or what's wrong). A whole-look change
  (CSS, an image, an import, a restore, a change from elsewhere) that fails it is undone at once, and the call throws
  a `ThemeError` ("That look hid the header, so it was undone"). The app checks that the header, the page, the tabs and
  the way into Settings still show and that the main text isn't the page's color (`shell/look-watch.js`); the CSS
  editor adds itself.
- **Safe mode:** a page opened with `?safe` (`/app/?safe`) keeps the look but doesn't apply it, so a broken one can be
  fixed. `SAFE_MODE` is true and `<html>` gets `data-safe-mode`.
- **API:** `initTheme()`, `getSettings()`, `currentLook()`, `themeInUse()`, `onChange(fn)`, `setPreset(name, value)`,
  `setTokens(map)`, `setToken(name, value)`, `meaningTokens(meaning, colour)`, `setCustomCss(text)` (returns what was
  removed), `setImage(slot, file)`, `prepareImage(file)`, `removeImage(slot)`, `getImageUrl(slot)`, `imageUrl(hash)`,
  `setLookName(name)`, `setBase(id)`, `resetLook()`, `getHistory()`, `restoreLook(id)`, `clearHistory()` (recent looks,
  your themes and images: deleting the account), `addUsabilityCheck(fn)`, `setSection(name)`, `currentSection()`;
  themes: `themes()`, `savedTheme(id)`, `useTheme(id)` (`setTheme` is the old name), `duplicateTheme(id)`,
  `renameTheme(id, name)`, `setThemeBase(id, base)`, `deleteTheme(id)`, `restoreDeletedTheme(id)`; files:
  `exportTheme(name)` (the look in use), `exportSavedTheme(id)`, `readThemeFile(file)`, `applyThemeFile(theme)` (a new
  theme, put in use); and for the sync `applyRemoteLook(look, label)`, `hasImage(hash)`, `getImageBlob(hash)`,
  `storeImage(hash, blob)`, `libraryEntries()`, `libraryEntry(id)`, `putLibraryEntry(entry)`, `removeLibraryEntry(id)`,
  `librarySynced()`, `adoptThemeId(id, name)`, `flushLibrary()`. Change kinds include `switch`, `library` (a theme added,
  renamed, deleted or brought back here) and `library-sync`; a change that started a theme carries `started`. Errors
  meant for people are `ThemeError`s.

## The look on the account, and your AI

The look in use and every theme of yours also live on the account (`src/looks.ts`, migrations `0002_looks.sql` and
`0003_themes.sql`), so the person's own AI can read and change them over MCP, and every device they use follows.
Presets (text size, density, cards, reader, animations) never leave the device.

- **Tables:** `looks` is the look in use (its JSON's `theme` says which saved theme, or null), `themes` every theme
  (`rev`, content, `created_by`, `source`, `deleted_at`), `theme_library` one revision for the whole library (the poll's
  second number). Every write of the look in use writes its theme in the same D1 batch; switching writes only the look,
  and lands only while the theme is still at the revision it was read at, so the look always matches its theme.
- **Revisions:** every change to the look in use, from a device or an AI, is one revision, and each theme has its own.
  Writes are compare-and-set, so two writers can't both win. The last 20 look revisions are kept (`look_history`, each
  saying which theme it was); restoring one puts that theme back as it was then, and in use.
- **Built-in themes never change on the server either:** a change on one (an AI's `update_look`, an app from before
  themes) starts a new theme first. An app from before themes sends its look without `theme`; it goes to the theme in
  use.
- **Images** are stored once each by hash (`look_images`, R2 `users/<id>/look/<hash>`), shared between themes, kept
  while the look, a kept revision or any theme (a deleted one too, while it's kept) uses them, up to 24 MB per account
  (the oldest kept revisions go first to make room). They're served only to their owner, with a `sandbox` CSP, so an
  SVG can never run as a page.
- **The device side** (`look-sync.js`): each theme syncs by its own revision. A change made here (an edit, a new theme,
  a rename, a delete) goes up on top of the revision this device last agreed with; if the theme moved on meanwhile,
  the two are merged field by field and token by token (`mergeLooks`; the device wins where both changed the same
  thing), and the merge goes up. Switching here is sent as a switch (`POST /api/look/use`), never as the theme's
  content, so an out-of-date copy can't overwrite a newer one; offline, it switches from the library and sends the
  switch when it's back (a theme changed and left offline goes up too). A change or switch from elsewhere is applied
  through the safety net, shown with an Undo toast, and reported back (`/api/look/applied`): applied, or undone and
  why. A device that has never synced takes the account's look (its own is kept in Recent looks) and sends up its
  themes; signed into another account, it forgets the first one's. It checks every 4 s while the page is visible
  (every 20 s after 2 idle minutes), at once on coming back into view, and never while hidden. An unchanged check is
  one `204`. It remembers the look and library revisions it agreed with, that look, and the account
  (`lx.look-sync.v1`).
- **App API (cookie session):** `GET /api/look[?since=<rev>&lib=<library rev>]` (204, or the look with `themeRev`,
  `libraryRev` and `account`), `POST /api/look/use { theme }`, `GET /api/themes`, `PUT /api/themes/<id> { baseRev, look,
  undelete? }` (answers `result`: `saved` with the new revisions, `conflict` with the theme as it is now, or
  `missing_images` to upload first), `POST /api/themes/<id>/delete`, `POST /api/themes/<id>/restore`, `PUT /api/look {
  baseRev, look }` (the whole look, for apps from before themes), `PUT|GET /api/look/images/<hash>`, `POST
  /api/look/applied`.
- **MCP tools** (`src/mcp.ts`): `get_theming_guide` (built from `parts.js`, `look-rules.js` and the deployed
  `tokens.css`: every part and state, every token's value under each theme, the rules, themes; `include_css` adds the
  app's stylesheets), `get_look` (names the theme in use), `update_look` (changes the theme in use, starting one on a
  built-in theme; tokens merge, `null` removes one; CSS replaces; base, name, reset, remove images; `expected_rev`),
  `check_look`, `request_look_image_upload` (a signed link; the image goes into its slot in the theme in use when it
  lands), `get_look_image`, `list_look_history`, `restore_look`, `list_themes`, `use_theme` (by id or name; no theme
  changes), `create_theme` (blank, a copy of the look in use, or of another theme; in use unless `use` is false), and
  the `restyle` prompt. The guide and prompt tell an AI to make a new look a new theme and to change only the theme
  it's asked about.
- **REST for scripts:** `GET /api/v1/look`, `PATCH /api/v1/look` (the same change as `update_look`), `GET
  /api/v1/themes`, `POST /api/v1/themes` (`create_theme`), `POST /api/v1/look/use` (`use_theme`), `POST
  /api/v1/look/images`.

## Theme files

```json
{
  "format": "lexicommons-theme",
  "version": 1,
  "surface": 1,
  "name": "My theme",
  "base": "graphite",
  "tokens": { "--m-right": "#7fc8ff" },
  "css": "[data-part=\"study-card\"] { border-radius: 32px; }",
  "images": { "background": "data:image/webp;base64,…" }
}
```

A theme file carries one theme: the unit for sharing one (Export on a theme's page). It never carries anyone's presets
(text size and density are personal). On import, the file is checked and shown first, with every note about what was
left out; it's added as a new theme of yours and put in use (none of your other themes change), and the look it
replaces goes to Recent looks.

## Safety

A theme can make the app ugly, never harmful.

- **CSS can't run code.** The risk is reaching another server: a tracking image, or attribute selectors that leak
  what you type one request at a time.
- **`css-safety.js` makes CSS honest.** Escapes are decoded once, the way CSS reads them, so nothing can be spelled
  around the check. Comments go. Then it removes `url()` unless it's a `data:` image or font, `image-set()`, `src()`,
  `expression()`, `@import`, `-moz-binding`, `behavior` and `javascript:`.
- **The CSP is the backstop:** `img-src 'self' data: blob:`, `font-src 'self' data:`, `style-src 'self'`.
- **Tokens stay one value:** a token can't hold `;`, `{` or `}` outside quotes, an open quote, a line break or a
  trailing backslash (`look-rules.js` `breaksOut`), so it can't reach past its own declaration.
- **Limits:** CSS up to 100 KB, 300 tokens with values up to 500 characters, 12 images of up to 4 MB each (PNG, JPEG,
  WebP, GIF, AVIF or SVG), theme files up to 24 MB, 24 MB of look images per account on the server.
- **The server runs the same checks** (`look-rules.js` and `css-safety.js` are imported by the Worker), so a look your
  AI sends is checked before it's saved, and the tool's answer lists what was removed.
- Shared themes will also be moderated like any upload.

## The literal line and study cards

- **Both orders:** a literal line holds its words in Dutch order with the moved ones marked, and switches to English
  order and back (`line.lxSetOrder("english" | "dutch")`). Each word slides to its new place (`motion.reorder`).
  Moved words arc off the line, and the highlighter goes on in Dutch order and off in English order (`data-order`).
- **The toggle:** `ui.orderSwitch(line)` (part `order-toggle`) is one small NL | EN switch: pressed anywhere, it flips,
  so the same spot flips it back; `aria-pressed` is true in English order. Only its thumb moves.
- **One smooth move:** a reorder (and any arc, like Arrange's tiles flying to the right order) is a single curve eased
  once from end to end (`curveFrames` in `motion.js`), never keyframe segments eased separately, which stall at every
  point.
- **Sentences without an English order:** a sentence with no English order (`english: null`) shows Dutch order only.
- **Card options:** `ui.studyCard(item, { literal: { show, start, flip, position, natural } })` follows Settings →
  Study → Study cards. `start` is one of:
  - `slide`: English order, then into Dutch;
  - `dutch`;
  - `english`.

## Games

- **Arrange** (`ui.arrange(tiles, answer, { moved, lang })`): tap to place and tap to send back, or drag a tile to
  where it goes, from the bank or along your order (a copy follows the finger: tile states `lifted`, `dragging`,
  `drop`). A tile not in `answer` is a stray. `lang: "en"` puts English chunks into Dutch order.
- **Where does it go** (`ui.placeWord(words, word, index)`, parts `place`, `place-word`, `place-sentence`,
  `place-gap`): a gap between every two words; after a miss the right gap shows as `answer`.
- **Typing a sentence** (`ui.writeSentence(placeholder, { onCheck })`): a field and Check; the session marks it word by
  word with the speech matcher and shows `ui.saidLine`.

## The library (Read)

The Read tab is a library, covers first (`public/js/read/library.js`, `shelf.js`; builders in `lx/ui.js`):
- **`continue-card`** (`ui.continueCard`): the book you're reading, its cover, where you are ("Page 4 of 10" in a
  picture book, a chapter, or how far), how much you'd follow, and Continue at the card's foot, in reach.
- **`book-cover`** (`ui.bookCover`), always one: variant `picture` (its own first picture), `art` (art your AI made for
  it: an SVG kept with the text, shown only as an image, never inline), or `type`: a designed cover, a color picked
  from the book's id (`seed`) out of seven after Okabe and Ito's colorblind-safe set (`.lx-cover-hue-0…6`, each with
  an ink at 5:1 or more), its title large in a book face, a short rule, its author small.
- **`book-tile`** (`ui.bookTile`): a cover, the title, a line, and **`book-progress`** (`--progress`, 0 to 1) once
  started. **`book-list`** (`ui.bookList`) holds them: variant `grid` (your library) or `row` (a shelf that scrolls
  sideways to the screen's edges).
- **`section-head`** (`ui.sectionHead`): a section's title with **`section-link`** ("See all ›", "All 14") or an info
  button on the right; `section-title` variant `sub` is the smaller heading of a curated row.
- **`ask-ai`** (`ui.askAi`) with **`ask-prompt`** rows: a way in through your AI wherever you add your own, prompts to
  copy (`ui.copyButton`) and a note naming the prompt for Claude Code. The prompts name no tool, so a renamed tool
  never breaks them.
- **`ui.sheet`** and **`ui.sheetLayer`**: the app's drawer, the same everywhere (Explore's sheets, Read's Add a book,
  Ask your AI, the reader's drawers). Its numbers are vaul's; `scripts/sheet-check.mjs` holds each of these with real
  touch input.
  - **Over the page:** `ui.sheetLayer` puts it over everything, the tabs, a session and the reader included. The page
    shows through a translucent **`sheet-scrim`**, and it can't be pressed (`inert`) or scrolled (`data-scroll-lock`)
    while the sheet is open.
  - **Follows the finger:** the handle drags it either way; pulled up, it gives less and less.
  - **Content first:** its content scrolls, and only it (`overscroll-behavior: none`). A pull down at the content's
    top, not within 100 ms of a scroll, takes the sheet. The sheet decides at the first move, since iOS never hands a
    scroll back.
  - **Letting go:**
    - past a quarter of its height, or a flick faster than 0.4 px/ms (and over 24 px), it slides away from where the
      finger left it. The speed is the finger's over its last 100 ms of movement, timed by the touch events' own
      `timeStamp`s, so a busy phone that runs its handlers late still reads a flick;
    - short of that, it springs back;
    - the shade follows the sheet throughout.
  - **The slide:** in, out and back take `--dur-sheet` (500 ms) on `--ease-sheet` (cubic-bezier(0.32, 0.72, 0, 1)),
    through `motion.slide`, the one thing that moves itself rather than by a ghost.
    - A session's cover going back down on Done leaves from rest on `--ease-sheet-away` (cubic-bezier(0.36, 0, 0.1, 1)),
      with the same long, soft end: on `--ease-sheet` a whole screen's cover went 98 px in its first frame (7 Nov).
    - The page is back the moment a close begins, and a closing sheet takes no presses.
    - Any press finishes a slide at once.
  - **Closing:** a press on the shade, Escape, a tap on the handle or the page changing closes it too.
  - **One at a time** (Apple's HIG: "Display only one sheet at a time"): a sheet coming up closes the one that's up, at
    once, through its owner's own close (its `onClose`), so whoever holds it knows it's gone: the reader's Word sheet
    goes when Ask anything comes up from it. A layer clears the one that's up before it holds the page (inert, its
    scroll), so that close can't undo it. sheet-check holds it. So a choice made inside a sheet (a language, a topic, a
    book for a form) is shown in that same sheet, a list in the form's place with its way back (`ui.backButton`), never a sheet of its own:
    one coming up would close the form and lose what was typed (lex-community's request sheet, 27 Oct).
  - **Safe areas and the keyboard:** it stays clear of the status bar and the home indicator. The keyboard rides over
    it: it keeps its full height and its place, its content makes room at its foot (`--lx-kb`, from `visualViewport`),
    and a field in it is scrolled clear of the keys (`ui.reveal` measures against what the keys leave). On a page,
    typing with the keyboard open, the app takes the screen above the keys and the tab bar steps aside
    (`data-keyboard` on `<html>`, `shell/main.js` `followKeyboard`). `keyboard-check.mjs` holds both.
- **Touch targets:** every control answers a tap over 44 × 44 px at least: Apple's minimum hit region (the HIG:
  "a button needs a hit region of at least 44x44 pt"); Material asks 48 dp. A control drawn smaller, to sit in the
  header, a sentence or a row of chips, keeps its look and reaches past its edges with an invisible `::before`
  (components.css: `inset: min(0px, calc((100% - 44px) / 2))`, as far as it's short on each axis and no further; under
  `:where`, so it never overrides a part's own position). Parts that use their `::before` for something else
  (place-gap's caret) reach with `::after`. A scroller clips what reaches past it, so a row of links that scrolls
  (subnav) keeps the room inside it. Controls sit 8 px apart, so reaches don't cross. Text is 12 px at least. Words and
  links inside a sentence are exempt (a line of text can't be 44 px tall: WCAG 2.5.8's inline exception).
  `scripts/component-check.mjs` measures every control on /design and on every tab and Settings page.
- **Every control shows it's pressed** (`:active`; Apple's HIG: "Always include a press state for a custom button";
  Material's pressed state layer): one on a plain surface takes `--fill-active`; one already filled (a selected
  segment, a switch, a playing speak button, a solid or meaning-colored button) or a picture (a theme swatch, a book's
  cover) darkens, `filter: brightness(0.88)`; a link in a line takes `--ink-1`. The press goes on the control, never
  on a card that holds controls (`:active` reaches every ancestor of what's pressed, so the whole card would light up
  under its Start button). component-check forces `:active` on every control on /design and each page and fails on
  any that looks the same; fields, sliders, links inside running text, disabled controls and a game's answered pieces
  are exempt.
- **Quiet text by its ink, never by opacity:** a state that makes text quieter (a strength you don't train, a canceled
  request, a line on its way, a word you missed) takes the next ink down (`--ink-1` → `--ink-2` → `--ink-3`, a bar's
  fill `--ink-4`) and keeps any mark that carries its meaning (a strike-through, a dashed edge). Opacity takes contrast
  from whatever is under the text, which a theme's image or color changes. It's left for motion, a disabled or inactive
  control (WCAG exempts them: an answered choice, the tile being dragged) and pictures (a drawn cover).
  component-check fails on text whose opacity, multiplied up its ancestors, is under 1.
- **A session's step fits the screen:** nothing in a step scrolls, on a phone as small as 375 × 667, for the longest
  sentence of every starter. `study/session.js` `fit()` runs when a step's bar is set, after each change to Arrange's
  order (`container.lxOnChange`), on a resize, and as each face arrives (`document.fonts`' `loadingdone`: on a slow
  start the instruction's Onest can land after the step was fitted in Instrument Sans, a line shorter), and
  tightens a level at a time (`data-fit` on the session):
  1. the bar's actions closer (its quiet actions are laid out by measuring at every level, below);
  2. the step's spacing, its instruction and its English tighter;
  3. tiles 40 px;
  4. tiles 36 px, a tile's word 15 px (a set with a reading anywhere keeps its 24 px, so readings stay 12), the header
     and Check tighter;
  5. once answered: the instruction left out (the bar says how it went), the explanation in three lines with More;
  6. once answered: the right order under yours left out (the bar shows the right sentence and plays it);
  7. once answered, last: your order's readings left out (the heard line in the bar shows every one, in order); its
     words keep their 24 px.
  An order step (Put it in order, Listening's order, What does it say?) still too tall at level 4, before it's answered, takes its own last squeeze
  (`data-order-fit`): its instruction in short words on one line ("Put it in order", "Order the English", "Order what you heard"), Hint
  shown as "Hint" so the quiet actions share a row (its name stays whole), its tiles' words a step smaller (20 px with a reading, the
  reading 10: the one place a reading goes under 12; 14 px without). Still too tall with nothing placed, it isn't asked this way at all:
  session.js asks that sentence the next way (the planner's instead, every game of tiles set aside, so the next way has none: Type it, Which
  is right?, Fill; as Can't listen now does), before a frame
  shows it, so nothing scrolls and nothing moves under a finger; its evidence is that game's. A stable bank, never one whose tiles move up
  as others are placed (a fast finger would tap the wrong word). On a 320 × 568 phone the longest sentences go to Which is right? this way;
  on 375 and 390 every pack's longest is still played in order. (At first only the order games were set aside, and path-ja's longest went to
  What does it say?, 155 px too tall itself: 9 Nov 2026.)
  An answered step its result still leaves no room at the last level (a reworded sentence's wrong answer on a 320 × 568
  phone) first folds away what the result says again (`data-fold`: Fill's choices, the typed line, the listening
  controls; study-screens.css, in the page layer over shell.css's own rules for them), then holds the result's body to the
  room left (`data-capped`, `--answer-cap`, 96 px at least): it scrolls, fading out at its foot so no line is cut
  mid-letter, and Continue stays under it, always in reach. No part of the step is ever left under the result. Held so, the
  body puts the right sentence first (`answerFirst`): the title, the sentence and its English, then the explanation in the
  title's column, cut to its lines with More under it, then the rest; it's never held shorter than the sentence whole over
  its fade (and its English with it where the English is the answer), so only what explains the answer scrolls. At that
  level a choice of sentences, done with, is a step tighter (15 px, less padding). Which is right? in place of path-ja's
  and path-nl's longest at 320 × 568, wrong or I don't know: the sentence whole, the step not scrolling (9 Nov 2026).
  A step is one column the screen's width (`grid-template-columns: minmax(0, 1fr)`), so nothing in it can widen it.
  The bar's quiet actions (Hint, Words, I don't know, Can't speak now, Can't listen now) sit on one line wherever they
  fit, else wrap with their lines alike (`layActions`, components.css `data-lay`, at every fit level): the first of
  loose (as drawn), close, tight and bare (no icons) that takes one line with every word showing, else wrapped close, the
  row narrowed to the least width that keeps its lines (four go 2 + 2, never 3 + 1). "Hint: Dutch order", Words and I
  don't know are whole on one line at every phone width down to 320, and Listening's Words, I don't know and Can't listen
  now from 375 up with their icons; only a Hint wider than the whole row gives way, its words ending in an ellipsis
  ("Hint: Chinese (Trad…"), and the others always show whole. Each wears its own icon, the same everywhere: the Hint a bulb,
  Words a book, I don't know skip, Can't speak now `mic-off`, Can't listen now `speaker-off` (never the cross: it means
  wrong). Tiles keep their 44 px reach at
  every level. A new step starts loose; within one it only tightens. Arrange's order
  holds the tray's height from the start (`container.lxReserve`), so placing tiles moves nothing.
- **A concept tag wraps within its place** (`ui.conceptTag`): one naming a word with its gloss can be long (a word's
  forms and phrases), so its words are one box beside the icon that wraps as lines of text, never past its column (the
  session summary's What moved: tag, tally and strength bars each in their own column). A badge stays one line.
  component-check's summary stage plays Hebrew's longest gloss and the longest of all the starters at 375 × 667.
- **A word named anywhere follows the study rule:** in a language that shows readings, a word in a chip, a list's row
  or a heading comes with its reading while it's new (kana or pinyin over it; Arabic's, Hebrew's, Persian's and Urdu's
  vowel marks) and as written once you know it well (its read strength Strong: `progress.js` `readingHides`, the one rule for
  every reading, never on a first right answer), as a study card's word does. `content.js` `shownName(unit)` gives
  either; `ui.conceptTag` takes it (alone, or as pieces with English beside it: `[word, " · gloss"]`) and
  `ui.wordLabel(name)` draws it anywhere else, in an isolate of its own language. A word with its reading over it is
  24px there, so the reading is 12px. A sentence drawn from its words (`ui.sentenceRow({ words })`, each as a card's)
  does the same; a right-to-left sentence's line runs right to left. component-check's summary stage holds the rule
  on Hebrew and Japanese, a new word and one you know.
- **Moving between a tab's pages** (`shell/page-slide.js`; the owner's pick, 27 Oct, "Slide, iPhone-style"): going deeper,
  the arriving page slides in from the right over the leaving one, which moves a third of the way left under a 0.1
  shade; back is the reverse; 350 ms on the sheet's curve (`--dur-page`, `--ease-sheet`), measured against Ionic's iOS
  transition (540 ms, −33%, a 0.1 cover) and wegoplace's (220 ms, −30%).
  - **Pictures move, the page doesn't:** a picture is a copy of the page element in a closed shadow root, with the
    app's own rules adopted and the app's frame around it (so every rule for the page holds, and nothing that looks for
    a part in the document ever finds the copy), fixed on the page's box; the arriving page is in place, pressable and unseen (`data-motion-hidden`) until its picture lands,
    and any press finishes the move. Pictures have no background, so a theme's backdrop shows through as it does behind
    the page: the page underneath is clipped where the other one's edge is, on the same curve, so they never overlap.
  - **Back is back:** each history entry carries its index, so a new entry is a push and an earlier one a pop. The
    header's Back, and a tap on the active tab at the top, go back in the app's history to the page they name when it's
    there (scrolled as you left it); a page opened cold (a link, a restart) puts its parent in its place instead, so
    back never leaves the app.
  - **Swipe back** (in the installed app; a browser's tab has its own): from within 50 px of the left edge, the page
    follows the finger, the page underneath coming from a third left; past half, or flicked at 0.2 px/ms, it goes, the
    rest of the way at the finger's speed (350 ms at most); short of that it springs back. The page moves itself here,
    as a sheet does (motion.js rule 2's exception).
  - Tab switches don't slide. Animations off: nothing moves, and back still restores the scroll. page-check holds it.
- **`skeleton`** (`ui.skeleton({ height })`): a place held for what's on its way. A page's first draw never shows a
  guess that changes, or text that later moves:
  - the shell holds a page built now unseen until what it shows from this device is in (the view's `ready`, 400 ms at
    most), then shows it whole;
  - a slot whose data comes later holds its place: `heldPlace(name)` (`lx/shapes.js`) gives a skeleton as tall as the
    slot was when last drawn, and `keepHeight(name, node)` keeps that height after each draw. A slot that was empty
    holds nothing.
  The skeleton pulses slowly (`--dur-640` × 2), and is still when animations are off. It's `aria-hidden`: the page says
  what's loading, if anything. `scripts/first-draw-check.mjs` holds the first draws.

## Explore

Explore finds packs, in the language you're learning or any other (`public/js/explore/explore.js`; builders in
`lx/ui.js`):
- **`language-flag`** (`ui.languageFlag(lang, { size, label, lazy })`): a language's flag, beside its name or code. Alone
  only on a book tile's corner (`ui.bookTile`'s `flag`, the language the book teaches), where `label` names it.
  The flags are flag-icons' SVGs (MIT, `public/flags/LICENSE`), shown as images; `public/js/lang/flags.js` says which
  country's flag marks each language (a new language gets one by a line there). A language without one shows its name
  alone. Every flag is drawn in the frame it's put on the page (loaded at once, decoded with the paint); only a long
  list's rows past its first screenful (`lazy`, from `ui.FLAG_ROWS_SHOWN` on, counted by the rows shown) wait to come
  near. Once a flag has loaded, the page keeps a decoded copy and every later one draws from it (its `srcset`; `src`
  stays the flag's address): in WebKit a new image of a flag already on the screen otherwise went through the service
  worker and showed blank for a few frames. A page with a row that opens a long list warms that list's first rows
  (`ui.warmFlags`), so its sheet draws them at once the first time too.
- **`search-field`** (`ui.searchField`): a field with its icon; Enter (or the keyboard's search key) searches.
- **`language-row`** with **`language-choice`**s (`ui.languageRow`): the one you're learning first, the one shown
  (`selected`), those with the most packs; All languages opens the rest in a sheet with a search, so it holds any
  number.
- **`featured-pack`** (`ui.featuredPack`): one pack to start with, its cover (**`pack-cover`**: its drawing, or a designed one), why and its facts. Its sentences are on its page.
- **`sentence-row`** (`ui.sentenceRow`): a pack's sentence, its literal line and its English, with its own "…" when it
  has actions.
- **`topic-grid`** / **`topic-tile`** (`ui.topicGrid`), **`pack-shelf`** / **`pack-card`** (`ui.packShelf`,
  `ui.packCard`): topics as tiles, packs in rows that scroll sideways, each pack shown once on a page.
- **`pinned-actions`** (`ui.pinnedActions`): a page's main action pinned low, in reach, over the page as it scrolls
  (Add pack, Like and More on a pack's page).

## What you know (Knowledge)

The Knowledge page (`public/js/know/page.js`; builders in `know/ui.js`, rules in `css/lx/know.css`) shows what you know,
and how it changes, at a glance; everything else opens on a page of its own. All of it is sums over the scheduler
(`know/summary.js`), never stored:
- **`know-headline`** (`knowHeadline`): how much of everyday language what you know covers, as **`share-ring`**
  (`shareRing`, its arc the share itself, never stretched) and a sentence ("about 67 in every 1,000 words"), then what you
  know by kind, a note on your word bank, and the frequency list's **`credit`**, always beside the number.
- **`growth-chart`** (`growthChart`): words you'd have recalled at the end of each of the last 28 days, a
  **`growth-day`** bar each (`--fill`, today `data-state="today"`), with its scale and the first day and Today under it
  (`summary.js growth`, the scheduler replayed on the evidence before each moment).
- **`skill-tiles`** (`skillTiles`): read, hear and say as three numbers, each **`skill-tile`** opening the table by kind
  (`skill-table`, `#know/skills`); a strength you don't train is `off`.
- **`know-highlight`** (`knowHighlight`): one thing worth knowing now in a sentence, what's in it as links and a way to
  act: what's slipping (`data-meaning="slipping"`, Review them), what you can read but can't say yet, what got stronger
  today (`right`). The icon's shape says which, as well as its color.
- **`know-link-card`** (`knowLinkCard`): a card that opens a page of its own, with a glimpse of it inside: the grammar map's
  first patterns (`grammarMap` without `href`), the first 200 common words (`wordStrip` without `linkHref`), the next 7
  days, the last 12 weeks. Nothing in a glimpse is pressable; the page has the real thing.

## Home

Home (route `#today`, the address from before it was called Home; `public/js/know/today.js`; builders in `know/ui.js`, rules in `css/lx/know.css`): the date, Translate up front,
one next step (`next-step`), then your progress and where to keep going.
- **Translate** (`translate/page.js`, its route `#today/translate`; builders in `know/ui.js`): the first key typed in
  Home's box turns the page into Translate's own, in that frame: Home's other parts, the tabs and the header's language
  and settings go away, and it's the same field, so the keyboard never drops. Back, the phone's back, a swipe and
  clearing it all bring Home back as it was.
  - **`translate-field`** (`translateField`): what you type. On the page it fills the top of the screen, from under the header to the bite (edge `hinge`) holding the swap, and only its foot
    moves (up with the keys); long text scrolls inside it. **`translate-clear`** once there's text, a small speaker when it's in the language you're learning, its flag and language opening the picker.
  - **The bar** (`translateBar`, on the keys when they're up): two flags with the tab bar's bubble on what you're typing, always one; one press on the other switches, a press on the one you're on opens **`language-picker`** (`translate/picker.js`), and the microphone at its end.
  - **`translate-result`** state `best` (`translateBest`): the best guess, large, whichever side is the answer: a whole
    sentence (variant `sentence`), a word (`word`), or the word-by-word line (`line`), with what wasn't found marked. What's answering ("From your packs", "Word by word") sits on the language's own line, so nothing moves for it.
  - **`translate-more`** (`translateWide`): the one wide button under the answer: In your packs and how many, or Find a pack. Its sheet has the sentences, then the other words; **`translate-pack`** (`translatePack`) is a pack to add. `translateStatus` is the quiet line over it, only when it matters.
  - **`translate-guesses`** (`translateGuesses`): next best guesses behind one tap, each a `translate-result`. No page uses it now.
  - **`translate-word`** (`translateWord`): one of the main words, its meaning and the `sentence-row`s of your packs that use
    it, the ones you've studied first and saying so.
  - **`looking-up`** (`ui.lookingUp`): Tinta at work and what it's doing, shown only once a wait has lasted 150 ms with nothing to show. Sources are credited at the foot of the sheet. When nothing's found it says so quietly ("Not in your packs", "Not found yet" while it's still looking). It works with
    no AI connected and never mentions one.
- **`stat-tiles`** / **`stat-tile`** (`statTiles`): numbers at a glance (words you'd recall now, things done this week),
  each opening what's behind it; then the words over time as a `know-link-card` and the week as `week-strip`.
- `know-card` and `skill-bars` (Home's earlier glance) are on no page now; they stay in the system.

## The AI tab

The AI tab (`public/js/ai/tab.js`, `#ai`; the requests are `ai/client.js`'s): your AI and the requests you leave it.
Lexicommons runs no AI of its own; yours picks the requests up when it checks in.
- **`ai-card`** (`ui.aiStatus`, state `on` · `off`): who checked in last and when, or that none is connected yet, with
  Connect.
- **`request-kinds`** / **`request-kind`** (`ui.requestKinds`): what you can ask for, each kind opening its own page
  (`#ai/new/<kind>`) with Send to your AI pinned low (`pinned-actions`).
- **`request-row`** (`ui.requestRow`, states `waiting` · `working` · `done` · `failed` · `canceled`): a request and where
  it is, an icon and words for each state; Cancel while it waits; a question's answer on its own page
  (`#ai/request/<id>`), the language's words in `lang` spans, put in as text.
- A question to send at once, pinned low. Practice with your AI keeps its pages (`#practice/…`), under this tab.

### Asking about something from where you are

A "…" by a sentence, a word or a pattern (`public/js/ai/ask.js`, `askMenu`) opens a short menu. It's on Study's
result after an answer, a word's meaning in the reader, a concept's page, and Translate's sentences.
- **`menu`** / **`menu-item`** (`ui.menu`; `ui.moreMenu` makes the "…" that opens one): an icon, what it does and a
  line under it. It opens over everything (`.lx-menu-layer`), by its "…" or below a small popover the "…" sits in.
  A press outside, Escape, Tab, a scroll or a resize closes it. The arrow keys, Home and End move between its items,
  and while it's open no key reaches the screen under it.
- The items:
  - **Explain this** sends your AI a question at once (`createRequest`, kind `ask`, with `about`: the sentence, word,
    pattern, game, your answer or book it was asked from).
  - **Ask your AI about this…** opens a sheet to write your own question. The sheet shows what it's about
    (**`ask-about`**, `ui.askAbout`) and says what goes along with it.
  - **Copy the question** copies it as text for any AI (`describeAsk`).
- **`ask-status`** (`ui.askStatus`, meaning `right` · `wrong` · none): the line by the "…" that says what happened.
  A sent question shows Undo while your AI hasn't taken it; the line also says when a question was copied or
  canceled, or why it couldn't go.
- A part `requests.js` refuses (an id in a form it doesn't take, text past its limit) is cut or left out
  (`keptAbout`), never the question.

## Study's page

Study (`public/js/shell/study.js`, builders in `study/doors.js`): two doors (`study-door`: Practice, and a new lesson on a ticket; only the first lesson while nothing's been taught), where you are (`path-strip`), and rows: Choose the games, More ways to study. A session's end: `session-tally` on its receipt. After a question: `concept-row` and `concept-chip` under the result, opening `concept-sheet` over it (`study/after-answer.js`). A lesson's questions: `picture-choices` and `picture-choice` (Which one is it?: up to 4 drawings with their words, or their words; right and wrong are the card's edge and mark, since a drawing's colors are fixed), `see-word`, `translate-line`, and `step-tag` (New word, Once more).
(`switch` rows, Manage for the rest), with Find packs (Explore, in the language you're learning) and Ask your AI (a new
pack), then the ways to study: the reviews and the cards as rows, every game as a **`way-tile`** in **`way-tiles`**
(`ui.wayTiles`), in sections by how it's answered (Tapping, Typing, Speaking: plan.js `GAME_MODES` and `modeOf`, grouped by
`study/game-modes.js`), each a `sectionHead(…, { sub: true })` over its own grid; Choose the games has the same sections in the same
order, and a game that can't play here stays in its section, quieter, saying why (a press on Study, a short line in the drawer); and a
session on one thing. The page draws again when a pack is turned on or off.

## Listening and speaking

- **Speak button** (`ui.speakButton(speak, { label, onWord, text })`, part `speak-button`, state `playing`): `speak({
  onWord })` starts a sound and returns `{ stop(), done }` (`voice.speakItem` / `voice.speakWord`). Pressing again
  stops it; it never disables. While playing it turns solid with a ring breathing out (a pseudo-element: the button
  never moves). `button.lxPlay()` plays from code, for what plays by itself.
- **A card about one word:** `target-word` with `data-state="target"` (boxed, never tint alone) and `word-meaning` on reveal: the word as shown, its dictionary form when that's different, its meaning ("ben (zijn): to be; his, its"). `ui.wordPopover(host, anchor, ui.wordMeaning(...))` shows that by a tapped word: it takes no presses, and any press closes it and still does what it presses.
- **Words light up as they're spoken:** `data-speaking` on a `target-word` (a study card's `audio` option) or a
  `spoken-word` (`ui.spokenLine(words, speak)`, the sentence under every answer). Recorded voices always report it;
  device voices where the browser does.
- **Voices** (`study/voice.js`): a pack's recorded clips (its audio manifest, with each word's start and end) or the
  device's Dutch voices (`speechSynthesis`). A pack's recorded voices belong to the pack, so Settings never lists them:
  its sentences take turns between them (by sentence and day, `recordedVoiceFor`), unless the pack pins one
  (`listening.pins`, set from a pack's page). Settings → Study → Voices holds recordings on/off, the device voice, the
  speed and what plays by itself. One sound at a time; the first press anywhere unlocks sound on iPhone.
- **Choices in a list:** `ui.radioRow({ title, sub, name, value, checked, onchange, trailing })`, part `radio`.
- **Mic button** (`ui.micButton`, part `mic-button`): states `asking · loading · listening · hearing · thinking`
  (`button.lxState`), and a ring that follows loudness (`button.lxLevel(0..1)`, the `--mic-level` property). Listening
  isn't a meaning, so it uses no meaning color.
- **What you said** (`ui.saidLine(words)`, parts `said-line` / `said-word`): each word `right · close · order · wrong ·
  missing`, each with its own line (solid, dotted, highlighter, wavy, struck through) as well as its color.

## Practice with your AI

The live room with your own AI (`docs/practice.md`) uses a study session's frame (`session`, `session-bar`, `activity`,
`answer-bar`, so a look's session background shows there) with its own parts, the "Practice" group in `parts.js`:
builders in `public/js/practice/ui.js`, styles in `public/css/lx/practice.css` (in `lx.components`), every state on
`/design` (`public/js/design-practice.js`).
- `chat`, and in it `chat-line` (variant `ai`: your AI's Dutch, a tap opening its literal line and English; `you`: yours,
  states `sending · sent · failed · graded`; `task`: a sentence to put into Dutch), `chat-note` (its English),
  `chat-event` (joined, ended), `chat-typing` (it's working on a reply).
- Your line's marks: `chat-said` holds what you said; `chat-mark` is a stretch your AI marked (wavy, in the wrong color)
  and `chat-fix` what it should be (after an arrow, in the right color). `correction` is the grade under your line:
  `data-meaning` right, wrong or hint, the better version with a speak button, a note, and concept tags (avoided ones
  have no meaning color, and say "avoided").
- `practice-scene` (a role-play's scene), `practice-card` (a game your AI dealt, built from the app's own games),
  `composer` (`data-answer`: `both · speak · type`), `ai-status` (`absent · here · thinking · slow · away · ended ·
  offline · logging`), `ai-wait` (what to tell your AI, with copy buttons).
- The room uses the session frame (below), its composer in the `answer-bar`. Buttons and the microphone on a line sit
  on its first line of text; opening a line's meaning scrolls the whole line into view, and the conversation keeps
  room under its last message.

## The session frame

The answer bar slides: a result comes up from the screen's edge as one panel over what's there, and goes back down on the next step, both on `--dur-320`, every game through `setBar`
(`study/session.js`). Its contents are in their place and pressable from the first frame, and a press finishes the move; with Animations off it's simply there. The step stays still while the
bar can lie over its empty space, and makes room on the bar's curve only when it would cover something. A typing step keeps its field under what it's about, clear of where the keys land.

Every screen over the whole window (a study session, the practice room) is a `session`: the `session-bar` on top, the
`activity` scrolling between, the `answer-bar` at the foot. The bar and the answer bar are solid bands from edge to edge
(the bar on `--canvas`, taking the status bar's strip, with a hairline under it; the answer bar on `--chrome`, taking
the home indicator's strip, carrying the result's color after an answer), so a look's background shows only behind
the activity.

## Settings pages

Settings is a menu of pages built from these:
- `ui.pageTitle`;
- `ui.group` (a `group-label`, a list, a `group-note`);
- rows: `ui.listRow` (a link, button or value), `ui.switchRow` (the whole row toggles it), `ui.switchLinkRow` (its text
  opens a page and a switch beside it, never inside it, turns the thing on or off: part `switch-link-row`, each pack in
  Settings → Study → Packs) and `ui.choiceRow` (options under the title, stacked when they're long);
- `ui.themeSwatch` (a built-in theme, or one of yours with `look` and `imageUrl`: variant `yours`);
- `ui.avatar`.

A page inside Settings has its way back in its header in place of a title (`ui.backButton({ part: "app-back" })`), and its large
`page-title` in the page.

**The way back, everywhere** (`ui.backButton({ label | aria, href | onclick, part? })`): one floating pill of the tab bar's glass
(`--bar-glass`, `--bar-filter`, `--bar-edge`, `--bar-rim`, `--bar-ink`), a chevron and where it goes back to, or the chevron
alone, round. The header's, a sheet's (Reading settings, Contents), the reader's, a picker's inside a sheet: there's no other.
`scripts/test-back-buttons.mjs` fails on any other way back.

**The header floats** (shell.css): no band of its own. The page runs to the top of the screen under it, starting below it
(`--header-room`), and fades as it scrolls away under it; the same fade lies under the floating tab bar. Both fade to
`--page-ground`, the canvas unless a page paints a color of its own: such a page sets `--page-ground` on `:root` while it's up
(`:root:has(<the page>)`), so its ground runs to the top unbroken. Translate's header keeps its band. Rows highlight as a whole and rounded, reaching past the text on both sides.

Settings → Appearance holds the theme (the built-in swatches, then yours, each drawn in its own colors and background;
a press switches), the presets, the theme in use ("Edit Delft", or "Make it yours" on a built-in theme), and your
themes, each its own page (`#settings/appearance/…`, the editors in `public/js/lx/appearance.js`):
- **Colors** (`colours`): a sample of the app kept in view, readability warnings, every color token in groups (a chip
  that opens the picker, keeping the theme's transparency; the value as text, any CSS color; a reset), then fonts and
  corners as plain choices.
- **Custom CSS** (`css`): the editor (Tab indents, Escape then Tab leaves, Cmd/Ctrl+Enter applies), what the check
  removed, every part to style (filterable; a press adds its selector), and any token by name.
- **Images** (`images`): the background (fit, dim, blur, position), each section's own background (a page per
  section, `images/<section>`), the logo, and your own slots for CSS.
- **Your themes** (`themes`): a row for each (who made it, when, what it changes, which is in use), importing a theme
  file as a new theme, and the last 20 looks to go back to. `#settings/appearance/share` opens it.
- **One of your themes** (`themes/<id>`): use it, its name, the built-in theme it starts from, its editors (switching
  to it first), duplicate, export a theme file, clear its colors, CSS and images, delete.
- **Ask your AI** (`ai`): what to ask, the `restyle` prompt, and whether this device is in step with the account.

The `/design` page's panel uses the same editors (`buildAppearance`).

## The app (`/app/`)

- **Shell** (`public/js/shell/main.js`): hash routes for five tabs (`#today`, `#study`, `#read`, `#know`,
  `#explore`) and `#settings`. Tabs sit at the bottom on a phone and become a sidebar on a wide screen.
- **The top bar** (`app-header`, `ui.appHeader`): the tab's title, then the language you're learning
  (**`header-language`**, `ui.headerLanguage`: its flag and code, small, opening Settings → Language) and the settings
  button. The title gives way first on a narrow screen.
- **Study** (`public/js/shell/study.js`): two doors, then where you are on the path, then quiet rows; More ways to study (`#study/more`) has every other way to study, its packs last. Where you are (`#study/path`, `study/path-page.js`) is the whole path on one page. A session
  (`public/js/study/session.js`) opens over the page at `#study/session/<mode>[/<arg>]`.
- **Evidence:** every answer becomes evidence in one format (`progress.js`: concept, skill, outcome) on the device,
  so every way of studying feeds the same knowledge model.
- **Settings** (`public/js/shell/settings.js`): account and passkeys, Appearance, your AI, storage, your data
  (export everything, delete the account), about.

### Tablets and computers

A phone's layout is the one the app is drawn for, and nothing below changes it (`scripts/desk-check.mjs` compares 390 and 320 with the
app from before, pixel for pixel). A wide screen is 1024 px and up (an iPad on its side, a laptop, a desktop): the tabs are a sidebar, the
page a column of `--page-width` beside it. Every rule for it sits in `@media (min-width: 1024px)`, and the sidebar holds there whatever
the page:
- **No way back to a tab.** The sidebar has every tab and Settings itself, so Settings' menu has no back pill there (`ui.appHeader`'s
  `back.tab`, `data-back="tab"`); a page inside Settings keeps its way back to Settings.
- **Settings beside its pages, at 1280 and up.** Its menu is a pane of its own (`--settings-pane`, 320 px) beside the page it opened, the
  two centered together, as a computer's settings are (`shell/main.js SPLIT`, `shell.css data-split`). Settings itself opens its first page,
  Account. The page in view is lit in the pane with the sidebar's own token for the tab you're on (`--fill-active`), its words in their own
  ink; an avatar on a lit or pressed row keeps a hairline ring in `--ink-2`. A first page has no back pill, since the pane is its way back;
  a page further in keeps its own. The pane stays put as the page scrolls, pages beside it change in place with no push, and leaving for a
  tab takes it away.
- **Translate keeps the sidebar and the column.** Its box is as tall as its text, two lines to about 40% of the screen, then it scrolls
  inside (`translate/page.js placeWide`: no split to keep and no keys to make room for), and the language bar is the box's toolbar: right under
  it, where its text starts (352 × 52), flat (a 1 px edge, no glass, no shadow), the answer and its sentences under it. The row is the whole
  of the two languages: language, swap, language, speak; `translate/page.js seatSwap` moves the swap into it from 1024 px, so the keys reach
  them in that order, and the box is a plain box with no bite (`translate.css`; under the answers the bar was still a phone's pill at the
  window's foot, and the swap hung from the box's middle over nothing).
- **The first run is a page.** What do you want to learn? is the frame's width (960 at most), not a phone's 480 px column down the window's
  middle with 75 languages in one long scroll: the full courses and the first lessons are each set in four columns, read down then across as
  a list is, their headings across all four; a row is 48 px; the search keeps a field's width (360) (`settings-wide.css`). desk-check's first
  run stage holds it.
- **The AI section's own page is two columns from 1280** (`settings-wide.css`, `ai/tab.js`, `shell/main.js WIDE_PAGES`): Practice with me,
  what to ask for and Past practices in the main column (608 of the 960; the page's 720 from 1600), and an aside of its own in the rest: the
  connection as a card (the AI's mark, its name, when it was last here; the card opens the connection page) and Your requests, the newest
  three with where each is, the unfinished first, with See all. Your requests and Connection leave the foot's rows then. The aside is built
  from 1280 only (`matchMedia`), so a phone's page has nothing of it; an AI not connected keeps the page's 720 at the start. Its request
  pages, Your requests and the connection page keep the 720. desk-check's AI section stage holds all of it.
- **Reading text on Settings' pages and the AI section keeps the measure** (`settings-wide.css`): a note under a setting, a row's second
  line and an empty list's line at most `--measure` from 1024 (they ran 95 to 110 characters on Your AI, a request's page and Appearance →
  CSS). `ai/connection.js` names its page `lx-ai-connection`, so Your AI keeps it in Settings and in the AI section alike. A command to copy
  stays one line that scrolls. Settings' rows are left as they are: a value or switch at its row's end in the 720 column is frame.md §5's
  own rule, and a choice list's check at the row's end with the chosen title bold is the list's design, not a stray mark.
- **Settings' pages and the AI section** (`settings-wide.css`): Report a bug's "sent along" is a small table, each value beside its name;
  Appearance's themes are five to a row; an AI request's choices have their marks before their words, as a form's do. desk-check's settings
  and AI stage holds them, and that the parts of these pages that are their own change with the mouse on them (Translate's language
  buttons, swap, speakers and bar; Read's See how it reads and Add a book or text; a theme's tile).
- **Read is a shelf, not a phone's page blown up** (`read.css`, "on a computer"). The book up front sits beside its name and its way in, at
  a book's size: a picture book's page 168 px tall and as wide as its shape gives, a designed cover 148 wide, Home's drawing of the book
  you're reading in a tile 320 wide; so Weave your own and the shelf are in the window's first view. The lead shelf's covers are one height
  (132 px), each as wide as its shape (a wide page 276, a square one 132), side by side and wrapping; the shelves after it keep a picture book's page at the same 132.
  Your library mixes shapes (picture books, texts you added on title covers), so its covers are one height, 160 px, on Read's row and on its
  own page alike: a title cover 107 wide (its title sizes itself to its cover; at 88 a word broke in two), a picture book's page as wide as
  its picture gives, 360 at most, wrapping on its page. With nothing in it the way to a book sits under the empty card, clear of it. From 1280, where Read's own page fills the frame (`shell/main.js
  WIDE_PAGES`), two things lead it side by side: the book up front, its picture across its column (536 × 256 at most, 1.5 × a phone's) with
  its name and its way in under it, and Weave your own as a card 400 wide beside it; Find a book, the shelf, Your library and the way to add
  run the frame's width under them, and running text keeps its measure. Without one of the two, the other keeps the row. desk-check's read
  stage holds it.
- **The reader keeps its things with the book.** The book is at most 1100 px wide in the window's middle, and what belongs to it stays at
  its edges, not the window's corners (`reader.css`, "on a computer"; `--reader-side` is the room either side): the way back and the bar's
  buttons over the pages' edges, the page number under the first page's first letter, the gear and the full-screen button beside the last
  page. A text's two pages start under the top bar, as a picture book's do (on a phone the bar lies over a page's first line), and the page
  is as tall with the bar up or away, so putting it away moves no word. Its sheets are panels there, 400 px wide with no handle to drag:
  reading settings, a note and a word's card rise over the gear; Contents and Notes come down under their own buttons (`reader.js` marks
  them `data-dock="top"`). The card at its foot (weaving a text of yours, why a woven text reads in English) is as wide as the pages' text.
  With a mouse (1240 px and up, where there's a margin to hold it) a quiet arrow in the margin either side of the book turns the page, the one
  with no page to turn to dimmed; in a right-to-left book they change sides. A picture book's book is up to 1400 px wide from 1600 (a text
  keeps 1100: its lines stay a book's). desk-check's reader stage holds it.

A session (a lesson, Practice, any game) changes from 700 px wide and 640 tall (an iPad either way up, a computer; never a phone, upright or on
its side), in `components.css`:
- **One block in the screen's middle.** The game sits right under its question, not centered in the room left, and the bar right under the
  game: a result is a panel the column's width there, not a band across the screen's foot. `session.js fit()` sets the room over the
  block (`--stage-top`) as a step is first fitted and keeps it for the step, so a result filling the bar never moves the step.
- **Number keys, shown.** With a mouse, each choice a key answers (1–9: `data-keys` on Choose's, Tap the picture's and Fill's choices)
  shows its number in its corner until the step is answered.

**One frame, at 1280 and up** (11 Nov 2026). Every page sits in one frame, 960 wide (1120 from 1600), centered beside the sidebar
(`shell.css --lx-frame`), so the header's title and chips stand at the same place on every tab. A grid page fills the frame; every other
page's column is 720 at the frame's start edge, never centered in it. A tab's own 720 page (Home, Read, the AI section) uses the frame's
other 240 for an aside of its own; a sub-page leaves it as its margin.

**The frame's own parts, on a computer** (`shell.css`, `components.css`, `shell/main.js`; desk-check holds each):
- **The sidebar leads with Lexicommons**: its drop and name over the tabs, as the sign-in pages lead with them.
- **Every page's heading is 28 px bold**: a tab's title in the header and a page's own (`ui.pageTitle`, 500 on a phone).
- **A page's title in the bar** (once its large title has gone under the header) stands over the middle of the page's own column: a list
  page's 720 at the frame's start, a grid page's frame. `fitBar` works its room out around where it stands, so it clears the way back and
  the header's end ("bar title"). Translate's title is its heading, at the frame's start under its way back to Home.
- **The path is one block centered as a whole** (`shell/main.js CENTER_PAGES`), its header and its way back with it.
- **Two columns for a tab's own page.** From 1280 the frame splits as `minmax(0, 1fr) 320px` with 32 between (608 + 32 + 320), from 1600
  as 720 + 32 + the rest, the aside's top level with the main column's; below 1280 it stays one column. Each such page (the AI section,
  Home) is listed in desk-check's `WIDE_ASIDES`, and its asides stage holds the split at 1280, 1440 and 1600.
- **Toasts in the middle of what you're looking at**: at the foot, centered on the page beside the sidebar, or on the window while a
  session or the reader covers it (`appearance.css`; "toasts").
- **A sheet is a dialog**: 560 wide with every corner rounded, its handle a close mark in its top corner (a computer drags nothing),
  centered in the room beside the sidebar (the window's while a session or the reader is open).
- **A page's pinned action is in the page's flow**, under what it ends, at the column's start, its note too: a phone's band at the window's
  foot read as stranded on a computer. In a sheet it stays the sheet's.
- **A page opened from another tab keeps that tab lit**: Add an Anki deck lights Explore or Settings when it's opened from them (its `?from=`,
  `shell/main.js litTab`), Study when opened from Study.

**A block button on a computer** (1024 and up, `components.css`): as wide as its words, 240 to 360 px, at its box's start edge under what it
acts on, or centered where its box centers what's above it (an empty state), on the page and in its cards alike. A session's bar, a sheet, a
dialog and the reader keep theirs spanning their box. (It replaces 9 Nov's cap, under which a 720 button sat at the left of a 960 column and
read as off center.) desk-check's wide stage holds it (BUTTON_RULE) with one title place on every page.

**A wider column for the grids, at 1280 and up.** Study's, Explore's and Knowledge's own pages, Your words and the topics are 960 wide
(`--page-width-wide`): Study's games 4 a row, Explore's topics 6 (with All packs and the language row in the first view), Your words 4 a
shelf. `shell/main.js WIDE_PAGES` marks the app `data-column="wide"`, and `shell.css` widens the header's and the page's padding (not
`--page-width`: a custom property the whole page inherits, so changing it restyles every element in the page). Their lists and forms (Study's
packs, the path, a topic, a pack's page, Browse, Add your own) stay 720: a list's switches sat 900 px from their names at 960. The move between
the two rides the page's push. Buttons follow the computer's own rule (above). Rows and lists span the 960 as
fields, cards and grids do (All packs and the language row end where the search field and the topics do). desk-check's wide stage holds it.

**Knowledge's cards as a board, where the tabs are a sidebar** (`know.css`). From 1024 the tab's first row is what the page draws before
its first frame: the pile's card about a phone's width (three tenths of the column, never under 288 px, so the pile fills it as it does on
a phone) beside This week. In the 720 column (a tablet on its side, a window under 1280) This week is one column, as a phone has it, and
runs on past the pile's card, which keeps its own height so its heap is in the first view (the card was the column's width there, 720 by
415 with the heap in its middle third, and This week began under the fold). In the frame, from 1280, the pile's card is as tall as its
row, the pile on its floor, and This week is two columns: its number, glasses and scale at its start, what they're made of, the new words
and its button beside them (`cards-more.js weekCard`'s `.lx-week-side`, which draws no box on a phone). Then the
ideas two to a row (from 1024, and on the Ideas page, a frame page from 1280: one left over takes its row), and Everyday and Over time the
column's width. `know/page.js` draws the ideas before the first frame in the frame, since they're on the first screen. The pile is drawn in
the theme as it is: its paints and the page's ground are read when it's built and again on a new theme (`cards.js` relook: `page.js` tells
a pile on the screen, and a page kept off it asks when it comes back); pile-drop-check counts the old ground's pixels on its
canvas. desk-check's phones stage holds the tab's top (without the pile's tiles,
which every visit lays out anew), This week, the tab's idea cards and the Ideas page as they were.

**Explore on a computer** (`explore.css`). From 1024 the language's lessons are one line (cover, words, Continue or Start at its end, 260 px),
not a card with a bar across it; 32 px stand between the home's sections; the rows at its foot are one list (the language's row with no box
of its own between All packs and Add your own pack, their symbols on the column's start edge, their chevrons and its value on its end
edge); Add your own's running text keeps the measure. From 1280 the pack to add next stands beside the lessons on their row, and the
Topics page fills its rows whatever their number (`explore.js topicsARow`: six a row where they fill or nearly fill, else seven, else
five: 14 topics seven a row). A pack's page has its way forward (Add pack, Added, Continue) in its head beside Like and More from 1024
(`explore.js actionsInHead`), where a phone has it pinned low; the window narrowed, it goes back there. That head stands at the column's start
there, where its sentences start: the cover (120 px) beside the name, which is the page's heading, its facts under the name, then the row
of its buttons; See all its sentences is centered under them. A topic's packs are one line from 1024 as the lessons are (cover, first
sentence, Add pack at the end), and a pack's lessons keep each row's line at the measure. A card that's one link (`explore.js linkWhole`:
the lessons, a topic's packs) wears the keyboard's focus on its own outline and hard edge, in the ring's color, with the ring around them:
the ring alone, 2 px outside a 2 px outline, read as a second border (desk-check's "explore focus" stage measures it). Books with none
shared show the empty shelf (`empty-library`). desk-check's phones stage holds Explore's home, the topics, a pack's page and Add your own as
they were.

**Reading lines at most ~68 characters, everywhere.** `--measure` (tokens.css: `min(31em, 640px)`) is the one cap: ~68 characters of Instrument Sans
at 12–16 px (it averages ~0.46em a character; `68ch` would be ~100, "ch" being its 0), 640 px at the reader's larger type (~60 characters).
It goes on the text itself, never a container of another size (em is the element's own), and the text stays where its column starts, beside
the cards and headings: only the reader centers it. Running text has it (a row's lines, a page head's line, a pack's About, a page's quiet
line, a folded explanation, a source's credit, a book's credits, Terms and Privacy through `site.css`'s copy); a block of single words
doesn't. A phone's column is narrower, so it changes nothing there.

A tablet (700 to 1023 px wide: an iPad upright; the floating tab bar stays) keeps the 720 column and a phone's ways, with room used:
- **Translate's box as tall as its text**, as on a wide screen (`translate/page.js` from 700 px), the language bar floating at the foot as on
  a phone, over the keys while typing.
- **Your words three to a shelf.** A cell there is ~240 px, twice a phone's, so only a word over 18 letters or a meaning over 44 takes two
  places (`know/words-page.js data-long`); on a phone, one over 9 or 22.
- **The reader's single page at most the measure (640 px at its type),** centered between wider gutters; a picture keeps the page's whole
  width (`reader.css`).
- **44 px on a tablet too.** An iPad is touched at arm's length: every control reaches 44 × 44 there as on a phone (components.css's rule for
  small controls: an invisible `::before` as far as it's short), counted where it can really be touched (a sticky header over its edge doesn't
  count: Study's gear reaches 3 px into its card's bite for the header over its top). `component-check.mjs --tablet` and desk-check's targets hold it.
  Two small controls stand their two reaches apart, or the later takes the earlier's: This week's mini tiles (32 px tall, reaching 6 each
  way) have their rows 12 px apart from 700 px (`know.css`); at a phone's 8 each keeps 40.

With a mouse or a keyboard (any width; `@media (hover: hover)`, which a phone or a tablet by touch never matches):
- **Everything you can press shows it before you press.** With the mouse on it, a link or button changes: drawn on the canvas (a row, a
  door, an outlined card or tile, a small round button), it takes `--fill-hover`, as its press takes `--fill-active`; painted (a word's tile,
  a topic's drawing, a pack's cover, the book's tile, the way forward), it brightens (`filter: brightness(1.06)`), as its press darkens or
  sinks it. A hover rule sits beside its part's press rule, never in a list of its own, and leaves `:active` the press's (`:not(:active)`).
  Where a part has no padding to tint (the streak spot), a spread shadow of the same tint reaches past its edge, so nothing moves.
- **The sidebar first in Tab order.** Where the tabs are a sidebar, it comes first among the app's parts (`shell/main.js frameParts`), then
  the header, then the page in the order it's seen; on a phone the tab bar stays last, under the page. It's fixed to the screen either way,
  so its place moves nothing.

## Building screens

- Build UI with the `ui.js` builders, never hand-written markup, so the parts and meaning icons stay consistent.
- A new component means changes in four places:
  - its rules in `components.css`, keyed on `data-part`;
  - an entry in `PARTS`;
  - a builder in `ui.js`;
  - a demo on `/design`, showing every one of its states.
- Before deploying a design-system change:

```sh
node scripts/test-css-safety.mjs          # the CSS check against 30 ways of sneaking a request past it (exit 0 = pass)
node scripts/test-look-rules.mjs          # checking, patching, merging and comparing looks (exit 0 = pass)
# /design end to end in headless Chrome (needs Playwright and Chrome for Testing: scripts/install-check-chrome.mjs): surface check, themes, presets, custom
# CSS, tokens, images, export/reset/import, no flash, games, phone width, zero console/CSP errors (exit 0 = pass).
# baseUrl: a local `npx wrangler dev --var GATE_ENABLED:false`, or the live site
node scripts/design-check.mjs <baseUrl> <outDir>
# The app's theming end to end, on a LOCAL server only (it signs up and deletes an account): every Appearance page,
# colors, CSS, images, sharing, recent looks, safe mode, the look on the account, MCP changes from a personal token,
# a second device, two devices at once (app/AGENTS.md has the server's flags).
node scripts/theme-check.mjs http://localhost:<port> <outDir>
```

## Signing in

- **The sign-in pages** (sign in, create your account, connect an app, messages) are rendered by the server
  (`src/pages.ts`). They're built on the design system (`public/css/signin.css`, layer `lx.page`), so they follow the
  device's saved look: theme-boot first, then `theme.initTheme()` for its images.
- **The `sign-in-button` part** (variants `google · github · passkey`) is the same size and weight for every way.
  Google's follows Google's sign-in branding rules:
  - its color G (`public/icons/google-g.png`, from Google's own assets, never recolored);
  - its light or dark fill, stroke and text, picked by the page's `color-scheme` (`light-dark()`);
  - Google Sans Medium 14/20 (`public/fonts/google-sans-500-latin.woff2`, OFL, license beside it).
- Built-in themes never restyle Google's button. GitHub's mark is drawn in the ink color.
