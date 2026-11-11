// Feature flags: the site's launch switches, flipped by an admin in the app (Settings → Admin) or by an admin's AI, with no deploy.
//
// wrangler.jsonc's vars are the defaults. A value an admin stored (feature_flags, migration 0029) overrides one. The effective values are laid
// over env at the Worker's entry (index.ts: withFlags), so every check that reads env.COMMUNITY_SHARING, env.PLAN_ENABLED and the rest reads
// them unchanged, /api/me's mayShare and features with them. Each isolate keeps the stored values FLAG_TTL ms (a write clears its own at
// once), so a change reaches every request within a minute. When D1 can't be read, the last values read stand for FLAG_STALE, then the
// deploy's (closed: a switch that opens something never stays open on old news), and it isn't asked again for FLAG_TTL. A switch that
// closes something in trouble keeps its closed value while D1 can't be read (holdWhileUnread: SIGNUPS "paused"). An admin's own read
// or change never goes on values it couldn't read: it fails, and says so.
//
// A switch that needs secrets (the plan needs Stripe's, Apple needs its key) turns on only while they're set: setting it on without them is
// refused in words, and a stored "on" whose secrets went stays off. Every change is in the admin log: who, when, old → new, and why. The gate's
// switches aren't here: whether the site is public at all stays a deploy's. Site-wide changes are the director's, over MCP and REST only.
//
// The app's Feature flags page (an admin's, Settings → Admin) previews instead: an admin turns a flag on for their own device alone. The
// device's previews ride in an HttpOnly cookie (PREVIEW_COOKIE); withPreviews honors it only on an admin's session, for that request alone:
// nothing is stored, nothing logged, and no one else's requests change. A learner's cookie is ignored.

import type { Env } from "./env";
import { LibraryError } from "./library";
import { PREVIEWS } from "./offered";
import { adminLogStatement, rolesOf } from "./roles";
import { getSessionUser } from "./sessions";
import { readCookie } from "./util";

export type FlagValue = boolean | string;

interface FlagSpec {
  name: string;
  title: string;
  about: string;
  kind: "switch" | "choice";
  values?: readonly string[];
  /** The deploy's value, from wrangler.jsonc's vars (and secrets). */
  defaultOf: (env: Env) => FlagValue;
  /** For a switch: what has to be set before it can be on, null when nothing is: { missing } in plain words, { how } the names and the doc. */
  missing?: (env: Env) => { missing: string; how: string } | null;
  /** The vars this value means, laid over the deploy's. */
  apply: (value: FlagValue) => Partial<Env>;
  /** What previewing it on an admin's device means for that admin's requests (the plan's is the PREVIEWS mark alone: offered.ts planShown). */
  preview: (deploy: Env) => Partial<Env>;
  /** Why it can't be previewed here, in plain words, or null. */
  cannotPreview?: (deploy: Env) => string | null;
  /**
   * A stored value that holds while D1 can't be read, past FLAG_STALE, instead of falling back to the deploy's: the closed state of a
   * switch that closes something when D1 is in trouble (SIGNUPS "paused"), which falling back would open in the middle of an overload.
   */
  holdWhileUnread?: (value: FlagValue) => boolean;
}

const absent = (env: Env, names: (keyof Env)[]) => names.filter((name) => !env[name]);
const listed = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]);
const isTrue = (value: unknown) => value === "true";

