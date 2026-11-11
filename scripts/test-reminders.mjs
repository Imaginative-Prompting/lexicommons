// Reminders (src/reminders.ts), rule by rule on a fake clock, in New York's time zone and Amsterdam's: one study
// reminder a day at your time, only on a day you haven't studied and not in a pause; none in quiet hours (dropped, never
// sent late); backing off after 3 unanswered (every other day), stopping after 7 with no goodbye, and back on when you
// study; the daily cap of 2; your AI's notes waiting out quiet hours, one an hour, batched, and off when switched off;
// the week's note on Sunday evening; the wording never a threat; then the whole run on the real migrations (D1 as
// SQLite) with a push service played: the device used last gets it, an ended subscription's row goes, nothing is sent
// without VAPID keys, Send a test reaches this device only (sendTest), a report and a cron run landing inside each other
// both kept (a studied day, the reminder just sent), and turning reminders off on the last device deletes everything
// kept. In Node:
// `node scripts/test-reminders.mjs` (exit 0 = pass).

import { workerEnv } from "./fixtures/worker-env.mjs";

const R = await import("../src/reminders.ts");
const { b64url } = await import("../src/webpush.ts");

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

const NY = "America/New_York";
// A moment by New York's wall clock: 2026-11-04 is a Wednesday.
const at = (date, hhmm, tz = NY) => {
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  const z = R.zoned(guess, tz);
  const offset = Date.parse(`${z.date}T00:00:00Z`) + z.minutes * 60_000 - guess; // the zone's offset at that moment
  return guess - offset;
};
const S = (over = {}) => ({ ...R.DEFAULTS, ...over });
const ST = (over = {}) => ({ ...R.EMPTY_STATE, tz: NY, lang: "Dutch", due: 12, device: "aaaaaaaa", ...over });
const daily = (r) => r.messages.filter((m) => m.kind === "daily");

await test("the zone's own clock and day: 4 am days, summer time ending, Amsterdam six hours on", () => {
  eq(R.zoned(at("2026-11-04", "19:00"), NY).minutes, 19 * 60);
  eq(R.dayIn(at("2026-11-04", "03:30"), NY), "2026-11-03", "before 4 am, the day before");
  eq(R.dayIn(at("2026-11-04", "04:00"), NY), "2026-11-04");
  eq(R.zoned(at("2026-11-04", "19:00"), "Europe/Amsterdam").minutes, 1 * 60, "7 pm in New York is 1 am in Amsterdam");
  ok(R.validZone("Europe/Amsterdam") && !R.validZone("Mars/Olympus") && !R.validZone(42), "zones");
  ok(R.inQuiet(22 * 60, S()) && R.inQuiet(7 * 60 + 59, S()) && !R.inQuiet(8 * 60, S()) && !R.inQuiet(21 * 60 + 29, S()), "quiet hours across midnight");
});

await test("one study reminder a day, at your time, never before it and never twice", () => {
  let r = R.decide(S(), ST(), [], at("2026-11-04", "18:50"));
  eq(daily(r).length, 0, "before its time");
  r = R.decide(S(), ST(), [], at("2026-11-04", "19:05"));
  eq(daily(r).length, 1, "at its time");
  eq(r.messages[0].url, "/app/#study/session/day?from=push");
  const again = R.decide(S(), r.state, [], at("2026-11-04", "19:20"));
  eq(daily(again).length, 0, "twice");
  // A reminder hours late (the cron behind, the phone off) isn't sent.
  eq(daily(R.decide(S(), ST(), [], at("2026-11-04", "22:10"))).length, 0, "hours late");
});

await test("not on a day you've studied, not in a pause, not when switched off", () => {
  eq(daily(R.decide(S(), ST({ studied: ["2026-11-04"] }), [], at("2026-11-04", "19:05"))).length, 0, "studied");
  eq(daily(R.decide(S(), ST({ pauses: [{ from: "2026-11-03", to: "2026-11-06" }] }), [], at("2026-11-04", "19:05"))).length, 0, "paused");
  eq(daily(R.decide(S({ daily: false }), ST(), [], at("2026-11-04", "19:05"))).length, 0, "off");
});

