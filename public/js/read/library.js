// The Read tab: your library, covers first. The book you're reading to carry on, then every text kept on this device
// (each with a cover: its picture, art your AI made for it, or its title on a plain one), the ways to add one in a
// sheet, and the open books. A text opens in the reader over this page (#read/book/<id>, reader.js), so closing it lands
// back here.
//   #read              your library, and adding a text (paste, a plain-text file or an EPUB, from the picker or dropped
//                      on the page, or your AI adding it)
//   #read/paste        paste a text
//   #read/shelf/<id>   one of the open books' sections, all of it

import * as ui from "../lx/ui.js";
import { heldPlace, keepHeight } from "../lx/shapes.js";
import { el } from "../lx/ui.js";
import * as store from "./store.js";
import { MAX_TEXT_BYTES, bookFromText } from "./import-text.js";
import { onSyncStatus, syncTargets } from "../sync.js";
import { LANGUAGES, coverageOf, joinWords, picturePath, weaveSentence } from "./book-format.js";
import { canWeaveInto, storyLine, tryWeaving, weaveOwn } from "./weave-own.js";
import { aiConnected } from "../shell/layout.js";
import { FLIP_AT, isTarget, pieceGap } from "./woven-text.js";
import { bookFromEpub } from "./import-epub.js";
import { dismissFailedText, failedTexts, onTextsChange } from "./text-inbox.js";
import { learning, learningFrom, learningName } from "../study/learning.js";
import { firstBookOf, keptCatalog, loadCatalog, renderShelf, renderShelfSection, wovenShare, wovenStory } from "./shelf.js";
import { icon } from "../lx/icons.js";
import { renderFind } from "./find.js";
import { bookArt, bookOpens } from "../know/home-cards.js";
import { knownSet } from "./bank.js";
import { knownShare, onTranslateIndex } from "../translate/translate.js";
import { looksLike } from "./paste-language.js";
import { languageRow as pickLanguageRow, wheelOrder } from "../translate/picker.js";

const KEEP_NOTE = {
  kept: "Your texts are kept on this device only, and it won't clear them to make space.",
  "may-clear": "Your texts are kept on this device only. Adding the app to your home screen makes it less likely to clear them when space runs low.",
  visit: "This window can't keep texts (private browsing?), so they last until you close it.",
};
// The same with your texts going to your other devices too (read/store.js, the texts kind: your account's copy or your own storage).
// (Your account keeps 12 MB a file: a text longer than about ten novels, a hundred thousand words each, stays on this device, and Read lists
// it under Kept on this device only.)
const KEEP_NOTE_SYNCED = {
  kept: "Your texts are kept with your account and on this device, which won't clear them to make space. One longer than about ten novels stays on this device only.",
  "may-clear": "Your texts are kept with your account and on this device. Adding the app to your home screen makes this device less likely to clear its copy when space runs low. One longer than about ten novels stays on this device only.",
  visit: "Your texts are kept with your account. This window can't keep its own copy (private browsing?), so here they last until you close it. One longer than about ten novels stays on this device only.",
};

// The language a text on the device teaches, for its tile's flag: the languages it's woven into and its own, leaving out
// the one you learn from; the one you're learning when it's among them.
const taughtBy = (book, woven) => {
  const langs = [...(woven.get(book.id) ?? []), book.lang].filter((lang) => lang && lang !== learningFrom() && LANGUAGES[lang]);
  return langs.includes(learning()) ? learning() : langs[0] ?? null;
};

const percent = (book, positions) => {
  const word = positions.get(book.id)?.word ?? 0;
  return book.words > 1 ? Math.round((word / (book.words - 1)) * 100) : 0;
};

function sourceLabel(book) {
  const by = book.authors?.map((a) => a.name).join(", ");
  if (by) return by;
  if (book.source?.kind === "upload") return book.source.ref ?? "A file";
  return "";
}

/** Adds a text and opens it. */
async function addAndOpen(book) {
  await store.addBook(book);
  location.hash = `#read/book/${encodeURIComponent(book.id)}`;
}

const isEpub = (file) => /\.epub$/i.test(file.name) || file.type === "application/epub+zip";
const isText = (file) => /\.txt$/i.test(file.name) || file.type === "text/plain";

/**
 * The language you're learning when a plain text looks like it's in it (as a pasted text is guessed: paste-language.js), else nothing, and
 * the text says for itself (a Gutenberg header) or is read as English. A text's language is how its words split and what a tap looks up:
 * read as English, a Japanese file's every paragraph was one word.
 */
async function learningIfItLooksIt(text) {
  const mine = learning();
  if (mine === "en") return null;
  const sample = text.trim().slice(0, 2000);
  if (sample.length < 12) return null;
  const [share, english] = await Promise.all([knownShare(sample, mine), knownShare(sample, "en")]).catch(() => [0, 0]);
  return looksLike(share, english) ? mine : null;
}

/** Brings a file in as a text (an EPUB, or plain text) and opens it; say(message, tone) reports how it went. */
async function addFile(file, say) {
  try {
    if (!isEpub(file) && !isText(file)) throw new Error("That isn't an EPUB or a plain-text file (.txt).");
    say("Opening…");
    if (isEpub(file)) return await addAndOpen(await bookFromEpub(file, { fileName: file.name }));
    if (file.size > MAX_TEXT_BYTES) throw new Error(`That file is ${Math.round(file.size / 1e6)} MB; a text can be up to ${MAX_TEXT_BYTES / 1e6} MB.`);
    const text = await file.text();
    await addAndOpen(await bookFromText(text, { fileName: file.name, lang: await learningIfItLooksIt(text) }));
  } catch (error) {
    say(error.message, "wrong");
  }
}

