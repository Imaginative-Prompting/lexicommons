// The string literals in a JavaScript file, and which of them read like words a person sees (lx/i18n.js: every one of
// those goes through t()). A small tokenizer: comments skipped, strings and template literals read (a template's
// ${…} read as code, its text kept with {} where each one was), regular expressions told from division by what came
// before. Pure; scripts/test-i18n.mjs runs it over every file i18n-areas.json says has moved.

const REGEX_AFTER = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);
const REGEX_AFTER_WORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await", "instanceof"]);

/**
 * Every string literal in source: [{ text, line, template, start, end, exprs }]. text is the literal's value (escapes left
 * as written; a template's ${…} as {}), line its first line (1-based), start and end its place in source (quotes included),
 * exprs a template's expressions in order ({ source, start, end }). Throws on a literal that never closes.
 */
export function literalsOf(source) {
  const out = [];
  let i = 0;
  let line = 1;
  let last = ""; // the last significant token's text (a punctuator, or a word)
  const n = source.length;
  const advance = (to) => {
    for (let k = i; k < to; k++) if (source[k] === "\n") line++;
    i = to;
  };
  function readQuoted(quote) {
    const startLine = line;
    const start = i;
    let j = i + 1;
    let text = "";
    while (j < n && source[j] !== quote) {
      if (source[j] === "\\") {
        text += source.slice(j, j + 2);
        j += 2;
        continue;
      }
      if (source[j] === "\n") throw new Error(`line ${startLine}: a ${quote} string runs past its line`);
      text += source[j++];
    }
    if (j >= n) throw new Error(`line ${startLine}: a ${quote} string never closes`);
    advance(j + 1);
    out.push({ text, line: startLine, template: false, start, end: j + 1, exprs: [] });
    last = "lit";
  }
  function readTemplate() {
    const startLine = line;
    const start = i;
    const exprs = [];
    let j = i + 1;
    let text = "";
    while (j < n && source[j] !== "`") {
      if (source[j] === "\\") {
        text += source.slice(j, j + 2);
        j += 2;
        continue;
      }
      if (source[j] === "$" && source[j + 1] === "{") {
        // The expression inside, read as code (its own strings are literals too) up to its closing brace.
        advance(j + 2);
        last = "{";
        const exprStart = i;
        readCode(true);
        exprs.push({ source: source.slice(exprStart, i), start: exprStart, end: i });
        j = i; // at the closing }
        if (source[j] !== "}") throw new Error(`line ${startLine}: a template's \${ never closes`);
        j++;
        text += "{}";
        continue;
      }
      text += source[j++];
    }
    if (j >= n) throw new Error(`line ${startLine}: a template never closes`);
    advance(j + 1);
    out.push({ text, line: startLine, template: true, start, end: j + 1, exprs });
    last = "lit";
  }
  function readRegex() {
    let j = i + 1;
    let inClass = false;
    while (j < n) {
      const c = source[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "\n") throw new Error(`line ${line}: a regular expression runs past its line`);
      if (inClass) {
        if (c === "]") inClass = false;
      } else if (c === "[") inClass = true;
      else if (c === "/") break;
      j++;
    }
    j++;
    while (j < n && /[a-z]/i.test(source[j])) j++;
    advance(j);
    last = "lit";
  }
  // Reads code until the end, or (inside a template's ${…}) until the brace that closes it, left at i.
  function readCode(inTemplate) {
    let depth = 0;
    while (i < n) {
      const c = source[i];
      const d = source[i + 1];
      if (c === "/" && d === "/") {
        let j = source.indexOf("\n", i);
        if (j < 0) j = n;
        advance(j);
        continue;
      }
      if (c === "/" && d === "*") {
        const j = source.indexOf("*/", i + 2);
        if (j < 0) throw new Error(`line ${line}: a comment never closes`);
        advance(j + 2);
        continue;
      }
      if (c === '"' || c === "'") {
        readQuoted(c);
        continue;
      }
      if (c === "`") {
        readTemplate();
        continue;
      }
      if (c === "/") {
        if (last === "" || REGEX_AFTER.has(last) || REGEX_AFTER_WORDS.has(last)) {
          readRegex();
          continue;
        }
        advance(i + 1);
        last = "/";
        continue;
      }
      if (/\s/.test(c)) {
        advance(i + 1);
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        let j = i + 1;
        while (j < n && /[\w$]/.test(source[j])) j++;
        last = source.slice(i, j);
        advance(j);
        continue;
      }
      if (/[0-9]/.test(c)) {
        let j = i + 1;
        while (j < n && /[\w.]/.test(source[j])) j++;
        last = "num";
        advance(j);
        continue;
      }
      if (inTemplate) {
        if (c === "{") depth++;
        else if (c === "}") {
          if (depth === 0) return;
          depth--;
        }
      }
      last = c === ")" || c === "]" ? "close" : c;
      advance(i + 1);
    }
  }
  readCode(false);
  return out;
}

