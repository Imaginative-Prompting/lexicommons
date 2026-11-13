// The MCP tools for the person's requests (registered by mcp.ts): what they left in the app for their AI to do (practice
// with me, add to my pack, make a new pack, change my look, a question). The AI lists them, takes one, does it with the
// tools it already has (practice, packs, the look), and finishes it with what it did, so the app shows the result. The
// requests live in the account's AI room (src/practice.ts); what a request is, is public/js/ai/requests.js.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CallerProps, Env } from "./env";
import { REQUEST_KINDS, REQUEST_LIMITS } from "../public/js/ai/requests.js";
import { practiceRoom, PRACTICE_TIMING, unwrap, type RequestMeta } from "./practice";
import { enqueue } from "./reminders";
import { LibraryError } from "./library";
import { dropWeaveText } from "./texts";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
type Helpers = {
  caller: () => CallerProps & { clientName?: string };
  sourceLabel: (props: CallerProps & { clientName?: string }) => string;
  ok: (value: unknown) => ToolResult;
  guarded: (run: () => Promise<ToolResult>) => Promise<ToolResult>;
};

// How to do each kind, with the tools this server already has. A kind left out of REQUEST_KINDS has no entry in use.
const HOW: Record<string, string> = {
  practice: "The practice is open in their app now: call practice_wait with its practice_id to join it (read get_practice_guide first if you haven't), and practice as the guide says. This request is done already.",
  pack_add:
    "Read get_pack_guide once. get_pack shows the pack; if due is true, get_learner says what's due and weak, so aim the sentences there. Add with add_items (check_items first if you like), then finish_request with done: { said: \"Added 20 sentences about cooking to Travel\", links: { pack, changes: [the change ids add_items gave] } }.",
  pack_new:
    "Read get_pack_guide once. Make one pack for this purpose with create_pack, in the request's language (a language of their own comes with languageDef: give it to create_pack as language_def), then finish_request with done: { said, links: { pack, changes: [its change id] } }.",
  text_new:
    "Read get_text_guide once, and get_learner for their level. Get or write the text as asked, upload it with request_text_upload (a cover too, if it fits) and add it with add_text, then finish_request with done: { said: \"Added a short story about the market\", links: { text: its text_id } }.",
  look:
    "Read get_theming_guide once and get_look. If fresh is true, start a new theme with create_theme; otherwise change the one in use with update_look. Then finish_request with done: { said, links: { theme: its id } }.",
  weave:
    "A text of theirs (one they pasted or uploaded, or one you added) that they asked you to weave into the language they're learning (asked.language). Read get_weave_guide with that language once. get_text with this request_id gives its sentences, every word numbered (to_weave). Weave every sentence as the guide says, then add_weave with the request_id, your seat and the weave: it's checked at once and every problem is said, so fix them and add it again. add_weave finishes the request itself; if you can't weave it, finish_request with couldnt and why.",
  ask:
    "Answer in finish_request's answer: plain text (no Markdown or HTML), short and clear, at their level (get_learner). If asked.about is there, it's what they were looking at when they asked (where, a sentence with its literal line and English, what they answered and whether it was right, a word, a concept, a book and the word they're at, a Translate search that found nothing): answer about that. Put every word or sentence in the language between [[ and ]] (\"[[heb gelezen]] is the perfect\"), so the app marks it as the language, and give an example or two with their English.",
};

const NEXT = {
  none: "Nothing is waiting. Call wait_for_request again to keep waiting, or stop: the person can leave requests in the app any time.",
};

/** A request as the AI reads it: what was asked, in its own fields, and its state. */
function forAi(request: RequestMeta) {
  const { id, kind, state, client, takenAt, createdAt, updatedAt, result, ...fields } = request;
  // A weave's copy of the text is read with get_text and its request_id: the copy's own id is the app's, not the AI's.
  const { upload: _upload, ...asked } = fields as Record<string, unknown>;
  return {
    request_id: id,
    kind,
    kindName: (REQUEST_KINDS as Record<string, { name: string }>)[kind]?.name ?? kind,
    asked,
    state,
    ...(client ? { takenBy: client } : {}),
    left: new Date(createdAt).toISOString(),
    ...(takenAt ? { taken: new Date(takenAt).toISOString() } : {}),
    ...(result ? { result } : {}),
    ...(state !== "waiting" && state !== "taken" ? { finished: new Date(updatedAt).toISOString() } : {}),
  };
}

