#!/usr/bin/env node
// Runs a copy of Lexicommons on this computer: its own database and library in .state-local/ (gitignored), nothing on any
// account. docs/self-host.md is the guide.
//
//   npm run local                      http://localhost:8787 (Ctrl-C stops it); --port <n> for another
//   npm run local -- --detach | stop   in the background, and stopping it
//   npm run local -- admin [--user <id>]
//   npm run local -- speech            fetches the on-device speech models (about 1 GB)
//   npm run local -- remove [--yes]    deletes this copy and everything in it
//
// Every wrangler call that touches stored data goes through local(): --local with this folder, never anything remote. This
// file only uses Node's own modules until the dependencies are in, so it works on a fresh clone.

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

// The seed runs the Worker's own code in Node, through features Node still calls experimental: not worth a warning here.
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name !== "ExperimentalWarning") console.warn(warning);
});

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = join(APP, ".state-local");
const STATE = join(HOME, "state");
const RECORD = join(HOME, "copy.json");
const WRANGLER = join(APP, "node_modules", ".bin", "wrangler");
const DB = "lexicommons";
const LIBRARY = "lexicommons-library";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => (flag(name) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const command = argv.find((a, i) => !a.startsWith("--") && !["--port", "--user"].includes(argv[i - 1]));

class Stop extends Error {}
const stop = (message) => {
  throw new Stop(message);
};
const say = (message = "") => console.log(message);

const load = () => (existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, "utf8")) : {});
function save(copy) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(RECORD, JSON.stringify(copy, null, 2) + "\n", { mode: 0o600 });
}

