// What changes when a woven sentence turns whole at 90% known instead of 95% (10 Nov 2026, for the film and the app at release).
// node probe.mjs <app dir> <out dir>
// 1. The rule as weaveSentence computes it (known / total * 100 >= flipAt), against exact integer arithmetic, for every sentence length
//    1–80 and every known count: no float edge, and the fewest known words a sentence needs at each threshold.
// 2. Woven Alice's opening (the library's, its Dutch layer) at the weave audit's banks (the text's 100, 400 and 1,200 most frequent
//    lemmas, as learningOrder orders them with no frequency list loaded): sentences whole at 95 and at 90; and the first page at one
//    bank, both ways, with each newly whole sentence's unknown words.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [APP, OUT] = process.argv.slice(2).map((p) => resolve(p));
mkdirSync(OUT, { recursive: true });
const { weaveSentence } = await import(pathToFileURL(join(APP, "public/js/read/book-format.js")).href);
const { learningOrder } = await import(pathToFileURL(join(APP, "public/js/read/woven-text.js")).href);

const lines = [];
const say = (line = "") => lines.push(line);

// 1. The rule.
const fake = (total, known) => ({ s: 0, t: Array.from({ length: total }, (_, j) => [`w${j}`, `l${j}`]), m: [["x", "x", [0], null]], u: [] });
let mismatches = 0;
const fewest = { 95: {}, 90: {} };
for (const at of [95, 90]) {
  for (let total = 1; total <= 80; total++) {
    for (let known = 0; known <= total; known++) {
      const set = new Set(Array.from({ length: known }, (_, j) => `l${j}`));
      const flipped = weaveSentence(fake(total, known), [], set, { flipAt: at }).flipped;
      const exact = known * 100 >= at * total;
      if (flipped !== exact) mismatches++;
      if (flipped && fewest[at][total] === undefined) fewest[at][total] = known;
    }
  }
}
say(`# Flip at 90% instead of 95%`);
say();
say(`## The rule`);
say(`weaveSentence: whole when known / total × 100 >= the threshold, total being the sentence's words with a lemma (a verb group's words each`);
say(`count). Against exact integer arithmetic for every sentence of 1–80 such words and every known count: ${mismatches} differences.`);
say();
say(`| words in the sentence | 2 | 4 | 5 | 8 | 9 | 10 | 12 | 15 | 19 | 20 | 25 | 30 | 40 |`);
say(`|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
for (const at of [95, 90]) {
  say(`| known to turn whole at ${at}% | ${[2, 4, 5, 8, 9, 10, 12, 15, 19, 20, 25, 30, 40].map((n) => `${fewest[at][n]} (${n - fewest[at][n]} unknown)`).join(" | ")} |`);
}
say();

// 2. Alice.
const dir = join(APP, "library/books/carroll-alice-wonderland-opening");
const version = readdirSync(dir)[0];
const book = JSON.parse(readFileSync(join(dir, version, "book.json"), "utf8"));
const weaveFile = readdirSync(join(dir, version)).find((f) => f.startsWith("weave.nl."));
const weave = JSON.parse(readFileSync(join(dir, version, weaveFile), "utf8"));
const order = learningOrder(weave, "nl");
say(`## Woven Alice's opening (${book.title}; ${weave.sentences.length} sentences, ${order.length} lemmas)`);
say();
say(`| bank (most frequent lemmas of the text) | whole at 95% | whole at 90% | newly whole |`);
say(`|---|---|---|---|`);
const banks = [100, 120, 140, 160, 180, 200, 210, 220, 230, 240, 246, 400, 1200];
for (const n of banks) {
  const known = new Set(order.slice(0, n));
  const at95 = weave.sentences.filter((sentence) => weaveSentence(sentence, book.words, known, { flipAt: 95 }).flipped).length;
  const at90 = weave.sentences.filter((sentence) => weaveSentence(sentence, book.words, known, { flipAt: 90 }).flipped).length;
  say(`| ${n} | ${at95} | ${at90} | ${at90 - at95} |`);
}
say();

// A learner's bank: the Dutch frequency list's first N lemmas (the course teaches in about that order), so a text's unknown words are
// scattered, not its own rarest last.
const list = JSON.parse(readFileSync(join(APP, "library/lists", readdirSync(join(APP, "library/lists")).find((f) => /^frequency\.nl\..*\.json$/.test(f))), "utf8"));
const top = list.lemmas.map(([lemma]) => lemma);
say(`A learner's bank: the course's Dutch frequency list, its first N lemmas.`);
say();
say(`| bank (the list's first N) | the text's words known | whole at 95% | whole at 90% | newly whole |`);
say(`|---|---|---|---|---|`);
for (const n of [250, 500, 1000, 2000, 3000, 5000, 8000, 12000, 20000]) {
  const bank = new Set(top.slice(0, n));
  let have = 0, all = 0;
  for (const sentence of weave.sentences) for (const [, lemma] of sentence.t) if (lemma) { all++; if (bank.has(lemma)) have++; }
  const at95 = weave.sentences.filter((sentence) => weaveSentence(sentence, book.words, bank, { flipAt: 95 }).flipped).length;
  const at90 = weave.sentences.filter((sentence) => weaveSentence(sentence, book.words, bank, { flipAt: 90 }).flipped).length;
  say(`| ${n} | ${((have / all) * 100).toFixed(1)}% | ${at95} | ${at90} | ${at90 - at95} |`);
}
say();

// The first page at one bank: every sentence of the first paragraphs, both ways, and each newly whole one's unknown words.
const BANK = Number(process.env.BANK ?? 3000);
const PARAS = Number(process.env.PARAS ?? 6);
const known = new Set(top.slice(0, BANK));
const bySentence = new Map(weave.sentences.map((sentence) => [sentence.s, sentence]));
const text = (shown) => shown.words.filter((piece) => piece.show !== "hidden").map((piece) => (piece.show === "target" ? `**${piece.text}**` : piece.text)).join(" ");
say(`## The first page knowing the list's first ${BANK} (the first ${PARAS} paragraphs; Dutch in bold)`);
say();
let changed = 0;
for (const para of book.paras.filter((p) => p.e > p.s).slice(0, PARAS)) {
  for (const [s] of book.sentences) {
    if (s < para.s || s >= para.e) continue;
    const sentence = bySentence.get(s);
    if (!sentence) continue;
    const at95 = weaveSentence(sentence, book.words, known, { flipAt: 95, lang: "nl", from: weave.from });
    const at90 = weaveSentence(sentence, book.words, known, { flipAt: 90, lang: "nl", from: weave.from });
    const share = `${at90.known}/${at90.total} = ${((at90.known / at90.total) * 100).toFixed(1)}%`;
    if (at95.flipped === at90.flipped) {
      say(`- (${share}, ${at90.flipped ? "whole both ways" : "the same both ways"}) ${text(at90)}`);
      continue;
    }
    changed++;
    const unknown = sentence.t.map(([target, lemma], j) => ({ en: book.words[s + j], target, lemma })).filter((w) => w.lemma && !known.has(w.lemma));
    say(`- **NEWLY WHOLE at 90** (${share}):`);
    say(`  - at 95: ${text(at95)}`);
    say(`  - at 90: ${text(at90)}`);
    say(`  - its unknown word${unknown.length === 1 ? "" : "s"}: ${unknown.map((w) => `"${w.en}" → ${w.target} (${w.lemma})`).join(", ")}`);
  }
}
say();
say(`${changed} sentence(s) on this page turn whole at 90 that didn't at 95.`);
writeFileSync(join(OUT, `alice-${BANK}.md`), lines.join("\n") + "\n");
console.log(lines.join("\n"));
process.exit(0);
