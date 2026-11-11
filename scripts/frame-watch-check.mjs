// frame-watch.mjs on scenes of its own, in Chrome on a phone screen, with no server: the recorder and analyze as frame-check uses them, on moves
// that are fine and must not be flagged, beside glitches that must be. Fine: a sheet sliding off the screen's foot (its lowest row leaves the
// screen in a frame and isn't recorded after, which once read as a teleport: lex-polish's notes, 5 Nov, Choose the games closing), one coming up
// from below the foot and turned back (a row that comes on and holds was never seen still before it), and a
// full-screen layer fading in over a page of words (its first frame at opacity 0 once counted no words at all: a session starting from Study).
// Caught: a tile at the screen's foot jumping and staying there, a tile jumping mid-screen, the layer's words hidden for 2 frames once it's there.
// Scrolls and pictures (7 Nov): a page on the screen scrolled 300 px with nothing pressed is caught; the same page slid off the screen (a swipe
// back's, put where it was left before it comes back) isn't, nor the page's words gone for 6 frames under a picture of a page (the router's
// hold while the next page composes) that shows its own, nor a session's cover held below the screen and then rising over the page, nor a part
// fitted by a ResizeObserver in the frame it comes in (frame-watch reads each frame once it's rendered).
// Tabs (8 Nov): tabs pressed three frames apart, a page's parts leaving with their page and back with it, and each tab's state following the page
// shown, aren't flagged; a word hidden three frames on the page that stays, and a tab's state flicking with no page coming in, are.
// Usage: node scripts/frame-watch-check.mjs <outDir>   (through gpu.py's parallel lane; exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import * as fw from "./frame-watch.mjs";

