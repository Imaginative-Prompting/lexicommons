// A server in front of a local copy that answers some requests as the live site answers an overload (app.ts): 503, Retry-After: 1,
// {"error":"<words>","code":"overloaded","applied":false} (nothing was written: the request never reached the copy). Everything else goes through to
// the copy unchanged, its WebSockets too, and every request is logged. overload-check.mjs runs it; on its own it's a CLI:
//   node scripts/fixtures/overload-server.mjs --port <its port> --upstream <the copy's port> [--every-first | --share 0.35] [--log <file.jsonl>]
// The copy must take this server's origin as its own (wrangler dev --var PUBLIC_ORIGIN:http://localhost:<its port> --local-upstream
// localhost:<its port>), or the copy refuses the app's writes as another site's (util.ts crossSite) and passkeys as another origin's.
//
// Rules (setRule; each takes effect from the next request):
//   pass         nothing refused
//   every-first  each request refused once: a 503, then the next request of that method and path goes through, then a 503 again
//                (each new request a person or a poll makes meets one 503, and only a retry gets through)
//   share        a share of requests refused at random (a seed, so a run can be repeated), never more than inARow in a row for one
//                method and path
// match: which paths (default every /api/ route); applied: false leaves "applied" out of a write's 503 (the app mustn't retry it then).
import http from "node:http";
import net from "node:net";
import { appendFileSync } from "node:fs";

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function startOverloadServer({ port, upstream, log = null, host = "127.0.0.1" }) {
  const started = Date.now();
  const requests = [];
  let rule = { mode: "pass" };
  let random = seeded(1);
  let refusedLast = new Map(); // method + path → how many 503s in a row
  const setRule = (next) => {
    rule = { match: /^\/api\//, retryAfter: "1", applied: true, inARow: 3, share: 0.35, seed: 1, ...next };
    random = seeded(rule.seed);
    refusedLast = new Map();
  };
  setRule({ mode: "pass" });

  const keep = (entry) => {
    requests.push(entry);
    if (log) appendFileSync(log, `${JSON.stringify(entry)}\n`);
  };
  const refuse = (method, path) => {
    if (rule.mode === "pass" || !rule.match.test(path)) return false;
    const key = `${method} ${path}`;
    const inRow = refusedLast.get(key) ?? 0;
    let no;
    if (rule.mode === "every-first") no = inRow === 0;
    else if (rule.mode === "share") no = inRow < rule.inARow && random() < rule.share;
    else throw new Error(`no rule ${rule.mode}`);
    refusedLast.set(key, no ? inRow + 1 : 0);
    return no;
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const at = Date.now() - started;
    // x-check-call: which call of the page's this is, the same on each of its tries (overload-check.mjs puts it on every request).
    const entry = { at, method: req.method, path: url.pathname, query: [...url.searchParams.keys()].join(","), rule: rule.mode, call: req.headers["x-check-call"] ?? null };
    if (refuse(req.method, url.pathname)) {
      req.resume();
      const body = { error: "Lexicommons is very busy for a moment. Try again in a few seconds.", code: "overloaded" };
      if (rule.applied || !WRITES.has(req.method)) body.applied = false;
      res.writeHead(503, { "Content-Type": "application/json", "Retry-After": rule.retryAfter, "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
      keep({ ...entry, status: 503, refused: true, applied: body.applied ?? null });
      return;
    }
    const forward = http.request({ host: "127.0.0.1", port: upstream, method: req.method, path: req.url, headers: req.headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.rawHeaders);
      answer.pipe(res);
      answer.on("end", () => keep({ ...entry, status: answer.statusCode, ms: Date.now() - started - at }));
    });
    forward.on("error", (error) => {
      keep({ ...entry, status: 502, error: error.message });
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("upstream failed");
    });
    req.pipe(forward);
  });
  // WebSockets (the practice room) go straight through.
  server.on("upgrade", (req, socket, head) => {
    const to = net.connect(upstream, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      to.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head?.length) to.write(head);
      to.pipe(socket);
      socket.pipe(to);
    });
    const end = () => {
      to.destroy();
      socket.destroy();
    };
    to.on("error", end);
    socket.on("error", end);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () =>
      resolve({
        setRule,
        requests,
        rule: () => rule,
        /** Now on the log's clock (an entry's `at`). */
        now: () => Date.now() - started,
        close: () => new Promise((done) => (server.closeAllConnections?.(), server.close(() => done()))),
      }),
    );
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const at = argv.indexOf(`--${name}`);
    return at < 0 ? null : argv[at + 1];
  };
  const port = Number(flag("port"));
  const upstream = Number(flag("upstream"));
  if (!port || !upstream) {
    console.error("Usage: overload-server.mjs --port <its port> --upstream <the copy's port> [--every-first | --share 0.35] [--log <file.jsonl>]");
    process.exit(2);
  }
  const server = await startOverloadServer({ port, upstream, log: flag("log") });
  if (argv.includes("--every-first")) server.setRule({ mode: "every-first" });
  else if (flag("share")) server.setRule({ mode: "share", share: Number(flag("share")) });
  console.log(`overload server on http://localhost:${port} → localhost:${upstream} (${server.rule().mode})`);
}
