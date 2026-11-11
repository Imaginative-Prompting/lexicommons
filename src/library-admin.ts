// The open library, managed through MCP and the REST API by an admin: files are staged through signed links (never in
// a tool's arguments), checked with the same code the books pipeline runs (book-format.js, weave-audit.js,
// catalogue.js), and published into the LIBRARY bucket with one compare-and-set on the catalog. Every catalog
// change is a revision in D1 (library_revisions), so any one can be restored, and every action is in the admin log.
// Callers check the role first (roles.ts requireRole); nothing here does.
//
// Staged files: UPLOADS staging/<user>/<id>, declared by name, type, size and sha256 before they're sent; the upload
// must match all of them (a recording's bytes must also be an MP3 or MP4 audio file). A file the library already has
// (by its hash) is never staged or sent again.

import { sentencesOf } from "../public/js/study/pack-items.js";
import { upgradePack } from "../public/js/study/pack-format.js";
import { picturePath, rightsProblems, validateBook, validateFrequency, validateWeave as validateWeaveJs } from "../public/js/read/book-format.js";
import { bookPrefix, catalogueProblems, emptyCatalogue, layerEntry, layerKey, listEntry, listKey, without, withBook, withList, withShelf } from "../public/js/read/catalogue.js";
import { auditWeave as auditWeaveJs } from "../public/js/read/weave-audit.js";
import { LANGUAGE_CODE } from "../public/js/lang/index.js";
import {
  catalogueEntry,
  checkPack as checkPackJs,
  compareVersions as compareVersionsJs,
  defaultInstalled as defaultInstalledJs,
  packKey,
  packRefs as packRefsJs,
  packText,
  packVersion as packVersionJs,
  withoutPack,
  withPackEntry,
} from "../public/js/study/pack-format.js";
import { LANGUAGES } from "../public/js/lang/index.js";
import { audioKey, audioText, audioUrl, audioVersion, checkAudio as checkAudioJs, clipKey, clipsOf, fitAudio as fitAudioJs, unchangedItems } from "../public/js/study/pack-audio.js";
import { checkForms as checkFormsJs, checkNotes as checkNotesJs, formLines as formLinesJs, formsKey as formsKeyJs, formsRef as formsRefJs, formsUrl as formsUrlJs, notesKey as notesKeyJs, notesRef as notesRefJs, notesText as notesTextJs, notesUrl as notesUrlJs, withFormsEntry as withFormsEntryJs, withNotesEntry as withNotesEntryJs, withoutNotes as withoutNotesJs } from "../public/js/study/pack-notes.js";
import { soundsRight } from "./audio-bytes";
import { checkGrammar, grammarKey, grammarReady, grammarRef, grammarVersion, type Grammar } from "./grammar";
import {
  grammarChanges as grammarChangesJs,
  grammarEntry as grammarEntryJs,
  grammarText as grammarTextJs,
  checkGrammarMore as checkGrammarMoreJs,
  moreKey as moreKeyJs,
  moreRef as moreRefJs,
  newerGrammar as newerGrammarJs,
  seedGrammar as seedGrammarJs,
  withGrammarEntry as withGrammarEntryJs,
} from "../public/js/lang/grammar.js";
import { syncLibraryIndex, undoneCorrections, type Pack, type PackRef } from "./community";
import type { Env } from "./env";
import { LibraryError } from "./library";
import { adminLogStatement, type AdminLogInput } from "./roles";
import { hmacHex, randomId, readBytesLimited, secretsEqual, sha256Hex } from "./util";

export const STAGE_TYPES: Record<string, { maxBytes: number; ext?: string }> = {
  "application/json": { maxBytes: 16 * 1024 * 1024 },
  "image/jpeg": { maxBytes: 8 * 1024 * 1024, ext: "jpg" },
  "image/png": { maxBytes: 8 * 1024 * 1024, ext: "png" },
  "image/webp": { maxBytes: 8 * 1024 * 1024, ext: "webp" },
  // A pack's recordings (pack-audio.js): a sentence or a word, a few seconds each.
  "audio/mpeg": { maxBytes: 4 * 1024 * 1024, ext: "mp3" },
  "audio/mp4": { maxBytes: 4 * 1024 * 1024, ext: "m4a" },
};

/** A type staging takes: one of STAGE_TYPES' own (never one an object inherits: "constructor", "toString"; 6 Nov 2026, Codex C9). */
const stageType = (type: unknown) => (typeof type === "string" && Object.hasOwn(STAGE_TYPES, type) ? STAGE_TYPES[type] : undefined);

/** A file the library pools by the hash its name carries: a picture at pictures/, a recording at audio/. */
const pooledKey = (type: string, sha256: string) => {
  const ext = stageType(type)?.ext;
  if (!ext) return null;
  const name = `${sha256.slice(0, 16)}.${ext}`;
  return type.startsWith("audio/") ? clipKey(name) : picturePath(name);
};

const STAGE_LINK_MS = 60 * 60 * 1000;
const STAGE_KEEP_MS = 24 * 60 * 60 * 1000;
const STAGE_FILES_PER_CALL = 500;
const STAGED_PER_USER = 2000;
const REVISIONS_KEPT = 100;
const SHA256 = /^[0-9a-f]{64}$/;
const FILE_NAME = /^[A-Za-z0-9._-][A-Za-z0-9._/-]{0,199}$/;
const LIBRARY_BOOK = /^([a-z0-9][a-z0-9-]{1,79})@([0-9a-f]{16})$/;

// The contract's checks, typed as they're called here (they're plain JS).
interface AuditReport {
  ok: boolean;
  invariants: Record<"known-but-silent" | "unknown-shown" | "doubled", number>;
  banks: Record<string, { lemmas: number; shownInTarget: number; sentencesFullyKnown: number }>;
  findings: Record<string, { count: number; samples: unknown[] }>;
}
const checkPack = checkPackJs as unknown as (value: unknown, options: { installed: unknown[] }) => { pack: Pack | null; errors: Problem[]; warnings: Problem[] };
const packVersion = packVersionJs as unknown as (pack: Pack) => Promise<string>;
const compareVersions = compareVersionsJs as unknown as (previous: Pack, next: Pack) => { added: string[]; removed: string[]; changed: string[]; kept: string[] };
const packRefs = packRefsJs as unknown as (catalogue: unknown, language: string) => (PackRef & { url: string; audio?: string; optIn?: true; suggest?: true })[];
const checkAudio = checkAudioJs as unknown as (value: unknown, pack: unknown, options: { forLibrary: boolean }) => { audio: Audio | null; errors: Problem[]; warnings: Problem[] };
const fitAudio = fitAudioJs as unknown as (value: unknown, pack: unknown, options: { still?: Set<string> | null; forLibrary?: boolean }) => Audio | null;
interface Audio {
  pack: string;
  voices: Record<string, { name: string; license?: string; credit?: string; items?: Record<string, unknown>; words?: Record<string, unknown> }>;
}
const defaultInstalled = defaultInstalledJs as unknown as (catalogue: unknown, language: string, fetchPack: (ref: PackRef) => Promise<unknown>, exceptId?: string) => Promise<unknown[]>;
const seedGrammar = seedGrammarJs as unknown as (lang: string) => Grammar | null;
const grammarText = grammarTextJs as unknown as (grammar: Grammar) => string;
const grammarEntry = grammarEntryJs as unknown as (grammar: Grammar, version: string) => { revision: number; version: string; url: string; patterns: number };
const withGrammarEntry = withGrammarEntryJs as unknown as (catalogue: unknown, lang: string, entry: unknown) => Catalogue;
const grammarChanges = grammarChangesJs as unknown as (before: Grammar, next: Grammar) => { added: string[]; changed: string[]; readings?: true; retired: string[]; restored: string[] };
const newerGrammar = newerGrammarJs as unknown as (current: unknown, restored: unknown) => Record<string, unknown>;
const validateWeave = validateWeaveJs as unknown as (weave: unknown, book: unknown, options: { keep: string[] }) => Promise<string[]>;
const auditWeave = auditWeaveJs as unknown as (book: unknown, weave: unknown, options: { keep: string[] }) => Promise<{ report: AuditReport; problems: string[] }>;

export interface Problem {
  at: string;
  message: string;
}

// ---------- staging ----------

export interface StageRequest {
  name: string;
  type: string;
  size: number;
  sha256: string;
}

export interface StageAnswer {
  name: string;
  sha256: string;
  status: "upload" | "staged" | "in-library";
  id?: string;
  url?: string;
  linkExpiresAt?: string;
}

const stageMessage = (id: string, expiresAt: number) => `stage.${id}.${expiresAt}`;
const quote = (value: string) => `'${value.replace(/'/g, "")}'`;

/** Drops this account's expired staged files (rows and bytes). */
async function sweepStaged(env: Env, userId: string): Promise<void> {
  const expired = await env.DB.prepare("SELECT id, r2_key FROM staged_files WHERE user_id = ? AND expires_at < ?").bind(userId, Date.now()).all<{ id: string; r2_key: string | null }>();
  if (!expired.results.length) return;
  const keys = expired.results.flatMap((r) => (r.r2_key ? [r.r2_key] : []));
  for (let i = 0; i < keys.length; i += 1000) await env.UPLOADS.delete(keys.slice(i, i + 1000));
  await env.DB.batch(expired.results.map((r) => env.DB.prepare("DELETE FROM staged_files WHERE id = ?").bind(r.id)));
}

/**
 * The cron's sweep of staged files past their day, every account's (6 Nov 2026, Codex C8: each account's were swept only when it staged
 * again, so an account that never did kept its rows and R2 bytes for good). At most `limit` a run, the oldest first; returns how many.
 */
export async function sweepExpiredStaged(env: Env, now = Date.now(), limit = 500): Promise<number> {
  const expired = await env.DB.prepare("SELECT id, r2_key FROM staged_files WHERE expires_at < ? ORDER BY expires_at LIMIT ?").bind(now, limit).all<{ id: string; r2_key: string | null }>();
  if (!expired.results.length) return 0;
  const keys = expired.results.flatMap((r) => (r.r2_key ? [r.r2_key] : []));
  for (let i = 0; i < keys.length; i += 1000) await env.UPLOADS.delete(keys.slice(i, i + 1000));
  await env.DB.batch(expired.results.map((r) => env.DB.prepare("DELETE FROM staged_files WHERE id = ? AND expires_at < ?").bind(r.id, now)));
  return expired.results.length;
}

