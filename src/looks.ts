// Each account's look on the server, and its saved themes. The app sends every change here, the person's AI reads
// and changes them through MCP, and every device follows. A look that changes anything is a theme of the person's own
// (the `themes` table): the look in use (`looks`) says which one in its `theme` (null for a built-in theme as it
// comes), and every change to it is written to that theme in the same batch, so switching to another theme never
// loses one. Built-in themes never change: changing one starts a new theme of the person's.
//
// One revision number orders every change to the look in use, and each theme has its own; writes are compare-and-set
// on them, so two writers can't both win. The checks are the app's own (public/js/lx/look-rules.js, and through it
// css-safety.js), so a look saved here is exactly what the app would accept. MCP, the REST API and the app all call
// these functions.

import {
  BUILT_IN_THEMES,
  BASE_THEME_LIST,
  builtInName,
  checkLook,
  editedName,
  emptyLook,
  hasChanges,
  IMAGE_TYPES,
  LOOK_LIMITS,
  newThemeId,
  patchLook,
  sameLook,
  SLOT_NAME,
  THEME_ID,
  themeContent,
  uniqueName,
} from "../public/js/lx/look-rules.js";
import type { Env } from "./env";
import { LibraryError } from "./library";
import { fileSafetyHeaders, sha256Hex } from "./util";

export interface LookImage {
  hash: string;
  type: string;
  size: number;
  name: string;
}

/** A saved theme's content. */
export interface ThemeContent {
  name: string;
  base: string;
  tokens: Record<string, string>;
  css: string;
  images: Record<string, LookImage>;
}

/** The look in use: a saved theme's content and its id, or a built-in theme as it comes (theme null, no changes). */
export interface Look extends ThemeContent {
  theme: string | null;
}

export interface AppliedReport {
  rev: number;
  at: number;
  device: string;
  undone?: string;
  notes: string[];
}

export interface LookRecord {
  rev: number;
  look: Look;
  source: string;
  updatedAt: number;
  applied: AppliedReport | null;
  /** The revision of the saved theme in use (null on a built-in theme). */
  themeRev: number | null;
  /** Goes up with every change to any of the account's themes. */
  libraryRev: number;
}

