// Where sign-in, getting back in and the gate send you next (src/util.ts safeNextPath): only a path on this site, read the way a browser
// reads a Location. Each way out the Codex review found or the URL standard allows (a tab or newline the parser drops, a backslash it
// takes for a slash, another scheme, a host by any spelling) falls back; paths of the app, with their query and hash, stay as they are.
// `node scripts/test-safe-next.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

workerEnv(); // the TypeScript loader
const { safeNextPath } = await import("../src/util.ts");
const FALLBACK = "/app/";
let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 4).join("\n        ")}`);
  }
};
// What a browser does with a Location: resolve it against the page. It must stay on this site, whatever came back.
const lands = (location) => new URL(location, "https://lexicommons.com/login").origin;

test("ways to another site fall back (each would land elsewhere as it was)", () => {
  const out = [
    "/\t/evil.example/",
    "/\n/evil.example",
    "/\r\n/evil.example",
    "/ \t/evil.example",
    "\t//evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\\/evil.example",
    "/x\\..\\..\\\\evil.example",
    "https://evil.example/",
    "javascript:alert(1)",
    "/\u0000/evil.example",
    "/\u007f",
    "",
    null,
    "app/",
    `/${"a".repeat(3000)}`,
  ];
  for (const value of out) assert.equal(safeNextPath(value), FALLBACK, JSON.stringify(value));
  // The control: tabs really do make the old check's answer land on another site.
  assert.notEqual(lands("/\t/evil.example/"), "https://lexicommons.com", "a browser drops the tab");
});
test("a path of the app stays as it is, with its query and hash", () => {
  for (const value of ["/app/", "/app/#settings/plan?done=1", "/authorize?client_id=x&state=y&scope=learn%3Aread", "/login?next=%2Fapp%2F", "/privacy", "/%09/encoded-stays-a-path"]) {
    const got = safeNextPath(value);
    assert.equal(got, value, value);
    assert.equal(lands(got), "https://lexicommons.com", value);
  }
});
test("a path that only looks odd is read as the browser would, and kept on this site", () => {
  assert.equal(safeNextPath("/app/../privacy"), "/privacy");
  assert.equal(safeNextPath("/./app/"), "/app/");
  assert.equal(safeNextPath("/x", "/elsewhere/"), "/x");
  assert.equal(safeNextPath("//", "/elsewhere/"), "/elsewhere/");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
