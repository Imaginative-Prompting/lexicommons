// Accessibility on a touch phone, page by page (the tabs, Translate, Read, Explore, Knowledge, Settings and each of its pages, a session's first
// step): what VoiceOver and TalkBack are given, and what large text does.
//   names    every control in the accessibility tree (Chrome's own, as a screen reader reads it) has a name: a button, link, field, switch,
//            slider, tab; the symbol-only tabs too. Nothing focusable sits inside what's hidden from a screen reader (aria-hidden), where
//            VoiceOver would land on nothing; an image says what it is (alt) or is hidden.
//   text 2×  every piece of text at twice its size (as a phone's text scaling does, Android's 200%): none cut off (clipped or with an
//            ellipsis where it had room before), and no page wider than the screen.
//   contrast every look the app offers (Graphite, Paper, High contrast, Sepia): text against what's under it at 4.5:1, 3:1 at 24 px or 19 px bold.
//            --themes <ids, or general, flags, motifs, ready>: in those ready-made themes instead (lx/theme-presets.js), as a person picks one.
//   focus    the keyboard's order down the page follows what's drawn: no jump back up past a whole row.
//   session  a quick session's games step by step: every control named and every game piece a real control, the keyboard's order, contrast,
//            and each answer's sheet at twice its size.
//   motion   a device asking for less motion (Match device): a page and a drawer come without any animation running, and a session's answers
//            move nothing (a picture's reaction, Tinta: no drawing redrawn frame to frame).
// Each part first refuses a plant (a nameless button, text cut off at 2×, a grey on grey, a focus order out of place) so it can fail.
// Usage: node scripts/a11y-check.mjs http://localhost:<port> <outDir> [--only names,text,contrast,focus,session,motion] [--width 320] [--themes <ids|kinds>]
// (exit 0 = pass; LOCAL only)
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/a11y-check.mjs http://localhost:<port> <outDir> [--only names,text,contrast,focus,motion] [--width 320] (a local server only: it signs up a test account)");
  process.exit(2);
}
const ONLY = process.argv.includes("--only") ? new Set(process.argv[process.argv.indexOf("--only") + 1].split(",")) : null;
// --width 320: a narrower phone (an iPhone SE's, 568 tall).
const WIDTH = process.argv.includes("--width") ? Number(process.argv[process.argv.indexOf("--width") + 1]) : 390;
const SCREEN = { width: WIDTH, height: WIDTH < 360 ? 568 : 844 };
const wants = (part) => !ONLY || ONLY.has(part);
mkdirSync(OUT, { recursive: true });
let failed = 0;
const findings = {};
const report = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
const desk = await browser.newContext({ viewport: SCREEN });
const signup = await desk.newPage();
const vauth = await desk.newCDPSession(signup);
await vauth.send("WebAuthn.enable");
await vauth.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await signup.goto(`${BASE}/app/`);
await signup.waitForURL(/\/login\?next=/);
await signup.click("summary");
await signup.fill('input[name="name"]', "A11y Check");
await signup.click('#register button[type="submit"]');
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
const cookies = await desk.cookies();
const phone = await browser.newContext({ viewport: SCREEN, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await phone.addCookies(cookies);
await phone.addInitScript(() => {
  try {
    localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
  } catch {}
});
let page = await phone.newPage();
let cdp = await phone.newCDPSession(page);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));

