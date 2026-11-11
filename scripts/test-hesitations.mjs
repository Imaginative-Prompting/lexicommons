// A word the sentence says is never dropped as a hesitation (speech/match.js: um, uh, oh and the like are dropped from what's typed or
// heard, but only beyond the sentence's own uses of each, the last ones heard kept): every sentence of every pack in packs/ with such a word
// (Portuguese's um, a; German's um, at; Dutch's Oh,) right typed exactly (study/typed.js) and said exactly (the matcher); and the controls:
// a hesitation the sentence hasn't got still dropped, one doubled dropped to the sentence's count, the word itself left out still missing.
//   node scripts/test-hesitations.mjs [<app dir>]   another copy's dir to see it fail on one from before (exit 0 = pass)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.argv[2] ? resolve(process.argv[2]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);
await from("scripts/fixtures/library-grammar.mjs");
const { savePack } = await from("public/js/study/packs.js");
const { setLearning } = await from("public/js/study/learning.js");
const content = await from("public/js/study/content.js");
const { typedResult } = await from("public/js/study/typed.js");
const { typedRight } = await from("public/js/study/attribute.js");
const { match } = await from("public/js/speech/match.js");

let failed = 0;
async function test(name, fn) {
  try {
    const said = await fn();
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(error.message ?? error).split("\n").join("\n      ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

// The words the matcher takes for hesitations (speech/match.js FILLERS), as a sentence's word would be compared.
const HESITATIONS = new Set(["eh", "ehm", "euh", "uh", "uhm", "um", "hm", "hmm", "mm", "mmm", "ah", "oh"]);
const plain = (text) => String(text).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLocaleLowerCase();
const packs = readdirSync(join(APP, "packs"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(APP, "packs", name), "utf8")))
  .filter((pack) => (pack.items ?? []).some((item) => (item.words ?? []).some(([text]) => HESITATIONS.has(plain(text)))));

await test("every pack's sentences with a word that's also a hesitation: right typed exactly and said exactly", async () => {
  const counts = [];
  const bad = [];
  for (const pack of packs) {
    const saved = await savePack(pack);
    assert(saved.ok, `${pack.id}: ${JSON.stringify(saved.errors?.slice(0, 1))}`);
    setLearning(pack.language);
    await new Promise((done) => setTimeout(done, 20));
    const mine = content.ITEMS.filter((item) => item.id === `${pack.id}/${item.id.split("/").pop()}` || pack.items.some((one) => one.id === item.id));
    let n = 0;
    for (const item of mine) {
      if (!(item.words ?? []).some(([text]) => HESITATIONS.has(plain(text)))) continue;
      n++;
      const text = content.sentence(item);
      if (!typedRight(typedResult(item, text, true)) || !typedRight(typedResult(item, text, false))) bad.push(`${pack.id}/${item.id}: "${text}" typed`);
      if (!match(text, text, { lang: pack.language }).ok) bad.push(`${pack.id}/${item.id}: "${text}" said`);
    }
    counts.push(`${pack.id} ${n}`);
  }
  assert(packs.length >= 7, `only ${packs.length} packs have such a word`);
  assert(bad.length === 0, `${bad.length} wrong:\n${bad.slice(0, 12).join("\n")}`);
  return counts.join(", ");
});

await test("the controls: a hesitation the sentence hasn't got still dropped; one doubled dropped to the sentence's count; the word itself left out still missing", () => {
  const ok = (expected, heard, lang) => match(expected, heard, { lang }).ok;
  assert(ok("Ik ben te laat.", "uh ik ben te laat", "nl"), "uh before Ik ben te laat isn't dropped");
  assert(ok("Ik ben te laat.", "ik ben uhm te laat", "nl"), "uhm inside Ik ben te laat isn't dropped");
  assert(ok("Um café, por favor.", "um café por favor", "pt"), "Um café: its um dropped");
  assert(ok("Um café, por favor.", "um um café por favor", "pt"), "um, um café: the doubled um isn't dropped to one");
  const doubled = match("Um café, por favor.", "um um café por favor", { lang: "pt" });
  assert(doubled.extra.length === 0, `um, um café left ${JSON.stringify(doubled.extra)} over`);
  assert(!ok("Um café, por favor.", "café por favor", "pt"), "Um café with its um left out is right");
  assert(!ok("Um café e um chá.", "um café e chá", "pt"), "two ums with one said is right");
  assert(ok("Um café e um chá.", "um café e um chá", "pt"), "two ums said is wrong");
  assert(ok("Oh, wat een gek ding!", "oh oh wat een gek ding", "nl"), "Oh, oh: not dropped to one");
  assert(ok("Ich stehe um sieben Uhr auf.", "ich stehe um sieben uhr auf", "de"), "German um (at) dropped");
  assert(!ok("Ich stehe um sieben Uhr auf.", "ich stehe sieben uhr auf", "de"), "German um left out is right");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
