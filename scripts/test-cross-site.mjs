// A cookie session's change must come from this site (src/util.ts crossSite, applied in app.ts to unsafe /api/* requests): what a browser
// marks as another site is refused (another origin, "null", a same-site neighbor such as another localhost port, Fetch Metadata saying
// so); this site's own pages, a top-level navigation, and a request with neither header (not a browser's) go on (6 Nov 2026, Codex S5).
// `node scripts/test-cross-site.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

workerEnv(); // the TypeScript loader
const { crossSite } = await import("../src/util.ts");
const SITE = "https://lexicommons.com";
const req = (headers) => new Request(`${SITE}/api/notes`, { method: "POST", headers });
let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
};
test("another site is refused, however the browser says it", () => {
  for (const headers of [{ Origin: "https://evil.example" }, { Origin: "null" }, { Origin: "http://lexicommons.com" }, { Origin: "https://www.lexicommons.com" }, { Origin: "http://localhost:9999" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }, { Origin: SITE, "Sec-Fetch-Site": "cross-site" }]) {
    assert.equal(crossSite(req(headers), SITE), true, JSON.stringify(headers));
  }
});
test("this site's own pages, a navigation the person made, and no browser at all go on", () => {
  for (const headers of [{ Origin: SITE }, { Origin: SITE, "Sec-Fetch-Site": "same-origin" }, { "Sec-Fetch-Site": "same-origin" }, { "Sec-Fetch-Site": "none" }, {}]) {
    assert.equal(crossSite(req(headers), SITE), false, JSON.stringify(headers));
  }
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
