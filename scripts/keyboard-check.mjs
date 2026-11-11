// The keyboard on a phone: typing on a page, the app takes the screen above the keys (the header stays where it is, a
// field pinned at the page's foot sits on the keys) and the tab bar steps aside; in a sheet, the keyboard rides over
// it, the sheet keeping its height and place, and a field low in it scrolls clear of the keys. Headless Chrome has no
// on-screen keyboard, so the page's visualViewport is a stand-in that a keyboard opening shortens (as iOS and Chrome
// on Android do): this holds the app's side of it, not a real phone's. LOCAL only: it signs up a test account.
// Usage: node scripts/keyboard-check.mjs http://localhost:<port> <outDir>   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/keyboard-check.mjs http://localhost:<port> <outDir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const KB = 336; // an iPhone's keyboard, with its suggestion bar, on a 390 × 844 screen

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const desk = await browser.newContext();
const signup = await desk.newPage();
const cdp = await desk.newCDPSession(signup);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await signup.goto(`${BASE}/app/`);
await signup.waitForURL(/\/login\?next=/);
await signup.click("summary");
await signup.fill('input[name="name"]', "Keyboard Check");
await signup.click('#register button[type="submit"]');
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await phone.addCookies(await desk.cookies());
// The stand-in visual viewport: window.lxKeyboard(px) opens a keyboard that tall (0 closes it).
await phone.addInitScript(() => {
  const vv = new EventTarget();
  let kb = 0;
  let pan = 0; // what iOS scrolls the page by to reveal a field
  // As iOS 26 does while it's panned: innerHeight falls with it (measured on the simulator: 714 → 517 for a pan of 197).
  const realInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight").get;
  const screenHeight = () => realInnerHeight.call(window);
  Object.defineProperty(window, "innerHeight", { configurable: true, get: () => screenHeight() - pan });
  Object.defineProperties(vv, {
    height: { get: () => screenHeight() - kb },
    width: { get: () => innerWidth },
    offsetTop: { get: () => pan },
    offsetLeft: { get: () => 0 },
    pageTop: { get: () => pan },
    pageLeft: { get: () => 0 },
    scale: { get: () => 1 },
  });
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  window.lxKeyboard = (px, { panned = 0 } = {}) => {
    kb = px;
    pan = panned;
    vv.dispatchEvent(new Event("resize"));
  };
});
const page = await phone.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const results = {};
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
async function stage(name, fn) {
  try {
    results[name] = { ok: true, note: (await fn()) ?? "" };
    console.log(`PASS ${name}: ${results[name].note}`);
  } catch (error) {
    failed++;
    results[name] = { ok: false, note: String(error.stack ?? error) };
    console.log(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: `${OUT}/fail-${Object.keys(results).length}.png` }).catch(() => {});
  }
}
const keyboard = async (px) => {
  await page.evaluate((h) => window.lxKeyboard(h), px);
  await page.waitForTimeout(300);
};
const frame = () =>
  page.evaluate(() => {
    const box = (sel) => document.querySelector(sel)?.getBoundingClientRect().toJSON() ?? null;
    const tabs = document.querySelector('[data-part="app"] > [data-part="tab-bar"]');
    return {
      keyboard: document.documentElement.hasAttribute("data-keyboard"),
      header: box('[data-part="app"] > [data-part="app-header"]'),
      app: box('[data-part="app"]'),
      tabsShown: Boolean(tabs && getComputedStyle(tabs).display !== "none" && tabs.getBoundingClientRect().height > 0),
      field: document.activeElement?.getBoundingClientRect().toJSON() ?? null,
    };
  });

await page.goto(`${BASE}/app/#today`);
await page.waitForSelector("html[data-app-ready]");

