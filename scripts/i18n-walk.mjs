// The interface's words on screen (lx/i18n.js), walked in Chrome for Testing on a phone: the states in
// scripts/fixtures/i18n-areas.json, as a new account. Three ways:
//   --mode pseudo    in the pseudo locale en-XA. Inside each moved area's state, any text, aria-label, title,
//                    placeholder, alt or data-label that's a word the app's code holds (a string literal that reads like
//                    words, i18n-literals.mjs; a language's English name) didn't come through t(): a FAIL. Run on an app
//                    from before the move, it fails; that's its control.
//   --mode capture   every message marked with its key (characters that draw nothing): each key's context, per state
//                    and screen width (390 and 320): the route, the element and its part, its box, the room its parent
//                    gives it, its font and lines, whether it's cut off, the words around it, the page's heading, a
//                    picture of the screen with it outlined and one of it alone. <outDir>/context/<key>.json, shots/,
//                    coverage.json. An area marked complete fails on any of its keys that no state showed.
//   --mode text      every word on each state's whole page in English, in order (<outDir>/text/<state>.json); with
//                    --against <another run's outDir> it fails on any difference (an app before and after a move must
//                    read the same).
//   --mode fit       --locale <code>: every state in a locale (the pseudo en-XA, or a shipped one's public/i18n file),
//                    at 390 and 320 wide: a word that runs off the screen or out of its box, is cut off, or wraps in a part
//                    that holds one line (a button, a badge, a section link, the microphone's label, a segmented option),
//                    and a page that scrolls sideways, each with its key and a picture (<outDir>/fit/). On en-XA it's the
//                    early warning of what won't take a longer language; on a shipped locale, the freeze's fit gate.
//                    --locale en is the app as it is (it must fit); --plant squeezes buttons and cuts off the language
//                    list's names, and the run fails unless it names both.
// LOCAL only (it signs up accounts). Through gpu.py's parallel lane:
//   node scripts/i18n-walk.mjs http://localhost:<port> <outDir> --mode pseudo|capture|text|fit [--locale <code>] [--against <dir>] [--states a,b] [--source <app dir>]
// --source: the copy of the app the server runs, when it isn't this one (a control run on the app from before).
// A state opens as: `clear` (localStorage keys removed on the origin first), its `url` loaded fresh, `ready` waited for,
// `open` ([module, function] called), `root` waited for, `press` (a selector or list, each clicked in order: answering a
// step to reach the next), `type` ([selector, text]) filled, then `settle` ms.

const { chromium } = await import("./quiet-browser.mjs");
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { literalsOf, wordLike } from "./i18n-literals.mjs";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const [BASE, outArg] = args;
const MODE = opt("--mode");
if (!BASE || !outArg || !/^http:\/\/localhost/.test(BASE) || !["pseudo", "capture", "text", "fit"].includes(MODE) || (MODE === "fit" && !opt("--locale"))) {
  console.error("usage: i18n-walk.mjs http://localhost:<port> <outDir> --mode pseudo|capture|text|fit [--locale <code>] [--against <dir>] [--states a,b] [--source <app dir>] (LOCAL only)");
  process.exit(2);
}
const OUT = resolve(outArg);
const AGAINST = opt("--against") && resolve(opt("--against"));
const SOURCE = resolve(opt("--source") ?? APP); // the copy whose code --pseudo reads: the one the server runs
const AREAS = JSON.parse(readFileSync(join(APP, "scripts/fixtures/i18n-areas.json"), "utf8"));
const only = opt("--states")?.split(",");
mkdirSync(OUT, { recursive: true });

let failed = 0;
const report = (ok, name, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failed++;
};

// ---------- the browser, a new account ----------

