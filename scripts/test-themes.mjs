// The ready-made themes (public/js/lx/theme-presets.js): every one, general, motif and flag, readable and colorblind-safe, by the numbers.
//   - each of its contrast pairs (contrastPairs: the inks on every surface and on its backdrop, the way forward, the tab you're on, right,
//     wrong and slipping on the canvas and their tints, the focus ring) at its ratio;
//   - right and wrong at least 0.12 apart (OKLab) as each kind of color blindness sees them, and never the same hue family alone;
//   - wrong at least WRONG_FROM_GO (0.1, OKLab) from the way forward and from slipping; a red way forward with white words at 4.5:1, in its accent's hue;
//   - a flag theme for every language lang/flags.js gives a flag, its colors what build-flag-themes.mjs reads off the flag now;
//   - ids unique and well formed, names unique, every motif's language one the app has;
//   - every theme the app offers (READY_THEMES) with its tile's picture, as build-theme-tiles.mjs made it;
//   - an avatar's ring (--ink-2) on a lit or pressed row (--fill-active) at 3:1;
//   - the sidebar's lit tab (lx/redesign.css) on that fill: its words at 4.5:1, its symbol at 3:1.
// Each rule first catches a plant. node scripts/test-themes.mjs   (exit 0 = pass)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = await import("../public/js/lx/theme-presets.js");
const { FLAG_COLORS } = await import("../public/js/lx/theme-flags.js");
const { FLAGS } = await import("../public/js/lang/flags.js");
const { LANGUAGES } = await import("../public/js/lang/index.js");
const { BUILT_IN_THEMES } = await import("../public/js/lx/look-rules.js");

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    const note = fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};

// The flag themes as the app offers them: one per flag (India's stands for four languages), each palette worked out from its flag.
const flagThemes = P.READY_THEMES.filter((t) => t.group === "flag").map((t) => ({ ...P.readyPalette(t.id), id: t.id, name: t.name, langs: t.langs }));
const motifThemes = Object.entries(P.MOTIFS).map(([lang, t]) => ({ lang, ...t }));
const ALL = [...P.GENERAL, ...motifThemes, ...flagThemes];
const unreadable = (theme) => P.contrastPairs(P.themeTokens(theme), theme).filter(([, a, b, ratio]) => P.contrast(a, b) < ratio - 1e-9);
const MIN_APART = 0.12;

test("a theme that doesn't read is caught (plants)", () => {
  // A pale ink on a pale canvas, and a backdrop too bright to read on: each must fail its pairs even after fitting can do no more.
  const plantedTokens = { ...P.themeTokens(P.GENERAL[1]), "--ink-2": "#d9cfc0" };
  ok(P.contrastPairs(plantedTokens).some(([what, a, b, r]) => what.startsWith("labels") && P.contrast(a, b) < r), "a pale label passed");
  const glaring = { ...P.GENERAL[0], backdrop: [["glow", "#ffffff", 0.9, 50, 0, 60]] };
  ok(unreadable(glaring).length > 0, "text on a glaring backdrop passed");
  ok(P.apartFor("#5ab0f0", "#62b4f0") < MIN_APART, "two blues counted apart");
});

test(`every theme reads (${ALL.length}: ${P.GENERAL.length} general, ${motifThemes.length} motif, ${flagThemes.length} flag)`, () => {
  const bad = ALL.map((t) => [t.id, unreadable(t)]).filter(([, f]) => f.length);
  ok(!bad.length, bad.map(([id, f]) => `${id}: ${f.map(([w, a, b, r]) => `${w} ${P.contrast(a, b).toFixed(2)} < ${r}`).join(", ")}`).join("; "));
});

// An avatar on a row lit as the page you're on (Settings' pane on a wide screen) or pressed: the row is --fill-active, the circle's own fill, so
// the circle keeps a hairline ring in --ink-2 (components.css), at 3:1 at least on that fill as it shows over the canvas.
const litFill = (tokens) => {
  const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(tokens["--fill-active"]);
  return m ? P.over(P.rgbToHex([m[1], m[2], m[3]].map((v) => Number(v) / 255)), Number(m[4]), tokens["--canvas"]) : tokens["--fill-active"];
};
const ringFaint = (tokens) => P.contrast(tokens["--ink-2"], litFill(tokens)) < 3;
test(`an avatar's ring (--ink-2) on a lit or pressed row (--fill-active) at 3:1 in every theme (${ALL.length})`, () => {
  ok(ringFaint({ ...P.themeTokens(P.GENERAL[0]), "--ink-2": P.themeTokens(P.GENERAL[0])["--ink-4"] }), "a ring in the faintest ink passed");
  const low = ALL.map((t) => [t.id, P.contrast(P.themeTokens(t)["--ink-2"], litFill(P.themeTokens(t)))]).sort((a, b) => a[1] - b[1]);
  ok(low[0][1] >= 3, low.filter(([, r]) => r < 3).map(([id, r]) => `${id} ${r.toFixed(2)}`).join(", "));
  return `the lowest ${low[0][1].toFixed(2)} (${low[0][0]})`;
});