/** Whether the library already holds these bytes: a file the admin tools put there, or a picture or recording under its hash name. */
async function inLibrary(env: Env, file: StageRequest): Promise<boolean> {
  if (await env.DB.prepare("SELECT 1 AS y FROM library_files WHERE sha256 = ?").bind(file.sha256).first()) return true;
  const key = pooledKey(file.type, file.sha256);
  if (key && (await env.LIBRARY.head(key))) return true;
  return false;
}

/**
 * Signed links for the files an admin is about to publish. Returns each file's status (upload: send it with its link;
 * staged: already here; in-library: the library has it) and one shell script that sends every file still to send,
 * run from the folder the names are relative to.
 */
export async function stageFiles(env: Env, userId: string, files: StageRequest[], source: string): Promise<{ files: StageAnswer[]; toSend: number; script: string; after: string }> {
  if (!files.length) throw new LibraryError("List the files to stage: name, type, size and sha256 for each.");
  if (files.length > STAGE_FILES_PER_CALL) throw new LibraryError(`Stage at most ${STAGE_FILES_PER_CALL} files at a time.`);
  const problems: string[] = [];
  files.forEach((f, n) => {
    if (!FILE_NAME.test(f.name) || f.name.includes("..")) problems.push(`files[${n}].name: letters, digits, dots, dashes, underscores and slashes only (a path relative to where the script runs).`);
    const kind = stageType(f.type);
    if (!kind) problems.push(`files[${n}].type must be one of ${Object.keys(STAGE_TYPES).join(", ")}.`);
    else if (!Number.isInteger(f.size) || f.size < 1 || f.size > kind.maxBytes) problems.push(`files[${n}].size must be the file's size in bytes, at most ${kind.maxBytes} for ${f.type}.`);
    if (!SHA256.test(f.sha256)) problems.push(`files[${n}].sha256 must be the 64 hex characters of the file's SHA-256.`);
  });
  if (problems.length) throw new LibraryError(problems.join("\n"));
  await sweepStaged(env, userId);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM staged_files WHERE user_id = ?").bind(userId).first<{ n: number }>();
  if ((count?.n ?? 0) + files.length > STAGED_PER_USER) throw new LibraryError(`At most ${STAGED_PER_USER} files can be staged at once; publish or wait for the older ones to expire (a day).`);
  const now = Date.now();
  const answers: StageAnswer[] = [];
  const inserts: D1PreparedStatement[] = [];
  const made: string[] = [];
  const seen = new Map<string, StageAnswer>();
  for (const file of files) {
    const twin = seen.get(file.sha256);
    if (twin) {
      answers.push({ ...twin, name: file.name });
      continue;
    }
    let answer: StageAnswer;
    const staged = await env.DB.prepare("SELECT id FROM staged_files WHERE user_id = ? AND sha256 = ? AND status = 'stored' AND expires_at > ?").bind(userId, file.sha256, now).first<{ id: string }>();
    if (await inLibrary(env, file)) answer = { name: file.name, sha256: file.sha256, status: "in-library" };
    else if (staged) answer = { name: file.name, sha256: file.sha256, status: "staged", id: staged.id };
    else {
      const id = randomId(12);
      const linkExpiresAt = now + STAGE_LINK_MS;
      // The limit counted in each row's own write (staging sent at once: 2,001 of 2,000; 7 Nov 2026, Codex C19).
      inserts.push(
        env.DB.prepare(
          "INSERT INTO staged_files (id, user_id, name, content_type, size, sha256, status, source, created_at, link_expires_at, expires_at) SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM staged_files WHERE user_id = ?) < ?",
        ).bind(id, userId, file.name, file.type, file.size, file.sha256, source, now, linkExpiresAt, now + STAGE_KEEP_MS, userId, STAGED_PER_USER),
      );
      made.push(id);
      const signature = await hmacHex(env.UPLOAD_SIGNING_SECRET, stageMessage(id, linkExpiresAt));
      answer = { name: file.name, sha256: file.sha256, status: "upload", id, url: `${env.PUBLIC_ORIGIN}/upload/stage/${id}?exp=${linkExpiresAt}&sig=${signature}`, linkExpiresAt: new Date(linkExpiresAt).toISOString() };
    }
    seen.set(file.sha256, answer);
    answers.push(answer);
  }
  if (inserts.length) {
    const results = await env.DB.batch(inserts);
    // Any one over the limit: none of this call's links are given, and the rows it did make go (no link was ever handed out for them).
    if (results.some((r) => !r.meta.changes)) {
      // In pieces under D1's 100 bound values a statement (a call stages up to STAGE_FILES_PER_CALL).
      const pieces = Array.from({ length: Math.ceil(made.length / 90) }, (_, n) => made.slice(n * 90, n * 90 + 90));
      await env.DB.batch(pieces.map((ids) => env.DB.prepare(`DELETE FROM staged_files WHERE user_id = ? AND id IN (${ids.map(() => "?").join(", ")})`).bind(userId, ...ids)));
      throw new LibraryError(`At most ${STAGED_PER_USER} files can be staged at once; publish or wait for the older ones to expire (a day).`);
    }
  }
  const sends = answers.filter((a, n) => a.status === "upload" && answers.findIndex((b) => b.id === a.id) === n);
  const type = (a: StageAnswer) => files.find((f) => f.sha256 === a.sha256)!.type;
  const script = sends.length
    ? ["#!/bin/sh", "set -e", ...sends.map((a) => `curl -sS --fail-with-body -w '\\n' -X PUT -H ${quote(`Content-Type: ${type(a)}`)} --data-binary @${quote(a.name)} ${quote(a.url!)}`), ""].join("\n")
    : "";
  return {
    files: answers,
    toSend: sends.length,
    script,
    after: sends.length
      ? "Run the script from the folder the names are relative to (each line answers {\"ok\":true,…}), then call library_check with the files' sha256. Links last an hour; staged files a day."
      : "Nothing to send: every file is already staged or in the library. Call library_check with their sha256.",
  };
}

/** Where a staged file's bytes live: fixed by its id, so deleting an account finds them even mid-upload. */
const stagedKey = (userId: string, id: string) => `staging/${userId}/${id}`;

/** PUT /upload/stage/:id: the signature is the only credential; the bytes must match the declared size and sha256. */
export async function receiveStaged(request: Request, env: Env, id: string, url: URL): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (request.method !== "PUT") return json({ error: "Use PUT." }, 405);
  const expiresAt = Number(url.searchParams.get("exp"));
  const signature = url.searchParams.get("sig") ?? "";
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return json({ error: "This upload link has expired. Call library_upload again." }, 403);
  if (!(await secretsEqual(signature, await hmacHex(env.UPLOAD_SIGNING_SECRET, stageMessage(id, expiresAt))))) return json({ error: "Invalid upload link." }, 403);
  const row = await env.DB.prepare("SELECT user_id, content_type, size, sha256, status FROM staged_files WHERE id = ?")
    .bind(id)
    .first<{ user_id: string; content_type: string; size: number; sha256: string; status: string }>();
  if (!row) return json({ error: "Unknown upload." }, 404);
  if (row.status !== "pending") return json({ error: "This file was already sent." }, 409);
  const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim();
  if (contentType !== row.content_type) return json({ error: `Send Content-Type: ${row.content_type}.` }, 415);
  if (Number(request.headers.get("Content-Length") ?? "0") > row.size) return json({ error: `This file was declared as ${row.size} bytes.` }, 413);
  const body = await readBytesLimited(request, row.size);
  if (!body) return json({ error: `This file was declared as ${row.size} bytes; more arrived.` }, 413);
  if (body.byteLength !== row.size) return json({ error: `This file was declared as ${row.size} bytes; ${body.byteLength} arrived.` }, 400);
  const sha256 = await sha256Hex(body);
  if (sha256 !== row.sha256) return json({ error: `These bytes' sha256 is ${sha256}, not the ${row.sha256} declared. Nothing was kept.` }, 400);
  if (!soundsRight(row.content_type, new Uint8Array(body))) return json({ error: `These bytes aren't ${row.content_type === "audio/mp4" ? "an MP4 audio file" : "an MP3"}. Nothing was kept.` }, 415);
  const key = stagedKey(row.user_id, id);
  await env.UPLOADS.put(key, body, { httpMetadata: { contentType: row.content_type }, sha256 });
  const stored = await env.DB.prepare("UPDATE staged_files SET status = 'stored', r2_key = ? WHERE id = ? AND status = 'pending'").bind(key, id).run();
  if (!stored.meta.changes) {
    // The same link sent twice at once (the other one stored these very bytes), or the row went with its account
    // while the bytes were arriving: then nothing may stay behind.
    if (await env.DB.prepare("SELECT 1 AS y FROM staged_files WHERE id = ?").bind(id).first()) return json({ error: "This file was already sent." }, 409);
    await env.UPLOADS.delete(key);
    return json({ error: "This upload was canceled (its account is gone). Nothing was kept." }, 410);
  }
  return json({ ok: true, id, sha256, size: body.byteLength });
}

/** This account's staged files that are stored and unexpired, by sha256. */
async function stagedBySha(env: Env, userId: string): Promise<Map<string, { id: string; name: string; type: string; size: number; key: string }>> {
  const rows = await env.DB.prepare("SELECT id, name, content_type, size, sha256, r2_key FROM staged_files WHERE user_id = ? AND status = 'stored' AND expires_at > ?")
    .bind(userId, Date.now())
    .all<{ id: string; name: string; content_type: string; size: number; sha256: string; r2_key: string }>();
  return new Map(rows.results.map((r) => [r.sha256, { id: r.id, name: r.name, type: r.content_type, size: r.size, key: r.r2_key }]));
}

