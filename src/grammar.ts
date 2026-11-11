// A language's shared grammar on the Worker (public/js/lang/grammar.js). Before anything is checked against a
// language's patterns (a pack, a fix, a default pack or a weave being published, a request about a pattern), the
// catalog's revision of that grammar is installed into the registry, so the server checks against the same grammar the
// devices sync. A grammar file is named by its content, so one fetched is kept for the isolate's life; installing only
// ever moves forward (useGrammar), so requests at once never see an id taken away.

import {
  checkGrammar as checkGrammarJs,
  grammarKey as grammarKeyJs,
  grammarNow as grammarNowJs,
  grammarRef as grammarRefJs,
  grammarVersion as grammarVersionJs,
  keepsEveryId as keepsEveryIdJs,
  useGrammar as useGrammarJs,
} from "../public/js/lang/grammar.js";
import type { Env } from "./env";

export interface GrammarPattern {
  name: string;
  about: string;
  after: string[];
  source: Record<string, string>;
  retired?: true;
}
export interface Grammar {
  format: string;
  version: number;
  language: string;
  revision: number;
  patterns: Record<string, GrammarPattern>;
}
export interface GrammarRef {
  revision: number;
  version: string;
  url: string;
more?: { version: string; url: string };
}
interface Problem {
  at: string;
  message: string;
}

// The shared module is plain JS: its functions, typed as they're called here.
export const checkGrammar = checkGrammarJs as unknown as (value: unknown, options?: { previous?: Grammar | null }) => { grammar: Grammar | null; errors: Problem[]; warnings: Problem[] };
export const grammarNow = grammarNowJs as unknown as (lang: string) => (Grammar & { libraryVersion: string | null }) | null;
export const grammarRef = grammarRefJs as unknown as (catalogue: unknown, lang: string) => GrammarRef | null;
export const grammarVersion = grammarVersionJs as unknown as (grammar: Grammar) => Promise<string>;
export const grammarKey = grammarKeyJs as unknown as (lang: string, version: string) => string;
const keepsEveryId = keepsEveryIdJs as unknown as (before: Grammar | null, next: Grammar) => boolean;
const useGrammar = useGrammarJs as unknown as (grammar: Grammar, version: string | null) => boolean;

const fetched = new Map<string, Grammar>(); // "<lang>/<version>" → the checked grammar

async function readCatalogue(env: Env): Promise<unknown> {
  const object = await env.LIBRARY.get("catalogue.json");
  return object ? JSON.parse(await object.text()) : null;
}

/**
 * Installs the catalog's revision of a language's grammar (catalogue: the catalog already read, if the caller has it),
 * when it's newer than the one installed here. A file that's missing or doesn't pass is logged and left out: the
 * grammar installed stays, and a pack using what it would add is refused until it's fixed.
 */
export async function grammarReady(env: Env, language: unknown, catalogue?: unknown): Promise<void> {
  if (typeof language !== "string") return;
  const now = grammarNow(language);
  if (!now) return;
  const ref = grammarRef(catalogue === undefined ? await readCatalogue(env) : catalogue, language);
  if (!ref || ref.revision <= now.revision) return;
  const cacheKey = `${language}/${ref.version}`;
  let grammar = fetched.get(cacheKey) ?? null;
  if (!grammar) {
    const object = await env.LIBRARY.get(grammarKey(language, ref.version));
    let raw: unknown = null;
    try {
      raw = object ? JSON.parse(await object.text()) : null;
    } catch {}
    const checked = raw ? checkGrammar(raw) : null;
    const problem = !checked?.grammar
      ? `it's ${object ? "not a grammar that passes the check" : "missing from the library"}`
      : checked.grammar.language !== language || checked.grammar.revision !== ref.revision
        ? "it isn't the language and revision the catalog says"
        : (await grammarVersion(checked.grammar)) !== ref.version
          ? "its content doesn't match its version"
          : !keepsEveryId(now, checked.grammar)
            ? "it leaves out patterns the installed grammar has"
            : null;
    if (problem) {
      console.warn(JSON.stringify({ grammar_not_installed: `${language} revision ${ref.revision} (${ref.version}): ${problem}` }));
      return;
    }
    grammar = checked!.grammar!;
    fetched.set(cacheKey, grammar);
  }
  useGrammar(grammar, ref.version);
}
