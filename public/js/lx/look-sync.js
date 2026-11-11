// Keeps this device's themes and its look in step with the account's (src/looks.ts), so the person's own AI can read
// and change them over MCP and every device they use follows. Only the look and the themes sync; text size, density
// and the other presets stay on each device.
//
// How:
// - Each theme of yours (theme.js's library) syncs by its own revision. A change made here (an edit to the theme in
//   use, a new theme, a rename, a delete) goes up on top of the revision this device last agreed with. If the theme
//   moved on meanwhile (your AI, another device), the two are merged field by field and token by token
//   (look-rules.js mergeLooks; this device wins where both changed the same thing) and sent again. Images go up first,
//   by hash, only the ones the account lacks.
// - Which theme is in use syncs as a switch: switching here sends which theme, never its content, so a copy here that's
//   out of date can't overwrite a newer one. A switch or change from elsewhere is applied here through the theme
//   engine's guard (a look that breaks the page is undone at once), shown with an Undo toast, and reported back, so
//   the AI sees whether it landed.
// - While the page is visible and an AI is connected, it checks every 4 s (every 20 once nobody has touched it for 2
//   minutes); with none connected, once a minute, since only your other devices change the look then. Always at once
//   when the page comes back into view, the network returns or an AI connects, and never while hidden. A check that
//   finds nothing new is one 204 from the server. (Every open app checking every 4 s, AI or not, was most of the
//   database's load at a launch's busiest hour.)
// - A device that has never synced takes the account's look (its own look so far is kept in Recent looks) and sends
//   up the themes it has. A device signed into another account forgets the first account's themes.
//
// It remembers (localStorage "lx.look-sync.v1") the look revision and the library revision it last agreed with, that
// look, and the account.

import * as theme from "./theme.js";
import { emptyLook, hasChanges, mergeLooks, sameContent, sameLook, themeContent } from "./look-rules.js";
import { fetchRetrying, jittered, onReconnect } from "./retry.js";

const SYNC_KEY = "lx.look-sync.v1";
const ACTIVE_MS = 4000;
const IDLE_MS = 20_000;
const IDLE_AFTER_MS = 120_000;
const QUIET_MS = 60_000; // no AI connected
const PUSH_AFTER_MS = 700;
// Changes made on this device (or in another tab of it, the /design page say) that go to the server.
const LOCAL = new Set(["theme", "tokens", "css", "image", "name", "reset", "import", "restore", "switch", "library", "other-tab"]);

function readSynced() {
  try {
    const value = JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null");
    if (value && Number.isInteger(value.rev) && value.rev >= 0) return { library: 0, account: null, ...value };
  } catch {}
  return { rev: 0, look: null, library: 0, account: null };
}

function writeSynced(state) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ rev: state.rev, look: state.look, library: state.library, account: state.account }));
  } catch {}
}

/** Which theme a look is: "yours:<id>" or "built-in:<id>". */
const pointerOf = (look) => (look?.theme ? `yours:${look.theme}` : `built-in:${look?.base ?? "graphite"}`);

/** Whether a theme in the library has a change this device hasn't sent. */
function isDirty(entry) {
  if (entry.rev === 0) return !entry.deleted;
  return entry.deleted !== entry.syncedDeleted || !sameContent(entry.look, entry.synced ?? emptyLook());
}

/** Where a change came from, in words: "Claude Code", "another device". */
export function sourceLabel(source) {
  const [via, ...rest] = String(source ?? "").split(":");
  const name = rest.join(":");
  if (via === "oauth") return name || "your AI";
  if (via === "pat" || via === "rest") return name ? `your token “${name}”` : "a token";
  return "another device";
}

/** This device in a few words ("iPhone, installed app"), as the account shows it. */
export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "A device";
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return `${os}, ${installed ? "installed app" : "browser"}`;
}

// localStorage["lx.debug.sync"] = "1" logs every round's decisions to the console (console.debug).
const debug = (...args) => {
  try {
    if (localStorage.getItem("lx.debug.sync")) console.debug("[look-sync]", ...args);
  } catch {}
};
const brief = (look) =>
  `${look?.theme ? `${look.theme.slice(0, 6)}"${look.name}"` : "built-in"}/${look?.base ?? "-"} t${Object.keys(look?.tokens ?? {}).length} css${look?.css?.length ?? 0} img[${Object.keys(look?.images ?? {}).join("+")}]`;

