// Your AI's packs: the relay between its MCP tools (mcp-packs.ts) and your devices (public/js/study/pack-inbox.js),
// and the latest copy of each pack of yours for your AI to read. Schema: migrations/0004_packs.sql.
//
// - Every change is checked here before it's queued, with the code the device runs (study/pack-authoring.js
//   applyChange, study/pack-format.js checkPack): against the account's copy of the pack, with the changes still on
//   their way applied on top, and against the language's default packs and your other packs.
// - It then fans out to every device of yours (pack_deliveries). Each takes it, applies it to its own copy, checks it
//   again and reports back. A change keeps its id everywhere, so applying it twice changes nothing.
// - A change's content goes once every device has it, or after 7 days. A device seen for the first time gets the
//   changes still on their way (it says plainly when one is for a pack it doesn't have).
// - Deleting a pack, or Undo, in the app is queued the same way, for every device (the one it was pressed on takes it
//   like the rest, so a lost answer can't leave them apart).
// - A change is queued only if nothing else changed the pack since it was checked (compare-and-set on the pack's
//   latest change), so two at once can't pass the same check.
// - The copies are for your AI and for the check here; they're never served back to a device.

import { plainItems, sentencesOf } from "../public/js/study/pack-items.js";
import { upgradeChange, upgradePack } from "../public/js/study/pack-format.js";
import type { Env } from "./env";
import { LibraryError, PACK_AUDIO_UPLOADS, requestUpload, uploadKey } from "./library";
import { fileSafetyHeaders, randomId, sha256Hex } from "./util";
import { deviceTexts, dropUploads, textDeliveriesForGoneDevices, textDeliveriesForNewDevice, textHousekeepingWork, tidy as tidyTexts } from "./texts";
import { soundsRight } from "./audio-bytes";
import { checkAudio as checkAudioJs, clipName, fitAudio as fitAudioJs, mergeAudio as mergeAudioJs, withoutItems as withoutItemsJs } from "../public/js/study/pack-audio.js";
import { LANGUAGES } from "../public/js/lang/index.js";
import { BUILT_IN } from "../public/js/packs/index.js";
import { checkPack as checkPackJs, cleanText as cleanTextJs, defaultInstalled as defaultInstalledJs, PACK_LIMITS } from "../public/js/study/pack-format.js";
import {
  applyChange as applyChangeJs,
  sentenceProblems,
  authoringItem as authoringItemJs,
  DICTIONARIES,
  describeChange as describeChangeJs,
  newPack as newPackJs,
  ownPatternIds as ownPatternIdsJs,
  packIdFor as packIdForJs,
  storedItem as storedItemJs,
} from "../public/js/study/pack-authoring.js";
import { grammarReady } from "./grammar";

export type Problem = { at: string; message: string };
type Item = Record<string, unknown> & { id: string };
export interface Pack {
  id: string;
  name: string;
  about?: string;
  language: string;
  from: string;
  topics: Record<string, string>;
  words: Record<string, string>;
  readings?: Record<string, string>;
  chunks: Record<string, unknown>;
  patterns: Record<string, unknown>;
  items: Item[];
  builtIn?: boolean;
}
type DictionaryKey = "topics" | "words" | "readings" | "chunks" | "patterns";
type Dictionaries = Partial<Record<DictionaryKey, Record<string, unknown>>>;
export type Change =
  | { kind: "create"; pack: Pack }
  | { kind: "add" | "update"; items: Item[]; dictionaries?: Dictionaries }
  | { kind: "remove"; ids: string[] }
  | { kind: "edit"; name?: string; about?: string | null; dictionaries?: Dictionaries }
  | { kind: "undo"; change: string }
  | { kind: "delete" }
  | { kind: "audio"; voices: Record<string, unknown> | null; clips: string[] };
type PackRef = { id: string; version: string };

// The shared plain-JS modules, typed as they're called here.
const ownPatternIds = ownPatternIdsJs as unknown as (change: unknown, pack: Pack | null, catalogue: Record<string, unknown>) => unknown;
const checkPack = checkPackJs as unknown as (value: unknown, options?: { installed?: unknown[] }) => { pack: Pack | null; errors: Problem[]; warnings: Problem[] };
const defaultInstalled = defaultInstalledJs as unknown as (catalogue: unknown, language: string, fetchPack: (ref: PackRef) => Promise<unknown>, exceptId?: string) => Promise<Pack[]>;
const applyChange = applyChangeJs as unknown as (pack: Pack | null, change: Change) => { pack: Pack | null; problems: Problem[] };
type Manifest = Record<string, unknown> & { voices: Record<string, { name?: string; items?: Record<string, { clip: string }>; words?: Record<string, { clip: string }> }> };
const checkAudio = checkAudioJs as unknown as (value: unknown, pack: Pack) => { audio: Manifest | null; errors: Problem[]; warnings: Problem[] };
const fitAudio = fitAudioJs as unknown as (value: unknown, pack: Pack, options?: { still?: Set<string> | null }) => Manifest | null;
const mergeAudio = mergeAudioJs as unknown as (base: unknown, change: unknown, pack: Pack) => Manifest | null;
const withoutItems = withoutItemsJs as unknown as (audio: unknown, ids: Iterable<string>) => Manifest | null;
const authoringItem = authoringItemJs as unknown as (item: Item, language?: string) => Record<string, unknown>;
const describeChange = describeChangeJs as unknown as (change: Change, options?: { name?: string; was?: string }) => string;
const newPack = newPackJs as unknown as (shell: { id: string; name: string; about?: string; language: string; from?: string }) => Pack;
const packIdFor = packIdForJs as unknown as (name: string, taken: Set<string>) => string;
const storedItem = storedItemJs as unknown as (input: unknown, options: { language: string; taken: Set<string> }) => { item: Item | null; problems: Problem[]; warnings?: Problem[] };

const DAY = 86_400_000;
export const PACK_RELAY = {
  keep: 7 * DAY, // a change waits this long for every device
  deviceGone: 30 * DAY, // a device not seen this long gets no new changes, and is forgotten
  history: 90 * DAY, // what list_pack_changes can still show
  waiting: 100, // changes on their way at once, per account
  itemsPerChange: 100,
  packs: 200, // packs of yours the account keeps a copy of
  devices: 20,
  inbox: 25, // changes one poll hands a device
  audioInTransit: 200 * 1024 * 1024, // bytes of recordings on their way to an account's devices at once
  clipsPerChange: 100, // recordings one set_pack_audio uploads
  audioManifest: 1_500_000, // a pack of yours's recordings as JSON (a D1 value holds 2 MB)
};
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PACK_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
const CHANGE_ID = /^chg_[A-Za-z0-9_-]{6,40}$/;

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const json = <T>(text: string | null | undefined, fallback: T): T => {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};
// A field read as text or a number, as String() and Number() read every primitive, but never from an object: JSON can
// carry one whose toString is null, which they throw on. An object reads as "" or NaN, which every check refuses.
const asText = (value: unknown) => (value !== null && typeof value === "object" ? "" : String(value ?? ""));
const asNumber = (value: unknown) => (value !== null && typeof value === "object" ? NaN : Number(value));
const text = (value: unknown, max: number) => asText(value).replace(/\s+/g, " ").trim().slice(0, max);

// ---------- what everyone has: the library's default packs ----------

const fetchLibraryPack = (env: Env) => async (ref: PackRef) => {
  const object = await env.LIBRARY.get(`packs/${ref.id}/${ref.version}/pack.json`);
  return object ? upgradePack(JSON.parse(await object.text())) : null;
};

async function catalogueNow(env: Env): Promise<{ packs?: Record<string, { id: string }[]> }> {
  const object = await env.LIBRARY.get("catalogue.json");
  return object ? JSON.parse(await object.text()) : { packs: {} };
}

/** A language's default packs (the library's, and the app's built-in ones not among them): what everyone has. */
async function defaultsFor(env: Env, language: string): Promise<Pack[]> {
  const catalogue = await catalogueNow(env);
  // The language's shared grammar first (src/grammar.ts): every check beside these packs resolves patterns against it.
  await grammarReady(env, language, catalogue);
  const defaults = await defaultInstalled(catalogue, language, fetchLibraryPack(env));
  const builtIn = (BUILT_IN as Pack[]).filter((p) => p.language === language && !defaults.some((d) => d.id === p.id)).map((p) => ({ ...p, builtIn: true }));
  return [...defaults.map((p) => ({ ...p, builtIn: true })), ...builtIn];
}

/** Every public pack id (the library's in any language, and the app's built-in ones): a pack of yours can't take one. */
async function publicIds(env: Env): Promise<Set<string>> {
  const catalogue = await catalogueNow(env);
  return new Set([...Object.values(catalogue.packs ?? {}).flatMap((list) => (Array.isArray(list) ? list.map((entry) => entry?.id) : [])), ...(BUILT_IN as Pack[]).map((p) => p.id)].filter(Boolean));
}

// ---------- the devices ----------

export interface DevicePack {
  id: string;
  name: string;
  language: string;
  kind: "yours" | "default" | "follow";
  on: boolean;
  items: number;
}

function devicePacks(value: unknown): DevicePack[] {
  if (!Array.isArray(value)) throw new LibraryError("packs must be a list of the packs on this device.");
  return value.slice(0, 400).flatMap((p) => {
    if (!isObject(p) || !PACK_ID.test(asText(p.id))) return [];
    const kind = p.kind === "default" || p.kind === "follow" ? p.kind : "yours";
    return [{ id: asText(p.id), name: text(p.name, PACK_LIMITS.name), language: text(p.language, 8), kind, on: p.on !== false, items: Math.max(0, Math.min(asNumber(p.items) || 0, PACK_LIMITS.items)) }];
  });
}

/**
 * The furthest the account's relay has got: its last change (seq), or the last any copy of its packs includes once
 * changes have gone from history. A device takes a copy of a pack from your own storage only up to it, and the
 * account keeps no copy past it, so a made-up place in the relay can't hold a pack where it is.
 */
export async function relayLatest(env: Env, userId: string) {
  const row = await relayLatestStatement(env, userId).first<{ latest: number }>();
  return row?.latest ?? 0;
}
const relayLatestStatement = (env: Env, userId: string) =>
  env.DB.prepare("SELECT MAX(COALESCE((SELECT MAX(seq) FROM pack_changes WHERE user_id = ?1), 0), COALESCE((SELECT MAX(through) FROM pack_copies WHERE user_id = ?1), 0)) AS latest").bind(userId);

/**
 * A device says it's here and what's on it (when the app starts, and when its packs change). A device seen for the
 * first time gets the changes still on their way. latest: the relay's furthest change (relayLatest).
 *
 * Every start runs this, so it costs D1 as few round trips as it can (7 Nov 2026, the load rehearsal: D1's limit is round trips,
 * not SQL time, and this was 14 of a start's 29). One batch reads the device and whether each piece of housekeeping has anything
 * to do (housekeepingWork); a piece with work runs exactly as before, one without is skipped (every statement in it would have
 * changed nothing); then the write and the answer's two reads go in one batch. 3 round trips with the session's, when there's
 * nothing to tidy.
 */