export interface ThemeRecord {
  id: string;
  rev: number;
  look: ThemeContent;
  createdBy: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** A change for changeLook (look-rules.js patchLook). */
export interface LookPatch {
  reset?: boolean;
  base?: string;
  name?: string;
  tokens?: Record<string, string | null>;
  replaceTokens?: boolean;
  css?: string;
  removeImages?: string[];
  setImages?: Record<string, LookImage>;
}

const HISTORY_KEEP = 20;
/** A deleted theme is kept this long, so the delete can be undone (then it, and images only it used, go). */
const DELETED_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
export const LOOK_IMAGE_BYTES_PER_ACCOUNT = 24_000_000;
// An image a device uploaded moments ago may be about to appear in the look it's sending next: don't collect it yet.
const FRESH_IMAGE_MS = 15 * 60 * 1000;
const HASH = /^[0-9a-f]{64}$/;

const imageKey = (userId: string, hash: string) => `users/${userId}/look/${hash}`;
/** Where one of an account's look images lives (accounts.ts deleteAccount). */
export const lookImageKey = imageKey;

/** The look changed since the caller last saw it; current is what's there now. */
export class LookConflict extends Error {
  constructor(readonly current: LookRecord | null) {
    super("look_conflict");
  }
}

/** The theme changed (or was deleted) since the caller last saw it; current is what's there now (null: gone). */
export class ThemeConflict extends Error {
  constructor(readonly current: ThemeRecord | null) {
    super("theme_conflict");
  }
}

/** The look uses images the server doesn't have yet: upload these first (PUT /api/look/images/:hash). */
export class MissingImages extends Error {
  constructor(readonly hashes: string[]) {
    super("missing_images");
  }
}

const checked = (input: unknown) => checkLook(input) as { look: Look; notes: string[] };
const contentOf = (look: unknown) => themeContent(look) as ThemeContent;

interface LookRow {
  rev: number;
  look: string;
  source: string;
  updated_at: number;
  applied: string | null;
  theme_rev: number | null;
  library_rev: number | null;
}

function parseRecord(row: LookRow): LookRecord {
  return {
    rev: row.rev,
    look: checked(JSON.parse(row.look)).look,
    source: row.source,
    updatedAt: row.updated_at,
    applied: row.applied ? (JSON.parse(row.applied) as AppliedReport) : null,
    themeRev: row.theme_rev ?? null,
    libraryRev: row.library_rev ?? 0,
  };
}

export async function getLook(env: Env, userId: string): Promise<LookRecord | null> {
  const row = await env.DB.prepare(
    `SELECT l.rev, l.look, l.source, l.updated_at, l.applied,
       (SELECT t.rev FROM themes t WHERE t.user_id = l.user_id AND t.id = json_extract(l.look, '$.theme')) AS theme_rev,
       (SELECT b.rev FROM theme_library b WHERE b.user_id = l.user_id) AS library_rev
     FROM looks l WHERE l.user_id = ?`,
  )
    .bind(userId)
    .first<LookRow>();
  return row ? parseRecord(row) : null;
}

/**
 * GET /api/look's answer in one statement (a start asks it): the look, or none with the theme library's revision (0 when there's
 * none yet), where getLook and then getRevs took two round trips.
 */
export async function getLookOrLibrary(env: Env, userId: string): Promise<{ record: LookRecord | null; library: number }> {
  const row = await env.DB.prepare(
    `SELECT l.rev, l.look, l.source, l.updated_at, l.applied,
       (SELECT t.rev FROM themes t WHERE t.user_id = l.user_id AND t.id = json_extract(l.look, '$.theme')) AS theme_rev,
       (SELECT b.rev FROM theme_library b WHERE b.user_id = x.id) AS library_rev
     FROM (SELECT ? AS id) x LEFT JOIN looks l ON l.user_id = x.id`,
  )
    .bind(userId)
    .first<Omit<LookRow, "rev"> & { rev: number | null }>();
  if (!row || row.rev === null) return { record: null, library: row?.library_rev ?? 0 };
  return { record: parseRecord(row as LookRow), library: row.library_rev ?? 0 };
}

/** The look's revision and the theme library's (0 when there's none yet): the app's cheap poll. */
export async function getRevs(env: Env, userId: string): Promise<{ rev: number; library: number }> {
  const row = await env.DB.prepare("SELECT (SELECT rev FROM looks WHERE user_id = ?) AS rev, (SELECT rev FROM theme_library WHERE user_id = ?) AS library")
    .bind(userId, userId)
    .first<{ rev: number | null; library: number | null }>();
  return { rev: row?.rev ?? 0, library: row?.library ?? 0 };
}

/** The current revision number only (0 when there's no look yet). */
export async function getLookRev(env: Env, userId: string): Promise<number> {
  return (await getRevs(env, userId)).rev;
}

interface ThemeRow {
  id: string;
  rev: number;
  look: string;
  created_by: string;
  source: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function parseTheme(row: ThemeRow): ThemeRecord {
  return {
    id: row.id,
    rev: row.rev,
    look: contentOf(JSON.parse(row.look)),
    createdBy: row.created_by,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

const THEME_COLUMNS = "id, rev, look, created_by, source, created_at, updated_at, deleted_at";

export async function getTheme(env: Env, userId: string, id: string): Promise<ThemeRecord | null> {
  if (!THEME_ID.test(id)) return null;
  const row = await env.DB.prepare(`SELECT ${THEME_COLUMNS} FROM themes WHERE user_id = ? AND id = ?`).bind(userId, id).first<ThemeRow>();
  return row ? parseTheme(row) : null;
}

/** Every saved theme, oldest first, deleted ones included (deletedAt says so), with the library's revision. */
export async function listThemes(env: Env, userId: string): Promise<{ libraryRev: number; themes: ThemeRecord[] }> {
  const [rows, revs] = await Promise.all([
    env.DB.prepare(`SELECT ${THEME_COLUMNS} FROM themes WHERE user_id = ? ORDER BY created_at, id`).bind(userId).all<ThemeRow>(),
    getRevs(env, userId),
  ]);
  return { libraryRev: revs.library, themes: rows.results.map(parseTheme) };
}

/** A theme by id or by name (case aside), deleted ones left out. */
async function findTheme(env: Env, userId: string, ref: string): Promise<ThemeRecord | null> {
  const wanted = ref.trim().toLowerCase();
  const { themes } = await listThemes(env, userId);
  const live = themes.filter((t) => !t.deletedAt);
  return live.find((t) => t.id === ref.trim()) ?? live.find((t) => t.look.name.trim().toLowerCase() === wanted) ?? null;
}

// A built-in theme or a ready-made one (lx/theme-presets.js), by id or name.
const builtIn = (ref: string) => {
  const wanted = ref.trim().toLowerCase();
  return BASE_THEME_LIST.find((t) => t.id === wanted || t.name.toLowerCase() === wanted) ?? null;
};

/** A built-in theme as it comes, as the look in use. */
const builtInLook = (base: string): Look => ({ ...(emptyLook() as Look), base });

async function liveThemeNames(env: Env, userId: string): Promise<string[]> {
  return (await listThemes(env, userId)).themes.filter((t) => !t.deletedAt).map((t) => t.look.name);
}

/** Bumps the library's revision, in a batch, only if `guard` (SQL with its binds) holds. */
function bumpLibrary(env: Env, userId: string, guard: string, binds: unknown[]): D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO theme_library (user_id, rev) SELECT ?, 1 WHERE ${guard} ON CONFLICT(user_id) DO UPDATE SET rev = theme_library.rev + 1`).bind(userId, ...binds);
}

/**
 * Writes a new revision of the look in use on top of `current` (null: the first one). Compare-and-set: if another
 * write landed since `current` was read, or the look's saved theme isn't at `themeRev` any more, this throws
 * LookConflict and nothing is written. With writeTheme, the look's content is written to its saved theme in the same
 * batch (made if it's new, brought back if it was deleted); without it (switching to a theme), the theme is untouched.
 */
async function commitLook(
  env: Env,
  userId: string,
  current: LookRecord | null,
  look: Look,
  source: string,
  { writeTheme, themeRev }: { writeTheme: boolean; themeRev: number | null },
): Promise<{ rev: number; themeRev: number | null }> {
  const rev = (current?.rev ?? 0) + 1;
  const now = Date.now();
  const json = JSON.stringify(look);
  const theme = look.theme;
  // The look lands only while its theme is still at the revision this change was made from.
  const themeHolds = "(? IS NULL OR (SELECT rev FROM themes WHERE user_id = ? AND id = ?) IS ?)";
  const themeBinds = [theme, userId, theme, themeRev];
  const write = current
    ? env.DB.prepare(`UPDATE looks SET rev = ?, look = ?, source = ?, updated_at = ?, applied = NULL WHERE user_id = ? AND rev = ? AND ${themeHolds}`).bind(
        rev,
        json,
        source,
        now,
        userId,
        current.rev,
        ...themeBinds,
      )
    : env.DB.prepare(`INSERT INTO looks (user_id, rev, look, source, updated_at) SELECT ?, ?, ?, ?, ? WHERE ${themeHolds} ON CONFLICT(user_id) DO NOTHING`).bind(
        userId,
        rev,
        json,
        source,
        now,
        ...themeBinds,
      );
  // Everything after the write happens only if the write above is the one that landed (same batch, so it sees it).
  const landed = "EXISTS (SELECT 1 FROM looks WHERE user_id = ? AND rev = ? AND updated_at = ? AND source = ?)";
  const landedBinds = [userId, rev, now, source];
  const statements = [
    write,
    env.DB.prepare(`INSERT INTO look_history (user_id, rev, look, source, created_at) SELECT ?, ?, ?, ?, ? WHERE ${landed}`).bind(userId, rev, json, source, now, ...landedBinds),
    env.DB.prepare("DELETE FROM look_history WHERE user_id = ? AND rev <= ?").bind(userId, rev - HISTORY_KEEP),
  ];
  if (theme && writeTheme) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO themes (user_id, id, rev, look, created_by, source, created_at, updated_at) SELECT ?, ?, 1, ?, ?, ?, ?, ? WHERE ${landed}
         ON CONFLICT(user_id, id) DO UPDATE SET rev = themes.rev + 1, look = excluded.look, source = excluded.source, updated_at = excluded.updated_at, deleted_at = NULL`,
      ).bind(userId, theme, JSON.stringify(contentOf(look)), source, source, now, now, ...landedBinds),
      bumpLibrary(env, userId, landed, landedBinds),
    );
  }
  let results: D1Result[];
  try {
    results = await env.DB.batch(statements);
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error))) throw new LookConflict(await getLook(env, userId));
    throw error;
  }
  if ((results[0]?.meta.changes ?? 0) !== 1) throw new LookConflict(await getLook(env, userId));
  await collectImages(env, userId);
  return { rev, themeRev: theme ? (writeTheme ? (themeRev ?? 0) + 1 : themeRev) : null };
}

