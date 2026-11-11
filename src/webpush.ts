// Web Push from the Worker, with nothing but Web Crypto: a message encrypted for one subscription (RFC 8291,
// aes128gcm), signed for the push service (VAPID, RFC 8292), and sent (RFC 8030) with its TTL, Urgency and Topic.
// The common `web-push` package needs Node's crypto and https modules; these are the hundred-odd lines it does.
// scripts/test-webpush.mjs holds the encryption to RFC 8291's own worked example, byte for byte, and checks the VAPID
// signature with the public key.
//
// The payload is Declarative Web Push's JSON (WebKit, iOS 18.4 and later: shown by the browser even when the service
// worker can't run), which older browsers hand to sw.js's push handler. Apple's push service also takes Topic, so a
// newer reminder replaces one still waiting (iPhone ignores a notification's tag).

const encoder = new TextEncoder();

export const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const fromB64url = (text: string) => {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
// HKDF with one block of output (all RFC 8291 needs): extract, then expand to `length` bytes.
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

export type Subscription = { endpoint: string; p256dh: string; auth: string };
/** For tests only: the server's key pair and the salt, which are otherwise made fresh for every message. */
export type Fixed = { asPrivate: JsonWebKey; asPublic: Uint8Array; salt: Uint8Array };

/** RFC 8291: the body to send to one subscription, encrypted for it (one record, padding delimiter 0x02). */
export async function encrypt(sub: Pick<Subscription, "p256dh" | "auth">, plaintext: Uint8Array, fixed?: Fixed) {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error("not a push subscription's keys");
  let asPrivate: CryptoKey;
  let asPublic: Uint8Array;
  if (fixed) {
    asPrivate = await crypto.subtle.importKey("jwk", fixed.asPrivate, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    asPublic = fixed.asPublic;
  } else {
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  }
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // workers-types names the field $public; the runtime (and Web Crypto) reads public.
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, asPrivate, 256));
  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const recordSize = 4096;
  const header = concat(salt, new Uint8Array([(recordSize >>> 24) & 255, (recordSize >>> 16) & 255, (recordSize >>> 8) & 255, recordSize & 255, asPublic.length]), asPublic);
  return concat(header, sealed);
}

/** RFC 8292: the Authorization header for an endpoint, signed with the server's VAPID key (a P-256 private JWK). */
export async function vapidHeader(endpoint: string, vapid: { privateJwk: JsonWebKey; publicKey: string; subject: string }, now = Date.now()) {
  const audience = new URL(endpoint).origin;
  const head = b64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  // Apple refuses an expiry more than a day ahead; 12 hours, as web-push does.
  const claims = b64url(encoder.encode(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })));
  const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64url(signature)}, k=${vapid.publicKey}`;
}

/**
 * A notification as Declarative Web Push's JSON: { web_push: 8030, notification: { title, body, navigate, app_badge?,
 * lang, dir } }. sw.js reads the same JSON where the browser leaves it to the service worker.
 */
export function payload({ title, body, url, badge }: { title: string; body: string; url: string; badge?: number }) {
  const notification: Record<string, unknown> = { title, body, navigate: url, lang: "en", dir: "ltr" };
  if (Number.isInteger(badge) && (badge as number) >= 0) notification.app_badge = badge;
  return JSON.stringify({ web_push: 8030, notification });
}

export type Sent = { ok: boolean; status: number; gone: boolean };

/**
 * Sends one message: encrypted, signed, with its TTL (seconds the push service may hold it while the device is away),
 * Urgency and Topic (a newer message with the same topic replaces one not yet delivered). gone: the subscription has
 * ended (404 or 410: Apple says 410 when the device's token expired), so its row should go.
 */
export async function send(sub: Subscription, message: string, vapid: { privateJwk: JsonWebKey; publicKey: string; subject: string }, { ttl = 3 * 3600, urgency = "normal", topic }: { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string } = {}, fetcher: typeof fetch = fetch): Promise<Sent> {
  const body = await encrypt(sub, encoder.encode(message));
  const headers: Record<string, string> = {
    Authorization: await vapidHeader(sub.endpoint, vapid),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(ttl),
    Urgency: urgency,
  };
  if (topic) headers.Topic = topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const res = await fetcher(sub.endpoint, { method: "POST", headers, body });
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
}

/** Where a subscription may send: only the browsers' own push services, over https (an endpoint is untrusted input). */
export function allowedEndpoint(endpoint: unknown) {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname;
  return (
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".notify.windows.com") ||
    host === "web.push.apple.com"
  );
}
