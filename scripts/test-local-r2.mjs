// scripts/fixtures/local-r2.mjs against `wrangler r2 object … --local`, the way every check and seed script wrote to a local state before it:
// two copies of one migrated state, the same steps on each (text and bytes with their content types in both buckets, a key put twice, a delete,
// a delete of what isn't there), one through wrangler, one through local-r2; then every object in both buckets (key, sha256, size, HTTP and
// custom metadata) and every D1 row of the two states must be the same, and each read must answer as wrangler's did (bytes, text, and null for
// a key that isn't there). Its control: a state with one content type changed must be found different. Runs wrangler, so outside the command
// sandbox, about a minute. Exit 0 = pass.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localR2 } from "./fixtures/local-r2.mjs";

const APP = new URL("../", import.meta.url).pathname;
const LIBRARY = "lexicommons-library";
const UPLOADS = "lexicommons-uploads";
const dir = mkdtempSync(join(tmpdir(), "test-local-r2-"));
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
const wrangler = (args, options = {}) => execFileSync("npx", ["wrangler", ...args], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], ...options });

try {
  // One migrated state, cloned: the two start the same, D1 included.
  const base = join(dir, "base");
  wrangler(["d1", "migrations", "apply", "lexicommons", "--local", "--persist-to", base]);
  const viaWrangler = join(dir, "wrangler");
  const viaLocal = join(dir, "local");
  cpSync(base, viaWrangler, { recursive: true });
  cpSync(base, viaLocal, { recursive: true });

  // The steps: what the scripts do (catalogs and packs as JSON, a translator file's bytes, a staged upload read back, deletes).
  const bytes = Buffer.from(Array.from({ length: 70_000 }, (_, i) => (i * 7919) % 256));
  const catalogue = JSON.stringify({ format: "lexicommons-catalogue", v: 1, books: [], lists: {}, note: "test-local-r2 ✓ ünïcode" }, null, 2) + "\n";
  const steps = [
    ["put", LIBRARY, "catalogue.json", catalogue, "application/json"],
    ["put", LIBRARY, "books/check/1/book.json", '{"a":1}', "application/json"],
    ["put", LIBRARY, "models/nl-en/abc.bin", bytes, "application/octet-stream"],
    ["put", UPLOADS, "staging/u1/f1", bytes.subarray(0, 1000), "application/octet-stream"],
    ["put", LIBRARY, "catalogue.json", catalogue, "application/json"],
    ["put", LIBRARY, "books/check/1/book.json", '{"a":2}', "application/json"],
    ["delete", LIBRARY, "models/nl-en/abc.bin"],
    ["delete", LIBRARY, "never/there.json"],
  ];
  for (const [op, bucket, key, data, type] of steps) {
    if (op === "put") {
      const file = join(dir, "put.bin");
      writeFileSync(file, data);
      wrangler(["r2", "object", "put", `${bucket}/${key}`, "--file", file, "--content-type", type, "--local", "--persist-to", viaWrangler]);
    } else wrangler(["r2", "object", "delete", `${bucket}/${key}`, "--local", "--persist-to", viaWrangler]);
  }
  const r2 = localR2(APP, viaLocal);
  for (const [op, bucket, key, data, type] of steps) {
    if (op === "put") await r2.put(bucket, key, data, type);
    else await r2.remove(bucket, key);
  }

  // Reads, each as wrangler's: bytes, text, a key that isn't there.
  const wranglerGet = (bucket, key) => {
    try {
      return wrangler(["r2", "object", "get", `${bucket}/${key}`, "--local", "--persist-to", viaWrangler, "--pipe"], { maxBuffer: 1 << 26 });
    } catch (error) {
      if (/not found|does not exist|NoSuchKey|404/i.test(String(error.stderr ?? error.message))) return null;
      throw error;
    }
  };
  for (const [bucket, key] of [[LIBRARY, "catalogue.json"], [LIBRARY, "books/check/1/book.json"], [UPLOADS, "staging/u1/f1"], [LIBRARY, "models/nl-en/abc.bin"], [LIBRARY, "never/there.json"]]) {
    const theirs = wranglerGet(bucket, key);
    const ours = await r2.get(bucket, key);
    check(theirs === null ? ours === null : ours !== null && Buffer.compare(theirs, ours) === 0, `get ${bucket}/${key}: ${theirs === null ? "not there" : `${theirs.length} bytes`} both ways`);
  }
  check((await r2.getText(LIBRARY, "catalogue.json")) === catalogue, "getText reads the catalog's text as written");
  // The catalog's R2 version, which the server keys its revisions on, changes on a rewrite of the same bytes, as wrangler's put changes it;
  // another file's bytes put again are left as they are.
  const versionOf = async (bucket, key) => (await (await r2.bucketFor(bucket)).head(key))?.version;
  const [catalogBefore, bookBefore] = [await versionOf(LIBRARY, "catalogue.json"), await versionOf(LIBRARY, "books/check/1/book.json")];
  await r2.put(LIBRARY, "catalogue.json", catalogue, "application/json");
  await r2.put(LIBRARY, "books/check/1/book.json", '{"a":2}', "application/json");
  check((await versionOf(LIBRARY, "catalogue.json")) !== catalogBefore, "the catalog put again with the same bytes is a new version (a revision to the server)");
  check((await versionOf(LIBRARY, "books/check/1/book.json")) === bookBefore, "another file put again with the same bytes is left as it is");
  await r2.close();

  // The two states, object by object and row by row.
  const stateOf = async (persist) => {
    const lines = [];
    const reader = localR2(APP, persist);
    for (const bucket of [LIBRARY, UPLOADS]) {
      const { listing } = await bucketListing(persist, bucket);
      for (const object of listing) {
        const data = await reader.get(bucket, object.key);
        lines.push(`r2 ${bucket} ${object.key} sha256=${createHash("sha256").update(data).digest("hex")} size=${object.size} http=${JSON.stringify(object.httpMetadata ?? {})} custom=${JSON.stringify(object.customMetadata ?? {})}`);
      }
    }
    await reader.close();
    const d1 = join(persist, "v3", "d1", "miniflare-D1DatabaseObject");
    for (const file of existsSync(d1) ? readdirSync(d1).filter((f) => f.endsWith(".sqlite")).sort() : [])
      for (const row of execFileSync("sqlite3", [join(d1, file), ".dump"], { maxBuffer: 1 << 28 }).toString().split("\n").filter(Boolean).sort()) lines.push(`d1 ${file} ${row}`);
    return lines.sort().join("\n");
  };
  // Every object with its metadata, read through miniflare's own listing (the same miniflare local-r2 opens).
  async function bucketListing(persist, bucket) {
    const { createRequire } = await import("node:module");
    const { pathToFileURL } = await import("node:url");
    const fromWrangler = createRequire(createRequire(join(APP, "package.json")).resolve("wrangler/package.json"));
    const miniflare = await import(pathToFileURL(fromWrangler.resolve("miniflare")).href);
    const mf = new miniflare.Miniflare(miniflare.convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response(null) } }", resourcePersistencePath: join(persist, "v3"), r2Buckets: { B: bucket } }));
    const b = await mf.getR2Bucket("B");
    const listing = [];
    let cursor;
    do {
      const page = await b.list({ cursor, include: ["httpMetadata", "customMetadata"] });
      // Plain values: the objects are stubs into this miniflare, gone once it's disposed.
      listing.push(...page.objects.map((o) => ({ key: o.key, size: o.size, httpMetadata: { ...(o.httpMetadata ?? {}) }, customMetadata: { ...(o.customMetadata ?? {}) } })));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    await mf.dispose();
    return { listing };
  }
  const theirs = await stateOf(viaWrangler);
  const ours = await stateOf(viaLocal);
  check(theirs === ours && theirs.includes(`r2 ${LIBRARY} catalogue.json`) && theirs.includes(`r2 ${UPLOADS} staging/u1/f1`), `the two states are the same: ${theirs.split("\n").filter((l) => l.startsWith("r2 ")).length} objects in both buckets and ${theirs.split("\n").filter((l) => l.startsWith("d1 ")).length} D1 lines`);

  // The control: one content type changed is a different state.
  wrangler(["r2", "object", "put", `${LIBRARY}/books/check/1/book.json`, "--file", (writeFileSync(join(dir, "put.bin"), '{"a":2}'), join(dir, "put.bin")), "--content-type", "text/plain", "--local", "--persist-to", viaWrangler]);
  check((await stateOf(viaWrangler)) !== ours, "control: a state with one content type changed is found different");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
