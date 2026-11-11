// Your own storage keeping what's yours the same on every device (storage.js: Google Drive's hidden app-data folder,
// Dropbox's Apps/Lexicommons, OneDrive's app folder). The connection lives on the device, and nothing passes through
// Lexicommons' server.
// Each kind of data registers itself (registerSync) and gives its records by key: { at, value } for what's there, or
// { at, gone: true, about? } for a deletion, so a sync never brings it back (about: what the kind needs to order it).
// Deletions are kept for good: they're small, and a device away for months mustn't bring back what was deleted.
// Files: every device writes only its own, lexicommons-<kind>[.<shard>].<account>.<device>.json ({ format, version,
// kind, account, records }; account: 8 hex of a hash of the account's id, so two accounts on one browser never mix;
// device: 8 random hex kept on this browser), and reads everyone's. With one writer to a file, no write is ever lost to
// another device's; each file holds everything its device has, so a device that's gone leaves its copy behind. A kind
// may split its records into shards by key (study progress does, by month), so a sync reads only the files that
// changed since it last read them.
// Merging: for each key the newer record wins (by its device's clock: a device whose clock runs ahead wins a tie it
// shouldn't), then a deletion, then the larger JSON; a kind may order its records itself (prefer, as packs do by the
// changes from your AI they took), and may settle a merge (settle: study progress drops what a clear covers).
// What arrives is untrusted (anyone who can write to that folder can write a file): nothing in it runs, a file past
// SYNC_LIMITS isn't read, a record the kind's check turns down takes no part in the merge, stays in its own file and
// never reaches this device's, and one dated more than a day ahead of this device's clock waits until it isn't (so a
// made-up time can't win for long). Keys arrive untrusted too: a kind checks them before using one.
// Blobs (registerBlobs): things too big for records, such as a pack's recordings, are files of their own, each named
// by its content, lexicommons-<kind>.<account>.<name>: written once by whichever device has one the storage hasn't,
// read by a device that wants one it hasn't, and kept only if the kind says its bytes are its name (keep checks).
// When: once started (startSync, after signing in), a few seconds after a kind says it changed, on coming back to the
// app, when the network returns, every 15 minutes, and on Sync now (Settings → Storage). One sync at a time, across the
// device's tabs.

import { isConnected, listFiles, PROVIDERS, readFile, sha256Hex, signInEnded, writeFile } from "./storage.js";
import { sampleOn } from "./study/sample-mode.js";
import { onReconnect } from "./lx/retry.js";

export const SYNC_FORMAT = "lexicommons-sync";
export const SYNC_VERSION = 1;
export const SYNC_TIMING = {
  afterChange: 5_000,
  every: 15 * 60_000,
  onReturn: 60_000, // coming back to the app syncs when the last sync is older than this
};
export const SYNC_LIMITS = {
  fileBytes: 32 * 1024 * 1024, // a file bigger than this isn't read
  records: 250_000, // records in one file
  key: 200, // characters in a key
  depth: 24, // how deep a value nests
  files: 2_000, // files of one kind read in one sync (its devices × its shards)
  ahead: 86_400_000, // a record dated further ahead of this device's clock than this waits
  blobBytes: 8 * 1024 * 1024, // a blob file bigger than this isn't read (a kind can say less: maxBytes)
  blobReads: 200, // blob files read in one sync (the rest wait for the next)
};
const STATE_KEY = "lx.sync.v1";
const DEVICE_KEY = "lx.sync.device.v1";
const TRIES = 4; // a write that clashes (another browser with this device's id) is listed and written again

const kinds = new Map();
const blobKinds = new Map();
const listeners = new Set();
let accountTag = null;
let status = { syncing: false, at: null, error: null, kinds: {}, targets: {} };

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
/** A map from keys to records with no prototype, so no key ("__proto__") means anything but itself. */
const records = () => Object.create(null);

