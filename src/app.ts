// Everything that isn't an OAuth protocol endpoint or a token-validated /mcp call: the site gate, sign-in, the
// consent screen, the app's own API (cookie session), the REST API (personal access tokens), signed uploads, and
// the static PWA.

import { AuthorizationError } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import type { Context } from "hono";
import { routePath } from "hono/route";
import { accounts, deleteAccount, getSessionUser, SESSION_COOKIE, sessionOf, startSession } from "./accounts";
import { exportBugReports, readBugReport, serveOwnScreenshot, submitBugReport } from "./bug-reports";
import { forgetSession } from "./sessions";
import { SessionsLimited } from "./sessions";
import { signupsOpen } from "./signups";
import * as accountEmail from "./account-email";
import { DEFAULT_SCOPES, type AppContext, type CallerProps, type Env } from "./env";
import { handleGate, indexable, robotsTxt } from "./gate";
import {
  addNote,
  createToken,
  LibraryError,
  listNotes,
  listTokens,
  listUploads,
  receiveUpload,
  requestUpload,
  resolveToken,
  revokeToken,
  serveUpload,
} from "./library";
import { changeLook, createTheme, deleteTheme, getLook, getLookOrLibrary, getRevs, listThemes, LookConflict, type LookPatch, MissingImages, putLookImage, reportApplied, restoreTheme, saveLook, saveTheme, serveLookImage, ThemeConflict, useTheme } from "./looks";
import { consentPage, loginPage, messagePage, notFoundPage, recoverPage, reportPage } from "./pages";
import { isProvider, listSignIns, providersReady, signin, signInsFrom, signInsStatement, ways } from "./signin";
import { practiceRoom, unwrap } from "./practice";
import { deleteCopy, exportPacks, inbox, PACKS_WAITING, putCopy, putDevice, queueFromDevice, report, serveChangeClip } from "./packs";
import { AUDIO_LIMITS } from "../public/js/study/pack-audio.js";
import { serveLibrary } from "./books";
import { findPacks, indexMissing } from "./find";
import { serverTiming, translateLanguages, translateOnline, type TranslateTiming } from "./translate";
import { claimWeaveText, dropWeaveText, exportTexts, queueTextFromDevice, reportText, serveTextFile, storeWeaveText, textInbox, TEXTS_WAITING } from "./texts";
import { TEXT_UPLOADS } from "./library";
import { WEAVE_LANGUAGES } from "../public/js/read/weave-languages.generated.js";
import { addClear, listClears, undoClear } from "./progress-clears";
import { catalogueView, checkPublish, currentCatalogue, libraryHistory, publish, publishInputFrom, receiveStaged, restore, setShelf, stageFiles, unpublish, type StageRequest, type UnpublishTarget } from "./library-admin";
import { adminLog, requireRole, type Role, RoleError, rolesFrom, rolesOf, rolesStatement } from "./roles";
import { BOOK_LIMITS, type BookQuery, followBook, followedBooks, getBook, likeBook, listBooks, mineBooks, serveBookFile, shareBook, unfollowBook, updateSharedBook, withdrawSharedBook } from "./community-books";
import { Banned, counterNotice, exportCommunity, OverLimit, ownerCases, pending, report as reportItem, reportCorrection, reportGrammarSuggestion, reportRequest, requireModerator } from "./moderation";
import { answerRequest, closeRequest, getRequest, likeRequest, listRequests, postRequest, REQUEST_BODY } from "./board";
import { getSuggestion, grammarPage, GRAMMAR_SUGGESTION_BODY, likeSuggestion, listSuggestions, suggestPattern, withdrawSuggestion } from "./grammar-suggestions";
import { CORRECTION_BODY, correctionsToAnswer, likeCorrection, listCorrections, myCorrections, openFixes, reviewCorrections, suggestCorrection, withdrawCorrection } from "./corrections";
import { acceptTerms, exploreHome, follow, following, followingDown, getItem, languageCounts, like, listItems, listTopics, mine, PACK_LIMITS, SharingRefused, sharePack, sharingOpenFor, syncLibraryIndex, termsOf, unfollow, updateShared, withdrawShared, type ListQuery } from "./community";
import { availableStores, storage } from "./storage";
import { appFlags, FlagError, listFlags, PREVIEW_COOKIE, PREVIEW_DAYS, previewsAsked, resetFlag, setFlag, setPreview } from "./flags";
import { planShown } from "./offered";
import { BillingError, endForDeletion, entitlement, exportBilling, openPortal, planOffered, receiveEvent, startCheckout } from "./billing";
import { allowanceNow, HostedError, hostedOffered, hostedReply, hostedSummary, hostedTranslate, meterOf } from "./ai-hosted";
import { clearCookieHeader, consentMark, cookieHeader, crossSite, readBytesLimited, readCookie, readTextLimited, safeNextPath, sha256Hex } from "./util";
import { revokeConnection } from "./revoked";
import { LOOK_LIMITS } from "../public/js/lx/look-rules.js";
import { LIMITS as PRACTICE_LIMITS } from "../public/js/practice/protocol.js";
import { checkRecord } from "./coach";
import { ERRORS, flushOverloads, isD1Overloaded, OVERLOAD, overloadsHeld, recordClientReport, recordServerError } from "./errors";
import { exportReminders, getReminders, report as reminderReport, sendTest, setSettings, subscribe, unsubscribe } from "./reminders";


// Same-origin only, except the user's own storage APIs and the in-app AI's provider, which the app calls directly. Inline scripts and styles are never
// used. Themes: custom CSS goes in through constructable stylesheets (not inline styles), and theme images and fonts
// can only be blob: (stored on the device) or data: (carried in a theme file), so a shared theme can't reach another
// server, whatever its CSS says.
// 'wasm-unsafe-eval' lets WebAssembly compile (on-device speech recognition, public/js/speech/); it allows no eval of
// JavaScript and no outside script.
/** Features a site switches on by its vars, so they can land before they're offered (ai/own-key.js). */
// sharing: who Explore's sharing is open to (COMMUNITY_SHARING, as an admin set it: src/flags.ts), so an admin's app seeing itself as a learner
// knows what a learner gets; mayShare is this account's own answer.
export const features = (env: Env) => ({
  ownKey: env.OWN_KEY_ENABLED === "true",
  // Shown: offered, or previewed on an admin's own device (offered.ts planShown); checkout and the rest go by planOffered.
  plan: planShown(env),
  hostedAi: hostedOffered(env),
  sharing: env.COMMUNITY_SHARING === "everyone" ? ("everyone" as const) : ("admins" as const),
});
/** The plan (billing.ts entitlement), with this month's use of the in-app AI on it (ai-hosted.ts meterOf) where that's offered. */
async function planWithMeter(env: Env, userId: string) {
  const plan = await entitlement(env, userId);
  if (!plan || !hostedOffered(env)) return plan;
  const { spent, resets } = await meterOf(env, userId);
  return { ...plan, ai: { ...plan.ai, allowance: plan.active ? await allowanceNow(env, userId, plan) : plan.ai.allowance, spent, resets } };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  // OneDrive downloads redirect from Graph to Microsoft's file hosts.
  "connect-src 'self' https://www.googleapis.com https://api.dropboxapi.com https://content.dropboxapi.com " +
    "https://login.microsoftonline.com https://graph.microsoft.com https://*.1drv.com https://*.microsoftpersonalcontent.com " +
    "https://*.sharepoint.com " +
    // The in-app AI with a key of your own: the device calls the provider itself (ai/inapp.js PROVIDERS), so the key never
    // reaches this server. Only the providers listed there, never any https: host.
    "https://openrouter.ai",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CROSS_SITE_EXEMPT = new Set(["/api/billing/stripe", "/api/errors"]);

export const app = new Hono<AppContext>();

// Every HTML page, the gate's included, gets the CSP and friends. "no-transform" also keeps Cloudflare's edge from
// injecting its Web Analytics beacon into pages (the CSP would block it anyway, but each page would log a violation,
// and the site loads nothing from other servers).
function secureHtml(res: Response, mayIndex = false): Response {
  if (!(res.headers.get("Content-Type") ?? "").startsWith("text/html")) return res;
  res.headers.set("Content-Security-Policy", CSP);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  // The microphone (speaking games) for the site itself only, never a frame.
  res.headers.set("Permissions-Policy", "microphone=(self)");
  if (!mayIndex) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  const cache = res.headers.get("Cache-Control");
  if (!cache?.includes("no-transform")) res.headers.set("Cache-Control", cache ? `${cache}, no-transform` : "no-transform");
  return res;
}

app.use("*", async (c, next) => {
  const gated = await handleGate(c.req.raw, c.env, new URL(c.req.url));
  if (gated) return secureHtml(gated);
  c.set("user", null);
  await next();
  secureHtml(c.res, indexable(c.env, new URL(c.req.url).pathname));
});

// The cookie session, for the pages and API that need a signed-in person. Never read for an error report (errors.ts).
/**
 * The routes that may answer from a session this isolate found in the last SESSION_CACHE_MS (sessions.ts): Translate's, which read only
 * public packs (Lexicommons' own, Explore's shared, the library's books) and nothing of the person's, and which a newcomer's device asks up
 * to ~3 times a second while it has no index of its own. Exactly these method and path pairs; scripts/test-session-cache.mjs holds the list.
 */
export const CACHED_SESSION_ROUTES = new Set(["GET /api/translate/languages", "POST /api/translate/find", "POST /api/translate"]);

app.use("/api/*", async (c, next) => {
  c.set("routed", false);
  // A change made with the cookie session comes from this site's own pages, never another site's (CSRF; 6 Nov 2026, the Codex review
  // S5): a browser marks where a request came from (Origin, Sec-Fetch-Site), and anything it marks as another site is refused. A
  // request with neither isn't a browser's, so it carries no one's cookies but its sender's. /api/v1 is a personal token's (no cookie),
  // Stripe's webhook is signed and has no Origin, and an error report keeps its own rule (always 204).
  if (UNSAFE.has(c.req.method) && !c.req.path.startsWith("/api/v1/") && !CROSS_SITE_EXEMPT.has(c.req.path) && crossSite(c.req.raw, c.env.PUBLIC_ORIGIN)) {
    return c.json({ error: "cross_site", message: "That request didn't come from this site." }, 403, { "Cache-Control": "no-store" });
  }
  // The session slides forward while it's used, with its cookie renewed on the answer (sessions.ts sessionOf). Translate's routes may
  // answer from a session this isolate found a moment ago (CACHED_SESSION_ROUTES), costing D1 nothing; every other route reads it.
  const cached = CACHED_SESSION_ROUTES.has(`${c.req.method} ${c.req.path}`);
  const session = !c.req.path.startsWith("/api/v1/") && c.req.path !== "/api/errors" ? await sessionOf(c.req.raw, c.env, { extend: true, cached }) : null;
  c.set("user", session?.user ?? null);
  c.set("routed", true);
  await next();
  if (session?.renew) c.res.headers.append("Set-Cookie", session.renew);
  // D1 answered this request: the overloads this isolate held back are written as one group, once they've stopped (errors.ts).
  if (overloadsHeld() && c.res.status < 500) {
    try {
      c.executionCtx.waitUntil(flushOverloads(c.env));
    } catch {
      // No execution context (a test calling app.fetch bare).
    }
  }
});
app.use("/authorize", async (c, next) => {
  c.set("user", await getSessionUser(c.req.raw, c.env));
  await next();
});

app.get("/robots.txt", (c) => c.text(robotsTxt(c.env)));

// The app itself: someone signed out goes straight to sign-in (and comes back after), instead of loading the app
// only to be sent away.
app.get("/app/", async (c, next) => {
  const session = await sessionOf(c.req.raw, c.env, { extend: true });
  if (!session) return c.redirect("/login?next=/app/", 302);
  await next();
  if (session.renew) c.res.headers.append("Set-Cookie", session.renew);
});

// Sign in, or create an account: passkeys here (accounts.ts), Google and GitHub through /login/<provider> (signin.ts).
// Someone already signed in goes straight on.
app.get("/login", async (c) => {
  const next = safeNextPath(c.req.query("next") ?? null);
  if (await getSessionUser(c.req.raw, c.env)) return c.redirect(next, 303);
  const provider = c.req.query("with");
  return c.html(
    loginPage(next, {
      deleted: c.req.query("deleted") === "1",
      signedOut: c.req.query("signedout") === "1",
      error: c.req.query("error") ?? null,
      provider: isProvider(provider) ? provider : undefined,
      connecting: await connectingApp(c, next),
      providers: providersReady(c.env),
      recovery: accountEmail.offered(c.env),
      newcomer: c.req.query("new") === "1",
      sharingOpen: features(c.env).sharing === "everyone",
      signupsPaused: !signupsOpen(c.env),
    }),
    200,
    { "Cache-Control": "no-store" },
  );
});
// Getting back in with the account's email (account-email.ts), where this site sends email; someone signed in goes straight on.
app.get("/login/recover", async (c) => {
  const next = safeNextPath(c.req.query("next") ?? null);
  if (!accountEmail.offered(c.env)) return c.redirect(`/login?next=${encodeURIComponent(next)}`, 303);
  if (await getSessionUser(c.req.raw, c.env)) return c.redirect(next, 303);
  return c.html(recoverPage(next), 200, { "Cache-Control": "no-store" });
});
// Report a bug for someone who isn't signed in (pages.ts reportPage, from the sign-in pages' foot). Someone signed in reports from Settings,
// where it's linked to their account and the page says so.
// The sign-in page and Report a bug with a slash after them go to the page itself, as /privacy/ does (the static files' own).
app.get("/login/", (c) => c.redirect(`/login${new URL(c.req.url).search}`, 301));
app.get("/report/", (c) => c.redirect(`/report${new URL(c.req.url).search}`, 301));
app.get("/report", async (c) => {
  if (await getSessionUser(c.req.raw, c.env)) return c.redirect("/app/#settings/report", 303);
  return c.html(reportPage(), 200, { "Cache-Control": "no-store" });
});
app.route("/login", signin);

/** The AI app an /authorize?… next is for, by the name it gives (the consent page says whether that's verified). */
async function connectingApp(c: Context<AppContext>, next: string): Promise<string | null> {
  if (!next.startsWith("/authorize?")) return null;
  try {
    const provider = c.env.OAUTH_PROVIDER;
    const request = await provider.parseAuthRequest(new Request(new URL(next, c.req.url)));
    return (await provider.describeConsent(request)).clientName || null;
  } catch {
    return null;
  }
}

// Signing out from a page (the consent page's "Not you?"): then sign in again and carry on to next.
app.post("/logout", async (c) => {
  if (c.req.header("Origin") !== c.env.PUBLIC_ORIGIN) return messagePage("Can't do that", "That request didn't come from this site.", 403);
  const form = await c.req.parseBody();
  const next = safeNextPath(typeof form.next === "string" ? form.next : null);
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    await forgetSession(token);
  }
  const params = new URLSearchParams({ signedout: "1" });
  if (next !== "/app/") params.set("next", next);
  return new Response(null, {
    status: 303,
    headers: { Location: `/login?${params}`, "Set-Cookie": clearCookieHeader(SESSION_COOKIE), "Cache-Control": "no-store" },
  });
});

