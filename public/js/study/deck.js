// Studying a pack's plain items, its cards (pack-items.js): one session per deck, on the app's own scheduler. Each card is one unit,
// k:<pack>/<card>, so what's due is worked out from the evidence like everything else, and the card's history from any other
// app isn't brought in. A card plays only the games it can carry, and a new one follows the rule for anything new: met
// first, ungraded, and then asked. Which game comes next is worked out here and drawn by deck-steps.js.
//
// They're in the day too (plan.js Practice and Reviews): what's due of any pack that's on, and what's new only from a pack you made or copied.
// An imported deck, or a pack you follow, brings new ones only when you open it: you chose it by opening it, and a 5,000-card deck never crowds the day.

import { ITEM_LIMITS, gamesOf, itemOthers, plainItems } from "./pack-items.js";
import { separatorOf } from "./pack-format.js";
import { allPacks, isPackOn, packSounds } from "./packs.js";
import { hasClip } from "./clips.js";
import { learning } from "./learning.js";
import { studiedUnits, unitState } from "./progress.js";
import { LENGTHS, getStudySettings } from "./settings.js";
import { WORDS } from "./content.js";
import { spelledAlike } from "../lang/index.js";
import { leansTo } from "../anki/language.js";

const MATCH_PAIRS = 5;

export const deckUnit = (packId, cardId) => `k:${packId}/${cardId}`;

// ---------- a pack that teaches a script (Japanese's kana) ----------

/** A pack that teaches how a script is read (pack-format.js teaches: "script"): each card a letter or a few, and how it's said. */
export const teachesScript = (pack) => pack?.teaches === "script";

/** The ways a script's card says its letter is said: its means, and the spelling a keyboard uses for it in brackets ("o (wo)": o, wo). */
export const soundsOf = (means) =>
  String(means ?? "")
    .split(/[()]/)
    .flatMap((part) => part.split(/[,;/]/))
    .map((sound) => sound.trim().toLowerCase())
    .filter(Boolean);

