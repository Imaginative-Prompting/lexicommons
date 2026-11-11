// Every control answers a tap over 44 × 44 px at least, on a touch phone (or a tablet by touch: --tablet): on /design (every part) and on each tab and
// Settings page. Each control is brought to the middle of the screen and its reach measured by hit-testing out from its
// center (so an invisible ::before reach counts, and nothing on top of it does). Words in a sentence are exempt (a line
// of text can't be 44 px tall: WCAG 2.5.8's inline exception), and so is a link inside a sentence. Text under 12 px fails
// too (ruby readings excepted: they sit over their word at half its size), and so does text quieted by opacity (quiet
// text is quiet by its ink; a disabled or inactive control and a fade in progress excepted). And on a small phone (375 × 667, an iPhone SE
// or mini) every starter's longest sentence fits each game it's played in, Arrange (at the start, every tile placed,
// and checked), Place and Match: nothing in the step scrolls and no tile, gap or item is off the screen. Arrange's start
// is measured after the instruction's face (Onest) arrives late, as on a slow start: it's held back on each
// language's reload until the step is drawn, then let in, and the step must fit again around the longer line. The session's
// summary there keeps a word's long gloss (Hebrew's, and the longest of all) in its own column, clear of the tally and
// the strength bars, and a word's reading (Hebrew's vowel marks, Japanese's kana) while it's new, as written once known.
// A row that wraps two or more small reaching controls keeps its lines (44 px − their height) apart, wrapped or not (components.css's "rows of
// small controls"), a planted row caught first.
// LOCAL only: it signs up a test account, and deletes it.
// Usage: node scripts/component-check.mjs http://localhost:<port> <outDir> [--fit-only] [--langs vi,ja] [--cpu <rate>]
//          [--width 390 | --tablet <w>x<h>] [--theme <id>] [--walk [--max-routes 150] [--per-family 2]] [--pages-only]
//   (exit 0 = pass). --cpu runs the small phone's pages that many times slower (CDP), as a slow phone would. --width: the phone's width
//   for the pages (844 tall). --theme: a theme the account uses for them (useTheme: graphite, paper or a ready one), its id in results.json.
//   --walk: past the pages named below, every route reached by a link from the tabs and Settings (as transition-check walks them, the same
//   routes skipped: a session, a book, the practice room, deleting the account), a family of pages one template draws for many ids (a shared
//   item, a topic, a pack's settings: FAMILIES) measured --per-family times; routes.txt lists what was measured and what wasn't.
//   --pages-only: the pages, the press states and /design's Fill alone (the small phone's stages don't change with width or theme).
//   --tablet: the pages measured on a tablet by touch instead of a phone (an iPad's agent, not a phone's view, at that size: 744x1133,
//   820x1180, 1180x820), where the layouts from 700 and 1024 px wide apply (the session's stage, the sidebar); it measures the pages only.
import { chromium } from "./quiet-browser.mjs";
import { knowWords } from "./fixtures/know-words.mjs";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const FIT_ONLY = argv.includes("--fit-only");
const FIT_LANGS = argv.includes("--langs") ? argv[argv.indexOf("--langs") + 1].split(",") : null;
// --small <w>x<h>: the small phone the starters' longest sentences are fitted on (375x667 unless said: 320x568 is the smallest a phone
// is drawn for, an iPhone SE's first size). --pack <file> (again for more): a pack measured beside the starters (a language's path).
const SMALL = (argv.includes("--small") ? argv[argv.indexOf("--small") + 1] : "375x667").split("x").map(Number);
const MORE_PACKS = argv.flatMap((a, i) => (a === "--pack" ? [argv[i + 1]] : []));
// --order-may-swap (with --small, a phone this short): only the order steps, Put it in order, Listening's order and What does it say?, on each
// pack's longest sentence and one of five words. Shown, it fits as ever (at the start, every tile placed, checked: ANSWERED); too tall at the
// tightest, it's asked the next way instead (session.js askAnotherWay), its evidence that game's own, that game fitting at its start and after
// I don't know and a wrong answer (ANSWERED: the right sentence whole and in view, the step not scrolling), and served without that swap (a
// planted always-show) it's shown and doesn't fit.
// Without it, an order step asked another way is a fault: the 375 phone, and 390 as a control, still show theirs.
const ORDER_MAY_SWAP = argv.includes("--order-may-swap");
// --order-must-show: the same order steps where none may be asked another way (390 × 844, the control: long sentences still played in order).
const ORDER_MUST_SHOW = argv.includes("--order-must-show");
const ORDER_ONLY = ORDER_MAY_SWAP || ORDER_MUST_SHOW;
const CPU = argv.includes("--cpu") ? Number(argv[argv.indexOf("--cpu") + 1]) : 1;
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const WIDTH = Number(opt("width", "390"));
const THEME = opt("theme", null);
const WALK = argv.includes("--walk");
const MAX_ROUTES = Number(opt("max-routes", "150"));
const PER_FAMILY = Number(opt("per-family", "2"));
const TABLET = opt("tablet", null)?.match(/^(\d{3,4})x(\d{3,4})$/)?.slice(1).map(Number) ?? null;
const PAGES_ONLY = argv.includes("--pages-only") || Boolean(TABLET);
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
if (!(WIDTH >= 280 && WIDTH <= 1200) || !(MAX_ROUTES > 0) || !(PER_FAMILY > 0) || (PAGES_ONLY && FIT_ONLY) || (opt("tablet", null) && !TABLET)) {
  console.error("--width 280–1200, --tablet <w>x<h>, --max-routes and --per-family above 0, and --pages-only (or --tablet) never with --fit-only");
  process.exit(2);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/component-check.mjs http://localhost:<port> <outDir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const MIN = 44;
const MIN_TEXT = 12;

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const desk = await browser.newContext();
const signup = await desk.newPage();
const cdp = await desk.newCDPSession(signup);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await signup.goto(`${BASE}/app/`);
await signup.waitForURL(/\/login\?next=/);
await signup.click("summary");
await signup.fill('input[name="name"]', "Component Check");
await signup.click('#register button[type="submit"]');
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
// The AI section's page is the one with controls once an AI is connected (a token will do).
await signup.evaluate(() => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "component check" }) }));
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const phone = await browser.newContext(
  TABLET
    ? { viewport: { width: TABLET[0], height: TABLET[1] }, deviceScaleFactor: 2, isMobile: false, hasTouch: true, userAgent: IPAD }
    : { viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
);
await phone.addCookies(await desk.cookies());
const page = await phone.newPage();
const errors = [];
let at = "setting up";
page.on("pageerror", (e) => errors.push(`${at}: ${e}`));
// The theme the pages are measured in, used as a person picks one (it's kept for every page after), and read back.
if (THEME && !FIT_ONLY) {
  await page.goto(`${BASE}/app/#settings`);
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async (id) => (await import("/js/lx/theme.js")).useTheme(id), THEME);
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const using = await page.evaluate(() => document.documentElement.dataset.theme ?? "graphite");
  if (using !== THEME) {
    console.error(`--theme ${THEME}: the app is in ${using} after it`);
    process.exit(2);
  }
}

// In the page: every visible control, each brought to the middle and measured; and every text under the minimum.
const MEASURE = ({ MIN, MIN_TEXT }) => {
  const CONTROL = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="menuitem"]';
  const INLINE = ["target-word", "woven-word", "reader-word", "credit"];
  const shown = (n) => {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    // /design's own header and contents are the page's chrome, not the app's parts.
    return r.width >= 1 && r.height >= 1 && cs.visibility === "visible" && Number(cs.opacity) > 0 && !n.closest("[inert], [hidden], [aria-hidden='true'], [data-motion-layer], .lx-visually-hidden, .ds-top, .ds-toc");
  };
  const owns = (n, hit) => Boolean(hit) && (hit === n || n.contains(hit) || Boolean(hit.closest("label")?.contains(n)));
  const partOf = (n) => n.getAttribute("data-part") ?? n.closest("[data-part]")?.getAttribute("data-part") ?? n.tagName.toLowerCase();
  const textOf = (n) => (n.getAttribute("aria-label") || n.textContent || n.getAttribute("placeholder") || n.getAttribute("type") || "").trim().replace(/\s+/g, " ").slice(0, 40);
  // A link or word inside running text: inline, with text beside it in its paragraph.
  const inline = (n) => INLINE.includes(n.getAttribute("data-part")) || (getComputedStyle(n).display === "inline" && [...(n.parentElement?.childNodes ?? [])].some((c) => c !== n && c.nodeType === 3 && c.textContent.trim()));
  const reach = (n) => {
    n.scrollIntoView({ block: "center", inline: "center" });
    const r = n.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight || !owns(n, document.elementFromPoint(cx, cy))) return null;
    const out = (dx, dy, limit) => {
      let d = 0;
      for (let s = 1; s <= limit; s += 1) {
        const x = cx + dx * s, y = cy + dy * s;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !owns(n, document.elementFromPoint(x, y))) break;
        d = s;
      }
      return d;
    };
    // Chrome hit-tests a point by its whole pixel, so a box laid out at a fraction of one loses a sliver at each edge to what's beside it, and a
    // 44 px control measured 43 from its middle (/design's sheet handle in v96: its box 44 px from y 399.95). When every whole pixel inside its
    // box answers as the control, its reach is its box at least.
    const across = (from, to, at) => {
      for (let k = Math.ceil(from); k + 1 <= to; k++) if (!owns(n, document.elementFromPoint(at(k + 0.5)[0], at(k + 0.5)[1]))) return 0;
      return to - from;
    };
    const boxed = (measured, from, to, at) => (measured >= MIN ? measured : Math.max(measured, Math.round(across(from, to, at) * 100) / 100));
    return [boxed(out(-1, 0, MIN) + out(1, 0, MIN) + 1, r.left, r.right, (x) => [x, cy]), boxed(out(0, -1, MIN) + out(0, 1, MIN) + 1, r.top, r.bottom, (y) => [cx, y])];
  };
  const controls = [...document.querySelectorAll(CONTROL)].filter(shown);
  const small = [];
  for (const n of controls) {
    if (inline(n)) continue;
    const hit = reach(n);
    if (!hit) continue; // covered at its middle (behind a layer), or off the page's own scroller: not a tap target here
    if (hit[0] < MIN || hit[1] < MIN) small.push({ part: partOf(n), text: textOf(n), hit, box: [Math.round(n.getBoundingClientRect().width), Math.round(n.getBoundingClientRect().height)] });
  }
  const tiny = [];
  const faded = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const host = t.parentElement;
    // A book's drawn cover is a picture (its title and author are written under it too).
    if (!host || seen.has(host) || !t.textContent.trim() || !shown(host) || host.closest("rt, svg, [data-part='book-cover']")) continue;
    seen.add(host);
    const size = parseFloat(getComputedStyle(host).fontSize);
    if (size < MIN_TEXT - 0.05) tiny.push({ part: partOf(host), text: t.textContent.trim().slice(0, 30), size: Math.round(size * 10) / 10 });
    // Quiet text is quiet by its ink (--ink-2, --ink-3), never by opacity: opacity takes contrast from whatever's under
    // it, theme by theme. Exempt, as WCAG exempts them: a disabled or inactive control (an answered choice, the tile
    // being dragged), and anything mid-animation (a fade in or out).
    if (host.closest(":disabled, [aria-disabled='true'], [data-state='dimmed'], [data-state='dragging'], [data-ghost]")) continue;
    // A wheel's rows fade with their turn away from the middle (translate/picker.js): that's where they are on the wheel, not how quiet they are.
    if (host.closest('[data-part="language-picker"]')) continue;
    let opacity = 1;
    let moving = false;
    for (let n = host; n && n !== document.documentElement; n = n.parentElement) {
      opacity *= Number(getComputedStyle(n).opacity);
      if (n.getAnimations().some((a) => a.playState === "running")) moving = true;
    }
    if (!moving && opacity < 0.99) faded.push({ part: partOf(host), text: t.textContent.trim().slice(0, 30), opacity: Math.round(opacity * 100) / 100 });
  }
  return { controls: controls.length, small, tiny, faded };
};

