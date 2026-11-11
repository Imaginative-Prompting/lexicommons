// The server's overload tried again, and a connection's return spread out (public/js/lx/retry.js), with fetch, the clock and the
// window's events stood in: which answers are tried again (only 503 + Retry-After + code "overloaded"; a read, an idempotent write,
// another write only when not applied), how many times, each wait (the Retry-After plus a random part of its window, spread across
// it), never offline, past MAX_RETRY_AFTER, a body that can't be sent twice, or a stopped request; onReconnect's 0–30 s, once per
// return, cancelled by going offline again. Then the files: the start's calls and the polls go through it, and the background's
// `online` listeners through onReconnect. Each rule catches a plant first. Usage: node scripts/test-retry.mjs (exit 0 = pass)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};

// ---------- stand-ins ----------
const realSetTimeout = setTimeout;
let waits = [];
let pending = [];
globalThis.setTimeout = (fn, ms = 0) => {
  const timer = { fn, ms, cleared: false };
  waits.push(ms);
  pending.push(timer);
  queueMicrotask(() => !timer.cleared && !timer.held && fn());
  return timer;
};
globalThis.clearTimeout = (timer) => timer && (timer.cleared = true);
const events = new EventTarget();
globalThis.addEventListener = events.addEventListener.bind(events);
globalThis.removeEventListener = events.removeEventListener.bind(events);
let online = true;
Object.defineProperty(globalThis, "navigator", { value: { get onLine() { return online; } }, configurable: true });

const { fetchRetrying, onReconnect, jittered, RETRIES, WINDOWS, MAX_RETRY_AFTER, RECONNECT_SPREAD, POLL_SPREAD } = await import(join(ROOT, "public/js/lx/retry.js"));

const overloaded = (extra = {}, headers = { "Retry-After": "1" }) =>
  new Response(JSON.stringify({ error: "Lexicommons is very busy for a moment. Try again in a few seconds.", code: "overloaded", ...extra }), {
    status: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
const ok = () => new Response(JSON.stringify({ fine: true }), { status: 200, headers: { "Content-Type": "application/json" } });

/** Runs one request against a script of answers; what was sent, the waits, and what came back. */
async function run(answers, init = {}, options = {}, input = "/api/me") {
  const sent = [];
  waits = [];
  let i = 0;
  globalThis.fetch = async (what, how = {}) => {
    sent.push({ what, method: how.method ?? (what instanceof Request ? what.method : "GET"), body: how.body });
    const next = answers[Math.min(i++, answers.length - 1)];
    return typeof next === "function" ? next() : next;
  };
  let result, error;
  try {
    result = await fetchRetrying(input, init, options);
  } catch (e) {
    error = e;
  }
  return { sent, waits: [...waits], result, error };
}
const inWindow = (wait, n) => wait >= 1000 && wait < 1000 + WINDOWS[n];

// ---------- what's tried again ----------
{
  const r = await run([overloaded, overloaded, ok]);
  check(r.sent.length === 3 && r.result.status === 200, "a read refused twice by the overload is tried again and answered (3 tries)");
  check(r.waits.length === 2 && r.waits.every((w, n) => inWindow(w, n)), `each wait is Retry-After plus its window's random part: ${r.waits.map(Math.round)}`);
}
{
  const r = await run([overloaded]);
  check(r.sent.length === 1 + RETRIES && r.result.status === 503, `refused every time: ${1 + RETRIES} tries, then the last refusal comes back as it is`);
  const said = await r.result.json().catch(() => null);
  check(said?.code === "overloaded", "the refusal handed back can still be read by its caller");
}
for (const [what, answer] of [
  ["a 503 with no Retry-After (the gate's)", () => new Response("The site gate is not configured.", { status: 503 })],
  ["a 503 that isn't the overload (an OAuth endpoint's)", () => new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503, headers: { "Retry-After": "1" } })],
  ["the overload with no Retry-After", () => overloaded({}, {})],
  [`the overload asking for more than ${MAX_RETRY_AFTER} s`, () => overloaded({}, { "Retry-After": String(MAX_RETRY_AFTER + 1) })],
  ["the overload with a date for its Retry-After", () => overloaded({}, { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" })],
  ["a 500", () => new Response(JSON.stringify({ error: "x", code: "overloaded" }), { status: 500, headers: { "Retry-After": "1" } })],
  ["a 429", () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "Retry-After": "1" } })],
]) {
  const r = await run([answer, ok]);
  check(r.sent.length === 1 && r.result.status !== 200, `not tried again: ${what}`);
}
{
  const r = await run([() => overloaded(), ok], { method: "POST", body: "{}" });
  check(r.sent.length === 1, "a write refused with nothing said about it is never tried again");
  const a = await run([() => overloaded({ applied: false }), ok], { method: "POST", body: '{"x":1}' });
  check(a.sent.length === 2 && a.result.status === 200 && a.sent[1].body === '{"x":1}', "a write the server says wasn't applied is sent again, the same body");
  const t = await run([() => overloaded({ applied: true }), ok], { method: "POST", body: "{}" });
  check(t.sent.length === 1, "a write marked applied is never sent again");
  const p = await run([() => overloaded(), ok], { method: "PUT", body: "{}" }, { idempotent: true });
  check(p.sent.length === 2 && p.result.status === 200, "an idempotent write (the device's state) is tried again with nothing said");
  const q = await run([() => overloaded(), ok], { method: "PUT", body: "{}" });
  check(q.sent.length === 1, "a PUT nobody called idempotent isn't");
  const d = await run([() => overloaded(), ok], { method: "DELETE" });
  check(d.sent.length === 1, "a DELETE isn't (a second one can answer 404 for the first)");
  const s = await run([() => overloaded({ applied: false }), ok], { method: "POST", body: new ReadableStream() });
  check(s.sent.length === 1, "a body that can't be sent twice isn't");
  const req = await run([() => overloaded(), ok], {}, {}, new Request("http://x/api/me"));
  check(req.sent.length === 2 && req.result.status === 200, "a Request with no body is tried again as a read");
}
{
  online = false;
  const r = await run([() => overloaded(), ok]);
  online = true;
  check(r.sent.length === 1, "never tried again while offline");
}
{
  // Stopped while it waits: the wait never ends on its own (held), and the stop rejects it, with nothing sent again.
  const stop = new AbortController();
  const realQueue = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => {
    const timer = { fn, ms, cleared: false, held: true };
    waits.push(ms);
    return timer;
  };
  const waiting = run([() => overloaded(), ok], { signal: stop.signal });
  await new Promise((r) => realSetTimeout(r, 20));
  stop.abort();
  const r = await waiting;
  globalThis.setTimeout = realQueue;
  check(r.error?.name === "AbortError" && r.sent.length === 1, "a request stopped while it waits stops: AbortError, nothing sent again");
}

