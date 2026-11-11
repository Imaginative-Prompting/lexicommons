// Sign in with Google, GitHub and Apple, beside passkeys, and the ways an account signs in.
//
// An identity is a provider's stable id for a person (Google's and Apple's `sub`, GitHub's numeric user id), never an email or a
// username. The round trip is a server-side code flow: PKCE (S256) for Google and GitHub, `state`, and a `nonce` for Google's and
// Apple's ID tokens. Apple is asked for no scope, so it gives neither an email nor a name, and answers by query like the others;
// its client secret is a short JWT this server signs with the Sign in with Apple key for each sign-in (appleClientSecret). The
// flow waits in D1 under its own short-lived cookie (single use), and `next` stays on the server the whole way, so an
// AI app's /authorize?… comes back intact. A provider's tokens are used once, to read who you are, and dropped.
//
// A sign-in nobody has used yet waits as "pending" (its own cookie) on the create step (/login/new): create an
// account with it, or sign in another way to add it to the account you have. Nothing is ever linked by email.

import { Hono } from "hono";
import type { Context } from "hono";
import { getSessionUser, startSession } from "./accounts";
import type { AppContext, Env } from "./env";
import { messagePage, newAccountPage, type PendingView } from "./pages";
import { signupsOpen, watchLine } from "./signups";
import { bytesToBase64Url, clearCookieHeader, cookieHeader, randomId, readCookie, safeNextPath, secretsEqual, standin } from "./util";

export const PROVIDERS = ["google", "github", "apple"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_NAMES: Record<Provider, string> = { google: "Google", github: "GitHub", apple: "Apple" };
export const isProvider = (value: unknown): value is Provider => PROVIDERS.includes(value as Provider);

const FLOW_COOKIE = "lc_oauth";
const FLOW_SECONDS = 600;
const PENDING_COOKIE = "lc_pending";
const PENDING_SECONDS = 900;

/** What the flow keeps between leaving for the provider and coming back. */
type Flow = {
  provider: Provider;
  state: string;
  verifier: string;
  nonce: string;
  next: string;
  // signin: the sign-in page. link: Settings, adding a way to the signed-in account (userId). attach: the create step's
  // "sign in to add it to your account".
  intent: "signin" | "link" | "attach";
  userId: string | null;
};

type Identity = { provider: Provider; subject: string; label: string | null; name: string | null };
type Pending = { identities: Identity[]; next: string };

class ProviderError extends Error {}

// ---------- the providers ----------

function endpoints(env: Env, provider: Provider) {
  const local = standin(env);
  if (provider === "google") {
    return local
      ? { authorize: `${local}/google/authorize`, token: `${local}/google/token`, issuers: [`${local}/google`], user: "" }
      : {
          authorize: "https://accounts.google.com/o/oauth2/v2/auth",
          token: "https://oauth2.googleapis.com/token",
          issuers: ["https://accounts.google.com", "accounts.google.com"],
          user: "",
        };
  }
  if (provider === "apple") {
    return local
      ? { authorize: `${local}/apple/authorize`, token: `${local}/apple/token`, issuers: [`${local}/apple`], user: "" }
      : { authorize: "https://appleid.apple.com/auth/authorize", token: "https://appleid.apple.com/auth/token", issuers: ["https://appleid.apple.com"], user: "" };
  }
  return local
    ? { authorize: `${local}/github/authorize`, token: `${local}/github/token`, issuers: [], user: `${local}/github/user` }
    : {
        authorize: "https://github.com/login/oauth/authorize",
        token: "https://github.com/login/oauth/access_token",
        issuers: [],
        user: "https://api.github.com/user",
      };
}

function client(env: Env, provider: Provider): { id: string; secret: string } | null {
  // Apple's secret is made for each sign-in from the key (appleClientSecret); here only whether all of it is there.
  if (provider === "apple")
    return env.APPLE_SERVICES_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY ? { id: env.APPLE_SERVICES_ID, secret: "" } : null;
  const id = provider === "google" ? env.GOOGLE_SIGNIN_CLIENT_ID : env.GITHUB_CLIENT_ID;
  const secret = provider === "google" ? env.GOOGLE_SIGNIN_CLIENT_SECRET : env.GITHUB_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

const redirectUri = (env: Env, provider: Provider) => `${env.PUBLIC_ORIGIN}/login/${provider}/callback`;

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return bytesToBase64Url(digest);
}

function authorizeUrl(env: Env, flow: Flow, clientId: string, challenge: string): string {
  const url = new URL(endpoints(env, flow.provider).authorize);
  const params: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUri(env, flow.provider),
    response_type: "code",
    state: flow.state,
  };
  if (flow.provider === "apple") {
    // No scope: Apple gives neither an email nor a name, and with none it answers by query, as the others do. Its web flow
    // has no PKCE; the client secret signed here, state and the nonce in its ID token stand in.
    params.response_mode = "query";
    params.nonce = flow.nonce;
  } else {
    params.code_challenge = challenge;
    params.code_challenge_method = "S256";
  }
  if (flow.provider === "google") {
    // openid and profile only: who you are and your name. No email, and nothing else of yours.
    params.scope = "openid profile";
    params.nonce = flow.nonce;
    // Someone with several Google accounts picks one, rather than Google picking for them.
    params.prompt = "select_account";
  }
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/** Reads a JWT's claims. Only for an ID token straight from Google's or Apple's token endpoint over TLS (OIDC Core 3.1.3.7). */
function jwtClaims(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) throw new ProviderError("no ID token");
  const json = atob(part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(json, (ch) => ch.charCodeAt(0)))) as Record<string, unknown>;
}

