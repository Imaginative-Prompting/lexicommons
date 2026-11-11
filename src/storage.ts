// Bring your own storage: the server's only part. The app talks to Google Drive, Dropbox and OneDrive directly from the
// device, and the tokens live on the device. Dropbox's PKCE flow needs no secret at all. Google's web clients can't
// trade a code without the client secret, so two routes add it and pass the answer straight back. OneDrive does the
// same once its secret is set (ONEDRIVE_CLIENT_SECRET): Microsoft gives a single-page app's refresh tokens 24 hours from
// the sign-in, and a web app's 90 days, renewed on every use
// (https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens). Without the secret, OneDrive stays the
// single-page app it was: the device trades its code with Microsoft itself. Nothing is stored, logged or kept here.

import { Hono } from "hono";
import type { Context } from "hono";
import type { AppContext, Env } from "./env";
import { recordServerError } from "./errors";
import { readTextLimited, standin } from "./util";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const ONEDRIVE_SCOPE = "Files.ReadWrite.AppFolder offline_access";

export const storage = new Hono<AppContext>();

storage.use("*", async (c, next) => {
  if (!c.get("user")) return c.json({ error: "sign_in_required" }, 401);
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.AUTH_LIMITER.limit({ key: `storage:${ip}` });
  if (!success) return c.json({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  await next();
});

/** The stores this site can offer: each one's app is registered for one address, so a copy on someone's computer has none. */
export const availableStores = (env: Env): string[] => [
  ...(env.GOOGLE_CLIENT_ID ? ["google"] : []),
  ...(env.DROPBOX_APP_KEY ? ["dropbox"] : []),
  ...(env.ONEDRIVE_CLIENT_ID ? ["onedrive"] : []),
];

/** Whether OneDrive's sign-in goes through this server: only once its client secret is set. */
export const onedriveViaServer = (env: Env): boolean => Boolean(env.ONEDRIVE_CLIENT_ID && env.ONEDRIVE_CLIENT_SECRET);

/**
 * Where OneDrive's sign-in comes back when it goes through this server: the Entra app's Web platform redirect. It's a path of its
 * own because Microsoft decides a token's kind by the platform its redirect is registered under, and the single-page app's
 * (STORAGE_REDIRECT_URI, /app/storage/callback) stays for the way without the secret.
 */
export const onedriveWebRedirect = (env: Env): string => new URL("/app/storage/onedrive", env.PUBLIC_ORIGIN).href;

storage.get("/config", (c) =>
  c.json({
    redirectUri: c.env.STORAGE_REDIRECT_URI,
    google: { clientId: c.env.GOOGLE_CLIENT_ID, scope: "https://www.googleapis.com/auth/drive.appdata" },
    dropbox: { appKey: c.env.DROPBOX_APP_KEY },
    // via "server": connect with the Web redirect and trade the code (and every refresh) here; "browser": as a single-page app.
    onedrive: {
      clientId: c.env.ONEDRIVE_CLIENT_ID,
      scope: ONEDRIVE_SCOPE,
      ...(onedriveViaServer(c.env) ? { via: "server", redirectUri: onedriveWebRedirect(c.env) } : { via: "browser" }),
    },
  }),
);

/** Passes Google's token response through, keeping only the fields the app needs. */
async function googleToken(params: Record<string, string>, clientId: string, clientSecret: string) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return { status: response.status as 400 | 401, body: { error: String(data.error ?? "token_error"), detail: String(data.error_description ?? "") } };
  }
  return {
    status: 200 as const,
    body: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresIn: data.expires_in,
      scope: data.scope,
    },
  };
}

// Microsoft's token endpoint, or under a local check its stand-in (util.ts standin: only when this server and the stand-in are both on
// localhost, so no setting can send a deployed site's secret anywhere else).
const microsoftTokenUrl = (env: Env) => {
  const local = standin(env);
  return local ? `${local}/microsoft/token` : MICROSOFT_TOKEN_URL;
};

/** Microsoft's error codes are short words (invalid_grant); anything else is reported as one word of our own. */
const errorCode = (value: unknown) => (typeof value === "string" && /^[a-z_]{1,40}$/.test(value) ? value : "token_error");

/**
 * One call to Microsoft's token endpoint with the secret added, its answer passed back with only the fields the app needs. Its refusals
 * go back as they are (400 with Microsoft's error, so the app can tell a sign-in that ended, invalid_grant, from the rest), but a refusal
 * of the secret itself, Microsoft unreachable or an answer that isn't one is ours: 502, counted in the error reports (only a fixed message
 * and Microsoft's error code), so connecting again is never asked for something only the site can put right. The secret is taken out of
 * anything passed back, though Microsoft never sends it.
 */
