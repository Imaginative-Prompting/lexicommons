// Turning reminders on is one thing at a time (public/js/push.js turnOn), with the phone's prompt, the service worker and the server stood
// in: six presses while the permission prompt is still up ask once and tell the server once, each getting the same answer; a press after
// it has answered starts a new one (the control that the guard lets go); a failure is everyone's failure and the next press tries again.
// On 11 Nov 2026 a burst of presses each waited on the prompt, then all subscribed at once (the server's state changed under one five times).
// Pass another copy's dir to see it fail on one from before:  node scripts/test-reminder-turn-on.mjs [<app dir>]   (exit 0 = pass)
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const APP = process.argv[2] ? pathToFileURL(`${resolve(process.argv[2])}/`) : new URL("../", import.meta.url);

let failed = 0;
let passed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}

// A phone's Home Screen app that can take Web Push; the prompt answers when the test lets it.
const stored = new Map();
globalThis.localStorage = { getItem: (key) => (stored.has(key) ? stored.get(key) : null), setItem: (key, value) => stored.set(key, String(value)), removeItem: (key) => stored.delete(key) };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.location = new URL("https://lexicommons.test/app/");
globalThis.matchMedia = () => ({ matches: true, addEventListener() {} });
globalThis.document = { addEventListener() {}, visibilityState: "visible", documentElement: { setAttribute() {}, removeAttribute() {}, hasAttribute: () => false } };
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.window = globalThis;
globalThis.PushManager = class {};
let prompts = 0;
// Every prompt waiting is answered together, as a phone's one prompt answers every call that was waiting on it.
const waiting = [];
const answerPrompt = () => {
  Notification.permission = "granted";
  for (const done of waiting.splice(0)) done("granted");
};
globalThis.Notification = { permission: "default", requestPermission: () => (prompts++, new Promise((done) => waiting.push(done))) };
setTimeout(() => (console.log("FAIL  timed out"), process.exit(3)), 20_000).unref();
let subscribed = 0;
const subscription = { toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/one", keys: { p256dh: "p", auth: "a" } }), unsubscribe: async () => true };
let has = null;
const registration = { pushManager: { getSubscription: async () => has, subscribe: async () => (subscribed++, (has = subscription)) } };
Object.defineProperty(globalThis.navigator, "serviceWorker", { value: { ready: Promise.resolve(registration) }, configurable: true });
Object.defineProperty(globalThis.navigator, "userAgent", { value: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36", configurable: true });
// The server: its key, and each subscribe counted; `refuse` makes the next one a 500.
const posts = [];
let refuse = false;
globalThis.fetch = async (url, init = {}) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  if (path === "/api/push/key") return Response.json({ key: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U" });
  if (path === "/api/push/subscribe") {
    posts.push(JSON.parse(init.body ?? "{}").device ?? null);
    await new Promise((done) => setTimeout(done, 20));
    if (refuse) return Response.json({ error: "Something went wrong on our side." }, { status: 500 });
    return Response.json({ ok: true });
  }
  return Response.json({});
};

const push = await import(new URL("public/js/push.js", APP).href);
const settle = () => new Promise((done) => setTimeout(done, 60));

// Six presses while the prompt is up.
const six = Array.from({ length: 6 }, () => push.turnOn("19:00").then((out) => out, (error) => ({ threw: error.message })));
await settle();
check("six presses, the prompt still up: it was asked once", prompts, 1);
answerPrompt();
const answers = await Promise.all(six);
check("each press gets the same answer: on", answers, Array(6).fill({ ok: true }));
check("the phone was subscribed once and the server told once", [subscribed, posts.length], [1, 1]);

// The control: once it has answered, a press is a new turn-on (an account's second try, a time changed).
const again = push.turnOn("20:00");
await settle();
answerPrompt();
check("a press after it answered asks the server again", [await again, posts.length], [{ ok: true }, 2]);

// A failure is everyone's, and doesn't stick.
refuse = true;
const failing = Array.from({ length: 3 }, () => push.turnOn("19:00").then(() => "on", (error) => `threw: ${typeof error.message}`));
await settle();
answerPrompt();
check("three presses and the server failing: one request, all three told", [await Promise.all(failing), posts.length], [Array(3).fill("threw: string"), 3]);
refuse = false;
const after = push.turnOn("19:00");
await settle();
answerPrompt();
check("the next press tries again and it's on", [await after, posts.length], [{ ok: true }, 4]);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
