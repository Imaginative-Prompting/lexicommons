// Explore over MCP: your AI can find packs for you (search, an item's page), follow them for you, and share your packs
// (staged through a signed link like any file, never in a tool's arguments). Likes are the app's only. The sharing
// tools are listed only when sharing is open to the caller (COMMUNITY_SHARING, or an admin until then); an admin also
// curates Explore's sections and topics. The work is community.ts's.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LANGUAGE_CODE } from "../public/js/lang/index.js";
import { exploreHome, follow, getItem, LEVELS, listItems, listTopics, mine, PACK_LIMITS, SHARING_LICENCE, setSections, setTopics, sharePack, sharingOpenFor, unfollow, updateShared, withdrawShared } from "./community";
import type { CallerProps, Env } from "./env";
import { LibraryError } from "./library";
import { BOOK_LIMITS, decideSharedBook, followBook, getBook, listBooks, mineBooks, shareBook, unfollowBook, updateSharedBook, withdrawSharedBook } from "./community-books";
import { dropStaged, readStagedJson, stageFiles } from "./library-admin";
import { connectionReachesRoles, requireRole, type Role } from "./roles";

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
type Helpers = {
  caller: () => CallerProps & { clientName?: string };
  sourceLabel: (props: CallerProps & { clientName?: string }) => string;
  ok: (value: unknown) => ToolResult;
  guarded: (run: () => Promise<ToolResult>) => Promise<ToolResult>;
};

const sha = z.string().regex(/^[0-9a-f]{64}$/, "a sha256: 64 lowercase hex characters");
const itemId = z.string().min(2).max(48);
const bookId = z.string().min(2).max(80);
const metaInput = {
  title: z.string().min(1).max(80).optional(),
  about: z.string().max(400).optional(),
  level: z.enum(LEVELS).nullable().optional(),
  topics: z.array(z.string().max(30)).max(3).optional(),
};

/** Whether the tools that publish are listed for this caller: community.ts sharingOpenFor, on the roles this connection reaches. */
export const sharingListed = sharingOpenFor;

