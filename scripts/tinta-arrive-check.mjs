// Tinta in the first frame of every page that has one, on a phone (ui.character, character/firsts.js, character/character.js, and the
// start and page gate in shell/main.js). A page drawn before Tinta's drawing had come showed Tinta's place empty, then Tinta popping in a
// moment later: on every start, and on the first page with a Tinta after a start into one without. A recorder in the page looks at
// every Tinta on every animation frame: whether its box is on the screen and seen, and whether a drawing is in it.
//   - a start into each page with a Tinta (Home, the path, the AI tab), the processor slowed 4×, the app's worker on: every Tinta drawn
//     in every frame it's seen;
//   - a start into a page with none (Settings), then a first visit to each page with one: the same;
//   - Tinta's drawing held back past the start's wait, with its first frames kept from a start before: each Tinta holds its kept first
//     frame from the first frame it's seen, and the live Tinta takes over with the same picture (its markup the same but for its ids);
//   - the same with nothing kept (a first open): Tinta fades in when its drawing comes, never popping into its place;
//   - Animations Off (a device asking for reduced motion): its still in the first frame, and the kept still while the drawing is held;
//   - an empty state with a drawing (Explore's search finding nothing): the drawing's box there from its first frame, never Tinta shown
//     first with the drawing put over it (and the box growing under the words).
// The app from before fails the first two (3 to 9 frames with nothing drawn at 4×). LOCAL only: it signs up two accounts and gives
// them the sample learner.
//   node scripts/tinta-arrive-check.mjs http://localhost:<port> <outDir> [--cpu 4] [--preset weeks] [--only <regex>]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, OUT] = argv;
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const CPU = Number(opt("cpu", 4));
const PRESET = opt("preset", "weeks");
const ONLY = opt("only", null) ? new RegExp(opt("only", null)) : null;
if (!BASE || !OUT || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE.replace(/\/$/, ""))) {
  console.error("usage: node scripts/tinta-arrive-check.mjs http://localhost:<port> <outDir> [--cpu 4] [--preset weeks] [--only <regex>] (LOCAL only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const HOLD = 4500; // past the start's wait for Tinta's drawing (main.js TINTA_WAIT, 3 s)

const results = [];
let failed = 0;
async function stage(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const said = await fn();
    results.push({ name, ok: true, said });
    console.log(`ok    ${name}: ${said}`);
  } catch (error) {
    failed++;
    results.push({ name, ok: false, said: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${String(error?.message ?? error).split("\n")[0]}`);
  }
}
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

// ---------- the recorder: every Tinta, every frame ----------
const RECORDER = () => {
  if (globalThis.__arrive) return;
  const ids = new WeakMap();
  let next = 1;
  const idOf = (node) => (ids.has(node) ? ids.get(node) : (ids.set(node, next), next++));
  const rec = (globalThis.__arrive = { frames: [], takeovers: [] });
  // A drawing's markup with its ids put in order (the rig numbers them across the page), so two drawings of one frame compare equal.
  const plainOf = (html) => {
    const names = new Map();
    for (const m of html.matchAll(/\bid="([^"]+)"/g)) if (!names.has(m[1])) names.set(m[1], `i${names.size}`);
    return html.replace(/(id="|#)([^"')\s]+)(?=["')])/g, (whole, lead, id) => (names.has(id) ? lead + names.get(id) : whole));
  };
  const plain = (svg) => plainOf(svg.innerHTML);
  // A held state on the compositor (character.js startMotion) keeps its first frame with its breath baked in, <g transform="matrix(…)">rest</g>,
  // and its live Tinta draws rest with that matrix played on its drawing: the same picture when the live drawing is the kept one's inside and
  // its drawing's transform is the baked matrix.
  const breathedSame = (svg, before) => {
    const kept = /^<g transform="matrix\(([^)]+)\)">([\s\S]*)<\/g>$/.exec(before);
    // Its parts' tracks baked in too (character.js bakeTracks): the live drawing has them as animations instead.
    const inner = kept ? kept[2].replace(/(<g data-track="[^"]+") transform="matrix\([^)]*\)"(?: opacity="[^"]*")?/g, "$1") : null;
    if (!kept || plainOf(svg.innerHTML) !== plainOf(inner)) return false;
    const want = kept[1].trim().split(/[\s,]+/).map(Number);
    const now = getComputedStyle(svg).transform;
    const got = now === "none" ? [1, 0, 0, 1, 0, 0] : now.replace(/^matrix\(|\)$/g, "").split(",").map(Number);
    return want.length >= 4 && want.slice(0, 4).every((v, i) => Math.abs(v - got[i]) < 2e-3);
  };
  // A Tinta's drawing changing for the first time after Tinta's code has come: what it held, and what the live Tinta drew over it.
  const watched = new WeakSet();
  const watch = (tinta) => {
    const svg = tinta.querySelector(":scope > svg");
    if (!svg || watched.has(svg)) return;
    watched.add(svg);
    const before = plain(svg);
    const heldAt = performance.now();
    new MutationObserver((list, observer) => {
      if (!customElements.get("lx-tinta")) return;
      observer.disconnect();
      rec.takeovers.push({ id: idOf(tinta), state: tinta.getAttribute("data-state"), heldMs: Math.round(performance.now() - heldAt), same: plain(svg) === before || breathedSame(svg, before), size: before.length, ...(plain(svg) === before || breathedSame(svg, before) ? {} : { before: before.slice(0, 160), after: plain(svg).slice(0, 160), transform: getComputedStyle(svg).transform, breathing: tinta.hasAttribute("data-breathing"), anims: svg.getAnimations().length }) });
    }).observe(svg, { childList: true, subtree: true, characterData: true, attributes: true });
  };
  const seen = (node) => {
    const r = node.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) return false;
    return (node.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true) && !node.closest("[data-waiting]");
  };
  const tick = (ts) => {
    const list = [];
    const defined = Boolean(customElements.get("lx-tinta"));
    for (const t of document.querySelectorAll("lx-tinta")) {
      const svg = t.querySelector(":scope > svg");
      const drawn = Boolean(svg?.querySelector("path"));
      if (drawn && !defined) watch(t);
      list.push({ id: idOf(t), on: seen(t), drawn, opacity: svg ? Number(getComputedStyle(svg).opacity) : null, state: t.getAttribute("data-state"), size: t.getAttribute("data-size") });
    }
    const empties = [];
    for (const e of document.querySelectorAll('[data-part="empty-state"]')) {
      if (!seen(e)) continue;
      const tinta = e.querySelector("lx-tinta");
      empties.push({ id: idOf(e), h: Math.round(e.getBoundingClientRect().height), art: Boolean(e.querySelector(".lx-empty-art")), drawing: Boolean(e.querySelector('.lx-empty-art [data-part="picture"] svg')), tinta: Boolean(tinta && seen(tinta) && tinta.querySelector("svg path")) });
    }
    rec.frames.push({ at: Math.round(ts), hash: location.hash, defined, list, empties });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** Per Tinta in these frames: how many frames it was seen with nothing drawn, and when; its first frame seen; its opacity as it was first drawn. */
function tintasIn(frames) {
  const by = new Map();
  frames.forEach((f, i) => f.list.forEach((t) => (by.has(t.id) ? by.get(t.id) : by.set(t.id, []).get(t.id)).push({ i, at: f.at, hash: f.hash, defined: f.defined, ...t })));
  const out = [];
  for (const [id, rows] of by) {
    const seenRows = rows.filter((r) => r.on);
    if (!seenRows.length) continue;
    const blank = seenRows.filter((r) => !r.drawn);
    const drawnRows = seenRows.filter((r) => r.drawn);
    const firstDrawn = drawnRows[0];
    const fade = firstDrawn ? drawnRows.filter((r) => r.at - firstDrawn.at <= 600).map((r) => [r.at - firstDrawn.at, r.opacity]) : [];
    out.push({ id, state: seenRows[0].state, size: seenRows[0].size, hash: seenRows[0].hash, seenAt: seenRows[0].at, blank: blank.length, blankAt: blank.length ? [blank[0].at, blank.at(-1).at] : null, definedWhenSeen: seenRows[0].defined, fade });
  }
  return out;
}
const said = (tintas) => tintas.map((t) => `${t.hash || "#today"} ${t.state} ${t.size}: ${t.blank ? `${t.blank} frames with nothing drawn (${t.blankAt.join("–")} ms)` : "drawn from its first frame"}`).join("; ");

// ---------- an account with the sample learner ----------
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const errors = [];
async function account({ serviceWorkers, label }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, colorScheme: "dark", serviceWorkers });
  await context.addInitScript(RECORDER);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', `Tinta Arrive ${label}`);
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  // An AI connected (a personal token), the AI tab in Read's place.
  await page.evaluate(async () => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Tinta arrive check" }) }));
  await page.evaluate(() => localStorage.setItem("lx.shell.v1", JSON.stringify({ third: "ai" })));
  const made = await page.evaluate(async (preset) => {
    const start = await import("/js/study/sample-start.js");
    const until = Date.now() + 180_000;
    let why = await start.sampleReady();
    while (why && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 1000));
      why = await start.sampleReady();
    }
    if (why) return { why };
    return { counts: await start.startSample(preset, { reload: false }) };
  }, PRESET);
  if (made.why) {
    console.error(`the sample learner can't start here: ${made.why}`);
    process.exit(2);
  }
  return { context, page, cdp };
}

/** A start of the app at `route`, the processor slowed: the frames until it's been ready for `settle` ms. */
async function startAt({ page, cdp }, route, { settle = 3500 } = {}) {
  await page.goto(`${BASE}/robots.txt`);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  try {
    await page.goto(`${BASE}/app/${route}`, { waitUntil: "commit" });
    await page.waitForSelector("html[data-app-ready]", { timeout: 120_000 });
    await page.waitForTimeout(settle);
    return await page.evaluate(() => ({ frames: globalThis.__arrive.frames, takeovers: globalThis.__arrive.takeovers }));
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
}

/** A first visit to `route` in the running app, the processor slowed: the frames from the press on, for 2.5 s. With `tinta`, for as long
 * as it takes a Tinta of that page to be seen drawn and a second more (its fade), 2.5 s at least and 8 s at most: a slowed phone draws the
 * AI tab's 1.2–2.7 s after the visit, so a fixed 2.5 s ended before some runs had seen it. */
async function visit({ page, cdp }, route, { tinta = false } = {}) {
  const from = await page.evaluate(() => globalThis.__arrive.frames.length);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  try {
    await page.evaluate((hash) => (location.hash = hash), route);
    const start = Date.now();
    let drawnAt = null;
    while (Date.now() - start < (tinta ? 8000 : 2500)) {
      await page.waitForTimeout(250);
      if (!tinta) continue;
      if (drawnAt === null) {
        const drawn = await page.evaluate(
          ({ from, route }) => globalThis.__arrive.frames.slice(from).some((f) => (f.hash === route || (route === "#today" && !f.hash)) && f.list.some((t) => t.on && t.drawn)),
          { from, route },
        );
        if (drawn) drawnAt = Date.now();
      }
      if (drawnAt !== null && Date.now() - start >= 2500 && Date.now() - drawnAt >= 1000) break;
    }
    return await page.evaluate((from) => globalThis.__arrive.frames.slice(from), from);
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
}

// ---------- with the app's worker, as a phone has it ----------
const A = await account({ serviceWorkers: "allow", label: "worker" });
// Once, so the worker has the shell (every start after a phone's first).
await A.page.reload({ waitUntil: "domcontentloaded" });
await A.page.waitForSelector("html[data-app-ready]", { timeout: 120_000 });
await A.page.waitForTimeout(3000);
const STARTS = ["#today", "#study/path", "#ai"];
const record = {};

await stage(`a start into each page with a Tinta (${STARTS.join(", ")}), the processor slowed ${CPU}×: every Tinta drawn in every frame it's seen`, async () => {
  const lines = [];
  for (const route of STARTS) {
    const { frames } = await startAt(A, route);
    const tintas = tintasIn(frames);
    record[`start ${route}`] = tintas;
    assert(tintas.length, `${route}: no Tinta seen`);
    lines.push(said(tintas));
  }
  const bad = Object.values(record).flat().filter((t) => t.blank);
  assert(!bad.length, lines.join(" | "));
  return lines.join(" | ");
});

const VISITS = ["#today", "#study", "#study/path", "#ai", "#settings/reminders"];
await stage(`a start into a page with none (Settings), then a first visit to each page with one (${VISITS.join(", ")}): every Tinta drawn in every frame it's seen`, async () => {
  const { frames } = await startAt(A, "#settings", { settle: 1500 });
  assert(!tintasIn(frames).length, "Settings has a Tinta of its own now: start somewhere else");
  const lines = [];
  const found = [];
  for (const route of VISITS) {
    const tintas = tintasIn(await visit(A, route, { tinta: true })).filter((t) => t.hash === route || (route === "#today" && !t.hash));
    record[`visit ${route}`] = tintas;
    assert(tintas.length, `${route}: no Tinta seen`);
    found.push(...tintas);
    lines.push(said(tintas));
  }
  assert(!found.some((t) => t.blank), lines.join(" | "));
  return lines.join(" | ");
});
await stage("an empty state with a drawing (Explore's search finding nothing): the drawing's box from its first frame, never Tinta first with the drawing put over it", async () => {
  const frames = await visit(A, "#explore/browse?lang=nl&q=zzqqxv");
  const by = new Map();
  for (const f of frames) for (const e of f.empties ?? []) (by.has(e.id) ? by.get(e.id) : by.set(e.id, []).get(e.id)).push({ at: f.at, ...e });
  const rows = [...by.values()].find((r) => r.some((e) => e.art || e.drawing)) ?? [...by.values()][0];
  assert(rows?.length, "no empty state seen");
  const first = rows[0];
  const heights = [...new Set(rows.map((e) => e.h))];
  const tintaFirst = rows.filter((e) => e.tinta && !e.drawing).length;
  const drawnAt = rows.find((e) => e.drawing)?.at;
  const told = `first seen at ${first.at} ms with ${first.art ? "the drawing's box" : "no box"}${first.tinta ? " and Tinta" : ""}; the drawing in at ${drawnAt === undefined ? "never" : `${drawnAt - first.at} ms`}; heights ${heights.join(" → ")} px; Tinta seen ${tintaFirst} frames`;
  assert(first.art, told);
  assert(heights.length === 1, told);
  assert(drawnAt !== undefined && !tintaFirst, told);
  return told;
});
await A.context.close();

// ---------- Tinta's drawing held back (no worker, so the page's requests can be held) ----------
const B = await account({ serviceWorkers: "block", label: "held" });
let holding = 0;
await B.context.route("**/js/character/character.js*", async (route) => {
  if (holding) await new Promise((r) => setTimeout(r, holding));
  await route.continue();
});
const keptKinds = () => B.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("lx.tinta.firsts.v1") ?? "{}").kinds ?? {}));
async function heldStart(route) {
  holding = HOLD;
  try {
    return await startAt(B, route, { settle: HOLD + 1500 });
  } finally {
    holding = 0;
  }
}

await stage(`Tinta's drawing held back ${HOLD / 1000} s (past the start's wait), its first frames kept from a start before: each Tinta holds its kept first frame from the first frame it's seen, and the live Tinta takes over with the same picture`, async () => {
  // A start that keeps them (a second after each is drawn, written two later).
  await startAt(B, "#today", { settle: 4000 });
  const kinds = await keptKinds();
  assert(kinds.length, "no first frame kept after a start");
  const { frames, takeovers } = await heldStart("#today");
  const tintas = tintasIn(frames);
  record["held, kept"] = { tintas, takeovers, kinds };
  assert(tintas.length, "no Tinta seen");
  assert(tintas.every((t) => !t.definedWhenSeen), `Tinta's code had come before the page was seen (the hold didn't hold): ${said(tintas)}`);
  assert(!tintas.some((t) => t.blank), `${said(tintas)} (kept: ${kinds.join(", ")})`);
  assert(takeovers.length >= tintas.length, `the live Tinta never took over: ${JSON.stringify(takeovers)}`);
  const changed = takeovers.filter((t) => !t.same);
  assert(!changed.length, `the live Tinta's first frame isn't the one it held: ${JSON.stringify(changed)}`);
  return `${said(tintas)}; the live Tinta took over after ${takeovers.map((t) => `${t.heldMs} ms (${t.state}), the same picture`).join(", ")}`;
});

await stage(`the same with nothing kept (a first open): Tinta fades in when its drawing comes, never popping into its place`, async () => {
  await B.page.evaluate(() => localStorage.removeItem("lx.tinta.firsts.v1"));
  const { frames } = await heldStart("#today");
  const tintas = tintasIn(frames);
  record["held, none kept"] = tintas;
  assert(tintas.length, "no Tinta seen");
  const lines = [];
  for (const t of tintas) {
    const [, o0] = t.fade[0] ?? [];
    const full = t.fade.find(([, o]) => o >= 0.99);
    lines.push(`${t.state} ${t.size}: first drawn at opacity ${o0?.toFixed(2)}, whole after ${full?.[0] ?? "never"} ms`);
    assert(o0 !== undefined && o0 <= 0.4, `it popped in: ${lines.at(-1)}`);
    assert(full && full[0] <= 450, `it never finished fading in: ${lines.at(-1)}`);
  }
  return lines.join("; ");
});

await stage(`Animations Off (a device asking for reduced motion): its still in the first frame, and the kept still while the drawing is held back`, async () => {
  await B.page.emulateMedia({ reducedMotion: "reduce" });
  try {
    const plain = tintasIn((await startAt(B, "#today", { settle: 4000 })).frames);
    assert(plain.length && !plain.some((t) => t.blank), `a plain start: ${said(plain)}`);
    const kinds = await keptKinds();
    assert(kinds.some((k) => k.endsWith("|still")), `no still kept: ${kinds.join(", ")}`);
    const { frames, takeovers } = await heldStart("#today");
    const tintas = tintasIn(frames);
    record["held, still"] = { tintas, takeovers };
    assert(!tintas.some((t) => t.blank), said(tintas));
    const changed = takeovers.filter((t) => !t.same);
    assert(takeovers.length && !changed.length, `the still it held isn't the one Tinta draws: ${JSON.stringify(takeovers)}`);
    return `a plain start: ${said(plain)}; held: ${said(tintas)}, the same still after ${takeovers.map((t) => `${t.heldMs} ms`).join(", ")}`;
  } finally {
    await B.page.emulateMedia({ reducedMotion: "no-preference" });
  }
});
await B.context.close();

await stage("no page errors", async () => {
  assert(!errors.length, errors.slice(0, 3).join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "tinta-arrive.json"), JSON.stringify({ cpu: CPU, preset: PRESET, results, record }, null, 1));
console.log(`${results.length - failed}/${results.length} stages passed`);
process.exit(failed ? 1 : 0);
