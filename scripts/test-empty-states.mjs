// Every empty state shows Tinta in a pose that fits its words (docs/design/retention/tinta-places.md): no bare
// `part: "empty-state"` outside ui.emptyState itself, the design page, and the ones left out on purpose (loading is
// lex-character's, an error message lex-mascots', the reader's two have no Tinta), and every ui.emptyState call names a
// pose lex-retention's states have (or plays a reaction). In Node: `node scripts/test-empty-states.mjs` (exit 0 = pass).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const JS = new URL("../public/js/", import.meta.url).pathname;
const POSES = new Set(["lounge", "page", "box", "shrug", "off", "doze", "idle"]);
// Left out on purpose, by what they say.
const LEFT_OUT = [/"Loading/, /error\.message/, /wordsFor\(error\)/, /every word in this text's list/, /Hold a word in the text/];
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".js")) files.push(path);
  }
};
walk(JS);
let failed = 0, bare = 0, calls = 0;
for (const path of files) {
  const rel = relative(JS, path);
  if (rel === "lx/ui.js" || rel === "design.js") continue;
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes('part: "empty-state"')) {
      bare++;
      if (!LEFT_OUT.some((re) => re.test(line))) {
        failed++;
        console.log(`FAIL  ${rel}:${i + 1}: an empty state without Tinta: ${line.trim().slice(0, 140)}`);
      }
    }
    // An empty state with its drawing (settings.js drawnEmpty): the same rule, its pose its last argument.
    for (const m of line.matchAll(/\bdrawnEmpty\(/g)) {
      if (/export function drawnEmpty/.test(line)) continue;
      calls++;
      const rest = lines.slice(i, i + 3).join(" ");
      const pose = rest.match(/, "(\w+)"\)/);
      if (!pose || !POSES.has(pose[1])) {
        failed++;
        console.log(`FAIL  ${rel}:${i + 1}: drawnEmpty with no pose lex-retention's states have`);
      }
    }
    for (const m of line.matchAll(/ui\.emptyState\(/g)) {
      if (rel === "shell/settings.js" && /ui\.emptyState\(words, \{ pose \}\)/.test(line)) continue; // drawnEmpty's own, its callers held above
      calls++;
      const rest = lines.slice(i, i + 12).join(" "); // a call spanning lines: its options come at its end
      const pose = rest.match(/pose: (?:[^,}]*\? )?"(\w+)"(?: : "(\w+)")?/);
      const react = /react: "\w+"/.test(rest);
      const plan = /pose: plan\.pose/.test(rest);
      if (!pose && !react && !plan) {
        failed++;
        console.log(`FAIL  ${rel}:${i + 1}: ui.emptyState with no pose`);
      } else if (pose && ![pose[1], pose[2]].filter(Boolean).every((p) => POSES.has(p))) {
        failed++;
        console.log(`FAIL  ${rel}:${i + 1}: a pose lex-retention's states don't have: ${pose[0]}`);
      }
    }
  });
}
// The session's: every empty plan names its pose.
const plan = readFileSync(join(JS, "study/plan.js"), "utf8");
const empties = plan.split("\n").filter((l) => /empty: /.test(l) && !/^\s*(\/\/|\*)/.test(l));
for (const line of empties) if (!/pose: "(lounge|off|shrug)"/.test(line)) { failed++; console.log(`FAIL  study/plan.js: an empty plan with no pose: ${line.slice(0, 120)}`); }
console.log(`${failed ? "FAIL" : "ok  "}  ${calls} empty states with Tinta, ${bare} left out on purpose, ${empties.length} empty plans with a pose`);
console.log(`${failed ? 0 : 1}/1 passed`);
process.exit(failed ? 1 : 0);
