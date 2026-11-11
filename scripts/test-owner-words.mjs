// The owner's own words stay out of this repo, which will be published open source (the name has test-owner-name.mjs). Two parts:
//   1. A run of 8 or more words shared with the planning folder's brief (../brief.md, outside the repo), in any text file that's
//      tracked or would be on the next commit, less the runs kept on purpose (../docs/self-host/history-rewrite/allowed-runs.txt).
//      With no brief beside the app (a clone of the public repo), this part says it's skipped; --require-brief fails instead.
//   2. A comment or a Markdown line that attributes words to the owner by a mark: a parenthesis opening with the possessive and a
//      comma or colon, the possessive before words, note, pick, call, ask, answer or reply, or the pronoun before said, asked,
//      wrote or picked. A quote shorter than 8 words is found only this way. Pack sentences and the language modules are
//      sentences being taught, not remarks, so they're left out.
// The same rules as the release scan (../docs/self-host/release/release-scan.py), fast enough for every freeze.
// Usage: node scripts/test-owner-words.mjs [<app dir>] [--brief <file>] [--allowed <file>] [--require-brief]   (exit 0 = pass)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const BRIEF = option("brief");
const ALLOWED = option("allowed");
const REQUIRE_BRIEF = args.includes("--require-brief");
if (REQUIRE_BRIEF) args.splice(args.indexOf("--require-brief"), 1);
const APP = resolve(args[0] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const briefPath = resolve(BRIEF ?? join(APP, "..", "brief.md"));
const allowedPath = resolve(ALLOWED ?? join(APP, "..", "docs", "self-host", "history-rewrite", "allowed-runs.txt"));
const N = 8;
const NOT_TEXT = /\.(png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|mp3|ogg|wav|m4a|wasm|onnx|bin|pdf|zip|gz|apkg|sqlite)$/i;
const SKIP_DIRS = new Set(["node_modules", ".wrangler", ".git", ".claude", "models", ".state-local"]);
const NOT_REMARKS = ["packs/", "public/js/lang/"];
// The marks, built up from pieces so this file's own lines never carry one.
const HIS = ["h", "is"].join("");
const HE = ["h", "e"].join("");
const MARKED = new RegExp(
  `\\(${HIS}[,:]|\\b${HIS} (?:words|note|notes|pick|call|ask|answer|reply)\\b|\\b${HE} (?:said|asked|wrote|picked)\\b|\\bthe owner (?:said|asked|wrote)\\b`,
  "i",
);
const COMMENT = /^\s*(\/\/|\/\*|\*|#|<!--)/;
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

let failed = 0;
const eq = (actual, want, what) => {
  if (actual === want) return console.log(`ok    ${what}`);
  failed++;
  console.log(`FAIL  ${what}: got ${actual}`);
};

/** A text's words, lower case (the brief's are read the same way). */
const words = (text) => Array.from(text.toLowerCase().matchAll(WORD), (m) => m[0].replace(/’/g, "'"));

/** What a brief is searched by: its runs of N words, and the pairs of words side by side in it. */
function briefIndex(source) {
  const ids = new Map();
  const seq = source.map((w) => {
    let id = ids.get(w);
    if (id === undefined) ids.set(w, (id = ids.size));
    return id;
  });
  const V = ids.size;
  const pairs = new Set();
  for (let i = 0; i + 1 < seq.length; i++) pairs.add(seq[i] * V + seq[i + 1]);
  const grams = new Set();
  for (let i = 0; i + N <= seq.length; i++) grams.add(seq.slice(i, i + N).join(","));
  return { ids, V, pairs, grams };
}

/**
 * The runs of N+ words a text shares with the brief, each as { run, line }. Runs don't overlap: after one, the next starts past
 * its end, as the release scan reads them. Each word is the brief's word number (or none); a run of N needs N-1 pairs in a row
 * that the brief has side by side, so only then is the run itself looked up. Only the last N words are kept, and a run's own.
 */
function sharedRuns(text, { ids, V, pairs, grams }) {
  const lower = text.toLowerCase();
  const found = [];
  const ringWord = new Array(N);
  const ringAt = new Array(N);
  const ringId = new Array(N);
  let count = 0; // words read
  let prev = -1; // the last word's number in the brief, or -1
  let paired = 0; // pairs in a row, ending at the last word, that the brief has side by side
  let run = null; // the words of the run being read
  let runAt = 0;
  let floor = 0; // a new run starts at or after this word
  const close = (at) => {
    if (!run) return;
    found.push({ run: run.join(" "), line: lineAt(lower, runAt) });
    floor = at;
    run = null;
  };
  for (const m of lower.matchAll(WORD)) {
    const w = m[0].includes("’") ? m[0].replace(/’/g, "'") : m[0];
    const id = ids.get(w) ?? -1;
    const index = count++;
    const slot = index % N;
    ringWord[slot] = w;
    ringAt[slot] = m.index;
    ringId[slot] = id;
    paired = id >= 0 && prev >= 0 && pairs.has(prev * V + id) ? paired + 1 : 0;
    prev = id;
    const start = index - N + 1;
    let hit = false;
    if (paired >= N - 1 && start >= floor) {
      let key = String(ringId[start % N]);
      for (let j = start + 1; j <= index; j++) key += `,${ringId[j % N]}`;
      hit = grams.has(key);
    }
    if (!hit) close(index);
    else if (run) run.push(w);
    else {
      run = [];
      for (let j = start; j <= index; j++) run.push(ringWord[j % N]);
      runAt = ringAt[start % N];
    }
  }
  close(count);
  return found;
}

/** Lines that mark words as the owner's: comments anywhere, every line of Markdown, never the languages' sentences. */
function markedLines(file, text) {
  if (NOT_REMARKS.some((dir) => file.startsWith(dir))) return [];
  const markdown = file.endsWith(".md");
  const out = [];
  text.split("\n").forEach((line, i) => {
    if ((markdown || COMMENT.test(line)) && MARKED.test(line)) out.push({ line: i + 1, seen: line.trim().slice(0, 140) });
  });
  return out;
}

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

// ---------- the files: what a commit of this tree would take ----------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(relative(APP, path));
  }
  return out;
}
let files;
try {
  files = execFileSync("git", ["-C", APP, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean);
} catch {
  files = walk(APP).filter((file) => ![".dev.vars", ".land-base.json"].includes(file));
}
eq(files.length > 100, true, `the repo's files are here (${files.length})`);
const texts = [];
for (const file of files) {
  if (NOT_TEXT.test(file)) continue;
  let bytes;
  try {
    bytes = readFileSync(join(APP, file));
  } catch {
    continue; // Deleted, not yet committed.
  }
  if (bytes.includes(0)) continue;
  texts.push([file, bytes.toString("utf8")]);
}

// ---------- 2. words marked as the owner's ----------

// It can fail: planted lines it must find, and lines it must leave alone.
eq(markedLines("x.js", `// Symbols only (${HIS}, 5 Nov: "a quote"): each name stays`).length, 1, "finds a comment with the possessive mark in a parenthesis");
eq(markedLines("x.css", `/* as ${HE} said, the tabs */`).length, 1, "finds a CSS comment with the pronoun and said");
eq(markedLines("x.md", `Per ${HIS} words, the bar stays.`).length, 1, "finds a Markdown line with the possessive and words");
eq(markedLines("x.js", `const said = "${HE} said so";`).length, 0, "leaves a line of code alone (only comments are remarks)");
eq(markedLines("packs/x.json", `// ${HE} said`).length, 0, "leaves the packs' sentences alone");
eq(markedLines("x.js", "// this note is about the owner's account").length, 0, "leaves a comment that only names the owner");
const marked = [];
for (const [file, text] of texts) for (const m of markedLines(file, text)) marked.push(`${file}:${m.line}: ${m.seen}`);
eq(marked.length, 0, "no comment or Markdown line marks words as the owner's");
for (const line of marked) console.log(`      ${line}`);

// ---------- 1. the owner's words, against the brief ----------

if (!existsSync(briefPath)) {
  if (REQUIRE_BRIEF) eq(false, true, `the brief is here (${briefPath})`);
  else console.log(`skip  runs shared with the brief: there's no brief at ${briefPath} (a copy outside the planning folder)`);
} else {
  const source = words(readFileSync(briefPath, "utf8"));
  const brief = briefIndex(source);
  const allowed = existsSync(allowedPath)
    ? readFileSync(allowedPath, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    : [];
  eq(source.length > 1000, true, `the brief is read (${source.length} words, ${allowed.length} runs kept on purpose)`);
  // It can fail: a run taken from the brief now (never written here), planted mid-sentence, is found; the same words out of order aren't.
  const planted = source.slice(200, 211).join(" ");
  const hit = sharedRuns(`Before it,\n${planted.toUpperCase()}, and after.`, brief);
  eq(hit.length === 1 && hit[0].run === planted && hit[0].line === 2, true, "finds an 11-word run planted from the brief, whole, in capitals, on its line");
  eq(sharedRuns(source.slice(200, 211).reverse().join(" "), brief).length, 0, "the same words reversed aren't a run");
  eq(sharedRuns(source.slice(200, 207).join(" "), brief).length, 0, "7 words in a row aren't enough");
  const twice = sharedRuns(`${source.slice(300, 309).join(" ")} and then ${source.slice(500, 508).join(" ")}`, brief);
  eq(twice.length, 2, "two runs in one file are two findings");
  const runs = [];
  for (const [file, text] of texts) {
    for (const r of sharedRuns(text, brief)) {
      if (allowed.some((a) => a.includes(r.run))) continue;
      runs.push(`${file}:${r.line}: ${r.run.slice(0, 160)}`);
    }
  }
  eq(runs.length, 0, "no run of 8+ words is shared with the brief");
  for (const line of runs) console.log(`      ${line}`);
}

console.log(`\n${failed ? `${failed} FAILED` : "all passed"}`);
process.exit(failed ? 1 : 0);
