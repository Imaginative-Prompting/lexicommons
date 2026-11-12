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

// ---------- a sync's own pace ----------
// A sync's work on a learner's whole history (tens of thousands of records) is done a few milliseconds at a time, yielding between,
// so it never holds the page: a band switched or a session ended went on to a sync that froze a phone for 2.7 s (11 Nov 2026).
const SLICE_MS = 6;
let sliceFrom = 0;
/** Yields to the page when this slice has run its time. */
async function breathe() {
  const now = globalThis.performance?.now?.() ?? Date.now();
  if (now - sliceFrom < SLICE_MS) return;
  await new Promise((done) => setTimeout(done, 0));
  sliceFrom = globalThis.performance?.now?.() ?? Date.now();
}
/** fileText's text, written a record at a time with breaths between: the same characters (Object.keys is JSON.stringify's order). */
export async function fileTextSliced(kind, tag, kept) {
  const head = JSON.stringify({ format: SYNC_FORMAT, version: SYNC_VERSION, kind: kind.id, account: tag, records: {} }).slice(0, -2);
  const parts = [];
  let i = 0;
  for (const key of Object.keys(kept)) {
    parts.push(`${JSON.stringify(key)}:${JSON.stringify(kept[key])}`);
    if (++i % 256 === 0) await breathe();
  }
  return `${head}${parts.join(",")}}}`; // head ends at the records' own "{"
}
/** hashText's hash, a stretch at a time with breaths between: the same hash. */
export async function hashTextSliced(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const STRETCH = 1 << 17;
  for (let from = 0; from < text.length; from += STRETCH) {
    const to = Math.min(text.length, from + STRETCH);
    for (let i = from; i < to; i++) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    await breathe();
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}
/** A text's UTF-8 size, or a bound on it that's enough to know it's within `limit` (without copying a big text to measure it). */
const utf8Within = (text, limit) => text.length * 3 <= limit || new TextEncoder().encode(text).length <= limit;

// A kind's changes on this device, counted (registerSync: each onChange), so a sync can tell a kind with nothing new from one with.
const changes = new Map();
const changeCount = (kind) => (kinds.get(kind.id) === kind && kind.onChange ? (changes.get(kind.id) ?? 0) : undefined);
// And for a kind in shards, where its changes were: { whole: the count at its last change that didn't say its shards, shards: Map(shard →
// the count at its last change) }, so a quiet sync goes through only the shards changed since its last clean one (syncKind's scope).
const touched = new Map();
const touchedOf = (id) => touched.get(id) ?? touched.set(id, { whole: 0, shards: new Map() }).get(id);
// What each clean map's syncs counted, shard by shard: clean map → Map(kind id → Map(shard → records not gone)). A sync through some shards
// counts those again and takes the rest from here; one through them all writes it anew.
const talliesOf = new WeakMap();

// ---------- records and the merge (pure) ----------

/**
 * How deep a JSON value nests (stopping once past the limit). A plain value inside counts one deeper without a call of its own: a text's
 * hundred thousand words were a call each (12 Nov 2026: 65–73 ms at 4× per novel-sized text, every sync).
 */
function depthOf(value, depth = 0) {
  if (depth > SYNC_LIMITS.depth || !value || typeof value !== "object") return depth;
  let most = depth;
  const values = Array.isArray(value) ? value : Object.values(value);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || typeof v !== "object") {
      if (most <= depth) most = depth + 1;
      continue;
    }
    const d = depthOf(v, depth + 1);
    if (d > most) most = d;
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
  // A record against itself: the same, with no need to write either out (a sync with nothing new compared every record of
  // a learner months in with itself four times, 1.3 s of a 2.7 s task at a phone's speed, 11 Nov 2026).
  if (a === b) return a;
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
    if (mine === theirs) continue;
    if (!mine || (pick(mine, theirs) === theirs && canonical(mine) !== canonical(theirs))) out[key] = theirs;
  }
  return out;
}

