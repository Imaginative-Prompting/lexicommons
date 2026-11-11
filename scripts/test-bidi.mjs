// Right-to-left text in an English interface (public/js/lx/bidi.js): which elements run right to left, and the runs of
// right-to-left script isolated inside English text. Exit 0 = pass.
//   node scripts/test-bidi.mjs

import { LANGUAGES } from "../public/js/lang/index.js";
import { bidiRuns, dirFor, setLang } from "../public/js/lx/bidi.js";

let passed = 0;
const failures = [];
const same = (actual, expected, what) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${what}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
};
// A node as far as setLang needs one.
const fakeNode = () => {
  const attrs = {};
  return { attrs, setAttribute: (k, v) => (attrs[k] = v), removeAttribute: (k) => delete attrs[k] };
};

LANGUAGES.xr = { name: "Right-to-left test", locale: "xr-XR", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", patterns: {} };
try {
  same([dirFor("xr"), dirFor("nl"), dirFor("en"), dirFor("zz"), dirFor(undefined)], ["rtl", null, null, null, null], "dirFor: only a right-to-left language");

  const node = fakeNode();
  setLang(node, "xr");
  same(node.attrs, { lang: "xr", dir: "rtl" }, "setLang: a right-to-left language sets dir");
  setLang(node, "nl");
  same(node.attrs, { lang: "nl" }, "setLang: switching to a left-to-right language takes dir off");

  same(bidiRuns("Questions: هل at the start (هل تتكلم الإنجليزية؟)."), [
    { text: "Questions: ", rtl: false },
    { text: "هل", rtl: true },
    { text: " at the start (", rtl: false },
    { text: "هل تتكلم الإنجليزية؟", rtl: true },
    { text: ").", rtl: false },
  ], "bidiRuns: each Arabic phrase one run, the English parentheses outside it");
  same(bidiRuns("The verb comes last: מה שלומך? Then ספר."), [
    { text: "The verb comes last: ", rtl: false },
    { text: "מה שלומך", rtl: true },
    { text: "? Then ", rtl: false },
    { text: "ספר", rtl: true },
    { text: ".", rtl: false },
  ], "bidiRuns: Hebrew, with the English ? outside the run");
  same(bidiRuns("می‌روم is one word"), [{ text: "می‌روم", rtl: true }, { text: " is one word", rtl: false }], "bidiRuns: a Persian joiner stays inside the run");
  same(bidiRuns("No right-to-left here (none)."), [{ text: "No right-to-left here (none).", rtl: false }], "bidiRuns: English alone is one piece");
  // A suffix or prefix shown with its joining stroke (tatweel, a Common character): the stroke stays with its letter.
  same(bidiRuns("Endings for my, your: ـَم, ـَت"), [{ text: "Endings for my, your: ", rtl: false }, { text: "ـَم", rtl: true }, { text: ", ", rtl: false }, { text: "ـَت", rtl: true }], "bidiRuns: a suffix keeps its tatweel and mark");
  same(bidiRuns("Not: نـ"), [{ text: "Not: ", rtl: false }, { text: "نـ", rtl: true }], "bidiRuns: a prefix keeps its tatweel");
  same(bidiRuns("a dash — here"), [{ text: "a dash — here", rtl: false }], "bidiRuns: no tatweel, no run");
  // An affix shown with a hyphen (Sorani's prefix دە-, suffix -ەکە): the hyphen touching the run is part of it, so it
  // sits where the word it joins would be; English hyphens stay as they are.
  same(bidiRuns("The present: دە- + stem"), [{ text: "The present: ", rtl: false }, { text: "دە-", rtl: true }, { text: " + stem", rtl: false }], "bidiRuns: a prefix keeps its hyphen");
  same(bidiRuns("Endings: -ەکە, -ان"), [{ text: "Endings: ", rtl: false }, { text: "-ەکە", rtl: true }, { text: ", ", rtl: false }, { text: "-ان", rtl: true }], "bidiRuns: a suffix keeps its hyphen");
  same(bidiRuns("a well-known word"), [{ text: "a well-known word", rtl: false }], "bidiRuns: an English hyphen stays English");
  same(bidiRuns("phrases such as په … کې"), [{ text: "phrases such as ", rtl: false }, { text: "په … کې", rtl: true }], "bidiRuns: an ellipsis inside a phrase keeps it one run");
  same(bidiRuns(""), [{ text: "", rtl: false }], "bidiRuns: empty");
} finally {
  delete LANGUAGES.xr;
}

for (const failure of failures) console.log(`FAIL  ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
