// End-to-end proof of every connection path, against the live site. Run through the GPU queue (it launches a
// headless Chrome, no WebGL):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "piping test" -- node <this file> <outDir>
//
// Stages: site gate → passkey sign-up, sign-out, sign-in (virtual authenticator) → personal token → REST API →
// MCP over HTTP with the token → signed upload of a real Dutch clip → the app showing what arrived → mcp-remote
// bridge → Codex OAuth (CIMD, then DCR) + headless codex exec → Claude Code OAuth (CIMD) + one headless claude -p.
// Each CLI's test server is removed again afterwards. Secrets are read from the Keychain or created in memory and
// never printed. Exit code 0 only if every stage passes.

import { chromium } from "./quiet-browser.mjs";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://lexicommons.com";
const MCP_URL = `${BASE}/mcp`;
const OUT = process.argv[2] ?? process.cwd();
const CLIP = process.argv[3] ?? join(OUT, "hallo.m4a");
const PROBE = "lexicommons-probe";
const SCRATCH = join(OUT, "cli-probe");
mkdirSync(SCRATCH, { recursive: true });

const results = [];
function record(stage, pass, detail = "") {
  results.push({ stage, pass, detail: String(detail).slice(0, 400) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${stage}${detail ? `  — ${String(detail).slice(0, 200)}` : ""}`);
}
async function stage(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail ?? "");
  } catch (error) {
    record(name, false, error?.message ?? error);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// --- MCP over plain HTTP ------------------------------------------------------------------------------------------

let rpcId = 1;
async function mcp(token, method, params = {}) {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status} ${text.slice(0, 200)}`);
  const json = text.trimStart().startsWith("{")
    ? JSON.parse(text)
    : JSON.parse(
        text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .at(-1) ?? "{}",
      );
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error).slice(0, 200)}`);
  return json.result;
}
const toolText = (result) => result.content?.map((c) => c.text).join("\n") ?? "";
async function callTool(token, name, args = {}) {
  const result = await mcp(token, "tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${toolText(result)}`);
  return JSON.parse(toolText(result));
}

// --- Spawning the CLIs --------------------------------------------------------------------------------------------

