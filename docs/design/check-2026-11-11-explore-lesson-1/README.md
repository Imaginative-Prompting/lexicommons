# Explore's "Add next" waits for lesson 1 (11 Nov 2026)

A brand-new learner opening Explore saw the lessons card's Start and, under it, "Add next: Culture" face-out: a second thing to start
before the first. Now the pack to add next waits until lesson 1 is done, in the language being learned (another language's Explore keeps
its pick; a language with no path has its starter's lesson 1).

## How

`public/js/explore/explore.js`: drawHome holds the pick back while the path's first lesson isn't done (plan.js lessonFinished, marked or
studied). Explore is a kept tab, and a kept home is drawn again only when the server's home differs, so a held pick would have waited for
that: once lesson 1 is done, the home is drawn with it at once while Explore is off the screen, else the next time it comes (stale(),
refresh({ now }), worked out then, never into the page under the eye). Progress, a finished lesson, a mark and the path's own lessons
arriving each look again (a first sync lays out a stand-in path of a word band's lessons while path-nl is on its way: packs.js
lessonsComing).

## Checks

- `control.mjs`, the measure alone (explore-check's own selector) on a brand-new Dutch learner: with app/'s explore.js from before,
  "Add next Culture 200 sentences 0% known" (1 pick); with this one, 0.
- explore-check 21/21 on a fresh state with COMMUNITY_SHARING everyone: the home stage now asserts no pick before lesson 1, lesson 1 marked
  with Explore on the screen draws none in, and back on the kept page (no reload) it's there; its learner with sharing off marks lesson 1
  first. explore-browse-check (all stages), tab-check 13/13 (Explore after a restart: there at once from the device), tinta-tabs-check
  24/24, each marking lesson 1 first.
- `probe-restart.mjs`: why the checks' helper waits for lessonsComing() to be false. It first marked the stand-in's lesson
  ("words/starter-word-order/1"), and after a reload the real lesson 1 ("path-nl/l000") was undone, so tab-check's restart stages
  (rightly) found no pick.
- Stills at 390, as live (sharing "admins"): `explore-before-lesson-1-390.png` (the lessons card, then Topics),
  `explore-after-lesson-1-390.png` (Lesson 2's Continue, then Add next: Culture face-out).