class SignedOut extends Error {}

// The server's overload is tried again (lx/retry.js): reads, an image put by its hash (idempotent), other writes only when not applied.
async function call(path, { idempotent = false, ...options } = {}) {
  const response = await fetchRetrying(path, { credentials: "same-origin", cache: "no-store", ...options }, { idempotent });
  if (response.status === 401) throw new SignedOut();
  return response;
}

async function answer(response, what) {
  if (!response.ok) throw new Error(`${what}: ${response.status}`);
  return response.json();
}

const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Fetches the images a look uses that this device doesn't have. Throws if one can't be fetched (try again later). */
async function fetchImages(look) {
  for (const image of Object.values(look?.images ?? {})) {
    if (await theme.hasImage(image.hash)) continue;
    const response = await call(`/api/look/images/${image.hash}`);
    if (response.status === 404) continue; // Gone from the server too: it shows without it.
    if (!response.ok) throw new Error(`image ${image.hash.slice(0, 8)}: ${response.status}`);
    const blob = await response.blob();
    await theme.storeImage(image.hash, blob.type ? blob : new Blob([blob], { type: image.type }));
  }
}

async function report(rev, { undone, notes = [] } = {}) {
  await call("/api/look/applied", json("POST", { rev, device: deviceLabel(), undone, notes })).catch(() => {});
}

// ---------- the library ----------

/** Takes in the account's themes: new ones are added, changed ones replace this device's (merged, if it changed them too). */
async function pullLibrary(state) {
  const { libraryRev, themes } = await answer(await call("/api/themes"), "reading the themes");
  const here = new Map(theme.libraryEntries().map((entry) => [entry.id, entry]));
  for (const server of themes) {
    const local = here.get(server.id);
    here.delete(server.id);
    const deleted = Boolean(server.deletedAt);
    const fromServer = { look: server.look, rev: server.rev, synced: server.look, syncedDeleted: deleted, account: state.account, createdBy: server.createdBy, createdAt: server.createdAt, updatedAt: server.updatedAt };
    if (!local) {
      if (!deleted) theme.putLibraryEntry({ id: server.id, deleted, ...fromServer });
      continue;
    }
    if (local.rev === server.rev && local.account === state.account) continue;
    if (!isDirty(local) || local.rev === 0) {
      // Unchanged here (or the same theme made here and there, which can't really happen): the account's wins.
      theme.putLibraryEntry({ ...local, ...fromServer, deleted: isDirty(local) ? local.deleted : deleted });
      continue;
    }
    // Changed in both places: this device's change goes on top of the account's.
    const merged = themeContent(mergeLooks(local.synced ?? emptyLook(), local.look, server.look));
    theme.putLibraryEntry({ ...local, ...fromServer, look: merged, deleted: local.deleted !== local.syncedDeleted ? local.deleted : deleted });
  }
  // Themes this device synced that the account no longer has (deleted long ago): forgotten, unless changed here since
  // or in use here (then they go up again as new).
  const inUseHere = theme.currentLook().theme;
  for (const local of here.values()) {
    if (local.rev === 0 || local.account !== state.account) continue;
    if ((isDirty(local) && !local.deleted) || local.id === inUseHere) theme.putLibraryEntry({ ...local, rev: 0, synced: null, deleted: false, syncedDeleted: false });
    else theme.removeLibraryEntry(local.id);
  }
  state.library = libraryRev;
  writeSynced(state);
  theme.librarySynced();
  for (const entry of theme.libraryEntries()) if (!entry.deleted) await fetchImages(entry.look);
  debug(`library at ${libraryRev}: ${theme.libraryEntries().map((e) => `${e.id.slice(0, 6)}"${e.look.name}"@${e.rev}${e.deleted ? " deleted" : ""}${isDirty(e) ? " changed here" : ""}`).join(", ")}`);
}

/** Notes what the account answered, and moves the remembered revisions on when nothing else happened in between. */
function noteRevs(state, revs) {
  if (revs?.library === state.library + 1) state.library = revs.library;
  writeSynced(state);
}