await test("quiet hours: a reminder that would fall in them is dropped, never sent late", () => {
  const s = S({ time: "22:00" });
  let r = R.decide(s, ST(), [], at("2026-11-04", "22:05"));
  eq(daily(r).length, 0, "inside quiet hours");
  r = R.decide(s, r.state, [], at("2026-11-05", "08:05"));
  eq(daily(r).length, 0, "not the next morning");
});

await test("backing off: after 3 unanswered, every other day; after 7, none (no goodbye); studying turns them back on", () => {
  let state = ST();
  const sentOn = [];
  for (let d = 0; d < 30; d++) {
    const date = new Date(Date.UTC(2026, 10, 2 + d)).toISOString().slice(0, 10);
    const r = R.decide(S(), state, [], at(date, "19:05"));
    if (daily(r).length) sentOn.push(d);
    state = r.state;
  }
  // Days 0, 1, 2 (three unanswered), then every other day: 4, 6, 8, 10 (seven in all), then nothing.
  eq(sentOn, [0, 1, 2, 4, 6, 8, 10], "sent on");
  eq(state.ignored, 7);
  // Opening the app doesn't undo a stop; studying today does.
  const opened = R.applyReport(state, { tz: NY }, "aaaaaaaa", at("2026-12-02", "12:00"));
  eq(opened.ignored, 7, "opened only");
  const studied = R.applyReport(state, { tz: NY, studied: ["2026-12-02"] }, "aaaaaaaa", at("2026-12-02", "12:00"));
  eq(studied.ignored, 0, "studied");
  eq(daily(R.decide(S(), studied, [], at("2026-12-03", "19:05"))).length, 1, "back on");
});

await test("a reminder answered (studied that day, or the app opened since) starts the count again", () => {
  let state = ST({ ignored: 2 });
  let r = R.decide(S(), state, [], at("2026-11-04", "19:05"));
  state = R.applyReport(r.state, { tz: NY }, "aaaaaaaa", at("2026-11-04", "20:00")); // opened that evening
  r = R.decide(S(), state, [], at("2026-11-05", "19:05"));
  eq([daily(r).length, r.state.ignored], [1, 0], "answered");
});

await test("at most 2 notifications a day; your AI's notes wait out quiet hours, go one an hour, batched; off means dropped", () => {
  const q = (id, title, minutesAgo = 5, kind = "ai") => ({ id, kind, title, body: `${title}.`, url: `/app/#ai/${id}`, at: at("2026-11-04", "23:00") - minutesAgo * 60_000 });
  // At 11 pm (quiet): it waits.
  let r = R.decide(S(), ST({ studied: ["2026-11-04"] }), [q("a", "Your AI added 20 sentences")], at("2026-11-04", "23:00"));
  eq([r.messages.length, r.done], [0, []], "quiet");
  ok(r.nextAt - at("2026-11-04", "23:00") <= 15 * 60_000, "looks again soon");
  // 8 am: one note, alone as it came.
  r = R.decide(S(), r.state, [q("a", "Your AI added 20 sentences")], at("2026-11-05", "08:05"));
  eq(r.messages.map((m) => [m.kind, m.title, m.url]), [["ai", "Your AI added 20 sentences", "/app/#ai/a"]]);
  // Three more within the hour: batched into one, an hour after the first.
  const three = [q("b", "A pack on trains"), q("c", "A woven chapter"), q("d", "Your theme")];
  let r2 = R.decide(S(), r.state, three, at("2026-11-05", "08:35"));
  eq(r2.messages.length, 0, "within the hour");
  r2 = R.decide(S(), r2.state, three, at("2026-11-05", "09:10"));
  eq([r2.messages.length, r2.messages[0].title, r2.messages[0].body], [1, "Your AI finished some things", "A pack on trains · A woven chapter · Your theme"]);
  // The cap: a study reminder and a note make 2; a third note waits for tomorrow.
  let r3 = R.decide(S({ time: "08:00" }), ST(), [q("e", "One")], at("2026-11-05", "08:05"));
  eq(r3.messages.map((m) => m.kind), ["daily", "ai"], "two");
  r3 = R.decide(S({ time: "08:00" }), r3.state, [q("f", "Two")], at("2026-11-05", "10:05"));
  eq(r3.messages.length, 0, "the cap");
  // Switched off: dropped. Community is off by default.
  const off = R.decide(S({ ai: false }), ST(), [q("g", "x"), q("h", "y", 5, "community")], at("2026-11-05", "10:05"));
  eq([off.messages.length, off.done.sort()], [0, ["g", "h"]]);
});

