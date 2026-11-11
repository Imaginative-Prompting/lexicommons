// Choose the games: which are asked, in lessons, in Practice and everywhere else. It opens from Study and from inside a session, where
// the question on the screen comes first. Each game is a small copy of its big button on Study, and a press turns it on or off: on, it's the
// button as Study has it (filled, its drawing in color, a hard edge) with a check in its corner; off, it's only an outline, its drawing in the
// page's ink. However few are on, a new word still gets its first showing (lesson.js), and this says so. They're in sections by how each is
// answered (Tapping, Typing, Speaking: game-modes.js), as on Study, the question on the screen's section first; one that can't play on this device
// stays in its section, quieter, saying why, and can still be turned on or off for when it can.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { WAYS, getStudySettings, setStudySetting } from "./settings.js";
import { QUICK_GAMES, askSpeaking, blockedBy, byMode } from "./game-modes.js";
import { symbol } from "../lx/symbols.js";
import { icon } from "../lx/icons.js";

const FLOOR = `New words still come first as ${WAYS.see}, so there's something to start from.`;

// The games' drawings (lx/game-art.js), as Study's buttons have them; the study cards' own small one where there's none.
let gameArt = null;
const arrived = import("../lx/game-art.js").then((module) => (gameArt = module), () => (gameArt = { GAME_ART_NAMES: [], gameArt: () => null }));
const artOf = (way) => (gameArt?.GAME_ART_NAMES.includes(way) ? gameArt.gameArt(way, { size: 40 }) : symbol(way === "cards" ? "game-card-q" : `game-${way}-q`, { size: 32 }));

/** current: the way of the question on the screen, in a session. onClose: once it's closed, for a session to act on what changed. */
export function gamesSheet({ current = null, onClose = null } = {}) {
  const status = el("p", { class: "lx-small lx-muted", role: "status" });
  const include = () => getStudySettings().quick.include;
  const floorNote = () => (!include().see && !include().translate ? FLOOR : "");
  const say = (words) => status.replaceChildren(words || floorNote());
  const layer = ui.sheetLayer({ label: "Choose the games", onClose: () => onClose?.() });
  // In Study's order (each a small copy of its button there), Study cards after the games.
  const rank = (way) => (way === "cards" ? QUICK_GAMES.length : QUICK_GAMES.includes(way) ? QUICK_GAMES.indexOf(way) : QUICK_GAMES.length + 1);
  const ways = Object.entries(WAYS).sort(([a], [b]) => rank(a) - rank(b));
  const order = [...ways.filter(([way]) => way === current), ...ways.filter(([way]) => way !== current)];
  const labels = new Map(order);
  const tiles = new Map();
  const tileFor = ([way, label]) => {
    const tile = el(
      "button",
      {
        type: "button",
        part: "game-toggle",
        "aria-pressed": String(Boolean(include()[way])),
        onclick: () => {
          const on = tile.getAttribute("aria-pressed") !== "true";
          if (!on && !Object.entries(include()).some(([other, yes]) => yes && other !== way)) {
            say("Keep at least one on.");
            return;
          }
          setStudySetting(`quick.include.${way}`, on);
          sync();
          say("");
        },
      },
      el("span", { class: "lx-toggle-art", "aria-hidden": "true" }, artOf(way)),
      el("span", { class: "lx-toggle-name" }, label),
      way === current ? el("span", { class: "lx-toggle-now" }, "This question") : null,
      el("span", { class: "lx-toggle-why", hidden: true }),
      el("span", { class: "lx-toggle-check", "aria-hidden": "true" }, icon("check")),
    );
    tiles.set(way, tile);
    return tile;
  };
  // Each tile says what's on now; its drawing in color while it is, in the page's ink while it isn't. One that can't play here is quieter and
  // says why in a word, whichever it is.
  const sync = () => {
    for (const [way, tile] of tiles) {
      const on = Boolean(include()[way]);
      const blocked = blockedBy(way);
      tile.setAttribute("aria-pressed", String(on));
      const art = tile.querySelector(".lx-toggle-art");
      if (on && !blocked) art.removeAttribute("data-art");
      else art.setAttribute("data-art", "theme");
      tile.toggleAttribute("data-unavailable", Boolean(blocked));
      const why = tile.querySelector(".lx-toggle-why");
      why.hidden = !blocked;
      why.textContent = blocked?.short ?? "";
    }
  };
  // In sections by how each is answered, the question on the screen's section first.
  const sections = byMode(order.map(([way]) => way));
  const nowFirst = [...sections.filter((mode) => mode.kinds.includes(current)), ...sections.filter((mode) => !mode.kinds.includes(current))];
  const groups = nowFirst.map((mode) =>
    el("div", { class: "lx-game-mode", "data-mode": mode.id }, ui.sectionHead(mode.name, { sub: true }), el("div", { part: "game-toggles" }, mode.kinds.map((way) => tileFor([way, labels.get(way)])))),
  );
  sync();
  askSpeaking().then(() => layer.isConnected && sync());
  if (!gameArt) arrived.then(() => {
    for (const [way, tile] of tiles) tile.querySelector(".lx-toggle-art")?.replaceChildren(artOf(way));
  });
  const setAll = (on) => {
    order.forEach(([way], i) => setStudySetting(`quick.include.${way}`, on || i === 0));
    sync();
    say(on ? "" : "Now turn on the ones you like.");
  };
  layer.lxBody.append(
    el(
      "div",
      { class: "lx-stack" },
      el("div", { class: "lx-games-head" }, el("h2", { class: "lx-sheet-title" }, "Choose the games"), el("div", { class: "lx-games-all" }, ui.button("All on", { size: "sm", onclick: () => setAll(true) }), ui.button("Just a few", { size: "sm", onclick: () => setAll(false) }))),
      el("p", { class: "lx-games-sub" }, "The ones that are on come up at random as you practice."),
      current ? el("p", { class: "lx-small lx-muted" }, "Off takes it out now. On brings it in next time.") : null,
      status,
      ...groups,
    ),
  );
  say("");
  layer.lxOpen();
}
