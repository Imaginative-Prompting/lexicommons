// An email on the account (migration 0020), for two things only: getting back in when a passkey is lost, and receipts where the plan is
// offered (offered.ts). It's never a way
// to sign in by itself, never links one account to another, and is never shown to anyone. Passkeys stay first; nothing here is a password.
//
// - Adding one: a 6-digit code goes to the address, and it's kept only once that code comes back (confirm). One address per account, and
//   an address on one account only, so getting back in by it reaches one account.
// - Getting back in: on the sign-in page, the address, then the code sent to it; the code opens a session and the page offers a passkey
//   for this device at once. Asking says the same whether or not the address is known, a code is sent only where it is, and the sending
//   happens after the answer, so neither the words nor the time give an address away.
// - A code: 6 digits, its hash kept (never the code), 15 minutes, 5 tries, used once (checked and taken in one statement, so two right
//   answers at once can't both get in), and at most 5 asked for an hour per account or address (counted inside the write that adds one).
// - No email carries a link to sign in: a code is typed in the app that asked for it (a Home Screen app keeps its own cookies apart from
//   the browser's, where a link would open), and nobody can be sent a link to click.
// - What goes out: Cloudflare's Email Sending (the EMAIL binding, from EMAIL_FROM). A copy without either has none of this: offered() is
//   false and the routes answer 404.
import type { Env } from "./env";
import { planOffered } from "./offered";
import { randomId, sha256Hex } from "./util";

export const CODE_MINUTES = 15;
export const CODE_TRIES = 5;
export const CODES_AN_HOUR = 5;
const HOUR = 3_600_000;

export class EmailError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 429 = 400,
  ) {
    super(message);
  }
}

/** Whether this site sends account email: Cloudflare's Email Sending bound as EMAIL, and an address to send from. */
export const offered = (env: Env) => Boolean(env.EMAIL && env.EMAIL_FROM);

/** An address as kept: trimmed, in small letters; null when it isn't one (one @, a dot in its domain, no spaces, at most 254 characters). */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  const at = email.lastIndexOf("@");
  if (at < 1 || at !== email.indexOf("@")) return null;
  const [local, domain] = [email.slice(0, at), email.slice(at + 1)];
  if (local.length > 64 || !/^[^\s@<>()[\]\\,;:"]+$/.test(local)) return null;
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return null;
  return email;
}

/** An address as it may be named back to its own account: the first letter and the domain (j…@example.com). */
export const masked = (email: string) => `${email[0]}…${email.slice(email.indexOf("@"))}`;

/** Six digits, every one as likely. */
export function newCode(): string {
  const box = new Uint32Array(1);
  // 4,294,000,000 is the largest multiple of a million under 2^32: anything above would make the low codes likelier.
  let n = 4_294_000_000;
  while (n >= 4_294_000_000) n = crypto.getRandomValues(box)[0] ?? n;
  return String(n % 1_000_000).padStart(6, "0");
}
const codeHash = (id: string, code: string) => sha256Hex(`${id}.${code}`);

/** The account's address: { email, verifiedAt } or null. */
export async function accountEmail(env: Env, userId: string) {
  return accountEmailFrom(await accountEmailStatement(env, userId).first<EmailRow>());
}
type EmailRow = { email: string; verified_at: number };
/** The account's email read as a statement, for a batch (GET /api/me), and its row as accountEmail's answer. */
export const accountEmailStatement = (env: Env, userId: string) => env.DB.prepare("SELECT email, verified_at FROM account_emails WHERE user_id = ?").bind(userId);
export const accountEmailFrom = (row: EmailRow | null | undefined) => (row ? { email: row.email, verifiedAt: row.verified_at } : null);

type Mail = { to: string; subject: string; text: string };
/** One email from Lexicommons. Plain text, with the same words as simple HTML. Throws EmailError when it can't go. */
export async function send(env: Env, { to, subject, text }: Mail) {
  if (!env.EMAIL || !env.EMAIL_FROM) throw new EmailError("This site doesn't send email.", 404);
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1d1d1f">${text
    .split("\n\n")
    .map((part) => `<p>${part.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
  await env.EMAIL.send({ to, from: { email: env.EMAIL_FROM, name: "Lexicommons" }, subject, text, html });
}

// The emails. No links: a code is typed in the app. Receipts are named only where the plan is offered (offered.ts): a site without it sends none.
const signature = (receipts: boolean) =>
  `Lexicommons uses this address only to help you get back into your account${receipts ? " and to send receipts" : ""}. It never sends a link to sign in.`;
export const MAIL = {
  confirm: (code: string, receipts: boolean): Omit<Mail, "to"> => ({
    subject: `Your Lexicommons code: ${code}`,
    text: `Your code to add this email to your Lexicommons account is ${code}. It works for ${CODE_MINUTES} minutes.\n\nIf you didn't ask for it, you can ignore this email: nothing changes without the code.\n\n${signature(receipts)}`,
  }),
  recover: (code: string, receipts: boolean): Omit<Mail, "to"> => ({
    subject: `Your code to get back into Lexicommons: ${code}`,
    text: `Someone asked to get back into the Lexicommons account that has this email. If it was you, type ${code} in the app. It works for ${CODE_MINUTES} minutes.\n\nIf it wasn't you, ignore this: nobody gets in without the code. Never type it anywhere but the Lexicommons app.\n\n${signature(receipts)}`,
  }),
  recovered: (when: number, receipts: boolean): Omit<Mail, "to"> => ({
    subject: "You got back into Lexicommons with your email",
    text: `Your Lexicommons account was opened with a code sent to this address, on ${new Date(when).toUTCString()}.\n\nIf that wasn't you, sign in with your passkey and remove this email in Settings, then write to support@lexicommons.com.\n\n${signature(receipts)}`,
  }),
  replaced: (now: string, receipts: boolean): Omit<Mail, "to"> => ({
    subject: "Your Lexicommons email was changed",
    text: `Your Lexicommons account no longer uses this address. Its email is now ${now}.\n\nIf you didn't change it, sign in with your passkey and look at Settings, then write to support@lexicommons.com.\n\n${signature(receipts)}`,
  }),
};