const SHARD = /^[a-z0-9][a-z0-9-]{0,63}$/;
// A kind kept in shards now that was once kept whole, one file per device (registerSync's wholeBefore: your packs, until 12 Nov 2026): its old file
// (no shard) is still read and merged, for a device on the code from before writes it, and never written here.
const oldWhole = (kind, shard) => shard === "" && Boolean(kind.shard && kind.wholeBefore);
const DEVICE = /^[0-9a-f]{8}$/;
const shardOf = (kind, key) => {
  const shard = kind.shard ? kind.shard(key) : "";
  return typeof shard === "string" && SHARD.test(shard) ? shard : "";
};

/**
 * A file's records as this device may take them: { records (well formed, in the file's shard, and passing the kind's
 * check), refused (how many the check turned down), dropped (how many weren't records of the file), early (how many are
 * dated too far ahead, for now) }. A file that isn't this kind's and account's, or past SYNC_LIMITS, counts as one
 * dropped. A kind once kept whole (wholeBefore) reads its old file, with no shard, as holding any shard's records.
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
    if (key.length > SYNC_LIMITS.key || !isRecord(record) || (shardOf(kind, key) !== shard && !oldWhole(kind, shard))) {
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
export async function syncWith(store, tag, device, remembered = {}, list = [...kinds.values()], now = Date.now(), blobs = [...blobKinds.values()], { clean = null } = {}) {
  const listing = async () => new Map((await store.list()).map((f) => [f.name, { version: f.version ?? null, size: Number(f.size) || 0 }]));
  let files = await listing();
  const report = {};
  const tallies = clean ? (talliesOf.get(clean) ?? talliesOf.set(clean, new Map()).get(clean)) : null;
  for (const kind of list) {
    const result = { took: 0, sent: 0, read: 0, refused: 0, dropped: 0, count: null, error: null };
    report[kind.id] = result;
    // A clash on this device's own file (another browser with its id wrote it): listed again, and the kind synced again,
    // so what was written there is read before it's written over.
    for (let attempt = 1; ; attempt++) {
      try {
        const mark = changeCount(kind);
        await syncKind(kind);
        // Clean with this storage as of the change count it started from (a change while it ran leaves it to the next sync).
        if (clean && mark !== undefined && !result.error) clean.set(kind.id, mark);
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

  // Whether every file of a kind on this storage is as it was when last read or written here (none new, none changed, none of this
  // device's own gone).
  function filesAsSeen(kind) {
    for (const [name, listed] of files) if (nameParts(name, kind, tag) && remembered[name]?.version !== listed.version) return false;
    for (const name of Object.keys(remembered)) {
      const parts = nameParts(name, kind, tag);
      if (parts && parts.device === device && !files.has(name)) return false;
    }
    return true;
  }

  async function syncKind(kind) {
    const result = report[kind.id];
    // A quiet sync passes a kind by when nothing of it changed on this device since its last clean sync with this storage (clean: the
    // kind's change count then) and no file of it changed there: a word band switched never goes through the learner's answers.
    const mark = changeCount(kind);
    if (clean && mark !== undefined && clean.get(kind.id) === mark && filesAsSeen(kind)) {
      result.skipped = true;
      return;
    }
    // What the kind needs first (study progress: your account's clears); without it, the rest still syncs.
    if (kind.prepare) {
      try {
        await kind.prepare();
      } catch (error) {
        result.error = error?.message ?? String(error);
      }
    }
    // The shards to go through: every one, or for a quiet sync after a clean one only those changed since, here or there (scopeOf).
    const scope = scopeOf(kind);
    const inScope = (key) => !scope || scope.has(shardOf(kind, key));
    // The counts kept come out until this sync ends well (anything that stops it part way leaves the next one to go through every shard).
    const keptCounts = scope ? tallies.get(kind.id) : null;
    tallies?.delete(kind.id);
    const ownRecords = async () => {
      const out = records();
      let n = 0;
      for (const [key, record] of Object.entries(await kind.records(scope ?? undefined))) {
        if (key.length <= SYNC_LIMITS.key && isRecord(record) && inScope(key)) out[key] = tidy(record);
        if (++n % 512 === 0) await breathe();
      }
      return out;
    };
    let local = await ownRecords();
    let n = 0;
    // This device's records by shard, and every shard any device has a file for.
    const shards = new Map();
    const shardOfSet = (shard) => shards.get(shard) ?? shards.set(shard, []).get(shard);
    n = 0;
    for (const key of Object.keys(local)) {
      shardOfSet(shardOf(kind, key));
      if (++n % 1024 === 0) await breathe();
    }
    let counted = 0;
    for (const name of [...files.keys()].sort()) {
      const parts = nameParts(name, kind, tag);
      if (!parts) continue;
      if (++counted > SYNC_LIMITS.files) {
        result.error = `More than ${SYNC_LIMITS.files} files of it; the rest weren't read.`;
        break;
      }
      if (scope && !scope.has(parts.shard)) continue;
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
    local = await ownRecords();
    // Each key's shard once, for the shards to write and the files to write them in.
    const shardOfKey = new Map();
    n = 0;
    for (const key of Object.keys(local)) {
      const shard = shardOf(kind, key);
      shardOfKey.set(key, shard);
      shardOfSet(shard);
      if (++n % 1024 === 0) await breathe();
    }
    // mergeRecords and newerThan, a few milliseconds at a time.
    const pick = winnerFor(kind);
    const merged = records();
    n = 0;
    for (const key of new Set([...Object.keys(local), ...Object.keys(incoming)])) {
      merged[key] = pick(local[key], incoming[key]);
      if (++n % 512 === 0) await breathe();
    }
    const take = records();
    n = 0;
    for (const key of Object.keys(merged)) {
      const mine = local[key];
      const theirs = merged[key];
      if (mine !== theirs && (!mine || (pick(mine, theirs) === theirs && canonical(mine) !== canonical(theirs)))) take[key] = theirs;
      if (++n % 512 === 0) await breathe();
    }
    const turnedDown = new Set(Object.keys(take).length ? ((await kind.apply(take)) ?? []) : []);
    result.took = Object.keys(take).filter((key) => !turnedDown.has(key)).length;
    // A file with records the kind turned down is read again next time (they may pass then); the rest are done.
    for (const [name, keys] of readFrom) {
      if (keys && !keys.some((key) => turnedDown.has(key))) remembered[name] = { ...remembered[name], version: files.get(name).version };
    }
    // What this device has now (as the kind settles it), written to its own file per shard when that changed.
    const held = records();
    n = 0;
    for (const key of Object.keys(merged)) {
      const record = turnedDown.has(key) ? local[key] : merged[key];
      if (record) held[key] = record;
      if (++n % 1024 === 0) await breathe();
    }
    const settled = kind.settle ? Object.assign(records(), kind.settle(held)) : held;
    await breathe();
    // How many it has now, for Settings → Sync across devices: from the merged result as the kind settles it (what records() gives after
    // the merge), so no count reads every record again after the sync. And each shard's records, gathered in one pass.
    // Counted shard by shard: a sync through some shards takes the others' counts from the last one through them.
    const alive = new Map();
    const byShard = new Map();
    n = 0;
    for (const key of Object.keys(settled)) {
      const record = settled[key];
      const shard = shardOfKey.get(key) ?? shardOf(kind, key);
      if (!record.gone && (!kind.counts || kind.counts(key))) alive.set(shard, (alive.get(shard) ?? 0) + 1);
      (byShard.get(shard) ?? byShard.set(shard, records()).get(shard))[key] = record;
      if (++n % 1024 === 0) await breathe();
    }
    let tally = alive;
    if (scope) {
      tally = new Map(keptCounts);
      for (const shard of scope) tally.set(shard, alive.get(shard) ?? 0);
    }
    result.count = 0;
    for (const count of tally.values()) result.count += count;
    // What this storage doesn't hold of the kind, by key: "big" (a file past what the storage keeps: your account's copy, 12 MB) or "full"
    // (the storage is full); and the keys it does (result.notKept, result.keptHere: syncAll keeps them for Read to say so).
    result.notKept = {};
    result.keptHere = [];
    let full = null;
    // Every shard a file or this device has, and any the merge brought (an old whole file's records come from no file of their shard).
    for (const shard of new Set([...shards.keys(), ...byShard.keys()])) {
      // The old whole file is read, never written (a device on the code from before still reads and writes its own).
      if (oldWhole(kind, shard)) continue;
      const own = fileName(kind.id, shard, tag, device);
      const kept = byShard.get(shard) ?? records();
      const keys = Object.keys(kept).filter((key) => !kept[key].gone);
      if (!Object.keys(kept).length && !files.has(own)) continue;
      const text = await fileTextSliced(kind, tag, kept);
      // Never replace a readable file with one every other device would refuse: a file of one record (a text, a pack) stays on this device,
      // the rest going on; one of many (a month's answers) is a sync that can't finish.
      if (!utf8Within(text, SYNC_LIMITS.fileBytes)) {
        if (keys.length > 1) throw new Error(`${own} is too big to sync.`);
        for (const key of keys) result.notKept[key] = "big";
        continue;
      }
      // Past what this storage keeps in one file, or the storage full: those records stay on this device (the rest go on).
      if (full || (store.maxFileBytes && !utf8Within(text, store.maxFileBytes))) {
        for (const key of keys) result.notKept[key] = full ? "full" : "big";
        continue;
      }
      const hash = await hashTextSliced(text);
      if (files.has(own) && remembered[own]?.hash === hash && remembered[own]?.version === files.get(own).version) {
        result.keptHere.push(...keys);
        continue;
      }
      let written;
      try {
        written = await store.write(own, text, { version: files.get(own)?.version ?? null });
      } catch (error) {
        if (error?.tooBig || error?.full) {
          if (error.full) {
            full = error;
            result.error ??= error.message;
          }
          for (const key of keys) result.notKept[key] = error.full ? "full" : "big";
          continue;
        }
        throw error;
      }
      remembered[own] = { version: written?.version ?? null, hash };
      result.sent++;
      result.keptHere.push(...keys);
    }
    // Kept for the next quiet sync only from a sync with nothing wrong (with anything wrong, the next one goes through every shard).
    if (tallies && kind.shard && !result.error) tallies.set(kind.id, tally);
  }

  // A quiet sync's shards for a kind in shards, after a clean sync with this storage on this page went through them all: those this device
  // changed since (registerSync's touched), and those of every file of it that's new or changed on the storage, or of this device's own
  // that's gone (another device's past month among them). null (every shard) for anything else: no clean sync to go from, a change since
  // that didn't say its shards (a clear, an Undo), no counts kept from that sync.
  function scopeOf(kind) {
    const since = clean?.get(kind.id);
    if (!kind.shard || since === undefined || !tallies?.has(kind.id)) return null;
    const where = touched.get(kind.id);
    if (where && where.whole > since) return null;
    const scope = new Set();
    if (where) for (const [shard, count] of where.shards) if (count > since) scope.add(shard);
    for (const [name, listed] of files) {
      const parts = nameParts(name, kind, tag);
      if (!parts || remembered[name]?.version === listed.version) continue;
      // An old whole file may hold any shard's records: every shard.
      if (oldWhole(kind, parts.shard)) return null;
      scope.add(parts.shard);
    }
    for (const name of Object.keys(remembered)) {
      const parts = nameParts(name, kind, tag);
      if (parts && parts.device === device && !files.has(name)) scope.add(parts.shard);
    }
    return scope;
  }
}

// ---------- the app's side ----------

/**
 * A kind of data that syncs: { id, label, icon?, counted?(n), records() → { key: record }, apply(newer) → [keys it
 * turned down]?, onChange?(fn), check?(record, key), shard?(key), shards?, prefer?(a, b), settle?(held), prepare?() }.
 *   id        lowercase letters, digits and dashes (it names the files)
 *   label, icon (icons.js), counted (how a count of its records reads, "12 answers"): how Settings → Storage lists it; counts(key):
 *             whether a record counts (a text's weave doesn't: it goes with its text)
 *   records   this device's records, deletions included; apply gets the ones newer than them. Given a Set of shards (a quiet sync's), it
 *             may give only theirs (any others are left out here)
 *   onChange  calls its fn on every change here, with the shards it touched (an array) when it knows them
 *   check     whether a record from another device may ever be taken (the whole record, and its key: both untrusted);
 *             one that may only later (it waits on something) is for apply to turn down, so it's tried again
 *   shard     the shard a key belongs to ("" for none), and shards: a RegExp every shard's name must match; wholeBefore: the kind was
 *             kept whole before (one file per device, no shard), and that file is read and merged but never written
 *   prefer    which of two records for one key wins (a deterministic order; the default is winner)
 *   settle    what this device has, as its own file keeps it (study progress leaves out what a clear covers)
 *   prepare   anything to do before each sync (study progress takes your account's clears)
 */
