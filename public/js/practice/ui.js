// Builders for Practice with your AI's own parts (the theming surface's "Practice" group in lx/parts.js; styles in
// css/lx/practice.css). Everything else in the room comes from lx/ui.js. All text goes in as text. A practice is in one
// language: the builders that show it take its code (lang) and name, the language being learned unless said.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { icon, MEANING_ICON } from "../lx/icons.js";
import { motionOn } from "../lx/motion.js";
import { setLang } from "../lx/bidi.js";
import { conceptLabel } from "./protocol.js";

/** The conversation: a column of chat lines, notes and events. */
export const chat = () => el("div", { part: "chat", role: "log", "aria-live": "polite", "aria-label": "The practice" });

/**
 * One line from your AI in the practice's language: a speak button, the line, and behind a tap its literal line (with
 * the order switch when it can flip) and natural English. line = { nl, literal: [{ text, moved }], en, english }.
 * speak({ onWord }) as lx/ui.js speakButton. Returns the node; node.lxPlay() reads it aloud, node.lxReveal() opens the
 * meaning.
 */
export function aiLine(line, { speak, lang = ui.targetLanguage().code, name = ui.targetLanguage().name } = {}) {
  const words = line.nl.split(/\s+/).map((word) => el("span", { part: "spoken-word" }, word));
  const light = (index) => words.forEach((w, i) => (i === index ? w.setAttribute("data-speaking", "") : w.removeAttribute("data-speaking")));
  const button = speak ? ui.speakButton(speak, { label: "Read it aloud", onWord: light }) : null;
  const detail = el("div", { class: "lx-chat-detail", hidden: true });
  if (line.literal?.length) {
    const literal = ui.literalLine({ literal: line.literal, punct: "", english: line.english ?? null }, { name });
    detail.append(el("div", { class: "lx-chat-literal" }, literal, literal.lxCanFlip ? ui.orderSwitch(literal, { lang, name }) : null));
  }
  if (line.en) detail.append(el("p", { part: "natural-line" }, line.en));
  const hasDetail = detail.childElementCount > 0;
  const reveal = hasDetail
    ? el("button", { part: "icon-button", type: "button", class: "lx-chat-reveal", "aria-label": "Show the literal line and English", title: "Meaning", "aria-expanded": "false" }, icon("eye"))
    : null;
  const text = el("p", { class: "lx-chat-nl", lang }, words.flatMap((w, i) => (i ? [" ", w] : [w])));
  const node = el("div", { part: "chat-line", variant: "ai" }, el("div", { class: "lx-chat-row" }, button, text, reveal), hasDetail ? detail : null);
  const toggle = () => {
    detail.hidden = !detail.hidden;
    reveal?.setAttribute("aria-expanded", String(!detail.hidden));
    if (!detail.hidden) {
      detail.querySelector('[data-part="literal-line"]')?.lxMorph?.();
      requestAnimationFrame(() => showWhole(node));
    }
  };
  reveal?.addEventListener("click", toggle);
  if (hasDetail) text.addEventListener("click", toggle);
  node.lxPlay = () => button?.lxPlay();
  node.lxSpeakButton = button;
  node.lxReveal = () => detail.hidden && hasDetail && toggle();
  return node;
}

/**
 * Scrolls the conversation just enough that all of `node` shows (a line whose meaning just opened under the last
 * message would otherwise hang below the answer bar). It never scrolls the line's top out of view.
 */
