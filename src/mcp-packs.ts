// The MCP tools for the person's packs (registered by mcp.ts): their AI reads what they have, makes a pack or keeps
// adding to one, changes or takes out sentences, and undoes a change. Every change is checked before it's kept and
// then reaches each of their devices (src/packs.ts); the form the AI writes in is public/js/study/pack-authoring.js's.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CallerProps, Env } from "./env";
import { LANGUAGES, isOurLanguage, ourLanguages, ownLanguageProblem } from "../public/js/lang/index.js";
import { addItems, checkItems, createPack, editPack, getPack, listChanges, listPacks, removeItems, removePackAudio, requestPackAudioUpload, setPackAudio, undoChange, updateItems, PACK_RELAY, type Outcome } from "./packs";
import { packGuide } from "./pack-guide";
import { LibraryError } from "./library";
import { grammarNow, grammarReady } from "./grammar";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
type Helpers = {
  caller: () => CallerProps & { clientName?: string };
  sourceLabel: (props: CallerProps & { clientName?: string }) => string;
  ok: (value: unknown) => ToolResult;
  guarded: (run: () => Promise<ToolResult>) => Promise<ToolResult>;
};

const packId = z.string().min(2).max(48).describe("The pack's id (list_packs)");
// Lenient on purpose: a missing or malformed field comes back from the pack check with where it is and why, all at once.
const item = z
  .object({
    id: z.string().max(48).optional().describe("Kept for good; made from the sentence when left out (needed for update_items)"),
    sentence: z.string().max(600).optional().describe("As written, end punctuation included"),
    lemmas: z.record(z.string().max(60), z.union([z.string().max(60), z.array(z.string().max(60).nullable()).max(20)])).optional().describe('{ "word as written": "dictionary form" } for the words worth learning; a word written more than once, a list: each time\'s form, or null'),
    readings: z.record(z.string().max(60), z.union([z.string().max(120), z.array(z.string().max(120).nullable()).max(20)])).optional().describe('In a language that shows readings: { "word as written": "reading" } (Japanese "学生": "がくせい"; Russian "молоко": "молоко́"); a word written more than once and said differently, a list: each time\'s, or null'),
    literal: z.array(z.union([z.string().max(80), z.object({ text: z.string().max(80), moved: z.boolean().optional() })])).max(24).optional().describe('English chunks in the sentence\'s order; a moved chunk between asterisks: "*yesterday*"'),
    english: z.array(z.number().int().min(0)).max(24).nullable().optional().describe("literal's chunk indexes in English order, or null"),
    moved: z.array(z.string().max(60)).max(8).optional(),
    natural: z.string().max(600).optional().describe("The sentence in natural English"),
    wrong: z.array(z.string().max(600)).max(3).optional().describe("1 to 3 plausible wrong versions (Choose)"),
    gap: z.object({ word: z.string().max(60), options: z.array(z.union([z.string().max(60), z.object({ text: z.string().max(60), reading: z.string().max(120) })])).max(5), at: z.number().int().min(0).optional() }).optional().describe("The word to fill in, as written, among 2 to 5 options"),
    topic: z.string().max(48).optional(),
    patterns: z.array(z.string().max(89)).max(4).optional().describe("Pattern ids (get_learner's patterns, the shared grammar's, or the pack's own: its bare id, or <pack id>.<id> as get_pack shows it)"),
    chunks: z.array(z.string().max(48)).max(4).optional(),
  })
  .passthrough();
const items = z.array(item).min(1).max(PACK_RELAY.itemsPerChange);
const dictionaries = {
  topics: z.record(z.string().max(48), z.string().max(80).nullable()).optional().describe('{ id: name } ("travel": "Travel"); null takes one out'),
  words: z.record(z.string().max(48), z.string().max(80).nullable()).optional().describe("{ lemma: English gloss } for the words it teaches; null takes one out"),
  readings: z.record(z.string().max(48), z.string().max(120).nullable()).optional().describe('Japanese or Chinese: { lemma: reading } for each dictionary form with kanji or hanzi ("食べる": "たべる", "学生": "xué shēng"); null takes one out'),
  chunks: z.record(z.string().max(48), z.object({ text: z.string().max(120), en: z.string().max(120), about: z.string().max(400).optional() }).nullable()).optional().describe("Fixed phrases: { id: { text, en, about? } }"),
  patterns: z
    .record(z.string().max(89), z.object({ name: z.string().max(80), about: z.string().max(400), after: z.array(z.string().max(89)).max(8).optional(), same: z.string().max(40).optional() }).nullable())
    .optional()
    .describe("Grammar the shared grammar lacks: { id: { name, about, after?, same? } }. A new one is kept as <pack id>.<id>; same: the shared grammar's id, once it has the same pattern (their evidence is then one unit)"),
};

