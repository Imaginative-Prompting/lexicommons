# Checks before launch on v645 (10 Nov 2026)

The director's list after v645 (lx-app): a brand-new learner's first session and the app in the browser, Tinta's place on the path strip
with a pack lesson next, and the gate and privacy checks. All on a fresh local copy of app/ as it was at v645 (`npm run local`, the
library seeded), each browser check through gpu.py's parallel lane.

## Results

| Check | Result |
|---|---|
| first-session-check | 11/12, then **12/12** with its Match fix (below) |
| app-check | 21/27, then **27/27** with its fixes (below) |
| tinta-tabs-check | **24/24**, Study after a lesson included (Tinta on the old place, the hop as the segment inks in, idle on doors.js's drawing) |
| The strip with a pack lesson next (lx-app's run) | **pass**: a learner after unit 1 with an AI-made "Trip to Utrecht"; Study's lesson door opens its first lesson; played through, back on Study Tinta goes hop-to → idle, the place "Trip to Utrecht 1 · Lesson 2"; no errors |
| privacy-check | **9/9**, on a fresh state with sharing for everyone and the server's log: MCP's instructions, tools, prompts and guides (the evening's guides among them) name no plan or payment; Translate's words in no URL and not in the log |
| gate-check, gated | **6/6**: 48 paths and 170 routes refused, the password only when right |
| gate-check, public | **16/16** with sharing for admins (the live config's) and **16/16** with sharing for everyone, each on its own fresh state |

## The checks' faults, and the proof the app was right

Each failure was the check's, older than the evening's landings: app-check failed the same six stages, word for word, with lx-app's
v643–v645 files put back as they were at 14:53 (`app-before.txt`), and passed 27/27 on 7 Nov.

- **A tile found by part of its text.** Playwright's `hasText` with a string matches part of the text, ignoring case.
  - first-session-check: a new learner's first Match is ik, zijn, jij against I, to be, you. "I" found "ik" first, so ik was pressed twice and the
    session never reached its summary (the still: ik left pressed, I untouched).
  - app-check: in Listening, "How are you?" found two choices ("How are you?" and "Hello! How are you?"). Choose's answer had the same
    pattern, hidden by `.first()`.
  - Fixed: every such tap is by the whole text, as the Dutch tiles already were.
- **The games before a first word.** Since lx-games' 8 Nov landing (v484), a brand-new learner's whole-sentence games are quieter and a press
  starts lesson 1, until a first word is studied. app-check's "Study's games" pressed Choose on a fresh account and waited for Choose.
  - Its failure left the window at 1440 wide, so "wide screen", "a session's frame" and "settings" failed after it.
  - Fixed: the games are checked with the words known (`knowWords`, as the stages after it already did). The new-learner behavior is
    lx-games' own.
- **Study settings at version 2.** Since 9 Nov (What does it say?'s word-for-word line on by default), the app writes study settings at
  version 2. The export check still asked for 1; it now asks for the version the app writes.

A first public run failed one stage because lx-app started its server with sharing for admins (the config's) while the check, by default,
expects everyone: an ordinary account was refused sharing, as that setting says (`gate-public-mismatched.txt`). Each setting was then run
on its own fresh state with the check told which.

Every server was a fresh local one on the v645 files: `wrangler d1 migrations apply` into its own state, `wrangler dev` with made-up local
values for the gate's password and secrets. Nothing from the live config's secrets.

## Files

- `results/`: each run's pass/fail lines (paths made relative). `app-before.txt` is app-check with lx-app's v643–v645 files put back as
  they were before them.
- `pack-strip.mjs`: lx-app's run of the strip with a pack lesson next (a scratch script on the shared helpers; `--app <a copy of app/>`).