const PAGES = [
  ["Home", "#today"],
  ["Translate", "#today", async () => {
    await page.locator('[data-part="translate-field"] textarea').first().fill("boek").catch(() => {});
    await page.waitForTimeout(1200);
  }],
  ["Study", "#study"],
  ["the path", "#study/path"],
  ["Your packs", "#study/packs"],
  ["Read", "#read"],
  ["Find a book", "#read/find"],
  ["Explore", "#explore"],
  // A topic's page: its packs as cards (the first one's Add pack its one solid), which nothing above reaches.
  ["A topic", "#explore/topic/food?lang=nl"],
  ["Knowledge", "#know"],
  ["Read, hear, say", "#know/skills"],
  ["Every day you studied", "#know/days"],
  ["Settings", "#settings"],
];
const go = async (hash, then) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(1300);
  await page.evaluate(() => {
    const p = document.querySelector('[data-part="app"] > [data-part="page"]');
    if (p) p.scrollTop = 0;
  });
  if (then) await then();
};
await page.goto(`${BASE}/app/#today`);
await page.waitForSelector('[data-part="tab-bar"]', { state: "attached", timeout: 30_000 });
await page.waitForTimeout(2000);
// Some study, so the pages show what a learner sees.
await page.evaluate(async () => {
  const { syncLibraryPacks } = await import("/js/study/packs.js");
  await syncLibraryPacks();
  const { record } = await import("/js/study/progress.js");
  const { CHUNKS, WORDS } = await import("/js/study/content.js");
  record([...Object.keys(WORDS).slice(0, 150).map((w) => "w:" + w), ...Object.keys(CHUNKS).slice(0, 20).map((c) => "c:" + c)].map((concept) => ({ concept, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "check" })));
  await new Promise((r) => setTimeout(r, 300));
});
await page.reload();
await page.waitForSelector('[data-part="tab-bar"]', { state: "attached", timeout: 30_000 });
await page.waitForTimeout(2000);
// Settings' pages, from its menu.
await go("#settings");
const settingsPages = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-part="page"] a[href^="#settings/"]')].map((a) => a.getAttribute("href")))].filter((h) => !/account\/delete|signout/.test(h)));
for (const href of settingsPages) PAGES.push([`Settings ${href.slice(10)}`, href]);

// ---------- names ----------
const INTERACTIVE = new Set(["button", "link", "textbox", "searchbox", "checkbox", "switch", "slider", "radio", "tab", "menuitem", "combobox", "spinbutton", "listbox", "option", "menuitemcheckbox", "menuitemradio"]);
async function nameProblems() {
  await cdp.send("Accessibility.enable");
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const out = [];
  for (const n of nodes) {
    if (n.ignored) continue;
    const role = n.role?.value;
    if (!INTERACTIVE.has(role)) continue;
    const name = String(n.name?.value ?? "").trim();
    if (name) continue;
    let where = "";
    if (n.backendDOMNodeId) {
      try {
        const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: n.backendDOMNodeId });
        const { result } = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, returnByValue: true, functionDeclaration: "function () { const r = this.getBoundingClientRect(); const shown = r.width > 0 && r.height > 0 && !this.closest('[data-ghost], [hidden]'); return { shown, part: this.getAttribute?.('data-part') ?? this.closest?.('[data-part]')?.getAttribute('data-part') ?? null, html: (this.outerHTML ?? '').slice(0, 120) }; }" });
        if (!result.value?.shown) continue;
        where = `${result.value.part ?? ""} ${result.value.html}`;
      } catch {}
    }
    out.push(`${role} with no name: ${where.trim()}`);
  }
  const dom = await page.evaluate(() => {
    const issues = [];
    const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), summary';
    for (const el of document.querySelectorAll(FOCUSABLE)) {
      if (el.disabled || el.closest("[inert], [data-ghost], [hidden]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const hidden = el.closest('[aria-hidden="true"]');
      if (hidden) issues.push(`focusable inside aria-hidden: ${(el.getAttribute("data-part") ?? el.tagName.toLowerCase())} ${el.outerHTML.slice(0, 90)}`);
    }
    for (const img of document.querySelectorAll("img")) {
      if (img.closest('[aria-hidden="true"], [data-ghost], [hidden]') || img.getAttribute("role") === "presentation") continue;
      if (!img.hasAttribute("alt")) issues.push(`an image with no alt: ${img.getAttribute("src")?.slice(0, 60)}`);
    }
    return issues;
  });
  return [...out, ...dom];
}

