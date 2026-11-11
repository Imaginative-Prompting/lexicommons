// The MCP tools for Practice with your AI (registered by mcp.ts): the person's AI joins a practice they start in the
// app, waits for their turns, grades and replies, and sums up at the end; or logs a conversation held in its own app.
// The room itself is src/practice.ts; the formats and checks are public/js/practice/protocol.js.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CallerProps, Env } from "./env";
import { EXPECT, GAMES, KINDS, OUTCOMES, SKILLS, VERDICTS } from "../public/js/practice/protocol.js";
import { practiceRoom, PRACTICE_TIMING, unwrap, type Turn } from "./practice";
import { practiceGuide } from "./practice-guide";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
type Helpers = {
  caller: () => CallerProps & { clientName?: string };
  sourceLabel: (props: CallerProps & { clientName?: string }) => string;
  ok: (value: unknown) => ToolResult;
  guarded: (run: () => Promise<ToolResult>) => Promise<ToolResult>;
};

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as unknown as [T, ...T[]]);
const KIND_IDS = Object.keys(KINDS) as (keyof typeof KINDS)[];

const id = z.string().min(1).max(40);
const literal = z
  .array(z.union([z.string().max(80), z.object({ text: z.string().max(80), moved: z.boolean().optional() })]))
  .max(24)
  .describe('English words in the order of the language they\'re learning, the words it moves between asterisks. Dutch "Ik heb gisteren een boek gelezen.": ["I have", "*yesterday*", "a book", "*read*"]');
const words = z.record(z.string().max(60), z.string().max(60)).describe('{ "word as written": "lemma" } for content words (Dutch: { "gelezen": "lezen" })');
const line = z.union([
  z.string().max(600),
  z.object({
    nl: z.string().max(600).describe("The line, in the language they're learning (the practice's language)"),
    literal: literal.optional(),
    en: z.string().max(600).optional().describe("Natural English"),
    english: z.array(z.number().int().min(0)).max(24).optional().describe("literal's chunk indexes in English order, when they map one to one"),
    words: words.optional(),
  }),
]);
const conceptGrade = z.object({
  concept: z.string().max(60).describe("p:<pattern id>, w:<lemma> or c:<phrase>"),
  outcome: enumOf(OUTCOMES),
  note: z.string().max(400).optional(),
  skill: enumOf(SKILLS).optional(),
});
const grade = z.object({
  turn: z.number().int().optional().describe("The seq of their turn this grades; leave out for their newest ungraded turn"),
  verdict: enumOf(VERDICTS),
  better: z.string().max(600).optional().describe("Their sentence corrected, as close to theirs as possible"),
  marks: z.array(z.object({ said: z.string().max(120).describe("Exact words from their text"), fix: z.string().max(120).optional() })).max(12).optional(),
  concepts: z.array(conceptGrade).max(12).optional(),
  note: z.string().max(400).optional(),
});
const card = z.object({
  game: enumOf(GAMES),
  prompt: z.string().max(160).optional(),
  nl: z.string().max(600).optional(),
  en: z.string().max(600).optional(),
  literal: literal.optional(),
  english: z.array(z.number().int().min(0)).max(24).optional(),
  words: words.optional(),
  patterns: z.array(z.string().max(48)).max(4).optional(),
  moved: z.array(z.string().max(60)).max(8).optional(),
  wrong: z.array(z.string().max(600)).max(3).optional(),
  gap: z.object({ word: z.string().max(60), options: z.array(z.string().max(60)).max(5).optional() }).optional(),
  place: z.object({ word: z.string().max(60) }).optional(),
  pairs: z.array(z.tuple([z.string().max(80), z.string().max(80)])).max(6).optional(),
  from: z.enum(["dutch", "english"]).optional().describe("say: dutch = read the line in their language aloud (the value is dutch for every language), english = say it from the English"),
});
const summary = z.object({
  text: z.string().max(2400),
  went_well: z.array(z.string().max(400)).max(8).optional(),
  work_on: z.array(z.string().max(400)).max(8).optional(),
  new_words: z.array(z.object({ nl: z.string().max(80), en: z.string().max(120).optional() })).max(20).optional(),
  concepts: z.array(conceptGrade).max(12).optional(),
});

