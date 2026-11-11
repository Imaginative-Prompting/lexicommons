// Settings → Admin → Pictures (#settings/admin/pictures), an admin's: every word picture on one page, drawn as the games draw them (the picture
// choices' own tiles, two to a row), each with its words under it: every word of the language being learned that it draws, then its English name, quieter.
// Animated first, the pictures with a story, in the order their stories were made (the order learners meet the words); then Still, the rest.
// A tap on an animated picture's left half plays its happy story, on its right half its sad, through the games' own story code (study/reactions.js:
// the same files, the same check that a story's still is the one drawn), from the still every time. A still picture only scrolls by.
// Every tile has its square from the first frame; the first screenful's drawings come with the page, the rest as they come near the screen.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { whoAmI } from "./api.js";
import { learning } from "../study/learning.js";
import { loadPictures, pictureList, pictureNode, pictureWords } from "../study/pictures.js";
import { playStory, storyIds } from "../study/reactions.js";

const FIRST = 8; // the first screenful at 390: drawn with the page

export function picturesPage(page) {
  const body = el("div", { class: "lx-stack" }, ui.loadingState());
  page.replaceChildren(ui.pageTitle("Pictures"), body);
  let near = null;
  const ready = (async () => {
    const me = await whoAmI();
    if (!page.isConnected) return;
    if (!me?.roles?.includes("admin")) return body.replaceChildren(el("p", { class: "lx-muted" }, "This is for an admin."));
    const [list, words] = await Promise.all([pictureList(), pictureWords(learning())]);
    const all = Object.keys(list?.pictures ?? {});
    const drawn = new Set(all);
    const animated = storyIds().filter((id) => drawn.has(id));
    const told = new Set(animated);
    const still = all.filter((id) => !told.has(id));
    // A picture's words: every word of the language drawn by it (several can share one: stad and gebouw are both the city).
    const wordsOf = new Map();
    for (const [lemma, concept] of Object.entries(words ?? {})) wordsOf.set(concept, [...(wordsOf.get(concept) ?? []), lemma]);
    const first = [...animated, ...still].slice(0, FIRST);
    await loadPictures(first);
    if (!page.isConnected) return;
    const label = (id) => el("span", { part: "picture-choice-label" }, wordsOf.get(id)?.join(", ") ?? id, wordsOf.has(id) ? el("span", { class: "lx-muted" }, ` ${id}`) : null);
    // A tile's drawing in its square: there now, or held until it's near the screen.
    const loaded = new Set(first);
    const artFor = (id) => {
      const art = el("span", { part: "picture-choice-art" });
      art.style.aspectRatio = "1";
      art.append(loaded.has(id) ? pictureNode(id) : ui.held({ height: "100%", radius: 16 }, "picture"));
      art.dataset.id = id;
      return art;
    };
    const drawIn = async (art) => {
      const id = art.dataset.id;
      if (loaded.has(id) || !(await loadPictures([id])) || !art.isConnected) return;
      loaded.add(id);
      ui.arriveIn(art, pictureNode(id));
    };
    near = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) (near.unobserve(entry.target), drawIn(entry.target));
    }, { rootMargin: "600px 0px" });
    const tile = (id) => {
      const art = artFor(id);
      return el(
        "button",
        {
          part: "picture-choice",
          type: "button",
          onclick: async (event) => {
            const button = event.currentTarget;
            const box = button.getBoundingClientRect();
            const mood = event.clientX - box.left < box.width / 2 ? "happy" : "sad";
            if (!loaded.has(id) && !(await loadPictures([id]))) return;
            loaded.add(id);
            // From the still each time: a fresh copy of the drawing (a story still running on the old one sees it gone and stops).
            art.replaceChildren(pictureNode(id));
            playStory(button, id, mood);
          },
        },
        art,
        label(id),
      );
    };
    const stillTile = (id) => el("div", { part: "picture-choice" }, artFor(id), label(id));
    const grid = (tiles) => el("div", { part: "picture-choices", "data-kind": "pictures" }, ...tiles);
    body.replaceChildren(
      el("p", { class: "lx-muted" }, "Left half: happy · right half: sad"),
      ui.sectionHead(`Animated · ${animated.length}`),
      grid(animated.map(tile)),
      ui.sectionHead(`Still · ${still.length}`),
      grid(still.map(stillTile)),
    );
    for (const art of body.querySelectorAll('[data-part="picture-choice-art"]')) if (!loaded.has(art.dataset.id)) near.observe(art);
  })().catch((error) => page.isConnected && body.replaceChildren(ui.loadFailed(error, () => picturesPage(page))));
  return { title: "Pictures", back: { href: "#settings/admin", label: "Admin" }, ready, dispose: () => near?.disconnect() };
}
