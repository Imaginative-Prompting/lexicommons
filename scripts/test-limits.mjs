#!/usr/bin/env node
// Reading a request body up to a limit (src/util.ts readBytesLimited, readTextLimited): a body over the limit stops
// being read as soon as it passes it, with or without a Content-Length, so the Worker never buffers more than the limit
// (the gate's form, signed uploads, files staged for the open library). Exit 0 = pass.

import assert from "node:assert/strict";
import { readBytesLimited, readTextLimited } from "../src/util.ts";

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (error) {
    failures.push(`${name}\n    ${error.message.split("\n").join("\n    ")}`);
  }
}

/** A chunked request of `chunks` chunks of `size` bytes, counting how many the reader pulled. */
function counted(chunks, size, headers = {}) {
  const seen = { pulled: 0 };
  let sent = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (sent === chunks) return controller.close();
      sent++;
      seen.pulled++;
      controller.enqueue(new Uint8Array(size).fill(97));
    },
  }, { highWaterMark: 0 }); // no chunk pulled until someone reads
  return { request: new Request("http://x/", { method: "PUT", body, duplex: "half", headers }), seen };
}

await test("a body within the limit is read whole", async () => {
  const { request } = counted(4, 1000);
  const bytes = await readBytesLimited(request, 4000);
  assert.equal(bytes.byteLength, 4000);
});
await test("a chunked body past the limit stops being read just past it", async () => {
  const { request, seen } = counted(64 * 1024, 1024); // 64 MB offered
  assert.equal(await readBytesLimited(request, 10 * 1024), null);
  assert.ok(seen.pulled <= 12, `pulled ${seen.pulled} chunks of 1 KB for a 10 KB limit`);
});
await test("a declared Content-Length over the limit is refused before reading anything", async () => {
  const { request, seen } = counted(10, 1024, { "Content-Length": String(10 * 1024) });
  assert.equal(await readBytesLimited(request, 1024), null);
  assert.equal(seen.pulled, 0);
});
await test("an empty body reads as no bytes", async () => {
  assert.equal((await readBytesLimited(new Request("http://x/", { method: "PUT" }), 10)).byteLength, 0);
});
await test("text: within the limit decoded, past it null (the gate's form)", async () => {
  assert.equal(await readTextLimited(new Request("http://x/", { method: "POST", body: "password=x" }), 4096), "password=x");
  const { request, seen } = counted(1024, 1024);
  assert.equal(await readTextLimited(request, 4096), null);
  assert.ok(seen.pulled <= 6, `pulled ${seen.pulled} chunks of 1 KB for a 4 KB limit`);
});

if (failures.length) {
  console.error(`limits: ${passed} passed, ${failures.length} failed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`limits: ${passed}/${passed} passed`);
