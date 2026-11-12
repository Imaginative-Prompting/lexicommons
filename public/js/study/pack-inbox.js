// Your AI's changes to your packs, on this device. Through the relay (src/packs.ts), this device:
// - says it's here and which packs it has (so your AI's changes come to it too, and list_packs shows it);
// - takes the changes waiting for it, in order, and applies each to its own copy, checking it again (packs.js
//   savePack). A change keeps its id everywhere, and one taken twice changes nothing;
// - sends the account its copy of a pack after a change, for your AI to read (the account never sends it back), then
//   reports how it went (applied; refused, with why; missing: a pack that isn't on this device);
// - runs Undo and deleting a pack through the relay too: the change goes to every device, this one included, and this
//   one takes it like the rest, so a lost answer can't leave your devices apart.
// It's all per account: the relay's state, and which packs of yours it sends (the account's own: made while it was
// signed in, or through its relay; one from before packs had an account goes to the first account to sign in), so a
// second account signed in on the same browser never gets the first one's.
// What a change did is kept before the pack is touched (packs.js keepChange, with the pack as it was), so a page that
// closes mid-change picks up where it was. One round at a time across the device's tabs (a Web Lock).
// A change from your AI shows a toast with Undo. A pack your AI made before this device first opened Lexicommons isn't
// here: the packs page says it's on your other device. While the page is visible and an AI is connected it checks every 5 s
// (every 30 once nobody has touched it for 2 minutes); with none connected, once a minute. Always at once when it comes
// back into view, the network returns or an AI connects, and never while hidden; a check that finds nothing is one 204. It says it's here again at least every 6 hours.
// It remembers (localStorage "lx.pack-inbox.v1", per account) this device's id, the copies it last sent (by their
// content), copies the account refused, and the packs a change named that aren't here ({ id, name }).
// The same round takes the texts your AI adds to your reading library (read/text-inbox.js), so there's one poll.
// Recordings your AI made for a pack (a change of kind "audio": what it set, merged into what the pack has) are taken
// only once every clip the change carries is here: each fetched from where the change serves it while it's on its way,
// kept by its bytes (clips.js); one it can't get yet leaves the change for the next round. A clip from before that this
// device never got comes from your storage (sync.js). The copy the account keeps carries the recordings too.
// With your own storage connected, a copy of a pack can come from another device (sync.js, packs.js): a change the copy
// names among the changes it took is reported applied and not taken again (nor offered for Undo here: what it undoes
// reaches this device the same way), and a pack that was missing here stops being missing once it arrives. The
// account says how far its relay has got (latest, with "I'm here", remembered per account): packs.js takes a copy from
// your storage only up to it.

import { applyChange, inverseOf, withInverse } from "./pack-authoring.js";
import { refreshGrammar } from "./grammar.js";
import { isOurLanguage } from "../lang/index.js";
import { checkAudio, fitAudio, mergeAudio } from "./pack-audio.js";
import { fetchClip } from "./clips.js";
import { allPacks, changesOf, claimPack, deletePack, isPackOn, keepChange, keptChange, loadPacks, onPacksChange, packsBatch, savePack, setPacksAccount, setRelayAsk, setRelayLatest, yourPack, yourPacks } from "./packs.js";
import { deviceLabel } from "../lx/look-sync.js";
import { startTexts, takeText, textsHere } from "../read/text-inbox.js";
import { fetchRetrying, jittered, onReconnect } from "../lx/retry.js";

const KEY = "lx.pack-inbox.v1";
const ACTIVE_MS = 5000;
const IDLE_MS = 30_000;
const IDLE_AFTER_MS = 120_000;
const QUIET_MS = 60_000; // no AI connected: what comes then (a shared pack's accepted fixes) needn't come in seconds
const SAY_HERE_EVERY = 6 * 3600_000;

let account = null;
let state = null;

const newDevice = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 32);

function readAll() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved && typeof saved.accounts === "object") return saved;
  } catch {}
  return { accounts: {} };
}

/** This account's relay state on this device. */
function stateFor(id) {
  const saved = readAll().accounts[id] ?? {};
  const record = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  return {
    device: typeof saved.device === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(saved.device) ? saved.device : newDevice(),
    sent: record(saved.sent),
    shared: Array.isArray(saved.shared) ? saved.shared.filter((id) => typeof id === "string").slice(0, 400) : [],
    rejected: record(saved.rejected),
    missing: Array.isArray(saved.missing) ? saved.missing.filter((m) => typeof m?.id === "string").map((m) => ({ id: m.id, name: String(m.name ?? m.id) })) : [],
    latest: Number.isInteger(saved.latest) && saved.latest > 0 ? saved.latest : 0,
  };
}