// Rows of small controls (components.css's "rows of small controls"): a flex row that wraps two or more controls that reach past their edges
// (the reach rule's list) and are drawn under 44 px tall keeps its lines (44 px − the shortest's height) apart, wrapped or not: else, once it
// wraps, the lower line's reach takes the upper's taps (7 Nov: the answer bar's Hint over I don't know at 320, 40 px). A row planted at 8 px on
// /design must be caught first.
const ROWS = () => {
  const REACH = '[data-part="settings-button"], [data-part="header-language"], [data-part="app-back"], .lx-back, [data-part="section-link"], [data-part="subnav-link"], [data-part="button"][data-size="sm"], [data-part="segment"], [data-part="order-toggle"], [data-part="switch"], [data-part="radio"], [data-part="tile"]';
  const shown = (n) => n.getClientRects().length && !n.closest("[inert], [hidden], [aria-hidden='true'], [data-ghost], [data-motion-layer], .ds-top, .ds-toc");
  const rows = new Set([...document.querySelectorAll(REACH)].map((n) => n.parentElement).filter(Boolean));
  const out = [];
  for (const row of rows) {
    const cs = getComputedStyle(row);
    if (!/flex/.test(cs.display) || !cs.flexDirection.startsWith("row") || cs.flexWrap === "nowrap") continue;
    const small = [...row.children].filter((c) => c.matches(REACH) && shown(c) && c.getBoundingClientRect().height < 44);
    if (small.length < 2) continue;
    const height = Math.min(...small.map((c) => c.getBoundingClientRect().height));
    const margins = Math.min(...small.map((c) => { const m = getComputedStyle(c); return (parseFloat(m.marginTop) || 0) + (parseFloat(m.marginBottom) || 0); }));
    const between = (parseFloat(cs.rowGap) || 0) + margins;
    if (between + 0.5 >= 44 - height) continue;
    out.push({
      row: `${row.tagName.toLowerCase()}${row.getAttribute("data-part") ? `[${row.getAttribute("data-part")}]` : ""}${[...row.classList].map((c) => `.${c}`).join("")}`,
      part: small[0].getAttribute("data-part") ?? small[0].className,
      text: small[0].textContent.trim().replace(/\s+/g, " ").slice(0, 24),
      height: Math.round(height),
      between: Math.round(between * 10) / 10,
      need: Math.round((44 - height) * 10) / 10,
      wrapped: new Set(small.map((c) => Math.round(c.getBoundingClientRect().top))).size > 1,
    });
  }
  return out;
};
// The plant: two small buttons in a row that wraps, 8 px between its lines (its looks in a constructed sheet: the page's CSP refuses a <style>).
const ROW_PLANT = () => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(".lx-row-plant { display: flex; flex-wrap: wrap; gap: 8px; }");
  globalThis.__lxRowPlantSheet = sheet;
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  const row = document.createElement("div");
  row.className = "lx-row-plant";
  for (const word of ["Plant one", "Plant two"]) {
    const b = document.createElement("button");
    b.dataset.part = "button";
    b.dataset.size = "sm";
    b.dataset.variant = "gray";
    b.textContent = word;
    row.append(b);
  }
  (document.querySelector("main") ?? document.body).prepend(row);
};
let rowPlant = null;
const PAGES = [
  ["/design", "/design"],
  ["Home", "/app/#today"],
  // Translate's page: something typed, its guesses open, so every control on it is here.
  ["Translate", "/app/#today", async () => {
    // The server's answer in first: a book's sentence (a clipped one is a control) comes only from there.
    const answered = page.waitForResponse((response) => response.url().includes("/api/translate"), { timeout: 8000 }).catch(() => {});
    await page.locator('[data-part="translate-field"] textarea').fill("boek");
    await answered;
    await page.waitForTimeout(300);
  }],
  ["Study", "/app/#study"],
  ["Read", "/app/#read"],
  ["Find a book", "/app/#read/find"],
  ["Find a book, filtered", "/app/#read/find?level=1&kind=picture"],
  ["Your library", "/app/#read/library"],
  ["AI", "/app/#ai"],
  ["Explore", "/app/#explore"],
  ["What you know", "/app/#know"],
  ["Settings", "/app/#settings"],
  ["Settings → Appearance", "/app/#settings/appearance"],
  ["Settings → Study", "/app/#settings/study"],
  ["Settings → Language", "/app/#settings/language"],
  ["Settings → Sound and speech", "/app/#settings/voice"],
];
// Every control shows that it's pressed (HIG: "Always include a press state for a custom button"; Material's pressed
// state layer): its look with :active forced (Chrome's own CSS.forcePseudoState, so no tap races the check) differs
// from its look at rest, the control itself or its ::before, ::after or what's inside it. Transitions are finished
// before each look. A field (it shows focus, not a press), a slider (its thumb moves as it's pressed), a link inside
// running text, a disabled control and a game's piece once answered are exempt.
const PRESS = 'button, a[href], summary, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], input[type="checkbox"], input[type="radio"]';
const pressCdp = await phone.newCDPSession(page);
await pressCdp.send("DOM.enable");
await pressCdp.send("CSS.enable");
// The controls are taken once, as elements kept on the page (globalThis.__lxPress), and each is reached through that same element: its looks read
// from it and its :active forced on the node CDP resolves from it (DOM.requestNode). Two lists found apart, CDP's and the page's, went out of step
// on /design, whose demos add controls as they play, and pressed one control while reading another (7 Nov: 404 controls reported with no press
// look, a gray button read as a fade one's). A control gone from the page before its second look is counted apart, never as a miss.
const PRESS_INFO = (sel) => {
  const INLINE = ["target-word", "woven-word", "reader-word", "credit"];
  globalThis.__lxPress = [...document.querySelectorAll(sel)];
  return globalThis.__lxPress.map((n) => {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    const shown = r.width >= 1 && r.height >= 1 && cs.visibility === "visible" && Number(cs.opacity) > 0 && !n.closest("[inert], [hidden], [aria-hidden='true'], [data-motion-layer], .lx-visually-hidden, .ds-top, .ds-toc");
    const inline = INLINE.includes(n.getAttribute("data-part")) || (cs.display === "inline" && [...(n.parentElement?.childNodes ?? [])].some((c) => c !== n && c.nodeType === 3 && c.textContent.trim()));
    // Disabled, or a game's piece once answered (right, wrong, matched, used, moved: inactive, as WCAG has it).
    const disabled = n.matches(":disabled, [aria-disabled='true'], :is([data-part='choice'], [data-part='tile'], [data-part='match-item']):is([data-state='right'], [data-state='wrong'], [data-state='matched'], [data-state='used'], [data-state='moved'], [data-state='dimmed'], [data-state='dragging'])");
    return {
      check: shown && !inline && !disabled,
      part: n.getAttribute("data-part") ?? n.closest("[data-part]")?.getAttribute("data-part") ?? n.tagName.toLowerCase(),
      text: (n.getAttribute("aria-label") || n.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30),
    };
  });
};
const LOOK = (i) => {
  const n = globalThis.__lxPress[i];
  if (!n?.isConnected) return null;
  for (const a of n.getAnimations({ subtree: true })) if (a instanceof CSSTransition) a.finish();
  const PROPS = ["background-color", "background-image", "color", "border-top-color", "border-bottom-color", "box-shadow", "transform", "scale", "opacity", "filter", "outline-color", "outline-style", "text-decoration-line"];
  const take = (cs) => PROPS.map((p) => cs.getPropertyValue(p)).join("|");
  const looks = [take(getComputedStyle(n)), take(getComputedStyle(n, "::before")), take(getComputedStyle(n, "::after"))];
  for (const c of [...n.querySelectorAll("*")].slice(0, 16)) looks.push(take(getComputedStyle(c)), take(getComputedStyle(c, "::before")));
  return looks.join("‖");
};
/** The node CDP knows for the page's kept control i (the same element), or 0. */
async function pressNode(i) {
  const { result } = await pressCdp.send("Runtime.evaluate", { expression: `globalThis.__lxPress[${i}]` });
  if (!result.objectId) return 0;
  try {
    return (await pressCdp.send("DOM.requestNode", { objectId: result.objectId })).nodeId;
  } catch {
    return 0;
  } finally {
    await pressCdp.send("Runtime.releaseObject", { objectId: result.objectId }).catch(() => {});
  }
}
async function pressless() {
  await pressCdp.send("DOM.getDocument", { depth: 0 }); // DOM.requestNode works on a document the session has asked for
  const info = await page.evaluate(PRESS_INFO, PRESS);
  const missing = [];
  let checked = 0;
  let gone = 0;
  let plants = 0;
  for (let i = 0; i < info.length; i++) {
    if (!info[i].check) continue;
    const nodeId = await pressNode(i);
    const rest = nodeId ? await page.evaluate(LOOK, i) : null;
    if (rest === null) {
      gone++;
      continue;
    }
    await pressCdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] });
    const pressed = await page.evaluate(LOOK, i);
    await pressCdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] }).catch(() => {});
    if (pressed === null) {
      gone++;
      continue;
    }
    if (info[i].part.startsWith("press-plant-")) plants++;
    else checked++;
    if (rest === pressed) missing.push({ part: info[i].part, text: info[i].text });
  }
  return { checked, missing, gone, plants };
}
// Two planted controls on /design first, at its top: one with no press look of any kind (it must be caught) and one whose press look is its own
// rule (it must not be). Taken out of the results after.
const PLANTS = () => {
  // Their looks in a constructed sheet: the page's CSP refuses a <style> element and a style attribute, which left both plants unstyled and
  // the same pressed (a style attribute would also outrank the :active rule).
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('[data-part^="press-plant-"] { display: block; width: 120px; height: 48px; margin: 8px; background: rgb(200, 200, 200); color: #000; border: 0; font: 16px sans-serif; } [data-part="press-plant-shows"]:active { background: rgb(1, 2, 3); }');
  globalThis.__lxPressPlantSheet = sheet;
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  const top = document.querySelector("main") ?? document.body;
  for (const part of ["press-plant-none", "press-plant-shows"]) {
    const b = document.createElement("button");
    b.dataset.part = part;
    b.textContent = part;
    top.prepend(b);
  }
};
const pressResults = {};
let pressPlant = null;

