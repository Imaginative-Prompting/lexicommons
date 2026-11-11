// A language's shared grammar over MCP (public/js/lang/grammar.js, src/grammar-suggestions.ts). Your AI can read the
// suggestions waiting for a language, suggest a new pattern, a fix to one or retiring one for the person (it lands as
// "with their AI", waiting like anyone's), and withdraw one of theirs; it still adds patterns to the person's own packs
// freely (create_pack, update_pack). Suggesting is listed when sharing is open to the caller, like the other
// contributions to Explore. Accepting and declining is an admin's (review_grammar_suggestions: mayReview). Likes are
// the app's only; a suggestion is reported with report { grammar }.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LANGUAGES } from "../public/js/lang/index.js";
import { GRAMMAR_LIMITS, SUGGESTION_KINDS } from "../public/js/lang/grammar.js";
import type { CallerProps, Env } from "./env";
import { GRAMMAR_SUGGESTION_LIMITS, listSuggestions, reviewSuggestions, suggestPattern, withdrawSuggestion } from "./grammar-suggestions";
import { LibraryError } from "./library";
import { sharingListed } from "./mcp-community";
import type { Role } from "./roles";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
type Helpers = {
  caller: () => CallerProps & { clientName?: string };
  sourceLabel: (props: CallerProps & { clientName?: string }) => string;
  ok: (value: unknown) => ToolResult;
  guarded: (run: () => Promise<ToolResult>) => Promise<ToolResult>;
};

const learnable = Object.keys(LANGUAGES).filter((c) => c !== "en") as [string, ...string[]];
const suggestionId = z.string().min(4).max(40);
const patternId = z.string().min(1).max(40);

export function registerGrammarTools(server: McpServer, env: Env, roles: Set<Role>, { caller, sourceLabel, ok, guarded }: Helpers) {
  const me = () => caller().userId;

  server.registerTool(
    "grammar_suggestions",
    {
      title: "Suggestions to a language's grammar",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "The suggestions waiting for a language's shared grammar (the patterns every pack, weave and grade of the language shares: get_learner lists them), the most liked first: each a new pattern, a fix to one or retiring one, with how its suggester knows the language. pattern narrows them to one pattern; decided adds the ones accepted, declined, withdrawn or superseded (with why, and the revision an accepted one went into). mine: every suggestion of the person's, whatever became of it.",
      inputSchema: z.object({ language: z.enum(learnable).optional(), pattern: patternId.optional(), decided: z.boolean().optional(), mine: z.boolean().optional(), limit: z.number().int().min(1).max(GRAMMAR_SUGGESTION_LIMITS.list).optional() }),
    },
    async ({ language, pattern, decided, mine, limit }) =>
      guarded(async () => {
        if (!mine && !language) throw new LibraryError("Give language (or mine: true for the person's own).");
        return ok(await listSuggestions(env, me(), { language, pattern, decided, mine, limit }));
      }),
  );

  if (sharingListed(env, roles)) {
    server.registerTool(
      "suggest_pattern",
      {
        title: "Suggest a change to a language's grammar",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        description: `Suggests, for the person, a change to a language's shared grammar: kind "new" (a pattern it doesn't have: name, about, after, and pattern, its id, made from the name when left out), "fix" (pattern: an existing id, with the name, about or after to change) or "retire" (pattern: one no longer to offer; it stays for whatever uses it). It waits, marked as made with their AI, until an admin accepts or declines it (grammar_suggestions shows where it is). knows: how the person knows the language (native, fluent, learning); note: why, in their words. about is shown after every answer in the app: one to three plain sentences, with at least one example in the language and its literal gloss in brackets ("ik werk (I work)"), up to ${GRAMMAR_LIMITS.about} characters. Suggest only what the person wants suggested. For grammar only their packs need, add a pattern to the pack instead (create_pack, update_pack). Its words are shared under CC BY-SA 4.0, as everything in Explore is; the person accepts the sharing terms in the app first.`,
        inputSchema: z.object({
          language: z.enum(learnable),
          kind: z.enum(SUGGESTION_KINDS as [string, ...string[]]),
          pattern: patternId.optional(),
          name: z.string().min(1).max(GRAMMAR_LIMITS.name).optional(),
          about: z.string().min(1).max(GRAMMAR_LIMITS.about).optional(),
          chip: z.string().min(1).max(GRAMMAR_LIMITS.chip).optional(),
          short: z.string().min(1).max(GRAMMAR_LIMITS.short).optional(),
          after: z.array(patternId).max(GRAMMAR_LIMITS.after).optional(),
          knows: z.enum(["native", "fluent", "learning"]),
          note: z.string().max(GRAMMAR_SUGGESTION_LIMITS.note).optional(),
        }),
      },
      async (input) =>
        guarded(async () => {
          const result = await suggestPattern(env, { userId: me(), via: sourceLabel(caller()), ai: true }, input);
          if (!result.suggested) return { ...ok({ suggested: false, problems: result.problems, next: "Nothing was kept: fix every problem, then suggest it again." }), isError: true };
          return ok(result);
        }),
    );

    server.registerTool(
      "withdraw_pattern_suggestion",
      {
        title: "Withdraw a grammar suggestion",
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        description: "Withdraws a suggestion of the person's to a language's grammar that's still waiting (id: from grammar_suggestions with mine).",
        inputSchema: z.object({ id: suggestionId }),
      },
      async ({ id }) => guarded(async () => ok(await withdrawSuggestion(env, me(), id))),
    );
  }

  if (roles.has("admin")) {
    server.registerTool(
      "review_grammar_suggestions",
      {
        title: "Accept or decline grammar suggestions",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        description:
          "An admin's decision on suggestions to one language's grammar (grammar_suggestions lists them). accept: ids that go into the grammar's next revision together, published to the open library with library_publish's own checks (every id kept, the next number, every pattern with its source); each accepted pattern's source says how its suggester knows the language, never who they are. decline: [{ id, why }], why shown to its suggester. Open suggestions on a pattern an accepted fix or retirement changed are superseded. Read each one first: what's shown after every answer must be right for the language. A revision that doesn't pass comes back with its problems and nothing accepted. library_restore never takes a grammar back.",
        inputSchema: z.object({
          language: z.enum(learnable),
          accept: z.array(suggestionId).max(GRAMMAR_SUGGESTION_LIMITS.review).optional(),
          decline: z.array(z.object({ id: suggestionId, why: z.string().min(1).max(GRAMMAR_SUGGESTION_LIMITS.why) })).max(GRAMMAR_SUGGESTION_LIMITS.review).optional(),
          note: z.string().max(300).optional(),
        }),
      },
      async (input) =>
        guarded(async () => {
          const props = caller();
          const result = await reviewSuggestions(env, { userId: props.userId, via: sourceLabel(props), caller: props }, input);
          return "problems" in result && result.problems ? { ...ok(result), isError: true } : ok(result);
        }),
    );
  }
}
