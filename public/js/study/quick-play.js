// Study's quick play: a large button for each game, three to a row, in sections by how it's answered (Tapping, Typing, Speaking: study/game-modes.js),
// for a few rounds of only that game (study/plan.js planSession "game":
// what's due first, then what you know least, then sentences with the fewest new words; six questions, Match three rounds). Six is about
// three minutes: short enough to fit between other things, long enough that a game you get wrong comes round more than once. A game that
// can't run here (no voice for the language, no recognizer) still shows, quieter, and a press says why and where to change it, instead of
// starting a session that can't play; Study cards is one of them. A game that's only whole sentences, for a newcomer with nothing studied yet,
// is quieter too, the same size, with one line under the heading saying why, and a press starts the first lesson; it turns back the moment a
// first word is studied.
// Under the games: Choose the games and Choose your concepts (sheets).

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { symbol } from "../lx/symbols.js";
import { icon } from "../lx/icons.js";
import { GAMES, SENTENCE_GAMES, beforeFirstWords } from "./plan.js";
import { onProgressChange } from "./progress.js";
import { onVoicesChange } from "./voice.js";
import { gamesSheet } from "./games-sheet.js";
import { focusNow, onFocusChange } from "./concept-focus.js";
import { conceptsSheet, focusNames } from "./concepts-sheet.js";
import { QUICK_GAMES, askSpeaking, blockedBy, byMode } from "./game-modes.js";

export { QUICK_GAMES };

// The games' drawings (lx/game-art.js) come apart from the shell's first load, the first time Study draws its games; the shell keeps them for
// offline. Until they're here a button's drawing is an empty place of its own size, so nothing moves and no other picture shows first; a game
// without one, or a device that can't load it, gets its icon.
let gameArt = null;
const arrived = import("../lx/game-art.js").then((module) => (gameArt = module), () => (gameArt = { GAME_ART_NAMES: [], gameArt: () => null }));
const artOf = (kind) => (gameArt ? (gameArt.GAME_ART_NAMES.includes(kind) ? gameArt.gameArt(kind, { size: 56 }) : icon(GAMES[kind].icon)) : el("span", { class: "lx-way-art-held" }));
// Study cards' drawing (the game set's "card"), or its symbol where this device has an older set.
const cardArt = () => (gameArt ? (gameArt.GAME_ART_NAMES.includes("card") ? gameArt.gameArt("card", { size: 56 }) : symbol("cards-q", { size: 56 })) : el("span", { class: "lx-way-art-held" }));

// Where a whole-sentence game's tile goes before your first words: the next lesson, the path's first (session.js waits for its pack).
const FIRST_LESSON = "#study/session/lesson";

function whySheet(kind, blocked) {
  const layer = ui.sheetLayer({ label: GAMES[kind].name });
  layer.lxBody.append(
    el(
      "div",
      { class: "lx-stack" },
      el("h2", { class: "lx-sheet-title" }, `${GAMES[kind].name} can't play here`),
      el("p", {}, blocked.why),
      el("ul", { part: "list" }, ui.listRow({ title: blocked.fix.title, sub: "In Settings, Study", href: blocked.fix.href, onclick: () => layer.lxClose?.({ animate: false }) })),
    ),
  );
  layer.lxOpen();
}