/** JSON with its keys in order (two equal values compare equal, whatever order their keys came in). */
export function canonical(value, depth = 0) {
  if (depth > SYNC_LIMITS.depth + 4) throw new Error("nested too deep");
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v, depth + 1)).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k], depth + 1)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A short hash of a text (53 bits, hex): for telling whether something changed, not for security. */
export function hashText(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

// ---------- records and the merge (pure) ----------

/** How deep a JSON value nests (stopping once past the limit). */
function depthOf(value, depth = 0) {
  if (depth > SYNC_LIMITS.depth || !value || typeof value !== "object") return depth;
  let most = depth;
  for (const v of Array.isArray(value) ? value : Object.values(value)) {
    most = Math.max(most, depthOf(v, depth + 1));
    if (most > SYNC_LIMITS.depth) break;
  }
  return most;
}

/** Whether a record is well formed: { at, value } or { at, gone: true, about? }, its value within SYNC_LIMITS. */
export const isRecord = (record) =>
  isObject(record) &&
  Number.isFinite(record.at) &&
  (record.gone === true ? !("value" in record) && (record.about === undefined || isObject(record.about)) : record.gone === undefined && "value" in record && record.value !== undefined) &&
  depthOf(record.gone ? record.about : record.value) <= SYNC_LIMITS.depth;

const tidy = (record) => (record.gone ? { at: record.at, gone: true, ...(record.about ? { about: record.about } : {}) } : { at: record.at, value: record.value });

/** The record that wins for one key: the newer, then the deletion, then the larger JSON. */
export function winner(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.at !== b.at) return a.at > b.at ? a : b;
  if (Boolean(a.gone) !== Boolean(b.gone)) return a.gone ? a : b;
  return canonical(a) >= canonical(b) ? a : b;
}

const winnerFor = (kind) => (a, b) => (!a ? b : !b ? a : kind?.prefer ? kind.prefer(a, b) : winner(a, b));

/** Sets of records ({ key: record }) merged key by key (in a kind's own order, if it has one). */
export function mergeRecords(a, b, kind) {
  const pick = winnerFor(kind);
  const out = records();
  for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) out[key] = pick(a?.[key], b?.[key]);
  return out;
}

/** The records in `merged` this device should take: ones it hasn't got, or whose own record loses to them. */
export function newerThan(merged, local, kind) {
  const pick = winnerFor(kind);
  const out = records();
  for (const key of Object.keys(merged)) {
    const mine = local[key];
    const theirs = merged[key];
    if (!mine || (pick(mine, theirs) === theirs && canonical(mine) !== canonical(theirs))) out[key] = theirs;
  }
  return out;
}

const SHARD = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DEVICE = /^[0-9a-f]{8}$/;
const shardOf = (kind, key) => {
  const shard = kind.shard ? kind.shard(key) : "";
  return typeof shard === "string" && SHARD.test(shard) ? shard : "";
};

/**
 * A file's records as this device may take them: { records (well formed, in the file's shard, and passing the kind's
 * check), refused (how many the check turned down), dropped (how many weren't records of the file), early (how many are
 * dated too far ahead, for now) }. A file that isn't this kind's and account's, or past SYNC_LIMITS, counts as one
 * dropped.
 */
export function readRecords(text, kind, tag, shard = "", now = Date.now()) {
  const none = { records: records(), refused: 0, dropped: 1, early: 0 };
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return none;
  }
  if (!isObject(file) || file.format !== SYNC_FORMAT || file.version !== SYNC_VERSION || file.kind !== kind.id || file.account !== tag || !isObject(file.records)) return none;
  const keys = Object.keys(file.records);
  if (keys.length > SYNC_LIMITS.records) return none;
  const out = records();
  let refused = 0;
  let dropped = 0;
  let early = 0;
  for (const key of keys) {
    const record = file.records[key];
    if (key.length > SYNC_LIMITS.key || !isRecord(record) || shardOf(kind, key) !== shard) {
      dropped++;
      continue;
    }
    const kept = tidy(record);
    if (kept.at > now + SYNC_LIMITS.ahead) early++;
    else if (kind.check && !kind.check(kept, key)) refused++;
    else out[key] = kept;
  }
  return { records: out, refused, dropped, early };
}

