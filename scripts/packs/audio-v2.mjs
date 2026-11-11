// A pack's recordings in the form the open library takes (study/pack-audio.js, version 2): reads a version 1 folder
// (manifest.json with each clip by its path, and the clips) and writes, into a folder you name, manifest.json (version
// 2, checked against the pack) and clips/<name> for every clip, named by its bytes. Those are the files an admin stages
// and publishes with library_publish { audio }. It never writes into the app's own folders.
//
//   node scripts/packs/audio-v2.mjs <v1 folder> --pack <pack.js|pack.json> --out <empty folder>
//     [--license "<the terms>"] [--credit "<whose voice, {name} for the voice's name>"]
//
// Without --license and --credit the manifest passes for a device but not for the library (it says so).

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkPack } from "../../public/js/study/pack-format.js";
import { audioVersion, checkAudio, clipName, fromVersion1 } from "../../public/js/study/pack-audio.js";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const [folder] = args;
const packFile = option("--pack");
const out = option("--out");
if (!folder || !packFile || !out) {
  console.error("Usage: node scripts/packs/audio-v2.mjs <v1 folder> --pack <pack.js|pack.json> --out <empty folder> [--license …] [--credit …]");
  process.exit(2);
}
const target = resolve(out);
if (!relative(join(APP, "public"), target).startsWith("..")) {
  console.error("--out must be outside the app's public folder: these files go to the library, not into the app.");
  process.exit(2);
}
if (existsSync(target) && readdirSync(target).length) {
  console.error(`${target} isn't empty: give a new folder.`);
  process.exit(2);
}

const raw = packFile.endsWith(".js") ? Object.values(await import(pathToFileURL(resolve(packFile)).href)).find((v) => v?.format === "lexicommons-pack") : JSON.parse(readFileSync(packFile, "utf8"));
const { pack, errors: packErrors } = checkPack(raw);
if (!pack) {
  console.error("The pack doesn't pass the check:", packErrors.slice(0, 5));
  process.exit(1);
}

const v1 = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));
const sources = new Map();
const audio = fromVersion1(v1, (src) => {
  const name = clipName(createHash("sha256").update(readFileSync(join(folder, src))).digest("hex"), src.endsWith(".m4a") ? "m4a" : "mp3");
  sources.set(name, join(folder, src));
  return name;
});
const license = option("--license");
const credit = option("--credit");
for (const voice of Object.values(audio.voices)) {
  if (license) voice.license = license;
  if (credit) voice.credit = credit.replaceAll("{name}", voice.name);
}

const checked = checkAudio(audio, pack);
if (!checked.audio) {
  console.error("The audio doesn't pass the check:", checked.errors.slice(0, 10));
  process.exit(1);
}
mkdirSync(join(target, "clips"), { recursive: true });
writeFileSync(join(target, "manifest.json"), JSON.stringify(checked.audio, null, 2) + "\n");
for (const [name, from] of sources) copyFileSync(from, join(target, "clips", name));
const forLibrary = checkAudio(checked.audio, pack, { forLibrary: true });
console.log(`${Object.keys(checked.audio.voices).length} voices, ${sources.size} clips, manifest version ${await audioVersion(checked.audio)} → ${target}`);
for (const warning of checked.warnings) console.log(`warning: ${warning.message}`);
if (!forLibrary.audio) console.log(`Not ready for the library yet: ${forLibrary.errors.map((e) => e.message).join(" ")}`);