const cleanName = (value: unknown): string | null => {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return name ? [...name].slice(0, 40).join("") : null;
};

async function googleIdentity(env: Env, code: string, flow: Flow, app: { id: string; secret: string }): Promise<Identity> {
  const ep = endpoints(env, "google");
  const response = await fetch(ep.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: app.id,
      client_secret: app.secret,
      redirect_uri: redirectUri(env, "google"),
      code_verifier: flow.verifier,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!response.ok || !body.id_token) throw new ProviderError(`google token: ${response.status} ${body.error ?? ""}`);
  const claims = jwtClaims(body.id_token);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ep.issuers.includes(String(claims.iss))) throw new ProviderError("google: wrong issuer");
  if (!audience.includes(app.id)) throw new ProviderError("google: wrong audience");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now() - 60_000) throw new ProviderError("google: expired");
  if (typeof claims.nonce !== "string" || !(await secretsEqual(claims.nonce, flow.nonce))) throw new ProviderError("google: wrong nonce");
  if (typeof claims.sub !== "string" || !/^[\w-]{1,255}$/.test(claims.sub)) throw new ProviderError("google: no subject");
  const name = cleanName(claims.name) ?? cleanName(claims.given_name);
  return { provider: "google", subject: claims.sub, label: name, name };
}

/** The Sign in with Apple key, from its .p8 (PEM, or only the base64 between its lines). */
async function appleKey(pem: string): Promise<CryptoKey> {
  const base64 = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/**
 * Apple's client secret: a JWT signed ES256 with the Sign in with Apple key, from the team, about this Services ID, for Apple,
 * good for five minutes (Apple allows up to six months; one is made for each sign-in, so nothing long-lived is kept).
 */
async function appleClientSecret(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const part = (value: unknown) => bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${part({ alg: "ES256", kid: env.APPLE_KEY_ID })}.${part({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: env.APPLE_SERVICES_ID })}`;
  // Web Crypto's ECDSA signature is r and s side by side (IEEE P1363), which is what JWS's ES256 wants.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await appleKey(env.APPLE_PRIVATE_KEY ?? ""), new TextEncoder().encode(unsigned));
  return `${unsigned}.${bytesToBase64Url(signature)}`;
}

async function appleIdentity(env: Env, code: string, flow: Flow, app: { id: string; secret: string }): Promise<Identity> {
  const ep = endpoints(env, "apple");
  const response = await fetch(ep.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: app.id,
      client_secret: await appleClientSecret(env),
      redirect_uri: redirectUri(env, "apple"),
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!response.ok || !body.id_token) throw new ProviderError(`apple token: ${response.status} ${body.error ?? ""}`);
  const claims = jwtClaims(body.id_token);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ep.issuers.includes(String(claims.iss))) throw new ProviderError("apple: wrong issuer");
  if (!audience.includes(app.id)) throw new ProviderError("apple: wrong audience");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now() - 60_000) throw new ProviderError("apple: expired");
  if (typeof claims.nonce !== "string" || !(await secretsEqual(claims.nonce, flow.nonce))) throw new ProviderError("apple: wrong nonce");
  // Apple's subject has dots in it (001234.abcd….0123).
  if (typeof claims.sub !== "string" || !/^[\w.-]{1,255}$/.test(claims.sub)) throw new ProviderError("apple: no subject");
  return { provider: "apple", subject: claims.sub, label: null, name: null };
}

async function githubIdentity(env: Env, code: string, flow: Flow, app: { id: string; secret: string }): Promise<Identity> {
  const ep = endpoints(env, "github");
  const response = await fetch(ep.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: app.id,
      client_secret: app.secret,
      code,
      redirect_uri: redirectUri(env, "github"),
      code_verifier: flow.verifier,
    }),
  });
  // GitHub answers a bad code with a 200 and an error field.
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!response.ok || !body.access_token) throw new ProviderError(`github token: ${response.status} ${body.error ?? ""}`);
  const userResponse = await fetch(ep.user, {
    headers: {
      Authorization: `Bearer ${body.access_token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Lexicommons",
    },
  });
  const user = (await userResponse.json().catch(() => ({}))) as { id?: unknown; login?: unknown; name?: unknown };
  if (!userResponse.ok || typeof user.id !== "number" || !Number.isSafeInteger(user.id)) throw new ProviderError(`github user: ${userResponse.status}`);
  const login = typeof user.login === "string" && /^[A-Za-z0-9-]{1,39}$/.test(user.login) ? user.login : null;
  return { provider: "github", subject: String(user.id), label: login ? `@${login}` : null, name: cleanName(user.name) ?? login };
}