export const FLAGS: readonly FlagSpec[] = [
  {
    name: "COMMUNITY_SHARING",
    // Titled as what turns on, beside the Feature flags page's switch; its value is still "admins" or "everyone" for the director.
    title: "Sharing open to everyone",
    about: "Share, Ask for it, fixes and flags in Explore, as everyone would have them.",
    kind: "choice",
    values: ["admins", "everyone"],
    defaultOf: (env) => (env.COMMUNITY_SHARING === "everyone" ? "everyone" : "admins"),
    apply: (value) => ({ COMMUNITY_SHARING: String(value) }),
    preview: () => ({ COMMUNITY_SHARING: "everyone" }),
  },
  {
    name: "PLAN_ENABLED",
    title: "The paid plan",
    about: "Lexicommons Cloud and the included AI, the pricing page, and what the privacy policy and terms say about them.",
    kind: "switch",
    defaultOf: (env) => isTrue(env.PLAN_ENABLED),
    missing: (env) => {
      const gone = absent(env, ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_YEARLY"]);
      return gone.length ? { missing: "Stripe's keys and prices aren't set", how: `Set ${listed(gone)} (the prices as vars, the keys as the Worker's secrets), then deploy.` } : null;
    },
    apply: (value) => ({ PLAN_ENABLED: value ? "true" : "false" }),
    // Its pages and words for this admin; Checkout and the rest still go by planOffered, so nothing can be bought until Stripe's keys are set.
    preview: () => ({}),
  },
  {
    name: "OWN_KEY_ENABLED",
    title: "A key of your own for the in-app AI",
    about: "Practice and Translate with AI in the app, on an OpenRouter key a person adds on their device.",
    kind: "switch",
    defaultOf: (env) => isTrue(env.OWN_KEY_ENABLED),
    apply: (value) => ({ OWN_KEY_ENABLED: value ? "true" : "false" }),
    preview: () => ({ OWN_KEY_ENABLED: "true" }),
  },
  {
    name: "APPLE_SIGNIN",
    title: "Sign in with Apple",
    about: "Apple on the sign-in page and in Settings → Account, beside passkeys, Google and GitHub.",
    kind: "switch",
    // On wherever Apple's ids and key are set (signin.ts): there's no var of its own, so off is its Services ID taken away.
    defaultOf: (env) => !absent(env, ["APPLE_SERVICES_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"]).length,
    missing: (env) => {
      const gone = absent(env, ["APPLE_SERVICES_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"]);
      return gone.length ? { missing: "Apple's ids and key aren't set", how: `Set ${listed(gone)} from Apple's developer account (the key as the Worker's secret), then deploy.` } : null;
    },
    apply: (value) => (value ? {} : { APPLE_SERVICES_ID: "" }),
    preview: (deploy) => ({ APPLE_SERVICES_ID: deploy.APPLE_SERVICES_ID }),
    cannotPreview: (deploy) => (absent(deploy, ["APPLE_SERVICES_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"]).length ? "Apple's ids and key aren't set" : null),
  },
  {
    name: "SIGNUPS",
    // Titled as what turns on, as sharing's is; its value is "open" or "paused" for the director (launch day's SHED step 1).
    title: "New accounts paused",
    about: "Making an account (a passkey's sign-up, a first sign-in with Google, GitHub or Apple) answers that we're very busy; everyone with an account signs in and studies.",
    kind: "choice",
    values: ["open", "paused"],
    defaultOf: (env) => (env.SIGNUPS === "paused" ? "paused" : "open"),
    apply: (value) => ({ SIGNUPS: String(value) }),
    preview: () => ({}),
    cannotPreview: () => "Only someone signed out sees it: set it over MCP or REST and look in a private window.",
    holdWhileUnread: (value) => value === "paused",
  },
];

const BY_NAME = new Map(FLAGS.map((f) => [f.name, f]));

/** A refusal in words, with the status a route answers it with. */
export class FlagError extends LibraryError {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404,
  ) {
    super(message);
  }
}

// ---------- what's stored, kept briefly ----------

/**
 * How long an isolate keeps the stored values before reading them again: a minute, so a switch flipped reaches every request within
 * one (the isolate that wrote it at once). It was 5 s, and every request reads the switches: in the load rehearsal (7 Nov 2026) their
 * read was 11% of D1's work, 0.30 a request, and D1's limit is round trips (docs/launch-capacity.md).
 */
export const FLAG_TTL = 60_000;
/**
 * How long the values last read stand while D1 can't be read again; past it an isolate goes by the deploy's (7 Nov 2026, the launch's
 * security pass: an isolate that had "everyone" kept it with no end while its reads failed, after sharing was closed elsewhere).
 */