await test("the week's note: Sunday from 6 pm, once, only when switched on, in plain counts", () => {
  const week = { days: 5, words: 38, chapters: 2 };
  const sunday = at("2026-11-08", "18:30");
  eq(R.decide(S(), ST({ week, studied: ["2026-11-08"] }), [], sunday).messages.length, 0, "off by default");
  const r = R.decide(S({ week: true }), ST({ week, studied: ["2026-11-08"] }), [], sunday);
  eq(r.messages.map((m) => [m.kind, m.title, m.body]), [["week", "This week", "5 days, 38 words more you'd recall, 2 chapters."]]);
  eq(R.decide(S({ week: true }), r.state, [], sunday + 30 * 60_000).messages.length, 0, "once");
});

await test("the words: what's waiting, rotating day to day, your cue as the title; never a loss, a countdown or a threat", () => {
  const seen = new Set();
  for (let d = 0; d < 6; d++) {
    const w = R.reminderWords(ST(), S(), new Date(Date.UTC(2026, 10, 2 + d)).toISOString().slice(0, 10));
    seen.add(w.title);
    ok(!/lose|lost|streak|last chance|miss|before midnight|don't|!$/i.test(`${w.title} ${w.body}`), `a threat: ${w.title} / ${w.body}`);
  }
  ok(seen.size >= 3, "rotates");
  const today = R.reminderWords(ST(), S(), "2026-11-04");
  const tomorrow = R.reminderWords(ST(), S(), "2026-11-05");
  ok(today.title !== tomorrow.title, "the same two days running");
  eq(R.reminderWords(ST(), S({ cue: "After dinner" }), "2026-11-04").title, "After dinner");
  ok(/12 words|12 Dutch words/.test(today.body), today.body);
});

await test("settings and reports: only fields of the type expected; nothing else kept", () => {
  eq(R.readSettings({ daily: "yes", time: "25:00", quietFrom: "22:00", cue: "After\u0000 dinner", ai: false, extra: 1 }), { ...R.DEFAULTS, quietFrom: "22:00", cue: "After dinner", ai: false });
  const s = R.applyReport(R.EMPTY_STATE, { tz: "Europe/Amsterdam", studied: ["2026-11-04", "nope", "2026-11-04"], pauses: [{ from: "2026-11-10", to: "2026-11-01" }, { from: "2026-11-10", to: "2026-11-12" }, "x"], due: -3, lang: "Dutch", week: { days: 2, words: "x", chapters: 0 }, words: ["huis"] }, "bbbbbbbb", 5);
  eq([s.tz, s.studied, s.pauses, s.due, s.lang, s.week, s.device, s.words], ["Europe/Amsterdam", ["2026-11-04"], [{ from: "2026-11-10", to: "2026-11-12" }], 0, "Dutch", null, "bbbbbbbb", undefined]);
});

// ---------- the whole run, on the real migrations ----------

const { env, rows, faults } = workerEnv();
// Another request landing inside one: `env` whose D1 answers the first statement matching `pattern` only once `run()`
// has finished (faults.between starts it there but doesn't wait for it, and a cron run's sends take a while).
const landingInside = (pattern, run) => {
  let pending = run;
  const wrap = (inner, sql) => {
    const wait = async (out) => {
      if (pending && pattern.test(sql)) {
        const other = pending;
        pending = null;
        await other();
      }
      return out;
    };
    return { inner, bind: (...a) => wrap(inner.bind(...a), sql), first: async (...a) => wait(await inner.first(...a)), all: async (...a) => wait(await inner.all(...a)), run: (...a) => inner.run(...a) };
  };
  return { ...env, DB: { prepare: (sql) => wrap(env.DB.prepare(sql), sql), batch: (statements) => env.DB.batch(statements.map((st) => st.inner ?? st)) } };
};
const now0 = at("2026-11-04", "12:00");
await env.DB.prepare("INSERT INTO users (id, name, created_at) VALUES ('u1', 'One', ?), ('u2', 'Two', ?)").bind(now0, now0).run();
const vapidPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const subKeys = async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) };
};
const pushed = [];
let answer = 201;
const service = async (url, init) => (pushed.push({ url, topic: init.headers.Topic, ttl: init.headers.TTL }), new Response(null, { status: answer }));

