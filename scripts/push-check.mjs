// Reminders in headless Chrome on a LOCAL server (it creates and deletes test accounts, so never point it at the live
// site). The server needs a local VAPID pair: `node scripts/vapid-keys.mjs --local .dev.vars` in the folder wrangler
// dev runs from, which reads .dev.vars itself (delete it after). The browser's push service is played by a
// stand-in subscription (a real P-256 key and auth secret, an endpoint the server accepts), since headless Chrome has
// none; a push reaches the service worker through Chrome's own ServiceWorker.deliverPushMessage. Stages: the ask after
// a first finished session and Not now remembered; Settings → Reminders turned on (the subscription and report the
// server keeps), each switch, the time, the cue and quiet hours (fields at 16px), Send a test (the server's answer
// played: what reaches the push service is test-reminders'), off (everything gone); a
// push shown as a notification; an iPhone browser tab sent to the Home Screen. Fails on any console error. Chrome runs
// through quiet-browser.mjs: nothing is heard.
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "push check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/push-check.mjs http://localhost:<port> <outDir>

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { playToSummary } from "./fixtures/play-session.mjs";
import { goRouted } from "./fixtures/routed.mjs";

const [BASE, outArg = "push-check-out"] = process.argv.slice(2);
const OUT = resolve(outArg);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("push-check creates and deletes accounts: give it a local server, e.g. http://localhost:8824");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

const results = [];
const problems = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await context.grantPermissions(["notifications"], { origin: BASE });
// The browser's push service, played: subscribe gives a subscription with a real key and auth secret.
// The phone's permission prompt, counted (and still answered: the context grants it): a double tap on Done must ask nothing.
await context.addInitScript(() => {
  globalThis.__asked = 0;
  if ("Notification" in self) {
    const ask = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = (...args) => (globalThis.__asked++, ask(...args));
  }
});
await context.addInitScript(() => {
  if (!("PushManager" in self)) return;
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  let sub = null;
  PushManager.prototype.getSubscription = async function () {
    return sub;
  };
  PushManager.prototype.subscribe = async function () {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const keys = { p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) };
    const endpoint = `https://fcm.googleapis.com/fcm/send/push-check-${Math.random().toString(36).slice(2)}`;
    sub = { endpoint, toJSON: () => ({ endpoint, keys }), unsubscribe: async () => ((sub = null), true) };
    return sub;
  };
});
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const SESSION = '[data-part="session"]:not([data-ghost])';
const settle = () => page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
const shot = async (name) => {
  await settle();
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
};
const opened = (hash, text) => page.waitForFunction(([h, t]) => location.hash.startsWith(h) && document.querySelector('[data-part="page"] [data-part="page-title"]')?.textContent === t, [hash, text]);
const server = () => page.evaluate(async () => (await fetch("/api/reminders")).json());

