// Word pictures and symbols in the real app, on a local server, in Chrome and WebKit: inline under the app's real CSP and service
// worker, colored by the art tokens or the theme's own ink; any number on a screen; refused unless they're plain shapes in our
// colors; kept on the device, offline after they've been seen or kept in the background. It signs up a test account.
//
// Usage (headless browsers, so through the channel's GPU queue's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "picture check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/picture-check.mjs http://localhost:<port> <outDir> [chromium|webkit]
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, webkit } from "./quiet-browser.mjs";

const [BASE, outArg, only] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/picture-check.mjs http://localhost:<port> <outDir> [chromium|webkit] (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
let failed = 0;

// One account, signed up in Chrome with a virtual passkey (as every check does); its cookie takes each browser in.
async function signUp() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Picture Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  const cookies = await context.cookies(BASE);
  await browser.close();
  return cookies;
}
const cookies = await signUp();

// WebKit's own line for a request of this site's that its loader refused ("Fetch API cannot load <url> due to access control checks."):
// it reports it as a page error even when the app handles the failure, as the inbox's background poll does, so it says nothing about the app.
// Only this site's own URLs: a refusal of another origin's, or an unhandled rejection ("Unhandled Promise Rejection: …"), still fails.
const HERE = new URL(BASE).host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const REFUSED_HERE = new RegExp(`^Fetch API cannot load https?:\\s?/{1,2}${HERE}/\\S* due to access control checks\\.$`);
export const refusedLoadHere = (text) => REFUSED_HERE.test(text);

