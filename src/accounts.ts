// Accounts: passkey sign-up and sign-in, more passkeys per account, and cookie sessions (Google and GitHub: signin.ts). A session cookie holds a
// random token; only its sha256 is stored. Challenges live in D1 for five minutes, bound to a short-lived cookie.

import { accountSyncKeysOf, forgetAccountSyncStatement } from "./account-sync";
import { BILLING_TABLES } from "./billing";
import { forgetBugReportsStatement, screenshotKeysOf } from "./bug-reports";
import { takeChallenge } from "./challenges";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppContext, Env, SessionUser } from "./env";
import { lookImageKey } from "./looks";
import { practiceRoom } from "./practice";
import { deleteStagedStatement, stagedKeysOf } from "./library-admin";
import { uploadKey } from "./library";
import { revokeConnection } from "./revoked";
import { forgetRequestsStatements } from "./board";
import { forgetGrammarStatements } from "./grammar-suggestions";
import { forgetAccountStatements, itemsTouchedBy, recountStatements } from "./community";
import { booksTouchedBy, forgetBookStatements, recountBookStatements } from "./community-books";
import { PACK_TABLES } from "./packs";
import { TEXT_TABLES } from "./texts";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  clearCookieHeader,
  cookieHeader,
  randomId,
  readCookie,
  sha256Hex,
} from "./util";

// The session itself lives in sessions.ts (testable apart); these are its names here, as before.
export { getSessionUser, SESSION_COOKIE, sessionOf, startSession } from "./sessions";
import { forgetSession, forgetUser, getSessionUser, SESSION_COOKIE, startSession } from "./sessions";
import { signupsOpen, signupsPausedAnswer, watchLine } from "./signups";
const CHALLENGE_COOKIE = "lc_chal";
const CHALLENGE_SECONDS = 300;

type PasskeyRow = {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
};

async function saveChallenge(
  env: Env,
  challenge: string,
  kind: "register" | "login" | "add-passkey",
  userId: string | null,
  userName: string | null,
): Promise<string> {
  const id = randomId(18);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM challenges WHERE expires_at < ?").bind(now),
    env.DB.prepare("INSERT INTO challenges (id, challenge, kind, user_id, user_name, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
      id,
      challenge,
      kind,
      userId,
      userName,
      now + CHALLENGE_SECONDS * 1000,
    ),
  ]);
  return cookieHeader(CHALLENGE_COOKIE, id, CHALLENGE_SECONDS);
}


// AUTH_LIMITER per connection, on the ceremony's options call only: its verify can't run without the one-time challenge that call made
// (takeChallenge), so counting both only halved how many people behind one address (a school, an office) could sign up in a minute.
async function limited(c: Context<AppContext>): Promise<boolean> {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.AUTH_LIMITER.limit({ key: `auth:${ip}` });
  return !success;
}

// A verify spends nothing of that count, but each one carrying a challenge cookie is a write to D1 (takeChallenge), so made-up ones from one
// connection are held to the same 60 a minute on a count of their own (7 Nov 2026, the launch's security pass: with no limit, junk verifies
// were writes to D1 as fast as one connection could send them). No real sign-up meets it: each verify follows an options call of its own.
async function verifyLimited(c: Context<AppContext>): Promise<boolean> {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.AUTH_LIMITER.limit({ key: `verify:${ip}` });
  return !success;
}

function fail(c: Context<AppContext>, message: string, status: 400 | 401 | 429 = 400) {
  return c.json({ error: message }, status, { "Set-Cookie": clearCookieHeader(CHALLENGE_COOKIE) });
}

/**
 * A ceremony's answer as the browser sent it: a JSON object, else null, refused in words (BAD_ANSWER). A body that isn't one (not JSON,
 * an array, null) is a script's, never a passkey's: a 400, not a 500 logged as the server's error.
 */