/** How far the account's relay has got, as this device knows it (packs.js takes copies from your storage up to it). */
function heardOf(seq) {
  if (!Number.isInteger(seq) || seq <= state.latest) return;
  state.latest = seq;
  setRelayLatest(seq);
  keep();
}

const keep = () => {
  if (!account) return;
  try {
    const all = readAll();
    all.accounts[account] = state;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
};

/** This device's id in the relay (for the account signed in). */
export const deviceId = () => state?.device ?? null;

class SignedOut extends Error {}

// The server's overload is tried again (lx/retry.js): the inbox's read, the device's state (a whole row replaced, so idempotent), any
// other write only when the server says it wasn't applied.
async function call(path, { idempotent = false, ...options } = {}) {
  const response = await fetchRetrying(path, { credentials: "same-origin", cache: "no-store", ...options }, { idempotent });
  if (response.status === 401) throw new SignedOut();
  return response;
}
const send = (method, path, body, { idempotent = false } = {}) =>
  call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), idempotent });
const errorOf = async (response) => (await response.json().catch(() => ({}))).error ?? `${response.status}`;
// The account says no for good (4xx): said once, not tried again every round. Anything else: tried again next round.
const refusedForGood = (response) => response.status >= 400 && response.status < 500;

/** Who made a change, in words: "Claude Code", "your token “cron”", "your iPhone, installed app". */
export function whoMade(source) {
  const [via, ...rest] = String(source ?? "").split(":");
  const name = rest.join(":");
  if (via === "oauth") return name || "Your AI";
  if (via === "pat") return name ? `Your token “${name}”` : "A token";
  if (via === "device") return name ? `Your ${name}` : "Another device";
  if (via === "explore") return "Explore"; // corrections you accepted to a pack you shared (src/packs.ts queueOwnerChange)
  return "Your AI";
}

// ---------- what this device tells the account ----------

const ours = (record) => record?.account === account;
const kindOf = (pack) => (pack.origin?.kind === "yours" ? "yours" : pack.origin?.kind === "follow" ? "follow" : "default");
const packsHere = () =>
  allPacks()
    .filter((pack) => pack.origin?.kind !== "yours" || ours(yourPack(pack.id)))
    .map((pack) => ({ id: pack.id, name: pack.name, language: pack.language, kind: kindOf(pack), on: isPackOn(pack.id), items: pack.items.length }));

let registered = { key: "", at: 0 };
async function register() {
  const body = { device: state.device, label: deviceLabel(), packs: packsHere(), texts: await textsHere().catch(() => []) };
  const key = JSON.stringify(body);
  if (key === registered.key && Date.now() - registered.at < SAY_HERE_EVERY) return;
  const response = await send("PUT", "/api/packs/device", body, { idempotent: true });
  if (!response.ok) throw new Error(`device: ${await errorOf(response)}`);
  const answer = await response.json().catch(() => ({}));
  heardOf(answer?.latest);
  if (Array.isArray(answer?.shared)) {
    state.shared = answer.shared.filter((id) => typeof id === "string").slice(0, 400);
    keep();
  }
  registered = { key, at: Date.now() };
}