app.route("/api/auth/ways", ways);
app.route("/api/auth", accounts);
app.route("/api/storage", storage);

function signedIn(c: Context<AppContext>) {
  const user = c.get("user");
  if (!user) throw new SignInRequired();
  return user;
}
class SignInRequired extends Error {}

// A JSON body read up to its limit: too big, or not JSON, is refused in words (a 400), never read whole first.
// optional: a route whose fields may all be left out (following) reads no body at all as {}.
async function jsonBody(c: { req: { raw: Request } }, maxBytes: number, { optional = false } = {}): Promise<unknown> {
  const text = await readTextLimited(c.req.raw, maxBytes);
  if (text === null) throw new LibraryError(`That's more than ${Math.round(maxBytes / 1024)} KB.`);
  if (optional && !text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LibraryError("Send JSON.");
  }
}
// The same as an object: anything else reads as {}, so every field is missing.
const objectBody = async (c: { req: { raw: Request } }, maxBytes: number, options: { optional?: boolean } = {}) => {
  const body = await jsonBody(c, maxBytes, options);
  return (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
};
// A field read as text or a number, as String() and Number() read every primitive, but never from an object: JSON can
// carry one whose toString is null, which they throw on. text: a field that must be text, else "".
const asNumber = (value: unknown) => (value !== null && typeof value === "object" ? NaN : Number(value));
const textOf = (value: unknown) => (typeof value === "string" ? value : "");
// Body limits. A look's is the biggest look the rules allow (look-rules.js LOOK_LIMITS: its CSS, every token at its
// longest, every image's record), times 6, the most JSON can stretch one character (\u0000), with room for the rest.
const LOOK_BODY = 6 * (LOOK_LIMITS.cssBytes + LOOK_LIMITS.tokenCount * (64 + LOOK_LIMITS.tokenValueLength) + LOOK_LIMITS.imageCount * 300 + LOOK_LIMITS.nameLength) + 16 * 1024;
const BODY = { small: 4 * 1024, note: 16 * 1024, report: 64 * 1024, look: LOOK_BODY };
// Explore's (community.ts, moderation.ts, corrections.ts): a pack at the pack format's own size, with room for its
// fields; a report's or a counter-notice's text at the length it's kept (moderation.ts), times 6 (JSON's longest
// escape); corrections' from corrections.ts. The admin's library routes: a staging list or a shelf at its largest.
const PACK_BODY = PACK_LIMITS.bytes + 64 * 1024; // a whole pack (sharing it, or the account's copy for your AI)
const COPY_BODY = PACK_BODY + AUDIO_LIMITS.bytes; // the account's copy of a pack of yours, with its recordings' manifest
const EXPLORE_BODY = { pack: PACK_BODY, report: 32 * 1024, ...CORRECTION_BODY };
// A book shared from the app, with every layer it may carry (community-books.ts BOOK_LIMITS), and room for the rest of the form.
const BOOK_BODY = BOOK_LIMITS.bookBytes + BOOK_LIMITS.layers * BOOK_LIMITS.layerBytes + 64 * 1024;
const ADMIN_BODY = 256 * 1024;
const isText = (value: unknown): value is string => typeof value === "string";
const textOrNone = (value: unknown) => (typeof value === "string" ? value : undefined);

app.onError((error, c) => {
  if (error instanceof SignInRequired) return c.json({ error: "sign_in_required" }, 401);
  // Too many session lookups from one connection (SESSION_LIMITER): refused before D1, in words; never an overload (no retry).
  if (error instanceof SessionsLimited) {
    const words = "Too many requests from this connection. Wait a minute, then try again.";
    const headers = { "Retry-After": "60", "Cache-Control": "no-store" };
    return c.req.path.startsWith("/api/") ? c.json({ error: words, code: "rate_limited" }, 429, headers) : c.text(words, 429, headers);
  }
  if (error instanceof FlagError) return c.json({ error: error.message }, error.status);
  if (error instanceof RoleError || error instanceof SharingRefused || error instanceof Banned) return c.json({ error: error.message }, 403);
  if (error instanceof OverLimit) return c.json({ error: error.message }, 429, { "Retry-After": "3600" });
  if (error instanceof LibraryError) return c.json({ error: error.message }, 400);
  if (error instanceof accountEmail.EmailError) return c.json({ error: error.message }, error.status, error.status === 429 ? { "Retry-After": "3600" } : {});
  // D1's queue full (7 Nov 2026, the load rehearsal): a moment's wait, for the app to ask again after (Retry-After; shell/api.js retries
  // code "overloaded" alone), its words for an app that doesn't. applied: false only when nothing of the request can have been written
  // (it failed before its route ran: the session's lookup), so the app may send a write again. Its report is held back from the D1 that
  // refused it (errors.ts holdOverload), counted once D1 answers again.
  if (isD1Overloaded(error)) {
    void recordServerError(c.env, "server", error, `${c.req.method} ${routePath(c) || "?"}`);
    const body = { error: "Lexicommons is very busy for a moment. Try again in a few seconds.", code: "overloaded", ...(c.get("routed") === false ? { applied: false } : {}) };
    return c.json(body, 503, { "Retry-After": String(OVERLOAD.retryAfter), "Cache-Control": "no-store" });
  }
  console.error(JSON.stringify({ app_error: String(error), path: c.req.path }));
  // Counted in the error reports by the route's pattern, never the path asked for (errors.ts).
  const recorded = recordServerError(c.env, "server", error, `${c.req.method} ${routePath(c) || "?"}`);
  try {
    c.executionCtx.waitUntil(recorded);
  } catch {
    // No execution context (a test calling app.fetch bare): it finishes on its own.
  }
  return c.json({ error: "internal_error" }, 500);
});

// Error reports from the app (lx/error-report.js; errors.ts keeps them). Always 204, so a page never waits on it or tries again; kept only
// when it's JSON from this site, and cleaned here again whatever the device did. The session is never read (the /api/* middleware skips
// this path), so nothing kept says whose it was.
const errorsAllowed = async (c: Context<AppContext>) =>
  !c.env.ERRORS_LIMITER || (await c.env.ERRORS_LIMITER.limit({ key: `errors:${c.req.header("CF-Connecting-IP") ?? "unknown"}` })).success;
app.post("/api/errors", async (c) => {
  const json = (c.req.header("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";
  // Its Origin is a browser's word, and a script can say it: ERRORS_LIMITER caps what one connection writes to D1 (wrangler.jsonc), and past
  // it a report is dropped, still answered 204 (a page never reads the answer or sends one again).
  if (json && c.req.header("Origin") === c.env.PUBLIC_ORIGIN && (await errorsAllowed(c))) {
    const text = await readTextLimited(c.req.raw, ERRORS.body);
    if (text !== null) await recordClientReport(c.env, text, c.req.header("User-Agent") ?? "");
  }
  return c.body(null, 204, { "Cache-Control": "no-store" });
});

// A bug report (bug-reports.ts), from Settings → Report a bug or, signed out, from the sign-in pages (/report): linked to the account when
// there's a session, to no one when there isn't (no IP kept). A connection, or an account, gets a few a minute (BUGS_LIMITER, asked before
// anything is read); the day's limits are in the write itself. The cross-site guard above holds for it as for every change.
app.post("/api/bug-reports", async (c) => {
  const user = c.get("user");
  const key = user ? `bugs:user:${user.id}` : `bugs:ip:${c.req.header("CF-Connecting-IP") ?? "unknown"}`;
  if (c.env.BUGS_LIMITER && !(await c.env.BUGS_LIMITER.limit({ key })).success) {
    return c.json({ error: "That's a few reports in a minute. Wait a minute, then send it again." }, 429, { "Retry-After": "60", "Cache-Control": "no-store" });
  }
  const input = await readBugReport(c.req.raw);
  return c.json(await submitBugReport(c.env, input, { userId: user?.id ?? null, userAgent: c.req.header("User-Agent") ?? "" }), 200, { "Cache-Control": "no-store" });
});
// A report's screenshot, for the account that sent it (its export names this address).
app.get("/api/me/bug-reports/:id/screenshot", async (c) => serveOwnScreenshot(c.env, signedIn(c).id, c.req.param("id")));

// --- The app's own API (cookie session) --------------------------------------------------------------------------

/** An AI app signed in over MCP, or a personal token that hasn't been revoked. */
async function aiConnected(env: Env, userId: string) {
  return aiConnectedAfter(env, userId, Boolean(await tokenStatement(env, userId).first()));
}
const tokenStatement = (env: Env, userId: string) => env.DB.prepare("SELECT 1 AS y FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL LIMIT 1").bind(userId);
/** With the personal token's read done (a batch's, GET /api/me): connected, or an app signed in over MCP. */
const aiConnectedAfter = async (env: Env, userId: string, token: boolean) => token || (await env.OAUTH_PROVIDER.listUserGrants(userId)).items.length > 0;

app.get("/api/me", async (c) => {
  const user = signedIn(c);
  // Every start asks this, so its reads go to D1 as one batch: one round trip, not five (7 Nov 2026, the load rehearsal: D1's limit is
  // round trips; docs/launch-capacity.md).
  const [passkeys, roleRows, emailRows, signinRows, tokenRows] = (await c.env.DB.batch([
    c.env.DB.prepare("SELECT id, device_type, backed_up, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at").bind(user.id),
    rolesStatement(c.env, user.id),
    accountEmail.accountEmailStatement(c.env, user.id),
    signInsStatement(c.env, user.id),
    tokenStatement(c.env, user.id),
  ])) as unknown as [
    D1Result<{ id: string; device_type: string | null; backed_up: number; created_at: number; last_used_at: number | null }>,
    D1Result<{ role: Role }>,
    D1Result<{ email: string; verified_at: number }>,
    D1Result<Parameters<typeof signInsFrom>[0][number]>,
    D1Result<{ y: number }>,
  ];
  const roles = rolesFrom(roleRows.results);
  return c.json({
    user,
    // An admin's Settings offers admin access on a new personal token (roles.ts).
    roles: [...roles],
    // Whether Explore is open to this account for what others see (community.ts sharingOpenFor: COMMUNITY_SHARING, or an admin): sharing a
    // pack or a book, requests and "me too", corrections and flags, grammar suggestions. The app shows none of those ways in while it's false;
    // the terms and a ban are still the server's to say when someone acts.
    mayShare: sharingOpenFor(c.env, roles),
    // Which stores this site offers, known before Settings draws (storage.js rememberProviders).
    stores: availableStores(c.env),
    // What this site has switched on that isn't on for everyone yet (ai/own-key.js: a key of your own for the in-app AI).
    features: features(c.env),
    // The paid plan, where this site offers it (billing.ts entitlement): what this account has; null where it isn't offered.
    // With the in-app AI on the plan (ai-hosted.ts), this month's use of it in micro-dollars, for the bar.
    plan: await planWithMeter(c.env, user.id),
    passkeys: passkeys.results.map((p) => ({
      id: p.id,
      synced: p.backed_up === 1,
      createdAt: p.created_at,
      lastUsedAt: p.last_used_at,
    })),
    // An email for getting back in and receipts (account-email.ts): whether this site sends any, and the account's.
    email: { offered: accountEmail.offered(c.env), ...(accountEmail.accountEmailFrom(emailRows.results[0]) ?? { email: null, verifiedAt: null }) },
    // Google and GitHub (signin.ts); which of them this site can use right now.
    signins: signInsFrom(signinRows.results),
    providers: providersReady(c.env),
    // Whether an AI can reach this account: an app signed in over MCP, or a personal token. The AI tab is there only then.
    aiConnected: await aiConnectedAfter(c.env, user.id, tokenRows.results.length > 0),
  });
});

// The Feature flags page (an admin's, Settings → Admin): previews on this device alone (src/flags.ts). The device's previews ride in an
// HttpOnly cookie the server keeps; index.ts honors it for an admin's session only. What everyone has is the director's, over MCP and REST:
// the app has no way to change it.
const FLAG_NAME = /^[A-Z][A-Z_]{1,40}$/;
const flagWhy = (value: unknown) => (typeof value === "string" ? value.slice(0, 300) : null);
const previewCookie = (previews: string[]) => (previews.length ? cookieHeader(PREVIEW_COOKIE, previews.join(","), PREVIEW_DAYS * 86400) : clearCookieHeader(PREVIEW_COOKIE));
app.get("/api/admin/flags", async (c) => c.json({ flags: await appFlags(c.env, signedIn(c).id, previewsAsked(c.req.raw)) }, 200, NO_STORE));
app.put("/api/admin/flags/:name/preview", async (c) => {
  const user = signedIn(c);
  const name = c.req.param("name");
  if (!FLAG_NAME.test(name)) return c.json({ error: "Name a flag, as GET /api/admin/flags lists them." }, 404);
  const body = await objectBody(c, BODY.small);
  const { flag, previews } = await setPreview(c.env, user.id, name, body.on, previewsAsked(c.req.raw));
  return c.json({ flag }, 200, { ...NO_STORE, "Set-Cookie": previewCookie(previews) });
});
app.delete("/api/admin/previews", async (c) => {
  const flags = await appFlags(c.env, signedIn(c).id, []);
  return c.json({ flags }, 200, { ...NO_STORE, "Set-Cookie": clearCookieHeader(PREVIEW_COOKIE) });
});

// Rename: the display name shown in the app and on consent screens.
app.post("/api/me", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small);
  const name = textOf(body.name).trim();
  if (name.length < 1 || name.length > 40) return c.json({ error: "Pick a name between 1 and 40 characters." }, 400);
  await c.env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(name, user.id).run();
  return c.json({ user: { ...user, name } });
});

// An email on the account, for getting back in when a passkey is lost and for receipts (src/account-email.ts). Adding one sends a code
// to it (sent here and now, so a failure says so); the code back keeps it.
const sendOrSay = async (env: Env, mail: { to: string; subject: string; text: string }) => {
  try {
    await accountEmail.send(env, mail);
  } catch (error) {
    if (error instanceof accountEmail.EmailError) throw error;
    console.error(JSON.stringify({ email_error: String((error as { code?: string })?.code ?? error) }));
    throw new accountEmail.EmailError("The email couldn't be sent just now. Try again in a minute.");
  }
};
// After the answer: what tells an address something happened (never what decides the answer, so its time gives nothing away).
const sendLater = (c: Context<AppContext>, mail: { to: string; subject: string; text: string } | null) => {
  if (mail) c.executionCtx.waitUntil(accountEmail.send(c.env, mail).catch((error) => console.error(JSON.stringify({ email_error: String((error as { code?: string })?.code ?? error) }))));
};
app.get("/api/account/email", async (c) => {
  const user = signedIn(c);
  return c.json({ offered: accountEmail.offered(c.env), ...((await accountEmail.accountEmail(c.env, user.id)) ?? { email: null, verifiedAt: null }) });
});
app.post("/api/account/email", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small);
  const { id, mail } = await accountEmail.startConfirm(c.env, user.id, body.email);
  await sendOrSay(c.env, mail);
  return c.json({ id, sentTo: mail.to });
});
app.post("/api/account/email/confirm", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small);
  const { email, verifiedAt, notice } = await accountEmail.finishConfirm(c.env, user.id, body.id, body.code);
  sendLater(c, notice);
  return c.json({ email, verifiedAt });
});
app.delete("/api/account/email", async (c) => {
  const user = signedIn(c);
  await accountEmail.removeEmail(c.env, user.id);
  return c.json({ email: null });
});
// Getting back in with the account's email, from the sign-in page: no session needed, a few tries a minute per connection (AUTH_LIMITER,
// as signing in), and the same answer for any address.
const recoveryLimited = async (c: Context<AppContext>) => !(await c.env.AUTH_LIMITER.limit({ key: `auth:${c.req.header("CF-Connecting-IP") ?? "unknown"}` })).success;
// From this site's own pages only. They need no session and confirm hands one out, so another site's form (text/plain, which jsonBody
// reads all the same) could otherwise sign a visitor in to an account whose code that site holds: login CSRF.
const notFromHere = (c: Context<AppContext>) =>
  c.req.header("Origin") === c.env.PUBLIC_ORIGIN ? null : c.json({ error: "That request didn't come from this site." }, 403);
