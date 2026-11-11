// The session player every check plays sessions with (scripts/fixtures/play-session.mjs) can play every step the app can show, in plain
// Node: each game plan.js's GAMES lists has a handler, and so does every kind of step session.js draws (card, meet, deck: the kinds it
// compares a step against) and every game a deck's card is played as (study/deck-steps.js deckStep). A new game without its handler fails
// here at once, instead of every check that meets it stalling in its session. Each rule first catches a plant: a game, a step kind and a
// deck game with no handler. Exit 0 = pass.
import { readFileSync } from "node:fs";
import { DECK_GAMES, HANDLERS } from "./fixtures/play-session.mjs";
import { GAMES } from "../public/js/study/plan.js";

const APP = new URL("../", import.meta.url).pathname;
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
const unhandled = (kinds, handlers = HANDLERS) => [...kinds].filter((kind) => typeof handlers[kind] !== "function");

// The step kinds session.js draws: every `kind === "…"` it compares a step against.
const sessionKinds = (source) => new Set([...source.matchAll(/\bkind === "([a-z][a-z-]*)"/g)].map((m) => m[1]));
// The games deckStep plays a deck's card as: its `game === "…"` branches.
const deckGames = (source) => new Set([...source.matchAll(/\bgame === "([a-z][a-z-]*)"\) return/g)].map((m) => m[1]));
const SESSION_JS = readFileSync(`${APP}public/js/study/session.js`, "utf8");
const DECK_JS = readFileSync(`${APP}public/js/study/deck-steps.js`, "utf8");

// The controls first: each rule finds what's planted.
check(
  unhandled([...Object.keys({ ...GAMES, "planted-game": {} })]).join() === "planted-game",
  "control: a game in GAMES with no handler is named",
);
check(unhandled(sessionKinds(`${SESSION_JS}\nif (step.kind === "planted-kind") draw();`)).join() === "planted-kind", "control: a step kind session.js draws with no handler is named");
const plantedDeck = deckGames(`${DECK_JS}\n  if (game === "planted-deck") return plantedGame();`);
check([...plantedDeck].filter((game) => !DECK_GAMES.includes(game)).join() === "planted-deck", "control: a game a deck's card is played as with no handling is named");

// The rules.
const games = Object.keys(GAMES);
check(games.length >= 18, `GAMES read from plan.js: ${games.length} games (${games.join(", ")})`);
const noHandler = unhandled(games);
check(!noHandler.length, `every game in GAMES has a handler${noHandler.length ? `: none for ${noHandler.join(", ")} (give it one in scripts/fixtures/play-session.mjs)` : ""}`);
const kinds = sessionKinds(SESSION_JS);
const noKind = unhandled(kinds);
check(kinds.size >= 15 && !noKind.length, `every kind of step session.js draws (${kinds.size}) has a handler${noKind.length ? `: none for ${noKind.join(", ")}` : ""}`);
const deck = deckGames(DECK_JS);
const noDeck = [...deck].filter((game) => !DECK_GAMES.includes(game));
check(deck.size >= 5 && !noDeck.length, `every game a deck's card is played as (${[...deck].join(", ")}) is handled${noDeck.length ? `: not ${noDeck.join(", ")}` : ""}`);
const stale = Object.keys(HANDLERS).filter((kind) => !games.includes(kind) && !kinds.has(kind));
check(!stale.length, `no handler for a kind the app no longer has${stale.length ? `: ${stale.join(", ")}` : ""}`);

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
