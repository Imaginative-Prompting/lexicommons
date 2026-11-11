// An account's limits on notes, uploads and personal tokens (src/library.ts) hold when requests come at once: each counted in its own write,
// so the last one past the limit is refused however many arrive together (6 Nov 2026, Codex C19: 501 notes, 201 uploads, 21 tokens).
// One just under the limit still goes (the control). The same for the rest of C19 (7 Nov): a look's image bytes (looks.ts putLookImage:
// 27 MB of 24, the room taken in the image's row before its bytes are stored, none left behind for one refused), staged files
// (library-admin.ts stageFiles: 2,001 of 2,000; a call refused whole, its rows gone), the same pack shared twice at once (community.ts:
// one goes, the other told it's the same pack; a new version the same), and one open grammar fix per author and pattern
// (grammar-suggestions.ts). On the real migrations. `node scripts/test-account-limits.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
Object.assign(env, { UPLOAD_SIGNING_SECRET: "local-check-only", PUBLIC_ORIGIN: "http://localhost:8787", COMMUNITY_SHARING: "everyone" });
const library = await import("../src/library.ts");
const looks = await import("../src/looks.ts");
const libraryAdmin = await import("../src/library-admin.ts");
const community = await import("../src/community.ts");
const grammar = await import("../src/grammar-suggestions.ts");
const count = (table, extra = "") => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = 'u1' ${extra}`).get().n;
sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES ('u1', 'Someone', 0)").run();
let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
};
const settle = (promises) => Promise.allSettled(promises).then((all) => ({ made: all.filter((r) => r.status === "fulfilled").length, refused: all.filter((r) => r.status === "rejected").length }));
await test("notes: 498 kept, then five at once: two go, three are refused, and the account has 500", async () => {
  const insert = sqlite.prepare("INSERT INTO notes (id, user_id, text, source, created_at) VALUES (?, 'u1', 'x', 'test', 0)");
  for (let i = 0; i < 498; i++) insert.run(`n${i}`);
  const r = await settle(Array.from({ length: 5 }, (_, i) => library.addNote(env, "u1", `at once ${i}`, "test")));
  assert.deepEqual(r, { made: 2, refused: 3 });
  assert.equal(count("notes"), 500);
});
await test("uploads: 198 asked for, then five at once: two go, and the account has 200", async () => {
  const insert = sqlite.prepare("INSERT INTO uploads (id, user_id, filename, content_type, status, source, created_at, expires_at) VALUES (?, 'u1', 'f', 'image/png', 'pending', 'test', ?, ?)");
  for (let i = 0; i < 198; i++) insert.run(`up${i}`, Date.now(), Date.now() + 900_000);
  const r = await settle(Array.from({ length: 5 }, (_, i) => library.requestUpload(env, "u1", { filename: `f${i}.png`, contentType: "image/png" }, "test")));
  assert.deepEqual(r, { made: 2, refused: 3 });
  assert.equal(count("uploads"), 200);
});
await test("tokens: 18 active, then five at once: two are made, and the account has 20 active", async () => {
  const insert = sqlite.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (?, 'u1', 't', ?, 'lct_xxxxxx', 0, 0)");
  for (let i = 0; i < 18; i++) insert.run(`t${i}`, `h${i}`);
  const r = await settle(Array.from({ length: 5 }, (_, i) => library.createToken(env, "u1", `at once ${i}`)));
  assert.deepEqual(r, { made: 2, refused: 3 });
  assert.equal(count("api_tokens", "AND revoked_at IS NULL"), 20);
});

await test("a look's images: 23 MB kept, then five of 0.4 MB at once: two go, the account under its 24 MB, no bytes left of the three refused", async () => {
  const room = looks.LOOK_IMAGE_BYTES_PER_ACCOUNT;
  // One image kept from just now (a fresh one is never collected to make room), 1 MB short of the limit.
  sqlite.prepare("INSERT INTO look_images (user_id, hash, content_type, size, created_at) VALUES ('u1', ?, 'image/png', ?, ?)").run("f".repeat(64), room - 1_000_000, Date.now());
  const images = Array.from({ length: 5 }, (_, i) => new Uint8Array(400_000).fill(i + 1).buffer);
  const hash = (bytes) => createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  // R2's put takes a network round trip; in memory it takes none, and each upload would finish before the next began.
  const put = env.UPLOADS.put.bind(env.UPLOADS);
  env.UPLOADS.put = async (...args) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return put(...args);
  };
  let r;
  try {
    r = await settle(images.map((bytes) => looks.putLookImage(env, "u1", hash(bytes), "image/png", bytes)));
  } finally {
    env.UPLOADS.put = put;
  }
  assert.deepEqual(r, { made: 2, refused: 3 });
  const total = sqlite.prepare("SELECT SUM(size) AS n FROM look_images WHERE user_id = 'u1'").get().n;
  assert.ok(total <= room, `${total} bytes of ${room}`);
  const kept = sqlite.prepare("SELECT hash FROM look_images WHERE user_id = 'u1' AND size = 400000").all().map((row) => row.hash).sort();
  // users/<id>/look/<hash> (looks.ts imageKey).
  const stored = [...env.UPLOADS.objects.keys()].filter((key) => key.startsWith("users/u1/look/") && images.some((b) => key.endsWith(hash(b)))).map((key) => key.split("/").at(-1)).sort();
  assert.deepEqual(stored, kept, "the bytes in R2 aren't the rows kept");
  // The same image twice at once: one row, its bytes kept.
  sqlite.prepare("DELETE FROM look_images WHERE user_id = 'u1' AND size = 400000").run();
  const twice = await settle([0, 1].map(() => looks.putLookImage(env, "u1", hash(images[0]), "image/png", images[0])));
  assert.deepEqual(twice, { made: 2, refused: 0 });
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM look_images WHERE user_id = 'u1' AND hash = ?").get(hash(images[0])).n, 1);
  sqlite.prepare("DELETE FROM look_images WHERE user_id = 'u1'").run();
});
await test("staging: 1,998 staged, then five one-file calls at once: two go, and the account has 2,000", async () => {
  const STAGED = 2000;
  const insert = sqlite.prepare("INSERT INTO staged_files (id, user_id, name, content_type, size, sha256, status, source, created_at, link_expires_at, expires_at) VALUES (?, 'u1', 'f.json', 'application/json', 1, ?, 'pending', 'test', ?, ?, ?)");
  const at = Date.now();
  for (let i = 0; i < STAGED - 2; i++) insert.run(`st${i}`, String(i).padStart(64, "0"), at, at + 3600_000, at + 86_400_000);
  const file = (n) => ({ name: `new-${n}.json`, type: "application/json", size: 10, sha256: createHash("sha256").update(`file ${n}`).digest("hex") });
  const r = await settle([0, 1, 2, 3, 4].map((n) => libraryAdmin.stageFiles(env, "u1", [file(n)], "test")));
  assert.deepEqual(r, { made: 2, refused: 3 });
  assert.equal(count("staged_files"), STAGED);
  // Two calls of two files with room for three: one goes whole, the other is refused whole, none of its rows left.
  sqlite.prepare("DELETE FROM staged_files WHERE user_id = 'u1' AND name LIKE 'new-%'").run();
  sqlite.prepare("DELETE FROM staged_files WHERE id IN ('st0')").run();
  assert.equal(count("staged_files"), STAGED - 3);
  const pairs = await settle([[file(10), file(11)], [file(12), file(13)]].map((files) => libraryAdmin.stageFiles(env, "u1", files, "test")));
  assert.deepEqual(pairs, { made: 1, refused: 1 });
  assert.equal(count("staged_files"), STAGED - 1, "the refused call left a row");
  sqlite.prepare("DELETE FROM staged_files WHERE user_id = 'u1'").run();
});

// Two accounts with the sharing terms, a week old.
const WEEK_AGO = Date.now() - 8 * 86_400_000;
for (const id of ["ana", "bo"]) {
  sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, `Person ${id}`, WEEK_AGO);
  await community.acceptTerms(env, id, community.SHARING_TERMS_VERSION);
}
const sentence = (id, text, lemmas, means) => {
  const words = text.replace(/[.?!]$/, "").split(" ").map((word) => [word, lemmas[word] ?? word.toLowerCase()]);
  return { id, concepts: ["v2"], text, means, words, punct: ".", literal: text.split(" ").map((w) => [w]), english: null, moved: [], wrong: [`${text} nee`], gap: { index: words.length - 1, options: [words.at(-1)[0], "iets"] } };
};
const pack = (id, drink) => ({
  format: "lexicommons-pack", version: 2, id, name: "Café", about: "Dutch, for a check.", language: "nl", from: "en", topics: {}, chunks: {}, patterns: {},
  words: { ik: "I", drinken: "to drink", [drink]: drink === "thee" ? "tea" : "coffee" },
  items: [sentence(drink, `Ik drink ${drink}.`, { Ik: "ik", drink: "drinken", [drink]: drink }, `I drink ${drink === "thee" ? "tea" : "coffee"}.`)],
});
const share = (userId, p) => community.sharePack(env, { userId, via: "app" }, { pack: p, title: p.name, about: p.about, topics: [] });

await test("the same pack shared by two accounts at once: one goes, the other is told it's the same pack", async () => {
  const answers = await Promise.all([share("ana", pack("cafe-ana", "thee")), share("bo", pack("cafe-bo", "thee"))]);
  assert.equal(answers.filter((a) => a.shared).length, 1, JSON.stringify(answers).slice(0, 400));
  const other = answers.find((a) => !a.shared);
  assert.match(other.errors?.[0]?.message ?? "", /the same pack as/);
  const hashes = sqlite.prepare("SELECT content_hash, COUNT(*) AS n FROM items GROUP BY content_hash HAVING n > 1").all();
  assert.deepEqual(hashes, [], "two packs in Explore with the same contents");
});
await test("a new version the same as another pack, made while that one is shared: one of them goes", async () => {
  const first = await share("ana", pack("cafe-two", "koffie"));
  assert.ok(first.shared, JSON.stringify(first).slice(0, 300));
  // bo shares one pack, then gives a version with ana's contents at the moment ana's new pack with those same contents is shared.
  const own = pack("bo-own", "melk");
  own.words.melk = "milk";
  const bos = await share("bo", own);
  assert.ok(bos.shared, JSON.stringify(bos).slice(0, 300));
  const same = pack("bo-own", "water");
  same.words.water = "water";
  const anas = pack("cafe-three", "water");
  anas.words.water = "water";
  const [version, shared] = await Promise.all([
    community.updateShared(env, { userId: "bo", via: "app" }, bos.id, { pack: same, title: same.name, about: same.about, topics: [] }),
    share("ana", anas),
  ]);
  const went = [version.updated === true, shared.shared === true].filter(Boolean).length;
  assert.equal(went, 1, `version ${JSON.stringify(version).slice(0, 200)} / share ${JSON.stringify(shared).slice(0, 200)}`);
  const refused = version.updated ? shared : version;
  assert.match(refused.errors?.[0]?.message ?? "", /the same pack as/, `refused for something else: ${JSON.stringify(refused).slice(0, 200)}`);
  const hashes = sqlite.prepare("SELECT content_hash, COUNT(*) AS n FROM items WHERE state IN ('live', 'hidden') GROUP BY content_hash HAVING n > 1").all();
  assert.deepEqual(hashes, [], "two packs in Explore with the same contents");
});
await test("grammar: three fixes to one pattern from one account at once: one is kept, two are told one is waiting", async () => {
  const about = (n) => `Join with want (because), keeping the order: ik blijf, want ik ben moe (I stay, because I am tired). Take ${n}.`;
  const fix = (n) => grammar.suggestPattern(env, { userId: "ana", via: "device", ai: false }, { language: "nl", kind: "fix", pattern: "want", about: about(n), knows: "native" });
  const all = await Promise.allSettled([1, 2, 3].map(fix));
  const kept = all.filter((r) => r.status === "fulfilled" && r.value.suggested);
  assert.equal(kept.length, 1, JSON.stringify(all.map((r) => (r.status === "fulfilled" ? r.value.suggested ?? r.value : r.reason.message))).slice(0, 400));
  assert.ok(all.filter((r) => r.status === "rejected").every((r) => /waiting already/.test(r.reason.message)), all.map((r) => r.reason?.message).join(" | "));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM grammar_suggestions WHERE author_id = 'ana' AND pattern = 'want' AND state IN ('open', 'accepting')").get().n, 1);
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
