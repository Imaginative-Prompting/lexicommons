// Explore's home, as last seen, kept on this device: in memory, and in localStorage ("lx.explore-home.v1", per account
// and language), so the home shows at once when you come back to it, after a restart and offline, and is brought up to
// date quietly (stale-while-revalidate: explore.js renderHome). What's kept is what the server answered, nothing more:
// the home's shelves, the topics, the packs you added that a report took down, the featured pack's first sentence, the
// books shared for the language (its shelf's first few), and each language's pack count. Deleting the account takes it with every other "lx." key (Settings).

import { api } from "../shell/api.js";

const KEY = "lx.explore-home.v1";
const LANGUAGES_KEPT = 6; // per account: the languages last looked at
const BOOKS_KEPT = 6; // the books on the home's shelf

let account = null;
const memory = new Map(); // `${account}\n${lang}` → entry; `${account}\n#counts` → counts
const asking = new Map(); // the same key → the request on its way

/** Whose home this device keeps (the signed-in account's id): each account's is its own. */
export function setExploreAccount(id) {
  if (id === account) return;
  account = id;
  memory.clear();
  asking.clear();
}

function readAll() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved && typeof saved.accounts === "object" && saved.accounts) return saved;
  } catch {}
  return { accounts: {} };
}
function savedOf(all) {
  const mine = all.accounts[account];
  return mine && typeof mine === "object" ? mine : { homes: {}, counts: null };
}
function keep(change) {
  try {
    const all = readAll();
    const mine = savedOf(all);
    change(mine);
    // The newest few languages only.
    const langs = Object.entries(mine.homes ?? {}).sort(([, a], [, b]) => (b?.at ?? 0) - (a?.at ?? 0));
    mine.homes = Object.fromEntries(langs.slice(0, LANGUAGES_KEPT));
    all.accounts[account] = mine;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

// An entry is what the server answered, checked for its shape before it's used (a device's copy can be anything).
// A kept book has what its tile draws (books.js bookTileOf); a home from before books were kept has none.
const isBook = (b) => Boolean(b) && typeof b === "object" && typeof b.id === "string" && typeof b.title === "string" && typeof b.language === "string" && Array.isArray(b.layers) && Array.isArray(b.authors);
const isEntry = (e) => Boolean(e) && typeof e === "object" && Array.isArray(e.home?.sections) && Array.isArray(e.home?.popular) && Array.isArray(e.home?.new) && "feature" in e.home && Array.isArray(e.topics) && Array.isArray(e.down) && (e.books === undefined || (Array.isArray(e.books) && e.books.every(isBook)));
/** A sample's words as the server gives them for a language with readings: [text, lemma, reading] each (explore.js draws them by Study's rule). */
const sampleWords = (words) => Array.isArray(words) && words.length > 0 && words.every((w) => Array.isArray(w) && typeof w[0] === "string" && (w[1] == null || typeof w[1] === "string") && (w[2] == null || typeof w[2] === "string"));
const isCounts = (c) => Boolean(c) && typeof c === "object" && !Array.isArray(c) && Object.values(c).every((n) => typeof n === "number");

/** The home in `lang` as last seen on this device, or null: { home, topics, down, sample, books, at } (books: [] from before they were kept). */
export function keptHome(lang) {
  if (!account) return null;
  const id = `${account}\n${lang}`;
  if (memory.has(id)) return memory.get(id);
  const saved = savedOf(readAll()).homes?.[lang];
  if (!isEntry(saved)) return null;
  memory.set(id, saved);
  return saved;
}

/** Each language's pack count as last seen ({ code: n }), or null. */
export function keptCounts() {
  if (!account) return null;
  const id = `${account}\n#counts`;
  if (memory.has(id)) return memory.get(id);
  const saved = savedOf(readAll()).counts;
  if (!isCounts(saved)) return null;
  memory.set(id, saved);
  return saved;
}

/** The featured pack: the first curated one, else the server's choice, and why (community.ts featureOf). */
export function featuredOf(home) {
  const first = home.sections.find((section) => section.items.length);
  return first ? { first, featured: first.items[0], why: null } : { first: null, featured: home.feature?.item ?? null, why: home.feature?.why ?? null };
}

/**
 * The home in `lang` from the server, with the featured pack's first sentence, so the page draws it whole in one step.
 * Kept for next time. Rejects when it couldn't be had (offline, or the server said no); what's kept stays as it was.
 */
export function fetchHome(lang) {
  const id = `${account}\n${lang}`;
  if (asking.has(id)) return asking.get(id);
  const request = (async () => {
    // The books for the language, popular first: the home's shelf of them (books.js booksShelf). Books not answering leave the shelf out.
    const [home, topics, down, shared] = await Promise.all([
      api(`/api/community/explore?lang=${encodeURIComponent(lang)}`),
      api("/api/community/topics"),
      api("/api/community/following/down"),
      api(`/api/community/books?${new URLSearchParams({ learning: lang, sort: "popular" })}`).catch(() => null),
    ]);
    const books = Array.isArray(shared?.books) ? shared.books.slice(0, BOOKS_KEPT).map(({ id, title, authors, language, layers, level }) => ({ id, title, authors, language, layers, level })) : [];
    const { featured } = featuredOf(home);
    // The featured pack's first sentence: the card is drawn with it, never filled in after.
    const found = featured ? await api(`/api/community/items/${encodeURIComponent(featured.id)}`).catch(() => null) : null;
    const s = found?.sample?.[0];
    const sample = s && typeof s.sentence === "string" ? { sentence: s.sentence, literal: s.literal, punct: s.punct, natural: s.natural, ...(sampleWords(s.words) ? { words: s.words } : {}) } : null;
    const entry = { home, topics, down, sample, books, at: Date.now() };
    if (!isEntry(entry)) throw new Error("Explore's answer wasn't what this app expects. Try again.");
    if (account === id.split("\n")[0]) {
      memory.set(id, entry);
      keep((mine) => (mine.homes = { ...mine.homes, [lang]: entry }));
    }
    return entry;
  })().finally(() => asking.delete(id));
  asking.set(id, request);
  return request;
}

/** How many live packs each language has, from the server: { code: n }, kept for next time; null when it couldn't be asked. */
export async function fetchCounts() {
  const rows = await api("/api/community/languages").catch(() => null);
  if (!Array.isArray(rows)) return null;
  const counts = Object.fromEntries(rows.filter((r) => typeof r?.lang === "string" && typeof r.packs === "number").map(({ lang, packs }) => [lang, packs]));
  if (account) {
    memory.set(`${account}\n#counts`, counts);
    keep((mine) => (mine.counts = counts));
  }
  return counts;
}

/** Whether two entries would draw the same page (when they do, a refresh changes nothing on the screen). */
export const sameHome = (a, b) => JSON.stringify([a?.home, a?.topics, a?.down, a?.sample, a?.books ?? []]) === JSON.stringify([b?.home, b?.topics, b?.down, b?.sample, b?.books ?? []]);
