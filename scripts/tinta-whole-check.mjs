// Tinta stays whole through its full motion, at every spot and size (once, on a right answer, its head was clipped at the top
// and its ground line left behind on its own, on the live site). End to end in headless Chrome on a LOCAL
// server (it signs up a test account). Every frame of each act, stepped in its real place by its own code:
//   the question spot  a real right answer and a real wrong one; its rest, speaking and pointing; right and wrong at
//                      phone to desktop sizes and every fit level (at 5–7 it isn't drawn at all)
//   the session's end  the moment's Tinta (72 px): right, and a milestone's heart, at the same sizes
//   the top of a page  the first day back's wave at the streak spot's size, an empty state's reaction, at the same sizes
// (The rest of its places, through their real flows: tinta-tabs-check and tinta-acts-check watch every Tinta they meet.)
// Fails on:
// - any frame's ink past anything that clips it (its overflow ancestors, the window);
// - at the highest frame, in both themes: the pixels Tinta really shows in place fewer than the same frame drawn alone
//   with nothing round it, or their top not where its ink's top is;
// - its highest frame touching the session bar's words, or its rest touching the words under it, where it's drawn;
// - a page that moved for it: every part's box must be where it is without the room above the step;
// - in a picture of the page (a step or the session leaving, the page under a swipe back, the theme's old look): a Tinta
//   drawn twice, or a drawing whose clip or outline points at nothing (a solid block with eyes);
// - a scrolled step over the bar (what scrolls goes under it) or a bar that stops taking presses.
//
// Usage (headless Chrome, so through the GPU queue's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "tinta whole check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/tinta-whole-check.mjs http://localhost:<port> <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { wholeInit } from "./tinta-whole.mjs";
import { goRouted } from "./fixtures/routed.mjs";
import { answerStep, pastReminderAsk, stepNow } from "./fixtures/play-session.mjs";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/tinta-whole-check.mjs http://localhost:<port> <outDir> (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