// A pack's content, hashed once per change to it (a round checks every pack).
const hashes = new Map();
async function digest(record) {
  const when = `${record.changedAt}:${record.through}`;
  if (hashes.get(record.id)?.when === when) return hashes.get(record.id).hash;
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${record.through}:${JSON.stringify(record.pack)}:${JSON.stringify(record.audio?.manifest ?? null)}`)));
  const hash = [...bytes.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
  hashes.set(record.id, { when, hash });
  return hash;
}

/**
 * Sends the account this device's copy of a pack of yours, if the account doesn't have this one. A pack that's gone
 * here is marked gone there only at the change that took it away (gone: that change's seq). Throws when the account
 * can't be reached, so the round stops and tries again.
 */
async function sendCopy(id, gone) {
  const record = yourPack(id);
  if (record && !ours(record)) return;
  if (!record) {
    if (!gone) return;
    const response = await call(`/api/packs/copies/${encodeURIComponent(id)}?device=${encodeURIComponent(state.device)}&through=${gone}`, { method: "DELETE" });
    if (!response.ok && !refusedForGood(response)) throw new Error(`copy: ${await errorOf(response)}`);
    delete state.sent[id];
    keep();
    return;
  }
  const hash = await digest(record);
  if (state.sent[id] === hash || state.rejected[id] === hash) return;
  const response = await send("PUT", `/api/packs/copies/${encodeURIComponent(id)}`, { device: state.device, through: record.through ?? 0, pack: record.pack, audio: record.audio?.manifest ?? null });
  if (response.ok) state.sent[id] = hash;
  else if (refusedForGood(response)) {
    console.warn(`Lexicommons: the account didn't keep this device's copy of "${id}":`, await errorOf(response));
    state.rejected[id] = hash;
  } else throw new Error(`copy: ${await errorOf(response)}`);
  keep();
}

// Which packs of yours the account keeps a copy of. One made on this device (a deck you added, your own copy of a shared pack) stays
// here until an AI is connected, which works from that copy, or you share it, so a fix you accept in Explore reaches it. One a change
// from your AI made or touched is on the relay already.
const copyGoes = (record) => hasAi() || (record.through ?? 0) > 0 || state.shared.includes(record.id);

const sendCopies = async () => {
  for (const record of yourPacks()) {
    if (!record.account) await claimPack(record.id, account);
    const mine = yourPack(record.id);
    if (ours(mine) && copyGoes(mine)) await sendCopy(record.id);
  }
};

/** A pack of yours was just shared in Explore: its copy goes now. */
export function sharedFromHere(id) {
  if (!state || state.shared.includes(id)) return checkPackInbox();
  state.shared = [...state.shared, id];
  keep();
  return checkPackInbox();
}

// ---------- taking a change ----------

/** Puts a pack back as it was before a change (a change that made it: the pack goes). */
async function restore(target, { by, through, applied }) {
  if (target.inverse) {
    const here = yourPack(target.packId);
    if (!here) return { ok: false, errors: [{ at: "pack", message: "That pack isn't on this device." }], warnings: [] };
    return savePack(withInverse(here.pack, target.inverse), { by, change: target.previous ?? null, through, account, applied, audio: target.beforeAudio });
  }
  if (target.before === null) {
    await deletePack(target.packId, { through, applied });
    return { ok: true };
  }
  // Its recordings as they were then too (a receipt from before receipts kept them: the ones it has, where they fit).
  return savePack(target.before, { by, change: target.previous ?? null, through, account, applied, audio: target.beforeAudio });
}

/** Applies one change to this device's packs: { state, errors?, warnings? }. */
async function apply(relayed, here) {
  const { change } = relayed;
  const by = whoMade(relayed.source);
  const refused = (message) => ({ state: "refused", errors: [{ at: "pack", message }] });
  if (here && !ours(here)) return refused("This device has a pack with that id from another account.");
  if (change.kind === "undo") {
    const target = await keptChange(change.change);
    if (!target && (here?.changes ?? []).includes(change.change)) {
      return refused("This device has that change from another of your devices, through your storage; what the undo leaves comes the same way.");
    }
    if (!target) return here ? refused("This device didn't take that change, so there's nothing here to undo.") : { state: "missing" };
    if (target.state === "undone") return { state: "applied" };
    if (target.outcome !== "applied") return refused("That change wasn't applied on this device.");
    if ((here?.lastChange ?? null) !== target.id) return refused("A later change to this pack came after it; undo that one first.");
    const restored = await restore(target, { by, through: relayed.seq, applied: relayed.id });
    if (!restored.ok) return { state: "refused", errors: restored.errors, warnings: restored.warnings };
    await keepChange({ ...target, state: "undone", undoneBy: relayed.id });
    return { state: "applied" };
  }
  if (change.kind === "delete") {
    // Deleted through the relay: any copy here goes (one restored after a deletion from your storage too), and the
    // deletion is kept as the relay's, here or not, so nothing brings it back or offers to restore it.
    await deletePack(relayed.packId, { through: relayed.seq, applied: relayed.id });
    return { state: "applied" };
  }
  if (change.kind === "audio") {
    if (!here) return { state: "missing" };
    const merged = mergeAudio(here.audio?.manifest ?? null, change, here.pack);
    let audio = null;
    const warnings = [];
    if (merged) {
      const checked = checkAudio(merged, here.pack);
      audio = checked.audio ?? fitAudio(merged, here.pack);
      // What no longer fits this pack here (it moved on since) is left out; anything else wrong turns it down.
      if (!audio) return { state: "refused", errors: checked.errors };
      if (!checked.audio) warnings.push({ at: "audio", message: "Some of the recordings don't fit this pack as it is here, so they're left out." });
    }
    if (await carriedClips(relayed, audio)) warnings.push({ at: "audio", message: "Some recordings didn't arrive whole; they come from your own storage if another device of yours has them." });
    const saved = await savePack(here.pack, { by, change: relayed.id, through: relayed.seq, account, applied: relayed.id, audio });
    return saved.ok ? { state: "applied", warnings: [...warnings, ...(saved.warnings ?? [])] } : { state: "refused", errors: saved.errors, warnings: saved.warnings };
  }
  if (change.kind === "create" && here) return refused(`A pack of yours here already has the id "${relayed.packId}".`);
  if (change.kind !== "create" && !here) return { state: "missing" };
  const attempt = async () => {
    const next = applyChange(here?.pack ?? null, change);
    if (!next.pack) return { state: "refused", errors: next.problems };
    const saved = await savePack(next.pack, { by, change: relayed.id, through: relayed.seq, account, applied: relayed.id });
    if (!saved.ok) return { state: "refused", errors: saved.errors, warnings: saved.warnings };
    return { state: "applied", warnings: saved.warnings };
  };
  const first = await attempt();
  // The server checked it against the language's grammar as it is now: a pattern a newer revision added may not be
  // here yet. Once that grammar is in (study/grammar.js) and what's here is checked again against it, it's tried once
  // more.
  const language = here?.pack.language ?? change.pack?.language;
  if (first.state !== "refused" || typeof language !== "string" || !isOurLanguage(language) || !(await refreshGrammar(language, { orThrow: true }))) return first;
  await loadPacks();
  return attempt();
}

/** Whether a change whose record was left unfinished (the page closed mid-change) did reach the pack. */
async function reached(relayed, here) {
  if (relayed.kind === "delete") return !here;
  if (relayed.kind !== "undo") return here?.lastChange === relayed.id;
  const target = await keptChange(relayed.change.change);
  if (!target) return false;
  if (target.state === "undone") return true;
  // Restored, but not yet marked undone.
  if (target.outcome === "applied" && (here?.lastChange ?? null) === target.previous && (here?.through ?? 0) >= relayed.seq) {
    await keepChange({ ...target, state: "undone", undoneBy: relayed.id });
    return true;
  }
  return false;
}

let notify = () => {};

// The clips an audio change carries that the recordings name, here first (the server keeps them only while the change
// is on its way): one that can't be fetched yet throws, leaving the change for the next round; one the server hasn't,
// or sent wrong, is left to your own storage. Resolves to how many were gone.
async function carriedClips(relayed, audio) {
  const carried = new Set(Array.isArray(relayed.change?.clips) ? relayed.change.clips : []);
  let gone = 0;
  for (const voice of Object.values(audio?.voices ?? {})) {
    for (const { clip } of [...Object.values(voice.items ?? {}), ...Object.values(voice.words ?? {})]) {
      if (!carried.delete(clip)) continue;
      const got = await fetchClip(clip, `/api/packs/changes/${encodeURIComponent(relayed.id)}/clips/${clip}`);
      if (got === "failed") throw new Error(`recording ${clip} can't be fetched yet`);
      if (got === "gone") gone++;
    }
  }
  return gone;
}