await stage("typing on a page: the app takes the screen above the keys, the header stays, the tab bar steps aside", async () => {
  const before = await frame();
  const field = page.locator('textarea[placeholder="Translate"]').first();
  await field.waitFor();
  await field.focus();
  await keyboard(KB);
  const up = await frame();
  await page.screenshot({ path: `${OUT}/typing-today.png` });
  await page.locator("body").evaluate(() => document.activeElement?.blur());
  await keyboard(0);
  const down = await frame();
  assert(before.tabsShown && !before.keyboard, `before: ${JSON.stringify(before)}`);
  assert(up.keyboard && !up.tabsShown, `typing: the tab bar still showing (${JSON.stringify(up)})`);
  assert(Math.abs(up.header.top - before.header.top) < 1, `the header moved: ${before.header.top} → ${up.header.top}`);
  assert(Math.abs(up.app.bottom - (844 - KB)) <= 1, `the app ends at the keyboard: ${up.app.bottom} (keys from ${844 - KB})`);
  assert(up.field && up.field.bottom <= 844 - KB, `the field behind the keys: ${up.field?.bottom}`);
  assert(!down.keyboard && down.tabsShown && Math.abs(down.app.bottom - 844) <= 1, `closed: ${JSON.stringify(down)}`);
  return `header at ${Math.round(up.header.top)} throughout; app ${Math.round(before.app.height)} → ${Math.round(up.app.height)} → ${Math.round(down.app.height)} px; tab bar away while typing`;
});

await stage("the AI section: a request's page, its field above the keys and its Send, pinned at the page's foot, sitting on them", async () => {
  // A request's own page, with an AI connected: what it's for typed in its field, Send to your AI pinned low.
  await page.evaluate(() => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "an AI, for this check" }) }));
  await page.evaluate(() => localStorage.setItem("lx.shell.v1", JSON.stringify({ third: "ai" })));
  await page.goto(`${BASE}/app/#ai/new/pack_new`);
  await page.reload();
  const field = page.locator('textarea[aria-label="What it\'s for"]');
  await field.waitFor();
  await field.focus();
  await keyboard(KB);
  const up = await frame();
  const send = await page.locator('[data-part="pinned-actions"]').evaluate((node) => node.getBoundingClientRect().toJSON());
  await page.screenshot({ path: `${OUT}/typing-ai.png` });
  await page.locator("body").evaluate(() => document.activeElement?.blur());
  await keyboard(0);
  assert(up.field && up.field.bottom <= 844 - KB, `the field at ${Math.round(up.field?.top)}–${Math.round(up.field?.bottom)}, under the keys (from ${844 - KB})`);
  assert(send.bottom <= 844 - KB && send.bottom >= 844 - KB - 120, `Send at ${Math.round(send.top)}–${Math.round(send.bottom)} (keys from ${844 - KB})`);
  return `the field clear of the keys; Send ends ${Math.round(844 - KB - send.bottom)} px above them`;
});

await stage("a sheet: the keyboard rides over it, the sheet keeps its height and place, a low field scrolls clear", async () => {
  // A sheet from the design system, its field under a long list (as a form's last field is).
  await page.evaluate(async () => {
    const ui = await import("/js/lx/ui.js");
    const layer = ui.sheetLayer({ label: "Keyboard check" });
    const rows = Array.from({ length: 14 }, (_, i) => ui.listRow({ icon: "book", title: `Row ${i + 1}`, sub: "Something to scroll past" }));
    const field = document.createElement("input");
    field.setAttribute("data-part", "text-field");
    field.setAttribute("aria-label", "The last field");
    layer.lxBody.append(ui.el("ul", { part: "list" }, rows), field);
    window.lxCheckLayer = layer;
    layer.lxOpen();
  });
  await page.waitForTimeout(900);
  const sheet = () => page.evaluate(() => {
    const s = window.lxCheckLayer.lxPanel;
    const body = s.querySelector(".lx-sheet-body");
    return { top: s.getBoundingClientRect().top, height: s.getBoundingClientRect().height, pad: parseFloat(getComputedStyle(body).paddingBottom) };
  });
  const before = await sheet();
  await page.locator('input[aria-label="The last field"]').focus();
  await keyboard(KB);
  await page.waitForTimeout(200);
  const up = await sheet();
  const field = await page.locator('input[aria-label="The last field"]').evaluate((n) => n.getBoundingClientRect().toJSON());
  await page.screenshot({ path: `${OUT}/typing-sheet.png` });
  await page.locator("body").evaluate(() => document.activeElement?.blur());
  await keyboard(0);
  await page.evaluate(() => window.lxCheckLayer.lxClose({ animate: false }));
  assert(Math.abs(up.top - before.top) < 1 && Math.abs(up.height - before.height) < 1, `the sheet moved or shrank: top ${before.top} → ${up.top}, height ${before.height} → ${up.height}`);
  assert(field.bottom <= 844 - KB && field.top >= before.top, `the last field at ${Math.round(field.top)}–${Math.round(field.bottom)}, keys from ${844 - KB}`);
  assert(up.pad >= KB, `room at the content's foot for the keys: ${up.pad} px`);
  return `sheet at ${Math.round(up.top)}, ${Math.round(up.height)} px tall throughout; the last field scrolled to ${Math.round(field.top)}–${Math.round(field.bottom)}, above the keys at ${844 - KB}`;
});

