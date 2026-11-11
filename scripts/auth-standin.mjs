// Stand-ins for Google, GitHub and Apple sign-in, for local checks only (scripts/auth-check.mjs). They speak the parts of
// each provider's OAuth that src/signin.ts uses, and check what it sends the way the real ones do: the client id and
// secret, the exact redirect URI, PKCE (S256, and the verifier against the challenge), the scopes, Google's nonce.
// Apple's: no scope, response_mode=query, a nonce, no PKCE, and its client secret a JWT (ES256, kid the key's id; from the
// team, about the Services ID, for https://appleid.apple.com, at most six months) whose signature is checked against the
// test key's public half. Apple is there only when started with that key (a PKCS8 PEM file, made by `apple-key <file>`).
// A local server uses them only with --var AUTH_STANDIN:http://localhost:<port> and a localhost PUBLIC_ORIGIN.
//
// Who signs in is set from the check: POST /control { google?, github?, apple?: answer }, where an answer is
//   { sub, name } (Google) · { id, login, name } (GitHub) · { sub } (Apple) · { cancel: true } · plus, for the negative
//   checks, { tamper: "nonce" | "aud" | "iss" | "expired" | "bad-code" }, and Apple's "secret" (its client secret checked
//   against another key, which must fail).
// The next authorize for that provider uses it, then it's spent; with none set, authorize answers 409.
// GET /log returns every request seen (secrets and verifiers redacted) for the check to read.
//
// Usage: node scripts/auth-standin.mjs <port> <app origin> [<apple key file>]   e.g. node scripts/auth-standin.mjs 8828 http://localhost:8827
//        node scripts/auth-standin.mjs apple-key <file>   a new test key for Apple (never a real one); the server takes the base64
//        between its lines as APPLE_PRIVATE_KEY

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

if (process.argv[2] === "apple-key") {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  writeFileSync(process.argv[3], privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  process.exit(0);
}

const [port = "8828", appOrigin = "http://localhost:8827", appleKeyFile] = process.argv.slice(2);
const APPLE_PUBLIC = appleKeyFile ? createPublicKey(createPrivateKey(readFileSync(appleKeyFile, "utf8"))) : null;
const ORIGIN = `http://localhost:${port}`;
export const STANDIN_CLIENTS = {
  google: { id: "standin-google-client", secret: "standin-google-secret" },
  github: { id: "standin-github-client", secret: "standin-github-secret" },
  apple: { id: "standin.apple.services", team: "STANDINTEAM", keyId: "STANDINKEY1" },
};

const next = { google: null, github: null, apple: null };
const codes = new Map(); // code → { provider, answer, challenge, nonce, redirectUri, clientId, used }
const tokens = new Map(); // GitHub access token → answer
const log = [];

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");
const redact = (params) => Object.fromEntries([...params].map(([k, v]) => [k, /secret|verifier|code$/.test(k) ? `<${k}>` : v]));

function send(res, status, body, headers = {}) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": typeof body === "string" ? "text/plain" : "application/json", ...headers });
  res.end(json);
}

async function readBody(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text;
}

function authorize(provider, url, res) {
  const p = url.searchParams;
  const answer = next[provider];
  next[provider] = null;
  const client = STANDIN_CLIENTS[provider];
  const redirectUri = p.get("redirect_uri");
  const problems = [];
  if (p.get("client_id") !== client.id) problems.push("client_id");
  if (redirectUri !== `${appOrigin}/login/${provider}/callback`) problems.push("redirect_uri");
  if (provider === "apple") {
    if (p.has("code_challenge") || p.has("code_challenge_method")) problems.push("pkce (Apple's web flow has none)");
  } else if (p.get("code_challenge_method") !== "S256" || !/^[\w-]{43}$/.test(p.get("code_challenge") ?? "")) problems.push("pkce");
  if (!p.get("state")) problems.push("state");
  if (provider === "apple") {
    if (p.get("response_type") !== "code") problems.push("response_type");
    if (p.get("response_mode") !== "query") problems.push(`response_mode (${p.get("response_mode")})`);
    if (p.get("scope")) problems.push(`scope (${p.get("scope")}: none is asked for, and with one Apple refuses a query answer)`);
    if (!p.get("nonce")) problems.push("nonce");
  } else if (provider === "google") {
    if (p.get("response_type") !== "code") problems.push("response_type");
    if (p.get("scope") !== "openid profile") problems.push(`scope (${p.get("scope")})`);
    if (!p.get("nonce")) problems.push("nonce");
  } else if (p.get("scope")) {
    problems.push(`scope (${p.get("scope")})`);
  }
  log.push({ at: Date.now(), provider, step: "authorize", params: redact(p), problems });
  if (problems.length) return send(res, 400, `stand-in ${provider}: bad authorize request: ${problems.join(", ")}`);
  if (!answer) return send(res, 409, `stand-in ${provider}: no answer set (POST /control first)`);
  const back = new URL(redirectUri);
  back.searchParams.set("state", p.get("state"));
  if (answer.cancel) {
    back.searchParams.set("error", provider === "apple" ? "user_cancelled_authorize" : "access_denied");
  } else {
    const code = b64url(randomBytes(18));
    codes.set(code, { provider, answer, challenge: p.get("code_challenge"), nonce: p.get("nonce"), redirectUri, clientId: client.id, used: false });
    back.searchParams.set("code", code);
  }
  res.writeHead(302, { Location: back.toString() });
  res.end();
}