await test("nothing is sent without VAPID keys", async () => {
  eq(await R.runReminders(env, now0, service), { looked: 0, sent: 0, skipped: "no VAPID keys" });
});

env.VAPID_PRIVATE_JWK = JSON.stringify(await crypto.subtle.exportKey("jwk", vapidPair.privateKey));
env.VAPID_PUBLIC_KEY = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", vapidPair.publicKey)));

await test("subscribing: only a browser's push service and a device id; one subscription per device", async () => {
  const bad = await R.subscribe(env, "u1", { endpoint: "https://evil.example/x", keys: await subKeys(), device: "aaaaaaaa" }, now0);
  eq(bad.ok, false, "a strange endpoint");
  const k1 = await subKeys();
  eq((await R.subscribe(env, "u1", { endpoint: "https://web.push.apple.com/phone-1", keys: k1, device: "aaaaaaaa", report: { tz: NY, lang: "Dutch", due: 9 } }, now0)).ok, true);
  eq((await R.subscribe(env, "u1", { endpoint: "https://fcm.googleapis.com/fcm/send/laptop", keys: await subKeys(), device: "bbbbbbbb" }, now0 + 1000)).ok, true);
  eq((await R.subscribe(env, "u1", { endpoint: "https://web.push.apple.com/phone-2", keys: k1, device: "aaaaaaaa" }, now0 + 2000)).ok, true, "the phone again");
  eq(rows("SELECT device, endpoint FROM push_subscriptions WHERE user_id = 'u1' ORDER BY device").map((r) => r.endpoint), ["https://web.push.apple.com/phone-2", "https://fcm.googleapis.com/fcm/send/laptop"]);
});

await test("Send a test: to this device only, with its own topic; a stranger's device, a bad id, none kept or no keys refused", async () => {
  pushed.length = 0;
  const sent = await R.sendTest(env, "u1", "bbbbbbbb", service, now0 + 3000);
  eq([sent.ok, sent.status, sent.gone], [true, 201, false]);
  eq(pushed.map((p) => [p.url, p.topic, p.ttl]), [["https://fcm.googleapis.com/fcm/send/laptop", "test", "600"]], "the laptop only");
  eq(rows("SELECT ok_at FROM push_subscriptions WHERE device = 'bbbbbbbb'")[0].ok_at, now0 + 3000, "its last good send");
  eq(await R.sendTest(env, "u2", "bbbbbbbb", service), { ok: false, error: "this device has no subscription" }, "another account's device");
  eq(await R.sendTest(env, "u1", "cccccccc", service), { ok: false, error: "this device has no subscription" }, "a device never subscribed");
  for (const bad of ["BBBBBBBB", "bbbb", 42, null, { toString: null }]) eq(await R.sendTest(env, "u1", bad, service), { ok: false, error: "can't send" }, `device ${JSON.stringify(bad)}`);
  const keys = [env.VAPID_PRIVATE_JWK, env.VAPID_PUBLIC_KEY];
  delete env.VAPID_PRIVATE_JWK;
  eq(await R.sendTest(env, "u1", "bbbbbbbb", service), { ok: false, error: "can't send" }, "no VAPID keys");
  [env.VAPID_PRIVATE_JWK, env.VAPID_PUBLIC_KEY] = keys;
  eq(pushed.length, 1, "nothing else sent");
});

