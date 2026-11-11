// Web Push from the Worker (src/webpush.ts), case by case: the encryption held to RFC 8291's own worked example (its
// Appendix A inputs give its Section 5 message, byte for byte), a message our device could open (decrypted here with
// the subscription's private key), the VAPID header (RFC 8292: its claims, and its signature checked with the public
// key), what a send carries (TTL, Urgency, Topic, the encoding) and what an ended subscription answers, Declarative Web
// Push's JSON, and which endpoints a subscription may name. In Node: `node scripts/test-webpush.mjs` (exit 0 = pass).

import "./fixtures/worker-env.mjs";

const { allowedEndpoint, b64url, encrypt, fromB64url, payload, send, vapidHeader } = await import("../src/webpush.ts");

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const eq = (actual, expected, what = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? `${what}: ` : ""}${a} ≠ ${e}`);
};
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
const join = (s) => s.replace(/\s+/g, "");

// RFC 8291, Appendix A (and Section 5's result).
const RFC = {
  plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPublic: join("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"),
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: join("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  header: join("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8"),
  ciphertext: join("8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ"),
};
const jwkOf = (privateB64, publicB64) => {
  const pub = fromB64url(publicB64);
  return { kty: "EC", crv: "P-256", d: privateB64, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), ext: true };
};

await test("RFC 8291's worked example: the same header and ciphertext, byte for byte", async () => {
  const body = await encrypt({ p256dh: RFC.uaPublic, auth: RFC.auth }, fromB64url(RFC.plaintext), {
    asPrivate: jwkOf(RFC.asPrivate, RFC.asPublic),
    asPublic: fromB64url(RFC.asPublic),
    salt: fromB64url(RFC.salt),
  });
  eq(b64url(body.slice(0, 86)), RFC.header, "header");
  eq(b64url(body.slice(86)), RFC.ciphertext, "ciphertext");
});

// The device's side of RFC 8291, here only to open what we send: from the header, the shared secret and the auth.
async function open(body, uaPrivateJwk, uaPublic, auth) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);
  const priv = await crypto.subtle.importKey("jwk", uaPrivateJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const pub = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256));
  const hmac = async (key, data) => new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), data));
  const cat = (...p) => Uint8Array.from(p.flatMap((x) => [...x]));
  const te = new TextEncoder();
  const hkdf = async (s, ikm, info, n) => (await hmac(await hmac(s, ikm), cat(info, [1]))).slice(0, n);
  const ikm = await hkdf(auth, ecdh, cat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), sealed));
  ok(plain.at(-1) === 2, "the padding delimiter");
  return new TextDecoder().decode(plain.slice(0, -1));
}

await test("a message with a fresh key and salt each time: the device opens it, and two sends never look alike", async () => {
  const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const sub = { p256dh: b64url(uaPublic), auth: b64url(auth) };
  const message = payload({ title: "Ready when you are", body: "12 words to review, about 4 minutes.", url: "/app/#study/session/quick?from=push" });
  const a = await encrypt(sub, new TextEncoder().encode(message));
  const b = await encrypt(sub, new TextEncoder().encode(message));
  ok(b64url(a) !== b64url(b), "two sends alike");
  eq(await open(a, await crypto.subtle.exportKey("jwk", ua.privateKey), uaPublic, auth), message, "opened");
  let threw = false;
  try {
    await encrypt({ p256dh: b64url(uaPublic.slice(1)), auth: sub.auth }, new Uint8Array([1]));
  } catch {
    threw = true;
  }
  ok(threw, "keys that aren't a subscription's");
});

await test("Declarative Web Push's JSON: web_push 8030, a title, a body, where it opens, and a badge only when given", () => {
  eq(JSON.parse(payload({ title: "T", body: "B", url: "/app/#today" })), { web_push: 8030, notification: { title: "T", body: "B", navigate: "/app/#today", lang: "en", dir: "ltr" } });
  eq(JSON.parse(payload({ title: "T", body: "B", url: "/app/#today", badge: 1 })).notification.app_badge, 1);
});

const vapidKeys = async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { pair, privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey), publicKey: b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))), subject: "https://lexicommons.com" };
};

await test("VAPID (RFC 8292): the push service's origin as audience, an expiry under a day, our subject, and a signature our public key checks", async () => {
  const v = await vapidKeys();
  const now = Date.UTC(2026, 10, 2, 12);
  const header = await vapidHeader("https://web.push.apple.com/QGx9…/device", v, now);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
  ok(m, header);
  eq(m[4], v.publicKey, "k");
  const head = JSON.parse(new TextDecoder().decode(fromB64url(m[1])));
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2])));
  eq(head, { typ: "JWT", alg: "ES256" });
  eq(claims.aud, "https://web.push.apple.com");
  eq(claims.sub, "https://lexicommons.com");
  ok(claims.exp > now / 1000 && claims.exp - now / 1000 <= 24 * 3600, `exp ${claims.exp}`);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, v.pair.publicKey, fromB64url(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
  ok(valid, "the signature doesn't check");
});

await test("a send: POST, aes128gcm, its TTL, Urgency and Topic (cleaned to 32 URL-safe characters); 410 and 404 mean the subscription ended", async () => {
  const v = await vapidKeys();
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const sub = { endpoint: "https://web.push.apple.com/abc", p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey))), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) };
  const seen = [];
  const answer = (status) => async (url, init) => (seen.push({ url, init }), new Response(null, { status }));
  let r = await send(sub, payload({ title: "T", body: "B", url: "/app/" }), v, { ttl: 10800, urgency: "low", topic: "daily reminder/≠" }, answer(201));
  eq(r, { ok: true, status: 201, gone: false });
  const h = seen[0].init.headers;
  eq([seen[0].init.method, h["Content-Encoding"], h.TTL, h.Urgency, h.Topic], ["POST", "aes128gcm", "10800", "low", "dailyreminder"]);
  ok(h.Authorization.startsWith("vapid t="), "Authorization");
  r = await send(sub, "{}", v, {}, answer(410));
  eq(r.gone, true, "410");
  r = await send(sub, "{}", v, {}, answer(404));
  eq(r.gone, true, "404");
  r = await send(sub, "{}", v, {}, answer(429));
  eq([r.ok, r.gone], [false, false], "429: try later");
});

await test("a subscription may only name a browser's own push service, over https", () => {
  for (const good of ["https://fcm.googleapis.com/fcm/send/abc", "https://web.push.apple.com/QGx9", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/?token=x"]) ok(allowedEndpoint(good), `refused: ${good}`);
  for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://localhost/x", "https://169.254.169.254/x", "javascript:alert(1)", 42, null, `https://fcm.googleapis.com/${"x".repeat(1000)}`]) ok(!allowedEndpoint(bad), `taken: ${String(bad).slice(0, 60)}`);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
