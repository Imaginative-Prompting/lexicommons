// Tinta on the question cards (study/session.js; docs/design-system.md, "Tinta on a question"), in a real session on a
// phone, on a LOCAL server (it creates and deletes a test account):
// - in every game, beside the instruction: clear of every word and control, on the screen, hidden from screen
//   readers, taking no presses;
// - it says the sentence as it plays (Listening plays it at once);
// - it answers your answer: right, wrong (curious), nothing when you say you don't know;
// - a hint: it points at the words the hint marks, each in turn, and never at anything else (an answer); a press ends
//   it at once;
// - its eyes go to the tile you touch;
// - with animations off: its still, no pointing, no moves;
// - at 320 × 568, slowed 4×, an answer whose fit takes the instruction out: Tinta leaves with it over frames, rising with it, never in one
//   frame; a press where the fit had him hidden already shows none of him.
// Every browser comes from quiet-browser.mjs: nothing makes a sound.
//
// All of it on both libraries a learner can meet: with the lessons, and the starter alone. The local server needs path-nl, else exit 2.
//
// Usage (headless Chrome, so through gpu.py's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta cards check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/tinta-cards-check.mjs http://localhost:<port> <outDir>      (exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { knowWords } from "./fixtures/know-words.mjs";
import { goRouted } from "./fixtures/routed.mjs";

const [BASE, outArg = "tinta-cards-check-out"] = process.argv.slice(2);
const OUT = resolve(outArg);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("tinta-cards-check creates and deletes an account: give it a local server, e.g. http://localhost:8824");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}));
if (!(catalogue.packs?.nl ?? []).some((pack) => pack.id === "path-nl")) {
  console.error("tinta-cards-check: the local library doesn't list path-nl; seed it first (scripts/packs/seed-local.mjs packs/path-nl.json --default).");
  process.exit(2);
}