function fileOpener(say) {
  const input = el("input", { type: "file", accept: ".epub,.txt,application/epub+zip,text/plain", hidden: true, "aria-label": "Open an EPUB or a text file" });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) addFile(file, say);
  });
  return input;
}

/**
 * On a computer, a file dropped anywhere in the window (while Read shows) comes in like an opened one; nowhere can the
 * browser take it and leave the app to open it. Returns a function to stop.
 */
function acceptDrops(page, say) {
  const overlay = el("div", { part: "read-drop", hidden: true }, "Drop an EPUB or a text file to add it");
  page.append(overlay);
  let depth = 0;
  const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes("Files");
  const show = (on) => (overlay.hidden = !on);
  const enter = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth++;
    show(true);
  };
  const over = (event) => hasFiles(event) && event.preventDefault();
  const leave = () => {
    depth = Math.max(0, depth - 1);
    if (!depth) show(false);
  };
  const drop = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth = 0;
    show(false);
    const file = event.dataTransfer.files?.[0];
    if (file) addFile(file, say);
  };
  addEventListener("dragenter", enter);
  addEventListener("dragover", over);
  addEventListener("dragleave", leave);
  addEventListener("drop", drop);
  return () => {
    removeEventListener("dragenter", enter);
    removeEventListener("dragover", over);
    removeEventListener("dragleave", leave);
    removeEventListener("drop", drop);
    overlay.remove();
  };
}

function message() {
  const node = el("p", { class: "lx-settings-message lx-read-message", role: "status" });
  node.say = (text, tone) => {
    node.replaceChildren(text);
    if (tone) node.setAttribute("data-tone", tone);
    else node.removeAttribute("data-tone");
  };
  return node;
}

// A text's cover, best first: art your AI made for it, its own cover picture (book-format.js coverPicture: its `cover`,
// else its first page's picture; kept on the device, or the library's copy), else none (bookCover designs one). urls
// collects the object URLs to let go of later.
async function coverOf(entry, urls) {
  if (entry.cover?.file) {
    const blob = await store.getPicture(entry.cover.file);
    if (blob) {
      const src = URL.createObjectURL(blob);
      urls.push(src);
      return { src, art: true };
    }
  }
  // Entries saved before covers had their own field: their first picture is their cover.
  const file = entry.coverFile ?? entry.pictures?.[0];
  if (file) {
    const blob = await store.getPicture(file);
    if (!blob) return { src: `/library/${picturePath(file)}` };
    const src = URL.createObjectURL(blob);
    urls.push(src);
    return { src };
  }
  return { by: sourceLabel(entry) };
}

/** Sentences of a book as pieces of text, woven as the reader weaves them when there's a weave: [{ text, target }]. */
function passageOf(text, ranges, weave, lang) {
  if (!weave) return [{ text: ranges.map(([s, e]) => joinWords(text.words.slice(s, e), " ", text.lang)).join(" "), target: false }];
  const known = knownSet(lang);
  const bySentence = new Map(weave.sentences.map((sentence) => [sentence.s, sentence]));
  const out = [];
  for (const [s, e] of ranges) {
    const sentence = bySentence.get(s);
    const shown = sentence ? weaveSentence(sentence, text.words, known, { flipAt: FLIP_AT, lang: weave.to, from: weave.from }) : null;
    const pieces = shown ? shown.words.filter((piece) => piece.show !== "hidden") : text.words.slice(s, e).map((word) => ({ show: "en", text: word }));
    pieces.forEach((piece, i) => {
      const gap = i ? pieceGap(pieces[i - 1], piece, weave.to, Boolean(shown?.flipped)) : out.length ? " " : "";
      if (gap) out.push({ text: gap, target: false });
      out.push({ text: piece.text, target: isTarget(piece) });
    });
  }
  return out;
}

/**
 * A book of yours' cover, as Read draws it, and a picture of its (Home's book card): { cover, picture, urls }, picture its address or null, urls the
 * object URLs to let go of when it's gone.
 */
export async function coverOfBook(id, file = null) {
  const entry = (await store.listBooks()).find((book) => book.id === id);
  const urls = [];
  const cover = entry ? await coverOf(entry, urls) : {};
  let picture = null;
  if (file) {
    const blob = await store.getPicture(file).catch(() => null);
    picture = blob ? URL.createObjectURL(blob) : `/library/${picturePath(file)}`;
    if (blob) urls.push(picture);
  }
  return { cover, picture, urls };
}

/**
 * A book of yours as a tile: its cover, how far in you are, the language it teaches when that isn't yours. Woven into the language you learn
 * (by your AI, or a book of the shelf's), its line says so: that's how a text you asked your AI to weave is found.
 */
