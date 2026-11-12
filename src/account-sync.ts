// The account's own copy of a learner's progress and own packs: the files sync writes (public/js/sync.js), kept here for the account's own
// devices, so signing in on a device with nothing on it brings them back. The server is one more storage to sync with: it lists, reads and writes
// files by name and never looks inside one, merges nothing, and knows no more of what a file holds than its kind's name. Rows in D1
// (account_sync: name, size, version), bytes in R2. In the export (exportAccountSync), gone with the account (forgetAccountSync), read
// and written only by the account's own cookie session.
//
// What it keeps, by the file's kind (ACCOUNT_SYNC_KINDS): progress, and from 12 Nov 2026 the learner's own packs (one your AI made reached
// only the devices signed in while the relay held it), a file per pack. A file of any other kind is refused: the packs' recordings and books
// stay on the device and in a storage of the learner's own.

import type { Env } from "./env";
import { LibraryError } from "./library";
import { OverLimit } from "./moderation";
import { randomId } from "./util";

/** The kinds of file kept: each a kind sync knows (public/js: its registerSync id). */
export const ACCOUNT_SYNC_KINDS = ["progress", "streak", "path", "word-bank", "highlights", "reading-place", "sound", "packs"] as const;

export const ACCOUNT_SYNC_LIMITS = {
  // One file. Measured 11 Nov 2026: lesson 1's 42 answers are 15,600 bytes over three files, about 330 bytes an answer at most; the sample
  // learner a year in has 170,649 rows over 286 days, so a heavy month on one device is about 5 MB and a year about 56 MB.
  fileBytes: 12 * 1024 * 1024,
  // An account's files: its devices × its kinds, months and packs (each device writes its own file of each pack: three devices with 200
  // packs are 600 files).
  files: 2000,
  // An account's files together: several years of a heavy learner on a few devices, and about 65 decks at a pack's most (2 MB) on three.
  bytes: 400 * 1024 * 1024,
  name: 120,
};

// lexicommons-<kind>[.<shard>].<account tag>.<device>.json, as sync.js fileName writes it.
const NAME = /^lexicommons-([a-z][a-z0-9-]{1,40})(?:\.([a-z0-9][a-z0-9-]{0,63}))?\.([0-9a-f]{8})\.([0-9a-f]{8})\.json$/;

export class SyncClash extends Error {}

/** A file's kind when its name is one this store keeps, else null. */
export function kindOfName(name: string): string | null {
  if (typeof name !== "string" || name.length > ACCOUNT_SYNC_LIMITS.name) return null;
  const kind = NAME.exec(name)?.[1] ?? null;
  return kind && (ACCOUNT_SYNC_KINDS as readonly string[]).includes(kind) ? kind : null;
}

const keyOf = (userId: string, name: string, version: string) => `account-sync/${userId}/${name}/${version}`;
type Row = { name: string; size: number; version: string; updated_at: number };

/** The account's files: [{ name, version, size }], by name. One read. */
export async function listAccountSync(env: Env, userId: string) {
  const rows = await env.DB.prepare("SELECT name, size, version FROM account_sync WHERE user_id = ? ORDER BY name").bind(userId).all<Pick<Row, "name" | "size" | "version">>();
  return rows.results.map((row) => ({ name: row.name, version: row.version, size: row.size }));
}

/** One file's text, or null when the account has none by that name. */
export async function readAccountSync(env: Env, userId: string, name: string): Promise<string | null> {
  if (!kindOfName(name)) return null;
  const row = await env.DB.prepare("SELECT version FROM account_sync WHERE user_id = ? AND name = ?").bind(userId, name).first<{ version: string }>();
  if (!row) return null;
  const object = await env.UPLOADS.get(keyOf(userId, name, row.version));
  return object ? await object.text() : null;
}

/**
 * Writes a file over the version the device last saw (`seen`: null when it saw none). Refused with nothing written when its name isn't
 * one kept here, it's too big, or the account's files would pass their limits; a SyncClash when another write got there first (the
 * device lists again and merges, as with any storage). Answers { version }.
 */
export async function writeAccountSync(env: Env, userId: string, name: string, text: string, seen: string | null, now = Date.now()) {
  if (!kindOfName(name)) throw new LibraryError("That isn't a file this account keeps.");
  const bytes = new TextEncoder().encode(text);
  if (!bytes.byteLength) throw new LibraryError("That file is empty.");
  if (bytes.byteLength > ACCOUNT_SYNC_LIMITS.fileBytes) throw new LibraryError("That file is too big to keep with your account.");
  // What the account has, in one read: the row it writes over, and the room left.
  const held = await env.DB.prepare("SELECT name, size, version FROM account_sync WHERE user_id = ?").bind(userId).all<Pick<Row, "name" | "size" | "version">>();
  const own = held.results.find((row) => row.name === name) ?? null;
  if ((own?.version ?? null) !== (seen ?? null)) throw new SyncClash();
  const others = held.results.filter((row) => row.name !== name);
  if (!own && others.length >= ACCOUNT_SYNC_LIMITS.files) throw new OverLimit("Your account keeps as many files as it can. Nothing is lost on this device.");
  if (others.reduce((sum, row) => sum + row.size, 0) + bytes.byteLength > ACCOUNT_SYNC_LIMITS.bytes) throw new OverLimit("Your account's copy is full. Nothing is lost on this device.");
  // The bytes first, under a key of their own version; then the row, only if it's still the one seen. A write that loses takes its bytes away.
  const version = randomId(8);
  await env.UPLOADS.put(keyOf(userId, name, version), bytes, { httpMetadata: { contentType: "application/json" } });
  const written = own
    ? await env.DB.prepare("UPDATE account_sync SET size = ?, version = ?, updated_at = ? WHERE user_id = ? AND name = ? AND version = ?").bind(bytes.byteLength, version, now, userId, name, own.version).run()
    : await env.DB.prepare("INSERT INTO account_sync (user_id, name, size, version, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, name) DO NOTHING").bind(userId, name, bytes.byteLength, version, now).run();
  if (!written.meta.changes) {
    await env.UPLOADS.delete(keyOf(userId, name, version));
    throw new SyncClash();
  }
  if (own) await env.UPLOADS.delete(keyOf(userId, name, own.version));
  return { version };
}

/** For the export: every file with its size, when it was written, and its text. */
export async function exportAccountSync(env: Env, userId: string) {
  const rows = await env.DB.prepare("SELECT name, size, version, updated_at FROM account_sync WHERE user_id = ? ORDER BY name").bind(userId).all<Row>();
  return Promise.all(
    rows.results.map(async (row) => {
      const object = await env.UPLOADS.get(keyOf(userId, row.name, row.version));
      return { name: row.name, size: row.size, updatedAt: row.updated_at, text: object ? await object.text() : null };
    }),
  );
}

/** For deleteAccount's batch: the rows go, saying which they were. */
export const forgetAccountSyncStatement = (env: Env, userId: string) => env.DB.prepare("DELETE FROM account_sync WHERE user_id = ? RETURNING name, version").bind(userId);
/** Their bytes' keys, from what that statement returned. */
export const accountSyncKeysOf = (userId: string, result: { results?: unknown[] } | undefined) =>
  ((result?.results ?? []) as { name: string; version: string }[]).map((row) => keyOf(userId, row.name, row.version));