app.post("/api/recover", async (c) => {
  const refused = notFromHere(c);
  if (refused) return refused;
  if (await recoveryLimited(c)) return c.json({ error: "Too many tries. Wait a minute." }, 429);
  const body = await objectBody(c, BODY.small);
  const { id, mail } = await accountEmail.startRecovery(c.env, body.email);
  sendLater(c, mail);
  return c.json({ id });
});
app.post("/api/recover/confirm", async (c) => {
  const refused = notFromHere(c);
  if (refused) return refused;
  if (await recoveryLimited(c)) return c.json({ error: "Too many tries. Wait a minute." }, 429);
  const body = await objectBody(c, BODY.small);
  const { userId, notice } = await accountEmail.finishRecovery(c.env, body.id, body.code);
  const cookie = await startSession(c.env, userId, c.req.header("User-Agent") ?? null);
  sendLater(c, notice);
  return c.json({ ok: true }, 200, { "Set-Cookie": cookie, "Cache-Control": "no-store" });
});

// Everything the server holds about the signed-in account, as one JSON document (the app adds what's on the device).
app.get("/api/me/export", async (c) => {
  const user = signedIn(c);
  const db = c.env.DB;
  const [account, passkeys, signins, sessions, tokens, notes, uploads, grants, look, themes, practice, roles, staged, adminActions, packs, corrections, requests] = await Promise.all([
    db.prepare("SELECT id, name, created_at FROM users WHERE id = ?").bind(user.id).first<{ id: string; name: string; created_at: number }>(),
    db.prepare("SELECT id, device_type, backed_up, transports, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at").bind(user.id).all(),
    listSignIns(c.env, user.id),
    db.prepare("SELECT created_at, expires_at, user_agent FROM sessions WHERE user_id = ? ORDER BY created_at").bind(user.id).all(),
    db.prepare("SELECT name, prefix, created_at, last_used_at, revoked_at FROM api_tokens WHERE user_id = ? ORDER BY created_at").bind(user.id).all(),
    db.prepare("SELECT id, text, source, created_at FROM notes WHERE user_id = ? ORDER BY created_at").bind(user.id).all(),
    db.prepare("SELECT id, filename, content_type, status, size, sha256, source, created_at, stored_at FROM uploads WHERE user_id = ? ORDER BY created_at").bind(user.id).all(),
    c.env.OAUTH_PROVIDER.listUserGrants(user.id),
    getLook(c.env, user.id),
    listThemes(c.env, user.id),
    practiceRoom(c.env, user.id).exportAll(),
    db.prepare("SELECT role, granted_at, granted_by, note FROM user_roles WHERE user_id = ? ORDER BY role").bind(user.id).all(),
    db.prepare("SELECT name, content_type, size, sha256, status, source, created_at, expires_at FROM staged_files WHERE user_id = ? ORDER BY created_at").bind(user.id).all(),
    db.prepare("SELECT action, target, via, note, created_at FROM admin_log WHERE actor_id = ? ORDER BY created_at").bind(user.id).all(),
    exportPacks(c.env, user.id),
    db.prepare("SELECT id, item_id, version, path, kind, value, note, state, accepted_in, answer_note, likes, created_at FROM corrections WHERE author_id = ? ORDER BY created_at").bind(user.id).all(),
    db.prepare("SELECT id, kind, language, level, topic, book_id, book, title, details, state, state_note, likes, answers, created_at, updated_at FROM requests WHERE author_id = ? ORDER BY created_at").bind(user.id).all(),
  ]);
  const texts = await exportTexts(c.env, user.id);
  const billing = await exportBilling(c.env, user.id);
  const progressClears = await listClears(c.env, user.id);
  const [community, reminders, lookHistory, lookImages] = await Promise.all([exportCommunity(c.env, user.id), exportReminders(c.env, user.id), db.prepare("SELECT rev, look, source, created_at FROM look_history WHERE user_id = ? ORDER BY rev").bind(user.id).all(), db.prepare("SELECT hash, content_type, size, created_at FROM look_images WHERE user_id = ? ORDER BY created_at").bind(user.id).all()]);
  return c.json(
    {
      format: "lexicommons-account-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      // The paid plan (billing.ts): the Stripe customer's id, the subscriptions as kept here, the in-app AI's months and use (no content).
      billing,
      account: account && { id: account.id, name: account.name, createdAt: account.created_at },
      // The account's email for getting back in and receipts (account-email.ts), or null. Codes on their way to it aren't kept past an hour.
      email: await accountEmail.accountEmail(c.env, user.id),
      passkeys: passkeys.results,
      // Signing in with Google or GitHub: the provider, its id for you, a label. No email is ever kept.
      signins,
      sessions: sessions.results,
      tokens: tokens.results,
      connections: grants.items.map((g) => ({
        app: (g.metadata as { clientName?: string } | null)?.clientName ?? g.clientId,
        clientId: g.clientId,
        scope: g.scope,
        createdAt: g.createdAt,
      })),
      notes: notes.results,
      uploads: uploads.results,
      look: look && { rev: look.rev, changedBy: look.source, updatedAt: look.updatedAt, look: look.look },
      // The last few changes to your look, so one can be undone, and its pictures (by their hashes; each is at /api/look/images/<hash>).
      lookHistory: lookHistory.results,
      lookImages: lookImages.results,
      themes: themes.themes.map((t) => ({ id: t.id, look: t.look, createdBy: t.createdBy, createdAt: t.createdAt, updatedAt: t.updatedAt, deletedAt: t.deletedAt })),
      // Practices still on the server (finished ones move to the device once it collects them), and what you know as
      // your app last sent it for your AI.
      practice: JSON.parse(practice) as unknown,
      // Your packs as the account keeps them for your AI (the latest copy a device sent), the devices changes go to,
      // and the changes your AI and your devices made (with any still on their way).
      packs,
      // The corrections you suggested in Explore, and what became of each.
      corrections: corrections.results,
      // The requests you posted in Explore, and what became of each (the packs that answered them are in Explore).
      requests: requests.results,
      // Explore: what you shared and its versions, your follows and likes, the terms you accepted, the reports you made,
      // your counter-notices, your suggestions to a grammar, the answers you gave to requests, and any limit on your account.
      community,
      // Reminders, if you turned them on: their settings, what they keep, each device's subscription (never its keys) and notes waiting.
      reminders,
      // The texts your AI added, removed or undid (what each did; the texts themselves are on your devices).
      texts,
      // When you cleared your study progress everywhere, and any Undo (the answers themselves are on your devices).
      progressClears,
      // The bug reports you sent (Settings → Report a bug): what you wrote, what went along, and each screenshot's address.
      bugReports: await exportBugReports(c.env, user.id),
      // An admin's or moderator's role, files staged for the open library, and what they did with the role.
      roles: roles.results,
      stagedFiles: staged.results,
      adminActions: adminActions.results,
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

// Deletes the account. The body must say so, so nothing deletes an account by accident.
app.delete("/api/me", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small);
  if (body.confirm !== "delete my account") return c.json({ error: "Confirm by sending { confirm: \"delete my account\" }." }, 400);
  // A plan ends at Stripe first, so nothing is charged after the account is gone; if Stripe can't be reached, nothing is deleted.
  try {
    await endForDeletion(c.env, user.id);
  } catch {
    return c.json({ error: "Your plan couldn't be canceled just now, so your account wasn't deleted. Try again in a moment." }, 502);
  }
  const removed = await deleteAccount(c.env, user.id);
  return c.json({ ok: true, ...removed }, 200, { "Set-Cookie": clearCookieHeader(SESSION_COOKIE) });
});

app.get("/api/notes", async (c) => c.json(await listNotes(c.env, signedIn(c).id)));
app.post("/api/notes", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.note);
  return c.json(await addNote(c.env, user.id, textOf(body.text), "app"));
});
app.get("/api/uploads", async (c) => c.json(await listUploads(c.env, signedIn(c).id)));
app.get("/api/uploads/:id/file", async (c) => serveUpload(c.env, signedIn(c).id, c.req.param("id")));