function showWhole(node) {
  let scroller = node.parentElement;
  while (scroller && !/^(auto|scroll)$/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
  if (!scroller) return;
  const view = scroller.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  const room = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
  const below = box.bottom - (view.bottom - Math.min(room, 24));
  if (below <= 0) return;
  const by = Math.min(below, box.top - view.top);
  if (by > 0) scroller.scrollBy({ top: by, behavior: motionOn() ? "smooth" : "auto" });
}

/** English from your AI: a tip, an explanation, a step out of the role-play. */
export const aiNote = (text) => el("p", { part: "chat-note" }, text);

/** A sentence to put into the practice's language (Translate). */
export const taskLine = (english, { name = ui.targetLanguage().name } = {}) =>
  el("div", { part: "chat-line", variant: "task" }, el("span", { class: "lx-chat-label" }, icon("globe"), `Say it in ${name}`), el("p", { class: "lx-chat-task", lang: "en" }, english));

/** Something that happened: your AI joined, the practice ended. */
export const eventLine = (text, iconName = "info") => el("p", { part: "chat-event" }, icon(iconName), text);

/** Your AI is working on its reply. */
export const typing = (text = "Thinking") =>
  el("div", { part: "chat-typing", role: "status", "aria-label": `${text}…` }, el("span", { class: "lx-dot" }), el("span", { class: "lx-dot" }), el("span", { class: "lx-dot" }));

/** A role-play's scene: where, what you're after, who's who. */
export function scene({ title, goal, you, them }) {
  return el(
    "section",
    { part: "practice-scene" },
    el("h3", {}, title),
    goal ? el("p", { class: "lx-scene-goal" }, icon("target"), goal) : null,
    you || them ? el("p", { class: "lx-small lx-muted" }, [you && `You: ${you}`, them && `Your AI: ${them}`].filter(Boolean).join(" · ")) : null,
  );
}

/**
 * What you said, with your AI's marks: each marked stretch gets the wrong-word line, and its fix after it. state:
 * sending · sent · failed · graded. how: typed or spoken (a microphone shows).
 */
export function yourLine(text, { how = "typed", state = "sent", marks = [], lang = ui.targetLanguage().code } = {}) {
  const said = el("p", { part: "chat-said", lang });
  fillMarks(said, text, marks);
  const node = el("div", { part: "chat-line", variant: "you", state }, el("div", { class: "lx-chat-row" }, how === "spoken" ? el("span", { class: "lx-chat-how", title: "Said aloud" }, icon("mic")) : null, said));
  node.lxSetMarks = (next) => fillMarks(said, text, next);
  node.lxSaid = said;
  return node;
}

function fillMarks(said, text, marks) {
  const lower = text.toLowerCase();
  const spans = [];
  for (const mark of marks) {
    const at = lower.indexOf(mark.said.toLowerCase());
    if (at < 0 || spans.some(([s, e]) => at < e && at + mark.said.length > s)) continue;
    spans.push([at, at + mark.said.length, mark.fix]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const parts = [];
  let i = 0;
  for (const [start, end, fix] of spans) {
    if (start > i) parts.push(text.slice(i, start));
    parts.push(el("span", { part: "chat-mark", title: fix ? `Better: ${fix}` : "Not quite" }, text.slice(start, end)));
    if (fix) parts.push(el("ins", { part: "chat-fix" }, fix));
    i = end;
  }
  if (i < text.length) parts.push(text.slice(i));
  said.replaceChildren(...parts);
}

const VERDICT = {
  right: { meaning: "right", title: "Right" },
  fixed: { meaning: "wrong", title: "Nearly. Better:" },
  wrong: { meaning: "wrong", title: "Not quite. Better:" },
};

/**
 * Your AI's grade of one of your lines: the verdict (icon and word), the better version (read aloud on a tap), its
 * note, and the concepts it was evidence for, each tagged right, wrong, hint, or avoided.
 */
export function correction(grade, { speak, patterns = {}, lang = ui.targetLanguage().code } = {}) {
  const verdict = VERDICT[grade.verdict];
  const hinted = grade.concepts.some((c) => c.outcome === "hint");
  const meaning = verdict ? (verdict.meaning === "right" && hinted ? "hint" : verdict.meaning) : null;
  const better = grade.better ? el("p", { class: "lx-correction-better", lang }, grade.better) : null;
  const tags = grade.concepts.map((c) =>
    c.outcome === "avoided"
      ? el("span", { part: "concept-tag", title: c.note ?? "You went round this one" }, `${conceptLabel(c.concept, patterns)}: avoided`)
      : el("span", { part: "concept-tag", meaning: c.outcome, title: c.note ?? undefined }, icon(MEANING_ICON[c.outcome]), conceptLabel(c.concept, patterns)),
  );
  return el(
    "div",
    { part: "correction", meaning: meaning ?? undefined },
    verdict ? el("p", { class: "lx-correction-title" }, icon(MEANING_ICON[meaning]), verdict.title) : null,
    better ? el("div", { class: "lx-correction-row" }, speak ? ui.speakButton(speak, { label: "Read the better version aloud" }) : null, better) : null,
    grade.note ? el("p", { class: "lx-correction-note" }, grade.note) : null,
    tags.length ? el("div", { class: "lx-correction-tags" }, tags) : null,
  );
}

/** A game your AI dealt: its prompt over the app's own game. */
export const practiceCard = (prompt, ...content) => el("section", { part: "practice-card" }, prompt ? ui.activityPrompt(prompt.label, prompt.text) : null, ...content);

const STATUS = {
  absent: ["clock", (c) => "Waiting for your AI"],
  here: ["chat", (c) => `${c} is listening`],
  thinking: ["sparkle", (c) => `${c} is thinking`],
  slow: ["clock", (c) => `${c} is taking a while`],
  away: ["info", (c) => `${c} isn't answering`],
  ended: ["check", () => "Ended"],
  offline: ["cloud", () => "Reconnecting…"],
  logging: ["chat", (c) => `${c} is logging it`],
};

/** Where your AI is, in the room's bar. state: absent · here · thinking · slow · away · ended · offline · logging. */
export function aiStatus(state, client = "Your AI") {
  const node = el("span", { part: "ai-status", role: "status" });
  node.lxSet = (next, who = client) => {
    const [iconName, text] = STATUS[next] ?? STATUS.absent;
    node.setAttribute("data-state", next);
    node.replaceChildren(icon(iconName), el("span", {}, text(who || "Your AI")));
  };
  node.lxSet(state, client);
  return node;
}

/**
 * What to tell your AI, with a copy button: before it joins a practice (the room), or to practice in its own app (the
 * Practice page, title null). phrases = [{ label, text, code? }].
 */
export function aiWait(phrases, { note, title = "Waiting for your AI", intro = "Open your AI (the Claude app, Claude Code, Codex…) and tell it:" } = {}) {
  return el(
    "section",
    { part: "ai-wait" },
    title ? el("h3", {}, title) : null,
    title ? el("p", { class: "lx-muted" }, intro) : null,
    ...phrases.map(({ label, text, code }) => {
      const value = el(code ? "code" : "p", { class: "lx-wait-phrase" }, text);
      const copy = ui.button("Copy", { variant: "fade", size: "sm", icon: "copy" });
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(text);
          copy.lastChild.textContent = "Copied";
        } catch {
          getSelection()?.selectAllChildren(value);
        }
      });
      return el("div", { class: "lx-wait-row" }, label ? el("span", { class: "lx-tiny lx-muted" }, label) : null, el("div", { class: "lx-wait-copy" }, value, copy));
    }),
    note ? el("p", { class: "lx-small lx-muted" }, note) : null,
  );
}

