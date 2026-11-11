// Signing in, as someone arriving from the public page (src/pages.ts loginPage, public/js/login.js, public/css/signin.css), on a phone, every
// frame recorded (frame-watch.mjs, a planted jump caught first):
//   - Start learning opens the newcomer's page (/login?new=1): "Create your account" over the ways, the name field and Create account with a
//     passkey in view from the first paint, no fold, signing in a plain line under it ("Already have an account? Sign in with a passkey");
//   - the site's own pages follow the phone's light or dark, as the public page does, never a look saved on the device (lxLayout,
//     data-site-look): light on a light phone and dark on a dark one, with a saved custom look as well;
//   - opening the fold that holds the create form (signing in first) moves nothing above it in any frame: the form grows downward and comes
//     into view, by a real tap, in Chromium and WebKit, at 390 and 320; a message appearing moves nothing either;
//   - the fold still signs up (every check's own way in: summary, name, Create account with a passkey);
//   - a light-mode phone from the public page's Start learning to the first run, every frame from Chrome's screencast: the sign-in page light
//     in every frame, the step into /app/ going straight to the app's Graphite (no light frame of the app, no blank one: the held start shows
//     the splash's first frame, Tinta on Graphite, from the app's first frame, then fades into the first run over several frames), and the first
//     run whole once it shows (the director's call, 7 Nov: the app keeps Graphite with nothing saved; the one change is that step).
//
//   node scripts/signin-check.mjs http://localhost:<port> <outDir>
//
// LOCAL only (it signs up test accounts). Through gpu.py's parallel lane, sandbox off. Exit 0 = every stage passed.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import * as fw from "./frame-watch.mjs";

process.env.LX_FIRST_RUN = "1"; // the first run is part of this walk (quiet-browser.mjs skips it otherwise)
const { chromium, webkit } = await import("./quiet-browser.mjs");
const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT) {
  console.error("Usage: signin-check.mjs http://localhost:<port> <outDir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
let shot = null;
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`  FAIL  ${name}: ${error.message.split("\n")[0]}`);
    await shot?.screenshot({ path: join(OUT, `fail-${results.length}.png`) }).catch(() => {});
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const JUMPS = new Set(["teleport", "left-behind", "reflow"]);
const phoneOf = (width, scheme = "dark") => ({ viewport: { width, height: width < 360 ? 568 : 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
const engines = { chromium: await chromium.launch({ headless: true }), webkit: await webkit.launch({ headless: true }) };
const errors = [];
async function pageIn(engine, width, scheme) {
  const context = await engines[engine].newContext(phoneOf(width, scheme));
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${engine} ${width}: ${String(e).split("\n")[0]}`));
  await fw.install(page);
  shot = page;
  return { context, page };
}
const box = (page, sel) => page.locator(sel).first().boundingBox();
const canvasLightness = (page) =>
  page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g).map(Number);
    return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  });

// ---------- a jump is seen ----------

await stage("PLANT: a block put above the sign-in page's ways in one frame is caught as a jump", async () => {
  const { context, page } = await pageIn("chromium", 390);
  await page.goto(`${BASE}/login`);
  await fw.quiet(page, 300, 4000).catch(() => {});
  await fw.start(page);
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector(".lx-signin-lead").prepend(Object.assign(document.createElement("div"), { style: "height: 90px" })));
  await page.waitForTimeout(800);
  const found = fw.analyze(await fw.stop(page), { label: "plant" }).filter((row) => JUMPS.has(row.kind));
  await context.close();
  assert(found.some((row) => row.kind === "teleport"), "the planted block wasn't caught");
  return found.map((row) => row.what).slice(0, 2).join("; ");
});

// ---------- Start learning: the newcomer's page ----------

for (const scheme of ["light", "dark"]) {
  await stage(`Start learning on a ${scheme} phone opens the newcomer's page in the phone's ${scheme}: creating an account first and open, signing in plain under it`, async () => {
    const { context, page } = await pageIn("chromium", 390, scheme);
    await page.goto(`${BASE}/`);
    const publicLight = await canvasLightness(page);
    await page.locator('a[data-t="site.start"]').first().tap();
    await page.waitForURL(/\/login\?new=1/, { timeout: 15_000 });
    await page.waitForSelector("#register");
    // Its heading is the page's own (the public page has just said what Lexicommons is): no headline again over it.
    const heads = await page.locator("h1").allInnerTexts();
    assert(heads.length === 1 && heads[0] === "Create your account" && (await page.locator('.lx-signin-ways > h1[data-part="page-title"]').count()) === 1, `the page's headings: ${JSON.stringify(heads)}`);
    assert(!(await page.locator(".lx-signin-lead").count()), "the public page's headline again over the form");
    assert((await page.locator("details, summary").count()) === 0, "a fold on the newcomer's page");
    const field = await box(page, 'input[name="name"]');
    const create = await box(page, '#register button[type="submit"]');
    assert(field && create && create.y + create.height <= 844, `the field and Create account aren't in view: ${JSON.stringify({ field, create })}`);
    // As the name is typed, iOS centers the field in what the keys leave (287 px on an SE, measured on iOS 26.4 simulators), Safari's pill
    // just below that: Create account clears both only with its foot within 143 px of the field's middle; 130 keeps a margin.
    const foot = Math.round(create.y + create.height - (field.y + field.height / 2));
    assert(foot <= 130, `Create account's foot is ${foot} px below the field's middle: under the keys on an SE`);
    const already = await page.locator(".lx-signin-already").innerText();
    assert(/Already have an account\?/.test(already) && /Sign in with a passkey/.test(already), `the plain sign-in: ${already}`);
    const signInLight = await canvasLightness(page);
    await page.screenshot({ path: join(OUT, `newcomer-${scheme}.png`) });
    await context.close();
    assert(scheme === "light" ? signInLight > 200 && publicLight > 200 : signInLight < 40 && publicLight < 40, `the public page ${publicLight}, sign-in ${signInLight} (0 black, 255 white)`);
    return `public ${publicLight}, sign-in ${signInLight}`;
  });
}

await stage("a look saved on the device never reaches the site's pages: Paper saved, a dark phone's sign-in is dark", async () => {
  const { context, page } = await pageIn("chromium", 390, "dark");
  await page.addInitScript(() => localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme: "paper", presets: {}, tokens: {}, css: "" })));
  await page.goto(`${BASE}/login`);
  const light = await canvasLightness(page);
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await context.close();
  assert(light < 40 && theme === "auto", `with Paper saved: canvas ${light}, data-theme ${theme}`);
  return `canvas ${light}, data-theme ${theme}`;
});

