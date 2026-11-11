// The literal line's capitals in English order (public/js/lx/literal-case.js): the chunk that leads takes the capital,
// the old first chunk gives it up unless it's "I" or a name, everything else keeps its case. Exit 0 = pass.
import { readdirSync, readFileSync } from "node:fs";
import { englishOrderTexts, flipsOrder, keepsCapital, orderDiffers } from "../public/js/lx/literal-case.js";

let passed = 0;
const failures = [];
const same = (actual, expected, what) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${what}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
};
const chunks = (...texts) => texts.map((text) => ({ text }));

// Spanish "Me gusta el café": a moved pronoun first. Before the fix, English order read "pleases To me the coffee".
same(englishOrderTexts(chunks("To me", "pleases", "the coffee"), [1, 0, 2], "I like the coffee."), ["to me", "Pleases", "the coffee"], "a pronoun that led gives up its capital");
// Dutch "Gisteren heb ik…": a time word first; in English order "I have yesterday…" is led by I, which keeps its own.
same(englishOrderTexts(chunks("Yesterday", "have", "I", "a book", "read"), [2, 1, 0, 3, 4], "I read a book yesterday."), ["yesterday", "have", "I", "a book", "read"], "I leads, yesterday is lowered");
// "I" never loses its capital, wherever it lands.
same(englishOrderTexts(chunks("I", "tomorrow", "go"), [0, 2, 1], "I'll go tomorrow."), ["I", "tomorrow", "go"], "I leading stays as it is");
same(englishOrderTexts(chunks("I'm", "there", "tomorrow"), [2, 0, 1], "Tomorrow I'm there."), ["I'm", "there", "Tomorrow"], "I'm keeps its capital");
// A name keeps its capital: the natural English writes it mid-sentence with one.
same(englishOrderTexts(chunks("Anna", "sees", "me", "every day"), [3, 0, 1, 2], "Every day Anna sees me."), ["Anna", "sees", "me", "Every day"], "a name keeps its capital");
// Only the lead and the old first change; any other chunk keeps its case, capitals and all.
same(englishOrderTexts(chunks("To me", "pleases", "Amsterdam"), [1, 0, 2], "I like Amsterdam."), ["to me", "Pleases", "Amsterdam"], "the rest keep their case");
// No change in the language's own order, or when the first chunk still leads.
same(englishOrderTexts(chunks("We", "go", "tomorrow"), [0, 2, 1], "We go tomorrow."), ["We", "go", "tomorrow"], "the first still leads");
same(englishOrderTexts(chunks("We", "go"), undefined, ""), ["We", "go"], "no English order");
same([keepsCapital("I", ""), keepsCapital("Anna", "We saw Anna."), keepsCapital("Yesterday", "I read yesterday."), keepsCapital("", "x")], [true, true, false, false], "what keeps a capital");

// An order toggle or hint is there only when the order really differs.
same([flipsOrder([0, 1, 2]), flipsOrder([0, 2, 1]), flipsOrder(null), flipsOrder(undefined), flipsOrder([])], [false, true, false, false, false], "flipsOrder: only chunks that change places");
const line = (literal, means, more = {}) => orderDiffers({ literal, means, ...more });
same(line([["I"], ["drink"], ["a coffee"]], "I'm having a coffee.", { english: [0, 1, 2] }), false, "the same order, other words: nothing to show");
same(line([["I"], ["am"], ["here"]], "I am here.", { english: [0, 1, 2] }), false, "the same order, the same words");
same(line([["Is"], ["the coffee"], ["for my mother"]], "Is the coffee for my mother?"), false, "no english field, the same words");
same(line([["I"], ["have"], ["yesterday"], ["read"]], "I read yesterday.", { english: [0, 1, 3, 2] }), true, "the chunks change places");
same(line([["Here"], ["is"], ["my key"]], "My key is here.", { english: [0, 1, 2] }), true, "english says it can't flip; the words say the order differs");
same(line([["Today"], ["cold"]], "It's cold today."), true, "no english field: the shared words in another order");
same(line([["Where"], ["stands", true], ["the car"]], "Where is the car parked?"), true, "a chunk marked as moved");
same(line([["Where"], ["stands"], ["the car"]], "Where is the car parked?", { moved: ["staat"] }), true, "a word in `moved`");
same(orderDiffers({ literal: [{ text: "We" }, { text: "go", moved: true }], means: "We go." }), true, "a card's chunks are read too");
same(orderDiffers({}), false, "nothing at all");

// Across every pack: how many have something to show, and nothing with chunks that change places counted as the same.
const dir = new URL("../packs/", import.meta.url);
const count = { items: 0, flips: 0, differs: 0, same: 0 };
for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
  const pack = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
  for (const item of pack.items ?? []) {
    if (!item.literal?.length) continue;
    count.items++;
    const flips = flipsOrder(item.english);
    const differs = orderDiffers(item);
    if (flips) count.flips++;
    if (differs) count.differs++;
    else count.same++;
    if (flips && !differs) failures.push(`${pack.id}/${item.id}: its chunks change places, yet nothing to show`);
  }
}
console.log(`packs: ${count.items} sentences, ${count.flips} with a toggle, ${count.differs} with a hint, ${count.same} with neither`);
same(count.items > 20000 && count.flips > 1000 && count.same > 1000, true, "the packs were read: some of each");

for (const failure of failures) console.log(`FAIL  ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