// ---------- the flow and the pending sign-in, in D1 (the challenges table) ----------

async function saveRecord(env: Env, id: string, kind: "oauth" | "pending", data: unknown, seconds: number, userId: string | null = null) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM challenges WHERE expires_at < ?").bind(now),
    env.DB.prepare("INSERT OR REPLACE INTO challenges (id, challenge, kind, user_id, user_name, expires_at) VALUES (?, ?, ?, ?, NULL, ?)").bind(
      id,
      JSON.stringify(data),
      kind,
      userId,
      now + seconds * 1000,
    ),
  ]);
}

async function readRecord<T>(env: Env, request: Request, cookie: string, kind: "oauth" | "pending", { take }: { take: boolean }): Promise<T | null> {
  const id = readCookie(request, cookie);
  if (!id) return null;
  const row = await env.DB.prepare("SELECT challenge FROM challenges WHERE id = ? AND kind = ? AND expires_at > ?")
    .bind(id, kind, Date.now())
    .first<{ challenge: string }>();
  if (take) await env.DB.prepare("DELETE FROM challenges WHERE id = ? AND kind = ?").bind(id, kind).run();
  try {
    return row ? (JSON.parse(row.challenge) as T) : null;
  } catch {
    return null;
  }
}

const readPending = (env: Env, request: Request) => readRecord<Pending>(env, request, PENDING_COOKIE, "pending", { take: false });

async function dropPending(env: Env, request: Request) {
  const id = readCookie(request, PENDING_COOKIE);
  if (id) await env.DB.prepare("DELETE FROM challenges WHERE id = ? AND kind = 'pending'").bind(id).run();
}

/**
 * Keeps a new sign-in waiting for the create step, and returns its cookie. From the create step itself (merge), it
 * joins the one already waiting (at most one per provider, the newest kept); from the sign-in page it starts afresh,
 * so an abandoned attempt never comes along.
 */
async function addPending(env: Env, request: Request, identity: Identity, next: string, { merge }: { merge: boolean }): Promise<string> {
  const existing = merge ? await readPending(env, request) : null;
  if (!merge) await dropPending(env, request);
  const identities = [...(existing?.identities ?? []).filter((i) => i.provider !== identity.provider), identity];
  const id = (existing && readCookie(request, PENDING_COOKIE)) || randomId(18);
  await saveRecord(env, id, "pending", { identities, next: existing?.next ?? next } satisfies Pending, PENDING_SECONDS);
  return cookieHeader(PENDING_COOKIE, id, PENDING_SECONDS);
}

// ---------- identities ----------