async function ceremonyAnswer<T>(c: Context<AppContext>): Promise<T | null> {
  const body = await c.req.json<unknown>().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as T) : null;
}
const BAD_ANSWER = "The passkey's answer didn't come through whole. Try again.";

export const accounts = new Hono<AppContext>();

accounts.post("/register/options", async (c) => {
  // New accounts paused (signups.ts): refused before the device is asked for a passkey, with nothing counted or written.
  if (!signupsOpen(c.env)) return signupsPausedAnswer(c);
  if (await limited(c)) return fail(c, "Too many attempts. Wait a minute.", 429);
  const body = await c.req.json<{ name?: string }>().catch(() => ({ name: undefined }));
  const name = (body.name ?? "").trim();
  if (name.length < 1 || name.length > 40) return fail(c, "Pick a name between 1 and 40 characters.");
  const userId = randomId(16);
  const options = await generateRegistrationOptions({
    rpName: c.env.RP_NAME,
    rpID: c.env.RP_ID,
    userName: name,
    userDisplayName: name,
    userID: new Uint8Array(new TextEncoder().encode(userId)),
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  const setCookie = await saveChallenge(c.env, options.challenge, "register", userId, name);
  return c.json(options, 200, { "Set-Cookie": setCookie });
});

// Never refused for the pause: a challenge from before it already made a passkey on the person's device (signups.ts).
accounts.post("/register/verify", async (c) => {
  if (await verifyLimited(c)) return fail(c, "Too many attempts. Wait a minute.", 429);
  const pending = await takeChallenge(c.env, c.req.raw, "register");
  if (!pending?.user_id || !pending.user_name) return fail(c, "That sign-up expired. Try again.");
  const response = await ceremonyAnswer<RegistrationResponseJSON>(c);
  if (!response) return fail(c, BAD_ANSWER);
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: c.env.PUBLIC_ORIGIN,
    expectedRPID: c.env.RP_ID,
  }).catch(() => null);
  if (!result?.verified) return fail(c, "The passkey couldn't be verified.");
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").bind(pending.user_id, pending.user_name, now),
    c.env.DB.prepare(
      "INSERT INTO passkeys (id, user_id, public_key, counter, transports, device_type, backed_up, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      credential.id,
      pending.user_id,
      bytesToBase64Url(credential.publicKey),
      credential.counter,
      JSON.stringify(credential.transports ?? []),
      credentialDeviceType,
      credentialBackedUp ? 1 : 0,
      now,
      now,
    ),
  ]);
  watchLine("signup");
  const headers = new Headers();
  headers.append("Set-Cookie", clearCookieHeader(CHALLENGE_COOKIE));
  headers.append("Set-Cookie", await startSession(c.env, pending.user_id, c.req.header("User-Agent") ?? null));
  return new Response(JSON.stringify({ ok: true, user: { id: pending.user_id, name: pending.user_name } }), {
    headers: withJson(headers),
  });
});

accounts.post("/login/options", async (c) => {
  if (await limited(c)) return fail(c, "Too many attempts. Wait a minute.", 429);
  const options = await generateAuthenticationOptions({ rpID: c.env.RP_ID, userVerification: "preferred" });
  const setCookie = await saveChallenge(c.env, options.challenge, "login", null, null);
  return c.json(options, 200, { "Set-Cookie": setCookie });
});

