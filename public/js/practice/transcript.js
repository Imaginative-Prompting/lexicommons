// A practice's transcript, drawn from its turns: your AI's lines, notes, scenes, tasks and cards; your lines with its
// marks and corrections under them; what happened (joined, ended); and the summary. The live room (room.js) and a past
// practice's page (home.js) both draw with this; only the room plays cards and reads lines aloud as they arrive.
// Everything in the practice's language is drawn and spoken as that language (state.language), whatever you're
// learning now.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import * as motion from "../lx/motion.js";
import * as voice from "../study/voice.js";
import { PATTERNS } from "../study/content.js";
import { languageName } from "../lang/index.js";
import { conceptLabel } from "./protocol.js";
import { languageOf, tally } from "./store.js";
import { playCard } from "./cards.js";
import * as P from "./ui.js";

/** Reads a line in a language (its code) aloud with this device's voice (lines your AI writes have no recordings). */
export const speakLine = (text, id, lang) => (options) => voice.speakItem({ id, words: text.split(/\s+/).filter(Boolean).map((w) => [w]), punct: "" }, { ...options, lang });

/**
 * live: cards can be played (onCard(seq, card, result)) and lines arriving are read aloud when `readAloud()` says so.
 * language: the practice's (state.language: the room sets it once the practice arrives, before drawing its turns).
 * Returns { node, state, apply(turns, { arriving }), pendingLine(key, text, how), draftLines(lines), clearDraft(), summary, closeCards() }.
 */
export function createTranscript({ practiceId, client = "Your AI", live = false, onCard, readAloud = () => false, appear = true, language = ui.targetLanguage().code }) {
  const node = P.chat();
  const lines = new Map(); // seq → your line's node
  const pending = new Map(); // key → your line's node, before the server has it
  const cards = new Map(); // seq of the reply that dealt it → card node
  const answered = new Map(); // card seq → your card turn
  const drawn = new Set();
  // The in-app AI's lines while its reply is still coming (draftLines): the reply that lands takes their place without drawing them twice.
  let draft = [];
  let summary = null;
  const state = { client, language };
  const named = () => ({ lang: state.language, name: languageName(state.language) });

  const add = (child, { animate = true } = {}) => {
    node.append(child);
    if (animate && appear) motion.appear(child);
    return child;
  };

  function drawReply(turn, arriving) {
    const toRead = [];
    const drafted = draft.length;
    clearDraft();
    turn.grades?.forEach((grade) => {
      const target = lines.get(grade.turn);
      const box = P.correction(grade, { speak: grade.better ? speakLine(grade.better, `practice:${practiceId}:${turn.seq}:better`, state.language) : null, patterns: PATTERNS, lang: state.language });
      if (target) {
        target.lxSetMarks(grade.marks);
        target.setAttribute("data-state", "graded");
        target.append(box);
        if (arriving && appear) motion.appear(box);
      } else add(box, { animate: arriving });
    });
    if (turn.scene) add(P.scene(turn.scene), { animate: arriving });
    if (turn.explain) add(P.aiNote(turn.explain), { animate: arriving });
    (turn.say ?? []).forEach((line, i) => {
      const view = P.aiLine(line, { speak: speakLine(line.nl, `practice:${practiceId}:${turn.seq}:${i}`, state.language), ...named() });
      add(view, { animate: arriving && i >= drafted });
      toRead.push(view);
    });
    if (turn.translate) add(P.taskLine(turn.translate, named()), { animate: arriving });
    if (turn.card) {
      const card = live
        ? playCard(turn.card, { seed: `${practiceId}:${turn.seq}`, practiceId, patterns: PATTERNS, lang: state.language, onDone: (result) => onCard?.(turn.seq, turn.card, result) })
        : playCard(turn.card, { seed: `${practiceId}:${turn.seq}`, practiceId, patterns: PATTERNS, lang: state.language });
      cards.set(turn.seq, card);
      add(card, { animate: arriving });
    }
    // One after another: each line starts when the one before it ends.
    if (arriving && readAloud() && toRead.length) {
      toRead.reduce((before, view) => before.then(() => view.lxSpeakButton && (view.lxPlay(), new Promise((resolve) => waitForEnd(view.lxSpeakButton, resolve)))), Promise.resolve());
    }
  }

  function clearDraft() {
    for (const view of draft) view.remove();
    draft = [];
  }

  function draw(turn, arriving) {
    if (drawn.has(turn.seq)) return;
    drawn.add(turn.seq);
    if (turn.who === "app") {
      if (turn.type === "joined") add(P.eventLine(`${turn.client ?? "Your AI"} joined`, "chat"), { animate: arriving });
      else if (turn.type === "ended") {
        const who = turn.by === "you" ? "You ended the practice" : turn.by === "ai" ? `${state.client} ended the practice` : "The practice ended";
        add(P.eventLine(turn.why ? `${who}: ${turn.why}` : `${who}.`, "check"), { animate: arriving });
      }
      return;
    }
    if (turn.who === "you") {
      if (turn.type === "said") {
        const mine = turn.key && pending.get(turn.key);
        if (mine) {
          pending.delete(turn.key);
          mine.setAttribute("data-state", "sent");
          lines.set(turn.seq, mine);
        } else lines.set(turn.seq, add(P.yourLine(turn.text, { how: turn.how, lang: state.language }), { animate: arriving }));
      } else if (turn.type === "hint") add(P.eventLine("You asked for a hint", "bulb"), { animate: arriving });
      else if (turn.type === "card") {
        answered.set(turn.card, turn);
        const card = cards.get(turn.card);
        if (card && !card.lxFinished()) card.lxShowAnswered(turn);
      }
      return;
    }
    if (turn.type === "reply") drawReply(turn, arriving);
    else if (turn.type === "summary") summary = turn;
  }

  return {
    node,
    state,
    /** Draws new turns in order. arriving: they're new this moment (animate, read aloud). */
    apply(turns, { arriving = false } = {}) {
      for (const turn of [...turns].sort((a, b) => a.seq - b.seq)) {
        // One turn that can't be drawn mustn't take the rest with it.
        try {
          draw(turn, arriving);
        } catch (error) {
          console.error(`[practice] couldn't draw turn ${turn.seq} (${turn.who} ${turn.type}):`, error);
        }
      }
    },
    /** The in-app AI's lines so far, while its reply is still coming (each new one appears; the reply takes their place). */
    draftLines(sayLines) {
      const start = draft.length;
      sayLines.slice(start).forEach((line, i) => draft.push(add(P.aiLine(line, { speak: speakLine(line.nl, `practice:${practiceId}:draft:${start + i}`, state.language), ...named() }))));
    },
    clearDraft,
    /** Your line, drawn the moment you send it; the server's copy (same key) takes it over. */
    pendingLine(key, text, how) {
      const line = add(P.yourLine(text, { how, state: "sending", lang: state.language }));
      pending.set(key, line);
      return line;
    },
    get summary() {
      return summary;
    },
    /** A finished practice's cards that were never answered say so (and can't be played). */
    closeCards() {
      for (const card of cards.values()) if (!card.lxFinished()) card.lxShowAnswered(null);
    },
  };
}

