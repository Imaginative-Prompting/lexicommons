// Texts your AI adds to your reading library (MCP: src/mcp-texts.ts; the device's side: public/js/read/text-inbox.js).
// A text you add yourself stays on the device you added it on; one your AI adds goes through this relay to every device
// of yours, as packs do (src/packs.ts), and so do removing one of those in the app and Undo.
// - Your AI uploads the text by a signed link (library.ts requestUpload, purpose text:<format>): plain text, a
//   lexicommons-book, or an EPUB; a cover as SVG. add_text checks it: plain text becomes a book here (import-text.js),
//   a book is checked (book-format.js validateBook), an EPUB is checked as one (its zip signature and mimetype entry)
//   and made into a book on each device (bookFromEpub), a cover is cleaned (cover-svg.js). Each device checks it again.
// - A change's files are uploads marked text-in:<change id>: served to the account's own devices only, as downloads
//   that can never run, and deleted with the change's body once every device has reported (or after 7 days).
// - Covers are personal: they stay on your devices; nothing shared carries one.
// - Weaving a text of yours with your AI (a request of kind "weave", public/js/ai/requests.js): the device sends its copy of
//   the text, kept only for that request (an upload marked weave-in:<book>, then weave-for:<request>), and deleted the
//   moment the request is done, couldn't be done or canceled; your AI reads it (get_text with the request), weaves it by
//   the rules the books pipeline's judges accept (weave-rules.generated.ts), and add_weave checks the layer and relays it
//   here as a change of kind "weave", which each device keeps beside its own copy of the text.

import type { Env } from "./env";
import { LibraryError, TEXT_UPLOADS, UPLOADS_PER_USER_MAX, uploadKey } from "./library";
import { randomId, sha256Hex } from "./util";
import { LANGUAGES } from "../public/js/lang/index.js";
import { validateBook, validateWeave } from "../public/js/read/book-format.js";
import { isAnswerForm, weaveFromAnswer } from "./weave-answer";
import { grammarReady } from "./grammar";
import { WEAVE_LANGUAGES } from "../public/js/read/weave-languages.generated.js";
import { splitForms } from "./split-forms.generated";
import { WEAVE_SPLIT } from "./weave-rules.generated";
import { checkCoverFile as checkCoverFileLeaf, checkTextFile as checkTextFileLeaf, TextProblem } from "./text-files";

export const TEXT_RELAY = {
  keep: 7 * 86_400_000, // a change waits this long for every device
  staging: 86_400_000, // an upload for a text that add_text never used goes after a day
  history: 90 * 86_400_000, // what get_text can still show
  waiting: 30, // changes on their way at once, per account
  deviceGone: 30 * 86_400_000, // as the pack relay's: a device not seen this long gets nothing new
  inbox: 10, // changes one poll hands a device
  texts: 500, // texts a device reports
  title: 200,
};

// The file checks (src/text-files.ts, a leaf the tests run in Node) say what's wrong as a TextProblem: here, a
// LibraryError (a refusal in words for your AI).
async function words<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TextProblem) throw new LibraryError(error.message);
    throw error;
  }
}
const checkTextFile = (...args: Parameters<typeof checkTextFileLeaf>) => words(() => checkTextFileLeaf(...args));
const checkCoverFile = (bytes: Uint8Array) => words(() => checkCoverFileLeaf(bytes));

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const asText = (value: unknown) => (value !== null && typeof value === "object" ? "" : String(value ?? ""));
const text = (value: unknown, max: number) => asText(value).replace(/\s+/g, " ").trim().slice(0, max);
const CHANGE_ID = /^txc_[A-Za-z0-9_-]{8,40}$/;
const TEXT_ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const UPLOAD_ID = /^[A-Za-z0-9_-]{8,40}$/;
const newTextId = () => `ai-${[...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;

/** What a change carries (text_changes.body). */
export interface TextBody {
  title: string;
  language?: string;
  format?: "book" | "epub"; // the file: a checked lexicommons-book, or an EPUB each device makes into one
  bytes?: number;
  words?: number; // a book's, when the server made or checked it
  cover?: { file: string }; // the cleaned cover's file name (its upload is the change's other file)
  retitle?: boolean; // an EPUB's: title is the one your AI gave, and replaces the EPUB's own (else the EPUB's stays)
  authors?: string[]; // as your AI gave them (an EPUB's own are replaced by these, when given)
  change?: string; // an undo: the change it undoes
  undoes?: "add" | "remove";
  to?: string; // a weave: the language it's woven into
  bookVersion?: string; // a weave: the version of the text it was woven from
  request?: string; // a weave: the request it answers
}

// ---------- the files ----------

const contentOf = (format: string) => (format === "epub" ? TEXT_UPLOADS.epub!.type : TEXT_UPLOADS.book!.type);

/**
 * Claims an arrived upload of the account's for a change: one write that succeeds only while it's still waiting for a
 * text (so the same upload can't go into two texts at once). Returns its row and bytes; release() puts it back.
 */
async function claimUpload(env: Env, userId: string, id: unknown, purposes: string[], claim: string) {
  const uploadId = asText(id);
  if (!UPLOAD_ID.test(uploadId)) throw new LibraryError("upload_id must be the id request_text_upload gave.");
  const row = await env.DB.prepare("SELECT id, status, purpose, content_type, size, r2_key FROM uploads WHERE id = ? AND user_id = ?")
    .bind(uploadId, userId)
    .first<{ id: string; status: string; purpose: string | null; content_type: string; size: number | null; r2_key: string | null }>();
  if (!row || !row.purpose || !purposes.includes(row.purpose)) throw new LibraryError(`No upload ${uploadId} waiting for a text: ask for one with request_text_upload (each upload goes into one text).`);
  if (row.status !== "stored" || !row.r2_key) throw new LibraryError(`Upload ${uploadId} hasn't arrived yet: send the file to its link first (PUT, its curl command), then add_text.`);
  const claimed = await env.DB.prepare("UPDATE uploads SET purpose = ? WHERE id = ? AND user_id = ? AND purpose = ? AND status = 'stored'").bind(claim, uploadId, userId, row.purpose).run();
  if (!claimed.meta.changes) throw new LibraryError(`Upload ${uploadId} is going into another text right now.`);
  const release = () => env.DB.prepare("UPDATE uploads SET purpose = ? WHERE id = ? AND user_id = ? AND purpose = ?").bind(row.purpose, uploadId, userId, claim).run();
  const object = await env.UPLOADS.get(row.r2_key);
  if (!object) {
    await release();
    throw new LibraryError(`Upload ${uploadId}'s file is gone: upload it again.`);
  }
  return { row, bytes: new Uint8Array(await object.arrayBuffer()), release };
}

