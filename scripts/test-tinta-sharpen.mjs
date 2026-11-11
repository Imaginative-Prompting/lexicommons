// A breathing Tinta's sharpening track (public/js/character/sharpen.js): it never shows him at any scale but 1, however it ends, and it
// still reaches DENSER among its keyframes (what Chromium rasters him at). In plain Node, the keyframes read as Web Animations reads them
// (linear between keyframes, an offset left out spaced evenly, the end at the last keyframe):
// - shown: 1 at its start, at its end (finish(), a seek past it) and at every point up to 30 years in;
// - rastered: the largest keyframe DENSER, above 1;
// - made only with the element's own animate() (sharpen(this) in character.js), never handed to lx/motion.js, whose finishAll() a press runs;
// - Chromium's alone: none where navigator has no userAgentData.
// Each rule catches a plant first: the keyframes from before (their end DENSER), keyframes that never reach past 1, the track handed to
// motion.js. Usage: node scripts/test-tinta-sharpen.mjs [<app dir>]   (exit 0 = pass)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP = resolve(process.argv[2] ?? new URL("..", import.meta.url).pathname);
const { DENSER, SHARPEN, SHARPEN_FOR, sharpen, sharpens } = await import(pathToFileURL(join(APP, "public/js/character/sharpen.js")).href);

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) failed++;
};

/** The keyframes' offsets as Web Animations computes them: the first 0, the last 1, any left out spaced evenly between its neighbors. */
function offsets(frames) {
  const out = frames.map((f) => f.offset ?? null);
  if (out[0] === null) out[0] = frames.length > 1 ? 0 : 1;
  if (out.at(-1) === null) out[out.length - 1] = 1;
  for (let i = 1; i < out.length; i++) {
    if (out[i] !== null) continue;
    let j = i;
    while (out[j] === null) j++;
    for (let k = i; k < j; k++) out[k] = out[i - 1] + ((out[j] - out[i - 1]) * (k - i + 1)) / (j - i + 1);
  }
  return out;
}
/** The scale shown at `progress` (0 to 1) of the track; at 1 (finished, or seeked to its end) its last keyframe. */
function scaleAt(frames, progress) {
  const at = offsets(frames);
  const value = (i) => Number(frames[i].scale);
  if (progress >= at.at(-1)) return value(frames.length - 1);
  for (let i = 1; i < frames.length; i++) {
    if (progress <= at[i]) {
      const span = at[i] - at[i - 1];
      return span ? value(i - 1) + ((value(i) - value(i - 1)) * (progress - at[i - 1])) / span : value(i);
    }
  }
  return value(frames.length - 1);
}
const YEAR = 365.25 * 24 * 3600 * 1000;
/** Every rule of the track's shape, for the track and its plants: what's wrong, or nothing. */
function shapeFaults(frames, duration) {
  const faults = [];
  if (scaleAt(frames, 0) !== 1) faults.push(`its start shows ${scaleAt(frames, 0)}`);
  if (scaleAt(frames, 1) !== 1) faults.push(`its end (finish(), a seek past it) shows ${scaleAt(frames, 1)}`);
  // Linear between keyframes: it shows something other than 1 before 30 years exactly when a segment starting before then has an end
  // that isn't 1 (sampling would step over an instant).
  const quiet = (30 * YEAR) / duration;
  const at = offsets(frames);
  for (let i = 0; i + 1 < frames.length; i++) {
    if (at[i] < quiet && (Number(frames[i].scale) !== 1 || Number(frames[i + 1].scale) !== 1)) {
      faults.push(`${((at[i] * duration) / YEAR).toFixed(2)} years in it shows more than 1 (toward ${Math.max(Number(frames[i].scale), Number(frames[i + 1].scale))})`);
      break;
    }
  }
  const largest = Math.max(...frames.map((f) => Number(f.scale)));
  if (!(largest > 1)) faults.push(`no keyframe past 1 (largest ${largest}): Chromium rasters him at his screen scale`);
  if (at.some((o, i) => i && o < at[i - 1])) faults.push(`offsets out of order: ${at.join(", ")}`);
  return faults;
}

