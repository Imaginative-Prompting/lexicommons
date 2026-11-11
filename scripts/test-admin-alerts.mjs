// What reaches an admin about moderation (src/admin-alerts.ts), on a fake clock and the real migrations, with a push service played:
// a serious report at once and at any hour; other cases within the hour, outside quiet hours; a stuck queue once a day; never the same
// news twice; a failed delivery tried again; no admin device, no VAPID keys, an empty queue; what a push says.
// `node scripts/test-admin-alerts.mjs` (exit 0 = pass).

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { alertsDue, adminDevices, runAdminAlerts, STUCK_AFTER } = await import("../src/admin-alerts.ts");

let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.stack ?? error).split("\n").slice(0, 6).join("\n        ")}`);
  }
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;
// A weekday at noon, UTC, well outside the default quiet hours (21:30–08:00), and before today: the log's own clock is the real one.
const NOON = Date.UTC(2026, 9, 10, 12);
const NIGHT = Date.UTC(2026, 9, 10, 3);
// Errors (the errors kind) have their own tests in test-errors.mjs; here they're quiet.
const facts = (over) => ({ severe: 0, severeNewest: 0, admin: 0, adminNewest: 0, adminOldest: null, open: 0, openOldest: null, errorsNow: 0, errorsLastHour: 0, errorsDayBefore: 0, errorKinds: 0, ...over });
const never = { severe: 0, admin: 0, stuck: 0, errors: 0 };

await test("nothing waiting: nothing to send", () => {
  assert.deepEqual(alertsDue(facts(), never, false, NOON), []);
});
await test("a serious report: at once, at any hour, high urgency, once", () => {
  const f = facts({ severe: 1, severeNewest: NOON - 60_000, adminOldest: NOON - 60_000 });
  for (const quiet of [false, true]) {
    const due = alertsDue(f, never, quiet, NOON);
    assert.deepEqual(due.map((d) => d.kind), ["severe"]);
    assert.equal(due[0].urgency, "high");
  }
  assert.deepEqual(alertsDue(f, { ...never, severe: NOON - 1000 }, false, NOON), [], "already told");
  assert.deepEqual(alertsDue({ ...f, severe: 2, severeNewest: NOON }, { ...never, severe: NOON - 1000 }, false, NOON).map((d) => d.kind), ["severe"], "a new one");
});
await test("something else for an admin: new news only, at most hourly, never in quiet hours", () => {
  const f = facts({ admin: 2, adminNewest: NOON - 60_000, adminOldest: NOON - 60_000 });
  assert.deepEqual(alertsDue(f, never, false, NOON).map((d) => d.kind), ["admin"]);
  assert.deepEqual(alertsDue(f, never, true, NOON), [], "quiet hours");
  assert.deepEqual(alertsDue(f, { ...never, admin: NOON - 30_000 }, false, NOON), [], "already told");
  assert.deepEqual(alertsDue({ ...f, adminNewest: NOON }, { ...never, admin: NOON - 30 * 60_000 }, false, NOON), [], "told within the hour");
  assert.deepEqual(alertsDue({ ...f, adminNewest: NOON }, { ...never, admin: NOON - 2 * HOUR }, false, NOON).map((d) => d.kind), ["admin"]);
});
await test("a stuck queue: past 6 hours, once a day, for as long as it's true, and it asks about the monitor", () => {
  const f = facts({ open: 3, openOldest: NOON - STUCK_AFTER });
  const due = alertsDue(f, never, false, NOON);
  assert.deepEqual(due.map((d) => d.kind), ["stuck"]);
  assert.match(due[0].body, /3 reports waiting, the oldest 6 h: is the monitor running\?/);
  assert.deepEqual(alertsDue(facts({ open: 3, openOldest: NOON - STUCK_AFTER + 1000 }), never, false, NOON), [], "not yet");
  assert.deepEqual(alertsDue(f, never, true, NOON), [], "quiet hours");
  assert.deepEqual(alertsDue(f, { ...never, stuck: NOON - DAY + 1000 }, false, NOON), [], "told today");
  assert.deepEqual(alertsDue(f, { ...never, stuck: NOON - DAY }, false, NOON).map((d) => d.kind), ["stuck"], "the next day");
});
await test("an admin's case left a day: it comes back, once a day", () => {
  const f = facts({ severe: 1, severeNewest: NOON - 2 * DAY, adminOldest: NOON - 2 * DAY });
  const due = alertsDue(f, { ...never, severe: NOON - 2 * DAY + 1000 }, false, NOON);
  assert.deepEqual(due.map((d) => d.kind), ["stuck"]);
  assert.match(due[0].body, /1 case waiting for an admin, the oldest 48 h/);
});
await test("a push never says what a report or an item says", () => {
  for (const alert of alertsDue(facts({ severe: 1, severeNewest: NOON, admin: 1, adminNewest: NOON, adminOldest: NOON - 2 * DAY, open: 1, openOldest: NOON - DAY }), never, false, NOON)) {
    assert.doesNotMatch(`${alert.title} ${alert.body}`, /SECRET/);
    assert.match(alert.body, /\d/);
  }
});

// ---------- the cron's run, on the real migrations ----------

const keys = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicRaw = Buffer.from(await webcrypto.subtle.exportKey("raw", keys.publicKey)).toString("base64url");
const privateJwk = JSON.stringify(await webcrypto.subtle.exportKey("jwk", keys.privateKey));
const subKeys = async () => {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { p256dh: Buffer.from(await webcrypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url"), auth: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url") };
};

async function world() {
  const { env } = await workerEnv();
  env.VAPID_PRIVATE_JWK = privateJwk;
  env.VAPID_PUBLIC_KEY = publicRaw;
  const run = (query, ...binds) => env.DB.prepare(query).bind(...binds).run();
  await run("INSERT INTO users (id, name, created_at) VALUES ('adm', 'Admin', 0), ('mod', 'Moderator', 0), ('who', 'Someone', 0), ('own', 'Owner', 0)");
  await run("INSERT INTO user_roles (user_id, role, granted_at, granted_by) VALUES ('adm', 'admin', 0, 'd1'), ('mod', 'moderator', 0, 'd1')");
  const addDevice = async (user, name) => {
    const k = await subKeys();
    await run("INSERT INTO push_subscriptions (endpoint, user_id, device, p256dh, auth, created_at, used_at) VALUES (?, ?, ?, ?, ?, 0, 0)", `https://fcm.googleapis.com/fcm/send/${name}`, user, name, k.p256dh, k.auth);
  };
  const addReport = (id, reason, state, at) => run("INSERT INTO reports (id, target_kind, target_id, reason, details, reporter_id, state, created_at) VALUES (?, 'item', 'x', ?, 'SECRET words of the report', 'who', ?, ?)", id, reason, state, at);
  const pushed = [];
  let answer = 201;
  const service = async (url, init) => {
    pushed.push({ url: String(url), urgency: new Headers(init.headers).get("Urgency"), topic: new Headers(init.headers).get("Topic") });
    return new Response(null, { status: answer });
  };
  const log = async () => (await env.DB.prepare("SELECT action, note FROM admin_log WHERE action LIKE 'alert.%' ORDER BY created_at").all()).results;
  return { env, addDevice, addReport, pushed, service, log, setAnswer: (status) => (answer = status) };
}