/** A turn as the AI reads it: only what it needs. */
function forAi(turn: Turn) {
  const { at: _at, key: _key, ...rest } = turn;
  if (turn.who === "ai" && turn.type === "reply") {
    const say = (turn.say as { nl: string }[] | undefined) ?? [];
    return { seq: turn.seq, who: "ai", type: "reply", say: say.map((l) => l.nl), translate: turn.translate, card: (turn.card as { game?: string } | undefined)?.game };
  }
  return rest;
}

const NEXT = {
  joined: (after: number) => `You've joined. Reply now with practice_reply (practice_id and seat as above), then call practice_wait with after=${after}.`,
  your_move: (after: number) => `Grade their turn(s) and reply in one practice_reply, then call practice_wait with after=${after}.`,
  waiting: "Nothing from them yet. Call practice_wait again now, with the same practice_id, seat and after.",
  no_practice:
    "No practice is open in their app yet. Call practice_wait again now: it waits for one. If they haven't said they're starting one, ask them to open Lexicommons → Study → Practice with your AI and press Start.",
  stop: "Tell them no practice was started, and stop calling practice_wait.",
  ended: "Call practice_end with your summary now, then tell them in one line that it's saved in their app.",
  endedSummarized: "It's over and your summary is saved. Tell them so in one line, and stop.",
  taken: "Another AI session is running this practice. Stop, and tell them.",
  superseded: "A newer practice_wait call took over from this one. If you didn't make another call, call practice_wait again.",
  not_found: "That practice isn't on the server. Call practice_wait without practice_id to join the one open in their app.",
};