async function take(relayed) {
  let receipt = await keptChange(relayed.id);
  const copy = yourPack(relayed.packId);
  heardOf(relayed.seq);
  // (Never a delete: it's taken whatever a copy says, so a pack restored here after it goes again.)
  // The copy's sequence covers older changes too, after their ids fall out of its short history.
  const inCopy = !receipt && relayed.kind !== "delete" && Boolean(copy) && ours(copy) && ((copy.through ?? 0) >= relayed.seq || (copy.changes ?? []).includes(relayed.id));
  // A copy from your storage with your AI's recordings in it still takes the clips the change carries before it's
  // reported (that report lets the server delete them).
  if (inCopy && relayed.kind === "audio") await carriedClips(relayed, copy.audio?.manifest);
  if (inCopy) receipt = { outcome: "applied", errors: [], warnings: [] };
  const fresh = !receipt?.outcome;
  if (fresh) {
    const here = yourPack(relayed.packId);
    if (receipt && (await reached(relayed, here))) receipt = { ...receipt, outcome: "applied", state: "applied" };
    else {
      // Kept before the pack is touched, with the pack as it was (what Undo puts back).
      const inverse = inverseOf(here?.pack ?? null, relayed.change);
      receipt = {
        id: relayed.id,
        packId: relayed.packId,
        kind: relayed.kind,
        said: relayed.said,
        source: relayed.source,
        seq: relayed.seq,
        at: Date.now(),
        outcome: null,
        state: "applying",
        // Only what it touches where that's all it takes to put back: a whole pack per change is a lot to hold on a phone.
        ...(inverse ? { inverse } : { before: here?.pack ?? null }),
        beforeAudio: here?.audio?.manifest ?? null,
        previous: here?.lastChange ?? null,
        errors: [],
        warnings: [],
      };
      await keepChange(receipt);
      const result = await apply(relayed, here);
      // A few are enough to say what's wrong: a big pack's can run to hundreds of KB, and this is kept for each change.
      receipt = { ...receipt, outcome: result.state, state: result.state, errors: (result.errors ?? []).slice(0, 5), warnings: (result.warnings ?? []).slice(0, 5) };
    }
    await keepChange(receipt);
    if (receipt.outcome === "missing" && !state.missing.some((m) => m.id === relayed.packId)) state.missing.push({ id: relayed.packId, name: relayed.packName ?? relayed.packId });
    if (receipt.outcome === "applied") state.missing = state.missing.filter((m) => m.id !== relayed.packId);
    keep();
  }
  // The account's copy first: once every device has reported, the change's content goes.
  // A missing or refused change didn't remove a pack, so it mustn't delete the account's copy.
  await sendCopy(relayed.packId, receipt.outcome === "applied" && !yourPack(relayed.packId) ? relayed.seq : undefined);
  const response = await send("POST", `/api/packs/changes/${encodeURIComponent(relayed.id)}/report`, { device: state.device, state: receipt.outcome, errors: receipt.errors, warnings: receipt.warnings });
  if (!response.ok && !refusedForGood(response)) throw new Error(`report: ${await errorOf(response)}`);
  if (!response.ok) console.warn(`Lexicommons: the account didn't take this device's report on ${relayed.id}:`, await errorOf(response));
  // A toast for what your AI did (what you did in the app says so where you did it).
  if (!fresh || relayed.source.startsWith("device:")) return;
  const who = whoMade(relayed.source);
  if (receipt.outcome === "applied" && relayed.kind !== "undo" && relayed.kind !== "delete") notify("right", `${who} ${relayed.said}`, () => undoPackChange(relayed.id));
  else if (receipt.outcome === "applied") notify("right", `${who} ${relayed.said}`);
  else if (receipt.outcome === "refused") notify("wrong", `${who}'s change didn't pass the check here, so it wasn't applied: ${receipt.errors[0]?.message ?? ""}`);
}