async function ownerOf(env: Env, identity: Pick<Identity, "provider" | "subject">): Promise<string | null> {
  const row = await env.DB.prepare("SELECT user_id FROM identities WHERE provider = ? AND subject = ?")
    .bind(identity.provider, identity.subject)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

const insertIdentity = (env: Env, userId: string, identity: Identity, now: number) =>
  env.DB.prepare("INSERT INTO identities (provider, subject, user_id, label, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
    identity.provider,
    identity.subject,
    userId,
    identity.label,
    now,
    now,
  );

/** Adds the pending sign-ins to an account, skipping any another account has taken since. Returns the ones added. */
async function attachPending(env: Env, userId: string, pending: Pending): Promise<Provider[]> {
  const added: Provider[] = [];
  for (const identity of pending.identities) {
    const owner = await ownerOf(env, identity);
    if (owner) continue;
    const ok = await insertIdentity(env, userId, identity, Date.now())
      .run()
      .then(() => true)
      .catch(() => false);
    if (ok) added.push(identity.provider);
  }
  return added;
}

/** The account's ways to sign in, for Settings and the export. */
export async function listSignIns(env: Env, userId: string) {
  return signInsFrom((await signInsStatement(env, userId).all<SignInRow>()).results);
}
type SignInRow = { provider: Provider; subject: string; label: string | null; created_at: number; last_used_at: number | null };
/** The account's sign-ins read as a statement, for a batch (GET /api/me), and its rows as listSignIns' answer. */
export const signInsStatement = (env: Env, userId: string) =>
  env.DB.prepare("SELECT provider, subject, label, created_at, last_used_at FROM identities WHERE user_id = ? ORDER BY created_at").bind(userId);
export const signInsFrom = (rows: SignInRow[]) => rows.map((r) => ({ provider: r.provider, subject: r.subject, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at }));

// ---------- shared pieces ----------

async function limited(c: Context<AppContext>, what: string): Promise<boolean> {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.AUTH_LIMITER.limit({ key: `${what}:${ip}` });
  return !success;
}

/** A form post from this site only (every browser sends Origin on a form POST). */
const sameOrigin = (c: Context<AppContext>) => c.req.header("Origin") === c.env.PUBLIC_ORIGIN;

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

/** Back to the sign-in page with a message (by code: the page holds the words, so nothing from a URL is shown). */
function toLogin(next: string, error: string, provider?: Provider, cookies: string[] = []): Response {
  const params = new URLSearchParams({ error });
  if (provider) params.set("with", provider);
  if (next !== "/app/") params.set("next", next);
  return redirect(`/login?${params}`, cookies);
}

function toCreateStep(error: string | null, provider?: Provider, cookies: string[] = []): Response {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (provider) params.set("with", provider);
  return redirect(`/login/new${params.size ? `?${params}` : ""}`, cookies);
}

/** Settings → Account, with what happened: added, already, taken, canceled, expired, provider, signed-out. */
const toSettings = (result: string, provider: Provider, cookies: string[] = []) =>
  redirect(`/app/#settings/account?signin=${result}&with=${provider}`, cookies);

// ---------- routes: /login/… ----------

export const signin = new Hono<AppContext>();

/** The create step: a sign-in nobody has used yet. */
signin.get("/new", async (c) => {
  const pending = await readPending(c.env, c.req.raw);
  if (!pending?.identities.length) return toLogin("/app/", "expired");
  const view: PendingView = {
    providers: pending.identities.map((i) => i.provider),
    name: pending.identities.map((i) => i.name).find(Boolean) ?? "",
    labels: pending.identities.map((i) => ({ provider: i.provider, label: i.label })),
    next: pending.next,
  };
  const error = c.req.query("error") ?? null;
  const withProvider = c.req.query("with");
  // (Sharing as app.ts features() reads it: learners share only at "everyone".)
  return c.html(
    newAccountPage(view, {
      error,
      provider: isProvider(withProvider) ? withProvider : undefined,
      ready: providersReady(c.env),
      sharingOpen: c.env.COMMUNITY_SHARING === "everyone",
      paused: !signupsOpen(c.env),
    }),
    200,
    { "Cache-Control": "no-store" },
  );
});

/** Create an account with the pending sign-in(s). */
signin.post("/new", async (c) => {
  if (!sameOrigin(c)) return messagePage("Can't do that", "That request didn't come from this site.", 403);
  if (await limited(c, "signin")) return toCreateStep("busy");
  // New accounts paused (signups.ts): the create step again with the words, nothing written; the pending sign-in kept to finish later.
  if (!signupsOpen(c.env)) {
    watchLine("signups_paused");
    return toCreateStep("paused");
  }
  const pending = await readPending(c.env, c.req.raw);
  if (!pending?.identities.length) return toLogin("/app/", "expired");
  const form = await c.req.parseBody();
  const name = String(form.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || [...name].length > 40) return toCreateStep("name");
  const userId = randomId(16);
  const now = Date.now();
  try {
    // One transaction: if another account took any of these sign-ins meanwhile, nothing is made.
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").bind(userId, name, now),
      ...pending.identities.map((identity) => insertIdentity(c.env, userId, identity, now)),
    ]);
  } catch {
    await dropPending(c.env, c.req.raw);
    return toLogin(pending.next, "taken", pending.identities[0]?.provider, [clearCookieHeader(PENDING_COOKIE)]);
  }
  await dropPending(c.env, c.req.raw);
  watchLine("signup");
  return redirect(pending.next, [clearCookieHeader(PENDING_COOKIE), await startSession(c.env, userId, c.req.header("User-Agent") ?? null)]);
});

