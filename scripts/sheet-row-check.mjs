// A row says where it goes. A row that opens a sheet over the page looks like it (ui.listRow({ opens: "sheet" }): drawn as a button,
// aria-haspopup="dialog", no chevron), and a row with the chevron opens a page: a drawer's row mustn't look like it takes you to
// another page. Every page a phone reaches from the tabs and Settings by its rows is walked, and every row on it that's a button is
// pressed, one at a time on the page drawn fresh, to see what it really does. Rows that end the session (Sign out, deleting the
// account) aren't pressed. Writes rows.json and rows.md (every row: the page, its words, its mark, what it did). LOCAL only: it
// signs up a test account, and deletes it.
// Usage: node scripts/sheet-row-check.mjs http://localhost:<port> <outDir>   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/sheet-row-check.mjs http://localhost:<port> <outDir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
// Where the walk starts, and what it never follows: a session or a book takes the whole screen, and isn't a page of rows.
const START = ["#today", "#study", "#study/packs", "#read", "#explore", "#settings"];
const NOT_A_PAGE = /^#(study\/session|read\/book|read\/open|session|practice\/)/;
const NOT_PRESSED = /^(Sign out|Delete your account|Delete account)/;
const MAX_PAGES = 160;
// A page made from a template (a pack's, an item's) is walked once: its address with every id-like part as ":id".
const shape = (hash) => hash.replace(/\/[^/]*(\d|%)[^/]*/g, "/:id");
// On a long list of the same row (a pack's sentences), the first few pressed say what the rest do.
const MAX_PRESSES = 12;

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const desk = await browser.newContext();
const signup = await desk.newPage();
const dcdp = await desk.newCDPSession(signup);
await dcdp.send("WebAuthn.enable");
await dcdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await signup.goto(`${BASE}/app/`);
await signup.waitForURL(/\/login\?next=/);
await signup.click("summary");
await signup.fill('input[name="name"]', "Sheet Row Check");
await signup.click('#register button[type="submit"]');
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await phone.addCookies(await desk.cookies());
const page = await phone.newPage();
const errors = [];
let where = "";
page.on("pageerror", (e) => errors.push(`${where}: ${String(e)}`));
await page.goto(`${BASE}/app/#today`);
await page.waitForFunction(() => document.documentElement.hasAttribute("data-app-ready"), null, { timeout: 60_000 });
await page.waitForTimeout(1500);

/** The page at `hash`, drawn fresh: whatever sheet is up goes, and the page is opened from another one so it draws again. */
async function open(hash) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => document.querySelectorAll(".lx-sheet-layer:not([hidden])").forEach((l) => l.remove()));
  await page.evaluate((h) => { location.hash = h === "#today" ? "#study" : "#today"; }, hash);
  await page.waitForTimeout(350);
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(1300);
  return page.evaluate(() => location.hash);
}

// What's on the page now: its rows (their words, mark, whether a sheet is announced), and the pages its rows link to.
const READ_ROWS = () => {
  const host = document.querySelector('[data-part="app"] > [data-part="page"]');
  const seen = (n) => n.getClientRects().length > 0 && n.checkVisibility?.() !== false && !n.closest('[data-part="sheet"], [inert]');
  const CHEVRON = "M9.5 6l6 6-6 6";
  return [...(host?.querySelectorAll('[data-part="list-row"]') ?? [])].filter(seen).map((row, index) => {
    const end = row.lastElementChild;
    const mark = end?.matches?.("svg") ? (end.innerHTML.includes(CHEVRON) ? "chevron" : end.getAttribute("data-mark") || end.querySelector("path")?.getAttribute("d")?.slice(0, 18) || "svg") : end?.matches?.(".lx-row-value") ? "value" : end ? end.tagName.toLowerCase() : "none";
    return {
      index,
      tag: row.tagName.toLowerCase(),
      href: row.getAttribute("href"),
      title: (row.querySelector(".lx-row-title")?.textContent ?? row.textContent).trim().replace(/\s+/g, " ").slice(0, 60),
      mark,
      chevron: row.querySelector(`:scope > svg path[d="${CHEVRON}"]`) !== null,
      haspopup: row.getAttribute("aria-haspopup"),
      opens: row.getAttribute("data-opens"),
    };
  });
};

