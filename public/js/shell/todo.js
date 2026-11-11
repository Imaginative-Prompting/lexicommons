// The tab that isn't built yet: it says what it will hold (from the app map), so the shell is whole.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";

const PAGES = {
  explore: {
    title: "Explore",
    text: "The community library: packs, texts, games and themes, with likes, corrections you can suggest and authors can accept, and imports that skip what you already have.",
  },
};

export const TODO_TABS = Object.keys(PAGES);

export function renderTodo(page, tab) {
  const info = PAGES[tab] ?? PAGES.explore;
  page.replaceChildren(ui.emptyState([el("span", { part: "badge" }, "To do"), el("p", {}, info.text)], { pose: "page", class: "lx-todo" }));
  return info.title;
}
