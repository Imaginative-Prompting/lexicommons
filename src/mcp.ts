// The MCP endpoint (/mcp). The connection tests (who's calling, a round trip, writes the app can see, a signed upload)
// and the look: your AI can read the theming guide, read the person's look, change it, put images in it, and undo
// its changes. And practice: your AI practices with you live in the app, or logs a conversation held in its own app
// (mcp-practice.ts). And your packs: your AI makes your study material and keeps it up, checked and undoable, on each
// of your devices (mcp-packs.ts). And your requests: what you left in the app for your AI to do (mcp-requests.ts). For
// an admin, the open library (mcp-admin.ts): those tools are registered only when the caller is one, and each checks the
// role again. Stateless: a fresh server per request, all state in D1/R2 and the account's AI room.

import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import type { CallerProps, Env } from "./env";
import { BUILT_IN_THEMES, builtInName, checkCss, checkTokens, describeLook, emptyLook, IMAGE_TYPES } from "../public/js/lx/look-rules.js";
import { addNote, LibraryError, listNotes, listUploads, requestUpload, UPLOAD_TYPES } from "./library";
import { changeLook, checkSlot, createTheme, getLook, listThemes, lookHistory, lookImageBytes, restoreRevision, useTheme, type Look, type LookRecord } from "./looks";
import { APP_CSS, themingGuide, type AppCssName } from "./theming";
import { registerCoachTools } from "./mcp-coach";
import { registerPracticeTools } from "./mcp-practice";
import { registerPackTools } from "./mcp-packs";
import { registerRequestTools } from "./mcp-requests";
import { registerTextTools } from "./mcp-texts";
import { registerAdminTools } from "./mcp-admin";
import { registerCommunityTools, sharingListed } from "./mcp-community";
import { registerCorrectionTools } from "./mcp-corrections";
import { registerModerationTools } from "./mcp-moderation";
import { registerBoardTools } from "./mcp-board";
import { registerGrammarTools } from "./mcp-grammar";
import { callerRoles, type Role } from "./roles";
import { recordServerError } from "./errors";
import { grantOfToken, grantRevoked } from "./revoked";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };

const ok = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const failure = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

function caller(): CallerProps {
  const props = getMcpAuthContext()?.props as Partial<CallerProps> | undefined;
  if (!props?.userId || !props.name || !props.via) throw new Error("Missing caller identity");
  return props as CallerProps;
}

/** Where a write came from, shown next to it in the app ("oauth:Claude Code", "pat:my script"). */
function sourceLabel(props: CallerProps & { clientName?: string }): string {
  return props.via === "pat" ? `pat:${props.tokenName ?? "token"}` : `oauth:${props.clientName ?? "app"}`;
}

/** A tool's work, with what went wrong answered in words; an unexpected failure is counted in the error reports (errors.ts). */
const guardedIn =
  (env: Env) =>
  async (run: () => Promise<ToolResult>): Promise<ToolResult> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof LibraryError) return failure(error.message);
      console.error(JSON.stringify({ mcp_tool_error: String(error) }));
      await recordServerError(env, "mcp", error, "mcp tool");
      return failure("Something went wrong on Lexicommons' side. Try again in a moment.");
    }
  };

/** Which theme a look is: one of the person's (by id and name), or a built-in one. */
function themeView(look: Look) {
  return look.theme ? { kind: "yours", id: look.theme, name: look.name } : { kind: "built-in", id: look.base, name: builtInName(look.base) };
}

/** A look as an AI sees it: images by slot with their type and size (their hashes are the server's business). */
function lookView(look: Look) {
  return {
    theme: themeView(look),
    name: look.name,
    base: look.base,
    tokens: look.tokens,
    css: look.css,
    images: Object.fromEntries(Object.entries(look.images).map(([slot, image]) => [slot, { type: image.type, size: image.size, name: image.name, cssVar: `var(--image-${slot})` }])),
  };
}