/**
 * Where you answer: the microphone, a text field and Send, with Hint and End under them. answer: both · speak ·
 * type (speak shows "Type instead"). Returns the form, with lxInput, lxMic, lxStatus (a line for what the microphone is
 * doing), lxFocus() and lxSetLanguage(lang, name) (the practice's, once known).
 */
export function composer({ answer = "both", onSend, onMic, onHint, onEnd, lang = ui.targetLanguage().code, name = ui.targetLanguage().name }) {
  const input = el("input", { part: "text-field", type: "text", lang, placeholder: `Type in ${name}…`, autocomplete: "off", autocapitalize: "sentences", autocorrect: "off", spellcheck: "false", enterkeyhint: "send", "aria-label": "Your answer" });
  const send = ui.button("Send", { variant: "go", type: "submit" });
  // Speak only: the big "Tap to speak" button, at the bottom where a thumb reaches it. Beside a text field: the round one.
  const mic = ui.micButton({ onclick: () => onMic?.(), size: answer === "speak" ? undefined : "sm" });
  const status = el("p", { class: "lx-composer-status lx-small lx-muted", "aria-live": "polite" });
  const typeRow = el("div", { class: "lx-composer-type" }, input, send);
  const showType = ui.button("Type instead", { variant: "fade", size: "sm", icon: "pencil" });
  const form = el(
    "form",
    { part: "composer", "data-answer": answer },
    el("div", { class: "lx-composer-row" }, answer !== "type" ? mic : null, answer !== "speak" ? typeRow : null),
    status,
    el(
      "div",
      { class: "lx-composer-tools" },
      ui.button("Hint", { variant: "fade", size: "sm", icon: "bulb", onclick: () => onHint?.() }),
      answer === "speak" ? showType : null,
      ui.button("End", { variant: "fade", size: "sm", icon: "cross", onclick: () => onEnd?.() }),
    ),
  );
  showType.addEventListener("click", () => {
    form.setAttribute("data-answer", "both");
    mic.setAttribute("data-size", "sm");
    form.querySelector(".lx-composer-row").append(typeRow);
    showType.remove();
    input.focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    input.value = "";
    onSend?.(value);
  });
  form.lxInput = input;
  form.lxMic = mic;
  form.lxStatus = status;
  form.lxFocus = () => (input.isConnected ? input.focus({ preventScroll: true }) : null);
  form.lxSetLanguage = (code, languageName) => {
    setLang(input, code);
    input.setAttribute("placeholder", `Type in ${languageName}…`);
  };
  return form;
}