/** The section: the games (Study cards among them), then Choose the games and Choose your concepts. It keeps itself up to date while it's on the page. */
export function quickPlay() {
  const kinds = QUICK_GAMES.filter((kind) => GAMES[kind]);
  // Drawn once; what can play here changes each button in place (voices and the recognizer's answer come after the page), so nothing moves or
  // goes from under a finger. A press on one that can't play says why instead of starting.
  // Study cards is one of the games: your cards, a few at a press, like any other (a session of its own, #study/session/cards).
  // In sections by how each is answered, each its small heading and its own grid of the same buttons.
  const tileSpec = (kind) =>
    kind === "card"
      ? { kind: "card", title: "Study cards", icon: "cards", art: cardArt(), href: "#study/session/cards" }
      : { kind, title: GAMES[kind].name, icon: GAMES[kind].icon, art: artOf(kind), href: `#study/session/game/${kind}` };
  const sections = byMode([...kinds, "card"]).map((mode) => {
    const grid = ui.wayTiles(mode.kinds.map(tileSpec), { label: mode.name });
    return { mode, grid, node: el("div", { class: "lx-game-mode", "data-mode": mode.id }, ui.sectionHead(mode.name, { sub: true }), grid) };
  });
  const tileOf = new Map(sections.flatMap(({ grid }) => [...grid.children].map((tile) => [tile.dataset.game, tile])));
  // Only what differs is set: looking again with nothing changed (coming back to Study) changes nothing on the page.
  const put = (node, name, value) => {
    if (!node || node.getAttribute(name) === value) return;
    if (value === null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  };
  // Before your first words: one line under the heading for the quieter games (each tile stays its own size, so nothing moves as they turn).
  const waitLine = el("p", { class: "lx-games-sub", hidden: true }, "Games with whole sentences open after your first words.");
  let stopProgress = null;
  const update = () => {
    const fresh = beforeFirstWords();
    for (const kind of kinds) {
      const tile = tileOf.get(kind);
      const blocked = blockedBy(kind);
      // Can't play here says why; a whole-sentence game before your first words starts the first lesson.
      const later = !blocked && fresh && SENTENCE_GAMES.has(kind);
      tile.lxBlocked = blocked;
      put(tile, "data-state", blocked ? "unavailable" : later ? "later" : null);
      put(tile, "href", blocked ? null : later ? FIRST_LESSON : `#study/session/game/${kind}`);
      put(tile, "role", blocked ? "button" : null);
      put(tile, "tabindex", blocked ? "0" : null);
      put(tile.querySelector(".lx-way-art"), "data-art", blocked || later ? "theme" : null);
    }
    put(waitLine, "hidden", kinds.some((kind) => tileOf.get(kind).dataset.state === "later") ? null : "");
    // Only while some wait: the first word studied (a lesson, a game, another device's sync) turns them back with no reload. Off the page it
    // stops; lxRefresh, coming back, looks again.
    if (fresh) stopProgress ??= onProgressChange(() => (tileOf.get(kinds[0])?.isConnected ? update() : (stopProgress?.(), (stopProgress = null))));
    else if (stopProgress) (stopProgress(), (stopProgress = null));
  };
  for (const [kind, tile] of tileOf) {
    const explain = (event) => {
      if (!tile.lxBlocked) return;
      event.preventDefault();
      whySheet(kind, tile.lxBlocked);
    };
    tile.addEventListener("click", explain);
    tile.addEventListener("keydown", (event) => (event.key === "Enter" || event.key === " ") && explain(event));
  }
  update();
  // Choose your concepts: a drawer too. Its value says how many are on, and follows.
  const conceptsCount = el("span", { class: "lx-row-end lx-row-value" });
  const conceptsRow = ui.listRow({ art: symbol("more-q", { size: 24 }), title: "Choose your concepts", opens: "sheet", onclick: () => conceptsSheet(), trailing: conceptsCount });
  const countConcepts = () => {
    // The ones picked, by name; All while none is.
    const text = focusNow().length ? focusNames(focusNow()) : "All";
    if (conceptsCount.textContent !== text) conceptsCount.textContent = text;
  };
  countConcepts();
  if (!gameArt) arrived.then(() => {
    kinds.forEach((kind) => tileOf.get(kind)?.querySelector(".lx-way-art")?.replaceChildren(artOf(kind)));
    tileOf.get("card")?.querySelector(".lx-way-art")?.replaceChildren(cardArt());
  });
  const section = el(
    "section",
    { class: "lx-quick-play" },
    ui.sectionHead("One game at a time"),
    waitLine,
    ...sections.map(({ node }) => node),
    el(
      "ul",
      { part: "list", class: "lx-study-rows" },
      // A drawer, not a page: no arrow (an empty end, until the app's own mark for a sheet).
      ui.listRow({ art: symbol("games-q", { size: 24 }), title: "Choose the games", opens: "sheet", onclick: () => gamesSheet() }),
      conceptsRow,
    ),
  );
  // Voices arrive after the page does, and the recognizer's answer takes a moment: the buttons follow, and stop once the page is gone (off the screen:
  // Study keeps this section while you're on another tab, and lxRefresh, as you come back, looks again and follows again).
  let stopVoices = null;
  let stopCount = null;
  const follow = () => {
    stopVoices ??= onVoicesChange(() => (section.isConnected ? update() : (stopVoices?.(), (stopVoices = null))));
    stopCount ??= onFocusChange(() => (conceptsRow.isConnected ? countConcepts() : (stopCount?.(), (stopCount = null))));
  };
  follow();
  section.lxRefresh = () => {
    update();
    countConcepts();
    follow();
  };
  askSpeaking().then(update);
  return section;
}