// ---------- the waits are spread ----------
// Full jitter: over many refusals, a try's waits fill its window, so apps refused together don't come back together.
const spread = (list, from, width) => {
  const buckets = new Array(10).fill(0);
  for (const w of list) buckets[Math.min(9, Math.floor(((w - from) / width) * 10))]++;
  return buckets.every((n) => n > 0) && list.every((w) => w >= from && w < from + width);
};
check(!spread(new Array(400).fill(1000 + WINDOWS[0] / 2), 1000, WINDOWS[0]), "PLANT: waits all the same are caught as not spread");
check(!spread(Array.from({ length: 400 }, (_, i) => 1000 + (i % 2) * 10), 1000, WINDOWS[0]), "PLANT: waits in one corner of the window are caught");
{
  const first = [];
  const third = [];
  for (let i = 0; i < 400; i++) {
    const r = await run([() => overloaded(), () => overloaded(), () => overloaded(), ok]);
    first.push(r.waits[0]);
    third.push(r.waits[2]);
  }
  check(spread(first, 1000, WINDOWS[0]), `the first waits fill 1–${(1000 + WINDOWS[0]) / 1000} s`);
  check(spread(third, 1000, WINDOWS[2]), `the third waits fill 1–${(1000 + WINDOWS[2]) / 1000} s`);
}

// ---------- a poll's wait ----------
{
  const minute = Array.from({ length: 1000 }, () => jittered(60_000));
  check(POLL_SPREAD === 0.1 && minute.every((w) => w >= 54_000 && w <= 66_000), `a minute's poll waits 54–66 s: ${Math.round(Math.min(...minute))}–${Math.round(Math.max(...minute))} ms`);
  check(spread(minute, 54_000, 12_000), "and fills it, so apps started together drift apart");
  check(!spread(new Array(1000).fill(60_000), 54_000, 12_000), "PLANT: every wait a minute exactly is caught");
}