/** Stores a file the server made as an upload of the account's, marked for the change (created only if absent). */
const storeMade = (env: Env, userId: string, changeId: string, filename: string, contentType: string, bytes: Uint8Array) =>
  storeFile(env, userId, `text-in:${changeId}`, filename, contentType, bytes);

/**
 * Stores a file as an upload of the account's with this purpose. counted: one the person sent, which takes one of the
 * account's uploads (counted in the write itself, as requestUpload counts them), refused past the limit.
 */
async function storeFile(env: Env, userId: string, purpose: string, filename: string, contentType: string, bytes: Uint8Array, { counted = false, source = "texts" } = {}) {
  const id = randomId(12);
  const key = uploadKey(userId, id);
  const now = Date.now();
  const asked = await env.DB.prepare(
    `INSERT INTO uploads (id, user_id, filename, content_type, status, source, created_at, expires_at, purpose) SELECT ?, ?, ?, ?, 'pending', ?, ?, ?, ?
     WHERE ? = 0 OR (SELECT COUNT(*) FROM uploads WHERE user_id = ?) < ?`,
  )
    .bind(id, userId, filename.slice(0, 120), contentType, source, now, now, purpose, counted ? 1 : 0, userId, UPLOADS_PER_USER_MAX)
    .run();
  if (!asked.meta.changes) throw new LibraryError(`This account already has ${UPLOADS_PER_USER_MAX} uploads.`);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const put = await env.UPLOADS.put(key, body, { httpMetadata: { contentType }, onlyIf: new Headers({ "If-None-Match": "*" }) });
  if (!put) throw new LibraryError("Couldn't keep the file; try again.");
  const stored = await env.DB.prepare("UPDATE uploads SET status = 'stored', size = ?, sha256 = ?, r2_key = ?, stored_at = ? WHERE id = ? AND status = 'pending'")
    .bind(bytes.byteLength, await sha256Hex(body), key, Date.now(), id)
    .run();
  if (!stored.meta.changes) {
    // Its row went with its account while the file was being written: nothing may stay behind.
    await env.UPLOADS.delete(key);
    throw new LibraryError("The account is gone.");
  }
  return id;
}

/** Deletes uploads: their bytes first, then their rows (so a failure leaves a row to find again, never lost bytes). */
export async function dropUploads(env: Env, userId: string, where: "id" | "purpose", value: string) {
  const rows = await env.DB.prepare(`SELECT id FROM uploads WHERE user_id = ? AND ${where} = ?`).bind(userId, value).all<{ id: string }>();
  if (!rows.results.length) return;
  await env.UPLOADS.delete(rows.results.map((r) => uploadKey(userId, r.id)));
  await env.DB.batch(rows.results.map((r) => env.DB.prepare("DELETE FROM uploads WHERE user_id = ? AND id = ?").bind(userId, r.id)));
}

// ---------- the relay ----------

/**
 * Waiting changes past their 7 days expire (their files go), and history past 90 days is forgotten. Then, a day on,
 * every text upload nothing on its way needs goes: one add_text never used, a claim it never finished, a change's file
 * left behind (a delete that failed, a change that was never queued). Each file goes when it can, and one that can't
 * go now is found again next time, so a moment without storage never fails the caller. Run by every text call of your
 * AI's and when a device of yours says it's here (packs.ts putDevice), so nothing waits on a call that never comes.
 */
export async function tidy(env: Env, userId: string, now: number) {
  const expired = await env.DB.prepare("SELECT id FROM text_changes WHERE user_id = ? AND expires_at <= ? AND body IS NOT NULL").bind(userId, now).all<{ id: string }>();
  await env.DB.batch([
    env.DB.prepare("UPDATE text_deliveries SET state = 'expired', settled_at = ? WHERE user_id = ? AND state = 'waiting' AND change_seq IN (SELECT seq FROM text_changes WHERE user_id = ? AND expires_at <= ?)").bind(now, userId, userId, now),
    env.DB.prepare("UPDATE text_changes SET body = NULL WHERE user_id = ? AND expires_at <= ? AND body IS NOT NULL").bind(userId, now),
    env.DB.prepare("DELETE FROM text_deliveries WHERE user_id = ? AND change_seq IN (SELECT seq FROM text_changes WHERE user_id = ? AND created_at < ?)").bind(userId, userId, now - TEXT_RELAY.history),
    env.DB.prepare("DELETE FROM text_changes WHERE user_id = ? AND created_at < ?").bind(userId, now - TEXT_RELAY.history),
  ]);
  for (const { id } of expired.results) await dropUploads(env, userId, "purpose", `text-in:${id}`).catch(() => {});
  const left = await env.DB.prepare(
    `SELECT u.id FROM uploads u WHERE u.user_id = ? AND COALESCE(u.stored_at, u.created_at) < ? AND (u.purpose LIKE 'text:%' OR u.purpose LIKE 'text-claim:%'
       OR (u.purpose LIKE 'text-in:%' AND NOT EXISTS (SELECT 1 FROM text_changes c WHERE c.user_id = u.user_id AND c.body IS NOT NULL AND u.purpose = 'text-in:' || c.id)))`,
  )
    .bind(userId, now - TEXT_RELAY.staging)
    .all<{ id: string }>();
  for (const { id } of left.results) await dropUploads(env, userId, "id", id).catch(() => {});
  // A text's copy for weaving: one no request named within the hour, one a request was being made with (its claim never
  // finished), and one whose request is long past (it went when the request finished; this catches one that expired).
  const weaving = await env.DB.prepare(
    `SELECT id FROM uploads WHERE user_id = ? AND ((purpose LIKE 'weave-in:%' OR purpose LIKE 'weave-claim:%') AND created_at < ? OR purpose LIKE 'weave-for:%' AND created_at < ?)`,
  )
    .bind(userId, now - WEAVE_TEXT.unused, now - WEAVE_TEXT.kept)
    .all<{ id: string }>();
  for (const { id } of weaving.results) await dropUploads(env, userId, "id", id).catch(() => {});
}