const results = [];
const problems = [];
let failed = 0;
async function stage(name, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - t, detail });
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    results.push({ stage: name, ok: false, ms: Date.now() - t, error: String(error?.stack ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
    await page.screenshot({ path: join(OUT, "shots", `fail-${results.length}.png`) }).catch(() => {});
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(wholeInit);
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const SESSION = '[data-part="session"]:not([data-ghost])';
const QUESTION = `${SESSION} [data-part="activity-prompt"] > [data-part="character"]`;
const MOMENT = `${SESSION} [data-part="celebration"] [data-part="character"]`;
const SIZES = [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [768, 1024], [1280, 800], [844, 390]];
const tolerance = 1; // px: a stroke's edge, antialiasing

// ---------- what the pictures say ----------

/** The pixels two pictures differ by (any channel by more than 24): how many, and the box round them, in CSS px. */
const differ = (a, b, scale = 2) =>
  pixels.evaluate(
    async ([a, b, scale]) => {
      const read = async (b64) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
        c.drawImage(bitmap, 0, 0);
        return c.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [p, q] = [await read(a), await read(b)];
      let n = 0, top = Infinity, left = Infinity, right = -1, bottom = -1;
      for (let y = 0; y < p.height; y++)
        for (let x = 0; x < p.width; x++) {
          const i = (y * p.width + x) * 4;
          if (Math.abs(p.data[i] - q.data[i]) > 24 || Math.abs(p.data[i + 1] - q.data[i + 1]) > 24 || Math.abs(p.data[i + 2] - q.data[i + 2]) > 24) {
            n++;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
      return { n, top: top / scale, left: left / scale, right: (right + 1) / scale, bottom: (bottom + 1) / scale };
    },
    [a.toString("base64"), b.toString("base64"), scale],
  );

/**
 * At the moment Tinta's held on: the pixels it shows in place, against the very same frame drawn alone on the same
 * background with nothing to clip it. The check that can't be fooled by a box: a cut drop shows fewer pixels.
 */
async function wholeInPixels(selector) {
  const place = await page.evaluate((s) => {
    const node = document.querySelector(s), ink = window.lxWhole.ink(node), box = node.getBoundingClientRect();
    const m = 24;
    const left = Math.max(0, Math.floor(ink.left - m)), top = Math.max(0, Math.floor(ink.top - m));
    return { boxTop: box.top, clip: { x: left, y: top, width: Math.min(innerWidth, Math.ceil(ink.right + m)) - left, height: Math.min(innerHeight, Math.ceil(ink.bottom + m)) - top } };
  }, selector);
  // Only round it: nothing else on the page (a progress bar still filling) is in the picture.
  const seen = async () => {
    const shown = await page.screenshot({ clip: place.clip });
    await page.evaluate((s) => (document.querySelector(s).querySelector(":scope > svg").style.visibility = "hidden"), selector);
    const without = await page.screenshot({ clip: place.clip });
    await page.evaluate((s) => (document.querySelector(s).querySelector(":scope > svg").style.visibility = ""), selector);
    return differ(shown, without);
  };
  const inPlace = await seen();
  // The same frame alone: a copy of its drawing over a plain layer in the middle of the window.
  const aloneTop = await page.evaluate((s) => {
    const node = document.querySelector(s), svg = node.querySelector(":scope > svg"), box = node.getBoundingClientRect();
    const layer = document.createElement("div");
    layer.id = "lx-whole-alone";
    Object.assign(layer.style, { position: "fixed", inset: "0", zIndex: "99999", background: getComputedStyle(document.documentElement).getPropertyValue("--canvas") });
    const copy = svg.cloneNode(true);
    const top = Math.round(innerHeight / 2 - box.height / 2);
    Object.assign(copy.style, { position: "absolute", left: `${Math.round(innerWidth / 2 - box.width / 2)}px`, top: `${top}px`, width: `${box.width}px`, height: `${box.height}px`, overflow: "visible", display: "block" });
    layer.append(copy);
    document.documentElement.append(layer);
    return top;
  }, selector);
  const shownAlone = await page.screenshot();
  await page.evaluate(() => (document.querySelector("#lx-whole-alone > svg").style.visibility = "hidden"));
  const plain = await page.screenshot();
  await page.evaluate(() => document.querySelector("#lx-whole-alone").remove());
  const alone = await differ(shownAlone, plain);
  // How far above its box what shows starts, in place and alone (the same faint edges missed by both).
  const startsInPlace = place.clip.y + inPlace.top - place.boxTop, startsAlone = alone.top - aloneTop;
  return { inPlace, alone, share: inPlace.n / Math.max(1, alone.n), startsInPlace, startsAlone, cutPx: startsInPlace - startsAlone };
}

const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Plays `name` on the node in its place and sweeps every frame. Leaves it held on its highest frame if hold. */
const sweepAct = (selector, name, { hold = false } = {}) =>
  page.evaluate(
    ([selector, name, hold]) => {
      const node = document.querySelector(selector);
      if (name !== "playing") node.play(name);
      const made = node.clips();
      const dur = (made[node.reaction?.name]?.dur ?? 3) - 0.01;
      const out = window.lxWhole.sweep(node, dur);
      if (hold) window.lxWhole.hold(out.highest);
      else node.finish();
      return out;
    },
    [selector, name, hold],
  );
const release = (selector) =>
  page.evaluate((s) => {
    window.lxWhole.release();
    document.querySelector(s)?.finish();
  }, selector);

// A cut drop shows fewer pixels, and starts lower in its box than the same frame alone does. (The share has room for
// antialiasing, up to about 1.5% at another sub-pixel place. A curl's tip is under that: where it starts is what finds it.)
const cutIn = (theme, p, o) => {
  const out = [];
  if (p.share < 0.97) out.push(`in ${theme} only ${(p.share * 100).toFixed(1)}% of its pixels show at its highest (${p.inPlace.n} of ${p.alone.n})`);
  if (p.cutPx > 1.5) out.push(`in ${theme} its top ${p.cutPx.toFixed(1)} px is missing at its highest`);
  return out;
};
const THEMES = ["dark", "light"];
const onTheme = async (theme) => {
  // Light is Paper; the app's dark is no theme named at all.
  await page.evaluate((theme) => {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "paper");
    else document.documentElement.removeAttribute("data-theme");
  }, theme);
  await settle();
  await settle();
  const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  assert(scheme.includes(theme), `the ${theme} theme should be on: ${scheme}`);
};

const past = (o) => ["top", "left", "right", "bottom"].filter((side) => o[side] > tolerance).map((side) => `${o[side].toFixed(1)} px past its ${side} (${o.by[side]})`);

// ---------- signing up, then a real session ----------
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', `Tinta Whole ${Date.now().toString(36)}`); // a server keeps its names
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
await page.waitForSelector("html[data-app-ready]");
// A blank page of its own, reading pictures with no page's rules on it (opened only now: a passkey needs the page in front).
const pixels = await (await browser.newContext()).newPage();

// Steps are played by scripts/fixtures/play-session.mjs: each by its kind as the session records it (lxStep), never by its words.
const session = page.locator(SESSION);
const kindNow = async () => (await stepNow(page, { session: SESSION }))?.kind ?? null;
// The games whose right and wrong answers this check watches Tinta react to (the player plays every game; these have a wrong answer).
const answerable = ["choose", "meaning", "fill", "type", "place", "arrange", "listen"];
/** Answers the step on screen, right or wrong, with real presses, leaving its result up. Returns false for a step it can't answer that way. */
async function answer(right) {
  if (!answerable.includes(await kindNow())) return false;
  await answerStep(page, { session: SESSION, wrong: !right, next: false });
  return true;
}
/** Passes a step, right, whatever it is, on to the next. */
const passStep = () => answerStep(page, { session: SESSION });
const toStep = async (kinds) => {
  for (let i = 0; i < 25; i++) {
    if (await page.locator(`${SESSION} [data-part="session-summary"]`).count()) return null;
    const kind = await kindNow();
    if (kinds.includes(kind)) return kind;
    await passStep();
    await settle();
  }
  return null;
};
const reactionNow = (selector) => page.evaluate((s) => document.querySelector(s).reaction?.name ?? null, selector);

await page.goto(`${BASE}/app/#study/session/quick`);
await page.waitForSelector(QUESTION, { state: "attached", timeout: 20_000 });
await page.waitForFunction((s) => document.querySelector(s)?.querySelector("svg path"), QUESTION);
await page.waitForTimeout(500);

// ---------- the stages ----------

const sessionPictures = [];


// The rule itself, on planted parts (tinta-whole.mjs over): a drawing past the foot of a frame (overflow hidden) around a scroller that can
// still scroll down to it isn't cut (a page scrolls it into view: Home's streak spot on a short screen); a frame shorter than the scroller
// in it, at the scroller's foot, cuts what shows there; and a frame with no scroller in it cuts it.
await stage("The rule for what cuts it (planted): a frame around a scroller that can still bring it into view doesn't; one that can't, does; a frame that clips one way only (overflow-x: clip) cuts only that way", async () => {
  const got = await page.evaluate(() => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:200px;height:200px;overflow:hidden;z-index:-1";
    const scroller = document.createElement("div");
    scroller.style.cssText = "height:200px;overflow:auto";
    const tall = document.createElement("div");
    tall.style.cssText = "height:600px;position:relative";
    const drawing = document.createElement("div");
    drawing.style.cssText = "position:absolute;left:20px;top:180px;width:60px;height:60px";
    drawing.innerHTML = '<svg width="60" height="60" viewBox="0 0 60 60"><rect width="60" height="60" fill="none"/></svg>';
    tall.append(drawing);
    scroller.append(tall);
    host.append(scroller);
    document.body.append(host);
    const out = {};
    out.canScroll = window.lxWhole.over(drawing).bottom;
    // A frame shorter than the scroller in it, the scroller at its foot: what shows at the scroller's foot is under the frame's, for good.
    host.style.height = "150px";
    scroller.scrollTop = scroller.scrollHeight;
    drawing.style.top = "540px"; // 140–200 px down the scroller's view, 50 past the frame's foot
    out.atFoot = window.lxWhole.over(drawing).bottom;
    host.style.height = "200px";
    scroller.style.overflow = "visible"; // no scroller: just a frame
    scroller.scrollTop = 0;
    drawing.style.top = "180px";
    out.noScroller = window.lxWhole.over(drawing).bottom;
    // A frame that clips only sideways (the app's: overflow-x: clip, overflow-y visible): a drawing past its foot isn't cut by it (a
    // session's cover rising from below the screen), one past its side is.
    scroller.remove();
    host.append(drawing);
    host.style.overflow = "visible";
    host.style.overflowX = "clip";
    drawing.style.top = "180px";
    out.clipXFoot = window.lxWhole.over(drawing).bottom;
    drawing.style.top = "20px";
    drawing.style.left = "170px"; // 30 past its right side
    out.clipXSide = window.lxWhole.over(drawing).right;
    host.remove();
    return out;
  });
  assert(got.canScroll <= 0, `a drawing a scroller can still bring into view was counted as cut: ${JSON.stringify(got)}`);
  assert(got.atFoot >= 49 && got.noScroller >= 39, `a real cut wasn't caught: ${JSON.stringify(got)}`);
  assert(got.clipXFoot <= 0, `a frame that clips only sideways was counted as cutting its foot: ${JSON.stringify(got)}`);
  assert(got.clipXSide >= 29, `a frame that clips sideways didn't cut at its side: ${JSON.stringify(got)}`);
  return JSON.stringify(got);
});

let layoutOf = null;
await stage("Where the page sits: every part's box is where it is without the room above the step", async () => {
  const shift = await page.evaluate((SESSION) => {
    const activity = document.querySelector(`${SESSION} > [data-part="activity"]`);
    const boxes = () => [...document.querySelector(SESSION).querySelectorAll("*")].filter((n) => !n.closest("svg") && n.localName !== "lx-tinta" && n !== activity).map((n) => { const r = n.getBoundingClientRect(); return [n.localName, n.getAttribute("data-part"), +r.left.toFixed(2), +r.top.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)]; });
    const on = boxes();
    const s = getComputedStyle(activity);
    const room = -parseFloat(s.marginTop) || 0;
    const scrollOn = activity.scrollHeight - activity.clientHeight;
    activity.style.marginTop = "0px";
    activity.style.paddingTop = `${parseFloat(s.paddingTop) - room}px`;
    const off = boxes();
    const scrollOff = activity.scrollHeight - activity.clientHeight;
    activity.style.marginTop = "";
    activity.style.paddingTop = "";
    const moved = on.filter((b, i) => JSON.stringify(b) !== JSON.stringify(off[i])).map((b, i) => ({ on: b, off: off[on.indexOf(b)] }));
    return { room, moved: moved.slice(0, 4), count: on.length, scrollOn, scrollOff };
  }, SESSION);
  assert(shift.moved.length === 0, `parts moved for it: ${JSON.stringify(shift.moved)}`);
  assert(shift.scrollOn === shift.scrollOff, `the step's overflow changed: ${shift.scrollOn} vs ${shift.scrollOff}`);
  layoutOf = shift;
  return `${shift.count} boxes the same with ${shift.room} px of room`;
});

await stage("At rest on a question: its loop's every frame is whole (8 s)", async () => {
  const o = await page.evaluate(([s]) => window.lxWhole.sweep(document.querySelector(s), 8), [QUESTION]);
  const bad = past(o);
  assert(!bad.length, `at rest its ink goes ${bad.join("; ")}`);
  return `highest ${o.inkTop.toFixed(1)} px down the window`;
});

await stage("A real right answer: every frame whole; at its highest, every pixel of it shows, in both themes", async () => {
  const kind = await toStep(answerable);
  assert(kind, "the session should reach a step it can answer");
  assert(await answer(true), "it should answer");
  await settle();
  assert((await reactionNow(QUESTION)) === "right", `a right answer plays right, not ${await reactionNow(QUESTION)}`);
  const o = await sweepAct(QUESTION, "playing", { hold: true });
  const notes = [];
  const bad = past(o);
  for (const theme of THEMES) {
    await onTheme(theme);
    await page.screenshot({ path: join(OUT, "shots", `question-right-top-${theme}.png`) });
    // The way up and over, round its highest frame: the top of the screen at Tinta's side.
    mkdirSync(join(OUT, "shots", `right-frames-${theme}`), { recursive: true });
    for (const t of [0.42, 0.52, 0.58, o.highest, 0.74, 0.86, 1.04, 1.3]) { // (1.02, the landing itself, falls either side by rounding)
      await page.evaluate((t) => window.lxWhole.hold(t), t);
      await settle();
      await page.screenshot({ path: join(OUT, "shots", `right-frames-${theme}`, `t${t.toFixed(2)}.png`), clip: { x: 230, y: 0, width: 160, height: 150 } });
    }
    await page.evaluate((t) => window.lxWhole.hold(t), o.highest);
    await settle();
    const p = await wholeInPixels(QUESTION);
    notes.push(`${theme}: ${(p.share * 100).toFixed(1)}% of its pixels show, ${Math.max(0, p.cutPx).toFixed(1)} px of its top missing`);
    bad.push(...cutIn(theme, p, o));
  }
  await release(QUESTION);
  await onTheme("dark");
  assert(!bad.length, bad.join("; "));
  return `t=${o.highest.toFixed(3)} s; ${notes.join("; ")}`;
});

await stage("A real wrong answer: every frame whole; at its highest, every pixel of it shows", async () => {
  await session.locator('[data-part="answer-bar"] [data-variant="white"]').click();
  await settle();
  const kind = await toStep(answerable);
  assert(kind, "the session should reach another step it can answer");
  assert(await answer(false), "it should answer");
  await settle();
  assert((await reactionNow(QUESTION)) === "wrong", `a wrong answer plays wrong, not ${await reactionNow(QUESTION)}`);
  const o = await sweepAct(QUESTION, "playing", { hold: true });
  const bad = past(o);
  await page.screenshot({ path: join(OUT, "shots", "question-wrong-top-dark.png") });
  const p = await wholeInPixels(QUESTION);
  bad.push(...cutIn("dark", p, o));
  await release(QUESTION);
  assert(!bad.length, bad.join("; "));
  return `t=${o.highest.toFixed(3)} s, ${(p.share * 100).toFixed(1)}% of its pixels show`;
});

await stage("Pointing at a hint's clues (left and right of it, and above): every frame whole", async () => {
  const o = await page.evaluate((s) => {
    const node = document.querySelector(s);
    const worst = { top: 0, left: 0, right: 0, bottom: 0, by: {} };
    const box = node.getBoundingClientRect();
    const clue = (x, y) => {
      const d = document.createElement("span");
      Object.assign(d.style, { position: "fixed", left: `${x}px`, top: `${y}px`, width: "20px", height: "10px" });
      document.documentElement.append(d);
      return d;
    };
    const spots = [[8, box.bottom + 80], [innerWidth - 28, box.bottom + 80], [box.left - 100, box.top], [innerWidth - 28, box.top]];
    for (const [x, y] of spots) {
      const target = clue(x, y);
      node.pointAt([target]);
      const dur = node.reaction?.act?.dur ?? 2;
      const o = window.lxWhole.sweep(node, dur - 0.01);
      for (const side of ["top", "left", "right", "bottom"])
        if (o[side] > worst[side]) {
          worst[side] = o[side];
          worst.by[side] = o.by[side];
        }
      node.finish();
      target.remove();
    }
    return worst;
  }, QUESTION);
  const bad = past(o);
  assert(!bad.length, `pointing, its ink goes ${bad.join("; ")}`);
});

await stage("Right and wrong at every size and fit level: every frame whole, clear of the bar's words; not drawn at all once it doesn't fit", async () => {
  const bad = [], rows = [];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await settle();
    const natural = await session.getAttribute("data-fit");
    for (const level of [null, 1, 2, 3, 4, 5, 6, 7]) {
      await page.evaluate(([s, level]) => {
        const root = document.querySelector(s);
        if (level === null) root.removeAttribute("data-fit");
        else root.setAttribute("data-fit", String(level));
      }, [SESSION, level]);
      const shown = await page.evaluate((s) => document.querySelector(s)?.checkVisibility(), QUESTION);
      if (level >= 5) {
        if (shown) bad.push(`${width}×${height} fit ${level}: drawn where it should be hidden`);
        continue;
      }
      for (const act of ["right", "wrong"]) {
        const o = await sweepAct(QUESTION, act, { hold: false });
        const b = past(o);
        if (b.length) bad.push(`${width}×${height} fit ${level ?? 0} ${act}: ${b.join("; ")}`);
        if (act === "right") {
          // At rest: clear of the words under it, with a sentence long enough to run under it.
          const under = await page.evaluate(([s, S]) => {
            const node = document.querySelector(s);
            node.finish();
            window.lxWhole.at(node, 100);
            const ink = window.lxWhole.ink(node);
            const out = [];
            const line = document.querySelector(`${S} [data-part="activity-prompt"] > p`);
            if (!line) return { none: true, out };
            const was = line.textContent;
            line.textContent = "This sentence is long enough to run the whole way across under Tinta's spot, on every width of phone there is, and then some more";
            const range = document.createRange();
            range.selectNodeContents(line);
            for (const r of range.getClientRects()) if (r.right > ink.left + 2 && r.left < ink.right - 2 && r.bottom > ink.top + 2 && r.top < ink.bottom - 2) out.push(+(ink.bottom - r.top).toFixed(1));
            line.textContent = was;
            return { out };
          }, [QUESTION, SESSION]);
          if (under.out.length) bad.push(`${width}×${height} fit ${level ?? 0}: at rest it's ${under.out[0]} px into the words under it`);
          // At its highest: the session bar's words, in the bar's own boxes.
          const hit = await page.evaluate(([s, S]) => {
            const node = document.querySelector(s);
            node.play("right");
            const o = window.lxWhole.sweep(node, 2.79);
            window.lxWhole.at(node, o.highest);
            const ink = window.lxWhole.ink(node);
            const out = [];
            const bar = document.querySelector(`${S} [data-part="session-bar"]`);
            const walker = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const text = walker.currentNode;
              if (!text.textContent.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(text);
              for (const r of range.getClientRects()) if (r.right > ink.left + 2 && r.left < ink.right - 2 && r.bottom > ink.top + 2 && r.top < ink.bottom - 2) out.push({ words: text.textContent.trim(), overlap: +(r.bottom - ink.top).toFixed(1) });
            }
            node.finish();
            return { hit: out, top: +ink.top.toFixed(1) };
          }, [QUESTION, SESSION]);
          rows.push(`${width}×${height}/${level ?? 0}: top ${hit.top}`);
          for (const h of hit.hit) bad.push(`${width}×${height} fit ${level ?? 0}: at its highest it's ${h.overlap} px into the bar's "${h.words}"`);
        }
      }
    }
    await page.evaluate(([s, natural]) => {
      const root = document.querySelector(s);
      if (natural) root.setAttribute("data-fit", natural);
      else root.removeAttribute("data-fit");
    }, [SESSION, natural]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  writeFileSync(join(OUT, "sizes.txt"), `${rows.join("\n")}\n`);
  assert(!bad.length, `${bad.length} problems: ${bad.slice(0, 12).join(" | ")}`);
  return `${SIZES.length} sizes × fit 0–4 × right, wrong; fit 5–7 not drawn`;
});

await stage("A step that scrolls: what scrolls goes under the bar, and the bar takes its presses", async () => {
  await page.setViewportSize({ width: 320, height: 420 });
  await settle();
  const r = await page.evaluate(async ([S, Q]) => {
    const root = document.querySelector(S);
    const activity = root.querySelector(':scope > [data-part="activity"]'), bar = root.querySelector(':scope > [data-part="session-bar"]');
    // At a level where it's drawn: fit 5–7 hide it, and a hidden thing runs no animation.
    const level = root.getAttribute("data-fit");
    root.removeAttribute("data-fit");
    const pad = document.createElement("div");
    pad.style.height = "600px";
    activity.firstElementChild.append(pad);
    const inBar = (x, y) => {
      const under = document.elementFromPoint(x, y);
      return Boolean(under && (under === bar || bar.contains(under)));
    };
    const box = bar.getBoundingClientRect();
    const across = (y) => [8, 60, 120, 200, 280, 312].filter((x) => !inBar(x, y));
    const out = { rest: across(box.bottom - 3) };
    const tinta = document.querySelector(Q);
    const raised = () => Number(getComputedStyle(tinta).zIndex) > 1;
    out.overAtStart = raised();
    activity.scrollTop = 20;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.scrolled = across(box.bottom - 3);
    out.overScrolled = raised();
    // Painted: what's at the bar's foot, once something scrolled is under it.
    out.closeHits = (() => {
      const close = bar.querySelector("button"), b = close.getBoundingClientRect();
      const at = document.elementFromPoint(b.left + b.width / 2, b.bottom - 2);
      return Boolean(at && close.contains(at));
    })();
    activity.scrollTop = 0;
    pad.remove();
    if (level) root.setAttribute("data-fit", level);
    return out;
  }, [SESSION, QUESTION]);
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  assert(!r.rest.length && !r.scrolled.length, `the bar should take presses all along its foot: ${JSON.stringify(r)}`);
  assert(r.closeHits, "the close button should take a press at its foot");
  assert(r.overAtStart, `at the step's start Tinta is over the bar: ${JSON.stringify(r)}`);
  assert(!r.overScrolled, `scrolled on, Tinta goes under the bar with the rest: ${JSON.stringify(r)}`);
});

await stage("The session's end: the moment's Tinta, right and a milestone's heart, every frame whole at every size", async () => {
  // Past the wrong answer's step, if that's where it stands.
  const onward = session.locator('[data-part="answer-bar"] [data-variant="white"]');
  if (await onward.count()) await onward.first().click();
  await settle();
  for (let i = 0; i < 25; i++) {
    if (await page.locator(`${SESSION} [data-part="session-summary"]`).count()) break;
    // The last step's leaving picture is held for a look, as the summary comes in under it.
    await page.evaluate(() => window.lxWhole.freezePictures(true));
    await passStep();
    await settle();
    if (await page.locator(`${SESSION} [data-part="session-summary"]`).count()) await page.screenshot({ path: join(OUT, "shots", "picture-last-step-leaving.png") });
    await page.evaluate(() => window.lxWhole.freezePictures(false));
    await settle();
  }
  assert(await page.locator(`${SESSION} [data-part="session-summary"]`).count(), "the session should end in a summary");
  await page.waitForSelector(MOMENT, { state: "attached", timeout: 5000 });
  await page.waitForFunction((s) => document.querySelector(s)?.querySelector("svg path"), MOMENT);
  const bad = [];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await settle();
    for (const act of ["right", "heart"]) {
      const o = await sweepAct(MOMENT, act, { hold: false });
      const b = past(o);
      if (b.length) bad.push(`${width}×${height} ${act}: ${b.join("; ")}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  const o = await sweepAct(MOMENT, "heart", { hold: true });
  for (const theme of THEMES) {
    await onTheme(theme);
    await page.screenshot({ path: join(OUT, "shots", `moment-heart-top-${theme}.png`) });
    bad.push(...cutIn(theme, await wholeInPixels(MOMENT), o));
  }
  await release(MOMENT);
  await onTheme("dark");
  assert(!bad.length, `${bad.length} problems: ${bad.slice(0, 8).join(" | ")}`);
  return `highest t=${o.highest.toFixed(2)} s`;
});

await stage("The first day back's wave at the streak spot's size and an empty state's reaction near the top of a page, every frame whole at every size", async () => {
  // The session's own leaving picture, held for a look.
  await page.evaluate(() => window.lxWhole.freezePictures(true));
  await session.locator('[data-part="answer-bar"] [data-part="button"]', { hasText: "Done" }).click();
  await pastReminderAsk(page, { session: SESSION });
  await page.waitForSelector('[data-part="app"] > [data-part="page"]');
  await settle();
  await page.screenshot({ path: join(OUT, "shots", "picture-session-leaving.png") });
  sessionPictures.push(...(await page.evaluate(() => window.lxWhole.pictures.filter((p) => p.tintas.length))));
  await page.evaluate(() => window.lxWhole.freezePictures(false));
  await settle();
  const SPOTS = [
    ["spot", '[data-whole-spot="spot"] [data-part="character"]', "wave"],
    ["empty", '[data-whole-spot="empty"] [data-part="character"]', "right"],
  ];
  const bad = [];
  await page.evaluate(async () => {
    const { character, emptyState } = await import("/js/lx/ui.js");
    const host = document.querySelector('[data-part="app"] > [data-part="page"]');
    host.scrollTop = 0;
    // Home's streak spot's Tinta (64, ready with its drip) waving on the first day back: here 24 px from the page's top (on Home it's lower,
    // under the next step), and it has to stay whole.
    const spot = document.createElement("div");
    spot.setAttribute("data-whole-spot", "spot");
    spot.style.marginTop = "24px";
    spot.append(character({ state: "ready", size: 64, hidden: true }));
    const empty = emptyState("Nothing here yet", { react: "right", size: 64 });
    empty.setAttribute("data-whole-spot", "empty");
    window.lxSpots = { host, spot, empty };
  });
  for (const [name, selector, act] of SPOTS) {
    await page.evaluate((name) => {
      const { host } = window.lxSpots;
      host.prepend(window.lxSpots[name]);
    }, name);
    await page.waitForFunction((s) => document.querySelector(s)?.querySelector("svg path"), selector);
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await settle();
      const o = await sweepAct(selector, act);
      const b = past(o);
      if (b.length) bad.push(`${name} ${width}×${height} ${act}: ${b.join("; ")}`);
    }
    await page.evaluate((name) => window.lxSpots[name].remove(), name);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert(!bad.length, `${bad.length} problems: ${bad.slice(0, 8).join(" | ")}`);
});

await stage("A picture of the page has Tinta as it was: one drawing, every reference whole (a step leaving, the session leaving, a page under a swipe back, the theme's old look)", async () => {
  // The page under a real swipe back: Study (Tinta at your place on the strip), from a page of its own.
  await page.evaluate(() => localStorage.setItem("check.swipe-back", "1"));
  await goRouted(page, BASE, "#study");
  await page.waitForSelector('[data-part="path-strip"] [data-part="character"] svg path', { state: "attached", timeout: 15_000 });
  await page.evaluate(() => localStorage.setItem("check.swipe-back", "1"));
  await page.locator('a[href="#study/packs"]').first().click();
  await page.waitForFunction(() => location.hash !== "#study");
  await page.waitForTimeout(700);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", 8, 420);
  for (let x = 28; x <= 200; x += 24) {
    await touch("touchMove", x, 420);
    await page.waitForTimeout(16);
  }
  await page.waitForSelector("[data-page-picture]", { state: "attached", timeout: 3000 });
  await page.screenshot({ path: join(OUT, "shots", "picture-page-under-swipe.png") });
  await touch("touchEnd", 200, 420);
  await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.removeItem("check.swipe-back"));
  const under = await page.evaluate(() => window.lxWhole.pictures.filter((p) => p.tintas.length));

  // The theme's old look: a real press on another theme, with Tinta by its label.
  await page.goto(`${BASE}/app/#settings/appearance`);
  await page.waitForSelector('.lx-theme-head > [data-part="character"] svg path', { state: "attached", timeout: 15_000 });
  await page.waitForTimeout(600); // theme-wipe.js loads with the page
  await page.evaluate(() => window.lxWhole.freezePictures(true));
  await page.locator('.lx-theme-picker [data-part="theme-swatch"], .lx-theme-picker button', { hasText: /^Paper$/ }).first().click();
  await page.waitForSelector("[data-theme-picture]", { state: "attached", timeout: 3000 });
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(OUT, "shots", "picture-theme-old-look.png") });
  const theme = await page.evaluate(() => window.lxWhole.pictures.filter((p) => p.tintas.length));
  await page.evaluate(() => window.lxWhole.freezePictures(false));
  await page.waitForTimeout(300);
  await page.locator('.lx-theme-picker [data-part="theme-swatch"], .lx-theme-picker button', { hasText: /^Dark$|^Default$|^Auto$/ }).first().click().catch(() => {});

  const seen = [...sessionPictures, ...under, ...theme];
  writeFileSync(join(OUT, "pictures.json"), JSON.stringify(seen, null, 1));
  const bad = [];
  for (const kind of ["step", "session", "page", "theme"]) {
    const of = seen.filter((p) => p.kind === kind);
    if (!of.length) bad.push(`no picture of kind ${kind} with a Tinta in it was seen`);
    for (const p of of)
      for (const t of p.tintas) {
        if (t.svgs !== 1) bad.push(`${kind}: a Tinta with ${t.svgs} drawings`);
        if (t.broken) bad.push(`${kind}: ${t.broken} references in its drawing point at nothing (a solid block where its shape should be)`);
        if (!t.drawn) bad.push(`${kind}: a Tinta with nothing drawn`);
      }
  }
  assert(!bad.length, [...new Set(bad)].slice(0, 8).join(" | "));
  return `${seen.length} pictures`;
});

await stage("On a short screen it holds one size through a question: the same at the step's start and with the answer bar up", async () => {
  const bad = [], rows = [];
  let tightened = 0;
  const sizeOf = () => page.evaluate(([s, S]) => {
    const node = document.querySelector(s);
    return { drawn: Boolean(node?.checkVisibility()), height: node ? Math.round(node.getBoundingClientRect().height) : 0, fit: document.querySelector(S)?.getAttribute("data-fit") ?? "0" };
  }, [QUESTION, SESSION]);
  for (const [width, height] of [[375, 553], [360, 640], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    // A fresh quick session by way of Study's own page: the session's own tab, so the router never steps back through the
    // history for another tab's page (an address set before that settles can be taken back).
    await goRouted(page, BASE, "#study");
    await page.goto(`${BASE}/app/#study/session/quick`);
    await page.waitForSelector(QUESTION, { state: "attached", timeout: 20_000 });
    await page.waitForTimeout(500);
    let right = true, measured = 0;
    for (let i = 0; i < 24 && measured < 8; i++) {
      if (await page.locator(`${SESSION} [data-part="session-summary"]`).count()) break;
      const kind = await kindNow();
      if (!answerable.includes(kind)) {
        await passStep();
        await settle();
        continue;
      }
      const before = await sizeOf();
      await answer(right);
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).waitFor({ timeout: 8000 });
      await settle();
      const after = await sizeOf();
      measured++;
      if (after.fit !== before.fit) tightened++;
      if (before.drawn && after.drawn && before.height !== after.height) bad.push(`${width}×${height} ${kind} ${right ? "right" : "wrong"}: ${before.height} px at the start (fit ${before.fit}), ${after.height} px at the answer (fit ${after.fit})`);
      if (before.drawn && before.height !== 44) bad.push(`${width}×${height} ${kind}: ${before.height} px on a short screen`);
      rows.push(`${width}×${height} ${kind}: ${before.height} px fit ${before.fit}, then ${after.height} px fit ${after.fit}`);
      right = !right;
      await session.locator('[data-part="answer-bar"] [data-variant="white"]').click();
      await settle();
    }
    if (!measured) bad.push(`${width}×${height}: no question measured`);
  }
  // A roomy phone keeps its 64.
  await page.setViewportSize({ width: 390, height: 844 });
  await goRouted(page, BASE, "#study");
  await page.goto(`${BASE}/app/#study/session/quick`);
  await page.waitForSelector(QUESTION, { state: "attached", timeout: 20_000 });
  await page.waitForTimeout(500);
  const roomy = await sizeOf();
  if (roomy.height !== 64) bad.push(`390×844: ${roomy.height} px`);
  writeFileSync(join(OUT, "short-screens.txt"), `${rows.join("\n")}\n`);
  assert(tightened > 0, "no step tightened at its answer: this proved nothing");
  assert(!bad.length, `${bad.length} problems: ${bad.slice(0, 8).join(" | ")}`);
  return `${rows.length} questions at 4 short sizes, ${tightened} of them tightening at the answer: 44 px throughout; 64 at 390×844`;
});

await stage("no console errors or page errors", async () => {
  assert(problems.length === 0, problems.slice(0, 8).join(" | "));
});

writeFileSync(join(OUT, "results.json"), JSON.stringify({ results, problems }, null, 2));
await browser.close();
console.log(failed ? `\n${failed} of ${results.length} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
