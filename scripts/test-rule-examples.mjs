// An idea's card never shows its own sentence again beside it (study/rule-examples.js examplesBeside, after-answer.js conceptBody):
// with none of your own sentences to show under More like it, the card falls back on the rule's examples, and one of them can be the very
// sentence it's showing (German's Sie card: "Wollen Sie einen Kaffee?" twice). Its cases: that sentence left out as the language writes
// it, case and marks aside, the others kept in order, the picture's own example left out with no sentence; on every path pack here, each
// sentence's ideas against their language's examples (the library's longer explanations, as the catalog names them): how many could
// show twice before, and none now; and after-answer.js taking its examples from it (a planted line of the code from before caught).
//   node scripts/test-rule-examples.mjs [<app dir>]   another copy's dir to see it fail on one from before (exit 0 = pass)
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.argv[2] ? resolve(process.argv[2]) : HERE;
const helper = await import(pathToFileURL(join(APP, "public/js/study/rule-examples.js")).href).catch(() => null);

let failed = 0;
const test = (name, fn) => {
  try {
    const detail = fn();
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
};
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const texts = (list) => list.map((one) => one.text);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const asWritten = (text) => String(text ?? "").normalize("NFC").toLocaleLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, " ").trim();

test("the module is there: study/rule-examples.js", () => assert(helper?.examplesBeside, "no public/js/study/rule-examples.js examplesBeside in this copy"));

test("the card's sentence left out as written, case and marks aside; the others kept in order; with no sentence, the picture's own first", () => {
  const { examplesBeside } = helper ?? {};
  assert(examplesBeside, "no examplesBeside");
  const sie = [{ text: "Wissen Sie, wo mein Auto steht?" }, { text: "Wollen Sie einen Kaffee?" }, { text: "Dieses Buch ist für Sie." }];
  assert(same(texts(examplesBeside(sie, "Wollen Sie einen Kaffee?")), ["Wissen Sie, wo mein Auto steht?", "Dieses Buch ist für Sie."]), "the card's sentence");
  assert(same(texts(examplesBeside(sie, "wollen sie einen kaffee")), ["Wissen Sie, wo mein Auto steht?", "Dieses Buch ist für Sie."]), "case and end mark aside");
  const usted = [{ text: "¿Sabe usted qué es esto?" }, { text: "Esto es para usted." }];
  assert(same(texts(examplesBeside(usted, "Esto es para usted")), ["¿Sabe usted qué es esto?"]), "Spanish, its end mark aside");
  assert(same(texts(examplesBeside(usted, "Sabe usted qué es esto")), ["Esto es para usted."]), "Spanish, its ¿ ? aside");
  // A sentence sharing words isn't the same sentence (the control).
  assert(same(texts(examplesBeside(sie, "Wollen Sie einen Tee?")), texts(sie)), "another sentence left something out");
  assert(same(texts(examplesBeside(sie, undefined)), texts(sie.slice(1))), "with no sentence, the picture's first");
  assert(same(examplesBeside(undefined, "x"), []), "no examples");
});

test("every path pack's sentences against their language's examples: none shown twice now (and how many could be before)", () => {
  const { examplesBeside } = helper ?? {};
  assert(examplesBeside, "no examplesBeside");
  const seed = JSON.parse(readFileSync(join(APP, "library/catalogue-seed.json"), "utf8"));
  const counts = [];
  const twice = [];
  for (const name of readdirSync(join(APP, "packs")).filter((one) => /^path-[a-z-]+\.json$/.test(one)).sort()) {
    const pack = JSON.parse(readFileSync(join(APP, "packs", name), "utf8"));
    const url = seed.grammar?.[pack.language]?.more?.url;
    const file = url && join(APP, url.replace(/^\/library\//, "library/"));
    if (!file || !existsSync(file)) continue;
    const more = JSON.parse(readFileSync(file, "utf8")).concepts ?? {};
    let before = 0;
    for (const item of pack.items) {
      for (const concept of item.concepts ?? []) {
        const examples = more[concept]?.examples ?? [];
        const isIt = (one) => asWritten(one.text) === asWritten(item.text);
        if (examples.some(isIt)) before++;
        if (examplesBeside(examples, item.text).some(isIt)) twice.push(`${pack.id}/${item.id} (${concept})`);
      }
    }
    counts.push(`${pack.id} ${before}`);
  }
  assert(!twice.length, `${twice.length} shown twice: ${twice.slice(0, 5).join(", ")}`);
  return `sentences that are also one of their idea's examples, which a card could have shown twice: ${counts.join(", ")}`;
});

test("after-answer.js takes More like it's examples from examplesBeside, never the slice from before (a planted line caught)", () => {
  const before = /examples\.slice\(sentence \? 0 : 1\)/;
  const now = /examplesBeside\(examples, sentence\)/;
  assert(before.test("  const unshown = examples.slice(sentence ? 0 : 1);"), "the scan misses the planted line from before");
  const code = readFileSync(join(APP, "public/js/study/after-answer.js"), "utf8");
  assert(!before.test(code), "after-answer.js still slices the examples itself");
  assert(now.test(code), "after-answer.js doesn't take them from examplesBeside");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
