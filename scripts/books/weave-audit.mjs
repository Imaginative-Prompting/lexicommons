#!/usr/bin/env node
// The weave audit: deterministic, no model, the whole weave. It renders the weave the way the reader does
// (weaveSentence, from public/js/read/book-format.js) for several sets of known words, and counts what a learner
// would hit. Two invariants must be zero; everything else is reported for a person to look at, because each of those
// checks can also flag right answers (that's why they're here and not in the validator). The audit itself is
// public/js/read/weave-audit.js (pure), so the Worker's library publishing runs the same one; this is its command line.
//
//   node scripts/books/weave-audit.mjs --book <book.json> --weave <weave.json> [--keep <glossary.json>]
//        [--lexicon <lexicon.json>] [--out <report.json>] [--samples 6]
//
// Banks: nothing known, the 100, 400 and 1,200 most frequent lemmas of this weave, and everything. Defects hide in
// the middle: with nothing known nothing substitutes, and with everything known every word does.
// Exit 0 = the invariants hold (the report can still list things to read).

import { readFileSync, writeFileSync } from "node:fs";
import { auditWeave } from "../../public/js/read/weave-audit.js";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (!arg("book") || !arg("weave")) {
  console.error("Usage: weave-audit.mjs --book <book.json> --weave <weave.json> [--keep <glossary.json>] [--lexicon <lexicon.json>] [--out <report.json>]");
  process.exit(2);
}
const book = JSON.parse(readFileSync(arg("book"), "utf8"));
const weave = JSON.parse(readFileSync(arg("weave"), "utf8"));
const keep = arg("keep") ? JSON.parse(readFileSync(arg("keep"), "utf8")).keep : [];
const lexicon = arg("lexicon") ? JSON.parse(readFileSync(arg("lexicon"), "utf8")) : null;
const samples = Number(arg("samples") ?? 6);
const help = weave.kind === "help";

const { report, problems } = await auditWeave(book, weave, { keep, lexicon, samples });
const ok = report.ok;
const silent = report.invariants["known-but-silent"];
const leaked = report.invariants["unknown-shown"];
const doubled = report.invariants.doubled;
if (arg("out")) writeFileSync(arg("out"), JSON.stringify(report, null, 2) + "\n");

console.log(`weave audit: ${report.book} → ${weave.to}: ${ok ? "invariants hold" : "FAILED"}`);
if (!report.valid) console.log(`  validation: ${problems.length} problem(s)\n    ${problems.slice(0, 5).join("\n    ")}`);
console.log(`  known-but-silent ${silent}, unknown-shown ${leaked}, doubled ${doubled}   (all must be 0)`);
const learnedIn = help ? book.lang : weave.to;
for (const [name, b] of Object.entries(report.banks)) console.log(`  bank ${name.padEnd(8)} ${String(b.lemmas).padStart(5)} lemmas: ${String(b.shownInTarget).padStart(5)}% of learnable words in ${learnedIn}, ${b.sentencesFullyKnown} sentences fully known`);
for (const [kind, f] of Object.entries(report.findings)) {
  if (kind === "known-but-silent" || kind === "unknown-shown") continue;
  console.log(`  ${kind}: ${f.count}`);
  for (const s of f.samples) console.log(`      ${JSON.stringify(s)}`);
}
process.exit(ok ? 0 : 1);
