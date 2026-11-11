// Lexicommons Worker entry. workers-oauth-provider answers the OAuth protocol endpoints (/token, /register,
// /.well-known/*) and validates every /mcp call before it reaches the MCP server; everything else goes to the app.

import { indexMissing } from "./find";
import { syncLibraryIndex } from "./community";
import { currentCatalogue } from "./library-admin";
import { getOAuthApi, OAuthProvider, type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
import { app } from "./app";
import { MCP_RESOURCE, type CallerProps, type Env } from "./env";
import { resolveToken } from "./library";
import { mcpApiHandler } from "./mcp";
import { tokenEndpoint } from "./refresh-once";
import { sweepRevoked, tokenAnswerGuard } from "./revoked";
import { runAdminAlerts } from "./admin-alerts";
import { localCookieRequest, readBytesLimited, withLocalCookies } from "./util";
import { recordServerError, sweepErrors } from "./errors";
import { sweepBugReports } from "./bug-reports";
import { sweepExpiredStaged } from "./library-admin";
import { runReminders } from "./reminders";
import { withFlags, withPreviews } from "./flags";

// Practice with your AI: the account's practice room (a Durable Object).
export { PracticeRoom } from "./practice";

// One provider per origin: lexicommons.com in production, where the resource is MCP_RESOURCE exactly; a local server
// (wrangler dev, PUBLIC_ORIGIN=http://localhost:<port>) gets its own, so local checks can call its /mcp.
const providers = new Map<string, { provider: OAuthProvider<Env>; options: OAuthProviderOptions<Env> }>();
function providerFor(env: Env) {
  const resource = env.PUBLIC_ORIGIN === "https://lexicommons.com" ? MCP_RESOURCE : `${env.PUBLIC_ORIGIN}/mcp`;
  let entry = providers.get(resource);
  if (!entry) {
    const options = providerOptions(resource);
    entry = { provider: new OAuthProvider<Env>(options), options };
    providers.set(resource, entry);
  }
  return entry;
}

const providerOptions = (resource: string): OAuthProviderOptions<Env> => ({
  apiRoute: "/mcp",
  apiHandler: mcpApiHandler,
  defaultHandler: { fetch: (request, env, ctx) => app.fetch(request, env as Env, ctx) },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  // DCR stays on beside CIMD: Claude and ChatGPT prefer CIMD, but OpenCode and older clients register.
  clientRegistrationEndpoint: "/register",
  clientIdMetadataDocumentEnabled: true,
  accessTokenTTL: 60 * 60,
  // Sign in once: a grant lasts 90 days, and every refresh moves that forward, so only an idle grant expires.
  refreshTokenTTL: 60 * 60 * 24 * 90,
  refreshTokenIdleTTL: 60 * 60 * 24 * 90,
  scopesSupported: ["learn:read", "learn:write"],
  requiredScopes: ["learn:read", "learn:write"],
  resourceMetadata: {
    resource,
    resource_name: "Lexicommons",
    bearer_methods_supported: ["header"],
  },
  // Personal access tokens (lct_…) work at /mcp too, for clients without OAuth.
  resolveExternalToken: async ({ token, env }) => {
    const owner = await resolveToken(env, token);
    if (!owner) return null;
    const props: CallerProps = { userId: owner.userId, name: owner.name, via: "pat", tokenName: owner.tokenName, tokenAdmin: owner.tokenAdmin };
    return { props, audience: resource };
  },
  onError: ({ code, status, internal }) => {
    console.warn(JSON.stringify({ oauth_error: code, status, internal }));
  },
});

/** The most an app's registration may be: a real client's is well under 2 KB. */
const REGISTER_BODY = 16 * 1024;

const OAUTH_PATHS = new Set(["/token", "/register", "/authorize", "/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource/mcp"]);

export default {
  // Reminders (src/reminders.ts): every 15 minutes, the accounts whose next look has come.
  async scheduled(_controller: ScheduledController, deployEnv: Env, _ctx: ExecutionContext) {
    // The cron runs on the switches as an admin set them (src/flags.ts), as every request does.
    const env = await withFlags(deployEnv);
    // Each job's failure goes to the Worker's log and to the error reports (src/errors.ts), by the job's name.
    const failed = (job: string, logKey: string) => (e: unknown) => {
      console.warn(JSON.stringify({ [logKey]: String((e as Error)?.message ?? e) }));
      return recordServerError(env, "cron", e, `cron ${job}`);
    };
    // Every job is awaited before the handler returns, so each has the cron's own time (15 minutes) and not the 30 s a waitUntil
    // gets after its handler has returned: the reminders' run can take minutes on a big evening (src/reminders.ts RUN).
    const jobs: Promise<unknown>[] = [];
    const keep = (job: Promise<unknown>) => void jobs.push(job);
    keep(runReminders(env, Date.now()).then((r) => console.log(JSON.stringify({ reminders: r })), failed("reminders", "reminders_error")));
    // Explore's index of the library's packs (community.ts syncLibraryIndex): a sync left unfinished, or rows written an older way, brought
    // up to date (nothing to do is one write that changes nothing).
    keep(currentCatalogue(env).then((state) => syncLibraryIndex(env, state.catalogue, "cron", state.rev)).catch(failed("library-index", "library_index_error")));
    // The index for finding a pack from what you typed (src/find.ts): what's been published since the last pass.
    keep(indexMissing(env, { limit: 6 }).catch(failed("find-index", "find_index_error")));
    // What reaches an admin about moderation and errors (src/admin-alerts.ts).
    keep(
      runAdminAlerts(env, Date.now()).then((r) => {
        if (r.due) console.log(JSON.stringify({ admin_alerts: r }));
      }, failed("admin-alerts", "admin_alerts_error")),
    );
    // Error reports past their time (src/errors.ts).
    keep(sweepErrors(env, Date.now()).catch(failed("error-sweep", "error_sweep_error")));
    // Bug reports past their 90 days, and their screenshots (src/bug-reports.ts).
    keep(sweepBugReports(env, Date.now()).catch(failed("bug-sweep", "bug_sweep_error")));
    // Staged files past their day, every account's (src/library-admin.ts).
    keep(sweepExpiredStaged(env, Date.now()).catch(failed("staged-sweep", "staged_sweep_error")));
    // Revoked connections' markers past the refresh tokens' lifetime (src/revoked.ts).
    keep(sweepRevoked(env, Date.now()).catch(failed("revoked-sweep", "revoked_sweep_error")));
    await Promise.allSettled(jobs);
  },
  async fetch(request: Request, deployEnv: Env, ctx: ExecutionContext): Promise<Response> {
    // A local copy's cookies over plain http, for Safari (util.ts withLocalCookies), its renamed __Host- ones read under their own names
    // (localCookieRequest); every other site's are as cookieHeader makes them.
    return withLocalCookies(await serve(localCookieRequest(request, deployEnv.PUBLIC_ORIGIN), deployEnv, ctx), deployEnv.PUBLIC_ORIGIN, request.url);
  },
} satisfies ExportedHandler<Env>;

/** Every request the Worker answers (its fetch hands the answer through withLocalCookies). */
async function serve(request: Request, deployEnv: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  // Every request runs on the switches as the director set them (src/flags.ts): wrangler.jsonc's values, with a stored one laid over it,
  // read from D1 at most every few seconds. Then an admin's previews on their own device, for that admin's request alone.
  const env = await withPreviews(await withFlags(deployEnv), request);
  // One origin for everything: .app and www only ever redirect (passkeys, cookies and the MCP URL live on lexicommons.com).
  if (url.hostname === "lexicommons.app" || url.hostname === "www.lexicommons.app" || url.hostname === "www.lexicommons.com") {
    return Response.redirect(`https://lexicommons.com${url.pathname}${url.search}`, 301);
  }
  const { provider, options } = providerFor(env);
  // Registering an app (dynamic client registration, open to anyone by design) runs before the gate and the app's limiters, so it
  // has its own: a few a minute per connection (AUTH_LIMITER, as signing in), and the metadata at most REGISTER_BODY bytes, so no one
  // can fill OAUTH_KV with clients (6 Nov 2026, the Codex review S9). What's let through goes on to the provider byte for byte.
  if (url.pathname === "/register" && request.method === "POST") {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (!(await env.AUTH_LIMITER.limit({ key: `register:${ip}` })).success) {
      return Response.json({ error: "slow_down", error_description: "Too many apps registered from here. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
    }
    const body = await readBytesLimited(request, REGISTER_BODY);
    if (body === null) return Response.json({ error: "invalid_client_metadata", error_description: `An app's registration is at most ${REGISTER_BODY / 1024} KB.` }, { status: 400, headers: { "Cache-Control": "no-store" } });
    request = new Request(request, { body });
  }
  try {
    // A refresh token used twice gets one answer, so sessions sharing it never split it (src/refresh-once.ts).
    // And a connection its person revoked is never handed tokens again, even by a refresh that was under way (src/revoked.ts).
    if (url.pathname === "/token" && request.method === "POST") {
      const api = getOAuthApi(options, env);
      const answer = await tokenEndpoint(request, env, ctx, {
        fetch: (forward) => provider.fetch(forward, env, ctx),
        lookupClient: (clientId) => api.lookupClient(clientId),
      });
      return await tokenAnswerGuard(env, api, request, answer);
    }
    return await provider.fetch(request, env, ctx);
  } catch (error) {
    // What app.onError never sees (the OAuth provider's own endpoints, /mcp's transport): counted, then thrown on as before. The
    // place is the endpoint's name for the OAuth ones, never the path a request asked for.
    const place = OAUTH_PATHS.has(url.pathname) ? `${request.method} ${url.pathname}` : url.pathname.startsWith("/mcp") ? `${request.method} /mcp` : `${request.method} other`;
    ctx.waitUntil(recordServerError(env, "server", error, place));
    throw error;
  }
}