/** A JSON file this account staged, by its sha256, parsed (community.ts sharing, over MCP): null if none, or not JSON. */
export async function readStagedJson(env: Env, userId: string, sha: string): Promise<{ value: unknown } | null> {
  const file = (await stagedBySha(env, userId)).get(sha);
  if (!file || file.type !== "application/json") return null;
  const object = await env.UPLOADS.get(file.key);
  if (!object) return null;
  try {
    return { value: JSON.parse(await object.text()) };
  } catch {
    return null;
  }
}

/** Drops this account's staged copies of a file once it's been used (best effort: they expire in a day anyway). */
export async function dropStaged(env: Env, userId: string, sha: string): Promise<void> {
  const gone = await env.DB.prepare("DELETE FROM staged_files WHERE user_id = ? AND sha256 = ? RETURNING id").bind(userId, sha).all<{ id: string }>();
  if (gone.results.length) await env.UPLOADS.delete(gone.results.map((row) => stagedKey(userId, row.id)));
}

// ---------- the catalog and its revisions ----------

export interface CatalogueState {
  catalogue: Catalogue;
  etag: string | null;
  rev: number;
}
// The catalog's shape is catalogue.js's; here it's JSON with books, lists, packs and shelf.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Catalogue = any;

/**
 * The catalog as stored, and its revision. A catalog changed outside the admin tools (the books or packs command
 * line) since the last revision is recorded as a revision of its own first, so the history never skips a state.
 */
export async function currentCatalogue(env: Env): Promise<CatalogueState> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const object = await env.LIBRARY.get("catalogue.json");
    if (!object) {
      const last = await env.DB.prepare("SELECT MAX(rev) AS rev FROM library_revisions").first<{ rev: number | null }>();
      return { catalogue: emptyCatalogue(), etag: null, rev: last?.rev ?? 0 };
    }
    const text = await object.text();
    // The revision that is this very write of it: by R2's version of the object (its etag is a hash of its bytes, which
    // an earlier state can have too).
    const rev = async () => (await env.DB.prepare("SELECT MAX(rev) AS rev FROM library_revisions WHERE r2_version = ?").bind(object.version).first<{ rev: number | null }>())?.rev ?? null;
    let known = await rev();
    if (known !== null) return { catalogue: JSON.parse(text), etag: object.etag, rev: known };
    // A revision recorded before versions were kept (migration 0008): the newest one, if it's this state, is this write.
    const adopted = await env.DB.prepare("UPDATE library_revisions SET r2_version = ?1 WHERE rev = (SELECT MAX(rev) FROM library_revisions) AND r2_version IS NULL AND etag = ?2")
      .bind(object.version, object.etag)
      .run();
    if (adopted.meta.changes && (known = await rev()) !== null) return { catalogue: JSON.parse(text), etag: object.etag, rev: known };
    // Not on record: changed outside the admin tools (the books or packs command line), or a writer's put not recorded
    // yet. Recorded only while it's still the catalog: a snapshot overtaken meanwhile is read again, never recorded
    // after a newer state. Numbered in the statement itself, and only if this state has no revision yet: two readers
    // at once, or a reader between a writer's put and its own record, never make two revisions of one state.
    // The revisions' head read first, R2 checked after: the snapshot is numbered only if no revision came in between
    // (else this reads again), so an older state never takes a number after a newer one's.
    const head = (await env.DB.prepare("SELECT COALESCE(MAX(rev), 0) AS rev FROM library_revisions").first<{ rev: number }>())?.rev ?? 0;
    if ((await env.LIBRARY.head("catalogue.json"))?.version !== object.version) continue;
    const recorded = await env.DB.prepare(
      `INSERT INTO library_revisions (rev, etag, r2_version, catalogue, actor_id, action, note, created_at)
       SELECT ?6 + 1, ?1, ?7, ?2, NULL, ?3, ?4, ?5
       WHERE NOT EXISTS (SELECT 1 FROM library_revisions WHERE r2_version = ?7) AND (SELECT COALESCE(MAX(rev), 0) FROM library_revisions) = ?6`,
    )
      .bind(object.etag, text, head ? "outside" : "first-seen", head ? "Changed outside the admin tools (the books or packs command line)." : "The catalog as the admin tools first found it.", object.uploaded.getTime(), head, object.version)
      .run();
    if (!recorded.meta.changes) continue;
    return { catalogue: JSON.parse(text), etag: object.etag, rev: head + 1 };
  }
  throw new LibraryError("The catalog kept changing while it was being read: try again.");
}

/**
 * Stores a new catalog if the stored one is still the one read (compare-and-set on its etag), and records the
 * revision and its admin log entry in one batch. Throws, changing nothing, when the catalog moved on in between.
 */
