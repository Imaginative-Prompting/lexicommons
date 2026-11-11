// What the open library says, for your AI (src/mcp-coach.ts): what's longer about a grammar pattern (lang/grammar.js), why each word of a sentence is there (study/pack-notes.js), and which form a word is.
// The record stays what the device built; these are read from the library when asked for, so its size limit never meets them. Every file here was checked when an admin published it, and each is named by its
// content, so a parsed one is kept while this isolate lives. A file that can't be read leaves its part out: your AI still has the record.

import { grammarReady, grammarNow, grammarRef } from "./grammar";
import type { Env } from "./env";
import type { StudyRecord } from "./coach";
import { formsKey, formsRef, notesKey, notesRef } from "../public/js/study/pack-notes.js";
import { packRefs } from "../public/js/study/pack-format.js";
import { moreKey } from "../public/js/lang/grammar.js";

const normal = (text: unknown) => String(text ?? "").toLocaleLowerCase().replace(/[.!?,;:"“”]/g, "").replace(/\s+/g, " ").trim();
const bare = (text: string) => text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "").toLocaleLowerCase();

const KEPT = 6;
const kept = new Map<string, unknown>();
async function readJson<T>(env: Env, key: string): Promise<T | null> {
  if (kept.has(key)) return kept.get(key) as T;
  const object = await env.LIBRARY.get(key);
  if (!object) return null;
  const value = JSON.parse(await object.text()) as T;
  if (kept.size >= KEPT) kept.delete(kept.keys().next().value as string);
  kept.set(key, value);
  return value;
}
async function readCatalogue(env: Env): Promise<unknown> {
  const object = await env.LIBRARY.get("catalogue.json");
  return object ? JSON.parse(await object.text()) : null;
}

type Forms = { forms: Record<string, Record<string, string>> };
type Notes = { source?: unknown; items: Record<string, { text: string; words: Record<string, string>[] }> };
type More = { concepts: Record<string, { explain: string; examples: unknown[]; contrasts: unknown[]; mistakes: unknown[]; source: unknown }> };

/** A grammar pattern as the library has it: { chip?, short?, more? }. Nothing for a pack's own pattern, or a language with none yet. */
export async function patternFromLibrary(env: Env, language: string, id: string) {
  try {
    const catalogue = await readCatalogue(env);
    await grammarReady(env, language, catalogue);
    const pattern = (grammarNow(language)?.patterns as Record<string, { chip?: string; short?: string }> | undefined)?.[id];
    const ref = grammarRef(catalogue, language) as { more?: { version: string } } | null;
    const more = ref?.more ? await readJson<More>(env, moreKey(language, ref.more.version) as string) : null;
    const long = more?.concepts && Object.hasOwn(more.concepts, id) ? more.concepts[id] : null;
    return { ...(pattern?.chip ? { chip: pattern.chip } : {}), ...(pattern?.short ? { short: pattern.short } : {}), ...(long ? { more: long } : {}) };
  } catch {
    return {};
  }
}

/** Which form a word is, when it isn't its dictionary form: [{ word, line }], any word this written form can be. */
export async function formFromLibrary(env: Env, language: string, written: string) {
  try {
    const ref = formsRef(await readCatalogue(env), language) as { version: string } | null;
    const forms = ref ? await readJson<Forms>(env, formsKey(language, ref.version) as string) : null;
    if (!forms) return [];
    const form = bare(written);
    return Object.entries(forms.forms).filter(([, lines]) => Object.hasOwn(lines, form)).slice(0, 6).map(([word, lines]) => ({ word, line: lines[form]! }));
  } catch {
    return [];
  }
}

/**
 * One sentence of theirs, by its id or its words, with why each word is there: words, or null where nobody's written that yet. A note was written for one text, so a sentence that has changed since just has none.
 * Words with no note say which form they are, when the library knows.
 */
export async function sentenceFromLibrary(env: Env, record: StudyRecord, asked: string) {
  const sentences = (record.sentences ?? {}) as Record<string, { nl?: string; en?: string; literal?: string[]; words?: string[] }>;
  const want = normal(asked);
  const id = Object.hasOwn(sentences, asked) ? asked : Object.keys(sentences).find((key) => key.split("/").pop() === asked || normal(sentences[key]!.nl) === want);
  if (!id) return { found: false as const, note: `"${asked.slice(0, 200)}" isn't one of the sentences they've had. study_summary and study_concept list theirs; a sentence's words or its id both work here.` };
  const sentence = sentences[id]!;
  const base = { found: true as const, id, sentence: sentence.nl, en: sentence.en, literal: sentence.literal };
  const tokens = String(sentence.nl ?? "").split(" ");
  try {
    const catalogue = await readCatalogue(env);
    const packId = id.includes("/") ? id.slice(0, id.indexOf("/")) : null;
    // Only the library's own packs have notes, and only while the catalog lists them: a pack taken off is gone from here too, and a pack someone shared has none.
    const listed = packId !== null && (packRefs(catalogue, record.language) as { id: string }[]).some((pack) => pack.id === packId);
    const ref = listed ? (notesRef(catalogue, packId) as { version: string } | null) : null;
    const notes = ref && packId ? await readJson<Notes>(env, notesKey(packId, ref.version) as string) : null;
    const itemId = id.split("/").pop()!;
    const entry = notes?.items && Object.hasOwn(notes.items, itemId) ? notes.items[itemId]! : null;
    if (entry && entry.text === sentence.nl && entry.words.length === tokens.length) {
      return { ...base, words: entry.words.map((note, i) => ({ text: tokens[i], ...note })), source: notes!.source };
    }
    // None written for it: which form each word is, by the words the record says it has.
    const formsAt = formsRef(catalogue, record.language) as { version: string } | null;
    const forms = formsAt ? await readJson<Forms>(env, formsKey(record.language, formsAt.version) as string) : null;
    const lemmas = sentence.words ?? [];
    const lines = tokens.flatMap((text) => {
      const form = bare(text);
      const word = lemmas.find((lemma) => forms?.forms && Object.hasOwn(forms.forms, lemma) && Object.hasOwn(forms.forms[lemma]!, form));
      return word ? [{ text, form: forms!.forms[word]![form]! }] : [];
    });
    return { ...base, words: null, forms: lines, note: "Nobody's written why each word is here for this sentence yet: explain it yourself, and say it's your own reading." };
  } catch {
    return { ...base, words: null, note: "The library's notes couldn't be read just now: explain it yourself." };
  }
}