app.get("/api/tokens", async (c) => c.json(await listTokens(c.env, signedIn(c).id)));
app.post("/api/tokens", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small);
  return c.json(await createToken(c.env, user.id, textOf(body.name), { admin: body.admin === true }));
});
app.delete("/api/tokens/:id", async (c) => {
  const user = signedIn(c);
  const ok = await revokeToken(c.env, user.id, c.req.param("id"));
  await recordGoesWithLastAi(c.env, user.id);
  return c.json({ ok });
});

// The look in use and the saved themes (looks.ts): the app sends every change here and polls for changes from the
// person's AI or other devices. ?since=<rev>&lib=<library rev> answers 204 when neither changed, so the poll costs
// one read. (An app from before saved themes sends no lib.)
app.get("/api/look", async (c) => {
  const user = signedIn(c);
  const since = Number(c.req.query("since") ?? "-1");
  const lib = c.req.query("lib");
  if (Number.isInteger(since) && since >= 0) {
    const revs = await getRevs(c.env, user.id);
    if (revs.rev <= since && (lib === undefined || revs.library <= Number(lib))) return c.body(null, 204, { "Cache-Control": "no-store" });
  }
  const { record, library } = await getLookOrLibrary(c.env, user.id);
  return c.json(
    record
      ? { rev: record.rev, look: record.look, source: record.source, updatedAt: record.updatedAt, themeRev: record.themeRev, libraryRev: record.libraryRev, account: user.id }
      : { rev: 0, look: null, themeRev: null, libraryRev: library, account: user.id },
    200,
    { "Cache-Control": "no-store" },
  );
});
// The device's whole look, on top of baseRev. The answer's result is "saved", "conflict" (the look moved on: merge
// and send again) or "missing_images" (upload these first). Those two are ordinary outcomes of syncing, so they're
// 200s: a 4xx would log an error in every browser console.
app.put("/api/look", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.look);
  const baseRev = asNumber(body.baseRev);
  if (!Number.isInteger(baseRev) || baseRev < 0) return c.json({ error: "Send baseRev, the revision this look started from." }, 400);
  try {
    return c.json({ result: "saved", ...(await saveLook(c.env, user.id, body.look, baseRev, "device")) });
  } catch (error) {
    if (error instanceof LookConflict) {
      const current = error.current;
      return c.json({ result: "conflict", rev: current?.rev ?? 0, look: current?.look ?? null, source: current?.source ?? null });
    }
    if (error instanceof MissingImages) return c.json({ result: "missing_images", missing: error.hashes });
    throw error;
  }
});
// Switching to a theme: a built-in one or one of yours, by id. No theme's content changes.
app.post("/api/look/use", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small);
  if (typeof body.theme !== "string" || !body.theme) return c.json({ error: "Say which theme: a built-in one's id, or one of yours." }, 400);
  const result = await useTheme(c.env, user.id, body.theme, "device");
  const record = await getLook(c.env, user.id);
  return c.json({ rev: result.rev, look: record?.look ?? result.look, source: record?.source ?? "device", themeRev: record?.themeRev ?? null, libraryRev: record?.libraryRev ?? 0 });
});
// The saved themes, deleted ones included (with deletedAt), and the library's revision.
app.get("/api/themes", async (c) => c.json(await listThemes(c.env, signedIn(c).id), 200, { "Cache-Control": "no-store" }));
// One theme's content from a device, on top of baseRev (0: new). Like PUT /api/look, the answer's result is "saved",
// "conflict" (with the theme as it is now, null if it's gone) or "missing_images".
app.put("/api/themes/:id", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.look);
  const baseRev = asNumber(body.baseRev);
  if (!Number.isInteger(baseRev) || baseRev < 0) return c.json({ error: "Send baseRev, the theme's revision this change started from (0 for a new theme)." }, 400);
  try {
    const saved = await saveTheme(c.env, user.id, c.req.param("id"), body.look, baseRev, "device", { undelete: body.undelete === true });
    return c.json({ result: "saved", ...saved, revs: await getRevs(c.env, user.id) });
  } catch (error) {
    if (error instanceof ThemeConflict) return c.json({ result: "conflict", theme: error.current });
    if (error instanceof MissingImages) return c.json({ result: "missing_images", missing: error.hashes });
    throw error;
  }
});
app.post("/api/themes/:id/delete", async (c) => {
  const user = signedIn(c);
  return c.json({ result: "deleted", ...(await deleteTheme(c.env, user.id, c.req.param("id"), "device")) });
});
app.post("/api/themes/:id/restore", async (c) => {
  const user = signedIn(c);
  return c.json({ result: "restored", ...(await restoreTheme(c.env, user.id, c.req.param("id"), "device")) });
});
app.put("/api/look/images/:hash", async (c) => {
  const user = signedIn(c);
  const contentType = (c.req.header("Content-Type") ?? "").split(";")[0]!.trim();
  // Read only up to the limit: a body sent without a Content-Length can't be buffered past it.
  const bytes = await readBytesLimited(c.req.raw, LOOK_LIMITS.imageBytes);
  if (!bytes) return c.json({ error: "Each image can be up to 4 MB." }, 413);
  return c.json(await putLookImage(c.env, user.id, c.req.param("hash"), contentType, bytes.buffer as ArrayBuffer));
});
app.get("/api/look/images/:hash", async (c) => serveLookImage(c.env, signedIn(c).id, c.req.param("hash")));
app.post("/api/look/applied", async (c) => {
  const user = signedIn(c);
  await reportApplied(c.env, user.id, await objectBody(c, BODY.report));
  return c.json({ ok: true });
});

// Practice with your AI (src/practice.ts): the account's practice room. The app starts a practice, sends your turns
// and long-polls for your AI's; your AI does its side over MCP (mcp-practice.ts). Finished practices are collected
// onto the device, then deleted here.
const pollWait = (value: string | undefined) => Math.max(0, Math.min(Number(value ?? "0") || 0, 25)) * 1000;
// A practice's settings with the learner snapshot (at most 64 KB of JSON, protocol.js LIMITS), and one turn.
const PRACTICE_BODY = { start: 96 * 1024, learner: 96 * 1024, turn: 16 * 1024, reply: 32 * 1024 };
app.post("/api/practice", async (c) => {
  const user = signedIn(c);
  const body = await jsonBody(c, PRACTICE_BODY.start);
  const snapshot = body && typeof body === "object" && !Array.isArray(body) ? ((body as { snapshot?: unknown }).snapshot ?? null) : null;
  // A practice with the in-app AI only where this site offers it: a key of your own, or the plan's for an account that has it now.
  const inapp = body && typeof body === "object" && !Array.isArray(body) ? (body as { inapp?: unknown }).inapp : undefined;
  if (inapp !== undefined) {
    const engine = inapp && typeof inapp === "object" ? (inapp as { engine?: unknown }).engine : undefined;
    if (engine === "plan") {
      if (!hostedOffered(c.env)) return c.json({ error: "not_offered" }, 404);
      if (!(await entitlement(c.env, user.id))?.active) return c.json({ error: "The in-app AI comes with the plan, and this account doesn't have it right now." }, 402);
    } else if (!features(c.env).ownKey) return c.json({ error: "not_offered" }, 404);
  }
  return c.json(unwrap(await practiceRoom(c.env, user.id).create(body, snapshot)));
});
app.get("/api/practice", async (c) => c.json(await practiceRoom(c.env, signedIn(c).id).list(), 200, { "Cache-Control": "no-store" }));
app.put("/api/practice/learner", async (c) => {
  const user = signedIn(c);
  return c.json(unwrap(await practiceRoom(c.env, user.id).putLearner(await jsonBody(c, PRACTICE_BODY.learner))));
});
// ?after=<seq>&v=<version>&wait=<seconds>: answers at once when anything changed, else holds up to `wait` seconds.
app.get("/api/practice/:id", async (c) => {
  const user = signedIn(c);
  const after = Math.max(0, Number(c.req.query("after") ?? "0") || 0);
  const result = await practiceRoom(c.env, user.id).poll(c.req.param("id"), after, c.req.query("v") ?? null, pollWait(c.req.query("wait")));
  if ("gone" in result) return c.json({ error: "gone" }, 404, { "Cache-Control": "no-store" });
  return c.json(result, 200, { "Cache-Control": "no-store" });
});
app.post("/api/practice/:id/turns", async (c) => {
  const user = signedIn(c);
  return c.json(unwrap(await practiceRoom(c.env, user.id).learnerTurn(c.req.param("id"), await jsonBody(c, PRACTICE_BODY.turn))));
});
app.post("/api/practice/:id/end", async (c) => c.json(unwrap(await practiceRoom(c.env, signedIn(c).id).endFromApp(c.req.param("id")))));
// The paid plan (src/billing.ts): Checkout to start it, the Portal to change it, Stripe's webhook for who has it.
const billingAnswer = async (c: Context<AppContext>, run: () => Promise<unknown>) => {
  try {
    return c.json(await run(), 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof BillingError) return c.json({ error: error.message }, error.status as 400);
    throw error;
  }
};
app.post("/api/billing/checkout", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small);
  return billingAnswer(c, () => startCheckout(c.env, user.id, body.interval));
});
app.post("/api/billing/portal", async (c) => billingAnswer(c, () => openPortal(c.env, signedIn(c).id)));
app.post("/api/billing/stripe", async (c) => {
  const raw = await readTextLimited(c.req.raw, 256 * 1024);
  if (raw === null) return c.json({ error: "too_big" }, 413);
  const { status, body } = await receiveEvent(c.env, raw, c.req.header("Stripe-Signature") ?? null);
  return c.json(body, status as 200);
});

