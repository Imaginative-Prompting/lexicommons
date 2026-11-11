// Coaching over MCP: your AI reads your study (src/coach.ts) and talks about it with you in its own app. Read-only: nothing here changes anything.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { COACHING_GUIDE } from "./coach-guide";
import { conceptOf, lessonOf, missesOf, summaryOf, type StudyRecord } from "./coach";
import { formFromLibrary, patternFromLibrary, sentenceFromLibrary } from "./coach-library";
import type { CallerProps, Env } from "./env";
import { practiceRoom } from "./practice";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
type Helpers = {
  caller: () => CallerProps & { clientName?: string };
  sourceLabel: (props: CallerProps & { clientName?: string }) => string;
  ok: (value: unknown) => ToolResult;
  guarded: (run: () => Promise<ToolResult>) => Promise<ToolResult>;
};

const NOTHING_YET =
  "Their app hasn't sent their study yet. It lives on their device, which sends a copy once it has opened with you connected: ask them to open Lexicommons once, and then it's here. Until then, help from what they tell you.";
const language = z.string().max(16).optional().describe("A language's code (nl, de…). Leave it out for the one they're learning.");

export function registerCoachTools(server: McpServer, env: Env, { caller, ok, guarded }: Helpers) {
  const room = () => practiceRoom(env, caller().userId);
  /** Their record in a language, or the one they studied last. */
  async function record(asked?: string): Promise<{ record: StudyRecord; updatedAt: number; others: { language: string; updatedAt: number }[] } | { nothing: string }> {
    const found = await room().getRecord(asked);
    if (!found) {
      const all = await room().recordLanguages();
      return { nothing: asked && all.length ? `Nothing for "${asked}": they've studied ${all.map((a) => a.language).join(", ")} since connecting you. A language's record comes when they study it.` : NOTHING_YET };
    }
    return { record: JSON.parse(found.record) as StudyRecord, updatedAt: found.updatedAt, others: (await room().recordLanguages()).filter((other) => other.language !== found.language) };
  }

  server.registerTool(
    "get_coaching_guide",
    {
      title: "How to coach them from their study",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "How to help someone with the language they're learning from their own lessons and mistakes. Read it once, the first time they ask you anything about the language.",
    },
    async () => guarded(async () => ok({ guide: COACHING_GUIDE })),
  );

  server.registerTool(
    "study_summary",
    {
      title: "What they're learning, and what they struggle with",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "Call this first whenever the person asks anything about the language they're learning, even with no language named: \"what am I bad at?\", \"what am I struggling with?\", \"why does the verb go there?\", why a word goes where it does, the difference between two words, a point of grammar, what to practice next. Their place on the path and the lesson they're on, what they struggle with most and why, the sentences they just got wrong and in which game, how each game goes, and the grammar they've met, with each pattern's explanation. From their own study, as their app last sent it.",
      inputSchema: z.object({ language }),
    },
    async ({ language: asked }) =>
      guarded(async () => {
        const found = await record(asked);
        if ("nothing" in found) return ok({ nothing: true, note: found.nothing });
        return ok(summaryOf(found.record, found.updatedAt, found.others));
      }),
  );

  server.registerTool(
    "study_concept",
    {
      title: "One thing they're learning, in detail",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "One grammar pattern, word, phrase or card of a deck from their study, by what it's called (\"verb second\", \"lopen\", a card's words) or its id (p:v2, w:lopen): its explanation, how strong it is and why it's hard for them, the sentences of theirs it's in, and what they missed on it. Use it when they ask about a word or a point of grammar, and for each word when they ask the difference between two.",
      inputSchema: z.object({ concept: z.string().min(1).max(200), language }),
    },
    async ({ concept, language: asked }) =>
      guarded(async () => {
        const found = await record(asked);
        if ("nothing" in found) return ok({ nothing: true, note: found.nothing });
        const about = conceptOf(found.record, concept) as ReturnType<typeof conceptOf> & { id?: string; kind?: string };
        const language = found.record.language;
        // What the library says about it: a pattern's short name, rule and long part; a word's form when they asked by one.
        if (about.found && about.kind === "pattern" && about.id) return ok({ ...about, ...(await patternFromLibrary(env, language, about.id.slice(2))) });
        if (!about.found) {
          const forms = await formFromLibrary(env, language, concept);
          if (forms.length) return ok({ ...about, formOf: forms });
        }
        return ok(about);
      }),
  );

  server.registerTool(
    "study_sentence",
    {
      title: "Why each word of a sentence is there",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "One sentence they've had, by its words or its id: what it means and, word by word, what each word does, which form it is, why it's there, the concept it shows, and where English does something else, as Lexicommons wrote them. words is null where nobody has yet (then forms says which form the words are): explain it yourself and say it's your own reading. Pass a word's concept to study_concept for the whole of it.",
      inputSchema: z.object({ sentence: z.string().min(1).max(600), language }),
    },
    async ({ sentence, language: asked }) =>
      guarded(async () => {
        const found = await record(asked);
        if ("nothing" in found) return ok({ nothing: true, note: found.nothing });
        return ok(await sentenceFromLibrary(env, found.record, sentence));
      }),
  );

  server.registerTool(
    "study_lesson",
    {
      title: "One lesson of theirs",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "One lesson on their path, by its number, id or words of its title: what it taught, how each thing is going, its sentences, and what they missed in it.",
      inputSchema: z.object({ lesson: z.string().min(1).max(200), language }),
    },
    async ({ lesson, language: asked }) =>
      guarded(async () => {
        const found = await record(asked);
        if ("nothing" in found) return ok({ nothing: true, note: found.nothing });
        return ok(lessonOf(found.record, lesson));
      }),
  );

  server.registerTool(
    "study_misses",
    {
      title: "The sentences they got wrong",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "The sentences they got wrong, newest first: each with its literal line, what they put where the game knows it, the game and what it was about. Filter by game (\"order\", \"Fill the gap\") or by concept.",
      inputSchema: z.object({ game: z.string().max(80).optional(), concept: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional(), language }),
    },
    async ({ game, concept, limit, language: asked }) =>
      guarded(async () => {
        const found = await record(asked);
        if ("nothing" in found) return ok({ nothing: true, note: found.nothing });
        return ok(missesOf(found.record, { game, concept, limit }));
      }),
  );
}
