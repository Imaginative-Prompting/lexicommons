// Checks syncing through your own storage (public/js/sync.js) on two devices of one account, in headless Chrome on a
// LOCAL server (it creates and deletes a test account, so never point it at the live site). The storage is Dropbox as
// this script plays it (its list, upload and download calls answered from memory, two files to a page of a listing, a
// write at the wrong rev refused as Dropbox refuses it), shared by both devices, so nothing reaches a real Dropbox.
// What it checks, through the app's own pages and Study sessions: Settings → Storage saying what's kept there and when
// it last synced; study progress and your packs reaching the other device (each writing a file of its own), the
// answers in the same order and every unit replayed the same on both; a clash on a device's own file (another browser
// with its id) read and merged (every device syncs through the account's own copy too, from v681: no storage of your own
// still syncs through it, and clearing reaches every device through it); a pack deleted on one device (its relay out of reach) staying deleted after the other
// syncs; a pack your AI made reaching a device through the storage before the relay, and the relay's change then
// reported applied, not refused; a pack deleted by a file in the storage kept for 30 days and restored; recordings your
// AI made reaching a device that missed them on the relay through the storage alone (files of their own, checked by
// their bytes) and playing there; clearing study progress everywhere (the sheet saying so) covering answers made on the
// other device while it was away, staying cleared through more syncs while later answers go on syncing, and Undo on
// the other device bringing it all back everywhere; a second tab following without keeping anything twice; and
// disconnecting; and the reader's: where you are in a text, a highlight with its note and your words reaching the
// other device, a highlight removed on one staying removed on the other (live in its open reader) and kept there to
// restore for 30 days, Restore bringing it back on both, a word taken out and added again; and with the account's copy refused at the browser
// (switched off or full), Dropbox alone carrying a session's answers, a new pack and a deletion to the other device, the same with Dropbox out
// of reach too reaching nothing (its control). Fails on any console error.
// Chrome runs muted.
// Usage (headless Chrome, through the channel's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "sync check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/sync-check.mjs http://localhost:<port> <outDir>

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";
import { playToSummary } from "./fixtures/play-session.mjs";

const [BASE, OUT = "sync-check-out"] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("sync-check creates and deletes an account: give it a local server, e.g. http://localhost:8825");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });
const HERE = dirname(fileURLToPath(import.meta.url));
const NL = JSON.parse(readFileSync(join(HERE, "fixtures/packs/check-nl.json"), "utf8"));

const results = [];
const problems = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, ms: Date.now() - started, error: String(error?.stack ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Dropbox, played from memory ----------

const TOKEN = "sync-check-token";
const dropbox = {
  files: new Map(), // name → { bytes, rev, modified }
  revs: 0,
  log: [], // { device, call, name?, status }
  clash: null, // { device, inject(name) }: before that device's next upload, another writer gets in first
  down: new Set(), // devices whose storage is out of reach (every call answers 503)
  refuse: null, // (device, name) → true: that upload answers 503
};
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Expose-Headers": "*" };
const meta = (name) => ({ ".tag": "file", name, rev: dropbox.files.get(name).rev, size: dropbox.files.get(name).bytes.length, server_modified: dropbox.files.get(name).modified });
const putFile = (name, bytes) => dropbox.files.set(name, { bytes, rev: `r${(++dropbox.revs).toString(16).padStart(9, "0")}`, modified: new Date().toISOString().slice(0, 19) + "Z" });
const PAGE = 2; // files to a page of a listing, so every listing takes its continue calls

function dropboxFor(device) {
  return async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(request.url()).pathname;
    const json = (status, body, name) => {
      dropbox.log.push({ device, call: path, name, status });
      return route.fulfill({ status, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    };
    if (request.headers().authorization !== `Bearer ${TOKEN}`) return json(401, { error_summary: "invalid_access_token/" });
    if (dropbox.down.has(device)) return json(503, { error_summary: "out of reach for this check" });
    const arg = () => JSON.parse(request.headers()["dropbox-api-arg"] ?? "{}");
    if (path === "/2/files/list_folder" || path === "/2/files/list_folder/continue") {
      const from = path.endsWith("continue") ? Number(request.postDataJSON().cursor) : 0;
      const names = [...dropbox.files.keys()].sort();
      const entries = names.slice(from, from + PAGE).map(meta);
      return json(200, { entries, cursor: String(from + PAGE), has_more: from + PAGE < names.length });
    }
    if (path === "/2/files/upload") {
      const { path: file, mode } = arg();
      const name = file.slice(1);
      if (dropbox.clash?.device === device) {
        const { inject } = dropbox.clash;
        dropbox.clash = null;
        // (A check's own mistake here is reported by its stage, never thrown inside the route.)
        try {
          inject(name);
        } catch (error) {
          dropbox.clashError = error;
        }
      }
      if (dropbox.refuse?.(device, name)) return json(503, { error_summary: "too_many_write_operations/.." }, name);
      const here = dropbox.files.get(name);
      const clashes = mode === "add" ? Boolean(here) : mode?.[".tag"] === "update" ? !here || here.rev !== mode.update : false;
      if (clashes) return json(409, { error_summary: "path/conflict/file/..", error: { ".tag": "path", reason: { ".tag": "conflict", conflict: { ".tag": "file" } } } }, name);
      putFile(name, request.postDataBuffer() ?? Buffer.alloc(0));
      return json(200, meta(name), name);
    }
    if (path === "/2/files/download") {
      const name = arg().path.slice(1);
      if (!dropbox.files.has(name)) return json(409, { error_summary: "path/not_found/.." }, name);
      dropbox.log.push({ device, call: path, name, status: 200 });
      return route.fulfill({ status: 200, headers: { ...CORS, "Content-Type": "application/octet-stream", "Dropbox-API-Result": JSON.stringify(meta(name)) }, body: dropbox.files.get(name).bytes });
    }
    if (path === "/2/auth/token/revoke") return json(200, null);
    return json(400, { error_summary: `not played here: ${path}` });
  };
}
const fileJson = (name) => JSON.parse(dropbox.files.get(name).bytes.toString("utf8"));
const fileNames = () => [...dropbox.files.keys()].sort();

// ---------- two devices ----------

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const blocked = new Set(); // pages whose relay calls this script is failing on purpose (their console says so)
// A write Dropbox refuses for a newer rev (409) is how a clash shows; the sync reads, merges and writes again.
const clashed = (m) => /status of 409/.test(m.text()) && (m.location()?.url ?? "").startsWith("https://content.dropboxapi.com/2/files/upload");
function watch(p, name) {
  p.on("console", (m) => {
    // With the address it was about (a 404's text names no file).
    if (m.type() === "error" && !(blocked.has(p) && /status of 503/.test(m.text())) && !clashed(m)) problems.push(`${name} console: ${m.text()}${m.location()?.url ? ` (${m.location().url})` : ""}`);
  });
  p.on("pageerror", (e) => problems.push(`${name} page error: ${e.message}`));
}
async function device(name, storageState) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, storageState });
  await context.route(/^https:\/\/(api|content)\.dropboxapi\.com\//, dropboxFor(name));
  const page = await context.newPage();
  watch(page, name);
  return { name, context, page };
}
const A = await device("A");
const cdp = await A.context.newCDPSession(A.page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
let B = null;

const strayText = [];
async function shot(p, name) {
  const found = await p.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/^\s*(null|undefined)+\s*$/.test(node.textContent)) hits.push(node.parentElement?.getAttribute("data-part") ?? node.parentElement?.tagName);
    return hits;
  });
  for (const where of found) strayText.push(`${name}: in ${where}`);
  await p.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
  await p.screenshot({ path: join(OUT, "shots", `${name}.png`) });
}