function run(cmd, args, options = {}) {
  try {
    const stdin = options.input === undefined ? "ignore" : "pipe";
    return execFileSync(cmd, args, { encoding: "utf8", stdio: [stdin, "pipe", "pipe"], timeout: 120_000, ...options });
  } catch (error) {
    const tail = `${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim().slice(-400);
    throw new Error(`${cmd} ${args.find((a) => !a.startsWith("-")) ?? ""} failed (${error.code ?? error.status}): ${tail}`);
  }
}

/** Starts a CLI login that prints an authorization URL and then accepts the pasted callback URL. */
function startLogin(cmd, args, cwd) {
  // A Python pseudo-terminal gives the CLI a terminal (some prompts refuse to read a pipe); `script` can't, because
  // it needs its own stdin to be a terminal. The window is 4000 columns wide so a long URL is never wrapped.
  const ptyRun = [
    "import fcntl, os, pty, struct, sys, termios",
    "pid, fd = pty.fork()",
    "if pid == 0:",
    "    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 4000, 0, 0))",
    "    os.execvp(sys.argv[1], sys.argv[1:])",
    "pty._copy(fd)",
    "sys.exit(os.waitstatus_to_exitcode(os.waitpid(pid, 0)[1]))",
  ].join("\n");
  const child = spawn("python3", ["-c", ptyRun, cmd, ...args], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  const onData = (chunk) => (output += chunk.toString());
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  const authorizeUrl = (async () => {
    for (let i = 0; i < 120; i++) {
      // eslint-disable-next-line no-control-regex
      const clean = output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, " ");
      const match = clean.match(/https:\/\/lexicommons\.com\/authorize\?[^\s"'<>]+/);
      if (match) return match[0];
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`no authorization URL printed. Output: ${output.slice(-300)}`);
  })();
  return { child, exited, authorizeUrl, output: () => output };
}

/** Walks the consent flow in the signed-in headless browser and returns the loopback callback URL. */
async function approveInBrowser(page, authorizeUrl) {
  let callback = null;
  const watch = (request) => {
    const url = request.url();
    if (/^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url)) callback = url;
  };
  page.on("request", watch);
  await page.goto(authorizeUrl);
  try {
    await page.waitForSelector('button[value="approve"]', { timeout: 20_000 });
  } catch {
    const shown = (await page.textContent("main").catch(() => "")) ?? "";
    throw new Error(`no consent screen at ${page.url().slice(0, 120)}: ${shown.replace(/\s+/g, " ").slice(0, 300)}`);
  }
  const heading = await page.textContent("h1");
  await page.click('button[value="approve"]').catch(() => {});
  for (let i = 0; i < 40 && !callback; i++) await new Promise((r) => setTimeout(r, 250));
  page.off("request", watch);
  // Back to the site, so later checks fetch from lexicommons.com rather than the loopback page.
  await page.goto(`${BASE}/app/`).catch(() => {});
  assert(callback, "no loopback callback after approving");
  return { callback, heading };
}

async function finishLogin(login, callback) {
  // If the CLI is listening on loopback, the browser already delivered the code; otherwise paste it.
  const done = await Promise.race([login.exited, new Promise((r) => setTimeout(() => r("waiting"), 3000))]);
  if (done === "waiting") login.child.stdin.write(`${callback}\n`);
  const code = await Promise.race([login.exited, new Promise((r) => setTimeout(() => r("timeout"), 30_000))]);
  if (code === "timeout") login.child.kill();
  assert(code === 0, `login exited ${code}. Output: ${login.output().slice(-300)}`);
}

// --- The run ------------------------------------------------------------------------------------------------------

const gatePassword = execFileSync("security", ["find-internet-password", "-s", "lexicommons.com", "-a", "site-gate", "-w"], {
  encoding: "utf8",
}).trim();

// Chrome for Testing in headless mode (quiet-browser.mjs), with its own throwaway profile.
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});

let token = null;

await stage("site gate: password page, then through", async () => {
  await page.goto(`${BASE}/app/`);
  assert(page.url().includes("/_gate"), `expected the gate, got ${page.url()}`);
  await page.fill('input[name="password"]', gatePassword);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/login\?next=/, { timeout: 15_000 });
  return page.url().replace(BASE, "");
});

await stage("account: sign up with a passkey", async () => {
  await page.click("summary");
  await page.fill('input[name="name"]', "Piping probe");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForFunction(() => document.getElementById("who")?.textContent === "Piping probe", null, { timeout: 15_000 });
  return "signed in as Piping probe";
});

await stage("account: sign out, then sign in with the passkey", async () => {
  await page.click("#signout");
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  await page.click("#signin");
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForFunction(() => document.getElementById("who")?.textContent === "Piping probe", null, { timeout: 15_000 });
  return "signed back in";
});

await stage("personal token: created in the app", async () => {
  const created = await page.evaluate(async () => {
    const response = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "piping test" }),
    });
    return response.json();
  });
  token = created.token;
  assert(token?.startsWith("lct_"), "no token returned");
  return `prefix ${created.summary.prefix}`;
});

await stage("REST API: whoami + write + read a note", async () => {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const who = await (await fetch(`${BASE}/api/v1/whoami`, { headers })).json();
  assert(who.name === "Piping probe", `whoami: ${JSON.stringify(who)}`);
  const note = await (await fetch(`${BASE}/api/v1/notes`, { method: "POST", headers, body: JSON.stringify({ text: "Hallo from the REST API" }) })).json();
  const notes = await (await fetch(`${BASE}/api/v1/notes`, { headers })).json();
  assert(notes.some((n) => n.id === note.id), "note not listed");
  return `whoami ${who.via}; note ${note.id}`;
});

await stage("MCP over HTTP with the token: initialize, list, call", async () => {
  const init = await mcp(token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "piping-test", version: "1" },
  });
  const tools = await mcp(token, "tools/list");
  const names = tools.tools.map((t) => t.name).sort();
  assert(names.join() === "echo,list_notes,list_uploads,request_upload,save_note,whoami", `tools: ${names}`);
  const who = await callTool(token, "whoami");
  assert(who.name === "Piping probe" && who.via === "pat", `whoami ${JSON.stringify(who)}`);
  const echo = await callTool(token, "echo", { text: "hallo" });
  assert(echo.echo === "hallo", "echo mismatch");
  await callTool(token, "save_note", { text: "Hallo from MCP with a personal token" });
  const prompts = await mcp(token, "prompts/list");
  const resource = await mcp(token, "resources/read", { uri: "lexicommons://about" });
  assert(prompts.prompts.some((p) => p.name === "connection_check"), "prompt missing");
  assert(resource.contents?.[0]?.text?.includes("Lexicommons"), "resource missing");
  return `server ${init.serverInfo?.name} ${init.protocolVersion}; ${names.length} tools, prompt + resource`;
});

await stage("signed upload: a real Dutch clip (say -v Xander) via request_upload + curl-style PUT", async () => {
  const clip = readFileSync(CLIP);
  const sha = createHash("sha256").update(clip).digest("hex");
  const ticket = await callTool(token, "request_upload", { filename: "hallo.m4a", contentType: "audio/mp4" });
  assert(ticket.curl.includes("curl") && ticket.uploadUrl.startsWith(`${BASE}/upload/`), "bad ticket");
  const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "audio/mp4" }, body: clip });
  const stored = await put.json();
  assert(put.ok && stored.sha256 === sha, `upload: ${JSON.stringify(stored)}`);
  const reuse = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "audio/mp4" }, body: clip });
  assert(reuse.status === 409, `re-using the link should be refused, got ${reuse.status}`);
  const uploads = await callTool(token, "list_uploads");
  assert(uploads.some((u) => u.id === ticket.id && u.status === "stored" && u.sha256 === sha), "not listed as stored");
  return `${clip.length} bytes, sha256 matches, link single-use`;
});

await stage("the app shows what the AI sent (notes + playable audio)", async () => {
  await page.reload();
  await page.waitForFunction(() => document.getElementById("notes")?.textContent.includes("Hallo from MCP"), null, { timeout: 15_000 });
  await page.waitForSelector("#uploads audio", { timeout: 15_000 });
  const audioOk = await page.evaluate(async () => {
    const src = document.querySelector("#uploads audio").getAttribute("src");
    const response = await fetch(src);
    return response.ok && response.headers.get("Content-Type") === "audio/mp4";
  });
  assert(audioOk, "audio file not served to the app");
  await page.screenshot({ path: join(OUT, "app-after-piping.png"), fullPage: true });
  return "screenshot app-after-piping.png";
});

await stage("mcp-remote bridge (stdio → remote, with the token header)", async () => {
  const child = spawn("npx", ["-y", "mcp-remote@latest", MCP_URL, "--header", `Authorization:Bearer ${token}`], {
    cwd: SCRATCH,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  const replies = new Map();
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line.startsWith("{")) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined) replies.set(message.id, message);
    }
  });
  let stderr = "";
  child.stderr.on("data", (c) => (stderr += c.toString()));
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const waitFor = async (id) => {
    for (let i = 0; i < 240; i++) {
      if (replies.has(id)) return replies.get(id);
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`no reply ${id}. stderr: ${stderr.slice(-300)}`);
  };
  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bridge-test", version: "1" } } });
    await waitFor(1);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whoami", arguments: {} } });
    const reply = await waitFor(2);
    const who = JSON.parse(reply.result.content[0].text);
    assert(who.name === "Piping probe", JSON.stringify(reply).slice(0, 200));
    return "whoami through the bridge";
  } finally {
    child.kill();
  }
});

// The test server is given to each Codex command as a one-off -c setting, so ~/.codex/config.toml is never
// touched (and `codex mcp add` isn't used: it starts a browser login immediately).
const CODEX_SERVER = ["-c", `mcp_servers.${PROBE}.url="${MCP_URL}"`];

async function codexOAuth(registration) {
  const login = startLogin(
    "codex",
    [...CODEX_SERVER, "mcp", "login", PROBE, "--no-browser", "--oauth-client-registration", registration],
    SCRATCH,
  );
  const url = await login.authorizeUrl;
  const clientId = new URL(url).searchParams.get("client_id");
  const { callback, heading } = await approveInBrowser(page, url);
  await finishLogin(login, callback);
  return { clientId, heading };
}

await stage("Codex OAuth with CIMD (codex mcp login --oauth-client-registration cimd)", async () => {
  const { clientId, heading } = await codexOAuth("cimd");
  assert(clientId?.startsWith("https://"), `expected a URL client_id, got ${clientId}`);
  return `client_id ${clientId}; consent "${heading}"`;
});

await stage("headless codex exec calls the tools with the stored sign-in", async () => {
  const output = run(
    "codex",
    [
      ...CODEX_SERVER,
      // What a real cron setup sets: this server's tools run without a prompt (exec never prompts).
      "-c",
      `mcp_servers.${PROBE}.default_tools_approval_mode="approve"`,
      "exec",
      "--skip-git-repo-check",
      "-s",
      "read-only",
      "-C",
      SCRATCH,
      `Use the ${PROBE} MCP server. Call its whoami tool, then its save_note tool with the text "Hallo from headless codex exec". Then print the whoami JSON exactly as returned.`,
    ],
    { timeout: 300_000 },
  );
  assert(output.includes("Piping probe"), `no whoami in output: ${output.slice(-300)}`);
  const notes = await page.evaluate(async () => (await fetch("/api/notes")).json());
  assert(notes.some((n) => n.text.includes("headless codex exec")), "note from codex exec not found");
  return "whoami + save_note from codex exec";
});

await stage("Codex OAuth with DCR (the path OpenCode uses)", async () => {
  try {
    run("codex", [...CODEX_SERVER, "mcp", "logout", PROBE]);
  } catch {}
  const { clientId } = await codexOAuth("dcr");
  assert(clientId && !clientId.startsWith("https://"), `expected a registered client_id, got ${clientId}`);
  return `registered client ${clientId.slice(0, 8)}…`;
});

try {
  run("codex", [...CODEX_SERVER, "mcp", "logout", PROBE]);
  record("cleanup: codex test sign-in removed", true);
} catch (error) {
  record("cleanup: codex test sign-in removed", false, error.message);
}

await stage("Claude Code OAuth with CIMD (claude mcp login --no-browser)", async () => {
  try {
    run("claude", ["mcp", "remove", PROBE], { cwd: SCRATCH });
  } catch {}
  run("claude", ["mcp", "add", "--transport", "http", PROBE, MCP_URL], { cwd: SCRATCH });
  const login = startLogin("claude", ["mcp", "login", PROBE, "--no-browser"], SCRATCH);
  const url = await login.authorizeUrl;
  const clientId = new URL(url).searchParams.get("client_id");
  const { callback } = await approveInBrowser(page, url);
  await finishLogin(login, callback);
  const status = run("claude", ["mcp", "get", PROBE], { cwd: SCRATCH });
  assert(/connected/i.test(status), `mcp get: ${status.slice(0, 300)}`);
  return `client_id ${clientId}`;
});

await stage("one headless claude -p call uses the stored sign-in", async () => {
  const output = run(
    "claude",
    [
      "-p",
      "--model",
      "haiku",
      // --allowedTools takes several values, so the prompt goes in on stdin rather than as the last argument.
      "--allowedTools",
      `mcp__${PROBE}__whoami`,
      `mcp__${PROBE}__save_note`,
    ],
    {
      cwd: SCRATCH,
      timeout: 300_000,
      input: `Call the whoami tool on the ${PROBE} MCP server, then its save_note tool with the text "Hallo from headless claude -p". Then print the whoami JSON exactly as returned.`,
    },
  );
  assert(output.includes("Piping probe"), `no whoami in output: ${output.slice(-300)}`);
  const notes = await page.evaluate(async () => (await fetch("/api/notes")).json());
  assert(notes.some((n) => n.text.includes("headless claude -p")), "note from claude -p not found");
  return "whoami + save_note from claude -p";
});

// Before the CLI cleanup: `claude mcp remove` revokes its own grant.
await stage("connected apps listed in the account", async () => {
  const connections = await page.evaluate(async () => (await fetch("/api/connections")).json());
  const apps = connections.map((c) => c.app);
  assert(apps.length > 0, "no connected apps listed");
  await page.goto(`${BASE}/app/`);
  await page.waitForSelector("#connections li");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "app-final.png"), fullPage: true });
  return apps.join(", ");
});

try {
  run("claude", ["mcp", "remove", PROBE], { cwd: SCRATCH });
  record("cleanup: claude test server removed", true);
} catch (error) {
  record("cleanup: claude test server removed", false, error.message);
}
await browser.close();

writeFileSync(join(OUT, "piping-results.json"), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