export async function putDevice(env: Env, userId: string, deviceId: string, label: unknown, packs: unknown, texts?: unknown) {
  if (!DEVICE_ID.test(deviceId)) throw new LibraryError("A device id is 8 to 64 letters, digits, dashes or underscores.");
  const list = JSON.stringify(devicePacks(packs));
  const textList = JSON.stringify(deviceTexts(texts));
  const name = text(label, 60) || "A device";
  const now = Date.now();
  const deviceState = () =>
    env.DB.prepare("SELECT EXISTS (SELECT 1 FROM pack_devices WHERE user_id = ?1 AND device_id = ?2) AS known, (SELECT COUNT(*) FROM pack_devices WHERE user_id = ?1) AS n").bind(userId, deviceId);
  const [stateRead, packWork, textWork] = (await env.DB.batch([deviceState(), housekeepingWork(env, userId, now), textHousekeepingWork(env, userId, now)])) as unknown as [
    D1Result<{ known: number; n: number }>,
    D1Result<{ gone: number; tidy: number }>,
    D1Result<{ tidy: number }>,
  ];
  let state = stateRead.results[0];
  if (packWork.results[0]?.gone) {
    await forgetGone(env, userId, now);
    // Forgetting may have taken this very device (back after 30 days away): it's new again.
    state = (await deviceState().first<{ known: number; n: number }>()) ?? state;
  }
  if (packWork.results[0]?.tidy) await tidy(env, userId, now);
  if (textWork.results[0]?.tidy) await tidyTexts(env, userId, now);
  const answer = [relayLatestStatement(env, userId), sharedSourcesStatement(env, userId)];
  const answered = (results: D1Result[], added: boolean) => ({
    device: deviceId,
    added,
    latest: (results.at(-2)?.results[0] as { latest?: number } | undefined)?.latest ?? 0,
    shared: ((results.at(-1)?.results ?? []) as { source_id: string }[]).map((row) => row.source_id),
  });
  if (state?.known) {
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE pack_devices SET label = ?, packs = ?, texts = ?, seen_at = ? WHERE user_id = ? AND device_id = ?").bind(name, list, textList, now, userId, deviceId),
      ...answer,
    ]);
    return answered(results, false);
  }
  if ((state?.n ?? 0) >= PACK_RELAY.devices) throw new LibraryError(`An account's changes go to up to ${PACK_RELAY.devices} devices; one not opened for 30 days makes room.`);
  const results = await env.DB.batch([
    env.DB.prepare("INSERT INTO pack_devices (user_id, device_id, label, packs, texts, added_at, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(userId, deviceId, name, list, textList, now, now),
    // A device back after 30 days away (forgotten, so new again) may have had a change still on its way expire for it
    // while it was gone: it waits for it again.
    env.DB.prepare(
      `INSERT INTO pack_deliveries (change_seq, user_id, device_id, state) SELECT seq, user_id, ?, 'waiting' FROM pack_changes WHERE user_id = ? AND body IS NOT NULL AND expires_at > ?
       ON CONFLICT (change_seq, device_id) DO UPDATE SET state = 'waiting', result = NULL, settled_at = NULL WHERE pack_deliveries.state = 'expired'`,
    ).bind(deviceId, userId, now),
    textDeliveriesForNewDevice(env, userId, deviceId, now),
    ...answer,
  ]);
  return answered(results, true);
}

/** The packs of an account's that it shared in Explore: a device sends its copy of these with no AI connected, so a fix the author accepts reaches it. */
const sharedSourcesStatement = (env: Env, userId: string) =>
  env.DB.prepare("SELECT source_id FROM items WHERE owner_id = ? AND state != 'removed' AND source_id IS NOT NULL").bind(userId);

/** Devices not seen for 30 days get no more changes; what was waiting for them expires. (housekeepingWork's "gone" is its WHERE.) */
async function forgetGone(env: Env, userId: string, now: number) {
  const before = now - PACK_RELAY.deviceGone;
  await env.DB.batch([
    env.DB.prepare("UPDATE pack_deliveries SET state = 'expired', settled_at = ? WHERE user_id = ? AND state = 'waiting' AND device_id IN (SELECT device_id FROM pack_devices WHERE user_id = ? AND seen_at < ?)").bind(now, userId, userId, before),
    textDeliveriesForGoneDevices(env, userId, before, now),
    env.DB.prepare("DELETE FROM pack_devices WHERE user_id = ? AND seen_at < ?").bind(userId, before),
  ]);
}

// ---------- the relay: a device's side ----------

/** Whether anything waits for a device: the app's poll, one read. */
export async function hasWaiting(env: Env, userId: string, deviceId: string): Promise<boolean> {
  return Boolean(await env.DB.prepare(PACKS_WAITING).bind(userId, deviceId, Date.now()).first());
}
/** Whether a change waits for a device, as SQL: user, device, now. GET /api/packs/inbox asks it beside the text relay's in one statement. */
export const PACKS_WAITING = "SELECT 1 AS y FROM pack_deliveries d JOIN pack_changes c ON c.seq = d.change_seq WHERE d.user_id = ? AND d.device_id = ? AND d.state = 'waiting' AND c.expires_at > ? LIMIT 1";

export interface RelayedChange {
  id: string;
  seq: number;
  packId: string;
  packName: string | null;
  kind: string;
  change: Change;
  said: string;
  source: string;
  undoes: string | null;
  createdAt: number;
}

/** The changes waiting for a device, oldest first. */
export async function inbox(env: Env, userId: string, deviceId: string): Promise<RelayedChange[]> {
  const rows = await env.DB.prepare(
    `SELECT c.seq, c.id, c.pack_id, c.kind, c.body, c.said, c.source, c.undoes, c.created_at, json_extract(p.pack, '$.name') AS pack_name
     FROM pack_deliveries d JOIN pack_changes c ON c.seq = d.change_seq LEFT JOIN pack_copies p ON p.user_id = c.user_id AND p.pack_id = c.pack_id
     WHERE d.user_id = ? AND d.device_id = ? AND d.state = 'waiting' AND c.expires_at > ? AND c.body IS NOT NULL ORDER BY c.seq LIMIT ?`,
  )
    .bind(userId, deviceId, Date.now(), PACK_RELAY.inbox)
    .all<{ seq: number; id: string; pack_id: string; kind: string; body: string; said: string; source: string; undoes: string | null; created_at: number; pack_name: string | null }>();
  return rows.results.map((r) => ({ id: r.id, seq: r.seq, packId: r.pack_id, packName: r.pack_name, kind: r.kind, change: upgradeChange(JSON.parse(r.body)) as Change, said: r.said, source: r.source, undoes: r.undoes, createdAt: r.created_at }));
}

const REPORTS = new Set(["applied", "refused", "missing"]);

/**
 * A device's report on a change: applied, refused (its check found problems: errors, warnings) or missing (it
 * doesn't have the pack). Once every device has reported, the change's content goes.
 */
export async function report(env: Env, userId: string, deviceId: string, changeId: string, input: unknown) {
  if (!CHANGE_ID.test(changeId)) throw new LibraryError("No change has that id.");
  const body = isObject(input) ? input : {};
  const state = asText(body.state);
  if (!REPORTS.has(state)) throw new LibraryError("state must be applied, refused or missing.");
  const problems = (value: unknown) => (Array.isArray(value) ? value.slice(0, 50).map((p) => ({ at: text(isObject(p) ? p.at : "", 120), message: text(isObject(p) ? p.message : p, 400) })) : []);
  const result = JSON.stringify({ errors: problems(body.errors), warnings: problems(body.warnings) });
  const change = await env.DB.prepare("SELECT seq FROM pack_changes WHERE id = ? AND user_id = ?").bind(changeId, userId).first<{ seq: number }>();
  if (!change) throw new LibraryError("No change has that id.");
  const now = Date.now();
  const [, , gone] = await env.DB.batch([
    env.DB.prepare("UPDATE pack_deliveries SET state = ?, result = ?, settled_at = ? WHERE change_seq = ? AND device_id = ? AND state = 'waiting'").bind(state, result, now, change.seq, deviceId),
    // Its content goes once none is waiting, and only when this report was a device's own (a report from a device it never
    // went to, or a second one, changes nothing).
    env.DB.prepare(
      `UPDATE pack_changes SET body = NULL WHERE seq = ? AND NOT EXISTS (SELECT 1 FROM pack_deliveries WHERE change_seq = ? AND state = 'waiting')
       AND EXISTS (SELECT 1 FROM pack_deliveries WHERE change_seq = ? AND device_id = ? AND state = ? AND settled_at = ?)`,
    ).bind(change.seq, change.seq, change.seq, deviceId, state, now),
    env.DB.prepare("SELECT body FROM pack_changes WHERE seq = ?").bind(change.seq),
  ]);
  // Every device has it: its recordings go from the server (their home is your devices and your own storage).
  if ((gone!.results[0] as { body: string | null } | undefined)?.body === null) await dropUploads(env, userId, "purpose", `pack-audio-in:${changeId}`).catch(() => {});
  return { ok: true };
}

/**
 * A device's copy of a pack of yours, sent after a change (through: the last change it includes). It's checked as
 * the device checked it; an older copy than the one kept is ignored.
 */
export async function putCopy(env: Env, userId: string, deviceId: string, packId: string, input: unknown) {
  const body = isObject(input) ? input : {};
  const through = asNumber(body.through ?? 0);
  if (!Number.isInteger(through) || through < 0) throw new LibraryError("through must be the last change the copy includes (0 for none).");
  if (through > (await relayLatest(env, userId))) throw new LibraryError("through is past the last change your packs have had.");
  const raw = body.pack;
  if (!isObject(raw) || raw.id !== packId) throw new LibraryError("pack must be the pack whose id is in the address.");
  const language = asText(raw.language);
  if (!Object.hasOwn(LANGUAGES, language)) throw new LibraryError("That pack's language isn't one Lexicommons knows.");
  if ((await publicIds(env)).has(packId)) throw new LibraryError("That's a public pack's id.");
  const others = await copiesOf(env, userId, language, packId);
  const { pack, errors } = checkPack(raw, { installed: [...(await defaultsFor(env, language)), ...others] });
  if (!pack) throw new LibraryError(`The pack doesn't pass the check: ${errors.slice(0, 3).map((e) => e.message).join(" ")}`);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM pack_copies WHERE user_id = ? AND pack_id != ? AND pack IS NOT NULL").bind(userId, packId).first<{ n: number }>();
  if ((count?.n ?? 0) >= PACK_RELAY.packs) throw new LibraryError(`The account keeps a copy of up to ${PACK_RELAY.packs} packs.`);
  // Its recordings as the device has them (an Undo puts back older ones), up to the same change: what set_pack_audio
  // merges into and get_pack lists. Ones that don't fit the pack are refused. They're written in the copy's own batch,
  // only if this copy is the one kept there now; too many to keep, or none sent (an older app, whose copy can't say what
  // its recordings read), and the account keeps none.
  let audio: Manifest | null = null;
  if (body.audio !== undefined && body.audio !== null) {
    const checked = checkAudio(body.audio, pack as Pack);
    if (!checked.audio) throw new LibraryError(`The recordings don't fit the pack: ${checked.errors.slice(0, 3).map((e) => e.message).join(" ")}`);
    audio = checked.audio;
  }
  const text = audio ? JSON.stringify(audio) : null;
  const keep = text !== null && text.length <= PACK_RELAY.audioManifest;
  const stamp = Date.now();
  const won = "EXISTS (SELECT 1 FROM pack_copies WHERE user_id = ? AND pack_id = ? AND through = ? AND device_id = ? AND updated_at = ?)";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pack_copies (user_id, pack_id, language, pack, through, device_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, pack_id) DO UPDATE SET language = excluded.language, pack = excluded.pack, through = excluded.through, device_id = excluded.device_id, updated_at = excluded.updated_at
       WHERE excluded.through >= pack_copies.through`,
    ).bind(userId, packId, language, JSON.stringify(pack), through, deviceId, stamp),
    keep
      ? env.DB.prepare(
          `INSERT INTO pack_audio (user_id, pack_id, manifest, through, updated_at) SELECT ?, ?, ?, ?, ? WHERE ${won}
           ON CONFLICT (user_id, pack_id) DO UPDATE SET manifest = excluded.manifest, through = excluded.through, updated_at = excluded.updated_at WHERE excluded.through >= pack_audio.through`,
        ).bind(userId, packId, text, through, stamp, userId, packId, through, deviceId, stamp)
      : env.DB.prepare(`DELETE FROM pack_audio WHERE user_id = ? AND pack_id = ? AND through <= ? AND ${won}`).bind(userId, packId, through, userId, packId, through, deviceId, stamp),
  ]);
  return { ok: true, ...(text && !keep ? { recordings: `too many to keep a list of on the account (over ${PACK_RELAY.audioManifest / 1_000_000} MB): get_pack won't list them` } : {}) };
}