// ---------- a connection's return ----------
{
  pending = [];
  waits = [];
  let ran = 0;
  const stop = onReconnect(() => ran++);
  let other = 0;
  onReconnect(() => {
    other++;
    throw new Error("one that fails");
  });
  let third = 0;
  onReconnect(() => third++);
  // Hold the timers, to see what's waiting.
  const held = [];
  globalThis.setTimeout = (fn, ms = 0) => {
    const timer = { fn, ms, cleared: false };
    held.push(timer);
    return timer;
  };
  events.dispatchEvent(new Event("online"));
  check(ran === 0 && held.length === 1 && held[0].ms >= 0 && held[0].ms < RECONNECT_SPREAD, `back online: nothing at once, one wait of ${Math.round(held[0]?.ms ?? -1)} ms (under ${RECONNECT_SPREAD})`);
  events.dispatchEvent(new Event("online"));
  check(held.length === 1, "a second online while it waits adds no second wait");
  held[0].fn();
  check(ran === 1 && other === 1 && third === 1, "after the wait every one runs once, one that throws keeping none from running");
  // The throw comes back as the page's error, later (not lost).
  let thrown = null;
  try {
    held[1]?.fn();
  } catch (error) {
    thrown = error;
  }
  check(held.length === 2 && thrown?.message === "one that fails", "the one that threw is thrown again on its own, for the page's error reports");
  held.length = 0;
  events.dispatchEvent(new Event("online"));
  events.dispatchEvent(new Event("offline"));
  check(held[0]?.cleared === true, "offline again before the wait ends: nothing runs");
  held.length = 0;
  stop();
  events.dispatchEvent(new Event("online"));
  held[0].fn();
  check(ran === 1 && third === 2, "one stopped doesn't run; the others do");
  // Spread across apps: 1,000 returns' waits fill 0–30 s.
  const draws = [];
  for (let i = 0; i < 1000; i++) {
    held.length = 0;
    events.dispatchEvent(new Event("offline"));
    events.dispatchEvent(new Event("online"));
    draws.push(held[0].ms);
  }
  check(spread(draws, 0, RECONNECT_SPREAD), "returns' waits fill 0–30 s");
  check(!spread(new Array(1000).fill(0), 0, RECONNECT_SPREAD), "PLANT: every app at once is caught");
}
globalThis.setTimeout = realSetTimeout;

// ---------- the files ----------
// The start's calls and the polls go through fetchRetrying; the background's online listeners through onReconnect.
const THROUGH = [
  ["public/js/shell/api.js", /await fetchRetrying\(path, \{ credentials: "same-origin", \.\.\.options \}, \{ idempotent \}\)/],
  ["public/js/lx/look-sync.js", /async function call\(path, \{ idempotent = false, \.\.\.options \} = \{\}\) \{\n  const response = await fetchRetrying\(/],
  ["public/js/study/pack-inbox.js", /async function call\(path, \{ idempotent = false, \.\.\.options \} = \{\}\) \{\n  const response = await fetchRetrying\(/],
  ["public/js/study/pack-inbox.js", /send\("PUT", "\/api\/packs\/device", body, \{ idempotent: true \}\)/],
  ["public/js/explore/explore.js", /fetchRetrying\("\/api\/community\/following"/],
  ["public/js/login.js", /async function post\(path, body\) \{\n  const response = await fetchRetrying\(/],
  ["public/js/ai/study-record.js", /fetchRetrying\("\/api\/ai\/record", .*\{ idempotent: method === "PUT" \}\)/],
];
const BACKGROUND = ["public/js/lx/look-sync.js", "public/js/study/pack-inbox.js", "public/js/sync.js", "public/js/study/packs.js"];
const rawFetch = (text) => /(^|[^.\w])fetch\(/m.test(text.replace(/fetchRetrying\(/g, ""));
const rawOnline = (text) => /addEventListener\(\s*["']online["']/.test(text);
check(rawFetch('x = await fetch("/api/look")') && rawOnline('addEventListener("online", tick)'), "PLANT: a raw fetch and a raw online listener are caught");
check(!rawFetch("await fetchRetrying(path)") && !rawFetch("worker.fetch(x)"), "PLANT: fetchRetrying and another object's fetch aren't");
for (const [file, pattern] of THROUGH) check(pattern.test(readFileSync(join(ROOT, file), "utf8")), `${file}: ${pattern.source.slice(0, 60)}…`);
for (const file of ["public/js/lx/look-sync.js", "public/js/study/pack-inbox.js"]) check(!rawFetch(readFileSync(join(ROOT, file), "utf8")), `${file}: no request but through fetchRetrying`);
for (const file of BACKGROUND) check(!rawOnline(readFileSync(join(ROOT, file), "utf8")), `${file}: back online only through onReconnect`);
// Each poll's next round waits jittered(…), never a bare pace.
const POLLS = ["public/js/lx/look-sync.js", "public/js/study/pack-inbox.js"];
const steady = (text) => /timer = setTimeout\(tick, (?!jittered\()[^;]*(QUIET_MS|ACTIVE_MS|IDLE_MS)/.test(text);
check(steady("    timer = setTimeout(tick, !hasAi() ? QUIET_MS : ACTIVE_MS);") && !steady("    timer = setTimeout(tick, jittered(QUIET_MS));"), "PLANT: a poll's bare pace is caught, a jittered one isn't");
for (const file of POLLS) {
  const text = readFileSync(join(ROOT, file), "utf8");
  check(/timer = setTimeout\(tick, jittered\(/.test(text) && !steady(text), `${file}: its next round waits jittered(…)`);
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
