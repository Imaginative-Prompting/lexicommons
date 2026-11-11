// Corrections over MCP: your AI can read a pack's corrections, suggest a fix or flag a piece for you, take one back, and
// answer the corrections on your own packs (an admin on any pack). Likes are the app's only. Suggesting and answering
// are listed when sharing is open to the caller, like the sharing tools. The work is corrections.ts's.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { correctionsToAnswer, listCorrections, myCorrections, reviewCorrections, suggestCorrection, withdrawCorrection } from "./corrections";
import type { CallerProps, Env } from "./env";
import { LibraryError } from "./library";
import { sharingListed } from "./mcp-community";
import { connectionReachesRoles, type Role } from "./roles";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
type Helpers = {
  caller: () => CallerProps & { clientName?: string };
  sourceLabel: (props: CallerProps & { clientName?: string }) => string;
  ok: (value: unknown) => ToolResult;
  guarded: (run: () => Promise<ToolResult>) => Promise<ToolResult>;
};

const itemId = z.string().min(2).max(48);
const correctionId = z.string().min(4).max(40);
const PIECES =
  'path names one piece of the pack\'s current version: "items/<id>/means" (a string), "items/<id>/wrong" (1 to 3 strings), "items/<id>/gap" ({ index, options }), "items/<id>/literal" ({ literal, english }), "items/<id>/words" ({ words, punct?, moved?, gap? }), or "words/<lemma>" (its gloss; the lemma URI-encoded).';

export function registerCorrectionTools(server: McpServer, env: Env, roles: Set<Role>, { caller, sourceLabel, ok, guarded }: Helpers) {
  const me = () => caller().userId;

  server.registerTool(
    "list_corrections",
    {
      title: "Corrections to packs in Explore",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "A pack's corrections (id: open ones, the most liked first; all: every state, with how each was answered), the person's own (mine), or the ones waiting on the person's own packs (to_answer). An admin also gets the ones waiting a month with likes on any pack (waiting). Each has its piece (path), kind (fix or flag), the fix's value and the piece as it is now, who suggested it, its likes and state.",
      inputSchema: z.object({ id: itemId.optional(), all: z.boolean().optional(), mine: z.boolean().optional(), to_answer: z.boolean().optional(), waiting: z.boolean().optional() }),
    },
    async ({ id, all, mine, to_answer, waiting }) =>
      guarded(async () => {
        if (mine) return ok(await myCorrections(env, me()));
        if (to_answer || waiting) return ok(await correctionsToAnswer(env, me(), { waiting: Boolean(waiting), adminAccess: connectionReachesRoles(caller()) }));
        if (!id) throw new LibraryError("Give id (a pack), or mine, or to_answer.");
        return ok(await listCorrections(env, id, me(), { all: Boolean(all) }));
      }),
  );

  if (!sharingListed(env, roles)) return;

  server.registerTool(
    "suggest_correction",
    {
      title: "Suggest a fix, or flag something wrong",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description: `Suggests a fix to one piece of a pack in Explore (kind "fix", value: the new value), or flags it as wrong (kind "flag", note: what's wrong). ${PIECES} A fix is checked as a new version would be: the pack with it applied must pass the pack check, and every problem comes back at once. The pack's author (or an admin) accepts it into a new version or declines it. Not on the person's own packs (share a new version instead).`,
      inputSchema: z.object({
        id: itemId,
        path: z.string().min(3).max(200),
        kind: z.enum(["fix", "flag"]),
        value: z.unknown().optional(),
        note: z.string().max(1000).optional(),
        version: z.string().regex(/^[0-9a-f]{12}$/).optional(),
      }),
    },
    async ({ id, ...input }) => guarded(async () => ok(await suggestCorrection(env, { userId: me(), via: sourceLabel(caller()) }, id, input))),
  );

  server.registerTool(
    "withdraw_correction",
    {
      title: "Take a correction back",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      description: "Takes back one of the person's own open corrections.",
      inputSchema: z.object({ correction: correctionId }),
    },
    async ({ correction }) => guarded(async () => ok(await withdrawCorrection(env, me(), correction))),
  );

  server.registerTool(
    "review_corrections",
    {
      title: "Answer corrections on a pack",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Accepts or declines corrections on one of the person's own packs (an admin: on any pack, and only an admin on Lexicommons' own). accept: correction ids (fixes): they go into one new version together, checked as any version is, its note naming who suggested them; its followers get it, and so does the author's own pack on their devices (through the relay, with Undo there; ownerCopy says whether it did, and why not). decline: [{ id, why }] (a flag too). note: added to the version's note. Read them first with list_corrections.",
      inputSchema: z.object({
        id: itemId,
        accept: z.array(correctionId).max(50).optional(),
        decline: z.array(z.object({ id: correctionId, why: z.string().min(3).max(500) })).max(50).optional(),
        note: z.string().max(300).optional(),
      }),
    },
    async ({ id, ...input }) => guarded(async () => ok(await reviewCorrections(env, { userId: me(), via: sourceLabel(caller()), adminAccess: connectionReachesRoles(caller()) }, id, input))),
  );
}
