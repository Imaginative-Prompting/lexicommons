// Ask anything, from where you are: a "…" by a sentence, a word or a pattern opens a short menu (ui.moreMenu).
// Explain this leaves your AI a question about it at once; Ask your AI about this… opens a sheet to write your own,
// showing what it's about; Copy the question copies it as text for any AI. Each question carries what it's about
// (requests.js checkAbout), and the answer comes back on the AI tab. A line by the "…" (ui.askStatus) says what
// happened, with Undo while your AI hasn't taken it.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { cancelRequest, createRequest, describeAsk } from "./client.js";
import { ABOUT_LIMITS, REQUEST_LIMITS, checkAbout } from "./requests.js";
import { learning } from "../study/learning.js";
import { languageName } from "../lang/index.js";
import { aiConnected } from "../shell/layout.js";

const ASK_KEY = "lx.ai.ask-anywhere.v1";
/** The AI section's "Ask from anywhere" switch: off unless turned on, on this device. */
export function askAnywhereOn() {
  try {
    return localStorage.getItem(ASK_KEY) === "on";
  } catch {
    return false;
  }
}
export function setAskAnywhere(on) {
  try {
    if (on) localStorage.setItem(ASK_KEY, "on");
    else localStorage.removeItem(ASK_KEY);
  } catch {
    // Private browsing: it stays off.
  }
}
/** Whether a "…" offers to ask your AI about what's on the screen: the switch is on and there's an AI to answer. */
export const askFromAnywhere = () => aiConnected() && askAnywhereOn();

