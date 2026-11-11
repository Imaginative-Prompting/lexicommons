// The piping proof's data: notes an AI writes for a user, and files it uploads through signed URLs. MCP, the REST
// API and the app all call these same functions, so every route runs the same checks.

import { IMAGE_TYPES, LOOK_LIMITS } from "../public/js/lx/look-rules.js";
import type { Env } from "./env";
import { receiveLookImage } from "./looks";
import { fileSafetyHeaders, hmacHex, randomId, readBytesLimited, secretsEqual, sha256Hex } from "./util";

const NOTE_MAX_CHARS = 2000;
const NOTES_PER_USER_MAX = 500;
const UPLOAD_URL_SECONDS = 15 * 60;
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOADS_PER_USER_MAX = 200;
const ABANDONED_UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000;

// Audio is what the real app needs; the others prove the same path for images, books and plain test files.
export const UPLOAD_TYPES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/webm",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/epub+zip",
  "text/plain",
]);

export class LibraryError extends Error {}

export interface Note {
  id: string;
  text: string;
  source: string;
  createdAt: number;
}

export async function addNote(env: Env, userId: string, text: string, source: string): Promise<Note> {
  const clean = text.trim();
  if (!clean) throw new LibraryError("A note needs some text.");
  if (clean.length > NOTE_MAX_CHARS) throw new LibraryError(`Notes are limited to ${NOTE_MAX_CHARS} characters.`);
  const note = { id: randomId(12), text: clean, source, createdAt: Date.now() };
  // The limit counted in the write itself, so notes sent at once can't all pass it (6 Nov 2026, Codex C19).
  const added = await env.DB.prepare("INSERT INTO notes (id, user_id, text, source, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM notes WHERE user_id = ?) < ?")
    .bind(note.id, userId, note.text, note.source, note.createdAt, userId, NOTES_PER_USER_MAX)
    .run();
  if (!added.meta.changes) throw new LibraryError(`This account already has ${NOTES_PER_USER_MAX} notes.`);
  return note;
}

