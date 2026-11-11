// The site gate: one shared password in front of everything a browser can see, while the site is being built.
// Modeled on NeedWright's preview gate (workers/app.ts): the cookie is signed with the session secret AND the
// current password, so changing GATE_PASSWORD signs everyone out. Token-authed machine paths bypass it; they carry
// their own credentials and must stay reachable for Claude, ChatGPT and Codex.

import { planOffered } from "./billing";
import type { Env } from "./env";
import { gatePage } from "./pages";
import { cookieHeader, hmacHex, readCookie, readTextLimited, safeNextPath, secretsEqual } from "./util";

export const GATE_PATH = "/_gate";
const GATE_COOKIE = "lc_gate";
const GATE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const GATE_BODY_MAX_BYTES = 4096;

// The OAuth provider answers /token, /register and /.well-known/* before this handler ever runs, and /mcp with a
// valid token too. They're listed anyway so the gate never shadows them (an unauthenticated /mcp must get its 401
// discovery challenge, not a gate page).
// The rest are public files with nothing private in them, which the gate page itself needs to look right: its
// stylesheet, the fonts it uses, the icons.
const BYPASS_PREFIXES = ["/mcp", "/.well-known/", "/token", "/register", "/api/v1/", "/upload/", "/icons/", "/fonts/"];
// /api/billing/stripe: Stripe's webhook, which carries its own signature (src/billing.ts signedByStripe) and is refused without it.
const BYPASS_EXACT = new Set(["/manifest.webmanifest", "/sw.js", "/favicon.ico", "/robots.txt", "/css/app.css", "/api/billing/stripe"]);

function bypassesGate(pathname: string): boolean {
  return BYPASS_EXACT.has(pathname) || BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// The site's public pages, and the one file they load that the list above doesn't cover: the three, and the pricing page only
// where the plan is offered (anywhere else it doesn't exist: app.ts answers it 404). GATE_PUBLIC_PAGES opens exactly these while
// the gate is still on, for someone who has to read them before launch (a sign-in provider's or Stripe's reviewers). They stay
// out of search until the gate itself comes off, and nothing they link to opens with them.
const PUBLIC_PAGES = new Set(["/", "/privacy", "/terms"]);
export const PRICING_PAGE = "/pricing";
const PUBLIC_PAGES_STYLESHEET = "/css/site.css";

/** Whether a path is one of the public pages on this site: the three, and /pricing where the plan is offered. */
function publicPage(env: Env, pathname: string): boolean {
  return PUBLIC_PAGES.has(pathname) || (pathname === PRICING_PAGE && planOffered(env));
}

function publicPageOpen(request: Request, env: Env, pathname: string): boolean {
  if (env.GATE_PUBLIC_PAGES !== "true") return false;
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return publicPage(env, pathname) || pathname === PUBLIC_PAGES_STYLESHEET;
}

/** Whether a page may be indexed: only the public pages, and only once the gate is off. */
export function indexable(env: Env, pathname: string): boolean {
  return env.GATE_ENABLED !== "true" && publicPage(env, pathname);
}

// What crawlers are asked to leave alone once the site is public. A list of what's private rather than a list of what's open:
// a link-card fetcher's parser may know only Disallow, and it has to reach the home page and the card. (Nothing here is access
// control: every one of these checks who's asking. It keeps crawlers off them, and off the bill.)
const NOT_FOR_CRAWLERS = ["/_gate", "/api/", "/app/", "/audio/", "/authorize", "/design", "/flags/", "/js/", "/library/", "/login", "/logout", "/mcp", "/models/", "/register", "/token", "/upload/", "/vendor/"];

export function robotsTxt(env: Env): string {
  if (env.GATE_ENABLED === "true") return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\n${NOT_FOR_CRAWLERS.map((path) => `Disallow: ${path}`).join("\n")}\n`;
}

function signingKey(env: Env): string {
  return `${env.GATE_SESSION_SECRET}\u0000${env.GATE_PASSWORD}`;
}

async function createGateToken(env: Env): Promise<string> {
  const expiresAt = Date.now() + GATE_MAX_AGE_SECONDS * 1000;
  return `v1.${expiresAt}.${await hmacHex(signingKey(env), `gate.${expiresAt}`)}`;
}

async function isValidGateToken(env: Env, token: string | null): Promise<boolean> {
  if (!token) return false;
  const [version, expires, signature] = token.split(".");
  if (version !== "v1" || !expires || !signature) return false;
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  return secretsEqual(signature, await hmacHex(signingKey(env), `gate.${expiresAt}`));
}

function gateResponse(next: string, error?: string, status = 200, extra?: Record<string, string>): Response {
  return new Response(gatePage(next, error), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      ...extra,
    },
  });
}

/** Returns a response when the gate handles the request, or null to let it through. */
export async function handleGate(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (env.GATE_ENABLED !== "true") return null;
  if (bypassesGate(url.pathname) || publicPageOpen(request, env, url.pathname)) return null;
  if (!env.GATE_PASSWORD || !env.GATE_SESSION_SECRET) {
    return new Response("The site gate is not configured.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  if (url.pathname === GATE_PATH && request.method === "GET") {
    return gateResponse(safeNextPath(url.searchParams.get("next"), "/"));
  }

  if (url.pathname === GATE_PATH && request.method === "POST") {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.GATE_LIMITER.limit({ key: `gate:${ip}` });
    if (!success) {
      return gateResponse("/", "Too many attempts. Wait a minute and try again.", 429, { "Retry-After": "60" });
    }
    const body = await readTextLimited(request, GATE_BODY_MAX_BYTES);
    const form = new URLSearchParams(body ?? "");
    const next = safeNextPath(form.get("next"), "/");
    const password = form.get("password") ?? "";
    if (!(await secretsEqual(password, env.GATE_PASSWORD))) {
      return gateResponse(next, "That's not the password.", 401);
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: next,
        "Set-Cookie": cookieHeader(GATE_COOKIE, await createGateToken(env), GATE_MAX_AGE_SECONDS),
        "Cache-Control": "no-store",
      },
    });
  }

  if (await isValidGateToken(env, readCookie(request, GATE_COOKIE))) return null;

  if (request.method === "GET" || request.method === "HEAD") {
    const next = encodeURIComponent(url.pathname + url.search);
    return new Response(null, { status: 303, headers: { Location: `${GATE_PATH}?next=${next}`, "Cache-Control": "no-store" } });
  }
  return new Response(JSON.stringify({ error: "site_locked" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