/** One round: say what's here, send changed copies, take what's waiting. Resolves to how many changes it took. */
async function round() {
  await register();
  await sendCopies();
  const response = await call(`/api/packs/inbox?device=${encodeURIComponent(state.device)}`);
  if (response.status === 204) return 0;
  if (!response.ok) throw new Error(`inbox: ${await errorOf(response)}`);
  const { changes, texts = [] } = await response.json();
  // What another tab of this device did is in storage: read it before changing anything.
  await loadPacks();
  // A round's changes told once (packs.js packsBatch): an AI's four packs and a deck made a whole view each, one after another.
  await packsBatch(async () => {
    for (const relayed of changes) await take(relayed);
  });
  for (const relayed of texts) await takeText(relayed, { device: state.device, send, notify });
  await register();
  return changes.length + texts.length;
}

// One round at a time on this device: across its tabs where the browser can lock, within this tab always.
const exclusive = (fn) => (navigator.locks?.request ? navigator.locks.request(`lx-pack-inbox:${account}`, fn) : fn());

let chain = Promise.resolve(0);
let stopped = false;
let hasAi = () => true;
let status = { at: 0, ok: true, error: null };

/** Runs a round now (after any running one). Resolves to how many changes it took. */
export function checkPackInbox() {
  chain = chain
    .then(() => (stopped || !account ? 0 : exclusive(round)))
    .then(
      (count) => {
        status = { at: Date.now(), ok: true, error: null };
        return count;
      },
      (error) => {
        if (error instanceof SignedOut) stopped = true;
        status = { at: Date.now(), ok: false, error: error.message };
        return 0;
      },
    );
  return chain;
}