/**
 * Queues a change for every device of yours seen in the last 30 days (a device opened later gets it too, while it's on
 * its way). latest: the text's latest change as it was read (null for none); if another arrived since, nothing is
 * queued and the caller is told to look again. Returns { change_id, text_id, said, devices }.
 */
async function queue(env: Env, userId: string, { id, textId, kind, body, said, source, undoes, latest }: { id: string; textId: string; kind: string; body: TextBody; said: string; source: string; undoes?: string; latest: string | null }) {
  const now = Date.now();
  // One batch, so nothing can fail once the change is queued (a caller undoes what it made only when nothing went), and
  // the devices named are the ones it's on its way to.
  const [inserted, , devices] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO text_changes (id, user_id, text_id, kind, body, said, source, undoes, created_at, expires_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE COALESCE((SELECT id FROM text_changes WHERE user_id = ? AND text_id = ? ORDER BY seq DESC LIMIT 1), '') = ?`,
    ).bind(id, userId, textId, kind, JSON.stringify(body), said, source, undoes ?? null, now, now + TEXT_RELAY.keep, userId, textId, latest ?? ""),
    env.DB.prepare(
      `INSERT INTO text_deliveries (change_seq, user_id, device_id, state)
       SELECT (SELECT seq FROM text_changes WHERE id = ?), ?, device_id, 'waiting' FROM pack_devices
       WHERE user_id = ? AND seen_at >= ? AND EXISTS (SELECT 1 FROM text_changes WHERE id = ?)`,
    ).bind(id, userId, userId, now - TEXT_RELAY.deviceGone, id),
    env.DB.prepare(
      `SELECT p.label FROM text_deliveries d JOIN pack_devices p ON p.user_id = d.user_id AND p.device_id = d.device_id
       WHERE d.user_id = ? AND d.change_seq = (SELECT seq FROM text_changes WHERE id = ?) ORDER BY p.seen_at DESC`,
    ).bind(userId, id),
  ]);
  if (!inserted!.meta.changes) throw new LibraryError("Another change to this text arrived at the same moment: look again (get_text), then try again.");
  return { change_id: id, text_id: textId, said, devices: (devices!.results as { label: string }[]).map((d) => d.label) };
}

async function roomForMore(env: Env, userId: string) {
  await tidy(env, userId, Date.now());
  const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM text_changes WHERE user_id = ? AND body IS NOT NULL").bind(userId).first<{ n: number }>();
  if ((waiting?.n ?? 0) >= TEXT_RELAY.waiting) throw new LibraryError(`${TEXT_RELAY.waiting} texts are still on their way to their devices. Ask them to open Lexicommons on each device, then go on.`);
}

export interface AddTextInput {
  upload_id: string;
  language: string;
  title?: string;
  authors?: string[];
  cover_upload_id?: string;
}

/** add_text: checks the uploaded text (and cover), keeps their files for the change, and queues it. */
export async function addText(env: Env, userId: string, source: string, input: AddTextInput) {
  const language = asText(input.language);
  if (!Object.hasOwn(LANGUAGES, language)) throw new LibraryError(`language must be one of ${Object.keys(LANGUAGES).join(", ")}.`);
  const title = text(input.title, TEXT_RELAY.title) || undefined;
  const authors = (Array.isArray(input.authors) ? input.authors : []).slice(0, 5).map((a) => text(a, 80)).filter(Boolean);
  await roomForMore(env, userId);
  const id = `txc_${randomId(12)}`;
  const textId = newTextId();
  // Each upload claimed for this change (so it can't go into two texts); if anything fails, the claims are released
  // and whatever was made for the change is deleted, so nothing is left behind.
  const claims: (() => Promise<unknown>)[] = [];
  let added;
  try {
    const file = await claimUpload(env, userId, input.upload_id, ["text:text", "text:book", "text:epub"], `text-claim:${id}:text`);
    claims.push(file.release);
    const checked = await checkTextFile(file.row.purpose!.slice(5), file.bytes, { id: textId, title, language, authors, source: whoFrom(source) });
    let cover: Awaited<ReturnType<typeof checkCoverFile>> | null = null;
    if (input.cover_upload_id) {
      const art = await claimUpload(env, userId, input.cover_upload_id, ["text:cover"], `text-claim:${id}:cover`);
      claims.push(art.release);
      cover = await checkCoverFile(art.bytes);
    }
    const shown = checked.format === "book" ? checked.book!.title : (title ?? "a book");
    // The change's files: the book the server made or checked (or the EPUB as it came), and the cleaned cover.
    if (checked.format === "book") await storeMade(env, userId, id, `${textId}.json`, contentOf("book"), checked.bytes);
    else {
      const moved = await env.DB.prepare("UPDATE uploads SET purpose = ? WHERE user_id = ? AND purpose = ?").bind(`text-in:${id}`, userId, `text-claim:${id}:text`).run();
      if (!moved.meta.changes) throw new LibraryError(`Upload ${asText(input.upload_id)}'s file is gone: upload it again.`);
    }
    if (cover) await storeMade(env, userId, id, cover.file, TEXT_UPLOADS.cover!.type, new TextEncoder().encode(cover.svg));
    const retitle = checked.format === "epub" && title !== undefined;
    const body: TextBody = { title: shown, language, format: checked.format, bytes: checked.bytes.byteLength, ...(checked.words ? { words: checked.words } : {}), ...(cover ? { cover: { file: cover.file } } : {}), ...(checked.format === "epub" && authors.length ? { authors } : {}), ...(retitle ? { retitle } : {}) };
    const queued = await queue(env, userId, { id, textId, kind: "add", body, said: `added “${shown}”`, source, latest: null });
    added = { ...queued, title: shown, ...(checked.words ? { words: checked.words } : {}), ...(cover?.dropped.length ? { cover_left_out: cover.dropped } : {}) };
  } catch (error) {
    await dropUploads(env, userId, "purpose", `text-in:${id}`).catch(() => {});
    for (const release of claims) await release().catch(() => {});
    throw error;
  }
  // The change is on its way, so nothing here may undo it: what it was made from goes now if it can (the change keeps
  // only its own files), else with the next tidy, a day on.
  await dropUploads(env, userId, "purpose", `text-claim:${id}:text`).catch(() => {});
  await dropUploads(env, userId, "purpose", `text-claim:${id}:cover`).catch(() => {});
  return added;
}