/** Sends one theme's change: a delete, bringing it back, or its content. Returns the look revision it made, if any. */
async function pushEntry(state, id) {
  let lookRev = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const entry = theme.libraryEntry(id);
    if (!entry || !isDirty(entry)) return lookRev;
    if (entry.deleted && !entry.syncedDeleted) {
      if (entry.rev === 0) {
        theme.removeLibraryEntry(id);
        return lookRev;
      }
      const done = await answer(await call(`/api/themes/${id}/delete`, json("POST", {})), "deleting a theme");
      theme.putLibraryEntry({ ...theme.libraryEntry(id), rev: done.rev, synced: entry.look, syncedDeleted: true, account: state.account });
      debug(`deleted ${id.slice(0, 6)} → ${done.rev}`);
      continue;
    }
    const undelete = !entry.deleted && entry.syncedDeleted;
    if (undelete && sameContent(entry.look, entry.synced ?? emptyLook())) {
      const done = await answer(await call(`/api/themes/${id}/restore`, json("POST", {})), "bringing a theme back");
      theme.putLibraryEntry({ ...theme.libraryEntry(id), rev: done.rev, syncedDeleted: false, account: state.account });
      continue;
    }
    const sent = entry.look;
    const result = await answer(await call(`/api/themes/${id}`, json("PUT", { baseRev: entry.rev, look: sent, undelete })), "saving a theme");
    debug(`push ${id.slice(0, 6)} on ${entry.rev}: ${brief({ ...sent, theme: id })} →`, result.result, result.rev ?? "");
    if (result.result === "saved") {
      // Kept as sent: anything changed here meanwhile stays a change to send next.
      theme.putLibraryEntry({ ...theme.libraryEntry(id), rev: result.rev, synced: sent, syncedDeleted: false, account: state.account });
      if (result.lookRev) {
        lookRev = result.lookRev;
        if (result.revs?.rev === result.lookRev && state.rev === result.lookRev - 1) {
          state.rev = result.lookRev;
          state.look = { ...sent, theme: id };
        }
      }
      noteRevs(state, result.revs);
      continue;
    }
    if (result.result === "missing_images") {
      for (const hash of result.missing) {
        const blob = await theme.getImageBlob(hash);
        if (!blob) {
          // Gone from this device too (its storage was cleared): the theme goes up without it.
          const now = theme.libraryEntry(id);
          const images = Object.fromEntries(Object.entries(now.look.images).filter(([, meta]) => meta.hash !== hash));
          theme.putLibraryEntry({ ...now, look: { ...now.look, images } });
          continue;
        }
        const put = await call(`/api/look/images/${hash}`, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob, idempotent: true });
        if (!put.ok) throw new Error(`sending an image: ${put.status}`);
      }
      continue;
    }
    if (result.result === "conflict") {
      const server = result.theme;
      const now = theme.libraryEntry(id);
      if (!server) {
        // Not on the account (any more): send it as a new theme.
        theme.putLibraryEntry({ ...now, rev: 0, synced: null, syncedDeleted: false, account: state.account });
        continue;
      }
      const merged = themeContent(mergeLooks(now.synced ?? emptyLook(), now.look, server.look));
      theme.putLibraryEntry({ ...now, look: merged, rev: server.rev, synced: server.look, syncedDeleted: Boolean(server.deletedAt), account: state.account });
      continue;
    }
    throw new Error(`saving a theme: ${result.result ?? "no answer"}`);
  }
  return lookRev;
}

/** Sends every theme changed here. Returns whether anything went up. */
async function pushLibrary(state) {
  let sent = false;
  for (const entry of theme.libraryEntries()) {
    if (entry.account && entry.account !== state.account) continue;
    if (!isDirty(entry)) {
      if (entry.rev === 0 && entry.deleted) theme.removeLibraryEntry(entry.id);
      continue;
    }
    const lookRev = await pushEntry(state, entry.id);
    sent = true;
    if (lookRev) await report(lookRev);
  }
  if (sent) theme.librarySynced();
  return sent;
}

// ---------- the look in use ----------

/**
 * Shows a look from the account here, through the theme engine's guard. A look that breaks the page is undone; this
 * device then agrees with what it shows, so it doesn't send its own look straight back, and the AI sees why in
 * get_look.
 */