await test("Send a test to a subscription that ended: its row goes; a failing push service keeps it and counts the failure", async () => {
  await env.DB.prepare("INSERT INTO users (id, name, created_at) VALUES ('u3', 'Three', ?)").bind(now0).run();
  eq((await R.subscribe(env, "u3", { endpoint: "https://fcm.googleapis.com/fcm/send/three-gone", keys: await subKeys(), device: "dddddddd" }, now0)).ok, true);
  eq((await R.subscribe(env, "u3", { endpoint: "https://fcm.googleapis.com/fcm/send/three-down", keys: await subKeys(), device: "eeeeeeee" }, now0)).ok, true);
  answer = 404;
  const gone = await R.sendTest(env, "u3", "dddddddd", service, now0 + 4000);
  eq([gone.ok, gone.status, gone.gone], [false, 404, true]);
  answer = 500;
  const down = await R.sendTest(env, "u3", "eeeeeeee", service, now0 + 4000);
  eq([down.ok, down.status, down.gone], [false, 500, false]);
  answer = 201;
  eq(rows("SELECT device, fails, failed_at FROM push_subscriptions WHERE user_id = 'u3'"), [{ device: "eeeeeeee", fails: 1, failed_at: now0 + 4000 }]);
  await R.unsubscribe(env, "u3", "eeeeeeee");
  eq([rows("SELECT * FROM push_subscriptions WHERE user_id = 'u3'").length, rows("SELECT * FROM reminders WHERE user_id = 'u3'").length], [0, 0]);
});

await test("the cron: the device used last gets the day's reminder, with its topic and a short TTL", async () => {
  // The phone reports last (it studied nothing today yet).
  eq((await R.report(env, "u1", { device: "aaaaaaaa", tz: NY, studied: ["2026-11-03"], due: 9, lang: "Dutch" }, now0 + 5000)).ok, true);
  pushed.length = 0;
  const r = await R.runReminders(env, at("2026-11-04", "19:05"), service);
  eq([r.looked >= 1, r.sent], [true, 1]);
  eq(pushed.map((p) => [p.url, p.topic, p.ttl]), [["https://web.push.apple.com/phone-2", "daily", "10800"]]);
  // The next look is about a day on, and a second run sends nothing.
  pushed.length = 0;
  eq((await R.runReminders(env, at("2026-11-04", "19:20"), service)).sent, 0);
});

await test("your AI's note, queued from the server's side, goes with the next run; an ended subscription's row goes", async () => {
  ok(await R.enqueue(env, "u1", "ai", { title: "Your AI added 20 sentences", body: "About trains.", url: "/app/#ai" }, at("2026-11-05", "09:00")), "queued");
  ok(!(await R.enqueue(env, "u2", "ai", { title: "x", body: "y", url: "/app/" })), "nothing kept for an account without reminders");
  answer = 410;
  pushed.length = 0;
  await R.runReminders(env, at("2026-11-05", "09:05"), service);
  eq(pushed.length, 1, "tried");
  eq(rows("SELECT endpoint FROM push_subscriptions WHERE user_id = 'u1'").map((r) => r.endpoint), ["https://fcm.googleapis.com/fcm/send/laptop"], "the ended one went");
  eq(rows("SELECT id FROM push_queue WHERE user_id = 'u1'").length, 0, "the note isn't sent twice");
  answer = 201;
});