export const FLAG_STALE = 5 * 60_000;
type Stored = Map<string, { value: FlagValue; at: number }>;
// Per database (a test's environments never share one): the stored values, when they were last asked for (at) and last read (readAt).
const kept = new WeakMap<object, { at: number; readAt: number; stored: Stored }>();
// Past FLAG_STALE an isolate goes by the deploy's values, but for a stored value that holds while D1 can't be read (holdWhileUnread).
const standing = (had: { readAt: number; stored: Stored }, now: number): Stored =>
  now - had.readAt <= FLAG_STALE ? had.stored : new Map([...had.stored].filter(([name, { value }]) => BY_NAME.get(name)?.holdWhileUnread?.(value)));
// The deploy's own env, under the one withFlags made from it.
const DEPLOY = Symbol("the deploy's env");

/** The env as the deploy has it, before any stored value. */
export const deployEnv = (env: Env): Env => (env as Env & { [DEPLOY]?: Env })[DEPLOY] ?? env;

/** The stored values. strict: an admin's read or change, which fails rather than go on values it couldn't read (setFlag's "already that"). */
async function storedFlags(env: Env, now: number, { strict = false } = {}): Promise<Stored> {
  const had = kept.get(env.DB);
  if (!strict && had && now - had.at < FLAG_TTL) return standing(had, now);
  try {
    const rows = await env.DB.prepare("SELECT name, value, updated_at FROM feature_flags").all<{ name: string; value: string; updated_at: number }>();
    const stored: Stored = new Map();
    for (const row of rows.results) {
      const spec = BY_NAME.get(row.name);
      if (!spec) continue;
      let value: unknown;
      try {
        value = JSON.parse(row.value);
      } catch {
        continue;
      }
      if (valid(spec, value)) stored.set(row.name, { value, at: row.updated_at });
    }
    kept.set(env.DB, { at: now, readAt: now, stored });
    return stored;
  } catch (error) {
    if (strict) throw error;
    console.warn(JSON.stringify({ flags_unread: String((error as Error)?.message ?? error) }));
    // Not asked again for FLAG_TTL (a D1 that's failing isn't asked on every request); the last values stand until FLAG_STALE.
    const keep = { at: now, readAt: had?.readAt ?? -Infinity, stored: had?.stored ?? new Map() };
    kept.set(env.DB, keep);
    return standing(keep, now);
  }
}

/** Forgets what this isolate kept, so the next read is D1's (after a write here). */
export const forgetFlags = (env: Env) => void kept.delete(deployEnv(env).DB);

const valid = (spec: FlagSpec, value: unknown): value is FlagValue => (spec.kind === "switch" ? typeof value === "boolean" : typeof value === "string" && (spec.values ?? []).includes(value));

/** The value in effect: what's stored, else the deploy's; a switch whose secrets aren't set is off. */
function effective(spec: FlagSpec, deploy: Env, stored: Stored): FlagValue {
  if (spec.kind === "switch" && spec.missing?.(deploy)) return false;
  return stored.get(spec.name)?.value ?? spec.defaultOf(deploy);
}

/**
 * The env every request and the cron run on: the deploy's, with each stored value's vars laid over it. The same object when nothing is stored.
 * now: for tests, the clock.
 */
export async function withFlags(env: Env, now = Date.now()): Promise<Env> {
  const deploy = deployEnv(env);
  const stored = await storedFlags(deploy, now);
  if (!stored.size) return deploy;
  const over: Partial<Env> = {};
  for (const spec of FLAGS) if (stored.has(spec.name)) Object.assign(over, spec.apply(effective(spec, deploy, stored)));
  const out = { ...deploy, ...over } as Env;
  Object.defineProperty(out, DEPLOY, { value: deploy, enumerable: false });
  return out;
}

// ---------- what an admin reads and sets ----------

export interface FlagView {
  name: string;
  title: string;
  about: string;
  kind: "switch" | "choice";
  values?: string[];
  value: FlagValue;
  default: FlagValue;
  set: { value: FlagValue; at: number } | null;
  /** true, or why it can't turn on: missing in plain words (the page's line), how the names and the doc (its disclosure). */
  ready: true | { missing: string; how: string };
}