// The sidebar's lit tab (a wide screen: lx/redesign.css, its 1024 px block): the tokens its words and its symbol are drawn in, read off the
// stylesheet, each on the lit fill (--fill-active over the canvas): the words at 4.5:1, the symbol, a graphic, at 3:1.
const LIT_TAB = '[data-part="app"] > [data-part="tab-bar"] [data-part="tab"][data-state="active"]';
function litTabTokens(css) {
  const out = { words: null, symbol: null };
  for (let at = css.indexOf("@media (min-width: 1024px)"); at >= 0; at = css.indexOf("@media (min-width: 1024px)", at + 1)) {
    let depth = 0;
    let end = css.indexOf("{", at);
    for (let i = end; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    const block = css.slice(at, end);
    const rule = (selector) => new RegExp(`${selector.replace(/[[\]().*+?^$|\\]/g, "\\$&")} \\{ color: var\\((--[\\w-]+)\\); \\}`).exec(block)?.[1] ?? null;
    out.words = rule(LIT_TAB) ?? out.words;
    out.symbol = rule(`${LIT_TAB} > :not(.lx-tab-label)`) ?? out.symbol;
  }
  return out;
}
test(`the sidebar's lit tab on its fill in every theme (${ALL.length}): its words at 4.5:1, its symbol at 3:1 (lx/redesign.css)`, () => {
  const planted = litTabTokens(`@media (min-width: 1024px) {\n    ${LIT_TAB} { color: var(--tab-on); }\n  }`);
  ok(planted.words === "--tab-on" && ALL.some((t) => P.contrast(P.themeTokens(t)["--tab-on"], litFill(P.themeTokens(t))) < 4.5), "words in the tab's purple passed in every theme");
  const tokens = litTabTokens(readFileSync(join(APP, "public/css/lx/redesign.css"), "utf8"));
  const words = tokens.words ?? "--tab-on";
  const symbol = tokens.symbol ?? words;
  const low = (token, ratio) => ALL.map((t) => [t.id, P.contrast(P.themeTokens(t)[token], litFill(P.themeTokens(t)))]).filter(([, r]) => r < ratio);
  const faint = [...low(words, 4.5).map(([id, r]) => `${id}: words (${words}) ${r.toFixed(2)}`), ...low(symbol, 3).map(([id, r]) => `${id}: symbol (${symbol}) ${r.toFixed(2)}`)];
  ok(!faint.length, `${faint.length} under: ${faint.slice(0, 8).join(", ")}${faint.length > 8 ? " …" : ""}`);
  const least = (token) => Math.min(...ALL.map((t) => P.contrast(P.themeTokens(t)[token], litFill(P.themeTokens(t)))));
  return `words ${words} at ${least(words).toFixed(2)} at the lowest, symbol ${symbol} at ${least(symbol).toFixed(2)}`;
});

test(`right and wrong at least ${MIN_APART} apart in every kind of color blindness, in every theme`, () => {
  let least = [Infinity, ""];
  for (const t of ALL) {
    const tokens = P.themeTokens(t);
    const apart = P.apartFor(tokens["--m-right"], tokens["--m-wrong"]);
    if (apart < least[0]) least = [apart, t.id];
  }
  ok(least[0] >= MIN_APART, `${least[1]}: ${least[0].toFixed(3)}`);
  return `the closest, ${least[1]}: ${least[0].toFixed(3)}`;
});

// Wrong and the way forward (a wrong answer's panel and its Continue) apart by WRONG_FROM_GO in OKLab: about five of its just-noticeable steps
// (about 0.02 each), the same order as MIN_APART, which right and wrong keep even to color-blind eyes. Ember's two before the rule, 0.033 apart, the plant.
const wrongNearGo = (tokens) => P.distance(tokens["--m-wrong"], tokens["--go"]) < P.WRONG_FROM_GO;
test(`wrong at least ${P.WRONG_FROM_GO} from the way forward (OKLab), in every theme; slipping too`, () => {
  ok(wrongNearGo({ "--m-wrong": "#fe825b", "--go": "#ff7834" }), "ember's wrong from before, beside its way forward, passed");
  const near = [];
  let least = [Infinity, ""];
  for (const t of ALL) {
    const tokens = P.themeTokens(t);
    if (wrongNearGo(tokens)) near.push(`${t.id} ${P.distance(tokens["--m-wrong"], tokens["--go"]).toFixed(3)}`);
    if (P.distance(tokens["--m-wrong"], tokens["--m-slipping"]) < P.WRONG_FROM_GO) near.push(`${t.id}: wrong near slipping`);
    const d = P.distance(tokens["--m-wrong"], tokens["--go"]);
    if (d < least[0]) least = [d, t.id];
  }
  ok(!near.length, near.join(", "));
  return `the closest, ${least[1]}: ${least[0].toFixed(3)}`;
});

// A way forward in a saturated red takes white words at 4.5:1, as a red button does: the red deepened in its own hue (within a degree of the
// theme's accent), never near-black words on it. Germany's pure red with its near-black words, from before, the plant.
const redWithoutWhite = (tokens) => P.saturatedRed(tokens["--go"]) && (tokens["--on-go"] !== "#ffffff" || P.contrast("#ffffff", tokens["--go"]) < 4.5);
test("a red way forward takes white words at 4.5:1, its hue the accent's, in every theme", () => {
  ok(redWithoutWhite({ "--go": "#ff0000", "--on-go": "#010102" }), "a pure red with near-black words passed");
  const bad = [];
  let reds = 0;
  for (const t of ALL) {
    const tokens = P.themeTokens(t);
    if (!P.saturatedRed(tokens["--go"])) continue;
    reds++;
    if (redWithoutWhite(tokens)) bad.push(`${t.id} ${tokens["--go"]} with ${tokens["--on-go"]}`);
    const turn = Math.abs(((P.lchOf(t.accent)[2] - P.lchOf(tokens["--go"])[2] + 540) % 360) - 180);
    if (turn > 1) bad.push(`${t.id}: its red turned ${turn.toFixed(1)}° from ${t.accent}`);
  }
  ok(!bad.length, bad.join(", "));
  return `${reds} red ways forward, every one with white words`;
});

test("studied and not studied are told apart by lightness alone (one ink, five steps), in every theme", () => {
  for (const t of ALL) {
    const tk = P.themeTokens(t);
    ok(tk["--strength-4"] === tk["--ink-1"], `${t.id}: the full step isn't the main ink`);
    const alphas = [0, 1, 2, 3].map((i) => Number(/([\d.]+)\)$/.exec(tk[`--strength-${i}`])?.[1]));
    ok(alphas.every((a, i) => i === 0 || a > alphas[i - 1]), `${t.id}: the steps don't climb`);
  }
});