await test("a report never brings back settings saved while it ran; a save keeps a report's days and clears the unanswered count", async () => {
  eq((await R.setSettings(env, "u1", { time: "07:30", community: true })).ok, true);
  // Another request saves new settings right after the report reads the row, before it writes.
  const inside = landingInside(/SELECT [^;]*state[^;]* FROM reminders WHERE user_id = \?/, () => R.setSettings(env, "u1", { time: "06:45", community: true }));
  eq((await R.report(inside, "u1", { device: "bbbbbbbb", tz: NY, studied: ["2026-11-05"], due: 3, lang: "Dutch" }, at("2026-11-05", "12:00"))).ok, true);
  eq((await R.getReminders(env, "u1")).settings.time, "06:45", "the settings saved while the report ran");
  const stateOf = () => JSON.parse(rows("SELECT state FROM reminders WHERE user_id = 'u1'")[0].state);
  eq(stateOf().studied.includes("2026-11-05"), true, "the report's day");
  await env.DB.prepare("UPDATE reminders SET state = json_set(state, '$.ignored', 5) WHERE user_id = 'u1'").run();
  eq((await R.setSettings(env, "u1", { time: "06:45", community: true })).ok, true);
  eq([stateOf().ignored, stateOf().studied.includes("2026-11-05")], [0, true], "cleared, the days kept");
});

await test("a report landing inside a cron run keeps its studied day: no reminder that evening", async () => {
  const D = "2026-11-06";
  await env.DB.prepare("INSERT INTO users (id, name, created_at) VALUES ('u6', 'Six', ?)").bind(now0).run();
  eq((await R.subscribe(env, "u6", { endpoint: "https://fcm.googleapis.com/fcm/send/six", keys: await subKeys(), device: "66666666", report: { tz: NY, lang: "Dutch", due: 5, studied: [] } }, at(D, "11:00"))).ok, true);
  // The cron reads every row due, then the phone reports today studied, then the cron writes what it worked out.
  await R.runReminders(landingInside(/FROM reminders WHERE next_at <= \?/, () => R.report(env, "u6", { device: "66666666", tz: NY, studied: [D], due: 0, lang: "Dutch" }, at(D, "12:00") + 1)), at(D, "12:00"), service);
  eq(JSON.parse(rows("SELECT state FROM reminders WHERE user_id = 'u6'")[0].state).studied, [D], "the studied day");
  pushed.length = 0;
  await R.runReminders(env, at(D, "19:05"), service);
  eq(pushed.filter((p) => p.url.endsWith("/six")).length, 0, "a reminder on a day already studied");
});

await test("a cron run landing inside a report keeps the reminder it sent: never a second that day", async () => {
  const D = "2026-11-06";
  await env.DB.prepare("INSERT INTO users (id, name, created_at) VALUES ('u7', 'Seven', ?)").bind(now0).run();
  eq((await R.subscribe(env, "u7", { endpoint: "https://fcm.googleapis.com/fcm/send/seven", keys: await subKeys(), device: "77777777", report: { tz: NY, lang: "Dutch", due: 5, studied: [] } }, at(D, "11:00"))).ok, true);
  pushed.length = 0;
  // The phone's report reads the row, then the cron sends today's reminder, then the report writes what it worked out.
  const inside = landingInside(/SELECT [^;]*state[^;]* FROM reminders WHERE user_id = \?/, () => R.runReminders(env, at(D, "19:05"), service));
  eq((await R.report(inside, "u7", { device: "77777777", tz: NY, studied: [], due: 5, lang: "Dutch" }, at(D, "19:05") + 1)).ok, true);
  eq(pushed.filter((p) => p.url.endsWith("/seven")).length, 1, "today's reminder");
  eq(JSON.parse(rows("SELECT state FROM reminders WHERE user_id = 'u7'")[0].state).lastReminder, D, "the reminder kept");
  await R.runReminders(env, at(D, "19:20"), service);
  eq(pushed.filter((p) => p.url.endsWith("/seven")).length, 1, "a second reminder the same day");
  for (const [user, device] of [["u6", "66666666"], ["u7", "77777777"]]) await R.unsubscribe(env, user, device);
});