async function show(state, record, look) {
  await fetchImages(look);
  try {
    await theme.applyRemoteLook(look, sourceLabel(record.source));
    const missing = await Promise.all(Object.values(look.images ?? {}).map((image) => theme.hasImage(image.hash)));
    const notes = Object.keys(look.images ?? {}).filter((_, i) => !missing[i]).map((slot) => `Image "${slot}" couldn't be fetched, so it shows without it`);
    agree(state, record);
    await report(record.rev, { notes });
  } catch (error) {
    if (!(error instanceof theme.ThemeError)) throw error;
    const here = theme.currentLook();
    if (here.theme) {
      const entry = theme.libraryEntry(here.theme);
      if (entry) theme.putLibraryEntry({ ...entry, synced: entry.look });
    }
    agree(state, { ...record, look: here });
    await report(record.rev, { undone: error.message });
  }
}

function agree(state, record) {
  state.rev = record.rev;
  state.look = record.look;
  writeSynced(state);
}

/**
 * Switches the account to the theme in use here. Returns the account's look record after it. A theme of yours started or
 * changed here after this round sent the library (an edit to a built-in theme while the round was reading the account)
 * goes up first: the account can't switch to a theme it hasn't got, and would refuse it.
 */
async function sendSwitch(state) {
  const using = theme.currentLook().theme;
  const entry = using ? theme.libraryEntry(using) : null;
  if (entry && (!entry.account || entry.account === state.account) && isDirty(entry)) {
    const lookRev = await pushEntry(state, using);
    if (lookRev) await report(lookRev);
    theme.librarySynced();
  }
  const here = theme.currentLook();
  const record = await answer(await call("/api/look/use", json("POST", { theme: here.theme ?? here.base })), "switching theme");
  debug(`switch sent: ${brief(here)} → ${record.rev}`);
  agree(state, record);
  await report(record.rev);
  return record;
}

/** Brings the look in use here and the account's together. record: the account's look ({ rev, look, source }). */
async function settle(state, record) {
  const here = theme.currentLook();
  const target = record.look ?? emptyLook();
  if (!record.rev) {
    // Nothing on the account yet: this device's theme goes up (a built-in theme as it comes needs nothing).
    if (pointerOf(here) !== pointerOf(emptyLook()) || hasChanges(here)) await settle(state, await sendSwitch(state));
    return;
  }
  if (pointerOf(here) === pointerOf(target)) {
    // The same theme: show the library's copy of it (the account's, with any change from here not sent yet on top).
    const entry = target.theme ? theme.libraryEntry(target.theme) : null;
    const content = entry && !entry.deleted ? entry.look : target;
    const wanted = target.theme ? { ...content, theme: target.theme } : target;
    if (sameLook(here, wanted)) {
      if (state.rev !== record.rev) await report(record.rev);
      return agree(state, record);
    }
    return show(state, record, wanted);
  }
  if (!here.theme && hasChanges(here) && target.theme) {
    // A look from before saved themes: the account made it a theme. Give it that theme's id; anything changed here
    // since goes on top and is sent next round.
    const synced = state.look ?? emptyLook();
    if (sameContent(here, target)) theme.adoptThemeId(target.theme, target.name);
    else await theme.applyRemoteLook({ ...mergeLooks({ ...synced, theme: null }, here, { ...target, theme: null }), theme: target.theme }, sourceLabel(record.source));
    agree(state, { ...record, look: theme.currentLook() });
    return report(record.rev);
  }
  if (state.rev > 0 && pointerOf(here) !== pointerOf(state.look)) {
    // Switched here since the last agreement: that's the newest choice. A theme deleted elsewhere meanwhile comes back
    // first, since it's the one chosen here.
    const entry = here.theme ? theme.libraryEntry(here.theme) : null;
    if (entry?.deleted) {
      theme.putLibraryEntry({ ...entry, deleted: false });
      await pushEntry(state, entry.id);
    }
    return settle(state, await sendSwitch(state));
  }
  // Switched elsewhere (or this device has never synced): show the account's theme.
  if (target.theme && !theme.libraryEntry(target.theme)) await pullLibrary(state);
  const entry = target.theme ? theme.libraryEntry(target.theme) : null;
  return show(state, record, target.theme && entry && !entry.deleted ? { ...entry.look, theme: target.theme } : target);
}

