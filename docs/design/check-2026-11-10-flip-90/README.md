# A woven sentence turns whole at 90% known (10 Nov 2026)

The reader showed a woven sentence whole in Dutch once 95% of its words with a lemma were known. A sentence of fewer than 20 such words
then needed every one, so in practice it meant the whole sentence. The default is now 90%, and the setting offers 50 / 70 / 90 / All / Never.

## What changed

- `public/js/read/woven-text.js`: `FLIP_AT = 90`; `FLIP_CHOICES` (the setting's five, one list); `flipAtOf(kept)`, a kept share the
  setting no longer offers reads as the default.
- `public/js/read/reader.js`: the setting's options from `FLIP_CHOICES`; every read of the weave settings goes through `flipAtOf`
  (`weavePrefs`).
- `public/js/read/bank.js`: its comment and the re-export.
- `src/weave-guide.ts`: `FLIP_AT = 90`, which the weave guide states ("once they know 90% of a sentence's words"). test-guides holds it
  equal to the reader's. The guide's worked example reads the same at 90 at all three of its levels, as the test renders them.
- `scripts/reader-check.mjs`: plants an old device's weave settings (all of them, the share at 95), then checks the setting's five
  choices and that 90% is the one pressed. It resets to 90% where it reset to 95%.
- Outside app/: `docs/design/learning-strategy.md` says 90%, and why.

## A kept 95, and other devices

- The reader's settings live on the device (localStorage `lx.reader.v1`). They aren't synced and aren't in the export, so no device's 95
  ever reaches another.
- A change to any weave setting saves all of them. So every device whose weave settings were changed before this keeps `flipAt: 95`,
  whether chosen or not. It reads as 90 from this version on: the setting shows 90% pressed, and the next change saves 90.
- A device still on an older version keeps 95 until it updates.

## The rule

`weaveSentence` turns a sentence whole when known / total × 100 ≥ the share. The total counts the sentence's words with a lemma, a verb
group's words each. Checked against exact integer arithmetic for every sentence of 1–80 such words and every known count: no
difference, so no float edge at 90.

- A sentence of fewer than 10 such words still needs every one.
- 10 words: 9 known. 20 words: 18.
- A 5-word sentence with 4 known (80%) doesn't turn.

The table, both ways, is at the top of `alice-3000.md`.

## Woven Alice's opening, before and after

`alice-3000.md`, made by `probe.mjs` (`node probe.mjs <app> <out>`). Its bank tables:

- **The text's own most frequent words** (the weave audit's banks): no difference at any size. A short text's rare words tie, so they're
  ordered as they come and each sentence goes from under 90% to all known in one step.
- **A learner's bank** (the course's Dutch frequency list, its first N lemmas), at 2,000 / 3,000 / 5,000: 4 / 5 / 11 sentences whole at
  95, and 9 / 15 / 17 at 90.

The first page knowing the list's first 3,000 is shown both ways, with each newly whole sentence's unknown words. Five sentences turn
whole at 90 that didn't at 95.

- The shortest is 18 of 19 known: at 95, a 19-word sentence needs all 19.
- Carroll's long ones turn whole with several new words. The longest is 97 of 106, with 9 unknown (vestzak twice, nieuwsgierigheid,
  achteraf…); at 95 that same sentence would turn whole with 5 unknown.
- Every newly whole sentence keeps its Dutch-order line under it by default, so each new word's English is right there.

## Checks on the candidate

reader-check (through check-gate), b4-check, test-guides 14/14, test-book-format 159/159, test-woven-tint, test-owner-words,
test-owner-name: see `results/`.
