// No "null" on a screen. el() leaves out null, undefined and false among its children, but the DOM's own append, prepend, replaceChildren, before, after and
// replaceWith print them as text: replaceChildren(cond ? node : null) showed the word "null" above Settings → Streak's Pause your streak, and streak-check
// passed with it on screen. So, read by TypeScript's own parser and checker: no call of those on a node may be handed something that can be null, undefined or
// false. `...list.filter(Boolean)` is fine, and so is a spread that leaves it out. The screens themselves are held by frame-check (stray-text). Exit 0 = pass.
// A line that's safe in a way this can't see says so, with `// not-text: <why>` on it or the line before.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = new URL("..", import.meta.url).pathname;
const METHODS = new Set(["append", "prepend", "replaceChildren", "before", "after", "replaceWith"]);
// Not nodes: these have an append of their own, with nothing to print.
const NOT_NODE_TYPES = new Set(["URLSearchParams", "FormData", "Headers"]);
const NOT_NODE_NAMES = /^(params|search|searchParams|form|formData|fd|headers|url\.searchParams)$/;
const SKIP_DIRS = new Set(["rig", "vendor", "models", "node_modules"]);

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) jsFiles(path, out);
    else if (name.endsWith(".js")) out.push(path);
  }
  return out;
}

// What a name was set to, or what a little function gives back: the checker reads el()'s result as any, and any swallows a null beside it.
function declarationOf(identifier, checker) {
  let symbol = checker?.getSymbolAtLocation(identifier);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol); // from another file
  return symbol?.valueDeclaration ?? symbol?.declarations?.[0] ?? null;
}
function returnsOf(fn) {
  if (!fn) return [];
  if (fn.body && !ts.isBlock(fn.body)) return [fn.body];
  const out = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node !== fn) return;
    if (ts.isReturnStatement(node)) out.push(node.expression ?? null);
    ts.forEachChild(node, visit);
  };
  if (fn.body) ts.forEachChild(fn.body, visit);
  return out;
}
const seen = new Set();
function followed(node, checker, test) {
  if (seen.has(node)) return false;
  seen.add(node);
  try {
    return test();
  } finally {
    seen.delete(node);
  }
}

/** Does this condition, being true, mean `name` isn't empty? `x`, `x && y`, `x?.isConnected`, `(x)`. */
function truthyIn(cond, name) {
  if (ts.isParenthesizedExpression(cond)) return truthyIn(cond.expression, name);
  if (ts.isIdentifier(cond)) return cond.text === name;
  if (ts.isPropertyAccessExpression(cond)) return truthyIn(cond.expression, name);
  if (ts.isBinaryExpression(cond) && cond.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return truthyIn(cond.left, name) || truthyIn(cond.right, name);
  return false;
}
/** Does this statement end the block if `name` is empty? `if (!x) return;` */
const leavesWithout = (statement, name) =>
  ts.isIfStatement(statement) &&
  ts.isPrefixUnaryExpression(statement.expression) &&
  statement.expression.operator === ts.SyntaxKind.ExclamationToken &&
  truthyIn(statement.expression.operand, name) &&
  (ts.isReturnStatement(statement.thenStatement) || (ts.isBlock(statement.thenStatement) && statement.thenStatement.statements.some(ts.isReturnStatement)));
function guarded(node, name) {
  for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isConditionalExpression(parent) && child === parent.whenTrue && truthyIn(parent.condition, name)) return true;
    if (ts.isIfStatement(parent) && child === parent.thenStatement && truthyIn(parent.expression, name)) return true;
    if (ts.isBinaryExpression(parent) && child === parent.right && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && truthyIn(parent.left, name)) return true;
    if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
      const before = parent.statements.slice(0, parent.statements.indexOf(child));
      if (before.some((statement) => leavesWithout(statement, name))) return true;
    }
    if (ts.isFunctionLike(parent)) break;
  }
  return false;
}
/** A `let x = null` given something just before it's used: the last `x = …` above it in its own block, or in a block around it. */
function lastWrite(node, name) {
  for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
      const before = parent.statements.slice(0, parent.statements.indexOf(child)).reverse();
      for (const statement of before) {
        if (!ts.isExpressionStatement(statement)) continue;
        const e = statement.expression;
        if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(e.left) && e.left.text === name) return e.right;
      }
    }
    if (ts.isFunctionLike(parent)) break;
  }
  return null;
}