test("a flag theme for every language with a flag, from the flag as it is now; one per flag, its base the palette's own", () => {
  const missing = Object.keys(FLAGS).filter((lang) => !FLAG_COLORS[lang] || !P.flagThemeOf(lang)?.langs.includes(lang));
  ok(!missing.length, `no flag theme: ${missing.join(", ")}`);
  const flags = flagThemes.map((t) => FLAG_COLORS[t.langs[0]].flag);
  ok(new Set(flags).size === flags.length && new Set(Object.values(FLAGS)).size === flags.length, "a flag with two themes, or one with none");
  const wrongBase = P.READY_THEMES.filter((t) => t.group === "flag" && t.base !== P.baseOf(P.readyPalette(t.id)));
  ok(!wrongBase.length, `a flag theme's base isn't its palette's: ${wrongBase.map((t) => t.id)}`);
  const out = execFileSync(process.execPath, [join(APP, "scripts/build-flag-themes.mjs"), "--check"], { encoding: "utf8" });
  return out.trim();
});

// Each theme's inks and the grounds they're held to, as the page draws them: a step to come is --strength-0 over the canvas, the line a hundred's bar
// fills tokens.css --line (the ink at 14% over the canvas).
const hueOf = (hex) => {
  const [, a, b] = P.toOklab(P.hexToRgb(hex));
  return { c: Math.hypot(a, b), h: (Math.atan2(b, a) * 180) / Math.PI };
};
const sameHue = (x, y) => {
  const [hx, hy] = [hueOf(x), hueOf(y)];
  if (hy.c < 0.03) return hx.c < 0.03; // a gray or black accent (Brittany's): a gray or black ink
  return Math.abs(((hx.h - hy.h + 540) % 360) - 180) <= 20;
};
const INKS = ALL.map((t) => {
  const k = P.themeTokens(t);
  const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(k["--strength-0"]);
  const toCome = P.over(P.rgbToHex([m[1], m[2], m[3]].map((v) => Number(v) / 255)), Number(m[4]), k["--canvas"]);
  return { id: t.id, ink: k["--tinta-ink"], progress: k["--progress-ink"], canvas: k["--canvas"], toCome, line: P.over(k["--ink-1"], 0.14, k["--canvas"]), accents: [t.accent, t.accent2 ?? t.accent] };
});