/** After a passkey sign-in on the create step: add the pending sign-in(s) to the account just signed in to. */
signin.post("/attach", async (c) => {
  if (!sameOrigin(c)) return c.json({ error: "That request didn't come from this site." }, 403);
  const user = await getSessionUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "Sign in first." }, 401);
  const pending = await readPending(c.env, c.req.raw);
  if (!pending) return c.json({ added: [], next: "/app/" }, 200, { "Set-Cookie": clearCookieHeader(PENDING_COOKIE) });
  const added = await attachPending(c.env, user.id, pending);
  await dropPending(c.env, c.req.raw);
  return c.json({ added, next: pending.next }, 200, { "Set-Cookie": clearCookieHeader(PENDING_COOKIE), "Cache-Control": "no-store" });
});

/** Leave for the provider. Form fields: next, intent (signin · link · attach). */
signin.post("/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!isProvider(provider)) return c.notFound();
  if (!sameOrigin(c)) return messagePage("Can't do that", "That request didn't come from this site.", 403);
  const form = await c.req.parseBody();
  const intent = form.intent === "link" || form.intent === "attach" ? form.intent : "signin";
  const next = safeNextPath(typeof form.next === "string" ? form.next : null);
  if (await limited(c, "signin")) return intent === "link" ? toSettings("busy", provider) : toLogin(next, "busy");
  const app = client(c.env, provider);
  if (!app) return intent === "link" ? toSettings("unavailable", provider) : toLogin(next, "unavailable", provider);
  let userId: string | null = null;
  if (intent === "link") {
    const user = await getSessionUser(c.req.raw, c.env);
    if (!user) return toLogin("/app/#settings/account", "signed-out");
    userId = user.id;
  }
  const flow: Flow = { provider, state: randomId(24), verifier: randomId(48), nonce: randomId(24), next, intent, userId };
  const id = randomId(18);
  await saveRecord(c.env, id, "oauth", flow, FLOW_SECONDS, userId);
  return redirect(authorizeUrl(c.env, flow, app.id, await pkceChallenge(flow.verifier)), [cookieHeader(FLOW_COOKIE, id, FLOW_SECONDS)]);
});