const results = {};
let failed = 0;
// --walk: past PAGES, every route a link on a measured /app/ page leads to (the tab bar's too), measured in turn. Skipped as transition-check
// skips them: a session, a book, the practice room, the first run, connecting an AI, deleting the account and its data. A link's query is kept
// only where it makes another page (Find a book's kind). A family is one page drawn for many ids (a shared item, a topic, a pack's settings),
// and only --per-family of each is measured. Every other route is measured: a parent with many pages under it (Settings → Study's games,
// Appearance's pages, the install guides) has a page of its own for each, not one template.
const SKIP = /^#(study\/session|read\/book|practice\/room|welcome|ai\/connect)|^#settings\/(account\/delete|data)/;
const PAGE_QUERY = ["kind"];
const FAMILIES = [/^#explore\/item\/[^/?]+$/, /^#explore\/topic\/[^/?]+$/, /^#settings\/study\/packs\/[^/?]+$/];
const routeOf = (href) => {
  const [path, query = ""] = href.split("?");
  const kept = [...new URLSearchParams(query)].filter(([key]) => PAGE_QUERY.includes(key));
  return kept.length ? `${path}?${new URLSearchParams(kept)}` : path;
};
const parentOf = (route) => route.split("?")[0].split("/").slice(0, -1).join("/");
const LINKS = () =>
  [...document.querySelectorAll('[data-part="page"] a[href^="#"], [data-part="tab-bar"] a[href^="#"]')]
    .filter((a) => a.getClientRects().length && !a.closest("[data-ghost]"))
    .map((a) => a.getAttribute("href"));
const queue = [...(FIT_ONLY ? [] : PAGES)];
const known = new Set(PAGES.filter(([, path, then]) => path.startsWith("/app/") && !then).map(([, path]) => routeOf(path.slice("/app/".length) || "#today")));
const queuedUnder = new Map(); // a parent path → how many of them are measured
const walked = [];
const notWalked = [];
let walkQueued = 0;
for (let qi = 0; qi < queue.length; qi++) {
  const [name, path, then] = queue[qi];
  at = name;
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
  if (then) {
    await then();
    await page.waitForTimeout(600);
  }
  const m = await page.evaluate(MEASURE, { MIN, MIN_TEXT });
  const smallParts = [...new Map(m.small.map((s) => [`${s.part}|${s.text}`, s])).values()];
  const tinyParts = [...new Map(m.tiny.map((s) => [`${s.part}|${s.size}`, s])).values()];
  const fadedParts = [...new Map(m.faded.map((s) => [`${s.part}|${s.opacity}`, s])).values()];
  if (name === "/design") {
    await page.evaluate(ROW_PLANT);
    rowPlant = (await page.evaluate(ROWS)).some((r) => r.row === "div.lx-row-plant");
    await page.evaluate(() => {
      document.querySelector(".lx-row-plant")?.remove();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== globalThis.__lxRowPlantSheet);
    });
  }
  const rowParts = [...new Map((await page.evaluate(ROWS)).map((r) => [r.row, r])).values()];
  const ok = !smallParts.length && !tinyParts.length && !fadedParts.length && !rowParts.length;
  if (!ok) failed++;
  results[name] = { ok, controls: m.controls, small: smallParts, tiny: tinyParts, faded: fadedParts, rows: rowParts };
  if (rowParts.length) console.log(`  rows whose lines' reaches would cross: ${rowParts.map((r) => `${r.row} (${r.part} ${r.height} px “${r.text}”: ${r.between} px between lines, needs ${r.need}${r.wrapped ? ", wrapped now" : ""})`).join("; ")}`);
  if (name === "/design") await page.evaluate(PLANTS);
  pressResults[name] = await pressless();
  if (name === "/design") {
    const r = pressResults[name];
    pressPlant = { measured: r.plants, caught: r.missing.some((m) => m.part === "press-plant-none"), wrong: r.missing.some((m) => m.part === "press-plant-shows") };
    r.missing = r.missing.filter((m) => !m.part.startsWith("press-plant-"));
    await page.evaluate(() => {
      document.querySelectorAll('[data-part^="press-plant-"]').forEach((n) => n.remove());
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== globalThis.__lxPressPlantSheet);
    });
  }
  if (fadedParts.length) console.log(`  quieted by opacity: ${fadedParts.map((s) => `${s.part} “${s.text.slice(0, 20)}” ${s.opacity}`).join(", ")}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${m.controls} controls${smallParts.length ? `; under ${MIN} px: ${smallParts.slice(0, 8).map((s) => `${s.part} “${s.text.slice(0, 20)}” ${s.hit.join("×")}`).join(", ")}${smallParts.length > 8 ? ` and ${smallParts.length - 8} more` : ""}` : ""}${tinyParts.length ? `; text under ${MIN_TEXT} px: ${tinyParts.map((s) => `${s.part} ${s.size}px “${s.text}”`).join(", ")}` : ""}`);
  if (!WALK || !path.startsWith("/app/")) continue;
  if (!then) walked.push(routeOf(path.slice("/app/".length) || "#today"));
  // This page's links: every new route queued, unless its family already has its share.
  const fresh = [];
  for (const href of await page.evaluate(LINKS)) {
    const route = routeOf(href);
    if (known.has(route)) continue;
    known.add(route);
    if (SKIP.test(route)) {
      notWalked.push(`${route}  (skipped: ${route.startsWith("#settings") ? "deleting the account or its data" : "a session, a book, the practice room, the first run or connecting an AI"})`);
      continue;
    }
    fresh.push(route);
  }
  for (const route of fresh) {
    const parent = parentOf(route);
    const family = FAMILIES.some((f) => f.test(route.split("?")[0]));
    if (family && (queuedUnder.get(parent) ?? 0) >= PER_FAMILY) {
      notWalked.push(`${route}  (one of ${parent}/*, ${PER_FAMILY} of which are measured)`);
      continue;
    }
    if (walkQueued >= MAX_ROUTES) {
      notWalked.push(`${route}  (past --max-routes ${MAX_ROUTES})`);
      continue;
    }
    queuedUnder.set(parent, (queuedUnder.get(parent) ?? 0) + 1);
    walkQueued++;
    queue.push([route, `/app/${route}`]);
  }
}
if (WALK && !FIT_ONLY) {
  writeFileSync(`${OUT}/routes.txt`, [`# measured (${walked.length}, at ${TABLET ? `${TABLET.join(" × ")} (a tablet)` : `${WIDTH} px`}${THEME ? `, ${THEME}` : ""})`, ...walked, "", `# not measured (${notWalked.length})`, ...notWalked].join("\n") + "\n");
  console.log(`walked ${walked.length} routes; ${notWalked.length} not measured (routes.txt)`);
}
if (!FIT_ONLY) {
  const name = "the rows rule catches a row planted on /design with its lines 8 px apart";
  results[name] = { ok: rowPlant === true };
  if (!results[name].ok) failed++;
  console.log(`${results[name].ok ? "PASS" : "FAIL"} ${name}${rowPlant === true ? "" : `: ${rowPlant === null ? "/design wasn't measured" : "NOT caught: the rows rule can't fail"}`}`);
}
if (!FIT_ONLY) {
  const name = "every control shows that it's pressed (:active), on /design and every page";
  const missing = Object.entries(pressResults).flatMap(([where, r]) => r.missing.map((m) => ({ where, ...m })));
  const parts = [...new Map(missing.map((m) => [m.part, m])).values()];
  const checked = Object.values(pressResults).reduce((sum, r) => sum + r.checked, 0);
  const gone = Object.values(pressResults).reduce((sum, r) => sum + r.gone, 0);
  // The plants: the one with no press look caught, the one with its own not.
  const plantOk = Boolean(pressPlant?.measured === 2 && pressPlant.caught && !pressPlant.wrong);
  results[name] = { ok: plantOk && !missing.length, checked, gone, plant: pressPlant, parts: parts.map((m) => `${m.part} “${m.text}” (${m.where})`), missing };
  if (!results[name].ok) failed++;
  console.log(`${results[name].ok ? "PASS" : "FAIL"} ${name}: ${checked} controls pressed (${gone} gone from the page between looks); the plants ${plantOk ? "told apart" : `NOT told apart: ${JSON.stringify(pressPlant)}`}${missing.length ? `; ${missing.length} look the same pressed, ${parts.length} parts: ${parts.map((m) => `${m.part} “${m.text.slice(0, 18)}”`).join(", ")}` : ""}`);
}