const browser = await chromium.launch({ headless: true, channel: "chrome" });
async function newAccount(width, height, check, { bypassCSP = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark", bypassCSP });
  if (check) await context.addInitScript((value) => (globalThis.__lxI18nCheck = value), check);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Words Walk");
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  return { context, page };
}

async function openState(page, id) {
  const state = AREAS.states[id];
  if (!state) throw new Error(`no state ${id} in i18n-areas.json`);
  // A fresh load every time: going to a URL that differs only by its hash wouldn't load it again, and what the state
  // before opened (the first run, a drawer) would still be up.
  await page.goto("about:blank");
  // clear: keys an earlier state (or an earlier run) left on this origin that this one must not see, removed before its
  // page loads (a first run answered on one state would open the next at its second question).
  if (state.clear?.length) {
    await page.goto(`${BASE}/robots.txt`);
    await page.evaluate((keys) => keys.forEach((key) => localStorage.removeItem(key)), state.clear);
  }
  await page.goto(`${BASE}${state.url}`);
  if (state.url.startsWith("/app/")) await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  if (state.ready) await page.waitForSelector(state.ready, { timeout: 30_000 });
  if (state.open) {
    const opened = await page.evaluate(async ([module, fn]) => {
      const m = await import(module);
      return Boolean(m[fn]());
    }, state.open);
    if (!opened && state.open[1] !== "openLanguageSheet") throw new Error(`${state.open[1]}() opened nothing`);
  }
  if (state.root) await page.waitForSelector(state.root, { timeout: 15_000 });
  // press: a selector, or a list, each waited for and clicked in order (answering a step to reach the one after it).
  for (const selector of [state.press ?? []].flat()) {
    await page.waitForSelector(selector, { state: "visible", timeout: 15_000 });
    await page.click(selector);
    await page.waitForTimeout(300);
  }
  if (state.type) await page.fill(state.type[0], state.type[1]);
  await page.waitForTimeout(state.settle ?? 600);
  return state;
}

// Everything a person sees, or hears from a screen reader, in a root: each element's own text (its text nodes, joined)
// and its labels, in document order, with the element's index for whoever needs it.
const COLLECT = (rootSelector) => {
  const roots = rootSelector ? [...document.querySelectorAll(rootSelector)] : [document.body];
  const out = [];
  const shown = (el) => (typeof el.checkVisibility === "function" ? el.checkVisibility({ visibilityProperty: true }) : true) && el.getClientRects().length > 0;
  let index = 0;
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let el = root; el; el = walker.nextNode()) {
      if (["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "svg"].includes(el.tagName) || el.closest("svg")) continue;
      if (!shown(el)) continue;
      const nodes = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue);
      const own = nodes.join("");
      el.setAttribute("data-i18n-walk", String(index));
      if (own.trim()) out.push({ kind: "text", text: own, nodes, at: index });
      for (const name of ["aria-label", "title", "placeholder", "alt", "data-label"]) {
        const value = el.getAttribute(name);
        if (value && value.trim()) out.push({ kind: name, text: value, nodes: [value], at: index });
      }
      index++;
    }
  }
  return out;
};

// ---------- what an area's code holds as words ----------

// The words an area's own files hold as string literals, in the copy the server runs (SOURCE): on the app from before its
// move, every one of them; once it has moved, none shown. Any literal with letters counts (wordLike: "off" too, which no rule
// on the code can tell from a state's name), since only one shown as a screen's whole text is a word that missed t(). Only
// the area's own files, so another screen's words on the same page (/design's own) never count against it.
function codeWords(files) {
  const exact = new Set();
  const patterns = [];
  for (const file of files) {
    const path = join(SOURCE, file);
    if (!existsSync(path)) continue;
    for (const literal of literalsOf(readFileSync(path, "utf8")).filter(wordLike)) {
      const text = literal.text.trim();
      if (!literal.template) exact.add(text);
      else {
        const pieces = text.split("{}").map((piece) => piece.replace(/[.*+?^$()|[\]\\]/g, "\\$&"));
        if (pieces.join("").replace(/\W/g, "").length >= 3) patterns.push(new RegExp(`^${pieces.join(".+?")}$`, "s"));
      }
    }
  }
  return { exact, patterns };
}
// The files under these prefixes (a state's `unmoved`, such as public/js/design), for subtracting their words.
function unmovedFiles(prefixes) {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : []));
  return walk(join(SOURCE, "public/js")).map((path) => path.slice(SOURCE.length + 1)).filter((rel) => prefixes.some((prefix) => rel.startsWith(prefix)));
}
async function languageNames(page) {
  return page.evaluate(async () => {
    const { LANGUAGES } = await import("/js/lang/index.js");
    return Object.values(LANGUAGES).map((language) => language.name);
  });
}

// ---------- the modes ----------

const stateIds = (ids) => (only ? ids.filter((id) => only.includes(id)) : ids);