/**
 * The account's latest change to a text: whether it has been undone, and for an undo the kind of change it undid (from
 * the columns, which outlive a delivered change's body).
 */
async function latestOf(env: Env, userId: string, textId: string) {
  return env.DB.prepare(
    `SELECT c.id, c.kind, c.body, c.said, (SELECT 1 FROM text_changes u WHERE u.user_id = c.user_id AND u.undoes = c.id) AS undone,
       (SELECT t.kind FROM text_changes t WHERE t.user_id = c.user_id AND t.id = c.undoes) AS undid
     FROM text_changes c WHERE c.user_id = ? AND c.text_id = ? ORDER BY c.seq DESC LIMIT 1`,
  )
    .bind(userId, textId)
    .first<{ id: string; kind: string; body: string | null; said: string; undone: number | null; undid: string | null }>();
}

/** A change's title: from its body while it's on its way, else from its own words ("added “De rode jas”"). */
const titleOf = (change: { body: string | null; said: string }) => (change.body ? (JSON.parse(change.body) as TextBody).title : (/“(.+)”/.exec(change.said)?.[1] ?? ""));

/** remove_text (and Remove in the app, for a text from your AI): it goes from every device, each keeping it 7 days for Undo. */
export async function removeText(env: Env, userId: string, source: string, input: { text_id: string; title?: string }) {
  const textId = asText(input.text_id);
  if (!TEXT_ID.test(textId)) throw new LibraryError("text_id must be a text's id (list_texts).");
  await roomForMore(env, userId);
  const latest = await latestOf(env, userId, textId);
  const added = latest && (await env.DB.prepare("SELECT 1 AS y FROM text_changes WHERE user_id = ? AND text_id = ? AND kind = 'add' LIMIT 1").bind(userId, textId).first());
  if (!latest || !added) throw new LibraryError("No text your AI added has that id (list_texts). Texts they added themselves stay theirs, on their device.");
  if ((latest.kind === "remove" && !latest.undone) || (latest.kind === "undo" && latest.undid === "add")) throw new LibraryError("That text is removed already.");
  const title = text(input.title, TEXT_RELAY.title) || titleOf(latest) || (await titleOn(env, userId, textId)) || textId;
  return queue(env, userId, { id: `txc_${randomId(12)}`, textId, kind: "remove", body: { title }, said: `removed “${title}”`, source, latest: latest.id });
}

/** undo_text_change (and Undo in the app): undoes a text's latest change, add or remove, on every device. */
export async function undoTextChange(env: Env, userId: string, source: string, changeId: string) {
  if (!CHANGE_ID.test(changeId)) throw new LibraryError("No change has that id (get_text lists a text's changes).");
  const target = await env.DB.prepare("SELECT text_id, kind, body, said, created_at FROM text_changes WHERE id = ? AND user_id = ?").bind(changeId, userId).first<{ text_id: string; kind: string; body: string | null; said: string; created_at: number }>();
  if (!target) throw new LibraryError("No change has that id (get_text lists a text's changes).");
  if (target.kind === "undo") throw new LibraryError("An undo can't be undone; add the text again instead.");
  if (target.kind === "weave") throw new LibraryError("A weave can't be undone: it's theirs to keep or not, on their device.");
  if (target.kind === "remove" && Date.now() - target.created_at > TEXT_RELAY.keep) throw new LibraryError("Their devices kept that text 7 days after it was removed, and that's past: add it again instead.");
  const latest = await latestOf(env, userId, target.text_id);
  if (latest?.id !== changeId) throw new LibraryError(latest?.kind === "weave" ? "It was woven since, so it can't be undone now: remove the text instead (remove_text)." : "A later change to this text came after it: undo that one first.");
  if (latest.undone) throw new LibraryError("That change is undone already.");
  await roomForMore(env, userId);
  const title = titleOf(target) || ((await titleOn(env, userId, target.text_id)) ?? target.text_id);
  return queue(env, userId, { id: `txc_${randomId(12)}`, textId: target.text_id, kind: "undo", body: { title, change: changeId, undoes: target.kind as "add" | "remove" }, said: `undid: ${target.said}`, source, undoes: changeId, latest: changeId });
}

/** Remove or Undo pressed in the app: queued for every device, the one it was pressed on included. */
export async function queueTextFromDevice(env: Env, userId: string, label: string, input: unknown) {
  const body = isObject(input) ? input : {};
  const source = `device:${text(label, 60)}`;
  if (body.kind === "remove") return removeText(env, userId, source, { text_id: asText(body.textId), title: asText(body.title) });
  if (body.kind === "undo") return undoTextChange(env, userId, source, asText(body.change));
  throw new LibraryError("kind must be remove or undo.");
}

// ---------- weaving a text of yours ----------

/** A text's copy for weaving: one no request names goes after an hour; one a request names goes when it finishes (or 15 days on). */
export const WEAVE_TEXT = { unused: 3_600_000, kept: 15 * 86_400_000 };

/**
 * Whether tidy has anything to do for an account, as one statement for the device route's first batch (packs.ts putDevice): any of
 * tidy's statements' own WHEREs (a waiting delivery of an expired change, an expired change still holding its content, a change past
 * its 90 days, a staged text upload, a weaving copy past its time). Change one of tidy's statements and change its line here with it.
 */