// ---------- text at twice its size ----------
const DOUBLE = () => {
  const sizes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hosts = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.textContent.trim() && t.parentElement && !t.parentElement.closest("svg, [data-ghost], [hidden], script, style")) hosts.add(t.parentElement);
  // Every text's own size and line height, twice: set on each element that holds text (its inherited size doubled once).
  const all = new Set();
  for (const h of hosts) for (let n = h; n && n !== document.body; n = n.parentElement) all.add(n);
  for (const el of all) {
    const cs = getComputedStyle(el);
    sizes.push([el, parseFloat(cs.fontSize), cs.lineHeight]);
  }
  window.__undo2x = [];
  for (const [el, size, lh] of sizes) {
    window.__undo2x.push([el, el.style.getPropertyValue("font-size"), el.style.getPropertyPriority("font-size"), el.style.getPropertyValue("line-height"), el.style.getPropertyPriority("line-height")]);
    el.style.setProperty("font-size", `${size * 2}px`, "important");
    if (lh.endsWith("px")) el.style.setProperty("line-height", `${parseFloat(lh) * 2}px`, "important");
  }
  return sizes.length;
};
const UNDO2X = () => {
  for (const [el, fs, fsp, lh, lhp] of window.__undo2x ?? []) {
    if (fs) el.style.setProperty("font-size", fs, fsp);
    else el.style.removeProperty("font-size");
    if (lh) el.style.setProperty("line-height", lh, lhp);
    else el.style.removeProperty("line-height");
  }
  window.__undo2x = [];
};
// Previews that end in an ellipsis by design, the whole of them a tap away: a path stop's first words (its bubble and Its words have them
// all), Home's latest words (Knowledge lists them), a cover's drawn title and a pack card's title (the pack's page), the next card's other way
// forward, its lesson's words on one line (the lesson). Shown, not failed.
const PREVIEWS = ".lx-ps-words, .lx-tile-words, .lx-cover-title, .lx-pack-title, .lx-next-other-sub";
const CUT = ({ previews, scope = null }) => {
  const out = [];
  const seen = new Set();
  const root = (scope && document.querySelector(scope)) || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const host = t.parentElement;
    if (!t.textContent.trim() || !host || seen.has(host) || host.closest("svg, [data-ghost], [hidden], [aria-hidden='true'], script, style, [data-part='tab-bar'], .lx-visually-hidden")) continue;
    seen.add(host);
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (host.closest(previews)) continue;
    // Cut off: the text's own box, or one around it that clips, smaller than what it holds.
    for (let n = host, hops = 0; n && n !== document.body && hops < 4; n = n.parentElement, hops++) {
      const cs = getComputedStyle(n);
      const clips = cs.overflowX !== "visible" || cs.overflowY !== "visible" || cs.textOverflow === "ellipsis";
      if (!clips || ["auto", "scroll"].includes(cs.overflowY) || ["auto", "scroll"].includes(cs.overflowX)) continue;
      if (n.scrollWidth > n.clientWidth + 2 || (cs.overflowY !== "visible" && n.scrollHeight > n.clientHeight + 2) || (cs.textOverflow === "ellipsis" && n.scrollWidth > n.clientWidth + 1)) {
        out.push(`cut off: ${(n.getAttribute("data-part") ?? host.getAttribute("data-part") ?? n.className ?? n.tagName).toString().slice(0, 40)} "${t.textContent.trim().slice(0, 40)}" (${n.scrollWidth}×${n.scrollHeight} in ${n.clientWidth}×${n.clientHeight})`);
        break;
      }
    }
  }
  const scroller = scope ? root : document.querySelector('[data-part="app"] > [data-part="page"]') ?? document.scrollingElement;
  if (scroller.scrollWidth > innerWidth + 1) out.push(`${scope ? "the session is" : "the page is"} wider than the screen: ${scroller.scrollWidth} px in ${innerWidth}`);
  return out;
};