function waitForEnd(button, resolve) {
  // The speak button is "playing" until its sound ends (or is stopped).
  const check = () => (button.getAttribute("data-state") === "playing" ? setTimeout(check, 200) : resolve());
  setTimeout(check, 200);
}

/** How a practice went: the counts, your AI's words, what to work on, the concepts it touched, new words. */
export function summaryBlock(practice, { actions } = {}) {
  const summary = practice.turns.filter((t) => t.type === "summary").at(-1);
  const lang = languageOf(practice);
  const counts = tally(practice);
  const stat = (n, label) => el("div", { class: "lx-stat" }, el("strong", {}, String(n)), el("span", {}, label));
  const concepts = counts.concepts
    .sort((a, b) => b.wrong + b.avoided - (a.wrong + a.avoided))
    .map((c) => {
      const meaning = c.wrong ? "wrong" : c.hint ? "hint" : c.right ? "right" : null;
      return el(
        "div",
        { class: "lx-touched-row" },
        meaning ? ui.conceptTag(conceptLabel(c.concept, PATTERNS), meaning) : el("span", { part: "concept-tag" }, conceptLabel(c.concept, PATTERNS)),
        el("span", { class: "lx-tally" }, [c.right && `${c.right} right`, c.hint && `${c.hint} with a hint`, c.wrong && `${c.wrong} missed`, c.avoided && `${c.avoided} avoided`].filter(Boolean).join(" · ")),
      );
    });
  const listOf = (title, items) => (items?.length ? el("div", { class: "lx-stack" }, el("h3", { class: "lx-h3" }, title), el("ul", { class: "lx-summary-list" }, items.map((text) => el("li", {}, text)))) : null);
  return el(
    "section",
    { part: "session-summary" },
    el("h2", {}, "How it went"),
    // The counts only when there's something to count (a practice that graded nothing shows none of its 0s).
    counts.right + counts.fixed + counts.wrong ? el("div", { class: "lx-stats" }, stat(counts.right, "right"), stat(counts.fixed, "nearly"), stat(counts.wrong, "missed")) : null,
    summary ? el("p", { class: "lx-summary-text" }, summary.text) : el("p", { class: "lx-muted" }, practice.client ? `${practice.client} didn't send a summary.` : "No summary."),
    listOf("Went well", summary?.wentWell),
    listOf("To work on", summary?.workOn),
    concepts.length ? el("div", { class: "lx-stack" }, el("h3", { class: "lx-h3" }, "What it touched"), el("div", {}, concepts)) : null,
    summary?.newWords?.length
      ? el(
          "div",
          { class: "lx-stack" },
          el("h3", { class: "lx-h3" }, "New words"),
          el(
            "ul",
            { class: "lx-summary-list" },
            summary.newWords.map((w, i) => el("li", {}, ui.speakButton(speakLine(w.nl, `practice:${practice.id}:word:${i}`, lang), { label: `Say ${w.nl}` }), el("span", { lang }, w.nl), w.en ? el("span", { class: "lx-muted" }, ` · ${w.en}`) : null)),
          ),
        )
      : null,
    actions ?? null,
  );
}