/**
 * A pack of yours is gone from a device (deleted, or undone back to before it was made), at a change (through): its
 * copy goes, leaving a mark at that change so an older copy arriving late can't bring it back.
 */
export async function deleteCopy(env: Env, userId: string, deviceId: string, packId: string, through: number) {
  if (!PACK_ID.test(packId)) throw new LibraryError("That isn't a pack's id.");
  if (!Number.isInteger(through) || through < 1) throw new LibraryError("through must be the change that took the pack away.");
  if (through > (await relayLatest(env, userId))) throw new LibraryError("through is past the last change your packs have had.");
  const stamp = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pack_copies (user_id, pack_id, language, pack, through, device_id, updated_at) VALUES (?, ?, '', NULL, ?, ?, ?)
       ON CONFLICT (user_id, pack_id) DO UPDATE SET pack = NULL, through = excluded.through, device_id = excluded.device_id, updated_at = excluded.updated_at
       WHERE excluded.through >= pack_copies.through`,
    ).bind(userId, packId, through, deviceId, stamp),
    // Its recordings go with it, only if this is the write that took it away.
    env.DB.prepare(
      "DELETE FROM pack_audio WHERE user_id = ? AND pack_id = ? AND through <= ? AND EXISTS (SELECT 1 FROM pack_copies WHERE user_id = ? AND pack_id = ? AND pack IS NULL AND through = ? AND device_id = ? AND updated_at = ?)",
    ).bind(userId, packId, through, userId, packId, through, deviceId, stamp),
  ]);
  return { ok: true };
}

/**
 * Deleting a pack, Undo, or a change to a pack the account has a copy of, pressed in the app: queued for every device, the one it was pressed
 * on included (it takes it as the others do). input: { kind: "delete", packId, name }, { kind: "undo", change } or { kind: "add" | "update", packId,
 * items, said? } and { kind: "remove", packId, ids, said? } (items as a device stores them).
 */
export async function queueFromDevice(env: Env, userId: string, label: string, input: unknown) {
  const body = isObject(input) ? input : {};
  const source = `device:${text(label, 60)}`;
  if (body.kind === "delete") {
    const packId = asText(body.packId);
    if (!PACK_ID.test(packId)) throw new LibraryError("packId must be a pack's id.");
    const name = text(body.name, PACK_LIMITS.name) || packId;
    return queue(env, userId, { packId, change: { kind: "delete" }, said: describeChange({ kind: "delete" }, { name }), source });
  }
  if (body.kind === "undo") return undoChange(env, userId, source, asText(body.change));
  // A change you made in the app to a pack the account has a copy of: as the device wrote it, checked here as your AI's are.
  if (body.kind === "add" || body.kind === "update" || body.kind === "remove") {
    const packId = asText(body.packId);
    if (!PACK_ID.test(packId)) throw new LibraryError("packId must be a pack's id.");
    const now = await packNow(env, userId, packId);
    if (!now.pack) throw new LibraryError("This account doesn't have that pack yet. Try again in a moment.");
    const said = text(body.said, 200) || undefined;
    if (body.kind === "remove") {
      if (!Array.isArray(body.ids) || body.ids.length > PACK_RELAY.itemsPerChange || !body.ids.every((id) => typeof id === "string")) throw new LibraryError(`ids must be up to ${PACK_RELAY.itemsPerChange} item ids.`);
      return checkAndQueue(env, userId, source, now as PackNow & { pack: Pack }, { kind: "remove", ids: body.ids as string[] }, () => null, { saying: said });
    }
    if (!Array.isArray(body.items) || body.items.length > PACK_RELAY.itemsPerChange || !body.items.every((item) => isObject(item) && typeof item.id === "string" && item.id)) throw new LibraryError(`items must be up to ${PACK_RELAY.itemsPerChange} items, each with its id.`);
    return checkAndQueue(env, userId, source, now as PackNow & { pack: Pack }, { kind: body.kind, items: body.items as Change extends { items: infer I } ? I : never }, () => null, { saying: said });
  }
  throw new LibraryError("kind must be add, update, remove, delete or undo.");
}

// ---------- the queue ----------

/**
 * Whether forgetGone and tidy have anything to do for an account, as one statement for the device route's first batch: gone, a
 * device past 30 days (forgetGone's own WHERE); tidy, any of tidy's statements' own WHEREs (a waiting delivery of an expired change,
 * an expired change still holding its content, a change past its 90 days, a recording upload tidy would look at). Change one of
 * those statements and change its line here with it: a check that misses work leaves it undone (test-pack-relay checks each).
 */
function housekeepingWork(env: Env, userId: string, now: number) {
  return env.DB.prepare(
    `SELECT EXISTS (SELECT 1 FROM pack_devices WHERE user_id = ?1 AND seen_at < ?3) AS gone,
            EXISTS (SELECT 1 FROM pack_deliveries d JOIN pack_changes c ON c.seq = d.change_seq WHERE d.user_id = ?1 AND d.state = 'waiting' AND c.user_id = ?1 AND c.expires_at <= ?2)
         OR EXISTS (SELECT 1 FROM pack_changes WHERE user_id = ?1 AND expires_at <= ?2 AND body IS NOT NULL)
         OR EXISTS (SELECT 1 FROM pack_changes WHERE user_id = ?1 AND created_at < ?4)
         OR EXISTS (SELECT 1 FROM uploads u WHERE u.user_id = ?1 AND (u.purpose = 'pack-audio-going' OR u.purpose LIKE 'pack-audio-claim:%'
              OR (u.purpose LIKE 'pack-audio:%' AND COALESCE(u.stored_at, u.created_at) < ?5)
              OR (u.purpose LIKE 'pack-audio-in:%' AND NOT EXISTS (SELECT 1 FROM pack_changes c WHERE c.user_id = u.user_id AND c.body IS NOT NULL AND u.purpose = 'pack-audio-in:' || c.id)))) AS tidy`,
  ).bind(userId, now, now - PACK_RELAY.deviceGone, now - PACK_RELAY.history, now - DAY);
}

/** Waiting changes past their 7 days expire (their content goes), and history past 90 days is forgotten. */
async function tidy(env: Env, userId: string, now: number) {
  const expiring = await env.DB.prepare("SELECT id FROM pack_changes WHERE user_id = ? AND expires_at <= ? AND body IS NOT NULL AND kind = 'audio'").bind(userId, now).all<{ id: string }>();
  await env.DB.batch([
    env.DB.prepare("UPDATE pack_deliveries SET state = 'expired', settled_at = ? WHERE user_id = ? AND state = 'waiting' AND change_seq IN (SELECT seq FROM pack_changes WHERE user_id = ? AND expires_at <= ?)").bind(now, userId, userId, now),
    env.DB.prepare("UPDATE pack_changes SET body = NULL WHERE user_id = ? AND expires_at <= ? AND body IS NOT NULL").bind(userId, now),
    env.DB.prepare("DELETE FROM pack_deliveries WHERE user_id = ? AND change_seq IN (SELECT seq FROM pack_changes WHERE user_id = ? AND created_at < ?)").bind(userId, userId, now - PACK_RELAY.history),
    env.DB.prepare("DELETE FROM pack_changes WHERE user_id = ? AND created_at < ?").bind(userId, now - PACK_RELAY.history),
  ]);
  // A change past its 7 days takes its recordings with it. A recording set_pack_audio never used goes a day on, and a
  // claim a set_pack_audio never finished an hour on (one in progress is never taken). Each one only if it's still what
  // was read (marked going first, so a claim and a delete can't both have it), and when it can: what can't go now is
  // found again next time.
  for (const { id } of expiring.results) await dropUploads(env, userId, "purpose", `pack-audio-in:${id}`).catch(() => {});
  const left = await env.DB.prepare(
    `SELECT u.id, u.purpose FROM uploads u WHERE u.user_id = ? AND (u.purpose = 'pack-audio-going' OR u.purpose LIKE 'pack-audio-claim:%'
       OR (u.purpose LIKE 'pack-audio:%' AND COALESCE(u.stored_at, u.created_at) < ?)
       OR (u.purpose LIKE 'pack-audio-in:%' AND NOT EXISTS (SELECT 1 FROM pack_changes c WHERE c.user_id = u.user_id AND c.body IS NOT NULL AND u.purpose = 'pack-audio-in:' || c.id)))`,
  )
    .bind(userId, now - DAY)
    .all<{ id: string; purpose: string }>();
  for (const { id, purpose } of left.results) {
    if (purpose.startsWith("pack-audio-claim:") && !(claimedAt(purpose) < now - HOUR)) continue;
    await dropRecording(env, userId, id, purpose).catch(() => {});
  }
}

/** Deletes a recording only if it's still what was read: marked going first, then its bytes, then its row. */
async function dropRecording(env: Env, userId: string, id: string, purpose: string) {
  if (purpose !== "pack-audio-going") {
    const marked = await env.DB.prepare("UPDATE uploads SET purpose = 'pack-audio-going' WHERE user_id = ? AND id = ? AND purpose = ?").bind(userId, id, purpose).run();
    if (!marked.meta.changes) return;
  }
  await dropUploads(env, userId, "id", id);
}

/**
 * Queues a checked change for every device of yours. head: the pack's latest change (seq, 0 for none) when it was
 * checked; if another change arrived since, nothing is queued and the caller is told to check again.
 */
async function queue(
  env: Env,
  userId: string,
  {
    packId,
    change,
    said,
    source,
    undoes,
    head,
    files = [],
    claim,
  }: {
    packId: string;
    change: Change;
    said: string;
    source: string;
    undoes?: string;
    head?: number;
    files?: { uploadId: string; name: string }[];
    /** A set_pack_audio's recordings: queued only while every one is still claimed and they fit what's in transit. */
    claim?: { purpose: string; count: number; bytes: number };
  },
) {
  const now = Date.now();
  await tidy(env, userId, now);
  const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM pack_changes WHERE user_id = ? AND body IS NOT NULL").bind(userId).first<{ n: number }>();
  if ((waiting?.n ?? 0) >= PACK_RELAY.waiting) {
    throw new LibraryError(
      source.startsWith("device:")
        ? `${PACK_RELAY.waiting} changes are still on their way to your other devices. Open Lexicommons on them, then try again.`
        : `${PACK_RELAY.waiting} changes are still on their way to their devices. Ask them to open Lexicommons on each device, then go on.`,
    );
  }
  const id = `chg_${randomId(12)}`;
  const guard = head ?? null;
  // One batch, so nothing can fail once the change is queued (a caller told it failed would send it again), and the
  // devices named are the ones it's on its way to.
  const [inserted, , made, devices] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pack_changes (id, user_id, pack_id, kind, body, said, source, undoes, created_at, expires_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (? IS NULL OR COALESCE((SELECT MAX(seq) FROM pack_changes WHERE user_id = ? AND pack_id = ?), 0) = ?)
       AND (? IS NULL OR ((SELECT COUNT(*) FROM uploads WHERE user_id = ? AND purpose = ? AND status = 'stored') = ?
            AND (SELECT COALESCE(SUM(size), 0) FROM uploads WHERE user_id = ? AND purpose LIKE 'pack-audio-in:%') + ? <= ?))`,
    ).bind(
      id,
      userId,
      packId,
      change.kind,
      JSON.stringify(change),
      said,
      source,
      undoes ?? null,
      now,
      now + PACK_RELAY.keep,
      guard,
      userId,
      packId,
      guard,
      claim?.purpose ?? null,
      userId,
      claim?.purpose ?? "",
      claim?.count ?? 0,
      userId,
      claim?.bytes ?? 0,
      PACK_RELAY.audioInTransit,
    ),
    env.DB.prepare(
      `INSERT INTO pack_deliveries (change_seq, user_id, device_id, state)
       SELECT (SELECT seq FROM pack_changes WHERE id = ?), ?, device_id, 'waiting' FROM pack_devices
       WHERE user_id = ? AND seen_at >= ? AND EXISTS (SELECT 1 FROM pack_changes WHERE id = ?)`,
    ).bind(id, userId, userId, now - PACK_RELAY.deviceGone, id),
    env.DB.prepare("SELECT seq FROM pack_changes WHERE id = ?").bind(id),
    env.DB.prepare(
      `SELECT p.label FROM pack_deliveries d JOIN pack_devices p ON p.user_id = d.user_id AND p.device_id = d.device_id
       WHERE d.user_id = ? AND d.change_seq = (SELECT seq FROM pack_changes WHERE id = ?) ORDER BY p.seen_at DESC`,
    ).bind(userId, id),
    // The change's files (a pack's recordings), marked as its own in the same batch, only if it was queued.
    ...files.map((f) =>
      env.DB.prepare("UPDATE uploads SET purpose = ?, filename = ? WHERE user_id = ? AND id = ? AND purpose = ? AND EXISTS (SELECT 1 FROM pack_changes WHERE id = ?)").bind(
        `pack-audio-in:${id}`,
        f.name,
        userId,
        f.uploadId,
        claim?.purpose ?? "",
        id,
      ),
    ),
  ]);
  if (!inserted!.meta.changes) {
    if (claim) {
      const [held, inTransit] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS n FROM uploads WHERE user_id = ? AND purpose = ? AND status = 'stored'").bind(userId, claim.purpose).first<{ n: number }>(),
        env.DB.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM uploads WHERE user_id = ? AND purpose LIKE 'pack-audio-in:%'").bind(userId).first<{ n: number }>(),
      ]);
      if ((held?.n ?? 0) !== claim.count) throw new LibraryError("Some of the recordings went while this was checked (one waits a day for set_pack_audio): upload them again.");
      if ((inTransit?.n ?? 0) + claim.bytes > PACK_RELAY.audioInTransit) throw new LibraryError(inTransitMessage());
    }
    throw new LibraryError("Another change to this pack arrived at the same moment. Read it again (get_pack) and send yours again.");
  }
  return { changeId: id, seq: (made!.results[0] as { seq: number } | undefined)?.seq ?? 0, said, devices: (devices!.results as { label: string }[]).map((d) => d.label) };
}