// ---------- contrast ----------
const CONTRAST = () => {
  // Any color a browser computes: rgb() read as it is; another form (color(srgb …) for a glass's see-through fill, oklab() from a
  // color-mix) drawn onto one pixel and read back, never left out (7 Nov: the tab bar's glass was skipped, and its labels judged on the page under it).
  const pixel = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const parse = (c) => {
    const m = c.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [r, g, b, a];
    }
    if (!c || c === "transparent" || c === "none") return null;
    pixel.clearRect(0, 0, 1, 1);
    pixel.fillStyle = "rgba(0, 0, 0, 0)";
    pixel.fillStyle = c;
    pixel.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const mix = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const backgroundOf = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== "none" && !/gradient/.test(cs.backgroundImage)) return null; // a picture under it: not judged here
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
    }
    if (!layers.length || layers.at(-1)[3] < 1) layers.push(parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1]);
    return layers.reverse().reduce((under, top) => mix(top, under));
  };
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const host = t.parentElement;
    if (!t.textContent.trim() || !host || seen.has(host) || host.closest("svg, [data-ghost], [hidden], [aria-hidden='true'], script, style, :disabled, [aria-disabled='true'], [data-state='dimmed'], .lx-visually-hidden")) continue;
    seen.add(host);
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
    const cs = getComputedStyle(host);
    let opacity = 1;
    for (let n = host; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    if (opacity < 0.99) continue; // mid-fade, or an inactive control: component-check holds quiet text to its ink
    const fg = parse(cs.color);
    const bg = backgroundOf(host);
    if (!fg || !bg || fg[3] === 0) continue; // (ink of no colour at all holds room, and shows nothing)
    const ink = fg[3] < 1 ? mix(fg, bg) : fg;
    const [a, b] = [lum(ink), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    if (ratio < need - 0.05) out.push(`${(host.getAttribute("data-part") ?? host.closest("[data-part]")?.getAttribute("data-part") ?? host.tagName).toString()} "${t.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1 (needs ${need}; ${cs.color} on rgb(${bg.slice(0, 3).map(Math.round).join(",")}))`);
  }
  return out;
};

// ---------- focus order ----------
async function focusProblems(scope = '[data-part="app"] > [data-part="page"]') {
  await page.evaluate(() => document.activeElement?.blur());
  await page.evaluate(() => {
    const p = document.querySelector('[data-part="app"] > [data-part="page"]');
    if (p) p.scrollTop = 0;
  });
  const order = [];
  for (let k = 0; k < 40; k++) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate((scope) => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const p = document.querySelector(scope);
      const r = el.getBoundingClientRect();
      const inPage = Boolean(p?.contains(el));
      if (!el.dataset.a11yFocus) el.dataset.a11yFocus = String(Math.random()).slice(2);
      return { id: el.dataset.a11yFocus, inPage, y: r.top + (p?.scrollTop ?? 0), h: r.height, x: r.left, what: `${el.getAttribute("data-part") ?? el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)}"` };
    }, scope);
    // Round once: the order ends where focus comes back to something it's had.
    if (!at || order.some((o) => o.id === at.id)) break;
    order.push(at);
  }
  // The page's own run (the header and the tab bar around it aren't the page's order).
  const first = order.findIndex((o) => o.inPage);
  const run = [];
  for (let i = Math.max(0, first); i < order.length && order[i].inPage; i++) run.push(order[i]);
  const inPage = run;
  const out = [];
  for (let i = 1; i < inPage.length; i++) {
    const a = inPage[i - 1];
    const b = inPage[i];
    // A jump back up past a whole row (a row of tiles is read left to right, then down).
    if (b.y + b.h < a.y - 4) out.push(`focus went back up from ${a.what} to ${b.what} (${Math.round(a.y)} → ${Math.round(b.y)})`);
  }
  return out;
}

