// Writes each drawing's hash into public/pictures/manifest.json (a redrawn file gets a new name on the device, so it replaces
// what's kept there). Run after adding or changing a drawing; scripts/test-art.mjs fails if it wasn't.
//   node scripts/stamp-pictures.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DIR = resolve(dirname(new URL(import.meta.url).pathname), "../public/pictures");
const path = join(DIR, "manifest.json");
const manifest = JSON.parse(readFileSync(path, "utf8"));
for (const entry of Object.values(manifest.pictures)) entry.h = createHash("sha256").update(readFileSync(join(DIR, entry.file))).digest("hex").slice(0, 10);
const rows = Object.entries(manifest.pictures).map(([id, entry]) => `    ${JSON.stringify(id)}: ${JSON.stringify(entry)}`);
writeFileSync(path, `{\n  "version": ${manifest.version},\n  "pictures": {\n${rows.join(",\n")}\n  }\n}\n`);
console.log(`stamped ${rows.length} drawings`);
