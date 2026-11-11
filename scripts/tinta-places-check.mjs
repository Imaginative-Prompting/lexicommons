// Tinta in lex-retention's places, in headless Chrome on a LOCAL server (it creates and deletes a test account, so never
// point it at the live site): every empty state a fresh account can reach shows Tinta in the pose its words call for
// (docs/design/retention/tinta-places.md), each 64 px, hidden from screen readers, taking no presses, and drawn in that
// pose (the part's own `base`: a name it doesn't know falls back to idle, which fails here). Today's first empty state
// writes on a page; Study's reviews with nothing due lounge; Know, Practice, Read and Explore's Yours write on a page;
// a practice, a request and a device that aren't here shrug; every pack off sits by a switch; Explore offline dozes.
// Then /design: each pose's demo, Welcome back's card and the paused reminders row with no Tinta (Home's one waves from the streak spot), the strip's mark.
// Fails on any console error. Chrome runs through quiet-browser.mjs: nothing is heard.
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta places check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/tinta-places-check.mjs http://localhost:<port> <outDir>

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { goRouted } from "./fixtures/routed.mjs";

const [BASE, outArg = "tinta-places-check-out"] = process.argv.slice(2);
const OUT = resolve(outArg);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("tinta-places-check creates and deletes an account: give it a local server, e.g. http://localhost:8824");
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
// Tinta's reactions, by where they play (the greeting's wave on the next-step card).
await context.addInitScript(() => {
  window.lxGreetPlays = [];
  customElements.whenDefined("lx-tinta").then(() => {
    const part = customElements.get("lx-tinta").prototype;
    const play = part.play;
    part.play = function (name) {
      if (this.closest?.('[data-part="next-step"]')) window.lxGreetPlays.push(name);
      return play.call(this, name);
    };
  });
});
const page = await context.newPage();
let offline = false;
page.on("console", (m) => m.type() === "error" && !offline && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

// A shot once the page has settled: a slide or a fade still running (a session leaving, a page arriving) would show two
// pages at once. Tinta's own loops never finish, so only finite animations are waited for (up to 3 s).
const shot = async (name) => {
  await page.evaluate(async () => {
    for (let i = 0; i < 60 && document.getAnimations().some((a) => a.effect?.getTiming().iterations !== Infinity && a.playState === "running"); i++) await new Promise((done) => setTimeout(done, 50));
  });
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
};

/**
 * The empty state holding these words, once it's drawn and Tinta's drawing has arrived: its Tinta's pose as drawn (the
 * part's `base`), its size, whether it's hidden from screen readers, and whether a press at its middle would reach it.
 */
const emptyAt = (words, { within = "body" } = {}) =>
  page.evaluate(
    async ({ words, within }) => {
      const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
      let empty = null;
      for (let i = 0; i < 100 && !empty; i++) {
        empty = [...document.querySelectorAll(`${within} [data-part="empty-state"]`)].find((e) => e.textContent.includes(words) && e.offsetParent !== null) ?? null;
        if (!empty) await sleep(100);
      }
      if (!empty) return null;
      const tinta = empty.querySelector(':scope > [data-part="character"]');
      if (!tinta) return { tinta: false };
      await customElements.whenDefined("lx-tinta");
      for (let i = 0; i < 50 && !tinta.querySelector("svg"); i++) await sleep(50);
      tinta.scrollIntoView({ block: "center" });
      await sleep(50);
      const box = tinta.getBoundingClientRect();
      const there = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { tinta: true, pose: tinta.base ?? null, asked: tinta.getAttribute("data-state"), size: tinta.getAttribute("data-size"), hidden: tinta.getAttribute("aria-hidden"), drawn: Boolean(tinta.querySelector("svg")), pressable: Boolean(there && (there === tinta || tinta.contains(there))) };
    },
    { words, within },
  );
const expectPose = async (words, pose, shotName, opts) => {
  const e = await emptyAt(words, opts);
  assert(e, `no empty state saying "${words}"`);
  assert(e.tinta, `no Tinta in the empty state saying "${words}"`);
  assert(e.pose === pose && e.size === "64" && e.hidden === "true" && e.drawn && !e.pressable, `"${words}": ${JSON.stringify(e)} (${pose} expected)`);
  if (shotName) await shot(shotName);
  return `${pose}`;
};

await stage("sign up with a passkey, land in the app", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Tinta Places");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  return "signed in";
});

await stage("Today, before a first session: it writes on a page above \"After your first session…\"", async () => {
  await page.goto(`${BASE}/app/#today`);
  return expectPose("After your first session", "page", "01-today-page");
});

await stage("Study's reviews with nothing due: it lounges in a puddle of itself", async () => {
  await page.goto(`${BASE}/app/#study/session/reviews`);
  return expectPose("Nothing is due yet", "lounge", "02-reviews-lounge");
});