// A Fill game's choices are the language's words: they read in their sentence's face (Urdu's Nastaliq, Hebrew's
// Noto), as its tiles do, never the interface's.
if (!FIT_ONLY) {
  const name = "a Fill game's choices read in their sentence's face, at least 16px, in the full ink (/design)";
  at = "/design (Fill's choices)";
  await page.goto(`${BASE}/design/`);
  await page.waitForTimeout(1500);
  const fills = await page.evaluate(() =>
    [...document.querySelectorAll('[data-part="fill-sentence"]')].map((s) => {
      const row = s.nextElementSibling;
      return {
        lang: s.getAttribute("lang"),
        face: getComputedStyle(s).fontFamily,
        choices: row ? [...row.querySelectorAll('[data-part="button"]')].map((c) => ({ text: c.textContent.trim().slice(0, 12), face: getComputedStyle(c).fontFamily, size: parseFloat(getComputedStyle(c).fontSize), color: getComputedStyle(c).color })) : [],
        ink: (() => {
          const probe = document.createElement("span");
          probe.style.color = "var(--ink-1)";
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        })(),
      };
    }),
  );
  // In its sentence's face, at least 16px and in the full ink (choices can differ by one letter).
  const off = fills.flatMap((f) => f.choices.flatMap((c) => [
    c.face !== f.face ? `${f.lang} “${c.text}”: ${c.face.split(",")[0]} under ${f.face.split(",")[0]}` : null,
    c.size < 15.95 ? `${f.lang} “${c.text}”: ${c.size}px` : null,
    c.color !== f.ink ? `${f.lang} “${c.text}”: ${c.color}, not the full ink (${f.ink})` : null,
  ].filter(Boolean)));
  results[name] = { ok: fills.length > 0 && !off.length, fills, off };
  if (!results[name].ok) failed++;
  console.log(`${results[name].ok ? "PASS" : "FAIL"} ${name}: ${fills.length} sentences${off.length ? `; ${off.slice(0, 6).join(" | ")}` : ""}`);
}

// ---------- every starter's longest sentence, on a small phone ----------

// The longest sentences of a starter: the most words (tiles), then the most characters; the two of them as the only
// pack on in their language, so a game's step is one of them.
const longer = (a, b) => b.words.length - a.words.length || b.words.map(([t]) => t).join("").length - a.words.map(([t]) => t).join("").length;
// Every language's starter: the files in packs/, and Dutch's, built into the app.
const dutch = (await import(join(APP, "public/js/packs/starter-word-order.js"))).default;
const STARTERS = [dutch, ...readdirSync(join(APP, "packs"))
  .filter((f) => /^starter-[a-z]+(?:-[a-z]+)?\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(APP, "packs", f), "utf8"))), ...MORE_PACKS.map((f) => JSON.parse(readFileSync(resolve(f), "utf8")))]
  .filter((p) => !PAGES_ONLY && (!FIT_LANGS || FIT_LANGS.includes(p.language)))
  .sort((a, b) => a.language.localeCompare(b.language));