// The ask is a step of its own after a first summary's Done (study/session.js finish, shell/settings-reminders.js reminderStep). On each
// phone, at rest: the step and every control in it inside the session's scroll box and above its bar, nothing cut; its buttons whole in
// the bar on the screen; each control's middle taking a press. Measured at each size in turn.
const PHONES = [
  [390, 844],
  [375, 667],
  [320, 568],
];
const BAR_BUTTONS = `${SESSION} [data-part="answer-bar"] [data-part="button"]`;
const askWhole = async () => {
  const seen = [];
  for (const [width, height] of PHONES) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await settle();
    const at = await page.evaluate((S) => {
      const step = document.querySelector(`${S} [data-part="reminder-step"]`);
      const act = document.querySelector(`${S} [data-part="activity"]`);
      const bar = document.querySelector(`${S} [data-part="answer-bar"]`);
      if (!step || !act || !bar) return null;
      const room = { top: act.getBoundingClientRect().top, bottom: Math.min(act.getBoundingClientRect().bottom, bar.getBoundingClientRect().top, innerHeight) };
      const name = (n) => (n.textContent || n.getAttribute("aria-label") || n.localName).trim().slice(0, 20) || n.localName;
      const inside = [...step.querySelectorAll("a[href], button, input")];
      const buttons = [...bar.querySelectorAll('[data-part="button"]')];
      const cut = [
        ...[step, ...inside].filter((n) => {
          const r = n.getBoundingClientRect();
          return r.top < room.top - 0.5 || r.bottom > room.bottom + 0.5;
        }),
        ...buttons.filter((n) => {
          const r = n.getBoundingClientRect();
          return r.top < 0 || r.bottom > innerHeight + 0.5 || r.left < 0 || r.right > innerWidth + 0.5;
        }),
      ];
      const covered = [...inside, ...buttons].filter((n) => {
        const r = n.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(hit && (hit === n || n.contains(hit)));
      });
      const box = step.getBoundingClientRect();
      return { scroll: act.scrollTop, step: `${Math.round(box.top)}–${Math.round(box.bottom)}`, room: Math.round(room.bottom), buttons: buttons.map(name), cut: cut.map((n) => (n === step ? "the step" : name(n))), covered: covered.map(name) };
    }, SESSION);
    seen.push({ size: `${width}×${height}`, ...at });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const wrong = seen.filter((s) => !s.step || s.scroll !== 0 || s.cut.length || s.covered.length || s.buttons.length !== 2);
  assert(!wrong.length, `the ask not whole at rest: ${JSON.stringify(wrong)}`);
  return seen.map((s) => `${s.size} ${s.step} of ${s.room}, ${s.buttons.join(" + ")}`).join("; ");
};
// The step's Tinta: one in the session, beside the title, 72 px, hidden from screen readers, taking no presses, clear of the words (their
// own lines, a range over each: never an element's box, which can run on beside him).
const askTinta = () =>
  page.evaluate((S) => {
    const root = document.querySelector(S);
    const step = root?.querySelector('[data-part="reminder-step"]');
    const all = root ? root.querySelectorAll('[data-part="character"]').length : 0;
    const t = step?.querySelector('[data-part="character"]');
    if (!t) return { all };
    const box = t.getBoundingClientRect();
    const lines = [...step.querySelectorAll("h2, p, label")].flatMap((w) => {
      const range = document.createRange();
      range.selectNodeContents(w);
      return [...range.getClientRects()];
    });
    const overlaps = lines.filter((r) => r.width && r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom).length;
    const there = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    const title = step.querySelector("h2").getBoundingClientRect();
    return { all, size: t.getAttribute("data-size"), ariaHidden: t.getAttribute("aria-hidden"), overlaps, pressable: Boolean(there && (there === t || t.contains(there))), besideTitle: box.left > title.left && box.top < title.bottom };
  }, SESSION);
const tintaRight = (t) => t.all === 1 && t.size === "72" && t.ariaHidden === "true" && t.overlaps === 0 && !t.pressable && t.besideTitle;
// After a summary's Done: the session on its way out (no step, no session), as when nothing more is asked.
const gone = () => page.waitForFunction((S) => !document.querySelector(S), SESSION, { timeout: 15_000 });

// ---------- sessions, played by scripts/fixtures/play-session.mjs (each step by its kind, never its words) ----------

let CONTENT = null;
const content = () => page.evaluate(async () => {
  const c = await import("/js/study/content.js");
  return { items: c.ITEMS.map((i) => ({ ...i, sentence: c.sentence(i) })), words: c.WORDS };
});

// ---------- the run ----------

const signUp = async (name) => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', name);
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
};
const playSession = async () => {
  // Once the app has the address the last session's Done set (fixtures/routed.mjs settled), and never to the address it's already at.
  await goRouted(page, BASE, "#study/session/quick");
  await page.waitForSelector(SESSION);
  await playToSummary(page, { session: SESSION });
};

await stage("sign up with a passkey, land in the app", async () => {
  await signUp("Push Check");
  CONTENT = await content();
  return "signed in";
});

// A new learner's reminder time: the hour their first session ended, kept between 8:00 and 21:00 (push.js startTime), read here from the
// app's own record of what was finished.
let firstHour = null;
const expectedTime = async () => {
  const at = await page.evaluate(async () => (await import("/js/study/done.js")).finishedBetween(0, Date.now() + 1)[0]?.at ?? null);
  assert(at, "no session recorded as finished");
  const hour = await page.evaluate((at) => new Date(at).getHours(), at);
  return `${String(Math.min(21, Math.max(8, hour))).padStart(2, "0")}:00`;
};