function recordView(record: LookRecord | null) {
  if (!record) {
    return {
      rev: 0,
      look: lookView(emptyLook() as Look),
      note: "No look saved yet: the app shows the default (Graphite, no changes). The app saves the look here the next time it opens. update_look works either way.",
    };
  }
  return {
    rev: record.rev,
    updatedAt: new Date(record.updatedAt).toISOString(),
    changedBy: record.source,
    summary: describeLook(record.look),
    look: lookView(record.look),
    lastApplied: record.applied
      ? { rev: record.applied.rev, at: new Date(record.applied.at).toISOString(), device: record.applied.device, ...(record.applied.undone ? { undone: record.applied.undone } : {}), notes: record.applied.notes }
      : "No device has reported this revision yet. Open apps pick changes up within a few seconds.",
  };
}

const tokenValue = z.union([z.string().max(500), z.null()]);

/**
 * roles: what the caller may act as, read when the request came in (each admin tool reads it again). canWrite: whether its token
 * may change anything (learn:write); without it only the tools marked read-only are registered, so the others are neither listed
 * nor callable.
 */
function buildServer(env: Env, roles: Set<Role>, canWrite = true): McpServer {
  const guarded = guardedIn(env);
  const server = new McpServer(
    { name: "lexicommons", title: "Lexicommons: the language you're learning, your lessons and your mistakes", version: "0.3.0" },
    {
      instructions:
        "This person is learning a language in Lexicommons, a free language-learning app, and you can read what they've studied. When they ask \"what am I bad at?\", " +
        "\"what am I struggling with?\", \"why does the verb go there?\", the difference between two words, a point of grammar, or what to practice next, even with no language named, " +
        "assume they mean the language they're learning: call study_summary first and answer from their own sentences and mistakes, without asking which sentence or language they mean. study_concept, study_lesson, study_sentence and " +
        "study_misses go deeper, and get_coaching_guide says how to coach them. Don't wait to be told: they may not know you can. At the start of a conversation, also call list_requests: the person " +
        "may have left requests in the app for you (practice with them, add to a pack, make a pack, add a text to read, " +
        "change their look, a question); take_request one, do it, and finish_request it. You can restyle the person's app: read get_theming_guide once, " +
        "read get_look, then change it with update_look (colors as tokens, custom CSS, the base theme) and " +
        "request_look_image_upload (images). The app applies changes within seconds and can undo any of them; " +
        "list_look_history and restore_look undo from here. Every look they make is saved as a theme of theirs: list_themes " +
        "shows them, use_theme switches, and for a new look (\"make it look like X\") create_theme first, so their other " +
        "themes stay as they are; update_look changes the theme in use. To practice the language they're learning with the person: read get_practice_guide " +
        "once, then practice_wait joins the practice they start in the app; reply with practice_reply until it ends, " +
        "then practice_end. A conversation held right here is logged with practice_log. To make what they study: read " +
        "get_pack_guide once; list_packs and get_pack show what they have; add_items keeps adding to a pack of theirs, and " +
        "create_pack makes a separate one (a trip); every change is checked, reaches each of their devices, and can be " +
        "undone (undo_pack_change). To add a text to their reading library (a book from their computer, a page from the " +
        "web, or one you write): read get_text_guide once, then request_text_upload and add_text; list_texts and " +
        "get_text show where their texts are. Connection tests: whoami, " +
        "echo, save_note/list_notes, request_upload/list_uploads. Explore, the shared library: explore_search and " +
        "explore_get find packs for the person, follow puts one in their studying." +
        (sharingListed(env, roles) ? " share_upload then share_pack shares one of their packs (under CC BY-SA 4.0, after they accept the terms in the app)." : "") +
        (roles.has("moderator") || roles.has("admin") ? " This connection moderates Explore: read moderation_policy, then work mod_queue (mod_get, mod_resolve, mod_hide, mod_restore, mod_escalate), writing why each time." : "") +
        (roles.has("admin")
          ? " This connection is an admin's: the open library (books, layers, frequency lists, the shelf) is managed with the library_* tools; read admin_guide first."
          : ""),
    },
  );
  if (!canWrite) {
    // A read-only token: a tool not marked readOnlyHint is a write, and isn't there for it.
    const register = server.registerTool.bind(server) as (...args: unknown[]) => unknown;
    (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool = (name: unknown, config: unknown, ...rest: unknown[]) =>
      (config as { annotations?: { readOnlyHint?: boolean } } | undefined)?.annotations?.readOnlyHint === true ? register(name, config, ...rest) : undefined;
  }

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "The Lexicommons account this connection acts as, how it signed in, and any role it acts with (admin, moderator).",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      guarded(async () => {
        const props = caller() as CallerProps & { clientName?: string };
        return ok({ userId: props.userId, name: props.name, via: props.via, app: sourceLabel(props), roles: [...(await callerRoles(env, props))] });
      }),
  );

  server.registerTool(
    "echo",
    {
      title: "Echo",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "Returns the text you send, with the server time. A round-trip check.",
      inputSchema: { text: z.string().min(1).max(500) },
    },
    async ({ text }) => guarded(async () => ok({ echo: text, serverTime: new Date().toISOString() })),
  );

  server.registerTool(
    "save_note",
    {
      title: "Save a note",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description: "Saves a short note to the user's Lexicommons account. It appears in the app within seconds.",
      inputSchema: { text: z.string().min(1).max(2000) },
    },
    async ({ text }) =>
      guarded(async () => {
        const props = caller() as CallerProps & { clientName?: string };
        return ok(await addNote(env, props.userId, text, sourceLabel(props)));
      }),
  );

  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "The user's most recent notes, newest first.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    async ({ limit }) => guarded(async () => ok(await listNotes(env, caller().userId, limit ?? 20))),
  );

  server.registerTool(
    "request_upload",
    {
      title: "Request an upload link",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Returns a one-time signed URL (valid 15 minutes, max 10 MB) and a ready curl command. Upload the file by " +
        "running the command from a shell; never paste file contents into a tool call. Allowed types: " +
        [...UPLOAD_TYPES].join(", "),
      inputSchema: { filename: z.string().min(1).max(120), contentType: z.string().min(3).max(60) },
    },
    async ({ filename, contentType }) =>
      guarded(async () => {
        const props = caller() as CallerProps & { clientName?: string };
        return ok(await requestUpload(env, props.userId, { filename, contentType }, sourceLabel(props)));
      }),
  );

  server.registerTool(
    "list_uploads",
    {
      title: "List uploads",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "The user's uploads with their status, size and sha256, newest first.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    async ({ limit }) => guarded(async () => ok(await listUploads(env, caller().userId, limit ?? 20))),
  );

  // ---------- the look ----------

  server.registerTool(
    "get_theming_guide",
    {
      title: "How to restyle Lexicommons",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "Everything needed to restyle the app well: how looks work, every part (data-part) and its states, every " +
        "token with its value under each built-in theme, the safety rules and limits, and examples. Read it before " +
        "your first update_look. include_css adds the app's own stylesheets (tokens, base, components, presets, " +
        "shell, practice) when you need to see exactly what a part looks like now.",
      inputSchema: z.object({ include_css: z.array(z.enum(Object.keys(APP_CSS) as [AppCssName, ...AppCssName[]])).max(Object.keys(APP_CSS).length).optional() }),
    },
    async ({ include_css }) => guarded(async () => ok(await themingGuide(env, include_css ?? []))),
  );

  server.registerTool(
    "get_look",
    {
      title: "Get the look",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "The person's current look: which theme it is (one of theirs, or a built-in one), its base theme, the tokens " +
        "and CSS it changes, its images, its revision, who changed it last, and lastApplied (whether a device has " +
        "applied this revision, what its check left out, or that it was undone because it broke the app). Anything " +
        "not in tokens is the base theme's own value. list_themes shows their other themes.",
    },
    async () => guarded(async () => ok(recordView(await getLook(env, caller().userId)))),
  );

  server.registerTool(
    "update_look",
    {
      title: "Change the look",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Changes the theme in use; their app applies it within seconds. If a built-in theme is in use, this starts a " +
        "new theme of theirs from it (named name, or \"<Built-in>, edited\"): built-in themes never change. For a new " +
        "look rather than a change to the one in use, call create_theme first, so the theme in use stays as it is. " +
        "name renames the theme in use. tokens merge into the current ones " +
        "({ \"--m-right\": \"#7fc8ff\" }; null removes one), or replace them all with replace_tokens. css replaces the " +
        "whole custom CSS (\"\" clears it): read get_look first and send it all back with your edits. base picks " +
        "the built-in theme (graphite, paper, auto, contrast, sepia). reset clears tokens, CSS and images first. " +
        "remove_images empties slots. Everything goes through the same safety check as the app; the result lists " +
        "what it removed. expected_rev refuses the change if the look moved on since you read it. Every change " +
        "can be undone (restore_look, or one tap in the app).",
      inputSchema: z.object({
        tokens: z.record(z.string().max(70), tokenValue).optional(),
        replace_tokens: z.boolean().optional(),
        css: z.string().max(110_000).optional(),
        base: z.enum(["graphite", "paper", "auto", "contrast", "sepia"]).optional(),
        name: z.string().max(80).optional(),
        reset: z.boolean().optional(),
        remove_images: z.array(z.string().max(32)).max(12).optional(),
        expected_rev: z.number().int().min(0).optional(),
      }),
    },
    async (input) =>
      guarded(async () => {
        const props = caller() as CallerProps & { clientName?: string };
        const result = await changeLook(
          env,
          props.userId,
          {
            reset: input.reset,
            base: input.base,
            name: input.name,
            tokens: input.tokens,
            replaceTokens: input.replace_tokens,
            css: input.css,
            removeImages: input.remove_images,
          },
          sourceLabel(props),
          input.expected_rev,
        );
        return ok({
          rev: result.rev,
          theme: themeView(result.look),
          ...(result.started ? { startedTheme: `A built-in theme was in use, so this started a new theme of theirs: "${result.started}".` } : {}),
          summary: describeLook(result.look),
          removedOrIgnored: result.notes,
          look: lookView(result.look),
          next: "Open apps apply this within a few seconds. Call get_look shortly to see lastApplied for this revision.",
        });
      }),
  );

  server.registerTool(
    "check_look",
    {
      title: "Check tokens and CSS",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "Runs the app's safety check on tokens and CSS without saving anything: returns them as they'd be kept, and what would be removed.",
      inputSchema: z.object({ tokens: z.record(z.string().max(70), z.string().max(500)).optional(), css: z.string().max(110_000).optional() }),
    },
    async ({ tokens, css }) =>
      guarded(async () => {
        const checkedTokens = checkTokens(tokens ?? {}) as { tokens: Record<string, string>; removed: { what: string; why: string }[] };
        let checkedCss: { css: string; removed: { what: string; count: number }[] };
        try {
          checkedCss = checkCss(css ?? "") as typeof checkedCss;
        } catch (error) {
          throw new LibraryError((error as Error).message);
        }
        return ok({ tokens: checkedTokens.tokens, tokensRemoved: checkedTokens.removed, css: checkedCss.css, cssRemoved: checkedCss.removed });
      }),
  );

  server.registerTool(
    "request_look_image_upload",
    {
      title: "Put an image in the look",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Returns a one-time signed URL (15 minutes, up to 4 MB) and a ready curl command for an image. Run the " +
        "command from a shell; never paste image data into a tool call. Once it's uploaded the image is in the " +
        "look's slot, as var(--image-<slot>) for CSS: 'background' fills the app's background, " +
        "'background-<section>' (today, study, read, know, explore, settings, session) fills that section's in its " +
        "place, 'mark' is the logo square in the header, any other name is yours to use. Replaces whatever the slot " +
        "held, in the theme in use (on a built-in theme, it starts a new theme of theirs). Types: " +
        IMAGE_TYPES.join(", "),
      inputSchema: z.object({ slot: z.string().min(1).max(32), content_type: z.enum(IMAGE_TYPES as [string, ...string[]]), filename: z.string().min(1).max(120) }),
    },
    async ({ slot, content_type, filename }) =>
      guarded(async () => {
        const props = caller() as CallerProps & { clientName?: string };
        const ticket = await requestUpload(env, props.userId, { filename, contentType: content_type, purpose: `look:${checkSlot(slot)}` }, sourceLabel(props));
        return ok({ ...ticket, slot, cssVar: `var(--image-${slot})`, after: "The upload's reply includes lookRev, the look's new revision with the image in it." });
      }),
  );

  server.registerTool(
    "get_look_image",
    {
      title: "See an image in the look",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "Returns the image in one of the look's slots, so you can see it (to match colors to a background, say). Images over 1.5 MB are described instead.",
      inputSchema: z.object({ slot: z.string().min(1).max(32) }),
    },
    async ({ slot }) =>
      guarded(async () => {
        const found = await lookImageBytes(env, caller().userId, checkSlot(slot));
        if (!found) return failure(`The look has no image called "${slot}".`);
        const { image, bytes } = found;
        const about = { type: "text" as const, text: JSON.stringify({ slot, type: image.type, size: image.size, name: image.name }) };
        if (image.type === "image/svg+xml") return { content: [about, { type: "text", text: new TextDecoder().decode(bytes) }] };
        if (bytes.byteLength > 1_500_000) return { content: [about, { type: "text", text: "Too big to show here." }] };
        let binary = "";
        const view = new Uint8Array(bytes);
        for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
        return { content: [about, { type: "image", data: btoa(binary), mimeType: image.type }] };
      }),
  );

  server.registerTool(
    "list_look_history",
    {
      title: "List the look's revisions",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "The look's last 20 revisions, newest first: which theme each was, who made it and what it held. restore_look brings one back.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
    },
    async ({ limit }) =>
      guarded(async () =>
        ok(
          (await lookHistory(env, caller().userId, limit ?? 20)).map((entry) => ({
            rev: entry.rev,
            at: new Date(entry.at).toISOString(),
            changedBy: entry.source,
            theme: themeView(entry.look),
            base: entry.look.base,
            summary: describeLook(entry.look),
          })),
        ),
      ),
  );

  server.registerTool(
    "restore_look",
    {
      title: "Restore a revision of the look",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Makes an earlier revision (from list_look_history) the current look again, as a new revision, so the restore " +
        "can be undone too. A revision of one of their themes puts that theme back as it was then, and in use.",
      inputSchema: z.object({ rev: z.number().int().min(1) }),
    },
    async ({ rev }) =>
      guarded(async () => {
        const props = caller() as CallerProps & { clientName?: string };
        const result = await restoreRevision(env, props.userId, rev, sourceLabel(props));
        return ok({ rev: result.rev, restored: rev, summary: describeLook(result.look), look: lookView(result.look) });
      }),
  );

  server.registerTool(
    "list_themes",
    {
      title: "List the themes",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "The person's themes and the built-in ones, and which is in use. Every look they (or you) make is saved as a " +
        "theme of theirs, so switching never loses one. use_theme switches; create_theme makes a new one.",
    },
    async () =>
      guarded(async () => {
        const userId = caller().userId;
        const [record, library] = await Promise.all([getLook(env, userId), listThemes(env, userId)]);
        const inUse = record?.look ?? (emptyLook() as Look);
        return ok({
          inUse: themeView(inUse),
          yours: library.themes
            .filter((t) => !t.deletedAt)
            .map((t) => ({
              id: t.id,
              name: t.look.name,
              base: t.look.base,
              summary: describeLook(t.look),
              madeBy: t.createdBy,
              createdAt: new Date(t.createdAt).toISOString(),
              changedAt: new Date(t.updatedAt).toISOString(),
              inUse: inUse.theme === t.id,
            })),
          builtIn: BUILT_IN_THEMES.map((t) => ({ id: t.id, name: t.name, about: t.about, inUse: !inUse.theme && inUse.base === t.id })),
        });
      }),
  );

  server.registerTool(
    "use_theme",
    {
      title: "Switch theme",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      description:
        "Switches the app to a theme: one of the person's (by id or name, from list_themes) or a built-in one " +
        "(graphite, paper, auto, contrast, sepia). No theme changes, so the one being left stays as it was. Their " +
        "app applies it within seconds, with Undo.",
      inputSchema: z.object({ theme: z.string().min(1).max(80) }),
    },
    async ({ theme }) =>
      guarded(async () => {
        const props = caller() as CallerProps & { clientName?: string };
        const result = await useTheme(env, props.userId, theme, sourceLabel(props));
        return ok({ rev: result.rev, inUse: themeView(result.look), ...(result.unchanged ? { note: "That theme was already in use." } : {}), summary: describeLook(result.look) });
      }),
  );

  server.registerTool(
    "create_theme",
    {
      title: "Make a new theme",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Makes a new theme of the person's and (unless use is false) switches to it, so update_look and " +
        "request_look_image_upload then change it and none of their other themes. Call it first when they ask for a " +
        "new look (\"make my Lexicommons look like X\"); for a change to the theme in use, just call update_look. from: " +
        "\"blank\" (the default: a built-in theme as it comes, base or the current one's), \"current\" (a copy of the " +
        "look in use), or one of their themes or a built-in one by id or name. A name they already use gets a number.",
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        from: z.string().min(1).max(80).optional(),
        base: z.enum(["graphite", "paper", "auto", "contrast", "sepia"]).optional(),
        use: z.boolean().optional(),
      }),
    },
    async ({ name, from, base, use }) =>
      guarded(async () => {
        const props = caller() as CallerProps & { clientName?: string };
        const result = await createTheme(env, props.userId, { name, from, base, use }, sourceLabel(props));
        return ok({
          id: result.id,
          name: result.look.name,
          base: result.look.base,
          inUse: use !== false,
          ...(result.lookRev ? { rev: result.lookRev } : {}),
          summary: describeLook(result.look),
          next: use !== false ? "It's in use now: change it with update_look and request_look_image_upload." : "Switch to it with use_theme when it should show.",
        });
      }),
  );

  server.registerPrompt(
    "restyle",
    {
      title: "Restyle my Lexicommons",
      description: "Restyles the app the way you describe: colors, fonts, shapes, a background image.",
      argsSchema: z.object({ request: z.string().min(1).max(2000) }),
    },
    ({ request }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Restyle my Lexicommons app: ${request}\n\n` +
              "Read get_theming_guide first, then get_look and list_themes. If this asks for a new look, make it a " +
              "new theme with create_theme first (named for what it is), so my other themes stay as they are; if it " +
              "asks to change the theme in use, change that one. Prefer tokens for colors, and CSS on [data-part] " +
              "selectors for shapes and layout. Keep every meaning (right, wrong, slipping, moved) easy to tell " +
              "apart, color-blind people included, and keep text readable on what it sits on. For an image, " +
              "use request_look_image_upload and run its curl command. After update_look, wait a few seconds and " +
              "check get_look's lastApplied, then tell me what you changed.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "connection_check",
    { title: "Check the Lexicommons connection", description: "Walks through every test tool once." },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "Check my Lexicommons connection: call whoami, then echo 'hallo', then save_note with the text " +
              "'Connection check from <your app name> at <time>', then list_notes, and tell me what each returned.",
          },
        },
      ],
    }),
  );

  registerPracticeTools(server, env, { caller: () => caller() as CallerProps & { clientName?: string }, sourceLabel, ok, guarded });
  registerCoachTools(server, env, { caller: () => caller() as CallerProps & { clientName?: string }, sourceLabel, ok, guarded });
  registerPackTools(server, env, { caller: () => caller() as CallerProps & { clientName?: string }, sourceLabel, ok, guarded });
  registerRequestTools(server, env, { caller: () => caller() as CallerProps & { clientName?: string }, sourceLabel, ok, guarded });
  registerTextTools(server, env, { caller: () => caller() as CallerProps & { clientName?: string }, sourceLabel, ok, guarded });
  registerCommunityTools(server, env, roles, { caller: () => caller() as CallerProps & { clientName?: string }, sourceLabel, ok, guarded });
  registerCorrectionTools(server, env, roles, { caller: () => caller() as CallerProps & { clientName?: string }, sourceLabel, ok, guarded });
  registerModerationTools(server, env, roles, { caller: () => caller() as CallerProps & { clientName?: string }, sourceLabel, ok, guarded });
  registerBoardTools(server, env, roles, { caller: () => caller() as CallerProps & { clientName?: string }, sourceLabel, ok, guarded });
  registerGrammarTools(server, env, roles, { caller: () => caller() as CallerProps & { clientName?: string }, sourceLabel, ok, guarded });
  if (roles.has("admin")) registerAdminTools(server, env, { caller: () => caller() as CallerProps & { clientName?: string }, sourceLabel, ok, guarded });

  server.registerResource(
    "about",
    "lexicommons://about",
    { title: "About this server", description: "What this server is and what it can do so far.", mimeType: "text/plain" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: "Lexicommons (working name): a free, community language-learning app. People study ready-made packs and read with no AI at all; connecting one, as this person has connected you, is optional. So far this server can restyle the person's app and keep each look as a theme of theirs (the look and theme tools), practice with them live in the app or log a conversation held elsewhere (the practice tools), make and keep up their study material (the pack tools), and test the connection.",
        },
      ],
    }),
  );

  return server;
}

/** The OAuth provider calls this only with a valid token, after setting ctx.props to the caller. */
export const mcpApiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const props = (ctx as ExecutionContext & { props?: Partial<CallerProps> }).props;
    if (props?.userId) {
      const { success } = await env.API_LIMITER.limit({ key: `api:${props.userId}` });
      if (!success) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60" },
        });
      }
    }
    // An OAuth token of a connection its person revoked works no more, whatever KV still says: a refresh under way can write the grant
    // back, and another location reads a deleted one for up to a minute (src/revoked.ts). A personal token has its own revocation.
    if (props?.via !== "pat") {
      const grant = grantOfToken((ctx as ExecutionContext & { auth?: { token?: string } }).auth?.token);
      if (!grant || (await grantRevoked(env, grant.userId, grant.grantId))) {
        return new Response(JSON.stringify({ error: "invalid_token", error_description: "This connection was removed from Lexicommons. Connect the app again." }), {
          status: 401,
          headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer error="invalid_token"' },
        });
      }
    }
    // Which tools this caller sees: an admin's are listed only for an admin (read from D1 now; each checks again).
    const roles = props?.userId ? await callerRoles(env, props as CallerProps) : new Set<Role>();
    // What an OAuth token was granted (workers-oauth-provider puts it on ctx.auth, but only advertises requiredScopes and never
    // enforces them): without learn:write, only the read-only tools; with neither scope, nothing. A personal token has both.
    const scope = props?.via === "pat" ? null : new Set((ctx as ExecutionContext & { auth?: { scope?: string[] } }).auth?.scope ?? []);
    const canWrite = !scope || scope.has("learn:write");
    if (scope && !canWrite && !scope.has("learn:read")) {
      return new Response(JSON.stringify({ error: "insufficient_scope" }), {
        status: 403,
        headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer error="insufficient_scope", scope="learn:read learn:write"' },
      });
    }
    const handler = createMcpHandler(() => buildServer(env, roles, canWrite), {
      route: "/mcp",
      // lexicommons.com in production; a local server's own hostname under wrangler dev.
      allowedHostnames: [new URL(env.PUBLIC_ORIGIN).hostname],
      allowedOriginHostnames: [new URL(env.PUBLIC_ORIGIN).hostname],
    });
    return handler(request, env, ctx);
  },
};
