// Moderation over MCP. Everyone can report what's shared in Explore, a pack, a correction to one or a request (a copyright notice is
// filed in the app, by the person whose work it is). A moderator (or an admin) works the queue: the monitoring agent runs as a moderator, through
// these tools, by the policy (moderation_policy). Bans and changing the policy are an admin's. The tools are listed
// only for a moderator's or an admin's connection, and each checks the role again (moderation.ts, roles.ts).

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CallerProps, Env } from "./env";
import { LibraryError } from "./library";
import {
  caseOf,
  caseOfCorrection,
  caseOfGrammar,
  caseOfRequest,
  CORRECTION_REPORT_REASONS,
  modBan,
  modEscalate,
  modHide,
  modHideCorrection,
  modHideGrammar,
  modHideRequest,
  modResolve,
  modRestore,
  modRestoreCorrection,
  modRestoreGrammar,
  modRestoreRequest,
  modUnban,
  policy,
  queue,
  report,
  reportCorrection,
  reportGrammarSuggestion,
  reportRequest,
  setPolicy,
} from "./moderation";
import { connectionReachesRoles, RoleError, rolesOf, type Role } from "./roles";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
type Helpers = {
  caller: () => CallerProps & { clientName?: string };
  sourceLabel: (props: CallerProps & { clientName?: string }) => string;
  ok: (value: unknown) => ToolResult;
  guarded: (run: () => Promise<ToolResult>) => Promise<ToolResult>;
};

const itemId = z.string().min(2).max(48);
const bookId = z.string().min(2).max(80);
const recordId = z.string().min(4).max(40);
const why = z.string().min(1).max(2000);
/** A pack (id), a shared book (book), a correction to a pack (correction), a request in Explore (request) or a suggestion to a language's grammar (grammar): exactly one of them. */
const target = { id: itemId.optional(), book: bookId.optional(), correction: recordId.optional(), request: recordId.optional(), grammar: recordId.optional() };
type On = { item: string } | { book: string } | { correction: string } | { request: string } | { grammar: string };
function oneOf({ id, book, correction, request, grammar }: { id?: string; book?: string; correction?: string; request?: string; grammar?: string }): On {
  if ([id, book, correction, request, grammar].filter(Boolean).length !== 1) throw new LibraryError("Give id (a pack), book (a shared book), correction (a correction to a pack), request (a request in Explore) or grammar (a suggestion to a language's grammar), one of them.");
  return id ? { item: id } : book ? { book } : correction ? { correction } : request ? { request } : { grammar: grammar! };
}