export async function listNotes(env: Env, userId: string, limit = 50): Promise<Note[]> {
  const rows = await env.DB.prepare("SELECT id, text, source, created_at FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(userId, Math.min(Math.max(limit, 1), 200))
    .all<{ id: string; text: string; source: string; created_at: number }>();
  return rows.results.map((r) => ({ id: r.id, text: r.text, source: r.source, createdAt: r.created_at }));
}

export interface UploadTicket {
  id: string;
  uploadUrl: string;
  method: "PUT";
  contentType: string;
  maxBytes: number;
  expiresAt: number;
  curl: string;
}

/** Where an upload's bytes live: fixed by its id, so deleting an account finds them even mid-upload. */
export const uploadKey = (userId: string, id: string) => `users/${userId}/uploads/${id}`;

function signedMessage(id: string, expiresAt: number): string {
  return `upload.${id}.${expiresAt}`;
}

/**
 * What a purpose allows: "look:<slot>" an image for the look (up to 4 MB, any image type the look allows: when it lands
 * it goes straight into that slot); "text:<format>" a text for your AI to add to your reading library (src/texts.ts:
 * plain text or a lexicommons-book up to 8 MB, an EPUB up to 10 MB, a cover as SVG up to 64 KB); "pack-audio:<format>" a
 * recording your AI made for a pack of yours (src/packs.ts setPackAudio: an MP3 or an MP4's audio, up to 2 MB); none,
 * any upload type.
 */
export const TEXT_UPLOADS: Record<string, { type: string; maxBytes: number }> = {
  text: { type: "text/plain", maxBytes: 8_000_000 },
  book: { type: "application/json", maxBytes: 8_000_000 },
  weave: { type: "application/json", maxBytes: 8_000_000 }, // a weave layer too big for add_weave's arguments
  epub: { type: "application/epub+zip", maxBytes: 10 * 1024 * 1024 },
  cover: { type: "image/svg+xml", maxBytes: 64 * 1024 },
};
export const PACK_AUDIO_UPLOADS: Record<string, { type: string; maxBytes: number }> = {
  mp3: { type: "audio/mpeg", maxBytes: 2 * 1024 * 1024 },
  m4a: { type: "audio/mp4", maxBytes: 2 * 1024 * 1024 },
};
function purposeAllows(purpose: string | null | undefined): { types: readonly string[]; maxBytes: number } {
  if (purpose?.startsWith("look:")) return { types: IMAGE_TYPES, maxBytes: LOOK_LIMITS.imageBytes };
  if (purpose?.startsWith("pack-audio:")) {
    const kind = PACK_AUDIO_UPLOADS[purpose.slice(11)];
    if (kind) return { types: [kind.type], maxBytes: kind.maxBytes };
  }
  if (purpose?.startsWith("text:")) {
    const kind = TEXT_UPLOADS[purpose.slice(5)];
    if (kind) return { types: [kind.type], maxBytes: kind.maxBytes };
  }
  return { types: [...UPLOAD_TYPES], maxBytes: UPLOAD_MAX_BYTES };
}

/** A signed upload link, for what its purpose allows (purposeAllows). */
export async function requestUpload(
  env: Env,
  userId: string,
  input: { filename: string; contentType: string; purpose?: string },
  source: string,
): Promise<UploadTicket> {
  const filename = input.filename.trim().replace(/[\\/]/g, "_").slice(0, 120);
  if (!filename) throw new LibraryError("A filename is required.");
  const forLook = input.purpose?.startsWith("look:") ?? false;
  const forText = input.purpose?.startsWith("text:") && Object.hasOwn(TEXT_UPLOADS, input.purpose.slice(5));
  const forPackAudio = input.purpose?.startsWith("pack-audio:") && Object.hasOwn(PACK_AUDIO_UPLOADS, input.purpose.slice(11));
  if (input.purpose && !forLook && !forText && !forPackAudio) throw new LibraryError("Unknown upload purpose.");
  const { types, maxBytes } = purposeAllows(input.purpose);
  if (!types.includes(input.contentType)) {
    throw new LibraryError(`Unsupported content type. Allowed: ${types.join(", ")}.`);
  }
  const now = Date.now();
  // Links nobody used are dropped a day after they expired, so abandoned requests don't pile up or count.
  await env.DB.prepare("DELETE FROM uploads WHERE user_id = ? AND status = 'pending' AND expires_at < ?")
    .bind(userId, now - ABANDONED_UPLOAD_GRACE_MS)
    .run();
  const id = randomId(12);
  const expiresAt = now + UPLOAD_URL_SECONDS * 1000;
  // The limit counted in the write itself, so requests sent at once can't all pass it (6 Nov 2026, Codex C19).
  const asked = await env.DB.prepare(
    "INSERT INTO uploads (id, user_id, filename, content_type, status, source, created_at, expires_at, purpose) SELECT ?, ?, ?, ?, 'pending', ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM uploads WHERE user_id = ?) < ?",
  )
    .bind(id, userId, filename, input.contentType, source, now, expiresAt, input.purpose ?? null, userId, UPLOADS_PER_USER_MAX)
    .run();
  if (!asked.meta.changes) throw new LibraryError(`This account already has ${UPLOADS_PER_USER_MAX} uploads.`);
  const signature = await hmacHex(env.UPLOAD_SIGNING_SECRET, signedMessage(id, expiresAt));
  const uploadUrl = `${env.PUBLIC_ORIGIN}/upload/${id}?exp=${expiresAt}&sig=${signature}`;
  return {
    id,
    uploadUrl,
    method: "PUT",
    contentType: input.contentType,
    maxBytes,
    expiresAt,
    curl: `curl -sS -X PUT -H 'Content-Type: ${input.contentType}' --data-binary @'${filename.replace(/'/g, "")}' '${uploadUrl}'`,
  };
}

/** PUT /upload/:id: the signature is the only credential, so it's checked before anything else is read. */
export async function receiveUpload(request: Request, env: Env, id: string, url: URL): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (request.method !== "PUT") return json({ error: "Use PUT." }, 405);
  const expiresAt = Number(url.searchParams.get("exp"));
  const signature = url.searchParams.get("sig") ?? "";
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return json({ error: "This upload link has expired." }, 403);
  if (!(await secretsEqual(signature, await hmacHex(env.UPLOAD_SIGNING_SECRET, signedMessage(id, expiresAt))))) {
    return json({ error: "Invalid upload link." }, 403);
  }
  const row = await env.DB.prepare("SELECT user_id, filename, content_type, status, source, purpose FROM uploads WHERE id = ?")
    .bind(id)
    .first<{ user_id: string; filename: string; content_type: string; status: string; source: string; purpose: string | null }>();
  if (!row) return json({ error: "Unknown upload." }, 404);
  if (row.status !== "pending") return json({ error: "This upload link was already used." }, 409);
  const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim();
  if (contentType !== row.content_type) return json({ error: `Send Content-Type: ${row.content_type}.` }, 415);
  const { maxBytes } = purposeAllows(row.purpose);
  // Read only up to the limit, so a body sent without a Content-Length can't be buffered past it.
  const bytes = await readBytesLimited(request, maxBytes);
  if (!bytes) return json({ error: "File too large." }, 413);
  if (bytes.byteLength === 0) return json({ error: "The file is empty." }, 400);
  const body = bytes.buffer as ArrayBuffer;
  const sha256 = await sha256Hex(body);
  if (row.purpose?.startsWith("look:")) {
    // An image for the look: stored with the look's images (not as a file), and put into its slot.
    const slot = row.purpose.slice(5);
    try {
      const { rev, image } = await receiveLookImage(env, row.user_id, slot, row.filename, row.content_type, body, row.source);
      await env.DB.prepare("UPDATE uploads SET status = 'stored', size = ?, sha256 = ?, stored_at = ? WHERE id = ? AND status = 'pending'").bind(body.byteLength, sha256, Date.now(), id).run();
      return json({ ok: true, id, size: body.byteLength, sha256, slot, lookRev: rev, cssVar: `--image-${slot}`, image: image.name });
    } catch (error) {
      if (error instanceof LibraryError) return json({ error: error.message }, 400);
      throw error;
    }
  }
  const key = uploadKey(row.user_id, id);
  // Created only if absent: the same link sent twice at once stores one file, not the later one over the first.
  const put = await env.UPLOADS.put(key, body, { httpMetadata: { contentType: row.content_type }, sha256, onlyIf: new Headers({ "If-None-Match": "*" }) });
  if (!put) return json({ error: "This upload link was already used." }, 409);
  const stored = await env.DB.prepare("UPDATE uploads SET status = 'stored', size = ?, sha256 = ?, r2_key = ?, stored_at = ? WHERE id = ? AND status = 'pending'")
    .bind(body.byteLength, sha256, key, Date.now(), id)
    .run();
  if (!stored.meta.changes) {
    // Its row went with its account while the bytes were arriving: nothing may stay behind.
    await env.UPLOADS.delete(key);
    return json({ error: "This upload was canceled (its account is gone). Nothing was kept." }, 410);
  }
  return json({ ok: true, id, size: body.byteLength, sha256 });
}