const NULLABLE = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.BooleanLiteral | ts.TypeFlags.Boolean | ts.TypeFlags.Void;
function mayBeEmpty(node, checker) {
  // By its shape first: what it is, whatever the checker makes of the rest.
  if (node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (ts.isIdentifier(node) && node.text === "undefined") return true;
  if (ts.isParenthesizedExpression(node)) return mayBeEmpty(node.expression, checker);
  if (ts.isConditionalExpression(node)) return mayBeEmpty(node.whenTrue, checker) || mayBeEmpty(node.whenFalse, checker);
  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return true;
    if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) return mayBeEmpty(node.right, checker);
  }
  if (ts.isSpreadElement(node)) return spreadMayBeEmpty(node.expression, checker);
  if (ts.isPropertyAccessChain?.(node) || ts.isCallChain?.(node) || node.questionDotToken) return true;
  if (ts.isIdentifier(node)) {
    if (guarded(node, node.text)) return false;
    const written = lastWrite(node, node.text);
    if (written) return followed(written, checker, () => mayBeEmpty(written, checker));
    const declared = declarationOf(node, checker);
    if (declared && ts.isVariableDeclaration(declared) && declared.initializer && followed(declared, checker, () => mayBeEmpty(declared.initializer, checker))) return true;
    if (declared && ts.isParameter(declared)) return false; // what callers pass isn't read here
  }
  if (ts.isCallExpression(node) && (ts.isIdentifier(node.expression) || ts.isPropertyAccessExpression(node.expression))) {
    // A little function, here or in another file (ui.something()).
    const declared = declarationOf(ts.isIdentifier(node.expression) ? node.expression : node.expression.name, checker);
    const fn = declared && ts.isVariableDeclaration(declared) ? declared.initializer : declared;
    if (fn && ts.isFunctionLike(fn) && followed(fn, checker, () => returnsOf(fn).some((r) => r === null || mayBeEmpty(r, checker)))) return true;
  }
  // By its type, where the checker knows one.
  const type = checker?.getTypeAtLocation(node);
  if (!type || type.flags & ts.TypeFlags.Any) return false;
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((t) => t.flags & NULLABLE);
}
function spreadMayBeEmpty(list, checker) {
  if (ts.isCallExpression(list) && ts.isPropertyAccessExpression(list.expression) && list.expression.name.text === "filter") return false;
  if (ts.isParenthesizedExpression(list)) return spreadMayBeEmpty(list.expression, checker);
  if (ts.isConditionalExpression(list)) return spreadMayBeEmpty(list.whenTrue, checker) || spreadMayBeEmpty(list.whenFalse, checker);
  if (ts.isArrayLiteralExpression(list)) return list.elements.some((e) => mayBeEmpty(e, checker));
  if (ts.isIdentifier(list)) {
    const declared = declarationOf(list, checker);
    if (declared && ts.isVariableDeclaration(declared) && declared.initializer && followed(declared, checker, () => spreadMayBeEmpty(declared.initializer, checker))) return true;
  }
  if (ts.isCallExpression(list) && ts.isPropertyAccessExpression(list.expression) && list.expression.name.text === "map" && ts.isFunctionLike(list.arguments[0] ?? {})) {
    return returnsOf(list.arguments[0]).some((r) => r === null || mayBeEmpty(r, checker));
  }
  if (!checker) return false;
  const type = checker.getTypeAtLocation(list);
  const element = type && !(type.flags & ts.TypeFlags.Any) ? checker.getIndexTypeOfType?.(type, ts.IndexKind.Number) : null;
  if (!element || element.flags & ts.TypeFlags.Any) return false;
  return (element.isUnion() ? element.types : [element]).some((t) => t.flags & NULLABLE);
}

/** `xs.length && node`, `count && node`: when it's 0, the 0 is what's left. */
function printsZero(node) {
  if (ts.isParenthesizedExpression(node)) return printsZero(node.expression);
  if (ts.isConditionalExpression(node)) return printsZero(node.whenTrue) || printsZero(node.whenFalse);
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return false;
  const left = node.left;
  return (ts.isPropertyAccessExpression(left) && left.name.text === "length") || printsZero(left);
}

