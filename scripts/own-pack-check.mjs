#!/usr/bin/env node
// Add your own pack, the learner view and Feature flags, in Chrome on a phone from a new account learning Dutch (explore/own.js,
// shell/sharing.js, shell/settings-flags.js):
//   - Explore's home offers Add your own pack to everyone; Ask for it and Share only once sharing is open to learners (/api/me's
//     features.sharing "everyone"), never while it's "admins";
//   - the page with no AI: an Anki deck (the import page, whose Back comes back here) and one started by hand, nothing naming an AI;
//   - Start one by hand: no name is refused in words; a name makes an empty pack of yours in the language and opens its editor;
//   - with an AI connected: the words to send it follow what it's about and the level picked in its sheet, and Copy copies them exactly;
//   - at 320 wide nothing is wider than the screen;
//   - an admin sees the app as a learner until they turn it off on the device (Settings → Admin): Ask for it and Share then appear there,
//     never on Explore's face while sharing is "admins"; the choice stays through a reload;
//   - a learner landing on Feature flags is told it's an admin's, nothing asked for or shown;
//   - Feature flags as previews on this device, against a stand-in of the server's /api/admin/flags (its shape: src/flags.ts): each flag in
//     order with what everyone has, one that can't be previewed disabled with why, a press sending only this device's preview (no sheet,
//     nothing for everyone), sharing previewed with the learner view on showing Explore as a learner would see it, every preview off at once.
//     Then the server's own: a sharing preview for this device alone, /api/me following it and back, and no site-wide change from the app.
// /api/me's answer is played (mayShare, features.sharing, aiConnected) so each state is the same on any server; everything else is real.
//   node scripts/own-pack-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
// LOCAL only (it signs up a test account and makes it an admin in local D1), on a server at COMMUNITY_SHARING "admins" (wrangler.jsonc's own:
// no --var for it). Exit 0 = pass, 2 = not set up.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/own-pack-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
const stage = async (name, fn) => {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`PASS ${name}${note ? `: ${JSON.stringify(note)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.message ?? error) });
    console.log(`FAIL ${name}: ${String(error?.message ?? error).split("\n").slice(0, 6).join("\n  ")}`);
    await page.screenshot({ path: join(OUT, `fail-${results.length}.png`) }).catch(() => {});
  }
};
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const same = (got, want, what) => assert(JSON.stringify(got) === JSON.stringify(want), `${what}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
// What /api/me says, played: { mayShare, sharing, ai }, changed by each stage before a reload.
const me = { mayShare: false, sharing: "admins", ai: false, played: true };
await context.route((url) => url.pathname === "/api/me", async (route) => {
  if (route.request().method() !== "GET" || !me.played) return route.continue();
  const r = await route.fetch();
  const j = await r.json();
  await route.fulfill({ response: r, json: { ...j, mayShare: j.roles?.includes("admin") ? true : me.mayShare, aiConnected: me.ai, features: { ...(j.features ?? {}), sharing: me.sharing } } });
});
// The flags' stand-in: the server's list as src/flags.ts gives it (previews on this device only), every request kept to be read. A sharing
// preview makes this device's /api/me say sharing is "everyone", as the server does for an admin's previews.
const FLAGS = [
  { name: "COMMUNITY_SHARING", title: "Sharing open to everyone", about: "Share, Ask for it, fixes and flags in Explore, as everyone would have them.", kind: "choice", values: ["admins", "everyone"], value: "admins", preview: { on: false, can: true } },
  { name: "PLAN_ENABLED", title: "The paid plan", about: "The plan's page and its parts.", kind: "switch", value: false, preview: { on: false, can: true } },
  { name: "OWN_KEY_ENABLED", title: "A key of your own for the in-app AI", about: "Your own key in the AI section.", kind: "switch", value: false, preview: { on: false, can: true } },
  { name: "APPLE_SIGNIN", title: "Sign in with Apple", about: "Apple's button on the sign-in page.", kind: "switch", value: false, preview: { on: false, can: { missing: "Apple's ids and key aren't set" } } },
];
const sent = [];
let standIn = true;
await context.route((url) => url.pathname.startsWith("/api/admin/flags") || url.pathname === "/api/admin/previews", async (route) => {
  if (!standIn) return route.continue();
  const req = route.request();
  const path = new URL(req.url()).pathname;
  if (req.method() === "GET") return route.fulfill({ json: { flags: FLAGS } });
  sent.push({ method: req.method(), path, body: JSON.parse(req.postData() ?? "null") });
  if (path === "/api/admin/previews") {
    for (const flag of FLAGS) flag.preview.on = false;
    me.sharing = "admins";
    return route.fulfill({ json: { flags: FLAGS } });
  }
  const name = decodeURIComponent(path.split("/")[4]);
  const flag = FLAGS.find((one) => one.name === name);
  const on = JSON.parse(req.postData() ?? "{}").on;
  flag.preview.on = on;
  if (name === "COMMUNITY_SHARING") me.sharing = on ? "everyone" : "admins";
  return route.fulfill({ json: { flag } });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 300)));
const PAGE = '[data-part="page"]:visible';
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Own Pack Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]");
await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
const account = await page.evaluate(async () => (await (await fetch("/api/me")).json()).user.id);
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });
const reload = async (hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => (await import("/js/shell/api.js")).whoAmI());
  await page.evaluate((h) => (location.hash = h), "#today");
  await page.waitForTimeout(300);
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(800);
};
const footRows = async () => {
  await page.locator(`${PAGE} .lx-row-title`, { hasText: "Add your own pack" }).or(page.locator(`${PAGE} .lx-row-title`, { hasText: "Change target language" })).first().waitFor({ timeout: 20_000 });
  return (await page.locator(`${PAGE} .lx-row-title`).allTextContents()).map((s) => s.trim()).filter((s) => ["Add your own pack", "Ask for it", "Share what you've made"].includes(s));
};

await stage("Explore's home offers Add your own pack to everyone; Ask for it and Share only once sharing is open to learners", async () => {
  await reload("#explore?lang=nl");
  same(await footRows(), ["Add your own pack"], "the home's rows with sharing for admins");
  await shot("1-explore-admins");
  Object.assign(me, { mayShare: true, sharing: "everyone" });
  await reload("#explore?lang=nl");
  same(await footRows(), ["Add your own pack", "Ask for it", "Share what you've made"], "the home's rows with sharing for everyone");
  Object.assign(me, { mayShare: false, sharing: "admins" });
  await reload("#explore?lang=nl");
});

await stage("Add your own pack with no AI: an Anki deck and one by hand, nothing naming an AI; the Anki page's Back comes back here", async () => {
  await page.locator(`${PAGE} .lx-row-title`, { hasText: "Add your own pack" }).click();
  await page.waitForFunction(() => location.hash.startsWith("#explore/own"));
  await page.locator(`${PAGE} [data-part="page-title"]`, { hasText: "Add your own pack" }).waitFor();
  const text = await page.locator(PAGE).innerText();
  assert(!/\bAI\b|Claude|ChatGPT/.test(text), `an AI named on the page with none connected: ${text.slice(0, 300)}`);
  same(await page.locator(`${PAGE} .lx-own-ai`).count(), 0, "the AI part with no AI");
  await shot("2-own");
  await page.locator(`${PAGE} .lx-row-title`, { hasText: "Add an Anki deck" }).click();
  await page.waitForFunction(() => location.hash.startsWith("#study/import"));
  await page.locator("header .lx-back:visible", { hasText: "Add your own pack" }).waitFor({ timeout: 10_000 });
  await page.locator("header .lx-back:visible").click();
  await page.waitForFunction(() => location.hash.startsWith("#explore/own"));
});

await stage("Start one by hand: no name is said in words; a name makes an empty pack of yours in Dutch and opens it to add to", async () => {
  const hand = page.locator(`${PAGE} .lx-own-hand`);
  await hand.locator('button[data-variant="go"]').click();
  same((await hand.locator('[role="status"]').textContent()).trim(), "Give it a name first.", "what an empty name says");
  const name = `Words for work ${Date.now().toString(36)}`;
  await hand.locator("input").fill(name);
  await hand.locator('button[data-variant="go"]').click();
  await page.waitForFunction(() => /^#settings\/study\/packs\/[^/]+\/edit$/.test(location.hash), null, { timeout: 10_000 });
  const id = decodeURIComponent(await page.evaluate(() => location.hash.split("/")[3]));
  const made = await page.evaluate(async (id) => (await import("/js/study/packs.js")).yourPack(id)?.pack ?? null, id);
  assert(made, `no pack of yours "${id}"`);
  same({ name: made.name, language: made.language, items: made.items.length }, { name, language: "nl", items: 0 }, "the pack made");
  await page.locator(`${PAGE}`, { hasText: name }).waitFor();
  await page.locator(`${PAGE} .lx-row-title`, { hasText: "Add a word or sentence" }).waitFor();
  await shot("3-by-hand");
  return { id };
});

await stage("with an AI connected: the words to send it follow what it's about and the level picked, and Copy copies them exactly", async () => {
  me.ai = true;
  await reload("#explore/own?lang=nl");
  const ai = page.locator(`${PAGE} .lx-own-ai`);
  await ai.waitFor({ timeout: 10_000 });
  const words = () => ai.locator(".lx-yours-prompt-words").textContent();
  same(await words(), "Make me a Lexicommons pack for learning Dutch. Ask me what it should be about, then read get_pack_guide and make it with create_pack.", "the words with nothing said");
  await ai.locator("input").fill("ordering at a café");
  same(await words(), "Make me a Lexicommons pack for learning Dutch, about ordering at a café. Read get_pack_guide first, then make it with create_pack.", "the words with what it's about");
  await ai.locator('[data-opens="sheet"]').click();
  await page.locator('[data-part="sheet"] .lx-row-title', { hasText: /^A2$/ }).click();
  await page.waitForTimeout(500);
  same((await ai.locator('[data-opens="sheet"] .lx-row-value').textContent()).trim(), "A2", "the level row's value");
  const want = "Make me a Lexicommons pack for learning Dutch at A2, about ordering at a café. Read get_pack_guide first, then make it with create_pack.";
  same(await words(), want, "the words at A2");
  await ai.getByRole("button", { name: "Copy" }).click();
  same(await page.evaluate(() => navigator.clipboard.readText()), want, "what Copy copied");
  await shot("4-with-ai");
});

await stage("at 320 wide, nothing on the page is wider than the screen", async () => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.waitForTimeout(400);
  const wide = await page.evaluate((P) => {
    const host = document.querySelector(P.replace(":visible", ":not([hidden])"));
    const out = [...host.querySelectorAll("*")].filter((n) => n.getClientRects().length && n.getBoundingClientRect().right > innerWidth + 0.5).map((n) => `${n.tagName.toLowerCase()}.${n.className}`.slice(0, 60));
    return { scroll: document.querySelector('[data-part="page"]').scrollWidth - document.querySelector('[data-part="page"]').clientWidth, out: out.slice(0, 6) };
  }, PAGE);
  assert(wide.scroll <= 0 && !wide.out.length, `wider than 320: ${JSON.stringify(wide)}`);
  await page.locator(`${PAGE} .lx-own-ai`).scrollIntoViewIfNeeded();
  await shot("5-at-320");
  await page.setViewportSize({ width: 390, height: 844 });
  me.ai = false;
});

await stage("a learner who lands on Feature flags is told it's an admin's, and nothing of the switches is asked for or shown", async () => {
  const asked = [];
  const note = (req) => new URL(req.url()).pathname.startsWith("/api/admin/flags") && asked.push(req.url());
  page.on("request", note);
  await reload("#settings/admin/flags");
  await page.locator(PAGE, { hasText: "This is for an admin." }).waitFor({ timeout: 10_000 });
  page.off("request", note);
  same(await page.locator(`${PAGE} [data-flag]`).count(), 0, "flags shown to a learner");
  same(asked, [], "the flags asked for by a learner's page");
  const text = await page.locator(PAGE).innerText();
  assert(!/\b(paid|plan|subscription|price|Stripe)\b/i.test(text), `plan words on a learner's flags page: ${text.slice(0, 200)}`);
});