await stage("after the first finished session: the summary is only what it gave; Done brings one step that asks, with the hour of that session as its time; Not now, and it never comes back", async () => {
  await playSession();
  const summary = page.locator(`${SESSION} [data-part="session-summary"]`);
  assert((await summary.count()) === 1, "no summary");
  assert((await page.locator(`${SESSION} :is([data-part="reminder-ask"], [data-part="reminder-step"])`).count()) === 0, "the ask on the summary");
  // A double click on Done: the step comes, and its second click, landing on Turn on where Done was, asks nothing (reminderStep's double-tap
  // guard, DOUBLE_TAP). Without it the phone's prompt came (out39's control).
  await page.locator(BAR_BUTTONS, { hasText: "Done" }).dblclick();
  const ask = page.locator(`${SESSION} [data-part="reminder-step"]`);
  await ask.waitFor({ timeout: 5_000 });
  await page.waitForTimeout(800);
  const doubled = await page.evaluate(() => globalThis.__asked);
  assert(doubled === 0 && (await ask.count()) === 1, `a double click on Done asked the phone ${doubled} time(s), the step ${await ask.count() ? "still up" : "gone"}`);
  assert((await summary.count()) === 0, "the summary still up under the ask");
  const text = await ask.textContent();
  firstHour = await expectedTime();
  const shown = await ask.locator('input[type="time"]').inputValue();
  assert(text.includes("Want a reminder?") && shown === firstHour, `${text} (time ${shown}, the first session's hour ${firstHour})`);
  const bar = (await page.locator(BAR_BUTTONS).allTextContents()).map((t) => t.trim()).join(" + ");
  assert(bar === "Not now + Turn on", `the step's buttons: ${bar}`);
  const whole = await askWhole();
  const tinta = await askTinta();
  assert(tintaRight(tinta), `Tinta on the ask: ${JSON.stringify(tinta)}`);
  await shot("01-ask-after-session");
  await page.locator(BAR_BUTTONS, { hasText: "Not now" }).click();
  await gone();
  await playSession();
  await page.locator(BAR_BUTTONS, { hasText: "Done" }).click();
  await gone();
  return `the summary alone; a double click on Done brought the ask and asked nothing; once, with Tinta beside its title; whole at rest: ${whole}`;
});

await stage("Settings → Reminders, off: Turn on asks permission and subscribes; the server keeps this device", async () => {
  // Straight after a session's Done: Settings is reached once the router has settled where Done took it.
  await goRouted(page, BASE, "#settings");
  const row = page.locator('[data-part="list-row"][href="#settings/reminders"]');
  assert((await row.locator(".lx-row-value").textContent()) === "Off", "menu says off");
  await row.click();
  await opened("#settings/reminders", "Reminders");
  await shot("02-reminders-off");
  await page.getByRole("button", { name: "Turn on reminders" }).click();
  await page.waitForSelector('[data-part="page"] [data-part="switch"]');
  const s = await server();
  assert(s.on && s.devices.length === 1 && s.settings.daily && s.settings.ai && !s.settings.community && !s.settings.week, JSON.stringify(s));
  // Its time the hour of the first session, not one 7 pm for everyone.
  assert(s.settings.time === firstHour, `the account's time ${s.settings.time}, the first session's hour ${firstHour}`);
  await shot("03-reminders-on");
  return `on at ${s.settings.time}; device ${s.devices[0]}`;
});