/**
 * Adds a code, unless the address has had CODES_AN_HOUR sent to it in the last hour (for any account, to add it or to get back in), or the
 * account adding it has asked for that many. Counted in email_sends, which nothing but the hour empties (removing the address, confirming it,
 * a code used and an account deleted leave it), in the same statement that writes the send, so requests sent at once can't all pass.
 * Returns the code, or null when it's over the limit.
 */
async function addCode(env: Env, { userId, email, purpose }: { userId: string | null; email: string; purpose: "confirm" | "recover" }) {
  const id = randomId(16);
  const code = newCode();
  const now = Date.now();
  const adder = purpose === "confirm" ? userId : null;
  const sent = await env.DB.prepare(
    `INSERT INTO email_sends (address_hash, user_id, sent_at)
     SELECT ?1, ?2, ?3
     WHERE (SELECT COUNT(*) FROM email_sends WHERE address_hash = ?1 AND sent_at > ?4) < ?5
       AND (?2 IS NULL OR (SELECT COUNT(*) FROM email_sends WHERE user_id = ?2 AND sent_at > ?4) < ?5)`,
  )
    .bind(await sha256Hex(`email-send:${email}`), adder, now, now - HOUR, CODES_AN_HOUR)
    .run();
  if (!sent.meta.changes) return null;
  await env.DB.prepare(
    "INSERT INTO email_codes (id, user_id, email, purpose, code_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
  )
    .bind(id, userId, email, purpose, await codeHash(id, code), now + CODE_MINUTES * 60_000, now)
    .run();
  // Codes gone past their time, and sends past their hour, go a few at a time.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM email_codes WHERE expires_at < ?").bind(now - HOUR),
    env.DB.prepare("DELETE FROM email_sends WHERE sent_at < ?").bind(now - HOUR),
  ]);
  return { id, code };
}

/**
 * Takes a code if it's right, unexpired and has tries left. Every answer takes a try first, in one statement that refuses a sixth, and only
 * then is the code compared: answers sent all at once can't all be compared (each would have seen five tries left). The right one is then
 * taken in one statement (used once). Returns the row, or null with how many tries are left.
 */