// ---------- the app's own modules, read from a page ----------

const evidence = (p) => p.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().map(({ id: _id, ...row }) => row));
/** Every studied unit's whole state at one moment, and the calibration: what the scheduler made of the evidence. */
const replayed = (p, now) =>
  p.evaluate(async (now) => {
    const progress = await import("/js/study/progress.js");
    const units = progress.studiedUnits("nl").sort();
    return { units: units.map((u) => progress.unitState(u, { lang: "nl", now })), calibration: progress.calibration({ stored: false }) };
  }, now);
/** What IndexedDB holds: rows and distinct keys (nothing kept twice), next to what's in memory. */
const stored = (p) =>
  p.evaluate(async () => {
    const progress = await import("/js/study/progress.js");
    const rows = await new Promise((resolve, reject) => {
      const open = indexedDB.open("lexicommons-study", 2);
      open.onsuccess = () => {
        const request = open.result.transaction("evidence").objectStore("evidence").getAll();
        request.onsuccess = () => {
          open.result.close();
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
      };
      open.onerror = () => reject(open.error);
    });
    return { rows: rows.length, keys: new Set(rows.map(progress.evidenceKey)).size, memory: progress.allEvidence().length };
  });
const syncNow = (p) => p.evaluate(async () => (await import("/js/sync.js")).syncNow());
/** Polls fn in a page until it's true (waitForFunction takes an async function's promise as true at once). */
async function until(p, fn, arg, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (!(await p.evaluate(fn, arg))) {
    if (Date.now() > end) throw new Error(`still not true after ${timeout / 1000} s: ${fn.toString().slice(0, 140)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}
const yourPack = (p, id) => p.evaluate(async (id) => (await import("/js/study/packs.js")).yourPack(id), id);
const takeNow = (p) => p.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
const pageText = (p) => p.locator('[data-part="page"]').innerText();
// (A goto to the hash the page is on does nothing: it's loaded again instead.)
const goSettings = async (p, hash, text) => {
  if (new URL(p.url()).hash === hash) await p.reload();
  else await p.goto(`${BASE}/app/${hash}`);
  await p.waitForFunction((t) => document.querySelector('[data-part="page"]')?.textContent.includes(t), text);
};
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const row = (p, title) => p.locator('[data-part="list-row"]', { has: p.locator(".lx-row-title", { hasText: new RegExp(`^${escape(title)}$`) }) }).first();
const rowSub = async (p, title) => (await row(p, title).locator(".lx-row-sub").textContent())?.trim();
// Settings → Storage's row of when it last synced, and through what.
const syncRow = (p) => p.locator('[data-part="list-row"]', { has: p.locator(".lx-row-title", { hasText: /^(Last synced |Not synced yet$|Syncing…$)/ }) }).first();
// What's kept in your storage and how it syncs: a sheet, behind its row.
const openKept = async (p) => {
  await row(p, "What's kept there").click();
  await p.locator('[data-part="sheet"]').waitFor();
};
const closeSheet = async (p) => {
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => !document.querySelector('[data-part="sheet"]'));
};

// ---------- a Study session, played by scripts/fixtures/play-session.mjs (each step by its kind, never its words) ----------

const SESSION = '[data-part="session"]:not([data-ghost])';
/** Plays a quick session to its summary on a device. Returns how many rows it recorded. */
async function study(p) {
  const before = (await evidence(p)).length;
  if (new URL(p.url()).hash === "#study/session/quick") {
    await p.goto(`${BASE}/app/#today`);
    await p.waitForFunction(() => location.hash === "#today" && !document.querySelector('[data-part="session"]:not([data-ghost])'));
  }
  await p.goto(`${BASE}/app/#study/session/quick`);
  await p.waitForSelector('[data-part="session"]');
  await playToSummary(p, { session: SESSION });
  const after = (await evidence(p)).length;
  assert(after > before, "the session recorded answers");
  return after - before;
}

// Both devices' answers and what the scheduler makes of them, compared.
async function bothTheSame(now = Date.now()) {
  const [ea, eb] = [await evidence(A.page), await evidence(B.page)];
  assert(ea.length === eb.length, `A has ${ea.length} answers, B ${eb.length}`);
  assert(same(ea, eb), "the answers differ (or are in a different order) between the devices");
  const [ra, rb] = [await replayed(A.page, now), await replayed(B.page, now)];
  assert(same(ra, rb), "the scheduler made something different of them on the two devices");
  for (const d of [A, B]) {
    const s = await stored(d.page);
    assert(s.rows === s.memory && s.keys === s.rows, `${d.name}: IndexedDB has ${s.rows} rows (${s.keys} keys), memory ${s.memory}`);
  }
  return { answers: ea.length, units: ra.units.length };
}

// ---------- the run ----------

let tag = null;

await stage("sign up on one device; a second device signs in to the same account", async () => {
  await A.page.goto(`${BASE}/app/`);
  await A.page.waitForURL(/\/login\?next=/);
  await A.page.click("summary");
  await A.page.fill('input[name="name"]', "Sync Check");
  await A.page.click('#register button[type="submit"]');
  await A.page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await A.page.waitForSelector("html[data-app-ready]");
  // The same sign-in, nothing else of the first device's: a device of its own.
  const state = await A.context.storageState();
  state.origins = state.origins.map((o) => ({ ...o, localStorage: o.localStorage.filter((e) => !e.name.startsWith("lx.")) }));
  B = await device("B", state);
  await B.page.goto(`${BASE}/app/`);
  await B.page.waitForSelector("html[data-app-ready]");
  return "two devices, one account";
});

await stage("Settings → Storage with no storage of your own: syncing through your account alone (v681), and what would be kept there", async () => {
  await goSettings(A.page, "#settings/storage", "What's kept there");
  await syncRow(A.page).waitFor();
  assert((await syncRow(A.page).locator(".lx-row-sub").textContent())?.trim() === "Through your account", `the sync row: ${await syncRow(A.page).innerText()}`);
  await shot(A.page, "01-storage-not-connected");
  await openKept(A.page);
  assert((await rowSub(A.page, "Study progress")) === "0 answers on this device", `progress: ${await rowSub(A.page, "Study progress")}`);
  assert((await rowSub(A.page, "Your packs")) === "0 packs on this device", `packs: ${await rowSub(A.page, "Your packs")}`);
  await closeSheet(A.page);
  await goSettings(A.page, "#settings/data", "Download everything");
  assert((await row(A.page, "Clear study progress everywhere").count()) === 1, "clearing reaches every device through the account");
  return "through your account; Study progress and Your packs listed";
});

await stage("Dropbox connected on both; one device studies and saves a pack; Settings → Storage says what's kept and when it last synced", async () => {
  for (const d of [A, B]) {
    await d.page.evaluate((token) => localStorage.setItem("lc_storage_dropbox", JSON.stringify({ accessToken: token, refreshToken: "sync-check-refresh", expiresAt: Date.now() + 86_400_000 })), TOKEN);
    await d.page.reload();
    await d.page.waitForSelector("html[data-app-ready]");
  }
  const answered = await study(A.page);
  const saved = await A.page.evaluate(async (pack) => (await import("/js/study/packs.js")).savePack(pack, { by: "sync check" }), NL);
  assert(saved.ok, JSON.stringify(saved));
  await goSettings(A.page, "#settings/storage", "What's kept there");
  await row(A.page, "Not synced yet").or(A.page.locator(".lx-row-title", { hasText: /^Last synced / })).first().waitFor();
  await A.page.getByRole("button", { name: "Sync now" }).click();
  // With the account's own copy (v681), a sync goes through it and Dropbox.
  await A.page.locator('[role="status"]', { hasText: "Synced with your account and Dropbox" }).waitFor();
  const text = await pageText(A.page);
  assert(/Last synced /.test(text), "it says when it last synced");
  assert(/^Synced /.test(await rowSub(A.page, "Dropbox")), "the Dropbox row says when it synced");
  await shot(A.page, "02-storage-synced");
  const answers = (await evidence(A.page)).length;
  await openKept(A.page);
  assert((await rowSub(A.page, "Study progress")) === `${answers} answers on this device`, `progress: ${await rowSub(A.page, "Study progress")}`);
  assert((await rowSub(A.page, "Your packs")) === "1 pack on this device", `packs: ${await rowSub(A.page, "Your packs")}`);
  const kept = await A.page.locator('[data-part="sheet"]').innerText();
  assert(kept.includes("the later change wins, going by each device's clock"), "it says how a clash is settled");
  await closeSheet(A.page);
  // The files: one per kind (progress by month, packs by pack), named for the account by a hash, never its id; never one file of every pack
  // (the form before 12 Nov 2026, still read).
  const names = fileNames();
  const account = await A.page.evaluate(async () => (await (await fetch("/api/me")).json()).user.id);
  const deviceA = await A.page.evaluate(() => localStorage.getItem("lx.sync.device.v1"));
  tag = names.map((n) => n.match(new RegExp(`^lexicommons-packs\\.check-nl\\.([0-9a-f]{8})\\.${deviceA}\\.json$`))).find(Boolean)?.[1];
  assert(tag, `a packs file of A's for its pack: ${names}`);
  assert(!names.some((n) => new RegExp(`^lexicommons-packs\\.[0-9a-f]{8}\\.[0-9a-f]{8}\\.json$`).test(n)), `no file of every pack: ${names}`);
  assert(names.some((n) => new RegExp(`^lexicommons-progress\\.\\d{4}-\\d{2}\\.${tag}\\.${deviceA}\\.json$`).test(n)), `a progress file of A's: ${names}`);
  assert(!names.some((n) => n.includes(account)), "no file names the account");
  return `${answered} answers and a pack; files: ${names.join(", ")}`;
});

await stage("the other device takes them: the same answers in the same order, every unit replayed the same, the pack", async () => {
  await goSettings(B.page, "#settings/storage", "What's kept there");
  await B.page.getByRole("button", { name: "Sync now" }).click();
  await B.page.locator('[role="status"]', { hasText: "Synced with your account and Dropbox" }).waitFor();
  const result = await bothTheSame();
  const [pa, pb] = [await yourPack(A.page, "check-nl"), await yourPack(B.page, "check-nl")];
  assert(pb && same(pa, pb), `B's copy of the pack: ${JSON.stringify(pb)?.slice(0, 200)}`);
  await goSettings(B.page, "#study/packs", "Find packs in Explore");
  assert((await B.page.locator('a[data-part="list-row"][href^="#settings/study/packs/"]', { hasText: "A check pack (Dutch)" }).count()) === 1, "B's packs page lists it");
  return result;
});

await stage("both devices study; after syncs both ways they have the same answers and replay them the same", async () => {
  const b = await study(B.page);
  const a = await study(A.page);
  await syncNow(A.page);
  await syncNow(B.page);
  await syncNow(A.page);
  return { a, b, ...(await bothTheSame()) };
});

await stage("a clash on a device's own file (another browser with its id; Dropbox refuses the old rev) is read and merged, not written over", async () => {
  // While B is writing, another browser with B's id adds an answer to the same month's file of B's.
  const deviceB = await B.page.evaluate(() => localStorage.getItem("lx.sync.device.v1"));
  const third = { at: Date.now() - 60_000, v: 2, lang: "nl", concept: "w:fiets", skill: "read", outcome: "right", test: "recall", help: "none", activity: "test", uid: "0f1e2d3c4b5a6978" };
  const month = new Date(third.at).toISOString().slice(0, 7);
  const thirdKey = `${month}:${third.uid}`;
  let injected = null;
  dropbox.clash = {
    device: "B",
    inject(name) {
      if (name !== `lexicommons-progress.${month}.${tag}.${deviceB}.json`) throw new Error(`B wrote ${name} first`);
      const file = fileJson(name);
      file.records[thirdKey] = { at: third.at, value: third };
      putFile(name, Buffer.from(JSON.stringify(file)));
      injected = name;
    },
  };
  const before = dropbox.log.length;
  await study(B.page);
  await syncNow(B.page);
  assert(!dropbox.clashError, `the other write: ${dropbox.clashError?.message}`);
  assert(injected, "the other write happened");
  // (B syncs on its own during the session too, so its later uploads of the file are there as well.)
  const uploads = dropbox.log.slice(before).filter((e) => e.device === "B" && e.call === "/2/files/upload" && e.name === injected).map((u) => u.status);
  assert(uploads[0] === 409 && uploads.length > 1 && uploads.slice(1).every((s) => s === 200), `B's uploads of it: ${uploads}`);
  assert(fileJson(injected).records[thirdKey], "the third device's answer is still in the file");
  assert((await evidence(B.page)).some((r) => r.uid === third.uid), "B took it");
  await syncNow(A.page);
  return { ...(await bothTheSame()), uploads: uploads.join(", ") };
});

await stage("a pack deleted on one device (its relay out of reach) stays deleted after the other syncs", async () => {
  // The relay can't be reached from A: the delete goes from A only, and Dropbox carries it.
  const fail = (route) => (route.request().method() === "POST" ? route.fulfill({ status: 503, body: "out of reach for this check" }) : route.continue());
  await A.page.route("**/api/packs/changes", fail);
  blocked.add(A.page);
  try {
    await goSettings(A.page, "#settings/study/packs/check-nl", "Delete this pack");
    await row(A.page, "Delete this pack").click();
    await row(A.page, "Press again to delete it").click();
    await A.page.waitForFunction(() => location.hash === "#study/packs");
  } finally {
    await A.page.unroute("**/api/packs/changes", fail);
    blocked.delete(A.page);
  }
  assert(!(await yourPack(A.page, "check-nl")), "gone from A");
  await syncNow(A.page);
  await syncNow(B.page);
  assert(!(await yourPack(B.page, "check-nl")), "gone from B after its sync");
  for (let i = 0; i < 2; i++) {
    await syncNow(A.page);
    await syncNow(B.page);
  }
  assert(!(await yourPack(A.page, "check-nl")) && !(await yourPack(B.page, "check-nl")), "still gone on both after more syncs");
  const deviceA = await A.page.evaluate(() => localStorage.getItem("lx.sync.device.v1"));
  const record = fileJson(`lexicommons-packs.check-nl.${tag}.${deviceA}.json`).records["check-nl"];
  assert(record?.gone === true && !("value" in record) && record.about?.edits === 2, `A's file keeps the deletion (saved here, then deleted here: two edits): ${JSON.stringify(record)}`);
  await goSettings(B.page, "#study/packs", "Find packs in Explore");
  assert((await B.page.locator('a[data-part="list-row"][href^="#settings/study/packs/"]', { hasText: "A check pack (Dutch)" }).count()) === 0, "B's packs page doesn't list it");
  return "deleted on A, gone from B, and it stays gone";
});

// Your AI, over MCP with a personal token (as packs-check.mjs plays it).
let token = null;
async function tool(name, args = {}) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${name}: ${response.status} ${text.slice(0, 200)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error || result.isError) throw new Error(`${name}: ${error?.message ?? result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}

await stage("your AI's new pack reaches a device through Dropbox before the relay: the relay's change is then reported applied, not refused", async () => {
  token = await A.page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Sync check" }) })).json()).token);
  assert(token?.startsWith("lct_"), "a token for the AI");
  // As the AI section's page does on making one: the device learns it has an AI (shell/layout.js), which sets its polls' pace.
  for (const p of [A.page, B.page]) {
    await p.evaluate(async () => {
      const { whoAmI } = await import("/js/shell/api.js");
      const { setAiConnected } = await import("/js/shell/layout.js");
      setAiConnected((await whoAmI()).aiConnected);
    });
  }
  await takeNow(A.page);
  await takeNow(B.page);
  // B can't take changes from the relay for a while (its poll fails); it can still say it's here.
  const fail = (route) => route.fulfill({ status: 503, body: "out of reach for this check" });
  await B.page.route("**/api/packs/inbox*", fail);
  blocked.add(B.page);
  let made;
  try {
    made = await tool("create_pack", {
      name: "Trip sync",
      language: "nl",
      items: [{ sentence: "Waar is het station?", lemmas: { waar: "waar", station: "station" }, literal: ["Where", "is", "the station?"], english: [0, 1, 2], natural: "Where is the station?", wrong: ["Waar het station is?", "Is waar het station?"], gap: { word: "is", options: ["is", "zijn", "ben"] }, topic: "travel", patterns: ["question"] }],
      topics: { travel: "Travel" },
      // Its words glossed, so a Match step that draws on it can be answered.
      words: { waar: "where", station: "station" },
    });
    await takeNow(A.page);
    assert(await yourPack(A.page, made.pack_id), "A took it from the relay");
    await syncNow(A.page);
    assert(await yourPack(A.page, made.pack_id), "A still has it after its sync");
    // B's copy waits until B hears how far the relay has got (it says it's here to ask), then its next sync takes it.
    await syncNow(B.page);
    assert(await yourPack(A.page, made.pack_id), "A still has it after B's sync");
    await until(B.page, async (id) => Boolean((await import("/js/study/packs.js")).yourPack(id)), made.pack_id);
    const [onB, onA] = [await yourPack(B.page, made.pack_id), await yourPack(A.page, made.pack_id)];
    assert(onA, `A lost it by the time B had it: ${JSON.stringify(await A.page.evaluate(async (id) => { const p = await import("/js/study/packs.js"); const s = await import("/js/sync.js"); return { here: p.yourPacks().map((r) => r.id), status: s.syncStatus().kinds, hash: location.hash }; }, made.pack_id))}`);
    const differ = Object.keys({ ...onA, ...onB }).filter((k) => !same(onA[k], onB[k]));
    assert(!differ.length, `B has A's copy, through Dropbox (differ: ${differ.map((k) => `${k} A=${JSON.stringify(onA[k])?.slice(0, 80)} B=${JSON.stringify(onB[k])?.slice(0, 80)}`).join("; ")})`);
  } finally {
    await B.page.unroute("**/api/packs/inbox*", fail);
    blocked.delete(B.page);
  }
  await takeNow(B.page);
  const [change] = await tool("list_pack_changes", { pack_id: made.pack_id });
  const states = change.devices.map((d) => d.state).sort();
  assert(same(states, ["applied", "applied"]), `the devices' reports: ${JSON.stringify(change.devices)}`);
  const pack = await yourPack(B.page, made.pack_id);
  assert(pack.pack.items.length === 1 && same(pack, await yourPack(A.page, made.pack_id)), "taken once: the same pack on both");
  return `${made.pack_id}: applied on both, one sentence`;
});