await stage("each switch, the time, the cue and quiet hours save, in order (the first held back); fields are 16px", async () => {
  const sizes = await page.locator('[data-part="page"] input[type="time"], [data-part="page"] input[type="text"]').evaluateAll((inputs) => inputs.map((i) => parseFloat(getComputedStyle(i).fontSize)));
  assert(sizes.length === 4 && sizes.every((f) => f >= 16), `field sizes ${sizes}`);
  // The first save held 800 ms, so it reaches the server after the later ones would: the page sends one at a time,
  // in order, and none brings back what a later change replaced.
  let held = false;
  let heldDone = null;
  await page.route("**/api/reminders/settings", async (route) => {
    if (!held && route.request().method() === "PUT") {
      held = true;
      heldDone = (async () => {
        await new Promise((done) => setTimeout(done, 800));
        await route.fulfill({ response: await route.fetch() });
      })();
      return heldDone;
    }
    await route.continue();
  });
  await page.locator('input[aria-label="Reminder time"]').fill("08:15");
  await page.locator('input[aria-label="Reminder time"]').dispatchEvent("change");
  await page.locator('input[aria-label="When in your day"]').fill("With coffee");
  await page.locator('input[aria-label="When in your day"]').dispatchEvent("change");
  await page.locator('input[aria-label="Quiet from"]').fill("22:00");
  await page.locator('input[aria-label="Quiet from"]').dispatchEvent("change");
  const week = page.locator('[data-part="list-row"]', { hasText: "The week" }).locator('input[role="switch"]');
  await week.check({ force: true });
  // Each change is its own save: once the held one has been answered (the server took it), the server is read until
  // all four have arrived (≤5 s). A "Saved." on the page may be an earlier one's, so it's never what this waits for.
  for (let i = 0; i < 50 && !heldDone; i++) await page.waitForTimeout(100);
  await heldDone;
  let s = null;
  for (let i = 0; i < 50; i++) {
    s = (await server()).settings;
    if (s.time === "08:15" && s.cue === "With coffee" && s.quietFrom === "22:00" && s.week === true) break;
    await page.waitForTimeout(100);
  }
  await page.unroute("**/api/reminders/settings");
  assert(held, "the first save was never held");
  assert(s.time === "08:15" && s.cue === "With coffee" && s.quietFrom === "22:00" && s.week === true, `${JSON.stringify(s)}; the week's switch ${await week.isChecked() ? "on" : "off"}, the page says "${await page.locator('[data-part="page"] [role="status"]').first().textContent()}"`);
  return JSON.stringify(s);
});

await stage("Send a test: this device's id goes to the server, and its answer is said, sent or not", async () => {
  // The server's answer is played (its send to the push service is test-reminders'): the stand-in subscription's
  // endpoint is no real device, and a real push service's 404 would end it.
  const asked = [];
  let answer = { ok: true, status: 201, gone: false };
  await page.route("**/api/push/test", async (route) => {
    asked.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
  });
  const status = () => page.locator('[data-part="page"] [role="status"]').first();
  const said = async (text) => {
    await page.locator('[data-part="list-row"]', { hasText: "Send a test" }).click();
    await page.waitForFunction((t) => document.querySelector('[data-part="page"] [role="status"]')?.textContent === t, text, { timeout: 5000 }).catch(async () => {
      const seen = await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((n) => `${n.closest('[data-part="page"]') ? "page" : "outside"}: "${n.textContent}"`));
      await shot("05-send-a-test-not-said");
      throw new Error(`"${text}" never said; the status lines: ${seen.join(" | ")}; asked ${asked.length}`);
    });
  };
  try {
    await said("Sent. It should arrive in a moment.");
    answer = { ok: false, status: 404, gone: true };
    await said("It didn't go through. Turn reminders off and on again on this device.");
  } finally {
    await page.unroute("**/api/push/test");
  }
  const device = (await server()).devices[0];
  assert(asked.length === 2 && asked.every((b) => b.device === device), `asked ${JSON.stringify(asked)}, this device ${device}`);
  return `${await status().textContent()} (device ${device})`;
});

