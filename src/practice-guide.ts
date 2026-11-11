// get_practice_guide: how the person's AI runs a live practice with them. The quality of a practice is the quality of
// these instructions plus the person's AI. The text is public/js/practice/guide.js's, the same one the in-app AI follows
// (ai/inapp.js), so the two never drift. Formats are checked by public/js/practice/protocol.js, which it mirrors. It's
// the same for every language: each practice names its own (joined's practice.language), and the examples are Dutch.

import { KINDS } from "../public/js/practice/protocol.js";
import { CARD_EXAMPLES, KIND_RULES, practiceGuideText } from "../public/js/practice/guide.js";

const GUIDE = practiceGuideText({ mcp: true });

export function practiceGuide() {
  return {
    guide: GUIDE,
    kinds: Object.fromEntries(Object.entries(KINDS).map(([id, kind]) => [id, { name: kind.name, about: kind.about, how: KIND_RULES[id as keyof typeof KINDS] }])),
    cardExamples: CARD_EXAMPLES,
    replyExample: {
      practice_id: "…",
      seat: "…",
      grade: {
        verdict: "fixed",
        better: "Gisteren ben ik naar de winkel gegaan.",
        marks: [{ said: "Gisteren ik ben", fix: "Gisteren ben ik" }],
        concepts: [
          { concept: "p:v2", outcome: "wrong", note: "After gisteren the verb comes next, then ik." },
          { concept: "p:perfect", outcome: "right" },
          { concept: "w:winkel", outcome: "right" },
        ],
        note: "Start with a time word and the verb jumps ahead of ik.",
      },
      say: {
        nl: "Wat heb je daar gekocht?",
        literal: ["What", "have", "you", "*there*", "*bought*"],
        en: "What did you buy there?",
        words: { gekocht: "kopen" },
      },
      expect: "either",
    },
  };
}