/** One round: take in what changed on the account, send what changed here, then agree on the theme in use. */
async function sync(first) {
  const state = readSynced();
  // The first round of a page always reads the look, so it learns which account it's signed into.
  const response = await call(first ? "/api/look" : `/api/look?since=${state.rev}&lib=${state.library}`);
  let record = null;
  if (response.status !== 204) {
    record = await answer(response, "checking the look");
    if (state.account !== record.account) {
      if (state.account) {
        // Another account signed in here: forget the first one's themes and agreement.
        for (const entry of theme.libraryEntries()) if (entry.account && entry.account !== record.account) theme.removeLibraryEntry(entry.id);
        Object.assign(state, { rev: 0, look: null, library: 0 });
      }
      state.account = record.account;
      writeSynced(state);
    }
    debug(`check ${state.rev}/${state.library}: account at ${record.rev}/${record.libraryRev} ${brief(record.look)}; here ${brief(theme.currentLook())}`);
    if (record.libraryRev !== state.library) await pullLibrary(state);
  } else debug(`check ${state.rev}/${state.library}: unchanged; here ${brief(theme.currentLook())}`);
  await theme.flushLibrary();
  if (!state.account) return;
  const sent = await pushLibrary(state);
  const switched = pointerOf(theme.currentLook()) !== pointerOf(state.look) && state.rev > 0;
  if (!record && !sent && !switched) return;
  // What the account has now, after anything this round sent.
  if (sent || !record) record = await answer(await call("/api/look"), "checking the look");
  if (record.libraryRev !== state.library) await pullLibrary(state);
  await settle(state, record);
}

let chain = Promise.resolve();
let stopped = false;
let firstRound = true;
let status = { at: 0, ok: true, error: null };
const statusListeners = new Set();

function run() {
  chain = chain
    .then(async () => {
      if (stopped) return;
      const first = firstRound;
      firstRound = false;
      try {
        await sync(first);
      } catch (error) {
        if (first) firstRound = true;
        throw error;
      }
      status = { at: Date.now(), ok: true, error: null };
    })
    .catch((error) => {
      if (error instanceof SignedOut) stopped = true;
      debug("round failed:", error.message);
      status = { at: Date.now(), ok: false, error: error.message };
    })
    .finally(() => {
      for (const listener of statusListeners) listener(getSyncStatus());
    });
  return chain;
}

/** { rev, at, ok, error }: the revision this device agrees with, and how the last round went. */
export function getSyncStatus() {
  return { rev: readSynced().rev, ...status };
}

export function onSyncStatus(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

let started = false;

/**
 * Starts syncing (once per page). Call after initTheme(). aiConnected(): whether this device knows of an AI connected
 * (shell/layout.js), which sets the pace; onAiChange(fn) calls fn when that may have changed. Without them, the AI's pace.
 */
export function startLookSync({ aiConnected = () => true, onAiChange } = {}) {
  if (started) return;
  started = true;
  let lastInput = Date.now();
  let timer = null;
  let pushTimer = null;
  const schedule = () => {
    clearTimeout(timer);
    if (document.hidden || stopped) return;
    timer = setTimeout(tick, jittered(!aiConnected() ? QUIET_MS : Date.now() - lastInput < IDLE_AFTER_MS ? ACTIVE_MS : IDLE_MS));
  };
  const tick = () => run().then(schedule);
  // An AI just connected: a check now, then at its pace.
  let hadAi = aiConnected();
  onAiChange?.(() => {
    const now = aiConnected();
    if (now && !hadAi) tick();
    hadAi = now;
  });
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, () => (lastInput = Date.now()), { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? clearTimeout(timer) : tick()));
  // Back online: a check within 30 s, not at once (every app on a network that blinked comes back together).
  onReconnect(tick);
  theme.onChange((_, change) => {
    if (!LOCAL.has(change?.kind)) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(run, PUSH_AFTER_MS);
  });
  tick();
}

/** Checks now, outside the schedule (a page that just opened, say). Resolves when the round is done. */
export function syncNow() {
  return run();
}