export interface UploadSummary {
  id: string;
  filename: string;
  contentType: string;
  status: string;
  size: number | null;
  sha256: string | null;
  source: string;
  createdAt: number;
}

export async function listUploads(env: Env, userId: string, limit = 50): Promise<UploadSummary[]> {
  // A pending link past its expiry reads as 'expired': no file can arrive through it any more.
  const rows = await env.DB.prepare(
    "SELECT id, filename, content_type, CASE WHEN status = 'pending' AND expires_at < ? THEN 'expired' ELSE status END AS status, size, sha256, source, created_at FROM uploads WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
  )
    .bind(Date.now(), userId, Math.min(Math.max(limit, 1), 200))
    .all<{
      id: string;
      filename: string;
      content_type: string;
      status: string;
      size: number | null;
      sha256: string | null;
      source: string;
      created_at: number;
    }>();
  return rows.results.map((r) => ({
    id: r.id,
    filename: r.filename,
    contentType: r.content_type,
    status: r.status,
    size: r.size,
    sha256: r.sha256,
    source: r.source,
    createdAt: r.created_at,
  }));
}

/** Streams one of the user's stored files (the app plays audio from here). */
export async function serveUpload(env: Env, userId: string, id: string): Promise<Response> {
  // A text's uploads (purposes text:…, text-claim:…, text-in:…) and a pack's recordings (pack-audio…) are never served
  // here: only a change's checked files are, to the account's devices (src/texts.ts serveTextFile, src/packs.ts
  // serveChangeClip).
  const row = await env.DB.prepare("SELECT r2_key, content_type FROM uploads WHERE id = ? AND user_id = ? AND status = 'stored' AND (purpose IS NULL OR (purpose NOT LIKE 'text%' AND purpose NOT LIKE 'pack-audio%'))")
    .bind(id, userId)
    .first<{ r2_key: string; content_type: string }>();
  if (!row) return new Response("Not found", { status: 404 });
  const object = await env.UPLOADS.get(row.r2_key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: { "Content-Type": row.content_type, "Cache-Control": "private, max-age=3600", "Content-Length": String(object.size), ...fileSafetyHeaders(row.content_type) },
  });
}