const clip = (text, max) => (typeof text === "string" && text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

// Long text cut to what requests.js takes (a sentence from a book can run long; so can a typed answer).
function clipped(about) {
  const out = { ...about };
  const L = ABOUT_LIMITS;
  if (out.sentence) out.sentence = { ...out.sentence, text: clip(out.sentence.text, L.sentence), literal: clip(out.sentence.literal, L.literal), natural: clip(out.sentence.natural, L.sentence) };
  if (out.word) out.word = { ...out.word, text: clip(out.word.text, L.word), lemma: clip(out.word.lemma, L.word) };
  if (out.book) out.book = { ...out.book, title: clip(out.book.title, L.title) };
  for (const [key, max] of [["where", L.where], ["game", L.game], ["answer", L.answer]]) if (out[key] !== undefined) out[key] = clip(out[key], max);
  return out;
}

/**
 * about as requests.js keeps it: the language defaulting to the one you're learning, long text cut to its limits, and
 * any part it still refuses (an id in a form it doesn't know, say) left out rather than losing the question.
 */
export function keptAbout(about) {
  const full = clipped({ language: learning(), ...about });
  const passes = (value) => {
    try {
      checkAbout(value);
      return true;
    } catch {
      return false;
    }
  };
  if (passes(full)) return full;
  let kept = passes({ language: full.language }) ? { language: full.language } : { language: learning() };
  for (const [key, value] of Object.entries(full)) {
    if (key === "language") continue;
    const tries = value && typeof value === "object" && value.id !== undefined ? [value, { ...value, id: undefined }] : [value];
    const next = tries.map((v) => ({ ...kept, [key]: v })).find(passes);
    if (next) kept = next;
  }
  return kept;
}

// What goes with the question, in words, for the sheet's note.
function carried(about) {
  const parts = [];
  if (about.sentence) parts.push("the sentence");
  if (about.word) parts.push("the word");
  if (about.game) parts.push("the game");
  if (about.answer !== undefined) parts.push("your answer");
  if (about.unit) parts.push(`the ${about.unit.slice(0, 2) === "p:" ? "pattern" : about.unit.slice(0, 2) === "c:" ? "phrase" : "word"}`);
  if (about.book) parts.push("the book");
  if (parts.length < 2) return parts[0] ?? "what it's about";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

// Why it couldn't go, in words: a fetch that never reached the server says only "Failed to fetch".
const why = (error) => (error instanceof TypeError ? "Couldn't reach Lexicommons, so it wasn't sent. Try again when you're online." : error.message);

/**
 * The "…" and its menu for one thing on screen, and the line that says what happened. about: what it's about
 * (requests.js checkAbout); thing: what it is, in words ("this sentence"); explain: the question Explain this sends;
 * subject: what Explain this explains ("this sentence and why it goes this way"); card: how the sheet shows it
 * ({ text, lang, meta }); label: the "…"'s name; under: as ui.moreMenu's. Returns { button, status }: put status
 * where a line about it reads well.
 */
export function askMenu({ about, thing, explain, subject, card, label = "Ask about this", under }) {
  // Off unless it's been turned on, connected or not: an AI answers only once its person has gone and told it to.
  if (!askFromAnywhere()) return { button: null, status: null };
  const kept = keptAbout(about);
  const status = ui.askStatus();
  const sent = async (what) => {
    const request = await createRequest({ kind: "ask", what, about: kept });
    status.say(
      "right",
      "Sent to your AI. The answer comes back on the AI tab.",
      ui.button("Undo", {
        variant: "fade",
        size: "sm",
        onclick: () => undo(request),
      }),
    );
  };
  // Undo, and again with Retry while it can't reach Lexicommons.
  const undo = async (request) => {
    try {
      await cancelRequest(request.id);
      status.say(null, "Canceled: no AI will take it.");
    } catch (error) {
      status.fail(why(error), () => undo(request));
    }
  };
  // Explain this, and again with Retry while it can't go.
  const explainNow = () => sent(explain).catch((error) => status.fail(why(error), explainNow));
  const copy = async (what, say = status.say) => {
    try {
      await navigator.clipboard.writeText(describeAsk({ what, about: kept }));
      say("right", "Copied. Paste it into any AI.");
    } catch (error) {
      say("wrong", error?.name === "NotAllowedError" ? "This browser didn't let it copy." : error.message);
    }
  };
  const button = ui.moreMenu({
    label,
    under,
    items: [
      { icon: "sparkle", title: "Explain this", sub: `Your AI explains ${subject}`, onclick: explainNow },
      { icon: "chat", title: "Ask your AI about this…", sub: "Write your own question", onclick: () => openSheet() },
      { icon: "copy", title: "Copy the question", sub: "To paste into any AI", onclick: () => copy(explain) },
    ],
  });

  function openSheet() {
    // While it's open no key reaches the screen under it (a session's Enter would go on, its Escape would end it);
    // Escape closes the sheet.
    const onKey = (event) => {
      event.stopPropagation();
      if (event.key !== "Escape") return;
      event.preventDefault();
      layer.lxClose();
    };
    // The layer takes itself off the page once it has slid away.
    const layer = ui.sheetLayer({ label: "Ask your AI", onClose: () => removeEventListener("keydown", onKey, true) });
    const field = el("textarea", { part: "text-field", rows: 4, maxlength: REQUEST_LIMITS.question, placeholder: `Your question about ${thing}`, "aria-label": "Your question" });
    const note = ui.askStatus();
    // The question sent; if it can't go, Retry sends the same question again.
    const send = async (what) => {
      try {
        await sent(what);
        layer.lxClose();
      } catch (error) {
        note.fail(why(error), () => send(what));
      }
    };
    const question = () => {
      const what = field.value.trim();
      if (!what) {
        note.say("wrong", "Write your question first.");
        field.focus();
      }
      return what;
    };
    layer.lxBody.append(
      el(
        "div",
        { class: "lx-stack lx-ask-sheet" },
        el("h2", { class: "lx-sheet-title" }, "Ask your AI"),
        ui.askAbout(card),
        field,
        el("p", { class: "lx-small lx-muted" }, `It goes to your AI with ${carried(kept)}. The answer comes back on the AI tab, its ${languageName(kept.language)} marked.`),
        note,
        el(
          "div",
          { class: "lx-ask-actions" },
          ui.button("Send to your AI", {
            variant: "go",
            size: "lg",
            onclick: () => {
              const what = question();
              if (what) return send(what);
            },
          }),
          ui.button("Copy the question", {
            variant: "gray",
            size: "lg",
            icon: "copy",
            onclick: () => {
              const what = question();
              if (what) copy(what, note.say);
            },
          }),
        ),
      ),
    );
    layer.lxOpen();
    addEventListener("keydown", onKey, true);
    field.focus({ preventScroll: true });
  }

  return { button, status };
}