// ---------- the fold, and a message: nothing above them moves ----------

for (const engine of ["chromium", "webkit"]) {
  for (const width of [390, 320]) {
    await stage(`${engine} at ${width}: opening "Create an account with a passkey" by a tap moves nothing above it in any frame, and its field comes into view`, async () => {
      const { context, page } = await pageIn(engine, width);
      await page.goto(`${BASE}/login`);
      await fw.quiet(page, 300, 4000).catch(() => {});
      const before = { title: await box(page, ".lx-signin-lead h1"), passkey: await box(page, "#signin") };
      await fw.start(page);
      await page.waitForTimeout(300);
      await page.locator("summary").tap();
      await page.waitForTimeout(1500);
      const run = await fw.stop(page);
      const found = fw.analyze(run, { label: `${engine} ${width}`, scrolled: true }).filter((row) => JUMPS.has(row.kind));
      // Where they are on the page (the page may scroll the field into view: that's a scroll, not a move).
      const scrollY = await page.evaluate(() => scrollY);
      const after = { title: await box(page, ".lx-signin-lead h1"), passkey: await box(page, "#signin") };
      const moved = Math.max(Math.abs(after.title.y + scrollY - before.title.y), Math.abs(after.passkey.y + scrollY - before.passkey.y));
      const field = await box(page, 'input[name="name"]');
      const height = width < 360 ? 568 : 844;
      await page.screenshot({ path: join(OUT, `fold-${engine}-${width}.png`) });
      await context.close();
      assert(!found.length, found.map((row) => `${row.kind} at ${row.at} ms: ${row.what}`).slice(0, 3).join(" | "));
      assert(moved <= 1, `the heading or the passkey button moved ${moved} px on the page`);
      assert(field && field.y >= 0 && field.y + field.height <= height, `the name field isn't in view: ${JSON.stringify(field)}`);
      return `${run.frames.length} frames, nothing moved; scrolled ${Math.round(scrollY)} px to the field`;
    });
  }
}

