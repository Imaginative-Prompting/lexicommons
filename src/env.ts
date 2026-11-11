import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  UPLOADS: R2Bucket;
  // The open library's shared books and weaves (src/books.ts).
  LIBRARY: R2Bucket;
  ASSETS: Fetcher;
  GATE_LIMITER: RateLimit;
  AUTH_LIMITER: RateLimit;
  API_LIMITER: RateLimit;
  // Optional: a test's environment, or a config from before them, simply has none (sessions.ts, app.ts).
  SESSION_LIMITER?: RateLimit;
  ERRORS_LIMITER?: RateLimit;
  // Bug reports (src/bug-reports.ts): a few a minute per account, or per connection signed out.
  BUGS_LIMITER?: RateLimit;
  // Practice with your AI: one room per account (src/practice.ts).
  PRACTICE: DurableObjectNamespace<import("./practice").PracticeRoom>;

  PUBLIC_ORIGIN: string;
  RP_ID: string;
  RP_NAME: string;
  GATE_ENABLED: string;
  /** "true": the public pages (gate.ts) open while the gate is on; off by default. */
  GATE_PUBLIC_PAGES?: string;
  GOOGLE_CLIENT_ID: string;
  DROPBOX_APP_KEY: string;
  ONEDRIVE_CLIENT_ID: string;
  STORAGE_REDIRECT_URI: string;
  // The one switch for everything a learner puts in front of others in Explore (community.ts sharingOpenFor): "everyone", or anything else
  // for admins only ("admins" at launch).
  COMMUNITY_SHARING: string;
  /** New accounts: "open" or "paused" (src/signups.ts; the SIGNUPS switch). */
  SIGNUPS?: string;
  // The in-app AI with a key of your own (public/js/ai/own-key.js): "true" offers it. Off on the main site until it's switched on; a
  // copy on someone's own computer (scripts/local.mjs) turns it on.
  OWN_KEY_ENABLED?: string;
  // The paid plan (src/billing.ts): "true" offers it, where Stripe's keys and prices are set too.
  PLAN_ENABLED?: string;
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_YEARLY?: string;
  /** The Customer Portal's settings (Stripe's bpc_… id); Stripe's default when unset. */
  STRIPE_PORTAL_CONFIGURATION?: string;
  /** "true": Checkout collects tax with Stripe Tax (needs it set up in the Stripe account). */
  STRIPE_AUTOMATIC_TAX?: string;
  /** Local checks only: a stand-in for api.stripe.com. Ignored unless PUBLIC_ORIGIN is localhost. */
  STRIPE_API_BASE?: string;
  /** Local checks only: a stand-in for openrouter.ai (src/ai-hosted.ts). Ignored unless PUBLIC_ORIGIN is localhost. */
  OPENROUTER_API_BASE?: string;
  // An email on the account, for getting back in and receipts (src/account-email.ts): Cloudflare's Email Sending bound as EMAIL, and the
  // address it sends from. A copy without them has none of it.
  EMAIL?: { send(message: { to: string; from: { email: string; name?: string }; subject: string; text: string; html?: string }): Promise<{ messageId?: string }> };
  EMAIL_FROM?: string;
  // Sign in with Google (its own client, in the Google Cloud project "lexicommons-sign-in") and GitHub (signin.ts).
  GOOGLE_SIGNIN_CLIENT_ID: string;
  GITHUB_CLIENT_ID: string;
  // Sign in with Apple (signin.ts): the Services ID (Apple's client_id), the developer team, and the Sign in with Apple key's id, all
  // public. With APPLE_PRIVATE_KEY (a secret: the key's .p8) they turn it on; without all four there's no Apple.
  APPLE_SERVICES_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  // Local checks only: the stand-in providers' origin (scripts/auth-standin.mjs; onedrive-check's Microsoft); ignored unless PUBLIC_ORIGIN is localhost.
  AUTH_STANDIN?: string;

  // Secrets (wrangler secret put): never logged, never returned.
  GATE_PASSWORD: string;
  GATE_SESSION_SECRET: string;
  UPLOAD_SIGNING_SECRET: string;
  GOOGLE_CLIENT_SECRET: string;
  // OneDrive's client secret (the Entra app's, for its Web redirect): set, OneDrive's code exchange and refreshes go through storage.ts;
  // not set, OneDrive stays a single-page app (its refresh tokens end 24 hours after the sign-in).
  ONEDRIVE_CLIENT_SECRET?: string;
  GOOGLE_SIGNIN_CLIENT_SECRET: string;
  GITHUB_CLIENT_SECRET: string;
  // The Sign in with Apple key (its .p8, PEM or the base64 between its lines): signs each sign-in's client secret (ES256), never sent.
  APPLE_PRIVATE_KEY?: string;
  // Web Push (src/reminders.ts): the VAPID key pair, made by scripts/vapid-keys.mjs (the public key's raw bytes,
  // base64url; the private key as a JWK). Without them reminders are off and the cron does nothing.
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  // The paid plan's Stripe keys (wrangler secret put): a restricted key, and the webhook endpoint's signing secret.
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** Lexicommons' own OpenRouter key, for the in-app AI on the plan (src/ai-hosted.ts); unset, the plan has no AI. */
  OPENROUTER_API_KEY?: string;

  // Injected by workers-oauth-provider before the default handler runs.
  OAUTH_PROVIDER: OAuthHelpers;
}

/** What every authenticated MCP or REST call knows about its caller. */
export interface CallerProps {
  userId: string;
  name: string;
  via: "oauth" | "pat";
  /** For a personal access token, the name the user gave it. */
  tokenName?: string;
  /** For a personal access token: made with admin access, so it reaches an admin's tools (roles.ts). */
  tokenAdmin?: boolean;
}

export interface SessionUser {
  id: string;
  name: string;
}

// routed: set false as an /api/* request starts and true once its route runs, so an error before then is known to have written nothing (app.onError's applied).
export type AppContext = { Bindings: Env; Variables: { user: SessionUser | null; routed?: boolean } };

/** The canonical MCP resource. Tokens are only ever accepted for this exact URL. */
export const MCP_RESOURCE = "https://lexicommons.com/mcp";
/** What an app asking for no scope is granted, and what the consent page then says it may do: the same list for both. */
export const DEFAULT_SCOPES = ["learn:read", "learn:write"];