if (MODE === "pseudo") {
  const { context, page } = await newAccount(390, 844, { locale: "en-XA" });
  const allNames = new Set(await languageNames(page));
  mkdirSync(join(OUT, "shots"), { recursive: true });
  for (const [area, spec] of Object.entries(AREAS.areas)) {
    const { exact, patterns } = codeWords(spec.files);
    const names = spec.names ? allNames : new Set();
    const plain = (text) => {
      const t = text.trim();
      return t && (exact.has(t) || names.has(t) || patterns.some((p) => p.test(t)));
    };
    console.log(`${area}: ${exact.size + patterns.length} words in its code at ${SOURCE}${spec.names ? `, and ${names.size} language names` : ""}`);
    for (const id of stateIds(spec.states)) {
      if (AREAS.states[id]?.pseudo === false) {
        console.log(`      ${area} on ${id}: not walked in the pseudo locale (${AREAS.states[id].why ?? "the state says so"})`);
        continue;
      }
      try {
        const state = await openState(page, id);
        // A page whose own words come from files that haven't moved (/design's captions: "right", "playing" are its own
        // words for each demo's state) doesn't count those words against an area: they're the page's, not the area's.
        const theirs = state.unmoved ? codeWords(unmovedFiles(state.unmoved)) : { exact: new Set(), patterns: [] };
        const ours = (text) => plain(text) && !theirs.exact.has(text.trim());
        const items = await page.evaluate(COLLECT, state.root ?? null);
        const pseudoShown = items.filter((item) => /[ÅåĻļéîöŕšţûŵ]/.test(item.text)).length;
        const left = items.flatMap((item) => item.nodes.filter(ours).map((text) => `${item.kind}: "${text.trim()}"`));
        await page.screenshot({ path: join(OUT, "shots", `${area}--${id}.png`) });
        report(left.length === 0 && pseudoShown > 0, `${area} on ${id}: every word through t() (${items.length} pieces, ${pseudoShown} in the pseudo locale)`, left.slice(0, 8).join("; ") || (pseudoShown ? "" : "nothing in the pseudo locale at all"));
      } catch (error) {
        report(false, `${area} on ${id}`, String(error.message ?? error).slice(0, 300));
      }
    }
  }
  await context.close();
}

