// What an admin's call hands the library (src/library-admin.ts): staging takes only the types it names, never one an object inherits
// ("constructor" passed the old check with no size limit, Codex C9); and a REST publish's body keeps every field a publish reads, each
// only as its type (notes, forms, grammarMore and suggest were dropped, Codex C7). On the real migrations. Exit 0 = pass.
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES ('admin-user', 'Admin', 0)").run();
Object.assign(env, { UPLOAD_SIGNING_SECRET: "local-check-only", PUBLIC_ORIGIN: "http://localhost:8787" });
// The in-memory bucket (fixtures/worker-env.mjs) has no head(): staging asks it whether the library has a file already.
for (const bucket of [env.LIBRARY, env.UPLOADS]) bucket.head ??= async (key) => (bucket.objects.has(key) ? { key } : null);
const admin = await import("../src/library-admin.ts");
let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 4).join("\n        ")}`);
  }
};
const SHA = "a".repeat(64);
await test("a type an object inherits is no stage type, whatever its size", async () => {
  for (const type of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    await assert.rejects(() => admin.stageFiles(env, "admin-user", [{ name: "x.bin", type, size: 17 * 1024 * 1024, sha256: SHA }], "test"), /type must be one of/, type);
  }
});
await test("a real type past its size is refused, and within it is taken (the control)", async () => {
  await assert.rejects(() => admin.stageFiles(env, "admin-user", [{ name: "p.png", type: "image/png", size: 50 * 1024 * 1024, sha256: SHA }], "test"), /size must be/);
  const staged = await admin.stageFiles(env, "admin-user", [{ name: "p.png", type: "image/png", size: 1000, sha256: SHA }], "test");
  assert.equal(staged.files.length, 1);
});
await test("a REST publish keeps notes, forms, grammarMore and suggest, and every other field, each only as its type", () => {
  const body = { book: "b", layers: [{ layer: "l", glossary: "g" }, { layer: 5 }], list: "li", pack: "p", audio: { pack: "ap", manifest: "am" }, grammar: "gr", grammarMore: "gm", notes: "n", forms: "f", confirmRemoved: true, confirmReverts: true, optIn: true, suggest: false, note: "why" };
  assert.deepEqual(admin.publishInputFrom(body), { book: "b", layers: [{ layer: "l", glossary: "g" }], list: "li", pack: "p", audio: { pack: "ap", manifest: "am" }, grammar: "gr", grammarMore: "gm", notes: "n", forms: "f", confirmRemoved: true, confirmReverts: true, optIn: true, suggest: false, note: "why" });
  const wrong = admin.publishInputFrom({ notes: 5, forms: {}, grammarMore: ["x"], suggest: "yes", optIn: 1, confirmRemoved: "true" });
  assert.deepEqual([wrong.notes, wrong.forms, wrong.grammarMore, wrong.suggest, wrong.optIn, wrong.confirmRemoved], [undefined, undefined, undefined, undefined, undefined, false]);
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