export function registerSync(kind) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(kind?.id ?? "") || typeof kind.records !== "function" || typeof kind.apply !== "function") {
    throw new Error("A sync kind needs an id, records() and apply().");
  }
  kinds.set(kind.id, kind);
  // A change may say which shards it touched (a list of them); one that doesn't may have touched any.
  kind.onChange?.((shards) => {
    const count = (changes.get(kind.id) ?? 0) + 1;
    changes.set(kind.id, count);
    const where = touchedOf(kind.id);
    if (kind.shard && Array.isArray(shards)) for (const shard of shards) where.shards.set(typeof shard === "string" && SHARD.test(shard) ? shard : "", count);
    else where.whole = count;
    soon();
  });
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

// ---------- the account's own copy ----------
//
// Your progress, your own packs and your texts are kept with your account too (src/account-sync.ts), so signing in on a device with nothing on
// it brings them back: the server is one more storage to sync with, on from sign-in with nothing to connect, when the site says it keeps one (/api/me's
// accountSync). Its kinds (ACCOUNT_KINDS: the server refuses any other kind's file): answers, the done log and streak, the place on the path,
// the word bank, reading places, highlights, sound settings, your packs (12 Nov 2026: one your AI made reached only the devices signed in
// while the relay held it) and your texts (a shelf or Explore book as its entry alone). Never the packs' recordings: those sync with a
// storage of your own.
// Nothing is sent before sign-in (sync starts with the account), and signing out leaves this device's copy as it is.
export const ACCOUNT_STORE = "account";
export const ACCOUNT_KINDS = ["progress", "streak", "path", "word-bank", "highlights", "reading-place", "sound", "packs", "texts"];
let accountStore = false;
const accountFile = (name, seen) => `/api/account/sync/file?name=${encodeURIComponent(name)}${seen ? `&seen=${encodeURIComponent(seen)}` : ""}`;
const accountAsk = async (url, options) => {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
  if (response.status === 409) throw Object.assign(new Error("Another device wrote that file first."), { conflict: true });
  if (!response.ok) {
    const error = new Error((await response.json().catch(() => null))?.error ?? `your account answered ${response.status}`);
    // A file past what your account keeps (413, or a 400 saying so), and your account's copy full (429): what stays on this device, said.
    if (response.status === 413 || /too big to keep with your account/.test(error.message)) error.tooBig = true;
    if (response.status === 429) error.full = true;
    throw error;
  }
  return response;
};
// The most your account keeps in one file (src/account-sync.ts ACCOUNT_SYNC_LIMITS.fileBytes; test-account-sync holds them the same).
export const ACCOUNT_FILE_BYTES = 12 * 1024 * 1024;
const accountAdapter = {
  maxFileBytes: ACCOUNT_FILE_BYTES,
  list: async () => (await (await accountAsk("/api/account/sync")).json()).files,
  read: async (name) => (await accountAsk(accountFile(name))).text(),
  write: async (name, text, { version = null } = {}) => (await accountAsk(accountFile(name, version), { method: "PUT", headers: { "Content-Type": "application/json" }, body: text })).json(),
};