// ---------- the pack as it will be: the copy, with what's on its way ----------

async function copiesOf(env: Env, userId: string, language: string, exceptId?: string): Promise<Pack[]> {
  const rows = await env.DB.prepare("SELECT pack FROM pack_copies WHERE user_id = ? AND language = ? AND pack_id != ? AND pack IS NOT NULL").bind(userId, language, exceptId ?? "").all<{ pack: string }>();
  return rows.results.map((r) => upgradePack(JSON.parse(r.pack)) as Pack);
}

interface PackNow {
  pack: Pack | null;
  /** The pack's latest change (seq) when it was read: what a change checked against it must still find. */
  head: number;
  /** The changes on their way that the pack here includes. */
  pending: { id: string; said: string }[];
  /** What those changes touch: every item (a create), or these items and dictionary entries ("words:boek"). */
  touched: { all: boolean; items: Set<string>; entries: Set<string> };
  /** The copy came from: { device, at }. */
  copy: { device: string; at: number } | null;
}

/**
 * A pack of yours as it will be once its devices have every change on its way: the account's copy, with those changes
 * applied (a change every device refused is left out). Each change is queued as it was checked (checkAndQueue), so
 * applying it gives what its check gave, and what a device keeps; nothing is checked again here, against defaults that
 * may have changed since. An undo on its way can't be worked out here (it needs the pack as it was), so that's said
 * instead.
 */
async function packNow(env: Env, userId: string, packId: string): Promise<PackNow> {
  const [copy, head] = await Promise.all([
    env.DB.prepare("SELECT c.pack, c.through, c.updated_at, d.label FROM pack_copies c LEFT JOIN pack_devices d ON d.user_id = c.user_id AND d.device_id = c.device_id WHERE c.user_id = ? AND c.pack_id = ?")
      .bind(userId, packId)
      .first<{ pack: string | null; through: number; updated_at: number; label: string | null }>(),
    headOf(env, userId, packId),
  ]);
  const rows = await env.DB.prepare(
    `SELECT c.id, c.kind, c.body, c.said FROM pack_changes c WHERE c.user_id = ? AND c.pack_id = ? AND c.seq > ? AND c.body IS NOT NULL AND c.expires_at > ?
     AND (EXISTS (SELECT 1 FROM pack_deliveries d WHERE d.change_seq = c.seq AND d.state IN ('waiting', 'applied'))
          OR NOT EXISTS (SELECT 1 FROM pack_deliveries d WHERE d.change_seq = c.seq))
     ORDER BY c.seq`,
  )
    .bind(userId, packId, copy?.through ?? 0, Date.now())
    .all<{ id: string; kind: string; body: string; said: string }>();
  let pack: Pack | null = copy?.pack ? (upgradePack(JSON.parse(copy.pack)) as Pack) : null;
  const pending: { id: string; said: string }[] = [];
  const touched = { all: false, items: new Set<string>(), entries: new Set<string>() };
  for (const row of rows.results) {
    const change = upgradeChange(JSON.parse(row.body)) as Change;
    if (change.kind === "undo") throw new LibraryError(`An undo of this pack (${row.id}) is still on its way to their devices. Wait until list_pack_changes shows it applied, then go on.`);
    if (change.kind === "audio") {
      // Recordings leave the pack itself as it is.
      pending.push({ id: row.id, said: row.said });
      continue;
    }
    if (change.kind === "delete") pack = null;
    else {
      const next = applyChange(pack, change);
      if (next.pack) pack = next.pack;
    }
    if (change.kind === "create") touched.all = true;
    if (change.kind === "add" || change.kind === "update") for (const item of change.items) touched.items.add(item.id);
    if (change.kind === "remove") for (const id of change.ids) touched.items.add(id);
    if ((change.kind === "add" || change.kind === "update" || change.kind === "edit") && change.dictionaries) {
      // A lemma-keyed id as checkPack keeps it (a change queued before changes were queued as checked may say " boek ").
      for (const [section, entries] of Object.entries(change.dictionaries)) for (const id of Object.keys(entries ?? {})) touched.entries.add(`${section}:${LEMMA_KEYED.has(section) ? cleanText(id) : id}`);
    }
    pending.push({ id: row.id, said: row.said });
  }
  return { pack, head, pending, touched, copy: copy?.pack ? { device: copy.label ?? "a device no longer listed", at: copy.updated_at } : null };
}

/** A pack's latest change (seq), 0 when it has none. */
async function headOf(env: Env, userId: string, packId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT MAX(seq) AS head FROM pack_changes WHERE user_id = ? AND pack_id = ?").bind(userId, packId).first<{ head: number | null }>();
  return row?.head ?? 0;
}

// ---------- your AI's changes ----------

export interface ItemsInput {
  pack_id: string;
  items: unknown[];
  topics?: Record<string, unknown>;
  words?: Record<string, unknown>;
  readings?: Record<string, unknown>;
  chunks?: Record<string, unknown>;
  patterns?: Record<string, unknown>;
}

const dictionariesOf = (input: Partial<Record<string, unknown>>): Dictionaries | undefined => {
  const out: Dictionaries = {};
  for (const key of ["topics", "words", "readings", "chunks", "patterns"] as const) if (isObject(input[key])) out[key] = input[key] as Record<string, unknown>;
  return Object.keys(out).length ? out : undefined;
};

/**
 * Your AI's items turned into the stored form: { items, problems }, each problem at items[i] in its own list.
 * taken: item ids the pack has; an item without an id gets one made from its sentence.
 */
function convertItems(input: unknown[], language: string, taken: Set<string>) {
  const problems: Problem[] = [];
  // What was left out without sinking the item (a shape that couldn't be placed): said back with the check's own warnings.
  const warnings: Problem[] = [];
  const items: Item[] = [];
  input.forEach((raw, i) => {
    const { item, problems: stored, warnings: noted = [] } = storedItem(raw, { language, taken });
    for (const w of noted) warnings.push({ at: `items[${i}]${w.at ? `.${w.at}` : ""}`, message: `items[${i}]: ${w.message}` });
    const own = [...stored, ...sentenceProblems(raw)];
    for (const p of own) problems.push({ at: `items[${i}]${p.at ? `.${p.at}` : ""}`, message: `items[${i}]: ${p.message}` });
    if (item && !own.length) {
      taken.add(item.id);
      items.push(item);
    } else items.push({ id: "" });
  });
  return { items, problems, warnings };
}

/**
 * A sentence your AI's form couldn't make (its own problems said, convertItems) goes into the check as a stand-in, so the rest keep their
 * places: what the check says of the stand-in (no id, no text) is about nothing your AI wrote, so it's never said.
 */
function withoutStandIns(errors: Problem[], conversion: Problem[]): Problem[] {
  const index = (at: string) => /^items\[(\d+)\]/.exec(at)?.[1] ?? null;
  const failed = new Set(conversion.map((p) => index(p.at)).filter((i): i is string => i !== null));
  return failed.size ? errors.filter((p) => !failed.has(index(p.at) ?? "")) : errors;
}

/**
 * The check's problems as your AI can act on them: a path into the pack ("items[37]") becomes the item's place in the
 * list it sent ("items[2]"), or says it's the pack's own when it isn't one of them.
 */
function inTheirTerms(problems: Problem[], place: (index: number) => number | null): Problem[] {
  // Your AI writes natural and patterns where a pack keeps means and concepts (pack-authoring.js).
  const rewrite = (value: string) => value.replace(/items\[(\d+)\]/g, (_, n) => (place(Number(n)) === null ? `the pack's items[${n}]` : `items[${place(Number(n))}]`)).replace(/\.means\b/g, ".natural").replace(/\.concepts\b/g, ".patterns");
  return problems.map((p) => ({ at: rewrite(p.at), message: rewrite(p.message) }));
}