await stage("a save answered after Send a test never says Saved. over its answer; with nothing said since, a save still says Saved.", async () => {
  // The two share one status line. A setting changed, then Send a test pressed while that change's saves are still on their way (held here
  // until the answer is said, then let go): the test's answer stays. On 7 Nov 2026 a late "Saved." wrote over it (Send a test failed 1 run in 6).
  const status = () => page.evaluate(() => document.querySelector('[data-part="page"] [role="status"]')?.textContent ?? null);
  // Every save while holding is held (a change can send more than one); let go together.
  let holding = true;
  const held = [];
  await page.route("**/api/reminders/settings", async (route) => {
    if (route.request().method() !== "PUT" || !holding) return route.continue();
    await new Promise((done) => held.push(done));
    await route.fulfill({ response: await route.fetch() });
  });
  await page.route("**/api/push/test", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: 201, gone: false }) }));
  const cue = page.locator('input[aria-label="When in your day"]');
  try {
    await cue.fill("After dinner");
    await cue.dispatchEvent("change");
    for (let i = 0; i < 100 && !held.length; i++) await page.waitForTimeout(50);
    assert(held.length, `the change's save never went (the line says "${await status()}")`);
    await page.locator('[data-part="list-row"]', { hasText: "Send a test" }).click();
    await page.waitForFunction(() => document.querySelector('[data-part="page"] [role="status"]')?.textContent === "Sent. It should arrive in a moment.", null, { timeout: 5000 });
    await page.waitForTimeout(1500);
    holding = false;
    for (const go of held.splice(0)) go();
    for (let i = 0; i < 50 && (await server()).settings.cue !== "After dinner"; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(600);
    const after = await status();
    assert((await server()).settings.cue === "After dinner", "the held saves never reached the server");
    assert(after === "Sent. It should arrive in a moment.", `a late save's answer wrote over Send a test's: the line says "${after}"`);
    // The control: a change with nothing said after it is answered with Saved. as before.
    await cue.fill("With coffee");
    await cue.dispatchEvent("change");
    await page.waitForFunction(() => document.querySelector('[data-part="page"] [role="status"]')?.textContent === "Saved.", null, { timeout: 5000 }).catch(async () => {
      throw new Error(`a save with nothing said after it never said Saved.: the line says "${await status()}"`);
    });
    for (let i = 0; i < 50 && (await server()).settings.cue !== "With coffee"; i++) await page.waitForTimeout(100);
    assert((await server()).settings.cue === "With coffee", "the control's save never reached the server");
    return `kept "${after}"; then "Saved."`;
  } finally {
    for (const go of held.splice(0)) go();
    await page.unroute("**/api/reminders/settings");
    await page.unroute("**/api/push/test");
  }
});

await stage("a push reaches the service worker and shows as a notification, with the badge counting it", async () => {
  // The worker's registration (a live one: listening before enable, which reports them at once).
  const registration = new Promise((done) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
      const r = registrations.find((x) => x.scopeURL === `${BASE}/` && !x.isDeleted);
      if (r) done(r.registrationId);
    });
  });
  await cdp.send("ServiceWorker.enable");
  const registrationId = await registration;
  // The badge the worker sets, recorded inside it (Chrome has no way to read a badge back).
  const worker = context.serviceWorkers().find((w) => w.url().startsWith(BASE)) ?? (await context.waitForEvent("serviceworker", { timeout: 10_000 }));
  await worker.evaluate(() => {
    self.lxPushes = 0;
    self.addEventListener("push", () => self.lxPushes++);
    self.lxBadges = [];
    const set = self.navigator.setAppBadge?.bind(self.navigator);
    self.navigator.setAppBadge = (n) => {
      self.lxBadges.push(n);
      return set ? set(n).catch(() => {}) : Promise.resolve();
    };
  });
  const data = JSON.stringify({ web_push: 8030, notification: { title: "Ready when you are", body: "12 words to review, about 4 minutes.", navigate: "/app/#study/session/quick?from=push" } });
  await cdp.send("ServiceWorker.deliverPushMessage", { origin: BASE, registrationId, data });
  // The notifications shown, once there are at least `count` (polled inside the page: an async predicate in
  // waitForFunction resolves at once).
  const notifications = (count) =>
    page.evaluate(async (count) => {
      const registration = await navigator.serviceWorker.ready;
      for (let i = 0; i < 100; i++) {
        const list = await registration.getNotifications();
        if (list.length >= count) return list.map((n) => ({ title: n.title, body: n.body, url: n.data?.url }));
        await new Promise((done) => setTimeout(done, 100));
      }
      return [];
    }, count);
  const shown = await notifications(1);
  assert(shown.length, `no notification: registration ${registrationId}, pushes the worker got ${await worker.evaluate(() => self.lxPushes)}`);
  assert(shown[0].title === "Ready when you are" && shown[0].url.endsWith("/app/#study/session/quick?from=push"), JSON.stringify(shown));
  // A push naming a page outside the app opens the app instead.
  await cdp.send("ServiceWorker.deliverPushMessage", { origin: BASE, registrationId, data: JSON.stringify({ web_push: 8030, notification: { title: "x", body: "y", navigate: "https://evil.example/" } }) });
  const urls = (await notifications(2)).map((n) => n.url);
  assert(urls.length >= 2 && urls.every((u) => u.startsWith(`${BASE}/app/`)), JSON.stringify(urls));
  const badges = await worker.evaluate(() => self.lxBadges);
  assert(badges.join() === "1,2", `the badge: ${badges.join()}`);
  return `${shown[0].title}; an outside page opens the app; the badge 1, then 2`;
});