accounts.post("/login/verify", async (c) => {
  if (await verifyLimited(c)) return fail(c, "Too many attempts. Wait a minute.", 429);
  const pending = await takeChallenge(c.env, c.req.raw, "login");
  if (!pending) return fail(c, "That sign-in expired. Try again.");
  const response = await ceremonyAnswer<AuthenticationResponseJSON>(c);
  if (typeof response?.id !== "string") return fail(c, BAD_ANSWER);
  const passkey = await c.env.DB.prepare("SELECT id, user_id, public_key, counter, transports FROM passkeys WHERE id = ?")
    .bind(response.id)
    .first<PasskeyRow>();
  if (!passkey) return fail(c, "This passkey isn't registered here.", 401);
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: c.env.PUBLIC_ORIGIN,
    expectedRPID: c.env.RP_ID,
    credential: {
      id: passkey.id,
      publicKey: base64UrlToBytes(passkey.public_key),
      counter: passkey.counter,
      transports: JSON.parse(passkey.transports ?? "[]"),
    },
  }).catch(() => null);
  if (!result?.verified) return fail(c, "The passkey couldn't be verified.", 401);
  await c.env.DB.prepare("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?")
    .bind(result.authenticationInfo.newCounter, Date.now(), passkey.id)
    .run();
  const user = await c.env.DB.prepare("SELECT id, name FROM users WHERE id = ?").bind(passkey.user_id).first<SessionUser>();
  const headers = new Headers();
  headers.append("Set-Cookie", clearCookieHeader(CHALLENGE_COOKIE));
  headers.append("Set-Cookie", await startSession(c.env, passkey.user_id, c.req.header("User-Agent") ?? null));
  return new Response(JSON.stringify({ ok: true, user }), { headers: withJson(headers) });
});

accounts.post("/passkeys/options", async (c) => {
  const user = c.get("user");
  if (!user) return fail(c, "Sign in first.", 401);
  const existing = await c.env.DB.prepare("SELECT id, transports FROM passkeys WHERE user_id = ?")
    .bind(user.id)
    .all<{ id: string; transports: string | null }>();
  const options = await generateRegistrationOptions({
    rpName: c.env.RP_NAME,
    rpID: c.env.RP_ID,
    userName: user.name,
    userDisplayName: user.name,
    userID: new Uint8Array(new TextEncoder().encode(user.id)),
    attestationType: "none",
    excludeCredentials: existing.results.map((p) => ({ id: p.id, transports: JSON.parse(p.transports ?? "[]") })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  const setCookie = await saveChallenge(c.env, options.challenge, "add-passkey", user.id, user.name);
  return c.json(options, 200, { "Set-Cookie": setCookie });
});

accounts.post("/passkeys/verify", async (c) => {
  const user = c.get("user");
  if (!user) return fail(c, "Sign in first.", 401);
  const pending = await takeChallenge(c.env, c.req.raw, "add-passkey");
  if (!pending || pending.user_id !== user.id) return fail(c, "That request expired. Try again.");
  const response = await ceremonyAnswer<RegistrationResponseJSON>(c);
  if (!response) return fail(c, BAD_ANSWER);
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: c.env.PUBLIC_ORIGIN,
    expectedRPID: c.env.RP_ID,
  }).catch(() => null);
  if (!result?.verified) return fail(c, "The passkey couldn't be verified.");
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO passkeys (id, user_id, public_key, counter, transports, device_type, backed_up, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      credential.id,
      user.id,
      bytesToBase64Url(credential.publicKey),
      credential.counter,
      JSON.stringify(credential.transports ?? []),
      credentialDeviceType,
      credentialBackedUp ? 1 : 0,
      now,
      now,
    )
    .run();
  return c.json({ ok: true }, 200, { "Set-Cookie": clearCookieHeader(CHALLENGE_COOKIE) });
});

accounts.post("/logout", async (c) => {
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    await forgetSession(token);
  }
  return c.json({ ok: true }, 200, { "Set-Cookie": clearCookieHeader(SESSION_COOKIE) });
});

function withJson(headers: Headers): Headers {
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return headers;
}

/**
 * Deletes an account and everything the server holds for it: its uploaded files in R2, every connected app's grant
 * (and so its tokens), then its rows. Children are deleted before the user row, so nothing depends on foreign keys.
 */
