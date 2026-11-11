// Bring your own storage: Google Drive (the hidden app-data folder), Dropbox (Apps/Lexicommons) and OneDrive (its app
// folder), called directly from the device. A site offers only what /api/me's stores lists: a copy on someone's own computer
// has none (docs/self-host.md). Sign-in uses PKCE; the tokens stay in this browser. Google's code exchange and refresh go
// through Lexicommons, because Google requires the client secret for web clients. OneDrive's do too once the site has its
// secret (/api/storage/config's onedrive.via "server"): Microsoft ends a single-page app's sign-in 24 hours after it's made,
// and keeps a web app's 90 days from each use. Without it (via "browser") the device trades with Microsoft itself, as it
// always did; a sign-in remembers which way it was made (via), and is renewed that way.
// Files: listFiles gives each file's version (Drive's version number, Dropbox's rev, OneDrive's eTag), and writeFile
// returns the new one; given { version }, a write happens only while the file is still at that version (null: only
// while there's none), and otherwise throws an error with conflict: true. Dropbox and OneDrive check it; Drive has no
// such check, so there the last write wins and sync.js's next round puts back what it lost.

const TOKEN_KEY = (provider) => `lc_storage_${provider}`;
const PENDING_KEY = "lc_storage_pending";
export const PROVIDERS = { google: "Google Drive", dropbox: "Dropbox", onedrive: "OneDrive" };
const AVAILABLE_KEY = "lc_storage_available";
const MS_AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";

function base64url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteLength = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Hex(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let configPromise = null;
// The storage settings, once a visit. A failure isn't kept, so the next press tries again; and it's said in words, never the browser's
// own ("Failed to fetch").
function config() {
  configPromise ??= fetch("/api/storage/config", { credentials: "same-origin" })
    .catch(() => {
      throw new TypeError(navigator.onLine === false ? "You're offline. Try again once you're back." : "Lexicommons couldn't be reached. Try again in a moment.");
    })
    .then((r) => {
      if (!r.ok) throw new Error("Lexicommons had a problem on its side. Try again in a moment.");
      return r.json();
    })
    .catch((error) => {
      configPromise = null;
      throw error;
    });
  return configPromise;
}

function readTokens(provider) {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY(provider)) ?? "null");
  } catch {
    return null;
  }
}

function saveTokens(provider, tokens) {
  localStorage.setItem(TOKEN_KEY(provider), JSON.stringify(tokens));
}