await stage("a sheet's form with its button pinned at the foot: the keys up, the button above them, a low field clear of the button", async () => {
  // A form in a sheet as Explore's are: rows, a field, then its main button pinned (ui.pinnedActions).
  await page.evaluate(async () => {
    const ui = await import("/js/lx/ui.js");
    const layer = ui.sheetLayer({ label: "Keyboard form check" });
    const rows = Array.from({ length: 14 }, (_, i) => ui.listRow({ icon: "book", title: `Row ${i + 1}`, sub: "Something to scroll past" }));
    const field = document.createElement("input");
    field.setAttribute("data-part", "text-field");
    field.setAttribute("aria-label", "The form's field");
    const status = ui.el("p", { class: "lx-small", role: "status" });
    layer.lxBody.append(ui.el("div", { class: "lx-stack" }, ui.el("ul", { part: "list" }, rows), field, ui.pinnedActions([ui.button("Send it", { variant: "go", block: true })], { status })));
    window.lxCheckLayer = layer;
    layer.lxOpen();
  });
  await page.waitForTimeout(900);
  const at = () =>
    page.evaluate(() => {
      const s = window.lxCheckLayer.lxPanel;
      const foot = s.querySelector('[data-part="pinned-actions"]');
      const buttons = foot.querySelector(".lx-pinned-buttons").getBoundingClientRect();
      const field = s.querySelector('input[aria-label="The form\'s field"]').getBoundingClientRect();
      return { sheetTop: s.getBoundingClientRect().top, footTop: foot.getBoundingClientRect().top, buttonsTop: buttons.top, buttonsBottom: buttons.bottom, footPad: parseFloat(getComputedStyle(foot).paddingBottom), fieldTop: field.top, fieldBottom: field.bottom };
    });
  const rest = await at();
  // At rest, the button is in view at the sheet's foot while the rows run under it.
  assert(rest.buttonsBottom <= 844 && rest.buttonsTop > rest.sheetTop + 200, `at rest the button at ${Math.round(rest.buttonsTop)}–${Math.round(rest.buttonsBottom)}`);
  await page.locator(`input[aria-label="The form's field"]`).focus();
  await keyboard(KB);
  await page.waitForTimeout(250);
  const up = await at();
  await page.screenshot({ path: `${OUT}/typing-sheet-form.png` });
  await page.locator("body").evaluate(() => document.activeElement?.blur());
  await keyboard(0);
  await page.evaluate(() => window.lxCheckLayer.lxClose({ animate: false }));
  assert(up.buttonsBottom <= 844 - KB + 1, `the button under the keys: ${Math.round(up.buttonsTop)}–${Math.round(up.buttonsBottom)}, keys from ${844 - KB}`);
  assert(up.footPad >= KB, `the foot's room for the keys: ${up.footPad} px`);
  // Clear of the whole foot, its fade too: a field under the fade can't be read.
  assert(up.fieldBottom <= up.footTop + 1 && up.fieldTop >= up.sheetTop, `the field at ${Math.round(up.fieldTop)}–${Math.round(up.fieldBottom)}, the foot (its fade) from ${Math.round(up.footTop)}`);
  return `at rest the button at ${Math.round(rest.buttonsTop)}; keys up: the button at ${Math.round(up.buttonsTop)}–${Math.round(up.buttonsBottom)} above the keys at ${844 - KB}, the field at ${Math.round(up.fieldTop)}–${Math.round(up.fieldBottom)}`;
});