await stage("a pack deleted by a file in the storage is kept on the device for 30 days, and Restore brings it back everywhere", async () => {
  const [made] = (await A.page.evaluate(async () => (await import("/js/study/packs.js")).yourPacks().map((r) => r.id))).filter((id) => id === "trip-sync");
  assert(made, "the pack your AI made is here");
  const here = await yourPack(B.page, made);
  // A file no device of the account wrote, deleting it (in the one-file form from before 12 Nov 2026, which is still read).
  putFile(`lexicommons-packs.${tag}.0badf11e.json`, Buffer.from(JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "packs", account: tag, records: { [made]: { at: here.changedAt + 1, gone: true, about: { changes: here.changes, edits: here.edits + 1, through: here.through } } } })));
  await syncNow(B.page);
  assert(!(await yourPack(B.page, made)), "it's gone from B");
  await goSettings(B.page, "#study/packs", "Find packs in Explore");
  const kept = row(B.page, here.pack.name);
  assert(/^Deleted .+ · you can restore it until .+$/.test(await rowSub(B.page, here.pack.name)), `the row: ${await rowSub(B.page, here.pack.name)}`);
  await shot(B.page, "07-deleted-elsewhere");
  await kept.getByRole("button", { name: "Restore" }).click();
  await B.page.getByText(`${here.pack.name} is back`).first().waitFor();
  assert(await yourPack(B.page, made), "back on B");
  await syncNow(B.page);
  await syncNow(A.page);
  assert(await yourPack(A.page, made), "and on A");
  return `${made}: deleted by the file, restored from B, on both`;
});