await stage("the report the server keeps: study days, due, the zone; never what was studied", async () => {
  const body = await page.evaluate(async () => (await import("/js/push.js")).reportBody());
  const keys = Object.keys(body).sort().join(",");
  assert(keys === "device,due,lang,pauses,studied,tz,week", keys);
  assert(!JSON.stringify(body).includes("w:"), "a unit in the report");
  return `${body.studied.length} days, ${body.due} due, ${body.tz}`;
});

await stage("Turn off on this device: the server forgets everything", async () => {
  await page.goto(`${BASE}/app/#settings/reminders`);
  await page.locator('[data-part="list-row"]', { hasText: "Turn off reminders on this device" }).click();
  await page.waitForSelector('text=Turn on reminders');
  const s = await server();
  assert(!s.on && s.devices.length === 0, JSON.stringify(s));
  return "off, forgotten";
});

await stage("an iPhone browser tab: Settings and the ask send it to the Home Screen app", async () => {
  await cdp.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1" });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.goto(`${BASE}/app/#settings/reminders`);
  await page.waitForSelector('[data-part="page"] [data-part="empty-state"]');
  const text = await page.locator('[data-part="page"]').textContent();
  assert(text.includes("come to Lexicommons on your Home Screen") && (await page.locator('[data-part="list-row"][href="#settings/install"]').count()) === 1, text.slice(0, 200));
  await shot("04-iphone-tab");
  await page.evaluate(() => localStorage.removeItem("lx.reminders.asked"));
  await playSession();
  // A double click on Done: the step, and its second click (on Show me how, where Done was) going nowhere.
  await page.locator(BAR_BUTTONS, { hasText: "Done" }).dblclick();
  const ask = page.locator(`${SESSION} [data-part="reminder-step"]`);
  await ask.waitFor({ timeout: 5_000 });
  await page.waitForTimeout(800);
  assert(!(await page.evaluate(() => location.hash)).startsWith("#settings/install") && (await ask.count()) === 1, "a double click on Done opened Show me how");
  assert((await ask.textContent()).includes("come to Lexicommons on your Home Screen"), "the ask on an iPhone tab");
  const bar = (await page.locator(BAR_BUTTONS).allTextContents()).map((t) => t.trim()).join(" + ");
  assert(bar === "Not now + Show me how", `the iPhone tab's buttons: ${bar}`);
  const tinta = await askTinta();
  assert(tintaRight(tinta), `Tinta on the iPhone tab's ask: ${JSON.stringify(tinta)}`);
  const whole = await askWhole();
  await shot("05-iphone-ask");
  await page.locator(BAR_BUTTONS, { hasText: "Not now" }).click();
  await gone();
  return `sent to the Home Screen; whole at rest: ${whole}`;
});

let problemsBeforeDelete = 0;
await stage("delete the account", async () => {
  problemsBeforeDelete = problems.length;
  await page.goto(`${BASE}/app/#settings/account`);
  const row = (text) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${text}$`) }) }).first();
  await row("Delete my account").click();
  await row("Press again to delete it for good").click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  return "deleted";
});

await stage("no console errors", async () => {
  const after = problems.slice(problemsBeforeDelete).filter((p) => !/status of 401/.test(p));
  const real = [...problems.slice(0, problemsBeforeDelete), ...after];
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "push-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