function yourTile(book, { cover, positions, woven }) {
  const share = percent(book, positions) / 100;
  const teaches = taughtBy(book, woven);
  const wovenInto = (woven.get(book.id) ?? []).includes(learning()) ? learning() : null;
  const wovenLine = wovenInto ? `Woven into ${LANGUAGES[wovenInto]?.name ?? wovenInto}` : null;
  const tile = ui.bookTile({
    id: book.id,
    title: book.title,
    lang: book.lang,
    flag: teaches && teaches !== learning() ? { lang: teaches, label: LANGUAGES[teaches]?.name ?? teaches } : undefined,
    cover,
    sub: wovenLine ?? (book.openedAt ? `${Math.round(share * 100)}% read` : undefined),
    progress: book.openedAt ? share : null,
    href: `#read/book/${encodeURIComponent(book.id)}`,
  });
  // A woven text says how much of it shows in the language for you so far, 0% included: to someone new it reads in English, and the card
  // says so before they open it. Once its layer's been read off this device.
  if (wovenInto) {
    store
      .getWeave(book.id, wovenInto)
      .then((layer) => {
        const sub = tile.querySelector(".lx-tile-sub");
        if (layer?.kind !== "weave" || !sub) return;
        sub.textContent = `${wovenLine} · ${Math.round(coverageOf(layer, knownSet(wovenInto)).share * 100)}% so far`;
      })
      .catch(() => {});
  }
  return tile;
}
// Your library on Read is a row of the latest; more than this and its heading has the way to all of them.
const LIBRARY_ROW = 12;

// The ways to add a text, in a sheet: paste, open a file, or have your AI add it (a prompt to copy).
function addSheet(input) {
  const sheet = ui.sheetLayer({ label: "Add a book or text" });
  sheet.lxBody.append(
    el("h2", { class: "lx-sheet-title" }, "Add a book or text"),
    el(
      "ul",
      { part: "list" },
      ui.listRow({ icon: "pencil", title: "Paste a text", sub: "A story, an article, anything you'd like to read", href: "#read/paste" }),
      ui.listRow({
        icon: "upload",
        title: "Open a file",
        sub: "An EPUB or a plain-text file (.txt), such as a Project Gutenberg book",
        onclick: () => {
          sheet.lxClose({ animate: false });
          input.click();
        },
      }),
    ),
    el("p", { part: "group-note" }, "On a computer you can also drop a file anywhere on Read."),
  );
  // Going to paste closes it (the page under it changes).
  sheet.lxBody.querySelector('a[href="#read/paste"]')?.addEventListener("click", () => sheet.lxClose({ animate: false }));
  return sheet;
}