function ensureDependencies() {
  const lock = createHash("sha256").update(readFileSync(join(APP, "package-lock.json"))).digest("hex");
  const marker = join(HOME, "installed-lock.txt");
  const installed = existsSync(WRANGLER);
  if (installed && (!existsSync(marker) || readFileSync(marker, "utf8") === lock)) return;
  say("Installing dependencies (npm ci)…");
  const done = spawnSync("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: APP, stdio: "inherit" });
  if (done.status !== 0) stop("npm ci failed; see above.");
  mkdirSync(HOME, { recursive: true });
  writeFileSync(marker, lock);
}

function wrangler(args, { allowFail = false } = {}) {
  const done = spawnSync(WRANGLER, args, { cwd: APP, env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
  const text = `${done.stdout ?? ""}\n${done.stderr ?? ""}`;
  if (done.status !== 0 && !allowFail) stop(`wrangler ${args.slice(0, 3).join(" ")} failed:\n${text.split("\n").filter((l) => /ERROR|error|✘/.test(l)).slice(0, 6).join("\n") || text.slice(-1000)}`);
  return { ok: done.status === 0, text, stdout: done.stdout ?? "" };
}
/** Stored data, on this computer only. */
const local = (args, options) => wrangler([...args, "--local", "--persist-to", STATE], options);
const jsonOf = (text) => JSON.parse(text.slice(text.search(/[[{]/)));
const read = (sql) => jsonOf(local(["d1", "execute", DB, "--json", "--command", sql]).stdout)[0]?.results ?? [];

function readLibrary(key) {
  const tmp = join(HOME, "tmp");
  mkdirSync(tmp, { recursive: true });
  const file = join(tmp, "read");
  rmSync(file, { force: true });
  const out = local(["r2", "object", "get", `${LIBRARY}/${key}`, "--file", file], { allowFail: true });
  if (!out.ok) {
    if (/not found|does not exist|NoSuchKey|404/i.test(out.text)) return null;
    stop(`Couldn't read ${key}:\n${out.text.slice(-600)}`);
  }
  return readFileSync(file, "utf8");
}

/** This repo's library into this copy: files first, the catalog last, then Explore's index. Safe to run again. */
async function seedLibrary(copy) {
  const { buildSeed, indexStatements, mergeCatalogue } = await import("./local/seed.mjs");
  say("Checking the library in this repo…");
  const seed = await buildSeed(APP);
  const currentText = readLibrary("catalogue.json");
  const current = currentText ? JSON.parse(currentText) : null;
  const { catalogue, kept } = await mergeCatalogue(APP, current, seed, copy.seeded);
  for (const id of kept) say(`  ${id}: your admin changed it, so it stays as yours`);

  const tmp = join(HOME, "tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const fresh = seed.files.filter((file) => !copy.seeded?.keys?.includes(file.key));
  const byType = new Map();
  fresh.forEach((file, n) => {
    let path = file.path;
    if (!path) writeFileSync((path = join(tmp, `file-${n}`)), file.text);
    byType.set(file.type, [...(byType.get(file.type) ?? []), { key: file.key, file: path }]);
  });
  if (fresh.length) say(`Putting ${fresh.length} files in the library…`);
  let group = 0;
  for (const [type, list] of byType) {
    const listFile = join(tmp, `bulk-${group++}.json`);
    writeFileSync(listFile, JSON.stringify(list));
    local(["r2", "bulk", "put", LIBRARY, "--filename", listFile, "--content-type", type, "--force"]);
  }
  if (JSON.stringify(catalogue) !== JSON.stringify(current)) {
    const file = join(tmp, "catalogue.json");
    writeFileSync(file, JSON.stringify(catalogue, null, 2) + "\n");
    local(["r2", "object", "put", `${LIBRARY}/catalogue.json`, "--file", file, "--content-type", "application/json"]);
  }
  const statements = await indexStatements(APP, catalogue, seed.files, async (sql) => read(sql), async (key) => readLibrary(key));
  if (statements.length) {
    const file = join(tmp, "index.sql");
    writeFileSync(file, statements.join("\n") + "\n");
    local(["d1", "execute", DB, "--file", file, "--yes"]);
  }
  rmSync(tmp, { recursive: true, force: true });
  copy.seeded = { packs: { ...copy.seeded?.packs, ...seed.versions.packs }, keys: [...new Set([...(copy.seeded?.keys ?? []), ...seed.files.map((f) => f.key)])], at: new Date().toISOString() };
  save(copy);
  say(`The library holds ${Object.values(catalogue.packs ?? {}).flat().length} packs in ${Object.keys(catalogue.packs ?? {}).length} languages and ${catalogue.books?.length ?? 0} books.`);
}

const isFree = (port) =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });

async function answers(origin, seconds, alive = () => true) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until && alive()) {
    try {
      if ((await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(2000) })).ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

/** Whether the process on record is really this copy's server: true, false, or null if ps can't say. Nothing else is ever stopped. */
function ours(copy) {
  if (!copy.pid) return false;
  const ps = spawnSync("ps", ["-o", "command=", "-p", String(copy.pid)], { encoding: "utf8" });
  if (ps.status === 0) return ps.stdout.includes(STATE);
  return ps.status === 1 ? false : null;
}
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function run() {
  ensureDependencies();
  const copy = load();
  if (ours(copy)) return say(`It's already running: http://localhost:${copy.port}/app/`);
  let port = Number(option("port") ?? copy.port ?? 8787);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) stop("--port needs a port number from 1024 to 65535.");
  if (flag("port") && !(await isFree(port))) stop(`Port ${port} is in use. Pick another with --port.`);
  while (!(await isFree(port))) port++;
  const origin = `http://localhost:${port}`;
  copy.port = port;
  copy.signing ??= randomBytes(32).toString("hex");
  save(copy);

  say("Applying database migrations…");
  local(["d1", "migrations", "apply", DB]);
  await seedLibrary(copy);

  // The main site's config, with what's different here as variables. No store's app is registered for this address.
  const args = ["dev", "--port", String(port), "--local-upstream", `localhost:${port}`, "--persist-to", STATE, "--log-level", "warn",
    "--var", "GATE_ENABLED:false", "--var", `PUBLIC_ORIGIN:${origin}`, "--var", "RP_ID:localhost", "--var", `UPLOAD_SIGNING_SECRET:${copy.signing}`,
    "--var", "GOOGLE_CLIENT_ID:", "--var", "DROPBOX_APP_KEY:", "--var", "ONEDRIVE_CLIENT_ID:",
    // No account email: a copy sends none (the main site's Email Sending is for lexicommons.com).
    "--var", "EMAIL_FROM:",
    // A key of your own for the in-app AI (AI section → Connection): it stays in your browser and goes only to its provider.
    "--var", "OWN_KEY_ENABLED:true"];
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  const banner = () => {
    say(`\nLexicommons is running: ${origin}/app/`);
    say("Create an account with a passkey, then Study has lesson 1 waiting, and Translate and Read work.");
    say("Your copy only: docs/self-host.md says what's different here.\n");
  };
  if (flag("detach")) {
    const log = join(HOME, "server.log");
    const child = spawn(WRANGLER, args, { cwd: APP, detached: true, stdio: ["ignore", openSync(log, "a"), openSync(log, "a")], env });
    child.unref();
    copy.pid = child.pid;
    save(copy);
    if (!(await answers(origin, 120))) stop(`The server didn't answer in time. Its log: ${relative(process.cwd(), log)}`);
    banner();
    say("It's running in the background. Stop it with: npm run local -- stop");
    return;
  }
  const child = spawn(WRANGLER, args, { cwd: APP, stdio: "inherit", env });
  copy.pid = child.pid;
  save(copy);
  let exited = false;
  child.on("exit", (code) => {
    exited = true;
    const now = load();
    delete now.pid;
    save(now);
    process.exit(code ?? 0);
  });
  if (await answers(origin, 120, () => !exited)) banner();
}

function stopServer() {
  const copy = load();
  if (!ours(copy)) return say("Nothing to stop: this copy isn't running.");
  try {
    process.kill(-copy.pid, "SIGTERM");
  } catch {
    process.kill(copy.pid, "SIGTERM");
  }
  delete copy.pid;
  save(copy);
  say("Stopped.");
}

function admin() {
  if (!existsSync(STATE)) stop("Start it once first: npm run local");
  ensureDependencies();
  const users = read("SELECT id, name, created_at FROM users ORDER BY created_at");
  if (!users.length) stop("No accounts yet. Create yours in the app, then run this again.");
  const roles = new Map(read("SELECT user_id, role FROM user_roles").map((r) => [r.user_id, r.role]));
  const wanted = option("user");
  if (!wanted && users.length > 1) {
    say("Which account? Run this again with --user <id>:");
    for (const user of users) say(`  ${user.id}  ${user.name}${roles.has(user.id) ? `  (${roles.get(user.id)})` : ""}`);
    return;
  }
  const user = wanted ? users.find((u) => u.id === wanted) : users[0];
  if (!user) stop(`No account has the id ${wanted}.`);
  if (roles.get(user.id) === "admin") return say(`${user.name} is already an admin.`);
  if (!/^[A-Za-z0-9_-]+$/.test(user.id)) stop("An account id with unexpected characters; nothing changed.");
  local(["d1", "execute", DB, "--yes", "--command", `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES ('${user.id}', 'admin', ${Date.now()}, 'd1', 'npm run local -- admin')`]);
  say(`${user.name} is now an admin of this copy. There's nothing to restart.`);
}

function speech() {
  say("Fetching the on-device speech models (about 1 GB, checked against Hugging Face's hashes)…");
  const done = spawnSync(process.execPath, [join(APP, "scripts/speech-build.mjs"), ...argv.slice(1)], { cwd: APP, stdio: "inherit" });
  if (done.status !== 0) stop("The models didn't finish; see above. Running it again picks up where it stopped.");
  say("Done. This copy serves them from now on.");
}

async function remove() {
  if (!existsSync(HOME)) return say("There's no copy here, so nothing was deleted.");
  say(`This deletes the copy on this computer, with every account and all its data:\n  ${relative(process.cwd(), HOME) || HOME}`);
  if (!flag("yes")) {
    if (!process.stdin.isTTY) stop("Nothing was deleted. To go ahead without a prompt, run this again with --yes.");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("Type delete to go ahead: ");
    rl.close();
    if (answer.trim() !== "delete") return say("Nothing was deleted.");
  }
  const copy = load();
  if (ours(copy) === null && alive(copy.pid)) stop(`Process ${copy.pid} may be this copy's server, and this can't tell, so nothing was deleted. Stop it yourself, then run this again.`);
  if (ours(copy)) stopServer();
  rmSync(HOME, { recursive: true, force: true });
  say("Deleted.");
}

try {
  if (Number(process.versions.node.split(".")[0]) < 24) stop(`This needs Node 24 or newer; this is ${process.version}.`);
  if (!command) await run();
  else if (command === "stop") stopServer();
  else if (command === "admin") admin();
  else if (command === "speech") speech();
  else if (command === "remove") await remove();
  else say("Usage: npm run local [-- --detach | --port <n> | stop | admin [--user <id>] | speech | remove [--yes]]\ndocs/self-host.md is the guide.");
} catch (error) {
  if (error instanceof Stop) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
