// The safety check for custom CSS, run before any CSS is saved, applied or shared. Pure (no DOM), so the server can
// run the same check on shared themes and Node can test it (scripts/test-css-safety.mjs).
//
// CSS can't run code. The risks are reaching another server (a tracking image, or attribute selectors that leak what
// you type one request at a time) and old browser features that ran script. The page's CSP is the backstop (images
// and fonts only from this site, data: or blob:); this check makes the CSS itself honest, so a shared theme contains
// only what it can actually do.
//
// How: escapes are decoded once, left to right, the way CSS reads them, so nothing can be spelled around the checks
// (u\72l is url). Escapes that stand for letters, digits or URL punctuation become those characters; the rest stay
// escaped, re-written so they can't absorb the next character. Comments go (before and after decoding). Then whole
// function calls are removed, brackets and quotes included: url() unless it's a data: image or font, image-set(),
// src() and expression(); then @import, -moz-binding, behavior and javascript:.

export const CSS_LIMIT_BYTES = 100_000;

export class CssSafetyError extends Error {}

const SAFE_URL = /^data:(image\/(png|jpeg|webp|gif|avif|svg\+xml)|font\/(woff2?|ttf|otf)|application\/(font-woff2?|x-font-ttf|x-font-otf))[;,]/i;
const DECODED = /^[0-9a-z@():\/._,%-]$/i;
const COMMENTS = /\/\*[\s\S]*?(\*\/|$)/g;

/** Returns { css, removed: [{ what, count }] }. Throws CssSafetyError when the CSS is over the size limit. */
export function sanitizeCss(input) {
  let css = String(input ?? "");
  if (new TextEncoder().encode(css).length > CSS_LIMIT_BYTES) {
    throw new CssSafetyError(`Custom CSS can be up to ${CSS_LIMIT_BYTES / 1000} KB`);
  }
  const removed = new Map();
  const note = (what) => removed.set(what, (removed.get(what) ?? 0) + 1);

  css = css.replace(COMMENTS, "");
  css = css.replace(/\\(?:([0-9a-f]{1,6})[ \t\r\n\f]?|([\s\S]))/gi, (whole, hex, char) => {
    let decoded = char;
    if (hex) {
      const code = parseInt(hex, 16);
      decoded = code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�";
    }
    if (DECODED.test(decoded)) {
      note("escaped letters");
      return decoded;
    }
    // Kept: a hex escape ends with a space, so a decoded digit after it can't extend it into a letter.
    return hex ? `\\${hex} ` : whole;
  });
  css = css.replace(COMMENTS, "");

  css = replaceCalls(css, "url", (args) => {
    const target = args.trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
    if (SAFE_URL.test(target)) return null;
    note("outside links");
    return "none";
  });
  css = replaceCalls(css, "(?:-webkit-)?image-set", () => (note("image-set()"), "none"));
  css = replaceCalls(css, "src", () => (note("src()"), "none"));
  css = replaceCalls(css, "expression", () => (note("expression()"), "none"));

  const strip = (pattern, what, keep = "") => {
    css = css.replace(pattern, (whole, before = "") => {
      note(what);
      return keep === "before" ? before : keep;
    });
  };
  strip(/@import\b[^;{}]*;?/gi, "@import");
  strip(/-moz-binding\s*:[^;}]*/gi, "-moz-binding");
  strip(/(^|[;{\s])behavior\s*:[^;}]*/gi, "behavior", "before");
  strip(/javascript\s*:/gi, "javascript:");

  return { css, removed: [...removed].map(([what, count]) => ({ what, count })) };
}

/**
 * Replaces every call of a CSS function, its whole argument list included (nested brackets and quoted strings are
 * skipped over properly). replace(args) returns the replacement, or null to keep the call as it was. The name must
 * stand alone: my-url( or _src( are other functions.
 */
function replaceCalls(css, name, replace) {
  // A lookbehind, not a consumed character, so a call straight after another one (url(a)url(b)) is still found.
  const pattern = new RegExp(`(?<![-\\w])(?:${name})\\s*\\(`, "gi");
  let out = "";
  let last = 0;
  let match;
  while ((match = pattern.exec(css))) {
    const start = match.index;
    const open = pattern.lastIndex;
    let i = open;
    let depth = 1;
    let quote = null;
    for (; i < css.length && depth > 0; i++) {
      const ch = css[i];
      if (ch === "\\") i++;
      else if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    const call = css.slice(start, i);
    const args = css.slice(open, depth === 0 ? i - 1 : i);
    const replacement = replace(args);
    out += css.slice(last, start) + (replacement ?? call);
    last = i;
    pattern.lastIndex = i;
  }
  return out + css.slice(last);
}