export function textHousekeepingWork(env: Env, userId: string, now: number): D1PreparedStatement {
  return env.DB.prepare(
    `SELECT EXISTS (SELECT 1 FROM text_deliveries d JOIN text_changes c ON c.seq = d.change_seq WHERE d.user_id = ?1 AND d.state = 'waiting' AND c.user_id = ?1 AND c.expires_at <= ?2)
         OR EXISTS (SELECT 1 FROM text_changes WHERE user_id = ?1 AND expires_at <= ?2 AND body IS NOT NULL)
         OR EXISTS (SELECT 1 FROM text_changes WHERE user_id = ?1 AND created_at < ?3)
         OR EXISTS (SELECT 1 FROM uploads u WHERE u.user_id = ?1 AND COALESCE(u.stored_at, u.created_at) < ?4 AND (u.purpose LIKE 'text:%' OR u.purpose LIKE 'text-claim:%'
              OR (u.purpose LIKE 'text-in:%' AND NOT EXISTS (SELECT 1 FROM text_changes c WHERE c.user_id = u.user_id AND c.body IS NOT NULL AND u.purpose = 'text-in:' || c.id))))
         OR EXISTS (SELECT 1 FROM uploads WHERE user_id = ?1 AND ((purpose LIKE 'weave-in:%' OR purpose LIKE 'weave-claim:%') AND created_at < ?5 OR purpose LIKE 'weave-for:%' AND created_at < ?6)) AS tidy`,
  ).bind(userId, now, now - TEXT_RELAY.history, now - TEXT_RELAY.staging, now - WEAVE_TEXT.unused, now - WEAVE_TEXT.kept);
}

/**
 * POST /api/ai/weave-texts { book }: the device's copy of a text of yours, kept for the request it's about to make. Checked as a
 * book is (book-format.js validateBook), 8 MB at most, one of the account's uploads; a copy of the same text no request has
 * named yet is replaced. Returns { upload, expiresAt }.
 */
export async function storeWeaveText(env: Env, userId: string, input: unknown) {
  const book = isObject(input) ? input.book : null;
  if (!isObject(book)) throw new LibraryError("Send the text as { book }.");
  const problems = await validateBook(book);
  if (problems.length) throw new LibraryError(`That text isn't a book this app reads: ${problems.slice(0, 3).join(" ")}`);
  const bytes = new TextEncoder().encode(JSON.stringify(book));
  if (bytes.byteLength > TEXT_UPLOADS.book!.maxBytes) throw new LibraryError(`That text is ${Math.ceil(bytes.byteLength / 1e6)} MB; one sent for weaving may be ${TEXT_UPLOADS.book!.maxBytes / 1e6} MB.`);
  const bookId = book.id as string;
  await dropUploads(env, userId, "purpose", `weave-in:${bookId}`);
  const upload = await storeFile(env, userId, `weave-in:${bookId}`, `${bookId}.json`, TEXT_UPLOADS.book!.type, bytes, { counted: true, source: "device" });
  return { upload, expiresAt: Date.now() + WEAVE_TEXT.unused };
}

/**
 * A weave request being made: its copy of the text claimed (the account's, for that book, sent within the hour, named by no
 * other request), so the request can be kept; then tie(request id) keeps it for that request, or release() puts it back.
 */
export async function claimWeaveText(env: Env, userId: string, uploadId: unknown, bookId: unknown) {
  const id = asText(uploadId);
  const book = asText(bookId);
  if (!UPLOAD_ID.test(id) || !TEXT_ID.test(book)) throw new LibraryError("A weave request names its text and the copy the app sent of it.");
  const claimed = await env.DB.prepare("UPDATE uploads SET purpose = ? WHERE id = ? AND user_id = ? AND purpose = ? AND status = 'stored' AND created_at >= ?")
    .bind(`weave-claim:${id}`, id, userId, `weave-in:${book}`, Date.now() - WEAVE_TEXT.unused)
    .run();
  if (!claimed.meta.changes) throw new LibraryError("That text's copy isn't here any more: press Weave it with your AI again.");
  return {
    tie: (requestId: string) => env.DB.prepare("UPDATE uploads SET purpose = ? WHERE id = ? AND user_id = ? AND purpose = ?").bind(`weave-for:${requestId}`, id, userId, `weave-claim:${id}`).run(),
    release: () => env.DB.prepare("UPDATE uploads SET purpose = ? WHERE id = ? AND user_id = ? AND purpose = ?").bind(`weave-in:${book}`, id, userId, `weave-claim:${id}`).run(),
  };
}

/**
 * A weave your AI uploaded (request_text_upload, format weave) rather than sent in add_weave's arguments: claimed, so it can't
 * go into two weaves, and read. done() deletes it once the weave is on its way; release() puts it back.
 */
export async function weaveUpload(env: Env, userId: string, uploadId: unknown) {
  const file = await claimUpload(env, userId, uploadId, ["text:weave"], `weave-claim:${asText(uploadId)}`);
  let weave: unknown;
  try {
    weave = JSON.parse(new TextDecoder().decode(file.bytes));
  } catch {
    await file.release();
    throw new LibraryError("That upload isn't JSON: upload the weave as a lexicommons-weave.");
  }
  return { weave, release: file.release, done: () => dropUploads(env, userId, "id", asText(uploadId)) };
}

/** The request is done, couldn't be done or was canceled: its copy of the text goes now. */
export const dropWeaveText = (env: Env, userId: string, requestId: string) => dropUploads(env, userId, "purpose", `weave-for:${requestId}`);

/** The text a weave request is for, as the app sent it (get_text with the request). */
export async function weaveSource(env: Env, userId: string, requestId: string) {
  const row = await env.DB.prepare("SELECT r2_key FROM uploads WHERE user_id = ? AND purpose = ? AND status = 'stored'").bind(userId, `weave-for:${requestId}`).first<{ r2_key: string }>();
  const object = row ? await env.UPLOADS.get(row.r2_key) : null;
  if (!object) throw new LibraryError("That request's text isn't here any more (it finished, or was canceled).");
  return JSON.parse(await object.text()) as Record<string, unknown> & { id: string; title: string; version: string; lang: string; words: string[]; sentences: [number, number][] };
}

/**
 * English "her" glossed with its own form as its lemma (haar, lemma haar) is the possessive ("She called her brother up": haar broer), which the
 * rules make its own lemma ("a possessive (haar, zijn, mijn) … is its own lemma"); an object pronoun takes its verb's lemma, or the subject
 * form (zij) after a preposition. The pipeline's mix check (split-forms.generated.ts, lx-books') reads any "her" after a verb as the object,
 * and its fix (the verb's lemma on haar) would mis-teach the possessive: so the app lets this one through. "her" is the only English object
 * pronoun that's also a possessive (English's other possessives, my, your, our and their, are never object pronouns).
 */