// Key names, event types and other words code compares against, never shown.
const NOT_WORDS = new Set([
  "Escape", "Enter", "Tab", "Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Shift", "Control", "Alt", "Meta",
  "Space", "Spacebar", "Unidentified", "Process", "Dead",
]);
const CSS_WORDS = new Set(["center", "left", "right", "top", "bottom", "auto", "none", "solid", "dashed", "dotted", "inherit", "initial", "transparent", "normal", "bold"]);
const CODE_LIKE =/[(){}<>=;#\\]|--|=>|\bpx\b|\bvar\(|^\s*\.|https?:|\.(js|css|json|svg|png|mp3|m4a|html)\b|^\/|\[data-|^[\w-]+:\S/;

/**
 * Whether a literal reads like words a person sees: a capitalized word ("Retry", "Hint used"), or two or more words of
 * letters with a space ("in the wrong place"), or a template's text around its {} with a word in it ("{} order").
 * Never: ids, keys, class and part names, selectors, CSS, paths, URLs, key names, a catalog key ("core.badge.right").
 */
export function uiLike({ text, template }) {
  const bare = text.replace(/\{\}/g, "").trim();
  if (!/\p{L}{2,}/u.test(bare)) return false;
  if (NOT_WORDS.has(bare)) return false;
  const withoutHoles = template ? text.replace(/\{\}/g, "") : text;
  if (CODE_LIKE.test(withoutHoles)) return false;
  if (/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/.test(text)) return false; // a catalog key, a dotted id
  if (bare.split(/\s+/).every((token) => /^[a-z0-9]+(-[a-z0-9]+)+$/.test(token))) return false; // a class list: lx-small lx-muted
  if (template && bare.split(/\s+/).every((token) => CSS_WORDS.has(token))) return false; // {} center
  if (/^[\p{Lu}][\p{Ll}]/u.test(bare)) return true; // Retry, Hint used, What do you want to learn?
  if (/\p{L}{2,}[  ]+\p{L}{2,}/u.test(bare)) return true; // in the wrong place
  if (template && /\{\}/.test(text) && /\p{Ll}{3,}/u.test(bare) && /\s/.test(text)) return true; // {} order
  return false;
}

/**
 * Whether a literal could be words on a screen at all: letters, and not a class list, CSS, a path, a key or a dotted id.
 * Looser than uiLike (a single lowercase word, "off", passes), so it's for matching what a screen shows against what the
 * code holds (i18n-walk.mjs --pseudo), never for refusing code.
 */
export function wordLike({ text, template }) {
  const bare = text.replace(/\{\}/g, "").trim();
  if (!/\p{L}{2,}/u.test(bare) || NOT_WORDS.has(bare)) return false;
  if (CODE_LIKE.test(template ? text.replace(/\{\}/g, "") : text)) return false;
  if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9-]+)+$/.test(text)) return false;
  if (bare.split(/\s+/).every((token) => /^[a-z0-9]+(-[a-z0-9]+)+$/.test(token))) return false;
  return true;
}

/** The literals in source that read like words a person sees, with their lines. */
export const uiLiterals = (source) => literalsOf(source).filter(uiLike);
