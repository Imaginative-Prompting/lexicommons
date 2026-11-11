// /design: Practice with your AI's parts (public/js/practice/ui.js, css/lx/practice.css), in every state, built with the
// same builders as the room. A card here is a real game from the app (practice/cards.js), playable, nothing sent.

import * as ui from "./lx/ui.js";
import { el } from "./lx/ui.js";
import * as P from "./practice/ui.js";
import { playCard } from "./practice/cards.js";
import { checkCard } from "./practice/protocol.js";
import { speakLine } from "./practice/transcript.js";
import { PATTERNS } from "./study/content.js";

const LINE = {
  nl: "Wat heb je gisteren gedaan?",
  literal: [
    { text: "What", moved: false },
    { text: "have", moved: false },
    { text: "you", moved: false },
    { text: "yesterday", moved: true },
    { text: "done", moved: true },
  ],
  english: [0, 1, 2, 4, 3],
  en: "What did you do yesterday?",
};
const GRADE = {
  turn: 2,
  verdict: "fixed",
  better: "Gisteren ben ik naar de winkel gegaan.",
  marks: [{ said: "ik ben", fix: "ben ik" }],
  concepts: [
    { concept: "p:v2", outcome: "wrong", note: "After gisteren the verb comes next" },
    { concept: "p:perfect", outcome: "right" },
    { concept: "w:winkel", outcome: "hint" },
    { concept: "p:separable", outcome: "avoided" },
  ],
  note: "Start with a time word and the verb jumps ahead of ik.",
};

export function practiceSection({ section, demo, states, resettable }) {
  const graded = P.yourLine("Gisteren ik ben naar de winkel gegaan", { how: "spoken", state: "graded", marks: GRADE.marks });
  graded.append(P.correction(GRADE, { speak: speakLine(GRADE.better, "design:better", "nl"), patterns: PATTERNS }));
  const conversation = P.chat();
  conversation.append(
    P.eventLine("Claude Code joined", "chat"),
    P.aiLine(LINE, { speak: speakLine(LINE.nl, "design:line", "nl") }),
    graded,
    P.aiNote("Nice. With a time word first, the verb comes second: Gisteren ben ik…"),
    P.taskLine("I read a book yesterday."),
    P.yourLine("Ik heb gisteren een boek gelezen.", { how: "typed", state: "sending" }),
    P.typing("Claude Code is thinking"),
  );
  const card = () =>
    playCard(
      checkCard(
        {
          game: "arrange",
          nl: "Ik heb gisteren een boek gelezen.",
          en: "I read a book yesterday.",
          literal: ["I have", "*yesterday*", "a book", "*read*"],
          english: [0, 3, 2, 1],
          moved: ["gisteren", "gelezen"],
          patterns: ["perfect"],
          words: { gisteren: "gisteren", boek: "boek", gelezen: "lezen" },
        },
        "design:card",
      ),
      { seed: "design", practiceId: "design", patterns: PATTERNS, onDone: () => {} },
    );
  const chips = (list) => list.map((state) => [state, P.aiStatus(state, "Claude Code")]);
  return section(
    "practice",
    "Practice with your AI",
    "A live practice with your own AI: its lines in the language you're learning (Dutch here; tap one for the literal line and English), your lines with its marks and corrections, sentences to translate, cards it deals, and where you answer. The room uses a study session's frame.",
    demo("A conversation: chat, chat-line (ai · you · task), chat-said, chat-mark, chat-fix, correction, chat-note, chat-event, chat-typing", conversation),
    states("Your lines: sending · sent · failed · graded", [
      ["sending", P.yourLine("Ik ga morgen naar oma.", { state: "sending" })],
      ["sent", P.yourLine("Ik ga morgen naar oma.", { state: "sent", how: "spoken" })],
      ["failed", P.yourLine("Ik ga morgen naar oma.", { state: "failed" })],
      ["graded", P.yourLine("Morgen ik ga naar oma.", { state: "graded", marks: [{ said: "Morgen ik ga", fix: "Morgen ga ik" }] })],
    ]),
    states("Corrections: right · nearly · not quite · with a hint", [
      ["right", P.correction({ verdict: "right", marks: [], concepts: [{ concept: "p:v2", outcome: "right" }] }, { patterns: PATTERNS })],
      ["fixed", P.correction({ ...GRADE, note: undefined }, { patterns: PATTERNS })],
      ["wrong", P.correction({ verdict: "wrong", better: "Ik heb hem niet gezien.", marks: [], concepts: [{ concept: "p:niet", outcome: "wrong" }] }, { patterns: PATTERNS })],
      ["hint", P.correction({ verdict: "right", marks: [], concepts: [{ concept: "p:modal", outcome: "hint" }] }, { patterns: PATTERNS })],
    ]),
    demo("A role-play's scene", P.scene({ title: "Dinner with family", goal: "Find out what everyone did today, and say what you did.", you: "a visiting nephew", them: "your aunt Marijke" })),
    resettable("A card your AI dealt (playable here; nothing is sent)", card),
    states("Where your AI is", chips(["absent", "here", "thinking", "slow", "away", "ended", "offline", "logging"])),
    demo(
      "What to tell your AI",
      P.aiWait([
        { label: "In any AI app connected to Lexicommons", text: "Practice Dutch with me in Lexicommons" },
        { label: "Or in Claude Code", text: "/mcp__lexicommons__practise", code: true },
      ]),
    ),
    states("Where you answer: speak or type · speak · type", [
      ["both", P.composer({ answer: "both" })],
      ["speak", P.composer({ answer: "speak" })],
      ["type", P.composer({ answer: "type" })],
    ]),
  );
}