if (MODE === "capture") {
  const records = new Map(); // key → [occurrence]
  const shots = join(OUT, "shots");
  mkdirSync(shots, { recursive: true });
  const states = [...new Set(Object.values(AREAS.areas).flatMap((a) => a.states))];
  for (const [width, height] of [[390, 844], [320, 568]]) {
    const { context, page } = await newAccount(width, height, { mark: true });
    for (const id of stateIds(states)) {
      try {
        const state = await openState(page, id);
        const collected = await page.evaluate(COLLECT, state.root ?? null);
        const found = await page.evaluate(
          async ([items, rootSelector]) => {
            const { decodeMarks } = await import("/js/lx/i18n.js");
            // The state's own screen: the first run, a drawer, or the page. Its heading and the words around a piece come from inside it.
            const root = (rootSelector && document.querySelector(rootSelector)) || document.body;
            const heading = root.querySelector('[data-part="page-title"], h1, .lx-sheet-title, h2')?.textContent ?? "";
            const out = [];
            for (const item of items) {
              const { keys } = decodeMarks(item.text);
              if (!keys.length) continue;
              const el = document.querySelector(`[data-i18n-walk="${item.at}"]`);
              const box = el.getBoundingClientRect();
              const parent = el.parentElement;
              const pbox = parent?.getBoundingClientRect();
              const css = getComputedStyle(el);
              const pcss = parent ? getComputedStyle(parent) : null;
              const lineHeight = parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.2;
              const plain = (node) => (node ? decodeMarks(node.textContent ?? "").text.trim().slice(0, 80) : null);
              const near = [el.previousElementSibling, el.nextElementSibling, parent?.previousElementSibling, parent?.nextElementSibling]
                .filter((node) => node && root.contains(node) && node !== root)
                .map((node) => plain(node.firstElementChild && node.children.length > 3 ? node.firstElementChild : node))
                .filter(Boolean);
              const partOf = el.closest("[data-part]");
              for (const key of keys) {
                out.push({
                  key: key.key,
                  kind: item.kind,
                  shown: key.text,
                  nested: key.depth > 0,
                  tag: el.tagName.toLowerCase(),
                  role: el.getAttribute("role") ?? null,
                  part: el.getAttribute("data-part") ?? null,
                  inPart: partOf?.getAttribute("data-part") ?? null,
                  classes: el.className && typeof el.className === "string" ? el.className : null,
                  box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
                  room: pbox ? Math.round(pbox.width - parseFloat(pcss.paddingLeft) - parseFloat(pcss.paddingRight)) : null,
                  font: { family: css.fontFamily.split(",")[0].trim(), size: css.fontSize, weight: css.fontWeight, lineHeight: css.lineHeight },
                  lines: item.kind === "text" ? Math.max(1, Math.round(box.height / lineHeight)) : null,
                  wraps: css.whiteSpace !== "nowrap",
                  cut: el.scrollWidth > el.clientWidth + 1 || css.textOverflow === "ellipsis",
                  near,
                  heading: decodeMarks(heading).text.trim().slice(0, 80),
                  at: item.at,
                });
              }
            }
            return out;
          },
          [collected, state.root ?? null],
        );
        for (const record of found) {
          const list = records.get(record.key) ?? [];
          const first = !list.some((r) => r.state === id && r.width === width && r.kind === record.kind);
          const occurrence = { state: id, route: AREAS.states[id].url, width, ...record };
          // A picture for each key's first place on each state, at 390 (the outlined screen and the element alone).
          if (first && width === 390 && list.filter((r) => r.shot).length < 4) {
            const el = page.locator(`[data-i18n-walk="${record.at}"]`);
            const name = `${record.key}--${id}${record.kind === "text" ? "" : `--${record.kind}`}`.replace(/[^\w.-]/g, "_");
            try {
              await el.scrollIntoViewIfNeeded({ timeout: 2000 });
              await el.evaluate((node) => {
                node.style.setProperty("outline", "3px solid #ff2bd6", "important");
                node.style.setProperty("outline-offset", "2px", "important");
              });
              await page.screenshot({ path: join(shots, `${name}.png`) });
              await el.evaluate((node) => {
                node.style.removeProperty("outline");
                node.style.removeProperty("outline-offset");
              });
              await el.screenshot({ path: join(shots, `${name}--alone.png`), timeout: 3000 });
              occurrence.shot = `shots/${name}.png`;
              occurrence.alone = `shots/${name}--alone.png`;
            } catch {
              occurrence.shot = null; // an aria-label on something off the screen: its box is the context
            }
          }
          delete occurrence.at;
          list.push(occurrence);
          records.set(record.key, list);
        }
        report(true, `captured ${id} at ${width}`, `${found.length} pieces, ${new Set(found.map((r) => r.key)).size} keys`);
      } catch (error) {
        report(false, `capture ${id} at ${width}`, String(error.message ?? error).slice(0, 300));
      }
    }
    await context.close();
  }
  // The records, with each key's English and about, and what no state showed.
  const { englishEntries } = await import("../public/js/lx/i18n.js");
  const entries = englishEntries();
  mkdirSync(join(OUT, "context"), { recursive: true });
  for (const entry of entries) {
    const occurrences = records.get(entry.key);
    if (occurrences) writeFileSync(join(OUT, "context", `${entry.key}.json`), JSON.stringify({ key: entry.key, english: entry.text, about: entry.about, area: entry.area, occurrences }, null, 2));
  }
  const coverage = {};
  for (const [area, spec] of Object.entries(AREAS.areas)) {
    const keys = entries.filter((e) => e.area === area).map((e) => e.key);
    const missing = keys.filter((key) => !records.has(key));
    coverage[area] = { keys: keys.length, captured: keys.length - missing.length, missing, complete: spec.complete };
    report(!spec.complete || missing.length === 0, `${area}: ${keys.length - missing.length} of ${keys.length} keys captured on screen${spec.complete ? "" : " (not yet complete: its screens move later)"}`, missing.slice(0, 10).join(", "));
  }
  const languages = entries.filter((e) => e.area === "language");
  coverage.language = { keys: languages.length, captured: languages.filter((e) => records.has(e.key)).length };
  writeFileSync(join(OUT, "coverage.json"), JSON.stringify(coverage, null, 2));
  console.log(`context: ${records.size} keys in ${join(OUT, "context")}`);
}

