// What the sign-in pages say when the server refuses (public/js/refusal-words.js, used by login.js and login-recover.js): the server's words, never
// its code. On an iOS 26.4 Simulator the sign-up showed "cross_site" (app.ts sends that code in `error` with its words in `message`); a 500's
// internal_error would have shown bare too. Each refusal shape the server sends, every bare code it can send (read out of src/), the rule from before
// as the plant, and both pages taking their words from it. Exit 0 = pass.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const { refusalWords, SOMETHING_WRONG } = await import(join(ROOT, "public/js/refusal-words.js"));
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
const bare = (words) => /^[a-z0-9_]+$/.test(words);

// The shapes the server's refusals come in, and what a person should read for each.
const CASES = [
  [{ error: "cross_site", message: "That request didn't come from this site." }, "That request didn't come from this site."],
  [{ error: "That sign-up expired. Try again." }, "That sign-up expired. Try again."],
  [{ error: "Lexicommons is very busy for a moment. Try again in a few seconds.", code: "overloaded" }, "Lexicommons is very busy for a moment. Try again in a few seconds."],
  [{ error: "internal_error" }, SOMETHING_WRONG],
  [{ error: "rate_limited", message: "  " }, SOMETHING_WRONG],
  [{}, SOMETHING_WRONG],
  [null, SOMETHING_WRONG],
  [{ error: 42 }, SOMETHING_WRONG],
];

test("the rule from before is caught (plant): it shows a bare code", () => {
  const before = (body) => body?.error || SOMETHING_WRONG;
  ok(CASES.some(([body]) => bare(before(body))), "the old rule showed no code");
});

test("each refusal's words, never its code", () => {
  for (const [body, want] of CASES) ok(refusalWords(body) === want, `${JSON.stringify(body)} → ${JSON.stringify(refusalWords(body))}, not ${JSON.stringify(want)}`);
  return `${CASES.length} shapes`;
});

test("every bare code the server sends in `error` reads as words", () => {
  const codes = new Set();
  for (const name of readdirSync(join(ROOT, "src")).filter((n) => n.endsWith(".ts"))) {
    for (const m of readFileSync(join(ROOT, "src", name), "utf8").matchAll(/error: "([a-z0-9_]+)"/g)) codes.add(m[1]);
  }
  ok(codes.size > 5, `only ${codes.size} codes found in src/: the scan broke`);
  const shown = [...codes].filter((code) => refusalWords({ error: code }) === code);
  ok(!shown.length, `shown bare: ${shown.join(", ")}`);
  return `${codes.size} codes`;
});

test("both sign-in pages take their words from it, and build none from a body's error", () => {
  for (const page of ["login.js", "login-recover.js"]) {
    const source = readFileSync(join(ROOT, "public/js", page), "utf8");
    ok(/import \{[^}]*refusalWords[^}]*\} from "\.\/refusal-words\.js"/.test(source), `${page} doesn't import refusalWords`);
    ok(/throw new Error\(refusalWords\(data\)\)/.test(source), `${page} doesn't throw refusalWords(data)`);
    ok(!/new Error\([^)]*data\.error/.test(source), `${page} builds an error from data.error`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
