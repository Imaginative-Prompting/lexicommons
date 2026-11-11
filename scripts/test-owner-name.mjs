// The owner's name stays out of this repo, which will be published open source: no text file that's tracked, or would be
// on the next commit, has it as a whole word, in any case. A word it's only part of doesn't count. In a working copy with no
// .git, every file but the ones git ignores here. Usage: node scripts/test-owner-name.mjs [<app dir>]   (exit 0 = pass)
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
// Built up, so this file doesn't say it either.
const NAME = ["aus", "tin"].join("");
const PATTERN = new RegExp(`\\b${NAME}\\b`, "i");
const NOT_TEXT = /\.(png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|mp3|ogg|wav|m4a|wasm|onnx|bin|pdf|zip)$/i;
const SKIP_DIRS = new Set(["node_modules", ".wrangler", ".git", ".claude", "models"]);

let failed = 0;
const eq = (actual, want, what) => {
  if (actual === want) return console.log(`ok    ${what}`);
  failed++;
  console.log(`FAIL  ${what}: got ${actual}`);
};

// It can fail: the rule itself, on what it should and shouldn't find.
const title = (word) => word[0].toUpperCase() + word.slice(1);
eq(PATTERN.test(`${title(NAME)}'s pick`), true, "finds the name with a capital and an apostrophe");
eq(PATTERN.test(`from ${NAME.toUpperCase()} on`), true, "finds it in capitals");
eq(PATTERN.test(`ex${"haus"}${"ting"} a${"us"}tere`), false, "not a word it's only part of");

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

const found = [];
for (const file of files) {
  if (NOT_TEXT.test(file)) continue;
  let bytes;
  try {
    bytes = readFileSync(join(APP, file));
  } catch {
    continue; // Deleted, not yet committed.
  }
  if (bytes.includes(0)) continue;
  bytes.toString("utf8").split("\n").forEach((line, i) => {
    if (PATTERN.test(line)) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`);
  });
}
eq(found.length, 0, "the name is in no text file");
for (const line of found) console.log(`      ${line}`);

console.log(`\n${failed ? `${failed} FAILED` : "all passed"}`);
process.exit(failed ? 1 : 0);