export function registerRequestTools(server: McpServer, env: Env, { caller, sourceLabel, ok, guarded }: Helpers) {
  const room = () => practiceRoom(env, caller().userId);
  const kinds = Object.keys(REQUEST_KINDS);

  server.registerTool(
    "list_requests",
    {
      title: "What the person asked you to do",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: `Requests the person left in the Lexicommons app for you (${kinds.join(", ")}): the waiting ones first, then ones taken and recently finished. Call it when a conversation starts. take_request one to do it.`,
    },
    async () =>
      guarded(async () => {
        const all = ((await room().aiListRequests(sourceLabel(caller()))) as unknown as RequestMeta[]).map(forAi);
        const waiting = all.filter((r) => r.state === "waiting").reverse();
        return ok({ waiting, taken: all.filter((r) => r.state === "taken"), recent: all.filter((r) => r.state !== "waiting" && r.state !== "taken").slice(0, 10) });
      }),
  );

  server.registerTool(
    "take_request",
    {
      title: "Take a request to do it",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      description:
        "Takes a waiting request so it's yours (the app shows you're on it), and says how to do its kind with the tools you have. Keep the seat it gives you: finish_request needs it, and with it take_request gives back a request you took. A practice starts at once and is done.",
      inputSchema: z.object({ request_id: z.string().min(4).max(40), seat: z.string().max(40).optional().describe("Your seat from taking it before, to get it back") }),
    },
    async ({ request_id, seat }) =>
      guarded(async () => {
        const taken = unwrap(await room().aiTakeRequest(sourceLabel(caller()), request_id, seat)) as { request: RequestMeta; seat: string | null; practice?: { id: string } & Record<string, unknown> };
        // The practice as the practice tools name it (practice_id).
        const practice = taken.practice ? (({ id, ...rest }) => ({ practice_id: id, ...rest }))(taken.practice) : null;
        return ok({ ...forAi(taken.request), seat: taken.seat, how: HOW[taken.request.kind], ...(practice ? { practice } : {}) });
      }),
  );

  server.registerTool(
    "finish_request",
    {
      title: "Finish a request",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Says how a request you took went, and the app shows it: done (what you did, in a line, with links to it so they can open it), couldnt (why not), or for a question, answer.",
      inputSchema: z.object({
        request_id: z.string().min(4).max(40),
        seat: z.string().min(1).max(40).describe("The seat take_request gave you"),
        done: z
          .object({
            said: z.string().max(REQUEST_LIMITS.said).describe("What you did, in a line: \"Added 20 sentences about cooking to Travel\""),
            links: z
              .object({
                pack: z.string().max(48).optional(),
                changes: z.array(z.string().max(48)).max(REQUEST_LIMITS.changes).optional().describe("The change ids your pack tools gave"),
                theme: z.string().max(64).optional(),
                practice: z.string().max(64).optional(),
                text: z.string().max(80).optional().describe("The text_id add_text gave"),
              })
              .optional(),
          })
          .optional(),
        couldnt: z.string().max(REQUEST_LIMITS.why).optional().describe("Why you couldn't do it"),
        answer: z.string().max(REQUEST_LIMITS.answer).optional().describe("For a question: your answer"),
      }),
    },
    async ({ request_id, seat, done, couldnt, answer }) =>
      guarded(async () => {
        const kind = ((await room().aiListRequests(sourceLabel(caller()))) as unknown as RequestMeta[]).find((r) => r.id === request_id)?.kind;
        if (kind === "weave" && done) throw new LibraryError("A weave is done by add_weave, which checks it and sends it to their devices: add_weave with your weave. If you can't weave it, finish with couldnt.");
        const finished = unwrap(await room().aiFinishRequest(sourceLabel(caller()), request_id, seat, { done, couldnt, answer })) as RequestMeta;
        // A weave that couldn't be done: its copy of the text goes now.
        if (kind === "weave") await dropWeaveText(env, caller().userId, request_id).catch(() => {});
        // A note on their device, if they have reminders on (src/reminders.ts: batched, never in quiet hours).
        const note = answer ? { title: "Your AI answered your question", body: "Tap to read it." } : couldnt ? { title: "Your AI couldn't do one of your requests", body: couldnt.slice(0, 160) } : { title: "Your AI finished something", body: (done?.said ?? "Your request is done.").slice(0, 160) };
        await enqueue(env, caller().userId, "ai", { ...note, url: `/app/#ai/request/${encodeURIComponent(finished.id)}` }).catch(() => false);
        return ok({ ...forAi(finished), next: "It shows in their app now. list_requests for anything else they asked." });
      }),
  );

  server.registerTool(
    "wait_for_request",
    {
      title: "Wait for a request",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: `Waits for the person to leave a request in the app (up to ~${PRACTICE_TIMING.aiWaitDefault / 1000} s), and returns it the moment there is one, or the oldest waiting now. For a session that stays to help; most of the time list_requests at the start of a conversation is enough.`,
      inputSchema: z.object({ wait_seconds: z.number().int().min(5).max(50).optional() }),
    },
    async ({ wait_seconds }) =>
      guarded(async () => {
        const result = unwrap(await room().aiWaitRequest(sourceLabel(caller()), (wait_seconds ?? PRACTICE_TIMING.aiWaitDefault / 1000) * 1000)) as { status: "request"; request: RequestMeta } | { status: "none" };
        return ok(result.status === "request" ? { status: "request", ...forAi(result.request), next: "take_request it to do it." } : { status: "none", next: NEXT.none });
      }),
  );

  server.registerPrompt(
    "do_my_requests",
    {
      title: "Do what I asked for in Lexicommons",
      description: "Your AI does the requests you left in the app, one by one.",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: "Do what I asked for in Lexicommons: call list_requests, then take_request each waiting one in turn, do it as its how says, and finish_request it with what you did. Tell me briefly what you did at the end.",
          },
        },
      ],
    }),
  );
}