const OUT = process.argv[2] && resolve(process.argv[2]);
if (!OUT) {
  console.error("Usage: node scripts/frame-watch-check.mjs <outDir>");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const W = 390;
const H = 844;
// A page of words under a sheet of rows that runs past the screen's foot: rows every 30 px, so whatever a frame's step, some row is
// partly past the foot at rest, within the recorder's 40 px margin, and gone a frame into the slide.
const ROWS = Array.from({ length: 30 }, (_, i) => `<li data-part="list-row" style="position:absolute;left:16px;right:16px;top:${i * 30}px;height:26px"><p>Row ${i + 1}</p><input data-part="switch" type="checkbox" style="position:absolute;right:0;top:0;width:44px;height:26px;margin:0"></li>`).join("");
const WORDS = (n, what) => Array.from({ length: n }, (_, i) => `<p style="margin:0 0 8px">${what} ${i + 1}</p>`).join("");
const HTML = `<!doctype html><html><head><meta name="viewport" content="width=${W}"><style>
  body { margin: 0; font: 16px/1.3 sans-serif; background: #111; color: #eee; }
  [data-part="page"] { padding: 16px; }
  [data-part="sheet"] { position: fixed; left: 0; right: 0; top: 36px; height: 1000px; background: #222; }
  [data-part="sheet"] ul { list-style: none; margin: 0; padding: 0; position: relative; }
  [data-part="session"] { position: fixed; inset: 0; background: #000; padding: 16px; }
  [data-part="tile"] { position: fixed; left: 40px; width: 120px; height: 40px; background: #345; }
</style></head><body><main data-part="page">${WORDS(12, "Page word")}</main></body></html>`;

const browser = await chromium.launch();
const results = [];
async function scene(name, { expect, kind, arg }, build, act) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await fw.install(page);
    await page.goto(`data:text/html,${encodeURIComponent(HTML)}`);
    await page.evaluate(build, arg);
    await page.waitForTimeout(300);
    await fw.start(page);
    await page.waitForTimeout(150);
    await page.evaluate(act, arg);
    await page.waitForTimeout(700);
    const run = await fw.stop(page);
    const found = fw.analyze(run, { label: name }).filter((c) => c.kind === kind);
    const ok = expect === "caught" ? found.length > 0 : found.length === 0;
    results.push({ name, ok, expect, kind, frames: run.frames.length, found: found.slice(0, 3).map((c) => c.what) });
    const said = expect === "caught" ? (ok ? "caught" : "missed") : ok ? "not flagged" : "flagged, and it's fine";
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}: ${kind} ${said}${found.length ? ` (${found.length}: ${found[0].what})` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error?.message ?? error).slice(0, 400)}`);
  } finally {
    await context.close();
  }
}

// Fine: the sheet slides away at a steady 40 px a frame, every row with it.
await scene(
  "a sheet sliding off the screen's foot, its lowest rows leaving the screen",
  { expect: "fine", kind: "teleport", arg: ROWS },
  (rows) => {
    const sheet = document.createElement("div");
    sheet.setAttribute("data-part", "sheet");
    sheet.innerHTML = `<ul>${rows}</ul>`;
    document.body.append(sheet);
  },
  () => document.querySelector('[data-part="sheet"]').animate([{ transform: "none" }, { transform: "translateY(900px)" }], { duration: 375, easing: "linear", fill: "forwards" }),
);

// Fine: a sheet coming up from below the foot, held as a press turns it back, then sliding down: a row that comes onto the screen with its last
// step up, then holds, was never seen still before it.
await scene(
  "a sheet coming up from below the foot, held, then turned back down",
  { expect: "fine", kind: "teleport", arg: ROWS },
  (rows) => {
    const sheet = document.createElement("div");
    sheet.setAttribute("data-part", "sheet");
    sheet.style.transform = "translateY(700px)";
    sheet.innerHTML = `<ul>${rows}</ul>`;
    document.body.append(sheet);
  },
  () =>
    document.querySelector('[data-part="sheet"]').animate(
      [{ transform: "translateY(700px)" }, { transform: "translateY(100px)", offset: 0.25 }, { transform: "translateY(100px)", offset: 0.5 }, { transform: "translateY(900px)" }],
      { duration: 600, easing: "linear", fill: "forwards" },
    ),
);

// Fine: a session over the page, fading in from nothing as motion.appear has it.
await scene(
  "a full-screen layer fading in over a page of words",
  { expect: "fine", kind: "blank-flash", arg: WORDS(12, "Session word") },
  () => {},
  (words) => {
    const layer = document.createElement("div");
    layer.setAttribute("data-part", "session");
    layer.innerHTML = words;
    document.body.append(layer);
    layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: "cubic-bezier(0.2, 0, 0, 1)" });
  },
);

// Caught: a tile half past the screen's foot jumps 20 px and stays, still recorded.
await scene(
  "a tile at the screen's foot jumping 20 px and staying",
  { expect: "caught", kind: "teleport", arg: H },
  (h) => {
    const tile = document.createElement("div");
    tile.setAttribute("data-part", "tile");
    tile.textContent = "Foot";
    tile.style.top = `${h - 30}px`;
    document.body.append(tile);
  },
  () => (document.querySelector('[data-part="tile"]').style.transform = "translateY(20px)"),
);

// Caught: a tile in the middle of the screen jumps 20 px and stays.
await scene(
  "a tile mid-screen jumping 20 px and staying",
  { expect: "caught", kind: "teleport" },
  () => {
    const tile = document.createElement("div");
    tile.setAttribute("data-part", "tile");
    tile.textContent = "Middle";
    tile.style.top = "400px";
    document.body.append(tile);
  },
  () => (document.querySelector('[data-part="tile"]').style.transform = "translateX(20px)"),
);

// Caught: once the layer is there, its words hidden for 2 frames.
await scene(
  "a full-screen layer's words hidden for 2 frames once it's there",
  { expect: "caught", kind: "blank-flash", arg: WORDS(12, "Session word") },
  (words) => {
    const layer = document.createElement("div");
    layer.setAttribute("data-part", "session");
    layer.innerHTML = words;
    document.body.append(layer);
  },
  () =>
    new Promise((done) => {
      const nodes = [...document.querySelectorAll('[data-part="session"], [data-part="session"] *')];
      nodes.forEach((n) => (n.style.visibility = "hidden"));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        nodes.forEach((n) => (n.style.visibility = ""));
        done();
      }));
    }),
);

// A page that scrolls, its words in it (for the two scroll scenes).
const scrollingPage = (words) => {
  const page = document.querySelector('[data-part="page"]');
  page.style.cssText = "height: 600px; overflow: auto";
  page.innerHTML = words;
};

// Caught: a page on the screen scrolling 300 px in one frame with nothing pressed.
await scene("a page on the screen scrolled 300 px with nothing pressed", { expect: "caught", kind: "scroll-jump", arg: WORDS(80, "Page word") }, scrollingPage, () => {
  document.querySelector('[data-part="page"]').scrollTop = 300;
});

// Fine: the same, slid off the screen (a page a swipe back moved off is put where it was left before it comes back).
await scene(
  "a page slid off the screen scrolled 300 px, then still off it",
  { expect: "fine", kind: "scroll-jump", arg: WORDS(80, "Page word") },
  (words) => {
    // (Sideways overflow clipped, as the app's shell.css has it: else a phone's screen widens to fit the page past its edge.)
    document.documentElement.style.overflowX = "clip";
    document.body.style.overflowX = "clip";
    const page = document.querySelector('[data-part="page"]');
    page.style.cssText = `height: 600px; overflow: auto; transform: translateX(${innerWidth}px)`;
    page.innerHTML = words;
  },
  () => {
    document.querySelector('[data-part="page"]').scrollTop = 300;
  },
);

// Fine: the page's words go for 6 frames while a picture of a page shows its own (shell/page-slide.js: a page held while the next composes; its
// copy in a closed shadow root, read through lxRoot).
await scene(
  "the page's words gone for 6 frames under a picture of a page showing words",
  { expect: "fine", kind: "blank-flash", arg: WORDS(12, "Picture word") },
  (words) => {
    const shot = document.createElement("div");
    shot.setAttribute("data-page-picture", "");
    shot.setAttribute("data-ghost", "");
    Object.assign(shot.style, { position: "fixed", inset: "0", zIndex: "4", background: "#111", padding: "16px", pointerEvents: "none" });
    const root = shot.attachShadow({ mode: "closed" });
    root.innerHTML = words;
    shot.lxRoot = root;
    document.body.append(shot);
  },
  () =>
    new Promise((done) => {
      const page = document.querySelector('[data-part="page"]');
      page.style.visibility = "hidden";
      let n = 0;
      const step = () => (++n === 6 ? ((page.style.visibility = ""), done()) : requestAnimationFrame(step));
      requestAnimationFrame(step);
    }),
);

// Fine: a part put in unfitted and fitted by a ResizeObserver in the same frame, before it's painted (the header's title is fitted that way): no
// jump, as nothing moved on the screen. (Read in each frame's rAF, it was read unfitted and showed as a jump.)
await scene(
  "a part fitted by a ResizeObserver in the frame it comes in",
  { expect: "fine", kind: "teleport" },
  () => {},
  () =>
    new Promise((done) => {
      const tile = document.createElement("div");
      tile.setAttribute("data-part", "tile");
      tile.textContent = "Fitted";
      tile.style.top = "300px";
      tile.style.transform = "translateX(24px)";
      const fit = new ResizeObserver(() => {
        tile.style.transform = "";
        fit.disconnect();
        setTimeout(done, 300);
      });
      document.body.append(tile);
      fit.observe(tile);
    }),
);

// Fine: a session's cover held below the screen for 3 frames (its first step drawing), then rising over the page: the page's words stay in sight
// above it all the way (session.js, 7 Nov: the old rule hid every word outside the layer wherever the layer was, and read it as blank).
await scene(
  "a full-screen layer held below the screen for 3 frames, then sliding up over a page of words",
  { expect: "fine", kind: "blank-flash", arg: { page: WORDS(24, "Page word"), session: WORDS(30, "Session word") } },
  ({ page }) => {
    document.querySelector('[data-part="page"]').innerHTML = page;
  },
  ({ session }) =>
    new Promise((done) => {
      // Put in on the press, below the screen, its words a bar's height down as a session's step is (none within the recorder's margin there).
      const layer = document.createElement("div");
      layer.setAttribute("data-part", "session");
      layer.style.transform = "translateY(100%)";
      layer.innerHTML = `<div style="padding-top: 60px">${session}</div>`;
      document.body.append(layer);
      let n = 0;
      const step = () => {
        if (++n < 3) return requestAnimationFrame(step);
        layer.style.transform = "";
        layer.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 350, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }).finished.then(done);
      };
      requestAnimationFrame(step);
    }),
);

// Fine: a layer a transform animation slides down 300 px on an ease-out, the main thread stalled 150 ms in the frame after it starts (a slow phone):
// the sample after the stall finds its words most of the way down, and the next ones creep. On the screen the compositor moved it every frame
// (7 Nov, lex-design's screencast of Practice's summary leaving: a continuous move; frame-watch read "(0, 215) px in one frame").
await scene(
  "a layer slid by a transform animation, sampled through a 150 ms stall: no teleport",
  { expect: "fine", kind: "teleport", arg: WORDS(6, "Sliding word") },
  (words) => {
    const layer = document.createElement("div");
    layer.setAttribute("data-part", "session");
    layer.style.background = "#000";
    layer.innerHTML = words;
    document.body.append(layer);
  },
  () =>
    new Promise((done) => {
      const layer = document.querySelector('[data-part="session"]');
      // Started in one frame (its clock starts as that frame is drawn, the frame sampled with it at rest), then the stall in a task after that
      // frame: the next frame begins 150 ms on, and its sample finds it most of the way.
      requestAnimationFrame(() => {
        layer.animate([{ transform: "none" }, { transform: "translateY(300px)" }], { duration: 400, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" }).finished.then(() => setTimeout(done, 200));
        setTimeout(() => {
          const t = performance.now();
          while (performance.now() - t < 150);
        }, 0);
      });
    }),
);

// Caught: a part that jumps 120 px inside a layer while the layer slides (its own move, apart from the layer's), and stays there.
await scene(
  "a part jumping 120 px inside a layer that's sliding",
  { expect: "caught", kind: "teleport", arg: WORDS(6, "Sliding word") },
  (words) => {
    const layer = document.createElement("div");
    layer.setAttribute("data-part", "session");
    layer.style.background = "#000";
    layer.innerHTML = `<p data-part="tile" style="position:absolute;left:16px;top:400px;width:160px;height:30px;margin:0">Jumps inside</p>${words}`;
    document.body.append(layer);
  },
  () =>
    new Promise((done) => {
      const layer = document.querySelector('[data-part="session"]');
      const tile = layer.querySelector('[data-part="tile"]');
      layer.animate([{ transform: "none" }, { transform: "translateY(200px)" }], { duration: 600, easing: "linear", fill: "forwards" }).finished.then(() => setTimeout(done, 200));
      let n = 0;
      const step = () => (++n === 12 ? (tile.style.top = "280px") : requestAnimationFrame(step));
      requestAnimationFrame(step);
    }),
);

// Tabs (8 Nov): two tab pages in the page area as shell/main.js keeps them (each in a host of its own, .lx-view, the one that leaves taken out
// of the document and kept, put back when its tab is pressed again) and a tab bar whose tab is "active" for the page shown. frame-check's
// tabs/fast pressed the tabs three frames apart, and every part of a page that left and came back read as gone for three frames (107
// candidates), every tab's state as a flicker. Fine: those. Caught: a part hidden for three frames on the page that stays on the screen, and a
// tab's state flicking with no page coming in.
const TAB_PAGES = { a: WORDS(8, "Home word"), b: WORDS(8, "Study word") };
const tabsBuild = (pages) => {
  const main = document.querySelector('[data-part="page"]');
  const host = (words, title) => {
    const node = document.createElement("div");
    node.className = "lx-view";
    node.innerHTML = `<h2 data-part="section-title">${title}</h2>${words}<a href="#x" data-part="section-link">More of ${title}</a>`;
    return node;
  };
  const kept = { a: host(pages.a, "Home"), b: host(pages.b, "Study") };
  main.replaceChildren(kept.a);
  const bar = document.createElement("nav");
  bar.setAttribute("data-part", "tab-bar");
  bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:56px;display:flex;background:#222";
  bar.innerHTML = '<button data-part="tab" data-state="active" style="flex:1">Home</button><button data-part="tab" style="flex:1">Study</button>';
  document.body.append(bar);
  const tabs = bar.querySelectorAll('[data-part="tab"]');
  // A tab pressed: the page shown leaves the document, the tab's page comes back, the tabs' states follow (main.js render, setTabs).
  window.__tab = (which) => {
    main.replaceChildren(kept[which]);
    tabs.forEach((tab, i) => (i === (which === "a" ? 0 : 1) ? tab.setAttribute("data-state", "active") : tab.removeAttribute("data-state")));
  };
  window.__kept = kept;
  window.__tabs = tabs;
};
// Six presses three frames apart, then still.
const tabsFast = () =>
  new Promise((done) => {
    const order = ["b", "a", "b", "a", "b", "a"];
    let frame = 0;
    let pressed = 0;
    const step = () => {
      frame++;
      if (frame % 3 === 0 && pressed < order.length) window.__tab(order[pressed++]);
      if (frame < order.length * 3 + 12) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
await scene("tabs pressed three frames apart: a page's parts leaving with their page and coming back with it", { expect: "fine", kind: "disappear", arg: TAB_PAGES }, tabsBuild, tabsFast);
await scene("tabs pressed three frames apart: each tab's state following the page shown", { expect: "fine", kind: "state-flicker", arg: TAB_PAGES }, tabsBuild, tabsFast);
// Caught: a word hidden for three frames on the page that stays on the screen (no tab pressed).
await scene(
  "a word hidden for three frames on the page on the screen",
  { expect: "caught", kind: "disappear", arg: TAB_PAGES },
  tabsBuild,
  () =>
    new Promise((done) => {
      const word = window.__kept.a.querySelector("p");
      let frame = 0;
      const step = () => {
        frame++;
        if (frame === 4) word.style.display = "none";
        if (frame === 7) word.style.display = "";
        if (frame < 20) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    }),
);
// Caught: Home's tab going from active to nothing and back in two frames with no page coming in.
await scene(
  "a tab's state flicking with no page coming in",
  { expect: "caught", kind: "state-flicker", arg: TAB_PAGES },
  tabsBuild,
  () =>
    new Promise((done) => {
      const home = window.__tabs[0];
      let frame = 0;
      const step = () => {
        frame++;
        if (frame === 4) home.removeAttribute("data-state");
        if (frame === 6) home.setAttribute("data-state", "active");
        if (frame < 20) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    }),
);

await browser.close().catch(() => {});
writeFileSync(join(OUT, "frame-watch-check.json"), JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(`frame watch check: ${failed ? `${failed} of ${results.length} FAILED` : `all ${results.length} passed`}`);
process.exit(failed ? 1 : 0);
