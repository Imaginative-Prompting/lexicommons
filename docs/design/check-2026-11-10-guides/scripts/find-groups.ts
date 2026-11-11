// lx-app (scratch only): short sentences of the judged Dutch layers that show a verb group (will/would/shall + verb, an idiom upgrade over it)
// or a perfect with an adverb inside (have/has/had + already/never/just + participle), each passing every check add_weave makes.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [WORK, APP] = process.argv.slice(2).map((p) => resolve(p));
const { splitForms } = await import(pathToFileURL(join(APP, "src/split-forms.generated.ts")).href);
const { WEAVE_SPLIT } = await import(pathToFileURL(join(APP, "src/weave-rules.generated.ts")).href);
const { validateWeave } = await import(pathToFileURL(join(APP, "public/js/read/book-format.js")).href);
const books = new Map(), layers = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/^weave\.nl\.[0-9a-f]+\.json$/.test(e.name)) layers.push(p); else if (d.endsWith("/book") && e.name.endsWith(".json")) books.set(e.name, p); } };
walk(WORK);
const bare = (w) => String(w).toLowerCase().replace(/[^a-z']/g, "");
const out = { group: [], perfect: [] };
for (const path of layers.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)) {
  const layer = JSON.parse(readFileSync(path, "utf8"));
  if (layer.kind !== "weave") continue;
  const bf = books.get(`${layer.book}.${layer.bookVersion}.json`);
  if (!bf) continue;
  const book = JSON.parse(readFileSync(bf, "utf8"));
  if ((await validateWeave(layer, book)).length) continue;
  const flagged = new Set(splitForms(book, layer, WEAVE_SPLIT.nl).map((f) => f.x));
  layer.sentences.forEach((s, x) => {
    const words = book.words.slice(s.s, s.e);
    if (flagged.has(x) || words.length > 16 || words.length < 4) return;
    words.forEach((w, k) => {
      if (["will", "would", "shall"].includes(bare(w)) && s.t[k][1] && s.t[k][1] !== "zullen" && (s.u ?? []).some(([uk, len]) => k >= uk && k < uk + len) && out.group.length < 0)
        out.group.push({ path: path.split("/work/")[1], x, en: words.join(" "), nl: s.text, t: s.t, m: s.m, u: s.u, c: s.c });
      if (["have", "has", "had"].includes(bare(w)) && ["already", "never", "just", "always"].includes(bare(words[k + 1] ?? "")) && out.perfect.length < 6)
        out.perfect.push({ path: path.split("/work/")[1], x, en: words.join(" "), nl: s.text, t: s.t, m: s.m, u: s.u, c: s.c });
    });
  });
}
for (const kind of ["group", "perfect"]) for (const f of out[kind]) console.log(kind.toUpperCase(), f.path.split("/")[0], "|", f.en, "|", f.nl, "| t", JSON.stringify(f.t), "| u", JSON.stringify(f.u ?? []));
process.exit(0);