await stage("an admin sees the app as a learner until they turn it off here; then Ask for it and Share are in Settings → Admin, never on Explore's face while sharing is for admins; a reload keeps it", async () => {
  execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", `INSERT OR IGNORE INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES ('${account.replace(/'/g, "''")}', 'admin', ${Date.now()}, 'd1', 'own-pack-check')`], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
  await reload("#settings/admin");
  const learner = page.locator(`${PAGE} .lx-admin [data-part="switch"]`).first();
  await learner.waitFor({ timeout: 10_000 });
  assert(await learner.isChecked(), "the learner view is off by default for an admin");
  const adminRows = async () => (await page.locator(`${PAGE} .lx-admin .lx-row-title`).allTextContents()).map((s) => s.trim());
  const rows = await adminRows();
  assert(rows.includes("Feature flags") && !rows.includes("Ask for it") && !rows.includes("Share"), `Admin's rows with the learner view on: ${rows.join(", ")}`);
  await page.evaluate(() => (location.hash = "#explore?lang=nl"));
  same(await footRows(), ["Add your own pack"], "Explore's rows for an admin seeing it as a learner");
  await page.evaluate(() => (location.hash = "#settings/admin"));
  await learner.waitFor();
  await page.locator(`${PAGE} .lx-admin label`, { has: page.locator(".lx-row-title", { hasText: "See the app as a learner" }) }).click();
  await page.locator(`${PAGE} .lx-admin .lx-row-title`, { hasText: /^Ask for it$/ }).waitFor({ timeout: 5_000 });
  const off = await adminRows();
  assert(off.includes("Ask for it") && off.includes("Share"), `Admin's rows with the learner view off: ${off.join(", ")}`);
  same(await page.evaluate(() => localStorage.getItem("lx.learnerView.v1")), "off", "the choice kept on the device");
  await shot("6-admin-off");
  await page.evaluate(() => (location.hash = "#explore?lang=nl"));
  same(await footRows(), ["Add your own pack"], "Explore's rows for an admin with sharing for admins (the face waits for everyone)");
  await reload("#settings/admin");
  assert(!(await page.locator(`${PAGE} .lx-admin [data-part="switch"]`).first().isChecked()), "the learner view off after a reload");
});