const results = [];
const problems = [];
let failed = 0;
let on = "";
async function stage(bare, fn) {
  const name = `[${on}] ${bare}`;
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - t, detail });
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    results.push({ stage: name, ok: false, ms: Date.now() - t, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};

const browser = await chromium.launch({ headless: true, channel: "chrome" });
// It runs on both libraries a learner can meet: with the lessons (a new learner's session comes from the path pack, in the device's
// voice where the server has no recordings of it), and the starter alone (built into the app, with its recordings).
async function checkOn(starterOnly) {
  on = starterOnly ? "the starter alone" : "with the lessons";
  problems.length = 0;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  if (starterOnly) {
    await context.route("**/library/catalogue.json", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), packs: {}, lists: {} } });
    });
  }
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

  const SESSION = '[data-part="session"]:not([data-ghost])';
  const TINTA = `${SESSION} [data-part="activity-prompt"] > [data-part="character"]`;
  // The item on the screen, from the content as it is now (the packs arrive after the app starts).
  const currentItem = async () => {
    const id = await page.locator(SESSION).getAttribute("data-item");
    return page.evaluate(async (id) => {
      const { itemById, sentence } = await import("/js/study/content.js");
      const item = itemById.get(id);
      return item ? { ...item, sentence: sentence(item) } : null;
    }, id);
  };
  /** A fresh session of one game (by way of Today: the same hash twice would leave the last one, answered, open). */
  async function openGame(game, { settled = true } = {}) {
    // (Home from a session is a tab's own page from another tab: the game goes in only once the app has settled there.)
    await goRouted(page, BASE, "#today");
    await page.waitForFunction(() => !document.querySelector('[data-part="session"]:not([data-ghost])'), null, { timeout: 8000 }).catch(() => {});
    await knowWords(page);
    await page.goto(`${BASE}/app/#study/session/game/${game}`);
    const ok = await page.waitForSelector(`${TINTA} svg`, { timeout: 8000 }).then(() => true, () => false);
    if (ok && settled) await page.waitForTimeout(400);
    return ok;
  }
  const hintButton = () => page.locator(`${SESSION} [data-part="answer-bar"] button`, { hasText: "Hint" }).first();
  /** What Tinta did every frame for `ms`: its state, whether it spoke (and how open), its gaze, and what was pointed at. */
  const watchTinta = (ms) =>
    page.evaluate(async ({ selector, ms }) => {
      const node = document.querySelector(selector);
      const out = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        await new Promise((r) => requestAnimationFrame(r));
        const pointed = [...document.querySelectorAll("[data-pointed]")].map((el) => ({ part: el.getAttribute("data-part"), state: el.getAttribute("data-state"), inHint: Boolean(el.closest(".lx-stimulus [data-part='literal-line']")), text: el.textContent }));
        out.push({ at: performance.now(), state: node?.getAttribute("data-state"), voice: speechSynthesis.speaking, speaking: node?.speaking ? { kind: node.speaking.kind, open: node.speaking.open } : null, looking: node?.looking ?? null, pointed, drawing: node?.querySelector("svg")?.innerHTML.length ?? 0 });
      }
      return out;
    }, { selector: TINTA, ms });

  await stage("sign up with a passkey", async () => {
    await page.goto(`${BASE}/app/`);
    await page.waitForURL(/\/login\?next=/);
    await page.click("summary");
    await page.fill('input[name="name"]', "Tinta Cards");
    await page.click('#register button[type="submit"]');
    await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
    await page.waitForSelector("html[data-app-ready]");
    const content = await page.evaluate(async () => {
      const { syncLibraryPacks, libraryPacks } = await import("/js/study/packs.js");
      await syncLibraryPacks();
      const { ITEMS } = await import("/js/study/content.js");
      return { items: ITEMS.length, packs: libraryPacks().filter((p) => p.language === "nl").map((p) => p.id) };
    });
    // That the library is the one this run is for, or the run proves nothing about it.
    assert(starterOnly ? content.packs.length === 0 : content.packs.includes("path-nl"), `library packs on the device: ${content.packs.join(", ") || "none"}`);
    return `signed in; ${content.items} items, ${content.packs.length ? `packs ${content.packs.join(", ")}` : "the starter alone"}`;
  });

  await stage("in every game, beside the instruction: clear of every word and control, on the screen, hidden, taking no presses", async () => {
    const seen = [];
    for (const game of ["choose", "arrange", "place", "fill", "type", "listen", "match", "say"]) {
      assert(await openGame(game), `${game}: no Tinta on its question`);
      const r = await page.evaluate((selector) => {
        const tinta = document.querySelector(selector);
        const box = tinta.getBoundingClientRect();
        const inner = { left: box.left + 4, right: box.right - 4, top: box.top + 4, bottom: box.bottom - 4 };
        const hit = (a) => a.width > 0 && a.height > 0 && a.left < inner.right && a.right > inner.left && a.top < inner.bottom && a.bottom > inner.top;
        const step = tinta.closest(".lx-step");
        const label = tinta.parentElement.querySelector(":scope > span");
        const range = document.createRange();
        range.selectNodeContents(label);
        const words = [...range.getClientRects()];
        // Everything else on the step that shows something: its words, its controls.
        const things = [...step.querySelectorAll("p, button, input, [data-part]")].filter((el) => !el.contains(tinta) && el !== tinta && !tinta.contains(el));
        const covers = [...words.filter(hit).map(() => "the instruction"), ...things.filter((el) => hit(el.getBoundingClientRect())).map((el) => el.getAttribute("data-part") ?? el.tagName.toLowerCase())];
        const middle = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return { covers, onScreen: box.left >= 0 && box.right <= innerWidth && box.top >= 0, hidden: tinta.getAttribute("aria-hidden") === "true", takesPresses: Boolean(middle && (middle === tinta || tinta.contains(middle))), size: Math.round(box.height) };
      }, TINTA);
      assert(r.covers.length === 0, `${game}: it covers ${r.covers.join(", ")}`);
      assert(r.onScreen && r.hidden && !r.takesPresses, `${game}: ${JSON.stringify(r)}`);
      seen.push(game);
    }
    await page.screenshot({ path: join(OUT, "say.png") });
    return `${seen.length} games: ${seen.join(", ")}; 64 px, clear of everything, hidden, no presses`;
  });

  await stage("it says the sentence as it plays (Listening plays it at once)", async () => {
    // Watched from the moment it's drawn: the device's voice, here with no recording, is over in half a second.
    assert(await openGame("listen", { settled: false }), "no Listening step");
    const frames = await watchTinta(4000);
    const spoke = frames.filter((f) => f.speaking);
    assert(spoke.length > 10 && spoke.every((f) => f.speaking.kind === "recording" || f.speaking.kind === "device"), `it should speak the sentence: ${spoke.length} frames`);
    assert(Math.max(...spoke.map((f) => f.speaking.open)) > 0.3, "its mouth should open");
    assert(spoke[0].at - frames[0].at < 1000, `at once: its mouth first moved ${Math.round(spoke[0].at - frames[0].at)} ms in`);
    assert(frames.at(-1).speaking === null, "its mouth should stop when the sentence is over");
    // With the device's voice, the mouth goes as long as the voice does, no longer and no less.
    const voiced = frames.filter((f) => f.voice);
    if (spoke[0].speaking.kind === "device") {
      const together = voiced.filter((f) => f.speaking).length;
      assert(voiced.length > 10 && together >= voiced.length * 0.9 && spoke.length <= voiced.length * 1.1, `the mouth with the voice: ${together} of the voice's ${voiced.length} frames, ${spoke.length} of the mouth's`);
    }
    return `${spoke.length} frames speaking (${spoke[0].speaking.kind}), opening to ${Math.max(...spoke.map((f) => f.speaking.open)).toFixed(2)}`;
  });

  await stage("it answers your answer: right, wrong (curious), and nothing for I don't know", async () => {
    const states = {};
    for (const [name, wrong] of [["right", false], ["wrong", true]]) {
      assert(await openGame("choose"), "no Choose step");
      const item = await currentItem();
      const session = page.locator(SESSION);
      const watching = watchTinta(500);
      await session.locator('[data-part="choice"]', { hasText: wrong ? item.wrong[0] : item.sentence }).first().click();
      states[name] = [...new Set((await watching).map((f) => f.state))];
    }
    assert(await openGame("choose"), "no Choose step");
    const watching = watchTinta(800);
    await page.locator(SESSION).getByRole("button", { name: "I don't know" }).click();
    states.skipped = [...new Set((await watching).map((f) => f.state))];
    assert(states.right.includes("right") && !states.right.includes("wrong"), `a right answer: ${states.right}`);
    assert(states.wrong.includes("wrong") && !states.wrong.includes("right"), `a wrong one: ${states.wrong}`);
    assert(states.skipped.every((s) => s === "idle"), `I don't know: ${states.skipped}`);
    return `right → ${states.right.join("/")}, wrong → ${states.wrong.join("/")}, I don't know → ${states.skipped.join("/")}`;
  });

  await stage("a hint: it points at the words the hint marks, each in turn, never at anything else; a press ends it", async () => {
    // A sentence whose hint marks words (not every one of a library's does).
    let marked = [];
    for (let tries = 0; tries < 12 && !marked.length; tries++) {
      assert(await openGame("arrange"), "no Arrange step");
      marked = await page.locator(`${SESSION} .lx-stimulus [data-part="literal-chunk"][data-state="moved"]`).allTextContents();
    }
    const watching = watchTinta(3600);
    await hintButton().click();
    const frames = await watching;
    writeFileSync(join(OUT, "hint-frames.json"), JSON.stringify(frames.map(({ at, state, pointed }) => ({ at, state, pointed })), null, 1));
    const pointedAt = frames.flatMap((f) => f.pointed);
    const order = [];
    for (const f of frames) for (const p of f.pointed) if (order.at(-1) !== p.text) order.push(p.text);
    assert(marked.length > 0, "the hint should mark words");
    assert(pointedAt.length > 0 && pointedAt.every((p) => p.part === "literal-chunk" && p.state === "moved" && p.inHint), `it should point only at the hint's marked words: ${JSON.stringify(pointedAt.find((p) => !(p.part === "literal-chunk" && p.inHint)))}`);
    assert(JSON.stringify(order) === JSON.stringify(marked), `each marked word in turn: ${JSON.stringify(order)} vs ${JSON.stringify(marked)}`);
    assert(frames.some((f) => f.state === "point") && frames.at(-1).state === "idle" && frames.at(-1).pointed.length === 0, "it should point, then be idle with nothing marked");
    // Again, and a press mid-point ends it at once.
    let again = 0;
    for (let tries = 0; tries < 12 && !again; tries++) {
      assert(await openGame("arrange"), "no Arrange step");
      again = await page.locator(`${SESSION} .lx-stimulus [data-part="literal-chunk"][data-state="moved"]`).count();
    }
    await hintButton().click();
    await page.waitForTimeout(700);
    const before = await watchTinta(50);
    await page.locator(`${SESSION} [data-part="arrange-bank"] [data-part="tile"]`).first().click();
    const after = await watchTinta(120);
    assert(before.at(-1).state === "point", `it should be pointing before the press: ${before.at(-1).state}`);
    assert(after.every((f) => f.state === "idle" && f.pointed.length === 0), `a press should end it at once: ${JSON.stringify(after[0])}`);
    return `it pointed at ${order.join(", then ")} (the hint's marked words) and nothing else; a press ended it at once`;
  });

  await stage("its eyes go to the tile you touch", async () => {
    assert(await openGame("arrange"), "no Arrange step");
    const tile = page.locator(`${SESSION} [data-part="arrange-bank"] [data-part="tile"]`).first();
    await tile.click();
    const frames = await watchTinta(350);
    const g = frames.at(-1).looking;
    // The bank sits below it and to its left: its eyes (y up) go down and left.
    assert(g && g.weight > 0.5 && g.look[0] < -0.1 && g.look[1] < -0.1, `its eyes should go to the tile: ${JSON.stringify(g)}`);
    return `to [${g.look.map((v) => v.toFixed(2)).join(", ")}], ×${g.weight.toFixed(2)}`;
  });

  await stage("with animations off: its still; no pointing; no moves", async () => {
    await page.evaluate(() => localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, presets: { motion: "off" } })));
    await page.reload();
    await page.waitForSelector("html[data-app-ready]");
    assert(await openGame("arrange"), "no Arrange step");
    const watching = watchTinta(1500);
    await page.waitForTimeout(300);
    await hintButton().click();
    const frames = await watching;
    await page.evaluate(() => localStorage.removeItem("lx.appearance.v1"));
    const changes = frames.filter((f, i) => i && f.drawing !== frames[i - 1].drawing).length;
    assert(frames.every((f) => f.pointed.length === 0 && f.state !== "point"), "no pointing with animations off");
    assert(changes === 0, `its still should hold: ${changes} changes`);
    return `${frames.length} frames, the still unchanged, no pointing`;
  });

  await stage("delete the account", async () => {
    await page.goto(`${BASE}/app/#settings/account`);
    const row = (text) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${text}$`) }) }).first();
    await row("Delete my account").click();
    await row("Press again to delete it for good").click();
    await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
    return "deleted";
  });

  await stage("no console errors", async () => {
    const real = problems.filter((p) => !/status of 401/.test(p));
    assert(real.length === 0, real.join(" | "));
    return "clean";
  });

  await context.close();
}
// At 320 × 568 a step's fit tightens once it's answered and takes the instruction out, Tinta beside it too (components.css fit 5–7): he
// leaves with the instruction, in its own rise and fade (session.js stepParts and WRAPS, motion.js glideFrom), never in one frame (7 Nov:
// lesson 1's first picture question, answered right, fit 2 → 5, gone from one frame to the next). A press in the answered step, where the fit
// has him hidden already, makes no copy of him.
async function exitAt320() {
  on = "320 × 568, slowed 4×";
  problems.length = 0;
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block", colorScheme: "dark" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const S = '[data-part="session"]:not([data-ghost])';
  await stage("Tinta leaves with the instruction when an answered step's fit takes it out: over frames, rising with it, never in one; none of him where he was hidden already", async () => {
    await page.goto(`${BASE}/app/`);
    await page.waitForURL(/\/login\?next=/);
    await page.click("summary");
    await page.fill('input[name="name"]', "Tinta Exit");
    await page.click('#register button[type="submit"]');
    await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
    await page.waitForSelector("html[data-app-ready]", { state: "attached" });
    await page.evaluate(async () => {
      localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
      await (await import("/js/study/packs.js")).syncLibraryPacks().catch(() => {});
    });
    await page.reload();
    await page.waitForSelector("html[data-app-ready]", { state: "attached" });
    await page.evaluate(() => (location.hash = "#study/session/lesson"));
    await page.waitForFunction((S) => document.querySelector(S)?.getAttribute("data-step") === "see", S, { timeout: 30_000 });
    await page.waitForTimeout(2500);
    const before = await page.evaluate((S) => {
      const s = document.querySelector(S);
      const t = s.querySelector('[data-part="activity-prompt"] > [data-part="character"]');
      const pick = s.querySelectorAll('[data-part="picture-choice"]')[s.lxStep?.correct ?? 0]?.getBoundingClientRect();
      return { tinta: Boolean(t?.getClientRects().length), fit: s.getAttribute("data-fit"), at: pick && { x: pick.left + pick.width / 2, y: pick.top + pick.height / 2 } };
    }, S);
    assert(before.tinta && before.at, `Tinta beside the instruction and a picture to tap: ${JSON.stringify(before)}`);
    // Every frame for `ms`: how much of him is seen, live beside the instruction or as a copy in motion's ghost layer.
    const watch = (ms) =>
      page.evaluate(
        ([S, ms]) =>
          new Promise((done) => {
            const t0 = performance.now(), frames = [];
            const seen = (n) => {
              if (!n.getClientRects().length || getComputedStyle(n).visibility === "hidden") return 0;
              let o = 1;
              for (let p = n; p && p !== document.documentElement; p = p.parentElement) o *= Number(getComputedStyle(p).opacity);
              return o;
            };
            const look = () => {
              const s = document.querySelector(S);
              const live = s?.querySelector('[data-part="activity-prompt"] > [data-part="character"]');
              const copies = [...document.querySelectorAll('[data-motion-layer] [data-part="character"]')].map((c) => ({ o: seen(c), top: c.getBoundingClientRect().top }));
              frames.push({ t: Math.round(performance.now() - t0), fit: s?.getAttribute("data-fit") ?? null, live: live ? seen(live) : 0, copies });
              if (performance.now() - t0 < ms) requestAnimationFrame(look);
              else done(frames);
            };
            requestAnimationFrame(look);
          }),
        [S, ms],
      );
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const watching = watch(1000);
    await page.waitForTimeout(30);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [before.at] });
    await page.waitForTimeout(40);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const frames = await watching;
    const shown = (f) => Math.max(f.live, ...f.copies.map((c) => c.o));
    const fit = frames.at(-1).fit;
    const vanish = frames.flatMap((f, i) => (i && shown(frames[i - 1]) >= 0.95 && shown(f) <= 0.05 ? [`${frames[i - 1].t}→${f.t} ms`] : []));
    const faded = frames.filter((f) => shown(f) > 0.05 && shown(f) < 0.95).length;
    const tops = frames.flatMap((f) => f.copies.filter((c) => c.o > 0.05).map((c) => c.top));
    assert(Number(fit) >= 5, `the answer's fit takes the instruction out here: fit ${before.fit ?? 0} → ${fit}`);
    assert(!vanish.length && faded >= 2, `he leaves over frames, never in one: gone in one frame at ${vanish.join(", ") || "none"}; ${faded} frames part faded`);
    assert(tops.length >= 2 && tops.at(-1) < tops[0], `his copy rises with the card: from ${tops[0]?.toFixed(0)} to ${tops.at(-1)?.toFixed(0)} px`);
    // A press in the answered step (its card's sound), where the fit has him hidden: no copy of him.
    const sound = await page.evaluate((S) => {
      const b = document.querySelector(S)?.querySelector('[data-part="see-word"] button, [data-part="see-word"] [role="button"]')?.getBoundingClientRect();
      return b && { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, S);
    let again = [];
    if (sound) {
      const watchingAgain = watch(800);
      await page.waitForTimeout(30);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [sound] });
      await page.waitForTimeout(40);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      again = (await watchingAgain).filter((f) => f.copies.some((c) => c.o > 0.05) || f.live > 0.05);
      assert(!again.length, `a press with him already hidden shows none of him: ${again.length} frames (${JSON.stringify(again[0])})`);
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    return `fit ${before.fit ?? 0} → ${fit}: ${faded} frames part faded, his copy rising ${tops[0]?.toFixed(0)} → ${tops.at(-1)?.toFixed(0)} px; ${sound ? "a press with him hidden: none of him" : "(no sound button to press)"}`;
  });
  await stage("delete the account", async () => {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await page.goto(`${BASE}/app/#settings/account`);
    const row = (text) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${text}$`) }) }).first();
    await row("Delete my account").click();
    await row("Press again to delete it for good").click();
    await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
    return "deleted";
  });
  await stage("no page errors", async () => {
    assert(problems.length === 0, problems.join(" | "));
    return "clean";
  });
  await context.close();
}

await checkOn(false);
await checkOn(true);
await exitAt320();
await browser.close();
writeFileSync(join(OUT, "tinta-cards-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
console.log(`${results.filter((r) => r.ok).length}/${results.length} stages passed`);
process.exit(failed ? 1 : 0);