function view(spec: FlagSpec, deploy: Env, stored: Stored): FlagView {
  const needs = spec.missing?.(deploy) ?? null;
  return {
    name: spec.name,
    title: spec.title,
    about: spec.about,
    kind: spec.kind,
    ...(spec.values ? { values: [...spec.values] } : {}),
    value: effective(spec, deploy, stored),
    default: spec.defaultOf(deploy),
    set: stored.get(spec.name) ?? null,
    ready: needs ?? true,
  };
}

async function mustBeAdmin(env: Env, userId: string) {
  if (!(await rolesOf(env, userId)).has("admin")) throw new FlagError("Only an admin can see or change the site's switches.", 403);
}

const specOf = (name: string) => {
  const spec = BY_NAME.get(name);
  if (!spec) throw new FlagError(`There's no switch "${name}". The switches: ${FLAGS.map((f) => f.name).join(", ")}.`, 404);
  return spec;
};

/** Every switch as it is now, read fresh from D1. */
export async function listFlags(env: Env, userId: string): Promise<FlagView[]> {
  await mustBeAdmin(env, userId);
  forgetFlags(env);
  const deploy = deployEnv(env);
  const stored = await storedFlags(deploy, Date.now(), { strict: true });
  return FLAGS.map((spec) => view(spec, deploy, stored));
}

/**
 * An admin sets a switch: { flag }, as it is after. The value it already has changes nothing and logs nothing; a switch can't turn on
 * without what it needs. why goes in the admin log with who, when, and old → new.
 */
export async function setFlag(env: Env, actor: { userId: string; via: string }, name: string, value: unknown, why?: string | null): Promise<FlagView> {
  await mustBeAdmin(env, actor.userId);
  const spec = specOf(name);
  if (!valid(spec, value)) throw new FlagError(spec.kind === "switch" ? `${spec.name} is a switch: true or false.` : `${spec.name} is one of ${(spec.values ?? []).map((v) => `"${v}"`).join(", ")}.`, 400);
  const deploy = deployEnv(env);
  const needs = spec.missing?.(deploy);
  if (value === true && needs) throw new FlagError(`${spec.title} can't turn on: ${needs.missing}. ${needs.how}`, 400);
  forgetFlags(env);
  // Read strictly: on values it couldn't read, "already that" would answer a change that never happened (codex's F1, 7 Nov 2026).
  const before = await storedFlags(deploy, Date.now(), { strict: true });
  // What it's set to (stored, else the deploy's), not only what's in effect: a stored "on" kept off by missing secrets is still changed by
  // an "off", or it would turn on by itself once they're set.
  const was = before.get(spec.name)?.value ?? spec.defaultOf(deploy);
  if (was === value) return view(spec, deploy, before);
  const at = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO feature_flags (name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(spec.name, JSON.stringify(value), at),
    adminLogStatement(env, { actorId: actor.userId, via: actor.via, action: "flag.set", target: `flag:${spec.name}`, before: was, after: value, note: `${String(was)} → ${String(value)}${why?.trim() ? `: ${why.trim()}` : ""}` }),
  ]);
  forgetFlags(env);
  // What's stored now, as this write left it (not read again: a read that failed would show the deploy's for what was just written).
  return view(spec, deploy, new Map([...before, [spec.name, { value: value as FlagValue, at }]]));
}

/** An admin takes a switch back to the deploy's value (nothing stored for it): { flag } as it is after. Nothing stored changes nothing. */
export async function resetFlag(env: Env, actor: { userId: string; via: string }, name: string, why?: string | null): Promise<FlagView> {
  await mustBeAdmin(env, actor.userId);
  const spec = specOf(name);
  const deploy = deployEnv(env);
  forgetFlags(env);
  const before = await storedFlags(deploy, Date.now(), { strict: true });
  if (!before.has(spec.name)) return view(spec, deploy, before);
  const was = before.get(spec.name)!.value;
  const after = spec.defaultOf(deploy);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM feature_flags WHERE name = ?").bind(spec.name),
    adminLogStatement(env, { actorId: actor.userId, via: actor.via, action: "flag.reset", target: `flag:${spec.name}`, before: was, after, note: `${String(was)} → ${String(after)} (the site's default)${why?.trim() ? `: ${why.trim()}` : ""}` }),
  ]);
  forgetFlags(env);
  const left = new Map(before);
  left.delete(spec.name);
  return view(spec, deploy, left);
}