async function writeCatalogue(
  env: Env,
  state: CatalogueState,
  next: Catalogue,
  revision: { actorId: string; action: string; note: string | null },
  log: AdminLogInput,
): Promise<number> {
  const { actorId, action, note } = revision;
  const problems = catalogueProblems(next);
  if (problems.length) throw new LibraryError(`The catalog this would make isn't valid, so nothing changed:\n  ${problems.join("\n  ")}`);
  // A fresh writeId on every write, so no two writes share bytes (and an etag) even when one restores an earlier
  // catalog exactly: an etag then names one write, and the revision bookkeeping below can rely on it.
  const { writeId: _previous, ...content } = next;
  const text = JSON.stringify({ ...content, writeId: randomId(9) }, null, 2) + "\n";
  const put = await env.LIBRARY.put("catalogue.json", text, {
    httpMetadata: { contentType: "application/json" },
    onlyIf: state.etag ? { etagMatches: state.etag } : new Headers({ "If-None-Match": "*" }),
  });
  if (!put) throw new LibraryError("The catalog changed while this was being written (another publish, or the command line), so nothing changed. Call library_get and try again.");
  // A reader may have recorded this very state as a change from outside in the moment between the put and here (any
  // writer after this one does, before its own change): then that row is this revision, and gets who made it, in its
  // place in the order. Otherwise this state takes the next number. Both, the log entry and the trim go in one batch.
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE library_revisions SET actor_id = ?1, action = ?2, note = ?3
       WHERE rev = (SELECT MIN(rev) FROM library_revisions WHERE r2_version = ?4 AND actor_id IS NULL AND rev > ?5)`,
    ).bind(actorId, action, note, put.version, state.rev),
    env.DB.prepare(
      `INSERT INTO library_revisions (rev, etag, r2_version, catalogue, actor_id, action, note, created_at)
       SELECT (SELECT COALESCE(MAX(rev), 0) + 1 FROM library_revisions), ?1, ?8, ?2, ?3, ?4, ?5, ?6
       WHERE NOT EXISTS (SELECT 1 FROM library_revisions WHERE r2_version = ?8 AND rev > ?7)`,
    ).bind(put.etag, text, actorId, action, note, Date.now(), state.rev, put.version),
    adminLogStatement(env, { ...log, after: { ...(log.after as object | undefined), etag: put.etag } }),
    env.DB.prepare("DELETE FROM library_revisions WHERE rev <= (SELECT MAX(rev) FROM library_revisions) - ?").bind(REVISIONS_KEPT),
  ]);
  const recorded = await env.DB.prepare("SELECT MIN(rev) AS rev FROM library_revisions WHERE r2_version = ? AND rev > ?").bind(put.version, state.rev).first<{ rev: number | null }>();
  // Explore lists the library's default packs: its index follows the catalog (community.ts), as it is now (a write
  // after this one may have changed it already: the index never goes back behind the catalog).
  const now = await currentCatalogue(env);
  await syncLibraryIndex(env, now.catalogue, log.via, now.rev);
  return recorded?.rev ?? state.rev + 1;
}

function checkExpected(state: CatalogueState, expectedRev: number | undefined) {
  if (expectedRev !== undefined && expectedRev !== state.rev) throw new LibraryError(`The catalog is at revision ${state.rev}, not ${expectedRev}: it changed since you read it. Call library_get and look again.`);
}

/** A short view of the catalog: what's on the shelf, without the per-file details (full: the whole JSON). */
export function catalogueView(state: CatalogueState, full = false) {
  const c = state.catalogue;
  return {
    rev: state.rev,
    books: c.books.map((b: Catalogue) => ({
      id: b.id,
      version: b.version,
      title: b.title,
      lang: b.lang,
      level: b.level,
      words: b.words,
      pictures: b.pictures,
      rights: b.rights?.spdx ?? (b.rights?.us && b.rights?.eu ? "public domain (US and EU)" : b.rights?.licence),
      layers: Object.fromEntries(Object.entries(b.layers ?? {}).map(([lang, l]: [string, Catalogue]) => [lang, { kind: l.kind, sentences: l.sentences, licence: l.licence }])),
      publishedAt: b.publishedAt,
    })),
    lists: Object.fromEntries(Object.entries(c.lists?.frequency ?? {}).map(([lang, l]: [string, Catalogue]) => [`frequency.${lang}`, { lemmas: l.lemmas, licence: l.licence, publishedAt: l.publishedAt }])),
    packs: c.packs ?? {},
    grammar: c.grammar ?? {},
    notes: c.notes ?? {},
    forms: c.forms ?? {},
    shelf: c.shelf ?? null,
    ...(full ? { catalogue: c } : {}),
  };
}

export async function libraryHistory(env: Env, limit = 20) {
  const rows = await env.DB.prepare(
    "SELECT r.rev, r.action, r.note, r.created_at, r.catalogue, u.name AS actor FROM library_revisions r LEFT JOIN users u ON u.id = r.actor_id ORDER BY r.rev DESC LIMIT ?",
  )
    .bind(Math.min(Math.max(limit, 1), 100))
    .all<{ rev: number; action: string; note: string | null; created_at: number; catalogue: string; actor: string | null }>();
  return rows.results.map((r) => {
    const c = JSON.parse(r.catalogue);
    return {
      rev: r.rev,
      at: new Date(r.created_at).toISOString(),
      by: r.actor ?? "outside the admin tools",
      action: r.action,
      note: r.note,
      holds: {
        books: c.books.map((b: Catalogue) => `${b.id}@${b.version} [${Object.keys(b.layers ?? {}).join(", ") || "no layers"}]`),
        lists: Object.keys(c.lists?.frequency ?? {}).map((lang) => `frequency.${lang}`),
        packs: Object.fromEntries(Object.entries(c.packs ?? {}).map(([lang, list]) => [lang, (list as Catalogue[]).map((p) => `${p.id}@${p.version}`)])),
        grammar: Object.fromEntries(Object.entries(c.grammar ?? {}).map(([lang, g]) => [lang, `revision ${(g as Catalogue)?.revision}`])),
        shelfSections: (c.shelf ?? []).length,
      },
    };
  });
}

// ---------- checking and publishing ----------

export interface PublishInput {
  /** The sha256 of a staged book file, or "<id>@<version>" of a book already in the library (to add layers to it). */
  book?: string;
  /** Layers for the book: the sha256 of each staged layer, and of its glossary (the names it keeps), if it has one. */
  layers?: { layer: string; glossary?: string }[];
  /** The sha256 of a staged frequency list. */
  list?: string;
  /** The sha256 of a staged pack, to publish as one of the library's default packs (catalogue.packs). */
  pack?: string;
  /**
   * A default pack's new version as a value, never from a tool or a route: corrections accepted by an admin
   * (corrections.ts) publish it through the same checks as a staged one.
   */
  packValue?: unknown;
  /** With packValue: the version it was made from; refused if the catalog has moved on from it. */
  packFrom?: string;
  /**
   * Recorded audio for a default pack, beside the version the catalog lists now: pack, its id; manifest, the sha256 of
   * a staged manifest (pack-audio.js, version 2, every voice with its license and credit). Its clips are staged, or
   * already in the library.
   */
  audio?: { pack: string; manifest: string };
  /** A new version of a default pack that undoes corrections accepted into the one on the catalog: publish it anyway. */
  confirmReverts?: boolean;
  /** A new version of a default pack that removes items: publish it anyway. */
  confirmRemoved?: boolean;
  /**
   * The pack is opt-in (true: no device has it until its learner adds it in Explore; Translate online still searches it)
   * or a default (false). Left out: as the catalog has it now (a new pack: a default).
   */
  optIn?: boolean;
  /**
   * An opt-in pack Explore may suggest (true: on its topics and shelves, as a pack about one topic is) or not (false: found
   * only by search and in the list, last, as strong language is). Left out: as the catalog has it now (a new pack: not).
   */
  suggest?: boolean;
  /**
   * The sha256 of a staged grammar (public/js/lang/grammar.js): a language's shared grammar at its next revision,
   * keeping every pattern id the one on the catalog (or the app's own revision 1) has.
   */
  grammar?: string;
  /** A grammar's next revision as a value, never from a tool or a route: a suggestion an admin accepted (phase 2). */
  grammarValue?: unknown;
  /** The sha256 of a staged longer file for a language's grammar (lexicommons-grammar-more, public/js/lang/grammar.js). */
  grammarMore?: string;
  /** The sha256 of a staged file of a default pack's notes (lexicommons-notes, public/js/study/pack-notes.js). */
  notes?: string;
  /** The sha256 of a staged file of a language's word forms (lexicommons-forms, public/js/study/pack-notes.js). */
  forms?: string;
  note?: string;
}

/**
 * A publish's input from a JSON body (the REST route, /api/v1/admin/library/publish and /check), field by field as library_publish
 * takes them: every field a publish reads (6 Nov 2026, Codex C7: notes, forms, grammarMore and suggest were dropped), each only as
 * its type, so a wrong one is left out rather than passed on.
 */
export function publishInputFrom(body: Record<string, unknown>): PublishInput {
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  const flag = (value: unknown) => (typeof value === "boolean" ? value : undefined);
  const audio = body.audio as Record<string, unknown> | null | undefined;
  return {
    book: text(body.book),
    layers: Array.isArray(body.layers)
      ? (body.layers as Record<string, unknown>[])
          .filter((l) => l !== null && typeof l === "object" && typeof l.layer === "string" && (l.glossary === undefined || typeof l.glossary === "string"))
          .map((l) => ({ layer: l.layer as string, ...(typeof l.glossary === "string" ? { glossary: l.glossary } : {}) }))
      : undefined,
    list: text(body.list),
    pack: text(body.pack),
    audio: audio && typeof audio === "object" && typeof audio.pack === "string" && typeof audio.manifest === "string" ? { pack: audio.pack, manifest: audio.manifest } : undefined,
    grammar: text(body.grammar),
    grammarMore: text(body.grammarMore),
    notes: text(body.notes),
    forms: text(body.forms),
    confirmRemoved: body.confirmRemoved === true,
    confirmReverts: body.confirmReverts === true,
    optIn: flag(body.optIn),
    suggest: flag(body.suggest),
    note: text(body.note),
  };
}

/** Whether the library's object at key holds exactly these bytes (by its recorded sha256, or by reading it). */
async function holds(env: Env, key: string, sha256: string): Promise<boolean> {
  const object = await env.LIBRARY.get(key);
  if (!object) return false;
  const recorded = object.checksums.sha256;
  if (recorded) {
    await object.body.cancel();
    return [...new Uint8Array(recorded)].map((b) => b.toString(16).padStart(2, "0")).join("") === sha256;
  }
  return (await sha256Hex(await object.arrayBuffer())) === sha256;
}

interface Plan {
  problems: Problem[];
  notes: string[];
  /** The files to put into the library: their key, and where their bytes are (a staged file, or text). */
  /** The files to put: from a staged file, or (a pack: the checked pack, not the bytes sent) from text. */
  files: { key: string; type: string; sha256: string; staged?: string; text?: string; present?: boolean }[];
  change: ((catalogue: Catalogue) => { catalogue: Catalogue | null; problems: string[]; notes?: string[] }) | null;
  target: string;
  summary: Record<string, unknown>;
  audits: Record<string, unknown>;
}

/**
 * The grammar a language's next revision follows: the catalog's (its file, checked again) or, with none on the
 * catalog, the app's own revision 1. { problem } when the catalog names one the library can't give.
 */
export async function catalogueGrammar(env: Env, catalogue: Catalogue, language: string): Promise<{ grammar: Grammar } | { problem: string }> {
  const seed = seedGrammar(language);
  if (!seed) return { problem: `language "${language.slice(0, 20)}" isn't one Lexicommons knows.` };
  const ref = grammarRef(catalogue, language);
  if (!ref) return { grammar: seed };
  const object = await env.LIBRARY.get(grammarKey(language, ref.version));
  let raw: unknown = null;
  try {
    raw = object ? JSON.parse(await object.text()) : null;
  } catch {}
  const checked = raw ? checkGrammar(raw) : null;
  if (!checked?.grammar || checked.grammar.revision !== ref.revision || (await grammarVersion(checked.grammar)) !== ref.version) {
    return { problem: `The catalog names ${language}'s grammar at revision ${ref.revision} (${ref.version}), but the library's file ${object ? "doesn't pass the check" : "isn't there"}. Restore a revision of the catalog before it, or fix the file first.` };
  }
  return { grammar: checked.grammar };
}

const decoder = new TextDecoder();

/**
 * A published file is never changed: each planned file whose key the library already holds must hold these very
 * bytes (then it isn't written again); different bytes there refuse the publish.
 */
async function checkOccupied(env: Env, out: Plan): Promise<void> {
  for (const file of out.files) {
    if (!(await env.LIBRARY.head(file.key))) continue;
    if (await holds(env, file.key, file.sha256)) {
      file.present = true;
      continue;
    }
    const why = file.key.endsWith("/book.json")
      ? " A book's version is a hash of its words and structure, not its title, authors, rights or source, so this file differs from the published one only there. A published book can't be changed in place: a phone may have it cached for good."
      : "";
    out.problems.push({ at: file.key, message: `${file.key} is already in the library with different bytes, and a published file is never changed.${why}` });
  }
}

/** Works out what a publish would do, running every check; writes nothing. */
async function plan(env: Env, userId: string, input: PublishInput): Promise<Plan> {
  const out = await planFiles(env, userId, input);
  if (!out.problems.length) await checkOccupied(env, out);
  return out;
}