/** A file's text for a kind's records. */
export const fileText = (kind, tag, kept) => JSON.stringify({ format: SYNC_FORMAT, version: SYNC_VERSION, kind: kind.id, account: tag, records: kept });

const fileName = (kindId, shard, tag, device) => `lexicommons-${kindId}${shard ? `.${shard}` : ""}.${tag}.${device}.json`;
/** A file name's parts for a kind and account: { shard, device }, or null when it isn't one of theirs. */
function nameParts(name, kind, tag) {
  const match = /^lexicommons-([a-z][a-z0-9-]{1,40})(?:\.([a-z0-9][a-z0-9-]{0,63}))?\.([0-9a-f]{8})\.([0-9a-f]{8})\.json$/.exec(name);
  if (!match || match[1] !== kind.id || match[3] !== tag) return null;
  const shard = match[2] ?? "";
  if (shard && !kind.shards?.test(shard)) return null;
  return { shard, device: match[4] };
}

/**
 * Syncs kinds with one storage ({ list() → [{ name, version, size }], read(name) → text, write(name, text,
 * { version }) → { version } }) as this account (tag) and device: every other device's file of a kind that changed
 * since it was last read is read, what's newer in it handed to the kind, and this device's own file written when what
 * it has changed. remembered ({ [file]: { version, hash? } }, kept between syncs with this storage) is updated here.
 * Returns per kind { took, sent, read, refused, dropped, error }.
 */