function possessiveHer(f: { kind: string; english: string; gloss: unknown }) {
  if (f.kind !== "word:pronoun-alone" || !Array.isArray(f.gloss)) return false;
  const bare = (word: unknown) => String(word ?? "").replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").toLowerCase();
  const [target, lemma] = f.gloss;
  return bare(f.english) === "her" && typeof lemma === "string" && lemma === bare(target);
}

/**
 * add_weave: a weave of a request's text, checked as the books pipeline's layers are (book-format.js validateWeave: every
 * sentence and word, the book and its version) and woven into the request's language, kept as the change's file and
 * relayed to every device as a change of kind "weave" (a device without the text says it's missing). Finishing the request
 * is the caller's (mcp-texts.ts), then its copy of the text goes.
 */
export async function addWeave(env: Env, userId: string, source: string, input: { requestId: string; title: string; language: string; weave: unknown }) {
  const language = asText(input.language);
  if (!WEAVE_LANGUAGES.includes(language)) throw new LibraryError(`Weaving into ${LANGUAGES[language as keyof typeof LANGUAGES]?.name ?? language} isn't ready yet.`);
  const book = await weaveSource(env, userId, input.requestId);
  if (!isObject(input.weave)) throw new LibraryError("weave must be an object: { sentences: [...] }, as get_weave_guide shows.");
  let weave: Record<string, unknown> = input.weave;
  const refuse = (problems: string[]) =>
    new LibraryError(`The weave doesn't pass yet (${problems.length} problem${problems.length === 1 ? "" : "s"}); fix them all and add it again:\n- ${problems.slice(0, 40).join("\n- ")}${problems.length > 40 ? `\n…and ${problems.length - 40} more` : ""}`);
  // The guide's form ({ sentences: [{ x, t: [{ w, target, lemma }], text, m, u, c }] }, the rules' own) is made into the stored form here, as the
  // books pipeline makes its model's answers (weave-answer.ts): each sentence's place in the text and its hash are worked out, not asked for.
  const answered: string[] = [];
  if (isAnswerForm(weave)) {
    const made = await weaveFromAnswer(book, language, weave);
    if (!made.weave) throw refuse(made.problems);
    answered.push(...made.problems);
    weave = made.weave as unknown as Record<string, unknown>;
  }
  // A text of yours is woven into the language you learn: never help, never a parallel layer (the open library's alone).
  if (weave.kind !== "weave") throw new LibraryError('weave.kind must be "weave": a text of yours is woven into the language you learn.');
  if (weave.to !== language) throw new LibraryError(`This request asks for ${LANGUAGES[language as keyof typeof LANGUAGES]?.name ?? language}: the weave's to must be "${language}".`);
  // The format's checks (against the language's grammar as the library has it now: a sentence's c may name any pattern of its, as a shared
  // book's layer may), then the two misleading mixes the books pipeline's judges count (a verb's form split from the rest of it, an object
  // pronoun shown alone): split-forms.generated.ts, the pipeline's own check, word for word.
  await grammarReady(env, language);
  const problems = [...answered, ...(await validateWeave(weave, book))];
  const MIX: Record<string, string> = { "word:split-form": "a verb's form split from the rest of it", "word:pronoun-alone": "an object pronoun shown alone" };
  if (!problems.length) {
    for (const f of splitForms(book, weave as { sentences: unknown[] }, WEAVE_SPLIT[language] ?? {})) {
      if (possessiveHer(f)) continue;
      const shown = Array.isArray(f.gloss) ? f.gloss[0] : f.gloss;
      problems.push(`Sentence ${f.x}, ${MIX[f.kind] ?? f.kind}: ${f.why} (“${f.english}” shown as “${shown ?? f.english}”). Fix: ${f.fix}.`);
    }
  }
  if (problems.length) throw refuse(problems);
  await roomForMore(env, userId);
  const title = text(input.title, TEXT_RELAY.title) || book.title;
  const id = `txc_${randomId(12)}`;
  const shown = LANGUAGES[language as keyof typeof LANGUAGES]?.name ?? language;
  try {
    await storeMade(env, userId, id, `${book.id}.${language}.weave.json`, TEXT_UPLOADS.book!.type, new TextEncoder().encode(JSON.stringify(weave)));
    const latest = await latestOf(env, userId, book.id);
    return await queue(env, userId, { id, textId: book.id, kind: "weave", body: { title, to: language, bookVersion: book.version, request: input.requestId }, said: `wove “${title}” into ${shown}`, source, latest: latest?.id ?? null });
  } catch (error) {
    await dropUploads(env, userId, "purpose", `text-in:${id}`).catch(() => {});
    throw error;
  }
}

// ---------- a device's side ----------

/** What a device says it has: [{ id, title, language, words, by, addedAt }] (as list_texts shows). */
export function deviceTexts(value: unknown) {
  return (Array.isArray(value) ? value : []).slice(0, TEXT_RELAY.texts).flatMap((t) => {
    if (!isObject(t) || !TEXT_ID.test(asText(t.id))) return [];
    const words = Number.isInteger(t.words) ? Math.max(0, t.words as number) : 0;
    return [{ id: asText(t.id), title: text(t.title, TEXT_RELAY.title), language: Object.hasOwn(LANGUAGES, asText(t.language)) ? asText(t.language) : "", words, by: t.by === "ai" ? "ai" : "you", addedAt: Number.isInteger(t.addedAt) ? (t.addedAt as number) : 0 }];
  });
}

/** For putDevice: a new device gets the text changes still on their way. */
export const textDeliveriesForNewDevice = (env: Env, userId: string, deviceId: string, now: number) =>
  env.DB.prepare(
    `INSERT INTO text_deliveries (change_seq, user_id, device_id, state) SELECT seq, user_id, ?, 'waiting' FROM text_changes WHERE user_id = ? AND body IS NOT NULL AND expires_at > ?
     ON CONFLICT (change_seq, device_id) DO UPDATE SET state = 'waiting', result = NULL, settled_at = NULL WHERE text_deliveries.state = 'expired'`,
  ).bind(deviceId, userId, now);

/** For forgetGone: what waited for a device gone 30 days expires. */
export const textDeliveriesForGoneDevices = (env: Env, userId: string, before: number, now: number) =>
  env.DB.prepare("UPDATE text_deliveries SET state = 'expired', settled_at = ? WHERE user_id = ? AND state = 'waiting' AND device_id IN (SELECT device_id FROM pack_devices WHERE user_id = ? AND seen_at < ?)").bind(now, userId, userId, before);