const pages = [];
const queue = [...START];
const queued = new Set(START.map(shape));
const rows = [];
while (queue.length && pages.length < MAX_PAGES) {
  const hash = queue.shift();
  where = hash;
  const at = await open(hash);
  if (at !== hash) continue;
  pages.push(hash);
  const found = await page.evaluate(READ_ROWS);
  for (const row of found) {
    if (row.tag === "a") {
      const to = row.href?.startsWith("#") ? row.href : null;
      if (to && !NOT_A_PAGE.test(to) && !queued.has(shape(to))) (queued.add(shape(to)), queue.push(to));
      // A link off the app's pages (privacy, terms, the design system) is still another page.
      rows.push({ page: hash, ...row, did: "page", to: row.href });
      continue;
    }
    if (row.tag !== "button") continue;
    if (rows.filter((r) => r.page === hash && r.pressed).length >= MAX_PRESSES) {
      rows.push({ page: hash, ...row, did: "not pressed" });
      continue;
    }
    if (NOT_PRESSED.test(row.title)) {
      rows.push({ page: hash, ...row, did: "not pressed" });
      continue;
    }
    if ((await open(hash)) !== hash) break;
    const before = await page.evaluate(READ_ROWS);
    const same = before.find((r) => r.index === row.index && r.title === row.title) ?? before.find((r) => r.title === row.title);
    if (!same) {
      rows.push({ page: hash, ...row, did: "gone when drawn again" });
      continue;
    }
    await page.evaluate((i) => {
      const host = document.querySelector('[data-part="app"] > [data-part="page"]');
      const seen = (n) => n.getClientRects().length > 0 && n.checkVisibility?.() !== false && !n.closest('[data-part="sheet"], [inert]');
      const list = [...host.querySelectorAll('[data-part="list-row"]')].filter(seen);
      list[i].scrollIntoView({ block: "center" });
      list[i].click();
    }, same.index);
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => ({
      hash: location.hash,
      sheet: [...document.querySelectorAll('[data-part="sheet"]')].some((s) => !s.hidden && s.getClientRects().length > 0 && s.getBoundingClientRect().top < innerHeight - 40),
    }));
    const did = after.sheet ? "sheet" : after.hash !== hash ? "page" : "in place";
    if (did === "page" && !NOT_A_PAGE.test(after.hash) && !queued.has(shape(after.hash))) (queued.add(shape(after.hash)), queue.push(after.hash));
    rows.push({ page: hash, ...same, did, pressed: true, to: did === "page" ? after.hash : undefined });
  }
}

const wrong = rows.filter((r) => {
  if (r.did === "sheet") return r.chevron || r.haspopup !== "dialog" || r.opens !== "sheet";
  if (r.haspopup === "dialog" || r.opens === "sheet") return r.pressed && r.did !== "sheet";
  if (r.chevron) return r.pressed && r.did !== "page";
  return false;
});
const why = (r) =>
  r.did === "sheet" ? (r.chevron ? "opens a sheet, but ends in the page chevron" : "opens a sheet, but doesn't say so (opens: \"sheet\")") : r.chevron ? `ends in the page chevron, but ${r.did === "in place" ? "acts in place" : r.did}` : "says it opens a sheet, but didn't";
writeFileSync(`${OUT}/rows.json`, JSON.stringify({ pages, rows, wrong, errors }, null, 2));
writeFileSync(
  `${OUT}/rows.md`,
  [`# Rows, by what they do (${rows.length} on ${pages.length} pages)`, "", "| Page | Row | Mark | Did |", "|---|---|---|---|", ...rows.map((r) => `| ${r.page} | ${r.title.replace(/\|/g, "/")} | ${r.mark}${r.haspopup ? ` (${r.haspopup})` : ""} | ${r.did}${r.to ? ` ${r.to}` : ""} |`)].join("\n") + "\n",
);
for (const r of wrong) console.log(`WRONG ${r.page} "${r.title}": ${why(r)}`);
console.log(`${rows.length} rows on ${pages.length} pages; ${rows.filter((r) => r.did === "sheet").length} open a sheet; ${wrong.length} wrong; ${errors.length} page errors`);
for (const e of errors) console.log("page error:", e.slice(0, 300));
await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
await browser.close();
process.exit(wrong.length || errors.length ? 1 : 0);
