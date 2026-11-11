#!/usr/bin/env node
// Puts a pack into a LOCAL server's open library as one of Lexicommons' own (a default pack for its language), or takes
// one out: for checks and local testing. The live library changes only through an admin's library tools
// (src/library-admin.ts), and this has no way to reach it: it only ever writes to the wrangler state you name.
// It runs the same pure code the admin tools do (study/pack-format.js): the pack checked against the language's other
// default packs, its version from its content, how it differs from the version before (a removed item needs
// --confirm-removed), the file at packs/<id>/<version>/pack.json, then the catalog, read again just before the write
// and with every key it doesn't own kept as found. With --audio, the pack's recordings too, as library_publish
// { audio } puts them: the manifest checked against the pack (pack-audio.js checkAudio, the library's rules: every
// voice's license and credit), each clip from --clips matched to its name by its bytes and put at audio/<clip> if
// absent, the manifest at packs/<id>/<version>/audio.<12 hex>.json, and the catalog entry naming it. --drop-audio
// takes them off the entry (the files stay, as the library's do).
//
//   node scripts/packs/seed-local.mjs <pack.js | pack.json> --persist-to <wrangler state dir> [--confirm-removed]
//        [--audio <manifest.json> --clips <dir> | --drop-audio] [--opt-in [--suggest] | --default]
// --opt-in lists it as an opt-in pack (no device has it until its learner adds it in Explore), --default as a default
// pack; with neither, it stays as the catalog has it (a new pack: a default), as library_publish does. --suggest with
// --opt-in: Explore may suggest it (its topics, its shelves), as a pack about one topic; without it, an opt-in pack is
// never suggested (strong language).
//   node scripts/packs/seed-local.mjs --remove <pack id> --language <code> --persist-to <wrangler state dir>
//
// Run it outside the command sandbox (wrangler). Exit 0 = done; it prints the version and what changed.
//
// Every read and write goes through ONE local bucket for the whole run (scripts/fixtures/local-r2.mjs: wrangler's own miniflare, opened
// as `wrangler r2 object --local --persist-to` opens it, puts through the same worker), not a wrangler process per object:
// a pack with its recordings was ~170 wrangler launches, and two seeds at once took the machine's load past 290. An object already
// there with the same bytes and type isn't written again.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { localR2 } from "../fixtures/local-r2.mjs";
import { catalogueEntry, checkPack, compareVersions, defaultInstalled, packKey, packRefs, packText, packVersion, withoutPack, withPackEntry } from "../../public/js/study/pack-format.js";
import { audioKey, audioText, audioUrl, audioVersion, checkAudio, clipKey, clipName, clipsOf } from "../../public/js/study/pack-audio.js";
import { checkGrammar, checkGrammarMore, grammarEntry, grammarVersion, useGrammar, withGrammarEntry } from "../../public/js/lang/grammar.js";

const APP = new URL("../../", import.meta.url).pathname;
const BUCKET = "lexicommons-library";
const argv = process.argv.slice(2);
const option = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const persist = option("persist-to");
const removing = option("remove");
const die = (message) => {
  console.error(message);
  process.exit(1);
};
if (!persist || argv.includes("--remote")) die("Usage: seed-local.mjs <pack.js|pack.json> --persist-to <wrangler state dir> [--confirm-removed] | --remove <id> --language <code> --persist-to <dir>. Local only.");

// The library's bucket for the whole run, in this process (scripts/fixtures/local-r2.mjs: as `wrangler r2 object --local` keeps it).
const r2 = localR2(APP, persist);
const getText = (key) => r2.getText(BUCKET, key);
const putText = (key, text) => r2.put(BUCKET, key, text, "application/json");
/**
 * The pack's language's shared grammar, as the app's library/ names it (catalogue-seed.json): put into this library first when its own is
 * older, as an admin publishes a revision before a pack that uses it (the file, its longer file and the catalog's entry), so a pack with a
 * pattern from a later revision passes here and on a device. Either way the grammar this library has is the one the pack is checked against.
 */