function renderLibrary(page) {
  const msg = message();
  const input = fileOpener(msg.say);
  const sheet = addSheet(input);
  // What's on this device comes a moment after the page (shell/main.js shows the page once it's in); slower than
  // that, these hold their places as they were last time (lx/shapes.js), so nothing moves when they come.
  const carryOn = el("div", { class: "lx-library-continue" }, ...heldPlace("read.continue"));
  const yours = el("section", { class: "lx-library-section lx-read-texts", "aria-label": "Your library" }, ...heldPlace("read.library"));
  // Texts your AI added that this device couldn't read: each with why, and Remove.
  const failed = el("div", { class: "lx-library-failed" });
  // Texts your account's copy doesn't hold, as the last syncs found (read/store.js textsOnlyHere): drawn again when that changes.
  let onlyHere = [];
  const drawFailed = () => {
    store.textsOnlyHere().then((list) => {
      if (stale || JSON.stringify(list) === JSON.stringify(onlyHere)) return;
      onlyHere = list;
      drawFailed();
    }, () => {});
    const rows = failedTexts();
    failed.replaceChildren(
      ...(rows.length
        ? [ui.group("Your AI couldn't add these", rows.map((f) => ui.listRow({ icon: "info", title: f.title, sub: f.why, trailing: ui.button("Remove", { size: "sm", onclick: () => dismissFailedText(f.changeId) }) })))]
        : []),
      // Texts from your other devices that couldn't be read here (read/store.js): tried again at each sync; Hide takes one off the list.
      ...(store.textsTurnedDown().length
        ? [
            ui.group(
              "These couldn't come from your other devices",
              store.textsTurnedDown().map((f) =>
                ui.listRow({ icon: "info", title: f.title, sub: "It couldn't be read here, so it's still only on your other device. It's tried again each time this device syncs.", trailing: ui.button("Hide", { size: "sm", onclick: () => store.hideTurnedDown(f.key) }) }),
              ),
            ),
          ]
        : []),
      // Texts your account's copy doesn't hold (too big for it, or it's full): they stay on this device, said here.
      ...(onlyHere.length
        ? [
            ui.group(
              "Kept on this device only",
              onlyHere.map((t) => ui.listRow({ icon: "info", title: t.title, sub: t.why === "big" ? "Too big to keep with your account, so it stays on this device." : "Your account's copy is full, so it stays on this device for now." })),
            ),
          ]
        : []),
    );
  };
  const shelf = el("section", { class: "lx-library-section lx-read-shelf", "aria-label": "Find a book" });
  const note = el("p", { part: "group-note" });
  // Adding your own is the quiet way in, a row at the page's foot that says what it does: finding a book is Read's face.
  const addRow = ui.listRow({ icon: "plus", title: "Add a book or text", sub: "Paste a text, or open a file", onclick: () => sheet.lxOpen(), opens: "sheet" });
  addRow.querySelector('[data-part="list-row"]')?.setAttribute("data-read-add", "");
  sheet.lxBody.append(note); // where your books are kept: said where you add one
  // Weave your own (weave-own.js): Read's lead where the language can be woven into, after the book you're in. Its words and its steps are that
  // file's; the one press it has opens Add a book or text, where today's way in starts.
  const weaving = el("section", { class: "lx-library-section lx-weave-own", part: "weave-your-own", "aria-label": "Weave your own" });
  // The woven story (shelf.js wovenStory) sits with it, right under what weaving is: one press tries it before anything's asked. Where the
  // language has the story but texts of your own can't be woven into it yet, the story alone with what weaving is; with neither, nothing.
  let story = null; // { meta, tile }: the catalog's woven story and the shelf's own tile for it
  const drawWeaving = () => {
    const open = canWeaveInto(learning());
    const words = open ? weaveOwn(learningName(), aiConnected()) : story ? tryWeaving(learningName()) : null;
    // Drawn again only when what it says changes (an AI connected since, another language, the story come or gone).
    const from = JSON.stringify([words, story?.meta.id ?? null, story?.meta.version ?? null]);
    if (weaving.lxFrom === from) return;
    weaving.lxFrom = from;
    if (!words) return weaving.replaceChildren();
    const row = story
      ? el(
          "div",
          { class: "lx-weave-own-story" },
          story.tile,
          el("button", { class: "lx-weave-own-see", type: "button", onclick: () => story.tile.click() }, el("span", { class: "lx-weave-own-see-text" }, storyLine(story.meta.title), story.share), icon("chevron")),
        )
      : null;
    weaving.replaceChildren(
      ui.sectionHead(words.title),
      el("p", { class: "lx-weave-own-about" }, words.about),
      ...(row ? [row] : []),
      // Connected: the one message to give your AI, to copy (as the AI section's prompts are), what to put after it and what happens next.
      ...(words.message
        ? [
            el("p", { class: "lx-small lx-muted" }, words.lead),
            el("div", { part: "ask-prompt", class: "lx-weave-own-message" }, el("span", { class: "lx-ask-prompt-text" }, words.message), ui.copyButton(() => words.message)),
            el("p", { class: "lx-weave-own-next" }, `${words.after} ${words.next}`),
          ]
        : []),
      ...(open ? [el("p", { class: "lx-small lx-muted" }, [words.expect, words.needs].filter(Boolean).join(" "))] : []),
      ...(words.byHand ? [el("p", { class: "lx-small lx-muted" }, words.byHand)] : []),
      ...(open ? [words.connect ? ui.button(words.connect.label, { variant: "gray", onclick: () => (location.hash = words.connect.href) }) : ui.button("Add a text", { variant: "gray", icon: "plus", onclick: () => sheet.lxOpen() })] : []),
    );
  };
  drawWeaving();
  // The book you're in is up front, so it isn't also on the shelf under it.
  let readingId = null;
  let stopOpening = null;
  let aside = null;
  const setAside = () => {
    if (aside && aside.id !== readingId) {
      aside.home.prepend(aside.tile);
      aside = null;
    }
    if (!readingId || aside) return;
    const tile = shelf.querySelector(`[data-part="book-tile"][data-book="${CSS.escape(readingId)}"]`);
    if (!tile) return;
    aside = { tile, home: tile.parentElement, id: readingId };
    tile.remove();
  };
  new MutationObserver(setAside).observe(shelf, { childList: true, subtree: true });
  page.replaceChildren(
    // Its title on the page, as every page you went into has it (the header holds only the way back).
    ui.pageTitle("Read"),
    el(
      "div",
      { class: "lx-library" },
      // The book you're in, then finding one (the search, the shelf, its kinds), then yours.
      carryOn,
      weaving,
      shelf,
      yours,
      failed,
      // How opening a file went, right under the way to add one.
      el("div", { class: "lx-library-add" }, el("ul", { part: "list" }, addRow), msg),
    ),
    input,
    sheet,
  );
  let stale = false;
  const urls = [];
  const stopDrops = acceptDrops(page, msg.say);
  // The shelf in the first frame from the catalog this device kept (shelf.js keptCatalog), the fresh one fetched behind it and drawn only if it
  // changed (refreshShelf); with nothing kept yet, the fresh one.
  const keptFirst = keptCatalog();
  let catalog = keptFirst.then((kept) => kept ?? loadCatalog());
  // Open books from the library (shelf.js): opening one keeps it here, with its woven layers, and opens it. Each says
  // how much of it you'd see in the language you're learning, from your words and your studying.
  let shelfView = renderShelf(shelf, { catalog, known: knownSet, open: openRecord });
  // What the shelf was drawn from: coming back to Read reads the catalog again, and draws the shelf again only when it
  // changed (new books, or the connection gone or back), never otherwise.
  const shelfKey = (c) => JSON.stringify([c.kept ?? false, (c.books ?? []).map((m) => [m.id, m.version]), c.shelf ?? null, learning()]);
  let shelfFrom = null;
  let heroFromOldShelf = false;
  catalog.then((c) => (shelfFrom ??= shelfKey(c)), () => {});
  // The connection going or coming back while Read is up: the shelf follows (the kept books and "Offline:", or the live ones).
  const onNetwork = () => refreshShelf();
  addEventListener("online", onNetwork);
  addEventListener("offline", onNetwork);
  keptFirst.then((kept) => kept && refreshShelf(), () => {});
  // Each refresh's turn: one started later (the connection going or coming back meanwhile) has the newer word, so an older one's catalog
  // arriving after it is dropped (a fetch begun online that landed after going offline drew the live shelf over "Offline:").
  let refreshes = 0;
  const refreshShelf = async () => {
    const turn = ++refreshes;
    let fresh;
    try {
      fresh = await loadCatalog();
    } catch {
      return; // nothing to be had and nothing kept: what's drawn stays
    }
    if (stale || turn !== refreshes || shelfKey(fresh) === shelfFrom) return;
    shelfFrom = shelfKey(fresh);
    catalog = Promise.resolve(fresh);
    shelfView?.dispose?.();
    shelfView = renderShelf(shelf, { catalog, known: knownSet, open: openRecord });
    // A first book up front came from the old shelf: it comes from the new one.
    heroFromOldShelf = Boolean(carryOn.querySelector('[data-part="book-tile"]')?.lxShelf);
    drawnFrom = "";
    await load();
  };
  // What the library was last drawn from: read again each time, and drawn again only when it differs, so coming back
  // to Read repaints nothing (no new covers, nothing moving under a finger) unless something changed.
  let drawnFrom = "";
  const load = async () => {
    drawWeaving();
    const [books, positions, keep, reading, meta, woven] = await Promise.all([store.listBooks(), store.getPositions(), store.keepState(), continueReading(), catalog.then((c) => c, () => null), store.weaveLanguages()]);
    if (stale) return;
    // The woven story for the language, with the shelf's own tile for it (its press, its download's bar): kept while it's the same book.
    const found = meta ? wovenStory(meta) : null;
    if ((found?.id ?? null) !== (story?.meta.id ?? null) || (found?.version ?? null) !== (story?.meta.version ?? null)) {
      story = found && shelfView?.tile ? { meta: found, tile: shelfView.tile(found), share: el("span", { class: "lx-weave-own-share" }) } : null;
    }
    // How much of it shows in the language for you, as the shelf's tiles word it, 0% included: someone new knows it opens in English. Worked
    // out each time Read is shown (your words change; its layer is fetched once).
    if (story) {
      const mine = story;
      wovenShare(mine.meta, learning(), knownSet(learning()))
        .then((percent) => {
          const line = percent == null ? "" : `Woven · ${percent}% in ${learningName()} for you`;
          if (mine.share.textContent !== line) mine.share.replaceChildren(line);
        })
        .catch(() => {});
    }
    drawWeaving();
    note.textContent = (syncTargets().length ? KEEP_NOTE_SYNCED : KEEP_NOTE)[keep];
    const levelOf = (id) => meta?.books?.find((b) => b.id === id)?.level;
    const from = JSON.stringify([
      books.map((b) => [b.id, b.title, b.lang, b.openedAt, b.cover?.file, b.coverFile, b.pictures?.[0], percent(b, positions), taughtBy(b, woven), levelOf(b.id)]),
      reading && [reading.id, reading.title, reading.page, reading.chapter, reading.read, reading.follow, reading.layer, reading.lang],
    ]);
    if (from === drawnFrom) return;
    drawnFrom = from;
    const covers = await Promise.all(books.map((entry) => coverOf(entry, urls)));
    if (stale) return;
    const coverFor = new Map(books.map((entry, i) => [entry.id, covers[i]]));
    if (reading) {
      // A book that was up front goes back on its shelf.
      const up = carryOn.querySelector('[data-part="book-tile"]');
      if (up?.lxShelf) {
        up.lxShelf.prepend(up);
        up.lxShelf.scrollLeft = 0;
      }
      const entry = books.find((b) => b.id === reading.id);
      const where = reading.page ? `Page ${reading.page.n} of ${reading.page.of}` : reading.chapter.of > 1 ? `Chapter ${reading.chapter.n} of ${reading.chapter.of}` : `${Math.round(reading.read * 100)}% read`;
      const level = levelOf(reading.id);
      // The book drawn as Home's card draws it (one drawing for one book), opening onto where you are; its title once, where you are on one line.
      // A picture book opens beside its page's picture, as on Home's card.
      const page = reading.picture ? await coverOfBook(reading.id, reading.picture).catch(() => null) : null;
      if (stale) return;
      for (const url of page?.urls ?? []) urls.push(url);
      const art = bookArt({ reading, picture: page?.picture ?? null, language: learningName() });
      stopOpening?.();
      carryOn.replaceChildren(
        ui.continueCard({
          art,
          kicker: "Continue reading",
          title: reading.title,
          lang: entry?.lang,
          meta: [where, level ? `Level ${level}` : null].filter(Boolean).join(" · "),
          note: reading.follow == null ? null : reading.layer === "help" ? `You know ${Math.round(reading.follow * 100)}% of its words` : `${Math.round(reading.follow * 100)}% of it in ${LANGUAGES[reading.lang]?.name ?? "the language"} for you`,
          action: { label: "Continue", variant: "go", onclick: () => (location.hash = `#read/book/${encodeURIComponent(reading.id)}`) },
        }),
      );
    } else {
      // Nothing started: the first open book for you is the page's one thing, picked from the catalog (shelf.js firstBookOf), so
      // with none (no books for the language, or no catalog at all) the place goes at once, never held empty. Its tile moves up
      // here, the same one, so a press on its cover and its download's bar work as on the shelf: the shelf draws from the same
      // catalog, so it's there as soon as the shelf is.
      // (A book you've started, on another device too, is never offered as a first book: it's in Your library with how far you are.)
      const first = meta ? firstBookOf(meta, { started: new Set(books.filter((b) => b.openedAt || positions.get(b.id)?.word > 0).map((b) => b.id)) }) : null;
      const held = heroFromOldShelf ? null : carryOn.querySelector('[data-part="book-tile"]');
      heroFromOldShelf = false;
      let firstTile = first && held?.dataset.book === first.id ? held : null;
      if (first && !firstTile) {
        await shelfView?.drawn;
        if (stale) return;
        firstTile = shelf.querySelector(`[data-part="book-tile"][data-book="${CSS.escape(first.id)}"]`);
        // The easiest isn't always among the shelf's first tiles (it's by title): one of its own, from the shelf's opener (no shelf to go
        // back to: lxShelf stays empty).
        if (!firstTile && shelfView?.tile) firstTile = shelfView.tile(first);
      }
      if (stale) return;
      if (firstTile) {
        firstTile.lxShelf ??= firstTile.parentElement;
        carryOn.replaceChildren(
          ui.continueCard({
            cover: firstTile,
            kicker: "A good first book",
            title: firstTile.querySelector(".lx-tile-title")?.textContent ?? "",
            meta: firstTile.querySelector(".lx-tile-sub")?.textContent ?? "",
            action: { label: "Start reading", variant: "go", onclick: () => firstTile.click() },
          }),
        );
      } else carryOn.replaceChildren();
    }
    keepHeight("read.continue", carryOn);
    if (reading) stopOpening = bookOpens(carryOn);
    readingId = reading?.id ?? null;
    setAside();
    // Your library: the latest you opened or added (the one up front aside), a row; all of them a page away. Until there's one, nothing here:
    // the open books lead, and Add a book or text (the page's foot) is the way to your own.
    const others = (reading ? books.filter((b) => b.id !== reading.id) : books).sort((a, b) => (b.openedAt ?? b.addedAt ?? 0) - (a.openedAt ?? a.addedAt ?? 0));
    yours.replaceChildren(
      ...(books.length
        ? [
            ui.sectionHead("Your library", books.length > LIBRARY_ROW || (others.length && books.length > 3) ? { link: { href: "#read/library", label: `All ${books.length}` } } : {}),
            others.length
              ? ui.bookList(
                  others.slice(0, LIBRARY_ROW).map((book) => yourTile(book, { cover: coverFor.get(book.id), positions, woven })),
                  { layout: "row", label: "Your library" },
                )
              : el("p", { class: "lx-small lx-muted lx-read-none" }, "Only the book you're reading so far."),
          ]
        : []),
    );
    keepHeight("read.library", yours);
    // Its first screen whole when it's shown: the shelf drawn (from the kept catalog, at once), and the picture up front decoded, since it
    // sets its own height and one arriving later would push everything under it (in the browser's cache after a first visit, so quick).
    // Capped; the shelf's covers keep their row's height and fade in as they come (ui.bookCover).
    await Promise.race([
      (async () => {
        await shelfView?.drawn;
        const hero = carryOn.querySelector('[data-part="book-cover"] > img');
        if (hero) await ((hero.loading = "eager"), hero.decode().catch(() => {}));
      })(),
      new Promise((done) => setTimeout(done, 300)),
    ]);
  };
  drawFailed();
  // Shown whole once the library on this device is drawn (shell/main.js reveal).
  const ready = load();
  // Your AI's texts arrive, go and come back through the relay: Read follows (text-inbox.js).
  const stopTexts = onTextsChange(() => {
    if (stale) return;
    drawFailed();
    load();
  });
  // What's kept on this device changing (a book opened from here, its pages turned, one taken out): Read follows a moment after the last
  // change, under the book while it's open, so it's already as it'll be when the book closes (never redrawn in the frames after).
  let followTimer = 0;
  const stopReading = store.onReadingChange(() => {
    clearTimeout(followTimer);
    followTimer = setTimeout(() => !stale && load(), 300);
    if (!stale) drawFailed();
  });
  // A sync's end: what your account's copy holds may have changed.
  const stopSyncWatch = onSyncStatus((status) => !stale && !status.syncing && drawFailed());
  return {
    title: "Read",
    ready,
    // Coming back to Read (the shell keeps it): what's there stays until what's on the device has been read again.
    refresh: () => {
      if (stale) return;
      drawFailed();
      load();
      refreshShelf();
    },
    dispose: () => {
      stale = true;
      removeEventListener("online", onNetwork);
      removeEventListener("offline", onNetwork);
      stopTexts();
      stopReading();
      stopSyncWatch();
      clearTimeout(followTimer);
      stopOpening?.();
      shelfView?.dispose?.();
      stopDrops();
      sheet.lxClose({ animate: false });
      for (const url of urls) URL.revokeObjectURL(url);
    },
  };
}