await stage("your AI's recordings reach a device that missed them on the relay through your storage alone, checked by their bytes, and play there", async () => {
  const id = "trip-sync";
  const read = await tool("get_pack", { pack_id: id });
  const [item] = read.items;
  const bytes = ["boek-gelezen.mp3", "w-gisteren.mp3"].map((name) => readFileSync(join(HERE, "../public/audio/starter-word-order/emma", name)));
  const names = bytes.map((b) => `${createHash("sha256").update(b).digest("hex").slice(0, 16)}.mp3`);
  const ups = [];
  for (const [n, body] of bytes.entries()) {
    const ticket = await tool("request_pack_audio_upload", { pack_id: id, format: "mp3", filename: `clip-${n}.mp3` });
    const put = await fetch(ticket.upload_url, { method: "PUT", headers: { "Content-Type": ticket.content_type }, body });
    assert(put.ok, `upload ${n}: ${put.status}`);
    ups.push(ticket.upload_id);
  }
  // B can't take changes from the relay, nor fetch a change's clips: what it gets, it gets from Dropbox.
  const fail = (route) => route.fulfill({ status: 503, body: "out of reach for this check" });
  const fromServer = [];
  const seen = (request) => /\/api\/packs\/changes\/[^/]+\/clips\//.test(request.url()) && fromServer.push(request.url());
  await B.page.route("**/api/packs/inbox*", fail);
  await B.page.route("**/api/packs/changes/*/clips/*", fail);
  B.page.on("request", seen);
  blocked.add(B.page);
  const before = dropbox.log.length;
  let set;
  try {
    set = await tool("set_pack_audio", {
      pack_id: id,
      voices: { emma: { name: "Emma", locale: "nl-NL", items: { [item.id]: { upload_id: ups[0], seconds: 2, words: item.sentence.replace(/[.?!]+$/, "").split(" ").map((_, n) => [n * 0.3, n * 0.3 + 0.25]) } }, words: { station: { upload_id: ups[1], seconds: 0.8 } } } },
    });
    await takeNow(A.page);
    assert((await yourPack(A.page, id))?.audio?.manifest?.voices?.emma, "A took the recordings from the relay");
    await syncNow(A.page);
    for (const name of names) assert(dropbox.files.has(`lexicommons-clip.${tag}.${name}`), `${name} is in Dropbox, a file of its own`);
    // B: the pack's copy with its recordings, then the clips themselves, at its next syncs.
    await until(B.page, async (names) => {
      await (await import("/js/sync.js")).syncNow();
      const clips = await import("/js/study/clips.js");
      return names.every((name) => clips.hasClip(name));
    }, names, 30_000);
    const offered = await B.page.evaluate(async (id) => (await import("/js/study/packs.js")).packAudio(id), id);
    assert(offered?.voices?.emma?.items?.[item.id] && offered.voices.emma.words.station, JSON.stringify(offered).slice(0, 300));
    const played = await B.page.evaluate(async (id) => {
      const voice = await import("/js/study/voice.js");
      const shown = (await import("/js/study/content.js")).ITEMS.find((i) => i.pack === "trip-sync" && i.id.endsWith(id));
      const playing = voice.speakItem(shown);
      for (let i = 0; i < 30 && !voice.playbackState().src.startsWith("blob:"); i++) await new Promise((r) => setTimeout(r, 100));
      const src = voice.playbackState().src;
      playing?.stop();
      return src;
    }, item.id);
    assert(played.startsWith("blob:"), `B played ${played}`);
    const downloads = dropbox.log.slice(before).filter((e) => e.device === "B" && e.call === "/2/files/download" && e.name.startsWith("lexicommons-clip.")).map((e) => e.name);
    assert(names.every((name) => downloads.includes(`lexicommons-clip.${tag}.${name}`)), `B's downloads: ${downloads.join(", ")}`);
    assert(!fromServer.length, `B asked the server: ${fromServer.join(", ")}`);
  } finally {
    await B.page.unroute("**/api/packs/inbox*", fail);
    await B.page.unroute("**/api/packs/changes/*/clips/*", fail);
    B.page.off("request", seen);
    blocked.delete(B.page);
  }
  // Back on the relay: B's copy already has the change, so it's reported applied, and the server lets the clips go.
  await takeNow(B.page);
  const [change] = await tool("list_pack_changes", { pack_id: id });
  assert(change.change_id === set.change_id && same(change.devices.map((d) => d.state).sort(), ["applied", "applied"]), JSON.stringify(change.devices));
  // (Asked as the device, without the page logging the 404 this expects.)
  const status = (await A.page.request.get(`${BASE}/api/packs/changes/${set.change_id}/clips/${names[0]}`)).status();
  assert(status === 404, `the server still serves it: ${status}`);

  // Again, but A's clips never reach Dropbox: B gets the copy naming the new one without it, and its report waits until
  // B has the clip from the server (that report is what lets the server delete it).
  const third = readFileSync(join(HERE, "../public/audio/starter-word-order/emma", "denk-regent.mp3"));
  const newName = `${createHash("sha256").update(third).digest("hex").slice(0, 16)}.mp3`;
  const ticket = await tool("request_pack_audio_upload", { pack_id: id, format: "mp3", filename: "again.mp3" });
  assert((await fetch(ticket.upload_url, { method: "PUT", headers: { "Content-Type": ticket.content_type }, body: third })).ok, "upload");
  const clipAt = (change) => `${BASE}/api/packs/changes/${change}/clips/${newName}`;
  const inbox = (p) => p.evaluate(async () => {
    const m = await import("/js/study/pack-inbox.js");
    await m.checkPackInbox();
    return m.packInboxStatus();
  });
  dropbox.refuse = (device, name) => device === "A" && name.startsWith("lexicommons-clip.");
  await B.page.route("**/api/packs/inbox*", fail);
  blocked.add(A.page);
  blocked.add(B.page);
  let again;
  try {
    again = await tool("set_pack_audio", { pack_id: id, voices: { emma: { words: { waar: { upload_id: ticket.upload_id, seconds: 0.7 } } } } });
    await takeNow(A.page);
    await syncNow(A.page);
    assert(!dropbox.files.has(`lexicommons-clip.${tag}.${newName}`), "A's clip didn't reach Dropbox");
    await until(B.page, async (name) => {
      await (await import("/js/sync.js")).syncNow();
      const record = (await import("/js/study/packs.js")).yourPack("trip-sync");
      return JSON.stringify(record?.audio?.manifest ?? {}).includes(name);
    }, newName, 30_000);
    assert(!(await B.page.evaluate(async (name) => (await import("/js/study/clips.js")).hasClip(name), newName)), "B has the copy, not the clip");
    // The relay back, the clip's address not yet: the round stops short, and B's delivery waits.
    await B.page.unroute("**/api/packs/inbox*", fail);
    await B.page.route("**/api/packs/changes/*/clips/*", fail);
    const stopped = await inbox(B.page);
    assert(!stopped.ok && /can't be fetched yet/.test(stopped.error), JSON.stringify(stopped));
    const [waiting] = await tool("list_pack_changes", { pack_id: id });
    assert(waiting.change_id === again.change_id && same(waiting.devices.map((d) => d.state).sort(), ["applied", "waiting"]), JSON.stringify(waiting.devices));
    assert((await A.page.request.get(clipAt(again.change_id))).status() === 200, "still on the server");
    // Then the clip: kept, the change reported, and gone from the server.
    await B.page.unroute("**/api/packs/changes/*/clips/*", fail);
    const took = await inbox(B.page);
    assert(took.ok, JSON.stringify(took));
    assert(await B.page.evaluate(async (name) => (await import("/js/study/clips.js")).confirmClip(name), newName), "B has the clip");
    const [done] = await tool("list_pack_changes", { pack_id: id });
    assert(same(done.devices.map((d) => d.state).sort(), ["applied", "applied"]), JSON.stringify(done.devices));
    assert((await A.page.request.get(clipAt(again.change_id))).status() === 404, "gone from the server");
  } finally {
    dropbox.refuse = null;
    await B.page.unroute("**/api/packs/inbox*", fail).catch(() => {});
    await B.page.unroute("**/api/packs/changes/*/clips/*", fail).catch(() => {});
    blocked.delete(A.page);
    blocked.delete(B.page);
  }
  // A's next sync puts its clip in Dropbox after all.
  await syncNow(A.page);
  assert(dropbox.files.has(`lexicommons-clip.${tag}.${newName}`), "in Dropbox at A's next sync");
  return `${names.length} clips from Dropbox on B, none from the server; played there; the relay's change then applied on both and its clips gone; a copy without its clip waited for it from the server before reporting`;
});

let cleared = 0;
await stage("clearing study progress everywhere: the sheet says so; the other device clears at its next sync; new answers go on syncing; the old ones stay cleared", async () => {
  // B answers while its storage is out of reach: A never sees those answers before it clears.
  dropbox.down.add("B");
  blocked.add(B.page);
  const away = await study(B.page);
  cleared = (await evidence(B.page)).length;
  assert(cleared === (await evidence(A.page)).length + away, `B has A's answers and ${away} of its own`);
  await goSettings(A.page, "#settings/data", "Download everything");
  // The last stage's toast (your AI's pack) gone first, so the sheet's words are in its shot.
  await A.page.locator('[data-part="toast"]').first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const onA = (await evidence(A.page)).length;
  // A clear goes through the account's own copy (v681): every device and that copy, and the sheet names Dropbox too.
  assert((await rowSub(A.page, "Clear study progress everywhere")) === `${onA.toLocaleString("en-US")} answers so far, on every device and in your account's copy`, `the row: ${await rowSub(A.page, "Clear study progress everywhere")}`);
  await row(A.page, "Clear study progress everywhere").click();
  const sheet = A.page.locator('[data-part="sheet"]', { hasText: "Clear study progress everywhere?" });
  await sheet.waitFor();
  const said = await sheet.innerText();
  assert(said.includes("in your account's own copy and Dropbox") && said.includes("For 7 days you can bring it back with Undo"), said);
  await shot(A.page, "03-clear-everywhere-sheet");
  await sheet.getByRole("button", { name: "Clear everywhere" }).click();
  await A.page.getByText("Study progress cleared everywhere").first().waitFor();
  await shot(A.page, "04-cleared-with-undo");
  assert((await evidence(A.page)).length === 0, "A is cleared");
  await syncNow(A.page);
  // B comes back (its answers from while it was away were made before the clear), and syncs.
  dropbox.down.delete("B");
  blocked.delete(B.page);
  await syncNow(B.page);
  assert((await evidence(B.page)).length === 0, "B cleared at its sync, its answers from while it was away too");
  const fresh = await study(B.page);
  for (let i = 0; i < 2; i++) {
    await syncNow(B.page);
    await syncNow(A.page);
  }
  const result = await bothTheSame();
  assert(result.answers === fresh, `only the later answers on both: ${result.answers} (later: ${fresh})`);
  return { cleared, away, fresh };
});

await stage("Undo on the other device brings it all back everywhere, replayed the same on both", async () => {
  await goSettings(B.page, "#settings/data", "Download everything");
  const sub = await rowSub(B.page, "Bring back cleared study progress");
  assert(new RegExp(`^${cleared.toLocaleString("en-US")} answers cleared .+; Undo works until .+$`).test(sub), `the Undo row: ${sub}`);
  await shot(B.page, "05-undo-row");
  await row(B.page, "Bring back cleared study progress").getByRole("button", { name: "Undo" }).click();
  await B.page.getByText(`${cleared.toLocaleString("en-US")} answers brought back`).first().waitFor();
  await syncNow(B.page);
  await syncNow(A.page);
  const result = await bothTheSame();
  assert(result.answers > cleared, `everything back with the later answers: ${result.answers}`);
  await goSettings(A.page, "#settings/data", "Download everything");
  assert((await row(A.page, "Bring back cleared study progress").count()) === 0, "nothing left to undo on A");
  return result;
});

await stage("a second tab on one device follows the first, and nothing is kept twice", async () => {
  const tab = await A.context.newPage();
  watch(tab, "A tab 2");
  try {
    await tab.goto(`${BASE}/app/#today`);
    await tab.waitForSelector("html[data-app-ready]");
    const before = (await evidence(tab)).length;
    // B answers; both of A's tabs sync (the second one at once, the first after it).
    const fresh = await study(B.page);
    await syncNow(B.page);
    await Promise.all([syncNow(tab), syncNow(A.page)]);
    await until(tab, async (n) => (await import("/js/study/progress.js")).allEvidence().length === n, before + fresh);
    await until(A.page, async (n) => (await import("/js/study/progress.js")).allEvidence().length === n, before + fresh);
    const [one, two] = [await evidence(A.page), await evidence(tab)];
    assert(same(one, two), "the tabs have the same answers");
    const s = await stored(tab);
    assert(s.rows === s.memory && s.keys === s.rows, `IndexedDB ${s.rows} rows (${s.keys} keys), memory ${s.memory}`);
    return { before, after: two.length };
  } finally {
    await tab.close();
  }
});

// ---------- the reader's: where you are, highlights, your words (read/store.js, highlights.js, bank.js) ----------

const READER = '[data-part="reader"]:not([data-ghost])';
const TEXT = "sync-check-text";
/** The same text on a device. Texts stay on their device, so each adds its own copy (the app's own import), one id. */
const addText = (p) =>
  p.evaluate(async (id) => {
    const { bookFromText } = await import("/js/read/import-text.js");
    const { bookVersion } = await import("/js/read/book-format.js");
    const store = await import("/js/read/store.js");
    const body = Array.from({ length: 60 }, (_, k) => `Part ${k + 1}. The cat sat under the old tree while the wind moved its leaves, and the children came home late for supper.`).join("\n\n");
    const book = await bookFromText(body, { title: "The Sync Check" });
    book.id = id;
    book.version = await bookVersion(book);
    await store.addBook(book);
    return book.version;
  }, TEXT);
const openText = async (p) => {
  await p.goto(`${BASE}/app/#read/book/${TEXT}`);
  await p.reload();
  await p.waitForSelector(`${READER}[data-ready]`);
};
/** The reader's place, page and pages: { word, page, a, b }. */
const readerAt = (p) =>
  p.evaluate(() => {
    const r = document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader;
    const [a, b] = r.pageRanges[r.page];
    return { word: r.word, page: r.page, a, b };
  });
const turnOn = async (p) => {
  await p.keyboard.press("ArrowRight");
  await until(p, () => !document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.turning);
};
const placeOf = (p) => p.evaluate(async (id) => (await (await import("/js/read/store.js")).getPosition(id))?.word ?? null, TEXT);
const marksOf = (p) => p.evaluate(async (id) => (await import("/js/read/highlights.js")).highlightsOf(id), TEXT);
/** The words painted as highlighted in a device's open reader. */
const painted = (p) => p.evaluate(() => document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-highlight]').length);
const inBank = (p, lemma) => p.evaluate(async (l) => (await import("/js/read/bank.js")).inBank("nl", l), lemma);
const deviceOf = (p) => p.evaluate(() => localStorage.getItem("lx.sync.device.v1"));

let marked = null;
await stage("the reader's: where you are in a text, a highlight with its note and your words reach the other device; Settings → Storage lists them", async () => {
  const [va, vb] = [await addText(A.page), await addText(B.page)];
  assert(va === vb, `the same text on both: ${va} ${vb}`);
  // A reads three pages in, holds four words and writes a note on them, and adds a word.
  await openText(A.page);
  for (let k = 0; k < 3; k++) await turnOn(A.page);
  const at = await readerAt(A.page);
  await until(A.page, async ([id, word]) => (await (await import("/js/read/store.js")).getPosition(id))?.word === word, [TEXT, at.word]);
  const start = at.a + 4;
  await A.page.evaluate(([a, b]) => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.select(a, b), [start, start + 3]);
  await A.page.locator(`${READER} [data-part="reader-hold"]:not([hidden])`).getByRole("button", { name: "Note", exact: true }).click();
  await A.page.locator(`${READER} [data-part="reader-note"]`).waitFor();
  await A.page.keyboard.type("From A");
  await A.page.keyboard.press("Escape");
  await until(A.page, async (id) => (await (await import("/js/read/highlights.js")).highlightsOf(id))[0]?.note === "From A", TEXT);
  [marked] = await marksOf(A.page);
  assert(marked.start === start && marked.end === start + 3, `the highlight: ${JSON.stringify(marked)}`);
  await A.page.evaluate(async ([word, id]) => (await import("/js/read/bank.js")).addWord("nl", "kat", { at: word, book: id }), [start, TEXT]);
  await syncNow(A.page);
  await syncNow(B.page);
  // B: Settings → Storage lists them; the text opens where A was, with A's highlight and note.
  await goSettings(B.page, "#settings/storage", "What's kept there");
  await openKept(B.page);
  for (const [title, sub] of [
    ["Where you are in each text", "1 text on this device"],
    ["Highlights and notes", "1 highlight on this device"],
    ["Your words", "1 word on this device"],
  ]) assert((await rowSub(B.page, title)) === sub, `${title}: ${await rowSub(B.page, title)}`);
  await shot(B.page, "08-storage-reader");
  await closeSheet(B.page);
  assert((await placeOf(B.page)) === at.word, `B has A's place: ${await placeOf(B.page)}`);
  await openText(B.page);
  const onB = await readerAt(B.page);
  assert(at.word >= onB.a && at.word <= onB.b, `B opens on A's page: ${JSON.stringify({ at, onB })}`);
  const [there] = await marksOf(B.page);
  assert(there?.id === marked.id && there.note === "From A" && (await painted(B.page)) === 4, `A's highlight on B, painted: ${JSON.stringify(there)}`);
  assert(await inBank(B.page, "kat"), "A's word on B");
  // The files: one per kind and device, found by each device's own id.
  const names = fileNames();
  for (const kind of ["reading-place", "highlights", "word-bank"]) {
    for (const d of [A, B]) {
      const dev = await deviceOf(d.page);
      assert(names.includes(`lexicommons-${kind}.${tag}.${dev}.json`), `${kind} of ${d.name}: ${names}`);
    }
  }
  // The texts themselves go through your own storage too (12 Nov 2026, read/store.js's texts kind): a file of A's in Dropbox.
  const devA = await deviceOf(A.page);
  assert(names.some((n) => n.startsWith("lexicommons-texts.") && n.endsWith(`.${tag}.${devA}.json`)), `no texts file of A's in Dropbox: ${names}`);
  return `word ${at.word}, a highlight on words ${start}–${start + 3} with its note, "kat"; the text's own file in Dropbox`;
});

await stage("a highlight removed on one device: out on the other at its next sync (in its open reader too), kept there to restore for 30 days; Restore brings it back on both", async () => {
  // B takes it out, from its note.
  await B.page.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.showSheet("note"));
  await B.page.locator(`${READER} [data-part="reader-note"]`).getByRole("button", { name: "Remove highlight", exact: true }).click();
  await until(B.page, async (id) => !(await (await import("/js/read/highlights.js")).highlightsOf(id)).length, TEXT);
  await syncNow(B.page);
  // A still has the text open where the highlight is (no reload: the app syncs as it starts): it goes from the page
  // when A syncs.
  await until(A.page, async (i) => {
    const r = document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader;
    const [a, b] = r.pageRanges[r.page];
    return i >= a && i <= b;
  }, marked.start);
  assert((await painted(A.page)) === 4, "painted on A before its sync");
  await syncNow(A.page);
  await until(A.page, () => !document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-highlight]'));
  assert(!(await marksOf(A.page)).length, "out on A");
  // A's highlights list: removed on another device, with when, and until when it can come back.
  if (await A.page.locator(READER).evaluate((r) => r.getAttribute("data-state") === "zen")) await A.page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await A.page.locator(`${READER} button[aria-label="Highlights and notes"]`).click();
  const list = A.page.locator(`${READER} [data-part="sheet"][aria-label="Highlights and notes"]`);
  const kept = list.locator('[data-part="list-row"]', { hasText: marked.quote.slice(0, 12) });
  await kept.waitFor();
  const sub = (await kept.locator(".lx-row-sub").textContent())?.trim();
  assert(/^Removed .+ · you can restore it until .+$/.test(sub ?? ""), `the row: ${sub}`);
  assert((await list.textContent()).includes("kept here for 30 days"), "the list says how long");
  await shot(A.page, "09-highlight-removed-elsewhere");
  await kept.getByRole("button", { name: "Restore", exact: true }).click();
  await until(A.page, () => document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-highlight]').length === 4);
  await A.page.keyboard.press("Escape");
  const [back] = await marksOf(A.page);
  assert(back?.id === marked.id && back.note === "From A", `back on A with its note: ${JSON.stringify(back)}`);
  // B, its reader still open, takes it back at its next sync.
  await syncNow(A.page);
  await syncNow(B.page);
  await until(B.page, async (id) => (await (await import("/js/read/highlights.js")).highlightsOf(id)).length === 1, TEXT);
  await until(B.page, () => document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-highlight]').length === 4);
  return `${marked.id}: removed on B, out on A (live), restored from A, back on B (live)`;
});