/**
 * Writes a saved theme that isn't the one in use: new (expectRev null), or on top of expectRev. Returns its new
 * revision, or null if it couldn't land (it changed, it exists already, or it's the theme in use now): read again.
 */
async function commitTheme(
  env: Env,
  userId: string,
  id: string,
  content: ThemeContent,
  { expectRev, deletedAt, source }: { expectRev: number | null; deletedAt: number | null; source: string },
): Promise<number | null> {
  const now = Date.now();
  const json = JSON.stringify(contentOf(content));
  const notInUse = "NOT EXISTS (SELECT 1 FROM looks WHERE user_id = ? AND json_extract(look, '$.theme') = ?)";
  const rev = (expectRev ?? 0) + 1;
  const write =
    expectRev === null
      ? env.DB.prepare(
          `INSERT INTO themes (user_id, id, rev, look, created_by, source, created_at, updated_at, deleted_at) SELECT ?, ?, 1, ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM themes WHERE user_id = ? AND id = ?) AND ${notInUse}`,
        ).bind(userId, id, json, source, source, now, now, deletedAt, userId, id, userId, id)
      : env.DB.prepare(`UPDATE themes SET rev = ?, look = ?, source = ?, updated_at = ?, deleted_at = ? WHERE user_id = ? AND id = ? AND rev = ? AND ${notInUse}`).bind(
          rev,
          json,
          source,
          now,
          deletedAt,
          userId,
          id,
          expectRev,
          userId,
          id,
        );
  const landed = "EXISTS (SELECT 1 FROM themes WHERE user_id = ? AND id = ? AND rev = ? AND updated_at = ? AND source = ?)";
  const results = await env.DB.batch([write, bumpLibrary(env, userId, landed, [userId, id, rev, now, source])]);
  if ((results[0]?.meta.changes ?? 0) !== 1) return null;
  await collectImages(env, userId);
  return rev;
}