// The pack's dictionaries, as pack-authoring.js names them (a change merges each); the ones keyed by a lemma, whose
// keys checkPack cleans (lemmaOf), are words and readings.
const DICTIONARY_KEYS = DICTIONARIES as readonly DictionaryKey[];
const LEMMA_KEYED = new Set<string>(["words", "readings"]);
/** JSON with its keys in order, so two values that differ only in key order compare equal. */
const canonical = (value: unknown): string =>
  Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : isObject(value) ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}` : JSON.stringify(value) ?? "null";

const cleanText = cleanTextJs as unknown as (value: unknown) => string;

/**
 * The dictionary entries a change asks for, as its check gave them back: each id it names in checked form (a word's
 * lemma cleaned, as checkPack keeps it; other ids are exact), set to the checked pack's value, or null where the
 * checked pack has none. Exactly what was asked, whatever the pack already says (a change still on its way may yet be
 * refused), and nothing else.
 */
function requestedEntries(asked: Dictionaries | undefined, checked: Pack): Dictionaries | undefined {
  if (!isObject(asked)) return undefined;
  const out: Dictionaries = {};
  for (const key of DICTIONARY_KEYS) {
    const entries = asked[key];
    if (!isObject(entries)) continue;
    const kept = isObject(checked[key]) ? (checked[key] as Record<string, unknown>) : {};
    const section: Record<string, unknown> = {};
    for (const raw of Object.keys(entries)) {
      const id = LEMMA_KEYED.has(key) ? cleanText(raw) : raw;
      if (id) section[id] = Object.hasOwn(kept, id) ? kept[id] : null;
    }
    if (Object.keys(section).length) out[key] = section;
  }
  return Object.keys(out).length ? out : undefined;
}

/** What turns one pack's dictionaries into another's: each entry added or changed, and each taken out (null). */
function dictionaryDelta(before: Pack | null, after: Pack): Dictionaries | undefined {
  const delta: Dictionaries = {};
  for (const key of DICTIONARY_KEYS) {
    const was = isObject(before?.[key]) ? (before[key] as Record<string, unknown>) : {};
    const is = isObject(after[key]) ? (after[key] as Record<string, unknown>) : {};
    const changed: Record<string, unknown> = {};
    for (const id of new Set([...Object.keys(was), ...Object.keys(is)])) {
      if (!Object.hasOwn(is, id)) changed[id] = null;
      else if (!Object.hasOwn(was, id) || canonical(was[id]) !== canonical(is[id])) changed[id] = is[id];
    }
    if (Object.keys(changed).length) delta[key] = changed;
  }
  return Object.keys(delta).length ? delta : undefined;
}

export type Outcome =
  | { ok: false; errors: Problem[]; warnings: Problem[] }
  | { ok: true; changeId: string; seq: number; packId: string; said: string; warnings: Problem[]; devices: string[]; items: number };

/** Checks a pack as it would be after a change; queues the change when it passes (dryRun: only checks). */
async function checkAndQueue(env: Env, userId: string, source: string, now: PackNow & { pack: Pack | null }, change: Change, place: (index: number) => number | null, { dryRun = false, conversion = [] as Problem[], noticed = [] as Problem[], saying }: { dryRun?: boolean; conversion?: Problem[]; noticed?: Problem[]; saying?: string } = {}): Promise<Outcome> {
  const applied = applyChange(now.pack, change);
  if (!applied.pack) return { ok: false, errors: [...conversion, ...applied.problems], warnings: [] };
  const language = applied.pack.language;
  if (!Object.hasOwn(LANGUAGES, language)) return { ok: false, errors: [{ at: "language", message: `language must be one of ${Object.keys(LANGUAGES).join(", ")}.` }], warnings: [] };
  const installed = [...(await defaultsFor(env, language)), ...(await copiesOf(env, userId, language, applied.pack.id))];
  const checked = checkPack(applied.pack, { installed });
  const errors = [...conversion, ...withoutStandIns(inTheirTerms(checked.errors, place), conversion)];
  const warnings = [...noticed, ...inTheirTerms(checked.warnings, place)];
  if (errors.length || !checked.pack) return { ok: false, errors, warnings };
  // What's queued is the change as checked: the items the check kept, and the entries, name and line it asked for as the
  // check gave them back (an entry " boek " is queued as "boek"), and nothing else. So applying it gives what was checked
  // here, and the pack as it will be (packNow) never needs checking again.
  const kept = new Map(checked.pack.items.map((item) => [item.id, item]));
  const delta = change.kind === "add" || change.kind === "update" || change.kind === "edit" ? requestedEntries(change.dictionaries, checked.pack) : undefined;
  const body: Change =
    change.kind === "create"
      ? { kind: "create", pack: checked.pack }
      : change.kind === "add" || change.kind === "update"
        ? { kind: change.kind, items: change.items.map((item) => kept.get(item.id) ?? item), ...(delta ? { dictionaries: delta } : {}) }
        : change.kind === "edit"
          ? { kind: "edit", ...(change.name !== undefined ? { name: checked.pack.name } : {}), ...(change.about !== undefined ? { about: checked.pack.about ?? null } : {}), ...(delta ? { dictionaries: delta } : {}) }
          : change;
  const said = saying ?? describeChange(body, { name: checked.pack.name, was: now.pack?.name });
  if (dryRun) return { ok: true, changeId: "", seq: 0, packId: checked.pack.id, said, warnings, devices: [], items: checked.pack.items.length };
  const queued = await queue(env, userId, { packId: checked.pack.id, change: body, said, source, head: now.head });
  return { ok: true, changeId: queued.changeId, seq: queued.seq, packId: checked.pack.id, said, warnings, devices: queued.devices, items: checked.pack.items.length };
}

export interface CreateInput {
  name: string;
  about?: string;
  language: string;
  pack_id?: string;
  items?: unknown[];
  topics?: Record<string, unknown>;
  words?: Record<string, unknown>;
  readings?: Record<string, unknown>;
  chunks?: Record<string, unknown>;
  patterns?: Record<string, unknown>;
}

/** create_pack: a new pack of yours, checked whole. */
/**
 * A change from your AI with its own patterns made the pack's (pack-authoring.js ownPatternIds: a new one is
 * "<pack id>.<id>"), against the language's shared grammar as the library has it now.
 */
async function withOwnPatterns<C>(env: Env, language: string, change: C, pack: Pack | null): Promise<C> {
  await grammarReady(env, language);
  return ownPatternIds(change, pack, (LANGUAGES as Record<string, { patterns?: Record<string, unknown> }>)[language]?.patterns ?? {}) as C;
}

export async function createPack(env: Env, userId: string, source: string, input: CreateInput): Promise<Outcome> {
  if (!Object.hasOwn(LANGUAGES, input.language)) return { ok: false, errors: [{ at: "language", message: `language must be one of ${Object.keys(LANGUAGES).join(", ")}.` }], warnings: [] };
  if ((input.items?.length ?? 0) > PACK_RELAY.itemsPerChange) return { ok: false, errors: [{ at: "items", message: `Send up to ${PACK_RELAY.itemsPerChange} items at a time; add_items adds the rest.` }], warnings: [] };
  const taken = new Set([...(await publicIds(env))]);
  const yours = await env.DB.prepare("SELECT pack_id FROM pack_copies WHERE user_id = ? AND pack IS NOT NULL UNION SELECT pack_id FROM pack_changes WHERE user_id = ? AND kind = 'create' AND body IS NOT NULL").bind(userId, userId).all<{ pack_id: string }>();
  for (const row of yours.results) taken.add(row.pack_id);
  if (input.pack_id !== undefined) {
    if (!PACK_ID.test(input.pack_id)) return { ok: false, errors: [{ at: "pack_id", message: "pack_id must be 2 to 48 lowercase letters, digits and dashes." }], warnings: [] };
    if (taken.has(input.pack_id)) return { ok: false, errors: [{ at: "pack_id", message: `"${input.pack_id}" is taken (a pack of theirs, or a public one): leave pack_id out and one is made from the name.` }], warnings: [] };
  }
  const id = input.pack_id ?? packIdFor(input.name, taken);
  const { items, problems, warnings: noticed } = convertItems(input.items ?? [], input.language, new Set());
  const shell = { ...newPack({ id, name: input.name, about: input.about, language: input.language, from: "en" }), ...dictionariesOf(input as unknown as Record<string, unknown>), items } as Pack;
  const change = await withOwnPatterns(env, input.language, { kind: "create" as const, pack: shell }, null);
  return checkAndQueue(env, userId, source, { pack: null, head: await headOf(env, userId, id), pending: [], touched: { all: false, items: new Set(), entries: new Set() }, copy: null }, change, (n) => n, { conversion: problems, noticed });
}

async function existing(env: Env, userId: string, packId: string): Promise<PackNow & { pack: Pack }> {
  if (!PACK_ID.test(packId)) throw new LibraryError("pack_id must be one of their packs' ids (list_packs).");
  const now = await packNow(env, userId, packId);
  if (!now.pack) throw new LibraryError(`They have no pack "${packId}" (list_packs shows theirs; create_pack makes one).`);
  return now as PackNow & { pack: Pack };
}

/** add_items: sentences added at the end of a pack of yours. */
export async function addItems(env: Env, userId: string, source: string, input: ItemsInput, { dryRun = false } = {}): Promise<Outcome> {
  if (input.items.length > PACK_RELAY.itemsPerChange) return { ok: false, errors: [{ at: "items", message: `Send up to ${PACK_RELAY.itemsPerChange} items at a time.` }], warnings: [] };
  const now = await existing(env, userId, input.pack_id);
  const base = now.pack.items.length;
  const { items, problems, warnings: noticed } = convertItems(input.items, now.pack.language, new Set(now.pack.items.map((item) => item.id)));
  const change = await withOwnPatterns(env, now.pack.language, { kind: "add" as const, items, dictionaries: dictionariesOf(input as unknown as Record<string, unknown>) }, now.pack);
  return checkAndQueue(env, userId, source, now, change, (n) => (n >= base ? n - base : null), { dryRun, conversion: problems, noticed });
}

/** update_items: sentences of a pack of yours replaced whole, by id. */
export async function updateItems(env: Env, userId: string, source: string, input: ItemsInput, { dryRun = false } = {}): Promise<Outcome> {
  if (input.items.length > PACK_RELAY.itemsPerChange) return { ok: false, errors: [{ at: "items", message: `Send up to ${PACK_RELAY.itemsPerChange} items at a time.` }], warnings: [] };
  const now = await existing(env, userId, input.pack_id);
  const { items, problems, warnings: noticed } = convertItems(input.items, now.pack.language, new Set());
  input.items.forEach((raw, i) => {
    if (!isObject(raw) || typeof raw.id !== "string" || !raw.id) problems.push({ at: `items[${i}].id`, message: `items[${i}]: an update names the item it replaces by its id.` });
  });
  const order = new Map(items.map((item, i) => [item.id, i]));
  const ids = now.pack.items.map((item) => item.id);
  const change = await withOwnPatterns(env, now.pack.language, { kind: "update" as const, items, dictionaries: dictionariesOf(input as unknown as Record<string, unknown>) }, now.pack);
  return checkAndQueue(env, userId, source, now, change, (n) => order.get(ids[n] ?? "") ?? null, { dryRun, conversion: problems, noticed });
}

/**
 * check_items: items checked as an add (or, for an id the pack has, an update) would check them, or for a new pack as
 * create_pack would, with the topics, words, phrases and patterns given; nothing is kept.
 */
export async function checkItems(env: Env, userId: string, input: { pack_id?: string; language?: string; items: unknown[] } & Partial<Record<string, unknown>>) {
  const dictionaries = dictionariesOf(input) ?? {};
  if (input.pack_id) {
    const now = await existing(env, userId, input.pack_id);
    const ids = new Set(now.pack.items.map((item) => item.id));
    const updates = input.items.filter((item) => isObject(item) && typeof item.id === "string" && ids.has(item.id));
    const adds = input.items.filter((item) => !updates.includes(item));
    const results: Outcome[] = [];
    if (adds.length) results.push(await addItems(env, userId, "", { pack_id: input.pack_id, items: adds, ...dictionaries }, { dryRun: true }));
    if (updates.length) results.push(await updateItems(env, userId, "", { pack_id: input.pack_id, items: updates, ...dictionaries }, { dryRun: true }));
    const note = adds.length && updates.length ? "items[i] are counted separately among the new ones and among the ones it replaces (an id the pack has)." : undefined;
    return { ok: results.every((r) => r.ok), errors: results.flatMap((r) => (r.ok ? [] : r.errors)), warnings: results.flatMap((r) => r.warnings), new: adds.length, replacing: updates.length, ...(note ? { note } : {}) };
  }
  const language = asText(input.language);
  if (!Object.hasOwn(LANGUAGES, language)) throw new LibraryError("Give pack_id (a pack of theirs), or language for items of a new pack.");
  const { items, problems } = convertItems(input.items, language, new Set());
  const shell = (await withOwnPatterns(env, language, { kind: "create" as const, pack: { ...newPack({ id: "checking", name: "Checking", language, from: "en" }), ...dictionaries, items } as Pack }, null)).pack;
  const checked = checkPack(shell, { installed: [...(await defaultsFor(env, language)), ...(await copiesOf(env, userId, language))] });
  const errors = [...problems, ...withoutStandIns(checked.errors, problems)];
  return { ok: !errors.length, errors, warnings: checked.warnings, new: items.length, replacing: 0 };
}

/** remove_items: sentences taken out of a pack of yours, by id. */
export async function removeItems(env: Env, userId: string, source: string, input: { pack_id: string; ids: string[] }): Promise<Outcome> {
  const now = await existing(env, userId, input.pack_id);
  return checkAndQueue(env, userId, source, now, { kind: "remove", ids: input.ids }, () => null);
}

/** update_pack: a pack's name, its line, its topics, words, phrases and patterns (an id set to null is taken out). */
export async function editPack(env: Env, userId: string, source: string, input: { pack_id: string; name?: string; about?: string | null } & Partial<Record<string, unknown>>): Promise<Outcome> {
  const now = await existing(env, userId, input.pack_id);
  const change = await withOwnPatterns(env, now.pack.language, { kind: "edit" as const, ...(input.name !== undefined ? { name: input.name } : {}), ...(input.about !== undefined ? { about: input.about } : {}), dictionaries: dictionariesOf(input) }, now.pack);
  return checkAndQueue(env, userId, source, now, change, () => null);
}

/**
 * undo_pack_change (and Undo in the app): puts the pack back as it was before a change. Only a pack's latest change
 * that isn't undone can be, so undoing walks back one change at a time. from: the device it was pressed on.
 */
export async function undoChange(env: Env, userId: string, source: string, changeId: string): Promise<Outcome> {
  if (!CHANGE_ID.test(changeId)) throw new LibraryError("No change has that id (list_pack_changes lists them).");
  const change = await env.DB.prepare("SELECT seq, pack_id, kind, said FROM pack_changes WHERE id = ? AND user_id = ?").bind(changeId, userId).first<{ seq: number; pack_id: string; kind: string; said: string }>();
  if (!change) throw new LibraryError("No change has that id (list_pack_changes lists them).");
  if (change.kind === "undo" || change.kind === "delete") throw new LibraryError(change.kind === "undo" ? "That's an undo: make the change again instead." : "A pack deleted in the app can't be brought back from here.");
  // Read first: anything that lands after this stops the undo (the queue compares it), so the checks below hold.
  const head = await headOf(env, userId, change.pack_id);
  const undone = await env.DB.prepare("SELECT id FROM pack_changes WHERE user_id = ? AND undoes = ?").bind(userId, changeId).first<{ id: string }>();
  if (undone) throw new LibraryError(`That change is undone already (${undone.id}).`);
  const later = await env.DB.prepare(
    "SELECT id, said FROM pack_changes c WHERE user_id = ? AND pack_id = ? AND seq > ? AND kind NOT IN ('undo') AND NOT EXISTS (SELECT 1 FROM pack_changes u WHERE u.user_id = c.user_id AND u.undoes = c.id) ORDER BY seq DESC LIMIT 1",
  )
    .bind(userId, change.pack_id, change.seq)
    .first<{ id: string; said: string }>();
  if (later) throw new LibraryError(`A later change to this pack comes first: undo ${later.id} (${later.said}), then this one.`);
  const said = `undid a change: ${change.said}`;
  const queued = await queue(env, userId, { packId: change.pack_id, change: { kind: "undo", change: changeId }, said, source, undoes: changeId, head });
  return { ok: true, changeId: queued.changeId, seq: queued.seq, packId: change.pack_id, said, warnings: [], devices: queued.devices, items: 0 };
}

// ---------- from Explore: corrections accepted into a pack its author shared ----------

export type OwnerOutcome =
  | { ok: true; changeId: string; said: string; devices: string[]; items: number }
  | { ok: false; reason: "no_copy" | "nothing" | "busy" | "refused"; errors: Problem[]; warnings: Problem[] };

/**
 * Corrections an author accepted in Explore, reaching the author's own pack (the one they shared it from) through the
 * relay, as your AI's changes do: the same checks against the account's copy with what's on its way applied, a toast
 * on each device ("Explore changed 2 sentences in Travel") with Undo, and the pack's history. revise gets that pack (a
 * copy to change) and returns it with the corrections applied, or null when none applies; only what it changed is
 * sent (each item it changed, whole, and the dictionary entries), so the author's own edits elsewhere stay. It may
 * change items and the dictionaries, never add or take out an item. no_copy: the server has no copy of the pack yet
 * (none of their devices has sent it), so tell the author instead; nothing: their pack already says it; busy: a change
 * still on its way to their devices touches one of the same sentences or entries (it may yet be refused or expire, so
 * nothing of it may ride along), so tell the author instead, as for no_copy. What's sent is checked first (as checkPack
 * gives it back), so their devices end with exactly what was checked here.
 */
export async function queueOwnerChange(env: Env, ownerId: string, input: { packId: string; revise: (pack: Pack) => Pack | null; label?: string; said?: string }): Promise<OwnerOutcome> {
  const refused = (message: string, at = "pack"): OwnerOutcome => ({ ok: false, reason: "refused", errors: [{ at, message }], warnings: [] });
  if (!PACK_ID.test(input.packId)) return refused("packId must be a pack's id.", "packId");
  let now: PackNow;
  try {
    now = await packNow(env, ownerId, input.packId);
  } catch (error) {
    if (error instanceof LibraryError) return refused(error.message);
    throw error;
  }
  if (!now.pack) return { ok: false, reason: "no_copy", errors: [{ at: "pack", message: "The server has no copy of this pack yet: none of the author's devices has sent it." }], warnings: [] };
  const current = now.pack;
  let next: Pack | null;
  try {
    next = input.revise(structuredClone(current));
  } catch (error) {
    return refused(`The corrections couldn't be applied to the author's pack: ${error instanceof Error ? error.message : "an error"}`);
  }
  if (!next) return { ok: false, reason: "nothing", errors: [], warnings: [] };
  if (!isObject(next) || !Array.isArray(next.items)) return refused("revise must give back the pack.");
  if (!Object.hasOwn(LANGUAGES, current.language)) return refused("The pack's language isn't one Lexicommons knows.");
  // Only items' pieces and the dictionaries may change: the rest of the pack stays the author's.
  for (const key of Object.keys({ ...current, ...next }) as (keyof Pack)[]) {
    if (key === "items" || (DICTIONARY_KEYS as readonly string[]).includes(key)) continue;
    if (canonical(current[key]) !== canonical(next[key])) return refused(`Corrections change items and the pack's words, topics, phrases and patterns, never its ${key}.`, key);
  }
  const before = new Map(current.items.map((item) => [item.id, item]));
  const ids = next.items.map((item) => (isObject(item) && typeof item.id === "string" ? item.id : ""));
  if (ids.length !== before.size || new Set(ids).size !== ids.length || ids.some((id) => !before.has(id))) return refused("Corrections never add or take out a sentence: the pack's items must stay the same ones.", "items");
  // Busy first, from what revise itself changed (before any check: checking both sides could fold a correction into a
  // change still on its way and call it nothing): a change on its way to one of the same sentences or entries may yet be
  // refused or expire, so nothing of it may ride along.
  const changedItems = next.items.filter((item) => canonical(item) !== canonical(before.get(item.id))).map((item) => item.id);
  const changedEntries = Object.entries(dictionaryDelta(current, next) ?? {}).flatMap(([section, entries]) => Object.keys(entries ?? {}).map((id) => [section, LEMMA_KEYED.has(section) ? cleanText(id) : id] as const));
  const overlap = [
    ...changedItems.filter((id) => now.touched.all || now.touched.items.has(id)).map((id) => `the sentence ${id}`),
    ...changedEntries.filter(([section, id]) => now.touched.all || now.touched.entries.has(`${section}:${id}`)).map(([section, id]) => `${section}: ${id}`),
  ];
  if (overlap.length) return { ok: false, reason: "busy", errors: [{ at: "pack", message: `A change to ${overlap.slice(0, 3).join(", ")} is still on its way to the author's devices; try again once it has arrived.` }], warnings: [] };
  // Both checked as a device would keep them, so what's compared (and sent) is what the check gives back, and only the
  // corrections count as changes (not a tidying the check does to the pack as it will be).
  const installed = [...(await defaultsFor(env, current.language)), ...(await copiesOf(env, ownerId, current.language, current.id))];
  const checked = checkPack(next, { installed });
  if (!checked.pack) return { ok: false, reason: "refused", errors: checked.errors, warnings: checked.warnings };
  next = checked.pack;
  const base = checkPack(current, { installed }).pack ?? current;
  for (const item of base.items) before.set(item.id, item);
  const items = next.items.filter((item) => canonical(item) !== canonical(before.get(item.id)));
  const dictionaries = dictionaryDelta(base, next) ?? {};
  const hasDictionaries = Object.keys(dictionaries).length > 0;
  if (!items.length && !hasDictionaries) return { ok: false, reason: "nothing", errors: [], warnings: [] };
  const change: Change = items.length ? { kind: "update", items, ...(hasDictionaries ? { dictionaries } : {}) } : { kind: "edit", dictionaries };
  const order = new Map(items.map((item, i) => [item.id, i]));
  const at = current.items.map((item) => item.id);
  const source = `explore:${text(input.label, 60) || "corrections"}`;
  try {
    const outcome = await checkAndQueue(env, ownerId, source, now, change, (n) => order.get(at[n] ?? "") ?? null, { saying: text(input.said, 200) || undefined });
    return outcome.ok ? { ok: true, changeId: outcome.changeId, said: outcome.said, devices: outcome.devices, items: items.length } : { ok: false, reason: "refused", errors: outcome.errors, warnings: outcome.warnings };
  } catch (error) {
    if (error instanceof LibraryError) return refused(error.message);
    throw error;
  }
}

