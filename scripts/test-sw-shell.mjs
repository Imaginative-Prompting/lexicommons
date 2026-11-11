// The service worker's shell list (public/sw.js SHELL), as its install reads it: no file named twice (Cache.addAll
// refuses duplicate requests, so the install fails and the app has no service worker at all: no offline copy, no
// push), every file there in public/, and every recording the starter's manifests name (kept at install too); and sw.js's
// answer to a range request offline (partOf). From 27 Oct to 2 Nov 2026 sixteen language files were listed twice and the
// live service worker never installed. In Node: `node scripts/test-sw-shell.mjs` (exit 0 = pass).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "../public");
const text = readFileSync(join(PUBLIC, "sw.js"), "utf8");
const start = text.indexOf("const SHELL = [");
const block = text.slice(start, text.indexOf("];", start));
const list = [...block.matchAll(/^\s*"([^"]+)",?/gm)].map((m) => m[1]);

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failed++;
};
check("the shell list is there", list.length > 50, `${list.length} entries`);
const seen = new Map();
for (const url of list) seen.set(url, (seen.get(url) ?? 0) + 1);
const twice = [...seen].filter(([, n]) => n > 1).map(([url]) => url);
check("no file named twice (Cache.addAll refuses duplicates)", twice.length === 0, twice.slice(0, 6).join(", "));
const missing = list.filter((url) => {
  const path = url.split("?")[0];
  return !existsSync(join(PUBLIC, path === "/app/" ? "app/index.html" : path));
});
check("every file there in public/", missing.length === 0, missing.slice(0, 6).join(", "));
// The starter's recordings the worker keeps at install: every clip its manifests in SHELL name, there in public/.
const clips = [];
for (const manifest of list.filter((url) => /^\/audio\/[^/]+\/manifest\.json$/.test(url))) {
  const data = JSON.parse(readFileSync(join(PUBLIC, manifest), "utf8"));
  const base = manifest.slice(0, manifest.lastIndexOf("/"));
  for (const voice of Object.values(data.voices ?? {}))
    for (const group of [voice.items, voice.words]) for (const entry of Object.values(group ?? {})) clips.push(`${base}/${entry.src}`);
}
const absent = clips.filter((url) => !/^\/audio\/[\w-]+(\/[\w-]+)*\.(mp3|m4a)$/.test(url) || !existsSync(join(PUBLIC, url)));
check("every recording the starter's manifests name is there, as a path the worker keeps", clips.length > 0 && absent.length === 0, `${clips.length} clips${absent.length ? `; not there: ${absent.slice(0, 4).join(", ")}` : ""}`);
// partOf, sw.js's answer to a range request offline, run as the worker runs it (Node has Response).
const fnStart = text.indexOf("async function partOf(");
const partOf = fnStart < 0 ? null : new Function(`${text.slice(fnStart, text.indexOf("\n}\n", fnStart) + 2)}; return partOf;`)();
const file = () => new Response(new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 251)), { headers: { "Content-Type": "audio/mpeg" } });
const answer = async (range) => {
  const r = await partOf(file(), range);
  const body = new Uint8Array(await r.arrayBuffer());
  return { status: r.status, range: r.headers.get("Content-Range"), length: Number(r.headers.get("Content-Length") ?? body.length), first: body[0], size: body.length, type: r.headers.get("Content-Type") };
};
const ranges = partOf && {
  open: await answer("bytes=0-"),
  some: await answer("bytes=100-199"),
  tail: await answer("bytes=-100"),
  over: await answer("bytes=900-5000"),
  past: await answer("bytes=1000-"),
  backwards: await answer("bytes=50-10"),
  two: await answer("bytes=0-1, 5-6"),
};
check(
  "a range offline gets its part (206 with Content-Range), a range past the end 416, one it can't read the whole file",
  Boolean(ranges) &&
    ranges.open.status === 206 && ranges.open.range === "bytes 0-999/1000" && ranges.open.size === 1000 && ranges.open.type === "audio/mpeg" &&
    ranges.some.status === 206 && ranges.some.range === "bytes 100-199/1000" && ranges.some.size === 100 && ranges.some.length === 100 && ranges.some.first === 100 &&
    ranges.tail.status === 206 && ranges.tail.range === "bytes 900-999/1000" && ranges.tail.size === 100 && ranges.tail.first === 900 % 251 &&
    ranges.over.status === 206 && ranges.over.range === "bytes 900-999/1000" &&
    ranges.past.status === 416 && ranges.backwards.status === 416 &&
    ranges.two.status === 200 && ranges.two.size === 1000,
  ranges ? JSON.stringify(Object.fromEntries(Object.entries(ranges).map(([k, v]) => [k, `${v.status} ${v.range ?? ""}`.trim()]))) : "no partOf in sw.js",
);
console.log(`\n${5 - failed}/5 passed`);
process.exit(failed ? 1 : 0);