async function missingImages(env: Env, userId: string, look: ThemeContent): Promise<string[]> {
  const hashes = [...new Set(Object.values(look.images).map((image) => image.hash))];
  if (!hashes.length) return [];
  const rows = await env.DB.prepare(`SELECT hash FROM look_images WHERE user_id = ? AND hash IN (${hashes.map(() => "?").join(", ")})`)
    .bind(userId, ...hashes)
    .all<{ hash: string }>();
  const stored = new Set(rows.results.map((row) => row.hash));
  return hashes.filter((hash) => !stored.has(hash));
}

/**
 * A changed look with no saved theme becomes a new theme of the person's: built-in themes never change. Named
 * `name`, or the look's own name, else "<Built-in>, edited". Returns the note to show, or null if nothing was made.
 */
async function startOwnTheme(env: Env, userId: string, look: Look, name?: string): Promise<string | null> {
  if (look.theme || !(hasChanges(look) || name?.trim())) return null;
  const taken = await liveThemeNames(env, userId);
  const wanted = name?.trim() || look.name.trim();
  look.theme = newThemeId();
  look.name = wanted ? uniqueName(wanted, taken) : editedName(look.base, taken);
  return `Started a new theme of theirs, "${look.name}", from ${builtInName(look.base)}: built-in themes never change, and their other themes stay as they are.`;
}

/** The revision a saved theme is at (null when there's no such theme yet). */
async function themeRevOf(env: Env, userId: string, current: LookRecord | null, id: string | null): Promise<number | null> {
  if (!id) return null;
  if (current?.look.theme === id) return current.themeRev;
  return (await getTheme(env, userId, id))?.rev ?? null;
}

/**
 * A device's whole look, sent after a change on it (apps from before saved themes; newer ones send a theme's
 * changes with saveTheme). baseRev is the revision it started from: if that's no longer the current one,
 * LookConflict says what is. Images must be uploaded first. A look sent without `theme` is the theme in use.
 */
export async function saveLook(env: Env, userId: string, input: unknown, baseRev: number, source = "device"): Promise<{ rev: number; notes: string[]; look: Look }> {
  const { look, notes } = checked(input);
  const missing = await missingImages(env, userId, look);
  if (missing.length) throw new MissingImages(missing);
  const current = await getLook(env, userId);
  if ((current?.rev ?? 0) !== baseRev) throw new LookConflict(current);
  if (!(input && typeof input === "object" && "theme" in input)) look.theme = current?.look.theme ?? null;
  const started = await startOwnTheme(env, userId, look);
  if (started) notes.push(started);
  const { rev } = await commitLook(env, userId, current, look, source, { writeTheme: true, themeRev: await themeRevOf(env, userId, current, look.theme) });
  return { rev, notes, look };
}

/**
 * A change from an AI (or a script) to the theme in use, applied on top of whatever the look is now, retried if a
 * device wrote at the same moment. On a built-in theme it starts a new theme of the person's first (named `name`, if
 * the change has one). expectedRev, when given, refuses the change if the look moved on since the caller read it.
 */
export async function changeLook(
  env: Env,
  userId: string,
  patch: LookPatch,
  source: string,
  expectedRev?: number,
): Promise<{ rev: number; look: Look; notes: string[]; started: string | null }> {
  // A name is text or nothing: a script's change (REST) can carry anything.
  const name = typeof patch.name === "string" ? patch.name : undefined;
  patch = { ...patch, name };
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getLook(env, userId);
    if (expectedRev !== undefined && (current?.rev ?? 0) !== expectedRev) {
      throw new LibraryError(`The look has changed since revision ${expectedRev} (it's at ${current?.rev ?? 0} now). Read it again with get_look.`);
    }
    let result: { look: Look; notes: string[] };
    try {
      result = patchLook(current?.look ?? emptyLook(), patch) as { look: Look; notes: string[] };
    } catch (error) {
      throw new LibraryError(String((error as Error).message));
    }
    const look = result.look;
    // A built-in theme with nothing changed is just that theme (picking a base on one is switching to it).
    if (!look.theme && !hasChanges(look) && !name?.trim()) look.name = "";
    // Renaming a theme of theirs: names stay unique among their themes, as in the app.
    if (look.theme && name?.trim()) {
      const taken = (await listThemes(env, userId)).themes.filter((t) => !t.deletedAt && t.id !== look.theme).map((t) => t.look.name);
      look.name = uniqueName(name, taken);
    }
    const started = await startOwnTheme(env, userId, look, name);
    const missing = await missingImages(env, userId, look);
    if (missing.length) throw new LibraryError("That look uses an image that isn't stored. Upload it with request_look_image_upload.");
    try {
      const { rev } = await commitLook(env, userId, current, look, source, { writeTheme: true, themeRev: await themeRevOf(env, userId, current, look.theme) });
      return { rev, look, notes: started ? [started, ...result.notes] : result.notes, started: started ? look.name : null };
    } catch (error) {
      if (!(error instanceof LookConflict)) throw error;
    }
  }
  throw new LibraryError("The look kept changing while this was being saved. Try again.");
}