test(`Tinta's ink (--tinta-ink) in every theme: his edge ${P.TINTA_READS.edge}:1 on its canvas, his white eyes ${P.TINTA_READS.eyes}:1 on him, room for his shade and shine, in the hue of one of the theme's own two accents`, () => {
  // Plants: an ink as dark as a dark canvas, a yellow too light for his eyes, a black ink with no room for his shade; the fitter never keeps a
  // color that doesn't read.
  ok(!P.tintaReads("#1a1d24", "#0b0f17"), "an ink as dark as its canvas passed");
  ok(!P.tintaReads("#f8e509", "#0b0f17"), "a yellow too light for his eyes passed");
  ok(!P.tintaReads("#000000", "#f3f3f3"), "a black ink with no room for his shade passed");
  ok(P.tintaInk("#f8e509", "#0b0f17") !== "#f8e509", "a yellow that doesn't read was kept as it is");
  const bad = INKS.filter((r) => !r.ink || !P.tintaReads(r.ink, r.canvas) || !r.accents.some((a) => sameHue(r.ink, a)));
  ok(!bad.length, bad.map((r) => `${r.id}: ${r.ink ?? "none"} on ${r.canvas}`).join(", "));
  const edge = Math.min(...INKS.map((r) => P.contrast(r.ink, r.canvas)));
  const eyes = Math.min(...INKS.map((r) => P.contrast("#ffffff", r.ink)));
  return `${INKS.length} inks; the lowest edge ${edge.toFixed(2)}:1, the lowest eyes ${eyes.toFixed(2)}:1`;
});

test(`progress in the theme's ink (--progress-ink) in every theme: ${P.PROGRESS_READS}:1 on its canvas, a session's step to come and the line a bar fills, in his ink's hue`, () => {
  // Plant: an ink at 3:1 on a dark canvas alone fails the step to come and the line beside it.
  const grounds = P.progressGrounds("#0b0f17", "#e6e7e7", "#e6e7e7");
  const onCanvasOnly = ["#b7272f", "#a8242b", "#c02a33"].find((c) => P.contrast(c, grounds[0]) >= 3 && P.contrast(c, grounds[2]) < 3);
  ok(onCanvasOnly && !P.progressReads(onCanvasOnly, grounds), "a color at 3:1 on the canvas alone passed a bar's line");
  const bad = INKS.filter((r) => !r.progress || !P.progressReads(r.progress, [r.canvas, r.toCome, r.line]) || !sameHue(r.progress, r.ink));
  ok(!bad.length, bad.map((r) => `${r.id}: ${r.progress ?? "none"}`).join(", "));
  const low = Math.min(...INKS.map((r) => Math.min(...[r.canvas, r.toCome, r.line].map((g) => P.contrast(r.progress, g)))));
  return `${INKS.length} themes; the lowest ${low.toFixed(2)}:1`;
});

test("a tile's stand-in (standInTokens) is the theme's own canvas, hairline and backdrop, in every theme (a plant that differs is caught)", () => {
  const differs = (stand, full) => Object.keys(stand).filter((k) => stand[k] !== full[k]);
  const p0 = P.GENERAL[0];
  ok(differs({ ...P.standInTokens(p0), "--hair": "rgba(0, 0, 0, 0.5)" }, P.themeTokens(p0)).length === 1, "a planted hairline passed");
  const bad = ALL.filter((t) => differs(P.standInTokens(t), P.themeTokens(t)).length || !P.standInTokens(t)["--canvas"]);
  ok(!bad.length, bad.map((t) => t.id).join(", "));
  const ready = P.READY_THEMES.filter((t) => differs(P.readyStandIn(t.id), P.readyTokens(t.id)).length);
  ok(!ready.length, `readyStandIn differs: ${ready.map((t) => t.id)}`);
});

