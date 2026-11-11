// The MCP tools for adding texts to the person's reading library (registered by mcp.ts): a text from their computer,
// one from the web, or one written for them, uploaded by a signed link (never in tool arguments), checked here and on
// each of their devices (src/texts.ts), with a cover the AI may draw as SVG. Plus where each text is, removing one, and
// Undo. The prompt add_text starts it; get_text_guide says how to do it well.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CallerProps, Env } from "./env";
import { requestUpload, TEXT_UPLOADS } from "./library";
import { addText, addWeave, dropWeaveText, getText, listTexts, removeText, textSource, undoTextChange, weaveSource, weaveUpload } from "./texts";
import { practiceRoom, unwrap, type RequestMeta } from "./practice";
import { enqueue } from "./reminders";
import { LibraryError } from "./library";
import { WEAVE_RULES } from "./weave-rules.generated";
import { WEAVE_LANGUAGES } from "../public/js/read/weave-languages.generated.js";
import { textGuide } from "./text-guide";
import { weaveGuide } from "./weave-guide";
import { grammarNow, grammarReady } from "./grammar";
import { numberedSentences } from "./weave-answer";
import { LANGUAGES } from "../public/js/lang/index.js";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
type Helpers = {
  caller: () => CallerProps & { clientName?: string };
  sourceLabel: (props: CallerProps & { clientName?: string }) => string;
  ok: (value: unknown) => ToolResult;
  guarded: (run: () => Promise<ToolResult>) => Promise<ToolResult>;
};

const FORMATS = ["text", "book", "epub", "cover", "weave"] as const;
const languages = Object.keys(LANGUAGES);