await stage("your place and your words follow you: B reads on and takes a word out; A takes both; the word added again on A is back on B", async () => {
  await turnOn(B.page);
  const onB = await readerAt(B.page);
  await until(B.page, async ([id, word]) => (await (await import("/js/read/store.js")).getPosition(id))?.word === word, [TEXT, onB.word]);
  await B.page.evaluate(async () => (await import("/js/read/bank.js")).removeWord("nl", "kat"));
  await syncNow(B.page);
  await syncNow(A.page);
  assert((await placeOf(A.page)) === onB.word, `A has B's place: ${await placeOf(A.page)} (B at ${onB.word})`);
  assert(!(await inBank(A.page, "kat")), "kat out on A");
  await A.page.evaluate(async () => (await import("/js/read/bank.js")).addWord("nl", "kat"));
  await syncNow(A.page);
  await syncNow(B.page);
  assert(await inBank(B.page, "kat"), "kat back on B");
  return `place ${onB.word}; kat out, then back`;
});

// ---------- with the account's copy refused: Dropbox alone ----------
// The path for anyone whose account copy is switched off or full. The account's store refused at the browser on both devices, and on the
// device that takes them every other way a pack could come (the relay's inbox and changes, the server's copies: /api/packs/), so whatever
// reaches it came through Dropbox. Made while Dropbox is out of reach too, nothing reaches it (the CONTROL); Dropbox back, all of it does.
const ACCOUNT_STORE_URL = (url) => url.pathname.startsWith("/api/account/sync");
const RELAY_URL = (url) => url.pathname.startsWith("/api/packs/");
const refusals = { account: 0, relay: 0 };
const refuseAccount = (route) => (refusals.account++, route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "refused for this check" }) }));
const refuseRelay = (route) => (refusals.relay++, route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "refused for this check" }) }));
const dropboxOnly = { made: "dropbox-only-nl", gone: "dropbox-gone-nl", before: 0, answers: 0 };

