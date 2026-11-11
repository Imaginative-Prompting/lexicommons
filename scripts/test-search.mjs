// Search in a text (public/js/read/search.js): case and accents ignored, a place across words, punctuation, one hit per
// place, the limit and "more", queries too short, snippets at a book's edges. `node scripts/test-search.mjs` (exit 0 = pass).

import { SEARCH_MAX, SNIPPET_AFTER, SNIPPET_BEFORE, foldText, searchIndex, searchWords, snippetOf } from "../public/js/read/search.js";

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    const detail = fn();
    passed++;
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const places = (words, query, options) => searchWords(searchIndex(words, options?.lang), query, options);

test("case and accents are ignored, both ways", () => {
  const words = ["Een", "Café", "met", "één", "kop", "CAFÉ."];
  const cafe = places(words, "cafe", { lang: "nl" });
  const een = places(words, "één", { lang: "nl" });
  ok(JSON.stringify(cafe.places) === JSON.stringify([{ i: 1, j: 1 }, { i: 5, j: 5 }]) && !cafe.more, `cafe: ${JSON.stringify(cafe)}`);
  ok(JSON.stringify(een.places) === JSON.stringify([{ i: 0, j: 0 }, { i: 3, j: 3 }]), `één: ${JSON.stringify(een)}`);
  return `${foldText("Één CAFÉ", "nl")}`;
});

test("a place across words, punctuation in the book's words, extra spaces in the query", () => {
  const words = ["She", "said:", '"Good', 'morning,"', "and", "left."];
  const found = places(words, "  good   MORNING ");
  ok(JSON.stringify(found.places) === JSON.stringify([{ i: 2, j: 3 }]), JSON.stringify(found));
  const part = places(words, "orni");
  ok(JSON.stringify(part.places) === JSON.stringify([{ i: 3, j: 3 }]), `inside a word: ${JSON.stringify(part)}`);
});

test("one place per word, even when the query comes twice inside it", () => {
  const found = places(["eeeen", "meer", "eeeen"], "ee");
  ok(JSON.stringify(found.places) === JSON.stringify([{ i: 0, j: 0 }, { i: 1, j: 1 }, { i: 2, j: 2 }]), JSON.stringify(found));
});

test(`at most ${SEARCH_MAX} places, and "more" when there are`, () => {
  const words = Array.from({ length: 200 }, (_, k) => (k % 2 ? "cat" : "the"));
  const many = places(words, "cat");
  ok(many.places.length === SEARCH_MAX && many.more && many.places.at(-1).i === SEARCH_MAX * 2 - 1, `${many.places.length}, more ${many.more}`);
  const exactly = places(words.slice(0, SEARCH_MAX * 2), "cat");
  ok(exactly.places.length === SEARCH_MAX && !exactly.more, `exactly ${SEARCH_MAX}: more ${exactly.more}`);
});

test("too short to search: nothing done", () => {
  ok(places(["a", "b"], "a") === null && places(["a"], "   ") === null && places(["é"], "é ") === null, "short ones searched");
  ok(places(["ab"], "ab")?.places.length === 1, "two letters search");
});

test("nothing found", () => {
  const none = places(["De", "kat", "slaapt."], "hond", { lang: "nl" });
  ok(none.places.length === 0 && !none.more, JSON.stringify(none));
});

test("snippets: words either side, cut at the book's edges", () => {
  const words = Array.from({ length: 30 }, (_, k) => `w${k}`);
  const start = snippetOf(words, { i: 1, j: 2 });
  ok(start.before.join(" ") === "w0" && start.found.join(" ") === "w1 w2" && start.after.length === SNIPPET_AFTER && !start.cutBefore && start.cutAfter, JSON.stringify(start));
  const end = snippetOf(words, { i: 28, j: 29 });
  ok(end.before.length === SNIPPET_BEFORE && end.after.length === 0 && end.cutBefore && !end.cutAfter, JSON.stringify(end));
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
