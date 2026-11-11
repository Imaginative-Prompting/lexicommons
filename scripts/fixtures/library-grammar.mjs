// The shared grammar a device has once its library names one: each language's revision in library/catalogue-seed.json, checked and
// installed into the registry (lang/grammar.js useGrammar), as study/grammar.js does before a device checks any pack. A test that loads
// packs/ imports this first: Lexicommons' own packs may use a pattern from a later revision than the app's own (revision 1).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkGrammar, grammarVersion, useGrammar } from "../../public/js/lang/grammar.js";

const APP = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const seed = JSON.parse(readFileSync(join(APP, "library/catalogue-seed.json"), "utf8"));
for (const [lang, entry] of Object.entries(seed.grammar ?? {})) {
  const checked = checkGrammar(JSON.parse(readFileSync(join(APP, entry.url.replace(/^\/library\//, "library/")), "utf8")));
  if (!checked.grammar) throw new Error(`library/: ${lang}'s grammar is refused: ${checked.errors.map((e) => e.message).join(" ")}`);
  const version = await grammarVersion(checked.grammar);
  if (version !== entry.version) throw new Error(`library/: ${lang}'s grammar isn't version ${entry.version}`);
  useGrammar(checked.grammar, version);
}