async function grammarFirst(lang) {
  if (typeof lang !== "string") return;
  const seed = JSON.parse(readFileSync(join(APP, "library/catalogue-seed.json"), "utf8"));
  const entry = seed.grammar?.[lang];
  const here = catalogueOf(await getText("catalogue.json")).grammar?.[lang];
  const use = async (text, what) => {
    const checked = checkGrammar(JSON.parse(text));
    if (!checked.grammar) die(`seed-local: ${what} is refused: ${checked.errors.map((e) => e.message).join(" ")}`);
    const version = await grammarVersion(checked.grammar);
    useGrammar(checked.grammar, version);
    return { checked, version };
  };
  if (!entry || (here?.revision ?? 1) >= entry.revision) {
    if (here?.url) await use((await getText(here.url.replace(/^\/library\//, ""))) ?? die(`seed-local: this library's ${lang} grammar isn't there.`), `this library's ${lang} grammar`);
    return;
  }
  const text = readFileSync(join(APP, entry.url.replace(/^\/library\//, "library/")), "utf8");
  const { checked, version } = await use(text, `library/'s ${lang} grammar`);
  if (version !== entry.version) die(`seed-local: library/'s ${lang} grammar isn't version ${entry.version}.`);
  let more;
  if (entry.more) {
    const moreText = readFileSync(join(APP, entry.more.url.replace(/^\/library\//, "library/")), "utf8");
    if (!checkGrammarMore(JSON.parse(moreText), checked.grammar).more) die(`seed-local: library/'s ${lang} longer file is refused.`);
    await putText(entry.more.url.replace(/^\/library\//, ""), moreText);
    more = entry.more;
  }
  await putText(entry.url.replace(/^\/library\//, ""), text);
  await writeCatalogue((catalogue) => withGrammarEntry(catalogue, lang, grammarEntry(checked.grammar, version, more)));
  console.log(`seed-local: ${lang}'s grammar revision ${checked.grammar.revision} (${version}) put in first, as library/ has it`);
}

const catalogueOf = (text) => (text === null ? { format: "lexicommons-catalogue", v: 1, books: [], lists: {} } : JSON.parse(text));

// The catalog last, read again just before the write, so a change made meanwhile is kept; a few rounds at most.
async function writeCatalogue(change) {
  for (let round = 1; ; round++) {
    const fresh = await getText("catalogue.json");
    const text = JSON.stringify(change(catalogueOf(fresh)), null, 2) + "\n";
    if ((await getText("catalogue.json")) === fresh) return putText("catalogue.json", text);
    if (round === 5) die("seed-local: the catalog kept changing; run it again.");
  }
}

if (removing) {
  const language = option("language");
  if (!language) die("seed-local: --remove needs --language.");
  await writeCatalogue((catalogue) => withoutPack(catalogue, language, removing));
  console.log(`seed-local: ${removing} is no longer a default ${language} pack in ${persist}`);
} else {
  const path = resolve(argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--")) ?? die("seed-local: give the pack file."));
  const raw = path.endsWith(".js") || path.endsWith(".mjs") ? (await import(pathToFileURL(path).href)).default : JSON.parse(readFileSync(path, "utf8"));
  await grammarFirst(raw?.language);
  const catalogue = catalogueOf(await getText("catalogue.json"));
  const fetchPack = async (ref) => JSON.parse((await getText(ref.url.replace(/^\/library\//, ""))) ?? "null");
  const installed = await defaultInstalled(catalogue, raw?.language, fetchPack, raw?.id);
  const { pack, errors, warnings } = checkPack(raw, { installed });
  for (const w of warnings) console.log(`  warning  ${w.at}: ${w.message}`);
  if (!pack) die(`seed-local: the pack is refused:\n  ${errors.map((e) => `${e.at}: ${e.message}`).join("\n  ")}`);
  const version = await packVersion(pack);
  const previousRef = packRefs(catalogue, pack.language).find((ref) => ref.id === pack.id);
  // Its recordings, checked and put before the catalog names them.
  let audio = argv.includes("--drop-audio") ? null : previousRef?.version === version ? previousRef.audio : undefined;
  if (option("audio")) {
    const clips = option("clips") ?? die("seed-local: --audio needs --clips <dir>.");
    const checked = checkAudio(JSON.parse(readFileSync(resolve(option("audio")), "utf8")), pack, { forLibrary: true });
    if (!checked.audio) die(`seed-local: the recordings are refused:\n  ${checked.errors.map((e) => `${e.at}: ${e.message}`).join("\n  ")}`);
    for (const clip of clipsOf(checked.audio)) {
      const file = join(resolve(clips), clip);
      if (!existsSync(file)) die(`seed-local: ${clip} isn't in ${clips}.`);
      const bytes = readFileSync(file);
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (clipName(sha, clip.endsWith(".m4a") ? "m4a" : "mp3") !== clip) die(`seed-local: ${clip}'s bytes don't match its name.`);
      // Named by its bytes (checked above): one already there is these bytes, and stays.
      await r2.put(BUCKET, clipKey(clip), bytes, clip.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg");
    }
    const audioVer = await audioVersion(checked.audio);
    const key = audioKey(pack.id, version, audioVer);
    if ((await getText(key)) === null) await putText(key, audioText(checked.audio));
    audio = audioUrl(pack.id, version, audioVer);
    console.log(`  recordings: ${Object.keys(checked.audio.voices).length} voice(s), ${clipsOf(checked.audio).length} clips, at ${audio}`);
  }
  const optIn = argv.includes("--opt-in") ? true : argv.includes("--default") ? false : previousRef?.optIn === true;
  // --suggest: an opt-in pack Explore may suggest (its topics, its shelves), as library_publish's suggest.
  const suggest = optIn && (argv.includes("--suggest") || (!argv.includes("--opt-in") && previousRef?.suggest === true));
  if (argv.includes("--suggest") && !optIn) die("seed-local: --suggest is for an opt-in pack (--opt-in).");
  const entryOf = () => catalogueEntry(pack, version, { ...(audio ? { audio } : {}), optIn, suggest });
  const kindOf = optIn ? (suggest ? "a suggested opt-in" : "an opt-in") : "a default";
  if (previousRef?.version === version && (previousRef.audio ?? null) === (audio ?? null) && (previousRef.optIn === true) === optIn && (previousRef.suggest === true) === suggest) {
    console.log(`seed-local: ${pack.id}@${version} is already ${kindOf} pack; nothing to do`);
  } else if (previousRef?.version === version) {
    await writeCatalogue((current) => withPackEntry(current, pack.language, entryOf()));
    console.log(`seed-local: ${pack.id}@${version} is ${kindOf} pack and ${audio ? "has its recordings" : "has no recordings"} in ${persist}`);
  } else {
    if (previousRef) {
      const previous = await fetchPack(previousRef);
      const diff = previous ? compareVersions(previous, pack) : null;
      if (diff) console.log(`  from ${previousRef.version}: ${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed, ${diff.kept.length} kept`);
      if (diff?.removed.length && !argv.includes("--confirm-removed")) die(`seed-local: this version removes ${diff.removed.join(", ")}; give --confirm-removed to publish it anyway.`);
    }
    const key = packKey(pack.id, version);
    const there = await getText(key);
    if (there !== null && there !== packText(pack)) die(`seed-local: ${key} is there with other content; nothing changed.`);
    if (there === null) await putText(key, packText(pack));
    await writeCatalogue((current) => withPackEntry(current, pack.language, entryOf()));
    console.log(`seed-local: ${pack.id}@${version} (${pack.items.length} sentences) is ${kindOf} ${pack.language} pack in ${persist}`);
  }
}
await r2.close();
