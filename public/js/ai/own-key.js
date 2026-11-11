// A key of your own for the in-app AI (ai/inapp.js): kept on this device only, for this account, and used only to call the
// provider straight from here. It's never sent to Lexicommons, never synced and never in an export.
//
// Kept in IndexedDB, sealed with AES-GCM under a key this browser makes and can't hand out (a non-extractable CryptoKey, kept
// beside it), so the browser's files, a backup or another program reading them don't hold it in plain text. Script running
// in this page could still use it, as it must to send it: what guards against that is the CSP (no inline script, nothing from
// another site; src/app.ts), and what limits any harm is the key's own spending limit, which Connect with OpenRouter asks for.
// Signing out, deleting the account and clearing this device's data take it away (forgetKeys).
//
// Connect with OpenRouter is OAuth with PKCE (https://openrouter.ai/docs/guides/overview/auth/oauth): the person approves a key
// for Lexicommons on OpenRouter's page, and this device trades the code for it. Nothing to copy, and no key ever on screen.

import { PROVIDERS } from "./inapp.js";

const DB = "lx-own-key";
const STORE = "keys";
const SEAL = "seal"; // the record holding this browser's sealing key
const PENDING = "lx.own-key.pending.v1"; // sessionStorage: the PKCE verifier between leaving for OpenRouter and coming back
export const CALLBACK_PATH = "/app/key/callback";
const OPENROUTER = { auth: "https://openrouter.ai/auth", exchange: "https://openrouter.ai/api/v1/auth/keys", key: "https://openrouter.ai/api/v1/key" };
/**
 * The model a key of your own is used with, unless you choose another: OpenRouter's id, the name shown, and how long it thinks
 * before writing (sent only for this model, which takes it). Chosen by a bake-off on 5 Nov 2026:
 * of five, it graded every planted mistake right and translated every row right, cheapest, its first words in about 2 s.
 */
export const DEFAULT_MODEL = { id: "openai/gpt-6-luna", name: "GPT-6 Luna", effort: "low" };

const PRESENT = "lx.own-key.present.v1"; // localStorage: "1" while this device holds a key for the account signed in (no secret)
/** Whether this device holds a key for the account signed in, as last checked (checkKeyPresence): Practice opens on it. */
export const ownKeyPresent = () => {
  try {
    return localStorage.getItem(PRESENT) === "1";
  } catch {
    return false;
  }
};
const markPresent = (present) => {
  try {
    if (present) localStorage.setItem(PRESENT, "1");
    else localStorage.removeItem(PRESENT);
  } catch {}
};
/** Looks again for this account's key on this device (at start, and after a switch of account), where the site offers it. */
export async function checkKeyPresence(me) {
  markPresent(Boolean(me?.features?.ownKey && (await keySummary(me.user.id).catch(() => null))));
}

const listeners = new Set();
/** onKeyChange(fn): fn() whenever a key is saved or forgotten here. Returns a function that stops it. */
export function onKeyChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => fn());

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
const get = (key) => run("readonly", (s) => s.get(key));

/** 8 hex of a hash of the account's id, as sync.js tags its files: a key belongs to one account on this browser. */
async function tagOf(accountId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`lexicommons-own-key:${accountId}`));
  return [...new Uint8Array(digest).slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sealingKey() {
  const kept = await get(SEAL);
  if (kept instanceof CryptoKey) return kept;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await run("readwrite", (s) => s.put(key, SEAL));
  return key;
}

const lastFour = (key) => key.slice(-4);

/**
 * Saves a key for this account on this device: { provider, key, model?: { id, name }, limit? } (limit: the spending limit the
 * provider reported, null for none). Returns what's shown of it ({ provider, last4, model }).
 */
export async function saveKey(accountId, { provider = "openrouter", key, model = DEFAULT_MODEL, limit }) {
  await ready(accountId);
  if (!PROVIDERS[provider]) throw new Error("That provider isn't one Lexicommons can call.");
  const clean = String(key ?? "").trim();
  if (!/^[\x21-\x7e]{20,300}$/.test(clean)) throw new Error("That doesn't look like a key. Copy the whole key and try again.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sealingKey(), new TextEncoder().encode(clean));
  const effort = ["minimal", "low", "medium", "high"].includes(model.effort) ? model.effort : undefined;
  const record = { provider, iv, sealed, last4: lastFour(clean), model: { id: String(model.id).slice(0, 100), name: String(model.name).slice(0, 40), effort }, limit: limit ?? undefined, savedAt: Date.now() };
  await run("readwrite", (s) => s.put(record, recordKey(accountId)));
  markPresent(true);
  changed();
  return shown(record);
}
// IndexedDB transactions close on an await, so the account's tag is worked out (ready) before one starts.
const tags = new Map();
/** The record's key for an account whose tag is ready. */
function recordKey(accountId) {
  const tag = tags.get(accountId);
  if (!tag) throw new Error("Lexicommons couldn't tell which account this key is for. Reload and try again.");
  return `key:${tag}`;
}
async function ready(accountId) {
  if (!tags.has(accountId)) tags.set(accountId, await tagOf(accountId));
}

const shown = (record) => (record ? { provider: record.provider, providerName: PROVIDERS[record.provider]?.name ?? record.provider, last4: record.last4, model: record.model, limit: record.limit, savedAt: record.savedAt } : null);

/** What's shown of this account's key on this device, or null: { provider, providerName, last4, model, limit, savedAt }. */
export async function keySummary(accountId) {
  if (!accountId) return null;
  await ready(accountId);
  try {
    return shown(await get(recordKey(accountId)));
  } catch {
    return null;
  }
}

/**
 * Hands the key to fn for one use, and nothing else keeps it: fn(key, { provider, model }) → its result. Throws when there's
 * no key here for this account.
 */
export async function withKey(accountId, fn) {
  await ready(accountId);
  const record = await get(recordKey(accountId));
  if (!record) throw new Error("There's no key on this device for this account.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv }, await sealingKey(), record.sealed);
  return fn(new TextDecoder().decode(plain), { provider: record.provider, model: record.model });
}

/** Forgets this account's key on this device. */
export async function forgetKey(accountId) {
  if (!accountId) return;
  await ready(accountId);
  await run("readwrite", (s) => s.delete(recordKey(accountId)));
  markPresent(false);
  changed();
}

/** Forgets every key on this device, and the sealing key with them (signing out, deleting the account, clearing data). */
export async function forgetKeys() {
  try {
    sessionStorage.removeItem(PENDING);
    localStorage.removeItem(USAGE);
  } catch {}
  markPresent(false);
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
  tags.clear();
  changed();
}

// ---------- Connect with OpenRouter ----------

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Leaves for OpenRouter's page, where the person approves a key for Lexicommons (and can set its limit). */
export async function connectOpenRouter() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, at: Date.now() }));
  const url = new URL(OPENROUTER.auth);
  url.searchParams.set("callback_url", `${location.origin}${CALLBACK_PATH}`);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("key_label", "Lexicommons");
  location.assign(url.toString());
}

