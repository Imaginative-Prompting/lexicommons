// Builds what on-device speech recognition serves (public/js/speech/models.js has the list):
//   public/vendor/transformers/   transformers.js (Apache-2.0), from its npm package at the pinned version
//   public/vendor/ort/            ONNX Runtime Web's two WebAssembly loaders (MIT), from its npm package
//   public/models/<pack>/         each Whisper model and each runtime build, as manifest.json plus chunks of under
//                                 25 MiB (Cloudflare's limit for one static file), named by their SHA-256
// Models come from Hugging Face at their pinned revisions, checked against the SHA-256 Hugging Face publishes, and
// are kept in a source folder outside the repo (default ~/.cache/lexicommons-models) so a rebuild downloads nothing.
// public/models/ is gitignored (about 1.1 GB); run this before deploying from a fresh copy.
//
//   node scripts/speech-build.mjs [--source <dir>] [--only <pack,pack>]
// Needs network access to registry.npmjs.org and huggingface.co (and its file host). Safe to re-run.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, openSync, readSync, closeSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { MODELS, ORT_VERSION, RUNTIMES, packFiles } from "../public/js/speech/models.js";

const TRANSFORMERS_VERSION = "4.3.1";
const CHUNK = 20 * 1024 * 1024;
const APP = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const SOURCE = option("--source", join(homedir(), ".cache", "lexicommons-models"));
const ONLY = option("--only", "")?.split(",").filter(Boolean);
const wanted = (pack) => !ONLY.length || ONLY.includes(pack);

const sha256File = (path) => {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  const buffer = Buffer.alloc(8 * 1024 * 1024);
  let read;
  while ((read = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  closeSync(fd);
  return hash.digest("hex");
};

// ---------- the libraries ----------

function npmPackage(name, version, into) {
  const dir = mkdtempSync(join(tmpdir(), "lx-npm-"));
  // npm checks the tarball against the registry's integrity hash.
  const file = execFileSync("npm", ["pack", `${name}@${version}`, "--pack-destination", dir, "--silent"], { encoding: "utf8" }).trim().split("\n").pop();
  mkdirSync(into, { recursive: true });
  execFileSync("tar", ["xzf", join(dir, file), "-C", into]);
  rmSync(dir, { recursive: true, force: true });
  return join(into, "package");
}

const work = mkdtempSync(join(tmpdir(), "lx-speech-"));
const transformers = npmPackage("@huggingface/transformers", TRANSFORMERS_VERSION, join(work, "t"));
const bundled = JSON.parse(readFileSync(join(transformers, "package.json"), "utf8")).dependencies["onnxruntime-web"];
if (bundled !== ORT_VERSION) throw new Error(`transformers.js ${TRANSFORMERS_VERSION} bundles onnxruntime-web ${bundled}; models.js says ${ORT_VERSION}`);
const ort = npmPackage("onnxruntime-web", ORT_VERSION, join(work, "o"));

const vendor = (dir, files) => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [from, to] of files) copyFileSync(from, join(dir, to));
};
vendor(join(APP, "public/vendor/transformers"), [
  [join(transformers, "dist/transformers.min.js"), "transformers.min.js"],
  [join(transformers, "LICENSE"), "LICENSE"],
]);
vendor(join(APP, "public/vendor/ort"), [
  [join(ort, "dist/ort-wasm-simd-threaded.asyncify.mjs"), "ort-wasm-simd-threaded.asyncify.mjs"],
  [join(ort, "dist/ort-wasm-simd-threaded.mjs"), "ort-wasm-simd-threaded.mjs"],
]);
// The npm package ships no LICENSE file; its package.json and every file's header say MIT, Microsoft.
if (JSON.parse(readFileSync(join(ort, "package.json"), "utf8")).license !== "MIT") throw new Error("onnxruntime-web is no longer MIT-licensed");
writeFileSync(join(APP, "public/vendor/ort/LICENSE"), `ONNX Runtime Web ${ORT_VERSION} (https://github.com/microsoft/onnxruntime)

MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`);
console.log(`vendored transformers.js ${TRANSFORMERS_VERSION} and onnxruntime-web ${ORT_VERSION}`);