export async function syncWith(store, tag, device, remembered = {}, list = [...kinds.values()], now = Date.now(), blobs = [...blobKinds.values()]) {
  const listing = async () => new Map((await store.list()).map((f) => [f.name, { version: f.version ?? null, size: Number(f.size) || 0 }]));
  let files = await listing();
  const report = {};
  for (const kind of list) {
    const result = { took: 0, sent: 0, read: 0, refused: 0, dropped: 0, count: null, error: null };
    report[kind.id] = result;
    // A clash on this device's own file (another browser with its id wrote it): listed again, and the kind synced again,
    // so what was written there is read before it's written over.
    for (let attempt = 1; ; attempt++) {
      try {
        await syncKind(kind);
        break;
      } catch (error) {
        if (error?.conflict && attempt < TRIES) {
          files = await listing();
          continue;
        }
        result.error = error?.message ?? String(error);
        break;
      }
    }
  }
  // Blobs, after the records (which say which ones are wanted). One this device has goes up if the storage hasn't it;
  // one the storage has that isn't what its name says (its size isn't this device's, or, read once per version, its
  // bytes) is put right with this device's own; one it wants and hasn't comes down, kept only if the kind's keep checks
  // it. A file refused once isn't read again until it changes.
  for (const kind of blobs) {
    const result = { up: 0, down: 0, repaired: 0, refused: 0, error: null };
    report[`blobs:${kind.id}`] = result;
    try {
      await kind.refresh?.();
      files = await listing();
      const limit = Math.min(kind.maxBytes ?? SYNC_LIMITS.blobBytes, SYNC_LIMITS.blobBytes);
      const prefix = `lexicommons-${kind.id}.${tag}.`;
      const wanted = new Set((await kind.wanted()).filter((name) => typeof name === "string" && kind.names.test(name)));
      // What's remembered of blobs no longer wanted goes, so it's never more than what's wanted.
      for (const file of Object.keys(remembered)) if (file.startsWith(prefix) && !wanted.has(file.slice(prefix.length))) delete remembered[file];
      let reads = 0;
      for (const name of wanted) {
        const file = prefix + name;
        const listed = files.get(file);
        const known = remembered[file];
        const seen = listed && known?.version === listed.version;
        if (kind.has(name)) {
          if (seen && known.checked) continue;
          const blob = await kind.read(name);
          if (!blob) continue;
          if (listed && listed.size === blob.size) {
            if (reads >= SYNC_LIMITS.blobReads) continue;
            reads++;
            if (await kind.check(name, await store.readBlob(file))) {
              remembered[file] = { version: listed.version, checked: true };
              continue;
            }
          }
          try {
            const written = await store.writeBlob(file, blob, { version: listed ? listed.version : null });
            remembered[file] = { version: written?.version ?? null, checked: true };
            if (listed) result.repaired++;
            else result.up++;
          } catch (error) {
            // Another device wrote it first, or put it right: it's looked at again next time.
            if (!error?.conflict) throw error;
          }
        } else if (listed) {
          if (seen && known.refused) continue;
          if (listed.size > limit) {
            remembered[file] = { version: listed.version, refused: true };
            result.refused++;
            continue;
          }
          if (reads >= SYNC_LIMITS.blobReads) continue;
          reads++;
          const blob = await store.readBlob(file);
          if (!(await kind.check(name, blob))) {
            remembered[file] = { version: listed.version, refused: true };
            result.refused++;
          } else if (await kind.keep(name, blob)) {
            remembered[file] = { version: listed.version, checked: true };
            result.down++;
          }
          // (Right, but not kept here now (no room, say): read again at the next sync.)
        }
      }
    } catch (error) {
      result.error = error?.message ?? String(error);
    }
  }
  return report;

  async function syncKind(kind) {
    const result = report[kind.id];
    // What the kind needs first (study progress: your account's clears); without it, the rest still syncs.
    if (kind.prepare) {
      try {
        await kind.prepare();
      } catch (error) {
        result.error = error?.message ?? String(error);
      }
    }
    let local = records();
    for (const [key, record] of Object.entries(await kind.records())) if (key.length <= SYNC_LIMITS.key && isRecord(record)) local[key] = tidy(record);
    // This device's records by shard, and every shard any device has a file for.
    const shards = new Map();
    const shardOfSet = (shard) => shards.get(shard) ?? shards.set(shard, []).get(shard);
    for (const key of Object.keys(local)) shardOfSet(shardOf(kind, key));
    let counted = 0;
    for (const name of [...files.keys()].sort()) {
      const parts = nameParts(name, kind, tag);
      if (!parts) continue;
      if (++counted > SYNC_LIMITS.files) {
        result.error = `More than ${SYNC_LIMITS.files} files of it; the rest weren't read.`;
        break;
      }
      shardOfSet(parts.shard).push({ name, device: parts.device });
    }
    // Every file that changed since it was last read, this device's own too (another browser with its id).
    const incoming = records();
    const readFrom = new Map(); // file → the keys it gave
    for (const [shard, named] of shards) {
      for (const { name } of named) {
        const listed = files.get(name);
        const seen = remembered[name];
        if (seen && listed.version !== null && seen.version === listed.version) continue;
        if (listed.size > SYNC_LIMITS.fileBytes) {
          result.dropped++;
          result.error ??= `${name} is too big to read (${Math.round(listed.size / 1048576)} MB).`;
          continue;
        }
        const got = readRecords(await store.read(name), kind, tag, shard, now);
        result.read++;
        result.refused += got.refused;
        result.dropped += got.dropped;
        // A file with records dated ahead is read again next time, when they may be due.
        readFrom.set(name, got.early ? null : Object.keys(got.records));
        for (const key of Object.keys(got.records)) incoming[key] = winnerFor(kind)(incoming[key], got.records[key]);
      }
    }
    // A relay change or an edit may have landed while files were being read; merge against what is here now.
    local = records();
    for (const [key, record] of Object.entries(await kind.records())) if (key.length <= SYNC_LIMITS.key && isRecord(record)) local[key] = tidy(record);
    for (const key of Object.keys(local)) shardOfSet(shardOf(kind, key));
    const merged = mergeRecords(local, incoming, kind);
    const take = newerThan(merged, local, kind);
    const turnedDown = new Set(Object.keys(take).length ? ((await kind.apply(take)) ?? []) : []);
    result.took = Object.keys(take).filter((key) => !turnedDown.has(key)).length;
    // A file with records the kind turned down is read again next time (they may pass then); the rest are done.
    for (const [name, keys] of readFrom) {
      if (keys && !keys.some((key) => turnedDown.has(key))) remembered[name] = { ...remembered[name], version: files.get(name).version };
    }
    // What this device has now (as the kind settles it), written to its own file per shard when that changed.
    const held = records();
    for (const key of Object.keys(merged)) {
      const record = turnedDown.has(key) ? local[key] : merged[key];
      if (record) held[key] = record;
    }
    const settled = kind.settle ? Object.assign(records(), kind.settle(held)) : held;
    // How many it has now, for Settings → Sync across devices: from the merged result as the kind settles it (what records() gives after
    // the merge), so no count reads every record again after the sync.
    result.count = Object.values(settled).filter((record) => !record.gone).length;
    for (const shard of shards.keys()) {
      const own = fileName(kind.id, shard, tag, device);
      const kept = records();
      for (const key of Object.keys(settled)) if (shardOf(kind, key) === shard) kept[key] = settled[key];
      if (!Object.keys(kept).length && !files.has(own)) continue;
      const text = fileText(kind, tag, kept);
      // Never replace a readable file with one every other device would refuse.
      if (new Blob([text]).size > SYNC_LIMITS.fileBytes) throw new Error(`${own} is too big to sync.`);
      const hash = hashText(text);
      if (files.has(own) && remembered[own]?.hash === hash && remembered[own]?.version === files.get(own).version) continue;
      const written = await store.write(own, text, { version: files.get(own)?.version ?? null });
      remembered[own] = { version: written?.version ?? null, hash };
      result.sent++;
    }
  }
}