/** Whether what's typed says how a script's card is said: any of its spellings (o or wo for を), case and spaces aside; nothing else. */
export function soundTyped(card, typed) {
  const bare = (text) => String(text ?? "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const said = bare(typed);
  return Boolean(said) && soundsOf(card?.means).some((sound) => bare(sound) === said);
}

/** Whether two of a script's cards are said alike (お and を; か and カ): neither is ever the other's wrong choice. */
export const saidAlike = (a, b) => soundsOf(a).some((sound) => soundsOf(b).includes(sound));

/** The script a letter is written in, as Unicode names it (Hiragana, Katakana, Hangul…): a script's wrong choices are of its own script. */
export const scriptOf = (text) => /\p{Script=Hiragana}/u.test(text) ? "Hiragana" : /\p{Script=Katakana}/u.test(text) ? "Katakana" : /\p{Script=Hangul}/u.test(text) ? "Hangul" : /\p{Script=Cyrillic}/u.test(text) ? "Cyrillic" : /\p{Script=Greek}/u.test(text) ? "Greek" : /\p{Script=Arabic}/u.test(text) ? "Arabic" : /\p{Script=Hebrew}/u.test(text) ? "Hebrew" : /\p{Script=Devanagari}/u.test(text) ? "Devanagari" : /\p{Script=Thai}/u.test(text) ? "Thai" : /\p{Script=Georgian}/u.test(text) ? "Georgian" : /\p{Script=Armenian}/u.test(text) ? "Armenian" : "other";

/**
 * A script card's wrong choices (study/deck-steps.js): `count` of its pack's other cards, never one said alike (hearing "o", お and を are both
 * right), those of its own script first (hiragana among hiragana), in an order its seed fixes. side: "means" (Choose: how it's said) or
 * "text" (Listening: the letters).
 */
export function scriptChoices(card, cards, side, count, seed) {
  const others = cards.filter((other) => other.id !== card.id && other[side] !== card[side] && !saidAlike(other.means, card.means));
  const own = others.filter((other) => scriptOf(other.text) === scriptOf(card.text));
  const pick = (list) => wrongChoices(card[side], list.map((other) => other[side]), count, seed);
  const first = pick(own);
  return first.length >= count ? first : [...first, ...pick(others.filter((other) => !first.includes(other[side])))].slice(0, count);
}

// Whether this device can say a script's letter (voice.js hearsWord: a recording, or a voice for its language): session.js sets it, and
// Listening runs on a script's cards only where it can. Unset (Node), it can't.
let hearsLetter = () => false;
export const setLetterHearing = (fn) => {
  hearsLetter = fn ?? (() => false);
};

// A script's card: the card itself, Type (shown the letter, how it's said typed: reading it), Match, Choose (how it's said, from four),
// and Listening (heard, the letter picked from four) where the device can say it.
function scriptGames(card, others, hears) {
  const games = ["card", "type"];
  if (card.text.length <= ITEM_LIMITS.matched && card.means.length <= ITEM_LIMITS.matched) games.push("match");
  if (others.means >= 3) games.push("choose");
  if (hears && others.means >= 3) games.push("listen");
  return games;
}

// ---------- a card said aloud (Say it) ----------

// Whether this device can listen to the language you're learning (speaking.js chooseEngine, asked by game-modes.js askSpeaking, which tells this
// file). Until it has answered, a card is offered Say it as a sentence is, and the step itself says what's missing; once it has said no, no card is.
let hearsSpeech = true;
export const setSpeechHearing = (can) => {
  hearsSpeech = can !== false;
};

// The scripts a language is written in, as Unicode's four-letter codes: CLDR's likely script for it, and the scripts that one is made of.
const SCRIPT_PARTS = { Jpan: ["Hani", "Hira", "Kana"], Kore: ["Hang", "Hani"], Hans: ["Hani"], Hant: ["Hani"] };
const scriptsFound = new Map();
function scriptsOf(lang) {
  if (!scriptsFound.has(lang)) {
    let scripts = null;
    try {
      const script = new Intl.Locale(lang).maximize().script;
      scripts = script ? (SCRIPT_PARTS[script] ?? [script]) : null;
      if (scripts) for (const one of scripts) new RegExp(`\\p{scx=${one}}`, "u");
    } catch {
      scripts = null; // a code Intl doesn't know, or a script this engine can't test: it can't be told
    }
    scriptsFound.set(lang, scripts);
  }
  return scriptsFound.get(lang);
}
const lettersOf = (text) => String(text ?? "").match(/\p{L}/gu) ?? [];
const writtenIn = (text, scripts) => {
  const letters = lettersOf(text);
  return letters.length > 0 && letters.every((letter) => scripts.some((script) => new RegExp(`\\p{scx=${script}}`, "u").test(letter)));
};

/**
 * Whether a card's text is the side to say aloud: it's in the pack's language, as far as that can be told. Never a cloze, a script's letter
 * (a pack that teaches one), or a card with no meaning to ask it from.
 *   - Its script first: every letter of the text in a script the language is written in. An English prompt on a Japanese deck, or a deck
 *     whose sides are the other way round between two scripts, fails here, card by card.
 *   - Where the language you're learning from is written in the same script (Dutch from English), script can't tell them apart. Then a card is
 *     left out when its text shows itself to be in the language learned from more than in the pack's (by each language's little words and own
 *     letters, anki/language.js leansTo) while its meaning doesn't: "the dog" / "de hond", "What is your name?" / "Hoe heet je?". Losing a card
 *     that way costs it one game; asking an English prompt aloud would be wrong. A card that shows neither way ("huis" / "house") is taken as the
 *     pack says: its language was settled when the pack was made (an imported deck's by the importer, which asks when it can't tell the sides apart).
 *   - A language whose script can't be worked out is never asked aloud.
 */
export function saidAloud(card, pack) {
  if (!card?.text || !card.means || card.cloze || teachesScript(pack)) return false;
  const scripts = scriptsOf(pack?.language);
  if (!scripts || !writtenIn(card.text, scripts)) return false;
  const from = pack.from ?? "en";
  const fromScripts = scriptsOf(from);
  if (!fromScripts || !fromScripts.some((script) => scripts.includes(script))) return true;
  const reversed = leansTo(card.text, from) > leansTo(card.text, pack.language) && leansTo(card.means, from) <= leansTo(card.means, pack.language);
  return !reversed;
}

/**
 * The word a card's answer turns on when it's a noun with its article ("het huis"): said without the article, it's right, as Say the word takes it.
 * Null for anything else: the whole text is the answer.
 */
export function saidNoun(card) {
  const parts = String(card?.text ?? "").trim().replace(/[.!?]+$/, "").split(/\s+/);
  if (parts.length !== 2) return null;
  const article = parts[0].toLocaleLowerCase();
  return Object.hasOwn(WORDS, article) && /^the\b/.test(WORDS[article]) ? parts[1] : null;
}

/** Each card of a pack with what it can play, as this device has it. */
export function cardsOf(pack) {
  const cards = plainItems(pack);
  const others = itemOthers(cards);
  const sounds = packSounds(pack?.id) ?? {};
  const separator = separatorOf(pack?.language);
  const script = teachesScript(pack);
  return cards.map((card) => {
    const clip = sounds[card.id];
    const sound = clip && hasClip(clip) ? clip : null;
    const games = script ? scriptGames(card, others(card), Boolean(sound) || hearsLetter(card.text, pack.language)) : gamesOf(card, { others: others(card), sound: Boolean(sound), separator, says: hearsSpeech && saidAloud(card, pack) });
    return { card, sound, unit: deckUnit(pack.id, card.id), ...(script ? { script } : {}), games };
  });
}

/** The packs with cards in the language you're learning, that are on. */
export const decksHere = () => allPacks().filter((pack) => pack.language === learning() && plainItems(pack).length && isPackOn(pack.id));

/** How a deck stands: { total, due, fresh } (fresh: never asked yet). */
export function deckOverview(pack, now = Date.now()) {
  let due = 0;
  let fresh = 0;
  const lang = pack.language;
  const cards = plainItems(pack);
  for (const card of cards) {
    const state = unitState(deckUnit(pack.id, card.id), { lang, now });
    if (state.due) due++;
    else if (state.isNew) fresh++;
  }
  return { total: cards.length, due, fresh };
}

/** A deck's overview in a few words. */
export function deckLine({ due, fresh, total }) {
  const parts = [due && `${due.toLocaleString()} due`, fresh && `${fresh.toLocaleString()} new`].filter(Boolean);
  return parts.length ? parts.join(" · ") : `${total.toLocaleString()} ${total === 1 ? "card" : "cards"}, nothing due now`;
}

const READ_GAMES = ["choose", "arrange", "fill", "card"];
const SAY_GAMES = ["type", "say"];
const wayOf = (game) => (game === "card" ? "cards" : game);

// The game a card is asked with now: the strength that's due first, a strength it hasn't started once the card's familiar,
// else the reading games in turn. Never one the card can't carry, or that Choose the games has turned off (its card is
// always left, as nothing else may fit).
function gameFor(entry, state, allowed) {
  const can = entry.games.filter((game) => game === "card" || game === "fill" || allowed.includes(wayOf(game)));
  const due = state.trained.filter((skill) => state.strengths[skill]?.due).sort((a, b) => state.strengths[a].recall - state.strengths[b].recall)[0];
  if (due === "hear" && can.includes("listen")) return { game: "listen", skill: "hear" };
  // A script's letter is read: Choose, Type (its sound) and the card in turn, Listening once it's familiar or due.
  if (entry.script) {
    if (state.reviews >= 3 && state.trained.includes("hear") && !state.strengths.hear && can.includes("listen")) return { game: "listen", skill: "hear" };
    const read = ["choose", "type", "card"].filter((game) => can.includes(game));
    return { game: read[state.reviews % read.length] ?? "card", skill: "read" };
  }
  // Saying it is typed or said aloud, in turn, whichever of the two the card can play.
  const saying = SAY_GAMES.filter((game) => can.includes(game));
  if (due === "say" && saying.length) return { game: saying[state.reviews % saying.length], skill: "say" };
  if (state.reviews >= 3 && state.trained.includes("hear") && !state.strengths.hear && can.includes("listen")) return { game: "listen", skill: "hear" };
  if (state.reviews >= 2 && state.trained.includes("say") && !state.strengths.say && saying.length) return { game: saying[0], skill: "say" };
  const reading = READ_GAMES.filter((game) => can.includes(game));
  if (!reading.length) return { game: can[0] ?? "card", skill: SAY_GAMES.includes(can[0]) ? "say" : can[0] === "listen" ? "hear" : "read" };
  return { game: reading[state.reviews % reading.length], skill: "read" };
}

// A round of Match on what a session has been asking, when there are enough that fit.
function matchStep(entries, deck) {
  const pairs = [];
  const used = new Set();
  for (const entry of entries) {
    // A card spelled the same both ways (hotel and hotel) asks nothing in Match: its other games do.
    if (!entry.games.includes("match") || spelledAlike(entry.card.text, entry.card.means) || used.has(entry.card.text) || used.has(entry.card.means)) continue;
    used.add(entry.card.text);
    used.add(entry.card.means);
    pairs.push(entry);
    if (pairs.length === MATCH_PAIRS) break;
  }
  return pairs.length >= 3 ? { kind: "deck", game: "match", pack: deck.id, entries: pairs, meaning: "review" } : null;
}

/**
 * The script to learn before lesson 1 (Home's first-lesson card, Study's row): a pack that teaches how the language you're learning is
 * written, on, with letters still new (never asked: one only shown is asked next), while nothing's been taught (studyOverview's firstTime).
 * Beside lesson 1, never in its place; null otherwise. { pack, total, fresh }.
 */
export function scriptFirst(firstTime, now = Date.now()) {
  if (!firstTime) return null;
  const pack = decksHere().find(teachesScript);
  if (!pack) return null;
  const { total, fresh } = deckOverview(pack, now);
  return fresh ? { pack, total, fresh } : null;
}

/** A session on one deck, as plan.js hands it to the session screen. */
export function deckSession(id, now = Date.now()) {
  const deck = allPacks().find((pack) => pack.id === id && plainItems(pack).length);
  if (!deck) return { title: "Study", steps: [], empty: "That deck isn't on this device.", pose: "shrug" };
  if (deck.language !== learning()) return { title: deck.name, steps: [], empty: "That deck is in another language. Switch to it in Settings → Language to study it.", pose: "shrug" };
  const settings = getStudySettings();
  const allowed = Object.keys(settings.quick.include).filter((way) => settings.quick.include[way]);
  const room = LENGTHS[settings.quick.length]?.steps ?? 8;
  const entries = cardsOf(deck).map((entry) => ({ ...entry, state: unitState(entry.unit, { lang: deck.language, now }) }));
  const due = entries.filter((entry) => entry.state.due).sort((a, b) => lowest(a.state) - lowest(b.state));
  const fresh = entries.filter((entry) => entry.state.isNew);
  const step = (entry, game, skill, extra = {}) => deckStepOf(deck.id, entry, game, skill, extra);
  const steps = [];
  const asked = due.slice(0, room).map((entry) => step(entry, ...Object.values(gameFor(entry, entry.state, allowed)), { meaning: entry.state.slipping ? "slipping" : "review" }));
  // New ones in the room what's due leaves, none while twice a session's worth is due. Each met first, asked near the end.
  const newCount = due.length >= 2 * room ? 0 : Math.min(settings.quick.newPerSession + 2, Math.max(0, Math.ceil((room - asked.length) / 2)));
  const coming = fresh.slice(0, newCount);
  steps.push(...coming.map((entry) => (entry.card.cloze ? null : step(entry, "card", "read", { first: entry.state.met === 0, meaning: "new" }))).filter(Boolean));
  const round = matchStep([...coming, ...due.slice(0, room)], deck);
  if (round && allowed.includes("match") && steps.length + asked.length + coming.length + 1 <= room + newCount) steps.push(round);
  steps.push(...asked);
  for (const entry of coming) {
    const { game, skill } = gameFor(entry, entry.state, allowed);
    // Seen just now, it's asked by the gentlest game it has: a card it was shown on is a self-grade only if nothing else fits.
    steps.push(step(entry, game === "card" && entry.games.includes("choose") && allowed.includes("choose") ? "choose" : game, skill, { meaning: "new" }));
  }
  if (!steps.length) return { title: deck.name, steps: [], empty: "Nothing to go over in this deck right now.", pose: "lounge" };
  return { title: deck.name, steps, deck: deck.id };
}

const lowest = (state) => Math.min(...state.trained.map((skill) => state.strengths[skill]?.recall ?? 1));

// ---------- the word it is ----------

const senseOf = (text) => text.toLocaleLowerCase().replace(/^(?:the|a|an|to)\s+/, "").replace(/[.!?]+$/, "").trim();
const sensesOf = (text) => text.replace(/\([^)]*\)/g, "").split(/[;,]/).map(senseOf).filter(Boolean);