// --- Personal access tokens: for scripts and clients without OAuth. Same tools, same checks, same per-user data.

export interface TokenSummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  /** Made with admin access (only an admin's tokens can be). */
  admin: boolean;
}

export async function createToken(env: Env, userId: string, name: string, { admin = false }: { admin?: boolean } = {}): Promise<{ token: string; summary: TokenSummary }> {
  const label = name.trim().slice(0, 60);
  if (!label) throw new LibraryError("Give the token a name, so you can tell it apart later.");
  // Admin access only for an admin's or a moderator's own token (src/roles.ts): it lets a script (the monitoring agent,
  // say) reach that role's tools.
  if (admin && !(await env.DB.prepare("SELECT 1 AS y FROM user_roles WHERE user_id = ? AND role IN ('admin', 'moderator')").bind(userId).first())) {
    throw new LibraryError("Only an admin or a moderator can make a token with admin access.");
  }
  const token = `lct_${randomId(32)}`;
  const summary = { id: randomId(9), name: label, prefix: token.slice(0, 10), createdAt: Date.now(), lastUsedAt: null, admin };
  // 20 active at most, counted in the write itself, so tokens made at once can't all pass it (6 Nov 2026, Codex C19).
  const made = await env.DB.prepare(
    "INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL) < 20",
  )
    .bind(summary.id, userId, summary.name, await sha256Hex(token), summary.prefix, summary.createdAt, admin ? 1 : 0, userId)
    .run();
  if (!made.meta.changes) throw new LibraryError("You have 20 active tokens. Revoke one first.");
  return { token, summary };
}

export async function listTokens(env: Env, userId: string): Promise<TokenSummary[]> {
  const rows = await env.DB.prepare(
    "SELECT id, name, prefix, created_at, last_used_at, admin FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC",
  )
    .bind(userId)
    .all<{ id: string; name: string; prefix: string; created_at: number; last_used_at: number | null; admin: number }>();
  return rows.results.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: r.created_at, lastUsedAt: r.last_used_at, admin: r.admin === 1 }));
}

export async function revokeToken(env: Env, userId: string, id: string): Promise<boolean> {
  const result = await env.DB.prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
    .bind(Date.now(), id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Resolves a personal access token to its owner, or null. */
export async function resolveToken(env: Env, token: string): Promise<{ userId: string; name: string; tokenName: string; tokenAdmin: boolean } | null> {
  if (!token.startsWith("lct_") || token.length > 80) return null;
  const row = await env.DB.prepare(
    "SELECT t.id, t.name AS token_name, t.last_used_at, t.admin, u.id AS user_id, u.name FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.revoked_at IS NULL",
  )
    .bind(await sha256Hex(token))
    .first<{ id: string; token_name: string; last_used_at: number | null; admin: number; user_id: string; name: string }>();
  if (!row) return null;
  // Record use at most once a minute, so a busy script doesn't write on every call.
  if (!row.last_used_at || Date.now() - row.last_used_at > 60_000) {
    await env.DB.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  }
  return { userId: row.user_id, name: row.name, tokenName: row.token_name, tokenAdmin: row.admin === 1 };
}