await stage("a message appearing on the newcomer's page moves nothing above it", async () => {
  const { context, page } = await pageIn("chromium", 390);
  await page.route("**/api/auth/register/options", (route) => route.fulfill({ status: 400, json: { error: "That name is too long." } }));
  await page.goto(`${BASE}/login?new=1`);
  await page.fill('input[name="name"]', "Message Check");
  await fw.quiet(page, 300, 4000).catch(() => {});
  const before = { title: await box(page, '.lx-signin-ways [data-part="page-title"]'), field: await box(page, 'input[name="name"]') };
  await fw.start(page);
  await page.waitForTimeout(300);
  await page.locator('#register button[type="submit"]').tap();
  await page.waitForSelector("#auth-error:not([hidden])", { timeout: 10_000 });
  await page.waitForTimeout(1200);
  const run = await fw.stop(page);
  const found = fw.analyze(run, { label: "message", scrolled: true }).filter((row) => JUMPS.has(row.kind));
  const scrollY = await page.evaluate(() => scrollY);
  const after = { title: await box(page, '.lx-signin-ways [data-part="page-title"]'), field: await box(page, 'input[name="name"]') };
  const moved = Math.max(Math.abs(after.title.y + scrollY - before.title.y), Math.abs(after.field.y + scrollY - before.field.y));
  const said = await page.locator("#auth-error").innerText();
  await context.close();
  assert(/too long/.test(said), `the message: ${said}`);
  assert(!found.length && moved <= 1, `moved ${moved} px; ${found.map((row) => `${row.kind}: ${row.what}`).slice(0, 2).join(" | ")}`);
  return `${run.frames.length} frames, nothing moved`;
});

await stage("the fold still signs up (every check's way in): summary, a name, Create account with a passkey, then the app", async () => {
  const context = await engines.chromium.newContext(phoneOf(390));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Signin Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
  await context.close();
});

// ---------- a light phone, from Start learning to the first run, every frame ----------

/** A screencast frame's lightness (0 black, 255 white) and how varied it is (a blank frame is one color). */
async function look(data) {
  const { channels } = await sharp(Buffer.from(data, "base64")).resize(39, 84, { fit: "fill" }).stats();
  const [r, g, b] = channels;
  return { light: Math.round(0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean), spread: Math.round((r.stdev + g.stdev + b.stdev) / 3) };
}
/** How different two frames are, 0 to 255 per pixel on average (small images, so a moving drop counts a little). */
async function apart(a, b) {
  const px = (d) => sharp(Buffer.from(d, "base64")).resize(78, 168, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const [x, y] = await Promise.all([px(a), px(b)]);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]);
  return sum / x.length;
}

