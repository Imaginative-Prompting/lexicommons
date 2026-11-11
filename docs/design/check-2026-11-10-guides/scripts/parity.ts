// lx-app (scratch only): the app's weave-answer.js against the books pipeline's own conversion (pipelines/books/lib/check.ts makeChecker), on
// every real "weave" layer in pipelines/books/work: each stored layer back into the answer form, then through both; the stored sentences, the
// pipeline's and the app's must be equal. Then planted answers (punctuation cue, curly apostrophe, a reading with punctuation) through both.
//   node scratch/lx-app/guides/parity.ts <work dir> <app copy dir>
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [WORK, APP] = process.argv.slice(2).map((p) => resolve(p));
const { makeChecker } = await import(pathToFileURL(resolve(WORK, "../lib/check.ts")).href);
const { weaveFromAnswer, answerFromWeave } = await import(pathToFileURL(join(APP, "src/weave-answer.ts")).href);
const { validateWeave } = await import(pathToFileURL(join(APP, "public/js/read/book-format.js")).href);

const layers: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p);
    else if (/^weave\.[a-z-]+\.[0-9a-f]+\.json$/.test(name.name)) layers.push(p);
  }
};
walk(WORK);
const books = new Map<string, string>();
const walkBooks = (dir: string) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) { if (name.name !== "runs" && name.name !== "pictures" && name.name !== "source") walkBooks(p); }
    else if (dir.endsWith("/book") && name.name.endsWith(".json")) books.set(name.name, p);
  }
};
walkBooks(WORK);

let compared = 0, sentences = 0, skipped = 0, bad = 0;
const byLang: Record<string, number> = {};
const report: any[] = [];
for (const path of layers.sort()) {
  const layer = JSON.parse(readFileSync(path, "utf8"));
  if (layer.kind !== "weave") { skipped++; continue; }
  const bookFile = books.get(`${layer.book}.${layer.bookVersion}.json`) ?? "";
  if (!bookFile || !existsSync(bookFile)) { skipped++; report.push({ path, skipped: "no book file" }); continue; }
  const book = JSON.parse(readFileSync(bookFile, "utf8"));
  // Only layers today's contract takes (older pilots predate the literal line).
  const invalid = await validateWeave(layer, book);
  if (invalid.length) { skipped++; report.push({ path, skipped: `fails today's check (${invalid.length}): ${invalid[0].slice(0, 120)}` }); continue; }
  const answer = answerFromWeave(book, layer);
  const check = makeChecker({ book, kind: "weave", to: layer.to, keep: new Set(), coinages: new Set() });
  const theirs = await check(answer.sentences.map((s: any) => s.x), answer);
  const ours = await weaveFromAnswer(book, layer.to, answer);
  // Stored layers by content: a later stage (settle) may write a sentence's keys in another order (c before u).
  const canon = (v: any): any => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  const stored = JSON.stringify(canon(layer.sentences));
  const a = JSON.stringify(theirs.sentences), b = JSON.stringify(ours.weave?.sentences);
  const ok = a === b && JSON.stringify(canon(ours.weave?.sentences)) === stored && ours.problems.length === 0;
  const appEqualsStored = JSON.stringify(canon(ours.weave?.sentences)) === stored;
  if (!ok) {
    bad++;
    const at = (ours.weave?.sentences ?? []).findIndex((s: any, x: number) => JSON.stringify(s) !== JSON.stringify(theirs.sentences[x]) || JSON.stringify(s) !== JSON.stringify(layer.sentences[x]));
    report.push({ path, ok, pipelineEqualsApp: a === b, appEqualsStored, problems: ours.problems.slice(0, 3), firstDiff: at, pipeline: theirs.sentences[at], app: ours.weave?.sentences?.[at], stored: layer.sentences[at] });
  }
  compared++;
  sentences += layer.sentences.length;
  byLang[layer.to] = (byLang[layer.to] ?? 0) + 1;
}

// Planted answers: what the pipeline normalizes, both ways the same.
const plantBook = { id: "plant", version: "0000000000000000", lang: "en", words: ["“Don’t", "go,”", "she", "said."], sentences: [[0, 4]] };
const plant = (to: string, t: any[], m: any[]) => ({ sentences: [{ x: 0, t, text: m.map((e: any) => e.target).join(to === "ja" ? "" : " "), m, u: [], c: [] }] });
const plants = [
  ["nl", plant("nl", [{ w: "“Don’t", target: "“Ga", lemma: "gaan" }, { w: "go,”", target: "niet,”", lemma: "niet" }, { w: "she", target: "zei", lemma: "zeggen" }, { w: "said.", target: "ze.", lemma: "ze" }],
    [{ target: "“Ga", cue: "go", sources: [1], lemma: "gaan" }, { target: "niet,”", cue: "don’t", sources: [0], lemma: "niet" }, { target: "zei", cue: "said", sources: [3], lemma: "zeggen" }, { target: "ze.", cue: "she", sources: [2], lemma: "z’e" }, { target: "—", cue: "x", sources: [], lemma: "x" }])],
  ["ja", plant("ja", [{ w: "“Don’t", target: "「行か", lemma: "行く", reading: "「いか" }, { w: "go,”", target: "ないで、」", lemma: "ない" }, { w: "she", target: "彼女は", lemma: "彼女", reading: "かのじょ。" }, { w: "said.", target: "言った。", lemma: "言う", reading: "いった" }],
    [{ target: "「行かないで」と", cue: "go", sources: [1], lemma: "行く", reading: "「いかないで」と" }, { target: "彼女は言った。", cue: "she said", sources: [2, 3], lemma: "言う", reading: "、" }])],
];
const plantResults = [];
for (const [to, answer] of plants as [string, any][]) {
  const theirs = await makeChecker({ book: plantBook, kind: "weave", to, keep: new Set(), coinages: new Set() })([0], answer);
  const ours = await weaveFromAnswer(plantBook, to, answer);
  const same = JSON.stringify(theirs.sentences) === JSON.stringify(ours.weave.sentences);
  if (!same) bad++;
  plantResults.push({ to, same, pipeline: theirs.sentences[0], app: ours.weave.sentences[0] });
}

const summary = { layers: layers.length, compared, skipped, sentences, byLang, mismatched: bad, plants: plantResults.map((p) => ({ to: p.to, same: p.same })) };
console.log(JSON.stringify(summary, null, 1));
writeFileSync(join(import.meta.dirname, "parity-results.json"), JSON.stringify({ summary, report, plantResults }, null, 1));
process.exit(bad ? 1 : 0);