// Whose progress this device holds. A browser has one set of progress stores, whoever is signed in; with an account's copy on the server,
// merging one person's into another's account would follow them everywhere. So the device remembers the account its progress belongs to
// ({ tag, syncedAt }): a device with no owner is adopted by the first account that syncs here; while another account is signed in, nothing
// syncs either way (ownedByAnother), and the app offers that account its own progress here instead (shell/other-owner.js). syncedAt: when
// this device last synced clean with its owner's copy, so the offer can say when some of it exists only here; ownAt: the same for a
// storage of the owner's own (Drive, Dropbox, OneDrive), which is where their texts and packs go.
const OWNER_KEY = "lx.device.owner.v1";
/** The device's owner as kept: { tag, syncedAt } or null. */
export function deviceOwner() {
  try {
    const kept = JSON.parse(localStorage.getItem(OWNER_KEY) ?? "null");
    return isObject(kept) && DEVICE.test(kept.tag ?? "") ? { tag: kept.tag, syncedAt: Number.isFinite(kept.syncedAt) ? kept.syncedAt : null, ownAt: Number.isFinite(kept.ownAt) ? kept.ownAt : null } : null;
  } catch {
    return null;
  }
}
const keepOwner = (owner) => {
  try {
    localStorage.setItem(OWNER_KEY, JSON.stringify(owner));
  } catch {}
};
/** Whether this device's progress belongs to another account than the one signed in: nothing syncs while it does. */
export const ownedByAnother = () => {
  const owner = deviceOwner();
  return Boolean(accountTag && owner && owner.tag !== accountTag);
};
/** Makes the account signed in this device's owner (after the device's own data has been cleared for it: shell/other-owner.js). */
export function ownThisDevice() {
  if (accountTag) keepOwner({ tag: accountTag, syncedAt: null, ownAt: null });
}

