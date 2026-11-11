// An email on the account (src/account-email.ts) on the real migrations in Node's SQLite, with Cloudflare's Email Sending played in memory
// (every email it would send is kept here, none goes anywhere): what an address is; codes (6 digits, every one as likely; only their hash
// kept; 15 minutes; 5 tries; used once, even by two right answers at once; 5 an hour per account and per address, also asked for at once);
// adding an address, replacing it (the old one told) and one already on another account; getting back in, with the same answer whether an
// address is known or not, a code sent only where it is, refused once the address is gone; no email carrying a link; a site without Email
// Sending offering none of it. `node scripts/test-account-email.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env: base, row, rows, sqlite } = workerEnv();
const mail = await import("../src/account-email.ts");

const sent = [];
const env = { ...base, EMAIL_FROM: "account@lexicommons.com", EMAIL: { send: async (message) => (sent.push(message), { messageId: `m${sent.length}` }) } };
const off = { ...base };

// The send log (migration 0026 on): a copy from before it has none, and its tests then fail on what it's for, not on a missing table.
const hasSends = Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'email_sends'").get());
let passed = 0;
let failed = 0;
async function test(name, fn) {
  sqlite.exec(`DELETE FROM email_codes; DELETE FROM account_emails;${hasSends ? " DELETE FROM email_sends;" : ""}`);
  sent.length = 0;
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(error.stack ?? error).split("\n").slice(0, 6).join("\n      ")}`);
  }
}
const user = (id) => sqlite.prepare("INSERT OR IGNORE INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, id, Date.now());
for (const id of ["u_ana", "u_bo", "u_cy"]) user(id);
const codeIn = (message) => message.subject.match(/(\d{6})/)?.[1];
const refuses = async (fn, pattern, status) => {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof mail.EmailError, `not an EmailError: ${error}`);
    assert.match(error.message, pattern);
    if (status) assert.equal(error.status, status);
    return error;
  }
  assert.fail(`not refused (wanted ${pattern})`);
};
// Adds an address to an account the whole way: its code sent, then back.
async function add(userId, email) {
  const { id, mail: message } = await mail.startConfirm(env, userId, email);
  await env.EMAIL.send(message);
  return mail.finishConfirm(env, userId, id, codeIn(message));
}

await test("an address: trimmed, small letters, one @ and a real domain; anything else isn't one", () => {
  assert.equal(mail.normalizeEmail("  Ana.Lopez+lx@Example.COM "), "ana.lopez+lx@example.com");
  for (const bad of ["", "ana", "ana@", "@example.com", "ana@example", "ana@@example.com", "a b@example.com", "ana@exa mple.com", "ana@-example.com", "<a>@example.com", "x".repeat(65) + "@example.com", `a@${"x".repeat(250)}.com`, 42, null, { toString: null }])
    assert.equal(mail.normalizeEmail(bad), null, typeof bad === "string" ? bad.slice(0, 40) : typeof bad);
});

await test("a code is six digits, every digit as likely in every place", () => {
  const counts = Array.from({ length: 6 }, () => new Array(10).fill(0));
  for (let i = 0; i < 20000; i++) {
    const code = mail.newCode();
    assert.match(code, /^\d{6}$/);
    [...code].forEach((d, place) => counts[place][d]++);
  }
  // 2,000 expected per digit and place; a biased draw (or a leading digit stuck at 0) lands far outside this.
  for (const place of counts) for (const n of place) assert.ok(n > 1700 && n < 2300, JSON.stringify(counts));
});

await test("adding an address: a code to it, kept only once the code is back, only the code's hash kept", async () => {
  const { id, mail: message } = await mail.startConfirm(env, "u_ana", "Ana@Example.com");
  assert.equal(message.to, "ana@example.com");
  const code = codeIn(message);
  assert.match(code, /^\d{6}$/);
  assert.equal(await mail.accountEmail(env, "u_ana"), null, "kept before its code came back");
  const stored = row("SELECT * FROM email_codes WHERE id = ?", id);
  assert.ok(stored && !JSON.stringify(stored).includes(code), "the code itself is stored");
  const done = await mail.finishConfirm(env, "u_ana", id, ` ${code.slice(0, 3)} ${code.slice(3)} `);
  assert.equal(done.email, "ana@example.com");
  assert.equal(done.notice, null, "nothing to tell: there was no address before");
  assert.equal((await mail.accountEmail(env, "u_ana")).email, "ana@example.com");
  assert.equal(rows("SELECT * FROM email_codes WHERE user_id = 'u_ana'").length, 0, "its codes go once it's kept");
});

await test("a wrong code counts a try, five and the code is done, even for the right one after", async () => {
  const { id, mail: message } = await mail.startConfirm(env, "u_ana", "ana@example.com");
  const right = codeIn(message);
  const wrongCode = right === "000000" ? "111111" : "000000";
  for (const left of [4, 3, 2, 1]) await refuses(() => mail.finishConfirm(env, "u_ana", id, wrongCode), new RegExp(`${left} tr(y|ies) left`));
  await refuses(() => mail.finishConfirm(env, "u_ana", id, "12ab56"), /can't be used any more/);
  await refuses(() => mail.finishConfirm(env, "u_ana", id, right), /can't be used any more/);
  assert.equal(await mail.accountEmail(env, "u_ana"), null);
});

// D1 is across a network: a statement runs a moment after it's sent, so several sent at once all run before any of their answers is back.
const overTheNetwork = (e) => {
  const late = (statement) => ({
    bind: (...values) => late(statement.bind(...values)),
    first: async (...a) => (await new Promise((r) => setTimeout(r, 5)), statement.first(...a)),
    run: async (...a) => (await new Promise((r) => setTimeout(r, 5)), statement.run(...a)),
    all: async (...a) => (await new Promise((r) => setTimeout(r, 5)), statement.all(...a)),
  });
  return { ...e, DB: { ...e.DB, prepare: (sql) => late(e.DB.prepare(sql)), batch: (list) => e.DB.batch(list) } };
};

await test("answers sent all at once still get five tries: twenty at once with the right one last, and it doesn't get in", async () => {
  await add("u_ana", "ana@example.com");
  const asked = await mail.startRecovery(env, "ana@example.com");
  const code = codeIn(asked.mail);
  const wrongOne = code === "000000" ? "111111" : "000000";
  const slow = overTheNetwork(env);
  const answers = await Promise.allSettled([...Array.from({ length: 19 }, () => mail.finishRecovery(slow, asked.id, wrongOne)), mail.finishRecovery(slow, asked.id, code)]);
  assert.equal(answers.at(-1).status, "rejected", "the right code, twentieth at once, got in: more than five answers were compared");
  assert.equal(answers.filter((a) => a.status === "fulfilled").length, 0);
  assert.ok(row("SELECT attempts FROM email_codes WHERE id = ?", asked.id).attempts <= 5, "more than five tries counted");
});

await test("a code is used once, lasts 15 minutes, and is for its own account", async () => {
  const first = await mail.startConfirm(env, "u_ana", "ana@example.com");
  await mail.finishConfirm(env, "u_ana", first.id, codeIn(first.mail));
  await refuses(() => mail.finishConfirm(env, "u_ana", first.id, codeIn(first.mail)), /can't be used any more|isn't right/);
  const late = await mail.startConfirm(env, "u_bo", "bo@example.com");
  sqlite.prepare("UPDATE email_codes SET expires_at = ? WHERE id = ?").run(Date.now() - 1, late.id);
  await refuses(() => mail.finishConfirm(env, "u_bo", late.id, codeIn(late.mail)), /can't be used any more/);
  const theirs = await mail.startConfirm(env, "u_bo", "bo@example.com");
  await refuses(() => mail.finishConfirm(env, "u_cy", theirs.id, codeIn(theirs.mail)), /isn't right|can't be used/);
  assert.equal(await mail.accountEmail(env, "u_cy"), null);
  for (const id of [undefined, 42, "", "x'; DROP TABLE users; --", { toString: null }]) await refuses(() => mail.finishConfirm(env, "u_ana", id, "123456"), /can't be used any more/);
});

await test("five codes an hour for an account, the sixth refused, also when asked for all at once", async () => {
  const asked = await Promise.allSettled(Array.from({ length: 8 }, () => mail.startConfirm(env, "u_cy", "cy@example.com")));
  assert.equal(asked.filter((a) => a.status === "fulfilled").length, mail.CODES_AN_HOUR);
  assert.ok(asked.filter((a) => a.status === "rejected").every((a) => a.reason.status === 429));
  // An hour on: the sends it counted are past (counted in email_sends; before it, in email_codes).
  sqlite.prepare("UPDATE email_codes SET created_at = ? WHERE user_id = 'u_cy'").run(Date.now() - 2 * 3_600_000);
  if (hasSends) sqlite.prepare("UPDATE email_sends SET sent_at = ? WHERE user_id = 'u_cy'").run(Date.now() - 2 * 3_600_000);
  await mail.startConfirm(env, "u_cy", "cy@example.com");
});

await test("an address on another account is refused once its code comes back (only the mailbox's owner learns it); replacing one tells the old", async () => {
  await add("u_ana", "ana@example.com");
  const theirs = await mail.startConfirm(env, "u_bo", "ana@example.com");
  await refuses(() => mail.finishConfirm(env, "u_bo", theirs.id, codeIn(theirs.mail)), /on another Lexicommons account/, 409);
  assert.equal(await mail.accountEmail(env, "u_bo"), null);
  const replaced = await add("u_ana", "ana.new@example.com");
  assert.equal(replaced.notice.to, "ana@example.com");
  assert.match(replaced.notice.text, /a…@example\.com/, "the new address is named only in part");
  assert.ok(!replaced.notice.text.includes("ana.new@"), "the new address in full went to the old one");
  assert.equal(rows("SELECT * FROM account_emails WHERE user_id = 'u_ana'").length, 1);
  await mail.removeEmail(env, "u_ana");
  assert.equal(await mail.accountEmail(env, "u_ana"), null);
});

await test("getting back in: the same answer for any address, a code sent only to one on an account", async () => {
  await add("u_ana", "ana@example.com");
  const known = await mail.startRecovery(env, "ANA@example.com ");
  const unknown = await mail.startRecovery(env, "nobody@example.com");
  assert.deepEqual(Object.keys(known).filter((k) => k !== "mail"), ["id"]);
  assert.deepEqual(Object.keys(unknown).filter((k) => k !== "mail"), ["id"]);
  assert.equal(known.id.length, unknown.id.length);
  assert.equal(known.mail.to, "ana@example.com");
  assert.equal(unknown.mail, null, "an email went to an address on no account");
  // Both keep a row; the unknown one's code is one nobody was sent.
  assert.equal(row("SELECT user_id FROM email_codes WHERE id = ?", unknown.id).user_id, null);
  // The next step answers alike: a wrong code for each says the same.
  const a = await refuses(() => mail.finishRecovery(env, known.id, "000000"), /isn't right/);
  const b = await refuses(() => mail.finishRecovery(env, unknown.id, "000000"), /isn't right/);
  assert.equal(a.message, b.message);
});

await test("getting back in: the right code opens the account once; the address told; not once the address is gone", async () => {
  await add("u_bo", "bo@example.com");
  const asked = await mail.startRecovery(env, "bo@example.com");
  const code = codeIn(asked.mail);
  const opened = await mail.finishRecovery(env, asked.id, code);
  assert.equal(opened.userId, "u_bo");
  assert.equal(opened.notice.to, "bo@example.com");
  assert.match(opened.notice.subject, /got back into Lexicommons/);
  await refuses(() => mail.finishRecovery(env, asked.id, code), /can't be used any more|isn't right/);
  const again = await mail.startRecovery(env, "bo@example.com");
  await mail.removeEmail(env, "u_bo");
  await refuses(() => mail.finishRecovery(env, again.id, codeIn(again.mail)), /can't be used any more|isn't right/);
});

await test("two right answers at once: one gets in", async () => {
  await add("u_cy", "cy@example.com");
  const asked = await mail.startRecovery(env, "cy@example.com");
  const code = codeIn(asked.mail);
  const both = await Promise.allSettled([mail.finishRecovery(env, asked.id, code), mail.finishRecovery(env, asked.id, code)]);
  assert.equal(both.filter((r) => r.status === "fulfilled").length, 1, JSON.stringify(both.map((r) => r.status)));
});

await test("five codes an hour for an address (asking about one on no account counts too)", async () => {
  for (let i = 0; i < mail.CODES_AN_HOUR; i++) await mail.startRecovery(env, "someone@example.com");
  await refuses(() => mail.startRecovery(env, "someone@example.com"), /a lot of codes/, 429);
  await mail.startRecovery(env, "someone.else@example.com");
});

await test("adding an address and removing it, over and over: the sixth code in the hour to that inbox is refused", async () => {
  for (let i = 0; i < 5; i++) {
    const { mail: message } = await mail.startConfirm(env, "u_ana", "victim@example.com");
    await env.EMAIL.send(message);
    await mail.removeEmail(env, "u_ana");
  }
  await refuses(() => mail.startConfirm(env, "u_ana", "victim@example.com"), /a lot of codes/, 429);
  assert.equal(sent.filter((m) => m.to === "victim@example.com").length, 5);
  if (hasSends) assert.ok(!rows("SELECT * FROM email_sends").some((r) => JSON.stringify(r).includes("victim@example.com")), "an address in the clear in the send log");
});

await test("five codes an hour to one address across accounts and purposes; a confirmed address doesn't reset it", async () => {
  await add("u_ana", "shared@example.com");
  await mail.startConfirm(env, "u_bo", "shared@example.com");
  await mail.startConfirm(env, "u_cy", "shared@example.com");
  await mail.startRecovery(env, "shared@example.com");
  await mail.startRecovery(env, "shared@example.com");
  await refuses(() => mail.startConfirm(env, "u_bo", "shared@example.com"), /a lot of codes/, 429);
  await refuses(() => mail.startRecovery(env, "shared@example.com"), /a lot of codes/, 429);
});

await test("no email carries a link, and each says what the address is for: receipts only where the plan is offered", async () => {
  for (const receipts of [false, true]) {
    for (const message of [mail.MAIL.confirm("123456", receipts), mail.MAIL.recover("123456", receipts), mail.MAIL.recovered(Date.now(), receipts), mail.MAIL.replaced("a…@example.com", receipts)]) {
      assert.ok(!/https?:|www\.|href/i.test(message.text), message.subject);
      assert.match(message.text, receipts ? /only to help you get back into your account and to send receipts\./ : /only to help you get back into your account\. It never/);
      assert.equal(/receipt/i.test(message.text), receipts, `${message.subject}: receipts ${receipts}`);
    }
  }
  // What startConfirm hands back follows this site: no plan here, so no receipts.
  const started = await mail.startConfirm(env, "u_ana", "receipts-check@example.com");
  assert.ok(started.mail && !/receipt/i.test(started.mail.text), started.mail?.text);
  await mail.send(env, { to: "ana@example.com", ...mail.MAIL.confirm("123456", false) });
  const out = sent.at(-1);
  assert.deepEqual(out.from, { email: "account@lexicommons.com", name: "Lexicommons" });
  assert.ok(out.html.includes("123456") && !/<script|href/i.test(out.html));
  // Text that looks like markup goes in as text.
  await mail.send(env, { to: "ana@example.com", subject: "x", text: "<b>hi</b> & <script>" });
  assert.ok(sent.at(-1).html.includes("&lt;b&gt;hi&lt;/b&gt; &amp; &lt;script&gt;"));
});

await test("a site without Email Sending offers none of it", async () => {
  assert.equal(mail.offered(off), false);
  assert.equal(mail.offered({ ...base, EMAIL: env.EMAIL, EMAIL_FROM: "" }), false, "an empty EMAIL_FROM (a local copy) is off");
  for (const fn of [() => mail.startConfirm(off, "u_ana", "ana@example.com"), () => mail.finishConfirm(off, "u_ana", "abcdefgh", "123456"), () => mail.startRecovery(off, "ana@example.com"), () => mail.finishRecovery(off, "abcdefgh", "123456")])
    await refuses(fn, /doesn't send email/, 404);
});

console.log(`\n${failed ? `${failed} of ${passed + failed} FAILED` : `${passed}/${passed} passed`}`);
process.exit(failed ? 1 : 0);