/**
 * The dictionary word a plain item exactly is, or null: the word itself (with the word for "the" before it, as decks write nouns), and a meaning that's among the word's own senses, every part of it.
 * Worked out from the packs' glossary, so nothing's stored and a wrong match can't stay. Anything unclear stays its own item: a word already known is never harmed by a card that only looks like it.
 */
export function wordOfCard(card) {
  if (!card?.text || !card.means || card.cloze) return null;
  const parts = card.text.trim().replace(/[.!?]+$/, "").split(/\s+/);
  const isThe = (word) => Object.hasOwn(WORDS, word) && /^the\b/.test(WORDS[word]);
  if (parts.length > 2 || (parts.length === 2 && !isThe(parts[0].toLocaleLowerCase()))) return null;
  const written = parts.at(-1);
  const word = Object.hasOwn(WORDS, written) ? written : Object.hasOwn(WORDS, written.toLocaleLowerCase()) ? written.toLocaleLowerCase() : null;
  if (!word) return null;
  const has = new Set(sensesOf(WORDS[word]));
  const wanted = sensesOf(card.means);
  return wanted.length && wanted.every((sense) => has.has(sense)) ? word : null;
}

/** The evidence for answering a plain item: its own row and, when it's exactly a word, that word's too. */
export const cardRows = (card, row) => {
  const word = wordOfCard(card);
  return [row, ...(word ? [{ ...row, concept: `w:${word}` }] : [])];
};