/** Back from the provider. */
signin.get("/:provider/callback", async (c) => {
  const provider = c.req.param("provider");
  if (!isProvider(provider)) return c.notFound();
  const clearFlow = clearCookieHeader(FLOW_COOKIE);
  // Not rate-limited here: only a flow from a (limited) start gets past the state check below, so the starts bound
  // how often this calls the provider.
  const url = new URL(c.req.url);
  const flow = await readRecord<Flow>(c.env, c.req.raw, FLOW_COOKIE, "oauth", { take: true });
  const state = url.searchParams.get("state") ?? "";
  if (!flow || flow.provider !== provider || !state || !(await secretsEqual(state, flow.state))) {
    return toLogin("/app/", "expired", provider, [clearFlow]);
  }
  const back = (error: string) =>
    flow.intent === "link"
      ? toSettings(error, provider, [clearFlow])
      : flow.intent === "attach"
        ? toCreateStep(error, provider, [clearFlow])
        : toLogin(flow.next, error, provider, [clearFlow]);

  const providerError = url.searchParams.get("error");
  // Apple says user_cancelled_authorize where the others say access_denied.
  if (providerError) return back(providerError === "access_denied" || providerError === "user_cancelled_authorize" ? "cancelled" : "provider");
  const code = url.searchParams.get("code");
  const app = client(c.env, provider);
  if (!code || !app) return back("provider");
  let identity: Identity;
  try {
    identity = await { google: googleIdentity, github: githubIdentity, apple: appleIdentity }[provider](c.env, code, flow, app);
  } catch (error) {
    console.warn(JSON.stringify({ signin_error: provider, detail: error instanceof ProviderError ? error.message : String(error) }));
    return back("provider");
  }
  const owner = await ownerOf(c.env, identity);
  const now = Date.now();
  const userAgent = c.req.header("User-Agent") ?? null;

  if (flow.intent === "link") {
    const user = await getSessionUser(c.req.raw, c.env);
    if (!user || user.id !== flow.userId) return toSettings("signed-out", provider, [clearFlow]);
    if (owner === user.id) return toSettings("already", provider, [clearFlow]);
    if (owner) return toSettings("taken", provider, [clearFlow]);
    const added = await insertIdentity(c.env, user.id, identity, now)
      .run()
      .then(() => true)
      .catch(() => false);
    return toSettings(added ? "added" : "taken", provider, [clearFlow]);
  }

  if (owner) {
    await c.env.DB.prepare("UPDATE identities SET last_used_at = ?, label = coalesce(?, label) WHERE provider = ? AND subject = ?")
      .bind(now, identity.label, identity.provider, identity.subject)
      .run();
    const cookies = [clearFlow, await startSession(c.env, owner, userAgent)];
    // From the create step: this account is the one you have, so the pending sign-in joins it.
    const pending = flow.intent === "attach" ? await readPending(c.env, c.req.raw) : null;
    if (pending) {
      await attachPending(c.env, owner, pending);
      await dropPending(c.env, c.req.raw);
      cookies.push(clearCookieHeader(PENDING_COOKIE));
    }
    return redirect(pending?.next ?? flow.next, cookies);
  }

  // Nobody uses this sign-in yet: the create step. From the create step itself, it joins the one already waiting. New accounts paused
  // (signups.ts): the words instead, with nothing written (no pending sign-in); someone with an account signs in as ever above.
  if (!signupsOpen(c.env)) {
    watchLine("signups_paused");
    return flow.intent === "attach" ? toCreateStep("paused", provider, [clearFlow]) : toLogin(flow.next, "paused", provider, [clearFlow]);
  }
  const pendingCookie = await addPending(c.env, c.req.raw, identity, flow.next, { merge: flow.intent === "attach" });
  return toCreateStep(flow.intent === "attach" ? "unknown" : null, flow.intent === "attach" ? provider : undefined, [clearFlow, pendingCookie]);
});

// ---------- routes: /api/auth/ways (the signed-in account's ways to sign in) ----------

export const ways = new Hono<AppContext>();

// The last way to sign in can't be removed: an account always keeps one.
const OTHER_WAYS_LEFT = "((SELECT COUNT(*) FROM passkeys WHERE user_id = ?) + (SELECT COUNT(*) FROM identities WHERE user_id = ?)) > 1";

ways.delete("/passkey/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Sign in first." }, 401);
  const result = await c.env.DB.prepare(`DELETE FROM passkeys WHERE id = ? AND user_id = ? AND ${OTHER_WAYS_LEFT}`)
    .bind(c.req.param("id"), user.id, user.id, user.id)
    .run();
  if (!result.meta.changes) return c.json({ error: "That's your only way to sign in, so it stays. Add another first." }, 400);
  return c.json({ ok: true });
});

ways.delete("/:provider/:subject", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Sign in first." }, 401);
  const provider = c.req.param("provider");
  if (!isProvider(provider)) return c.json({ error: "No such sign-in." }, 404);
  const result = await c.env.DB.prepare(`DELETE FROM identities WHERE provider = ? AND subject = ? AND user_id = ? AND ${OTHER_WAYS_LEFT}`)
    .bind(provider, c.req.param("subject"), user.id, user.id, user.id)
    .run();
  if (!result.meta.changes) return c.json({ error: "That's your only way to sign in, so it stays. Add another first." }, 400);
  return c.json({ ok: true });
});

/** Whether each provider can be used here (its client is configured). */
export const providersReady = (env: Env): Record<Provider, boolean> => ({
  google: Boolean(client(env, "google")),
  github: Boolean(client(env, "github")),
  apple: Boolean(client(env, "apple")),
});