// iOS 26's own numbers, read off a real simulator (iPhone 17, a 714 px page): the keys take 337 px, and if a field's press got through to
// iOS it pans the page 197 px and innerHeight falls to 517. The sum the app first used (innerHeight − height − offsetTop) comes to less than
// nothing there, so the keys went unseen and the top of the app went off the screen.
await stage("iOS 26's numbers: the page panned and innerHeight fallen, the keys are still seen, and the app is drawn back to the top", async () => {
  await page.goto(`${BASE}/app/#today`);
  const field = page.locator('textarea[placeholder="Translate"]').first();
  await field.waitFor();
  await field.focus();
  await page.evaluate(() => window.lxKeyboard(337, { panned: 197 }));
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => ({ on: document.documentElement.hasAttribute("data-keyboard"), height: document.querySelector('[data-part="app"]').getBoundingClientRect().height, transform: getComputedStyle(document.querySelector('[data-part="app"]')).transform }));
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.lxKeyboard(0);
  });
  await page.waitForTimeout(200);
  assert(state.on, `the keys weren't seen: ${JSON.stringify(state)}`);
  assert(Math.abs(state.height - (844 - 337)) <= 1, `the app takes the screen above the keys: ${state.height}`);
  assert(/, 197\)$/.test(state.transform), `the app isn't drawn back by the pan: ${state.transform}`);
  return `app ${state.height} px, ${state.transform}`;
});

await stage("a hardware keyboard's small bar (58 px) counts as keys; a toolbar's few pixels don't", async () => {
  await page.goto(`${BASE}/app/#today`);
  const field = page.locator('textarea[placeholder="Translate"]').first();
  await field.waitFor();
  await field.focus();
  await keyboard(58);
  const bar = await page.evaluate(() => document.documentElement.hasAttribute("data-keyboard"));
  await keyboard(20);
  const toolbar = await page.evaluate(() => document.documentElement.hasAttribute("data-keyboard"));
  await page.evaluate(() => document.activeElement?.blur());
  await keyboard(0);
  assert(bar && !toolbar, `bar ${bar}, toolbar ${toolbar}`);
});