const NEXT = {
  queued: (devices: string[]) =>
    devices.length
      ? `On its way to their devices (${devices.join("; ")}). One that's open has it within seconds; list_pack_changes shows how each took it.`
      : "No device of theirs has opened Lexicommons since this came in: it reaches their app the next time it opens (it waits 7 days).",
  refused: "Nothing was kept. Fix every problem listed, then send it again (check_items checks without keeping anything).",
};

// A language Lexicommons doesn't list, as create_pack and check_items take it (lang/index.js ownLanguageProblem checks it in words).
const languageDef = z
  .object({
    name: z.string().min(1).max(40),
    direction: z.enum(["ltr", "rtl"]).optional(),
    written: z.enum(["spaces", "unspaced"]).optional(),
    case: z.enum(["lower", "any"]).optional(),
    ends: z.array(z.string().min(1).max(3)).max(4).optional(),
  })
  .strict()
  .optional()
  .describe("Only for a language Lexicommons doesn't list: its name, and how it's written (defaults: ltr, spaces, lower, no other sentence ends)");

export function registerPackTools(server: McpServer, env: Env, { caller, sourceLabel, ok, guarded }: Helpers) {
  const user = () => caller().userId;
  const failure = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }], isError: true });
  const outcome = (result: Outcome) =>
    result.ok
      ? ok({ change_id: result.changeId, pack_id: result.packId, did: result.said, sentences: result.items, ...(result.warnings.length ? { warnings: result.warnings } : {}), next: NEXT.queued(result.devices) })
      : failure({ errors: result.errors, ...(result.warnings.length ? { warnings: result.warnings } : {}), next: NEXT.refused });

  server.registerTool(
    "get_pack_guide",
    {
      title: "How to make study material",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "Read this once before making or changing the person's packs: what a pack and a sentence are, shaping one, the smallest sentence and a whole pack, every field and refusal, how a change reaches them and what they see. Give language (nl, es…) for that language's pattern ids, which every sentence is tagged with.",
      inputSchema: z.object({ language: z.string().min(2).max(32).optional().describe("The language the pack teaches: its pattern ids, with what each is, come at the end (a language Lexicommons doesn't list has none)") }),
    },
    async ({ language }) =>
      guarded(async () => {
        if (language === undefined) return ok(packGuide());
        if (!isOurLanguage(language)) {
          // A language of their own: no shared grammar, so no pattern ids; the guide's section on it says what to send.
          const problem = ownLanguageProblem(language, { name: "check" });
          if (problem && problem.at === "language") throw new LibraryError(`${problem.message} Lexicommons' own: ${ourLanguages().join(", ")}.`);
          return ok(packGuide());
        }
        // The language's grammar as the library has it now (what check_items and add_items check a sentence's patterns against).
        await grammarReady(env, language);
        const patterns = Object.fromEntries(
          Object.entries(grammarNow(language)?.patterns ?? {})
            .filter(([, p]) => !(p as { retired?: boolean }).retired)
            .map(([id, p]) => [id, { name: (p as { name: string }).name, about: (p as { about?: string }).about }]),
        );
        return ok(packGuide({ language, patterns }));
      }),
  );

  server.registerTool(
    "list_packs",
    {
      title: "List the person's packs",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "Their packs (each with its language, sentences, topics, and which devices have it and study it), Lexicommons' own and the ones they follow, their devices, and changes still on their way.",
    },
    async () => guarded(async () => ok(await listPacks(env, user()))),
  );

  server.registerTool(
    "get_pack",
    {
      title: "Read one of their packs",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "A pack of theirs in the form you write: its topics, words, phrases, patterns and sentences (100 at a time), as it will be once the changes on their way arrive.",
      inputSchema: z.object({ pack_id: packId, offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(200).optional() }),
    },
    async ({ pack_id, offset, limit }) => guarded(async () => ok(await getPack(env, user(), pack_id, { offset, limit }))),
  );

  server.registerTool(
    "check_items",
    {
      title: "Check sentences without keeping them",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "Checks sentences the way add_items and update_items would (an id the pack has is checked as a replacement), or create_pack for a new pack, and keeps nothing. Give pack_id for a pack of theirs, or language (nl, de…) for a new one, with any topics, words, phrases or patterns the sentences need. Every problem comes back at once.",
      inputSchema: z.object({ pack_id: packId.optional(), language: z.string().max(32).optional(), language_def: languageDef, items, ...dictionaries }),
    },
    async (input) => guarded(async () => ok(await checkItems(env, user(), input))),
  );

  server.registerTool(
    "create_pack",
    {
      title: "Make a new pack",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "A new pack of theirs, for something to study on its own (a trip). For more of what they're learning, add_items to the pack they have instead. Checked whole before it's kept; then it reaches each of their devices.",
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        about: z.string().max(400).optional().describe("A line on what it's for"),
        language: z.string().max(32).describe(`The language it teaches: ${ourLanguages().filter((code) => code !== "en").join(", ")}; or one Lexicommons doesn't list, with language_def (get_pack_guide: "A language Lexicommons doesn't list")`),
        language_def: languageDef,
        pack_id: z.string().max(48).optional().describe("Made from the name when left out"),
        items: z.array(item).max(PACK_RELAY.itemsPerChange).optional(),
        ...dictionaries,
      }),
    },
    async (input) => guarded(async () => outcome(await createPack(env, user(), sourceLabel(caller()), input))),
  );

  server.registerTool(
    "add_items",
    {
      title: "Add sentences to a pack",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description: `Adds sentences (up to ${PACK_RELAY.itemsPerChange}) at the end of a pack of theirs, with any topics, words, phrases or patterns they need. Checked with the whole pack before it's kept.`,
      inputSchema: z.object({ pack_id: packId, items, ...dictionaries }),
    },
    async (input) => guarded(async () => outcome(await addItems(env, user(), sourceLabel(caller()), input))),
  );

  server.registerTool(
    "update_items",
    {
      title: "Replace sentences in a pack",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description: "Replaces sentences of a pack of theirs whole, each named by its id (get_pack shows them in this form). Their progress on a sentence stays with its id.",
      inputSchema: z.object({ pack_id: packId, items, ...dictionaries }),
    },
    async (input) => guarded(async () => outcome(await updateItems(env, user(), sourceLabel(caller()), input))),
  );

  server.registerTool(
    "remove_items",
    {
      title: "Take sentences out of a pack",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      description: "Takes sentences out of a pack of theirs, by id. What they learned from them stays in their progress; undo_pack_change brings them back.",
      inputSchema: z.object({ pack_id: packId, ids: z.array(z.string().max(48)).min(1).max(PACK_RELAY.itemsPerChange) }),
    },
    async ({ pack_id, ids }) => guarded(async () => outcome(await removeItems(env, user(), sourceLabel(caller()), { pack_id, ids }))),
  );

  server.registerTool(
    "update_pack",
    {
      title: "Change a pack's details",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description: "A pack's name and its line, and its topics, words, phrases and patterns (merged; an id set to null is taken out, if no sentence uses it).",
      inputSchema: z.object({ pack_id: packId, name: z.string().min(1).max(80).optional(), about: z.string().max(400).nullable().optional(), ...dictionaries }),
    },
    async (input) => guarded(async () => outcome(await editPack(env, user(), sourceLabel(caller()), input))),
  );

  server.registerTool(
    "list_pack_changes",
    {
      title: "Recent changes to their packs",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "Recent changes (yours, and deletes and undos from the app), newest first: what each did, who made it, and how each device took it (applied, refused and why, or missing that pack).",
      inputSchema: z.object({ pack_id: packId.optional(), limit: z.number().int().min(1).max(100).optional() }),
    },
    async ({ pack_id, limit }) => guarded(async () => ok(await listChanges(env, user(), { packId: pack_id, limit }))),
  );

  server.registerTool(
    "undo_pack_change",
    {
      title: "Undo a change to a pack",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description: "Puts a pack back as it was before a change, on each of their devices. The latest change to a pack comes first, so undo walks back one change at a time.",
      inputSchema: z.object({ change_id: z.string().max(60) }),
    },
    async ({ change_id }) => guarded(async () => outcome(await undoChange(env, user(), sourceLabel(caller()), change_id))),
  );

  // Recordings your AI makes for a pack of theirs: each clip uploaded (it never travels in a tool's arguments), then
  // set_pack_audio says which is which, merged into what the pack has. The server holds them only until every device
  // of theirs has them.
  server.registerTool(
    "request_pack_audio_upload",
    {
      title: "A link to upload a recording for a pack",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "A signed link to upload one recording (a sentence or a word of a pack of theirs, read aloud in the pack's language) as an MP3 or an MP4's audio, up to 2 MB. PUT it within 15 minutes (its curl command does), once per clip, then set_pack_audio with the upload_ids (within a day: a recording no set_pack_audio uses goes after that).",
      inputSchema: z.object({ pack_id: packId, format: z.enum(["mp3", "m4a"]), filename: z.string().min(1).max(120) }),
    },
    async ({ pack_id, format, filename }) =>
      guarded(async () => {
        const ticket = await requestPackAudioUpload(env, user(), sourceLabel(caller()), { pack_id, format, filename });
        return ok({ pack_id, upload_id: ticket.id, upload_url: ticket.uploadUrl, method: ticket.method, content_type: ticket.contentType, max_bytes: ticket.maxBytes, expires: new Date(ticket.expiresAt).toISOString(), curl: ticket.curl, next: "Send the clip with the curl command; when every clip is sent, set_pack_audio." });
      }),
  );

  const timing = z.tuple([z.number().min(0), z.number().min(0)]);
  server.registerTool(
    "set_pack_audio",
    {
      title: "Give a pack its recordings",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      description:
        `Gives a pack of theirs recorded voices on every device of theirs, merged into the recordings it has (get_pack lists them): per voice, its name and locale (both needed for a new voice), the clip for each sentence it reads (the clip's length in seconds and each word's [start, end] in seconds, in order, as many as the sentence has words) and for each word it says on its own. null takes a sentence's or a word's recording away, or a whole voice. Up to ${PACK_RELAY.clipsPerChange} recordings a call: record a big pack in parts. Each clip's bytes are checked; a sentence no voice reads is read by the device's own voice, and a sentence whose words change loses its recordings. Checked against the pack as it will be: every problem is said at once, and nothing is kept unless it all fits. undo_pack_change puts back the recordings it had.`,
      inputSchema: z.object({
        pack_id: packId,
        voices: z
          .record(
            z.string().max(40).describe("The voice's slug (emma)"),
            z
              .object({
                name: z.string().min(1).max(60).optional(),
                about: z.string().max(200).nullable().optional(),
                locale: z.string().max(20).optional().describe("The voice's BCP 47 tag, in the pack's language (nl-NL)"),
                license: z.string().max(120).nullable().optional(),
                credit: z.string().max(200).nullable().optional(),
                items: z
                  .record(z.string().max(48), z.object({ upload_id: z.string().max(40), seconds: z.number().positive(), words: z.array(timing).max(60) }).nullable())
                  .optional()
                  .describe("{ sentence id: its recording, or null to take it away }"),
                words: z.record(z.string().max(48), z.object({ upload_id: z.string().max(40), seconds: z.number().positive() }).nullable()).optional().describe("{ lemma: its recording, or null }"),
              })
              .nullable(),
          )
          .describe("{ slug (lowercase, like emma): voice, or null to take that voice away }, up to 8 voices on a pack"),
      }),
    },
    async (input) => guarded(async () => ok(await setPackAudio(env, user(), sourceLabel(caller()), input))),
  );

  server.registerTool(
    "remove_pack_audio",
    {
      title: "Take a pack's recordings away",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      description: "Takes all of a pack of theirs's recordings away on every device of theirs (the device's own voice reads it again). undo_pack_change puts them back.",
      inputSchema: z.object({ pack_id: packId }),
    },
    async ({ pack_id }) => guarded(async () => ok(await removePackAudio(env, user(), sourceLabel(caller()), { pack_id }))),
  );
}