/** Back from OpenRouter with ?code=…: trades it for the key and saves it for this account. Returns what's shown of it. */
export async function finishOpenRouter(search, accountId) {
  const code = new URLSearchParams(search).get("code");
  let pending = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) ?? "null");
  } catch {}
  sessionStorage.removeItem(PENDING);
  if (!code) throw new Error("OpenRouter didn't send a key back. Try Connect again.");
  if (!pending?.verifier || Date.now() - pending.at > 15 * 60_000) throw new Error("That took too long, or started on another device. Try Connect again.");
  const response = await providerFetch(OPENROUTER.exchange, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, code_verifier: pending.verifier, code_challenge_method: "S256" }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.key !== "string") throw new Error("OpenRouter didn't hand over a key. Try Connect again.");
  await ready(accountId);
  const info = await keyInfo(data.key).catch(() => null);
  return saveKey(accountId, { provider: "openrouter", key: data.key, limit: info ? info.limit : undefined });
}

// ---------- what it costs ----------

const USAGE = "lx.own-key.usage.v1"; // this device's tally for the month: { month, calls, tokens, cost } (cost: what the provider reported)
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Adds one call's usage (the provider's usage object) to this device's tally for the month. */
export function noteUsage(usage) {
  if (!usage || typeof usage !== "object") return;
  try {
    const kept = JSON.parse(localStorage.getItem(USAGE) ?? "null");
    const now = kept?.month === thisMonth() ? kept : { month: thisMonth(), calls: 0, tokens: 0, cost: 0 };
    now.calls += 1;
    now.tokens += (Number(usage.prompt_tokens) || 0) + (Number(usage.completion_tokens) || 0);
    now.cost += Number(usage.cost) || 0;
    localStorage.setItem(USAGE, JSON.stringify(now));
  } catch {}
}

/** This device's tally of the in-app AI on your key this month: { calls, tokens, cost } (cost in the provider's dollars). */
export function usageThisMonth() {
  try {
    const kept = JSON.parse(localStorage.getItem(USAGE) ?? "null");
    if (kept?.month === thisMonth()) return { calls: kept.calls, tokens: kept.tokens, cost: kept.cost };
  } catch {}
  return { calls: 0, tokens: 0, cost: 0 };
}

// ---------- calling the provider ----------

/** A request to the provider: never with cookies, never saying where it came from, never to anywhere but the provider's own address. */
function providerFetch(url, init = {}) {
  return fetch(url, { ...init, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", mode: "cors" });
}

/** What OpenRouter says of a key: { limit, remaining, usedThisMonth } in dollars (limit null: none set). */
export async function keyInfo(key) {
  const response = await providerFetch(OPENROUTER.key, { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(response.status === 401 ? "OpenRouter doesn't accept this key." : `OpenRouter didn't answer (${response.status}).`);
  const { data } = await response.json();
  return { limit: data?.limit ?? null, remaining: data?.limit_remaining ?? null, usedThisMonth: data?.usage_monthly ?? null };
}

/** Checks a pasted key with its provider before it's saved, then saves it. */
export async function savePastedKey(accountId, { provider = "openrouter", key }) {
  const clean = String(key ?? "").trim();
  await ready(accountId);
  const info = await keyInfo(clean);
  return saveKey(accountId, { provider, key: clean, limit: info.limit });
}

/** The account's key's standing now, from its provider (null when there's no key here). */
export async function keyStanding(accountId) {
  if (!(await keySummary(accountId))) return null;
  return withKey(accountId, (key) => keyInfo(key));
}

/**
 * Sends a chat request (inapp.js chatBody) to the provider with this account's key and returns the response, whose body is
 * the stream readChat reads. A provider's refusal comes back in its own words.
 */
export async function callProvider(accountId, body, { signal } = {}) {
  return withKey(accountId, async (key, { provider }) => {
    const response = await providerFetch(PROVIDERS[provider].url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Lexicommons" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const said = typeof data?.error?.message === "string" ? data.error.message.slice(0, 200) : `${PROVIDERS[provider].name} answered ${response.status}.`;
      throw new Error(response.status === 402 ? `Your key is out of credit (${PROVIDERS[provider].name}: ${said})` : response.status === 401 ? `${PROVIDERS[provider].name} doesn't accept your key any more.` : said);
    }
    return response;
  });
}
