// Open books: the shelf of the open library (books public domain in both the US and the EU, openly licensed picture
// books, and the layers made for them), from /library/catalogue.json (src/books.ts). Opening one fetches the book and
// its layers, checks them with book-format.js, and hands them over to be kept on the device (a picture book's pictures
// are the reader's to fetch: book-format.js picturePath). An admin can curate the shelf into sections (the catalog's
// optional `shelf`, read/catalogue.js): those come first, in order, each a row of covers, then every book in no
// section, by title. Where these books come from sits behind the info button.
//
//   loadCatalog()                                     the catalog, fetched fresh (one promise to share)
//   renderShelf(container, { catalog, open(record), known(lang) })
//     catalog    optional: loadCatalog()'s promise, when the page has one already
//     open       called with { meta, book, weaves: { <lang>: layer }, definitions: { <lang | "book">: { url, file } } }
//                once everything's fetched and checked (definitions that don't check out are left out; the book opens)
//     known      optional: the set of lemmas you know in a language, to show how much of a book you'd see in it
//   renderShelfSection(page, id, { open, known })      one section, all of it (#read/shelf/<id>)

import { holdReload } from "../lx/reload-holds.js";
import * as ui from "../lx/ui.js";
import { lookToast } from "../shell/look-watch.js";
import { el } from "../lx/ui.js";
import { heldHeight, heldPlace, keepHeight } from "../lx/shapes.js";
import { loadPictures, pictureNode } from "../study/pictures.js";
import { readableBooks, readableFor } from "./readable.js";
import { LANGUAGES, ownDrawingOf, coverageOf, validateBook, validateDefinitions, validateWeave } from "./book-format.js";
import { learning, learningName } from "../study/learning.js";
import { refreshGrammar } from "../study/grammar.js";

const CATALOGUE = "/library/catalogue.json";
// A row shows this many covers; a section with more gets "See all".
const ROW_LIMIT = 10;
// The lead shelf's grid: six covers shown (read.css .lx-shelf-grid), one more drawn for when the first moves up to Read's place up front.
const GRID_SHOWN = 6;
import { canWeaveInto } from "./weave-own.js";
import { aiConnected } from "../shell/layout.js";
const CREDITS = "These books are free to share. Picture books and stories come from Global Storybooks, StoryWeaver, Bloom and Wikijunior, under Creative Commons licenses. The classics are in the public domain, from Standard Ebooks and older printed editions. Every book names its source, authors and license inside.";
const languageName = (code) => LANGUAGES[code]?.name ?? code;