// The in-app AI (practice/inapp-run.js): this device made the AI's reply, or its summary, from a key of its own or through the
// plan's routes below, and the room checks and keeps it as it does your own AI's (checkReply, placeGrades, checkSummary).
const inappOffered = (env: Env) => features(env).ownKey || hostedOffered(env);
app.post("/api/practice/:id/reply", async (c) => {
  const user = signedIn(c);
  if (!inappOffered(c.env)) return c.json({ error: "not_offered" }, 404);
  return c.json(unwrap(await practiceRoom(c.env, user.id).appReply(c.req.param("id"), await jsonBody(c, PRACTICE_BODY.reply))));
});
// An in-app practice carried on by another engine: { engine, name }, only one this site offers this account now.
app.post("/api/practice/:id/engine", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small);
  if (body.engine === "plan") {
    if (!hostedOffered(c.env)) return c.json({ error: "not_offered" }, 404);
    if (!(await entitlement(c.env, user.id))?.active) return c.json({ error: "The in-app AI comes with the plan, and this account doesn't have it right now." }, 402);
  } else if (body.engine === "own-key") {
    if (!features(c.env).ownKey) return c.json({ error: "not_offered" }, 404);
  } else return c.json({ error: "Which engine?" }, 400);
  return c.json(unwrap(await practiceRoom(c.env, user.id).switchEngine(c.req.param("id"), body)));
});
app.post("/api/practice/:id/summary", async (c) => {
  const user = signedIn(c);
  if (!inappOffered(c.env)) return c.json({ error: "not_offered" }, 404);
  return c.json(unwrap(await practiceRoom(c.env, user.id).appSummary(c.req.param("id"), await jsonBody(c, PRACTICE_BODY.reply))));
});

// The in-app AI on the plan (src/ai-hosted.ts): a practice's reply and summary as the provider's stream, and Translate with AI,
// made here on Lexicommons' own key and metered against the account's monthly allowance.
const hostedAnswer = async (c: Context<AppContext>, run: () => Promise<Response | object>) => {
  try {
    const out = await run();
    return out instanceof Response ? out : c.json(out, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof HostedError) return c.json({ error: error.message, code: error.code, ...error.extra }, error.status as 400);
    throw error;
  }
};
app.post("/api/ai/hosted/reply", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small);
  return hostedAnswer(c, () => hostedReply(c.env, c.executionCtx, user.id, body));
});
app.post("/api/ai/hosted/summary", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small);
  return hostedAnswer(c, () => hostedSummary(c.env, c.executionCtx, user.id, body));
});
app.post("/api/ai/hosted/translate", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small);
  return hostedAnswer(c, () => hostedTranslate(c.env, user.id, body));
});
// { after }: the last turn the device has; one from before it sent no body (practice.ts collect).
app.post("/api/practice/:id/collected", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, BODY.small, { optional: true });
  return c.json(await practiceRoom(c.env, user.id).collect(c.req.param("id"), body.after));
});

// Requests for your AI (public/js/ai/requests.js), kept in the same room: the app leaves one, follows them all (?v=<version>
// &wait=<seconds> answers at once when they changed, else holds), and cancels one still waiting.
app.post("/api/ai/requests", async (c) => {
  const user = signedIn(c);
  const body = await jsonBody(c, 16 * 1024);
  // Weaving a text of yours: the copy the app just sent is claimed for this request before it's kept, and tied to it after; if the
  // request can't be kept, the copy is put back for another try (src/texts.ts).
  const weave = body && typeof body === "object" && (body as { kind?: unknown }).kind === "weave" ? (body as { book?: unknown; upload?: unknown }) : null;
  // Only into a language the books pipeline's judges have accepted weaves in (its generated list), so nobody waits on one that can't be.
  if (weave && !WEAVE_LANGUAGES.includes(String((weave as { language?: unknown }).language ?? ""))) throw new LibraryError("Weaving into that language isn't ready yet.");
  const claim = weave ? await claimWeaveText(c.env, user.id, weave.upload, weave.book) : null;
  let made;
  try {
    made = unwrap(await practiceRoom(c.env, user.id).createRequest(body)) as { id: string };
  } catch (error) {
    await claim?.release().catch(() => {});
    throw error;
  }
  await claim?.tie(made.id);
  return c.json(made);
});
// The text a weave request is for, from the device that has it (texts.ts storeWeaveText): kept only until the request finishes.
app.post("/api/ai/weave-texts", async (c) => c.json(await storeWeaveText(c.env, signedIn(c).id, await jsonBody(c, TEXT_UPLOADS.book!.maxBytes + 64 * 1024))));
app.get("/api/ai/requests", async (c) => c.json(await practiceRoom(c.env, signedIn(c).id).requestsPoll(c.req.query("v") ?? null, pollWait(c.req.query("wait"))), 200, { "Cache-Control": "no-store" }));
app.post("/api/ai/requests/:id/cancel", async (c) => {
  const user = signedIn(c);
  const canceled = unwrap(await practiceRoom(c.env, user.id).cancelRequest(c.req.param("id"))) as { id: string; kind: string };
  // A weave's copy of the text goes with it (or, if storage can't take that now, with the next tidy).
  if (canceled.kind === "weave") await dropWeaveText(c.env, user.id, canceled.id).catch(() => {});
  return c.json(canceled);
});

// Translate, online (src/translate.ts): Lexicommons' own and Explore's shared packs and the library's books, searched
// with the engine the device uses; the device merges it after what it found itself. What someone typed goes in the body and
// never in a URL, which the host's logs keep: there's no GET for it (privacy.html says so, and privacy-check holds it).
const TRANSLATE_BODY = 16 * 1024;
app.get("/api/translate/languages", async (c) => {
  signedIn(c);
  return c.json({ languages: await translateLanguages(c.env) }, 200, { "Cache-Control": "no-store" });
});
// Which packs hold what was typed, asked for with a press (src/find.ts). The text is in the body, never the URL, and isn't kept. If this language has packs still to be written into the
// index, this starts on a few, so a copy with no cron and a pack just published both catch up.
app.post("/api/translate/find", async (c) => {
  signedIn(c);
  const body = await objectBody(c, TRANSLATE_BODY);
  const found = await findPacks(c.env, body.q, body.language);
  if (found.indexing) c.executionCtx.waitUntil(indexMissing(c.env, { language: String(body.language), limit: 2 }).catch(() => {}));
  return c.json(found, 200, { "Cache-Control": "no-store" });
});
app.post("/api/translate", async (c) => {
  signedIn(c);
  const body = await objectBody(c, TRANSLATE_BODY);
  const timing: TranslateTiming = {};
  const result = await translateOnline(c.env, typeof body.q === "string" ? body.q : "", { from: body.from, to: body.to, language: body.language }, timing);
  return result ? c.json(result, 200, { "Cache-Control": "no-store", "Server-Timing": serverTiming(timing) }) : c.json({ error: "Type something to translate." }, 400);
});

// Your AI's packs (src/packs.ts): each device says it's here and what's on it, polls for the changes waiting for it
// (?device=<id> answers 204 when there are none, so the poll costs one read), reports how each went, and sends its
// copy of a pack after a change. Deleting a pack or Undo in the app is queued for the other devices.
// Bodies read up to their limit (a device's list of its packs, a report, an undo or a delete); a device id is text.
const deviceOf = (value: unknown) => (typeof value === "string" ? value : "");
const PACKS_BODY = { device: 64 * 1024, small: 16 * 1024 };
app.put("/api/packs/device", async (c) => {
  const body = await objectBody(c, PACKS_BODY.device);
  return c.json(await putDevice(c.env, signedIn(c).id, deviceOf(body.device), typeof body.label === "string" ? body.label : undefined, body.packs, body.texts));
});
app.get("/api/packs/inbox", async (c) => {
  const user = signedIn(c);
  const device = deviceOf(c.req.query("device"));
  // One poll for both relays: your AI's packs and the texts it adds, asked as one statement (one round trip; the load rehearsal).
  const now = Date.now();
  const waiting = await c.env.DB.prepare(`SELECT EXISTS (${PACKS_WAITING}) AS packs, EXISTS (${TEXTS_WAITING}) AS texts`)
    .bind(user.id, device, now, user.id, device, now)
    .first<{ packs: number; texts: number }>();
  const packs = Boolean(waiting?.packs);
  const texts = Boolean(waiting?.texts);
  if (!packs && !texts) return c.body(null, 204, { "Cache-Control": "no-store" });
  const [changes, textChanges] = await Promise.all([packs ? inbox(c.env, user.id, device) : [], texts ? textInbox(c.env, user.id, device) : []]);
  return c.json({ changes, texts: textChanges }, 200, { "Cache-Control": "no-store" });
});
// The texts your AI adds (src/texts.ts): a change's file for a device of yours (part text or cover, always a download
// that can't run), how a device took one, and Remove or Undo pressed in the app.
app.get("/api/texts/files/:id", async (c) => serveTextFile(c.env, signedIn(c).id, c.req.param("id"), c.req.query("part") ?? "text"));
app.post("/api/texts/changes/:id/report", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, PACKS_BODY.small);
  return c.json(await reportText(c.env, user.id, deviceOf(body.device), c.req.param("id"), body));
});
app.post("/api/texts/changes", async (c) => {
  const user = signedIn(c);
  const body = await objectBody(c, PACKS_BODY.small);
  return c.json(await queueTextFromDevice(c.env, user.id, typeof body.label === "string" ? body.label : "", body));
});
app.post("/api/packs/changes/:id/report", async (c) => {
  const body = await objectBody(c, PACKS_BODY.small);
  return c.json(await report(c.env, signedIn(c).id, deviceOf(body.device), c.req.param("id"), body));
});
app.post("/api/packs/changes", async (c) => {
  const body = await objectBody(c, PACKS_BODY.small);
  return c.json(await queueFromDevice(c.env, signedIn(c).id, typeof body.label === "string" ? body.label : "", body));
});
app.put("/api/packs/copies/:id", async (c) => {
  const body = await objectBody(c, COPY_BODY);
  return c.json(await putCopy(c.env, signedIn(c).id, deviceOf(body.device), c.req.param("id"), body));
});
// A recording an audio change carries, while it's on its way to this account's devices (src/packs.ts serveChangeClip).
app.get("/api/packs/changes/:id/clips/:clip", async (c) => serveChangeClip(c.env, signedIn(c).id, c.req.param("id"), c.req.param("clip")));
app.delete("/api/packs/copies/:id", async (c) => c.json(await deleteCopy(c.env, signedIn(c).id, deviceOf(c.req.query("device")), c.req.param("id"), Number(c.req.query("through") ?? "0"))));

