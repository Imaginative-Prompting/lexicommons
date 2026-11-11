// Fields where a learner types words of the language they're learning, or searches: the phone's keyboard must leave what's typed alone. iOS
// offers its own words for a word it doesn't know ("kiddie" for "koffie", "Fut" for "Dut", seen on an iOS 26.4 Simulator), and with Auto-Correction
// on a space puts its word in place of the learner's; spellcheck="false" alone doesn't stop it, autocorrect="off" does (Translate's field and the
// gap field showed no suggestions). So, read by TypeScript's parser: every el("input" | "textarea", { … }) under public/js that takes a `lang` (words
// in a language) or is a search (type: "search") sets autocorrect: "off" and spellcheck: "false", and autocapitalize "off" (or "sentences" for a field
// that takes a whole sentence: a capital that starts one is no change to it). A field this can't read (its attributes spread in) says why it's fine
// with `// typing-field: <why>` on it or the line before. Each rule catches a plant first. Exit 0 = pass.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = new URL("..", import.meta.url).pathname;
const SKIP_DIRS = new Set(["rig", "vendor", "models", "node_modules"]);
let failed = 0;
let passed = 0;
const test = (name, fn) => {
  try {
    const note = fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
};
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) jsFiles(path, out);
    else if (name.endsWith(".js")) out.push(path);
  }
  return out;
}

const text = (node) => (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null);
const keyOf = (prop) => (prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : null);

/** Every typing field in a file's source that breaks the rule: [{ line, why }]. */
function faults(source, file = "planted.js") {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const lines = source.split("\n");
  const excused = (line) => /typing-field:/.test(lines[line] ?? "") || /typing-field:/.test(lines[line - 1] ?? "");
  const out = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "el") {
      const tag = text(node.arguments[0]);
      const props = node.arguments[1];
      if ((tag === "input" || tag === "textarea") && props && ts.isObjectLiteralExpression(props)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
        const has = new Map();
        let spread = false;
        for (const p of props.properties) {
          if (ts.isSpreadAssignment(p)) spread = true;
          else if (ts.isShorthandPropertyAssignment(p)) has.set(p.name.text, null);
          else if (ts.isPropertyAssignment(p)) has.set(keyOf(p), text(p.initializer));
        }
        const typing = has.has("lang") || has.get("type") === "search";
        if (typing && !excused(line)) {
          const why = [];
          if (has.get("autocorrect") !== "off") why.push(`autocorrect ${JSON.stringify(has.get("autocorrect") ?? null)}`);
          if (has.get("spellcheck") !== "false") why.push(`spellcheck ${JSON.stringify(has.get("spellcheck") ?? null)}`);
          if (!["off", "sentences"].includes(has.get("autocapitalize"))) why.push(`autocapitalize ${JSON.stringify(has.get("autocapitalize") ?? null)}`);
          if (why.length) out.push({ line: line + 1, why: why.join(", ") + (spread ? " (attributes spread in: mark it if they carry these)" : "") });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

test("a typing field that leaves the keyboard its corrections is caught (plants)", () => {
  ok(faults(`el("input", { part: "text-field", type: "text", lang, spellcheck: "false", autocapitalize: "off" })`).length === 1, "a word field with spellcheck alone passed");
  ok(faults(`el("input", { part: "text-field", type: "search", autocomplete: "off" })`).length === 1, "a search with nothing set passed");
  ok(faults(`el("textarea", { lang: "nl", autocorrect: "off", spellcheck: "false" })`).length === 1, "a field with no autocapitalize passed");
  ok(faults(`el("input", { lang, autocorrect: "on", spellcheck: "false", autocapitalize: "off" })`).length === 1, "autocorrect on passed");
  ok(faults(`el("input", { lang, autocorrect: "off", spellcheck: "false", autocapitalize: "off" })`).length === 0, "a right field was caught");
  ok(faults(`el("input", { lang, autocorrect: "off", spellcheck: "false", autocapitalize: "sentences" })`).length === 0, "a sentence field was caught");
  ok(faults(`el("input", { part: "text-field", type: "text", placeholder })`).length === 0, "a field in the app's own language was caught");
  ok(faults(`// typing-field: its attributes come from the caller, which sets all three\nel("input", { lang, ...attrs })`).length === 0, "a marked field was caught");
});

test("every typing field under public/js leaves what's typed alone (autocorrect off, spellcheck off, autocapitalize off or sentences)", () => {
  const bad = [];
  let fields = 0;
  for (const file of jsFiles(join(ROOT, "public/js"))) {
    const source = readFileSync(file, "utf8");
    if (!source.includes('el("input"') && !source.includes('el("textarea"')) continue;
    for (const f of faults(source, file)) bad.push(`${relative(ROOT, file)}:${f.line} ${f.why}`);
    fields += (source.match(/el\("(input|textarea)"/g) ?? []).length;
  }
  ok(!bad.length, bad.join("; "));
  return `${fields} fields read`;
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