async function microsoftToken(env: Env, grant: "code" | "refresh", params: Record<string, string>) {
  const secret = env.ONEDRIVE_CLIENT_SECRET ?? "";
  const what = grant === "code" ? "code exchange" : "refresh";
  const count = (why: string) =>
    recordServerError(env, "server", new Error(`OneDrive's ${what}: ${why}`), `POST /api/storage/onedrive/${grant === "code" ? "token" : "refresh"}`).catch(() => false);
  const ours = async (why: string) => {
    await count(why);
    return { status: 502 as const, body: { error: "onedrive_unavailable" } };
  };
  let response: Response;
  try {
    response = await fetch(microsoftTokenUrl(env), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, client_id: env.ONEDRIVE_CLIENT_ID, client_secret: secret, scope: ONEDRIVE_SCOPE }),
    });
  } catch {
    return ours("Microsoft unreachable");
  }
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok) {
    if (!data || typeof data.access_token !== "string" || typeof data.expires_in !== "number") return ours("Microsoft answered with no token");
    return {
      status: 200 as const,
      body: {
        accessToken: data.access_token,
        refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
        expiresIn: data.expires_in,
        scope: typeof data.scope === "string" ? data.scope : "",
      },
    };
  }
  const error = errorCode(data?.error);
  if (error === "invalid_client" || response.status === 429 || response.status >= 500) return ours(`Microsoft answered ${response.status} ${error}`);
  // A sign-in that ended (invalid_grant) is the person's to renew; any other refusal is passed back too, and counted, since it's more
  // likely the registration than them (a redirect or a grant it doesn't allow).
  if (error !== "invalid_grant") await count(`Microsoft refused it, ${response.status} ${error}`);
  const detail = String(data?.error_description ?? "");
  return { status: 400 as const, body: { error, detail: (secret ? detail.split(secret).join("…") : detail).slice(0, 300) } };
}

/**
 * A token route's body, read only up to TOKEN_BODY and each field only as text up to `most` characters (6 Nov 2026, Codex C16: the
 * whole body was read and a 5 MB "token" went on to Google). Null when it's too big or not JSON; a field that isn't such text is "".
 */
const TOKEN_BODY = 16 * 1024;
const TOKEN_FIELD = 4096;
// Microsoft documents no length for its codes and refresh tokens; its own answers advise room for 2 KB, and B2C's codes have run to about
// 4,000 characters (https://learn.microsoft.com/en-us/answers/questions/1631489/), so twice that.
const MICROSOFT_FIELD = 8192;
async function tokenBody(c: Context<AppContext>, most: number, ...fields: string[]): Promise<Record<string, string> | null> {
  const text = await readTextLimited(c.req.raw, TOKEN_BODY);
  if (text === null) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  return Object.fromEntries(fields.map((field) => [field, typeof record[field] === "string" && (record[field] as string).length <= most ? (record[field] as string) : ""]));
}

storage.post("/google/token", async (c) => {
  const body = await tokenBody(c, TOKEN_FIELD, "code", "codeVerifier");
  if (!body) return c.json({ error: "bad_request" }, 400);
  if (!body.code || !body.codeVerifier) return c.json({ error: "missing_code" }, 400);
  const result = await googleToken(
    { grant_type: "authorization_code", code: body.code, code_verifier: body.codeVerifier, redirect_uri: c.env.STORAGE_REDIRECT_URI },
    c.env.GOOGLE_CLIENT_ID,
    c.env.GOOGLE_CLIENT_SECRET,
  );
  return c.json(result.body, result.status, { "Cache-Control": "no-store" });
});

storage.post("/google/refresh", async (c) => {
  const body = await tokenBody(c, TOKEN_FIELD, "refreshToken");
  if (!body) return c.json({ error: "bad_request" }, 400);
  if (!body.refreshToken) return c.json({ error: "missing_refresh_token" }, 400);
  const result = await googleToken(
    { grant_type: "refresh_token", refresh_token: body.refreshToken },
    c.env.GOOGLE_CLIENT_ID,
    c.env.GOOGLE_CLIENT_SECRET,
  );
  return c.json(result.body, result.status, { "Cache-Control": "no-store" });
});

// OneDrive's two, only while the secret is set: without it they're refused with nothing read or sent (the app is on the single-page way
// then, and a sign-in made this way can only be renewed here, so it's over: not_offered).
storage.post("/onedrive/token", async (c) => {
  if (!onedriveViaServer(c.env)) return c.json({ error: "not_offered" }, 404, { "Cache-Control": "no-store" });
  const body = await tokenBody(c, MICROSOFT_FIELD, "code", "codeVerifier");
  if (!body) return c.json({ error: "bad_request" }, 400);
  if (!body.code || !body.codeVerifier) return c.json({ error: "missing_code" }, 400);
  const result = await microsoftToken(c.env, "code", {
    grant_type: "authorization_code",
    code: body.code,
    code_verifier: body.codeVerifier,
    redirect_uri: onedriveWebRedirect(c.env),
  });
  return c.json(result.body, result.status, { "Cache-Control": "no-store" });
});

storage.post("/onedrive/refresh", async (c) => {
  if (!onedriveViaServer(c.env)) return c.json({ error: "not_offered" }, 404, { "Cache-Control": "no-store" });
  const body = await tokenBody(c, MICROSOFT_FIELD, "refreshToken");
  if (!body) return c.json({ error: "bad_request" }, 400);
  if (!body.refreshToken) return c.json({ error: "missing_refresh_token" }, 400);
  const result = await microsoftToken(c.env, "refresh", { grant_type: "refresh_token", refresh_token: body.refreshToken });
  return c.json(result.body, result.status, { "Cache-Control": "no-store" });
});