await stage("a light phone from Start learning to the first run: sign-in light in every frame, the app never light nor blank (the splash's first frame while its start holds, fading into the first run), the first run in before the app's frame with its flags drawn, nothing popping in after", async () => {
  const context = await engines.chromium.newContext(phoneOf(390, "light"));
  // In the app's page: when the first run and the app's frame (its tab bar) were put on the page, and how many of the first run's first
  // screenful of flags were drawn then.
  await context.addInitScript(() => {
    if (location.pathname !== "/app/") return;
    window.__firstRun = { welcomeAt: null, frameAt: null, flagsDrawn: null, flags: null };
    new MutationObserver(() => {
      const w = window.__firstRun;
      const welcome = document.querySelector(".lx-welcome");
      if (welcome && w.welcomeAt === null) {
        w.welcomeAt = performance.now();
        const flags = [...welcome.querySelectorAll('img[data-part="language-flag"]')].slice(0, 12);
        w.flags = flags.length;
        w.flagsDrawn = flags.filter((img) => img.complete && img.naturalWidth > 0).length;
      }
      if (w.frameAt === null && document.querySelector('#root [data-part="tab-bar"]')) w.frameAt = performance.now();
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`light walk: ${String(e).split("\n")[0]}`));
  shot = page;
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(800);
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frames.push({ at: metadata.timestamp * 1000, data });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 });
  let intoApp = null;
  page.on("framenavigated", (frame) => frame === page.mainFrame() && new URL(frame.url()).pathname === "/app/" && (intoApp ??= Date.now()));
  await page.locator('a[data-t="site.start"]').first().tap();
  await page.waitForURL(/\/login\?new=1/);
  await page.fill('input[name="name"]', "Light Phone");
  await page.locator('#register button[type="submit"]').tap();
  await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
  await page.waitForSelector(".lx-welcome", { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await cdp.send("Page.stopScreencast");
  const firstRun = await page.evaluate(() => window.__firstRun);
  assert(intoApp && frames.length > 10, `${frames.length} frames, into the app at ${intoApp}`);
  const looks = await Promise.all(frames.map((f) => look(f.data)));
  const settled = frames.at(-1).data;
  // Each frame as the app (after the navigation into /app/ began) or not, by when it was drawn.
  const before = looks.filter((_, i) => frames[i].at < intoApp);
  const appFrames = frames.map((f, i) => ({ ...f, ...looks[i] })).filter((f) => f.at >= intoApp);
  const darkFrom = appFrames.findIndex((f) => f.light < 60);
  assert(darkFrom >= 0, "the app never showed dark");
  const app = appFrames.slice(darkFrom);
  const lightAfter = appFrames.filter((f) => f.light > 120 && f.at >= appFrames[darkFrom].at);
  // How far each of the app's frames is from the first run as it settles; from the first that's close, every one after stays close.
  const distances = [];
  for (const f of app) distances.push(await apart(f.data, settled));
  const shownAt = distances.findIndex((d) => d < 8);
  const after = shownAt >= 0 ? distances.slice(shownAt) : [];
  const first = app[Math.max(0, shownAt)];
  for (const [name, f] of [["last-sign-in", frames.filter((x) => x.at < intoApp).at(-1)], ["app-first", first], ["app-settled", frames.at(-1)]]) if (f) writeFileSync(join(OUT, `light-walk-${name}.jpg`), Buffer.from(f.data, "base64"));
  // The app's frames each time what's on the screen changes (lightness or spread), to look at.
  appFrames.filter((f, i) => i === 0 || f.light !== appFrames[i - 1].light || f.spread !== appFrames[i - 1].spread).slice(0, 12)
    .forEach((f) => writeFileSync(join(OUT, `light-walk-app-${String(Math.round(f.at - intoApp)).padStart(5, "0")}ms.jpg`), Buffer.from(f.data, "base64")));
  // Every frame from the step into the app: ms after it began, lightness / spread.
  const story = app.map((f, i) => `${Math.round(f.at - intoApp)}:${f.light}/${f.spread}/${distances[i].toFixed(1)}`).join(" ");
  writeFileSync(join(OUT, "light-walk-frames.txt"), story);
  await context.close();
  assert(before.length && before.every((f) => f.light > 200), `a sign-in frame wasn't light: ${before.map((f) => f.light).join(",")}`);
  // Frames drawn after /app/ began but before its first paint are the page that left (light): none of the app's own is light.
  const between = appFrames.slice(0, darkFrom);
  assert(between.every((f) => f.light > 200 && f.spread >= 4), `before the app's first dark frame: ${between.map((f) => `${f.light}/${f.spread}`).join(", ")}`);
  assert(!lightAfter.length, `${lightAfter.length} light frames in the app (ms:lightness/spread/distance: ${story.slice(0, 500)})`);
  assert(firstRun?.welcomeAt !== null && firstRun.frameAt !== null && firstRun.welcomeAt <= firstRun.frameAt, `the first run came after the app's frame (an empty Home first): ${JSON.stringify(firstRun)}`);
  assert(firstRun.flags > 0 && firstRun.flagsDrawn === firstRun.flags, `the first run came in with ${firstRun.flagsDrawn} of its first ${firstRun.flags} flags drawn`);
  assert(shownAt >= 0 && after.every((d) => d < 8), `once the first run showed, a frame differed from it settled by ${Math.max(...after).toFixed(1)} (ms:lightness/spread/distance: ${story.slice(0, 500)})`);
  // Never blank: every app frame before the first run shows something (the splash's Tinta), from the app's first dark frame; a blank one is a
  // single color (the bare canvas the held start showed before, most of a second of it).
  const holding = app.slice(0, Math.max(0, shownAt));
  const blank = holding.filter((f) => f.spread < 4);
  assert(!blank.length, `${blank.length} blank frame(s) before the first run (ms:lightness/spread/distance: ${story.slice(0, 500)})`);
  assert(holding.length && holding[0].spread >= 8, `the app's first frame isn't the splash: ${holding[0] ? `${holding[0].light}/${holding[0].spread}` : "none"}`);
  // A fade into the first run, not a cut: frames part way between the splash and the first run, each nearer the first run than the one before.
  const fading = distances.slice(0, Math.max(0, shownAt)).filter((d, i, all) => i > 0 && d < all[0] - 4);
  // Until the fade starts the splash is one picture: each frame the first's (a late layout moving the drop would show here).
  const still = [];
  for (const f of holding.slice(1)) {
    const d = await apart(f.data, holding[0].data);
    if (d > 4) break;
    still.push(d);
  }
  const fadeFrom = holding.findIndex((_, i) => i > 0 && distances[i] < distances[0] - 4);
  assert(fadeFrom < 0 || still.length + 1 >= fadeFrom, `the splash moved before its fade: frame ${still.length + 1} of ${fadeFrom} (ms:lightness/spread/distance: ${story.slice(0, 500)})`);
  assert(fading.length >= 3, `the splash went in ${fading.length} frame(s): a cut, not a fade (ms:lightness/spread/distance: ${story.slice(0, 500)})`);
  return `${before.length} sign-in frames light; in the app ${holding.length} frame(s) of the splash (none blank), fading over ${fading.length}, then the first run whole (${firstRun.flagsDrawn}/${firstRun.flags} flags drawn, before the frame) and steady for ${after.length} frames`;
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.slice(0, 5).join("\n"));
});

for (const browser of Object.values(engines)) await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED` : `\nsignin-check: all ${results.length} stages passed`);
process.exit(failed.length ? 1 : 0);