// Clears of study progress everywhere (src/progress-clears.ts): the account's record of when, which every device using
// your own storage applies; no answers come here.
app.get("/api/progress/clears", async (c) => c.json(await listClears(c.env, signedIn(c).id), 200, { "Cache-Control": "no-store" }));
app.post("/api/progress/clears", async (c) => c.json(await addClear(c.env, signedIn(c).id, await objectBody(c, 1024))));

// Reminders (src/reminders.ts): Web Push for the device you used last. The public VAPID key, a device's subscription
// and its going, the settings, a device's report (study days, pauses, due counts: never what you study), a test.
app.get("/api/push/key", (c) => c.json({ key: c.env.VAPID_PUBLIC_KEY ?? null }, 200, { "Cache-Control": "no-store" }));
app.post("/api/push/subscribe", async (c) => {
  const result = await subscribe(c.env, signedIn(c).id, await objectBody(c, 4096));
  return c.json(result, result.ok ? 200 : 400);
});
app.post("/api/push/unsubscribe", async (c) => c.json(await unsubscribe(c.env, signedIn(c).id, (await objectBody(c, 1024)).device)));
app.post("/api/push/test", async (c) => c.json(await sendTest(c.env, signedIn(c).id, (await objectBody(c, 1024)).device)));
app.get("/api/reminders", async (c) => c.json(await getReminders(c.env, signedIn(c).id), 200, { "Cache-Control": "no-store" }));
app.put("/api/reminders/settings", async (c) => {
  const result = await setSettings(c.env, signedIn(c).id, await objectBody(c, 2048));
  return c.json(result, result.ok ? 200 : 409);
});
app.post("/api/reminders/report", async (c) => c.json(await reminderReport(c.env, signedIn(c).id, await objectBody(c, 8192))));
app.post("/api/progress/clears/:id/undo", async (c) => c.json(await undoClear(c.env, signedIn(c).id, c.req.param("id"))));

// Connected AI apps are the OAuth grants this account has approved.
app.get("/api/connections", async (c) => {
  const user = signedIn(c);
  const grants = await c.env.OAUTH_PROVIDER.listUserGrants(user.id);
  return c.json(
    grants.items.map((g) => ({
      id: g.id,
      app: (g.metadata as { clientName?: string } | null)?.clientName ?? g.clientId,
      clientId: g.clientId,
      scope: g.scope,
      createdAt: g.createdAt,
    })),
  );
});
app.delete("/api/connections/:id", async (c) => {
  const user = signedIn(c);
  // Marked revoked first, so a refresh under way can't bring it back (src/revoked.ts).
  await revokeConnection(c.env, c.env.OAUTH_PROVIDER, user.id, c.req.param("id"));
  await recordGoesWithLastAi(c.env, user.id);
  return c.json({ ok: true });
});

// Your study record, for your AI to read (public/js/ai/study-record.js, src/coach.ts): only while an AI is connected. With none, it's refused, and what was here goes.
async function recordGoesWithLastAi(env: Env, userId: string) {
  if (!(await aiConnected(env, userId))) await practiceRoom(env, userId).clearRecords();
}
app.put("/api/ai/record", async (c) => {
  const user = signedIn(c);
  if (!(await aiConnected(c.env, user.id))) {
    await practiceRoom(c.env, user.id).clearRecords();
    return c.json({ error: "No AI is connected." }, 409);
  }
  return c.json(await practiceRoom(c.env, user.id).putRecord(checkRecord(await objectBody(c, PRACTICE_LIMITS.recordBytes))));
});
app.get("/api/ai/record", async (c) => c.json({ records: await practiceRoom(c.env, signedIn(c).id).recordLanguages() }, 200, { "Cache-Control": "no-store" }));
app.delete("/api/ai/record", async (c) => c.json(await practiceRoom(c.env, signedIn(c).id).clearRecords()));

// --- Explore, the community section (community.ts): browsing, follows, likes, sharing ------------------------------

const listQuery = (c: Context<AppContext>): ListQuery => ({
  kind: "pack",
  language: c.req.query("lang") || undefined,
  level: c.req.query("level") || undefined,
  topic: c.req.query("topic") || undefined,
  q: c.req.query("q") || undefined,
  sort: c.req.query("sort") === "new" ? "new" : "popular",
  offset: Number(c.req.query("offset") ?? "0") || 0,
});
const NO_STORE = { "Cache-Control": "no-store" };
app.get("/api/community/explore", async (c) => c.json(await exploreHome(c.env, signedIn(c).id, c.req.query("lang") || undefined), 200, NO_STORE));
app.get("/api/community/items", async (c) => c.json(await listItems(c.env, signedIn(c).id, listQuery(c)), 200, NO_STORE));
app.get("/api/community/items/:id", async (c) => {
  const found = await getItem(c.env, c.req.param("id"), signedIn(c).id);
  return found ? c.json(found, 200, NO_STORE) : c.json({ error: "There's no such pack in Explore." }, 404);
});
app.get("/api/community/topics", async (c) => c.json(await listTopics(c.env)));
// Packs per language ([{ lang, packs }], the most first), for Explore's language picker.
app.get("/api/community/languages", async (c) => {
  signedIn(c);
  return c.json(await languageCounts(c.env), 200, NO_STORE);
});
// What this account follows, as refs its devices load (study/packs.js syncLibraryPacks).
app.get("/api/community/following", async (c) => c.json(await following(c.env, signedIn(c).id), 200, NO_STORE));
app.post("/api/community/items/:id/follow", async (c) => {
  const body = await objectBody(c, BODY.small, { optional: true });
  return c.json(await follow(c.env, signedIn(c).id, c.req.param("id"), body.corrections === "community" ? "community" : "published"));
});
app.delete("/api/community/items/:id/follow", async (c) => c.json(await unfollow(c.env, signedIn(c).id, c.req.param("id"))));
app.post("/api/community/items/:id/like", async (c) => c.json(await like(c.env, signedIn(c).id, c.req.param("id"), true)));
// Corrections (corrections.ts): a pack's, suggesting one, answering them, likes (the app's only), yours, and the open
// fixes a device with community corrections plays.
app.get("/api/community/items/:id/corrections", async (c) => c.json(await listCorrections(c.env, c.req.param("id"), signedIn(c).id, { all: c.req.query("all") === "1" }), 200, NO_STORE));
app.post("/api/community/items/:id/corrections", async (c) => {
  const body = await objectBody(c, EXPLORE_BODY.suggest);
  const result = await suggestCorrection(c.env, { userId: signedIn(c).id, via: "device" }, c.req.param("id"), body);
  return c.json(result, result.suggested ? 200 : 422);
});
app.post("/api/community/items/:id/corrections/review", async (c) => {
  // Signed in on a device: an admin's own session reaches the admin's power.
  const result = await reviewCorrections(c.env, { userId: signedIn(c).id, via: "device", adminAccess: true }, c.req.param("id"), await objectBody(c, EXPLORE_BODY.review));
  return c.json(result, result.reviewed ? 200 : 422);
});
app.get("/api/community/items/:id/fixes", async (c) => c.json(await openFixes(c.env, c.req.param("id"), signedIn(c).id), 200, NO_STORE));
app.post("/api/community/corrections/:cid/like", async (c) => c.json(await likeCorrection(c.env, signedIn(c).id, c.req.param("cid"), true)));
app.delete("/api/community/corrections/:cid/like", async (c) => c.json(await likeCorrection(c.env, signedIn(c).id, c.req.param("cid"), false)));
app.post("/api/community/corrections/:cid/withdraw", async (c) => c.json(await withdrawCorrection(c.env, signedIn(c).id, c.req.param("cid"))));
// Reporting a correction for what it says (moderation.ts); a wrong one is declined by the pack's author instead.
app.post("/api/community/corrections/:cid/report", async (c) => {
  const body = await objectBody(c, EXPLORE_BODY.report);
  return c.json(await reportCorrection(c.env, signedIn(c).id, c.req.param("cid"), { reason: textOrNone(body.reason) ?? "", details: body.details }));
});
app.get("/api/community/corrections/mine", async (c) => c.json(await myCorrections(c.env, signedIn(c).id), 200, NO_STORE));
app.get("/api/community/corrections/to-answer", async (c) => c.json(await correctionsToAnswer(c.env, signedIn(c).id), 200, NO_STORE));
// Requests in Explore (board.ts): the board (or yours, mine=1), one (its author opening it marks its answers seen),
// posting, answering with a pack of yours, closing yours, "me too" (the app's only), and reporting one for what it says.
app.get("/api/community/requests", async (c) =>
  c.json(
    await listRequests(c.env, signedIn(c).id, {
      lang: c.req.query("lang") || undefined,
      kind: c.req.query("kind") || undefined,
      state: c.req.query("state") || undefined,
      sort: c.req.query("sort") === "new" ? "new" : "popular",
      mine: c.req.query("mine") === "1",
      limit: Number(c.req.query("limit") ?? "30") || 30,
    }),
    200,
    NO_STORE,
  ),
);
app.get("/api/community/requests/:rid", async (c) => c.json(await getRequest(c.env, c.req.param("rid"), signedIn(c).id, { markSeen: true }), 200, NO_STORE));
app.post("/api/community/requests", async (c) => c.json(await postRequest(c.env, { userId: signedIn(c).id, via: "device" }, await objectBody(c, REQUEST_BODY.post))));
app.post("/api/community/requests/:rid/answers", async (c) => {
  const body = await objectBody(c, REQUEST_BODY.answer);
  // Signed in on a device: an admin's own session reaches the admin's power.
  return c.json(await answerRequest(c.env, { userId: signedIn(c).id, via: "device", adminAccess: true }, c.req.param("rid"), { item: body.item }));
});
app.post("/api/community/requests/:rid/close", async (c) => {
  const body = await objectBody(c, REQUEST_BODY.close);
  return c.json(await closeRequest(c.env, { userId: signedIn(c).id, via: "device", adminAccess: true }, c.req.param("rid"), { state: body.state, note: body.note }));
});
app.post("/api/community/requests/:rid/like", async (c) => c.json(await likeRequest(c.env, signedIn(c).id, c.req.param("rid"), true)));
app.delete("/api/community/requests/:rid/like", async (c) => c.json(await likeRequest(c.env, signedIn(c).id, c.req.param("rid"), false)));
app.post("/api/community/requests/:rid/report", async (c) => {
  const body = await objectBody(c, EXPLORE_BODY.report);
  return c.json(await reportRequest(c.env, signedIn(c).id, c.req.param("rid"), { reason: textOrNone(body.reason) ?? "", details: body.details }));
});
// A language's shared grammar in Explore (grammar-suggestions.ts): its patterns as the library has them now, the
// suggestions waiting (one pattern's, or the decided ones too), yours, suggesting (every problem at once, 422),
// liking (the app's only), withdrawing yours, and reporting one for what it says.
app.get("/api/community/grammar/:lang", async (c) => {
  signedIn(c);
  return c.json(await grammarPage(c.env, c.req.param("lang")), 200, NO_STORE);
});
app.get("/api/community/grammar/:lang/suggestions", async (c) =>
  c.json(await listSuggestions(c.env, signedIn(c).id, { language: c.req.param("lang"), pattern: c.req.query("pattern") || undefined, decided: c.req.query("decided") === "1", limit: Number(c.req.query("limit") ?? "50") || 50 }), 200, NO_STORE),
);
app.post("/api/community/grammar/:lang/suggestions", async (c) => {
  const body = await objectBody(c, GRAMMAR_SUGGESTION_BODY.suggest);
  const result = await suggestPattern(c.env, { userId: signedIn(c).id, via: "device", ai: false }, { ...body, language: c.req.param("lang") });
  return c.json(result, result.suggested ? 200 : 422);
});
app.get("/api/community/grammar-suggestions/mine", async (c) => c.json(await listSuggestions(c.env, signedIn(c).id, { mine: true, limit: 100 }), 200, NO_STORE));
app.get("/api/community/grammar-suggestions/:gid", async (c) => c.json(await getSuggestion(c.env, c.req.param("gid"), signedIn(c).id), 200, NO_STORE));
app.post("/api/community/grammar-suggestions/:gid/like", async (c) => c.json(await likeSuggestion(c.env, signedIn(c).id, c.req.param("gid"), true)));
app.delete("/api/community/grammar-suggestions/:gid/like", async (c) => c.json(await likeSuggestion(c.env, signedIn(c).id, c.req.param("gid"), false)));
app.post("/api/community/grammar-suggestions/:gid/withdraw", async (c) => c.json(await withdrawSuggestion(c.env, signedIn(c).id, c.req.param("gid"))));
app.post("/api/community/grammar-suggestions/:gid/report", async (c) => {
  const body = await objectBody(c, EXPLORE_BODY.report);
  return c.json(await reportGrammarSuggestion(c.env, signedIn(c).id, c.req.param("gid"), { reason: textOrNone(body.reason) ?? "", details: body.details }));
});
app.delete("/api/community/items/:id/like", async (c) => c.json(await like(c.env, signedIn(c).id, c.req.param("id"), false)));
app.get("/api/community/terms", async (c) => c.json(await termsOf(c.env, signedIn(c).id), 200, NO_STORE));
app.post("/api/community/terms", async (c) => {
  const body = await objectBody(c, BODY.small);
  return c.json(await acceptTerms(c.env, signedIn(c).id, asNumber(body.version)));
});
// A pack shared from the app: the device sends the pack it holds (checked by pack-format.js), and each other field is
// read only as the type it is.
const shareInputOf = (body: Record<string, unknown>) => ({
  pack: body.pack,
  title: textOrNone(body.title),
  about: textOrNone(body.about),
  note: textOrNone(body.note),
  level: isText(body.level) || body.level === null ? body.level : undefined,
  topics: Array.isArray(body.topics) ? body.topics.filter(isText) : undefined,
  cover: isText(body.cover) ? body.cover : undefined,
  confirmRemoved: body.confirmRemoved === true,
  confirmReverts: body.confirmReverts === true,
});
app.post("/api/community/share", async (c) => {
  const body = shareInputOf(await objectBody(c, EXPLORE_BODY.pack));
  const result = await sharePack(c.env, { userId: signedIn(c).id, via: "device" }, body);
  return c.json(result, result.shared ? 200 : 422);
});
app.post("/api/community/items/:id/update", async (c) => {
  const body = shareInputOf(await objectBody(c, EXPLORE_BODY.pack));
  // A person in the app is themselves in full: an admin's own session reaches the admin's override (community.ts ownedItem).
  const result = await updateShared(c.env, { userId: signedIn(c).id, via: "device", adminAccess: true }, c.req.param("id"), body);
  return c.json(result, result.updated ? 200 : 422);
});
app.post("/api/community/items/:id/withdraw", async (c) => c.json(await withdrawShared(c.env, { userId: signedIn(c).id, adminAccess: true }, c.req.param("id"))));
app.get("/api/community/mine", async (c) => c.json(await mine(c.env, signedIn(c).id), 200, NO_STORE));
app.get("/api/community/following/down", async (c) => c.json(await followingDown(c.env, signedIn(c).id), 200, NO_STORE));
// Reports (a copyright notice only from here: the person whose work it is makes it), and an owner's answer. A body
// that isn't an object counts as empty; fields that aren't text are left out (moderation.ts), so both answer 400.
app.post("/api/community/items/:id/report", async (c) => {
  const body = await objectBody(c, EXPLORE_BODY.report);
  return c.json(await reportItem(c.env, signedIn(c).id, c.req.param("id"), { reason: typeof body.reason === "string" ? body.reason : "", details: body.details, version: body.version, notice: body.notice }, { via: "app" }));
});
app.post("/api/community/items/:id/counter-notice", async (c) => {
  return c.json(await counterNotice(c.env, signedIn(c).id, c.req.param("id"), await objectBody(c, EXPLORE_BODY.report)));
});
app.get("/api/community/mine/cases", async (c) => c.json(await ownerCases(c.env, signedIn(c).id), 200, NO_STORE));

