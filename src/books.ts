// The open library's files: open books, their weaves and the word-frequency lists, shared content hosted in its own
// bucket (LIBRARY), apart from anything a person uploads. Read-only here: files get there through the books pipeline's
// publish step.
//
//   /library/catalogue.json                              what's on the shelf (lexicommons-catalogue), never cached
//   /library/books/<id>/<version>/book.json              a book (lexicommons-book); its version is its content hash
//   /library/books/<id>/<version>/<kind>.<lang>.<h>.json a weave or help layer; <h> is a hash of the file itself
//   /library/pictures/<h>.<ext>                          a picture book's picture (jpg, png or webp), named by its own
//                                                        hash, so books and their versions share it
//   /library/lists/frequency.<lang>.<h>.json             a language's word-frequency list (lexicommons-frequency)
//   /library/packs/<id>/<version>/pack.json              a public pack (lexicommons-pack); its version is its content hash
//                                                        (study/pack-format.js packVersion), so it's served immutable
//   /library/packs/<id>/<version>/audio.<h>.json         that pack version's recorded audio (lexicommons-audio); <h> is
//                                                        the manifest's own hash (study/pack-audio.js audioVersion)
//   /library/grammar/<lang>/<version>.json               a language's shared grammar at a revision (lexicommons-grammar,
//                                                        public/js/lang/grammar.js); its version is its content hash
//   /library/translate/<h>.<bin|spm>                     a file of the full translator (public/js/translate/models.js:
//                                                        Mozilla's models, MPL-2.0), named by the first 16 hex of its sha256
//   /library/audio/<h>.<ext>                             a recording (mp3 or m4a), named by its own hash, so every pack
//                                                        and voice that uses it shares it; served in byte ranges, which
//                                                        an iPhone needs to play it
//
// Every file but the catalog is named by its content, so it's served immutable.

import type { Env } from "./env";
import { downBinds, downSql } from "./moderation";
import { FILE_CSP } from "./util";

const KEY = /^(catalogue\.json|translate\/[0-9a-f]{16}\.(?:bin|spm)|books\/[a-z0-9][a-z0-9-]{1,79}\/[0-9a-f]{16}\/(?:book|(?:weave|help|parallel|defs)\.[a-z]{2,3}(?:-[A-Z][a-z]{3})?\.[0-9a-f]{12})\.json|pictures\/[0-9a-f]{16}\.(?:jpg|png|webp)|notes\/[a-z0-9][a-z0-9-]{1,47}\/[0-9a-f]{12}\.json|forms\/[a-z]{2,3}(?:-[A-Z][a-z]{3})?\/[0-9a-f]{12}\.json|lists\/frequency\.[a-z]{2,3}(?:-[A-Z][a-z]{3})?\.[0-9a-f]{12}\.json|packs\/[a-z0-9][a-z0-9-]{1,47}\/[0-9a-f]{12}\/(?:pack|audio\.[0-9a-f]{12})\.json|grammar\/[a-z]{2,3}(?:-[A-Z][a-z]{3})?\/(?:more\.)?[0-9a-f]{12}\.json|audio\/[0-9a-f]{16}\.(?:mp3|m4a))$/;
const TYPES: Record<string, string> = { bin: "application/octet-stream", spm: "application/octet-stream", json: "application/json; charset=utf-8", jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp3: "audio/mpeg", m4a: "audio/mp4" };

export async function serveLibrary(request: Request, env: Env, path: string): Promise<Response> {
  const key = path.replace(/^\/library\//, "");
  if (!KEY.test(key)) return new Response("Not found", { status: 404 });
  // A pack shared in Explore (not one of the library's own) is served only while it's up (live, or withdrawn with no
  // report taking it down), and cached privately for a day rather than for good, so a takedown reaches every cache
  // within a day (community.ts, moderation.ts).
  let cache = key === "catalogue.json" ? "no-cache" : "public, max-age=31536000, immutable";
  const pack = /^packs\/([a-z0-9][a-z0-9-]{1,47})\/([0-9a-f]{12})\//.exec(key);
  if (pack) {
    // A community pack's file is served only with its version on record: a version in D1 is what makes it reportable.
    // A file is written before its records, so one whose records never came (a share refused at its limit) is never
    // served. With no item at all, it's served only if the catalog lists it (as a pack or its audio): one of the
    // library's own packs not indexed in Explore yet (seed-local.mjs).
    const item = await env.DB.prepare(
      `SELECT curated, state, CASE WHEN state = 'withdrawn' THEN ${downSql("items.id")} ELSE 0 END AS down,
         EXISTS (SELECT 1 FROM item_versions WHERE item_id = items.id AND version = ?) AS recorded FROM items WHERE id = ?`,
    )
      .bind(...downBinds("items.id"), pack[2], pack[1])
      .first<{ curated: number; state: string; down: number; recorded: number }>();
    if (!item) {
      const catalogue = await env.LIBRARY.get("catalogue.json");
      const lists = catalogue ? Object.values(((await catalogue.json()) as { packs?: Record<string, unknown> }).packs ?? {}) : [];
      const url = `/library/${key}`;
      const listed = lists.some((list) => Array.isArray(list) && list.some((entry) => (entry as { url?: unknown })?.url === url || (entry as { audio?: unknown })?.audio === url));
      if (!listed) return new Response("Not found", { status: 404 });
    }
    if (item && !item.curated) {
      if (item.state === "hidden" || item.state === "removed" || item.down || !item.recorded) return new Response("Not found", { status: 404 });
      cache = "private, max-age=86400";
    }
  }
  // A recording is asked for in byte ranges (the media player's Range header); everything else whole.
  const ranged = key.startsWith("audio/") && request.headers.has("Range");
  const object = await env.LIBRARY.get(key, { onlyIf: request.headers, ...(ranged ? { range: request.headers } : {}) });
  // A library nothing's been published to yet (a fresh local server) has an empty shelf, not a missing one.
  if (!object && key === "catalogue.json") {
    return new Response(JSON.stringify({ format: "lexicommons-catalogue", v: 1, books: [], lists: {} }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": FILE_CSP },
    });
  }
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": TYPES[key.slice(key.lastIndexOf(".") + 1)]!,
    ETag: object.httpEtag,
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
    // Shared packs are people's own JSON: like every stored file, nothing in one may run, even opened directly.
    "Content-Security-Policy": FILE_CSP,
  });
  if (key.startsWith("audio/")) headers.set("Accept-Ranges", "bytes");
  // A conditional request that matched: R2 returns the metadata without a body.
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  if (ranged && object.range) {
    // { offset, length? }, { offset?, length } or { suffix } (the last n bytes).
    const range = object.range as { offset?: number; length?: number; suffix?: number };
    const offset = range.suffix !== undefined ? Math.max(0, object.size - range.suffix) : (range.offset ?? 0);
    const length = range.suffix !== undefined ? object.size - offset : (range.length ?? object.size - offset);
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}