/** The storages this device syncs with: your account's own copy first (when the site keeps one), then each of yours that's connected: [{ id, name }]. */
export const syncTargets = () => [
  ...(accountStore ? [{ id: ACCOUNT_STORE, name: "Your account" }] : []),
  ...Object.entries(PROVIDERS)
    .filter(([id]) => isConnected(id))
    .map(([id, name]) => ({ id, name })),
];

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
    // This device's progress belongs to another account: nothing syncs (shell/other-owner.js offers this account its own).
    held: ownedByAnother(),
    syncing: status.syncing,
    at: status.at,
    error: status.error,
    targets: syncTargets().map((t) => ({ ...t, at: status.targets[t.id]?.at ?? null, error: status.targets[t.id]?.error ?? null })),
    kinds: [...kinds.values()].map((k) => ({ id: k.id, label: k.label, icon: k.icon, counted: k.counted, ...status.kinds[k.id] })),
  };
}

const adapter = (provider) => (provider === ACCOUNT_STORE ? accountAdapter : storageAdapter(provider));
const storageAdapter = (provider) => ({
  list: () => listFiles(provider),
  read: async (name) => (await readFile(provider, name)).text(),
  write: (name, text, options) => writeFile(provider, name, new Blob([text], { type: "application/json" }), "application/json", options),
  readBlob: (name) => readFile(provider, name),
  writeBlob: (name, blob, options) => writeFile(provider, name, blob, blob.type || "application/octet-stream", options),
});