/** Your library, all of it (#read/library): searched by title as you type, sorted by when you opened it, its title or how far in you are. */
function renderYourLibrary(page) {
  const urls = [];
  let sort = "recent";
  let q = "";
  let stale = false;
  let shown = { books: [], covers: new Map(), positions: {}, woven: new Map() };
  const grid = el("div", { class: "lx-read-library-all" });
  const title = ui.pageTitle("Your library");
  const plainText = (text) => String(text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const draw = () => {
    const needle = plainText(q.trim());
    const books = shown.books
      .filter((book) => !needle || plainText(book.title).includes(needle))
      .sort((a, b) =>
        sort === "title" ? (plainText(a.title) < plainText(b.title) ? -1 : 1) : sort === "progress" ? percent(b, shown.positions) - percent(a, shown.positions) : (b.openedAt ?? b.addedAt ?? 0) - (a.openedAt ?? a.addedAt ?? 0),
      );
    grid.replaceChildren(
      books.length
        ? ui.bookList(books.map((book) => yourTile(book, { cover: shown.covers.get(book.id), positions: shown.positions, woven: shown.woven })), { layout: "grid", label: "Your library" })
        : el("p", { class: "lx-small lx-muted" }, shown.books.length ? "None of your books has that in its title." : "Nothing here yet."),
    );
  };
  const search = ui.searchField({ label: "Search your library", onsubmit: () => {} });
  search.querySelector("input")?.addEventListener("input", (event) => {
    q = event.target.value;
    draw();
  });
  const order = ui.segmented([["recent", "Recent"], ["title", "Title"], ["progress", "Progress"]], sort, (value) => ((sort = value), draw()), "Sort");
  const body = el("div", { class: "lx-stack lx-read-library-page", "data-for": location.hash }, title, search, order, grid);
  page.replaceChildren(body);
  (async () => {
    const [books, positions, woven] = await Promise.all([store.listBooks(), store.getPositions(), store.weaveLanguages()]);
    const covers = await Promise.all(books.map((entry) => coverOf(entry, urls)));
    if (stale) return;
    shown = { books, covers: new Map(books.map((b, i) => [b.id, covers[i]])), positions, woven };
    title.querySelector("p")?.remove();
    // Nothing yet: nothing to search or sort, only where books come from.
    if (!books.length) {
      search.remove();
      order.remove();
      grid.replaceChildren(
        ui.emptyState("Nothing here yet. Books you open or add are kept here, on this device.", { pose: "box" }),
        ui.button("Find a book", { icon: "search", onclick: () => (location.hash = "#read/find") }),
      );
      body.dataset.ready = "";
      return;
    }
    title.append(el("p", { class: "lx-muted" }, `${books.length} ${books.length === 1 ? "book or text" : "books and texts"}, on this device`));
    draw();
    body.dataset.ready = "";
  })();
  return {
    title: "Your library",
    back: { href: "#read", label: "Read" },
    dispose: () => {
      stale = true;
      for (const url of urls) URL.revokeObjectURL(url);
    },
  };
}

// Opening an open book: kept here, with its woven layers, then opened.
async function openRecord({ book, weaves, definitions }) {
  await store.addBook(book, weaves, { definitions, from: "shelf" });
  location.hash = `#read/book/${encodeURIComponent(book.id)}`;
}

function renderPaste(page) {
  const msg = message();
  // Its language decides how its words and sentences split (a Dutch "bijv." doesn't end a sentence).
  let lang = "en";
  let picked = false;
  // One row, and the wheel on a press: the language you're learning and English first, as they're what a text most likely is, then the rest by name.
  const nameOf = (code) => LANGUAGES[code]?.name ?? code;
  const languageRow = pickLanguageRow({
    title: "Its language",
    codes: wheelOrder([learning(), "en"], Object.keys(LANGUAGES), nameOf),
    current: lang,
    nameOf,
    onchange: (code) => {
      lang = code;
      picked = true;
      guessed.replaceChildren();
    },
  });
  const language = ui.group(null, [languageRow]);
  const guessed = el("p", { class: "lx-small lx-muted", role: "status" });
  const title = el("input", { part: "text-field", name: "title", maxlength: 200, placeholder: "Optional", autocomplete: "off" });
  const body = el("textarea", { part: "text-field", name: "text", class: "lx-paste-text", rows: 8, placeholder: "Paste or type the text here", spellcheck: "false" });
  // A text in the language you're learning says so, unless you've chosen: its splitting, and a tap on a word, depend on it.
  let guessing = 0;
  const guess = async () => {
    const mine = learning();
    const pasted = body.value.trim();
    const asked = ++guessing;
    if (picked || mine === "en" || pasted.length < 12) return;
    const text = pasted.slice(0, 2000);
    const [share, english] = await Promise.all([knownShare(text, mine), knownShare(text, "en")]).catch(() => [0, 0]);
    if (asked !== guessing || picked) return;
    const next = looksLike(share, english) ? mine : "en";
    if (next === lang) return;
    lang = next;
    languageRow.lxSet(next);
    guessed.replaceChildren(next === mine ? `It looks like ${nameOf(next)}, so that's chosen. Change it above if it isn't.` : "");
  };
  body.addEventListener("input", guess);
  // The packs may still be arriving: what the device knows changes the answer.
  const stopGuessing = onTranslateIndex(guess);
  const add = ui.button("Add and read", {
    variant: "go",
    block: true,
    onclick: async () => {
      try {
        if (!body.value.trim()) throw new Error("Paste a text first.");
        await guess();
        if (new Blob([body.value]).size > MAX_TEXT_BYTES) throw new Error(`That's too long: a text can be up to ${MAX_TEXT_BYTES / 1e6} MB.`);
        await addAndOpen(await bookFromText(body.value, { title: title.value, lang }));
      } catch (error) {
        msg.say(error.message, "wrong");
      }
    },
  });
  page.replaceChildren(
    ui.pageTitle("Paste a text", "It's kept on this device only. Blank lines separate paragraphs; a line like “Chapter 2” starts a chapter."),
    el("label", { part: "field" }, "Title", title),
    el("label", { part: "field" }, "Text", body),
    language,
    guessed,
    ui.pinnedActions([add], { status: msg }),
  );
  return {
    title: "Paste a text",
    back: { href: "#read", label: "Read" },
    dispose: () => {
      stopGuessing();
      languageRow.lxClose();
    },
  };
}

// How far into a text counts as finished: its last 2% (in pages, where you are is the page's first word, so the last
// page of a short text is still "continue").
const FINISHED = 0.98;

/**
 * The text you're reading, for Today's "Keep going": the one you opened most recently that isn't finished, or null.
 * Open it at #read/book/<id>. Returns { id, title, chapter: { n, of, title }, page, read, follow, layer, lang }:
 *   page    a picture book's page holding where you are, { n, of }; null for a book without pages
 *   read    0–1, how far into the text you are
 *   follow  0–1, the share of its woven words you know (your words and your studying, as the shelf counts them), or
 *           null for a text with no weave into `lang`
 *   layer   which layer follow counts: "weave" (a book woven into `lang`) or "help" (a book in `lang`), or null
 */
/** The reader's own count of the page your place is on ({ n, of }), when this device's reader last showed it; else null. */
const shownAt = (row, word) => {
  const shown = row?.shown;
  return shown && Number.isInteger(shown.n) && Number.isInteger(shown.of) && word >= shown.a && word <= shown.b ? { n: shown.n, of: shown.of } : null;
};

// Books your other device was reading, listed here without their text (read/store.js's texts kind): each fetched again in the background
// once a visit, so it can be continued here as there (read/fetch-again.js; a book that can't be fetched now is tried at the next visit).
const fetchingAgain = new Set();
function fetchInBackground(entry) {
  if (fetchingAgain.has(entry.id) || navigator.onLine === false) return;
  fetchingAgain.add(entry.id);
  import("./fetch-again.js").then((m) => m.fetchAgain(entry)).catch(() => {});
}

export async function continueReading({ lang = "nl" } = {}) {
  // follow: in a woven book, the share of it you'd see in the language; in a book in the language, of its words you
  // know.
  const [books, positions] = await Promise.all([store.listBooks(), store.getPositions()]);
  // Started: opened here, or with your place in it from another device (a book listed from there).
  const opened = (entry) => entry.openedAt ?? (positions.get(entry.id)?.word > 0 ? positions.get(entry.id).at : null);
  for (const entry of [...books].sort((a, b) => (opened(b) ?? 0) - (opened(a) ?? 0))) {
    if (!opened(entry)) continue;
    const word = positions.get(entry.id)?.word ?? 0;
    const read = entry.words > 1 ? Math.min(1, word / (entry.words - 1)) : 0;
    if (read >= FINISHED) continue;
    const found = await store.getBook(entry.id);
    if (!found) {
      if (!store.ownText(entry)) fetchInBackground(entry);
      continue;
    }
    const { text } = found;
    // The chapter holding the word: the last one starting at or before it (a book without chapters is one, its title).
    let n = 0;
    text.chapters.forEach((chapter, ci) => {
      if ((text.paras[chapter.para]?.s ?? Infinity) <= word) n = ci;
    });
    // Its layer: a book in the language you're learning has its English help; any other, its weave into it.
    const weave = await store.getWeave(entry.id, text.lang === lang ? "en" : lang);
    const layer = (weave?.kind === "weave" || weave?.kind === "help") && weave.bookVersion === text.version ? weave : null;
    // A picture book's page: the one holding the word.
    const pages = Array.isArray(text.pages) && text.pages.length ? text.pages : null;
    const pageAt = pages ? pages.findIndex((page) => word < page.e) : -1;
    // Where you are, in its words, as the reader shows them: the sentence holding the word and the one after it (Home's book opens to it), a woven
    // book's in the words you know in the language you're learning ([{ text, target }]).
    const at = (text.sentences ?? []).findIndex(([s, e]) => s <= word && word < e);
    const passage = at === -1 ? null : passageOf(text, text.sentences.slice(at, at + 2), layer?.kind === "weave" ? layer : null, lang);
    return {
      id: entry.id,
      title: entry.title,
      passage,
      textLang: text.lang,
      chapter: text.chapters.length ? { n: n + 1, of: text.chapters.length, title: text.chapters[n].title } : { n: 1, of: 1, title: entry.title },
      // The page as its reader counts them on this device when that's where you are (store.setShownPage: one number everywhere a page is
      // said), else the book's own page.
      page: !pages ? null : shownAt(positions.get(entry.id), word) ?? { n: (pageAt === -1 ? pages.length - 1 : pageAt) + 1, of: pages.length },
      // A picture book's page's picture (a file in its pictures), beside its words on Home's book.
      picture: pages ? (text.pictures?.[pages[pageAt === -1 ? pages.length - 1 : pageAt].picture]?.file ?? null) : null,
      read,
      follow: layer ? coverageOf(layer, knownSet(lang)).share : null,
      layer: layer?.kind ?? null,
      lang,
    };
  }
  return null;
}

/** Renders the Read tab's page for the route's rest ([], ["paste"], ["shelf", id]); anything else, an old link to the woven try-out (#read/listen) included, is Read itself. */
export function renderRead(page, rest) {
  if (rest[0] === "paste") return renderPaste(page);
  if (rest[0] === "shelf") return renderShelfSection(page, rest[1], { known: knownSet, open: openRecord });
  if (rest[0] === "find") return renderFind(page, { known: knownSet, open: openRecord });
  if (rest[0] === "library") return renderYourLibrary(page);
  return renderLibrary(page);
}