/**
 * Switches to a theme: a built-in one (by id or name) or one of the person's (by id or name). No theme's content
 * changes, so the one being left stays exactly as it was.
 */
export async function useTheme(env: Env, userId: string, ref: string, source: string): Promise<{ rev: number; look: Look; unchanged: boolean }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getLook(env, userId);
    // A built-in theme's id, then one of theirs by id or name, then a built-in theme's name ("Paper").
    const byId = BASE_THEME_LIST.find((t) => t.id === ref.trim());
    const theirs = byId ? null : await findTheme(env, userId, ref);
    const built = byId ?? (theirs ? null : builtIn(ref));
    let target: Look;
    let themeRev: number | null = null;
    if (built) target = builtInLook(built.id);
    else if (theirs) {
      target = { ...theirs.look, theme: theirs.id };
      themeRev = theirs.rev;
    } else throw new LibraryError(`No theme called "${ref}". list_themes shows the person's themes; the built-in ones are ${BUILT_IN_THEMES.map((t) => t.id).join(", ")}.`);
    if (current && sameLook(current.look, target)) return { rev: current.rev, look: current.look, unchanged: true };
    try {
      const { rev } = await commitLook(env, userId, current, target, source, { writeTheme: false, themeRev });
      return { rev, look: target, unchanged: false };
    } catch (error) {
      if (!(error instanceof LookConflict)) throw error;
    }
  }
  throw new LibraryError("The look kept changing while switching. Try again.");
}

/**
 * Makes a new theme of the person's: blank on a built-in theme (`base`, or the current one's), a copy of the look in
 * use ("current"), or a copy of another theme (by id or name). With use, it becomes the theme in use.
 */
export async function createTheme(
  env: Env,
  userId: string,
  { name, from = "blank", base, use = true }: { name: string; from?: string; base?: string; use?: boolean },
  source: string,
): Promise<{ id: string; rev: number; look: ThemeContent; lookRev: number | null }> {
  if (!name.trim()) throw new LibraryError("Give the theme a name.");
  if (base !== undefined && !builtIn(base)) throw new LibraryError(`base is one of ${BUILT_IN_THEMES.map((t) => t.id).join(", ")}.`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getLook(env, userId);
    let content: ThemeContent;
    if (from === "blank") content = contentOf(builtInLook(base ?? current?.look.base ?? "graphite"));
    else if (from === "current") content = contentOf(current?.look ?? emptyLook());
    else {
      // One of theirs by id or name, else a built-in theme as it comes.
      const theme = await findTheme(env, userId, from);
      const built = theme ? null : builtIn(from);
      if (!theme && !built) throw new LibraryError(`No theme called "${from}" to start from. Use "blank", "current", a built-in theme, or one from list_themes.`);
      content = theme ? theme.look : contentOf(builtInLook(built!.id));
    }
    content = { ...content, name: uniqueName(name, await liveThemeNames(env, userId)), ...(base ? { base } : {}) };
    content = contentOf(content);
    const id = newThemeId();
    if (use) {
      try {
        const { rev } = await commitLook(env, userId, current, { ...content, theme: id }, source, { writeTheme: true, themeRev: null });
        return { id, rev: 1, look: content, lookRev: rev };
      } catch (error) {
        if (!(error instanceof LookConflict)) throw error;
        continue;
      }
    }
    const rev = await commitTheme(env, userId, id, content, { expectRev: null, deletedAt: null, source });
    if (rev !== null) return { id, rev, look: content, lookRev: null };
  }
  throw new LibraryError("The themes kept changing while this was being saved. Try again.");
}

/**
 * A device's change to one of its themes (new, edited, renamed, brought back): compare-and-set on the theme's
 * revision (0: a new theme). If it's the theme in use, the look changes with it. undelete brings back a deleted theme
 * this device changed. Images must be uploaded first.
 */
