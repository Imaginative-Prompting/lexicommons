// lx-app (scratch only): the three AI guides as their tools serve them, to Markdown for the director's read. The library's grammar is
// installed first (as the live Worker has it), so the weave guide's pattern list is today's.
//   node render-guides.mjs <app copy> <outDir>
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const APP = resolve(process.argv[2]);
const OUT = resolve(process.argv[3]);
const { workerEnv } = await import(pathToFileURL(join(APP, "scripts/fixtures/worker-env.mjs")).href);
workerEnv();
await import(pathToFileURL(join(APP, "scripts/fixtures/library-grammar.mjs")).href);
const { packGuide } = await import(pathToFileURL(join(APP, "src/pack-guide.ts")).href);
const { textGuide } = await import(pathToFileURL(join(APP, "src/text-guide.ts")).href);
const { weaveGuide } = await import(pathToFileURL(join(APP, "public/js/lang/grammar.js")).href).then(async (g) => {
  const mod = await import(pathToFileURL(join(APP, "src/weave-guide.ts")).href);
  const now = g.grammarNow("nl");
  const patterns = Object.fromEntries(Object.entries(now.patterns).filter(([, p]) => !p.retired).map(([id, p]) => [id, { name: p.name, about: p.about }]));
  console.log(`nl grammar revision ${now.revision}: ${Object.keys(patterns).length} patterns`);
  return { weaveGuide: () => mod.weaveGuide("nl", patterns) };
});
writeFileSync(join(OUT, "get_pack_guide.md"), packGuide().guide + "\n");
writeFileSync(join(OUT, "get_text_guide.md"), textGuide());
const w = weaveGuide();
writeFileSync(join(OUT, "get_weave_guide-nl.md"), `${w.guide}\n`);
for (const f of ["get_pack_guide.md", "get_text_guide.md", "get_weave_guide-nl.md"]) console.log(f);