/** How many records of a kind this device has, deletions aside: what Settings → Sync across devices shows, "N on this device". */
export async function localCount(id) {
  const kind = kinds.get(id);
  return Object.entries(await kind.records()).filter(([key, r]) => !r.gone && (!kind.counts || kind.counts(key))).length;
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
let againQuietly = true;
// The page's last move (a page opened, a tab switched, the app coming back): a quiet sync waits until the page has been still this long,
// so its work never lands in a page's first moment (up to STILL_MOST, so one who keeps moving still syncs).
const STILL_MS = 1_500;
const STILL_MOST = 30_000;
let lastMove = globalThis.performance?.now?.() ?? 0;
const moved = () => (lastMove = performance.now());
async function stillPage() {
  const from = performance.now();
  while (performance.now() - lastMove < STILL_MS && performance.now() - from < STILL_MOST) {
    await new Promise((done) => setTimeout(done, STILL_MS - (performance.now() - lastMove) + 20));
  }
}
// What each storage's quiet syncs found clean on this page: { [storage id]: Map(kind id → its change count then) }.
const cleanWith = new Map();
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
  // This device's progress is another account's: nothing of it goes to this account, and nothing of this account's comes here.
  if (ownedByAnother()) {
    status = { ...status, syncing: false, error: null };
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
    againQuietly &&= quietly;
    return running;
  }
  // One sync at a time on the device too: its tabs take turns (a Web Lock), each reading what the last one kept.
  const turn = (fn) => (globalThis.navigator?.locks ? navigator.locks.request("lx-sync", fn) : fn());
  running = (async () => {
    status.syncing = true;
    tell();
    if (quietly) await stillPage();
    const error = await turn(() => syncAll({ quietly }));
    // Each kind the sync counted (syncAll, from its merged result) isn't counted again.
    await count(countedBySync);
    status = { ...status, syncing: false, at: error ? status.at : Date.now(), error };
    running = null;
    tell();
    if (again) {
      again = false;
      const next = againQuietly;
      againQuietly = true;
      return syncNow({ quietly: next });
    }
    return syncStatus();
  })();
  return running;
}