// --- Books in Explore (community-books.ts): browsing, a book's page and files, adding one to a reading library, likes, sharing, reports.
// The fixed paths come before /:id. docs/explore-books.md is the contract the app's screens are built on.
const bookQuery = (c: Context<AppContext>): BookQuery => ({
  language: c.req.query("lang") || undefined,
  layer: c.req.query("layer") || undefined,
  learning: c.req.query("learning") || undefined,
  level: c.req.query("level") || undefined,
  topic: c.req.query("topic") || undefined,
  q: c.req.query("q") || undefined,
  sort: c.req.query("sort") === "new" ? "new" : "popular",
  offset: Number(c.req.query("offset") ?? "0") || 0,
});
// A book shared from the app: the device sends the book and its layers as it holds them (each checked by book-format.js), and each other
// field is read only as the type it is.
const bookShareOf = (body: Record<string, unknown>) => ({
  book: body.book,
  layers: Array.isArray(body.layers) ? body.layers : undefined,
  dropLayers: Array.isArray(body.dropLayers) ? body.dropLayers.filter(isText) : undefined,
  title: textOrNone(body.title),
  about: textOrNone(body.about),
  note: textOrNone(body.note),
  level: isText(body.level) || body.level === null ? body.level : undefined,
  topics: Array.isArray(body.topics) ? body.topics.filter(isText) : undefined,
});
app.get("/api/community/books", async (c) => c.json(await listBooks(c.env, signedIn(c).id, bookQuery(c)), 200, NO_STORE));
app.get("/api/community/books/following", async (c) => c.json(await followedBooks(c.env, signedIn(c).id), 200, NO_STORE));
app.get("/api/community/books/mine", async (c) => c.json(await mineBooks(c.env, signedIn(c).id), 200, NO_STORE));
app.post("/api/community/books/share", async (c) => {
  const result = await shareBook(c.env, { userId: signedIn(c).id, via: "device" }, bookShareOf(await objectBody(c, BOOK_BODY)));
  return c.json(result, result.shared ? 200 : 422);
});
app.get("/api/community/books/:id", async (c) => {
  const found = await getBook(c.env, c.req.param("id"), signedIn(c).id);
  return found ? c.json(found, 200, NO_STORE) : c.json({ error: "There's no such book in Explore." }, 404);
});
// A version's files, as a device fetches them to add the book (read/shelf.js fetchOpenBook): only while it's live.
app.get("/api/community/books/:id/:version/:file", async (c) => {
  signedIn(c);
  return serveBookFile(c.env, c.req.raw, c.req.param("id"), c.req.param("version"), c.req.param("file"));
});
app.post("/api/community/books/:id/follow", async (c) => c.json(await followBook(c.env, signedIn(c).id, c.req.param("id"))));
app.delete("/api/community/books/:id/follow", async (c) => c.json(await unfollowBook(c.env, signedIn(c).id, c.req.param("id"))));
app.post("/api/community/books/:id/like", async (c) => c.json(await likeBook(c.env, signedIn(c).id, c.req.param("id"), true)));
app.delete("/api/community/books/:id/like", async (c) => c.json(await likeBook(c.env, signedIn(c).id, c.req.param("id"), false)));
app.post("/api/community/books/:id/update", async (c) => {
  // A person in the app is themselves in full: an admin's own session reaches the admin's override (community-books.ts ownedBook).
  const result = await updateSharedBook(c.env, { userId: signedIn(c).id, via: "device", adminAccess: true }, c.req.param("id"), bookShareOf(await objectBody(c, BOOK_BODY)));
  return c.json(result, result.updated ? 200 : 422);
});
app.post("/api/community/books/:id/withdraw", async (c) => c.json(await withdrawSharedBook(c.env, { userId: signedIn(c).id, adminAccess: true }, c.req.param("id"))));
// Reports on a book (a copyright notice only from here, as a pack's), and its owner's answer.
app.post("/api/community/books/:id/report", async (c) => {
  const body = await objectBody(c, EXPLORE_BODY.report);
  return c.json(await reportItem(c.env, signedIn(c).id, c.req.param("id"), { reason: typeof body.reason === "string" ? body.reason : "", details: body.details, version: body.version, notice: body.notice }, { via: "app", work: "book" }));
});
app.post("/api/community/books/:id/counter-notice", async (c) => c.json(await counterNotice(c.env, signedIn(c).id, c.req.param("id"), await objectBody(c, EXPLORE_BODY.report), "book")));

// --- REST API (personal access tokens): the same tools, for scripts and clients that don't speak MCP --------------