async function takeCode(env: Env, id: unknown, code: unknown, purpose: "confirm" | "recover") {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(id) || typeof code !== "string") return { row: null, left: 0 };
  const now = Date.now();
  const tried = await env.DB.prepare(
    "UPDATE email_codes SET attempts = attempts + 1 WHERE id = ? AND purpose = ? AND expires_at > ? AND attempts < ? RETURNING attempts",
  )
    .bind(id, purpose, now, CODE_TRIES)
    .first<{ attempts: number }>();
  if (!tried) return { row: null, left: 0 };
  const digits = code.replace(/\s/g, "");
  if (/^\d{6}$/.test(digits)) {
    const row = await env.DB.prepare("DELETE FROM email_codes WHERE id = ? AND purpose = ? AND code_hash = ? RETURNING user_id, email")
      .bind(id, purpose, await codeHash(id, digits))
      .first<{ user_id: string | null; email: string }>();
    if (row) return { row, left: CODE_TRIES };
  }
  return { row: null, left: Math.max(0, CODE_TRIES - tried.attempts) };
}
const wrong = (left: number) =>
  new EmailError(left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code can't be used any more. Ask for a new one.");

/** Sends a code to an address to add it to the account. Returns { id } (what the code is checked with) and the email to send after. */
export async function startConfirm(env: Env, userId: string, value: unknown) {
  if (!offered(env)) throw new EmailError("This site doesn't send email.", 404);
  const email = normalizeEmail(value);
  if (!email) throw new EmailError("That doesn't look like an email address.");
  const added = await addCode(env, { userId, email, purpose: "confirm" });
  if (!added) throw new EmailError("That's a lot of codes. Wait an hour, then ask again.", 429);
  return { id: added.id, mail: { to: email, ...MAIL.confirm(added.code, planOffered(env)) } };
}

/** Adds the address once its code comes back. Returns { email } and, when it replaced another, the email telling the old one. */
export async function finishConfirm(env: Env, userId: string, id: unknown, code: unknown) {
  if (!offered(env)) throw new EmailError("This site doesn't send email.", 404);
  const { row, left } = await takeCode(env, id, code, "confirm");
  if (!row || row.user_id !== userId) throw wrong(left);
  const before = await accountEmail(env, userId);
  const now = Date.now();
  // Only the address's owner can get here (they have its code), so saying it's on another account tells them nothing they couldn't find out.
  const taken = await env.DB.prepare("SELECT user_id FROM account_emails WHERE email = ? AND user_id != ?").bind(row.email, userId).first();
  if (taken) throw new EmailError("That email is on another Lexicommons account. Remove it there first.", 409);
  await env.DB.prepare(
    "INSERT INTO account_emails (user_id, email, verified_at, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, verified_at = excluded.verified_at",
  )
    .bind(userId, row.email, now, now)
    .run();
  await env.DB.prepare("DELETE FROM email_codes WHERE user_id = ? AND purpose = 'confirm'").bind(userId).run();
  const notice = before && before.email !== row.email ? { to: before.email, ...MAIL.replaced(masked(row.email), planOffered(env)) } : null;
  return { email: row.email, verifiedAt: now, notice };
}

/** Takes the address off the account (and any code on its way to it). */
export async function removeEmail(env: Env, userId: string) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM account_emails WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM email_codes WHERE user_id = ?").bind(userId),
  ]);
}

/**
 * Asked to get back in by an address: { id } either way, and an email to send only when the address is on an account. An address on
 * none keeps a row too (its code is one nobody has), so the next step answers the same.
 */
export async function startRecovery(env: Env, value: unknown) {
  if (!offered(env)) throw new EmailError("This site doesn't send email.", 404);
  const email = normalizeEmail(value);
  if (!email) throw new EmailError("That doesn't look like an email address.");
  const owner = await env.DB.prepare("SELECT user_id FROM account_emails WHERE email = ?").bind(email).first<{ user_id: string }>();
  const added = await addCode(env, { userId: owner?.user_id ?? null, email, purpose: "recover" });
  if (!added) throw new EmailError("That's a lot of codes for one address. Wait an hour, then ask again.", 429);
  return { id: added.id, mail: owner ? { to: email, ...MAIL.recover(added.code, planOffered(env)) } : null };
}

/** The code back: the account to open a session for, and the email telling the address it was used. */
export async function finishRecovery(env: Env, id: unknown, code: unknown) {
  if (!offered(env)) throw new EmailError("This site doesn't send email.", 404);
  const { row, left } = await takeCode(env, id, code, "recover");
  if (!row?.user_id) throw wrong(row ? 0 : left);
  // Still that account's address (it may have been removed since the code went).
  const still = await env.DB.prepare("SELECT 1 FROM account_emails WHERE user_id = ? AND email = ?").bind(row.user_id, row.email).first();
  if (!still) throw wrong(0);
  return { userId: row.user_id, notice: { to: row.email, ...MAIL.recovered(Date.now(), planOffered(env)) } };
}
