// The study modules Node's own tests load (the plan and what it imports) load in plain Node: no DOM, no window, no localStorage. On 5 Nov 2026 the plan
// came to import a module that drew on the page (lx/ui.js, whose motion.js reads document as it loads), and every test of the plan died with "document is
// not defined". Each module here is imported in a fresh Node with nothing set up, and must load (it exits as soon as it has: some keep timers going). Exit 0 = pass.
//   node scripts/test-node-imports.mjs
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MODULES = [
  "public/js/study/plan.js",
  "public/js/study/concept-focus.js",
  "public/js/study/concept-shape.js",
  "public/js/study/progress.js",
  "public/js/study/scheduler.js",
  "public/js/study/content.js",
  "public/js/study/deck.js",
  "public/js/study/new-words.js",
];
const app = fileURLToPath(new URL("..", import.meta.url));
let failed = 0;
for (const path of MODULES) {
  try {
    execFileSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(new URL(path, `file://${app}`).href)}); process.exit(0);`], { cwd: app, stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
    console.log(`ok    ${path} loads in plain Node`);
  } catch (error) {
    failed++;
    const said = String(error.stderr ?? error.message).split("\n").find((line) => /Error/.test(line)) ?? String(error.message).split("\n")[0];
    console.log(`FAIL  ${path}: ${said.slice(0, 200)}`);
  }
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