/** Syncs with each connected storage in turn. Resolves to the first error, or null. */
// The kinds the last sync counted from what it merged (syncWith's report).
let countedBySync = new Set();
// What your account's copy doesn't hold, by kind: Map(kind id → Map(key → "big" | "full")), as its last syncs found (Read says so: read/store.js).
const notKept = new Map();
/** The keys of a kind your account's copy doesn't hold, and why: Map(key → "big" | "full"). */
export const notKeptWithAccount = (kindId) => new Map(notKept.get(kindId) ?? []);
async function syncAll({ quietly = false } = {}) {
  countedBySync = new Set();
  if (sampleOn()) return "Paused while the sample learner is on.";
  if (ownedByAnother()) return null;
  // A device with no owner yet is this account's from here on.
  if (!deviceOwner()) keepOwner({ tag: accountTag, syncedAt: null, ownAt: null });
  const state = readState();
  const remembered = (state[accountTag] ??= {});
  const device = deviceTag();
  if (!device) return "This browser keeps nothing between visits, so it can't sync.";
  let error = null;
  for (const { id, name } of syncTargets()) {
    let targetError = null;
    try {
      // Your account's copy takes progress alone, and no blobs (recordings, books' files): its kinds, as the server keeps them.
      const own = id === ACCOUNT_STORE;
      // A quiet sync passes by a kind with nothing new either way (syncWith's clean); Sync now, and Settings opening, go through all.
      const clean = cleanWith.get(id) ?? cleanWith.set(id, new Map()).get(id);
      if (!quietly) clean.clear();
      const report = own
        ? await syncWith(adapter(id), accountTag, device, (remembered[id] ??= {}), [...kinds.values()].filter((kind) => ACCOUNT_KINDS.includes(kind.id)), Date.now(), [], { clean })
        : await syncWith(adapter(id), accountTag, device, (remembered[id] ??= {}), undefined, Date.now(), undefined, { clean });
      // Its sign-in ended during this round (storage.js signInEnded): Settings says so on its row, beside Connect, so neither this
      // line nor what's kept says it again; the next round leaves it out.
      // Disconnected during this round (Settings → Sync across devices' Disconnect while it ran): its error is no one's now either.
      if (!own && (signInEnded(id) || !isConnected(id))) continue;
      for (const [kindId, r] of Object.entries(report)) {
        if (kindId.startsWith("blobs:")) {
          targetError ??= r.error;
          continue;
        }
        if (own && r.notKept) {
          const here = notKept.get(kindId) ?? notKept.set(kindId, new Map()).get(kindId);
          for (const key of r.keptHere ?? []) here.delete(key);
          for (const [key, why] of Object.entries(r.notKept)) here.set(key, why);
        }
        // Passed by (nothing new): as it was, its count too.
        if (r.skipped) {
          status.kinds[kindId] = { ...status.kinds[kindId], at: Date.now() };
          countedBySync.add(kindId);
          continue;
        }
        const kindError = r.error ? `${name}: ${r.error}` : r.dropped ? `${name} had ${r.dropped} record(s) that couldn't be read; they were left out.` : null;
        status.kinds[kindId] = { ...status.kinds[kindId], at: r.error ? status.kinds[kindId].at : Date.now(), error: kindError, ...(r.count != null && !r.error ? { count: r.count } : {}) };
        if (r.count != null && !r.error) countedBySync.add(kindId);
        else countedBySync.delete(kindId);
        targetError ??= r.error;
      }
    } catch (e) {
      if (id !== ACCOUNT_STORE && (signInEnded(id) || !isConnected(id))) continue;
      // A network failure is the browser's own words ("Failed to fetch", "Load failed"): say what it means instead.
      const network = e instanceof TypeError && /^(Failed to fetch|Load failed|NetworkError)/.test(e.message);
      targetError = network ? (navigator.onLine === false ? "you're offline; it syncs again once you're back." : "it couldn't be reached; it tries again in a while.") : (e?.message ?? String(e));
    }
    status.targets[id] = { at: targetError ? (status.targets[id]?.at ?? null) : Date.now(), error: targetError };
    // A clean sync with the account's own copy: what's on this device is with its owner's account as of now.
    if (!targetError) keepOwner({ ...deviceOwner(), tag: accountTag, [id === ACCOUNT_STORE ? "syncedAt" : "ownAt"]: Date.now() });
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
export async function startSync({ account, store = false } = {}) {
  // Not while the sample learner is on: nothing of this device's is read or sent for syncing (study/sample-mode.js).
  if (started || !account || sampleOn()) return;
  started = true;
  // Whether the site keeps the account's own copy of your progress (the first storage synced with, above).
  accountStore = Boolean(store);
  accountTag = (await sha256Hex(new TextEncoder().encode(`lexicommons-sync:${account}`))).slice(0, 8);
  // (Nothing counted here: a sync counts what it merged, and Settings → Sync across devices counts as it opens.)
  setTimeout(() => syncNow({ quietly: true }), 2_000);
  // The page's moves, for a quiet sync to wait out (stillPage).
  addEventListener("hashchange", moved);
  addEventListener("popstate", moved);
  document.addEventListener("visibilitychange", () => !document.hidden && moved());
  setInterval(() => syncNow({ quietly: true }), SYNC_TIMING.every);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && (!status.at || Date.now() - status.at > SYNC_TIMING.onReturn)) syncNow({ quietly: true });
  });
  // Back online: within 30 s, not at once (lx/retry.js).
  onReconnect(() => syncNow({ quietly: true }));
}