async function token(provider, req, res) {
  const params = new URLSearchParams(await readBody(req));
  const client = STANDIN_CLIENTS[provider];
  const entry = codes.get(params.get("code") ?? "");
  const problems = [];
  if (provider === "apple") problems.push(...appleSecretProblems(params, entry?.answer?.tamper === "secret"));
  else if (params.get("client_id") !== client.id || params.get("client_secret") !== client.secret) problems.push("client");
  if (!entry) problems.push("unknown code");
  else {
    if (entry.used) problems.push("code reused");
    if (entry.provider !== provider) problems.push("wrong provider");
    if (params.get("redirect_uri") !== entry.redirectUri) problems.push("redirect_uri");
    if (provider !== "apple") {
      const verifier = params.get("code_verifier") ?? "";
      if (b64url(createHash("sha256").update(verifier).digest()) !== entry.challenge) problems.push("pkce verifier");
    }
    if (provider !== "github" && params.get("grant_type") !== "authorization_code") problems.push("grant_type");
    if (entry.answer.tamper === "bad-code") problems.push("tampered: bad code");
    entry.used = true;
  }
  log.push({ at: Date.now(), provider, step: "token", params: redact(params), problems });
  if (problems.length) {
    // Google and Apple answer a bad code with a 400; GitHub with a 200 and an error field.
    if (provider === "apple") return send(res, 400, { error: problems.some((p) => p.startsWith("secret") || p === "client") ? "invalid_client" : "invalid_grant" });
    return provider === "google" ? send(res, 400, { error: "invalid_grant" }) : send(res, 200, { error: "bad_verification_code" });
  }
  if (provider === "google" || provider === "apple") {
    const a = entry.answer;
    const claims = {
      iss: a.tamper === "iss" ? "https://evil.example" : `${ORIGIN}/${provider}`,
      aud: a.tamper === "aud" ? "someone-else" : client.id,
      sub: a.sub,
      ...(provider === "google" ? { name: a.name } : { nonce_supported: true, auth_time: Math.floor(Date.now() / 1000) }),
      nonce: a.tamper === "nonce" ? "not-the-nonce" : entry.nonce,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (a.tamper === "expired" ? -3600 : 3600),
    };
    const idToken = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}.${b64url("stand-in")}`;
    if (provider === "apple") return send(res, 200, { access_token: b64url(randomBytes(18)), id_token: idToken, token_type: "Bearer", expires_in: 3600, refresh_token: b64url(randomBytes(18)) });
    return send(res, 200, { access_token: b64url(randomBytes(18)), id_token: idToken, token_type: "Bearer", expires_in: 3599, scope: "openid profile" });
  }
  const accessToken = `gho_${b64url(randomBytes(18))}`;
  tokens.set(accessToken, entry.answer);
  return send(res, 200, { access_token: accessToken, token_type: "bearer", scope: "" });
}

/** What's wrong with Apple's client_id and client secret, as Apple would refuse them. otherKey: checked against a key that didn't sign it. */
function appleSecretProblems(params, otherKey) {
  const client = STANDIN_CLIENTS.apple;
  const problems = [];
  if (params.get("client_id") !== client.id) problems.push("client");
  const [head, body, signature, extra] = (params.get("client_secret") ?? "").split(".");
  if (!head || !body || !signature || extra !== undefined) return [...problems, "secret: not a JWT"];
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(head, "base64url").toString());
    claims = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return [...problems, "secret: not JSON"];
  }
  if (header.alg !== "ES256" || header.kid !== client.keyId) problems.push(`secret: header ${JSON.stringify(header)}`);
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== client.team) problems.push("secret: iss");
  if (claims.sub !== client.id) problems.push("secret: sub");
  if (claims.aud !== "https://appleid.apple.com") problems.push("secret: aud");
  if (!(claims.iat <= now + 60) || !(claims.exp > now) || claims.exp - claims.iat > 15_777_000) problems.push("secret: times");
  const key = otherKey ? generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey : APPLE_PUBLIC;
  const signed = verify("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
  if (!signed) problems.push("secret: signature");
  return problems;
}

function githubUser(req, res) {
  const auth = req.headers.authorization ?? "";
  const answer = tokens.get(auth.replace(/^Bearer /, ""));
  const problems = [];
  if (!answer) problems.push("token");
  if (!req.headers["user-agent"]) problems.push("user-agent");
  log.push({ at: Date.now(), provider: "github", step: "user", problems });
  if (problems.length) return send(res, 401, { message: "Bad credentials" });
  return send(res, 200, { id: answer.id, login: answer.login, name: answer.name ?? null, email: null });
}

createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  try {
    if (req.method === "POST" && url.pathname === "/control") {
      const body = JSON.parse((await readBody(req)) || "{}");
      for (const provider of ["google", "github", "apple"]) if (body[provider] !== undefined) next[provider] = body[provider];
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/log") return send(res, 200, log);
    if (req.method === "GET" && url.pathname === "/google/authorize") return authorize("google", url, res);
    if (req.method === "GET" && url.pathname === "/github/authorize") return authorize("github", url, res);
    if (req.method === "POST" && url.pathname === "/google/token") return await token("google", req, res);
    if (req.method === "POST" && url.pathname === "/github/token") return await token("github", req, res);
    if (req.method === "GET" && url.pathname === "/github/user") return githubUser(req, res);
    if (url.pathname.startsWith("/apple/") && !APPLE_PUBLIC) return send(res, 503, "stand-in apple: started without a key");
    if (req.method === "GET" && url.pathname === "/apple/authorize") return authorize("apple", url, res);
    if (req.method === "POST" && url.pathname === "/apple/token") return await token("apple", req, res);
    send(res, 404, "not found");
  } catch (error) {
    send(res, 500, String(error));
  }
}).listen(Number(port), "localhost", () => console.log(`auth stand-ins on ${ORIGIN} for ${appOrigin}`));
