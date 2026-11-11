// A language's word-frequency list from the open library (/library/catalogue.json → lists.frequency.<lang>): which
// words are most used, for the order new words come in and for "you'd know about N% of the words in everyday Dutch".
// Loaded once in the background; until it's here (or offline, or for a language without one) everything that uses
// it works without it. Its numbers are always shown with its attribution (frequencyCredit).

import { everydayShare, frequencyRanks, validateFrequency } from "../read/book-format.js";

const CATALOGUE = "/library/catalogue.json";
const lists = new Map(); // lang → { list, ranks, entry }
const loading = new Map();
const listeners = new Set();

/** Fetches and checks a language's list (once). Resolves to it, or null when there's none or it can't be fetched. */
export function loadFrequency(lang = "nl") {
  if (lists.has(lang)) return Promise.resolve(lists.get(lang).list);
  if (!loading.has(lang)) {
    loading.set(
      lang,
      (async () => {
        const catalogue = await (await fetch(CATALOGUE, { credentials: "same-origin" })).json();
        const entry = catalogue?.lists?.frequency?.[lang];
        if (!entry?.url) return null;
        const response = await fetch(entry.url, { credentials: "same-origin" });
        if (!response.ok) return null;
        const list = await response.json();
        if (validateFrequency(list).length || list.lang !== lang) return null;
        lists.set(lang, { list, ranks: frequencyRanks(list), entry });
        // When it came, for whoever measures a start (study-check: before the app's first draw, lx-app-ready).
        globalThis.performance?.mark?.(`lx-frequency-${lang}`);
        for (const fn of listeners) fn(lang);
        return list;
      })().catch(() => {
        // Offline or not published yet: try again next time it's asked for.
        loading.delete(lang);
        return null;
      }),
    );
  }
  return loading.get(lang);
}

/** Which list is in for a language, for a key (study/plan-kept.js): its catalog address (named by its content), one handed in, or "none". */
export function frequencyVersion(lang = "nl") {
  const kept = lists.get(lang);
  if (!kept) return "none";
  return kept.entry?.url ?? `in hand: ${kept.list.v} ${JSON.stringify(kept.list.made ?? null)} ${kept.list.lemmas?.length ?? 0}`;
}

/** The list if it's loaded, else null. */
export const frequencyList = (lang = "nl") => lists.get(lang)?.list ?? null;

/** A lemma's rank (1: the most used), or Infinity when it isn't listed or the list isn't loaded. */
export const rankOf = (lemma, lang = "nl") => lists.get(lang)?.ranks.get(lemma) ?? Infinity;

/** The share of everyday running words that are lemmas you know: { known, counted, share }, or null without a list. */
export function everyday(known, lang = "nl") {
  const list = frequencyList(lang);
  return list ? everydayShare(list, known) : null;
}

/** What to credit wherever the list's numbers are shown: { corpus, license, attribution: [{ what, name, url }] }, or null. */
export function frequencyCredit(lang = "nl") {
  const list = frequencyList(lang);
  return list ? { corpus: list.corpus.name, licence: list.licence, attribution: list.attribution.map(({ what, name, url }) => ({ what, name, url })) } : null;
}

/** Calls fn(lang) when a list arrives. Returns a function to stop. */
export function onFrequency(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** For the tests: use a list that's already in hand. */
export function useFrequency(list) {
  if (validateFrequency(list).length) throw new Error("Not a valid frequency list.");
  lists.set(list.lang, { list, ranks: frequencyRanks(list), entry: null });
  for (const fn of listeners) fn(list.lang);
}