export async function saveTheme(
  env: Env,
  userId: string,
  id: string,
  input: unknown,
  baseRev: number,
  source: string,
  { undelete = false } = {},
): Promise<{ rev: number; lookRev: number | null; notes: string[] }> {
  if (!THEME_ID.test(id)) throw new LibraryError("Theme ids are 8 to 32 lowercase letters and digits.");
  const { look, notes } = checked({ ...(input && typeof input === "object" ? input : {}), theme: id });
  const missing = await missingImages(env, userId, look);
  if (missing.length) throw new MissingImages(missing);
  for (let attempt = 0; attempt < 4; attempt++) {
    const [current, theme] = await Promise.all([getLook(env, userId), getTheme(env, userId, id)]);
    if ((theme?.rev ?? 0) !== baseRev || (theme?.deletedAt && !undelete)) throw new ThemeConflict(theme);
    if (current?.look.theme === id) {
      try {
        const { rev, themeRev } = await commitLook(env, userId, current, look, source, { writeTheme: true, themeRev: theme?.rev ?? null });
        return { rev: themeRev!, lookRev: rev, notes };
      } catch (error) {
        if (!(error instanceof LookConflict)) throw error;
        continue;
      }
    }
    const rev = await commitTheme(env, userId, id, look, { expectRev: theme?.rev ?? null, deletedAt: null, source });
    if (rev !== null) return { rev, lookRev: null, notes };
  }
  throw new LibraryError("The theme kept changing while this was being saved. Try again.");
}

/**
 * Deletes one of the person's themes, kept for a while so it can be brought back (restoreTheme). If it's the theme
 * in use, the look switches to the built-in theme it started from first.
 */
export async function deleteTheme(env: Env, userId: string, id: string, source: string): Promise<{ rev: number; switchedTo: string | null }> {
  let switchedTo: string | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const [current, theme] = await Promise.all([getLook(env, userId), getTheme(env, userId, id)]);
    if (!theme) throw new LibraryError("There's no such theme.");
    if (theme.deletedAt) return { rev: theme.rev, switchedTo };
    if (current?.look.theme === id) {
      try {
        await commitLook(env, userId, current, builtInLook(theme.look.base), source, { writeTheme: false, themeRev: null });
        switchedTo = theme.look.base;
      } catch (error) {
        if (!(error instanceof LookConflict)) throw error;
      }
      continue;
    }
    const rev = await commitTheme(env, userId, id, theme.look, { expectRev: theme.rev, deletedAt: Date.now(), source });
    if (rev !== null) {
      await purgeDeleted(env, userId);
      return { rev, switchedTo };
    }
  }
  throw new LibraryError("The themes kept changing while deleting. Try again.");
}

/** Brings back a deleted theme (it isn't put in use). */
export async function restoreTheme(env: Env, userId: string, id: string, source: string): Promise<{ rev: number }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const theme = await getTheme(env, userId, id);
    if (!theme) throw new LibraryError("That theme isn't kept any more.");
    if (!theme.deletedAt) return { rev: theme.rev };
    const rev = await commitTheme(env, userId, id, theme.look, { expectRev: theme.rev, deletedAt: null, source });
    if (rev !== null) return { rev };
  }
  throw new LibraryError("The themes kept changing. Try again.");
}

/** Forgets themes deleted more than DELETED_KEEP_MS ago (and so, at the next collection, images only they used). */
async function purgeDeleted(env: Env, userId: string): Promise<void> {
  const result = await env.DB.prepare("DELETE FROM themes WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?").bind(userId, Date.now() - DELETED_KEEP_MS).run();
  if (result.meta.changes) await collectImages(env, userId);
}

/** A device's report on a revision: applied, with what its check left out, or undone because it broke the app. */
// A field read as text or a number, as String() and Number() read every primitive, but never from an object: JSON can
// carry one whose toString is null, which they throw on.
const asText = (value: unknown) => (value !== null && typeof value === "object" ? "" : String(value));
const asNumber = (value: unknown) => (value !== null && typeof value === "object" ? NaN : Number(value));

export async function reportApplied(env: Env, userId: string, input: { rev?: unknown; device?: unknown; undone?: unknown; notes?: unknown }): Promise<void> {
  const rev = asNumber(input.rev);
  if (!Number.isInteger(rev) || rev < 1) throw new LibraryError("Say which revision this is about.");
  const report: AppliedReport = {
    rev,
    at: Date.now(),
    device: asText(input.device ?? "a device").slice(0, 60),
    notes: (Array.isArray(input.notes) ? input.notes : []).slice(0, 20).map((note) => asText(note).slice(0, 300)),
  };
  if (input.undone) report.undone = asText(input.undone).slice(0, 200);
  // Only for the revision that's still current; a report on an older one says nothing about the look now.
  await env.DB.prepare("UPDATE looks SET applied = ? WHERE user_id = ? AND rev = ?").bind(JSON.stringify(report), userId, rev).run();
}

export interface LookHistoryEntry {
  rev: number;
  at: number;
  source: string;
  look: Look;
}

export async function lookHistory(env: Env, userId: string, limit = HISTORY_KEEP): Promise<LookHistoryEntry[]> {
  const rows = await env.DB.prepare("SELECT rev, look, source, created_at FROM look_history WHERE user_id = ? ORDER BY rev DESC LIMIT ?")
    .bind(userId, Math.min(Math.max(limit, 1), HISTORY_KEEP))
    .all<{ rev: number; look: string; source: string; created_at: number }>();
  return rows.results.map((row) => ({ rev: row.rev, at: row.created_at, source: row.source, look: checked(JSON.parse(row.look)).look }));
}

