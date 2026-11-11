// The full translator's files into the library bucket, each at the key public/js/translate/models.js names
// (translate/<16 hex>.<bin|spm>), from a folder holding them by their own names (as Mozilla's list names them). Every
// file is checked against its sha256 first, and a file whose hash doesn't match is refused before anything goes up.
//   node scripts/translate/models-r2.mjs --from <folder> --local <persist dir>     a LOCAL library, for checks
//   node scripts/translate/models-r2.mjs --from <folder> --remote                  the live bucket (the director, at a freeze;
//                                                                                   sandbox off, CLOUDFLARE_ACCOUNT_ID set)
// --only <lang> limits it to one language's files (and the runtime's, which is in public/ and isn't uploaded).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGUAGES_WITH, filesOf } from "../../public/js/translate/models.js";
import { localR2 } from "../fixtures/local-r2.mjs";

const APP = join(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const FROM = opt("--from") && resolve(opt("--from"));
const LOCAL = opt("--local") && resolve(opt("--local"));
const REMOTE = args.includes("--remote");
const ONLY = opt("--only");
if (!FROM || (!LOCAL && !REMOTE) || (LOCAL && REMOTE)) {
  console.error("usage: models-r2.mjs --from <folder> (--local <persist dir> | --remote) [--only <lang>]");
  process.exit(2);
}

// Every file under --from, by its name (Mozilla's names are unique per language and way).
const found = new Map();
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else found.set(name, path);
  }
};
walk(FROM);

const files = [...new Map((ONLY ? [ONLY] : LANGUAGES_WITH).flatMap(filesOf).map((file) => [file.url, file])).values()];
const plan = [];
for (const file of files) {
  const path = found.get(file.name);
  if (!path) throw new Error(`${file.name} isn't under ${FROM}`);
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (digest !== file.sha256) throw new Error(`${file.name} under ${FROM} isn't the file models.js lists (${digest.slice(0, 16)} ≠ ${file.sha256.slice(0, 16)})`);
  plan.push({ key: file.url.replace(/^\/library\//, ""), path, file });
}
const bucket = JSON.parse(readFileSync(join(APP, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "")).r2_buckets?.find((b) => b.binding === "LIBRARY")?.bucket_name ?? "lexicommons-library";
// A local library through one bucket in this process (scripts/fixtures/local-r2.mjs; a file already there with the same bytes stays), the live
// one through wrangler as before.
const r2 = LOCAL ? localR2(APP, LOCAL) : null;
for (const { key, path, file } of plan) {
  if (r2) await r2.put(bucket, key, readFileSync(path), "application/octet-stream");
  else execFileSync(join(APP, "node_modules/.bin/wrangler"), ["r2", "object", "put", `${bucket}/${key}`, "--file", path, "--content-type", "application/octet-stream", "--remote"], { cwd: APP, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`put ${key} (${file.name}, ${(file.size / 1e6).toFixed(1)} MB)${LOCAL ? " into the local library" : " into the live library"}`);
}
await r2?.close();
console.log(`${plan.length} files, ${(plan.reduce((sum, p) => sum + p.file.size, 0) / 1e6).toFixed(1)} MB, all checked against models.js`);
if (!existsSync(join(APP, "public/vendor/bergamot/bergamot-translator.wasm"))) console.log("note: the runtime (public/vendor/bergamot/) isn't in this copy");