export function findings(fileNames, { host } = {}) {
  const program = ts.createProgram(fileNames, { allowJs: true, checkJs: false, noEmit: true, strictNullChecks: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"], skipLibCheck: true }, host);
  const checker = program.getTypeChecker();
  const out = [];
  for (const file of fileNames) {
    const source = program.getSourceFile(file);
    if (!source) continue;
    const lines = source.getFullText().split("\n");
    const note = (call, arg, prints = "null") => {
      const line = source.getLineAndCharacterOfPosition(arg.getStart(source)).line;
      if (/not-text:/.test(lines[line]) || /not-text:/.test(lines[line - 1] ?? "")) return;
      out.push({ file, line: line + 1, prints, call: call.expression.getText(source).slice(0, 40), arg: arg.getText(source).replace(/\s+/g, " ").slice(0, 90) });
    };
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && METHODS.has(node.expression.name.text)) {
        const receiver = node.expression.expression.getText(source);
        const typeName = checker.getTypeAtLocation(node.expression.expression)?.symbol?.name;
        if (!NOT_NODE_TYPES.has(typeName) && !NOT_NODE_NAMES.test(receiver)) {
          for (const arg of node.arguments) {
            if (printsZero(arg)) note(node, arg, "0");
            if (mayBeEmpty(arg, checker)) note(node, arg);
          }
        }
      }
      // el() leaves out null, undefined and false, but a 0 is a number: `list.length && el(...)` prints it.
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "el") {
        for (const arg of node.arguments.slice(2)) if (printsZero(arg)) note(node, arg, "0");
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  // It can fail: the line that showed "null", and its neighbors.
  const samples = {
    "/s/old.js": `const box = document.createElement("div"); const cond = Math.random() > 0.5; const x = document.createElement("p"); box.replaceChildren(cond ? x : null, x);`,
    "/s/and.js": `const box = document.createElement("div"); const cond = Math.random() > 0.5; const x = document.createElement("p"); box.append(cond && x);`,
    "/s/var.js": `const box = document.createElement("div"); const y = Math.random() > 0.5 ? document.createElement("p") : null; box.append(y);`,
    "/s/opt.js": `const box = document.createElement("div"); const y = { z: document.createElement("p") }; box.append(y?.z);`,
    "/s/spread.js": `const box = document.createElement("div"); const x = document.createElement("p"); box.replaceChildren(...[x, Math.random() > 0.5 ? x : null]);`,
    "/s/el.js": `function el() { return JSON.parse("{}"); } const box = document.createElement("div"); const y = Math.random() > 0.5 ? el() : null; box.append(y);`,
    "/s/map.js": `function el() { return JSON.parse("{}"); } const box = document.createElement("div"); const rows = [1, 2].map((n) => (n > 1 ? el() : null)); box.replaceChildren(...rows);`,
    "/s/fn.js": `function el() { return JSON.parse("{}"); } const box = document.createElement("div"); const f = () => (Math.random() > 0.5 ? el() : null); box.append(f());`,
    "/s/zero.js": `function el() { return JSON.parse("{}"); } const xs = [1]; el("div", {}, xs.length && el("p"));`,
    "/s/guard.js": `function el() { return JSON.parse("{}"); } const box = document.createElement("div"); const y = Math.random() > 0.5 ? el() : null; if (y) box.append(y); box.replaceChildren(...(y ? [y] : [])); let z = null; function f() { z = el(); box.append(z); } function g() { if (!y) return; box.append(y); } f(); g();`,
    "/s/ok.js": `const box = document.createElement("div"); const x = document.createElement("p"); box.replaceChildren(x, "words"); box.append(...[x, Math.random() > 0.5 ? x : null].filter(Boolean)); const u = new URLSearchParams(); const params = u; params.append("a", Math.random() > 0.5 ? "b" : "c");`,
  };
  const base = ts.createCompilerHost({ allowJs: true });
  const host = {
    ...base,
    fileExists: (name) => name in samples || base.fileExists(name),
    readFile: (name) => samples[name] ?? base.readFile(name),
    getSourceFile: (name, version) => (name in samples ? ts.createSourceFile(name, samples[name], version, true, ts.ScriptKind.JS) : base.getSourceFile(name, version)),
  };
  const planted = findings(Object.keys(samples), { host });
  for (const name of ["/s/old.js", "/s/and.js", "/s/var.js", "/s/opt.js", "/s/spread.js", "/s/el.js", "/s/map.js", "/s/fn.js", "/s/zero.js"]) {
    const caught = planted.some((row) => row.file === name);
    console.log(`${caught ? "ok   " : "FAIL "} caught: ${name}`);
    if (!caught) failed++;
  }
  const falseAlarm = planted.filter((row) => row.file === "/s/ok.js" || row.file === "/s/guard.js");
  console.log(`${falseAlarm.length ? "FAIL " : "ok   "} left alone: a plain node, words, a filtered spread, URLSearchParams, a guarded name, a let just written`);
  for (const row of falseAlarm) console.log(`      ${row.file}:${row.line}: ${row.arg}`);
  if (falseAlarm.length) failed++;
  const files = jsFiles(join(ROOT, "public/js"));
  const found = findings(files);
  for (const row of found) console.log(`FAIL  ${relative(ROOT, row.file)}:${row.line}: prints ${row.prints}: ${row.call}(${row.arg})`);
  console.log(`${files.length} files read; ${found.length} calls that can print a null, undefined or false`);
  process.exit(failed || found.length ? 1 : 0);
}
