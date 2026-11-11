// Tinta's ink as the theme's (public/js/character/ink.js, the rig's palettes in character/rig/inkdrop/inkdrop.js, splash.css):
// - with no --tinta-* token set, every palette is today's, color for color (TODAY below is today's, written out by hand: the control
//   for "nothing changes until a theme sets one"), and it's the rig's own object, so every drawing is the same;
// - one --tinta-ink makes the whole ink (its shade, light, deep, brows, gloss) by the offsets today's palettes have from their body,
//   so every pose stays one ink; a token set beside it wins; mixing two inks (the splash easing into a theme's) runs in OKLCH;
// - every Tinta file reads its ink from the palette or the tokens: no hard-coded ink color is left but the rig's palettes (the
//   defaults' one home) and splash.css's splash (it keeps the default ink: it's iOS's launch image) and fallbacks, with planted
//   files the scan must catch first;
// - the first-frame keeper's key (firsts.js inkOf) is just the scheme with no token set, as before, and names a theme's tokens;
//   publishInk puts the theme's ink on <html> only while a theme sets one.
//   node scripts/test-tinta-ink.mjs   (exit 0 = pass)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(fileURLToPath(import.meta.url), "../..");
const PUBLIC = join(APP, "public");
const { PALETTES, inkPalette } = await import(join(PUBLIC, "js/character/rig/inkdrop/inkdrop.js"));
const ink = await import(join(PUBLIC, "js/character/ink.js"));
const { TOKENS } = await import(join(PUBLIC, "js/character/ink-tokens.js"));