// ---------- what your AI reads ----------

const isoOf = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);

/** list_packs: every pack on each device of yours (yours, Lexicommons' own and the ones you follow), and the copies kept here. */
export async function listPacks(env: Env, userId: string) {
  const now = Date.now();
  await tidy(env, userId, now);
  const since = now - PACK_RELAY.deviceGone;
  const [devices, copies, waiting] = await Promise.all([
    env.DB.prepare("SELECT device_id, label, packs, added_at, seen_at FROM pack_devices WHERE user_id = ? AND seen_at >= ? ORDER BY seen_at DESC").bind(userId, since).all<{ device_id: string; label: string; packs: string; added_at: number; seen_at: number }>(),
    env.DB.prepare("SELECT pack_id, language, pack, updated_at FROM pack_copies WHERE user_id = ? AND pack IS NOT NULL ORDER BY updated_at DESC").bind(userId).all<{ pack_id: string; language: string; pack: string; updated_at: number }>(),
    env.DB.prepare("SELECT pack_id, said FROM pack_changes WHERE user_id = ? AND body IS NOT NULL AND expires_at > ? ORDER BY seq").bind(userId, now).all<{ pack_id: string; said: string }>(),
  ]);
  const deviceList = devices.results.map((d) => ({ device: d.label, lastOpened: isoOf(d.seen_at), packs: json<DevicePack[]>(d.packs, []) }));
  const yours = copies.results.map((c) => {
    const pack = JSON.parse(c.pack) as Pack;
    const on = deviceList.map((d) => ({ device: d.device, has: d.packs.find((p) => p.id === c.pack_id) })).filter((d) => d.has);
    return {
      pack_id: c.pack_id,
      name: pack.name,
      ...(pack.about ? { about: pack.about } : {}),
      language: c.language,
      sentences: sentencesOf(pack).length,
      ...(plainItems(pack).length ? { cards: plainItems(pack).length } : {}),
      topics: Object.keys(pack.topics),
      updated: isoOf(c.updated_at),
      onDevices: on.map((d) => ({ device: d.device, studying: d.has!.on })),
    };
  });
  const theirs = new Map<string, { id: string; name: string; language: string; kind: string; items: number }>();
  for (const d of deviceList) for (const p of d.packs) if (p.kind !== "yours") theirs.set(p.id, { id: p.id, name: p.name, language: p.language, kind: p.kind === "default" ? "Lexicommons'" : "followed", items: p.items });
  return {
    yours,
    public: [...theirs.values()],
    devices: deviceList.map((d) => ({ device: d.device, lastOpened: d.lastOpened, packs: d.packs.length })),
    onTheirWay: waiting.results.map((w) => ({ pack_id: w.pack_id, change: w.said })),
  };
}