await test("settings round trip; turning reminders off on the last device deletes everything kept", async () => {
  eq((await R.setSettings(env, "u2", { daily: false })).ok, false, "no reminders, no settings");
  const set = await R.setSettings(env, "u1", { time: "07:30", community: true });
  eq([set.ok, set.settings.time, set.settings.community], [true, "07:30", true]);
  const got = await R.getReminders(env, "u1");
  eq([got.on, got.settings.time, got.devices], [true, "07:30", ["bbbbbbbb"]]);
  await R.unsubscribe(env, "u1", "bbbbbbbb");
  eq([rows("SELECT * FROM push_subscriptions").length, rows("SELECT * FROM reminders").length, rows("SELECT * FROM push_queue").length], [0, 0, 0]);
  eq((await R.getReminders(env, "u1")).on, false);
});

// ---------- a big evening (RUN): thousands due at once, sent in one run, a few at a time, in a handful of queries ----------

const BIG = 1200;
const bigDay = "2026-11-09";
// D1 as the run sees it, counting what's a query against the 1,000 a run may make (a batch is one).
const counted = () => {
  const n = { queries: 0, batches: 0 };
  const wrap = (st) => ({ inner: st, bind: (...a) => wrap(st.bind(...a)), all: (...a) => (n.queries++, st.all(...a)), first: (...a) => (n.queries++, st.first(...a)), run: (...a) => (n.queries++, st.run(...a)) });
  return { n, env: { ...env, DB: { prepare: (sql) => wrap(env.DB.prepare(sql)), batch: (list) => (n.queries++, n.batches++, env.DB.batch(list.map((st) => st.inner ?? st))) } } };
};
// A push service that takes a moment, keeping count of how many wait on it at once.
const slowService = (latency = 4) => {
  const seen = { calls: 0, most: 0, now: 0, urls: [] };
  const fn = async (url, init) => {
    seen.calls++;
    seen.now++;
    seen.most = Math.max(seen.most, seen.now);
    seen.urls.push(url);
    await new Promise((r) => setTimeout(r, latency));
    seen.now--;
    return new Response(null, { status: url.endsWith("/gone") ? 410 : 201 });
  };
  return { seen, fn };
};
const bigIds = [];
await test(`a big evening: ${BIG} accounts due at once all sent in one run, ${R.RUN.atOnce} at a time, in a handful of queries; the old 500 the control`, async () => {
  const sub = await subKeys();
  for (let i = 0; i < BIG; i++) {
    const id = `big${String(i).padStart(4, "0")}`;
    bigIds.push(id);
    await env.DB.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").bind(id, id, now0).run();
    const device = (0x10000000 + i).toString(16);
    eq((await R.subscribe(env, id, { endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: sub, device, report: { tz: NY, lang: "Dutch", due: 5, studied: [] } }, at(bigDay, "11:00"))).ok, true);
  }
  // The control: a run held to the old 500 leaves the rest due, so this test sees a run that stops short.
  const most = R.RUN.most;
  R.RUN.most = 500;
  const held = slowService();
  const first = await R.runReminders(env, at(bigDay, "19:05"), held.fn);
  R.RUN.most = most;
  eq([first.looked, first.sent], [500, 500], "a run of 500");
  const left = rows(`SELECT COUNT(*) AS n FROM reminders WHERE user_id LIKE 'big%' AND json_extract(state, '$.lastReminder') IS NULL`)[0].n;
  eq(left, BIG - 500, "the rest still waiting");
  // The run as it is: everyone left, in one run.
  const { n, env: countedEnv } = counted();
  const service = slowService();
  const r = await R.runReminders(countedEnv, at(bigDay, "19:05"), service.fn);
  eq([r.looked, r.sent], [BIG - 500, BIG - 500], "every one left, in one run");
  eq(rows(`SELECT COUNT(*) AS n FROM reminders WHERE user_id LIKE 'big%' AND json_extract(state, '$.lastReminder') = '${bigDay}'`)[0].n, BIG, "each account's reminder kept");
  eq(new Set([...held.seen.urls, ...service.seen.urls]).size, BIG, "each account sent to once");
  eq(service.seen.most, R.RUN.atOnce, `${R.RUN.atOnce} waiting at once`);
  // Per batch of 500: its read, its notes and devices, a write per 50: 13 queries; the old run made 4 an account (2,800 here).
  ok(n.queries <= Math.ceil((BIG - 500) / R.RUN.batch) * 3 + Math.ceil((BIG - 500) / R.RUN.writeEvery) + 2, `queries: ${JSON.stringify(n)}`);
  eq((await R.runReminders(env, at(bigDay, "19:20"), service.fn)).sent, 0, "nothing sent twice");
  return `${BIG - 500} sent in ${n.queries} queries (${n.batches} writes), ${service.seen.most} at once`;
});