// ---------- an admin's previews, on their own device ----------

/** The cookie holding a device's previews: flag names, comma-separated. Honored only on an admin's session (withPreviews). */
export const PREVIEW_COOKIE = "lc_preview";
export const PREVIEW_DAYS = 30;

/** The flags a request's cookie asks to preview, as known flags only. */
export function previewsAsked(request: Request): string[] {
  const raw = readCookie(request, PREVIEW_COOKIE);
  if (!raw) return [];
  const asked = new Set(raw.split(",").map((name) => name.trim()));
  return FLAGS.filter((spec) => asked.has(spec.name)).map((spec) => spec.name);
}

/**
 * The env this one request runs on with the device's previews: only when its session is an admin's, and only for what can be previewed here.
 * Anyone else's request, and an admin's without the cookie, is the env as it came. Nothing is read or written but the session and roles.
 */
export async function withPreviews(env: Env, request: Request): Promise<Env> {
  const asked = previewsAsked(request);
  if (!asked.length) return env;
  const user = await getSessionUser(request, env).catch(() => null);
  if (!user || !(await rolesOf(env, user.id).catch(() => new Set<string>())).has("admin")) return env;
  const deploy = deployEnv(env);
  const on = new Set<string>();
  const over: Partial<Env> = {};
  for (const spec of FLAGS) {
    if (!asked.includes(spec.name) || spec.cannotPreview?.(deploy)) continue;
    on.add(spec.name);
    Object.assign(over, spec.preview(deploy));
  }
  if (!on.size) return env;
  const out = { ...env, ...over } as Env;
  Object.defineProperty(out, DEPLOY, { value: deploy, enumerable: false });
  Object.defineProperty(out, PREVIEWS, { value: on, enumerable: false });
  return out;
}

/** A flag as the app's Feature flags page shows it: what everyone has, and this device's preview. Plain words only. */
export interface AppFlagView {
  name: string;
  title: string;
  about: string;
  kind: "switch" | "choice";
  values?: string[];
  /** What everyone has now (site-wide, the director's). */
  value: FlagValue;
  preview: { on: boolean; can: true | { missing: string } };
}

const appView = (view: FlagView, spec: FlagSpec, deploy: Env, asked: readonly string[]): AppFlagView => {
  const missing = spec.cannotPreview?.(deploy) ?? null;
  return {
    name: view.name,
    title: view.title,
    about: view.about,
    kind: view.kind,
    ...(view.values ? { values: view.values } : {}),
    value: view.value,
    preview: { on: !missing && asked.includes(spec.name), can: missing ? { missing } : true },
  };
};

/** The page's list: every flag, what everyone has, and what this device previews (asked: the device's cookie). An admin's only. */
export async function appFlags(env: Env, userId: string, asked: readonly string[]): Promise<AppFlagView[]> {
  const views = await listFlags(env, userId);
  const deploy = deployEnv(env);
  return views.map((view) => appView(view, BY_NAME.get(view.name)!, deploy, asked));
}

/** Turns a preview on or off for this device: { flag, previews } (the cookie's new list). An admin's only; refused in plain words when it can't. */
export async function setPreview(env: Env, userId: string, name: string, on: unknown, asked: readonly string[]): Promise<{ flag: AppFlagView; previews: string[] }> {
  await mustBeAdmin(env, userId);
  const spec = specOf(name);
  if (typeof on !== "boolean") throw new FlagError("on is true or false.", 400);
  const deploy = deployEnv(env);
  const missing = spec.cannotPreview?.(deploy);
  if (on && missing) throw new FlagError(`${spec.title} can't be previewed here: ${missing}.`, 400);
  const previews = FLAGS.map((f) => f.name).filter((n) => (n === spec.name ? on : asked.includes(n)));
  const view = (await listFlags(env, userId)).find((f) => f.name === spec.name)!;
  return { flag: appView(view, spec, deploy, previews), previews };
}
