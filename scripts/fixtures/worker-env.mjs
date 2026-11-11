// The Worker's server code in Node, for the relay tests (test-text-relay.mjs, test-pack-relay.mjs): its TypeScript
// loaded through Node's own transform (its imports have no extension: wrangler's bundler adds it), D1 as SQLite on the
// real migrations, R2 buckets in memory, and faults on cue:
//   faults.failing   a regex: a statement matching it fails, as D1 can
//   faults.between   { pattern, run }: run once, right after the first statement matching pattern, or after the whole
//                    batch it's in (a D1 batch is atomic: nothing gets between its statements), as another request would
//   faults.deletes   true: R2 deletes fail
// The buckets answer as R2 does where the code reads it: an etag and a version on every object, head, and a conditional put
// (If-None-Match: *, or { etagMatches }) answering null when it fails, so the catalog's compare-and-set (library-admin.ts) runs here. A
// write with RETURNING answers its rows. A compound SELECT of more than five terms is refused, as D1 refuses it (SQLITE_MAX_COMPOUND_SELECT;
// SQLite's own default is 500, and node:sqlite can't lower it).
// Import this module before the Worker's: `const { env, ... } = await workerEnv()`, then `await import(".../src/x.ts")`.

import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, next) {
    // Extensionless, as the Worker's imports are (a name like weave-rules.generated is still one).
    if (/^\.\.?\//.test(specifier) && !/\.(m?js|ts|json)$/.test(specifier)) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {}
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith(".ts")) return next(url, context);
    return { format: "module", source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "transform", sourceUrl: url }), shortCircuit: true };
  },
});

export const APP = join(dirname(fileURLToPath(import.meta.url)), "../..");

const plain = (row) => (row ? { ...row } : null);

/** D1's limit on a compound SELECT's terms (SQLite's default is 500): the moderator's queue of six once passed here and failed on D1. */
export const D1_COMPOUND_TERMS = 5;
/** The most terms any one compound SELECT in a statement has: UNION (ALL), INTERSECT and EXCEPT counted at each depth, quotes skipped. */
export function compoundTerms(sql) {
  const depth = [0];
  let most = 0;
  let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") quote = c;
    else if (c === "(") depth.push(0);
    else if (c === ")") most = Math.max(most, depth.pop() ?? 0);
    else if (/[A-Za-z]/.test(c) && (i === 0 || !/\w/.test(sql[i - 1]))) {
      const word = /^(UNION|INTERSECT|EXCEPT)\b/i.exec(sql.slice(i, i + 10));
      if (word) {
        depth[depth.length - 1]++;
        i += word[0].length - 1;
      }
    }
  }
  return Math.max(most, ...depth) + 1;
}

/** A bucket in memory: put (If-None-Match: * honored), get, delete. */
function bucket(faults) {
  const objects = new Map();
  let writes = 0;
  // As R2 answers: each object an etag (here, of its bytes) and a version (a fresh one every write, as R2's are), and a conditional put
  // (If-None-Match: * or { etagMatches }) that writes nothing and answers null when its condition fails.
  const etagOf = (bytes) => createHash("md5").update(bytes).digest("hex");
  return {
    objects,
    async put(key, body, { httpMetadata, onlyIf } = {}) {
      const held = objects.get(key);
      if (onlyIf instanceof Headers && onlyIf.get("If-None-Match") === "*" && held) return null;
      if (onlyIf && !(onlyIf instanceof Headers) && onlyIf.etagMatches !== undefined && held?.etag !== onlyIf.etagMatches) return null;
      const bytes = typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body);
      const object = { bytes, httpMetadata, etag: etagOf(bytes), version: `v${++writes}` };
      objects.set(key, object);
      return { key, etag: object.etag, version: object.version, size: bytes.byteLength };
    },
    async get(key) {
      const object = objects.get(key);
      return object
        ? {
            arrayBuffer: async () => object.bytes.slice().buffer,
            text: async () => new TextDecoder().decode(object.bytes),
            get body() {
              return new Blob([object.bytes]).stream();
            },
            httpMetadata: object.httpMetadata,
            size: object.bytes.byteLength,
            etag: object.etag,
            version: object.version,
          }
        : null;
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { key, httpMetadata: object.httpMetadata, size: object.bytes.byteLength, etag: object.etag, version: object.version } : null;
    },
    async delete(keys) {
      if (faults.deletes) throw new Error("R2 is down for a moment");
      for (const key of [keys].flat()) objects.delete(key);
    },
  };
}

/** A fresh environment: { env: { DB, UPLOADS, LIBRARY }, sqlite, faults, row, rows, reset }. */
export function workerEnv() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(join(APP, "migrations")).filter((f) => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(join(APP, "migrations", file), "utf8"));
  const faults = { failing: null, between: null, deletes: false };
  const check = (sql) => {
    if (faults.failing?.test(sql)) throw new Error("D1 is busy for a moment");
    if (compoundTerms(sql) > D1_COMPOUND_TERMS) throw new Error("D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR");
  };
  let inBatch = false;
  let afterBatch = null;
  const after = (sql, out) => {
    if (faults.between?.pattern.test(sql)) {
      const { run } = faults.between;
      faults.between = null;
      if (inBatch) afterBatch = run;
      else run();
    }
    return out;
  };
  function statement(sql, args = []) {
    const reads = /^\s*(SELECT|WITH)\b/i.test(sql);
    const runNow = () => {
      check(sql);
      // A write with RETURNING answers its rows, as D1's does (and its changes are as many).
      if (/\bRETURNING\b/i.test(sql)) {
        const returned = sqlite.prepare(sql).all(...args).map(plain);
        return after(sql, { results: returned, success: true, meta: { changes: returned.length } });
      }
      const out = sqlite.prepare(sql).run(...args);
      return after(sql, { results: [], success: true, meta: { changes: Number(out.changes), last_row_id: Number(out.lastInsertRowid) } });
    };
    const now = () => (check(sql), reads ? after(sql, { results: sqlite.prepare(sql).all(...args).map(plain), success: true, meta: { changes: 0 } }) : runNow());
    return {
      bind: (...values) => statement(sql, values),
      first: async () => (check(sql), after(sql, plain(sqlite.prepare(sql).get(...args)))),
      all: async () => (check(sql), after(sql, { results: sqlite.prepare(sql).all(...args).map(plain), success: true, meta: {} })),
      run: async () => runNow(),
      now,
    };
  }
  const DB = {
    prepare: (sql) => statement(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      inBatch = true;
      try {
        const out = statements.map((s) => s.now());
        sqlite.exec("COMMIT");
        return out;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      } finally {
        inBatch = false;
        const run = afterBatch;
        afterBatch = null;
        await run?.();
      }
    },
  };
  const env = { DB, UPLOADS: bucket(faults), LIBRARY: bucket(faults) };
  return {
    env,
    sqlite,
    faults,
    row: (sql, ...args) => plain(sqlite.prepare(sql).get(...args)),
    rows: (sql, ...args) => sqlite.prepare(sql).all(...args).map(plain),
    /** Puts every fault back (each test's end). */
    reset: () => Object.assign(faults, { failing: null, between: null, deletes: false }),
  };
}