// The track itself, then the plants each rule must catch.
check(DENSER > 1 && DENSER <= 2, `DENSER is past 1 and not past 2 (2 aliased): ${DENSER}`);
check(SHARPEN_FOR >= 30 * YEAR, `the track runs at least 30 years: ${(SHARPEN_FOR / YEAR).toFixed(1)}`);
const faults = shapeFaults(SHARPEN, SHARPEN_FOR);
check(faults.length === 0, `shown at 1 at its start, its end and every point up to 30 years in; ${DENSER} among its keyframes: ${faults.join("; ") || "so"}`);
check(Math.max(...SHARPEN.map((f) => Number(f.scale))) === DENSER, `the largest keyframe is DENSER (${DENSER}), what Chromium rasters him at`);
const before = [{ scale: "1" }, { scale: "1", offset: 0.999999 }, { scale: String(DENSER) }];
const beforeFaults = shapeFaults(before, SHARPEN_FOR);
check(beforeFaults.some((f) => f.startsWith("its end")), `PLANT: the keyframes from before (ending at ${DENSER}) caught: ${beforeFaults.join("; ")}`);
check(shapeFaults([{ scale: "1" }, { scale: "1" }], SHARPEN_FOR).some((f) => f.startsWith("no keyframe past 1")), "PLANT: keyframes that never pass 1 caught");
check(shapeFaults(SHARPEN, 1e9).some((f) => f.includes("years in")), "PLANT: the same keyframes over 11.6 days caught (it would show within 30 years)");

// Chromium's alone, and made on the node it's handed.
const calls = [];
const node = { animate: (frames, options) => (calls.push({ frames, options }), { id: "track" }) };
const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const standIn = (value) => Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
standIn({ userAgent: "WebKit" });
check(!sharpens() && sharpen(node) === null && calls.length === 0, "none where navigator has no userAgentData (WebKit, Firefox, Node)");
standIn({ userAgent: "Chromium", userAgentData: { brands: [] } });
const track = sharpen(node);
check(sharpens() && track?.id === "track" && calls.length === 1 && calls[0].frames === SHARPEN && calls[0].options.duration === SHARPEN_FOR, "in Chromium, the track on the node it's handed, with SHARPEN over SHARPEN_FOR");
if (saved) Object.defineProperty(globalThis, "navigator", saved);
else delete globalThis.navigator;

// Made only by sharpen(this) in character.js; nothing under public/js hands SHARPEN or sharpen to lx/motion.js.
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".js")) files.push(path);
  }
};
walk(join(APP, "public/js"));
const handedToMotion = (text) => /\b(?:motion\.)?(?:animate|registerTicker)\s*\(\s*[^,()]*,\s*SHARPEN\b|registerTicker\([^)]*sharpen/.test(text) || /motion\.animate\([^)]*SHARPEN/.test(text);
const users = files.filter((f) => !f.endsWith("character/sharpen.js") && /\bsharpen\(|\bSHARPEN\b/.test(readFileSync(f, "utf8")));
const character = readFileSync(join(APP, "public/js/character/character.js"), "utf8");
check(users.length === 1 && users[0].endsWith("character/character.js") && /sharpened: sharpen\(this\)/.test(character), `made only by sharpen(this) in character.js: ${users.map((f) => relative(APP, f)).join(", ") || "nowhere"}`);
check(!files.some((f) => handedToMotion(readFileSync(f, "utf8"))), "never handed to lx/motion.js (a press's finishAll() finishes what motion.js runs)");
check(handedToMotion("motion.animate(this, SHARPEN, { duration: SHARPEN_FOR })"), "PLANT: a track handed to motion.animate caught");

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
