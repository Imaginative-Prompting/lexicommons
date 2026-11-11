# A new version, with nothing on screen about it (11 Nov 2026)

The "A new version is ready" toast (Reload, Later) is gone, with its code (`shell/update-prompt.js`). Nothing on screen says a new version
has come: no toast, banner, prompt, badge or dot, anywhere. `shell/new-version.js` takes its place.

## What happens now, case by case

| Case | Before (until v648) | Now |
|---|---|---|
| A fresh open: a new tab, a cold start of the Home Screen app, the app opened again after being closed | The newest version (pages and files come from the network first; the worker's copy is for offline) | The same: nothing to do |
| The Home Screen app left open for days (an iPhone keeps the page in memory) | Back into view: a look for a new version; once its worker took the page, the toast over the tab bar with Reload and Later | The look happens as the app goes out of view and as it comes back. The page carries on as it was. Settings → About shows "A new version is ready" with Reload under the Version row. The app reloads into it by itself only as it comes back after 30 minutes or more out of view, if the version was already ready then and nothing would be lost (below) |
| A session or a practice in progress when a version lands | Nothing during it; the toast once you left | Nothing during it and nothing after. The new worker takes over in the background; About says so |
| Two tabs | Each showed the toast | A tab opened after the version runs it, with nothing ready there. A tab left open has it ready in About until its next fresh open |
| A version that changes what an old page reads | No forced path: the toast's Reload was the only remedy, and Later left the page on its old code | No forced path either. The one real risk is an old page loading a module it hadn't loaded yet (a picture's story, Tinta's acts, Translate's index): it comes from the network at the new version beside the old code already in memory. A page that's left open meets it; the reload as the app comes back after 30 minutes closes most of that window. Stored packs carry their check's version, so a newer record an old page can't read is checked again in full there, not trusted |

## The one reload of its own

Coming back into view after 30 minutes or more out of view (the wall clock's time, which goes on while a phone suspends the app), with a new
version already ready, the app reloads into it: this page, its place and its history kept (`location.reload()`; the router carries on from
`history.state`). Never:
- while it's in view, however long it's been open (a version found after it comes back waits for the next time, or a fresh open);
- in a session or a practice in progress;
- with words typed and not sent in a field on the screen (Translate's box, a request's form, Report a bug, a file picked);
- while a download the person started is under way: Whisper's model, Translate's full translator, a book from the shelf (each holds it,
  `lx/reload-holds.js`);
- offline, or if the network doesn't answer within 4 s (it asks `/api/me`, which the worker never answers), so it never lands on the offline
  copy;
- after a press made while the network was being asked.

The reader keeps its place to the word: the same chapter, page and first word on the page (it saves its place as the page goes out of view).

The reload marks itself first (`lx/error-report.js markOwnReload`), so the start after isn't reported as one that came by itself.

## Settings → About

The Version row, and under it, only while a newer version is ready on this device, "A new version is ready" with Reload. It comes in place
while About is open. The Settings menu doesn't change: no badge, no dot. There was no "Check for updates" to keep. `about-current-390.png` and
`about-ready-390.png` are the page both ways.

## The checks

`scripts/update-check.mjs` deploys a version itself (the served `sw.js` under a new VERSION) and plays each case with a control: all 11 stages passed on the candidate merged with v648 (`results/update-check.txt`).
results/ has its lines. One finding on the way: a version deployed in a brand-new account's first minute waits on the old worker's work for
that first open (Chrome holds a new worker until the old one is done); nothing on screen depends on it, only when About says it's ready.

Two of its holes were the check's own, found on the way. "Opening the tab again" was a hash change to the same address, not a load. And a
download held with `page.route` wasn't held, because a service worker's requests reach only a context's routes (Playwright's switch for
them). Each is fixed and proven: the held book is shown still coming before the reload is tried.

The gate's checks, through check-gate on the candidate: test-sw-shell 5/5 and reader-check 58/58. Also on the candidate: shell-check, the
typecheck, and test-node-imports, test-translate (40/40), test-translator (7/7), test-speech-support, test-history, test-errors, test-i18n,
test-site-pages, test-owner-words and test-owner-name.

The Undo toasts (a theme change, a pack your AI made) are untouched: `ui.toast` and the toasts' container stay; only the update toast went.