test("every motif theme's scene: its picture (public/themes/motifs/<id>.webp) at 1290 × 2796, its top its palette's canvas, its cut what the picture gives (build-motif-themes.mjs --check), its tokens a box from the first frame", () => {
  // Plant: a cut that isn't the picture's is caught by the check.
  const file = join(APP, "public/js/lx/theme-motifs.js");
  const kept = readFileSync(file, "utf8");
  let caught = false;
  try {
    writeFileSync(file, kept.replace(/"from": [\d.]+/, '"from": 0.01'));
    execFileSync(process.execPath, [join(APP, "scripts/build-motif-themes.mjs"), "--check"], { stdio: "pipe" });
  } catch {
    caught = true;
  } finally {
    writeFileSync(file, kept);
  }
  ok(caught, "a planted cut passed the check");
  execFileSync(process.execPath, [join(APP, "scripts/build-motif-themes.mjs"), "--check"], { stdio: "pipe" });
  const bad = motifThemes.filter((m) => {
    const k = P.themeTokens(m);
    return !/^url\("\/themes\/motifs\/[a-z-]+\.webp"\)$/.test(k["--scene"] ?? "") || !/^\d+ \/ \d+$/.test(k["--scene-ratio"] ?? "") || k["--scene-content"] !== '""' || k["--image-background"];
  });
  ok(!bad.length, `a motif without its scene's tokens, or with a picture behind its page: ${bad.map((m) => m.id)}`);
  return `${motifThemes.length} scenes`;
});

test("ids and names: unique, well formed; every motif's language the app's", () => {
  const ids = ALL.map((t) => t.id);
  ok(new Set(ids).size === ids.length, `an id twice: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(", ")}`);
  ok(ids.every((id) => /^[a-z][a-z0-9-]{1,40}$/.test(id)), "an id badly formed");
  const names = [...P.GENERAL, ...motifThemes].map((t) => t.name);
  ok(new Set(names).size === names.length, "a name twice");
  const offered = P.READY_THEMES.map((t) => t.name);
  ok(new Set(offered).size === offered.length && offered.every((n) => n && n.length <= 16 && !/^[A-Z]{2}$/.test(n)), `an offered theme's name twice, missing, a code or long: ${offered.filter((n, i) => !n || n.length > 16 || offered.indexOf(n) !== i)}`);
  ok(motifThemes.every((t) => LANGUAGES[t.lang]), `a motif for a language the app hasn't: ${motifThemes.filter((t) => !LANGUAGES[t.lang]).map((t) => t.lang)}`);
  ok(P.GENERAL.every((t) => t.about && t.about.length <= 80), "a general theme without its idea in a line");
  // American spelling, the app's, in every theme's name and line (7 Nov: Cantonese's motif shipped as "Harbour lights"); the rule catches a plant first.
  const BRITISH = /\b(harbour|colour|grey|centre|favour|flavour|honour|neighbour|theatre|metre|litre|jewellery|catalogue)\w*/i;
  const british = (text) => BRITISH.exec(text ?? "")?.[0] ?? null;
  ok(british("Harbour lights") === "Harbour" && british("Tiles coloured blue") === "coloured" && !british("Harbor lights, in color"), "the spelling rule catches a planted British spelling");
  const spelled = [...P.GENERAL, ...motifThemes].flatMap((t) => [t.name, t.about]).filter((text) => british(text));
  ok(!spelled.length, `a theme's words not in American spelling: ${spelled.join(" | ")}`);
});

test("every theme the picker offers, built in or ready-made, has its tile's picture (public/themes/tiles/<id>.webp), the one tiles.json names", () => {
  const index = JSON.parse(readFileSync(join(APP, "public/themes/tiles/tiles.json"), "utf8"));
  const problems = [];
  for (const { id } of [...BUILT_IN_THEMES, ...P.READY_THEMES]) {
    const file = join(APP, "public/themes/tiles", `${id}.webp`);
    if (!existsSync(file)) problems.push(`${id}: no picture (scripts/build-theme-tiles.mjs makes it)`);
    else if (createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16) !== index[id]) problems.push(`${id}: not the picture tiles.json names`);
  }
  ok(!problems.length, problems.join("; "));
  return `${BUILT_IN_THEMES.length + P.READY_THEMES.length} pictures`;
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