// routable: whether this run can stand in for the network. Under a service worker WebKit's requests go past context.route, so WebKit runs
// twice: with its worker, for what doesn't need that, and without, for the refusals and offline.
async function runEngine(name, engine, { worker = true, routable = true } = {}) {
  const context = await engine.launchPersistentContext(mkdtempSync(join(tmpdir(), `picture-check-${name.replace(/\W+/g, "-")}-`)), { headless: true, viewport: { width: 700, height: 800 }, deviceScaleFactor: 2, serviceWorkers: worker ? "allow" : "block" });
  await context.addCookies(cookies);
  const page = context.pages()[0] ?? (await context.newPage());
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const stage = async (title, fn) => {
    try {
      const detail = await fn();
      results.push({ engine: name, stage: title, ok: true, detail });
      console.log(`ok    ${name}: ${title}${detail ? `: ${detail}` : ""}`);
    } catch (error) {
      failed++;
      results.push({ engine: name, stage: title, ok: false, error: String(error?.stack ?? error) });
      console.log(`FAIL  ${name}: ${title}: ${error?.message ?? error}`);
      await page.screenshot({ caret: "initial", path: join(OUT, `fail-${name}-${results.length}.png`) }).catch(() => {});
    }
  };
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const ready = async () => {
    await page.waitForSelector("html[data-app-ready]", { timeout: 30_000 });
    await page.evaluate(() => {
      window.__violations = [];
      document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective}: ${e.blockedURI}`));
    });
  };
  // A stage for itself: a screen of its own over the app, the app's own modules asked for by their real paths.
  const LOAD = `import("/js/study/pictures.js").then(async (m) => { window.__p = m; window.__s = await import("/js/lx/symbols.js"); })`;
  const modules = () => page.evaluate(LOAD);
  const stageRoot = () =>
    page.evaluate(() => {
      document.getElementById("__stage")?.remove();
      const root = document.createElement("div");
      root.id = "__stage";
      root.style.cssText = "position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--canvas);display:flex;flex-wrap:wrap;align-content:flex-start;gap:0";
      document.body.append(root);
    });

  let opened = false;
  await stage("opening the app, on the real server", async () => {
    await page.goto(`${BASE}/app/`);
    await ready();
    await modules();
    assert(await page.evaluate(() => Boolean(window.__p && window.__s)), "its modules didn't load");
    opened = true;
  });
  if (!opened) {
    await context.close();
    return;
  }

  await stage("the files are served as drawings, the list as JSON", async () => {
    const out = await page.evaluate(async () => {
      const list = await fetch("/pictures/manifest.json");
      const data = await list.clone().json();
      const entry = data.pictures.coffee;
      const file = await fetch(`/pictures/${entry.file}?h=${entry.h}`);
      return { list: list.status, listType: list.headers.get("content-type"), file: file.status, type: file.headers.get("content-type"), nosniff: file.headers.get("x-content-type-options"), n: Object.keys(data.pictures).length };
    });
    assert(out.list === 200 && /json/.test(out.listType), `the list: ${out.list} ${out.listType}`);
    assert(out.file === 200 && /svg/.test(out.type), `a drawing: ${out.file} ${out.type}`);
    return `${out.n} drawings; ${out.type}`;
  });

  // A shape's fill as red, green and blue: read from a canvas, because a color-mix computes to oklab(), not rgb().
  const RGB = `const __rgb = (color) => { const c = (window.__c ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })); c.clearRect(0, 0, 1, 1); c.fillStyle = color; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3); };`;
  const fills = (selector) =>
    page.evaluate(`(() => { ${RGB} return [...document.querySelectorAll(${JSON.stringify(selector)})].flatMap((svg) => [...svg.querySelectorAll("[fill]")].filter((n) => n.getAttribute("fill") !== "none").map((n) => __rgb(getComputedStyle(n).fill))); })()`);
  const spread = (list) => Math.max(...list.map(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b)));
  const WORDS = ["coffee", "water", "tea", "milk"];

  await stage("a picture is drawn inline, in its colors, on its tile, under the real CSP", async () => {
    await stageRoot();
    const out = await page.evaluate(async (words) => {
      const ok = await window.__p.loadPictures(words);
      const root = document.getElementById("__stage");
      for (const word of words) {
        const holder = document.createElement("div");
        holder.style.cssText = "width:150px;height:150px";
        holder.append(window.__p.pictureNode(word, { alt: "words" }));
        root.append(holder);
      }
      const part = root.querySelector('[data-part="picture"]');
      return { ok, inline: root.querySelectorAll("svg").length, images: root.querySelectorAll("img").length, tile: getComputedStyle(part).backgroundColor, size: part.getBoundingClientRect().width, height: part.getBoundingClientRect().height, label: part.getAttribute("aria-label"), role: part.getAttribute("role"), v: window.__violations };
    }, WORDS);
    assert(out.ok, "loadPictures said no");
    assert(out.inline === 4 && !out.images, `inline: ${out.inline}, images: ${out.images}`);
    assert(/233, 227, 212/.test(out.tile) || /e9e3d4/i.test(out.tile), `its tile: ${out.tile}`);
    assert(out.size === 150 && out.height === 150, `sized by what holds it: ${out.size}×${out.height}`);
    assert(out.label === "words" && out.role === "img", "its alt text");
    assert(!out.v.length, `the CSP refused: ${out.v.join(" | ")}`);
    const colors = await fills("#__stage svg");
    assert(spread(colors) > 60, `no color came through: ${spread(colors)}`);
    await page.screenshot({ caret: "initial", path: join(OUT, `${name}-color.png`) });
    return `${colors.length} shapes colored`;
  });

  // How far from gray each theme's own ink is: warm off-white, warm black, sepia's brown, pure black and white.
  for (const [theme, most] of [["graphite", 14], ["paper", 10], ["sepia", 60], ["contrast", 3]]) {
    await stage(`on ${theme}, in color and in the theme's own ink`, async () => {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.evaluate(() => document.documentElement.removeAttribute("data-art"));
      const color = await fills("#__stage svg");
      assert(spread(color) > 60, `in color: ${spread(color)}`);
      await page.evaluate(() => document.documentElement.setAttribute("data-art", "theme"));
      const ink = await fills("#__stage svg");
      assert(spread(ink) <= most, `the theme's ink still has color: ${spread(ink)}`);
      assert(ink.join() !== color.join(), "nothing changed");
      await page.screenshot({ caret: "initial", path: join(OUT, `${name}-${theme}-ink.png`) });
      await page.evaluate(() => document.documentElement.removeAttribute("data-art"));
      return `spread ${spread(color)} in color, ${spread(ink)} in ink`;
    });
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "graphite"));

  await stage("a custom theme's ink draws them in that theme's colors", async () => {
    await page.evaluate(() => {
      const root = document.documentElement;
      root.setAttribute("data-theme", "paper");
      root.setAttribute("data-art", "theme");
      root.style.setProperty("--ink-1", "#12296b");
      root.style.setProperty("--canvas", "#f4f6fb");
    });
    const out = await fills("#__stage svg");
    const notBlue = out.filter(([r, g, b]) => b <= r || b < g);
    assert(!notBlue.length && out.length > 10, `not all blue: ${notBlue.slice(0, 4).join(" ")}`);
    const darkest = Math.min(...out.map(([r]) => r));
    assert(darkest < 60, `its darkest is only ${darkest}: not the theme's ink`);
    await page.screenshot({ caret: "initial", path: join(OUT, `${name}-custom-ink.png`) });
    await page.evaluate(() => {
      const root = document.documentElement;
      root.style.removeProperty("--ink-1");
      root.style.removeProperty("--canvas");
      root.removeAttribute("data-art");
      root.setAttribute("data-theme", "graphite");
    });
  });

  const shotOf = async (selector) => page.locator(selector).screenshot({ caret: "initial" });
  const pixels = (a, b) =>
    page.evaluate(
      async ([x, y]) => {
        const data = async (b64) => {
          const image = new Image();
          image.src = `data:image/png;base64,${b64}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const c = canvas.getContext("2d");
          c.drawImage(image, 0, 0);
          return c.getImageData(0, 0, image.width, image.height).data;
        };
        const [p, q] = await Promise.all([data(x), data(y)]);
        let n = 0;
        for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 6) n++;
        return n;
      },
      [a.toString("base64"), b.toString("base64")],
    );
  // Tiles on the page, alone or beside drawings that use the same ids (dog shares b with big and h with heart; a traced object has none).
  const lay = (words) =>
    page.evaluate(async (list) => {
      await window.__p.loadPictures(list);
      const root = document.getElementById("__stage");
      root.replaceChildren();
      for (const word of list) {
        const holder = document.createElement("div");
        holder.className = "__t";
        holder.style.cssText = "width:150px;height:150px;flex:none";
        holder.append(window.__p.pictureNode(word));
        root.append(holder);
      }
    }, words);

  await stage("any number share a screen: the same picture twice, and pictures using the same ids", async () => {
    await lay(["dog"]);
    const alone = await shotOf(".__t");
    await lay(["big", "heart", "day", "dog", "dog"]);
    const ids = await page.evaluate(() => {
      const all = [...document.querySelectorAll("#__stage [id]")].map((n) => n.id);
      return { all: all.length, unique: new Set(all).size, unfound: [...document.querySelectorAll("#__stage [clip-path]")].filter((n) => !document.getElementById(n.getAttribute("clip-path").slice(5, -1))).length };
    });
    assert(ids.all > 3 && ids.all === ids.unique && !ids.unfound, JSON.stringify(ids));
    const beside = await shotOf(".__t:last-child");
    const differ = await pixels(alone, beside);
    // Anti-aliasing can differ by a few under load; a real collision differs by thousands (the control below).
    assert(differ < 100, `${differ} pixels differ`);
    return `${ids.all} ids, all their own; ${differ} pixels differ`;
  });

  await stage("the control: with the ids not made unique, that would fail", async () => {
    await lay(["dog"]);
    const alone = await shotOf(".__t");
    const differ = await page.evaluate(async () => {
      const root = document.getElementById("__stage");
      for (const word of ["big", "heart", "day"]) {
        const holder = document.createElement("div");
        holder.className = "__c";
        holder.style.cssText = "width:150px;height:150px;flex:none";
        holder.append(window.__p.pictureNode(word));
        root.prepend(holder);
      }
      // Strip each copy's own prefix, as if it hadn't been given one.
      for (const node of root.querySelectorAll("[id]")) node.id = node.id.replace(/^p\d+-/, "");
      for (const node of root.querySelectorAll("[clip-path]")) node.setAttribute("clip-path", node.getAttribute("clip-path").replace(/url\(#p\d+-/, "url(#"));
      return true;
    });
    assert(differ, "the control didn't run");
    const broken = await shotOf('.__t:last-child');
    const n = await pixels(alone, broken);
    assert(n > 1000, `a collision would differ by thousands, here ${n}: this check can't see one`);
    return `${n} pixels differ`;
  });

  const NS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"';
  const NASTY = {
    script: `<svg ${NS}><script>window.__ran=1</script></svg>`,
    onload: `<svg ${NS} onload="window.__ran=1"></svg>`,
    image: `<svg ${NS}><image href="https://evil.example/a.png" width="10" height="10"/></svg>`,
    foreign: `<svg ${NS}><foreignObject width="9" height="9"><img xmlns="http://www.w3.org/1999/xhtml" src="https://evil.example/b.png"/></foreignObject></svg>`,
    use: `<svg ${NS}><use href="https://evil.example/c.svg#a"/></svg>`,
    style: `<svg ${NS}><style>@import url(https://evil.example/d.css);</style></svg>`,
    fixed: `<svg ${NS}><rect width="200" height="200" fill="#ff0000"/></svg>`,
    urlfill: `<svg ${NS}><rect width="200" height="200" fill="url(https://evil.example/e.svg#a)"/></svg>`,
    entity: `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "b">]><svg ${NS}></svg>`,
    html: "<!doctype html><script>window.__ran=1</script>",
  };
  const asked = [];
  page.on("request", (request) => asked.push(request.url()));
  const listWith = (pictures) => JSON.stringify({ version: 1, pictures });
  const withRoutes = async (handlers, fn) => {
    for (const [pattern, handler] of handlers) await context.route(pattern, handler);
    try {
      return await fn();
    } finally {
      for (const [pattern, handler] of handlers) await context.unroute(pattern, handler);
    }
  };
  const fresh = async () => {
    await page.reload();
    await ready();
    await modules();
    await stageRoot();
  };

  if (routable) {
  await stage("a file with anything but plain shapes in our colors is refused, and nothing it names is asked for", async () => {
    const pictures = Object.fromEntries([...Object.keys(NASTY), "plain"].map((id) => [id, { file: `${id}.svg`, h: "x", alt: "x" }]));
    const files = { ...NASTY, plain: `<svg ${NS}><rect width="200" height="200" fill="var(--art-sky,#58ADEB)"/></svg>` };
    const out = await withRoutes(
      [
        [`${BASE}/pictures/manifest.json`, (route) => route.fulfill({ contentType: "application/json", body: listWith(pictures) })],
        [`${BASE}/pictures/*.svg*`, (route) => route.fulfill({ contentType: "image/svg+xml", body: files[new URL(route.request().url()).pathname.slice(10, -4)] })],
      ],
      async () => {
        await fresh();
        const result = {};
        for (const id of Object.keys(NASTY)) result[id] = await page.evaluate(async (concept) => !(await window.__p.loadPictures([concept])) && !window.__ran, id);
        // The same way, a plain one is drawn: what's refused above was refused for what it is.
        result.plainDrawn = await page.evaluate(() => window.__p.loadPictures(["plain"]));
        return result;
      },
    );
    assert(out.plainDrawn, "a plain file served the same way wasn't drawn: this stage can't tell");
    const let_through = Object.entries(out).filter(([, refused]) => !refused).map(([id]) => id);
    assert(!let_through.length, `let through: ${let_through.join(", ")}`);
    assert(!asked.some((url) => url.includes("evil.example")), "it reached outside");
    await page.evaluate(() => caches.delete("lx-pictures-v1"));
    return `${Object.keys(NASTY).length} refused`;
  });

  await stage("a name that isn't a listed concept asks the network for nothing", async () => {
    await fresh();
    await page.evaluate(() => window.__p.pictureList());
    asked.length = 0;
    const out = await page.evaluate(async () => {
      const r = {};
      for (const id of ["../../api/me", "https://evil.example/a", "COFFEE", "not-in-the-list", "constructor", "__proto__", "a/b", ""]) r[id] = await window.__p.loadPictures([id]);
      return r;
    });
    assert(Object.values(out).every((v) => v === false), JSON.stringify(out));
    const reached = asked.filter((url) => /pictures\/.|api\/me|evil/.test(url) && !url.includes("manifest"));
    assert(!reached.length, reached.join(" "));
  });

  await stage("the picture game's question: one drawing missing means no pictures at all", async () => {
    const out = await page.evaluate(() => window.__p.loadPictures(["coffee", "water", "not-in-the-list"]));
    assert(out === false, String(out));
  });

  await stage("the worker doesn't keep word pictures: they have their own cache", async () => {
    await fresh();
    await page.evaluate(() => window.__p.loadPictures(["coffee"]));
    const out = await page.evaluate(async () => {
      const names = await caches.keys();
      const inShell = [];
      for (const name of names.filter((n) => n.startsWith("shell-"))) for (const r of await (await caches.open(name)).keys()) if (new URL(r.url).pathname.startsWith("/pictures/")) inShell.push(r.url);
      const kept = (await (await caches.open("lx-pictures-v1")).keys()).map((r) => new URL(r.url).pathname);
      return { inShell, kept, controlled: Boolean(navigator.serviceWorker.controller) };
    });
    assert(!out.inShell.length, `in the shell's cache: ${out.inShell.join(" ")}`);
    assert(out.kept.includes("/pictures/coffee.svg") && out.kept.includes("/pictures/manifest.json"), `kept: ${out.kept.join(" ")}`);
    return `the worker ${out.controlled ? "controls the page" : "hasn't taken the page yet"}`;
  });

  await stage("offline: what's been seen draws, what hasn't says no; then, kept in the background, all of them do", async () => {
    await page.evaluate(() => window.__p.loadPictures(["coffee", "water", "tea", "milk"]));
    const abort = (route) => route.abort();
    const out = await withRoutes([[`${BASE}/pictures/**`, abort]], async () => {
      await page.reload();
      await ready();
      await modules();
      const reached = await page.evaluate(() => fetch("/pictures/manifest.json").then(() => true, () => false));
      assert(!reached, "the network wasn't refused: this stage can't tell");
      // (The app keeps them in the background too, a few seconds after it opens: so one is taken back out, as if it never had been.)
      const seen = await page.evaluate(() => window.__p.loadPictures(["coffee", "water", "tea", "milk"]));
      const unseen = await page.evaluate(async () => {
        const cache = await caches.open("lx-pictures-v1");
        for (const request of await cache.keys()) if (new URL(request.url).pathname === "/pictures/dog.svg") await cache.delete(request);
        return window.__p.loadPictures(["dog"]);
      });
      return { seen, unseen };
    });
    assert(out.seen, "what's been seen didn't draw with no network");
    assert(!out.unseen, "what's never been fetched drew");
    await fresh();
    const kept = await page.evaluate(() => window.__p.keepPicturesForOffline("nl"));
    assert(!kept.stoppedBy && kept.kept + kept.already >= 14, JSON.stringify(kept));
    assert(await page.evaluate(async () => Boolean(await (await caches.open("lx-pictures-v1")).match((await window.__p.pictureList()).pictures.dog ? `/pictures/dog.svg?h=${(await window.__p.pictureList()).pictures.dog.h}` : ""))), "the keep didn't bring it back");
    const after = await withRoutes([[`${BASE}/pictures/**`, abort]], async () => {
      await page.reload();
      await ready();
      await modules();
      return page.evaluate(() => window.__p.loadPictures(["dog", "key", "big"]));
    });
    assert(after, "kept in the background, it still didn't draw offline");
    return `kept ${kept.kept}, had ${kept.already}, ${Math.round(kept.bytes / 1024)} KB`;
  });

  await stage("offline: an empty state's drawing is kept too, though it's no word, and a cover isn't", async () => {
    await page.evaluate(() => window.__p.keepPicturesForOffline("nl"));
    const out = await withRoutes([[`${BASE}/pictures/**`, (route) => route.abort()]], async () => {
      await page.reload();
      await ready();
      await modules();
      const reached = await page.evaluate(() => fetch("/pictures/manifest.json").then(() => true, () => false));
      assert(!reached, "the network wasn't refused: this stage can't tell");
      return page.evaluate(async () => ({
        drew: await window.__p.loadPictures(["empty-offline"]),
        cover: await window.__p.loadPictures(["pack-words-nl-03"]),
      }));
    });
    assert(out.drew, "the offline picture didn't draw with no network");
    assert(!out.cover, "a cover was kept in the background");
    return "drawn with no network; a cover stays fetched when asked for";
  });

  await stage("a word's drawing comes from its language's words, offline too, and only for that language", async () => {
    await fresh();
    const online = await page.evaluate(async () => {
      const { loadWordPictures, pictureOfWord } = window.__p;
      const nl = await loadWordPictures("nl");
      const got = { nl, koffie: pictureOfWord("koffie"), huis: pictureOfWord("huis"), unknown: pictureOfWord("huisjeboompjebeestje"), inherited: pictureOfWord("constructor") };
      got.path = await loadWordPictures("../manifest");
      got.none = await loadWordPictures("xx");
      // The language asked for last answers: one with no file has no words, and Dutch's don't leak into it.
      got.afterNone = pictureOfWord("koffie");
      got.fr = await loadWordPictures("fr");
      got.cafe = pictureOfWord("café");
      got.koffieInFrench = pictureOfWord("koffie");
      await loadWordPictures("nl");
      await window.__p.keepPicturesForOffline("nl");
      return got;
    });
    assert(online.nl === true && online.koffie === "coffee" && online.huis === "house", JSON.stringify(online));
    assert(online.unknown === null && online.inherited === null, `a word with no drawing got one: ${JSON.stringify(online)}`);
    assert(online.path === false && online.none === false && online.afterNone === null, `a made-up language: ${JSON.stringify(online)}`);
    assert(online.fr === true && online.cafe === "coffee" && online.koffieInFrench === null, `French: ${JSON.stringify(online)}`);
    const offline = await withRoutes([[`${BASE}/pictures/**`, (route) => route.abort()]], async () => {
      await page.reload();
      await ready();
      await modules();
      const reached = await page.evaluate(() => fetch("/pictures/words.nl.json").then(() => true, () => false));
      assert(!reached, "the network wasn't refused: this stage can't tell");
      return page.evaluate(async () => {
        const nl = await window.__p.loadWordPictures("nl");
        const concept = window.__p.pictureOfWord("koffie");
        return { nl, concept, drew: await window.__p.loadPictures([concept ?? "x"]) };
      });
    });
    assert(offline.nl && offline.concept === "coffee" && offline.drew, `offline: ${JSON.stringify(offline)}`);
    return "koffie is coffee in Dutch, café in French; offline from what was kept";
  });

  await stage("a server with no drawings: no pictures, whatever's kept from before", async () => {
    const out = await withRoutes([[`${BASE}/pictures/manifest.json`, (route) => route.fulfill({ status: 404, body: "" })]], async () => {
      await page.reload();
      await ready();
      await modules();
      return page.evaluate(() => window.__p.loadPictures(["coffee"]));
    });
    assert(out === false, "it drew from what was kept");
  });

  await stage("a redrawn picture (a new hash) replaces what's kept", async () => {
    await fresh();
    const real = await page.evaluate(() => fetch("/pictures/manifest.json").then((r) => r.json()));
    const changed = JSON.parse(JSON.stringify(real));
    changed.pictures.coffee.h = "redrawn";
    const out = await withRoutes([[`${BASE}/pictures/manifest.json`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(changed) })]], async () => {
      await fresh();
      await page.evaluate(() => window.__p.loadPictures(["coffee"]));
      await page.evaluate(() => window.__p.keepPicturesForOffline("nl"));
      return page.evaluate(async () => (await (await caches.open("lx-pictures-v1")).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search).filter((u) => u.startsWith("/pictures/coffee")));
    });
    assert(out.length === 1 && out[0].endsWith("?h=redrawn"), out.join(" "));
    await fresh();
    await page.evaluate(() => window.__p.keepPicturesForOffline("nl"));
    return out[0];
  });
  }

  await stage("a symbol draws at once, at its size, its own copy, hidden from a screen reader unless it's labeled", async () => {
    await fresh();
    const out = await page.evaluate(() => {
      const { symbol, SYMBOL_NAMES } = window.__s;
      const root = document.getElementById("__stage");
      for (const name of SYMBOL_NAMES) root.append(symbol(name, { size: 48 }));
      root.append(symbol("studied", { size: 48 }));
      const labeled = symbol("flame", { size: 44, label: "Your streak" });
      const none = symbol("no-such-symbol", { size: 48 });
      const svgs = [...root.querySelectorAll("svg")];
      const ids = [...root.querySelectorAll("[id]")].map((n) => n.id);
      return {
        names: SYMBOL_NAMES.length,
        drawn: svgs.filter((s) => s.children.length).length,
        size: svgs[0].getBoundingClientRect().width,
        hidden: svgs.every((s) => s.getAttribute("aria-hidden") === "true"),
        label: [labeled.getAttribute("role"), labeled.getAttribute("aria-label")],
        none: none.children.length,
        unique: ids.length === new Set(ids).size,
        unfound: [...root.querySelectorAll("[clip-path]")].filter((n) => !document.getElementById(n.getAttribute("clip-path").slice(5, -1))).length,
        v: window.__violations,
      };
    });
    assert(out.names >= 17 && out.drawn === out.names + 1, `${out.drawn} of ${out.names + 1}`);
    assert(out.size === 48 && out.hidden, `size ${out.size}, hidden ${out.hidden}`);
    assert(out.label[0] === "img" && out.label[1] === "Your streak", out.label.join());
    assert(out.none === 0, "an unknown symbol drew something");
    assert(out.unique && !out.unfound, `ids: unique ${out.unique}, unfound ${out.unfound}`);
    assert(!out.v.length, out.v.join(" | "));
    await page.screenshot({ caret: "initial", path: join(OUT, `${name}-symbols.png`) });
    return `${out.names} symbols`;
  });

  await stage("data-art on one part of the page: that part in the theme's ink, the rest in color", async () => {
    await page.evaluate(() => {
      const { symbol } = window.__s;
      const root = document.getElementById("__stage");
      root.replaceChildren();
      const color = symbol("flame", { size: 48 });
      color.id = "__color";
      const wrap = document.createElement("span");
      wrap.dataset.art = "theme";
      const ink = symbol("flame", { size: 48 });
      ink.id = "__ink";
      wrap.append(ink);
      root.append(color, wrap);
    });
    const color = await fills("#__color");
    const ink = await fills("#__ink");
    assert(spread(color) > 60, `the color one: ${spread(color)}`);
    assert(spread(ink) <= 14, `the ink one: ${spread(ink)}`);
    return `spread ${spread(color)} and ${spread(ink)}`;
  });

  const realErrors = errors.filter((e) => !/Failed to load|ERR_FAILED|Load failed|network/i.test(e) && !refusedLoadHere(e));
  await stage("no page errors", async () => assert(!realErrors.length, realErrors.slice(0, 3).join(" | ")));
  await context.close();
}

if (only !== "webkit") await runEngine("chromium", chromium);
if (only !== "chromium") {
  await runEngine("webkit", webkit, { worker: false });
  await runEngine("webkit, its worker on", webkit, { worker: true, routable: false });
}
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(failed ? `${failed} failed` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
