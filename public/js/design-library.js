// /design: the Read tab's library parts (lx/ui.js: sectionHead, bookCover, bookTile, bookList, bookProgress,
// continueCard, askAi, sheetLayer), in every variant, with sample books. The page fills the same builders from the
// texts on the device and the open library's catalog.

import * as ui from "./lx/ui.js";
import { el } from "./lx/ui.js";

// Two sample images, drawn here (a picture and an AI's art are both just images to the cover).
const svg = (body, bg) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect width="200" height="300" fill="${bg}"/>${body}</svg>`)}`;
const PICTURE = svg('<circle cx="100" cy="120" r="54" fill="#e9b949"/><path d="M0 230c50-30 150-30 200 0v70H0z" fill="#3f7d4e"/>', "#bfe0f2");
const ART = svg('<circle cx="100" cy="118" r="46" fill="none" stroke="#f1efea" stroke-width="3"/><path d="M100 118V90M100 118l20 12" stroke="#f1efea" stroke-width="3" stroke-linecap="round"/><text x="100" y="240" text-anchor="middle" fill="#f1efea" font-family="Georgia, serif" font-size="28">Alice</text>', "#1d3557");

const BOOKS = [
  { title: "Het is de schuld van de kat", lang: "nl", cover: { src: PICTURE }, sub: "40% read", progress: 0.4 },
  { title: "Alice's Adventures in Wonderland: the opening", cover: { src: ART, art: true }, sub: "62% read", progress: 0.62, flag: { lang: "nl", label: "Dutch" } },
  { title: "De bakkerij", lang: "nl", cover: { by: "Pasted" }, sub: "Not started", flag: { lang: "nl", label: "Dutch" } },
  { title: "Brief aan oma", lang: "nl", cover: { by: "Pasted" }, sub: "18% read", progress: 0.18, flag: { lang: "nl", label: "Dutch" } },
  { title: "Max Havelaar", lang: "nl", cover: { by: "Multatuli" }, sub: "Level 4 · you know 21%", flag: { lang: "nl", label: "Dutch" } },
];

export function librarySection({ section, demo, states }) {
  const tiles = (books) => books.map((b) => ui.bookTile({ ...b, href: "#design-library" }));
  // A sheet's shade and the sheet over it, held in a frame (on the page they cover the screen).
  const sheetDemo = el(
    "div",
    { class: "ds-scrim-frame" },
    el("div", { part: "sheet-scrim" }),
    (() => {
      const sheet = ui.sheet({ label: "Add a book or text", hidden: false });
      sheet.lxBody.append(
        el("h2", { class: "lx-sheet-title" }, "Add a book or text"),
        el("ul", { part: "list" }, ui.listRow({ icon: "pencil", title: "Paste a text", sub: "A story, an article, anything you'd like to read", href: "#design-library" })),
        ui.askAi({ title: "Ask your AI to add it", sub: "Paste this to it, then say what:", prompts: ["Use the Lexicommons tools to add a text to my reading library. What I'd like: "] }),
      );
      return sheet;
    })(),
  );
  return section(
    "library",
    "Library",
    "The Read tab is a library, covers first. Every text has a cover: its own picture, art your AI made for it (shown only as an image), or a designed one: a color picked from its id out of seven colorblind-safe ones, its title large in a book face, a short rule, its author small. The book you're reading comes first, with the way back in at the card's foot; adding a text happens in a sheet, where your AI is one of the ways.",
    demo(
      "The book you're reading",
      ui.continueCard({
        cover: ui.bookCover({ title: "Het is de schuld van de kat", src: PICTURE }),
        kicker: "Continue reading",
        title: "Het is de schuld van de kat",
        lang: "nl",
        meta: "Page 4 of 10 · Level 2",
        progress: 0.4,
        note: "You know 38% of its words",
        action: { label: "Continue", onclick: () => {} },
      }),
    ),
    demo("Your library: a grid", ui.sectionHead("Your library"), ui.bookList(tiles(BOOKS), { layout: "grid", label: "Your library" })),
    demo(
      "A shelf: a row that scrolls sideways, under a smaller heading with “See all”",
      ui.sectionHead("Open books", { info: { label: "Where these books come from", onclick: () => {} } }),
      ui.sectionHead("Picture books", { sub: true, link: { href: "#design-library", label: "All 14" } }),
      ui.bookList(tiles(BOOKS.slice(0, 4).map((b) => ({ ...b, progress: undefined, sub: "Level 1 · English help" }))), { layout: "row", label: "Picture books" }),
    ),
    states("Covers", [
      ["picture: its own", el("div", { class: "ds-cover" }, ui.bookCover({ title: "Het is de schuld van de kat", src: PICTURE }))],
      ["art: made by your AI, an image", el("div", { class: "ds-cover" }, ui.bookCover({ title: "Alice", src: ART, art: true }))],
      ...[
        ["Brief aan oma", "Pasted"],
        ["Max Havelaar", "Multatuli"],
        ["De bakkerij", "Pasted"],
        ["Alice's Adventures in Wonderland: the opening", "Lewis Carroll"],
      ].map(([title, by]) => [`type: a color from its id, ${title}`, el("div", { class: "ds-cover" }, ui.bookCover({ title, by }))]),
    ]),
    states("How far you are", [
      ["just started", el("div", { class: "ds-progress" }, ui.bookProgress(0.04))],
      ["halfway", el("div", { class: "ds-progress" }, ui.bookProgress(0.5))],
      ["finished", el("div", { class: "ds-progress" }, ui.bookProgress(1))],
    ]),
    demo(
      "Ask your AI, wherever you add your own: prompts to copy",
      ui.askAi({
        title: "Ask your AI to make one",
        sub: "Paste one of these to it, or send a request from the AI tab:",
        prompts: ["Use the Lexicommons tools to make me a new pack. It's for: ", "Use the Lexicommons tools to add sentences to one of my packs: "],
        note: "In Claude Code, the make_pack and add_to_pack prompts do the same.",
      }),
    ),
    demo("A sheet over the page, its shade behind it: a press on the shade closes it", sheetDemo),
  );
}