/** get_pack: a pack of yours in the form your AI writes, as it will be once the changes on their way arrive. */
export async function getPack(env: Env, userId: string, packId: string, { offset = 0, limit = 100 } = {}) {
  const now = await existing(env, userId, packId);
  const sentences = sentencesOf(now.pack) as Item[];
  const items = sentences.slice(offset, offset + limit).map((item) => authoringItem(item, now.pack.language));
  return {
    pack_id: now.pack.id,
    name: now.pack.name,
    ...(now.pack.about ? { about: now.pack.about } : {}),
    language: now.pack.language,
    from: now.pack.from,
    topics: now.pack.topics,
    words: now.pack.words,
    chunks: now.pack.chunks,
    patterns: now.pack.patterns,
    sentences: sentences.length,
    // A pack's plain cards (from an imported deck) aren't sentences in your form, and every change leaves them as they are.
    ...(plainItems(now.pack).length ? { cards: plainItems(now.pack).length } : {}),
    items,
    ...(offset + limit < sentences.length ? { more: `items ${offset}–${offset + items.length - 1} of ${sentences.length}: pass offset ${offset + limit} for the next` } : {}),
    copy: now.copy ? { from: now.copy.device, at: isoOf(now.copy.at) } : "not on a device yet: made by changes still on their way",
    ...(now.pending.length ? { includesOnTheirWay: now.pending } : {}),
    recordings: recordingsOf(await audioNow(env, userId, now)),
  };
}

// ---------- your AI's recordings for a pack of yours ----------
//
// Your AI records a pack's sentences and words (with whatever voice tool it has), uploads each clip
// (request_pack_audio_upload: purpose pack-audio:<format>), then set_pack_audio says which is which. Each clip's bytes
// are checked (audio-bytes.ts) and it's named by them (pack-audio.js clipName). What it sets is merged into the pack's
// recordings as they will be (mergeAudio), checked against the pack as it will be (checkAudio; license and credit
// optional, they're yours alone), and goes to your devices as a change of kind "audio" carrying only what it set, as
// every pack change does. The clips it uploaded are that change's files (pack-audio-in:<change>): served to your
// devices only while it's on its way, then gone with its content (every device reported, or 7 days). Their home is
// your devices and your own storage, never this server. pack_audio keeps the manifest a device's copy last had, up to
// the change it went up to (putCopy); the recordings as they will be are that, with what's on its way after it.

const CLIP_NAME = /^[0-9a-f]{16}\.(?:mp3|m4a)$/;
const UPLOAD_ID = /^[A-Za-z0-9_-]{8,40}$/;
const HOUR = 3_600_000;
const PACK_AUDIO_PURPOSES = Object.keys(PACK_AUDIO_UPLOADS).map((format) => `pack-audio:${format}`);
const claimedAt = (purpose: string) => Number(purpose.split(":")[1]);
const inTransitMessage = () =>
  `That's more recordings on their way to their devices at once than an account keeps (${Math.round(PACK_RELAY.audioInTransit / 1048576)} MB): ask them to open Lexicommons on each device, then go on.`;

/** A pack's recordings as they will be: the latest copy's, with the changes on their way after it (null for none). */
async function audioNow(env: Env, userId: string, now: PackNow): Promise<Manifest | null> {
  if (!now.pack) return null;
  const [row, copy] = await Promise.all([
    env.DB.prepare("SELECT manifest, through FROM pack_audio WHERE user_id = ? AND pack_id = ?").bind(userId, now.pack.id).first<{ manifest: string; through: number }>(),
    env.DB.prepare("SELECT pack, through FROM pack_copies WHERE user_id = ? AND pack_id = ?").bind(userId, now.pack.id).first<{ pack: string | null; through: number }>(),
  ]);
  // No recordings kept: the copy had none (or came from an older app), so from there.
  const start = row ? row.through : (copy?.through ?? 0);
  const changes = await env.DB.prepare(
    `SELECT c.body FROM pack_changes c WHERE c.user_id = ? AND c.pack_id = ? AND c.seq > ? AND c.body IS NOT NULL AND c.expires_at > ?
     AND (EXISTS (SELECT 1 FROM pack_deliveries d WHERE d.change_seq = c.seq AND d.state IN ('waiting', 'applied'))
          OR NOT EXISTS (SELECT 1 FROM pack_deliveries d WHERE d.change_seq = c.seq))
     ORDER BY c.seq`,
  )
    .bind(userId, now.pack.id, start, Date.now())
    .all<{ body: string }>();
  // Each sentence's words as the recordings read them, as the device keeps them (packs.js sameItems): known from the
  // copy they start at; where they aren't, any change to a sentence takes its recordings.
  const read = new Map<string, string>();
  if (copy?.pack && copy.through === start) for (const item of (upgradePack(JSON.parse(copy.pack)) as Pack).items) read.set(item.id, JSON.stringify(item.words));
  let audio: Manifest | null = row ? (JSON.parse(row.manifest) as Manifest) : null;
  for (const { body } of changes.results) {
    const change = upgradeChange(JSON.parse(body)) as Change;
    if (change.kind === "audio") audio = mergeAudio(audio, change, now.pack);
    else if (change.kind === "create" || change.kind === "delete") {
      audio = null;
      read.clear();
      if (change.kind === "create") for (const item of change.pack.items) read.set(item.id, JSON.stringify(item.words));
    } else if (change.kind === "add" || change.kind === "update") {
      // A sentence whose words changed loses its recordings (they read the words it had).
      audio = withoutItems(audio, change.items.filter((item) => read.get(item.id) !== JSON.stringify(item.words)).map((item) => item.id));
      for (const item of change.items) read.set(item.id, JSON.stringify(item.words));
    } else if (change.kind === "remove") {
      audio = withoutItems(audio, change.ids);
      for (const id of change.ids) read.delete(id);
    }
  }
  return audio && fitAudio(audio, now.pack);
}

/** A pack's recordings as get_pack says them: [{ voice, name, sentences, words }], or none. */
const recordingsOf = (audio: Manifest | null) =>
  Object.entries(audio?.voices ?? {}).map(([voice, v]) => ({ voice, name: v.name ?? voice, sentences: Object.keys(v.items ?? {}).length, words: Object.keys(v.words ?? {}).length }));

/** request_pack_audio_upload: a signed link for one recording of a pack of yours. */
export async function requestPackAudioUpload(env: Env, userId: string, source: string, input: { pack_id: string; format: string; filename: string }) {
  await existing(env, userId, input.pack_id);
  const upload = PACK_AUDIO_UPLOADS[input.format];
  if (!upload) throw new LibraryError("format must be mp3 or m4a.");
  return requestUpload(env, userId, { filename: input.filename, contentType: upload.type, purpose: `pack-audio:${input.format}` }, source);
}

type Claimed = { uploadId: string; purpose: string; clip: string; size: number };