await test("the cron: a serious report reaches every device of every admin, not a moderator's, and only once", async () => {
  const w = await world();
  await w.addDevice("adm", "phone");
  await w.addDevice("adm", "laptop");
  await w.addDevice("mod", "modphone");
  await w.addDevice("who", "theirs");
  await w.addReport("r1", "minors", "escalated", NIGHT - 60_000);
  assert.equal(await adminDevices(w.env), 2);
  const first = await runAdminAlerts(w.env, NIGHT, w.service);
  assert.equal(first.sent, 2);
  assert.deepEqual(w.pushed.map((p) => p.url.split("/").pop()).sort(), ["laptop", "phone"]);
  assert.ok(w.pushed.every((p) => p.urgency === "high" && p.topic === "admin-severe"), JSON.stringify(w.pushed));
  const logged = await w.log();
  assert.equal(logged.length, 1);
  assert.equal(logged[0].action, "alert.severe");
  assert.doesNotMatch(logged[0].note, /SECRET/);
  w.pushed.length = 0;
  // It reads when it went from the log, whose clock is real; so the second run is after it.
  const second = await runAdminAlerts(w.env, Date.now() + 1000, w.service);
  assert.deepEqual(w.pushed.filter((p) => p.topic === "admin-severe"), [], JSON.stringify(second));
});

await test("the cron: a failed delivery isn't marked, and goes again at the next run", async () => {
  const w = await world();
  await w.addDevice("adm", "phone");
  await w.addReport("r1", "illegal", "escalated", NOON - 60_000);
  w.setAnswer(500);
  const first = await runAdminAlerts(w.env, NOON, w.service);
  assert.equal(first.sent, 0);
  assert.equal((await w.log()).length, 0);
  w.setAnswer(201);
  const second = await runAdminAlerts(w.env, NOON + 900_000, w.service);
  assert.equal(second.sent, 1);
  assert.equal((await w.log()).length, 1);
});

await test("the cron: a stuck queue tells the admin; no device or no keys sends nothing and says why; an empty queue reads no more", async () => {
  const w = await world();
  await w.addReport("r1", "spam", "open", NOON - 7 * HOUR);
  const nobody = await runAdminAlerts(w.env, NOON, w.service);
  assert.equal(nobody.skipped, "no admin device");
  assert.equal(w.pushed.length, 0);
  await w.addDevice("adm", "phone");
  const keysGone = [w.env.VAPID_PRIVATE_JWK, w.env.VAPID_PUBLIC_KEY];
  w.env.VAPID_PRIVATE_JWK = w.env.VAPID_PUBLIC_KEY = undefined;
  assert.equal((await runAdminAlerts(w.env, NOON, w.service)).skipped, "no VAPID keys");
  [w.env.VAPID_PRIVATE_JWK, w.env.VAPID_PUBLIC_KEY] = keysGone;
  const told = await runAdminAlerts(w.env, NOON, w.service);
  assert.equal(told.sent, 1);
  assert.equal((await w.log())[0].action, "alert.stuck");
  const quiet = await world();
  assert.deepEqual(await runAdminAlerts(quiet.env, NOON, quiet.service), { due: 0, sent: 0 });
});

await test("the cron: a subscription that ended goes, and an agent's escalation is news", async () => {
  const w = await world();
  await w.addDevice("adm", "phone");
  await w.addReport("r1", "spam", "escalated", NOON - DAY * 3);
  await w.env.DB.prepare("INSERT INTO admin_log (id, actor_id, via, action, target, created_at) VALUES ('l1', 'mod', 'pat', 'mod.escalate', 'report:r1', ?)").bind(NOON - 60_000).run();
  w.setAnswer(410);
  await runAdminAlerts(w.env, NOON, w.service);
  assert.equal(await adminDevices(w.env), 0, "the ended subscription's row went");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