/** Whether a text change waits for a device (the inbox's one read covers both relays). */
export async function hasWaitingTexts(env: Env, userId: string, deviceId: string): Promise<boolean> {
  return Boolean(await env.DB.prepare(TEXTS_WAITING).bind(userId, deviceId, Date.now()).first());
}
/** Whether a text change waits for a device, as SQL: user, device, now (packs.ts PACKS_WAITING's partner). */
export const TEXTS_WAITING =
  "SELECT 1 AS y FROM text_deliveries d JOIN text_changes c ON c.seq = d.change_seq WHERE d.user_id = ? AND d.device_id = ? AND d.state = 'waiting' AND c.expires_at > ? AND c.body IS NOT NULL LIMIT 1";

export interface RelayedText {
  id: string;
  seq: number;
  textId: string;
  kind: string;
  body: TextBody;
  said: string;
  source: string;
  undoes: string | null;
  createdAt: number;
}

/** The text changes waiting for a device, oldest first. */
export async function textInbox(env: Env, userId: string, deviceId: string): Promise<RelayedText[]> {
  const rows = await env.DB.prepare(
    `SELECT c.seq, c.id, c.text_id, c.kind, c.body, c.said, c.source, c.undoes, c.created_at FROM text_deliveries d JOIN text_changes c ON c.seq = d.change_seq
     WHERE d.user_id = ? AND d.device_id = ? AND d.state = 'waiting' AND c.expires_at > ? AND c.body IS NOT NULL ORDER BY c.seq LIMIT ?`,
  )
    .bind(userId, deviceId, Date.now(), TEXT_RELAY.inbox)
    .all<{ seq: number; id: string; text_id: string; kind: string; body: string; said: string; source: string; undoes: string | null; created_at: number }>();
  return rows.results.map((r) => ({ id: r.id, seq: r.seq, textId: r.text_id, kind: r.kind, body: JSON.parse(r.body) as TextBody, said: r.said, source: r.source, undoes: r.undoes, createdAt: r.created_at }));
}

const TEXT_REPORTS = new Set(["applied", "failed", "missing"]);

/** A device's report: applied (with its words), failed (why: an EPUB that wouldn't convert), missing. */
export async function reportText(env: Env, userId: string, deviceId: string, changeId: string, input: unknown) {
  if (!CHANGE_ID.test(changeId)) throw new LibraryError("No change has that id.");
  if (!DEVICE_ID.test(deviceId)) throw new LibraryError("A device id is 8 to 64 letters, digits, dashes or underscores.");
  const body = isObject(input) ? input : {};
  const state = asText(body.state);
  if (!TEXT_REPORTS.has(state)) throw new LibraryError("state must be applied, failed or missing.");
  const result = JSON.stringify({ ...(state === "failed" ? { error: text(body.error, 400) || "It couldn't be made into a book." } : {}), ...(Number.isInteger(body.words) ? { words: body.words } : {}) });
  const change = await env.DB.prepare("SELECT seq FROM text_changes WHERE id = ? AND user_id = ?").bind(changeId, userId).first<{ seq: number }>();
  if (!change) throw new LibraryError("No change has that id.");
  const now = Date.now();
  const [, , done] = await env.DB.batch([
    env.DB.prepare("UPDATE text_deliveries SET state = ?, result = ?, settled_at = ? WHERE change_seq = ? AND device_id = ? AND state = 'waiting'").bind(state, result, now, change.seq, deviceId),
    // Every device has it only when this report settled a delivery of this device's, and none is left waiting: a report from a device
    // the change was never sent to settles nothing, so it can't clear a text no device has taken yet (6 Nov 2026, Codex C17).
    env.DB.prepare(
      "UPDATE text_changes SET body = NULL WHERE seq = ? AND EXISTS (SELECT 1 FROM text_deliveries WHERE change_seq = ? AND device_id = ? AND settled_at = ? AND state != 'waiting') AND NOT EXISTS (SELECT 1 FROM text_deliveries WHERE change_seq = ? AND state = 'waiting')",
    ).bind(change.seq, change.seq, deviceId, now, change.seq),
    env.DB.prepare("SELECT body FROM text_changes WHERE seq = ?").bind(change.seq),
  ]);
  // Every device has it: its files go (or, if storage can't take that now, with the next tidy).
  if ((done!.results[0] as { body: string | null } | undefined)?.body === null) await dropUploads(env, userId, "purpose", `text-in:${changeId}`).catch(() => {});
  return { ok: true };
}

/**
 * A change's file, for a device of the account's: part "text" (the book as JSON, or the EPUB), "cover" (the cleaned
 * SVG) or "weave" (a weave's layer as JSON). Always a download that can't run (the device makes its own image of the cover).
 */
export async function serveTextFile(env: Env, userId: string, changeId: string, part: string): Promise<Response> {
  const notFound = () => new Response(JSON.stringify({ error: "That file is gone (every device has it, or it expired)." }), { status: 404, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (!CHANGE_ID.test(changeId) || (part !== "text" && part !== "cover" && part !== "weave")) return notFound();
  // A weave's change has one file, the weave as JSON (part "weave").
  const types = part === "cover" ? [TEXT_UPLOADS.cover!.type] : part === "weave" ? [TEXT_UPLOADS.book!.type] : [TEXT_UPLOADS.book!.type, TEXT_UPLOADS.epub!.type];
  // Only while the change still waits for a device and hasn't expired, as a pack change's clips (packs.ts serveChangeClip): its files are
  // gone by then, and a tidy that hasn't run yet doesn't keep them served (6 Nov 2026, Codex C17).
  const live = await env.DB.prepare("SELECT 1 AS y FROM text_changes WHERE id = ? AND user_id = ? AND body IS NOT NULL AND expires_at > ?").bind(changeId, userId, Date.now()).first();
  if (!live) return notFound();
  const rows = await env.DB.prepare("SELECT r2_key, content_type FROM uploads WHERE user_id = ? AND purpose = ? AND status = 'stored'").bind(userId, `text-in:${changeId}`).all<{ r2_key: string; content_type: string }>();
  const row = rows.results.find((r) => types.includes(r.content_type));
  const object = row ? await env.UPLOADS.get(row.r2_key) : null;
  if (!object) return notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${part}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "X-Lexicommons-Type": row!.content_type,
      "Cache-Control": "private, no-store",
      "Content-Length": String(object.size),
    },
  });
}

