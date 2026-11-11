// Whether a pasted text looks like it's in the language you're learning, on shares measured on 4 Nov 2026: with only the
// starter on the device, and with the word packs. A wrong guess is worse than none, so what it can't tell stays unguessed.
// Usage: node scripts/test-paste-language.mjs   (exit 0 = pass)
import { looksLike } from "../public/js/read/paste-language.js";

let failed = 0;
const cases = [
  // [what, share in the language, share in English, should it say so]
  ["Dutch, with the word packs", 0.95, 0.09, true],
  ["a Dutch article, with the word packs", 0.97, 0.13, true],
  ["a Dutch story, with the word packs", 0.96, 0.04, true],
  ["a simple Dutch text, starter only", 0.23, 0, true],
  ["a Dutch article, starter only: can't tell", 0.06, 0, false],
  ["a Dutch story, starter only: can't tell", 0.07, 0, false],
  ["English, with the word packs", 0.33, 0.9, false],
  ["an English article, with the word packs", 0.1, 0.97, false],
  ["English, starter only", 0, 0.14, false],
  ["German, learning Dutch, with the word packs", 0.16, 0.16, false],
  ["German, learning Dutch, starter only", 0.05, 0, false],
  ["nothing known", 0, 0, false],
];
for (const [what, share, english, want] of cases) {
  const got = looksLike(share, english);
  if (got === want) console.log(`ok    ${what}`);
  else {
    failed++;
    console.log(`FAIL  ${what}: ${got}`);
  }
}
console.log(`\n${failed ? `${failed} FAILED` : "all passed"}`);
process.exit(failed ? 1 : 0);