let passed = 0, failed = 0;
const test = async (name, fn) => {
  try {
    const said = await fn();
    passed++;
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
};
const assert = (ok, why) => {
  if (!ok) throw new Error(why);
};

// Today's ink, by hand (7 Nov 2026): what a learner sees with no theme setting any.
const TODAY = {
  dark: { body: "#7C5CE6", shade: "#5E40C4", light: "#A68CFF", brow: "#3B2785", tongue: "#A68CFF", deep: "#3A2C80", glass: "#A68CFF", gloss: "#BBA3FF" },
  light: { body: "#9370F0", shade: "#7452D6", light: "#BBA3FF", brow: "#4A33A6", tongue: "#BBA3FF", deep: "#CFC4F5", glass: "#7452D6", gloss: "#E2D8FF" },
};
const OWN = { dark: { white: "#FFFFFF", pupil: "#1B1A17", glint: "#FFFFFF", mouth: "#1B1A17", paper: "#F6F3EC", rim: "#D9D6CF", grip: "#A7A39A" }, light: { white: "#FFFFFF", pupil: "#1B1A17", glint: "#FFFFFF", mouth: "#1B1A17", paper: "#FFFFFF", rim: "#3A3833", grip: "#75726A" } };
const FIELDS = Object.keys(TODAY.dark);

await test("the rig's palettes are today's ink and today's own colors, exactly", () => {
  for (const scheme of ["dark", "light"]) {
    for (const field of FIELDS) assert(PALETTES[scheme][field] === TODAY[scheme][field], `${scheme}.${field} is ${PALETTES[scheme][field]}, today ${TODAY[scheme][field]}`);
    for (const [field, hex] of Object.entries(OWN[scheme])) assert(PALETTES[scheme][field] === hex, `${scheme}.${field} (not ink) is ${PALETTES[scheme][field]}, today ${hex}`);
  }
  return `${FIELDS.length} ink colors and ${Object.keys(OWN.dark).length} of their own, in both schemes`;
});

await test("no token set: the palette is the rig's own, the very same object (every drawing as today's)", () => {
  for (const scheme of ["dark", "light"]) {
    assert(ink.deriveInk(scheme, {}) === PALETTES[scheme], `${scheme}: not the rig's own palette`);
    assert(ink.deriveInk(scheme, { body: TODAY[scheme].body }) === PALETTES[scheme], `${scheme}: today's own body given, a copy made`);
    assert(ink.deriveInk(scheme, { body: "not a color", shade: "" }) === PALETTES[scheme], `${scheme}: what isn't a color isn't ink`);
    assert(ink.inkKey(PALETTES[scheme]) === scheme, `${scheme}: its key is ${ink.inkKey(PALETTES[scheme])}`);
    assert(inkPalette(scheme) === PALETTES[scheme] && inkPalette(PALETTES[scheme]) === PALETTES[scheme], "the rig takes a name or the palette as it is");
  }
  assert(inkPalette("nothing") === PALETTES.dark, "an unknown name is the dark palette");
});

await test("the offsets are today's: today's body with each offset gives today's color (to a step of 1 in 255)", () => {
  let worst = 0;
  for (const scheme of ["dark", "light"]) {
    const [L, C, h] = ink.hexToOklch(TODAY[scheme].body);
    for (const [field, o] of Object.entries(ink.inkOffsets(scheme))) {
      const made = ink.oklchToHex([L + o.dL, C * o.kC, h + o.dh]);
      const off = Math.max(...[1, 3, 5].map((i) => Math.abs(parseInt(made.slice(i, i + 2), 16) - parseInt(TODAY[scheme][field].slice(i, i + 2), 16))));
      worst = Math.max(worst, off);
      assert(off <= 1, `${scheme}.${field}: ${made}, today ${TODAY[scheme][field]}`);
    }
  }
  return `worst ${worst} step`;
});

const INKS = { teal: "#1F9E8A", orange: "#E8742A", green: "#3E8E41", rose: "#D64F8A", deep: "#2B2F6B", pale: "#E9D46A" };
await test("one --tinta-ink makes the whole ink, in today's pattern: shade under the body, light and gloss over it, brows dark, the hue its own", () => {
  const out = [];
  for (const scheme of ["dark", "light"]) {
    for (const [name, body] of Object.entries(INKS)) {
      const p = ink.deriveInk(scheme, { body });
      assert(p !== PALETTES[scheme] && p.body === body && p.scheme === scheme, `${scheme} ${name}: not its own palette`);
      for (const field of FIELDS) assert(/^#[0-9A-F]{6}$/.test(p[field]), `${scheme} ${name}.${field} is ${p[field]}`);
      const L = (f) => ink.hexToOklch(p[f])[0];
      assert(L("shade") < L("body") && L("light") > L("body") && L("gloss") > L("body") && L("brow") < L("shade"), `${scheme} ${name}: lightness ${FIELDS.map((f) => `${f} ${L(f).toFixed(2)}`).join(", ")}`);
      if (scheme === "dark") assert(L("deep") < L("body"), `${scheme} ${name}: a prop's inside isn't darker on a dark ground`);
      else assert(L("deep") > L("body"), `${scheme} ${name}: a prop's inside isn't lighter on a light ground`);
      assert(p.tongue === p.light && p.glass === (scheme === "light" ? p.shade : p.light), `${scheme} ${name}: tongue or lens not as today's are`);
      // Each hue the body's turned by today's offset (a few degrees; sRGB's edge can turn a strong one a few more).
      const h = ink.hexToOklch(body)[2];
      for (const field of ["shade", "light", "brow"]) {
        const [, C, hf] = ink.hexToOklch(p[field]);
        const want = h + ink.inkOffsets(scheme)[field].dh;
        const dh = Math.abs(((hf - want + 540) % 360) - 180);
        if (C > 0.04) assert(dh < 8, `${scheme} ${name}.${field}: hue ${hf.toFixed(0)}°, the body's ${h.toFixed(0)}° turned by today's offset ${want.toFixed(0)}°`);
      }
      for (const [field, hex] of Object.entries(OWN[scheme])) assert(p[field] === hex, `${scheme} ${name}: ${field} changed (${p[field]})`);
      if (scheme === "dark" && name === "teal") out.push(FIELDS.map((f) => `${f} ${p[f]}`).join(", "));
    }
  }
  return `teal on dark: ${out[0]}`;
});

await test("a token set beside --tinta-ink wins; one set alone changes only itself", () => {
  const p = ink.deriveInk("dark", { body: "#1F9E8A", shade: "#123456", brow: "#000000" });
  assert(p.shade === "#123456" && p.brow === "#000000" && p.light !== TODAY.dark.light, `shade ${p.shade}, brow ${p.brow}, light ${p.light}`);
  const q = ink.deriveInk("light", { gloss: "#FFFFFF" });
  assert(q.gloss === "#FFFFFF" && q.body === TODAY.light.body && q.shade === TODAY.light.shade, `gloss alone: ${JSON.stringify(q)}`);
  assert(ink.inkKey(q) !== "light" && ink.inkKey(q).startsWith("light:"), `its key: ${ink.inkKey(q)}`);
});

await test("mixing two inks (the splash easing into a theme's): its ends are the two, its middle between them in OKLCH", () => {
  const to = ink.deriveInk("dark", { body: "#1F9E8A" });
  assert(ink.mixInk(PALETTES.dark, to, 0) === PALETTES.dark && ink.mixInk(PALETTES.dark, to, 1) === to, "its ends aren't the two inks");
  assert(ink.mixInk(PALETTES.dark, PALETTES.dark, 0.5) === PALETTES.dark, "one ink with itself isn't itself");
  const mid = ink.mixInk(PALETTES.dark, to, 0.5);
  const [La] = ink.hexToOklch(PALETTES.dark.body), [Lb] = ink.hexToOklch(to.body), [Lm] = ink.hexToOklch(mid.body);
  // Half way in OKLCH (a blue on the way, out of sRGB's reach, clipped into it: that lifts it a little).
  assert(Math.abs(Lm - (La + Lb) / 2) < 0.02 && Lm > Math.min(La, Lb) - 0.01 && Lm < Math.max(La, Lb) + 0.02, `the middle's lightness ${Lm.toFixed(3)}, between ${La.toFixed(3)} and ${Lb.toFixed(3)}`);
  const quarter = ink.mixInk(PALETTES.dark, to, 0.25), [Lq] = ink.hexToOklch(quarter.body);
  assert(Math.abs(Lq - La) < Math.abs(Lm - La) + 0.01, "a quarter of the way isn't nearer the start than half way");
  assert(mid.white === PALETTES.dark.white && mid.paper === PALETTES.dark.paper, "the eyes or props mixed");
  return `half way: ${mid.body}`;
});

// ---- the scan ----------------------------------------------------------------------------------------------------------
const violet = (hex) => {
  const [, C, h] = ink.hexToOklch(`#${hex.slice(1).toUpperCase()}`);
  return C > 0.05 && h > 250 && h < 320;
};
const INK_HEX = new Set(Object.values(TODAY).flatMap((t) => Object.values(t)));
const isInk = (hex) => INK_HEX.has(hex.toUpperCase()) || violet(hex);
// Where the defaults live (the rig's palettes table), and what splash.css may name: the splash's own rules (default ink, iOS's
// launch image), and a token's fallback.
function scanText(rel, text) {
  const found = [];
  if (rel.endsWith(".css")) {
    for (const line of text.split("\n")) {
      for (const m of line.matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
        if (!isInk(m[0])) continue;
        const splashOwn = /^\s*(:root\[data-theme="[a-z]+"\] )?\.lx-splash \.sp-[fs]-/.test(line) || /^\s*:root\[data-theme="paper"\] \.lx-splash .*:root\[data-theme="sepia"\] \.lx-splash/.test(line);
        const fallback = new RegExp(`var\\(--tinta-[a-z-]+, ${m[0]}\\)`).test(line);
        if (!splashOwn && !fallback) found.push(`${rel}: ${line.trim().slice(0, 90)}`);
      }
    }
    return found;
  }
  let body = text;
  if (rel.endsWith("rig/inkdrop/inkdrop.js")) {
    const start = body.indexOf("export const PALETTES = {"), end = body.indexOf("\n};", start);
    if (start < 0 || end < 0) return [`${rel}: no PALETTES table`];
    body = body.slice(0, start) + body.slice(end);
  }
  for (const m of body.matchAll(/#[0-9A-Fa-f]{6}\b/g)) if (isInk(m[0])) found.push(`${rel}: ${m[0]}`);
  return found;
}
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const TINTA_FILES = [...walk(join(PUBLIC, "js/character")).filter((f) => f.endsWith(".js")), join(PUBLIC, "css/splash.css")];

await test("the scan catches a planted ink color first (in a drawing, a loading rule, the palettes' neighbors), and passes a fallback and the splash's own", () => {
  const plants = [
    ["js/character/rig/kit/liquid.js", 'const c = "#7C5CE6";'],
    ["js/character/stand.js", "fill: '#6a4fd8'"],
    ["css/splash.css", ".lx-loading .sp-f-drop-body { fill: #7C5CE6; }"],
    ["js/character/rig/inkdrop/inkdrop.js", 'export const PALETTES = {\n  dark: { body: "#7C5CE6" },\n};\nconst stray = "#5E40C4";'],
  ];
  for (const [rel, text] of plants) assert(scanText(rel, text).length, `missed: ${rel}`);
  const fine = [
    ["css/splash.css", ".lx-loading .sp-f-drop-shade { fill: var(--tinta-ink-shade, var(--tinta-auto-shade, #5E40C4)); }"],
    ["css/splash.css", ".lx-splash .sp-f-drop-body { fill: #7C5CE6; }"],
    ["js/character/rig/inkdrop/inkdrop.js", 'export const PALETTES = {\n  dark: { body: "#7C5CE6" },\n};'],
    ["js/character/x.js", 'const eye = "#FFFFFF", ground = "#1d1c19";'],
  ];
  for (const [rel, text] of fine) assert(!scanText(rel, text).length, `flagged: ${rel}: ${scanText(rel, text)}`);
  return `${plants.length} plants caught, ${fine.length} allowed`;
});

await test("every Tinta file reads its ink from the palette or the tokens: none names an ink color", () => {
  const found = TINTA_FILES.flatMap((f) => scanText(relative(PUBLIC, f), readFileSync(f, "utf8")));
  assert(!found.length, found.slice(0, 8).join(" | "));
  // The page's static Tinta (the splash's frames, the shell's loading) is colored by classes: no fill or stroke of ink in its markup.
  const page = readFileSync(join(PUBLIC, "app/index.html"), "utf8");
  const marked = [...page.matchAll(/\s(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)].filter((m) => isInk(m[1]));
  assert(!marked.length, `app/index.html: ${marked.length} ink colors in its markup`);
  return `${TINTA_FILES.length} files and app/index.html`;
});

await test("splash.css: the loading Tinta takes the tokens with today's colors as each fallback, and the splash eases into a theme's ink", () => {
  const css = readFileSync(join(PUBLIC, "css/splash.css"), "utf8");
  for (const [scheme, selector] of [["dark", ""], ["light", ':root[data-theme="paper"] ']]) {
    const want = { "drop-body": `var(--tinta-ink, ${TODAY[scheme].body})`, "drop-shade": `var(--tinta-ink-shade, var(--tinta-auto-shade, ${TODAY[scheme].shade}))`, "drop-brow": `var(--tinta-ink-brow, var(--tinta-auto-brow, ${TODAY[scheme].brow}))` };
    for (const [role, value] of Object.entries(want)) {
      const line = `${selector}.lx-loading .sp-f-${role} { fill: ${value}; }`;
      assert(css.includes(line), `missing: ${line}`);
    }
  }
  assert(/@supports \(color: oklch\(from red l c h\)\)/.test(css) && /--tinta-auto-shade: oklch\(from var\(--tinta-ink\)/.test(css), "no derivation from --tinta-ink");
  assert(css.includes(":root[data-tinta-themed] .lx-splash[data-going] .sp-f-drop-body { fill: color-mix(in oklch, var(--tinta-was-body), var(--tinta-now-body) calc(var(--lx-splash-ink, 0) * 100%)); }"), "no easing for the splash's drop");
  assert(css.includes(`.lx-splash .sp-f-drop-body { fill: ${TODAY.dark.body}; }`), "the splash's first frame isn't today's ink");
});

// ---- the page: firsts.js's key, readInk, publishInk, with the page stood in ----------------------------------------------
const stand = { scheme: "dark", tokens: {} };
const props = new Map(), attrs = new Set();
globalThis.document = { documentElement: { style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) }, toggleAttribute: (a, on) => (on ? attrs.add(a) : attrs.delete(a)) } };
globalThis.getComputedStyle = () => ({ colorScheme: stand.scheme, getPropertyValue: (name) => stand.tokens[name] ?? "" });
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
globalThis.addEventListener ??= () => {};

await test("firsts.js's key: the scheme alone with no token (as before: kept first frames stay good), the tokens' text with one", async () => {
  const { inkOf } = await import(join(PUBLIC, "js/character/firsts.js"));
  stand.scheme = "dark"; stand.tokens = {};
  assert(inkOf() === "dark", `dark: ${inkOf()}`);
  stand.scheme = "light only";
  assert(inkOf() === "light", `light: ${inkOf()}`);
  stand.tokens = { [TOKENS.body]: "#1f9e8a" };
  assert(inkOf().startsWith("light:") && inkOf().includes("#1f9e8a"), `with a token: ${inkOf()}`);
  return inkOf();
});

await test("readInk: the scheme's own with nothing set, the theme's ink with --tinta-ink (any case), and publishInk only while one is set", () => {
  stand.scheme = "dark"; stand.tokens = {};
  const none = ink.readInk();
  assert(none === PALETTES.dark, "not the rig's own with nothing set");
  ink.publishInk(none);
  assert(!attrs.has("data-tinta-themed") && !props.size, `published with nothing set: ${[...props.keys()]}`);
  stand.tokens = { [TOKENS.body]: " #1f9e8a " };
  const teal = ink.readInk();
  assert(teal.body === "#1F9E8A" && teal.scheme === "dark", `read ${teal.body}`);
  ink.publishInk(teal);
  assert(attrs.has("data-tinta-themed") && props.get("--tinta-now-body") === "#1F9E8A" && props.get("--tinta-was-body") === TODAY.dark.body, `published: ${[...props].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  stand.tokens = {};
  ink.publishInk(ink.readInk());
  assert(!attrs.has("data-tinta-themed") && !props.size, "left on <html> once the theme set none");
  return `${Object.keys(TOKENS).length} tokens: ${Object.values(TOKENS).join(", ")}`;
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
