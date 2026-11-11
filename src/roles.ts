// Roles and the admin log. A role ('admin', 'moderator') is a row in user_roles, set only with SQL on the database
// itself: nothing here, in the REST API or in the MCP grants one. Every call that needs a role reads it from D1 again
// (requireRole), so a role taken away stops working at the next call, whatever a client cached. A personal token only
// reaches a role's tools when it was made with admin access; OAuth connections always do (their owner signed in).

import type { CallerProps, Env } from "./env";
import { LibraryError } from "./library";
import { randomId } from "./util";

export type Role = "admin" | "moderator";

export class RoleError extends LibraryError {}

export async function rolesOf(env: Env, userId: string): Promise<Set<Role>> {
  return rolesFrom((await rolesStatement(env, userId).all<{ role: Role }>()).results);
}
/** The role read as a statement, for a batch (GET /api/me), and its rows as roles. */
export const rolesStatement = (env: Env, userId: string) => env.DB.prepare("SELECT role FROM user_roles WHERE user_id = ?").bind(userId);
export const rolesFrom = (rows: { role: Role }[]) => new Set(rows.map((r) => r.role));

/** Whether this connection may use a role's tools at all: OAuth always, a personal token only with admin access. */
export const connectionReachesRoles = (caller: CallerProps) => caller.via === "oauth" || caller.tokenAdmin === true;

/** The roles this connection may act with right now: none for a personal token made without admin access. */
export async function callerRoles(env: Env, caller: CallerProps): Promise<Set<Role>> {
  return connectionReachesRoles(caller) ? rolesOf(env, caller.userId) : new Set();
}

/** Throws unless the caller has the role now (read from D1) and reaches it through this connection. */
export async function requireRole(env: Env, caller: CallerProps, role: Role): Promise<void> {
  if (!connectionReachesRoles(caller)) throw new RoleError("This personal token was made without admin access, so it can't use admin tools. Make a token with admin access in Settings → Your AI, or connect over MCP sign-in.");
  if (!(await rolesOf(env, caller.userId)).has(role)) throw new RoleError(`This account isn't ${role === "admin" ? "an admin" : "a moderator"} (any more), so it can't do that.`);
}

export interface AdminLogEntry {
  id: string;
  actorId: string;
  actorName: string | null;
  via: string;
  action: string;
  target: string | null;
  before: unknown;
  after: unknown;
  note: string | null;
  at: number;
}

export interface AdminLogInput {
  actorId: string;
  via: string;
  action: string;
  target?: string | null;
  before?: unknown;
  after?: unknown;
  note?: string | null;
}

/** An admin log entry as a statement, to go in the same batch as the change it records. */
export function adminLogStatement(env: Env, entry: AdminLogInput): D1PreparedStatement {
  return env.DB.prepare("INSERT INTO admin_log (id, actor_id, via, action, target, before, after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
    randomId(10),
    entry.actorId,
    entry.via,
    entry.action,
    entry.target ?? null,
    entry.before === undefined ? null : JSON.stringify(entry.before),
    entry.after === undefined ? null : JSON.stringify(entry.after),
    entry.note?.slice(0, 1000) ?? null,
    Date.now(),
  );
}

export async function logAdmin(env: Env, entry: AdminLogInput): Promise<void> {
  await adminLogStatement(env, entry).run();
}

/** The admin log, newest first; before: an entry's time, to page back. */
export async function adminLog(env: Env, { limit = 50, before, action }: { limit?: number; before?: number; action?: string } = {}): Promise<AdminLogEntry[]> {
  const rows = await env.DB.prepare(
    `SELECT l.*, u.name AS actor_name FROM admin_log l LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.created_at < ? AND (? IS NULL OR l.action = ? OR l.action LIKE ? || '.%') ORDER BY l.created_at DESC LIMIT ?`,
  )
    .bind(before ?? Number.MAX_SAFE_INTEGER, action ?? null, action ?? null, action ?? null, Math.min(Math.max(limit, 1), 200))
    .all<{ id: string; actor_id: string; actor_name: string | null; via: string; action: string; target: string | null; before: string | null; after: string | null; note: string | null; created_at: number }>();
  const parse = (text: string | null) => (text === null ? null : (JSON.parse(text) as unknown));
  return rows.results.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    via: r.via,
    action: r.action,
    target: r.target,
    before: parse(r.before),
    after: parse(r.after),
    note: r.note,
    at: r.created_at,
  }));
}