// ---------- in the day ----------

const NEW_IN_A_PRACTICE = 2;

/** A deck as it came from Anki. A copy you made of one is yours like anything you made. */
export const isImportedDeck = (pack) => /^anki-/.test(pack?.id ?? "") && !pack?.copiedFrom;
/** Whether a pack's new plain items enter the day: one you made or copied. */
export const entersTheDayNew = (pack) => pack?.origin?.kind === "yours" && !isImportedDeck(pack);

/** A plain item's place in the day: { due: [{ pack, card, unit, state }] (the likeliest forgotten first), fresh: [{ pack, card, unit }] }. Only what has evidence gets a state worked out, so a big deck costs little. */
export function plainOfDay(now = Date.now()) {
  const lang = learning();
  const due = [];
  const fresh = [];
  const packs = decksHere();
  if (!packs.length) return { due, fresh };
  const studied = new Set(studiedUnits(lang));
  for (const pack of packs) {
    const takesNew = entersTheDayNew(pack);
    for (const card of plainItems(pack)) {
      const unit = deckUnit(pack.id, card.id);
      if (!studied.has(unit)) {
        if (takesNew) fresh.push({ pack, card, unit });
        continue;
      }
      const state = unitState(unit, { lang, now });
      if (state.due) due.push({ pack, card, unit, state });
      else if (state.isNew && takesNew) fresh.push({ pack, card, unit });
    }
  }
  due.sort((a, b) => lowest(a.state) - lowest(b.state));
  return { due, fresh };
}