/**
 * Makes an earlier revision the look in use again (as a new revision, so the restore can be undone too). A revision
 * of a saved theme puts that theme back as it was then, and in use (brought back if it was deleted since).
 */
export async function restoreRevision(env: Env, userId: string, rev: number, source: string): Promise<{ rev: number; look: Look }> {
  const row = await env.DB.prepare("SELECT look FROM look_history WHERE user_id = ? AND rev = ?").bind(userId, rev).first<{ look: string }>();
  if (!row) throw new LibraryError(`Revision ${rev} isn't kept any more; list_look_history shows the ones that are.`);
  const target = checked(JSON.parse(row.look)).look;
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getLook(env, userId);
    const look = structuredClone(target);
    await startOwnTheme(env, userId, look);
    try {
      const result = await commitLook(env, userId, current, look, source, { writeTheme: true, themeRev: await themeRevOf(env, userId, current, look.theme) });
      return { rev: result.rev, look };
    } catch (error) {
      if (!(error instanceof LookConflict)) throw error;
    }
  }
  throw new LibraryError("The look kept changing while this was being restored. Try again.");
}

// ---------- images ----------

function checkImageUpload(contentType: string, size: number) {
  if (!IMAGE_TYPES.includes(contentType)) throw new LibraryError(`Images can be ${IMAGE_TYPES.join(", ")}.`);
  if (size === 0) throw new LibraryError("The image is empty.");
  if (size > LOOK_LIMITS.imageBytes) throw new LibraryError(`Each image can be up to ${LOOK_LIMITS.imageBytes / 1_000_000} MB.`);
}

/** Room for `adding` more bytes of images: collects unused ones, then drops the oldest kept revisions, if it must. */
async function makeRoom(env: Env, userId: string, adding: number): Promise<void> {
  const total = async () =>
    (await env.DB.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM look_images WHERE user_id = ?").bind(userId).first<{ n: number }>())?.n ?? 0;
  if ((await total()) + adding <= LOOK_IMAGE_BYTES_PER_ACCOUNT) return;
  await collectImages(env, userId, { includeFresh: false });
  const current = await getLookRev(env, userId);
  while ((await total()) + adding > LOOK_IMAGE_BYTES_PER_ACCOUNT) {
    const oldest = await env.DB.prepare("SELECT rev FROM look_history WHERE user_id = ? AND rev < ? ORDER BY rev LIMIT 1").bind(userId, current).first<{ rev: number }>();
    if (!oldest) throw new LibraryError(`Your themes' images can add up to ${LOOK_IMAGE_BYTES_PER_ACCOUNT / 1_000_000} MB between them. Remove an image or delete a theme first.`);
    await env.DB.prepare("DELETE FROM look_history WHERE user_id = ? AND rev = ?").bind(userId, oldest.rev).run();
    await collectImages(env, userId, { includeFresh: false });
  }
}

/** Stores an image by its hash (checked against the bytes). Storing one that's already there is a no-op. */
export async function putLookImage(env: Env, userId: string, hash: string, contentType: string, body: ArrayBuffer): Promise<LookImage> {
  if (!HASH.test(hash)) throw new LibraryError("Images are stored by the SHA-256 of their bytes, in hex.");
  checkImageUpload(contentType, body.byteLength);
  if ((await sha256Hex(body)) !== hash) throw new LibraryError("The image's bytes don't match its hash.");
  const has = async () => Boolean(await env.DB.prepare("SELECT 1 AS y FROM look_images WHERE user_id = ? AND hash = ?").bind(userId, hash).first());
  if (!(await has())) {
    // The image's row first, its bytes counted against the account's room in that same write, so images sent at once can't all pass it
    // (7 Nov 2026, Codex C19: 27 MB of 24). Nothing reaches storage before its room is taken; a row for the same image arriving at once is it.
    const reserve = async () =>
      (
        await env.DB.prepare(
          "INSERT INTO look_images (user_id, hash, content_type, size, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(size), 0) FROM look_images WHERE user_id = ?) + ? <= ? ON CONFLICT(user_id, hash) DO NOTHING",
        )
          .bind(userId, hash, contentType, body.byteLength, Date.now(), userId, body.byteLength, LOOK_IMAGE_BYTES_PER_ACCOUNT)
          .run()
      ).meta.changes > 0;
    let reserved = await reserve();
    if (!reserved && !(await has())) {
      await makeRoom(env, userId, body.byteLength);
      reserved = await reserve();
      if (!reserved && !(await has())) throw new LibraryError(`Your themes' images can add up to ${LOOK_IMAGE_BYTES_PER_ACCOUNT / 1_000_000} MB between them. Remove an image or delete a theme first.`);
    }
    try {
      await env.UPLOADS.put(imageKey(userId, hash), body, { httpMetadata: { contentType }, sha256: hash });
    } catch (error) {
      if (reserved) await env.DB.prepare("DELETE FROM look_images WHERE user_id = ? AND hash = ?").bind(userId, hash).run();
      throw error;
    }
    // Its row went while the bytes were arriving (the account deleted, or the same image's other upload failing): its bytes go too.
    if (!(await has())) {
      await env.UPLOADS.delete(imageKey(userId, hash));
      throw new LibraryError("The image wasn't kept: send it again.");
    }
  }
  return { hash, type: contentType, size: body.byteLength, name: "" };
}

/** An image an AI uploaded (through a signed link) goes straight into its slot, as a new revision. */
export async function receiveLookImage(
  env: Env,
  userId: string,
  slot: string,
  filename: string,
  contentType: string,
  body: ArrayBuffer,
  source: string,
): Promise<{ rev: number; image: LookImage }> {
  const image = await putLookImage(env, userId, await sha256Hex(body), contentType, body);
  image.name = filename.slice(0, 120);
  const { rev } = await changeLook(env, userId, { setImages: { [slot]: image } }, source);
  return { rev, image };
}

/** One of the look's images, for the owner's own devices only. It can never run as a page (an SVG's script, say). */
export async function serveLookImage(env: Env, userId: string, hash: string): Promise<Response> {
  if (!HASH.test(hash)) return new Response("Not found", { status: 404 });
  const row = await env.DB.prepare("SELECT content_type FROM look_images WHERE user_id = ? AND hash = ?").bind(userId, hash).first<{ content_type: string }>();
  const object = row ? await env.UPLOADS.get(imageKey(userId, hash)) : null;
  if (!row || !object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": row.content_type,
      "Content-Length": String(object.size),
      // Named by its own hash, so it never changes.
      "Cache-Control": "private, max-age=31536000, immutable",
      // An SVG is a download when opened directly; as the look's background it shows as always.
      ...fileSafetyHeaders(row.content_type),
    },
  });
}

