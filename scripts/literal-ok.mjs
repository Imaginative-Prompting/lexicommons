// The word-for-word lines a game takes as right too (public/js/lang/literal-ok.<code>.js), written from the lines judged
// (scripts/fixtures/literal-judged.<code>.json: every reworded sentence's word-for-word line in English order, by its exact text, true
// when it's acceptable English for the sentence, false when not). A newly judged line goes in the fixture, then this writes the game's
// file; --check only says whether the file is what the fixture gives (test-study.mjs checks it too).
//   node scripts/literal-ok.mjs [--check] [--lang nl]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const lang = process.argv.includes("--lang") ? process.argv[process.argv.indexOf("--lang") + 1] : "nl";
const fixture = join(APP, `scripts/fixtures/literal-judged.${lang}.json`);
const out = join(APP, `public/js/lang/literal-ok.${lang}.js`);

/** The game's file for a fixture: per pack, each sentence's acceptable lines, sentences in the fixture's order. */
export function literalOkText(judged) {
  const packs = {};
  for (const [pack, sentences] of Object.entries(judged)) {
    if (pack === "about") continue;
    const ok = Object.entries(sentences)
      .map(([id, lines]) => [id, Object.keys(lines).filter((line) => lines[line] === true)])
      .filter(([, lines]) => lines.length);
    packs[pack] = Object.fromEntries(ok);
  }
  return (
    `// The reworded sentences whose word-for-word line, in English order, is acceptable English for the sentence ("I drink a coffee" for "Ik drink\n` +
    `// een koffie", whose English is "I'm having a coffee"), by pack and sentence: a game takes that line as a right answer too (lesson.js alsoAnswer).\n` +
    `// Only while the sentence's line is exactly one listed, so a sentence whose line changes is judged again. Written by scripts/literal-ok.mjs from\n` +
    `// scripts/fixtures/literal-judged.${lang}.json; never edit it here.\n` +
    `export default ${JSON.stringify(packs)};\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = literalOkText(JSON.parse(readFileSync(fixture, "utf8")));
  const now = (() => {
    try {
      return readFileSync(out, "utf8");
    } catch {
      return null;
    }
  })();
  if (process.argv.includes("--check")) {
    console.log(now === text ? `${out}: as the fixture gives` : `${out}: not what the fixture gives; run node scripts/literal-ok.mjs`);
    process.exit(now === text ? 0 : 1);
  }
  writeFileSync(out, text);
  const count = Object.values(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1))).reduce((n, pack) => n + Object.values(pack).flat().length, 0);
  console.log(`${out}: ${count} lines${now === text ? ", unchanged" : ""}`);
}