await test("a run out of time stops between groups: the rest stays due for the next run, nothing sent twice", async () => {
  const day = "2026-11-10";
  const service = slowService(1);
  let calls = 0;
  // A clock that runs out once the first group is through.
  const clock = () => (calls++ < 3 ? 0 : R.RUN.budgetMs + 1);
  const r = await R.runReminders(env, at(day, "19:05"), service.fn, clock);
  eq([r.looked, r.sent], [R.RUN.writeEvery, R.RUN.writeEvery], "one group");
  const rest = await R.runReminders(env, at(day, "19:10"), service.fn);
  eq(r.sent + rest.sent, BIG, "the rest on the next run");
  eq(new Set(service.seen.urls).size, BIG, "each account sent to once");
});

await test("a push service that can't be reached counts as a failed send; the run goes on; an ended one's row goes", async () => {
  const day = "2026-11-11";
  const ids = bigIds.slice(0, 3);
  await env.DB.prepare("UPDATE push_subscriptions SET endpoint = 'https://fcm.googleapis.com/fcm/send/gone' WHERE user_id = ?").bind(ids[1]).run();
  const tried = [];
  const service = async (url) => {
    tried.push(url);
    if (url.endsWith(ids[0])) throw new TypeError("fetch failed");
    return new Response(null, { status: url.endsWith("/gone") ? 410 : 201 });
  };
  await env.DB.prepare(`UPDATE reminders SET next_at = ? WHERE user_id NOT IN (SELECT value FROM json_each(?))`).bind(at(day, "23:00"), JSON.stringify(ids)).run();
  const r = await R.runReminders(env, at(day, "19:05"), service);
  eq(r.sent, 1, "the third one went");
  eq(tried.length, 3, "all three tried");
  eq(rows(`SELECT fails FROM push_subscriptions WHERE user_id = '${ids[0]}'`)[0].fails, 1, "the unreachable one counted");
  eq(rows(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = '${ids[1]}'`)[0].n, 0, "the ended one's row");
});

await test("a new account's reminder time is the one its device gives (a new learner's first session, push.js startTime); a second device's never moves it; one that isn't a time is 19:00", async () => {
  await env.DB.prepare("INSERT INTO users (id, name, created_at) VALUES ('t1', 'T', ?), ('t2', 'T', ?)").bind(now0, now0).run();
  const k = await subKeys();
  eq((await R.subscribe(env, "t1", { endpoint: "https://fcm.googleapis.com/fcm/send/t1a", keys: k, device: "aaaa0001", time: "14:00" }, now0)).ok, true);
  eq((await R.getReminders(env, "t1")).settings.time, "14:00", "the device's time");
  eq((await R.subscribe(env, "t1", { endpoint: "https://fcm.googleapis.com/fcm/send/t1b", keys: k, device: "aaaa0002", time: "09:00" }, now0)).ok, true);
  eq((await R.getReminders(env, "t1")).settings.time, "14:00", "a second device kept the account's");
  eq((await R.subscribe(env, "t2", { endpoint: "https://fcm.googleapis.com/fcm/send/t2", keys: k, device: "aaaa0003", time: "25:99" }, now0)).ok, true);
  eq((await R.getReminders(env, "t2")).settings.time, "19:00", "not a time");
  for (const [u, d] of [["t1", "aaaa0001"], ["t1", "aaaa0002"], ["t2", "aaaa0003"]]) await R.unsubscribe(env, u, d);
  for (const id of bigIds) await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM reminders WHERE user_id LIKE 'big%'").run();
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