/**
 * How much of a practice goes to plain items: { due, fresh } (a new one takes two steps: met, then asked). goal: the practice's questions; others: how many it could
 * ask about everything else; dueElsewhere: what else is due. Plain items get their share of what's due, at least 2 when any are, and never more than half unless nothing else can be asked.
 */
export function plainShare(plain, { goal, others, dueElsewhere }) {
  const coming = Math.min(plain.fresh.length, NEW_IN_A_PRACTICE);
  if (!others) {
    const fresh = Math.min(coming, Math.floor(goal / 2));
    return { due: Math.min(plain.due.length, goal - fresh * 2), fresh };
  }
  const most = Math.ceil(goal / 2);
  const all = plain.due.length + dueElsewhere;
  const share = all ? Math.ceil((goal * plain.due.length) / all) : 0;
  const due = Math.min(plain.due.length, Math.max(2, share), most);
  return { due, fresh: Math.min(coming, Math.floor((most - due) / 2)) };
}

/** Whether a plain item can stand in a round of Match. */
export const canMatchCard = (card) => gamesOf(card).includes("match");

const deckStepOf = (deckId, entry, game, skill, extra = {}) => ({ kind: "deck", game, skill, pack: deckId, card: entry.card, sound: entry.sound, unit: entry.unit, entry, ...extra });