await stage("CONTROL: with the account's copy refused and Dropbox out of reach too, a session, a new pack and a deletion on one device reach nothing", async () => {
  // A pack both devices have, to delete below.
  assert((await A.page.evaluate(async (pack) => (await import("/js/study/packs.js")).savePack(pack, { by: "sync check" }), { ...NL, id: dropboxOnly.gone, name: "Deleted through Dropbox" })).ok, "the pack to delete");
  await syncNow(A.page);
  await syncNow(B.page);
  assert(await yourPack(B.page, dropboxOnly.gone), "B has the pack to delete");
  for (const p of [A.page, B.page]) {
    await p.route(ACCOUNT_STORE_URL, refuseAccount);
    blocked.add(p);
  }
  await B.page.route(RELAY_URL, refuseRelay);
  dropbox.down.add("A");
  dropbox.down.add("B");
  dropboxOnly.before = (await evidence(B.page)).length;
  dropboxOnly.answers = await study(A.page);
  assert((await A.page.evaluate(async (pack) => (await import("/js/study/packs.js")).savePack(pack, { by: "sync check" }), { ...NL, id: dropboxOnly.made, name: "Made while only Dropbox" })).ok, "a new pack on A");
  await A.page.evaluate(async (id) => (await import("/js/study/packs.js")).deletePack(id), dropboxOnly.gone);
  for (let i = 0; i < 2; i++) {
    await syncNow(A.page);
    await syncNow(B.page);
  }
  assert((await evidence(B.page)).length === dropboxOnly.before, `B took A's answers with no way to: ${(await evidence(B.page)).length} (was ${dropboxOnly.before})`);
  assert(!(await yourPack(B.page, dropboxOnly.made)), "B took A's new pack with no way to");
  assert(await yourPack(B.page, dropboxOnly.gone), "B took A's deletion with no way to");
  assert(refusals.account > 0, `the account's store was asked and refused (${refusals.account})`);
  return `${dropboxOnly.answers} answers, a new pack and a deletion on A; none of it on B (the account's store refused ${refusals.account} times)`;
});