const rest = new Hono<AppContext & { Variables: { caller: CallerProps } }>();
rest.use("*", async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const owner = token ? await resolveToken(c.env, token) : null;
  if (!owner) return c.json({ error: "invalid_token" }, 401, { "WWW-Authenticate": 'Bearer realm="lexicommons"' });
  const { success } = await c.env.API_LIMITER.limit({ key: `api:${owner.userId}` });
  if (!success) return c.json({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  c.set("caller", { userId: owner.userId, name: owner.name, via: "pat", tokenName: owner.tokenName, tokenAdmin: owner.tokenAdmin });
  await next();
});
rest.get("/whoami", (c) => {
  const caller = c.get("caller");
  return c.json({ userId: caller.userId, name: caller.name, via: caller.via, app: `pat:${caller.tokenName}` });
});
rest.get("/notes", async (c) => c.json(await listNotes(c.env, c.get("caller").userId)));
rest.post("/notes", async (c) => {
  const body = await objectBody(c, BODY.note);
  const caller = c.get("caller");
  return c.json(await addNote(c.env, caller.userId, textOf(body.text), `rest:${caller.tokenName}`));
});
rest.get("/uploads", async (c) => c.json(await listUploads(c.env, c.get("caller").userId)));
rest.post("/uploads", async (c) => {
  const body = await objectBody(c, BODY.small);
  const caller = c.get("caller");
  return c.json(
    await requestUpload(c.env, caller.userId, { filename: textOf(body.filename), contentType: textOf(body.contentType) }, `rest:${caller.tokenName}`),
  );
});
// The look, for scripts: the same changes as MCP's update_look, list_themes, use_theme and create_theme, and an upload
// link for an image.
rest.get("/look", async (c) => {
  const record = await getLook(c.env, c.get("caller").userId);
  return c.json(record ? { rev: record.rev, look: record.look, changedBy: record.source, updatedAt: record.updatedAt, lastApplied: record.applied } : { rev: 0, look: null });
});
rest.get("/themes", async (c) => {
  const { libraryRev, themes } = await listThemes(c.env, c.get("caller").userId);
  return c.json({ libraryRev, themes: themes.filter((t) => !t.deletedAt) });
});
rest.post("/themes", async (c) => {
  const caller = c.get("caller");
  const body = await objectBody(c, BODY.small);
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return c.json(await createTheme(c.env, caller.userId, { name: textOf(body.name), from: text(body.from), base: text(body.base), use: typeof body.use === "boolean" ? body.use : undefined }, `rest:${caller.tokenName}`));
});
rest.post("/look/use", async (c) => {
  const caller = c.get("caller");
  const body = await objectBody(c, BODY.small);
  return c.json(await useTheme(c.env, caller.userId, textOf(body.theme), `rest:${caller.tokenName}`));
});
rest.patch("/look", async (c) => {
  const caller = c.get("caller");
  const { expectedRev, ...patch } = (await objectBody(c, BODY.look)) as LookPatch & { expectedRev?: unknown };
  return c.json(await changeLook(c.env, caller.userId, patch, `rest:${caller.tokenName}`, typeof expectedRev === "number" ? expectedRev : undefined));
});
rest.post("/look/images", async (c) => {
  const body = await objectBody(c, BODY.small);
  const caller = c.get("caller");
  const slot = textOf(body.slot);
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(slot)) return c.json({ error: "Name the slot: background, mark, or your own (lowercase, dashes)." }, 400);
  return c.json(
    await requestUpload(c.env, caller.userId, { filename: textOf(body.filename) || `${slot}.img`, contentType: textOf(body.contentType), purpose: `look:${slot}` }, `rest:${caller.tokenName}`),
  );
});
// The open library, for an admin's scripts (the books and packs command lines): the same calls as the library_* MCP
// tools (mcp-admin.ts), with a personal token made with admin access. Every call checks the role again.
const admin = new Hono<AppContext & { Variables: { caller: CallerProps } }>();
admin.use("*", async (c, next) => {
  await requireRole(c.env, c.get("caller"), "admin");
  await next();
});
const actorOf = (c: Context<AppContext & { Variables: { caller: CallerProps } }>) => ({ userId: c.get("caller").userId, via: `rest:${c.get("caller").tokenName}` });
const bodyOf = (c: Context) => objectBody(c, ADMIN_BODY);
const revOf = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? value : undefined);
admin.get("/library", async (c) => {
  // Finishes Explore's index of the library if a sync left it unfinished (at once when it's done).
  const state = await currentCatalogue(c.env);
  await syncLibraryIndex(c.env, state.catalogue, actorOf(c).via, state.rev);
  return c.json(catalogueView(state, c.req.query("full") === "1"));
});
// The site's switches (src/flags.ts), as the app's Admin page has them.
admin.get("/flags", async (c) => c.json({ flags: await listFlags(c.env, actorOf(c).userId) }));
admin.put("/flags/:name", async (c) => {
  const body = await bodyOf(c);
  if (!("value" in body)) return c.json({ error: "Send its value: true or false for a switch, one of its values for a choice." }, 400);
  return c.json({ flag: await setFlag(c.env, actorOf(c), c.req.param("name"), body.value, flagWhy(body.why)) });
});
admin.delete("/flags/:name", async (c) => c.json({ flag: await resetFlag(c.env, actorOf(c), c.req.param("name"), null) }));
admin.get("/library/history", async (c) => c.json(await libraryHistory(c.env, Number(c.req.query("limit") ?? "20") || 20)));
admin.post("/library/upload", async (c) => {
  const body = await bodyOf(c);
  const files = Array.isArray(body.files) ? (body.files as Record<string, unknown>[]) : null;
  const typed = files?.every((f) => f !== null && typeof f === "object" && isText(f.name) && isText(f.type) && typeof f.size === "number" && isText(f.sha256));
  if (!files || !typed) return c.json({ error: "Send { files: [{ name, type, size, sha256 }] }: name, type and sha256 as text, size a number." }, 400);
  return c.json(await stageFiles(c.env, actorOf(c).userId, files as unknown as StageRequest[], actorOf(c).via));
});
// Each field only as the type it is (library-admin.ts publishInputFrom; the library's checks take it from there).
const publishInputOf = publishInputFrom;
admin.post("/library/check", async (c) => c.json(await checkPublish(c.env, actorOf(c).userId, publishInputOf(await bodyOf(c)))));
admin.post("/library/publish", async (c) => {
  const body = await bodyOf(c);
  const result = await publish(c.env, actorOf(c), publishInputOf(body), revOf(body.expectedRev));
  return c.json(result, result.published ? 200 : 422);
});
admin.post("/library/unpublish", async (c) => {
  const body = await bodyOf(c);
  const target: UnpublishTarget | null =
    "audio" in body && typeof body.audio === "string" && typeof body.lang === "string"
      ? { audio: body.audio, lang: body.lang }
      : "pack" in body && typeof body.pack === "string" && typeof body.lang === "string"
        ? { pack: body.pack, lang: body.lang }
      : "list" in body && body.list === "frequency" && typeof body.lang === "string"
        ? { list: "frequency", lang: body.lang }
        : "book" in body && typeof body.book === "string"
          ? typeof body.layer === "string"
            ? { book: body.book, layer: body.layer }
            : { book: body.book }
          : null;
  if (!target) return c.json({ error: "Send { book } or { book, layer } or { list: \"frequency\", lang } or { pack, lang } or { audio, lang }." }, 400);
  return c.json(await unpublish(c.env, actorOf(c), target, revOf(body.expectedRev), textOrNone(body.note)));
});
admin.post("/library/restore", async (c) => {
  const body = await bodyOf(c);
  const rev = revOf(body.rev);
  if (!rev) return c.json({ error: "Send { rev }." }, 400);
  return c.json(await restore(c.env, actorOf(c), rev, revOf(body.expectedRev)));
});
admin.put("/library/shelf", async (c) => {
  const body = await bodyOf(c);
  return c.json(await setShelf(c.env, actorOf(c), body.sections, revOf(body.expectedRev)));
});
admin.get("/log", async (c) => c.json(await adminLog(c.env, { limit: Number(c.req.query("limit") ?? "50") || 50, action: c.req.query("action") || undefined })));
rest.route("/admin", admin);
// The monitoring agent's zero-token check: how much is waiting in the report queue (a moderator's or an admin's token
// with admin access). Its timer starts the agent only when this says something is.
rest.get("/mod/pending", async (c) => {
  await requireRole(c.env, c.get("caller"), (await rolesOf(c.env, c.get("caller").userId)).has("admin") ? "admin" : "moderator");
  await requireModerator(c.env, c.get("caller").userId);
  return c.json(await pending(c.env), 200, NO_STORE);
});
app.route("/api/v1", rest);

// --- Signed uploads ----------------------------------------------------------------------------------------------

app.put("/upload/:id", (c) => receiveUpload(c.req.raw, c.env, c.req.param("id"), new URL(c.req.url)));
// A file staged for the open library (library-admin.ts): its own signed links, checked against its declared hash.
app.put("/upload/stage/:id", (c) => receiveStaged(c.req.raw, c.env, c.req.param("id"), new URL(c.req.url)));

// --- OAuth consent ------------------------------------------------------------------------------------------------

app.get("/authorize", async (c) => {
  const url = new URL(c.req.url);
  const user = c.get("user");
  if (!user) return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, 303);
  try {
    const provider = c.env.OAUTH_PROVIDER;
    const authRequest = await provider.parseAuthRequest(c.req.raw);
    const consent = await provider.describeConsent(authRequest);
    const { handle, headers } = await provider.beginConsent(authRequest);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    return new Response(consentPage(user, consent, handle, await consentMark(handle, user.id), url.pathname + url.search), { headers });
  } catch (error) {
    return authorizeFailure(error);
  }
});

app.post("/authorize", async (c) => {
  const user = c.get("user");
  if (!user) return messagePage("Signed out", "Your session ended. Start connecting again from your app.", 401);
  const form = await c.req.parseBody();
  const handle = typeof form.handle === "string" ? form.handle : "";
  // The page was drawn for one account: approving or canceling it as another (signed out and in elsewhere since) does neither.
  if (typeof form.account !== "string" || form.account !== (await consentMark(handle, user.id))) {
    return messagePage("Signed in as someone else", `This page was opened for another account. You're signed in as ${user.name} now: start connecting again from your app.`, 409);
  }
  const provider = c.env.OAUTH_PROVIDER;
  try {
    if (form.decision !== "approve") {
      const denied = await provider.denyConsent(c.req.raw, handle);
      denied.headers.set("Location", denied.redirectTo);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    const approved = await provider.approveConsent(c.req.raw, handle);
    const consent = await provider.describeConsent(approved.request);
    const scope = approved.request.scope.length ? approved.request.scope : DEFAULT_SCOPES;
    const props: CallerProps & { clientName: string } = { userId: user.id, name: user.name, via: "oauth", clientName: consent.clientName };
    const { redirectTo } = await provider.completeAuthorization({
      request: approved.request,
      userId: user.id,
      metadata: { clientName: consent.clientName },
      scope,
      props,
    });
    approved.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    return authorizeFailure(error);
  }
});

function authorizeFailure(error: unknown): Response {
  if (error instanceof AuthorizationError) return messagePage("Can't connect this app", error.message);
  console.error(JSON.stringify({ authorize_error: String(error) }));
  return messagePage("Can't connect this app", "Something went wrong. Start connecting again from your app.", 500);
}

// --- The open library: shared books and weaves (src/books.ts) ------------------------------------------------------

app.get("/library/*", (c) => serveLibrary(c.req.raw, c.env, c.req.path));

// --- The static PWA and cover page --------------------------------------------------------------------------------

// The pricing page exists only where the plan is offered: a copy, or the site before the plan is switched on, has no such page,
// under any name the static files might answer to it by (/pricing, /pricing/, /pricing.html, in any case, slashes doubled).
const PRICING_NAMES = /^\/+pricing(\.html|\/+(index\.html)?)?$/i; // gate.ts PRICING_PAGE's names

// The public pages say only what this site offers. A part marked data-plan (the paid plan: offered.ts planShown) or data-own-key (a key of
// your own for the in-app AI: OWN_KEY_ENABLED) is taken out as the page is served where that's off, and one marked data-no-plan or
// data-no-own-key where it's on. So switching either on is its var alone: the pages follow. They're served whole each time (no validator),
// so a browser never keeps the pages of the site before a switch.
const PUBLIC_PAGE_NAMES = /^\/+(index\.html)?$|^\/+(privacy|terms)(\.html|\/+(index\.html)?)?$/i;
const OFFERS = (env: Env) => ({ plan: planShown(env), "own-key": features(env).ownKey });
function offeredOnly(env: Env, page: Response): Response {
  const offers = OFFERS(env);
  const gone = Object.entries(offers).map(([name, on]) => (on ? `[data-no-${name}]` : `[data-${name}]`));
  const headers = new Headers(page.headers);
  for (const name of ["ETag", "Last-Modified", "Content-Length"]) headers.delete(name);
  headers.set("Cache-Control", "no-cache");
  const whole = new Response(page.body, { status: page.status, statusText: page.statusText, headers });
  return new HTMLRewriter().on(gone.join(", "), { element: (part) => void part.remove() }).transform(whole);
}

/**
 * Nothing at this address. A browser asking for a page (Accept names text/html, GET or HEAD) gets the not-found page (pages.ts), so a typo or a
 * shortened link on launch day says so in the site's own words and leads on; the API answers in JSON, and a file a page asks for (a script, a
 * picture) gets the bare 404 it always did. Only ever reached past the site gate (index.ts, gate.ts), so a gated site shows nothing of which
 * addresses exist.
 */
function notFound(c: Context<AppContext>, bare?: Response): Response {
  const headers = { "Cache-Control": "no-store" };
  if (c.req.path.startsWith("/api/")) return c.json({ error: "There's nothing at this address." }, 404, headers);
  const page = (c.req.method === "GET" || c.req.method === "HEAD") && (c.req.header("Accept") ?? "").includes("text/html");
  if (page) return c.html(notFoundPage(), 404, headers);
  return bare ? new Response(bare.body, bare) : c.text("Not found", 404, headers);
}

app.all("*", async (c) => {
  if (PRICING_NAMES.test(c.req.path) && !planShown(c.env)) return notFound(c);
  if (PUBLIC_PAGE_NAMES.test(c.req.path) && (c.req.method === "GET" || c.req.method === "HEAD")) {
    // Asked for whole (no If-None-Match): a 304 would keep the browser's copy, made before a switch changed what the page says.
    const ask = new Request(c.req.raw);
    for (const name of ["If-None-Match", "If-Modified-Since"]) ask.headers.delete(name);
    const asset = await c.env.ASSETS.fetch(ask);
    if (asset.status === 200 && (asset.headers.get("Content-Type") ?? "").startsWith("text/html")) return offeredOnly(c.env, asset);
    return new Response(asset.body, asset);
  }
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (asset.status === 404) return notFound(c, asset);
  // A fresh Response, so the middleware above can add security headers (asset responses can be immutable).
  return new Response(asset.body, asset);
});
