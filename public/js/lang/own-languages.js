// A learner's own languages on this device: languages Lexicommons doesn't list that a pack of theirs is in (a pack's languageDef;
// lang/index.js useLanguage). Kept in localStorage ("lx.ownLanguages.v1": { code: definition }), so the app knows them from its first line:
// the language you're learning may be one, so study/learning.js imports this before it reads which. A device keeps one definition of a
// language: a pack that says another is refused (pack-format.js checkPack). Deleting the account or this device's progress clears it with
// every lx.* key (shell/settings.js).
import { LANGUAGES, useLanguage } from "./index.js";

const KEY = "lx.ownLanguages.v1";

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

for (const [code, def] of Object.entries(read())) useLanguage(code, def);

/**
 * A pack's language kept on this device, when it's one of its own (it carries languageDef): "ours" (nothing to keep), "added", "same", or
 * "differs" (this device holds another definition of it: the pack is refused where it's checked).
 */
export function keepOwnLanguage(pack) {
  if (!pack || typeof pack !== "object" || typeof pack.language !== "string" || pack.languageDef === undefined) return "ours";
  const result = useLanguage(pack.language, pack.languageDef);
  if (result === "added") {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...read(), [pack.language]: LANGUAGES[pack.language].def }));
    } catch {}
  }
  return result;
}
