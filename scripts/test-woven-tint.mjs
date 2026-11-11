// The reader's tint on woven words (css/lx/reader.css --reader-woven): the theme's own way-forward color (--go) mixed toward the text's
// ink, read from the stylesheet as written, must keep 4.5:1 on the canvas in Graphite and every ready-made theme (lx/theme-presets.js).
// A control first: the unmixed --go must fail somewhere, so this test can fail.
// Usage: node scripts/test-woven-tint.mjs   (exit 0 = pass)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../public/js/lx/theme-presets.js";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const ok = (cond, name, detail = "") => { console.log(`${cond ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`); if (!cond) failed++; };

const css = readFileSync(join(APP, "public/css/lx/reader.css"), "utf8");
const rule = css.match(/--reader-woven:\s*color-mix\(in oklab,\s*var\(--go\)\s*(\d+(?:\.\d+)?)%,\s*var\(--ink-1\)\)/);
ok(Boolean(rule), "the tint is --go mixed toward --ink-1 in oklab", rule ? `${rule[1]}% --go` : "rule not found");
if (!rule) process.exit(1);
const towardInk = 1 - Number(rule[1]) / 100;

// Graphite is the stylesheet's own (tokens.css): --go is --art-violet.
const themes = [["graphite", { "--go": "#7c5ce6", "--ink-1": "#f1efea", "--canvas": "#000000" }]];
for (const th of P.READY_THEMES) themes.push([th.id, P.readyTokens(th.id)]);
ok(themes.length === P.READY_THEMES.length + 1 && themes.every(([, t]) => t["--go"] && t["--ink-1"] && t["--canvas"]), "every theme has --go, --ink-1 and --canvas", `${themes.length} themes`);

const worst = (t) => themes.map(([id, k]) => [P.contrast(P.mix(k["--go"], k["--ink-1"], t), k["--canvas"]), id]).sort((a, b) => a[0] - b[0])[0];

const control = worst(0);
ok(control[0] < 4.5, "control: --go unmixed fails somewhere (the test can fail)", `${control[0].toFixed(2)} in ${control[1]}`);

const [c, id] = worst(towardInk);
ok(c >= 4.5, "the tint as written keeps 4.5:1 on the canvas in every theme", `worst ${c.toFixed(2)} in ${id}`);

const g = P.mix("#7c5ce6", "#f1efea", towardInk);
const [L, a, b] = P.toOklab(P.hexToRgb(g));
const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
ok(hue > 260 && hue < 320, "Graphite's tint is still a violet", `${g}, oklab hue ${hue.toFixed(0)}°`);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