await stage("with the account's copy refused at the browser, Dropbox alone carries a session's answers, a new pack and a deletion to the other device", async () => {
  try {
    dropbox.down.delete("A");
    dropbox.down.delete("B");
    const asked = refusals.account;
    for (let i = 0; i < 2; i++) {
      await syncNow(A.page);
      await syncNow(B.page);
    }
    assert(refusals.account > asked, "the account's store wasn't asked (so it wasn't refused)");
    const result = await bothTheSame();
    assert(result.answers === dropboxOnly.before + dropboxOnly.answers, `B has ${result.answers} answers, A's ${dropboxOnly.answers} new ones on top of ${dropboxOnly.before}`);
    assert(await yourPack(B.page, dropboxOnly.made), "A's new pack is on B");
    assert(!(await yourPack(B.page, dropboxOnly.gone)), "A's deletion is on B");
    return `B has A's ${dropboxOnly.answers} answers (both replay the same), the new pack, and the deletion, through Dropbox alone (the account refused ${refusals.account - asked} more times, the relay ${refusals.relay})`;
  } finally {
    for (const p of [A.page, B.page]) {
      await p.unroute(ACCOUNT_STORE_URL, refuseAccount);
      blocked.delete(p);
    }
    await B.page.unroute(RELAY_URL, refuseRelay);
    dropbox.down.delete("A");
    dropbox.down.delete("B");
    await syncNow(A.page);
    await syncNow(B.page);
  }
});

