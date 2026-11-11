// A LOCAL server's R2 buckets for a script, in its own process: wrangler's own miniflare, opened as `wrangler r2 object --local --persist-to`
// opens one (wrangler-dist usingLocalBucket: the state's v3 folder, the bucket by its name), never a wrangler process per object. Puts go
// through the same worker with the same options, so what's stored is exactly what `wrangler r2 object put --content-type` stores. Each bucket
// is opened the first time it's used and stays open until close() (or the process ends: miniflare stops its runtime then); an open one sees
// what other processes write at once (the check's own server, seed-local in another process). A put of the bytes and type already there writes
// nothing, but for the catalog, which is always written (its every write is a revision to the server). Local only: nothing here can reach a live bucket.
//
//   const r2 = localR2(APP, PERSIST);
//   await r2.getText("lexicommons-library", "catalogue.json")   // null when it isn't there
//   await r2.put("lexicommons-library", "catalogue.json", text, "application/json")
//   await r2.remove("lexicommons-library", "catalogue.json")
//   await r2.close()

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// wrangler's own put worker (usingLocalBucket), its error handling cut to the message.
const PUT_WORKER = `export default {
  async fetch(request, env) {
    try {
      if (request.method !== "PUT") return new Response(null, { status: 405 });
      const key = decodeURIComponent(new URL(request.url).pathname.substring(1));
      await env.BUCKET.put(key, request.body, JSON.parse(request.headers.get("Wrangler-R2-Put-Options")));
      return new Response(null, { status: 204 });
    } catch (e) {
      return Response.json({ message: e?.message ?? String(e) }, { status: 500 });
    }
  }
}`;

/** The R2 buckets of the local state at persistTo, as the app at `app` (its node_modules' wrangler) keeps them. */
export function localR2(app, persistTo) {
  const root = join(resolve(persistTo), "v3");
  let miniflare = null;
  const open = new Map(); // bucket name → Promise<{ mf, bucket }>
  const bucketOf = (name) => {
    if (!open.has(name))
      open.set(
        name,
        (async () => {
          if (!miniflare) {
            const fromWrangler = createRequire(createRequire(join(resolve(app), "package.json")).resolve("wrangler/package.json"));
            miniflare = await import(pathToFileURL(fromWrangler.resolve("miniflare")).href);
          }
          const mf = new miniflare.Miniflare(miniflare.convertV4MiniflareOptions({ modules: true, script: PUT_WORKER, resourcePersistencePath: root, r2Buckets: { BUCKET: name } }));
          return { mf, bucket: await mf.getR2Bucket("BUCKET") };
        })(),
      );
    return open.get(name);
  };
  return {
    /** The object's bytes, or null when it isn't there. */
    async get(name, key) {
      const object = await (await bucketOf(name)).bucket.get(key);
      return object === null ? null : Buffer.from(await object.arrayBuffer());
    },
    async getText(name, key) {
      return (await this.get(name, key))?.toString("utf8") ?? null;
    },
    /** Puts bytes (or text) at key with its content type, as `wrangler r2 object put --content-type` does; the same bytes and type already there stay. */
    async put(name, key, data, contentType) {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
      const { mf, bucket } = await bucketOf(name);
      const there = await bucket.head(key);
      // The catalog is always written: the server knows its revisions by R2's version of the object, which every write changes even with the
      // same bytes (library-admin.ts currentCatalogue), so a rewrite of it is a change wrangler's put makes and this must too. Anything else
      // the server reads by its bytes alone (an etag is their hash).
      if (key !== "catalogue.json" && there && there.size === bytes.length && there.httpMetadata?.contentType === contentType && there.etag === createHash("md5").update(bytes).digest("hex")) return;
      const options = { httpMetadata: { contentType, contentDisposition: undefined, contentEncoding: undefined, contentLanguage: undefined, cacheControl: undefined, cacheExpiry: undefined } };
      const response = await mf.dispatchFetch(`http://localhost/${encodeURIComponent(key)}`, { method: "PUT", body: bytes, headers: { "Content-Length": String(bytes.length), "Wrangler-R2-Put-Options": JSON.stringify(options) } });
      if (response.status !== 204) throw new Error(`local R2: couldn't write ${name}/${key}: ${(await response.json().catch(() => ({}))).message ?? response.status}`);
    },
    /** The bucket itself (miniflare's R2 binding), for what the calls here don't cover: a head, a listing. */
    async bucketFor(name) {
      return (await bucketOf(name)).bucket;
    },
    /** Removes it, as `wrangler r2 object delete` does (nothing there is fine). */
    async remove(name, key) {
      await (await bucketOf(name)).bucket.delete(key);
    },
    async close() {
      const all = [...open.values()];
      open.clear();
      for (const opening of all) await (await opening).mf.dispose();
    },
  };
}