function readPending() {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

const DEFAULT_PROVIDERS = ["google", "dropbox", "onedrive"];
/** What /api/me says this site offers, kept so a screen knows at its first frame, and offline. */
export function rememberProviders(ids) {
  if (!Array.isArray(ids)) return;
  try {
    localStorage.setItem(AVAILABLE_KEY, JSON.stringify(ids));
  } catch {}
}

/** The stores this site offers, known at once (shell/main.js told it at the start, from /api/me). */
export function knownProviders() {
  try {
    const saved = JSON.parse(localStorage.getItem(AVAILABLE_KEY) ?? "null");
    if (Array.isArray(saved)) return saved.filter((id) => Object.hasOwn(PROVIDERS, id));
  } catch {}
  return DEFAULT_PROVIDERS;
}

export function isConnected(provider) {
  return Boolean(readTokens(provider)?.refreshToken || readTokens(provider)?.accessToken);
}

/** Whether this storage's sign-in ended (Microsoft refused to renew it for good): Settings offers Connect, with why. */
export function signInEnded(provider) {
  return Boolean(readTokens(provider)?.ended) && !isConnected(provider);
}

/**
 * Its sign-in is over: forget the tokens (so syncing stops asking) and say so once, unless another tab has connected again since
 * this one read them (`used`: the refresh token it tried).
 */
function ended(provider, used) {
  if (readTokens(provider)?.refreshToken === used) saveTokens(provider, { ended: Date.now() });
  // Shown after the storage's name ("OneDrive: its sign-in ended…"), as Check and the sync's line show every storage's error.
  const error = new Error("its sign-in ended. Connect it again to keep syncing.");
  error.ended = true;
  return error;
}

// --- Connecting -----------------------------------------------------------------------------------------------------

export async function connect(provider) {
  const settings = await config();
  const verifier = randomString(48);
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = randomString(16);
  // OneDrive through the site: its own redirect (the Entra app's Web platform), and the code traded on the server.
  const viaServer = provider === "onedrive" && settings.onedrive.via === "server";
  // Keyed by state, so starting twice (a double tap) can't overwrite the sign-in the provider answers.
  const pending = readPending();
  pending[state] = { provider, verifier, startedAt: Date.now(), ...(viaServer ? { via: "server" } : {}) };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const pkce = { code_challenge: challenge, code_challenge_method: "S256", state, redirect_uri: settings.redirectUri, response_type: "code" };
  const requests = {
    google: [
      "https://accounts.google.com/o/oauth2/v2/auth",
      { ...pkce, client_id: settings.google.clientId, scope: settings.google.scope, access_type: "offline", prompt: "consent", include_granted_scopes: "false" },
    ],
    dropbox: ["https://www.dropbox.com/oauth2/authorize", { ...pkce, client_id: settings.dropbox.appKey, token_access_type: "offline" }],
    onedrive: [
      `${MS_AUTH}/authorize`,
      { ...pkce, ...(viaServer ? { redirect_uri: settings.onedrive.redirectUri } : {}), client_id: settings.onedrive.clientId, scope: settings.onedrive.scope, response_mode: "query" },
    ],
  };
  const [base, params] = requests[provider];
  location.assign(`${base}?${new URLSearchParams(params)}`);
}

/** Runs on /app/storage/callback: checks the state, trades the code, stores the tokens. Returns the provider. */
export async function finishConnect(search) {
  const params = new URLSearchParams(search);
  const all = readPending();
  const entry = all[params.get("state") ?? ""];
  sessionStorage.removeItem(PENDING_KEY);
  if (!entry || Date.now() - entry.startedAt > 15 * 60_000) {
    throw new Error("This sign-in wasn't started here, or it expired. Try connecting again.");
  }
  const pending = { ...entry, state: params.get("state") };
  if (params.get("error")) throw new Error(`${PROVIDERS[pending.provider]} said: ${params.get("error_description") || params.get("error")}`);
  if (!params.get("code")) throw new Error("The sign-in reply had no code. Try connecting again.");
  const settings = await config();
  const now = Date.now();
  if (pending.provider === "google") {
    const response = await fetch("/api/storage/google/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ code: params.get("code"), codeVerifier: pending.verifier }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Google refused the sign-in (${data.error}${data.detail ? `: ${data.detail}` : ""}).`);
    saveTokens("google", { accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: now + data.expiresIn * 1000 });
  } else if (pending.provider === "onedrive" && pending.via === "server") {
    // The site adds its secret and passes Microsoft's answer back; nothing is kept there.
    const response = await fetch("/api/storage/onedrive/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ code: params.get("code"), codeVerifier: pending.verifier }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        response.status === 400
          ? `Microsoft refused the sign-in (${data.detail || data.error}).`
          : "Lexicommons couldn't finish connecting OneDrive just now. Try connecting again in a while.",
      );
    }
    saveTokens("onedrive", { accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: now + data.expiresIn * 1000, via: "server" });
  } else if (pending.provider === "onedrive") {
    // A single-page-app client: Microsoft answers the browser directly (CORS), no secret involved.
    const response = await fetch(`${MS_AUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.onedrive.clientId,
        scope: settings.onedrive.scope,
        code: params.get("code"),
        redirect_uri: settings.redirectUri,
        grant_type: "authorization_code",
        code_verifier: pending.verifier,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Microsoft refused the sign-in (${data.error_description || data.error}).`);
    saveTokens("onedrive", { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: now + data.expires_in * 1000 });
  } else {
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: params.get("code"),
        grant_type: "authorization_code",
        client_id: settings.dropbox.appKey,
        redirect_uri: settings.redirectUri,
        code_verifier: pending.verifier,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Dropbox refused the sign-in (${data.error_description || data.error}).`);
    saveTokens("dropbox", { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: now + data.expires_in * 1000 });
  }
  return pending.provider;
}

async function accessToken(provider) {
  const tokens = readTokens(provider);
  if (!tokens) throw new Error(`${PROVIDERS[provider]} isn't connected.`);
  if (tokens.accessToken && tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) throw new Error(`${PROVIDERS[provider]} needs connecting again.`);
  const settings = await config();
  let fresh;
  if (provider === "google") {
    const response = await fetch("/api/storage/google/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("Google Drive needs connecting again.");
    fresh = { accessToken: data.accessToken, expiresIn: data.expiresIn };
  } else if (provider === "onedrive" && tokens.via === "server") {
    const response = await fetch("/api/storage/onedrive/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Ended: Microsoft won't renew it (90 days unused, or taken back), or the site no longer has its secret, the only way to renew it.
      if (data.error === "invalid_grant" || data.error === "not_offered") throw ended("onedrive", tokens.refreshToken);
      throw new Error(
        response.status === 401 ? "sign in to Lexicommons again to keep it syncing." : "Lexicommons couldn't reach it just now; it tries again in a while.",
      );
    }
    fresh = { accessToken: data.accessToken, expiresIn: data.expiresIn, refreshToken: data.refreshToken };
  } else if (provider === "onedrive") {
    const response = await fetch(`${MS_AUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.onedrive.clientId,
        scope: settings.onedrive.scope,
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      // Single-page-app refresh tokens end 24 hours after the sign-in. Once the site renews OneDrive's sign-ins itself, one made this way
      // can never move over, so Microsoft's refusal ends it: Settings offers Connect, which makes a sign-in the new way. Until then, as
      // it always was.
      if (settings.onedrive.via === "server" && response.status >= 400 && response.status < 500 && response.status !== 429) throw ended("onedrive", tokens.refreshToken);
      throw new Error("OneDrive needs connecting again.");
    }
    fresh = { accessToken: data.access_token, expiresIn: data.expires_in, refreshToken: data.refresh_token };
  } else {
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: settings.dropbox.appKey }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("Dropbox needs connecting again.");
    fresh = { accessToken: data.access_token, expiresIn: data.expires_in };
  }
  saveTokens(provider, {
    ...tokens,
    accessToken: fresh.accessToken,
    // Microsoft rotates refresh tokens on every use; the others keep the original.
    refreshToken: fresh.refreshToken ?? tokens.refreshToken,
    expiresAt: Date.now() + fresh.expiresIn * 1000,
  });
  return fresh.accessToken;
}

async function checked(response, what) {
  if (response.ok) return response;
  const text = await response.text().catch(() => "");
  throw new Error(`${what} failed (${response.status}): ${text.slice(0, 160)}`);
}

/** The error a write gives when the file isn't at the version it was written against. */
function conflict(name) {
  const error = new Error(`${name} changed while this device was writing it.`);
  error.conflict = true;
  return error;
}

// --- Files ----------------------------------------------------------------------------------------------------------

const google = {
  // Drive allows two files with one name (two devices creating it at once): the oldest is the one, everywhere.
  async find(token, name) {
    const q = encodeURIComponent(`name = '${name.replace(/'/g, "\\'")}'`);
    const response = await checked(
      await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&orderBy=createdTime&fields=files(id,name)`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      "Drive search",
    );
    return (await response.json()).files[0] ?? null;
  },
  async write(name, blob, contentType) {
    // Drive can't write only while a file is at a version, so options.version is ignored here.
    const token = await accessToken("google");
    const existing = await google.find(token, name);
    if (existing) {
      const response = await checked(
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media&fields=id,version`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
          body: blob,
        }),
        "Drive update",
      );
      return { version: String((await response.json()).version) };
    }
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name, parents: ["appDataFolder"] })], { type: "application/json" }));
    form.append("file", new Blob([blob], { type: contentType }));
    const response = await checked(
      await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }),
      "Drive upload",
    );
    return { version: String((await response.json()).version) };
  },
  async list() {
    const token = await accessToken("google");
    const files = [];
    let page = "";
    do {
      const response = await checked(
        await fetch(
          `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&orderBy=createdTime&pageSize=1000&fields=nextPageToken,files(id,name,size,modifiedTime,version)${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
        "Drive list",
      );
      const data = await response.json();
      files.push(...data.files);
      page = data.nextPageToken ?? "";
    } while (page);
    // One per name, the oldest (as find picks).
    const seen = new Set();
    return files
      .filter((f) => !seen.has(f.name) && seen.add(f.name))
      .map((f) => ({ name: f.name, size: Number(f.size ?? 0), modified: f.modifiedTime, version: String(f.version) }));
  },
  async read(name) {
    const token = await accessToken("google");
    const file = await google.find(token, name);
    if (!file) throw new Error(`${name} isn't in Drive.`);
    const response = await checked(
      await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } }),
      "Drive download",
    );
    return response.blob();
  },
  async revoke() {
    const tokens = readTokens("google");
    const token = tokens?.refreshToken ?? tokens?.accessToken;
    // Google's revoke endpoint doesn't send CORS headers, so this is fire-and-forget.
    if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", mode: "no-cors" }).catch(() => {});
  },
};