await stage("disconnecting Dropbox: syncing goes on through your account alone, and clearing still reaches every device through it", async () => {
  await goSettings(B.page, "#settings/storage", "What's kept there");
  await row(B.page, "Dropbox").getByRole("button", { name: "Disconnect" }).click();
  // A quiet sync under way waits up to 30 s for a still page (sync.js STILL_MOST) before the row can say what's left: twice that.
  await syncRow(B.page).locator(".lx-row-sub", { hasText: /^Through your account$/ }).waitFor({ timeout: 60_000 }).catch(async () => {
    throw new Error(`the sync row after disconnecting: ${(await syncRow(B.page).innerText().catch(() => "none"))?.replace(/\s+/g, " ")}`);
  });
  await shot(B.page, "06-disconnected");
  await goSettings(B.page, "#settings/data", "Download everything");
  assert((await row(B.page, "Clear study progress everywhere").count()) === 1, "clearing reaches every device through the account");
  return "through your account alone";
});

await stage("deleting the account leaves what your own storage keeps", async () => {
  const before = fileNames();
  await goSettings(A.page, "#settings/account", "Delete my account");
  await row(A.page, "What deleting takes").click();
  assert((await A.page.locator('[data-part="sheet"] p', { hasText: "What your own storage keeps stays there" }).count()) === 1, "it says so");
  await closeSheet(A.page);
  await row(A.page, "Delete my account").click();
  await row(A.page, "Press again to delete it for good").click();
  await A.page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  assert(same(fileNames(), before), "the files are where they were");
  return `${before.length} files kept`;
});

await stage("no stray \"null\" or \"undefined\" text on any screen shot", async () => {
  assert(!strayText.length, `stray text: ${strayText.slice(0, 5).join(" · ")}`);
  return "none";
});

await stage("no console errors", async () => {
  const real = problems.filter((p) => !/status of 401/.test(p));
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "sync-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems, dropbox: dropbox.log.length }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