/** The steps for plain items: asked (what's due), and each new one's meet and ask. A step here is what deckSession makes, so the session screen draws it the same. */
export function plainSteps(picked, fresh, { allowed, now = Date.now() }) {
  const entries = new Map();
  const entryOf = ({ pack, unit }) => {
    if (!entries.has(pack.id)) entries.set(pack.id, new Map(cardsOf(pack).map((entry) => [entry.unit, entry])));
    return entries.get(pack.id).get(unit);
  };
  const lang = learning();
  const asked = picked.map((one) => {
    const entry = entryOf(one);
    return deckStepOf(one.pack.id, entry, ...Object.values(gameFor(entry, one.state, allowed)), { meaning: one.state.slipping ? "slipping" : "review" });
  });
  const coming = fresh.map((one) => {
    const entry = entryOf(one);
    const state = unitState(one.unit, { lang, now });
    const { game, skill } = gameFor(entry, state, allowed);
    return {
      meet: entry.card.cloze ? null : deckStepOf(one.pack.id, entry, "card", "read", { first: state.met === 0, meaning: "new" }),
      ask: deckStepOf(one.pack.id, entry, game === "card" && entry.games.includes("choose") && allowed.includes("choose") ? "choose" : game, skill, { meaning: "new" }),
    };
  });
  return { asked, coming };
}

/** Another game for a card when the one it had can't be played for now: null when it has none (the question goes). */
export function deckInstead(step, without) {
  const wayOut = (game) => without.has(game) || game === "match";
  const game = step.entry.games.find((one) => one !== step.game && !wayOut(one));
  return game ? { ...step, game, skill: (game === "type" && !step.entry.script) || game === "say" ? "say" : game === "listen" ? "hear" : "read" } : null;
}

/** A list in an order that follows its seed, the same every time for the same one. */
export function seededShuffle(list, seed) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) ^ i;
    const j = (hash >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Wrong choices from the rest of the deck: `count` different texts, none the right one, closest in length first. */
export function wrongChoices(right, pool, count, seed) {
  const seen = new Set([right]);
  const candidates = [];
  for (const text of seededShuffle(pool, seed)) {
    if (seen.has(text) || !text) continue;
    seen.add(text);
    candidates.push(text);
  }
  return candidates.sort((a, b) => Math.abs(a.length - right.length) - Math.abs(b.length - right.length)).slice(0, count);
}