/** The bytes of the image in a slot of the current look, for an AI to look at. */
export async function lookImageBytes(env: Env, userId: string, slot: string): Promise<{ image: LookImage; bytes: ArrayBuffer } | null> {
  const record = await getLook(env, userId);
  const image = record?.look.images[slot];
  if (!image) return null;
  const object = await env.UPLOADS.get(imageKey(userId, image.hash));
  return object ? { image, bytes: await object.arrayBuffer() } : null;
}

/**
 * Deletes stored images that neither the current look, a kept revision nor a saved theme (deleted ones too, while
 * they're kept) uses. Fresh uploads are kept a while.
 */
async function collectImages(env: Env, userId: string, { includeFresh = false } = {}): Promise<void> {
  const [images, current, history, themes] = await Promise.all([
    env.DB.prepare("SELECT hash, created_at FROM look_images WHERE user_id = ?").bind(userId).all<{ hash: string; created_at: number }>(),
    env.DB.prepare("SELECT look FROM looks WHERE user_id = ?").bind(userId).first<{ look: string }>(),
    env.DB.prepare("SELECT look FROM look_history WHERE user_id = ?").bind(userId).all<{ look: string }>(),
    env.DB.prepare("SELECT look FROM themes WHERE user_id = ?").bind(userId).all<{ look: string }>(),
  ]);
  const used = new Set<string>();
  for (const json of [current?.look, ...history.results.map((row) => row.look), ...themes.results.map((row) => row.look)]) {
    if (!json) continue;
    for (const image of Object.values((JSON.parse(json) as ThemeContent).images ?? {})) used.add(image.hash);
  }
  const cutoff = Date.now() - FRESH_IMAGE_MS;
  const unused = images.results.filter((row) => !used.has(row.hash) && (includeFresh || row.created_at < cutoff)).map((row) => row.hash);
  if (!unused.length) return;
  await env.UPLOADS.delete(unused.map((hash) => imageKey(userId, hash)));
  await env.DB.batch(unused.map((hash) => env.DB.prepare("DELETE FROM look_images WHERE user_id = ? AND hash = ?").bind(userId, hash)));
}

/** Everything look-related for an account, for deleting it: the R2 keys to remove (the rows go with the account). */
export async function lookImageKeys(env: Env, userId: string): Promise<string[]> {
  const rows = await env.DB.prepare("SELECT hash FROM look_images WHERE user_id = ?").bind(userId).all<{ hash: string }>();
  return rows.results.map((row) => imageKey(userId, row.hash));
}

/** A slot name an AI asked for, checked. */
export function checkSlot(slot: string): string {
  if (!SLOT_NAME.test(slot)) throw new LibraryError("Image slots use lowercase letters, numbers and dashes, starting with a letter (background, mark, paper, …).");
  return slot;
}
