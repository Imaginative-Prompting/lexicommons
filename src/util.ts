const encoder = new TextEncoder();

export function bytesToBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A random identifier with no ':' (OAuth user IDs must not contain one). */
export function randomId(byteLength = 16): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const input = typeof data === "string" ? encoder.encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings without leaking where they differ (both are hashed first, so length leaks nothing either). */
export async function secretsEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

export function cookieHeader(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearCookieHeader(name: string): string {
  return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** A site served at http://localhost or http://127.0.0.1 (a copy's PUBLIC_ORIGIN, npm run local; the live config's is https://lexicommons.com). */
const LOCAL_HTTP_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Whether a response's cookies go without Secure: only on a local copy (its own origin plain http on localhost or 127.0.0.1), for a request
 * that came to it over plain http at one of those names. Safari and every WebKit browser drop a Secure cookie that http://localhost sets,
 * though the page is a secure context, so a copy's passkey sign-up never got its challenge back ("That sign-up expired", 7 Nov 2026, an iPhone
 * Simulator's Safari). Every other site, the live one first, keeps Secure on every cookie (scripts/test-local-cookies.mjs).
 */
export function localHttpCookies(publicOrigin: string | undefined, requestUrl: string): boolean {
  if (!LOCAL_HTTP_ORIGIN.test(publicOrigin ?? "")) return false;
  const url = new URL(requestUrl);
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

// The OAuth library's cookies are __Host- ones (workers-oauth-provider binds a consent to the browser with one, and takes no other prefix). A
// browser keeps a __Host- cookie only while it's Secure, so on a local copy, where Secure comes off for Safari, Chrome dropped it and connecting
// an AI to the copy always failed ("This authorization was not started in this browser", 8 Nov 2026). There each goes out under
// LOCAL_HOST_PREFIX instead (withLocalCookies) and comes back in under its own name (localCookieRequest).
const HOST_PREFIX = "__Host-";
export const LOCAL_HOST_PREFIX = "lc-host-";

/**
 * Every cookie is made Secure (cookieHeader, clearCookieHeader); on a local copy over plain http (localHttpCookies) the Worker's answer has
 * Secure taken off each Set-Cookie, and a __Host- cookie renamed to LOCAL_HOST_PREFIX (a browser drops a __Host- cookie that isn't Secure);
 * nothing else changed. Any other answer is handed back as it is, the same object.
 */
export function withLocalCookies(response: Response, publicOrigin: string | undefined, requestUrl: string): Response {
  if (response.status === 101 || !localHttpCookies(publicOrigin, requestUrl)) return response;
  const cookies = response.headers.getSetCookie();
  if (!cookies.length) return response;
  const headers = new Headers(response.headers);
  headers.delete("Set-Cookie");
  for (const cookie of cookies) {
    const plain = cookie.split(";").filter((part, i) => i === 0 || part.trim().toLowerCase() !== "secure").join(";");
    headers.append("Set-Cookie", plain.startsWith(HOST_PREFIX) ? LOCAL_HOST_PREFIX + plain.slice(HOST_PREFIX.length) : plain);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * The request as the Worker reads it: on a local copy over plain http, each cookie withLocalCookies renamed comes in under its own __Host-
 * name again, so the OAuth library finds it; nothing else changed. Any other request is handed back as it is, the same object.
 */
export function localCookieRequest(request: Request, publicOrigin: string | undefined): Request {
  if (!localHttpCookies(publicOrigin, request.url)) return request;
  const cookie = request.headers.get("Cookie");
  if (!cookie?.includes(LOCAL_HOST_PREFIX)) return request;
  const named = cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith(LOCAL_HOST_PREFIX) ? HOST_PREFIX + part.slice(LOCAL_HOST_PREFIX.length) : part))
    .join("; ");
  const headers = new Headers(request.headers);
  headers.set("Cookie", named);
  return new Request(request, { headers });
}

/**
 * Which account a consent page was drawn for, as its form carries it: approving checks it against the account signed in now, so a page
 * opened as one account and approved after switching to another grants neither (6 Nov 2026, the Codex review's C3: the library binds the
 * page's handle to the browser, not to the account). A hash, so the form holds no account id.
 */
export const consentMark = (handle: string, userId: string) => sha256Hex(`lexicommons consent\n${handle}\n${userId}`);

/**
 * Whether a browser says this request came from another site (app.ts refuses a cookie session's change then): an Origin that isn't
 * this one (the string "null" included), or Fetch Metadata's Sec-Fetch-Site saying same-site or cross-site. Neither header: not a
 * browser's request, so no one else's cookies.
 */
export function crossSite(request: Request, publicOrigin: string): boolean {
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== publicOrigin) return true;
  const site = request.headers.get("Sec-Fetch-Site");
  return site !== null && site !== "same-origin" && site !== "none";
}

/**
 * Only a path on this site survives; anything else falls back to the given default. A browser reads a Location the way the URL
 * standard parses it: tabs and newlines dropped, a backslash taken for a slash. So "/\t/evil.example" is "//evil.example", another
 * site (6 Nov 2026, the Codex review). The value is parsed that way here against a placeholder origin, and kept only if it stays on
 * it, with no control character at all; what's returned is the parsed path, so the browser can't read it any other way.
 */
const NEXT_BASE = "https://next.invalid";
export function safeNextPath(value: string | null, fallback = "/app/"): string {
  if (!value || value.length > 2048 || !value.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, NEXT_BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== NEXT_BASE) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Reads a request body, at most maxBytes of it: null as soon as more arrive (it stops reading there), so a body sent
 * without a Content-Length (chunked) can't make the Worker buffer more than the limit.
 */
export async function readBytesLimited(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get("Content-Length") ?? "0") > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

/** Reads a request body as text, refusing anything over the limit before buffering it all. */
export async function readTextLimited(request: Request, maxBytes: number): Promise<string | null> {
  const bytes = await readBytesLimited(request, maxBytes);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

export const nowMs = () => Date.now();

/**
 * Local checks only: the stand-in providers' origin (scripts/auth-standin.mjs for sign-in, onedrive-check's Microsoft for OneDrive's
 * tokens). Honored only when this server and the stand-in are both on localhost, so no setting can point a deployed site, or send its
 * secrets, anywhere else.
 */
export function standin(env: { AUTH_STANDIN?: string; PUBLIC_ORIGIN: string }): string | null {
  const local = /^http:\/\/localhost:\d+$/;
  return env.AUTH_STANDIN && local.test(env.AUTH_STANDIN) && local.test(env.PUBLIC_ORIGIN) ? env.AUTH_STANDIN : null;
}

// What a browser shows inline without anything in it running: audio and raster images. Anything else someone uploaded
// or made (an SVG, text, a book, an EPUB) is a download when it's opened directly.
const INLINE_TYPES = /^(?:audio\/[a-z0-9.+-]+|image\/(?:png|jpeg|webp|gif|avif))$/;
/** The CSP for a stored file: nothing in it may run or load anything, even opened directly as a page. */
export const FILE_CSP = "default-src 'none'; sandbox";
/** Headers for serving a stored file someone uploaded or made, so it can never run as a page on this site. */
export function fileSafetyHeaders(contentType: string): Record<string, string> {
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  return { "Content-Security-Policy": FILE_CSP, "X-Content-Type-Options": "nosniff", ...(INLINE_TYPES.test(type) ? {} : { "Content-Disposition": "attachment" }) };
}