/** How the last round went: { at, ok, error }. */
export const packInboxStatus = () => ({ ...status });

/** Packs a change from your AI named that aren't on this device (made before it first opened Lexicommons): [{ id, name }]. */
export const missingPacks = () => (state?.missing ?? []).filter((m) => !yourPack(m.id)).map((m) => ({ ...m }));

// ---------- from the app: Undo, and deleting a pack ----------

/**
 * Undoes a change on every device, this one included: the relay says first whether it can (the latest change to a
 * pack comes first), then this device takes the undo as the others do. Resolves to { ok, error? }.
 */
export async function undoPackChange(id) {
  const target = await keptChange(id);
  if (!target || target.outcome !== "applied" || target.state !== "applied") return { ok: false, error: "That change can't be undone on this device." };
  if ((yourPack(target.packId)?.lastChange ?? null) !== target.id) return { ok: false, error: "A later change to this pack came after it: undo that one first." };
  // Made on this device alone: put back here, with or without a connection.
  if (target.here) {
    const here = yourPack(target.packId);
    const saved = await restore(target, { by: here?.by });
    if (!saved.ok) return { ok: false, error: saved.errors?.[0]?.message ?? "It couldn't be put back." };
    await keepChange({ ...target, state: "undone" });
    return { ok: true };
  }
  let response;
  try {
    response = await send("POST", "/api/packs/changes", { label: deviceLabel(), kind: "undo", change: id });
  } catch {
    return { ok: false, error: "Undo needs a connection, so your other devices undo it too." };
  }
  if (!response.ok) return { ok: false, error: await errorOf(response) };
  await checkPackInbox();
  const after = await keptChange(id);
  return after?.state === "undone" ? { ok: true } : { ok: false, error: "The undo is on its way, but this device hasn't taken it yet; it will next time it checks." };
}

/**
 * Deletes a pack of yours on every device, this one included (it takes the delete as the others do). Offline, it goes
 * from this device only. Resolves to { everywhere }.
 */
export async function deletePackEverywhere(id) {
  const here = yourPack(id);
  try {
    const response = await send("POST", "/api/packs/changes", { label: deviceLabel(), kind: "delete", packId: id, name: here?.pack.name });
    if (response.ok) {
      await checkPackInbox();
      if (!yourPack(id)) return { everywhere: true };
    }
  } catch {}
  await deletePack(id);
  return { everywhere: false };
}

// ---------- from the app: changing a pack of yours ----------

/** Whether a pack of yours lives on the account too, so a change to it goes to your other devices through the relay. */
export const packOnAccount = (id) => {
  const record = yourPack(id);
  return Boolean(record && state && copyGoes(record));
};

/** Whether a pack of yours has been shared in Explore from this device. */
export const packSharedHere = (id) => Boolean(state?.shared.includes(id));