export function registerCommunityTools(server: McpServer, env: Env, roles: Set<Role>, { caller, sourceLabel, ok, guarded }: Helpers) {
  const me = () => caller().userId;

  server.registerTool(
    "explore_search",
    {
      title: "Find packs and books in Explore",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "Searches Explore, Lexicommons' shared library: packs of sentences others made and the library's own (items), and books people shared with their woven layers (books, each kind \"book\"). Filter by language (the one being learned, e.g. nl: a book in it, or one woven into it), level (A1–C2), topic (explore_search with no filters returns the topic list too), and q (words in the title, about, topics, a book's authors or who shared it); sort popular or new; kind pack or book for one of them (both by default). Each result says whether the person already follows it (a pack) or has it in their reading library (a book).",
      inputSchema: z.object({
        kind: z.enum(["pack", "book", "all"]).optional(),
        q: z.string().max(200).optional(),
        language: z.string().regex(LANGUAGE_CODE).optional(),
        level: z.enum(LEVELS).optional(),
        topic: z.string().max(30).optional(),
        sort: z.enum(["popular", "new"]).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    },
    async ({ kind = "all", ...input }) =>
      guarded(async () => {
        const packs = kind === "book" ? null : await listItems(env, me(), { ...input, kind: "pack" });
        const books = kind === "pack" ? null : await listBooks(env, me(), { q: input.q, learning: input.language, level: input.level, topic: input.topic, sort: input.sort, offset: input.offset });
        const filtered = Boolean(input.q || input.language || input.level || input.topic);
        return ok({
          ...(packs ? packs : {}),
          ...(books ? { books: books.books, ...(books.next !== undefined ? { nextBooks: books.next } : {}) } : {}),
          ...(filtered ? {} : { topics: await listTopics(env) }),
        });
      }),
  );

  server.registerTool(
    "explore_get",
    {
      title: "One pack or book in Explore",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "One pack's page (id): what it is, who shared it, its level, topics and counts, a sample of its sentences (with the literal line), and its versions with what each changed. Or one book's (book): its title and authors, where its text came from and its rights, the languages it's woven into, a sample of its sentences with each layer's line, and its versions.",
      inputSchema: z.object({ id: itemId.optional(), book: bookId.optional() }),
    },
    async ({ id, book }) =>
      guarded(async () => {
        if (Boolean(id) === Boolean(book)) throw new LibraryError("Give id (a pack) or book, one of them.");
        if (book) {
          const found = await getBook(env, book, me());
          if (!found) throw new LibraryError(`There's no book "${book}" in Explore.`);
          return ok(found);
        }
        const found = await getItem(env, id!, me());
        if (!found) throw new LibraryError(`There's no pack "${id}" in Explore.`);
        return ok(found);
      }),
  );

  server.registerTool(
    "follow",
    {
      title: "Follow a pack, or add a book",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      description:
        "Follows a pack in Explore for the person (id): their devices load it within minutes (the app at once, if open), it's on in their studying, and its author's fixes reach them. Or adds a book from Explore to their reading library (book): its text and woven layers reach their devices, and its new versions and layers after. unfollow stops either.",
      inputSchema: z.object({ id: itemId.optional(), book: bookId.optional() }),
    },
    async ({ id, book }) =>
      guarded(async () => {
        if (Boolean(id) === Boolean(book)) throw new LibraryError("Give id (a pack) or book, one of them.");
        if (book) return ok({ ...(await followBook(env, me(), book)), next: "It's in their reading library the next time the app syncs (on opening, or within ten minutes)." });
        return ok({ ...(await follow(env, me(), id!)), next: "Their app loads it the next time it syncs (on opening, or within ten minutes)." });
      }),
  );

  server.registerTool(
    "unfollow",
    {
      title: "Stop following a pack, or a book",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      description: "Stops following a pack (id): it leaves the person's devices at their next sync. What they learned from it stays. With book: its new versions stop coming (the copy in their reading library stays until they remove it there).",
      inputSchema: z.object({ id: itemId.optional(), book: bookId.optional() }),
    },
    async ({ id, book }) =>
      guarded(async () => {
        if (Boolean(id) === Boolean(book)) throw new LibraryError("Give id (a pack) or book, one of them.");
        return ok(book ? await unfollowBook(env, me(), book) : await unfollow(env, me(), id!));
      }),
  );

  if (sharingListed(env, roles)) {
    server.registerTool(
      "share_upload",
      {
        title: "Send a pack or a book to share",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        description: `A signed upload link for one file to share (JSON): a pack (the lexicommons-pack format, up to ${PACK_LIMITS.bytes} bytes) that share_pack or update_shared then publishes, or a book (lexicommons-book, up to ${BOOK_LIMITS.bookBytes} bytes) or one of its weave layers (lexicommons-weave, up to ${BOOK_LIMITS.layerBytes} bytes) that share_book or update_shared_book then publishes. Give its name, size in bytes and sha256 (shasum -a 256); run the curl the answer gives. Never paste a file into a tool call.`,
        inputSchema: z.object({ name: z.string().min(1).max(200), size: z.number().int().min(1).max(Math.max(PACK_LIMITS.bytes, BOOK_LIMITS.bookBytes)), sha256: sha }),
      },
      async ({ name, size, sha256 }) =>
        guarded(async () => {
          const props = caller();
          const staged = await stageFiles(env, props.userId, [{ name, type: "application/json", size, sha256 }], sourceLabel(props));
          return ok({ ...staged, after: staged.toSend ? `Run the script from the folder the name is relative to, then share_pack (or update_shared) with file: "${sha256}" (a book or a layer: share_book or update_shared_book with it). The link lasts an hour; the staged file a day.` : `It's already here: call share_pack (or update_shared) with file: "${sha256}" (a book or a layer: share_book or update_shared_book).` });
        }),
    );

    const readPack = async (file: string) => {
      const found = await readStagedJson(env, me(), file);
      if (!found) throw new LibraryError(`No staged pack with sha256 ${file.slice(0, 12)}…: send it with share_upload first (it stays a day).`);
      return found.value;
    };

    server.registerTool(
      "share_pack",
      {
        title: "Share a pack to Explore",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        description: `Shares one of the person's packs to Explore, live at once, under ${SHARING_LICENCE} (anyone may use, change and share it, crediting them, under the same license; their account name shows on it). Only for packs they made or may share. The person accepts the sharing terms once, in the app; if they haven't, this says where. file: the sha256 of the pack sent with share_upload. title and about default to the pack's own; level (A1–C2) and up to 3 topics (explore_search lists them) help people find it. It's checked like every pack, and refused if the same pack is already in Explore. Every problem comes back at once.`,
        inputSchema: z.object({ file: sha, ...metaInput, note: z.string().max(500).optional() }),
      },
      async ({ file, ...meta }) =>
        guarded(async () => {
          const props = caller();
          const result = await sharePack(env, { userId: props.userId, via: sourceLabel(props) }, { pack: await readPack(file), ...meta });
          if (result.shared) await dropStaged(env, props.userId, file);
          return ok(result);
        }),
    );

    server.registerTool(
      "update_shared",
      {
        title: "Share a new version",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        description:
          "Shares a new version of a pack of theirs in Explore (file: the new pack, sent with share_upload): its followers get it. The answer says what it added, changed and removed. A version that removes sentences people follow needs confirm_removed; one that undoes corrections accepted into the current version needs confirm_reverts (better: take them into the pack first, list_corrections all). Without file, it changes only the level and topics. my_shared lists their shared packs.",
        inputSchema: z.object({ id: itemId, file: sha.optional(), ...metaInput, note: z.string().max(500).optional(), confirm_removed: z.boolean().optional(), confirm_reverts: z.boolean().optional() }),
      },
      async ({ id, file, confirm_removed, confirm_reverts, ...meta }) =>
        guarded(async () => {
          const props = caller();
          // Another account's pack only for an admin over a connection that reaches admin (roles.ts), never a token made without it.
          const result = await updateShared(env, { userId: props.userId, via: sourceLabel(props), adminAccess: connectionReachesRoles(props) }, id, { ...(file ? { pack: await readPack(file) } : {}), ...meta, confirmRemoved: confirm_removed, confirmReverts: confirm_reverts });
          if (result.updated && file) await dropStaged(env, props.userId, file);
          return ok(result);
        }),
    );

    server.registerTool(
      "withdraw_shared",
      {
        title: "Take a pack out of Explore",
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        description: "Takes one of their shared packs out of Explore. Whoever follows it keeps the version they have (the license allows it), with no more updates.",
        inputSchema: z.object({ id: itemId }),
      },
      async ({ id }) => guarded(async () => ok(await withdrawShared(env, { userId: me(), adminAccess: connectionReachesRoles(caller()) }, id))),
    );

    server.registerTool(
      "my_shared",
      {
        title: "Their shared packs",
        annotations: { readOnlyHint: true, openWorldHint: false },
        description: "The packs the person has shared to Explore: each one's Explore id, the pack of theirs it came from (sourceId), its version, followers and likes.",
      },
      async () => guarded(async () => ok(await mine(env, me()))),
    );

    // Books (community-books.ts): a book and its woven layers, staged with share_upload like a pack.
    const readFile = async (file: string, what: string) => {
      const found = await readStagedJson(env, me(), file);
      if (!found) throw new LibraryError(`No staged ${what} with sha256 ${file.slice(0, 12)}…: send it with share_upload first (it stays a day).`);
      return found.value;
    };

    server.registerTool(
      "share_book",
      {
        title: "Share a book to Explore",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        description: `Shares a book to Explore with its woven layers, for the person: others add it to their reading library. book: the sha256 of the lexicommons-book file sent with share_upload; layers: the sha256 of each lexicommons-weave file for it (a weave or help layer, one per language). Its text must be in the public domain in both the US and the EU, or under CC0, CC BY or CC BY-SA with its credit recorded (rights), with where it came from (source.url); text and weaves only (a book with pictures is refused for now). Each layer is checked against the book and must pass the weave audit; it's shared as the person's own work under ${SHARING_LICENCE}. A book from a known open library (Project Gutenberg, Wikisource, StoryWeaver and the like) is in Explore at once; one from anywhere else waits for an admin to look at its source. The person accepts the sharing terms once, in the app. title defaults to the book's own; about, level and topics help people find it. Every problem comes back at once.`,
        inputSchema: z.object({ book: sha, layers: z.array(sha).max(BOOK_LIMITS.layers).optional(), ...metaInput, note: z.string().max(500).optional() }),
      },
      async ({ book, layers = [], ...meta }) =>
        guarded(async () => {
          const props = caller();
          const files = [book, ...layers];
          const result = await shareBook(env, { userId: props.userId, via: sourceLabel(props) }, { book: await readFile(book, "book"), layers: await Promise.all(layers.map((l) => readFile(l, "layer"))), ...meta });
          if (result.shared) for (const file of files) await dropStaged(env, props.userId, file);
          return ok(result);
        }),
    );

    server.registerTool(
      "update_shared_book",
      {
        title: "A new version of a shared book",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        description:
          "A new version of a book the person shared (id, from my_shared_books): layers (sha256s from share_upload) adds a woven layer, or puts a new one in place of the one into the same language; drop_layers takes layers off; book (a new lexicommons-book file) is a new text, and holds only the layers given with it. Whoever added it gets the new version. Without any of those, it changes only title, about, level or topics.",
        inputSchema: z.object({ id: bookId, book: sha.optional(), layers: z.array(sha).max(BOOK_LIMITS.layers).optional(), drop_layers: z.array(z.string().max(12)).max(BOOK_LIMITS.layers).optional(), ...metaInput, note: z.string().max(500).optional() }),
      },
      async ({ id, book, layers = [], drop_layers, ...meta }) =>
        guarded(async () => {
          const props = caller();
          const result = await updateSharedBook(env, { userId: props.userId, via: sourceLabel(props), adminAccess: connectionReachesRoles(props) }, id, {
            ...(book ? { book: await readFile(book, "book") } : {}),
            layers: await Promise.all(layers.map((l) => readFile(l, "layer"))),
            dropLayers: drop_layers,
            ...meta,
          });
          if (result.updated) for (const file of [...(book ? [book] : []), ...layers]) await dropStaged(env, props.userId, file);
          return ok(result);
        }),
    );

    server.registerTool(
      "withdraw_shared_book",
      {
        title: "Take a book out of Explore",
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        description: "Takes a book the person shared out of Explore (or one waiting for an admin). Whoever added it keeps the copy on their device, with no more versions.",
        inputSchema: z.object({ id: bookId }),
      },
      async ({ id }) => guarded(async () => ok(await withdrawSharedBook(env, { userId: me(), adminAccess: connectionReachesRoles(caller()) }, id))),
    );

    server.registerTool(
      "my_shared_books",
      {
        title: "Their shared books",
        annotations: { readOnlyHint: true, openWorldHint: false },
        description: "The books the person has shared to Explore: each one's Explore id, the book's own id (sourceId), its version, the languages it's woven into, its state (live, pending: waiting for an admin, hidden, withdrawn, removed, declined) and why, who added it and likes.",
      },
      async () => guarded(async () => ok(await mineBooks(env, me()))),
    );
  }

  if (roles.has("admin")) {
    server.registerTool(
      "decide_shared_book",
      {
        title: "Open or decline a shared book",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        description:
          "An admin's: a book shared from a source that isn't a known open library waits for this (mod_queue lists them under sharedBooks; mod_get { book } shows it, its rights and its source). Check at its source that the text may be shared as its rights say, then open it (it's in Explore at once) or decline it (its sharer sees why).",
        inputSchema: z.object({ id: bookId, decision: z.enum(["open", "decline"]), why: z.string().min(1).max(2000) }),
      },
      async ({ id, decision, why }) =>
        guarded(async () => {
          await requireRole(env, caller(), "admin");
          return ok(await decideSharedBook(env, { userId: me(), via: sourceLabel(caller()) }, id, { decision, why }));
        }),
    );

    server.registerTool(
      "explore_sections",
      {
        title: "Explore's featured sections",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        description: "Without sections: Explore's featured sections now. With sections ([{ title, items: [<item id>…] }], in order): sets them, replacing them all ([] takes them off). They show at the top of Explore, for the language being browsed.",
        inputSchema: z.object({ sections: z.array(z.object({ id: z.string().max(40).optional(), title: z.string().min(1).max(60), items: z.array(itemId).max(50) })).max(12).optional() }),
      },
      async ({ sections }) =>
        guarded(async () => {
          await requireRole(env, caller(), "admin");
          return ok(sections ? { sections: await setSections(env, me(), sections) } : await exploreHome(env, me()));
        }),
    );

    server.registerTool(
      "explore_topics",
      {
        title: "Explore's topics",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        description: "Without topics: the shared topic list items are tagged with. With topics ([{ id, name }], in order): sets the list; renaming keeps the id, and a topic an item uses can't be removed.",
        inputSchema: z.object({ topics: z.array(z.object({ id: z.string().min(1).max(30), name: z.string().min(1).max(40) })).max(60).optional() }),
      },
      async ({ topics }) =>
        guarded(async () => {
          await requireRole(env, caller(), "admin");
          return ok({ topics: topics ? await setTopics(env, topics) : await listTopics(env) });
        }),
    );
  }
}