async function getJson(url, { fresh = false, onBytes = null } = {}) {
  const response = await fetch(url, { cache: fresh ? "no-cache" : "default", credentials: "same-origin" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  if (!onBytes || !response.body) return response.json();
  // Read as it comes, saying how much has: its size (Content-Length) when the server gives one, else 0.
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let have = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    have += value.length;
    onBytes(have, total, false);
  }
  onBytes(have, total, true);
  const bytes = new Uint8Array(have);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * How far a set of files has come, 0–1, from each one's bytes: weighed by their sizes when every one has one, else
 * equally; a file with no size counts once it's whole. (A compressed file's bytes can pass its size: it holds at 95%
 * until it's whole.)
 */
function progressOf(count, onProgress) {
  const files = Array.from({ length: count }, () => ({ have: 0, total: 0, done: false }));
  const tell = () => {
    const sized = files.every((f) => f.total > 0);
    let sum = 0;
    let weight = 0;
    for (const f of files) {
      const w = sized ? f.total : 1;
      sum += w * (f.done ? 1 : f.total ? Math.min(0.95, f.have / f.total) : 0);
      weight += w;
    }
    onProgress(weight ? sum / weight : 0);
  };
  return (i) => (have, total, done) => {
    Object.assign(files[i], { have, total, done });
    tell();
  };
}

/**
 * The catalog, fetched fresh, and kept on the device (Cache Storage) for Find a book offline: when it can't be fetched,
 * the kept one, marked `kept: true` (the books as they were when this device was last online). Throws with neither.
 */
const KEPT = "lx-read-catalog-v1";
export async function loadCatalog() {
  try {
    const response = await fetch(CATALOGUE, { cache: "no-cache", credentials: "same-origin" });
    if (!response.ok) throw new Error(`${CATALOGUE}: ${response.status}`);
    const copy = response.clone();
    globalThis.caches?.open(KEPT).then((cache) => cache.put(CATALOGUE, copy)).catch(() => {});
    return await response.json();
  } catch (error) {
    const kept = await globalThis.caches?.open(KEPT).then((cache) => cache.match(CATALOGUE)).catch(() => null);
    if (!kept) throw error;
    return { ...(await kept.json()), kept: true };
  }
}

/**
 * The catalog as this device kept it from its last fetch, or null: what Read draws in its first frame, before the fresh one is in (then
 * drawn again only if it changed). Not marked `kept`: that says "offline", and this is only the first frame's copy.
 */
export async function keptCatalog() {
  const kept = await globalThis.caches?.open(KEPT).then((cache) => cache.match(CATALOGUE)).catch(() => null);
  // (Read never opened on this device: Home's book card has kept it already for a learner who isn't reading anything, through
  // loadCatalog. Not the browser's own cache: WebKit won't give a no-cache response without asking, and says so as an error.)
  return kept ? kept.json().catch(() => null) : null;
}

/**
 * The kinds a shelf book is, for finding one: a picture book; non-fiction (a book that says it is: its catalog entry's kind); a book
 * woven into the language you're learning; a book in that language with help; one in that language without (the open library
 * publishes plain books first); any other language. In that order, each book one kind. [{ id, name, has(meta) }]
 */
export function bookKinds() {
  // The catalog counts a book's pictures (catalogue.js); a list is counted too.
  const picture = (meta) => (Array.isArray(meta.pictures) ? meta.pictures.length : Number(meta.pictures) || 0) > 0;
  const woven = (meta) => meta.layers?.[learning()]?.kind === "weave";
  const helped = (meta) => meta.lang === learning() && Object.values(meta.layers ?? {}).some((layer) => layer?.kind === "help");
  // A book that says it's non-fiction (its catalog entry's kind, catalogue.js) is that, before anything else: an illustrated one too.
  const nonfiction = (meta) => meta.kind === "nonfiction";
  return [
    // A picture book for another language is that language's: it goes under Other languages, as every other book does.
    { id: "picture", name: "Picture books", has: (meta) => forLearning(meta) && !nonfiction(meta) && picture(meta) },
    { id: "nonfiction", name: "Non-fiction", has: (meta) => forLearning(meta) && nonfiction(meta) },
    // The woven story: the one thing that shows what weaving is. It has no shelf of its own on Read: it's shown with Weave your own, up front
    // (library.js, wovenStory below; `shelf: false`). Find a book still finds it, as this kind. No other kind's name or line says woven (kindNote).
    { id: "woven", name: `Woven into ${learningName()}`, shelf: false, has: (meta) => forLearning(meta) && !nonfiction(meta) && !picture(meta) && woven(meta) },
    { id: "help", name: `In ${learningName()}, with help`, has: (meta) => forLearning(meta) && !nonfiction(meta) && !picture(meta) && !woven(meta) && helped(meta) },
    { id: "plain", name: `In ${learningName()}`, has: (meta) => forLearning(meta) && !nonfiction(meta) && !picture(meta) && !woven(meta) && !helped(meta) },
    { id: "other", name: "Other languages", has: (meta) => !forLearning(meta) },
  ];
}
/**
 * What a kind's shelf is, in a line under its heading, from the books on it: the woven story says what weaving is; books in the language you're
 * learning say which help they come with (a translation beside the text, or each word's meaning), from their own layers, and never that
 * they're woven. Null for a kind that needs no line.
 */
export function kindNote(kind, books) {
  const lang = learningName();
  if (kind === "woven") return `A story with the ${lang} words you know woven into it, each in its place. The more you learn, the more of it turns ${lang}.`;
  if (kind !== "picture" && kind !== "help") return null;
  const layers = books.flatMap((meta) => Object.entries(meta.layers ?? {}).filter(([, layer]) => layer?.kind === "help" || layer?.kind === "parallel"));
  const langs = [...new Set(layers.map(([code]) => languageName(code)))];
  if (!layers.length || langs.length !== 1) return kind === "picture" ? `Real books in ${lang}.` : null;
  const kinds = new Set(layers.map(([, layer]) => layer.kind));
  const how = kinds.size > 1 ? `with ${langs[0]} help` : kinds.has("help") ? `tap a word for its meaning in ${langs[0]}` : `with their ${langs[0]} translation beside the text`;
  return kind === "picture" ? `Real books in ${lang}: ${how}.` : `Books in ${lang}: ${how}.`;
}

// Where someone looks for more books: why the ones people are reading now aren't here, and what to do instead. Short, once. Where texts can be
// woven into the language, it ends there: a text only (an EPUB can't be woven yet), and it names an AI only to someone who has one connected
// (outside Weave your own, Read names none to anyone else).
const ownCopy = () =>
  `Most books people read today are under copyright, so the shelf can't carry them. Add your own copy below: an EPUB or a text file.${
    canWeaveInto(learning()) ? (aiConnected() ? " Your AI can weave a text." : " A text can be woven: see above.") : ""
  }`;

/**
 * The woven story for the language you're learning, or null: the book woven into it that isn't a picture book or non-fiction (the first by
 * title when there are several). What Read shows with Weave your own, so a press tries weaving before anything's asked.
 */
export function wovenStory(catalog) {
  const woven = bookKinds().find((kind) => kind.id === "woven");
  return (catalog?.books ?? []).filter(woven.has).sort((a, b) => (a.title < b.title ? -1 : 1))[0] ?? null;
}

/**
 * A catalog book's cover picture for ui.bookCover: its size from the catalog (coverSize), or, when it doesn't say (a book published
 * without it, a catalog kept from before), the open library's picture books' own shape, held as it is once the picture comes.
 */
export const PICTURE_BOOK_SIZE = [1073, 513];
export const coverOfMeta = (meta) => ({ src: meta.cover, ...(meta.coverSize ? { size: meta.coverSize } : { size: PICTURE_BOOK_SIZE, assumed: true }) });

/**
 * A cover that's a book's own drawing (book-format.js ownDrawingOf), so from the first frame: its paint holding the box, without the
 * designed cover's title, author or split (the drawing has its own light), and the drawing fading in once it's loaded. Never the designed
 * cover first and the drawing after: its tile would grow its title under it a moment late. Returns the face.
 */
export function asDrawn(face, drawing) {
  face.dataset.variant = "drawn";
  face.dataset.picture = drawing; // which drawing: never on two books
  for (const part of face.querySelectorAll(".lx-cover-head, .lx-cover-by, .lx-cover-split")) part.remove();
  loadPictures([drawing]).then((found) => {
    if (!found) return;
    face.prepend(pictureNode(drawing));
    requestAnimationFrame(() => face.setAttribute("data-loaded", ""));
  });
  return face;
}

export const kindOf = (meta) => bookKinds().find((kind) => kind.has(meta))?.id ?? "other";

/**
 * Fetches a catalog entry's book and layers, and checks them. Throws with a message a person can read. onProgress
 * (0–1): how far the book and its layers have come, up to 90% (the checks and the definitions are the rest).
 */
export const OFFLINE_OPEN = "Opening a book for the first time needs a connection. Books in your library open without one.";

export async function fetchOpenBook(meta, { onProgress = null } = {}) {
  const urls = [meta.book, ...Object.values(meta.layers ?? {}).map((layer) => layer.url)];
  const part = onProgress ? progressOf(urls.length, (share) => onProgress(0.9 * share)) : null;
  // No connection, or the library not answering, said in words: a fetch's own error ("Failed to fetch") says nothing.
  const [book, ...layers] = await Promise.all(urls.map((url, i) => getJson(url, { onBytes: part?.(i) }))).catch((error) => {
    throw new Error(navigator.onLine === false || error instanceof TypeError ? OFFLINE_OPEN : "This book can't be reached right now. Try again in a moment.");
  });
  const problems = await validateBook(book);
  if (problems.length || book.id !== meta.id || book.version !== meta.version) throw new Error("This book didn't arrive intact. Try again in a moment.");
  const weaves = {};
  for (const layer of layers) {
    // A layer's woven grammar names patterns of the language being learned: one a newer revision of its grammar added
    // passes once that revision is here (study/grammar.js).
    const intact = async () => !(await validateWeave(layer, book)).length;
    if (!(await intact()) && !((await refreshGrammar(layer.kind === "help" ? book.lang : layer.to)) && (await intact()))) throw new Error(`Its ${languageName(layer.to)} layer didn't arrive intact. Try again in a moment.`);
    weaves[layer.to] = layer;
  }
  const definitions = {};
  for (const [lang, entry] of Object.entries(meta.layers ?? {})) {
    const found = await fetchDefinitions(book, entry.definitions, weaves[lang] ? { layer: weaves[lang], layerUrl: entry.url } : {});
    if (found) definitions[lang] = found;
  }
  const own = await fetchDefinitions(book, meta.definitions);
  if (own) definitions.book = own;
  return { meta, book, weaves, definitions };
}

/**
 * A layer's definitions (or, with no layer, the book's own), fetched and checked against them: { url, file }, or
 * null when there are none or they don't check out (the book reads without them).
 */
export async function fetchDefinitions(book, entry, { layer = null, layerUrl = null } = {}) {
  if (!entry?.url) return null;
  // A layer file is named by its bytes' hash (catalogue.js layerKey): that's what the definitions say they're for.
  const layerSha = layerUrl?.match(/\.([0-9a-f]{12})\.json$/)?.[1] ?? null;
  if (layer && !layerSha) return null;
  try {
    const file = await getJson(entry.url);
    const problems = validateDefinitions(file, book, layer ? { layer, layerSha } : {});
    if (problems.length) {
      console.warn(`[lexicommons] ${book.id}'s definitions didn't check out:`, problems.slice(0, 3));
      return null;
    }
    return { url: entry.url, file };
  } catch {
    return null;
  }
}

function describe(meta) {
  const named = (role) => (meta.authors ?? []).filter((a) => (a.role ?? "author") === role).map((a) => a.name).join(", ");
  const by = [named("author"), named("translator") && `translated by ${named("translator")}`, named("illustrator") && `pictures by ${named("illustrator")}`];
  const layers = Object.entries(meta.layers ?? {});
  const woven = layers.filter(([, l]) => l.kind === "weave").map(([lang]) => languageName(lang));
  const help = layers.filter(([, l]) => l.kind === "help").map(([lang]) => languageName(lang));
  const beside = layers.filter(([, l]) => l.kind === "parallel").map(([lang]) => languageName(lang));
  return [
    by.filter(Boolean).join(", "),
    meta.level ? `Level ${meta.level}` : null,
    woven.length ? `Woven into ${woven.join(", ")}` : null,
    help.length ? `With ${help.join(", ")} help` : null,
    beside.length ? `With its ${beside.join(", ")} translation` : null,
    `${meta.words.toLocaleString()} words`,
  ].filter(Boolean).join(" · ");
}

// The language a book teaches, for its tile's flag: the one you're learning when the book is for it, else its first
// (a woven layer teaches the language it's woven into; a help layer, the book's own; then the book's own language, which
// it's read in plain: readable.js).
function taught(meta) {
  const langs = [...Object.entries(meta.layers ?? {}).map(([lang, layer]) => (layer.kind === "weave" ? lang : meta.lang)), meta.lang];
  return langs.includes(learning()) ? learning() : langs[0] ?? null;
}

// A book's line on its tile: its level and its layer.
function tileLine(meta) {
  const layers = Object.entries(meta.layers ?? {});
  const woven = layers.find(([, l]) => l.kind === "weave");
  return [meta.level ? `Level ${meta.level}` : null, woven ? `Woven into ${languageName(woven[0])}` : null].filter(Boolean).join(" · ");
}

// Whether a book is for the language you're learning (readable.js, the one answer Home, Read, Find a book and the kinds share).
const forLearning = (meta) => readableFor(meta, learning());

// The sections to show, in order: the shelf's curated ones (a book may sit in more than one; a section whose books have
// all gone isn't shown), then a shelf for each kind of book (bookKinds) of those in none of them; each with only the books
// for the language you're learning, and every other book last, under "Other languages". [{ id, title, books: [meta], find?, total? }]
function sectionsOf(catalog) {
  const books = catalog.books ?? [];
  const byId = new Map(books.filter(forLearning).map((meta) => [meta.id, meta]));
  const sections = (Array.isArray(catalog.shelf) ? catalog.shelf : [])
    .map((section) => ({ id: section.id, title: section.title, books: (section.books ?? []).map((id) => byId.get(id)).filter(Boolean) }))
    .filter((section) => section.title && section.books.length);
  const placed = new Set(sections.flatMap((section) => section.books.map((meta) => meta.id)));
  const byTitle = (a, b) => (a.title < b.title ? -1 : 1);
  // The groups made here take ids no curated section has, so each one's page (#read/shelf/<id>) is its own.
  const taken = new Set(sections.map((section) => section.id));
  const own = (id) => (taken.has(id) ? own(`${id}-`) : (taken.add(id), id));
  // The books in no curated section, a shelf for each kind (bookKinds), each with its way to all of that kind in Find a book.
  for (const kind of bookKinds()) {
    const these = books.filter((meta) => kind.has(meta) && (kind.id === "other" || !placed.has(meta.id))).sort(byTitle);
    // Its "All" counts what Find a book will show for the kind: the ones in curated sections too.
    const total = books.filter(kind.has).length;
    // A curated section named as the kind is that kind's shelf: its books first, then the rest of the kind (never two
    // shelves of one name).
    const named = sections.find((section) => !section.find && section.title.trim().toLowerCase() === kind.name.toLowerCase());
    if (named) Object.assign(named, { books: [...named.books, ...these.filter((meta) => !named.books.includes(meta))], find: kind.id, total });
    else if (these.length && kind.shelf !== false) sections.push({ id: own(kind.id), title: kind.name, books: these, find: kind.id, total });
  }
  // Each kind's shelf says what it is (kindNote).
  for (const section of sections) if (section.find) section.note = kindNote(section.find, section.books);
  return sections;
}

// Opening books from the shelf: one at a time, saying how it's going. Returns { choose(meta), tile(meta), status, stop }.
export function opener({ open, known }) {
  const status = el("p", { class: "lx-settings-message", role: "status" });
  const say = (text, tone) => {
    status.replaceChildren(text);
    if (tone) status.setAttribute("data-tone", tone);
    else status.removeAttribute("data-tone");
  };
  let stale = false;
  let opening = false;
  async function choose(meta, node = null) {
    if (opening) return;
    opening = true;
    // Its download's bar over the foot of the cover you pressed (the line says it too). No Tinta: opening a book is the
    // step into reading, where Tinta isn't.
    const bar = ui.downloadBar({ label: `Opening ${meta.title}`, tinta: false });
    node?.querySelector('[data-part="book-cover"]')?.append(bar);
    say(`Opening ${meta.title}…`);
    // While its file comes, the app doesn't reload into a new version by itself (shell/new-version.js).
    const release = holdReload("a book");
    try {
      const record = await fetchOpenBook(meta, { onProgress: (share) => bar.set(share) });
      release();
      if (stale) return;
      bar.done();
      bar.remove();
      say("");
      await open?.(record);
    } catch (error) {
      bar.stop();
      bar.remove();
      // Said where it's seen: in the app, a toast over the bottom of the screen (the line can be far below a long
      // shelf); mounted on its own, the line.
      if (stale) return;
      if (document.querySelector(".lx-toasts")) {
        say("");
        lookToast("wrong", error.message);
      } else say(error.message, "wrong");
    } finally {
      release();
      opening = false;
    }
  }
  const tile = (meta) => {
    const teaches = taught(meta);
    const node = ui.bookTile({
      id: meta.id,
      title: meta.title,
      lang: meta.lang,
      flag: teaches && teaches !== learning() ? { lang: teaches, label: languageName(teaches) } : undefined,
      cover: meta.cover ? coverOfMeta(meta) : { by: (meta.authors ?? []).find((a) => (a.role ?? "author") === "author")?.name },
      sub: tileLine(meta),
      onclick: () => choose(meta, node),
    });
    node.setAttribute("aria-label", `${meta.title}: ${describe(meta)}`);
    if (forLearning(meta)) node.setAttribute("data-for-learning", ""); // what Read's first view may offer
    // A real cover where a book has one; where it hasn't, its own drawing if it has one (never its kind's, which would
    // repeat across books), in place of the designed one once it's here; else the designed one, its title on it.
    const drawing = meta.cover ? null : ownDrawingOf(meta);
    if (drawing) {
      asDrawn(node.querySelector('[data-part="book-cover"]'), drawing);
      // Its title isn't on the drawing: it's said under it, as a picture book's is, from the first frame.
      const said = node.querySelector(".lx-tile-title");
      if (said) said.hidden = false;
    }
    // How much of it you'd follow, once its layer has been looked at: a woven book, how much you'd see in the
    // language you're learning; a book in that language, how many of its words you know.
    if (known) {
      for (const [lang, layer] of Object.entries(meta.layers ?? {})) {
        // A translation beside the book has no words of the language to count (a help layer's lemmas, a weave's).
        if (layer.kind === "parallel") continue;
        const learning = layer.kind === "help" ? meta.lang : lang;
        const bank = known(learning);
        if (!bank?.size) continue;
        getJson(layer.url)
          .then((weave) => {
            if (stale) return;
            const percent = Math.round(coverageOf(weave, bank).share * 100);
            const sub = node.querySelector(".lx-tile-sub");
            if (sub) sub.textContent = layer.kind === "help" ? [meta.level ? `Level ${meta.level}` : null, `you know ${percent}%`].filter(Boolean).join(" · ") : `Woven · ${percent}% in ${languageName(lang)} for you`;
          })
          .catch(() => {});
      }
    }
    return node;
  };
  return { choose, tile, status, stop: () => (stale = true) };
}

/** Mounts the shelf into `container`. Returns { dispose }. */
export function renderShelf(container, { catalog, open, known } = {}) {
  const { tile, status, stop } = opener({ open, known });
  const credits = ui.sheetLayer({ label: "Where these books come from" });
  credits.lxBody.append(el("h2", { class: "lx-sheet-title" }, "Where these books come from"), el("p", { class: "lx-sheet-text" }, CREDITS));
  // Until the catalog's in: the place the shelves took last time on this device (lx/shapes.js), else the loading line.
  const list = el("div", { class: "lx-shelf-sections" }, ...(heldHeight("read.shelf") ? heldPlace("read.shelf") : [ui.loadingState("Loading the open books…")]));
  // Find a book: a search across every open book, and its kinds, each to Find a book's page (find.js).
  // A search goes to Find a book with it; Read's field is empty again for when you come back (once the page has gone).
  const search = ui.searchField({
    label: "Search the open books",
    onsubmit: (q) => {
      location.hash = `#read/find${q.trim() ? `?${new URLSearchParams({ q: q.trim() })}` : ""}`;
      setTimeout(() => {
        const input = search.querySelector("input");
        if (input) input.value = "";
      }, 600);
    },
  });
  // (Offline, a line says what the kept shelf can do; the kinds of book are the shelves' own rows, below.)
  const kinds = el("div", { class: "lx-read-kinds-note" });
  container.replaceChildren(
    ui.sectionHead("Find a book", { info: { label: "Where these books come from", onclick: () => credits.lxOpen() } }),
    el("div", { class: "lx-read-find" }, search, kinds),
    list,
    status,
    credits,
  );
  let stale = false;
  // drawn: settles once the shelf is drawn, whatever it found (Read's first book up front waits on it, never on polling).
  const drawn = (async () => {
    let shelf;
    try {
      shelf = await (catalog ?? loadCatalog());
    } catch {
      if (!stale) list.replaceChildren(ui.emptyState("The open books can't be reached right now. They'll be here when you're back online.", { pose: "doze" }));
      return;
    }
    if (stale) return;
    // The books you can read (readable.js), as Home counts them and Find a book searches them: never a promise of ones you can't.
    const readable = readableBooks(shelf, learning());
    // With none for your language, Find a book offers the other languages' (find.js): the search counts what it will show.
    const offered = readable.length ? readable : (shelf.books ?? []);
    if (offered.length) search.querySelector("input")?.setAttribute("placeholder", `Search ${offered.length.toLocaleString("en")} ${offered.length === 1 ? "book" : "books"}`);
    // Offline, the shelf is the one this device kept: what it can and can't do, said once.
    if (shelf.kept) kinds.replaceChildren(el("p", { class: "lx-small lx-muted lx-read-none", "data-offline": "" }, "Offline: these are the open books as they were when you were last online. Opening one for the first time needs a connection."));
    const sections = sectionsOf(shelf);
    if (!sections.length) {
      list.replaceChildren(ui.emptyState("No open books yet.", { pose: "box" }));
      return;
    }
    // None for the language you're learning: a row of other languages' books mustn't look like a promise.
    const none = !(shelf.books ?? []).some(forLearning);
    // One shelf leads, its covers in a grid (a picture book two across, a designed cover four); every other shelf follows with its covers in
    // a row. Each one's All N, when it has more than it shows, goes to its page. Seven books look like a full shelf, and a hundred still fit.
    const noteOf = (section) => (section.note ? el("p", { class: "lx-small lx-muted lx-shelf-note" }, section.note) : null);
    const rowOf = (section) =>
      el(
        "div",
        { class: "lx-shelf-section", "data-kind": section.find ?? undefined },
        ui.sectionHead(section.title ?? "All of them", {
          sub: true,
          link: countOf(section) > Math.min(section.books.length, ROW_LIMIT) ? { href: hrefOf(section), label: `All ${countOf(section).toLocaleString("en")}` } : null,
        }),
        noteOf(section),
        ui.bookList(section.books.slice(0, ROW_LIMIT).map(tile), { layout: "row", label: section.title }),
      );
    const [lead, ...rest] = sections;
    const hrefOf = (section) => (section.find ? `#read/find?kind=${section.find}` : `#read/shelf/${encodeURIComponent(section.id)}`);
    const countOf = (section) => (section.find ? section.total : section.books.length);
    const grid = ui.bookList(lead.books.slice(0, GRID_SHOWN + 1).map(tile), { layout: "grid", label: lead.title });
    grid.classList.add("lx-shelf-grid");
    list.replaceChildren(
      // Said as an empty state, Tinta waiting on a box: honest about what isn't here yet, promising no when.
      ...(none ? [el("div", { class: "lx-read-none-yet" }, ui.emptyState(`No books in ${learningName()} yet. These are free to read in other languages.`, { pose: "box" }))] : []),
      el(
        "div",
        { class: "lx-shelf-section", "data-lead": "", "data-kind": lead.find ?? undefined },
        lead.title || lead.books.length > GRID_SHOWN
          ? ui.sectionHead(lead.title ?? "All of them", {
              sub: true,
              // More than the grid shows: its All (the seventh drawn is only for when the first moves up front, so never counted as shown).
              link: countOf(lead) > GRID_SHOWN ? { href: hrefOf(lead), label: `All ${countOf(lead).toLocaleString("en")}` } : null,
            })
          : null,
        noteOf(lead),
        grid,
      ),
      ...rest.map(rowOf),
      // Under the last shelf, where someone looks for more: why today's books aren't here, and the way to their own (Add a book or text, next).
      el("p", { class: "lx-small lx-muted lx-shelf-note", "data-part": "own-copy-note" }, ownCopy()),
    );
    // Its place for next time, so a Read drawn before the catalog's in holds exactly this.
    keepHeight("read.shelf", list);
  })();
  return {
    drawn,
    // A tile of the shelf's own (its opener: the same press and download bar), for a book the shelf doesn't draw (library.js's first book).
    tile,
    dispose: () => {
      stale = true;
      stop();
      credits.lxClose({ animate: false });
    },
  };
}

/**
 * The books to start with for the language you're learning, in order: a curator's own (the shelf's sections, as they put them), then the
 * rest easiest first: by level (a book with none after those with one), then by length, then by title.
 */
export function startingBooks(catalog) {
  const readable = readableBooks(catalog, learning());
  const byId = new Map(readable.map((meta) => [meta.id, meta]));
  const curated = [...new Set((Array.isArray(catalog?.shelf) ? catalog.shelf : []).flatMap((section) => section.books ?? []))].map((id) => byId.get(id)).filter(Boolean);
  const chosen = new Set(curated.map((meta) => meta.id));
  const level = (meta) => (Number.isFinite(meta.level) ? meta.level : Infinity);
  const rest = readable.filter((meta) => !chosen.has(meta.id)).sort((a, b) => level(a) - level(b) || (a.words ?? 0) - (b.words ?? 0) || (a.title < b.title ? -1 : 1));
  return [...curated, ...rest];
}

/** The shelf for the language you're learning, as Home's book card opens on it: the books to start with, and how many it has. */
export function shelfStart(catalog, n = 4) {
  const books = startingBooks(catalog);
  return { books: books.slice(0, n).map((meta) => ({ id: meta.id, title: meta.title, lang: meta.lang })), count: books.length };
}

/** The first book to offer for the language you're learning (Read's "A good first book"), from the catalog alone; null with none. */
export function firstBookOf(catalog) {
  return startingBooks(catalog)[0] ?? null;
}

/** One of the shelf's sections, all of it, as a grid (#read/shelf/<id>). Returns { title, back, dispose }. */
export function renderShelfSection(page, id, { open, known } = {}) {
  const { tile, status, stop } = opener({ open, known });
  const body = ui.loadingState("Loading the open books…");
  page.replaceChildren(body, status);
  let stale = false;
  (async () => {
    let shelf;
    try {
      shelf = await loadCatalog();
    } catch {
      if (!stale) body.replaceChildren("The open books can't be reached right now. They'll be here when you're back online.");
      return;
    }
    if (stale) return;
    const section = sectionsOf(shelf).find((s) => s.id === id);
    if (!section) {
      body.replaceChildren("That shelf isn't there any more.");
      return;
    }
    body.replaceWith(ui.pageTitle(section.title ?? "Open books", `${section.books.length} open books`), ui.bookList(section.books.map(tile), { layout: "grid", label: section.title }));
  })();
  return {
    title: "Open books",
    back: { href: "#read", label: "Read" },
    dispose: () => {
      stale = true;
      stop();
    },
  };
}