if (MODE === "fit") {
  const LOCALE = opt("--locale");
  // --plant: buttons squeezed so their words wrap, and the language list's names cut off, on top of the app's own CSS:
  // the run must name both, or the check can't see what it's for.
  const PLANT = args.includes("--plant") ? '[data-part="button"] { width: 44px !important; white-space: normal !important; } .lx-row-title { display: block !important; width: 24px !important; overflow: hidden !important; white-space: nowrap !important; text-overflow: ellipsis !important; }' : null;
  let check;
  if (LOCALE === "en") check = { mark: true };
  else if (LOCALE === "en-XA") check = { locale: LOCALE, mark: true };
  else {
    const path = join(SOURCE, "public/i18n", `${LOCALE}.json`);
    if (!existsSync(path)) throw new Error(`no strings file for ${LOCALE} at ${path}`);
    check = { file: JSON.parse(readFileSync(path, "utf8")), mark: true };
  }
  const shots = join(OUT, "fit");
  mkdirSync(shots, { recursive: true });
  const states = [...new Set(Object.values(AREAS.areas).flatMap((a) => a.states))];
  const all = [];
  for (const [width, height] of [[390, 844], [320, 568]]) {
    const { context, page } = await newAccount(width, height, check, { bypassCSP: Boolean(PLANT) });
    for (const id of stateIds(states)) {
      try {
        const state = await openState(page, id);
        if (PLANT) await page.addStyleTag({ content: PLANT });
        const collected = await page.evaluate(COLLECT, state.root ?? null);
        const heading = await page.evaluate(async (rootSelector) => {
          const { decodeMarks } = await import("/js/lx/i18n.js");
          const root = (rootSelector && document.querySelector(rootSelector)) || document.body;
          return decodeMarks(root.querySelector('[data-part="page-title"], h1, .lx-sheet-title, h2')?.textContent ?? "").text.trim().slice(0, 80);
        }, state.root ?? null);
        console.log(`      ${id} at ${width}, in ${LOCALE}: "${heading}"`);
        const found = await page.evaluate(
          async ([items, rootSelector, oneLine, screen]) => {
            const { decodeMarks } = await import("/js/lx/i18n.js");
            const root = (rootSelector && document.querySelector(rootSelector)) || document.body;
            const out = [];
            // The screen's width is the one the page was opened at: under a phone's emulation innerWidth is the layout
            // viewport, which grows with content wider than the screen (lex-polish, 5 Nov: /design at 320 laid out at 382).
            const scroller = document.scrollingElement;
            if (scroller.scrollWidth > screen + 1 || innerWidth > screen + 1) out.push({ key: null, what: `the page is wider than the screen (${Math.max(scroller.scrollWidth, innerWidth)} px in ${screen})`, at: null });
            const lineCount = (el) => {
              const tops = new Set();
              for (const node of el.childNodes) {
                if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                for (const rect of range.getClientRects()) if (rect.width > 1) tops.add(Math.round(rect.top));
              }
              return tops.size;
            };
            for (const item of items) {
              if (item.kind !== "text") continue;
              const { keys } = decodeMarks(item.text);
              if (!keys.length) continue;
              const key = keys.find((k) => !k.nested)?.key ?? keys[0].key;
              const el = document.querySelector(`[data-i18n-walk="${item.at}"]`);
              const box = el.getBoundingClientRect();
              const css = getComputedStyle(el);
              const part = el.closest("[data-part]")?.getAttribute("data-part") ?? null;
              // Words only a screen reader gets (a 1 px box, clipped away on purpose) aren't on the screen to fit.
              if (box.width <= 1 || box.height <= 1) continue;
              const problems = [];
              if (box.right > screen + 1 || box.left < -1) problems.push(`runs off the screen (${Math.round(box.left)}–${Math.round(box.right)} in ${screen})`);
              // Out of its box: past the edge of the nearest ancestor that clips or ends there (a card, a button, a row).
              let holder = el.parentElement;
              while (holder && holder !== document.body && getComputedStyle(holder).overflowX === "visible" && holder.getBoundingClientRect().width >= screen - 1) holder = holder.parentElement;
              if (holder && holder !== document.body) {
                const h = holder.getBoundingClientRect();
                if (box.right > h.right + 1 || box.left < h.left - 1) problems.push(`out of its box (${holder.getAttribute("data-part") ?? holder.className ?? holder.tagName})`);
              }
              if (el.scrollWidth > el.clientWidth + 1 && (css.overflowX !== "visible" || css.textOverflow === "ellipsis")) problems.push(`cut off (${el.scrollWidth} px of text in ${el.clientWidth})`);
              const lines = lineCount(el);
              if (oneLine.includes(part) && lines > 1) problems.push(`wraps to ${lines} lines in a ${part}, which holds one`);
              if (problems.length) out.push({ key, part, text: decodeMarks(item.text).text.trim().slice(0, 80), what: problems.join("; "), at: item.at });
            }
            return out;
          },
          [collected, state.root ?? null, AREAS.fit?.oneLine ?? [], width],
        );
        for (const problem of found) {
          let shot = null;
          if (problem.at !== null && all.filter((p) => p.shot).length < 60) {
            const el = page.locator(`[data-i18n-walk="${problem.at}"]`);
            shot = `fit/${`${problem.key}--${id}--${width}`.replace(/[^\w.-]/g, "_")}.png`;
            try {
              await el.scrollIntoViewIfNeeded({ timeout: 2000 });
              await el.evaluate((node) => node.style.setProperty("outline", "3px solid #ff2bd6", "important"));
              await page.screenshot({ path: join(OUT, shot) });
              await el.evaluate((node) => node.style.removeProperty("outline"));
            } catch {
              shot = null;
            }
          }
          delete problem.at;
          all.push({ state: id, width, ...problem, shot });
        }
        if (!PLANT) report(found.length === 0, `${LOCALE} on ${id} at ${width}: every word fits`, found.slice(0, 4).map((p) => `${p.key ?? "page"} "${p.text ?? ""}": ${p.what}`).join(" | "));
        else console.log(`      planted on ${id} at ${width}: ${found.length} problems found`);
      } catch (error) {
        report(false, `${LOCALE} fit on ${id} at ${width}`, String(error.message ?? error).slice(0, 300));
      }
    }
    await context.close();
  }
  if (PLANT) {
    report(all.some((p) => /wraps .* in a button/.test(p.what)), "PLANT squeezed buttons: their wrapping words are named", all.filter((p) => /in a button/.test(p.what)).length + " found");
    report(all.some((p) => p.state.startsWith("first-run") && /cut off/.test(p.what)), "PLANT cut-off language names: named", all.filter((p) => /cut off/.test(p.what)).length + " found");
  }
  writeFileSync(join(OUT, "fit.json"), JSON.stringify({ locale: LOCALE, planted: Boolean(PLANT), problems: all }, null, 2));
  console.log(`fit: ${all.length} problems in ${join(OUT, "fit.json")}`);
}