// ---------- the app's side ----------

/**
 * A kind of data that syncs: { id, label, icon?, counted?(n), records() → { key: record }, apply(newer) → [keys it
 * turned down]?, onChange?(fn), check?(record, key), shard?(key), shards?, prefer?(a, b), settle?(held), prepare?() }.
 *   id        lowercase letters, digits and dashes (it names the files)
 *   label, icon (icons.js), counted (how a count of its records reads, "12 answers"): how Settings → Storage lists it
 *   records   this device's records, deletions included; apply gets the ones newer than them
 *   check     whether a record from another device may ever be taken (the whole record, and its key: both untrusted);
 *             one that may only later (it waits on something) is for apply to turn down, so it's tried again
 *   shard     the shard a key belongs to ("" for none), and shards: a RegExp every shard's name must match
 *   prefer    which of two records for one key wins (a deterministic order; the default is winner)
 *   settle    what this device has, as its own file keeps it (study progress leaves out what a clear covers)
 *   prepare   anything to do before each sync (study progress takes your account's clears)
 */
export function registerSync(kind) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(kind?.id ?? "") || typeof kind.records !== "function" || typeof kind.apply !== "function") {
    throw new Error("A sync kind needs an id, records() and apply().");
  }
  kinds.set(kind.id, kind);
  kind.onChange?.(() => soon());
  status.kinds[kind.id] = { count: null, at: null, error: null, ...status.kinds[kind.id] };
}

/**
 * Blobs that sync as files of their own: { id, names (a RegExp every name matches), wanted() → [names] (the ones this
 * device's records name), has(name), read(name) → Blob, check(name, blob) → whether the bytes are what the name says,
 * keep(name, blob) → whether it kept it (checking them too), refresh() (optional: learn again what's here, before each
 * sync), maxBytes (optional: the most one can be) }.
 */
