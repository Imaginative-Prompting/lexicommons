// The temporary sound test page (public/sound-test/), in Chromium and WebKit, muted: every test's Play runs to its end with no page
// error, its answer buttons come up, and each answer reaches /api/notes as "sound-test <run> <test> heard=… music=…", the music
// answer only once "Music is playing" is ticked. The page's own files are served by the check; /api/notes is answered here;
// Safari's Audio Session API is stood in.
// It can't tell what an iPhone plays: that's what the page is for.
// node scripts/sound-test-check.mjs <outDir> [--engines chromium,webkit]   (exit 0 = pass)

import { createServer } from "node:http";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "./quiet-browser.mjs";

const args = process.argv.slice(2);
const outArg = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!outArg) {
  console.error("usage: sound-test-check.mjs <outDir> [--engines chromium,webkit]");
  process.exit(64);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
const PUBLIC = join(fileURLToPath(import.meta.url), "../../public");
const ENGINES = (args.includes("--engines") ? args[args.indexOf("--engines") + 1] : "chromium,webkit").split(",");
const TYPES = { ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".html": "text/html", ".mp3": "audio/mpeg" };
const notes = [];
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/api/notes" && req.method === "POST") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      notes.push(JSON.parse(body).text);
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
    return;
  }
  const file = normalize(join(PUBLIC, path.endsWith("/") ? `${path}index.html` : path));
  if (!file.startsWith(PUBLIC)) return res.writeHead(403).end();
  try {
    if (!statSync(file).isFile()) throw new Error();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let failed = 0;
const check = (engine, ok, what) => {
  console.log(`${engine} ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};

for (const engine of ENGINES) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // Safari's Audio Session API, stood in (neither browser here has it), so the page's notes say the type each test ran under.
    await context.addInitScript(() => {
      let type = "auto";
      Object.defineProperty(navigator, "audioSession", { configurable: true, value: { get type() { return type; }, set type(v) { type = v; } } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${BASE}/sound-test/`);
    const tests = await page.locator("#tests > li").count();
    check(engine, tests === 8, `eight tests listed (${tests})`);
    notes.length = 0;
    // The first test without music, then music ticked for the rest.
    for (let i = 0; i < tests; i++) {
      if (i === 1) await page.locator("#music").check();
      const li = page.locator("#tests > li").nth(i);
      if (i === 0) check(engine, !(await li.getByRole("button", { name: "Heard it", exact: true }).isVisible()), "no answers show before Play");
      await li.getByRole("button", { name: "Play", exact: true }).click();
      // Each runs to its end (at most about 7 s), then offers its answers.
      await li.getByRole("button", { name: "Heard it", exact: true }).waitFor({ state: "visible", timeout: 15000 });
      await li.getByRole("button", { name: i % 2 ? "Didn't hear it" : "Heard it", exact: true }).click();
      if (i > 0) await li.getByRole("button", { name: "Music kept playing", exact: true }).click();
      else check(engine, !(await li.getByRole("button", { name: "Music kept playing", exact: true }).isVisible()), "no music question before music is ticked");
    }
    const deadline = Date.now() + 5000;
    while (notes.length < tests * 2 - 1 && Date.now() < deadline) await page.waitForTimeout(100);
    const ids = ["recording", "voice", "voice-playback", "voice-transient", "voice-under-media", "effect", "chime-then-recording-old", "chime-then-recording-new"];
    for (const [i, id] of ids.entries()) {
      const mine = notes.filter((n) => n.split(" ")[2] === id);
      const lastOne = mine.at(-1) ?? "";
      check(engine, /^sound-test [a-z0-9]{6} /.test(lastOne) && lastOne.includes(`heard=${i % 2 ? "no" : "yes"}`) && lastOne.includes(i > 0 ? "music=kept" : "music=-"), `${id}: its answer saved (${lastOne.split(" ").slice(2, 5).join(" ") || "none"})`);
    }
    const old = notes.filter((n) => n.includes(" chime-then-recording-old ")).at(-1) ?? "";
    check(engine, old.includes("type=ambient"), "the old chime's test ran under ambient, as the app did (its note says the type)");
    const fresh = notes.filter((n) => n.includes(" chime-then-recording-new ")).at(-1) ?? "";
    check(engine, !fresh.includes("type=ambient"), "the new one didn't");
    await page.screenshot({ path: join(OUT, `${engine}.png`), fullPage: true });
    check(engine, errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  } finally {
    await browser.close();
  }
}
server.close();
writeFileSync(join(OUT, "notes.json"), JSON.stringify(notes, null, 1));
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