if (MODE === "text") {
  const { context, page } = await newAccount(390, 844, null);
  mkdirSync(join(OUT, "text"), { recursive: true });
  for (const id of stateIds(AREAS.text)) {
    try {
      const state = await openState(page, id);
      const items = (await page.evaluate(COLLECT, null)).map(({ kind, text }) => [kind, text.replace(/\s+/g, " ").trim()]);
      writeFileSync(join(OUT, "text", `${id}.json`), JSON.stringify(items, null, 1));
      if (!AGAINST) {
        report(true, `read ${id}`, `${items.length} pieces`);
        continue;
      }
      const theirsPath = join(AGAINST, "text", `${id}.json`);
      if (!existsSync(theirsPath)) {
        report(false, `${id} against ${AGAINST}`, "that run has no such state");
        continue;
      }
      const theirs = JSON.parse(readFileSync(theirsPath, "utf8"));
      const diffs = [];
      for (let i = 0; i < Math.max(items.length, theirs.length); i++) {
        if (JSON.stringify(items[i]) !== JSON.stringify(theirs[i])) diffs.push(`#${i}: ${JSON.stringify(theirs[i])} → ${JSON.stringify(items[i])}`);
      }
      report(diffs.length === 0, `${id}: the same words as ${AGAINST.split("/").slice(-2).join("/")} (${items.length} pieces)`, diffs.slice(0, 5).join("; "));
      void state;
    } catch (error) {
      report(false, `text ${id}`, String(error.message ?? error).slice(0, 300));
    }
  }
  await context.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
