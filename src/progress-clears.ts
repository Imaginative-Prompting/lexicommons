// Clears of study progress everywhere: the account's record of each (public/js/study/progress.js applies the ones it
// lists, on every device using your own storage), so a file in that storage can't clear anything. When, never what:
// no answers are kept here (migration 0011).

import type { Env } from "./env";
import { LibraryError } from "./library";

export const CLEAR_LIMITS = {
  undoDays: 7, // Undo of a clear, as long as the devices keep what it took
  settle: 3_600_000, // past Undo's days by this, a clear is final: no Undo can still be on its way, so devices let go
  perAccount: 500,
  ahead: 86_400_000, // a clear may cover up to a day past the server's clock (a device whose clock runs ahead)
};
const DAY = 86_400_000;
const CLEAR_ID = /^[0-9a-f]{16}$/;

type Row = { id: string; before_at: number; at: number; undone: number };
/** A clear as the app reads it; final: in force and past Undo, so the rows it took can go. */
const shape = (r: Row, now = Date.now()) => ({
  id: r.id,
  before: r.before_at,
  at: r.at,
  undone: Boolean(r.undone),
  final: !r.undone && now - r.at > CLEAR_LIMITS.undoDays * DAY + CLEAR_LIMITS.settle,
});
const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** The account's clears, oldest first: [{ id, before, at, undone }]. */
export async function listClears(env: Env, userId: string) {
  const rows = await env.DB.prepare("SELECT id, before_at, at, undone FROM progress_clears WHERE user_id = ? ORDER BY at, id").bind(userId).all<Row>();
  const now = Date.now();
  return rows.results.map((r) => shape(r, now));
}

/** Records a clear ({ id, before }); the same id again gives the one recorded. */
export async function addClear(env: Env, userId: string, input: unknown) {
  const body = isObject(input) ? input : {};
  const id = typeof body.id === "string" ? body.id : "";
  const before = body.before;
  if (!CLEAR_ID.test(id)) throw new LibraryError("id must be 16 lowercase hex characters.");
  const now = Date.now();
  if (typeof before !== "number" || !Number.isInteger(before) || before <= 0 || before > now + CLEAR_LIMITS.ahead) {
    throw new LibraryError("before must be a time (ms), no later than a day from now.");
  }
  const get = () => env.DB.prepare("SELECT id, before_at, at, undone FROM progress_clears WHERE user_id = ? AND id = ?").bind(userId, id).first<Row>();
  // The same id again: the one recorded (a retry), whatever the count.
  const already = await get();
  if (already) return shape(already);
  // Made at the server's time, or at what it covers if that's later, so a clear never covers what came after it; the
  // limit is part of the write, so clears sent at once can't all pass a count taken first.
  await env.DB.prepare(
    `INSERT INTO progress_clears (user_id, id, before_at, at, undone)
     SELECT ?1, ?2, ?3, ?4, 0 WHERE (SELECT COUNT(*) FROM progress_clears WHERE user_id = ?1) < ?5
     ON CONFLICT (user_id, id) DO NOTHING`,
  )
    .bind(userId, id, before, Math.max(now, before), CLEAR_LIMITS.perAccount)
    .run();
  const row = await get();
  if (!row) throw new LibraryError(`An account keeps up to ${CLEAR_LIMITS.perAccount} clears.`);
  return shape(row);
}

/** Undoes a clear, within CLEAR_LIMITS.undoDays of it; one already undone stays so. */
export async function undoClear(env: Env, userId: string, id: string) {
  if (!CLEAR_ID.test(id)) throw new LibraryError("That isn't a clear's id.");
  const row = await env.DB.prepare("SELECT id, before_at, at, undone FROM progress_clears WHERE user_id = ? AND id = ?").bind(userId, id).first<Row>();
  if (!row) throw new LibraryError("There's no such clear.");
  if (row.undone) return shape(row);
  const now = Date.now();
  const tooLate = `A clear can be undone for ${CLEAR_LIMITS.undoDays} days; this one is older.`;
  if (now - row.at > CLEAR_LIMITS.undoDays * DAY) throw new LibraryError(tooLate);
  // Later than the clear, so every device sees the Undo as the newer; and only while it's still within its days, so an
  // Undo can't land once a device may have let go (final).
  await env.DB.prepare("UPDATE progress_clears SET undone = 1, at = ? WHERE user_id = ? AND id = ? AND undone = 0 AND at >= ?")
    .bind(Math.max(now, row.at + 1), userId, id, now - CLEAR_LIMITS.undoDays * DAY)
    .run();
  const after = await env.DB.prepare("SELECT id, before_at, at, undone FROM progress_clears WHERE user_id = ? AND id = ?").bind(userId, id).first<Row>();
  if (!after?.undone) throw new LibraryError(tooLate);
  return shape(after);
}
