// Requests in Explore over MCP (the board): your AI can read it, post a request for the person, answer one with a pack
// the person shared, and close the person's own; the prompt contribute turns spare tokens into what people asked for.
// Likes ("me too") are the app's only. Posting and answering are listed when sharing is open to the caller, like the
// sharing tools; deciding a book request is an admin's. The work is board.ts's. (Requests for your AI, list_requests,
// are another thing: what the person asked their own AI in the app.)

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LANGUAGES } from "../public/js/lang/index.js";
import { answerRequest, closeRequest, decideBookRequest, getRequest, listRequests, postRequest, REQUEST_KINDS, REQUEST_LIMITS } from "./board";
import { LEVELS } from "./community";
import type { CallerProps, Env } from "./env";
import { sharingListed } from "./mcp-community";
import { connectionReachesRoles, requireRole, type Role } from "./roles";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
type Helpers = {
  caller: () => CallerProps & { clientName?: string };
  sourceLabel: (props: CallerProps & { clientName?: string }) => string;
  ok: (value: unknown) => ToolResult;
  guarded: (run: () => Promise<ToolResult>) => Promise<ToolResult>;
};

const requestId = z.string().min(4).max(40);
const language = z.string().min(2).max(8);
const NOT_YOURS = "Requests for the person's own AI (list_requests) are something else: these are posts in Explore, from anyone, for anyone to answer.";