const dropboxArg = (value) => JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

const dropbox = {
  async write(name, blob, _contentType, { version } = {}) {
    const token = await accessToken("dropbox");
    const mode = version === undefined ? "overwrite" : version === null ? "add" : { ".tag": "update", update: version };
    const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": dropboxArg({ path: `/${name}`, mode, mute: true, strict_conflict: version !== undefined }),
      },
      body: blob,
    });
    if (response.status === 409 && /conflict/.test(await response.clone().text().catch(() => ""))) throw conflict(name);
    await checked(response, "Dropbox upload");
    return { version: (await response.json()).rev };
  },
  async list() {
    const token = await accessToken("dropbox");
    const post = async (url, body) =>
      (
        await checked(
          await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }),
          "Dropbox list",
        )
      ).json();
    let data = await post("https://api.dropboxapi.com/2/files/list_folder", { path: "" });
    const entries = [...data.entries];
    while (data.has_more) {
      data = await post("https://api.dropboxapi.com/2/files/list_folder/continue", { cursor: data.cursor });
      entries.push(...data.entries);
    }
    return entries.filter((e) => e[".tag"] === "file").map((e) => ({ name: e.name, size: e.size, modified: e.server_modified, version: e.rev }));
  },
  async read(name) {
    const token = await accessToken("dropbox");
    const response = await checked(
      await fetch("https://content.dropboxapi.com/2/files/download", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Dropbox-API-Arg": dropboxArg({ path: `/${name}` }) },
      }),
      "Dropbox download",
    );
    return response.blob();
  },
  async revoke() {
    const token = readTokens("dropbox")?.accessToken;
    if (token) await fetch("https://api.dropboxapi.com/2/auth/token/revoke", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  },
};

