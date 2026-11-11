// lx-app (scratch only): every "object pronoun shown alone" the app's add_weave check (split-forms.generated.ts, the pipeline's own) finds in
// the books pipeline's judged Dutch layers, with the English word after it and the lemma the layer gave. node survey-pronouns.ts <work> <app>
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [WORK, APP] = process.argv.slice(2).map((p) => resolve(p));
const { splitForms } = await import(pathToFileURL(join(APP, "src/split-forms.generated.ts")).href);
const { WEAVE_SPLIT } = await import(pathToFileURL(join(APP, "src/weave-rules.generated.ts")).href);
const { validateWeave } = await import(pathToFileURL(join(APP, "public/js/read/book-format.js")).href);
const books = new Map();
const layers = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/^weave\.nl\.[0-9a-f]+\.json$/.test(e.name)) layers.push(p);
    else if (dir.endsWith("/book") && e.name.endsWith(".json")) books.set(e.name, p);
  }
};
walk(WORK);
const found = [];
let used = 0;
for (const path of layers) {
  const layer = JSON.parse(readFileSync(path, "utf8"));
  if (layer.kind !== "weave") continue;
  const bookFile = books.get(`${layer.book}.${layer.bookVersion}.json`);
  if (!bookFile) continue;
  const book = JSON.parse(readFileSync(bookFile, "utf8"));
  if ((await validateWeave(layer, book)).length) continue;
  used++;
  for (const f of splitForms(book, layer, WEAVE_SPLIT.nl)) {
    if (f.kind !== "word:pronoun-alone") continue;
    const s = layer.sentences[f.x];
    const words = book.words.slice(s.s, s.e);
    const j = s.t.findIndex((e, k) => e === f.gloss || (words[k] === f.english && e[0] === f.gloss[0]));
    found.push({ layer: path.split("/work/")[1], x: f.x, english: f.english, gloss: f.gloss, next: words[j + 1] ?? null, prev: words[j - 1], text: words.join(" ").slice(0, 120) });
  }
}
const bare = (w) => String(w ?? "").replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").toLowerCase();
const her = found.filter((f) => bare(f.english) === "her");
const own = her.filter((f) => typeof f.gloss[1] === "string" && f.gloss[1] === bare(f.gloss[0]));
const kept = her.filter((f) => !own.includes(f));
const lemmas = (list) => list.reduce((a, f) => ((a[f.gloss[1]] = (a[f.gloss[1]] ?? 0) + 1), a), {});
console.log(JSON.stringify({ layers: used, findings: found.length, her: her.length, letThrough: own.length, letThroughLemmas: lemmas(own), stillFlagged: kept.length, stillFlaggedLemmas: lemmas(kept), otherWordsUnchanged: found.length - her.length }));
const sample = (list, n) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n);
console.log("LET THROUGH (sample):");
for (const f of sample(own, 25)) console.log(`  ${f.english}→${f.gloss.join("/")} | next ${f.next} | ${f.text.slice(0, 90)}`);
console.log("STILL FLAGGED (sample):");
for (const f of sample(kept, 12)) console.log(`  ${f.english}→${f.gloss.join("/")} | next ${f.next} | ${f.text.slice(0, 90)}`);
process.exit(0);