const changeId = () => `chg_${[...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;

// On this device alone: the same applyChange and check as any other change (savePack), and what Undo needs. It reaches your other devices
// only through your own storage, as a pack made here does.
async function changeHere(here, change, said) {
  const next = applyChange(here.pack, change);
  if (!next.pack) return { ok: false, errors: next.problems };
  const entry = {
    id: changeId(),
    packId: here.id,
    kind: change.kind,
    said,
    source: `device:${deviceLabel()}`,
    here: true,
    seq: null,
    at: Date.now(),
    outcome: null,
    state: "applying",
    inverse: inverseOf(here.pack, change),
    previous: here.lastChange ?? null,
    errors: [],
    warnings: [],
  };
  await keepChange(entry);
  const saved = await savePack(next.pack, { by: here.by, change: entry.id });
  if (!saved.ok) {
    await keepChange({ ...entry, outcome: "refused", state: "refused", errors: saved.errors });
    return { ok: false, errors: saved.errors };
  }
  // The recordings as they were, only if this took some away (a rewritten sentence's).
  const manifest = (record) => JSON.stringify(record?.audio?.manifest ?? null);
  const changedAudio = manifest(here) !== manifest(yourPack(here.id));
  await keepChange({ ...entry, outcome: "applied", state: "applied", ...(changedAudio ? { beforeAudio: here.audio?.manifest ?? null } : {}) });
  return { ok: true, changeId: entry.id };
}

// On the account too: through the relay to every device, this one included, as your AI's changes and Undo go.
async function changeThroughRelay(here, change, said) {
  let response;
  try {
    await sendCopy(here.id);
    response = await send("POST", "/api/packs/changes", { label: deviceLabel(), packId: here.id, said, ...change });
  } catch {
    return { ok: false, offline: true, errors: [{ at: "pack", message: "Saving this pack needs a connection, so your other devices get it too." }] };
  }
  if (!response.ok) return { ok: false, errors: [{ at: "pack", message: await errorOf(response) }] };
  const answer = await response.json();
  if (!answer.ok) return { ok: false, errors: answer.errors ?? [] };
  await checkPackInbox();
  if (!(await keptChange(answer.changeId))?.outcome) await checkPackInbox();
  const after = await keptChange(answer.changeId);
  if (after?.outcome === "applied") return { ok: true, changeId: answer.changeId };
  if (after?.outcome === "refused") return { ok: false, errors: after.errors };
  return { ok: true, changeId: answer.changeId, onItsWay: true };
}

/**
 * A change to a pack of yours, pressed in the app: { kind: "add" | "update" | "remove", items | ids }, with said (what it did, for its history).
 * Resolves to { ok, changeId?, onItsWay?, offline?, errors? }.
 */
export async function changePack(id, change, said) {
  const here = yourPack(id);
  if (!here) return { ok: false, errors: [{ at: "pack", message: "That pack isn't on this device." }] };
  if (here.account && !ours(here)) return { ok: false, errors: [{ at: "pack", message: "That pack belongs to another account on this device." }] };
  return (state && copyGoes(here) ? changeThroughRelay : changeHere)(here, change, said);
}

/** The changes a pack took here, newest first, each with whether it can be undone now. */
export async function packChanges(packId) {
  const here = yourPack(packId);
  return (await changesOf(packId))
    .filter((entry) => entry.outcome)
    .map((entry) => ({ ...entry, who: entry.source === `device:${deviceLabel()}` ? "You" : whoMade(entry.source), mine: String(entry.source).startsWith("device:"), canUndo: entry.state === "applied" && entry.kind !== "undo" && entry.kind !== "delete" && (here?.lastChange ?? null) === entry.id }));
}

// ---------- running ----------

let started = false;

/**
 * Starts taking changes for the account signed in (once per page). notify(meaning, text, undo?) shows a toast; undo
 * resolves to { ok, error? }.
 */
export function startPackInbox({ account: id, notify: show, aiConnected, onAiChange } = {}) {
  if (started || typeof document === "undefined" || !id) return;
  started = true;
  if (aiConnected) hasAi = aiConnected;
  account = id;
  setPacksAccount(id);
  state = stateFor(id);
  setRelayLatest(state.latest);
  // A copy from your storage waiting on how far the relay has got: say it's here now, which hears it.
  setRelayAsk(() => {
    registered = { key: "", at: 0 };
    checkPackInbox();
  });
  keep();
  if (show) notify = show;
  startTexts({ account: id, check: checkPackInbox });
  let lastInput = Date.now();
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    // No page any more (a test's stand-in taken away, a worker): no next round.
    if (typeof document === "undefined" || document.hidden || stopped) return;
    timer = setTimeout(tick, jittered(!hasAi() ? QUIET_MS : Date.now() - lastInput < IDLE_AFTER_MS ? ACTIVE_MS : IDLE_MS));
  };
  const tick = () => checkPackInbox().finally(schedule);
  // An AI just connected: a round now, then at its pace.
  let hadAi = hasAi();
  onAiChange?.(() => {
    const now = hasAi();
    if (now && !hadAi) tick();
    hadAi = now;
  });
  for (const event of ["pointerdown", "keydown"]) addEventListener(event, () => (lastInput = Date.now()), { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? clearTimeout(timer) : tick()));
  // Back online: a round within 30 s, not at once (every app on a network that blinked comes back together).
  onReconnect(tick);
  // A pack turned on or off, or one that arrived from the library: say so with the next round.
  onPacksChange(() => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(tick, 800);
  });
  tick();
}