export function registerPracticeTools(server: McpServer, env: Env, { caller, sourceLabel, ok, guarded }: Helpers) {
  const room = () => practiceRoom(env, caller().userId);

  server.registerTool(
    "get_practice_guide",
    {
      title: "How to practice with the person",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "Read this once before practicing: how a live practice in the Lexicommons app works (practice_wait → practice_reply → … → practice_end), how to grade what they say in the language they're learning, the literal line, the six kinds of practice, the games you can deal (cards), and practice_log for a conversation held in your own app.",
    },
    async () => guarded(async () => ok(practiceGuide())),
  );

  server.registerTool(
    "get_learner",
    {
      title: "What the person knows",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "The person's learning state, as their app last sent it: the language they're learning (language, languageName), its grammar patterns and words with a level from 0 (new) to 4 (strong), what's due and slipping, recent misses, and the catalog of pattern ids to grade with (p:<id>, w:<lemma>). Use it to speak at their level and steer towards what they need.",
    },
    async () =>
      guarded(async () => {
        const found = await room().getLearner();
        if (!found) return ok({ snapshot: null, note: "Their app hasn't sent this yet: it does when they open Practice with you. list_packs says which language they're learning (the language of Lexicommons' own packs on their devices); study_summary has what they've studied, once their app has opened with you connected; get_pack_guide with that language lists its pattern ids. If both are empty, ask them, and start as for a beginner." });
        return ok({ updatedAt: new Date(found.updatedAt).toISOString(), ...(JSON.parse(found.snapshot) as object) });
      }),
  );

  server.registerTool(
    "practice_wait",
    {
      title: "Wait for the person's next turn",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "The heart of a live practice. Without practice_id it joins the practice the person has open in the Lexicommons app (or waits for them to start one). Then it returns their new turns the moment they type or say something, or after up to ~40 s with status waiting. Always pass practice_id, seat and after from the previous answer. status: joined · your_move · waiting · no_practice · ended · stop · taken · not_found; every answer says what to do next. Read get_practice_guide first.",
      inputSchema: z.object({
        practice_id: id.optional(),
        seat: id.optional().describe("From joined: keeps the practice yours"),
        after: z.number().int().min(0).optional().describe("The after from the previous practice_wait"),
        wait_seconds: z.number().int().min(5).max(50).optional().describe(`How long to wait for them (default ${PRACTICE_TIMING.aiWaitDefault / 1000})`),
      }),
    },
    async (input) =>
      guarded(async () => {
        const props = caller();
        const result = unwrap(
          await room().aiWait(sourceLabel(props), { practiceId: input.practice_id, seat: input.seat, after: input.after, waitMs: input.wait_seconds ? input.wait_seconds * 1000 : undefined }),
        ) as Record<string, unknown> & { status: keyof typeof NEXT | "ended"; turns?: Turn[]; after?: number; summarized?: boolean };
        const turns = result.turns?.map(forAi);
        // What they know comes with joining (it's stored as their app sent it).
        const learner = result.learner as { snapshot: string; updatedAt: number } | null | undefined;
        if (learner !== undefined) result.learner = learner ? { updatedAt: new Date(learner.updatedAt).toISOString(), ...(JSON.parse(learner.snapshot) as object) } : "Not sent yet: assume a beginner.";
        const next =
          result.status === "joined" || result.status === "your_move"
            ? NEXT[result.status](result.after ?? 0)
            : result.status === "ended"
              ? result.summarized
                ? NEXT.endedSummarized
                : NEXT.ended
              : NEXT[result.status as Exclude<keyof typeof NEXT, "joined" | "your_move">];
        return ok({ ...result, ...(turns ? { turns } : {}), next });
      }),
  );

  server.registerTool(
    "practice_reply",
    {
      title: "Reply in the practice",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Your turn in a live practice: it shows in their app at once, and your lines in their language are read aloud on their device. grade (or grades) marks their last turn(s); say is your line in the language they're learning, the practice's language (a line or a list, each with literal and en); explain is short English; translate gives them an English sentence to put into that language; scene opens a role-play; card deals one of the app's games with your sentence; expect says what they do next. The answer lists anything left out and why. Then call practice_wait.",
      inputSchema: z.object({
        practice_id: id,
        seat: id.optional(),
        grade: grade.optional(),
        grades: z.array(grade).max(4).optional(),
        say: z.union([line, z.array(line).max(6)]).optional(),
        explain: z.string().max(1400).optional(),
        translate: z.string().max(600).optional(),
        scene: z.object({ title: z.string().max(100), goal: z.string().max(240).optional(), you: z.string().max(160).optional(), them: z.string().max(160).optional() }).optional(),
        card: card.optional(),
        expect: enumOf(EXPECT).optional(),
      }),
    },
    async ({ practice_id, seat, ...reply }) =>
      guarded(async () => {
        const result = unwrap(await room().aiReply(sourceLabel(caller()), { practiceId: practice_id, seat, reply }));
        return ok({
          ...result,
          next: reply.expect === "none" ? "You said you'd go on: send your next practice_reply now." : `Call practice_wait with practice_id, seat and after=${result.after}.`,
        });
      }),
  );

  server.registerTool(
    "practice_end",
    {
      title: "End the practice with a summary",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      description:
        "Ends the practice (if the person hasn't already) and saves your summary with it: two or three sentences to them (text), went_well, work_on, new_words, and concepts for anything no turn already graded. Calling it again replaces the summary.",
      inputSchema: z.object({ practice_id: id, seat: id.optional(), summary }),
    },
    async ({ practice_id, seat, summary: body }) =>
      guarded(async () => {
        const result = unwrap(await room().aiEnd(sourceLabel(caller()), { practiceId: practice_id, seat, summary: body }));
        return ok({ ...result, next: "Saved. Tell them in one line; it's in their app under Practice with your AI." });
      }),
  );

  server.registerTool(
    "practice_log",
    {
      title: "Log a conversation held here",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        'For practice held right here in your app (typed, or in voice mode) rather than in Lexicommons: log the turns, with your grades on theirs, as you go or after the last message. Their turns: { who: "you", text, how: spoken | typed, grade }; yours: { who: "ai", nl, literal, en } or { who: "ai", explain }. The first call starts a practice (in language, or the one get_learner names) and returns practice_id; pass it to add more; done with a summary ends it. Their app picks it up and counts the grades like a game\'s.',
      inputSchema: z.object({
        practice_id: id.optional(),
        kind: enumOf(KIND_IDS).optional(),
        language: z.string().max(8).optional().describe("The language you practiced, by its code (nl, de…), on the first call; leave out for the one get_learner names"),
        turns: z
          .array(
            z.union([
              z.object({ who: z.literal("you"), text: z.string().max(800), how: z.enum(["spoken", "typed"]).optional(), grade: grade.omit({ turn: true }).optional() }),
              z.object({ who: z.literal("ai"), nl: z.string().max(600).optional(), literal: literal.optional(), en: z.string().max(600).optional(), english: z.array(z.number().int().min(0)).max(24).optional(), words: words.optional(), explain: z.string().max(1400).optional() }),
            ]),
          )
          .min(1)
          .max(60),
        done: z.boolean().optional(),
        summary: summary.optional(),
      }),
    },
    async ({ practice_id, kind, language, turns, done, summary: body }) =>
      guarded(async () => {
        const result = unwrap(await room().aiLog(sourceLabel(caller()), { practiceId: practice_id, kind, language, turns, done, summary: body }));
        return ok({ ...result, next: result.ended ? "Saved. It's in their app under Practice with your AI." : `Pass practice_id ${result.practiceId} to add more; done: true with a summary ends it.` });
      }),
  );

  server.registerTool(
    "list_practices",
    {
      title: "List practices on the server",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "The practices still on the server: the one open in their app, and finished ones their device hasn't collected yet (after that they live only on their device). Each with its kind, language, state, who ran it and when.",
    },
    async () =>
      guarded(async () =>
        ok(
          (await room().list()).map((p) => ({
            practice_id: p.id,
            kind: p.settings.kind,
            language: p.settings.language ?? "nl",
            state: p.state,
            in: p.mode === "ai" ? "your app (practice_log)" : p.mode === "inapp" ? "the Lexicommons app, with its in-app AI" : "the Lexicommons app",
            ranBy: p.client,
            created: new Date(p.createdAt).toISOString(),
            ended: p.endedAt ? new Date(p.endedAt).toISOString() : null,
            summarized: p.summarized,
            turns: p.lastSeq,
          })),
        ),
      ),
  );

  const kindArg = z.object({ kind: z.string().max(40).optional().describe(`One of ${KIND_IDS.join(", ")}`) });
  const kindName = (kind?: string) => (kind && kind in KINDS ? KINDS[kind as keyof typeof KINDS].name : null);

  server.registerPrompt(
    "practise",
    {
      title: "Practice with me in Lexicommons",
      description: "A live practice in the Lexicommons app: you talk, type or play there, and this AI answers and grades.",
      argsSchema: kindArg,
    },
    ({ kind }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Practice the language I'm learning with me in Lexicommons${kindName(kind) ? ` (${kindName(kind)})` : ""}. I'm in the app. ` +
              "Read get_practice_guide once, then call practice_wait and keep the loop going exactly as the guide says, without writing to me here, until the practice ends. Then call practice_end with your summary.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "practise_here",
    {
      title: "Practice with me here",
      description: "A conversation right here (typed, or in voice mode), graded and logged to Lexicommons as it goes.",
      argsSchema: kindArg,
    },
    ({ kind }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Practice the language I'm learning with me right here${kindName(kind) ? `: ${kindName(kind)}` : ""}. Read get_practice_guide and get_learner (it names the language) first, then talk with me at my level, ` +
              "steering towards what I need. After each answer of mine, log the exchange with practice_log (your grade on my turn included), and when we stop, call practice_log with done and a summary. Keep your replies short.",
          },
        },
      ],
    }),
  );
}