await stage("Know, Practice and Explore's Yours, with nothing yet: it writes on a page; Read offers a first book", async () => {
  const said = [];
  await page.goto(`${BASE}/app/#know`);
  said.push(`know ${await expectPose("Nothing to show yet", "page", "03-know-page")}`);
  // Practice is offered once an AI is connected (a token will do).
  await page.evaluate(() => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "an AI, for this check" }) }));
  // Practice collects what's finished after it draws, here held back a moment: with nothing new, the same Tinta stays.
  await page.route("**/api/practice", async (route) => {
    await new Promise((done) => setTimeout(done, 1500));
    await route.continue().catch(() => {});
  });
  await page.goto(`${BASE}/app/#practice`);
  await page.reload();
  said.push(`practice ${await expectPose("Practices you finish are kept here", "page")}`);
  await page.evaluate(() => (document.querySelector('[data-part="page"] [data-part="empty-state"] [data-part="character"]').dataset.checkMark = "1"));
  await page.waitForTimeout(2500);
  assert(await page.locator('[data-part="page"] [data-part="empty-state"] [data-part="character"][data-check-mark="1"]').count(), "Practice drew its empty state, and Tinta, again with nothing new");
  await page.unroute("**/api/practice");
  await page.goto(`${BASE}/app/#read`);
  // Read has no empty state to show: with nothing yet, the first open book is the page's one thing.
  const hasBooks = await page.evaluate(async () => { try { const r = await fetch("/library/catalogue.json"); return r.ok && ((await r.json()).books ?? []).length > 0; } catch { return false; } });
  if (hasBooks) {
    const first = page.locator('[data-part="page"] [data-part="continue-card"]');
    await first.waitFor({ timeout: 15000 });
    assert(/A good first book/.test(await first.textContent()), "Read: a first book up front");
    assert(!(await emptyAt("The books you open and the texts you add are kept here")), "Read shows both a first book and an empty state");
    await shot("04-read-page");
    said.push("read a first book");
  }
  await page.goto(`${BASE}/app/#explore/yours`);
  said.push(`yours ${await expectPose("Nothing shared yet", "page")}`);
  return said.join(", ");
});

await stage("a practice, a request and a device that aren't here: it looks round and shrugs", async () => {
  const said = [];
  await page.goto(`${BASE}/app/#practice/past/not-here`);
  said.push(`practice ${await expectPose("That practice isn't on this device", "shrug", "05-practice-shrug")}`);
  await page.goto(`${BASE}/app/#ai/request/not-here`);
  said.push(`request ${await expectPose("That request isn't here any more", "shrug")}`);
  await page.goto(`${BASE}/app/#settings/install/not-a-device`);
  said.push(`device ${await expectPose("There are no steps for that device", "shrug")}`);
  return said.join(", ");
});

await stage("every pack turned off: it sits by a little switch, off", async () => {
  await page.goto(`${BASE}/app/#study`);
  await page.waitForSelector('[data-part="page"]');
  const ids = await page.evaluate(async () => {
    const packs = await import("/js/study/packs.js");
    const ids = packs.allPacks().map((p) => p.id);
    for (const id of ids) packs.setPackOn(id, false);
    return ids;
  });
  try {
    // Study drawn afresh: Home first, then Study once the app has settled at Home (an address set while the router is still
    // stepping back for Home is taken back).
    await goRouted(page, BASE, "#today");
    await goRouted(page, BASE, "#study");
    return `${await expectPose("Every pack is off", "off", "06-study-off")} (${ids.length} off)`;
  } finally {
    await page.evaluate(async (ids) => {
      const packs = await import("/js/study/packs.js");
      for (const id of ids) packs.setPackOn(id, true);
    }, ids);
  }
});

await stage("Explore offline: a line and its drawing, Tinta dozing until the drawing's here", async () => {
  offline = true;
  await context.setOffline(true);
  try {
    await page.evaluate(() => (location.hash = "#explore"));
    const e = await emptyAt("Explore needs a connection");
    assert(e, 'no empty state saying "Explore needs a connection"');
    const drawn = await page.locator('[data-part="empty-state"]', { hasText: "Explore needs a connection" }).locator(".lx-empty-art").count();
    assert(drawn || (e.tinta && e.pose === "doze"), `neither its drawing nor Tinta dozing: ${JSON.stringify(e)}`);
    await shot("07-explore-doze");
    return drawn ? "its drawing" : "doze";
  } finally {
    await context.setOffline(false);
    offline = false;
  }
});

await stage("/design: each pose's empty state, Welcome back's card and the paused row with no Tinta (Home's one is at the streak spot), the strip's mark", async () => {
  await page.goto(`${BASE}/design/`);
  const said = [];
  for (const [words, pose] of [["Nothing is due yet", "lounge"], ["Practices you finish are kept here", "page"], ["No Dutch pack on this device yet", "box"], ["That practice isn't on this device", "shrug"], ["Every pack is off", "off"], ["Explore needs a connection", "doze"]]) {
    said.push(await expectPose(words, pose));
  }
  const today = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    const card = [...document.querySelectorAll('[data-part="next-step"]')].find((c) => c.textContent.includes("Welcome back"));
    card?.scrollIntoView({ block: "center" });
    await sleep(600);
    const greeter = card?.querySelector('[data-part="character"]');
    const paused = document.querySelector('[data-part="home-card"][data-variant="paused"]');
    const sleeper = paused?.querySelector('[data-part="character"]');
    const marked = document.querySelector('[data-part="week-day"][data-tinta-pose="rest"]');
    return { card: Boolean(card), greeter: Boolean(greeter), plays: [...window.lxGreetPlays], paused: Boolean(paused), sleeper: Boolean(sleeper), marked: Boolean(marked) };
  });
  assert(today.card && !today.greeter && !today.plays.length, `Welcome back's card has a Tinta of its own: ${JSON.stringify(today)}`);
  assert(today.paused && !today.sleeper, `the paused card has a Tinta: ${JSON.stringify(today)}`);
  assert(today.marked, "no square marked for the rest day");
  await shot("08-design");
  return `${said.join(", ")}; Welcome back and the paused card with no Tinta; the rest day's square ringed`;
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
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