// ---------- the packs ----------

/** Splits files into content-named chunks under public/models/<pack>/c/ and writes its manifest. */
function writePack(pack, source, files) {
  const dir = join(APP, "public/models", pack);
  mkdirSync(join(dir, "c"), { recursive: true });
  const keep = new Set();
  const entries = [];
  for (const { name, path } of files) {
    const size = statSync(path).size;
    const fd = openSync(path, "r");
    const chunks = [];
    for (let offset = 0; offset < size; offset += CHUNK) {
      const length = Math.min(CHUNK, size - offset);
      const piece = Buffer.alloc(length);
      readSync(fd, piece, 0, length, offset);
      const sha256 = createHash("sha256").update(piece).digest("hex");
      const chunkName = `${sha256.slice(0, 32)}.bin`;
      keep.add(chunkName);
      if (!existsSync(join(dir, "c", chunkName))) writeFileSync(join(dir, "c", chunkName), piece);
      chunks.push({ name: chunkName, bytes: length, sha256 });
    }
    closeSync(fd);
    entries.push({ name, bytes: size, sha256: sha256File(path), chunks });
  }
  for (const old of readdirSync(join(dir, "c"))) if (!keep.has(old)) rmSync(join(dir, "c", old));
  const bytes = entries.reduce((n, f) => n + f.bytes, 0);
  const manifest = { format: "lexicommons-speech-pack", version: 1, id: pack, source, bytes, files: entries };
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`${pack}: ${entries.length} files, ${keep.size} chunks, ${(bytes / 1e6).toFixed(1)} MB`);
}

for (const runtime of Object.values(RUNTIMES)) {
  if (!wanted(runtime.pack)) continue;
  writePack(runtime.pack, { package: "onnxruntime-web", version: ORT_VERSION, licence: "MIT" }, [{ name: runtime.wasm, path: join(ort, "dist", runtime.wasm) }]);
}

// What Hugging Face says each file of a repo is: size, and SHA-256 for the large (LFS) ones.
function remoteTree(repo, revision, dir) {
  const url = `https://huggingface.co/api/models/${repo}/tree/${revision}${dir ? `/${dir}` : ""}?expand=true`;
  // curl, not fetch: it follows the proxy settings a sandboxed shell gives it.
  const listing = JSON.parse(execFileSync("curl", ["-sSfL", "--retry", "3", url], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
  return new Map(listing.filter((f) => f.type === "file").map((f) => [f.path, { size: f.size, sha256: f.lfs?.oid ?? null }]));
}

for (const model of MODELS) {
  if (!wanted(model.id)) continue;
  const names = packFiles(model);
  const tree = new Map([...remoteTree(model.repo, model.revision, ""), ...remoteTree(model.repo, model.revision, "onnx")]);
  const local = join(SOURCE, `${model.repo}@${model.revision}`);
  const files = [];
  for (const name of names) {
    const remote = tree.get(name);
    if (!remote) throw new Error(`${model.repo}@${model.revision} has no ${name}`);
    const path = join(local, name);
    const good = () => existsSync(path) && statSync(path).size === remote.size && (!remote.sha256 || sha256File(path) === remote.sha256);
    if (!good()) {
      mkdirSync(dirname(path), { recursive: true });
      console.log(`downloading ${model.repo} ${name} (${(remote.size / 1e6).toFixed(1)} MB)`);
      execFileSync("curl", ["-sSfL", "--retry", "3", "-o", `${path}.part`, `https://huggingface.co/${model.repo}/resolve/${model.revision}/${name}`], { stdio: "inherit" });
      execFileSync("mv", [`${path}.part`, path]);
      if (!good()) throw new Error(`${name} doesn't match what Hugging Face says it is`);
    }
    files.push({ name, path });
  }
  writePack(model.id, { repo: model.repo, revision: model.revision, licence: "MIT" }, files);
}

rmSync(work, { recursive: true, force: true });
console.log("speech files built");