/** Claims an arrived recording of the account's for a set_pack_audio (so it can't go into two at once, or be tidied). */
async function claimRecording(env: Env, userId: string, id: unknown, claim: string): Promise<Claimed> {
  const uploadId = asText(id);
  if (!UPLOAD_ID.test(uploadId)) throw new LibraryError("upload_id must be an id request_pack_audio_upload gave.");
  const row = await env.DB.prepare("SELECT status, purpose, content_type, r2_key FROM uploads WHERE id = ? AND user_id = ?")
    .bind(uploadId, userId)
    .first<{ status: string; purpose: string | null; content_type: string; r2_key: string | null }>();
  if (!row?.purpose || !PACK_AUDIO_PURPOSES.includes(row.purpose)) throw new LibraryError(`No recording ${uploadId} waiting: ask for a link with request_pack_audio_upload (each recording goes into one set_pack_audio, within a day).`);
  if (row.status !== "stored" || !row.r2_key) throw new LibraryError(`Recording ${uploadId} hasn't arrived yet: send it to its link first (PUT, its curl command).`);
  const object = await env.UPLOADS.get(row.r2_key);
  if (!object) throw new LibraryError(`Recording ${uploadId}'s file is gone: upload it again.`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (!soundsRight(row.content_type, bytes)) throw new LibraryError(`Recording ${uploadId} isn't ${row.content_type === "audio/mp4" ? "an MP4's audio" : "an MP3"}: upload the audio itself.`);
  const claimed = await env.DB.prepare("UPDATE uploads SET purpose = ? WHERE id = ? AND user_id = ? AND purpose = ? AND status = 'stored'").bind(claim, uploadId, userId, row.purpose).run();
  if (!claimed.meta.changes) throw new LibraryError(`Recording ${uploadId} went into another set_pack_audio just now (or waited past its day and went).`);
  return { uploadId, purpose: row.purpose, clip: clipName(await sha256Hex(bytes), row.content_type), size: bytes.byteLength };
}

const VOICE_DETAILS = ["name", "about", "locale", "license", "credit"] as const;

/**
 * set_pack_audio: recordings for a pack of yours, merged into what it has: { pack_id, voices: { slug: { name, locale,
 * about?, license?, credit?, items?: { item id: { upload_id, seconds, words } | null }, words?: { lemma: { upload_id,
 * seconds } | null } } | null } }. Every problem is said at once; nothing is kept unless it all passes.
 */
export async function setPackAudio(env: Env, userId: string, source: string, input: { pack_id: string; voices: unknown }) {
  const now = await existing(env, userId, input.pack_id);
  if (!isObject(input.voices) || !Object.keys(input.voices).length) throw new LibraryError("voices must name at least one voice: { slug: { name, locale, items, words } }, or a slug set to null to take that voice away.");
  const uploads = Object.values(input.voices).flatMap((v) => (isObject(v) ? [...Object.values(isObject(v.items) ? v.items : {}), ...Object.values(isObject(v.words) ? v.words : {})] : [])).filter((e) => e !== null);
  const ids = new Set(uploads.map((e) => (isObject(e) ? asText(e.upload_id) : "")));
  if (ids.size > PACK_RELAY.clipsPerChange) throw new LibraryError(`That's ${ids.size} recordings; send up to ${PACK_RELAY.clipsPerChange} at a time (each set_pack_audio adds to what's there).`);
  const claim = `pack-audio-claim:${Date.now()}:${randomId(8)}`;
  const claimed = new Map<string, Claimed>();
  try {
    const clipOf = async (raw: unknown) => {
      const id = isObject(raw) ? asText(raw.upload_id) : "";
      if (!claimed.has(id)) claimed.set(id, await claimRecording(env, userId, id, claim));
      return claimed.get(id)!.clip;
    };
    // What this change sets, with each recording's name in place of its upload.
    const voices: Record<string, unknown> = {};
    for (const [slug, raw] of Object.entries(input.voices)) {
      if (raw === null) {
        voices[slug] = null;
        continue;
      }
      if (!isObject(raw)) throw new LibraryError(`voices.${slug.slice(0, 40)} must be { name, locale, items, words }, or null to take it away.`);
      const entries = async (part: unknown, timed: boolean) => {
        const out: Record<string, unknown> = {};
        for (const [id, entry] of Object.entries(isObject(part) ? part : {})) {
          out[id] = entry === null ? null : { clip: await clipOf(entry), seconds: isObject(entry) ? entry.seconds : undefined, ...(timed ? { words: isObject(entry) ? entry.words : undefined } : {}) };
        }
        return out;
      };
      const voice: Record<string, unknown> = {};
      for (const key of VOICE_DETAILS) if (Object.hasOwn(raw, key)) voice[key] = raw[key];
      voices[slug] = { ...voice, items: await entries(raw.items, true), words: await entries(raw.words, false) };
    }
    const change = { kind: "audio" as const, voices, clips: [...new Set([...claimed.values()].map((c) => c.clip))] };
    const base = await audioNow(env, userId, now);
    const merged = mergeAudio(base, change, now.pack);
    if (!merged && claimed.size) throw new LibraryError("That leaves no recordings: to take them all away, use remove_pack_audio.");
    if (!merged && !base) throw new LibraryError(`${now.pack.name} has no recordings to change.`);
    const checked = merged ? checkAudio(merged, now.pack) : { audio: null, errors: [], warnings: [] };
    if (merged && !checked.audio) throw new LibraryError(`The recordings don't fit the pack: ${checked.errors.slice(0, 5).map((e) => e.message).join(" ")}`);
    if (checked.audio && JSON.stringify(checked.audio).length > PACK_RELAY.audioManifest) {
      throw new LibraryError(`That's more recordings than a pack of yours keeps (${PACK_RELAY.audioManifest / 1_000_000} MB of manifest): take a voice away first.`);
    }
    // One upload per clip (the same bytes twice are one clip); the rest go once it's queued.
    const byClip = new Map<string, Claimed>();
    for (const c of claimed.values()) if (!byClip.has(c.clip)) byClip.set(c.clip, c);
    const extra = [...claimed.values()].filter((c) => byClip.get(c.clip) !== c);
    const bytes = [...byClip.values()].reduce((sum, c) => sum + c.size, 0);
    const said = describeRecording(voices, now.pack.name, Boolean(checked.audio));
    const queued = await queue(env, userId, {
      packId: now.pack.id,
      change,
      said,
      source,
      head: now.head,
      files: [...byClip.values()].map((c) => ({ uploadId: c.uploadId, name: c.clip })),
      claim: { purpose: claim, count: claimed.size, bytes },
    });
    for (const c of extra) await dropUploads(env, userId, "id", c.uploadId).catch(() => {});
    return { change_id: queued.changeId, said, devices: queued.devices, clips: byClip.size, recordings: recordingsOf(checked.audio), warnings: checked.warnings.slice(0, 20) };
  } catch (error) {
    // Nothing kept: each recording goes back to waiting for a set_pack_audio.
    for (const c of claimed.values()) {
      await env.DB.prepare("UPDATE uploads SET purpose = ? WHERE id = ? AND user_id = ? AND purpose = ?").bind(c.purpose, c.uploadId, userId, claim).run().catch(() => {});
    }
    throw error;
  }
}

/** The line a set_pack_audio is listed and shown on your devices by: "recorded 3 sentences and 5 words of Travel". */
function describeRecording(voices: Record<string, unknown>, name: string, left: boolean) {
  if (!left) return `took the recordings away from ${name}`;
  const count = (part: "items" | "words") =>
    new Set(Object.values(voices).flatMap((v) => (isObject(v) && isObject(v[part]) ? Object.entries(v[part] as object).filter(([, e]) => e !== null).map(([id]) => id) : []))).size;
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const parts = [count("items") && plural(count("items"), "sentence"), count("words") && plural(count("words"), "word")].filter(Boolean);
  return parts.length ? `recorded ${parts.join(" and ")} of ${name}` : `changed the recordings of ${name}`;
}

/** remove_pack_audio: a pack of yours's recordings taken away, on every device of yours. */
export async function removePackAudio(env: Env, userId: string, source: string, input: { pack_id: string }) {
  const now = await existing(env, userId, input.pack_id);
  if (!(await audioNow(env, userId, now))) throw new LibraryError(`${now.pack.name} has no recordings to take away.`);
  const said = `took the recordings away from ${now.pack.name}`;
  const queued = await queue(env, userId, { packId: now.pack.id, change: { kind: "audio", voices: null, clips: [] }, said, source, head: now.head });
  return { change_id: queued.changeId, said, devices: queued.devices };
}

/** A recording an audio change carries, to the account's own devices, while the change is on its way. */
export async function serveChangeClip(env: Env, userId: string, changeId: string, clip: string): Promise<Response> {
  if (!CHANGE_ID.test(changeId) || !CLIP_NAME.test(clip)) return new Response("Not found", { status: 404 });
  const row = await env.DB.prepare(
    `SELECT u.id, u.content_type FROM uploads u JOIN pack_changes c ON c.user_id = u.user_id AND u.purpose = 'pack-audio-in:' || c.id
     WHERE u.user_id = ? AND c.id = ? AND c.body IS NOT NULL AND c.expires_at > ? AND u.filename = ? AND u.status = 'stored'`,
  )
    .bind(userId, changeId, Date.now(), clip)
    .first<{ id: string; content_type: string }>();
  if (!row) return new Response("Not found", { status: 404 });
  const object = await env.UPLOADS.get(uploadKey(userId, row.id));
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { ...fileSafetyHeaders(row.content_type), "Content-Type": row.content_type, "Cache-Control": "private, no-store" } });
}

/** list_pack_changes: recent changes, newest first, each with how every device took it. */
export async function listChanges(env: Env, userId: string, { packId, limit = 20 }: { packId?: string; limit?: number } = {}) {
  const now = Date.now();
  await tidy(env, userId, now);
  const rows = await env.DB.prepare(
    `SELECT seq, id, pack_id, kind, said, source, undoes, created_at, expires_at, body IS NOT NULL AS live FROM pack_changes
     WHERE user_id = ? AND (? = '' OR pack_id = ?) ORDER BY seq DESC LIMIT ?`,
  )
    .bind(userId, packId ?? "", packId ?? "", Math.max(1, Math.min(limit, 100)))
    .all<{ seq: number; id: string; pack_id: string; kind: string; said: string; source: string; undoes: string | null; created_at: number; expires_at: number; live: number }>();
  const seqs = rows.results.map((r) => r.seq);
  const deliveries = seqs.length
    ? await env.DB.prepare(`SELECT d.change_seq, d.state, d.result, d.settled_at, p.label FROM pack_deliveries d LEFT JOIN pack_devices p ON p.user_id = d.user_id AND p.device_id = d.device_id WHERE d.user_id = ? AND d.change_seq IN (${seqs.map(() => "?").join(",")})`)
        .bind(userId, ...seqs)
        .all<{ change_seq: number; state: string; result: string | null; settled_at: number | null; label: string | null }>()
    : { results: [] };
  const undoneBy = new Map(rows.results.filter((r) => r.undoes).map((r) => [r.undoes!, r.id]));
  return rows.results.map((r) => {
    const on = deliveries.results.filter((d) => d.change_seq === r.seq);
    const state = undoneBy.has(r.id)
      ? "undone"
      : on.some((d) => d.state === "applied")
        ? "applied"
        : on.some((d) => d.state === "waiting") && r.expires_at > now
          ? "on its way"
          : on.some((d) => d.state === "refused")
            ? "refused"
            : on.some((d) => d.state === "missing")
              ? "missing"
              : on.length
                ? "expired"
                : "no device yet";
    return {
      change_id: r.id,
      pack_id: r.pack_id,
      kind: r.kind,
      said: r.said,
      by: r.source,
      at: isoOf(r.created_at),
      state,
      ...(r.undoes ? { undoes: r.undoes } : {}),
      ...(undoneBy.has(r.id) ? { undoneBy: undoneBy.get(r.id) } : {}),
      devices: on.map((d) => ({ device: d.label ?? "a device no longer listed", state: d.state === "waiting" && r.expires_at <= now ? "expired" : d.state, ...(d.result ? json<object>(d.result, {}) : {}), ...(d.settled_at ? { at: isoOf(d.settled_at) } : {}) })),
    };
  });
}

/** Everything the account holds for your packs, for the account export. */
export async function exportPacks(env: Env, userId: string) {
  const [devices, copies, changes, audio] = await Promise.all([
    env.DB.prepare("SELECT label, packs, texts, added_at, seen_at FROM pack_devices WHERE user_id = ? ORDER BY added_at").bind(userId).all<{ label: string; packs: string; texts: string | null; added_at: number; seen_at: number }>(),
    env.DB.prepare("SELECT pack, through, updated_at FROM pack_copies WHERE user_id = ? AND pack IS NOT NULL ORDER BY pack_id").bind(userId).all<{ pack: string; through: number; updated_at: number }>(),
    env.DB.prepare("SELECT id, pack_id, kind, body, said, source, undoes, created_at, expires_at FROM pack_changes WHERE user_id = ? ORDER BY seq").bind(userId).all<{ id: string; pack_id: string; kind: string; body: string | null; said: string; source: string; undoes: string | null; created_at: number; expires_at: number }>(),
    env.DB.prepare("SELECT pack_id, manifest FROM pack_audio WHERE user_id = ?").bind(userId).all<{ pack_id: string; manifest: string }>(),
  ]);
  const recordings = new Map(audio.results.map((a) => [a.pack_id, JSON.parse(a.manifest) as unknown]));
  return {
    devices: devices.results.map((d) => ({ label: d.label, packs: json<unknown[]>(d.packs, []), texts: json<unknown[]>(d.texts ?? "[]", []), addedAt: d.added_at, lastOpened: d.seen_at })),
    copies: copies.results.map((c) => {
      const pack = JSON.parse(c.pack) as { id: string };
      return { pack, ...(recordings.has(pack.id) ? { recordings: recordings.get(pack.id) } : {}), updatedAt: c.updated_at };
    }),
    changes: changes.results.map((c) => ({ id: c.id, packId: c.pack_id, kind: c.kind, said: c.said, by: c.source, undoes: c.undoes, createdAt: c.created_at, ...(c.body ? { onItsWay: JSON.parse(c.body) as unknown } : {}) })),
  };
}

/** The tables deleteAccount empties for an account (deliveries before the changes they point to). */
export const PACK_TABLES = ["pack_deliveries", "pack_changes", "pack_copies", "pack_devices", "pack_audio"];