// No service worker and the cache off, so each reload fetches the instruction's face again, where it can be held back.
const small = await browser.newContext({ viewport: { width: SMALL[0], height: SMALL[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
await small.addCookies(await desk.cookies());
const sp = await small.newPage();
{
  const cdp = await small.newCDPSession(sp);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
}
// The instruction's face (Onest, the head face), held back while `faceGate` is shut: open until a language's reload.
const FACE = "**/fonts/onest-*";
let faceGate = Promise.resolve();
let letFaceIn = () => {};
let facesHeld = 0;
await sp.route(FACE, async (route) => {
  facesHeld++;
  await faceGate;
  try {
    await route.continue();
  } catch {}
});
sp.on("pageerror", (e) => errors.push(`375×667: ${e}`));
if (STARTERS.length) {
  await sp.goto(`${BASE}/app/`);
  await sp.waitForSelector("html[data-app-ready]");
}
const SESSION = '[data-part="session"]:not([data-ghost])';
// What a step shows against the screen: how far its middle scrolls, and what of the game is outside what's showing.
const FIT = (sel) => {
  const s = document.querySelector(sel);
  const act = s?.querySelector('[data-part="activity"]');
  if (!act) return null;
  act.scrollTop = 0;
  const a = act.getBoundingClientRect();
  const PIECES = '[data-part="tile"]:not([data-state="used"]), [data-part="place-gap"], [data-part="match-item"], [data-part="arrange-answer"], [data-part="arrange-bank"], [data-part="fill-sentence"], [data-part="fill-sentence"] + .lx-row > [data-part="button"]';
  const hidden = [...act.querySelectorAll(PIECES)]
    .filter((n) => n.getClientRects().length && getComputedStyle(n).visibility === "visible")
    .filter((n) => {
      const r = n.getBoundingClientRect();
      return r.top < a.top - 0.5 || r.bottom > a.bottom + 0.5 || r.left < -0.5 || r.right > innerWidth + 0.5;
    })
    .map((n) => n.dataset.word || n.getAttribute("data-part"));
  const buttons = [...s.querySelectorAll('[data-part="answer-bar"] button')].filter((b) => b.getClientRects().length);
  const offBar = buttons.filter((b) => b.getBoundingClientRect().bottom > innerHeight + 0.5).map((b) => b.textContent.trim());
  // What a failure is told with: the session's fit level, the step's height, Arrange's bank and order, what's animating
  // and whether the fonts are in.
  const bank = act.querySelector('[data-part="arrange-bank"]'), row = act.querySelector('[data-part="arrange-answer"]');
  const why = `fit ${s.getAttribute("data-fit") ?? 0}, step ${Math.round(act.clientHeight)} px${bank ? `, bank ${Math.round(bank.getBoundingClientRect().height)} px, order ${Math.round(row?.getBoundingClientRect().height ?? 0)} px` : ""}, ${document.getAnimations().filter((a) => a.playState === "running").length} animating, fonts ${document.fonts.status}`;
  return { scroll: Math.round(act.scrollHeight - act.clientHeight), hidden, offBar, why, tiles: act.querySelectorAll('[data-part="arrange-bank"] [data-part="tile"]').length, wide: Math.round(Math.max(...[...s.querySelectorAll(':scope > :is([data-part="session-bar"], [data-part="activity"], [data-part="answer-bar"])')].map((n) => n.getBoundingClientRect().right))), vw: innerWidth };
};
const fitFails = (f) => {
  if (!f) return "no step";
  const bad = [f.wide > f.vw + 0.5 ? `${f.wide} px wide on a ${f.vw} px screen` : null, f.scroll > 1 ? `scrolls ${f.scroll}px` : null, f.hidden.length ? `off screen: ${f.hidden.join(" ")}` : null, f.offBar.length ? `below the screen: ${f.offBar.join(", ")}` : null].filter(Boolean);
  return bad.length ? `${bad.join("; ")} (${f.why})` : "";
};
// An answered step (session.js fit and answerFirst): the step itself never scrolling; the result's right sentence whole and in view, over the
// capped body's fade and on the screen, with nothing scrolled; every control outside a capped body on the screen. Inside a capped body the way
// in's chips and the rest of the explanation may sit below its foot: the body scrolls to them. (FIT counted those as off the screen, 9 Nov.)
const ANSWERED = (sel) => {
  const s = document.querySelector(sel);
  const act = s?.querySelector('[data-part="activity"]');
  const bar = s?.querySelector('[data-part="answer-bar"]');
  if (!act || !bar) return null;
  act.scrollTop = 0;
  const body = bar.querySelector(".lx-answer-body");
  const capped = bar.hasAttribute("data-capped");
  if (body) body.scrollTop = 0;
  const line = bar.querySelector('[data-part="spoken-line"]');
  let sentence = line ? "" : "no sentence in the result";
  if (line && body) {
    const r = line.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    const foot = capped ? b.bottom - (parseFloat(getComputedStyle(body).paddingBottom) || 0) : b.bottom;
    if (!(r.top >= b.top - 0.5 && r.bottom <= foot + 0.5 && r.bottom <= innerHeight + 0.5)) sentence = `the right sentence ("${line.textContent.trim().slice(0, 40)}") not whole in view: its foot at ${Math.round(r.bottom)}, the body's ${capped ? "fade" : "foot"} at ${Math.round(foot)}, the screen's at ${innerHeight}`;
  }
  const offBar = [...bar.querySelectorAll("button")].filter((b) => b.getClientRects().length && !(capped && body?.contains(b)) && b.getBoundingClientRect().bottom > innerHeight + 0.5).map((b) => b.textContent.trim());
  const why = `fit ${s.getAttribute("data-fit") ?? 0}, step ${Math.round(act.clientHeight)} px, ${capped ? `the result held to ${bar.style.getPropertyValue("--answer-cap")}` : "the result whole"}`;
  return { scroll: Math.round(act.scrollHeight - act.clientHeight), sentence, offBar, why, wide: Math.round(Math.max(...[...s.querySelectorAll(':scope > :is([data-part="session-bar"], [data-part="activity"], [data-part="answer-bar"])')].map((n) => n.getBoundingClientRect().right))), vw: innerWidth };
};
const answeredFails = (f) => {
  if (!f) return "no step";
  const bad = [f.wide > f.vw + 0.5 ? `${f.wide} px wide on a ${f.vw} px screen` : null, f.scroll > 1 ? `the step scrolls ${f.scroll}px` : null, f.sentence || null, f.offBar.length ? `below the screen: ${f.offBar.join(", ")}` : null].filter(Boolean);
  return bad.length ? `${bad.join("; ")} (${f.why})` : "";
};
// Opens a game's step (opened(): once it's drawn, before its fonts are waited for). Its navigations wait only for their
// commit: a face held back keeps the page's load event back.
let stillNew = []; // words left new when a game's words are made known (a whole-sentence game needs at most one new)
async function openStep(kind, want, opened = async () => {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await sp.goto(`${BASE}/app/#study`, { waitUntil: "commit" });
    await sp.waitForSelector("html[data-app-ready]");
    await knowWords(sp, stillNew);
    await sp.goto(`${BASE}/app/#study/session/game/${kind}`, { waitUntil: "commit" });
    const drawn = await sp.waitForSelector(`${SESSION} [data-part="activity-prompt"]`, { timeout: 15_000 }).then(() => true, () => false);
    if (!drawn) continue;
    await opened();
    await sp.evaluate(() => document.fonts.ready);
    await sp.waitForTimeout(400);
    if (await sp.evaluate(want, SESSION)) return true;
  }
  return false;
}
/** Saves `pack` and makes it the only pack on in its language, the language being learned. */
const onlyPack = (lang, pack) =>
  sp.evaluate(
    async ({ lang, pack }) => {
      localStorage.setItem("lx.learning.v1", JSON.stringify({ lang, from: "en" }));
      const study = JSON.parse(localStorage.getItem("lx.study.v1") || "{}");
      study.arrange = { ...(study.arrange ?? {}), tiles: "dutch" };
      // (Listening asked in its order game: the one of its three a long sentence makes too tall.)
      study.listen = { ...(study.listen ?? {}), mode: "order" };
      localStorage.setItem("lx.study.v1", JSON.stringify(study));
      const packs = await import("/js/study/packs.js");
      await packs.loadPacks();
      const result = await packs.savePack(pack);
      for (const other of packs.allPacks()) if (other.language === lang && other.id !== pack.id) packs.setPackOn(other.id, false);
      return { ok: result.ok, errors: (result.errors ?? []).map((e) => `${e.at}: ${e.message}`) };
    },
    { lang, pack },
  ).catch((e) => ({ ok: false, errors: [String(e)] }));
// An order step drawn (its bank's tiles), or the step that took its place (another game's question).
const ORDER_SHOWN = (sel) => document.querySelectorAll(`${sel} [data-part="arrange-bank"] [data-part="tile"]`).length >= 2;
const ORDER_OR_ANOTHER = (sel) => {
  const kind = document.querySelector(sel)?.getAttribute("data-step");
  return kind === "arrange" || kind === "listen" ? document.querySelectorAll(`${sel} [data-part="arrange-bank"] [data-part="tile"]`).length >= 2 : Boolean(kind && document.querySelector(`${sel} [data-part="activity-prompt"], ${sel} [data-part="study-card"]`));
};
// session.js as served, but playing a set plan for mode "still" (globalThis.__stillPlan: the order loop's exact step, as speaking-words-check
// sets one), and while `planted` without its swap (askAnotherWay): the order step it would have asked another way is shown.
let planted = false;
if (ORDER_ONLY)
  await sp.route(/\/js\/study\/session\.js(\?|$)/, async (route) => {
    const response = await route.fetch();
    let text = (await response.text()).replace("const plan = planSession(mode, arg);", 'const plan = mode === "still" ? globalThis.__stillPlan : planSession(mode, arg);');
    if (planted) text = text.replace("queueMicrotask(askAnotherWay)", "void 0");
    return route.fulfill({ response, body: text, headers: { ...response.headers(), "content-type": "text/javascript" } });
  });
/** The page loaded afresh at Study (never at the set plan's address: a fresh page has no plan to play there). */
async function freshPage() {
  await sp.evaluate(() => history.replaceState(history.state, "", "#study"));
  await sp.reload({ waitUntil: "commit" });
  await sp.waitForSelector("html[data-app-ready]");
}
/**
 * The order loop's step, exactly: `item`'s Put it in order (or Listening's order), as the planner's instead makes them, played as a set plan
 * that carries the planner's own instead (a game session's), so a step too tall here is asked the next way as it would be in a lesson. The
 * id of the sentence asked, or null.
 */
async function orderOpen(kind, item) {
  await sp.goto(`${BASE}/app/#study`, { waitUntil: "commit" });
  await sp.waitForSelector("html[data-app-ready]");
  await knowWords(sp, []);
  const id = await sp.evaluate(
    async ({ kind, words }) => {
      const { ITEMS } = await import("/js/study/content.js");
      const { planSession } = await import("/js/study/plan.js");
      const item = ITEMS.find((one) => one.words.map(([text]) => text).join(" ") === words);
      if (!item) return null;
      const plan = planSession("game", kind);
      // What does it say?'s step as the planner makes it (its tiles and answer): its instead with every other game set aside.
      const others = ["arrange", "choose", "fill", "place", "say", "listen", "type", "type-gap", "hear-gap"];
      const step =
        kind === "listen" ? { kind: "listen", mode: "order", skill: "hear", item }
        : kind === "translate" ? plan.instead({ kind: "arrange", mode: "dutch", skill: "read", item }, new Set(others))
        : { kind: "arrange", mode: "dutch", skill: "read", item };
      if (!step) return null;
      globalThis.__stillPlan = { title: "Check", steps: [step], instead: plan.instead };
      location.hash = "#study/session/still/check";
      return item.id;
    },
    { kind, words: item.words.map(([text]) => text).join(" ") },
  );
  if (!id) return null;
  const drawn = await sp.waitForFunction(ORDER_OR_ANOTHER, SESSION, { timeout: 15_000 }).then(() => true, () => false);
  await sp.evaluate(() => document.fonts.ready);
  await sp.waitForTimeout(400);
  return drawn ? id : null;
}
const ORDER_KINDS = ["arrange", "arrange-english", "listen-order", "translate"];
/** An order step's fit as it's played: at the start, every tile placed (tapped in turn) and checked; "" each where it fits. */
async function orderPlayed(prefix) {
  // What was asked, as it read: its instruction and its tiles.
  const shown = await sp.evaluate((sel) => `"${document.querySelector(`${sel} [data-part="activity-prompt"] > span`)?.firstChild?.textContent ?? ""}": ${[...document.querySelectorAll(`${sel} [data-part="arrange-bank"] [data-part="tile"]`)].map((tile) => tile.dataset.word ?? tile.textContent).join(" · ")}`, SESSION);
  const out = { [`${prefix}Start`]: fitFails(await sp.evaluate(FIT, SESSION)), [`${prefix}Shown`]: shown };
  const most = await sp.evaluate((sel) => document.querySelectorAll(`${sel} [data-part="arrange-bank"] [data-part="tile"]`).length, SESSION);
  for (let i = 0; i < most + 2; i++) {
    const next = sp.locator(`${SESSION} [data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])`).first();
    if (!(await next.count())) break;
    await next.click({ force: true });
    await sp.waitForTimeout(60);
  }
  await sp.waitForTimeout(500);
  out[`${prefix}Placed`] = fitFails(await sp.evaluate(FIT, SESSION));
  await sp.locator(`${SESSION} [data-part="answer-bar"] button`, { hasText: /^Check$/ }).click();
  await sp.waitForTimeout(1200);
  out[`${prefix}Checked`] = answeredFails(await sp.evaluate(ANSWERED, SESSION));
  out[`${prefix}Tiles`] = most;
  return out;
}
/**
 * An order step asked another way (session.js askAnotherWay): a fault without --order-may-swap. With it, its evidence is that game's (I don't
 * know pressed: the rows it records), and with the swap planted away the order step is shown and doesn't fit: the swap is what kept it off.
 */
async function orderAskedAnother(game, askedAs, shown, reopen = () => openStep(game, shown), item = null) {
  const key = game;
  if (!ORDER_MAY_SWAP) return { [`${key}Start`]: `asked as ${askedAs}, not shown` };
  const out = { [`${key}Asked`]: askedAs };
  // The step that took its place fits too (a tile game in its place was as tall, 9 Nov), at its start and once answered.
  const replacing = fitFails(await sp.evaluate(FIT, SESSION));
  if (replacing) out[`${key}Replaced`] = `${askedAs} at its start: ${replacing}`;
  const before = await sp.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().length);
  const skip = sp.locator(`${SESSION} [data-part="answer-bar"] button`, { hasText: /^I don't know$/ });
  if (await skip.count()) {
    await skip.first().click();
    await sp.waitForTimeout(600);
    const rows = await sp.evaluate(async (n) => (await import("/js/study/progress.js")).allEvidence().slice(n).map((one) => one.activity), before);
    const answered = answeredFails(await sp.evaluate(ANSWERED, SESSION));
    if (answered) out[`${key}ReplacedAnswered`] = `${askedAs} after I don't know: ${answered}`;
    if (!rows.length) out[`${key}Evidence`] = `nothing recorded for ${askedAs}`;
    else if (rows.some((activity) => ORDER_KINDS.includes(activity) || !String(activity).startsWith(askedAs))) out[`${key}Evidence`] = `asked as ${askedAs}, recorded as ${rows.join(", ")}`;
  } else out[`${key}Evidence`] = `no I don't know on ${askedAs}`;
  // And after a wrong answer (the sentence's own wrong choice, or its tiles last first), opened again.
  if (item) {
    const again = (await reopen()) && (await sp.evaluate((sel) => document.querySelector(sel)?.getAttribute("data-step"), SESSION));
    if (again !== askedAs) out[`${key}ReplacedWrong`] = `opened again, asked as ${again || "nothing"}, not ${askedAs}`;
    else {
      const wrongOnes = new Set((item.wrong ?? []).map((w) => w.trim()));
      const choices = sp.locator(`${SESSION} [data-part="choice"]`);
      let pressed = false;
      for (let i = 0; i < (await choices.count()) && !pressed; i++)
        if (wrongOnes.has((await choices.nth(i).textContent()).trim())) {
          await choices.nth(i).click();
          pressed = true;
        }
      if (!pressed && !(await choices.count())) {
        const tiles = sp.locator(`${SESSION} [data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])`);
        for (let i = (await tiles.count()) - 1; i >= 0; i--) await tiles.nth(i).click({ force: true });
        const check = sp.locator(`${SESSION} [data-part="answer-bar"] button`, { hasText: /^Check$/ });
        if (await check.count()) (await check.click(), (pressed = true));
      }
      await sp.waitForTimeout(1200);
      const meaning = await sp.evaluate((sel) => document.querySelector(`${sel} [data-part="answer-bar"]`)?.getAttribute("data-meaning"), SESSION);
      if (!pressed || meaning !== "wrong") out[`${key}ReplacedWrong`] = `${askedAs} after a wrong answer: no wrong answer given (${pressed ? `the result ${meaning}` : "nothing to press"})`;
      else {
        const wrong = answeredFails(await sp.evaluate(ANSWERED, SESSION));
        if (wrong) out[`${key}ReplacedWrong`] = `${askedAs} after a wrong answer: ${wrong}`;
      }
    }
    // And after a right answer (its result as tall as a miss's now: Word for word on right answers), where the game is a choice.
    const once = (await reopen()) && (await sp.evaluate((sel) => document.querySelector(sel)?.getAttribute("data-step"), SESSION));
    const choices = sp.locator(`${SESSION} [data-part="choice"]`);
    if (once === askedAs && (await choices.count())) {
      const wrongOnes = new Set((item.wrong ?? []).map((w) => w.trim()));
      for (let i = 0; i < (await choices.count()); i++)
        if (!wrongOnes.has((await choices.nth(i).textContent()).trim())) {
          await choices.nth(i).click();
          break;
        }
      await sp.waitForTimeout(1800);
      const meaning = await sp.evaluate((sel) => document.querySelector(`${sel} [data-part="answer-bar"]`)?.getAttribute("data-meaning"), SESSION);
      const right = meaning === "right" ? answeredFails(await sp.evaluate(ANSWERED, SESSION)) : `the result ${meaning}, not right`;
      if (right) out[`${key}ReplacedRight`] = `${askedAs} after a right answer: ${right}`;
    }
  }
  planted = true;
  await freshPage();
  const plantShown = (await reopen()) && (await sp.evaluate(shown, SESSION));
  const fits = plantShown ? fitFails(await sp.evaluate(FIT, SESSION)) : null;
  planted = false;
  await freshPage();
  if (!plantShown) out[`${key}Plant`] = "with the swap planted away, the order step still wasn't shown";
  else if (!fits) out[`${key}Plant`] = "with the swap planted away, the order step fits: it was asked another way though it fits";
  else out[`${key}Without`] = fits;
  return out;
}
/** Listening's order step (study.listen.mode "order", set with the pack): shown and fitting, or asked another way as above. */
async function listenOrder(item) {
  const id = await orderOpen("listen", item);
  if (!id) return { listenStart: "Listening's order step never drawn" };
  return orderAsked("listen", id, item);
}
/** The step drawn for `id`'s order game: the sentence asked must be that one; shown, played; asked another way, judged so. */
async function orderAsked(game, id, item) {
  const now = await sp.evaluate((sel) => ({ kind: document.querySelector(sel)?.getAttribute("data-step"), item: document.querySelector(sel)?.getAttribute("data-item") }), SESSION);
  if (now.item !== id) return { [`${game}Start`]: `the session asked ${now.item}, not ${id}` };
  return now.kind === game ? orderPlayed(game) : orderAskedAnother(game, now.kind, ORDER_SHOWN, () => orderOpen(game, item), item);
}

const fitResults = {};
// --order-may-swap: each pack's longest sentence and the one nearest five words (a lesson's usual), each the pack's only sentence: its Put it
// in order and its Listening's order, shown and fitting or asked another way (orderAskedAnother).
if (ORDER_ONLY) for (const starter of STARTERS) {
  const lang = starter.language;
  const sorted = [...starter.items].filter((item) => item.words?.length > 1).sort(longer);
  const five = [...sorted].sort((a, b) => Math.abs(a.words.length - 5) - Math.abs(b.words.length - 5))[0];
  for (const [which, item] of [["longest", sorted[0]], ["five words", five]]) {
    const at = `${lang} ${starter.id} ${which}`;
    let saved = await onlyPack(lang, { ...starter, id: `check-order-${lang.toLowerCase()}`, name: `Check: ${which} in ${lang}`, items: [item], lessons: undefined, units: undefined });
    const row = {};
    // A pack newer than this server's grammar (a pattern its catalog hasn't yet): the sentence without its concept tags, which an order step
    // doesn't show, said so.
    if (!saved.ok && saved.errors.some((e) => /isn't in the language's catalog/.test(e))) {
      saved = await onlyPack(lang, { ...starter, id: `check-order-${lang.toLowerCase()}`, name: `Check: ${which} in ${lang}`, items: [{ ...item, concepts: [] }], lessons: undefined, units: undefined });
      row.packNote = "its concept tags left out (a pattern this server's grammar hasn't yet)";
    }
    if (!saved.ok) row.pack = `not saved: ${saved.errors.join(" | ")}`;
    else {
      await freshPage();
      const id = await orderOpen("arrange", item);
      if (!id) row.arrangeStart = "Put it in order never drawn";
      else Object.assign(row, await orderAsked("arrange", id, item));
      Object.assign(row, await listenOrder(item));
      // What does it say?, an order step too (its English from tiles).
      const said = await orderOpen("translate", item);
      Object.assign(row, said ? await orderAsked("translate", said, item) : { translateStart: "What does it say? never drawn" });
    }
    fitResults[at] = { words: item.words.length, ...row };
    const bad = Object.entries(row).filter(([k, v]) => !/(Asked|Tiles|Note|Shown|Without)$/.test(k) && v);
    console.log(`  ${bad.length ? "✗" : "✓"} ${at} (${item.words.length} words${row.arrangeTiles ? `, ${row.arrangeTiles} tiles` : ""})${row.arrangeAsked ? `: Put it in order asked as ${row.arrangeAsked}` : row.arrangeTiles ? ": Put it in order shown" : ""}${row.listenAsked ? `, Listening's order asked as ${row.listenAsked}` : row.listenTiles ? ", Listening's order shown" : ""}${row.translateAsked ? `, What does it say? asked as ${row.translateAsked}` : row.translateTiles ? ", What does it say? shown" : ""}${row.listenNote ? `, ${row.listenNote}` : ""}${bad.length ? ` — ${bad.map(([k, v]) => `${k} ${v}`).join(" | ")}` : ""}`);
  }
}
// (Left at Study: the stages after this reload the page, and a fresh page has no set plan to play at its address.)
if (ORDER_ONLY) await freshPage();
if (!ORDER_ONLY) for (const starter of STARTERS) {
  const lang = starter.language;
  const items = [...starter.items].sort(longer).slice(0, 2);
  // What does it mean? asks about a tagged word and offers others' meanings, so it needs sentences that have them: a fixed greeting among the longest (Nepali's, Punjabi's) has none. It runs on
  // the longest tagged pair; every other game goes on measuring the longest, all-phrase or not.
  const tagged = [...starter.items].filter((item) => item.words.some(([, lemma]) => lemma)).sort(longer).slice(0, 2);
  const samePair = tagged.every((item) => items.includes(item));
  const words = items[0].words.length;
  const saved = await onlyPack(lang, { ...starter, id: `check-fit-${lang.toLowerCase()}`, name: `Check: the longest in ${lang}`, items, lessons: undefined, units: undefined }); // (a starter's lessons and units name items this leaves out)
  const row = {};
  if (!saved.ok) {
    row.pack = `not saved: ${saved.errors.join(" | ")}`;
  } else {
    // The reload with the instruction's face held back, let in once Arrange's step is drawn (in the face before it).
    faceGate = new Promise((r) => (letFaceIn = r));
    facesHeld = 0;
    let faceLate = null;
    await sp.reload({ waitUntil: "commit" });
    await sp.waitForSelector("html[data-app-ready]");
    // Arrange: the longest sentence's tiles (the most of them); asked another way, a fault here (orderAskedAnother).
    const arranged = await openStep("arrange", ORDER_OR_ANOTHER, async () => {
      faceLate ??= facesHeld > 0 && !(await sp.evaluate(() => document.fonts.check('700 24px "Onest"')));
      letFaceIn();
    });
    letFaceIn();
    const askedAs = arranged ? await sp.evaluate((sel) => document.querySelector(sel)?.getAttribute("data-step"), SESSION) : null;
    if (arranged && askedAs !== "arrange") {
      Object.assign(row, await orderAskedAnother("arrange", askedAs, ORDER_SHOWN));
    } else if (arranged) {
      const most = await sp.evaluate((sel) => document.querySelectorAll(`${sel} [data-part="arrange-bank"] [data-part="tile"]`).length, SESSION);
      // The face must have been late, or this measured nothing of it.
      row.arrangeStart = faceLate ? fitFails(await sp.evaluate(FIT, SESSION)) : `the instruction's face was in before the step (${facesHeld} held)`;
      for (let i = 0; i < most + 2; i++) {
        const next = sp.locator(`${SESSION} [data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])`).first();
        if (!(await next.count())) break;
        await next.click({ force: true });
        await sp.waitForTimeout(60);
      }
      await sp.waitForTimeout(500);
      row.arrangePlaced = fitFails(await sp.evaluate(FIT, SESSION));
      row.tiles = most;
      // Checked: the answer and its feedback, the step's middle still not scrolling and the bar's buttons on screen.
      await sp.locator(`${SESSION} [data-part="answer-bar"] button`, { hasText: /^Check$/ }).click();
      await sp.waitForTimeout(1200);
      row.arrangeChecked = fitFails(await sp.evaluate(FIT, SESSION));
    } else row.arrangeStart = "no Arrange step";
    if (await openStep("place", (sel) => Boolean(document.querySelector(`${sel} [data-part="place-gap"]`)))) row.place = fitFails(await sp.evaluate(FIT, SESSION));
    else row.place = "no Place step";
    const meaning = async () => {
      if (await openStep("meaning", (sel) => Boolean(document.querySelector(`${sel} [data-part="choice"]`)))) row.meaning = fitFails(await sp.evaluate(FIT, SESSION));
      else row.meaning = "no What does it mean? step";
    };
    if (samePair) await meaning();
    if (await openStep("match", (sel) => Boolean(document.querySelector(`${sel} [data-part="match-item"]`)))) row.match = fitFails(await sp.evaluate(FIT, SESSION));
    else row.match = "no Match step";
    // Fill, where one of the two has a gap with choices (its choices are 16px at least).
    if (items.some((i) => i.gap?.options?.length) && (await openStep("fill", (sel) => Boolean(document.querySelector(`${sel} [data-part="fill-sentence"]`))))) row.fill = fitFails(await sp.evaluate(FIT, SESSION));
  }
  if (saved.ok && !samePair) {
    const taggedSaved = await onlyPack(lang, { ...starter, id: `check-fit-${lang.toLowerCase()}-tagged`, name: `Check: the longest tagged in ${lang}`, items: tagged, lessons: undefined, units: undefined });
    if (!taggedSaved.ok) row.meaning = `not saved: ${taggedSaved.errors.join(" | ")}`;
    else {
      await sp.reload({ waitUntil: "commit" });
      await sp.waitForSelector("html[data-app-ready]");
      if (await openStep("meaning", (sel) => Boolean(document.querySelector(`${sel} [data-part="choice"]`)))) row.meaning = fitFails(await sp.evaluate(FIT, SESSION));
      else row.meaning = "no What does it mean? step";
    }
  }
  // (A pack beside the starters, a language's path: by its language and its id.)
  const which = MORE_PACKS.length && !/^starter-/.test(starter.id) && starter !== dutch ? `${lang} ${starter.id}` : lang;
  fitResults[which] = { words, ...row };
  const bad = Object.entries(row).filter(([k, v]) => k !== "tiles" && v);
  console.log(`  ${bad.length ? "✗" : "✓"} ${which} (${words} words${row.tiles ? `, ${row.tiles} tiles` : ""})${bad.length ? `: ${bad.map(([k, v]) => `${k} ${v}`).join(" | ")}` : ""}`);
}
if (!PAGES_ONLY) {
  const name = ORDER_ONLY
    ? `the order steps at ${SMALL.join(" × ")} (Put it in order, Listening's order and What does it say?, on each pack's longest sentence and one of five words): shown with every tile above the bar (start, placed, checked)${ORDER_MAY_SWAP ? ", or asked another way with no tiles, that game fitting at its start and, after I don't know, a wrong answer and a right one, with the right sentence whole in view and the step not scrolling, its evidence its own, the order step shown without the swap not fitting" : ", none asked another way"}`
    : `every starter's longest sentence fits a small phone (${SMALL.join(" × ")}): Arrange, Place, Match, Fill`;
  const bad = Object.entries(fitResults).filter(([, r]) => Object.entries(r).some(([k, v]) => !["words", "tiles"].includes(k) && !/(Asked|Tiles|Note|Shown|Without)$/.test(k) && v));
  results[name] = { ok: !bad.length, languages: fitResults };
  if (bad.length) failed++;
  const all = Object.keys(fitResults).length;
  console.log(`${bad.length ? "FAIL" : "PASS"} ${name}: ${all - bad.length}/${all} ${ORDER_ONLY ? "sentences" : "languages"}${bad.length ? `; not: ${bad.map(([l]) => l).join(", ")}` : ""}`);
}

// A long language name in Hint's words ("Hint: Chinese (Traditional) order") never makes a step wider than the screen,
// and only the Hint gives way: Dutch's Arrange (Hint, I don't know) and Say prompted in English (Hint, I don't know,
// Can't speak now), each drawn tight (its quiet actions side by side on one line), the Hint renamed for a language with
// a name this long. A step is one column the screen's width; the Hint's words end in an ellipsis, the others' never do.
if (STARTERS.length && !ORDER_ONLY) {
  const name = "a long language name in the answer bar's Hint never makes a step wider than the screen, and only the Hint is cut (375 × 667)";
  const nl = STARTERS.find((p) => p.language === "nl") ?? STARTERS[0];
  const saved = await onlyPack(nl.language, { ...nl, id: `check-fit-${nl.language.toLowerCase()}`, name: "Check: a long name", lessons: undefined, units: undefined, items: [...nl.items].sort(longer).slice(0, 2) });
  const seen = {};
  if (saved.ok) {
    await sp.evaluate(() => {
      const study = JSON.parse(localStorage.getItem("lx.study.v1") || "{}");
      study.say = { ...(study.say ?? {}), prompt: "english", hint: true };
      localStorage.setItem("lx.study.v1", JSON.stringify(study));
    });
    await sp.reload();
    await sp.waitForSelector("html[data-app-ready]");
    for (const [kind, actions] of [["arrange", 2], ["say", 3]]) {
      if (!(await openStep(kind, (sel) => document.querySelectorAll(`${sel} .lx-answer-actions [data-variant="fade"]`).length >= 2))) continue;
      seen[kind] = await sp.evaluate(({ sel, actions }) => {
        const session = document.querySelector(sel);
        if (!session.hasAttribute("data-fit")) session.setAttribute("data-fit", "1");
        const fades = [...session.querySelectorAll('.lx-answer-actions > [data-variant="fade"]')];
        const hint = fades.find((b) => b.textContent.trim().startsWith("Hint"));
        const LONG = "Hint: Chinese (Traditional, Hong Kong) order";
        const label = hint?.querySelector(":scope > span");
        if (label) label.textContent = LONG;
        else if (hint) {
          for (const node of [...hint.childNodes]) if (node.nodeType === 3) node.remove();
          hint.append(LONG);
        }
        const past = [...session.querySelectorAll('[data-part="session-bar"] *, [data-part="answer-bar"] button, [data-part="activity"] [data-part="tile"]')]
          .filter((n) => n.getClientRects().length && n.getBoundingClientRect().right > innerWidth + 0.5)
          .map((n) => n.getAttribute("data-part") ?? n.textContent.trim().slice(0, 16));
        // Cut: a quiet action other than the Hint whose words don't all show.
        const cut = fades.filter((b) => b !== hint).filter((b) => {
          const words = b.querySelector(":scope > span") ?? b;
          return words.scrollWidth > words.clientWidth + 0.5 || b.scrollWidth > b.clientWidth + 0.5;
        }).map((b) => b.textContent.trim());
        const wide = Math.max(...[...session.querySelectorAll(':scope > :is([data-part="session-bar"], [data-part="activity"], [data-part="answer-bar"])')].map((n) => n.getBoundingClientRect().right));
        return { actions: fades.length, expected: actions, hintFound: Boolean(hint), wide: Math.round(wide), vw: innerWidth, past: [...new Set(past)], cut, hint: hint ? Math.round(hint.getBoundingClientRect().width) : null };
      }, { sel: SESSION, actions });
    }
  }
  const bad = Object.entries(seen).flatMap(([kind, r]) => [
    r.actions < r.expected || !r.hintFound ? `${kind}: ${r.actions} quiet actions${r.hintFound ? "" : ", no Hint"}` : null,
    r.wide > r.vw + 0.5 ? `${kind}: ${r.wide} px wide on ${r.vw}` : null,
    r.past.length ? `${kind}: past its edge: ${r.past.join(", ")}` : null,
    r.cut.length ? `${kind}: cut besides the Hint: ${r.cut.join(", ")}` : null,
  ].filter(Boolean));
  if (!seen.arrange || !seen.say) bad.push(`steps measured: ${Object.keys(seen).join(", ") || "none"}`);
  results[name] = { ok: !bad.length, seen, bad };
  if (bad.length) failed++;
  console.log(`${bad.length ? "FAIL" : "PASS"} ${name}: ${bad.length ? bad.join(" | ") : Object.entries(seen).map(([kind, r]) => `${kind}: ${r.actions} actions, the step ${r.wide} px, the Hint ${r.hint} px, nothing else cut`).join("; ")}`);
}

// "Hint: Dutch order", Words and I don't know, on one line (a step drawn tight), all whole at every phone width down to
// 320, at each level that draws them so: only a name far longer than Dutch's ever gives way (the stage before this).
if (STARTERS.length) {
  const name = "Hint: Dutch order, Words and I don't know are whole on one line at every phone width down to 320";
  const nl = STARTERS.find((p) => p.language === "nl");
  const seen = [];
  const bad = [];
  if (nl) {
    const saved = await onlyPack("nl", { ...nl, id: "check-bar-nl", name: "Check: the bar" });
    if (saved.ok) {
      await sp.reload();
      await sp.waitForSelector("html[data-app-ready]");
      if (await openStep("arrange", (sel) => document.querySelectorAll(`${sel} .lx-answer-actions [data-variant="fade"]`).length >= 3)) {
        for (const width of [320, 344, 360, 375, 390, 393, 412, 430]) {
          await sp.setViewportSize({ width, height: 667 });
          await sp.waitForTimeout(150);
          for (const level of [1, 2, 4]) {
            const r = await sp.evaluate(({ sel, level }) => {
              const session = document.querySelector(sel);
              session.setAttribute("data-fit", String(level));
              const fades = [...session.querySelectorAll('.lx-answer-actions > [data-variant="fade"]')];
              const cut = fades.filter((b) => {
                const words = b.querySelector(":scope > span") ?? b;
                return words.scrollWidth > words.clientWidth + 0.5 || b.scrollWidth > b.clientWidth + 0.5;
              }).map((b) => b.textContent.trim());
              const boxes = fades.map((b) => b.getBoundingClientRect());
              return { words: fades.map((b) => b.textContent.trim()), cut, rows: new Set(boxes.map((b) => Math.round(b.top))).size, past: boxes.some((b) => b.right > innerWidth + 0.5 || b.left < -0.5), overlap: boxes.some((b, i) => i && b.left < boxes[i - 1].right - 0.5), reach: Math.round(Math.min(...boxes.map((b) => b.height))) };
            }, { sel: SESSION, level });
            seen.push({ width, level, ...r });
            if (!r.words.includes("Hint: Dutch order") || r.words.length < 3) bad.push(`${width}/${level}: the actions are ${r.words.join(", ")}`);
            if (r.cut.length) bad.push(`${width} wide, fit ${level}: cut: ${r.cut.join(", ")}`);
            if (r.rows !== 1) bad.push(`${width} wide, fit ${level}: on ${r.rows} rows`);
            if (r.past) bad.push(`${width} wide, fit ${level}: past the screen's edge`);
            if (r.overlap) bad.push(`${width} wide, fit ${level}: one lies over another`);
          }
        }
        await sp.setViewportSize({ width: 375, height: 667 });
      } else bad.push("no Arrange step with its three quiet actions");
    } else bad.push("the check pack wasn't saved");
  } else bad.push("no Dutch starter");
  results[name] = { ok: !bad.length, seen, bad };
  if (bad.length) failed++;
  console.log(`${bad.length ? "FAIL" : "PASS"} ${name}: ${bad.length ? `${bad.length} problems: ${bad.slice(0, 6).join(" | ")}` : `${seen.length} measured, every word showing`}`);
}

// ---------- the session's summary, on a small phone: a word's long gloss, and a word's reading ----------

// What moved lists each word with its gloss in a tag, beside the tally and the strength bars. The longest glosses (a
// word with its forms and phrases) wrap in the tag's own column. Hebrew's, the longest of all the starters', and
// Japanese's longest with a reading. In a language that shows readings, a word's tag follows the study rule: its
// reading (Hebrew's vowel marks, Japanese's kana over it, 12 px at least) while it's new, as written once you know it.
const glossOf = (starter, { reading = false } = {}) =>
  Object.entries(starter.words ?? {})
    .filter(([word]) => starter.items.some((item) => item.words.some((entry) => entry[1] === word)))
    .filter(([word]) => !reading || starter.readings?.[word])
    .map(([word, gloss]) => ({ lang: starter.language, word, gloss, starter }))
    .sort((a, b) => b.word.length + b.gloss.length - (a.word.length + a.gloss.length))[0];
const glosses = STARTERS.map((s) => glossOf(s)).filter(Boolean).sort((a, b) => b.word.length + b.gloss.length - (a.word.length + a.gloss.length));
const japanese = STARTERS.find((s) => s.language === "ja");
const LONG = [...new Map([glosses.find((g) => g.lang === "he"), glosses[0], japanese && glossOf(japanese, { reading: true })].filter(Boolean).map((g) => [g.lang, g])).values()];
// Each row of What moved: its tag's text, whether a reading shows in it (and its smallest size), and where it sits.
const MOVED = () => {
  const summary = document.querySelector('[data-part="session-summary"]');
  if (!summary) return null;
  const visible = (n) => n.getClientRects().length > 0 && getComputedStyle(n).visibility === "visible" && getComputedStyle(n).display !== "none";
  const out = { rows: [], bad: [], wide: summary.scrollWidth > summary.clientWidth + 1 };
  for (const row of summary.querySelectorAll(".lx-moved-row")) {
    const tag = row.querySelector('[data-part="concept-tag"]');
    const [t, y, m, r] = [tag, row.querySelector(".lx-tally"), row.lastElementChild, row].map((n) => n.getBoundingClientRect());
    const text = tag.textContent.trim();
    // Beside the icon, the words are one box: several would sit side by side as columns, each wrapping on its own.
    const boxes = [...tag.childNodes].filter((n) => (n.nodeType === 1 && !n.classList.contains("lx-icon")) || (n.nodeType === 3 && n.textContent.trim())).length;
    const problems = [
      boxes > 1 ? `its words in ${boxes} boxes side by side` : null,
      t.right > y.left + 0.5 ? `runs ${Math.round(t.right - y.left)} px under the tally` : null,
      Math.max(t.right, m.right) > innerWidth + 0.5 ? "past the screen's edge" : null,
      t.top < r.top - 0.5 || t.bottom > r.bottom + 0.5 ? "outside its row" : null,
    ].filter(Boolean);
    if (problems.length) out.bad.push(`“${text.slice(0, 32)}…” ${problems.join(", ")}`);
    const readings = [...tag.querySelectorAll('[data-part="reading"]')].filter(visible);
    const sizes = readings.filter((n) => n.tagName === "RT").map((n) => parseFloat(getComputedStyle(n).fontSize));
    out.rows.push({ text, reading: readings.length > 0, readingPx: sizes.length ? Math.min(...sizes) : null, shown: tag.innerText.replace(/\s+/g, " ").trim(), width: Math.round(t.width), height: Math.round(t.height) });
  }
  return out;
};
const rowFor = (seen, gloss) => seen?.rows.find((row) => row.text.includes(` · ${gloss.slice(0, 12)}`));
if (LONG.length) {
  const name = "the session's summary on a small phone (375 × 667): a word's long gloss wraps in its own column, and a word shows its reading while it's new";
  const notes = [];
  const bad = [];
  for (const { lang, word, gloss, starter } of LONG) {
    const item = starter.items.find((i) => i.words.some((entry) => entry[1] === word));
    // Another of the sentence's words with a reading, made one you know (three right answers weeks apart).
    const knownWord = starter.readings ? item.words.map((entry) => entry[1]).find((lemma) => lemma && lemma !== word && starter.readings[lemma] && starter.words?.[lemma]) : null;
    const saved = await onlyPack(lang, { ...starter, id: `check-moved-${lang.toLowerCase()}`, name: `Check: ${word}`, items: [item], lessons: undefined, units: undefined });
    let seen = null;
    stillNew = [word];
    if (saved.ok) {
      await sp.reload();
      await sp.waitForSelector("html[data-app-ready]");
      // The words the fit stage above made known: this one is about a word that's new.
      await sp.evaluate(async () => (await import("/js/study/progress.js")).clearProgress());
      if (knownWord) {
        await sp.evaluate(async ({ lemma, id }) => {
          const { record } = await import("/js/study/progress.js");
          record([60, 57, 50].map((d) => ({ concept: `w:${lemma}`, at: Date.now() - d * 86_400_000, outcome: "right", test: "recall", skill: "read", activity: "type", item: id })));
        }, { lemma: knownWord, id: item.id });
      }
      if (await openStep("arrange", (sel) => document.querySelectorAll(`${sel} [data-part="arrange-bank"] [data-part="tile"]`).length >= 2)) {
        // The right order, so the word you know stays known.
        const order = item.words.map((entry, i) => (i === item.words.length - 1 ? entry[0] + (item.punct ?? "") : entry[0]));
        for (const text of order) {
          const next = sp.locator(`${SESSION} [data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])[data-word=${JSON.stringify(text)}]`).first();
          if (await next.count()) await next.click({ force: true });
          await sp.waitForTimeout(60);
        }
        await sp.locator(`${SESSION} [data-part="answer-bar"] button`, { hasText: /^Check$/ }).click();
        await sp.waitForTimeout(600);
        await sp.locator(`${SESSION} [data-part="answer-bar"] .lx-answer-actions button`).last().click();
        seen = await sp.waitForSelector('[data-part="session-summary"] .lx-moved-row', { timeout: 15_000 }).then(async () => {
          await sp.waitForTimeout(1500);
          return sp.evaluate(MOVED);
        }, () => null);
        await sp.screenshot({ path: `${OUT}/summary-${lang}.png` });
      }
    }
    // A row names a word with its meaning in a few words (new-words.js shortMeaning), never the whole dictionary entry.
    const short = (entry) => {
      const plain = entry.split(";")[0].replace(/\s*\([^)]*\)/g, "").trim();
      return plain.length > 24 && plain.includes(",") ? plain.split(",")[0].trim() : plain;
    };
    const long = rowFor(seen, short(gloss));
    const known = knownWord ? rowFor(seen, short(starter.words[knownWord])) : null;
    const problems = !saved.ok
      ? [`not saved: ${saved.errors.join(" | ")}`]
      : !seen
        ? ["no summary"]
        : [
            ...seen.bad,
            ...(long ? [] : [`no row for ${word}`]),
            ...(seen.wide ? ["the summary scrolls sideways"] : []),
            ...(starter.readings?.[word] && long && !long.reading ? [`${word} is new, but its tag shows no reading: “${long.shown}”`] : []),
            ...(long?.readingPx != null && long.readingPx < 11.5 ? [`${word}'s reading is ${long.readingPx}px`] : []),
            ...(knownWord && !known ? [`no row for ${knownWord} (known)`] : []),
            ...(known?.reading ? [`${knownWord} is known, but its tag shows a reading: “${known.shown}”`] : []),
          ];
    if (problems.length) bad.push(`${lang}: ${problems.join("; ")}`);
    notes.push(`${lang} “${word} · ${gloss.slice(0, 20)}…” ${long ? `${long.width}×${long.height}${long.reading ? `, its reading shown${long.readingPx ? ` (${long.readingPx}px)` : ""}` : ""}` : "not found"}${knownWord ? `; ${knownWord} known: ${known ? (known.reading ? "a reading shown" : "as written") : "not found"}` : ""}; ${seen?.rows.length ?? 0} rows`);
  }
  results[name] = { ok: !bad.length, notes, bad };
  if (bad.length) failed++;
  console.log(`${bad.length ? "FAIL" : "PASS"} ${name}: ${bad.length ? bad.join(" | ") : notes.join("; ")}`);
}

const name = "no page errors";
results[name] = { ok: !errors.length, errors };
if (errors.length) failed++;
console.log(`${errors.length ? "FAIL" : "PASS"} ${name}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
writeFileSync(`${OUT}/config.json`, JSON.stringify({ width: WIDTH, tablet: TABLET, theme: THEME ?? "the account's own", walk: WALK, pagesOnly: PAGES_ONLY, fitOnly: FIT_ONLY }, null, 1));
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} stages passed`);
await signup.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
await browser.close();
process.exit(failed ? 1 : 0);