// ---------- for your AI ----------

const whoFrom = (source: string) => source.replace(/^(oauth|pat|rest|device):/, "") || "your AI";

async function titleOn(env: Env, userId: string, textId: string): Promise<string | null> {
  const devices = await env.DB.prepare("SELECT texts FROM pack_devices WHERE user_id = ?").bind(userId).all<{ texts: string }>();
  for (const d of devices.results) for (const t of deviceTexts(JSON.parse(d.texts))) if (t.id === textId) return t.title;
  return null;
}

/** list_texts: every text on each device of yours, and what's on its way. */
export async function listTexts(env: Env, userId: string) {
  await tidy(env, userId, Date.now());
  const [devices, waiting] = await Promise.all([
    env.DB.prepare("SELECT device_id, label, texts, seen_at FROM pack_devices WHERE user_id = ? ORDER BY seen_at DESC").bind(userId).all<{ device_id: string; label: string; texts: string; seen_at: number }>(),
    env.DB.prepare(
      `SELECT c.id, c.text_id, c.kind, c.said, json_group_array(p.label) AS labels FROM text_changes c
       LEFT JOIN text_deliveries d ON d.change_seq = c.seq AND d.state = 'waiting' LEFT JOIN pack_devices p ON p.user_id = c.user_id AND p.device_id = d.device_id
       WHERE c.user_id = ? AND c.body IS NOT NULL GROUP BY c.seq ORDER BY c.seq`,
    )
      .bind(userId)
      .all<{ id: string; text_id: string; kind: string; said: string; labels: string }>(),
  ]);
  const texts = new Map<string, { text_id: string; title: string; language: string; words: number; by: string; on: string[] }>();
  for (const d of devices.results) {
    for (const t of deviceTexts(JSON.parse(d.texts))) {
      const known = texts.get(t.id) ?? { text_id: t.id, title: t.title, language: t.language, words: t.words, by: t.by === "ai" ? "your AI" : "them", on: [] };
      known.on.push(d.label);
      texts.set(t.id, known);
    }
  }
  return {
    texts: [...texts.values()],
    on_their_way: waiting.results.map((w) => {
      const labels = (JSON.parse(w.labels) as (string | null)[]).filter((l): l is string => Boolean(l));
      return { change_id: w.id, text_id: w.text_id, kind: w.kind, said: w.said, waiting_for: labels.length ? labels : ["the next device of theirs to open Lexicommons"] };
    }),
    devices: devices.results.map((d) => ({ device: d.label, last_opened: new Date(d.seen_at).toISOString() })),
  };
}

/** get_text: where a text is, and its changes with how each went on each device (why one failed, where it did). */
export async function getText(env: Env, userId: string, textId: string) {
  if (!TEXT_ID.test(textId)) throw new LibraryError("text_id must be a text's id (list_texts).");
  await tidy(env, userId, Date.now());
  const [devices, changes] = await Promise.all([
    env.DB.prepare("SELECT device_id, label, texts FROM pack_devices WHERE user_id = ?").bind(userId).all<{ device_id: string; label: string; texts: string }>(),
    env.DB.prepare(
      `SELECT c.seq, c.id, c.kind, c.said, c.source, c.undoes, c.created_at, c.body IS NOT NULL AS on_its_way, d.state, d.result, p.label
       FROM text_changes c LEFT JOIN text_deliveries d ON d.change_seq = c.seq LEFT JOIN pack_devices p ON p.user_id = c.user_id AND p.device_id = d.device_id
       WHERE c.user_id = ? AND c.text_id = ? ORDER BY c.seq DESC`,
    )
      .bind(userId, textId)
      .all<{ seq: number; id: string; kind: string; said: string; source: string; undoes: string | null; created_at: number; on_its_way: number; state: string | null; result: string | null; label: string | null }>(),
  ]);
  const on = devices.results.filter((d) => deviceTexts(JSON.parse(d.texts)).some((t) => t.id === textId));
  const title = on.length ? deviceTexts(JSON.parse(on[0]!.texts)).find((t) => t.id === textId)!.title : null;
  if (!on.length && !changes.results.length) throw new LibraryError("No text has that id on their devices (list_texts).");
  const byChange = new Map<string, { change_id: string; kind: string; said: string; by: string; at: string; undoes: string | null; on_its_way: boolean; devices: { device: string; state: string; error?: string }[] }>();
  for (const r of changes.results) {
    const entry = byChange.get(r.id) ?? { change_id: r.id, kind: r.kind, said: r.said, by: whoFrom(r.source), at: new Date(r.created_at).toISOString(), undoes: r.undoes, on_its_way: Boolean(r.on_its_way), devices: [] };
    if (r.state) {
      const result = r.result ? (JSON.parse(r.result) as { error?: string }) : {};
      entry.devices.push({ device: r.label ?? "a device no longer registered", state: r.state, ...(result.error ? { error: result.error } : {}) });
    }
    byChange.set(r.id, entry);
  }
  return { text_id: textId, title, on: on.map((d) => d.label), changes: [...byChange.values()] };
}

/** What deleteAccount empties (deliveries before the changes they point to); the files are uploads, which go too. */
export const TEXT_TABLES = ["text_deliveries", "text_changes"];

/** For the account's export: the text changes (what they did; files aren't exported, they're on the devices). */
export async function exportTexts(env: Env, userId: string) {
  const changes = await env.DB.prepare("SELECT id, text_id, kind, said, source, undoes, created_at, body IS NOT NULL AS on_its_way FROM text_changes WHERE user_id = ? ORDER BY seq").bind(userId).all<{ id: string; text_id: string; kind: string; said: string; source: string; undoes: string | null; created_at: number; on_its_way: number }>();
  return changes.results.map((c) => ({ id: c.id, textId: c.text_id, kind: c.kind, said: c.said, by: c.source, undoes: c.undoes, createdAt: c.created_at, onItsWay: Boolean(c.on_its_way) }));
}