await stage("Feature flags are previews on this device: each flag in order with what everyone has; one that can't be previewed disabled with why; a press sends only this device's preview, nothing for everyone; sharing previewed with the learner view on shows Explore as a learner would see it; every preview off at once", async () => {
  await page.locator(`${PAGE} .lx-row-title`, { hasText: "Feature flags" }).click();
  await page.waitForFunction(() => location.hash === "#settings/admin/flags");
  const rows = page.locator(`${PAGE} [data-flag]`);
  await rows.first().waitFor({ timeout: 10_000 });
  assert((await page.locator(PAGE).innerText()).includes("Only this device sees these."), "the page says only this device sees them");
  same(await rows.evaluateAll((all) => all.map((r) => r.dataset.flag)), FLAGS.map((f) => f.name), "the flags in the server's order");
  const states = await rows.evaluateAll((all) => all.map((r) => ({ flag: r.dataset.flag, line: r.querySelector(".lx-flag-state")?.textContent, on: r.querySelector("input")?.checked, disabled: r.querySelector("input")?.disabled ?? null })));
  same(states, [
    { flag: "COMMUNITY_SHARING", line: "For everyone: Admins", on: false, disabled: false },
    { flag: "PLAN_ENABLED", line: "For everyone: Off", on: false, disabled: false },
    { flag: "OWN_KEY_ENABLED", line: "For everyone: Off", on: false, disabled: false },
    { flag: "APPLE_SIGNIN", line: "Can't preview yet: Apple's ids and key aren't set", on: false, disabled: true },
  ], "each flag's switch and line");
  await shot("7-flags");
  // A press: this device's preview, at once, no sheet and nothing for everyone.
  await page.locator(`${PAGE} [data-flag="COMMUNITY_SHARING"] label`).click();
  await page.locator(`${PAGE} .lx-settings-message`, { hasText: "Previewing Sharing open to everyone on this device." }).waitFor({ timeout: 5_000 });
  same(await page.locator('[data-part="sheet"]:visible').count(), 0, "a sheet asking first");
  same(sent, [{ method: "PUT", path: "/api/admin/flags/COMMUNITY_SHARING/preview", body: { on: true } }], "what was sent");
  await shot("8-flag-previewed");
  // With the learner view on (this account's switch is off since the stage before), Explore's face is a learner's with sharing open.
  await page.evaluate(() => (location.hash = "#settings/admin"));
  await page.locator(`${PAGE} .lx-admin label`, { has: page.locator(".lx-row-title", { hasText: "See the app as a learner" }) }).click();
  same(await page.evaluate(() => localStorage.getItem("lx.learnerView.v1")), "on", "the learner view on again");
  await page.evaluate(() => (location.hash = "#explore?lang=nl"));
  same(await footRows(), ["Add your own pack", "Ask for it", "Share what you've made"], "Explore as a learner would see it with sharing open");
  // Every preview off: Explore is what everyone has again.
  await page.evaluate(() => (location.hash = "#settings/admin/flags"));
  await page.getByRole("button", { name: "Turn every preview off" }).click();
  await page.locator(`${PAGE} .lx-settings-message`, { hasText: "Every preview is off." }).waitFor({ timeout: 5_000 });
  same(sent.at(-1), { method: "DELETE", path: "/api/admin/previews", body: null }, "every preview off, sent");
  assert(!(await page.locator(`${PAGE} [data-flag="COMMUNITY_SHARING"] input`).isChecked()), "the sharing preview off");
  await page.evaluate(() => (location.hash = "#explore?lang=nl"));
  same(await footRows(), ["Add your own pack"], "Explore with every preview off");
  // The server's own (its /api/me unplayed too): its list, then a sharing preview for this device alone, which /api/me follows, and every
  // preview off again; nothing for everyone can be set from here. On a server at "admins" (wrangler.jsonc's own) the preview is what changes it.
  standIn = false;
  me.played = false;
  const real = await page.evaluate(async () => {
    const json = (r) => r.json().catch(() => null);
    const list = await fetch("/api/admin/flags").then(json);
    const sharingOf = async () => (await fetch("/api/me").then(json))?.features?.sharing;
    const before = await sharingOf();
    const put = await fetch("/api/admin/flags/COMMUNITY_SHARING/preview", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: true }) });
    const during = await sharingOf();
    const off = await fetch("/api/admin/previews", { method: "DELETE" });
    const after = await sharingOf();
    const sitewide = (await fetch("/api/admin/flags/COMMUNITY_SHARING", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "everyone" }) })).status;
    return { names: list?.flags?.map((f) => f.name), shaped: list?.flags?.every((f) => typeof f.preview?.on === "boolean"), before, put: put.status, during, off: off.status, after, sitewide };
  });
  standIn = true;
  me.played = true;
  assert(real.before === "admins", `this stage needs a server at COMMUNITY_SHARING "admins" (wrangler.jsonc's own): ${real.before}`);
  assert(real.shaped && real.put === 200 && real.during === "everyone" && real.off === 200 && real.after === real.before && real.sitewide === 404, `the server's previews: ${JSON.stringify(real)}`);
  return { server: real };
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.slice(0, 5).join("\n"));
});

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} stage(s) failed` : "all passed");
process.exit(failed ? 1 : 0);