const SESSION = '[data-part="session"]:not([data-ghost])';
await stage("Type in a session: the top stays where it was, the field moves only as far as it has to, Check sits on the keys and takes a press", async () => {
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => {
    const { syncLibraryPacks } = await import("/js/study/packs.js");
    await syncLibraryPacks();
    const { record } = await import("/js/study/progress.js");
    const { CHUNKS, WORDS } = await import("/js/study/content.js");
    record([...Object.keys(WORDS).map((w) => `w:${w}`), ...Object.keys(CHUNKS).map((c) => `c:${c}`)].map((concept) => ({ concept, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "check" })));
    await new Promise((r) => setTimeout(r, 200));
    location.hash = "#study/session/game/type";
  });
  const input = page.locator(`${SESSION} input`).first();
  await input.waitFor();
  await page.waitForTimeout(600);
  const rects = () => page.evaluate((SESSION) => {
    const box = (s) => document.querySelector(`${SESSION} ${s}`)?.getBoundingClientRect().toJSON() ?? null;
    return { close: box('[data-part="session-bar"] button'), bar: box('[data-part="session-bar"]'), prompt: box('[data-part="activity-prompt"]'), field: box("input"), check: box('[data-part="answer-bar"] [data-variant="white"]'), answer: box('[data-part="answer-bar"]') };
  }, SESSION);
  const before = await rects();
  await input.focus();
  await keyboard(337);
  await page.waitForTimeout(450);
  const up = await rects();
  const keysAt = 844 - 337;
  assert(Math.abs(up.close.top - before.close.top) < 1 && Math.abs(up.bar.top - before.bar.top) < 1, `the top moved: close ${before.close.top} → ${up.close.top}`);
  assert(up.prompt.top >= before.prompt.top - 8, `the instruction moved up: ${before.prompt.top} → ${up.prompt.top}`);
  assert(up.field.bottom <= up.answer.top + 1, `the field under the bar: ${up.field.bottom} > ${up.answer.top}`);
  assert(up.answer.bottom <= keysAt + 1, `the bar under the keys: ${up.answer.bottom} > ${keysAt}`);
  // On a tall screen, keys short enough to clear it: it stays exactly where it was.
  await keyboard(180);
  await page.waitForTimeout(450);
  const low = await rects();
  assert(Math.abs(low.field.top - before.field.top) < 1, `a field clear of the keys moved: ${before.field.top} → ${low.field.top}`);
  await keyboard(337);
  await page.waitForTimeout(300);
  await input.fill("xyz");
  const check = await rects();
  await page.touchscreen.tap(check.check.left + check.check.width / 2, check.check.top + check.check.height / 2);
  await page.waitForTimeout(150);
  const result = await page.evaluate((SESSION) => ({ continued: document.querySelector(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`)?.textContent ?? "", keyboard: document.documentElement.hasAttribute("data-keyboard"), focus: document.activeElement?.tagName }), SESSION);
  await keyboard(0);
  assert(/Continue|See how/.test(result.continued), `Check's press was lost: ${JSON.stringify(result)}`);
  assert(!result.keyboard && result.focus !== "INPUT", `the keys should go with the answer: ${JSON.stringify(result)}`);
  return `close ${up.close.top} throughout; field ${before.field.top} → ${up.field.top} with the keys, ${low.field.top} with short keys`;
});

// A small phone with the keys up (lex-sound's iOS Simulator walk, 7 Nov 2026: on an iPhone SE, 375 × 667, with 289 px of keys and iOS's form
// bar, Translate's floating language bar covered the lower half of the answer "I drink coffee." and half its speaker). The answer and its
// speaker stay whole above the bar, under the box, at every height the keys leave; the 390 × 844 phone, clear before, the same.
await stage("Translate with the keys up on a small phone: the answer and its speaker whole above the floating language bar, and the typed line whole in its box, at every height the keys leave", async () => {
  const sizes = [
    { w: 375, h: 667, keys: [216, 240, 260, 289, 304, 320] },
    { w: 390, h: 844, keys: [260, 300, 337, 360] },
  ];
  const FIELD = '[data-part="translate-field"] :is(textarea, input)';
  const BEST = '[data-part="translate-result"][data-state="best"]';
  const seen = [];
  const bad = [];
  const geometry = [];
  try {
    for (const { w, h, keys } of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${BASE}/app/#today`);
      await page.waitForSelector("html[data-app-ready]");
      await page.locator(FIELD).first().tap({ position: { x: 24, y: 20 } });
      for (const kb of keys) {
        await keyboard(kb);
        await page.locator(FIELD).first().fill("");
        await page.keyboard.type("ik drink koffie", { delay: 20 });
        await page.waitForSelector(BEST, { timeout: 30_000 });
        await page.waitForTimeout(700); // the box's move to its place (260 ms) and the answer's
        const g = await page.evaluate((best) => {
          const answer = document.querySelector(best);
          const bar = document.querySelector(".lx-today-translate .lx-way-bar") ?? document.querySelector(".lx-way-bar");
          const box = document.querySelector('[data-part="translate-field"]');
          const a = answer.getBoundingClientRect();
          // Its speaker: a button of the results on the answer's own line.
          const speakers = [...document.querySelectorAll(".lx-tr-results button, [data-part='translate-result'] button")].map((b) => b.getBoundingClientRect()).filter((r) => r.height && r.bottom > a.top + 2 && r.top < a.bottom - 2);
          const bottom = Math.max(a.bottom, ...speakers.map((r) => r.bottom));
          // Every part between the header and the bar, for whoever reads translate-geometry.json.
          const r = (el) => (el ? (({ top, bottom, height }) => ({ top: Math.round(top), bottom: Math.round(bottom), height: Math.round(height) }))(el.getBoundingClientRect()) : null);
          const parts = {
            header: r(document.querySelector('[data-part="app"] > [data-part="app-header"]')),
            translate: r(document.querySelector(".lx-today-translate")),
            box: r(box),
            boxInner: [...box.children].map((c) => ({ cls: c.className?.baseVal ?? c.className, ...r(c) })),
            results: r(document.querySelector(".lx-tr-results")),
            voice: { ...r(document.querySelector(".lx-today-translate > .lx-tr-voice")), display: getComputedStyle(document.querySelector(".lx-today-translate > .lx-tr-voice")).display, text: document.querySelector(".lx-today-translate > .lx-tr-voice").innerText.slice(0, 60), html: document.querySelector(".lx-today-translate > .lx-tr-voice").innerHTML.slice(0, 200) },
            scroll: { ...r(document.querySelector(".lx-today-translate > .lx-tr-scroll")), padTop: getComputedStyle(document.querySelector(".lx-today-translate > .lx-tr-scroll")).paddingTop, scrollTop: document.querySelector(".lx-today-translate > .lx-tr-scroll").scrollTop },
            scrollKids: [...document.querySelector(".lx-today-translate > .lx-tr-scroll").children].map((c) => ({ cls: c.className, display: getComputedStyle(c).display, mt: getComputedStyle(c).marginTop, pt: getComputedStyle(c).paddingTop, ...r(c) })),
            answerKids: [...answer.children].map((c) => ({ cls: String(c.className).slice(0, 30), mt: getComputedStyle(c).marginTop, ...r(c) })),
            resultsKids: [...(document.querySelector(".lx-tr-results")?.children ?? [])].slice(0, 6).map((c) => ({ cls: c.className, part: c.dataset.part, ...r(c) })),
            answer: { ...r(answer), font: getComputedStyle(answer.querySelector("*") ?? answer).fontSize },
            bar: r(bar),
            tight: document.querySelector(".lx-today-translate [data-tight]") ? true : false,
          };
          // The answer's language and where it's from, beside the swap button and never under it.
          const swap = document.querySelector('[data-part="translate-field"] > .lx-tr-swap')?.getBoundingClientRect();
          const labels = [...document.querySelectorAll(".lx-today-translate .lx-tr-head > *")].map((e) => e.getBoundingClientRect()).filter((q) => q.width && q.height);
          const overSwap = swap ? labels.filter((q) => q.left < swap.right && q.right > swap.left && q.top < swap.bottom && q.bottom > swap.top).length : 0;
          // The typed line: whole in its field, not scrolled, not faded (an iPhone SE's smallest box cut it, 7 Nov 2026).
          const typed = box.querySelector("textarea");
          const line = { scrollTop: typed.scrollTop, over: typed.scrollHeight - typed.clientHeight, faded: box.hasAttribute("data-more-below") };
          return { text: answer.innerText.split("\n")[0].slice(0, 40), top: a.top, bottom, speaker: speakers.length, barTop: bar.getBoundingClientRect().top, boxBottom: box.getBoundingClientRect().bottom, vv: visualViewport.height, overSwap, line, snug: document.querySelector(".lx-today-translate[data-snug]") !== null, floor: document.querySelector(".lx-today-translate[data-floor]") !== null, parts };
        }, BEST);
        seen.push(`${w}×${h} keys ${kb}: answer ${Math.round(g.top)}–${Math.round(g.bottom)}, bar from ${Math.round(g.barTop)}${g.snug ? " (snug)" : ""}${g.floor ? " (box at its floor)" : ""}, the typed line ${g.line.over <= 1 && !g.line.scrollTop ? "whole" : "cut"}`);
        geometry.push({ w, h, kb, ...g });
        if (g.overSwap) bad.push(`${w}×${h} with ${kb} px of keys: the answer's language or where it's from under the swap button`);
        if (g.line.scrollTop > 0.5 || g.line.over > 1 || g.line.faded) bad.push(`${w}×${h} with ${kb} px of keys: the typed line not whole (scrolled ${g.line.scrollTop} px, ${g.line.over} px past its field${g.line.faded ? ", faded" : ""})`);
        if (g.bottom > g.barTop + 0.5 || g.top < g.boxBottom - 0.5 || !g.speaker) bad.push(`${w}×${h} with ${kb} px of keys: "${g.text}" ${Math.round(g.top)}–${Math.round(g.bottom)} (its speaker ${g.speaker ? "on its line" : "not found"}), the box's foot at ${Math.round(g.boxBottom)}, the bar from ${Math.round(g.barTop)}`);
        if (w === 375 && (kb === 289 || kb === 320)) await page.screenshot({ path: `${OUT}/translate-se-keys-${kb}.png` });
      }
      await keyboard(0);
    }
  } finally {
    await page.setViewportSize({ width: 390, height: 844 });
    writeFileSync(`${OUT}/translate-geometry.json`, JSON.stringify(geometry, null, 1));
  }
  assert(!bad.length, `the answer under the bar or the box: ${bad.join("; ")}`);
  return seen.join("; ");
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.join("\n"));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} stages passed`);
await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
await browser.close();
process.exit(failed ? 1 : 0);