export function registerBoardTools(server: McpServer, env: Env, roles: Set<Role>, { caller, sourceLabel, ok, guarded }: Helpers) {
  const me = () => caller().userId;
  const via = () => sourceLabel(caller());

  server.registerTool(
    "explore_requests",
    {
      title: "Requests in Explore",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: `The request board in Explore: what people asked for, a pack (a language, a level, a topic) or a book woven into a language, the most "me too" first (sort: "new" for the newest). By lang and kind; state "open" (the default) or "done". mine: every request of the person's, whatever became of it, with newAnswers on each one that has answers they haven't seen. ${NOT_YOURS}`,
      inputSchema: z.object({ lang: language.optional(), kind: z.enum(REQUEST_KINDS).optional(), state: z.enum(["open", "done"]).optional(), sort: z.enum(["popular", "new"]).optional(), mine: z.boolean().optional(), limit: z.number().int().min(1).max(REQUEST_LIMITS.page).optional() }),
    },
    async (query) => guarded(async () => ok(await listRequests(env, me(), query))),
  );

  server.registerTool(
    "explore_request",
    {
      title: "One request in Explore",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "One request in Explore, with the packs that answer it (answeredBy: each pack's id for explore_get, who made it, its likes and follows). A book request says whether its book is on the shelf, and whether its language's layer is there yet.",
      inputSchema: z.object({ id: requestId }),
    },
    async ({ id }) => guarded(async () => ok(await getRequest(env, id, me()))),
  );

  if (sharingListed(env, roles)) {
    server.registerTool(
      "post_explore_request",
      {
        title: "Ask for something in Explore",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        description: `Posts a request on Explore's board for the person, as they asked for it: kind "pack" (language, and level and topic if they say) or "book" (a book woven into language: book is a book on the shelf, its id from the catalog, or { title, author, source } for one that isn't there yet, which waits for an admin first, since only a book public domain in the US and the EU, or openly licensed, can go on the shelf). title says what's wanted in a few words; details, anything more. Its words are shared under CC BY-SA 4.0, like everything in Explore (the person accepts the sharing terms in the app first). Before posting, look at explore_requests: if someone asked for the same, the person can say "me too" on it in the app instead. ${NOT_YOURS}`,
        inputSchema: z.object({
          kind: z.enum(REQUEST_KINDS),
          language: z.enum(Object.keys(LANGUAGES).filter((c) => c !== "en") as [string, ...string[]]),
          level: z.enum(LEVELS).optional(),
          topic: z.string().min(1).max(40).optional(),
          title: z.string().min(3).max(REQUEST_LIMITS.title),
          details: z.string().max(REQUEST_LIMITS.details).optional(),
          book: z.union([z.string().min(1).max(120), z.object({ title: z.string().min(2).max(REQUEST_LIMITS.bookTitle), author: z.string().max(REQUEST_LIMITS.bookAuthor).optional(), source: z.string().max(REQUEST_LIMITS.bookSource).optional() })]).optional(),
        }),
      },
      async (input) => guarded(async () => ok(await postRequest(env, { userId: me(), via: via() }, input))),
    );

    server.registerTool(
      "answer_explore_request",
      {
        title: "Answer a request with a pack",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        description:
          "Answers a pack request in Explore (id) with a pack the person shared there (item: its id, from my_shared), in the language the request asks for. Its author sees it under their request. Make the pack first (get_pack_guide), share it (share_pack), then answer. Not the person's own request. An admin (with admin access) can answer with any live pack, the library's own too.",
        inputSchema: z.object({ id: requestId, item: z.string().min(2).max(48) }),
      },
      async ({ id, item }) => guarded(async () => ok(await answerRequest(env, { userId: me(), via: via(), adminAccess: connectionReachesRoles(caller()) }, id, { item }))),
    );

    server.registerTool(
      "close_explore_request",
      {
        title: "Mark a request done, or close it",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        description:
          'The person marks a request of theirs "done" (something answered it) or "closed" (it isn\'t wanted now), or "open" again. A request waiting for an admin can only be closed. An admin (with admin access) can on anyone\'s, saying why (note): its author sees it.',
        inputSchema: z.object({ id: requestId, state: z.enum(["done", "closed", "open"]), note: z.string().max(REQUEST_LIMITS.note).optional() }),
      },
      async ({ id, state, note }) => guarded(async () => ok(await closeRequest(env, { userId: me(), via: via(), adminAccess: connectionReachesRoles(caller()) }, id, { state, note }))),
    );

    server.registerPrompt(
      "contribute",
      {
        title: "Answer a request in Explore",
        description: "Your AI finds an open request in Explore it can do well, makes the pack it asks for, shares it and answers the request: spare tokens for what someone asked for.",
        argsSchema: z.object({ language: z.string().max(40).optional() }),
      },
      ({ language: lang }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `Find an open pack request in Lexicommons' Explore that you can do well${lang ? ` (in ${lang})` : ""}, and answer it.\n\n` +
                "Look at explore_requests (open, the most \"me too\" first), and pick one whose language you know well; explore_request shows what " +
                "answers it already. Tell me which one you picked and why before you make anything. Then make the pack it asks for, at its level " +
                "and on its topic (read get_pack_guide first; it goes to my packs, where I can look at it), share it in Explore with share_pack " +
                "(I accept the sharing terms in the app first, if I haven't), and answer the request with answer_explore_request. Tell me what " +
                "you made and which request it answers. Book requests are answered by the library itself, so leave those.",
            },
          },
        ],
      }),
    );
  }

  if (!roles.has("admin")) return;

  server.registerTool(
    "decide_book_request",
    {
      title: "Decide a book request (admin)",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        'For an admin: a book request waiting (mod_queue lists them under bookRequests). "open" when the book may go on the shelf (public domain in the US and the EU, or openly licensed: the rights rule), with book: the shelf\'s book (its catalog id) once it\'s published, or later, the same way. "decline" when it may not, saying why (why: its author sees it). A request whose book is on the shelf is done once its language\'s layer is published.',
      inputSchema: z.object({ request: requestId, decision: z.enum(["open", "decline"]), why: z.string().min(3).max(REQUEST_LIMITS.note), book: z.string().min(1).max(120).optional() }),
    },
    async ({ request, decision, why, book }) =>
      guarded(async () => {
        await requireRole(env, caller(), "admin");
        return ok(await decideBookRequest(env, { userId: me(), via: via() }, request, { decision, why, book }));
      }),
  );
}