// ---------- the plants: each part can fail ----------
const plantCheck = async () => {
  await go("#today");
  const planted = await page.evaluate(() => {
    const host = document.querySelector('[data-part="app"] > [data-part="page"] .lx-view') ?? document.body;
    const box = document.createElement("div");
    box.id = "a11y-plant";
    // (Styles through the CSSOM: the app's CSP refuses style attributes.)
    const button = document.createElement("button");
    button.type = "button";
    Object.assign(button.style, { width: "44px", height: "44px" });
    const words = document.createElement("p");
    words.textContent = "Planted words";
    Object.assign(words.style, { width: "120px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "14px", color: "rgb(120,120,120)", background: "rgb(110,110,110)" });
    const late = document.createElement("a");
    late.href = "#a";
    late.textContent = "late";
    Object.assign(late.style, { display: "block", position: "relative" });
    box.append(button, words, late);
    host.prepend(box);
    return true;
  });
  const names = (await nameProblems()).filter((p) => p.includes("button"));
  const contrast = (await page.evaluate(CONTRAST)).filter((p) => p.includes("Planted"));
  // Focus: a link moved above the button it follows.
  await page.evaluate(() => {
    const box = document.getElementById("a11y-plant");
    const late = box.querySelector("a");
    late.style.top = "-400px";
  });
  const focus = await focusProblems();
  await page.evaluate(DOUBLE);
  const cut = (await page.evaluate(CUT, { previews: PREVIEWS })).filter((p) => p.includes("Planted"));
  await page.reload();
  await page.waitForSelector('[data-part="tab-bar"]', { state: "attached", timeout: 30_000 });
  await page.waitForTimeout(1500);
  return { planted, names: names.length, contrast: contrast.length, focus: focus.length, cut: cut.length };
};
const plants = await plantCheck();
report(plants.names > 0 && plants.contrast > 0 && plants.cut > 0 && plants.focus > 0, "PLANT a nameless button, grey on grey, text cut off at 2×, focus out of place: each named", JSON.stringify(plants));

// ---------- the pages ----------
// The looks the contrast stage reads: the four built in, or --themes' ready-made ones (ids, or a kind: general, flags, motifs; ready is all of them).
const THEMES = await (async () => {
  const arg = process.argv.includes("--themes") ? process.argv[process.argv.indexOf("--themes") + 1] : null;
  if (!arg) return ["graphite", "paper", "contrast", "sepia"];
  const { READY_THEMES } = await import(new URL("../public/js/lx/theme-presets.js", import.meta.url).href);
  const kinds = { general: "general", flags: "flag", motifs: "motif" };
  const ids = arg.split(",").flatMap((part) => (part === "ready" ? READY_THEMES.map((t) => t.id) : kinds[part] ? READY_THEMES.filter((t) => t.group === kinds[part]).map((t) => t.id) : [part]));
  const unknown = ids.filter((id) => !READY_THEMES.some((t) => t.id === id));
  if (unknown.length) throw new Error(`--themes: no ready-made theme ${unknown.join(", ")}`);
  return ids;
})();
const all = { names: [], text: [], contrast: [], focus: [], previews: [] };
for (const [label, hash, then] of PAGES) {
  await go(hash, then);
  if (wants("names")) for (const p of await nameProblems()) all.names.push(`${label}: ${p}`);
  if (wants("focus")) for (const p of await focusProblems()) all.focus.push(`${label}: ${p}`);
  if (wants("contrast")) {
    for (const id of THEMES) {
      await page.evaluate(async (theme) => {
        const m = await import("/js/lx/theme.js");
        await m.useTheme(theme).catch(() => {});
      }, id);
      await page.waitForTimeout(500);
      for (const p of await page.evaluate(CONTRAST)) all.contrast.push(`${label} in ${id}: ${p}`);
    }
    await page.evaluate(async () => (await import("/js/lx/theme.js")).useTheme("graphite").catch(() => {}));
    await page.waitForTimeout(300);
  }
  if (wants("text")) {
    await page.evaluate(DOUBLE);
    await page.waitForTimeout(200);
    const cut = await page.evaluate(CUT, { previews: PREVIEWS });
    const previewsCut = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((n) => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 2).length, PREVIEWS);
    if (previewsCut) all.previews.push(`${label}: ${previewsCut}`);
    for (const p of cut) all.text.push(`${label}: ${p}`);
    if (cut.length) await page.screenshot({ path: `${OUT}/text2x-${label.replace(/[^a-z0-9]+/gi, "-")}.png` });
    await page.reload();
    await page.waitForSelector('[data-part="tab-bar"]', { state: "attached", timeout: 30_000 });
    await page.waitForTimeout(1200);
  }
}
const uniq = (list) => [...new Set(list)];
if (wants("names")) report(all.names.length === 0, `names: every control on ${PAGES.length} pages has one, nothing focusable hidden, every image said or hidden`, uniq(all.names).slice(0, 12).join(" | "));
if (wants("text")) {
  report(all.text.length === 0, `text at twice its size on ${PAGES.length} pages: nothing cut off, no page wider than the screen`, uniq(all.text).slice(0, 12).join(" | "));
  if (all.previews.length) console.log(`      previews cut short at 2× (by design, the whole a tap away): ${all.previews.join(", ")}`);
}
if (wants("contrast")) {
  report(all.contrast.length === 0, `contrast in ${THEMES.length > 6 ? `${THEMES.length} themes` : THEMES.join(", ")} on ${PAGES.length} pages`, uniq(all.contrast).slice(0, 12).join(" | "));
  writeFileSync(`${OUT}/contrast.txt`, `${uniq(all.contrast).join("\n")}\n`);
}
if (wants("focus")) report(all.focus.length === 0, `focus order down ${PAGES.length} pages`, uniq(all.focus).slice(0, 12).join(" | "));
Object.assign(findings, { pages: PAGES.map(([l, h]) => [l, h]), ...all });

// ---------- a session, step by step ----------
// A quick session's games one after another: on each step, every control named and every game piece something a screen reader can press (a
// button, not a box that takes a click), the keyboard's order down the step, the step's text at 4.5:1; then I don't know, and the sheet that
// answers it at twice its size, nothing cut off; then on.
if (wants("session")) {
  const s = { names: [], focus: [], contrast: [], text: [], pieces: [], games: new Set() };
  // A quick session, then each game's own (Study's game buttons: six questions of that game alone).
  for (const hash of ["#study/session/quick", ...["choose", "arrange", "place", "fill", "meaning", "match"].map((g) => `#study/session/game/${g}`)]) {
  await go("#study");
  await go(hash);
  await page.waitForSelector('[data-part="session"]', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  for (let k = 0; k < (hash.endsWith("quick") ? 10 : 4); k++) {
    const step = await page.evaluate(() => {
      const ses = document.querySelector('[data-part="session"]');
      if (!ses) return null;
      const game = ses.getAttribute("data-game") ?? ses.getAttribute("data-step") ?? "step";
      // A game's pieces: anything taking a press that isn't a control a screen reader knows.
      const pieces = [...ses.querySelectorAll('[data-part="tile"], [data-part="choice"], [data-part="match-item"], [data-part="word-tile"], [data-part="picture-choice"]')]
        .filter((n) => n.getClientRects().length && !n.closest("[data-ghost]"))
        .filter((n) => !n.matches("button, a[href], [role='button'], [role='option'], [role='radio'], input"))
        .map((n) => `${n.getAttribute("data-part")} "${n.textContent.trim().slice(0, 20)}"`);
      // What a screen reader would read that's only marks (a gap drawn as underscores): it says "underscore" over and over.
      const marks = [];
      const walker = document.createTreeWalker(ses, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const host = t.parentElement;
        if (!host || host.closest("[aria-hidden='true'], [data-ghost], [hidden]") || !host.getClientRects().length) continue;
        if (/^[\s_]*_{2,}[\s_]*$/.test(t.textContent)) marks.push(`"${t.textContent.trim()}" read aloud (${host.getAttribute("data-part") ?? host.closest("[data-part]")?.getAttribute("data-part") ?? host.tagName})`);
      }
      return { game, pieces: [...pieces, ...marks] };
    });
    if (!step) break;
    s.games.add(step.game);
    for (const p of step.pieces) s.pieces.push(`${step.game}: ${p}`);
    for (const p of await nameProblems()) s.names.push(`${step.game}: ${p}`);
    for (const p of await focusProblems('[data-part="session"]')) s.focus.push(`${step.game}: ${p}`);
    for (const p of await page.evaluate(CONTRAST)) s.contrast.push(`${step.game}: ${p}`);
    // I don't know, then the sheet that answers it, at twice its size.
    const skip = page.locator('[data-part="session"] button', { hasText: /I don.t know/ }).first();
    if (await skip.count()) {
      await skip.click().catch(() => {});
      await page.waitForTimeout(900);
      await page.evaluate(DOUBLE);
      await page.waitForTimeout(150);
      for (const p of await page.evaluate(CUT, { previews: PREVIEWS, scope: '[data-part="session"]' })) s.text.push(`${step.game}, its answer: ${p}`);
      await page.screenshot({ path: `${OUT}/session-${step.game}-${k}-answer-2x.png` });
      await page.evaluate(UNDO2X);
      await page.waitForTimeout(150);
    }
    const next = page.locator('[data-part="session"] button', { hasText: /^(Continue|See how it went)$/ }).first();
    if (!(await next.count())) break;
    if (/See how it went/.test((await next.textContent()) ?? "")) break;
    await next.click().catch(() => {});
    await page.waitForTimeout(1100);
  }
  }
  report(s.names.length === 0 && s.pieces.length === 0, `a session (${[...s.games].join(", ")}): every control named, every game piece a control a screen reader can press, no gap read as underscores`, uniq([...s.pieces, ...s.names]).slice(0, 10).join(" | "));
  report(s.focus.length === 0, "a session: the keyboard's order down each step", uniq(s.focus).slice(0, 8).join(" | "));
  report(s.contrast.length === 0, "a session: text at 4.5:1 on each step (Graphite)", uniq(s.contrast).slice(0, 8).join(" | "));
  report(s.text.length === 0, "a session: each answer's sheet at twice its size, nothing cut off", uniq(s.text).slice(0, 8).join(" | "));
  await go("#study");
}

// ---------- motion ----------
if (wants("motion")) {
  const calm = await browser.newContext({ viewport: SCREEN, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  await calm.addCookies(cookies);
  await calm.addInitScript(() => {
    try {
      localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "nl", from: "en" }));
    } catch {}
  });
  const p = await calm.newPage();
  await p.goto(`${BASE}/app/#study`);
  await p.waitForSelector('[data-part="tab-bar"]', { timeout: 30_000 });
  await p.waitForTimeout(2000);
  const watch = () => p.evaluate(async () => {
    let most = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 700) {
      most = Math.max(most, document.getAnimations().filter((a) => a.playState === "running").length);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return most;
  });
  const opener = p.locator('[data-part="page"] [data-part="list-row"][aria-haspopup]').first();
  let sheet = null;
  if (await opener.count()) {
    const watching = watch();
    await opener.tap();
    sheet = await watching;
    await p.keyboard.press("Escape");
    await p.waitForTimeout(600);
  }
  const link = p.locator('[data-part="page"] a[href="#study/packs"], [data-part="page"] a[href="#study/path"]').first();
  let pageMove = null;
  if (await link.count()) {
    const watching = watch();
    await link.tap();
    pageMove = await watching;
  }
  report(sheet === 0 && pageMove === 0, "a device asking for less motion: a drawer and a page come with no animation running", `drawer ${sheet}, page ${pageMove}`);
  // A session's answers: no animation, and no drawing changing frame to frame (a picture's reaction, Tinta), after a press.
  await p.evaluate(() => (location.hash = "#study/session/quick"));
  await p.waitForSelector('[data-part="session"]', { timeout: 15_000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const moving = [];
  for (let k = 0; k < 8; k++) {
    const piece = p.locator('[data-part="session"] :is([data-part="choice"], [data-part="tile"], [data-part="match-item"])').first();
    if (!(await piece.count())) {
      const skip = p.locator('[data-part="session"] button', { hasText: /I don.t know/ }).first();
      if (!(await skip.count())) break;
      await skip.click().catch(() => {});
    } else await piece.click().catch(() => {});
    const seen = await p.evaluate(async () => {
      const draw = () => [...document.querySelectorAll('[data-part="session"] svg')].filter((n) => n.getClientRects().length).map((n) => n.innerHTML.length + ":" + (n.getAttribute("transform") ?? "") + ":" + getComputedStyle(n).transform).join("|");
      let most = 0;
      let changes = 0;
      let last = draw();
      const t0 = performance.now();
      while (performance.now() - t0 < 900) {
        await new Promise((r) => requestAnimationFrame(r));
        most = Math.max(most, document.getAnimations().filter((a) => a.playState === "running").length);
        const now = draw();
        if (now !== last) changes++;
        last = now;
      }
      return { most, changes };
    });
    if (seen.most || seen.changes > 1) moving.push(`step ${k}: ${seen.most} animations, drawings changed ${seen.changes} times`);
    const next = p.locator('[data-part="session"] button', { hasText: /^(Continue)$/ }).first();
    if (!(await next.count())) break;
    await next.click().catch(() => {});
    await p.waitForTimeout(900);
  }
  report(moving.length === 0, "a device asking for less motion: a session's answers move nothing (no animation, no drawing redrawn frame to frame)", moving.slice(0, 6).join(" | "));
  await calm.close();
}
report(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