const GRAPH_APP_FOLDER = "https://graph.microsoft.com/v1.0/me/drive/special/approot";
const graphPath = (name) => `${GRAPH_APP_FOLDER}:/${encodeURIComponent(name)}:`;

let appFolderReady = false;
/** Microsoft creates the app folder on the first request for it, never on a write into it; ask once per session. */
async function ensureAppFolder(token) {
  if (appFolderReady) return;
  let response;
  try {
    response = await fetch(GRAPH_APP_FOLDER, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  } catch {
    // A Microsoft account that has never opened OneDrive has no drive yet; Graph hangs until it's set up.
    throw new Error("OneDrive isn't set up for this Microsoft account yet. Open onedrive.live.com once, then try again.");
  }
  await checked(response, "OneDrive folder");
  appFolderReady = true;
}

const ONEDRIVE_SIMPLE = 4 * 1024 * 1024; // the most a simple upload takes; past it, an upload session
const ONEDRIVE_PIECE = 32 * 320 * 1024; // 10 MiB: one piece of an upload session

const onedrive = {
  async write(name, blob, contentType, { version } = {}) {
    const token = await accessToken("onedrive");
    await ensureAppFolder(token);
    const ifMatch = typeof version === "string" ? { "If-Match": version } : {};
    const onConflict = version === null ? "fail" : "replace";
    let response;
    if (blob.size <= ONEDRIVE_SIMPLE) {
      response = await fetch(`${graphPath(name)}/content?@microsoft.graph.conflictBehavior=${onConflict}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType, ...ifMatch },
        body: blob,
      });
    } else {
      // An upload session, sent in pieces of ONEDRIVE_PIECE in turn (Graph takes less than 60 MiB in one, a multiple
      // of 320 KiB but the last; the upload URL carries its own authorization, so no token goes with them).
      const session = await fetch(`${graphPath(name)}/createUploadSession`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...ifMatch },
        body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": onConflict } }),
      });
      if (session.status === 409 || session.status === 412) throw conflict(name);
      const { uploadUrl } = await (await checked(session, "OneDrive upload session")).json();
      for (let start = 0; start < blob.size; start += ONEDRIVE_PIECE) {
        const end = Math.min(start + ONEDRIVE_PIECE, blob.size);
        response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes ${start}-${end - 1}/${blob.size}` }, body: blob.slice(start, end) });
        if (end < blob.size && response.status !== 202) {
          await fetch(uploadUrl, { method: "DELETE" }).catch(() => {});
          if (response.status === 409 || response.status === 412) throw conflict(name);
          throw new Error(`OneDrive upload failed (${response.status}) after ${start} of ${blob.size} bytes.`);
        }
      }
    }
    if (response.status === 409 || response.status === 412) throw conflict(name);
    await checked(response, "OneDrive upload");
    return { version: (await response.json()).eTag };
  },
  async list() {
    const token = await accessToken("onedrive");
    const items = [];
    let url = `${GRAPH_APP_FOLDER}/children?$select=name,size,lastModifiedDateTime,file,eTag&$top=1000`;
    while (url) {
      const data = await (await checked(await fetch(url, { headers: { Authorization: `Bearer ${token}` } }), "OneDrive list")).json();
      items.push(...data.value);
      url = data["@odata.nextLink"] ?? "";
    }
    return items.filter((item) => item.file).map((item) => ({ name: item.name, size: item.size, modified: item.lastModifiedDateTime, version: item.eTag }));
  },
  async read(name) {
    const token = await accessToken("onedrive");
    const response = await checked(
      await fetch(`${graphPath(name)}/content`, { headers: { Authorization: `Bearer ${token}` } }),
      "OneDrive download",
    );
    return response.blob();
  },
  async revoke() {
    // Microsoft has no per-app token revoke for personal accounts; forgetting the tokens ends the connection here,
    // and the user removes the app's access at account.live.com/consent/Manage.
  },
};

const IMPL = { google, dropbox, onedrive };

/** Writes a file: { version } (options.version: write only while it's at that version, null: only while there's none). */
export const writeFile = (provider, name, blob, contentType = "application/octet-stream", options = {}) => IMPL[provider].write(name, blob, contentType, options);
/** The files in Lexicommons' folder: [{ name, size, modified, version }]. */
export const listFiles = (provider) => IMPL[provider].list();
export const readFile = (provider, name) => IMPL[provider].read(name);

export async function disconnect(provider) {
  await IMPL[provider].revoke();
  localStorage.removeItem(TOKEN_KEY(provider));
}