export async function deleteAccount(env: Env, userId: string): Promise<{ files: number; connections: number }> {
  let connections = 0;
  let cursor: string | undefined;
  do {
    const page = await env.OAUTH_PROVIDER.listUserGrants(userId, { cursor });
    for (const grant of page.items) {
      // Marked revoked first, so a refresh under way can't bring it back (src/revoked.ts); the marker names no one, so it stays.
      await revokeConnection(env, env.OAUTH_PROVIDER, userId, grant.id);
      connections++;
    }
    cursor = page.cursor;
  } while (cursor);
  // The practice room keeps its own storage: practices not yet on a device, and what you know for your AI.
  await practiceRoom(env, userId).wipe();
  // Files (uploads, the look's images, files staged for the open library): their rows go in the batch, which says which
  // they were, and their bytes after it, by keys fixed by id or hash. So a file arriving mid-delete either finds no row
  // and keeps nothing, or is in what the batch returns.
  // What it shared in Explore stays (under its license, as "a former member"); its follows and likes go, and the counts
  // of what it followed and liked are put right after.
  const touched = await itemsTouchedBy(env, userId);
  const touchedBooks = await booksTouchedBy(env, userId);
  const forget = await forgetAccountStatements(env, userId);
  // The books it shared stay too, and the books it added from Explore go (community-books.ts).
  const forgetBooks = await forgetBookStatements(env, userId);
  const [uploadRows, imageRows, stagedRows, bugRows, syncRows] = await env.DB.batch(
    [
      env.DB.prepare("DELETE FROM uploads WHERE user_id = ? RETURNING id, r2_key").bind(userId),
      env.DB.prepare("DELETE FROM look_images WHERE user_id = ? RETURNING hash").bind(userId),
      deleteStagedStatement(env, userId),
      // Its bug reports go, and their screenshots after the batch (bug-reports.ts).
      forgetBugReportsStatement(env, userId),
      // Its own copy of its progress goes at once, rows here and bytes after the batch (account-sync.ts).
      forgetAccountSyncStatement(env, userId),
      // Its requests in Explore go (board.ts), and its "me too"s come off others' counts, before its likes go.
      ...forgetRequestsStatements(env, userId),
      // Its suggestions to a language's grammar go too (grammar-suggestions.ts): what was accepted stays, unnamed.
      ...forgetGrammarStatements(env, userId),
      ...forgetBooks,
      ...forget,
    ].concat(
      ["sessions", "passkeys", "identities", "api_tokens", "notes", "challenges", "refresh_once", "looks", "look_history", "themes", "theme_library", "user_roles", "progress_clears", "push_subscriptions", "reminders", "push_queue", ...TEXT_TABLES, ...PACK_TABLES, ...BILLING_TABLES, "account_emails", "email_codes"]
        .map((table) => env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId))
        // The codes it asked for keep counting against their addresses for their hour, no longer its (account-email.ts addCode).
        .concat(env.DB.prepare("UPDATE email_sends SET user_id = NULL WHERE user_id = ?").bind(userId))
        .concat(env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId)),
    ),
  );
  // Its sessions are gone from D1; this isolate's moment of them too (sessions.ts).
  forgetUser(userId);
  const uploads = uploadRows!.results as { id: string; r2_key: string | null }[];
  const images = imageRows!.results as { hash: string }[];
  const staged = stagedRows!.results as { id: string; r2_key: string | null }[];
  // Every row's key, pending ones too (bytes may be arriving); the count is of files that had arrived.
  const bugShots = screenshotKeysOf(bugRows);
  const keys = [...uploads.map((row) => uploadKey(userId, row.id)), ...images.map((row) => lookImageKey(userId, row.hash)), ...stagedKeysOf(userId, stagedRows!), ...bugShots, ...accountSyncKeysOf(userId, syncRows)];
  for (let i = 0; i < keys.length; i += 1000) await env.UPLOADS.delete(keys.slice(i, i + 1000));
  if (touched.length) await env.DB.batch(recountStatements(env, touched));
  if (touchedBooks.length) await env.DB.batch(recountBookStatements(env, touchedBooks));
  return { files: uploads.filter((row) => row.r2_key).length + images.length + staged.filter((row) => row.r2_key).length + bugShots.length, connections };
}