export function registerModerationTools(server: McpServer, env: Env, roles: Set<Role>, { caller, sourceLabel, ok, guarded }: Helpers) {
  server.registerTool(
    "report",
    {
      title: "Report something in Explore",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Reports a pack in Explore (id), a book shared there (book: its id, from explore_search), a correction someone suggested on a pack (correction: its id, from list_corrections), a request on Explore's board (request: its id, from explore_requests), or a suggestion to a language's grammar (grammar: its id, from grammar_suggestions), for the person: abuse, spam (or not what it says), personal information, anything involving minors, illegal content, or something else; details says what and where. Abuse, spam and the rest hide it once enough established accounts report it; minors or illegal content hide it at once. A report on one of Lexicommons' own packs goes to an admin instead. A copyright notice isn't filed here: the person whose work it is files it in the app (More → Report on the pack's or book's page). Quality isn't abuse: a wrong translation is a correction, and a wrong correction is declined by the pack's author, not reported.",
      inputSchema: z.object({ ...target, reason: z.enum(CORRECTION_REPORT_REASONS as unknown as [string, ...string[]]), details: z.string().max(2000).optional() }),
    },
    async ({ id, book, correction, request, grammar, reason, details }) =>
      guarded(async () => {
        const on = oneOf({ id, book, correction, request, grammar });
        if ("item" in on) return ok(await report(env, caller().userId, on.item, { reason, details }, { via: "mcp" }));
        if ("book" in on) return ok(await report(env, caller().userId, on.book, { reason, details }, { via: "mcp", work: "book" }));
        if ("grammar" in on) return ok(await reportGrammarSuggestion(env, caller().userId, on.grammar, { reason, details }));
        return ok("correction" in on ? await reportCorrection(env, caller().userId, on.correction, { reason, details }) : await reportRequest(env, caller().userId, on.request, { reason, details }));
      }),
  );

  if (!roles.has("moderator") && !roles.has("admin")) return;
  const asModerator = async <T>(run: (actor: { userId: string; via: string; admin: boolean }) => Promise<T>): Promise<ToolResult> =>
    guarded(async () => {
      const props = caller();
      if (!connectionReachesRoles(props)) throw new RoleError("This personal token was made without admin access, so it can't moderate.");
      const now = await rolesOf(env, props.userId);
      if (!now.has("moderator") && !now.has("admin")) throw new RoleError("This account isn't a moderator (any more).");
      return ok(await run({ userId: props.userId, via: sourceLabel(props), admin: now.has("admin") }));
    });

  server.registerTool(
    "moderation_policy",
    {
      title: "The moderation policy",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      description: "Read the moderation rules before working the queue (without text). An admin can change them (text: the whole policy), as a new revision.",
      inputSchema: z.object({ text: z.string().min(40).max(20000).optional() }),
    },
    async ({ text }) => asModerator(async (actor) => (text ? setPolicy(env, actor, text) : policy(env))),
  );

  server.registerTool(
    "mod_queue",
    {
      title: "The report queue",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "What's waiting: cases (an item with its open reports, or a counter-notice), worst and oldest first, and how many there are. An admin also sees the escalated ones.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    },
    async ({ limit }) => asModerator(async (actor) => queue(env, actor, { limit: limit ?? 20 })),
  );

  server.registerTool(
    "mod_get",
    {
      title: "One case",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "One case in full: the item and its sentences (the first 400, with how many there are), every report and counter-notice on it (with ids for mod_resolve), and its owner's record (how long they've been here, what they've shared, what came down, copyright strikes). A shared book's case (book): the same, with its rights and where its text came from, and each sentence with what its woven layers say for it. A correction's case (correction): what it says (its fix and note), on which pack, its reports, and its author's record. A request's case (request): what it asks, in its words, its reports, and its author's record. A grammar suggestion's case (grammar): what it proposes for which pattern, its note, its reports, and its author's record.",
      inputSchema: z.object(target),
    },
    async ({ id, book, correction, request, grammar }) =>
      asModerator(async (actor) => {
        const on = oneOf({ id, book, correction, request, grammar });
        return "item" in on ? caseOf(env, actor, on.item) : "book" in on ? caseOf(env, actor, on.book, "book") : "correction" in on ? caseOfCorrection(env, actor, on.correction) : "grammar" in on ? caseOfGrammar(env, actor, on.grammar) : caseOfRequest(env, actor, on.request);
      }),
  );

  server.registerTool(
    "mod_hide",
    {
      title: "Hide an item",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      description:
        "Hides a live item that's reported (not listed, not served, dropped by followers' devices) while you look into it: the hide lasts while a report on it is open, so settle the case with mod_resolve. why is shown to its owner. Not the library's own packs: those are an admin's (library_unpublish). A reported shared book (book) is hidden the same way. A reported correction (correction) is hidden the same way: shown to nobody but its author, and never accepted while hidden. So is a reported request (request): off the board, and not answered while hidden. And a reported grammar suggestion (grammar): shown to nobody but its author, and never accepted while hidden.",
      inputSchema: z.object({ ...target, why }),
    },
    async ({ id, book, correction, request, grammar, why: reason }) =>
      asModerator(async (actor) => {
        const on = oneOf({ id, book, correction, request, grammar });
        return "item" in on ? modHide(env, actor, on.item, reason) : "book" in on ? modHide(env, actor, on.book, reason, "book") : "correction" in on ? modHideCorrection(env, actor, on.correction, reason) : "grammar" in on ? modHideGrammar(env, actor, on.grammar, reason) : modHideRequest(env, actor, on.request, reason);
      }),
  );

  server.registerTool(
    "mod_restore",
    {
      title: "Restore an item",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      description: "Puts a hidden item (or a shared book, correction, request or grammar suggestion) back, dismissing its open reports with the same note. Minors or illegal content, and anything taken down for good, is an admin's to restore.",
      inputSchema: z.object({ ...target, why }),
    },
    async ({ id, book, correction, request, grammar, why: reason }) =>
      asModerator(async (actor) => {
        const on = oneOf({ id, book, correction, request, grammar });
        return "item" in on ? modRestore(env, actor, on.item, reason) : "book" in on ? modRestore(env, actor, on.book, reason, "book") : "correction" in on ? modRestoreCorrection(env, actor, on.correction, reason) : "grammar" in on ? modRestoreGrammar(env, actor, on.grammar, reason) : modRestoreRequest(env, actor, on.request, reason);
      }),
  );

  server.registerTool(
    "mod_resolve",
    {
      title: "Settle a report",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      description:
        "Upholds or dismisses a report (report: its id, from mod_get), or a counter-notice (counter_notice: its id; an admin's, as is a report a counter-notice answers). Upholding a report takes the item down for good (the library's own packs come off with library_unpublish instead); dismissing one puts a hidden item back once nothing else holds it down. A report on a correction works the same on the correction (the pack stays as it is), and one on a request on the request. Upholding a counter-notice restores the item. why goes in the record. Three upheld copyright reports stop an account sharing.",
      inputSchema: z.object({ report: recordId.optional(), counter_notice: recordId.optional(), decision: z.enum(["uphold", "dismiss"]), why }),
    },
    async ({ report: reportId, counter_notice, decision, why: reason }) => asModerator(async (actor) => modResolve(env, actor, { report: reportId, counterNotice: counter_notice, decision, why: reason })),
  );

  server.registerTool(
    "mod_escalate",
    {
      title: "Hand a case to an admin",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      description: "Hands a report or a counter-notice to an admin, with the case laid out in why: anything involving minors or illegal content, counter-notices, anything you're unsure of.",
      inputSchema: z.object({ report: recordId.optional(), counter_notice: recordId.optional(), why }),
    },
    async ({ report: reportId, counter_notice, why: reason }) => asModerator(async (actor) => modEscalate(env, actor, { report: reportId, counterNotice: counter_notice, why: reason })),
  );

  if (!roles.has("admin")) return;
  server.registerTool(
    "mod_ban",
    {
      title: "Ban an account",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      description: "An admin's: stops an account sharing (scope share) or taking part in Explore at all (community), for days or for good (no days). user is the owner's id from mod_get. why is shown to them.",
      inputSchema: z.object({ user: z.string().min(4).max(40), scope: z.enum(["share", "community"]), why, days: z.number().int().min(1).max(3650).optional() }),
    },
    async (input) => asModerator(async (actor) => modBan(env, actor, input)),
  );

  server.registerTool(
    "mod_unban",
    {
      title: "Lift a ban",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      description: "An admin's: lifts an account's bans.",
      inputSchema: z.object({ user: z.string().min(4).max(40), why }),
    },
    async (input) => asModerator(async (actor) => modUnban(env, actor, input)),
  );
}
