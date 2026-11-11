// The VAPID key pair reminders are signed with (src/webpush.ts, RFC 8292): a P-256 key, its public half as raw bytes in
// base64url (VAPID_PUBLIC_KEY) and its private half as a JWK (VAPID_PRIVATE_JWK). Nothing is ever printed.
//   node scripts/vapid-keys.mjs --local <file>   a pair for a local server, written to <file> (mode 600) as
//                                               KEY=value lines: make it .dev.vars in the folder wrangler dev runs
//                                               from, which reads it itself (gitignored); delete it after
//   node scripts/vapid-keys.mjs --put [--replace] a pair for the live Worker, piped into `wrangler secret put` (sandbox
//                                               off; CLOUDFLARE_ACCOUNT_ID set). Refuses when the Worker has them
//                                               already, unless --replace: a new pair ends every subscription, and
//                                               each device has to turn reminders on again.

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const b64url = (bytes) => Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
const { kty, crv, x, y, d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
const privateJwk = JSON.stringify({ kty, crv, x, y, d });

if (args[0] === "--local" && args[1]) {
  const file = resolve(args[1]);
  writeFileSync(file, `VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_JWK=${privateJwk}\n`, { mode: 0o600 });
  console.log(`vapid-keys: a local pair written to ${file} (not printed)`);
} else if (args[0] === "--put") {
  const wrangler = (...a) => spawnSync("npx", ["wrangler", ...a], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  const list = wrangler("secret", "list", "--format", "json");
  if (list.status !== 0) {
    console.error("vapid-keys: couldn't list the Worker's secrets (signed in to wrangler, CLOUDFLARE_ACCOUNT_ID set, sandbox off?)");
    process.exit(1);
  }
  const names = new Set(JSON.parse(list.stdout || "[]").map((s) => s.name));
  if ((names.has("VAPID_PUBLIC_KEY") || names.has("VAPID_PRIVATE_JWK")) && !args.includes("--replace")) {
    console.error("vapid-keys: the Worker has VAPID keys already. --replace makes a new pair, which ends every subscription.");
    process.exit(1);
  }
  for (const [name, value] of [["VAPID_PRIVATE_JWK", privateJwk], ["VAPID_PUBLIC_KEY", publicKey]]) {
    const put = spawnSync("npx", ["wrangler", "secret", "put", name], { input: value, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    if (put.status !== 0) {
      console.error(`vapid-keys: wrangler secret put ${name} failed (its output isn't shown: it may carry the value)`);
      process.exit(1);
    }
    console.log(`vapid-keys: ${name} set on the Worker`);
  }
} else {
  console.error("usage: node scripts/vapid-keys.mjs --local <file> | --put [--replace]");
  process.exit(2);
}