export function registerTextTools(server: McpServer, env: Env, { caller, sourceLabel, ok, guarded }: Helpers) {
  const userId = () => caller().userId;
  const room = () => practiceRoom(env, userId());
  /** A weave request of theirs, as list_requests has it: open (waiting, or taken). */
  const weaveRequest = async (requestId: string) => {
    const request = (unwrap(await room().aiListRequests(sourceLabel(caller()))) as RequestMeta[]).find((r) => r.id === requestId);
    if (!request || request.kind !== "weave") throw new LibraryError("No weave request has that id (list_requests lists them).");
    if (request.state !== "waiting" && request.state !== "taken") throw new LibraryError(`That request is ${request.state}: its text went with it.`);
    return request as RequestMeta & { book: string; title: string; language: string };
  };

  server.registerTool(
    "get_text_guide",
    {
      title: "How to add a text to their reading library",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "Read this once before adding a text: what makes a good text at their level, the formats, the cover, and how to check it arrived.",
    },
    async () => guarded(async () => ok({ guide: textGuide() })),
  );

  server.registerTool(
    "request_text_upload",
    {
      title: "A link to upload a text (or its cover)",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "A signed link to upload a text's file (it never goes in a tool's arguments): format text (plain UTF-8 text, up to 8 MB), book (a lexicommons-book as JSON, 8 MB), epub (an EPUB file as it is, 10 MB), cover (an SVG you drew, 64 KB) or weave (a lexicommons-weave as JSON, 8 MB, for add_weave when it's too big to send in its arguments). PUT the file to it within 15 minutes (its curl command does), then add_text (or add_weave) with its id.",
      inputSchema: z.object({ format: z.enum(FORMATS), filename: z.string().min(1).max(120) }),
    },
    async ({ format, filename }) =>
      guarded(async () => {
        const ticket = await requestUpload(env, userId(), { filename, contentType: TEXT_UPLOADS[format]!.type, purpose: `text:${format}` }, sourceLabel(caller()));
        return ok({ upload_id: ticket.id, upload_url: ticket.uploadUrl, method: ticket.method, content_type: ticket.contentType, max_bytes: ticket.maxBytes, expires: new Date(ticket.expiresAt).toISOString(), curl: ticket.curl, next: "Send the file with the curl command, then add_text with this upload_id." });
      }),
  );

  server.registerTool(
    "add_text",
    {
      title: "Add a text to their reading library",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Adds an uploaded text (request_text_upload, then its PUT) to their reading library on every device of theirs, with a cover if you uploaded one. It's checked here first (plain text is made into a book; an EPUB is made into one on each device) and every problem is said at once. It's theirs alone: it stays on their devices. Check it arrived a few seconds later with get_text.",
      inputSchema: z.object({
        upload_id: z.string().min(8).max(40),
        language: z.enum(languages as [string, ...string[]]).describe("The text's language"),
        title: z.string().max(200).optional().describe("Its title (else the book's own, or its first words)"),
        authors: z.array(z.string().max(80)).max(5).optional().describe("Who wrote it, if anyone; leave out for a text you wrote"),
        cover_upload_id: z.string().min(8).max(40).optional().describe("A cover you drew, uploaded as format cover"),
      }),
    },
    async (input) =>
      guarded(async () => {
        const added = await addText(env, userId(), sourceLabel(caller()), input);
        return ok({
          ...added,
          next: `${
            added.devices.length
              ? `It's on its way to ${added.devices.join(", ")}. get_text with text_id ${added.text_id} in a few seconds says where it arrived (or why it couldn't be read).`
              : "No device of theirs has opened Lexicommons yet: it goes to the first one that does (within 7 days), so don't add it again. Ask them to open the app."
          } To weave it: get_text with this text_id hands you its sentences (to_weave), then add_weave with text_id and language (get_weave_guide).`,
        });
      }),
  );

  server.registerTool(
    "list_texts",
    {
      title: "The texts in their reading library",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "Every text on each of their devices (title, language, words, whether you or they added it), what's still on its way, and their devices.",
    },
    async () => guarded(async () => ok(await listTexts(env, userId()))),
  );

  server.registerTool(
    "get_text",
    {
      title: "Where a text is",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "One text: which devices have it, and its changes (added, removed, undone, woven) with how each went on each device, including why a device couldn't read it. With request_id instead, a weave request's text, to weave: every sentence's words, numbered ([0] is a sentence's first word).",
      inputSchema: z.object({ text_id: z.string().min(2).max(80).optional(), request_id: z.string().min(4).max(40).optional() }),
    },
    async ({ text_id, request_id }) =>
      guarded(async () => {
        if (request_id) {
          const request = await weaveRequest(request_id);
          const book = await weaveSource(env, userId(), request_id);
          // Its sentences' words, numbered as the weave guide's rules number them: what a weave is written against (the book's own spans and
          // hashes are worked out when it's added, so they're not handed over).
          return ok({ request_id, title: request.title, language: request.language, words: book.words.length, sentences: (book.sentences as unknown[]).length, text: { id: book.id, version: book.version, lang: book.lang }, to_weave: numberedSentences(book), next: `Read get_weave_guide with language "${request.language}", weave every sentence in to_weave, then add_weave with this request_id and your seat.` });
        }
        if (!text_id) throw new LibraryError("Give text_id (a text in their library) or request_id (a weave request's text).");
        const where = await getText(env, userId(), text_id);
        // A text your AI added, kept for weaving (texts.ts textSource): its sentences, numbered as get_weave_guide's rules number them. Any
        // other says why it can't be woven this way, in the words add_weave would use.
        let weaving: Record<string, unknown>;
        try {
          const book = await textSource(env, userId(), text_id);
          weaving = { text: { id: book.id, version: book.version, lang: book.lang }, to_weave: numberedSentences(book) };
        } catch (error) {
          if (!(error instanceof LibraryError)) throw error;
          weaving = { to_weave: null, why_not: error.message };
        }
        return ok({ ...where, ...weaving });
      }),
  );

  server.registerTool(
    "get_weave_guide",
    {
      title: "How to weave a text into the language they're learning",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "How to weave a text of theirs into the language they're learning, for one language: where a weave comes from (their press in Read), the steps, the form add_weave takes, a worked example, every refusal and its fix, and the rules the books pipeline's judges hold its own woven books to. Read it once before weaving.",
      inputSchema: z.object({ language: z.string().min(2).max(12) }),
    },
    async ({ language }) =>
      guarded(async () => {
        if (!WEAVE_RULES[language] || !WEAVE_LANGUAGES.includes(language)) throw new LibraryError(`Weaving into ${language} isn't ready yet: only ${WEAVE_LANGUAGES.join(", ")} (get_weave_guide's Which languages names them).`);
        // The patterns a sentence's c may name: the language's grammar as the library has it now (add_weave checks against the same).
        await grammarReady(env, language);
        const patterns = Object.fromEntries(
          Object.entries(grammarNow(language)?.patterns ?? {})
            .filter(([, p]) => !(p as { retired?: boolean }).retired)
            .map(([id, p]) => [id, { name: (p as { name: string }).name, about: (p as { about?: string }).about }]),
        );
        return ok(weaveGuide(language, patterns));
      }),
  );

  server.registerTool(
    "add_weave",
    {
      title: "Add your weave of their text",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Adds your weave of a text to their library: a text you added (text_id, with language: one message from them does it all, get_weave_guide says how), or a weave request's text (request_id with your seat, from their press in Read). Checked first, as the books pipeline's judges check a layer (every sentence and word, the language, split forms and pronouns shown alone), with every problem said; then relayed to their devices, each keeping it beside its own copy of the text, and the request is done. Give the weave in get_weave_guide's form ({ sentences: [{ x, t, text, m, u, c }] }), or upload_id from request_text_upload (format weave) for a big one.",
      inputSchema: z.object({
        text_id: z.string().min(2).max(80).optional().describe("A text you added (add_text's text_id), to weave with no request"),
        language: z.string().min(2).max(12).optional().describe("With text_id: the language to weave it into, the one they learn"),
        request_id: z.string().min(4).max(40).optional().describe("Or: a weave request's id (their press in Read)"),
        seat: z.string().min(1).max(40).optional().describe("With request_id: the seat take_request gave you"),
        weave: z.record(z.string(), z.unknown()).optional().describe("The weave, in get_weave_guide's form: { sentences: [{ x, t, text, m, u, c }] }"),
        upload_id: z.string().min(8).max(40).optional().describe("Or: the weave uploaded with request_text_upload, format weave"),
      }),
    },
    async ({ text_id, language, request_id, seat, weave, upload_id }) =>
      guarded(async () => {
        if (!weave === !upload_id) throw new LibraryError("Give the weave, or upload_id: one of them.");
        if (!text_id === !request_id) throw new LibraryError("Give text_id (a text you added) or request_id (their press's weave request): one of them.");
        const source = sourceLabel(caller());
        // A text your AI added: no request, no seat. Checked and relayed the same way; they're told as for a request.
        if (text_id) {
          if (!language) throw new LibraryError("With text_id, give language: the one they learn, as get_weave_guide's.");
          const uploaded = upload_id ? await weaveUpload(env, userId(), upload_id) : null;
          let relayed;
          try {
            relayed = await addWeave(env, userId(), source, { textId: text_id, language, weave: weave ?? uploaded!.weave });
          } catch (error) {
            await uploaded?.release().catch(() => {});
            throw error;
          }
          await uploaded?.done().catch(() => {});
          const said = relayed.said.replace(/^wove/, "Wove");
          await enqueue(env, userId(), "ai", { title: "Your AI wove your text", body: said.slice(0, 160), url: `/app/#read/book/${encodeURIComponent(text_id)}` }).catch(() => false);
          return ok({ ...relayed, next: "It's on its way to their devices: get_text with this text_id shows where it arrived, a few seconds later. In Read its card says it's woven." });
        }
        if (!request_id || !seat) throw new LibraryError("With request_id, give seat: the one take_request gave you.");
        // Only the AI holding the request (its seat): take_request with its seat gives it back only to that seat.
        const held = unwrap(await room().aiTakeRequest(source, request_id, seat)) as { request: RequestMeta & { book: string; title: string; language: string } };
        if (held.request.kind !== "weave") throw new LibraryError("That request isn't a weave.");
        const uploaded = upload_id ? await weaveUpload(env, userId(), upload_id) : null;
        let relayed;
        try {
          relayed = await addWeave(env, userId(), source, { requestId: request_id, title: held.request.title, language: held.request.language, weave: weave ?? uploaded!.weave });
        } catch (error) {
          await uploaded?.release().catch(() => {});
          throw error;
        }
        await uploaded?.done().catch(() => {});
        const said = relayed.said.replace(/^wove/, "Wove");
        const finished = unwrap(await room().aiFinishRequest(source, request_id, seat, { done: { said, links: { text: held.request.book } } })) as RequestMeta;
        await dropWeaveText(env, userId(), request_id).catch(() => {});
        await enqueue(env, userId(), "ai", { title: "Your AI wove your text", body: said.slice(0, 160), url: `/app/#ai/request/${encodeURIComponent(finished.id)}` }).catch(() => false);
        return ok({ ...relayed, request: { request_id, state: finished.state }, next: "It's on its way to their devices: get_text with this text_id shows where it arrived, a few seconds later." });
      }),
  );

  server.registerTool(
    "remove_text",
    {
      title: "Remove a text from their library",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      description: "Removes a text from every device of theirs. Each device keeps it 7 days so it can come back: undo_text_change with the change_id this gives, or Undo in the app.",
      inputSchema: z.object({ text_id: z.string().min(2).max(80) }),
    },
    async ({ text_id }) => guarded(async () => ok({ ...(await removeText(env, userId(), sourceLabel(caller()), { text_id })), next: "undo_text_change with this change_id brings it back." })),
  );

  server.registerTool(
    "undo_text_change",
    {
      title: "Undo a change to a text",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description: "Undoes a text's latest change on every device: an add takes the text away again, a remove brings it back. get_text lists a text's changes.",
      inputSchema: z.object({ change_id: z.string().min(8).max(48) }),
    },
    async ({ change_id }) => guarded(async () => ok(await undoTextChange(env, userId(), sourceLabel(caller()), change_id))),
  );

  server.registerPrompt(
    "add_text",
    {
      title: "Add a text to my Lexicommons reading library",
      description: "Your AI adds a text to read: a book from your computer, something from the web, or one it writes for you.",
      argsSchema: z.object({ request: z.string().min(1).max(2000) }),
    },
    ({ request }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Add a text to my Lexicommons reading library: ${request}\n\n` +
              "Read get_text_guide first, and get_learner for my level. Upload the text with request_text_upload (and run its curl " +
              "command), draw a cover if it fits, then add_text. A few seconds later, check with get_text that it arrived on my " +
              "devices, and tell me what you added.",
          },
        },
      ],
    }),
  );
}