export function registerBlobs(kind) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(kind?.id ?? "") || !(kind.names instanceof RegExp) || ["wanted", "has", "read", "check", "keep"].some((f) => typeof kind[f] !== "function")) {
    throw new Error("A blob kind needs an id, names, wanted(), has(), read(), check() and keep().");
  }
  blobKinds.set(kind.id, kind);
}

/** The storages connected on this device: [{ id, name }]. */
export const syncTargets = () =>
  Object.entries(PROVIDERS)
    .filter(([id]) => isConnected(id))
    .map(([id, name]) => ({ id, name }));

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null");
    if (isObject(saved)) return saved;
  } catch {}
  return {};
}
function keepState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}
/** This browser's device id in the files' names (8 hex, made once), or null when the browser keeps nothing. Reminders
 * (push.js) name the device by it too. */
export function deviceTag() {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && DEVICE.test(saved)) return saved;
    const made = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_KEY, made);
    return localStorage.getItem(DEVICE_KEY) === made ? made : null;
  } catch {
    return null;
  }
}

const tell = () => listeners.forEach((fn) => fn(syncStatus()));
/** Calls fn(status) when a sync starts or ends. Returns a function to stop. */
export function onSyncStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Where syncing stands: { started, syncing, at (when every connected storage last synced, ms), error, targets:
 * [{ id, name, at, error }], kinds: [{ id, label, icon, counted, count (this device's records, deletions aside), at,
 * error }] }.
 */
export function syncStatus() {
  return {
    started: Boolean(accountTag),
    syncing: status.syncing,
    at: status.at,
    error: status.error,
    targets: syncTargets().map((t) => ({ ...t, at: status.targets[t.id]?.at ?? null, error: status.targets[t.id]?.error ?? null })),
    kinds: [...kinds.values()].map((k) => ({ id: k.id, label: k.label, icon: k.icon, counted: k.counted, ...status.kinds[k.id] })),
  };
}

const adapter = (provider) => ({
  list: () => listFiles(provider),
  read: async (name) => (await readFile(provider, name)).text(),
  write: (name, text, options) => writeFile(provider, name, new Blob([text], { type: "application/json" }), "application/json", options),
  readBlob: (name) => readFile(provider, name),
  writeBlob: (name, blob, options) => writeFile(provider, name, blob, blob.type || "application/octet-stream", options),
});

/** How many records of a kind this device has, deletions aside: what Settings → Sync across devices shows, "N on this device". */
export async function localCount(id) {
  return Object.values(await kinds.get(id).records()).filter((r) => !r.gone).length;
}
// Every kind's records counted again (or those not in `skip`).
async function count(skip = new Set()) {
  for (const kind of kinds.values()) {
    if (skip.has(kind.id)) continue;
    try {
      status.kinds[kind.id].count = await localCount(kind.id);
    } catch {}
  }
}

let running = null;
let again = false;
/**
 * Syncs now with every connected storage (one sync at a time; one asked for during it follows). Resolves to the status. quietly: the app's
 * own syncs (after a change, every 15 minutes, coming back): with no storage connected there's nothing to sync, so nothing is counted either
 * (a learner months in has 50,000 records; counting them after every answer and pack switch was a long task each). Settings → Sync across
 * devices asks without it, and counts.
 */
export function syncNow({ quietly = false } = {}) {
  // The sample learner's progress never reaches your storage, nor yours this device: nothing syncs while it's on (study/sample-mode.js).
  if (sampleOn()) {
    status = { ...status, syncing: false, error: "Paused while the sample learner is on." };
    tell();
    return Promise.resolve(syncStatus());
  }
  if (!accountTag || !syncTargets().length) {
    if (quietly) return Promise.resolve(syncStatus());
    return count().then(() => {
      tell();
      return syncStatus();
    });
  }
  if (running) {
    again = true;
    return running;
  }
  // One sync at a time on the device too: its tabs take turns (a Web Lock), each reading what the last one kept.
  const turn = (fn) => (globalThis.navigator?.locks ? navigator.locks.request("lx-sync", fn) : fn());
  running = (async () => {
    status.syncing = true;
    tell();
    const error = await turn(syncAll);
    // Each kind the sync counted (syncAll, from its merged result) isn't counted again.
    await count(countedBySync);
    status = { ...status, syncing: false, at: error ? status.at : Date.now(), error };
    running = null;
    tell();
    if (again) {
      again = false;
      return syncNow();
    }
    return syncStatus();
  })();
  return running;
}

/** Syncs with each connected storage in turn. Resolves to the first error, or null. */
// The kinds the last sync counted from what it merged (syncWith's report).
let countedBySync = new Set();
async function syncAll() {
  countedBySync = new Set();
  if (sampleOn()) return "Paused while the sample learner is on.";
  const state = readState();
  const remembered = (state[accountTag] ??= {});
  const device = deviceTag();
  if (!device) return "This browser keeps nothing between visits, so it can't sync.";
  let error = null;
  for (const { id, name } of syncTargets()) {
    let targetError = null;
    try {
      const report = await syncWith(adapter(id), accountTag, device, (remembered[id] ??= {}));
      // Its sign-in ended during this round (storage.js signInEnded): Settings says so on its row, beside Connect, so neither this
      // line nor what's kept says it again; the next round leaves it out.
      if (signInEnded(id)) continue;
      for (const [kindId, r] of Object.entries(report)) {
        if (kindId.startsWith("blobs:")) {
          targetError ??= r.error;
          continue;
        }
        const kindError = r.error ? `${name}: ${r.error}` : r.dropped ? `${name} had ${r.dropped} record(s) that couldn't be read; they were left out.` : null;
        status.kinds[kindId] = { ...status.kinds[kindId], at: r.error ? status.kinds[kindId].at : Date.now(), error: kindError, ...(r.count != null && !r.error ? { count: r.count } : {}) };
        if (r.count != null && !r.error) countedBySync.add(kindId);
        else countedBySync.delete(kindId);
        targetError ??= r.error;
      }
    } catch (e) {
      if (signInEnded(id)) continue;
      // A network failure is the browser's own words ("Failed to fetch", "Load failed"): say what it means instead.
      const network = e instanceof TypeError && /^(Failed to fetch|Load failed|NetworkError)/.test(e.message);
      targetError = network ? (navigator.onLine === false ? "you're offline; it syncs again once you're back." : "it couldn't be reached; it tries again in a while.") : (e?.message ?? String(e));
    }
    status.targets[id] = { at: targetError ? (status.targets[id]?.at ?? null) : Date.now(), error: targetError };
    if (targetError) error ??= `${name}: ${targetError}`;
  }
  keepState(state);
  return error;
}

let soonTimer = null;
function soon() {
  if (!accountTag || sampleOn()) return;
  clearTimeout(soonTimer);
  soonTimer = setTimeout(() => syncNow({ quietly: true }), SYNC_TIMING.afterChange);
}

let started = false;
/** Starts syncing for the account signed in (once per page): soon, after changes, on coming back, every 15 minutes. */
export async function startSync({ account } = {}) {
  // Not while the sample learner is on: nothing of this device's is read or sent for syncing (study/sample-mode.js).
  if (started || !account || sampleOn()) return;
  started = true;
  accountTag = (await sha256Hex(new TextEncoder().encode(`lexicommons-sync:${account}`))).slice(0, 8);
  // (Nothing counted here: a sync counts what it merged, and Settings → Sync across devices counts as it opens.)
  setTimeout(() => syncNow({ quietly: true }), 2_000);
  setInterval(() => syncNow({ quietly: true }), SYNC_TIMING.every);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && (!status.at || Date.now() - status.at > SYNC_TIMING.onReturn)) syncNow({ quietly: true });
  });
  // Back online: within 30 s, not at once (lx/retry.js).
  onReconnect(() => syncNow({ quietly: true }));
}