async function planFiles(env: Env, userId: string, input: PublishInput): Promise<Plan> {
  const out: Plan = { problems: [], notes: [], files: [], change: null, target: "", summary: {}, audits: {} };
  const problem = (at: string, message: string) => void out.problems.push({ at, message });
  const kinds = [input.book !== undefined, input.list !== undefined, input.pack !== undefined || input.packValue !== undefined, input.audio !== undefined, input.grammar !== undefined || input.grammarValue !== undefined, input.grammarMore !== undefined, input.notes !== undefined, input.forms !== undefined].filter(Boolean).length;
  if (kinds !== 1) {
    problem("input", `${kinds ? "Publish one thing at a time" : "Say what to publish"}: a book (with its pictures and any layers), a frequency list, a pack, a pack's audio, or a language's grammar.`);
    return out;
  }
  if (input.layers?.length && input.book === undefined) problem("layers", "Layers need their book: give book too (a staged one, or \"<id>@<version>\" of one in the library).");
  const staged = await stagedBySha(env, userId);
  // A file by its sha256: one this account staged, or one the library already holds (published before, so its staged
  // copy is gone). key is the staged copy's, if that's where it came from.
  const readStaged = async (sha: string, at: string): Promise<{ text: string; key?: string } | null> => {
    if (!SHA256.test(sha)) return problem(at, `${at} must be a staged file's sha256 (64 hex).`), null;
    const file = staged.get(sha);
    if (!file) {
      const held = await env.DB.prepare("SELECT r2_key, content_type FROM library_files WHERE sha256 = ?").bind(sha).first<{ r2_key: string; content_type: string }>();
      const object = held?.content_type === "application/json" ? await env.LIBRARY.get(held.r2_key) : null;
      if (object) return { text: decoder.decode(await object.arrayBuffer()) };
      return problem(at, `${at}: no staged file with sha256 ${sha.slice(0, 12)}… (stage it with library_upload and send it; staged files last a day).`), null;
    }
    if (file.type !== "application/json") return problem(at, `${at} must be a JSON file; ${file.name} is ${file.type}.`), null;
    const object = await env.UPLOADS.get(file.key);
    if (!object) return problem(at, `${at}: the staged file has gone; stage it again.`), null;
    return { text: decoder.decode(await object.arrayBuffer()), key: file.key };
  };
  const parse = (text: string, at: string) => {
    try {
      return JSON.parse(text);
    } catch {
      problem(at, `${at} isn't valid JSON.`);
      return null;
    }
  };

  if (input.list !== undefined) {
    const file = await readStaged(input.list, "list");
    const list = file && parse(file.text, "list");
    if (!list) return out;
    const listProblems = validateFrequency(list) as string[];
    for (const message of listProblems) problem("list", message);
    if (listProblems.length) return out;
    const key = listKey(list, input.list);
    const entry = listEntry(list, key, new Date().toISOString());
    out.files.push({ key, type: "application/json", sha256: input.list, staged: file.key });
    out.change = (catalogue) => withList(catalogue, list, entry);
    out.target = `list:frequency.${list.lang}`;
    out.summary = { list: `frequency.${list.lang}`, lemmas: entry.lemmas, licence: entry.licence, key };
    return out;
  }

  if (input.pack !== undefined || input.packValue !== undefined) {
    // A default pack, as the packs command line publishes one: checked against the language's other default packs,
    // named by the checked pack's content, a version that removes items only when confirmed, the checked pack's own
    // text at its key, then the catalog. (packValue: the same, from corrections an admin accepted.)
    const file = input.packValue !== undefined ? null : await readStaged(input.pack!, "pack");
    const raw = input.packValue !== undefined ? (input.packValue as Catalogue) : file && parse(file.text, "pack");
    if (!raw) return out;
    const { catalogue } = await currentCatalogue(env);
    // The language's shared grammar as the catalog has it: the pack's patterns resolve against it (src/grammar.ts).
    await grammarReady(env, raw.language, catalogue);
    const fetchPack = async (ref: PackRef) => {
      const object = await env.LIBRARY.get(packKey(ref.id, ref.version) as string);
      return object ? upgradePack(JSON.parse(await object.text())) : null;
    };
    const installed = await defaultInstalled(catalogue, raw.language, fetchPack, raw.id);
    // A value the check doesn't expect may throw in it: a problem with the pack, said so.
    let checked: { pack: Pack | null; errors: { at: string; message: string }[]; warnings: { at: string; message: string }[] };
    try {
      checked = checkPack(raw, { installed });
    } catch (error) {
      return problem("pack", `The pack couldn't be checked: ${error instanceof Error ? error.message : "a value of the wrong kind"}.`), out;
    }
    for (const e of checked.errors) problem(`pack.${e.at}`, e.message);
    for (const w of checked.warnings) out.notes.push(`Warning, ${w.at}: ${w.message}`);
    const pack = checked.pack;
    if (!pack) return out;
    const version = await packVersion(pack);
    const previousRef = packRefs(catalogue, pack.language).find((ref) => ref.id === pack.id);
    // A new library pack's id must be its own: a learner's shared pack in Explore with that id would stay theirs to change or withdraw
    // (6 Nov 2026, Codex C5). The catalog's own packs are curated rows; anything else under the id refuses it.
    if (!previousRef) {
      const taken = await env.DB.prepare("SELECT curated FROM items WHERE id = ?").bind(pack.id).first<{ curated: number }>();
      if (taken && !taken.curated) return problem("pack", `"${pack.id}" is a learner's shared pack in Explore: give the library's pack an id of its own.`), out;
    }
    if (input.packFrom !== undefined && previousRef?.version !== input.packFrom) return problem("pack", `${pack.id} isn't at ${input.packFrom} on the catalog any more: look again.`), out;
    // A new version, or the same version switched between default and opt-in (the catalog's entry alone changes).
    const optIn = input.optIn ?? previousRef?.optIn === true;
    const suggest = optIn && (input.suggest ?? previousRef?.suggest === true);
    if (input.suggest === true && !optIn) return problem("pack", `suggest is for an opt-in pack: a default pack is on every device already.`), out;
    if (previousRef?.version === version && (previousRef.optIn === true) === optIn && (previousRef.suggest === true) === suggest)
      return problem("pack", `${pack.id}@${version} is already ${optIn ? `an opt-in${suggest ? ", suggested" : ""}` : "the default"} ${pack.language} pack at this version: nothing to publish.`), out;
    let changes = null;
    let previous: Pack | null = null;
    if (previousRef) {
      previous = (await fetchPack(previousRef)) as Pack | null;
      changes = previous ? compareVersions(previous, pack) : null;
      if (changes?.removed.length && !input.confirmRemoved) problem("pack", `This version removes ${changes.removed.join(", ")}: give confirm_removed to publish it anyway.`);
      // Corrections accepted into the version on the catalog (corrections.ts) that this one undoes: the copy it was
      // made from doesn't have them yet. (A version made by accepting corrections is made on that one.)
      if (previous && input.packValue === undefined && !input.confirmReverts) {
        const undone = await undoneCorrections(env, pack.id, previous, pack);
        const them = undone.length === 1 ? "it" : "them";
        if (undone.length) {
          const list = undone.slice(0, 8).map((u) => `${u.path} by ${u.by}`).join(", ") + (undone.length > 8 ? ", …" : "");
          problem("pack", `This version undoes ${undone.length} accepted correction${undone.length === 1 ? "" : "s"} (${list}): the copy it was made from doesn't have ${them} yet. Take ${them} into the pack (list_corrections with all), or give confirm_reverts to publish it anyway.`);
        }
      }
    }
    const text = packText(pack) as string;
    out.files.push({ key: packKey(pack.id, version) as string, type: "application/json", sha256: await sha256Hex(text), text });
    // Recorded audio reads its sentences' words, so the recordings of every sentence this version still says word for
    // word go out with it, in the same catalog change (pack-audio.js fitAudio, unchangedItems): a publish takes one thing
    // at a time, and a version listed without them would leave every line to the device's voice until its own audio is
    // published. A sentence it changed is read by the device's voice until then, and the check says which.
    let audio: string | undefined;
    if (previousRef?.audio && previous) {
      const object = await env.LIBRARY.get(previousRef.audio.replace(/^\/library\//, ""));
      const before = object ? (JSON.parse(await object.text()) as Audio) : null;
      const kept = before ? fitAudio(before, pack, { still: unchangedItems(previous, pack) as Set<string>, forLibrary: true }) : null;
      const recorded = new Set(Object.values(before?.voices ?? {}).flatMap((voice) => Object.keys((voice as { items?: object }).items ?? {})));
      const carried = new Set(Object.values(kept?.voices ?? {}).flatMap((voice) => Object.keys((voice as { items?: object }).items ?? {})));
      const lost = [...recorded].filter((id) => !carried.has(id));
      if (kept) {
        const text = audioText(kept) as string;
        const audioV = await audioVersion(kept);
        out.files.push({ key: audioKey(pack.id, version, audioV) as string, type: "application/json", sha256: await sha256Hex(text), text });
        audio = audioUrl(pack.id, version, audioV) as string;
        out.notes.push(`${pack.id}@${previousRef.version}'s recordings go out with this version for the ${carried.size} of its ${recorded.size} recorded sentences it says word for word.`);
      } else out.notes.push(`${pack.id}@${previousRef.version} has recorded audio, but this version says none of its recorded sentences word for word: it goes out without recordings until its own audio is published (audio: { pack: "${pack.id}", manifest }).`);
      if (lost.length && kept) out.notes.push(`Warning, audio: ${lost.length} recorded sentence${lost.length === 1 ? "" : "s"} changed or went (${lost.slice(0, 8).join(", ")}${lost.length > 8 ? ", …" : ""}): the device's voice reads ${lost.length === 1 ? "it" : "them"} until audio for this version is published.`);
    }
    const entry = catalogueEntry(pack, version, { optIn, suggest, ...(audio ? { audio } : {}) });
    out.change = (current) => {
      // Only over the version it was checked against (removals, and corrections it would undo, were judged on that
      // one), or the one it was made from (corrections accepted on it), as the catalog has it now.
      const over = input.packFrom ?? previousRef?.version;
      const now = packRefs(current, pack.language).find((ref) => ref.id === pack.id)?.version;
      if (now !== over) return { catalogue: null, problems: [`${pack.id} ${over ? `moved on from ${over}` : "was published"} meanwhile: look again (library_get).`] };
      return { catalogue: withPackEntry(current, pack.language, entry), problems: [] };
    };
    out.target = `pack:${pack.id}@${version}`;
    out.summary = { pack: `${pack.id}@${version}`, name: pack.name, language: pack.language, sentences: sentencesOf(pack).length, ...(optIn ? { optIn: true } : {}), ...(suggest ? { suggest: true } : {}), ...(previousRef ? { replaces: previousRef.version, changes } : {}) };
    return out;
  }

  if (input.grammar !== undefined || input.grammarValue !== undefined) {
    // A language's shared grammar at its next revision (public/js/lang/grammar.js): checked against the one it follows,
    // the catalog's (or the app's own revision 1), so every id that resolved still does; the checked grammar's own text
    // at its content-named key; then the catalog's grammar.<lang>, in the same compare-and-set.
    const file = input.grammarValue !== undefined ? null : await readStaged(input.grammar!, "grammar");
    const raw = input.grammarValue !== undefined ? (input.grammarValue as Catalogue) : file && parse(file.text, "grammar");
    if (!raw) return out;
    const language = typeof raw?.language === "string" ? raw.language : "";
    const { catalogue } = await currentCatalogue(env);
    const previous = await catalogueGrammar(env, catalogue, language);
    if ("problem" in previous) return problem("grammar", previous.problem), out;
    let checked: ReturnType<typeof checkGrammar>;
    try {
      checked = checkGrammar(raw, { previous: previous.grammar });
    } catch (error) {
      return problem("grammar", `The grammar couldn't be checked: ${error instanceof Error ? error.message : "a value of the wrong kind"}.`), out;
    }
    for (const e of checked.errors) problem(`grammar.${e.at}`, e.message);
    for (const w of checked.warnings) out.notes.push(`Warning, ${w.at}: ${w.message}`);
    const grammar = checked.grammar;
    if (!grammar) return out;
    const changes = grammarChanges(previous.grammar, grammar);
    if (!changes.added.length && !changes.changed.length && !changes.retired.length && !changes.restored.length && !changes.readings) return problem("grammar", `It's the same as ${language}'s grammar at revision ${previous.grammar.revision}: nothing to publish.`), out;
    const version = await grammarVersion(grammar);
    const text = grammarText(grammar);
    out.files.push({ key: grammarKey(language, version), type: "application/json", sha256: await sha256Hex(text), text });
    const entry = grammarEntry(grammar, version);
    out.change = (current) => {
      // Only over the revision it was checked against, as the catalog has it now.
      const now = grammarRef(current, language)?.revision ?? 1;
      if (now !== previous.grammar.revision) return { catalogue: null, problems: [`${language}'s grammar moved on to revision ${now} meanwhile: look again (library_get).`] };
      // Its longer file stays: it follows the ids, which a new revision keeps.
      const more = grammarRef(current, language)?.more;
      return { catalogue: withGrammarEntry(current, language, more ? { ...entry, more } : entry), problems: [] };
    };
    out.target = `grammar:${language}@${grammar.revision}`;
    out.summary = { grammar: language, revision: grammar.revision, version, patterns: entry.patterns, follows: previous.grammar.revision, changes };
    return out;
  }

  if (input.forms !== undefined) {
    // A language's word forms: their own check, at their content-named key, then the catalog's forms.<lang>, in the same compare-and-set.
    const file = await readStaged(input.forms, "forms");
    const raw = file && parse(file.text, "forms");
    if (!raw) return out;
    let checked: { forms: { language: string } | null; errors: Problem[]; warnings: Problem[] };
    try {
      checked = checkFormsJs(raw) as typeof checked;
    } catch (error) {
      return problem("forms", `They couldn't be checked: ${error instanceof Error ? error.message : "a value of the wrong kind"}.`), out;
    }
    for (const e of checked.errors) problem(`forms.${e.at}`, e.message);
    if (!checked.forms) return out;
    const language = checked.forms.language;
    if (!Object.hasOwn(LANGUAGES, language)) return problem("forms.language", `"${language.slice(0, 20)}" isn't a language Lexicommons knows.`), out;
    const { catalogue } = await currentCatalogue(env);
    const text = notesTextJs(checked.forms) as string;
    const version = (await sha256Hex(text)).slice(0, 12);
    if (formsRefJs(catalogue, language)?.version === version) return problem("forms", `${language}'s word forms are already these: nothing to publish.`), out;
    const lines = formLinesJs(checked.forms) as number;
    out.files.push({ key: formsKeyJs(language, version) as string, type: "application/json", sha256: await sha256Hex(text), text });
    out.change = (current) => ({ catalogue: withFormsEntryJs(current, language, { version, url: formsUrlJs(language, version), lines }) as Catalogue, problems: [] });
    out.target = `forms:${language}@${version}`;
    out.summary = { forms: language, version, lines };
    return out;
  }

  if (input.notes !== undefined) {
    // A default pack's notes: checked against the version the catalog lists now, at their content-named key, then the catalog's notes.<pack>, in the same compare-and-set. A new version of the pack keeps them.
    const file = await readStaged(input.notes, "notes");
    const raw = file && parse(file.text, "notes");
    if (!raw) return out;
    const packId = typeof raw?.pack === "string" ? raw.pack : "";
    const { catalogue } = await currentCatalogue(env);
    const found = Object.keys(catalogue.packs ?? {}).flatMap((lang) => packRefs(catalogue, lang).map((ref) => ({ lang, ref }))).find((f) => f.ref.id === packId);
    if (!found) return problem("notes.pack", `There's no default pack "${packId.slice(0, 48)}" on the catalog: publish the pack first, then its notes.`), out;
    const object = await env.LIBRARY.get(packKey(found.ref.id, found.ref.version) as string);
    const pack = object ? (upgradePack(JSON.parse(await object.text())) as Pack) : null;
    if (!pack) return problem("notes.pack", `${found.ref.id}@${found.ref.version} is on the catalog but its file isn't in the library.`), out;
    let checked: { notes: { items: Record<string, unknown> } | null; errors: Problem[]; warnings: Problem[] };
    try {
      checked = checkNotesJs(raw, pack as never) as typeof checked;
    } catch (error) {
      return problem("notes", `They couldn't be checked: ${error instanceof Error ? error.message : "a value of the wrong kind"}.`), out;
    }
    for (const e of checked.errors) problem(`notes.${e.at}`, e.message);
    for (const w of checked.warnings) out.notes.push(`Warning, ${w.at}: ${w.message}`);
    if (!checked.notes) return out;
    const text = notesTextJs(checked.notes) as string;
    const version = (await sha256Hex(text)).slice(0, 12);
    if (notesRefJs(catalogue, packId)?.version === version) return problem("notes", `${packId}'s notes are already these: nothing to publish.`), out;
    const sentences = Object.keys(checked.notes.items).length;
    out.files.push({ key: notesKeyJs(packId, version) as string, type: "application/json", sha256: await sha256Hex(text), text });
    out.change = (current) => {
      if (!packRefs(current, found.lang).some((ref) => ref.id === packId)) return { catalogue: null, problems: [`${packId} left the catalog meanwhile: look again (library_get).`] };
      return { catalogue: withNotesEntryJs(current, packId, { version, url: notesUrlJs(packId, version), sentences }) as Catalogue, problems: [] };
    };
    out.target = `notes:${packId}@${version}`;
    out.summary = { notes: packId, version, sentences, of: (pack.items ?? []).length, ...(notesRefJs(catalogue, packId) ? { replaces: notesRefJs(catalogue, packId)!.version } : {}) };
    return out;
  }

  if (input.grammarMore !== undefined) {
    // What's longer about a language's patterns: checked against the grammar the catalog has now, at its content-named key, then the entry's more, in the same compare-and-set.
    const file = await readStaged(input.grammarMore, "grammarMore");
    const raw = file && parse(file.text, "grammarMore");
    if (!raw) return out;
    const language = typeof raw?.language === "string" ? raw.language : "";
    const { catalogue } = await currentCatalogue(env);
    const now = await catalogueGrammar(env, catalogue, language);
    if ("problem" in now) return problem("grammarMore", now.problem), out;
    let checked: { more: { language: string; concepts: Record<string, unknown> } | null; errors: Problem[]; warnings: Problem[] };
    try {
      checked = checkGrammarMoreJs(raw, now.grammar) as typeof checked;
    } catch (error) {
      return problem("grammarMore", `It couldn't be checked: ${error instanceof Error ? error.message : "a value of the wrong kind"}.`), out;
    }
    for (const e of checked.errors) problem(`grammarMore.${e.at}`, e.message);
    for (const w of checked.warnings) out.notes.push(`Warning, ${w.at}: ${w.message}`);
    if (!checked.more) return out;
    const text = JSON.stringify(checked.more);
    const version = (await sha256Hex(text)).slice(0, 12);
    const ref = moreRefJs(language, version) as { version: string; url: string };
    if (grammarRef(catalogue, language)?.more?.version === version) return problem("grammarMore", `${language}'s longer file is already this one: nothing to publish.`), out;
    if (!grammarRef(catalogue, language)) return problem("grammarMore", `${language} has no grammar on the catalog yet: publish one first.`), out;
    out.files.push({ key: moreKeyJs(language, version) as string, type: "application/json", sha256: await sha256Hex(text), text });
    out.change = (current) => {
      const entry = (current.grammar as Record<string, Record<string, unknown>> | undefined)?.[language];
      if (!grammarRef(current, language) || !entry) return { catalogue: null, problems: [`${language}'s grammar left the catalog meanwhile: look again (library_get).`] };
      return { catalogue: withGrammarEntry(current, language, { ...entry, more: ref }), problems: [] };
    };
    out.target = `grammar-more:${language}@${version}`;
    out.summary = { grammarMore: language, version, concepts: Object.keys(checked.more.concepts).length, of: Object.keys(now.grammar.patterns).length };
    return out;
  }

  if (input.audio !== undefined) {
    // A default pack's recordings, beside the version the catalog lists now: the manifest checked against that version
    // with the library's rules (every voice's license and credit), each clip staged or already in the library, the
    // manifest at its own content-named key, then the entry's audio, in the same compare-and-set.
    const given = input.audio;
    if (!given || typeof given.pack !== "string" || typeof given.manifest !== "string") return problem("audio", 'audio is { pack: "<the pack\'s id>", manifest: "<the staged manifest\'s sha256>" }.'), out;
    const { catalogue } = await currentCatalogue(env);
    const found = Object.keys(catalogue.packs ?? {})
      .flatMap((lang) => packRefs(catalogue, lang).map((ref) => ({ lang, ref })))
      .find((f) => f.ref.id === given.pack);
    if (!found) return problem("audio.pack", `There's no default pack "${given.pack}" on the catalog: publish the pack first, then its audio.`), out;
    const file = await readStaged(given.manifest, "audio.manifest");
    const raw = file && parse(file.text, "audio.manifest");
    if (!raw) return out;
    const object = await env.LIBRARY.get(packKey(found.ref.id, found.ref.version) as string);
    const pack = object ? (upgradePack(JSON.parse(await object.text())) as Pack) : null;
    if (!pack) return problem("audio.pack", `${found.ref.id}@${found.ref.version} is on the catalog but its file isn't in the library.`), out;
    let checked: ReturnType<typeof checkAudio>;
    try {
      checked = checkAudio(raw, pack, { forLibrary: true });
    } catch (error) {
      // A field of the wrong kind the check didn't expect: a problem with the manifest, not the server's.
      return problem("audio.manifest", `The manifest couldn't be checked (a field of the wrong kind?): ${error instanceof Error ? error.message : String(error)}`), out;
    }
    for (const e of checked.errors) problem(`audio.${e.at}`, e.message);
    for (const w of checked.warnings) out.notes.push(`Warning, ${w.at}: ${w.message}`);
    const audio = checked.audio;
    if (!audio) return out;
    // Every clip, by the hash its name carries: staged by this account, or already in the library.
    const missing: string[] = [];
    for (const clip of clipsOf(audio) as string[]) {
      const [hash, ext] = clip.split(".");
      const type = ext === "m4a" ? "audio/mp4" : "audio/mpeg";
      const stagedClip = [...staged.entries()].find(([sha, f]) => sha.startsWith(hash!) && f.type === type);
      if (stagedClip) out.files.push({ key: clipKey(clip) as string, type, sha256: stagedClip[0], staged: stagedClip[1].key });
      else if (!(await env.LIBRARY.head(clipKey(clip) as string))) missing.push(clip);
    }
    if (missing.length) problem("audio.clips", `${missing.length} clip${missing.length === 1 ? " isn't" : "s aren't"} staged or in the library: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? ", …" : ""}. Stage them with library_upload (type audio/mpeg or audio/mp4), each named by its bytes.`);
    if (out.problems.length) return out;
    const text = audioText(audio) as string;
    const audioV = (await audioVersion(audio)) as string;
    const url = audioUrl(found.ref.id, found.ref.version, audioV) as string;
    if (found.ref.audio === url) return problem("audio", `${found.ref.id}@${found.ref.version} already has this audio: nothing to publish.`), out;
    out.files.push({ key: audioKey(found.ref.id, found.ref.version, audioV) as string, type: "application/json", sha256: await sha256Hex(text), text });
    out.change = audioChange(found, pack, url);
    out.target = `audio:${found.ref.id}@${found.ref.version}`;
    out.summary = {
      audio: url,
      pack: `${found.ref.id}@${found.ref.version}`,
      voices: Object.fromEntries(
        Object.entries(audio.voices).map(([slug, v]) => [slug, { name: v.name, license: v.license, credit: v.credit, sentences: Object.keys(v.items ?? {}).length, words: Object.keys(v.words ?? {}).length }]),
      ),
      clips: (clipsOf(audio) as string[]).length,
      ...(found.ref.audio ? { replaces: found.ref.audio } : {}),
    };
    return out;
  }

  // A book: staged, or already in the library.
  let book: Catalogue = null;
  let bookFile: { text: string; key?: string } | null = null;
  const fromLibrary = LIBRARY_BOOK.exec(input.book!);
  if (fromLibrary) {
    const object = await env.LIBRARY.get(`books/${fromLibrary[1]}/${fromLibrary[2]}/book.json`);
    if (!object) return problem("book", `The library has no book ${input.book}.`), out;
    book = parse(await object.text(), "book");
  } else {
    bookFile = await readStaged(input.book!, "book");
    book = bookFile && parse(bookFile.text, "book");
  }
  if (!book) return out;
  const bookProblems = (await validateBook(book)) as string[];
  for (const message of bookProblems.slice(0, 20)) problem("book", message);
  if (bookProblems.length > 20) problem("book", `… and ${bookProblems.length - 20} more.`);
  for (const message of rightsProblems(book) as string[]) problem("book.rights", message);
  if (out.problems.length) return out;
  const prefix = bookPrefix(book);
  if (bookFile) out.files.push({ key: `${prefix}/book.json`, type: "application/json", sha256: input.book!, staged: bookFile.key });

  // Its pictures, each by the hash its name carries: staged, or already in the library.
  for (const [n, picture] of ((book.pictures ?? []) as { file: string }[]).entries()) {
    const [hash, ext] = picture.file.split(".");
    const type = Object.keys(STAGE_TYPES).find((t) => STAGE_TYPES[t]!.ext === ext)!;
    const file = [...staged.entries()].find(([sha, f]) => sha.startsWith(hash!) && f.type === type);
    if (file) out.files.push({ key: picturePath(picture.file), type, sha256: file[0], staged: file[1].key });
    else if (!(await env.LIBRARY.head(picturePath(picture.file)))) problem(`book.pictures[${n}]`, `${picture.file} isn't staged or in the library: stage it with library_upload (its sha256 starts ${hash}).`);
  }

  // Its layers: each validates against the book and passes the audit (the same rule as the pipeline's publish).
  const layers: Record<string, ReturnType<typeof layerEntry>> = {};
  for (const [n, given] of (input.layers ?? []).entries()) {
    const at = `layers[${n}]`;
    const file = await readStaged(given.layer, `${at}.layer`);
    const layer = file && parse(file.text, `${at}.layer`);
    if (!layer) continue;
    let keep: string[] = [];
    if (given.glossary !== undefined) {
      const glossaryFile = await readStaged(given.glossary, `${at}.glossary`);
      const glossary = glossaryFile && parse(glossaryFile.text, `${at}.glossary`);
      if (!glossary) continue;
      keep = Array.isArray(glossary.keep) ? glossary.keep : [];
    }
    if (layers[layer.to]) {
      problem(at, `Two layers into ${layer.to}; give one.`);
      continue;
    }
    // Its woven grammar (c) names patterns of the language being learned, as the catalog's grammar has them (a parallel layer, a
    // person's translation, names none).
    if (layer.kind !== "parallel") await grammarReady(env, layer.kind === "help" ? book.lang : layer.to);
    const layerProblems = await validateWeave(layer, book, { keep });
    if (layerProblems.length) {
      for (const message of layerProblems.slice(0, 10)) problem(at, message);
      if (layerProblems.length > 10) problem(at, `… and ${layerProblems.length - 10} more.`);
      continue;
    }
    // The weave audit reads woven words; a parallel layer (a person's translation beside the book) has none, so it has no audit.
    if (layer.kind !== "parallel") {
      const { report } = await auditWeave(book, layer, { keep });
      out.audits[layer.to] = {
        ok: report.ok,
        invariants: report.invariants,
        banks: report.banks,
        toRead: Object.fromEntries(Object.entries(report.findings).map(([kind, f]) => [kind, f.count])),
      };
      if (!report.ok) {
        problem(at, `The ${layer.to} layer fails the audit: known-but-silent ${report.invariants["known-but-silent"]}, unknown-shown ${report.invariants["unknown-shown"]}, doubled ${report.invariants.doubled} (all must be 0).`);
        continue;
      }
    }
    const key = layerKey(book, layer, given.layer);
    layers[layer.to] = layerEntry(layer, key);
    out.files.push({ key, type: "application/json", sha256: given.layer, staged: file.key });
  }
  if (out.problems.length) return out;
  const publishedAt = new Date().toISOString();
  out.change = (catalogue) => {
    // A book named by <id>@<version> gets layers added to it as it's on the shelf; going back to an older version is
    // what library_restore is for.
    const live = fromLibrary ? catalogue.books.find((b: Catalogue) => b.id === book.id) : null;
    if (fromLibrary && live?.version !== book.version) {
      return { catalogue: null, problems: [live ? `${book.id} is at version ${live.version} on the shelf, not ${book.version}. Add layers to the version on the shelf, or library_restore to go back to an earlier catalog.` : `${book.id} isn't on the shelf; publish it with its staged book file.`] };
    }
    return withBook(catalogue, book, layers, publishedAt);
  };
  out.target = `book:${book.id}@${book.version}`;
  out.summary = {
    book: `${book.id}@${book.version}`,
    title: book.title,
    lang: book.lang,
    words: book.words.length,
    pictures: book.pictures?.length ?? 0,
    layers: Object.fromEntries(Object.entries(layers).map(([lang, l]) => [lang, { kind: l.kind, sentences: l.sentences, licence: l.licence }])),
  };
  return out;
}

export interface CheckResult {
  ok: boolean;
  problems: Problem[];
  notes: string[];
  wouldPublish: Record<string, unknown> | null;
  files: { key: string; from: "staged" | "library" }[];
  audits: Record<string, unknown>;
  catalogueRev: number;
}

/** Runs every check on a publish without writing anything. */
export async function checkPublish(env: Env, userId: string, input: PublishInput): Promise<CheckResult> {
  const [p, state] = await Promise.all([plan(env, userId, input), currentCatalogue(env)]);
  const changed = p.change && !p.problems.length ? p.change(state.catalogue) : null;
  const problems = [...p.problems, ...(changed?.problems ?? []).map((message) => ({ at: "catalogue", message }))];
  return {
    ok: problems.length === 0,
    problems,
    notes: [...p.notes, ...(changed?.notes ?? [])],
    wouldPublish: problems.length ? null : p.summary,
    files: p.files.map((f) => ({ key: f.key, from: f.staged ? "staged" : "library" })),
    audits: p.audits,
    catalogueRev: state.rev,
  };
}

/** Checks again, then puts the files into the library and the change on the catalog (one compare-and-set). */
/**
 * Publishes one thing. beforeWrite, when given, is asked last, after every file is in the library and just before the catalog is written:
 * a problem it answers publishes nothing (the files stay, named by their bytes and pointed at by nothing). A review of grammar suggestions
 * checks its claims there, so one hidden while it ran doesn't go out (grammar-suggestions.ts).
 */
export async function publish(
  env: Env,
  actor: { userId: string; via: string },
  input: PublishInput,
  expectedRev?: number,
  { beforeWrite }: { beforeWrite?: () => Promise<string | null> } = {},
) {
  const p = await plan(env, actor.userId, input);
  if (p.problems.length || !p.change) return { published: false as const, problems: p.problems, audits: p.audits };
  const state = await currentCatalogue(env);
  checkExpected(state, expectedRev);
  const changed = p.change(state.catalogue);
  if (changed.problems.length || !changed.catalogue) return { published: false as const, problems: changed.problems.map((message) => ({ at: "catalogue", message })), audits: p.audits };
  // Files first (named by content, so never overwritten), then the catalog that points at them.
  let written = 0;
  let alreadyThere = 0;
  for (const file of p.files) {
    if (file.present) {
      alreadyThere++;
    } else {
      let bytes: ArrayBuffer | string;
      if (file.text !== undefined) bytes = file.text;
      else {
        if (!file.staged) throw new LibraryError(`${file.key} isn't in the library and wasn't staged; nothing was put on the catalog. Stage it with library_upload.`);
        const object = await env.UPLOADS.get(file.staged);
        if (!object) throw new LibraryError(`A staged file (${file.key}) went missing before it was published; nothing was put on the catalog. Stage it again.`);
        bytes = await object.arrayBuffer();
      }
      // Created only if absent, with its sha256 recorded (R2 checks the bytes against it).
      const put = await env.LIBRARY.put(file.key, bytes, { httpMetadata: { contentType: file.type }, sha256: file.sha256, onlyIf: new Headers({ "If-None-Match": "*" }) });
      if (put) written++;
      else if (await holds(env, file.key, file.sha256)) alreadyThere++;
      else throw new LibraryError(`${file.key} was published with different bytes while this was being published; nothing was put on the catalog.`);
    }
    await env.DB.prepare("INSERT OR IGNORE INTO library_files (sha256, r2_key, content_type, size, created_at) SELECT ?, ?, ?, size, ? FROM staged_files WHERE user_id = ? AND sha256 = ? LIMIT 1")
      .bind(file.sha256, file.key, file.type, Date.now(), actor.userId, file.sha256)
      .run();
  }
  const held = beforeWrite ? await beforeWrite() : null;
  if (held) return { published: false as const, problems: [{ at: "catalogue", message: held }], audits: p.audits };
  const note = input.note?.trim().slice(0, 500) || null;
  const rev = await writeCatalogue(env, state, changed.catalogue, { actorId: actor.userId, action: "publish", note }, { actorId: actor.userId, via: actor.via, action: "library.publish", target: p.target, before: { rev: state.rev }, after: p.summary, note });
  // What's published is the library's now (library_files): every staged copy of it goes (a glossary isn't published,
  // so it stays staged for its day). Best effort: the publish is done, and anything left expires with its day.
  // (A pack's or an audio manifest's staged bytes aren't the checked file's, so they're named by the input.)
  const hashes = [...new Set([...p.files.map((f) => f.sha256), ...(input.pack ? [input.pack] : []), ...(input.audio ? [input.audio.manifest] : []), ...(input.notes ? [input.notes] : []), ...(input.forms ? [input.forms] : []), ...(input.grammarMore ? [input.grammarMore] : []), ...(input.grammar ? [input.grammar] : [])])];
  try {
    const gone = await env.DB.batch(hashes.map((sha) => env.DB.prepare("DELETE FROM staged_files WHERE user_id = ? AND sha256 = ? RETURNING id").bind(actor.userId, sha)));
    const keys = gone.flatMap((r) => (r.results as { id: string }[]).map((row) => stagedKey(actor.userId, row.id)));
    for (let i = 0; i < keys.length; i += 1000) await env.UPLOADS.delete(keys.slice(i, i + 1000));
  } catch (error) {
    console.warn(JSON.stringify({ staged_cleanup_failed: String(error) }));
  }
  return { published: true as const, rev, what: p.summary, files: { written, alreadyThere }, notes: [...p.notes, ...(changed.notes ?? [])], audits: p.audits };
}

/**
 * The catalog change an audio publish makes, applied to the catalog as it is when it's written: the pack must still be at the version
 * the audio was checked against, and its entry keeps what the catalog says now (opt-in, suggested), never what it said when the publish
 * began, so a change made meanwhile isn't undone (6 Nov 2026, the Codex review's C10: an opt-in set during an audio publish was lost).
 */
export function audioChange(found: { lang: string; ref: { id: string; version: string } }, pack: Pack, url: string) {
  return (current: Catalogue): { catalogue: Catalogue | null; problems: string[] } => {
    const live = packRefs(current, found.lang).find((ref: { id: string }) => ref.id === found.ref.id);
    if (live?.version !== found.ref.version) return { catalogue: null, problems: [`${found.ref.id} isn't at ${found.ref.version} on the catalog any more; check its audio against the version there.`] };
    return { catalogue: withPackEntry(current, found.lang, catalogueEntry(pack, found.ref.version, { audio: url, optIn: live.optIn === true, suggest: live.suggest === true })), problems: [] };
  };
}

export type UnpublishTarget = { book: string; layer?: string } | { list: "frequency"; lang: string } | { pack: string; lang: string } | { audio: string; lang: string };

/** Takes a book, a layer or a list off the catalog; its files stay, so a restore brings it back. */
export async function unpublish(env: Env, actor: { userId: string; via: string }, target: UnpublishTarget, expectedRev?: number, note?: string) {
  const state = await currentCatalogue(env);
  checkExpected(state, expectedRev);
  let result: { catalogue: Catalogue; problems: string[] };
  if ("pack" in target) {
    const live = packRefs(state.catalogue, target.lang).find((ref) => ref.id === target.pack);
    result = live ? { catalogue: withoutNotesJs(withoutPack(state.catalogue, target.lang, target.pack), target.pack) as Catalogue, problems: [] } : { catalogue: null, problems: [`There's no default ${target.lang} pack "${target.pack}" on the catalog.`] };
  } else if ("audio" in target) {
    // The pack stays; its entry goes back to having no recordings (the device's own voice reads it).
    // Only a language the catalog has as its own list (never an inherited name like __proto__).
    const packs = state.catalogue.packs ?? {};
    const list = LANGUAGE_CODE.test(target.lang) && Object.hasOwn(packs, target.lang) && Array.isArray(packs[target.lang]) ? (packs[target.lang] as Catalogue[]) : [];
    const entry = list.find((p) => p?.id === target.audio);
    if (!entry?.audio) result = { catalogue: null, problems: [entry ? `${target.audio} has no recorded audio on the catalog.` : `There's no default ${target.lang} pack "${target.audio}" on the catalog.`] };
    else {
      const { audio: _gone, ...rest } = entry;
      result = { catalogue: withPackEntry(state.catalogue, target.lang, rest), problems: [] };
    }
  } else result = without(state.catalogue, target);
  if (result.problems.length) throw new LibraryError(result.problems.join("\n"));
  const label = "pack" in target ? `pack:${target.lang}/${target.pack}` : "audio" in target ? `audio:${target.lang}/${target.audio}` : "list" in target ? `list:frequency.${target.lang}` : target.layer ? `layer:${target.book}/${target.layer}` : `book:${target.book}`;
  const why = note?.trim().slice(0, 500) || null;
  const rev = await writeCatalogue(env, state, result.catalogue, { actorId: actor.userId, action: "unpublish", note: why ?? `Took ${label} off.` }, { actorId: actor.userId, via: actor.via, action: "library.unpublish", target: label, before: { rev: state.rev }, note: why });
  return { rev, unpublished: label, restoreWith: { rev: state.rev }, note: "Its files stay in the library, so devices that have it keep working. library_restore with the revision before brings it back." };
}

/** Puts an earlier revision of the catalog back, as a new revision (so the restore can be undone too). */
export async function restore(env: Env, actor: { userId: string; via: string }, rev: number, expectedRev?: number) {
  const state = await currentCatalogue(env);
  checkExpected(state, expectedRev);
  const row = await env.DB.prepare("SELECT catalogue FROM library_revisions WHERE rev = ?").bind(rev).first<{ catalogue: string }>();
  if (!row) throw new LibraryError(`There's no revision ${rev} (the last ${REVISIONS_KEPT} are kept; library_history lists them).`);
  if (rev === state.rev) throw new LibraryError(`Revision ${rev} is the catalog now.`);
  const catalogue = JSON.parse(row.catalogue);
  // A language's grammar never goes back (packs published since may use what its newer revision added): the newest
  // stays, whatever the restored catalog had.
  const kept = newerGrammar(state.catalogue, catalogue);
  if (Object.keys(kept).length) catalogue.grammar = { ...(catalogue.grammar && typeof catalogue.grammar === "object" ? catalogue.grammar : {}), ...kept };
  const note = `Restored revision ${rev}.${Object.keys(kept).length ? ` The grammar of ${Object.keys(kept).join(", ")} stays at its newest revision.` : ""}`;
  const next = await writeCatalogue(env, state, catalogue, { actorId: actor.userId, action: "restore", note }, { actorId: actor.userId, via: actor.via, action: "library.restore", target: `rev:${rev}`, before: { rev: state.rev } });
  return { rev: next, restored: rev, undoWith: { rev: state.rev }, ...(Object.keys(kept).length ? { grammarKept: Object.keys(kept) } : {}) };
}

/** Sets the shelf's sections ([] takes them off). */
export async function setShelf(env: Env, actor: { userId: string; via: string }, sections: unknown, expectedRev?: number) {
  const state = await currentCatalogue(env);
  checkExpected(state, expectedRev);
  const result = withShelf(state.catalogue, sections);
  if (result.problems.length) throw new LibraryError(result.problems.join("\n"));
  const rev = await writeCatalogue(
    env,
    state,
    result.catalogue,
    { actorId: actor.userId, action: "shelf", note: result.sections!.length ? `The shelf's sections: ${result.sections!.map((s: { title: string }) => s.title).join(", ")}.` : "The shelf's sections taken off." },
    { actorId: actor.userId, via: actor.via, action: "library.shelf", target: "shelf", before: { rev: state.rev, shelf: state.catalogue.shelf ?? null }, after: { shelf: result.sections } },
  );
  return { rev, sections: result.sections, undoWith: { rev: state.rev } };
}

/**
 * For deleting an account (accounts.ts deleteAccount): a statement, for its batch, that deletes every staged file's row
 * and returns their ids, pending ones included; then stagedKeysOf(those results) are the bytes to delete. Taken from the
 * delete itself, so a file staged while the account is being deleted is in it; one arriving after keeps nothing
 * (receiveStaged).
 */
export const deleteStagedStatement = (env: Env, userId: string) => env.DB.prepare("DELETE FROM staged_files WHERE user_id = ? RETURNING id, r2_key").bind(userId);
export const stagedKeysOf = (userId: string, result: D1Result) => (result.results as { id: string }[]).map((row) => stagedKey(userId, row.id));
